// Acesso ao banco para a ingestao do demonstrativo de GD. Usa o client
// service_role do servidor (webhook nao tem usuario logado) e por isso SEMPRE
// carimba o company_id explicitamente — do lead achado, ou EcoSun.
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

export function criarRepoDemonstrativo(db: SupabaseClient) {
  return {
    async jaProcessado(emailId: string): Promise<boolean> {
      const { data, error } = await db.from('demonstrativos_gd').select('id').eq('email_id', emailId).limit(1);
      if (error) throw new Error(`demonstrativos_gd (duplicado): ${error.message}`);
      return (data ?? []).length > 0;
    },

    /**
     * O uc_numero da ficha pode ter sido digitado com o codigo do cliente OU
     * com a instalacao, e as vezes com ponto/traco. Tenta igual primeiro;
     * se nao achar, compara so os digitos.
     */
    async buscarLeadPorUc(ucs: string[]): Promise<LeadGd | null> {
      const alvos = ucs.map(soDigitos).filter(Boolean);
      if (alvos.length === 0) return null;
      const exato = await db.from('leads').select('id, name, company_id').in('uc_numero', ucs).limit(1);
      if (exato.error) throw new Error(`leads (uc exata): ${exato.error.message}`);
      const l = exato.data?.[0];
      if (l) return { id: l.id, nome: l.name ?? null, companyId: l.company_id ?? null };

      const todos = await db.from('leads').select('id, name, company_id, uc_numero').not('uc_numero', 'is', null).limit(10000);
      if (todos.error) throw new Error(`leads (uc por digitos): ${todos.error.message}`);
      const achado = (todos.data ?? []).find((x) => alvos.includes(soDigitos(x.uc_numero)));
      return achado ? { id: achado.id, nome: achado.name ?? null, companyId: achado.company_id ?? null } : null;
    },

    async buscarRateio(leadGeradorId: string): Promise<RateioCadastrado[]> {
      const { data, error } = await db
        .from('leads')
        .select('name, uc_numero, percentual_rateio')
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
      const sis = await db.from('sistemas_clientes').select('id').eq('lead_id', leadId);
      if (sis.error) throw new Error(`sistemas_clientes: ${sis.error.message}`);
      const ids = (sis.data ?? []).map((s) => s.id);
      if (ids.length === 0) return null;
      const ger = await db
        .from('geracao_diaria')
        .select('geracao_kwh')
        .in('sistema_id', ids)
        .gte('data', referencia)
        .lte('data', fimDoMes(referencia))
        .limit(2000);
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
