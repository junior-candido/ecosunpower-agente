// src/modules/agenda/interpretar.ts
// Interpretador de frases de compromisso da Eva Agenda (Fatia A1).
// Mesmo padrão de extrator-lancamento.ts / rh/triagem.ts: a IA (injetada,
// interface ExtratorIA) só EXTRAI os trechos crus da frase (titulo/dataTexto/
// horaTexto/duracaoTexto/ambito) num bloco ```json```; a resolução de datas
// e horários é 100% determinística e PURA aqui embaixo — nunca a IA calcula
// "próxima quinta" ou "dia 15" sozinha, porque isso é matemática, não texto.
// A injeção de dependência (ExtratorIA) garante que os testes nunca batem
// na rede: o mock devolve JSON canned, igual ao house pattern do financeiro.

export interface Interpretacao {
  titulo: string;            // "Visita Cyntia" — curto, sem a data dentro
  inicioISO: string;         // instante ISO com offset -03:00
  fimISO: string;            // default início + 1h
  diaInteiro: boolean;       // "o dia todo" → true (início 00:00, fim 23:59 do dia)
  ambito: 'empresa' | 'pessoal' | null; // null quando a frase não deixa claro
  confianca: 'alta' | 'baixa';          // baixa = falta data OU hora clara
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
  dataTexto: string | null;     // trecho que fala do dia ("amanhã", "quinta", "dia 15")
  horaTexto: string | null;     // trecho que fala da hora ("9h", "de tarde", "das 9 às 12")
  duracaoTexto: string | null;  // trecho que fala de duração ("duas horas", "1h30")
  diaInteiro: boolean;          // "o dia todo" / "dia inteiro"
  ambito: 'empresa' | 'pessoal' | null;
}

// ---------------------------------------------------------------------------
// PROMPT + PARSE (puros, testáveis)
// ---------------------------------------------------------------------------

export function montarPromptInterpretarAgenda(frase: string): string {
  return `Você lê uma frase do DONO de uma empresa de energia solar (Brasília-DF) pedindo pra marcar um compromisso na agenda pessoal dele, mandada no WhatsApp.

Frase: "${frase}"

Devolva APENAS um bloco \`\`\`json\`\`\` com este formato:
{"compromisso": true/false,
 "titulo": "título curto do compromisso, SEM a data/hora dentro (ex.: \\"Visita Cyntia\\", \\"Dentista\\")" ou null,
 "dataTexto": o TRECHO da frase que fala do DIA (ex.: "amanhã", "quinta", "dia 15", "depois de amanhã") ou null se a frase não disser,
 "horaTexto": o TRECHO que fala da HORA (ex.: "9h", "15h30", "de tarde", "das 9 às 12") ou null se não disser,
 "duracaoTexto": o TRECHO que fala de QUANTO TEMPO dura (ex.: "duas horas", "1h30") ou null,
 "diaInteiro": true SÓ quando a pessoa disser "o dia todo"/"dia inteiro", senão false,
 "ambito": "empresa" (obra, cliente, lead, fornecedor, reunião de trabalho) ou "pessoal" (médico, família, casa) ou null quando não der pra saber}

REGRAS:
- NÃO calcule datas nem horários — só copie os TRECHOS da frase que falam disso; o cálculo de "próxima quinta"/"dia 15" etc. é feito depois por outro código, determinístico.
- Não é um pedido pra marcar/agendar algo (é pergunta, consulta, assunto qualquer que não seja compromisso) → "compromisso": false e os outros campos null/false.`;
}

// Lê o JSON cru da IA. Tolerante a bloco \`\`\`json\`\`\` ou objeto solto;
// qualquer falha de parse ou compromisso:false → null (nunca explode).
export function parseExtracaoAgenda(raw: string): ExtracaoAgenda | null {
  const fence = raw.match(/```json\s*([\s\S]*?)```/);
  const corpo = fence ? fence[1] : raw;
  let obj: unknown;
  try {
    obj = JSON.parse(corpo);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (o.compromisso !== true) return null;

  const strOuNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

  return {
    compromisso: true,
    titulo: strOuNull(o.titulo),
    dataTexto: strOuNull(o.dataTexto),
    horaTexto: strOuNull(o.horaTexto),
    duracaoTexto: strOuNull(o.duracaoTexto),
    diaInteiro: o.diaInteiro === true,
    ambito: o.ambito === 'empresa' || o.ambito === 'pessoal' ? o.ambito : null,
  };
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

// Remove acentos e "-feira" pra comparar nomes de dia sem depender de como a
// IA escreveu ("terça"/"terca", "quinta-feira"/"quinta").
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

  const diaMes = norm.match(/\bdia\s+(\d{1,2})\b/);
  if (diaMes) {
    const dia = parseInt(diaMes[1], 10);
    let month = agora.month - 1; // 0-based
    let year = agora.year;
    if (dia < agora.day) {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
    }
    return { dateISO: fmt(Date.UTC(year, month, dia)), confiavel: true };
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

// Resolve um trecho de hora em PT-BR. Sem nenhuma pista → 09:00 default,
// não confiável (a Eva deve avisar que faltou hora clara).
export function resolverHora(horaTexto: string | null): ResultadoHora {
  const norm = normalizarTexto(horaTexto ?? '');
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

  if (/de manha/.test(norm)) return { hour: 9, minute: 0, confiavel: true };
  if (/de tarde/.test(norm)) return { hour: 14, minute: 0, confiavel: true };
  if (/de noite/.test(norm)) return { hour: 19, minute: 0, confiavel: true };

  const hm = norm.match(/(\d{1,2})[h:](\d{2})?/);
  if (hm) return { hour: parseInt(hm[1], 10), minute: hm[2] ? parseInt(hm[2], 10) : 0, confiavel: true };

  const soNum = norm.match(/^as\s*(\d{1,2})$/);
  if (soNum) return { hour: parseInt(soNum[1], 10), minute: 0, confiavel: true };

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
// ORQUESTRAÇÃO
// ---------------------------------------------------------------------------

// Interpreta uma frase em PT-BR e devolve o compromisso resolvido (datas já
// calculadas, prontas pra virar evento no Google Agenda), ou null quando a
// frase claramente não é um pedido de compromisso (ou a IA falhou).
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

  const hora = resolverHora(extracao.horaTexto);
  const data = resolverData(extracao.dataTexto, agoraISO, { hour: hora.hour, minute: hora.minute });
  const duracaoMin = resolverDuracaoMin(extracao.duracaoTexto);

  let inicioISO: string;
  let fimISO: string;
  if (extracao.diaInteiro) {
    inicioISO = construirISO(data.dateISO, 0, 0);
    fimISO = construirISO(data.dateISO, 23, 59);
  } else {
    inicioISO = construirISO(data.dateISO, hora.hour, hora.minute);
    fimISO = hora.fimHour !== undefined
      ? construirISO(data.dateISO, hora.fimHour, hora.fimMinute ?? 0)
      : construirISO(data.dateISO, hora.hour, hora.minute, duracaoMin);
  }

  const confianca: 'alta' | 'baixa' = data.confiavel && (extracao.diaInteiro || hora.confiavel) ? 'alta' : 'baixa';

  return {
    titulo: extracao.titulo ?? 'Compromisso',
    inicioISO,
    fimISO,
    diaInteiro: extracao.diaInteiro,
    ambito: extracao.ambito,
    confianca,
  };
}
