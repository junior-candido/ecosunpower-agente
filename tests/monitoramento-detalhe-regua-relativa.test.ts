// tests/monitoramento-detalhe-regua-relativa.test.ts
// Régua relativa no DETALHE da usina (29/07): o card da lista e a página de
// detalhe precisam contar a MESMA história. Julho nublado no RJ derrubou a
// carteira inteira do tenant — o detalhe não pode dizer "49% ABAIXO" numa
// usina que está colada na mediana das irmãs.
import { describe, it, expect } from 'vitest';
import { MonitoringService } from '../src/modules/monitoring/service.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diasAtras = (n: number) => iso(new Date(Date.now() - n * 864e5));

// Fake com filtros de verdade (eq/in) — o detalhe busca 1 sistema e a
// mediana busca a frota; sem filtrar, a geração de todo mundo vazaria
// pro cálculo do detalhe.
function fakeSupabase(sistemas: any[], geracoes: any[]) {
  return {
    getClient() {
      return {
        from(tabela: string) {
          const flt: Record<string, any> = {};
          const q: any = {
            select() { return q; },
            eq(col: string, v: any) { flt[col] = v; return q; },
            in(col: string, arr: any[]) { flt[`in_${col}`] = arr; return q; },
            gte() { return q; },
            order() { return q; },
            range() { return q; },
            maybeSingle() {
              const row = sistemas.find((s) => s.id === flt.id) ?? null;
              return Promise.resolve({ data: row, error: null });
            },
            then(res: any) {
              if (tabela === 'sistemas_clientes') {
                let rows = sistemas.filter((s) => flt.ativo === undefined || s.ativo === flt.ativo);
                if (flt.company_id) rows = rows.filter((s) => s.company_id === flt.company_id);
                return res({ data: rows, error: null });
              }
              let rows = geracoes;
              if (flt.sistema_id) rows = rows.filter((g) => g.sistema_id === flt.sistema_id);
              if (flt.in_sistema_id) rows = rows.filter((g) => flt.in_sistema_id.includes(g.sistema_id));
              return res({ data: rows, error: null });
            },
          };
          return q;
        },
      };
    },
  } as any;
}

const COMPANY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function montarFrota() {
  // 6 usinas de 5 kWp no RJ, todas gerando ~8,6 kWh/dia (60 kWh em 7 dias).
  // Régua HSP: esperado7 = 5×4,8×0,8×7 = 134,4 → 60/134,4 = 45% → acusaria queda.
  // Mediana da carteira: todo mundo igual → spec = mediana → saudável.
  const sistemas = Array.from({ length: 6 }, (_, i) => ({
    id: `s${i + 1}`, apelido: `Usina ${i + 1}`, marca_inversor: 'nep',
    ativo: true, ultimo_erro: null, potencia_kwp: 5, uf: 'RJ',
    company_id: COMPANY, data_instalacao: '2025-01-01',
  }));
  const geracoes: any[] = [];
  for (const s of sistemas) {
    for (let n = 7; n >= 1; n--) {
      geracoes.push({ sistema_id: s.id, data: diasAtras(n), geracao_kwh: 60 / 7 });
    }
  }
  return { sistemas, geracoes };
}

describe('getDetalheSistema com régua relativa à carteira', () => {
  it('usina na mediana da carteira → SEM alerta de queda (a régua HSP acusaria 55%)', async () => {
    const { sistemas, geracoes } = montarFrota();
    const svc = new MonitoringService(fakeSupabase(sistemas, geracoes));
    const det = await svc.getDetalheSistema('s1', {});
    const tipos = (det?.alertas ?? []).map((a: any) => a.tipo);
    expect(tipos).not.toContain('queda_geracao');
  });

  it('usina de fato ruim continua acusando no detalhe, com texto vs carteira', async () => {
    const { sistemas, geracoes } = montarFrota();
    // s1 despenca: só 20% do que as irmãs geram
    for (const g of geracoes) {
      if (g.sistema_id === 's1') g.geracao_kwh = (60 / 7) * 0.2;
    }
    const svc = new MonitoringService(fakeSupabase(sistemas, geracoes));
    const det = await svc.getDetalheSistema('s1', {});
    const queda = (det?.alertas ?? []).find((a: any) => a.tipo === 'queda_geracao');
    expect(queda).toBeDefined();
    expect(queda!.texto).toContain('abaixo da média da carteira');
  });

  it('janela de 7 dias do detalhe ignora o hoje parcial (kpi ratioUltimos7)', async () => {
    const { sistemas, geracoes } = montarFrota();
    // hoje de manhã: 0,5 kWh — não pode diluir a média dos 7 dias completos
    geracoes.push({ sistema_id: 's1', data: iso(new Date()), geracao_kwh: 0.5 });
    const svc = new MonitoringService(fakeSupabase(sistemas, geracoes));
    const det = await svc.getDetalheSistema('s1', {});
    // esperado7 = 134,4; sem o hoje: 60/134,4 ≈ 0,446. Com o hoje contaria 60,5.
    expect(det!.kpis.ratioUltimos7).toBeCloseTo(60 / 134.4, 3);
  });
});
