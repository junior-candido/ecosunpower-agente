# Spec — S3: Relatório de Geração da Usina (branded)

Data: 2026-05-18
Status: aprovado pelo Junior (destino a / natureza a / tom misto 3-modos / regra de gravidade aprovada / recorte S3↔S4 aprovado / design aprovado)

## Contexto

Sub-projeto S3 da frente de monitoramento (decomposição S1→S4; S1 "Painel de Triagem" já entregue). Junior quer um relatório de geração por usina, com a cara da EcoSunPower, que ele gera sob demanda (botão já existe na tela como gancho: `POST /dashboard/monitoramento/:id/relatorio`) e que a Eva (S4) mandará pro cliente no follow-up de manutenção. Reaproveita a infra do Proposta v2 (engine PDF, Drive, link público, branding) e as funções puras do S1.

## Decisões travadas

- **Destino:** PDF no Google Drive + **link público `/r/:slug`** (slug não-enumerável, **TTL 60 dias**, página de expirado) + **QR code**. Espelha o padrão `/p/:slug` do Proposta v2.
- **Natureza:** UM "Relatório da Usina" por sistema, **sempre atualizado** quando gerado (estado atual: geração do mês + do ano + gráfico histórico mês a mês desde a instalação + real vs esperado + cronômetro de garantia + equipamentos). Sem seletor de período.
- **Tom por modo** (parâmetro `modo` recebido pelo gerador; S3 só renderiza, não decide quando):
  - `boas_vindas` — pós-instalação: só positivo (números bonitos, economia, boas-vindas). Zero negativo.
  - `manutencao` — perto de manutenção/visita: inclui diagnóstico real vs esperado e o enquadramento "vamos revisar/agendar".
  - `acompanhamento` — normal: extrato positivo; underperformance NÃO aparece pro cliente.
  - Botão da tela (uso do Junior) gera em `acompanhamento`. S4 escolhe `boas_vindas`/`manutencao` no fluxo dele.
- **Regra de gravidade** (sinal de saúde que o S3 expõe; S4 usa pra alertar Junior — S3 não envia nada):
  - 🔴 `grave` — offline ≥3d **ou** erro de integração **ou** `ratio7d` ≤ 0.50
  - 🟡 `medio` — 0.50 < `ratio7d` < 0.70
  - 🟢 `leve` — 0.70 ≤ `ratio7d` < 0.85
  - `null` (sem alerta) — `ratio7d` ≥ 0.85 / acima / ok
  - `ratio7d` e o `nivel`/descritivo base vêm de `classificarSistema` (S1) — corte 0.70 é o mesmo do radar (consistência); 0.50 só separa grave de médio.
- **Regra durável:** nada cliente-facing sai sem OK do Junior. **S3 nunca envia a cliente** — só gera o artefato + devolve o `sinal`. Envio/aprovação/timing = S4.
- **Branding:** reusa tokens CSS / watermark / logo do `proposal/template.ts` + linguagem **"Responsável Técnico CREA/CFT"** (memória `feedback_titulo_responsavel_tecnico`). Cliente-facing → **nunca "engenheiro"**.
- **Economia:** estimativa = kWh × **tarifa default `R$ 1,00/kWh`** (constante única no código, `TARIFA_ESTIMADA_KWH = 1.00`, ajustável depois pelo Junior). Sempre rotulada "economia estimada (base R$ 1,00/kWh)". Não inventa valor específico do cliente nem promete número fechado.

## Arquitetura / componentes (unidades isoladas, testáveis)

Pasta nova `src/modules/monitoring/relatorio/`:

1. `gravidade.ts` — `classificarGravidade(input): { gravidade: 'grave'|'medio'|'leve'|null; descritivo: string }` PURA. Recebe `{ nivel, ratio7d, offline, erro, apelido }` (nivel/erro/offline derivados de `classificarSistema` do S1). Aplica os tiers acima e monta o descritivo de 1 linha (ex.: `"Casa Silva: parada há 5 dias, sem geração. Provável inversor off / sem internet."`).
2. `dados.ts` — `montarDadosRelatorio(deps, sistemaId, modo): Promise<RelatorioData | { erro: string }>`. Orquestra: `monitoringService.getDetalheSistema` (série mensal completa + KPIs hoje/mês/ano/total + esperado) + `garantiaInfo` (idade + EcoSun 12m + fabricante) + `classificarSistema` + `classificarGravidade` + economia estimada. `deps` injeta o service (testável sem banco). Retorna `RelatorioData` tipado.
3. `template.ts` — `renderRelatorioHtml(data: RelatorioData, modo): string` PURA. HTML branded reusando os tokens/cores/watermark/logo do `proposal/template.ts` (importar os assets/CSS vars; não duplicar logo base64). Tom condicional por `modo`. Sempre "Responsável Técnico CREA/CFT".
4. `gerar.ts` — `gerarRelatorio(deps, sistemaId, modo): Promise<{ ok: true; publicUrl; qrDataUrl; pdfUrl?: string; sinal } | { ok: false; reason }>`. Fluxo: `montarDadosRelatorio` → `renderRelatorioHtml` → `htmlToPdf` (reusa `proposal/pdf-generator`) → `drive-uploader` (best-effort; falha não bloqueia) → cria registro de slug (TTL 60d) → `gerarQrCodeDataUrl(publicUrl)`. Devolve `sinal = { gravidade, descritivo, ratio7d }` pro S4.
5. Persistência do slug: tabela/coluna nova `relatorio_slugs` (slug PK, sistema_id, criado_em, expira_em) — migration aplicada manual no Supabase prod `kupnsoyymulbdzakqlqc` (MCP aponta projeto errado — dar SQL pro Junior). Padrão idêntico ao do slug de proposta.
6. Rota pública `app.get('/r/:slug')` em `src/index.ts` espelhando `/p/:slug`: lookup, expirado (>60d) → página de expirado, senão regenera/serve o HTML do relatório (regenerar on-the-fly garante dado fresco; slug só identifica o sistema + valida TTL). Sem auth (link não-enumerável).
7. Rota dashboard `POST /dashboard/monitoramento/:id/relatorio` (gancho do S1) → `gerarRelatorio(modo='acompanhamento')` → página mostrando o link + QR + botão copiar (uso do Junior; **não** envia a cliente).

## Fluxo de dados

`botão/S4 → gerarRelatorio(id, modo) → montarDadosRelatorio (getDetalheSistema + garantiaInfo + classificarSistema + classificarGravidade + economia) → renderRelatorioHtml(modo) → htmlToPdf + Drive + slug + QR → { publicUrl, qrDataUrl, sinal }`. S4 lê `sinal` pra decidir alerta ao Junior. S3 nunca envia a cliente. `/r/:slug` regenera o HTML fresco a cada acesso (dentro do TTL).

## Casos de borda / erros

- Sistema sem geração (recém instalado): modo `boas_vindas`, bloco "sistema recém-instalado, dados em breve" — não quebra.
- `getDetalheSistema` retorna null (sistema inexistente): `gerarRelatorio` → `{ ok:false, reason }`.
- Puppeteer falha: `{ ok:false, reason }` (não derruba o processo; mesmo padrão do proposal pdf-generator).
- Drive falha: best-effort — `pdfUrl` ausente, mas `publicUrl` (link) funciona normalmente.
- Equipamento faltando: `garantiaInfo` já devolve "informar equipamento" / "consultar fabricante" — nunca inventa.
- Slug inexistente/expirado em `/r/:slug`: página de expirado (reusa o componente de erro do `/p/:slug`).

## Testes (TDD)

- `classificarGravidade`: cada tier + boundaries exatos (0.50, 0.70, 0.85), offline/erro → grave, ok/acima → null, descritivo correto por caso.
- `montarDadosRelatorio`: os 3 modos; sinal coerente com a gravidade; service mockado (sem banco); caminho "sem geração".
- `renderRelatorioHtml`: contém branding EcoSunPower; contém "Responsável Técnico"; **NÃO** contém "engenheiro"; tom difere por modo (boas_vindas sem diagnóstico negativo; manutencao com vs-esperado); caminho "dados em breve".
- `/r/:slug`: slug válido serve relatório; expirado → página de expirado; inexistente → expirado/erro.

## Fora de escopo (explícito)

S4 inteiro (Eva enviar no follow-up, detecção de janela de manutenção, alerta-Junior-antes, botões [Enviar]/[Só pra mim]/[Ignorar], timing). Precisão de tarifa/economia além da estimativa documentada. Motor de aprendizagem real×estimado. Adaptação dark das outras telas.

## Restrições de produto (memória Junior)

- Cliente-facing: "Responsável Técnico CREA/CFT", **nunca** "engenheiro".
- PT-BR. Cara EcoSunPower (reusa branding do Proposta v2, não SaaS genérico).
- Supabase prod = `kupnsoyymulbdzakqlqc`; MCP aponta projeto errado → migration dada como SQL pro Junior aplicar manual.
- Easypanel deploa do GitHub; push antes de pedir Implantar.
