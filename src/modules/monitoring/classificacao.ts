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

export function esperadoDiaKwh(potenciaKwp: number | null, uf: string | null): number {
  const hsp = uf === 'GO' ? 5.3 : 5.2;
  return Number(potenciaKwp ?? 0) * hsp * 0.80;
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
    return {
      nivel: 'urgente',
      alerta: {
        tipo: 'sistema_offline', severidade: 'urgente',
        texto: `Sem geração há ${i.diasSemGeracao} dias. Verificar inversor / conexão WiFi.`,
      },
    };
  }

  const kWp = Number(i.potenciaKwp ?? 0);
  const esperado7 = esperadoDiaKwh(i.potenciaKwp, i.uf) * 7;
  const ratio = esperado7 > 0 ? i.realUltimos7 / esperado7 : 1;

  if (kWp > 0 && ratio < 0.70 && i.realUltimos7 > 0) {
    const pct = Math.round((1 - ratio) * 100);
    return {
      nivel: 'aviso',
      alerta: {
        tipo: 'queda_geracao', severidade: 'aviso',
        texto: `Geração últimos 7 dias ${pct}% ABAIXO do esperado. Pode ser sujeira/sombreamento — agendar limpeza.`,
      },
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
