// Baixar com UM clique (Junior 28/09: "senti falta de baixar as imagens e PDF
// somente com um clique, da conversa da Eva"):
//  - ⬇ Baixar em todo balão com arquivo (?baixar=1 na MESMA rota protegida);
//  - mídia ANTIGA da Eva (cofre lead_anexos) ligada ao balão "[Enviou uma foto]"
//    quando casa com certeza; senão fica o link "ver em Arquivos";
//  - "⬇ Baixar tudo" (.zip) com fotos e PDFs, nomes amigáveis.
// Segurança: tenant não baixa de outra empresa, vendedor não baixa lead de
// outro vendedor, número pessoal só o dono.
import { describe, it, expect, vi } from 'vitest';
import * as zlib from 'node:zlib';
import { criarRotasAtendimento } from '../src/modules/dashboard/atendimento-rotas.js';
import { LimiteDeEnvio } from '../src/modules/dashboard/atendimento-envio.js';
import { BUCKET_MIDIA } from '../src/modules/midia-whatsapp.js';
import {
  nomeAmigavel, tipoDoArquivo, extensaoDoArquivo, nomesUnicos, pedacoDeNome, casarMidiaAntiga, planoDoZip, ZipEmFluxo, crc32, JANELA_CASAR_MS,
  type ItemDoZip,
} from '../src/modules/dashboard/atendimento-arquivos.js';
import { blocoMensagens, corpoDaMidia } from '../src/modules/dashboard/atendimento-views.js';
import { renderLeadDetailPage } from '../src/modules/dashboard/leads-views.js';
import { USER_CASA, leadDetalhe, SERVICOS_LEAD } from './fixtures/miolo-leads.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';
const ANX_FOTO = '22222222-2222-4222-8222-222222222222';
const ANX_PDF = '33333333-3333-4333-8333-333333333333';
const MID_FOTO = '44444444-4444-4444-8444-444444444444';
const MID_PESSOAL = '55555555-5555-4555-8555-555555555555';
const MID_AUDIO = '66666666-6666-4666-8666-666666666666';
const T0 = '2026-09-20T13:00:00.000Z';
const mais = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior', login: 'junior', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const vendedor = { id: 'u-vend', companyId: CASA, nome: 'Vend', login: 'v', isAdmin: false, roleNome: 'Vendedor', permissoes: { leads: 'editar' } };
const bia = { id: 'u-bia', companyId: TENANT, nome: 'Bia', login: 'bia', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const outroAdmin = { id: 'u-outro', companyId: CASA, nome: 'Outro', login: 'o', isAdmin: true, roleNome: 'Admin', permissoes: {} };
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(200, 32)]);

// ---------------------------------------------------------------------------
describe('nome amigável e tipos (PURO)', () => {
  it('"<cliente>_<data>_<tipo>.<ext>" sem acento/símbolo, data de Brasília', () => {
    expect(nomeAmigavel({ cliente: "Ana Maria d'Ávila", quando: '2026-09-28T02:30:00Z', tipo: 'foto', ext: 'jpg' })).toBe('Ana-Maria-dAvila_2026-09-27_foto.jpg');
    expect(nomeAmigavel({ cliente: null, quando: null, tipo: 'pdf', ext: 'pdf' })).toBe('cliente_sem-data_pdf.pdf');
    expect(nomeAmigavel({ cliente: '../../etc/passwd', quando: T0, tipo: 'documento', ext: '../x' })).toBe('etc-passwd_2026-09-20_documento.bin');
    expect(pedacoDeNome('<script>alert(1)</script>')).toBe('script-alert-1-script');
  });
  it('tipo e extensão pelo mime/nome', () => {
    expect(tipoDoArquivo('image/jpeg')).toBe('foto');
    expect(tipoDoArquivo('application/pdf')).toBe('pdf');
    expect(tipoDoArquivo(null, 'conta.PDF')).toBe('pdf');
    expect(tipoDoArquivo('audio/ogg')).toBe('audio');
    expect(tipoDoArquivo('video/mp4')).toBe('video');
    expect(tipoDoArquivo('application/vnd.ms-excel')).toBe('documento');
    expect(extensaoDoArquivo('lead/recebido/abc.jpeg', 'image/jpeg')).toBe('jpeg');
    expect(extensaoDoArquivo(null, 'application/pdf')).toBe('pdf');
    expect(extensaoDoArquivo('sem-ext', 'x/y')).toBe('bin');
  });
  it('nomes repetidos no .zip ganham _2, _3', () => {
    expect(nomesUnicos(['a_foto.jpg', 'a_foto.jpg', 'b.pdf', 'A_FOTO.jpg'])).toEqual(['a_foto.jpg', 'a_foto_2.jpg', 'b.pdf', 'A_FOTO_3.jpg']);
  });
});

// ---------------------------------------------------------------------------
describe('mídia antiga da Eva ↔ anexo do cofre (casa com certeza ou não casa)', () => {
  const foto = (id: string, quando: string, extra: Record<string, unknown> = {}) => ({ id, mime_type: 'image/jpeg', created_at: quando, created_by: 'cliente', descricao: 'Recebido do cliente via WhatsApp (imagem)', ...extra });
  const msg = (content: string, ts: string, extra: Record<string, unknown> = {}) => ({ role: 'user', content, timestamp: ts, ...extra });

  it('pelo horário: um anexo do mesmo tipo até 3 min → casa', () => {
    const m = casarMidiaAntiga([msg('[Enviou uma foto]', T0)], [foto(ANX_FOTO, mais(T0, -20_000))]);
    expect(m.get(0)?.id).toBe(ANX_FOTO);
  });
  it('pelo id do WhatsApp (msg:<wamid> na descrição) → casa mesmo longe no tempo', () => {
    const m = casarMidiaAntiga([msg('[Enviou uma foto]', T0, { wamid: 'wamid.X1' })], [foto(ANX_FOTO, mais(T0, -3600_000), { descricao: 'Recebido (imagem) · msg:wamid.X1' })]);
    expect(m.get(0)?.id).toBe(ANX_FOTO);
  });
  it('longe demais, tipo diferente, enviado pela equipe ou mensagem da assistente → NÃO casa', () => {
    expect(casarMidiaAntiga([msg('[Enviou uma foto]', T0)], [foto(ANX_FOTO, mais(T0, JANELA_CASAR_MS + 1000))]).size).toBe(0);
    expect(casarMidiaAntiga([msg('[Enviou um PDF]', T0)], [foto(ANX_FOTO, T0)]).size).toBe(0);
    expect(casarMidiaAntiga([msg('[Enviou uma foto]', T0)], [foto(ANX_FOTO, T0, { created_by: 'u-junior' })]).size).toBe(0);
    expect(casarMidiaAntiga([{ role: 'assistant', content: '[Enviou uma foto]', timestamp: T0 }], [foto(ANX_FOTO, T0)]).size).toBe(0);
  });
  it('ambíguo (2 fotos perto da mesma mensagem, ou 2 mensagens perto da mesma foto) → NÃO casa', () => {
    expect(casarMidiaAntiga([msg('[Enviou uma foto]', T0)], [foto(ANX_FOTO, T0), foto(ANX_PDF, mais(T0, 30_000))]).size).toBe(0);
    expect(casarMidiaAntiga([msg('[Enviou uma foto]', T0), msg('[Enviou uma foto]', mais(T0, 40_000))], [foto(ANX_FOTO, mais(T0, 20_000))]).size).toBe(0);
  });
  it('PDF casa com o PDF; cada anexo casa uma vez só', () => {
    const pdf = { id: ANX_PDF, mime_type: 'application/pdf', created_at: T0, created_by: 'cliente' };
    const m = casarMidiaAntiga([msg('[Enviou um PDF]', T0), msg('[Enviou uma foto]', mais(T0, 3600_000)), msg('[Enviou uma foto]', mais(T0, 7200_000))],
      [pdf, foto(ANX_FOTO, mais(T0, 3600_000 + 5000))]);
    expect(m.get(0)?.id).toBe(ANX_PDF);
    expect(m.get(1)?.id).toBe(ANX_FOTO);
    expect(m.has(2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('tela: ⬇ Baixar em todo balão com arquivo + mídia antiga + Baixar tudo', () => {
  const base = { content: '[imagem]', transcricao: null };
  it('foto, áudio, vídeo e documento: ⬇ Baixar com ?baixar=1 na rota protegida (a foto continua ampliando)', () => {
    for (const tipo of ['imagem', 'audio', 'video', 'documento'] as const) {
      const h = corpoDaMidia({ ...base, midia: { id: MID_FOTO, tipo, mime: tipo === 'documento' ? 'application/pdf' : null, nome: 'x', bytes: 10 } });
      expect(h, tipo).toContain(`href="/dashboard/leads/midia/${MID_FOTO}?baixar=1" download`);
      expect(h, tipo).toContain('⬇ Baixar');
    }
    expect(corpoDaMidia({ ...base, midia: { id: MID_FOTO, tipo: 'imagem', mime: null, nome: null, bytes: 1 } })).toContain('data-ampliar');
  });
  it('balão antigo "[Enviou uma foto]" que casa: miniatura + ⬇ Baixar pelo cofre do lead; o que não casa: "ver em Arquivos"', () => {
    const msgs = [
      { role: 'user', content: '[Enviou uma foto] minha conta', timestamp: T0 },
      { role: 'user', content: '[Enviou um PDF]', timestamp: mais(T0, 86400_000) },
    ];
    const h = blocoMensagens(msgs, 'Eva', 'Ana', true, null, false, false, null,
      { leadId: LEAD, anexos: [{ id: ANX_FOTO, mime_type: 'image/jpeg', created_at: mais(T0, 10_000), created_by: 'cliente' }] });
    expect(h).toContain(`<img src="/dashboard/leads/${LEAD}/anexo/${ANX_FOTO}"`);
    expect(h).toContain(`href="/dashboard/leads/${LEAD}/anexo/${ANX_FOTO}?baixar=1" download`);
    expect(h).toContain('minha conta');
    expect(h).toContain('ver em Arquivos'); // o PDF sem par continua como antes
  });
  it('seção Arquivos: ⬇ Baixar tudo (.zip) e ⬇ Baixar em cada arquivo', () => {
    const lead = leadDetalhe({ id: LEAD, anexos: [{ id: ANX_PDF, tipo: 'conta_luz', descricao: null, url: 'https://x/y.pdf', mime_type: 'application/pdf', created_by: 'cliente', created_at: T0 }] });
    const h = renderLeadDetailPage(lead, [], '', '', SERVICOS_LEAD, USER_CASA, {});
    expect(h).toContain(`href="/dashboard/leads/${LEAD}/arquivos.zip" download`);
    expect(h).toContain(`href="/dashboard/leads/${LEAD}/anexo/${ANX_PDF}?baixar=1" download`);
  });
});

// ---------------------------------------------------------------------------
describe('.zip (PURO)', () => {
  const item = (o: Partial<ItemDoZip>): ItemDoZip => ({ origem: 'anexo', id: 'x', caminho: `${LEAD}/recebido_cliente/a.jpg`, mime: 'image/jpeg', nome: null, quando: T0, bytes: 10, ...o });
  it('só fotos e PDFs, do mais antigo pro mais novo, sem repetir o anexo que é cópia da mídia nova', () => {
    const p = planoDoZip([
      item({ id: 'b', quando: mais(T0, 1000) }),
      item({ id: 'a', mime: 'application/pdf', caminho: `${LEAD}/conta_luz/c.pdf` }),
      item({ id: 'aud', mime: 'audio/ogg', caminho: 'x.ogg' }),
      item({ origem: 'midia', id: 'm', caminho: `${CASA}/2026/09/f.jpg`, wamid: 'wamid.Z' }),
      item({ id: 'copia', descricao: 'Recebido · msg:wamid.Z' }),
    ], 'Ana Exemplo');
    expect(p.entram.map((x) => x.id)).toEqual(['a', 'm', 'b']);
    expect(p.entram.map((x) => x.nomeNoZip)).toEqual(['Ana-Exemplo_2026-09-20_pdf.pdf', 'Ana-Exemplo_2026-09-20_foto.jpg', 'Ana-Exemplo_2026-09-20_foto_2.jpg']);
  });
  it('limites de quantidade e tamanho: o que passar fica de fora (e é contado)', () => {
    const muitos = Array.from({ length: 5 }, (_, i) => item({ id: `i${i}`, bytes: 40 }));
    expect(planoDoZip(muitos, 'A', { arquivos: 3, bytes: 1e9 }).entram).toHaveLength(3);
    const p = planoDoZip(muitos, 'A', { arquivos: 99, bytes: 100 });
    expect(p.entram).toHaveLength(2);
    expect(p.ficaram).toBe(3);
  });
  it('ZipEmFluxo gera um .zip válido (CRC, tamanhos, diretório central, nome UTF-8)', async () => {
    const partes: Buffer[] = [];
    const z = new ZipEmFluxo((b) => { partes.push(b); });
    await z.arquivo('Ana_2026-09-20_foto.jpg', JPG, new Date(T0));
    await z.arquivo('Conceição_pdf.pdf', PDF);
    await z.fechar();
    const zip = Buffer.concat(partes);
    if (typeof (zlib as any).crc32 === 'function') expect(crc32(JPG)).toBe((zlib as any).crc32(JPG));
    const fim = zip.length - 22;
    expect(zip.readUInt32LE(fim)).toBe(0x06054b50);
    expect(zip.readUInt16LE(fim + 10)).toBe(2);
    let p = zip.readUInt32LE(fim + 16);
    const achados: Array<{ nome: string; dados: Buffer }> = [];
    for (let k = 0; k < 2; k++) {
      expect(zip.readUInt32LE(p)).toBe(0x02014b50);
      const nl = zip.readUInt16LE(p + 28), off = zip.readUInt32LE(p + 42), crc = zip.readUInt32LE(p + 16), tam = zip.readUInt32LE(p + 20);
      const nome = zip.subarray(p + 46, p + 46 + nl).toString('utf-8');
      expect(zip.readUInt32LE(off)).toBe(0x04034b50);
      const lnl = zip.readUInt16LE(off + 26);
      const dados = zip.subarray(off + 30 + lnl, off + 30 + lnl + tam);
      expect(crc32(dados)).toBe(crc);
      achados.push({ nome, dados });
      p += 46 + nl;
    }
    expect(achados.map((a) => a.nome)).toEqual(['Ana_2026-09-20_foto.jpg', 'Conceição_pdf.pdf']);
    expect(achados[0].dados.equals(JPG)).toBe(true);
    expect(achados[1].dados.equals(PDF)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rotas — as travas
// ---------------------------------------------------------------------------
function cenario(o: { company?: string; claimed_by?: string | null } = {}) {
  const company = o.company ?? CASA;
  const b = bancoMemoria({
    leads: [{ id: LEAD, company_id: company, name: 'Ana Exemplo', phone: '61999990001', eva_active: true, opt_out: false, claimed_by: o.claimed_by ?? null }],
    conversations: [], eva_cadence: [], lead_atividades: [], audit_log: [], whatsapp_numeros_pessoais: [],
    lead_anexos: [
      { id: ANX_FOTO, lead_id: LEAD, company_id: company, tipo: 'recebido_cliente', storage_path: `${LEAD}/recebido_cliente/a.jpg`, mime_type: 'image/jpeg', size_bytes: JPG.length, created_by: 'cliente', created_at: T0, descricao: null },
      { id: ANX_PDF, lead_id: LEAD, company_id: company, tipo: 'conta_luz', storage_path: `${LEAD}/conta_luz/c.pdf`, mime_type: 'application/pdf', size_bytes: PDF.length, created_by: 'cliente', created_at: mais(T0, 1000), descricao: null },
    ],
    mensagens_whatsapp: [
      { id: MID_FOTO, company_id: company, lead_id: LEAD, visivel_so_para: null, tipo: 'imagem', midia_caminho: `${company}/2026/09/f.jpg`, midia_mime: 'image/jpeg', midia_nome: 'f.jpg', midia_bytes: JPG.length, criado_em: mais(T0, 2000), wamid: 'wamid.F' },
      { id: MID_PESSOAL, company_id: company, lead_id: LEAD, visivel_so_para: 'u-junior', tipo: 'imagem', midia_caminho: `${company}/2026/09/p.jpg`, midia_mime: 'image/jpeg', midia_nome: 'p.jpg', midia_bytes: JPG.length, criado_em: mais(T0, 3000), wamid: 'wamid.P' },
      { id: MID_AUDIO, company_id: company, lead_id: LEAD, visivel_so_para: null, tipo: 'audio', midia_caminho: `${company}/2026/09/a.ogg`, midia_mime: 'audio/ogg', midia_nome: 'a.ogg', midia_bytes: 10, criado_em: mais(T0, 4000), wamid: 'wamid.A' },
    ],
  });
  b.arquivos[`client-attachments/${LEAD}/recebido_cliente/a.jpg`] = { dados: JPG };
  b.arquivos[`client-attachments/${LEAD}/conta_luz/c.pdf`] = { dados: PDF };
  b.arquivos[`${BUCKET_MIDIA}/${company}/2026/09/f.jpg`] = { dados: JPG };
  b.arquivos[`${BUCKET_MIDIA}/${company}/2026/09/p.jpg`] = { dados: JPG };
  const rotas = criarRotasAtendimento({
    supabase: b.client, banco: () => b.client, waba: { sendText: vi.fn(), sendTemplate: vi.fn() } as any, instanciaDaEmpresa: async () => null,
    engineerPhone: '5561998805002', limite: new LimiteDeEnvio(100, 0), agora: () => Date.parse('2026-09-28T17:00:00Z'),
  } as any);
  return { b, rotas };
}
function res() {
  const r: any = { statusCode: 200, corpo: '', destino: '', headers: {} as Record<string, string>, pedacos: [] as Buffer[], destroyed: false, acabou: false };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (x: string) => { r.corpo = x; return r; };
  r.json = (x: unknown) => { r.corpo = x; return r; };
  r.setHeader = (k: string, v: string) => { r.headers[k.toLowerCase()] = v; };
  r.redirect = (a: number | string, b?: string) => { r.destino = typeof a === 'string' ? a : b; r.statusCode = typeof a === 'number' ? a : 302; return r; };
  r.write = (b: Buffer) => { r.pedacos.push(Buffer.from(b)); return true; };
  r.once = () => r;
  r.end = () => { r.acabou = true; return r; };
  r.destroy = () => { r.destroyed = true; };
  return r;
}
const pedir = (user: any, params: Record<string, string>, query: Record<string, string> = {}) => ({ params, query, dashUser: user, headers: {} }) as any;

/** Nomes dos arquivos dentro do .zip (diretório central). */
function nomesDoZip(zip: Buffer): string[] {
  const fim = zip.length - 22;
  let p = zip.readUInt32LE(fim + 16);
  const n = zip.readUInt16LE(fim + 10), out: string[] = [];
  for (let k = 0; k < n; k++) { const nl = zip.readUInt16LE(p + 28); out.push(zip.subarray(p + 46, p + 46 + nl).toString('utf-8')); p += 46 + nl; }
  return out;
}

describe('GET /leads/:id/anexo/:anexoId — arquivo do cofre do lead', () => {
  it('da empresa: 302 para URL assinada curta; ?baixar=1 com nome amigável', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.anexo(pedir(junior, { id: LEAD, anexoId: ANX_FOTO }, { baixar: '1' }), r);
    expect(r.statusCode).toBe(302);
    expect(r.destino).toMatch(/^https:\/\/storage\.test\/client-attachments\/.+ttl=120&download=Ana-Exemplo_2026-09-20_foto\.jpg$/);
    expect(r.headers['cache-control']).toContain('no-store');
  });
  it('tenant pedindo lead da casa: 404 (não revela)', async () => {
    const r = res();
    await cenario().rotas.anexo(pedir(bia, { id: LEAD, anexoId: ANX_FOTO }), r);
    expect(r.statusCode).toBe(404);
    expect(r.destino).toBe('');
  });
  it('vendedor pedindo lead de OUTRO vendedor: 404', async () => {
    const r = res();
    await cenario({ claimed_by: 'u-outro-vend' }).rotas.anexo(pedir(vendedor, { id: LEAD, anexoId: ANX_FOTO }), r);
    expect(r.statusCode).toBe(404);
  });
  it('anexo de outro lead (id trocado na URL) ou caminho fora da pasta do lead: 404', async () => {
    const c = cenario();
    c.b.tabelas.lead_anexos.push({ id: '77777777-7777-4777-8777-777777777777', lead_id: '99999999-9999-4999-8999-999999999999', storage_path: 'x/y.jpg', mime_type: 'image/jpeg', created_at: T0 });
    const r1 = res();
    await c.rotas.anexo(pedir(junior, { id: LEAD, anexoId: '77777777-7777-4777-8777-777777777777' }), r1);
    expect(r1.statusCode).toBe(404);
    c.b.tabelas.lead_anexos[0].storage_path = `../${LEAD}/a.jpg`;
    const r2 = res();
    await c.rotas.anexo(pedir(junior, { id: LEAD, anexoId: ANX_FOTO }), r2);
    expect(r2.statusCode).toBe(404);
  });
  it('id inválido: 400', async () => {
    const r = res();
    await cenario().rotas.anexo(pedir(junior, { id: LEAD, anexoId: 'x' }), r);
    expect(r.statusCode).toBe(400);
  });
});

describe('GET /leads/:id/arquivos.zip — Baixar tudo', () => {
  it('dono do número pessoal: fotos e PDFs do cofre + conversa (inclusive a do número dele), sem áudio, nomes amigáveis', async () => {
    const r = res();
    await cenario().rotas.arquivosZip(pedir(junior, { id: LEAD }), r);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="Ana-Exemplo_arquivos_\d{4}-\d\d-\d\d\.zip"$/);
    expect(r.acabou).toBe(true);
    const nomes = nomesDoZip(Buffer.concat(r.pedacos));
    expect(nomes).toEqual(['Ana-Exemplo_2026-09-20_foto.jpg', 'Ana-Exemplo_2026-09-20_pdf.pdf', 'Ana-Exemplo_2026-09-20_foto_2.jpg', 'Ana-Exemplo_2026-09-20_foto_3.jpg']);
  });
  it('outro usuário da MESMA empresa: a foto do número pessoal do Junior NÃO entra', async () => {
    const r = res();
    await cenario().rotas.arquivosZip(pedir(outroAdmin, { id: LEAD }), r);
    expect(nomesDoZip(Buffer.concat(r.pedacos))).toHaveLength(3);
  });
  it('tenant pedindo lead da casa: 404, nada de .zip', async () => {
    const r = res();
    await cenario().rotas.arquivosZip(pedir(bia, { id: LEAD }), r);
    expect(r.statusCode).toBe(404);
    expect(r.pedacos).toHaveLength(0);
  });
  it('vendedor pedindo lead de OUTRO vendedor: 404', async () => {
    const r = res();
    await cenario({ claimed_by: 'u-outro-vend' }).rotas.arquivosZip(pedir(vendedor, { id: LEAD }), r);
    expect(r.statusCode).toBe(404);
    expect(r.pedacos).toHaveLength(0);
  });
  it('arquivo sumido do storage: fica de fora e o LEIA-ME avisa', async () => {
    const c = cenario();
    delete c.b.arquivos[`client-attachments/${LEAD}/conta_luz/c.pdf`];
    const r = res();
    await c.rotas.arquivosZip(pedir(junior, { id: LEAD }), r);
    expect(nomesDoZip(Buffer.concat(r.pedacos))).toContain('LEIA-ME.txt');
  });
});

describe('GET /leads/midia/:id?baixar=1 — número pessoal só o dono', () => {
  it('dono: nome amigável; outro usuário da empresa: 404', async () => {
    const c = cenario();
    const r1 = res();
    await c.rotas.midia(pedir(junior, { id: MID_PESSOAL }, { baixar: '1' }), r1);
    expect(r1.destino).toMatch(/download=Ana-Exemplo_2026-09-20_foto\.jpg$/);
    const r2 = res();
    await c.rotas.midia(pedir(outroAdmin, { id: MID_PESSOAL }, { baixar: '1' }), r2);
    expect(r2.statusCode).toBe(404);
  });
});
