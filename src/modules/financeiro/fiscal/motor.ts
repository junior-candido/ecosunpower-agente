// src/modules/financeiro/fiscal/motor.ts
// Orquestra a emissão: nota preparada → DPS assinada → GerarNfse → autorizada + ponte-caixa.
// Deps injetadas (banco/rede/cert) pra testar sem tocar nada de verdade; a fábrica
// `depsProducao` liga as deps reais (repo, certificado, client, ponte).
import { montarDpsXml } from './dps-xml.js';

export interface DepsEmissao {
  carregarNota: (companyId: string, notaId: string) => Promise<{
    id: string; status: string; competencia: string; descricao: string;
    tomador: { tipo: 'PJ' | 'PF'; doc: string; nome: string; email: string | null; municipio: string; uf: string };
    servicoId: string | null; valorBruto: number; valorIss: number; issRetido: boolean; valorLiquido: number;
  }>;
  carregarConfig: (companyId: string) => Promise<{
    ambiente: 'homologacao' | 'producao'; serie: string; codMunicipio: string;
    cnpj: string; im: string; certOk: boolean; certValidade: string | null;
  }>;
  carregarServico: (companyId: string, servicoId: string) => Promise<{ codTribNacional: string }>;
  proximoNdps: (companyId: string) => Promise<number>;
  carregarCert: (companyId: string) => Promise<{ pfx: Buffer; senha: string; keyPem: string; certPem: string }>;
  assinar: (xml: string, idDps: string, keyPem: string, certPem: string) => string;
  enviar: (ambiente: 'homologacao' | 'producao', dpsAssinada: string, pfx: Buffer, senha: string) =>
    Promise<{ ok: true; numero: string | null; chaveAcesso: string | null; xmlNfse: string } | { ok: false; erros: Array<{ codigo: string; mensagem: string; correcao: string | null }> }>;
  salvarAutorizada: (d: { companyId: string; notaId: string; numero: string | null; chaveAcesso: string | null; xmlDps: string; xmlNfse: string; ambiente: string }) => Promise<void>;
  salvarRejeicao: (companyId: string, notaId: string, erros: unknown) => Promise<void>;
  registrarEvento: (notaId: string, tipo: string, detalhe?: unknown) => Promise<void>;
  posAutorizada: (companyId: string, notaId: string) => Promise<void>;
}

export type ResultadoEmissao =
  | { ok: true; numero: string | null; chaveAcesso: string | null; ambiente: string }
  | { ok: false; erros: Array<{ codigo: string; mensagem: string; correcao: string | null }> };

export async function emitirNota(deps: DepsEmissao, companyId: string, notaId: string): Promise<ResultadoEmissao> {
  const nota = await deps.carregarNota(companyId, notaId);
  if (nota.status !== 'preparada') throw new Error('Só dá pra emitir nota que está preparada.');
  const cfg = await deps.carregarConfig(companyId);
  if (!cfg.certOk) throw new Error('Certificado A1 não cadastrado ou vencido — envie o .pfx na configuração fiscal.');
  if (cfg.certValidade && new Date(cfg.certValidade + 'T23:59:59') < new Date()) {
    throw new Error(`Certificado A1 venceu em ${cfg.certValidade}. Renove antes de emitir.`);
  }
  if (!nota.servicoId) throw new Error('A nota está sem serviço do catálogo.');
  const servico = await deps.carregarServico(companyId, nota.servicoId);
  const nDps = await deps.proximoNdps(companyId);
  const { xml, idDps } = montarDpsXml({
    ambiente: cfg.ambiente, dhEmi: new Date(), serie: cfg.serie, nDps,
    competencia: nota.competencia, codMunicipio: cfg.codMunicipio,
    prestador: { cnpj: cfg.cnpj, im: cfg.im },
    tomador: { tipo: nota.tomador.tipo, doc: nota.tomador.doc, nome: nota.tomador.nome,
      cep: null, codMunicipio: cfg.codMunicipio, email: nota.tomador.email },
    servico: { codTribNacional: servico.codTribNacional, descricao: nota.descricao },
    valores: { vServ: nota.valorBruto, aliquotaIss: 0, issRetido: nota.issRetido },
  });
  const cert = await deps.carregarCert(companyId);
  const assinada = deps.assinar(xml, idDps, cert.keyPem, cert.certPem);
  await deps.registrarEvento(notaId, 'envio', { ambiente: cfg.ambiente, nDps, idDps });
  const resp = await deps.enviar(cfg.ambiente, assinada, cert.pfx, cert.senha);
  if (!resp.ok) {
    await deps.salvarRejeicao(companyId, notaId, resp.erros);
    await deps.registrarEvento(notaId, 'rejeicao', resp.erros);
    return { ok: false, erros: resp.erros };
  }
  await deps.salvarAutorizada({ companyId, notaId, numero: resp.numero, chaveAcesso: resp.chaveAcesso, xmlDps: assinada, xmlNfse: resp.xmlNfse, ambiente: cfg.ambiente });
  await deps.registrarEvento(notaId, 'autorizada', { numero: resp.numero, chave: resp.chaveAcesso });
  if (cfg.ambiente === 'producao') await deps.posAutorizada(companyId, notaId); // homologação não mexe no caixa
  else await deps.registrarEvento(notaId, 'homologacao_sem_caixa', null);
  return { ok: true, numero: resp.numero, chaveAcesso: resp.chaveAcesso, ambiente: cfg.ambiente };
}

// ── Fábrica com as deps reais ──────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNota, listarServicos, registrarEvento as evtRepo } from './notas-repo.js';
import { carregarCertificado, abrirPfx } from './certificado.js';
import { assinarDps } from './assinatura.js';
import { chamarGerarNfse } from './notacontrol-client.js';
import { engatarNotaNoCaixa } from './ponte-caixa.js';

export function depsProducao(client: SupabaseClient, keyHex: string): DepsEmissao {
  return {
    carregarNota: async (companyId, notaId) => {
      const n = await getNota(client, companyId, notaId);
      if (!n) throw new Error('Nota não encontrada.');
      return { id: n.id, status: n.status, competencia: n.competencia, descricao: n.descricao,
        tomador: n.tomador, servicoId: n.servicoId, valorBruto: n.valorBruto, valorIss: n.valorIss,
        issRetido: n.issRetido, valorLiquido: n.valorLiquido };
    },
    carregarConfig: async (companyId) => {
      const { data, error } = await client.from('fiscal_config')
        .select('ambiente, serie_dps, cod_municipio, cnpj, inscricao_municipal, cert_storage_path, cert_validade')
        .eq('company_id', companyId).single();
      if (error || !data) throw new Error('Configuração fiscal não encontrada.');
      return { ambiente: data.ambiente, serie: data.serie_dps, codMunicipio: data.cod_municipio,
        cnpj: data.cnpj, im: data.inscricao_municipal,
        certOk: Boolean(data.cert_storage_path), certValidade: data.cert_validade };
    },
    carregarServico: async (companyId, servicoId) => {
      const servicos = await listarServicos(client, companyId);
      const s = servicos.find((x) => x.id === servicoId);
      if (!s) throw new Error('Serviço do catálogo não encontrado.');
      return { codTribNacional: s.cod_trib_nacional };
    },
    proximoNdps: async (companyId) => {
      const { data, error } = await client.rpc('fiscal_proximo_ndps', { p_company: companyId });
      if (error || data == null) throw new Error(`Falha na numeração da DPS: ${error?.message}`);
      return Number(data);
    },
    carregarCert: async (companyId) => {
      const { pfx, senha } = await carregarCertificado(client, companyId, keyHex);
      const aberto = abrirPfx(pfx, senha);
      return { pfx, senha, keyPem: aberto.keyPem, certPem: aberto.certPem };
    },
    assinar: assinarDps,
    enviar: chamarGerarNfse,
    salvarAutorizada: async (d) => {
      const { error } = await client.from('fiscal_notas').update({
        status: 'autorizada', numero: d.numero, chave_acesso: d.chaveAcesso,
        xml_dps: d.xmlDps, xml_nfse: d.xmlNfse, ambiente_emissao: d.ambiente,
        updated_at: new Date().toISOString(),
      }).eq('id', d.notaId).eq('company_id', d.companyId).eq('status', 'preparada');
      if (error) throw new Error(`A NFS-e saiu no fisco mas falhou ao salvar aqui: ${error.message} — NÃO emita de novo; confira no portal.`);
    },
    salvarRejeicao: async () => { /* status fica preparada; o erro vive em fiscal_eventos */ },
    registrarEvento: (notaId, tipo, detalhe) => evtRepo(client, notaId, tipo, detalhe),
    posAutorizada: async (companyId, notaId) => {
      // Reusa a MESMA ponte da F1 (fluxo de anexar PDF): precisa da nota inteira,
      // e só engata se ainda não tem conta a receber (idempotência da ponte).
      const nota = await getNota(client, companyId, notaId);
      if (nota && !nota.contaReceberId) {
        await engatarNotaNoCaixa(client, nota, { companyId, fechamentoId: null, leadId: null });
      }
    },
  };
}
