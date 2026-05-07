import { NextRequest } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase.server';
import { extractTextFromPDF, extractTextFromDOCX } from '@/lib/parsers';
import { compareContracts, ocrWithClaude } from '@/lib/claude';

export const maxDuration = 120;

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/tiff',
]);

function getImageMime(file: File): string | null {
  if (IMAGE_MIME_TYPES.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', tiff: 'image/tiff', tif: 'image/tiff',
  };
  return ext ? (map[ext] ?? null) : null;
}

async function extractText(file: File, buffer: Buffer): Promise<string> {

  // Image files (scanned contract photos) → Claude vision OCR directly
  const imageMime = getImageMime(file);
  if (imageMime) {
    console.log('[analyze] Image file — using Claude OCR:', file.name);
    return ocrWithClaude(buffer, imageMime as Parameters<typeof ocrWithClaude>[1]);
  }

  // PDF: try text extraction first; fall back to Claude OCR if sparse.
  // We count real words (3+ letter sequences) rather than raw chars because
  // scanned PDFs often contain metadata/form-feed chars that inflate char count.
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    const text = await extractTextFromPDF(buffer);
    const wordCount = (text.match(/[a-zA-Z]{3,}/g) ?? []).length;
    console.log('[analyze] PDF extracted', text.length, 'chars,', wordCount, 'words:', file.name);
    if (wordCount < 40) {
      console.log('[analyze] PDF appears scanned, using Claude OCR:', file.name);
      return ocrWithClaude(buffer, 'application/pdf');
    }
    return text;
  }

  // DOCX
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.docx')
  ) {
    return extractTextFromDOCX(buffer);
  }

  throw new Error(`Unsupported file type: ${file.type || file.name}`);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    let user = null;

    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const serviceClient = createServiceRoleClient();
    const { data: profileRaw } = await serviceClient
      .from('profiles')
      .select('tier, comparisons_used_this_month, comparisons_reset_at')
      .eq('id', user.id)
      .single();

    const profile = profileRaw as {
      tier: 'free' | 'pro';
      comparisons_used_this_month: number;
      comparisons_reset_at: string;
    } | null;

    if (profile?.tier === 'free' && (profile?.comparisons_used_this_month ?? 0) >= 3) {
      return Response.json({ error: 'Monthly limit reached. Upgrade to Pro.' }, { status: 403 });
    }

    const formData = await request.formData();
    const fileA = formData.get('contractA') as File | null;
    const fileB = formData.get('contractB') as File | null;

    if (!fileA || !fileB) {
      return Response.json({ error: 'Two contract files are required.' }, { status: 400 });
    }

    // Read file buffers once — File.arrayBuffer() may not be re-readable
    console.log('[analyze] reading file buffers');
    const [bufferA, bufferB] = await Promise.all([
      fileA.arrayBuffer().then(Buffer.from),
      fileB.arrayBuffer().then(Buffer.from),
    ]);
    console.log('[analyze] buffers read — A:', bufferA.length, 'B:', bufferB.length);

    console.log('[analyze] extracting text from A:', fileA.name);
    const cleanA = await extractText(fileA, bufferA);
    console.log('[analyze] extracting text from B:', fileB.name);
    const cleanB = await extractText(fileB, bufferB);

    console.log('[parsers] Contract A cleaned text (first 500 chars):', cleanA.slice(0, 500));
    console.log('[parsers] Contract B cleaned text (first 500 chars):', cleanB.slice(0, 500));
    console.log('[parsers] Contract A length:', cleanA.length, '| Contract B length:', cleanB.length);

    console.log('[analyze] calling compareContracts');
    const aiResult = await compareContracts(cleanA, cleanB);
    console.log('[analyze] compareContracts done');
    // Attach cleaned texts so the compare page can render a direct word diff
    const result = { ...aiResult, _text_a: cleanA, _text_b: cleanB };

    // Upload originals to Supabase Storage
    const timestamp = Date.now();
    const pathA = `${user.id}/${timestamp}-A-${fileA.name}`;
    const pathB = `${user.id}/${timestamp}-B-${fileB.name}`;

    console.log('[analyze] uploading to storage');
    const [uploadA, uploadB] = await Promise.all([
      serviceClient.storage.from('contracts').upload(pathA, bufferA, { contentType: fileA.type }),
      serviceClient.storage.from('contracts').upload(pathB, bufferB, { contentType: fileB.type }),
    ]);
    console.log('[analyze] storage upload done');

    const contractAUrl = uploadA.data?.path ?? pathA;
    const contractBUrl = uploadB.data?.path ?? pathB;

    const { data: comparison, error: insertError } = await serviceClient
      .from('comparisons')
      .insert({
        user_id: user.id,
        contract_a_url: contractAUrl,
        contract_b_url: contractBUrl,
        contract_a_name: fileA.name,
        contract_b_name: fileB.name,
        result_json: result,
      })
      .select('id')
      .single();

    if (insertError || !comparison?.id) {
      console.error('[analyze] comparison insert error:', insertError);
      return Response.json(
        { error: `Failed to save comparison: ${insertError?.message ?? 'no id returned'}` },
        { status: 500 }
      );
    }

    await serviceClient
      .from('profiles')
      .update({ comparisons_used_this_month: (profile?.comparisons_used_this_month ?? 0) + 1 })
      .eq('id', user.id);

    return Response.json({ id: comparison?.id, result });
  } catch (err) {
    console.error('[analyze] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
