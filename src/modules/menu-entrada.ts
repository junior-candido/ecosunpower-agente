// menu-entrada.ts
// A primeira pergunta, para a assistente parar de adivinhar.
//
// Junior 02/09/2026, sobre o número da Conquista: "esse número não é uma boa
// para a Clara, ela fica perdida" e "tinha que ser muito ninja para entender
// tudo isso".
//
// Ele descreveu um problema real. A política de triagem da Conquista lista SEIS
// tipos de pessoa chegando na mesma linha: lead da parceria, quem quer
// fotovoltaico, quem quer aquecimento, cliente antigo com defeito, cliente
// antigo querendo ampliar, e quem só quer a nota fiscal. Hoje a assistente lê a
// mensagem e DEDUZ qual é. Quando a pessoa escreve "oi", não há o que deduzir —
// ela chuta, e chuta na frente do cliente.
//
// A solução não é um prompt melhor. É perguntar: uma pergunta só, na primeira
// mensagem, e o cliente declara o assunto. Fotovoltaico e aquecimento, por
// exemplo, se qualificam por perguntas que não têm nada a ver uma com a outra
// (conta de luz num, quantos banheiros no outro) — separar isso na porta é o
// que mais melhora o atendimento.
//
// FORMATO: texto numerado, porque é o que a conexão não-oficial (Evolution)
// aceita. Botão de verdade só existe na API Oficial da Meta — ver o fallback em
// eva-admin-buttons.ts. Quando a empresa migrar, o mesmo menu vira lista
// clicável: muda quem DESENHA, não quem decide. Por isso as chaves aqui são
// estáveis.

/** Uma porta do menu. `chave` é o identificador estável; `rotulo` é o que o cliente lê. */
export interface OpcaoMenu {
  chave: string;
  rotulo: string;
}

/**
 * O que um cliente novo recebe sem configurar nada. Genérico de propósito:
 * nenhuma marca, nenhum nome de assistente. A empresa troca pelo dela.
 */
export const MENU_PADRAO: readonly OpcaoMenu[] = [
  { chave: 'fotovoltaico', rotulo: 'Energia solar — quero baixar minha conta de luz' },
  { chave: 'aquecimento',  rotulo: 'Aquecimento de água — banho ou piscina' },
  { chave: 'cliente',      rotulo: 'Já sou cliente — dúvida ou manutenção' },
  { chave: 'financeiro',   rotulo: 'Nota fiscal ou financeiro' },
];

/** Teto de opções: menu que não cabe numa tela deixa de ser menu. */
const MAX_OPCOES = 10;

/**
 * jsonb do banco → lista de opções. Descarta entrada sem chave ou sem rótulo:
 * o campo é editado por tela, e opção pela metade viraria um número que o
 * cliente digita e não leva a lugar nenhum.
 *
 * Qualquer coisa que não seja lista (null, texto, objeto) vira lista vazia —
 * empresa sem menu configurado segue com o comportamento de antes.
 */
export function normalizarMenuEntrada(valor: unknown): OpcaoMenu[] {
  if (!Array.isArray(valor)) return [];
  const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  return valor
    .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
    .map((o) => ({ chave: txt(o.chave).slice(0, 40), rotulo: txt(o.rotulo).slice(0, 120) }))
    .filter((o) => o.chave !== '' && o.rotulo !== '')
    .slice(0, MAX_OPCOES);
}

/** Minúsculas, sem acento, espaços colapsados. */
function normaliza(v: string): string {
  return (v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** O começo do rótulo, antes do travessão — é por ele que a pessoa costuma responder. */
function cabecaDoRotulo(rotulo: string): string {
  return normaliza(rotulo.split(/[—–-]/)[0] ?? rotulo);
}

/**
 * Monta o texto do menu. Devolve `null` quando não há opção nenhuma: menu vazio
 * seria uma pergunta sem resposta possível, então é melhor não perguntar.
 */
export function montarMenuEntrada(
  nomeAtendente: string,
  nomeFantasia: string,
  opcoes: readonly OpcaoMenu[],
): string | null {
  if (!opcoes || opcoes.length === 0) return null;

  const linhas: string[] = [];
  linhas.push(`Oi! Sou a ${nomeAtendente}, da ${nomeFantasia} 😊`);
  linhas.push('Pra te atender direito, me diz o que você precisa:');
  linhas.push('');
  opcoes.forEach((o, i) => linhas.push(`*${i + 1}* · ${o.rotulo}`));
  linhas.push('');
  linhas.push('É só responder com o número.');
  return linhas.join('\n');
}

/** Palavras que a pessoa põe em volta do número e não mudam a resposta. */
const ENFEITE = new Set(['opcao', 'opicao', 'a', 'o', 'numero', 'num', 'n', 'item', 'resposta', 'e']);

/**
 * Lê o que a pessoa respondeu. Aceita três formas:
 *   1. o número puro, com ou sem sujeira em volta ("2", "2)", "opção 2", "*2*")
 *   2. o assunto escrito ("energia solar", "nota fiscal")
 *   3. o assunto dito no meio de uma frase ("oi, quero energia solar na minha casa")
 *
 * Devolve `null` quando não dá pra ter certeza — inclusive quando a frase tem um
 * número solto que não é resposta de menu ("quero 2 orçamentos"). Na dúvida é
 * melhor seguir a conversa normal do que empurrar a pessoa pro caminho errado.
 */
export function lerEscolhaDoMenu(
  mensagem: string,
  opcoes: readonly OpcaoMenu[],
): OpcaoMenu | null {
  const texto = normaliza(mensagem);
  if (!texto || !opcoes || opcoes.length === 0) return null;

  // (1) número. Tira pontuação, joga fora as palavras de enfeite e vê se o que
  //     sobrou é UM número sozinho. Assim "opção 2" conta e "quero 2 orçamentos" não.
  const pedacos = texto
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(' ')
    .filter((p) => p && !ENFEITE.has(p));
  if (pedacos.length === 1 && /^\d{1,2}$/.test(pedacos[0])) {
    const i = Number(pedacos[0]) - 1;
    return i >= 0 && i < opcoes.length ? opcoes[i] : null;
  }

  // (2) e (3) assunto escrito. Só vale se UMA opção casar — duas casando é
  //     ambiguidade, e aí é melhor perguntar de novo do que escolher no chute.
  const casaram = opcoes.filter((o) => {
    const cabeca = cabecaDoRotulo(o.rotulo);
    const inteiro = normaliza(o.rotulo);
    if (!cabeca) return false;
    if (texto.includes(cabeca) || texto.includes(inteiro)) return true;      // "quero energia solar aqui"
    return texto.length >= 4 && cabeca.includes(texto);                      // "aquecimento"
  });
  return casaram.length === 1 ? casaram[0] : null;
}
