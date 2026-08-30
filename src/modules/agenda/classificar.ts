// src/modules/agenda/classificar.ts
// Classifica um compromisso como 'empresa' ou 'pessoal' quando a IA (em
// interpretar.ts) não crava o âmbito na frase. Regras em ordem de
// prioridade — a primeira que bater decide:
//   1) palavra-chave de negócio no título OU nome de lead do CRM no título → empresa
//   2) palavra-chave doméstica/pessoal no título → pessoal
//   3) fallback: horário comercial (dia útil, 08:00–18:59) → empresa; senão → pessoal
// 100% determinístico e puro — sem IA, sem IO.

// Remove acentos pra comparar sem depender de como o texto foi digitado
// ("médico"/"medico", "orçamento"/"orcamento").
function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const PALAVRAS_EMPRESA = [
  'visita', 'obra', 'instala', 'manuten', 'limpeza', 'cliente', 'entrega',
  'orcamento', 'medicao', 'vistoria', 'homologa', 'reuniao', 'kit', 'usina',
  'quadro', 'padrao',
].map(normalizarTexto);

const PALAVRAS_PESSOAL = [
  'medico', 'dentista', 'consulta', 'escola', 'aniversario', 'familia',
  'igreja', 'culto', 'academia', 'exame', 'pagamento pessoal',
].map(normalizarTexto);

// Lê os campos de calendário/relógio (dia da semana + hora local) de um
// instante ISO em America/Sao_Paulo, via Intl — não depende do TZ do host.
function partsEmSaoPaulo(iso: string): { weekday: number; hour: number; minute: number } {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d);
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdayMap[o.weekday] ?? 0,
    hour: parseInt(o.hour, 10) % 24,
    minute: parseInt(o.minute, 10),
  };
}

export function classificar(titulo: string, inicioISO: string, nomesDeLeads: string[]): 'empresa' | 'pessoal' {
  const tituloNorm = normalizarTexto(titulo);

  // 1) palavra-chave de negócio ou nome de lead no título → empresa.
  if (PALAVRAS_EMPRESA.some((p) => tituloNorm.includes(p))) return 'empresa';
  // Nome de lead pode vir completo ("Cyntia Alves") mas o título costuma
  // citar só o primeiro nome ("Cyntia às 9h") — compara palavra a palavra
  // (mínimo 3 letras, pra não bater com preposições/artigos à toa).
  const palavrasTitulo = new Set(tituloNorm.split(/\s+/).filter((w) => w.length >= 3));
  const algumLead = nomesDeLeads.some((nome) =>
    normalizarTexto(nome).split(/\s+/).some((w) => w.length >= 3 && palavrasTitulo.has(w)),
  );
  if (algumLead) return 'empresa';

  // 2) palavra-chave doméstica/pessoal no título → pessoal.
  if (PALAVRAS_PESSOAL.some((p) => tituloNorm.includes(p))) return 'pessoal';

  // 3) fallback: dia útil (seg-sex) e horário comercial 08:00–18:59 → empresa;
  // fora disso (noite, madrugada, fim de semana) → pessoal.
  const { weekday, hour } = partsEmSaoPaulo(inicioISO);
  const diaUtil = weekday >= 1 && weekday <= 5;
  const horarioComercial = hour >= 8 && hour < 19;
  return diaUtil && horarioComercial ? 'empresa' : 'pessoal';
}
