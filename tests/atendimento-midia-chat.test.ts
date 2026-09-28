// W1 — mídia no CHAT do painel: a linha do histórico com arquivo vira balão
// com foto/player/documento; a cópia que a Eva deixa na memória dela
// ("[Enviou uma foto]", a transcrição do áudio) não aparece duplicada.
import { describe, it, expect } from 'vitest';
import { linhaDoPainelParaChat, juntarComPainel, type MensagemChat } from '../src/modules/dashboard/conversas-queries.js';
import { blocoMensagens } from '../src/modules/dashboard/atendimento-views.js';
import type { LinhaMensagemWhatsapp } from '../src/modules/mensagens-whatsapp.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const linha = (o: Partial<LinhaMensagemWhatsapp>): LinhaMensagemWhatsapp => ({
  id: 'm1', company_id: CASA, lead_id: 'L1', contato_telefone: '5561999990001', contato_nome: 'Ana', direcao: 'entrada', autor: 'cliente',
  user_id: null, autor_nome: null, canal: 'eva_oficial', numero: null, tipo: 'texto', texto: 'oi', modelo: null, evento: null, origem: 'webhook',
  wamid: null, status: 'recebida', erro: null, visivel_so_para: null, criado_em: '2026-09-28T15:00:00.000Z', enviada_em: null, ...o,
});

describe('linhaDoPainelParaChat com mídia', () => {
  it('leva o arquivo (id da linha, tipo, mime, nome, tamanho) e a transcrição', () => {
    const m = linhaDoPainelParaChat(linha({ tipo: 'audio', texto: '[áudio]', midia_caminho: `${CASA}/2026/09/a.ogg`, midia_mime: 'audio/ogg', midia_bytes: 5000, transcricao: 'quero orçamento' }))!;
    expect(m.midia).toEqual({ id: 'm1', tipo: 'audio', mime: 'audio/ogg', nome: null, bytes: 5000 });
    expect(m.transcricao).toBe('quero orçamento');
    expect(m.content).toBe('[áudio]');
  });
  it('sem arquivo guardado: sem `midia` (fica o marcador, como antes)', () => {
    expect(linhaDoPainelParaChat(linha({ tipo: 'imagem', texto: '[imagem] telhado' }))!.midia).toBeUndefined();
  });
});

describe('juntarComPainel: a cópia da memória da Eva some quando a mídia está no painel', () => {
  const t = (min: number) => new Date(Date.parse('2026-09-28T15:00:00Z') + min * 60_000).toISOString();
  it('foto: "[Enviou uma foto]" da Eva sai; a resposta da Eva fica', () => {
    const conversa: MensagemChat[] = [
      { role: 'user', content: '[Enviou uma foto]', timestamp: t(0.5) },
      { role: 'assistant', content: 'Recebi a sua conta!', timestamp: t(0.6) },
    ];
    const painel = [linha({ tipo: 'imagem', texto: '[imagem]', midia_caminho: `${CASA}/x.jpg`, midia_mime: 'image/jpeg', criado_em: t(0) })];
    const r = juntarComPainel(conversa, painel, 'eva_oficial');
    expect(r.map((m) => m.content)).toEqual(['[imagem]', 'Recebi a sua conta!']);
  });
  it('áudio: a transcrição que a Eva guardou como texto do cliente sai (fica embaixo do player)', () => {
    const conversa: MensagemChat[] = [{ role: 'user', content: 'Quero um orçamento', timestamp: t(1) }];
    const painel = [linha({ tipo: 'audio', texto: '[áudio]', transcricao: 'Quero um orçamento', midia_caminho: `${CASA}/x.ogg`, criado_em: t(0) })];
    expect(juntarComPainel(conversa, painel, 'eva_oficial').map((m) => m.content)).toEqual(['[áudio]']);
  });
  it('texto normal do cliente perto da mídia NÃO some; nem mídia do número pessoal apaga a memória da Eva', () => {
    const conversa: MensagemChat[] = [{ role: 'user', content: 'Segue a conta', timestamp: t(0.2) }, { role: 'user', content: '[imagem]', timestamp: t(0.3) }];
    const pessoal = [linha({ tipo: 'imagem', texto: '[imagem]', canal: 'whatsapp_business', visivel_so_para: 'u1', midia_caminho: `${CASA}/p.jpg`, criado_em: t(0) })];
    expect(juntarComPainel(conversa, pessoal, 'eva_oficial')).toHaveLength(3);
  });
  it('a cópia tem que ser do MESMO tipo: áudio sem transcrição não apaga o "[Enviou uma foto]" de outra mensagem', () => {
    const conversa: MensagemChat[] = [{ role: 'user', content: '[Enviou uma foto]', timestamp: t(0.5) }];
    const painel = [linha({ tipo: 'audio', texto: '[áudio]', midia_caminho: `${CASA}/x.ogg`, criado_em: t(0) })];
    expect(juntarComPainel(conversa, painel, 'eva_oficial')).toHaveLength(2);
  });
  it('cópia longe no tempo (mais de 10 min) não é confundida', () => {
    const conversa: MensagemChat[] = [{ role: 'user', content: '[Enviou uma foto]', timestamp: t(30) }];
    const painel = [linha({ tipo: 'imagem', texto: '[imagem]', midia_caminho: `${CASA}/x.jpg`, criado_em: t(0) })];
    expect(juntarComPainel(conversa, painel, 'eva_oficial')).toHaveLength(2);
  });
});

describe('balão com mídia', () => {
  const msg = (o: Partial<MensagemChat>): MensagemChat => ({ role: 'user', content: '[imagem]', timestamp: '2026-09-28T15:00:00.000Z', autor: 'cliente', ...o });
  const url = '/dashboard/leads/midia/m1';

  it('foto: miniatura que amplia (link para a rota protegida, nunca URL do storage)', () => {
    const h = blocoMensagens([msg({ midia: { id: 'm1', tipo: 'imagem', mime: 'image/jpeg', nome: null, bytes: 1000 } })], 'Eva', 'Ana', false, null);
    expect(h).toContain(`<img src="${url}"`);
    expect(h).toContain('class="cc-at-foto"');
    expect(h).toContain('loading="lazy"');
    expect(h).not.toContain('supabase');
  });
  it('áudio: player no balão + transcrição embaixo (escapada)', () => {
    const h = blocoMensagens([msg({ content: '[áudio]', transcricao: '<b>oi</b>', midia: { id: 'm1', tipo: 'audio', mime: 'audio/ogg', nome: null, bytes: 1000 } })], 'Eva', 'Ana', false, null);
    expect(h).toContain(`<audio controls preload="none" src="${url}"`);
    expect(h).toContain('&lt;b&gt;oi&lt;/b&gt;');
    expect(h).not.toContain('<b>oi</b>');
  });
  it('documento: ícone, nome, tamanho, abrir e baixar', () => {
    const h = blocoMensagens([msg({ content: '[documento] proposta.pdf', midia: { id: 'm1', tipo: 'documento', mime: 'application/pdf', nome: 'proposta<x>.pdf', bytes: 2 * 1024 * 1024 } })], 'Eva', 'Ana', false, null);
    expect(h).toContain('proposta&lt;x&gt;.pdf');
    expect(h).toContain('2 MB');
    expect(h).toContain(`href="${url}?baixar=1"`);
    expect(h).toContain(`href="${url}"`);
  });
  it('vídeo curto: player que só carrega quando toca', () => {
    const h = blocoMensagens([msg({ content: '[vídeo] obra', midia: { id: 'm1', tipo: 'video', mime: 'video/mp4', nome: null, bytes: 1000 } })], 'Eva', 'Ana', false, null);
    expect(h).toContain(`<video controls preload="none" src="${url}"`);
    expect(h).toContain('obra');
  });
  it('legenda da mídia aparece como texto (sem o marcador)', () => {
    const h = blocoMensagens([msg({ content: '[imagem] meu telhado', midia: { id: 'm1', tipo: 'imagem', mime: 'image/jpeg', nome: null, bytes: 1 } })], 'Eva', 'Ana', false, null);
    expect(h).toContain('meu telhado');
    expect(h).not.toContain('[imagem]');
  });
  it('id da mídia estranho não vira link (defesa)', () => {
    const h = blocoMensagens([msg({ midia: { id: '"><script>', tipo: 'imagem', mime: 'image/jpeg', nome: null, bytes: 1 } })], 'Eva', 'Ana', false, null);
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('/dashboard/leads/midia/');
  });
});
