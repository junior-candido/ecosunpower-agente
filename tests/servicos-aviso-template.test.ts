// Aviso de serviço pro time — bug 05/08: fora da janela 24h a API oficial
// aceita o texto livre e DESCARTA em silêncio (verde na tela, nada no celular).
// Regra nova: com WABA ativa, o aviso vai por TEMPLATE aprovado (chega sempre);
// sem template disponível (Evolution) ou se o template falhar, cai pro texto.
import { describe, it, expect, vi } from 'vitest';
import { enviarAvisoServico, paramsTemplateAvisoServico, TEMPLATE_AVISO_SERVICO } from '../src/modules/dashboard/servicos-zap.js';
import type { ServicoRow } from '../src/modules/dashboard/servicos-store.js';

const servico = {
  id: 'srv-1', tipoId: 'instalacao-fv', tipoNome: 'Instalação FV',
  clienteNome: 'Fernanda Almeida', dataServico: '2026-08-08',
} as unknown as ServicoRow;

describe('paramsTemplateAvisoServico', () => {
  it('monta tipo, cliente, data BR e link na ordem do template', () => {
    expect(paramsTemplateAvisoServico(servico, 'https://x/dashboard/servicos/srv-1')).toEqual([
      'Instalação FV', 'Fernanda Almeida', '08/08/2026', 'https://x/dashboard/servicos/srv-1',
    ]);
  });
  it('sem link → instrução de abrir o dashboard (template não aceita variável vazia)', () => {
    const p = paramsTemplateAvisoServico(servico, null);
    expect(p[3].length).toBeGreaterThan(0);
  });
});

describe('enviarAvisoServico', () => {
  it('com WABA: envia o template aprovado (e NÃO o texto livre)', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
    await enviarAvisoServico({ sendText, sendTemplate }, '5561996688219', servico, 'https://x/s/1');
    expect(sendTemplate).toHaveBeenCalledOnce();
    expect(sendTemplate.mock.calls[0][0]).toBe('5561996688219');
    expect(sendTemplate.mock.calls[0][1]).toBe(TEMPLATE_AVISO_SERVICO);
    expect(sendTemplate.mock.calls[0][2]).toBe('pt_BR');
    expect(sendText).not.toHaveBeenCalled();
  });

  it('template falhou (ex.: ainda não aprovado) → cai pro texto livre', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockRejectedValue(new Error('132001 template does not exist'));
    await enviarAvisoServico({ sendText, sendTemplate }, '556199', servico, null);
    expect(sendText).toHaveBeenCalledOnce();
    expect(sendText.mock.calls[0][1]).toContain('Instalação FV');
  });

  it('sem WABA (Evolution): manda o texto direto', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    await enviarAvisoServico({ sendText }, '556199', servico, null);
    expect(sendText).toHaveBeenCalledOnce();
  });
});
