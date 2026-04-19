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

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const attendees = (input.attendeeEmails ?? [])
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      .map((email) => ({
        email,
        displayName: input.attendeeName,
        responseStatus: 'needsAction' as const,
      }));

    const res = await this.calendar.events.insert({
      calendarId: this.calendarId,
      sendUpdates: attendees.length > 0 ? 'all' : 'none',
      requestBody: {
        summary: input.summary,
        description: input.description,
        start: { dateTime: input.startISO, timeZone: input.timezone ?? this.defaultTimezone },
        end: { dateTime: input.endISO, timeZone: input.timezone ?? this.defaultTimezone },
        attendees: attendees.length > 0 ? attendees : undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'email', minutes: 60 },
          ],
        },
      },
    });
    return {
      eventId: res.data.id ?? '',
      htmlLink: res.data.htmlLink ?? '',
    };
  }
}
