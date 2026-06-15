// src/modules/proposal/reopen-seed.ts
// Monta o "seed" da sessão de reabrir proposta pelo zap: o `data` no shape do Claude
// (dados_input sem o bloco investimento derivado) + os 2 turnos de histórico que dão
// contexto pro Claude aplicar só o delta. Parte pura (sem Redis), pra ser testável.

export interface ReopenSeedInput {
  numeroProposta: string;
  clienteNome: string;
  modoEnvio: string;
  tipo: string;
  dadosInput: Record<string, unknown>;
}

export interface ReopenSeed {
  data: Record<string, unknown>;
  intro: string;
  seededUser: string;
  seededAssistant: string;
}

export function construirSeedReopen(opts: ReopenSeedInput): ReopenSeed {
  // dados_input = `data` original + bloco investimento derivado. Tira o investimento
  // pra devolver o shape exato que o Claude usa.
  const { investimento: _omit, ...data } = opts.dadosInput;

  const intro = [
    `🔁 Reabri a proposta *${opts.numeroProposta}* do *${opts.clienteNome}*.`,
    'Tô com todos os dados. Me diz *o que mudar* (ex: "valor pra 35 mil", "troca o inversor pra X", "consumo 900 kWh").',
    'Eu te mostro como ficou e você confirma com *gerar* — aí atualizo no MESMO link do cliente.',
  ].join('\n');

  const seededUser =
    `Reabrir a proposta ${opts.numeroProposta} do cliente ${opts.clienteNome} pra ajustar. ` +
    `Já tenho TODOS os dados (abaixo). Vou te dizer só o que mudar — aplique a mudança mantendo o ` +
    `resto igual e me mostre o resumo (action ready_to_generate). Quando eu confirmar com "gerar"/"ok"/"manda", ` +
    `use action "confirm_generate" com o data completo atualizado.\n` +
    `DADOS ATUAIS: ${JSON.stringify(data)}`;

  const seededAssistant = JSON.stringify({
    action: 'ask_more',
    modoEnvio: opts.modoEnvio,
    tipo: opts.tipo,
    message: intro,
    missing: [],
    data,
  });

  return { data, intro, seededUser, seededAssistant };
}
