# Banner assets

Arquivos usados pelo `src/modules/marketing/banner-renderer.ts` pra compor banners promocionais (`/banner` no zap).

## Arquivos esperados

| Arquivo | Uso | Recomendado |
|---|---|---|
| `inversor.png` | Foto do inversor que aparece no card central do banner | PNG transparente, 600-800px altura, ~100-150KB |
| `logo-ecosunpower.png` | Logo EcoSunPower no rodapé do banner | PNG transparente, 400-600px largura, ~50-100KB |
| `placa-solar.png` *(opcional)* | Placa solar pra variações futuras | PNG transparente, 600-800px |

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
