// Camada "Rede" do mapa das usinas (Radar da Rede — Marco 2, 02/10/2026).
// Mesmos alfinetes do mapa do Command Center; a COR passa a ser a qualidade da
// tensão nos últimos 7 dias (rede_resumo_diario). Sem medição de tensão →
// cinza ("sem medição"), nunca verde (não afirmamos o que não medimos).
import type { DadosMapa, PinoUsina } from '../../dashboard/mapa-usinas.js';
import type { EstadoUsina } from '../../dashboard/command-center-calc.js';

export interface ResumoRedeLinha {
  sistema_id: string;
  dia: string;
  v_max: number | string | null;
  min_critica: number;
  min_acima_desarme: number;
  desarmes: number;
  nivel: 'ok' | 'atencao' | 'critico' | 'sem_dado';
}

export interface RankingRede { id: string; nome: string; cidade: string | null; vMax: number; desarmes: number; minAcima: number; diasCriticos: number; dias: number; nivel: 'ok' | 'atencao' | 'critico'; href: string }

const PESO = { ok: 0, atencao: 1, critico: 2 } as const;

export function aplicarCamadaRede(base: DadosMapa, resumos: ResumoRedeLinha[]): DadosMapa & { ranking: RankingRede[] } {
  const porUsina = new Map<string, ResumoRedeLinha[]>();
  for (const r of resumos) if (r.nivel !== 'sem_dado') porUsina.set(r.sistema_id, [...(porUsina.get(r.sistema_id) ?? []), r]);
  const ranking: RankingRede[] = [];
  const usinas: PinoUsina[] = base.usinas.map((p) => {
    const rs = porUsina.get(p.id);
    if (!rs?.length) return { ...p, estado: 'sem_monitoramento' as EstadoUsina, alerta: 'Sem medição de tensão (marca ainda não manda a tensão da rede).', href: `${p.href}/rede` };
    const vMax = Math.max(...rs.map((r) => Number(r.v_max) || 0));
    const desarmes = rs.reduce((s, r) => s + (r.desarmes || 0), 0);
    const minAcima = rs.reduce((s, r) => s + (r.min_acima_desarme || 0), 0);
    const diasCriticos = rs.filter((r) => r.nivel === 'critico').length;
    const nivel = rs.reduce<'ok' | 'atencao' | 'critico'>((pior, r) => (PESO[r.nivel as 'ok'] > PESO[pior] ? (r.nivel as 'ok') : pior), 'ok');
    const estado: EstadoUsina = nivel === 'critico' ? 'critico' : nivel === 'atencao' ? 'atencao' : 'normal';
    const alerta = nivel === 'ok'
      ? `Rede boa nos últimos ${rs.length} dias (máx. ${vMax.toFixed(0)} V).`
      : `Últimos ${rs.length} dias: máx. ${vMax.toFixed(0)} V${minAcima ? ` · ${minAcima} min acima de 242 V` : ''}${desarmes ? ` · ${desarmes} desligamento(s) por tensão` : ''} · ${diasCriticos} dia(s) crítico(s).`;
    ranking.push({ id: p.id, nome: p.nome, cidade: p.cidade, vMax, desarmes, minAcima, diasCriticos, dias: rs.length, nivel, href: `${p.href}/rede` });
    return { ...p, estado, alerta, href: `${p.href}/rede` };
  });
  ranking.sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || b.desarmes - a.desarmes || b.minAcima - a.minAcima || b.vMax - a.vMax);
  const porEstadoNoMapa: Record<EstadoUsina, number> = { normal: 0, atencao: 0, critico: 0, sem_comunicacao: 0, sem_monitoramento: 0 };
  for (const u of usinas) porEstadoNoMapa[u.estado] += 1;
  return { ...base, usinas, porEstadoNoMapa, ranking };
}
