import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Fase B do RLS — strangler fig (docs/ecosof/04-rls-fase-a-b.md). A migração é
// rota a rota: cada leitura trocada de `supabase` (service_role, bypassa RLS)
// para `bancoDoOperador(req, supabase)` (client-do-operador, RLS 079 filtra por
// company_id). Este teste é o "teto" — não deixa o router.ts crescer em
// `supabase.from(` cru sem que alguém migre outra rota primeiro.
//
// abaixe o teto a cada rota migrada — impede regressão (novo supabase.from cru)
const TETO = 5;

describe('router do dashboard — teto de supabase.from( cru (ratchet RLS Fase B)', () => {
  const arquivo = join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts');
  const conteudo = readFileSync(arquivo, 'utf-8');

  it('encontra o router.ts (sanidade)', () => {
    expect(conteudo.length).toBeGreaterThan(1000);
  });

  it('não regride: nº de "supabase.from(" cru fica <= TETO', () => {
    const ocorrencias = conteudo.split('supabase.from(').length - 1;
    expect(
      ocorrencias,
      `router.ts tem ${ocorrencias} ocorrências de "supabase.from(" cru, teto é ${TETO}.\n` +
        `Se migrou uma rota de leitura pro bancoDoOperador(req, supabase): abaixe TETO.\n` +
        `Se ADICIONOU um "supabase.from(" novo: use bancoDoOperador(req, supabase) em vez do service_role cru.`,
    ).toBeLessThanOrEqual(TETO);
  });
});
