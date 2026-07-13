// src/modules/closing/types.ts
// Tipos centrais do modo /fechar. Veja docs/superpowers/specs/2026-05-26-eva-fechar-mvp-design.md
//
// Modelo de 2 sujeitos:
//  - titular_uc: SEMPRE quem é titular da conta de luz, vai na PROCURAÇÃO.
//  - contratante: quem assina o CONTRATO. Pode ser igual ao titular_uc OU outra pessoa
//    (caso clássico: cônjuge negociou pela titular).

export type UF = 'DF' | 'GO';

export interface Endereco {
  rua: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: UF;
  cep: string;
}

export interface PessoaFisica {
  tipo: 'PF';
  nome: string;
  cpf: string;
  rg: string;
  orgao_emissor_rg: string;
  nacionalidade: string; // default 'Brasileiro(a)'
  estado_civil?: string;
  profissao?: string;
  data_nascimento?: string; // ISO yyyy-mm-dd
  endereco: Endereco;
  telefone: string;
  email: string;
}

export interface PessoaJuridica {
  tipo: 'PJ';
  razao_social: string;
  cnpj: string;
  endereco: Endereco;
  representante: PessoaFisica;
  telefone: string;
  email: string;
}

export type Pessoa = PessoaFisica | PessoaJuridica;

export type Modalidade = 'autoconsumo_local' | 'autoconsumo_remoto' | 'geracao_compartilhada';

export interface Sistema {
  kwp: number;
  modalidade: Modalidade;
  modulos: { marca: string; potencia_w: number; quantidade: number };
  inversor: { marca: string; modelo: string; potencia_kw: number; quantidade?: number };
}

export interface Comercial {
  valor_total_brl: number;
  forma_pagamento: string; // texto livre, ex: 'à vista PIX'
}

export type RelacaoContratante = 'conjuge' | 'socio' | 'familiar' | 'financiador' | 'outro';

export type Concessionaria = 'Neoenergia-DF' | 'Equatorial-GO';

export type DocPedido = 'contrato' | 'procuracao';

/**
 * O que um TERMO ADITIVO carrega. Casos reais do Junior:
 *  1. o cartão do cliente não passou em 24x, a bandeira só liberou 21x → muda a
 *     cláusula de pagamento;
 *  2. no meio da obra apareceu serviço a mais → o aditivo organiza o que entrou,
 *     quanto ficou e o novo total.
 * O aditivo COMPLEMENTA o contrato (não substitui): o resto continua valendo.
 *
 * O "antes" (contrato_data, valor_anterior, forma_pagamento_anterior) NÃO é
 * digitado — sai do contrato congelado. É o retrato do que foi combinado.
 */
export type MotivoAditivo = 'pagamento' | 'servicos' | 'prazo' | 'outro';

export interface Aditivo {
  motivo?: MotivoAditivo;
  // o que era antes (vem do contrato congelado, ver contrato-vigente.ts)
  contrato_data?: string; // ISO
  valor_anterior?: number;
  forma_pagamento_anterior?: string;
  // o que passa a valer
  nova_forma_pagamento?: string;
  servicos_novos?: string;
  valor_adicional?: number;
  novo_valor_total?: number;
  novo_prazo?: string;
  justificativa?: string;
}

export interface DadosFechamento {
  titular_uc: Pessoa;
  /** Só existe quando o documento é um termo aditivo. */
  aditivo?: Aditivo;
  uc_numero?: string; // 'a confirmar' se vazio
  ligacao_nova?: boolean; // pedido de ligação nova (UC ainda não existe) — UC deixa de ser obrigatória e a procuração ganha o poder de ligação nova
  concessionaria: Concessionaria;
  endereco_instalacao: Endereco;

  contratante: Pessoa;
  contratante_eh_titular: boolean;
  relacao_contratante?: RelacaoContratante;
  observacao_partes?: string;

  sistema: Sistema;
  comercial: Comercial;
  disposicoes_especiais?: string;

  docs_pedidos: DocPedido[];
}

export type ClosingState =
  | { stage: 'collecting'; data: Partial<DadosFechamento>; pending_questions: string[] }
  | { stage: 'awaiting_confirm'; data: DadosFechamento }
  | { stage: 'rendering'; data: DadosFechamento; fechamento_id: string };

export interface FechamentoRow {
  id: string;
  lead_id: string | null;
  proposta_publica_id: string | null;
  docs_pedidos: DocPedido[];
  dados_snapshot: DadosFechamento;
  parent_id: string | null;
  contrato_drive_id: string | null;
  contrato_drive_link: string | null;
  procuracao_drive_id: string | null;
  procuracao_drive_link: string | null;
  drive_folder_id: string | null;
  status: 'gerado' | 'aprovado_junior' | 'enviado_cliente' | 'cancelado';
  created_at: string;
  created_by: string;
  updated_at: string;
}
