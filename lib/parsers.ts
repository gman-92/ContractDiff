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
  const mod = await import('pdf-parse') as any;
  const pdfParse = (mod.default ?? mod) as (buf: Buffer) => Promise<{ text: string }>;
  const { text } = await pdfParse(buffer);
  return normalizeText(text);
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
