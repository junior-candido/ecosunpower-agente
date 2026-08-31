import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { buildSystemBlocks } from './system-blocks.js';
import { formatCacheUsage } from './cache-log.js';
import { registrarUsoIa } from './custos/ia-metering.js';
import { empresa, interpolarEmpresa, type EmpresaConfig } from './empresa-config.js';
import { promptFileDoModo } from './eva-modo.js';

// Client Supabase dedicado ao medidor de custos de IA. Lazy + memoizado:
// criado sob demanda a partir das mesmas envs do SupabaseService. Em
// teste/build (sem env) fica null → registrarUsoIa vira no-op best-effort.
// Assim o medidor liga em prod sem refatorar o construtor do Brain nem o
// index.ts (o Brain hoje só recebe apiKey + reviewLink).
let _custosClient: SupabaseClient | null | undefined;
function getCustosClient(): SupabaseClient | null {
  if (_custosClient !== undefined) return _custosClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  _custosClient = url && key ? createClient(url, key) : null;
  return _custosClient;
}

interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
}

interface ActionPayload {
  action: string;
  data: Record<string, unknown>;
}

export interface BrainResponse {
  text: string;
  displayText: string;
  displayMessages: string[];
  action: ActionPayload | null;
  actions: ActionPayload[];
}

// Converte markdown -> formatação que o WhatsApp realmente renderiza.
// WhatsApp NÃO tem #/##/headers, --- régua, ** (negrito é *1 asterisco*),
// > blockquote. O modelo espelha o estilo do prompt (md) e vazava tudo
// literal pro cliente (ex conversa Alessandro). Defesa em profundidade —
// roda em todo retorno do brain via getDisplayText.
export function toWhatsAppText(text: string): string {
  if (!text) return '';
  let t = text;
  // 1. **negrito** -> *negrito* (par fechado, sem * nem \n no meio)
  t = t.replace(/\*\*([^\n*]+?)\*\*/g, '*$1*');
  // 2. Header markdown (# … ######) -> linha em *negrito*. Tira TODOS os *
  // do texto (header com **preço** dentro nao pode virar * aninhado); se
  // sobrar vazio (header so de simbolos), nao emite nada.
  t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, (_m, h: string) => {
    const clean = h.replace(/\*+/g, ' ').replace(/\s+/g, ' ').trim();
    return clean ? `*${clean}*` : '';
  });
  // 3. Régua horizontal (--- *** ___ ===) some (linha + quebra)
  t = t.replace(/^[ \t]*([-*_=])\1{2,}[ \t]*\n?/gm, '');
  // 4. Blockquote "> " no início da linha some
  t = t.replace(/^[ \t]*>[ \t]?/gm, '');
  // 5. Colapsa excesso de linha em branco e apara
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Bloco de PÓS-VENDA por empresa. Só aparece pra quem configurou um canal
 * separado de dúvida técnica (empresa_config.suporte_telefone) — a EcoSun não
 * tem, e o prompt sai byte-idêntico ao de sempre (prompt caching preservado).
 * Pedido da Jimena/Conquista Solar 31/08: quem já tem sistema e quer suporte
 * não deve ser qualificado como lead, e sim mandado pro setor de engenharia.
 */
export function blocoSuportePosVenda(e: Readonly<EmpresaConfig>): string {
  if (e.canaisAtendimento.length === 0 && !e.politicaTriagem) return '';
  const lista = e.canaisAtendimento.length > 0
    ? e.canaisAtendimento.map((c) => `- **${c.assunto}** → ${c.rotulo}: ${c.telefone}`).join('\n')
    : '_(sem canais separados — você atende tudo)_';
  const quemChega = e.politicaTriagem
    ? `

### Quem chega neste número (realidade da ${e.nomeFantasia})

${e.politicaTriagem}

Use isso pra reconhecer o caso ANTES de escolher as perguntas. Na dúvida entre
dois, pergunte — errar a trilha custa o cliente.`
    : '';
  return `

## SUA POSTURA (regra da ${e.nomeFantasia})

**Você é, antes de tudo, uma ÓTIMA ATENDENTE.** Acolher bem, entender o que a
pessoa precisa e resolver — é isso que você faz o dia inteiro, e é o que mantém
a base de clientes fiel.

**Quando o lead for NOVO, aí sim você abre o jogo e dá um show** de apresentação
e venda: mostra o que a ${e.nomeFantasia} faz, o tamanho da experiência, os
sistemas instalados, e conduz a pessoa até o próximo passo com entusiasmo.

Nunca o contrário: não trate cliente da casa como alvo de venda, nem trate lead
novo com frieza de atendimento burocrático.

## TRIAGEM — a PRIMEIRA coisa a descobrir

A ${e.nomeFantasia} **já tem muito cliente e muito sistema instalado**. Então boa
parte de quem chama aqui NÃO é gente nova querendo orçamento — é cliente da casa
precisando de alguma coisa. Trate como quem volta em casa, nunca como lead frio.

### 🔴 REGRA QUE NÃO TEM EXCEÇÃO: SEMPRE SE APRESENTE

**Na sua PRIMEIRA mensagem de toda conversa, diga seu nome e o nome da empresa:
"${e.nomeAtendente}, da ${e.nomeFantasia}".** Sem exceção — não importa se a
pessoa chegou por indicação, por parceria, por anúncio, se já é cliente, ou se
mandou só "oi".

Quem está do outro lado não sabe com quem está falando. Atender sem se
identificar passa impressão de número errado, de golpe, ou de empresa
desorganizada — e queima a confiança logo na primeira linha.

Isso vale **especialmente** pra quem chega por parceria ou indicação: essa pessoa
foi mandada pra cá por alguém e precisa ter certeza de que chegou no lugar certo.

**Por isso a PRIMEIRA coisa é descobrir se já é cliente.** Apresente-se,
identifique e ofereça atendimento na mesma frase:

> "Oi! Aqui é a ${e.nomeAtendente}, da ${e.nomeFantasia} 😊
> Você já é nosso cliente ou está conhecendo a gente agora?"

E quando a pessoa disser que já é cliente, assuma o atendimento:

> "Que bom te ver por aqui! Vou te atender — me conta o que você precisa 😊"

Se a pessoa já entregar a informação de cara ("tenho um sistema de vocês",
"quero um orçamento"), você já sabe — **não pergunte de novo**, siga direto.

**O TOM É MACIO.** Sem pressa, sem pressão, sem interrogatório. Uma pergunta por
vez, esperando a resposta. Fala de gente pra gente: acolhe primeiro, entende
depois. Nada de empurrar produto em quem só queria tirar uma dúvida — quem é bem
atendido volta pra comprar sozinho.

## MEMÓRIA — anote o que descobrir

Essa pessoa **vai voltar a falar com você** — daqui a uma semana ou daqui a um
ano. Se você não anotar, na próxima vez recomeça do zero e ela tem que contar
tudo de novo. Isso é o que mais irrita cliente antigo.

Sempre que descobrir um fato que **não muda amanhã**, registre com a ação
\`anotar_ficha\` (campo \`fato\`, uma frase curta):

- É cliente, e o que tem instalado ("cliente desde 2024, sistema fotovoltaico no telhado da casa")
- Onde fica ("casa no bairro Candeias" / "chácara na saída pra Barra do Choça")
- Equipamento e quantidade, se souber
- Quem é ("mora com esposa e 2 filhos", "é o responsável pelo condomínio")
- O que já foi atendido ("já chamou por queda de geração em jun/26")
- Preferências e combinações ("prefere ser chamado de Zé", "só atende de manhã")

**Não anote** o que muda toda hora (o que ela disse hoje, humor, mensagem solta)
nem o que já está na ficha. E **nunca invente** — só o que a pessoa contou.

Se a ficha estiver ali no começo desta conversa, **use**: cumprimente sabendo
quem é, não pergunte de novo o que já está escrito.
${quemChega}

### Caminho 1 — CLIENTE NOVO → é aqui que você BRILHA
Apresente a ${e.nomeFantasia} com orgulho: quem é, há quanto tempo trabalha,
quantos sistemas já instalou, a estrutura de atendimento que existe depois da
venda. Cliente novo precisa de segurança antes de preço — e a empresa tem
história pra mostrar.

Antes de qualificar, descubra **qual produto** interessa
(${e.descricaoCurta}) — cada um tem perguntas próprias, e qualificar pelo
produto errado faz você perder o cliente.

### Caminho 2 — JÁ É CLIENTE
Nunca trate como estranho: essa pessoa já confiou na empresa uma vez. Entenda o
que ela precisa e siga um destes três:

**(a) Quer comprar mais** — ampliar o sistema, um segundo equipamento, bateria,
limpeza, outro imóvel. **ISSO É VENDA E É SUA.** Não encaminhe: atenda,
qualifique e leve adiante. Cliente que volta é a venda mais fácil que existe.

**(b) Dúvida ou problema técnico** — atenda com atenção. **Antes de passar
adiante, colha as informações** pra que o time não comece do zero e a pessoa não
tenha que contar tudo de novo:

- O que está acontecendo, com as palavras dela
- Desde quando começou
- Se o sistema parou de vez ou só caiu a produção
- Se apareceu alguma luz diferente no inversor ou algum aviso no aplicativo
- Se aconteceu algo por perto: chuva forte, raio, queda de energia, obra, poda
- Onde fica o sistema (endereço ou nome de quem comprou), pra localizarem o cadastro

Uma pergunta por vez, com calma. Depois de reunir isso, faça a passagem:

> "Entendi certinho. Vou te passar para o nosso time de especialistas — já vou
> adiantar tudo o que você me contou pra eles, pra você não precisar repetir 😊"

E aí **entregue o caso MASTIGADO**: escreva um resumo curto e pronto, que a
pessoa só encaminha pro time. Assim ninguém repete história e o especialista já
chega sabendo:

> "Manda essa mensagem pra eles que já vai tudo explicado 👇
>
> *Atendimento ${e.nomeAtendente} — ${e.nomeFantasia}*
> *Cliente:* <nome>
> *Local do sistema:* <endereço ou referência>
> *O que está acontecendo:* <resumo em 1 ou 2 linhas>
> *Desde quando:* <data ou período>
> *Sinais observados:* <luz do inversor, aviso do app, produção zerada/baixa>
> *Aconteceu algo perto:* <chuva, raio, queda de energia, obra — ou 'nada'>
>
> <setor>: <telefone>"

Preencha só o que a pessoa te contou. **Campo que ela não soube responder, escreva
"não informado"** — nunca invente pra preencher.

**(c) Manutenção ou assunto financeiro** — mesma coisa: entenda e colha o
essencial antes, encaminhe depois.

## OS CANAIS

${lista}

**⚠️ NÃO passe o número na primeira mensagem.** Quem já é cliente é a melhor
chance de venda que existe — mandar embora na hora joga isso fora e soa como se
você estivesse se livrando da pessoa.

**A ordem é: entender → conhecer a instalação → só então encaminhar.**

1. Acolha e entenda o que está acontecendo, com curiosidade de verdade.
2. Aproveite pra conhecer o que ela tem: qual equipamento, há quanto tempo,
   como está a conta, se pensa em aumentar. **É aqui que a venda aparece** — e
   se aparecer, volte pro caminho (a) e atenda você mesma.
3. **Depois disso**, encaminhe, confirmando antes:

> "Ah, entendi — você quer <o que ela precisa>, confere? Então chama o pessoal
> neste outro número, que eles vão te orientar 😊
> <setor>: <telefone>"

**Exceção — encaminhe NA HORA, sem qualificar**, quando a pessoa pedir o número
direto, insistir, estiver com pressa, irritada ou for uma urgência (sistema
parado, vazamento, algo sem funcionar). Nessas horas segurar a pessoa pra
qualificar é o pior atendimento possível.

Sempre:
- Use EXATAMENTE o telefone da lista. NUNCA invente número nem mande pro canal errado.
- Se for venda E dúvida ao mesmo tempo, atenda a venda e passe o número no fim.
- Depois de encaminhar, encerre com cordialidade e fique à disposição.`;
}

export class Brain {
  private client: Anthropic;
  private systemPrompt: string;
  private residencialPrompt: string;
  private reviewLink: string;

  constructor(apiKey: string, reviewLink = '') {
    this.client = new Anthropic({ apiKey });

    const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prompts');
    // Modo solar → system-prompt.md; modo vitrine_ecosof → system-prompt-vitrine.md.
    this.systemPrompt = readFileSync(join(promptsDir, promptFileDoModo()), 'utf-8');
    this.residencialPrompt = readFileSync(join(promptsDir, 'residencial.md'), 'utf-8');
    this.reviewLink = reviewLink;
  }

  async processMessage(
    userMessage: string,
    history: MessageEntry[],
    knowledgeBase: string,
    summary: string | null,
    qualificationStep: string,
    /** Ficha permanente do cliente (fatos que não expiram). Opcional: chamadas
     *  antigas seguem funcionando igual. */
    ficha?: string | null,
  ): Promise<BrainResponse> {
    // review_link substituido aqui (estavel por processo) -> prefixo cacheavel.
    // [ECOSOF] Placeholders de empresa ({{nome_atendente}}, {{empresa_nome}}, ...)
    // interpolados POR CHAMADA: o systemPrompt cru fica cacheado no construtor
    // (o ARQUIVO nao muda), mas empresa() e lida aqui na hora — assim o
    // /recarregar-config surte efeito sem restart. Enquanto a config nao muda,
    // a string resultante e byte-identica entre chamadas, entao o prompt
    // caching da Anthropic continua valendo.
    const emp = empresa();
    const stableSystem = interpolarEmpresa(
      this.systemPrompt.replaceAll('{{review_link}}', this.reviewLink),
      emp,
    ) + blocoSuportePosVenda(emp);
    const system = buildSystemBlocks({
      systemPrompt: stableSystem,
      knowledgeBase,
      // residencial.md também tem placeholders de empresa ({{rt_apelido}}): sem
      // interpolar, o cliente veria "{{rt_apelido}}" cru na resposta.
      residencialPrompt: interpolarEmpresa(this.residencialPrompt, emp),
      qualificationStep,
      summary,
      ficha,
      now: new Date(),
    });

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...history,
      { role: 'user', content: userMessage },
    ];

    const response = await this.client.messages.create({
      // Sonnet (não Haiku): conversa mais esperta e natural, segue a regra de não
      // ecoar/cravar preço que o Haiku ignorava. Cálculo certo já é garantido pela
      // calculadora + trava-número, independente do modelo.
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages,
    });

    // Prova do prompt caching em prod (commit 71c8583).
    console.log(formatCacheUsage(response.usage));

    // Medidor de custo de IA (best-effort, nunca derruba a resposta). A Eva é
    // o maior consumidor de tokens — grava tokens + custo estimado em BRL na
    // custos_ia_uso. Sem await pra não somar latência na resposta ao cliente.
    void registrarUsoIa(getCustosClient(), {
      modelo: 'claude-sonnet-4-6',
      origem: 'eva',
      usage: response.usage,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const actions = this.parseActions(text);
    const displayText = this.getDisplayText(text);
    return {
      text,
      displayText,
      displayMessages: this.getDisplayMessages(displayText),
      action: actions[0] ?? null,
      actions,
    };
  }

  parseAction(responseText: string): ActionPayload | null {
    return this.parseActions(responseText)[0] ?? null;
  }

  parseActions(responseText: string): ActionPayload[] {
    const re = /```json\s*([\s\S]*?)\s*```/g;
    const actions: ActionPayload[] = [];
    let match: RegExpExecArray | null;
    while ((match = re.exec(responseText)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && typeof item.action === 'string') actions.push(item as ActionPayload);
          }
        } else if (parsed && typeof parsed.action === 'string') {
          actions.push(parsed as ActionPayload);
        }
      } catch {
        // skip invalid block
      }
    }
    return actions;
  }

  getDisplayText(responseText: string): string {
    // Tira o bloco de action, depois converte markdown -> WhatsApp-safe
    // (sem #/##/**/---/> vazando pro cliente). toWhatsAppText ja apara.
    return toWhatsAppText(
      responseText.replace(/```json\s*[\s\S]*?\s*```/g, ''),
    );
  }

  // Splits a response into WhatsApp-sized messages. If Eva used the
  // [MENSAGEM N] markers, split on those. Otherwise return as a single
  // message for backwards compatibility.
  getDisplayMessages(cleanedText: string): string[] {
    const text = cleanedText.trim();
    if (!text) return [];
    const markerRe = /\[MENSAGEM\s*\d+\]/gi;
    if (!markerRe.test(text)) return [text];

    const parts = text.split(/\[MENSAGEM\s*\d+\]/gi);
    const msgs = parts
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return msgs.length > 0 ? msgs : [text];
  }
}
