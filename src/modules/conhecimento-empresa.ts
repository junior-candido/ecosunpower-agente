// src/modules/conhecimento-empresa.ts
// A base que cada empresa tem sobre SI MESMA: o que vende, com que marcas
// trabalha, garantia, região, processo.
//
// Junior 01/09/2026: "se eu tiver que mexer no meu para melhorar, lá fica ruim".
// Com base compartilhada, toda melhoria na base da EcoSunPower mexia na do
// cliente sem querer — e ele ficava com medo de mexer na própria base.
//
// Aqui cada empresa tem a sua, no banco (migration 119). Mexer na de uma não
// encosta na outra. O que é FATO DE EQUIPAMENTO (specs, norma, lei) continua na
// pasta compartilhada — aquilo é verdade pra qualquer empresa do país.
//
// Cache em memória carregado no boot, igual ao empresa_config: a leitura
// acontece a cada mensagem e não pode pagar ida ao banco.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ItemConhecimento {
  chave: string;
  titulo: string;
  conteudo: string;
  ordem: number;
}

let porEmpresa = new Map<string, ItemConhecimento[]>();

/** Só para testes — zera o cache entre casos. */
export function _resetConhecimentoParaTeste(): void {
  porEmpresa = new Map();
}

/**
 * Carrega a base de todas as empresas (boot e depois de editar).
 * Best-effort: banco fora devolve `ok: false` e a assistente segue sem a base —
 * ficar sem resposta é melhor do que derrubar o atendimento inteiro.
 */
export async function carregarConhecimentoEmpresas(
  client: SupabaseClient,
): Promise<{ ok: boolean; empresas: number }> {
  try {
    const { data, error } = await client
      .from('conhecimento_empresa')
      .select('company_id, chave, titulo, conteudo, ordem, ativo')
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error) {
      console.warn(`[conhecimento-empresa] não carregou: ${error.message}`);
      return { ok: false, empresas: 0 };
    }
    const linhas = (data ?? []) as Array<ItemConhecimento & { company_id: string }>;
    const mapa = new Map<string, ItemConhecimento[]>();
    for (const l of linhas) {
      const lista = mapa.get(l.company_id) ?? [];
      lista.push({ chave: l.chave, titulo: l.titulo, conteudo: l.conteudo ?? '', ordem: l.ordem ?? 100 });
      mapa.set(l.company_id, lista);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);
    porEmpresa = mapa;
    console.log(`[conhecimento-empresa] base carregada de ${mapa.size} empresa(s)`);
    return { ok: true, empresas: mapa.size };
  } catch (err) {
    console.warn(`[conhecimento-empresa] falhou: ${(err as Error).message}`);
    return { ok: false, empresas: 0 };
  }
}

/** Todos os assuntos da empresa, inclusive os vazios — a tela precisa mostrar
 *  o que falta preencher. */
export function itensDaEmpresa(companyId: string | null | undefined): ItemConhecimento[] {
  if (!companyId) return [];
  return porEmpresa.get(companyId) ?? [];
}

/**
 * O texto que a assistente lê. Assunto sem conteúdo NÃO entra: assistente sem
 * resposta é melhor do que assistente inventando — e o vazio aparece no
 * semáforo do cadastro pra ser preenchido.
 */
export function conhecimentoDaEmpresa(companyId: string | null | undefined): string {
  const itens = itensDaEmpresa(companyId).filter((i) => i.conteudo.trim().length > 0);
  if (itens.length === 0) return '';
  return itens.map((i) => `## ${i.titulo}\n${i.conteudo.trim()}`).join('\n\n');
}

/** Títulos ainda em branco — alimenta o semáforo do cadastro. */
export function faltaPreencher(companyId: string | null | undefined): string[] {
  return itensDaEmpresa(companyId).filter((i) => !i.conteudo.trim()).map((i) => i.titulo);
}

/**
 * Grava o conteúdo de UM assunto da empresa e recarrega o cache na hora — quem
 * salvou precisa ver o efeito na próxima mensagem, não no próximo boot.
 *
 * Só aceita assunto que já existe no cadastro daquela empresa: assim a tela (ou
 * um POST forjado) não cria assunto solto nem grava na base de outra.
 */
export async function salvarConhecimento(
  client: SupabaseClient,
  companyId: string,
  chave: string,
  conteudo: string,
): Promise<{ ok: boolean; motivo?: string }> {
  const existe = itensDaEmpresa(companyId).some((i) => i.chave === chave);
  if (!existe) return { ok: false, motivo: 'Assunto não existe no cadastro desta empresa.' };
  const { error } = await client
    .from('conhecimento_empresa')
    .update({ conteudo: (conteudo ?? '').trim(), atualizado_em: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('chave', chave);
  if (error) return { ok: false, motivo: error.message };
  await carregarConhecimentoEmpresas(client);
  return { ok: true };
}
