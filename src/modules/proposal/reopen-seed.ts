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

export interface CloneSeedInput {
  numeroPropostaBase: string;
  clienteNomeBase: string;
  modoEnvio: string;
  tipo: string;
  dadosInput: Record<string, unknown>;
}

// Seed pra CLONAR uma proposta pra um NOVO cliente: mantém o kit/sistema/valores
// da base, mas LIMPA os campos de identidade do cliente (vêm do novo). Gera uma
// proposta NOVA (sem reopenedSlug). Parte pura, testável.
export function construirSeedClone(opts: CloneSeedInput): ReopenSeed {
  const { investimento: _omit, ...base } = opts.dadosInput;
  // Zera só a IDENTIDADE do cliente — o resto (sistema/equipamento/valores) é da base.
  const data: Record<string, unknown> = {
    ...base,
    nomeCliente: '',
    telefoneCliente: '',
    documentoCliente: '',
    enderecoCliente: '',
    emailCliente: '',
  };

  const intro = [
    `📋 Clonando a proposta *${opts.numeroPropostaBase}* (base: ${opts.clienteNomeBase}).`,
    'Me passa só o *novo cliente* — eu mantenho o kit/equipamento/valor igual:',
    '• Nome • Telefone (se for enviar) • Consumo (se mudar) • Valor (se mudar)',
    'Quando terminar, manda *gerar* — vai sair uma proposta NOVA (link novo).',
  ].join('\n');

  const seededUser =
    `Clonar a proposta ${opts.numeroPropostaBase} (cliente base: ${opts.clienteNomeBase}) pra um NOVO cliente. ` +
    `Use os MESMOS dados de sistema/equipamento/valores abaixo, apenas TROQUE a identidade do cliente ` +
    `(nomeCliente, telefoneCliente, documentoCliente, enderecoCliente, emailCliente) pelos dados novos que eu mandar. ` +
    `Ajuste consumo/valor só se eu pedir explicitamente. É uma proposta NOVA (NÃO é reabertura). ` +
    `Quando eu mandar "gerar"/"ok"/"manda", use action "confirm_generate" com o data completo.\n` +
    `DADOS BASE: ${JSON.stringify(data)}`;

  const seededAssistant = JSON.stringify({
    action: 'ask_more',
    modoEnvio: opts.modoEnvio,
    tipo: opts.tipo,
    message: intro,
    missing: ['nomeCliente'],
    data,
  });

  return { data, intro, seededUser, seededAssistant };
}
