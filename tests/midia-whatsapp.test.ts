// W1 — mídia no WhatsApp (foto, PDF/documento, áudio, vídeo curto). Regras do
// arquivo: só tipos permitidos (nada de executável), o CONTEÚDO tem que bater
// com o tipo (não basta o nome), limite de tamanho, caminho por empresa no
// bucket privado, URL assinada curta. Nada sai de verdade: storage em memória.
import { describe, it, expect } from 'vitest';
import {
  validarArquivo, caminhoDaMidia, nomeSeguro, guardarMidia, urlDaMidia, marcadorDaMidia, textoDaMidia,
  LIMITE_IMAGEM_BYTES, LIMITE_MIDIA_BYTES, BUCKET_MIDIA, TTL_URL_MIDIA_S, tamanhoLegivel, arquivarMidiaRecebida, arquivarMidiaDaAssistente,
} from '../src/modules/midia-whatsapp.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 32)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(200, 1)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 1)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(200, 1)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]);
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('[Content_Types].xml'), Buffer.alloc(200, 1)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('programa.exe'), Buffer.alloc(200, 1)]);

describe('validarArquivo', () => {
  it('foto JPEG e PNG, PDF, áudio OGG, vídeo MP4, planilha/Word: aceitos com o tipo certo', () => {
    expect(validarArquivo({ nome: 'telhado.jpg', mime: 'image/jpeg', dados: JPG })).toMatchObject({ ok: true, tipo: 'imagem', mime: 'image/jpeg', ext: 'jpg' });
    expect(validarArquivo({ nome: 'print.png', mime: 'image/png', dados: PNG })).toMatchObject({ ok: true, tipo: 'imagem', ext: 'png' });
    expect(validarArquivo({ nome: 'conta.pdf', mime: 'application/pdf', dados: PDF })).toMatchObject({ ok: true, tipo: 'documento', ext: 'pdf' });
    expect(validarArquivo({ nome: 'recado.ogg', mime: 'audio/ogg; codecs=opus', dados: OGG })).toMatchObject({ ok: true, tipo: 'audio', mime: 'audio/ogg' });
    expect(validarArquivo({ nome: 'obra.mp4', mime: 'video/mp4', dados: MP4 })).toMatchObject({ ok: true, tipo: 'video', ext: 'mp4' });
    expect(validarArquivo({ nome: 'orcamento.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dados: DOCX })).toMatchObject({ ok: true, tipo: 'documento', ext: 'docx' });
  });

  it('gravação do navegador (webm) é aceita como áudio (o servidor converte antes de mandar)', () => {
    expect(validarArquivo({ nome: 'gravacao.webm', mime: 'audio/webm;codecs=opus', dados: WEBM })).toMatchObject({ ok: true, tipo: 'audio', mime: 'audio/webm', precisaConverter: true });
  });

  it('executável: recusado mesmo com nome ou tipo disfarçado', () => {
    expect(validarArquivo({ nome: 'virus.exe', mime: 'application/x-msdownload', dados: EXE })).toMatchObject({ ok: false, motivo: 'tipo_nao_permitido' });
    expect(validarArquivo({ nome: 'foto.jpg', mime: 'image/jpeg', dados: EXE })).toMatchObject({ ok: false, motivo: 'conteudo_nao_confere' });
    expect(validarArquivo({ nome: 'conta.pdf.exe', mime: 'application/pdf', dados: PDF })).toMatchObject({ ok: false, motivo: 'tipo_nao_permitido' });
    expect(validarArquivo({ nome: 'pagina.html', mime: 'text/html', dados: Buffer.from('<script>x</script>') })).toMatchObject({ ok: false, motivo: 'tipo_nao_permitido' });
    expect(validarArquivo({ nome: 'desenho.svg', mime: 'image/svg+xml', dados: Buffer.from('<svg onload=x>') })).toMatchObject({ ok: false, motivo: 'tipo_nao_permitido' });
  });

  it('zip qualquer declarado como Word (ex.: com .exe dentro) não passa; o nome que fica leva a extensão CONFERIDA', () => {
    expect(validarArquivo({ nome: 'boleto.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', dados: ZIP })).toMatchObject({ ok: false, motivo: 'conteudo_nao_confere' });
    expect(validarArquivo({ nome: 'update.msp', mime: 'application/msword', dados: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(100)]) })).toMatchObject({ ok: true, nome: 'update.doc' });
    expect(validarArquivo({ nome: 'foto.jfif', mime: 'image/jpeg', dados: JPG })).toMatchObject({ ok: true, nome: 'foto.jpg' });
  });

  it('conteúdo que não bate com o tipo declarado é recusado (PDF que é imagem)', () => {
    expect(validarArquivo({ nome: 'conta.pdf', mime: 'application/pdf', dados: JPG })).toMatchObject({ ok: false, motivo: 'conteudo_nao_confere' });
  });

  it('vazio e grande demais (foto 5 MB, o resto 16 MB — limites da Meta)', () => {
    expect(validarArquivo({ nome: 'a.jpg', mime: 'image/jpeg', dados: Buffer.alloc(0) })).toMatchObject({ ok: false, motivo: 'vazio' });
    const fotoGrande = Buffer.concat([JPG, Buffer.alloc(LIMITE_IMAGEM_BYTES)]);
    expect(validarArquivo({ nome: 'a.jpg', mime: 'image/jpeg', dados: fotoGrande })).toMatchObject({ ok: false, motivo: 'grande_demais' });
    const pdfGrande = Buffer.concat([PDF, Buffer.alloc(LIMITE_MIDIA_BYTES)]);
    expect(validarArquivo({ nome: 'a.pdf', mime: 'application/pdf', dados: pdfGrande })).toMatchObject({ ok: false, motivo: 'grande_demais' });
  });

  it('sem tipo declarado: descobre pela extensão (e o conteúdo tem que bater)', () => {
    expect(validarArquivo({ nome: 'conta.PDF', mime: 'application/octet-stream', dados: PDF })).toMatchObject({ ok: true, tipo: 'documento', mime: 'application/pdf' });
  });

  it('texto simples só sem bytes binários', () => {
    expect(validarArquivo({ nome: 'lista.txt', mime: 'text/plain', dados: Buffer.from('placas: 10\n') })).toMatchObject({ ok: true, tipo: 'documento' });
    expect(validarArquivo({ nome: 'lista.txt', mime: 'text/plain', dados: Buffer.from([0x41, 0, 0x42]) })).toMatchObject({ ok: false, motivo: 'conteudo_nao_confere' });
  });
});

describe('caminho, nome e URL', () => {
  it('caminho começa pela empresa (isolamento no bucket) e nunca usa o nome do cliente', () => {
    const c = caminhoDaMidia(CASA, 'jpg', new Date('2026-09-28T12:00:00Z'), 'abc');
    expect(c).toBe(`${CASA}/2026/09/abc.jpg`);
    expect(() => caminhoDaMidia('../x', 'jpg')).toThrow();
  });

  it('nome seguro: sem pasta, sem caractere estranho, com limite', () => {
    expect(nomeSeguro('../../etc/passwd')).toBe('passwd');
    expect(nomeSeguro('C:\\fotos\\Conta de Luz (set).pdf')).toBe('Conta de Luz (set).pdf');
    expect(nomeSeguro('a"<>|*?.pdf')).toBe('a.pdf');
    expect(nomeSeguro('')).toBe('arquivo');
    expect(nomeSeguro('x'.repeat(300) + '.pdf').length).toBeLessThanOrEqual(120);
  });

  it('guardar sobe no bucket privado com o tipo certo; URL assinada curta', async () => {
    const b = bancoMemoria();
    const r = await guardarMidia(b.client, { companyId: CASA, dados: PDF, mime: 'application/pdf', ext: 'pdf' });
    expect(r.ok).toBe(true);
    const obj = b.arquivos[`${BUCKET_MIDIA}/${(r as { caminho: string }).caminho}`];
    expect(obj.contentType).toBe('application/pdf');
    expect((r as { caminho: string }).caminho.startsWith(`${CASA}/`)).toBe(true);
    const url = await urlDaMidia(b.client, (r as { caminho: string }).caminho, { baixarComo: 'conta.pdf' });
    expect(url).toContain(`ttl=${TTL_URL_MIDIA_S}`);
    expect(url).toContain('download=conta.pdf');
  });

  it('bucket fora do ar → não quebra, devolve o motivo', async () => {
    const b = bancoMemoria();
    b.falharStorage('Bucket not found');
    expect(await guardarMidia(b.client, { companyId: CASA, dados: PDF, mime: 'application/pdf', ext: 'pdf' })).toEqual({ ok: false, erro: 'Bucket not found' });
  });
});

describe('texto do histórico', () => {
  it('marcador + legenda (a lista e a busca continuam lendo texto)', () => {
    expect(marcadorDaMidia('imagem')).toBe('[imagem]');
    expect(textoDaMidia('documento', 'Segue a proposta', 'proposta.pdf')).toBe('[documento] Segue a proposta');
    expect(textoDaMidia('documento', '', 'proposta.pdf')).toBe('[documento] proposta.pdf');
    expect(textoDaMidia('audio', '')).toBe('[áudio]');
  });
  it('tamanho legível', () => {
    expect(tamanhoLegivel(512)).toBe('512 B');
    expect(tamanhoLegivel(2048)).toBe('2 KB');
    expect(tamanhoLegivel(3.5 * 1024 * 1024)).toBe('3,5 MB');
  });
});

describe('arquivarMidiaRecebida', () => {
  const base = { company_id: CASA, lead_id: 'L1', contato_telefone: '5561999990001', direcao: 'entrada' as const, autor: 'cliente' as const, canal: 'eva_oficial' as const, wamid: 'wamid.A', status: 'recebida' as const };

  it('baixa, guarda no bucket e grava a mensagem ligada ao arquivo (com a transcrição do áudio)', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    const r = await arquivarMidiaRecebida(b.client, {
      baixar: async () => ({ base64: OGG.toString('base64'), mimetype: 'audio/ogg; codecs=opus' }),
      linha: { ...base, tipo: 'audio' }, legenda: '', transcricao: 'Oi, quero orçamento',
    });
    expect(r).toBe('gravada');
    const m = b.tabelas.mensagens_whatsapp[0];
    expect(m).toMatchObject({ tipo: 'audio', texto: '[áudio]', midia_mime: 'audio/ogg', transcricao: 'Oi, quero orçamento', wamid: 'wamid.A' });
    expect(String(m.midia_caminho).startsWith(`${CASA}/`)).toBe(true);
    expect(b.arquivos[`${BUCKET_MIDIA}/${m.midia_caminho}`]).toBeTruthy();
  });

  it('tipo proibido recebido (ex.: .exe): NÃO guarda o arquivo, só registra o marcador com o aviso', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    const r = await arquivarMidiaRecebida(b.client, {
      baixar: async () => ({ base64: EXE.toString('base64'), mimetype: 'application/x-msdownload' }),
      linha: { ...base, tipo: 'documento' }, legenda: '', nomeArquivo: 'programa.exe',
    });
    expect(r).toBe('sem_arquivo');
    expect(Object.keys(b.arquivos)).toHaveLength(0);
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ texto: '[documento] programa.exe' });
    expect(b.tabelas.mensagens_whatsapp[0].midia_caminho).toBeUndefined();
  });

  it('mesma mensagem de novo (wamid repetido): não duplica e apaga o arquivo que subiu à toa', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [{ id: 'x', company_id: CASA, wamid: 'wamid.A' }] }, { mensagens_whatsapp: [['company_id', 'wamid']] });
    const r = await arquivarMidiaRecebida(b.client, {
      baixar: async () => ({ base64: JPG.toString('base64'), mimetype: 'image/jpeg' }),
      linha: { ...base, tipo: 'imagem' }, legenda: 'meu telhado',
    });
    expect(r).toBe('duplicada');
    expect(Object.keys(b.arquivos)).toHaveLength(0);
  });

  it('arquivo acima do limite (tamanho informado pelo WhatsApp): nem baixa, só o marcador', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    let baixou = false;
    const r = await arquivarMidiaRecebida(b.client, { baixar: async () => { baixou = true; return null; }, linha: { ...base, tipo: 'video' }, legenda: 'obra', tamanhoBytes: 2_000_000_000 });
    expect(r).toBe('sem_arquivo');
    expect(baixou).toBe(false);
  });

  it('webhook repetido (wamid já gravado): nem baixa de novo', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [{ id: 'x', company_id: CASA, wamid: 'wamid.A' }] });
    let baixou = false;
    expect(await arquivarMidiaRecebida(b.client, { baixar: async () => { baixou = true; return null; }, linha: { ...base, tipo: 'imagem' } })).toBe('duplicada');
    expect(baixou).toBe(false);
  });

  it('áudio: transcreve só depois de conferir o arquivo (conteúdo estranho não vai para a IA)', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    let chamou = false;
    await arquivarMidiaRecebida(b.client, { baixar: async () => ({ base64: EXE.toString('base64'), mimetype: 'audio/ogg' }), linha: { ...base, tipo: 'audio' }, transcrever: async () => { chamou = true; return 'x'; } });
    expect(chamou).toBe(false);
  });

  it('download falhou: grava só o marcador (o histórico não perde a mensagem)', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    expect(await arquivarMidiaRecebida(b.client, { baixar: async () => null, linha: { ...base, tipo: 'imagem' }, legenda: 'telhado' })).toBe('sem_arquivo');
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ texto: '[imagem] telhado' });
  });
});

describe('LGPD: apagar o lead tira os arquivos do bucket', () => {
  it('só os da empresa e do lead', async () => {
    const { apagarMidiasDoLead } = await import('../src/modules/midia-whatsapp.js');
    const T = 'aaaa1111-2222-3333-4444-555566667777';
    const b = bancoMemoria({ mensagens_whatsapp: [
      { id: '1', company_id: CASA, lead_id: 'L1', midia_caminho: `${CASA}/2026/09/a.jpg` },
      { id: '2', company_id: CASA, lead_id: 'L1', midia_caminho: null },
      { id: '3', company_id: CASA, lead_id: 'L2', midia_caminho: `${CASA}/2026/09/b.jpg` },
      { id: '4', company_id: T, lead_id: 'L1', midia_caminho: `${T}/2026/09/c.jpg` },
    ] });
    for (const c of [`${CASA}/2026/09/a.jpg`, `${CASA}/2026/09/b.jpg`, `${T}/2026/09/c.jpg`]) b.arquivos[`${BUCKET_MIDIA}/${c}`] = { dados: JPG };
    expect(await apagarMidiasDoLead(b.client, CASA, 'L1')).toBe(1);
    expect(Object.keys(b.arquivos).sort()).toEqual([`${BUCKET_MIDIA}/${CASA}/2026/09/b.jpg`, `${BUCKET_MIDIA}/${T}/2026/09/c.jpg`]);
  });
});

describe('download com limite (http-limite)', () => {
  it('para no limite pelo content-length e pelo que chega', async () => {
    const { lerCorpoComLimite } = await import('../src/modules/http-limite.js');
    expect(await lerCorpoComLimite(new Response('x'.repeat(100), { headers: { 'content-length': '100' } }), 50)).toBeNull();
    expect(await lerCorpoComLimite(new Response('x'.repeat(100)), 50)).toBeNull();
    expect((await lerCorpoComLimite(new Response('abc'), 50))!.toString()).toBe('abc');
  });
  it('tamanho do arquivo do Baileys (número, texto ou Long)', async () => {
    const { tamanhoDoArquivo } = await import('../src/modules/evolution.js');
    expect(tamanhoDoArquivo(10)).toBe(10);
    expect(tamanhoDoArquivo('2048')).toBe(2048);
    expect(tamanhoDoArquivo({ low: 5, high: 1 })).toBe(4294967301);
    expect(tamanhoDoArquivo(undefined)).toBeNull();
  });
});

describe('sem a migration 141 aplicada', () => {
  it('gravar mensagem com mídia: tenta de novo sem as colunas novas (a mensagem não se perde)', async () => {
    const { gravarMensagem, reservarEnvio } = await import('../src/modules/mensagens-whatsapp.js');
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    b.falharEm('mensagens_whatsapp', "Could not find the 'midia_caminho' column of 'mensagens_whatsapp' in the schema cache", 'PGRST204');
    expect(await gravarMensagem(b.client, { company_id: CASA, direcao: 'entrada', autor: 'cliente', tipo: 'imagem', texto: '[imagem]', midia_caminho: `${CASA}/2026/09/a.jpg` })).toEqual({ ok: true });
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ texto: '[imagem]' });
    expect('midia_caminho' in b.tabelas.mensagens_whatsapp[0]).toBe(false);
    b.falharEm('mensagens_whatsapp', 'column "midia_mime" does not exist', '42703');
    const r = await reservarEnvio(b.client, { company_id: CASA, direcao: 'saida', autor: 'humano', chave_envio: 'k1', midia_mime: 'image/jpeg' });
    expect(r.ok).toBe(true);
  });
});

describe('número pessoal: mídia recebida é baixada e guardada (W1)', () => {
  it('foto do cliente: guarda o arquivo, só o dono vê a linha; histórico antigo (>24 h) não baixa', async () => {
    const { receberNoNumeroPessoal } = await import('../src/modules/numero-pessoal.js');
    const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-j', numero: '5561998805002', ativo: true };
    const b = bancoMemoria({ leads: [], mensagens_whatsapp: [], contatos_internos: [] }, { mensagens_whatsapp: [['company_id', 'wamid']] });
    const baixar = async () => ({ base64: JPG.toString('base64'), mimetype: 'image/jpeg' });
    const agora = Date.parse('2026-09-28T15:01:00Z');
    const msg = { type: 'image', from: '5561977776666', content: '', caption: 'meu telhado', timestamp: new Date('2026-09-28T15:00:00Z'), messageId: 'W9', fromMe: false, pushName: 'Carlos' } as any;
    expect(await receberNoNumeroPessoal(b.client, NP, msg, agora, { baixarMidia: baixar })).toBe('gravada');
    const m = b.tabelas.mensagens_whatsapp[0];
    expect(m).toMatchObject({ tipo: 'imagem', texto: '[imagem] meu telhado', midia_mime: 'image/jpeg', visivel_so_para: 'u-junior', canal: 'whatsapp_business' });
    expect(String(m.midia_caminho).startsWith(`${CASA}/`)).toBe(true);
    const velha = { ...msg, messageId: 'W10', timestamp: new Date('2026-09-20T15:00:00Z') };
    expect(await receberNoNumeroPessoal(b.client, NP, velha, agora, { baixarMidia: baixar })).toBe('gravada');
    expect(b.tabelas.mensagens_whatsapp[1].midia_caminho).toBeUndefined();
    expect(Object.keys(b.arquivos)).toHaveLength(1);
  });

  it('webhook: grava o marcador NA HORA e o arquivo completa depois (segundo plano); amigo que não é lead não tem áudio transcrito', async () => {
    const { receberNoNumeroPessoal } = await import('../src/modules/numero-pessoal.js');
    const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-j', numero: '5561998805002', ativo: true };
    const b = bancoMemoria({ leads: [], mensagens_whatsapp: [], contatos_internos: [] }, { mensagens_whatsapp: [['company_id', 'wamid']] });
    let tarefa: Promise<unknown> | null = null;
    let transcreveu = false;
    const agora = Date.parse('2026-09-28T15:01:00Z');
    const msg = { type: 'audio', from: '5561977776666', content: '', timestamp: new Date('2026-09-28T15:00:00Z'), messageId: 'A1', fromMe: false } as any;
    const r = await receberNoNumeroPessoal(b.client, NP, msg, agora, {
      baixarMidia: async () => ({ base64: OGG.toString('base64'), mimetype: 'audio/ogg' }),
      transcrever: async () => { transcreveu = true; return 'x'; },
      emSegundoPlano: (t) => { tarefa = t; },
    });
    expect(r).toBe('gravada');
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ texto: '[áudio]', tipo: 'audio' });
    expect(b.tabelas.mensagens_whatsapp[0].midia_caminho).toBeUndefined();
    await tarefa;
    expect(String(b.tabelas.mensagens_whatsapp[0].midia_caminho).startsWith(`${CASA}/`)).toBe(true);
    expect(transcreveu).toBe(false);
  });

  it('documento sem legenda: o texto leva o nome do arquivo (o eco do painel casa com o que foi enviado)', async () => {
    const { textoDaEntrada } = await import('../src/modules/numero-pessoal.js');
    expect(textoDaEntrada({ type: 'document', content: 'application/pdf', nomeArquivo: 'proposta.pdf' } as any)).toBe('[documento] proposta.pdf');
    expect(textoDaEntrada({ type: 'document', content: 'application/pdf', caption: 'segue', nomeArquivo: 'proposta.pdf' } as any)).toBe('[documento] segue');
  });
});

describe('arquivarMidiaDaAssistente (número da Eva / assistente do tenant)', () => {
  const baixar = async () => ({ base64: OGG.toString('base64'), mimetype: 'audio/ogg' });
  it('grava para a empresa toda, no canal da Eva, com a hora da mensagem; transcreve se a Eva estava pausada', async () => {
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    const transcrever = async () => 'quero orçamento';
    const r = await arquivarMidiaDaAssistente(b.client, {
      companyId: CASA, telefone: '5561999990001', lead: { id: 'L1', company_id: CASA }, tipoEntrada: 'audio', wamid: 'w1',
      recebidaEm: '2026-09-28T15:00:00.000Z', baixar, transcrever,
    });
    expect(r).toBe('gravada');
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ canal: 'eva_oficial', criado_em: '2026-09-28T15:00:00.000Z', transcricao: 'quero orçamento', lead_id: 'L1' });
    expect(b.tabelas.mensagens_whatsapp[0].visivel_so_para).toBeUndefined();
  });
  it('tenant: canal qr_code; lead de OUTRA empresa ou sem lead: não grava', async () => {
    const T = 'aaaa1111-2222-3333-4444-555566667777';
    const b = bancoMemoria({ mensagens_whatsapp: [] });
    expect(await arquivarMidiaDaAssistente(b.client, { companyId: T, telefone: '5561999990001', lead: { id: 'L2', company_id: T }, tipoEntrada: 'image', wamid: 'w2', recebidaEm: null, baixar: async () => ({ base64: JPG.toString('base64'), mimetype: 'image/jpeg' }) })).toBe('gravada');
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ canal: 'qr_code', company_id: T });
    expect(String(b.tabelas.mensagens_whatsapp[0].midia_caminho).startsWith(`${T}/`)).toBe(true);
    expect(await arquivarMidiaDaAssistente(b.client, { companyId: T, telefone: '1', lead: { id: 'L1', company_id: CASA }, tipoEntrada: 'image', wamid: 'w3', recebidaEm: null, baixar })).toBe('ignorada');
    expect(await arquivarMidiaDaAssistente(b.client, { companyId: T, telefone: '1', lead: null, tipoEntrada: 'image', wamid: 'w4', recebidaEm: null, baixar })).toBe('ignorada');
    expect(await arquivarMidiaDaAssistente(b.client, { companyId: T, telefone: '1', lead: { id: 'L2', company_id: T }, tipoEntrada: 'text', wamid: 'w5', recebidaEm: null, baixar })).toBe('ignorada');
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(1);
  });
});
