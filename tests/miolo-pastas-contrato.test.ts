// Renovação do miolo — R12: Pasta do Cliente (3 telas). CONTRATO gravado da
// tela antiga (tests/fixtures/contrato-pastas.json): criar pasta, dados,
// capa, arquivos (multipart), arquivos/remover (confirm), puxar-servicos,
// puxar-rpi, declaracao, publicar, enviar (confirm) e excluir (confirm).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_PASTAS } from './fixtures/casos-pastas.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-pastas.json'), 'utf-8'));

describe('Pasta do Cliente — contrato das 3 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_PASTAS)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome]));
    });
  }
});
