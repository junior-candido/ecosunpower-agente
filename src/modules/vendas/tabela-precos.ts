// src/modules/vendas/tabela-precos.ts
// Tabela de preços do Junior (spec §4.2): CRUD + comando /tabela. Nada de IA aqui.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoInput } from '../elo/eventos.js';
import { parseComandoTabela, type ItemTabela, type TipoItem } from './tabela-precos-parser.js';

export interface ItemPreco extends ItemTabela {
  atualizadoEmMs: number;
}

export const PRECO_VELHO_DIAS = 15;

/** Resultado de escrita: ou gravou, ou diz por que não gravou (nunca "deu certo" no escuro). */
export type ResultadoEscrita = { ok: true } | { ok: false; erro: string };

export interface TabelaPrecosDeps {
  client: SupabaseClient;
  companyId: string;
  registrarEvento: (client: any, ev: EventoInput) => Promise<void>;
}

/** Chave natural sem caixa: "JA" e "ja" são a mesma linha. */
const chave = (s: string) => s.trim().toLowerCase();

export class TabelaPrecosService {
  constructor(private readonly deps: TabelaPrecosDeps) {}

  async atualizar(item: ItemTabela, agoraMs: number): Promise<ResultadoEscrita> {
    try {
      const { error } = await this.deps.client.from('tabela_precos').upsert({
        company_id: this.deps.companyId,
        tipo: item.tipo, marca: item.marca, modelo: item.modelo,
        marca_key: chave(item.marca), modelo_key: chave(item.modelo),
        potencia_w: item.potenciaW, modulos_por_unidade: item.modulosPorUnidade,
        preco_unitario: item.precoUnitario, unidade: item.unidade, fonte: item.fonte,
        ativo: true, atualizado_em: new Date(agoraMs).toISOString(),
      }, { onConflict: 'company_id,tipo,marca_key,modelo_key' });
      if (error) {
        console.error('[tabela] gravar falhou', error.message ?? error);
        return { ok: false, erro: error.message ?? 'banco' };
      }
      console.log(`[tabela] gravado ${item.tipo} ${item.marca} ${item.modelo} = ${item.precoUnitario} (${item.fonte})`);
      await this.evento({ acao: 'atualizar', tipo: item.tipo, marca: item.marca, modelo: item.modelo, precoUnitario: item.precoUnitario, fonte: item.fonte });
      return { ok: true };
    } catch (e) {
      console.error('[tabela] gravar explodiu', e instanceof Error ? e.message : e);
      return { ok: false, erro: e instanceof Error ? e.message : 'banco' };
    }
  }

  /** Desativa pela chave sem caixa. `nao_encontrado` = não tinha nada pra tirar. */
  async desativar(alvo: { tipo: TipoItem; marca: string; modelo: string }): Promise<ResultadoEscrita> {
    try {
      const { data, error } = await this.deps.client.from('tabela_precos').update({ ativo: false })
        .eq('company_id', this.deps.companyId).eq('tipo', alvo.tipo)
        .eq('marca_key', chave(alvo.marca)).eq('modelo_key', chave(alvo.modelo))
        .select('id');
      if (error) {
        console.error('[tabela] desativar falhou', error.message ?? error);
        return { ok: false, erro: error.message ?? 'banco' };
      }
      if (!data?.length) return { ok: false, erro: 'nao_encontrado' };
      console.log(`[tabela] desativado ${alvo.tipo} ${alvo.marca} ${alvo.modelo}`);
      await this.evento({ acao: 'desativar', tipo: alvo.tipo, marca: alvo.marca, modelo: alvo.modelo });
      return { ok: true };
    } catch (e) {
      console.error('[tabela] desativar explodiu', e instanceof Error ? e.message : e);
      return { ok: false, erro: e instanceof Error ? e.message : 'banco' };
    }
  }

  /** Leitura que DIZ quando falha — quem mostra a lista precisa saber a diferença entre vazia e ilegível. */
  async listar(): Promise<{ ok: true; itens: ItemPreco[] } | { ok: false }> {
    try {
      const { data, error } = await this.deps.client.from('tabela_precos')
        .select('tipo, marca, modelo, potencia_w, modulos_por_unidade, preco_unitario, unidade, fonte, atualizado_em')
        .eq('company_id', this.deps.companyId).eq('ativo', true).order('tipo').order('marca').order('modelo');
      if (error) {
        console.error('[tabela] ler falhou', error.message ?? error);
        return { ok: false };
      }
      return { ok: true, itens: (data ?? []).map((r: any) => ({
        tipo: r.tipo, marca: r.marca, modelo: r.modelo,
        potenciaW: r.potencia_w ?? null, modulosPorUnidade: r.modulos_por_unidade ?? null,
        precoUnitario: Number(r.preco_unitario), unidade: r.unidade, fonte: r.fonte ?? 'junior',
        atualizadoEmMs: new Date(r.atualizado_em).getTime(),
      })) };
    } catch (e) {
      console.error('[tabela] ler explodiu', e instanceof Error ? e.message : e);
      return { ok: false };
    }
  }

  /**
   * Itens ativos pro precificador/card de sombra.
   * ATENÇÃO: em erro de banco devolve `[]` (já logado) — quem precisa
   * distinguir "vazia" de "não consegui ler" usa `listar()`.
   */
  async itensAtivos(): Promise<ItemPreco[]> {
    const r = await this.listar();
    return r.ok ? r.itens : [];
  }

  /** Elo é registro, não fluxo: se cair, a gravação continua valendo. */
  private async evento(payload: Record<string, unknown>): Promise<void> {
    try {
      await this.deps.registrarEvento(this.deps.client, {
        tipo: 'comercial:tabela_preco',
        departamento: 'comercial',
        canal: 'sistema',
        origem: 'tabela-precos',
        companyId: this.deps.companyId,
        payload,
      });
    } catch (e) {
      console.error('[tabela] registrar evento falhou', e instanceof Error ? e.message : e);
    }
  }
}

export const brl = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const diasDesde = (ms: number, agoraMs: number) => Math.floor((agoraMs - ms) / 86400_000);

/** Nome que o Junior lê no zap — o mesmo na lista, no ✅ e no 🗑️. */
export function nomeItem(i: { tipo: TipoItem; marca: string; modelo: string; modulosPorUnidade?: number | null }): string {
  if (i.tipo === 'cabos_protecao') return 'cabos/proteção';
  if (i.tipo === 'estrutura') return i.marca;
  if (i.tipo === 'micro') return i.modulosPorUnidade ? `${i.marca} ${i.modelo} (${i.modulosPorUnidade} mód.)` : `${i.marca} ${i.modelo}`;
  return `${i.marca} ${i.modelo}`;
}

function linhaItem(i: ItemPreco, agoraMs: number, bullet = '• '): string {
  const dias = diasDesde(i.atualizadoEmMs, agoraMs);
  const velho = dias > PRECO_VELHO_DIAS ? ` ⚠️ ${dias} d` : '';
  const fonte = i.fonte && i.fonte !== 'junior' ? ` (${i.fonte})` : '';
  const un = i.unidade === 'kwp' ? 'kWp' : i.unidade === 'modulo' ? 'módulo' : 'un';
  return `${bullet}${nomeItem(i)} — ${brl(i.precoUnitario)}/${un}${velho}${fonte}`;
}

export function formatarListaTabela(itens: ItemPreco[], agoraMs: number): string {
  if (!itens.length) return '📋 Tabela de preços vazia.\nExemplos:\n/tabela JA 625 = 980\n/tabela micro Hoymiles HMS-2000-4T 4 = 1450\n/tabela estrutura fibrocimento = 95\n/tabela cabos = 420';
  const grupo = (tipo: TipoItem, titulo: string) => {
    const lista = itens.filter(i => i.tipo === tipo);
    return lista.length ? `${titulo}\n${lista.map(i => linhaItem(i, agoraMs)).join('\n')}` : '';
  };
  return ['📋 Tabela de preços', grupo('modulo', 'Módulos'), grupo('micro', 'Microinversores'), grupo('estrutura', 'Estrutura (por módulo)'), grupo('cabos_protecao', 'Cabos/proteção (por kWp)')]
    .filter(Boolean).join('\n\n');
}

const AJUDA = 'Não entendi. Formatos:\n/tabela JA 625 = 980  (o 625 = a potência do módulo em Wp)\n/tabela micro Hoymiles HMS-2000-4T 4 = 1450  (o 4 = quantos módulos por micro)\n/tabela estrutura fibrocimento|laje|solo|carport|ceramico|metalico = 95\n/tabela cabos = 420\n/tabela tira JA 625\n/tabela fonte belenus JA 625 = 980';
const FALHA_ESCRITA = '⚠️ Não consegui gravar na tabela agora. Tenta de novo em instantes.';

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
        const r = await d.svc.listar();
        await d.sendText(from, r.ok ? formatarListaTabela(r.itens, agora) : '⚠️ não consegui ler a tabela agora. Tenta de novo em instantes.');
      } else if (cmd.acao === 'atualizar') {
        const r = await d.svc.atualizar(cmd.item, agora);
        await d.sendText(from, r.ok ? `✅ ${linhaItem({ ...cmd.item, atualizadoEmMs: agora }, agora, '')}` : FALHA_ESCRITA);
      } else if (cmd.acao === 'desativar') {
        const r = await d.svc.desativar(cmd);
        const nome = nomeItem(cmd);
        await d.sendText(from, r.ok ? `🗑️ ${nome} saiu da tabela.`
          : r.erro === 'nao_encontrado' ? `Não achei ${nome} na tabela.` : FALHA_ESCRITA);
      } else if (cmd.erro === 'micro_sem_modulos_por_unidade') {
        await d.sendText(from, 'Faltou dizer quantos módulos cada micro aceita. Ex.: /tabela micro GoodWe GW2000-MIS 4 = 1300');
      } else if (cmd.erro === 'telhado_desconhecido') {
        await d.sendText(from, 'Telhado tem que ser: fibrocimento, laje, solo, carport, ceramico ou metalico.');
      } else if (cmd.erro === 'preco_invalido') {
        await d.sendText(from, 'Preço tem que ser maior que zero.');
      } else {
        await d.sendText(from, AJUDA);
      }
    } catch (e) {
      console.error('[tabela] erro', e instanceof Error ? e.message : e);
      await d.sendText(from, FALHA_ESCRITA);
    }
    return true;
  };
}
