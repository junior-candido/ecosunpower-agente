/**
 * submit-servico-template.ts
 *
 * Submete o template do AVISO DE SERVIÇO pro time de campo (decidido com o
 * Junior 05/08): fora da janela 24h a Cloud API descarta texto livre em
 * silêncio — funcionário quase nunca tem janela aberta com o número da Eva,
 * então o aviso de atribuição vai por template aprovado.
 *
 *   aviso_servico_v1 (UTILITY, pt_BR)
 *   {{1}} tipo do serviço · {{2}} cliente · {{3}} data BR · {{4}} link do guia
 *
 * Uso:
 *   npx tsx scripts/submit-servico-template.ts          # submete
 *   npx tsx scripts/submit-servico-template.ts --dry    # mostra payload sem enviar
 *
 * Requer env: META_WABA_BUSINESS_ACCOUNT_ID + META_WABA_ACCESS_TOKEN
 * (rodar no servidor/console do EasyPanel, onde essas env existem)
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

const template = {
  name: 'aviso_servico_v1',
  language: 'pt_BR',
  category: 'UTILITY' as const,
  components: [
    {
      type: 'BODY' as const,
      // Link NÃO vai no corpo: vai no botão de URL dinâmico (decidido com o
      // Junior 05/08 — e a Meta não aceita variável fechando o corpo).
      text:
        '🔧 Novo serviço pra você: *{{1}}* — cliente *{{2}}*, dia {{3}}.\n' +
        'Toque no botão abaixo pra ver o guia de fotos.',
      example: {
        body_text: [[
          'Instalação FV',
          'Fernanda Almeida',
          '08/08/2026',
        ]],
      },
    },
    {
      type: 'FOOTER' as const,
      text: 'EcoSunPower — Diário de Serviços',
    },
    {
      type: 'BUTTONS' as const,
      buttons: [
        {
          type: 'URL' as const,
          text: 'Guia de fotos e vídeos',   // máx 25 chars da Meta
          url: 'https://propostas.ecosunpower.eng.br/dashboard/servicos/{{1}}',
          example: ['https://propostas.ecosunpower.eng.br/dashboard/servicos/abc123'],
        },
      ],
    },
  ],
};

async function main() {
  console.log(`Template: ${template.name} (${template.category}, ${template.language})`);
  if (DRY) {
    console.log(JSON.stringify(template, null, 2));
    return;
  }
  const res = await fetch(`${GRAPH}/${BUSINESS_ACCOUNT_ID}/message_templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(template),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error('❌ Meta recusou:', JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log('✅ Submetido:', JSON.stringify(json, null, 2));
  console.log('Status vem por e-mail/painel da Meta (normalmente aprova em minutos/horas).');
}

main().catch((e) => { console.error(e); process.exit(1); });
