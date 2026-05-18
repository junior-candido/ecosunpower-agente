// tests/monitoramento-render.test.ts
import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage, renderLayout } from '../src/modules/dashboard/views.js';

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

  it('SEGURANÇA: nome com apóstrofo não quebra o confirm de exclusão (sem &#039; em onsubmit)', () => {
    const perigosa = [{
      ...rows[0], id: '9', apelido: "Bar do Z'é D'Ávila", nivel: 'urgente',
    }] as any[];
    const html = renderMonitoramentoPage(perigosa, {});
    // Nenhum atributo onsubmit pode conter &#039; (decodificaria pra ' e
    // terminaria a string JS do confirm -> exclusão destrutiva sem confirmação).
    const onsubmits = html.match(/onsubmit="[^"]*"/g) ?? [];
    expect(onsubmits.length).toBeGreaterThan(0);
    for (const os of onsubmits) {
      expect(os).not.toContain('&#039;');
    }
    // Double-confirm (D1a) preservado, agora genérico.
    expect(html).toContain('Confirma de novo: excluir esta usina permanentemente?');
  });
});

describe('renderLayout tema escuro ESCOPADO (regressão fix)', () => {
  it('SEM dark: <body> CLARO (classe só ecosun-body) — não quebra Leads/Propostas/etc', () => {
    const html = renderLayout({ active: 'leads', title: 'Leads', body: '<p>oi</p>' } as any);
    const bodyClass = (html.match(/<body class="([^"]*)"/) ?? [])[1] ?? '';
    expect(bodyClass).toBe('ecosun-body'); // sem dark, sem bg-slate-950
    expect(html).toContain('#f8fafc'); // CSS claro presente
    expect(html).toContain('<p>oi</p>');
  });

  it('COM dark:true: fundo escuro (ecosun-body-dark + bg-slate-950)', () => {
    const html = renderLayout({ active: 'monitoramento', title: 'X', body: '<p>oi</p>', dark: true } as any);
    expect(html).toContain('ecosun-body-dark');
    expect(html).toContain('bg-slate-950');
    expect(html).toContain('<p>oi</p>');
  });

  it('a tela Painel de Triagem (renderMonitoramentoPage) sai escura por padrão', () => {
    expect(renderMonitoramentoPage([], {})).toContain('ecosun-body-dark');
  });
});
