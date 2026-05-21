// tests/relatorio-pos-instalacao-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderPosInstalacaoHtml } from '../src/modules/relatorios/pos-instalacao/template.js';
import type { RelatorioPosInstalacaoView } from '../src/modules/relatorios/pos-instalacao/types.js';

function baseView(o: Partial<RelatorioPosInstalacaoView> = {}): RelatorioPosInstalacaoView {
  return {
    cliente_nome: 'João Silva',
    cliente_cidade: 'Brasília',
    cliente_uf: 'DF',
    concessionaria_label: 'Neoenergia Brasília',
    uc_numero: '1093487201',
    mensagem_personalizada: null,
    data_instalacao: '2026-05-01',
    data_medidor_trocado: '2026-05-15',
    sistema: {
      apelido: 'Casa Silva',
      marca_inversor: 'deye',
      inversor_modelo: 'SUN-5K-G',
      potencia_kwp: 5.5,
      qtd_paineis: 11,
      painel_marca: 'Risen',
      painel_modelo: 'RSM144-7-500BMDG',
    },
    fotos: [],
    gerado_em: '2026-05-20T12:00:00Z',
    slug: 'abc123',
    publico: true,
    ...o,
  };
}

describe('renderPosInstalacaoHtml', () => {
  it('renderiza HTML válido com cliente_nome', () => {
    const html = renderPosInstalacaoHtml(baseView());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('João Silva');
    expect(html).toContain('Brasília');
  });

  it('mostra mensagem personalizada quando preenchida', () => {
    const html = renderPosInstalacaoHtml(baseView({
      mensagem_personalizada: 'Obrigado pela confiança, foi um prazer trabalhar com você!',
    }));
    expect(html).toContain('Obrigado pela confiança');
  });

  it('NÃO inclui seção mensagem se vazia', () => {
    const html = renderPosInstalacaoHtml(baseView({ mensagem_personalizada: null }));
    // Não deve haver placeholder vazio renderizado
    expect(html).not.toMatch(/<p class="mensagem-personalizada">\s*<\/p>/);
  });

  it('mostra dados técnicos do sistema', () => {
    const html = renderPosInstalacaoHtml(baseView());
    expect(html).toContain('5.5');
    expect(html).toContain('kWp');
    expect(html).toContain('11');
    expect(html).toContain('Risen');
    expect(html).toContain('SUN-5K-G');
    expect(html).toContain('Neoenergia Brasília');
  });

  it('renderiza fotos em grid quando há fotos', () => {
    const html = renderPosInstalacaoHtml(baseView({
      fotos: [
        { url: 'https://x.com/a.jpg', caption: 'Telhado finalizado' },
        { url: 'https://x.com/b.jpg' },
      ],
    }));
    expect(html).toContain('https://x.com/a.jpg');
    expect(html).toContain('https://x.com/b.jpg');
    expect(html).toContain('Telhado finalizado');
  });

  it('omite seção fotos quando lista vazia', () => {
    const html = renderPosInstalacaoHtml(baseView({ fotos: [] }));
    // Sem grid de fotos
    expect(html.match(/<img/g) ?? []).toEqual([]);
  });

  it('mostra banner PREVIEW quando publico=false', () => {
    const html = renderPosInstalacaoHtml(baseView({ publico: false }));
    expect(html.toUpperCase()).toContain('PREVIEW');
  });

  it('NÃO mostra banner PREVIEW quando publico=true', () => {
    const html = renderPosInstalacaoHtml(baseView({ publico: true }));
    expect(html.toUpperCase()).not.toContain('PREVIEW');
  });

  it('inclui garantia EcoSun 12 meses + texto Responsável Técnico CREA/CFT (não engenheiro)', () => {
    const html = renderPosInstalacaoHtml(baseView());
    expect(html).toContain('12 meses');
    expect(html).toContain('Responsável Técnico');
    expect(html).toContain('CREA');
    // NUNCA usar a palavra "engenheiro" — regra forte da Ecosunpower
    expect(html.toLowerCase()).not.toContain('engenheiro');
  });

  it('escapa HTML em campos textuais (XSS guard)', () => {
    const html = renderPosInstalacaoHtml(baseView({
      cliente_nome: '<script>alert(1)</script>',
      mensagem_personalizada: '<img onerror=alert(1)>',
    }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img onerror=alert(1)>');
    expect(html).toContain('&lt;script');
  });
});
