// tests/trava-marca-alheia.test.ts
//
// Junior, 01/09/2026: "por que toda vez que entrar um cliente vou ter esse
// problema de um jeito ou de outro... não tem nenhum jeito de resolvermos esse
// problema de vez".
//
// Tem: travar na SAÍDA. Não adianta caçar cada lugar onde o nome da casa
// aparece (código, prompt, base de conhecimento, arquivo escrito amanhã). O que
// resolve é conferir a mensagem ANTES de enviar: se a assistente de uma empresa
// citou outra, a mensagem não sai.
//
// Mesma mecânica que já protege preço (eva-trava-numero) e envio pro zap do
// dono (tenant-admin-guard): falha fechada no ponto de saída.
import { describe, it, expect } from 'vitest';
import { citaEmpresaAlheia, travarMarcaAlheia, MENSAGEM_MARCA_BARRADA } from '../src/modules/trava-marca-alheia.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const conquista = normalizarEmpresaRow({
  company_id: '99fd46d7-60fc-49fe-918f-66587ffa3829',
  nome_fantasia: 'Conquista Solar', nome_atendente: 'Clara',
  rt_nome: 'Conquista Solar', rt_apelido: 'nossa equipe', rt_genero: 'f',
});

const ecosun = normalizarEmpresaRow({
  company_id: '00000000-0000-0000-0000-000000000001',
  nome_fantasia: 'EcoSunPower', nome_atendente: 'Eva',
  rt_nome: 'ANTONIO CANDIDO RODRIGUES JUNIOR', rt_apelido: 'Junior', rt_genero: 'm',
});

describe('trava de marca alheia (o cano, não o buraco)', () => {
  it('barra a marca da casa saindo pela assistente de outro cliente', () => {
    expect(citaEmpresaAlheia('A EcoSunPower trabalha com Solis desde 2019', conquista)).toBe(true);
    expect(citaEmpresaAlheia('A Ecosunpower instala carregador', conquista)).toBe(true);
    expect(citaEmpresaAlheia('LIMITE ECOSUNPOWER: 50% de oversize', conquista)).toBe(true);
  });

  it('barra o nome do dono da casa', () => {
    expect(citaEmpresaAlheia('O Junior avalia na visita técnica', conquista)).toBe(true);
    expect(citaEmpresaAlheia('escalona pro Junior', conquista)).toBe(true);
  });

  it('barra o nome da assistente da casa', () => {
    expect(citaEmpresaAlheia('A Eva nunca passa preço', conquista)).toBe(true);
  });

  it('deixa passar o que é da PRÓPRIA empresa', () => {
    expect(citaEmpresaAlheia('A Conquista Solar atende Vitória da Conquista', conquista)).toBe(false);
    expect(citaEmpresaAlheia('Sou a Clara, da Conquista Solar', conquista)).toBe(false);
    expect(citaEmpresaAlheia('nossa equipe te atende hoje mesmo', conquista)).toBe(false);
  });

  it('a EcoSunPower fala o próprio nome à vontade — a casa é dela', () => {
    expect(citaEmpresaAlheia('A EcoSunPower trabalha com Solis', ecosun)).toBe(false);
    expect(citaEmpresaAlheia('O Junior avalia na visita', ecosun)).toBe(false);
    expect(citaEmpresaAlheia('Sou a Eva, consultora', ecosun)).toBe(false);
  });

  it('não confunde palavra que só CONTÉM o nome', () => {
    expect(citaEmpresaAlheia('A avaliação dos juniores ficou boa', conquista)).toBe(false);
  });

  it('mensagem barrada vira resposta neutra, nunca o texto vazado', () => {
    const vazado = 'A EcoSunPower trabalha com Solis e o Junior fecha o preço';
    const saida = travarMarcaAlheia(vazado, conquista);
    expect(saida).toBe(MENSAGEM_MARCA_BARRADA);
    expect(saida).not.toMatch(/ecosun|junior/i);
  });

  it('texto limpo passa intacto', () => {
    const ok = 'O inversor Solis SUN-5K é trifásico e tem 2 MPPT.';
    expect(travarMarcaAlheia(ok, conquista)).toBe(ok);
  });

  it('a resposta neutra não promete nada e não cita ninguém', () => {
    expect(MENSAGEM_MARCA_BARRADA).not.toMatch(/ecosun|junior|eva/i);
    expect(MENSAGEM_MARCA_BARRADA.length).toBeLessThan(200);
  });
});
