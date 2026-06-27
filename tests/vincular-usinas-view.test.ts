import { describe, it, expect } from 'vitest';
import { renderVincularUsinasPage } from '../src/modules/dashboard/vincular-usinas-views.js';

describe('renderVincularUsinasPage', () => {
  it('lista os apelidos e pré-seleciona a sugestão', () => {
    const html = renderVincularUsinasPage({
      sugestoes: [{ usinaId: 'U1', apelido: 'José da Silva', leadSugeridoId: 'L1', leadSugeridoNome: 'José da Silva' }],
      leads: [{ id: 'L1', name: 'José da Silva' }, { id: 'L2', name: 'Maria Souza' }],
    });
    expect(html).toContain('José da Silva');
    expect(html).toContain('name="U1"');
    expect(html).toContain('value="L1" selected');
  });
  it('mostra aviso quando não há usinas pendentes', () => {
    const html = renderVincularUsinasPage({ sugestoes: [], leads: [] });
    expect(html).toContain('Nenhuma usina pendente');
  });
});
