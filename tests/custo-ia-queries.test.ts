import { describe, it, expect, vi } from 'vitest';
import { carregarDadosCustoIa } from '../src/modules/dashboard/custo-ia-queries.js';

const AGORA = new Date('2026-09-28T18:00:00.000Z');

// Builder falso: registra filtros e devolve páginas.
function fakeClient(tabelas: Record<string, any[] | Error>) {
  const chamadas: Array<{ tabela: string; ops: string[] }> = [];
  const client = {
    from(tabela: string) {
      const reg = { tabela, ops: [] as string[] };
      chamadas.push(reg);
      let de = 0; let ate = Infinity;
      const q: any = {
        select: (c: string) => { reg.ops.push(`select:${c}`); return q; },
        gte: (c: string, v: string) => { reg.ops.push(`gte:${c}:${v}`); return q; },
        eq: (c: string, v: string) => { reg.ops.push(`eq:${c}:${v}`); return q; },
        order: () => q,
        range: (a: number, b: number) => { de = a; ate = b; return q; },
        then: (ok: (r: any) => void) => {
          const t = tabelas[tabela];
          if (t instanceof Error) return ok({ data: null, error: { message: t.message } });
          return ok({ data: (t ?? []).slice(de, ate + 1), error: null });
        },
      };
      return q;
    },
  };
  return { client, chamadas };
}

describe('carregarDadosCustoIa', () => {
  it('pagina custos_ia_uso de 1000 em 1000 desde o início do mês anterior (BRT)', async () => {
    const muitas = Array.from({ length: 2500 }, (_, i) => ({ created_at: '2026-09-02T00:00:00Z', custo_cents: i }));
    const { client, chamadas } = fakeClient({ custos_ia_uso: muitas });
    const d = await carregarDadosCustoIa(client, AGORA);
    expect(d.linhas).toHaveLength(2500);
    const usos = chamadas.filter((c) => c.tabela === 'custos_ia_uso');
    expect(usos).toHaveLength(3);
    expect(usos[0].ops).toContain('gte:created_at:2026-08-01T03:00:00.000Z');
  });

  it('mensalidade = soma das assinaturas ATIVAS por empresa', async () => {
    const { client, chamadas } = fakeClient({
      assinaturas: [
        { company_id: 'AAAA0000-1111-4111-8111-222222222222', valor_centavos: 29700 },
        { company_id: 'aaaa0000-1111-4111-8111-222222222222', valor_centavos: 5700 },
        { company_id: null, valor_centavos: 999 },
      ],
    });
    const d = await carregarDadosCustoIa(client, AGORA);
    expect(d.mensalidades.get('aaaa0000-1111-4111-8111-222222222222')).toBe(35400);
    expect(d.mensalidades.size).toBe(1);
    expect(chamadas.find((c) => c.tabela === 'assinaturas')!.ops).toContain('eq:status:ativa');
  });

  it('leads atendidos vêm só do evento "a assistente respondeu"', async () => {
    const { client, chamadas } = fakeClient({ eventos_elo: [{ company_id: null, lead_id: 'x', created_at: '2026-09-02T00:00:00Z' }] });
    const d = await carregarDadosCustoIa(client, AGORA);
    expect(d.atendidos).toHaveLength(1);
    expect(chamadas.find((c) => c.tabela === 'eventos_elo')!.ops).toContain('eq:tipo:atendimento:eva_respondeu');
  });

  it('fonte fora do ar não derruba a tela (vira vazio)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = fakeClient({ custos_ia_uso: new Error('fora'), companies: new Error('fora') });
    const d = await carregarDadosCustoIa(client, AGORA);
    expect(d.linhas).toEqual([]);
    expect(d.empresas).toEqual([]);
  });
});
