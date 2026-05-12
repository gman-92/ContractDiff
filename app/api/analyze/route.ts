import { NextRequest, after } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase.server';
import { extractTextFromPDF, extractTextFromDOCX } from '@/lib/parsers';
import { compareContracts, ocrWithClaude } from '@/lib/claude';

export const maxDuration = 300;

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/tiff',
]);

function getImageMime(file: { name: string; type: string }): string | null {
  if (IMAGE_MIME_TYPES.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', tiff: 'image/tiff', tif: 'image/tiff',
  };
  return ext ? (map[ext] ?? null) : null;
}

async function extractText(file: { name: string; type: string }, buffer: Buffer): Promise<string> {
  const imageMime = getImageMime(file);
  if (imageMime) {
    console.log('[analyze] Image file — using Claude OCR:', file.name);
    return ocrWithClaude(buffer, imageMime as Parameters<typeof ocrWithClaude>[1]);
  }

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

    // Read buffers now — the request body won't be accessible after we respond
    const [bufferA, bufferB] = await Promise.all([
      fileA.arrayBuffer().then(Buffer.from),
      fileB.arrayBuffer().then(Buffer.from),
    ]);

    const fileAMeta = { name: fileA.name, type: fileA.type };
    const fileBMeta = { name: fileB.name, type: fileB.type };
    const timestamp = Date.now();
    const pathA = `${user.id}/${timestamp}-A-${fileA.name}`;
    const pathB = `${user.id}/${timestamp}-B-${fileB.name}`;
    const userId = user.id;

    // Create the record immediately so the client can navigate to the result page
    const { data: comparison, error: insertError } = await serviceClient
      .from('comparisons')
      .insert({
        user_id: userId,
        contract_a_url: pathA,
        contract_b_url: pathB,
        contract_a_name: fileA.name,
        contract_b_name: fileB.name,
        status: 'processing',
        result_json: null,
      })
      .select('id')
      .single();

    if (insertError || !comparison?.id) {
      console.error('[analyze] insert error:', insertError);
      return Response.json(
        { error: `Failed to create comparison: ${insertError?.message ?? 'no id returned'}` },
        { status: 500 }
      );
    }

    // Deduct quota immediately so rapid resubmissions can't bypass the limit
    await serviceClient
      .from('profiles')
      .update({ comparisons_used_this_month: (profile?.comparisons_used_this_month ?? 0) + 1 })
      .eq('id', userId);

    const comparisonId = comparison.id;

    // All heavy work (OCR + AI comparison) runs after the HTTP response is sent.
    // Vercel keeps the serverless function alive (up to maxDuration) until this resolves.
    after(async () => {
      try {
        console.log('[analyze:bg] starting — uploads + OCR in parallel');

        // Fire storage uploads immediately; OCR runs concurrently
        const uploadPromise = Promise.all([
          serviceClient.storage.from('contracts').upload(pathA, bufferA, { contentType: fileAMeta.type }),
          serviceClient.storage.from('contracts').upload(pathB, bufferB, { contentType: fileBMeta.type }),
        ]);

        const [cleanA, cleanB] = await Promise.all([
          extractText(fileAMeta, bufferA),
          extractText(fileBMeta, bufferB),
        ]);

        await uploadPromise;

        // Reject documents that are too sparse to be real contracts
        const wordsA = (cleanA.match(/\b[a-zA-Z]{2,}\b/g) ?? []).length;
        const wordsB = (cleanB.match(/\b[a-zA-Z]{2,}\b/g) ?? []).length;
        if (wordsA < 75) {
          throw new Error(`"${fileAMeta.name}" doesn't appear to be a complete document — only ${wordsA} words extracted. Please upload the full contract.`);
        }
        if (wordsB < 75) {
          throw new Error(`"${fileBMeta.name}" doesn't appear to be a complete document — only ${wordsB} words extracted. Please upload the full contract.`);
        }

        console.log('[analyze:bg] comparing contracts');
        const aiResult = await compareContracts(cleanA, cleanB);
        const result = { ...(aiResult as object), _text_a: cleanA, _text_b: cleanB };

        await serviceClient
          .from('comparisons')
          .update({ result_json: result, status: 'done' })
          .eq('id', comparisonId);

        console.log('[analyze:bg] done:', comparisonId);
      } catch (err) {
        console.error('[analyze:bg] error:', err);
        await serviceClient
          .from('comparisons')
          .update({
            status: 'error',
            error_message: err instanceof Error ? err.message : 'Processing failed',
          })
          .eq('id', comparisonId);
      }
    });

    // Return immediately — the client polls /api/comparison/[id] for the result
    return Response.json({ id: comparisonId });
  } catch (err) {
    console.error('[analyze] error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
