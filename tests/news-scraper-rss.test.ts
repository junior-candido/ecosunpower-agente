import { describe, it, expect } from 'vitest';
import { NewsScraperService } from '../src/modules/news-scraper.js';

// parseRssFeed e stripHtml são privados; acessamos via cast pra testar a lógica
// pura (sem rede). O client supabase não é tocado por esses métodos.
function makeScraper(): {
  parseRssFeed: (xml: string) => Array<{ title: string; url: string; summary: string; publishedAt: string | null }>;
  stripHtml: (html: string) => string;
} {
  const svc = new NewsScraperService({} as never);
  return svc as unknown as {
    parseRssFeed: (xml: string) => Array<{ title: string; url: string; summary: string; publishedAt: string | null }>;
    stripHtml: (html: string) => string;
  };
}

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Feed de teste</title>
  <item>
    <title>Energia solar bate recorde em 2026</title>
    <link>https://exemplo.com/solar-recorde</link>
    <description>Resumo curto da &amp; notícia.</description>
    <content:encoded><![CDATA[<p>Corpo <b>completo</b> com mais detalhes sobre energia solar.</p>]]></content:encoded>
    <pubDate>Mon, 23 Jun 2026 12:00:00 +0000</pubDate>
  </item>
  <item>
    <title>Notícia sem content encoded</title>
    <link>https://exemplo.com/sem-encoded</link>
    <description>Apenas o &#8211; resumo aqui &#8230;</description>
    <pubDate>Tue, 24 Jun 2026 09:30:00 +0000</pubDate>
  </item>
</channel>
</rss>`;

describe('NewsScraperService.parseRssFeed', () => {
  it('NÃO lança erro com content:encoded (regressão do bug do seletor cheerio)', () => {
    expect(() => makeScraper().parseRssFeed(SAMPLE_RSS)).not.toThrow();
  });

  it('parseia título, link e data dos itens', () => {
    const items = makeScraper().parseRssFeed(SAMPLE_RSS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('Energia solar bate recorde em 2026');
    expect(items[0].url).toBe('https://exemplo.com/solar-recorde');
    expect(items[0].publishedAt).toBe('2026-06-23T12:00:00.000Z');
  });

  it('prefere content:encoded quando existe (corpo mais rico, sem HTML)', () => {
    const items = makeScraper().parseRssFeed(SAMPLE_RSS);
    expect(items[0].summary).toContain('Corpo completo');
    expect(items[0].summary).not.toContain('<');
  });

  it('cai pro description quando não há content:encoded e decodifica entidades', () => {
    const items = makeScraper().parseRssFeed(SAMPLE_RSS);
    expect(items[1].summary).toContain('resumo aqui');
    expect(items[1].summary).toContain('–'); // &#8211;
    expect(items[1].summary).not.toContain('&#'); // entidades decodificadas
  });

  it('ignora item sem título ou sem link', () => {
    const xml = `<rss><channel>
      <item><title>Sem link</title></item>
      <item><link>https://x.com/sem-titulo</link></item>
    </channel></rss>`;
    expect(makeScraper().parseRssFeed(xml)).toHaveLength(0);
  });

  it('devolve lista vazia pra XML sem itens (degrada sem quebrar)', () => {
    expect(makeScraper().parseRssFeed('<rss><channel><title>vazio</title></channel></rss>')).toEqual([]);
  });
});

describe('NewsScraperService.stripHtml', () => {
  it('remove tags e normaliza espaços', () => {
    expect(makeScraper().stripHtml('<p>Olá   <b>mundo</b></p>')).toBe('Olá mundo');
  });

  it('decodifica entidades numéricas e nomeadas comuns', () => {
    expect(makeScraper().stripHtml('aspas &#8220;x&#8221; &amp; &nbsp;fim')).toBe('aspas “x” & fim');
  });
});
