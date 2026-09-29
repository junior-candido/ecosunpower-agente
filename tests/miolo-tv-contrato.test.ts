// Renovação do miolo — R26: Modo TV. CONTRATO gravado da tela antiga (o
// "em construção", tests/fixtures/contrato-tv.json). A TV nova é tela de
// olhar: não tem formulário nem fetch; o que entra está em MUDANCAS_R26.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import { CASOS_TV } from './fixtures/casos-tv.js';
import { MUDANCAS_R26 } from './fixtures/mudancas-onda4.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-tv.json'), 'utf-8'));

describe('Modo TV — contrato', () => {
  for (const [nome, render] of Object.entries(CASOS_TV)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      // Cobrança recorrente (#339): Assinaturas some do menu do tenant.
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...menuTenantSemAssinaturas(h), ...(MUDANCAS_R26[nome] ?? [])));
    });
  }
});
