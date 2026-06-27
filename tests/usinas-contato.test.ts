// Função pura que monta o "view-model" do painel de contato do Kanban de Obras.
// Junta dados da usina (sistemas_clientes) com os do cliente (lead vinculado),
// já prontos pra exibir: campo vazio vira "não cadastrado" e usina sem cliente
// vinculado devolve cliente=null (o painel mostra "Cliente não cadastrado").
import { describe, it, expect } from 'vitest';
import { montarContatoUsina } from '../src/modules/monitoring/usinas-queries.js';

const usinaBase = {
  id: '11111111-1111-1111-1111-111111111111',
  apelido: 'Usina Silva',
  cidade: 'Campinas',
  uf: 'SP',
  potencia_kwp: 8,
  etapa_obra: 'instalacao',
  etapa_obra_updated_at: null,
};

const leadCompleto = {
  name: 'Antônio Carlos',
  phone: '5519999998888',
  email: 'antonio@mail.com',
};

describe('montarContatoUsina', () => {
  it('com lead completo, devolve nome, telefone formatado e email', () => {
    const c = montarContatoUsina(usinaBase, leadCompleto);
    expect(c.cliente).not.toBeNull();
    expect(c.cliente!.nome).toBe('Antônio Carlos');
    expect(c.cliente!.telefone).toContain('(19)'); // formatPhoneBR aplicado
    expect(c.cliente!.email).toBe('antonio@mail.com');
  });

  it('sem cliente vinculado (lead null), cliente é null', () => {
    const c = montarContatoUsina(usinaBase, null);
    expect(c.cliente).toBeNull();
  });

  it('lead sem email mostra "não cadastrado" no campo email', () => {
    const c = montarContatoUsina(usinaBase, { ...leadCompleto, email: null });
    expect(c.cliente!.email).toBe('não cadastrado');
  });

  it('monta a localização "Cidade-UF" e a potência "N kWp"', () => {
    const c = montarContatoUsina(usinaBase, leadCompleto);
    expect(c.localizacao).toBe('Campinas-SP');
    expect(c.potencia).toBe('8 kWp');
  });

  it('campos vazios da usina viram "não cadastrado"', () => {
    const c = montarContatoUsina(
      { ...usinaBase, cidade: null, uf: null, potencia_kwp: null },
      leadCompleto,
    );
    expect(c.localizacao).toBe('não cadastrado');
    expect(c.potencia).toBe('não cadastrado');
  });

  it('traduz o slug da etapa para o label e monta a URL do detalhe', () => {
    const c = montarContatoUsina(usinaBase, leadCompleto);
    expect(c.etapa).toBe('Instalação');
    expect(c.detalheUrl).toBe('/dashboard/monitoramento/11111111-1111-1111-1111-111111111111');
  });
});
