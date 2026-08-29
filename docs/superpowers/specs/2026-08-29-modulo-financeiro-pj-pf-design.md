# Módulo Financeiro EcoSunPower — PJ e PF separados, sem trava

> Desenho aprovado com o Junior em 29/08/2026 (manhã). Linguagem simples de propósito.
> Substitui a "Fase 1" do `Documents\EcoSunPower\Financeiro\PLANO-Departamento-Financeiro.md` (05/06) com o que aprendemos no fechamento real de agosto/2026.

## 1. Por que agora

Fechamento de agosto (feito à mão em 29/08) mostrou: 5 contas em 4 bancos, PF misturado com PJ, ~16k de saídas "sem dono", DAS atrasado sem ninguém ver, juros de 6,6k no mês, e ninguém sabia o número. Setembro começa com empréstimo BV, aluguel entrando e pró-labore fixo — é a hora de o controle existir.

O que desanimou antes: a Eva **travava** (parava de ler, não contabilizava, fluxo complexo). Este desenho parte do oposto.

## 2. Três princípios (em ordem)

1. **Nunca trava.** Toda entrada (áudio, foto, texto, PDF, CSV; WhatsApp ou tela) vira lançamento imediatamente — classificado se der, "a classificar" se não. O arquivo original fica guardado. Erro de leitura nunca perde dado.
2. **Extrato manda.** O fechamento do mês parte dos extratos que o Junior posta no fim do mês (todos os bancos e cartões). O que ele manda durante o mês pela Eva é o *diário*, que dá nome/obra ao que está no extrato. Sem extrato o mês fica "aberto", nunca "errado".
3. **PJ e PF são dois mundos.** Todo lançamento tem etiqueta PJ ou PF. O que cruza a fronteira vira "transferência PJ↔PF" e aparece num painel só disso.

Fora de escopo agora: contabilidade oficial (fica com o contador; o sistema gera relatório pra ele), emissão de nota fiscal, Open Finance (fonte automática futura — o desenho já prevê a entrada).

## 3. Como o Junior usa (dia a dia e fim de mês)

**Dia a dia (WhatsApp, número do Junior/Edilene):**
- Manda foto de comprovante, áudio ("paguei 800 pro Kelvyn da loja 305"), texto solto ("entrou 3.633 do Hudson"), PDF de boleto/guia.
- Eva responde em ≤ 2 s: "registrei: R$ 800 → Kelvyn · mão de obra · Superbom 305 · PJ ✓" ou "registrei R$ 800 pra Kelvyn; qual obra?" com **botões** (últimas 4 obras + "outra" + "depois").
- Nunca pede duas coisas de uma vez; se o Junior não responde, fica "a classificar" e volta agrupado no resumo semanal.

**Fim do mês (tela ou WhatsApp):**
- Posta os extratos (Sicoob c/c, cartão Sicoob, Itaú PJ, Itaú PF, Visa Empresa, LATAM, Santander, Mercado Pago). Arquivos grandes aceitos (até 50 MB / 100 páginas).
- Sistema importa em segundo plano, confere saldo final, cruza com o diário e com contas a pagar/receber, e devolve: fechamento do mês + perguntas agrupadas por favorecido.
- Junior responde as perguntas (botões ou clique) → mês fecha → PDF pro contador.

**Alertas (WhatsApp, botões):** vencimento 3 dias antes · DAS (dia 12, 18, 20 e todo dia após, até comprovante) · saldo insuficiente para os próximos 7 dias · assinatura cancelada que voltou · gasto 20 % acima da média · obra com margem < 25 %.

## 4. Peças

| Peça | Faz | Não faz |
|---|---|---|
| **Caixa de entrada** | recebe mídia/texto (Eva ou tela), guarda original no Storage, enfileira leitura, cria lançamento(s) | não recusa, não bloqueia a conversa |
| **Leitor** (fila em segundo plano) | extrai lançamentos de PDF/CSV/foto **página a página**, grava cada página ao terminar; página que falha fica "reler" | não roda dentro do webhook do WhatsApp |
| **Classificador** | etiqueta PJ/PF · categoria · favorecido · obra · confiança (alta/média/baixa/pendente) usando o **dicionário** + LLM só quando o dicionário não resolve | não inventa: sem match → "a classificar" |
| **Dicionário** | favorecido (CPF/CNPJ mascarado, nome, texto do extrato) → regra; aprende com cada resposta do Junior | não pergunta duas vezes a mesma coisa |
| **Contas a pagar/receber** | nascem do `/fechar` (a receber com data do contrato), de contratos de dívida (parcelas), de faturas de cartão lidas, de manual; status aberto/pago/atrasado | não gera cobrança ao cliente |
| **Conciliação** | no fechamento: extrato × diário × contas. Bate → fecha; só no extrato → pergunta agrupada; só no diário → alerta | não fecha mês sem extrato |
| **Painéis** (dashboard) | PJ · PF · Fronteira · A classificar · Fechamento | — |
| **Alertas** | cron diário; regras acima; só cala com ação (comprovante/“pago”) | — |

### DAS — regra especial
O sistema **estima** o DAS (notas emitidas no mês × alíquota efetiva do Anexo III, método já documentado em `IMPOSTO-METODO-Simples-Anexo-III.md`) apenas para provisionar caixa. O **DAS real** é a guia do contador/PGDAS-D: quando o Junior posta a guia, o sistema lê valor/competência/vencimento/composição, registra como o valor oficial, compara com a estimativa e mostra a diferença ("contador declarou ~10k; entrou 70k de serviço"). O real sempre vence. Alerta escala até o comprovante.

## 5. Dados (Supabase produção, migrations 109+)

- `fin_arquivos`: id, origem (zap|tela), tipo (extrato|fatura|comprovante|guia|outro), banco/conta, storage_path, paginas, status (fila|lendo|ok|erro_parcial), erro, criado_em.
- `fin_lancamentos`: id, data, banco_conta (enum: sicoob_cc, sicoob_cartao, itau_pj, itau_pf, visa_emp, latam, santander_pj, mercado_pago, dinheiro, outro), tipo (entrada|saida), valor, descricao_original, favorecido_id?, categoria, subcategoria, mundo (PJ|PF|FRONTEIRA), obra_cliente_id?, transferencia_interna bool, parcela_atual/total?, confianca, confirmado bool, origem (extrato|diario|conta), arquivo_id?, pareado_com? (lançamento do outro lado da conciliação), observacao.
- `fin_favorecidos` (dicionário): id, nome, doc_mascarado, padroes_texto[], categoria_padrao, subcategoria_padrao, mundo_padrao, tipo_recorrencia, aprendido_em.
- `fin_contas`: id, tipo (pagar|receber), descricao, valor, vencimento, status (aberta|paga|atrasada|cancelada), origem (fechar|divida|fatura|manual|guia), cliente_id?, contrato_ref?, mundo, lancamento_id? (quando liquidada), lembrete_enviado_em[].
- `fin_dividas`: id, credor, contrato, saldo_ref, parcela, dia_venc, ultima_parcela, taxa_mensal, mundo, garantia, fonte.
- `fin_fechamentos`: id, competencia (AAAA-MM), status (aberto|conciliando|fechado), resumo_json, relatorio_pdf_path, fechado_em.

Todas com `company_id` (multi-tenant já existe). Categorias = as do manual §38 (receita, custo direto obra, despesa operacional, imposto, pessoal/retirada, financeiro, transferência interna, investimento/benfeitoria, pendente).

## 6. Fluxos

**Entrada pela Eva:** mensagem do Junior/Edilene com mídia ou texto contendo valor → `fin_arquivos` (se mídia) + `fin_lancamentos` (origem diario, confiança pela regra) → resposta curta com botões se faltar obra/mundo. Texto sem valor identificável → "não achei valor; me manda o número?" (uma vez; se não vier, ignora sem erro).

**Entrada pela tela:** upload → `fin_arquivos` (fila) → leitor página a página → lançamentos (origem extrato) → tela mostra "importado N lançamentos · saldo final X (bate/não bate)".

**Conciliação (botão "Fechar mês" ou automático quando todos os extratos do mês chegaram):** para cada lançamento de extrato: (1) dicionário; (2) pareia com diário (mesmo valor ± 1 %, data ± 3 dias, mesmo lado); (3) pareia com conta a pagar/receber; (4) transferência interna (mesmo valor, contas próprias, data ± 2 dias); (5) sobrou → pendente agrupado por favorecido. Perguntas enviadas em lotes de até 5 por mensagem, com botões.

**Fechamento:** gera `resumo_json` no padrão do fechamento de agosto (entradas, custo por obra, margem, despesas, impostos, juros, dívidas, PF, fronteira, caixa, alertas) + PDF em PT-BR pro contador e pro Junior.

## 7. Erros e robustez

- Webhook do WhatsApp **nunca** espera leitura de arquivo: enfileira e responde. Fila = tabela `fin_arquivos` + worker (cron 1 min) já no padrão dos crons existentes.
- Leitor grava por página; falha isola a página; 3 tentativas; depois "erro_parcial" com aviso ao Junior ("página 5 do Itaú não li — manda print dela?").
- LLM de classificação com tempo limite de 8 s; estourou → "a classificar" (nunca bloqueia).
- Duplicidade: hash (banco_conta, data, valor, descrição normalizada) impede importar o mesmo extrato duas vezes; cartão × pagamento da fatura = transferência interna (manual §5).
- Tudo com log/observabilidade no padrão da casa (dashboard PT-BR).

## 8. Testes

- Unitários: parser de cada banco com os PDFs reais de agosto (Sicoob c/c 171 linhas → saldo 5.776,11; Santander; Itaú PJ; LATAM; Visa CSV; MP) — os arquivos já estão em `Documents\EcoSunPower\Financeiro\2026-08\`.
- Classificador: dicionário de agosto (Kelvyn, Jonnata, Adelio, Edilene, CFT, Belenus…) → 100 % dos confirmados classificam sem LLM.
- Conciliação: agosto inteiro deve reproduzir o FECHAMENTO-2026-08.md v3 (margem 47 %, juros 6.609, PJ→PF 17.000).
- Eva: áudio/texto/foto → lançamento em ≤ 2 s; arquivo de 8 MB → fila, resposta imediata.

## 9. Fatias de entrega (ordem)

1. **Fatia 1 — "Registra sem travar" (pronta seg 01/09):** tabelas · Eva grava diário (texto/áudio/foto) com botões · contas a pagar/receber de setembro carregadas (as do plano de 29/08) · alertas de vencimento e DAS · resumo semanal no zap.
2. **Fatia 2 — Tela Financeiro (≈ 10 dias):** 4 cards + abas PJ/PF/Fronteira/A classificar · upload de extrato · importadores Sicoob, Itaú PJ/PF, Santander, LATAM, Visa CSV, Mercado Pago (fila página a página).
3. **Fatia 3 — Conciliação e fechamento (até 05/10, fecha setembro):** pareamento extrato×diário×contas · perguntas agrupadas · relatório do mês + PDF contador · DAS real × estimado.
4. **Fatia 4 — `/fechar` cria a receber + margem por obra automática** (liga vendas ↔ financeiro).
5. **Fatia 5 — Open Finance (opcional)** como fonte automática de `fin_lancamentos` (origem extrato).

## 10. Decisões já tomadas
- Pró-labore fixo do Junior: **R$ 7.000 bruto, todo dia 5, a partir de 05/09/2026** (INSS 11 % + IRRF na fonte; líquido ≈ 5.675). Edilene (sócia) não recebe pró-labore — tem empresa própria; só distribuição de lucro/aportes. É a única regra "dura": o sistema espera esse lançamento PJ→PF todo dia 5 e alerta se não houver; qualquer outra saída PJ→PF vira "Fronteira" a classificar.
- Kit vai direto pro distribuidor: só o serviço é receita (exceção registrada quando passar pela conta).
- Permuta registra as duas pontas (receita e custo).
- Aporte de sócio (Edilene) e devolução do Jonnata (Honda) não são receita.
