# Eva Proposta — Estudo Personalizado + Modos de Envio

**Data:** 2026-05-05
**Autor:** Junior + Claude (brainstorm consolidado)
**Status:** Spec aprovado, aguardando plano de implementação
**Repositório:** `ecosunpower-agente`
**Migration relacionada:** 016 (`propostas_publicas` já existe)

## Contexto

A Eva já gera propostas em prod desde 29/04/2026 (commit `9d22e20`). Saída dual: PDF no Drive + página web pública em `propostas.ecosunpower.eng.br/p/:slug` com TTL de 60 dias.

Dois pontos de fricção apareceram no uso real:

1. **Falta de diferenciação visual** — propostas geradas pra clientes "premium" (com estudo 3D do telhado) saem iguais às básicas. Junior gostaria de incluir fotos do estudo de geração e até vídeo de simulação de sombreamento pra impressionar e se posicionar como técnico, não vendedor de placa.

2. **Eva exige campos demais quando é o Junior que vai enviar** — telefone, email, CPF tratados como obrigatórios sempre. Quando Junior está testando ou só quer o PDF pra mandar manualmente, ela enche o saco e ele acaba colocando dado fake. O modo "Eva manda direto pro cliente" precisa de qualificação completa, mas o modo "Junior envia" não.

## Objetivos

1. Permitir anexar **até 3 fotos + 1 vídeo opcional** de estudo personalizado (telhado 3D, sombreamento) à proposta.
2. Diferenciar visualmente proposta "personalizada" de "básica" (selo no topo da web).
3. Distinguir dois modos de envio (`Junior envia` vs `Eva envia`) com exigências de campos diferentes.
4. Manter zero atrito: defaults inteligentes, conversação curta, sem comandos novos pra decorar.
5. Reaproveitar arquitetura dual existente (PDF + Web).

## Fora de escopo

- Análise visual automática do telhado (Google Maps Static API) — Fase futura
- OCR de conta de luz — Fase futura
- Botão "Aceitar Proposta" na web → webhook → `/fechar` — Fase futura
- Suporte a Grupo A (Verde/Azul) — Fase futura
- Editor web pra ajustar legendas/ordem das fotos — Fase futura
- Integração com software de simulação 3D (PVsyst/Helioscope/SketchUp) — usuário envia arquivos prontos via WhatsApp

## Decisões aprovadas no brainstorm

### Estudo personalizado

| Tópico | Decisão |
|---|---|
| Quantidade fotos | Até 3 (limite rígido) |
| Vídeo | 1 opcional, máx 60s, máx 30MB |
| Legendas | Obrigatórias por foto e vídeo |
| Posição na proposta | **Primeira seção**, logo após cabeçalho — antes dos cards "Por que EcoSunPower" |
| Estratégia de venda | Mostra estudo do telhado SEM revelar geração estimada — cria curiosidade, ancora valor antes do preço |
| Como envia | WhatsApp como **documento** (não como foto/vídeo) pra preservar qualidade |
| PDF vs Web | Vídeo só na web; PDF mostra thumbnail do 1º frame + QR Code pra versão online |

### Modos de envio

| Modo | Quando usar | Campos obrigatórios | Comportamento Eva |
|---|---|---|---|
| **Junior envia** (default) | Junior já tem o cliente, só quer o PDF/link pra mandar manual | Nome | Aceita "pula"/"n/a" em telefone/email/CPF, NÃO insiste, NÃO valida formato fake |
| **Eva envia** | Cliente real, lead novo, qualificação | Nome + Telefone | Valida formato do telefone, recomenda email/CPF, manda PDF + link web direto pro cliente após Junior aprovar |

### Tipos de proposta

| Tipo | Conteúdo |
|---|---|
| **Básica** (default) | Estrutura atual, sem seção de estudo personalizado |
| **Personalizada** | Inclui seção "Estudamos seu Telhado" (3 fotos + vídeo opcional) no topo |

Modos de envio e tipos são **ortogonais** (4 combinações possíveis).

## Fluxo conversacional

### Início do `/proposta`

Eva pergunta em sequência (mensagens curtas, defaults inteligentes):

```
Eva: Quem envia essa proposta? Você ou eu mando direto pro cliente?
     (default: você envia)

Junior: eu envio   →   modo = junior_envia
Junior: ok / vai   →   modo = junior_envia (aceita default)
Junior: você manda →   modo = eva_envia

Eva: Tipo: básica ou personalizada (com estudo do telhado)?
     (default: básica)

Junior: básica / ok →   tipo = basica
Junior: personalizada →   tipo = personalizada
```

### Modo `junior_envia` + tipo `basica` (caminho rápido)

- Eva pede só Nome do cliente (obrigatório, vai no PDF).
- Endereço: pergunta uma vez (útil pro PDF). Aceita "pula"/"n/a", omite no PDF se vazio.
- Telefone, email, CPF: pergunta uma vez cada, aceita "pula"/"n/a"/"depois", NÃO insiste, NÃO valida.
- Coleta dados de geração (consumo, tarifa, fator de perda escolhido pelo Junior) — esses continuam obrigatórios pois sem eles a engine de cálculo quebra.
- Gera direto.

### Modo `junior_envia` + tipo `personalizada`

- Mesmo do anterior, mas após Nome, Eva avisa:
  > "Personalizada confirmada. Pode mandar as fotos do estudo (até 3) e o vídeo de sombreamento (opcional, até 60s) **como documento** a qualquer momento. Vou pedir uma legenda curta de cada um."
- Auto-detect: quando Junior anexa imagem/vídeo, Eva pergunta a legenda → salva → confirma.
- Antes de gerar, Eva confirma quantos arquivos recebeu e gera.

### Modo `eva_envia` (qualquer tipo)

- Telefone: obrigatório, validado (regex BR `^\+?55?\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}$`).
- Email/CPF: recomendados, perguntados claramente como "vai melhorar a proposta", aceita pular.
- Após Junior aprovar a proposta gerada, Eva envia direto pro cliente: PDF (Drive link) + link web público + mensagem-modelo curta de apresentação.

### Anexar pós-geração (`/anexar`)

- Comando `/anexar [slug-ou-nome-cliente]` permite adicionar fotos/vídeo a uma proposta já gerada.
- Eva busca a proposta por slug ou pelo nome do cliente mais recente.
- Carrega o estado salvo, ativa modo de upload, recebe os anexos.
- Regenera PDF + atualiza HTML web mantendo o **mesmo slug** (URL pública anterior continua válida, o conteúdo é que troca — cliente que recebeu o link antes ainda acessa, agora vê a versão com fotos).
- Se a proposta original era `tipo=basica`, vira `personalizada` automaticamente após o primeiro anexo.

## Arquitetura

### Componentes novos / modificados

```
src/modules/proposal/
├── attachments/                    [NOVO]
│   ├── whatsapp-media-downloader.ts   # Baixa arquivo do WABA via media ID
│   ├── storage-uploader.ts            # Sobe pra Supabase Storage bucket "estudos-personalizados"
│   ├── video-thumbnail.ts             # Extrai 1º frame do MP4 (ffmpeg) pro PDF
│   └── attachment-validator.ts        # Valida tipo MIME, tamanho, duração de vídeo
├── calculator.ts                   # SEM mudança
├── template.ts                     [MOD] Renderização condicional dos campos contato + nova seção "Estudo Personalizado" + selo "Personalizada"
├── pdf-generator.ts                [MOD] Carrega thumbnail do vídeo + gera QR Code pro link web
└── drive-uploader.ts               # SEM mudança

src/modules/
├── proposal-assistant.ts           [MOD] Estado Redis ganha campos modo_envio, tipo, attachments[], 
│                                          fluxo conversacional inicial, auto-detect mídia
└── eva-sender.ts                   [NOVO] Envia proposta direto pro cliente (modo eva_envia) — manda 3 mensagens em sequência: (1) saudação personalizada com nome do cliente, (2) link da proposta web, (3) PDF como documento. Template da saudação fica em `conhecimento/propostas.md`.

src/routes/
└── public-proposal.ts              [MOD] Renderiza vídeo HTML5 + selo "Personalizada"

conhecimento/
└── propostas.md                    [MOD] Regras dos 2 modos + tipos + comportamento de campos opcionais

supabase/migrations/
└── 017_proposta_attachments.sql    [NOVO] Tabela attachments + storage bucket policy
```

### Schema de dados

**Nova tabela `proposta_attachments`:**

```sql
CREATE TABLE proposta_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_slug TEXT REFERENCES propostas_publicas(slug) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('foto', 'video')),
  ordem SMALLINT NOT NULL,                    -- 1..3 pra fotos, 1 pra vídeo
  legenda TEXT NOT NULL,
  storage_path TEXT NOT NULL,                  -- caminho no bucket Supabase
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  thumbnail_path TEXT,                         -- só pra vídeo (1º frame)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_attachments_slug ON proposta_attachments(proposta_slug);
```

**Bucket Supabase Storage:** `estudos-personalizados`
- Acesso público de leitura via URL assinada (TTL 60d, igual ao slug)
- Limite hard do bucket por arquivo: 50MB (Supabase config)
- Limite validado pelo nosso código:
  - Foto: 10MB por arquivo (formato JPG/PNG)
  - Vídeo: 30MB total + duração máx 60s (formato MP4)
- Estrutura: `{slug}/foto-1.jpg`, `{slug}/foto-2.jpg`, `{slug}/video.mp4`, `{slug}/video-thumb.jpg`

**Estado Redis (TTL 1h, expandido):**

```typescript
interface ProposalState {
  // existentes
  cliente_nome?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  cliente_cpf?: string;
  // ... outros campos atuais

  // novos
  modo_envio: 'junior_envia' | 'eva_envia';
  tipo: 'basica' | 'personalizada';
  attachments: Array<{
    tipo: 'foto' | 'video';
    legenda: string;
    media_id_waba: string;        // ID temporário do WhatsApp pra baixar
    storage_path?: string;          // preenchido após upload pro Supabase
  }>;
}
```

### Fluxo técnico de upload de mídia

```
Junior envia documento no WhatsApp
   ↓
Webhook recebe `messages[0].document` ou `messages[0].image` ou `messages[0].video`
   ↓
proposal-assistant detecta arquivo + estado ativo de /proposta personalizada
   ↓
Eva pergunta legenda
   ↓
Junior responde legenda
   ↓
whatsapp-media-downloader baixa via /v18.0/{media_id} → buffer
   ↓
attachment-validator valida (tipo, tamanho, duração)
   ↓
storage-uploader sobe pro Supabase bucket {slug}/foto-N.ext
   ↓
Se vídeo: video-thumbnail extrai 1º frame via ffmpeg → sobe thumb
   ↓
Persiste em proposta_attachments + atualiza estado Redis
   ↓
Eva confirma "✅ Foto 1/3 anexada: 'Vista superior do telhado'"
```

## Renderização

### PDF (Puppeteer)

Quando `tipo = personalizada`:
- **Primeira seção após cabeçalho:** "Estudamos seu Telhado"
- Selo no topo: "📐 Proposta com Estudo Técnico Personalizado"
- Layout das fotos por quantidade:
  - 1 foto: full width centralizada
  - 2 fotos: lado a lado 50/50
  - 3 fotos: 1 grande no topo + 2 menores embaixo
- Cada foto com legenda abaixo
- Vídeo: thumbnail (1º frame) + caixa "🎥 Simulação de sombreamento — escaneie o QR Code pra assistir" + QR Code apontando pro link web público
- Tamanho-alvo das imagens no PDF: 1200-1600px largura → renderiza em ~720px nítido

### Web pública (`propostas.ecosunpower.eng.br/p/:slug`)

Quando `tipo = personalizada`:
- Banner topo: "📐 Proposta com Estudo Técnico Personalizado"
- Seção "Estudamos seu Telhado" antes dos cards
- Galeria responsiva (CSS grid) das fotos com legendas
- Vídeo HTML5 nativo: `<video autoplay muted loop controls>`
- Mantém CSP/X-Frame-Options/no-cache/noindex

### Template — campos de contato condicionais

Pseudocódigo do template:

```handlebars
{{#if cliente_telefone}}
  <p>Telefone: {{cliente_telefone}}</p>
{{/if}}
{{#if cliente_email}}
  <p>Email: {{cliente_email}}</p>
{{/if}}
{{#if cliente_cpf}}
  <p>CPF: {{cliente_cpf}}</p>
{{/if}}
```

Sem campo → linha some, layout não fica esquisito.

## Casos de borda

| Situação | Comportamento |
|---|---|
| Junior tenta anexar 4ª foto | Eva: "Limite de 3 fotos. Quer substituir alguma das anteriores?" |
| Vídeo > 30MB | Eva: "Vídeo passou do limite (30MB). Comprime ou corta pra até 60s e reenvia." |
| Vídeo > 60s | Eva: "Vídeo tem {X}s, limite é 60. Edita e reenvia." |
| Junior manda foto como "foto" (não documento) | Eva aceita, mas avisa "qualidade reduzida pelo WhatsApp — pra próxima manda como documento" |
| Junior escolhe "personalizada" mas não anexa nada antes de gerar | Eva confirma: "Personalizada selecionada mas sem anexos. Gera assim mesmo (vai sair sem a seção) ou anexa agora?" |
| Modo `eva_envia` + telefone fake (regex falha) | Eva: "Esse número parece inválido. Confirma?" Permite override 1x se Junior insistir. |
| Modo `junior_envia` + Junior fornece telefone real | Eva aceita normal, inclui no PDF. Não muda pra modo `eva_envia` automaticamente. |
| `/anexar [id]` em proposta inexistente/expirada | Eva: "Proposta {id} não encontrada ou expirada. Gera nova com `/proposta`." |
| Falha no upload pro Supabase Storage | Retry 2x. Se persistir, Eva: "Falha ao salvar a foto. Reenvia ou seguimos sem ela." |
| Falha ao extrair thumbnail do vídeo (ffmpeg) | PDF usa imagem placeholder genérica + QR Code. Eva loga warning. |

## Performance e custo

- Upload de mídia: 1 download WABA + 1 upload Supabase + 1 thumbnail (se vídeo) = ~2-5s por arquivo
- Custo storage Supabase: ~R$ 0,021/GB/mês — proposta média (3 fotos 2MB + vídeo 20MB) = R$ 0,0006/mês por proposta
- Custo extra Claude por proposta personalizada: +1-2 turnos pra coletar legendas = ~R$ 0,05
- **Custo total proposta personalizada: ~R$ 0,35-0,60** (vs R$ 0,30-0,55 da básica)
- TTL 60d alinha com slug — após expiração, attachments deletam em cascade (CASCADE no FK)

## Testing strategy

**Unit tests obrigatórios:**
- `attachment-validator.ts` — todos os limites (tamanho, tipo, duração)
- `whatsapp-media-downloader.ts` — mock da WABA API, retry, erro 401
- `video-thumbnail.ts` — extração de frame via ffmpeg, fallback se ffmpeg falhar

**Integration tests:**
- Fluxo conversacional completo modo `junior_envia` + `personalizada` com mock de webhook
- Fluxo `eva_envia` validando regex de telefone
- `/anexar` em proposta existente regenera PDF mantendo slug

**Manual smoke test pré-prod:**
- Junior gera proposta básica modo `junior_envia` com só Nome → confirma PDF sai sem campos contato
- Junior gera proposta personalizada com 3 fotos + vídeo → confirma seção, QR Code, vídeo na web
- Junior testa modo `eva_envia` + telefone fake → confirma Eva valida

## Migration deploy

1. Aplicar `017_proposta_attachments.sql` em prod (Supabase)
2. Criar bucket `estudos-personalizados` com policy de leitura assinada
3. Adicionar `ffmpeg` no Dockerfile (já tem Puppeteer base, ffmpeg é leve ~30MB)
4. Adicionar libs npm: `qrcode` (gera QR), `fluent-ffmpeg` ou `ffmpeg-static`
5. Deploy via push → Easypanel auto-build → aguardar 5-7min
6. Smoke test acima

## Riscos

| Risco | Mitigação |
|---|---|
| `ffmpeg-static` aumenta imagem Docker em ~80MB | Aceito — vale pelo benefício |
| Cliente acha vídeo "lento" no celular antigo | Vídeo já é muted+loop curto, peso máx 30MB. Se virar problema, oferecer fallback "imagem-só" |
| Junior esquece que escolheu "personalizada" e gera sem anexos | Eva confirma antes de gerar (caso de borda mapeado) |
| Storage Supabase exceder cota free tier | Cota grátis = 1GB. Proposta média ~25MB → suporta ~40 propostas. Plano Pro US$25/mês = 100GB. Avaliar quando passar de 30 propostas/mês |

## Decisões a confirmar (nenhuma — todas resolvidas no brainstorm)

Spec fechado. Próximo passo: writing-plans.
