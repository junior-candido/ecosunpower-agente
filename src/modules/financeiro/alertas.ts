// src/modules/financeiro/alertas.ts
import { proximoSalto } from './imposto.js';

export interface EntradaAlertas {
  diaDoMes: number; diaAlertaDas: number;
  rbt12: number; margemFaixa: number;
  fatorRatio: number; fatorRAlerta: number; // ratios decimais (0.30 = 30%)
  impostoDoMes: number; proLaboreMin: number;
}
export interface AlertaFinanceiro { tipo: 'das' | 'faixa' | 'fator_r'; texto: string; }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function detectarAlertasFinanceiros(e: EntradaAlertas): AlertaFinanceiro[] {
  const out: AlertaFinanceiro[] = [];
  if (e.diaDoMes === e.diaAlertaDas && e.impostoDoMes > 0) {
    out.push({ tipo: 'das', texto: `📅 DAS: separe ${brl(e.impostoDoMes)} pro imposto deste mês (vence dia 20). Já separou?` });
  }
  const salto = proximoSalto(e.rbt12);
  if (salto && salto.distancia <= e.margemFaixa) {
    out.push({ tipo: 'faixa', texto: `⚠️ Você está a ${brl(salto.distancia)} do salto de faixa (${brl(salto.limite)}). A alíquota vai subir.` });
  }
  if (e.fatorRatio <= e.fatorRAlerta) {
    out.push({ tipo: 'fator_r', texto: `🔴 Fator R em ${(e.fatorRatio * 100).toFixed(1)}% — risco de cair no Anexo V (imposto quase dobra). Pró-labore mín.: ${brl(e.proLaboreMin)}/mês.` });
  }
  return out;
}
