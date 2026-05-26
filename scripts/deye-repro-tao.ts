/**
 * deye-repro-tao.ts
 *
 * Reproducao ao vivo do 403 em /v1.0/station/history pra responder o
 * Tao Hong (Deye Cloud Platform Developer), que pediu o REQUEST BODY +
 * o TOKEN da chamada de historico pra rastrear no servidor deles.
 *
 * O que faz:
 *   1. Le as credenciais Deye do banco (tabela sistemas_clientes,
 *      marca_inversor='deye') — NUNCA imprime appSecret/password.
 *   2. Gera um token FRESCO via /v1.0/account/token (mesma logica do adapter).
 *   3. Chama /v1.0/station/history pra:
 *        - stationId 166879  -> FALHA 403 (requestId ja enviado: c255e03087d9b4e7)
 *        - stationId 11206   -> OK (planta Personal do Gabriel, contraste)
 *   4. Imprime o bloco pronto pra colar no email do Tao Hong:
 *        token completo + body exato + resposta + requestId.
 *
 * Rodar:
 *   cd Documents/ecosunpower-agente
 *   npx tsx scripts/deye-repro-tao.ts
 *
 * Seguranca: o token impresso eh efemero (emitido pela propria Deye, ~30d)
 * e vai SO pro suporte Deye no mesmo thread de email. appSecret e password
 * nunca sao impressos.
 */

import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const STATION_FAIL = 166879; // 403 — requestId ja rastreado: c255e03087d9b4e7
const STATION_OK = 11206; // Personal (Gabriel Coelho) — funciona, contraste
const START_AT = '2026-05-05';
const END_AT = '2026-05-13';
const GRANULARITY = 2; // 2 = day (kWh diario)

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

function baseUrl(dataCenter: string): string {
  return `https://${dataCenter}-developer.deyecloud.com`;
}

async function main() {
  // 1. Credenciais Deye do banco (qualquer planta deye serve — a CONTA eh a mesma)
  const { data, error } = await supabase
    .from('sistemas_clientes')
    .select('api_credentials')
    .eq('marca_inversor', 'deye')
    .limit(1)
    .single();

  if (error || !data?.api_credentials) {
    console.error('ERRO: nao achei credenciais deye em sistemas_clientes:', error?.message);
    process.exit(1);
  }

  const c = data.api_credentials as Record<string, string>;
  const appId = String(c.appId ?? '').trim();
  const appSecret = String(c.appSecret ?? '').trim();
  const email = String(c.email ?? '').trim();
  const password = String(c.password ?? '').trim();
  const dataCenter = String(c.dataCenter ?? 'us1').trim().toLowerCase();

  if (!appId || !appSecret || !email || !password) {
    console.error('ERRO: credenciais incompletas no banco.');
    process.exit(1);
  }

  const base = baseUrl(dataCenter);

  // 2. Token fresco — mesma logica EXATA do adapter (SHA-256 no password)
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  const tokenUrl = `${base}/v1.0/account/token?appId=${encodeURIComponent(appId)}`;
  const tokenBody = { appSecret, email, password: passwordHash };

  const tokenResp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: new URL(base).host },
    body: JSON.stringify(tokenBody),
  });
  const tokenJson: any = await tokenResp.json().catch(() => ({}));
  let token: string = tokenJson.accessToken ?? tokenJson.access_token ?? tokenJson.Bearer ?? '';
  token = token.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    console.error('ERRO: nao obteve token. Resposta:', JSON.stringify(tokenJson).slice(0, 300));
    process.exit(1);
  }

  // 3. Helper pra chamar /station/history e imprimir tudo
  async function callHistory(stationId: number, rotulo: string) {
    const historyUrl = `${base}/v1.0/station/history`;
    const historyBody = { stationId, startAt: START_AT, endAt: END_AT, granularity: GRANULARITY };

    const resp = await fetch(historyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(historyBody),
    });
    const text = await resp.text();

    console.log('\n================================================================');
    console.log(`  ${rotulo}  (stationId ${stationId})`);
    console.log('================================================================');
    console.log(`Endpoint:        POST ${historyUrl}`);
    console.log(`Request headers: Content-Type: application/json`);
    console.log(`                 Authorization: Bearer <token below>`);
    console.log(`Request body:    ${JSON.stringify(historyBody)}`);
    console.log(`HTTP status:     ${resp.status}`);
    console.log(`Response body:   ${text}`);
  }

  // 4. Bloco pronto pro email
  console.log('\n################################################################');
  console.log('#  COLAR ESTE BLOCO NA RESPOSTA PRO TAO HONG                    #');
  console.log('################################################################');
  console.log(`\nApp ID:        ${appId}`);
  console.log(`Auth endpoint: POST ${base}/v1.0/account/token?appId=${appId}`);
  console.log(`Auth body:     {"appSecret":"<hidden>","email":"${email}","password":"<sha-256 hex>"}`);
  console.log(`\n--- ACCESS TOKEN (fresh, issued just now, ~30d validity) ---`);
  console.log(token);

  await callHistory(STATION_FAIL, 'FAILING CALL — returns 403');
  await callHistory(STATION_OK, 'WORKING CALL — same App, same token, different station');

  console.log('\n################################################################');
  console.log('#  FIM DO BLOCO                                                 #');
  console.log('################################################################\n');
}

main().catch((e) => {
  console.error('Falha:', e);
  process.exit(1);
});
