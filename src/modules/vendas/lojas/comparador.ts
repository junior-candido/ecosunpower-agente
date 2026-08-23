// src/modules/vendas/lojas/comparador.ts
// Comparador de melhor preço entre lojas (Belenus/Sol Fácil/Fortlev), sobre
// ItemLoja[] normalizado. PURO e testável. Frete FORA de escopo (Junior 24/08:
// cada loja usa várias transportadoras + particular → estimar seria chute).
import type { CategoriaLoja, ItemLoja } from './tipos.js';

/** Tensão nominal lida da descrição (127/220/380/800). null se não achar. */
export function tensaoDeTexto(texto: string): number | null {
  const m = (texto || '').match(/(127|220|380|800)\s*v(?![a-z])/i);
  return m ? Number(m[1]) : null;
}

/** Fase lida da descrição: 'mono' | 'bif' | 'tri'. null se não achar. */
export function faseDeTexto(texto: string): 'mono' | 'bif' | 'tri' | null {
  const t = (texto || '').toUpperCase();
  if (/\bTRIF|TRI(?:Á|A)SIC|\bTRI\b/.test(t)) return 'tri';
  if (/\bBIF|BIFASIC|SPLIT\s*PHASE|127\/220/.test(t)) return 'bif';
  if (/\bMONOF|MONOFASIC|\bMONO\b/.test(t)) return 'mono';
  return null;
}

export interface OfertaLoja {
  fonte: ItemLoja['fonte'];
  sku: string;
  modelo: string;
  descricao: string;
  preco: number;
  datasheet: string | null;
}

export interface GrupoComparacao {
  chave: string;
  categoria: CategoriaLoja;
  marca: string;
  potenciaW: number | null;
  tensao: number | null;
  fase: 'mono' | 'bif' | 'tri' | null;
  ofertas: OfertaLoja[];       // ordenadas do mais barato ao mais caro
  melhor: OfertaLoja;
  economia: number;            // preço do pior − preço do melhor
  economiaPct: number;         // economia / pior * 100
}

const up = (s: string) => (s || '').trim().toUpperCase();

const ehInversor = (c: CategoriaLoja) =>
  c === 'micro' || c === 'inversor_string' || c === 'inversor_hibrido';

/**
 * Chave BASE de equivalência. Módulo: categoria+marca+Wp. Inversor/micro:
 * +tensão (SEM fase — muitas descrições da Fortlev não trazem MONO/TRI e ficariam
 * sem par). A fase entra depois só como desempate de conflito (ver compararLojas).
 */
function chaveBase(i: ItemLoja): string | null {
  const marca = up(i.marca);
  if (!marca || i.precoUnitario <= 0) return null;
  if (i.categoria === 'modulo') {
    if (!i.potenciaW) return null;
    return `modulo|${marca}|${i.potenciaW}Wp`;
  }
  if (ehInversor(i.categoria)) {
    if (!i.potenciaW) return null;
    const tensao = tensaoDeTexto(i.descricao);
    return `${i.categoria}|${marca}|${i.potenciaW}W|${tensao ?? '?'}V`;
  }
  // baterias/estrutura/cabo/componente: casa por marca+modelo
  const modelo = up(i.modelo);
  if (!modelo) return null;
  return `${i.categoria}|${marca}|${modelo}`;
}

/**
 * Agrupa itens equivalentes e devolve, por grupo, a oferta mais barata e a
 * economia vs. a mais cara. Por padrão só grupos com 2+ LOJAS distintas
 * (é onde existe escolha de compra); passe {incluirLojaUnica:true} pra ver todos.
 */
export function compararLojas(
  itens: ItemLoja[],
  opts: { incluirLojaUnica?: boolean } = {},
): GrupoComparacao[] {
  const grupos = new Map<string, { rep: ItemLoja; porFonte: Map<string, OfertaLoja> }>();

  for (const i of itens) {
    const chave = chaveBase(i);
    if (!chave) continue;
    let g = grupos.get(chave);
    if (!g) { g = { rep: i, porFonte: new Map() }; grupos.set(chave, g); }
    const oferta: OfertaLoja = {
      fonte: i.fonte, sku: i.sku, modelo: i.modelo, descricao: i.descricao,
      preco: i.precoUnitario, datasheet: i.datasheet,
    };
    // por fonte, guarda a mais barata (uma loja pode ter o mesmo item em SKUs diferentes)
    const atual = g.porFonte.get(i.fonte);
    if (!atual || oferta.preco < atual.preco) g.porFonte.set(i.fonte, oferta);
  }

  const out: GrupoComparacao[] = [];
  for (const [chave, g] of grupos) {
    const ofertas = [...g.porFonte.values()].sort((a, b) => a.preco - b.preco);
    if (!opts.incluirLojaUnica && ofertas.length < 2) continue;
    const melhor = ofertas[0];
    const pior = ofertas[ofertas.length - 1];
    const economia = Number((pior.preco - melhor.preco).toFixed(2));
    out.push({
      chave,
      categoria: g.rep.categoria,
      marca: g.rep.marca,
      potenciaW: g.rep.potenciaW,
      tensao: tensaoDeTexto(g.rep.descricao),
      fase: faseDeTexto(g.rep.descricao),
      ofertas,
      melhor,
      economia,
      economiaPct: pior.preco > 0 ? Number(((economia / pior.preco) * 100).toFixed(1)) : 0,
    });
  }
  // maiores economias primeiro
  out.sort((a, b) => b.economia - a.economia);
  return out;
}

/** Resumo pro zap: onde comprar mais barato + economia. */
export function resumoComparacao(g: GrupoComparacao): string {
  const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lojas = g.ofertas.map((o) => `${o.fonte} ${brl(o.preco)}`).join(' · ');
  const pot = g.potenciaW ? (g.categoria === 'modulo' ? `${g.potenciaW}Wp` : `${(g.potenciaW / 1000)}kW`) : '';
  const espec = [pot, g.tensao ? `${g.tensao}V` : '', g.fase ?? ''].filter(Boolean).join(' ');
  return `${g.marca} ${espec}\n${lojas}\n→ mais barato na *${g.melhor.fonte}*: ${brl(g.melhor.preco)} (economia ${brl(g.economia)} / ${g.economiaPct}%)`;
}
