// tests/pasta-template.test.ts
import { describe, it, expect } from 'vitest';
import { renderPastaHtml } from '../src/modules/relatorios/pasta/template.js';
import type { PastaView } from '../src/modules/relatorios/pasta/types.js';

function view(o: Partial<PastaView> = {}): PastaView {
  return {
    cliente_nome: 'João <b>Silva</b>',
    cliente_cidade: 'Brasília', cliente_uf: 'DF',
    data_entrega: '2026-08-01',
    sistema: null,
    capa_url: null,
    logo_base64: 'data:image/png;base64,AAA',
    whatsapp: '5561996978781',
    secoes: [
      { secao: 'fotos', titulo: '📸 Fotos da instalação', arquivos: [
        { url: 'https://sig/f1.jpg', nome: 'f1.jpg', caption: null, is_imagem: true, is_video: false },
      ]},
      { secao: 'projeto', titulo: '📐 Projeto', arquivos: [
        { url: 'https://sig/p.pdf', nome: 'prancha.pdf', caption: null, is_imagem: false, is_video: false },
      ]},
    ],
    slug: 'abcdefghjk', publico: true, gerado_em: '2026-08-05T12:00:00Z',
    ...o,
  };
}

describe('renderPastaHtml', () => {
  it('só renderiza seções que vieram na view', () => {
    const html = renderPastaHtml(view());
    expect(html).toContain('Fotos da instalação');
    expect(html).toContain('Projeto');
    expect(html).not.toContain('Homologação');
    expect(html).not.toContain('Contrato');
  });

  it('escapa HTML do nome do cliente', () => {
    const html = renderPastaHtml(view());
    expect(html).not.toContain('<b>Silva</b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('preview mostra banner; público não', () => {
    expect(renderPastaHtml(view({ publico: false }))).toContain('PREVIEW');
    expect(renderPastaHtml(view({ publico: true }))).not.toContain('PREVIEW');
  });

  it('lista de arquivos do ZIP vai como JSON seguro no script', () => {
    const html = renderPastaHtml(view());
    expect(html).toContain('const ARQUIVOS_ZIP');
    expect(html).toContain('https://sig/p.pdf');
    // </script> dentro de URL/nome não pode quebrar a página
    const comNomeMaligno = view();
    comNomeMaligno.secoes[1].arquivos[0].nome = 'a</script><script>alert(1)';
    expect(renderPastaHtml(comNomeMaligno)).not.toContain('</script><script>alert(1)');
  });

  it('botão do zap usa o telefone da empresa', () => {
    expect(renderPastaHtml(view())).toContain('wa.me/5561996978781');
  });

  it('bloco de avaliação com o link do Google entra na página', () => {
    const html = renderPastaHtml(view());
    expect(html).toContain('https://g.page/r/CWB5ipa57HzhEAI/review');
    expect(html).toContain('Avaliar no Google');
  });

  it('vídeo do monitoramento vira player <video>; foto vira galeria', () => {
    const html = renderPastaHtml(view({
      secoes: [
        { secao: 'monitoramento', titulo: '📊 Monitoramento', arquivos: [
          { url: 'https://sig/m.mp4', nome: 'app-gerando.mp4', caption: 'Usina gerando', is_imagem: false, is_video: true },
          { url: 'https://sig/m.jpg', nome: 'print-app.jpg', caption: null, is_imagem: true, is_video: false },
        ]},
      ],
    }));
    expect(html).toContain('<video');
    expect(html).toContain('https://sig/m.mp4');
    expect(html).toContain('abrirFoto(');
  });
});
