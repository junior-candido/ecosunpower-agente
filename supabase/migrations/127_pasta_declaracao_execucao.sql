-- 127: os dados que faltam pra emitir a DECLARAÇÃO DE EXECUÇÃO.
--
-- Junior, 10/09/2026: "vamos implementar esse atestado, que vou pedir para
-- assinarem após a troca do medidor" · "vamos fazer isso virar rotina mesmo".
--
-- POR QUE ISSO IMPORTA: pra entrar em licitação grande pedem ATESTADO DE
-- CAPACIDADE TÉCNICA acompanhado da ART/TRT. A TRT sempre existe — é
-- obrigatória pra homologar. Falta a declaração do CLIENTE, e ela só se
-- consegue no calor da entrega. Foi o que impediu a EcoSunPower de participar
-- do CG 026/2026 da Rede SARAH (usina de 145 kWp), que exigia 3 atestados de
-- usinas ≥ 70 kWp.
--
-- POR QUE UM JSONB E NÃO COLUNAS: quase tudo que a declaração precisa já vem
-- do lead (nome, CPF, endereço) e do sistema em monitoramento (potência,
-- módulos, inversores). O que falta são poucos campos, ligados ao PAPEL da
-- entrega — TRT, parecer, data de conclusão, padrão de entrada. Eles vivem
-- junto da pasta, mudam de obra pra obra e não são consultados por ninguém
-- além deste documento. Coluna nova pra cada um seria peso sem uso.
--
-- Formato esperado:
--   {"trt":"CFT2606128607","parecer":"2608124961","parecer_em":"2026-08-19",
--    "conclusao_em":"2026-08-31","padrao_entrada":"Bifásico 127/220 V · 50 A",
--    "uc":"564611","distribuidora":"Neoenergia Distribuição Brasília",
--    "qualificacao":"brasileiro, advogado inscrito na OAB/DF nº 20.702"}

ALTER TABLE pastas_cliente
  ADD COLUMN IF NOT EXISTS dados_declaracao jsonb;

COMMENT ON COLUMN pastas_cliente.dados_declaracao IS
  'Campos da Declaracao de Execucao que nao vem do lead nem do sistema: TRT, parecer de acesso, data de conclusao, padrao de entrada, UC. Alimentam o atestado que o cliente assina apos a troca do medidor.';
