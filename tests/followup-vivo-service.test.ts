import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FollowupVivoService } from '../src/modules/vendas/followup-vivo.js';

type Row = Record<string, any>;
function fakeDb() {
  const tabelas: Record<string, Row[]> = {
    proposta_followup_vivo: [], eva_cadence: [], reengagement_touches: [],
    propostas_publicas: [], leads: [], conversations: [], eventos_elo: [],
  };
  /** etapas cujo lock otimista (pending -> sending) deve "perder" (outro cron pegou antes) */
  const lockPerde = new Set<string>();
  const from = (t: string) => {
    const rows = tabelas[t];
    const q: any = { _f: [] as Array<(r: Row) => boolean>, _order: null as null | [string, boolean], _limit: Infinity, _sel: null as null | string };
    const ap = () => rows.filter(r => q._f.every((f: any) => f(r)));
    q.select = (s?: string) => { q._sel = s ?? null; return q; };
    q.eq = (k: string, v: any) => { q._f.push((r: Row) => r[k] === v); return q; };
    q.is = (k: string, v: any) => { q._f.push((r: Row) => r[k] == v); return q; };
    q.in = (k: string, vs: any[]) => { q._f.push((r: Row) => vs.includes(r[k])); return q; };
    q.lte = (k: string, v: any) => { q._f.push((r: Row) => r[k] <= v); return q; };
    q.lt = (k: string, v: any) => { q._f.push((r: Row) => r[k] < v); return q; };
    q.ilike = (k: string, pat: string) => { const sub = pat.replace(/%/g, '').toLowerCase(); q._f.push((r: Row) => String(r[k] ?? '').toLowerCase().includes(sub)); return q; };
    q.order = (k: string, o?: any) => { q._order = [k, !!o?.ascending]; return q; };
    q.limit = (n: number) => { q._limit = n; return q; };
    const resultado = () => {
      let d = ap();
      if (q._order) d = [...d].sort((a, b) => (a[q._order![0]] < b[q._order![0]] ? -1 : 1) * (q._order![1] ? 1 : -1));
      return d.slice(0, q._limit);
    };
    q.maybeSingle = async () => ({ data: resultado()[0] ?? null, error: null });
    q.single = q.maybeSingle;
    q.then = (res: any) => Promise.resolve({ data: resultado(), error: null }).then(res);
    // honra ignoreDuplicates: true = não toca linha existente; false = merge
    q.upsert = async (list: Row[] | Row, opts?: any) => {
      for (const r of Array.isArray(list) ? list : [list]) {
        const keys = (opts?.onConflict ?? 'id').split(',');
        const i = rows.findIndex(x => keys.every((k: string) => x[k] === r[k]));
        if (i >= 0) { if (!opts?.ignoreDuplicates) rows[i] = { ...rows[i], ...r }; }
        else rows.push({ id: `id${rows.length + 1}`, ...r });
      }
      return { error: null };
    };
    q.insert = q.upsert;
    q.update = (patch: Row) => {
      const u: any = { _f: [...q._f] };
      u.eq = (k: string, v: any) => { u._f.push((r: Row) => r[k] === v); return u; };
      u.in = (k: string, vs: any[]) => { u._f.push((r: Row) => vs.includes(r[k])); return u; };
      u.lt = (k: string, v: any) => { u._f.push((r: Row) => r[k] < v); return u; };
      u.select = () => u;
      u.then = (res: any) => {
        let hit = rows.filter(r => u._f.every((f: any) => f(r)));
        if (patch.status === 'sending') hit = hit.filter(r => !lockPerde.has(r.etapa));
        hit.forEach(r => Object.assign(r, patch));
        return Promise.resolve({ data: hit, error: null }).then(res);
      };
      return u;
    };
    return q;
  };
  return { tabelas, lockPerde, client: { from } };
}

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0); // seg 12:00 BRT
const DIA = 86_400_000;
const mk = (db: ReturnType<typeof fakeDb>, extra: Partial<ConstructorParameters<typeof FollowupVivoService>[0]> = {}) =>
  new FollowupVivoService({
    client: db.client as any,
    sendText: vi.fn().mockResolvedValue(undefined),
    sendTemplate: vi.fn().mockResolvedValue({ templateUsado: 'reativacao_lead_v1' }),
    janela24hAberta: vi.fn().mockResolvedValue(true),
    emTakeover: vi.fn().mockResolvedValue(false),
    redator: vi.fn().mockResolvedValue('Oi Joel, ainda faz sentido? https://x/p/joel'),
    buscarCasoSimilar: vi.fn().mockResolvedValue(null),
    proposalBaseUrl: 'https://x/p',
    validadeKitDias: 15,
    ...extra,
  });

describe('FollowupVivoService', () => {
  let db: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    db = fakeDb();
    db.tabelas.propostas_publicas.push({
      slug: 'joel', cliente_nome: 'Joel Lima', cliente_telefone: '5561999999999', lead_id: 'L1',
      created_at: new Date(T0).toISOString(), dados_input: { economiaMensal: 743 }, revoked: false,
    });
    db.tabelas.leads.push({ id: 'L1', phone: '5561999999999', eva_active: true, opt_out: false, status: 'proposta_enviada', contact_type: 'cliente' });
    db.tabelas.eva_cadence.push({ id: 'c1', lead_id: 'L1', status: 'pending' });
    db.tabelas.reengagement_touches.push({ id: 'r1', lead_id: 'L1', status: 'pending' });
  });

  it('agendarParaProposta cria 10 etapas e cancela as cadências antigas do lead', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    expect(db.tabelas.proposta_followup_vivo).toHaveLength(10);
    expect(db.tabelas.eva_cadence[0].status).toBe('cancelled');
    expect(db.tabelas.reengagement_touches[0].status).toBe('canceled'); // grafia do módulo dono
  });

  it('agendar duas vezes não duplica nem sobrescreve etapa já enviada (onConflict slug+etapa)', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!.status = 'sent';
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    expect(db.tabelas.proposta_followup_vivo).toHaveLength(10);
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!.status).toBe('sent');
  });

  it('processarDevidos envia a etapa vencida por texto (janela aberta), marca sent e registra evento Elo', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const n = await svc.processarDevidos(T0 + 3 * DIA + 60_000); // logo após D3
    expect(n).toBe(2); // NA24 e D3 vencidas
    const d3 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!;
    expect(d3.status).toBe('sent');
    expect(d3.message_sent).toContain('Joel');
    expect((svc as any).deps.sendText).toHaveBeenCalledTimes(2);
    expect(db.tabelas.eventos_elo).toHaveLength(2);
    expect(db.tabelas.eventos_elo[0]).toMatchObject({ tipo: 'comercial:followup_vivo', lead_id: 'L1', origem: 'followup-vivo' });
  });

  it('fora do horário não envia nada', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const n = await svc.processarDevidos(Date.UTC(2026, 7, 30, 13, 0, 0)); // domingo
    expect(n).toBe(0);
  });

  it('janela fechada → template, e registra o template no message_sent', async () => {
    const svc = mk(db, { janela24hAberta: vi.fn().mockResolvedValue(false) });
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.processarDevidos(T0 + 25 * 3_600_000);
    const na24 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!;
    expect(na24.status).toBe('sent');
    expect(na24.message_sent).toMatch(/template:reativacao_lead_v1/);
    expect((svc as any).deps.sendTemplate).toHaveBeenCalledOnce();
  });

  it('lead em opt-out → etapas canceladas com motivo', async () => {
    db.tabelas.leads[0].opt_out = true;
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.processarDevidos(T0 + 25 * 3_600_000);
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled' && r.cancelled_reason === 'opt_out')).toBe(true);
  });

  it('takeover do Junior → pula sem cancelar (volta quando ele soltar)', async () => {
    const svc = mk(db, { emTakeover: vi.fn().mockResolvedValue(true) });
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const n = await svc.processarDevidos(T0 + 25 * 3_600_000);
    expect(n).toBe(0);
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!.status).toBe('pending');
  });

  it('M1 enviada → agenda M2 30 dias depois', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.processarDevidos(T0 + 121 * DIA);
    const m2 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'M2');
    expect(m2).toBeTruthy();
    expect(m2!.status).toBe('pending');
  });

  it('pausarPorResposta pausa pendentes; retomarSilenciosas re-arma após 48h de silêncio da Eva', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.pausarPorResposta('5561999999999');
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'paused')).toBe(true);
    // conversa: última mensagem da Eva (messages jsonb), há 49h
    db.tabelas.conversations.push({
      lead_id: 'L1', created_at: new Date(T0).toISOString(), last_message_at: new Date(T0).toISOString(),
      messages: [{ role: 'user', content: 'oi', timestamp: '' }, { role: 'assistant', content: 'olá', timestamp: '' }],
    });
    expect(await svc.retomarSilenciosas(T0 + 10 * 3_600_000)).toBe(0); // ainda não deu 48h
    const n = await svc.retomarSilenciosas(T0 + 49 * 3_600_000);
    expect(n).toBe(10);
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'pending')).toBe(true);
  });

  it('retomarSilenciosas NÃO re-arma se a última mensagem foi do cliente', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.pausarPorResposta('5561999999999');
    db.tabelas.conversations.push({
      lead_id: 'L1', created_at: new Date(T0).toISOString(), last_message_at: new Date(T0).toISOString(),
      messages: [{ role: 'user', content: 'oi', timestamp: '' }],
    });
    expect(await svc.retomarSilenciosas(T0 + 49 * 3_600_000)).toBe(0);
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'paused')).toBe(true);
  });

  it('cancelar por lead marca tudo cancelled', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.cancelarPorLead('L1', 'fechou');
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled' && r.cancelled_reason === 'fechou')).toBe(true);
  });

  it('agendarAbriuSemResposta cria A2H para +2h dentro do horário', async () => {
    const svc = mk(db);
    await svc.agendarAbriuSemResposta('joel', T0);
    const a2h = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'A2H')!;
    expect(a2h).toMatchObject({ status: 'pending', lead_id: 'L1' });
    expect(Date.parse(a2h.scheduled_for)).toBe(T0 + 2 * 3_600_000);
  });

  it('agendarPosVisita cria POS_VISITA para agora e re-arma D3..D20 (inclusive já enviada)', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const d3Antes = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!;
    Object.assign(d3Antes, { status: 'sent', sent_at: new Date(T0 + 3 * DIA).toISOString(), message_sent: 'x' });
    const visita = T0 + 9 * DIA; // qua 02/09 12:00 BRT → D3 = sáb 05/09 (dentro do horário)
    await svc.agendarPosVisita({ leadId: 'L1', phone: '5561999999999', agoraMs: visita });
    const pos = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'POS_VISITA')!;
    expect(pos.status).toBe('pending');
    expect(Date.parse(pos.scheduled_for)).toBe(visita);
    const d3 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!;
    expect(d3.status).toBe('pending');
    expect(d3.sent_at).toBeNull();
    expect(d3.message_sent).toBeNull();
    expect(Date.parse(d3.scheduled_for)).toBe(visita + 3 * DIA);
    expect(db.tabelas.proposta_followup_vivo).toHaveLength(11);
  });

  it('lock perdido (outro cron pegou a etapa) → não envia e não mexe no status', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.lockPerde.add('D3');
    const n = await svc.processarDevidos(T0 + 3 * DIA + 60_000);
    expect(n).toBe(1); // só NA24
    expect((svc as any).deps.sendText).toHaveBeenCalledTimes(1);
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!.status).toBe('pending');
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!.status).toBe('sent');
  });

  it('proposta revogada → cancela com proposta_revogada', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.tabelas.propostas_publicas[0].revoked = true;
    expect(await svc.processarDevidos(T0 + 25 * 3_600_000)).toBe(0);
    expect((svc as any).deps.sendText).not.toHaveBeenCalled();
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled' && r.cancelled_reason === 'proposta_revogada')).toBe(true);
  });

  it('proposta sem telefone E lead sem telefone → cancela com sem_telefone', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.tabelas.propostas_publicas[0].cliente_telefone = null;
    db.tabelas.leads[0].phone = null; // nem a reserva tem — aí sim não há como falar com ele
    expect(await svc.processarDevidos(T0 + 25 * 3_600_000)).toBe(0);
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled' && r.cancelled_reason === 'sem_telefone')).toBe(true);
  });

  // [06/09/2026] Auditoria: 184 propostas vivas, só 66 com `cliente_telefone`.
  // Em 50 dos casos restantes a pessoa ESTAVA no sistema como lead, com telefone.
  // O follow-up cancelava por 'sem_telefone' e o cliente sumia — tendo o número ali.
  it('proposta sem telefone mas com lead → usa o telefone do lead e ENVIA', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.tabelas.propostas_publicas[0].cliente_telefone = null; // proposta cega
    // lead L1 continua com 5561999999999
    expect(await svc.processarDevidos(T0 + 25 * 3_600_000)).toBe(1);
    expect(db.tabelas.proposta_followup_vivo.some(r => r.cancelled_reason === 'sem_telefone')).toBe(false);
  });

  it('telefone impossível na proposta mas lead com número bom → usa o do lead', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.tabelas.propostas_publicas[0].cliente_telefone = '123'; // não normaliza
    expect(await svc.processarDevidos(T0 + 25 * 3_600_000)).toBe(1);
    expect(db.tabelas.proposta_followup_vivo.some(r => r.cancelled_reason === 'sem_telefone')).toBe(false);
  });

  it('agendarPosVisita sem leadId cai pro telefone e escolhe a proposta mais recente', async () => {
    db.tabelas.propostas_publicas.push({
      slug: 'joel-v2', cliente_nome: 'Joel Lima', cliente_telefone: '5561999999999', lead_id: null,
      created_at: new Date(T0 + 5 * DIA).toISOString(), dados_input: {}, revoked: false,
    });
    const svc = mk(db);
    await svc.agendarPosVisita({ leadId: null, phone: '5561999999999', agoraMs: T0 + 9 * DIA });
    const pos = db.tabelas.proposta_followup_vivo.filter(r => r.etapa === 'POS_VISITA');
    expect(pos).toHaveLength(1);
    expect(pos[0].proposta_slug).toBe('joel-v2');
  });

  it('agendarPosVisita com leadId e duas propostas → a mais recente por created_at', async () => {
    db.tabelas.propostas_publicas.push({
      slug: 'joel-antiga', cliente_nome: 'Joel Lima', cliente_telefone: '5561999999999', lead_id: 'L1',
      created_at: new Date(T0 - 30 * DIA).toISOString(), dados_input: {}, revoked: false,
    });
    const svc = mk(db);
    await svc.agendarPosVisita({ leadId: 'L1', phone: '5561999999999', agoraMs: T0 + 9 * DIA });
    const pos = db.tabelas.proposta_followup_vivo.filter(r => r.etapa === 'POS_VISITA');
    expect(pos).toHaveLength(1);
    expect(pos[0].proposta_slug).toBe('joel');
  });

  it('pausarPorResposta só pausa pending — sent continua sent', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.processarDevidos(T0 + 25 * 3_600_000); // NA24 enviada
    await svc.pausarPorResposta('5561999999999');
    const na24 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!;
    expect(na24.status).toBe('sent');
    expect(db.tabelas.proposta_followup_vivo.filter(r => r.etapa !== 'NA24').every(r => r.status === 'paused')).toBe(true);
  });

  it('retomarSilenciosas: vencida vai pra proximoHorarioValido(agora), futura mantém a própria data', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.pausarPorResposta('5561999999999');
    db.tabelas.conversations.push({
      lead_id: 'L1', created_at: new Date(T0).toISOString(), last_message_at: new Date(T0).toISOString(),
      messages: [{ role: 'assistant', content: 'olá', timestamp: '' }],
    });
    const agora = Date.UTC(2026, 7, 29, 23, 30, 0); // sáb 20:30 BRT (fora do horário) → seg 31/08 08:00 BRT
    const esperado = Date.UTC(2026, 7, 31, 11, 0, 0);
    const d3Antes = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!.scheduled_for;
    const d12Antes = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D12')!.scheduled_for;
    expect(Date.parse(d3Antes)).toBeLessThan(agora);
    expect(Date.parse(d12Antes)).toBeGreaterThan(esperado);
    await svc.retomarSilenciosas(agora);
    const d3 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!;
    const d12 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D12')!;
    expect(d3.status).toBe('pending');
    expect(Date.parse(d3.scheduled_for)).toBe(esperado);
    expect(d12.status).toBe('pending');
    expect(d12.scheduled_for).toBe(d12Antes);
  });

  it('pausarPorResposta acha a proposta mesmo com telefone formatado "(61) 99999-9999"', async () => {
    db.tabelas.propostas_publicas[0].cliente_telefone = '(61) 99999-9999';
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.pausarPorResposta('5561999999999');
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'paused')).toBe(true);
  });

  it('pausarPorResposta NÃO pausa proposta de outro número com mesmos 8 dígitos finais (DDD diferente)', async () => {
    db.tabelas.propostas_publicas[0].cliente_telefone = '(11) 99999-9999';
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.pausarPorResposta('5561999999999');
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'pending')).toBe(true);
  });

  it('agendarPosVisita por telefone acha proposta com telefone formatado', async () => {
    db.tabelas.propostas_publicas[0].cliente_telefone = '+55 (61) 99999-9999';
    const svc = mk(db);
    await svc.agendarPosVisita({ leadId: null, phone: '5561999999999', agoraMs: T0 + 9 * DIA });
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'POS_VISITA')).toBeTruthy();
  });

  it('processarDevidos varre "sending" preso há mais de 30 min → failed (não reenvia)', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const na24 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!;
    na24.status = 'sending';
    const n = await svc.processarDevidos(T0 + 25 * 3_600_000); // NA24 vencida há 1h
    expect(n).toBe(0);
    expect(na24.status).toBe('failed');
    expect(na24.error_message).toBe('sending_expirado');
    expect((svc as any).deps.sendText).not.toHaveBeenCalled();
  });

  it('"sending" recente (< 30 min) não é varrido', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    const na24 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!;
    na24.status = 'sending';
    await svc.processarDevidos(Date.parse(na24.scheduled_for) + 10 * 60_000);
    expect(na24.status).toBe('sending');
  });

  it('agendarPosVisita com lead em opt-out não re-arma nada', async () => {
    db.tabelas.leads[0].opt_out = true;
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.cancelarPorLead('L1', 'opt_out');
    await svc.agendarPosVisita({ leadId: 'L1', phone: '5561999999999', agoraMs: T0 + 9 * DIA });
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'POS_VISITA')).toBeUndefined();
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled')).toBe(true);
  });

  it('agendarPosVisita com proposta revogada (cancelada por isso) não re-arma', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.cancelarPorSlug('joel', 'proposta_revogada');
    await svc.agendarPosVisita({ leadId: 'L1', phone: '5561999999999', agoraMs: T0 + 9 * DIA });
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'POS_VISITA')).toBeUndefined();
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled')).toBe(true);
  });

  it('agendarPosVisita re-arma etapa cancelada por outro motivo (ex.: fechou errado) zerando cancelled_reason', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    await svc.cancelarPorSlug('joel', 'takeover');
    await svc.agendarPosVisita({ leadId: 'L1', phone: '5561999999999', agoraMs: T0 + 9 * DIA });
    const d3 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!;
    expect(d3.status).toBe('pending');
    expect(d3.cancelled_reason).toBeNull();
    expect(d3.error_message).toBeNull();
  });

  it('agendarParaProposta com leadId null resolve o lead pelo slug e cancela as cadências', async () => {
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: null, enviadaEmMs: T0 });
    expect(db.tabelas.proposta_followup_vivo).toHaveLength(10);
    expect(db.tabelas.proposta_followup_vivo.every(r => r.lead_id === 'L1')).toBe(true);
    expect(db.tabelas.eva_cadence[0].status).toBe('cancelled');
    expect(db.tabelas.reengagement_touches[0].status).toBe('canceled');
  });

  it('envio usa o telefone NORMALIZADO mesmo com cliente_telefone formatado', async () => {
    db.tabelas.propostas_publicas[0].cliente_telefone = '(61) 99999-9999';
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    expect(await svc.processarDevidos(T0 + 25 * 3_600_000)).toBe(1);
    expect((svc as any).deps.sendText).toHaveBeenCalledWith('5561999999999', expect.any(String));
    expect((svc as any).deps.janela24hAberta).toHaveBeenCalledWith('5561999999999');
    expect((svc as any).deps.emTakeover).toHaveBeenCalledWith('5561999999999');
  });

  it('telefone que não normaliza e sem reserva no lead → cancela com sem_telefone', async () => {
    db.tabelas.propostas_publicas[0].cliente_telefone = '1234';
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    db.tabelas.leads[0].phone = null; // sem reserva
    expect(await svc.processarDevidos(T0 + 25 * 3_600_000)).toBe(0);
    expect(db.tabelas.proposta_followup_vivo.every(r => r.status === 'cancelled' && r.cancelled_reason === 'sem_telefone')).toBe(true);
  });

  it('NA24 com proposta já aberta (acessos > 0) → cancela só a NA24 com ja_abriu; D3 segue depois', async () => {
    db.tabelas.propostas_publicas[0].acessos = 1;
    const svc = mk(db);
    await svc.agendarParaProposta({ slug: 'joel', leadId: 'L1', enviadaEmMs: T0 });
    expect(await svc.processarDevidos(T0 + 25 * 3_600_000)).toBe(0);
    const na24 = db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'NA24')!;
    expect(na24.status).toBe('cancelled');
    expect(na24.cancelled_reason).toBe('ja_abriu');
    expect((svc as any).deps.sendText).not.toHaveBeenCalled();
    expect(db.tabelas.proposta_followup_vivo.filter(r => r.etapa !== 'NA24').every(r => r.status === 'pending')).toBe(true);
    expect(await svc.processarDevidos(T0 + 3 * DIA + 60_000)).toBe(1);
    expect(db.tabelas.proposta_followup_vivo.find(r => r.etapa === 'D3')!.status).toBe('sent');
  });
});
