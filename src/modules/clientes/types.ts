// src/modules/clientes/types.ts

export type InstallationStatus =
  | 'novo' | 'qualificando' | 'qualificado'
  | 'proposta_aceita' | 'contrato_assinado'
  | 'instalado' | 'medidor_trocado'
  | 'operando' | 'pos_venda_concluido'
  | null;

export type JornadaFase =
  | 'lead' | 'proposta' | 'contrato'
  | 'instalado' | 'operando' | 'pos_venda';

export type ClienteProfile = 'residencial' | 'comercial' | 'rural' | 'industrial' | 'indefinido';

export type FormaPagamento = 'cartao' | 'boleto' | 'a_vista' | 'financiamento';
export type BancoFinanciamento = 'bv' | 'solfacil' | 'solagora' | 'santander' | 'btg' | 'outro';

export type AnexoTipo =
  | 'parecer_acesso' | 'foto_telhado' | 'foto_instalacao'
  | 'foto_inversor' | 'foto_visita_tecnica' | 'contrato' | 'outros';

export interface ClienteRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  profile: ClienteProfile | null;
  installation_status: InstallationStatus;
  installed_at: string | null;
  city: string | null;
  uf: string | null;
  concessionaria: string | null;
  consumo_medio_kwh: number | null;
  conta_media_brl: number | null;
  opt_out: boolean;
  eva_active: boolean;
}

export interface ClienteDetail extends ClienteRow {
  cpf_cnpj: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  neighborhood: string | null;
  cep: string | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  uc_numero: string | null;
  tarifa_classe: string | null;
  tarifa_modalidade: string | null;
  consumo_mensal_json: Record<string, number> | null;
  forma_pagamento: FormaPagamento | null;
  banco_financiamento: BancoFinanciamento | null;
  eh_consumidor_rateio: boolean;
  uc_geradora_lead_id: string | null;
  percentual_rateio: number | null;
  credito_esperado_kwh: number | null;
  vendedor_responsavel: string | null;
  observacoes_perfil: string | null;
  review_confirmed_at: string | null;
  lead_source: string | null;
  acquisition_source: string | null;
  created_at: string;
  // Agregados
  sistema: SistemaResumo | null;
  propostas: PropostaResumo[];
  alertas_ativos: AlertaResumo[];
  conversas_recentes: Array<{ role: string; content: string; timestamp: string }>;
  cadence_pendente: number;
  manutencoes_futuras: Array<{ scheduled_date: string; topic: string }>;
  anexos: AnexoListItem[];
}

export interface SistemaResumo {
  id: string;
  apelido: string;
  marca_inversor: string;
  potencia_kwp: number | null;
  qtd_paineis: number | null;
  painel_marca: string | null;
  data_instalacao: string | null;
  geracao_7d_kwh: number;
  geracao_total_kwh: number;
  ratio_ultimos_7d: number;
}

export interface PropostaResumo {
  id: string;
  slug: string;
  numero_proposta: string;
  created_at: string;
  acessos: number;
  cliente_respondeu_at: string | null;
  valor_total_brl: number | null;
}

export interface AlertaResumo {
  id: string;
  tipo: string;
  severidade: string;
  texto: string;
  primeiro_visto_em: string;
}

export interface AnexoListItem {
  id: string;
  tipo: AnexoTipo;
  descricao: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  signed_url?: string;
}

export interface InsightCard {
  id: 'upgrade' | 'depoimento' | 'aniversario';
  texto: string;
  cta: { label: string; action: string; params: Record<string, unknown> } | null;
}

// Sistema sem lead vinculado — aparece em /clientes como card "vincular cliente"
export interface SistemaOrfaoCard {
  sistema_id: string;
  apelido: string;
  marca_inversor: string;
  potencia_kwp: number | null;
  cidade: string | null;
  uf: string | null;
  data_instalacao: string | null;
}
