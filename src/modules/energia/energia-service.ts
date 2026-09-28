// src/modules/energia/energia-service.ts
//
// Ciclos da Gestão de Energia (spec §4.2–4.6), rodados pelos crons do index.ts:
//   agregar            — bruto (1 min / fotos da nuvem) → energia_15min → energia_diaria
//   fecharDiasRecentes — refaz ontem e anteontem (geração que chegou atrasada)
//   coletarNuvem       — leitor RESERVA pela nuvem Shelly (D1)
//   vigiar             — vigia de silêncio: 1 aviso ao admin por mudança de status
//   reter              — bruto 90 dias, 15 min 25 meses (D4)
//
// Multi-tenant: o cron roda com service role (todas as empresas), mas TODA
// escrita/leitura leva o company_id do próprio medidor (o repo filtra por ele).
// Logs só com ids e contagens — nunca valores de consumo (LGPD).

import { agregar15min, resumirDia, inicioJanela, JANELA_MS, type Janela15, type LeituraBruta, type ResumoDia } from './agregacao.js';
import { balancoEnergia } from './balanco.js';
import { diaBrt, somarDias } from './tempo.js';
import { decifrarCred, chaveEnergiaValida, normalizarDeviceId, type CredShelly } from './credenciais.js';
import { proximoStatus, textoAvisoStatus, textoAvisoNuvem, MAX_AVISOS_POR_DIA } from './vigia.js';
import { tabelaAusente, avisarMigrationAusente } from './db-erros.js';
import { instanteDoStatus } from './adapters/shelly-cloud.js';
import { getMedidorAdapter } from './medidor-registry.js';
import type { LeituraMedidor, MedidorAdapter, ModoColeta, PerfilMedidor } from './types.js';
import type { TensaoNominal } from './prodist.js';

export interface MedidorRow {
  id: string;
  company_id: string;
  lead_id: string | null;
  sistema_id: string | null;
  apelido: string;
  device_id: string;
  modo_coleta: ModoColeta;
  perfil: PerfilMedidor;
  canais: { rede?: number } | null;
  tensao_nominal_v: number | null;
  api_credentials_cifrado: string | null;
  ativo: boolean;
  status: string;
  status_desde: string | null;
  ultima_leitura_em: string | null;
  ultimo_erro: string | null;
  /** Chave da nuvem: null = não testada, false = recusada/não abre (separado do status). */
  nuvem_ok: boolean | null;
  nuvem_desde: string | null;
  nuvem_avisado_em: string | null;
  /** Freio de avisos: dia de Brasília e quantos já saíram nele. */
  aviso_dia: string | null;
  avisos_no_dia: number | null;
}

/** Colunas que os ciclos atualizam no medidor. */
export type CamposStatus = Partial<Pick<MedidorRow,
  'status' | 'status_desde' | 'ultimo_erro' | 'ultima_leitura_em' | 'nuvem_ok' | 'nuvem_desde' | 'nuvem_avisado_em' | 'aviso_dia' | 'avisos_no_dia'>>;

/**
 * Resultado de um aviso ao admin:
 *  - enviado     → saiu; conta no freio diário;
 *  - sem_destino → a empresa não tem pra quem mandar (ou não contratou): grava a transição;
 *  - dry_run     → PROACTIVE_ALERTS_DRY_RUN: não saiu e NÃO grava (sai de verdade depois).
 */
export type ResultadoAviso = 'enviado' | 'sem_destino' | 'dry_run';
export type AvisarAdmin = (m: MedidorRow, texto: string) => Promise<ResultadoAviso>;

export type DiaParaGravar = ResumoDia & { geracaoKwh: number | null; consumoKwh: number | null };
export type Fonte = 'push' | 'nuvem' | 'backfill';

/** Tudo que o serviço precisa do banco. Toda função recebe o medidor → filtra pelo company_id DELE. */
export interface EnergiaDb {
  medidoresAtivos(): Promise<MedidorRow[]>;
  brutoEntre(m: MedidorRow, desdeIso: string, ateIso: string): Promise<LeituraBruta[]>;
  primeiraLeitura(m: MedidorRow): Promise<string | null>;
  proximaLeitura(m: MedidorRow, aposIso: string): Promise<string | null>;
  ultimaJanela(m: MedidorRow): Promise<string | null>;
  gravarJanelas(m: MedidorRow, js: Janela15[], fonte: Fonte): Promise<void>;
  janelasDoDia(m: MedidorRow, dia: string): Promise<Janela15[]>;
  geracaoDoDia(m: MedidorRow, dia: string): Promise<number | null>;
  gravarDia(m: MedidorRow, r: DiaParaGravar): Promise<void>;
  gravarLeituraSintetica(m: MedidorRow, l: LeituraMedidor, medidoEmIso: string): Promise<void>;
  atualizarStatus(m: MedidorRow, p: CamposStatus): Promise<void>;
  apagarBrutoAntesDe(m: MedidorRow, iso: string): Promise<number>;
  apagar15minAntesDe(m: MedidorRow, iso: string): Promise<number>;
}

export interface OpcoesServico {
  adapter?: (fabricante: string) => MedidorAdapter | null;
}

const DIA_MS = 86_400_000;
/**
 * Folga dos dois lados ao ler o bruto: pega o intervalo que atravessa a
 * fronteira da 1ª e da última janela. Nunca menor que o maior intervalo aceito
 * entre contadores (nuvem: 30 min) — senão a leitura de antes do cursor fica de
 * fora e a janela refeita perde minutos (e energia).
 */
const FOLGA_MIN_MS = 10 * 60_000;
/** Até quantos dias de bruto um medidor anda por ciclo (o 1º ciclo alcança o histórico aos poucos). */
const DIAS_POR_CICLO = 8;
/** Dia "completo" o bastante pra calcular consumo (gerado + comprado − devolvido). */
export const COBERTURA_DIA_COMPLETO_PCT = 95;
/** push_nuvem: a nuvem só entra quando o push está calado há mais disto. */
const NUVEM_RESERVA_APOS_MS = 20 * 60_000;
/** Quantos dias o fechamento da madrugada refaz (96 janelas por dia por medidor: barato). */
export const DIAS_REFEITOS_A_NOITE = 7;
const RETENCAO_BRUTO_DIAS = 90;
const RETENCAO_15MIN_MESES = 25;

const tensaoNominal = (v: number | null): TensaoNominal | null => (v === 127 || v === 220 || v === 380 ? v : null);
const gapContador = (m: MedidorRow) => (m.modo_coleta === 'push' ? 600 : 1800);
const folgaMs = (m: MedidorRow) => Math.max(FOLGA_MIN_MS, gapContador(m) * 1000);

function erroCurto(e: unknown): string {
  return String((e as Error)?.message ?? e).slice(0, 160);
}

export class EnergiaService {
  private readonly adapterDe: (f: string) => MedidorAdapter | null;

  constructor(private readonly db: EnergiaDb, o: OpcoesServico = {}) {
    this.adapterDe = o.adapter ?? getMedidorAdapter;
  }

  /** Medidores ativos; tabela ausente (migration não aplicada) → lista vazia + aviso único. */
  private async medidores(onde: string): Promise<MedidorRow[] | null> {
    try {
      return await this.db.medidoresAtivos();
    } catch (err) {
      if (tabelaAusente(err as { code?: string; message?: string })) { avisarMigrationAusente(onde); return null; }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Agregação 15 min + dia
  // -------------------------------------------------------------------------

  async agregar(agora: Date): Promise<{ medidores: number; janelas: number; dias: number; falhas: number }> {
    const out = { medidores: 0, janelas: 0, dias: 0, falhas: 0 };
    const ms = await this.medidores('agregacao');
    if (!ms) return out;
    for (const m of ms) {
      try {
        const r = await this.agregarMedidor(m, agora);
        out.medidores++; out.janelas += r.janelas; out.dias += r.dias;
      } catch (err) {
        out.falhas++;
        console.warn(`[energia] agregacao falhou medidor=${m.id}: ${erroCurto(err)}`);
      }
    }
    if (out.janelas > 0 || out.falhas > 0) {
      console.log(`[energia] agregacao: ${out.janelas} janela(s) de ${out.medidores} medidor(es), ${out.dias} dia(s) refeito(s), ${out.falhas} falha(s)`);
    }
    return out;
  }

  private async agregarMedidor(m: MedidorRow, agora: Date): Promise<{ janelas: number; dias: number }> {
    const fechadaAte = inicioJanela(agora.getTime()); // só janela FECHADA
    const ultima = await this.db.ultimaJanela(m);
    let cursor: number;
    if (ultima) cursor = Date.parse(ultima); // refaz a última (podia estar parcial)
    else {
      const primeira = await this.db.primeiraLeitura(m);
      if (!primeira) return { janelas: 0, dias: 0 };
      cursor = inicioJanela(Date.parse(primeira));
    }

    const diasTocados = new Set<string>();
    let total = 0;
    for (let passo = 0; passo < DIAS_POR_CICLO && cursor < fechadaAte; passo++) {
      const ate = Math.min(cursor + DIA_MS, fechadaAte);
      // Folga dos dois lados: o intervalo que atravessa a fronteira entra inteiro.
      const folga = folgaMs(m);
      const bruto = await this.db.brutoEntre(m, new Date(cursor - folga).toISOString(), new Date(ate + folga).toISOString());
      const js = agregar15min(bruto, { tensaoNominal: tensaoNominal(m.tensao_nominal_v), gapMaxContadorS: gapContador(m) })
        .filter((j) => {
          const t = Date.parse(j.inicio);
          return j.segundosCobertos > 0 && t >= cursor && t + JANELA_MS <= ate;
        });
      if (js.length > 0) {
        await this.db.gravarJanelas(m, js, m.modo_coleta === 'nuvem' ? 'nuvem' : 'push');
        total += js.length;
        for (const j of js) diasTocados.add(diaBrt(j.inicio));
        cursor = ate;
        continue;
      }
      // Nada nesse trecho: pula o buraco até a próxima leitura (o cursor não trava).
      const prox = await this.db.proximaLeitura(m, new Date(ate).toISOString());
      if (!prox || Date.parse(prox) >= fechadaAte) break;
      cursor = inicioJanela(Date.parse(prox));
    }

    for (const dia of [...diasTocados].sort()) await this.fecharDia(m, dia);
    return { janelas: total, dias: diasTocados.size };
  }

  /** Refaz o resumo do dia a partir das janelas. Consumo só com dia completo e usina ligada. */
  async fecharDia(m: MedidorRow, dia: string): Promise<boolean> {
    const r = resumirDia(dia, await this.db.janelasDoDia(m, dia));
    if (!r) return false;
    const geracaoKwh = m.sistema_id ? await this.db.geracaoDoDia(m, dia) : null;
    const completo = r.coberturaPct >= COBERTURA_DIA_COMPLETO_PCT;
    const consumoKwh = completo
      ? balancoEnergia({ geradoKwh: geracaoKwh, importadoKwh: r.importadoKwh, exportadoKwh: r.exportadoKwh }).consumoKwh
      : null;
    await this.db.gravarDia(m, { ...r, geracaoKwh, consumoKwh });
    return true;
  }

  /** 00h–01h de Brasília: refaz os últimos 7 dias (geração que chegou atrasada e backfill da memória do aparelho). */
  async fecharDiasRecentes(agora: Date): Promise<{ medidores: number; dias: number }> {
    const out = { medidores: 0, dias: 0 };
    const ms = await this.medidores('fechamento');
    if (!ms) return out;
    const hoje = diaBrt(agora);
    for (const m of ms) {
      out.medidores++;
      for (const dia of Array.from({ length: DIAS_REFEITOS_A_NOITE }, (_, i) => somarDias(hoje, -(i + 1)))) {
        try {
          if (await this.fecharDia(m, dia)) out.dias++;
        } catch (err) {
          console.warn(`[energia] fechamento falhou medidor=${m.id} dia=${dia}: ${erroCurto(err)}`);
        }
      }
    }
    console.log(`[energia] fechamento: ${out.dias} dia(s) de ${out.medidores} medidor(es)`);
    return out;
  }

  // -------------------------------------------------------------------------
  // Nuvem Shelly (reserva)
  // -------------------------------------------------------------------------

  /**
   * Chave recusada (ou que não abre com a ENERGIA_CRED_KEY) → nuvem_ok=false:
   * a nuvem para de ser chamada pra esse medidor até alguém colar a chave nova,
   * e o vigia manda UM aviso ao admin (nuvem_avisado_em). O status de chegada
   * de dado NÃO é tocado — o push de um "script + nuvem" segue vigiado.
   */
  async coletarNuvem(agora: Date, keyHex: string | undefined): Promise<{ ok: number; offline: number; falhas: number; credencial: number; desligada?: boolean }> {
    const out = { ok: 0, offline: 0, falhas: 0, credencial: 0 };
    if (!chaveEnergiaValida(keyHex)) return { ...out, desligada: true };
    const ms = await this.medidores('coleta nuvem');
    if (!ms) return out;

    const elegiveis = ms.filter((m) => {
      if (!m.api_credentials_cifrado || m.nuvem_ok === false) return false;
      if (m.modo_coleta === 'nuvem') return true;
      if (m.modo_coleta !== 'push_nuvem') return false;
      const ult = m.ultima_leitura_em ? Date.parse(m.ultima_leitura_em) : 0;
      return agora.getTime() - ult > NUVEM_RESERVA_APOS_MS;
    });

    const chaveRuim = async (m: MedidorRow, motivo: string) => {
      if (m.nuvem_ok === false) return;
      await this.db.atualizarStatus(m, { nuvem_ok: false, nuvem_desde: agora.toISOString(), nuvem_avisado_em: null, ultimo_erro: motivo })
        .catch((e) => console.warn(`[energia] nuvem: nao gravou chave recusada medidor=${m.id}: ${erroCurto(e)}`));
    };

    // Agrupa por chave: decifra 1x por medidor, chama a nuvem 1x por conta (lotes de 10 no adapter).
    const grupos = new Map<string, { cred: CredShelly; ms: MedidorRow[] }>();
    for (const m of elegiveis) {
      let cred: CredShelly;
      try {
        cred = decifrarCred(m.api_credentials_cifrado!, keyHex, { medidorId: m.id, companyId: m.company_id });
      } catch {
        out.falhas++;
        await chaveRuim(m, 'a chave guardada não abre (ENERGIA_CRED_KEY mudou?) — cole a chave de novo');
        continue;
      }
      const k = `${cred.server_uri}|${cred.auth_key}`;
      const g = grupos.get(k) ?? { cred, ms: [] };
      g.ms.push(m);
      grupos.set(k, g);
    }

    for (const g of grupos.values()) {
      const adapter = this.adapterDe('shelly');
      if (!adapter) continue;
      const porDevice = new Map(g.ms.map((m) => [normalizarDeviceId(m.device_id), m]));
      const r = await adapter.buscarStatus(g.cred, [...porDevice.keys()]);
      if (!r.ok) {
        if (r.invalidCredentials) {
          out.credencial += g.ms.length;
          for (const m of g.ms) await chaveRuim(m, r.reason);
        } else {
          // Falha passageira (rede, nuvem fora): só anota; tenta no próximo ciclo.
          out.falhas += g.ms.length;
          for (const m of g.ms) await this.db.atualizarStatus(m, { ultimo_erro: r.reason }).catch(() => undefined);
        }
        continue;
      }
      for (const m of g.ms) {
        // A chave foi aceita: limpa um problema antigo (ex.: chave colada de novo).
        if (m.nuvem_ok !== true) await this.db.atualizarStatus(m, { nuvem_ok: true, nuvem_desde: null, nuvem_avisado_em: null, ultimo_erro: null }).catch(() => undefined);
      }
      for (const d of r.devices) {
        const m = porDevice.get(normalizarDeviceId(d.id));
        if (!m) continue;
        if (!d.online || !d.status) { out.offline++; continue; }
        const l = adapter.lerCanal(d.status, m.perfil, m.canais?.rede ?? 2);
        if (!l) { out.falhas++; await this.db.atualizarStatus(m, { ultimo_erro: 'a nuvem não trouxe o canal da rede (confira perfil e canal no cadastro)' }).catch(() => undefined); continue; }
        try {
          await this.db.gravarLeituraSintetica(m, l, instanteDoStatus(d.status, agora.getTime()));
          out.ok++;
        } catch (err) {
          out.falhas++;
          console.warn(`[energia] leitura da nuvem nao gravou medidor=${m.id}: ${erroCurto(err)}`);
        }
      }
    }
    if (elegiveis.length > 0) console.log(`[energia] coleta nuvem: ${out.ok} ok / ${out.falhas} falha / ${out.credencial} credencial / ${out.offline} offline`);
    return out;
  }

  // -------------------------------------------------------------------------
  // Vigia de silêncio
  // -------------------------------------------------------------------------

  /**
   * Avisos que SAÍRAM mas cuja gravação falhou (id → o que foi avisado). No
   * ciclo seguinte a transição ainda está pendente no banco: aqui se sabe que a
   * mensagem já foi, e só a gravação é refeita (sem repetir o zap).
   */
  private readonly avisadosSemGravar = new Map<string, { chave: string; usados: number }>();

  /**
   * Vigia de silêncio + aviso da chave da nuvem, pelo MESMO `avisar`.
   *
   * Regras (dono, 28/09): avisa "parou" (≥ 30 min sem dado) e "voltou"; o 1º
   * dado de um medidor novo é "começou a mandar dado". Freio: no máximo
   * MAX_AVISOS_POR_DIA por medidor por dia de Brasília — passou disso, a
   * transição é gravada sem mensagem (senão sairia atrasada e fora de hora).
   *
   * Fora da janela de horário não avisa NEM grava: a transição continua
   * pendente e sai no primeiro ciclo dentro da janela (é o status gravado que
   * evita repetir). `avisar`:
   *   - lança        → não grava; tenta no próximo ciclo;
   *   - 'dry_run'    → não grava (a transição não foi avisada de verdade);
   *   - 'sem_destino'→ grava (não há a quem mandar).
   */
  async vigiar(
    agora: Date,
    avisar: AvisarAdmin,
    dentroDaJanela: (d: Date) => boolean,
  ): Promise<{ transicoes: number; avisos: number }> {
    const out = { transicoes: 0, avisos: 0 };
    const ms = await this.medidores('vigia');
    if (!ms) return out;
    if (!dentroDaJanela(agora)) return out;
    const hoje = diaBrt(agora);
    for (const m of ms) {
      let usados = m.aviso_dia === hoje ? Number(m.avisos_no_dia ?? 0) : 0;

      // 1) Chegada de dado.
      const p = proximoStatus(m, agora);
      // Sem transição pendente: um "avisado sem gravar" antigo não vale mais.
      if (!p.mudou) this.avisadosSemGravar.delete(m.id);
      if (p.mudou) {
        const chave = `dado:${p.status}`;
        try {
          let r: ResultadoAviso | 'ja_avisado' | 'freio';
          const pendente = this.avisadosSemGravar.get(m.id);
          if (pendente?.chave === chave) { r = 'ja_avisado'; usados = Math.max(usados, pendente.usados); }
          else if (usados >= MAX_AVISOS_POR_DIA) r = 'freio';
          else r = await avisar(m, textoAvisoStatus({ apelido: m.apelido, status: p.status, anterior: m.status, ultima_leitura_em: m.ultima_leitura_em }, agora));
          if (r === 'dry_run') continue;
          if (r === 'enviado') { usados++; out.avisos++; this.avisadosSemGravar.set(m.id, { chave, usados }); }
          if (r === 'freio') console.log(`[energia] vigia: freio diario atingido medidor=${m.id} (transicao gravada sem mensagem)`);
          await this.db.atualizarStatus(m, { status: p.status, status_desde: agora.toISOString(), aviso_dia: hoje, avisos_no_dia: usados });
          this.avisadosSemGravar.delete(m.id);
          out.transicoes++;
        } catch (err) {
          console.warn(`[energia] vigia: aviso ou gravacao falhou medidor=${m.id}: ${erroCurto(err)}`);
        }
      }

      // 2) Chave da nuvem recusada: UM aviso (fica pendente se o freio do dia já foi).
      const nuvemPendente = m.nuvem_ok === false && !m.nuvem_avisado_em && m.modo_coleta !== 'push' && !!m.api_credentials_cifrado;
      if (!nuvemPendente) this.avisadosSemGravar.delete(`${m.id}|nuvem`);
      if (nuvemPendente) {
        const chave = 'nuvem';
        try {
          let r: ResultadoAviso | 'ja_avisado';
          const pendente = this.avisadosSemGravar.get(`${m.id}|nuvem`);
          if (pendente?.chave === chave) { r = 'ja_avisado'; usados = Math.max(usados, pendente.usados); }
          else if (usados >= MAX_AVISOS_POR_DIA) continue;
          else r = await avisar(m, textoAvisoNuvem(m.apelido));
          if (r === 'dry_run') continue;
          if (r === 'enviado') { usados++; out.avisos++; this.avisadosSemGravar.set(`${m.id}|nuvem`, { chave, usados }); }
          await this.db.atualizarStatus(m, { nuvem_avisado_em: agora.toISOString(), aviso_dia: hoje, avisos_no_dia: usados });
          this.avisadosSemGravar.delete(`${m.id}|nuvem`);
        } catch (err) {
          console.warn(`[energia] vigia: aviso da chave da nuvem falhou medidor=${m.id}: ${erroCurto(err)}`);
        }
      }
    }
    if (out.transicoes > 0 || out.avisos > 0) console.log(`[energia] vigia: ${out.transicoes} mudança(s) de status, ${out.avisos} aviso(s)`);
    return out;
  }

  // -------------------------------------------------------------------------
  // Retenção (D4)
  // -------------------------------------------------------------------------

  async reter(agora: Date): Promise<{ bruto: number; janelas: number }> {
    const out = { bruto: 0, janelas: 0 };
    const ms = await this.medidores('retencao');
    if (!ms) return out;
    const corteBruto = agora.getTime() - RETENCAO_BRUTO_DIAS * DIA_MS;
    const c15 = new Date(agora.getTime());
    c15.setUTCMonth(c15.getUTCMonth() - RETENCAO_15MIN_MESES);
    for (const m of ms) {
      try {
        // Bruto só sai depois de virar 15 min: nunca apaga além da última janela agregada.
        const ultima = await this.db.ultimaJanela(m);
        if (ultima) {
          const corte = Math.min(corteBruto, Date.parse(ultima));
          out.bruto += await this.db.apagarBrutoAntesDe(m, new Date(corte).toISOString());
        }
        out.janelas += await this.db.apagar15minAntesDe(m, c15.toISOString());
      } catch (err) {
        console.warn(`[energia] retencao falhou medidor=${m.id}: ${erroCurto(err)}`);
      }
    }
    if (out.bruto > 0 || out.janelas > 0) console.log(`[energia] retencao: ${out.bruto} leitura(s) bruta(s) e ${out.janelas} janela(s) apagada(s)`);
    return out;
  }
}
