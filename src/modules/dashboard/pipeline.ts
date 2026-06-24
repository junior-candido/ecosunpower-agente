// src/modules/dashboard/pipeline.ts
// Etapas do funil comercial + avanço automático por evento. Puro (sem rede).
// Eva (atendimento) segue escrevendo novo/qualificando/qualificado/agendado/
// transferido; o SISTEMA seta proposta_enviada/negociacao/ganho via estes eventos.

export type EtapaFunil =
  | 'novo' | 'qualificando' | 'qualificado'
  | 'proposta_enviada' | 'negociacao' | 'agendado' | 'transferido' | 'ganho';

// Ordem do kanban (perdido é coluna terminal, tratada à parte).
export const ORDEM_ETAPAS: EtapaFunil[] = [
  'novo', 'qualificando', 'qualificado',
  'proposta_enviada', 'negociacao', 'agendado', 'transferido', 'ganho',
];

export type EventoFunil = 'proposta_gerada' | 'proposta_aberta' | 'agendou' | 'fechou';

// Para qual etapa cada evento empurra (sempre pra frente).
const ALVO_POR_EVENTO: Record<EventoFunil, EtapaFunil> = {
  proposta_gerada: 'proposta_enviada',
  proposta_aberta: 'negociacao',
  agendou: 'agendado',
  fechou: 'ganho',
};

// Etapa mínima que o lead deve ter para o evento ser aplicável.
// Se o lead ainda não chegou à origem, o evento não dispara.
const ORIGEM_POR_EVENTO: Record<EventoFunil, EtapaFunil> = {
  proposta_gerada: 'qualificado',
  proposta_aberta: 'proposta_enviada',
  agendou: 'qualificado',
  fechou: 'qualificado',
};

function idx(e: string): number {
  return ORDEM_ETAPAS.indexOf(e as EtapaFunil); // -1 quando não está na ordem (ex.: 'perdido')
}

// Retorna a nova etapa OU a mesma. Nunca recua. Lead 'perdido' não é mexido por
// estes eventos automáticos -> mantém.
export function proximaEtapaPorEvento(atual: string, evento: EventoFunil): EtapaFunil | string {
  const alvo = ALVO_POR_EVENTO[evento];
  if (!alvo) return atual;
  if (atual === 'perdido') return atual; // não ressuscita lead perdido automaticamente
  const origem = ORIGEM_POR_EVENTO[evento];
  // O lead precisa estar na origem mínima (ou além) para o evento ser aplicável.
  if (idx(atual) < idx(origem)) return atual;
  // Só avança, nunca recua.
  return idx(alvo) > idx(atual) ? alvo : (ORDEM_ETAPAS.includes(atual as EtapaFunil) ? atual : alvo);
}

const LABEL: Record<EtapaFunil, string> = {
  novo: 'Novo', qualificando: 'Qualificando', qualificado: 'Qualificado',
  proposta_enviada: 'Proposta enviada', negociacao: 'Negociação',
  agendado: 'Agendado', transferido: 'Transferido', ganho: 'Ganho',
};
export function etapaLabel(e: string): string {
  return LABEL[e as EtapaFunil] ?? (e === 'perdido' ? 'Perdido' : e);
}

// Classe Tailwind por etapa (reusa a paleta do statusBadge atual).
const COR: Record<string, string> = {
  novo: 'bg-sky-100 text-sky-800', qualificando: 'bg-violet-100 text-violet-800',
  qualificado: 'bg-fuchsia-100 text-fuchsia-800', proposta_enviada: 'bg-blue-100 text-blue-800',
  negociacao: 'bg-amber-100 text-amber-800', agendado: 'bg-orange-100 text-orange-800',
  transferido: 'bg-emerald-100 text-emerald-800', ganho: 'bg-emerald-200 text-emerald-900',
  perdido: 'bg-rose-100 text-rose-800',
};
export function etapaCor(e: string): string {
  return COR[e] ?? 'bg-slate-100 text-slate-700';
}
