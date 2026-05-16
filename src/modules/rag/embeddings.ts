import OpenAI from 'openai';

export const EMBED_MODEL = 'text-embedding-3-small';
const BATCH = 96;

export function makeClient(apiKey: string): OpenAI {
  return new OpenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 500 * 2 ** i)); }
  }
  throw last;
}

export async function embedTexts(
  texts: string[],
  client: Pick<OpenAI, 'embeddings'>,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const res = await withRetry(() =>
      client.embeddings.create({ model: EMBED_MODEL, input: batch }));
    out.push(...res.data.map(d => d.embedding as number[]));
  }
  return out;
}
