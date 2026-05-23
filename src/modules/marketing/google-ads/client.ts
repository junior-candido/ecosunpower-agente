/**
 * Google Ads OAuth helper.
 * Troca refresh_token por access_token via Google OAuth2 endpoint.
 * Cache em memória: token é reusado por até 50 minutos (Google retorna expires_in=3599).
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutos

interface TokenCache {
  accessToken: string;
  fetchedAt: number; // Date.now()
}

let _cache: TokenCache | null = null;

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * Retorna um access_token válido do Google Ads.
 * Usa cache em módulo: se token cached < 50min, reusa. Senão pede novo.
 *
 * Lê env vars:
 *  - GOOGLE_ADS_CLIENT_ID
 *  - GOOGLE_ADS_CLIENT_SECRET
 *  - GOOGLE_ADS_REFRESH_TOKEN
 */
export async function getGoogleAdsAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId) throw new Error('[google-ads-client] env GOOGLE_ADS_CLIENT_ID nao definida');
  if (!clientSecret) throw new Error('[google-ads-client] env GOOGLE_ADS_CLIENT_SECRET nao definida');
  if (!refreshToken) throw new Error('[google-ads-client] env GOOGLE_ADS_REFRESH_TOKEN nao definida');

  // Reusa cache se ainda valido
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await response.json()) as TokenResponse;

  if (!response.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? `HTTP ${response.status}`;
    throw new Error(`[google-ads-client] falha ao obter access_token: ${detail}`);
  }

  _cache = {
    accessToken: json.access_token,
    fetchedAt: Date.now(),
  };

  return _cache.accessToken;
}
