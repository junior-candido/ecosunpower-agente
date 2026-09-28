// Renovação do miolo — R9: Usina (detalhe, dados, editar, importar). CONTRATO
// gravado da tela antiga (tests/fixtures/contrato-usina.json): :id/sync,
// :id/backfill (com o confirm), abas Dia/Mês/Ano + setas, :id/editar (POST com
// todos os campos das 6 seções + busca de cliente), importar (todos os campos
// de todas as marcas + busca de empresas Deye), ids dos canvas do Chart.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_USINA } from './fixtures/casos-usina.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-usina.json'), 'utf-8'));

describe('Usina — contrato das telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_USINA)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome]));
    });
  }
});
