// One-time script to create the "Ecosunpower - Visitas" calendar
// Run: node scripts/setup-calendar.mjs
// Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in env
// or hardcoded below.

import { google } from 'googleapis';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error('Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN no .env antes de rodar.');
  process.exit(1);
}

const oauth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth.setCredentials({ refresh_token: REFRESH_TOKEN });

const calendar = google.calendar({ version: 'v3', auth: oauth });

async function main() {
  const listRes = await calendar.calendarList.list();
  const existing = listRes.data.items?.find((c) => c.summary === 'Ecosunpower - Visitas');
  if (existing) {
    console.log('\nAgenda ja existe!');
    console.log('GOOGLE_CALENDAR_ID =', existing.id);
    return;
  }

  const res = await calendar.calendars.insert({
    requestBody: {
      summary: 'Ecosunpower - Visitas',
      description: 'Visitas tecnicas agendadas pela Eva (agente WhatsApp).',
      timeZone: 'America/Sao_Paulo',
    },
  });

  console.log('\nAgenda criada com sucesso!');
  console.log('Nome: Ecosunpower - Visitas');
  console.log('GOOGLE_CALENDAR_ID =', res.data.id);
  console.log('\nAdiciona essa variavel no .env / Easypanel.');
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
