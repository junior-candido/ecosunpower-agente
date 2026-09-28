// Renovação do miolo — R17: Marketing (Campanhas, Blog, E-mail, Cadência).
// CONTRATO gravado da tela antiga (tests/fixtures/contrato-marketing.json):
// filtro GET /marketing (q + status), abas/paginação, admin/backfill-channels
// (confirm), blog (revisar, editar, foto, publicar com confirm, descartar com
// confirm), e-mail (ligar/pausar) e cadência (fechou/optout com confirm).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_MARKETING } from './fixtures/casos-marketing.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';
// Trocas deliberadas da R17 (segurança do backfill + conserto do confirm da Cadência).
import { MUDANCAS_R17 } from './fixtures/mudancas-onda3.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-marketing.json'), 'utf-8'));

describe('Marketing — contrato das 4 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_MARKETING)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], TELAS_LEVES, ...(MUDANCAS_R17[nome] ?? [])));
    });
  }
});
