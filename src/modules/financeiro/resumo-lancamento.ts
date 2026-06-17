// src/modules/financeiro/resumo-lancamento.ts
// PURO: textos e botões da Caixa de Entrada (padrão finlan:<acao>:<id>).
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export interface BotaoZap { id: string; title: string }
export interface MsgComBotoes { body: string; buttons: BotaoZap[] }

export interface LancamentoResumo {
  id: string;
  tipo: 'despesa' | 'entrada';
  valor: number;
  data_evento: string;
  contraparte: string | null;
  categoriaNome: string | null;
  pf_pj: 'PF' | 'PJ' | null;
  tem_nota?: boolean;
}

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function linhaResumo(l: LancamentoResumo): string {
  const emoji = l.tipo === 'entrada' ? '💰' : '💸';
  const partes = [
    `${emoji} *${brl(l.valor)}*`,
    l.contraparte ?? null,
    l.categoriaNome ?? null,
    l.pf_pj ?? null,
    dataBR(l.data_evento),
    l.tem_nota === false ? '*sem nota*' : null,
  ].filter(Boolean);
  return partes.join(' · ');
}

export function montarResumoPendente(l: LancamentoResumo, opts: { duplicado: boolean }): MsgComBotoes {
  const aviso = opts.duplicado
    ? '\n⚠️ Parece igual a um lançamento que você já fez nesse dia.'
    : '';
  return {
    body: `Li aqui:\n${linhaResumo(l)}${aviso}\nConfere?`,
    buttons: [
      { id: `finlan:conf:${l.id}`, title: opts.duplicado ? 'Lançar mesmo assim' : 'Confirmar' },
      { id: `finlan:corr:${l.id}`, title: 'Corrigir' },
      { id: `finlan:desc:${l.id}`, title: 'Descartar' },
    ],
  };
}

export function montarPedidoPfPj(lancamentoId: string): MsgComBotoes {
  return {
    body: 'Esse é da empresa ou pessoal?',
    buttons: [
      { id: `finlan:pj:${lancamentoId}`, title: 'PJ (empresa)' },
      { id: `finlan:pf:${lancamentoId}`, title: 'PF (pessoal)' },
    ],
  };
}

export function montarConfirmacaoApagar(l: LancamentoResumo): MsgComBotoes {
  return {
    body: `Achei esse:\n${linhaResumo(l)}\nApagar? (sai dos números, mas fica no histórico)`,
    buttons: [
      { id: `finlan:apg:${l.id}`, title: 'Apagar mesmo' },
      { id: 'finlan:noop:0', title: 'Deixa como está' },
    ],
  };
}

export function montarOfertaVinculoConta(lancamentoId: string, contaId: string, clienteNome: string, saldo: number): MsgComBotoes {
  return {
    body: `Encontrei venda em aberto de *${clienteNome}* (falta ${brl(saldo)}). Essa entrada é dela?`,
    buttons: [
      { id: `finlan:vinc:${lancamentoId}:${contaId}`, title: 'É dessa venda' },
      { id: `finlan:avul:${lancamentoId}`, title: 'Entrada avulsa' },
      { id: `finlan:desc:${lancamentoId}`, title: 'Descartar' },
    ],
  };
}

export function montarEscolhaAtividade(lancamentoId: string, atividades: Array<{ id: string; nome: string }>): MsgComBotoes {
  return {
    body: 'Entrada avulsa da empresa — de qual atividade? (define o imposto)',
    buttons: atividades.slice(0, 3).map((a) => ({ id: `finlan:atv:${lancamentoId}:${a.id}`, title: a.nome.slice(0, 20) })),
  };
}

export function montarPedidoEsclarecimento(): string {
  return 'Entendi que é dinheiro, mas não consegui separar os valores 🤔\n' +
    'Me manda um por linha? (ex: "recebi 9000 do João Paulo" / "paguei 1500 de instalação")';
}

export function montarAberturaMultipla(n: number): string {
  return `Li ${n} lançamentos aqui 👇`;
}
