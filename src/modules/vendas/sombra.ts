// src/modules/vendas/sombra.ts
// Modo sombra (spec §10 fatia 2): a Eva precifica e mostra pro Junior. NADA vai pro cliente.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoInput } from '../elo/eventos.js';
import { consumoAlvo, decidirFaixa } from './autonomia.js';
import { precificar, type ResultadoPrecificacao } from './precificador.js';
import { montarCardSombra, montarCardSombraErro } from './card-sombra.js';
import type { TabelaPrecosService } from './tabela-precos.js';
import { parseNumeroBr, type Telhado } from './tabela-precos-parser.js';

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

const AJUDA = '🕶️ Uso: /sombra <nome> (do lead) — a Eva monta a proposta e te mostra, sem enviar.';

/** Mensagem do erro do Supabase sem quebrar se vier outra coisa. */
const msgErro = (e: unknown): unknown => (e as { message?: unknown } | null)?.message ?? e;

/** Só vale número de verdade e positivo — 0, negativo e lixo viram null. */
const positivo = (n: number | null): number | null => (n !== null && n > 0 ? n : null);

/**
 * `energy_data` é jsonb, mas às vezes chega como TEXTO (integração que salvou a
 * string). Lê o JSON quando dá; qualquer outra coisa vira objeto vazio.
 */
export function lerEnergyData(v: unknown): Record<string, unknown> {
  if (typeof v === 'string') {
    try {
      const o: unknown = JSON.parse(v);
      return o !== null && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    } catch { return {}; }
  }
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Tira um número de kWh de um texto livre ("uns 900 kwh", "1.200kWh/mês",
 * "900,5 kwh"). Sem kWh no texto → null. O número sai pelo leitor pt-BR:
 * "1.050" é mil e cinquenta, não 1,05.
 */
export function cargaFuturaDe(texto: unknown): number | null {
  if (typeof texto !== 'string') return null;
  const m = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*kwh/i.exec(texto);
  if (!m) return null;
  return positivo(parseNumeroBr(m[1]));
}

/**
 * Prepara o texto que o Junior digitou pra ir dentro de um ILIKE:
 * escapa a `\` (que é o próprio escape), o `%` e o `_` (curingas do Postgres) e
 * joga fora o `*` — quem digita `Jo*el` quer curinga de shell, que no ILIKE não
 * é nada e só sujaria a busca.
 */
export function escapeIlike(s: string): string {
  return s.replace(/\*/g, '').replace(/[\\%_]/g, '\\$&');
}

const TELHADO_PADRAO: Telhado = 'ceramico';

// A UNIQUE (lead_id, versao) é a dona da verdade: duas rodadas quase juntas (ou
// um select em réplica atrasada) calculam a MESMA versão e a segunda é recusada
// com 23505. Aí recalcula e tenta de novo, até este teto.
const TENTATIVAS_VERSAO = 3;

export class SombraService {
  constructor(private readonly deps: SombraDeps) {}

  async rodarParaLead(p: { leadId: string; agoraMs: number; origem: string; silencioso?: boolean }): Promise<SombraResultado> {
    try {
      // Sanity: nada de assumir que leu/gravou no escuro — todo select e todo
      // insert daqui pra baixo confere o {error} antes de seguir.
      const { data: lead, error: errLead } = await this.deps.client.from('leads')
        .select('id, name, city, company_id, energy_data, future_demand').eq('id', p.leadId).maybeSingle();
      if (errLead) {
        console.error('[sombra] ler lead falhou', msgErro(errLead));
        return { ok: false, erro: 'interno' };
      }
      if (!lead) return { ok: false, erro: 'lead_nao_encontrado' };
      const l = lead as any;
      const nome: string = l.name || 'lead';
      const ed = lerEnergyData(l.energy_data);
      // Consumo é escrito por gente ("1.050", "734,5"): leitor pt-BR, nunca Number().
      const consumoFatura = positivo(parseNumeroBr(ed.consumption_kwh ?? ed.consumo_kwh));
      const cargaFutura = cargaFuturaDe(l.future_demand);
      const alvo = consumoAlvo({ consumoKwh: consumoFatura, cargaFuturaKwh: cargaFutura });
      const faixa = decidirFaixa(alvo);

      // Aviso ao Junior é efeito colateral: se o zap cair, a rodada continua.
      const mandar = async (txt: string) => {
        try { await this.deps.sendText(this.deps.adminPhone, txt); }
        catch (e) { console.error('[sombra] avisar o Junior falhou', e instanceof Error ? e.message : e); }
      };
      const avisar = async (txt: string) => { if (!p.silencioso) await mandar(txt); };

      if (faixa === 'sem_dados') { await avisar(montarCardSombraErro({ nome, erro: 'sem_dados', faltando: [] })); return { ok: false, erro: 'sem_dados' }; }
      if (faixa === 'fluxo_atual') { await avisar(montarCardSombraErro({ nome, erro: 'fluxo_atual', faltando: [] })); return { ok: false, erro: 'fluxo_atual' }; }

      const tabela = await this.deps.tabela.itensAtivos();
      const telhado = TELHADO_PADRAO; // lead não tem telhado no banco (fatia 3 pergunta)
      const telhadoAssumido = telhado === TELHADO_PADRAO;
      const resultado = precificar({ consumoAlvoKwh: alvo!, telhado, tabela, agoraMs: p.agoraMs });
      if (!resultado.ok) {
        await avisar(montarCardSombraErro({ nome, erro: resultado.erro, faltando: resultado.faltando }));
        return { ok: false, erro: resultado.erro };
      }

      const params = { consumoAlvoKwh: alvo, consumoFatura, cargaFutura, telhado, telhadoAssumido, faixa, origem: p.origem };
      let versao = 0;
      let gravou = false;
      for (let tentativa = 1; tentativa <= TENTATIVAS_VERSAO && !gravou; tentativa++) {
        const { data: ultimas, error: errSelect } = await this.deps.client.from('propostas_versoes')
          .select('versao').eq('lead_id', p.leadId).order('versao', { ascending: false }).limit(1);
        if (errSelect) {
          console.error('[sombra] ler última versão falhou', msgErro(errSelect));
          return { ok: false, erro: 'interno' };
        }
        versao = ((ultimas?.[0] as any)?.versao ?? 0) + 1;
        const { error: errInsert } = await this.deps.client.from('propostas_versoes').insert({
          lead_id: p.leadId, company_id: l.company_id ?? undefined, versao, autor: 'eva', sombra: true,
          pedido_texto: null, params_json: params, resultado_json: resultado,
          created_at: new Date(p.agoraMs).toISOString(),
        });
        if (!errInsert) { gravou = true; break; }
        if ((errInsert as { code?: string }).code !== '23505') {
          console.error('[sombra] gravar propostas_versoes falhou', msgErro(errInsert));
          return { ok: false, erro: 'interno' };
        }
        console.warn(`[sombra] v${versao} do lead ${p.leadId} já existia — tentativa ${tentativa}/${TENTATIVAS_VERSAO}`);
      }
      if (!gravou) {
        console.error(`[sombra] não consegui gravar versão do lead ${p.leadId} — ${TENTATIVAS_VERSAO} tentativas na UNIQUE`);
        return { ok: false, erro: 'interno' };
      }

      await this.deps.registrarEvento(this.deps.client, {
        tipo: 'comercial:sombra_gerada', departamento: 'comercial', leadId: p.leadId, companyId: l.company_id ?? null, canal: 'sistema', origem: 'sombra',
        payload: {
          versao, faixa, consumoAlvoKwh: alvo,
          totais: Object.fromEntries(resultado.opcoes.map(o => [o.rotulo, o.total])),
          avisos: resultado.avisos.map(a => a.tipo),
        },
      });
      const card = montarCardSombra({ nome, cidade: l.city ?? null, versao, faixa, telhadoAssumido, consumoFatura, cargaFutura, resultado });
      await mandar(card);
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
      const { data, error } = await this.deps.client.from('propostas_versoes').select('versao').eq('lead_id', leadId).limit(1);
      // Sem saber se já rodou, NÃO roda: duplicar card no zap do Junior é pior
      // que atrasar — a próxima atualização de consumo tenta de novo.
      if (error) { console.error('[sombra] checar versões existentes falhou', msgErro(error)); return; }
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
    if (typeof text !== 'string') return false;
    const t = text.trim();
    // "sombra" solto (sem barra) é atalho pra ajuda. Com argumento a barra é
    // OBRIGATÓRIA — senão "sombra no telhado" viraria comando.
    if (/^\/?sombra$/i.test(t)) { await d.sendText(from, AJUDA); return true; }
    const m = /^\/sombra\s+(.+)$/i.exec(t);
    if (!m) return false;
    const nome = m[1].trim();
    const padrao = escapeIlike(nome);
    if (!padrao) { await d.sendText(from, AJUDA); return true; }
    try {
      // Pede 6 sabendo que mostra 5: o sexto só serve pra dizer "5+".
      const { data, error } = await d.client.from('leads').select('id, name, created_at')
        .ilike('name', `%${padrao}%`).is('archived_at', null).order('created_at', { ascending: false }).limit(6);
      if (error) {
        console.error('[sombra] buscar lead falhou', msgErro(error));
        await d.sendText(from, '⚠️ Não consegui consultar os leads agora.');
        return true;
      }
      const leads = (data ?? []) as Array<{ id: string; name: string }>;
      if (!leads.length) { await d.sendText(from, `Não achei lead com "${nome}".`); return true; }
      if (leads.length > 1) {
        const quantos = leads.length > 5 ? '5+' : String(leads.length);
        await d.sendText(from, `${quantos} leads com "${nome}" — usando o mais recente: ${leads[0].name}.`);
      }
      const r = await d.svc.rodarParaLead({ leadId: leads[0].id, agoraMs: d.agoraMs(), origem: 'comando' });
      // Fora da faixa / sem dado o card já explicou. Erro de banco não explica
      // nada sozinho, então o Junior tem que ouvir alguma coisa.
      if (!r.ok && (r.erro === 'interno' || r.erro === 'lead_nao_encontrado')) {
        await d.sendText(from, '⚠️ Não consegui rodar a sombra agora. Tenta de novo.');
      }
    } catch (e) {
      console.error('[sombra] handler', e instanceof Error ? e.message : e);
      await d.sendText(from, '⚠️ Deu erro ao rodar a sombra. Tenta de novo.');
    }
    return true;
  };
}
