import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '../src/config.js';
import { makeClient, embedTexts } from '../src/modules/rag/embeddings.js';
import { ingestAll } from '../src/modules/rag/ingest.js';
import { SupabaseService } from '../src/modules/supabase.js';

const config = loadConfig();
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'conhecimento');

if (!config.openaiApiKey) {
  console.error('[ingest] OPENAI_API_KEY ausente');
  process.exit(1);
}

const client = makeClient(config.openaiApiKey);
const supa = new SupabaseService(config).getClient();
const n = await ingestAll(dir, supa, (t) => embedTexts(t, client));
console.log(`[ingest] ${n} chunks (re)embedados`);
process.exit(0);
