// Tipos compartilhados pelo modulo de monitoramento.
// Schema unificado independente da marca de inversor.

export type MarcaInversor =
  | 'solaredge'
  | 'sungrow'
  | 'deye'
  | 'hoymiles'
  | 'growatt'
  | 'goodwe'
  | 'huawei'
  | 'foxess'
  | 'nep'
  | 'abb'
  | 'solis'
  | 'saj';

export type TelhadoTipo = 'ceramica' | 'fibrocimento' | 'laje' | 'metalico' | 'solo' | 'outro';
export type Orientacao = 'N' | 'NE' | 'L' | 'SE' | 'S' | 'SO' | 'O' | 'NO';

export interface SistemaCliente {
  id: string;
  // [Fase 2 A3] dono da usina (077/079) — toda escrita derivada carimba com ele.
  company_id?: string | null;
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
  // 084: último status devolvido pelo adapter (ok|offline|falha|desconhecido)
  // — dá nome ao problema no alerta de usina parada (fatia 1, Thiago 28/07).
  status_inversor?: string | null;
  status_inversor_em?: string | null;
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
  // Mapa das Usinas (migration 145)
  lat?: number | null;
  lng?: number | null;
  geo_fonte?: string | null;
  geo_em?: string | null;
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
  // Falha PARCIAL (29/09): parte da busca não respondeu (micro, mês, janela).
  // Os dias afetados NÃO vêm em `geracoes` (o banco mantém o valor anterior —
  // nunca gravar soma parcial). Texto curto em português, sem a marca na
  // frente (o service prefixa): ex. "3 de 30 micros não responderam".
  // Com ele preenchido o sync NÃO conta como sucesso (vira ultimo_erro).
  falhaParcial?: string;
  // Limite de consultas do fabricante (30/09, GoodWe HTTP 429): parte dos dias
  // ficou pra depois. NÃO é erro de integração — o que veio é gravado, o painel
  // não mostra falha e o sync tenta o resto na próxima rodada.
  adiadoPorLimite?: boolean;
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

export interface TelemetryLeitura { ponto: string; valor: number; unidade: string; ts: string }
export interface TelemetryDevice { deviceKey: string; leituras: TelemetryLeitura[] }
export type TelemetryResult =
  | { ok: true; devices: TelemetryDevice[] }
  | { ok: false; reason: string; invalidCredentials?: boolean };

// Contexto opcional passado pelo service ao adapter. Hoje só serve pra
// PERSISTIR credenciais que mudam sozinhas durante a chamada — o caso do
// Sungrow, cujo refresh_token ROTA a cada renovação e precisa ser regravado no
// banco (em todas as plantas da mesma conta) senão a próxima sync quebra.
// Adapters que não renovam nada simplesmente ignoram o ctx.
export interface AdapterContext {
  // Aplica um patch (merge) nas credenciais da CONTA — todas as plantas que
  // compartilham o mesmo appkey/conta. Idempotente; falha silenciosa é logada.
  persistAccountCreds?(patch: Record<string, unknown>): Promise<void>;
  /** Empresa dona da usina (chaves de AMBIENTE só valem pra casa — ex. SolarEdge Fleet). */
  companyId?: string | null;
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
  // - SAJ:       { username, password, region } (sem o site_id)
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
  // Opcional: foto ATUAL de todas as grandezas catalogadas por dispositivo.
  // `catalogo` = ponto_nativo -> { ponto, unidade, fator }. `ts` = horário da foto (ISO).
  fetchTelemetry?(
    credenciais: Record<string, unknown>,
    catalogo: Map<string, { ponto: string; unidade: string; fator: number }>,
    ts: string,
    ctx?: AdapterContext,
  ): Promise<TelemetryResult>;
}

// Site/planta retornado por listSites — schema unificado pra qualquer marca.
export interface SiteResumo {
  externalId: string;             // id do site na API da marca
  apelido: string;                 // nome amigavel ("Casa Silva")
  potencia_kwp: number | null;
  cidade: string | null;
  uf: string | null;
  data_instalacao: string | null;  // YYYY-MM-DD
  // Posição informada pela marca (quando a API traz). Vai pro mapa com
  // geo_fonte='api' — nunca por cima de um ponto ajustado à mão.
  lat?: number | null;
  lng?: number | null;
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
