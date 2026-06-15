// src/modules/proposal/atualizar-proposta.ts
// Comando "atualizar <nome>" no zap: acha proposta(s) já enviada(s) pelo nome do
// cliente e devolve o link do dashboard pra reabrir/ajustar. Lógica de montagem da
// resposta isolada aqui pra ser testável sem banco nem WhatsApp.
export interface PropostaMatch {
  slug: string;
  clienteNome: string;
  numeroProposta: string;
  createdAt: string; // ISO
  valorTotal: number | null;
}

function linkPreview(dashboardBaseUrl: string, slug: string): string {
  return `${dashboardBaseUrl.replace(/\/$/, '')}/propostas/${slug}/preview`;
}

export function montarRespostaAtualizar(
  nome: string,
  matches: PropostaMatch[],
  dashboardBaseUrl: string,
): string {
  const base = dashboardBaseUrl.replace(/\/$/, '');
  if (matches.length === 0) {
    return `🔍 Não achei nenhuma proposta pra *${nome}*.\nConfere o nome ou veja a lista em ${base}/propostas`;
  }
  if (matches.length === 1) {
    const m = matches[0];
    return (
      `✏️ Proposta ${m.numeroProposta} — *${m.clienteNome}* (${m.createdAt.slice(0, 10)})\n\n` +
      `Abre aqui pra reabrir e ajustar:\n${linkPreview(base, m.slug)}`
    );
  }
  const linhas = matches
    .map((m, i) => {
      const valor = m.valorTotal ? ` · R$ ${Math.round(m.valorTotal)}` : '';
      return `${i + 1}. *${m.clienteNome}* — ${m.numeroProposta} (${m.createdAt.slice(0, 10)})${valor}\n   ${linkPreview(base, m.slug)}`;
    })
    .join('\n\n');
  return `Achei ${matches.length} propostas pra *${nome}*. Toca no link da que quer ajustar:\n\n${linhas}`;
}
