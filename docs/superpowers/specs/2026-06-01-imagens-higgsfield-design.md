# Imagens de marketing via Higgsfield + logo EcoSunPower

**Data:** 2026-06-01
**Branch:** `feat/imagens-higgsfield`

## Objetivo

Substituir as imagens repetitivas do FLUX (posts de marketing seg/qui) por imagens
**top** geradas via **Higgsfield Cloud API**, com a **logo EcoSunPower aplicada no canto**
em todas, e com **variedade real** de cenas do universo solar (sem repetição).

## Contexto / decisões validadas (01/06)

- Conexão Higgsfield via SDK `@higgsfield/client` (v2) validada ponta a ponta.
- Créditos de API são **pool separado** da assinatura do site (pacote avulso comprado).
- Qualidade aprovada; telha cerâmica + painéis realistas saem bem com prompt técnico.
- Logo **no canto inferior direito, tamanho grande** (~460px em 1080 de largura) — aprovado.
- Fluxo desejado: manda **1 imagem** por post; se Junior não gostar, botão **"Outra"** gera nova.
- Escopo v1 = **só imagem** do post orgânico (seg/qui). Vídeo segue FLUX+Luma. Blog = sub-projeto 2.

## Arquitetura (módulos novos, isolados)

1. **`src/modules/marketing/higgsfield-gen.ts`**
   - `HiggsfieldImageGenerator` com `generate({ prompt, aspectRatio }) → { url }`.
   - Mesma interface do `ImageGenerator` (FLUX) → drop-in.
   - Usa `@higgsfield/client/v2` (`subscribe('flux-pro/kontext/max/text-to-image', …)`).
   - Credenciais via `config.higgsfieldCredentials` (env `HIGGSFIELD_CREDENTIALS`, formato `KEY_ID:KEY_SECRET`).

2. **`src/modules/marketing/branded-frame.ts`**
   - `applyBrandLogo(imageBuffer) → PNG buffer` com a logo no canto inferior direito.
   - Usa **satori + @resvg/resvg-js** (mesma stack do `banner-renderer`, sem depender de `sharp`,
     que é opcional/instável no Docker). Foto como background `objectFit: cover`, logo como `img` sobreposto.
   - Logo de `assets/banner/logo-ecosunpower-1024-transparente.png`.

3. **`src/modules/marketing/solar-scenes.ts`**
   - Pool de ~10 cenas (residencial telhado, comercial, usina solo, híbrido c/ bateria,
     carregador EV, close painéis, técnico instalando, rural/agro, carport, vista aérea).
   - `pickScene(lastKey?) → { key, prompt }` com rotação (evita repetir a última) + variação
     de cenário/seed pra mesma cena nunca sair igual.

## Fluxo (weekly seg/qui, no `checkMarketingSchedule`)

```
Eva escreve copy + escolhe cena (solar-scenes) →
Higgsfield gera imagem (higgsfield-gen) →
aplica logo (branded-frame) → sobe no Supabase Storage →
manda no zap: 1 imagem + botões [✅ Aprovar] [🔄 Outra] [🗑️ Descartar]
```

- **Botão "Outra"** → regenera com nova cena/seed e reenvia (gasta crédito só aqui).
- **Rede de segurança:** se Higgsfield falhar (sem crédito / timeout / erro), cai pro FLUX
  (`ImageGenerator` atual) e **ainda aplica a logo**. A mensagem seg/qui nunca deixa de chegar.

## Schedule

- `checkMarketingSchedule` já ajustado pra `weekday === 1 || weekday === 4` (segunda e quinta).

## Testes (TDD)

- `branded-frame`: gera PNG válido nas dimensões certas; região da logo não-vazia.
- `solar-scenes`: `pickScene` não repete a última; cobre todas as chaves ao longo da rotação.
- `higgsfield-gen`: mock do SDK → parse de `images[0].url`; erro propaga pra acionar fallback.
- fallback: Higgsfield lança → caminho FLUX é usado e logo é aplicada.

## Fora de escopo (v1)

- Vídeo via Higgsfield (segue FLUX+Luma).
- Imagem de capa do blog (sub-projeto 2 — vive no repo do site Astro).
- Anúncios pagos Meta/Google = fluxo manual (Junior gera no site ilimitado + aplica logo).

## Dependência operacional

- Cadastrar `HIGGSFIELD_CREDENTIALS` no Easypanel antes de Implantar.
- Trocar a API key depois dos testes (boa prática — a chave circulou em arquivos de teste).
