// tests/tabela-precos-print.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseItensDoPrint, montarPromptPrint, LeitorPrintTabela } from '../src/modules/vendas/tabela-precos-print.js';

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);

describe('parseItensDoPrint', () => {
  it('lê bloco json e descarta itens inválidos', () => {
    const raw = 'Segue:\n```json\n[{"tipo":"modulo","marca":"JA","modelo":"625","potencia_w":625,"preco":980},{"tipo":"micro","marca":"Hoymiles","modelo":"HMS-2000-4T","modulos_por_unidade":4,"preco":1450},{"tipo":"micro","marca":"GoodWe","modelo":"GW2000","preco":1300},{"tipo":"banana","preco":1}]\n```';
    const itens = parseItensDoPrint(raw, 'belenus');
    expect(itens.aceitos).toEqual([
      { tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, modulosPorUnidade: null, precoUnitario: 980, unidade: 'un', fonte: 'belenus' },
      { tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', potenciaW: null, modulosPorUnidade: 4, precoUnitario: 1450, unidade: 'un', fonte: 'belenus' },
    ]);
    expect(itens.rejeitados).toEqual(['GoodWe GW2000 (micro sem módulos por unidade)', 'tipo "banana" desconhecido']);
  });
  it('sem json → vazio', () => {
    expect(parseItensDoPrint('não achei nada', 'junior')).toEqual({ aceitos: [], rejeitados: [] });
  });
});

describe('montarPromptPrint', () => {
  it('pede só módulo/micro, preço à vista, e proíbe inventar', () => {
    const p = montarPromptPrint();
    expect(p).toMatch(/modulo|micro/);
    expect(p).toContain('NÃO invente');
    expect(p).toContain('modulos_por_unidade');
  });
});

describe('LeitorPrintTabela', () => {
  const mk = () => {
    const svc = { atualizar: vi.fn().mockResolvedValue(undefined) };
    const sendText = vi.fn().mockResolvedValue(undefined);
    const lerImagem = vi.fn().mockResolvedValue('```json\n[{"tipo":"modulo","marca":"JA","modelo":"625","potencia_w":625,"preco":980}]\n```');
    const leitor = new LeitorPrintTabela({ svc: svc as any, sendText, lerImagem, agoraMs: () => T0 });
    return { svc, sendText, lerImagem, leitor };
  };

  it('legenda sem "tabela" não consome', async () => {
    const { leitor } = mk();
    expect(await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'olha isso' })).toBe(false);
  });

  it('legenda "tabela belenus" → lê, propõe comandos e espera ok', async () => {
    const { leitor, sendText, lerImagem, svc } = mk();
    expect(await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela belenus' })).toBe(true);
    expect(lerImagem).toHaveBeenCalledWith('x', 'image/jpeg', expect.stringContaining('NÃO invente'));
    expect(sendText.mock.calls[0][1]).toContain('/tabela fonte belenus JA 625 = 980');
    expect(sendText.mock.calls[0][1]).toContain('ok tabela');
    expect(svc.atualizar).not.toHaveBeenCalled();
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(true);
    expect(svc.atualizar).toHaveBeenCalledTimes(1);
    expect(svc.atualizar.mock.calls[0][0]).toMatchObject({ marca: 'JA', fonte: 'belenus' });
    expect(sendText.mock.calls[1][1]).toContain('✅ 1 item');
  });

  it('"ok tabela" sem pendência não consome; pendência expira em 30 min', async () => {
    const { leitor } = mk();
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(false);
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    const tarde = new LeitorPrintTabela({ ...(leitor as any).d, agoraMs: () => T0 + 31 * 60_000 });
    (tarde as any).pendentes = (leitor as any).pendentes;
    expect(await tarde.tratarTexto('556199', 'ok tabela')).toBe(false);
  });

  it('print sem nada legível avisa e não cria pendência', async () => {
    const { leitor, sendText, lerImagem } = mk();
    lerImagem.mockResolvedValue('não consegui ler');
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    expect(sendText.mock.calls[0][1]).toContain('não achei preço');
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(false);
  });
});
