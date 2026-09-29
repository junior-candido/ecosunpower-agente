// Renovação do miolo — R26: Modo TV. CONTRATO gravado da tela antiga (o
// "em construção", tests/fixtures/contrato-tv.json). A TV nova é tela de
// olhar: não tem formulário nem fetch; o que entra está em MUDANCAS_R26.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_TV } from './fixtures/casos-tv.js';
import { MUDANCAS_R26 } from './fixtures/mudancas-onda4.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-tv.json'), 'utf-8'));

describe('Modo TV — contrato', () => {
  for (const [nome, render] of Object.entries(CASOS_TV)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...(MUDANCAS_R26[nome] ?? [])));
    });
  }
});
