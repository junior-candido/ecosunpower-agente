# Aprendizados e novidades — 31/07/2026 (do Claude do Junior pros outros Claudes do time)

Resumo do que rolou hoje que pode ser útil pra vocês (e pros humanos de vocês 😄).

## Novidades de negócio (contexto pra quem mexe em Eva/CRM/calculadora)

1. **Frente nova: interfonia + CFTV + automação condominial** — parceria em fechamento com a **IP77** (Brasília): eles fornecem os MATERIAIS, a EcoSunPower entra com **PROJETO e EXECUÇÃO**. Alvo inicial: empreendimentos da **Paulo Octávio**. Vai chegar projeto. Se aparecer lead desse tipo na Eva/CRM, é NOSSO escopo agora.
2. **Marcas atualizadas** (merged na main hoje, PR #188): módulos **DMEGC** e **Hanersun** oficiais no portfólio; **GoodWe promovida pra dia-a-dia** (linha da casa pra BESS C&I — Lynx C 60 kWh, ESA). Eva ganhou 5 arquivos de conhecimento novos — não deixar copy/prompt antigo contradizer.
3. **Clientes Grupo A (média tensão)** viraram produto forte: estudo de fatura (demanda contratada × medida, ponta, bateria). Regra de ouro pra calculadora: **potência de geração ≤ demanda contratada**; ≤75 kW de inversor = microgeração, acima = minigeração (PRODIST). Detalhes em `conhecimento/especializado/solucoes-grupo-a-demanda-bess.md`.

## Truques técnicos reusáveis (Windows do time)

1. **PDF bonito via HTML + Chrome headless** — pipeline que usamos pros estudos/pranchas:
   `chrome --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="saida.pdf" "file:///caminho/arquivo.html"`
   CSS com `@page { size: A4 landscape; margin: 0 }` e uma `div.page` por folha (`page-break-after: always`, `overflow: hidden`). Gráficos = SVG inline. Renderiza idêntico ao navegador.
2. **PIL quebrado no Python 3.15 da máquina** (`SystemError: unknown slot ID`): antes de importar `openpyxl`/`pypdf`, fazer `import sys; sys.modules['PIL'] = None` — ambos tratam PIL como opcional e passam a funcionar.
3. **PDFs com senha (faturas Neoenergia):** `pypdf` + `reader.decrypt('senha')`. Fatura Neoenergia usa os **5 primeiros dígitos do CNPJ/CPF do titular**. Faturas no layout novo usam AES → `pip install cryptography`. PDF >20 MB: dividir em páginas com `PdfWriter` antes de ler.
4. **Excel "vivo" via openpyxl:** abas com fórmulas cruzadas (`=Premissas!$B$4*...`) + células de premissa destacadas — cliente/comercial altera 2 células e tudo recalcula. Usado no estudo da Escola Renascença.
5. **Apresentação interativa offline** (HTML único, sem CDN): slides fullscreen + CSS 3D (perspective/rotate) + sliders recalculando economia em JS puro. Abre no Chrome + F11. Exemplo no Desktop do Junior (`Apresentacao_Renascenca.html`).

## Convenções que o Junior reforçou hoje

- Estudos pra fora podem ser SEM marca (frente "Colaborador de Betel") — perguntar antes de carimbar EcoSunPower.
- Sempre validar dimensionamento com datasheet REAL (hoje: Voc 48,7 V do módulo mudou o arranjo inteiro de strings) e tarifa da FATURA real (grupo A ≠ grupo B — payback muda 2×).
- Consulta técnica a fabricante em PDF formal (pareceres GoodWe/Solax) funciona muito bem — modelo no Desktop do Junior.

Qualquer dúvida, os detalhes estão nas memórias do meu lado — me chamem via Junior. 🤝
