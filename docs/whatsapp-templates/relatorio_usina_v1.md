# Modelo de WhatsApp `relatorio_usina_v1` — o que preencher na Meta

Onde: Meta Business Suite → WhatsApp Manager → Modelos de mensagem → **Criar modelo**
(conta WABA da EcoSunPower — só a EcoSun usa modelo; empresas com WhatsApp próprio
recebem o relatório como mensagem comum pela instância delas).

| Campo | Valor |
|---|---|
| Categoria | **Utilidade** (Utility) |
| Nome | `relatorio_usina_v1` |
| Idioma | **Português (BR)** — `pt_BR`. ⚠️ NÃO escolher "Portuguese (POR)" (foi o erro do `pasta_digital_v1`). O código só tenta `pt_BR`. |
| Cabeçalho | Nenhum |
| Rodapé | Nenhum |

## Corpo (copiar exatamente)

    Olá, {{1}}! ☀️ O relatório de {{2}} da sua usina solar está pronto: quanto ela gerou, quanto você economizou e seus créditos.

Exemplos pedidos pela Meta:
- `{{1}}` → `João`
- `{{2}}` → `agosto de 2026`

## Botão

- Tipo: **Chamada para ação → Acessar o site**
- Texto do botão: `Ver meu relatório`
- Tipo de URL: **Dinâmica**
- URL: `https://propostas.ecosunpower.eng.br/rg/{{1}}`
- Exemplo: `https://propostas.ecosunpower.eng.br/rg/Zx9kQ2mN4pR7sT1vW3yA5bC8dE0fG6hJ`

> A URL tem que começar igual ao `PROPOSAL_PUBLIC_BASE_URL` de produção. Se lá for
> outro domínio, use o mesmo domínio aqui. O caminho é `/rg/` (o `/r/` já é usado
> pelo relatório de acompanhamento).

## Enquanto não aprovar

O sistema tenta o modelo; se a Meta recusar (não aprovado / não existe), manda a
mesma frase como mensagem comum com o link escrito. Mensagem comum só chega se o
cliente falou com a gente nas últimas 24 horas — a tela de resultado avisa isso.
Se nem a mensagem comum sair, a tela mostra ❌ "aguardando aprovação do modelo na Meta".

Se a Meta mudar a categoria para Marketing, aceite só se não houver alternativa
(marketing custa mais e respeita descadastro) e avise o Junior.

Depois de aprovado: nada para implantar — o próximo envio já usa o modelo.
