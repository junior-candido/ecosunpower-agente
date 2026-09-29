// src/modules/dashboard/custo-ia-queries.ts
// Leitura da tela "Custo de IA" — SÓ A CASA (a rota barra tenant). Lê TODAS as
// empresas de propósito (é a visão do dono do prédio), pelo client de serviço.
// Só-leitura e best-effort: uma fonte fora do ar vira lista vazia, a tela abre.
import { janelaMeses, type LinhaUsoIa } from './custo-ia-calc.js';

const PAGINA = 1000;
const MAX_PAGINAS = 60; // teto de 60 mil linhas (setembro inteiro teve ~2,2 mil)

async function paginar<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await montar(p * PAGINA, p * PAGINA + PAGINA - 1);
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < PAGINA) break;
  }
  return out;
}

async function seguro<T>(nome: string, f: () => Promise<T>, vazio: T): Promise<T> {
  try { return await f(); } catch (err) {
    console.warn(`[custo-ia] ${nome} falhou (tela abre sem isso):`, (err as Error).message);
    return vazio;
  }
}

export interface DadosCustoIa {
  linhas: LinhaUsoIa[];
  empresas: Array<{ id: string; nome: string }>;
  mensalidades: Map<string, number>;
  atendidos: Array<{ company_id: string | null; lead_id: string | null; created_at: string }>;
}

export async function carregarDadosCustoIa(client: any, agora: Date): Promise<DadosCustoIa> {
  const { inicioAnterior } = janelaMeses(agora);
  const [linhas, empresas, assinaturas, atendidos] = await Promise.all([
    seguro('custos_ia_uso', () => paginar<LinhaUsoIa>((de, ate) => client.from('custos_ia_uso')
      .select('created_at, company_id, origem, modelo, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, custo_cents')
      .gte('created_at', inicioAnterior).order('created_at', { ascending: true }).range(de, ate)), [] as LinhaUsoIa[]),
    seguro('companies', async () => {
      const { data, error } = await client.from('companies').select('id, nome');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ id: string; nome: string }>);
    }, [] as Array<{ id: string; nome: string }>),
    seguro('assinaturas', async () => {
      const { data, error } = await client.from('assinaturas').select('company_id, valor_centavos, status').eq('status', 'ativa');
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ company_id: string | null; valor_centavos: number }>);
    }, [] as Array<{ company_id: string | null; valor_centavos: number }>),
    // Leads que a assistente respondeu (1 evento por turno; a conta tira repetidos).
    seguro('eventos_elo', () => paginar<{ company_id: string | null; lead_id: string | null; created_at: string }>((de, ate) => client.from('eventos_elo')
      .select('company_id, lead_id, created_at')
      .eq('tipo', 'atendimento:eva_respondeu').gte('created_at', inicioAnterior)
      .order('created_at', { ascending: true }).range(de, ate)), []),
  ]);

  // Mensalidade do tenant = soma das assinaturas ATIVAS dele.
  const mensalidades = new Map<string, number>();
  for (const a of assinaturas) {
    if (!a.company_id) continue;
    const id = a.company_id.toLowerCase();
    mensalidades.set(id, (mensalidades.get(id) ?? 0) + (Number(a.valor_centavos) || 0));
  }
  return { linhas, empresas, mensalidades, atendidos };
}
