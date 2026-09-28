// Renovação do miolo — R17: Marketing (Campanhas, Blog, E-mail, Cadência).
// CONTRATO gravado da tela antiga (tests/fixtures/contrato-marketing.json):
// filtro GET /marketing (q + status), abas/paginação, admin/backfill-channels
// (confirm), blog (revisar, editar, foto, publicar com confirm, descartar com
// confirm), e-mail (ligar/pausar) e cadência (fechou/optout com confirm).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela } from './helpers/contrato-tela.js';
import { CASOS_MARKETING } from './fixtures/casos-marketing.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-marketing.json'), 'utf-8'));

describe('Marketing — contrato das 4 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_MARKETING)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(CONTRATO[nome]);
    });
  }
});
