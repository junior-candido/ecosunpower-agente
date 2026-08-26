// src/modules/monitoring/detectar-medidor.ts
// Regra R1 (automático): lead em `instalado` (ou contrato_assinado) cuja usina
// cadastrada no monitoramento registrou geração real por N dias seguidos →
// marca `medidor_trocado` (+ medidor_detectado_auto) e avisa o Junior.
// Hoymiles/Deye sem adapter continuam manuais.
export const DIAS_GERANDO = 3;
export const KWH_MINIMO_DIA = 1; // abaixo disso é ruído/teste do instalador

export interface LeadComUsina {
  leadId: string;
  nome: string | null;
  sistemaId: string;
  apelido: string | null;
}

export interface DetectarMedidorDb {
  /** Leads ainda sem medidor_trocado que têm usina ativa no monitoramento. */
  listarLeadsAguardandoMedidor(): Promise<LeadComUsina[]>;
  /** kWh/dia dos últimos `dias` dias FECHADOS (ontem para trás), em ordem cronológica; dia sem linha = 0. */
  geracaoUltimosDias(sistemaId: string, dias: number, agora: Date): Promise<number[]>;
  marcarMedidorTrocado(leadId: string, agoraIso: string): Promise<void>;
}

export interface DetectarMedidorCtx {
  db: DetectarMedidorDb;
  /** chamado após marcar (agenda toques pós-instalação, avisa Junior, etc.) */
  onMarcado?: (lead: LeadComUsina, kwhDias: number[]) => Promise<void>;
  agora?: () => Date;
}

export function gerouDiasSeguidos(kwhDias: ReadonlyArray<number>, dias = DIAS_GERANDO, minimo = KWH_MINIMO_DIA): boolean {
  if (kwhDias.length < dias) return false;
  return kwhDias.slice(-dias).every((k) => Number.isFinite(k) && k >= minimo);
}

export async function tickDetectarMedidor(ctx: DetectarMedidorCtx): Promise<{ marcados: string[] }> {
  const agora = (ctx.agora ?? (() => new Date()))();
  const leads = await ctx.db.listarLeadsAguardandoMedidor();
  const marcados: string[] = [];
  for (const l of leads) {
    try {
      const kwh = await ctx.db.geracaoUltimosDias(l.sistemaId, DIAS_GERANDO, agora);
      if (!gerouDiasSeguidos(kwh)) continue;
      await ctx.db.marcarMedidorTrocado(l.leadId, agora.toISOString());
      marcados.push(l.leadId);
      if (ctx.onMarcado) await ctx.onMarcado(l, kwh);
    } catch (err) {
      console.error('[detectar-medidor] falha no lead', l.leadId, (err as Error).message);
    }
  }
  if (marcados.length > 0) console.log(`[detectar-medidor] marcou medidor_trocado em ${marcados.length} lead(s)`);
  return { marcados };
}

export function textoAvisoMedidor(lead: LeadComUsina, kwh: ReadonlyArray<number>): string {
  const soma = kwh.reduce((a, b) => a + b, 0);
  return `⚡ *${lead.nome ?? 'Cliente'}*: a usina ${lead.apelido ? `"${lead.apelido}" ` : ''}está gerando há ${kwh.length} dias ` +
    `(${soma.toFixed(0)} kWh) — marquei *medidor trocado* automaticamente.\n\n` +
    `Se a pasta digital já estiver publicada, o aviso pra enviar chega em seguida.`;
}

function isoDia(d: Date): string { return d.toISOString().slice(0, 10); }

/** Implementação real (supabase-js). */
export function criarDetectarMedidorDb(client: any): DetectarMedidorDb {
  return {
    async listarLeadsAguardandoMedidor() {
      const { data, error } = await client
        .from('sistemas_clientes')
        // Só `instalado` (a pasta publicada já move pra cá — R4). `contrato_assinado`
        // pegaria cliente de SERVIÇO (limpeza/O&M) com usina antiga gerando e
        // marcaria medidor trocado errado. Quem já tem meter_swapped_at fica de fora.
        .select('id, apelido, lead_id, leads!inner(id, name, installation_status, meter_swapped_at)')
        .eq('ativo', true)
        .not('lead_id', 'is', null)
        .eq('leads.installation_status', 'instalado')
        .is('leads.meter_swapped_at', null)
        .limit(200);
      if (error) { console.warn('[detectar-medidor] listar:', error.message); return []; }
      const vistos = new Set<string>();
      const out: LeadComUsina[] = [];
      for (const r of (data ?? []) as any[]) {
        if (vistos.has(r.lead_id)) continue;
        vistos.add(r.lead_id);
        out.push({ leadId: r.lead_id, nome: r.leads?.name ?? null, sistemaId: r.id, apelido: r.apelido ?? null });
      }
      return out;
    },
    async geracaoUltimosDias(sistemaId, dias, agora) {
      // `geracao_diaria.data` é data LOCAL (BRT) dos portais — calcula "ontem" em BRT.
      const agoraBrt = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
      const fim = new Date(agoraBrt.getTime() - 24 * 60 * 60 * 1000);            // ontem (BRT)
      const ini = new Date(fim.getTime() - (dias - 1) * 24 * 60 * 60 * 1000);
      const { data, error } = await client
        .from('geracao_diaria')
        .select('data, geracao_kwh')
        .eq('sistema_id', sistemaId)
        .gte('data', isoDia(ini)).lte('data', isoDia(fim));
      if (error) { console.warn('[detectar-medidor] geracao:', error.message); return []; }
      const porDia = new Map<string, number>();
      for (const g of (data ?? []) as any[]) porDia.set(String(g.data).slice(0, 10), Number(g.geracao_kwh) || 0);
      const out: number[] = [];
      for (let i = 0; i < dias; i++) {
        const d = new Date(ini.getTime() + i * 24 * 60 * 60 * 1000);
        out.push(porDia.get(isoDia(d)) ?? 0);
      }
      return out;
    },
    async marcarMedidorTrocado(leadId, agoraIso) {
      await client.from('leads').update({
        installation_status: 'medidor_trocado', meter_swapped_at: agoraIso,
        medidor_detectado_auto: true, updated_at: agoraIso,
      }).eq('id', leadId);
    },
  };
}
