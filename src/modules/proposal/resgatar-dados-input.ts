// src/modules/proposal/resgatar-dados-input.ts
// Lógica de resgate do `dados_input` das propostas antigas (que ficaram nulas pelo
// bug do caminho com estudo). Lê o JSON salvo no Drive e reconstrói o dados_input.
// Compartilhado pelo script (scripts/backfill-dados-input-from-drive.ts) e pelo
// comando de zap /resgatar-propostas. NÃO refaz proposta — só preenche o que faltou.
import type { SupabaseService } from '../supabase.js';
import type { DriveUploader } from './drive-uploader.js';
import { construirDadosInputDeDrive } from './recuperar-dados-input.js';

export interface ResgateResultado {
  candidatas: number;
  resgatadas: number;
  semJson: number;
  falhas: number;
  detalhes: string[];
}

interface PropRow {
  slug: string;
  numero_proposta: string;
  cliente_nome: string;
  created_at: string;
}

// Conta quantas propostas estão sem dados_input (não revogadas), opcionalmente por nome.
export async function contarPropostasSemDados(supabase: SupabaseService, nome?: string | null): Promise<number> {
  let q = supabase
    .getClient()
    .from('propostas_publicas')
    .select('slug', { count: 'exact', head: true })
    .eq('revoked', false)
    .is('dados_input', null);
  if (nome) q = q.ilike('cliente_nome', `%${nome}%`);
  const { count, error } = await q;
  if (error) throw new Error(`contarPropostasSemDados: ${error.message}`);
  return count ?? 0;
}

// Resgata o dados_input do Drive. apply=false só simula (dry-run). slug força uma
// proposta específica (mesmo que já tenha dados); nome filtra por cliente.
export async function resgatarDadosInput(opts: {
  supabase: SupabaseService;
  drive: DriveUploader;
  apply: boolean;
  slug?: string | null;
  nome?: string | null;
}): Promise<ResgateResultado> {
  const { supabase, drive, apply } = opts;
  let q = supabase
    .getClient()
    .from('propostas_publicas')
    .select('slug, numero_proposta, cliente_nome, created_at')
    .eq('revoked', false)
    .order('created_at', { ascending: false });
  q = opts.slug ? q.eq('slug', opts.slug) : q.is('dados_input', null);
  if (opts.nome) q = q.ilike('cliente_nome', `%${opts.nome}%`);

  const { data, error } = await q;
  if (error) throw new Error(`resgatarDadosInput query: ${error.message}`);
  const rows = (data ?? []) as PropRow[];

  const res: ResgateResultado = { candidatas: rows.length, resgatadas: 0, semJson: 0, falhas: 0, detalhes: [] };
  for (const p of rows) {
    // A pasta do Drive é por ANO da geração. Por fuso (proposta criada perto da
    // meia-noite de 31/12), tenta o ano do created_at e os vizinhos.
    const anoBase = new Date(p.created_at).getFullYear();
    let json: string | null = null;
    try {
      for (const a of [anoBase, anoBase - 1, anoBase + 1]) {
        json = await drive.fetchInputDataJson({ nomeCliente: p.cliente_nome, numeroProposta: p.numero_proposta, ano: String(a) });
        if (json) break;
      }
    } catch (err) {
      res.falhas++;
      res.detalhes.push(`${p.cliente_nome} (${p.numero_proposta}): erro Drive — ${(err as Error).message}`);
      continue;
    }
    if (!json) {
      res.semJson++;
      res.detalhes.push(`${p.cliente_nome} (${p.numero_proposta}): sem JSON no Drive`);
      continue;
    }
    const dadosInput = construirDadosInputDeDrive(json);
    if (!dadosInput) {
      res.falhas++;
      res.detalhes.push(`${p.cliente_nome} (${p.numero_proposta}): JSON sem 'data'/valorTotalRs`);
      continue;
    }
    if (apply) {
      try {
        await supabase.updatePropostaPublica(p.slug, { dadosInput });
        res.resgatadas++;
      } catch (err) {
        res.falhas++;
        res.detalhes.push(`${p.cliente_nome} (${p.numero_proposta}): erro ao gravar — ${(err as Error).message}`);
      }
    } else {
      res.resgatadas++;
    }
  }
  return res;
}
