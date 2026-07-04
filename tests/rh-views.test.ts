// tests/rh-views.test.ts
import { describe, it, expect } from 'vitest';
import { renderVagasPage, renderVagaFormPage, renderCandidatosPage } from '../src/modules/dashboard/rh-views.js';

const vagas = [{
  id: 'v1', titulo: 'Instalador Fotovoltaico', descricao: 'obra', requisitos: 'NR-35',
  cidade: 'Brasília-DF', tipo: 'CLT', status: 'aberta', created_at: '2026-07-04T12:00:00Z',
}] as never[];

const candidatos = [{
  id: 'c1', vaga_id: 'v1', nome: "José D'Ávila", telefone: '5561999990000', email: 'z@x.com',
  curriculo_path: 'v1/a.pdf', status: 'novo', nota_ia: null, resumo_ia: null, alertas_ia: null,
  historico: [], created_at: '2026-07-04T12:00:00Z',
}] as never[];

describe('telas RH', () => {
  it('vagas: lista com título, status e botão nova vaga', () => {
    const html = renderVagasPage(vagas as never, undefined);
    expect(html).toContain('Instalador Fotovoltaico');
    expect(html).toContain('aberta');
    expect(html).toContain('/dashboard/rh/vagas/nova');
  });

  it('form de vaga: nova e edição', () => {
    const nova = renderVagaFormPage(null, undefined);
    expect(nova).toContain('action="/dashboard/rh/vagas"');
    const edit = renderVagaFormPage(vagas[0] as never, undefined);
    expect(edit).toContain('action="/dashboard/rh/vagas/v1"');
    expect(edit).toContain('Instalador Fotovoltaico');
  });

  it('candidatos: funil completo, escapa apóstrofo e tem link do PDF', () => {
    const html = renderCandidatosPage(candidatos as never, vagas as never, {}, undefined);
    expect(html).toContain('D&#039;Ávila');
    expect(html).toContain('/dashboard/rh/candidatos/c1/curriculo');
    for (const s of ['novo', 'triado', 'entrevista', 'aprovado', 'reprovado']) expect(html).toContain(s);
  });

  it('candidato sem vaga aparece como Banco de Talentos', () => {
    const semVaga = [{ ...(candidatos[0] as object), vaga_id: null }] as never[];
    const html = renderCandidatosPage(semVaga as never, vagas as never, {}, undefined);
    expect(html).toContain('Banco de Talentos');
  });

  it('excluir candidato: botão com confirmação dupla e sem quebra com apóstrofo no nome', () => {
    const html = renderCandidatosPage(candidatos as never, vagas as never, {}, undefined);
    expect(html).toContain('/dashboard/rh/candidatos/c1/excluir');
    expect(html).toContain('Confirma de novo');
    const onsubmits = html.match(/onsubmit="[^"]*"/g) ?? [];
    expect(onsubmits.length).toBeGreaterThan(0);
    for (const os of onsubmits) expect(os).not.toContain('&#039;');
  });

  it('triagem IA: nota, resumo e alertas aparecem na linha do candidato', () => {
    const triado = [{
      ...(candidatos[0] as object),
      nota_ia: 8.5, resumo_ia: 'Eletricista com 5 anos de obra.', alertas_ia: 'Não menciona NR-35',
    }] as never[];
    const html = renderCandidatosPage(triado as never, vagas as never, {}, undefined);
    expect(html).toContain('8.5');
    expect(html).toContain('Eletricista com 5 anos de obra.');
    expect(html).toContain('Não menciona NR-35');
  });
});
