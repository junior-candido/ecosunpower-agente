// One-time script to get a Google refresh token via OAuth 2.0
// Run: node scripts/get-refresh-token.mjs
// It will open a browser, ask you to authorize, and print the refresh token.

import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import { exec } from 'child_process';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env antes de rodar.');
  process.exit(1);
}
const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n================================================================');
console.log('  AUTORIZAR ACESSO AO GOOGLE CALENDAR');
console.log('================================================================\n');
console.log('Se o navegador nao abrir automaticamente, cole este link nele:\n');
console.log(authUrl);
console.log('\nAguardando autorizacao...\n');

const openCmd = process.platform === 'win32'
  ? `start "" "${authUrl}"`
  : process.platform === 'darwin' ? `open "${authUrl}"` : `xdg-open "${authUrl}"`;
exec(openCmd);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404);
      res.end();
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Faltou o codigo. Tenta de novo.');
      return;
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><body style="font-family:sans-serif;padding:40px">
      <h2>Autorizado com sucesso!</h2>
      <p>Pode fechar esta aba e voltar para o terminal.</p>
    </body></html>`);

    console.log('\n================================================================');
    console.log('  SUCESSO!');
    console.log('================================================================\n');
    if (tokens.refresh_token) {
      console.log('REFRESH TOKEN (guarde como GOOGLE_REFRESH_TOKEN no .env do Easypanel):\n');
      console.log(tokens.refresh_token);
      console.log('\n================================================================\n');
    } else {
      console.log('ERRO: nao veio refresh_token. Tenta revogar o acesso em');
      console.log('https://myaccount.google.com/permissions e rodar de novo.');
    }

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 1000);
  } catch (err) {
    console.error('Erro:', err.message);
    res.writeHead(500);
    res.end('Erro: ' + err.message);
    setTimeout(() => process.exit(1), 1000);
  }
});

server.listen(PORT, () => {
  console.log(`Servidor escutando em http://localhost:${PORT}`);
});
