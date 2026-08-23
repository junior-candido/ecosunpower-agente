// src/modules/vendas/precificador.ts
// Precificador (spec §4). PURO: recebe consumo-alvo + tabela, devolve opções A/B.
// NENHUM número nasce aqui por achismo: régua 3,75 (golden PV*SOL DF/GO), tabela do Junior,
// serviço por faixa aprovada, trava Greener. Única dependência impura: a parcela do cartão,
// injetada via `parcela` (default = tabela oficial solfácil 18x) — testável sem mockar nada externo.
import { compararGreener } from '../proposal/calculator.js';
import { parcelaCartaoSolar } from '../proposal/cartao-solar.js';
import { servicoRsPorWp } from './autonomia.js';
import type { ItemPreco } from './tabela-precos.js';
import { PRECO_VELHO_DIAS, diasDesde } from './tabela-precos.js';
import type { Telhado } from './tabela-precos-parser.js';

export const PRODUTIVIDADE_KWH_KWP_DIA = 3.75;
export const TETO_RS_POR_WP = 2.60;

const r2 = (v: number) => Math.round(v * 100) / 100;

export function kwpAlvo(consumoAlvoKwh: number): number {
  return (consumoAlvoKwh * 12) / (PRODUTIVIDADE_KWH_KWP_DIA * 365);
}

export interface OpcaoPrecificada {
  rotulo: 'A' | 'B';
  moduloMarca: string; moduloModelo: string; moduloWp: number; modulos: number;
  microMarca: string; microModelo: string; micros: number;
  kwpReal: number;
  kit: number; servico: number; total: number; rsPorWp: number;
  parcela18x: number | null;
  greener: { rotulo: string; rsPorWpReferencia: number };
}

export interface Aviso { tipo: 'preco_velho' | 'acima_mercado' | 'so_uma_marca'; texto: string }

export type ResultadoPrecificacao =
  | { ok: true; consumoAlvoKwh: number; kwpAlvo: number; telhado: Telhado; servicoRsPorWp: number; opcoes: OpcaoPrecificada[]; avisos: Aviso[] }
  | { ok: false; erro: 'consumo_invalido' | 'tabela_incompleta'; faltando: string[] };

export interface PrecificarInput {
  consumoAlvoKwh: number;
  telhado: Telhado;
  tabela: ItemPreco[];
  agoraMs: number;
  /** Injetável pra teste. Default = tabela oficial do cartão (solfácil, 18x). */
  parcela?: (total: number) => number | null;
}

/** Ordem estável pra desempate de itens da tabela (marca+modelo). */
const porMarcaModelo = (x: { marca: string; modelo: string }, y: { marca: string; modelo: string }) =>
  `${x.marca} ${x.modelo}`.localeCompare(`${y.marca} ${y.modelo}`);

const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function precificar(p: PrecificarInput): ResultadoPrecificacao {
  if (!Number.isFinite(p.consumoAlvoKwh) || p.consumoAlvoKwh <= 0) return { ok: false, erro: 'consumo_invalido', faltando: [] };

  const calcParcela = p.parcela ?? ((total: number) => parcelaCartaoSolar(total, 18, 'solfacil')?.parcela ?? null);

  const modulosTab = p.tabela.filter(i => i.tipo === 'modulo' && (i.potenciaW ?? 0) > 0 && i.precoUnitario > 0);
  const microsTab = p.tabela.filter(i => i.tipo === 'micro' && (i.modulosPorUnidade ?? 0) > 0 && i.precoUnitario > 0);
  const estrutura = p.tabela
    .filter(i => i.tipo === 'estrutura' && i.marca === p.telhado && i.precoUnitario > 0)
    .sort(porMarcaModelo)[0];
  const cabos = p.tabela
    .filter(i => i.tipo === 'cabos_protecao' && i.precoUnitario > 0)
    .sort(porMarcaModelo)[0];
  const faltando: string[] = [];
  if (!modulosTab.length) faltando.push('módulo');
  if (!microsTab.length) faltando.push('micro');
  // Estrutura e cabos são OPCIONAIS (decisão Junior 23/08): quando não estão na tabela,
  // entram como zero — o material de instalação já está dentro do serviço por Wp.
  if (faltando.length) return { ok: false, erro: 'tabela_incompleta', faltando };

  const alvo = kwpAlvo(p.consumoAlvoKwh);
  const rsWpServico = servicoRsPorWp(p.consumoAlvoKwh);

  type Cand = Omit<OpcaoPrecificada, 'rotulo'> & { itensUsados: ItemPreco[] };
  const candidatos: Cand[] = modulosTab.map(mod => {
    const wp = mod.potenciaW!;
    const modulos = Math.ceil((alvo * 1000) / wp);
    const kwpRealExato = (modulos * wp) / 1000;
    // micro mais barato pra esse número de módulos
    const micro = microsTab
      .map(m => { const qtd = Math.ceil(modulos / m.modulosPorUnidade!); return { m, qtd, custo: qtd * m.precoUnitario }; })
      .sort((x, y) => x.custo - y.custo)[0];
    const kit = modulos * mod.precoUnitario + micro.custo + modulos * (estrutura?.precoUnitario ?? 0) + kwpRealExato * (cabos?.precoUnitario ?? 0);
    const servico = kwpRealExato * 1000 * rsWpServico;
    const total = kit + servico;
    const rsPorWp = total / (kwpRealExato * 1000);
    const g = compararGreener(kwpRealExato, rsPorWp);
    return {
      moduloMarca: mod.marca, moduloModelo: mod.modelo, moduloWp: wp, modulos,
      microMarca: micro.m.marca, microModelo: micro.m.modelo, micros: micro.qtd,
      kwpReal: r2(kwpRealExato),
      kit: r2(kit), servico: r2(servico), total: r2(total), rsPorWp: Math.round(rsPorWp * 1000) / 1000,
      parcela18x: calcParcela(r2(total)),
      greener: { rotulo: g.rotulo, rsPorWpReferencia: g.rsPorWpReferencia },
      itensUsados: [mod, micro.m, ...(estrutura ? [estrutura] : []), ...(cabos ? [cabos] : [])],
    };
  }).sort((x, y) => x.total - y.total || y.kwpReal - x.kwpReal || porMarcaModelo(
    { marca: x.moduloMarca, modelo: x.moduloModelo }, { marca: y.moduloMarca, modelo: y.moduloModelo },
  ));

  const a = candidatos[0];
  const b = candidatos.find(c => c.moduloMarca !== a.moduloMarca) ?? null;
  const escolhidos: Cand[] = b ? [a, b] : [a];
  const avisos: Aviso[] = [];
  if (!b) avisos.push({ tipo: 'so_uma_marca', texto: 'Só uma marca de módulo na tabela — sem opção B.' });

  const precoVelhoVistos = new Set<string>();
  const opcoes: OpcaoPrecificada[] = escolhidos.map((c, idx) => {
    const rotulo = idx === 0 ? 'A' : 'B';
    if (c.rsPorWp > TETO_RS_POR_WP) {
      avisos.push({ tipo: 'acima_mercado', texto: `${rotulo} a ${num2(c.rsPorWp)} R$/Wp — acima do teto ${num2(TETO_RS_POR_WP)} (Greener ${num2(c.greener.rsPorWpReferencia)}) ${c.greener.rotulo}` });
    }
    for (const i of c.itensUsados) {
      const d = diasDesde(i.atualizadoEmMs, p.agoraMs);
      const nome = i.tipo === 'estrutura' ? `estrutura ${i.marca}` : i.tipo === 'cabos_protecao' ? 'cabos' : `${i.marca} ${i.modelo}`;
      const chave = `${i.tipo}|${nome}`;
      if (d > PRECO_VELHO_DIAS && !precoVelhoVistos.has(chave)) {
        precoVelhoVistos.add(chave);
        avisos.push({ tipo: 'preco_velho', texto: `${nome} com preço de ${d} d — confere na loja.` });
      }
    }
    const { itensUsados: _omit, ...resto } = c;
    return { rotulo, ...resto };
  });

  return { ok: true, consumoAlvoKwh: p.consumoAlvoKwh, kwpAlvo: r2(alvo), telhado: p.telhado, servicoRsPorWp: rsWpServico, opcoes, avisos };
}
