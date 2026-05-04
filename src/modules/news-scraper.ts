// News scraper — coleta notícias de fontes externas (ANEEL etc) e salva em
// public.external_articles. Roda diariamente via cron no index.ts.
// Estratégia: HTML estático com cheerio (leve, sem browser). Filtro por
// keywords de solar/energia distribuída pra ignorar notícias off-topic.
// Dedup natural via UNIQUE constraint em external_url.

import * as cheerio from 'cheerio';
import type { SupabaseClient } from '@supabase/supabase-js';

const ANEEL_LISTING_URL = 'https://www.gov.br/aneel/pt-br/assuntos/noticias';
const USER_AGENT = 'Mozilla/5.0 (compatible; EcoSunPowerBlogBot/1.0)';
const FETCH_TIMEOUT_MS = 20_000;

// Keywords pra filtrar notícias relevantes ao mercado solar/EcoSunPower.
// Match case-insensitive em title+summary. Ampla de propósito: vale incluir
// notícia tarifária mesmo que não cite "solar" diretamente, porque cliente
// solar se beneficia de mudança em tarifa/bandeira.
const RELEVANT_KEYWORDS = [
  'solar', 'fotovolta', 'fotovoltaic',
  'mmgd', 'geração distribuída', 'geracao distribuida', 'micro geração', 'mini geração',
  'microgeração', 'minigeração', 'microgeracao', 'minigeracao',
  'lei 14.300', 'lei 14300',
  'compensação de energia', 'prosumidor',
  'fio b', 'fio-b', 'tusd', 'tust',
  'bandeira tarifária', 'tarifa',
  'autoprodução', 'autoproducao',
  'bateria', 'armazenamento', 'bess',
  'energia limpa', 'renovável', 'renovavel',
];

interface ListingItem {
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
}

export interface ScrapeResult {
  source: string;
  added: number;
  skipped: number;
  irrelevant: number;
  errors: number;
}

export class NewsScraperService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Raspa página de notícias da ANEEL (listagem padrão, primeiras 30).
   * Salva apenas as relevantes ao tema solar/energia distribuída.
   * Idempotente: rodar 2x no mesmo dia não duplica nada (UNIQUE em external_url).
   */
  async scrapeAneel(): Promise<ScrapeResult> {
    const result: ScrapeResult = { source: 'aneel', added: 0, skipped: 0, irrelevant: 0, errors: 0 };

    let html: string;
    try {
      html = await this.fetchHtml(ANEEL_LISTING_URL);
    } catch (err) {
      console.error('[news-scraper] ANEEL listing fetch failed:', (err as Error).message);
      result.errors++;
      return result;
    }

    const items = this.parseAneelListing(html);
    console.log(`[news-scraper] ANEEL listing: ${items.length} itens encontrados`);

    for (const item of items) {
      try {
        const isRelevant = this.isRelevant(item.title, item.summary);
        if (!isRelevant) {
          // Ainda salvamos com is_relevant=false pra audit/dedup, mas só uma vez
          const existed = await this.urlExists(item.url);
          if (!existed) {
            await this.saveArticle({ ...item, isRelevant: false }, 'aneel');
          }
          result.irrelevant++;
          continue;
        }

        const existed = await this.urlExists(item.url);
        if (existed) {
          result.skipped++;
          continue;
        }

        // Tenta buscar corpo completo. Se falhar, salva só com summary.
        let content: string | undefined;
        try {
          content = await this.fetchAneelArticleBody(item.url);
        } catch (err) {
          console.warn(`[news-scraper] ANEEL body fetch falhou pra ${item.url}: ${(err as Error).message}`);
        }

        await this.saveArticle({ ...item, content, isRelevant: true }, 'aneel');
        result.added++;
      } catch (err) {
        console.error(`[news-scraper] erro processando ${item.url}:`, (err as Error).message);
        result.errors++;
      }
    }

    console.log(`[news-scraper] ANEEL done: +${result.added} salvos, ${result.skipped} já existiam, ${result.irrelevant} off-topic, ${result.errors} erros`);
    return result;
  }

  /**
   * Lista artigos relevantes recentes pra alimentar o blog generator.
   * Order by published_at DESC. Default: últimos 30 dias.
   */
  async getRecentRelevant(opts?: { days?: number; limit?: number; source?: string }): Promise<ListingItem[]> {
    const days = opts?.days ?? 30;
    const limit = opts?.limit ?? 10;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = this.supabase
      .from('external_articles')
      .select('title, external_url, summary, content, published_at')
      .eq('is_relevant', true)
      .gte('scraped_at', cutoff)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (opts?.source) query = query.eq('source', opts.source);

    const { data, error } = await query;
    if (error) {
      console.error('[news-scraper] getRecentRelevant falhou:', error.message);
      return [];
    }
    return (data ?? []).map((r: { title: string; external_url: string; summary: string | null; content: string | null; published_at: string | null }) => ({
      title: r.title,
      url: r.external_url,
      summary: r.summary ?? '',
      publishedAt: r.published_at,
      // Quando precisar de corpo completo no prompt do blog, passa content
      content: r.content ?? undefined,
    } as ListingItem & { content?: string }));
  }

  // ======================
  // Internals
  // ======================

  private async fetchHtml(url: string): Promise<string> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9' },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
      return await res.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Parser do template ANEEL (gov.br Plone customizado).
   * Cada item é um <h2 class="titulo"> seguido por <span class="descricao">
   * que contém <span class="data">DD/MM/YYYY</span> + texto.
   */
  private parseAneelListing(html: string): ListingItem[] {
    const $ = cheerio.load(html);
    const items: ListingItem[] = [];

    $('h2.titulo').each((_, el) => {
      const $h2 = $(el);
      const $a = $h2.find('a').first();
      const title = $a.text().trim();
      const href = $a.attr('href') ?? '';
      if (!title || !href) return;

      // O <span class="descricao"> é o irmão seguinte (skip whitespace)
      let $next = $h2.next();
      while ($next.length && !$next.hasClass('descricao')) {
        // Pode ter <div class="imagem mobile"> ou whitespace entre eles
        if ($next.is('h2.titulo')) break; // chegou no próximo item, sem descricao
        $next = $next.next();
      }

      let publishedAt: string | null = null;
      let summary = '';
      if ($next.hasClass('descricao')) {
        const dataText = $next.find('span.data').first().text().trim();
        publishedAt = this.parseBrDate(dataText);
        // Remove o <span class="data"> e o " - " separador pra pegar só o texto
        const $clone = $next.clone();
        $clone.find('span.data').remove();
        // Texto restante começa com " - " no template
        summary = $clone.text().replace(/^\s*-\s*/, '').trim();
      }

      items.push({
        title,
        url: href.startsWith('http') ? href : `https://www.gov.br${href}`,
        summary,
        publishedAt,
      });
    });

    return items;
  }

  /**
   * Busca corpo completo de uma página de notícia do gov.br.
   * Template usa #parent-fieldname-text (Plone padrão) pra body.
   */
  private async fetchAneelArticleBody(url: string): Promise<string> {
    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    // Tenta vários selectors comuns do gov.br/Plone em ordem de preferência
    const candidates = ['#parent-fieldname-text', '#content-core', '.entry-text', '.documentDescription'];
    for (const sel of candidates) {
      const text = $(sel).text().trim();
      if (text && text.length > 100) return text.replace(/\s+/g, ' ').slice(0, 8000);
    }
    // Fallback: pega tudo dentro de <article> ou <main>
    const fallback = $('article, main').first().text().replace(/\s+/g, ' ').trim();
    if (fallback.length > 100) return fallback.slice(0, 8000);
    throw new Error('Body não encontrado via selectors conhecidos');
  }

  /** Converte "30/04/2026" em ISO timestamp (meio-dia BRT pra estabilidade). */
  private parseBrDate(s: string): string | null {
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    // Meio-dia UTC-3 = 15h UTC. Evita mudanças de fuso na exibição.
    return `${yyyy}-${mm}-${dd}T15:00:00.000Z`;
  }

  private isRelevant(title: string, summary: string): boolean {
    const haystack = `${title} ${summary}`.toLowerCase();
    return RELEVANT_KEYWORDS.some((kw) => haystack.includes(kw));
  }

  private async urlExists(url: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('external_articles')
      .select('id')
      .eq('external_url', url)
      .maybeSingle();
    if (error) {
      console.warn('[news-scraper] urlExists check error:', error.message);
      return false; // pessimista: tenta inserir e deixa UNIQUE constraint barrar se for duplicado
    }
    return !!data;
  }

  private async saveArticle(
    item: ListingItem & { content?: string; isRelevant: boolean },
    source: string,
  ): Promise<void> {
    const { error } = await this.supabase.from('external_articles').insert({
      source,
      external_url: item.url,
      title: item.title,
      summary: item.summary || null,
      content: item.content ?? null,
      published_at: item.publishedAt,
      is_relevant: item.isRelevant,
    });
    if (error) {
      // Se for violação de UNIQUE (concorrência), apenas log e segue
      if (error.code === '23505') return;
      throw new Error(`Insert falhou pra ${item.url}: ${error.message}`);
    }
  }
}
