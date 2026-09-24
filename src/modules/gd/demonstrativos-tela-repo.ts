// Leituras e gravações da TELA de demonstrativos. company_id vem SEMPRE da
// sessão do operador (quem chama passa req.dashUser.companyId) e TODA consulta
// filtra por ele — mesmo com a chave-mestra, uma empresa nunca lê a outra.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistroDemonstrativo } from './demonstrativo-ingestao.js';

export interface LinhaDemonstrativo {
  id: string;
  lead_id: string | null;
  cliente_nome: string;
  codigo_cliente: string;
  instalacao: string;
  referencia: string;
  injetado_kwh: number | null;
  consumo_kwh: number | null;
  credito_utilizado_kwh: number | null;
  credito_restante_kwh: number | null;
  saldo_acumulado_kwh: number | null;
  proximo_expirar_kwh: number | null;
  ciclo_expirar: string | null;
  historico: Array<{ mes: string; consumida: number; injetada: number; faturada: number; compensado: number; credito: number }>;
  unidades: Array<{ codigoCliente: string; percentual: number; saldo: number }>;
  inconsistencias: string[];
  origem: 'email' | 'pdf_manual' | 'digitado';
  origem_verificada: boolean;
  recebido_em: string;
  conferido_em: string | null;
}

export interface GeracaoManual {
  kwh: number;
  origem: 'print' | 'digitado';
  conferido_em: string;
}

const COLUNAS =
  'id, lead_id, cliente_nome, codigo_cliente, instalacao, referencia, injetado_kwh, consumo_kwh, ' +
  'credito_utilizado_kwh, credito_restante_kwh, saldo_acumulado_kwh, proximo_expirar_kwh, ciclo_expirar, ' +
  'historico, unidades, inconsistencias, origem, origem_verificada, recebido_em, conferido_em';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function normalizar(r: any): LinhaDemonstrativo {
  return {
    ...r,
    injetado_kwh: num(r.injetado_kwh),
    consumo_kwh: num(r.consumo_kwh),
    credito_utilizado_kwh: num(r.credito_utilizado_kwh),
    credito_restante_kwh: num(r.credito_restante_kwh),
    saldo_acumulado_kwh: num(r.saldo_acumulado_kwh),
    proximo_expirar_kwh: num(r.proximo_expirar_kwh),
    historico: Array.isArray(r.historico) ? r.historico : [],
    unidades: Array.isArray(r.unidades) ? r.unidades : [],
    inconsistencias: Array.isArray(r.inconsistencias) ? r.inconsistencias : [],
  };
}

export function criarRepoTelaGd(db: SupabaseClient, companyId: string) {
  return {
    async mesesDisponiveis(): Promise<string[]> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select('referencia')
        .eq('company_id', companyId)
        .order('referencia', { ascending: false })
        .limit(1000);
      if (error) throw new Error(`demonstrativos_gd (meses): ${error.message}`);
      return [...new Set((data ?? []).map((x: any) => String(x.referencia)))];
    },

    async listarDoMes(referencia: string): Promise<LinhaDemonstrativo[]> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select(COLUNAS)
        .eq('company_id', companyId)
        .eq('referencia', referencia)
        .order('cliente_nome', { ascending: true })
        .limit(1000);
      if (error) throw new Error(`demonstrativos_gd (lista): ${error.message}`);
      return (data ?? []).map(normalizar);
    },

    async historicoDaInstalacao(instalacao: string): Promise<LinhaDemonstrativo[]> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select(COLUNAS)
        .eq('company_id', companyId)
        .eq('instalacao', instalacao)
        .order('referencia', { ascending: false })
        .limit(36);
      if (error) throw new Error(`demonstrativos_gd (historico): ${error.message}`);
      return (data ?? []).map(normalizar);
    },

    /** Geração manual por `${instalacao}|${referencia}`. */
    async geracoesManuais(instalacoes: string[]): Promise<Map<string, GeracaoManual>> {
      const mapa = new Map<string, GeracaoManual>();
      if (instalacoes.length === 0) return mapa;
      const { data, error } = await db
        .from('geracao_mensal_gd')
        .select('instalacao, referencia, kwh, origem, conferido_em')
        .eq('company_id', companyId)
        .in('instalacao', instalacoes)
        .limit(5000);
      if (error) throw new Error(`geracao_mensal_gd (ler): ${error.message}`);
      for (const g of (data ?? []) as any[]) {
        mapa.set(`${g.instalacao}|${g.referencia}`, {
          kwh: Number(g.kwh),
          origem: g.origem as 'print' | 'digitado',
          conferido_em: g.conferido_em,
        });
      }
      return mapa;
    },

    async salvarGeracaoManual(p: {
      leadId: string | null; instalacao: string; referencia: string; kwh: number; conferidoPor: string;
    }): Promise<void> {
      const { error } = await db.from('geracao_mensal_gd').upsert(
        {
          company_id: companyId,
          lead_id: p.leadId,
          instalacao: p.instalacao,
          referencia: p.referencia,
          kwh: p.kwh,
          origem: 'digitado',
          fonte: {},
          conferido_por: p.conferidoPor,
          conferido_em: new Date().toISOString(),
        },
        { onConflict: 'company_id,instalacao,referencia' },
      );
      if (error) throw new Error(`geracao_mensal_gd (gravar): ${error.message}`);
    },

    async sistemaDoLead(leadId: string): Promise<{ potenciaKwp: number | null; uf: string | null }> {
      const { data, error } = await db
        .from('sistemas_clientes')
        .select('potencia_kwp, uf')
        .eq('company_id', companyId)
        .eq('lead_id', leadId);
      if (error) throw new Error(`sistemas_clientes (kwp): ${error.message}`);
      const linhas = (data ?? []) as any[];
      const soma = linhas.reduce((s: number, x: any) => s + Number(x.potencia_kwp ?? 0), 0);
      return { potenciaKwp: soma > 0 ? Math.round(soma * 100) / 100 : null, uf: (linhas[0] as any)?.uf ?? null };
    },

    async leadDaEmpresa(leadId: string): Promise<{ id: string; nome: string | null } | null> {
      const { data, error } = await db
        .from('leads')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('id', leadId)
        .limit(1);
      if (error) throw new Error(`leads (conferir): ${error.message}`);
      const l = data?.[0] as any;
      return l ? { id: l.id, nome: l.name ?? null } : null;
    },

    async buscarLeads(q: string): Promise<Array<{ id: string; nome: string | null; uc: string | null }>> {
      const termo = q.trim().replace(/[%_,()]/g, ' ');
      if (termo.length < 2) return [];
      const { data, error } = await db
        .from('leads')
        .select('id, name, uc_numero')
        .eq('company_id', companyId)
        .ilike('name', `%${termo}%`)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw new Error(`leads (buscar): ${error.message}`);
      return (data ?? []).map((l: any) => ({ id: l.id, nome: l.name ?? null, uc: l.uc_numero ?? null }));
    },

    /** Liga todos os meses dessa UC (e a geração manual) ao cliente. */
    async ligarLead(instalacao: string, leadId: string): Promise<void> {
      const a = await db.from('demonstrativos_gd').update({ lead_id: leadId })
        .eq('company_id', companyId).eq('instalacao', instalacao);
      if (a.error) throw new Error(`demonstrativos_gd (ligar): ${a.error.message}`);
      const b = await db.from('geracao_mensal_gd').update({ lead_id: leadId })
        .eq('company_id', companyId).eq('instalacao', instalacao);
      if (b.error) throw new Error(`geracao_mensal_gd (ligar): ${b.error.message}`);
    },

    /**
     * PDF enviado ou digitado. Mês que já veio CONFIRMADO da concessionária
     * (DKIM) não é trocado — o gatilho da 130 também descartaria em silêncio;
     * aqui a tela fica sabendo e avisa.
     */
    async gravarManual(r: RegistroDemonstrativo): Promise<'gravado' | 'mantido_verificado'> {
      const atual = await db
        .from('demonstrativos_gd')
        .select('origem_verificada')
        .eq('company_id', companyId)
        .eq('instalacao', r.instalacao)
        .eq('referencia', r.referencia)
        .limit(1);
      if (atual.error) throw new Error(`demonstrativos_gd (conferir): ${atual.error.message}`);
      if ((atual.data?.[0] as any)?.origem_verificada === true) return 'mantido_verificado';
      const { error } = await db
        .from('demonstrativos_gd')
        .upsert({ ...r, company_id: companyId, atualizado_em: new Date().toISOString() }, { onConflict: 'company_id,instalacao,referencia' });
      if (error) throw new Error(`demonstrativos_gd (gravar manual): ${error.message}`);
      return 'gravado';
    },
  };
}

export type RepoTelaGd = ReturnType<typeof criarRepoTelaGd>;
