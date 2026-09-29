// tests/helpers/teto-tailwind.ts
// Detector de utilitário Tailwind no miolo das telas renovadas (usado pelo
// teto tests/miolo-sem-tailwind.test.ts e pelos testes de cada fatia).
// Exceção só com comentário `// tailwind-ok: <motivo>` na MESMA linha.

/** Telas renovadas (lista ÚNICA): o teto (miolo-sem-tailwind.test.ts) garante
 *  que o miolo delas não tem Tailwind e, por isso, elas NÃO carregam o Tailwind
 *  do CDN (telas-leves.test.ts — perf/telas-leves, 28/09/2026).
 *  Formato: 'arquivo.ts' (arquivo inteiro) ou 'arquivo.ts#funcao'. */
export const TELAS_RENOVADAS: string[] = [
  // R2 (lista) + R3 (ficha): leads-views.ts inteiro no padrão cc-
  'leads-views.ts',
  // R4 — Funil (Kanban)
  'kanban-views.ts',
  // Atendimento (Leads › Conversas, 28/09) — nasceu no padrão cc-
  'atendimento-views.ts',
  // Command Center, Central de Atenção e Modo TV — nasceram no padrão cc-
  'command-center-views.ts',
  // Mapa das Usinas (bloco do Command Center, mini-mapa, Localizar) — nasceu no padrão cc-
  'mapa-usinas-views.ts',
  // Atendimento P2b — "Meu WhatsApp no painel" (QR do número pessoal) — nasceu no padrão cc-
  'whatsapp-pessoal-views.ts',
  // R8 — Monitoramento (frota): só a função da tela (views.ts tem telas antigas)
  'views.ts#renderMonitoramentoPage',
  // R9 — Usina: detalhe, dados do inversor, editar e importar
  'views.ts#renderDetalheSistemaPage',
  'views.ts#renderTelemetriaPage',
  'views.ts#renderEditarSistemaPage',
  'views.ts#renderImportarSitesPage',
  // R10 — Financeiro (visão)
  'financeiro-views.ts',
  // R11 — Demonstrativos GD (6 telas)
  'demonstrativos-views.ts',
  // R12 — Pasta do Cliente (lista, editor, prévia)
  'pasta-views.ts',
  // ── Onda 3 (R13–R19): cada fatia acrescenta SÓ debaixo do seu marcador ──
  // R13 — Manutenção + OS
  'manutencao-views.ts',
  'os-views.ts',

  // R14 — Serviços de campo (painel interno)
  // (as 4 telas do painel; a página pública do link mágico fica de fora — não muda)
  'servicos-views.ts#renderServicosPage',
  'servicos-views.ts#renderNovoServicoPage',
  'servicos-views.ts#renderDetalheServicoPage',
  'servicos-views.ts#renderLixeiraServicosPage',

  // R15 — Quadro de Obras + vincular + contato
  'usinas-kanban-views.ts',
  'vincular-usinas-views.ts',

  // R16 — Clientes (lista, ficha, novo, relatório pós-instalação)
  'clientes-views.ts',
  'relatorio-pi-views.ts',

  // R17 — Marketing (campanhas, blog, e-mail, cadência)
  'marketing-views.ts',
  'blog-views.ts',
  'email-views.ts',
  'cadencia-views.ts',

  // R18 — RH
  'rh-views.ts',

  // R19 — Configurações (usuários, empresas, WhatsApp, minha assinatura)
  'usuarios-views.ts',
  'empresas-views.ts',
  'whatsapp-views.ts',
  'minha-assinatura-views.ts',
  'configuracoes-casca.ts',

  // ── Onda 4 (R5, R21–R26): cada fatia acrescenta SÓ debaixo do seu marcador ──
  // R21 — Comercial II (contratos, Fechou!, contrato do lead, recados, lojas, conhecimento)
  'comercial-casca.ts',
  'contratos-views.ts',
  'vendas-views.ts',
  'contrato-form-views.ts',
  'recados-views.ts',
  'lojas-views.ts',
  'conhecimento-views.ts',

  // R22 — Operação II (pós-venda, medição)
  'pos-venda-views.ts',
  'medicao-views.ts',

];

export const RE_TAILWIND = /\b(bg|text|border|ring|from|to)-(white|black|slate|gray|zinc|sky|cyan|amber|emerald|rose|red|green|yellow|indigo|violet)(-\d{2,3})?\b|\b(p|px|py|m|mx|my|mt|mb|gap|space-[xy])-\d|\brounded(-\w+)?\b|\bgrid-cols-\d/;

/** Corpo (texto) de uma função `function nome(`, casando parênteses e chaves. */
export function corpoDaFuncao(fonte: string, nome: string): string {
  const i = fonte.search(new RegExp(`function ${nome}\\s*[(<]`));
  if (i === -1) throw new Error(`função ${nome} não encontrada`);
  // Pula a assinatura inteira (parâmetro pode ter objeto literal e default com
  // chamada). O corpo é o 1º "{" depois dela.
  let p = 0; let j = fonte.indexOf('(', i);
  for (; j < fonte.length; j++) { if (fonte[j] === '(') p++; else if (fonte[j] === ')') { p--; if (p === 0) break; } }
  const abre = fonte.indexOf('{', j);
  let prof = 0;
  for (let k = abre; k < fonte.length; k++) {
    if (fonte[k] === '{') prof++;
    else if (fonte[k] === '}') { prof--; if (prof === 0) return fonte.slice(abre, k + 1); }
  }
  return fonte.slice(abre);
}

/** Linhas do trecho que têm utilitário Tailwind (fora comentários e `tailwind-ok`). */
export function linhasComTailwind(trecho: string): string[] {
  return trecho.split('\n')
    .filter((l) => !l.includes('tailwind-ok'))
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .filter((l) => RE_TAILWIND.test(l))
    .map((l) => l.trim().slice(0, 140));
}
