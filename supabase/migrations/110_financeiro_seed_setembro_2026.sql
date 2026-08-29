-- 110: carga inicial set/26 — favorecidos, dívidas, contas a pagar/receber, pró-labore. Dados confirmados pelo Junior em 29/08/2026 (Documents\EcoSunPower\Financeiro\base). Idempotente.

-- 0) Pró-labore
UPDATE financeiro_parametros SET pro_labore_mensal = 7000, updated_at = now() WHERE id = 1;

-- 1) Favorecidos — unicidade por (company_id, nome) pra permitir ON CONFLICT DO NOTHING
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_fav_nome ON financeiro_favorecidos(company_id, nome);

INSERT INTO financeiro_favorecidos (nome, doc_mascarado, padroes, categoria_slug, mundo_padrao, tipo_padrao, observacao) VALUES
  ('Jonnata (filho — mão de obra)', '***.969.561-**', ARRAY['jonnata','969.561'], 'mao_de_obra', 'PJ', 'despesa', 'quando ENVIA dinheiro = parte dos 1.900 do Honda/Civic'),
  ('Janderson (mão de obra)', '***.442.321-**', ARRAY['janderson','442.321'], 'mao_de_obra', 'PJ', 'despesa', NULL),
  ('Kelvyn (ajudante)', '***.680.951-**', ARRAY['kelvyn','680.951'], 'mao_de_obra', 'PJ', 'despesa', NULL),
  ('Lucas Rodrigues Leite (prestador)', '***.494.557-**', ARRAY['lucas rodrigues','494.557'], 'mao_de_obra', 'PJ', 'despesa', NULL),
  ('Adelio (oficina/pneus)', '***.789.501-**', ARRAY['adelio','789.501'], 'veiculo_manutencao', 'PJ', 'despesa', NULL),
  ('Junior (proprietário)', '***.404.571-**', ARRAY['404.571','antonio candido'], 'pro_labore', 'FRONTEIRA', NULL, 'PJ→PF: pró-labore dia 5; outro valor = fronteira'),
  ('Edilene (sócia)', '***.119.741-**', ARRAY['edilene','119.741'], 'outros', 'FRONTEIRA', 'entrada', 'aporte de sócio — não é receita'),
  ('Antonio Teodoro Martins (porta da loja)', '***.382.943-**', ARRAY['antonio teodoro','382.943'], 'outros', 'PJ', 'despesa', 'benfeitoria escritório'),
  ('CFT — taxa de TRT', '32.489.209/0001-57', ARRAY['32.489.209','conselho regional dos tecnic'], 'outros', 'PJ', 'despesa', '68,17 por projeto'),
  ('Belenus', '05.151.518/0001-40', ARRAY['belenus','05.151.518'], 'equipamento_kit', 'PJ', 'despesa', NULL),
  ('Sol Fácil', '01.855.226/0001-37', ARRAY['solfacil','sol facil','01.855.226'], 'outros', 'PJ', NULL, 'TED recebido = repasse de serviço; QR pago = kit'),
  ('Superbom', '08.616.988/0001-20', ARRAY['superbom','08.616.988'], 'outros', 'PJ', 'entrada', 'limpeza/O&M'),
  ('Spazio Verde', '13.245.160/0001-42', ARRAY['spazio verde','13.245.160'], 'outros', 'PJ', 'entrada', NULL),
  ('Wash Box', '64.101.578/0001-17', ARRAY['wash box','64.101.578'], 'outros', 'PJ', 'entrada', NULL),
  ('JP S Contábeis (Edimilson)', '40.255.214/0001-23', ARRAY['jp s contabeis','40.255.214'], 'outros', 'PJ', 'entrada', 'cliente Edimilson paga pela contábil'),
  ('Agape e Solar (Santana)', '31.362.565/0001-42', ARRAY['agape','31.362.565'], 'outros', 'PJ', 'entrada', 'projetos p/ parceiro; permutas'),
  ('Oficina Montana', '10.198.309/0001-91', ARRAY['10.198.309'], 'veiculo_manutencao', 'PJ', 'despesa', NULL),
  ('Porto Seguro Saúde', '04.540.010/0001-70', ARRAY['porto seguro'], 'outros', 'PJ', 'despesa', 'plano de saúde ~1.491'),
  ('Vivo', '02.558.157/0001-62', ARRAY['vivo'], 'outros', 'PJ', 'despesa', 'telefone ~499'),
  ('Meu Contador Online', NULL, ARRAY['meu cont onl','meu contador'], 'outros', 'PJ', 'despesa', '329/mês'),
  ('Meta Ads', NULL, ARRAY['facebk','meta ads','facebook'], 'marketing_ads', 'PJ', 'despesa', NULL),
  ('Anthropic / Claude', NULL, ARRAY['anthropic','claude'], 'software_assinatura', 'PJ', 'despesa', NULL),
  ('Supabase', NULL, ARRAY['supabase'], 'software_assinatura', 'PJ', 'despesa', NULL),
  ('Postos (combustível)', NULL, ARRAY['posto','cascol','brasal','combust'], 'combustivel', 'PJ', 'despesa', NULL),
  ('DF Atacadista', NULL, ARRAY['df atacadista'], 'material_eletrico', 'PJ', 'despesa', NULL),
  ('Eletrogomes', NULL, ARRAY['eletrogomes'], 'material_eletrico', 'PJ', 'despesa', NULL),
  ('Itaú Autobank (Civic Jonnata)', NULL, ARRAY['financ veic','autobank'], 'outros', 'PF', 'despesa', '3.929,25 ×45; Jonnata devolve 1.900'),
  ('Detran-DF / SEEC-DF (IPVA, multas)', NULL, ARRAY['detran','ipva','seec'], 'outros', 'PF', 'despesa', NULL)
ON CONFLICT (company_id, nome) DO NOTHING;

-- 2) Dívidas
INSERT INTO financeiro_dividas (credor, contrato, mundo, saldo_ref, parcela, dia_vencimento, ultima_parcela, taxa_mensal, garantia, observacao)
SELECT 'Itaú PJ renegociação', '004924073150', 'PJ', 28665.24, 1964.04, 24, '2028-08-17', 0.046, NULL, 'se atrasar volta a dívida antiga a 16%/mês'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_dividas WHERE credor = 'Itaú PJ renegociação');

INSERT INTO financeiro_dividas (credor, contrato, mundo, saldo_ref, parcela, dia_vencimento, ultima_parcela, taxa_mensal, garantia, observacao)
SELECT 'Santander PJ empréstimo', '300000023850', 'PJ', 8460, 468, 29, '2028-01-29', NULL, NULL, '18 parcelas restantes'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_dividas WHERE credor = 'Santander PJ empréstimo');

INSERT INTO financeiro_dividas (credor, contrato, mundo, saldo_ref, parcela, dia_vencimento, ultima_parcela, taxa_mensal, garantia, observacao)
SELECT 'Civic Jonnata — Itaú Autobank', '19452341', 'PF', 115604.76, 3929.25, 14, '2030-05-14', 0.0203, 'Honda Civic', 'Jonnata devolve 1.900/mês'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_dividas WHERE credor = 'Civic Jonnata — Itaú Autobank');

INSERT INTO financeiro_dividas (credor, contrato, mundo, saldo_ref, parcela, dia_vencimento, ultima_parcela, taxa_mensal, garantia, observacao)
SELECT 'CAP PIC (capitalização)', NULL, 'PF', 6338, 140.85, 30, '2030-05-30', 0, NULL, 'avaliar resgate'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_dividas WHERE credor = 'CAP PIC (capitalização)');

-- 3) Contas a pagar (origem 'seed')
-- Obs: as parcelas recorrentes das dívidas acima (Itaú dia 24/09, Santander dia 29/09,
-- Civic dia 14/09, CAP dia 30/09) NÃO são semeadas aqui — nascem de gerarParcelasDoMes
-- a partir de financeiro_dividas.
INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'DAS julho/2026 (ATRASADO — reemitir PGDAS-D)', 888, '2026-08-29', 'PJ', 'imposto_das', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'DAS julho/2026 (ATRASADO — reemitir PGDAS-D)');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'IPVA 2026 Montana SGU7I53 (guia até 31/08)', 3859.71, '2026-08-31', 'PF', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'IPVA 2026 Montana SGU7I53 (guia até 31/08)');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Multas Montana (9) — SNE 40% se no prazo', 1274.48, '2026-09-05', 'PF', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Multas Montana (9) — SNE 40% se no prazo');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Multas Civic (4) — Jonnata acerta', 814.09, '2026-09-05', 'PF', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Multas Civic (4) — Jonnata acerta');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'LATAM Black — fatura', 7738.58, '2026-09-01', 'PF', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'LATAM Black — fatura');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Pró-labore Junior', 7000, '2026-09-05', 'PJ', 'pro_labore', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Pró-labore Junior');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Sicoob cartão — fatura (déb. aut.)', 6453.46, '2026-09-07', 'PJ', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Sicoob cartão — fatura (déb. aut.)');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Mercado Pago — fatura', 1703.13, '2026-09-10', 'PF', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Mercado Pago — fatura');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Porto Seguro saúde', 1491.17, '2026-09-10', 'PJ', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Porto Seguro saúde');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Vivo', 499.44, '2026-09-10', 'PJ', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Vivo');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Visa Empresa Itaú — fatura (déb. aut.)', 5486.25, '2026-09-12', 'PJ', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Visa Empresa Itaú — fatura (déb. aut.)');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'DAS agosto/2026 (estimado ~8,5% do notado)', 2550, '2026-09-20', 'PJ', 'imposto_das', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'DAS agosto/2026 (estimado ~8,5% do notado)');

INSERT INTO financeiro_contas_a_pagar (descricao, valor, vencimento, mundo, categoria_slug, origem)
SELECT 'Meu Contador Online', 329, '2026-09-30', 'PJ', 'outros', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_pagar WHERE descricao = 'Meu Contador Online' AND vencimento = '2026-09-30');

-- 4) Contas a receber (status 'pendente', created_by 'seed')
INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Hudson — serviço (instala 02/09)', 3633.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Hudson — serviço (instala 02/09)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Nelson — serviço na instalação', 4140.59, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Nelson — serviço na instalação');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Udson — serviço 1/2 (conclusão)', 2064.41, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Udson — serviço 1/2 (conclusão)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Udson — serviço 2/2 (+30 d)', 2064.41, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Udson — serviço 2/2 (+30 d)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Maria — manutenção', 4800.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Maria — manutenção');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'NR Consultoria — receita EcoSun', 2500.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'NR Consultoria — receita EcoSun');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Socorro — parcela final (~28/09)', 3938.92, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Socorro — parcela final (~28/09)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Spazio Verde — 2ª parcela (23/09)', 1250.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Spazio Verde — 2ª parcela (23/09)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Paulo Aguiar — limpeza Taguatinga', 1000.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Paulo Aguiar — limpeza Taguatinga');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Superbom — 2ª parcela pacotão (out)', 19995.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Superbom — 2ª parcela pacotão (out)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Wash Box Gabriel — serviço (após reposição)', 7000.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Wash Box Gabriel — serviço (após reposição)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Gerador Embaixada Angola — corretiva 3.490 (50/50)', 3490.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Gerador Embaixada Angola — corretiva 3.490 (50/50)');

INSERT INTO financeiro_contas_a_receber (descricao, valor, status, created_by)
SELECT 'Jonnata — parte do Civic (mensal)', 1900.00, 'pendente', 'seed'
WHERE NOT EXISTS (SELECT 1 FROM financeiro_contas_a_receber WHERE descricao = 'Jonnata — parte do Civic (mensal)');
