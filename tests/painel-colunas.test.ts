// tests/painel-colunas.test.ts
//
// Painel de Operação em COLUNAS POR STATUS (referência que o Thiago mandou
// 27/07; "vamos fazer algo melhor" — Junior). 4 colunas com contagem e kWp
// somado no cabeçalho; mini-cards clicáveis com marca, kWp e GERAÇÃO DE HOJE
// (o "melhor": a referência só mostrava potência). Substitui a seção antiga
// "Precisa de ação". Funciona nas DUAS paletas (claro tenant / escuro EcoSun).

import { describe, it, expect } from 'vitest';
import { renderMonitoramentoPage } from '../src/modules/dashboard/views.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

const ROWS = [
  { id: '11111111-1111-1111-1111-111111111111', apelido: 'Usina Falhada', cidade: 'Niterói', uf: 'RJ', potencia_kwp: 5, geracao_hoje_kwh: 0, geracao_mes_kwh: 0, nivel: 'urgente', alertaTexto: 'Sem geração há 7 dias.', garantiaIdade: '—', garantiaEcosun: 'indefinida', ativo: true, marca_inversor: 'goodwe', ultima_sincronizacao: null },
  { id: '22222222-2222-2222-2222-222222222222', apelido: 'Usina Atencao', cidade: 'Maricá', uf: 'RJ', potencia_kwp: 10, geracao_hoje_kwh: 12.3, geracao_mes_kwh: 300, nivel: 'aviso', alertaTexto: 'Queda 30%.', garantiaIdade: '1 ano', garantiaEcosun: 'indefinida', ativo: true, marca_inversor: 'foxess', ultima_sincronizacao: new Date().toISOString() },
  { id: '33333333-3333-3333-3333-333333333333', apelido: 'Usina Saudavel', cidade: 'Rio de Janeiro', uf: 'RJ', potencia_kwp: 8, geracao_hoje_kwh: 30.5, geracao_mes_kwh: 800, nivel: 'ok', alertaTexto: null, garantiaIdade: '2 anos', garantiaEcosun: 'indefinida', ativo: true, marca_inversor: 'nep', ultima_sincronizacao: new Date().toISOString() },
  { id: '44444444-4444-4444-4444-444444444444', apelido: 'Usina Sem Dados', cidade: null, uf: null, potencia_kwp: 6, geracao_hoje_kwh: null, geracao_mes_kwh: 0, nivel: 'ok', alertaTexto: null, garantiaIdade: '—', garantiaEcosun: 'indefinida', ativo: true, marca_inversor: 'foxess', ultima_sincronizacao: null },
] as never[];

const THIAGO = {
  id: 'u1', companyId: 'aaaa1111-2222-3333-4444-555566667777',
  nome: 'Thiago', login: 'thiago-sabion', isAdmin: false,
  roleNome: 'Monitoramento', permissoes: { usinas: ['visualizar' as const] },
  companyNome: 'SunBright',
};

const JUNIOR = { ...THIAGO, id: 'u2', companyId: ECOSUN, login: 'junior', companyNome: undefined };

describe('painel de operação em colunas por status', () => {
  it('tem as 4 colunas com contagem no cabeçalho', () => {
    const html = renderMonitoramentoPage(ROWS, {}, undefined, undefined, undefined, THIAGO);
    expect(html).toContain('coluna-status');
    expect(html).toContain('Falha');
    expect(html).toContain('Atenção');
    expect(html).toContain('Gerando OK');
    expect(html).toContain('Aguardando dados');
  });

  it('mini-card traz geração de hoje (o melhor que a referência)', () => {
    const html = renderMonitoramentoPage(ROWS, {}, undefined, undefined, undefined, THIAGO);
    expect(html).toContain('card-usina');
    expect(html).toContain('30.5');
    expect(html).toContain('Usina Saudavel');
  });

  it('usina sem sync recente cai em Aguardando dados', () => {
    const html = renderMonitoramentoPage(ROWS, {}, undefined, undefined, undefined, THIAGO);
    // ÚLTIMA ocorrência: o rótulo aparece também na legenda da órbita
    const aguardando = html.split('Aguardando dados').pop() ?? '';
    expect(aguardando).toContain('Usina Sem Dados');
  });

  it('board também aparece no painel escuro da EcoSun', () => {
    const html = renderMonitoramentoPage(ROWS, {}, undefined, undefined, undefined, JUNIOR);
    expect(html).toContain('coluna-status');
    expect(html).toContain('Gerando OK');
  });
});

describe('órbita da frota — assinatura futurista (pedido do Junior 27/07)', () => {
  it('renderiza a órbita com um ponto clicável por usina ativa', () => {
    const html = renderMonitoramentoPage(ROWS, {}, undefined, undefined, undefined, THIAGO);
    expect(html).toContain('orbita-frota');
    // 4 usinas ativas = 4 pontos (âncoras pro detalhe dentro do SVG)
    const pontos = html.match(/class="ponto-usina"/g) ?? [];
    expect(pontos.length).toBe(4);
    expect(html).toContain('Cada ponto é uma usina');
  });

  it('o sol central mostra a geração de hoje somada', () => {
    const html = renderMonitoramentoPage(ROWS, {}, undefined, undefined, undefined, THIAGO);
    // 0 + 12.3 + 30.5 = 42.8 kWh — dentro do sol, não só no KPI de cima
    const sol = html.split('sol-central')[1] ?? '';
    expect(sol).toContain('42.8');
  });

  it('órbita também no escuro da EcoSun', () => {
    const html = renderMonitoramentoPage(ROWS, {}, undefined, undefined, undefined, JUNIOR);
    expect(html).toContain('orbita-frota');
  });
});
