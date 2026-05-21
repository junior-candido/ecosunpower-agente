# A4 — Tela Admin "Nova Proposta" (versão completa SaaS)

**Data:** 2026-05-21
**Status:** design aprovado
**Frente:** Perfil do Cliente (4ª sub-fatia depois de A1 ✅ + A5 ✅)

## Contexto

Hoje a proposta nasce só no zap (/proposta da Eva). Pro Junior gerar uma proposta a partir do **perfil de um cliente já cadastrado** (A1 entregue 20/05), ele precisa: abrir o WhatsApp, comandar `/proposta`, redigitar tudo que já está no cadastro (nome, telefone, CPF, endereço, cidade, concessionária, consumo). Tempo perdido + risco de erro de digitação.

A4 entrega uma **tela web admin** (`/dashboard/propostas/novo?lead_id=<uuid>`) que:
1. Pré-preenche tudo que A1 já tem cadastrado (nome, telefone, email, CPF, endereço, cidade, UF, concessionária, consumo médio, consumo 12 meses, tarifa_classe, tarifa_modalidade)
2. Apresenta só os campos faltantes editáveis (kWp, módulo, inversor, valor, fator perda, tarifa override, formas pgto override)
3. Aceita upload de **1-3 fotos + 1 vídeo + legendas** pra estudo personalizado (igual /proposta personalizada da Eva)
4. Gera o PDF + link público `/p/:slug` reusando o pipeline atual
5. Mostra preview iframe + botão "📤 Enviar pelo WhatsApp" (igual A5)

A versão "completa" (vs versão "quick" pré-popular sessão Eva) foi escolhida 20/05 porque **Junior pretende comercializar como SaaS**: tela admin web serve hoje e serve pra qualquer cliente SaaS amanhã. Zero retrabalho.

O botão "📄 Nova proposta" no perfil cliente (`clientes-views.ts:549`) JÁ linka pra essa rota — falta só a rota existir.

## Decisões fechadas

| Decisão | Resposta |
|---|---|
| Trigger | Botão "📄 Nova proposta" no perfil cliente (já existe) + URL direta `/dashboard/propostas/novo?lead_id=<uuid>` |
| Pré-preenchimento | Tudo do `ClienteDetail` (A1): nome, phone, email, cpf_cnpj, endereço completo, city, uf, concessionaria, consumo_medio_kwh, consumo_mensal_json (12 meses), tarifa_classe, tarifa_modalidade, profile |
| Upload anexos | Sim — 1-3 fotos + 1 vídeo + legendas via form multipart (não WABA). Reusa pipeline de upload/validação/storage do `/proposta` personalizada |
| Modo envio | Sem select na tela. Sempre `junior_envia` no row salvo. Botão "Enviar pelo zap" pós-geração faz o equivalente ao `eva_envia` na hora |
| Tipo proposta | Auto-detecta: se Junior subiu ≥1 anexo → `personalizada`; senão → `basica` |
| Pós-geração | Tela preview com iframe + 2 botões: "📤 Enviar pelo WhatsApp" + "📋 Copiar link público" |
| Sem lead_id na URL | Erro 400 "lead_id obrigatório" (V1 só suporta cliente já cadastrado; V2 pode aceitar criar lead inline) |
| Cliente em opt_out | Bloqueia botão "Enviar pelo WhatsApp" + warning "Cliente em opt-out, copie o link" |
| Refazer | Pode gerar quantas vezes quiser, cada uma é um slug novo (versionamento natural — A4 reusa `propostas_publicas`) |

## Arquitetura

### Refactor `proposal-assistant.ts` (zero-regressão pro fluxo zap)

**Hoje:** `generateProposal(phone, data, confirmMsg)` é privada + acoplada ao Redis (`proposal:last:${phone}`) + retorna string formatada pro zap + lê estado da sessão Redis pra puxar attachments com `mediaIdWaba`.

**Refactor:**

```typescript
// Tipo de input estruturado, independe de phone/Redis
export interface GenerateProposalCoreInput {
  data: any;                                                       // mesmo formato JSON usado hoje
  modoEnvio: ModoEnvio;                                             // 'junior_envia' | 'eva_envia'
  tipo: TipoProposta;                                               // 'basica' | 'personalizada'
  attachments?: Array<{                                             // já com buffers em mão (upload direto, não WABA)
    buffer: Buffer;
    mimeType: string;
    legenda: string;
    tipo: 'foto' | 'video';
  }>;
}

export interface GenerateProposalCoreResult {
  slug: string;
  publicUrl: string | null;
  pdfBuffer: Buffer;
  driveResult: { pdfWebViewLink: string; htmlWebViewLink: string } | null;
  proposalData: ProposalData;
  calculations: ReturnType<typeof calcular>;
}

// Função pública nova — gera PDF + sobe Drive + Supabase, sem tocar Redis.
async generateProposalCore(input: GenerateProposalCoreInput): Promise<GenerateProposalCoreResult>

// Wrapper antigo vira thin shim — preserva 100% do comportamento atual do zap.
private async generateProposal(phone, data, confirmMsg) {
  const state = await this.loadState(phone);
  const attachments = await this.downloadAttachmentsFromWaba(state.attachments); // download WABA -> buffer
  const result = await this.generateProposalCore({
    data,
    modoEnvio: state.modoEnvio ?? 'junior_envia',
    tipo: state.tipo ?? 'basica',
    attachments,
  });
  await this.redis.setex(`proposal:last:${phone}`, ..., JSON.stringify({ data, upload: result.driveResult, proposalData: result.proposalData, publicUrl: result.publicUrl, slug: result.slug }));
  return formatZapMessage(result, ...);
}
```

### Pipeline de anexos (refatoração não-quebrante)

`processAttachment(supabase, { mediaIdWaba, accessToken, ... })` hoje faz: download WABA → validate → upload Storage → DB. Refatora pra:

```typescript
// Nova função: aceita buffer já em mãos
export async function processAttachmentFromBuffer(
  supabase, { buffer, mimeType, sizeBytes, proposalSlug, legenda, fotoCount, videoCount }
): Promise<ProcessAttachmentResult>

// processAttachment vira thin wrapper que faz download WABA + chama from-buffer
```

A4 chama `processAttachmentFromBuffer` direto com o que veio do multer.

### Módulos novos

- `src/modules/dashboard/proposta-form-view.ts`
  - `renderFormNovaProposta(input: { lead?: ClienteDetail; lead_id: string; defaults?: any; erros?: string[] }): string`
  - `renderPreviewProposta(input: { slug; htmlPreview; publicUrl; clienteNome; clienteTelefone; jaEnviado; canEnviar; reasonNaoEnviar }): string`

### Modificações em arquivos existentes

- `src/modules/proposal-assistant.ts` — extrai `generateProposalCore` (público), `downloadAttachmentsFromWaba` (privado), shim `generateProposal`
- `src/modules/proposal/attachments/index.ts` — extrai `processAttachmentFromBuffer`, `processAttachment` vira wrapper
- `src/modules/dashboard/router.ts` — 4 rotas novas:
  - `GET /dashboard/propostas/novo` (query `lead_id=<uuid>`) — form
  - `POST /dashboard/propostas/novo` — submit (multipart) → chama core → redirect preview
  - `GET /dashboard/propostas/:slug/preview` — iframe + botões
  - `POST /dashboard/propostas/:slug/enviar` — dispara `enviarPropostaParaCliente`
- `src/modules/supabase.ts` — confirma método `getPropostaPublicaBySlug` existe (ou cria)
- `src/index.ts` — só se precisar instanciar algo novo (a princípio não, o ProposalAssistant já é injetado no dashboard router)

### Fluxo end-to-end

```
Junior abre perfil cliente em /dashboard/clientes/<id>
         ↓
Clica "📄 Nova proposta"
         ↓
GET /dashboard/propostas/novo?lead_id=<id>
   Backend: carrega ClienteDetail via supabase.getClienteByLeadId(id)
   Renderiza form pré-preenchido (nome/telefone/email/CPF/endereço/cidade/concessionária/consumo)
         ↓
Junior preenche o que falta:
   - Sistema: kWp, fator perda, módulo (fab/modelo/potW/qtd), inversor (fab/modelo/potW/qtd)
   - Estrutura: tipo + material (default Telha cerâmica + Al anodizado)
   - Comercial: valor total R$, tarifa override (opcional)
   - Anexos: 0-3 fotos + 0-1 vídeo com legendas (opcional)
   - Tarifa, custo disponibilidade (opcional override)
         ↓
Clica "Gerar proposta"
   POST /dashboard/propostas/novo
   Backend:
     1. multer parse multipart (fotos + vídeo + campos)
     2. monta `data` no formato do Claude (dataToProposalData input)
     3. determina tipo = anexos>0 ? 'personalizada' : 'basica'
     4. chama proposalAssistant.generateProposalCore({ data, modoEnvio: 'junior_envia', tipo, attachments })
     5. redirect 303 pra /dashboard/propostas/<slug>/preview
         ↓
GET /dashboard/propostas/<slug>/preview
   Backend: carrega propostas_publicas[slug], renderiza iframe(html_content)
   Mostra: iframe + botões "📤 Enviar pelo WhatsApp" + "📋 Copiar link" + "↻ Refazer"
         ↓
Junior clica "Enviar pelo WhatsApp"
   POST /dashboard/propostas/<slug>/enviar
   Backend:
     - valida cliente !opt_out + tem phone
     - re-gera PDF buffer do html (porque pdf não fica salvo, só html_content)
     - chama enviarPropostaParaCliente(metaService, { telefone, nome, linkPub, pdfBuffer, pdfFilename })
     - marca propostas_publicas.sent_to_client_at = now()
     - redirect pra preview com flash "enviado"
         ↓
Cliente recebe no WhatsApp:
   saudação + link público + PDF anexado (mesma rotina do /proposta zap modo eva_envia)
```

### Form fields (pré-preenchidos + editáveis)

| Seção | Campo | Origem | Editável |
|---|---|---|---|
| Cliente | nomeCliente | `lead.name` | sim |
| Cliente | documentoCliente | `lead.cpf_cnpj` | sim |
| Cliente | enderecoCliente | concat lead.endereco_rua + numero + complemento + bairro + cep + cidade/uf | sim |
| Cliente | telefoneCliente | `lead.phone` | sim |
| Cliente | emailCliente | `lead.email` | sim |
| Cliente | tipoCliente | `lead.profile` (residencial/comercial/rural/indefinido) | sim (select) |
| Sistema | concessionaria | `lead.concessionaria` | sim |
| Sistema | modalidade | `lead.tarifa_modalidade` ?? "autoconsumo local" | sim |
| Sistema | consumoMensalKwh | `lead.consumo_medio_kwh` | sim |
| Sistema | consumoMensalKwhDistribuido | `lead.consumo_mensal_json` → array 12 meses | sim (textarea JSON ou hidden) |
| Sistema | potenciaKwp | — | obrigatório |
| Sistema | fatorPerda | default 0.80 | sim (select 0.75/0.80/0.85) |
| Módulo | fabricante, modelo, potenciaW, quantidade | — | obrigatório |
| Inversor | fabricante, modelo, potenciaW, quantidade | — | obrigatório |
| Estrutura | tipo | default "Telha cerâmica" | sim (select) |
| Estrutura | material | default "Alumínio anodizado + parafusos inox" | sim |
| Comercial | valorTotalRs | — | obrigatório |
| Comercial | tarifaRsKwh | default por concessionária | sim (override) |
| Comercial | custoDisponibilidadeMensal | default por classe (mono 50 / tri 100) | sim (override) |
| Anexos | foto[1-3] + vídeo[0-1] + legendas | — | opcional |

### Modulo + inversor — selects baseados nas marcas oficiais

Em vez de inputs livres, dropdowns com fabricantes oficiais (memory `project_marcas_ecosunpower`):

- **Módulo fabricante**: Trina, JA Solar, LONGi, Jinko, DAH, Risen
- **Inversor fabricante**: Sungrow, Solis, Deye, FoxESS, SolarEdge, Huawei, GoodWe, Hoymiles, Enphase, NEP

Modelo + potência + quantidade ficam como input livres (Junior digita).

### Defaults aplicados no submit (igual o que o Claude faz hoje)

Backend re-aplica os mesmos defaults que `buildSystemPrompt` documenta:
- `tarifaRsKwh`: Neoenergia DF 1.05, Equatorial GO 0.98
- `custoDisponibilidadeMensal`: mono 50, tri 100
- `modulo.garantiaDefeito`: 12
- `modulo.garantiaEficiencia`: 30 (TOPCon N-Type)
- `inversor.garantia`: micro 12 / string 10 / solaredge 12
- `inversor.tipoInversor`: detecta pelo fabricante
- `formasPagamento`: 3 opções default (à vista + cartão Belenus 24x + financiamento 90x)

Junior **não** preenche essas regras — o backend aplica e o Claude prompt fica sem participar (V1 = sem LLM no fluxo admin).

## Segurança e edge cases

| Cenário | Comportamento |
|---|---|
| `lead_id` ausente na query | 400 "Parâmetro `lead_id` obrigatório" |
| `lead_id` inválido (UUID malformado) | 400 "UUID inválido" |
| `lead_id` não existe | 404 "Cliente não encontrado" |
| Sem `nomeCliente` ou `valorTotalRs` no submit | Re-renderiza form com erro inline + valores preservados |
| Anexos > 3 fotos ou > 1 vídeo | 400 "Limite excedido" |
| Anexo > 20MB | 400 "Arquivo X excede limite" |
| Cliente em opt_out | Tela preview mostra warning + botão Enviar desabilitado |
| Cliente sem phone | Mesma coisa |
| Slug não existe na rota preview | 404 |
| Erro no Drive (token expirado) | Proposta sai sem PDF Drive (Supabase web ainda funciona) |
| Erro no Supabase (web) | Falha total — mostra erro pro Junior na tela |
| Re-envio (cliente já recebeu) | Permite (mas mostra warning "enviado em [data]") |

## Testes

- `tests/proposal-assistant-core.test.ts` — `generateProposalCore` com input completo retorna slug + publicUrl + pdfBuffer; sem anexos → tipo=basica; com anexos → pipeline buffer roda
- `tests/proposal-attachments-from-buffer.test.ts` — `processAttachmentFromBuffer` roda sem download WABA
- `tests/dashboard-proposta-form-view.test.ts` — `renderFormNovaProposta` rende campos pré-preenchidos; `renderPreviewProposta` mostra botão enviar / warning opt_out
- `tests/dashboard-router.proposta-novo.test.ts` (smoke) — GET retorna 200 com form; POST sem campos obrigatórios retorna 400

## Deploy

1. Push pra `main`
2. Easypanel Implantar (auto)
3. Junior smoke: abre perfil cliente, clica "📄 Nova proposta", preenche, gera, recebe link no preview, envia pro próprio zap como teste

Nenhuma migration nova (reusa `propostas_publicas` + `proposta_attachments` + bucket `client-attachments` já configurados).

## Fast-follows (fora V1)

- **A4-V2**: aceitar criar lead inline na própria tela (sem cliente pré-cadastrado)
- **A4-V3**: integrar conta de luz (parse PDF) → preenche consumo 12 meses automático (depende da Frente B2)
- **A4-V4**: salvar "rascunho" — Junior preenche parcial, volta depois (hoje submit precisa do form inteiro)
- **A4-V5**: motor sugestão de kWp baseado em consumo + cidade (depende Motor Aprendizagem visão 08/05)
- **A4-V6**: dropdown de "kits prontos" (1 clique aplica kWp+módulo+inversor+valor pré-configurados)
- **Histórico**: aba "Propostas" no perfil cliente já lista (ver A1) — só precisa testar que A4 grava certo na tabela
- **Multi-tenant**: A4 hoje hardcoda `companyDefaults` do EcoSun no `proposal-assistant`. SaaS futuro pluga isso por tenant
