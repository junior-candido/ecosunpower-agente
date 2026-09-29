// Renovação do miolo — R18: RH (candidatos, vagas, vaga nova/editar, busca IA).
// CONTRATO gravado da tela antiga (tests/fixtures/contrato-rh.json): filtro GET
// de candidatos (q/vaga/status), status do candidato (select que envia sozinho),
// excluir candidato com os dois confirm(), currículo, vagas (nova, editar,
// status fechar/reabrir), formulário de vaga e busca GET ?q=.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// R5 (Onda 4): o Cockpit saiu do menu — sai o link /dashboard/cockpit das telas da casa.
import { r5Menu } from './fixtures/mudancas-onda4.js';
import { CASOS_RH } from './fixtures/casos-rh.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';
import { MUDANCAS_R18 } from './fixtures/mudancas-onda3.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-rh.json'), 'utf-8'));

describe('RH — contrato das 4 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_RH)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...r5Menu(CONTRATO[nome]), TELAS_LEVES, ...(MUDANCAS_R18[nome] ?? [])));
    });
  }
});
