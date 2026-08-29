import { describe, it, expect, vi } from 'vitest';
import { sendAdminWithButtons } from '../src/modules/eva-admin-buttons.js';

const botoes = [{ id: 'finfav:mo:1', title: 'Mão de obra' }, { id: 'finfav:mat:1', title: 'Material' }];

describe('sendAdminWithButtons', () => {
  it('sem WABA: manda texto com as opções numeradas e o id pra responder', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    await sendAdminWithButtons({ metaWaba: null, sendText }, '5561', 'Isso é:', botoes, 'rodapé');
    expect(sendText).toHaveBeenCalledWith('5561', 'Isso é:\n\n1) Mão de obra → responda: finfav:mo:1\n2) Material → responda: finfav:mat:1');
  });
  it('sem WABA e sem botões: só o corpo', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    await sendAdminWithButtons({ metaWaba: null, sendText }, '5561', 'Oi', []);
    expect(sendText).toHaveBeenCalledWith('5561', 'Oi');
  });
  it('com WABA: usa botões interativos e não manda texto', async () => {
    const sendText = vi.fn();
    const sendInteractiveButtons = vi.fn().mockResolvedValue({ messageId: 'm1' });
    await sendAdminWithButtons({ metaWaba: { sendInteractiveButtons }, sendText }, '5561', 'Isso é:', botoes, 'rodapé');
    expect(sendInteractiveButtons).toHaveBeenCalledWith('5561', 'Isso é:', botoes, 'rodapé');
    expect(sendText).not.toHaveBeenCalled();
  });
});
