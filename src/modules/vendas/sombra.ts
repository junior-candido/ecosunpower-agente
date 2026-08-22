// src/modules/vendas/sombra.ts
// Modo sombra (spec §10 fatia 2): a Eva precifica e mostra pro Junior. NADA vai pro cliente.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoInput } from '../elo/eventos.js';
import { consumoAlvo, decidirFaixa } from './autonomia.js';
import { precificar, type ResultadoPrecificacao } from './precificador.js';
import { montarCardSombra, montarCardSombraErro } from './card-sombra.js';
import type { TabelaPrecosService } from './tabela-precos.js';
import type { Telhado } from './tabela-precos-parser.js';

export interface SombraDeps {
  client: SupabaseClient;
  tabela: Pick<TabelaPrecosService, 'itensAtivos'>;
  sendText: (to: string, text: string) => Promise<void>;
  registrarEvento: (client: any, ev: EventoInput) => Promise<void>;
  adminPhone: string;
}

export type SombraResultado =
  | { ok: true; versao: number; resultado: Extract<ResultadoPrecificacao, { ok: true }> }
  | { ok: false; erro: 'lead_nao_encontrado' | 'sem_dados' | 'fluxo_atual' | 'consumo_invalido' | 'tabela_incompleta' | 'interno' };

/** Tira um número de kWh de um texto livre ("uns 900 kwh", "1.200kWh/mês"). Sem kWh no texto → null. */
export function cargaFuturaDe(texto: unknown): number | null {
  if (typeof texto !== 'string') return null;
  const m = /(\d{1,3}(?:\.\d{3})*|\d+)\s*kwh/i.exec(texto);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Escapa `%` e `_` (curingas do LIKE/ILIKE do Postgres) do texto que o Junior digitou no /sombra. */
export function escapeIlike(s: string): string {
  return s.replace(/[%_]/g, '\\$&');
}

const TELHADO_PADRAO: Telhado = 'ceramico';

export class SombraService {
  constructor(private readonly deps: SombraDeps) {}

  async rodarParaLead(p: { leadId: string; agoraMs: number; origem: string; silencioso?: boolean }): Promise<SombraResultado> {
    try {
      const { data: lead } = await this.deps.client.from('leads')
        .select('id, name, city, company_id, energy_data, future_demand').eq('id', p.leadId).maybeSingle();
      if (!lead) return { ok: false, erro: 'lead_nao_encontrado' };
      const l = lead as any;
      const nome: string = l.name || 'lead';
      const ed = (l.energy_data ?? {}) as Record<string, unknown>;
      const consumoFatura = Number(ed.consumption_kwh ?? ed.consumo_kwh) || null;
      const cargaFutura = cargaFuturaDe(l.future_demand);
      const alvo = consumoAlvo({ consumoKwh: consumoFatura, cargaFuturaKwh: cargaFutura });
      const faixa = decidirFaixa(alvo);

      const avisar = async (txt: string) => { if (!p.silencioso) await this.deps.sendText(this.deps.adminPhone, txt); };

      if (faixa === 'sem_dados') { await avisar(montarCardSombraErro({ nome, erro: 'sem_dados', faltando: [] })); return { ok: false, erro: 'sem_dados' }; }
      if (faixa === 'fluxo_atual') { await avisar(montarCardSombraErro({ nome, erro: 'fluxo_atual', faltando: [] })); return { ok: false, erro: 'fluxo_atual' }; }

      const tabela = await this.deps.tabela.itensAtivos();
      const telhado = TELHADO_PADRAO; // lead não tem telhado no banco (fatia 3 pergunta)
      const resultado = precificar({ consumoAlvoKwh: alvo!, telhado, tabela, agoraMs: p.agoraMs });
      if (!resultado.ok) {
        await avisar(montarCardSombraErro({ nome, erro: resultado.erro, faltando: resultado.faltando }));
        return { ok: false, erro: resultado.erro };
      }

      // Sanity: nunca assume "gravou" no escuro — confere o {error} do select e do insert
      // antes de logar no Elo e mandar o card. Erro aqui é [sombra] + interno, sem card.
      const { data: ultimas, error: errSelect } = await this.deps.client.from('propostas_versoes')
        .select('versao').eq('lead_id', p.leadId).order('versao', { ascending: false }).limit(1);
      if (errSelect) {
        console.error('[sombra] ler última versão falhou', (errSelect as any).message ?? errSelect);
        return { ok: false, erro: 'interno' };
      }
      const versao = ((ultimas?.[0] as any)?.versao ?? 0) + 1;
      const params = { consumoAlvoKwh: alvo, consumoFatura, cargaFutura, telhado, telhadoAssumido: true, faixa, origem: p.origem };
      const { error: errInsert } = await this.deps.client.from('propostas_versoes').insert({
        lead_id: p.leadId, company_id: l.company_id ?? undefined, versao, autor: 'eva', sombra: true,
        pedido_texto: null, params_json: params, resultado_json: resultado,
        created_at: new Date(p.agoraMs).toISOString(),
      });
      if (errInsert) {
        console.error('[sombra] gravar propostas_versoes falhou', (errInsert as any).message ?? errInsert);
        return { ok: false, erro: 'interno' };
      }

      await this.deps.registrarEvento(this.deps.client, {
        tipo: 'comercial:sombra_gerada', departamento: 'comercial', leadId: p.leadId, companyId: l.company_id ?? null, canal: 'sistema', origem: 'sombra',
        payload: { versao, faixa, consumoAlvoKwh: alvo, totais: resultado.opcoes.map(o => ({ [o.rotulo]: o.total })), avisos: resultado.avisos.map(a => a.tipo) },
      });
      const card = montarCardSombra({ nome, cidade: l.city ?? null, versao, faixa, telhadoAssumido: true, consumoFatura, cargaFutura, resultado });
      await this.deps.sendText(this.deps.adminPhone, card);
      console.log(`[sombra] v${versao} lead=${p.leadId} faixa=${faixa} A=${resultado.opcoes[0]?.total}`);
      return { ok: true, versao, resultado };
    } catch (e) {
      console.error('[sombra] erro', e instanceof Error ? e.message : e);
      return { ok: false, erro: 'interno' };
    }
  }

  /** Gancho automático: primeira vez que o lead ganha consumo. Silencioso fora da faixa. */
  async rodarSeNuncaRodou(leadId: string, agoraMs: number): Promise<void> {
    try {
      const { data } = await this.deps.client.from('propostas_versoes').select('versao').eq('lead_id', leadId).limit(1);
      if (data && data.length) return;
      await this.rodarParaLead({ leadId, agoraMs, origem: 'auto', silencioso: true });
    } catch (e) {
      console.error('[sombra] rodarSeNuncaRodou', e instanceof Error ? e.message : e);
    }
  }
}

export function makeSombraHandler(d: {
  svc: SombraService;
  client: SupabaseClient;
  isAdminPhone: (from: string) => boolean;
  sendText: (to: string, text: string) => Promise<void>;
  agoraMs: () => number;
}): (from: string, text: string) => Promise<boolean> {
  return async (from, text) => {
    if (!d.isAdminPhone(from)) return false;
    const m = /^\/?sombra(?:\s+(.+))?$/i.exec(text.trim());
    if (!m) return false;
    const nome = (m[1] ?? '').trim();
    if (!nome) { await d.sendText(from, '🕶️ Uso: /sombra <nome> (do lead) — a Eva monta a proposta e te mostra, sem enviar.'); return true; }
    try {
      const padrao = escapeIlike(nome);
      const { data } = await d.client.from('leads').select('id, name, created_at')
        .ilike('name', `%${padrao}%`).is('archived_at', null).order('created_at', { ascending: false }).limit(5);
      const leads = (data ?? []) as Array<{ id: string; name: string }>;
      if (!leads.length) { await d.sendText(from, `Não achei lead com "${nome}".`); return true; }
      if (leads.length > 1) await d.sendText(from, `${leads.length} leads com "${nome}" — usando o mais recente: ${leads[0].name}.`);
      await d.svc.rodarParaLead({ leadId: leads[0].id, agoraMs: d.agoraMs(), origem: 'comando' });
    } catch (e) {
      console.error('[sombra] handler', e instanceof Error ? e.message : e);
      await d.sendText(from, '⚠️ Deu erro ao rodar a sombra. Tenta de novo.');
    }
    return true;
  };
}
