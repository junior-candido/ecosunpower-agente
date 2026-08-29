// src/modules/financeiro/arquivos-fila.ts
// Fila de leitura de arquivos financeiros. Regra: nada pesado é lido dentro do
// webhook. Enfileira, responde "recebi", um tick lê página a página e grava por lote.
// Cada lote grava ANTES do próximo (paginas_ok avança) — se cair no meio, a
// próxima tentativa retoma de onde parou, sem ler (nem contar) 2× o que já entrou.
import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { extrairDePdf, extrairDeImagem, type ExtracaoLancamento } from './extrator-lancamento.js';
import { uploadComprovante } from './comprovantes.js';

export const LIMITE_INLINE_BYTES = 1_500_000;   // até ~1,5 MB e 1 página lê na hora
export const PAGINAS_POR_LOTE = 4;
export const MAX_TENTATIVAS = 3;
const BUCKET = 'financeiro-comprovantes';
const TABELA = 'financeiro_arquivos';

// ---------------------------------------------------------------------------
// PUROS
// ---------------------------------------------------------------------------

// Vai pra fila se for pesado OU se for PDF com mais de uma página.
export function precisaFila(a: { bytes: number; paginas: number; mime: string }): boolean {
  if (a.bytes > LIMITE_INLINE_BYTES) return true;
  return a.mime === 'application/pdf' && a.paginas > 1;
}

// Intervalos [de, ate] (inclusivos, base 0) de páginas por lote.
export function planoDeLotes(paginas: number, porLote = PAGINAS_POR_LOTE): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < paginas; i += porLote) out.push([i, Math.min(i + porLote, paginas) - 1]);
  return out;
}

// ---------------------------------------------------------------------------
// pdf-lib (CPU local, sem IA)
// ---------------------------------------------------------------------------

// Não conseguiu abrir (corrompido, não é PDF) → assume 1 página e deixa a IA tentar.
export async function contarPaginas(base64: string): Promise<number> {
  try {
    const doc = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true });
    return doc.getPageCount();
  } catch { return 1; }
}

// Recorta páginas [de..ate] num PDF novo (base64).
export async function recortarPaginas(base64: string, de: number, ate: number): Promise<string> {
  const src = await PDFDocument.load(Buffer.from(base64, 'base64'), { ignoreEncryption: true });
  const dst = await PDFDocument.create();
  const idx = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const pages = await dst.copyPages(src, idx);
  pages.forEach((p) => dst.addPage(p));
  return Buffer.from(await dst.save()).toString('base64');
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

export interface ArquivoRow {
  id: string; storage_path: string; mime_type: string; paginas: number | null; paginas_ok: number;
  tentativas: number; enviado_por: string | null; tipo: string; lancamentos_criados?: number | null;
}

// Guarda o arquivo no Storage e cria a linha em 'fila'. Lança erro se não conseguiu guardar
// (quem chama decide o que dizer ao admin — o arquivo NUNCA pode sumir em silêncio).
export async function enfileirar(client: SupabaseClient, a: {
  base64: string; mimeType: string; bytes: number; paginas: number; origem: 'zap' | 'tela';
  tipo?: string; enviadoPor: string; messageId: string | null; competencia: string;
}): Promise<string> {
  const storagePath = await uploadComprovante(client, a.base64, a.mimeType, a.competencia);
  if (!storagePath) throw new Error('não consegui guardar o arquivo no Storage');
  const { data, error } = await client.from(TABELA).insert({
    origem: a.origem, tipo: a.tipo ?? 'outro', storage_path: storagePath, mime_type: a.mimeType, bytes: a.bytes,
    paginas: a.paginas, status: 'fila', enviado_por: a.enviadoPor, message_id: a.messageId,
  }).select('id').single();
  if (error) throw new Error(`enfileirar: ${error.message}`);
  return (data as { id: string }).id;
}

async function baixarBase64(client: SupabaseClient, storagePath: string): Promise<string> {
  const { data, error } = await client.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`download: ${error?.message ?? 'vazio'}`);
  return Buffer.from(await data.arrayBuffer()).toString('base64');
}

export interface TickDeps {
  client: SupabaseClient; anthropic: Anthropic;
  registrar: (from: string, e: ExtracaoLancamento, arquivoId: string) => Promise<void>;
  avisar: (to: string, texto: string) => Promise<void>;
  hoje: () => string;
}

const MSG_FALHA_FINAL = (motivo: string) =>
  `⚠️ Não consegui ler esse arquivo (${motivo}). Ele está guardado — me manda um print das páginas ou o CSV.`;

// Um arquivo por tick (1 min). Lê por lotes; cada lote grava antes do próximo.
// Lote que falha PARA a leitura (status erro_parcial) — o próximo tick retoma dele.
export async function tickArquivos(d: TickDeps): Promise<void> {
  const { data } = await d.client.from(TABELA)
    .select('id, storage_path, mime_type, paginas, paginas_ok, tentativas, enviado_por, tipo, lancamentos_criados')
    .in('status', ['fila', 'erro_parcial']).lt('tentativas', MAX_TENTATIVAS)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();
  const a = data as ArquivoRow | null;
  if (!a) return;
  const tentativas = a.tentativas + 1;
  const ultima = tentativas >= MAX_TENTATIVAS;
  const to = a.enviado_por;
  const salvar = async (p: Record<string, unknown>) => {
    await d.client.from(TABELA).update({ ...p, updated_at: new Date().toISOString() }).eq('id', a.id);
  };
  await salvar({ status: 'lendo', tentativas });

  let criados = a.lancamentos_criados ?? 0;
  let paginasOk = a.paginas_ok ?? 0;
  let total = a.paginas ?? 1;
  let erro: string | null = null;
  // Registra cada item financeiro extraído e soma no contador.
  const lancar = async (itens: ExtracaoLancamento[]) => {
    for (const e of itens) if (e.financeiro) { await d.registrar(to ?? '', e, a.id); criados++; }
  };
  try {
    const b64 = await baixarBase64(d.client, a.storage_path);
    if (a.mime_type === 'application/pdf') {
      total = a.paginas ?? await contarPaginas(b64);
      for (const [de, ate] of planoDeLotes(total)) {
        if (de < paginasOk) continue; // já entrou numa tentativa anterior
        try {
          const fatia = total === 1 ? b64 : await recortarPaginas(b64, de, ate);
          await lancar(await extrairDePdf(d.anthropic, fatia, d.hoje()));
          paginasOk = ate + 1;
          await salvar({ paginas: total, paginas_ok: paginasOk, lancamentos_criados: criados });
        } catch (err) {
          erro = `páginas ${de + 1}–${ate + 1}: ${(err as Error).message}`;
          console.warn('[arquivos-fila] lote falhou:', a.id, erro);
          break;
        }
      }
    } else {
      await lancar(await extrairDeImagem(d.anthropic, b64, a.mime_type, d.hoje()));
      paginasOk = total;
    }
  } catch (err) {
    erro = (err as Error).message;
    console.error('[arquivos-fila] arquivo falhou:', a.id, erro);
  }

  const status = !erro ? 'ok' : ultima ? 'erro' : 'erro_parcial';
  await salvar({ status, paginas: total, paginas_ok: paginasOk, lancamentos_criados: criados, erro });
  if (!to) return;
  if (status === 'ok') {
    await d.avisar(to, `✅ Li o arquivo (${total} pág.): ${criados} lançamento(s) registrado(s).`);
  } else if (status === 'erro') {
    await d.avisar(to, MSG_FALHA_FINAL(erro as string) + (criados ? ` Já tinham entrado ${criados} lançamento(s).` : ''));
  }
  // erro_parcial: silencioso — o próximo tick retoma; avisa só no desfecho.
}
