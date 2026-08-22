// src/modules/vendas/tabela-precos-print.ts
// Print da loja (Belenus / Sol Fácil) → vision → lista de /tabela → Junior confirma com "ok tabela".
// A IA só TRANSCREVE o que está na imagem; o que ela não viu, não entra.
import type { ItemTabela, FonteItem } from './tabela-precos-parser.js';
import type { TabelaPrecosService } from './tabela-precos.js';

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

export function parseItensDoPrint(raw: string, fonte: FonteItem): { aceitos: ItemTabela[]; rejeitados: string[] } {
  const m = /```json\s*([\s\S]*?)```/i.exec(raw);
  if (!m) return { aceitos: [], rejeitados: [] };
  let arr: any[];
  try { arr = JSON.parse(m[1]); } catch { return { aceitos: [], rejeitados: [] }; }
  if (!Array.isArray(arr)) return { aceitos: [], rejeitados: [] };
  const aceitos: ItemTabela[] = [];
  const rejeitados: string[] = [];
  for (const o of arr) {
    const preco = Number(o?.preco);
    const marca = String(o?.marca ?? '').trim();
    const modelo = String(o?.modelo ?? '').trim();
    if (o?.tipo === 'modulo') {
      const w = Number(o.potencia_w);
      if (!marca || !modelo || !(preco > 0) || !(w > 0)) { rejeitados.push(`${marca} ${modelo} (módulo incompleto)`.trim()); continue; }
      aceitos.push({ tipo: 'modulo', marca, modelo, potenciaW: w, modulosPorUnidade: null, precoUnitario: preco, unidade: 'un', fonte });
    } else if (o?.tipo === 'micro') {
      const mpu = Number(o.modulos_por_unidade);
      if (!marca || !modelo || !(preco > 0)) { rejeitados.push(`${marca} ${modelo} (micro incompleto)`.trim()); continue; }
      if (!(mpu > 0)) { rejeitados.push(`${marca} ${modelo} (micro sem módulos por unidade)`); continue; }
      aceitos.push({ tipo: 'micro', marca, modelo, potenciaW: null, modulosPorUnidade: mpu, precoUnitario: preco, unidade: 'un', fonte });
    } else {
      rejeitados.push(`tipo "${String(o?.tipo)}" desconhecido`);
    }
  }
  return { aceitos, rejeitados };
}

const comandoDe = (i: ItemTabela): string => {
  const fonte = i.fonte !== 'junior' ? `fonte ${i.fonte} ` : '';
  const preco = i.precoUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return i.tipo === 'micro'
    ? `/tabela ${fonte}micro ${i.marca} ${i.modelo} ${i.modulosPorUnidade} = ${preco}`
    : `/tabela ${fonte}${i.marca} ${i.modelo} = ${preco}`;
};

const PENDENCIA_MS = 30 * 60_000;

export interface LeitorPrintDeps {
  svc: Pick<TabelaPrecosService, 'atualizar'>;
  sendText: (to: string, text: string) => Promise<void>;
  lerImagem: (base64: string, mimeType: string, prompt: string) => Promise<string>;
  agoraMs: () => number;
}

export class LeitorPrintTabela {
  private pendentes = new Map<string, { itens: ItemTabela[]; criadoEmMs: number }>();
  constructor(private readonly d: LeitorPrintDeps) {}

  /** Imagem do admin com legenda contendo "tabela". Devolve true se consumiu. */
  async tratarImagem(from: string, img: { base64: string; mimeType: string; legenda?: string | null }): Promise<boolean> {
    const legenda = (img.legenda ?? '').toLowerCase();
    if (!/\btabela\b/.test(legenda)) return false;
    const fonte: FonteItem = /belenus/.test(legenda) ? 'belenus' : /sol\s*f[áa]cil|solfacil/.test(legenda) ? 'solfacil' : 'junior';
    let raw = '';
    try { raw = await this.d.lerImagem(img.base64, img.mimeType, montarPromptPrint()); }
    catch (e) { console.error('[tabela] vision falhou', e instanceof Error ? e.message : e); }
    const { aceitos, rejeitados } = parseItensDoPrint(raw, fonte);
    if (!aceitos.length) {
      await this.d.sendText(from, `🔍 Li o print mas não achei preço legível de módulo/micro.${rejeitados.length ? `\nDeixei de fora: ${rejeitados.join('; ')}` : ''}\nPode mandar no texto: /tabela JA 625 = 980`);
      return true;
    }
    this.pendentes.set(from, { itens: aceitos, criadoEmMs: this.d.agoraMs() });
    const linhas = aceitos.map(comandoDe).join('\n');
    const fora = rejeitados.length ? `\n\nDeixei de fora: ${rejeitados.join('; ')}` : '';
    await this.d.sendText(from, `🔍 Li no print (${fonte}):\n${linhas}${fora}\n\nResponda *ok tabela* pra gravar, ou mande os /tabela corrigidos.`);
    return true;
  }

  /** "ok tabela" do admin com pendência viva. Devolve true se consumiu. */
  async tratarTexto(from: string, text: string): Promise<boolean> {
    if (!/^ok\s+tabela$/i.test(text.trim())) return false;
    const p = this.pendentes.get(from);
    if (!p) return false;
    if (this.d.agoraMs() - p.criadoEmMs > PENDENCIA_MS) { this.pendentes.delete(from); return false; }
    this.pendentes.delete(from);
    const agora = this.d.agoraMs();
    for (const i of p.itens) await this.d.svc.atualizar(i, agora);
    await this.d.sendText(from, `✅ ${p.itens.length} ${p.itens.length === 1 ? 'item gravado' : 'itens gravados'} na tabela.`);
    return true;
  }
}
