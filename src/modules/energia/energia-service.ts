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
import { proximoStatus, textoAvisoStatus } from './vigia.js';
import { tabelaAusente, avisarMigrationAusente } from './db-erros.js';
import { instanteDoStatus } from './adapters/shelly-cloud.js';
import { getMedidorAdapter } from './medidor-registry.js';
import type { LeituraMedidor, MedidorAdapter, ModoColeta, PerfilMedidor, StatusMedidor } from './types.js';
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
}

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
  atualizarStatus(m: MedidorRow, p: Partial<Pick<MedidorRow, 'status' | 'status_desde' | 'ultimo_erro' | 'ultima_leitura_em'>>): Promise<void>;
  apagarBrutoAntesDe(m: MedidorRow, iso: string): Promise<number>;
  apagar15minAntesDe(m: MedidorRow, iso: string): Promise<number>;
}

export interface OpcoesServico {
  adapter?: (fabricante: string) => MedidorAdapter | null;
}

const DIA_MS = 86_400_000;
/** Folga pra trás ao reprocessar: pega o intervalo que atravessa a fronteira da 1ª janela. */
const FOLGA_MS = 10 * 60_000;
/** Até quantos dias de bruto um medidor anda por ciclo (o 1º ciclo alcança o histórico aos poucos). */
const DIAS_POR_CICLO = 8;
/** Dia "completo" o bastante pra calcular consumo (gerado + comprado − devolvido). */
export const COBERTURA_DIA_COMPLETO_PCT = 95;
/** push_nuvem: a nuvem só entra quando o push está calado há mais disto. */
const NUVEM_RESERVA_APOS_MS = 20 * 60_000;
const RETENCAO_BRUTO_DIAS = 90;
const RETENCAO_15MIN_MESES = 25;

const tensaoNominal = (v: number | null): TensaoNominal | null => (v === 127 || v === 220 || v === 380 ? v : null);
const gapContador = (m: MedidorRow) => (m.modo_coleta === 'push' ? 600 : 1800);

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
      const bruto = await this.db.brutoEntre(m, new Date(cursor - FOLGA_MS).toISOString(), new Date(ate + FOLGA_MS).toISOString());
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

  /** 00h–01h de Brasília: refaz ontem e anteontem (geração e backfill atrasados). */
  async fecharDiasRecentes(agora: Date): Promise<{ medidores: number; dias: number }> {
    const out = { medidores: 0, dias: 0 };
    const ms = await this.medidores('fechamento');
    if (!ms) return out;
    const hoje = diaBrt(agora);
    for (const m of ms) {
      out.medidores++;
      for (const dia of [somarDias(hoje, -1), somarDias(hoje, -2)]) {
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

  async coletarNuvem(agora: Date, keyHex: string | undefined): Promise<{ ok: number; offline: number; falhas: number; credencial: number; desligada?: boolean }> {
    const out = { ok: 0, offline: 0, falhas: 0, credencial: 0 };
    if (!chaveEnergiaValida(keyHex)) return { ...out, desligada: true };
    const ms = await this.medidores('coleta nuvem');
    if (!ms) return out;

    const elegiveis = ms.filter((m) => {
      if (!m.api_credentials_cifrado || m.status === 'credencial_invalida') return false;
      if (m.modo_coleta === 'nuvem') return true;
      if (m.modo_coleta !== 'push_nuvem') return false;
      const ult = m.ultima_leitura_em ? Date.parse(m.ultima_leitura_em) : 0;
      return agora.getTime() - ult > NUVEM_RESERVA_APOS_MS;
    });

    // Agrupa por chave: decifra 1x por medidor, chama a nuvem 1x por conta (lotes de 10 no adapter).
    const grupos = new Map<string, { cred: CredShelly; ms: MedidorRow[] }>();
    for (const m of elegiveis) {
      let cred: CredShelly;
      try {
        cred = decifrarCred(m.api_credentials_cifrado!, keyHex);
      } catch {
        out.falhas++;
        await this.db.atualizarStatus(m, { status: 'erro', status_desde: agora.toISOString(), ultimo_erro: 'credencial guardada não abre (ENERGIA_CRED_KEY mudou?)' }).catch(() => undefined);
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
          for (const m of g.ms) {
            await this.db.atualizarStatus(m, { status: 'credencial_invalida', status_desde: agora.toISOString(), ultimo_erro: r.reason }).catch(() => undefined);
          }
        } else {
          out.falhas += g.ms.length;
          for (const m of g.ms) await this.db.atualizarStatus(m, { ultimo_erro: r.reason }).catch(() => undefined);
        }
        continue;
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
   * 1 aviso ao admin por MUDANÇA de status. Fora da janela de horário não avisa
   * NEM grava: a transição continua pendente e sai no primeiro ciclo dentro da
   * janela (é o status gravado que evita repetir). `avisar` devolve false quando
   * a empresa não tem destino de aviso — aí grava mesmo assim (não há a quem mandar).
   * Se `avisar` lança, não grava: tenta de novo no próximo ciclo.
   */
  async vigiar(
    agora: Date,
    avisar: (m: MedidorRow, texto: string) => Promise<boolean>,
    dentroDaJanela: (d: Date) => boolean,
  ): Promise<{ transicoes: number; avisos: number }> {
    const out = { transicoes: 0, avisos: 0 };
    const ms = await this.medidores('vigia');
    if (!ms) return out;
    if (!dentroDaJanela(agora)) return out;
    for (const m of ms) {
      const p = proximoStatus(m, agora);
      if (!p.mudou) continue;
      try {
        const enviado = await avisar(m, textoAvisoStatus({ apelido: m.apelido, status: p.status, ultima_leitura_em: m.ultima_leitura_em }, agora));
        if (enviado) out.avisos++;
        await this.db.atualizarStatus(m, { status: p.status as StatusMedidor, status_desde: agora.toISOString() });
        out.transicoes++;
      } catch (err) {
        console.warn(`[energia] vigia: aviso nao saiu medidor=${m.id}: ${erroCurto(err)}`);
      }
    }
    if (out.transicoes > 0) console.log(`[energia] vigia: ${out.transicoes} mudança(s) de status, ${out.avisos} aviso(s)`);
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
