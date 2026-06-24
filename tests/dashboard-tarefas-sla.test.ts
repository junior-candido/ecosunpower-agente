import { describe, it, expect } from 'vitest';
import { tarefasFaltantes } from '../src/modules/dashboard/tarefas.js';

describe('tarefasFaltantes — idempotência por (tipo, etapa)', () => {
  const etapa = 'proposta_enviada';
  const regras = [{ tipo: 'cobrar_proposta', titulo: 'x', due_at: '2026-06-27T00:00:00Z', prioridade: 'alta' as const }];
  it('cria quando não existe pendente do mesmo tipo+etapa', () => {
    expect(tarefasFaltantes(regras, [], etapa).map(t => t.tipo)).toEqual(['cobrar_proposta']);
  });
  it('NÃO duplica quando já há pendente do mesmo tipo+etapa', () => {
    const existentes = [{ tipo: 'cobrar_proposta', etapa_origem: etapa, status: 'pendente' }];
    expect(tarefasFaltantes(regras, existentes, etapa)).toEqual([]);
  });
  it('recria se a anterior foi concluída (não está mais pendente)', () => {
    const existentes = [{ tipo: 'cobrar_proposta', etapa_origem: etapa, status: 'concluida' }];
    expect(tarefasFaltantes(regras, existentes, etapa).length).toBe(1);
  });
});
