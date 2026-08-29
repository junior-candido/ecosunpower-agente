import { describe, it, expect, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  precisaFila, planoDeLotes, LIMITE_INLINE_BYTES, contarPaginas, recortarPaginas, tickArquivos,
} from '../src/modules/financeiro/arquivos-fila.js';

// Extrator stubado: cada chamada devolve UM item financeiro (a IA nunca é chamada em teste).
vi.mock('../src/modules/financeiro/extrator-lancamento.js', () => ({
  extrairDePdf: vi.fn(async () => [{ financeiro: true, intencao: 'lancar', tipo: 'despesa', valor: 10, data: null, contraparte: 'X', categoria_slug: null, pf_pj: null, obra_ref: null, descricao: null, material: null, quantidade: null, unidade: null, itens: [], campos_faltando: [], relacionado: null, tem_nota: true }]),
  extrairDeImagem: vi.fn(async () => []),
}));

async function pdfComPaginas(n: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage();
  return Buffer.from(await doc.save()).toString('base64');
}

describe('arquivos-fila: precisaFila', () => {
  it('imagem pequena e PDF de 1 página → inline', () => {
    expect(precisaFila({ bytes: 200_000, paginas: 1, mime: 'image/jpeg' })).toBe(false);
    expect(precisaFila({ bytes: 300_000, paginas: 1, mime: 'application/pdf' })).toBe(false);
  });
  it('PDF com 2+ páginas ou acima do limite → fila', () => {
    expect(precisaFila({ bytes: 300_000, paginas: 7, mime: 'application/pdf' })).toBe(true);
    expect(precisaFila({ bytes: LIMITE_INLINE_BYTES + 1, paginas: 1, mime: 'application/pdf' })).toBe(true);
  });
});

describe('arquivos-fila: planoDeLotes', () => {
  it('quebra 14 páginas em lotes de 4', () => { expect(planoDeLotes(14, 4)).toEqual([[0, 3], [4, 7], [8, 11], [12, 13]]); });
  it('1 página → um lote', () => { expect(planoDeLotes(1, 4)).toEqual([[0, 0]]); });
});

describe('arquivos-fila: pdf-lib de verdade', () => {
  it('conta 6 páginas e recorta [2..3] num PDF de 2 páginas', async () => {
    const b64 = await pdfComPaginas(6);
    expect(await contarPaginas(b64)).toBe(6);
    const fatia = await recortarPaginas(b64, 2, 3);
    expect(await contarPaginas(fatia)).toBe(2);
  });
  it('base64 que não é PDF → assume 1 página (não quebra)', async () => {
    expect(await contarPaginas(Buffer.from('nada').toString('base64'))).toBe(1);
  });
});

// Mock encadeável do Supabase: from() devolve chain; o await final resolve com o que `resolver` decidir.
function supabaseMock(row: Record<string, unknown> | null, pdfB64: string) {
  const updates: Array<Record<string, unknown>> = [];
  const chain: Record<string, unknown> = {};
  let ultimo: Record<string, unknown> | null = null;
  for (const m of ['select', 'eq', 'in', 'lt', 'order', 'limit']) chain[m] = vi.fn(() => chain);
  chain.update = vi.fn((p: Record<string, unknown>) => { ultimo = p; updates.push(p); return chain; });
  chain.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  chain.then = (res: (v: unknown) => void) => { ultimo = null; res({ data: null, error: null }); };
  const download = vi.fn(async () => ({ data: { arrayBuffer: async () => Buffer.from(pdfB64, 'base64') }, error: null }));
  const client = { from: vi.fn(() => chain), storage: { from: vi.fn(() => ({ download })) } };
  return { client, updates, download };
}

describe('arquivos-fila: tickArquivos', () => {
  it('lê PDF de 2 páginas em 1 lote: registra 1×, status ok, avisa o admin', async () => {
    const pdf = await pdfComPaginas(2);
    const row = { id: 'A1', storage_path: '2026-08/x.pdf', mime_type: 'application/pdf', paginas: 2, paginas_ok: 0, tentativas: 0, enviado_por: '5561', tipo: 'outro' };
    const { client, updates } = supabaseMock(row, pdf);
    const registrar = vi.fn(async () => undefined);
    const avisar = vi.fn(async () => undefined);
    await tickArquivos({ client: client as never, anthropic: {} as never, registrar, avisar, hoje: () => '2026-08-29' });
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(registrar).toHaveBeenCalledWith('5561', expect.objectContaining({ financeiro: true }), 'A1');
    const final = updates[updates.length - 1];
    expect(final).toMatchObject({ status: 'ok', lancamentos_criados: 1 });
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(String((avisar.mock.calls[0] as unknown[])[1])).toContain('1 lançamento');
  });
  it('PDF de 6 páginas com lotes de 4 → registrar 2× (um por lote) e paginas_ok avança', async () => {
    const pdf = await pdfComPaginas(6);
    const row = { id: 'A2', storage_path: 'p.pdf', mime_type: 'application/pdf', paginas: null, paginas_ok: 0, tentativas: 0, enviado_por: '5561', tipo: 'outro' };
    const { client, updates } = supabaseMock(row, pdf);
    const registrar = vi.fn(async () => undefined);
    await tickArquivos({ client: client as never, anthropic: {} as never, registrar, avisar: vi.fn(async () => undefined), hoje: () => '2026-08-29' });
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(updates.some((u) => u.paginas_ok === 4)).toBe(true);
    expect(updates[updates.length - 1]).toMatchObject({ status: 'ok', paginas_ok: 6, lancamentos_criados: 2 });
  });
  it('fila vazia → não faz nada', async () => {
    const { client } = supabaseMock(null, '');
    const registrar = vi.fn(async () => undefined);
    await tickArquivos({ client: client as never, anthropic: {} as never, registrar, avisar: vi.fn(async () => undefined), hoje: () => '2026-08-29' });
    expect(registrar).not.toHaveBeenCalled();
  });
  it('download falha na última tentativa → status erro + aviso "não consegui ler"', async () => {
    const row = { id: 'A3', storage_path: 'p.pdf', mime_type: 'application/pdf', paginas: 2, paginas_ok: 0, tentativas: 2, enviado_por: '5561', tipo: 'outro' };
    const { client, updates, download } = supabaseMock(row, '');
    download.mockResolvedValueOnce({ data: null, error: { message: 'sumiu' } } as never);
    const avisar = vi.fn(async () => undefined);
    await tickArquivos({ client: client as never, anthropic: {} as never, registrar: vi.fn(async () => undefined), avisar, hoje: () => '2026-08-29' });
    expect(updates[updates.length - 1]).toMatchObject({ status: 'erro' });
    expect(String((avisar.mock.calls[0] as unknown[])[1])).toContain('Não consegui ler');
  });
});
