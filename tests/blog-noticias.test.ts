import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buscarNoticiasBlog, _limparCacheNoticias } from '../src/modules/email/blog-noticias.js';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<item>
  <title><![CDATA[Como escolher o inversor solar ideal]]></title>
  <link>https://www.ecosunpower.eng.br/blog/inversor-solar-ideal/</link>
</item>
<item>
  <title>Brasil chega a 50 GW em GD solar</title>
  <link>https://www.ecosunpower.eng.br/blog/50-gw-gd-solar/</link>
</item>
</channel></rss>`;

describe('buscarNoticiasBlog', () => {
  beforeEach(() => {
    _limparCacheNoticias();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parseia titulo (incl. CDATA) e link de cada <item>', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => RSS_FIXTURE }));

    const noticias = await buscarNoticiasBlog('https://x.eng.br/rss.xml');

    expect(noticias).toHaveLength(2);
    expect(noticias[0]).toEqual({
      titulo: 'Como escolher o inversor solar ideal',
      link: 'https://www.ecosunpower.eng.br/blog/inversor-solar-ideal/',
    });
    expect(noticias[1]).toEqual({
      titulo: 'Brasil chega a 50 GW em GD solar',
      link: 'https://www.ecosunpower.eng.br/blog/50-gw-gd-solar/',
    });
  });

  it('respeita o limite max', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => RSS_FIXTURE }));

    const noticias = await buscarNoticiasBlog('https://x.eng.br/rss.xml', 1);

    expect(noticias).toHaveLength(1);
  });

  it('devolve [] quando o fetch lanca (rede fora do ar)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const noticias = await buscarNoticiasBlog('https://x.eng.br/rss.xml');

    expect(noticias).toEqual([]);
  });

  it('devolve [] quando a resposta HTTP nao e ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: async () => '' }));

    const noticias = await buscarNoticiasBlog('https://x.eng.br/rss.xml');

    expect(noticias).toEqual([]);
  });

  it('usa cache: a segunda chamada nao refaz o fetch dentro do TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => RSS_FIXTURE });
    vi.stubGlobal('fetch', fetchMock);

    await buscarNoticiasBlog('https://x.eng.br/rss.xml');
    await buscarNoticiasBlog('https://x.eng.br/rss.xml');

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('_limparCacheNoticias forca um novo fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => RSS_FIXTURE });
    vi.stubGlobal('fetch', fetchMock);

    await buscarNoticiasBlog('https://x.eng.br/rss.xml');
    _limparCacheNoticias();
    await buscarNoticiasBlog('https://x.eng.br/rss.xml');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
