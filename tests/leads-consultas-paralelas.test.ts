// Lista de Leads — consultas independentes em PARALELO (perf/telas-leves, 28/09/2026).
// A página /dashboard/leads fazia ida-e-volta ao banco em fila: contagens →
// lista → cadência → tarefas (4 rodadas) e, junto, os "insights" em 5 rodadas.
// Cada rodada custa a latência inteira até o Supabase. Mesmo resultado, menos espera.
import { describe, it, expect } from 'vitest';
import { listLeads } from '../src/modules/dashboard/leads-queries.js';
import { buildLeadsInsights } from '../src/modules/dashboard/ai-summary.js';

interface Consulta { tabela: string; chamadas: Array<[string, unknown[]]> }

/** Cliente falso: todo builder é encadeável; `await` resolve num tick. Conta ONDAS
 *  (rodadas de ida-e-volta): consulta que começa com nada em voo abre uma onda nova. */
function clienteFalso(resposta: (c: Consulta) => { data?: unknown; count?: number | null }) {
  let emVoo = 0;
  const estado = { ondas: 0, consultas: [] as Consulta[] };
  const from = (tabela: string) => {
    const c: Consulta = { tabela, chamadas: [] };
    estado.consultas.push(c);
    const builder: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (ok: (v: unknown) => void, erro: (e: unknown) => void) => {
            if (emVoo === 0) estado.ondas++;
            emVoo++;
            setTimeout(() => { emVoo--; try { ok({ error: null, data: null, count: null, ...resposta(c) }); } catch (e) { erro(e); } }, 5);
          };
        }
        return (...args: unknown[]) => { c.chamadas.push([prop, args]); return builder; };
      },
    });
    return builder;
  };
  return { client: { from } as never, estado };
}

const temChamada = (c: Consulta, metodo: string) => c.chamadas.some(([m]) => m === metodo);
const selectDe = (c: Consulta) => String(c.chamadas.find(([m]) => m === 'select')?.[1][0] ?? '');

const LEAD = { id: 'l1', phone: '5561999990001', name: 'Ana Exemplo', status: 'novo', acquisition_source: null, eva_active: true, opt_out: false,
  maintenance_client: false, created_at: new Date().toISOString(), updated_at: new Date(Date.now() - 3 * 86400_000).toISOString(),
  installation_status: null, archived_at: null, loss_reason: null, loss_notes: null, lost_at: null, claimed_by: null };

function respostaLeads(c: Consulta) {
  if (c.tabela === 'leads' && selectDe(c).includes('phone')) return { data: [LEAD], count: 1 };
  if (c.tabela === 'leads') return { count: 2 };
  if (c.tabela === 'eva_cadence') return { data: [] };
  if (c.tabela === 'lead_tarefas') return { data: [{ lead_id: 'l1', due_at: new Date(Date.now() - 3600_000).toISOString(), status: 'pendente' }] };
  return { data: [] };
}

describe('listLeads — rodadas ao banco', () => {
  it('contagens e lista na MESMA rodada; cadência e tarefas na seguinte (2 rodadas, antes 4)', async () => {
    const { client, estado } = clienteFalso(respostaLeads);
    const r = await listLeads(client, { limit: 10 });
    expect(estado.ondas).toBe(2);
    // mesmo resultado de sempre
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ id: 'l1', alerta: 'silente_sem_cadencia', has_cadence_pending: false, seloSla: 'vermelho' });
    expect(r.total).toBe(1);
    expect(r.atencaoCount).toBe(1);
    expect(r.countByStatus.perdido).toBe(2);
    expect(r.countByStatus.ganhos).toBe(2);
  });

  it('lista vazia: não consulta cadência nem tarefas (como antes)', async () => {
    const { client, estado } = clienteFalso((c) => (c.tabela === 'leads' && selectDe(c).includes('phone') ? { data: [], count: 0 } : { count: 0 }));
    const r = await listLeads(client, {});
    expect(r.rows).toEqual([]);
    expect(estado.ondas).toBe(1);
    expect(estado.consultas.some((c) => c.tabela === 'eva_cadence' || c.tabela === 'lead_tarefas')).toBe(false);
  });

  it('tarefas falhando (exceção) continua best-effort: selo verde, sem derrubar a página', async () => {
    const { client } = clienteFalso((c) => { if (c.tabela === 'lead_tarefas') throw new Error('caiu'); return respostaLeads(c); });
    const r = await listLeads(client, {});
    expect(r.rows[0].seloSla).toBe('verde');
    expect(r.atencaoCount).toBe(0);
  });
});

describe('buildLeadsInsights — rodadas ao banco', () => {
  function resposta(c: Consulta) {
    if (c.tabela === 'leads' && temChamada(c, 'lt')) return { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }; // silentes
    if (c.tabela === 'leads' && selectDe(c) === 'loss_reason') return { data: [{ loss_reason: 'concorrente' }, { loss_reason: 'concorrente' }, { loss_reason: 'outro' }] };
    if (c.tabela === 'leads' && temChamada(c, 'in')) return { count: 3 }; // ganhos 30d
    if (c.tabela === 'leads') return { count: 12 }; // novos 24h / criados 30d
    if (c.tabela === 'eva_cadence' && temChamada(c, 'in')) return { data: [{ lead_id: 'a' }] };
    if (c.tabela === 'eva_cadence') return { count: 7 };
    return {};
  }

  it('mesmos insights, na MESMA ordem, em até 2 rodadas (antes 6)', async () => {
    const { client, estado } = clienteFalso(resposta);
    const ins = await buildLeadsInsights(client);
    expect(ins.map((i) => i.emoji)).toEqual(['🆕', '📈', '🎯', '😴', '⏰']);
    expect(ins[0].text).toBe('12 lead(s) novo(s) nas últimas 24h.');
    expect(ins[1].text).toBe('Conversion rate últimos 30d: 25.0% (3 ganhos de 12 leads).');
    expect(ins[2].text).toContain('concorrente (67% de 3 perdas)');
    expect(ins[3].text).toBe('3 lead(s) silente(s) há mais de 24h sem cadência agendada. Agende ou descarte.');
    expect(ins[4].text).toBe('7 toque(s) de cadência passaram do horário. Cron pode estar travado.');
    // tudo sai junto; só a checagem de cadência dos silentes espera a lista deles
    // (e ela corre enquanto as outras ainda estão em voo)
    expect(estado.ondas).toBeLessThanOrEqual(2);
  });
});
