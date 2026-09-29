// Limites de uso do leitor por IA — EM MEMÓRIA (sem tabela nova). Reinicia com o servidor, o que é
// aceitável: o objetivo é segurar abuso e custo, não faturar. Cada chamada à IA conta 1.
//
//  · por licença (id da chave GRS2): N leituras por dia (dia de Brasília);
//  · avaliação (sem licença, só o código do computador — que qualquer um pode inventar): poucas por
//    computador E um teto do dia para TODAS as avaliações juntas;
//  · por IP (o último do X-Forwarded-For, que o proxy do EasyPanel põe): teto por hora;
//  · teto do dia do serviço inteiro, em leituras E em reais (custo estimado pelos tokens);
//  · no máximo K leituras ao mesmo tempo (avaliação tem a sua fila, menor — não trava quem pagou);
//  · qualquer pedido (até os recusados) conta no teto por IP por minuto, ANTES de ler o corpo.

export interface ConfigLimites {
  porLicencaDia: number;
  porAvaliacaoDia: number;
  avaliacaoTotalDia: number;
  porIpHora: number;
  totalDia: number;
  simultaneas: number;
  simultaneasAvaliacao: number;
  /** Teto de gasto do dia, em centavos de real (estimado pelos tokens). */
  tetoCentavosDia: number;
  /** Pedidos por IP por minuto (todos, até os recusados) — barra enxurrada antes de ler o corpo. */
  pedidosIpMinuto: number;
}

export const LIMITES_PADRAO: ConfigLimites = {
  porLicencaDia: 80,
  porAvaliacaoDia: 6,
  avaliacaoTotalDia: 150,
  porIpHora: 60,
  totalDia: 1500,
  simultaneas: 6,
  simultaneasAvaliacao: 2,
  tetoCentavosDia: 3000, // R$ 30,00 por dia
  pedidosIpMinuto: 30,
};

/** Lê os limites das variáveis de ambiente (LEITOR_IA_LIMITE_*), com o padrão acima. */
export function limitesDoAmbiente(env: Record<string, string | undefined> = process.env): ConfigLimites {
  const reais = (v: string | undefined) => {
    const r = Number(v);
    return v && Number.isFinite(r) && r >= 0 ? Math.round(r * 100) : null;
  };
  const n = (k: string, p: number) => {
    const v = Number(env[k]);
    return Number.isInteger(v) && v >= 0 ? v : p;
  };
  return {
    porLicencaDia: n('LEITOR_IA_LIMITE_LICENCA_DIA', LIMITES_PADRAO.porLicencaDia),
    porAvaliacaoDia: n('LEITOR_IA_LIMITE_AVALIACAO_DIA', LIMITES_PADRAO.porAvaliacaoDia),
    avaliacaoTotalDia: n('LEITOR_IA_LIMITE_AVALIACAO_TOTAL_DIA', LIMITES_PADRAO.avaliacaoTotalDia),
    porIpHora: n('LEITOR_IA_LIMITE_IP_HORA', LIMITES_PADRAO.porIpHora),
    totalDia: n('LEITOR_IA_LIMITE_TOTAL_DIA', LIMITES_PADRAO.totalDia),
    simultaneas: n('LEITOR_IA_SIMULTANEAS', LIMITES_PADRAO.simultaneas),
    simultaneasAvaliacao: n('LEITOR_IA_SIMULTANEAS_AVALIACAO', LIMITES_PADRAO.simultaneasAvaliacao),
    tetoCentavosDia: reais(env.LEITOR_IA_TETO_REAIS_DIA) ?? LIMITES_PADRAO.tetoCentavosDia,
    pedidosIpMinuto: n('LEITOR_IA_PEDIDOS_IP_MINUTO', LIMITES_PADRAO.pedidosIpMinuto),
  };
}

export type Quem = { tipo: 'licenca'; id: string } | { tipo: 'avaliacao'; computador: string };
export type Negado = 'licenca-dia' | 'avaliacao-dia' | 'avaliacao-total' | 'ip-hora' | 'total-dia' | 'ocupado' | 'teto-reais' | 'ip-minuto';

const diaBrasilia = (ms: number) => new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);

export class LimitesLeitor {
  private dia = '';
  private porChave = new Map<string, number>();
  private avaliacaoTotal = 0;
  private total = 0;
  private porIp = new Map<string, number[]>();
  private andamento = 0;
  private andamentoAvaliacao = 0;
  private gastoCentavos = 0;
  private pedidosIp = new Map<string, number[]>();

  constructor(private readonly cfg: ConfigLimites = LIMITES_PADRAO, private readonly agora: () => number = () => Date.now()) {}

  private virarDia(t: number) {
    const d = diaBrasilia(t);
    if (d === this.dia) return;
    this.dia = d;
    this.porChave.clear();
    this.avaliacaoTotal = 0;
    this.total = 0;
    this.gastoCentavos = 0;
  }

  /** Todo pedido que chega (antes de ler o corpo). false = enxurrada deste IP: recusa na hora. */
  contarPedido(ip: string): boolean {
    const t = this.agora();
    if (this.pedidosIp.size > 2000) {
      for (const [k, ts] of this.pedidosIp) {
        const vivos = ts.filter((x) => t - x < 60_000);
        if (vivos.length) this.pedidosIp.set(k, vivos);
        else this.pedidosIp.delete(k);
      }
    }
    const lista = (this.pedidosIp.get(ip) ?? []).filter((x) => t - x < 60_000);
    if (lista.length >= this.cfg.pedidosIpMinuto) { this.pedidosIp.set(ip, lista); return false; }
    lista.push(t);
    this.pedidosIp.set(ip, lista);
    return true;
  }

  /** Custo estimado de uma leitura feita (centavos de real) — conta no teto do dia. */
  registrarCusto(centavos: number): void {
    this.virarDia(this.agora());
    if (Number.isFinite(centavos) && centavos > 0) this.gastoCentavos += centavos;
  }

  /**
   * Reserva 1 leitura. Devolve a função que LIBERA a vaga de "ao mesmo tempo" (chamar sempre, no
   * finally) — ou o motivo da recusa.
   */
  reservar(quem: Quem, ip: string): { ok: true; liberar: () => void } | { ok: false; motivo: Negado } {
    const t = this.agora();
    this.virarDia(t);
    if (this.andamento >= this.cfg.simultaneas) return { ok: false, motivo: 'ocupado' };
    if (quem.tipo === 'avaliacao' && this.andamentoAvaliacao >= this.cfg.simultaneasAvaliacao) return { ok: false, motivo: 'ocupado' };
    if (this.total >= this.cfg.totalDia) return { ok: false, motivo: 'total-dia' };
    if (this.gastoCentavos >= this.cfg.tetoCentavosDia) return { ok: false, motivo: 'teto-reais' };
    const chave = quem.tipo === 'licenca' ? `l:${quem.id}` : `a:${quem.computador}`;
    const usadas = this.porChave.get(chave) ?? 0;
    if (quem.tipo === 'licenca' && usadas >= this.cfg.porLicencaDia) return { ok: false, motivo: 'licenca-dia' };
    if (quem.tipo === 'avaliacao') {
      if (usadas >= this.cfg.porAvaliacaoDia) return { ok: false, motivo: 'avaliacao-dia' };
      if (this.avaliacaoTotal >= this.cfg.avaliacaoTotalDia) return { ok: false, motivo: 'avaliacao-total' };
    }
    // Faxina: IPs de passagem não acumulam para sempre.
    if (this.porIp.size > 2000) {
      for (const [k, ts] of this.porIp) {
        const vivos = ts.filter((x) => t - x < 3600_000);
        if (vivos.length) this.porIp.set(k, vivos);
        else this.porIp.delete(k);
      }
    }
    const doIp = (this.porIp.get(ip) ?? []).filter((x) => t - x < 3600_000);
    if (doIp.length >= this.cfg.porIpHora) {
      this.porIp.set(ip, doIp);
      return { ok: false, motivo: 'ip-hora' };
    }
    doIp.push(t);
    this.porIp.set(ip, doIp);
    this.porChave.set(chave, usadas + 1);
    if (quem.tipo === 'avaliacao') this.avaliacaoTotal++;
    this.total++;
    this.andamento++;
    const avaliacao = quem.tipo === 'avaliacao';
    if (avaliacao) this.andamentoAvaliacao++;
    let liberou = false;
    return {
      ok: true,
      liberar: () => {
        if (liberou) return;
        liberou = true;
        this.andamento = Math.max(0, this.andamento - 1);
        if (avaliacao) this.andamentoAvaliacao = Math.max(0, this.andamentoAvaliacao - 1);
      },
    };
  }

  /** Para a observabilidade: quanto já foi usado hoje. */
  resumo(): { dia: string; total: number; avaliacao: number; andamento: number; gastoCentavos: number } {
    this.virarDia(this.agora());
    return { dia: this.dia, total: this.total, avaliacao: this.avaliacaoTotal, andamento: this.andamento, gastoCentavos: this.gastoCentavos };
  }
}

export const MENSAGEM_LIMITE: Record<Negado, string> = {
  'licenca-dia': 'Chegou ao limite de leituras por IA de hoje nesta licença. Amanhã volta; hoje, digite olhando a foto.',
  'avaliacao-dia': 'Na avaliação, a leitura por IA tem um limite por dia. Amanhã volta; hoje, digite olhando a foto.',
  'avaliacao-total': 'A leitura por IA da avaliação está no limite de hoje. Digite olhando a foto.',
  'ip-hora': 'Muitas leituras por IA em pouco tempo. Espere um pouco ou digite olhando a foto.',
  'total-dia': 'A leitura por IA está no limite de hoje. Digite olhando a foto.',
  ocupado: 'A leitura por IA está ocupada agora. Tente de novo em instantes ou digite olhando a foto.',
  'teto-reais': 'A leitura por IA está no limite de hoje. Digite olhando a foto.',
  'ip-minuto': 'Muitos pedidos em pouco tempo. Espere um minuto ou digite olhando a foto.',
};
