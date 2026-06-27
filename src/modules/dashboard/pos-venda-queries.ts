// src/modules/dashboard/pos-venda-queries.ts
// Junta lead + usina + saúde + relacionamento pra a tela de pós-venda.
// I/O (sem teste unitário, igual às outras *-queries.ts) — validado por tsc + smoke.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  saudeUsina, elegivelUpgrade, proximaAcaoPosVenda, ordenarPorAtencao,
  type Saude, type ProximaAcao,
} from './pos-venda-saude.js';

export interface PosVendaLinha {
  leadId: string;
  sistemaId: string;
  nome: string;
  telefone: string | null;
  cidade: string | null;
  potenciaKwp: number | null;
  marcaInversor: string | null;
  dataInstalacao: string | null;
  saude: Saude;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
  semApi: boolean;
  proximaAcao: ProximaAcao;
}

// Usina sem integração de monitoramento: acompanhamento manual ou sem credencial.
function semApiUsina(s: { acompanhamento?: string | null; api_credentials?: any }): boolean {
  if (s.acompanhamento === 'manual') return true;
  const cred = s.api_credentials;
  return !cred || (typeof cred === 'object' && Object.keys(cred).length === 0);
}

const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
// kWh/mês por kWp (média Brasil) — só pra ACENDER o sinal de upgrade, nunca
// mostrado ao cliente. Isolado aqui: se o Junior tiver número melhor, troca-se só esta linha.
const KWH_MES_POR_KWP = 120;

export async function listarClientesPosVenda(client: SupabaseClient, companyId: string): Promise<PosVendaLinha[]> {
  // 1) usinas NO PÓS-VENDA (etapa_obra = 'pos_venda') com lead vinculado.
  // REGRA DURA: usina nunca em dois lugares. Quem está em etapa de obra
  // (projeto..operacao) aparece SÓ no kanban; só quem está em 'pos_venda'
  // aparece aqui. Filtrar só por lead_id duplicava (usina em operação com
  // cliente aparecia no kanban E no pós-venda).
  const { data: sistemas, error: e1 } = await client.from('sistemas_clientes')
    .select('id, lead_id, apelido, marca_inversor, potencia_kwp, data_instalacao, cidade, acompanhamento, api_credentials, ativo')
    .eq('ativo', true).not('lead_id', 'is', null).eq('etapa_obra', 'pos_venda');
  if (e1) throw new Error(`listarClientesPosVenda/sistemas: ${e1.message}`);
  const sis = (sistemas ?? []) as Array<Record<string, any>>;
  if (sis.length === 0) return [];

  const leadIds = [...new Set(sis.map((s) => s.lead_id))];
  const sistemaIds = sis.map((s) => s.id);

  // 2) leads da company (nome/telefone/consumo) — o filtro de company mora aqui
  const { data: leadsData, error: e2 } = await client.from('leads')
    .select('id, name, phone, consumo_medio_kwh, company_id')
    .in('id', leadIds).eq('company_id', companyId);
  if (e2) throw new Error(`listarClientesPosVenda/leads: ${e2.message}`);
  const leads = new Map((leadsData ?? []).map((l: any) => [l.id, l]));

  // 3) alertas abertos por sistema
  const { data: alertasData, error: e3 } = await client.from('alertas_sistema')
    .select('sistema_id, tipo, severidade')
    .in('sistema_id', sistemaIds).is('resolved_at', null);
  if (e3) throw new Error(`listarClientesPosVenda/alertas: ${e3.message}`);
  const alertasPorSistema = new Map<string, Array<{ tipo: string; severidade: string }>>();
  for (const a of (alertasData ?? []) as any[]) {
    const arr = alertasPorSistema.get(a.sistema_id) ?? [];
    arr.push({ tipo: a.tipo, severidade: a.severidade });
    alertasPorSistema.set(a.sistema_id, arr);
  }

  // 4) geração recente (30d) por sistema
  const { data: geracaoData, error: e4 } = await client.from('geracao_diaria')
    .select('sistema_id, data, geracao_kwh')
    .in('sistema_id', sistemaIds).gte('data', diasAtras(30));
  if (e4) throw new Error(`listarClientesPosVenda/geracao: ${e4.message}`);
  const geracaoPorSistema = new Map<string, Array<{ data: string; geracao_kwh: number }>>();
  for (const g of (geracaoData ?? []) as any[]) {
    const arr = geracaoPorSistema.get(g.sistema_id) ?? [];
    arr.push({ data: g.data, geracao_kwh: Number(g.geracao_kwh) });
    geracaoPorSistema.set(g.sistema_id, arr);
  }

  // 5) última abordagem enviada + se já teve depoimento, por lead
  const { data: abData, error: e5 } = await client.from('monitoring_abordagens')
    .select('lead_id, tipo, enviada_em')
    .in('lead_id', leadIds).not('enviada_em', 'is', null)
    .order('enviada_em', { ascending: false });
  if (e5) throw new Error(`listarClientesPosVenda/abordagens: ${e5.message}`);
  const ultimoContato = new Map<string, string>();
  const teveDepoimento = new Set<string>();
  for (const a of (abData ?? []) as any[]) {
    if (!ultimoContato.has(a.lead_id)) ultimoContato.set(a.lead_id, a.enviada_em);
    if (a.tipo === 'depoimento') teveDepoimento.add(a.lead_id);
  }

  const hoje = new Date();
  const linhas: PosVendaLinha[] = [];
  for (const s of sis) {
    const lead = leads.get(s.lead_id);
    if (!lead) continue; // lead de outra company → fora (multi-tenant)
    const saude = saudeUsina(alertasPorSistema.get(s.id) ?? [], geracaoPorSistema.get(s.id) ?? []);
    const jaTeve = teveDepoimento.has(s.lead_id);
    const potencia = s.potencia_kwp != null ? Number(s.potencia_kwp) : null;
    const elegivel = elegivelUpgrade(
      { potenciaKwp: potencia, dataInstalacao: s.data_instalacao, geracaoEstimadaKwhMes: potencia ? potencia * KWH_MES_POR_KWP : null },
      { consumoMedioKwh: lead.consumo_medio_kwh != null ? Number(lead.consumo_medio_kwh) : null },
    );
    const contato = ultimoContato.get(s.lead_id) ?? null;
    linhas.push({
      leadId: s.lead_id, sistemaId: s.id,
      nome: lead.name ?? s.apelido ?? 'Cliente',
      telefone: lead.phone ?? null, cidade: s.cidade ?? null,
      potenciaKwp: potencia, marcaInversor: s.marca_inversor ?? null,
      dataInstalacao: s.data_instalacao ?? null,
      saude, ultimoContatoEm: contato, jaTeveDepoimento: jaTeve,
      semApi: semApiUsina(s),
      proximaAcao: proximaAcaoPosVenda(
        { saude, dataInstalacao: s.data_instalacao, ultimoContatoEm: contato, jaTeveDepoimento: jaTeve, elegivelUpgrade: elegivel },
        hoje,
      ),
    });
  }
  return ordenarPorAtencao(linhas);
}
