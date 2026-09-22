// Cruza o que a concessionaria MEDIU (demonstrativo) com o que so nos sabemos:
// a geracao do monitoramento e o rateio combinado com o cliente.
// Funcao PURA — ver docs/superpowers/specs/2026-09-21-demonstrativo-gd-ingestao-design.md.

import type { DemonstrativoGd } from './demonstrativo-parser.js';

export type TipoAlertaGd =
  | 'autoconsumo'
  | 'geracao_nao_fecha'
  | 'creditos_a_vencer'
  | 'rateio_divergente'
  | 'documento_inconsistente';

export interface AlertaGd {
  tipo: TipoAlertaGd;
  gravidade: 'info' | 'atencao';
  texto: string;
}

/** Beneficiaria cadastrada no rateio (leads com eh_consumidor_rateio). */
export interface RateioCadastrado {
  uc: string; // uc_numero da beneficiaria (codigo do cliente ou instalacao)
  nome: string | null;
  percentual: number | null;
}

export interface EntradaCruzamento {
  dados: DemonstrativoGd;
  geracaoMesKwh: number | null; // soma da geracao_diaria no mes; null = sem monitoramento
  rateioCadastrado: RateioCadastrado[];
  inconsistencias: string[];
}

const MESES_VENCIMENTO = 6;
const TOL_PCT = 0.5; // pontos percentuais
const TOL_KWH = 0.5;

const fmt = (v: number, casas = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas });

function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}

const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function mesCurto(iso: string): string {
  const [a, m] = iso.split('-').map(Number);
  return `${MES_ABREV[m - 1]}/${a}`;
}

export function cruzarDemonstrativo(e: EntradaCruzamento): AlertaGd[] {
  const { dados: d } = e;
  const out: AlertaGd[] = [];

  for (const i of e.inconsistencias) {
    out.push({ tipo: 'documento_inconsistente', gravidade: 'atencao', texto: `Documento: ${i}` });
  }

  // Geracao x injetado. A concessionaria nao ve a geracao; se o monitoramento
  // diz que gerou MENOS do que o medidor registrou saindo pra rede, um dos dois
  // esta errado (inversor offline no monitoramento, sistema errado, medidor).
  if (e.geracaoMesKwh !== null && d.injetadoKwh !== null) {
    if (e.geracaoMesKwh + TOL_KWH < d.injetadoKwh) {
      out.push({
        tipo: 'geracao_nao_fecha',
        gravidade: 'atencao',
        texto:
          `Monitoramento registrou ${fmt(e.geracaoMesKwh)} kWh, menos que os ${fmt(d.injetadoKwh)} kWh ` +
          `injetados na rede — conferir monitoramento (inversor offline?) ou o sistema vinculado`,
      });
    } else if (e.geracaoMesKwh > 0) {
      const auto = e.geracaoMesKwh - d.injetadoKwh;
      const pct = Math.round((auto / e.geracaoMesKwh) * 100);
      out.push({
        tipo: 'autoconsumo',
        gravidade: 'info',
        texto: `Gerou ${fmt(e.geracaoMesKwh)} kWh; consumiu na hora ${fmt(auto)} kWh (${pct}%) e injetou ${fmt(d.injetadoKwh)} kWh`,
      });
    }
  }

  // Creditos perto de vencer (valem 60 meses a partir da injecao).
  if (d.proximoExpirarKwh && d.proximoExpirarKwh > 0 && d.cicloExpirar) {
    const faltam = mesesEntre(d.referencia, d.cicloExpirar);
    if (faltam <= MESES_VENCIMENTO) {
      out.push({
        tipo: 'creditos_a_vencer',
        gravidade: 'atencao',
        texto: `${fmt(d.proximoExpirarKwh)} kWh de créditos vencem em ${mesCurto(d.cicloExpirar)} — dá pra aproveitar (rateio para outra UC, consumo maior)`,
      });
    }
  }

  // Rateio: o que esta no documento x o que foi combinado no cadastro.
  for (const b of e.rateioCadastrado) {
    const nome = b.nome ?? `UC ${b.uc}`;
    const u = d.unidades.find((x) => x.codigoCliente === b.uc);
    if (!u) {
      // O demonstrativo lista o CODIGO DO CLIENTE de cada unidade; a ficha pode
      // ter a INSTALACAO. Sem saber qual foi digitado, nao da pra afirmar que
      // o rateio esta errado — so avisar que nao foi possivel conferir.
      out.push({
        tipo: 'rateio_divergente',
        gravidade: 'info',
        texto:
          `Não consegui conferir o rateio de ${nome} (UC ${b.uc}): ela não aparece entre os códigos do demonstrativo ` +
          `(${d.unidades.map((x) => x.codigoCliente).join(', ') || 'nenhum'}). Se a ficha tem a instalação, troque pelo código do cliente`,
      });
      continue;
    }
    if (b.percentual !== null && Math.abs(u.percentual - b.percentual) > TOL_PCT) {
      out.push({
        tipo: 'rateio_divergente',
        gravidade: 'atencao',
        texto: `${nome} (UC ${b.uc}) recebe ${fmt(u.percentual)}% na concessionária, mas o combinado é ${fmt(b.percentual)}%`,
      });
    }
  }

  return out;
}

export function montarResumoWhats(p: {
  dados: DemonstrativoGd;
  alertas: AlertaGd[];
  nomeCliente: string | null;
  modoTeste: boolean;
}): string {
  const d = p.dados;
  const linhas: string[] = [];
  linhas.push(`📄 *Demonstrativo GD — ${p.nomeCliente ?? d.clienteNome}* (${mesCurto(d.referencia)})`);
  linhas.push(`Instalação ${d.instalacao} · código ${d.codigoCliente}`);
  const n = (v: number | null) => (v === null ? '—' : fmt(v));
  linhas.push(`Injetado ${n(d.injetadoKwh)} kWh · consumo ${n(d.consumoKwh)} kWh · compensado ${n(d.creditoUtilizadoKwh)} kWh`);
  linhas.push(`Saldo de créditos: ${n(d.saldoAcumuladoKwh)} kWh`);
  if (d.unidades.length > 1) {
    // Com rateio, o bloco Consumo acima e so o da geradora — quem gasta os
    // creditos sao as beneficiarias. O historico do mes traz cada unidade.
    const doMes = d.historico.filter((h) => h.mes === d.referencia);
    linhas.push('Rateio:');
    for (const u of d.unidades) {
      const h = doMes.find((x) => x.codigoCliente === u.codigoCliente);
      const papel = u.codigoCliente === d.codigoCliente ? ' (geradora)' : '';
      const mov = h ? ` — consumiu ${fmt(h.consumida)} · compensou ${fmt(h.compensado)}` : ' —';
      linhas.push(`• ${u.codigoCliente}${papel} ${fmt(u.percentual)}%${mov} · saldo ${fmt(u.saldo)} kWh`);
    }
    if (doMes.length > 0) {
      linhas.push(`Compensado no mês (todas as unidades): ${fmt(doMes.reduce((s, h) => s + h.compensado, 0))} kWh`);
    }
  }
  const atencao = p.alertas.filter((a) => a.gravidade === 'atencao');
  const info = p.alertas.filter((a) => a.gravidade === 'info');
  for (const a of info) linhas.push(`ℹ️ ${a.texto}`);
  if (atencao.length === 0) linhas.push('✅ Nada fora do normal.');
  for (const a of atencao) linhas.push(`⚠️ ${a.texto}`);
  if (p.modoTeste) linhas.push('_(modo teste — só você recebe; nada foi enviado ao cliente)_');
  return linhas.join('\n');
}
