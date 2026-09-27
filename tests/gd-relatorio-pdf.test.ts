import { describe, it, expect, vi } from 'vitest';
import { gerarRelatorioPdf } from '../src/modules/gd/relatorio-pdf.js';
import { RODAPE_CONFERENCIA } from '../src/modules/gd/relatorio-html.js';

const pdf = Buffer.from('%PDF-fake');

describe('gerarRelatorioPdf', () => {
  it('devolve o PDF quando sai com 2 paginas e o rodape', async () => {
    const htmlToPdf = vi.fn().mockResolvedValue(pdf);
    const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: `... ${RODAPE_CONFERENCIA} · página 2 de 2` });
    expect(await gerarRelatorioPdf('<html>', { htmlToPdf, lerPdf: ler })).toBe(pdf);
    expect(htmlToPdf).toHaveBeenCalledWith('<html>', expect.objectContaining({ format: 'A4', marginMm: 0, printBackground: true }));
  });
  it('recusa PDF com 3 paginas (algo vazou) — nunca devolve pela metade', async () => {
    const ler = vi.fn().mockResolvedValue({ paginas: 3, texto: RODAPE_CONFERENCIA });
    await expect(gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }))
      .rejects.toThrow(/3 páginas/);
  });
  it('recusa PDF sem o rodape', async () => {
    const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: 'sem rodape' });
    await expect(gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }))
      .rejects.toThrow(/rodapé/);
  });
});
