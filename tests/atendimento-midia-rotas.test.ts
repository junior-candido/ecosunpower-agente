// W1 — ENVIAR mídia pelo painel e VER a mídia da conversa. Banco e storage em
// memória, dublês da Meta/Evolution: NADA sai de verdade.
// Envio: mesmas travas do texto (trava de empresa, janela de 24 h no número da
// Eva, opt-out/LGPD, chave anti envio duplo, freio) + tipo/tamanho do arquivo,
// o arquivo guardado ANTES de sair (sem guardar, não sai).
// Ver: só quem vê a conversa (empresa, dono do número pessoal, vendedor dono do lead).
import { describe, it, expect, vi } from 'vitest';
import { criarRotasAtendimento } from '../src/modules/dashboard/atendimento-rotas.js';
import { LimiteDeEnvio } from '../src/modules/dashboard/atendimento-envio.js';
import { canalAtual } from '../src/modules/canal-contexto.js';
import { BUCKET_MIDIA } from '../src/modules/midia-whatsapp.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';
const CHAVE = '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00';
const agora = Date.parse('2026-09-28T17:00:00Z');
const hAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(300, 32)]);
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(300, 1)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(300, 1)]);
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(300, 1)]);

const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior', login: 'junior', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const vendedor = { id: 'u-vend', companyId: CASA, nome: 'Vend', login: 'v', isAdmin: false, roleNome: 'Vendedor', permissoes: { leads: 'editar' } };
const bia = { id: 'u-bia', companyId: TENANT, nome: 'Bia', login: 'bia', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-junior', numero: '5561998805002', ativo: true };

function cenario(o: { company?: string; ultimaDoCliente?: number | null; instancia?: string | null; lead?: Record<string, unknown>; converter?: (b: Buffer) => Promise<Buffer> } = {}) {
  const company = o.company ?? CASA;
  const b = bancoMemoria({
    leads: [{ id: LEAD, company_id: company, name: 'Ana Exemplo', phone: '61999990001', eva_active: true, opt_out: false, claimed_by: null, ...o.lead }],
    conversations: o.ultimaDoCliente === null ? [] : [{ id: 'cv1', company_id: company, lead_id: LEAD, created_at: hAtras(30), messages: [{ role: 'user', content: 'Oi', timestamp: hAtras(o.ultimaDoCliente ?? 2) }] }],
    eva_cadence: [], mensagens_whatsapp: [], lead_atividades: [], audit_log: [], whatsapp_numeros_pessoais: [NP],
  }, { mensagens_whatsapp: [['company_id', 'chave_envio'], ['company_id', 'wamid']] });
  const waba = {
    sendText: vi.fn(async () => ({ messageId: 'wamid.T1' })),
    sendTemplate: vi.fn(async () => ({ messageId: 'wamid.M1' })),
    uploadMedia: vi.fn(async () => ({ mediaId: 'MID-1' })),
    sendMediaById: vi.fn(async () => ({ messageId: 'wamid.MIDIA' })),
  };
  let canalNoEnvio: unknown = null;
  const enviarMidiaEvolution = vi.fn(async (_i: string, _c: string, _to: string, _m: unknown) => { canalNoEnvio = canalAtual(); return { messageId: 'EVO-1' }; });
  const rotas = criarRotasAtendimento({
    supabase: b.client, banco: () => b.client, waba, sendTextEvolution: vi.fn(async () => {}),
    instanciaDaEmpresa: async () => o.instancia ?? null, engineerPhone: '5561998805002',
    copiarParaMemoria: vi.fn(async () => {}), limite: new LimiteDeEnvio(100, 0), agora: () => agora,
    enviarPessoal: vi.fn(async () => ({ messageId: 'P1' })), numeroPessoal: async (_c, u) => (u === 'u-junior' ? NP : null),
    enviarMidiaEvolution, converterAudio: o.converter,
  });
  return { b, waba, enviarMidiaEvolution, rotas, canalNoEnvio: () => canalNoEnvio };
}

const arquivo = (dados: Buffer, originalname: string, mimetype: string) => ({ buffer: dados, originalname, mimetype, size: dados.length });
function req(body: Record<string, unknown>, file: unknown, user: any = junior, id = LEAD) {
  return { params: { id }, body, query: {}, dashUser: user, file, headers: { accept: 'application/json' } } as any;
}
function res() {
  const r: any = { statusCode: 200, corpo: '', destino: '', headers: {} as Record<string, string> };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (x: string) => { r.corpo = x; return r; };
  r.json = (x: unknown) => { r.corpo = x; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k.toLowerCase()] = v; };
  r.redirect = (a: number | string, b?: string) => { r.destino = typeof a === 'string' ? a : b; r.statusCode = typeof a === 'number' ? a : 302; return r; };
  return r;
}

describe('POST /leads/:id/responder-midia — número da Eva (WABA)', () => {
  it('janela aberta: guarda o arquivo, sobe na Meta, manda pelo id, grava ligado ao arquivo e assume', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE, legenda: 'Seu telhado' }, arquivo(JPG, 'telhado.jpg', 'image/jpeg')), r);
    expect(r.corpo).toMatchObject({ ok: true, resultado: 'enviada' });
    expect(c.waba.uploadMedia).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', 'telhado.jpg');
    expect(c.waba.sendMediaById).toHaveBeenCalledWith('5561999990001', 'image', 'MID-1', { caption: 'Seu telhado', filename: 'telhado.jpg' });
    const m = c.b.tabelas.mensagens_whatsapp.find((x) => x.direcao === 'saida')!;
    expect(m).toMatchObject({ tipo: 'imagem', texto: '[imagem] Seu telhado', midia_mime: 'image/jpeg', midia_nome: 'telhado.jpg', status: 'enviada', wamid: 'wamid.MIDIA', canal: 'eva_oficial', autor: 'humano' });
    expect(String(m.midia_caminho).startsWith(`${CASA}/`)).toBe(true);
    expect(c.b.arquivos[`${BUCKET_MIDIA}/${m.midia_caminho}`]).toBeTruthy();
    expect(c.b.tabelas.leads[0].eva_active).toBe(false);
  });

  it('janela FECHADA: recusa no servidor (fora das 24 h a Meta só aceita modelo) e não guarda nada', async () => {
    const c = cenario({ ultimaDoCliente: 30 });
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(PDF, 'proposta.pdf', 'application/pdf')), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'janela_fechada' });
    expect(c.waba.uploadMedia).not.toHaveBeenCalled();
    expect(Object.keys(c.b.arquivos)).toHaveLength(0);
  });

  it('arquivo proibido/disfarçado e sem arquivo: recusados antes de qualquer coisa', async () => {
    const c = cenario();
    const r1 = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(EXE, 'foto.jpg', 'image/jpeg')), r1);
    expect(r1.corpo).toMatchObject({ ok: false, resultado: 'arquivo_invalido' });
    const r2 = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, undefined), r2);
    expect(r2.corpo).toMatchObject({ ok: false, resultado: 'sem_arquivo' });
    expect(c.waba.uploadMedia).not.toHaveBeenCalled();
    expect(c.b.tabelas.mensagens_whatsapp).toHaveLength(0);
  });

  it('clique repetido (mesma chave): o 2º não manda nem guarda de novo', async () => {
    const c = cenario();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(PDF, 'p.pdf', 'application/pdf')), res());
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(PDF, 'p.pdf', 'application/pdf')), r);
    expect(r.corpo).toMatchObject({ resultado: 'duplicado' });
    expect(c.waba.sendMediaById).toHaveBeenCalledTimes(1);
    expect(Object.keys(c.b.arquivos)).toHaveLength(1);
  });

  it('bucket fora do ar: NÃO envia (sem guardar, não sai) e avisa', async () => {
    const c = cenario();
    c.b.falharStorage('Bucket not found');
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(PDF, 'p.pdf', 'application/pdf')), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'erro_arquivo' });
    expect(c.waba.uploadMedia).not.toHaveBeenCalled();
  });

  it('a Meta recusou: fica "não saiu" e o arquivo continua guardado (a conversa mostra o que se tentou)', async () => {
    const c = cenario();
    c.waba.sendMediaById.mockRejectedValueOnce(new Error('Meta WABA API 400: (#131053) Media upload error to 5561999990001'));
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(JPG, 'a.jpg', 'image/jpeg')), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'falhou' });
    const m = c.b.tabelas.mensagens_whatsapp[0];
    expect(m.status).toBe('falhou');
    expect(String(m.erro)).not.toContain('5561999990001');
  });

  it('gravação do navegador (webm) vira OGG antes de sair; sem conversor, recusa com motivo claro', async () => {
    const converter = vi.fn(async () => OGG);
    const c = cenario({ converter });
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(WEBM, 'gravacao.webm', 'audio/webm;codecs=opus')), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(converter).toHaveBeenCalled();
    expect(c.waba.uploadMedia).toHaveBeenCalledWith(OGG, 'audio/ogg', 'gravacao.ogg');
    expect(c.waba.sendMediaById).toHaveBeenCalledWith('5561999990001', 'audio', 'MID-1', expect.objectContaining({}));
    const semConv = cenario();
    const r2 = res();
    await semConv.rotas.responderMidia(req({ chave: CHAVE }, arquivo(WEBM, 'g.webm', 'audio/webm')), r2);
    expect(r2.corpo).toMatchObject({ ok: false, resultado: 'audio_invalido' });
  });

  it('áudio: a legenda não é gravada (o WhatsApp não manda legenda em áudio)', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE, legenda: 'ouve isso' }, arquivo(OGG, 'recado.ogg', 'audio/ogg')), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.b.tabelas.mensagens_whatsapp[0].texto).toBe('[áudio]');
  });

  it('foto WebP pela Meta: vira JPEG antes; sem conversor, recusa (a Meta só aceita JPEG/PNG)', async () => {
    const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(100, 1)]);
    const sem = cenario();
    const r1 = res();
    await sem.rotas.responderMidia(req({ chave: CHAVE }, arquivo(WEBP, 'f.webp', 'image/webp')), r1);
    expect(r1.corpo).toMatchObject({ ok: false, resultado: 'arquivo_invalido' });
  });

  it('CSV pela Meta sobe como texto simples', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(Buffer.from('a;b\n1;2\n'), 'lista.csv', 'text/csv')), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.waba.uploadMedia).toHaveBeenCalledWith(expect.any(Buffer), 'text/plain', 'lista.csv');
  });

  it('lead de OUTRA empresa: 404 e nada acontece', async () => {
    const c = cenario({ company: TENANT });
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(JPG, 'a.jpg', 'image/jpeg')), r);
    expect(r.statusCode).toBe(404);
    expect(Object.keys(c.b.arquivos)).toHaveLength(0);
  });
});

describe('upload: arquivo grande pelo cabeçalho é recusado sem ler o corpo', () => {
  it('content-length acima de 16 MB → "arquivo grande", nada guardado nem enviado', async () => {
    const c = cenario();
    const r = res();
    await new Promise<void>((ok) => {
      const q = { params: { id: LEAD }, body: {}, query: {}, dashUser: junior, headers: { accept: 'application/json', 'content-length': String(40 * 1024 * 1024) } } as any;
      const orig = r.json; r.json = (x: unknown) => { orig(x); ok(); return r; };
      c.rotas.comArquivo(c.rotas.responderMidia)(q, r);
    });
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'arquivo_grande' });
    expect(Object.keys(c.b.arquivos)).toHaveLength(0);
    expect(c.waba.uploadMedia).not.toHaveBeenCalled();
  });
});

describe('responder-midia pelo número PESSOAL e pelo tenant (Evolution)', () => {
  it('número pessoal: sai pela instância do dono (sem janela de 24 h) e só o dono vê a linha', async () => {
    const c = cenario({ ultimaDoCliente: 30 });
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE, canal: 'whatsapp_business', legenda: 'segue' }, arquivo(PDF, 'proposta.pdf', 'application/pdf')), r);
    expect(r.corpo).toMatchObject({ ok: true });
    const [inst, cid, to, m] = c.enviarMidiaEvolution.mock.calls[0];
    expect([inst, cid, to]).toEqual(['pessoal-junior', CASA, '5561999990001']);
    expect(m).toMatchObject({ tipo: 'documento', mime: 'application/pdf', nome: 'proposta.pdf', legenda: 'segue' });
    expect(typeof (m as { base64: string }).base64).toBe('string');
    expect(c.b.tabelas.mensagens_whatsapp[0]).toMatchObject({ visivel_so_para: 'u-junior', canal: 'whatsapp_business', numero: 'pessoal-junior' });
  });

  it('quem NÃO é o dono não usa o número pessoal', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE, canal: 'whatsapp_business' }, arquivo(PDF, 'p.pdf', 'application/pdf'), vendedor), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'sem_canal' });
    expect(c.enviarMidiaEvolution).not.toHaveBeenCalled();
  });

  it('tenant: sai pela instância DELE, dentro do canal da empresa (nunca pelo número da casa)', async () => {
    const c = cenario({ company: TENANT, instancia: 'solar-aurora' });
    const r = res();
    await c.rotas.responderMidia(req({ chave: CHAVE }, arquivo(JPG, 'a.jpg', 'image/jpeg'), bia), r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.enviarMidiaEvolution.mock.calls[0][0]).toBe('solar-aurora');
    expect(c.canalNoEnvio()).toMatchObject({ companyId: TENANT, evolutionInstance: 'solar-aurora' });
    expect(c.waba.uploadMedia).not.toHaveBeenCalled();
  });
});

describe('POST /leads/conversas/contato/responder-midia — quem ainda não é lead (só o dono)', () => {
  it('manda pelo número pessoal para quem já conversou com o dono', async () => {
    const c = cenario();
    c.b.tabelas.mensagens_whatsapp.push({ id: 'x0', company_id: CASA, lead_id: null, contato_telefone: '5561977776666', contato_nome: 'Carlos', direcao: 'entrada', visivel_so_para: 'u-junior', criado_em: hAtras(1), texto: 'oi' });
    const r = res();
    await c.rotas.responderContatoMidia({ body: { chave: CHAVE, telefone: '5561977776666' }, query: {}, dashUser: junior, file: arquivo(JPG, 'a.jpg', 'image/jpeg'), headers: { accept: 'application/json' } } as any, r);
    expect(r.corpo).toMatchObject({ ok: true });
    expect(c.enviarMidiaEvolution.mock.calls[0].slice(0, 3)).toEqual(['pessoal-junior', CASA, '5561977776666']);
  });
  it('telefone qualquer (sem conversa): 404', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responderContatoMidia({ body: { chave: CHAVE, telefone: '5561911112222' }, query: {}, dashUser: junior, file: arquivo(JPG, 'a.jpg', 'image/jpeg'), headers: { accept: 'application/json' } } as any, r);
    expect(r.statusCode).toBe(404);
    expect(c.enviarMidiaEvolution).not.toHaveBeenCalled();
  });
});

describe('GET /leads/midia/:id — ver/baixar (LGPD: só quem vê a conversa)', () => {
  const ID = '22222222-2222-4222-8222-222222222222';
  function comMidia(o: Record<string, unknown> = {}, lead: Record<string, unknown> = {}) {
    const c = cenario({ lead });
    const caminho = `${CASA}/2026/09/x.pdf`;
    c.b.arquivos[`${BUCKET_MIDIA}/${caminho}`] = { dados: PDF, contentType: 'application/pdf' };
    c.b.tabelas.mensagens_whatsapp.push({ id: ID, company_id: CASA, lead_id: LEAD, visivel_so_para: null, tipo: 'documento', midia_caminho: caminho, midia_mime: 'application/pdf', midia_nome: 'conta.pdf', ...o });
    return c;
  }
  const pedir = (user: any, query: Record<string, string> = {}) => ({ params: { id: ID }, query, dashUser: user, headers: {} }) as any;

  it('da empresa: redireciona para URL assinada curta, sem cache', async () => {
    const c = comMidia();
    const r = res();
    await c.rotas.midia(pedir(junior), r);
    expect(r.statusCode).toBe(302);
    expect(r.destino).toMatch(/^https:\/\/storage\.test\/whatsapp-midia\/.+ttl=120/);
    expect(r.headers['cache-control']).toContain('no-store');
  });
  it('?baixar=1 força o download com o nome do arquivo', async () => {
    const c = comMidia();
    const r = res();
    await c.rotas.midia(pedir(junior, { baixar: '1' }), r);
    expect(r.destino).toContain('download=conta.pdf');
  });
  it('outra empresa: 404', async () => {
    const c = comMidia();
    const r = res();
    await c.rotas.midia(pedir(bia), r);
    expect(r.statusCode).toBe(404);
  });
  it('conversa pessoal de outro: 404 (mesmo sendo da empresa)', async () => {
    const c = comMidia({ visivel_so_para: 'u-junior' });
    const r = res();
    await c.rotas.midia(pedir(vendedor), r);
    expect(r.statusCode).toBe(404);
  });
  it('lead de outro vendedor: 404', async () => {
    const c = comMidia({}, { claimed_by: 'u-outro' });
    const r = res();
    await c.rotas.midia(pedir(vendedor), r);
    expect(r.statusCode).toBe(404);
  });
  it('conversa PESSOAL do vendedor com lead de outro vendedor: o dono do número vê o arquivo dele', async () => {
    const c = comMidia({ visivel_so_para: 'u-vend' }, { claimed_by: 'u-outro' });
    const r = res();
    await c.rotas.midia(pedir(vendedor), r);
    expect(r.statusCode).toBe(302);
  });
  it('caminho que não é da empresa (dado adulterado): 404', async () => {
    const c = comMidia({ midia_caminho: `${TENANT}/2026/09/y.pdf` });
    const r = res();
    await c.rotas.midia(pedir(junior), r);
    expect(r.statusCode).toBe(404);
  });
  it('id inválido: 400', async () => {
    const c = comMidia();
    const r = res();
    await c.rotas.midia({ params: { id: '../x' }, query: {}, dashUser: junior, headers: {} } as any, r);
    expect(r.statusCode).toBe(400);
  });
});
