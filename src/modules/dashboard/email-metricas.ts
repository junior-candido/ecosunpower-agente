// src/modules/dashboard/email-metricas.ts
// Desempenho por e-mail da jornada (aba E-mail Marketing): quantos foram
// enviados, abertos e clicados, por step. Tudo isso já fica gravado em
// eventos_elo — o evento `email_enviado` carrega step + assunto +
// provider_message_id no payload, e o webhook do Resend grava
// `email_aberto`/`email_clicado` com o mesmo provider_message_id (é assim
// que ele correlaciona qual e-mail foi aberto/clicado). Esta função só
// agrupa o que já existe — nada novo pra gravar, é a VIEW que faltava.

import { STEPS_JORNADA } from '../email/templates.js';

export type DesempenhoStep = {
  step: number;
  nome: string;
  enviados: number;
  abertos: number;
  clicados: number;
  taxaAbertura: number; // 0-100, arredondado
  taxaClique: number;   // 0-100, arredondado
};

const LIMITE_EVENTOS = 5000;

export async function desempenhoPorStep(client: any): Promise<DesempenhoStep[]> {
  const { data } = await client
    .from('eventos_elo')
    .select('tipo,payload')
    .in('tipo', ['email_enviado', 'email_aberto', 'email_clicado'])
    .order('created_at', { ascending: false })
    .limit(LIMITE_EVENTOS);

  const eventos = (data ?? []) as Array<{ tipo: string; payload?: Record<string, unknown> | null }>;

  // provider_message_id -> step, a partir dos eventos de envio (só eles tem o step).
  const stepPorMid = new Map<string, number>();
  for (const ev of eventos) {
    if (ev.tipo !== 'email_enviado') continue;
    const mid = ev.payload?.provider_message_id;
    const step = ev.payload?.step;
    if (typeof mid === 'string' && mid && typeof step === 'number' && Number.isFinite(step)) {
      stepPorMid.set(mid, step);
    }
  }

  const contagem = new Map<number, { enviados: number; abertos: number; clicados: number }>();
  const pega = (step: number) => {
    let c = contagem.get(step);
    if (!c) { c = { enviados: 0, abertos: 0, clicados: 0 }; contagem.set(step, c); }
    return c;
  };

  for (const ev of eventos) {
    if (ev.tipo === 'email_enviado') {
      const step = ev.payload?.step;
      if (typeof step !== 'number' || !Number.isFinite(step)) continue;
      pega(step).enviados++;
      continue;
    }
    const mid = ev.payload?.provider_message_id;
    if (typeof mid !== 'string' || !mid) continue;
    const step = stepPorMid.get(mid);
    if (step == null) continue;
    if (ev.tipo === 'email_aberto') pega(step).abertos++;
    else if (ev.tipo === 'email_clicado') pega(step).clicados++;
  }

  const steps = [...contagem.keys()].sort((a, b) => a - b);
  return steps.map((step) => {
    const c = contagem.get(step)!;
    const nome = STEPS_JORNADA.find((s) => s.step === step)?.tema ?? `Step ${step}`;
    return {
      step,
      nome,
      enviados: c.enviados,
      abertos: c.abertos,
      clicados: c.clicados,
      taxaAbertura: c.enviados ? Math.round((c.abertos / c.enviados) * 100) : 0,
      taxaClique: c.enviados ? Math.round((c.clicados / c.enviados) * 100) : 0,
    };
  });
}
