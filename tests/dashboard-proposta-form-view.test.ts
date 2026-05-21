// tests/dashboard-proposta-form-view.test.ts
import { describe, it, expect } from 'vitest';
import { renderFormNovaProposta, renderPreviewProposta } from '../src/modules/dashboard/proposta-form-view.js';

describe('renderFormNovaProposta', () => {
  it('pré-preenche nome, telefone, email, CPF, cidade, concessionária do cliente', () => {
    const html = renderFormNovaProposta({
      lead_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      lead: {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        name: 'Marcos Teste',
        phone: '5561999999999',
        email: 'marcos@test.com',
        cpf_cnpj: '111.222.333-44',
        city: 'Brasília',
        uf: 'DF',
        concessionaria: 'neoenergia-df',
        consumo_medio_kwh: 1000,
        consumo_mensal_json: null,
        tarifa_classe: 'B1 monofásica',
        tarifa_modalidade: 'autoconsumo local',
        profile: 'residencial',
        endereco_rua: 'Rua X',
        endereco_numero: '100',
        endereco_complemento: null,
        neighborhood: 'Asa Norte',
        cep: '70000-000',
      } as any,
      erros: [],
    });
    expect(html).toContain('Marcos Teste');
    expect(html).toContain('5561999999999');
    expect(html).toContain('111.222.333-44');
    expect(html).toContain('marcos@test.com');
    expect(html).toContain('1000');
    expect(html).toContain('Trina');
    expect(html).toContain('Sungrow');
    expect(html).toContain('action="/dashboard/propostas/novo"');
    expect(html).toContain('enctype="multipart/form-data"');
  });

  it('mostra erros inline quando vier do POST', () => {
    const html = renderFormNovaProposta({
      lead_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      lead: null,
      erros: ['Campo nomeCliente obrigatório', 'Valor total inválido'],
    });
    expect(html).toContain('Campo nomeCliente obrigatório');
    expect(html).toContain('Valor total inválido');
  });
});

describe('renderPreviewProposta', () => {
  it('mostra iframe + botão Enviar pelo WhatsApp quando pode enviar', () => {
    const html = renderPreviewProposta({
      slug: 'abcdef0123456789',
      htmlPreview: '<html><body>Proposta de Marcos</body></html>',
      publicUrl: 'https://propostas.test/p/abcdef0123456789',
      clienteNome: 'Marcos',
      clienteTelefone: '5561999999999',
      lead_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      jaEnviado: false,
      canEnviar: true,
      reasonNaoEnviar: null,
    });
    expect(html).toContain('iframe');
    expect(html).toContain('Marcos');
    expect(html).toContain('📤 Enviar pelo WhatsApp');
    expect(html).toContain('action="/dashboard/propostas/abcdef0123456789/enviar"');
    expect(html).toContain('https://propostas.test/p/abcdef0123456789');
  });

  it('bloqueia envio quando cliente em opt_out', () => {
    const html = renderPreviewProposta({
      slug: 'abcdef0123456789',
      htmlPreview: '<html><body>x</body></html>',
      publicUrl: 'https://propostas.test/p/abcdef0123456789',
      clienteNome: 'Marcos',
      clienteTelefone: '5561999999999',
      lead_id: 'aaa',
      jaEnviado: false,
      canEnviar: false,
      reasonNaoEnviar: 'Cliente em opt-out',
    });
    expect(html).not.toContain('action="/dashboard/propostas/abcdef0123456789/enviar"');
    expect(html).toContain('Cliente em opt-out');
  });

  it('mostra "Enviado" quando jaEnviado=true', () => {
    const html = renderPreviewProposta({
      slug: 'abcdef0123456789',
      htmlPreview: '<html><body>x</body></html>',
      publicUrl: 'https://propostas.test/p/abcdef0123456789',
      clienteNome: 'Marcos',
      clienteTelefone: '5561999999999',
      lead_id: 'aaa',
      jaEnviado: true,
      canEnviar: true,
      reasonNaoEnviar: null,
    });
    expect(html).toContain('Enviado');
  });

  it('não vaza apóstrofo no nome cliente pra dentro do handler JS', () => {
    const html = renderPreviewProposta({
      slug: 'abcdef0123456789',
      htmlPreview: '<html><body>x</body></html>',
      publicUrl: 'https://propostas.test/p/abcdef0123456789',
      clienteNome: "Marcos D'Ávila",
      clienteTelefone: '5561999999999',
      lead_id: 'aaa',
      jaEnviado: false,
      canEnviar: true,
      reasonNaoEnviar: null,
    });
    // confirm() recebe string vinda de this.dataset.nome, não interpolada no atributo onsubmit
    expect(html).toMatch(/data-nome="Marcos D&#39;Ávila"/);
    expect(html).not.toMatch(/confirm\('Enviar proposta pra Marcos D'Ávila/);
    // garante que o handler usa dataset, não interpolação direta
    expect(html).toMatch(/this\.dataset\.nome/);
  });
});
