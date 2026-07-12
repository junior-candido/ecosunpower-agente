// tests/pos-venda-elo-evento.test.ts
// Elo × Pós-venda / Relacionamento: quando o medidor é trocado (Junior marca
// medidor_trocado em scheduleOnMeterSwap), a etapa da obra/jornada do cliente
// muda e a casa "Pós-venda / Relacionamento" registra o evento
// 'relacionamento:etapa_obra' na espinha do Elo (best-effort — nunca derruba o
// fluxo de agendamento dos toques).
import { describe, it, expect } from 'vitest';
import { PostInstallService } from '../src/modules/post-install.js';

// Client Supabase falso: builder fluente que cobre o encadeamento usado em
// scheduleOnMeterSwap (select().eq().maybeSingle(), update().eq()[.eq()],
// insert()) e grava os inserts por tabela — só o registrarEvento do Elo escreve
// em 'eventos_elo'.
function makeSupabase(opts: { oldStatus?: string | null; eventosError?: boolean } = {}) {
  const inserts: Array<{ table: string; row: any }> = [];
  const updates: Array<{ table: string; row: any }> = [];
  const oldStatus = opts.oldStatus === undefined ? 'instalado' : opts.oldStatus;

  function builder(table: string) {
    const b: any = {
      _op: null as string | null,
      _row: null as any,
      select() { this._op = 'select'; return this; },
      update(row: any) { this._op = 'update'; this._row = row; return this; },
      insert(row: any) { inserts.push({ table, row }); this._op = 'insert'; this._row = row; return this; },
      eq() { return this; },
      is() { return this; },
      in() { return this; },
      maybeSingle() {
        return Promise.resolve({ data: { installation_status: oldStatus }, error: null });
      },
      then(resolve: any, reject: any) {
        if (this._op === 'update') updates.push({ table, row: this._row });
        const error = table === 'eventos_elo' && opts.eventosError ? { message: 'boom' } : null;
        return Promise.resolve({ error, data: null }).then(resolve, reject);
      },
    };
    return b;
  }

  return { inserts, updates, from: (t: string) => builder(t) };
}

function makeService(sb: any) {
  const anthropic: any = {}; // não usado em scheduleOnMeterSwap
  const sendText = async () => {};
  return new PostInstallService(sb as any, anthropic, sendText, 'https://g.link');
}

const eventos = (sb: ReturnType<typeof makeSupabase>) =>
  sb.inserts.filter((i) => i.table === 'eventos_elo').map((i) => i.row);

describe('Elo × Pós-venda: relacionamento:etapa_obra ao trocar o medidor', () => {
  it('emite relacionamento:etapa_obra com etapaAntiga/etapaNova após agendar os toques', async () => {
    const sb = makeSupabase({ oldStatus: 'instalado' });
    const svc = makeService(sb);

    await svc.scheduleOnMeterSwap('lead-1');

    // A operação de negócio aconteceu: status atualizado + toques agendados.
    expect(sb.updates.some((u) => u.table === 'leads' && u.row.installation_status === 'medidor_trocado')).toBe(true);
    expect(sb.inserts.some((i) => i.table === 'post_install_touches')).toBe(true);

    const evs = eventos(sb);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      tipo: 'relacionamento:etapa_obra',
      departamento: 'relacionamento',
      canal: 'sistema',
      origem: 'pos-venda',
      cliente_id: 'lead-1',
    });
    expect(evs[0].payload).toEqual({ etapaAntiga: 'instalado', etapaNova: 'medidor_trocado' });
  });

  it('etapaAntiga vira null quando não há status anterior conhecido', async () => {
    const sb = makeSupabase({ oldStatus: null });
    const svc = makeService(sb);

    await svc.scheduleOnMeterSwap('lead-2');

    const evs = eventos(sb);
    expect(evs).toHaveLength(1);
    expect(evs[0].payload).toEqual({ etapaAntiga: null, etapaNova: 'medidor_trocado' });
  });

  it('best-effort: erro ao gravar o evento NÃO derruba o agendamento', async () => {
    const sb = makeSupabase({ oldStatus: 'instalado', eventosError: true });
    const svc = makeService(sb);

    await expect(svc.scheduleOnMeterSwap('lead-3')).resolves.toBeUndefined();
    // Toques continuam agendados mesmo com o Elo falhando.
    expect(sb.inserts.some((i) => i.table === 'post_install_touches')).toBe(true);
  });
});
