// tests/monitoramento-dashboard-7d.test.ts
import { describe, it, expect } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

function fakeSupabase(sistemas: any[], geracoes: any[]) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          const q: any = {
            _t: tabela,
            select() { return q; },
            eq() { return q; },
            in() { return q; },
            gte() { return q; },
            order() { return q; },
            range() { return q; },
            then(res: any) {
              if (tabela === 'sistemas_clientes') return res({ data: sistemas, error: null });
              return res({ data: geracoes, error: null });
            },
          };
          return q;
        },
      };
    },
  } as any;
}

describe('listarParaDashboard inclui geracao_7d_kwh', () => {
  // 29/07: a janela 7d NÃO conta o dia de HOJE (parcial). De manhã cedo o
  // "hoje" quase-zero puxava a soma pra baixo e acendia queda falsa no
  // radar — o print do Thiago era às 8h da manhã. Hoje segue nos campos
  // geracao_hoje_kwh e geracao_mes_kwh, só sai da régua de 7 dias.
  it('soma janela 7d = 7 dias COMPLETOS, sem o hoje parcial', async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const ha5 = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
    const svc = new MonitoringService(fakeSupabase(
      [{ id: 's1', apelido: 'A', marca_inversor: 'deye', ativo: true, potencia_kwp: 10, uf: 'DF' }],
      [
        { sistema_id: 's1', data: hoje, geracao_kwh: 8 },
        { sistema_id: 's1', data: ha5, geracao_kwh: 20 },
      ],
    ));
    const rows = await svc.listarParaDashboard();
    expect(rows[0].geracao_hoje_kwh).toBe(8);   // hoje continua no campo dele
    expect(rows[0].geracao_7d_kwh).toBe(20);    // ...mas fora da janela 7d
  });
});
