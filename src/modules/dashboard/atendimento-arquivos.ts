// src/modules/dashboard/atendimento-arquivos.ts
// Baixar os arquivos da conversa (Junior 28/09: "senti falta de baixar as
// imagens e PDF somente com um clique, da conversa da Eva"). Tudo PURO aqui
// (nome amigável, qual anexo antigo é de qual balão, plano do .zip e o zip em
// si) — as rotas (atendimento-rotas.ts) conferem empresa/vendedor/dono.

const FUSO = 'America/Sao_Paulo';

export type TipoArquivo = 'foto' | 'pdf' | 'documento' | 'audio' | 'video';

/** Tipo pelo mime (e, sem mime, pela extensão). PURA. */
export function tipoDoArquivo(mime: string | null | undefined, nome?: string | null): TipoArquivo {
  const m = (mime ?? '').toLowerCase();
  const ext = (nome ?? '').toLowerCase().split('.').pop() ?? '';
  if (m.startsWith('image/') || /^(jpe?g|png|webp|gif|heic)$/.test(ext)) return 'foto';
  if (m.includes('pdf') || ext === 'pdf') return 'pdf';
  if (m.startsWith('audio/') || /^(ogg|opus|mp3|m4a|wav|webm)$/.test(ext)) return 'audio';
  if (m.startsWith('video/') || /^(mp4|mov|3gp)$/.test(ext)) return 'video';
  return 'documento';
}

const EXT_POR_MIME: Array<[RegExp, string]> = [
  [/jpe?g/, 'jpg'], [/png/, 'png'], [/webp/, 'webp'], [/gif/, 'gif'], [/pdf/, 'pdf'],
  [/ogg|opus/, 'ogg'], [/mpeg|mp3/, 'mp3'], [/mp4/, 'mp4'], [/webm/, 'webm'], [/wordprocessingml|msword/, 'docx'],
  [/spreadsheetml|excel/, 'xlsx'], [/csv/, 'csv'], [/presentationml|powerpoint/, 'pptx'], [/plain/, 'txt'],
];

/** Extensão segura (a do nome/caminho, senão a do mime). PURA. */
export function extensaoDoArquivo(nomeOuCaminho: string | null | undefined, mime?: string | null): string {
  const e = (nomeOuCaminho ?? '').split(/[\\/]/).pop()?.split('.');
  const daqui = e && e.length > 1 ? e.pop()!.toLowerCase() : '';
  if (/^[a-z0-9]{1,5}$/.test(daqui)) return daqui;
  const m = (mime ?? '').toLowerCase();
  return EXT_POR_MIME.find(([re]) => re.test(m))?.[1] ?? 'bin';
}

/** "Ana Maria d'Ávila" → "Ana-Maria-dAvila" (sem acento, sem símbolo, até 40). PURA. */
export function pedacoDeNome(s: string | null | undefined): string {
  const t = String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return t || 'cliente';
}

/** Data do arquivo no fuso de Brasília: 2026-09-28. PURA. */
export function dataDoArquivo(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'sem-data';
  return new Date(t).toLocaleDateString('en-CA', { timeZone: FUSO });
}

/** Nome amigável: "<cliente>_<data>_<tipo>.<ext>" (ex.: Ana-Exemplo_2026-09-28_foto.jpg). PURA. */
export function nomeAmigavel(p: { cliente: string | null | undefined; quando: string | null | undefined; tipo: TipoArquivo; ext: string }): string {
  const ext = /^[a-z0-9]{1,5}$/.test(p.ext) ? p.ext : 'bin';
  return `${pedacoDeNome(p.cliente)}_${dataDoArquivo(p.quando)}_${p.tipo}.${ext}`;
}

/** Nomes repetidos dentro do .zip: _2, _3… antes da extensão. PURA. */
export function nomesUnicos(nomes: string[]): string[] {
  const vistos = new Map<string, number>();
  return nomes.map((n) => {
    const k = n.toLowerCase();
    const q = (vistos.get(k) ?? 0) + 1;
    vistos.set(k, q);
    if (q === 1) return n;
    const p = n.lastIndexOf('.');
    return p > 0 ? `${n.slice(0, p)}_${q}${n.slice(p)}` : `${n}_${q}`;
  });
}

// ---------------------------------------------------------------------------
// Mídia ANTIGA da Eva: o balão diz só "[Enviou uma foto]" e o arquivo está no
// cofre lead_anexos. Casa com CERTEZA ou não casa (fica o link "ver nos
// arquivos do lead", como antes).
// ---------------------------------------------------------------------------

export interface AnexoDoLead { id: string; tipo?: string | null; mime_type: string | null; created_at: string; created_by?: string | null; descricao?: string | null }
export interface MsgParaCasar { role: string; content: string; timestamp: string | null; midia?: unknown; wamid?: string | null }

/** Marcador antigo de mídia da Eva → tipo esperado do anexo. */
export function marcadorAntigo(conteudo: string): 'foto' | 'pdf' | 'documento' | null {
  if (/^\[(Enviou uma foto|imagem)\]/i.test(conteudo)) return 'foto';
  if (/^\[Enviou um PDF\]/i.test(conteudo)) return 'pdf';
  if (/^\[documento\]/i.test(conteudo)) return 'documento';
  return null;
}

/** Janela para casar pelo horário (a Eva arquiva e anota a mensagem no mesmo atendimento). */
export const JANELA_CASAR_MS = 3 * 60_000;

/**
 * Qual anexo é de qual balão antigo (índice da mensagem → anexo). Regras:
 *  1. o anexo traz "msg:<wamid>" da própria mensagem → casa;
 *  2. senão, pelo horário: o anexo do MESMO tipo, enviado pelo cliente, até
 *     3 min da mensagem — e só se for o ÚNICO candidato (nem outro anexo perto
 *     desta mensagem, nem outra mensagem do mesmo tipo perto deste anexo).
 * Cada anexo casa uma vez. Na dúvida, não casa. PURA.
 */
export function casarMidiaAntiga(mensagens: MsgParaCasar[], anexos: AnexoDoLead[]): Map<number, AnexoDoLead> {
  const out = new Map<number, AnexoDoLead>();
  if (!anexos.length) return out;
  const usados = new Set<string>();
  const doCliente = anexos.filter((a) => !a.created_by || a.created_by === 'cliente');
  const tipoAnx = (a: AnexoDoLead): TipoArquivo => tipoDoArquivo(a.mime_type);
  const combina = (t: 'foto' | 'pdf' | 'documento', a: AnexoDoLead) => t === 'documento' ? tipoAnx(a) === 'pdf' || tipoAnx(a) === 'documento' : tipoAnx(a) === t;
  const alvos: Array<{ i: number; t: 'foto' | 'pdf' | 'documento'; ts: number }> = [];
  mensagens.forEach((m, i) => {
    if (m.role !== 'user' || m.midia) return;
    const t = marcadorAntigo(m.content ?? '');
    if (!t) return;
    // 1) pelo id do WhatsApp
    if (m.wamid) {
      const a = doCliente.find((x) => !usados.has(x.id) && (x.descricao ?? '').includes(`msg:${m.wamid}`));
      if (a) { out.set(i, a); usados.add(a.id); return; }
    }
    const ts = m.timestamp ? Date.parse(m.timestamp) : NaN;
    if (Number.isFinite(ts)) alvos.push({ i, t, ts });
  });
  for (const alvo of alvos) {
    if (out.has(alvo.i)) continue;
    const perto = doCliente.filter((a) => !usados.has(a.id) && combina(alvo.t, a) && Math.abs(Date.parse(a.created_at) - alvo.ts) <= JANELA_CASAR_MS);
    if (perto.length !== 1) continue;
    const a = perto[0];
    const concorrentes = alvos.filter((o) => o !== alvo && !out.has(o.i) && combina(o.t, a) && Math.abs(Date.parse(a.created_at) - o.ts) <= JANELA_CASAR_MS);
    if (concorrentes.length) continue;
    out.set(alvo.i, a);
    usados.add(a.id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// "⬇ Baixar tudo" — .zip de fotos e PDFs do lead (sem compressão: foto e PDF
// já vêm comprimidos; o arquivo vai saindo enquanto é montado).
// ---------------------------------------------------------------------------

export const LIMITE_ZIP_ARQUIVOS = 300;
export const LIMITE_ZIP_BYTES = 200 * 1024 * 1024;

export interface ItemDoZip { origem: 'anexo' | 'midia'; id: string; caminho: string; mime: string | null; nome: string | null; quando: string; bytes: number | null; wamid?: string | null; descricao?: string | null }

/** Só fotos e PDFs; sem repetir o mesmo arquivo (anexo antigo com "msg:<wamid>" de uma mídia nova); do mais antigo pro mais novo; nomes amigáveis únicos. PURA. */
export function planoDoZip(itens: ItemDoZip[], cliente: string | null, lim = { arquivos: LIMITE_ZIP_ARQUIVOS, bytes: LIMITE_ZIP_BYTES }): { entram: Array<ItemDoZip & { nomeNoZip: string }>; ficaram: number } {
  const wamids = new Set(itens.filter((x) => x.origem === 'midia' && x.wamid).map((x) => x.wamid!));
  const bons = itens
    .filter((x) => { const t = tipoDoArquivo(x.mime, x.nome ?? x.caminho); return t === 'foto' || t === 'pdf'; })
    .filter((x) => !(x.origem === 'anexo' && [...wamids].some((w) => (x.descricao ?? '').includes(`msg:${w}`))))
    .sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
  const entram: ItemDoZip[] = [];
  let soma = 0;
  for (const x of bons) {
    if (entram.length >= lim.arquivos) break;
    if ((x.bytes ?? 0) > 0 && soma + (x.bytes ?? 0) > lim.bytes) continue;
    soma += x.bytes ?? 0;
    entram.push(x);
  }
  const nomes = nomesUnicos(entram.map((x) => nomeAmigavel({ cliente, quando: x.quando, tipo: tipoDoArquivo(x.mime, x.nome ?? x.caminho), ext: extensaoDoArquivo(x.nome ?? x.caminho, x.mime) })));
  return { entram: entram.map((x, i) => ({ ...x, nomeNoZip: nomes[i] })), ficaram: bons.length - entram.length };
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** CRC-32 (o do ZIP). PURA. */
export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d: Date): { hora: number; dia: number } {
  // o .zip guarda a hora "de parede" — usa a de Brasília
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).reduce<Record<string, number>>((o, x) => { if (x.type !== 'literal') o[x.type] = Number(x.value); return o; }, {});
  const ano = Math.max(1980, p.year ?? 1980);
  return { hora: ((p.hour ?? 0) << 11) | ((p.minute ?? 0) << 5) | Math.floor((p.second ?? 0) / 2), dia: ((ano - 1980) << 9) | ((p.month ?? 1) << 5) | (p.day ?? 1) };
}

/**
 * Escritor de .zip (método "guardar", sem compressão) que manda cada arquivo
 * assim que chega — nada de juntar tudo na memória. `escrever` recebe os
 * pedaços em ordem (ex.: res.write). Nomes em UTF-8.
 */
export class ZipEmFluxo {
  private central: Buffer[] = [];
  private pos = 0;
  private qtd = 0;
  constructor(private escrever: (b: Buffer) => void | Promise<void>) {}
  async arquivo(nome: string, dados: Buffer, quando = new Date()): Promise<void> {
    const n = Buffer.from(nome, 'utf-8');
    const crc = crc32(dados);
    const { hora, dia } = dataDos(quando);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(hora, 10); local.writeUInt16LE(dia, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    const cab = Buffer.alloc(46);
    cab.writeUInt32LE(0x02014b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(20, 6); cab.writeUInt16LE(0x0800, 8); cab.writeUInt16LE(0, 10);
    cab.writeUInt16LE(hora, 12); cab.writeUInt16LE(dia, 14); cab.writeUInt32LE(crc, 16); cab.writeUInt32LE(dados.length, 20); cab.writeUInt32LE(dados.length, 24);
    cab.writeUInt16LE(n.length, 28); cab.writeUInt32LE(this.pos, 42);
    this.central.push(cab, n);
    await this.escrever(Buffer.concat([local, n]));
    await this.escrever(dados);
    this.pos += 30 + n.length + dados.length;
    this.qtd++;
  }
  async fechar(): Promise<void> {
    const dir = Buffer.concat(this.central);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(this.qtd, 8); fim.writeUInt16LE(this.qtd, 10);
    fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(this.pos, 16);
    await this.escrever(Buffer.concat([dir, fim]));
  }
}
