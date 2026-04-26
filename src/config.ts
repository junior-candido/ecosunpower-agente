import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['production', 'sandbox']).default('production'),
  evolutionApiUrl: z.string().url(),
  evolutionApiKey: z.string().min(1),
  evolutionInstance: z.string().min(1),
  webhookToken: z.string().min(1),
  anthropicApiKey: z.string().min(1),
  supabaseUrl: z.string().url(),
  supabaseServiceKey: z.string().min(1),
  redisHost: z.string().default('127.0.0.1'),
  redisPort: z.coerce.number().default(6379),
  redisPassword: z.string().optional(),
  openaiApiKey: z.string().optional(),
  engineerPhone: z.string().min(1),
  engineerName: z.string().min(1),
  // Numero do WhatsApp do NEGOCIO (onde Eva opera, clientes mandam msg).
  // Diferente de engineerPhone (pessoal do Junior pra notificacoes internas).
  // Se nao setado, fallback pra engineerPhone por compat.
  businessPhone: z.string().optional(),
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
  googleRefreshToken: z.string().optional(),
  googleCalendarId: z.string().optional(),
  timezone: z.string().default('America/Sao_Paulo'),
  metaAccessToken: z.string().optional(),
  metaFacebookPageId: z.string().optional(),
  metaInstagramBusinessId: z.string().optional(),
  metaAppSecret: z.string().optional(),     // pra HMAC do webhook Lead Ads
  metaVerifyToken: z.string().optional(),   // pro challenge do subscribe
  // WhatsApp Business Cloud API (WABA) — substitui Evolution API gradualmente
  metaWabaPhoneNumberId: z.string().optional(),       // ID do numero WABA (fornecido pela Meta)
  metaWabaAccessToken: z.string().optional(),         // token de longa duracao (system user)
  metaWabaBusinessAccountId: z.string().optional(),   // WABA account ID (pra listar templates)
  metaWabaVerifyToken: z.string().optional(),         // challenge do subscribe do webhook WABA
  useWabaCloudApi: z.coerce.boolean().default(false), // flag: quando true, usa WABA; quando false, usa Evolution
  replicateApiToken: z.string().optional(),
  tavusApiKey: z.string().optional(),
  tavusApiUrl: z.string().url().default('https://tavusapi.com'),
  tavusReplicaId: z.string().optional(),
  // Blog auto-publisher: GitHub PAT pra commitar drafts aprovados no repo do site
  githubPat: z.string().optional(),
  githubSiteRepo: z.string().default('junior-candido/ecosunpower-site'),
  githubSiteBranch: z.string().default('main'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    evolutionApiUrl: process.env.EVOLUTION_API_URL,
    evolutionApiKey: process.env.EVOLUTION_API_KEY,
    evolutionInstance: process.env.EVOLUTION_INSTANCE,
    webhookToken: process.env.WEBHOOK_TOKEN,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    redisHost: process.env.REDIS_HOST,
    redisPort: process.env.REDIS_PORT,
    redisPassword: process.env.REDIS_PASSWORD || undefined,
    openaiApiKey: process.env.OPENAI_API_KEY || undefined,
    engineerPhone: process.env.ENGINEER_PHONE,
    engineerName: process.env.ENGINEER_NAME,
    businessPhone: process.env.BUSINESS_PHONE || undefined,
    googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || undefined,
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || undefined,
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || undefined,
    timezone: process.env.TIMEZONE,
    metaAccessToken: process.env.META_ACCESS_TOKEN || undefined,
    metaFacebookPageId: process.env.META_FACEBOOK_PAGE_ID || undefined,
    metaInstagramBusinessId: process.env.META_INSTAGRAM_BUSINESS_ID || undefined,
    metaAppSecret: process.env.META_APP_SECRET || undefined,
    metaVerifyToken: process.env.META_VERIFY_TOKEN || undefined,
    metaWabaPhoneNumberId: process.env.META_WABA_PHONE_NUMBER_ID || undefined,
    metaWabaAccessToken: process.env.META_WABA_ACCESS_TOKEN || undefined,
    metaWabaBusinessAccountId: process.env.META_WABA_BUSINESS_ACCOUNT_ID || undefined,
    metaWabaVerifyToken: process.env.META_WABA_VERIFY_TOKEN || undefined,
    useWabaCloudApi: process.env.USE_WABA_CLOUD_API,
    replicateApiToken: process.env.REPLICATE_API_TOKEN || undefined,
    tavusApiKey: process.env.TAVUS_API_KEY || undefined,
    tavusApiUrl: process.env.TAVUS_API_URL,
    tavusReplicaId: process.env.TAVUS_REPLICA_ID || undefined,
    githubPat: process.env.GITHUB_PAT || undefined,
    githubSiteRepo: process.env.GITHUB_SITE_REPO || 'junior-candido/ecosunpower-site',
    githubSiteBranch: process.env.GITHUB_SITE_BRANCH || 'main',
  });
}
