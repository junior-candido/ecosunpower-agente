// src/modules/vendas/tabela-precos.ts
// Tabela de preços do Junior (spec §4.2): CRUD + comando /tabela. Nada de IA aqui.
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseComandoTabela, type ItemTabela, type TipoItem } from './tabela-precos-parser.js';

export interface ItemPreco extends ItemTabela {
  atualizadoEmMs: number;
}

export const PRECO_VELHO_DIAS = 15;

export interface TabelaPrecosDeps {
  client: SupabaseClient;
  companyId: string;
}

export class TabelaPrecosService {
  constructor(private readonly deps: TabelaPrecosDeps) {}

  async atualizar(item: ItemTabela, agoraMs: number): Promise<void> {
    await this.deps.client.from('tabela_precos').upsert({
      company_id: this.deps.companyId,
      tipo: item.tipo, marca: item.marca, modelo: item.modelo,
      potencia_w: item.potenciaW, modulos_por_unidade: item.modulosPorUnidade,
      preco_unitario: item.precoUnitario, unidade: item.unidade, fonte: item.fonte,
      ativo: true, atualizado_em: new Date(agoraMs).toISOString(),
    }, { onConflict: 'company_id,tipo,marca,modelo' });
  }

  async desativar(chave: { tipo: TipoItem; marca: string; modelo: string }): Promise<void> {
    await this.deps.client.from('tabela_precos').update({ ativo: false })
      .eq('company_id', this.deps.companyId).eq('tipo', chave.tipo).eq('marca', chave.marca).eq('modelo', chave.modelo);
  }

  async itensAtivos(): Promise<ItemPreco[]> {
    const { data } = await this.deps.client.from('tabela_precos')
      .select('tipo, marca, modelo, potencia_w, modulos_por_unidade, preco_unitario, unidade, fonte, atualizado_em')
      .eq('company_id', this.deps.companyId).eq('ativo', true).order('tipo');
    return (data ?? []).map((r: any) => ({
      tipo: r.tipo, marca: r.marca, modelo: r.modelo,
      potenciaW: r.potencia_w ?? null, modulosPorUnidade: r.modulos_por_unidade ?? null,
      precoUnitario: Number(r.preco_unitario), unidade: r.unidade, fonte: r.fonte ?? 'junior',
      atualizadoEmMs: new Date(r.atualizado_em).getTime(),
    }));
  }
}

export const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const diasDesde = (ms: number, agoraMs: number) => Math.floor((agoraMs - ms) / 86400_000);

function linhaItem(i: ItemPreco, agoraMs: number): string {
  const dias = diasDesde(i.atualizadoEmMs, agoraMs);
  const velho = dias > PRECO_VELHO_DIAS ? ` ⚠️ ${dias} d` : '';
  const fonte = i.fonte && i.fonte !== 'junior' ? ` (${i.fonte})` : '';
  const un = i.unidade === 'kwp' ? 'kWp' : i.unidade === 'modulo' ? 'módulo' : 'un';
  const nome = i.tipo === 'micro' ? `${i.marca} ${i.modelo} (${i.modulosPorUnidade} mód.)`
    : i.tipo === 'estrutura' ? i.marca
    : i.tipo === 'cabos_protecao' ? 'cabos/proteção'
    : `${i.marca} ${i.modelo}`;
  return `• ${nome} — ${brl(i.precoUnitario)}/${un}${velho}${fonte}`;
}

export function formatarListaTabela(itens: ItemPreco[], agoraMs: number): string {
  if (!itens.length) return '📋 Tabela de preços vazia.\nExemplos:\n/tabela JA 625 = 980\n/tabela micro Hoymiles HMS-2000-4T 4 = 1450\n/tabela estrutura ceramico = 95\n/tabela cabos = 420';
  const grupo = (tipo: TipoItem, titulo: string) => {
    const lista = itens.filter(i => i.tipo === tipo);
    return lista.length ? `${titulo}\n${lista.map(i => linhaItem(i, agoraMs)).join('\n')}` : '';
  };
  return ['📋 Tabela de preços', grupo('modulo', 'Módulos'), grupo('micro', 'Microinversores'), grupo('estrutura', 'Estrutura (por módulo)'), grupo('cabos_protecao', 'Cabos/proteção (por kWp)')]
    .filter(Boolean).join('\n\n');
}

const AJUDA = 'Não entendi. Formatos:\n/tabela JA 625 = 980\n/tabela micro Hoymiles HMS-2000-4T 4 = 1450  (o 4 = quantos módulos por micro)\n/tabela estrutura ceramico|fibrocimento|metalico|laje = 95\n/tabela cabos = 420\n/tabela tira JA 625\n/tabela fonte belenus JA 625 = 980';

export function makeTabelaHandler(d: {
  svc: TabelaPrecosService;
  isAdminPhone: (from: string) => boolean;
  sendText: (to: string, text: string) => Promise<void>;
  agoraMs: () => number;
}): (from: string, text: string) => Promise<boolean> {
  return async (from, text) => {
    if (!d.isAdminPhone(from)) return false;
    const cmd = parseComandoTabela(text);
    if (!cmd) return false;
    const agora = d.agoraMs();
    try {
      if (cmd.acao === 'listar') {
        await d.sendText(from, formatarListaTabela(await d.svc.itensAtivos(), agora));
      } else if (cmd.acao === 'atualizar') {
        await d.svc.atualizar(cmd.item, agora);
        await d.sendText(from, `✅ ${linhaItem({ ...cmd.item, atualizadoEmMs: agora }, agora).slice(2)}`);
      } else if (cmd.acao === 'desativar') {
        await d.svc.desativar(cmd);
        await d.sendText(from, `🗑️ ${cmd.marca} ${cmd.modelo} saiu da tabela.`);
      } else if (cmd.erro === 'micro_sem_modulos_por_unidade') {
        await d.sendText(from, 'Faltou dizer quantos módulos cada micro aceita. Ex.: /tabela micro GoodWe GW2000-MIS 4 = 1300');
      } else if (cmd.erro === 'telhado_desconhecido') {
        await d.sendText(from, 'Telhado tem que ser: ceramico, fibrocimento, metalico ou laje.');
      } else if (cmd.erro === 'preco_invalido') {
        await d.sendText(from, 'Preço tem que ser maior que zero.');
      } else {
        await d.sendText(from, AJUDA);
      }
    } catch (e) {
      console.error('[tabela] erro', e instanceof Error ? e.message : e);
      await d.sendText(from, '⚠️ Não consegui gravar na tabela agora. Tenta de novo em instantes.');
    }
    return true;
  };
}
