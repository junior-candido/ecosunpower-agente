// src/modules/dashboard/pos-venda-sugestao.ts
// Função PURA: o atalho mais útil agora pro cliente (1 só, por prioridade).
// Devolve o texto do chip + o pedido que pré-preenche o chat da Eva no clique.
// Não chama IA: é regra. A IA só escreve a mensagem quando o operador clica.
import type { Saude } from './pos-venda-saude.js';

export interface LinhaSugestao {
  saude: Saude;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
  elegivelUpgrade: boolean;
  dataInstalacao: string | null;
}

export interface Sugestao { texto: string; pedidoEva: string }

const DIA = 86400000;
const SEM_FALAR_DIAS = 90;
const DEPOIMENTO_MESES = 2;

const diasSem = (iso: string | null, hoje: Date): number | null =>
  iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / DIA) : null;

const mesesDesde = (iso: string | null, hoje: Date): number | null => {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  return Number.isNaN(d.getTime()) ? null : (hoje.getTime() - d.getTime()) / (30 * DIA);
};

export function sugestaoProativa(l: LinhaSugestao, hoje: Date): Sugestao | null {
  if (l.saude === 'vermelho') {
    return {
      texto: '💡 Geração caiu — ofereça revisão',
      pedidoEva: 'Escreve um aviso gentil que notei a geração caindo na usina dele e ofereço uma revisão técnica.',
    };
  }
  const d = diasSem(l.ultimoContatoEm, hoje);
  if (d !== null && d > SEM_FALAR_DIAS) {
    return {
      texto: `💡 ${d} dias sem falar — manda um oi`,
      pedidoEva: 'Escreve um oi leve pra reativar o contato com o cliente, sem cobrança.',
    };
  }
  if (l.elegivelUpgrade) {
    return {
      texto: '💡 Pode crescer o sistema — sonde upgrade',
      pedidoEva: 'Escreve uma sondagem leve sobre ampliar o sistema solar dele.',
    };
  }
  const meses = mesesDesde(l.dataInstalacao, hoje);
  if (!l.jaTeveDepoimento && l.saude === 'verde' && meses !== null && meses >= DEPOIMENTO_MESES) {
    return {
      texto: '💡 Bom momento pra pedir depoimento',
      pedidoEva: 'Escreve um pedido de depoimento simpático pro cliente.',
    };
  }
  return null;
}
