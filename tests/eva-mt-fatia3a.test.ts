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
