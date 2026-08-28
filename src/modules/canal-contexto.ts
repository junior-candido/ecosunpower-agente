// src/modules/canal-contexto.ts
// Contexto do CANAL de saída da mensagem que está sendo processada.
//
// Problema: a Eva responde por `messaging = metaWaba ?? evolution`, sempre com
// UMA instância Evolution (EVOLUTION_INSTANCE). Um tenant conectado por QR
// numa instância própria (ex.: Conquista Solar → 'conquista-solar') precisa
// que a RESPOSTA saia pela instância dele — e não pelo número da EcoSun.
//
// Solução (mesmo mecanismo do `comEmpresaDe` em empresa-config.ts): o consumer
// da fila roda o processamento de cada job dentro de `comCanal({...})`; tudo
// que acontece lá dentro (awaits inclusos) enxerga `canalAtual()`. O cliente
// Evolution lê a instância do contexto; o wrapper de envio escolhe Evolution
// quando o contexto tem instância própria. Fora de contexto = comportamento
// de hoje, byte a byte.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface CanalContexto {
  companyId: string;
  // Instância Evolution própria do tenant. undefined = canal padrão (EcoSun).
  evolutionInstance?: string;
}

const als = new AsyncLocalStorage<CanalContexto>();

export function comCanal<T>(ctx: CanalContexto, fn: () => T): T {
  return als.run(ctx, fn);
}

export function canalAtual(): CanalContexto | undefined {
  return als.getStore();
}

// Instância Evolution a usar AGORA: a do tenant em contexto, ou a padrão.
export function instanciaEvolutionAtual(padrao: string): string {
  return als.getStore()?.evolutionInstance ?? padrao;
}

// true quando a mensagem em processamento pertence a um tenant com instância
// Evolution própria → o envio DEVE ir pela Evolution (nunca pela WABA da EcoSun).
export function canalExigeEvolution(): boolean {
  return Boolean(als.getStore()?.evolutionInstance);
}
