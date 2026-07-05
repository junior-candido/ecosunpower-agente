// tests/rh-busca.test.ts — partes puras da busca esperta no banco de talentos
import { describe, it, expect } from 'vitest';
import { montarPromptBusca, parseBusca } from '../src/modules/rh/busca.js';

const candidatos = [
  { id: 'c1', nome: 'José', vaga: 'Instalador', nota_ia: 8, resumo_ia: 'Eletricista, NR-35 em dia, mora no Gama.', alertas_ia: null, status: 'novo' },
  { id: 'c2', nome: 'Maria', vaga: null, nota_ia: null, resumo_ia: null, alertas_ia: null, status: 'novo' },
];

describe('montarPromptBusca', () => {
  it('carrega a pergunta e os candidatos (id, nome, resumo) no prompt', () => {
    const p = montarPromptBusca('quem tem NR-35 e mora no Gama?', candidatos as never);
    expect(p).toContain('NR-35 e mora no Gama');
    expect(p).toContain('c1');
    expect(p).toContain('José');
    expect(p).toContain('mora no Gama');
    expect(p).toContain('json');
  });

  it('candidato sem resumo entra marcado como ainda não triado', () => {
    const p = montarPromptBusca('x', candidatos as never);
    expect(p).toContain('ainda sem triagem');
  });
});

describe('parseBusca', () => {
  it('lê a lista de encontrados com id e motivo', () => {
    const raw = '```json\n[{"id": "c1", "motivo": "NR-35 em dia e mora no Gama"}]\n```';
    const r = parseBusca(raw);
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ id: 'c1', motivo: 'NR-35 em dia e mora no Gama' });
  });

  it('lista vazia, json inválido ou itens sem id → resultado vazio/filtrado', () => {
    expect(parseBusca('```json\n[]\n```')).toEqual([]);
    expect(parseBusca('nada de json')).toEqual([]);
    expect(parseBusca('```json\n[{"motivo": "sem id"}, {"id": "c2", "motivo": "ok"}]\n```')).toEqual([{ id: 'c2', motivo: 'ok' }]);
  });
});
