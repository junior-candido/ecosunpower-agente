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
  // Só conta/renderiza tipos que os GRUPOS conhecem — um tipo novo/desconhecido
  // não pode inflar o cabeçalho sem aparecer em nenhuma linha.
  const gruposConhecidos = new Set(GRUPOS.map((g) => g.tipo));
  const conhecidos = itens.filter((i) => gruposConhecidos.has(i.tipo));
  if (conhecidos.length === 0) return null;
  const linhas: string[] = [];
  const n = conhecidos.length;
  linhas.push(`☀️ *Resumo das usinas — ${n} ${n === 1 ? 'pede' : 'pedem'} atenção*`);
  for (const g of GRUPOS) {
    const doGrupo = conhecidos.filter((i) => i.tipo === g.tipo);
    if (doGrupo.length === 0) continue;
    const nomes = doGrupo.slice(0, MAX_NOMES).map((i) => primeiroNome(i.nome)).join(', ');
    const resto = doGrupo.length > MAX_NOMES ? ` (+${doGrupo.length - MAX_NOMES})` : '';
    linhas.push(`${g.rotulo}: ${nomes}${resto}`);
  }
  linhas.push(`👉 Resolver no painel: ${linkPainel}`);
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// Runner de I/O — chamado pelo cron de 15 min do index (junto do dispatch).
// ---------------------------------------------------------------------------

const ECOSUN = '00000000-0000-0000-0000-000000000001';

export interface ResumoDeps {
  client: SupabaseClient;
  sendText: (to: string, text: string) => Promise<void>;
  adminPhone: string;
  dryRun: boolean;
}

// CAS: grava a marca SE ainda não mandou hoje (BRT). true = ganhou a vez.
async function marcarResumoEnviadoHoje(client: SupabaseClient, agora: Date): Promise<boolean> {
  const { data, error } = await client.from('monitoring_config')
    .update({ resumo_diario_enviado_em: agora.toISOString(), updated_at: agora.toISOString() })
    .eq('id', 1)
    .or(`resumo_diario_enviado_em.is.null,resumo_diario_enviado_em.lt.${inicioDoDiaBrt(agora)}`)
    .select('id');
  if (error) throw new Error(`marcarResumoEnviadoHoje: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function rodarResumoDiario(deps: ResumoDeps, agora: Date): Promise<void> {
  try {
    if (!dentroDaJanelaResumo(agora)) return;

    const linhas = await listarClientesPosVenda(deps.client, ECOSUN);
    const itens: ItemResumo[] = [];
    for (const l of linhas) {
      const s = sugestaoProativa(l, agora);
      if (s) itens.push({ nome: l.nome, tipo: s.tipo });
    }
    const base = (process.env.DASHBOARD_BASE_URL ?? 'https://dashboard.ecosunpower.eng.br').replace(/\/$/, '');
    const texto = montarResumoDiario(itens, `${base}/dashboard/pos-venda`);
    if (!texto) return; // dia sem nada = silêncio (e não consome a marca)

    if (deps.dryRun) {
      console.log(`[resumo-diario] DRY: mandaria pro Junior:\n${texto}`);
      return; // dry não marca — o resumo real sai quando o dry desligar
    }
    // Porteiro CAS ANTES do envio: nunca 2 resumos no mesmo dia.
    if (!(await marcarResumoEnviadoHoje(deps.client, agora))) {
      console.log('[resumo-diario] já enviado hoje — pulando');
      return;
    }
    await deps.sendText(deps.adminPhone, texto);
    console.log(`[resumo-diario] enviado (${itens.length} sugestões)`);
  } catch (err) {
    // Falha nunca derruba o ciclo dos outros crons; tenta no próximo (15 min).
    console.error('[resumo-diario] falhou:', (err as Error).message);
  }
}
