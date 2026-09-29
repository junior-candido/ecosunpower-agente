# NFS-e — virar a emissão pra PRODUÇÃO (EcoSunPower)

Roteiro pro dono da empresa. Nada aqui foi rodado no banco — cada SQL é pra colar
no **Supabase → SQL Editor** na ordem. Empresa: EcoSunPower
(`company_id = 00000000-0000-0000-0000-000000000001`).

## O que mudou no emissor (PR `feat/nfse-producao`)

- **IBS/CBS (reforma tributária)**: a DPS agora sai na **versão 1.01** com o grupo
  `IBSCBS` (`finNFSe`, `cIndOp`, `indDest`, `gIBSCBS{CST, cClassTrib}`), conforme o
  Manual NotaControl v1.01 e o `GerarNfseEnvio-exemplo.xml` oficial. Obrigatório pra
  competência a partir de **01/10/2026**. As alíquotas **não vão** na DPS: o fisco
  calcula e devolve na NFS-e.
- **NBS** (`cNBS`, 9 dígitos) vai no serviço.
- **Catálogo de serviços** com os códigos das notas reais 82/83/85 (tabela abaixo).
- **PDF** nos 2 modelos do portal (GDF/ISS.net e DANFSe v2.0), gerado do XML
  autorizado, com QR pra consulta pública nacional pela chave.
- **E-mail** pro tomador com os 2 PDFs + XML (botão na nota; envio automático
  opcional, desligado por padrão).
- **Consultar atividades no fisco** (tela de configuração): mostra o número
  (`cTribMun`) de cada atividade cadastrada da empresa — sem chute.

### Catálogo (fonte: notas reais emitidas pelo portal)

| Serviço | Cód. Trib. Nacional | Atividade municipal (PDF) | NBS | ISS | cIndOp | CST / cClassTrib | Fonte |
|---|---|---|---|---|---|---|---|
| Manutenção preventiva e limpeza de geração de energia | 14.01.01 | 14.01 | 1.2001.60.00 | 5% (retido pelo tomador PJ-DF) | 050102 | 000 / 000001 (tributação integral) | nota 82 |
| Serviços elétricos gerais | 31.01.02 | 31.01 | 1.1415.00.00 | 5% (retido pelo tomador PJ-DF) | 100301 | 200 / 200052 (alíquota reduzida 30%) | nota 83 |
| Manutenção preventiva em sistemas fotovoltaicos | 14.01.01 | 14.01 | 1.1803.29.00 | 5% (não retido na nota 85) | 050101 | 000 / 000001 | nota 85 |
| Qualquer outro serviço | — | — | o do banco | o do banco | 050102 | 000 / 000001 | padrão = nota 82 |

Prévia do IBS/CBS (o valor oficial vem do fisco): CBS 0,9% · IBS estadual 0,1% ·
IBS municipal 0% · base = valor do serviço − ISS (mesmo quando o ISS não é retido).

## Passo a passo

### 1) Deploy
Merge do PR → Implantar no EasyPanel. Nada quebra sem os SQLs abaixo: o envio
automático só aparece "desligado" até a migration 147.

### 2) (Opcional — só se quiser o e-mail automático) migration 147

```sql
ALTER TABLE fiscal_config
  ADD COLUMN IF NOT EXISTS email_auto_tomador boolean NOT NULL DEFAULT false;
```

### 3) Série de produção + município + serviços alinhados com as notas reais

```sql
-- série da DPS de produção (a homologação usou 8) e município Brasília
UPDATE fiscal_config
   SET serie_dps = '1', cod_municipio = '5300108', updated_at = now()
 WHERE company_id = '00000000-0000-0000-0000-000000000001';

-- NBS + ISS 5% dos serviços que já existem (notas 82 e 83)
UPDATE fiscal_servicos
   SET nbs = '1.2001.60.00', aliquota_iss = 0.05
 WHERE company_id = '00000000-0000-0000-0000-000000000001' AND cod_trib_nacional = '14.01.01' AND nbs IS DISTINCT FROM '1.1803.29.00';
UPDATE fiscal_servicos
   SET nbs = '1.1415.00.00', aliquota_iss = 0.05
 WHERE company_id = '00000000-0000-0000-0000-000000000001' AND cod_trib_nacional = '31.01.02';

-- serviço da nota 85 (manutenção preventiva FV — NBS 1.1803.29.00), se ainda não existe
INSERT INTO fiscal_servicos (company_id, nome, cod_trib_nacional, nbs, descricao_padrao, aliquota_iss)
SELECT '00000000-0000-0000-0000-000000000001', 'Manutenção preventiva em sistemas fotovoltaicos', '14.01.01', '1.1803.29.00',
       'manutenção preventiva em sistemas fotovoltaicos', 0.05
 WHERE NOT EXISTS (SELECT 1 FROM fiscal_servicos
                    WHERE company_id = '00000000-0000-0000-0000-000000000001' AND nbs = '1.1803.29.00');

-- tira os códigos de HOMOLOGAÇÃO (1/4/6/7): sem código, o sistema NÃO deixa emitir
-- em produção com número errado — o certo entra pela tela no passo 5.
UPDATE fiscal_servicos
   SET cod_trib_municipal = NULL
 WHERE company_id = '00000000-0000-0000-0000-000000000001' AND cod_trib_municipal IN ('1', '4', '6', '7');
```

Conferência (deve mostrar série 1, município 5300108 e os serviços):

```sql
SELECT ambiente, serie_dps, proximo_ndps, cod_municipio, inscricao_municipal
  FROM fiscal_config WHERE company_id = '00000000-0000-0000-0000-000000000001';
SELECT nome, cod_trib_nacional, cod_trib_municipal, nbs, aliquota_iss
  FROM fiscal_servicos WHERE company_id = '00000000-0000-0000-0000-000000000001' ORDER BY nome;
```

### 4) Trocar o ambiente pra Produção
`/dashboard/fiscal/config` → **Produção (nota de verdade)** → Salvar.
(Se rodou a 147, dá pra ligar ali o "Enviar sozinho" do e-mail.)

### 5) Códigos municipais REAIS (cTribMun)
Na mesma tela: **Consultar atividades no fisco** → aparece a lista
`número — descrição — alíquota` do cadastro de produção. Pra cada serviço, digite o
**número** da atividade (14.01 → o número da linha "14.01…"; 31.01 → o da "31.01…")
e clique **Salvar códigos**. O número tem que ser só dígitos (o schema virou inteiro).

### 6) Primeira nota real — assistida
Prepare a nota, confira tomador (inscrição CF/DF + ISS retido quando for PJ-DF
substituto) → **Emitir agora**. Depois: **PDF — modelo GDF**, **PDF — DANFSe
nacional** e **Enviar por e-mail**. Confira a nota também no portal do ISS.

## Pontos pra conferir no 1º envio (não deu pra testar sem produção)

1. **DPS 1.01 + grupo IBS/CBS**: nomes/ordem vêm do manual v1.01 e do exemplo
   oficial; nunca foram enviados ao fisco por este sistema. Se vier erro de schema,
   testar antes em homologação (o botão "Emitir agora" em homologação não queima a nota).
2. **Série `1`**: o portal usa a série 70001 pras notas dele; a homologação usou 8.
   Se o fisco recusar a série, perguntar ao suporte ISSNet (suporte@notacontrol.com.br)
   qual série usar no webservice.
3. **Consultar atividades**: estrutura do pedido pelo manual v1.01
   (`Prestador{CNPJ, IM}`); em homologação já tinha funcionado pelo script local.
4. **QR code**: aponta pra consulta pública **nacional**
   (`https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=…`). O QR do portal do
   ISS-DF usa um código cifrado que só o portal gera.
5. **Destinatário/tpOper**: o PDF do portal (nota 82) imprime "Tipo de Operação" e
   "Ente Governamental", mas o manual proíbe mandar esses campos fora de
   compra pública/itens 25.05, 15.09, 17.12, 10.05 — não vão na DPS.

## Voltar pra homologação (se precisar testar de novo)

```sql
UPDATE fiscal_config
   SET ambiente = 'homologacao', serie_dps = '8', updated_at = now()
 WHERE company_id = '00000000-0000-0000-0000-000000000001';
```
(Em homologação os códigos de teste são 1/4/6/7 — salvar pela tela.)
