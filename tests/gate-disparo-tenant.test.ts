// tests/gate-disparo-tenant.test.ts
//
// Gate B5 provisório (degustação Sabion 27/07): disparo de mensagem (Eva /
// WABA da casa) é EXCLUSIVO da EcoSun até tenant ter WABA própria. Motivo:
// pra deixar o TENANT cadastrar os próprios clientes (papel com 'editar'),
// as rotas de envio do pós-venda não podem mais confiar só no nível 'editar'
// — senão o Thiago falaria em nome da EcoSun pelo NOSSO número.

import { describe, it, expect } from 'vitest';
import { podeDispararMensagens } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';

describe('podeDispararMensagens — só a casa fala pelo número da casa', () => {
  it('EcoSun pode', () => {
    expect(podeDispararMensagens(ECOSUN)).toBe(true);
  });

  it('tenant NAO pode (mesmo com papel de editar)', () => {
    expect(podeDispararMensagens('aaaa1111-2222-3333-4444-555566667777')).toBe(false);
  });

  it('sem empresa (null/undefined) NAO pode — lado seguro', () => {
    expect(podeDispararMensagens(null)).toBe(false);
    expect(podeDispararMensagens(undefined)).toBe(false);
  });
});
