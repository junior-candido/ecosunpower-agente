// Renovação do miolo — R24: Visão geral (/home). CONTRATO gravado da tela
// antiga (tests/fixtures/contrato-home.json): o GET ?mes= que envia sozinho,
// os canvas do Chart.js (graficoVendas, graficoMensal) e o CDN pinado.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_HOME } from './fixtures/casos-home.js';
import { MUDANCAS_R24 } from './fixtures/mudancas-onda4.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-home.json'), 'utf-8'));

describe('Visão geral — contrato não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_HOME)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...(MUDANCAS_R24[nome] ?? [])));
    });
  }
});
