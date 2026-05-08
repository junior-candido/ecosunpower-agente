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
}
