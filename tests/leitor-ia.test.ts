// Leitor por IA do programa Gerador de Relatórios Solar — tudo com DUBLÊ da Anthropic (sem chamada real).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import { criarRotasLeitorIa, type OpcoesLeitorIa } from '../src/modules/leitor-ia/rotas.js';
import { LimitesLeitor, LIMITES_PADRAO, limitesDoAmbiente } from '../src/modules/leitor-ia/limites.js';
import { verificarLicencaGrs, normalizarCodigo } from '../src/modules/leitor-ia/licenca-grs.js';
import { validarPedidoConta, validarPedidoPrint, mimePelosBytes, textoLimpo, tamanhoDaImagem } from '../src/modules/leitor-ia/contrato.js';
import { numerosDoTexto, numeroConferido, modelosDoAmbiente, textoPedidoConta, type ClienteClaude } from '../src/modules/leitor-ia/leitor.js';

// ---------- licença de teste (par de chaves só do teste, no formato GRS2 do programa) ----------
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUBLICA = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const ALFA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
function codigo(corpo15: string): string {
  let soma = 0;
  for (let i = 0; i < 15; i++) soma += (2 * i + 1) * ALFA.indexOf(corpo15[i]);
  return (corpo15 + ALFA[soma % 32]).match(/.{4}/g)!.join('-');
}
const PC = codigo('ABCDEFGHJKLMNPQ');
const OUTRO_PC = codigo('QPNMLKJHGFEDCBA');
function chave(dados: Record<string, unknown> = {}): string {
  const json = { produto: 'gerador-relatorios-solar', id: 'SUNBRXGHT2', empresa: 'SunBright', marca: 'SunBright', plano: 'essencial', emitidaEm: '2026-09-27', validaAte: null, computadores: [PC], ...dados };
  const corpo = Buffer.from(JSON.stringify(json), 'utf-8').toString('base64url');
  return `GRS2.${corpo}.${sign(null, Buffer.from(corpo, 'utf-8'), privateKey).toString('base64url')}`;
}

// PNG de 1×1 (só os bytes do cabeçalho importam para a validação)
const PNG = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489', 'hex').toString('base64');
const HOJE = new Date('2026-09-28T15:00:00Z');

function pedidoConta(x: Record<string, unknown> = {}) {
  return {
    licenca: chave(), computador: PC, versao: '0.4.5', nivel: 1,
    imagens: [{ mime: 'image/png', base64: PNG, papel: 'pagina' }, { mime: 'image/png', base64: PNG, papel: 'recorte' }],
    campos: [
      { id: 'injetado:atual', rotulo: 'Leitura atual do medidor (injetado)', dica: 'Tabela do medidor, linha "Energia Injetada".' },
      { id: 'consumo:anterior', rotulo: 'Leitura anterior do medidor (consumo)' },
      { id: 'historico:kwh', rotulo: 'Consumo do mês no histórico (kWh)' },
    ],
    contexto: { distribuidora: 'Light', referencia: '2026-08' },
    ...x,
  };
}

function claudeDuble(resposta: unknown, extra: Record<string, unknown> = {}) {
  const create = vi.fn(async (_p: Record<string, unknown>, _o?: unknown) => ({
    stop_reason: 'end_turn',
    usage: { input_tokens: 7000, output_tokens: 300 },
    content: [{ type: 'text', text: JSON.stringify(resposta) }],
    ...extra,
  }));
  return { cliente: { messages: { create } } as unknown as ClienteClaude, create };
}

// ---------- servidor de teste ----------
let srv: Server;
let base = '';
let opcoes: OpcoesLeitorIa;
const logs: Record<string, unknown>[] = [];
const medidas: unknown[] = [];

beforeAll(async () => {
  const app = express();
  // O roteador escolhe o cliente da hora (cada teste troca o dublê).
  app.use((req, res, next) => criarRotasLeitorIa(opcoes)(req, res, next));
  app.use(express.json({ limit: '50mb' })); // como o global do index.ts (não pode atrapalhar)
  srv = app.listen(0);
  await new Promise((ok) => srv.once('listening', ok));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv.close(); });

function montar(claude: ClienteClaude | null, x: Partial<OpcoesLeitorIa> = {}) {
  logs.length = 0;
  medidas.length = 0;
  opcoes = {
    claude, chavePublica: PUBLICA, agora: () => HOJE, limites: new LimitesLeitor(LIMITES_PADRAO, () => HOJE.getTime()),
    log: (r) => logs.push(r), medir: (m) => medidas.push(m), modelos: { 1: 'claude-haiku-4-5-20251001', 2: 'claude-sonnet-5' }, ...x,
  };
}
/** Como o programa manda: licença e computador nos CABEÇALHOS, imagens e campos no corpo. */
function post(rota: string, corpo: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: string;
  if (typeof corpo === 'string') {
    h['X-GRS-Computador'] = PC;
    body = corpo;
  } else {
    const { licenca, computador, ...resto } = corpo as { licenca?: string | null; computador?: string };
    if (computador) h['X-GRS-Computador'] = computador;
    if (licenca) h['X-GRS-Licenca'] = licenca;
    body = JSON.stringify(resto);
  }
  return fetch(`${base}/api/leitor/${rota}`, { method: 'POST', headers: { ...h, ...headers }, body });
}

describe('POST /api/leitor/conta', () => {
  it('licença válida → lê os campos; número só vale se sair do texto impresso; "não sei" vira null', async () => {
    const { cliente, create } = claudeDuble({ campos: [
      { id: 'injetado:atual', texto: '1.580', valor: 1580 },
      { id: 'consumo:anterior', texto: '937', valor: 973 }, // número que não é o do texto → null
      { id: 'historico:kwh', texto: null, valor: null },
      { id: 'total', texto: '10,00', valor: 10 }, // campo não pedido → ignorado
    ] });
    montar(cliente);
    const r = await post('conta', pedidoConta());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, valores: { 'injetado:atual': 1580, 'consumo:anterior': null, 'historico:kwh': null } });
    const params = create.mock.calls[0][0] as { model: string; thinking?: unknown; output_config: { format: { type: string } }; messages: { content: { type: string }[] }[] };
    expect(params.model).toBe('claude-haiku-4-5-20251001');
    expect(params.thinking).toBeUndefined();
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.messages[0].content.filter((b) => b.type === 'image')).toHaveLength(2);
    // observabilidade: licença, modelo, tempo, custo — e NADA da imagem
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ rota: 'conta', ok: true, quem: expect.stringMatching(/^licenca:/), nivel: 1, lidos: 1, tokensEntrada: 7000, tokensSaida: 300 });
    expect(logs[0].custoCentavos).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(PNG.slice(0, 20));
    expect(medidas).toEqual([{ modelo: 'claude-haiku-4-5-20251001', origem: 'leitor-ia:conta', usage: expect.objectContaining({ input_tokens: 7000 }) }]);
  });

  it('nível 2 usa o modelo mais forte, sem "thinking"', async () => {
    const { cliente, create } = claudeDuble({ campos: [] });
    montar(cliente);
    await post('conta', pedidoConta({ nivel: 2 }));
    expect(create.mock.calls[0][0]).toMatchObject({ model: 'claude-sonnet-5', thinking: { type: 'disabled' } });
  });

  it('avaliação (sem licença) funciona com o código do computador; código inventado errado = 401', async () => {
    const { cliente } = claudeDuble({ campos: [] });
    montar(cliente);
    expect((await post('conta', pedidoConta({ licenca: null }))).status).toBe(200);
    expect(logs[0].quem).toMatch(/^avaliacao:[0-9a-f]{8}$/);
    expect((await post('conta', pedidoConta({ licenca: null, computador: 'AAAA-BBBB-CCCC-DDD1' }))).status).toBe(401);
  });

  it('licença alterada, de outro computador, vencida → 401 sem chamar a IA', async () => {
    const { cliente, create } = claudeDuble({ campos: [] });
    montar(cliente);
    const k = chave();
    const adulterada = k.slice(0, 20) + (k[20] === 'A' ? 'B' : 'A') + k.slice(21);
    for (const corpo of [
      pedidoConta({ licenca: adulterada }),
      pedidoConta({ computador: OUTRO_PC }),
      pedidoConta({ licenca: chave({ validaAte: '2026-09-01' }) }),
      pedidoConta({ licenca: chave({ produto: 'outro' }) }),
    ]) {
      const r = await post('conta', corpo);
      expect(r.status).toBe(401);
      expect(await r.json()).toMatchObject({ ok: false, erro: 'licenca' });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('limite do dia por licença → 429 com mensagem clara', async () => {
    const { cliente } = claudeDuble({ campos: [] });
    montar(cliente, { limites: new LimitesLeitor({ ...LIMITES_PADRAO, porLicencaDia: 2 }, () => HOJE.getTime()) });
    expect((await post('conta', pedidoConta())).status).toBe(200);
    expect((await post('conta', pedidoConta())).status).toBe(200);
    const r = await post('conta', pedidoConta());
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ erro: 'limite', mensagem: expect.stringMatching(/limite/) });
    expect(logs[logs.length - 1]).toMatchObject({ ok: false, motivo: 'limite-licenca-dia' });
  });

  it('pedido ruim (arquivo que não é imagem, campo estranho) → 400; corpo enorme → 413 em JSON', async () => {
    montar(claudeDuble({ campos: [] }).cliente);
    const naoImagem = Buffer.from('%PDF-1.7 qualquer coisa').toString('base64');
    expect((await post('conta', pedidoConta({ imagens: [{ mime: 'image/png', base64: naoImagem }] }))).status).toBe(400);
    expect((await post('conta', pedidoConta({ campos: [{ id: 'DROP TABLE', rotulo: 'x' }] }))).status).toBe(400);
    expect((await post('conta', '{quebrado')).status).toBe(400);
    const grande = await post('conta', JSON.stringify({ lixo: 'x'.repeat(18 * 1024 * 1024) }));
    expect(grande.status).toBe(413);
    expect(await grande.json()).toMatchObject({ ok: false, erro: 'grande' });
  });

  it('sem chave da Anthropic ou desligado → 503 (o programa segue como hoje)', async () => {
    montar(null);
    expect((await post('conta', pedidoConta())).status).toBe(503);
    montar(claudeDuble({ campos: [] }).cliente, { desligado: true });
    expect((await post('conta', pedidoConta())).status).toBe(503);
  });

  it('IA recusou / resposta cortada / erro da API → 502, com o motivo no log e a vaga liberada', async () => {
    const lim = new LimitesLeitor({ ...LIMITES_PADRAO, simultaneas: 1 }, () => HOJE.getTime());
    montar(claudeDuble({}, { stop_reason: 'refusal' }).cliente, { limites: lim });
    expect((await post('conta', pedidoConta())).status).toBe(502);
    expect(logs[0]).toMatchObject({ ok: false, motivo: 'recusa' });
    const quebra = { messages: { create: vi.fn().mockRejectedValue(new Error('overloaded')) } } as unknown as ClienteClaude;
    montar(quebra, { limites: lim });
    expect((await post('conta', pedidoConta())).status).toBe(502);
    expect(logs[0]).toMatchObject({ ok: false, motivo: 'api' });
    expect(lim.resumo().andamento).toBe(0);
  });
});

describe('portaria antes do corpo', () => {
  it('sem código do computador ou com licença bloqueada → recusa sem ler as imagens nem chamar a IA', async () => {
    const { cliente, create } = claudeDuble({ campos: [] });
    montar(cliente, { licencasBloqueadas: ['SUNBRXGHT2'] });
    const semPc = await fetch(`${base}/api/leitor/conta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pedidoConta()) });
    expect(semPc.status).toBe(401);
    const r = await post('conta', pedidoConta());
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ erro: 'licenca' });
    expect(create).not.toHaveBeenCalled();
  });

  it('IP que manda pedido demais por minuto → 429 antes de tudo', async () => {
    montar(claudeDuble({ campos: [] }).cliente, { limites: new LimitesLeitor({ ...LIMITES_PADRAO, pedidosIpMinuto: 1 }, () => HOJE.getTime()) });
    expect((await post('conta', pedidoConta())).status).toBe(200);
    const r = await post('conta', pedidoConta());
    expect(r.status).toBe(429);
    expect(logs[logs.length - 1]).toMatchObject({ motivo: 'limite-ip-minuto' });
  });

  it('o pedido de tokens de saída acompanha o número de campos; sem nova tentativa paga', async () => {
    const { cliente, create } = claudeDuble({ campos: [] });
    montar(cliente);
    await post('conta', pedidoConta());
    expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 400 + 45 * 3 });
    expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0, timeout: 40_000 });
  });
});

describe('POST /api/leitor/monitoramento', () => {
  it('lê a geração do print (modelo barato) e confere o número com o texto', async () => {
    const { cliente, create } = claudeDuble({ texto: '388,31', numero: 388.31, unidade: 'kWh', mes: '2026-07', periodo: 'mes', rotulo: 'Rendimento' });
    montar(cliente);
    const r = await post('monitoramento', { licenca: chave(), computador: PC, versao: '0.4.5', imagens: [{ mime: 'image/png', base64: PNG, papel: 'pagina' }], mesAlvo: '2026-07' });
    expect(await r.json()).toEqual({ ok: true, leitura: { texto: '388,31', numero: 388.31, unidade: 'kWh', mes: '2026-07', periodo: 'mes', rotulo: 'Rendimento' } });
    expect(JSON.stringify(create.mock.calls[0][0])).toContain('julho de 2026');
  });

  it('número que não sai do texto ou sem unidade → leitura null', async () => {
    montar(claudeDuble({ texto: '388,31', numero: 38831, unidade: 'kWh', mes: null, periodo: 'mes', rotulo: null }).cliente);
    const corpo = { licenca: null, computador: PC, versao: '0.4.5', imagens: [{ mime: 'image/png', base64: PNG }], mesAlvo: null };
    expect(await (await post('monitoramento', corpo)).json()).toMatchObject({ ok: true, leitura: null });
    montar(claudeDuble({ texto: '388,31', numero: 388.31, unidade: null, mes: null, periodo: 'mes', rotulo: null }).cliente);
    expect(await (await post('monitoramento', corpo)).json()).toMatchObject({ ok: true, leitura: null });
  });
});

describe('peças', () => {
  it('números do texto impresso: milhar, decimal com vírgula, preço com ponto, sinal de menos', () => {
    expect(numerosDoTexto('1.387')).toEqual([1387, 1.387]);
    expect(numerosDoTexto('-198,34')).toEqual([-198.34]);
    expect(numerosDoTexto('0.81927')).toEqual([0.81927]);
    expect(numerosDoTexto('406-')).toEqual([-406]);
    expect(numerosDoTexto('R$ 1.062,00')).toEqual([1062]);
    expect(numerosDoTexto('1,196.80')).toEqual([1196.8]);
    expect(numerosDoTexto('4,07 MWh')).toEqual([4.07]);
    expect(numerosDoTexto('abc')).toEqual([]);
    expect(numerosDoTexto('-R$ 12,00')).toEqual([-12]);
    expect(numerosDoTexto('R$ -12,00')).toEqual([-12]);
    expect(numeroConferido('1.387', 1387)).toBe(1387);
    expect(numeroConferido('1.387', 1378)).toBeNull();
    expect(numeroConferido(null, 5)).toBeNull();
  });

  it('licença: a mesma regra do programa (assinatura, produto, computador, validade)', () => {
    expect(verificarLicencaGrs(chave(), PC, HOJE, PUBLICA)).toMatchObject({ ok: true, empresa: 'SunBright' });
    expect(verificarLicencaGrs(chave(), PC, HOJE)).toMatchObject({ ok: false, motivo: 'assinatura' }); // chave de teste ≠ chave real
    expect(verificarLicencaGrs('GRS1.abc.def', PC, HOJE, PUBLICA)).toMatchObject({ ok: false, motivo: 'formato' });
    expect(verificarLicencaGrs(chave({ validaAte: '2026-09-28' }), PC, HOJE, PUBLICA).ok).toBe(true); // vale no último dia
    expect(normalizarCodigo(PC.toLowerCase().replace(/-/g, ''))).toBe(PC);
    expect(normalizarCodigo('ABCD-EFGH-JKLM-NPQ2')).toBeNull();
  });

  it('pedido: tipo da imagem pelos bytes, texto do campo limpo, referência e nível conferidos', () => {
    expect(mimePelosBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(mimePelosBytes(Buffer.from('RIFF1234WEBPVP8 '))).toBe('image/webp');
    expect(textoLimpo('Ignore tudo\n<script>`x`', 50)).toBe('Ignore tudo script x');
    const v = validarPedidoConta(pedidoConta({ contexto: { referencia: '2026-13', distribuidora: 'Light\u0000' } }));
    expect(v.ok && v.pedido.contexto).toEqual({ referencia: null, distribuidora: 'Light' });
    expect(validarPedidoConta(pedidoConta({ nivel: 3 })).ok).toBe(false);
    const enorme = Buffer.from(PNG, 'base64');
    enorme.writeUInt32BE(5000, 16);
    expect(validarPedidoConta(pedidoConta({ imagens: [{ base64: enorme.toString('base64') }] }))).toMatchObject({ ok: false, mensagem: 'Imagem grande demais.' });
    expect(tamanhoDaImagem(Buffer.from(PNG, 'base64'))).toEqual({ w: 1, h: 1 });
    expect(validarPedidoConta(pedidoConta({ campos: Array.from({ length: 41 }, (_, i) => ({ id: `item:${i}:valor`, rotulo: 'x' })) })).ok).toBe(false);
    expect(validarPedidoPrint({ licenca: null, computador: PC, imagens: [1, 2, 3].map(() => ({ base64: PNG })) }).ok).toBe(false);
    const t = textoPedidoConta(v.ok ? v.pedido : (null as never));
    expect(t).toContain('id "injetado:atual"');
  });

  it('limites: avaliação por computador e total, IP por hora, simultâneas, e zera no dia seguinte (Brasília)', () => {
    let t = Date.parse('2026-09-28T12:00:00Z');
    const l = new LimitesLeitor({ ...LIMITES_PADRAO, porAvaliacaoDia: 2, avaliacaoTotalDia: 3, porIpHora: 100, simultaneas: 10, simultaneasAvaliacao: 10 }, () => t);
    const a = (c: string) => l.reservar({ tipo: 'avaliacao', computador: c }, 'ip');
    expect(a('A').ok && a('A').ok).toBe(true);
    expect(a('A')).toMatchObject({ ok: false, motivo: 'avaliacao-dia' });
    expect(a('B').ok).toBe(true);
    expect(a('C')).toMatchObject({ ok: false, motivo: 'avaliacao-total' });
    t = Date.parse('2026-09-29T03:30:00Z'); // 00:30 em Brasília
    expect(a('A').ok).toBe(true);
    const ip = new LimitesLeitor({ ...LIMITES_PADRAO, porIpHora: 1 }, () => t);
    expect(ip.reservar({ tipo: 'licenca', id: 'X' }, '1.2.3.4').ok).toBe(true);
    expect(ip.reservar({ tipo: 'licenca', id: 'Y' }, '1.2.3.4')).toMatchObject({ ok: false, motivo: 'ip-hora' });
    const sim = new LimitesLeitor({ ...LIMITES_PADRAO, simultaneas: 1 }, () => t);
    const r1 = sim.reservar({ tipo: 'licenca', id: 'X' }, 'a');
    expect(sim.reservar({ tipo: 'licenca', id: 'X' }, 'b')).toMatchObject({ ok: false, motivo: 'ocupado' });
    if (r1.ok) r1.liberar();
    expect(sim.reservar({ tipo: 'licenca', id: 'X' }, 'b').ok).toBe(true);
  });

  it('avaliação tem fila própria (não trava quem pagou); teto em reais; enxurrada por IP por minuto', () => {
    const t = Date.parse('2026-09-28T12:00:00Z');
    const l = new LimitesLeitor({ ...LIMITES_PADRAO, simultaneasAvaliacao: 1, tetoCentavosDia: 100, pedidosIpMinuto: 2 }, () => t);
    const a1 = l.reservar({ tipo: 'avaliacao', computador: 'A' }, 'x');
    expect(l.reservar({ tipo: 'avaliacao', computador: 'B' }, 'y')).toMatchObject({ ok: false, motivo: 'ocupado' });
    expect(l.reservar({ tipo: 'licenca', id: 'L' }, 'z').ok).toBe(true);
    if (a1.ok) a1.liberar();
    l.registrarCusto(150);
    expect(l.reservar({ tipo: 'licenca', id: 'L' }, 'z')).toMatchObject({ ok: false, motivo: 'teto-reais' });
    expect(l.contarPedido('9.9.9.9') && l.contarPedido('9.9.9.9')).toBe(true);
    expect(l.contarPedido('9.9.9.9')).toBe(false);
  });

  it('configuração pelo ambiente (modelos e limites), com padrão seguro', () => {
    expect(modelosDoAmbiente({})).toEqual({ 1: 'claude-sonnet-5', 2: 'claude-opus-5-5' });
    expect(modelosDoAmbiente({ LEITOR_IA_MODELO_RAPIDO: 'claude-sonnet-5', LEITOR_IA_MODELO_FORTE: 'rm -rf' })).toEqual({ 1: 'claude-sonnet-5', 2: 'claude-opus-5-5' });
    expect(limitesDoAmbiente({ LEITOR_IA_LIMITE_LICENCA_DIA: '20', LEITOR_IA_LIMITE_IP_HORA: 'x' })).toMatchObject({ porLicencaDia: 20, porIpHora: LIMITES_PADRAO.porIpHora });
  });
});
