// src/modules/dashboard/pos-venda-resumo-diario.ts
// Resumo diário do pós-venda no zap do Junior (incremento 2 da memória de
// relacionamento). Puras: janela 17h-18h BRT, início do dia BRT e montagem do
// texto. O runner de I/O (rodarResumoDiario) fica no fim do arquivo.
// Spec: docs/superpowers/specs/2026-07-02-pos-venda-resumo-diario-design.md
import type { SupabaseClient } from '@supabase/supabase-js';
import { listarClientesPosVenda } from './pos-venda-queries.js';
import { sugestaoProativa } from './pos-venda-sugestao.js';

// Mesmo padrão Intl da janela geral (proactive-alerts/janela.ts): BRT sem DST.
function horaBrt(d: Date, tz: string): { dow: number; totalMin: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dow: dowMap[weekday] ?? -1, totalMin: (hour === 24 ? 0 : hour) * 60 + minute };
}

// Fim do dia: 17h-18h BRT, segunda a sábado (domingo a janela geral é fechada).
export function dentroDaJanelaResumo(d: Date, tz = 'America/Sao_Paulo'): boolean {
  const { dow, totalMin } = horaBrt(d, tz);
  if (dow === 0) return false;
  return totalMin >= 17 * 60 && totalMin < 18 * 60;
}

// 00:00 BRT do dia de `d` em ISO UTC (= 03:00Z; BRT é UTC-3 fixo desde 2019).
// Usado no CAS "só 1 resumo por dia".
export function inicioDoDiaBrt(d: Date): string {
  const diaBrt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d); // YYYY-MM-DD
  return `${diaBrt}T03:00:00.000Z`;
}

export interface ItemResumo { nome: string; tipo: string }

// Ordem de exibição = prioridade do motor (sugestaoProativa).
const GRUPOS: Array<{ tipo: string; rotulo: string }> = [
  { tipo: 'queda', rotulo: '📉 Queda' },
  { tipo: 'contato', rotulo: '📞 Sem falar há tempo' },
  { tipo: 'geracao_saudavel', rotulo: '☀️ Boa notícia pra dar' },
  { tipo: 'upgrade', rotulo: '🔋 Upgrade' },
];
const MAX_NOMES = 3;

const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] || nome;

// null = nada a dizer (não manda). Texto simples, sem botões — ação no painel.
export function montarResumoDiario(itens: ItemResumo[], linkPainel: string): string | null {
  if (itens.length === 0) return null;
  const linhas: string[] = [];
  const n = itens.length;
  linhas.push(`☀️ *Resumo das usinas — ${n} ${n === 1 ? 'pede' : 'pedem'} atenção*`);
  for (const g of GRUPOS) {
    const doGrupo = itens.filter((i) => i.tipo === g.tipo);
    if (doGrupo.length === 0) continue;
    const nomes = doGrupo.slice(0, MAX_NOMES).map((i) => primeiroNome(i.nome)).join(', ');
    const resto = doGrupo.length > MAX_NOMES ? ` (+${doGrupo.length - MAX_NOMES})` : '';
    linhas.push(`${g.rotulo}: ${nomes}${resto}`);
  }
  linhas.push(`👉 Resolver no painel: ${linkPainel}`);
  return linhas.join('\n');
}
