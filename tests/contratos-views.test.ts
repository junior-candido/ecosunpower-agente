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

  it('sem busca: abre com a LISTA de clientes recentes (não caixa cega)', () => {
    const html = renderContratosPage({
      q: '', buscou: false, resultados: [], tipos,
      recentes: [{ leadId: 'l1', nome: 'Lucas Azevedo', status: 'contrato_assinado' }],
    });
    expect(html).toContain('Clientes recentes');
    expect(html).toContain('Lucas Azevedo');
    // clicar no cliente abre o FORMULÁRIO do contrato daquele lead
    expect(html).toContain('/dashboard/leads/l1/contrato-form');
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

  it('mantém o leitor de conta+CNH (IA lê documentos) no card do cliente', () => {
    const html = renderContratosPage({
      q: 'Lucas', buscou: true, tipos, recentes: [],
      resultados: [{ leadId: 'l1', nome: 'Lucas', status: null }],
    });
    expect(html).toContain('/dashboard/leads/l1/ler-documentos');
  });
});
