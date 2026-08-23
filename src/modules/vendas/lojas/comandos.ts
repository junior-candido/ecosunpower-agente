// src/modules/vendas/lojas/comandos.ts
// Comandos no zap pra usar a tabela viva sem abrir o dashboard:
//   /comparar sungrow 5kw   → melhor preço do produto nas 3 lojas
//   /cotar 12000 5          → cotação (materiais=12000, kWp=5) com imposto/margem padrão
// Puro no parsing/formatação; o handler só lê o catalogo_loja e responde.
import type { CatalogoLojaService, ItemCatalogo } from './catalogo-loja.js';
import { compararLojas, type GrupoComparacao } from './comparador.js';
import { calcularCotacao, resumoCotacao } from './cotacao.js';

const FONTE_LABEL: Record<string, string> = { belenus: 'Belenus', solfacil: 'Sol Fácil', fortlev: 'Fortlev' };
const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Extrai uma potência do texto: "5kw" → 5000 W · "625w"/"625wp" → 625. null se não achar. */
export function potenciaDoTexto(t: string): number | null {
  const kw = t.match(/(\d+(?:[.,]\d+)?)\s*kw/i);
  if (kw) return Math.round(Number(kw[1].replace(',', '.')) * 1000);
  const w = t.match(/(\d{3,4})\s*wp?\b/i);
  if (w) return Number(w[1]);
  return null;
}

/** Filtra itens do catálogo pelo texto: todas as palavras (fora a potência) batem em
 * marca/modelo/descrição, e se houver potência no texto ela tem que casar (±2%). */
export function filtrarPorTexto(itens: ItemCatalogo[], texto: string): ItemCatalogo[] {
  const pot = potenciaDoTexto(texto);
  const termos = semAcento(texto)
    .replace(/\d+(?:[.,]\d+)?\s*(kw|wp?)\b/gi, ' ')  // tira a potência dos termos
    .split(/\s+/).filter((w) => w.length >= 2);
  return itens.filter((i) => {
    const alvo = semAcento(`${i.marca} ${i.modelo} ${i.descricao} ${i.categoria}`);
    if (!termos.every((t) => alvo.includes(t))) return false;
    if (pot != null) {
      if (i.potenciaW == null) return false;
      const dif = Math.abs(i.potenciaW - pot) / pot;
      if (dif > 0.02) return false;
    }
    return true;
  });
}

/** Formata os grupos comparados pro zap. */
export function formatarComparar(grupos: GrupoComparacao[], texto: string): string {
  if (!grupos.length) return `🔎 Não achei "${texto}" no catálogo das lojas (ou só tem em 1 loja). Tenta ex.: /comparar sungrow 5kw · /comparar risen 715`;
  const linhas = grupos.slice(0, 8).map((g) => {
    const pot = g.potenciaW ? (g.categoria === 'modulo' ? `${g.potenciaW}Wp` : `${g.potenciaW / 1000}kW`) : '';
    const ofertas = g.ofertas.map((o) => `${FONTE_LABEL[o.fonte] ?? o.fonte} ${brl(o.preco)}`).join(' · ');
    return `*${g.marca} ${pot}*\n${ofertas}\n→ 🏆 ${FONTE_LABEL[g.melhor.fonte] ?? g.melhor.fonte}: ${brl(g.melhor.preco)} (economia ${brl(g.economia)} / ${g.economiaPct}%)`;
  });
  return `🏪 *Comparador* — "${texto}"\n\n${linhas.join('\n\n')}`;
}

export interface ComandoCotar { custoMateriais: number; kwp: number; }
/** Parseia "/cotar 12000 5" → {custoMateriais:12000, kwp:5}. null se formato inválido. */
export function parseCotar(texto: string): ComandoCotar | null {
  const nums = texto.replace(/^\/cotar\s*/i, '').trim().split(/\s+/).map((x) => Number(x.replace(/\./g, '').replace(',', '.')));
  if (nums.length < 2 || nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return { custoMateriais: nums[0], kwp: nums[1] };
}

export interface LojasHandlerDeps {
  svc: CatalogoLojaService;
  isAdminPhone: (from: string) => boolean;
  sendText: (to: string, text: string) => Promise<void>;
  /** Padrões da casa pra cotação (ajustáveis por env/config). */
  servicoRsPorWp?: number;
  impostoPct?: number;
  margemAlvoPct?: number;
  margemMinimaPct?: number;
}

/** Handler dos comandos /comparar e /cotar. Retorna true se tratou a mensagem. */
export function makeLojasHandler(d: LojasHandlerDeps): (from: string, text: string) => Promise<boolean> {
  return async (from, text) => {
    if (!d.isAdminPhone(from)) return false;
    const t = text.trim();

    // /lojas → status da tabela viva (quantos itens por loja + quando atualizou).
    // O "teste eficiente": uma mensagem diz tudo, sem abrir log nem dashboard.
    if (/^\/lojas\b/i.test(t) && !/^\/lojas\s+\S/.test(t)) {
      try {
        const itens = await d.svc.listarAtivos();
        const cont: Record<string, number> = { belenus: 0, solfacil: 0, fortlev: 0 };
        let maisRecente = 0;
        for (const i of itens) { cont[i.fonte] = (cont[i.fonte] ?? 0) + 1; if (i.atualizadoEmMs > maisRecente) maisRecente = i.atualizadoEmMs; }
        const h = maisRecente ? Math.floor((Date.now() - maisRecente) / 3_600_000) : null;
        const quando = h == null ? 'sem sync ainda' : h === 0 ? 'agora há pouco' : h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
        const linha = (f: string, nome: string) => `${cont[f] > 0 ? '✅' : '⚠️'} ${nome}: ${cont[f] ?? 0}`;
        await d.sendText(from,
          `🏪 *Tabela viva* (${itens.length} itens · ${quando})\n` +
          `${linha('belenus', 'Belenus')}\n${linha('solfacil', 'Sol Fácil')}\n${linha('fortlev', 'Fortlev')}\n\n` +
          `Comparar: */comparar sungrow 5kw* · Cotar: */cotar 12000 5*`);
      } catch (e) {
        await d.sendText(from, '⚠️ Não consegui ler a tabela viva agora.');
        console.error('[lojas] /lojas', e instanceof Error ? e.message : e);
      }
      return true;
    }

    if (/^\/comparar\b/i.test(t)) {
      const alvo = t.replace(/^\/comparar\s*/i, '').trim();
      if (!alvo) { await d.sendText(from, 'Ex.: /comparar sungrow 5kw · /comparar risen 715 · /comparar deye hibrido'); return true; }
      try {
        const itens = await d.svc.listarAtivos();
        const filtrados = filtrarPorTexto(itens, alvo);
        const grupos = compararLojas(filtrados, { incluirLojaUnica: true });
        await d.sendText(from, formatarComparar(grupos, alvo));
      } catch (e) {
        await d.sendText(from, '⚠️ Não consegui comparar agora. Tenta de novo em instantes.');
        console.error('[lojas] /comparar', e instanceof Error ? e.message : e);
      }
      return true;
    }

    if (/^\/cotar\b/i.test(t)) {
      const c = parseCotar(t);
      if (!c) { await d.sendText(from, 'Ex.: /cotar 12000 5  (materiais = R$12.000, sistema = 5 kWp)'); return true; }
      try {
        const cot = calcularCotacao({
          custoMateriais: c.custoMateriais, potenciaKwp: c.kwp,
          servicoRsPorWp: d.servicoRsPorWp ?? 0.85,
          impostoPct: d.impostoPct ?? 6,
          margemAlvoPct: d.margemAlvoPct ?? 25,
          margemMinimaPct: d.margemMinimaPct ?? 12,
        });
        await d.sendText(from, resumoCotacao(cot));
      } catch (e) {
        await d.sendText(from, '⚠️ ' + (e instanceof Error ? e.message : 'não consegui cotar'));
      }
      return true;
    }

    return false;
  };
}
