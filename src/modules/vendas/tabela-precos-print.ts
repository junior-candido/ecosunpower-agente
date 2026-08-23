// src/modules/vendas/tabela-precos-print.ts
// Print da loja (Belenus / Sol Fácil) → vision → lista de /tabela → Junior confirma com "ok tabela".
// A IA só TRANSCREVE o que está na imagem; o que ela não viu, não entra.
import type { ItemTabela, FonteItem } from './tabela-precos-parser.js';
import { nomeItem, type TabelaPrecosService } from './tabela-precos.js';

/** Teto de itens por print: lista maior que isso vira spam no zap. */
export const MAX_ITENS_PRINT = 30;
/** Preço plausível de módulo/micro — fora disso é leitura errada da imagem. */
const PRECO_MIN = 1;
const PRECO_MAX = 200_000;

export function montarPromptPrint(): string {
  return [
    'Esta imagem é um print de loja de equipamentos solares (lista de preços).',
    'Transcreva SOMENTE módulos fotovoltaicos e microinversores com preço visível.',
    'NÃO invente valores, modelos ou quantidades. Se não estiver legível, deixe de fora.',
    'Preço = valor à vista / Pix em reais, por unidade.',
    'Para microinversor, preencha modulos_por_unidade SÓ se o número de entradas/módulos estiver escrito na imagem (ex.: "4 módulos", "-4T"); senão omita o campo.',
    'Responda APENAS um bloco ```json``` com um array de objetos:',
    '{"tipo":"modulo"|"micro","marca":"JA","modelo":"625","potencia_w":625,"modulos_por_unidade":4,"preco":980.5}',
    'Array vazio [] se não houver nada legível.',
  ].join('\n');
}

/**
 * Texto vindo da IA não é confiável: pode trazer quebra de linha, comando
 * injetado ("/tabela cabos = 1") ou lixo. Deixa só letra/número/espaço e os
 * sinais que aparecem em modelo de verdade (. - / +), no máximo 40 caracteres.
 */
const limpar = (x: unknown): string => String(x ?? '').replace(/[^\w .\-\/+]/g, '').trim().slice(0, 40);

/** Acha o JSON: cerca ```json, cerca ``` pelada, ou o primeiro array [...] balanceado. */
function extrairJson(raw: string): string | null {
  const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (cerca) return cerca[1];
  const inicio = raw.indexOf('[');
  if (inicio < 0) return null;
  let nivel = 0;
  for (let i = inicio; i < raw.length; i++) {
    if (raw[i] === '[') nivel++;
    else if (raw[i] === ']' && --nivel === 0) return raw.slice(inicio, i + 1);
  }
  return null;
}

export function parseItensDoPrint(raw: string, fonte: FonteItem): { aceitos: ItemTabela[]; rejeitados: string[]; cortados: number } {
  const vazio = { aceitos: [], rejeitados: [], cortados: 0 };
  const bruto = extrairJson(raw ?? '');
  if (!bruto) return vazio;
  let arr: any[];
  try { arr = JSON.parse(bruto); } catch { return vazio; }
  if (!Array.isArray(arr)) return vazio;
  const aceitos: ItemTabela[] = [];
  const rejeitados: string[] = [];
  for (const o of arr) {
    const preco = Number(o?.preco);
    const precoOk = Number.isFinite(preco) && preco >= PRECO_MIN && preco <= PRECO_MAX;
    const marca = limpar(o?.marca);
    const modelo = limpar(o?.modelo);
    if (o?.tipo === 'modulo') {
      const w = Number(o.potencia_w);
      if (!marca || !modelo || !precoOk || !(w > 0)) { rejeitados.push(`${marca} ${modelo} (módulo incompleto)`.trim()); continue; }
      aceitos.push({ tipo: 'modulo', marca, modelo, potenciaW: w, modulosPorUnidade: null, precoUnitario: preco, unidade: 'un', fonte });
    } else if (o?.tipo === 'micro') {
      const mpu = Number(o.modulos_por_unidade);
      if (!marca || !modelo || !precoOk) { rejeitados.push(`${marca} ${modelo} (micro incompleto)`.trim()); continue; }
      if (!(mpu > 0)) { rejeitados.push(`${marca} ${modelo} (micro sem módulos por unidade)`); continue; }
      aceitos.push({ tipo: 'micro', marca, modelo, potenciaW: null, modulosPorUnidade: mpu, precoUnitario: preco, unidade: 'un', fonte });
    } else {
      rejeitados.push(`tipo "${limpar(o?.tipo) || String(o?.tipo)}" desconhecido`);
    }
  }
  const cortados = Math.max(0, aceitos.length - MAX_ITENS_PRINT);
  return { aceitos: aceitos.slice(0, MAX_ITENS_PRINT), rejeitados, cortados };
}

/**
 * O comando proposto tem que voltar redondo pelo parser: inteiro sem separador
 * de milhar (1050, nunca "1.050") e decimal com vírgula (1450,5).
 */
const comandoDe = (i: ItemTabela): string => {
  const fonte = i.fonte !== 'junior' ? `fonte ${i.fonte} ` : '';
  const preco = String(i.precoUnitario).replace('.', ',');
  return i.tipo === 'micro'
    ? `/tabela ${fonte}micro ${i.marca} ${i.modelo} ${i.modulosPorUnidade} = ${preco}`
    : `/tabela ${fonte}${i.marca} ${i.modelo} = ${preco}`;
};

const PENDENCIA_MS = 30 * 60_000;

export interface LeitorPrintDeps {
  svc: Pick<TabelaPrecosService, 'atualizar'>;
  /** Tabela é coisa do dono: quem não é admin nem gasta vision. */
  isAdminPhone: (from: string) => boolean;
  sendText: (to: string, text: string) => Promise<void>;
  lerImagem: (base64: string, mimeType: string, prompt: string) => Promise<string>;
  agoraMs: () => number;
  /** Janela da pendência "ok tabela" (padrão 30 min). Injetável pra teste. */
  pendenciaMs?: number;
}

export class LeitorPrintTabela {
  private pendentes = new Map<string, { itens: ItemTabela[]; criadoEmMs: number }>();
  constructor(private readonly d: LeitorPrintDeps) {}

  private get janelaMs(): number { return this.d.pendenciaMs ?? PENDENCIA_MS; }

  /** Imagem do admin com legenda contendo "tabela". Devolve true se consumiu. */
  async tratarImagem(from: string, img: { base64: string; mimeType: string; legenda?: string | null }): Promise<boolean> {
    if (!this.d.isAdminPhone(from)) return false;
    const legenda = (img.legenda ?? '').toLowerCase();
    if (!/\btabela\b/.test(legenda)) return false;
    try {
      const fonte: FonteItem = /belenus/.test(legenda) ? 'belenus' : /sol\s*f[áa]cil|solfacil/.test(legenda) ? 'solfacil' : 'junior';
      let raw = '';
      try {
        raw = await this.d.lerImagem(img.base64, img.mimeType, montarPromptPrint());
      } catch (e) {
        console.error('[tabela] vision falhou', e instanceof Error ? e.message : e);
        await this.d.sendText(from, '⚠️ a leitura da imagem falhou, tenta de novo.');
        return true;
      }
      const { aceitos, rejeitados, cortados } = parseItensDoPrint(raw, fonte);
      if (!aceitos.length) {
        await this.d.sendText(from, `🔍 Li o print mas não achei preço legível de módulo/micro.${rejeitados.length ? `\nDeixei de fora: ${rejeitados.join('; ')}` : ''}\nPode mandar no texto: /tabela JA 625 = 980`);
        return true;
      }
      this.pendentes.set(from, { itens: aceitos, criadoEmMs: this.d.agoraMs() });
      const linhas = aceitos.map(comandoDe).join('\n');
      const fora = rejeitados.length ? `\n\nDeixei de fora: ${rejeitados.join('; ')}` : '';
      const corte = cortados ? `\n(o print tem mais item — mostrei só os ${MAX_ITENS_PRINT} primeiros)` : '';
      await this.d.sendText(from, `🔍 Li no print (${fonte}):\n${linhas}${corte}${fora}\n\nResponda *ok tabela* pra gravar, ou mande os /tabela corrigidos.`);
      return true;
    } catch (e) {
      console.error('[tabela] print explodiu', e instanceof Error ? e.message : e);
      await this.d.sendText(from, '⚠️ deu erro lendo o print, tenta de novo.').catch(() => {});
      return true;
    }
  }

  /** "ok tabela" do admin com pendência viva. Devolve true se consumiu. */
  async tratarTexto(from: string, text: string): Promise<boolean> {
    if (!this.d.isAdminPhone(from)) return false;
    if (!/^ok\s+tabela$/i.test(text.trim())) return false;
    const p = this.pendentes.get(from);
    if (!p) return false;
    try {
      const agora = this.d.agoraMs();
      if (agora - p.criadoEmMs > this.janelaMs) {
        this.pendentes.delete(from);
        await this.d.sendText(from, 'A leitura do print expirou (30 min). Manda a foto de novo.');
        return true;
      }
      this.pendentes.delete(from);
      let gravados = 0;
      const falhas: string[] = [];
      for (const i of p.itens) {
        const r = await this.d.svc.atualizar(i, agora);
        if (r?.ok) gravados++; else falhas.push(nomeItem(i));
      }
      const partes: string[] = [];
      if (gravados) partes.push(`✅ ${gravados} ${gravados === 1 ? 'item gravado' : 'itens gravados'} na tabela.`);
      if (falhas.length) partes.push(`⚠️ ${falhas.length} ${falhas.length === 1 ? 'falhou' : 'falharam'}: ${falhas.join('; ')}`);
      await this.d.sendText(from, partes.join('\n'));
      return true;
    } catch (e) {
      console.error('[tabela] gravar print explodiu', e instanceof Error ? e.message : e);
      this.pendentes.delete(from);
      await this.d.sendText(from, '⚠️ deu erro gravando a tabela, tenta de novo.').catch(() => {});
      return true;
    }
  }
}
