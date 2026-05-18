/**
 * deye-diag-orginfo.ts  — DIAGNÓSTICO READ-ONLY (não altera nada)
 *
 * Pergunta única que isto responde:
 *   "A conta Deye da Ecosunpower consegue obter um token org-scoped
 *    (organizationId != 0) via o fluxo Business Member documentado?"
 *
 * Passos:
 *   1. Token PESSOAL (sem companyId)  -> decodifica JWT -> mostra organizationId
 *   2. POST /v1.0/account/info com esse token -> imprime RESPOSTA CRUA
 *      (precisamos ver os nomes reais dos campos + se a org Ecosunpower
 *       aparece com companyId/role)
 *   3. Pra CADA companyId encontrado: re-pede token COM companyId ->
 *      decodifica JWT -> organizationId mudou de 0?
 *   4. Se conseguiu token org-scoped: testa /station/history na 166879
 *      (a planta que hoje dá 403) -> 200 = PROBLEMA RESOLVIDO.
 *
 * Não imprime appSecret nem password. Tokens só truncados.
 * Rodar:  cd Documents/ecosunpower-agente && npx tsx scripts/deye-diag-orginfo.ts
 */

import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const STATION_403 = 166879; // planta Ecosunpower que hoje dá 403
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

function decodeJwtDetail(token: string): unknown {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const obj = JSON.parse(json);
    // memory: claim `detail` vem como objeto {organizationId,roleId,userId,...}
    let detail = obj.detail ?? obj;
    if (typeof detail === 'string') {
      try { detail = JSON.parse(detail); } catch { /* deixa string */ }
    }
    return detail;
  } catch (e) {
    return `(falha ao decodificar JWT: ${(e as Error).message})`;
  }
}

async function getToken(
  base: string, appId: string, appSecret: string, email: string,
  passwordHash: string, companyId?: number,
): Promise<{ token?: string; raw: any; status: number }> {
  const body: Record<string, unknown> = { appSecret, email, password: passwordHash };
  if (companyId !== undefined) body.companyId = companyId;
  const resp = await fetch(`${base}/v1.0/account/token?appId=${encodeURIComponent(appId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', host: new URL(base).host },
    body: JSON.stringify(body),
  });
  const raw = await resp.json().catch(() => ({}));
  let token: string | undefined = raw.accessToken ?? raw.access_token ?? raw.Bearer;
  if (token) token = token.replace(/^Bearer\s+/i, '').trim();
  return { token, raw, status: resp.status };
}

async function main() {
  const { data, error } = await supabase
    .from('sistemas_clientes')
    .select('api_credentials')
    .eq('marca_inversor', 'deye')
    .limit(1)
    .single();
  if (error || !data?.api_credentials) {
    console.error('ERRO: sem credenciais deye no banco:', error?.message);
    process.exit(1);
  }
  const c = data.api_credentials as Record<string, string>;
  const appId = String(c.appId ?? '').trim();
  const appSecret = String(c.appSecret ?? '').trim();
  const email = String(c.email ?? '').trim();
  const password = String(c.password ?? '').trim();
  const dataCenter = String(c.dataCenter ?? 'us1').trim().toLowerCase();
  const base = `https://${dataCenter}-developer.deyecloud.com`;
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  console.log('================ DEYE DIAG ================');
  console.log(`Conta: ${email}  | appId: ${appId}  | DC: ${dataCenter}`);

  // ---- 1. Token PESSOAL ----
  const t1 = await getToken(base, appId, appSecret, email, passwordHash);
  console.log(`\n[1] Token PESSOAL (sem companyId)  HTTP ${t1.status}`);
  if (!t1.token) {
    console.log('    Resposta crua:', JSON.stringify(t1.raw).slice(0, 400));
    process.exit(1);
  }
  console.log('    JWT detail =', JSON.stringify(decodeJwtDetail(t1.token)));

  // ---- 2. /account/info CRU ----
  const infoResp = await fetch(`${base}/v1.0/account/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t1.token}` },
    body: JSON.stringify({}),
  });
  const infoRaw = await infoResp.json().catch(() => ({}));
  console.log(`\n[2] POST /v1.0/account/info  HTTP ${infoResp.status}`);
  console.log('    RESPOSTA CRUA (esta é a evidência-chave):');
  console.log(JSON.stringify(infoRaw, null, 2));

  // Tenta achar companyIds em qualquer formato (orgInfoList / companyList / etc.)
  const candidates: Array<{ companyId: number; label: string }> = [];
  const scan = (arr: any, listName: string) => {
    if (!Array.isArray(arr)) return;
    for (const o of arr) {
      const id = o?.companyId ?? o?.organizationId ?? o?.orgId;
      if (id !== undefined && id !== null && Number(id) !== 0) {
        candidates.push({
          companyId: Number(id),
          label: `${listName}: ${o?.companyName ?? o?.orgName ?? '?'} / role=${o?.roleName ?? o?.role ?? '?'}`,
        });
      }
    }
  };
  scan(infoRaw?.orgInfoList, 'orgInfoList');
  scan(infoRaw?.companyList, 'companyList');
  scan(infoRaw?.organizationList, 'organizationList');
  scan(infoRaw?.data?.orgInfoList, 'data.orgInfoList');

  if (candidates.length === 0) {
    console.log('\n>>> CONCLUSÃO: /account/info NÃO retornou nenhum companyId/org.');
    console.log('>>> Isto indica conta SEM vínculo de organização (não é Business Member).');
    console.log('>>> Hipótese A confirmada: problema de REGISTRO DE CONTA, não de código.');
    process.exit(0);
  }

  // ---- 3. Token COM cada companyId ----
  console.log(`\n[3] ${candidates.length} companyId encontrado(s). Testando token org-scoped:`);
  let orgToken: string | undefined;
  for (const cand of candidates) {
    const t2 = await getToken(base, appId, appSecret, email, passwordHash, cand.companyId);
    const detail = decodeJwtDetail(t2.token ?? '');
    const orgId = (detail as any)?.organizationId;
    console.log(`\n  companyId=${cand.companyId} (${cand.label})  HTTP ${t2.status}`);
    console.log(`    JWT detail = ${JSON.stringify(detail)}`);
    if (t2.token && orgId !== undefined && Number(orgId) !== 0) {
      console.log(`    >>> organizationId = ${orgId}  (NÃO é 0 — TOKEN ORG-SCOPED OK!)`);
      orgToken = t2.token;
      break;
    } else {
      console.log(`    >>> organizationId ainda = ${orgId ?? '?'}  (não destravou)`);
    }
  }

  if (!orgToken) {
    console.log('\n>>> CONCLUSÃO: companyId existe mas token continua organizationId:0.');
    console.log('>>> Fluxo documentado não basta -> pergunta cirúrgica pro Tao Hong.');
    process.exit(0);
  }

  // ---- 4. Testa a planta que hoje dá 403 ----
  const hist = await fetch(`${base}/v1.0/station/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgToken}` },
    body: JSON.stringify({ stationId: STATION_403, startAt: '2026-05-05', endAt: '2026-05-13', granularity: 2 }),
  });
  const histText = await hist.text();
  console.log(`\n[4] /station/history station ${STATION_403} com token ORG-SCOPED  HTTP ${hist.status}`);
  console.log('    Resposta:', histText.slice(0, 500));
  console.log(
    hist.status === 200 && !/2101023|access Denied/i.test(histText)
      ? '\n>>> 🎉 RESOLVIDO: token org-scoped lê a planta que dava 403. Fix é de CÓDIGO.'
      : '\n>>> Token org-scoped obtido mas /history ainda barra -> evidência nova pro Tao.',
  );
}

main().catch((e) => { console.error('Falha:', e); process.exit(1); });
