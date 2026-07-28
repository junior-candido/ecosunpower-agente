// src/modules/dashboard/pos-venda-queries.ts
// Junta lead + usina + saúde + relacionamento pra a tela de pós-venda.
// I/O (sem teste unitário, igual às outras *-queries.ts) — validado por tsc + smoke.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  saudeUsina, elegivelUpgrade, proximaAcaoPosVenda, ordenarPorAtencao,
  type Saude, type ProximaAcao,
} from './pos-venda-saude.js';
import { agruparAgenda, type AgendaAgrupada, type TarefaAgenda } from './pos-venda-agenda.js';
import { tiposSnoozed } from './pos-venda-sugestao-memoria.js';
import { buscarPaginado } from '../monitoring/paginacao.js';

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
  elegivelUpgrade: boolean;
  gerouBem: boolean;
  ultimoContatoPositivoEm: string | null;
  snoozedTipos: Set<string>;
  semApi: boolean;
  proximaAcao: ProximaAcao;
}

// Usina sem integração de monitoramento: acompanhamento manual ou sem credencial.
export function semApiUsina(s: { acompanhamento?: string | null; api_credentials?: any }): boolean {
  if (s.acompanhamento === 'manual') return true;
  const cred = s.api_credentials;
  return !cred || (typeof cred === 'object' && Object.keys(cred).length === 0);
}

const diasAtras = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
// kWh/mês por kWp (média Brasil) — só pra ACENDER o sinal de upgrade, nunca
// mostrado ao cliente. Isolado aqui: se o Junior tiver número melhor, troca-se só esta linha.
const KWH_MES_POR_KWP = 120;
// "Gerou bem" = atingiu ao menos 85% do esperado no mês. Não exige recorde:
// usina saudável (inclusive no inverno, que rende menos) já dispara a boa notícia.
const FATOR_GEROU_BEM = 0.85;

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

  // 3b) alertas do MONITORAMENTO (monitoring_alerts) — a fonte viva: queda/
  // offline detectados pelos adapters moram aqui, não em alertas_sistema.
  // Sem isso a saúde da tela não pinta e a queda some do resumo diário.
  const { data: monAlertas, error: e3b } = await client.from('monitoring_alerts')
    .select('sistema_id, tipo, severidade')
    .in('sistema_id', sistemaIds).is('resolved_at', null);
  if (e3b) throw new Error(`listarClientesPosVenda/monitoring_alerts: ${e3b.message}`);
  for (const a of (monAlertas ?? []) as any[]) {
    const arr = alertasPorSistema.get(a.sistema_id) ?? [];
    arr.push({ tipo: a.tipo, severidade: a.severidade ?? '' });
    alertasPorSistema.set(a.sistema_id, arr);
  }

  // 4) geração recente (30d) por sistema — PAGINADO: frota inteira × 30 dias
  // passa do teto de 1000 linhas do PostgREST e vinha truncado (usina cortada
  // aparecia como "sem gerar" na saúde da tela; mesma causa raiz do #161).
  const geracaoData = await buscarPaginado(() => client.from('geracao_diaria')
    .select('sistema_id, data, geracao_kwh')
    .in('sistema_id', sistemaIds).gte('data', diasAtras(30))
    .order('sistema_id', { ascending: true }).order('data', { ascending: true }));
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
  // Último "contato positivo" (boa notícia / celebração) por lead. No vocabulário
  // real de monitoring_abordagens os tipos positivos são a família milestone
  // 'parabens'/'depoimento' (não existe tipo 'relatorio' na tabela). Serve pra não
  // mandar de novo a boa notícia "usina foi bem" logo depois de já ter celebrado.
  const contatoPositivo = new Map<string, string>();
  for (const a of (abData ?? []) as any[]) {
    if (!ultimoContato.has(a.lead_id)) ultimoContato.set(a.lead_id, a.enviada_em);
    if (a.tipo === 'depoimento') teveDepoimento.add(a.lead_id);
    if (a.tipo === 'parabens' || a.tipo === 'depoimento') {
      const cur = contatoPositivo.get(a.lead_id);
      if (!cur || a.enviada_em > cur) contatoPositivo.set(a.lead_id, a.enviada_em);
    }
  }

  // 6) memória de sugestão: que tipos estão "em descanso" (snooze) por lead —
  // pra não repetir uma dica que o operador acabou de mandar ou dispensou.
  const memoriaRows = await client.from('pos_venda_sugestao_memoria')
    .select('lead_id, tipo, snoozed_until').in('lead_id', leadIds)
    .then((r) => (r.error ? [] : (r.data ?? [])) as Array<{ lead_id: string; tipo: string; snoozed_until: string | null }>);
  const agoraDate = new Date();
  const snoozadosPorLead = new Map<string, Set<string>>();
  for (const id of leadIds) {
    snoozadosPorLead.set(id, tiposSnoozed(memoriaRows.filter((r) => r.lead_id === id), agoraDate));
  }

  const hoje = new Date();
  const linhas: PosVendaLinha[] = [];
  for (const s of sis) {
    const lead = leads.get(s.lead_id);
    if (!lead) continue; // lead de outra company → fora (multi-tenant)
    const geracoes = geracaoPorSistema.get(s.id) ?? [];
    const saude = saudeUsina(alertasPorSistema.get(s.id) ?? [], geracoes);
    const jaTeve = teveDepoimento.has(s.lead_id);
    const potencia = s.potencia_kwp != null ? Number(s.potencia_kwp) : null;
    // gerouBem: comparo a geração real do período (~30d) com a estimativa do mês
    // (potência × KWH_MES_POR_KWP), que ESTÁ acessível aqui. Só uso a comparação
    // real quando tenho potência e ao menos um dia de geração; senão caio no proxy
    // (saúde verde + gerou algo) — nunca cravo "foi bem" sem dado real.
    const somaRealPeriodo = geracoes.reduce((acc, g) => acc + (g.geracao_kwh || 0), 0);
    const gerouBem = (potencia && geracoes.length > 0)
      ? somaRealPeriodo >= potencia * KWH_MES_POR_KWP * FATOR_GEROU_BEM
      : saude === 'verde' && somaRealPeriodo > 0;
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
      elegivelUpgrade: elegivel,
      gerouBem,
      ultimoContatoPositivoEm: contatoPositivo.get(s.lead_id) ?? null,
      snoozedTipos: snoozadosPorLead.get(s.lead_id) ?? new Set<string>(),
      semApi: semApiUsina(s),
      proximaAcao: proximaAcaoPosVenda(
        { saude, dataInstalacao: s.data_instalacao, ultimoContatoEm: contato, jaTeveDepoimento: jaTeve, elegivelUpgrade: elegivel },
        hoje,
      ),
    });
  }
  return ordenarPorAtencao(linhas);
}

// Tarefas pendentes (lembretes) dos clientes que estão no pós-venda, agrupadas
// pra agenda lateral. Reusa lead_tarefas. Multi-tenant: só leads da company.
export async function listarAgendaPosVenda(client: SupabaseClient, companyId: string): Promise<AgendaAgrupada> {
  // 1) leads no pós-venda (mesma regra dura da lista): usina ativa em etapa_obra='pos_venda'
  const { data: sistemas } = await client.from('sistemas_clientes')
    .select('lead_id').eq('ativo', true).not('lead_id', 'is', null).eq('etapa_obra', 'pos_venda');
  const leadIds = [...new Set((sistemas ?? []).map((s: any) => s.lead_id))];
  if (leadIds.length === 0) return { atrasados: [], hoje: [], semana: [] };

  // 2) nomes (e filtro de company aqui)
  const { data: leadsData } = await client.from('leads')
    .select('id, name').in('id', leadIds).eq('company_id', companyId);
  const nomes = new Map((leadsData ?? []).map((l: any) => [l.id, l.name as string | null]));
  const idsDaCompany = [...nomes.keys()];
  if (idsDaCompany.length === 0) return { atrasados: [], hoje: [], semana: [] };

  // 3) tarefas pendentes desses leads
  const { data: tarefasData } = await client.from('lead_tarefas')
    .select('id, lead_id, titulo, due_at')
    .in('lead_id', idsDaCompany).eq('status', 'pendente');
  const tarefas: TarefaAgenda[] = (tarefasData ?? []).map((t: any) => ({
    id: t.id, leadId: t.lead_id, titulo: t.titulo,
    nomeCliente: nomes.get(t.lead_id) ?? 'Cliente', dueAt: t.due_at ?? null,
  }));
  return agruparAgenda(tarefas, new Date());
}
