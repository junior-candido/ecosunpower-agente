// Montagem PURA da tela de demonstrativos: linha do banco + validação → o que
// aparece na lista; alerta de crédito a vencer; compensado e economia
// estimada do mês. Sem banco, sem HTML.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { LinhaDemonstrativo } from './demonstrativos-tela-repo.js';
import type { EstadoGd, ResultadoValidacao } from './gd-validacao.js';
import { mesCurto } from './demonstrativo-cruzamento.js';

/** Tarifa média usada na economia estimada até existir config por empresa (fatia 2). */
export const TARIFA_PADRAO_RS_KWH = 0.99;
const MESES_ALERTA = 6;

export interface ItemLista {
  instalacao: string;
  clienteNome: string;
  leadId: string | null;
  referencia: string;
  geracaoKwh: number | null;
  saldoKwh: number | null;
  estado: EstadoGd;
  motivo: string | null;
  alertaVencimento: string | null;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function mesesEntre(deIso: string, ateIso: string): number {
  const [a1, m1] = deIso.slice(0, 7).split('-').map(Number);
  const [a2, m2] = ateIso.slice(0, 7).split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

export function alertaVencimento(kwh: number | null, ciclo: string | null, hojeIso: string): string | null {
  if (!kwh || kwh <= 0 || !ciclo) return null;
  const faltam = mesesEntre(hojeIso, ciclo);
  if (faltam < 0 || faltam > MESES_ALERTA) return null;
  return `⏰ ${fmt(kwh)} kWh de crédito vencem em ${mesCurto(ciclo)}`;
}

/** 'YYYY-MM-DD' de hoje em Brasília (UTC-3) — não usa o fuso do servidor, pra não pular de dia perto da virada. */
export function hojeBrasilia(agora: Date = new Date()): string {
  const d = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** null quando o mês não tem linha, ou o compensado veio nulo/indefinido/não numérico — nunca vira 0 por acidente. */
export function compensadoDoMes(l: LinhaDemonstrativo): number | null {
  const h = l.historico.find((x) => x.mes === l.referencia);
  if (!h || h.compensado === null || h.compensado === undefined) return null;
  const v = Number(h.compensado);
  return Number.isFinite(v) ? v : null;
}

export function economiaEstimadaRs(compensadoKwh: number | null, tarifa: number): number | null {
  if (compensadoKwh === null) return null;
  return Math.round(compensadoKwh * tarifa * 100) / 100;
}

export function montarItem(l: LinhaDemonstrativo, v: ResultadoValidacao, hojeIso: string): ItemLista {
  return {
    instalacao: l.instalacao,
    clienteNome: l.cliente_nome,
    leadId: l.lead_id,
    referencia: l.referencia,
    geracaoKwh: v.geracaoKwh,
    saldoKwh: l.saldo_acumulado_kwh,
    estado: v.estado,
    motivo: v.bloqueios[0] ?? v.pendencias[0] ?? null,
    alertaVencimento: alertaVencimento(l.proximo_expirar_kwh, l.ciclo_expirar, hojeIso),
  };
}

/** Remove acentos pra "joão" bater com "JOAO" na busca. */
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function filtrarItens(itens: ItemLista[], f: { estado?: string; q?: string }): ItemLista[] {
  const q = semAcento((f.q ?? '').trim().toLowerCase());
  return itens.filter((i) =>
    (!f.estado || i.estado === f.estado) &&
    (!q || semAcento(i.clienteNome.toLowerCase()).includes(q) || i.instalacao.includes(q)));
}

// ── Conferência do PDF enviado na tela: o texto lido vai ao navegador e volta
// no "Confirmo — gravar". Assinamos (HMAC com o segredo da sessão do painel)
// texto + empresa, pra que ninguém troque o texto nem o reuse em outra empresa.
// O prefixo separa este uso do cookie de sessão (mesma chave, mensagens distintas).
const PREFIXO_CONFERENCIA = 'gd-conferencia-pdf\n';

export function assinarTextoConferencia(segredo: string, companyId: string, texto: string): string {
  return createHmac('sha256', segredo).update(`${PREFIXO_CONFERENCIA}${companyId}\n${texto}`).digest('base64url');
}

export function conferirAssinaturaTexto(segredo: string, companyId: string, texto: string, assinatura: string): boolean {
  const esperado = Buffer.from(assinarTextoConferencia(segredo, companyId, texto), 'utf-8');
  const recebido = Buffer.from(String(assinatura ?? ''), 'utf-8');
  if (recebido.length !== esperado.length) return false;
  return timingSafeEqual(recebido, esperado);
}

/** Roda `fn` em lotes de `tamanho` em paralelo, mantendo a ordem do resultado. */
export async function emLotes<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    out.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
  }
  return out;
}
