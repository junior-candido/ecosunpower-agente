// src/modules/closing/closing-data-fetcher.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento, Concessionaria, UF, PessoaFisica, Endereco } from './types.js';

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
  dados_input: {
    potencia_kwp?: number;
    modalidade?: string;
    modulos?: { marca?: string; potencia_w?: number; quantidade?: number };
    inversor?: { marca?: string; modelo?: string; potencia_kw?: number };
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

export async function searchLeadByName(sb: SupabaseClient, term: string): Promise<LeadRow[]> {
  // Exclui leads em status terminal (já fechados ou perdidos) — não faz sentido
  // /fechar quem já virou cliente.
  const res = await sb
    .from('leads')
    .select('*')
    .ilike('name', `%${term}%`)
    .not('status', 'in', '(transferido,inativo)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (res.error) throw res.error;
  return (res.data as LeadRow[]) ?? [];
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
    if (d.potencia_kwp != null) {
      partial.sistema = {
        kwp: d.potencia_kwp,
        modalidade: (d.modalidade as any) ?? 'autoconsumo_local',
        modulos: {
          marca: d.modulos?.marca ?? '',
          potencia_w: d.modulos?.potencia_w ?? 0,
          quantidade: d.modulos?.quantidade ?? 0,
        },
        inversor: {
          marca: d.inversor?.marca ?? '',
          modelo: d.inversor?.modelo ?? '',
          potencia_kw: d.inversor?.potencia_kw ?? 0,
        },
      };
    }
    if (d.valor_total != null) {
      partial.comercial = {
        valor_total_brl: d.valor_total,
        forma_pagamento: lead.forma_pagamento ?? '',
      };
    }
  }

  return partial;
}
