export interface Chunk { index: number; content: string; tokenCount: number; }
export interface ChunkOpts { maxTokens: number; overlapTokens: number; }

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}

function splitFixed(text: string, max: number, overlap: number): string[] {
  const maxChars = max * 4;
  const overlapChars = overlap * 4;
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    if (end < text.length) {
      const cu = text.charCodeAt(end);
      if (cu >= 0xDC00 && cu <= 0xDFFF) end--; // não cortar par surrogate (emoji) no meio
    }
    out.push(text.slice(i, end));
    if (end >= text.length) break;
    const next = end - overlapChars;
    i = next > i ? next : end;
  }
  return out;
}

// `overlap` só é aplicado no leaf splitFixed; splits estruturais (##/###/¶)
// são section-aligned de propósito (bridge entre seções fica pro retrieve/T6).
function recursiveSplit(text: string, max: number, overlap: number): string[] {
  if (estimateTokens(text) <= max) return [text];
  for (const re of [/(?=^##\s)/m, /(?=^###\s)/m, /\n\n+/]) {
    const parts = text.split(re).map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const out: string[] = [];
      let buf = '';
      for (const p of parts) {
        const cand = buf ? `${buf}\n\n${p}` : p;
        if (estimateTokens(cand) <= max) { buf = cand; continue; }
        if (buf) { out.push(buf); buf = ''; }
        if (estimateTokens(p) > max) out.push(...recursiveSplit(p, max, overlap));
        else buf = p;
      }
      if (buf) out.push(buf);
      return out;
    }
  }
  return splitFixed(text, max, overlap);
}

export function chunkMarkdown(md: string, opts: ChunkOpts): Chunk[] {
  const text = (md ?? '').trim();
  if (!text) return [];
  const pieces = recursiveSplit(text, opts.maxTokens, opts.overlapTokens)
    .filter(p => p.trim().length > 0);
  return pieces.map((content, index) => ({
    index,
    content,
    tokenCount: estimateTokens(content),
  }));
}
