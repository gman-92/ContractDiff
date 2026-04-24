// pdfjs-dist uses DOMMatrix internally; polyfill it for Node.js / Vercel serverless
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a=1; b=0; c=0; d=1; e=0; f=0;
    m11=1; m12=0; m13=0; m14=0;
    m21=0; m22=1; m23=0; m24=0;
    m31=0; m32=0; m33=1; m34=0;
    m41=0; m42=0; m43=0; m44=1;
    is2D=true; isIdentity=true;
    constructor(init?: number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        this.a=this.m11=init[0]; this.b=this.m12=init[1];
        this.c=this.m21=init[2]; this.d=this.m22=init[3];
        this.e=this.m41=init[4]; this.f=this.m42=init[5];
      }
    }
    multiply() { return this; }
    translate() { return this; }
    scale() { return this; }
    rotate() { return this; }
    inverse() { return this; }
    transformPoint(p: {x:number;y:number}) { return p; }
    toFloat32Array() { return new Float32Array([this.a,this.b,this.c,this.d,this.e,this.f]); }
    toFloat64Array() { return new Float64Array([this.a,this.b,this.c,this.d,this.e,this.f]); }
    toString() { return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`; }
  };
}

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
