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
  // O cron roda sem empresa no contexto → sem estes ganchos, alerta de usina
  // de QUALQUER empresa saía pro zap do dono da EcoSun pelo WhatsApp da EcoSun.
  // Todos opcionais: sem eles o comportamento é o de sempre (compat/testes).
  /** Roda o processamento do alerta no contexto da empresa dona da usina
   *  (canal de WhatsApp, travas LGPD e destino passam a ser os dela). */
  rodarNaEmpresa?: <T>(companyId: string | null, fn: () => Promise<T>) => Promise<T>;
  /** Pra quem vai o aviso admin, resolvido DENTRO do contexto da empresa.
   *  null = empresa sem destino configurado → não manda (fica só no painel). */
  destinoAdmin?: () => string | null;
  /** true = empresa sem abordagem automática ao cliente nem resumo diário da
   *  casa: o alerta vira só aviso admin (nunca é absorvido e some). */
  somenteAvisoAdmin?: () => boolean;
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
      const processar = () => processarAlerta(alerta, sistema, hoje, ctx);
      const desfecho = ctx.rodarNaEmpresa
        ? await ctx.rodarNaEmpresa((sistema.company_id as string | null | undefined) ?? null, processar)
        : await processar();
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

/** Um alerta, já no contexto da empresa dona da usina (quando o gancho existe). */
async function processarAlerta(
  alerta: MonitoringAlertRow,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sistema: any,
  hoje: Date,
  ctx: DispatchCtx,
): Promise<Desfecho> {
  const lead = sistema.lead_id ? await ctx.supabase.getLeadById(sistema.lead_id) : null;
  // Empresa sem abordagem/resumo próprios: nada de absorver nem abordar — o
  // alerta segue direto pro aviso admin DELA (senão sumiria no resumo da casa).
  const soAdmin = ctx.somenteAvisoAdmin?.() === true;

  // Resumo diário: não-urgente em treino é absorvido (sem mensagem
  // individual). Offline/erro_integracao/órfã NUNCA passam por aqui.
  // etapa_obra === 'pos_venda' é obrigatório: o resumo só lista usinas do
  // pós-venda (listarClientesPosVenda) — em obra segue o fluxo atual
  // (proporAbordagem / alerta individual), senão a queda ficaria absorvida
  // pra sempre sem aparecer em lugar nenhum.
  if (!soAdmin && ctx.autonomiaOn && lead && lead.phone && sistema.etapa_obra === 'pos_venda' &&
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
  if (!soAdmin && ctx.proporAbordagem && lead && lead.phone &&
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

  // Destino resolvido NO CONTEXTO da empresa: EcoSun → dono; empresa com
  // telefone_admin → ele; sem destino → não manda (falha fechada) e o alerta
  // fica no painel dela, com a mesma trava de 3 dias pra não voltar à fila.
  const destino = ctx.destinoAdmin ? ctx.destinoAdmin() : ctx.adminPhone;
  if (!destino) {
    await ctx.supabase.marcarAlertaEnviado(alerta.id, hoje.toISOString(), addDays(hoje, 3).toISOString());
    console.log(`[proactive-alerts] dispatch: empresa sem destino admin — alerta=${alerta.id} fica só no painel`);
    return 'painel';
  }

  await ctx.sendAdminWithButtons(destino, texto, botoes, footer);
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
