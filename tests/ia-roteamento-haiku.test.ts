// tests/ia-roteamento-haiku.test.ts
// Economia de IA — versão CONSERVADORA (29/09/2026, aprovada pelo Junior).
// Conversa com cliente NÃO muda de modelo. Só tarefa interna, sem conversa e
// só com TEXTO (sem foto/PDF) vai pro Haiku 4.5 — mesmo pedido, mesmo leitor da
// resposta, mesmo formato de saída. Se o Haiku falhar, cai no modelo forte.
import { describe, it, expect } from 'vitest';
import { extrairDeTexto, corrigirItensComTexto, extrairDeImagem } from '../src/modules/financeiro/extrator-lancamento.js';

const HAIKU = 'claude-haiku-4-5-20251001';

function fakeClient(resposta: string, falharEm: string[] = []) {
  const modelos: string[] = [];
  const client: any = {
    messages: {
      async create(req: any) {
        modelos.push(req.model);
        if (falharEm.includes(req.model)) throw new Error('indisponível');
        return { model: req.model, usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: resposta }] };
      },
    },
  };
  return { client, modelos };
}

const JSON_LANC = '```json\n[{"tipo":"saida","valor":300,"descricao":"gasolina","data":"2026-09-29","categoria":"combustivel"}]\n```';

describe('caixa de entrada: texto do dono → Haiku', () => {
  it('extrairDeTexto usa o Haiku e devolve o mesmo formato', async () => {
    const { client, modelos } = fakeClient(JSON_LANC);
    const r = await extrairDeTexto(client, 'paguei 300 de gasolina', '2026-09-29');
    expect(modelos).toEqual([HAIKU]);
    expect(Array.isArray(r)).toBe(true);
  });

  it('Haiku fora do ar → cai no modelo forte (nada se perde)', async () => {
    const { client, modelos } = fakeClient(JSON_LANC, [HAIKU]);
    await extrairDeTexto(client, 'paguei 300 de gasolina', '2026-09-29');
    expect(modelos[0]).toBe(HAIKU);
    expect(modelos[1]).toMatch(/opus/);
  });

  it('corrigirItensComTexto usa o Haiku', async () => {
    const { client, modelos } = fakeClient('```json\n[]\n```');
    const itens = [{ material: 'cabo 6mm', quantidade: 100, unidade: 'm', preco_unitario: 5, problema: null }] as any;
    await corrigirItensComTexto(client, itens, 'o cabo é 50 metros', '2026-09-29');
    expect(modelos).toEqual([HAIKU]);
  });

  it('FOTO continua no modelo forte (leitura de imagem não muda)', async () => {
    const { client, modelos } = fakeClient(JSON_LANC);
    await extrairDeImagem(client, 'AAAA', 'image/jpeg', '2026-09-29');
    expect(modelos[0]).toMatch(/opus/);
  });
});
