// tests/conhecimento-higiene.test.ts
//
// A base de conhecimento nasceu 100% EcoSunPower. O corte multi-tenant foi feito
// por ARQUIVO ("esse é técnico, pode ir") — mas ninguém olhou DENTRO dos
// técnicos. Varredura de 01/09/2026: 50 dos 68 arquivos que o tenant lê citam
// "EcoSunPower", "Junior" ou "Eva", e vários trazem blocos marcados
// "ALERTA INTERNO ... não mostrar ao cliente".
//
// Resultado prático: a Clara, atendendo cliente da Conquista Solar, lia
// "a EcoSunPower trabalha com Solis" e "escalona pro Junior".
import { describe, it, expect } from 'vitest';
import { higienizarParaTenant, removerBlocosInternos } from '../src/modules/conhecimento-higiene.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const conquista = normalizarEmpresaRow({
  company_id: '99fd46d7-60fc-49fe-918f-66587ffa3829',
  nome_fantasia: 'Conquista Solar',
  nome_atendente: 'Clara',
  rt_nome: 'Conquista Solar',
  rt_apelido: 'nossa equipe',
  rt_genero: 'f',
  rt_titulo: 'Responsável Técnica',
});

describe('higiene da base de conhecimento pro tenant', () => {
  it('troca a marca da casa pela marca do cliente', () => {
    const t = higienizarParaTenant('POR QUE A ECOSUNPOWER TRABALHA COM SOLIS', conquista);
    expect(t).not.toMatch(/ecosun/i);
    expect(t).toContain('Conquista Solar');
  });

  it('pega as variações de escrita da marca', () => {
    for (const variante of ['EcoSunPower', 'Ecosunpower', 'ECOSUNPOWER', 'EcoSun Power', 'Eco Sun Power']) {
      expect(higienizarParaTenant(`A ${variante} instala`, conquista)).not.toMatch(/ecosun|eco sun/i);
    }
  });

  it('troca o dono da casa por quem atende no cliente, com o artigo certo', () => {
    const t = higienizarParaTenant('O Junior, nosso Responsavel Tecnico, avalia na visita.', conquista);
    expect(t).not.toMatch(/junior/i);
    expect(t).toContain('nossa equipe');
    expect(t).not.toMatch(/\bO nossa equipe\b/);   // nunca "O nossa equipe"
  });

  it('pega as contrações: pro, do, pelo, ao Junior', () => {
    const t = higienizarParaTenant('escalona pro Junior; o laudo do Junior; assinado pelo Junior; vai ao Junior', conquista);
    expect(t).not.toMatch(/junior/i);
    expect(t).not.toMatch(/\bpro nossa equipe\b/); // feminino: "pra"
    expect(t).toContain('pra nossa equipe');
    expect(t).toContain('da nossa equipe');
  });

  it('troca o nome da assistente da casa pelo da assistente do cliente', () => {
    const t = higienizarParaTenant('A Eva NUNCA passa preço.', conquista);
    expect(t).toContain('Clara');
    expect(t).not.toMatch(/\bEva\b/);
  });

  it('não estraga palavras que só CONTÊM o nome', () => {
    // "avaliação" contém "Eva"; "juniores" contém "junior"
    const t = higienizarParaTenant('A avaliação dos juniores segue o padrão.', conquista);
    expect(t).toContain('avaliação');
    expect(t).toContain('juniores');
  });

  it('corta bloco interno que não pode chegar ao cliente', () => {
    const md = [
      '# Inversor X',
      '',
      '## ⚠️ ALERTA INTERNO PARA O JUNIOR (não mostrar ao cliente)',
      'Margem real é 40%. Fornecedor atrasa.',
      '',
      '## 1. O que é',
      'Inversor de rede trifásico.',
    ].join('\n');
    const limpo = removerBlocosInternos(md);
    expect(limpo).not.toMatch(/margem real/i);
    expect(limpo).not.toMatch(/alerta interno/i);
    expect(limpo).toContain('Inversor de rede trifásico.');   // o resto fica
    expect(limpo).toContain('# Inversor X');
  });

  it('corta também as variações de escrita do bloco interno', () => {
    for (const titulo of [
      '## ⚠️ ALERTA INTERNO PRO JUNIOR (NÃO MOSTRAR AO CLIENTE)',
      '## ALERTA INTERNO (não mostrar ao cliente)',
      '### ⚠️ Alerta interno para o Junior',
    ]) {
      const md = `${titulo}\nsegredo da casa\n\n## Público\nconteudo bom`;
      const limpo = removerBlocosInternos(md);
      expect(limpo).not.toMatch(/segredo da casa/);
      expect(limpo).toContain('conteudo bom');
    }
  });

  it('higienizar já corta os blocos internos junto', () => {
    const md = '## ALERTA INTERNO (não mostrar ao cliente)\nmargem 40%\n\n## Specs\nA Ecosunpower usa Trina.';
    const t = higienizarParaTenant(md, conquista);
    expect(t).not.toMatch(/margem 40/);
    expect(t).not.toMatch(/ecosun/i);
    expect(t).toContain('Conquista Solar');
  });
});
