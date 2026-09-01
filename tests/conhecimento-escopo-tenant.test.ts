// tests/conhecimento-escopo-tenant.test.ts
// A base de conhecimento nasceu 100% EcoSunPower. Com o SaaS, a assistente do
// tenant (Clara/Conquista Solar) lia a base DA ECOSUN — falaria dos nossos
// preços, região (DF/GO) e casos pros clientes dele. Estes testes travam o corte.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMUM_CORE, COMUM_ESPECIALIZADO, ehComum } from '../src/modules/conhecimento-escopo.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'conhecimento');
const mds = (dir: string) => readdirSync(dir).filter((f) => f.endsWith('.md'));

describe('escopo da base de conhecimento', () => {
  it('o padrão é PRIVADO: arquivo desconhecido não é comum', () => {
    expect(ehComum('arquivo-novo-qualquer.md', 'core')).toBe(false);
    expect(ehComum('arquivo-novo-qualquer.md', 'especializado')).toBe(false);
  });

  it('NADA que tenha preço/condição comercial pode ser comum', () => {
    const proibidos = [
      'precificacao.md', 'precos-referencia.md', 'modulos-alternativos-preco.md',
      'financiamento.md', 'parcelamento-cartao.md', 'propostas.md', 'contratos.md',
    ];
    for (const f of proibidos) {
      expect(COMUM_CORE.has(f), `${f} não pode ser comum`).toBe(false);
      expect(COMUM_ESPECIALIZADO.has(f), `${f} não pode ser comum`).toBe(false);
    }
  });

  it('NADA de identidade/região/casos da EcoSun pode ser comum', () => {
    const proibidos = [
      'empresa.md', 'contato-redes.md', 'indicacao.md', 'servicos-executados.md',
      'produtos.md', 'neoenergia-brasilia.md', 'equatorial-goias.md', 'calculadora.md',
      'vendas-playbook.md',
    ];
    for (const f of proibidos) {
      expect(COMUM_CORE.has(f), `${f} não pode ser comum`).toBe(false);
      expect(COMUM_ESPECIALIZADO.has(f), `${f} não pode ser comum`).toBe(false);
    }
  });

  it('todo arquivo listado como comum EXISTE no disco (lista não apodrece)', () => {
    const naRaiz = new Set(mds(raiz));
    const noEsp = new Set(mds(join(raiz, 'especializado')));
    for (const f of COMUM_CORE) expect(naRaiz.has(f), `${f} listado mas não existe na raiz`).toBe(true);
    for (const f of COMUM_ESPECIALIZADO) expect(noEsp.has(f), `${f} listado mas não existe em especializado/`).toBe(true);
  });

  it('o comum é material técnico de verdade (não ficou vazio)', () => {
    expect(COMUM_ESPECIALIZADO.size).toBeGreaterThan(10);
    expect(ehComum('legislacao.md', 'especializado')).toBe(true);
    expect(ehComum('dimensionamento.md', 'especializado')).toBe(true);
    expect(ehComum('tarifacao.md', 'especializado')).toBe(true);
  });

  // Revisão 01/09/2026. Arquivo de marca não é técnico: é POSICIONAMENTO da
  // EcoSunPower ("por que a EcoSunPower trabalha com Solis", "nossa garantia
  // é 12 meses"). Entregar pro cliente do SaaS faz a assistente dele afirmar
  // sobre ELE o que é verdade só sobre nós. Com que marcas cada empresa
  // trabalha, ela escreve na base própria (migration 119).
  it('NENHUM arquivo de marca entra no comum', () => {
    const deMarca = [...COMUM_ESPECIALIZADO].filter((f) =>
      /^(modulo|modulos|inversor|inversores|microinversor|bateria|baterias|hibrido|comparativo|compatibilidade)[-.]/.test(f));
    expect(deMarca, `arquivo de marca no comum: ${deMarca.join(', ')}`).toEqual([]);
  });
});
