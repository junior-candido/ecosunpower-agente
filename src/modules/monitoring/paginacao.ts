// src/modules/monitoring/paginacao.ts
// O PostgREST corta QUALQUER resposta em 1000 linhas, mesmo sem .limit().
// Consulta de frota inteira (geração de todas as usinas numa janela) passa
// disso e vinha truncada — foi a causa do alerta OFFLINE falso de 28/07 (#161).
// Este ajudante busca em páginas de 1000 até vir página incompleta.
//
// `montarConsulta` deve criar uma consulta NOVA a cada chamada (o builder do
// supabase-js é mutável) e já vir com .order() fixo — paginação sem ordem
// estável repete/pula linhas entre páginas.
const PAGINA = 1000;

export async function buscarPaginado(montarConsulta: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await montarConsulta()
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    if (error) break; // mesmo contrato do antigo `data ?? []`: erro → devolve o que tem
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGINA) break;
  }
  return out;
}
