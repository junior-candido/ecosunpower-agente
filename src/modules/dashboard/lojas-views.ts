// src/modules/dashboard/lojas-views.ts
// Tela "Comparador de Lojas" v2: (1) placar por loja, (2) MONTAR KIT → total do
// conjunto (módulos+inversor+estrutura) em cada loja, (3) CATÁLOGO por loja com
// filtros. Lê da catalogo_loja (tabela viva). Growatt filtrado. Só render.
//
// Renovação do miolo — R21 (28/09/2026): mesmos 3 formulários GET (kit, cotação,
// catálogo) com os mesmos names; visual cc- (placar em KPIs, kits em cartões,
// catálogo em tabela que rola no celular), tema escuro, sem Tailwind.
import { escapeHtml, brl } from './views.js';
import type { KitLoja, EspecKit } from '../vendas/lojas/kit.js';
import type { Cotacao, MargemNoPreco } from '../vendas/lojas/cotacao.js';
import type { ItemCatalogo } from '../vendas/lojas/catalogo-loja.js';
import { cabecalhoPagina, cartaoSecao, botao, estadoVazio, pilulaStatus, tabela, kpiCard } from './ui/componentes.js';
import { renderComercial, avisoHtml, ehCasa, TRILHA_COMERCIAL } from './comercial-casca.js';

interface CotParams { servicoRsPorWp: number; impostoPct: number; margemAlvoPct: number; margemMinimaPct: number; }

const FONTE_LABEL: Record<string, string> = { belenus: 'Belenus', solfacil: 'Sol Fácil', fortlev: 'Fortlev' };
const CAT_LABEL: Record<string, string> = {
  modulo: 'Módulos', micro: 'Microinversores', inversor_string: 'Inversores string',
  inversor_hibrido: 'Inversores híbridos', bateria: 'Baterias', estrutura: 'Estrutura',
  cabo: 'Cabos', componente: 'Componentes',
};

function placarLojas(cont: Record<string, number>, atualizadoEmMs: number | null): string {
  const h = atualizadoEmMs ? Math.floor((Date.now() - atualizadoEmMs) / 3_600_000) : null;
  const quando = h == null ? '' : h === 0 ? 'agora há pouco' : h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
  const card = (f: string) => {
    const n = cont[f] ?? 0;
    return kpiCard({ rotulo: FONTE_LABEL[f], valor: n, detalhe: n > 0 ? 'itens com preço' : 'sem preço ainda' });
  };
  return `<div class="cc-cm-placar">${card('belenus')}${card('solfacil')}${card('fortlev')}${quando ? `<span class="cc-cm-nota" style="margin:0">atualizado ${quando}</span>` : ''}</div>`;
}

function kitCard(k: KitLoja, ehMelhor: boolean): string {
  const linha = (rot: string, it: { marca: string; descricao: string; preco: number } | null, qtd: number, tot: number) =>
    it ? `<div class="cc-cm-kv"><span>${rot}${qtd > 1 ? ` <span class="cc-faint">${qtd}×</span>` : ''}<small>${escapeHtml((it.marca + ' ' + it.descricao).slice(0, 46))}</small></span><strong>${brl(tot)}</strong></div>`
      : `<div class="cc-cm-kv cc-cm-kv-warn"><span>${rot}</span><span>não tem</span></div>`;
  return `<section class="cc-panel${ehMelhor ? ' cc-cm-melhor' : ''}">
    <div class="cc-ph"><h3>${escapeHtml(FONTE_LABEL[k.fonte] ?? k.fonte)}</h3><span class="cc-sp"></span>${ehMelhor ? pilulaStatus('normal', 'mais barato') : ''}</div>
    ${linha('Módulos', k.modulo, k.moduloQtd, k.moduloTotal)}
    ${linha('Inversor', k.inversor, 1, k.inversorTotal)}
    ${k.estruturaRsPorModulo > 0 ? `<div class="cc-cm-kv"><span>Estrutura <span class="cc-faint">${k.moduloQtd}× R$${k.estruturaRsPorModulo}/mód</span></span><strong>${brl(k.estruturaTotal)}</strong></div>` : ''}
    <div class="cc-cm-kv cc-cm-kv-forte"><span>Total do kit</span><strong>${brl(k.total)}</strong></div>
    ${k.faltando.length ? `<p class="cc-cm-nota cc-cm-kv-warn">Esta loja não tem o inversor pedido (total só de módulos${k.estruturaRsPorModulo > 0 ? '+estrutura' : ''}).</p>` : ''}
  </section>`;
}

function secaoKit(spec: EspecKit | null, kits: KitLoja[], marcasMod: string[], marcasInv: string[], marcaMod: string, marcaInv: string): string {
  const v = (x: unknown) => (x == null ? '' : escapeHtml(String(x)));
  const optMarca = (lista: string[], sel: string, label: string) =>
    `<option value="">${label}</option>` + lista.map((m) => `<option value="${escapeHtml(m)}"${m === sel ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
  const form = `<form method="get" action="/dashboard/lojas" class="cc-form cc-cm-linha">
    <label class="cc-campo cc-campo-estreito"><span>Nº de módulos</span><input name="modulos" type="number" min="1" value="${v(spec?.modulos)}" placeholder="ex: 12"></label>
    <label class="cc-campo cc-campo-estreito"><span>Wp do módulo</span><input name="wp" type="number" value="${v(spec?.wpModulo)}" placeholder="ex: 615"></label>
    <label class="cc-campo cc-campo-estreito"><span>Marca módulo</span><select name="marcamod">${optMarca(marcasMod, marcaMod, 'Mais barato')}</select></label>
    <label class="cc-campo cc-campo-estreito"><span>Inversor (kW)</span><input name="invkw" type="number" step="0.1" value="${v(spec?.inversorKw)}" placeholder="ex: 8"></label>
    <label class="cc-campo cc-campo-estreito"><span>Marca inversor</span><select name="marcainv">${optMarca(marcasInv, marcaInv, 'Mais barato')}</select></label>
    <label class="cc-campo cc-campo-estreito"><span>Estrutura R$/módulo</span><input name="estr" type="number" step="0.01" value="${v(spec?.estruturaRsPorModulo)}" placeholder="ex: 90"></label>
    ${botao({ rotulo: 'Montar kit', tipo: 'submit', tom: 'ouro', icone: 'box' })}
  </form>`;

  let corpo = '<p class="cc-cm-nota">Preencha e clique <strong>Montar kit</strong> pra ver o total do conjunto em cada loja.</p>';
  if (spec) {
    const melhorTotal = kits.filter((k) => k.faltando.length === 0).sort((a, b) => a.total - b.total)[0]?.total;
    corpo = kits.length
      ? `<div class="cc-cm-grade3" style="margin-top:14px">${kits.map((k) => kitCard(k, k.total === melhorTotal && k.faltando.length === 0)).join('')}</div>
         <p class="cc-cm-nota">Kit = módulos × qtd + inversor + estrutura × qtd. Preço: Belenus/Fortlev à vista · Sol Fácil no Pix. Frete e cabos não inclusos.</p>`
      : `<div style="margin-top:14px">${avisoHtml('atencao', 'Nenhuma loja tem dados pra montar esse kit ainda.')}</div>`;
  }
  return cartaoSecao({ titulo: 'Montar kit → total por loja', dica: 'módulos + inversor + estrutura', corpoHtml: `${form}${corpo}` });
}

// ---- Cotação do kit (ajustável; o valor do Junior manda) ----
function secaoCotacao(
  spec: EspecKit, cot: Cotacao | null, p: CotParams, precoManual: number | null,
  margManual: MargemNoPreco | null, melhorFonte: string | null,
): string {
  if (!cot) return '';
  const v = (x: unknown) => (x == null ? '' : escapeHtml(String(x)));
  // form preserva o kit (hidden) + parâmetros ajustáveis
  const form = `<form method="get" action="/dashboard/lojas" class="cc-form cc-cm-linha">
    <input type="hidden" name="modulos" value="${v(spec.modulos)}"><input type="hidden" name="wp" value="${v(spec.wpModulo)}"><input type="hidden" name="invkw" value="${v(spec.inversorKw)}"><input type="hidden" name="marcamod" value="${v(spec.marcaModulo)}"><input type="hidden" name="marcainv" value="${v(spec.marcaInversor)}"><input type="hidden" name="estr" value="${v(spec.estruturaRsPorModulo)}">
    <label class="cc-campo cc-campo-estreito"><span>Serviço R$/Wp</span><input name="serv" type="number" step="0.01" value="${v(p.servicoRsPorWp)}"></label>
    <label class="cc-campo cc-campo-estreito"><span>Imposto %</span><input name="imp" type="number" step="0.1" value="${v(p.impostoPct)}"></label>
    <label class="cc-campo cc-campo-estreito"><span>Margem %</span><input name="marg" type="number" step="0.1" value="${v(p.margemAlvoPct)}"></label>
    <label class="cc-campo cc-campo-estreito"><span>Seu preço (opcional)</span><input name="preco" type="text" value="${v(precoManual)}" placeholder="ex: 22000"></label>
    ${botao({ rotulo: 'Calcular', tipo: 'submit', icone: 'wallet' })}
  </form>`;
  const linha = (r: string, val: string, forte = false) => `<div class="cc-cm-kv${forte ? ' cc-cm-kv-forte' : ''}"><span>${r}</span><strong>${val}</strong></div>`;
  const sugerido = `<section class="cc-panel">
    <div class="cc-ph"><h3>Sugestão (margem ${escapeHtml(String(p.margemAlvoPct))}%)</h3></div>
    ${linha('Materiais' + (melhorFonte ? ` (${escapeHtml(FONTE_LABEL[melhorFonte] ?? melhorFonte)})` : ''), brl(cot.custoMateriais))}
    ${linha('Serviço', brl(cot.custoServico))}
    ${linha('Custo total', brl(cot.custoTotal))}
    ${linha('Imposto', brl(cot.impostoValor))}
    ${linha('Preço sugerido', brl(cot.precoSugerido), true)}
    ${linha('Lucro', `${brl(cot.lucro)} (${cot.lucroPct}%)`)}
    ${linha('Pode baixar até', `${brl(cot.precoMinimo)} (desc. máx ${brl(cot.descontoMaxRs)})`)}
  </section>`;
  const seuPreco = margManual ? `<section class="cc-panel${margManual.abaixoDoCusto ? '' : ' cc-cm-melhor'}">
    <div class="cc-ph"><h3>No SEU preço</h3><span class="cc-sp"></span>${margManual.abaixoDoCusto ? pilulaStatus('critico', 'prejuízo') : pilulaStatus('normal', 'com lucro')}</div>
    ${linha('Seu preço de venda', brl(margManual.precoVenda), true)}
    ${linha('Custo total', brl(cot.custoTotal))}
    ${linha('Imposto', brl(margManual.impostoValor))}
    ${linha('Lucro', `${brl(margManual.lucro)} (${margManual.lucroPct}%)`, true)}
    ${margManual.abaixoDoCusto ? avisoHtml('erro', 'Abaixo do custo — você teria prejuízo nesse preço.') : ''}
  </section>` : estadoVazio({ tipo: 'vazio', compacto: true, titulo: 'Digite o seu preço', texto: 'Pra ver a margem no seu valor (a sugestão é só ponto de partida — o seu número manda).', icone: 'wallet' });
  return cartaoSecao({
    titulo: 'Cotação do kit mais barato',
    corpoHtml: `${form}<div class="cc-cm-grade" style="margin-top:14px">${sugerido}${seuPreco}</div>`,
  });
}

function tabelaCatalogo(itens: ItemCatalogo[], catSel: string, fonteSel: string, mostrarGrandes: boolean, casa: boolean): string {
  const cats = ['', 'modulo', 'micro', 'inversor_string', 'inversor_hibrido', 'bateria', 'estrutura', 'cabo', 'componente'];
  const fontes = ['', 'belenus', 'solfacil', 'fortlev'];
  const opt = (val: string, sel: string, label: string) => `<option value="${val}"${val === sel ? ' selected' : ''}>${label}</option>`;
  const filtro = `<form method="get" action="/dashboard/lojas" class="cc-form cc-cm-linha">
    <label class="cc-campo cc-campo-estreito"><span>Categoria</span><select name="cat">
      ${cats.map((c) => opt(c, catSel, c ? CAT_LABEL[c] : 'Todas')).join('')}</select></label>
    <label class="cc-campo cc-campo-estreito"><span>Loja</span><select name="fonte">
      ${fontes.map((f) => opt(f, fonteSel, f ? FONTE_LABEL[f] : 'Todas')).join('')}</select></label>
    <label class="cc-cm-check"><input type="checkbox" name="grandes" value="1"${mostrarGrandes ? ' checked' : ''}> mostrar inversores grandes (&gt;20kW)</label>
    ${botao({ rotulo: 'Filtrar', tipo: 'submit', icone: 'filter' })}
  </form>`;
  const lista = tabela({
    mobile: 'rolar',
    vazio: 'Nada com esse filtro.',
    colunas: [{ titulo: 'Categoria' }, { titulo: 'Loja' }, { titulo: 'Marca' }, { titulo: 'Produto' }, { titulo: 'Potência' }, { titulo: 'Preço', alinhar: 'dir', num: true }],
    linhas: itens.slice(0, 400).map((i) => [
      CAT_LABEL[i.categoria] ?? i.categoria,
      FONTE_LABEL[i.fonte] ?? i.fonte,
      i.marca || null,
      (i.descricao || i.modelo).slice(0, 60),
      i.potenciaW ? (i.categoria === 'modulo' ? i.potenciaW + 'Wp' : (i.potenciaW / 1000) + 'kW') : null,
      { html: `<span class="cc-cm-num">${brl(i.precoUnitario)}</span>` },
    ]),
  });
  return cartaoSecao({
    titulo: 'Catálogo por loja',
    dica: 'do mais barato pro mais caro',
    corpoHtml: `${filtro}<div style="margin-top:14px">${lista}</div>
    <p class="cc-cm-nota">${itens.length} itens${itens.length > 400 ? ' (mostrando 400)' : ''} · ordenado do mais barato. Growatt não entra${casa ? ' (fora do padrão da casa)' : ''}.</p>`,
  });
}

export interface LojasPageInput {
  totalItens: number;
  contagemPorFonte: Record<string, number>;
  atualizadoEmMs: number | null;
  kitSpec: EspecKit | null;
  kits: KitLoja[];
  cotacao: Cotacao | null;
  cotParams: CotParams;
  precoManual: number | null;
  margemManual: MargemNoPreco | null;
  melhorFonte: string | null;
  catalogo: ItemCatalogo[];
  catSel: string;
  fonteSel: string;
  mostrarGrandes: boolean;
  marcasModulo: string[];
  marcasInversor: string[];
  marcaMod: string;
  marcaInv: string;
  user?: any;
}

export function renderLojasPage(input: LojasPageInput): string {
  const { totalItens, contagemPorFonte, atualizadoEmMs, kitSpec, kits, cotacao, cotParams, precoManual, margemManual, melhorFonte, catalogo, catSel, fonteSel, mostrarGrandes, marcasModulo, marcasInversor, marcaMod, marcaInv, user } = input;
  const casa = ehCasa(user);
  const cotacaoHtml = kitSpec ? secaoCotacao(kitSpec, cotacao, cotParams, precoManual, margemManual, melhorFonte) : '';
  // "o Junior atualiza" é da casa; o tenant lê a frase sem nome.
  const quemAtualiza = casa ? 'Belenus/Fortlev o Junior atualiza sob demanda' : 'Belenus/Fortlev são atualizadas sob demanda';
  const body = `
    ${cabecalhoPagina({
      trilha: [TRILHA_COMERCIAL, { rotulo: 'Comparador de Lojas' }],
      titulo: 'Comparador de Lojas',
      subtitulo: `${totalItens} itens com preço · monte o kit e veja o total em cada loja.`,
    })}
    ${placarLojas(contagemPorFonte, atualizadoEmMs)}
    ${totalItens === 0
      ? estadoVazio({ tipo: 'sem_dado', titulo: 'Ainda não há preços na tabela viva', texto: `A Sol Fácil sincroniza sozinha 1×/dia; ${quemAtualiza}.` })
      : `${secaoKit(kitSpec, kits, marcasModulo, marcasInversor, marcaMod, marcaInv)}${cotacaoHtml}${tabelaCatalogo(catalogo, catSel, fonteSel, mostrarGrandes, casa)}`}`;
  return renderComercial({ active: 'lojas', title: 'Comparador de Lojas', body, user });
}
