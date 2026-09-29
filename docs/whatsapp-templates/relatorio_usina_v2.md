# Modelo de WhatsApp `relatorio_usina_v2` — o que preencher na Meta

Por quê: a Meta classificou o `relatorio_usina_v1` como **Marketing** (mais caro e
bloqueado para quem se descadastrou). O v2 é escrito como **aviso de conta** sobre a
usina do próprio cliente — sem emoji, sem "economizou", sem oferta, sem convite a
comprar — para caber em **Utilidade**. Mesmas variáveis e mesmo botão do v1.

Onde: Meta Business Suite → WhatsApp Manager → Modelos de mensagem → **Criar modelo**
(conta WABA da EcoSunPower).

| Campo | Valor |
|---|---|
| Categoria | **Utilidade** (Utility) |
| Nome | `relatorio_usina_v2` |
| Idioma | **Português (BR)** — `pt_BR` (NÃO "Portuguese (POR)") |
| Cabeçalho | Nenhum |
| Rodapé | Nenhum |

## Corpo (copiar exatamente)

    Olá, {{1}}. O relatório da sua usina solar referente a {{2}} está disponível. Ele mostra a energia gerada, a energia compensada na sua conta de luz e o saldo de créditos. Para consultar, toque no botão abaixo.

Exemplos pedidos pela Meta:
- `{{1}}` → `João`
- `{{2}}` → `agosto de 2026`

## Botão

- Tipo: **Chamada para ação → Acessar o site**
- Texto do botão: `Ver relatório`
- Tipo de URL: **Dinâmica**
- URL: `https://propostas.ecosunpower.eng.br/rg/{{1}}`
- Exemplo: `https://propostas.ecosunpower.eng.br/rg/Zx9kQ2mN4pR7sT1vW3yA5bC8dE0fG6hJ`

## Depois que a Meta aprovar como Utilidade — ligar (sem implantar)

No Supabase → SQL Editor:

```sql
insert into app_flags (key, value) values ('relatorio_usina_modelo', 'relatorio_usina_v2')
on conflict (key) do update set value = excluded.value;
```

Voltar para o v1: `update app_flags set value = 'relatorio_usina_v1' where key = 'relatorio_usina_modelo';`

Enquanto a linha não existir (ou estiver vazia), o sistema continua mandando o **v1**.
Se a Meta também classificar o v2 como Marketing, NÃO ligue — mantenha o v1.
