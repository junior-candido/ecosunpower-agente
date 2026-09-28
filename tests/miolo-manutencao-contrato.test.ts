// Renovação do miolo — R13: Manutenção (agenda) + OS. CONTRATO gravado da tela
// antiga (tests/fixtures/contrato-manutencao.json): na agenda, :id/feita,
// :id/os/abrir, manutencao/agendar, os/nova e o modal de leitura (fetch no
// form.action, ids e data-* que o script lê); na OS, salvar, upload de foto
// (multipart) e o link do laudo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_MANUTENCAO } from './fixtures/casos-manutencao.js';
import { MUDANCAS_R13 } from './fixtures/mudancas-onda3.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-manutencao.json'), 'utf-8'));

describe('Manutenção + OS — contrato das telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_MANUTENCAO)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...(MUDANCAS_R13[nome] ?? [])));
    });
  }
});

// O contratoDaTela olha só os campos DENTRO de cada <form>. Na OS, checklist e
// observações ficam FORA e se ligam ao form de salvar por form="osForm" (pra o
// upload de foto não ficar <form> dentro de <form>) — então isso é travado aqui.
const ligadosAoOsForm = (h: string) => [...h.matchAll(/<(input|textarea|button)\b[^>]*\bform="osForm"[^>]*>/g)]
  .map((m) => {
    const tag = m[0];
    const at = (n: string) => (tag.match(new RegExp(`\\b${n}="([^"]*)"`)) ?? [])[1] ?? '';
    return `${m[1]}|${at('type')}|${at('name')}|${at('formaction')}${/\bdisabled\b/.test(tag) ? '|disabled' : ''}`;
  }).sort();

describe('OS — campos ligados ao form de salvar (form="osForm")', () => {
  it('OS aberta: checks, medição, observações, Salvar e Concluir (formaction)', () => {
    expect(ligadosAoOsForm(CASOS_MANUTENCAO['os-limpeza']())).toEqual([
      'button|||',
      'button|||/dashboard/os/bbbbbbbb-2222-4333-8444-000000000001/concluir',
      'input|checkbox|estruturas|',
      'input|checkbox|inspecao_visual|',
      'input|checkbox|limpeza_placas|',
      'input|text|geracao_antes_depois|',
      'textarea||observacoes|',
    ]);
  });
  it('OS concluída: campos travados (disabled) e sem botões', () => {
    expect(ligadosAoOsForm(CASOS_MANUTENCAO['os-concluida']())).toEqual([
      'input|checkbox|estruturas||disabled',
      'input|checkbox|inspecao_visual||disabled',
      'input|checkbox|limpeza_placas||disabled',
      'input|text|geracao_antes_depois||disabled',
      'textarea||observacoes||disabled',
    ]);
  });
  it('revisão de inversor: medições CA e CC', () => {
    const l = ligadosAoOsForm(CASOS_MANUTENCAO['os-revisao-inversor']());
    expect(l).toContain('input|text|medicao_ca|');
    expect(l).toContain('input|text|medicao_cc|');
  });
});
