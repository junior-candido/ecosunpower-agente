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
  });
}
