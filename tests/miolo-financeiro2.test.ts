// Renovação do miolo — R20: Notas fiscais e Cobrar cliente no padrão cc-
// (visual, marca, escape). O contrato (formulários, fetch, ids) está em
// miolo-financeiro2-contrato.test.ts; os buracos de empresa/papel em
// miolo-financeiro2-seguranca.test.ts.
import { describe, it, expect } from 'vitest';
import { CASOS_FINANCEIRO2 } from './fixtures/casos-financeiro2.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const semScripts = (h: string) => h.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const R20 = Object.keys(CASOS_FINANCEIRO2).filter((c) => !c.startsWith('assinatura'));

describe('Financeiro II — padrão cc-', () => {
  for (const nome of R20) {
    const h = CASOS_FINANCEIRO2[nome]();
    it(`${nome}: sem Tailwind, tema escuro, CSS no <head>, sem <style> no corpo`, () => {
      expect(h).not.toContain('cdn.tailwindcss.com');
      expect(h).toContain('cc-escuro');
      expect(miolo(h)).toMatch(/class="cc-root cc-(nf|cb)/);
      expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
      expect(linhasComTailwind(semScripts(miolo(h)))).toEqual([]);
      expect(miolo(h)).not.toMatch(/style="[^"]*#[0-9a-f]{3,6}/i);
    });
    it(`${nome}: trilha começa no Financeiro e no máximo UMA ação dourada`, () => {
      const m = miolo(h);
      expect(m).toContain('class="cc-crumb"');
      expect(m).toContain('>Financeiro</a>');
      expect((m.match(/cc-btn-gold/g) ?? []).length).toBeLessThanOrEqual(1);
    });
    it(`${nome}: dado de fora nunca vira HTML`, () => {
      const m = semScripts(miolo(h));
      expect(m).not.toContain('<b>Exemplo</b>');
      expect(m).not.toContain('<tomador>');
      expect(m).not.toContain('<endereço>');
      expect(m).not.toContain('<do>');
    });
  }
  it('sem emoji nos títulos', () => {
    for (const nome of R20) {
      const h1 = (miolo(CASOS_FINANCEIRO2[nome]()).match(/<h1>([\s\S]*?)<\/h1>/) ?? ['', ''])[1];
      expect(h1, nome).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
  it('tenant: nada da casa (nome, CNPJ, logo) no miolo', () => {
    for (const nome of ['notas-tenant', 'nota-nova-sem-servico', 'nota-cancelada', 'fiscal-config-vazia', 'cobrar-tenant']) {
      const h = CASOS_FINANCEIRO2[nome]();
      expect(miolo(h), nome).not.toMatch(/EcoSun|33\.020|logo-casa/);
      expect(h, nome).not.toContain('logo-casa');
    }
  });
});

describe('Notas fiscais', () => {
  it('lista: tabela cc- com situação em pílula e "Abrir" por nota; valores em número', () => {
    const m = miolo(CASOS_FINANCEIRO2['notas']());
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('cc-pill cc-s-ok" title="🟢 Normal">Autorizada');
    expect(m).toContain('Preparada (emitir no portal)');
    expect(m).toContain('href="/dashboard/fiscal/55555555-5555-4666-8777-888888888888"');
    expect(m).toContain('R$ 1.425,00');
    expect(m).toContain('Condomínio &lt;b&gt;Exemplo&lt;/b&gt; Norte');
    expect(m).toContain('cc-btn cc-btn-gold" href="/dashboard/fiscal/nova"');
  });
  it('certificado vencendo → aviso vermelho; sem validade → aviso azul; vazio → estado vazio', () => {
    expect(miolo(CASOS_FINANCEIRO2['notas-cert-vencendo']())).toMatch(/cc-aviso-erro[\s\S]*Certificado digital vence em 31\/01\/2020/);
    const v = miolo(CASOS_FINANCEIRO2['notas-vazio-sem-config']());
    expect(v).toContain('cc-aviso-info');
    expect(v).toContain('Nenhuma nota ainda');
  });
  it('nova nota: 3 painéis, conta do ISS com os ids do script, botão dourado de enviar', () => {
    const m = miolo(CASOS_FINANCEIRO2['nota-nova']());
    expect(m).toContain('Quem recebe a nota (tomador)');
    expect(m).toContain('Serviço e valor');
    expect(m).toContain('id="c-liq"');
    expect(m).toMatch(/<button type="submit" class="cc-btn cc-btn-gold">[\s\S]*Preparar nota/);
    expect(m).toContain('<button type="button" class="cc-btn" id="buscar">');
  });
  it('sem serviço cadastrado: avisa (antes o select vinha vazio e calado)', () => {
    expect(miolo(CASOS_FINANCEIRO2['nota-nova-sem-servico']())).toContain('Nenhum serviço fiscal cadastrado');
  });
  it('editar: título e botão de salvar; erro vem em aviso', () => {
    const m = miolo(CASOS_FINANCEIRO2['nota-editar']());
    expect(m).toContain('Editar nota (preparada)');
    expect(m).toContain('Salvar alterações');
    expect(miolo(CASOS_FINANCEIRO2['nota-nova-do-fechamento']())).toMatch(/cc-aviso-erro[\s\S]*Preencha &lt;tomador&gt;/);
  });
  it('detalhe preparada: KPIs bruto/ISS/líquido, Emitir agora dourado, ambiente em pílula, anexar PDF', () => {
    const m = miolo(CASOS_FINANCEIRO2['nota-preparada-com-cert']());
    expect(m).toContain('cc-kstrip');
    expect(m).toContain('Líquido a receber');
    expect(m).toMatch(/cc-btn-gold[^>]*>[\s\S]*?Emitir agora/);
    expect(m).toContain('>Produção</span>');
    expect(m).toContain('Anexar e lançar no caixa');
    expect(m).toContain('rel="noopener"');
  });
  it('homologação: aviso de teste; sem certificado: botão pra configuração', () => {
    expect(miolo(CASOS_FINANCEIRO2['nota-preparada-homologacao']())).toContain('Ambiente de TESTE');
    expect(miolo(CASOS_FINANCEIRO2['nota-preparada-sem-cert']())).toContain('Cadastrar certificado');
  });
  it('enviada: painel de "confira no portal" com o destravar', () => {
    const m = miolo(CASOS_FINANCEIRO2['nota-enviada']());
    expect(m).toContain('Enviada — aguardando confirmação');
    expect(m).toContain('Voltar pra preparada (não saiu no portal)');
  });
  it('autorizada: número, chave, XML, PDF e conta a receber', () => {
    const m = miolo(CASOS_FINANCEIRO2['nota-autorizada']());
    expect(m).toContain('NFS-e emitida daqui');
    expect(m).toContain('Baixar XML');
    expect(m).toContain('Baixar PDF');
    expect(m).toContain('Conta a receber criada no caixa.');
  });
  it('configuração: dados da empresa, ambiente e certificado; Salvar dourado', () => {
    const m = miolo(CASOS_FINANCEIRO2['fiscal-config']());
    expect(m).toContain('Dados da empresa na nota');
    expect(m).toContain('Certificado cadastrado');
    expect(m).toContain('31/08/2099');
    expect(m).toMatch(/cc-btn-gold[^>]*>[\s\S]*?Salvar/);
    expect(miolo(CASOS_FINANCEIRO2['fiscal-config-teste']())).toContain('Ambiente de TESTE (homologação)');
    expect(miolo(CASOS_FINANCEIRO2['fiscal-config-vazia']())).toContain('Certificado A1 não cadastrado');
  });
});

describe('Cobrar cliente', () => {
  it('agora dentro da casca: menu com "Cobrar cliente" aceso', () => {
    const h = CASOS_FINANCEIRO2['cobrar']();
    expect(h).toContain('cc-sidebar');
    expect(h).toMatch(/href="\/dashboard\/cobrar"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/dashboard\/cobrar"/);
  });
  it('par em dourado, link único normal; sem InfinitePay: aviso e botões desligados', () => {
    const m = miolo(CASOS_FINANCEIRO2['cobrar']());
    expect(m).toMatch(/class="cc-btn cc-btn-gold" id="p"/);
    expect(m).toMatch(/class="cc-btn" id="b"/);
    const off = miolo(CASOS_FINANCEIRO2['cobrar-sem-infinitepay']());
    expect(off).toContain('cc-aviso-atencao');
    expect(off).toContain('id="p" disabled="disabled"');
  });
  it('o script repõe o rótulo certo dos botões (antes o link único voltava como "Gerar link de pagamento")', () => {
    const h = CASOS_FINANCEIRO2['cobrar']();
    expect(h).not.toContain("b.textContent='Gerar link de pagamento'");
    expect(h).toContain('rotulo(b,ROT_B)');
    expect(linhasComTailwind((h.match(/<script>[\s\S]*?<\/script>/g) ?? []).join('\n'))).toEqual([]);
  });
});
