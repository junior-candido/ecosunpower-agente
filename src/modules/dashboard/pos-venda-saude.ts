// src/modules/dashboard/pos-venda-saude.ts
// Funções PURAS da tela de pós-venda: saúde da usina (semáforo), elegibilidade
// de upgrade, próxima ação sugerida e ordenação por atenção. Sem I/O — testáveis.

export type Saude = 'verde' | 'amarelo' | 'vermelho';
export type AcaoManual = 'parabens' | 'relatorio' | 'limpeza' | 'depoimento' | 'upgrade' | 'contato';

export interface AlertaAberto { tipo: string; severidade: string }
export interface GeracaoDia { data: string; geracao_kwh: number }

const VERMELHO_ALERTAS = new Set(['sistema_offline', 'falha_inversor']);
const AMARELO_ALERTAS = new Set(['queda_geracao', 'manutencao_devida']);

// Saúde = pior sinal entre alertas abertos e geração recente.
// "Sem dados" (array vazio) NÃO é vermelho — usina nova/sem sync ≠ offline.
export function saudeUsina(alertasAbertos: AlertaAberto[], geracaoRecente: GeracaoDia[]): Saude {
  if (alertasAbertos.some((a) => VERMELHO_ALERTAS.has(a.tipo))) return 'vermelho';
  // Tem leitura recente, mas TUDO zerado (>= 5 dias) → parou de gerar.
  const comLeitura = geracaoRecente.length >= 5;
  const tudoZero = geracaoRecente.length > 0 && geracaoRecente.every((g) => Number(g.geracao_kwh) === 0);
  if (comLeitura && tudoZero) return 'vermelho';
  if (alertasAbertos.some((a) => AMARELO_ALERTAS.has(a.tipo))) return 'amarelo';
  return 'verde';
}

export interface UsinaInfo {
  potenciaKwp: number | null;
  dataInstalacao: string | null;
  geracaoEstimadaKwhMes: number | null;
}
export interface ContaInfo { consumoMedioKwh: number | null }

// Elegível pra ampliação/bateria quando o consumo cresceu além do que a usina
// gera (cliente voltou a pagar conta cheia). Sem os dois números → não sugere.
const MARGEM_UPGRADE = 1.15;
export function elegivelUpgrade(usina: UsinaInfo, conta: ContaInfo): boolean {
  const ger = usina.geracaoEstimadaKwhMes;
  const cons = conta.consumoMedioKwh;
  if (!(typeof ger === 'number' && ger > 0)) return false;
  if (!(typeof cons === 'number' && cons > 0)) return false;
  return cons > ger * MARGEM_UPGRADE;
}

export interface ProximaAcao { tipo: AcaoManual; label: string; urgencia: 'alta' | 'media' | 'baixa' }

export interface ContextoAcao {
  saude: Saude;
  dataInstalacao: string | null;
  ultimoContatoEm: string | null;
  jaTeveDepoimento: boolean;
  elegivelUpgrade: boolean;
}

function diasAteAniversario(dataInstalacao: string | null, hoje: Date): number | null {
  if (!dataInstalacao) return null;
  const inst = new Date(dataInstalacao + 'T00:00:00Z');
  if (Number.isNaN(inst.getTime())) return null;
  const hojeUtc = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const prox = new Date(Date.UTC(hoje.getUTCFullYear(), inst.getUTCMonth(), inst.getUTCDate()));
  if (prox.getTime() < hojeUtc) prox.setUTCFullYear(hoje.getUTCFullYear() + 1);
  return Math.round((prox.getTime() - hojeUtc) / 86400000);
}

function mesesDesde(iso: string | null, hoje: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  if (Number.isNaN(d.getTime())) return null;
  return (hoje.getTime() - d.getTime()) / (30 * 86400000);
}

// Prioridade: problema na usina > marco (aniversário) > prova social (depoimento)
// > expansão (upgrade) > manter contato. A 1ª que casar manda.
export function proximaAcaoPosVenda(c: ContextoAcao, hoje: Date): ProximaAcao {
  if (c.saude === 'vermelho') return { tipo: 'limpeza', label: '🔴 Usina precisa de atenção', urgencia: 'alta' };
  if (c.saude === 'amarelo') return { tipo: 'limpeza', label: '🧹 Limpeza/manutenção recomendada', urgencia: 'media' };

  const dAniv = diasAteAniversario(c.dataInstalacao, hoje);
  if (dAniv !== null && dAniv <= 7) {
    return { tipo: 'parabens', label: dAniv === 0 ? '🎉 Aniversário da usina hoje' : `🎉 Aniversário em ${dAniv} dia(s)`, urgencia: 'media' };
  }

  const idadeMeses = mesesDesde(c.dataInstalacao, hoje);
  if (!c.jaTeveDepoimento && idadeMeses !== null && idadeMeses >= 3) {
    return { tipo: 'depoimento', label: '⭐ Bom momento pra pedir depoimento', urgencia: 'baixa' };
  }

  if (c.elegivelUpgrade) return { tipo: 'upgrade', label: '🔋 Elegível a upgrade/ampliação', urgencia: 'baixa' };

  return { tipo: 'contato', label: '📞 Manter relacionamento', urgencia: 'baixa' };
}

const PESO_SAUDE: Record<Saude, number> = { vermelho: 0, amarelo: 1, verde: 2 };

export interface LinhaOrdenavel { saude: Saude; ultimoContatoEm: string | null }
// Vermelho primeiro; empate → quem está sem contato há mais tempo sobe.
export function ordenarPorAtencao<T extends LinhaOrdenavel>(linhas: T[]): T[] {
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : 0); // sem contato = epoch = mais antigo
  return [...linhas].sort((a, b) => PESO_SAUDE[a.saude] - PESO_SAUDE[b.saude] || t(a.ultimoContatoEm) - t(b.ultimoContatoEm));
}
