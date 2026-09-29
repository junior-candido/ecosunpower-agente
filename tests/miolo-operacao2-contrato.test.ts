// Renovação do miolo — R22: Operação II (Pós-venda / Relacionamento e Medição).
// CONTRATO gravado da tela antiga (tests/fixtures/contrato-operacao2.json):
// no Pós-venda, os 8 fetch (copiloto, enviar-template, enviar-texto, lembrete,
// nota, histórico, tarefa concluir/adiar, dispensar sugestão), os seletores
// pv-* e data-* que o script usa e o confirm do "enviar pela Eva"; na Medição,
// o GET do aparelho (device + horas).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_OPERACAO2 } from './fixtures/casos-operacao2.js';
import { MUDANCAS_R22, r5Menu } from './fixtures/mudancas-onda4.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-operacao2.json'), 'utf-8'));

describe('Operação II — contrato das telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_OPERACAO2)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...r5Menu(CONTRATO[nome]), ...(MUDANCAS_R22[nome] ?? [])));
    });
  }
});
