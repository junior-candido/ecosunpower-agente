// tests/fiscal-rotas-producao.test.ts
// Rotas novas da NFS-e em produção (PDF, e-mail, códigos, consulta de atividades):
// papel exigido + empresa da SESSÃO em toda consulta (mesmo padrão do R20).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
const trecho = (rota: string) => { const i = fonte.indexOf(rota); expect(i, rota).toBeGreaterThan(-1); return fonte.slice(i, fonte.indexOf('\n  router.', i + 10)); };

describe('rotas fiscais de produção', () => {
  it('PDF: papel visualizar, UUID conferido, modelo conferido e nota buscada com a empresa da sessão', () => {
    const t = trecho("router.get('/fiscal/:id/danfse/:modelo'");
    expect(t).toContain("exigir('financeiro', 'visualizar')");
    expect(t).toContain('UUID_RE.test(notaId)');
    expect(t).toContain('ehModeloPdf(modelo)');
    expect(t).toContain('carregarDadosPdf(supabase, req.dashUser!.companyId, notaId)');
    expect(t.indexOf('xmlNfse')).toBeLessThan(t.indexOf('gerarPdfNota('));
  });
  it('e-mail: papel editar, UUID conferido, empresa da sessão', () => {
    const t = trecho("router.post('/fiscal/:id/enviar-email'");
    expect(t).toContain("exigir('financeiro', 'editar')");
    expect(t).toContain('UUID_RE.test(notaId)');
    expect(t).toContain('req.dashUser!.companyId, notaId');
  });
  it('códigos dos serviços: só serviços listados DESTA empresa e gravação com company_id', () => {
    const t = trecho("router.post('/fiscal/config/servicos'");
    expect(t).toContain("exigir('financeiro', 'editar')");
    expect(t).toContain('listarServicos(supabase, companyId)');
    expect(t).toContain('salvarCodigosServico(bancoDoOperador(req, supabase), companyId, s.id');
  });
  it('consulta de atividades: papel editar e certificado da própria empresa', () => {
    const t = trecho("router.post('/fiscal/config/atividades'");
    expect(t).toContain("exigir('financeiro', 'editar')");
    expect(t).toContain('carregarCertificado(supabase, companyId');
  });
  it('emissão: e-mail automático só depois de autorizada em produção e sem derrubar a emissão', () => {
    const t = trecho("router.post('/fiscal/:id/emitir'");
    expect(t.indexOf('emitirNota(')).toBeLessThan(t.indexOf('deveEnviarAutomatico('));
    expect(t).toContain("r.ambiente === 'producao'");
    expect(t).toContain('automatico: true');
  });
});
