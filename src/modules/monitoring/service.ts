// Servico de monitoramento: cron diario que itera sistemas_clientes ativos,
// chama o adapter da marca correspondente e popula geracao_diaria via UPSERT.
//
// Estrategia conservadora:
// - Roda 1x por dia (madrugada, ~3h BRT)
// - Pra cada sistema, busca os ultimos 7 dias (cobre eventual atraso na API)
// - UPSERT em geracao_diaria (sem duplicata)
// - Erros sao por-sistema — 1 falha NAO interrompe os demais
// - Marca ultima_sincronizacao + ultimo_erro pra diagnostico no dashboard
// - Adapter com invalidCredentials=true desativa o sistema automaticamente
//   (Junior precisa corrigir creds + reativar manualmente)

import type { SupabaseService } from '../supabase.js';
import { getAdapter, marcasSuportadas } from './adapter-registry.js';
import type { MarcaInversor, SistemaCliente, SiteResumo } from './types.js';

interface SyncResult {
  totalSistemas: number;
  sucessos: number;
  falhas: number;
  marcasSemAdapter: number;
}

export interface DetalheSistema {
  sistema: SistemaCliente;
  kpis: {
    hojeKwh: number | null;
    mesKwh: number;
    anoKwh: number;
    totalKwh: number;
    esperadoDiaKwh: number;
    ratioUltimos7: number;
  };
  serie30: { data: string; kwh: number; esperado: number }[];
  serieMensal: { mes: string; kwh: number; esperado: number }[];
  alertas: Array<{ tipo: string; severidade: 'aviso' | 'urgente' | 'info'; texto: string }>;
}

export class MonitoringService {
  constructor(private supabase: SupabaseService) {}

  // Executa sincronizacao de todos os sistemas ativos.
  async syncAll(): Promise<SyncResult> {
    const marcas = marcasSuportadas();
    if (marcas.length === 0) {
      console.warn('[monitoring] Nenhum adapter registrado, skip syncAll');
      return { totalSistemas: 0, sucessos: 0, falhas: 0, marcasSemAdapter: 0 };
    }

    const sistemas = await this.listarSistemasAtivos();
    let sucessos = 0;
    let falhas = 0;
    let marcasSemAdapter = 0;

    for (const sistema of sistemas) {
      try {
        const adapter = getAdapter(sistema.marca_inversor);
        if (!adapter) {
          marcasSemAdapter++;
          await this.atualizarStatusSistema(sistema.id, {
            ultimo_erro: `Sem adapter pra marca ${sistema.marca_inversor}`,
          });
          continue;
        }

        const dataFim = isoDate(new Date());
        const dataInicio = isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));

        const result = await adapter.fetchGeneration(
          sistema.api_credentials,
          dataInicio,
          dataFim,
        );

        if (!result.ok) {
          falhas++;
          await this.atualizarStatusSistema(sistema.id, {
            ultimo_erro: result.reason,
            // Se credenciais invalidas, desativa pra Junior corrigir
            ativo: result.invalidCredentials ? false : undefined,
          });
          console.warn(
            `[monitoring] sistema=${sistema.id} marca=${sistema.marca_inversor} falhou: ${result.reason}`,
          );
          continue;
        }

        await this.upsertGeracoes(sistema.id, result.geracoes);
        await this.atualizarStatusSistema(sistema.id, {
          ultima_sincronizacao: new Date().toISOString(),
          ultimo_erro: null,
        });
        sucessos++;
        console.log(
          `[monitoring] sistema=${sistema.id} marca=${sistema.marca_inversor} OK (${result.geracoes.length} dias)`,
        );
      } catch (err) {
        falhas++;
        const msg = (err as Error).message;
        console.error(`[monitoring] sistema=${sistema.id} excecao:`, msg);
        await this.atualizarStatusSistema(sistema.id, { ultimo_erro: msg }).catch(() => {});
      }
    }

    return { totalSistemas: sistemas.length, sucessos, falhas, marcasSemAdapter };
  }

  // Backfill: puxa historico completo do sistema desde data_instalacao
  // (ou 24 meses atras se nao tiver data). Util pra sistemas recem-cadastrados
  // ou pra preencher gaps. Quebra em chunks de 11 meses pra contornar limite
  // SolarEdge de 1 ano por chamada.
  async backfillHistorico(
    sistemaId: string,
    options: { mesesMaximo?: number } = {},
  ): Promise<{ ok: boolean; reason?: string; totalDias: number; chunks: number }> {
    const { data, error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('id', sistemaId)
      .maybeSingle();
    if (error || !data) return { ok: false, reason: 'Sistema nao encontrado', totalDias: 0, chunks: 0 };

    const sistema = data as SistemaCliente;
    const adapter = getAdapter(sistema.marca_inversor);
    if (!adapter) return { ok: false, reason: `Sem adapter pra marca ${sistema.marca_inversor}`, totalDias: 0, chunks: 0 };

    // Define range: data instalacao OU 24 meses atras (cap pelo mesesMaximo)
    const mesesMaximo = options.mesesMaximo ?? 24;
    const hoje = new Date();
    let dataInicio: Date;
    if (sistema.data_instalacao) {
      dataInicio = new Date(sistema.data_instalacao);
    } else {
      dataInicio = new Date(hoje);
      dataInicio.setMonth(dataInicio.getMonth() - mesesMaximo);
    }
    // Cap absoluto pra nao explodir
    const dataMin = new Date(hoje);
    dataMin.setMonth(dataMin.getMonth() - mesesMaximo);
    if (dataInicio < dataMin) dataInicio = dataMin;

    // Quebra em chunks de 330 dias (~11 meses, margem vs limite 1 ano da SolarEdge)
    const CHUNK_DIAS = 330;
    let cursor = new Date(dataInicio);
    let totalDias = 0;
    let chunks = 0;
    let ultimoErro: string | undefined;

    while (cursor < hoje) {
      const chunkFim = new Date(Math.min(cursor.getTime() + CHUNK_DIAS * 24 * 60 * 60 * 1000, hoje.getTime()));
      const result = await adapter.fetchGeneration(
        sistema.api_credentials,
        isoDate(cursor),
        isoDate(chunkFim),
      );
      if (!result.ok) {
        ultimoErro = result.reason;
        if (result.invalidCredentials) break; // sem ponto continuar
        // Erro temporario: tenta proximo chunk mesmo assim
      } else {
        await this.upsertGeracoes(sistemaId, result.geracoes);
        totalDias += result.geracoes.length;
      }
      chunks++;
      cursor = new Date(chunkFim.getTime() + 24 * 60 * 60 * 1000); // dia seguinte
    }

    await this.atualizarStatusSistema(sistemaId, {
      ultima_sincronizacao: new Date().toISOString(),
      ultimo_erro: ultimoErro ?? null,
    });

    if (totalDias === 0 && ultimoErro) {
      return { ok: false, reason: ultimoErro, totalDias: 0, chunks };
    }
    return { ok: true, totalDias, chunks };
  }

  // Sincroniza UM sistema sob demanda (usado por botao "atualizar agora" no dashboard).
  async syncOne(sistemaId: string): Promise<{ ok: boolean; reason?: string }> {
    const { data, error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('id', sistemaId)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, reason: error?.message ?? 'Sistema nao encontrado' };
    }
    const sistema = data as SistemaCliente;
    const adapter = getAdapter(sistema.marca_inversor);
    if (!adapter) return { ok: false, reason: `Sem adapter pra marca ${sistema.marca_inversor}` };

    const dataFim = isoDate(new Date());
    const dataInicio = isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    const result = await adapter.fetchGeneration(sistema.api_credentials, dataInicio, dataFim);
    if (!result.ok) return { ok: false, reason: result.reason };

    await this.upsertGeracoes(sistema.id, result.geracoes);
    await this.atualizarStatusSistema(sistema.id, {
      ultima_sincronizacao: new Date().toISOString(),
      ultimo_erro: null,
    });
    return { ok: true };
  }

  private async listarSistemasAtivos(): Promise<SistemaCliente[]> {
    const { data, error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('ativo', true);
    if (error) throw new Error(`listarSistemasAtivos: ${error.message}`);
    return (data ?? []) as SistemaCliente[];
  }

  private async upsertGeracoes(
    sistemaId: string,
    geracoes: { data: string; geracao_kwh: number }[],
  ): Promise<void> {
    if (geracoes.length === 0) return;
    const rows = geracoes.map((g) => ({
      sistema_id: sistemaId,
      data: g.data,
      geracao_kwh: g.geracao_kwh,
      fetched_at: new Date().toISOString(),
      fetched_source: 'cron',
    }));
    const { error } = await this.supabase.getClient()
      .from('geracao_diaria')
      .upsert(rows, { onConflict: 'sistema_id,data' });
    if (error) throw new Error(`upsertGeracoes: ${error.message}`);
  }

  private async atualizarStatusSistema(
    sistemaId: string,
    fields: Partial<{
      ultima_sincronizacao: string;
      ultimo_erro: string | null;
      ativo: boolean;
    }>,
  ): Promise<void> {
    if (Object.keys(fields).filter((k) => (fields as any)[k] !== undefined).length === 0) return;
    const { error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', sistemaId);
    if (error) {
      console.warn(`[monitoring] atualizarStatusSistema: ${error.message}`);
    }
  }

  // Importa em massa todos os sites de uma marca usando credenciais da CONTA
  // (ex: API key SolarEdge global). Cria sistemas_clientes ainda nao existentes
  // e atualiza (apelido, potencia, cidade, etc) os ja existentes — match por
  // (marca + site_id).
  // Junior usa isso pra cadastrar X sistemas de uma vez sem clicar 1 a 1.
  async importarSitesEmMassa(
    marca: MarcaInversor,
    credenciaisConta: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    reason?: string;
    novos: number;
    atualizados: number;
    total: number;
    sitesPorNome?: string[];
  }> {
    const adapter = getAdapter(marca);
    if (!adapter) {
      return { ok: false, reason: `Sem adapter pra marca ${marca}`, novos: 0, atualizados: 0, total: 0 };
    }
    if (!adapter.listSites) {
      return {
        ok: false,
        reason: `Adapter ${marca} nao suporta listSites (import em massa). Cadastrar sites manualmente.`,
        novos: 0,
        atualizados: 0,
        total: 0,
      };
    }

    const result = await adapter.listSites(credenciaisConta);
    if (!result.ok) {
      return { ok: false, reason: result.reason, novos: 0, atualizados: 0, total: 0 };
    }

    if (result.sites.length === 0) {
      return { ok: true, novos: 0, atualizados: 0, total: 0 };
    }

    let novos = 0;
    let atualizados = 0;
    const nomes: string[] = [];

    for (const site of result.sites) {
      const ja = await this.buscarSistemaPorMarcaESiteId(marca, site.externalId);
      if (ja) {
        // Atualiza dados que podem ter mudado (apelido renomeado, potencia
        // ajustada, cidade) E renova api_key (caso Junior tenha rotacionado).
        await this.supabase.getClient()
          .from('sistemas_clientes')
          .update({
            apelido: site.apelido,
            api_credentials: site.credenciais,
            potencia_kwp: site.potencia_kwp ?? ja.potencia_kwp,
            cidade: site.cidade ?? ja.cidade,
            data_instalacao: site.data_instalacao ?? ja.data_instalacao,
            ativo: true,
            ultimo_erro: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ja.id);
        atualizados++;
      } else {
        // Cria novo
        await this.supabase.getClient()
          .from('sistemas_clientes')
          .insert({
            apelido: site.apelido,
            marca_inversor: marca,
            api_credentials: site.credenciais,
            potencia_kwp: site.potencia_kwp,
            cidade: site.cidade,
            uf: site.uf,
            data_instalacao: site.data_instalacao,
            ativo: true,
          });
        novos++;
      }
      nomes.push(site.apelido);
    }

    return {
      ok: true,
      novos,
      atualizados,
      total: result.sites.length,
      sitesPorNome: nomes,
    };
  }

  // Descoberta automatica: usa as api_keys ja cadastradas em sistemas_clientes
  // pra detectar sites NOVOS criados no painel SolarEdge (ou outra marca) sem
  // Junior precisar adicionar manualmente. Cron periodico chama isto.
  // Tambem renova credenciais de sites existentes que mudaram (ex: api_key
  // rotacionada).
  async descobrirNovosSites(): Promise<{
    porMarca: Record<string, { novos: number; atualizados: number; erros: number }>;
  }> {
    const resultado: Record<string, { novos: number; atualizados: number; erros: number }> = {};

    for (const marca of marcasSuportadas()) {
      const adapter = getAdapter(marca);
      if (!adapter || !adapter.listSites) continue;

      // Pega todas api_keys distintas daquela marca
      const { data, error } = await this.supabase.getClient()
        .from('sistemas_clientes')
        .select('api_credentials')
        .eq('marca_inversor', marca);
      if (error) {
        console.warn(`[monitoring/discovery] ${marca}:`, error.message);
        continue;
      }

      const apiKeys = new Set<string>();
      for (const row of data ?? []) {
        const k = (row.api_credentials as Record<string, unknown>)?.api_key;
        if (typeof k === 'string' && k.trim()) apiKeys.add(k.trim());
      }
      if (apiKeys.size === 0) continue; // marca nao tem nenhum sistema cadastrado ainda

      let novos = 0;
      let atualizados = 0;
      let erros = 0;
      for (const apiKey of apiKeys) {
        const r = await this.importarSitesEmMassa(marca, { api_key: apiKey });
        if (r.ok) {
          novos += r.novos;
          atualizados += r.atualizados;
        } else {
          erros++;
        }
      }
      resultado[marca] = { novos, atualizados, erros };
      if (novos > 0) {
        console.log(
          `[monitoring/discovery] ${marca}: ${novos} sites NOVOS detectados (${atualizados} atualizados, ${erros} erros)`,
        );
      }
    }

    return { porMarca: resultado };
  }

  private async buscarSistemaPorMarcaESiteId(
    marca: MarcaInversor,
    siteId: string,
  ): Promise<SistemaCliente | null> {
    const { data, error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('marca_inversor', marca)
      .eq('api_credentials->>site_id', siteId)
      .maybeSingle();
    if (error) {
      console.warn('[monitoring] buscarSistemaPorMarcaESiteId:', error.message);
      return null;
    }
    return (data as SistemaCliente) ?? null;
  }

  // Atualiza dados detalhados de um sistema (form edit no dashboard).
  // Sanitiza inputs e ignora campos nao-permitidos pra evitar mass-assignment.
  async atualizarSistema(
    id: string,
    fields: Partial<{
      apelido: string;
      potencia_kwp: number | null;
      cidade: string | null;
      uf: string | null;
      data_instalacao: string | null;
      ativo: boolean;
      painel_marca: string | null;
      painel_modelo: string | null;
      qtd_paineis: number | null;
      inversor_modelo: string | null;
      telhado_tipo: string | null;
      telhado_orientacao: string | null;
      telhado_inclinacao_graus: number | null;
      sombreamento_pct: number | null;
      observacoes: string | null;
    }>,
  ): Promise<{ ok: boolean; reason?: string }> {
    // Filtra apenas campos suportados (nao deixa cliente passar marca_inversor,
    // api_credentials, etc — campos sensiveis ficam fora).
    const allowed = [
      'apelido', 'potencia_kwp', 'cidade', 'uf', 'data_instalacao', 'ativo',
      'painel_marca', 'painel_modelo', 'qtd_paineis', 'inversor_modelo',
      'telhado_tipo', 'telhado_orientacao', 'telhado_inclinacao_graus',
      'sombreamento_pct', 'observacoes',
    ];
    const update: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in fields) update[k] = (fields as Record<string, unknown>)[k];
    }
    if (Object.keys(update).length === 0) return { ok: false, reason: 'Nada pra atualizar' };
    update.updated_at = new Date().toISOString();

    const { error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .update(update)
      .eq('id', id);
    if (error) return { ok: false, reason: error.message };
    return { ok: true };
  }

  // Detalhe completo de UM sistema pra pagina de analise.
  // Inclui: dados base, KPIs (hoje/mes/ano/total), serie diaria 90 dias,
  // serie mensal 12 meses, calculo de geracao esperada (HSP x kWp), alertas.
  async getDetalheSistema(sistemaId: string): Promise<DetalheSistema | null> {
    const { data: sistema, error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('id', sistemaId)
      .maybeSingle();
    if (error || !sistema) return null;

    const s = sistema as SistemaCliente;

    // Busca todas as geracoes dos ultimos 13 meses (cobre 30d + 12m mensal)
    const inicio13meses = new Date();
    inicio13meses.setMonth(inicio13meses.getMonth() - 13);
    const inicioStr = inicio13meses.toISOString().slice(0, 10);

    const { data: geracoes } = await this.supabase.getClient()
      .from('geracao_diaria')
      .select('data, geracao_kwh')
      .eq('sistema_id', sistemaId)
      .gte('data', inicioStr)
      .order('data', { ascending: true });

    const geracoesArr = (geracoes ?? []) as { data: string; geracao_kwh: number }[];

    // KPIs
    const hoje = isoDate(new Date());
    const hojeRow = geracoesArr.find((g) => g.data === hoje);
    const inicioMes = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const inicioAno = isoDate(new Date(new Date().getFullYear(), 0, 1));

    const geracaoMes = geracoesArr.filter((g) => g.data >= inicioMes)
      .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
    const geracaoAno = geracoesArr.filter((g) => g.data >= inicioAno)
      .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
    const geracaoTotal = geracoesArr.reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);

    // Serie 30 dias (preenche dias sem dados com 0)
    const serie30: { data: string; kwh: number; esperado: number }[] = [];
    const hsp = s.uf === 'GO' ? 5.3 : 5.2;
    const fator = 0.80;
    const kWp = Number(s.potencia_kwp ?? 0);
    const esperadoDia = kWp * hsp * fator;

    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = isoDate(d);
      const row = geracoesArr.find((g) => g.data === ds);
      serie30.push({
        data: ds,
        kwh: row ? Number(row.geracao_kwh) : 0,
        esperado: esperadoDia,
      });
    }

    // Serie mensal 12 meses
    const serieMensal: { mes: string; kwh: number; esperado: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const ano = d.getFullYear();
      const mes = d.getMonth() + 1;
      const mesKey = `${ano}-${String(mes).padStart(2, '0')}`;
      const diasNoMes = new Date(ano, mes, 0).getDate();
      const kwhMes = geracoesArr
        .filter((g) => g.data.startsWith(mesKey))
        .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
      serieMensal.push({
        mes: mesKey,
        kwh: kwhMes,
        esperado: esperadoDia * diasNoMes,
      });
    }

    // Status / alertas inline (regras simples)
    const ultimos7 = serie30.slice(-7);
    const realUltimos7 = ultimos7.reduce((s2, d) => s2 + d.kwh, 0);
    const esperadoUltimos7 = esperadoDia * 7;
    const ratioUltimos7 = esperadoUltimos7 > 0 ? realUltimos7 / esperadoUltimos7 : 1;

    const diasOffline = serie30.slice().reverse().findIndex((d) => d.kwh > 0);
    const offlineHa = diasOffline === -1 ? 30 : diasOffline;

    const alertas: Array<{ tipo: string; severidade: 'aviso' | 'urgente' | 'info'; texto: string }> = [];
    if (offlineHa >= 3) {
      alertas.push({
        tipo: 'sistema_offline',
        severidade: 'urgente',
        texto: `Sem geração há ${offlineHa} dias. Verificar inversor / conexão WiFi.`,
      });
    } else if (kWp > 0 && ratioUltimos7 < 0.70 && realUltimos7 > 0) {
      const pct = Math.round((1 - ratioUltimos7) * 100);
      alertas.push({
        tipo: 'queda_geracao',
        severidade: 'aviso',
        texto: `Geração últimos 7 dias ${pct}% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.`,
      });
    } else if (kWp > 0 && ratioUltimos7 > 1.10) {
      const pct = Math.round((ratioUltimos7 - 1) * 100);
      alertas.push({
        tipo: 'milestone_economia',
        severidade: 'info',
        texto: `Geração últimos 7 dias ${pct}% ACIMA do esperado. Sistema operando excelente!`,
      });
    }

    return {
      sistema: s,
      kpis: {
        hojeKwh: hojeRow ? Number(hojeRow.geracao_kwh) : null,
        mesKwh: geracaoMes,
        anoKwh: geracaoAno,
        totalKwh: geracaoTotal,
        esperadoDiaKwh: esperadoDia,
        ratioUltimos7: ratioUltimos7,
      },
      serie30,
      serieMensal,
      alertas,
    };
  }

  // Listagem pra dashboard. Inclui geracao do dia atual.
  async listarParaDashboard(): Promise<Array<SistemaCliente & {
    geracao_hoje_kwh: number | null;
    geracao_mes_kwh: number;
  }>> {
    const sistemas = await this.listarSistemasAtivos();
    if (sistemas.length === 0) return [];

    const hoje = isoDate(new Date());
    const inicioMes = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

    // Busca geracoes de todos os sistemas no mes atual em 1 query
    const ids = sistemas.map((s) => s.id);
    const { data: geracoes } = await this.supabase.getClient()
      .from('geracao_diaria')
      .select('sistema_id, data, geracao_kwh')
      .in('sistema_id', ids)
      .gte('data', inicioMes);

    const porSistema = new Map<string, { hoje: number | null; mes: number }>();
    for (const sid of ids) porSistema.set(sid, { hoje: null, mes: 0 });

    for (const g of geracoes ?? []) {
      const acc = porSistema.get(g.sistema_id);
      if (!acc) continue;
      const kwh = Number(g.geracao_kwh) || 0;
      acc.mes += kwh;
      if (g.data === hoje) acc.hoje = kwh;
    }

    return sistemas.map((s) => ({
      ...s,
      geracao_hoje_kwh: porSistema.get(s.id)?.hoje ?? null,
      geracao_mes_kwh: porSistema.get(s.id)?.mes ?? 0,
    }));
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Re-export pro index.ts conseguir verificar quais marcas estao implementadas
export { marcasSuportadas } from './adapter-registry.js';
export type { MarcaInversor };
