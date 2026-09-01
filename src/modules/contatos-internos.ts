// src/modules/contatos-internos.ts
// Quem é DE DENTRO da empresa, no número público da assistente.
//
// O número da assistente (ex.: Clara, 77 99961-0038) não recebe só cliente: a
// equipe manda recado, indicação e pergunta de obra pra lá. Sem saber quem é
// quem, a assistente trata colega como lead. Aconteceu em 01/09/2026: o pessoal
// da engenharia mandou uma indicação de autoescola e a Clara entrou na conversa
// querendo qualificar a autoescola como cliente.
//
// Esta lista é DETERMINÍSTICA de propósito. A `politica_triagem` (migration 116)
// ajuda a assistente a ENTENDER quem chegou, mas "é da equipe" não pode depender
// de a IA entender — é número cadastrado, e ponto.
//
// Diferente de `dashboard_users`: lá é "quem tem acesso ao sistema", aqui é
// "quem é de dentro". O eletricista entra nesta lista sem ganhar login nenhum.
import type { SupabaseClient } from '@supabase/supabase-js';
import { variantesTelefone } from './phone.js';

/** O que a assistente faz quando essa pessoa escreve no número público.
 *  - 'muda'  = não responde nada (só anota o recado)
 *  - 'anota' = anota e confirma com uma linha curta
 *  (o modo 'atende', que aceita consulta de trabalho, é a próxima fatia) */
export type ModoInterno = 'muda' | 'anota';

export interface ContatoInterno {
  id: string;
  nome: string;
  setor: string | null;
  modo: ModoInterno;
}

/**
 * Essa pessoa é de dentro DESTA empresa? Compara pelas variantes BR do telefone
 * (com/sem 55, com/sem o 9º dígito).
 *
 * FALHA ABERTO de propósito: banco fora ou tabela ausente devolve `null` (=
 * "não é interno"), e a pessoa segue sendo atendida como cliente. O contrário
 * — assumir "é interno" na dúvida — deixaria cliente de verdade sem resposta,
 * que é um estrago bem maior do que a assistente responder um colega.
 */
export async function identificarInterno(
  client: SupabaseClient,
  companyId: string,
  telefone: string,
): Promise<ContatoInterno | null> {
  const variantes = variantesTelefone(telefone);
  if (variantes.length === 0) return null;
  const { data, error } = await client
    .from('contatos_internos')
    .select('id, nome, setor, modo')
    .eq('company_id', companyId)
    .eq('ativo', true)
    .in('telefone', variantes)
    .limit(1);
  if (error) {
    console.warn(`[contatos-internos] consulta falhou (${telefone}): ${error.message} — seguindo como cliente`);
    return null;
  }
  const linha = (data as ContatoInterno[] | null)?.[0];
  return linha ?? null;
}

export interface RecadoNovo {
  companyId: string;
  contatoId: string;
  telefone: string;
  nome: string;
  mensagem: string;
}

/** Guarda o recado pra equipe ver no dashboard. Best-effort: recado perdido não
 *  pode derrubar o webhook. */
export async function salvarRecado(client: SupabaseClient, r: RecadoNovo): Promise<void> {
  const { error } = await client.from('recados_equipe').insert({
    company_id: r.companyId,
    contato_id: r.contatoId,
    telefone: r.telefone,
    nome: r.nome,
    mensagem: r.mensagem,
  });
  if (error) console.warn(`[contatos-internos] recado de ${r.nome} não gravou: ${error.message}`);
}

/** Confirmação curta do modo 'anota'. Sem nome de empresa nem de assistente —
 *  a mesma frase serve pra qualquer cliente da plataforma. */
export function textoConfirmacao(nomeCompleto: string): string {
  const primeiro = (nomeCompleto ?? '').trim().split(/\s+/)[0] || 'oi';
  return `Anotado, ${primeiro}! 📝 Deixei o recado com a equipe.`;
}

export interface Recado {
  id: string;
  nome: string;
  telefone: string;
  mensagem: string;
  criado_em: string;
  lido_em: string | null;
}

/** Recados da empresa, mais novo primeiro — alimenta a tela "Recados da equipe". */
export async function listarRecados(
  client: SupabaseClient,
  companyId: string,
  limite = 100,
): Promise<Recado[]> {
  const { data, error } = await client
    .from('recados_equipe')
    .select('id, nome, telefone, mensagem, criado_em, lido_em')
    .eq('company_id', companyId)
    .order('criado_em', { ascending: false })
    .limit(limite);
  if (error) {
    console.warn(`[contatos-internos] não deu pra listar recados: ${error.message}`);
    return [];
  }
  return (data as Recado[] | null) ?? [];
}
