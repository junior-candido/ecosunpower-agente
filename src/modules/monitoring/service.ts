// Servico de monitoramento: cron diario que itera sistemas_clientes ativos,
// chama o adapter da marca correspondente e popula geracao_diaria via UPSERT.
//
// Estrategia conservadora:
// - Roda 1x por dia (madrugada, ~3h BRT)
// - Pra cada sistema, busca os ultimos 7 dias (cobre eventual atraso na API)
// - 1×/dia por usina (1ª rodada depois das 05:00 de Brasília) busca o mês
//   anterior + o corrente inteiros — datalogger atrasado / recálculo do
//   fabricante corrigido, total do mês bate com o app (29/09)
// - UPSERT em geracao_diaria (sem duplicata)
// - Erros sao por-sistema — 1 falha NAO interrompe os demais
// - Marca ultima_sincronizacao + ultimo_erro pra diagnostico no dashboard
// - Adapter com invalidCredentials=true desativa o sistema automaticamente
//   (Junior precisa corrigir creds + reativar manualmente)

import type { SupabaseService } from '../supabase.js';
import { getAdapter, marcasSuportadas } from './adapter-registry.js';
import type { AdapterContext, MarcaInversor, SistemaCliente, SiteResumo } from './types.js';
import { classificarSistema, esperadoDiaKwh, medianaEspecifica7d } from './classificacao.js';
import { buscarPaginado } from './paginacao.js';
import { empresaDe } from '../empresa-config.js';
import { serieMesDiaria, serieAnoMensal, navegacao, type Vista } from './detalhe-series.js';
import { gravarPosicaoDaApi } from './usinas-posicao.js';
import {
  hojeBrasilia, somarDias, inicioMesBrasilia, inicioAnoBrasilia, dataBrasiliaComoUtc, janelaSync, limitarAoHoje,
  horaBrasilia, janelaRefreshMes,
} from './util/dia-brasilia.js';
import { avaliarSync } from './sync-avaliacao.js';
import type { AdapterFetchResult } from './types.js';

interface SyncResult {
  totalSistemas: number;
  sucessos: number;
  falhas: number;
  marcasSemAdapter: number;
  // Usinas SolarEdge que ficaram pra próxima rodada (ritmo de 1×/h ou chave
  // pausada por 429) — não é sucesso nem falha.
  pulados?: number;
  // true = já havia uma rodada em andamento; esta não fez nada (trava).
  emAndamento?: boolean;
  // Usinas que nesta rodada buscaram o mês anterior + corrente (refresh diário).
  refreshMes?: number;
}

// Refresh diário do mês: a partir desta hora (Brasília) a 1ª rodada de cada
// usina no dia busca [1º dia do mês anterior, hoje] em vez dos 7 dias.
// 05:00 = madrugada já fechou o dia anterior nos portais e antes do sol forte.
export const HORA_REFRESH_MES_BRASILIA = 5;

// SolarEdge: limite de 300 chamadas/dia por chave. A cada 15 min seriam 96
// chamadas/usina/dia só de geração (+24 da descoberta) → 429 à tarde. Geração
// no máximo 1×/hora por usina (24/dia) e descoberta a cada 6 h (4/dia).
export const SOLAREDGE_INTERVALO_SYNC_MS = 60 * 60 * 1000;
// Levou 429 (cota do dia estourada): a CHAVE inteira descansa 3 h — repetir
// só queima mais cota e mantém o bloqueio.
export const SOLAREDGE_PAUSA_429_MS = 3 * 60 * 60 * 1000;
export const SOLAREDGE_INTERVALO_DESCOBERTA_MS = 6 * 60 * 60 * 1000;
const MSG_SOLAREDGE_LIMITE = 'SolarEdge: limite diário de consultas da API atingido — nova tentativa em cerca de 3 h';

function ehLimiteSolarEdge(reason: string | undefined): boolean {
  return /^SolarEdge (V2 )?429\b/.test(reason ?? '');
}

function chaveSolarEdge(sistema: SistemaCliente): string {
  const c = (sistema.api_credentials as Record<string, unknown>) ?? {};
  // V2: a pausa vale pra chave Fleet da conta (a do ambiente é uma só pra casa).
  return String(c.fleet_key ?? c.api_key ?? '').trim() || `fleet:${sistema.company_id ?? 'casa'}`;
}

// [Fase 2 A3] Toda escrita derivada de um sistema carimba o company_id DO
// SISTEMA — nunca confia no DEFAULT da coluna (EcoSun, 077): pra usina de
// tenant o default seria a empresa ERRADA e o dado sumiria pro dono sob RLS.
export const ECOSUN_COMPANY_ID_MONIT = '00000000-0000-0000-0000-000000000001';

/** Linhas de geracao_diaria com o carimbo da empresa do sistema (puro, testável). */
export function linhasGeracao(
  sistemaId: string,
  companyId: string | null | undefined,
  geracoes: { data: string; geracao_kwh: number }[],
): Array<{ sistema_id: string; data: string; geracao_kwh: number; fetched_at: string; fetched_source: string; company_id: string }> {
  const fetchedAt = new Date().toISOString();
  // 02/10/2026: o portal às vezes devolve o MESMO dia duas vezes na resposta
  // (Deye, Lucas Azevedo) e o upsert em lote falha inteiro ("ON CONFLICT DO
  // UPDATE command cannot affect row a second time"). Uma linha por dia, com o
  // MAIOR valor (o repetido costuma ser o dia parcial por fuso).
  const porDia = new Map<string, { data: string; geracao_kwh: number }>();
  for (const g of geracoes) {
    const ja = porDia.get(g.data);
    if (!ja || g.geracao_kwh > ja.geracao_kwh) porDia.set(g.data, g);
  }
  return [...porDia.values()].map((g) => ({
    sistema_id: sistemaId,
    data: g.data,
    geracao_kwh: g.geracao_kwh,
    fetched_at: fetchedAt,
    fetched_source: 'cron',
    company_id: companyId ?? ECOSUN_COMPANY_ID_MONIT,
  }));
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
    // 29/07: mediana de kWh/kWp em 7d da carteira da empresa (régua relativa).
    // null = carteira pequena/sem referência → superfícies usam a régua absoluta.
    medianaCarteira7d: number | null;
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

// Detalhe da usina na visão de CALENDÁRIO (abas Dia/Mês/Ano + setas).
// Reaproveita os MESMOS kpis/alertas de DetalheSistema — muda só a `serie`,
// que passa a ser por vista (mês=diária, ano=mensal, dia=curva ao vivo na rota).
export interface DetalheCalendario {
  sistema: SistemaCliente;
  kpis: DetalheSistema['kpis'];
  alertas: DetalheSistema['alertas'];
  vista: Vista;
  ref: string; // YYYY-MM-DD
  nav: { anterior: string; proximo: string | null; label: string };
  serie: { x: string; kwh: number }[];
  totalDiaKwh: number | null; // só na vista 'dia' — total do geracao_diaria do ref
  // Overview mensal de TODA a vida do sistema — alimenta o gráfico "Histórico
  // mensal completo", que permanece igual nas duas visões.
  serieMensalCompleta: DetalheSistema['serieMensalCompleta'];
}

export class MonitoringService {
  constructor(private supabase: SupabaseService) {}

  // Executa sincronizacao de todos os sistemas ativos.
  // companyId (opcional): só as usinas daquela empresa — usado pelo botão
  // "Atualizar todas" do tenant. Sem ele, a frota inteira (cron / EcoSun).
  // Trava de sobreposição + ritmo da SolarEdge. Memória do PROCESSO (o app roda
  // numa instância só no EasyPanel) — reiniciar zera, o que no pior caso faz
  // 1 chamada a mais; nada disso precisa de banco.
  private syncRodando = false;
  private solarEdgeUltimaTentativa = new Map<string, number>(); // sistema_id → ms
  private solarEdgePausadaAte = new Map<string, number>();      // api_key → ms
  private ultimaDescobertaPorMarca = new Map<string, number>(); // marca → ms
  // Refresh do mês: sistema_id → dia (Brasília) em que já tentou. 1 tentativa
  // por dia, dê certo ou não — portal fora do ar não vira busca de ~60 dias a
  // cada 15 min (GoodWe = 1 chamada por dia pedido). Reiniciar o processo
  // zera: no pior caso refaz o refresh 1× a mais no dia.
  private refreshMesFeito = new Map<string, string>();

  async syncAll(companyId?: string | null): Promise<SyncResult> {
    // Uma rodada não começa enquanto a anterior ainda roda (cron de 15 min +
    // botão "Atualizar todas"): duas rodadas juntas dobram as chamadas às
    // marcas (rate limit) e disputam o mesmo upsert.
    if (this.syncRodando) {
      console.warn('[monitoring] syncAll: rodada anterior ainda em andamento — pulando esta');
      return { totalSistemas: 0, sucessos: 0, falhas: 0, marcasSemAdapter: 0, pulados: 0, emAndamento: true };
    }
    this.syncRodando = true;
    try {
      return await this.syncAllSemTrava(companyId);
    } finally {
      this.syncRodando = false;
    }
  }

  private async syncAllSemTrava(companyId?: string | null): Promise<SyncResult> {
    const marcas = marcasSuportadas();
    if (marcas.length === 0) {
      console.warn('[monitoring] Nenhum adapter registrado, skip syncAll');
      return { totalSistemas: 0, sucessos: 0, falhas: 0, marcasSemAdapter: 0 };
    }

    const sistemas = await this.listarSistemasAtivos(companyId);
    let sucessos = 0;
    let falhas = 0;
    let marcasSemAdapter = 0;
    let pulados = 0;
    let refreshMes = 0;

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

        const agora = new Date();
        const ehSolarEdge = sistema.marca_inversor === 'solaredge';
        if (ehSolarEdge && this.solarEdgeDeveEsperar(sistema, agora.getTime())) {
          pulados++;
          continue;
        }

        // Calendário de BRASÍLIA: nunca pede (nem grava) o dia de amanhã.
        // 1×/dia por usina (depois das 05:00): mês anterior + corrente. A
        // SolarEdge entra aqui só quando o ritmo de 1×/h já liberou a consulta
        // (checado acima) — o mês vem na MESMA chamada (1 pedido por período),
        // então a cota diária não muda.
        const hojeBr = hojeBrasilia(agora);
        const fazRefreshMes = horaBrasilia(agora) >= HORA_REFRESH_MES_BRASILIA
          && this.refreshMesFeito.get(sistema.id) !== hojeBr;
        const { dataInicio, dataFim } = fazRefreshMes ? janelaRefreshMes(agora) : janelaSync(agora, 7);
        if (fazRefreshMes) {
          this.refreshMesFeito.set(sistema.id, hojeBr);
          refreshMes++;
        }

        if (ehSolarEdge) this.solarEdgeUltimaTentativa.set(sistema.id, agora.getTime());
        const result = await adapter.fetchGeneration(
          sistema.api_credentials,
          dataInicio,
          dataFim,
          this.buildAdapterContext(sistema),
        );

        if (!result.ok) {
          falhas++;
          let reason = result.reason;
          if (ehSolarEdge && ehLimiteSolarEdge(reason)) {
            this.solarEdgePausadaAte.set(chaveSolarEdge(sistema), agora.getTime() + SOLAREDGE_PAUSA_429_MS);
            reason = MSG_SOLAREDGE_LIMITE;
          }
          await this.atualizarStatusSistema(sistema.id, {
            ultimo_erro: reason,
            // Se credenciais invalidas, desativa pra Junior corrigir
            ativo: result.invalidCredentials ? false : undefined,
          });
          console.warn(
            `[monitoring] sistema=${sistema.id} marca=${sistema.marca_inversor} falhou: ${result.reason}`,
          );
          continue;
        }

        // Limite de consultas do fabricante (GoodWe 429, 30/09/2026): o que não
        // veio fica pra próxima rodada — o refresh do mês interrompido NÃO conta
        // como feito, e sem nenhum dia não há o que avaliar (nada vira "erro de
        // integração": a conta só pediu pra esperar).
        if (result.adiadoPorLimite) {
          if (fazRefreshMes) this.refreshMesFeito.delete(sistema.id);
          if (result.geracoes.length === 0) {
            pulados++;
            continue;
          }
        }

        const av = await this.aplicarResultado(sistema, result, dataFim);
        if (av.ok) {
          sucessos++;
          console.log(
            `[monitoring] sistema=${sistema.id} marca=${sistema.marca_inversor} OK (${result.geracoes.length} dias)`,
          );
        } else {
          falhas++;
          console.warn(`[monitoring] sistema=${sistema.id} marca=${sistema.marca_inversor} incompleto: ${av.erro}`);
        }
      } catch (err) {
        falhas++;
        const msg = (err as Error).message;
        console.error(`[monitoring] sistema=${sistema.id} excecao:`, msg);
        await this.atualizarStatusSistema(sistema.id, { ultimo_erro: msg }).catch(() => {});
      }
    }

    if (refreshMes > 0) console.log(`[monitoring] refresh do mês (anterior + corrente): ${refreshMes} usina(s) nesta rodada`);
    return { totalSistemas: sistemas.length, sucessos, falhas, marcasSemAdapter, pulados, refreshMes };
  }

  // SolarEdge: pula se a usina foi consultada há menos de 1 h ou se a chave
  // está descansando depois de um 429.
  private solarEdgeDeveEsperar(sistema: SistemaCliente, agoraMs: number): boolean {
    const pausa = this.solarEdgePausadaAte.get(chaveSolarEdge(sistema));
    if (pausa != null && agoraMs < pausa) return true;
    const ultima = this.solarEdgeUltimaTentativa.get(sistema.id);
    return ultima != null && agoraMs - ultima < SOLAREDGE_INTERVALO_SYNC_MS;
  }

  // Grava o que veio COMPLETO e decide se foi sucesso (ver sync-avaliacao.ts).
  // Sucesso: carimba ultima_sincronizacao e limpa o erro. Não-sucesso (falha
  // parcial / portal vazio / dado parado): ultimo_erro com o motivo em
  // português e ultima_sincronizacao INTOCADA — a tela para de dizer
  // "sincronizado agora" pra usina que não recebe dado.
  private async aplicarResultado(
    sistema: SistemaCliente,
    result: AdapterFetchResult,
    hoje: string,
  ): Promise<{ ok: true } | { ok: false; erro: string }> {
    const geracoes = limitarAoHoje(result.geracoes, hoje);
    const ultimaDataComGeracao = geracoes.length === 0 && !result.falhaParcial
      ? await this.ultimaDataComGeracao(sistema.id)
      : null;
    await this.upsertGeracoes(sistema.id, geracoes, sistema.company_id);
    const av = avaliarSync({
      marca: sistema.marca_inversor,
      geracoes,
      falhaParcial: result.falhaParcial,
      ultimaDataComGeracao,
      hoje,
    });
    const agoraIso = new Date().toISOString();
    // 084: guarda o status devolvido pelo adapter (fatia 1 do "alerta com
    // motivo"). Sem o campo → 'desconhecido' (não deixa valor velho).
    const status = { status_inversor: result.statusInversor ?? 'desconhecido', status_inversor_em: agoraIso };
    if (av.ok) {
      await this.atualizarStatusSistema(sistema.id, { ultima_sincronizacao: agoraIso, ultimo_erro: null, ...status });
    } else {
      await this.atualizarStatusSistema(sistema.id, { ultimo_erro: av.erro, ...status });
    }
    return av;
  }

  // Última data com geração > 0 gravada pra usina (null = nunca teve dado).
  private async ultimaDataComGeracao(sistemaId: string): Promise<string | null> {
    const { data, error } = await this.supabase.getClient()
      .from('geracao_diaria')
      .select('data')
      .eq('sistema_id', sistemaId)
      .gt('geracao_kwh', 0)
      .order('data', { ascending: false })
      .limit(1);
    if (error) throw new Error(`ultimaDataComGeracao: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : null;
    return (row?.data as string | undefined) ?? null;
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

    // Calendário de Brasília: o último pedaço termina no hoje de Brasília
    // (às 21h+ o UTC já é amanhã — nunca pedir/gravar dia que não existe).
    const hojeBr = hojeBrasilia(hoje);
    while (cursor < hoje) {
      const chunkFim = new Date(Math.min(cursor.getTime() + CHUNK_DIAS * 24 * 60 * 60 * 1000, hoje.getTime()));
      const inicioChunk = isoDate(cursor);
      const fimChunk = isoDate(chunkFim) > hojeBr ? hojeBr : isoDate(chunkFim);
      if (inicioChunk > fimChunk) break;
      const result = await adapter.fetchGeneration(
        sistema.api_credentials,
        inicioChunk,
        fimChunk,
        this.buildAdapterContext(sistema),
      );
      if (!result.ok) {
        ultimoErro = result.reason;
        if (result.invalidCredentials) break; // sem ponto continuar
        // Erro temporario: tenta proximo chunk mesmo assim
      } else {
        const geracoes = limitarAoHoje(result.geracoes, hojeBr);
        await this.upsertGeracoes(sistemaId, geracoes, sistema.company_id);
        totalDias += geracoes.length;
        if (result.falhaParcial) ultimoErro = result.falhaParcial;
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

    const agora = new Date();
    const { dataInicio, dataFim } = janelaSync(agora, 30);
    const ehSolarEdge = sistema.marca_inversor === 'solaredge';
    // SolarEdge com a chave descansando (429): nem tenta — só queimaria cota.
    const pausa = ehSolarEdge ? this.solarEdgePausadaAte.get(chaveSolarEdge(sistema)) : undefined;
    if (pausa != null && agora.getTime() < pausa) return { ok: false, reason: MSG_SOLAREDGE_LIMITE };
    if (ehSolarEdge) this.solarEdgeUltimaTentativa.set(sistema.id, agora.getTime());

    const result = await adapter.fetchGeneration(sistema.api_credentials, dataInicio, dataFim, this.buildAdapterContext(sistema));
    if (!result.ok) {
      if (ehSolarEdge && ehLimiteSolarEdge(result.reason)) {
        this.solarEdgePausadaAte.set(chaveSolarEdge(sistema), agora.getTime() + SOLAREDGE_PAUSA_429_MS);
        return { ok: false, reason: MSG_SOLAREDGE_LIMITE };
      }
      return { ok: false, reason: result.reason };
    }

    // Mesma régua do syncAll: falha parcial / portal vazio NÃO é sucesso.
    const av = await this.aplicarResultado(sistema, result, dataFim);
    return av.ok ? { ok: true } : { ok: false, reason: av.erro };
  }

  // Monta o AdapterContext pra um sistema. Hoje só provê persistAccountCreds:
  // regrava um patch de credenciais em TODAS as plantas da mesma conta (mesmo
  // marca + appkey). Usado pelo Sungrow, cujo refresh_token rota a cada renovação.
  // Público pra rota de detalhe passar no fetchIntraday.
  buildAdapterContext(sistema: SistemaCliente): AdapterContext {
    return {
      companyId: (sistema.company_id as string | null | undefined) ?? null,
      persistAccountCreds: (patch) =>
        this.persistCredsPorConta(sistema.marca_inversor, (sistema.api_credentials as Record<string, unknown>)?.appkey, patch),
    };
  }

  // Aplica um patch (merge) em sistemas_clientes.api_credentials de todas as
  // plantas com a mesma marca + appkey. Sem appkey, não faz nada (evita alterar
  // credenciais de marcas que não têm conta compartilhada).
  private async persistCredsPorConta(
    marca: MarcaInversor,
    appkey: unknown,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (typeof appkey !== 'string' || !appkey) return;
    const client = this.supabase.getClient();
    const { data, error } = await client
      .from('sistemas_clientes')
      .select('id, api_credentials')
      .eq('marca_inversor', marca)
      .eq('api_credentials->>appkey', appkey);
    if (error) { console.warn(`[monitoring] persistCredsPorConta select: ${error.message}`); return; }
    for (const row of data ?? []) {
      const merged = { ...(row.api_credentials as Record<string, unknown>), ...patch };
      const { error: upErr } = await client
        .from('sistemas_clientes')
        .update({ api_credentials: merged, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (upErr) console.warn(`[monitoring] persistCredsPorConta update ${row.id}: ${upErr.message}`);
    }
  }

  // [Fase 2 A3] companyId presente = só as usinas daquela empresa (tela do
  // dashboard passa a empresa do OPERADOR — Sabion não vê EcoSun e vice-versa).
  // Ausente = todas (crons/relatórios internos, que são multi-tenant).
  private async listarSistemasAtivos(companyId?: string | null): Promise<SistemaCliente[]> {
    let q = this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('ativo', true);
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw new Error(`listarSistemasAtivos: ${error.message}`);
    return (data ?? []) as SistemaCliente[];
  }

  private async upsertGeracoes(
    sistemaId: string,
    geracoes: { data: string; geracao_kwh: number }[],
    companyId?: string | null,
  ): Promise<void> {
    if (geracoes.length === 0) return;
    const rows = linhasGeracao(sistemaId, companyId, geracoes);
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
      status_inversor: string;
      status_inversor_em: string;
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
    // [Fase 2 A3] dono das usinas criadas: vem do OPERADOR (dashboard) ou do
    // sistema que já tinha a conta (discovery). Ausente = EcoSun explícito.
    companyId?: string | null,
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

    const ctxConta: AdapterContext = {
      persistAccountCreds: (patch) =>
        this.persistCredsPorConta(marca, (credenciaisConta as Record<string, unknown>)?.appkey, patch),
    };
    const result = await adapter.listSites(credenciaisConta, ctxConta);
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
        // 29/09: NUNCA sobrescreve o kWp (a marca devolve estimativa — ex.:
        // FoxESS soma a potência dos micros; o cadastro à mão é o certo): só
        // preenche quando está vazio/0. E NUNCA religa (ativo) — usina pausada
        // à mão fica pausada; nem apaga o ultimo_erro que o sync gravou (quem
        // limpa é o próximo sync bem-sucedido).
        const atualizacao: Record<string, unknown> = {
          apelido: site.apelido,
          api_credentials: site.credenciais,
          cidade: site.cidade ?? ja.cidade,
          data_instalacao: site.data_instalacao ?? ja.data_instalacao,
          updated_at: new Date().toISOString(),
        };
        if (!(Number(ja.potencia_kwp ?? 0) > 0) && site.potencia_kwp != null && site.potencia_kwp > 0) {
          atualizacao.potencia_kwp = site.potencia_kwp;
        }
        const { error } = await this.supabase.getClient()
          .from('sistemas_clientes')
          .update(atualizacao)
          .eq('id', ja.id);
        // NÃO engolir o erro: antes a gente contava "atualizado" mesmo quando
        // falhava, mascarando bugs (ex: uf_check rejeitando "Acre").
        if (error) { erros++; console.warn(`[monitoring/import] update ${marca} ${site.apelido} falhou: ${error.message}`); }
        else atualizados++;
      } else {
        // Cria novo. A usina veio do painel => já gera => nasce em pos_venda.
        // Tenta casar por nome (apelido <-> leads.name) pra já vincular o cliente.
        const { normalizarNome } = await import('../dashboard/vincular-usinas.js');
        let leadId: string | null = null;
        const alvo = normalizarNome(site.apelido);
        const donoId = companyId ?? ECOSUN_COMPANY_ID_MONIT;
        // Só casa com nome NÃO vazio: apelido em branco ('  '/'---') normaliza
        // pra '' e casaria com qualquer lead de nome vazio — vínculo errado.
        // [A3] e SÓ leads da MESMA empresa (nunca vincular usina do tenant a
        // lead de outra — nome igual entre empresas é colisão, não vínculo).
        if (alvo) {
          const { data: leads } = await this.supabase.getClient()
            .from('leads').select('id, name').eq('company_id', donoId);
          const hit = (leads ?? []).find((l: any) => normalizarNome(l.name) === alvo);
          leadId = hit?.id ?? null;
        }
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
            lead_id: leadId,
            etapa_obra: 'pos_venda',
            company_id: donoId,
          });
        if (error) { erros++; console.warn(`[monitoring/import] insert ${marca} ${site.apelido} falhou: ${error.message}`); }
        else novos++;
      }
      // Mapa das Usinas: a marca informou a posição da planta → grava como
      // geo_fonte='api' (melhor esforço; nunca por cima de ponto manual).
      if (site.lat != null && site.lng != null) {
        const alvo = ja ?? await this.buscarSistemaPorMarcaESiteId(marca, site.externalId);
        const dono = (alvo?.company_id as string | null | undefined) ?? companyId ?? ECOSUN_COMPANY_ID_MONIT;
        if (alvo) await gravarPosicaoDaApi(this.supabase.getClient(), dono, alvo.id, site.lat, site.lng);
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

      // SolarEdge: a descoberta gasta da MESMA cota de 300/dia da geração —
      // no máximo a cada 6 h (as outras marcas seguem o ritmo do cron).
      if (marca === 'solaredge') {
        const agoraMs = Date.now();
        const ultima = this.ultimaDescobertaPorMarca.get(marca);
        if (ultima != null && agoraMs - ultima < SOLAREDGE_INTERVALO_DESCOBERTA_MS) continue;
        this.ultimaDescobertaPorMarca.set(marca, agoraMs);
      }

      // Pega todas api_keys distintas daquela marca (com o dono — [A3]: site
      // novo descoberto nasce na MESMA empresa da conta que o revelou)
      const { data, error } = await this.supabase.getClient()
        .from('sistemas_clientes')
        .select('api_credentials, company_id')
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
      const contas = new Map<string, { creds: Record<string, unknown>; companyId: string | null }>();
      for (const row of data ?? []) {
        const accountCreds = adapter.extractAccountCreds(row.api_credentials as Record<string, unknown>);
        if (!accountCreds) continue;
        // Chave de dedup: JSON canonico das credenciais da conta (mesmo
        // objeto = mesma string). Mesma conta em 2 empresas (não deveria
        // existir): fica o primeiro dono visto.
        const key = JSON.stringify(accountCreds, Object.keys(accountCreds).sort());
        if (!contas.has(key)) contas.set(key, { creds: accountCreds, companyId: (row as any).company_id ?? null });
      }
      if (contas.size === 0) continue; // marca nao tem nenhum sistema cadastrado ainda

      let novos = 0;
      let atualizados = 0;
      let erros = 0;
      for (const conta of contas.values()) {
        const r = await this.importarSitesEmMassa(marca, conta.creds, conta.companyId);
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

  // Régua relativa (29/07): mediana de kWh/kWp em 7d da carteira da empresa.
  // Cache de 5 min — o detalhe abre a cada clique e o relatório roda usina a
  // usina; sem cache seria um scan da frota inteira por chamada.
  private medianaCache = new Map<string, { v: number | null; em: number }>();
  async medianaDaCarteira7d(companyId: string | null | undefined): Promise<number | null> {
    // Sem empresa conhecida não há carteira de referência (não misturar tenants).
    if (!companyId) return null;
    const hit = this.medianaCache.get(companyId);
    if (hit && Date.now() - hit.em < 5 * 60_000) return hit.v;
    const rows = await this.listarParaDashboard(companyId);
    const v = medianaEspecifica7d(rows.map((r) => ({
      potenciaKwp: r.potencia_kwp, realUltimos7: r.geracao_7d_kwh,
    })));
    this.medianaCache.set(companyId, { v, em: Date.now() });
    return v;
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

    // Resolve range do periodo
    const { inicio, fim, label, presetAtual } = this.resolverPeriodo(options, s.data_instalacao);

    // Busca TODAS as geracoes do sistema (pra KPIs ano/total + serie mensal completa)
    const todasGeracoes = await this.buscarGeracoesPaginado(() => this.supabase.getClient()
      .from('geracao_diaria')
      .select('data, geracao_kwh')
      .eq('sistema_id', sistemaId)
      .order('data', { ascending: true }));

    const geracoesArr = todasGeracoes as { data: string; geracao_kwh: number }[];

    // KPIs + alertas (sempre fixos: hoje/mes/ano/total) — extraidos pra reuso
    // pelo getDetalheCalendario (mesma logica, sem duplicar).
    const medianaCarteira = await this.medianaDaCarteira7d(s.company_id);
    const { kpis, alertas } = this.montarKpisEAlertas(s, geracoesArr, hojeDate, medianaCarteira);
    const esperadoDia = kpis.esperadoDiaKwh;

    // Serie do periodo selecionado
    const diasRange = Math.ceil((new Date(fim).getTime() - new Date(inicio).getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const granularidade: 'diaria' | 'mensal' = diasRange <= 60 ? 'diaria' : 'mensal';

    const geracoesDoRange = geracoesArr.filter((g) => g.data >= inicio && g.data <= fim);

    let serie: { data: string; kwh: number; esperado: number }[] = [];
    if (granularidade === 'diaria') {
      // Bucket por dia, preenchendo gaps com 0
      const cursor = new Date(`${inicio}T00:00:00Z`);
      while (cursor <= new Date(`${fim}T00:00:00Z`)) {
        const ds = isoDate(cursor);
        const row = geracoesDoRange.find((g) => g.data === ds);
        serie.push({
          data: ds,
          kwh: row ? Number(row.geracao_kwh) : 0,
          esperado: esperadoDia,
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    } else {
      // Bucket por mes
      const inicioBucket = new Date(`${inicio}T00:00:00Z`);
      inicioBucket.setUTCDate(1);
      const fimBucket = new Date(`${fim}T00:00:00Z`);
      const cursor = new Date(inicioBucket);
      while (cursor <= fimBucket) {
        const ano = cursor.getUTCFullYear();
        const mes = cursor.getUTCMonth() + 1;
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
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
    }

    // Serie mensal COMPLETA (todos os meses com dados desde primeira geracao)
    const serieMensalCompleta = this.montarSerieMensalCompleta(geracoesArr, esperadoDia, hojeDate);

    return {
      sistema: s,
      kpis,
      periodo: { inicio, fim, label, granularidade, presetAtual },
      serie,
      serieMensalCompleta,
      alertas,
    };
  }

  // Helper compartilhado: overview mensal de TODA a vida do sistema (todos os
  // meses com dados desde a 1a geracao). Usado pelo grafico "Historico mensal
  // completo", que continua presente nas duas visoes do detalhe.
  private montarSerieMensalCompleta(
    geracoesArr: { data: string; geracao_kwh: number }[],
    esperadoDia: number,
    hojeDate: Date,
  ): { mes: string; kwh: number; esperado: number }[] {
    const out: { mes: string; kwh: number; esperado: number }[] = [];
    if (geracoesArr.length === 0) return out;
    // Meses como YYYY-MM puros (calendário de Brasília; sem fuso do servidor).
    const [pa, pm] = geracoesArr[0].data.split('-').map(Number);
    const [ha, hm] = hojeBrasilia(hojeDate).split('-').map(Number);
    const cursor = new Date(Date.UTC(pa, pm - 1, 1));
    const fimMensal = new Date(Date.UTC(ha, hm - 1, 1));
    while (cursor <= fimMensal) {
      const ano = cursor.getUTCFullYear();
      const mes = cursor.getUTCMonth() + 1;
      const mesKey = `${ano}-${String(mes).padStart(2, '0')}`;
      const diasNoMes = new Date(ano, mes, 0).getDate();
      const kwhMes = geracoesArr
        .filter((g) => g.data.startsWith(mesKey))
        .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
      out.push({ mes: mesKey, kwh: kwhMes, esperado: esperadoDia * diasNoMes });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return out;
  }

  // Helper compartilhado: KPIs fixos (hoje/mes/ano/total) + alertas de saude,
  // exatamente como o detalhe sempre mostrou. Usado por getDetalheSistema e
  // getDetalheCalendario pra nao duplicar a logica.
  private montarKpisEAlertas(
    s: SistemaCliente,
    geracoesArr: { data: string; geracao_kwh: number }[],
    hojeDate: Date,
    medianaCarteira7d: number | null = null,
  ): { kpis: DetalheSistema['kpis']; alertas: DetalheSistema['alertas'] } {
    // Calendário de Brasília (às 21h+ o UTC já é amanhã — o mês zerava).
    const hojeStr = hojeBrasilia(hojeDate);

    // KPIs (sempre fixos: hoje/mes/ano/total)
    const hojeRow = geracoesArr.find((g) => g.data === hojeStr);
    const inicioMes = inicioMesBrasilia(hojeDate);
    const inicioAno = inicioAnoBrasilia(hojeDate);
    const geracaoMes = geracoesArr.filter((g) => g.data >= inicioMes)
      .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
    const geracaoAno = geracoesArr.filter((g) => g.data >= inicioAno)
      .reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);
    const geracaoTotal = geracoesArr.reduce((s2, g) => s2 + Number(g.geracao_kwh), 0);

    const esperadoDia = esperadoDiaKwh(s.potencia_kwp, s.uf);

    // Status / alertas (baseado em ULTIMOS 7 DIAS reais — independente do range selecionado)
    // Exatamente 7 dias COMPLETOS [hoje-7, hoje) — a janela antiga somava 8
    // datas-calendário contra um esperado de 7 (fencepost); mesma janela da
    // lista/mediana pra card e detalhe contarem a mesma história.
    const ultimos7Inicio = somarDias(hojeStr, -7);
    const realUltimos7 = geracoesArr.filter((g) => g.data >= ultimos7Inicio && g.data < hojeStr)
      .reduce((s2, d) => s2 + Number(d.geracao_kwh), 0);
    const esperadoUltimos7 = esperadoDia * 7;
    const ratioUltimos7 = esperadoUltimos7 > 0 ? realUltimos7 / esperadoUltimos7 : 1;

    // Quantos dias atras teve geracao > 0 (pra detectar offline)
    let offlineHa = 30;
    for (let i = 0; i < 30; i++) {
      const d = somarDias(hojeStr, -i);
      const r = geracoesArr.find((g) => g.data === d);
      if (r && Number(r.geracao_kwh) > 0) {
        offlineHa = i;
        break;
      }
    }

    const alertas: DetalheSistema['alertas'] = [];
    const cls = classificarSistema({
      ativo: s.ativo,
      ultimoErro: s.ultimo_erro ?? null,
      potenciaKwp: s.potencia_kwp,
      uf: s.uf,
      diasSemGeracao: offlineHa,
      realUltimos7,
      statusInversor: (s.status_inversor as 'ok' | 'offline' | 'falha' | 'desconhecido' | null | undefined) ?? null,
      corteAtencao: empresaDe(s.company_id).reguaAtencaoPct / 100, // 085
      medianaCarteira7d, // 29/07: régua relativa à carteira da empresa
    });
    if (cls.alerta) alertas.push(cls.alerta);

    return {
      kpis: {
        hojeKwh: hojeRow ? Number(hojeRow.geracao_kwh) : null,
        mesKwh: geracaoMes,
        anoKwh: geracaoAno,
        totalKwh: geracaoTotal,
        esperadoDiaKwh: esperadoDia,
        ratioUltimos7,
        medianaCarteira7d,
      },
      alertas,
    };
  }

  // Detalhe da usina na visão de CALENDÁRIO (abas Dia/Mês/Ano).
  // Reaproveita a MESMA carga de sistema/geração + KPIs/alertas do
  // getDetalheSistema (via montarKpisEAlertas). A `serie` muda por vista:
  //   - mes: geração diária do mês do `ref` (barras kWh/dia)
  //   - ano: geração mensal do ano do `ref` (barras kWh/mês)
  //   - dia: serie vazia (a curva de potência vem ao vivo na rota); expõe
  //          `totalDiaKwh` = geração registrada naquele dia (fallback).
  async getDetalheCalendario(
    id: string,
    opts: { vista: Vista; ref: string },
  ): Promise<DetalheCalendario | null> {
    const { data: sistema, error } = await this.supabase.getClient()
      .from('sistemas_clientes')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !sistema) return null;

    const s = sistema as SistemaCliente;
    const hojeDate = new Date();

    // Mesma consulta que getDetalheSistema usa: TODAS as geracoes (KPIs
    // total/ano precisam do historico completo). As funcoes puras de serie
    // filtram internamente pelo ano/mes do `ref`.
    const todasGeracoes = await this.buscarGeracoesPaginado(() => this.supabase.getClient()
      .from('geracao_diaria')
      .select('data, geracao_kwh')
      .eq('sistema_id', id)
      .order('data', { ascending: true }));
    const ger = todasGeracoes as { data: string; geracao_kwh: number }[];

    const { kpis, alertas } = this.montarKpisEAlertas(s, ger, hojeDate, await this.medianaDaCarteira7d(s.company_id));
    // navegacao lê o "hoje" com getUTC* → entrega o dia de Brasília à meia-noite UTC.
    const nav = navegacao(opts.vista, opts.ref, dataBrasiliaComoUtc(hojeDate), s.data_instalacao ?? null);
    const serieMensalCompleta = this.montarSerieMensalCompleta(ger, kpis.esperadoDiaKwh, hojeDate);

    const [y, mes] = opts.ref.split('-').map(Number);
    let serie: { x: string; kwh: number }[] = [];
    let totalDiaKwh: number | null = null;
    if (opts.vista === 'mes') {
      serie = serieMesDiaria(ger, y, mes).map((p) => ({ x: p.data, kwh: p.kwh }));
    } else if (opts.vista === 'ano') {
      serie = serieAnoMensal(ger, y).map((p) => ({ x: p.mes, kwh: p.kwh }));
    } else {
      const row = ger.find((g) => g.data === opts.ref);
      totalDiaKwh = row ? Number(row.geracao_kwh) : null;
    }

    return { sistema: s, kpis, alertas, vista: opts.vista, ref: opts.ref, nav, serie, totalDiaKwh, serieMensalCompleta };
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
    // Dia de Brasília à meia-noite UTC: isoDate/setUTC* abaixo ficam no dia certo.
    const hoje = dataBrasiliaComoUtc();
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
    if (preset === '30d') inicio.setUTCDate(inicio.getUTCDate() - 30);
    else if (preset === '90d') inicio.setUTCDate(inicio.getUTCDate() - 90);
    else if (preset === '6m') inicio.setUTCMonth(inicio.getUTCMonth() - 6);
    else if (preset === '1a') inicio.setUTCFullYear(inicio.getUTCFullYear() - 1);
    else if (preset === '2a') inicio.setUTCFullYear(inicio.getUTCFullYear() - 2);
    else if (preset === '5a') inicio.setUTCFullYear(inicio.getUTCFullYear() - 5);
    else if (preset === 'tudo') {
      if (dataInstalacao) {
        return { inicio: dataInstalacao, fim: hojeStr, label: labels['tudo'], presetAtual: 'tudo' };
      }
      inicio.setUTCFullYear(inicio.getUTCFullYear() - 10); // fallback 10a
    }

    return { inicio: isoDate(inicio), fim: hojeStr, label: labels[preset] ?? 'Período custom', presetAtual: preset };
  }

  // Leitura paginada (teto de 1000 linhas do PostgREST) — ver paginacao.ts.
  private buscarGeracoesPaginado(montarConsulta: () => any): Promise<any[]> {
    return buscarPaginado(montarConsulta);
  }

  // Listagem pra dashboard. Inclui geracao do dia atual.
  // [Fase 2 A3] companyId = empresa do operador (tela por tenant); ausente =
  // todas (crons multi-tenant: alertas proativos, pós-instalação etc).
  async listarParaDashboard(companyId?: string | null): Promise<Array<SistemaCliente & {
    geracao_hoje_kwh: number | null;
    geracao_mes_kwh: number;
    geracao_7d_kwh: number;
  }>> {
    const sistemas = await this.listarSistemasAtivos(companyId);
    if (sistemas.length === 0) return [];

    // Calendário de Brasília (às 21h+ o UTC já é amanhã: "hoje" vazio e mês zerado).
    const agora = new Date();
    const hoje = hojeBrasilia(agora);
    const inicioMes = inicioMesBrasilia(agora);
    const ha7 = somarDias(hoje, -7);
    const desde = inicioMes < ha7 ? inicioMes : ha7;
    const ids = sistemas.map((s) => s.id);
    // Ordem fixa (sistema_id, data) pra paginação estável — sem ela as páginas
    // podem repetir/pular linhas entre uma chamada e outra.
    const geracoes = await this.buscarGeracoesPaginado(() => this.supabase.getClient()
      .from('geracao_diaria')
      .select('sistema_id, data, geracao_kwh')
      .in('sistema_id', ids)
      .gte('data', desde)
      .order('sistema_id', { ascending: true })
      .order('data', { ascending: true }));

    const porSistema = new Map<string, { hoje: number | null; mes: number; ult7: number }>();
    for (const sid of ids) porSistema.set(sid, { hoje: null, mes: 0, ult7: 0 });

    for (const g of geracoes ?? []) {
      const acc = porSistema.get(g.sistema_id);
      if (!acc) continue;
      const kwh = Number(g.geracao_kwh) || 0;
      if (g.data >= inicioMes) acc.mes += kwh;
      // 7d = exatamente 7 dias COMPLETOS [hoje-7, hoje). A janela antiga
      // (>= ha7, sem teto) somava 8 datas-calendário contra um esperado de 7
      // dias — fencepost. Hoje parcial fica só em geracao_hoje_kwh.
      if (g.data >= ha7 && g.data < hoje) acc.ult7 += kwh;
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
