// src/modules/agenda/comando-agenda.ts
// Handler da Eva Agenda A1 + A1.1: cola interpretar/classificar/conflito/
// executor numa conversa de zap com o DONO. Duas entradas só:
//   tratarMensagemAgenda — toda mensagem de texto (ou áudio já transcrito)
//   tratarBotaoAgenda    — toque num botão "ag_*"
// Tudo injetado (DepsAgenda) — nunca bate em rede/banco de verdade nos testes.
//
// Estado: o fluxo de conflito ("Marcar junto"/"Substituir"/"Sugerir horário"),
// a pergunta "que dia e hora?" (confiança baixa) e a correção de cor pós-
// marcação ("É pessoal"/"É empresa") são conversas curtas — o Junior só tem
// UM compromisso "em aberto" por vez. Por isso o estado pendente vive num Map
// module-level, com 1 chave fixa (dono único — a Eva Agenda A1 só atende o
// telefone do Junior, ver design doc) e TTL de 10min (relógio injetado via
// deps.agoraISO, nunca Date.now() direto — testável).
// resetEstadoAgenda() é só pra testes (isola cada `it` do módulo).
import {
  interpretar, resolverData, resolverHora, type ExtratorIA, type Interpretacao,
} from './interpretar.js';
import { classificar } from './classificar.js';
import { acharConflitos, sugerirHorario, type EventoAgenda } from './conflito.js';
import {
  marcar, desfazer, substituir, anexarLocalizacao, listarDiaFormatado, listarSemanaFormatado,
  type AgendaEscrita,
} from './executor.js';

export interface DepsAgenda {
  cal: AgendaEscrita;
  ia: ExtratorIA;
  agoraISO(): string;
  nomesDeLeads(): Promise<string[]>;
}

export interface RespostaAgenda {
  texto: string;
  botoes?: Array<{ id: string; rotulo: string }>;
}

const TTL_MS = 10 * 60 * 1000;
const CHAVE_DONO = 'dono'; // A1 só atende o telefone do Junior — 1 conversa pendente por vez.
const MSG_EXPIROU = 'Esse pedido expirou — me manda de novo 😉';
const MSG_ERRO = '❌ Deu ruim aqui na agenda agora — tenta de novo em instantes. Se repetir, me chama.';
const MSG_DESFAZER_ERRO = 'Não consegui desfazer — confere na agenda se o evento ainda está lá.';

// Loga o corpo real do erro do Google (err.response.data costuma ter o
// motivo de verdade; err.message sozinho às vezes só diz "Bad Request").
function logErroAgenda(prefixo: string, err: unknown): void {
  const e = err as { response?: { data?: unknown } };
  console.error(prefixo, e?.response?.data ?? err);
}

interface PendenteAgenda {
  interp: Interpretacao;
  ambito: 'empresa' | 'pessoal' | null;  // null enquanto ainda não foi resolvido (pendente "aguardando data/hora")
  conflitos: EventoAgenda[];
  location?: string;
  criadoEventId?: string;                                  // último evento criado (pra "É pessoal/empresa" recolorir)
  // Último evento criado com sucesso (marcar/substituir/ag_sim/ag_junto/
  // ag_cor) — usado pra "pin chegou DEPOIS do compromisso, anexa nele em vez
  // de virar um compromisso novo" (ver tratarLocalizacaoAgenda). Mesmo TTL de
  // 10min do resto do estado pendente (campo `em` próprio, mesmo relógio
  // deps.agoraISO() — nunca Date.now() direto).
  ultimoCriado?: { eventId: string; titulo: string; em: number };
  localizacaoAnexoPendente?: string;                        // localização aguardando confirmação (Sim, anexar / É outro compromisso)
  sugestao?: { inicioISO: string; fimISO: string };         // resposta pendente de "Sugerir horário" (aguardando Sim/Não)
  aguardandoDataHora?: boolean;                             // true = pendente é a pergunta "que dia e hora?" (confiança baixa)
  em: number;                                               // epoch ms (via deps.agoraISO()) de quando foi guardado
}

const estadoPendente = new Map<string, PendenteAgenda>();

// Localização (pin) já recebida mas ainda sem compromisso pra grudar — vale
// pro PRÓXIMO marcar (mesmo TTL/relógio do resto). Preenchido quando o pin
// chega sem um `ultimoCriado` fresco pra oferecer (ou quando o Junior
// responde "É outro compromisso" a essa oferta).
let localizacaoProximoMarcar: { coords: string; em: number } | null = null;

/** Só pra testes: zera o estado pendente entre casos (o Map é module-level). */
export function resetEstadoAgenda(): void {
  estadoPendente.clear();
  localizacaoProximoMarcar = null;
}

function expirado(p: PendenteAgenda, agoraISO: string): boolean {
  return Date.parse(agoraISO) - p.em > TTL_MS;
}

// ---------------------------------------------------------------------------
// Formatação PT-BR (fuso America/Sao_Paulo, timezone-safe via Intl — mesma
// técnica de interpretar.ts/classificar.ts/conflito.ts/executor.ts; não
// importa nada de lá porque são helpers internos não-exportados).
// ---------------------------------------------------------------------------

const DIAS_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pad = (n: number) => String(n).padStart(2, '0');

function partsEmSaoPaulo(iso: string): { day: number; month: number; hour: number; minute: number; weekday: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d);
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: parseInt(o.day, 10), month: parseInt(o.month, 10),
    hour: parseInt(o.hour, 10) % 24, minute: parseInt(o.minute, 10),
    weekday: weekdayMap[o.weekday] ?? 0,
  };
}

// Monta um instante ISO com offset -03:00 fixo (mesma técnica de
// interpretar.ts::construirISO — helper interno, não exportado de lá).
function construirISOLocal(dataISO: string, hour: number, minute: number, deltaMin = 0): string {
  const [y, m, d] = dataISO.split('-').map(Number);
  const ms = Date.UTC(y, m - 1, d, hour, minute, 0) + deltaMin * 60_000;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:00-03:00`;
}

function rotuloDiaCurto(iso: string): string {
  const p = partsEmSaoPaulo(iso);
  return `${DIAS_ABREV[p.weekday]} ${pad(p.day)}/${pad(p.month)}`;
}

function faixaHorario(inicioISO: string, fimISO: string): string {
  const i = partsEmSaoPaulo(inicioISO);
  const f = partsEmSaoPaulo(fimISO);
  return `${pad(i.hour)}:${pad(i.minute)}–${pad(f.hour)}:${pad(f.minute)}`;
}

function bolinhaAmbito(ambito: 'empresa' | 'pessoal'): string {
  return ambito === 'empresa' ? '🔵 empresa' : '🟢 pessoal';
}

function montarConfirmacao(interp: Interpretacao, ambito: 'empresa' | 'pessoal', location?: string): string {
  const horario = interp.diaInteiro ? 'dia todo' : faixaHorario(interp.inicioISO, interp.fimISO);
  let texto = `📅 Marquei: ${interp.titulo} · ${rotuloDiaCurto(interp.inicioISO)} · ${horario} · ${bolinhaAmbito(ambito)}`;
  if (interp.detalhes) texto += ' · 📝 com anotações';
  if (location) texto += ' · 📍 com localização';
  return texto;
}

function botoesPosMarcar(eventId: string, ambito: 'empresa' | 'pessoal'): Array<{ id: string; rotulo: string }> {
  return [
    { id: `ag_desf_${eventId}`, rotulo: 'Desfazer' },
    { id: `ag_cor_${eventId}`, rotulo: ambito === 'empresa' ? 'É pessoal' : 'É empresa' },
  ];
}

async function marcarEResponder(
  deps: DepsAgenda,
  p: { interp: Interpretacao; ambito: 'empresa' | 'pessoal'; location?: string },
): Promise<RespostaAgenda> {
  const criado = await marcar(deps.cal, p.interp, p.ambito, p.location ? { location: p.location } : undefined);
  const agora = Date.parse(deps.agoraISO());
  estadoPendente.set(CHAVE_DONO, {
    interp: p.interp, ambito: p.ambito, conflitos: [], location: p.location,
    criadoEventId: criado.eventId,
    ultimoCriado: { eventId: criado.eventId, titulo: p.interp.titulo, em: agora },
    em: agora,
  });
  return { texto: montarConfirmacao(p.interp, p.ambito, p.location), botoes: botoesPosMarcar(criado.eventId, p.ambito) };
}

// Resolve âmbito (IA já cravou, ou classificar() decide) + checa conflito —
// e ou marca direto, ou guarda o pendente de conflito com os 3 botões.
// Reusado tanto pelo fluxo normal (interpretar() deu confiança alta de
// cara) quanto pela COMPLETUDE de um pendente "aguardando data/hora"
// (2ª mensagem só com dia/hora completando um pedido anterior incompleto).
async function processarCompromissoInterpretado(
  deps: DepsAgenda, interp: Interpretacao, location?: string,
): Promise<RespostaAgenda> {
  const ambito = interp.ambito ?? classificar(interp.titulo, interp.inicioISO, await deps.nomesDeLeads());
  const conflitos = await acharConflitos(deps.cal, interp.inicioISO, interp.fimISO);

  if (conflitos.length === 0) {
    return await marcarEResponder(deps, { interp, ambito, location });
  }

  estadoPendente.set(CHAVE_DONO, { interp, ambito, conflitos, location, em: Date.parse(deps.agoraISO()) });
  const c = conflitos[0];
  return {
    texto: `⚠️ Você já tem ${c.titulo} ${faixaHorario(c.inicioISO, c.fimISO)}. O que faço?`,
    botoes: [
      { id: 'ag_junto', rotulo: 'Marcar junto' },
      { id: 'ag_subst', rotulo: 'Substituir' },
      { id: 'ag_sugerir', rotulo: 'Sugerir horário' },
    ],
  };
}

// Vocabulário reconhecido de data/hora — usado só pra decidir se a mensagem
// SEGUINTE a um pendente é "só dia e hora" (completa) ou traz um ASSUNTO
// NOVO junto (ex.: "visita na Ana quinta 10h" tem "visita"/"ana" sobrando,
// não pode roubar um pendente "dentista"). Cobre os mesmos dias da semana/
// períodos/números por extenso que interpretar.ts já reconhece, mais os
// fillers de aproximação e preposição mais comuns em áudio (BUG 1, revisão
// adversarial 30/08).
const VOCAB_DATA_HORA = new Set([
  // fillers/preposições/aproximadores
  'as', 'a', 'dia', 'de', 'da', 'do', 'no', 'na', 'pra', 'para', 'la', 'pelas', 'pela',
  'perto', 'volta', 'por', 'umas', 'que', 'vem', 'e', 'hs', 'h', 'horas', 'hora',
  // dias relativos / períodos nomeados
  'hoje', 'amanha', 'depois', 'daqui', 'dias', 'semana', 'meia', 'meio', 'manha',
  'manhazinha', 'tarde', 'noite', 'cedo', 'almoco', 'fim',
  // dias da semana (com e sem "-feira", já sem acento)
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'feira',
  // números por extenso 1-23 (mesmos de resolverHora)
  'um', 'uma', 'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze', 'quinze', 'dezesseis',
  'dezessete', 'dezoito', 'dezenove', 'vinte',
]);

// Mensagem "só dia/hora": depois de tirar dígitos, pontuação e o vocabulário
// conhecido de data/hora, sobra praticamente nada (≤2 chars). Um assunto
// novo (nome de pessoa, título de compromisso...) sempre deixa sobra maior —
// é isso que separa "amanhã 9h" (completa o pendente) de "visita na Ana
// quinta 10h" (assunto novo, não pode roubar o pendente de outro compromisso).
function ehApenasDataHora(texto: string): boolean {
  const semDigitos = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\d+/g, ' ');
  const palavras = semDigitos.split(/[^a-z]+/).filter(Boolean);
  const sobra = palavras.filter((p) => !VOCAB_DATA_HORA.has(p)).join('');
  return sobra.length <= 2;
}

// Palavras que só servem pra DIA (não pra hora) — removidas antes de tentar
// achar a hora numa mensagem de completude tipo "quinta que vem lá pelas
// 10": sem tirar "quinta"/"que"/"vem", o "10" sozinho no fim da frase não
// bate em nenhum padrão de resolverHora (não tem "h" grudado, e a frase
// inteira não é só o número — os padrões âncora ^...$ exigem isso).
const PALAVRAS_SO_DE_DATA = new Set([
  'hoje', 'amanha', 'depois', 'daqui', 'dias', 'dia', 'semana', 'que', 'vem',
  'domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'feira',
]);

function extrairCandidatoHora(texto: string): string {
  const norm = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.filter((t) => !PALAVRAS_SO_DE_DATA.has(t)).join(' ');
}

// Tenta completar um pendente "aguardando data/hora" com a mensagem SEGUINTE
// do Junior, quando ela só traz dia/hora (ex.: "amanhã 9h") — sem precisar
// chamar a IA de novo. Isso mata o loop de "Que dia e hora?" repetido: em vez
// de reiniciar a pergunta, a Eva já completa o compromisso original. Só
// completa quando (1) a mensagem é SÓ dia/hora — ehApenasDataHora — e (2) dia
// E hora (ou dia sozinho pra dia inteiro) ficam reconhecíveis nela — senão
// devolve null e o fluxo normal segue (BUG 1: uma frase completa nova, tipo
// "visita na Ana quinta 10h", NUNCA deve roubar um pendente de outro
// compromisso — o assunto novo tem que vencer, e o pendente antigo continua
// vivo até expirar ou ser SUBSTITUÍDO por essa nova pergunta/criação).
function tentarCompletarPendente(
  pendente: PendenteAgenda, texto: string, agoraISO: string, location?: string,
): { interp: Interpretacao; location?: string } | null {
  if (!ehApenasDataHora(texto)) return null;

  const dataTentativa = resolverData(texto, agoraISO);
  let horaTentativa = resolverHora(texto);
  // Fallback: quando dia e hora vêm misturados na mesma mensagem ("quinta
  // que vem lá pelas 10"), as palavras de DIA no começo impedem os padrões
  // âncora de resolverHora (soNum/bareNum) de casar o "10" sozinho no fim.
  // Tira as palavras de dia e tenta de novo — permitirRange:false (mesma
  // cautela do fallback de interpretar.ts): esse candidato derivado nunca
  // deve virar um intervalo por coincidência de dígitos.
  if (!horaTentativa.confiavel) {
    const candidato = extrairCandidatoHora(texto);
    const tentativa = resolverHora(candidato, { permitirRange: false });
    if (tentativa.confiavel) horaTentativa = tentativa;
  }
  const base = pendente.interp;
  if (!dataTentativa.confiavel || (!base.diaInteiro && !horaTentativa.confiavel)) return null;

  let inicioISO: string;
  let fimISO: string;
  if (base.diaInteiro) {
    inicioISO = construirISOLocal(dataTentativa.dateISO, 0, 0);
    fimISO = construirISOLocal(dataTentativa.dateISO, 23, 59);
  } else if (horaTentativa.fimHour !== undefined) {
    inicioISO = construirISOLocal(dataTentativa.dateISO, horaTentativa.hour, horaTentativa.minute);
    fimISO = construirISOLocal(dataTentativa.dateISO, horaTentativa.fimHour, horaTentativa.fimMinute ?? 0);
  } else {
    const duracaoMin = Math.max(1, Math.round((Date.parse(base.fimISO) - Date.parse(base.inicioISO)) / 60_000)) || 60;
    inicioISO = construirISOLocal(dataTentativa.dateISO, horaTentativa.hour, horaTentativa.minute);
    fimISO = construirISOLocal(dataTentativa.dateISO, horaTentativa.hour, horaTentativa.minute, duracaoMin);
  }

  return {
    interp: { ...base, inicioISO, fimISO, confianca: 'alta' },
    location: location ?? pendente.location,
  };
}

// ---------------------------------------------------------------------------
// CONSULTA — regex barata, decide ANTES de gastar IA (prioridade sobre marcar).
// ANCORADA (^...$): só é consulta quando a mensagem INTEIRA é uma pergunta de
// agenda ("agenda amanhã?", "o que tenho hoje", "minha agenda de amanhã?").
// Sem âncora, "agenda a visita da Cyntia amanhã 9h" batia em \bagenda\b +
// \bamanhã\b e virava uma LISTAGEM em vez de marcar o compromisso — bug real.
// ---------------------------------------------------------------------------

const RE_CONSULTA = /^\s*(minha\s+)?(agenda|compromissos?|o que tenho)( de| da| do)?\s*(hoje|amanh[ãa]|(da |essa |esta )?semana)?\s*[?!.]*\s*$/i;

type Periodo = 'hoje' | 'amanha' | 'semana';

function detectarConsulta(texto: string): Periodo | null {
  const m = texto.match(RE_CONSULTA);
  if (!m) return null;
  const periodo = (m[4] ?? '').toLowerCase();
  if (/semana/.test(periodo)) return 'semana';
  if (/amanh[ãa]/.test(periodo)) return 'amanha';
  return 'hoje'; // "agenda hoje", "o que tenho hoje" e o "agenda" pelado caem aqui.
}

async function responderConsulta(deps: DepsAgenda, periodo: Periodo): Promise<RespostaAgenda> {
  const agoraISO = deps.agoraISO();
  const hojeISO = resolverData('hoje', agoraISO).dateISO;
  if (periodo === 'semana') {
    return { texto: await listarSemanaFormatado(deps.cal, hojeISO) };
  }
  const dataISO = periodo === 'amanha' ? resolverData('amanhã', agoraISO).dateISO : hojeISO;
  const rotulo = periodo === 'amanha' ? 'Amanhã' : 'Hoje';
  return { texto: await listarDiaFormatado(deps.cal, dataISO, rotulo) };
}

// ---------------------------------------------------------------------------
// MENSAGEM DE TEXTO (ou áudio já transcrito upstream)
// ---------------------------------------------------------------------------

export async function tratarMensagemAgenda(deps: DepsAgenda, texto: string, location?: string): Promise<RespostaAgenda | null> {
  // Só converte falha em RespostaAgenda de erro DEPOIS de sabermos que é
  // assunto de agenda de verdade (consulta reconhecida, ou interpretar()
  // achou um compromisso). Uma mensagem qualquer que não é agenda continua
  // devolvendo null mesmo se algo desse errado antes disso — nunca sequestra
  // o fluxo normal da Eva pra um texto que nem era pra ser dela.
  let intencaoAgenda = false;
  try {
    const agoraISO = deps.agoraISO();
    // Localização explícita no parâmetro sempre ganha; senão, cai no pin que
    // ficou pendente pro PRÓXIMO marcar (ver localizacaoProximoMarcar/
    // tratarLocalizacaoAgenda) se ainda estiver fresco (mesmo TTL).
    const localizacaoEfetiva = location ?? (
      localizacaoProximoMarcar && (Date.parse(agoraISO) - localizacaoProximoMarcar.em) <= TTL_MS
        ? localizacaoProximoMarcar.coords
        : undefined
    );

    // 0) Completar um pendente "aguardando data/hora" — a mensagem SEGUINTE
    // do Junior pode ser só o dia/hora que faltou (ex.: "amanhã 9h"),
    // completando o compromisso em vez de reiniciar a pergunta. Isso vem
    // ANTES de consulta/interpretar pra não tratar "amanhã 9h" como uma
    // pergunta de agenda nova (não bate no RE_CONSULTA mesmo, mas por
    // clareza a prioridade é explícita).
    const pendente = estadoPendente.get(CHAVE_DONO);
    if (pendente?.aguardandoDataHora && !expirado(pendente, agoraISO)) {
      const completo = tentarCompletarPendente(pendente, texto, agoraISO, localizacaoEfetiva);
      if (completo) {
        intencaoAgenda = true;
        localizacaoProximoMarcar = null; // pin consumido (usado ou não) — não vale pra um 2º compromisso
        estadoPendente.delete(CHAVE_DONO);
        return await processarCompromissoInterpretado(deps, completo.interp, completo.location);
      }
      // Não deu pra completar com essa mensagem — segue o fluxo normal
      // (pode ser um pedido totalmente novo, ou o Junior mudou de ideia).
    }

    const consulta = detectarConsulta(texto);
    if (consulta) {
      intencaoAgenda = true;
      localizacaoProximoMarcar = null;
      return await responderConsulta(deps, consulta);
    }

    const interp = await interpretar(texto, agoraISO, deps.ia);
    if (!interp) return null; // não é assunto de agenda — outro fluxo da Eva cuida.
    intencaoAgenda = true;
    localizacaoProximoMarcar = null;

    if (interp.confianca === 'baixa') {
      estadoPendente.set(CHAVE_DONO, {
        interp, ambito: null, conflitos: [], location: localizacaoEfetiva, aguardandoDataHora: true, em: Date.parse(agoraISO),
      });
      const texto2 = interp.entendido
        ? `Anotei "${interp.entendido}" 📝 — só me confirma o dia e a hora (ex.: amanhã 9h)`
        : 'Não peguei bem o que é — me diz com o dia e a hora (ex.: visita amanhã 9h)';
      return { texto: texto2 };
    }

    return await processarCompromissoInterpretado(deps, interp, localizacaoEfetiva);
  } catch (err) {
    logErroAgenda('[agenda]', err);
    return intencaoAgenda ? { texto: MSG_ERRO } : null;
  }
}

// ---------------------------------------------------------------------------
// LOCALIZAÇÃO (pin do WhatsApp) — chegou um pin AVULSO (não como 3º parâmetro
// de tratarMensagemAgenda, que é o caso "pin + texto na mesma leva"). Decide
// entre duas coisas:
//   (a) tem um compromisso RECÉM-criado (ultimoCriado, ≤10min) → oferece
//       anexar a localização NELE, em vez de deixar o pin virar sozinho um
//       pedido de compromisso novo (era exatamente esse o bug ao vivo: pin
//       após "visita" virava conflito → "Marcar junto" → visita duplicada).
//   (b) sem compromisso recente → comportamento de sempre: guarda o pin pro
//       PRÓXIMO marcar e pede o compromisso por texto.
// ---------------------------------------------------------------------------

const MSG_PEGUEI_LOCALIZACAO = '📍 Peguei a localização! Me diz o compromisso que eu já marco com esse endereço (ex.: "visita amanhã 9h")';

export async function tratarLocalizacaoAgenda(deps: DepsAgenda, location: string): Promise<RespostaAgenda | null> {
  const agoraISO = deps.agoraISO();
  const p = estadoPendente.get(CHAVE_DONO);

  if (p?.ultimoCriado && (Date.parse(agoraISO) - p.ultimoCriado.em) <= TTL_MS) {
    estadoPendente.set(CHAVE_DONO, { ...p, localizacaoAnexoPendente: location, em: Date.parse(agoraISO) });
    return {
      texto: `📍 Anexo essa localização à "${p.ultimoCriado.titulo}"? `,
      botoes: [
        { id: 'ag_loc_sim', rotulo: 'Sim, anexar' },
        { id: 'ag_loc_outro', rotulo: 'É outro compromisso' },
      ],
    };
  }

  localizacaoProximoMarcar = { coords: location, em: Date.parse(agoraISO) };
  return { texto: MSG_PEGUEI_LOCALIZACAO };
}

// ---------------------------------------------------------------------------
// BOTÕES ag_*
// ---------------------------------------------------------------------------

// Extrai um id "ag_xxx_yyy" de dentro de texto decorado — fallback pro modo
// numerado/texto puro do WhatsApp quando o botão não chega como o id puro
// (ex.: "1. Desfazer (ag_desf_abc123)"). Restrito a letras/dígitos/hífen/
// underscore pra não engolir parênteses/pontuação ao redor.
const RE_AG_EMBUTIDO = /ag_[a-z]+_[A-Za-z0-9_-]+/i;

export async function tratarBotaoAgenda(deps: DepsAgenda, botaoId: string): Promise<RespostaAgenda | null> {
  let id = botaoId.trim();
  if (!id.startsWith('ag_')) {
    const m = id.match(RE_AG_EMBUTIDO);
    if (m) id = m[0];
  }
  try {
    // ag_desf_<eventId> — desfazer é sempre confiável: o eventId vem embutido
    // no próprio botão, não depende do estado pendente (nem do TTL).
    // Idempotente: 404/410 (já tinha sido desfeito, ou apagado na mão) NÃO é
    // erro — vira "Já estava desfeito ✔" em vez do aviso de erro genérico.
    const mDesf = id.match(/^ag_desf_(.+)$/);
    if (mDesf) {
      try {
        const r = await desfazer(deps.cal, mDesf[1]);
        return { texto: r.jaEstava ? 'Já estava desfeito ✔' : 'Desfeito ✔' };
      } catch (err) {
        logErroAgenda('[agenda] desfazer falhou:', err);
        return { texto: MSG_DESFAZER_ERRO };
      }
    }

    // ag_cor_<eventId> — recolorir precisa do interp original (título/horário),
    // que só existe no estado pendente; e só se o eventId bater com o último
    // criado (evita recolorir o compromisso errado se o estado já mudou).
    const mCor = id.match(/^ag_cor_(.+)$/);
    if (mCor) {
      const eventId = mCor[1];
      const p = estadoPendente.get(CHAVE_DONO);
      if (!p || expirado(p, deps.agoraISO()) || p.criadoEventId !== eventId || p.ambito === null) return { texto: MSG_EXPIROU };
      const novoAmbito: 'empresa' | 'pessoal' = p.ambito === 'empresa' ? 'pessoal' : 'empresa';
      await desfazer(deps.cal, eventId);
      const criado = await marcar(deps.cal, p.interp, novoAmbito, p.location ? { location: p.location } : undefined);
      const agoraRecor = Date.parse(deps.agoraISO());
      estadoPendente.set(CHAVE_DONO, {
        ...p, ambito: novoAmbito, criadoEventId: criado.eventId,
        ultimoCriado: { eventId: criado.eventId, titulo: p.interp.titulo, em: agoraRecor },
        em: agoraRecor,
      });
      return { texto: `Corrigido: agora é ${bolinhaAmbito(novoAmbito)}.` };
    }

    // ag_loc_sim / ag_loc_outro — resposta à pergunta de tratarLocalizacaoAgenda
    // ("anexo essa localização à '<título>'?"), quando um pin chegou logo
    // depois de um compromisso já criado.
    if (id === 'ag_loc_sim' || id === 'ag_loc_outro') {
      const p = estadoPendente.get(CHAVE_DONO);
      if (!p || expirado(p, deps.agoraISO()) || !p.ultimoCriado || p.localizacaoAnexoPendente === undefined) {
        return { texto: MSG_EXPIROU };
      }
      const localizacao = p.localizacaoAnexoPendente;

      if (id === 'ag_loc_outro') {
        localizacaoProximoMarcar = { coords: localizacao, em: Date.parse(deps.agoraISO()) };
        estadoPendente.set(CHAVE_DONO, { ...p, localizacaoAnexoPendente: undefined, em: Date.parse(deps.agoraISO()) });
        return { texto: MSG_PEGUEI_LOCALIZACAO };
      }

      // ag_loc_sim
      try {
        await anexarLocalizacao(deps.cal, p.ultimoCriado.eventId, localizacao);
      } catch (err) {
        logErroAgenda('[agenda] anexar localização falhou:', err);
        return { texto: '❌ Não consegui anexar a localização — tenta de novo ou anexa na mão pela agenda.' };
      }
      estadoPendente.set(CHAVE_DONO, { ...p, localizacaoAnexoPendente: undefined, em: Date.parse(deps.agoraISO()) });
      return { texto: `📍 Anexada à "${p.ultimoCriado.titulo}" ✔` };
    }

    const ACOES_PENDENTE = new Set(['ag_junto', 'ag_subst', 'ag_sugerir', 'ag_sim', 'ag_nao']);
    if (!ACOES_PENDENTE.has(id)) return null; // não é um botão nosso.

    const p = estadoPendente.get(CHAVE_DONO);
    if (!p || expirado(p, deps.agoraISO()) || p.ambito === null) return { texto: MSG_EXPIROU };

    if (id === 'ag_junto') {
      return await marcarEResponder(deps, { interp: p.interp, ambito: p.ambito, location: p.location });
    }

    if (id === 'ag_subst') {
      if (p.conflitos.length === 0) return { texto: MSG_EXPIROU };
      const criado = await substituir(deps.cal, p.conflitos[0].id, p.interp, p.ambito, p.location ? { location: p.location } : undefined);
      const agoraSubst = Date.parse(deps.agoraISO());
      estadoPendente.set(CHAVE_DONO, {
        ...p, conflitos: [], criadoEventId: criado.eventId,
        ultimoCriado: { eventId: criado.eventId, titulo: p.interp.titulo, em: agoraSubst },
        em: agoraSubst,
      });
      return { texto: montarConfirmacao(p.interp, p.ambito, p.location), botoes: botoesPosMarcar(criado.eventId, p.ambito) };
    }

    if (id === 'ag_sugerir') {
      const dataISO = p.interp.inicioISO.slice(0, 10);
      const duracaoMin = Math.max(1, Math.round((Date.parse(p.interp.fimISO) - Date.parse(p.interp.inicioISO)) / 60_000));
      const sugestao = await sugerirHorario(deps.cal, dataISO, duracaoMin, deps.agoraISO());
      if (!sugestao) {
        estadoPendente.delete(CHAVE_DONO);
        return { texto: 'Não achei horário livre nesse dia até as 20h. Me diz outro dia? 😉' };
      }
      estadoPendente.set(CHAVE_DONO, { ...p, sugestao, em: Date.parse(deps.agoraISO()) });
      const hm = partsEmSaoPaulo(sugestao.inicioISO);
      return {
        texto: `Que tal ${pad(hm.hour)}:${pad(hm.minute)}? `,
        botoes: [{ id: 'ag_sim', rotulo: 'Sim' }, { id: 'ag_nao', rotulo: 'Não' }],
      };
    }

    if (id === 'ag_sim') {
      if (!p.sugestao) return { texto: MSG_EXPIROU };
      const novoInterp: Interpretacao = { ...p.interp, inicioISO: p.sugestao.inicioISO, fimISO: p.sugestao.fimISO };
      return await marcarEResponder(deps, { interp: novoInterp, ambito: p.ambito, location: p.location });
    }

    // ag_nao
    estadoPendente.delete(CHAVE_DONO);
    return { texto: 'Ok, me diga outro horário 👍' };
  } catch (err) {
    logErroAgenda('[agenda]', err);
    return { texto: MSG_ERRO };
  }
}
