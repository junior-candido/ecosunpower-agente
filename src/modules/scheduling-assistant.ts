import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { CalendarService } from './calendar.js';

const IORedis = (Redis as any).default ?? Redis;

const SCHEDULING_MODE_TTL_SECONDS = 60 * 60;

interface SchedulingMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CalendarAction {
  type: 'create_event' | 'list_events' | 'delete_event' | 'find_slots';
  summary?: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
  withMeet?: boolean;
  colorId?: string;
  eventId?: string;
  durationMinutes?: number;
}

function buildSystemPrompt(agendamentoKnowledge: string): string {
  // Inclui a data/hora atual pro Claude resolver "amanha", "sexta", etc corretamente
  const nowISO = new Date().toISOString();
  return `Você é a Eva, assistente de agendamento da EcoSunPower. Está conversando com Junior (engenheiro proprietário) pra gerenciar a agenda da empresa via Google Calendar.

DATA/HORA ATUAL (BRT): ${nowISO}
TIMEZONE: America/Sao_Paulo (-03:00)

# KNOWLEDGE: AGENDAMENTO

${agendamentoKnowledge}

# REGRAS CRÍTICAS DE QUANDO USAR <action>

REGRA-OURO: Só inclua \`<action>\` no retorno quando você QUER que o código execute AGORA.

1. **list_events e find_slots:** retorne \`<action>\` imediatamente (são leitura, não destrutivo). Sem confirmação necessária.

2. **create_event e delete_event:** PRIMEIRA mensagem só descreve em texto e pergunta "Confirma?" SEM incluir \`<action>\`. Espera Junior responder "sim", "ok", "pode", "manda", "confirmo". SÓ NESSA SEGUNDA mensagem você inclui \`<action>\` pra criar/deletar.

3. Resolva datas relativas ("amanhã", "sexta", "próxima terça") usando a data atual (BRT). Sempre formato ISO 8601 com offset -03:00.

4. Para Meet (online), defina withMeet=true e colorId="5". Duração padrão 30min.
   Para visita técnica, withMeet=false e colorId="6". Duração padrão 2h.
   Para instalação, colorId="7", duração 8h.

5. Se faltar informação (ex: nome cliente, endereço), pergunte de forma curta SEM \`<action>\`.

6. Use formatação WhatsApp: emojis, separadores, linhas curtas.

7. /sair ou "sair" → responda apenas "👍 Saiu do modo agendamento."

# EXEMPLO DE FLUXO CRIAR EVENTO (DOIS PASSOS)

Junior: "agenda meet Marcos amanhã 14h"
Você (passo 1, SEM action, descreve e pergunta):
"📅 Vou criar:
🗓️ Amanhã 29/04 (terça) 14h-14:30
📹 Reunião Meet — Marcos
👤 Com link Google Meet automático

Confirma?"

Junior: "sim"
Você (passo 2, AGORA com action):
"<action>{...}</action>

⏳ Criando evento..."

(Código executa e adiciona o resultado depois)

# AÇÕES DISPONÍVEIS

## create_event
\`\`\`json
{"type":"create_event","summary":"Visita Marcos","start":"2026-04-29T14:00:00-03:00","end":"2026-04-29T16:00:00-03:00","location":"...","description":"...","withMeet":false,"colorId":"6"}
\`\`\`

## list_events
\`\`\`json
{"type":"list_events","start":"2026-04-29T00:00:00-03:00","end":"2026-04-29T23:59:59-03:00"}
\`\`\`

## delete_event
\`\`\`json
{"type":"delete_event","eventId":"abc123"}
\`\`\`

## find_slots
\`\`\`json
{"type":"find_slots","start":"2026-05-01T00:00:00-03:00","end":"2026-05-01T23:59:59-03:00","durationMinutes":120}
\`\`\`

# CASOS DE USO COMUNS

- "agenda meet com Marcos amanhã 14h" → create_event withMeet=true, 30min
- "agenda visita Marcos amanhã 14h Lago Sul" → create_event withMeet=false, 2h
- "agenda hoje" → list_events do dia atual
- "agenda semana" → list_events próximos 7 dias
- "cancela visita do Marcos" → primeiro list_events pra achar id, depois delete_event
- "agenda livre quinta tarde" → find_slots quinta 13h-18h, duração 120min`;
}

export class SchedulingAssistant {
  private client: Anthropic;
  private redis: any;
  private calendar: CalendarService;
  private knowledgePath: string;

  constructor(
    apiKey: string,
    redisHost: string,
    redisPort: number,
    redisPassword: string | undefined,
    knowledgeBaseDir: string,
    calendar: CalendarService,
  ) {
    this.client = new Anthropic({ apiKey });
    this.redis = new IORedis({ host: redisHost, port: redisPort, password: redisPassword, maxRetriesPerRequest: null });
    this.calendar = calendar;
    this.knowledgePath = join(knowledgeBaseDir, 'agendamento.md');
  }

  static isSchedulingTrigger(text: string): boolean {
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    let norm = stripAccents(text.toLowerCase().trim()).replace(/[^\w\s\/]/g, '').trim();
    if (!norm) return false;

    // Tolera prefixo "eva ", "eva, " no inicio (Junior costuma chamar pelo nome)
    norm = norm.replace(/^eva[\s,]+/, '').trim();

    // Comando barra
    if (/^\/(agenda|agendamento|agendar|marca|marcar)(\s|$)/.test(norm)) return true;

    // Palavras soltas (texto OU áudio transcrito)
    if (['agenda', 'agendamento', 'agendar', 'marcar', 'remarcar', 'agendar visita', 'agendar reuniao', 'agendar meet'].includes(norm)) return true;

    // Inicio com agenda/agendar + qualquer coisa
    if (/^(agenda|agendamento|agendar|marca|marcar|remarcar)(\s|$)/.test(norm)) return true;

    // Verbos no inicio com modal
    if (/^(quero |preciso |vou |me ajuda a |por favor )?(agendar|marcar|remarcar|criar)\s/.test(norm)) return true;

    // "criar evento/reuniao/visita/meet"
    if (/^criar (evento|reuniao|visita|meet|agenda)/.test(norm)) return true;

    return false;
  }

  static isExitTrigger(text: string): boolean {
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = stripAccents(text.toLowerCase().trim()).replace(/[^\w\s\/]/g, '').trim();
    return [
      '/sair', '/exit', '/agenda off',
      'sair', 'fechar', 'parar', 'finalizar', 'encerrar',
      'sair do modo', 'sair da agenda',
    ].includes(norm);
  }

  async isInSchedulingMode(phone: string): Promise<boolean> {
    return (await this.redis.get(`scheduling:${phone}`)) !== null;
  }

  async startSchedulingMode(phone: string, initialMessage?: string): Promise<string> {
    await this.redis.setex(`scheduling:${phone}`, SCHEDULING_MODE_TTL_SECONDS, '1');
    await this.redis.del(`scheduling:history:${phone}`);

    const stripped = (initialMessage ?? '')
      .replace(/^\/(agenda|agendamento|agendar|marca|marcar)\s*/i, '')
      .replace(/^(quero |preciso |vou |me ajuda a )?(agendar|marcar)\s*/i, '')
      .replace(/^(agenda|agendamento)\s*/i, '')
      .trim();

    if (stripped.length > 5) {
      return await this.processSchedulingMessage(phone, stripped);
    }

    return [
      '🗓️ *Modo Agendamento ATIVO*',
      '',
      'Posso te ajudar com:',
      '• Criar Meet ou visita técnica',
      '• Listar agenda (hoje / semana)',
      '• Cancelar ou remarcar',
      '• Buscar horários livres',
      '',
      'Exemplos:',
      '_"agenda meet com Marcos amanhã 14h"_',
      '_"agenda visita João sexta 10h Águas Claras"_',
      '_"agenda hoje"_',
      '_"agenda livre quinta tarde"_',
      '',
      'Pra sair: `/sair`',
    ].join('\n');
  }

  async exitSchedulingMode(phone: string): Promise<void> {
    await this.redis.del(`scheduling:${phone}`);
    await this.redis.del(`scheduling:history:${phone}`);
  }

  async processSchedulingMessage(phone: string, message: string): Promise<string> {
    if (SchedulingAssistant.isExitTrigger(message)) {
      await this.exitSchedulingMode(phone);
      return '👍 Saiu do modo agendamento.';
    }

    const histRaw = await this.redis.get(`scheduling:history:${phone}`);
    const history: SchedulingMessage[] = histRaw ? JSON.parse(histRaw) : [];
    history.push({ role: 'user', content: message });

    // System prompt e construído a cada chamada pra incluir DATA/HORA atual fresh
    // (importante porque "amanhã" muda diariamente). Cache e mantido pelo Anthropic
    // por hash do prefixo, entao knowledge fica em cache mesmo com timestamp variavel.
    const agendamentoKnowledge = readFileSync(this.knowledgePath, 'utf-8');
    const systemPrompt = buildSystemPrompt(agendamentoKnowledge);

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      messages: history,
    });

    const claudeReply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    // Verifica se há action pra executar
    const action = this.parseAction(claudeReply);
    let finalReply = claudeReply;

    if (action) {
      try {
        const actionResult = await this.executeAction(action);
        // Remove o bloco <action> da mensagem que vai pro Junior + concatena resultado
        const cleanedText = claudeReply.replace(/<action>[\s\S]*?<\/action>/, '').trim();
        finalReply = `${cleanedText}\n\n${actionResult}`.trim();
      } catch (err) {
        finalReply = `${claudeReply.replace(/<action>[\s\S]*?<\/action>/, '').trim()}\n\n⚠️ Erro: ${(err as Error).message}`;
      }
    }

    history.push({ role: 'assistant', content: claudeReply });
    const trimmed = history.slice(-20);
    await this.redis.setex(
      `scheduling:history:${phone}`,
      SCHEDULING_MODE_TTL_SECONDS,
      JSON.stringify(trimmed),
    );
    await this.redis.setex(`scheduling:${phone}`, SCHEDULING_MODE_TTL_SECONDS, '1');

    return finalReply;
  }

  private parseAction(text: string): CalendarAction | null {
    const match = text.match(/<action>([\s\S]*?)<\/action>/);
    if (!match) return null;
    try {
      return JSON.parse(match[1].trim()) as CalendarAction;
    } catch {
      return null;
    }
  }

  private async executeAction(action: CalendarAction): Promise<string> {
    switch (action.type) {
      case 'create_event': {
        if (!action.summary || !action.start || !action.end) {
          return '⚠️ Faltam dados pra criar evento (summary/start/end)';
        }
        const result = await this.calendar.createEvent({
          summary: action.summary,
          startISO: action.start,
          endISO: action.end,
          location: action.location,
          description: action.description,
          withMeet: action.withMeet,
          colorId: action.colorId,
        });
        const lines = [`✅ Evento criado!`, `🔗 ${result.htmlLink}`];
        if (result.meetLink) lines.push(`📹 Meet: ${result.meetLink}`);
        return lines.join('\n');
      }

      case 'list_events': {
        if (!action.start || !action.end) return '⚠️ Faltam datas pra listar';
        const events = await this.calendar.listEvents(action.start, action.end);
        if (events.length === 0) return '📅 Sem eventos no período.';
        const formatted = events.map(e => {
          const startD = new Date(e.startISO);
          const day = startD.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
          const time = startD.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
          const meetTag = e.meetLink ? ' 📹' : '';
          const locTag = e.location ? `\n   📍 ${e.location}` : '';
          return `• ${day} ${time} — ${e.summary}${meetTag}${locTag}`;
        }).join('\n');
        return `📅 *Eventos:*\n${formatted}`;
      }

      case 'delete_event': {
        if (!action.eventId) return '⚠️ Falta o eventId pra deletar';
        await this.calendar.deleteEvent(action.eventId);
        return `🗑️ Evento cancelado.`;
      }

      case 'find_slots': {
        if (!action.start || !action.end || !action.durationMinutes) {
          return '⚠️ Faltam dados pra buscar slots (start/end/durationMinutes)';
        }
        const slots = await this.calendar.findFreeSlots(
          action.start,
          action.end,
          action.durationMinutes,
        );
        if (slots.length === 0) return '⚠️ Nenhum horário livre encontrado no período.';
        const formatted = slots.map((s, i) => {
          const startD = new Date(s.startISO);
          const day = startD.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
          const time = startD.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
          return `${i + 1}️⃣ ${day} ${time}`;
        }).join('\n');
        return `⏳ *Horários livres:*\n${formatted}`;
      }

      default:
        return `⚠️ Ação desconhecida: ${action.type}`;
    }
  }
}
