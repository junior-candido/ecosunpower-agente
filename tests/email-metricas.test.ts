import { describe, it, expect } from 'vitest';
import { resumirMetricas } from '../src/modules/dashboard/email-views.js';
import { desempenhoPorStep } from '../src/modules/dashboard/email-metricas.js';

describe('resumirMetricas', () => {
  it('conta enviados/abertos/clicados/quentes', () => {
    const r = resumirMetricas([
      { tipo: 'email_enviado' }, { tipo: 'email_enviado' },
      { tipo: 'email_aberto' }, { tipo: 'email_clicado' }, { tipo: 'lead_quente_email' },
    ]);
    expect(r.enviados).toBe(2);
    expect(r.abertos).toBe(1);
    expect(r.clicados).toBe(1);
    expect(r.quentes).toBe(1);
  });

  it('conta descadastros e retorna zero pra tipos ausentes', () => {
    const r = resumirMetricas([
      { tipo: 'email_enviado' }, { tipo: 'email_descadastro' }, { tipo: 'email_descadastro' },
    ]);
    expect(r.enviados).toBe(1);
    expect(r.descadastros).toBe(2);
    expect(r.abertos).toBe(0);
    expect(r.clicados).toBe(0);
    expect(r.quentes).toBe(0);
  });

  it('lista vazia retorna todos zero', () => {
    const r = resumirMetricas([]);
    expect(r).toEqual({ enviados: 0, abertos: 0, clicados: 0, quentes: 0, descadastros: 0 });
  });
});

// Fake client no mesmo estilo do email-reacao.ts: .from().select()... resolve
// num objeto { data }. O helper só usa .in/.order/.limit encadeados antes do
// fim da chain, então cada método (exceto o último) devolve `this`.
function fakeClient(data: Array<{ tipo: string; payload?: any }>) {
  const chain: any = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    limit: async () => ({ data }),
  };
  return { from: () => chain };
}

describe('desempenhoPorStep', () => {
  it('agrupa enviados/abertos/clicados por step usando provider_message_id', async () => {
    const eventos = [
      { tipo: 'email_enviado', payload: { step: 1, provider_message_id: 'mid-a', subject: 'Oi' } },
      { tipo: 'email_enviado', payload: { step: 1, provider_message_id: 'mid-b', subject: 'Oi 2' } },
      { tipo: 'email_aberto', payload: { provider_message_id: 'mid-a' } },
      { tipo: 'email_clicado', payload: { provider_message_id: 'mid-a' } },
      { tipo: 'email_enviado', payload: { step: 2, provider_message_id: 'mid-c', subject: 'Passo 2' } },
    ];
    const r = await desempenhoPorStep(fakeClient(eventos));

    const step1 = r.find((s) => s.step === 1)!;
    expect(step1.enviados).toBe(2);
    expect(step1.abertos).toBe(1);
    expect(step1.clicados).toBe(1);
    expect(step1.taxaAbertura).toBe(50);
    expect(step1.taxaClique).toBe(50);

    const step2 = r.find((s) => s.step === 2)!;
    expect(step2.enviados).toBe(1);
    expect(step2.abertos).toBe(0);
    expect(step2.taxaAbertura).toBe(0);
  });

  it('usa o tema de STEPS_JORNADA como nome do e-mail', async () => {
    const eventos = [
      { tipo: 'email_enviado', payload: { step: 1, provider_message_id: 'mid-a' } },
    ];
    const r = await desempenhoPorStep(fakeClient(eventos));
    expect(r[0].nome).toMatch(/Boas-vindas/i);
  });

  it('cai no fallback "Step N" quando o step nao existe em STEPS_JORNADA', async () => {
    const eventos = [
      { tipo: 'email_enviado', payload: { step: 99, provider_message_id: 'mid-x' } },
    ];
    const r = await desempenhoPorStep(fakeClient(eventos));
    expect(r[0].nome).toBe('Step 99');
  });

  it('tolera eventos com payload ausente ou sem provider_message_id, sem lancar', async () => {
    const eventos = [
      { tipo: 'email_enviado', payload: { step: 1, provider_message_id: 'mid-a' } },
      { tipo: 'email_enviado' } as any,                 // sem payload
      { tipo: 'email_aberto', payload: {} },             // sem mid
      { tipo: 'email_clicado' } as any,                  // sem payload
      { tipo: 'email_aberto', payload: { provider_message_id: 'mid-desconhecido' } }, // mid sem step conhecido
    ];
    const r = await desempenhoPorStep(fakeClient(eventos));
    const step1 = r.find((s) => s.step === 1)!;
    expect(step1.enviados).toBe(1);
    expect(step1.abertos).toBe(0);
  });

  it('lista vazia quando nao ha eventos', async () => {
    const r = await desempenhoPorStep(fakeClient([]));
    expect(r).toEqual([]);
  });
});
