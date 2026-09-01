// tests/vitrine-menu.test.ts
//
// Junior 01/09/2026: "quero que você deixe todos os menus no dashboard da
// Conquista Solar, mas todos desabilitados, e quando ela clicar aparecer uma
// demonstração caso ela adquirisse essa parte" — depois: "como vitrine".
//
// Antes, item que o papel não permitia SUMIA. O cliente não fazia ideia do
// tamanho do que existe. Agora ele aparece apagado, com cadeado, e clicar leva
// à apresentação do módulo.
//
// O que NÃO vira vitrine: o que é da casa e não se vende (gestão de tenants) e
// as conveniências internas da EcoSun.
import { describe, it, expect } from 'vitest';
import { estadoDoItem } from '../src/modules/dashboard/vitrine-menu.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = '99fd46d7-60fc-49fe-918f-66587ffa3829';

const dono = { companyId: ECOSUN, permissoes: { financeiro: 'editar', leads: 'editar' } } as never;
const cliente = { companyId: TENANT, permissoes: { leads: 'editar' } } as never;

// quem pode o quê — mesma regra do can() do dashboard
const pode = (u: never, area: string) => {
  const p = (u as unknown as { permissoes: Record<string, string> }).permissoes;
  return Boolean(p[area]);
};

describe('vitrine: os três estados de um item de menu', () => {
  it('módulo que o cliente TEM fica visível', () => {
    expect(estadoDoItem({ area: 'leads' }, cliente, ECOSUN, pode)).toBe('visivel');
  });

  it('módulo que o cliente NÃO tem fica BLOQUEADO — antes sumia', () => {
    expect(estadoDoItem({ area: 'financeiro' }, cliente, ECOSUN, pode)).toBe('bloqueado');
  });

  it('gestão de tenants continua escondida — é da casa, não se vende', () => {
    expect(estadoDoItem({ area: 'empresas', soEcosun: true }, cliente, ECOSUN, pode)).toBe('escondido');
  });

  it('item sem área é conveniência interna da casa: escondido pro cliente', () => {
    expect(estadoDoItem({}, cliente, ECOSUN, pode)).toBe('escondido');
  });

  it('a EcoSun não muda nada: ou vê, ou não vê — nunca vitrine', () => {
    expect(estadoDoItem({ area: 'financeiro' }, dono, ECOSUN, pode)).toBe('visivel');
    expect(estadoDoItem({ area: 'rh' }, dono, ECOSUN, pode)).toBe('escondido');
    expect(estadoDoItem({}, dono, ECOSUN, pode)).toBe('visivel');
  });

  it('tela sem usuário (login) não mostra vitrine', () => {
    expect(estadoDoItem({ area: 'financeiro' }, undefined, ECOSUN, pode)).toBe('visivel');
  });

  it('item só de tenant some pra EcoSun', () => {
    expect(estadoDoItem({ area: 'leads', soTenant: true }, dono, ECOSUN, pode)).toBe('escondido');
  });
});
