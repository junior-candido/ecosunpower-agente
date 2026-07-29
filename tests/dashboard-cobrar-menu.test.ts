// A página "💳 Cobrar cliente" (/dashboard/cobrar) precisa estar no menu
// lateral — hoje só quem sabe a URL de cor chega nela. Entra no setor
// Financeiro, com gate pela área 'financeiro' (tenant só vê se o papel dele
// permitir, mesmo mecanismo dos outros itens).
import { describe, it, expect } from 'vitest';
import { renderLayout } from '../src/modules/dashboard/views.js';

describe('menu lateral — Cobrar cliente', () => {
  it('sem user (telas da casa) o link /dashboard/cobrar aparece no sidebar', () => {
    const html = renderLayout({ active: 'financeiro', title: 'X', body: '<p>oi</p>' } as any);
    expect(html).toContain('href="/dashboard/cobrar"');
    expect(html).toContain('Cobrar cliente');
  });
});
