import { describe, it, expect } from 'vitest';
import { clientDaMensagem } from '../src/modules/tenant-client.js';
import { SupabaseService } from '../src/modules/supabase.js';
import { createClient } from '@supabase/supabase-js';

// EVA MT — FATIA 3a (crachá nas ESCRITAS do caminho da mensagem):
// o consumer/handler deixa de escrever com a chave-mestra e passa a usar o
// client-da-EMPRESA da mensagem, atrás da flag RLS_EVA. Sem flag/env/companyId
// → o serviço de sempre (ZERO mudança em produção até virar a flag).

const ECO = '00000000-0000-0000-0000-000000000001';
const ENV_OK = {
  RLS_EVA: '1',
  SUPABASE_URL: 'https://fake.supabase.co',
  SUPABASE_ANON_KEY: 'anon-fake',
  SUPABASE_JWT_SECRET: 'segredo-de-teste',
} as Record<string, string>;

const servico = createClient('https://fake.supabase.co', 'service-fake');

describe('clientDaMensagem — o switch strangler do CONSUMER', () => {
  it('flag desligada → devolve o serviço (comportamento de hoje, byte a byte)', () => {
    expect(clientDaMensagem(ECO, servico, {})).toBe(servico);
    expect(clientDaMensagem(ECO, servico, { RLS_EVA: '0' })).toBe(servico);
  });
  it('flag ligada mas SEM companyId → serviço (NUNCA fabrica crachá chutado)', () => {
    expect(clientDaMensagem(undefined, servico, ENV_OK)).toBe(servico);
  });
  it('flag ligada mas env incompleta → serviço (não quebra o consumer)', () => {
    expect(clientDaMensagem(ECO, servico, { RLS_EVA: '1' })).toBe(servico);
  });
  it('flag + env + companyId → client DIFERENTE (o crachá da empresa)', () => {
    const c = clientDaMensagem(ECO, servico, ENV_OK);
    expect(c).not.toBe(servico);
  });
});

describe('SupabaseService.comClient / paraMensagem — clone, nunca mutação', () => {
  const cfg = { supabaseUrl: 'https://fake.supabase.co', supabaseServiceKey: 'service-fake' };
  it('comClient devolve OUTRO SupabaseService com o client injetado; o original fica intacto', () => {
    const svc = new SupabaseService(cfg);
    const original = svc.getClient();
    const injetado = createClient('https://fake.supabase.co', 'outro');
    const clone = svc.comClient(injetado);
    expect(clone).not.toBe(svc);
    expect(clone.getClient()).toBe(injetado);
    expect(svc.getClient()).toBe(original);   // singleton dos crons NUNCA muda
    expect(typeof clone.upsertLead).toBe('function'); // métodos todos presentes
  });
  it('paraMensagem: flag desligada → a MESMA instância (===) — prova do zero-mudança', () => {
    const svc = new SupabaseService(cfg);
    expect(svc.paraMensagem(ECO, {})).toBe(svc);
    expect(svc.paraMensagem(undefined, ENV_OK)).toBe(svc);
  });
  it('paraMensagem: flag + env + companyId → clone com client do crachá', () => {
    const svc = new SupabaseService(cfg);
    const db = svc.paraMensagem(ECO, ENV_OK);
    expect(db).not.toBe(svc);
    expect(db.getClient()).not.toBe(svc.getClient());
  });
});

// FATIA 3b — handleAction ganhou `db` na assinatura e as escritas das 10
// actions rodam pelo crachá. RATCHET: o que sobra de `supabase.` no corpo é
// SÓ o intencional (logs global · escalonamento/app_flags · abordagem helper
// que migra na 3c). Subiu o número = alguém escreveu fora do crachá.
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

describe('fatia 3b — ratchet do handleAction', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts'), 'utf8');
  const ini = src.indexOf('async function handleAction');
  const fim = src.indexOf('async function cancelIntroIfPending');
  const corpo = src.slice(ini, fim);
  it('assinatura tem o db (crachá injetado pelos handlers)', () => {
    expect(corpo).toContain('db: SupabaseService = supabase');
  });
  it('restam NO MÁXIMO 2 usos diretos de `supabase.` (logs global + escalonamento/app_flags) — 3c levou a abordagem', () => {
    const usos = (corpo.match(/\bsupabase\./g) ?? []).length;
    expect(usos).toBeLessThanOrEqual(2);
  });
  it('as escritas das actions rodam pelo db (amostra: upsertLead/cancelCadence/updateConversation)', () => {
    expect((corpo.match(/\bdb\.(upsertLead|cancelCadence|updateConversation|saveDossier|getClient)\b/g) ?? []).length)
      .toBeGreaterThanOrEqual(10);
  });
});

// FATIA 3c — helpers com client injetável + cancelIntroIfPending no crachá.
describe('fatia 3c — helpers do caminho da mensagem', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.ts'), 'utf8');
  it('cancelIntroIfPending recebe o db e roteia os cancelamentos por ele', () => {
    const ini = src.indexOf('async function cancelIntroIfPending');
    const corpo = src.slice(ini, src.indexOf('\n  }', ini));
    expect(corpo).toContain('db: SupabaseService = supabase');
    expect(corpo).toContain('db.cancelEvaIntro');
    expect(corpo).toContain('db.cancelCadence');
    expect(corpo).toContain('db.cancelEmailSequence');
    // o alerta de cadência FICA no serviço (app_flags é global)
    expect(corpo).toContain('client: supabase.getClient()');
  });
  it('getOrqDeps aceita client injetado (abordagem escreve com o crachá da mensagem)', () => {
    expect(src).toContain('const getOrqDeps = (client?: SupabaseClient)');
    expect(src).toContain('supabase: client ?? supabase.getClient()');
  });
  it('registrarEvento do handler de texto roda pelo db (3 pontos)', () => {
    expect((src.match(/registrarEvento\(db\.getClient\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

// FATIA 3d — SINGLETONS por chamada: followup/reengagement/capiReporter/
// proposalFollowup/testimonials/postInstall escrevem pelo crachá no caminho da
// mensagem; crons/HTTP/admin seguem no singleton (default do parâmetro).
describe('fatia 3d — singletons do caminho da mensagem no crachá', () => {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const src = readFileSync(join(raiz, 'src', 'index.ts'), 'utf8');
  const mod = (p: string) => readFileSync(join(raiz, 'src', 'modules', p), 'utf8');

  it('os métodos de ESCRITA ganharam client/db injetável com default no singleton', () => {
    expect(mod('followup.ts')).toContain('resetForLead(leadId: string, client: SupabaseClient = this.client)');
    expect(mod('reengagement-cadence.ts')).toContain('cancelAllTouches(leadId: string, client: SupabaseClient = this.supabase)');
    expect(mod('post-install.ts')).toContain('cancelAll(leadId: string, client: SupabaseClient = this.supabase)');
    expect(mod('post-install.ts')).toContain('markReviewConfirmed(leadId: string, client: SupabaseClient = this.supabase)');
    expect(mod('testimonials.ts')).toContain('client: SupabaseClient = this.supabase');
    expect(mod('proposal-followup.ts')).toContain('markClienteRespondeu(telefone: string, db: SupabaseService = this.supabase)');
    expect(mod('capi-reporter.ts')).toContain('db?: unknown');
  });

  it('caminho da mensagem passa o crachá pra CADA singleton (index.ts)', () => {
    expect(src).toContain('followup.resetForLead(lead.id, db.getClient())');
    // 1 no handler de texto + 3 nas actions (opt_out / off_topic / disqualify)
    expect((src.match(/reengagement\.cancelAllTouches\((lead\.id|leadId), db\.getClient\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((src.match(/postInstall(\?|\b).{0,3}cancelAll\(leadId, db\.getClient\(\)\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('postInstall.markReviewConfirmed(leadId, db.getClient())');
    // testimonials.save(<objeto>, db.getClient()) — regex ancorada no save
    expect(src).toMatch(/testimonials\.save\(\{[\s\S]{0,600}?\}, db\.getClient\(\)\)/);
    expect(src).toContain("capiReporter(leadId, 'Lead', { db })");
    expect(src).toContain("capiReporter(leadId, 'lead_qualificado', { db })");
    expect(src).toContain('proposalFollowup.markClienteRespondeu(from, db)');
  });

  it('capiReporter roteia as deps de banco pelo db quando informado', () => {
    expect(src).toContain('?? supabase).getLeadForCapi(id)');
    expect(src).toContain('?? supabase).recordCapiStage(id, stage)');
    expect(mod('capi-reporter.ts')).toContain('deps.getLeadForCapi(leadId, opts?.db)');
    expect(mod('capi-reporter.ts')).toContain('deps.recordCapiStage(leadId, eventName, opts?.db)');
  });

  it('crons continuam no singleton (nenhum db vaza pros processDueTouches/processFollowups)', () => {
    expect(src).not.toMatch(/processDueTouches\(db/);
    expect(src).not.toMatch(/processFollowups\(db/);
  });
});
