// Responder SEM RECARREGAR a página (Junior 28/09: "quando envio não sai suave,
// demora e dá um toque na tela inteira"). Duas partes:
//  1) as ROTAS devolvem JSON quando o navegador pede (Accept: application/json)
//     — sem isso continua o redirect de sempre (sem JS funciona igual);
//  2) o SCRIPT da tela: balão otimista "enviando…" → "✓ enviado" / "⚠ não saiu",
//     botão travado enquanto envia, campo limpo com foco, texto volta se falhar,
//     chave nova a cada resposta, e a conversa se atualiza sozinha (pausa com a
//     aba escondida). DOM de mentira (o projeto não usa jsdom) e fetch dublê.
import { describe, it, expect, vi } from 'vitest';
import { criarRotasAtendimento, querJson } from '../src/modules/dashboard/atendimento-rotas.js';
import { LimiteDeEnvio } from '../src/modules/dashboard/atendimento-envio.js';
import { SCRIPT_RESPONDER, assinaturaDaConversa } from '../src/modules/dashboard/atendimento-views.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';
import { parseDocument } from 'htmlparser2';

const CASA = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';
const CHAVE = '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const agora = Date.parse('2026-09-28T17:00:00Z');
const hAtras = (h: number) => new Date(agora - h * 3600_000).toISOString();
const junior = { id: 'u-junior', companyId: CASA, nome: 'Junior', isAdmin: true, permissoes: {} };
const bia = { id: 'u-bia', companyId: TENANT, nome: 'Bia', isAdmin: true, permissoes: {} };
const NP = { id: 'np1', company_id: CASA, dono_user_id: 'u-junior', dono_nome: 'Junior', instancia: 'pessoal-junior', numero: null, ativo: true };
const JSON_H = { accept: 'application/json' };

function cenario(o: { ultimaDoCliente?: number } = {}) {
  const b = bancoMemoria({
    leads: [{ id: LEAD, company_id: CASA, name: 'Ana Exemplo', phone: '61999990001', status: 'novo', eva_active: true, opt_out: false, claimed_by: null, created_at: hAtras(48) }],
    conversations: [{ id: 'cv1', company_id: CASA, lead_id: LEAD, created_at: hAtras(30), messages: [{ role: 'user', content: 'Oi, quero orçamento', timestamp: hAtras(o.ultimaDoCliente ?? 2) }] }],
    eva_cadence: [], mensagens_whatsapp: [], lead_atividades: [], audit_log: [], lead_anexos: [],
    whatsapp_numeros_pessoais: [NP],
  }, { mensagens_whatsapp: [['company_id', 'chave_envio'], ['company_id', 'wamid']] });
  const waba = { sendText: vi.fn(async () => ({ messageId: 'wamid.T1' })), sendTemplate: vi.fn(async () => ({ messageId: 'wamid.M1' })) };
  const enviarPessoal = vi.fn(async () => ({ messageId: 'EVO1' }));
  const rotas = criarRotasAtendimento({
    supabase: b.client, banco: () => b.client, waba, instanciaDaEmpresa: async () => null,
    engineerPhone: '5561998805002', enviarPessoal, limite: new LimiteDeEnvio(100, 0), agora: () => agora,
  });
  return { b, waba, enviarPessoal, rotas };
}
const req = (o: Record<string, unknown>) => ({ params: {}, body: {}, query: {}, headers: {}, dashUser: junior, ...o }) as any;
function res() {
  const r: any = { statusCode: 200, corpo: undefined, destino: '', json: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.send = (x: string) => { r.corpo = x; return r; };
  r.json = (x: unknown) => { r.corpo = x; r.ehJson = true; return r; };
  r.setHeader = () => r;
  r.redirect = (a: number | string, b?: string) => { r.destino = typeof a === 'string' ? a : b; return r; };
  return r;
}

describe('rotas — JSON quando o navegador pede (envio sem recarregar)', () => {
  it('querJson: só com Accept: application/json', () => {
    expect(querJson({ headers: JSON_H } as any)).toBe(true);
    expect(querJson({ headers: { accept: 'text/html' } } as any)).toBe(false);
    expect(querJson({ headers: {} } as any)).toBe(false);
  });

  it('enviada: JSON com ok, texto traduzido e a chave do PRÓXIMO clique (sem redirect); envio e gravação iguais', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ params: { id: LEAD }, headers: JSON_H, body: { chave: CHAVE, texto: 'Oi Ana!' } }), r);
    expect(r.destino).toBe('');
    expect(r.corpo).toMatchObject({ ok: true, resultado: 'enviada', tom: 'ok', texto: 'Mensagem enviada. Você assumiu a conversa.' });
    expect(r.corpo.chave).toMatch(UUID);
    expect(r.corpo.chave).not.toBe(CHAVE);
    expect(c.waba.sendText).toHaveBeenCalledTimes(1);
    expect(c.b.tabelas.mensagens_whatsapp.find((m) => m.direcao === 'saida')).toMatchObject({ chave_envio: CHAVE, status: 'enviada' });
    expect(c.b.tabelas.leads[0].eva_active).toBe(false);
  });

  it('bloqueio (janela fechada): ok=false com o motivo e o aviso pronto; nada sai', async () => {
    const c = cenario({ ultimaDoCliente: 30 });
    const r = res();
    await c.rotas.responder(req({ params: { id: LEAD }, headers: JSON_H, body: { chave: CHAVE, texto: 'Oi' } }), r);
    expect(r.corpo).toMatchObject({ ok: false, resultado: 'janela_fechada' });
    expect(r.corpo.avisoHtml).toContain('A janela de 24 h fechou');
    expect(c.waba.sendText).not.toHaveBeenCalled();
  });

  it('clique repetido com a MESMA chave: "duplicado", a 2ª não sai', async () => {
    const c = cenario();
    await c.rotas.responder(req({ params: { id: LEAD }, headers: JSON_H, body: { chave: CHAVE, texto: 'Oi' } }), res());
    const r2 = res();
    await c.rotas.responder(req({ params: { id: LEAD }, headers: JSON_H, body: { chave: CHAVE, texto: 'Oi' } }), r2);
    expect(r2.corpo).toMatchObject({ ok: false, resultado: 'duplicado' });
    expect(c.waba.sendText).toHaveBeenCalledTimes(1);
  });

  it('erros de verdade viram JSON com o status certo (id inválido 400, outra origem 403, lead de outra empresa 404)', async () => {
    const c = cenario();
    const r1 = res();
    await c.rotas.responderModelo(req({ params: { id: 'x' }, headers: JSON_H, body: { chave: CHAVE } }), r1);
    expect(r1.statusCode).toBe(400);
    expect(r1.corpo).toMatchObject({ ok: false });
    const r2 = res();
    await c.rotas.responder(req({ params: { id: LEAD }, headers: { ...JSON_H, origin: 'https://mal.example', host: 'painel.example' }, body: { chave: CHAVE, texto: 'Oi' } }), r2);
    expect(r2.statusCode).toBe(403);
    expect(r2.ehJson).toBe(true);
    const r3 = res();
    await c.rotas.responder(req({ dashUser: bia, params: { id: LEAD }, headers: JSON_H, body: { chave: CHAVE, texto: 'Oi' } }), r3);
    expect(r3.statusCode).toBe(404);
    expect(c.waba.sendText).not.toHaveBeenCalled();
  });

  it('sem Accept JSON: o redirect de sempre (sem JavaScript funciona igual)', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.responder(req({ params: { id: LEAD }, body: { chave: CHAVE, texto: 'Oi' } }), r);
    expect(r.destino).toBe(`/dashboard/leads/${LEAD}?resp=enviada#responder`);
    expect(r.ehJson).toBeUndefined();
  });

  it('contato (número pessoal, não é lead): JSON também', async () => {
    const c = cenario();
    c.b.tabelas.mensagens_whatsapp.push({ id: 'p1', company_id: CASA, lead_id: null, contato_telefone: '5561988887777', contato_nome: 'Zé', direcao: 'entrada', autor: 'cliente', canal: 'whatsapp_business', numero: 'pessoal-junior', tipo: 'texto', texto: 'e aí', origem: 'webhook', status: 'recebida', visivel_so_para: 'u-junior', criado_em: hAtras(1) });
    const r = res();
    await c.rotas.responderContato(req({ headers: JSON_H, body: { chave: CHAVE, telefone: '5561988887777', texto: 'Fala, Zé' } }), r);
    expect(r.corpo).toMatchObject({ ok: true, resultado: 'enviada' });
    expect(c.enviarPessoal).toHaveBeenCalledWith('pessoal-junior', '5561988887777', 'Fala, Zé');
  });
});

describe('GET /leads/:id/conversa.json — a conversa aberta se atualiza sozinha', () => {
  it('devolve os pedaços (topo, balões, campo) + assinatura; com a mesma assinatura só diz "igual"', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.conversaJson(req({ params: { id: LEAD }, query: { canal: 'eva_oficial' } }), r);
    expect(r.statusCode).toBe(200);
    expect(r.corpo.msgs).toContain('Oi, quero orçamento');
    expect(r.corpo.topo).toContain('id="cc-at-topo"');
    expect(r.corpo.topo).toContain('✋ Assumir');
    expect(r.corpo.compor).toContain('id="responder"');
    expect(r.corpo.estado).toMatch(/^eva_oficial\|livre\|livre\|\d+$/);
    expect(r.corpo.assinatura).toBe(assinaturaDaConversa(r.corpo));
    const r2 = res();
    await c.rotas.conversaJson(req({ params: { id: LEAD }, query: { canal: 'eva_oficial', assinatura: r.corpo.assinatura } }), r2);
    expect(r2.corpo).toEqual({ igual: true, assinatura: r.corpo.assinatura });
  });

  it('depois de responder: balão novo, faixa "Junior assumiu" e assinatura diferente', async () => {
    const c = cenario();
    const r0 = res();
    await c.rotas.conversaJson(req({ params: { id: LEAD }, query: {} }), r0);
    await c.rotas.responder(req({ params: { id: LEAD }, headers: JSON_H, body: { chave: CHAVE, texto: 'Já te mando a proposta' } }), res());
    const r = res();
    await c.rotas.conversaJson(req({ params: { id: LEAD }, query: { assinatura: r0.corpo.assinatura } }), r);
    expect(r.corpo.igual).toBeUndefined();
    expect(r.corpo.msgs).toContain('Já te mando a proposta');
    expect(r.corpo.topo).toContain('Junior assumiu');
    expect(r.corpo.topo).toContain('Devolver para a Eva');
  });

  it('janela fechada: estado muda (o rodapé é redesenhado com o modelo)', async () => {
    const c = cenario({ ultimaDoCliente: 30 });
    const r = res();
    await c.rotas.conversaJson(req({ params: { id: LEAD }, query: {} }), r);
    expect(r.corpo.estado).toContain('janela_fechada');
    expect(r.corpo.compor).toContain('Janela fechada');
  });

  it('lead de OUTRA empresa: 404 (nada vaza); id inválido: 400', async () => {
    const c = cenario();
    const r = res();
    await c.rotas.conversaJson(req({ dashUser: bia, params: { id: LEAD } }), r);
    expect(r.statusCode).toBe(404);
    expect(JSON.stringify(r.corpo)).not.toContain('orçamento');
    const r2 = res();
    await c.rotas.conversaJson(req({ params: { id: '../x' } }), r2);
    expect(r2.statusCode).toBe(400);
  });

  it('vendedor que não pode ver o lead (de outro vendedor): 403', async () => {
    const c = cenario();
    c.b.tabelas.leads[0].claimed_by = 'u-outro';
    const vend = { id: 'u-vend', companyId: CASA, nome: 'Vend', isAdmin: false, permissoes: { leads: ['visualizar', 'editar'] } };
    const r = res();
    await c.rotas.conversaJson(req({ dashUser: vend, params: { id: LEAD } }), r);
    expect(r.statusCode).toBe(403);
  });
});

describe('GET /leads/conversas/contato.json — conversa pessoal com quem não é lead', () => {
  const linha = { id: 'p1', company_id: CASA, lead_id: null, contato_telefone: '5561988887777', contato_nome: 'Zé', direcao: 'entrada', autor: 'cliente', canal: 'whatsapp_business', numero: 'pessoal-junior', tipo: 'texto', texto: 'e aí', origem: 'webhook', status: 'recebida', visivel_so_para: 'u-junior', criado_em: hAtras(1) };
  it('o dono recebe os balões; quem não é o dono recebe 404', async () => {
    const c = cenario();
    c.b.tabelas.mensagens_whatsapp.push({ ...linha });
    const r = res();
    await c.rotas.contatoJson(req({ query: { contato: '5561988887777' } }), r);
    expect(r.corpo.msgs).toContain('e aí');
    expect(r.corpo.estado).toBe('pessoal|livre');
    const outro = res();
    await c.rotas.contatoJson(req({ dashUser: { ...junior, id: 'u-outro' }, query: { contato: '5561988887777' } }), outro);
    expect(outro.statusCode).toBe(404);
  });
  it('virou lead no meio do caminho: manda abrir o lead', async () => {
    const c = cenario();
    c.b.tabelas.mensagens_whatsapp.push({ ...linha, lead_id: LEAD });
    const r = res();
    await c.rotas.contatoJson(req({ query: { contato: '5561988887777' } }), r);
    expect(r.corpo).toEqual({ irPara: `/dashboard/leads/${LEAD}?canal=whatsapp_business` });
  });
});

// ---------------------------------------------------------------------------
// O script, com um DOM de mentira (só o que ele usa).
// ---------------------------------------------------------------------------

type Ouvinte = (e: any) => void;
class El {
  tagName: string; id = ''; attrs: Record<string, string> = {}; children: El[] = []; parentNode: El | null = null;
  classes = new Set<string>(); _texto = ''; value = ''; disabled = false; name = ''; type = '';
  scrollTop = 0; scrollHeight = 1000; clientHeight = 300; form: El | null = null; doc: FakeDoc;
  private _html = '';
  constructor(doc: FakeDoc, tag: string) { this.doc = doc; this.tagName = tag.toUpperCase(); }
  get className() { return [...this.classes].join(' '); }
  set className(v: string) { this.classes = new Set(v.split(/\s+/).filter(Boolean)); }
  get classList() { const c = this.classes; return { add: (x: string) => c.add(x), remove: (x: string) => c.delete(x), contains: (x: string) => c.has(x) }; }
  get textContent(): string { return this._texto + this.children.map((c) => c.textContent).join(''); }
  set textContent(v: string) { this._texto = v; this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v: string) {
    this._html = v; this.children = []; this._texto = '';
    // <template>: monta os nós de verdade em .content (o script compara e move balões).
    if (this.tagName === 'TEMPLATE') { const c = (this as any).content as El; c.children = []; c._texto = ''; for (const n of parseDocument(v).children) doHtml(this.doc, c, n); }
  }
  isEqualNode(o: El): boolean {
    return !!o && o.tagName === this.tagName && o.id === this.id && o.className === this.className && o._texto === this._texto
      && JSON.stringify(o.attrs) === JSON.stringify(this.attrs) && o.children.length === this.children.length
      && this.children.every((c, i) => c.isEqualNode(o.children[i]));
  }
  removeChild(c: El) { c.remove(); return c; }
  getAttribute(n: string) { return n === 'id' ? this.id || null : n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n: string, v: string) { if (n === 'id') this.id = v; else this.attrs[n] = String(v); }
  hasAttribute(n: string) { return n in this.attrs; }
  appendChild(c: El) { c.parentNode = this; this.children.push(c); return c; }
  insertBefore(c: El, ref: El | null) { c.parentNode = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; }
  replaceChild(n: El, o: El) { const i = this.children.indexOf(o); n.parentNode = this; this.children[i] = n; return o; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
  get firstChild() { return this.children[0] ?? null; }
  focus() { this.doc.activeElement = this; }
  setSelectionRange() {}
  todos(): El[] { return this.children.flatMap((c) => [c, ...c.todos()]); }
  matches(sel: string): boolean {
    const m = /^([a-z]+)?(?:#([\w-]+))?(?:\.([\w-]+))?(?:\[([\w-]+)(?:=([\w-]+))?\])?$/i.exec(sel.trim());
    if (!m) return false;
    const [, tag, id, cls, attr, val] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (id && this.id !== id) return false;
    if (cls && !this.classes.has(cls)) return false;
    if (attr) {
      const v = this.attrs[attr];
      if (v === undefined) return false;
      if (val !== undefined && v !== val) return false;
    }
    return true;
  }
  querySelectorAll(sel: string): El[] { return this.todos().filter((e) => e.matches(sel)); }
  querySelector(sel: string): El | null { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel: string): El | null { let e: El | null = this; while (e) { if (e.matches(sel)) return e; e = e.parentNode; } return null; }
  requestSubmit() { this.doc.disparar('submit', { target: this }); }
}
class FakeDoc {
  body: El; activeElement: El | null = null; hidden = false; ouvintes: Record<string, Ouvinte[]> = {};
  constructor() { this.body = new El(this, 'body'); }
  createElement(tag: string) { const e = new El(this, tag); if (tag === 'template') (e as any).content = new El(this, 'fragment'); return e; }
  getElementById(id: string) { return this.body.todos().find((e) => e.id === id) ?? null; }
  querySelectorAll(sel: string) { return this.body.querySelectorAll(sel); }
  querySelector(sel: string) { return this.body.querySelector(sel); }
  addEventListener(t: string, f: Ouvinte) { (this.ouvintes[t] ??= []).push(f); }
  disparar(t: string, e: Record<string, unknown>) { let parou = false; const ev = { preventDefault: () => { parou = true; }, ...e }; for (const f of this.ouvintes[t] ?? []) f(ev); return parou; }
}
/** htmlparser2 → El (texto vai para o pai; só o que os testes usam). */
function doHtml(doc: FakeDoc, pai: El, n: any): void {
  if (n.type === 'text') { (pai as any)._texto += n.data; return; }
  if (n.type !== 'tag' && n.type !== 'script' && n.type !== 'style') return;
  const e = doc.createElement(n.name);
  for (const [k, v] of Object.entries(n.attribs ?? {})) { if (k === 'class') e.className = String(v); else e.setAttribute(k, String(v)); }
  pai.appendChild(e);
  for (const f of n.children ?? []) doHtml(doc, e, f);
}
(El.prototype as any).contains = function (this: El, x: El) { return this === x || this.todos().includes(x); };

/** Tela mínima: conversa + balões + rodapé com o formulário de texto. */
function montarTela(o: { conversa?: string | null } = {}) {
  const doc = new FakeDoc();
  const el = (tag: string, props: Partial<El> & { attrs?: Record<string, string>; cls?: string } = {}) => {
    const e = doc.createElement(tag);
    if (props.cls) e.className = props.cls;
    if (props.id) e.id = props.id;
    if (props.attrs) Object.assign(e.attrs, props.attrs);
    if (props.name) { e.name = props.name; e.attrs.name = props.name; }
    if (props.type) { e.type = props.type; e.attrs.type = props.type; }
    if (props.value !== undefined) e.value = props.value;
    return e;
  };
  const chat = el('section', { id: 'conversa', attrs: o.conversa === null ? {} : { 'data-conversa': o.conversa ?? `/dashboard/leads/${LEAD}/conversa.json?canal=eva_oficial`, 'data-estado': 'eva_oficial|livre|livre|0', 'data-assinatura': 'A1' } });
  doc.body.appendChild(chat);
  const msgs = chat.appendChild(el('div', { id: 'cc-at-msgs', cls: 'cc-at-msgs' }));
  msgs.appendChild(el('div', { cls: 'cc-at-vazio' }));
  const footer = chat.appendChild(el('footer', { id: 'responder', cls: 'cc-at-compor' }));
  const form = footer.appendChild(el('form', { attrs: { 'data-envio': '', action: `/dashboard/leads/${LEAD}/responder` } }));
  const chave = form.appendChild(el('input', { name: 'chave', type: 'hidden', value: CHAVE }));
  const ta = form.appendChild(el('textarea', { id: 'cc-at-texto', name: 'texto' }));
  ta.form = form;
  const btn = form.appendChild(el('button', { type: 'submit', cls: 'cc-at-enviar' }));
  btn.textContent = 'Enviar';
  return { doc, chat, msgs, footer, form, chave, ta, btn };
}

class FakeFormData {
  pares: Array<[string, string]>;
  constructor(f: El) { this.pares = f.todos().filter((e) => e.name).map((e) => [e.name, e.value]); }
  [Symbol.iterator]() { return this.pares[Symbol.iterator](); }
}

function rodarScript(t: ReturnType<typeof montarTela>, fetchImpl: (...a: any[]) => Promise<any>) {
  const timers: Array<() => void> = [];
  const win: any = { fetch: fetchImpl, FormData: FakeFormData, URLSearchParams };
  const location = { href: '' };
  new Function('document', 'window', 'fetch', 'FormData', 'URLSearchParams', 'location', 'setInterval', 'setTimeout',
    SCRIPT_RESPONDER)(t.doc, win, fetchImpl, FakeFormData, URLSearchParams, location, (f: () => void) => { timers.push(f); return 1; }, (f: () => void) => { f(); return 1; });
  return { tique: () => timers.forEach((f) => f()), location, win, timers };
}
const esperar = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const respostaJson = (corpo: unknown, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(corpo) });

describe('script do responder — sem recarregar', () => {
  it('compila (nada de sintaxe quebrada dentro da string)', () => {
    expect(() => new Function(SCRIPT_RESPONDER)).not.toThrow();
  });

  it('enviar: impede o POST normal, balão "enviando…" na hora, campo limpo com foco, botão travado; depois "✓ enviado" e chave nova', async () => {
    const t = montarTela();
    let liberar!: (v: unknown) => void;
    const chamadas: any[] = [];
    const fetchImpl = vi.fn((url: string, init?: any) => {
      chamadas.push({ url, init });
      if (init?.method === 'POST') return new Promise((ok) => { liberar = ok; });
      return respostaJson({ igual: true, assinatura: 'A1' });
    });
    rodarScript(t, fetchImpl);
    t.ta.value = '  Oi Ana!  ';
    const barrou = t.doc.disparar('submit', { target: t.form });
    expect(barrou).toBe(true);
    const post = chamadas.find((c) => c.init?.method === 'POST');
    expect(post.url).toBe(`/dashboard/leads/${LEAD}/responder`);
    expect(post.init.headers.Accept).toBe('application/json');
    expect(post.init.body).toContain(`chave=${CHAVE}`);
    expect(post.init.body).toContain('texto=++Oi+Ana%21++');
    const bal = t.msgs.querySelector('.cc-at-msg-otimista')!;
    expect(bal.textContent).toContain('Oi Ana!');
    // nasce igual ao balão de verdade: hora + "enviando…" (e o nome de quem envia, quando a tela tem data-eu)
    expect(bal.querySelector('.cc-at-msg-h')!.textContent).toMatch(/^\d\d:\d\d · enviando…$/);
    expect(t.msgs.querySelector('.cc-at-vazio')).toBeNull();
    expect(t.ta.value).toBe('');
    expect(t.doc.activeElement).toBe(t.ta);
    expect(t.btn.disabled).toBe(true);
    expect(t.btn.textContent).toBe('Enviando…');

    // 2º clique enquanto envia: nada sai
    t.doc.disparar('submit', { target: t.form });
    expect(chamadas.filter((c) => c.init?.method === 'POST')).toHaveLength(1);

    liberar({ ok: true, json: () => Promise.resolve({ ok: true, resultado: 'enviada', texto: 'Mensagem enviada.', chave: 'nova-chave' }) });
    await esperar();
    expect(bal.querySelector('.cc-at-msg-h')!.textContent).toMatch(/^\d\d:\d\d ✓$/);
    expect(t.chave.value).toBe('nova-chave');
    expect(t.btn.disabled).toBe(false);
    expect(t.btn.textContent).toBe('Enviar');
    // e já busca a conversa atualizada (sem assinatura: quer tudo)
    const get = chamadas.filter((c) => !c.init?.method);
    expect(get.at(-1).url).toBe(`/dashboard/leads/${LEAD}/conversa.json?canal=eva_oficial&assinatura=`);
  });

  it('falhou: "⚠ não saiu — motivo", aviso no rodapé, o texto VOLTA pro campo', async () => {
    const t = montarTela();
    const fetchImpl = vi.fn((_u: string, init?: any) => init?.method === 'POST'
      ? respostaJson({ ok: false, resultado: 'janela_fechada', texto: 'A janela de 24 h fechou. Use um modelo aprovado.', avisoHtml: '<div class="cc-aviso">fechou</div>', chave: 'k2' })
      : respostaJson({ igual: true }));
    rodarScript(t, fetchImpl);
    t.ta.value = 'Oi';
    t.doc.disparar('submit', { target: t.form });
    await esperar();
    const bal = t.msgs.querySelector('.cc-at-msg-otimista')!;
    expect(bal.querySelector('.cc-at-msg-falha')!.textContent).toBe('⚠ não saiu — A janela de 24 h fechou. Use um modelo aprovado.');
    expect(t.footer.querySelector('.cc-at-aviso-envio')!.innerHTML).toContain('fechou');
    expect(t.ta.value).toBe('Oi');
    expect(t.chave.value).toBe('k2');
    // não é "falhou" do WhatsApp: não precisa rebuscar a conversa
    expect(fetchImpl.mock.calls.filter((c) => !(c[1] as any)?.method)).toHaveLength(0);
  });

  it('sem rede: marca "não saiu", devolve o texto e MANTÉM a chave (reenvio vira "já enviada", nunca duplicada)', async () => {
    const t = montarTela();
    const fetchImpl = vi.fn(() => Promise.reject(new Error('offline')));
    rodarScript(t, fetchImpl);
    t.ta.value = 'Oi';
    t.doc.disparar('submit', { target: t.form });
    await esperar();
    expect(t.msgs.querySelector('.cc-at-msg-falha')!.textContent).toContain('sem conexão com o painel');
    expect(t.ta.value).toBe('Oi');
    expect(t.chave.value).toBe(CHAVE);
    expect(t.btn.disabled).toBe(false);
  });

  it('"duplicado" (a 1ª já tinha saído): NÃO devolve o texto pro campo (3º clique não manda de novo) e atualiza a conversa', async () => {
    const t = montarTela();
    const fetchImpl = vi.fn((_u: string, init?: any) => init?.method === 'POST'
      ? respostaJson({ ok: false, resultado: 'duplicado', texto: 'Essa mensagem já tinha sido enviada', avisoHtml: '<div>já</div>', chave: 'k3' })
      : respostaJson({ igual: true }));
    rodarScript(t, fetchImpl);
    t.ta.value = 'Oi';
    t.doc.disparar('submit', { target: t.form });
    await esperar();
    expect(t.ta.value).toBe('');
    expect(t.msgs.querySelector('.cc-at-msg-h')!.textContent).toMatch(/^\d\d:\d\d ✓$/);
    expect(fetchImpl.mock.calls.some((c) => !(c[1] as any)?.method)).toBe(true);
  });

  it('busca que já estava no ar quando o envio começou NÃO apaga o balão "enviando…"', async () => {
    const t = montarTela();
    let soltarGet!: (v: unknown) => void;
    const fetchImpl = vi.fn((_u: string, init?: any) => init?.method === 'POST'
      ? new Promise(() => {})
      : new Promise((ok) => { soltarGet = ok; }));
    const s = rodarScript(t, fetchImpl);
    s.tique();
    t.ta.value = 'Oi';
    t.doc.disparar('submit', { target: t.form });
    soltarGet({ ok: true, json: () => Promise.resolve({ assinatura: 'A9', msgs: '<div>velho</div>', estado: 'x', compor: '' }) });
    await esperar();
    expect(t.msgs.querySelector('.cc-at-msg-otimista')).not.toBeNull();
    expect(t.msgs.innerHTML).toBe('');
  });

  it('conversa parada: depois de 4 respostas "igual" busca 1 a cada 3 tiques (≈ 24 s)', async () => {
    const t = montarTela();
    const fetchImpl = vi.fn(() => respostaJson({ igual: true }));
    const s = rodarScript(t, fetchImpl);
    for (let i = 0; i < 4; i++) { s.tique(); await esperar(); }
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 6; i++) { s.tique(); await esperar(); }
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('campo vazio: nada sai', () => {
    const t = montarTela();
    const fetchImpl = vi.fn(() => respostaJson({}));
    rodarScript(t, fetchImpl);
    t.ta.value = '   ';
    t.doc.disparar('submit', { target: t.form });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('atualização sozinha: a cada tique pede com a assinatura; "igual" não mexe; novidade troca os balões; aba escondida = pausa', async () => {
    const t = montarTela();
    const respostas = [{ igual: true, assinatura: 'A1' }, { assinatura: 'A2', msgs: '<div>nova</div>', estado: 'eva_oficial|livre|livre|0', compor: '' }];
    const fetchImpl = vi.fn(() => respostaJson(respostas.shift()));
    const s = rodarScript(t, fetchImpl);
    s.tique();
    await esperar();
    expect(fetchImpl).toHaveBeenLastCalledWith(`/dashboard/leads/${LEAD}/conversa.json?canal=eva_oficial&assinatura=A1`, expect.anything());
    expect(t.msgs.innerHTML).toBe('');
    s.tique();
    await esperar();
    // o balão novo ENTRA (sem innerHTML do chat inteiro); o "vazio" sai
    expect(t.msgs.children.map((c) => c.textContent)).toEqual(['nova']);
    expect(t.msgs.innerHTML).toBe('');
    t.doc.hidden = true;
    s.tique();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    t.doc.hidden = false;
    s.tique();
    await esperar();
    expect(fetchImpl).toHaveBeenLastCalledWith(`/dashboard/leads/${LEAD}/conversa.json?canal=eva_oficial&assinatura=A2`, expect.anything());
  });

  it('contato virou lead: vai para a página do lead', async () => {
    const t = montarTela({ conversa: '/dashboard/leads/conversas/contato.json?contato=5561988887777' });
    const fetchImpl = vi.fn(() => respostaJson({ irPara: `/dashboard/leads/${LEAD}?canal=whatsapp_business` }));
    const s = rodarScript(t, fetchImpl);
    s.tique();
    await esperar();
    expect(s.location.href).toBe(`/dashboard/leads/${LEAD}?canal=whatsapp_business`);
  });

  it('sem data-conversa (sem envio ligado): não fica buscando', () => {
    const t = montarTela({ conversa: null });
    const fetchImpl = vi.fn(() => respostaJson({}));
    const s = rodarScript(t, fetchImpl);
    s.tique();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Troca suave (28/09): enviar e atualizar SEM trocar o chat inteiro; trocar de
// contato desmonta/monta o script sem ouvinte nem relógio duplicado.
// ---------------------------------------------------------------------------
function comBaloes(t: ReturnType<typeof montarTela>, html: string) {
  const tpl = t.doc.createElement('template');
  tpl.innerHTML = html;
  t.msgs.children = [];
  for (const c of [...(tpl as any).content.children]) t.msgs.appendChild(c);
}
const B = (k: string, txt: string) => `<div class="cc-at-msg" data-k="${k}"><div class="cc-at-msg-t">${txt}</div></div>`;

describe('troca suave — balões por diferença e troca de contato', () => {
  it('atualização: balões que não mudaram ficam (MESMO nó — foto/áudio não recarregam); o novo só entra no fim', async () => {
    const t = montarTela();
    comBaloes(t, B('1', 'oi') + B('2', 'tudo bem?'));
    const [a, b] = t.msgs.children;
    const fetchImpl = vi.fn(() => respostaJson({ assinatura: 'A2', msgs: B('1', 'oi') + B('2', 'tudo bem?') + B('3', 'novo'), estado: 'eva_oficial|livre|livre|0', compor: '' }));
    const s = rodarScript(t, fetchImpl);
    s.tique();
    await esperar();
    expect(t.msgs.children).toHaveLength(3);
    expect(t.msgs.children[0]).toBe(a);
    expect(t.msgs.children[1]).toBe(b);
    expect(t.msgs.children[2].textContent).toBe('novo');
  });

  it('atualização: só o balão que mudou (✓ → ✓✓) é trocado; balão removido sai; inserido no meio entra no lugar', async () => {
    const t = montarTela();
    comBaloes(t, B('1', 'a') + B('2', 'b ✓') + B('3', 'c') + B('4', 'd'));
    const [a, , c, d] = t.msgs.children;
    const fetchImpl = vi.fn(() => respostaJson({ assinatura: 'A2', msgs: B('1', 'a') + B('2', 'b ✓✓') + B('3', 'c') + B('9', 'meio') + B('4', 'd'), estado: 'x', compor: '' }));
    const s = rodarScript(t, fetchImpl);
    s.tique();
    await esperar();
    expect(t.msgs.children.map((x) => x.textContent)).toEqual(['a', 'b ✓✓', 'c', 'meio', 'd']);
    expect(t.msgs.children[0]).toBe(a);
    expect(t.msgs.children[2]).toBe(c);
    expect(t.msgs.children[4]).toBe(d);
  });

  it('envio: o balão "enviando…" é trocado pelo de verdade SEM refazer os anteriores', async () => {
    const t = montarTela();
    comBaloes(t, B('1', 'oi'));
    const [a] = t.msgs.children;
    const fetchImpl = vi.fn((_u: string, init?: any) => init?.method === 'POST'
      ? respostaJson({ ok: true, resultado: 'enviada', chave: 'k2' })
      : respostaJson({ assinatura: 'A2', msgs: B('1', 'oi') + B('2', 'Oi Ana!'), estado: 'eva_oficial|livre|livre|0', compor: '' }));
    rodarScript(t, fetchImpl);
    t.ta.value = 'Oi Ana!';
    t.doc.disparar('submit', { target: t.form });
    await esperar();
    expect(t.msgs.children).toHaveLength(2);
    expect(t.msgs.children[0]).toBe(a);
    expect(t.msgs.querySelector('.cc-at-msg-otimista')).toBeNull();
    expect(t.msgs.children[1].textContent).toBe('Oi Ana!');
  });

  it('trocar de contato: UM relógio só, busca a conversa NOVA; rascunho guardado por conversa', async () => {
    const t = montarTela();
    const urls: string[] = [];
    const fetchImpl = vi.fn((u: string) => { urls.push(u); return respostaJson({ igual: true }); });
    const s = rodarScript(t, fetchImpl);
    expect(s.timers).toHaveLength(1);
    t.ta.value = 'rascunho da Ana';
    // a troca suave: desmonta, põe a coluna nova no lugar e monta
    s.win.ccAtChat.desmontar();
    const t2 = montarTela({ conversa: '/dashboard/leads/22222222-2222-2222-2222-222222222222/conversa.json?canal=eva_oficial' });
    t.chat.remove();
    t.doc.body.appendChild(t2.chat);
    s.win.ccAtChat.montar();
    expect(s.timers).toHaveLength(1);
    expect((t.doc.getElementById('cc-at-texto') as any).value).toBe('');
    s.tique();
    await esperar();
    expect(urls.at(-1)).toContain('/dashboard/leads/22222222-2222-2222-2222-222222222222/conversa.json');
    expect(urls.every((u) => !u.includes(LEAD))).toBe(true);
    // volta para a Ana: o rascunho reaparece
    s.win.ccAtChat.desmontar();
    t2.chat.remove();
    t.doc.body.appendChild(t.chat);
    t.ta.value = '';
    s.win.ccAtChat.montar();
    expect(t.ta.value).toBe('rascunho da Ana');
  });

  it('envio no ar e o usuário troca de contato: a resposta NÃO mexe na conversa nova (chave, aviso, balão)', async () => {
    const t = montarTela();
    let liberar!: (v: unknown) => void;
    const fetchImpl = vi.fn((_u: string, init?: any) => init?.method === 'POST' ? new Promise((ok) => { liberar = ok; }) : respostaJson({ igual: true }));
    const s = rodarScript(t, fetchImpl);
    t.ta.value = 'Oi';
    t.doc.disparar('submit', { target: t.form });
    s.win.ccAtChat.desmontar();
    const t2 = montarTela({ conversa: '/dashboard/leads/22222222-2222-2222-2222-222222222222/conversa.json?canal=eva_oficial' });
    t.chat.remove();
    t.doc.body.appendChild(t2.chat);
    s.win.ccAtChat.montar();
    liberar({ ok: true, json: () => Promise.resolve({ ok: false, resultado: 'janela_fechada', avisoHtml: '<div>fechou</div>', chave: 'k-velha' }) });
    await esperar();
    expect((t.doc.querySelector('input[name=chave]') as any).value).toBe(CHAVE);
    expect(t.doc.querySelector('.cc-at-aviso-envio')).toBeNull();
    // e dá para enviar na conversa nova na hora (não ficou "enviando")
    (t.doc.getElementById('cc-at-texto') as any).value = 'Olá';
    t.doc.disparar('submit', { target: t.doc.querySelector('form[data-envio]') });
    expect(fetchImpl.mock.calls.filter((c) => (c[1] as any)?.method === 'POST')).toHaveLength(2);
  });
});
