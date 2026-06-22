// src/modules/closing/closing-data-fetcher.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento, Concessionaria, UF, PessoaFisica, Endereco, Modalidade } from './types.js';

// A proposta salva modalidade como texto humano ("Autoconsumo local", "remoto",
// "compartilhada") — não o enum. Normaliza pro enum do fechamento (cobre também
// o formato legado que já vinha como enum). Default seguro = autoconsumo_local.
export function normalizarModalidade(raw: unknown): Modalidade {
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('remoto')) return 'autoconsumo_remoto';
  if (s.includes('compartilhad')) return 'geracao_compartilhada';
  return 'autoconsumo_local';
}

export interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  data_nascimento: string | null;
  estado_civil: string | null;
  cep: string | null;
  endereco_rua: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  uf: string | null;
  concessionaria: string | null;
  uc_numero: string | null;
  forma_pagamento: string | null;
}

export interface PropostaPublicaRow {
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  // A proposta salva em camelCase (ver montarDadosInputCompleto / ProposalData):
  // potenciaKwp, valorTotalRs, investimento.total, modulo.fabricante/potenciaW, inversor.*.
  // As chaves snake_case ficam como fallback de compatibilidade (formato legado).
  dados_input: {
    // formato REAL (camelCase)
    potenciaKwp?: number;
    valorTotalRs?: number;
    investimento?: { total?: number };
    modulo?: { fabricante?: string; modelo?: string; potenciaW?: number; quantidade?: number };
    // formato legado (snake_case) + campos compartilhados
    modalidade?: string;
    potencia_kwp?: number;
    modulos?: { marca?: string; potencia_w?: number; quantidade?: number };
    inversor?: { marca?: string; fabricante?: string; modelo?: string; potencia_kw?: number; potenciaW?: number; quantidade?: number };
    valor_total?: number;
  } | null;
  created_at: string;
}

export interface FetchResult {
  lead: LeadRow | null;
  proposta: PropostaPublicaRow | null;
}

export async function fetchByLeadId(sb: SupabaseClient, leadId: string): Promise<FetchResult> {
  const leadRes = await sb.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (leadRes.error) throw leadRes.error;
  const lead = leadRes.data as LeadRow | null;
  if (!lead) return { lead: null, proposta: null };

  const propRes = await sb
    .from('propostas_publicas')
    .select('*')
    .or(`cliente_telefone.eq.${lead.phone},cliente_nome.ilike.%${lead.name}%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (propRes.error) throw propRes.error;
  return { lead, proposta: (propRes.data as PropostaPublicaRow | null) ?? null };
}

// Normaliza nome pra comparar SEM acento/maiúscula ("Márcio" ~ "marcio").
export function normalizarNomeBusca(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export async function searchLeadByName(sb: SupabaseClient, term: string): Promise<LeadRow[]> {
  // 1) ilike direto (rápido). NÃO exclui mais 'transferido': /fechar/contrato é
  // justamente pra quem virou cliente. Só exclui 'inativo' (lixo).
  const direct = await sb
    .from('leads')
    .select('*')
    .ilike('name', `%${term}%`)
    .not('status', 'in', '(inativo)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (direct.error) throw direct.error;
  const rows = (direct.data as LeadRow[]) ?? [];
  if (rows.length > 0) return rows;

  // 2) fallback IGNORANDO ACENTO: o ilike é sensível a acento ("Marcio" não acha
  // "Márcio"). Busca um lote recente e filtra no JS por nome normalizado.
  const termN = normalizarNomeBusca(term);
  if (!termN) return [];
  const recent = await sb
    .from('leads')
    .select('*')
    .not('status', 'in', '(inativo)')
    .order('created_at', { ascending: false })
    .limit(400);
  if (recent.error) throw recent.error;
  return ((recent.data as LeadRow[]) ?? [])
    .filter((l) => l.name && normalizarNomeBusca(l.name).includes(termN))
    .slice(0, 10);
}

function inferConcessionaria(uf: string | null): Concessionaria | undefined {
  if (uf === 'DF') return 'Neoenergia-DF';
  if (uf === 'GO') return 'Equatorial-GO';
  return undefined;
}

function buildEndereco(lead: LeadRow): Partial<Endereco> {
  return {
    rua: lead.endereco_rua ?? undefined,
    numero: lead.endereco_numero ?? undefined,
    complemento: lead.endereco_complemento ?? undefined,
    uf: (lead.uf as UF) ?? undefined,
    cep: lead.cep ?? undefined,
  } as Partial<Endereco>;
}

export function buildInitialData(
  lead: LeadRow,
  proposta: PropostaPublicaRow | null,
): Partial<DadosFechamento> {
  const endereco = buildEndereco(lead);

  const titular_uc: Partial<PessoaFisica> = {
    tipo: 'PF',
    nome: lead.name,
    cpf: lead.cpf_cnpj ?? undefined,
    estado_civil: lead.estado_civil ?? undefined,
    data_nascimento: lead.data_nascimento ?? undefined,
    nacionalidade: 'Brasileiro(a)',
    endereco: endereco as Endereco,
    telefone: lead.phone ?? undefined,
    email: lead.email ?? undefined,
  };

  const partial: Partial<DadosFechamento> = {
    titular_uc: titular_uc as any,
    contratante: titular_uc as any,
    contratante_eh_titular: true,
    uc_numero: lead.uc_numero ?? undefined,
    concessionaria: (lead.concessionaria as Concessionaria) ?? inferConcessionaria(lead.uf),
    endereco_instalacao: endereco as Endereco,
  };

  if (proposta?.dados_input) {
    const d = proposta.dados_input;
    // Lê o formato REAL salvo pela proposta (camelCase) com fallback pro legado (snake_case).
    const kwp = d.potenciaKwp ?? d.potencia_kwp;
    if (kwp != null) {
      const mod = (d.modulo ?? d.modulos) as
        { fabricante?: string; marca?: string; potenciaW?: number; potencia_w?: number; quantidade?: number } | undefined;
      const inv = d.inversor;
      // inversor: a proposta guarda potenciaW (W); o fechamento usa potencia_kw (kW).
      const invPotenciaKw = inv?.potencia_kw ?? (inv?.potenciaW != null ? inv.potenciaW / 1000 : 0);
      partial.sistema = {
        kwp,
        modalidade: normalizarModalidade(d.modalidade),
        modulos: {
          marca: mod?.fabricante ?? mod?.marca ?? '',
          potencia_w: mod?.potenciaW ?? mod?.potencia_w ?? 0,
          quantidade: mod?.quantidade ?? 0,
        },
        inversor: {
          marca: inv?.fabricante ?? inv?.marca ?? '',
          modelo: inv?.modelo ?? '',
          potencia_kw: invPotenciaKw,
          quantidade: inv?.quantidade,
        },
      };
    }
    const valorTotal = d.valorTotalRs ?? d.investimento?.total ?? d.valor_total;
    if (valorTotal != null) {
      partial.comercial = {
        valor_total_brl: valorTotal,
        forma_pagamento: lead.forma_pagamento ?? '',
      };
    }
  }

  return partial;
}
