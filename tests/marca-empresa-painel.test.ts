// tests/marca-empresa-painel.test.ts
//
// Junior 01/09/2026: "queria que amanhã, quando ela abrisse o dashboard, já
// encontrasse de cara nova".
//
// O painel importava a logo da EcoSunPower FIXA do código e usava âmbar em
// classes cravadas — a Conquista Solar via a marca da EcoSunPower no painel
// dela. Mesmo vazamento de marca do resto do dia, só que na tela.
import { describe, it, expect } from 'vitest';
import { corDaMarca, logoDaEmpresa, LOGO_PADRAO_CASA } from '../src/modules/dashboard/marca-empresa.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const conquista = normalizarEmpresaRow({
  company_id: '99fd46d7-60fc-49fe-918f-66587ffa3829',
  nome_fantasia: 'Conquista Solar',
  cor_marca: '#F58634',
  logo_storage_path: 'https://conquistasolar.com.br/imagens/logo.png',
});

const ecosun = normalizarEmpresaRow({
  company_id: '00000000-0000-0000-0000-000000000001',
  nome_fantasia: 'EcoSunPower',
});

describe('marca da empresa no painel', () => {
  it('usa a cor cadastrada do cliente', () => {
    expect(corDaMarca(conquista)).toBe('#F58634');
  });

  it('sem cor cadastrada, fica a da casa — a EcoSun não muda', () => {
    expect(corDaMarca(ecosun)).toBe('#fbbf24');
  });

  it('recusa cor que não é hex — CSS quebrado é pior que cor errada', () => {
    for (const ruim of ['laranja', 'javascript:alert(1)', '#GG0000', '#F58', '']) {
      const e = normalizarEmpresaRow({ company_id: 'x', cor_marca: ruim });
      expect(corDaMarca(e), ruim).toBe('#fbbf24');
    }
  });

  it('aceita hex com 6 dígitos, maiúsculo ou minúsculo', () => {
    expect(corDaMarca(normalizarEmpresaRow({ company_id: 'x', cor_marca: '#abc123' }))).toBe('#abc123');
    expect(corDaMarca(normalizarEmpresaRow({ company_id: 'x', cor_marca: '#ABC123' }))).toBe('#ABC123');
  });

  it('logo por URL vai direto — sem upload, sem download', () => {
    expect(logoDaEmpresa(conquista)).toBe('https://conquistasolar.com.br/imagens/logo.png');
  });

  it('sem logo cadastrada, usa a da casa', () => {
    expect(logoDaEmpresa(ecosun)).toBe(LOGO_PADRAO_CASA);
  });

  it('caminho de bucket (não URL) ainda não serve no painel — cai na da casa', () => {
    // O painel monta HTML de forma síncrona; baixar do bucket é assíncrono.
    // Quem tem caminho de bucket continua funcionando na PROPOSTA (que é async).
    const comBucket = normalizarEmpresaRow({ company_id: 'x', logo_storage_path: 'conquista/logo.png' });
    expect(logoDaEmpresa(comBucket)).toBe(LOGO_PADRAO_CASA);
  });

  it('recusa URL que não é http(s) — nada de javascript: no src', () => {
    for (const ruim of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd']) {
      const e = normalizarEmpresaRow({ company_id: 'x', logo_storage_path: ruim });
      expect(logoDaEmpresa(e), ruim).toBe(LOGO_PADRAO_CASA);
    }
  });
});
