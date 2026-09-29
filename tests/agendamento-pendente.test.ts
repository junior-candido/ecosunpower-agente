import { describe, it, expect, vi } from 'vitest';
import {
  AgendamentoPendenteService, type AgendamentoDeps, type LinhaPedido, type RepoPedidos, type EmpresaAgenda,
  textoClienteAguardando, textoAdminPedido, quemConfirma, lerBotaoAgenda, passoDoRelogio, formatarDataHora,
  emHorarioComercial, repoSupabase, montarEvento,
  ST_PENDENTE, ST_NAO_CONFIRMADA, ST_SUBSTITUIDA, ST_EXPIRADA, ST_CONFIRMANDO,
} from '../src/modules/vendas/agendamento-pendente.js';

const ECO = '00000000-0000-0000-0000-000000000001';
const TEN = '11111111-1111-1111-1111-111111111111';
const H = 3_600_000;
// seg 28/09/2026 10:00 BRT = 13:00 UTC
const T0 = Date.UTC(2026, 8, 28, 13, 0, 0);
const INICIO = '2026-10-01T17:00:00.000Z'; // qui 01/10 14:00 BRT
const FIM = '2026-10-01T17:30:00.000Z';

const ecosun: EmpresaAgenda = { companyId: ECO, ehEcosun: true, rtApelido: 'Junior', rtGenero: 'm', nomeAtendente: 'Eva' };
const tenant: EmpresaAgenda = { companyId: TEN, ehEcosun: false, rtApelido: 'Jimena', rtGenero: 'f', nomeAtendente: 'Clara' };


function memRepo(): RepoPedidos & { rows: LinhaPedido[] } {
  const rows: LinhaPedido[] = [];
  let n = 0;
  return {
    rows,
    async inserir(p) {
      const k = ++n; const id = `${String(k).repeat(4)}000${k}-aaaa-bbbb-cccc-dddddddddddd`;
      rows.push({ id, company_id: p.companyId, lead_id: p.leadId, phone: p.phone, tipo: p.tipo, inicio: p.inicioISO, fim: p.fimISO, resultado: ST_PENDENTE, created_at: new Date(T0).toISOString(), calendar_event_id: null });
      return id;
    },
    async substituirPendentes(cid, phone) {
      let k = 0;
      for (const r of rows) if (r.company_id === cid && r.phone === phone && r.resultado === ST_PENDENTE) { r.resultado = ST_SUBSTITUIDA; k++; }
      return k;
    },
    async buscar(id, cid) { return rows.find(r => r.id === id && r.company_id === cid) ?? null; },
    async transicionar(id, cid, de, para, extra) {
      const r = rows.find(x => x.id === id && x.company_id === cid && x.resultado === de);
      if (!r) return false;
      r.resultado = para;
      if (extra && 'calendarEventId' in extra) r.calendar_event_id = extra.calendarEventId ?? null;
      return true;
    },
    async listarPendentes() { return rows.filter(r => r.resultado === ST_PENDENTE); },
    async listarConfirmando() { return rows.filter(r => r.resultado === ST_CONFIRMANDO); },
    async expirarAntigos(antes) {
      let k = 0;
      for (const r of rows) if (r.resultado === ST_PENDENTE && r.inicio < antes) { r.resultado = ST_EXPIRADA; k++; }
      return k;
    },
    async listarPendentesDaEmpresa(cid, leadId) { return rows.filter(r => r.company_id === cid && r.resultado === ST_PENDENTE && (!leadId || r.lead_id === leadId)); },
  };
}

function memKv() {
  const m = new Map<string, string>();
  return { m, get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => { m.set(k, v); return 'OK'; }, del: async (k: string) => { m.delete(k); return 1; } };
}

function montar(opts: { empresa?: EmpresaAgenda; botoes?: boolean; livre?: boolean; agendaId?: string | null; semAdmin?: boolean; agora?: number } = {}) {
  let empresa = opts.empresa ?? ecosun;
  const repo = memRepo();
  const kv = memKv();
  const agenda = {
    isAvailable: vi.fn().mockResolvedValue(opts.livre ?? true),
    createEvent: vi.fn().mockResolvedValue({ eventId: 'ev1', htmlLink: 'https://cal/ev1', meetLink: 'https://meet.google.com/abc' }),
  };
  const enviarCliente = vi.fn().mockResolvedValue(undefined);
  const enviarAdmin = vi.fn().mockResolvedValue(!opts.semAdmin);
  const registrarNaConversa = vi.fn().mockResolvedValue(undefined);
  const aoConfirmar = vi.fn().mockResolvedValue(undefined);
  const log = vi.fn();
  let agora = opts.agora ?? T0;
  const deps: AgendamentoDeps = {
    repo, kv, agenda,
    agendaDaEmpresa: () => (opts.agendaId === undefined ? 'agenda@x' : opts.agendaId),
    empresaAtual: () => empresa,
    temBotoes: () => opts.botoes ?? true,
    enviarCliente, enviarAdmin,
    destinoAdmin: () => (opts.semAdmin ? null : '5561999990000'),
    registrarNaConversa, aoConfirmar, log,
    agoraMs: () => agora,
  };
  const svc = new AgendamentoPendenteService(deps);
  return {
    svc, repo, kv, agenda, enviarCliente, enviarAdmin, registrarNaConversa, aoConfirmar, log,
    setEmpresa: (e: EmpresaAgenda) => { empresa = e; },
    setAgora: (ms: number) => { agora = ms; },
  };
}

const novo = (tipo: 'meet' | 'visita' = 'meet') => ({
  leadId: 'L1', phone: '5561988887777', tipo, inicioISO: INICIO, fimISO: FIM,
  detalhes: { leadNome: 'Luiz Roberto', leadCidade: 'Brasília', contaMensal: '900', resumoLead: 'Conta alta, casa própria, quer financiar', clientAddress: tipo === 'visita' ? 'Rua A 1, Lago Sul' : undefined },
});

describe('textos (puros)', () => {
  it('cliente: anota a preferência e diz que o Junior vai confirmar — sem prometer horário', () => {
    const t = textoClienteAguardando(ecosun, 'meet', INICIO);
    expect(t).toContain('Anotei sua preferência');
    expect(t).toContain('O Junior vai entrar em contato pra confirmar');
    expect(t).toContain('quinta (01/10), às 14h');
    expect(t).not.toMatch(/agendad|confirmad|marcad|te espera/i);
  });
  it('tenant: "nossa equipe", nunca o nome da casa nem do Junior', () => {
    const t = textoClienteAguardando(tenant, 'visita', INICIO);
    expect(t).toContain('Nossa equipe vai entrar em contato');
    expect(t).not.toMatch(/Junior|EcoSun|Jimena/);
    expect(quemConfirma(tenant).o).toBe('nossa equipe');
  });
  it('formata data/hora em Brasília', () => {
    expect(formatarDataHora('2026-10-02T12:30:00.000Z')).toBe('sexta (02/10), às 9h30');
  });
  it('pedido ao admin traz cliente, telefone, tipo, data, endereço, conta e resumo', () => {
    const t = textoAdminPedido({ id: 'x', companyId: ECO, leadId: 'L1', phone: '5561988887777', tipo: 'visita', inicioISO: INICIO, fimISO: FIM, resultado: ST_PENDENTE, criadoEmMs: T0, leadNome: 'Ana', clientAddress: 'Rua A 1', contaMensal: '900', resumoLead: 'quer financiar', leadCidade: 'Brasília' }, 'Eva');
    for (const s of ['Ana', '5561988887777', 'Visita técnica', 'quinta (01/10), às 14h', 'Rua A 1', 'R$ 900', 'quer financiar', 'Brasília', 'Nada foi marcado']) expect(t).toContain(s);
  });
  it('lê o botão do admin', () => {
    expect(lerBotaoAgenda('evabt:agd-ok:0000000a-aaaa-bbbb-cccc-dddddddddddd')).toEqual({ acao: 'ok', id: '0000000a-aaaa-bbbb-cccc-dddddddddddd' });
    expect(lerBotaoAgenda('evabt:agd-xx:1234')).toBeNull();
    expect(lerBotaoAgenda('evabt:lead-view:0000000a-aaaa')).toBeNull();
  });
  it('evento do Meet e da visita como antes', () => {
    const base = { id: 'x', companyId: ECO, leadId: 'L1', phone: '55', inicioISO: INICIO, fimISO: FIM, resultado: null, criadoEmMs: T0, leadNome: 'Luiz', leadCidade: 'Brasília' };
    const m = montarEvento({ ...base, tipo: 'meet' }, 'cal');
    expect(m).toMatchObject({ summary: 'Meet - Luiz - apresentacao estudo', withMeet: true, location: undefined, calendarId: 'cal' });
    const v = montarEvento({ ...base, tipo: 'visita', clientAddress: 'Rua A', clientCoordinates: '-15,-47' }, 'cal');
    expect(v).toMatchObject({ summary: 'Visita tecnica - Luiz - Brasília', withMeet: false, location: 'Rua A (-15,-47)' });
    expect(v.description).toContain('Maps: https://www.google.com/maps?q=-15,-47');
  });
});

describe('registrarPedido', () => {
  it('NÃO cria evento, grava pendente, responde o cliente e manda o pedido com botões ao admin', async () => {
    const t = montar();
    const { id, adminAvisado } = await t.svc.registrarPedido(novo());
    expect(adminAvisado).toBe(true);
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
    expect(t.repo.rows[0]).toMatchObject({ id, resultado: ST_PENDENTE, company_id: ECO, tipo: 'meet' });
    expect(t.enviarCliente).toHaveBeenCalledTimes(1);
    const msgCliente = t.enviarCliente.mock.calls[0][1] as string;
    expect(msgCliente).not.toMatch(/agendad|confirmad|marcad/i);
    const [corpo, botoes] = t.enviarAdmin.mock.calls[0];
    expect(corpo).toContain('Luiz Roberto');
    expect(botoes.map((b: { id: string }) => b.id)).toEqual([`evabt:agd-ok:${id}`, `evabt:agd-eu:${id}`, `evabt:agd-nao:${id}`]);
    expect(botoes.every((b: { title: string }) => b.title.length <= 20)).toBe(true);
    expect(t.enviarAdmin.mock.calls[1][1][0].id).toBe(`evabt:agd-outro:${id}`);
    expect(t.aoConfirmar).not.toHaveBeenCalled();
  });

  it('sem botões (tenant/Evolution): uma mensagem com opções numeradas', async () => {
    const t = montar({ empresa: tenant, botoes: false });
    await t.svc.registrarPedido(novo());
    expect(t.enviarAdmin).toHaveBeenCalledTimes(1);
    expect(t.enviarAdmin.mock.calls[0][0]).toMatch(/1 [0-9A-F]{4} ✅ Confirmar e avisar o cliente/);
    expect(t.enviarAdmin.mock.calls[0][0]).toContain('Clara');
  });

  it('novo pedido do mesmo cliente substitui o pendente antigo', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    await t.svc.registrarPedido(novo());
    expect(t.repo.rows.map(r => r.resultado)).toEqual([ST_SUBSTITUIDA, ST_PENDENTE]);
  });

  it('empresa sem admin: loga erro alto, cliente ainda recebe resposta', async () => {
    const t = montar({ semAdmin: true });
    const r = await t.svc.registrarPedido(novo());
    expect(r.adminAvisado).toBe(false);
    expect(t.enviarCliente).toHaveBeenCalled();
    expect(t.log.mock.calls.some(c => c[0] === 'error')).toBe(true);
  });
});

describe('admin responde', () => {
  it('✅ Confirmar e avisar: checa conflito de novo, cria o evento com Meet e avisa o cliente com o link', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    const r = await t.svc.responder('ok', id, '5561999990000');
    expect(t.agenda.isAvailable).toHaveBeenCalledWith(INICIO, FIM, 'agenda@x');
    expect(t.agenda.createEvent).toHaveBeenCalledWith(expect.objectContaining({ withMeet: true, calendarId: 'agenda@x', summary: 'Meet - Luiz Roberto - apresentacao estudo' }));
    expect(t.repo.rows[0]).toMatchObject({ resultado: null, calendar_event_id: 'ev1' });
    const msg = t.enviarCliente.mock.calls[0][1] as string;
    expect(msg).toContain('O Junior confirmou');
    expect(msg).toContain('https://meet.google.com/abc');
    expect(t.registrarNaConversa).toHaveBeenCalledWith('L1', ECO, msg);
    expect(t.aoConfirmar).toHaveBeenCalledTimes(1);
    expect(r).toContain('Confirmado');
  });

  it('clique duplo não cria dois eventos', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    const [a, b] = await Promise.all([t.svc.responder('ok', id, null), t.svc.responder('ok', id, null)]);
    expect(t.agenda.createEvent).toHaveBeenCalledTimes(1);
    expect([a, b].some(x => /já/.test(x))).toBe(true);
    const r3 = await t.svc.responder('ok', id, null);
    expect(r3).toContain('já foi resolvido');
    expect(t.agenda.createEvent).toHaveBeenCalledTimes(1);
  });

  it('📞 Eu mesmo aviso: cria o evento e NÃO manda nada ao cliente', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    const r = await t.svc.responder('eu', id, null);
    expect(t.agenda.createEvent).toHaveBeenCalledTimes(1);
    expect(t.enviarCliente).not.toHaveBeenCalled();
    expect(r).toContain('você avisa');
    expect(r).toContain('https://meet.google.com/abc');
  });

  it('✅ com conflito na agenda: não cria, volta a pendente e avisa o admin', async () => {
    const t = montar({ livre: false });
    const { id } = await t.svc.registrarPedido(novo());
    const r = await t.svc.responder('ok', id, null);
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
    expect(t.repo.rows[0].resultado).toBe(ST_PENDENTE);
    expect(r).toContain('ocupado');
  });

  it('✅ com erro no Google: volta a pendente', async () => {
    const t = montar();
    t.agenda.createEvent.mockRejectedValueOnce(new Error('google fora'));
    const { id } = await t.svc.registrarPedido(novo());
    const r = await t.svc.responder('ok', id, null);
    expect(t.repo.rows[0].resultado).toBe(ST_PENDENTE);
    expect(r).toContain('continua pendente');
    expect(t.aoConfirmar).not.toHaveBeenCalled();
  });

  it('empresa sem agenda do Google: confirma sem evento', async () => {
    const t = montar({ agendaId: null });
    const { id } = await t.svc.registrarPedido(novo('visita'));
    const r = await t.svc.responder('ok', id, null);
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
    expect(t.repo.rows[0].resultado).toBeNull();
    expect(r).toContain('evento não foi criado');
  });

  it('❌ Não posso: Eva pede outro horário ao cliente', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    await t.svc.responder('nao', id, null);
    expect(t.repo.rows[0].resultado).toBe(ST_NAO_CONFIRMADA);
    expect(t.enviarCliente.mock.calls[0][1]).toContain('Qual outro dia e horário');
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
  });

  it('🕐 Sugerir: o próximo texto do admin vai pro cliente', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    const pergunta = await t.svc.responder('outro', id, '5561999990000');
    expect(pergunta).toContain('Qual horário você sugere');
    const r = await t.svc.tratarTextoDoAdmin('5561999990000', 'sexta 10h');
    expect(r).toContain('Mandei sua sugestão');
    expect(t.enviarCliente.mock.calls[0][1]).toContain('*sexta 10h*');
    expect(t.repo.rows[0].resultado).toBe(ST_NAO_CONFIRMADA);
    // estado consumido: próximo texto não é mais com a gente
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', 'bom dia')).toBeNull();
  });

  it('🕐 e depois "cancelar": nada vai ao cliente', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    await t.svc.responder('outro', id, '5561999990000');
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', 'cancelar')).toContain('não mandei');
    expect(t.enviarCliente).not.toHaveBeenCalled();
    expect(t.repo.rows[0].resultado).toBe(ST_PENDENTE);
  });

  it('modo texto: admin responde "1" pro último pedido', async () => {
    const t = montar({ empresa: tenant, botoes: false });
    await t.svc.registrarPedido(novo());
    const r = await t.svc.tratarTextoDoAdmin('5561999990000', '1');
    expect(r).toContain('Confirmado');
    expect(t.agenda.createEvent).toHaveBeenCalledTimes(1);
    const msg = t.enviarCliente.mock.calls.at(-1)![1] as string;
    expect(msg).toContain('Nossa equipe confirmou');
    expect(msg).not.toMatch(/Junior/);
  });

  it('"1" sem pedido recente não é com a gente', async () => {
    const t = montar({ botoes: false });
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', '1')).toBeNull();
  });

  it('multi-tenant: admin do tenant não enxerga pedido da EcoSun (e vice-versa)', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.setEmpresa(tenant);
    const r = await t.svc.responder('ok', id, null);
    expect(r).toContain('Não achei');
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
    expect(t.repo.rows[0].resultado).toBe(ST_PENDENTE);
  });
});

describe('relógio', () => {
  const base = { id: 'x', companyId: ECO, leadId: 'L1', phone: '55', tipo: 'meet' as const, inicioISO: INICIO, fimISO: FIM, resultado: ST_PENDENTE, criadoEmMs: T0 };
  it('passoDoRelogio: 3 h → lembrete (horário comercial); 24 h → avisa cliente; passou do horário → expira', () => {
    expect(passoDoRelogio(base, T0 + 2 * H)).toBeNull();
    expect(passoDoRelogio(base, T0 + 3 * H)).toBe('lembrar_admin');
    expect(passoDoRelogio({ ...base, lembreteEmMs: T0 + 3 * H }, T0 + 4 * H)).toBeNull();
    expect(passoDoRelogio(base, T0 + 24 * H)).toBe('avisar_cliente');
    expect(passoDoRelogio({ ...base, clienteAvisadoEmMs: 1, lembreteEmMs: 1 }, T0 + 25 * H)).toBeNull();
    expect(passoDoRelogio(base, Date.parse(INICIO) + 60_000)).toBe('expirar');
    expect(passoDoRelogio({ ...base, resultado: null }, T0 + 30 * H)).toBeNull();
  });
  it('lembrete ao admin fora do horário comercial espera', () => {
    const sabado = Date.UTC(2026, 9, 3, 15, 0, 0); // sáb 12h BRT
    expect(emHorarioComercial(sabado)).toBe(false);
    expect(passoDoRelogio({ ...base, criadoEmMs: sabado - 4 * H, inicioISO: '2026-10-06T17:00:00Z' }, sabado)).toBeNull();
  });
  it('processarPendentes: lembra o admin uma vez só e roda no contexto da empresa do pedido', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    t.enviarAdmin.mockClear();
    t.setAgora(T0 + 3 * H);
    const ctx = vi.fn(async (_cid: string, fn: () => Promise<unknown>) => fn());
    const r1 = await t.svc.processarPendentes(ctx as never);
    expect(r1.lembretes).toBe(1);
    expect(ctx).toHaveBeenCalledWith(ECO, expect.any(Function));
    expect(t.enviarAdmin.mock.calls[0][0]).toContain('Lembrete');
    const r2 = await t.svc.processarPendentes(ctx as never);
    expect(r2.lembretes).toBe(0);
  });
  it('24 h: cliente é avisado que ainda está esperando (sem prometer) e o pedido continua pendente', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    t.setAgora(T0 + 24 * H);
    const r = await t.svc.processarPendentes((async (_c: string, fn: () => Promise<unknown>) => fn()) as never);
    expect(r.avisos).toBe(1);
    const msg = t.enviarCliente.mock.calls[0][1] as string;
    expect(msg).toContain('Ainda estou esperando o Junior confirmar');
    expect(msg).not.toMatch(/agendad|confirmad|marcad/i);
    expect(t.repo.rows[0].resultado).toBe(ST_PENDENTE);
  });
  it('horário passou sem resposta: expira e pede outra data', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    t.setAgora(Date.parse(INICIO) + H);
    const r = await t.svc.processarPendentes((async (_c: string, fn: () => Promise<unknown>) => fn()) as never);
    expect(r.expirados).toBe(1);
    expect(t.repo.rows[0].resultado).toBe(ST_EXPIRADA);
    expect(t.enviarCliente.mock.calls[0][1]).toContain('Qual outro dia');
  });
});

describe('repoSupabase', () => {
  it('transicionar é UPDATE condicional por id + empresa + estado', async () => {
    const eqs: Array<[string, unknown]> = [];
    let patch: unknown;
    const chain: any = {
      update: (p: unknown) => { patch = p; return chain; },
      eq: (k: string, v: unknown) => { eqs.push([k, v]); return chain; },
      select: async () => ({ data: [{ id: 'x' }], error: null }),
    };
    const repo = repoSupabase({ from: () => chain });
    expect(await repo.transicionar('x', TEN, ST_PENDENTE, ST_CONFIRMANDO)).toBe(true);
    expect(patch).toEqual({ resultado: ST_CONFIRMANDO });
    expect(eqs).toEqual([['id', 'x'], ['company_id', TEN], ['resultado', ST_PENDENTE]]);
  });
  it('transicionar sem linha afetada devolve false', async () => {
    const chain: any = { update: () => chain, eq: () => chain, select: async () => ({ data: [], error: null }) };
    expect(await repoSupabase({ from: () => chain }).transicionar('x', ECO, ST_PENDENTE, null)).toBe(false);
  });
});

describe('prometeAgendamento (observabilidade)', () => {
  it('pega promessa de horário, ignora o texto padrão do pedido', async () => {
    const { prometeAgendamento } = await import('../src/modules/vendas/agendamento-pendente.js');
    expect(prometeAgendamento('Combinado! O Junior te espera quinta às 14h')).toBe(true);
    expect(prometeAgendamento('Pronto, sua visita está agendada')).toBe(true);
    expect(prometeAgendamento('Meet confirmado pra sexta')).toBe(true);
    expect(prometeAgendamento(textoClienteAguardando(ecosun, 'meet', INICIO))).toBe(false);
    expect(prometeAgendamento('Vou confirmar com o Junior')).toBe(false);
  });
});

describe('respostas numeradas do admin (modo texto)', () => {
  it('"1" vale mesmo com o telefone chegando em outra grafia, e só uma vez', async () => {
    const t = montar({ empresa: tenant, botoes: false });
    await t.svc.registrarPedido(novo());
    expect(await t.svc.tratarTextoDoAdmin('556199990000', '1')).toContain('Confirmado');
    expect(await t.svc.tratarTextoDoAdmin('556199990000', '1')).toBeNull();
    expect(t.agenda.createEvent).toHaveBeenCalledTimes(1);
  });
});

describe('revisões (28/09): robustez', () => {
  it('memória: o texto que o cliente recebeu no pedido entra na conversa', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    expect(t.registrarNaConversa.mock.calls[0][2]).toContain('Anotei sua preferência');
  });

  it('dois pedidos em texto: "1" sozinho pede o código; "1 CÓDIGO" resolve o certo', async () => {
    const { codigoPedido } = await import('../src/modules/vendas/agendamento-pendente.js');
    const t = montar({ empresa: tenant, botoes: false });
    const a = await t.svc.registrarPedido(novo());
    const b = await t.svc.registrarPedido({ ...novo(), phone: '5561977776666', leadId: 'L2' });
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', '1')).toContain('mais de um pedido');
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
    const r = await t.svc.tratarTextoDoAdmin('5561999990000', `3 ${codigoPedido(b.id).toLowerCase()}`);
    expect(r).toContain('pediu outro dia');
    expect(t.repo.rows.find(x => x.id === b.id)!.resultado).toBe(ST_NAO_CONFIRMADA);
    expect(t.repo.rows.find(x => x.id === a.id)!.resultado).toBe(ST_PENDENTE);
  });

  it('com botões WABA, um "1" solto nunca é com a gente', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', '1')).toBeNull();
  });

  it('✅ fora da janela de 24 h: confirma na agenda e manda o admin avisar', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.enviarCliente.mockResolvedValueOnce('janela');
    const r = await t.svc.responder('ok', id, null);
    expect(t.repo.rows[0].resultado).toBeNull();
    expect(r).toContain('avise você');
  });

  it('📞 com o Google fora: confirma sem evento e avisa pra criar à mão', async () => {
    const t = montar();
    t.agenda.createEvent.mockRejectedValueOnce(new Error('403 forbidden'));
    const { id } = await t.svc.registrarPedido(novo());
    const r = await t.svc.responder('eu', id, null);
    expect(t.repo.rows[0].resultado).toBeNull();
    expect(r).toContain('crie à mão');
  });

  it('evento que já existe no Google (✅ anterior caiu no meio) é reaproveitado, não duplicado', async () => {
    const { idEventoDoPedido } = await import('../src/modules/vendas/agendamento-pendente.js');
    const t = montar();
    t.agenda.createEvent.mockRejectedValueOnce(new Error('The requested identifier already exists.'));
    const { id } = await t.svc.registrarPedido(novo());
    await t.svc.responder('ok', id, null);
    expect(t.agenda.createEvent.mock.calls[0][0].eventId).toBe(idEventoDoPedido(id));
    expect(t.repo.rows[0]).toMatchObject({ resultado: null, calendar_event_id: idEventoDoPedido(id) });
    expect(idEventoDoPedido(id)).toMatch(/^[a-v0-9]{5,1024}$/);
  });

  it('horário que já passou não pode ser confirmado', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.setAgora(Date.parse(INICIO) + 60_000);
    expect(await t.svc.responder('ok', id, null)).toContain('já passou');
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
  });

  it('relógio destrava pedido preso em "confirmando" e avisa o admin', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.repo.rows[0].resultado = ST_CONFIRMANDO;
    t.enviarAdmin.mockClear();
    await t.svc.processarPendentes((async (_c: string, fn: () => Promise<unknown>) => fn()) as never);
    expect(t.repo.rows.find(x => x.id === id)!.resultado).toBe(ST_PENDENTE);
    expect(t.enviarAdmin.mock.calls[0][0]).toContain('não terminou');
  });

  it('Redis fora: o relógio não manda nada (não repete a cada 15 min)', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    t.enviarAdmin.mockClear(); t.enviarCliente.mockClear();
    t.kv.get = async () => { throw new Error('redis down'); };
    t.setAgora(T0 + 24 * H);
    await t.svc.processarPendentes((async (_c: string, fn: () => Promise<unknown>) => fn()) as never);
    expect(t.enviarCliente).not.toHaveBeenCalled();
    expect(t.enviarAdmin).not.toHaveBeenCalled();
  });

  it('faxina: pedido com horário passado há mais de 3 dias expira sem mensagem', async () => {
    const t = montar();
    await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    t.setAgora(Date.parse(INICIO) + 4 * 24 * H);
    await t.svc.processarPendentes((async () => undefined) as never);
    expect(t.repo.rows[0].resultado).toBe(ST_EXPIRADA);
    expect(t.enviarCliente).not.toHaveBeenCalled();
  });

  it('🕐: botão de outra coisa ou texto sem cara de horário NÃO vai pro cliente', async () => {
    const { pareceComando, pareceHorario } = await import('../src/modules/vendas/agendamento-pendente.js');
    expect(pareceComando('menucat_financeiro')).toBe(true);
    expect(pareceComando('findel-no')).toBe(true);
    expect(pareceComando('10:30')).toBe(false);
    expect(pareceComando('quinta: 10h')).toBe(false);
    expect(pareceHorario('sexta à tarde')).toBe(true);
    expect(pareceHorario('bom dia')).toBe(false);
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    t.enviarCliente.mockClear();
    await t.svc.responder('outro', id, '5561999990000');
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', 'menucat_financeiro')).toBeNull();
    await t.svc.responder('outro', id, '5561999990000');
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', 'bom dia')).toContain('Não entendi');
    expect(await t.svc.tratarTextoDoAdmin('5561999990000', 'sexta 10h')).toContain('Mandei sua sugestão');
    expect(t.enviarCliente).toHaveBeenCalledTimes(1);
  });
});

describe('cliente aceita a sugestão do admin = já confirmado (decisão do Junior 28/09)', () => {
  const SEXTA_10H = '2026-10-02T13:00:00.000Z'; // sex 02/10 10:00 BRT
  const fimDe = (iso: string) => new Date(Date.parse(iso) + 30 * 60_000).toISOString();

  it('horarioBateComSugestao confere dia, data, hora e período', async () => {
    const { horarioBateComSugestao } = await import('../src/modules/vendas/agendamento-pendente.js');
    expect(horarioBateComSugestao('sexta 10h', SEXTA_10H)).toBe(true);
    expect(horarioBateComSugestao('sexta de manhã', SEXTA_10H)).toBe(true);
    expect(horarioBateComSugestao('02/10 às 10:00', SEXTA_10H)).toBe(true);
    expect(horarioBateComSugestao('sexta 14h', SEXTA_10H)).toBe(false);
    expect(horarioBateComSugestao('quinta 10h', SEXTA_10H)).toBe(false);
    expect(horarioBateComSugestao('sexta à tarde', SEXTA_10H)).toBe(false);
    expect(horarioBateComSugestao('quando der', SEXTA_10H)).toBe(false);
  });

  it('aceitou o horário sugerido: cria o evento, confirma ao cliente e avisa o admin, sem 2º pedido', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    await t.svc.responder('outro', id, '5561999990000');
    await t.svc.tratarTextoDoAdmin('5561999990000', 'sexta 10h');
    t.enviarCliente.mockClear(); t.enviarAdmin.mockClear();
    const r = await t.svc.registrarPedido({ ...novo(), inicioISO: SEXTA_10H, fimISO: fimDe(SEXTA_10H) });
    expect(t.agenda.createEvent).toHaveBeenCalledTimes(1);
    expect(t.repo.rows.find(x => x.id === r.id)!.resultado).toBeNull();
    expect(t.enviarCliente).toHaveBeenCalledTimes(1);
    expect(t.enviarCliente.mock.calls[0][1]).toContain('O Junior confirmou');
    expect(t.enviarAdmin).toHaveBeenCalledTimes(1);
    expect(t.enviarAdmin.mock.calls[0][0]).toContain('cliente aceitou sua sugestão — agendado');
  });

  it('escolheu OUTRO horário: vira pedido normal pro admin confirmar', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    await t.svc.responder('outro', id, '5561999990000');
    await t.svc.tratarTextoDoAdmin('5561999990000', 'sexta 10h');
    t.enviarCliente.mockClear();
    const quinta = '2026-10-08T17:00:00.000Z';
    const r = await t.svc.registrarPedido({ ...novo(), inicioISO: quinta, fimISO: fimDe(quinta) });
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
    expect(t.repo.rows.find(x => x.id === r.id)!.resultado).toBe(ST_PENDENTE);
    expect(t.enviarCliente.mock.calls[0][1]).toContain('Anotei sua preferência');
  });

  it('aceitou mas a agenda ficou ocupada: volta pro fluxo normal (pendente + admin)', async () => {
    const t = montar();
    const { id } = await t.svc.registrarPedido(novo());
    await t.svc.responder('outro', id, '5561999990000');
    await t.svc.tratarTextoDoAdmin('5561999990000', 'sexta 10h');
    t.agenda.isAvailable.mockResolvedValueOnce(false);
    t.enviarCliente.mockClear();
    const r = await t.svc.registrarPedido({ ...novo(), inicioISO: SEXTA_10H, fimISO: fimDe(SEXTA_10H) });
    expect(t.agenda.createEvent).not.toHaveBeenCalled();
    expect(t.repo.rows.find(x => x.id === r.id)!.resultado).toBe(ST_PENDENTE);
    expect(t.enviarCliente.mock.calls[0][1]).toContain('Anotei sua preferência');
  });
});
