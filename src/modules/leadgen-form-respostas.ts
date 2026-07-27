// Fase 3 do funil conversacional (spec docs/superpowers/specs/2026-07-27):
// as respostas do form Meta (faixa da conta, tipo de imovel) deixam de morrer
// no extraFields e passam a viver em leads.energy_data — mesma convencao da
// importacao de junho (conta_faixa / tipo_imovel / fonte: 'meta_form') — e a
// Eva ganha o modo continuacao: confirma o que o form ja respondeu e aprofunda,
// em vez de re-perguntar (a promessa do form e "seu estudo ja comecou").

export interface RespostasForm {
  contaFaixa: string | null;
  tipoImovel: string | null;
}

// Acha as respostas por FRAGMENTO do slug do campo (o nome exato varia a cada
// edicao do form: acento, interrogacao, ordem). Mesma tecnica do aviso no zap.
// extraFields ja chega em lowercase (normalize() baixa as chaves).
export function extrairRespostasForm(extraFields: Record<string, string>): RespostasForm {
  const acha = (frags: string[]): string | null => {
    for (const [chave, valor] of Object.entries(extraFields)) {
      if (valor && frags.some((f) => chave.includes(f))) return valor;
    }
    return null;
  };
  return {
    contaFaixa: acha(['valor', 'conta', 'fatura']),
    tipoImovel: acha(['imóv', 'imov']),
  };
}

// Merge no energy_data existente: chaves do form sobrescrevem (dado mais novo),
// o resto e preservado (monthly_bill exato de conversa anterior vale mais que
// faixa — nunca apagar). Retorna null quando o form nao trouxe nada = nao mexe.
export function mesclarEnergyData(
  existente: Record<string, unknown> | null | undefined,
  respostas: RespostasForm,
): Record<string, unknown> | null {
  if (!respostas.contaFaixa && !respostas.tipoImovel) return null;
  return {
    ...(existente ?? {}),
    ...(respostas.contaFaixa ? { conta_faixa: respostas.contaFaixa } : {}),
    ...(respostas.tipoImovel ? { tipo_imovel: respostas.tipoImovel } : {}),
    fonte: 'meta_form',
  };
}

// Bloco de prompt do MODO CONTINUACAO — entra no leadContext quando o lead tem
// resposta do form. Regras que o Junior definiu: confirmar e aprofundar (opcao
// a), pedir foto da conta (gatilho do estagio CAPI lead_respondeu), e com
// valor parcial (faixa) NUNCA cravar preco.
export function blocoContinuacaoForm(
  energyData: Record<string, unknown> | null | undefined,
): string | null {
  const ed = energyData ?? {};
  const faixa = typeof ed.conta_faixa === 'string' ? ed.conta_faixa : null;
  const tipo = typeof ed.tipo_imovel === 'string' ? ed.tipo_imovel : null;
  if (!faixa && !tipo) return null;
  // Dado completo ja coletado na conversa? Modo continuacao se desliga —
  // senao a Eva ficaria pedindo foto da conta que ja recebeu.
  if (ed.monthly_bill || ed.consumption_kwh) return null;

  const linhas = [
    '',
    '### MODO CONTINUACAO — este lead veio do FORMULARIO do anuncio e JA respondeu:',
  ];
  if (faixa) linhas.push(`- Faixa da conta de luz: ${faixa}`);
  if (tipo) linhas.push(`- Imóvel: ${tipo}`);
  linhas.push(
    'O formulario prometeu que o estudo dele JA COMECOU. Entao:',
    '- NAO pergunte de novo o que esta acima. Na primeira resposta, CONFIRME que ja tem esses dados ("vi aqui no seu cadastro que...") — e a prova de que o estudo esta andando.',
    '- Aprofunde pedindo o que falta pro dimensionamento: peca uma foto da conta de luz (de preferencia) ou o valor exato, o que for mais facil pra pessoa.',
    '- A faixa e um valor PARCIAL: NUNCA crave preco, estimativa fechada ou valor de proposta com base so nela. Dimensionamento e proposta vem depois, com o dado completo.',
  );
  return linhas.join('\n');
}
