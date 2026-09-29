// 28/09/2026 — "Agendamento aguardando sua confirmação" na tela do lead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { blocoAgendaPendente } from '../src/modules/dashboard/atendimento-views.js';

const LEAD = '11111111-1111-1111-1111-111111111111';
const PED = '22222222-2222-2222-2222-222222222222';

describe('blocoAgendaPendente (tela do lead)', () => {
  const pedidos = [{ id: PED, tipo: 'meet' as const, quando: 'quinta (01/10), às 14h', resumo: 'conta alta <b>x</b>' }];

  it('admin vê o aviso com os 4 botões apontando pro pedido', () => {
    const h = blocoAgendaPendente(LEAD, pedidos, true);
    expect(h).toContain('Agendamento aguardando sua confirmação');
    expect(h).toContain('quinta (01/10), às 14h');
    for (const v of ['ok', 'eu', 'nao', 'outro']) expect(h).toContain(`name="acao" value="${v}"`);
    expect(h).toContain(`action="/dashboard/leads/${LEAD}/agendamento/${PED}"`);
    expect(h).toContain('✅ Confirmar e avisar');
    expect(h).toContain('📞 Eu mesmo aviso');
  });

  it('quem não é admin só vê o aviso, sem botões', () => {
    const h = blocoAgendaPendente(LEAD, pedidos, false);
    expect(h).toContain('Agendamento aguardando sua confirmação');
    expect(h).not.toContain('name="acao"');
    expect(h).toContain('Só o administrador');
  });

  it('escapa o texto do resumo e some quando não há pedido', () => {
    expect(blocoAgendaPendente(LEAD, pedidos, true)).toContain('conta alta &lt;b&gt;x&lt;/b&gt;');
    expect(blocoAgendaPendente(LEAD, [], true)).toBe('');
    expect(blocoAgendaPendente(LEAD, [], true, 'Confirmado <ok>')).toContain('Confirmado &lt;ok&gt;');
  });
});

describe('rota POST /leads/:id/agendamento/:pedidoId', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const i = fonte.indexOf("router.post('/leads/:id/agendamento/:pedidoId'");
  const rota = fonte.slice(i, i + 2200);

  it('existe, exige admin e usa a empresa DA SESSÃO', () => {
    expect(i).toBeGreaterThan(0);
    expect(rota).toContain("exigir('leads', 'editar')");
    expect(rota).toMatch(/if \(!viewer\.isAdmin\) return res\.status\(403\)/);
    expect(rota).toContain('options.agendamentos.responder(viewer.companyId, id, pedidoId, acao');
  });

  it('o index confere pedido × lead e roda no contexto da empresa', () => {
    const idx = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8');
    const j = idx.indexOf('agendamentos: {');
    const bloco = idx.slice(j, j + 2000);
    expect(bloco).toContain('if (!p || p.leadId !== leadId)');
    expect(bloco).toContain('comEmpresaDe(cid, () => comCanal(');
  });
});
