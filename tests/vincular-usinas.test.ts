import { describe, it, expect } from 'vitest';
import { normalizarNome, sugerirVinculos, sanitizarPares } from '../src/modules/dashboard/vincular-usinas.js';

describe('normalizarNome', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizarNome('José da Silva')).toBe('jose da silva');
    expect(normalizarNome('  MARIA   Souza ')).toBe('maria souza');
    expect(normalizarNome('Ailson-Fernandes')).toBe('ailson fernandes');
  });
  it('string vazia ou nula vira vazio', () => {
    expect(normalizarNome('')).toBe('');
  });
});

describe('sugerirVinculos', () => {
  const leads = [
    { id: 'L1', name: 'José da Silva' },
    { id: 'L2', name: 'Maria Souza' },
  ];
  it('casa por nome igual ignorando acento/caixa', () => {
    const r = sugerirVinculos([{ id: 'U1', apelido: 'jose da silva' }], leads);
    expect(r[0]).toEqual({ usinaId: 'U1', apelido: 'jose da silva', leadSugeridoId: 'L1', leadSugeridoNome: 'José da Silva' });
  });
  it('sem match deixa sugestão nula', () => {
    const r = sugerirVinculos([{ id: 'U9', apelido: 'Usina Fazenda X' }], leads);
    expect(r[0].leadSugeridoId).toBeNull();
  });
  it('apelido nulo não casa', () => {
    const r = sugerirVinculos([{ id: 'U0', apelido: null }], leads);
    expect(r[0].leadSugeridoId).toBeNull();
  });
});

describe('sanitizarPares', () => {
  const UUID_A = '11111111-1111-1111-1111-111111111111';
  const UUID_B = '22222222-2222-2222-2222-222222222222';
  it('mantém só pares com 2 UUIDs válidos', () => {
    const r = sanitizarPares({ [UUID_A]: UUID_B, 'lixo': 'x', [UUID_B]: '' });
    expect(r).toEqual([{ usinaId: UUID_A, leadId: UUID_B }]);
  });
  it('ignora usinaId repetido (fica o primeiro)', () => {
    const r = sanitizarPares({ [UUID_A]: UUID_B });
    expect(r).toHaveLength(1);
  });
});
