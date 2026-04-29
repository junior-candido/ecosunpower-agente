import { google, calendar_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

export interface CreateEventInput {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  timezone?: string;
  attendeeEmails?: string[];
  attendeeName?: string;
  location?: string;
  // Lembretes customizados. Se omitido, usa default popup 30min + email 60min.
  // Lista vazia [] desativa todos lembretes. Cada item: minutos antes do evento.
  reminders?: Array<{ method: 'popup' | 'email'; minutes: number }>;
}

export interface CreateEventResult {
  eventId: string;
  htmlLink: string;
}

export class CalendarService {
  private oauth: OAuth2Client;
  private calendar: calendar_v3.Calendar;
  private calendarId: string;
  private defaultTimezone: string;

  constructor(opts: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    calendarId: string;
    timezone?: string;
  }) {
    this.oauth = new google.auth.OAuth2(opts.clientId, opts.clientSecret);
    this.oauth.setCredentials({ refresh_token: opts.refreshToken });
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth });
    this.calendarId = opts.calendarId;
    this.defaultTimezone = opts.timezone ?? 'America/Sao_Paulo';
  }

  async isAvailable(startISO: string, endISO: string): Promise<boolean> {
    const res = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: startISO,
        timeMax: endISO,
        timeZone: this.defaultTimezone,
        items: [{ id: this.calendarId }],
      },
    });
    const busy = res.data.calendars?.[this.calendarId]?.busy ?? [];
    return busy.length === 0;
  }

  async createEvent(input: CreateEventInput & { withMeet?: boolean; colorId?: string }): Promise<CreateEventResult & { meetLink?: string }> {
    const attendees = (input.attendeeEmails ?? [])
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      .map((email) => ({
        email,
        displayName: input.attendeeName,
        responseStatus: 'needsAction' as const,
      }));

    const requestBody: calendar_v3.Schema$Event = {
      summary: input.summary,
      description: input.description,
      location: input.location,
      start: { dateTime: input.startISO, timeZone: input.timezone ?? this.defaultTimezone },
      end: { dateTime: input.endISO, timeZone: input.timezone ?? this.defaultTimezone },
      attendees: attendees.length > 0 ? attendees : undefined,
      colorId: input.colorId,
      reminders: {
        useDefault: false,
        overrides: input.reminders ?? [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 60 },
        ],
      },
    };

    // Adiciona Google Meet ao evento se solicitado
    if (input.withMeet) {
      requestBody.conferenceData = {
        createRequest: {
          requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const res = await this.calendar.events.insert({
      calendarId: this.calendarId,
      sendUpdates: attendees.length > 0 ? 'all' : 'none',
      conferenceDataVersion: input.withMeet ? 1 : 0,
      requestBody,
    });

    const meetLink = res.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri ?? undefined;

    return {
      eventId: res.data.id ?? '',
      htmlLink: res.data.htmlLink ?? '',
      meetLink,
    };
  }

  // Lista eventos do calendar entre 2 datas (ISO). Limita a 20 por padrao.
  async listEvents(startISO: string, endISO: string, max = 20): Promise<Array<{
    id: string;
    summary: string;
    startISO: string;
    endISO: string;
    location?: string;
    description?: string;
    meetLink?: string;
    htmlLink?: string;
  }>> {
    const res = await this.calendar.events.list({
      calendarId: this.calendarId,
      timeMin: startISO,
      timeMax: endISO,
      maxResults: max,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return (res.data.items ?? []).map(e => ({
      id: e.id ?? '',
      summary: e.summary ?? '(sem título)',
      startISO: e.start?.dateTime ?? e.start?.date ?? '',
      endISO: e.end?.dateTime ?? e.end?.date ?? '',
      location: e.location ?? undefined,
      description: e.description ?? undefined,
      meetLink: e.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri ?? undefined,
      htmlLink: e.htmlLink ?? undefined,
    }));
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.calendar.events.delete({
      calendarId: this.calendarId,
      eventId,
      sendUpdates: 'all',
    });
  }

  // Atualiza campos de um evento existente. Usa events.patch (partial update),
  // entao so altera os campos passados — nao zera os outros.
  async updateEvent(
    eventId: string,
    updates: Partial<CreateEventInput>,
  ): Promise<{ eventId: string; htmlLink: string }> {
    const requestBody: calendar_v3.Schema$Event = {};

    if (updates.summary !== undefined) requestBody.summary = updates.summary;
    if (updates.description !== undefined) requestBody.description = updates.description;
    if (updates.location !== undefined) requestBody.location = updates.location;
    if (updates.startISO) {
      requestBody.start = { dateTime: updates.startISO, timeZone: updates.timezone ?? this.defaultTimezone };
    }
    if (updates.endISO) {
      requestBody.end = { dateTime: updates.endISO, timeZone: updates.timezone ?? this.defaultTimezone };
    }
    if (updates.reminders !== undefined) {
      requestBody.reminders = {
        useDefault: false,
        overrides: updates.reminders,
      };
    }

    const res = await this.calendar.events.patch({
      calendarId: this.calendarId,
      eventId,
      sendUpdates: 'all',
      requestBody,
    });

    return {
      eventId: res.data.id ?? '',
      htmlLink: res.data.htmlLink ?? '',
    };
  }

  // Busca slots livres no periodo, considerando duracao e horario comercial.
  // Default: 8h-18h, segunda-sexta. Retorna ate 5 sugestoes.
  async findFreeSlots(
    startISO: string,
    endISO: string,
    durationMinutes: number,
    opts?: { startHour?: number; endHour?: number; excludeWeekends?: boolean; max?: number },
  ): Promise<Array<{ startISO: string; endISO: string }>> {
    const startHour = opts?.startHour ?? 8;
    const endHour = opts?.endHour ?? 18;
    const excludeWeekends = opts?.excludeWeekends ?? true;
    const max = opts?.max ?? 5;

    // Pega eventos existentes pra evitar conflito
    const events = await this.listEvents(startISO, endISO, 100);
    const busyRanges = events.map(e => ({
      start: new Date(e.startISO).getTime(),
      end: new Date(e.endISO).getTime(),
    }));

    const slots: Array<{ startISO: string; endISO: string }> = [];
    const periodStart = new Date(startISO);
    const periodEnd = new Date(endISO);
    const stepMinutes = 30;

    const cursor = new Date(periodStart);
    while (cursor < periodEnd && slots.length < max) {
      const dayOfWeek = cursor.getDay();
      const hour = cursor.getHours();

      // Pula fim de semana se solicitado
      if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(startHour, 0, 0, 0);
        continue;
      }

      // Pula horas fora do comercial
      if (hour < startHour) {
        cursor.setHours(startHour, 0, 0, 0);
        continue;
      }
      if (hour >= endHour) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(startHour, 0, 0, 0);
        continue;
      }

      const slotStart = cursor.getTime();
      const slotEnd = slotStart + durationMinutes * 60 * 1000;

      // Slot precisa terminar antes do horario comercial fechar
      const dayEnd = new Date(cursor);
      dayEnd.setHours(endHour, 0, 0, 0);
      if (slotEnd > dayEnd.getTime()) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(startHour, 0, 0, 0);
        continue;
      }

      // Verifica conflito
      const conflict = busyRanges.some(b => slotStart < b.end && slotEnd > b.start);
      if (!conflict) {
        slots.push({
          startISO: new Date(slotStart).toISOString(),
          endISO: new Date(slotEnd).toISOString(),
        });
      }

      cursor.setTime(slotStart + stepMinutes * 60 * 1000);
    }

    return slots;
  }
}
