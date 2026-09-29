// tests/gd-relatorio-modelo-v2.test.ts
// 29/09/2026 — a Meta classificou "relatorio_usina_v1" como MARKETING (mais caro
// e respeita descadastro). "relatorio_usina_v2" é a versão de UTILIDADE: aviso
// de conta sobre a usina do próprio cliente, sem emoji e sem tom de venda.
// O código aceita os dois; o padrão CONTINUA v1 até o Junior trocar a chave
// 'relatorio_usina_modelo' em app_flags (sem deploy).
import { describe, it, expect, vi } from 'vitest';
import {
  TEMPLATE_RELATORIO, TEMPLATE_RELATORIO_V2, CHAVE_MODELO_RELATORIO, escolherModeloRelatorio,
  textoTemplateRelatorio, textoLivreRelatorio, componentesTemplateRelatorio,
} from '../src/modules/gd/relatorio-envio-textos.js';
import { enviarRelatorioZap, modeloRelatorioAtual, type MensagemRelatorio } from '../src/modules/gd/relatorio-envio.js';

const msg: MensagemRelatorio = {
  nome: 'João', mesExtenso: 'agosto de 2026', token: 'T'.repeat(32), link: 'https://p.x/rg/TTT',
  pdf: Buffer.from('%PDF'), nomeArquivo: 'relatorio-351534-2026-08.pdf',
};
const fone = { fone: '5561991718505', motivo: null };

describe('escolha do modelo', () => {
  it('nomes e chave', () => {
    expect(TEMPLATE_RELATORIO).toBe('relatorio_usina_v1');
    expect(TEMPLATE_RELATORIO_V2).toBe('relatorio_usina_v2');
    expect(CHAVE_MODELO_RELATORIO).toBe('relatorio_usina_modelo');
  });
  it('padrão é v1 (nada configurado, vazio ou valor desconhecido)', () => {
    expect(escolherModeloRelatorio(null, undefined)).toBe('relatorio_usina_v1');
    expect(escolherModeloRelatorio('  ', '')).toBe('relatorio_usina_v1');
    expect(escolherModeloRelatorio('relatorio_usina_v9', undefined)).toBe('relatorio_usina_v1');
  });
  it('banco manda; sem banco vale a variável de ambiente', () => {
    expect(escolherModeloRelatorio(' relatorio_usina_v2 ', undefined)).toBe('relatorio_usina_v2');
    expect(escolherModeloRelatorio(null, 'relatorio_usina_v2')).toBe('relatorio_usina_v2');
    expect(escolherModeloRelatorio('relatorio_usina_v1', 'relatorio_usina_v2')).toBe('relatorio_usina_v1');
  });
  it('modeloRelatorioAtual: banco com erro → segue a variável/padrão, nunca quebra o envio', async () => {
    expect(await modeloRelatorioAtual(async () => 'relatorio_usina_v2')).toBe('relatorio_usina_v2');
    expect(await modeloRelatorioAtual(async () => { throw new Error('rede'); })).toBe('relatorio_usina_v1');
  });
});

describe('texto do v2 (Utilidade)', () => {
  const t = textoTemplateRelatorio('João', 'agosto de 2026', 'relatorio_usina_v2');
  it('é exatamente o corpo cadastrado na Meta', () => {
    expect(t).toBe(
      'Olá, João. O relatório da sua usina solar referente a agosto de 2026 está disponível. ' +
      'Ele mostra a energia gerada, a energia compensada na sua conta de luz e o saldo de créditos. ' +
      'Para consultar, toque no botão abaixo.');
  });
  it('sem emoji, sem "economizou"/oferta/compra (o que puxa pra Marketing)', () => {
    expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(t).not.toMatch(/economiz|promo|oferta|desconto|compre|aproveite|condi[çc][ãa]o/i);
  });
  it('serve pro relatório do período também', () => {
    expect(textoTemplateRelatorio('João', 'maio a agosto de 2026', 'relatorio_usina_v2'))
      .toContain('referente a maio a agosto de 2026');
  });
  it('v1 não mudou uma letra', () => {
    expect(textoTemplateRelatorio('João', 'agosto de 2026')).toBe(
      'Olá, João! ☀️ O relatório de agosto de 2026 da sua usina solar está pronto: quanto ela gerou, quanto você economizou e seus créditos.');
    expect(textoTemplateRelatorio('João', 'agosto de 2026', 'relatorio_usina_v1'))
      .toBe(textoTemplateRelatorio('João', 'agosto de 2026'));
  });
  it('mensagem comum do v2 = corpo do v2 (sem a frase do botão, que ali não existe) + link', () => {
    expect(textoLivreRelatorio('João', 'agosto de 2026', 'https://l', 'relatorio_usina_v2'))
      .toBe(`${t.replace(' Para consultar, toque no botão abaixo.', '')}\n\nVer relatório: https://l`);
  });
  it('mesmas variáveis: {{1}} nome, {{2}} mês e o token no botão', () => {
    expect(componentesTemplateRelatorio('João', 'agosto de 2026', 'X')).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'João' }, { type: 'text', text: 'agosto de 2026' }] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'X' }] },
    ]);
  });
});

describe('enviarRelatorioZap com o modelo escolhido', () => {
  it('sem modelo informado → v1 (como sempre)', async () => {
    const sendTemplate = vi.fn().mockResolvedValue({});
    await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText: vi.fn(), sendTemplate });
    expect(sendTemplate.mock.calls[0][1]).toBe('relatorio_usina_v1');
  });
  it('modelo v2 → manda o v2 e registra o texto do v2 na conversa', async () => {
    const sendTemplate = vi.fn().mockResolvedValue({});
    const r = await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText: vi.fn(), sendTemplate, modelo: 'relatorio_usina_v2' });
    expect(sendTemplate.mock.calls[0][1]).toBe('relatorio_usina_v2');
    expect(r.textoEnviado).toBe(textoTemplateRelatorio('João', 'agosto de 2026', 'relatorio_usina_v2'));
  });
  it('v2 recusado → mensagem comum do v2 e o aviso cita o v2', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const r = await enviarRelatorioZap(fone, msg, {
      canal: 'casa', sendText, sendTemplate: vi.fn().mockRejectedValue(new Error('132001')), modelo: 'relatorio_usina_v2',
    });
    expect(sendText.mock.calls[0][1]).toContain('referente a agosto de 2026 está disponível');
    expect(sendText.mock.calls[0][1]).toContain('Ver relatório: https://p.x/rg/TTT');
    expect(r.aviso).toContain('relatorio_usina_v2');
  });
});
