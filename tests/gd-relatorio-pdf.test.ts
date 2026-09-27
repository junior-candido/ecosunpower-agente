import { describe, it, expect, vi } from 'vitest';
import { gerarRelatorioPdf } from '../src/modules/gd/relatorio-pdf.js';
import { RODAPE_CONFERENCIA, MARCA_GRAFICO_OK, CONTEUDO_CORTADO_MARCA } from '../src/modules/gd/relatorio-html.js';

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

  it('recusa PDF quando a marca CONTEUDO-CORTADO aparece (algo passou do rodapé e overflow:hidden cortou em silêncio)', async () => {
    const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: `... ${RODAPE_CONFERENCIA} ... ${CONTEUDO_CORTADO_MARCA} ...` });
    await expect(gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }))
      .rejects.toThrow(/não coube em 2 páginas/);
  });
  it('sem a marca CONTEUDO-CORTADO: devolve o PDF normalmente (2 páginas e rodapé certos)', async () => {
    const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: `... ${RODAPE_CONFERENCIA} ...` });
    expect(await gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler })).toBe(pdf);
  });

  describe('exigeGrafico (mes com historico — o grafico do Chart.js tem que ter carregado)', () => {
    it('marca presente: devolve o PDF normalmente', async () => {
      const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: `... ${RODAPE_CONFERENCIA} ... ${MARCA_GRAFICO_OK}` });
      expect(await gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }, { exigeGrafico: true })).toBe(pdf);
    });
    it('marca ausente (CDN do Chart.js falhou) — recusa mesmo com 2 paginas e rodape certos', async () => {
      const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: RODAPE_CONFERENCIA });
      await expect(gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }, { exigeGrafico: true }))
        .rejects.toThrow(/o gráfico do relatório não carregou — tente de novo/);
    });
    it('exigeGrafico false (ou omitido): nao exige a marca', async () => {
      const ler = vi.fn().mockResolvedValue({ paginas: 2, texto: RODAPE_CONFERENCIA });
      expect(await gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler }, { exigeGrafico: false })).toBe(pdf);
      expect(await gerarRelatorioPdf('<html>', { htmlToPdf: vi.fn().mockResolvedValue(pdf), lerPdf: ler })).toBe(pdf);
    });
  });
});
