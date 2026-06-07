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
import { classificarSistema, esperadoDiaKwh } from './classificacao.js';

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
  // Periodo selecionado
  periodo: {
    inicio: string; // YYYY-MM-DD
    fim: string;    // YYYY-MM-DD
    label: string;  // "Últimos 30 dias", "Ano 2024", "Personalizado", etc
    granularidade: 'diaria' | 'mensal'; // baseado no range
    presetAtual: '30d' | '90d' | '6m' | '1a' | '2a' | '5a' | 'tudo' | 'custom';
  };
  // Serie principal do periodo selecionado (formato depende da granularidade)
  serie: { data: string; kwh: number; esperado: number }[];
  // Mantemos o overview mensal de SEMPRE (ate hoje, todos os meses com dados)
  serieMensalCompleta: { mes: string; kwh: number; esperado: number }[];
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

  // Backfill: puxa historico COMPLETO do sistema desde data_instalacao.
  // SolarEdge guarda historico desde a instalacao do site (sem limite),
  // entao podemos puxar 5, 10, 15 anos sem problema.
  // Quebra em chunks de 330 dias pra contornar limite 1 ano por chamada.
  // Se nao tiver data_instalacao cadastrada, usa fallback de 10 anos atras.
  async backfillHistorico(
    sistemaId: string,
    options: { mesesMaximoFallback?: number } = {},
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

    // Range: desde data_instalacao (se cadastrada) OU 10 anos atras (fallback).
    // Cap absoluto de 20 anos pra evitar runaway em cadastros corrompidos.
    const mesesMaximoFallback = options.mesesMaximoFallback ?? 120; // 10 anos
    const hoje = new Date();
    let dataInicio: Date;
    if (sistema.data_instalacao) {
      dataInicio = new Date(sistema.data_instalacao);
    } else {
      dataInicio = new Date(hoje);
      dataInicio.setMonth(dataInicio.getMonth() - mesesMaximoFallback);
    }
    // Cap defensivo de 20 anos (caso data_instalacao venha errada do banco)
    const capAbsoluto = new Date(hoje);
    capAbsoluto.setFullYear(capAbsoluto.getFullYear() - 20);
    if (dataInicio < capAbsoluto) dataInicio = capAbsoluto;

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

    let erros = 0;
    for (const site of result.sites) {
      const ja = await this.buscarSistemaPorMarcaESiteId(marca, site.externalId);
      if (ja) {
        // Atualiza dados que podem ter mudado (apelido renomeado, potencia
        // ajustada, cidade) E renova api_key (caso Junior tenha rotacionado).
        const { error } = await this.supabase.getClient()
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
        // NÃO engolir o erro: antes a gente contava "atualizado" mesmo quando
        // falhava, mascarando bugs (ex: uf_check rejeitando "Acre").
        if (error) { erros++; console.warn(`[monitoring/import] update ${marca} ${site.apelido} falhou: ${error.message}`); }
        else atualizados++;
      } else {
        // Cria novo
        const { error } = await this.supabase.getClient()
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
        if (error) { erros++; console.warn(`[monitoring/import] insert ${marca} ${site.apelido} falhou: ${error.message}`); }
        else novos++;
      }
      nomes.push(site.apelido);
    }
    if (erros > 0) console.warn(`[monitoring/import] ${marca}: ${erros} site(s) falharam (ver linhas acima)`);

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

      // Dedup contas por marca. Cada adapter expoe extractAccountCreds que
      // sabe extrair a "chave da conta" do JSONB da planta (ex: api_key pra
      // SolarEdge, jwt pra NEP, {userId,password,apiKey} pra ABB). Adapter
      // sem extractAccountCreds = sem discovery automatico (skip).
      if (!adapter.extractAccountCreds) continue;
      const contas = new Map<string, Record<string, unknown>>();
      for (const row of data ?? []) {
        const accountCreds = adapter.extractAccountCreds(row.api_credentials as Record<string, unknown>);
        if (!accountCreds) continue;
        // Chave de dedup: JSON canonico das credenciais da conta (mesmo
        // objeto = mesma string).
        const key = JSON.stringify(accountCreds, Object.keys(accountCreds).sort());
        contas.set(key, accountCreds);
      }
      if (contas.size === 0) continue; // marca nao tem nenhum sistema cadastrado ainda

      let novos = 0;
      let atualizados = 0;
      let erros = 0;
      for (const accountCreds of contas.values()) {
        const r = await this.importarSitesEmMassa(marca, accountCreds);
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

  // EXCLUIR de vez (D1a): apaga geração + a linha do sistema. Operação
  // destrutiva — o front exige confirmação dupla. "Pausar" (ativo=false)
  // continua sendo a opção branda/reversível via atualizarSistema.
  async excluirSistema(id: string): Promise<{ ok: boolean; reason?: string }> {
    const c = this.supabase.getClient();
    const delGer = await c.from('geracao_diaria').delete().eq('sistema_id', id);
    if (delGer.error) return { ok: false, reason: `geracao_diaria: ${delGer.error.message}` };
    const delSis = await c.from('sistemas_clientes').delete().eq('id', id);
    if (delSis.error) return { ok: false, reason: `sistemas_clientes: ${delSis.error.message}` };
    return { ok: true };
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
      lead_id: string | null;
    }>,
  ): Promise<{ ok: boolean; reason?: string }> {
    // Filtra apenas campos suportados (nao deixa cliente passar marca_inversor,
    // api_credentials, etc — campos sensiveis ficam fora).
    const allowed = [
      'apelido', 'potencia_kwp', 'cidade', 'uf', 'data_instalacao', 'ativo',
      'painel_marca', 'painel_modelo', 'qtd_paineis', 'inversor_modelo',
      'telhado_tipo', 'telhado_orientacao', 'telhado_inclinacao_graus',
      'sombreamento_pct', 'observacoes', 'lead_id',
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
  // periodo opcional: { preset: '30d'|'90d'|'6m'|'1a'|'2a'|'5a'|'tudo' }
  //                OR { inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' }
  // Default: ultimos 30 dias.
  async getDetalheSistema(
    sistemaId: string,
    options: {
      preset?: '30d' | '90d' | '6m' | '1a' | '2a' | '5a' | 'tudo';
      inicio?: string;
      fim?: string;
    } = {},
  ): Promise<DetalheSistema | null> {
    const { data: sistema, error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('id', sistemaId)
      .maybeSingle();
    if (error || !sistema) return null;

    const s = sistema as SistemaCliente;
    const hojeDate = new Date();
    const hojeStr = isoDate(hojeDate);

    // Resolve range do periodo
    const { inicio, fim, label, presetAtual } = this.resolverPeriodo(options, s.data_instalacao);

    // Busca TODAS as geracoes do sistema (pra KPIs ano/total + serie mensal completa)
    const { data: todasGeracoes } = await this.supabase.getClient()
      .from('geracao_diaria')
      .select('data, geracao_kwh')
      .eq('sistema_id', sistemaId)
      .order('data', { ascending: true });

    const geracoesArr = (todasGeracoes ?? []) as { data: string; geracao_kwh: number }[];

    // KPIs (sempre fixos: hoje/mes/ano/total)
    const hojeRow = geracoesArr.find((g) => g.data === hojeStr);
    const inicioMes = isoDate(new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1));
    const inicioAno = isoDate(new Date(hojeDate.getFullYear(), 0, 1));
    const geracaoMes = geracoesArr.filter((g) => g.data >= inicioMes)
      .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
    const geracaoAno = geracoesArr.filter((g) => g.data >= inicioAno)
      .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
    const geracaoTotal = geracoesArr.reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);

    const kWp = Number(s.potencia_kwp ?? 0);
    const esperadoDia = esperadoDiaKwh(s.potencia_kwp, s.uf);

    // Serie do periodo selecionado
    const diasRange = Math.ceil((new Date(fim).getTime() - new Date(inicio).getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const granularidade: 'diaria' | 'mensal' = diasRange <= 60 ? 'diaria' : 'mensal';

    const geracoesDoRange = geracoesArr.filter((g) => g.data >= inicio && g.data <= fim);

    let serie: { data: string; kwh: number; esperado: number }[] = [];
    if (granularidade === 'diaria') {
      // Bucket por dia, preenchendo gaps com 0
      const cursor = new Date(inicio);
      while (cursor <= new Date(fim)) {
        const ds = isoDate(cursor);
        const row = geracoesDoRange.find((g) => g.data === ds);
        serie.push({
          data: ds,
          kwh: row ? Number(row.geracao_kwh) : 0,
          esperado: esperadoDia,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    } else {
      // Bucket por mes
      const inicioBucket = new Date(inicio);
      inicioBucket.setDate(1);
      const fimBucket = new Date(fim);
      const cursor = new Date(inicioBucket);
      while (cursor <= fimBucket) {
        const ano = cursor.getFullYear();
        const mes = cursor.getMonth() + 1;
        const mesKey = `${ano}-${String(mes).padStart(2, '0')}`;
        const diasNoMes = new Date(ano, mes, 0).getDate();
        const kwhMes = geracoesDoRange
          .filter((g) => g.data.startsWith(mesKey))
          .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
        serie.push({
          data: mesKey,
          kwh: kwhMes,
          esperado: esperadoDia * diasNoMes,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Serie mensal COMPLETA (todos os meses com dados desde primeira geracao)
    const serieMensalCompleta: { mes: string; kwh: number; esperado: number }[] = [];
    if (geracoesArr.length > 0) {
      const primeiroDia = new Date(geracoesArr[0].data);
      const cursor = new Date(primeiroDia.getFullYear(), primeiroDia.getMonth(), 1);
      const fimMensal = new Date(hojeDate.getFullYear(), hojeDate.getMonth(), 1);
      while (cursor <= fimMensal) {
        const ano = cursor.getFullYear();
        const mes = cursor.getMonth() + 1;
        const mesKey = `${ano}-${String(mes).padStart(2, '0')}`;
        const diasNoMes = new Date(ano, mes, 0).getDate();
        const kwhMes = geracoesArr
          .filter((g) => g.data.startsWith(mesKey))
          .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
        serieMensalCompleta.push({
          mes: mesKey,
          kwh: kwhMes,
          esperado: esperadoDia * diasNoMes,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    // Status / alertas (baseado em ULTIMOS 7 DIAS reais — independente do range selecionado)
    const ultimos7Inicio = isoDate(new Date(hojeDate.getTime() - 7 * 24 * 60 * 60 * 1000));
    const ultimos7Geracoes = geracoesArr.filter((g) => g.data >= ultimos7Inicio);
    const realUltimos7 = ultimos7Geracoes.reduce((s2, d) => s2 + Number(d.geracao_kwh), 0);
    const esperadoUltimos7 = esperadoDia * 7;
    const ratioUltimos7 = esperadoUltimos7 > 0 ? realUltimos7 / esperadoUltimos7 : 1;

    // Quantos dias atras teve geracao > 0 (pra detectar offline)
    let offlineHa = 30;
    for (let i = 0; i < 30; i++) {
      const d = isoDate(new Date(hojeDate.getTime() - i * 24 * 60 * 60 * 1000));
      const r = geracoesArr.find((g) => g.data === d);
      if (r && Number(r.geracao_kwh) > 0) {
        offlineHa = i;
        break;
      }
    }

    const alertas: Array<{ tipo: string; severidade: 'aviso' | 'urgente' | 'info'; texto: string }> = [];
    const cls = classificarSistema({
      ativo: s.ativo,
      ultimoErro: s.ultimo_erro ?? null,
      potenciaKwp: s.potencia_kwp,
      uf: s.uf,
      diasSemGeracao: offlineHa,
      realUltimos7: realUltimos7,
    });
    if (cls.alerta) alertas.push(cls.alerta);

    return {
      sistema: s,
      kpis: {
        hojeKwh: hojeRow ? Number(hojeRow.geracao_kwh) : null,
        mesKwh: geracaoMes,
        anoKwh: geracaoAno,
        totalKwh: geracaoTotal,
        esperadoDiaKwh: esperadoDia,
        ratioUltimos7,
      },
      periodo: { inicio, fim, label, granularidade, presetAtual },
      serie,
      serieMensalCompleta,
      alertas,
    };
  }

  private resolverPeriodo(
    options: { preset?: string; inicio?: string; fim?: string },
    dataInstalacao?: string | null,
  ): {
    inicio: string;
    fim: string;
    label: string;
    presetAtual: '30d' | '90d' | '6m' | '1a' | '2a' | '5a' | 'tudo' | 'custom';
  } {
    const hoje = new Date();
    const hojeStr = isoDate(hoje);

    // Range customizado tem prioridade
    if (options.inicio && options.fim) {
      return {
        inicio: options.inicio,
        fim: options.fim,
        label: `${options.inicio} a ${options.fim}`,
        presetAtual: 'custom',
      };
    }

    const preset = (options.preset ?? '30d') as '30d' | '90d' | '6m' | '1a' | '2a' | '5a' | 'tudo';
    const labels: Record<string, string> = {
      '30d': 'Últimos 30 dias',
      '90d': 'Últimos 90 dias',
      '6m': 'Últimos 6 meses',
      '1a': 'Último ano',
      '2a': 'Últimos 2 anos',
      '5a': 'Últimos 5 anos',
      'tudo': dataInstalacao ? `Desde a instalação (${dataInstalacao})` : 'Tudo',
    };

    const inicio = new Date(hoje);
    if (preset === '30d') inicio.setDate(inicio.getDate() - 30);
    else if (preset === '90d') inicio.setDate(inicio.getDate() - 90);
    else if (preset === '6m') inicio.setMonth(inicio.getMonth() - 6);
    else if (preset === '1a') inicio.setFullYear(inicio.getFullYear() - 1);
    else if (preset === '2a') inicio.setFullYear(inicio.getFullYear() - 2);
    else if (preset === '5a') inicio.setFullYear(inicio.getFullYear() - 5);
    else if (preset === 'tudo') {
      if (dataInstalacao) {
        return { inicio: dataInstalacao, fim: hojeStr, label: labels['tudo'], presetAtual: 'tudo' };
      }
      inicio.setFullYear(inicio.getFullYear() - 10); // fallback 10a
    }

    return { inicio: isoDate(inicio), fim: hojeStr, label: labels[preset] ?? 'Período custom', presetAtual: preset };
  }

  // Listagem pra dashboard. Inclui geracao do dia atual.
  async listarParaDashboard(): Promise<Array<SistemaCliente & {
    geracao_hoje_kwh: number | null;
    geracao_mes_kwh: number;
    geracao_7d_kwh: number;
  }>> {
    const sistemas = await this.listarSistemasAtivos();
    if (sistemas.length === 0) return [];

    const hoje = isoDate(new Date());
    const inicioMes = isoDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const ha7 = isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const desde = inicioMes < ha7 ? inicioMes : ha7;
    const ids = sistemas.map((s) => s.id);
    const { data: geracoes } = await this.supabase.getClient()
      .from('geracao_diaria')
      .select('sistema_id, data, geracao_kwh')
      .in('sistema_id', ids)
      .gte('data', desde);

    const porSistema = new Map<string, { hoje: number | null; mes: number; ult7: number }>();
    for (const sid of ids) porSistema.set(sid, { hoje: null, mes: 0, ult7: 0 });

    for (const g of geracoes ?? []) {
      const acc = porSistema.get(g.sistema_id);
      if (!acc) continue;
      const kwh = Number(g.geracao_kwh) || 0;
      if (g.data >= inicioMes) acc.mes += kwh;
      if (g.data >= ha7) acc.ult7 += kwh;
      if (g.data === hoje) acc.hoje = kwh;
    }

    return sistemas.map((s) => ({
      ...s,
      geracao_hoje_kwh: porSistema.get(s.id)?.hoje ?? null,
      geracao_mes_kwh: porSistema.get(s.id)?.mes ?? 0,
      geracao_7d_kwh: porSistema.get(s.id)?.ult7 ?? 0,
    }));
  }
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Re-export pro index.ts conseguir verificar quais marcas estao implementadas
export { marcasSuportadas } from './adapter-registry.js';
export type { MarcaInversor };
