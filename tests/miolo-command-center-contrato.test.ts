// Renovação do miolo — R5 (nova entrada): contrato do Command Center e da
// Central de Atenção gravado ANTES (tests/fixtures/contrato-command-center.json).
// O menu perde o Cockpit e o rodapé da casa ganha o link "Cockpit antigo";
// formulários, fetches, ids e links têm que continuar os mesmos.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_COMMAND_CENTER } from './fixtures/casos-command-center.js';
import { MUDANCAS_R5 } from './fixtures/mudancas-onda4.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-command-center.json'), 'utf-8'));

describe('Command Center e Central — contrato não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_COMMAND_CENTER)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...(MUDANCAS_R5[nome] ?? [])));
    });
  }
});
