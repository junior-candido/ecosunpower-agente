// src/modules/monitoring/proactive-alerts/dispatcher.ts
import type { SupabaseService } from '../../supabase.js';
import { registrarEvento } from '../../elo/eventos.js';
import { dentroDaJanela } from './janela.js';
import { formatAlertMessage } from './format.js';
import type { MonitoringAlertRow, AlertButton } from './types.js';

export interface DispatchCtx {
  supabase: SupabaseService;
  sendAdminWithButtons: (
    to: string,
    body: string,
    buttons: AlertButton[],
    footer?: string,
  ) => Promise<void>;
  adminPhone: string;
  dryRun?: boolean;
  // Eva Monitoramento Evolutivo (Task 8): alerta de tipo "cliente" com dono
  // vinculado tenta virar abordagem da Eva AO CLIENTE antes do alerta admin.
  // O wrapper (montado no index) recalcula diasOffline/percentualQueda reais
  // e chama o orquestrador. Campo opcional: sem ele o fluxo é 100% o atual.
  proporAbordagem?: (
    alerta: MonitoringAlertRow,
    sistema: { id: string; apelido: string; potencia_kwp: number | null; marca_inversor: string; lead_id: string | null; uf: string | null },
    lead: { id: string; name: string | null; phone: string },
  ) => Promise<'proposta' | 'enviada' | 'inelegivel'>;
  // Resumo diário (incremento 2): com dono + autonomia OFF, queda/milestone
  // NÃO viram mensagem individual — o resumo diário cobre (ação no painel).
  // Campo opcional: sem ele, comportamento 100% atual (compat).
  autonomiaOn?: (tipo: 'queda' | 'parabens') => Promise<boolean>;
  // ── POR EMPRESA (30/09/2026, caso Conquista Solar) ──────────────────────
  // O cron roda sem empresa no contexto: sem isto, alerta de usina de QUALQUER
  // empresa saía pro zap do dono da EcoSun, pelo WhatsApp da EcoSun.
  // Ambos opcionais: sem eles toda usina é tratada como da casa (compat).
  /** A usina é da casa (EcoSun / legado sem empresa)? */
  ehCasa?: (companyId: string | null | undefined) => boolean;
  /** Aviso admin de TENANT pela rota segura (canal-automatico.avisoAdmin):
   *  só pela instância própria da empresa, com a assistente contratada e sem
   *  pausa por cobrança; destino = admin DELA. Devolve 'enviado' ou o motivo
   *  do bloqueio (aí o alerta fica só no painel dela). */
  avisoAdminDaEmpresa?: (
    companyId: string | null | undefined,
    enviar: (destino: string) => Promise<void>,
  ) => Promise<string>;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

type Desfecho = 'enviado' | 'dry' | 'absorvido' | 'painel';

export async function runDispatchCycle(hoje: Date, ctx: DispatchCtx): Promise<{
  enviados: number; dryRunSimulados: number; janelaAberta: boolean;
  /** Alertas de empresa sem destino admin: ficaram só no painel dela. */
  soNoPainel: number;
}> {
  if (!dentroDaJanela(hoje)) {
    console.log('[proactive-alerts] dispatch: fora da janela, pulando');
    return { enviados: 0, dryRunSimulados: 0, janelaAberta: false, soNoPainel: 0 };
  }
  const fila = await ctx.supabase.getAlertasParaDespachar(hoje.toISOString(), 8) as MonitoringAlertRow[];

  let enviados = 0;
  let dryRunSimulados = 0;
  let soNoPainel = 0;
  for (const alerta of fila) {
    const nextSendAtOriginal = alerta.next_send_at!;
    const locked = await ctx.supabase.lockAlertaParaEnvio(alerta.id);
    if (!locked) continue;

    try {
      const sistema = await ctx.supabase.getSistemaById(alerta.sistema_id);
      if (!sistema) {
        await ctx.supabase.unlockAlerta(alerta.id, nextSendAtOriginal);
        continue;
      }
      const desfecho = await processarAlerta(alerta, sistema, hoje, ctx);
      if (desfecho === 'enviado') enviados++;
      else if (desfecho === 'dry') dryRunSimulados++;
      else if (desfecho === 'painel') soNoPainel++;
    } catch (err) {
      console.error('[proactive-alerts] dispatch falhou:', (err as Error).message);
      await ctx.supabase.unlockAlerta(alerta.id, nextSendAtOriginal);
    }
  }
  console.log(`[proactive-alerts] dispatch: ${enviados} enviados, ${dryRunSimulados} dry-run, ${soNoPainel} só no painel, ${fila.length - enviados - dryRunSimulados - soNoPainel} ficaram pendentes`);
  return { enviados, dryRunSimulados, janelaAberta: true, soNoPainel };
}

/** Um alerta. Casa = fluxo de sempre; tenant = só aviso admin pela rota segura. */
async function processarAlerta(
  alerta: MonitoringAlertRow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sistema: any,
  hoje: Date,
  ctx: DispatchCtx,
): Promise<Desfecho> {
  const lead = sistema.lead_id ? await ctx.supabase.getLeadById(sistema.lead_id) : null;
  const companyId = (sistema.company_id as string | null | undefined) ?? null;
  if (ctx.ehCasa && !ctx.ehCasa(companyId)) {
    return processarAlertaDeTenant(alerta, sistema, lead, companyId, hoje, ctx);
  }

  // Resumo diário: não-urgente em treino é absorvido (sem mensagem
  // individual). Offline/erro_integracao/órfã NUNCA passam por aqui.
  // etapa_obra === 'pos_venda' é obrigatório: o resumo só lista usinas do
  // pós-venda (listarClientesPosVenda) — em obra segue o fluxo atual
  // (proporAbordagem / alerta individual), senão a queda ficaria absorvida
  // pra sempre sem aparecer em lugar nenhum.
  if (ctx.autonomiaOn && lead && lead.phone && sistema.etapa_obra === 'pos_venda' &&
      (alerta.tipo === 'queda_geracao' || alerta.tipo === 'milestone_economia')) {
    const tipoFlag = alerta.tipo === 'queda_geracao' ? 'queda' : 'parabens';
    let auto = true; // erro na leitura da config → segue o fluxo atual (seguro)
    try { auto = await ctx.autonomiaOn(tipoFlag); } catch { auto = true; }
    if (!auto) {
      if (ctx.dryRun) {
        console.log(`[proactive-alerts] dispatch DRY: absorveria no resumo — alerta=${alerta.id} tipo=${alerta.tipo}`);
        await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString());
        return 'dry';
      }
      // Marco absorvido fica ABERTO com trava longa: resolver faria o detect
      // recriar o alerta toda hora (churn); aberto ele deduplica e não repinta
      // nada na tela (saúde ignora milestone). Queda mantém +3d (pinta o amarelo).
      const travaDias = alerta.tipo === 'milestone_economia' ? 30 : 3;
      await ctx.supabase.marcarAlertaAbsorvidoPorResumo(
        alerta.id, hoje.toISOString(), addDays(hoje, travaDias).toISOString());
      console.log(`[proactive-alerts] dispatch: absorvido pelo resumo — alerta=${alerta.id} tipo=${alerta.tipo}`);
      return 'absorvido';
    }
  }

  // Eva Monitoramento Evolutivo: alerta de tipo "cliente" com dono vinculado
  // tenta virar abordagem ao cliente. Inelegível → fluxo atual (alerta admin).
  // O orquestrador trata os próprios erros (devolve 'inelegivel') — nada
  // aqui muda o caminho de alertas erro_integracao/órfãs.
  if (ctx.proporAbordagem && lead && lead.phone &&
      (alerta.tipo === 'sistema_offline' || alerta.tipo === 'queda_geracao' || alerta.tipo === 'milestone_economia')) {
    // Dry-run fiel à spec ("simula e loga, NÃO envia — igual alertas
    // atuais"): NADA de abordagem é criado/mandado — nem pro admin.
    // Mesmo padrão do dry-run de alerta admin logo abaixo.
    if (ctx.dryRun) {
      console.log(`[proactive-alerts] dispatch DRY: abordaria cliente — alerta=${alerta.id} sistema=${alerta.sistema_id} tipo=${alerta.tipo}`);
      await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString()); // simula throttle 3d
      return 'dry';
    }
    const resultado = await ctx.proporAbordagem(alerta, sistema, lead);
    if (resultado !== 'inelegivel') {
      // O alerta foi absorvido pelo motor de abordagem — não compete por 30d.
      await ctx.supabase.marcarAlertaEnviado(alerta.id, hoje.toISOString(), addDays(hoje, 30).toISOString());
      return 'enviado';
    }
    // inelegível → segue pro alerta admin normal abaixo
  }

  const { texto, botoes, footer } = formatAlertMessage(alerta, sistema, lead);

  if (ctx.dryRun) {
    console.log(`[proactive-alerts] dispatch DRY: alerta=${alerta.id} sistema=${alerta.sistema_id} tipo=${alerta.tipo}`);
    await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString()); // simula throttle 3d
    return 'dry';
  }

  await ctx.sendAdminWithButtons(ctx.adminPhone, texto, botoes, footer);
  await ctx.supabase.marcarAlertaEnviado(
    alerta.id,
    hoje.toISOString(),
    addDays(hoje, 3).toISOString(),
  );
  // Elo: registra o disparo do alerta de usina/inversor na espinha de
  // eventos. Best-effort — só ADICIONA o registro, nunca muda o fluxo do
  // dispatch (registrarEvento não lança; o getClient é protegido).
  try {
    await registrarEvento(ctx.supabase.getClient?.(), {
      tipo: 'operacao:alerta_usina',
      departamento: 'operacao',
      canal: 'sistema',
      origem: 'monitoramento',
      clienteId: sistema.lead_id ?? null,
      payload: {
        marca: sistema.marca_inversor ?? null,
        usinaId: alerta.sistema_id,
        tipoAlerta: alerta.tipo,
        mensagem: texto,
      },
    });
  } catch { /* best-effort: registro de evento nunca derruba o dispatch */ }
  return 'enviado';
}

/**
 * Alerta de usina de OUTRA empresa (tenant). Sem abordagem automática ao
 * cliente (o motor sai pelo WABA da casa) e sem absorção no resumo diário (é só
 * da casa — o alerta sumiria): vira aviso admin DELA, pela rota segura. Sem
 * canal/admin/contrato → não manda nada e o alerta fica no painel, com a mesma
 * trava de 3 dias pra não voltar à fila a cada ciclo. Sem botões: o handler de
 * botão só aceita admin da casa (o tenant receberia "responda: evabt:…" inútil).
 */
async function processarAlertaDeTenant(
  alerta: MonitoringAlertRow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sistema: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lead: any,
  companyId: string | null,
  hoje: Date,
  ctx: DispatchCtx,
): Promise<Desfecho> {
  const { texto, footer } = formatAlertMessage(alerta, sistema, lead);
  if (ctx.dryRun) {
    console.log(`[proactive-alerts] dispatch DRY: avisaria admin da empresa ${companyId} — alerta=${alerta.id} tipo=${alerta.tipo}`);
    await ctx.supabase.unlockAlerta(alerta.id, addDays(hoje, 3).toISOString());
    return 'dry';
  }
  const resultado = ctx.avisoAdminDaEmpresa
    ? await ctx.avisoAdminDaEmpresa(companyId, (destino) => ctx.sendAdminWithButtons(destino, texto, [], footer))
    : 'sem_rota';
  await ctx.supabase.marcarAlertaEnviado(alerta.id, hoje.toISOString(), addDays(hoje, 3).toISOString());
  if (resultado === 'enviado') return 'enviado';
  console.log(`[proactive-alerts] dispatch: alerta=${alerta.id} da empresa ${companyId} NAO avisado (${resultado}) — fica só no painel`);
  return 'painel';
}
