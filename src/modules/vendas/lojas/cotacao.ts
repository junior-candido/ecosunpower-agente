// src/modules/vendas/lojas/cotacao.ts
// Cotação inteligente: a MATEMÁTICA da venda (custo real → imposto → margem → preço
// sugerido → margem de desconto). PURO e testável. A Eva NÃO calcula preço — consome
// isto. Imposto e serviço entram como parâmetro (o motor de imposto/precificador que
// já existe alimenta). Multi-tenant-friendly: nada de EcoSun hardcode.
import type { GrupoComparacao } from './comparador.js';

export interface EntradaCotacao {
  custoMateriais: number;    // soma do melhor preço × qtd (do comparador/catalogo_loja)
  potenciaKwp: number;       // pra calcular o serviço
  servicoRsPorWp: number;    // R$/Wp de serviço (ex.: 0,85)
  impostoPct: number;        // % de imposto sobre o faturamento (ex.: 6)
  margemAlvoPct: number;     // lucro desejado como % do preço de venda (ex.: 25)
  margemMinimaPct?: number;  // piso de margem pra calcular o desconto máximo (ex.: 12)
}

export interface Cotacao {
  custoMateriais: number;
  custoServico: number;
  custoTotal: number;        // materiais + serviço (sem imposto/lucro)
  precoSugerido: number;     // preço de venda com imposto + margem alvo embutidos
  impostoValor: number;
  lucro: number;             // R$ de lucro no preço sugerido
  lucroPct: number;          // = margemAlvoPct
  precoMinimo: number;       // menor preço mantendo a margem mínima
  descontoMaxRs: number;     // quanto dá pra baixar do sugerido até o mínimo
  descontoMaxPct: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Modelo: imposto e margem incidem sobre o PREÇO DE VENDA (faturamento).
 *   preco = custoTotal / (1 − (imposto% + margem%)/100)
 * Assim, no preço sugerido: imposto = preco×imposto%, lucro = preco×margem%.
 */
export function calcularCotacao(e: EntradaCotacao): Cotacao {
  const custoServico = r2(e.potenciaKwp * 1000 * e.servicoRsPorWp);
  const custoTotal = r2(e.custoMateriais + custoServico);

  const div = 1 - (e.impostoPct + e.margemAlvoPct) / 100;
  if (div <= 0) throw new Error('imposto + margem alvo >= 100% — impossível precificar');
  const precoSugerido = r2(custoTotal / div);
  const impostoValor = r2(precoSugerido * e.impostoPct / 100);
  const lucro = r2(precoSugerido - custoTotal - impostoValor);

  const margMin = e.margemMinimaPct ?? e.margemAlvoPct;
  const divMin = 1 - (e.impostoPct + margMin) / 100;
  const precoMinimo = divMin > 0 ? r2(custoTotal / divMin) : precoSugerido;
  const descontoMaxRs = r2(Math.max(0, precoSugerido - precoMinimo));
  const descontoMaxPct = precoSugerido > 0 ? r2((descontoMaxRs / precoSugerido) * 100) : 0;

  return { custoMateriais: r2(e.custoMateriais), custoServico, custoTotal, precoSugerido,
    impostoValor, lucro, lucroPct: e.margemAlvoPct, precoMinimo, descontoMaxRs, descontoMaxPct };
}

const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mensagem pro Junior no zap na hora de cotar. */
export function resumoCotacao(c: Cotacao): string {
  return [
    `💰 *Cotação*`,
    `Materiais (melhor preço 3 lojas): ${brl(c.custoMateriais)}`,
    `Serviço: ${brl(c.custoServico)}`,
    `Custo total: ${brl(c.custoTotal)}`,
    `Imposto: ${brl(c.impostoValor)}`,
    `*Preço sugerido: ${brl(c.precoSugerido)}* (lucro ${brl(c.lucro)} · ${c.lucroPct}%)`,
    `Pode baixar até ${brl(c.precoMinimo)} (desconto máx ${brl(c.descontoMaxRs)} / ${c.descontoMaxPct}%) mantendo a margem mínima.`,
  ].join('\n');
}

export interface OportunidadeDesconto {
  descricao: string;
  comprandoEm: string;     // loja mais barata
  precoMelhor: number;
  seComprarEm: string;     // loja mais cara (onde pedir desconto)
  precoPior: number;
  economia: number;        // pior − melhor
  economiaPct: number;
}

/**
 * A partir dos grupos comparados, lista onde há folga de negociação: comprar na
 * loja mais barata OU pedir desconto ao vendedor da mais cara pra igualar.
 * Só devolve onde a economia passa de `minimoRs` (default R$ 50).
 */
export function oportunidadesDesconto(grupos: GrupoComparacao[], minimoRs = 50): OportunidadeDesconto[] {
  return grupos
    .filter((g) => g.economia >= minimoRs && g.ofertas.length >= 2)
    .map((g) => {
      const pior = g.ofertas[g.ofertas.length - 1];
      return {
        descricao: `${g.marca} ${g.potenciaW ? (g.categoria === 'modulo' ? g.potenciaW + 'Wp' : g.potenciaW / 1000 + 'kW') : ''}`.trim(),
        comprandoEm: g.melhor.fonte, precoMelhor: g.melhor.preco,
        seComprarEm: pior.fonte, precoPior: pior.preco,
        economia: g.economia, economiaPct: g.economiaPct,
      };
    })
    .sort((a, b) => b.economia - a.economia);
}
