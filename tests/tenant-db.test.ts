import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  mintarCracha, clientDaEmpresa, limparCacheDeCrachas,
  modoRls, ehGlobalDeclarada, ROTINAS_GLOBAIS,
} from '../src/modules/tenant-db.js';

const SEGREDO = 'segredo-de-teste-nao-usar-em-producao';
const EMPRESA = '99fd46d7-60fc-49fe-918f-66587ffa3829'; // Conquista Solar

function lerPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
}

describe('tenant-db — o cracha que diz de quem e a consulta', () => {
  beforeEach(() => limparCacheDeCrachas());
  afterEach(() => { delete process.env.RLS_ESTRITO; limparCacheDeCrachas(); });

  it('o cracha carrega a empresa e pede role authenticated', () => {
    // `service_role` faz o PostgREST PULAR a RLS — e exatamente o que viemos
    // consertar. `authenticated` faz ele APLICAR.
    const p = lerPayload(mintarCracha(EMPRESA, SEGREDO));
    expect(p.company_id).toBe(EMPRESA);
    expect(p.role).toBe('authenticated');
  });

  it('a assinatura confere com o segredo — e muda se o segredo mudar', () => {
    const token = mintarCracha(EMPRESA, SEGREDO);
    const [h, pl, assinatura] = token.split('.');
    const esperada = createHmac('sha256', SEGREDO).update(`${h}.${pl}`).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(assinatura).toBe(esperada);

    const outro = mintarCracha(EMPRESA, 'outro-segredo');
    expect(outro.split('.')[2]).not.toBe(assinatura);
  });

  it('cracha de empresa diferente tem payload diferente', () => {
    const a = lerPayload(mintarCracha(EMPRESA, SEGREDO));
    const b = lerPayload(mintarCracha('00000000-0000-0000-0000-000000000001', SEGREDO));
    expect(a.company_id).not.toBe(b.company_id);
  });

  it('o cracha vence — nao fica valido pra sempre', () => {
    const p = lerPayload(mintarCracha(EMPRESA, SEGREDO, 60));
    expect((p.exp as number) - (p.iat as number)).toBe(60);
  });

  it('sem anon key ou sem segredo, devolve null em vez de meio-cliente', () => {
    const url = 'https://x.supabase.co';
    expect(clientDaEmpresa(EMPRESA, { supabaseUrl: url })).toBeNull();
    expect(clientDaEmpresa(EMPRESA, { supabaseUrl: url, supabaseAnonKey: 'anon' })).toBeNull();
    expect(clientDaEmpresa(EMPRESA, { supabaseUrl: url, supabaseJwtSecret: SEGREDO })).toBeNull();
  });

  it('sem empresa nao ha cracha — consulta sem dono nao ganha cliente', () => {
    const cfg = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', supabaseJwtSecret: SEGREDO };
    expect(clientDaEmpresa('', cfg)).toBeNull();
  });

  it('reaproveita o mesmo cliente pra mesma empresa, e da um diferente pra outra', () => {
    const cfg = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon', supabaseJwtSecret: SEGREDO };
    const a1 = clientDaEmpresa(EMPRESA, cfg);
    const a2 = clientDaEmpresa(EMPRESA, cfg);
    const b = clientDaEmpresa('00000000-0000-0000-0000-000000000001', cfg);
    expect(a1).not.toBeNull();
    expect(a1).toBe(a2);       // cache: nao minta cracha a cada consulta
    expect(b).not.toBe(a1);    // empresas nunca compartilham cliente
  });

  it('modoRls e off por padrao — a fatia 1 nao muda nada em producao', () => {
    delete process.env.RLS_ESTRITO;
    expect(modoRls()).toBe('off');
    process.env.RLS_ESTRITO = 'lixo';
    expect(modoRls()).toBe('off');
  });

  it('modoRls aceita aviso e on', () => {
    process.env.RLS_ESTRITO = 'aviso';
    expect(modoRls()).toBe('aviso');
    process.env.RLS_ESTRITO = 'ON';
    expect(modoRls()).toBe('on');
  });

  it('a lista de rotinas globais e fechada — chave mestra vira excecao com nome', () => {
    expect(ehGlobalDeclarada('coletarTelemetria')).toBe(true);
    expect(ehGlobalDeclarada('runCanalSolarIngestion')).toBe(true);
    // As que tocam dado de cliente NAO podem estar na lista.
    expect(ehGlobalDeclarada('runEmailSeq')).toBe(false);
    expect(ehGlobalDeclarada('processCadence')).toBe(false);
    expect(ehGlobalDeclarada('monitoringSyncHourly')).toBe(false);
    expect(ROTINAS_GLOBAIS.has('leads')).toBe(false);
  });
});
