-- 120: cor da marca por empresa — o painel (e a nota fiscal) com a cara do cliente.
--
-- Junior 01/09/2026: "a dashboard pode ficar com a cara da logo deles...
-- personalizado e os botões, top" e "queria que amanhã, quando ela abrisse o
-- dashboard, já encontrasse de cara nova".
--
-- Hoje o painel importa a logo da EcoSunPower FIXA do código
-- (proposal/assets/logo-base64.ts) e usa âmbar/azul em classes Tailwind
-- cravadas. Ou seja: a Conquista Solar está vendo a marca da EcoSunPower no
-- painel dela — o mesmo vazamento de marca que passamos o dia caçando, só que
-- na tela.
--
-- A cor entra aqui; a logo já tinha campo (logo_storage_path) e passa a aceitar
-- URL, não só caminho no bucket — assim o cliente entra com a marca no ar sem
-- depender de upload.
ALTER TABLE empresa_config ADD COLUMN IF NOT EXISTS cor_marca text;

COMMENT ON COLUMN empresa_config.cor_marca IS
  'Cor da marca em hex (#RRGGBB). Usada no painel e no DANFSe. NULL = padrao da casa.';

COMMENT ON COLUMN empresa_config.logo_storage_path IS
  'Logo da empresa: caminho no bucket branding OU uma URL http(s) completa. URL nao precisa de upload e é usada direto no <img>.';

-- Conquista Solar: cores tiradas do proprio site (conquistasolar.com.br).
-- O laranja #F58634 aparece 40x na home, contra 6x do azul — e a logo publica
-- do site serve sem upload nenhum.
UPDATE empresa_config
   SET cor_marca = '#F58634',
       logo_storage_path = COALESCE(logo_storage_path, 'https://conquistasolar.com.br/imagens/logo.png')
 WHERE company_id = '99fd46d7-60fc-49fe-918f-66587ffa3829';
