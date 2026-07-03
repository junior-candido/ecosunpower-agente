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
  | 'nep'
  | 'abb'
  | 'solis';

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

// Um ponto da curva intradiária.
//   kw  = potência instantânea naquele horário
//   kwh = energia acumulada no dia ATÉ aquele horário (opcional — adapters que
//         não expõem energia intradiária deixam de fora; a tela degrada pra só a
//         potência). O total do dia = último kwh da série.
export interface IntradayPonto { hora: string; kw: number; kwh?: number }

export type IntradayResult =
  | { ok: true; pontos: IntradayPonto[] }
  | { ok: false; reason: string };

// Contexto opcional passado pelo service ao adapter. Hoje só serve pra
// PERSISTIR credenciais que mudam sozinhas durante a chamada — o caso do
// Sungrow, cujo refresh_token ROTA a cada renovação e precisa ser regravado no
// banco (em todas as plantas da mesma conta) senão a próxima sync quebra.
// Adapters que não renovam nada simplesmente ignoram o ctx.
export interface AdapterContext {
  // Aplica um patch (merge) nas credenciais da CONTA — todas as plantas que
  // compartilham o mesmo appkey/conta. Idempotente; falha silenciosa é logada.
  persistAccountCreds?(patch: Record<string, unknown>): Promise<void>;
}

// Interface que cada marca precisa implementar.
// fetchGeneration(sistema, dataInicio, dataFim) -> array de { data, geracao_kwh }
export interface MonitoringAdapter {
  marca: MarcaInversor;
  fetchGeneration(
    credenciais: Record<string, unknown>,
    dataInicio: string,
    dataFim: string,
    ctx?: AdapterContext,
  ): Promise<AdapterResult>;
  // Opcional: listar sites/plantas associadas a uma chave de conta.
  // Permite import em massa pelo dashboard. Adapter sem suporte retorna null.
  listSites?(credenciaisConta: Record<string, unknown>, ctx?: AdapterContext): Promise<ListSitesResult>;
  // Opcional: extrai as credenciais da CONTA (instalador) a partir das
  // credenciais de uma planta cadastrada. Usado pelo cron de descoberta pra
  // deduplicar contas e re-chamar listSites detectando plantas novas.
  // - SolarEdge: { api_key } (mesma key na conta e na planta)
  // - Deye:      { appId, appSecret, email, password, dataCenter, companyId? }
  // - NEP:       { jwt } (sem o sid)
  // - ABB:       { userId, password, apiKey } (sem o plantEntityID)
  // Retorna null se as credenciais por planta nao carregam info suficiente da
  // conta (adapter nao suporta discovery).
  extractAccountCreds?(credsPlanta: Record<string, unknown>): Record<string, unknown> | null;
  // Opcional: curva intradiária de um dia (YYYY-MM-DD). Ao vivo. Cada ponto tem
  // potência (kW) e, quando a marca expõe, energia acumulada (kWh). Adapter sem
  // suporte não implementa — a tela degrada pro total do dia. `ctx` permite
  // persistir credenciais que rotam durante a chamada (ex: refresh_token Sungrow).
  fetchIntraday?(
    credenciais: Record<string, unknown>,
    dia: string,
    ctx?: AdapterContext,
  ): Promise<IntradayResult>;
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
