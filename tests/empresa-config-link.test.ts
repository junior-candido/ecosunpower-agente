// tests/empresa-config-link.test.ts
import { describe, it, expect } from 'vitest';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

describe('empresa-config link_pagamento', () => {
  it('lê link_pagamento da row', () => {
    const c = normalizarEmpresaRow({ link_pagamento: 'https://pay.ex/abc' });
    expect(c.linkPagamento).toBe('https://pay.ex/abc');
  });
  it('default null quando ausente', () => {
    const c = normalizarEmpresaRow({});
    expect(c.linkPagamento).toBeNull();
  });
});
