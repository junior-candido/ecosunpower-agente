// src/modules/agenda/interpretar.ts
// Interpretador de frases de compromisso da Eva Agenda (Fatia A1 + A1.1).
// Mesmo padrão de extrator-lancamento.ts / rh/triagem.ts: a IA (injetada,
// interface ExtratorIA) só EXTRAI os trechos crus da frase (titulo/detalhes/
// dataTexto/horaTexto/ambito) num bloco ```json```; a resolução de datas
// e horários é 100% determinística e PURA aqui embaixo — nunca a IA calcula
// "próxima quinta" ou "dia 15" sozinha, porque isso é matemática, não texto.
// A injeção de dependência (ExtratorIA) garante que os testes nunca batem
// na rede: o mock devolve JSON canned, igual ao house pattern do financeiro.
//
// A1.1 (feedback real do Junior ao vivo): frases coloquiais/áudio transcrito
// ("marca aí uma visita segunda que vem lá pelas nove") não podiam ficar
// reféns só do texto que a IA extraiu — por isso: (1) o prompt ganhou muito
// mais instrução + exemplos; (2) a camada determinística (resolverHora/
// resolverData) ficou bem mais tolerante a variações; (3) quando MESMO ASSIM
// a extração fica ambígua, há uma SEGUNDA chamada à IA pedindo a resolução
// EXPLÍCITA (dataISO/hora) dado "agora" — só então, se as duas tentativas
// falharem, a confiança vira 'baixa' de verdade.

export interface Interpretacao {
  titulo: string;            // "Visita Cyntia" — curto, sem a data dentro
  detalhes?: string;         // tudo que a frase disse além de título/data/hora (tarefas, materiais, valores...)
  inicioISO: string;         // instante ISO com offset -03:00
  fimISO: string;            // default início + 1h
  diaInteiro: boolean;       // "o dia todo" → true (início 00:00, fim 23:59 do dia)
  ambito: 'empresa' | 'pessoal' | null; // null quando a frase não deixa claro
  confianca: 'alta' | 'baixa';          // baixa = falta data OU hora clara (mesmo após a 2ª chance)
  entendido?: string;        // resumo curto do que foi entendido (pra Eva dizer na pergunta de confirmação)
}

// Interface estreita injetada — o único ponto de contato com IA de verdade.
// Devolve o TEXTO CRU da resposta do modelo (mesmo formato dos outros
// extratores da casa: bloco ```json```), pra manter parse e IO separados.
export interface ExtratorIA {
  extrairAgenda(prompt: string): Promise<string>;
}

// Extração crua devolvida pela IA — só trechos de texto, sem cálculo de datas.
export interface ExtracaoAgenda {
  compromisso: boolean;
  titulo: string | null;
  detalhes: string | null;      // tarefas/materiais/pessoas/valores/contexto além do básico
  dataTexto: string | null;     // trecho que fala do dia ("amanhã", "quinta", "dia 15")
  horaTexto: string | null;     // trecho que fala da hora ("9h", "de tarde", "das 9 às 12")
  duracaoTexto: string | null;  // trecho que fala de duração ("duas horas", "1h30")
  diaInteiro: boolean;          // "o dia todo" / "dia inteiro"
  ambito: 'empresa' | 'pessoal' | null;
}

// Extração da 2ª chance: mesmos campos de ExtracaoAgenda + a resolução
// EXPLÍCITA que a IA acha mais provável, dado "agora" (validada depois de
// forma 100% determinística — nunca confiamos cegamente na conta da IA).
export interface ExtracaoSegundaChance {
  extracao: ExtracaoAgenda;
  resolucaoDataISO: string | null; // "YYYY-MM-DD" ou null
  resolucaoHora: string | null;    // "HH:MM" (24h) ou null
}

// ---------------------------------------------------------------------------
// PROMPT + PARSE (puros, testáveis)
// ---------------------------------------------------------------------------

export function montarPromptInterpretarAgenda(frase: string): string {
  return `Você é a secretária particular do DONO de uma empresa de energia solar (Brasília-DF). Ele te manda pelo WhatsApp — muitas vezes por ÁUDIO TRANSCRITO: frases soltas, coloquiais, com "aí", "lá pelas", "tipo", "sabe", vícios de fala e sem pontuação nenhuma. Sua missão é ENTENDER o pedido de compromisso mesmo quando a frase não é "de manual".

Frase recebida (pode ser transcrição de áudio, com erros de pontuação): "${frase}"

Devolva APENAS um bloco \`\`\`json\`\`\` com este formato:
{"compromisso": true/false,
 "titulo": "título curto do compromisso, SEM a data/hora dentro (ex.: \\"Visita Cyntia\\", \\"Dentista\\")" ou null,
 "detalhes": "o que mais a frase disser além do título/data/hora — tarefas, materiais, pessoas, valores, contexto (ex.: \\"Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela\\")" ou null quando não há nada além do básico,
 "dataTexto": o TRECHO da frase que fala do DIA, copiado como a pessoa falou (não precisa "arrumar") — ex.: "segunda que vem", "amanhã", "dia 15", "depois de amanhã", "daqui a 3 dias", "semana que vem", "hoje à noite" — ou null se a frase não disser,
 "horaTexto": o TRECHO que fala da HORA. Quando a pessoa falar por extenso ou de forma indireta, NORMALIZE pro formato "Hh" ou "Hh30" sempre que der (ex.: "lá pelas nove" → "9h", "duas da tarde" → "14h", "meio-dia" → "12h", "umas 9 e meia" → "9h30"); se só der pra saber um período aproximado, copie o trecho mesmo assim (ex.: "de manhãzinha", "no fim da tarde", "à noite") — ou null se a frase não disser nada de hora,
 "duracaoTexto": o TRECHO que fala de QUANTO TEMPO dura (ex.: "duas horas", "1h30") ou null,
 "diaInteiro": true SÓ quando a pessoa disser "o dia todo"/"dia inteiro", senão false,
 "ambito": "empresa" (obra, cliente, lead, fornecedor, reunião de trabalho) ou "pessoal" (médico, família, casa) ou null quando não der pra saber}

REGRAS:
- NÃO calcule datas nem horários finais — normalize a HORA quando o número por extenso/período for óbvio, mas o CÁLCULO de "próxima quinta"/"dia 15"/"daqui a 3 dias" etc. é feito depois por outro código, determinístico; você só copia o TRECHO do dia.
- NUNCA invente uma data ou hora que a frase não sugeriu, nem de leve — sem pista nenhuma, devolva null. Chutar é pior do que perguntar de novo.
- Frases de ÁUDIO TRANSCRITO têm "aí", "lá pelas", "tipo", "sabe", "né", "pra mim" — ignore esses vícios de fala, eles não fazem parte do dataTexto/horaTexto.
- Não é um pedido pra marcar/agendar algo (é pergunta, consulta, assunto qualquer que não seja compromisso) → "compromisso": false e os outros campos null/false.

EXEMPLOS (frase coloquial ou de áudio transcrito → extração esperada):
1. "marca aí pra mim uma visita segunda que vem lá pelas nove" → {"compromisso": true, "titulo": "Visita", "detalhes": null, "dataTexto": "segunda que vem", "horaTexto": "9h", "duracaoTexto": null, "diaInteiro": false, "ambito": null}
2. "marca aí uma visita na dona Maria segunda que vem lá pelas nove" → {"compromisso": true, "titulo": "Visita dona Maria", "detalhes": null, "dataTexto": "segunda que vem", "horaTexto": "9h", "duracaoTexto": null, "diaInteiro": false, "ambito": null}
3. "dentista amanhã de manhãzinha" → {"compromisso": true, "titulo": "Dentista", "detalhes": null, "dataTexto": "amanhã", "horaTexto": "de manhãzinha", "duracaoTexto": null, "diaInteiro": false, "ambito": "pessoal"}
4. "tenho médico dia quinze umas duas da tarde" → {"compromisso": true, "titulo": "Médico", "detalhes": null, "dataTexto": "dia 15", "horaTexto": "14h", "duracaoTexto": null, "diaInteiro": false, "ambito": "pessoal"}
5. "reunião com o pessoal do condomínio quarta no fim da tarde" → {"compromisso": true, "titulo": "Reunião condomínio", "detalhes": null, "dataTexto": "quarta", "horaTexto": "17h", "duracaoTexto": null, "diaInteiro": false, "ambito": "empresa"}
6. "me lembra do culto domingo à noite" → {"compromisso": true, "titulo": "Culto", "detalhes": null, "dataTexto": "domingo", "horaTexto": "à noite", "duracaoTexto": null, "diaInteiro": false, "ambito": "pessoal"}
7. "instalação do fulano sábado o dia inteiro" → {"compromisso": true, "titulo": "Instalação fulano", "detalhes": null, "dataTexto": "sábado", "horaTexto": null, "duracaoTexto": null, "diaInteiro": true, "ambito": "empresa"}
8. "visita no João amanhã 9h — levar a escada, trocar o disjuntor da piscina e cobrar a segunda parcela" → {"compromisso": true, "titulo": "Visita João", "detalhes": "Levar a escada; trocar o disjuntor da piscina; cobrar a segunda parcela", "dataTexto": "amanhã", "horaTexto": "9h", "duracaoTexto": null, "diaInteiro": false, "ambito": "empresa"}
9. "preciso ir no banco daqui a 3 dias de manhã" → {"compromisso": true, "titulo": "Ir no banco", "detalhes": null, "dataTexto": "daqui a 3 dias", "horaTexto": "de manhã", "duracaoTexto": null, "diaInteiro": false, "ambito": "pessoal"}
10. "vou almoçar com o Renato depois do almoço, tipo, sei lá, hoje mesmo" → {"compromisso": true, "titulo": "Almoço com Renato", "detalhes": null, "dataTexto": "hoje", "horaTexto": null, "duracaoTexto": null, "diaInteiro": false, "ambito": null}`;
}

// Lê o JSON cru da IA. Tolerante a bloco \`\`\`json\`\`\` ou objeto solto;
// qualquer falha de parse ou compromisso:false → null (nunca explode).
export function parseExtracaoAgenda(raw: string): ExtracaoAgenda | null {
  const obj = extrairObjetoJSON(raw);
  if (!obj) return null;
  if (obj.compromisso !== true) return null;

  const strOuNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

  return {
    compromisso: true,
    titulo: strOuNull(obj.titulo),
    detalhes: strOuNull(obj.detalhes),
    dataTexto: strOuNull(obj.dataTexto),
    horaTexto: strOuNull(obj.horaTexto),
    duracaoTexto: strOuNull(obj.duracaoTexto),
    diaInteiro: obj.diaInteiro === true,
    ambito: obj.ambito === 'empresa' || obj.ambito === 'pessoal' ? obj.ambito : null,
  };
}

// Lê a resposta da 2ª chance: a mesma extração de sempre + a resolução
// explícita opcional (resolucaoDataISO/resolucaoHora). null quando o JSON
// não é sequer uma extração de compromisso válida (mesma regra de sempre).
export function parseExtracaoSegundaChance(raw: string): ExtracaoSegundaChance | null {
  const extracao = parseExtracaoAgenda(raw);
  if (!extracao) return null;
  const obj = extrairObjetoJSON(raw) ?? {};
  const strOuNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    extracao,
    resolucaoDataISO: strOuNull(obj.resolucaoDataISO),
    resolucaoHora: strOuNull(obj.resolucaoHora),
  };
}

// Tag "json" é opcional — a IA às vezes devolve ``` puro sem a linguagem.
function extrairObjetoJSON(raw: string): Record<string, unknown> | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const corpo = fence ? fence[1] : raw;
  let obj: unknown;
  try {
    obj = JSON.parse(corpo);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return obj as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// FUSO / DATAS (puro — America/Sao_Paulo, sem depender do TZ do servidor)
// ---------------------------------------------------------------------------

interface PartsBRT {
  year: number; month: number; day: number; // wall clock em São Paulo
  hour: number; minute: number;
  weekday: number; // 0=domingo ... 6=sábado
}

// Lê um instante ISO qualquer e devolve os campos de calendário/relógio dele
// em America/Sao_Paulo, via Intl (timezone-safe, não depende do TZ do host).
function partsEmSaoPaulo(iso: string): PartsBRT {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d);
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(o.year, 10),
    month: parseInt(o.month, 10),
    day: parseInt(o.day, 10),
    // alguns ICU devolvem "24" pra meia-noite com hour12:false — normaliza.
    hour: parseInt(o.hour, 10) % 24,
    minute: parseInt(o.minute, 10),
    weekday: weekdayMap[o.weekday] ?? 0,
  };
}

// Remove acentos e "-feira" pra comparar nomes de dia/palavras sem depender
// de como a IA (ou o Junior) escreveu ("terça"/"terca", "quinta-feira"/
// "quinta", "manhãzinha"/"manhazinha").
function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-feira/g, '')
    .toLowerCase()
    .trim();
}

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};

// Quantos dias tem o mês `month0` (0-based) de `year`. Dia 0 do mês seguinte
// é sempre o último dia do mês atual — truque padrão com Date.UTC.
function diasNoMes(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

export interface ResultadoData { dateISO: string; confiavel: boolean }
export interface HoraParcial { hour: number; minute: number }

// Resolve um trecho de data em PT-BR pra uma data absoluta (YYYY-MM-DD), a
// partir de "agora" em America/Sao_Paulo. Datas relativas NUNCA caem no
// passado. `horaResolvida` (opcional) só é usada pro caso "hoje é o mesmo dia
// da semana citado" — decide se ainda cabe hoje ou se pula pra semana que vem.
export function resolverData(
  dataTexto: string | null,
  agoraISO: string,
  horaResolvida?: HoraParcial | null,
): ResultadoData {
  const agora = partsEmSaoPaulo(agoraISO);
  const hojeUTC = Date.UTC(agora.year, agora.month - 1, agora.day);
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  const norm = normalizarTexto(dataTexto ?? '');
  if (!norm) return { dateISO: fmt(hojeUTC), confiavel: false };

  if (/\bhoje\b/.test(norm)) return { dateISO: fmt(hojeUTC), confiavel: true };
  if (/depois de amanha/.test(norm)) return { dateISO: fmt(hojeUTC + 2 * 86_400_000), confiavel: true };
  if (/\bamanha\b/.test(norm)) return { dateISO: fmt(hojeUTC + 86_400_000), confiavel: true };
  // "depois do almoço" como pista de DIA (não de hora) = ainda hoje.
  if (/depois do almoco/.test(norm)) return { dateISO: fmt(hojeUTC), confiavel: true };

  // "daqui a 3 dias" — soma direta a partir de hoje.
  const daquiA = norm.match(/daqui\s+a\s+(\d{1,3})\s+dias?/);
  if (daquiA) return { dateISO: fmt(hojeUTC + parseInt(daquiA[1], 10) * 86_400_000), confiavel: true };

  // "semana que vem" (SEM dia da semana específico) = hoje + 7 dias corridos.
  // Quando há um dia da semana junto ("quinta que vem"), quem resolve é o
  // laço de DIAS_SEMANA logo abaixo (ele já entende "que vem").
  if (/semana que vem/.test(norm)) return { dateISO: fmt(hojeUTC + 7 * 86_400_000), confiavel: true };

  const diaMes = norm.match(/\bdia\s+(\d{1,2})\b/);
  if (diaMes) {
    const dia = parseInt(diaMes[1], 10);
    // Guarda: "dia 45" etc. não é um dia de mês válido — cai no fallback não
    // reconhecido lá embaixo em vez de entrar no cálculo (evita loop infinito
    // no ajuste de mês curto mais abaixo).
    if (dia >= 1 && dia <= 31) {
      let month = agora.month - 1; // 0-based
      let year = agora.year;
      if (dia < agora.day) {
        month += 1;
      } else if (dia === agora.day) {
        // Mesmo dia do mês de hoje: só fica neste mês se o horário ainda não
        // passou — mesma regra do "mesmo dia da semana" logo abaixo.
        const passou = horaResolvida
          ? horaResolvida.hour < agora.hour || (horaResolvida.hour === agora.hour && horaResolvida.minute <= agora.minute)
          : false;
        if (passou) month += 1;
      }
      if (month > 11) { month = 0; year += 1; }
      // Mês candidato não TEM esse dia (ex.: 31 em setembro, 30 em fevereiro)
      // → avança pro PRÓXIMO mês que tenha, nunca deixa o Date estourar
      // sozinho pro mês seguinte (31/09 virando 01/10 seria um bug silencioso).
      while (dia > diasNoMes(year, month)) {
        month += 1;
        if (month > 11) { month = 0; year += 1; }
      }
      return { dateISO: fmt(Date.UTC(year, month, dia)), confiavel: true };
    }
  }

  for (const [nome, wd] of Object.entries(DIAS_SEMANA)) {
    if (!norm.includes(nome)) continue;
    let delta = (wd - agora.weekday + 7) % 7;
    const queVem = /que vem/.test(norm);
    if (delta === 0) {
      // Mesmo dia da semana de hoje: só fica hoje se o horário ainda não
      // passou; senão (ou se disse "que vem" explicitamente) pula 1 semana.
      const passou = horaResolvida
        ? horaResolvida.hour < agora.hour || (horaResolvida.hour === agora.hour && horaResolvida.minute <= agora.minute)
        : false;
      if (passou || queVem) delta = 7;
    } else if (queVem) {
      delta += 7;
    }
    return { dateISO: fmt(hojeUTC + delta * 86_400_000), confiavel: true };
  }

  // Não reconheceu o trecho → melhor palpite é hoje, mas marca como não confiável.
  return { dateISO: fmt(hojeUTC), confiavel: false };
}

export interface ResultadoHora {
  hour: number; minute: number; confiavel: boolean;
  fimHour?: number; fimMinute?: number; // presente quando a frase já traz o horário final ("das 9 às 12")
}

// Números por extenso, do 1 ao 23 — fala comum de compromisso raramente
// passa disso. Ordenado por comprimento de frase (as compostas "vinte e
// X" ANTES de "vinte" sozinho), pra casar a mais específica primeiro.
const EXTENSO_HORAS: Array<[string, number]> = [
  ['vinte e tres', 23], ['vinte e duas', 22], ['vinte e dois', 22], ['vinte e uma', 21], ['vinte e um', 21],
  ['vinte', 20], ['dezenove', 19], ['dezoito', 18], ['dezessete', 17], ['dezesseis', 16], ['quinze', 15],
  ['catorze', 14], ['quatorze', 14], ['treze', 13], ['doze', 12], ['onze', 11], ['dez', 10], ['nove', 9],
  ['oito', 8], ['sete', 7], ['seis', 6], ['cinco', 5], ['quatro', 4], ['tres', 3], ['duas', 2], ['dois', 2],
  ['uma', 1], ['um', 1],
];

// "sete da tarde"/"dez da noite" viram 12h a mais quando o número já não é
// óbvio de tarde/noite sozinho (1–11h) — mesma lógica de relógio de 12h que
// qualquer brasileiro usa de cabeça.
function ajustarPeriodo(hour: number, norm: string): number {
  if (hour >= 1 && hour <= 11 && /\b(tarde|noite)\b/.test(norm)) return hour + 12;
  return hour;
}

// Casa um número por extenso (com ou sem "e meia" grudado) no texto já
// normalizado. Devolve null quando nenhuma palavra de EXTENSO_HORAS aparece.
function casarExtensoHora(norm: string, comMeia: boolean): ResultadoHora | null {
  for (const [palavra, valor] of EXTENSO_HORAS) {
    const re = comMeia
      ? new RegExp(`\\b${palavra}\\s+e\\s+meia\\b`)
      : new RegExp(`\\b${palavra}\\b`);
    if (re.test(norm)) {
      return { hour: ajustarPeriodo(valor, norm), minute: comMeia ? 30 : 0, confiavel: true };
    }
  }
  return null;
}

// Palavras de aproximação que o Junior usa em áudio ("lá pelas nove", "umas
// 9", "perto das 9", "por volta das 9") — removidas antes de tentar casar
// dígito/hora, senão elas atrapalham os regexes mais específicos.
const FILLERS_HORA = /\b(l[áa]\s+pelas?|pelas?|perto\s+d(?:e|as|os)|por\s+volta\s+d(?:e|as|os)|umas)\b/g;

// Resolve um trecho de hora em PT-BR — bem mais tolerante que "9h"/"15h30":
// aceita extenso ("nove", "nove e meia"), aproximações ("lá pelas 9", "umas
// 9"), períodos nomeados ("meio-dia", "fim da tarde", "de manhãzinha",
// "cedo", "na hora do almoço", "à noite") e "9 horas"/"9hrs"/"9 e meia".
// Sem nenhuma pista → 09:00 default, não confiável (a Eva deve avisar que
// faltou hora clara).
export function resolverHora(horaTexto: string | null): ResultadoHora {
  let norm = normalizarTexto(horaTexto ?? '');
  if (!norm) return { hour: 9, minute: 0, confiavel: false };

  // Intervalo explícito: "das 9 às 12", "de 9h às 12h30", "9 as 12".
  const range = norm.match(/(?:das|de)?\s*(\d{1,2})(?:h|:)?(\d{2})?\s*(?:as|-)\s*(\d{1,2})(?:h|:)?(\d{2})?/);
  if (range) {
    return {
      hour: parseInt(range[1], 10),
      minute: range[2] ? parseInt(range[2], 10) : 0,
      confiavel: true,
      fimHour: parseInt(range[3], 10),
      fimMinute: range[4] ? parseInt(range[4], 10) : 0,
    };
  }

  norm = norm.replace(FILLERS_HORA, ' ').replace(/\s+/g, ' ').trim();

  // Períodos fixos específicos — checados ANTES dos genéricos (senão "fim da
  // tarde" cairia no "tarde" genérico = 14h, e "manhãzinha" no "manhã" = 9h).
  if (/\bfim da tarde\b/.test(norm)) return { hour: 17, minute: 0, confiavel: true };
  if (/\b(manhazinha|cedo)\b/.test(norm)) return { hour: 8, minute: 0, confiavel: true };
  if (/meio.?dia\b/.test(norm)) return { hour: 12, minute: 0, confiavel: true };
  if (/\balmoco\b/.test(norm)) return { hour: 12, minute: 0, confiavel: true };

  const extensoMeia = casarExtensoHora(norm, true);
  if (extensoMeia) return extensoMeia;

  const digitoMeia = norm.match(/\b(\d{1,2})\s*(?:h|:)?\s*e\s*meia\b/);
  if (digitoMeia) {
    return { hour: ajustarPeriodo(parseInt(digitoMeia[1], 10), norm), minute: 30, confiavel: true };
  }

  const extensoSeco = casarExtensoHora(norm, false);
  if (extensoSeco) return extensoSeco;

  if (/\bmanha\b/.test(norm)) return { hour: 9, minute: 0, confiavel: true };
  if (/\btarde\b/.test(norm)) return { hour: 14, minute: 0, confiavel: true };
  if (/\bnoite\b/.test(norm)) return { hour: 19, minute: 0, confiavel: true };

  const hm = norm.match(/(\d{1,2})[h:](\d{2})?/);
  if (hm) return { hour: parseInt(hm[1], 10), minute: hm[2] ? parseInt(hm[2], 10) : 0, confiavel: true };

  const horasEspaco = norm.match(/\b(\d{1,2})\s+horas?\b/);
  if (horasEspaco) return { hour: parseInt(horasEspaco[1], 10), minute: 0, confiavel: true };

  const soNum = norm.match(/^as\s*(\d{1,2})$/);
  if (soNum) return { hour: parseInt(soNum[1], 10), minute: 0, confiavel: true };

  // Número seco depois dos fillers já removidos ("umas 9" → "9").
  const bareNum = norm.match(/^(\d{1,2})$/);
  if (bareNum) return { hour: parseInt(bareNum[1], 10), minute: 0, confiavel: true };

  return { hour: 9, minute: 0, confiavel: false };
}

const NUMEROS_POR_EXTENSO: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
};

// Resolve a duração em minutos. Sem pista nenhuma → 60min (default).
export function resolverDuracaoMin(duracaoTexto: string | null): number {
  const norm = normalizarTexto(duracaoTexto ?? '');
  if (!norm) return 60;

  if (/hora e meia/.test(norm)) return 90;
  if (/meia hora/.test(norm)) return 30;

  const hm = norm.match(/(\d+)\s*h(?:oras?)?\s*(\d{1,2})?/);
  if (hm) return parseInt(hm[1], 10) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0);

  for (const [palavra, n] of Object.entries(NUMEROS_POR_EXTENSO)) {
    if (norm.includes(`${palavra} hora`)) return n * 60;
  }

  const min = norm.match(/(\d+)\s*min/);
  if (min) return parseInt(min[1], 10);

  return 60;
}

// Monta um instante ISO com offset -03:00 fixo, somando `deltaMin` minutos a
// partir de dateISO+hour:minute. A soma é feita tratando os campos como se
// fossem UTC (truque válido pra fuso de offset fixo, sem horário de verão) —
// isso já resolve virada de dia/mês/ano corretamente.
function construirISO(dateISO: string, hour: number, minute: number, deltaMin = 0): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d, hour, minute, 0) + deltaMin * 60_000;
  const dt = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00-03:00`;
}

// ---------------------------------------------------------------------------
// SEGUNDA CHANCE — valida a resolução EXPLÍCITA (dataISO/hora) que a IA
// devolveu na 2ª chamada. Nunca confia cegamente: dataISO/hora precisam ter
// formato válido, o dia precisa existir no mês/ano informado, e o instante
// resultante não pode cair no passado (com 1min de folga pra latência).
// ---------------------------------------------------------------------------

function resolucaoExplicitaValida(
  dataISO: string | null,
  hora: string | null,
  agoraISO: string,
): { dateISO: string; hour: number; minute: number } | null {
  if (!dataISO || !hora) return null;
  const mData = dataISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mHora = hora.match(/^(\d{1,2}):(\d{2})$/);
  if (!mData || !mHora) return null;

  const year = parseInt(mData[1], 10);
  const month = parseInt(mData[2], 10);
  const day = parseInt(mData[3], 10);
  const hour = parseInt(mHora[1], 10);
  const minute = parseInt(mHora[2], 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > diasNoMes(year, month - 1)) return null;
  if (hour > 23 || minute > 59) return null;

  const iso = `${dataISO}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  if (ms < Date.parse(agoraISO) - 60_000) return null; // nunca no passado (1min de folga)

  return { dateISO: dataISO, hour, minute };
}

// ---------------------------------------------------------------------------
// ORQUESTRAÇÃO
// ---------------------------------------------------------------------------

// Interpreta uma frase em PT-BR e devolve o compromisso resolvido (datas já
// calculadas, prontas pra virar evento no Google Agenda), ou null quando a
// frase claramente não é um pedido de compromisso (ou a IA falhou de vez).
export async function interpretar(frase: string, agoraISO: string, ia: ExtratorIA): Promise<Interpretacao | null> {
  let raw: string;
  try {
    raw = await ia.extrairAgenda(montarPromptInterpretarAgenda(frase));
  } catch (err) {
    console.warn('[agenda] interpretar: IA falhou:', (err as Error).message);
    return null;
  }

  const extracao = parseExtracaoAgenda(raw);
  if (!extracao) return null;

  let hora = resolverHora(extracao.horaTexto);
  // Fallback: às vezes o período de hora vem embutido no dataTexto mesmo
  // ("hoje à noite") em vez de vir separado no horaTexto — tenta achar ali.
  if (!hora.confiavel && extracao.dataTexto) {
    const tentativa = resolverHora(extracao.dataTexto);
    if (tentativa.confiavel) hora = tentativa;
  }
  let data = resolverData(extracao.dataTexto, agoraISO, { hour: hora.hour, minute: hora.minute });
  const duracaoMin = resolverDuracaoMin(extracao.duracaoTexto);

  let tituloFinal = extracao.titulo;
  let detalhesFinal = extracao.detalhes;
  let ambitoFinal = extracao.ambito;
  const diaInteiroFinal = extracao.diaInteiro;

  let confiancaAlta = data.confiavel && (diaInteiroFinal || hora.confiavel);

  // 2ª chance: só quando a 1ª tentativa ficaria com confiança baixa — UMA
  // chamada extra à IA pedindo a resolução EXPLÍCITA (dataISO/hora), dado
  // "agora". Cobre frase coloquial/áudio que a camada determinística sozinha
  // não deu conta. Nunca lança: falha aqui só mantém a confiança baixa.
  if (!confiancaAlta) {
    try {
      const raw2 = await ia.extrairAgenda(montarPromptSegundaChanceAgenda(frase, agoraISO));
      const chance2 = parseExtracaoSegundaChance(raw2);
      if (chance2) {
        tituloFinal = chance2.extracao.titulo ?? tituloFinal;
        detalhesFinal = chance2.extracao.detalhes ?? detalhesFinal;
        ambitoFinal = chance2.extracao.ambito ?? ambitoFinal;

        const resolucao = resolucaoExplicitaValida(chance2.resolucaoDataISO, chance2.resolucaoHora, agoraISO);
        if (resolucao) {
          data = { dateISO: resolucao.dateISO, confiavel: true };
          hora = { hour: resolucao.hour, minute: resolucao.minute, confiavel: true };
          confiancaAlta = true;
        } else {
          let hora2 = resolverHora(chance2.extracao.horaTexto);
          if (!hora2.confiavel && chance2.extracao.dataTexto) {
            const tentativa2 = resolverHora(chance2.extracao.dataTexto);
            if (tentativa2.confiavel) hora2 = tentativa2;
          }
          const data2 = resolverData(chance2.extracao.dataTexto, agoraISO, { hour: hora2.hour, minute: hora2.minute });
          if (data2.confiavel && (diaInteiroFinal || hora2.confiavel)) {
            data = data2;
            hora = hora2;
            confiancaAlta = true;
          }
        }
      }
    } catch (err) {
      console.warn('[agenda] interpretar: segunda chance falhou:', (err as Error).message);
    }
  }

  let inicioISO: string;
  let fimISO: string;
  if (diaInteiroFinal) {
    inicioISO = construirISO(data.dateISO, 0, 0);
    fimISO = construirISO(data.dateISO, 23, 59);
  } else {
    inicioISO = construirISO(data.dateISO, hora.hour, hora.minute);
    fimISO = hora.fimHour !== undefined
      ? construirISO(data.dateISO, hora.fimHour, hora.fimMinute ?? 0)
      : construirISO(data.dateISO, hora.hour, hora.minute, duracaoMin);
  }

  const confianca: 'alta' | 'baixa' = confiancaAlta ? 'alta' : 'baixa';

  return {
    titulo: tituloFinal ?? 'Compromisso',
    detalhes: detalhesFinal ?? undefined,
    inicioISO,
    fimISO,
    diaInteiro: diaInteiroFinal,
    ambito: ambitoFinal,
    confianca,
    entendido: tituloFinal ?? undefined,
  };
}

// Prompt da 2ª chance: dá à IA a referência de "agora" e pede a resolução
// EXPLÍCITA (não só o trecho cru) — é validada 100% deterministicamente
// depois (resolucaoExplicitaValida), nunca aceita cega.
export function montarPromptSegundaChanceAgenda(frase: string, agoraISO: string): string {
  return `Você tentou entender esta frase sobre um compromisso e faltou clareza no dia/hora — a extração de trechos crus não bastou. Frase original: "${frase}"

Agora (referência, fuso Brasília -03:00): ${agoraISO}

Devolva APENAS um bloco \`\`\`json\`\`\` com este formato (os mesmos campos de antes, MAIS a sua melhor resolução explícita):
{"compromisso": true,
 "titulo": "título curto" ou null,
 "detalhes": "tarefas/materiais/pessoas/valores além do básico" ou null,
 "dataTexto": o trecho do dia ou null,
 "horaTexto": o trecho da hora ou null,
 "duracaoTexto": o trecho de duração ou null,
 "diaInteiro": true/false,
 "ambito": "empresa"/"pessoal"/null,
 "resolucaoDataISO": a data ABSOLUTA que você acha mais provável, formato "YYYY-MM-DD", usando ${agoraISO} como referência de "agora" — ou null se genuinamente não der pra saber,
 "resolucaoHora": a hora ABSOLUTA em formato "HH:MM" (24h) que você acha mais provável — ou null se genuinamente não der pra saber}

REGRAS:
- resolucaoDataISO NUNCA pode ser uma data no passado (antes de ${agoraISO}).
- Se a frase realmente não dá nenhuma pista de dia/hora, devolva null nesses dois campos — não invente.`;
}
