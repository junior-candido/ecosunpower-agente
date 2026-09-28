// src/modules/dashboard/respostas-prontas.ts
// Respostas prontas da tela de Conversas (Atendimento Parte 2c, 28/09/2026).
//
// Pedido do Junior: boas-vindas, pedir conta de luz, enviar proposta, agendar
// visita e financiamento — o texto entra no campo de resposta e PODE SER
// EDITADO antes de enviar. No número oficial da Eva com a janela de 24 h
// fechada não existe texto livre: cada resposta vira o MODELO aprovado mais
// próximo (lista abaixo). Os modelos próprios de cada resposta ainda não
// existem na Meta — até lá, "retomar a conversa" (reativacao_lead_v1) serve de
// ponte e a proposta usa o eva_proposta_aberta_v1.
//
// Regra da casa: nada de preço, prazo ou taxa em texto pronto (a Eva nunca
// crava preço — quem fala número é o Junior, olhando o caso).

export type IdResposta = 'boas_vindas' | 'pedir_conta' | 'enviar_proposta' | 'agendar_visita' | 'financiamento';

export interface RespostaModelo {
  id: IdResposta;
  rotulo: string;
  /** {nome} = 1º nome do cliente · {eu} = 1º nome de quem escreve · {empresa}. */
  texto: string;
  /** Modelos aprovados em ordem de preferência (fora da janela). */
  modelos: string[];
}

export const RESPOSTAS_PRONTAS: ReadonlyArray<RespostaModelo> = Object.freeze([
  {
    id: 'boas_vindas', rotulo: 'Boas-vindas',
    texto: 'Oi, {nome}! Aqui é {eu}, da {empresa}. Obrigado pelo contato! Me conta: o que você quer resolver na sua conta de luz?',
    modelos: ['_eva_qualificacao_v1', 'reativacao_lead_v1'],
  },
  {
    id: 'pedir_conta', rotulo: 'Pedir conta de luz',
    texto: '{nome}, para eu calcular o sistema certinho pra você, me manda uma foto da sua última conta de luz? Precisa aparecer o histórico de consumo dos últimos meses. 📸',
    modelos: ['reativacao_lead_v1'],
  },
  {
    id: 'enviar_proposta', rotulo: 'Enviar proposta',
    texto: '{nome}, a sua proposta de energia solar está pronta! Posso te mandar por aqui e te explicar os números?',
    modelos: ['eva_proposta_aberta_v1', 'reativacao_lead_v1'],
  },
  {
    id: 'agendar_visita', rotulo: 'Agendar visita',
    texto: '{nome}, vamos agendar a visita técnica? Qual dia e horário ficam melhores pra você? Na visita eu olho o telhado e o quadro de energia.',
    modelos: ['reativacao_lead_v1'],
  },
  {
    id: 'financiamento', rotulo: 'Financiamento',
    texto: '{nome}, temos opções de financiamento para o sistema solar, e em muitos casos a parcela fica parecida com a conta de luz de hoje. Quer que eu faça uma simulação pra você?',
    modelos: ['reativacao_lead_v1'],
  },
]);

export interface RespostaTela {
  id: IdResposta;
  rotulo: string;
  texto: string;
  /** Modelo aprovado que substitui a resposta fora da janela (null = nenhum). */
  modelo: string | null;
}

const primeiro = (s: string | null | undefined) => String(s ?? '').trim().split(/\s+/)[0] ?? '';

/** Textos prontos com os nomes preenchidos e o modelo de cada um. PURA. */
export function respostasProntas(p: { nomeCliente: string | null | undefined; eu: string | null | undefined; empresa: string; modelosAprovados: readonly string[] }): RespostaTela[] {
  const nome = primeiro(p.nomeCliente);
  const eu = primeiro(p.eu) || 'a equipe';
  return RESPOSTAS_PRONTAS.map((r) => {
    let t = r.texto.replace(/\{eu\}/g, eu).replace(/\{empresa\}/g, p.empresa || 'nossa empresa');
    if (nome) t = t.replace(/\{nome\}/g, nome);
    else t = t.replace(/^Oi, \{nome\}!/, 'Oi!').replace(/^\{nome\}, (.)/, (_, c: string) => c.toUpperCase()).replace(/\{nome\}/g, '');
    return { id: r.id, rotulo: r.rotulo, texto: t, modelo: r.modelos.find((m) => p.modelosAprovados.includes(m)) ?? null };
  });
}
