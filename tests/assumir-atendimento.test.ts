// Atendimento Parte 2 — "Assumir" é UM estado só (leads.eva_active), o mesmo do
// botão "✋ Assumir" que a Eva manda no WhatsApp. Painel e WhatsApp chamam a
// MESMA função; cada troca vira um evento na conversa ("Junior assumiu às
// HH:MM" / "Devolvido para a Eva às HH:MM"). Nada de segunda pausa paralela.
import { describe, it, expect, vi } from 'vitest';
import { assumirAtendimento, devolverParaEva, ultimoEventoDeAtendimento } from '../src/modules/assumir-atendimento.js';
import { tryHandleEvaAdminButton } from '../src/modules/eva-admin-buttons.js';
import { bancoMemoria } from './helpers/supabase-memoria.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const OUTRA = 'aaaa1111-2222-3333-4444-555566667777';
const LEAD = '11111111-1111-1111-1111-111111111111';

function banco(lead: Record<string, unknown> = {}) {
  return bancoMemoria({
    leads: [{ id: LEAD, company_id: CASA, phone: '5561999990001', eva_active: true, opt_out: false, ...lead }],
    eva_cadence: [
      { id: 'c1', lead_id: LEAD, status: 'pending' },
      { id: 'c2', lead_id: LEAD, status: 'sent' },
    ],
    mensagens_whatsapp: [],
  });
}

describe('assumirAtendimento', () => {
  it('pausa a Eva (eva_active=false), cancela a cadência pendente e grava o evento "assumiu"', async () => {
    const b = banco();
    const r = await assumirAtendimento(b.client, { leadId: LEAD, companyId: CASA, origem: 'painel', userId: 'u-1', autorNome: 'Junior' });
    expect(r).toEqual({ ok: true, jaEstava: false });
    expect(b.tabelas.leads[0].eva_active).toBe(false);
    expect(b.tabelas.eva_cadence.find((c) => c.id === 'c1')!.status).toBe('cancelled');
    expect(b.tabelas.eva_cadence.find((c) => c.id === 'c1')!.cancelled_reason).toBe('admin_assumed');
    expect(b.tabelas.eva_cadence.find((c) => c.id === 'c2')!.status).toBe('sent');
    const ev = b.tabelas.mensagens_whatsapp[0];
    expect(ev).toMatchObject({ company_id: CASA, lead_id: LEAD, direcao: 'evento', tipo: 'evento', evento: 'assumiu', autor: 'humano', user_id: 'u-1', autor_nome: 'Junior', origem: 'painel' });
  });

  it('já assumido: não grava outro evento (idempotente)', async () => {
    const b = banco({ eva_active: false });
    const r = await assumirAtendimento(b.client, { leadId: LEAD, companyId: CASA, origem: 'whatsapp', autorNome: 'Junior' });
    expect(r).toEqual({ ok: true, jaEstava: true });
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(0);
  });

  it('lead de OUTRA empresa: não mexe em nada', async () => {
    const b = banco();
    const r = await assumirAtendimento(b.client, { leadId: LEAD, companyId: OUTRA, origem: 'painel', autorNome: 'Bia' });
    expect(r).toEqual({ ok: false, motivo: 'nao_encontrado' });
    expect(b.escritas).toHaveLength(0);
  });

  it('sem a tabela de mensagens (migration não aplicada): pausa igual, só o evento não fica', async () => {
    const b = banco();
    b.falharEm('mensagens_whatsapp', 'relation "mensagens_whatsapp" does not exist', '42P01');
    const r = await assumirAtendimento(b.client, { leadId: LEAD, companyId: CASA, origem: 'painel', autorNome: 'Junior' });
    expect(r.ok).toBe(true);
    expect(b.tabelas.leads[0].eva_active).toBe(false);
  });
});

describe('devolverParaEva', () => {
  it('reativa a Eva, grava "devolveu" e limpa a pausa curta do Redis do telefone', async () => {
    const b = banco({ eva_active: false });
    const retomar = vi.fn().mockResolvedValue(undefined);
    const r = await devolverParaEva(b.client, { leadId: LEAD, companyId: CASA, origem: 'painel', userId: 'u-1', autorNome: 'Junior' }, retomar);
    expect(r).toEqual({ ok: true, jaEstava: false });
    expect(b.tabelas.leads[0].eva_active).toBe(true);
    expect(retomar).toHaveBeenCalledWith('5561999990001');
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ evento: 'devolveu', autor_nome: 'Junior' });
  });

  it('contato que pediu para PARAR: a Eva não volta (LGPD)', async () => {
    const b = banco({ eva_active: false, opt_out: true });
    const r = await devolverParaEva(b.client, { leadId: LEAD, companyId: CASA, origem: 'painel', autorNome: 'Junior' });
    expect(r).toEqual({ ok: false, motivo: 'opt_out' });
    expect(b.tabelas.leads[0].eva_active).toBe(false);
    expect(b.escritas).toHaveLength(0);
  });
});

describe('ultimoEventoDeAtendimento', () => {
  it('pega o evento mais recente (quem assumiu e quando)', () => {
    const e = ultimoEventoDeAtendimento([
      { autor: 'evento', evento: 'assumiu', autorNome: 'Junior', timestamp: '2026-09-28T13:00:00Z', role: 'evento', content: '' },
      { autor: 'evento', evento: 'devolveu', autorNome: 'Bia', timestamp: '2026-09-28T14:00:00Z', role: 'evento', content: '' },
      { autor: 'cliente', role: 'user', content: 'oi', timestamp: '2026-09-28T15:00:00Z' },
    ]);
    expect(e).toEqual({ evento: 'devolveu', autorNome: 'Bia', timestamp: '2026-09-28T14:00:00Z' });
    expect(ultimoEventoDeAtendimento([])).toBeNull();
  });
});

// ---- Os dois lados enxergam o MESMO estado ----
describe('WhatsApp ⇄ painel: um estado só', () => {
  const base = { sendText: vi.fn().mockResolvedValue(undefined), from: '5561998805002', forceCadenceForSilentes: vi.fn() };

  it('WhatsApp → painel: o botão "✋ Assumir" do zap grava o mesmo estado e o evento que a tela mostra', async () => {
    const b = banco();
    const handled = await tryHandleEvaAdminButton({ ...base, client: b.client, text: `evabt:lead-pause:${LEAD}` } as any);
    expect(handled).toBe(true);
    expect(b.tabelas.leads[0].eva_active).toBe(false);
    expect(b.tabelas.mensagens_whatsapp[0]).toMatchObject({ evento: 'assumiu', origem: 'whatsapp', company_id: CASA });
  });

  it('painel → WhatsApp: assumido no painel, o botão "↩️ Reativar" do zap devolve e o painel vê "devolveu"', async () => {
    const b = banco();
    await assumirAtendimento(b.client, { leadId: LEAD, companyId: CASA, origem: 'painel', userId: 'u-1', autorNome: 'Junior' });
    const s = vi.fn().mockResolvedValue(undefined);
    await tryHandleEvaAdminButton({ ...base, sendText: s, client: b.client, text: `evabt:lead-resume:${LEAD}` } as any);
    expect(b.tabelas.leads[0].eva_active).toBe(true);
    expect(b.tabelas.mensagens_whatsapp.map((m) => m.evento)).toEqual(['assumiu', 'devolveu']);
    expect(b.tabelas.mensagens_whatsapp[1]).toMatchObject({ origem: 'whatsapp' });
  });

  it('painel → WhatsApp: tocar "✋ Assumir" no zap depois de assumir no painel avisa que já estava assumido', async () => {
    const b = banco();
    await assumirAtendimento(b.client, { leadId: LEAD, companyId: CASA, origem: 'painel', userId: 'u-1', autorNome: 'Junior' });
    const s = vi.fn().mockResolvedValue(undefined);
    await tryHandleEvaAdminButton({ ...base, sendText: s, client: b.client, text: `evabt:lead-pause:${LEAD}` } as any);
    expect(b.tabelas.mensagens_whatsapp).toHaveLength(1);
    expect(s.mock.calls[0][1]).toMatch(/já estava/i);
  });
});
