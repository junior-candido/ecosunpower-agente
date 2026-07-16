// tests/contratos-views.test.ts — a Central de Contratos abre com LISTA + criar
// manual (não é caixa de busca cega), e o caminho manual não depende de IA.
import { describe, it, expect } from 'vitest';
import { renderContratosPage } from '../src/modules/dashboard/contratos-views.js';

const tipos = [{ tipo: 'fv', nome: 'Sistema Fotovoltaico', emoji: '🔆', descricao: 'contrato do sistema' }];

describe('renderContratosPage — Central de Contratos', () => {
  it('tem o botão "Criar contrato manual" apontando pra rota que não depende de IA', () => {
    const html = renderContratosPage({ q: '', buscou: false, resultados: [], recentes: [], tipos });
    expect(html).toContain('Criar contrato manual');
    expect(html).toContain('action="/dashboard/contratos/novo"');
  });

  it('sem busca: dropdown pra escolher cliente + os 2 contratos fechados como card rápido', () => {
    const html = renderContratosPage({
      q: '', buscou: false, resultados: [], tipos,
      recentes: [{ leadId: 'l1', nome: 'Edmilson', status: 'contrato_assinado' }, { leadId: 'l2', nome: 'Antonio Alcântara', status: 'instalado' }],
    });
    // dropdown (lista suspensa) de clientes
    expect(html).toContain('<select name="lead"');
    expect(html).toContain('Edmilson');
    // os 2 últimos fechados como acesso rápido
    expect(html).toContain('Últimos contratos fechados');
    expect(html).toContain('/dashboard/leads/l1/contrato-form');
  });

  it('cliente selecionado (?lead): mostra a BARRA DE AÇÕES dele (não card por cliente)', () => {
    const html = renderContratosPage({
      q: '', buscou: false, resultados: [], recentes: [], tipos, tipoSel: 'fv',
      selecionado: { leadId: 'l9', nome: 'Lucas Azevedo', status: 'contrato_assinado' },
    });
    // ações direto na barra, sem abrir o formulário antes
    expect(html).toContain('/dashboard/leads/l9/ler-documentos');
    expect(html).toContain('/dashboard/leads/l9/contrato-form?tipo=fv');
    expect(html).toContain('/dashboard/leads/l9/contrato.pdf?tipo=fv');
    expect(html).toContain('/dashboard/leads/l9/salvar-drive');
  });

  it('a busca é por nome OU telefone (não só nome)', () => {
    const html = renderContratosPage({ q: '', buscou: false, resultados: [], recentes: [], tipos });
    expect(html.toLowerCase()).toContain('telefone');
  });

  it('busca sem resultado: mensagem clara (e o manual continua disponível acima)', () => {
    const html = renderContratosPage({ q: 'Zzz', buscou: true, resultados: [], recentes: [], tipos });
    expect(html).toContain('Nenhum cliente');
    expect(html).toContain('Criar contrato manual');
  });

  it('não falha calado: mostra aviso quando o criar manual não deu (faltou/erro)', () => {
    const faltou = renderContratosPage({ q: '', buscou: false, resultados: [], recentes: [], tipos, novoResultado: 'faltou' });
    expect(faltou).toContain('nome');
    expect(faltou.toLowerCase()).toContain('telefone');
    const erro = renderContratosPage({ q: '', buscou: false, resultados: [], recentes: [], tipos, novoResultado: 'erro' });
    expect(erro).toContain('Não consegui criar');
  });

  it('busca popula o dropdown com os resultados (nome/telefone)', () => {
    const html = renderContratosPage({
      q: 'Lucas', buscou: true, tipos, recentes: [],
      resultados: [{ leadId: 'l1', nome: 'Lucas', status: null }],
    });
    expect(html).toContain('<select name="lead"');
    expect(html).toContain('value="l1"');
    expect(html).toContain('resultado(s) pra');
  });
});
