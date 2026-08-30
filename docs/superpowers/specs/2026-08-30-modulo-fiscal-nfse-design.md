# Módulo Fiscal — NFS-e no dashboard (design)
Data: 30/08/2026 · Aprovado pelo Junior no chat (30/08) · PT-BR

## Objetivo
Emitir NFS-e (serviço) pelo dashboard, ligada ao departamento financeiro: venda → nota → Pasta Digital → conta a receber (líquido) + ISS retido no caixa → envio ao cliente pela Eva. Grátis (sem integrador pago): direto no emissor atual **ISS.NET/NotaControl (DF)**, layout **NFS-e padrão nacional** (DPS XML assinada com certificado A1). Multi-tenant desde o início.

## Contexto real (notas nº 82 e 83, ago/2026)
- Prestador: EcoSunPower, CNPJ 33.020.459/0001-06, IM 0790506200159, Simples Nacional ME/EPP.
- Códigos usados: 31.01.02 (serviços técnicos em edificações/elétrica) · 14.01.01 (manutenção/limpeza). Instalação FV: provável 7.02 — **confirmar com a contadora**.
- Tomador PJ do DF (condomínios, Superbom): **ISS 5 % retido pelo tomador** → líquido 95 %. PF: ISS devido pelo prestador (no DAS do SN).
- Notas já saem com campos IBS/CBS (reforma tributária) — o layout nacional cobre.
- Portal: https://iss.fazenda.df.gov.br/online/ (ISSNet · Nota Control). Numeração sequencial da NFS-e é do emissor.

## Decisões
1. Caminho: **C → A**. F1 entrega o fluxo completo em modo "preparar" (emissão manual no portal + anexo do PDF); F2 troca o miolo pela emissão automática via API NotaControl. Sem integrador pago (Focus/Nuvem Fiscal descartados por custo; podem virar provedor alternativo no futuro).
2. **Certificado A1 fica no servidor, criptografado** (aceito pelo Junior — "mais automático possível"). Senha do .pfx como secret cifrado, upload só pela tela, nunca exposta. Alerta de validade 30/15/5 dias (Eva).
3. Multi-tenant: `company_id` em tudo; cada empresa tem seu certificado, cadastro e catálogo. Provedor de emissão plugável (interface): `notacontrol-df` primeiro; outros municípios/padrão nacional depois — sem mexer no resto.

## Arquitetura (módulo `src/modules/financeiro/fiscal/`)
| Peça | Responsabilidade | Não faz |
|---|---|---|
| `config` | dados fiscais da empresa + certificado A1 (cifrado) + validade + alerta | expor senha |
| `catalogo` | tipos de serviço → código trib. nacional, NBS, descrição padrão, regra de retenção (editável na tela) | — |
| `tomadores` | reaproveita clientes/leads + consulta CNPJ (BrasilAPI) + IM persistida | — |
| `motor` | monta DPS XML → assina (A1, XML-DSig) → envia/consulta/cancela no provedor; guarda XML/PDF/nº/protocolo/status | caixa |
| `ponte-caixa` | autorizada → conta a receber (líquido) + lançamento ISS retido; cancelada → estorno; resumo semanal | — |

### Banco (migrations novas)
- `fiscal_config` (1/empresa): cnpj, im, regime, endereço, cert_pfx (cifrado), cert_senha (cifrado), cert_validade.
- `fiscal_servicos`: company_id, nome, cod_trib_nacional, nbs, descricao_padrao, retencao_iss (auto: tomador PJ do DF), ativo.
- `fiscal_notas`: company_id, numero, status (`rascunho→preparada→enviada→autorizada|rejeitada|cancelada`), tomador (dados congelados), servico_id, valores (bruto, iss, retido?, liquido), competencia, descricao, xml_dps, xml_nfse, pdf_path, protocolo, fechamento_id/lead_id, conta_receber_id, hash_dedupe.
- `fiscal_eventos`: nota_id, tipo, payload enviado/recebido, erro traduzido, created_at.

### Fluxo
Venda → "🧾 Emitir nota" (ou Nota avulsa no menu Financeiro) → tela preenchida (tomador+CNPJ lookup, serviço do catálogo, bruto→ISS→líquido) → F1: "Preparar" (dados pra colar no portal; depois anexa PDF) / F2: "Emitir" (motor) → pós-nota automático: Pasta Digital + conta a receber (líquido) + ISS retido no caixa + Eva envia PDF (aprovação configurável) + aba Notas no dashboard.

### Robustez
- Erros do provedor traduzidos em PT com ação (corrigir → reenviar). `fiscal_eventos` guarda tudo.
- Dedupe: trava por fechamento + hash (valor+tomador+competência). Nunca 2 notas pela mesma venda sem confirmação explícita.
- Certificado vencido/ausente → bloqueia emissão com aviso; modo "preparar" continua funcionando.
- Homologação NotaControl antes de produção; XML validado contra XSD v1.01.

## Fatias
- **F1 — Base + modo preparar** (~2 dias): migrations, config (sem certificado ainda), catálogo com 3 serviços seed (31.01.02 elétrica · 14.01.01 manutenção/limpeza · 7.02.01 instalação FV *pendente contadora*), tela da nota, consulta CNPJ, anexo do PDF → Pasta Digital + caixa, aba Notas, alerta validade certificado (manual: data digitada).
- **F2 — Emissão automática** (~4–5 dias): upload certificado, motor DPS/assinatura/envio NotaControl, homologação → produção quando A1 novo chegar.
- **F3 — Cancelar/reemitir + Eva** (~2 dias): cancelamento/substituição, envio ao cliente, notas do mês no resumo semanal.

## Pendências externas
1. Certificado A1 novo (.pfx+senha) — upload pela tela quando chegar.
2. Acesso ISSNet (fora do ar em 30/08) — conferir config webservice/homologação + manual NotaControl v1.01.
3. Contadora: código instalação FV (7.02?) e retenção INSS 11 % em empreitada p/ condomínio.

## Testes
Unitários do cálculo (PF × PJ-DF × PJ fora · retenção · arredondamento) · XML × XSD oficial · homologação com notas de teste · 1ª nota real assistida (valor pequeno) · tsc/build + suíte inteira verde antes de "pronto".
