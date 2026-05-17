#!/usr/bin/env node
/**
 * Gera o GOOGLE_ADS_REFRESH_TOKEN (uso único, local).
 *
 * NÃO contém segredo nenhum. Lê client_id/client_secret do JSON que você
 * baixou ao criar o cliente OAuth "App para computador" (tipo Desktop).
 *
 * Uso:
 *   node scripts/google-ads-oauth.mjs "C:\\caminho\\para\\client_secret_xxx.json"
 *
 * IMPORTANTE: ao abrir a URL no navegador, esteja logado na conta Google
 * que ACESSA a conta de anúncios Ecosunpower (a do MCC). O refresh token
 * herda o acesso dessa conta.
 *
 * O script imprime o refresh token no terminal. Copie para a env var
 * GOOGLE_ADS_REFRESH_TOKEN no Easypanel. NÃO cole em chat, NÃO commite.
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { URL, URLSearchParams } from 'node:url';

const SCOPE = 'https://www.googleapis.com/auth/adwords';
const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function die(msg) {
  console.error(`\n[erro] ${msg}\n`);
  process.exit(1);
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  die('Passe o caminho do JSON do cliente OAuth.\n' +
      '  node scripts/google-ads-oauth.mjs "C:\\...\\client_secret_xxx.json"');
}

let clientId, clientSecret;
try {
  const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  // JSON de cliente Desktop tem a forma { "installed": { client_id, client_secret, ... } }
  const c = raw.installed ?? raw.web ?? raw;
  clientId = c.client_id;
  clientSecret = c.client_secret;
  if (!clientId || !clientSecret) throw new Error('client_id/client_secret ausentes');
} catch (e) {
  die(`Não consegui ler client_id/client_secret de "${jsonPath}": ${e.message}`);
}

function postToken(params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req = https.request(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (res.statusCode !== 200) reject(new Error(`${res.statusCode}: ${data}`));
          else resolve(j);
        } catch { reject(new Error(`resposta inválida: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Sobe um servidor loopback efêmero (fluxo "installed app" do Desktop client).
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  const finish = (html) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  };
  if (err) {
    finish(`<h2>Erro na autorizacao: ${err}</h2><p>Pode fechar esta aba.</p>`);
    die(`Autorização negada/erro: ${err}`);
    return;
  }
  if (!code) { res.writeHead(400); res.end('sem code'); return; }
  try {
    const tok = await postToken({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    finish('<h2>Pronto! ✅</h2><p>Pode fechar esta aba e voltar pro terminal.</p>');
    server.close();
    if (!tok.refresh_token) {
      die('O Google NÃO retornou refresh_token. Refaça: revogue o acesso em ' +
          'myaccount.google.com/permissions e rode de novo (o script já força prompt=consent).');
    }
    console.log('\n==================================================');
    console.log(' GOOGLE_ADS_REFRESH_TOKEN (copie para a env var):');
    console.log('==================================================\n');
    console.log(tok.refresh_token);
    console.log('\n==================================================');
    console.log(' -> Cole no Easypanel (serviço agente-whatsapp) como');
    console.log('    GOOGLE_ADS_REFRESH_TOKEN. NÃO cole em chat, NÃO commite.');
    console.log('    Depois apague o JSON do cliente da pasta local.');
    console.log('==================================================\n');
    process.exit(0);
  } catch (e) {
    finish(`<h2>Falhou na troca do code: ${e.message}</h2>`);
    die(`Falha ao trocar code por token: ${e.message}`);
  }
});

let redirectUri;
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  redirectUri = `http://127.0.0.1:${port}`;
  const authUrl = `${AUTH_BASE}?` + new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  }).toString();
  console.log('\n1) Abra ESTA URL no navegador LOGADO na conta Google que');
  console.log('   acessa a conta de anúncios Ecosunpower (a do MCC):\n');
  console.log(authUrl);
  console.log('\n2) Autorize (pode aparecer aviso "app não verificado" ->');
  console.log('   "Avançado" -> "Acessar ...(não seguro)" -> Permitir). É a sua conta, ok.');
  console.log('\n3) Volte aqui — o refresh token aparece automaticamente.\n');
  console.log('(aguardando autorização... Ctrl+C cancela)\n');
});

setTimeout(() => die('Tempo esgotado (10 min) sem autorização.'), 10 * 60 * 1000);
