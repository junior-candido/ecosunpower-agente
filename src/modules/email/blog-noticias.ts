// src/modules/email/blog-noticias.ts
// Busca as ultimas noticias do blog (RSS publico do site) pra secao
// "Novidades do blog" da moldura de e-mail (email-moldura.ts). Best-effort:
// qualquer erro/timeout/XML quebrado devolve [] — um e-mail da jornada NUNCA
// pode falhar so porque o blog esta fora do ar. Sem dependencia nova: parser
// proprio (regex) em vez de lib de RSS.

import type { NoticiaBlog } from './email-moldura.js';
export type { NoticiaBlog };

const TTL_MS = 6 * 60 * 60 * 1000; // 6h — noticia nao muda a cada minuto
const TIMEOUT_MS = 5000;

let cache: { dados: NoticiaBlog[]; buscadoEm: number } | null = null;

/** So pra teste: zera o cache em memoria. */
export function _limparCacheNoticias(): void {
  cache = null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function extrairTag(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return null;
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return decodeEntities(v);
}

function parseRss(xml: string, max: number): NoticiaBlog[] {
  const itens: NoticiaBlog[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while (itens.length < max && (m = itemRegex.exec(xml))) {
    const bloco = m[1];
    const titulo = extrairTag(bloco, 'title');
    const link = extrairTag(bloco, 'link');
    if (titulo && link) itens.push({ titulo, link });
  }
  return itens;
}

export async function buscarNoticiasBlog(rssUrl: string, max = 3): Promise<NoticiaBlog[]> {
  if (cache && Date.now() - cache.buscadoEm < TTL_MS) return cache.dados.slice(0, max);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(rssUrl, { signal: controller.signal });
    if (!res.ok) return [];
    const xml = await res.text();
    const noticias = parseRss(xml, max);
    cache = { dados: noticias, buscadoEm: Date.now() };
    return noticias;
  } catch (err) {
    console.warn('[blog-noticias] busca falhou (best-effort, ignorado):', (err as Error)?.message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
