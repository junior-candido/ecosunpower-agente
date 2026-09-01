// tests/conhecimento-empresa.test.ts
//
// Junior 01/09/2026: "se eu tiver que mexer no meu para melhorar, lá fica ruim".
// Cada empresa passa a ter a sua base. Aqui o carregamento (boot), o cache por
// empresa e a montagem do texto que a assistente lê.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  carregarConhecimentoEmpresas, conhecimentoDaEmpresa, itensDaEmpresa,
  faltaPreencher, salvarConhecimento, _resetConhecimentoParaTeste,
} from '../src/modules/conhecimento-empresa.js';

function clienteFake(linhas: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order']) chain[m] = vi.fn(() => chain);
  chain.then = (res: (v: unknown) => void) => res({ data: linhas, error: null });
  return { from: vi.fn(() => chain) } as never;
}

const linhasConquista = [
  { company_id: 'c1', chave: 'produto', titulo: 'O que a empresa vende', conteudo: 'Fotovoltaico e aquecimento solar de água.', ordem: 10, ativo: true },
  { company_id: 'c1', chave: 'garantia', titulo: 'Garantias que oferece', conteudo: '12 meses de instalação.', ordem: 30, ativo: true },
  { company_id: 'c1', chave: 'regiao', titulo: 'Onde atende', conteudo: '', ordem: 40, ativo: true },
];

describe('base de conhecimento por empresa', () => {
  beforeEach(() => _resetConhecimentoParaTeste());

  it('carrega do banco e devolve o texto da empresa', async () => {
    await carregarConhecimentoEmpresas(clienteFake(linhasConquista));
    const txt = conhecimentoDaEmpresa('c1');
    expect(txt).toContain('O que a empresa vende');
    expect(txt).toContain('aquecimento solar');
    expect(txt).toContain('12 meses');
  });

  it('respeita a ordem definida', async () => {
    await carregarConhecimentoEmpresas(clienteFake(linhasConquista));
    const txt = conhecimentoDaEmpresa('c1');
    expect(txt.indexOf('O que a empresa vende')).toBeLessThan(txt.indexOf('Garantias'));
  });

  it('assunto sem conteúdo NÃO entra — assistente sem resposta é melhor que inventando', async () => {
    await carregarConhecimentoEmpresas(clienteFake(linhasConquista));
    expect(conhecimentoDaEmpresa('c1')).not.toContain('Onde atende');
  });

  it('empresa sem base devolve vazio, não a base de outra', async () => {
    await carregarConhecimentoEmpresas(clienteFake(linhasConquista));
    expect(conhecimentoDaEmpresa('OUTRA')).toBe('');
    expect(conhecimentoDaEmpresa(null)).toBe('');
  });

  it('banco fora não derruba: devolve vazio e segue', async () => {
    const quebrado = { from: vi.fn(() => { throw new Error('sem conexão'); }) } as never;
    await expect(carregarConhecimentoEmpresas(quebrado)).resolves.toBeDefined();
    expect(conhecimentoDaEmpresa('c1')).toBe('');
  });

  it('lista o que ainda falta preencher — alimenta o semáforo do cadastro', async () => {
    await carregarConhecimentoEmpresas(clienteFake(linhasConquista));
    const falta = faltaPreencher('c1');
    expect(falta).toContain('Onde atende');
    expect(falta).not.toContain('O que a empresa vende');
  });

  it('itensDaEmpresa devolve tudo, inclusive o que está vazio (a tela precisa mostrar)', async () => {
    await carregarConhecimentoEmpresas(clienteFake(linhasConquista));
    expect(itensDaEmpresa('c1')).toHaveLength(3);
  });

  it('salvar grava o conteudo da empresa certa e atualiza o cache na hora', async () => {
    const calls: Record<string, unknown[][]> = {};
    const chain: Record<string, unknown> = {};
    for (const m of ['update', 'eq', 'select', 'order']) {
      chain[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return chain; });
    }
    chain.then = (res: (v: unknown) => void) => res({ data: linhasConquista, error: null });
    const client = { from: vi.fn(() => chain) } as never;
    await carregarConhecimentoEmpresas(clienteFake(linhasConquista));  // a empresa precisa estar carregada

    const r = await salvarConhecimento(client, 'c1', 'garantia', '  12 meses de instalação.  ');
    expect(r.ok).toBe(true);
    const row = calls.update![0][0] as Record<string, unknown>;
    expect(row.conteudo).toBe('12 meses de instalação.');   // sem espaço sobrando
    const filtros = (calls.eq ?? []).map(a => `${a[0]}=${a[1]}`);
    expect(filtros).toContain('company_id=c1');             // nunca mexe na base de outra
    expect(filtros).toContain('chave=garantia');
  });

  it('assunto que nao existe no cadastro e recusado', async () => {
    const client = { from: vi.fn() } as never;
    const r = await salvarConhecimento(client, 'c1', 'inventado', 'texto');
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/assunto/i);
  });
});
