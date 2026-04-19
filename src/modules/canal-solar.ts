import { writeFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const SITEMAP_INDEX = 'https://canalsolar.com.br/sitemap_index.xml';
const USER_AGENT = 'EcosunpowerBot/1.0 (+https://ecosunpower.com.br)';
const MAX_ARTICLES = 30;
const CANDIDATES_POOL = 80;
const FETCH_TIMEOUT_MS = 15000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const RELEVANCE_KEYWORDS = [
  'solar', 'fotovoltaic', 'painel', 'modulo', 'módulo', 'inversor',
  'bateria', 'armazenamento', 'bess', 'geracao distribuida', 'geração distribuída',
  'gd', 'microgeracao', 'microgeração', 'minigeracao', 'minigeração',
  'autoconsumo', 'autoconsumidor', 'tarifa', 'tarifac', 'fio b',
  'aneel', 'resolucao', 'resolução', 'lei 14.300', 'mmgd',
  'conta de luz', 'economia', 'financiamento', 'consumidor',
  'distribuidora', 'concessionaria', 'concessionária',
  'renovavel', 'renovável', 'irradiacao', 'irradiação', 'eficiencia',
  'eficiência', 'mercado livre', 'net metering', 'compensacao',
  'compensação', 'credito', 'crédito',
];

function isRelevant(title: string | undefined, description: string | undefined): boolean {
  const haystack = `${title ?? ''} ${description ?? ''}`.toLowerCase();
  if (!haystack.trim()) return false;
  return RELEVANCE_KEYWORDS.some((kw) => haystack.includes(kw));
}

interface Article {
  url: string;
  lastmod: string;
  title?: string;
  description?: string;
  publishedAt?: string;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractSitemapsFromIndex(xml: string): Array<{ loc: string; lastmod: string }> {
  const sitemaps: Array<{ loc: string; lastmod: string }> = [];
  const blocks = xml.match(/<sitemap>[\s\S]*?<\/sitemap>/g) ?? [];
  for (const block of blocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
    if (loc && loc.includes('post-sitemap')) {
      sitemaps.push({ loc, lastmod });
    }
  }
  return sitemaps.sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1));
}

function extractUrlsFromSitemap(xml: string): Array<{ loc: string; lastmod: string }> {
  const urls: Array<{ loc: string; lastmod: string }> = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  for (const block of blocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)?.[1];
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? '';
    if (loc) urls.push({ loc, lastmod });
  }
  return urls.sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1));
}

function extractMeta(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const reRev = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i',
  );
  return html.match(re)?.[1] ?? html.match(reRev)?.[1];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

async function fetchArticleMeta(url: string): Promise<Pick<Article, 'title' | 'description' | 'publishedAt'>> {
  const html = await fetchWithTimeout(url);
  const title = extractMeta(html, 'og:title') ?? html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description');
  const publishedAt = extractMeta(html, 'article:published_time');
  return {
    title: title ? decodeEntities(title).trim() : undefined,
    description: description ? decodeEntities(description).trim() : undefined,
    publishedAt,
  };
}

function buildMarkdown(articles: Article[], ingestedAt: Date): string {
  const lines: string[] = [];
  lines.push('# Canal Solar - Artigos recentes');
  lines.push('');
  lines.push(
    `Conteudo coletado automaticamente do Canal Solar (https://canalsolar.com.br) em ${ingestedAt.toISOString()}.`,
  );
  lines.push(
    'A Eva pode usar estas referencias quando o cliente perguntar sobre novidades do setor, regulamentacao, tecnologia ou mercado solar. Sempre citar a fonte (Canal Solar) e informar que o link pode ser compartilhado se o cliente quiser se aprofundar.',
  );
  lines.push('');
  lines.push(`Total de artigos: ${articles.length}`);
  lines.push('');

  for (const a of articles) {
    const date = a.publishedAt ? a.publishedAt.slice(0, 10) : a.lastmod.slice(0, 10);
    lines.push(`## ${a.title ?? a.url}`);
    lines.push('');
    if (date) lines.push(`- Data: ${date}`);
    lines.push(`- Link: ${a.url}`);
    if (a.description) {
      lines.push('');
      lines.push(a.description);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export interface IngestResult {
  articlesFetched: number;
  outputPath: string;
  skipped: boolean;
  reason?: string;
}

export async function ingestCanalSolar(knowledgeDir: string, force = false): Promise<IngestResult> {
  const outputPath = join(knowledgeDir, 'canal-solar.md');

  if (!force && existsSync(outputPath)) {
    const ageMs = Date.now() - statSync(outputPath).mtimeMs;
    if (ageMs < THREE_DAYS_MS) {
      return {
        articlesFetched: 0,
        outputPath,
        skipped: true,
        reason: `File is ${Math.round(ageMs / 3600000)}h old, below 72h threshold`,
      };
    }
  }

  const indexXml = await fetchWithTimeout(SITEMAP_INDEX);
  const sitemaps = extractSitemapsFromIndex(indexXml);
  if (sitemaps.length === 0) throw new Error('No post sitemaps found in index');

  const urls: Array<{ loc: string; lastmod: string }> = [];
  for (const sm of sitemaps) {
    if (urls.length >= CANDIDATES_POOL) break;
    const xml = await fetchWithTimeout(sm.loc);
    urls.push(...extractUrlsFromSitemap(xml));
  }
  const topUrls = urls
    .sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1))
    .slice(0, CANDIDATES_POOL);

  const articles: Article[] = [];
  let skippedIrrelevant = 0;
  for (const u of topUrls) {
    if (articles.length >= MAX_ARTICLES) break;
    try {
      const meta = await fetchArticleMeta(u.loc);
      if (!isRelevant(meta.title, meta.description)) {
        skippedIrrelevant++;
        continue;
      }
      articles.push({ url: u.loc, lastmod: u.lastmod, ...meta });
    } catch (err) {
      console.warn(`[canal-solar] Failed to fetch ${u.loc}:`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (skippedIrrelevant > 0) {
    console.log(`[canal-solar] Filtered out ${skippedIrrelevant} off-topic articles`);
  }

  const markdown = buildMarkdown(articles, new Date());
  writeFileSync(outputPath, markdown, 'utf-8');

  return { articlesFetched: articles.length, outputPath, skipped: false };
}
