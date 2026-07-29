// src/modules/monitoring/classificacao.ts
// O RADAR. Função PURA. Regra extraída de getDetalheSistema (mesmos textos
// de alerta = zero-regressão). Lista e detalhe consomem a MESMA função.

export type NivelSistema = 'urgente' | 'aviso' | 'info' | 'ok';

export interface ClassificacaoInput {
  ativo: boolean;
  ultimoErro: string | null;
  potenciaKwp: number | null;
  uf: string | null;
  diasSemGeracao: number; // dias consecutivos sem geração>0 (detalhe: preciso; lista: proxy 7d=0 -> 7)
  realUltimos7: number;   // kWh somados nos últimos 7 dias
  // Último status devolvido pelo adapter da marca (guardado pelo sync na 084).
  // Dá NOME ao problema da usina parada (fatia 1 do pedido do Thiago 28/07).
  statusInversor?: 'ok' | 'offline' | 'falha' | 'desconhecido' | null;
  // Régua POR EMPRESA (085): fração do esperado abaixo da qual acende o
  // amarelo. Ausente = 0.70 (padrão histórico). Vem de empresaDe(company_id).
  corteAtencao?: number | null;
  // Régua RELATIVA À CARTEIRA (29/07): mediana de kWh/kWp em 7 dias das
  // usinas da MESMA empresa (medianaEspecifica7d). Nublou pra todos, a
  // mediana desce junto — só destoa quem está pior que as irmãs. Ausente
  // (carteira pequena) = régua absoluta de HSP, comportamento antigo.
  medianaCarteira7d?: number | null;
}

export interface Alerta {
  tipo: string;
  severidade: 'aviso' | 'urgente' | 'info';
  texto: string;
}

export interface Classificacao {
  nivel: NivelSistema;
  alerta: Alerta | null;
}

// HSP médio por UF (horas de sol pleno/dia, plano inclinado — Atlas Brasileiro
// de Energia Solar, valores conservadores). Default 5.2 = Planalto (DF).
// RJ/SP/ES entraram na degustação Sabion 27/07: a carteira do tenant é do RJ
// e a régua do cerrado gerava "abaixo do esperado" falso em usina saudável.
const HSP_POR_UF: Record<string, number> = {
  GO: 5.3,
  DF: 5.2,
  RJ: 4.8,
  SP: 4.9,
  ES: 4.9,
};

export function esperadoDiaKwh(potenciaKwp: number | null, uf: string | null): number {
  const hsp = HSP_POR_UF[(uf ?? '').toUpperCase()] ?? 5.2;
  return Number(potenciaKwp ?? 0) * hsp * 0.80;
}

// Mediana de kWh/kWp em 7 dias da carteira. Só usinas com kWp>0 E geração>0
// entram (usina parada é problema, não referência). Menos de 5 válidas =
// null: carteira pequena demais pra mediana valer como régua.
export function medianaEspecifica7d(
  sistemas: Array<{ potenciaKwp: number | null; realUltimos7: number }>,
): number | null {
  const specs = sistemas
    .filter((s) => Number(s.potenciaKwp ?? 0) > 0 && s.realUltimos7 > 0)
    .map((s) => s.realUltimos7 / Number(s.potenciaKwp))
    .sort((a, b) => a - b);
  if (specs.length < 5) return null;
  const meio = Math.floor(specs.length / 2);
  return specs.length % 2 === 1 ? specs[meio] : (specs[meio - 1] + specs[meio]) / 2;
}

export function classificarSistema(i: ClassificacaoInput): Classificacao {
  if (!i.ativo) return { nivel: 'ok', alerta: null };

  if (i.ultimoErro) {
    return {
      nivel: 'urgente',
      alerta: { tipo: 'erro_integracao', severidade: 'urgente', texto: `Erro de integração: ${i.ultimoErro}` },
    };
  }

  if (i.diasSemGeracao >= 3) {
    const d = i.diasSemGeracao;
    // O motivo vem do statusInversor quando o adapter informa; sem status,
    // texto antigo intacto (zero regressão). Tipo continua 'sistema_offline'
    // pra não quebrar dedupe/dispatcher/botões do zap.
    const texto =
      i.statusInversor === 'offline'
        ? `Sem comunicação há ${d} dias — o inversor não está enviando dados. Checar WiFi/internet da usina.`
        : i.statusInversor === 'falha'
          ? `Falha reportada pelo inversor há ${d} dias. Checar o equipamento.`
          : i.statusInversor === 'ok'
            ? `Parada há ${d} dias — comunicando, mas sem gerar. Checar disjuntor/strings.`
            : `Sem geração há ${d} dias. Verificar inversor / conexão WiFi.`;
    return {
      nivel: 'urgente',
      alerta: { tipo: 'sistema_offline', severidade: 'urgente', texto },
    };
  }

  const kWp = Number(i.potenciaKwp ?? 0);
  const esperado7 = esperadoDiaKwh(i.potenciaKwp, i.uf) * 7;
  const ratio = esperado7 > 0 ? i.realUltimos7 / esperado7 : 1;

  // QUEDA pela régua relativa quando há mediana da carteira; senão HSP.
  // O MILESTONE (mais abaixo) fica SEMPRE na régua absoluta — metade da
  // carteira está acima da mediana, seria parabéns em massa.
  const mediana = i.medianaCarteira7d ?? null;
  const usaRelativa = mediana != null && mediana > 0 && kWp > 0 && i.realUltimos7 > 0;
  const ratioQueda = usaRelativa ? (i.realUltimos7 / kWp) / mediana : ratio;

  const corte = i.corteAtencao ?? 0.70;
  if (kWp > 0 && ratioQueda < corte && i.realUltimos7 > 0) {
    const pct = Math.round((1 - ratioQueda) * 100);
    const texto = usaRelativa
      ? `Geração últimos 7 dias ${pct}% abaixo da média da carteira. Pode ser sujeira/sombreamento — agendar limpeza.`
      : `Geração últimos 7 dias ${pct}% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.`;
    return {
      nivel: 'aviso',
      alerta: { tipo: 'queda_geracao', severidade: 'aviso', texto },
    };
  }
  if (kWp > 0 && ratio > 1.10) {
    const pct = Math.round((ratio - 1) * 100);
    return {
      nivel: 'info',
      alerta: {
        tipo: 'milestone_economia', severidade: 'info',
        texto: `Geração últimos 7 dias ${pct}% ACIMA do esperado. Sistema operando excelente!`,
      },
    };
  }
  return { nivel: 'ok', alerta: null };
}
