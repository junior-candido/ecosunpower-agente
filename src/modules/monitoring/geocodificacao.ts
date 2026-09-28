// src/modules/monitoring/geocodificacao.ts
// Endereço → ponto no mapa (lat/lng) das usinas — Mapa das Usinas, 28/09/2026.
//
// Serviço: Nominatim (OpenStreetMap), gratuito, com regras de uso que a gente
// SEGUE aqui (https://operations.osmfoundation.org/policies/nominatim/):
//   - no máximo 1 pedido por segundo (fila ÚNICA no processo: dois lotes ao
//     mesmo tempo continuam saindo com 1 s de intervalo);
//   - User-Agent próprio identificando o painel (NOMINATIM_USER_AGENT);
//   - resultado em cache (memória) — e, gravado na usina, nunca é buscado de novo;
//   - uso leve: só a ação "Localizar usinas sem posição", nunca em massa por cron.
//
// Plano B sem rede: centro das cidades do DF e do entorno numa tabela aqui
// mesmo (fonte 'cidade' = aproximado). Cidade fora da tabela → pergunta ao
// Nominatim só pela cidade (também 'cidade').
//
// Ponto 'manual' (alfinete arrastado) NUNCA é sobrescrito por localização
// automática — regra em podeSobrescrever().

export type GeoFonte = 'endereco' | 'cidade' | 'manual' | 'api';
export const GEO_FONTES: readonly GeoFonte[] = ['endereco', 'cidade', 'manual', 'api'];

export interface Ponto { lat: number; lng: number }

export interface EnderecoUsina {
  rua?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cep?: string | null;
  cidade?: string | null;
  uf?: string | null;
}

export type ResultadoGeo =
  | { ok: true; lat: number; lng: number; fonte: 'endereco' | 'cidade'; consulta: string }
  | { ok: false; motivo: string; limite?: boolean };

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

export function normalizarTexto(s: string | null | undefined): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Número finito, dentro do globo e nunca o "0,0" (ponto de lixo clássico). */
export function pontoValido(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !(lat === 0 && lng === 0);
}

/** Caixa larga do Brasil (com folga). Resultado fora dela é engano do serviço. */
export function pontoNoBrasil(lat: number, lng: number): boolean {
  return pontoValido(lat, lng) && lat >= -34.5 && lat <= 6 && lng >= -74.5 && lng <= -28.5;
}

/** Coordenada vinda da API de uma marca (número ou texto). null = ausente/lixo/fora do Brasil. */
export function pontoDaApi(lat: unknown, lng: unknown): Ponto | null {
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const la = num(lat);
  const ln = num(lng);
  return pontoNoBrasil(la, ln) ? { lat: la, lng: ln } : null;
}

/** Quanto mais alto, mais confiável. Manual é do dono e manda sempre. */
const PESO: Record<GeoFonte, number> = { cidade: 1, endereco: 2, api: 3, manual: 9 };

/**
 * A fonte `nova` pode gravar por cima do ponto que veio de `atual`?
 *  - manual só é trocado por outro manual (o dono corrigiu de novo);
 *  - no resto, só ponto igual ou melhor substitui (endereço não volta pra cidade).
 */
export function podeSobrescrever(atual: GeoFonte | null | undefined, nova: GeoFonte): boolean {
  if (nova === 'manual') return true;
  if (!atual) return true;
  if (atual === 'manual') return false;
  return PESO[nova] >= PESO[atual];
}

export function ehGeoFonte(v: unknown): v is GeoFonte {
  return typeof v === 'string' && (GEO_FONTES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Centro das cidades (DF e entorno) — plano B sem rede
// ---------------------------------------------------------------------------

type Centro = { uf: string; lat: number; lng: number; nomes: string[] };

/** Centros aproximados (praça/centro comercial). Nome em minúsculas, sem acento. */
const CENTROS: Centro[] = [
  // Distrito Federal (regiões administrativas e bairros que o cliente escreve como "cidade")
  { uf: 'DF', lat: -15.7939, lng: -47.8828, nomes: ['brasilia', 'plano piloto', 'distrito federal'] },
  { uf: 'DF', lat: -15.8205, lng: -47.9054, nomes: ['asa sul'] },
  { uf: 'DF', lat: -15.7632, lng: -47.8803, nomes: ['asa norte'] },
  { uf: 'DF', lat: -15.7425, lng: -47.9105, nomes: ['noroeste', 'setor noroeste'] },
  { uf: 'DF', lat: -15.7963, lng: -47.9268, nomes: ['sudoeste', 'sudoeste/octogonal', 'octogonal'] },
  { uf: 'DF', lat: -15.7917, lng: -47.9383, nomes: ['cruzeiro', 'cruzeiro novo', 'cruzeiro velho'] },
  { uf: 'DF', lat: -15.8333, lng: -48.0564, nomes: ['taguatinga', 'taguatinga norte', 'taguatinga sul'] },
  { uf: 'DF', lat: -15.8190, lng: -48.1080, nomes: ['ceilandia', 'ceilandia norte', 'ceilandia sul'] },
  { uf: 'DF', lat: -15.8250, lng: -48.1350, nomes: ['sol nascente', 'por do sol', 'sol nascente/por do sol'] },
  { uf: 'DF', lat: -16.0190, lng: -48.0660, nomes: ['gama', 'setor leste gama', 'gama leste', 'gama oeste'] },
  { uf: 'DF', lat: -15.6530, lng: -47.7910, nomes: ['sobradinho', 'sobradinho i'] },
  { uf: 'DF', lat: -15.6370, lng: -47.8270, nomes: ['sobradinho ii', 'sobradinho 2'] },
  { uf: 'DF', lat: -15.6200, lng: -47.6520, nomes: ['planaltina', 'planaltina df', 'arapoanga', 'vale do amanhecer'] },
  { uf: 'DF', lat: -15.8400, lng: -47.8640, nomes: ['lago sul', 'setor de mansoes dom bosco', 'smdb'] },
  { uf: 'DF', lat: -15.7350, lng: -47.8600, nomes: ['lago norte'] },
  { uf: 'DF', lat: -15.8340, lng: -48.0260, nomes: ['aguas claras'] },
  { uf: 'DF', lat: -15.8580, lng: -48.0050, nomes: ['arniqueira', 'arniqueiras'] },
  { uf: 'DF', lat: -15.8030, lng: -48.0280, nomes: ['vicente pires'] },
  { uf: 'DF', lat: -15.8760, lng: -48.0870, nomes: ['samambaia', 'samambaia norte', 'samambaia sul'] },
  { uf: 'DF', lat: -15.9050, lng: -48.0640, nomes: ['recanto das emas'] },
  { uf: 'DF', lat: -16.0200, lng: -48.0120, nomes: ['santa maria'] },
  { uf: 'DF', lat: -15.9030, lng: -47.7780, nomes: ['sao sebastiao'] },
  { uf: 'DF', lat: -15.8700, lng: -47.8000, nomes: ['jardim botanico'] },
  { uf: 'DF', lat: -15.7760, lng: -47.7800, nomes: ['paranoa'] },
  { uf: 'DF', lat: -15.7480, lng: -47.7700, nomes: ['itapoa'] },
  { uf: 'DF', lat: -15.8230, lng: -47.9770, nomes: ['guara', 'guara i', 'guara ii'] },
  { uf: 'DF', lat: -15.8830, lng: -48.0170, nomes: ['riacho fundo', 'riacho fundo i'] },
  { uf: 'DF', lat: -15.9030, lng: -48.0480, nomes: ['riacho fundo ii', 'riacho fundo 2'] },
  { uf: 'DF', lat: -15.8710, lng: -47.9680, nomes: ['nucleo bandeirante'] },
  { uf: 'DF', lat: -15.8510, lng: -47.9500, nomes: ['candangolandia'] },
  { uf: 'DF', lat: -15.9000, lng: -47.9600, nomes: ['park way'] },
  { uf: 'DF', lat: -15.6800, lng: -48.2000, nomes: ['brazlandia'] },
  { uf: 'DF', lat: -15.7100, lng: -47.8770, nomes: ['varjao'] },
  { uf: 'DF', lat: -15.7830, lng: -47.9950, nomes: ['estrutural', 'scia', 'scia/estrutural', 'cidade estrutural'] },
  { uf: 'DF', lat: -15.6000, lng: -47.8700, nomes: ['fercal'] },
  { uf: 'DF', lat: -15.7880, lng: -47.9500, nomes: ['sia', 'setor de industria e abastecimento'] },
  // Entorno (Goiás) e cidades próximas
  { uf: 'GO', lat: -16.0680, lng: -47.9760, nomes: ['valparaiso', 'valparaiso de goias'] },
  { uf: 'GO', lat: -16.2530, lng: -47.9500, nomes: ['luziania'] },
  { uf: 'GO', lat: -15.5370, lng: -47.3340, nomes: ['formosa'] },
  { uf: 'GO', lat: -16.0760, lng: -47.9250, nomes: ['cidade ocidental'] },
  { uf: 'GO', lat: -16.0590, lng: -48.0420, nomes: ['novo gama'] },
  { uf: 'GO', lat: -15.7620, lng: -48.2810, nomes: ['aguas lindas', 'aguas lindas de goias'] },
  { uf: 'GO', lat: -15.1600, lng: -48.2830, nomes: ['padre bernardo'] },
  { uf: 'GO', lat: -15.8520, lng: -48.9590, nomes: ['pirenopolis'] },
  { uf: 'GO', lat: -15.9410, lng: -48.2570, nomes: ['santo antonio do descoberto'] },
  { uf: 'GO', lat: -15.4530, lng: -47.6140, nomes: ['planaltina', 'planaltina de goias', 'planaltina go'] },
  { uf: 'GO', lat: -16.0830, lng: -48.5070, nomes: ['alexania'] },
  { uf: 'GO', lat: -16.7680, lng: -47.6130, nomes: ['cristalina'] },
  { uf: 'GO', lat: -15.7920, lng: -48.7750, nomes: ['cocalzinho', 'cocalzinho de goias'] },
  { uf: 'GO', lat: -15.3130, lng: -48.6200, nomes: ['mimoso de goias'] },
  { uf: 'GO', lat: -16.3280, lng: -48.9530, nomes: ['anapolis'] },
  { uf: 'GO', lat: -16.6800, lng: -49.2530, nomes: ['goiania'] },
  { uf: 'GO', lat: -14.1330, lng: -47.5100, nomes: ['alto paraiso', 'alto paraiso de goias'] },
  { uf: 'GO', lat: -14.2000, lng: -47.7800, nomes: ['sao joao d alianca', "sao joao d'alianca"] },
  { uf: 'GO', lat: -15.3250, lng: -49.1170, nomes: ['jaragua'] },
  { uf: 'MG', lat: -16.3570, lng: -46.9060, nomes: ['unai'] },
];

const INDICE_CENTROS: Map<string, Centro[]> = (() => {
  const m = new Map<string, Centro[]>();
  for (const c of CENTROS) {
    for (const n of c.nomes) {
      const k = normalizarTexto(n.replace(/'/g, ' '));
      m.set(k, [...(m.get(k) ?? []), c]);
    }
  }
  return m;
})();

/** Centro aproximado de uma cidade/RA conhecida (DF e entorno). null = fora da tabela. */
export function centroDaCidade(cidade: string | null | undefined, uf: string | null | undefined): Ponto | null {
  const k = normalizarTexto(String(cidade ?? '').replace(/'/g, ' ').replace(/\s*[-/,]\s*(df|go|mg)$/i, ''));
  if (!k) return null;
  const achados = INDICE_CENTROS.get(k);
  if (!achados?.length) return null;
  const u = String(uf ?? '').trim().toUpperCase();
  const c = (u ? achados.find((x) => x.uf === u) : undefined) ?? (achados.length === 1 || !u ? achados[0] : undefined);
  return c ? { lat: c.lat, lng: c.lng } : null;
}

/** Hash FNV-1a (32 bits) — só pra espalhar pontos de forma estável. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Ponto APROXIMADO (centro da cidade): desloca 150–550 m numa direção que
 * depende só da usina — várias usinas da mesma cidade não ficam empilhadas
 * no mesmo pixel, e a mesma usina cai sempre no mesmo lugar.
 */
export function deslocarAproximado(p: Ponto, semente: string): Ponto {
  const h = hash32(semente);
  const ang = ((h & 0xffff) / 0xffff) * 2 * Math.PI;
  const dist = 150 + ((h >>> 16) / 0xffff) * 400; // metros
  const dLat = (dist * Math.cos(ang)) / 111_320;
  const dLng = (dist * Math.sin(ang)) / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: Math.round((p.lat + dLat) * 1e6) / 1e6, lng: Math.round((p.lng + dLng) * 1e6) / 1e6 };
}

// ---------------------------------------------------------------------------
// Consultas ao Nominatim
// ---------------------------------------------------------------------------

const NOME_UF: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

export interface ConsultaGeo { tipo: 'endereco' | 'cidade'; params: Record<string, string> }

const limpo = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Tentativas em ordem: endereço completo → bairro → cidade. */
export function consultasDoEndereco(e: EnderecoUsina): ConsultaGeo[] {
  const cidade = limpo(e.cidade);
  const uf = limpo(e.uf).toUpperCase();
  const estado = NOME_UF[uf];
  const base: Record<string, string> = { country: 'Brasil' };
  if (estado) base.state = estado;
  const out: ConsultaGeo[] = [];
  const rua = limpo(e.rua);
  if (rua && cidade) {
    const numero = limpo(e.numero);
    out.push({ tipo: 'endereco', params: { ...base, street: numero && /\d/.test(numero) ? `${numero} ${rua}` : rua, city: cidade } });
  }
  const bairro = limpo(e.bairro);
  if (bairro && cidade && normalizarTexto(bairro) !== normalizarTexto(cidade)) {
    out.push({ tipo: 'cidade', params: { q: [bairro, cidade, estado ?? uf, 'Brasil'].filter(Boolean).join(', ') } });
  }
  if (cidade) out.push({ tipo: 'cidade', params: { ...base, city: cidade } });
  return out;
}

export interface OpcoesGeocodificador {
  fetch?: typeof fetch;
  /** Relógio (ms). Teste injeta um falso. */
  agora?: () => number;
  esperar?: (ms: number) => Promise<void>;
  userAgent?: string;
  /** E-mail de contato (parâmetro `email` do Nominatim) — opcional. */
  email?: string;
  base?: string;
  intervaloMs?: number;
  /** Tempo máximo de um pedido. */
  timeoutMs?: number;
}

export const USER_AGENT_PADRAO = 'EcoSunPower-Painel/1.0 (mapa de usinas solares; geocodificacao leve)';
const MAX_CACHE = 3000;

type Busca = { ponto: Ponto | null } | { falha: string; limite?: boolean };

export class Geocodificador {
  private readonly f: typeof fetch;
  private readonly agora: () => number;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly ua: string;
  private readonly email?: string;
  private readonly base: string;
  private readonly intervalo: number;
  private readonly timeout: number;
  private fila: Promise<unknown> = Promise.resolve();
  private ultimoPedido = -Infinity;
  private readonly cache = new Map<string, Ponto | null>();

  constructor(o: OpcoesGeocodificador = {}) {
    this.f = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.agora = o.agora ?? (() => Date.now());
    this.esperar = o.esperar ?? ((ms) => new Promise((ok) => setTimeout(ok, ms)));
    this.ua = o.userAgent?.trim() || USER_AGENT_PADRAO;
    this.email = o.email?.trim() || undefined;
    this.base = o.base ?? 'https://nominatim.openstreetmap.org/search';
    this.intervalo = o.intervaloMs ?? 1100;
    this.timeout = o.timeoutMs ?? 10_000;
  }

  /** Um pedido ao serviço, na fila única (1 por segundo) e com cache. */
  private buscar(params: Record<string, string>): Promise<Busca> {
    const chave = Object.keys(params).sort().map((k) => `${k}=${normalizarTexto(params[k])}`).join('&');
    if (this.cache.has(chave)) return Promise.resolve({ ponto: this.cache.get(chave) ?? null });
    const tarefa = this.fila.then(async (): Promise<Busca> => {
      if (this.cache.has(chave)) return { ponto: this.cache.get(chave) ?? null };
      const falta = this.ultimoPedido + this.intervalo - this.agora();
      if (falta > 0) await this.esperar(falta);
      this.ultimoPedido = this.agora();
      const u = new URL(this.base);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      u.searchParams.set('format', 'jsonv2');
      u.searchParams.set('limit', '1');
      u.searchParams.set('countrycodes', 'br');
      u.searchParams.set('accept-language', 'pt-BR');
      if (this.email) u.searchParams.set('email', this.email);
      let resp: Response;
      try {
        resp = await this.f(u.toString(), {
          headers: { 'User-Agent': this.ua, Accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeout),
        });
      } catch (err) {
        return { falha: `serviço de endereços não respondeu (${(err as Error).message})` };
      }
      if (resp.status === 429 || resp.status === 403) {
        return { falha: 'o serviço de endereços pediu uma pausa (limite de uso)', limite: true };
      }
      if (!resp.ok) return { falha: `serviço de endereços respondeu ${resp.status}` };
      let corpo: unknown;
      try { corpo = await resp.json(); } catch { return { falha: 'resposta ilegível do serviço de endereços' }; }
      const primeiro = Array.isArray(corpo) ? (corpo[0] as { lat?: unknown; lon?: unknown } | undefined) : undefined;
      const lat = Number(primeiro?.lat);
      const lng = Number(primeiro?.lon);
      const ponto = primeiro && pontoNoBrasil(lat, lng) ? { lat, lng } : null;
      if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(chave, ponto);
      return { ponto };
    });
    this.fila = tarefa.catch(() => undefined);
    return tarefa;
  }

  /**
   * Acha o ponto de uma usina: endereço → bairro → centro da cidade (tabela,
   * sem rede) → cidade pelo serviço. Nunca lança.
   */
  async localizar(e: EnderecoUsina): Promise<ResultadoGeo> {
    const consultas = consultasDoEndereco(e);
    if (!consultas.length) return { ok: false, motivo: 'sem endereço nem cidade no cadastro' };
    let ultimaFalha: { falha: string; limite?: boolean } | null = null;
    const centro = centroDaCidade(e.cidade, e.uf);
    for (const c of consultas) {
      // Cidade conhecida: o centro da tabela basta (poupa o serviço).
      if (c.tipo === 'cidade' && !('q' in c.params) && centro) break;
      const r = await this.buscar(c.params);
      if ('falha' in r) {
        ultimaFalha = r;
        if (r.limite) break;
        continue;
      }
      if (r.ponto) return { ok: true, ...r.ponto, fonte: c.tipo, consulta: Object.values(c.params).join(', ') };
    }
    if (centro) return { ok: true, ...centro, fonte: 'cidade', consulta: `${limpo(e.cidade)} (centro da cidade)` };
    if (ultimaFalha) return { ok: false, motivo: ultimaFalha.falha, limite: ultimaFalha.limite };
    return { ok: false, motivo: 'endereço não encontrado no mapa' };
  }
}

let _padrao: Geocodificador | null = null;
/** O geocodificador do processo (fila única de 1 pedido/s pra todo mundo). */
export function geocodificadorPadrao(): Geocodificador {
  if (!_padrao) {
    _padrao = new Geocodificador({
      userAgent: process.env.NOMINATIM_USER_AGENT,
      email: process.env.NOMINATIM_EMAIL,
    });
  }
  return _padrao;
}
