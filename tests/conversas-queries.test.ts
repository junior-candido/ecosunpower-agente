// Atendimento (Leads › Conversas) — lista de conversas e chat. Multi-tenant
// rigoroso: TODA consulta com company_id da sessão; sem empresa → nada.
import { describe, it, expect, vi } from 'vitest';
import {
  normalizarMensagens, juntarMensagens, ultimaMensagem, montarLista, lerFiltros, canalDaLinha,
  listarConversas, mensagensDoLead,
} from '../src/modules/dashboard/conversas-queries.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const EMPRESA = 'aaaa1111-2222-3333-4444-555566667777';
const admin: DashUser = { id: 'u1', companyId: EMPRESA, nome: 'A', login: 'a', isAdmin: true, roleNome: '', permissoes: {} };
const vendedor: DashUser = { ...admin, id: 'u2', isAdmin: false };

const msg = (role: string, content: string, timestamp: string) => ({ role, content, timestamp });

describe('mensagens', () => {
  it('normaliza e descarta lixo (sem texto, formato estranho)', () => {
    expect(normalizarMensagens([msg('user', 'oi', 't1'), null, { role: 'assistant' }, 'x', { text: 'antigo' }])).toEqual([
      { role: 'user', content: 'oi', timestamp: 't1' },
      { role: 'user', content: 'antigo', timestamp: null },
    ]);
    expect(normalizarMensagens(null)).toEqual([]);
  });

  it('junta várias linhas do lead em ordem de tempo, sem repetir', () => {
    const j = juntarMensagens([
      { created_at: '2026-09-02', messages: [msg('user', 'b', '2026-09-02T10:00'), msg('assistant', 'c', '2026-09-02T10:01')] },
      { created_at: '2026-09-01', messages: [msg('user', 'a', '2026-09-01T10:00'), msg('user', 'b', '2026-09-02T10:00')] },
    ]);
    expect(j.map((m) => m.content)).toEqual(['a', 'b', 'c']);
  });

  it('última mensagem: quem falou e prévia curta', () => {
    expect(ultimaMensagem([msg('assistant', 'oi', 't'), msg('user', '  quanto\n custa? ', 't2')])).toEqual({ texto: 'quanto custa?', de: 'cliente', em: 't2' });
    expect(ultimaMensagem([])).toEqual({ texto: null, de: null, em: null });
  });

  it('canal só quando a linha traz o dado', () => {
    expect(canalDaLinha({})).toBeNull();
    expect(canalDaLinha({ channel: 'waba' })).toBe('eva_oficial');
    expect(canalDaLinha({ canal: 'coexistencia' })).toBe('whatsapp_business');
    expect(canalDaLinha({ channel: 'evolution' })).toBe('qr_code');
  });
});

describe('lerFiltros (só valores conhecidos)', () => {
  it('filtro/etapa inválidos viram o padrão; busca é cortada', () => {
    expect(lerFiltros({ filtro: 'xpto', etapa: "'; drop", q: '  Ana  ' })).toEqual({ filtro: 'todas', etapa: undefined, q: 'Ana' });
    expect(lerFiltros({ filtro: 'aguardando', etapa: 'proposta' })).toEqual({ filtro: 'aguardando', etapa: 'proposta', q: undefined });
    expect(lerFiltros({ q: 'x'.repeat(200) }).q).toHaveLength(80);
  });
});

describe('montarLista', () => {
  const leads = [
    { id: 'L1', name: 'Ana', phone: '5561999990001', status: 'novo', city: 'Taguatinga', eva_active: true, opt_out: false, claimed_by: null },
    { id: 'L2', name: 'Bruno', phone: '5561988887777', status: 'proposta_enviada', city: null, eva_active: false, opt_out: false, claimed_by: 'u2' },
    { id: 'L3', name: 'Carla', phone: '5561977776666', status: 'perdido', city: null, eva_active: false, opt_out: true, claimed_by: null },
  ];
  const convs = [
    { lead_id: 'L2', last_message_at: '2026-09-28T10:00', messages: [msg('user', 'Tem financiamento?', '2026-09-28T10:00')] },
    { lead_id: 'L1', last_message_at: '2026-09-28T09:00', messages: [msg('assistant', 'Me manda a conta', '2026-09-28T09:00')] },
    { lead_id: 'L2', last_message_at: '2026-09-20T09:00', messages: [msg('user', 'velha', '2026-09-20T09:00')] },
    { lead_id: 'L3', last_message_at: '2026-09-10T09:00', messages: [] },
    { lead_id: 'OUTRA', last_message_at: '2026-09-28T11:00', messages: [msg('user', 'não é desta lista', 't')] },
  ];

  it('uma linha por lead (a mais recente), só leads entregues pelo banco, mais recente primeiro', () => {
    const l = montarLista(convs, leads, { filtro: 'todas' }, 'u2');
    expect(l.itens.map((c) => c.leadId)).toEqual(['L2', 'L1', 'L3']);
    expect(l.itens[0].ultimaTexto).toBe('Tem financiamento?');
    expect(l.itens[0].aguardandoResposta).toBe(true);
    expect(l.itens[1].aguardandoResposta).toBe(false);
    expect(l.contagem).toMatchObject({ todas: 3, aguardando: 1, meus: 1 });
    expect(l.contagem.porEtapa).toMatchObject({ novo: 1, proposta: 1, perdido: 1 });
  });

  it('filtros: aguardando, meus, etapa e busca (nome, cidade, telefone)', () => {
    expect(montarLista(convs, leads, { filtro: 'aguardando' }, 'u2').itens.map((c) => c.leadId)).toEqual(['L2']);
    expect(montarLista(convs, leads, { filtro: 'meus' }, 'u2').itens.map((c) => c.leadId)).toEqual(['L2']);
    expect(montarLista(convs, leads, { etapa: 'perdido' }, 'u2').itens.map((c) => c.leadId)).toEqual(['L3']);
    expect(montarLista(convs, leads, { q: 'tagua' }, 'u2').itens.map((c) => c.leadId)).toEqual(['L1']);
    expect(montarLista(convs, leads, { q: '8888-7777' }, 'u2').itens.map((c) => c.leadId)).toEqual(['L2']);
  });
});

/** Mock do supabase que registra cada chamada da cadeia. */
function mockDb(respostas: Record<string, unknown[]>) {
  const chamadas: Array<{ tabela: string; metodo: string; args: unknown[] }> = [];
  const from = vi.fn((tabela: string) => {
    const q: any = {};
    for (const metodo of ['select', 'eq', 'not', 'order', 'limit', 'is', 'in', 'or']) {
      q[metodo] = (...args: unknown[]) => { chamadas.push({ tabela, metodo, args }); return q; };
    }
    q.then = (ok: (v: unknown) => void) => ok({ data: respostas[tabela] ?? [], error: null });
    return q;
  });
  return { db: { from } as any, chamadas };
}

describe('listarConversas / mensagensDoLead — company_id da sessão em TODA consulta', () => {
  it('conversations e leads filtrados pela empresa; vendedor só balcão + os dele', async () => {
    const { db, chamadas } = mockDb({
      conversations: [{ lead_id: 'L1', messages: [msg('user', 'oi', 't')], last_message_at: 't' }],
      leads: [{ id: 'L1', name: 'Ana', phone: '5561999990001', status: 'novo', city: null, eva_active: true, opt_out: false, claimed_by: null }],
    });
    const r = await listarConversas(db, vendedor, { filtro: 'todas' });
    expect(r.itens).toHaveLength(1);
    for (const t of ['conversations', 'leads']) {
      expect(chamadas.some((c) => c.tabela === t && c.metodo === 'eq' && c.args[0] === 'company_id' && c.args[1] === EMPRESA), t).toBe(true);
    }
    expect(chamadas.some((c) => c.tabela === 'leads' && c.metodo === 'or' && String(c.args[0]).includes('claimed_by.eq.u2'))).toBe(true);
    expect(chamadas.some((c) => c.tabela === 'leads' && c.metodo === 'is' && c.args[0] === 'archived_at')).toBe(true);
  });

  it('admin: sem filtro de dono; sem empresa na sessão → lista vazia sem consultar', async () => {
    const a = mockDb({ conversations: [{ lead_id: 'L1', messages: [] }], leads: [] });
    await listarConversas(a.db, admin, {});
    expect(a.chamadas.some((c) => c.metodo === 'or')).toBe(false);
    const b = mockDb({});
    const r = await listarConversas(b.db, { ...admin, companyId: '' }, {});
    expect(r.itens).toEqual([]);
    expect(b.db.from).not.toHaveBeenCalled();
  });

  it('mensagensDoLead filtra empresa E lead', async () => {
    const { db, chamadas } = mockDb({ conversations: [{ created_at: '1', messages: [msg('user', 'oi', 't')] }] });
    const m = await mensagensDoLead(db, 'L1', EMPRESA);
    expect(m).toHaveLength(1);
    expect(chamadas.filter((c) => c.metodo === 'eq').map((c) => c.args)).toEqual([['company_id', EMPRESA], ['lead_id', 'L1']]);
  });
});
