// Aviso de serviço pro time — bug 05/08: fora da janela 24h a API oficial
// aceita o texto livre e DESCARTA em silêncio (verde na tela, nada no celular).
// Regra: com WABA ativa, o aviso vai por TEMPLATE aprovado (chega sempre);
// sem template disponível (Evolution) ou se o template falhar, cai pro texto.
// O template tem botão de URL DINÂMICO ("Guia de fotos e vídeos") → o envio
// PRECISA passar o id do serviço como parâmetro do botão, senão a Meta recusa.
import { describe, it, expect, vi } from 'vitest';
import { enviarAvisoServico, paramsTemplateAvisoServico, TEMPLATE_AVISO_SERVICO } from '../src/modules/dashboard/servicos-zap.js';
import type { ServicoRow } from '../src/modules/dashboard/servicos-store.js';

const servico = {
  id: 'srv-1', tipoId: 'instalacao-fv', tipoNome: 'Instalação FV',
  clienteNome: 'Fernanda Almeida', dataServico: '2026-08-08',
} as unknown as ServicoRow;

describe('paramsTemplateAvisoServico', () => {
  it('monta tipo, cliente e data BR (o link vai no BOTÃO, não no corpo)', () => {
    expect(paramsTemplateAvisoServico(servico)).toEqual([
      'Instalação FV', 'Fernanda Almeida', '08/08/2026',
    ]);
  });
});

describe('enviarAvisoServico', () => {
  it('com WABA: envia o template com corpo + botão de URL com o id do serviço', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
    await enviarAvisoServico({ sendText, sendTemplate }, '5561996688219', servico, 'https://x/dashboard/servicos/srv-1');
    expect(sendTemplate).toHaveBeenCalledOnce();
    const [to, nome, lang, components] = sendTemplate.mock.calls[0];
    expect(to).toBe('5561996688219');
    expect(nome).toBe(TEMPLATE_AVISO_SERVICO);
    expect(lang).toBe('pt_BR');
    expect(components).toEqual([
      { type: 'body', parameters: [
        { type: 'text', text: 'Instalação FV' },
        { type: 'text', text: 'Fernanda Almeida' },
        { type: 'text', text: '08/08/2026' },
      ]},
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'srv-1' }] },
    ]);
    expect(sendText).not.toHaveBeenCalled();
  });

  it('template falhou (ex.: ainda não aprovado) → cai pro texto livre com o link', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockRejectedValue(new Error('132001 template does not exist'));
    await enviarAvisoServico({ sendText, sendTemplate }, '556199', servico, 'https://x/s/1');
    expect(sendText).toHaveBeenCalledOnce();
    expect(sendText.mock.calls[0][1]).toContain('Instalação FV');
    expect(sendText.mock.calls[0][1]).toContain('https://x/s/1');
  });

  it('sem WABA (Evolution): manda o texto direto', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    await enviarAvisoServico({ sendText }, '556199', servico, null);
    expect(sendText).toHaveBeenCalledOnce();
  });
});
