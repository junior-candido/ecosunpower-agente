// tests/relatorio-gerar.test.ts
import { describe, it, expect, vi } from 'vitest';
import { gerarRelatorio } from '../src/modules/monitoring/relatorio/gerar.js';

const detalhe = {
  sistema: { id: 's1', apelido: 'Casa Silva', cidade: 'Brasília', uf: 'DF', marca_inversor: 'deye',
    potencia_kwp: 10, data_instalacao: '2025-12-18', ativo: true, ultimo_erro: null, painel_marca: null },
  kpis: { hojeKwh: 30, mesKwh: 400, anoKwh: 5000, totalKwh: 12000, esperadoDiaKwh: 41.6, ratioUltimos7: 0.9 },
  serieMensalCompleta: [{ mes: '2026-05', kwh: 400, esperado: 1290 }],
  alertas: [],
};

describe('gerarRelatorio', () => {
  it('gera publicUrl + qr + sinal; pdf via htmlToPdf', async () => {
    const deps = {
      getDetalhe: async () => detalhe,
      criarSlug: vi.fn(async () => 'SLUG123abcSLUG123abc'),
      htmlToPdf: vi.fn(async () => Buffer.from('PDF')),
      gerarQr: vi.fn(async () => 'data:image/png;base64,QR'),
      baseUrl: 'https://propostas.ecosunpower.eng.br',
    };
    const r = await gerarRelatorio(deps as any, 's1', 'acompanhamento');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.publicUrl).toBe('https://propostas.ecosunpower.eng.br/r/SLUG123abcSLUG123abc');
      expect(r.qrDataUrl).toBe('data:image/png;base64,QR');
      expect(r.sinal.gravidade).toBeNull();
      expect(Buffer.isBuffer(r.pdfBuffer)).toBe(true);
      expect(deps.htmlToPdf).toHaveBeenCalledOnce();
    }
  });
  it('detalhe null -> ok:false', async () => {
    const deps = { getDetalhe: async () => null, criarSlug: async () => 's', htmlToPdf: async () => Buffer.from(''), gerarQr: async () => 'x', baseUrl: 'b' };
    const r = await gerarRelatorio(deps as any, 'x', 'acompanhamento');
    expect(r.ok).toBe(false);
  });
});
