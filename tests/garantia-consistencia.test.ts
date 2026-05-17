import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// Bug em prod (lead real, pré-existente): Eva soltou "garantia 5 anos".
// Garantia OFICIAL EcoSunPower (memória project_garantia_ecosunpower,
// faq.md:51, contratos.md:70, propostas.md:347): instalação/serviço/mão de
// obra = 12 MESES; equipamentos = garantia do FABRICANTE. NUNCA "5 anos" de
// instalação/serviço. Guard de regressão: nenhum .md do conhecimento pode
// afirmar a garantia de instalação/serviço da EcoSunPower como 5 anos.

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...mdFiles(p));
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

// Casa as 3 formas conhecidas + variações da MESMA ideia errada
// (garantia de instalação/serviço da EcoSunPower = 5 anos). Propositalmente
// NÃO casa "estrutura ... 5 anos" nem "payback 5 anos" (campos diferentes).
const ERRADO = /(5 anos de garantia de instala|garantia de 5 anos no servi[çc]o de instala|servi[çc]o de instala[çc][ãa]o:\s*5 anos de garantia)/i;

describe('garantia EcoSunPower — consistência no conhecimento', () => {
  const base = join(process.cwd(), 'conhecimento');
  const files = mdFiles(base);

  it('encontra arquivos de conhecimento (sanidade)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('NENHUM .md afirma garantia de instalação/serviço = 5 anos', () => {
    const ofensores: string[] = [];
    for (const f of files) {
      const txt = readFileSync(f, 'utf-8');
      txt.split('\n').forEach((line, i) => {
        if (ERRADO.test(line)) ofensores.push(`${f.replace(base, 'conhecimento')}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(ofensores, `Garantia de instalação errada (deve ser 12 meses):\n${ofensores.join('\n')}`).toEqual([]);
  });

  it('faq.md mantém a garantia oficial de 12 meses', () => {
    const faq = readFileSync(join(base, 'faq.md'), 'utf-8');
    expect(faq).toMatch(/Garantia EcoSunPower de 12 meses/i);
  });
});
