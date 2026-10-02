// Alerta "ABAIXO DO PREVISTO" (Energy Studio, Marco 1 — 02/10/2026).
// Dispara com 2 dias SEGUIDOS "muito abaixo" (mais de 20% abaixo do que o sol
// do dia permitia, em dia limpo/parcial). Resolve sozinho quando a usina volta
// ao normal. Problema técnico → vai para o operador (não para o cliente).
import { situacaoDoDia, diferencaPct, precisaAlertar, type Clima, type Situacao } from './situacao.js';

export interface DiaParaAlerta { data: string; previsto: number; real: number | null; clima: Clima }

export interface AvaliacaoAlerta {
  alertar: boolean;
  /** Último dia julgável voltou ao normal (fecha alerta aberto). */
  normalizou: boolean;
  texto: string;
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const n1 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function avaliarAlertaPrevisto(dias: DiaParaAlerta[]): AvaliacaoAlerta {
  const ord = [...dias].sort((a, b) => a.data.localeCompare(b.data));
  const sit: Situacao[] = ord.map((d) => situacaoDoDia({ previsto: d.previsto, real: d.real, clima: d.clima }));
  // Dias sem leitura não quebram nem completam a sequência (falha de comunicação ≠ defeito).
  const julgaveis = ord.map((d, i) => ({ d, s: sit[i] })).filter((x) => x.s !== 'sem_comunicacao' && x.s !== 'sem_previsto');
  const alertar = precisaAlertar(julgaveis.map((x) => x.s));
  const ultimo = julgaveis[julgaveis.length - 1];
  const normalizou = !!ultimo && (ultimo.s === 'normal' || ultimo.s === 'dia_fraco');
  let texto = '';
  if (alertar) {
    const dois = julgaveis.slice(-2);
    const partes = dois.map(({ d }) => `${br(d.data)}: gerou ${n1(d.real ?? 0)} kWh, o sol permitia ${n1(d.previsto)} (${n1(diferencaPct(d.previsto, d.real) ?? 0)}%)`);
    texto = `Gerando bem menos do que o sol permite há 2 dias seguidos — ${partes.join(' · ')}. ` +
      'Possíveis causas: sujeira, string/módulo parado, disjuntor CC, inversor limitando. Ver a curva hora a hora no Previsto × Real.';
  }
  return { alertar, normalizou, texto };
}
