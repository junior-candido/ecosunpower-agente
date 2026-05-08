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
