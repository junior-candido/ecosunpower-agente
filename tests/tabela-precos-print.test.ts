// tests/tabela-precos-print.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseItensDoPrint, montarPromptPrint, LeitorPrintTabela, MAX_ITENS_PRINT } from '../src/modules/vendas/tabela-precos-print.js';

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
    expect(itens.cortados).toBe(0);
  });
  it('sem json → vazio', () => {
    expect(parseItensDoPrint('não achei nada', 'junior')).toEqual({ aceitos: [], rejeitados: [], cortados: 0 });
  });
  it('aceita cerca sem "json" e array cru (sem cerca nenhuma)', () => {
    const arr = '[{"tipo":"modulo","marca":"JA","modelo":"625","potencia_w":625,"preco":980}]';
    expect(parseItensDoPrint('```\n' + arr + '\n```', 'junior').aceitos).toHaveLength(1);
    expect(parseItensDoPrint(arr, 'junior').aceitos).toHaveLength(1);
    expect(parseItensDoPrint('Claro! Aqui vai:\n' + arr + '\nAbraço', 'junior').aceitos).toHaveLength(1);
  });
  it('limpa marca/modelo: quebra de linha e comando injetado não passam', () => {
    const raw = JSON.stringify([{ tipo: 'modulo', marca: 'JA\n/tabela cabos = 1', modelo: '625', potencia_w: 625, preco: 980 }]);
    const { aceitos } = parseItensDoPrint(raw, 'junior');
    expect(aceitos).toHaveLength(1);
    expect(aceitos[0].marca).not.toContain('\n');
    expect(aceitos[0].marca).not.toContain('=');
    expect(aceitos[0].marca.length).toBeLessThanOrEqual(40);
  });
  it('marca/modelo que somem depois da limpeza são rejeitados', () => {
    const raw = JSON.stringify([{ tipo: 'modulo', marca: '<<<>>>', modelo: '625', potencia_w: 625, preco: 980 }]);
    expect(parseItensDoPrint(raw, 'junior').aceitos).toEqual([]);
  });
  it('preço fora de 1..200000 é rejeitado', () => {
    const raw = JSON.stringify([
      { tipo: 'modulo', marca: 'A', modelo: '625', potencia_w: 625, preco: 0.5 },
      { tipo: 'modulo', marca: 'B', modelo: '625', potencia_w: 625, preco: 200001 },
      { tipo: 'modulo', marca: 'C', modelo: '625', potencia_w: 625, preco: 980 },
    ]);
    const { aceitos, rejeitados } = parseItensDoPrint(raw, 'junior');
    expect(aceitos.map(i => i.marca)).toEqual(['C']);
    expect(rejeitados).toHaveLength(2);
  });
  it('corta em 30 itens (print gigante não vira spam)', () => {
    const arr = Array.from({ length: 200 }, (_, k) => ({ tipo: 'modulo', marca: `M${k}`, modelo: '625', potencia_w: 625, preco: 980 }));
    const r = parseItensDoPrint(JSON.stringify(arr), 'junior');
    expect(MAX_ITENS_PRINT).toBe(30);
    expect(r.aceitos).toHaveLength(30);
    expect(r.cortados).toBe(170);
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
  const mk = (over: Partial<{ admin: boolean; pendenciaMs: number }> = {}) => {
    let agora = T0;
    const svc = { atualizar: vi.fn().mockResolvedValue({ ok: true }) };
    const sendText = vi.fn().mockResolvedValue(undefined);
    const lerImagem = vi.fn().mockResolvedValue('```json\n[{"tipo":"modulo","marca":"JA","modelo":"625","potencia_w":625,"preco":980}]\n```');
    const leitor = new LeitorPrintTabela({
      svc: svc as any, sendText, lerImagem,
      isAdminPhone: () => over.admin ?? true,
      agoraMs: () => agora,
      ...(over.pendenciaMs !== undefined ? { pendenciaMs: over.pendenciaMs } : {}),
    });
    return { svc, sendText, lerImagem, leitor, avancar: (ms: number) => { agora += ms; } };
  };

  it('quem não é o Junior não mexe na tabela nem gasta vision', async () => {
    const { leitor, lerImagem, sendText } = mk({ admin: false });
    expect(await leitor.tratarImagem('556100', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela belenus' })).toBe(false);
    expect(await leitor.tratarTexto('556100', 'ok tabela')).toBe(false);
    expect(lerImagem).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

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
    expect(sendText.mock.calls[1][1]).toContain('✅ 1 item gravado');
  });

  it('o comando proposto volta redondo pro parser (preço sem ponto de milhar)', async () => {
    const { leitor, sendText, lerImagem } = mk();
    lerImagem.mockResolvedValue('```json\n[{"tipo":"modulo","marca":"Risen","modelo":"715","potencia_w":715,"preco":1050},{"tipo":"micro","marca":"Hoymiles","modelo":"HMS-2000-4T","modulos_por_unidade":4,"preco":1450.5}]\n```');
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    expect(sendText.mock.calls[0][1]).toContain('/tabela Risen 715 = 1050');
    expect(sendText.mock.calls[0][1]).toContain('/tabela micro Hoymiles HMS-2000-4T 4 = 1450,5');
    expect(sendText.mock.calls[0][1]).not.toContain('1.050');
  });

  it('"ok tabela" sem pendência não consome; pendência expirada avisa e pede a foto de novo', async () => {
    const { leitor, sendText, svc, avancar } = mk({ pendenciaMs: 30 * 60_000 });
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(false);
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    avancar(31 * 60_000);
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(true);
    expect(svc.atualizar).not.toHaveBeenCalled();
    expect(sendText.mock.calls[1][1]).toContain('expirou');
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(false);
  });

  it('pendência ainda viva dentro da janela grava', async () => {
    const { leitor, svc, avancar } = mk({ pendenciaMs: 30 * 60_000 });
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    avancar(29 * 60_000);
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(true);
    expect(svc.atualizar).toHaveBeenCalledTimes(1);
  });

  it('print sem nada legível avisa e não cria pendência', async () => {
    const { leitor, sendText, lerImagem } = mk();
    lerImagem.mockResolvedValue('não consegui ler');
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    expect(sendText.mock.calls[0][1]).toContain('não achei preço');
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(false);
  });

  it('vision quebrada é avisada como falha de leitura, não como "não achei preço"', async () => {
    const { leitor, sendText, lerImagem } = mk();
    lerImagem.mockRejectedValue(new Error('timeout'));
    expect(await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' })).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('leitura da imagem falhou');
    expect(sendText.mock.calls[0][1]).not.toContain('não achei preço');
  });

  it('print gigante avisa que mostrou só os 30 primeiros', async () => {
    const { leitor, sendText, lerImagem } = mk();
    const arr = Array.from({ length: 40 }, (_, k) => ({ tipo: 'modulo', marca: `M${k}`, modelo: '625', potencia_w: 625, preco: 980 }));
    lerImagem.mockResolvedValue('```json\n' + JSON.stringify(arr) + '\n```');
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    expect(sendText.mock.calls[0][1]).toContain('mostrei só os 30 primeiros');
  });

  it('conta gravação de verdade: o que o banco recusou entra como falha', async () => {
    const { leitor, sendText, svc, lerImagem } = mk();
    lerImagem.mockResolvedValue('```json\n[{"tipo":"modulo","marca":"JA","modelo":"625","potencia_w":625,"preco":980},{"tipo":"modulo","marca":"Risen","modelo":"715","potencia_w":715,"preco":1050}]\n```');
    svc.atualizar.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, erro: 'boom' });
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    await leitor.tratarTexto('556199', 'ok tabela');
    const msg = sendText.mock.calls[1][1];
    expect(msg).toContain('✅ 1 item gravado');
    expect(msg).toContain('⚠️ 1 falhou');
    expect(msg).toContain('Risen 715');
  });

  it('nenhum gravado não responde ✅', async () => {
    const { leitor, sendText, svc } = mk();
    svc.atualizar.mockResolvedValue({ ok: false, erro: 'boom' });
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    await leitor.tratarTexto('556199', 'ok tabela');
    expect(sendText.mock.calls[1][1]).not.toContain('✅');
    expect(sendText.mock.calls[1][1]).toContain('⚠️');
  });

  it('nunca lança: explosão no meio vira aviso', async () => {
    const { leitor, sendText, svc } = mk();
    svc.atualizar.mockRejectedValue(new Error('pau'));
    await leitor.tratarImagem('556199', { base64: 'x', mimeType: 'image/jpeg', legenda: 'tabela' });
    expect(await leitor.tratarTexto('556199', 'ok tabela')).toBe(true);
    expect(sendText.mock.calls[1][1]).toContain('deu erro');
  });
});
