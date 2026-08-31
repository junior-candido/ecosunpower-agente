// tests/prompts-sem-nome-hardcoded.test.ts
// TRAVA ANTI-VAZAMENTO ENTRE CLIENTES (31/08/2026).
// Bug real: os prompts da Eva tinham "Junior" escrito na unha 97 vezes. A
// assistente do tenant Conquista Solar (Clara) citava o dono da EcoSunPower
// pros clientes DELA. Agora é {{rt_apelido}}, resolvido por empresa.
// Este teste falha se alguém escrever um nome próprio da EcoSun num prompt de novo.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizarEmpresaRow, interpolarEmpresa, primeiroNome, normalizarCanais, EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';
import { blocoSuportePosVenda } from '../src/modules/brain.js';

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'prompts');
const arquivos = readdirSync(promptsDir).filter((f) => f.endsWith('.md'));

// Nomes/marcas que só existem na EcoSunPower e NUNCA podem estar fixos num
// prompt — todo prompt roda também para os tenants do SaaS.
const PROIBIDOS = ['Junior', 'EcoSunPower', 'EcoSun ', 'ecosunpower.eng.br'];

describe('prompts não podem ter nome da EcoSunPower fixo (multi-tenant)', () => {
  for (const arquivo of arquivos) {
    it(`${arquivo} usa placeholders, não nome próprio`, () => {
      const texto = readFileSync(join(promptsDir, arquivo), 'utf-8');
      for (const proibido of PROIBIDOS) {
        expect(texto, `"${proibido}" está fixo em ${arquivo} — use {{rt_apelido}}/{{empresa_nome}}/{{empresa_site}}`)
          .not.toContain(proibido);
      }
    });
  }
  it('achou os arquivos de prompt (guarda contra teste vazio)', () => {
    expect(arquivos.length).toBeGreaterThan(2);
  });
});

describe('rt_apelido', () => {
  it('interpola {{rt_apelido}} no texto', () => {
    const t = interpolarEmpresa('Fala com o {{rt_apelido}}', { ...EMPRESA_DEFAULTS, rtApelido: 'Jimena' });
    expect(t).toBe('Fala com o Jimena');
  });
  it('EcoSunPower usa "Junior" (não "Antonio", o 1º nome do nome jurídico)', () => {
    expect(EMPRESA_DEFAULTS.rtApelido).toBe('Junior');
  });
  it('tenant SEM rt_apelido cai no 1º nome DELE — nunca no apelido da EcoSun', () => {
    const cfg = normalizarEmpresaRow({ nome_fantasia: 'Conquista Solar', rt_nome: 'MARIA JIMENA SOUZA' });
    expect(cfg.rtApelido).toBe('Maria');
    expect(cfg.rtApelido).not.toBe('Junior');
  });
  it('rt_apelido preenchido no banco manda', () => {
    const cfg = normalizarEmpresaRow({ rt_nome: 'MARIA JIMENA SOUZA', rt_apelido: 'Jimena' });
    expect(cfg.rtApelido).toBe('Jimena');
  });
  it('primeiroNome devolve Title Case', () => {
    expect(primeiroNome('MARIA JIMENA SOUZA')).toBe('Maria');
    expect(primeiroNome('  ')).toBe('');
  });
});

describe('artigos e contrações por empresa (o/do/pro x a/da/pra)', () => {
  const masc = { ...EMPRESA_DEFAULTS, rtApelido: 'Junior', rtGenero: 'm' as const, rtTitulo: 'Responsável Técnico' };
  const fem = { ...EMPRESA_DEFAULTS, rtApelido: 'nossa equipe', rtGenero: 'f' as const, rtTitulo: 'equipe comercial' };
  const molde = 'Deixa {{rt_o}} te mostrar. {{rt_O}} fecha. Fila {{rt_do}}. Passo {{rt_pro}}. Feito {{rt_pelo}}. É {{rt_nosso_titulo}}.';

  it('masculino continua igual ao de hoje', () => {
    expect(interpolarEmpresa(molde, masc)).toBe(
      'Deixa o Junior te mostrar. O Junior fecha. Fila do Junior. Passo pro Junior. Feito pelo Junior. É nosso Responsável Técnico.');
  });
  it('feminino/equipe sai com a gramática certa (nunca "o Jimena")', () => {
    expect(interpolarEmpresa(molde, fem)).toBe(
      'Deixa a nossa equipe te mostrar. A nossa equipe fecha. Fila da nossa equipe. Passo pra nossa equipe. Feito pela nossa equipe. É nossa equipe comercial.');
  });
  it('nenhum prompt deixou artigo colado no apelido (o/do/pro {{rt_apelido}})', () => {
    for (const arquivo of arquivos) {
      const texto = readFileSync(join(promptsDir, arquivo), 'utf-8');
      expect(texto, `${arquivo} tem artigo fixo antes de {{rt_apelido}} — use {{rt_o}}/{{rt_do}}/{{rt_pro}}/{{rt_pelo}}`)
        .not.toMatch(/\b(o|O|do|pro|pelo)\s+\{\{rt_apelido\}\}/);
    }
  });
});

describe('canais de encaminhamento por empresa', () => {
  const canais = [
    { assunto: 'dúvida em sistema que já tem', rotulo: 'Setor de engenharia', telefone: '77988843303' },
    { assunto: 'manutenção de aquecimento, banheiro ou piscina', rotulo: 'Financeiro/Serviços', telefone: '77999483357' },
  ];
  it('empresa SEM canais não ganha bloco (prompt da EcoSun idêntico)', () => {
    expect(blocoSuportePosVenda(EMPRESA_DEFAULTS)).toBe('');
  });
  it('empresa COM canais lista todos, com telefone exato', () => {
    const bloco = blocoSuportePosVenda({ ...EMPRESA_DEFAULTS, nomeFantasia: 'Conquista Solar', canaisAtendimento: canais });
    expect(bloco).toContain('77988843303');
    expect(bloco).toContain('77999483357');
    expect(bloco).toContain('Setor de engenharia');
    expect(bloco).toContain('Financeiro/Serviços');
  });
  it('manda QUALIFICAR antes de encaminhar, com exceção pra quem exige/urgência', () => {
    const bloco = blocoSuportePosVenda({ ...EMPRESA_DEFAULTS, canaisAtendimento: canais });
    expect(bloco).toContain('NÃO passe o número na primeira mensagem');
    expect(bloco).toContain('entender → conhecer a instalação → só então encaminhar');
    expect(bloco).toMatch(/pedir o número\s*\n?direto|insistir/);
  });
  it('canal sem telefone ou sem assunto é descartado (não vira prompt quebrado)', () => {
    const lista = normalizarCanais([
      { assunto: 'ok', rotulo: 'Setor', telefone: '77988843303' },
      { assunto: 'sem telefone', rotulo: 'X', telefone: '' },
      { assunto: '', rotulo: 'Y', telefone: '77999483357' },
      'lixo', null, 42,
    ]);
    expect(lista).toHaveLength(1);
    expect(lista[0].telefone).toBe('77988843303');
  });
  it('triagem: empresa sem canais mas COM política ganha bloco', () => {
    const bloco = blocoSuportePosVenda({ ...EMPRESA_DEFAULTS, politicaTriagem: '1. Lead da Fortlev...' });
    expect(bloco).toContain('TRIAGEM');
    expect(bloco).toContain('Lead da Fortlev');
  });
  it('triagem: manda ATENDER o cliente que quer ampliar, não encaminhar', () => {
    const bloco = blocoSuportePosVenda({ ...EMPRESA_DEFAULTS, canaisAtendimento: canais });
    expect(bloco).toContain('Quer comprar mais');
    expect(bloco).toContain('ISSO É VENDA E É SUA');
  });
  it('triagem: pergunta se é cliente ou novo', () => {
    const bloco = blocoSuportePosVenda({ ...EMPRESA_DEFAULTS, canaisAtendimento: canais });
    expect(bloco).toMatch(/já é nosso cliente ou está conhecendo/);
  });
  it('política muito longa é cortada (não estoura o contexto)', () => {
    const cfg = normalizarEmpresaRow({ politica_triagem: 'x'.repeat(5000) });
    expect(cfg.politicaTriagem!.length).toBe(3000);
  });
  it('valor que não é lista vira lista vazia', () => {
    expect(normalizarCanais(null)).toEqual([]);
    expect(normalizarCanais('texto')).toEqual([]);
  });
  it('teto de 6 canais (prompt não vira lista telefônica)', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => ({ assunto: `a${i}`, rotulo: 'R', telefone: `7799000000${i}` }));
    expect(normalizarCanais(muitos)).toHaveLength(6);
  });
});
