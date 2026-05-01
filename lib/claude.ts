import Anthropic from '@anthropic-ai/sdk';
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
    deadline, term, or clause that a lawyer would flag in a redline.

Critical rules:
- If one contract has "(text absent here)" and the other has ANY real words, that is
  ALWAYS a type (b) LEGAL CHANGE — a clause was added or removed. Never classify
  added or removed clauses as artifacts, regardless of what the text says.
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
