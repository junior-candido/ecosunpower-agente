// tests/closing-render.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { renderHtmlToPdf, shutdownPdfRenderer } from '../src/modules/closing/closing-render.js';

describe('closing-render (Puppeteer smoke)', () => {
  afterAll(async () => { await shutdownPdfRenderer(); });

  it('converte HTML simples em PDF buffer válido', async () => {
    const html = '<!DOCTYPE html><html><body><h1>Teste PDF</h1><p>Conteúdo qualquer</p></body></html>';
    const pdf = await renderHtmlToPdf(html);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.slice(0, 4).toString('latin1')).toBe('%PDF');
  }, 30_000);

  it('renderiza HTML do contrato Camila (>20KB, <2MB)', async () => {
    const { renderContrato } = await import('../src/modules/closing/templates/contrato.html.js');
    const { dadosFechamentoCamilaMesmaPessoa } = await import('./fixtures/closing-camila.js');
    const html = renderContrato(dadosFechamentoCamilaMesmaPessoa);
    const pdf = await renderHtmlToPdf(html);
    expect(pdf.length).toBeGreaterThan(20_000);
    expect(pdf.length).toBeLessThan(2_000_000);
  }, 60_000);
});
