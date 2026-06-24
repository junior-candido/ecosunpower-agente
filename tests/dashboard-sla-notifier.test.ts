import { describe, it, expect } from 'vitest';
import { montarAvisoSla } from '../src/modules/dashboard/sla-notifier.js';

describe('montarAvisoSla', () => {
  it('monta texto com o nome do lead e o título da tarefa', () => {
    const a = montarAvisoSla('Fernanda', { id: 't1', titulo: 'Cobrar retorno da proposta' });
    expect(a.texto).toContain('Fernanda');
    expect(a.texto).toContain('Cobrar retorno da proposta');
  });
  it('tem 3 botões com ids sla_<acao>:<id>', () => {
    const a = montarAvisoSla('X', { id: 'abc', titulo: 't' });
    expect(a.botoes.map(b => b.id)).toEqual(['sla_cobrar:abc', 'sla_eufalo:abc', 'sla_adiar:abc']);
  });
});
