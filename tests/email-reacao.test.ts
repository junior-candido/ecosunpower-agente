import { describe, it, expect, vi } from 'vitest';
import { checarLeadQuente } from '../src/modules/email/email-reacao.js';

// Fake client: from('eventos_elo').select().eq().in() resolve pra { data }.
function makeClient(data: any[]) {
  const builder: any = {};
  const chain = ['select', 'eq', 'in'];
  for (const m of chain) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve: any) => Promise.resolve({ data, error: null }).then(resolve);
  return { from: vi.fn(() => builder) };
}

describe('checarLeadQuente', () => {
  it('dispara sendAdminWithButtons quando lead esta quente e lock foi adquirido', async () => {
    const client = makeClient([
      { tipo: 'email_aberto' },
      { tipo: 'email_aberto' },
      { tipo: 'email_aberto' },
    ]);
    const sendAdminWithButtons = vi.fn().mockResolvedValue(undefined);
    const acquireAlertLock = vi.fn().mockResolvedValue(true);
    const registrarEvento = vi.fn();

    await checarLeadQuente({
      client,
      leadId: 'lead-1',
      nome: 'Fulano',
      adminPhone: '5561999999999',
      sendAdminWithButtons,
      metaWaba: null,
      sendText: vi.fn(),
      acquireAlertLock,
      minAberturas: 3,
    });

    expect(sendAdminWithButtons).toHaveBeenCalledTimes(1);
    const [, to, text] = sendAdminWithButtons.mock.calls[0];
    expect(to).toBe('5561999999999');
    expect(text).toContain('Fulano');
  });

  it('nao dispara quando o lock ja foi adquirido antes (ja alertado)', async () => {
    const client = makeClient([
      { tipo: 'email_aberto' },
      { tipo: 'email_aberto' },
      { tipo: 'email_aberto' },
    ]);
    const sendAdminWithButtons = vi.fn().mockResolvedValue(undefined);
    const acquireAlertLock = vi.fn().mockResolvedValue(false);

    await checarLeadQuente({
      client,
      leadId: 'lead-2',
      nome: 'Fulano',
      adminPhone: '5561999999999',
      sendAdminWithButtons,
      metaWaba: null,
      sendText: vi.fn(),
      acquireAlertLock,
      minAberturas: 3,
    });

    expect(sendAdminWithButtons).not.toHaveBeenCalled();
  });

  it('nao dispara quando lead nao tem aberturas nem cliques', async () => {
    const client = makeClient([]);
    const sendAdminWithButtons = vi.fn().mockResolvedValue(undefined);
    const acquireAlertLock = vi.fn().mockResolvedValue(true);

    await checarLeadQuente({
      client,
      leadId: 'lead-3',
      nome: 'Fulano',
      adminPhone: '5561999999999',
      sendAdminWithButtons,
      metaWaba: null,
      sendText: vi.fn(),
      acquireAlertLock,
      minAberturas: 3,
    });

    expect(sendAdminWithButtons).not.toHaveBeenCalled();
    expect(acquireAlertLock).not.toHaveBeenCalled();
  });
});
