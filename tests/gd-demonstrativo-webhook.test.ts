import { describe, it, expect, vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { processarEmailGd, type DepsWebhookGd } from '../src/modules/gd/demonstrativo-webhook.js';
import type { DepsIngestao } from '../src/modules/gd/demonstrativo-ingestao.js';

const TEXTO = readFileSync(join(__dirname, 'fixtures', 'gd', 'cliente-unico-2026-06.txt'), 'utf-8');
const ECOSUN = '00000000-0000-0000-0000-000000000001';
const GD = {
  tipo: 'demonstrativo' as const,
  emailId: 'in_1',
  assunto: { referencia: '2026-06-01', nome: 'CLIENTE TESTE UM', codigoCliente: '100001', instalacao: '200002' },
};

// Contexto de empresa de mentira, com AsyncLocalStorage de verdade — o mesmo
// mecanismo do comEmpresaDe. Toda consulta registra qual empresa estava ativa.
const als = new AsyncLocalStorage<string>();
function montar(over: Partial<DepsIngestao> = {}) {
  const empresasVistas: Array<string | undefined> = [];
  const ing: DepsIngestao = {
    modoTeste: true,
    companyId: ECOSUN,
    jaProcessado: vi.fn(async () => { empresasVistas.push(als.getStore()); return false; }),
    listarAnexos: vi.fn(async () => { await new Promise((r) => setTimeout(r, 5)); return [{ id: 'p', nome: 'RelatorioResumo.pdf', tipo: null }]; }),
    baixarAnexo: vi.fn(async () => new Uint8Array([1])),
    verificarOrigem: vi.fn(async () => 'pass' as const),
    extrairTexto: vi.fn(async () => TEXTO),
    buscarLeadPorUc: vi.fn(async () => { empresasVistas.push(als.getStore()); return null; }),
    registroExistente: vi.fn(async () => null),
    buscarRateio: vi.fn(async () => []),
    geracaoDoMes: vi.fn(async () => null),
    salvar: vi.fn(async () => { empresasVistas.push(als.getStore()); }),
    avisar: vi.fn(async () => {}),
    ...over,
  };
  const deps: DepsWebhookGd = {
    rodarNaEmpresa: (fn) => als.run(ECOSUN, fn),
    montarDeps: vi.fn(() => ing),
    avisar: vi.fn(async () => {}),
    emProcesso: new Set(),
  };
  return { deps, ing, empresasVistas };
}

describe('processarEmailGd', () => {
  it('todas as consultas ao banco acontecem no contexto da EcoSun (RLS estrito)', async () => {
    const { deps, empresasVistas } = montar();
    expect(await processarEmailGd(deps, GD)).toBe('gravado');
    expect(empresasVistas.length).toBeGreaterThanOrEqual(3);
    expect(empresasVistas.every((e) => e === ECOSUN)).toBe(true);
  });

  it('as deps sao montadas DENTRO do contexto (o client nasce com o cracha certo)', async () => {
    const { deps } = montar();
    let empresaNaMontagem: string | undefined;
    const original = deps.montarDeps;
    deps.montarDeps = () => { empresaNaMontagem = als.getStore(); return original(); };
    await processarEmailGd(deps, GD);
    expect(empresaNaMontagem).toBe(ECOSUN);
  });

  it('o mesmo e-mail chegando duas vezes ao mesmo tempo processa uma vez so', async () => {
    const { deps, ing } = montar();
    const [a, b] = await Promise.all([processarEmailGd(deps, GD), processarEmailGd(deps, GD)]);
    expect([a, b].sort()).toEqual(['gravado', 'ja_em_processo']);
    expect(ing.salvar).toHaveBeenCalledTimes(1);
    expect(deps.emProcesso.size).toBe(0); // trava liberada no fim
  });

  it('libera a trava mesmo quando algo explode', async () => {
    const { deps } = montar();
    deps.montarDeps = () => { throw new Error('boom'); };
    expect(await processarEmailGd(deps, GD)).toBe('erro');
    expect(deps.emProcesso.size).toBe(0);
  });

  it('confirmacao do Gmail vai pro Junior com o codigo', async () => {
    const { deps } = montar();
    const r = await processarEmailGd(deps, { tipo: 'confirmacao_gmail', emailId: 'in_2', codigo: '42' });
    expect(r).toBe('confirmacao');
    expect((deps.avisar as any).mock.calls[0][0]).toContain('42');
  });

  it('sem configuracao (RESEND_API_KEY) nao quebra', async () => {
    const { deps } = montar();
    deps.montarDeps = () => null;
    expect(await processarEmailGd(deps, GD)).toBe('sem_config');
  });
});
