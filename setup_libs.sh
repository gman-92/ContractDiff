
# ── lib and api files (python-written to avoid heredoc issues) ────────────────
python3 << 'PYEOF'
import os
os.makedirs(os.path.dirname('lib/supabase.ts'), exist_ok=True)
open('lib/supabase.ts', 'w').write('''import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
''')
os.makedirs(os.path.dirname('lib/supabase.server.ts'), exist_ok=True)
open('lib/supabase.server.ts', 'w').write('''import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const cookieStore = await cookies();
  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Route handlers can't always set cookies — ignore
          }
        },
      },
    }
  );
}

export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
''')
os.makedirs(os.path.dirname('lib/stripe.ts'), exist_ok=True)
open('lib/stripe.ts', 'w').write('''import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      apiVersion: '2026-03-25.dahlia' as any,
    });
  }
  return _stripe;
}
''')
os.makedirs(os.path.dirname('lib/parsers.ts'), exist_ok=True)
open('lib/parsers.ts', 'w').write('''function normalizeText(raw: string): string {
  return raw
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

    // PDF ligatures — single Unicode glyphs that DOCX stores as two letters
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/ﬅ/g, 'st').replace(/ﬆ/g, 'st')

    // Normalize Unicode typography to plain ASCII
    .replace(/[‘’‚‛]/g, "'")   // curly single quotes
    .replace(/[“”„‟]/g, '"')    // curly double quotes
    .replace(/[–—―]/g, '-')           // en/em/horizontal dashes
    .replace(/…/g, '...')                       // ellipsis
    .replace(/­/g, '')    // soft hyphen (PDF line-break hint, invisible)
    // All Unicode non-breaking / special spaces → plain space
    .replace(/[   -   　]/g, ' ')
    // Zero-width chars
    .replace(/[​‌‍﻿]/g, '')

    // Rejoin words hyphenated across a line break (PDF artifact)
    .replace(/-\n(\S)/g, '$1')

    // Strip standalone page-number lines
    .replace(/^\s*\d+\s*$/gm, '')
    // Strip "Page X of Y" / "Page X" header/footer lines
    .replace(/^\s*page\s+\d+(\s+of\s+\d+)?\s*$/gim, '')
    // Strip lines that are purely dashes or underscores (decorative rules)
    .replace(/^\s*[-_]{3,}\s*$/gm, '')

    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    // Collapse multiple spaces/tabs per line to one space
    .replace(/[ \t]{2,}/g, ' ')

    // Normalize section numbering: "1)" → "1."
    .replace(/\b(\d+)\s*\)/g, '$1.')

    // Trim each line
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist');

  const uint8Array = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
  const doc = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    let lastY: number | null = null;
    let lastX: number | null = null;
    let lastWidth: number | null = null;
    const lines: string[] = [];
    let currentLine = '';

    for (const item of content.items) {
      if ('str' in item) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const t = (item as any).transform as number[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemWidth = (item as any).width as number;
        const x = t[4];
        const y = t[5];

        if (lastY !== null && Math.abs(y - lastY) > 10) {
          // Y moved enough to be a new line
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
          lastX = null;
          lastWidth = null;
        }

        // Decide whether to insert a space before this item on the same line.
        // If the item starts close to where the last item ended, no space needed;
        // a gap larger than 1 unit means there is visual whitespace between them.
        if (currentLine !== '' && lastX !== null && lastWidth !== null) {
          const expectedX = lastX + lastWidth;
          const gap = x - expectedX;
          if (gap > 1) currentLine += ' ';
        }

        currentLine += item.str;
        lastY = y;
        lastX = x;
        lastWidth = itemWidth;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    // Join lines that end mid-sentence (no sentence-ending punctuation) with a
    // space rather than a newline, fixing paragraph fragmentation from PDF reflow.
    const joined = lines.reduce<string>((acc, line, idx) => {
      if (idx === 0) return line;
      const prev = acc.trimEnd();
      const endsIncomplete = !/[.,:;!?]$/.test(prev);
      return endsIncomplete ? `${prev} ${line}` : `${prev}\n${line}`;
    }, '');

    pageTexts.push(joined);
  }

  return normalizeText(pageTexts.join('\n'));
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import('mammoth')) as any;
  const result = await mammoth.extractRawText({ buffer });
  return normalizeText(result.value as string);
}

export function splitIntoSections(text: string, chunkSize = 20000): string[] {
  if (text.length <= chunkSize) return [text];
  const sections: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + chunkSize;
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n\n', end);
      if (boundary > start) end = boundary;
    }
    sections.push(text.slice(start, end).trim());
    start = end;
  }
  return sections;
}
''')
os.makedirs(os.path.dirname('lib/claude.ts'), exist_ok=True)
open('lib/claude.ts', 'w').write('''import Anthropic from '@anthropic-ai/sdk';
import { diffWords } from 'diff';
import { splitIntoSections } from './parsers';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChangeRegion {
  id: number;
  contextBefore: string;
  textInA: string;
  textInB: string;
  contextAfter: string;
}

const IDENTICAL_RESULT = {
  summary:
    'These contracts are substantively identical. No legal differences were found between the two documents.',
  material_differences: [],
  risk_score: { contract_a: 50, contract_b: 50 },
  negotiation_brief: '',
  favorable_contract: 'Neither',
  favorable_reason: 'The contracts contain the same terms.',
};

// ── Diff helpers ──────────────────────────────────────────────────────────────

/**
 * Groups consecutive changed words into labelled regions with surrounding
 * context. Only regions that contain actual word characters are returned —
 * pure punctuation / whitespace noise is silently dropped.
 */
function extractChangeRegions(textA: string, textB: string): ChangeRegion[] {
  const changes = diffWords(textA, textB);
  const regions: ChangeRegion[] = [];
  let regionId = 1;
  let i = 0;

  while (i < changes.length) {
    if (!changes[i].added && !changes[i].removed) {
      i++;
      continue;
    }

    // Nearest preceding unchanged chunk → context before
    let contextBefore = '';
    for (let j = i - 1; j >= 0; j--) {
      if (!changes[j].added && !changes[j].removed) {
        contextBefore = changes[j].value.slice(-300).trim();
        break;
      }
    }

    // Collect ALL consecutive changed parts into one region
    let textInA = '';
    let textInB = '';
    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      if (changes[i].removed) textInA += changes[i].value;
      if (changes[i].added)   textInB += changes[i].value;
      i++;
    }

    // Nearest following unchanged chunk → context after
    let contextAfter = '';
    if (i < changes.length && !changes[i].added && !changes[i].removed) {
      contextAfter = changes[i].value.slice(0, 300).trim();
    }

    // Drop pure punctuation / whitespace noise (no word chars on either side)
    if (!/\w/.test(textInA) && !/\w/.test(textInB)) continue;

    regions.push({
      id: regionId++,
      contextBefore,
      textInA: textInA.trim(),
      textInB: textInB.trim(),
      contextAfter,
    });
  }

  return regions;
}

function formatRegionsForClaude(regions: ChangeRegion[]): string {
  return regions
    .map((r) => {
      const lines: string[] = [`--- CHANGE #${r.id} ---`];
      if (r.contextBefore) lines.push(`Context before: "...${r.contextBefore}"`);
      lines.push(r.textInA ? `Contract A has: "${r.textInA}"` : 'Contract A: (text absent here)');
      lines.push(r.textInB ? `Contract B has: "${r.textInB}"` : 'Contract B: (text absent here)');
      if (r.contextAfter) lines.push(`Context after: "${r.contextAfter}..."`);
      return lines.join('\n');
    })
    .join('\n\n');
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const DIFF_SYSTEM_PROMPT = `You are a senior contract attorney.

Below is the COMPLETE list of every textual difference between Contract A and Contract B.
The contracts are identical everywhere else — these are the ONLY differences.

For each numbered change, decide:
(a) ARTIFACT — a formatting or file-conversion artifact with zero legal significance:
    whitespace, punctuation style, hyphenation, capitalisation of common nouns,
    section-number style ("1." vs "1)"), ligatures (fi/fl), soft hyphens, line-wrap differences.
(b) LEGAL CHANGE — a different obligation, right, monetary amount, date, party name,
    deadline, or term that a lawyer would flag in a redline.

Your rules:
- Add a change to material_differences ONLY if it is type (b).
- If EVERY change is type (a), return an empty material_differences array and state
  in the summary that the contracts are substantively identical.
- You MUST NOT report any difference that is not in the numbered list given to you.
- Equal risk scores (both 50) and empty negotiation_brief when contracts are identical.

Return a JSON object — NO markdown fences — in this exact shape:
{
  "summary": "...",
  "material_differences": [
    {
      "clause": "clause name",
      "contract_a": "exact text from A",
      "contract_b": "exact text from B",
      "risk_level": "high|medium|low",
      "explanation": "why this matters legally"
    }
  ],
  "risk_score": { "contract_a": 0-100, "contract_b": 0-100 },
  "negotiation_brief": "3-5 bullet points, or empty string",
  "favorable_contract": "A, B, or Neither",
  "favorable_reason": "one sentence"
}`;

const FULL_TEXT_SYSTEM_PROMPT = `You are a senior contract attorney.

Find SUBSTANTIVE differences between Contract A and Contract B — ones that change
legal meaning, obligations, rights, timelines, amounts, or risk.

Ignore: formatting, spacing, punctuation style, capitalisation, "shall" vs "will",
or any rewording that preserves the same legal meaning.
If contracts are substantively identical, return empty material_differences and say so.

Return JSON — NO markdown fences:
{
  "summary": "2-3 sentence executive summary.",
  "material_differences": [
    {
      "clause": "clause name",
      "contract_a": "exact text from A",
      "contract_b": "exact text from B",
      "risk_level": "high|medium|low",
      "explanation": "why this matters legally"
    }
  ],
  "risk_score": { "contract_a": 0-100, "contract_b": 0-100 },
  "negotiation_brief": "3-5 bullet points, or empty string if identical",
  "favorable_contract": "A, B, or Neither",
  "favorable_reason": "one sentence"
}`;

// ── Claude caller ─────────────────────────────────────────────────────────────

async function callClaude(system: string, userContent: string): Promise<object> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: userContent }],
  });
  const block = response.content[0];
  const raw = block.type === 'text' ? block.text : '';
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { summary: raw, material_differences: [] };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function compareContracts(textA: string, textB: string): Promise<object> {
  const regions = extractChangeRegions(textA, textB);

  // Zero meaningful word changes → identical, no Claude call needed
  if (regions.length === 0) {
    return IDENTICAL_RESULT;
  }

  // Measure how much of the total text actually changed
  const totalChangedChars = regions.reduce(
    (sum, r) => sum + r.textInA.length + r.textInB.length,
    0
  );
  const changeRatio = totalChangedChars / (textA.length + textB.length);

  // More than 25% of text changed → genuinely different contracts.
  // Fall back to full-text analysis (chunked if large).
  if (changeRatio > 0.25) {
    const totalLength = textA.length + textB.length;
    if (totalLength <= 80000) {
      return callClaude(
        FULL_TEXT_SYSTEM_PROMPT,
        `CONTRACT A:\n${textA}\n\n---\n\nCONTRACT B:\n${textB}`
      );
    }
    // Very large genuinely-different contracts: chunk and merge
    const sectionsA = splitIntoSections(textA);
    const sectionsB = splitIntoSections(textB);
    const maxSec = Math.max(sectionsA.length, sectionsB.length);
    const results = await Promise.all(
      Array.from({ length: maxSec }, (_, i) =>
        callClaude(
          FULL_TEXT_SYSTEM_PROMPT,
          `CONTRACT A:\n${sectionsA[i] ?? ''}\n\n---\n\nCONTRACT B:\n${sectionsB[i] ?? ''}`
        )
      )
    );
    const merged = results[0] as Record<string, unknown>;
    for (let i = 1; i < results.length; i++) {
      const c = results[i] as Record<string, unknown>;
      if (Array.isArray(c.material_differences)) {
        merged.material_differences = [
          ...((merged.material_differences as unknown[]) ?? []),
          ...c.material_differences,
        ];
      }
    }
    return merged;
  }

  // Less than 25% changed → diff-focused analysis.
  // Claude sees ONLY the changed segments and cannot hallucinate anything else.
  const diffList = formatRegionsForClaude(regions);
  return callClaude(
    DIFF_SYSTEM_PROMPT,
    `${regions.length} change region(s) found. ` +
    `Approximately ${Math.round(changeRatio * 100)}% of the text differs.\n\n` +
    diffList
  );
}
''')
os.makedirs(os.path.dirname('app/api/analyze/route.ts'), exist_ok=True)
open('app/api/analyze/route.ts', 'w').write('''import { NextRequest } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase.server';
import { extractTextFromPDF, extractTextFromDOCX } from '@/lib/parsers';
import { compareContracts } from '@/lib/claude';

export const maxDuration = 60;

async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
    return extractTextFromPDF(buffer);
  }
  if (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.name.endsWith('.docx')
  ) {
    return extractTextFromDOCX(buffer);
  }
  throw new Error(`Unsupported file type: ${file.type}`);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
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

    const [cleanA, cleanB] = await Promise.all([
      extractText(fileA),
      extractText(fileB),
    ]);

    console.log('[parsers] Contract A cleaned text (first 500 chars):', cleanA.slice(0, 500));
    console.log('[parsers] Contract B cleaned text (first 500 chars):', cleanB.slice(0, 500));
    console.log('[parsers] Contract A length:', cleanA.length, '| Contract B length:', cleanB.length);

    const aiResult = await compareContracts(cleanA, cleanB);
    // Attach cleaned texts so the compare page can render a direct word diff
    const result = { ...aiResult, _text_a: cleanA, _text_b: cleanB };

    // Upload originals to Supabase Storage
    const timestamp = Date.now();
    const pathA = `${user.id}/${timestamp}-A-${fileA.name}`;
    const pathB = `${user.id}/${timestamp}-B-${fileB.name}`;

    const bufferA = Buffer.from(await fileA.arrayBuffer());
    const bufferB = Buffer.from(await fileB.arrayBuffer());

    const [uploadA, uploadB] = await Promise.all([
      serviceClient.storage.from('contracts').upload(pathA, bufferA, { contentType: fileA.type }),
      serviceClient.storage.from('contracts').upload(pathB, bufferB, { contentType: fileB.type }),
    ]);

    const contractAUrl = uploadA.data?.path ?? pathA;
    const contractBUrl = uploadB.data?.path ?? pathB;

    const { data: comparison } = await serviceClient
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
''')
os.makedirs(os.path.dirname('app/api/webhooks/stripe/route.ts'), exist_ok=True)
open('app/api/webhooks/stripe/route.ts', 'w').write('''import { NextRequest } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase.server';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: 'Missing stripe signature' }, { status: 400 });
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] constructEvent error:', err);
    return Response.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  const serviceClient = createServiceRoleClient();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const plan = session.metadata?.plan;

    if (!userId) return Response.json({ received: true });

    if (plan === 'pro') {
      await serviceClient
        .from('profiles')
        .update({ tier: 'pro' })
        .eq('id', userId);
    } else if (plan === 'credits') {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
      const current = (profile as { credits?: number } | null)?.credits ?? 0;
      await serviceClient
        .from('profiles')
        .update({ credits: current + 10 })
        .eq('id', userId);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const customerId = sub.customer as string;
    await serviceClient
      .from('profiles')
      .update({ tier: 'free' })
      .eq('stripe_customer_id', customerId);
  }

  return Response.json({ received: true });
}
''')
os.makedirs(os.path.dirname('app/api/create-checkout/route.ts'), exist_ok=True)
open('app/api/create-checkout/route.ts', 'w').write('''import { NextRequest } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase.server';

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { plan } = await request.json() as { plan: 'pro' | 'credits' };
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const priceId =
    plan === 'pro'
      ? process.env.STRIPE_PRO_PRICE_ID
      : process.env.STRIPE_CREDITS_PRICE_ID;

  const session = await getStripe().checkout.sessions.create({
    mode: plan === 'pro' ? 'subscription' : 'payment',
    payment_method_types: ['card'],
    line_items: priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: 'usd',
              product_data: { name: plan === 'pro' ? 'ContractDiff Pro' : '10 Comparison Credits' },
              unit_amount: plan === 'pro' ? 7900 : 2500,
              ...(plan === 'pro' ? { recurring: { interval: 'month' } } : {}),
            },
            quantity: 1,
          },
        ],
    metadata: { user_id: user.id, plan },
    success_url: `${appUrl}/dashboard?upgraded=true`,
    cancel_url: `${appUrl}/dashboard`,
  });

  return Response.json({ url: session.url });
}
''')
print('lib and api files written')
PYEOF