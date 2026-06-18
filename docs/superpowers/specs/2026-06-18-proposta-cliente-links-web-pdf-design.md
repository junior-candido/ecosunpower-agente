# Proposta do cliente — links web + PDF, copy persuasiva e rastreio do PDF

Data: 2026-06-18
Status: aprovado (Junior)
Escopo: forward-only — vale da próxima proposta gerada em diante. As propostas já
geradas não são afetadas.

## Problema

A mensagem que vai pro cliente hoje (`buildMensagemClienteProposta`) tem dois problemas:

1. **Só leva o link da web.** O PDF só existe no Google Drive, então não dá pra oferecer
   um "link de PDF" sem expor `drive.google.com`.
2. **A copy é fraca.** Texto atual ("Dá uma olhada com calma…") não persuade.

Junior quer:
- Versão do cliente com **link da web + link do PDF**, ambos do nosso domínio, sem citar Drive.
- Copy **persuasiva**, com a **economia mensal real** da proposta na frase.
- Funcionar nos **dois modos de envio**: "Junior copia e manda" e "Eva manda automático".
- O PDF deve ser **rastreável** e entrar na regra de "atendimento ao abrir", **sem** abordar o
  cliente duas vezes quando ele abre web e PDF.

## Decisões de design

### 1. Link público de PDF no nosso domínio (sem Drive)

Nova rota `GET /p/:slug.pdf` em `src/index.ts`, espelhando o padrão já existente em
`/r/:slug?pdf=1` (relatório). Ela:

- Valida o slug com a mesma regex da rota web (`/^[A-Za-z0-9_-]{16,32}$/`).
- Busca a proposta via `supabase.getPropostaPublicaBySlug(slug)` e respeita os mesmos
  estados: `not_found` → 404, `expired` → 410, `revoked` → 404.
- Gera o PDF na hora a partir do `html_content` salvo, usando
  `htmlToPdf` de `./modules/proposal/pdf-generator.js`.
  - Usa o HTML salvo **como está** (com o thumbnail do vídeo). O swap por `<video>` nativo é
    só pra rota HTML; PDF não tem vídeo.
- Responde com `Content-Type: application/pdf` e
  `Content-Disposition: inline; filename="Proposta-EcoSunPower-<ClienteNome>.pdf"`
  (nome do cliente sanitizado: só `[a-zA-Z0-9 ]`, espaços → `-`).
- Mesmos headers de segurança da rota web: `Cache-Control: no-store`, `X-Robots-Tag: noindex`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

URL final usada nas mensagens: `https://propostas.ecosunpower.eng.br/p/<slug>.pdf`.

> Nota Express: slugs são base64url (sem ponto), então `/p/:slug.pdf` captura o slug
> corretamente até o `.pdf`. Se o roteamento der conflito, fallback aceito é
> `GET /p/:slug` + `?pdf=1` (igual ao relatório).

### 2. Copy nova (versão "a" — foco no bolso) com economia real

`buildMensagemClienteProposta` ganha dois parâmetros novos:
`pdfUrl: string` e `economiaMensal: number | null`.

Mensagem do cliente (com economia disponível):

```
Olá, [Primeiro nome]! 😊
Sua proposta de energia solar da EcoSunPower está pronta — e sua conta de luz fica
cerca de R$ 10.493 mais barata por mês ☀️

Em vez de pagar uma conta que só aumenta, você passa a investir em algo que se paga
sozinho e ainda valoriza seu imóvel.

🌐 Veja sua proposta completa (abre direto no celular):
https://propostas.ecosunpower.eng.br/p/<slug>

📄 Prefere em PDF pra guardar?
https://propostas.ecosunpower.eng.br/p/<slug>.pdf

Dá uma olhada — e me chama que eu te explico cada número! 💚
```

Regras da economia:
- O número é **exatamente** o mesmo `economiaMensal` calculado pra proposta (vem de
  `result.calculations.economiaMensal` em `generateProposalCore`). **Nunca recalcular** —
  reusar o valor que já foi pro PDF/web, pra não dar divergência ("furada").
- Formatação BRL idêntica à da proposta (sem centavos, separador de milhar — ex: `R$ 10.493`).
  Reusar o mesmo helper de formatação que o template usa.
- Se `economiaMensal` for nulo/zero (ex.: proposta **só-serviço**, sem cálculo solar):
  cai numa versão da copy **sem a linha do número** ("…está pronta — feita sob medida pra você ☀️").

### 3. Dois modos de envio

**Modo `junior_envia` (copia e manda):** mensagem 100% texto, com os dois links do nosso
domínio (web + `.pdf`) e a copy nova. WhatsApp mostra a URL no texto — limitação conhecida;
a "camuflagem" é a frase amigável antes do link + domínio próprio (nunca Drive).
Ponto de mudança: `proposal-assistant.ts` linha ~1598, passando `pdfUrl` e `economiaMensal`.

**Modo `eva_envia` (automático):** em `eva-sender.ts`, a Eva manda:
1. Saudação (texto) — com a linha da economia.
2. **Botão clicável** `cta_url` "🌐 Ver minha proposta" → abre a URL web (URL escondida atrás
   do botão; só funciona neste modo automático).
3. **PDF como documento anexado** (já é assim hoje via `uploadMedia` + `sendDocumentById`).
   O anexo é o "baixe o PDF" — sem link, sem Drive.

Isso exige um método novo em `meta-whatsapp.ts`:

```
sendCtaUrlButton(to, bodyText, buttonText, url)
```

que monta o interactive WABA:
```
type: 'interactive',
interactive: {
  type: 'cta_url',
  body: { text: bodyText },
  action: { name: 'cta_url', parameters: { display_text: buttonText, url } }
}
```
(WABA permite **1** botão de URL por mensagem — por isso só o web vira botão; o PDF vai como anexo.)

`EnviarPropostaInput` ganha `economiaMensal?: number | null` pra montar a saudação.

### 4. Versão de revisão do Junior — inalterada

A mensagem de revisão (números internos, preview rastreado `?eu=`, link do Drive) **continua
exatamente como está**. Só a mensagem do cliente muda.

### 5. PDF rastreável, abordagem única

A rota `/p/:slug.pdf` chama o **mesmo caminho de rastreio** da rota web:
- `supabase.registrarVisualizacaoProposta({ slug, ip, userAgent, isPreview:false, referer, canal:'pdf' })`
- `supabase.incrementPropostaPublicaAcesso(slug)` → na 1ª abertura (`acessosAntes === 0`)
  dispara `proposalFollowup.triggerOnView(slug, acessosAntes, 'pdf')`.

Como o **contador de acessos é compartilhado** (mesma linha em `propostas_publicas`), abrir web
e depois PDF (ou vice-versa) dispara a abordagem **uma vez só** — a segunda abertura cai no
ramo "reabriu" (só notifica Junior, throttle 5 min). Sem gasto duplo de template.

Enriquecimento (canal web vs pdf):
- Migration nova: adiciona coluna `canal text not null default 'web'` em `proposta_visualizacoes`.
- `registrarVisualizacaoProposta` aceita `canal: 'web' | 'pdf'` (default `'web'`).
- `proposalFollowup.triggerOnView` aceita um `canal` opcional pra a notificação do Junior poder
  dizer "cliente **baixou o PDF**" vs "cliente **abriu** a proposta". Baixar PDF é sinal mais quente.

Risco conhecido (não-bloqueante): o WhatsApp pode "espiar" o link pra gerar preview e contar uma
abertura falsa — **já existe hoje na rota web**, não é novo. Como o contador é compartilhado, no
pior caso a abordagem dispara 1× mesmo assim. Tratar com trava anti-bot só se virar problema real.

## Arquivos afetados

- `src/index.ts` — nova rota `GET /p/:slug.pdf` (gera PDF + rastreia, canal `'pdf'`).
- `src/modules/proposal-assistant.ts` — `buildMensagemClienteProposta` (novos params: `pdfUrl`,
  `economiaMensal`; copy nova); chamada no fluxo `junior_envia` (~linha 1598) passando os valores.
- `src/modules/eva-sender.ts` — saudação com economia; botão `cta_url` no lugar do link cru;
  `EnviarPropostaInput` ganha `economiaMensal`.
- `src/modules/meta-whatsapp.ts` — método novo `sendCtaUrlButton`.
- `src/modules/proposal-followup.ts` — `triggerOnView` aceita `canal` p/ a notificação.
- `src/modules/supabase.ts` — `registrarVisualizacaoProposta` aceita `canal`.
- `supabase/migrations/053_proposta_visualizacoes_canal.sql` — coluna `canal`.

## Testes

- `buildMensagemClienteProposta`: gera web + `.pdf` + linha de economia; fallback sem economia
  (só-serviço); pega só o primeiro nome; PDF URL = web URL + `.pdf`.
- Rota `/p/:slug.pdf`: 200 + `application/pdf` pra slug válido; 404/410 pra not_found/expired/revoked;
  slug malformado → 404; registra visualização com `canal='pdf'`.
- `sendCtaUrlButton`: monta o payload `cta_url` correto.
- Rastreio: abrir web depois PDF dispara abordagem 1× (segundo acesso = "reabriu").

## Fora de escopo (YAGNI)

- Encurtador de URL / slug "vanity" mais bonito.
- Trava anti-bot pra preview do WhatsApp (só se virar problema).
- Mudar a versão de revisão do Junior.
- Reprocessar/retroagir as propostas já enviadas.
