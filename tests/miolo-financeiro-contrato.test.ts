// Renovação do miolo — R10: Financeiro (visão). CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-financeiro.json): contêineres do ECharts (#graf,
// #pizza), dados em #fin-data, CDN do ECharts pinado, links de filtro.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// Trocas registradas: sai o Tailwind do CDN (telas leves) e os gráficos leem o tema (.cc-shell).
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';
import { TEMA_GRAFICOS } from './fixtures/mudancas-onda2.js';
import { CASOS_FINANCEIRO } from './fixtures/casos-financeiro.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-financeiro.json'), 'utf-8'));

describe('Financeiro (visão) — contrato da tela não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_FINANCEIRO)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], TELAS_LEVES, TEMA_GRAFICOS));
    });
  }
});
