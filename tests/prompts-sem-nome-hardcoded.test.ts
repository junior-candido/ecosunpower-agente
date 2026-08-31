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
import { normalizarEmpresaRow, interpolarEmpresa, primeiroNome, EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';

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
