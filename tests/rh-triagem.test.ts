// tests/rh-triagem.test.ts — partes puras da triagem IA de currículos
import { describe, it, expect } from 'vitest';
import { montarPromptTriagem, parseTriagem } from '../src/modules/rh/triagem.js';

describe('montarPromptTriagem', () => {
  it('com vaga: prompt carrega título, requisitos e descrição', () => {
    const p = montarPromptTriagem({ titulo: 'Instalador Fotovoltaico', requisitos: 'NR-35 em dia', descricao: 'instalação em telhado' });
    expect(p).toContain('Instalador Fotovoltaico');
    expect(p).toContain('NR-35 em dia');
    expect(p).toContain('instalação em telhado');
    expect(p).toContain('json');
  });

  it('sem vaga (banco de talentos): avaliação genérica pra empresa de energia solar', () => {
    const p = montarPromptTriagem(null);
    expect(p.toLowerCase()).toContain('banco de talentos');
    expect(p.toLowerCase()).toContain('energia solar');
  });
});

describe('parseTriagem', () => {
  it('lê o bloco json com nota, resumo e alertas', () => {
    const raw = 'Analisando...\n```json\n{"nota": 8.5, "resumo": "Eletricista com 5 anos de obra.", "alertas": ["Não menciona NR-35"]}\n```';
    const r = parseTriagem(raw);
    expect(r).not.toBeNull();
    expect(r!.nota).toBe(8.5);
    expect(r!.resumo).toContain('Eletricista');
    expect(r!.alertas).toBe('Não menciona NR-35');
  });

  it('nota fora da régua é grampeada em 0..10; alertas aceita string ou lista', () => {
    expect(parseTriagem('```json\n{"nota": 15, "resumo": "x", "alertas": []}\n```')!.nota).toBe(10);
    expect(parseTriagem('```json\n{"nota": -3, "resumo": "x", "alertas": "um só"}\n```')!.nota).toBe(0);
    expect(parseTriagem('```json\n{"nota": 5, "resumo": "x", "alertas": "um só"}\n```')!.alertas).toBe('um só');
    expect(parseTriagem('```json\n{"nota": 5, "resumo": "x", "alertas": ["a", "b"]}\n```')!.alertas).toBe('a · b');
  });

  it('resposta sem json válido ou sem nota numérica → null', () => {
    expect(parseTriagem('não consegui ler')).toBeNull();
    expect(parseTriagem('```json\n{"resumo": "sem nota"}\n```')).toBeNull();
    expect(parseTriagem('```json\n{lixo}\n```')).toBeNull();
  });
});
