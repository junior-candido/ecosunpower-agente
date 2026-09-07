// src/modules/email/portugues.ts
//
// TRAVA DE PORTUGUÊS — impede que texto torto chegue no cliente.
//
// Por que existe (07/09/2026): o Junior abriu um preview e viu em dois
// segundos o que passou meses no ar. Os 6 modelos da jornada estavam escritos
// "Ola, {nome}! Que bom ter voce por aqui", sem acento nenhum, e com "â€—" no
// lugar do travessão. 744 e-mails saíram assim.
//
// E o pior nem era o texto: era a INCONSISTÊNCIA. O assunto tinha duas
// origens — a IA (que escreve com acento) e o texto de reserva do banco (que
// não tinha). 455 clientes receberam assunto certo e 289 receberam errado,
// dependendo de qual caminho rodou naquele minuto.
//
// Esta trava faz os dois caminhos obedecerem à mesma regra: se a IA devolver
// texto torto, ele é descartado e usamos a reserva. É o mesmo desenho do
// `aplicarTravaPreco` (price-lock.ts), que já protege contra a IA cravar
// preço. Aqui protege contra a IA escrever mal.

/**
 * Palavras que, escritas assim, só existem por falta de acento — e que são
 * comuns em texto de venda. É isso que as torna boas sentinelas.
 *
 * ⚠️ CUIDADO AO ACRESCENTAR. Muita palavra parecida é CORRETA sem acento e
 * entrar aqui gera alarme falso que bloqueia texto bom:
 *   - "meses" (plural de mês perde o acento), "mesmo", "mesa"
 *   - "obrigado", "para", "sobre", "energia", "economia", "sistema"
 *   - "esta" (este/esta) e "so" existem sem acento em construções válidas
 * O teste desta trava cobre esses casos justamente pra não regredirem.
 * A própria lista já derrubou uma versão minha que acusava "meses".
 */
export const PALAVRAS_SEM_ACENTO = [
  'ola', 'voce', 'voces', 'nao', 'sao', 'entao', 'tambem', 'ninguem', 'alguem',
  'porem', 'mes', 'ate', 'tres', 'duvida', 'duvidas', 'historia', 'historias',
  'propria', 'proprio', 'proprios', 'comeca', 'comecar', 'comecou',
  'servico', 'servicos', 'atencao', 'informacao', 'instalacao', 'solucao',
  'regiao', 'regioes', 'sera', 'estao', 'possivel', 'facil', 'dificil',
  'rapido', 'otimo', 'unico', 'ultimo', 'proximo', 'proximos', 'necessario',
  'publico', 'tecnico', 'tecnica', 'responsavel', 'imovel', 'nivel',
  'agua', 'apos', 'enrolacao', 'preocupacao', 'sensacao', 'pressao',
  'dependencia', 'previsivel', 'estavel', 'concessionaria', 'orcamento',
] as const;

const SENTINELAS = new Set<string>(PALAVRAS_SEM_ACENTO);

/** Tira o que não é prosa: tags HTML, marcadores {x} e URLs. */
function somenteProsa(texto: string): string {
  return String(texto ?? '')
    .replace(/<[^>]*>/g, ' ')          // tags inteiras (inclusive href com url)
    .replace(/\{[^}]*\}/g, ' ')        // {nome}, {cidade}, {link_descadastro}
    .replace(/https?:\/\/\S+/g, ' ');  // url solta no meio do texto
}

/**
 * Devolve a PRIMEIRA palavra que denuncia texto sem acento, ou null se estiver
 * tudo certo. Devolver a palavra (e não só true/false) faz a mensagem de erro
 * do teste dizer exatamente onde olhar.
 */
export function palavraSemAcento(texto: string): string | null {
  const prosa = somenteProsa(texto).toLowerCase();
  // \p{L} pra que "você" conte como uma palavra só e não case com "voce".
  const palavras = prosa.match(/[\p{L}]+/gu) ?? [];
  for (const p of palavras) if (SENTINELAS.has(p)) return p;
  return null;
}

/**
 * Marcas clássicas de UTF-8 lido como Latin-1 (mojibake). Foi o que colocou
 * "â€—" no lugar do travessão nos 6 modelos: o cliente via os três caracteres
 * literais dentro do e-mail.
 */
export function temLixoDeCodificacao(texto: string): boolean {
  return /â€|Ã[-¿]|ï¿½|�/.test(String(texto ?? ''));
}

/**
 * Deixa passar o texto candidato só se ele estiver em português decente.
 * Senão, devolve a reserva. Mesmo contrato do `aplicarTravaPreco`.
 */
export function aplicarTravaPortugues(candidato: string, reserva: string): string {
  const t = String(candidato ?? '').trim();
  if (!t) return reserva;
  if (temLixoDeCodificacao(t)) {
    console.warn('[portugues] texto descartado (lixo de codificacao):', t.slice(0, 80));
    return reserva;
  }
  const palavra = palavraSemAcento(t);
  if (palavra) {
    console.warn(`[portugues] texto descartado (sem acento: "${palavra}"):`, t.slice(0, 80));
    return reserva;
  }
  return t;
}
