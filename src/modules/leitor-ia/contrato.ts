// Leitor de conta de luz / print de monitoramento por IA — contrato com o programa
// "Gerador de Relatórios Solar" (repo produtos/gerador-relatorios-solar, src/dominio/leitura-ia.ts).
//
// O programa só chama esta rota quando o OCR offline dele NÃO conseguiu ler algum número. Ele manda
// a imagem (página inteira + pedaços ampliados) e a lista de campos que faltam (os MESMOS ids que o
// leitor do programa usa: "consumo:anterior", "historico:kwh", "item:3:valor"…). Aqui só se valida
// o pedido: tamanho, tipo de imagem (pelos bytes, não pelo que o pedido diz), quantidade de campos.
// Nada disto é gravado — a imagem é lida e descartada (LGPD).

export type MimeImagem = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImagemIa { mime: MimeImagem; base64: string; papel: 'pagina' | 'recorte' }
export interface CampoIa { id: string; rotulo: string; dica?: string }

/**
 * Quem pede vem nos CABEÇALHOS (X-GRS-Computador, X-GRS-Licenca): a licença e os limites são
 * conferidos ANTES de ler o corpo (imagens) — pedido sem direito nem chega a ocupar memória.
 */
export interface PedidoBase {
  versao: string;
  imagens: ImagemIa[];
}
export interface PedidoConta extends PedidoBase {
  nivel: 1 | 2;
  campos: CampoIa[];
  contexto: { distribuidora: string | null; referencia: string | null };
}
export interface PedidoPrint extends PedidoBase {
  mesAlvo: string | null;
}

export type PeriodoIa = 'mes' | 'ano' | 'dia' | 'total' | 'desconhecido';
export type UnidadeEnergia = 'Wh' | 'kWh' | 'MWh' | 'GWh';
export interface LeituraPrintIa {
  texto: string;
  numero: number;
  unidade: UnidadeEnergia;
  mes: string | null;
  periodo: PeriodoIa;
  rotulo: string | null;
}

/** A API da Anthropic aceita até 5 MB por imagem (base64): fica abaixo com folga. */
export const MAX_BYTES_IMAGEM = 3_750_000;
export const MAX_BYTES_TOTAL = 12_000_000;
export const MAX_IMAGENS = 10;
export const MAX_CAMPOS = 40;
/** Lado maior aceito (o programa manda até 1568 px; print de celular em WEBP vai como está). */
export const MAX_LADO_PX = 2600;

const MIMES: MimeImagem[] = ['image/png', 'image/jpeg', 'image/webp'];
const ID_CAMPO = /^[a-z]{1,12}(:[a-z0-9]{1,12}){0,2}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Texto que vem do programa e vai para o prompt: sem caracteres de controle, curto. */
export function textoLimpo(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Largura × altura do cabeçalho do PNG ou do JPEG (null = não achou / outro tipo). */
export function tamanhoDaImagem(b: Buffer): { w: number; h: number } | null {
  if (b.length >= 24 && b[0] === 0x89 && b.toString('latin1', 12, 16) === 'IHDR') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Tipo da imagem pelos primeiros bytes (o que o pedido diz não conta). */
export function mimePelosBytes(b: Buffer): MimeImagem | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

type Validado<T> = { ok: true; pedido: T } | { ok: false; mensagem: string };

function validarBase(corpo: unknown): Validado<PedidoBase> {
  if (!corpo || typeof corpo !== 'object') return { ok: false, mensagem: 'Pedido vazio.' };
  const o = corpo as Record<string, unknown>;
  if (!Array.isArray(o.imagens) || o.imagens.length < 1 || o.imagens.length > MAX_IMAGENS) {
    return { ok: false, mensagem: `Mande de 1 a ${MAX_IMAGENS} imagens.` };
  }
  const imagens: ImagemIa[] = [];
  let total = 0;
  for (const bruto of o.imagens) {
    const i = (bruto ?? {}) as Record<string, unknown>;
    if (typeof i.base64 !== 'string' || !BASE64.test(i.base64)) return { ok: false, mensagem: 'Imagem em formato errado.' };
    if (i.base64.length > Math.ceil(MAX_BYTES_IMAGEM / 3) * 4) return { ok: false, mensagem: 'Imagem grande demais.' };
    const bytes = Buffer.from(i.base64, 'base64');
    total += bytes.length;
    if (total > MAX_BYTES_TOTAL) return { ok: false, mensagem: 'Imagens grandes demais.' };
    const mime = mimePelosBytes(bytes);
    if (!mime || !MIMES.includes(mime)) return { ok: false, mensagem: 'Só PNG, JPG ou WEBP.' };
    const tam = tamanhoDaImagem(bytes);
    if (tam && (Math.max(tam.w, tam.h) > MAX_LADO_PX || tam.w < 1 || tam.h < 1)) return { ok: false, mensagem: 'Imagem grande demais.' };
    imagens.push({ mime, base64: i.base64, papel: i.papel === 'recorte' ? 'recorte' : 'pagina' });
  }
  return {
    ok: true,
    pedido: {
      versao: textoLimpo(o.versao, 20) ?? '?',
      imagens,
    },
  };
}

const REF = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validarPedidoConta(corpo: unknown): Validado<PedidoConta> {
  const b = validarBase(corpo);
  if (!b.ok) return b;
  const o = corpo as Record<string, unknown>;
  if (o.nivel !== 1 && o.nivel !== 2) return { ok: false, mensagem: 'Nível inválido.' };
  if (!Array.isArray(o.campos) || o.campos.length < 1 || o.campos.length > MAX_CAMPOS) {
    return { ok: false, mensagem: `Mande de 1 a ${MAX_CAMPOS} campos.` };
  }
  const campos: CampoIa[] = [];
  const vistos = new Set<string>();
  for (const bruto of o.campos) {
    const c = (bruto ?? {}) as Record<string, unknown>;
    if (typeof c.id !== 'string' || !ID_CAMPO.test(c.id) || vistos.has(c.id)) return { ok: false, mensagem: 'Campo inválido.' };
    vistos.add(c.id);
    const rotulo = textoLimpo(c.rotulo, 90);
    if (!rotulo) return { ok: false, mensagem: 'Campo sem rótulo.' };
    const dica = textoLimpo(c.dica, 220);
    campos.push({ id: c.id, rotulo, ...(dica ? { dica } : {}) });
  }
  const ctx = (o.contexto ?? {}) as Record<string, unknown>;
  const referencia = typeof ctx.referencia === 'string' && REF.test(ctx.referencia) ? ctx.referencia : null;
  return {
    ok: true,
    pedido: { ...b.pedido, nivel: o.nivel, campos, contexto: { distribuidora: textoLimpo(ctx.distribuidora, 30), referencia } },
  };
}

export function validarPedidoPrint(corpo: unknown): Validado<PedidoPrint> {
  const b = validarBase(corpo);
  if (!b.ok) return b;
  const o = corpo as Record<string, unknown>;
  if (b.pedido.imagens.length > 2) return { ok: false, mensagem: 'Mande 1 imagem do print.' };
  const mesAlvo = typeof o.mesAlvo === 'string' && REF.test(o.mesAlvo) ? o.mesAlvo : null;
  return { ok: true, pedido: { ...b.pedido, mesAlvo } };
}
