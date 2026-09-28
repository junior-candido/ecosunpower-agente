// src/modules/dashboard/command-center-calc.ts
// Cálculo PURO do Command Center (fase B). Sem banco, sem HTML.
//
// REGRA DO JUNIOR: número só se for real. Aqui "sem dado" é sempre `null`
// (a tela mostra "—"), nunca 0. Dia e mês pelo relógio de BRASÍLIA.
//
// Reusa a régua do Monitoramento (classificarSistema / esperadoDiaKwh /
// medianaEspecifica7d): o Command Center nunca diz de uma usina algo diferente
// do que a tela da usina diz.

import { classificarSistema, esperadoDiaKwh, medianaEspecifica7d } from '../monitoring/classificacao.js';
import { hojeBrasilia } from '../gd/demonstrativos-tela.js';

// ---------------------------------------------------------------------------
// Datas (Brasília)
// ---------------------------------------------------------------------------

/** Soma dias a uma data 'AAAA-MM-DD' (sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export interface JanelaBrasilia {
  hoje: string;
  ontem: string;
  inicioMes: string;
  /** 7 dias completos: [ha7, hoje) */
  ha7: string;
  /** 30 dias completos: [ha30, hoje) */
  ha30: string;
}

export function janelaBrasilia(agora: Date): JanelaBrasilia {
  const hoje = hojeBrasilia(agora);
  return {
    hoje,
    ontem: somarDias(hoje, -1),
    inicioMes: `${hoje.slice(0, 7)}-01`,
    ha7: somarDias(hoje, -7),
    ha30: somarDias(hoje, -30),
  };
}

// ---------------------------------------------------------------------------
// Estado de cada usina
// ---------------------------------------------------------------------------

export interface UsinaLinha {
  id: string;
  apelido: string;
  potencia_kwp: number | string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  ultima_sincronizacao: string | null;
  ultimo_erro: string | null;
  status_inversor: string | null;
  /** 'api' (padrão) | 'manual' — manual = sem monitoramento automático. */
  acompanhamento: string | null;
}

export interface GeracaoLinha { sistema_id: string; data: string; geracao_kwh: number | string | null }
export interface TelemetriaLinha { sistema_id: string; device_key: string; valor: number | string | null; ts: string }

export type EstadoUsina = 'normal' | 'atencao' | 'critico' | 'sem_comunicacao' | 'sem_monitoramento';

/** Ordem do pior pro melhor (lista por cidade, mapa). */
export const PIOR_PRIMEIRO: readonly EstadoUsina[] = ['critico', 'sem_comunicacao', 'atencao', 'normal', 'sem_monitoramento'];

/** Sem receber dado da marca por mais que isto = sem comunicação (o sync roda a cada 15 min). */
export const HORAS_SEM_SINAL = 24;

const numOuNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function textoTempo(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

function dataCurta(iso: string): string {
  const d = new Date(Date.parse(iso) - 3 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function estadoDaUsina(
  u: UsinaLinha,
  g: { real7Kwh: number; hojeKwh: number | null },
  o: { agoraMs: number; corteAtencao: number; medianaCarteira7d: number | null },
): { estado: EstadoUsina; alertaTexto: string | null } {
  if (u.acompanhamento === 'manual') return { estado: 'sem_monitoramento', alertaTexto: 'Acompanhada por leitura manual' };

  const statusInversor = (['ok', 'offline', 'falha', 'desconhecido'] as const).find((s) => s === u.status_inversor) ?? null;
  const cls = classificarSistema({
    ativo: u.ativo,
    ultimoErro: u.ultimo_erro,
    potenciaKwp: numOuNull(u.potencia_kwp),
    uf: u.uf,
    // Mesmo proxy da lista do Monitoramento: 7 dias zerados E nada hoje = parada.
    diasSemGeracao: g.real7Kwh === 0 && (g.hojeKwh ?? 0) === 0 ? 7 : 0,
    realUltimos7: g.real7Kwh,
    statusInversor,
    corteAtencao: o.corteAtencao,
    medianaCarteira7d: o.medianaCarteira7d,
  });

  const sync = u.ultima_sincronizacao ? Date.parse(u.ultima_sincronizacao) : NaN;
  const semSync = !Number.isFinite(sync);
  const syncVelho = !semSync && o.agoraMs - sync > HORAS_SEM_SINAL * 3_600_000;
  // Inversor "offline" sozinho não basta (muitas marcas dizem offline à noite):
  // só conta quando a usina também está parada.
  const offlineParada = cls.nivel === 'urgente' && statusInversor === 'offline';
  if (u.ultimo_erro || semSync || syncVelho || offlineParada) {
    let texto = cls.alerta?.texto ?? null;
    if (!u.ultimo_erro && !offlineParada) {
      texto = semSync
        ? 'Ainda não recebemos nenhum dado da marca do inversor.'
        : `Sem receber dados ${textoTempo(o.agoraMs - sync)} (última leitura em ${dataCurta(u.ultima_sincronizacao as string)}).`;
    }
    return { estado: 'sem_comunicacao', alertaTexto: texto };
  }
  if (cls.nivel === 'urgente') return { estado: 'critico', alertaTexto: cls.alerta?.texto ?? null };
  if (cls.nivel === 'aviso') return { estado: 'atencao', alertaTexto: cls.alerta?.texto ?? null };
  return { estado: 'normal', alertaTexto: null };
}

// ---------------------------------------------------------------------------
// Resumo da frota
// ---------------------------------------------------------------------------

export interface UsinaResumo {
  id: string;
  apelido: string;
  cidade: string | null;
  uf: string | null;
  potenciaKwp: number | null;
  estado: EstadoUsina;
  alertaTexto: string | null;
  hojeKwh: number | null;
  real7Kwh: number;
  /** kWh/dia esperado pela média de sol da região (null sem kWp). */
  esperadoDiaKwh: number | null;
  ultimaSincronizacao: string | null;
}

export interface PontoCurva { data: string; realKwh: number | null; esperadoKwh: number | null }

export interface ResumoFrota {
  usinas: UsinaResumo[];
  /** Usinas ativas. */
  total: number;
  /** Soma do kWp de quem tem kWp; null se ninguém tem. */
  potenciaKwp: number | null;
  porEstado: Record<EstadoUsina, number>;
  /** Ativas com monitoramento automático (fora as de leitura manual). */
  monitoradas: number;
  /** Monitoradas que estão mandando dado (normal + atenção + crítico). */
  comunicando: number;
  energiaHojeKwh: number | null;
  usinasComDadoHoje: number;
  energiaMesKwh: number | null;
  /** Soma da potência ao vivo (telemetria dos últimos 30 min). null = nenhuma leitura ao vivo. */
  geracaoAgora: { kw: number; usinas: number } | null;
  /** 30 dias completos até ontem. Real e esperada das MESMAS usinas (com kWp, que mandaram dado no dia). */
  curva: PontoCurva[];
  porCidade: Array<{ cidade: string; total: number; pior: EstadoUsina }>;
}

const JANELA_AO_VIVO_MS = 30 * 60_000;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function resumirFrota(
  usinasLinhas: readonly UsinaLinha[],
  geracoes: readonly GeracaoLinha[],
  telemetria: readonly TelemetriaLinha[],
  o: { agora: Date; corteAtencao: number },
): ResumoFrota {
  const j = janelaBrasilia(o.agora);
  const ativas = usinasLinhas.filter((u) => u.ativo);
  const ids = new Set(ativas.map((u) => u.id));

  // Geração por usina/dia (só usinas ativas da lista).
  const porUsinaDia = new Map<string, Map<string, number>>();
  for (const g of geracoes) {
    if (!ids.has(g.sistema_id)) continue;
    const kwh = numOuNull(g.geracao_kwh);
    if (kwh === null) continue;
    let m = porUsinaDia.get(g.sistema_id);
    if (!m) porUsinaDia.set(g.sistema_id, (m = new Map()));
    m.set(g.data, (m.get(g.data) ?? 0) + kwh);
  }

  const base = ativas.map((u) => {
    const dias = porUsinaDia.get(u.id) ?? new Map<string, number>();
    let real7 = 0;
    for (const [d, v] of dias) if (d >= j.ha7 && d < j.hoje) real7 += v;
    return { u, dias, real7, hoje: dias.has(j.hoje) ? (dias.get(j.hoje) as number) : null, kwp: numOuNull(u.potencia_kwp) };
  });

  const mediana = medianaEspecifica7d(base.map((b) => ({ potenciaKwp: b.kwp, realUltimos7: b.real7 })));
  const agoraMs = o.agora.getTime();

  const usinas: UsinaResumo[] = base.map((b) => {
    const e = estadoDaUsina(b.u, { real7Kwh: b.real7, hojeKwh: b.hoje }, { agoraMs, corteAtencao: o.corteAtencao, medianaCarteira7d: mediana });
    return {
      id: b.u.id,
      apelido: b.u.apelido,
      cidade: b.u.cidade,
      uf: b.u.uf,
      potenciaKwp: b.kwp,
      estado: e.estado,
      alertaTexto: e.alertaTexto,
      hojeKwh: b.hoje,
      real7Kwh: b.real7,
      esperadoDiaKwh: b.kwp !== null && b.kwp > 0 ? esperadoDiaKwh(b.kwp, b.u.uf) : null,
      ultimaSincronizacao: b.u.ultima_sincronizacao,
    };
  });

  const porEstado: Record<EstadoUsina, number> = { normal: 0, atencao: 0, critico: 0, sem_comunicacao: 0, sem_monitoramento: 0 };
  for (const u of usinas) porEstado[u.estado] += 1;

  const comKwp = usinas.filter((u) => u.potenciaKwp !== null && u.potenciaKwp > 0);
  const potenciaKwp = comKwp.length ? r2(comKwp.reduce((s, u) => s + (u.potenciaKwp as number), 0)) : null;

  // Energia hoje / mês
  let hojeSoma = 0; let hojeN = 0; let mesSoma = 0; let mesTem = false;
  for (const b of base) {
    if (b.hoje !== null) { hojeSoma += b.hoje; hojeN += 1; }
    for (const [d, v] of b.dias) if (d >= j.inicioMes && d <= j.hoje) { mesSoma += v; mesTem = true; }
  }

  // Geração agora: último valor de cada inversor nos últimos 30 min.
  const ultimo = new Map<string, { ts: number; kw: number; sistema: string }>();
  for (const t of telemetria) {
    if (!ids.has(t.sistema_id)) continue;
    const ts = Date.parse(t.ts);
    const kw = numOuNull(t.valor);
    if (!Number.isFinite(ts) || kw === null || agoraMs - ts > JANELA_AO_VIVO_MS || ts - agoraMs > JANELA_AO_VIVO_MS) continue;
    const k = `${t.sistema_id}|${t.device_key}`;
    const ja = ultimo.get(k);
    if (!ja || ts > ja.ts) ultimo.set(k, { ts, kw, sistema: t.sistema_id });
  }
  const geracaoAgora = ultimo.size
    ? { kw: r2([...ultimo.values()].reduce((s, x) => s + x.kw, 0)), usinas: new Set([...ultimo.values()].map((x) => x.sistema)).size }
    : null;

  // Curva 30 dias (real × esperada das MESMAS usinas: com kWp e com dado no dia).
  const curva: PontoCurva[] = [];
  const porId = new Map(usinas.map((u) => [u.id, u]));
  for (let d = j.ha30; d < j.hoje; d = somarDias(d, 1)) {
    let real = 0; let esp = 0; let tem = false;
    for (const b of base) {
      const v = b.dias.get(d);
      const esperado = porId.get(b.u.id)?.esperadoDiaKwh ?? null;
      if (v === undefined || esperado === null) continue;
      real += v; esp += esperado; tem = true;
    }
    curva.push({ data: d, realKwh: tem ? r2(real) : null, esperadoKwh: tem ? r2(esp) : null });
  }

  // Por cidade, pior estado primeiro.
  const cidades = new Map<string, { total: number; pior: EstadoUsina }>();
  for (const u of usinas) {
    const nome = u.cidade?.trim() || 'Sem cidade';
    const c = cidades.get(nome);
    if (!c) { cidades.set(nome, { total: 1, pior: u.estado }); continue; }
    c.total += 1;
    if (PIOR_PRIMEIRO.indexOf(u.estado) < PIOR_PRIMEIRO.indexOf(c.pior)) c.pior = u.estado;
  }
  const porCidade = [...cidades].map(([cidade, c]) => ({ cidade, ...c }))
    .sort((a, b) => PIOR_PRIMEIRO.indexOf(a.pior) - PIOR_PRIMEIRO.indexOf(b.pior) || b.total - a.total || a.cidade.localeCompare(b.cidade, 'pt-BR'));

  return {
    usinas,
    total: usinas.length,
    potenciaKwp,
    porEstado,
    monitoradas: usinas.length - porEstado.sem_monitoramento,
    comunicando: porEstado.normal + porEstado.atencao + porEstado.critico,
    energiaHojeKwh: hojeN ? r2(hojeSoma) : null,
    usinasComDadoHoje: hojeN,
    energiaMesKwh: mesTem ? r2(mesSoma) : null,
    geracaoAgora,
    curva,
    porCidade,
  };
}

/** % real/esperada de um ponto da curva (null sem os dois números). */
export function pctDoEsperado(p: { realKwh: number | null; esperadoKwh: number | null } | null | undefined): number | null {
  if (!p || p.realKwh === null || p.esperadoKwh === null || p.esperadoKwh <= 0) return null;
  return Math.round((p.realKwh / p.esperadoKwh) * 100);
}

// ---------------------------------------------------------------------------
// "O que mudou desde ontem" (sem IA: só número real)
// ---------------------------------------------------------------------------

export interface ChipMudanca { texto: string; tom: 'ok' | 'warn' | 'neutro' }

export function mudancasDesdeOntem(i: {
  leads: number | null; propostas: number | null; vendas: number | null; geracaoOntemPct: number | null;
}): { chips: ChipMudanca[]; semDado: boolean } {
  const chips: ChipMudanca[] = [];
  const n = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  if (n(i.leads)) chips.push({ texto: `+${i.leads} ${i.leads === 1 ? 'lead novo' : 'leads novos'}`, tom: 'neutro' });
  if (n(i.propostas)) chips.push({ texto: `${i.propostas} ${i.propostas === 1 ? 'proposta enviada' : 'propostas enviadas'}`, tom: 'neutro' });
  if (n(i.vendas)) chips.push({ texto: `${i.vendas} ${i.vendas === 1 ? 'venda fechada' : 'vendas fechadas'}`, tom: 'ok' });
  if (typeof i.geracaoOntemPct === 'number' && Number.isFinite(i.geracaoOntemPct)) {
    chips.push({ texto: `Ontem: ${i.geracaoOntemPct}% do esperado`, tom: i.geracaoOntemPct >= 90 ? 'ok' : 'warn' });
  }
  const semDado = i.leads === null && i.propostas === null && i.vendas === null && i.geracaoOntemPct === null;
  return { chips, semDado };
}

// ---------------------------------------------------------------------------
// Formatação de energia
// ---------------------------------------------------------------------------

/** kWh até 999; MWh a partir de 1.000 (2 casas até 10 MWh, 1 casa até 1.000 MWh). */
export function energiaLegivel(kwh: number | null | undefined): { valor: number | null; unidade: 'kWh' | 'MWh'; casas: number } {
  if (typeof kwh !== 'number' || !Number.isFinite(kwh)) return { valor: null, unidade: 'kWh', casas: 0 };
  if (Math.abs(kwh) < 1000) return { valor: Math.round(kwh), unidade: 'kWh', casas: 0 };
  const mwh = kwh / 1000;
  const casas = Math.abs(mwh) < 10 ? 2 : Math.abs(mwh) < 1000 ? 1 : 0;
  return { valor: Number(mwh.toFixed(casas)), unidade: 'MWh', casas };
}
