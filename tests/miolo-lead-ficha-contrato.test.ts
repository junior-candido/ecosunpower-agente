// Renovação do miolo — R3: ficha do lead. CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-ficha-lead.json): os 14+ formulários POST, campos,
// o fetch do copiloto, os ids do script e os confirm() — nada disso pode mudar.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela } from './helpers/contrato-tela.js';
import { CASOS_FICHA } from './fixtures/casos-ficha-lead.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-ficha-lead.json'), 'utf-8'));

describe('Ficha do lead — contrato da tela não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_FICHA)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(CONTRATO[nome]);
    });
  }
});
