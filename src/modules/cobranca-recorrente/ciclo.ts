// src/modules/cobranca-recorrente/ciclo.ts
// Cobrança recorrente (28/09/2026) — regras PURAS do ciclo mensal.
//
// Uma ASSINATURA (tabela `assinaturas`, 090 + 146) tem dia de vencimento
// (1–28) e mês de início. Cada mês vira uma FATURA (`faturas_assinatura`,
// 146) — UMA por competência (unique no banco = idempotência).
//
// Régua do Junior:
//   D−3  → o robô cria a fatura, gera o link e manda pro cliente
//   D0   → lembrete no dia do vencimento (se não pagou)
//   D+3  → lembrete (se não pagou)
//   D+7  → avisa o JUNIOR que está atrasada (o cliente não recebe mais nada)
// Tudo por JANELA, não por data exata: se o robô ficar parado um dia, o aviso
// sai no dia seguinte. Cada aviso tem a sua coluna na fatura (reservada antes
// de enviar) → nunca sai duas vezes.
//
// Datas sempre 'YYYY-MM-DD' (comparar string = comparar data).

import type { Tom } from '../dashboard/ui/componentes.js';

export type StatusAssinatura = 'ativa' | 'pausada' | 'travada' | 'cancelada';
export type StatusFatura = 'aberta' | 'paga' | 'cancelada';

/** O mínimo da assinatura que o ciclo precisa. */
export interface AssinaturaCiclo {
  status: StatusAssinatura;
  inicioEm: string | null;         // 1º dia do mês da 1ª mensalidade
  diaVencimento: number | null;    // 1–28
}

/** O mínimo da fatura que o ciclo precisa. Avisos = timestamp ISO de quando saiu. */
export interface FaturaCiclo {
  competencia: string;
  venceEm: string;
  valorCentavos: number;
  status: StatusFatura;
  avisoFaturaEm: string | null;
  avisoD0Em: string | null;
  avisoD3Em: string | null;
  avisoAtrasoEm: string | null;
  pagoEm: string | null;
}

export type AcaoFatura = 'fatura' | 'lembrete_d0' | 'lembrete_d3' | 'atraso_junior';

const DIA_MS = 86_400_000;
/** A fatura nasce 3 dias antes do vencimento. */
export const DIAS_ANTES = 3;
/** Depois de 7 dias de atraso o robô não cria mais sozinho (e avisa o Junior). */
export const DIAS_ATRASO_JUNIOR = 7;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

function partes(iso: string): [number, number, number] {
  const m = RE_DATA.exec(iso);
  if (!m) throw new Error(`data inválida: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' → 'YYYY-MM-01'. */
export function competenciaDe(iso: string): string {
  const [y, m] = partes(iso);
  return `${y}-${pad(m)}-01`;
}

export function somarMeses(competencia: string, n: number): string {
  const [y, m] = partes(competencia);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

export function vencimentoDaCompetencia(competencia: string, dia: number): string {
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) throw new Error(`dia de vencimento inválido: ${dia} (use 1 a 28)`);
  const [y, m] = partes(competencia);
  return `${y}-${pad(m)}-${pad(dia)}`;
}

/** Dias corridos de `a` até `b` (b − a). */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = partes(a);
  const [yb, mb, db] = partes(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DIA_MS);
}

/** Hoje no horário de Brasília (UTC−3, sem horário de verão). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Dia (Brasília) de um timestamp ISO. */
function diaDe(ts: string): string {
  return hojeBrasilia(new Date(ts));
}

/** Valor de `<input type="month">` ('2026-10') → '2026-10-01'. */
export function competenciaDoMesInput(v: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec((v ?? '').trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function rotuloCompetencia(competencia: string): string {
  const [y, m] = partes(competencia);
  return `${MESES[m - 1]}/${y}`;
}

export function dataBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10);
  return RE_DATA.test(d) ? d.split('-').reverse().join('/') : '—';
}

/** Centavos → "1.234,56" (sem o "R$"). */
export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Quais faturas criar
// ---------------------------------------------------------------------------

const GERA_FATURA: ReadonlySet<StatusAssinatura> = new Set(['ativa', 'travada']);

/**
 * Faturas que o robô deve criar HOJE: competências do mês passado, deste e do
 * próximo (o D−3 do dia 1º cai no mês anterior; o atraso do dia 28 entra no
 * seguinte) cujo vencimento está na janela [D−3, D+7], a partir do início, e
 * que ainda não existem. Acesso suspenso (travada) continua devendo.
 */
export function competenciasDevidas(
  a: AssinaturaCiclo,
  hoje: string,
  existentes: ReadonlySet<string>,
): Array<{ competencia: string; venceEm: string }> {
  if (!GERA_FATURA.has(a.status) || !a.diaVencimento || !a.inicioEm) return [];
  const inicio = competenciaDe(a.inicioEm);
  const atual = competenciaDe(hoje);
  const out: Array<{ competencia: string; venceEm: string }> = [];
  for (const n of [-1, 0, 1]) {
    const c = somarMeses(atual, n);
    if (c < inicio || existentes.has(c)) continue;
    const venceEm = vencimentoDaCompetencia(c, a.diaVencimento);
    const dias = diasEntre(hoje, venceEm);
    if (dias <= DIAS_ANTES && dias >= -DIAS_ATRASO_JUNIOR) out.push({ competencia: c, venceEm });
  }
  return out;
}

/**
 * Botão "Gerar cobrança agora": a primeira competência sem fatura a partir do
 * mês de hoje (ou do início, se for depois). Pausada/cancelada → null.
 */
export function proximaCompetenciaManual(
  a: AssinaturaCiclo,
  hoje: string,
  existentes: ReadonlySet<string>,
): { competencia: string; venceEm: string } | null {
  if (!GERA_FATURA.has(a.status) || !a.diaVencimento || !a.inicioEm) return null;
  const inicio = competenciaDe(a.inicioEm);
  const atual = competenciaDe(hoje);
  let c = inicio > atual ? inicio : atual;
  for (let i = 0; i < 24; i++, c = somarMeses(c, 1)) {
    if (!existentes.has(c)) return { competencia: c, venceEm: vencimentoDaCompetencia(c, a.diaVencimento) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Qual aviso sai hoje
// ---------------------------------------------------------------------------

/**
 * Um aviso por fatura por rodada; cada um uma vez só. Janela:
 *  - fatura: enquanto não foi enviada (qualquer dia com a fatura aberta);
 *  - D0: do vencimento até D+2, se a fatura saiu ANTES do vencimento;
 *  - D+3: de D+3 a D+6, se nada saiu hoje;
 *  - D+7 em diante: avisa o Junior (atrasada).
 */
export function acaoDaFatura(f: FaturaCiclo, hoje: string): AcaoFatura | null {
  if (f.status !== 'aberta') return null;
  if (!f.avisoFaturaEm) return 'fatura';
  const dias = diasEntre(f.venceEm, hoje); // positivo = atrasada
  if (dias >= DIAS_ATRASO_JUNIOR) return f.avisoAtrasoEm ? null : 'atraso_junior';
  const saiuFatura = diaDe(f.avisoFaturaEm);
  if (dias >= 3) {
    if (f.avisoD3Em) return null;
    const ultimo = [saiuFatura, f.avisoD0Em ? diaDe(f.avisoD0Em) : ''].sort().pop()!;
    return ultimo < hoje ? 'lembrete_d3' : null;
  }
  if (dias >= 0) {
    if (f.avisoD0Em) return null;
    return saiuFatura < f.venceEm ? 'lembrete_d0' : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Situação (pílula da tela)
// ---------------------------------------------------------------------------

export interface Situacao {
  chave: 'paga' | 'cancelada' | 'vence_em' | 'vence_hoje' | 'atrasada' | 'em_dia' | 'pausada' | 'suspensa';
  dias: number;
  texto: string;
  tom: Tom;
}

export function situacaoDaFatura(f: Pick<FaturaCiclo, 'status' | 'venceEm'>, hoje: string): Situacao {
  if (f.status === 'paga') return { chave: 'paga', dias: 0, texto: 'paga', tom: 'normal' };
  if (f.status === 'cancelada') return { chave: 'cancelada', dias: 0, texto: 'cancelada', tom: 'sem_dado' };
  const falta = diasEntre(hoje, f.venceEm);
  if (falta === 0) return { chave: 'vence_hoje', dias: 0, texto: 'vence hoje', tom: 'atencao' };
  if (falta < 0) {
    const n = -falta;
    return { chave: 'atrasada', dias: n, texto: `atrasada ${n} dia${n === 1 ? '' : 's'}`, tom: 'critico' };
  }
  const texto = falta === 1 ? 'vence amanhã' : `vence em ${falta} dias`;
  return { chave: 'vence_em', dias: falta, texto, tom: falta <= DIAS_ANTES ? 'atencao' : 'normal' };
}

/** Pílula da assinatura: status manual manda; senão a pior fatura aberta; senão "em dia". */
export function situacaoDaAssinatura(
  a: Pick<AssinaturaCiclo, 'status'>,
  faturas: ReadonlyArray<Pick<FaturaCiclo, 'status' | 'venceEm'>>,
  hoje: string,
): Situacao {
  if (a.status === 'pausada') return { chave: 'pausada', dias: 0, texto: 'pausada', tom: 'sem_dado' };
  if (a.status === 'cancelada') return { chave: 'cancelada', dias: 0, texto: 'cancelada', tom: 'sem_dado' };
  if (a.status === 'travada') return { chave: 'suspensa', dias: 0, texto: 'acesso suspenso', tom: 'critico' };
  const abertas = faturas.filter((f) => f.status === 'aberta').sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1));
  if (abertas.length === 0) return { chave: 'em_dia', dias: 0, texto: 'em dia', tom: 'normal' };
  return situacaoDaFatura(abertas[0]!, hoje);
}

/** Próximo vencimento a mostrar: a aberta mais antiga; senão o mês seguinte à última fatura (ou o início). */
export function proximoVencimento(
  a: AssinaturaCiclo,
  faturas: ReadonlyArray<Pick<FaturaCiclo, 'status' | 'venceEm' | 'competencia'>>,
  hoje: string,
): string | null {
  if (!a.diaVencimento || !a.inicioEm) return null;
  const abertas = faturas.filter((f) => f.status === 'aberta').map((f) => f.venceEm).sort();
  if (abertas.length) return abertas[0]!;
  const ultima = faturas.map((f) => f.competencia).sort().pop();
  let c = ultima ? somarMeses(ultima, 1) : competenciaDe(a.inicioEm);
  // Sem fatura nenhuma e início lá atrás: o ciclo "de agora".
  if (!ultima && c < competenciaDe(hoje)) c = competenciaDe(hoje);
  return vencimentoDaCompetencia(c, a.diaVencimento);
}

// ---------------------------------------------------------------------------
// Números da tela
// ---------------------------------------------------------------------------

export interface ResumoCarteira {
  recorrenteCentavos: number;   // soma das mensalidades ativas (MRR)
  ativas: number;
  recebidoMesCentavos: number;  // faturas pagas neste mês (Brasília)
  emAbertoCentavos: number;     // faturas abertas
  atrasadas: number;            // faturas abertas vencidas
}

export function resumoCarteira(
  assinaturas: ReadonlyArray<{ status: StatusAssinatura; valorCentavos: number }>,
  faturas: ReadonlyArray<Pick<FaturaCiclo, 'status' | 'venceEm' | 'valorCentavos' | 'pagoEm'> & { pagoCentavos?: number | null }>,
  hoje: string,
): ResumoCarteira {
  const cobraveis = assinaturas.filter((a) => GERA_FATURA.has(a.status));
  const mes = competenciaDe(hoje);
  let recebido = 0; let aberto = 0; let atrasadas = 0;
  for (const f of faturas) {
    if (f.status === 'paga' && f.pagoEm && competenciaDe(diaDe(f.pagoEm)) === mes) recebido += f.pagoCentavos ?? f.valorCentavos;
    if (f.status === 'aberta') {
      aberto += f.valorCentavos;
      if (f.venceEm < hoje) atrasadas++;
    }
  }
  return {
    recorrenteCentavos: cobraveis.reduce((s, a) => s + a.valorCentavos, 0),
    ativas: cobraveis.length,
    recebidoMesCentavos: recebido,
    emAbertoCentavos: aberto,
    atrasadas,
  };
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

/** CPF (11) ou CNPJ (14) → só dígitos; vazio → null; outro tamanho → erro. */
export function validarDocumento(v: string | null | undefined): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length !== 11 && d.length !== 14) throw new Error('CPF tem 11 dígitos e CNPJ tem 14 — confira o documento.');
  return d;
}
