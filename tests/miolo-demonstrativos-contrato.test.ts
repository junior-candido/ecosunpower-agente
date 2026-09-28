// Renovação do miolo — R11: Demonstrativos GD (6 telas). CONTRATO gravado da
// tela antiga (tests/fixtures/contrato-demonstrativos.json): filtro GET,
// enviar-pdf multipart, confirmar (texto_b64 + assinatura_texto), digitar,
// :instalacao/ligar, :instalacao/geracao, periodo.html/.pdf/enviar,
// relatorio.html/.pdf, enviar (confirmar/reenviar) e o canvas #g13.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_DEMONSTRATIVOS } from './fixtures/casos-demonstrativos.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-demonstrativos.json'), 'utf-8'));

describe('Demonstrativos GD — contrato das 6 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_DEMONSTRATIVOS)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome]));
    });
  }
});
