// Renovação do miolo — R19: Configurações. CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-configuracoes.json): usuarios/novo, usuarios/:id,
// :id/ativo, :id/excluir (confirm), empresas/nova, empresas/:id/convite,
// polling do QR (whatsapp/qr.json, estado.json) com os ids que o script usa e
// os 2 formulários do zap da Minha assinatura.
// A tela nova devolve o MESMO contrato, fora a troca comum (sai o Tailwind do
// CDN — TELAS_LEVES) e as trocas deliberadas da seção R19 de mudancas-onda3.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// R5 (Onda 4): o Cockpit saiu do menu — sai o link /dashboard/cockpit das telas da casa.
import { r5Menu } from './fixtures/mudancas-onda4.js';
import { CASOS_CONFIGURACOES } from './fixtures/casos-configuracoes.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES, menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import { MUDANCAS_R19 } from './fixtures/mudancas-onda3.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-configuracoes.json'), 'utf-8'));

describe('Configurações — contrato das telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_CONFIGURACOES)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...r5Menu(CONTRATO[nome]), ...menuTenantSemAssinaturas(h), TELAS_LEVES, ...(MUDANCAS_R19[nome] ?? [])));
    });
  }
});
