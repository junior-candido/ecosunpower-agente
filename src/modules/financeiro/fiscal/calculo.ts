// src/modules/financeiro/fiscal/calculo.ts
// Conta da NFS-e: ISS e líquido. Retenção: no DF, tomador PJ estabelecido no DF
// retém o ISS (5%) — foi assim nas notas reais 82/83. PF e tomador de fora: sem retenção.
// (INSS 11% empreitada: fora da F1 — pendência com a contadora.)
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface EntradaCalculo { valorBruto: number; aliquotaIss: number; issRetido: boolean }
export interface SaidaCalculo { valorIss: number; valorLiquido: number }

export function calcularNota(e: EntradaCalculo): SaidaCalculo {
  const valorIss = round2(e.valorBruto * e.aliquotaIss);
  return { valorIss, valorLiquido: e.issRetido ? round2(e.valorBruto - valorIss) : e.valorBruto };
}

export interface TomadorLocal { tipo: 'PJ' | 'PF'; municipio: string; uf: string }
export function retencaoAutomatica(t: TomadorLocal): boolean {
  return t.tipo === 'PJ' && t.uf === 'DF' && t.municipio.toLowerCase().startsWith('bras');
}
