// src/modules/financeiro/fiscal/certificado.ts
// Abre o .pfx (A1), extrai chave + certificado em PEM, validade e CNPJ do titular.
// e-CNPJ ICP-Brasil traz o CNPJ no CN ("RAZAO SOCIAL:NNNNNNNNNNNNNN") ou em OID 2.16.76.1.3.3.
import forge from 'node-forge';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cifrar, decifrar } from './crypto-cert.js';

export interface CertAberto { certPem: string; keyPem: string; validade: Date; cnpj: string | null }

export function abrirPfx(pfx: Buffer, senha: string): CertAberto {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha);
  } catch {
    throw new Error('Não consegui abrir o certificado: confira a senha do .pfx.');
  }
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  if (!certBag?.cert || !keyBag?.key) throw new Error('O arquivo .pfx não tem certificado + chave privada.');
  const cert = certBag.cert;
  const cn = cert.subject.getField('CN')?.value ?? '';
  const mCnpj = /(\d{14})/.exec(cn);
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keyBag.key),
    validade: cert.validity.notAfter,
    cnpj: mCnpj ? mCnpj[1] : null,
  };
}

const BUCKET = 'fiscal-certificados';

export async function salvarCertificado(
  client: SupabaseClient, companyId: string, pfx: Buffer, senha: string, keyHex: string,
): Promise<{ validade: Date; cnpj: string | null }> {
  const aberto = abrirPfx(pfx, senha); // valida senha ANTES de guardar
  const path = `${companyId}/cert.pfx.enc`;
  const { error: eUp } = await client.storage.from(BUCKET)
    .upload(path, Buffer.from(cifrar(pfx, keyHex), 'base64'), { upsert: true, contentType: 'application/octet-stream' });
  if (eUp) throw new Error(`Falha ao guardar o certificado: ${eUp.message}`);
  const { error } = await client.from('fiscal_config').update({
    cert_storage_path: path,
    cert_senha_cifrada: cifrar(Buffer.from(senha, 'utf8'), keyHex),
    cert_validade: aberto.validade.toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  }).eq('company_id', companyId);
  if (error) throw new Error(`Falha ao salvar config do certificado: ${error.message}`);
  return { validade: aberto.validade, cnpj: aberto.cnpj };
}

export async function carregarCertificado(
  client: SupabaseClient, companyId: string, keyHex: string,
): Promise<{ pfx: Buffer; senha: string; aberto: CertAberto }> {
  const { data: cfg, error } = await client.from('fiscal_config')
    .select('cert_storage_path, cert_senha_cifrada').eq('company_id', companyId).single();
  if (error || !cfg?.cert_storage_path || !cfg?.cert_senha_cifrada) {
    throw new Error('Certificado A1 não cadastrado. Envie o .pfx na tela de configuração fiscal.');
  }
  const { data: blob, error: eDown } = await client.storage.from(BUCKET).download(cfg.cert_storage_path);
  if (eDown || !blob) throw new Error('Não consegui baixar o certificado guardado.');
  const cifradoB64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
  const pfx = decifrar(cifradoB64, keyHex);
  const senha = decifrar(cfg.cert_senha_cifrada, keyHex).toString('utf8');
  return { pfx, senha, aberto: abrirPfx(pfx, senha) };
}
