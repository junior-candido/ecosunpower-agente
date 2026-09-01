// tests/aviso-grupo.test.ts
//
// Quando um cliente/lead fala no GRUPO, a assistente responde ali E chama no
// privado (decisão do Junior, 01/09/2026: "no grupo e no privado direto").
//
// A linha no grupo é só pra pessoa saber que foi vista e que a conversa
// continua no particular. Se ela repetisse isso a cada mensagem, viraria
// poluição no grupo da equipe — então avisa UMA vez e depois só atende no
// privado.
import { describe, it, expect, beforeEach } from 'vitest';
import { deveAvisarNoGrupo, _resetAvisoGrupoParaTeste } from '../src/modules/aviso-grupo.js';

const GRUPO = '120363000000000000@g.us';
const PESSOA = '5577999998888';

describe('aviso no grupo (uma vez, não a cada mensagem)', () => {
  beforeEach(() => _resetAvisoGrupoParaTeste());

  it('avisa na primeira mensagem', () => {
    expect(deveAvisarNoGrupo(GRUPO, PESSOA)).toBe(true);
  });

  it('não repete nas seguintes', () => {
    deveAvisarNoGrupo(GRUPO, PESSOA);
    expect(deveAvisarNoGrupo(GRUPO, PESSOA)).toBe(false);
    expect(deveAvisarNoGrupo(GRUPO, PESSOA)).toBe(false);
  });

  it('cada pessoa tem o seu aviso', () => {
    deveAvisarNoGrupo(GRUPO, PESSOA);
    expect(deveAvisarNoGrupo(GRUPO, '5577911112222')).toBe(true);
  });

  it('a mesma pessoa em outro grupo é avisada de novo', () => {
    deveAvisarNoGrupo(GRUPO, PESSOA);
    expect(deveAvisarNoGrupo('outro@g.us', PESSOA)).toBe(true);
  });

  it('depois de horas parado, volta a avisar — é outra conversa', () => {
    const agora = Date.now();
    expect(deveAvisarNoGrupo(GRUPO, PESSOA, agora)).toBe(true);
    expect(deveAvisarNoGrupo(GRUPO, PESSOA, agora + 60 * 60 * 1000)).toBe(false);     // 1h: mesma conversa
    expect(deveAvisarNoGrupo(GRUPO, PESSOA, agora + 13 * 60 * 60 * 1000)).toBe(true); // 13h: conversa nova
  });
});
