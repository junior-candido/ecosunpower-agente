// lead-synthesis.ts (sem tela desde #346) preso à empresa ANTES de religar:
// toda consulta filtra company_id, o lead de outra empresa nunca é lido e o
// cache não vaza entre empresas.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/modules/custos/ia-metering.js', () => ({ medirIa: vi.fn() }));

import { bancoFalso, type Linha } from './helpers/banco-falso.js';
import {
  synthesizeLead, getPlatformInsights, getLeadsAguardandoAcao, invalidateInsightsCache,
} from '../src/modules/dashboard/lead-synthesis.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const CONQ = 'c0c0c0c0-2222-3333-4444-555566667777';
const VELHO = '2026-09-01T10:00:00Z';

function banco(): Record<string, Linha[]> {
  return {
    leads: [
      { id: 'L-E', company_id: ECOSUN, name: 'Cliente EcoSun', phone: '61999990001', city: 'Gama', status: 'qualificado', eva_active: true, opt_out: false, updated_at: VELHO, created_at: VELHO },
      { id: 'L-C', company_id: CONQ, name: 'Cliente Conquista', phone: '77999990002', city: 'Vitória da Conquista', status: 'qualificado', eva_active: true, opt_out: false, updated_at: VELHO, created_at: VELHO },
    ],
    conversations: [
      { lead_id: 'L-E', company_id: ECOSUN, created_at: VELHO, messages: [{ role: 'user', content: 'segredo da EcoSun' }] },
      { lead_id: 'L-C', company_id: CONQ, created_at: VELHO, messages: [{ role: 'user', content: 'quero orçamento' }] },
    ],
    eva_cadence: [],
    meta_ads_insights: [],
  };
}

function anthropicFalso(texto: string) {
  const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: texto }], usage: {} });
  return { client: { messages: { create } } as any, create };
}

const JSON_LEAD = '{"summary":"ok","temperatura":"🔥","suggested_action":"ligar"}';

beforeEach(() => {
  invalidateInsightsCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function semCompany(ops: Array<{ tabela: string; filtros: Array<[string, string, unknown]> }>) {
  return ops.filter((o) => !o.filtros.some(([f, c]) => f === 'eq' && c === 'company_id'));
}

describe('lead-synthesis — isolamento por empresa', () => {
  it('synthesizeLead: lead de OUTRA empresa não é lido (fallback, sem chamar a IA)', async () => {
    const { client, ops } = bancoFalso(banco());
    const ai = anthropicFalso(JSON_LEAD);
    const r = await synthesizeLead(client, ai.client, CONQ, 'L-E');
    expect(r.summary).toMatch(/sem síntese/);
    expect(ai.create).not.toHaveBeenCalled();
    expect(semCompany(ops)).toEqual([]);
  });

  it('synthesizeLead: lead da própria empresa lê só a conversa dela', async () => {
    const { client, ops } = bancoFalso(banco());
    const ai = anthropicFalso(JSON_LEAD);
    const r = await synthesizeLead(client, ai.client, CONQ, 'L-C');
    expect(r.temperatura).toBe('🔥');
    const prompt = JSON.stringify(ai.create.mock.calls[0][0]);
    expect(prompt).toContain('quero orçamento');
    expect(prompt).not.toContain('segredo da EcoSun');
    expect(semCompany(ops)).toEqual([]);
  });

  it('cache é por empresa: o que a casa gerou não volta pra outra empresa', async () => {
    const { client } = bancoFalso(banco());
    const ai = anthropicFalso(JSON_LEAD);
    await synthesizeLead(client, ai.client, ECOSUN, 'L-E');
    const outra = await synthesizeLead(client, ai.client, CONQ, 'L-E');
    expect(outra.summary).toMatch(/sem síntese/);
  });

  it('getLeadsAguardandoAcao: só leads da empresa', async () => {
    const { client, ops } = bancoFalso(banco());
    const ai = anthropicFalso(JSON_LEAD);
    const r = await getLeadsAguardandoAcao(client, ai.client, CONQ, 10);
    expect(r.map((x) => x.id)).toEqual(['L-C']);
    expect(semCompany(ops)).toEqual([]);
  });

  it('getPlatformInsights: todas as consultas filtram company_id e o cache é por empresa', async () => {
    const { client, ops } = bancoFalso(banco());
    const ai = anthropicFalso('[{"icone":"📊","titulo":"X","mensagem":"Y","prioridade":"alta"}]');
    const r = await getPlatformInsights(client, ai.client, CONQ);
    expect(r).toHaveLength(1);
    expect(ops.length).toBeGreaterThan(0);
    expect(semCompany(ops)).toEqual([]);
    expect(ops.every((o) => o.filtros.some(([f, c, v]) => f === 'eq' && c === 'company_id' && v === CONQ))).toBe(true);
    // Outra empresa: não reaproveita o cache da primeira (chama a IA de novo).
    await getPlatformInsights(client, ai.client, ECOSUN);
    expect(ai.create).toHaveBeenCalledTimes(2);
  });
});
