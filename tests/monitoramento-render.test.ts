// tests/monitoramento-render.test.ts
import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage } from '../src/modules/dashboard/views.js';

const rows = [
  { id: '1', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF', marca_inversor: 'deye',
    potencia_kwp: 10, geracao_hoje_kwh: 0, geracao_mes_kwh: 0, geracao_7d_kwh: 0,
    ativo: true, ultimo_erro: null, ultima_sincronizacao: null,
    nivel: 'urgente', alertaTexto: 'Sem geração há 5 dias. Verificar inversor / conexão WiFi.',
    garantiaIdade: '1 ano 2 meses', garantiaEcosun: 'encerrada há 2 meses' },
  { id: '2', apelido: 'Bar Rota', cidade: 'Correntina', uf: 'BA', marca_inversor: 'solaredge',
    potencia_kwp: 7, geracao_hoje_kwh: 25, geracao_mes_kwh: 400, geracao_7d_kwh: 150,
    ativo: true, ultimo_erro: null, ultima_sincronizacao: new Date().toISOString(),
    nivel: 'ok', alertaTexto: null, garantiaIdade: '3 meses', garantiaEcosun: 'vigente (9 meses)' },
] as any[];

describe('renderMonitoramentoPage (smoke)', () => {
  it('renderiza bloco de ação só com o urgente, lista com todos, e tema escuro', () => {
    const html = renderMonitoramentoPage(rows, {});
    expect(html).toContain('Precisa de ação');
    expect(html).toContain('Casa Silva');
    expect(html).toContain('Bar Rota');
    expect(html).toContain('Saúde da frota');
    expect(html).toContain('/dashboard/monitoramento/1/excluir');
    expect(html).toContain('1 ano 2 meses');
    expect(html).toContain('bg-slate-900');
  });
  it('lista vazia -> estado vazio', () => {
    expect(renderMonitoramentoPage([], {})).toContain('Nenhum sistema');
  });
});
