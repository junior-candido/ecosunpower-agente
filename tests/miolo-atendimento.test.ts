// Atendimento (Leads › Conversas, 28/09/2026 — Parte 1). Tela sem lead aberto,
// ajudantes puros, trava de empresa na rota e tema escuro de Leads/Funil.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  renderAtendimentoPage, horaCurta, rotuloDia, corpoDaMensagem, linkWhatsApp, corAvatar,
} from '../src/modules/dashboard/atendimento-views.js';
import { leadDaSessao } from '../src/modules/dashboard/leads-queries.js';
import { renderLeadsListPage } from '../src/modules/dashboard/leads-views.js';
import { CASOS_FUNIL } from './fixtures/casos-funil.js';
import { USER_CASA, USER_TENANT, LISTA_CONVERSAS, LINHAS_LEADS } from './fixtures/miolo-leads.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const VAZIA = { itens: [], contagem: { todas: 0, aguardando: 0, meus: 0, porEtapa: {} } };

describe('Conversas sem lead aberto (/dashboard/leads/conversas)', () => {
  const h = miolo(renderAtendimentoPage({ user: USER_CASA, lista: LISTA_CONVERSAS, filtros: {}, lead: null }));

  it('lista + "escolha uma conversa"; sem cockpit, sem janelinhas, sem script', () => {
    expect(h).toContain('class="cc-root cc-at"');
    expect(h).toContain('Escolha uma conversa');
    expect(h).not.toContain('modal-fechou');
    expect(h).not.toContain('modal-marcar-perdido');
    expect(h).not.toContain('/start-cadence');
    expect((h.match(/class="cc-at-item( cc-on)?"/g) ?? []).length).toBe(3);
    expect(h).not.toContain('cc-at-item cc-on');
  });

  it('item "Conversas" aceso no menu; atalhos Conversas · Lista · Funil', () => {
    const pagina = renderAtendimentoPage({ user: USER_CASA, lista: VAZIA, filtros: {}, lead: null });
    expect(pagina).toMatch(/<a[^>]*class="[^"]*cc-on[^"]*"[^>]*href="\/dashboard\/leads\/conversas"|href="\/dashboard\/leads\/conversas"[^>]*class="[^"]*cc-on/);
    expect(miolo(pagina)).toContain('href="/dashboard/leads/kanban"');
  });

  it('lista vazia / filtro sem resultado → estado vazio', () => {
    expect(miolo(renderAtendimentoPage({ user: USER_CASA, lista: VAZIA, filtros: {}, lead: null }))).toContain('Nenhuma conversa ainda');
    expect(miolo(renderAtendimentoPage({ user: USER_CASA, lista: VAZIA, filtros: { q: 'zzz' }, lead: null }))).toContain('Nenhuma conversa neste filtro');
  });

  it('tenant: "Assistente:" na prévia, nada da casa', () => {
    const t = renderAtendimentoPage({ user: USER_TENANT, lista: LISTA_CONVERSAS, filtros: {}, lead: null });
    expect(miolo(t)).toContain('Assistente: Posso te mandar');
    expect(miolo(t)).not.toContain('Eva');
    expect(t).not.toContain('33.020.459');
    expect(t).not.toContain('EcoSunPower Energia Solar');
  });
});

describe('ajudantes puros', () => {
  const agora = Date.parse('2026-09-28T15:00:00Z'); // 12:00 em Brasília
  it('horaCurta: hoje → hh:mm, ontem → Ontem, antes → dd/mm, sem data → ""', () => {
    expect(horaCurta('2026-09-28T13:24:00Z', agora)).toBe('10:24');
    expect(horaCurta('2026-09-27T13:24:00Z', agora)).toBe('Ontem');
    expect(horaCurta('2026-09-20T13:24:00Z', agora)).toBe('20/09');
    expect(horaCurta(null, agora)).toBe('');
    expect(horaCurta('lixo', agora)).toBe('');
  });
  it('rotuloDia: Hoje / Ontem / data', () => {
    expect(rotuloDia('2026-09-28T13:00:00Z', agora)).toBe('Hoje');
    expect(rotuloDia('2026-09-27T13:00:00Z', agora)).toBe('Ontem');
    expect(rotuloDia('2026-09-01T13:00:00Z', agora)).toBe('01/09/2026');
  });
  it('corpoDaMensagem: marcador de mídia vira etiqueta; texto sempre escapado', () => {
    expect(corpoDaMensagem('[Enviou uma foto]', true)).toContain('📷 Foto');
    expect(corpoDaMensagem('[Enviou uma foto]', true)).toContain('href="#arquivos"');
    expect(corpoDaMensagem('[Enviou um PDF]', false)).not.toContain('#arquivos');
    expect(corpoDaMensagem('[áudio] oi', false)).toContain('🎤 Áudio');
    expect(corpoDaMensagem('[Cliente enviou um VIDEO. Transcricao: x]', false)).toContain('🎬 Vídeo enviado pelo cliente');
    expect(corpoDaMensagem('<img src=x onerror=alert(1)>', false)).toContain('&lt;img');
    expect(corpoDaMensagem('[imagem] <b>x</b>', false)).not.toContain('<b>');
  });
  it('linkWhatsApp: telefone normalizado com 55; "sem-telefone-…" → null', () => {
    expect(linkWhatsApp('61999990001')).toBe('https://wa.me/5561999990001');
    expect(linkWhatsApp('sem-telefone-abc')).toBeNull();
  });
  it('corAvatar estável e dentro de 0..5', () => {
    expect(corAvatar('Ana')).toBe(corAvatar('Ana'));
    expect(corAvatar('x')).toBeGreaterThanOrEqual(0);
    expect(corAvatar('x')).toBeLessThan(6);
  });
});

describe('trava de empresa na rota /leads/:id (multi-tenant)', () => {
  it('leadDaSessao: mesma empresa → sim; outra → não; legado sem company_id = casa; sem sessão → não', () => {
    expect(leadDaSessao({ company_id: USER_TENANT.companyId }, USER_TENANT)).toBe(true);
    expect(leadDaSessao({ company_id: USER_CASA.companyId }, USER_TENANT)).toBe(false);
    expect(leadDaSessao({ company_id: null }, USER_CASA)).toBe(true);
    expect(leadDaSessao({ company_id: null }, USER_TENANT)).toBe(false);
    expect(leadDaSessao({ company_id: USER_CASA.companyId }, undefined)).toBe(false);
  });

  it('router: /leads/conversas vem antes de /leads/:id, e a trava vem ANTES do claim automático', () => {
    const r = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
    const conversas = r.indexOf("router.get('/leads/conversas'");
    const detalhe = r.indexOf("router.get('/leads/:id',");
    expect(conversas).toBeGreaterThan(-1);
    expect(conversas).toBeLessThan(detalhe);
    const handler = r.slice(detalhe, r.indexOf('router.', detalhe + 30));
    expect(handler.indexOf('leadDaSessao(lead, viewer)')).toBeGreaterThan(-1);
    expect(handler.indexOf('leadDaSessao(lead, viewer)')).toBeLessThan(handler.indexOf('claimLead('));
    expect(handler).not.toContain('getConversaIA');
  });
});

describe('D4 = escuro: Leads (lista) e Funil abrem no tema escuro', () => {
  it('lista e funil com ecosun-body-dark e atalho para Conversas', () => {
    const l = renderLeadsListPage(LINHAS_LEADS, { total: 4 }, USER_CASA);
    expect(l).toContain('ecosun-body-dark');
    expect(miolo(l)).toContain('href="/dashboard/leads/conversas"');
    const f = CASOS_FUNIL.cheio();
    expect(f).toContain('ecosun-body-dark');
    expect(miolo(f)).toContain('href="/dashboard/leads/conversas"');
  });
});
