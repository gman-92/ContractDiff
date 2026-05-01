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
  const pdfData = await new Promise<any>((resolve, reject) => {
    const parser = new PDFParser();
    parser.on('pdfParser_dataError', reject);
    parser.on('pdfParser_dataReady', resolve);
    parser.parseBuffer(buffer);
  });

  const pageTexts: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const page of pdfData.Pages as any[]) {
    // Build a flat list of {x, y, text} sorted top-to-bottom, left-to-right
    const items: { x: number; y: number; text: string }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of page.Texts as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (t.R as any[]).map((r) => decodeURIComponent(r.T as string)).join('');
      if (text.trim()) items.push({ x: t.x as number, y: t.y as number, text });
    }
    items.sort((a, b) => (Math.abs(a.y - b.y) > 0.2 ? a.y - b.y : a.x - b.x));

    if (items.length === 0) continue;

    const lines: string[] = [];
    let currentLine = items[0].text;
    let lastY = items[0].y;
    let lastX = items[0].x;
    let lastLen = items[0].text.length;

    for (let i = 1; i < items.length; i++) {
      const item = items[i];
      if (Math.abs(item.y - lastY) > 0.2) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = item.text;
        lastY = item.y;
        lastX = item.x;
        lastLen = item.text.length;
      } else {
        // Same line — insert a space if there is a visible gap between items
        const gap = item.x - (lastX + lastLen * 0.2);
        if (gap > 0.5 && !currentLine.endsWith(' ')) currentLine += ' ';
        currentLine += item.text;
        lastX = item.x;
        lastLen = item.text.length;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    // Join lines that end mid-sentence with a space instead of a newline
    const joined = lines.reduce<string>((acc, line, idx) => {
      if (idx === 0) return line;
      const prev = acc.trimEnd();
      return /[.,:;!?]$/.test(prev) ? `${prev}\n${line}` : `${prev} ${line}`;
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
