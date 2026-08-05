// src/modules/relatorios/pasta/service.ts
// Pasta Digital do Cliente — entrega pós-instalação num link só (irmã do r-pi).
// Spec: docs/superpowers/specs/2026-08-05-pasta-digital-cliente-design.md
import type { SupabaseService } from '../../supabase.js';
import { uploadAnexo, deleteAnexoFile, getSignedUrls } from '../../anexos/storage.js';
import { novoSlug } from '../slug.js';
import { obterLogoBase64 } from '../../proposal/assets/logo-base64.js';
import { empresa } from '../../empresa-config.js';
import type { ResolverSistema } from '../pos-instalacao/service.js';
import { SECOES } from './types.js';
import type { ArquivoPasta, PastaClienteRow, PastaView, SecaoId } from './types.js';

const PUBLIC_BASE_URL = process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br';
const IMG_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v']);

function extDe(storagePath: string): string {
  return storagePath.split('.').pop()?.toLowerCase() ?? '';
}

function ehImagem(storagePath: string): boolean {
  return IMG_EXTS.has(extDe(storagePath));
}

function ehVideo(storagePath: string): boolean {
  return VIDEO_EXTS.has(extDe(storagePath));
}

export class PastaService {
  constructor(
    private supabase: SupabaseService,
    private resolverSistema: ResolverSistema,
  ) {}

  // 1 pasta por lead: retorna a existente ou cria rascunho novo com slug.
  async obterOuCriarPorLead(leadId: string): Promise<{ ok: boolean; pasta?: PastaClienteRow; error?: string }> {
    const existente = await this.supabase.getPastaClienteByLead(leadId);
    if (existente) return { ok: true, pasta: existente };
    const lead = await this.supabase.getClienteByLeadId(leadId);
    if (!lead) return { ok: false, error: 'Cliente não encontrado' };
    const r = await this.supabase.criarPastaCliente({ lead_id: leadId, slug: novoSlug() });
    if (!r.ok || !r.id) return { ok: false, error: r.error ?? 'Falha ao criar pasta' };
    const pasta = await this.supabase.getPastaClienteById(r.id);
    return pasta ? { ok: true, pasta } : { ok: false, error: 'Falha ao reler pasta criada' };
  }

  async adicionarArquivos(
    pastaId: string,
    secao: SecaoId,
    files: Array<{ buffer: Buffer; mimeType: string; ext: string; nome: string }>,
  ): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    const client = this.supabase.getClient();
    const novos: ArquivoPasta[] = [];
    // Upload em sequência; se um falhar, rollback dos anteriores (padrão r-pi).
    for (const f of files) {
      const up = await uploadAnexo(client, pasta.lead_id, 'pasta', f.buffer, f.mimeType, f.ext);
      if (!up.ok || !up.storage_path) {
        for (const n of novos) { try { await deleteAnexoFile(client, n.storage_path); } catch {} }
        return { ok: false, error: up.error ?? 'Upload falhou' };
      }
      novos.push({ secao, storage_path: up.storage_path, nome_exibicao: f.nome, origem: 'upload' });
    }
    const r = await this.supabase.atualizarPastaCliente(pastaId, {
      arquivos: [...(pasta.arquivos ?? []), ...novos],
    });
    if (!r.ok) {
      for (const n of novos) { try { await deleteAnexoFile(client, n.storage_path); } catch {} }
      return { ok: false, error: r.error };
    }
    return { ok: true };
  }

  async removerArquivo(pastaId: string, storagePath: string): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    const arquivos: ArquivoPasta[] = pasta.arquivos ?? [];
    const alvo = arquivos.find((a) => a.storage_path === storagePath);
    if (!alvo) return { ok: false, error: 'Arquivo não está na pasta' };
    const patch: Record<string, unknown> = { arquivos: arquivos.filter((a) => a.storage_path !== storagePath) };
    if (pasta.capa_storage_path === storagePath) patch.capa_storage_path = null;
    const r = await this.supabase.atualizarPastaCliente(pastaId, patch);
    if (!r.ok) return { ok: false, error: r.error };
    // Arquivo do r-pi pertence ao relatório — só desvincula, não apaga do bucket.
    if (alvo.origem !== 'r-pi') {
      try { await deleteAnexoFile(this.supabase.getClient(), storagePath); } catch {}
    }
    return { ok: true };
  }

  async puxarFotosDoRelatorio(pastaId: string): Promise<{ ok: boolean; adicionadas: number; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, adicionadas: 0, error: 'Pasta não encontrada' };
    const rels = await this.supabase.listRelatoriosPosInstalacaoByLead(pasta.lead_id, 1);
    if (rels.length === 0) return { ok: false, adicionadas: 0, error: 'Cliente não tem relatório pós-instalação' };
    const rel = await this.supabase.getRelatorioPosInstalacaoById(rels[0].id);
    const fotos = (rel?.fotos ?? []) as Array<{ storage_path: string; caption?: string | null }>;
    const jaTem = new Set((pasta.arquivos ?? []).map((a: ArquivoPasta) => a.storage_path));
    const novas: ArquivoPasta[] = fotos
      .filter((f) => f.storage_path && !jaTem.has(f.storage_path))
      .map((f, i) => ({
        secao: 'fotos' as const,
        storage_path: f.storage_path,
        nome_exibicao: `foto-obra-${jaTem.size + i + 1}.jpg`,
        caption: f.caption ?? null,
        origem: 'r-pi' as const,
      }));
    if (novas.length === 0) return { ok: true, adicionadas: 0 };
    const r = await this.supabase.atualizarPastaCliente(pastaId, {
      arquivos: [...(pasta.arquivos ?? []), ...novas],
    });
    if (!r.ok) return { ok: false, adicionadas: 0, error: r.error };
    return { ok: true, adicionadas: novas.length };
  }

  async definirCapa(pastaId: string, storagePath: string): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    const existe = (pasta.arquivos ?? []).some((a: ArquivoPasta) => a.storage_path === storagePath);
    if (!existe) return { ok: false, error: 'Foto não está na pasta' };
    return this.supabase.atualizarPastaCliente(pastaId, { capa_storage_path: storagePath });
  }

  async atualizarDados(
    pastaId: string,
    dados: { data_entrega: string | null; mensagem_zap: string | null },
  ): Promise<{ ok: boolean; error?: string }> {
    return this.supabase.atualizarPastaCliente(pastaId, {
      data_entrega: dados.data_entrega,
      mensagem_zap: dados.mensagem_zap,
    });
  }

  async publicar(pastaId: string): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    if ((pasta.arquivos ?? []).length === 0) {
      return { ok: false, error: 'Adicione ao menos 1 arquivo antes de publicar' };
    }
    return this.supabase.atualizarPastaCliente(pastaId, { status: 'publicada' });
  }

  // Exclui a pasta inteira: apaga do bucket só os uploads próprios (arquivo de
  // origem r-pi pertence ao relatório) e remove a linha. Link do cliente morre.
  async excluirPasta(pastaId: string): Promise<{ ok: boolean; error?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, error: 'Pasta não encontrada' };
    const proprios = (pasta.arquivos ?? [])
      .filter((a: ArquivoPasta) => a.origem !== 'r-pi')
      .map((a: ArquivoPasta) => a.storage_path);
    if (proprios.length > 0) {
      try {
        await this.supabase.getClient().storage.from('client-attachments').remove(proprios);
      } catch (e) {
        console.warn('[pasta] limpeza do bucket falhou (segue com a exclusão):', (e as Error).message);
      }
    }
    return this.supabase.deletarPastaCliente(pastaId);
  }

  async resolverView(pasta: PastaClienteRow, publico: boolean): Promise<PastaView | null> {
    const lead = await this.supabase.getClienteByLeadId(pasta.lead_id);
    if (!lead) return null;
    const sistema = await this.resolverSistema(pasta.lead_id);

    const arquivos: ArquivoPasta[] = pasta.arquivos ?? [];
    const paths = arquivos.map((a) => a.storage_path);
    // Signed URLs geradas A CADA visita (TTL 1h) — o link da pasta nunca vence.
    const urls = paths.length > 0 ? await getSignedUrls(this.supabase.getClient(), paths, 3600) : {};

    const secoes = SECOES.map((s) => ({
      secao: s.id,
      titulo: s.titulo,
      arquivos: arquivos
        .filter((a) => a.secao === s.id && urls[a.storage_path])
        .map((a) => ({
          url: urls[a.storage_path]!,
          nome: a.nome_exibicao,
          caption: a.caption ?? null,
          is_imagem: ehImagem(a.storage_path),
          is_video: ehVideo(a.storage_path),
        })),
    })).filter((s) => s.arquivos.length > 0);

    const capaPath =
      pasta.capa_storage_path ?? arquivos.find((a) => a.secao === 'fotos')?.storage_path ?? null;

    return {
      cliente_nome: lead.name ?? 'Cliente',
      cliente_cidade: lead.city ?? null,
      cliente_uf: lead.uf ?? null,
      data_entrega: pasta.data_entrega,
      sistema,
      capa_url: capaPath ? (urls[capaPath] ?? null) : null,
      logo_base64: await obterLogoBase64(this.supabase.getClient()),
      whatsapp: empresa().telefoneAtendente,
      secoes,
      slug: pasta.slug,
      publico,
      gerado_em: pasta.updated_at,
    };
  }

  async enviarPorWhatsApp(
    pastaId: string,
    sendText: (to: string, text: string) => Promise<void>,
  ): Promise<{ ok: boolean; reason?: string }> {
    const pasta = await this.supabase.getPastaClienteById(pastaId);
    if (!pasta) return { ok: false, reason: 'pasta_not_found' };
    if (pasta.status !== 'publicada') return { ok: false, reason: 'nao_publicada' };
    const lead = await this.supabase.getClienteByLeadId(pasta.lead_id);
    if (!lead) return { ok: false, reason: 'lead_not_found' };
    if (lead.opt_out) return { ok: false, reason: 'opt_out' };
    if (!lead.phone) return { ok: false, reason: 'sem_phone' };

    const primeiroNome = (lead.name ?? 'Olá').split(/\s+/)[0];
    const link = `${PUBLIC_BASE_URL}/pasta/${pasta.slug}`;
    // Convite de avaliação junto da entrega (melhor momento) — some se não houver link.
    const reviewUrl = empresa().googleReviewUrl;
    const convite = reviewUrl
      ? `\n\nE se puder, deixa sua avaliação no Google — leva 1 minuto e ajuda demais: ${reviewUrl}`
      : '';
    const body = pasta.mensagem_zap?.trim()
      ? `${pasta.mensagem_zap.trim()}\n\n${link}${convite}`
      : `📁 ${primeiroNome}, sua usina agora tem uma pasta digital!\n\n` +
        `Fotos da obra, projeto e todos os seus documentos guardados num lugar só:\n${link}\n\n` +
        `Salve esse link — ele é seu. Qualquer dúvida, é só chamar a gente.${convite}`;

    await sendText(lead.phone, body);
    await this.supabase.marcarPastaClienteEnviada(pastaId, lead.phone);
    return { ok: true };
  }
}
