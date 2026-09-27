// src/modules/closing/contrato-vigente.ts
//
// 📌 "ESTE É O CONTRATO QUE VALE" — congela o retrato do que foi combinado.
//
// O problema que isso resolve: a central monta o PDF NA HORA, sempre a partir do
// cadastro + proposta. Então não existe "o contrato do Antonio" — existe "o
// contrato que eu gerei agora". Se a proposta mudar amanhã, o contrato "original"
// muda junto. Pra fazer ADITIVO isso não serve: o aditivo precisa dizer "antes era
// 24x sem juros", e esse "antes" tem que estar guardado em algum lugar.
//
// Reusa a tabela `fechamentos`, que já existe pra isso desde o /fechar antigo:
// dados_snapshot (o retrato completo) + parent_id (a corrente de versões).
// Congelar de novo NÃO apaga o passado — cria a v2 apontando pra v1.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DadosFechamento } from './types.js';
import { dataIsoEmBrasilia, hojeEmBrasilia } from './data-documento.js';

export interface ContratoCongelado {
  id: string;
  dados: DadosFechamento;
  /**
   * Os dados CRUS de quando congelou (sem os padrões que o autopreenchimento
   * inventa: "Neoenergia-DF", UF "DF", "SSP"). É o que a trava valida. Retrato
   * antigo, de antes de guardar o cru → null (a trava valida o completado).
   */
  cru: Partial<DadosFechamento> | null;
  congeladoEm: string; // ISO
  congeladoPor: string;
}

/** O contrato que vale pro cliente hoje (a versão mais nova, fora as canceladas). */
export async function contratoVigente(sb: SupabaseClient, leadId: string): Promise<ContratoCongelado | null> {
  try {
    // A MAIS NOVA (desc + limit 1). Duas armadilhas aqui:
    //  - `ascending: true` pegaria a v1 e o aditivo citaria o contrato VELHO;
    //  - sem `limit(1)`, o maybeSingle() do PostgREST ERRA quando volta mais de
    //    uma linha — e cliente que congelou 2x tem 2 linhas.
    const { data, error } = await sb
      .from('fechamentos')
      .select('id, dados_snapshot, created_at, created_by, status')
      .eq('lead_id', leadId)
      .eq('status', 'aprovado_junior')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const linha = data as { id: string; dados_snapshot: DadosFechamento & { dados_crus?: unknown }; created_at: string; created_by: string };
    if (!linha?.dados_snapshot) return null;
    const { dados_crus, ...retrato } = linha.dados_snapshot;
    const cru = dados_crus && typeof dados_crus === 'object' && !Array.isArray(dados_crus)
      ? (dados_crus as Partial<DadosFechamento>)
      : null;
    // A data impressa é a do CONGELAMENTO (guardada no retrato). Retrato antigo,
    // de antes de guardar a data: usa o created_at, no calendário de Brasília.
    const dataDocumento = retrato.data_documento
      || dataIsoEmBrasilia(linha.created_at)
      || undefined;
    return {
      id: linha.id,
      dados: { ...(retrato as DadosFechamento), data_documento: dataDocumento },
      cru,
      congeladoEm: linha.created_at,
      congeladoPor: linha.created_by,
    };
  } catch {
    return null; // banco fora do ar não derruba a tela
  }
}

/**
 * Congela o contrato: guarda o retrato do que foi combinado, com data e autor.
 * Se já havia um, o novo vira a versão seguinte (parent_id aponta pro anterior) —
 * o histórico fica inteiro, que é o que um aditivo precisa pra dizer o "antes".
 */
export async function congelarContrato(
  sb: SupabaseClient,
  leadId: string,
  dados: DadosFechamento,
  quem: string,
  /** Os dados CRUS (antes do autopreenchimento) — vão junto, pra trava validar. */
  cru?: Partial<DadosFechamento>,
): Promise<string> {
  const anterior = await contratoVigente(sb, leadId);

  const { data, error } = await sb
    .from('fechamentos')
    .insert({
      lead_id: leadId,
      proposta_publica_id: null,
      docs_pedidos: dados.docs_pedidos ?? ['contrato', 'procuracao'],
      // A data do documento fica FIXA no retrato: reimprimir amanhã (ou mês que
      // vem) não muda a data do contrato. Calendário de Brasília, não do servidor.
      dados_snapshot: { ...dados, data_documento: hojeEmBrasilia(), ...(cru ? { dados_crus: cru } : {}) },
      status: 'aprovado_junior', // é O contrato, não um rascunho gerado
      created_by: quem,
      parent_id: anterior?.id ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Quantas versões congeladas o cliente tem (v1, v2...). É o número que vai no
 * nome do arquivo do Drive — o fixo "v1" misturava versões diferentes com o mesmo
 * nome. Best-effort: banco fora do ar → 1.
 */
export async function contarVersoesCongeladas(sb: SupabaseClient, leadId: string): Promise<number> {
  try {
    const { count, error } = await sb
      .from('fechamentos')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', leadId)
      .eq('status', 'aprovado_junior');
    if (error || !count) return 1;
    return count;
  } catch {
    return 1;
  }
}
