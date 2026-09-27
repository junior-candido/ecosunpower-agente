// tests/pasta-relatorios-usina.test.ts
import { describe, it, expect } from 'vitest';
import { renderPastaHtml } from '../src/modules/relatorios/pasta/template.js';
import type { PastaView } from '../src/modules/relatorios/pasta/types.js';

const view = (o: Partial<PastaView> = {}): PastaView => ({
  cliente_nome: 'João', cliente_cidade: null, cliente_uf: null, data_entrega: null, sistema: null, capa_url: null,
  logo_base64: 'data:image/png;base64,AAA', whatsapp: null, secoes: [], slug: 'abcdefghjk', publico: true,
  gerado_em: '2026-09-27T12:00:00Z', ...o,
});

describe('Pasta Digital — 📊 Relatórios da sua usina', () => {
  it('lista os meses com link para /rg/, mês com letra maiúscula', () => {
    const h = renderPastaHtml(view({ relatorios_usina: [
      { referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/B' },
      { referencia: '2026-07-01', mesExtenso: 'julho de 2026', url: 'https://p.x/rg/A' },
    ] }));
    expect(h).toContain('📊 Relatórios da sua usina');
    expect(h).toContain('href="https://p.x/rg/B"');
    expect(h).toContain('Agosto de 2026');
    expect(h.indexOf('Agosto de 2026')).toBeLessThan(h.indexOf('Julho de 2026'));
  });
  it('sem relatório enviado o bloco não aparece', () => {
    expect(renderPastaHtml(view())).not.toContain('Relatórios da sua usina');
    expect(renderPastaHtml(view({ relatorios_usina: [] }))).not.toContain('Relatórios da sua usina');
  });
  it('link é escapado', () => {
    const h = renderPastaHtml(view({ relatorios_usina: [{ referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/"><script>' }] }));
    expect(h).not.toContain('"><script>');
  });
});
