// Tipos compartilhados pelo modulo de monitoramento.
// Schema unificado independente da marca de inversor.

export type MarcaInversor =
  | 'solaredge'
  | 'sungrow'
  | 'deye'
  | 'hoymiles'
  | 'goodwe'
  | 'huawei'
  | 'foxess'
  | 'nep';

export type TelhadoTipo = 'ceramica' | 'fibrocimento' | 'laje' | 'metalico' | 'solo' | 'outro';
export type Orientacao = 'N' | 'NE' | 'L' | 'SE' | 'S' | 'SO' | 'O' | 'NO';

export interface SistemaCliente {
  id: string;
  lead_id: string | null;
  apelido: string;
  marca_inversor: MarcaInversor;
  api_credentials: Record<string, unknown>;
  potencia_kwp: number | null;
  data_instalacao: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  ultima_sincronizacao: string | null;
  ultimo_erro: string | null;
  // Dados detalhados (migration 022) — cruzamento com geração real
  painel_marca?: string | null;
  painel_modelo?: string | null;
  qtd_paineis?: number | null;
  inversor_modelo?: string | null;
  telhado_tipo?: TelhadoTipo | null;
  telhado_orientacao?: Orientacao | null;
  telhado_inclinacao_graus?: number | null;
  sombreamento_pct?: number | null;
  observacoes?: string | null;
}

export interface GeracaoDiaria {
  data: string;       // YYYY-MM-DD
  geracao_kwh: number;
}

export interface AdapterFetchResult {
  ok: true;
  geracoes: GeracaoDiaria[];
  // Status atual do sistema (online/offline/etc) extraido na mesma chamada,
  // se o adapter conseguir.
  statusInversor?: 'ok' | 'offline' | 'falha' | 'desconhecido';
}

export interface AdapterFetchError {
  ok: false;
  reason: string;
  // Se foi falha de credencial (forca Junior corrigir), nao retentar
  // automaticamente — desativar o sistema.
  invalidCredentials?: boolean;
}

export type AdapterResult = AdapterFetchResult | AdapterFetchError;

// Interface que cada marca precisa implementar.
// fetchGeneration(sistema, dataInicio, dataFim) -> array de { data, geracao_kwh }
export interface MonitoringAdapter {
  marca: MarcaInversor;
  fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
  ): Promise<AdapterResult>;
  // Opcional: listar sites/plantas associadas a uma chave de conta.
  // Permite import em massa pelo dashboard. Adapter sem suporte retorna null.
  listSites?(credenciaisConta: Record<string, unknown>): Promise<ListSitesResult>;
}

// Site/planta retornado por listSites — schema unificado pra qualquer marca.
export interface SiteResumo {
  externalId: string;             // id do site na API da marca
  apelido: string;                 // nome amigavel ("Casa Silva")
  potencia_kwp: number | null;
  cidade: string | null;
  uf: string | null;
  data_instalacao: string | null;  // YYYY-MM-DD
  // Credenciais especificas pra DEPOIS chamar fetchGeneration desse site.
  // Inclui externalId + secrets da conta.
  credenciais: Record<string, unknown>;
}

export interface ListSitesOk {
  ok: true;
  sites: SiteResumo[];
}

export interface ListSitesError {
  ok: false;
  reason: string;
  invalidCredentials?: boolean;
}

export type ListSitesResult = ListSitesOk | ListSitesError;
