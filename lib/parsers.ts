function normalizeText(raw: string): string {
  return raw
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

    // PDF ligatures — single Unicode glyphs that DOCX stores as two letters
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/ﬅ/g, 'st').replace(/ﬆ/g, 'st')

    // Normalize Unicode typography to plain ASCII
    .replace(/[''‚‛]/g, "'")
    .replace(/[""„‟]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/­/g, '')
    .replace(/[   -   　]/g, ' ')
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { default: PDFParser } = await import('pdf2json') as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { parser, pdfData } = await new Promise<{ parser: any; pdfData: any }>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = new PDFParser();
    p.on('pdfParser_dataError', reject);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    p.on('pdfParser_dataReady', (data: any) => resolve({ parser: p, pdfData: data }));
    p.parseBuffer(buffer);
  });

  // Try structured position-based extraction first
  if (Array.isArray(pdfData?.Pages) && pdfData.Pages.length > 0) {
    try {
      const pageTexts: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const page of pdfData.Pages as any[]) {
        const items: { x: number; y: number; text: string }[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const t of (page.Texts ?? []) as any[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const text = (t.R as any[]).map((r) => {
            try { return decodeURIComponent(r.T as string); }
            catch { return String(r.T ?? ''); }
          }).join('');
          if (text.trim()) items.push({ x: Number(t.x), y: Number(t.y), text });
        }
        items.sort((a, b) => (Math.abs(a.y - b.y) > 0.2 ? a.y - b.y : a.x - b.x));
        if (items.length === 0) continue;

        // Group items into lines by Y position, then join each line.
        // Do NOT add extra spaces — each item's text already contains its own
        // trailing/leading whitespace from the PDF; injecting more causes
        // "G aryMang" type artifacts when a word is split across two runs.
        const lineMap = new Map<number, string>();
        for (const item of items) {
          // Round Y to 1 decimal to group items on the same visual line
          const yKey = Math.round(item.y * 5) / 5;
          lineMap.set(yKey, (lineMap.get(yKey) ?? '') + item.text);
        }
        const lines = Array.from(lineMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, text]) => text.trim())
          .filter(Boolean);

        const joined = lines.reduce<string>((acc, line, idx) => {
          if (idx === 0) return line;
          const prev = acc.trimEnd();
          return /[.,:;!?]$/.test(prev) ? `${prev}\n${line}` : `${prev} ${line}`;
        }, '');
        pageTexts.push(joined);
      }
      const structured = normalizeText(pageTexts.join('\n'));
      if (structured.length > 30) return structured;
    } catch {
      // fall through to getRawTextContent
    }
  }

  // Fallback: getRawTextContent (simpler but works for most PDFs)
  const raw: string = parser.getRawTextContent();
  return normalizeText(raw.replace(/\f/g, '\n'));
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
