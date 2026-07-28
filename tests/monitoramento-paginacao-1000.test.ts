// tests/monitoramento-paginacao-1000.test.ts
// Bug 28/07: o PostgREST (Supabase) corta qualquer resposta em 1000 linhas.
// Com a frota crescendo, a consulta de geracao_diaria da lista passou de 1000
// linhas na janela do mês → usinas ficavam com soma 0 → alerta "sem geração"
// FALSO com a usina viva. O serviço precisa buscar PAGINADO (range) até o fim.
import { describe, it, expect } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

const TETO = 1000; // teto real do PostgREST

// Fake que se comporta como o Supabase de verdade: resposta cortada em 1000
// linhas; .range(de, ate) abre a página pedida (também limitada ao teto).
function fakeSupabaseComTeto(sistemas: any[], geracoes: any[]) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          let de = 0;
          let ate = TETO - 1;
          const q: any = {
            select() { return q; },
            eq() { return q; },
            in() { return q; },
            gte() { return q; },
            order() { return q; },
            range(a: number, b: number) { de = a; ate = b; return q; },
            maybeSingle() {
              return Promise.resolve({ data: sistemas[0] ?? null, error: null });
            },
            then(res: any) {
              if (tabela === 'sistemas_clientes') return res({ data: sistemas, error: null });
              const fim = Math.min(ate + 1, de + TETO);
              return res({ data: geracoes.slice(de, fim), error: null });
            },
          };
          return q;
        },
      };
    },
  } as any;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diasAtras = (n: number) => iso(new Date(Date.now() - n * 864e5));

describe('geracao_diaria acima de 1000 linhas não pode zerar usina viva', () => {
  it('lista: usina cujas linhas caem depois da 1000ª ainda soma os 7 dias', async () => {
    // 1000 linhas da usina s1 ocupam a primeira página inteira…
    const geracoes = Array.from({ length: TETO }, () => (
      { sistema_id: 's1', data: diasAtras(1), geracao_kwh: 1 }
    ));
    // …e as linhas da s2 (usina VIVA) só existem na segunda página.
    geracoes.push(
      { sistema_id: 's2', data: diasAtras(1), geracao_kwh: 5 },
      { sistema_id: 's2', data: diasAtras(2), geracao_kwh: 8 },
    );
    const svc = new MonitoringService(fakeSupabaseComTeto(
      [
        { id: 's1', apelido: 'A', marca_inversor: 'deye', ativo: true, potencia_kwp: 10, uf: 'DF' },
        { id: 's2', apelido: 'B', marca_inversor: 'deye', ativo: true, potencia_kwp: 10, uf: 'DF' },
      ],
      geracoes,
    ));
    const rows = await svc.listarParaDashboard();
    const s2 = rows.find((r) => r.id === 's2')!;
    expect(s2.geracao_7d_kwh).toBe(13); // sem paginação vinha 0 → alerta falso
    expect(rows.find((r) => r.id === 's1')!.geracao_7d_kwh).toBe(TETO);
  });

  it('detalhe: histórico com mais de 1000 dias não vira "sem geração" falso', async () => {
    // 1005 linhas antigas (ordem crescente de data, como a consulta pede)…
    const geracoes: any[] = Array.from({ length: 1005 }, (_, i) => (
      { sistema_id: 's1', data: iso(new Date(Date.UTC(2023, 0, 1 + i))), geracao_kwh: 30 }
    ));
    // …e os últimos 7 dias GERANDO ficam depois da 1000ª linha (eram cortados).
    for (let n = 7; n >= 1; n--) {
      geracoes.push({ sistema_id: 's1', data: diasAtras(n), geracao_kwh: 40 });
    }
    const svc = new MonitoringService(fakeSupabaseComTeto(
      [{ id: 's1', apelido: 'A', marca_inversor: 'deye', ativo: true, ultimo_erro: null, potencia_kwp: 10, uf: 'DF' }],
      geracoes,
    ));
    const det = await svc.getDetalheSistema('s1', {});
    const tipos = (det?.alertas ?? []).map((a: any) => a.tipo);
    expect(tipos).not.toContain('sistema_offline');
  });
});
