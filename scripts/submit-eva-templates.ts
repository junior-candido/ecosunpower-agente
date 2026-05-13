/**
 * submit-eva-templates.ts
 *
 * Submete os 3 templates novos da Eva (versoes finais decididas com Junior 13/05):
 *   - eva_qualificacao_v1  (UTILITY) — pergunta valor da conta direto, no clique do anuncio
 *   - eva_curiosidade_v1   (UTILITY) — valor antecipado (parcela < conta) pra A/B
 *   - eva_provocativa_v1   (MARKETING) — D+15 ultima cartada com opt-out claro
 *
 * Todos usam apenas {{1}} = primeiro nome do cliente.
 *
 * Uso:
 *   npx tsx scripts/submit-eva-templates.ts          # submete os 3
 *   npx tsx scripts/submit-eva-templates.ts --dry    # mostra payload sem enviar
 *
 * Requer env: META_WABA_BUSINESS_ACCOUNT_ID + META_WABA_ACCESS_TOKEN
 */

import 'dotenv/config';

const GRAPH = 'https://graph.facebook.com/v22.0';

const BUSINESS_ACCOUNT_ID = process.env.META_WABA_BUSINESS_ACCOUNT_ID;
const TOKEN = process.env.META_WABA_ACCESS_TOKEN;
const DRY = process.argv.includes('--dry');

if (!BUSINESS_ACCOUNT_ID || !TOKEN) {
  console.error('Faltando env: META_WABA_BUSINESS_ACCOUNT_ID e/ou META_WABA_ACCESS_TOKEN');
  process.exit(1);
}

interface TemplatePayload {
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING';
  components: Array<{
    type: 'BODY' | 'FOOTER';
    text: string;
    example?: { body_text: string[][] };
  }>;
}

const templates: TemplatePayload[] = [
  {
    name: 'eva_qualificacao_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text:
          'Oi {{1}}! Aqui é a Eva, da EcoSunPower ☀️\n\n' +
          'Pra eu já te mostrar quanto você economizaria com solar e o kit ideal pra sua casa, me passa rapidinho: quanto vem sua conta de luz por mês?',
        example: { body_text: [['Junior']] },
      },
    ],
  },
  {
    name: 'eva_curiosidade_v1',
    language: 'pt_BR',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text:
          '{{1}}, sabia que dá pra trocar a conta de luz por uma parcela MENOR e ficar com o sistema seu pra sempre? Eva aqui, da EcoSunPower ☀️\n\n' +
          'Pra te mostrar quanto fica no seu caso, me responde só uma coisa: sua conta de luz hoje fica em torno de quanto?',
        example: { body_text: [['Junior']] },
      },
    ],
  },
  {
    name: 'eva_provocativa_v1',
    language: 'pt_BR',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text:
          '{{1}}, Eva da EcoSunPower 👋\n\n' +
          'Vou ser honesta: você é o tipo de cliente com perfil pra fechar e ainda não fechou. Algo te travou?\n\n' +
          'Me responde aqui o que falta pra você decidir. Se não tiver mais interesse, manda "Sair" que eu paro de te chamar.',
        example: { body_text: [['Junior']] },
      },
    ],
  },
];

async function submitTemplate(t: TemplatePayload): Promise<void> {
  const url = `${GRAPH}/${BUSINESS_ACCOUNT_ID}/message_templates`;

  console.log(`\n=== ${t.name} (${t.category}) ===`);
  console.log(t.components[0].text);

  if (DRY) {
    console.log('[dry-run] payload completo:');
    console.log(JSON.stringify(t, null, 2));
    return;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(t),
  });
  const data = await res.json() as { id?: string; status?: string; error?: { message: string; code: number } };

  if (!res.ok || data.error) {
    console.error(`❌ FALHOU (${res.status}):`, data.error?.message ?? JSON.stringify(data));
    return;
  }
  console.log(`✅ Submetido. ID=${data.id} status=${data.status ?? 'PENDING'}`);
}

async function main(): Promise<void> {
  console.log(`Business Account ID: ${BUSINESS_ACCOUNT_ID}`);
  console.log(`Modo: ${DRY ? 'DRY-RUN (sem enviar)' : 'SUBMISSÃO REAL'}\n`);

  for (const t of templates) {
    try {
      await submitTemplate(t);
    } catch (err) {
      console.error(`❌ ${t.name} erro:`, (err as Error).message);
    }
  }

  console.log('\n--- Resumo ---');
  console.log('Aprovação Meta: Utility ~1-2h, Marketing ~24h.');
  console.log('Acompanha o status com: npx tsx scripts/list-eva-templates.ts');
  console.log('Ou no Meta Business Manager: WhatsApp Manager > Account tools > Message templates');
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
