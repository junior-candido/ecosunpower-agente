// Diagnóstico do Previsto × Real (Energy Studio, Marco 1 — 02/10/2026).
// Lê o PADRÃO da diferença (dia a dia e hora a hora) e devolve HIPÓTESES
// rotuladas com a evidência — nunca afirma defeito. Regra de ouro: separar
// medido (real), calculado (previsto) e inferido (estas hipóteses).
import type { Clima } from './situacao.js';

export type TipoHipotese = 'sujeira' | 'degrau' | 'rendimento_baixo' | 'corte_inversor' | 'desligamento';

export interface Hipotese {
  tipo: TipoHipotese;
  titulo: string;
  confianca: 'provavel' | 'possivel';
  evidencia: string;
  acao: string;
}

export interface DiaDiag { data: string; previsto: number; real: number | null; clima: Clima }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const desvio = (xs: number[]) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };

/** Rendimento (real ÷ previsto) só em dias julgáveis: com leitura, sol razoável. */
function rendimentos(dias: DiaDiag[]): { data: string; r: number }[] {
  return [...dias].sort((a, b) => a.data.localeCompare(b.data))
    .filter((d) => d.real !== null && d.previsto > 0.5 && (d.clima === 'limpo' || d.clima === 'parcial'))
    .map((d) => ({ data: d.data, r: (d.real as number) / d.previsto }))
    .filter((x) => Number.isFinite(x.r) && x.r < 2);
}

export function diagnosticarDias(dias: DiaDiag[]): Hipotese[] {
  const rs = rendimentos(dias);
  if (rs.length < 6) return [];
  const out: Hipotese[] = [];

  // 1) DEGRAU: melhor ponto de corte com ≥ 4 dias antes e ≥ 3 depois.
  let melhor: { k: number; antes: number; depois: number } | null = null;
  for (let k = 4; k <= rs.length - 3; k++) {
    const antes = media(rs.slice(0, k).map((x) => x.r));
    const depoisL = rs.slice(k).map((x) => x.r);
    const depois = media(depoisL);
    if (antes - depois >= 0.12 && desvio(depoisL) < 0.08 && (!melhor || antes - depois > melhor.antes - melhor.depois)) {
      melhor = { k, antes, depois };
    }
  }
  if (melhor) {
    out.push({
      tipo: 'degrau', titulo: 'Queda em degrau — parte do sistema parou',
      confianca: melhor.antes - melhor.depois >= 0.18 ? 'provavel' : 'possivel',
      evidencia: `Até ${br(rs[melhor.k - 1].data)} rendia ${pct(melhor.antes)} do previsto; desde ${br(rs[melhor.k].data)} rende ${pct(melhor.depois)} e não voltou.`,
      acao: 'Conferir strings/MPPT, disjuntor CC, módulos e otimizadores/micros (um parado derruba uma fatia fixa).',
    });
  }

  // 2) SUJEIRA: rendimento escorrega aos poucos (regressão) e/ou sobe depois de chuva.
  if (!melhor && rs.length >= 8) {
    const t0 = Date.parse(rs[0].data);
    const xs = rs.map((x) => (Date.parse(x.data) - t0) / 86400_000), ys = rs.map((x) => x.r);
    const mx = media(xs), my = media(ys);
    const incl = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.max(1e-9, xs.reduce((s, x) => s + (x - mx) ** 2, 0));
    const perdaMes = -incl * 30;
    // chuva seguida de melhora
    const ord = [...dias].sort((a, b) => a.data.localeCompare(b.data));
    let depoisChuva = '';
    for (let i = 0; i < ord.length; i++) {
      if (ord[i].clima !== 'chuva') continue;
      const antes = rs.filter((x) => x.data < ord[i].data).slice(-3).map((x) => x.r);
      const depois = rs.filter((x) => x.data > ord[i].data).slice(0, 3).map((x) => x.r);
      if (antes.length >= 2 && depois.length >= 2 && media(depois) - media(antes) >= 0.05) {
        depoisChuva = ` Depois da chuva de ${br(ord[i].data)} subiu de ${pct(media(antes))} para ${pct(media(depois))}.`;
      }
    }
    if (perdaMes >= 0.06 || (depoisChuva && perdaMes >= 0.03)) {
      out.push({
        tipo: 'sujeira', titulo: 'Sujeira acumulando nos módulos',
        confianca: perdaMes >= 0.08 || depoisChuva ? 'provavel' : 'possivel',
        evidencia: `O rendimento vem caindo ~${Math.round(perdaMes * 100)} pontos por mês (de ${pct(ys[0])} para ${pct(ys[ys.length - 1])}).${depoisChuva}`,
        acao: 'Agendar limpeza (e mostrar ao cliente o antes × depois no Previsto × Real).',
      });
    }
  }

  // 3) RENDIMENTO BAIXO CONSTANTE: sempre abaixo, estável (não é degrau nem tendência).
  const todos = rs.map((x) => x.r);
  if (!melhor && !out.some((h) => h.tipo === 'sujeira') && media(todos) < 0.82 && desvio(todos) < 0.08) {
    out.push({
      tipo: 'rendimento_baixo', titulo: 'Rende sempre abaixo, sem variar',
      confianca: 'possivel',
      evidencia: `Nos ${todos.length} dias de sol rendeu em média ${pct(media(todos))} do previsto, quase sem variação.`,
      acao: 'Conferir o cadastro (kWp, orientação, inclinação) e sombra fixa (prédio, árvore, platibanda). Se o cadastro estiver certo, vale visita técnica.',
    });
  }
  return out;
}

/** Hora a hora do dia: corte do inversor (topo achatado) e desligamentos no meio do dia. */
export function diagnosticarCurva(prev: number[], real: number[] | null | undefined, clima: Clima): Hipotese[] {
  if (!real || real.length !== 24 || prev.length !== 24) return [];
  if (clima !== 'limpo' && clima !== 'parcial') return [];
  const out: Hipotese[] = [];
  const maxR = Math.max(...real);
  if (maxR <= 0) return [];
  // escala do previsto pelas horas "normais" (fora do topo), p/ comparar forma
  const normais = real.map((v, h) => ({ v, p: prev[h], h })).filter((x) => x.p > 0 && x.v > 0.15 * maxR && x.v < 0.9 * maxR);
  const k = normais.length >= 3 ? normais.reduce((s, x) => s + x.v, 0) / normais.reduce((s, x) => s + x.p, 0) : null;

  // CORTE: 2+ horas seguidas coladas no topo E o previsto (na escala) pedia mais
  if (k) {
    let perdido = 0, horas = 0, seq = 0, melhorSeq = 0;
    for (let h = 0; h < 24; h++) {
      const noTopo = real[h] >= 0.97 * maxR;
      seq = noTopo ? seq + 1 : 0;
      melhorSeq = Math.max(melhorSeq, seq);
      if (noTopo && prev[h] * k > real[h] * 1.05) { perdido += prev[h] * k - real[h]; horas++; }
    }
    if (melhorSeq >= 2 && horas >= 2 && perdido >= 0.5) {
      out.push({
        tipo: 'corte_inversor', titulo: 'Inversor cortando no meio do dia',
        confianca: perdido >= 2 ? 'provavel' : 'possivel',
        evidencia: `A curva fica achatada no topo (~${maxR.toFixed(1)} kW por ${melhorSeq} h); o sol permitia mais ~${perdido.toFixed(1)} kWh nessas horas.`,
        acao: 'Normal quando os módulos passam bem da potência do inversor (DC/AC alto). Se incomoda: limitação de exportação? ajuste de potência no inversor?',
      });
    }
  }

  // DESLIGAMENTO: hora de sol forte com geração ~zero entre horas normais
  const picoPrev = Math.max(...prev);
  const quedas: number[] = [];
  for (let h = 9; h <= 15; h++) {
    const esperado = k ? prev[h] * k : prev[h];
    const vizinhosOk = real[h - 1] > 0.3 * maxR || real[h + 1] > 0.3 * maxR;
    if (prev[h] > 0.5 * picoPrev && real[h] < 0.25 * esperado && vizinhosOk) quedas.push(h);
  }
  if (quedas.length) {
    out.push({
      tipo: 'desligamento', titulo: 'Desligou no meio do dia',
      confianca: 'possivel',
      evidencia: `Com sol forte, a geração despencou às ${quedas.map((h) => `${h}h`).join(', ')} e voltou depois.`,
      acao: 'Típico de tensão da rede alta (inversor desarma acima do limite) ou disjuntor. Ver o histórico de eventos do inversor; se for tensão, abrir reclamação na distribuidora.',
    });
  }
  return out;
}
