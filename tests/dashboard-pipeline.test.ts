import { describe, it, expect } from 'vitest';
import {
  ORDEM_ETAPAS,
  proximaEtapaPorEvento,
  etapaLabel,
  type EtapaFunil,
  type EventoFunil,
} from '../src/modules/dashboard/pipeline.js';

describe('pipeline — avanço por evento (só pra frente)', () => {
  it('proposta gerada move qualificado -> proposta_enviada', () => {
    expect(proximaEtapaPorEvento('qualificado', 'proposta_gerada')).toBe('proposta_enviada');
  });
  it('proposta aberta move proposta_enviada -> negociacao', () => {
    expect(proximaEtapaPorEvento('proposta_enviada', 'proposta_aberta')).toBe('negociacao');
  });
  it('fechamento move qualquer etapa ativa -> ganho', () => {
    expect(proximaEtapaPorEvento('negociacao', 'fechou')).toBe('ganho');
  });
  it('NUNCA recua: proposta_gerada quando já está em negociacao mantém negociacao', () => {
    expect(proximaEtapaPorEvento('negociacao', 'proposta_gerada')).toBe('negociacao');
  });
  it('evento sem regra mantém a etapa', () => {
    expect(proximaEtapaPorEvento('novo', 'proposta_aberta')).toBe('novo');
  });
  it('ORDEM_ETAPAS não inclui perdido (coluna terminal à parte) e tem 8 etapas ativas', () => {
    expect(ORDEM_ETAPAS).not.toContain('perdido');
    expect(ORDEM_ETAPAS.length).toBe(8);
  });
  it('etapaLabel traduz', () => {
    expect(etapaLabel('proposta_enviada')).toMatch(/proposta/i);
  });
});
