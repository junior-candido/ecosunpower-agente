// src/modules/dashboard/manutencao-motor.ts
// Motor PURO da gestão de manutenção: cadência por usina, próxima data, feedback
// da leitura manual, status/ordenação da agenda e empurrão mensal. Sem I/O.

export type ManutencaoTipo = 'limpeza' | 'revisao_inversor' | 'revisao_eletrica' | 'corretiva' | 'inspecao';
export type ManutencaoStatus = 'agendada' | 'feita' | 'cancelada';
export type ManutencaoOrigem = 'regra' | 'alerta' | 'manual';

// Cadência padrão (meses). null = não recorre (corretiva/inspeção são sob demanda).
export const CADENCIA_PADRAO: Record<ManutencaoTipo, number | null> = {
  limpeza: 6, revisao_inversor: 12, revisao_eletrica: 12, corretiva: null, inspecao: null,
};

export function cadenciaDaUsina(
  tipo: ManutencaoTipo,
  overrideUsina: Partial<Record<ManutencaoTipo, number>> | null,
  padrao: Record<ManutencaoTipo, number | null> = CADENCIA_PADRAO,
): number | null {
  const ov = overrideUsina?.[tipo];
  if (typeof ov === 'number' && ov > 0) return ov;
  return padrao[tipo];
}

// Próxima data = base + N meses. null se não recorre.
export function proximaData(base: Date, cadenciaMeses: number | null): Date | null {
  if (!cadenciaMeses || cadenciaMeses <= 0) return null;
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + cadenciaMeses);
  return d;
}

export interface FeedbackLeitura { status: 'ok' | 'baixo' | 'alto' | 'indefinido'; pctDesvio: number | null; sugestao: string }

const PERFORMANCE_RATIO = 0.78; // perdas típicas (temperatura, cabeamento, inversor)

// Compara o kWh digitado com o esperado (kWp × HSP × dias × PR). Limiar ±15%.
export function feedbackLeitura(
  kwhDigitado: number, potenciaKwp: number, hspRegiao: number, diasNoMes: number,
): FeedbackLeitura {
  if (!(potenciaKwp > 0) || !(hspRegiao > 0) || !(diasNoMes > 0)) {
    return { status: 'indefinido', pctDesvio: null, sugestao: 'Faltam dados da usina (potência) pra comparar — leitura registrada mesmo assim.' };
  }
  const esperado = potenciaKwp * hspRegiao * diasNoMes * PERFORMANCE_RATIO;
  const pct = Math.round(((kwhDigitado - esperado) / esperado) * 100);
  if (pct <= -15) return { status: 'baixo', pctDesvio: pct, sugestao: `${Math.abs(pct)}% abaixo do esperado — vale oferecer limpeza ou checar o sistema.` };
  if (pct >= 15) return { status: 'alto', pctDesvio: pct, sugestao: `${pct}% acima do esperado — ótimo mês, tudo certo.` };
  return { status: 'ok', pctDesvio: pct, sugestao: 'Dentro do esperado ✅.' };
}

export function statusAgendaItem(dataAgendada: string | null, hoje: Date, janelaDias = 30): 'vencida' | 'proxima' | 'ok' {
  if (!dataAgendada) return 'ok';
  const d = new Date(dataAgendada + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return 'ok';
  const hojeUtc = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const dias = Math.round((d.getTime() - hojeUtc) / 86400000);
  if (dias < 0) return 'vencida';
  if (dias <= janelaDias) return 'proxima';
  return 'ok';
}

export interface ItemAgenda { data_agendada: string | null }
// Vencidas primeiro; dentro do grupo, data mais antiga sobe.
export function ordenarAgenda<T extends ItemAgenda>(itens: T[], hoje: Date): T[] {
  const peso = (i: T) => (statusAgendaItem(i.data_agendada, hoje) === 'vencida' ? 0 : 1);
  const t = (i: T) => (i.data_agendada ? new Date(i.data_agendada + 'T00:00:00Z').getTime() : Infinity);
  return [...itens].sort((a, b) => peso(a) - peso(b) || t(a) - t(b));
}

// Empurrão mensal: SÓ usina sem API que ainda não teve leitura manual no mês corrente.
export function precisaLeituraDoMes(temApi: boolean, ultimaLeituraManualISO: string | null, hoje: Date): boolean {
  if (temApi) return false;
  if (!ultimaLeituraManualISO) return true;
  const d = new Date(ultimaLeituraManualISO);
  if (Number.isNaN(d.getTime())) return true;
  return !(d.getUTCFullYear() === hoje.getUTCFullYear() && d.getUTCMonth() === hoje.getUTCMonth());
}
