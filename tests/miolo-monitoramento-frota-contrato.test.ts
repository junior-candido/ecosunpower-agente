// Renovação do miolo — R8: Monitoramento (frota). CONTRATO gravado da tela
// antiga (tests/fixtures/contrato-monitoramento-frota.json): filtro GET com
// q/marca/cidade/status/ord, Importar, sync-todos, :id/sync, :id/excluir com
// os DOIS confirm(), links ?painel= e o link do relatório — nada disso muda.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_FROTA } from './fixtures/casos-monitoramento.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-monitoramento-frota.json'), 'utf-8'));

describe('Monitoramento (frota) — contrato da tela não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_FROTA)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome]));
    });
  }
});
