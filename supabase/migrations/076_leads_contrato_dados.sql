-- 076_leads_contrato_dados.sql — o rascunho do formulário da CENTRAL DE CONTRATOS.
--
-- A central gera qualquer contrato de energia (FV, procuração e, no futuro,
-- locação de usina, O&M, geração compartilhada, mercado livre, cooperativa...).
-- Antes de gerar, o operador confere um formulário com TODOS os campos daquele
-- tipo — já preenchidos pelo cadastro + proposta + o que a IA leu da conta/CNH —
-- e completa os brancos. O que ele digita fica guardado aqui, separado por tipo:
--
--   { "fv": { "comercial": { "valor_total_brl": 61500 } },
--     "procuracao": { "uc_numero": "123456" } }
--
-- Na hora de gerar, esse rascunho entra POR CIMA do automático: a palavra do
-- operador é a última. Campo que ele não mexeu segue vindo da proposta/cadastro.
-- IMPORTANTE: o que é dado do CLIENTE (nome, CPF, RG, estado civil, endereço, UC,
-- forma de pagamento) NÃO fica aqui — vai pras colunas do lead, como a IA já faz
-- ao ler a conta de luz e a CNH. Preencheu uma vez, vale pra todo contrato, pra
-- procuração, pra Eva e pro CRM. Aqui só mora o que é daquele documento.
alter table leads add column if not exists contrato_dados jsonb;

-- Profissão entra no contrato e ainda não tinha lugar no cadastro.
alter table leads add column if not exists profissao text;

comment on column leads.contrato_dados is 'Rascunho do formulário da central de contratos, por tipo ({fv:{sistema,comercial,...}}). Só o que é daquele contrato — dado de cadastro mora nas colunas do lead. Vence sobre a proposta na hora de gerar o PDF.';
comment on column leads.profissao is 'Profissão do cliente (entra no contrato).';
