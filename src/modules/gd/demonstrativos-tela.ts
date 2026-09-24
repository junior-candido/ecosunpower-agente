// Montagem PURA da tela de demonstrativos: linha do banco + validação → o que
// aparece na lista; alerta de crédito a vencer; compensado e economia
// estimada do mês. Sem banco, sem HTML.

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
