// Renovação do miolo — R16: Clientes (lista, ficha, novo) e relatório
// pós-instalação (novo + prévia). CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-clientes.json): busca GET, novo, vincular-sistema,
// eva-action, :id/edit, arquivar/desarquivar (confirm), excluir (confirm),
// anexos (upload multipart / remover com confirm), fetch do ViaCEP, busca de
// cliente do seletor, relatório pós-instalação (form multipart + enviar).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela } from './helpers/contrato-tela.js';
import { CASOS_CLIENTES } from './fixtures/casos-clientes.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-clientes.json'), 'utf-8'));

describe('Clientes — contrato das 5 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_CLIENTES)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(CONTRATO[nome]);
    });
  }
});
