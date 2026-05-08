// Busca cases do site (build estatico em ecosunpower.eng.br/cases.json) com cache em memoria.
// Usado pela proposta v3 pra exibir cases similares ao tipo do cliente.

export interface Case {
  slug: string;
  titulo: string;
  cliente?: string;
  cidade: string;
  uf: 'DF' | 'GO';
  tipo: 'residencial' | 'comercial' | 'industrial' | 'rural' | 'hibrido' | 'usina';
  kwp?: number;
  economiaMensalBrl?: number;
  descCurta?: string;
  fotoPrincipal: string;
  fotos: string[];
  videoUrl?: string;
  dataInstalacao?: string;
  featured: boolean;
  inversorMarca?: string;
  inversorModelo?: string;
  moduloMarca?: string;
  bateriaKwh?: number;
  concessionaria?: 'Neoenergia-DF' | 'Equatorial-GO';
  tecnologiaDestaque?: string;
}

interface FetcherDeps {
  siteUrl: string;
  fetcher?: typeof fetch;
  ttlMs?: number;
}

const TTL_MS_DEFAULT = 24 * 60 * 60 * 1000; // 24h

export class CasesFetcher {
  private cache: { at: number; data: Case[] } | null = null;
  private readonly siteUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly ttlMs: number;

  constructor(deps: FetcherDeps) {
    this.siteUrl = deps.siteUrl.replace(/\/$/, '');
    this.fetcher = deps.fetcher ?? fetch;
    this.ttlMs = deps.ttlMs ?? TTL_MS_DEFAULT;
  }

  async getAll(): Promise<Case[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < this.ttlMs) {
      return this.cache.data;
    }
    try {
      const res = await this.fetcher(`${this.siteUrl}/cases.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as Case[];
      // Normaliza URLs relativas pra absolutas. O cases.json do site Astro
      // gera paths como "/cases/<slug>/cover.jpg" — quando o HTML da proposta
      // eh renderizado em outro subdominio (propostas.ecosunpower.eng.br), o
      // browser resolveria pra propostas.ecosunpower.eng.br/cases/... que
      // nao existe. Pre-resolve aqui pra manter siteUrl como fonte unica.
      const data = raw.map(c => this.absolutizarUrls(c));
      this.cache = { at: now, data };
      return data;
    } catch (err) {
      if (this.cache) {
        console.warn('[cases-fetcher] usando cache antigo:', err);
        return this.cache.data;
      }
      console.error('[cases-fetcher] erro e sem cache:', err);
      return [];
    }
  }

  // Resolve URL relativa pra absoluta usando siteUrl como base.
  // - "https://x" -> mantem (ja absoluta, ex: imagens no Supabase Storage)
  // - "/cases/..." -> "${siteUrl}/cases/..." (path absoluto sob raiz do site)
  // - undefined/'' -> undefined (nao mexe)
  // - outros (data:, blob:) -> mantem
  private absoluteUrl(url: string | undefined): string | undefined {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('/')) return `${this.siteUrl}${url}`;
    return url;
  }

  private absolutizarUrls(c: Case): Case {
    return {
      ...c,
      fotoPrincipal: this.absoluteUrl(c.fotoPrincipal) ?? c.fotoPrincipal,
      fotos: (c.fotos ?? []).map(f => this.absoluteUrl(f) ?? f),
      videoUrl: this.absoluteUrl(c.videoUrl),
    };
  }

  async getByTipo(tipo: Case['tipo'], limit = 3): Promise<Case[]> {
    const all = await this.getAll();
    const dotipo = all.filter(c => c.tipo === tipo).slice(0, limit);
    if (dotipo.length >= limit) return dotipo;
    const featured = all.filter(c => c.featured && !dotipo.find(d => d.slug === c.slug));
    return [...dotipo, ...featured].slice(0, limit);
  }
}
