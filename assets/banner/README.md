# Banner assets

Arquivos usados pelo `src/modules/marketing/banner-renderer.ts` pra compor banners promocionais (`/banner` no zap).

## Arquivos esperados

## Naming convention (multiplas marcas)

O renderer detecta a marca **automaticamente** a partir do que tu digitar
no briefing (`marca_modulo`, `marca_inversor`) e procura um arquivo
**`<categoria>-<primeira-palavra-da-marca>.png`** na pasta. Se nao achar,
faz fallback pro arquivo generico `<categoria>.png`.

### Exemplo

Se tu digitar `marca_modulo = "Risen 700W HJT"`, o renderer tenta
carregar `modulo-risen.png`. Se nao tiver, usa `modulo.png` (generico).

| Marca digitada | Arquivo procurado |
|---|---|
| "Risen 700W HJT" | `modulo-risen.png` |
| "LONGi Hi-MO X10" | `modulo-longi.png` |
| "Canadian Solar 555W" | `modulo-canadian.png` |
| "Astro 590W" | `modulo-astro.png` |
| "Hoymiles 2,25 kW" | `inversor-hoymiles.png` |
| "Sungrow SG10RT" | `inversor-sungrow.png` |
| "SolarEdge SE5000H" | `inversor-solaredge.png` |

### Arquivos esperados (cria conforme tu trabalhar com cada marca)

| Arquivo | Uso |
|---|---|
| `modulo.png` | Placa solar generica (fallback) |
| `modulo-risen.png` | Risen Energy |
| `modulo-longi.png` | LONGi |
| `modulo-canadian.png` | Canadian Solar |
| `modulo-astro.png` | Astro Solar |
| ... | (adiciona conforme precisar) |
| `inversor.png` | Inversor generico (fallback) |
| `inversor-hoymiles.png` | Hoymiles micro |
| `inversor-sungrow.png` | Sungrow string |
| `inversor-solaredge.png` | SolarEdge otimizado |
| `inversor-growatt.png` | Growatt |
| ... | (adiciona conforme precisar) |
| `logo-ecosunpower.png` | Logo EcoSunPower (rodape do banner) |

## Regras pra não travar o renderer

- **PNG transparente** (sem fundo branco) — necessário pro layout funcionar
- **Tamanho máximo 300KB por arquivo** — acima disso o render fica lento e o repo infla
- **Resolução máxima 1200px no maior eixo** — não precisa 4K, satori renderiza sem perda perceptível em ate 1080×1350
- **Sem CMYK, só RGB** — satori só lê RGB

## Fallback

Se algum arquivo faltar, o `banner-renderer.ts` **NÃO quebra** — renderiza o banner sem aquele elemento (foto/logo) em vez de dar erro. Isso garante que campanha pode subir mesmo com asset pendente.

## Como adicionar/atualizar

1. Coloca o PNG nessa pasta com o nome exato (`inversor.png`, `logo-ecosunpower.png`)
2. Commit + push
3. Implanta no Easypanel pro container puxar
4. Manda `/banner` no zap pra testar
