// Acesso ao banco para a ingestao do demonstrativo de GD.
//
// Roda no webhook, sem usuario logado. O chamador DEVE criar o client dentro
// de comEmpresaDe(<empresa dona da caixa>) — assim, com RLS_ESTRITO=on, o
// cracha e o da empresa certa (e nao o de NINGUEM). E TODA consulta aqui
// filtra company_id explicitamente: nunca casar UC com lead de outro tenant,
// mesmo com a chave mestra (modo off/aviso).
// Ver docs/superpowers/specs/2026-09-21-demonstrativo-gd-ingestao-design.md.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadGd, RegistroDemonstrativo } from './demonstrativo-ingestao.js';
import type { RateioCadastrado } from './demonstrativo-cruzamento.js';

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Ultimo dia do mes de uma data 'YYYY-MM-01'. */
export function fimDoMes(referencia: string): string {
  const [a, m] = referencia.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${a}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

/**
 * '200002' → '2%0%0%0%0%2': casa no ILIKE com '200.00-2', '200 002' etc.
 * O filtro fino (so digitos iguais) e feito depois, em memoria, so nos
 * candidatos — sem puxar a tabela inteira (o PostgREST corta em 1000 linhas).
 */
export function padraoDigitos(uc: string): string {
  return soDigitos(uc).split('').join('%');
}

export function criarRepoDemonstrativo(db: SupabaseClient, companyId: string) {
  async function leadPorUcExata(uc: string): Promise<LeadGd | null> {
    const { data, error } = await db
      .from('leads')
      .select('id, name, company_id')
      .eq('company_id', companyId)
      .eq('uc_numero', uc)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw new Error(`leads (uc exata): ${error.message}`);
    const l = data?.[0];
    return l ? { id: l.id, nome: l.name ?? null, companyId: l.company_id ?? companyId } : null;
  }

  async function leadPorUcDigitos(uc: string): Promise<LeadGd | null> {
    const alvo = soDigitos(uc);
    if (!alvo) return null;
    const { data, error } = await db
      .from('leads')
      .select('id, name, company_id, uc_numero')
      .eq('company_id', companyId)
      .ilike('uc_numero', padraoDigitos(alvo))
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw new Error(`leads (uc por digitos): ${error.message}`);
    const l = (data ?? []).find((x) => soDigitos(x.uc_numero) === alvo);
    return l ? { id: l.id, nome: l.name ?? null, companyId: l.company_id ?? companyId } : null;
  }

  return {
    async jaProcessado(emailId: string): Promise<boolean> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select('id')
        .eq('company_id', companyId)
        .eq('email_id', emailId)
        .limit(1);
      if (error) throw new Error(`demonstrativos_gd (duplicado): ${error.message}`);
      return (data ?? []).length > 0;
    },

    async registroExistente(instalacao: string, referencia: string): Promise<{ verificado: boolean } | null> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select('origem_verificada')
        .eq('company_id', companyId)
        .eq('instalacao', instalacao)
        .eq('referencia', referencia)
        .limit(1);
      if (error) throw new Error(`demonstrativos_gd (mes gravado): ${error.message}`);
      const l = data?.[0];
      return l ? { verificado: l.origem_verificada === true } : null;
    },

    async assinaturaGravada(instalacao: string, referencia: string): Promise<{ assinatura: string; verificado: boolean } | null> {
      const { data, error } = await db
        .from('demonstrativos_gd')
        .select('assinatura, origem_verificada')
        .eq('company_id', companyId)
        .eq('instalacao', instalacao)
        .eq('referencia', referencia)
        .limit(1);
      if (error) throw new Error(`demonstrativos_gd (assinatura): ${error.message}`);
      const l = data?.[0];
      return l ? { assinatura: l.assinatura as string, verificado: l.origem_verificada === true } : null;
    },

    /**
     * Codigo do cliente e instalacao sao series numericas diferentes e podem
     * coincidir entre clientes. Ordem de confianca: instalacao exata → codigo
     * exato → instalacao por digitos → codigo por digitos. Mais recente primeiro.
     */
    async buscarLeadPorUc(instalacao: string, codigoCliente: string): Promise<LeadGd | null> {
      return (
        (await leadPorUcExata(instalacao)) ??
        (await leadPorUcExata(codigoCliente)) ??
        (await leadPorUcDigitos(instalacao)) ??
        (await leadPorUcDigitos(codigoCliente))
      );
    },

    async buscarRateio(leadGeradorId: string): Promise<RateioCadastrado[]> {
      const { data, error } = await db
        .from('leads')
        .select('name, uc_numero, percentual_rateio')
        .eq('company_id', companyId)
        .eq('uc_geradora_lead_id', leadGeradorId)
        .eq('eh_consumidor_rateio', true);
      if (error) throw new Error(`leads (rateio): ${error.message}`);
      return (data ?? [])
        .filter((x) => soDigitos(x.uc_numero))
        .map((x) => ({
          uc: soDigitos(x.uc_numero),
          nome: x.name ?? null,
          percentual: x.percentual_rateio === null || x.percentual_rateio === undefined ? null : Number(x.percentual_rateio),
        }));
    },

    /** Soma da geracao_diaria dos sistemas do lead no mes. null = sem monitoramento/sem leitura. */
    async geracaoDoMes(leadId: string, referencia: string): Promise<number | null> {
      const sis = await db.from('sistemas_clientes').select('id').eq('company_id', companyId).eq('lead_id', leadId);
      if (sis.error) throw new Error(`sistemas_clientes: ${sis.error.message}`);
      const ids = (sis.data ?? []).map((s) => s.id);
      if (ids.length === 0) return null;
      const ger = await db
        .from('geracao_diaria')
        .select('geracao_kwh')
        .in('sistema_id', ids)
        .gte('data', referencia)
        .lte('data', fimDoMes(referencia))
        .limit(1000);
      if (ger.error) throw new Error(`geracao_diaria: ${ger.error.message}`);
      const linhas = ger.data ?? [];
      if (linhas.length === 0) return null;
      return Math.round(linhas.reduce((s, x) => s + Number(x.geracao_kwh ?? 0), 0) * 100) / 100;
    },

    async salvar(r: RegistroDemonstrativo): Promise<void> {
      const { error } = await db
        .from('demonstrativos_gd')
        .upsert({ ...r, atualizado_em: new Date().toISOString() }, { onConflict: 'company_id,instalacao,referencia' });
      if (error) throw new Error(`demonstrativos_gd (gravar): ${error.message}`);
    },
  };
}
