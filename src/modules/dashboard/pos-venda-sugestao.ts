// src/modules/dashboard/pos-venda-sugestao.ts
// Função PURA: a dica mais útil agora pro cliente (1 só, por prioridade), COM
// MEMÓRIA — não sugere tipo que está em descanso (snoozedTipos). Não chama IA:
// é regra. A IA só escreve a mensagem quando o operador clica.
// Depoimento saiu daqui de propósito: virou botão manual (o operador decide a hora).
import type { Saude } from './pos-venda-saude.js';

export interface LinhaSugestao {
  saude: Saude;
  ultimoContatoEm: string | null;
  elegivelUpgrade: boolean;
  dataInstalacao: string | null;
  gerouBem: boolean;
  ultimoContatoPositivoEm: string | null;
  snoozedTipos: Set<string>;
}

export interface Sugestao { tipo: string; texto: string; pedidoEva: string }

const DIA = 86400000;
const SEM_FALAR_DIAS = 90;
const SEM_CONTATO_POSITIVO_DIAS = 60;

const diasSem = (iso: string | null, hoje: Date): number | null =>
  iso ? Math.floor((hoje.getTime() - new Date(iso).getTime()) / DIA) : null;

export function sugestaoProativa(l: LinhaSugestao, hoje: Date): Sugestao | null {
  if (l.saude === 'vermelho' && !l.snoozedTipos.has('queda')) {
    return {
      tipo: 'queda',
      texto: '💡 Geração caiu — ofereça revisão/limpeza',
      pedidoEva: 'Escreve um aviso gentil que notei a geração caindo na usina dele e ofereço uma revisão técnica.',
    };
  }
  const d = diasSem(l.ultimoContatoEm, hoje);
  if (d !== null && d > SEM_FALAR_DIAS && !l.snoozedTipos.has('contato')) {
    return {
      tipo: 'contato',
      texto: `💡 ${d} dias sem falar — manda um oi`,
      pedidoEva: 'Escreve um oi leve pra reativar o contato com o cliente, sem cobrança.',
    };
  }
  if (l.saude === 'verde' && l.gerouBem && !l.snoozedTipos.has('geracao_saudavel')) {
    const dp = diasSem(l.ultimoContatoPositivoEm, hoje);
    if (dp === null || dp > SEM_CONTATO_POSITIVO_DIAS) {
      return {
        tipo: 'geracao_saudavel',
        texto: '☀️ Usina foi bem — mande a boa notícia',
        pedidoEva: 'Escreve uma boa notícia pro cliente: a usina dele rendeu bem no período, reforçando o quanto está economizando. Tom leve e positivo.',
      };
    }
  }
  if (l.elegivelUpgrade && !l.snoozedTipos.has('upgrade')) {
    return {
      tipo: 'upgrade',
      texto: '💡 Pode crescer o sistema — sonde upgrade',
      pedidoEva: 'Escreve uma sondagem leve sobre ampliar o sistema solar dele.',
    };
  }
  return null;
}
