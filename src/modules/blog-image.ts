// blog-image.ts — escolhe uma FOTO REAL de energia solar (Pexels) pro hero dos
// posts do blog. Varia o termo de busca por categoria + evita repetir foto
// recente (anti-repetição por id). Degrada sem quebrar: sem chave ou sem
// resultado, devolve null e o post é publicado sem foto (como era antes).

import { Buffer } from 'node:buffer';

export interface BlogHeroPhoto {
  url: string; // URL CDN do Pexels (baixada na hora de publicar)
  alt: string; // texto alternativo em português (acessibilidade/SEO)
  id: number; // id Pexels (anti-repetição)
  credit: string; // fotógrafo (atribuição)
}

const PEXELS_TIMEOUT_MS = 20_000;

// Termos de busca em INGLÊS (o Pexels acha mais fotos) com rótulo em PORTUGUÊS
// pro alt. Pool por categoria pra a foto combinar com o tema do post.
const QUERIES: Record<string, Array<{ en: string; pt: string }>> = {
  tecnico: [
    { en: 'solar panel installation roof', pt: 'Instalação de painéis solares no telhado' },
    { en: 'solar technician working', pt: 'Técnico trabalhando com energia solar' },
    { en: 'solar panels close up detail', pt: 'Painéis solares em detalhe' },
  ],
  tecnologia: [
    { en: 'modern solar panels technology', pt: 'Tecnologia de painéis solares' },
    { en: 'solar battery energy storage', pt: 'Armazenamento de energia com bateria solar' },
    { en: 'photovoltaic cells closeup', pt: 'Células fotovoltaicas em detalhe' },
  ],
  mercado: [
    { en: 'solar energy farm aerial view', pt: 'Usina solar vista de cima' },
    { en: 'large solar power plant field', pt: 'Usina de energia solar' },
    { en: 'solar panels sunset sky', pt: 'Painéis solares ao pôr do sol' },
  ],
  regulacao: [
    { en: 'solar panels city building', pt: 'Painéis solares em prédio na cidade' },
    { en: 'solar energy power grid', pt: 'Energia solar conectada à rede elétrica' },
    { en: 'solar panels rooftop urban', pt: 'Painéis solares em telhado urbano' },
  ],
  casos: [
    { en: 'solar panels residential house', pt: 'Painéis solares em casa residencial' },
    { en: 'solar panels commercial building', pt: 'Painéis solares em prédio comercial' },
    { en: 'solar panels rural farm', pt: 'Painéis solares em propriedade rural' },
  ],
  tutorial: [
    { en: 'electricity energy meter', pt: 'Medidor de energia elétrica' },
    { en: 'solar panel maintenance cleaning', pt: 'Manutenção de painel solar' },
    { en: 'engineer planning solar energy', pt: 'Engenheiro planejando energia solar' },
  ],
};

// Termos gerais, misturados a qualquer categoria pra aumentar a variedade.
const FALLBACK_QUERIES: Array<{ en: string; pt: string }> = [
  { en: 'solar panels', pt: 'Painéis solares fotovoltaicos' },
  { en: 'solar energy panels rooftop', pt: 'Energia solar em telhado' },
  { en: 'solar power renewable energy', pt: 'Energia solar renovável' },
];

interface PexelsPhoto {
  id: number;
  photographer?: string;
  src: { original: string; large2x?: string; large?: string };
}

/**
 * Escolhe uma foto de energia solar no Pexels. Varia o termo (categoria +
 * geral) e a página, e evita ids em excludeIds (anti-repetição). Devolve null
 * se a chave faltar, a API falhar ou não houver resultado.
 */
export async function pickBlogHeroPhoto(opts: {
  apiKey: string;
  category: string;
  excludeIds?: number[];
}): Promise<BlogHeroPhoto | null> {
  if (!opts.apiKey) return null;
  const exclude = new Set(opts.excludeIds ?? []);
  const pool = QUERIES[opts.category] ?? [];
  // Pool da categoria + termos gerais → mais variedade entre posts.
  const candidates = [...pool, ...FALLBACK_QUERIES];
  const choice = candidates[Math.floor(Math.random() * candidates.length)];

  const page = 1 + Math.floor(Math.random() * 3); // página 1..3 pra variar
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    choice.en,
  )}&orientation=landscape&per_page=15&page=${page}`;

  let photos: PexelsPhoto[];
  try {
    photos = await fetchPexels(url, opts.apiKey);
  } catch (err) {
    console.warn('[blog-image] Pexels falhou:', (err as Error).message);
    return null;
  }
  if (!photos.length) return null;

  const fresh = photos.filter((p) => !exclude.has(p.id));
  const pickFrom = fresh.length ? fresh : photos;
  const photo = pickFrom[Math.floor(Math.random() * pickFrom.length)];

  return {
    url: photo.src.large2x || photo.src.large || photo.src.original,
    alt: choice.pt,
    id: photo.id,
    credit: photo.photographer ?? 'Pexels',
  };
}

/** Extrai o id Pexels de uma URL (https://images.pexels.com/photos/<id>/...). */
export function pexelsIdFromUrl(url: string | undefined | null): number | null {
  if (!url) return null;
  const m = url.match(/\/photos\/(\d+)\//);
  return m ? Number(m[1]) : null;
}

/** Baixa os bytes de uma imagem (pra commitar no repo do site). */
export async function downloadImage(url: string): Promise<{ bytes: Buffer; contentType: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), PEXELS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} baixando imagem`);
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const bytes = Buffer.from(await res.arrayBuffer());
    return { bytes, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPexels(url: string, apiKey: string): Promise<PexelsPhoto[]> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), PEXELS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Authorization: apiKey }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Pexels HTTP ${res.status}`);
    const data = (await res.json()) as { photos?: PexelsPhoto[] };
    return data.photos ?? [];
  } finally {
    clearTimeout(timeout);
  }
}
