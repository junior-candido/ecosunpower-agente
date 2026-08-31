# Módulo Fiscal F2 — Emissão automática de NFS-e (padrão nacional / NotaControl DF)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "⚡ Emitir" no dashboard transforma a nota `preparada` em NFS-e autorizada: monta a DPS XML (padrão nacional), assina com o certificado A1 (guardado cifrado no servidor), transmite ao webservice NotaControl (homologação → produção) e liga o pós-nota que a F1 já tem (caixa + PDF).

**Architecture:** Novos arquivos em `src/modules/financeiro/fiscal/` (mesmo módulo da F1): `crypto-cert` (AES-256-GCM), `certificado` (parse/upload do .pfx), `dps-xml` (builder puro), `assinatura` (XMLDSig), `notacontrol-client` (SOAP + mTLS), `motor` (orquestra). Rotas/telas em `src/modules/dashboard/router.ts` + `fiscal-views.ts`. A F1 continua funcionando como fallback ("preparar e emitir no portal").

**Tech Stack:** TypeScript ESM (imports `.js`), vitest, Supabase, `node-forge` (parse .pfx + PEM), `xml-crypto` (XMLDSig), `https.Agent` nativo (mTLS), cheerio (parse resposta SOAP — já é dependência).

**Referências no repo:**
- Spec: `docs/superpowers/specs/2026-08-30-modulo-fiscal-nfse-design.md`
- Manual oficial v1.01 (texto extraído): `docs/fiscal/manual-notacontrol-v101.txt` (9.204 linhas). Seções úteis: assinatura ~l.1064–1160 · TSIdDPS ~l.1378 · layout DPS (grupo B) ~l.3850–4200 e ~l.5895–6400 · métodos SOAP ~l.5060–5400 · homologação l.476.
- Endpoints: produção `https://nfse.fazenda.df.gov.br/wsnfsenacional/nfse.asmx` · homologação `https://nfse.issnetonline.com.br/wsnfsenacional/nfse.asmx` (caminho `/wsnfsenacional/homologacao/nfse.asmx`) · validador de XML avulso `https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/validarxml`.

**Fatos que amarram o design (do manual + portal, 31/08/2026):**
- Método escolhido: **`GerarNfse`** (síncrono, 1 DPS por chamada — nosso volume é baixo; `EnviarLoteDpsSincrono` fica pra depois se precisar).
- Comunicação: SOAP 1.1 Document/Literal wrapped, **mTLS com o próprio A1** no túnel TLS.
- Assinatura: XMLDSig **enveloped**, C14N `REC-xml-c14n-20010315`, **RSA-SHA1**, digest **SHA-1**, namespace do documento `http://www.sped.fazenda.gov.br/nfse`, certificado X509 em KeyInfo. Assina-se a `infDPS` (atributo `Id`).
- `tpAmb`: 1=produção, 2=homologação. `cLocEmi`/`cMun` Brasília: **5300108** (IBGE).
- Prestador Simples Nacional: `opSimpNac=3` (optante ME/EPP) + regime de apuração pelo SN.
- ISS: `tribISSQN=1` (tributável), `tpRetISSQN`: 1=não retido, 2=retido pelo tomador. PIS/COFINS: CST `01`.
- **Homologação exige credenciamento prévio**: (67) 3041-2075 / suporte@notaeletronica.com.br (pendência externa do Junior).

**Pendências externas (bloqueiam só os passos marcados 🔒, o resto anda):**
1. Certificado A1 novo (.pfx + senha) — Junior renova hoje 31/08.
2. Acesso ao ambiente de homologação (credenciar CNPJ 33.020.459/0001-06).
3. Env `FISCAL_CERT_KEY` (64 hex = 32 bytes) criada no EasyPanel antes do deploy.
4. Migration 112 aplicada no Supabase antes do deploy (combinar o número no grupo do WhatsApp!).

**Regras do repo que valem aqui:** branch `feat/fiscal-nfse-f2` a partir de `main` · TDD · `git add` por arquivo · `npx tsc --noEmit` limpo e `npx vitest run` verde (2 falhas pré-existentes em `tests/supabase-vincular-novo.test.ts` não são nossas) · **NUNCA push sem OK do Junior** · PR + comando de merge na mesma mensagem.

---

### Task 1: Branch + manual no repo

**Files:**
- Create: `docs/fiscal/manual-notacontrol-v101.txt` (já copiado pro working tree)

- [ ] **Step 1: Criar a branch a partir de main**

```bash
cd "/c/Users/Meu Computador/Documents/ecosunpower-agente"
git checkout main && git pull && git checkout -b feat/fiscal-nfse-f2
```

- [ ] **Step 2: Commitar o manual**

```bash
git add docs/fiscal/manual-notacontrol-v101.txt docs/superpowers/plans/2026-08-31-fiscal-nfse-f2.md
git commit -m "docs(fiscal): manual NotaControl v1.01 (texto) + plano F2

Co-Authored-By: Claude"
```

---

### Task 2: Migration 112 — campos de emissão

**Files:**
- Create: `supabase/migrations/112_fiscal_emissao.sql`

⚠️ Antes de criar: **combinar o número 112 no grupo do WhatsApp** (regra do CLAUDE.md).

- [ ] **Step 1: Escrever a migration**

```sql
-- 112: F2 fiscal — emissão automática (ambiente, numeração da DPS, chave de acesso)
ALTER TABLE fiscal_config
  ADD COLUMN IF NOT EXISTS ambiente text NOT NULL DEFAULT 'homologacao'
    CHECK (ambiente IN ('homologacao','producao')),
  ADD COLUMN IF NOT EXISTS serie_dps text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS proximo_ndps bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cod_municipio text NOT NULL DEFAULT '5300108';

ALTER TABLE fiscal_notas
  ADD COLUMN IF NOT EXISTS chave_acesso text,
  ADD COLUMN IF NOT EXISTS ambiente_emissao text
    CHECK (ambiente_emissao IN ('homologacao','producao'));

-- numeração atômica da DPS (uma linha por empresa em fiscal_config)
CREATE OR REPLACE FUNCTION fiscal_proximo_ndps(p_company uuid)
RETURNS bigint LANGUAGE sql AS $$
  UPDATE fiscal_config SET proximo_ndps = proximo_ndps + 1, updated_at = now()
  WHERE company_id = p_company
  RETURNING proximo_ndps - 1;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/112_fiscal_emissao.sql
git commit -m "feat(fiscal): migration 112 — ambiente, numeração DPS e chave de acesso

Co-Authored-By: Claude"
```

(Aplicar no Supabase SQL Editor **antes** do deploy — pendência externa nº 4.)

---

### Task 3: Dependências novas

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Instalar**

```bash
npm install node-forge xml-crypto --legacy-peer-deps
npm install -D @types/node-forge --legacy-peer-deps
```

- [ ] **Step 2: Sanity check de importação ESM**

```bash
node -e "import('node-forge').then(f=>console.log('forge ok', !!f.default.pkcs12)); import('xml-crypto').then(x=>console.log('xml-crypto ok', !!x.SignedXml))"
```
Expected: `forge ok true` e `xml-crypto ok true`. Se `xml-crypto` não expor `SignedXml` assim, conferir o export real (`x.default.SignedXml`) e usar esse shape nos arquivos seguintes.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(fiscal): node-forge + xml-crypto pra assinatura A1

Co-Authored-By: Claude"
```

---

### Task 4: `crypto-cert.ts` — cifra do certificado e da senha

**Files:**
- Create: `src/modules/financeiro/fiscal/crypto-cert.ts`
- Test: `tests/fiscal-crypto-cert.test.ts`

- [ ] **Step 1: Teste que falha**

```typescript
// tests/fiscal-crypto-cert.test.ts
import { describe, it, expect } from 'vitest';
import { cifrar, decifrar } from '../src/modules/financeiro/fiscal/crypto-cert.js';

const KEY = 'a'.repeat(64); // 32 bytes em hex

describe('crypto-cert', () => {
  it('cifra e decifra buffer (roundtrip)', () => {
    const dado = Buffer.from('conteudo do pfx');
    const cifrado = cifrar(dado, KEY);
    expect(cifrado).not.toContain('conteudo');
    expect(decifrar(cifrado, KEY).toString()).toBe('conteudo do pfx');
  });
  it('chave errada não decifra', () => {
    const cifrado = cifrar(Buffer.from('x'), KEY);
    expect(() => decifrar(cifrado, 'b'.repeat(64))).toThrow();
  });
  it('rejeita chave com tamanho errado', () => {
    expect(() => cifrar(Buffer.from('x'), 'curta')).toThrow(/FISCAL_CERT_KEY/);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/fiscal-crypto-cert.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/fiscal/crypto-cert.ts
// Cifra AES-256-GCM pro .pfx e pra senha do certificado. A chave vem do env
// FISCAL_CERT_KEY (64 hex). Formato do texto cifrado: base64(iv|tag|dados).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function chave(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex ?? '')) throw new Error('FISCAL_CERT_KEY inválida: precisa de 64 caracteres hex (32 bytes).');
  return Buffer.from(hex, 'hex');
}

export function cifrar(dado: Buffer, keyHex: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(keyHex), iv);
  const corpo = Buffer.concat([c.update(dado), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64');
}

export function decifrar(cifradoB64: string, keyHex: string): Buffer {
  const tudo = Buffer.from(cifradoB64, 'base64');
  const iv = tudo.subarray(0, 12), tag = tudo.subarray(12, 28), corpo = tudo.subarray(28);
  const d = createDecipheriv('aes-256-gcm', chave(keyHex), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(corpo), d.final()]);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/fiscal-crypto-cert.test.ts`
Expected: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/fiscal/crypto-cert.ts tests/fiscal-crypto-cert.test.ts
git commit -m "feat(fiscal): cifra AES-256-GCM pro certificado A1

Co-Authored-By: Claude"
```

---

### Task 5: `certificado.ts` — parse do .pfx e guarda cifrada

**Files:**
- Create: `src/modules/financeiro/fiscal/certificado.ts`
- Test: `tests/fiscal-certificado.test.ts`

- [ ] **Step 1: Teste que falha (gera um .pfx de mentira com o próprio forge)**

```typescript
// tests/fiscal-certificado.test.ts
import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { abrirPfx } from '../src/modules/financeiro/fiscal/certificado.js';

function pfxDeTeste(senha: string, cn: string): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const attrs = [{ name: 'commonName', value: cn }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary');
}

describe('certificado', () => {
  it('abre pfx com a senha certa e extrai pems + validade', () => {
    const pfx = pfxDeTeste('1234', 'ECOSUNPOWER ENERGIA SOLAR LTDA:33020459000106');
    const c = abrirPfx(pfx, '1234');
    expect(c.certPem).toContain('BEGIN CERTIFICATE');
    expect(c.keyPem).toContain('BEGIN RSA PRIVATE KEY');
    expect(c.validade.getTime()).toBeGreaterThan(Date.now());
    expect(c.cnpj).toBe('33020459000106');
  });
  it('senha errada dá erro claro em PT', () => {
    const pfx = pfxDeTeste('1234', 'X');
    expect(() => abrirPfx(pfx, 'errada')).toThrow(/senha/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/fiscal-certificado.test.ts`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/fiscal/certificado.ts
// Abre o .pfx (A1), extrai chave + certificado em PEM, validade e CNPJ do titular.
// e-CNPJ ICP-Brasil traz o CNPJ no CN ("RAZAO SOCIAL:NNNNNNNNNNNNNN") ou em OID 2.16.76.1.3.3.
import forge from 'node-forge';

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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/fiscal-certificado.test.ts`
Expected: PASS. Se o regex do CNPJ falhar no teste, simplificar para `/(\d{14})/.exec(cn)` — o que importa é achar 14 dígitos no CN.

- [ ] **Step 5: Funções de guarda (usam Supabase — testadas via mock leve)**

Acrescentar ao MESMO arquivo:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { cifrar, decifrar } from './crypto-cert.js';

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
```

Teste adicional no mesmo test file (mock de client com `storage.from().upload/download` e `from().update/select` — seguir o padrão de mocks de `tests/fiscal-notas-repo.test.ts`):

```typescript
  it('salvarCertificado valida a senha antes de guardar', async () => {
    const pfx = pfxDeTeste('1234', 'X');
    const client = { storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) } as never;
    await expect(salvarCertificado(client, 'c1', pfx, 'senha-errada', 'a'.repeat(64))).rejects.toThrow(/senha/i);
  });
```

- [ ] **Step 6: Rodar tudo do arquivo e ver passar**

Run: `npx vitest run tests/fiscal-certificado.test.ts`
Expected: PASS

- [ ] **Step 7: Criar o bucket no Supabase (anotar como passo de deploy, não de código)**

Adicionar ao final da migration 112 (Task 2), se ainda não commitada — senão criar à mão no painel Supabase:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('fiscal-certificados', 'fiscal-certificados', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 8: Commit**

```bash
git add src/modules/financeiro/fiscal/certificado.ts tests/fiscal-certificado.test.ts supabase/migrations/112_fiscal_emissao.sql
git commit -m "feat(fiscal): abre .pfx (forge), valida senha e guarda cifrado no storage

Co-Authored-By: Claude"
```

---

### Task 6: `dps-xml.ts` — builder da DPS (padrão nacional)

**Files:**
- Create: `src/modules/financeiro/fiscal/dps-xml.ts`
- Test: `tests/fiscal-dps-xml.test.ts`

Referência obrigatória: `docs/fiscal/manual-notacontrol-v101.txt` — grupo B (infDPS) ~l.5895 em diante; TSIdDPS ~l.1378 (Id = "DPS" + cLocEmi(7) + tpInscricao(1: 1=CPF? conferir tabela — pro CNPJ usar o código da tabela) + inscrição(14, CPF completa com zeros) + série(5, zeros à esquerda) + nDPS(15, zeros à esquerda) — **CONFERIR a composição exata na seção 4.5 do manual antes de fechar o formato**).

- [ ] **Step 1: Teste que falha**

```typescript
// tests/fiscal-dps-xml.test.ts
import { describe, it, expect } from 'vitest';
import { montarDpsXml } from '../src/modules/financeiro/fiscal/dps-xml.js';

const entrada = {
  ambiente: 'homologacao' as const,
  dhEmi: new Date('2026-08-31T12:00:00-03:00'),
  serie: '1', nDps: 42,
  competencia: '2026-08-31',
  codMunicipio: '5300108',
  prestador: { cnpj: '33020459000106', im: '0790506200159' },
  tomador: { tipo: 'PJ' as const, doc: '13245160000142', nome: 'CONDOMINIO DO EDIFICIO SPAZIO VERDE',
    cep: '70000000', codMunicipio: '5300108', email: null },
  servico: { codTribNacional: '31.01.02', descricao: 'adequação do sistema de aterramento elétrico' },
  valores: { vServ: 1250.00, aliquotaIss: 0.05, issRetido: true },
};

describe('dps-xml', () => {
  it('gera XML com os campos essenciais', () => {
    const { xml, idDps } = montarDpsXml(entrada);
    expect(xml).toContain('<tpAmb>2</tpAmb>');                    // homologação
    expect(xml).toContain('<serie>1</serie>');
    expect(xml).toContain('<nDPS>42</nDPS>');
    expect(xml).toContain('<dCompet>2026-08-31</dCompet>');
    expect(xml).toContain('<CNPJ>33020459000106</CNPJ>');
    expect(xml).toContain('<cTribNac>310102</cTribNac>');          // sem pontos
    expect(xml).toContain('<vServ>1250.00</vServ>');
    expect(xml).toContain('<tpRetISSQN>2</tpRetISSQN>');           // retido pelo tomador
    expect(xml).toContain('xmlns="http://www.sped.fazenda.gov.br/nfse"');
    expect(xml).toContain(`Id="${idDps}"`);
    expect(idDps.startsWith('DPS')).toBe(true);
  });
  it('sem retenção manda tpRetISSQN=1', () => {
    const { xml } = montarDpsXml({ ...entrada, valores: { ...entrada.valores, issRetido: false } });
    expect(xml).toContain('<tpRetISSQN>1</tpRetISSQN>');
  });
  it('tomador PF sai com CPF', () => {
    const { xml } = montarDpsXml({ ...entrada, tomador: { ...entrada.tomador, tipo: 'PF', doc: '12345678901' } });
    expect(xml).toContain('<CPF>12345678901</CPF>');
  });
  it('escapa caracteres especiais na descrição', () => {
    const { xml } = montarDpsXml({ ...entrada, servico: { ...entrada.servico, descricao: 'a & b < c' } });
    expect(xml).toContain('a &amp; b &lt; c');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/fiscal-dps-xml.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar (função pura, sem dependências)**

```typescript
// src/modules/financeiro/fiscal/dps-xml.ts
// Monta a DPS XML do padrão nacional (manual NotaControl v1.01, grupo B).
// Função PURA: entra dado, sai string — o teste cobre a estrutura; a validação
// final é do validador oficial (homologação) na Task 10.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const dec2 = (n: number) => n.toFixed(2);
const soDigitos = (s: string) => s.replace(/\D/g, '');

export interface EntradaDps {
  ambiente: 'homologacao' | 'producao';
  dhEmi: Date; serie: string; nDps: number; competencia: string; codMunicipio: string;
  prestador: { cnpj: string; im: string };
  tomador: { tipo: 'PJ' | 'PF'; doc: string; nome: string; cep: string | null; codMunicipio: string; email: string | null };
  servico: { codTribNacional: string; descricao: string };
  valores: { vServ: number; aliquotaIss: number; issRetido: boolean };
}

export function montarDpsXml(e: EntradaDps): { xml: string; idDps: string } {
  const tpAmb = e.ambiente === 'producao' ? '1' : '2';
  const cnpj = soDigitos(e.prestador.cnpj);
  // Id da DPS (TSIdDPS, 45 posições): "DPS" + cLocEmi(7) + tipoInscricao(1: 2=CNPJ) +
  // inscricao(14) + serie(5) + nDPS(15). CONFERIR seção 4.5 do manual na Task 10 (validador).
  const idDps = `DPS${e.codMunicipio}2${cnpj.padStart(14, '0')}${e.serie.padStart(5, '0')}${String(e.nDps).padStart(15, '0')}`;
  const docTomador = e.tomador.tipo === 'PJ'
    ? `<CNPJ>${soDigitos(e.tomador.doc)}</CNPJ>`
    : `<CPF>${soDigitos(e.tomador.doc)}</CPF>`;
  const dhEmi = e.dhEmi.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const tpRet = e.valores.issRetido ? '2' : '1';
  const endTomador = e.tomador.cep
    ? `<end><endNac><cMun>${e.tomador.codMunicipio}</cMun><CEP>${soDigitos(e.tomador.cep)}</CEP></endNac></end>`
    : '';
  const email = e.tomador.email ? `<email>${esc(e.tomador.email)}</email>` : '';
  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">
<infDPS Id="${idDps}">
<tpAmb>${tpAmb}</tpAmb>
<dhEmi>${dhEmi}</dhEmi>
<verAplic>EcoSunDash-F2</verAplic>
<serie>${e.serie}</serie>
<nDPS>${e.nDps}</nDPS>
<dCompet>${e.competencia}</dCompet>
<tpEmit>1</tpEmit>
<cLocEmi>${e.codMunicipio}</cLocEmi>
<prest>
<CNPJ>${cnpj}</CNPJ>
<IM>${esc(e.prestador.im)}</IM>
<regTrib>
<opSimpNac>3</opSimpNac>
<regEspTrib>0</regEspTrib>
</regTrib>
</prest>
<toma>
${docTomador}
<xNome>${esc(e.tomador.nome)}</xNome>
${endTomador}
${email}
</toma>
<serv>
<locPrest>
<cLocPrestacao>${e.codMunicipio}</cLocPrestacao>
</locPrest>
<cServ>
<cTribNac>${soDigitos(e.servico.codTribNacional)}</cTribNac>
<xDescServ>${esc(e.servico.descricao)}</xDescServ>
</cServ>
</serv>
<valores>
<vServPrest>
<vServ>${dec2(e.valores.vServ)}</vServ>
</vServPrest>
<trib>
<tribMun>
<tribISSQN>1</tribISSQN>
<tpRetISSQN>${tpRet}</tpRetISSQN>
</tribMun>
<totTrib>
<indTotTrib>0</indTotTrib>
</totTrib>
</trib>
</valores>
</infDPS>
</DPS>`;
  return { xml, idDps };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/fiscal-dps-xml.test.ts`
Expected: PASS

⚠️ Nota pro executor: os nomes/aninhamento acima seguem o manual, mas o juiz final é o **validador de homologação** (Task 10). O que ele apontar (ex.: `regEspTrib`, grupo `totTrib`, formato do Id), corrige-se AQUI e nos testes — nunca "na mão" no XML já gerado.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/fiscal/dps-xml.ts tests/fiscal-dps-xml.test.ts
git commit -m "feat(fiscal): builder da DPS XML padrão nacional

Co-Authored-By: Claude"
```

---

### Task 7: `assinatura.ts` — XMLDSig enveloped

**Files:**
- Create: `src/modules/financeiro/fiscal/assinatura.ts`
- Test: `tests/fiscal-assinatura.test.ts`

- [ ] **Step 1: Teste que falha (usa o pfx de teste da Task 5)**

```typescript
// tests/fiscal-assinatura.test.ts
import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { assinarDps } from '../src/modules/financeiro/fiscal/assinatura.js';
import { montarDpsXml } from '../src/modules/financeiro/fiscal/dps-xml.js';

// gera par chave/cert (mesmo helper da Task 5 — duplicado de propósito: testes independentes)
function parDeTeste() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '01';
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: 'commonName', value: 'TESTE' }];
  cert.setSubject(attrs); cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { keyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

const entrada = {
  ambiente: 'homologacao' as const, dhEmi: new Date(), serie: '1', nDps: 1,
  competencia: '2026-08-31', codMunicipio: '5300108',
  prestador: { cnpj: '33020459000106', im: '0790506200159' },
  tomador: { tipo: 'PJ' as const, doc: '13245160000142', nome: 'SPAZIO', cep: null, codMunicipio: '5300108', email: null },
  servico: { codTribNacional: '31.01.02', descricao: 'teste' },
  valores: { vServ: 1, aliquotaIss: 0.05, issRetido: true },
};

describe('assinatura', () => {
  it('assina a infDPS: Signature dentro de DPS, com X509 e referência ao Id', () => {
    const { keyPem, certPem } = parDeTeste();
    const { xml, idDps } = montarDpsXml(entrada);
    const assinado = assinarDps(xml, idDps, keyPem, certPem);
    expect(assinado).toContain('<Signature');
    expect(assinado).toContain('X509Certificate');
    expect(assinado).toContain(`Reference URI="#${idDps}"`);
    expect(assinado).toContain('rsa-sha1');
    expect(assinado.indexOf('</DPS>')).toBeGreaterThan(assinado.indexOf('</Signature>'));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/fiscal-assinatura.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/fiscal/assinatura.ts
// Assinatura XMLDSig da DPS conforme manual v1.01 §7.3.3: enveloped,
// C14N REC-xml-c14n-20010315, RSA-SHA1, digest SHA-1, X509 no KeyInfo.
// (RSA-SHA1 é exigência do padrão do fisco, não escolha nossa.)
import { SignedXml } from 'xml-crypto';

export function assinarDps(xml: string, idDps: string, keyPem: string, certPem: string): string {
  const sig = new SignedXml({
    privateKey: keyPem,
    publicCert: certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  });
  sig.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    uri: `#${idDps}`,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  });
  sig.computeSignature(xml, {
    // Signature entra como último filho de <DPS> (irmão de infDPS)
    location: { reference: "//*[local-name(.)='infDPS']", action: 'after' },
  });
  return sig.getSignedXml();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/fiscal-assinatura.test.ts`
Expected: PASS. Atenção às diferenças de versão do `xml-crypto`: se o construtor não aceitar objeto, usar a API da versão instalada (`sig.signingKey = ...`, `sig.keyInfoProvider = ...`). Ajustar mantendo algoritmos idênticos.

- [ ] **Step 5: Commit**

```bash
git add src/modules/financeiro/fiscal/assinatura.ts tests/fiscal-assinatura.test.ts
git commit -m "feat(fiscal): assinatura XMLDSig enveloped da DPS (RSA-SHA1, C14N)

Co-Authored-By: Claude"
```

---

### Task 8: `notacontrol-client.ts` — SOAP GerarNfse com mTLS

**Files:**
- Create: `src/modules/financeiro/fiscal/notacontrol-client.ts`
- Test: `tests/fiscal-notacontrol-client.test.ts`

- [ ] **Step 1: 🔒 Descobrir o envelope exato via WSDL (precisa de rede; se o WSDL exigir mTLS, precisa do A1 — aí este step vira manual com o Junior)**

```bash
curl -s -A "Mozilla/5.0" "https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx?wsdl" -o wsdl-homolog.xml && grep -o 'soapAction="[^"]*"' wsdl-homolog.xml | head && grep -o 'targetNamespace="[^"]*"' wsdl-homolog.xml | head -3
```
Expected: lista de soapActions (uma contendo `GerarNfse`) e o targetNamespace. **Anotar os dois no topo do arquivo do client.** Se der 403/erro TLS, seguir com os defaults abaixo (`http://nfse.abrasf.org.br/GerarNfse` é o chute do padrão — MARCAR como "conferir na homologação") e validar no primeiro teste real.

- [ ] **Step 2: Teste que falha (só o que dá pra testar sem rede: envelope + parse da resposta)**

```typescript
// tests/fiscal-notacontrol-client.test.ts
import { describe, it, expect } from 'vitest';
import { montarEnvelope, interpretarResposta } from '../src/modules/financeiro/fiscal/notacontrol-client.js';

describe('notacontrol-client', () => {
  it('envelopa a DPS assinada no SOAP de GerarNfse', () => {
    const env = montarEnvelope('GerarNfse', '<DPS>x</DPS>');
    expect(env).toContain('soap:Envelope');
    expect(env).toContain('GerarNfse');
    expect(env).toContain('<DPS>x</DPS>');
  });
  it('resposta com NFS-e vira sucesso (numero + chave)', () => {
    const resp = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <GerarNfseResponse><GerarNfseResult>
        <ListaNfse><CompNfse><NFSe><infNFSe Id="NFS123"><nNFSe>84</nNFSe><chaveAcesso>530010800000084</chaveAcesso>
        </infNFSe></NFSe></CompNfse></ListaNfse>
      </GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;
    const r = interpretarResposta(resp);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.numero).toBe('84'); expect(r.xmlNfse).toContain('NFSe'); }
  });
  it('resposta com mensagens de erro vira lista traduzível', () => {
    const resp = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <GerarNfseResponse><GerarNfseResult>
        <ListaMensagemRetorno><MensagemRetorno><Codigo>E160</Codigo><Mensagem>Valor invalido</Mensagem><Correcao>Corrija o valor</Correcao></MensagemRetorno></ListaMensagemRetorno>
      </GerarNfseResult></GerarNfseResponse></soap:Body></soap:Envelope>`;
    const r = interpretarResposta(resp);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.erros[0].codigo).toBe('E160'); expect(r.erros[0].mensagem).toContain('Valor'); }
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npx vitest run tests/fiscal-notacontrol-client.test.ts`
Expected: FAIL

- [ ] **Step 4: Implementar**

```typescript
// src/modules/financeiro/fiscal/notacontrol-client.ts
// Cliente SOAP do webservice NFS-e padrão nacional (NotaControl/ISSNet DF).
// mTLS: o próprio A1 autentica o túnel (https.Agent com pfx).
// SOAPAction/namespace: conferidos no WSDL (Task 8 Step 1) — ajustar as consts se divergirem.
import { Agent, request } from 'node:https';
import * as cheerio from 'cheerio';

export const ENDPOINTS = {
  homologacao: 'https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/nfse.asmx',
  producao: 'https://nfse.fazenda.df.gov.br/wsnfsenacional/nfse.asmx',
} as const;
const NS = 'http://nfse.abrasf.org.br'; // ⚠️ conferir no WSDL

export function montarEnvelope(metodo: string, xmlAssinado: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body><${metodo} xmlns="${NS}">${xmlAssinado}</${metodo}></soap:Body>
</soap:Envelope>`;
}

export interface ErroFiscal { codigo: string; mensagem: string; correcao: string | null }
export type RespostaGerar =
  | { ok: true; numero: string | null; chaveAcesso: string | null; xmlNfse: string }
  | { ok: false; erros: ErroFiscal[] };

export function interpretarResposta(soapXml: string): RespostaGerar {
  const $ = cheerio.load(soapXml, { xmlMode: true });
  const erros: ErroFiscal[] = [];
  $('MensagemRetorno').each((_, el) => {
    erros.push({
      codigo: $(el).find('Codigo').first().text().trim(),
      mensagem: $(el).find('Mensagem').first().text().trim(),
      correcao: $(el).find('Correcao').first().text().trim() || null,
    });
  });
  const comp = $('CompNfse').first();
  if (comp.length > 0) {
    return {
      ok: true,
      numero: comp.find('nNFSe').first().text().trim() || null,
      chaveAcesso: comp.find('chaveAcesso').first().text().trim() || null,
      xmlNfse: $.xml(comp),
    };
  }
  if (erros.length === 0) erros.push({ codigo: 'SEM_RESPOSTA', mensagem: 'O webservice respondeu num formato inesperado.', correcao: null });
  return { ok: false, erros };
}

export async function chamarGerarNfse(
  ambiente: keyof typeof ENDPOINTS, dpsAssinada: string, pfx: Buffer, senhaPfx: string,
): Promise<RespostaGerar> {
  const corpo = montarEnvelope('GerarNfse', dpsAssinada);
  const url = new URL(ENDPOINTS[ambiente]);
  const agent = new Agent({ pfx, passphrase: senhaPfx });
  const soapXml = await new Promise<string>((resolve, reject) => {
    const req = request({
      hostname: url.hostname, path: url.pathname, method: 'POST', agent, timeout: 60000,
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `${NS}/GerarNfse` },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => reject(new Error(`Falha de conexão com o fisco (${ambiente}): ${e.message}`)));
    req.write(corpo); req.end();
  });
  return interpretarResposta(soapXml);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/fiscal-notacontrol-client.test.ts`
Expected: PASS (3 testes — nenhum toca a rede)

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/fiscal/notacontrol-client.ts tests/fiscal-notacontrol-client.test.ts
git commit -m "feat(fiscal): cliente SOAP GerarNfse com mTLS do A1

Co-Authored-By: Claude"
```

---

### Task 9: `motor.ts` — orquestração da emissão

**Files:**
- Create: `src/modules/financeiro/fiscal/motor.ts`
- Test: `tests/fiscal-motor.test.ts`
- Ler antes: `src/modules/financeiro/fiscal/ponte-caixa.ts` (41 linhas) e como o POST `/fiscal/:id/anexar` do router chama a ponte — o motor reusa EXATAMENTE a mesma função pós-autorização.

- [ ] **Step 1: Teste que falha (client Supabase mockado + client SOAP injetado)**

```typescript
// tests/fiscal-motor.test.ts
import { describe, it, expect, vi } from 'vitest';
import { emitirNota } from '../src/modules/financeiro/fiscal/motor.js';

// deps injetadas pra não tocar rede/banco de verdade
function depsFake(overrides: Partial<Parameters<typeof emitirNota>[0]> = {}) {
  return {
    carregarNota: vi.fn(async () => ({
      id: 'n1', status: 'preparada', competencia: '2026-08-31',
      tomador: { tipo: 'PJ', doc: '13245160000142', nome: 'SPAZIO', im: null, endereco: '', email: null, municipio: 'Brasília', uf: 'DF' },
      servicoId: 's1', valorBruto: 1250, valorIss: 62.5, issRetido: true, valorLiquido: 1187.5, descricao: 'aterramento',
    })),
    carregarConfig: vi.fn(async () => ({
      ambiente: 'producao', serie: '1', codMunicipio: '5300108',
      cnpj: '33.020.459/0001-06', im: '0790506200159', certOk: true, certValidade: '2027-08-31',
    })),
    carregarServico: vi.fn(async () => ({ codTribNacional: '31.01.02' })),
    proximoNdps: vi.fn(async () => 7),
    carregarCert: vi.fn(async () => ({ pfx: Buffer.from('x'), senha: 's', keyPem: 'k', certPem: 'c' })),
    assinar: vi.fn((xml: string) => xml + '<Signature/>'),
    enviar: vi.fn(async () => ({ ok: true as const, numero: '84', chaveAcesso: 'CH123', xmlNfse: '<NFSe/>' })),
    salvarAutorizada: vi.fn(async () => {}),
    salvarRejeicao: vi.fn(async () => {}),
    registrarEvento: vi.fn(async () => {}),
    posAutorizada: vi.fn(async () => {}),   // ponte-caixa
    ...overrides,
  };
}

describe('motor de emissão', () => {
  it('fluxo feliz: monta, assina, envia, salva autorizada e chama a ponte do caixa', async () => {
    const deps = depsFake();
    const r = await emitirNota(deps, 'c1', 'n1');
    expect(r.ok).toBe(true);
    expect(deps.assinar).toHaveBeenCalled();
    expect(deps.salvarAutorizada).toHaveBeenCalledWith(expect.objectContaining({ numero: '84', chaveAcesso: 'CH123' }));
    expect(deps.posAutorizada).toHaveBeenCalled();
  });
  it('em homologação NÃO mexe no caixa (ponte não roda)', async () => {
    const deps = depsFake({ carregarConfig: vi.fn(async () => ({
      ambiente: 'homologacao', serie: '1', codMunicipio: '5300108',
      cnpj: '33.020.459/0001-06', im: '0790506200159', certOk: true, certValidade: '2027-08-31',
    })) });
    const r = await emitirNota(deps, 'c1', 'n1');
    expect(r.ok).toBe(true);
    expect(deps.posAutorizada).not.toHaveBeenCalled();
  });
  it('rejeição do fisco: nota volta como preparada + evento com erro em PT, ponte NÃO roda', async () => {
    const deps = depsFake({ enviar: vi.fn(async () => ({ ok: false as const, erros: [{ codigo: 'E160', mensagem: 'Valor invalido', correcao: 'Corrija' }] })) });
    const r = await emitirNota(deps, 'c1', 'n1');
    expect(r.ok).toBe(false);
    expect(deps.salvarRejeicao).toHaveBeenCalled();
    expect(deps.posAutorizada).not.toHaveBeenCalled();
  });
  it('nota que não está preparada não emite', async () => {
    const deps = depsFake({ carregarNota: vi.fn(async () => ({ status: 'autorizada' }) as never) });
    await expect(emitirNota(deps, 'c1', 'n1')).rejects.toThrow(/preparada/);
  });
  it('sem certificado não emite', async () => {
    const deps = depsFake({ carregarConfig: vi.fn(async () => ({ certOk: false }) as never) });
    await expect(emitirNota(deps, 'c1', 'n1')).rejects.toThrow(/certificado/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/fiscal-motor.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar**

```typescript
// src/modules/financeiro/fiscal/motor.ts
// Orquestra a emissão: nota preparada → DPS assinada → GerarNfse → autorizada + ponte-caixa.
// Deps injetadas (banco/rede/cert) pra testar sem tocar nada de verdade; a fábrica
// `emitirNotaProducao` liga as deps reais (repo, certificado, client, ponte).
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
```

⚠️ Decisões embutidas (conferir com o Junior na revisão):
- **Rejeição NÃO muda o status** pra 'rejeitada': a nota continua `preparada` (editável) + evento com os erros — evita nota morta e respeita o índice de dedupe (que ignora rejeitada/cancelada). `salvarRejeicao` só grava o último erro num campo de evento.
- **Homologação não toca o caixa** (nota de teste não vira conta a receber) — coberto pelo teste "em homologação NÃO mexe no caixa".

- [ ] **Step 4: Fábrica com as deps reais**

Acrescentar ao MESMO arquivo (`motor.ts`) — liga repo/cert/client/ponte de verdade. Ler `ponte-caixa.ts` antes pra usar a função real (nome/assinatura exatos estão lá; na F1 ela roda no fluxo de anexar PDF):

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNota, listarServicos, registrarEvento as evtRepo } from './notas-repo.js';
import { carregarCertificado } from './certificado.js';
import { abrirPfx } from './certificado.js';
import { assinarDps } from './assinatura.js';
import { chamarGerarNfse } from './notacontrol-client.js';

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
    salvarRejeicao: async () => { /* status fica preparada; erro vive em fiscal_eventos */ },
    registrarEvento: (notaId, tipo, detalhe) => evtRepo(client, notaId, tipo, detalhe),
    posAutorizada: async (companyId, notaId) => {
      // REUSAR a função da ponte da F1 (mesma do fluxo de anexar PDF).
      // Ler src/modules/financeiro/fiscal/ponte-caixa.ts e o handler POST /fiscal/:id/anexar
      // no router — importar e chamar a MESMA função com os MESMOS argumentos daquele fluxo.
      const { criarContaEIssDaNota } = await import('./ponte-caixa.js');
      await (criarContaEIssDaNota as (c: SupabaseClient, cid: string, nid: string) => Promise<void>)(client, companyId, notaId);
    },
  };
}
```

⚠️ O nome `criarContaEIssDaNota` é chute documentado — o executor DEVE abrir `ponte-caixa.ts` e usar o export real (e os argumentos reais do fluxo de anexar). Se a assinatura for outra (ex.: recebe a nota inteira), adaptar aqui, nunca lá.

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/fiscal-motor.test.ts`
Expected: PASS (5 testes: feliz-produção com ponte, homologação sem ponte, rejeição, não-preparada, sem certificado)

- [ ] **Step 6: Commit**

```bash
git add src/modules/financeiro/fiscal/motor.ts tests/fiscal-motor.test.ts
git commit -m "feat(fiscal): motor de emissão (DPS→assina→GerarNfse→caixa)

Co-Authored-By: Claude"
```

---

### Task 10: Rotas + telas (config do certificado e botão Emitir)

**Files:**
- Modify: `src/modules/dashboard/router.ts` (bloco fiscal, ~l.721–880)
- Modify: `src/modules/dashboard/fiscal-views.ts`
- Test: `tests/fiscal-views.test.ts` (se existir padrão de teste de views; senão testar só helpers)

- [ ] **Step 1: Tela de configuração — GET `/dashboard/fiscal/config`**

Em `fiscal-views.ts`, nova função `renderConfigFiscalPage(cfg, erro?, ok?)` seguindo o estilo das views existentes (server-rendered, PT-BR, escapeHtml em TUDO que vem do banco — padrão da F1):
- Mostra: razão social, CNPJ, IM, **ambiente atual (radio homologação/produção)**, validade do certificado (ou "não cadastrado"), série/próximo nº da DPS.
- Form multipart: arquivo `.pfx` + campo senha (type=password, `autocomplete="off"`) + botão "Salvar certificado".
- Aviso fixo: "A senha é guardada cifrada e usada só na hora de assinar." e, se ambiente=homologação: banner amarelo "⚠️ Ambiente de TESTE — as notas emitidas aqui não valem".

- [ ] **Step 2: POST `/dashboard/fiscal/config` (upload)**

No `router.ts`, seguindo o padrão dos handlers fiscais (dynamic import + try/catch + redirect com `?erro=`):

```typescript
router.post('/fiscal/config', exigir('financeiro', 'editar'), upload.single('pfx'), async (req: AuthedRequest, res) => {
  try {
    const keyHex = process.env.FISCAL_CERT_KEY ?? '';
    const senha = String(req.body?.senha ?? '');
    const ambiente = req.body?.ambiente === 'producao' ? 'producao' : 'homologacao';
    const { salvarCertificado } = await import('../financeiro/fiscal/certificado.js');
    const companyId = req.companyId!; // mesmo accessor usado nos outros handlers fiscais — conferir o nome real no router
    if (req.file?.buffer && senha) {
      await salvarCertificado(getSupabase(), companyId, req.file.buffer, senha, keyHex);
    }
    await getSupabase().from('fiscal_config').update({ ambiente, updated_at: new Date().toISOString() }).eq('company_id', companyId);
    res.redirect('/dashboard/fiscal/config?ok=1');
  } catch (err) {
    res.redirect('/dashboard/fiscal/config?erro=' + encodeURIComponent((err as Error).message));
  }
});
```

(`upload` = multer já usado no projeto; conferir a instância existente no router e reusar. Conferir também como os outros handlers obtêm `companyId` e o client Supabase — usar o MESMO padrão.)

- [ ] **Step 3: Botão Emitir na tela da nota + POST `/fiscal/:id/emitir`**

- `fiscal-views.ts`: na página da nota `preparada`, além de "emitir no portal" (fica como plano B), botão primário **"⚡ Emitir agora"** (form POST) — só aparece se config tem certificado; senão, link "Cadastrar certificado A1" pra `/dashboard/fiscal/config`. Badge do ambiente ao lado do botão ("HOMOLOGAÇÃO — teste" em amarelo / "PRODUÇÃO" em verde).
- `router.ts`:

```typescript
router.post('/fiscal/:id/emitir', exigir('financeiro', 'editar'), async (req: AuthedRequest, res) => {
  const notaId = String(req.params.id);
  try {
    const keyHex = process.env.FISCAL_CERT_KEY ?? '';
    const { emitirNota, depsProducao } = await import('../financeiro/fiscal/motor.js');
    const companyId = req.companyId!;
    const r = await emitirNota(depsProducao(getSupabase(), keyHex), companyId, notaId);
    if (r.ok) {
      res.redirect(`/dashboard/fiscal/${notaId}?emitida=${encodeURIComponent(r.numero ?? '')}`);
    } else {
      const msg = r.erros.map((e) => `${e.codigo}: ${e.mensagem}${e.correcao ? ` → ${e.correcao}` : ''}`).join(' · ');
      res.redirect(`/dashboard/fiscal/${notaId}?erro=` + encodeURIComponent(msg));
    }
  } catch (err) {
    res.redirect(`/dashboard/fiscal/${notaId}?erro=` + encodeURIComponent((err as Error).message));
  }
});
```

- [ ] **Step 4: Página da nota autorizada mostra os dados da emissão**

Nota `autorizada` com `chave_acesso`: mostrar nº, chave, ambiente, botão "Baixar XML" (rota GET `/fiscal/:id/xml` devolvendo `xml_nfse` com `Content-Type: text/xml` e escopo `company_id` — MESMO padrão anti-IDOR da F1) e manter o fluxo de anexar PDF (o PDF oficial continua vindo do portal por enquanto; gerar DANFSe própria fica pra F3).

- [ ] **Step 5: tsc + suíte inteira**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc limpo; suíte verde (fora as 2 falhas pré-existentes de `tests/supabase-vincular-novo.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add src/modules/dashboard/router.ts src/modules/dashboard/fiscal-views.ts tests/fiscal-views.test.ts
git commit -m "feat(fiscal): tela config A1 + botão Emitir agora (homolog/prod)

Co-Authored-By: Claude"
```

---

### Task 11: Validação do XML no validador oficial 🔒

(Depende de rede; não depende do A1 — o validador avalia estrutura.)

- [ ] **Step 1: Gerar uma DPS de exemplo**

```bash
node --input-type=module -e "
import('./dist-ou-tsx.js').catch(async () => {
  const { montarDpsXml } = await import('./src/modules/financeiro/fiscal/dps-xml.ts');
});" 
```
Na prática: rodar via vitest um teste utilitário que escreve `scratch/dps-exemplo.xml` (ou copiar o XML de um `console.log` no teste). O arquivo NÃO entra no git.

- [ ] **Step 2: Validar em https://nfse.issnetonline.com.br/wsnfsenacional/homologacao/validarxml**

Abrir no navegador (Playwright com o Junior), colar o XML, rodar. Cada erro apontado → corrigir `dps-xml.ts` + testes (nomes de elemento, ordem, grupos obrigatórios — ex.: IBS/CBS pode ser exigido; o validador dirá). Repetir até "XML válido".

- [ ] **Step 3: Commit dos ajustes**

```bash
git add src/modules/financeiro/fiscal/dps-xml.ts tests/fiscal-dps-xml.test.ts
git commit -m "fix(fiscal): DPS ajustada conforme validador oficial de homologação

Co-Authored-By: Claude"
```

---

### Task 12: Revisão final + PR (sem push até o OK)

- [ ] **Step 1: Self-review do diff completo**

```bash
git diff main...feat/fiscal-nfse-f2 --stat && git log --oneline main..feat/fiscal-nfse-f2
```
Checar: nenhum secret/senha em log · escapeHtml em toda view nova · escopo `company_id` em TODA query nova (anti-IDOR, lição da F1) · mensagens de erro em PT claro.

- [ ] **Step 2: Suíte inteira + tsc de novo**

Run: `npx tsc --noEmit && npx vitest run`
Expected: verde.

- [ ] **Step 3: Mostrar ao Junior e PEDIR OK pra push** (regra do repo). Com o OK:

```bash
git push -u origin feat/fiscal-nfse-f2
gh pr create --title "🧾 Fiscal F2 — emissão automática de NFS-e (padrão nacional)" --body "..."
```
E entregar na MESMA mensagem o comando de merge (`gh pr merge N --squash`).

---

## Depois do merge (roteiro de ativação — precisa do Junior)

1. Criar env `FISCAL_CERT_KEY` no EasyPanel: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → colar no painel.
2. Aplicar migration 112 no Supabase (inclui bucket `fiscal-certificados`).
3. Implantar; conferir `/health` (carimbo do build).
4. 🔒 Credenciar homologação: ligar (67) 3041-2075 ou e-mail suporte@notaeletronica.com.br (CNPJ 33.020.459/0001-06).
5. 🔒 A1 novo chegou → `/dashboard/fiscal/config` → upload .pfx + senha → validade aparece → alerta 30/15/5 dias passa a valer com data real.
6. Emitir a nota do Spazio em **homologação** (tpAmb=2) → conferir retorno → trocar ambiente pra **produção** → 1ª nota real assistida (valor pequeno) → conferir conta a receber + ISS no caixa.
