// Histórico do WhatsApp pessoal — a tela "Meu WhatsApp" (botão "Buscar
// histórico (reconectar)" + contador) e as chamadas à Evolution (dublê: nada
// sai de verdade). Também: a lista pessoal esconde Eva/equipe e conversa velha
// do histórico não fica "aguardando resposta".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarRotasNumeroPessoal } from '../src/modules/dashboard/numero-pessoal-rotas.js';
import { renderWhatsappPessoalPage, resultadoWhatsappPessoal, textoTotaisHistorico, textoProgressoHistorico, SCRIPT_HIST } from '../src/modules/dashboard/whatsapp-pessoal-views.js';
import { pedirHistoricoCompleto } from '../src/modules/evolution-conexao.js';
import { listarConversas, resumosPessoais } from '../src/modules/dashboard/conversas-queries.js';
import { definirNumerosInternos, limparCacheInternos } from '../src/modules/numero-pessoal.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';
import { USER_CASA } from './fixtures/miolo-leads.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior Silva', isAdmin: true, permissoes: {} };
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-junior', numero: null, ativo: true };
const req = (o: Record<string, unknown>) => ({ params: {}, body: {}, query: {}, headers: {}, dashUser: junior, ...o }) as any;
function res() {
  const r: any = { statusCode: 200, destino: '' };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (x: string) => { r.corpo = x; return r; };
  r.json = (x: unknown) => { r.corpo = x; return r; };
  r.type = () => r;
  r.setHeader = () => r;
  r.redirect = (a: number | string, b?: string) => { r.destino = typeof a === 'string' ? a : b; return r; };
  return r;
}
const ok = (corpo: unknown = {}, status = 200) => new Response(JSON.stringify(corpo), { status });

beforeEach(() => { limparCacheInternos(); definirNumerosInternos(['5561993077140']); });

describe('pedirHistoricoCompleto (Evolution v2)', () => {
  it('lê os ajustes atuais, liga SÓ a sincronização completa, assina MESSAGES_SET e desconecta', async () => {
    const f = vi.fn(async (url: string, _init?: any) => {
      if (url.includes('/settings/find/')) return ok({ rejectCall: true, msgCall: 'Não atendo ligação', groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: true, syncFullHistory: false });
      return ok({}, url.includes('/instance/logout/') ? 200 : 201);
    });
    const r = await pedirHistoricoCompleto({ baseUrl: 'https://evo.exemplo/', apiKey: 'SEGREDO-API', fetchImpl: f as any }, 'pessoal-junior', 'https://painel.exemplo/webhook', 'tok');
    expect(r).toEqual({ ok: true, webhook: 'ok', desconectou: true });
    const urls = f.mock.calls.map((c) => `${c[1]?.method ?? 'GET'} ${c[0]}`);
    expect(urls).toEqual([
      'GET https://evo.exemplo/settings/find/pessoal-junior',
      'POST https://evo.exemplo/settings/set/pessoal-junior',
      'POST https://evo.exemplo/webhook/set/pessoal-junior',
      'DELETE https://evo.exemplo/instance/logout/pessoal-junior',
    ]);
    // os outros ajustes do dono ficam como estavam
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ rejectCall: true, msgCall: 'Não atendo ligação', groupsIgnore: true, alwaysOnline: false, readMessages: false, readStatus: true, syncFullHistory: true });
    const wh = JSON.parse(f.mock.calls[2][1].body).webhook;
    expect(wh.events).toEqual(['MESSAGES_UPSERT', 'MESSAGES_SET', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE']);
    expect(wh.headers).toEqual({ 'x-webhook-token': 'tok' });
    expect(wh.url).toBe('https://painel.exemplo/webhook');
    // a apikey só vai no cabeçalho
    expect(urls.join(' ')).not.toContain('SEGREDO-API');
    expect(f.mock.calls.every((c) => c[1]?.headers?.apikey === 'SEGREDO-API')).toBe(true);
  });

  it('sem leitura dos ajustes: valores neutros (nunca marca como lida no celular)', async () => {
    const f = vi.fn(async (url: string) => (url.includes('/settings/find/') ? ok({}, 404) : ok()));
    await pedirHistoricoCompleto({ baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: f as any }, 'pessoal-junior');
    expect(JSON.parse((f.mock.calls[1] as any)[1].body)).toEqual({ rejectCall: false, groupsIgnore: false, alwaysOnline: false, readMessages: false, readStatus: false, syncFullHistory: true });
  });

  it('Evolution recusou ligar a sincronização: NÃO desconecta', async () => {
    const f = vi.fn(async (url: string) => (url.includes('/settings/set/') ? ok({ error: 'x' }, 400) : ok()));
    const r = await pedirHistoricoCompleto({ baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: f as any }, 'pessoal-junior');
    expect(r).toEqual({ ok: false, motivo: 'config_falhou' });
    expect(f.mock.calls.some((c) => String(c[0]).includes('/logout/'))).toBe(false);
  });

  it('nome de instância inválido: nem chama', async () => {
    const f = vi.fn();
    expect(await pedirHistoricoCompleto({ baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: f as any }, '../x')).toEqual({ ok: false, motivo: 'nome_invalido' });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('rotas — Buscar histórico (reconectar) + progresso', () => {
  function cenario(o: { np?: any; historico?: boolean } = {}) {
    const b = bancoMemoria({ whatsapp_numeros_pessoais: [o.np ?? NP], audit_log: [], mensagens_whatsapp: [], companies: [] });
    const f = vi.fn(async () => ok());
    const historico = { progresso: vi.fn(() => null), puxarDoServidor: vi.fn(async () => ({ paginas: 1, ok: true })), recomecar: vi.fn() };
    const rotas = criarRotasNumeroPessoal({
      supabase: b.client, evolution: { baseUrl: 'https://evo.exemplo', apiKey: 'k', fetchImpl: f as any },
      instanciaDaEva: 'eva', webhookUrl: 'https://painel.exemplo/webhook', webhookToken: 'tok',
      historico: o.historico === false ? undefined : historico,
    });
    return { b, f, rotas, historico };
  }

  it('dono: liga a sincronização, desconecta, puxa o que a Evolution guardou (em segundo plano) e registra', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.buscarHistorico(req({}), r);
    expect(r.destino).toBe('/dashboard/whatsapp/pessoal?ok=historico_pedido');
    expect(c.f.mock.calls.some((x: any) => String(x[0]).includes('/instance/logout/pessoal-junior'))).toBe(true);
    expect(c.historico.recomecar).toHaveBeenCalledWith('pessoal-junior');
    expect(c.historico.puxarDoServidor).toHaveBeenCalledWith(expect.objectContaining({ instancia: 'pessoal-junior', dono_user_id: 'u-junior' }), expect.objectContaining({ baseUrl: 'https://evo.exemplo' }));
    expect(c.b.tabelas.audit_log[0]).toMatchObject({ acao: 'pediu_historico' });
  });

  it('tenant: 404; outro site: 403; número desligado: não desconecta', async () => {
    const c = cenario();
    const r1 = res();
    await c.rotas.buscarHistorico(req({ dashUser: { ...junior, companyId: 'aaaa1111-2222-3333-4444-555566667777' } }), r1);
    expect(r1.statusCode).toBe(404);
    const r2 = res();
    await c.rotas.buscarHistorico(req({ headers: { origin: 'https://mau.exemplo', host: 'painel.exemplo' } }), r2);
    expect(r2.statusCode).toBe(403);
    const d = cenario({ np: { ...NP, ativo: false } });
    const r3 = res();
    await d.rotas.buscarHistorico(req({}), r3);
    expect(r3.destino).toBe('/dashboard/whatsapp/pessoal?erro=historico_desligado');
    expect(c.f).not.toHaveBeenCalled();
    expect(d.f).not.toHaveBeenCalled();
  });

  it('quem não tem número pessoal (outro admin): nada acontece', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.buscarHistorico(req({ dashUser: { ...junior, id: 'u-bia' } }), r);
    expect(c.f).not.toHaveBeenCalled();
    expect(c.historico.puxarDoServidor).not.toHaveBeenCalled();
  });

  it('historico.json: progresso + totais só do número de quem está logado', async () => {
    const c = cenario();
    c.b.tabelas.mensagens_whatsapp.push(
      { id: '1', company_id: CASA, visivel_so_para: 'u-junior', numero: 'pessoal-junior', contato_telefone: '5561999990001', criado_em: '2026-07-01T12:00:00Z' },
      { id: '2', company_id: CASA, visivel_so_para: 'u-bia', numero: 'pessoal-bia', contato_telefone: '5561999990002', criado_em: '2026-06-01T12:00:00Z' },
    );
    const r = res();
    await c.rotas.historicoJson(req({}), r);
    expect(r.corpo).toEqual({ progresso: null, resumo: { mensagens: 1, conversas: 1, conversasMais: false, maisAntiga: '2026-07-01T12:00:00Z' } });
  });
});

describe('tela Meu WhatsApp — cartão do histórico', () => {
  const base = { user: USER_CASA as any, numero: { instancia: 'pessoal-junior', ativo: true, donoNome: 'Junior' }, estado: 'open' as const };
  const prog = { emAndamento: true, recebidas: 900, gravadas: 1200, repetidas: 0, ignoradas: 50, conversas: 35, maisAntiga: '2026-07-01T15:00:00Z', iniciadoEm: null, atualizadoEm: null, naFila: 400, falhas: 0 };

  it('botão "Buscar histórico (reconectar)" com a explicação do QR, e os totais', () => {
    const h = renderWhatsappPessoalPage({ ...base, historico: { resumo: { mensagens: 3480, conversas: 12, conversasMais: false, maisAntiga: '2026-07-01T15:00:00Z' }, progresso: null, dias: 90, disponivel: true } });
    expect(h).toContain('Histórico das conversas (últimos 90 dias)');
    expect(h).toContain('action="/dashboard/whatsapp/pessoal/historico"');
    expect(h).toContain('Buscar histórico (reconectar)');
    expect(h).toContain('precisa ser conectado de novo');
    expect(h).toContain('Leia UMA vez com o celular');
    expect(h).toContain('12 conversa(s) · 3.480 mensagem(ns) no painel · a mais antiga é de 01/07/2026');
    expect(h).toContain('sem grupos, sem status');
    expect(h).not.toContain('data-vivo="1"');
  });

  it('busca em andamento: contador "N conversas / M mensagens importadas" + a data mais antiga, e o script acompanha', () => {
    const h = renderWhatsappPessoalPage({ ...base, historico: { resumo: null, progresso: prog, dias: 90, disponivel: true } });
    expect(h).toContain('Importando… 35 conversa(s) / 1.200 mensagem(ns) importada(s) · a mais antiga trazida é de 01/07/2026 (400 na fila)');
    expect(h).toContain('data-vivo="1"');
    expect(h).toContain('/dashboard/whatsapp/pessoal/historico.json');
  });

  it('logo depois de pedir (?ok=historico_pedido): explica o QR e acompanha', () => {
    const h = renderWhatsappPessoalPage({ ...base, estado: 'connecting', resultado: resultadoWhatsappPessoal('historico_pedido'), historico: { resumo: null, progresso: null, dias: 90, disponivel: true } });
    expect(h).toContain('Leia o QR abaixo com o celular UMA vez');
    expect(h).toContain('data-vivo="1"');
  });

  it('servidor sem Evolution ou número desligado: sem botão', () => {
    const h1 = renderWhatsappPessoalPage({ ...base, historico: { resumo: null, progresso: null, dias: 90, disponivel: false } });
    expect(h1).not.toContain('/whatsapp/pessoal/historico"');
    const h2 = renderWhatsappPessoalPage({ ...base, numero: { ...base.numero, ativo: false }, historico: { resumo: null, progresso: null, dias: 90, disponivel: true } });
    expect(h2).not.toContain('/whatsapp/pessoal/historico"');
  });

  it('textos: fim da busca e falhas', () => {
    expect(textoProgressoHistorico({ ...prog, emAndamento: false, naFila: 0, repetidas: 10, falhas: 2 })).toBe('Última busca: 35 conversa(s) / 1.200 mensagem(ns) importada(s) · a mais antiga trazida é de 01/07/2026 · 10 já estavam no painel · 2 lote(s) falharam — busque de novo');
    expect(textoTotaisHistorico({ mensagens: 0, conversas: 0, conversasMais: false, maisAntiga: null })).toBe('Nenhuma mensagem deste número no painel ainda.');
    expect(() => new Function(SCRIPT_HIST)).not.toThrow();
  });
});

describe('lista de conversas — número pessoal', () => {
  it('esconde o número da Eva e a equipe (contatos_internos), inclusive linhas antigas', async () => {
    const linha = (tel: string, texto: string) => ({ id: tel, company_id: CASA, lead_id: null, contato_telefone: tel, contato_nome: null, direcao: 'entrada', autor: 'cliente', canal: 'whatsapp_business', numero: 'pessoal-junior', tipo: 'texto', texto, status: 'recebida', visivel_so_para: USER_CASA.id, criado_em: new Date().toISOString() });
    const b = bancoMemoria({
      conversations: [], leads: [],
      contatos_internos: [{ id: 'c1', company_id: CASA, telefone: '61988880000', ativo: true }],
      mensagens_whatsapp: [linha('5561993077140', '🔔 aviso da Eva'), linha('5561988880000', 'recado'), linha('5562977776666', 'oi, quero orçamento')],
    });
    const lista = await listarConversas(b.client, USER_CASA as any, {}, b.client);
    expect(lista.itens.map((i) => i.telefone)).toEqual(['5562977776666']);
  });

  it('conversa do histórico (antiga) não conta como "aguardando resposta"; recente conta', () => {
    const agora = Date.parse('2026-09-28T17:00:00Z');
    const r = (tel: string, dias: number) => ({ id: tel, company_id: CASA, lead_id: null, contato_telefone: tel, contato_nome: null, direcao: 'entrada', autor: 'cliente', canal: 'whatsapp_business', numero: 'x', tipo: 'texto', texto: 'oi', modelo: null, evento: null, origem: 'webhook', wamid: tel, status: 'recebida', erro: null, user_id: null, autor_nome: null, visivel_so_para: 'u', criado_em: new Date(agora - dias * 86_400_000).toISOString(), enviada_em: null }) as any;
    const out = resumosPessoais([r('5561911110001', 40), r('5561911110002', 1)], [], agora);
    expect(out.find((c) => c.telefone === '5561911110001')).toMatchObject({ aguardandoResposta: false, ultimaDe: 'cliente' });
    expect(out.find((c) => c.telefone === '5561911110002')).toMatchObject({ aguardandoResposta: true });
  });
});
