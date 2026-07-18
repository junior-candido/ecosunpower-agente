// tests/rh-store.test.ts — partes puras do store do RH
import { describe, it, expect } from 'vitest';
import { montarPathCurriculo, STATUS_VALIDOS, corteRetencao, urlCurriculoDoCandidato } from '../src/modules/rh/store.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Fake mínimo: tabela responde num client, storage assina no OUTRO — prova a
// separação (RLS Fase B): leitura no crachá, URL assinada no serviço.
function fakeClients() {
  const chamadas: string[] = [];
  const tabela = {
    from: (t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => { chamadas.push(`tabela:${t}`); return { data: { curriculo_path: 'vaga-1/cv.pdf' } }; } }) }),
    }),
    storage: { from: () => ({ createSignedUrl: async () => { chamadas.push('storage:ERRADO(crachá)'); return { data: null, error: new Error('sem política de storage') }; } }) },
  } as unknown as SupabaseClient;
  const servico = {
    from: () => { throw new Error('serviço não deve ler a tabela'); },
    storage: { from: () => ({ createSignedUrl: async () => { chamadas.push('storage:servico'); return { data: { signedUrl: 'https://ok/cv.pdf' }, error: null }; } }) },
  } as unknown as SupabaseClient;
  return { tabela, servico, chamadas };
}

describe('urlCurriculoDoCandidato — storage no client de serviço (RLS Fase B)', () => {
  it('lê a tabela no crachá e assina a URL no serviço quando storageClient vem', async () => {
    const { tabela, servico, chamadas } = fakeClients();
    const url = await urlCurriculoDoCandidato(tabela, 'cand-1', servico);
    expect(url).toBe('https://ok/cv.pdf');
    expect(chamadas).toEqual(['tabela:rh_candidatos', 'storage:servico']);
  });

  it('sem storageClient, usa o mesmo client (comportamento antigo intacto)', async () => {
    const { tabela, chamadas } = fakeClients();
    const url = await urlCurriculoDoCandidato(tabela, 'cand-1');
    expect(url).toBeNull(); // o fake do crachá falha a assinatura de propósito
    expect(chamadas).toEqual(['tabela:rh_candidatos', 'storage:ERRADO(crachá)']);
  });
});

describe('rh store (partes puras)', () => {
  it('path do currículo: vaga vira pasta, sem vaga = banco-talentos', () => {
    expect(montarPathCurriculo('abc-123')).toMatch(/^abc-123\/[0-9a-f-]{36}\.pdf$/);
    expect(montarPathCurriculo(null)).toMatch(/^banco-talentos\/[0-9a-f-]{36}\.pdf$/);
  });

  it('lista de status do funil é a combinada', () => {
    expect([...STATUS_VALIDOS]).toEqual(['novo', 'triado', 'entrevista', 'aprovado', 'reprovado']);
  });

  it('corte de retenção = 365 dias atrás, em ISO', () => {
    const agora = Date.UTC(2026, 6, 4, 12, 0, 0); // 04/07/2026 12:00Z
    const corte = corteRetencao(agora);
    expect(corte).toBe(new Date(agora - 365 * 24 * 60 * 60 * 1000).toISOString());
    expect(corte.startsWith('2025-07-04')).toBe(true);
  });
});
