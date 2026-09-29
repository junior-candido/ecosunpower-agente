// Renovação do miolo — R11: Demonstrativos GD (6 telas). CONTRATO gravado da
// tela antiga (tests/fixtures/contrato-demonstrativos.json): filtro GET,
// enviar-pdf multipart, confirmar (texto_b64 + assinatura_texto), digitar,
// :instalacao/ligar, :instalacao/geracao, periodo.html/.pdf/enviar,
// relatorio.html/.pdf, enviar (confirmar/reenviar) e o canvas #g13.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// R5 (Onda 4): o Cockpit saiu do menu — sai o link /dashboard/cockpit das telas da casa.
import { r5Menu } from './fixtures/mudancas-onda4.js';
// Trocas registradas: sai o Tailwind do CDN (telas leves); a tela do cliente
// lê o tema dos gráficos (.cc-shell).
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';
import { TEMA_GRAFICOS } from './fixtures/mudancas-onda2.js';
import { CASOS_DEMONSTRATIVOS } from './fixtures/casos-demonstrativos.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-demonstrativos.json'), 'utf-8'));

describe('Demonstrativos GD — contrato das 6 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_DEMONSTRATIVOS)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...r5Menu(CONTRATO[nome]), TELAS_LEVES, ...(nome.startsWith('cliente') ? [TEMA_GRAFICOS] : [])));
    });
  }
});
