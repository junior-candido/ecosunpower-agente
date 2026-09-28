// src/modules/midia-whatsapp.ts
//
// W1 — MÍDIA no atendimento pelo WhatsApp (foto, PDF/documento, áudio, vídeo
// curto), nos dois números: o da Eva (WABA oficial) e o pessoal do dono (QR).
//
// Regras (Junior, 28/09/2026):
//  - o ARQUIVO fica no Storage do Supabase, no bucket PRIVADO `whatsapp-midia`
//    (migration 141), num caminho que começa pela EMPRESA
//    (`<company_id>/<ano>/<mês>/<uuid>.<ext>`) — nunca pelo nome do cliente;
//  - a mensagem (mensagens_whatsapp) aponta para o arquivo (midia_caminho…);
//  - para exibir: URL assinada CURTA (2 min), gerada só depois de conferir que
//    quem pede pode ver a conversa (rota /dashboard/leads/midia/:id);
//  - só tipos permitidos; executável/HTML/SVG nunca; o CONTEÚDO tem que bater
//    com o tipo (olhamos os primeiros bytes, não só o nome);
//  - limites da Meta: foto 5 MB; áudio/vídeo/documento 16 MB.
//
// Funções PURAS em cima; as que tocam o storage recebem o client de SERVIÇO
// (o storage não tem RLS por empresa — o isolamento é o caminho + a conferência
// do servidor). Nada aqui lança por causa do banco/storage.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { gravarMensagem, type NovaMensagem } from './mensagens-whatsapp.js';

export const BUCKET_MIDIA = 'whatsapp-midia';
/** Foto: limite da Meta (Cloud API) para imagem. */
export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
/** Áudio, vídeo e documento: 16 MB (limite da Meta para áudio/vídeo; documento fica igual por segurança). */
export const LIMITE_MIDIA_BYTES = 16 * 1024 * 1024;
/** URL assinada para ver/baixar: curta (2 min). */
export const TTL_URL_MIDIA_S = 120;
export const LIMITE_LEGENDA = 1024;

export type TipoMidia = 'imagem' | 'video' | 'audio' | 'documento';

interface TipoPermitido {
  mime: string;
  ext: string[];
  tipo: TipoMidia;
  confere: (b: Buffer) => boolean;
  /** Gravação do navegador: vira OGG/Opus antes de sair (a Meta não aceita WebM). */
  precisaConverter?: boolean;
}

const comeca = (b: Buffer, bytes: number[], desloc = 0) => b.length >= desloc + bytes.length && bytes.every((x, i) => b[desloc + i] === x);
const comecaTexto = (b: Buffer, t: string, desloc = 0) => comeca(b, [...Buffer.from(t, 'latin1')], desloc);
const ehFtyp = (b: Buffer) => comecaTexto(b, 'ftyp', 4);
const ehZip = (b: Buffer) => comeca(b, [0x50, 0x4b, 0x03, 0x04]);
const ehOle = (b: Buffer) => comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ehTextoSimples = (b: Buffer) => !b.subarray(0, 8192).includes(0) && !comecaTexto(b, 'MZ') && !comeca(b, [0x7f, 0x45, 0x4c, 0x46]);
const ehMp3 = (b: Buffer) => comecaTexto(b, 'ID3') || (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0);

/** A lista branca. O que não está aqui não entra nem sai. */
const TIPOS: TipoPermitido[] = [
  { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], tipo: 'imagem', confere: (b) => comeca(b, [0xff, 0xd8, 0xff]) },
  { mime: 'image/png', ext: ['png'], tipo: 'imagem', confere: (b) => comeca(b, [0x89, 0x50, 0x4e, 0x47]) },
  { mime: 'image/webp', ext: ['webp'], tipo: 'imagem', confere: (b) => comecaTexto(b, 'RIFF') && comecaTexto(b, 'WEBP', 8) },
  { mime: 'video/mp4', ext: ['mp4'], tipo: 'video', confere: ehFtyp },
  { mime: 'video/3gpp', ext: ['3gp'], tipo: 'video', confere: ehFtyp },
  { mime: 'audio/ogg', ext: ['ogg', 'oga', 'opus'], tipo: 'audio', confere: (b) => comecaTexto(b, 'OggS') },
  { mime: 'audio/mpeg', ext: ['mp3'], tipo: 'audio', confere: ehMp3 },
  { mime: 'audio/mp4', ext: ['m4a'], tipo: 'audio', confere: ehFtyp },
  { mime: 'audio/aac', ext: ['aac'], tipo: 'audio', confere: (b) => b.length > 1 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0 },
  { mime: 'audio/amr', ext: ['amr'], tipo: 'audio', confere: (b) => comecaTexto(b, '#!AMR') },
  { mime: 'audio/webm', ext: ['webm'], tipo: 'audio', confere: (b) => comeca(b, [0x1a, 0x45, 0xdf, 0xa3]), precisaConverter: true },
  { mime: 'application/pdf', ext: ['pdf'], tipo: 'documento', confere: (b) => comecaTexto(b, '%PDF') },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: ['docx'], tipo: 'documento', confere: ehZip },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: ['xlsx'], tipo: 'documento', confere: ehZip },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: ['pptx'], tipo: 'documento', confere: ehZip },
  { mime: 'application/msword', ext: ['doc'], tipo: 'documento', confere: ehOle },
  { mime: 'application/vnd.ms-excel', ext: ['xls'], tipo: 'documento', confere: ehOle },
  { mime: 'text/plain', ext: ['txt'], tipo: 'documento', confere: ehTextoSimples },
  { mime: 'text/csv', ext: ['csv'], tipo: 'documento', confere: ehTextoSimples },
];

/** Nomes que o navegador/celular às vezes manda para o mesmo tipo. */
const APELIDOS: Record<string, string> = {
  'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'audio/mp3': 'audio/mpeg', 'audio/x-m4a': 'audio/mp4',
  'audio/opus': 'audio/ogg', 'video/webm': 'audio/webm', 'application/x-pdf': 'application/pdf',
};

/** Extensões que NUNCA passam (mesmo no fim de um nome duplo tipo "conta.pdf.exe"). */
const EXT_PROIBIDA = /\.(exe|bat|cmd|com|msi|scr|pif|cpl|js|jse|vbs|vbe|wsf|ps1|psm1|jar|apk|app|sh|bash|dll|sys|lnk|reg|hta|html?|svg|xhtml|php|py|rb|pl|iso|img|dmg)$/i;

/** O que o painel aceita no seletor de arquivo (mesma lista do servidor). */
export const ACEITA_NO_SELETOR = [...new Set(TIPOS.flatMap((t) => [t.mime, ...t.ext.map((e) => `.${e}`)]))].join(',');

export type ArquivoValidado = { ok: true; tipo: TipoMidia; mime: string; ext: string; nome: string; bytes: number; precisaConverter: boolean };
export type MotivoArquivo = 'vazio' | 'grande_demais' | 'tipo_nao_permitido' | 'conteudo_nao_confere';

/** Nome de arquivo seguro: sem pasta, sem caractere estranho, até 120 letras. PURA. */
export function nomeSeguro(nome: string | null | undefined): string {
  const base = String(nome ?? '').split(/[\\/]/).pop() ?? '';
  const limpo = base.replace(/[\u0000-\u001f"<>|*?:]/g, '').replace(/^\.+/, '').trim();
  if (!limpo) return 'arquivo';
  if (limpo.length <= 120) return limpo;
  const ponto = limpo.lastIndexOf('.');
  const ext = ponto > 0 && limpo.length - ponto <= 8 ? limpo.slice(ponto) : '';
  return limpo.slice(0, 120 - ext.length) + ext;
}

/**
 * O arquivo pode entrar/sair? Tipo pela lista branca (mime; sem mime útil,
 * pela extensão), conteúdo conferido pelos primeiros bytes, tamanho pelo tipo. PURA.
 */
export function validarArquivo(a: { nome?: string | null; mime?: string | null; dados: Buffer }): ArquivoValidado | { ok: false; motivo: MotivoArquivo } {
  const nome = nomeSeguro(a.nome);
  if (EXT_PROIBIDA.test(nome)) return { ok: false, motivo: 'tipo_nao_permitido' };
  if (!a.dados || a.dados.length === 0) return { ok: false, motivo: 'vazio' };
  const mimeBruto = String(a.mime ?? '').toLowerCase().split(';')[0].trim();
  const mime = APELIDOS[mimeBruto] ?? mimeBruto;
  const ext = (nome.includes('.') ? nome.split('.').pop() ?? '' : '').toLowerCase();
  let t = TIPOS.find((x) => x.mime === mime);
  if (!t && (!mime || mime === 'application/octet-stream')) t = TIPOS.find((x) => x.ext.includes(ext));
  if (!t) return { ok: false, motivo: 'tipo_nao_permitido' };
  // Executável disfarçado, qualquer que seja o tipo declarado.
  if (comecaTexto(a.dados, 'MZ') || comeca(a.dados, [0x7f, 0x45, 0x4c, 0x46])) return { ok: false, motivo: 'conteudo_nao_confere' };
  if (!t.confere(a.dados)) return { ok: false, motivo: 'conteudo_nao_confere' };
  const limite = t.tipo === 'imagem' ? LIMITE_IMAGEM_BYTES : LIMITE_MIDIA_BYTES;
  if (a.dados.length > limite) return { ok: false, motivo: 'grande_demais' };
  const extFinal = t.ext.includes(ext) ? ext : t.ext[0];
  return { ok: true, tipo: t.tipo, mime: t.mime, ext: extFinal, nome, bytes: a.dados.length, precisaConverter: !!t.precisaConverter };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `<empresa>/<ano>/<mês>/<id>.<ext>` — a empresa SEMPRE na frente. PURA. */
export function caminhoDaMidia(companyId: string, ext: string, quando = new Date(), id: string = randomUUID()): string {
  if (!UUID_RE.test(companyId)) throw new Error('empresa inválida para o caminho da mídia');
  const e = String(ext).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin';
  const ano = quando.getUTCFullYear();
  const mes = String(quando.getUTCMonth() + 1).padStart(2, '0');
  return `${companyId}/${ano}/${mes}/${String(id).replace(/[^a-zA-Z0-9-]/g, '')}.${e}`;
}

/** O caminho é desta empresa? (defesa extra ao gerar URL). PURA. */
export function caminhoDaEmpresa(caminho: string | null | undefined, companyId: string): boolean {
  return !!caminho && !!companyId && caminho.startsWith(`${companyId}/`) && !caminho.includes('..');
}

export async function guardarMidia(
  servico: SupabaseClient,
  a: { companyId: string; dados: Buffer; mime: string; ext: string },
): Promise<{ ok: true; caminho: string } | { ok: false; erro: string }> {
  try {
    const caminho = caminhoDaMidia(a.companyId, a.ext);
    const { error } = await servico.storage.from(BUCKET_MIDIA).upload(caminho, a.dados, { contentType: a.mime, upsert: false });
    if (error) return { ok: false, erro: error.message };
    return { ok: true, caminho };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function apagarMidia(servico: SupabaseClient, caminho: string): Promise<void> {
  try { await servico.storage.from(BUCKET_MIDIA).remove([caminho]); } catch { /* sobra um arquivo órfão, sem dado exposto */ }
}

/** URL assinada curta (null = não achou / erro). `baixarComo` força o download com esse nome. */
export async function urlDaMidia(servico: SupabaseClient, caminho: string, o: { baixarComo?: string | null } = {}): Promise<string | null> {
  try {
    const { data, error } = await servico.storage.from(BUCKET_MIDIA)
      .createSignedUrl(caminho, TTL_URL_MIDIA_S, o.baixarComo ? { download: nomeSeguro(o.baixarComo) } : undefined);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function baixarMidiaGuardada(servico: SupabaseClient, caminho: string): Promise<Buffer | null> {
  try {
    const { data, error } = await servico.storage.from(BUCKET_MIDIA).download(caminho);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

const MARCADOR: Record<TipoMidia, string> = { imagem: '[imagem]', video: '[vídeo]', audio: '[áudio]', documento: '[documento]' };

export function marcadorDaMidia(tipo: TipoMidia): string { return MARCADOR[tipo]; }

/** Texto que fica na mensagem (lista, busca e memória da Eva continuam lendo texto). PURA. */
export function textoDaMidia(tipo: TipoMidia, legenda?: string | null, nomeArquivo?: string | null): string {
  const l = String(legenda ?? '').trim();
  const n = tipo === 'documento' ? String(nomeArquivo ?? '').trim() : '';
  const resto = l || n;
  return resto ? `${MARCADOR[tipo]} ${resto}` : MARCADOR[tipo];
}

export function tamanhoLegivel(bytes: number | null | undefined): string {
  const b = Number(bytes ?? 0);
  if (!Number.isFinite(b) || b <= 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace('.', ',').replace(',0', '')} MB`;
}

/** Tipo de mensagem do WhatsApp → tipo da mídia. */
export const TIPO_DA_ENTRADA: Record<string, TipoMidia | undefined> = { image: 'imagem', video: 'video', audio: 'audio', document: 'documento' };

export type ResultadoArquivar = 'gravada' | 'sem_arquivo' | 'duplicada' | 'falhou';

/**
 * Mídia que CHEGOU (cliente → número da Eva ou número pessoal; ou o dono pelo
 * celular): baixa, confere, guarda e grava a mensagem ligada ao arquivo.
 * Download/tipo/bucket falhou → grava só o marcador (o histórico não perde a
 * mensagem). Tipo proibido NUNCA é guardado. Nunca lança.
 */
export async function arquivarMidiaRecebida(
  servico: SupabaseClient,
  p: {
    baixar: () => Promise<{ base64: string; mimetype: string } | null>;
    linha: NovaMensagem & { tipo: TipoMidia };
    legenda?: string | null;
    nomeArquivo?: string | null;
    transcricao?: string | null;
    /** Áudio sem transcrição (ex.: Eva pausada): transcreve com o arquivo já baixado. */
    transcrever?: (base64: string, mime: string) => Promise<string | null>;
  },
): Promise<ResultadoArquivar> {
  const tipo = p.linha.tipo;
  const nome = p.nomeArquivo ? nomeSeguro(p.nomeArquivo) : null;
  const texto = textoDaMidia(tipo, p.legenda, nome).slice(0, 4096);
  let midia: Partial<NovaMensagem> = {};
  let caminho: string | null = null;
  let transcricaoNova: string | null = null;
  try {
    const bruto = await p.baixar().catch(() => null);
    if (bruto?.base64 && tipo === 'audio' && !p.transcricao && p.transcrever) {
      transcricaoNova = await p.transcrever(bruto.base64, bruto.mimetype).catch(() => null);
    }
    if (bruto?.base64) {
      const dados = Buffer.from(bruto.base64, 'base64');
      const v = validarArquivo({ nome: nome ?? `recebido.${tipo}`, mime: bruto.mimetype, dados });
      if (v.ok) {
        const g = await guardarMidia(servico, { companyId: p.linha.company_id, dados, mime: v.mime, ext: v.ext });
        if (g.ok) {
          caminho = g.caminho;
          midia = { midia_caminho: g.caminho, midia_mime: v.mime, midia_nome: nome ?? null, midia_bytes: v.bytes };
        } else {
          console.warn(`[midia] arquivo recebido não guardado (${tipo}): ${g.erro}`);
        }
      } else {
        console.warn(`[midia] arquivo recebido recusado (${tipo}): ${v.motivo}`);
      }
    }
  } catch (e) {
    console.warn(`[midia] falha ao baixar/guardar (${tipo}): ${(e as Error).message}`);
  }
  const transcricao = String(p.transcricao ?? transcricaoNova ?? '').trim().slice(0, 4000) || null;
  const r = await gravarMensagem(servico, { ...p.linha, tipo, texto, ...midia, ...(transcricao ? { transcricao } : {}) });
  if (!r.ok) {
    if (caminho) await apagarMidia(servico, caminho);
    return 'falhou';
  }
  if (r.duplicada) {
    if (caminho) await apagarMidia(servico, caminho);
    return 'duplicada';
  }
  return caminho ? 'gravada' : 'sem_arquivo';
}

const CASA = '00000000-0000-0000-0000-000000000001';

/**
 * Mídia que chegou no número da ASSISTENTE (a Eva na casa; a assistente do
 * tenant por QR): depois do atendimento dela, o arquivo vai para o painel —
 * a empresa toda vê (não é conversa pessoal). Sem lead (bloqueado/ignorado)
 * não grava nada. Nunca lança.
 */
export async function arquivarMidiaDaAssistente(
  servico: SupabaseClient,
  p: {
    companyId: string;
    telefone: string;
    lead: { id: string; company_id?: string | null } | null;
    tipoEntrada: string;
    wamid: string | null;
    recebidaEm: string | null;
    legenda?: string | null;
    nomeArquivo?: string | null;
    contatoNome?: string | null;
    transcricao?: string | null;
    baixar: () => Promise<{ base64: string; mimetype: string } | null>;
    transcrever?: (base64: string, mime: string) => Promise<string | null>;
  },
): Promise<ResultadoArquivar | 'ignorada'> {
  const tipo = TIPO_DA_ENTRADA[p.tipoEntrada];
  if (!tipo || !p.lead?.id || !p.companyId) return 'ignorada';
  // O lead tem que ser da empresa do canal (lead legado sem empresa = casa).
  if ((p.lead.company_id ?? CASA) !== p.companyId) return 'ignorada';
  const t = p.recebidaEm ? Date.parse(p.recebidaEm) : NaN;
  const quando = Number.isFinite(t) && t > 0 && t <= Date.now() + 60_000 ? new Date(Math.min(t, Date.now())).toISOString() : null;
  try {
    return await arquivarMidiaRecebida(servico, {
      baixar: p.baixar,
      linha: {
        company_id: p.companyId, lead_id: p.lead.id, contato_telefone: p.telefone, contato_nome: p.contatoNome ?? null,
        direcao: 'entrada', autor: 'cliente', canal: p.companyId === CASA ? 'eva_oficial' : 'qr_code',
        tipo, origem: 'webhook', wamid: p.wamid, status: 'recebida',
        ...(quando ? { criado_em: quando } : {}),
      },
      legenda: p.legenda, nomeArquivo: p.nomeArquivo, transcricao: p.transcricao, transcrever: p.transcrever,
    });
  } catch (e) {
    console.warn(`[midia] assistente: ${(e as Error).message}`);
    return 'falhou';
  }
}
