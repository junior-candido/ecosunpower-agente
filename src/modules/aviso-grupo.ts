// src/modules/aviso-grupo.ts
// Controle do aviso que a assistente dá NO GRUPO quando um cliente/lead fala
// por lá — "vi sua mensagem, te chamei no particular".
//
// Junior 01/09/2026: "cliente, lead, tudo isso ela deve atender e bem" e "no
// grupo e no privado direto". Só que repetir a linha a cada mensagem viraria
// poluição no grupo da equipe. Então: avisa uma vez, atende no privado, e só
// volta a avisar se a pessoa sumir e reaparecer horas depois (aí é outra
// conversa e ela precisa saber de novo pra onde ir).
//
// Memória simples de propósito: perder isso num reinício custa, no pior caso,
// uma linha repetida no grupo. Não vale um ida-e-volta no Redis por mensagem.

/** Depois disso, é outra conversa e vale avisar de novo. */
const JANELA_MS = 12 * 60 * 60 * 1000;

/** Teto de segurança: grupo movimentado não pode crescer memória sem fim. */
const MAX_ENTRADAS = 5000;

let ultimoAviso = new Map<string, number>();

/** Só para testes. */
export function _resetAvisoGrupoParaTeste(): void {
  ultimoAviso = new Map();
}

/**
 * Deve avisar esta pessoa neste grupo agora? Marca o aviso quando responde
 * `true` — chamar duas vezes seguidas devolve `true` e depois `false`.
 */
export function deveAvisarNoGrupo(grupoId: string, telefone: string, agoraMs = Date.now()): boolean {
  const chave = `${grupoId}|${telefone}`;
  const anterior = ultimoAviso.get(chave);
  if (anterior !== undefined && agoraMs - anterior < JANELA_MS) return false;

  if (ultimoAviso.size >= MAX_ENTRADAS) {
    // limpa o que já venceu; se ainda estiver cheio, começa do zero (o custo é
    // uma linha repetida, não um vazamento de memória)
    for (const [k, t] of ultimoAviso) if (agoraMs - t >= JANELA_MS) ultimoAviso.delete(k);
    if (ultimoAviso.size >= MAX_ENTRADAS) ultimoAviso.clear();
  }
  ultimoAviso.set(chave, agoraMs);
  return true;
}
