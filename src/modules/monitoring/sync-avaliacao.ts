// src/modules/monitoring/sync-avaliacao.ts
// PURO. Decide se uma busca de geração conta como SINCRONIZAÇÃO BEM-SUCEDIDA.
//
// Antes o sync marcava "sincronizado agora" sempre que o adapter devolvia ok —
// mesmo com 0 dias (GoodWe desde 23/09, quando o portal SEMS antigo parou) ou
// com parte da busca falhando (micro FoxESS que não respondeu). A tela dizia
// "tudo certo" enquanto a usina estava sem dado há dias.
//
// Regras (a primeira que bater vence):
//   1. adapter avisou falha parcial        → erro "<Marca>: <o que faltou>"
//   2. nenhum dia na janela, e a usina JÁ teve geração → erro "portal não devolveu geração desde DD/MM"
//   3. último dia devolvido é anterior a ontem (Brasília) → mesmo erro (dado parado há mais de 24 h)
//   4. usina nova sem dado nenhum ainda    → sucesso (nada a acusar — comportamento antigo)
// Erro = `ultimo_erro` preenchido e `ultima_sincronizacao` INTOCADA.

import type { GeracaoDiaria, MarcaInversor } from './types.js';
import { dataCurtaBr, somarDias } from './util/dia-brasilia.js';

const ROTULO: Record<string, string> = {
  solaredge: 'SolarEdge', sungrow: 'Sungrow', deye: 'Deye', hoymiles: 'Hoymiles',
  goodwe: 'GoodWe', huawei: 'Huawei', foxess: 'FoxESS', nep: 'NEP', abb: 'ABB',
  solis: 'Solis', saj: 'SAJ',
};

export function rotuloMarca(marca: MarcaInversor | string): string {
  return ROTULO[marca] ?? String(marca);
}

// Dica do que fazer. (GoodWe teve dica própria enquanto o SEMS antigo estava
// fora do ar — 23/09 a 29/09; o adapter já fala com o SEMS+, então vale a geral.)
function dicaPortalParado(_marca: string): string {
  return 'pode ser o inversor sem internet ou a integração com o portal';
}

export interface AvaliacaoSyncInput {
  marca: MarcaInversor | string;
  geracoes: GeracaoDiaria[];
  falhaParcial?: string;
  /** Última data com geração > 0 já gravada no banco (antes deste sync). */
  ultimaDataComGeracao: string | null;
  /** Hoje em Brasília (YYYY-MM-DD). */
  hoje: string;
}

export type AvaliacaoSync = { ok: true } | { ok: false; erro: string };

export function avaliarSync(i: AvaliacaoSyncInput): AvaliacaoSync {
  const marca = rotuloMarca(i.marca);
  if (i.falhaParcial) return { ok: false, erro: `${marca}: ${i.falhaParcial}` };

  const ultimoDevolvido = i.geracoes.reduce<string | null>((m, g) => (m == null || g.data > m ? g.data : m), null);
  const ontem = somarDias(i.hoje, -1);

  if (ultimoDevolvido == null) {
    if (!i.ultimaDataComGeracao) return { ok: true };
    return { ok: false, erro: msgParado(marca, String(i.marca), i.ultimaDataComGeracao) };
  }
  if (ultimoDevolvido < ontem) {
    return { ok: false, erro: msgParado(marca, String(i.marca), ultimoDevolvido) };
  }
  return { ok: true };
}

function msgParado(rotulo: string, marca: string, desde: string): string {
  return `${rotulo}: o portal não devolveu geração desde ${dataCurtaBr(desde)} — ${dicaPortalParado(marca)}`;
}
