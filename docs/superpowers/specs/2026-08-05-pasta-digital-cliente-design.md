# Pasta Digital do Cliente — Especificação de design

**Data:** 05/08/2026
**Decidido com:** Junior
**Status:** aprovado em conversa; aguardando revisão final do texto

## O que é

Uma "pasta digital" de entrega pós-instalação: página pública com a marca EcoSunPower
reunindo fotos da obra e todos os documentos do cliente (projeto, ART, homologação,
manuais, garantia, contrato). O cliente recebe um link secreto pelo WhatsApp e acessa
tudo num lugar só, fácil pelo celular.

**Visão de futuro (não construir agora):** esta página é a primeira tela do futuro
portal do cliente (documentos + monitoramento + login). Tudo aqui deve ser construído
sem fechar essa porta.

## Decisões tomadas (com o Junior, 05/08)

1. **Hoje é entrega única de fim de obra**, mas a arquitetura mira o portal do cliente.
2. **Montagem via tela no admin** (/menu), com botões "puxar do ecossistema" como evolução.
3. **Acesso por link secreto simples** (sem senha/CPF), igual às propostas e ao r-pi.
4. **Contrato ENTRA na pasta** (decisão do Junior, ciente de que o link é aberto).
   Quando o portal ganhar login, o contrato passa pra trás dele.
5. **Celular = item por item** (tocou, abriu; salva só o que quiser).
   **Computador = ZIP completo** em destaque pra arquivar.
6. Caminho técnico: **módulo novo na plataforma** (ecosunpower-agente), irmão do
   Relatório Pós-Instalação, reusando as peças que já existem.

## O que já existe e será reusado (REGRA: reusar, não recriar)

| Peça | Onde | Uso na pasta |
|---|---|---|
| Upload/signed URLs de anexos | `src/modules/anexos/storage.ts` (bucket `client-attachments`) | guardar fotos e PDFs em `<lead_id>/pasta/...` |
| Slug secreto de 10 letras não-enumerável | `relatorios/pos-instalacao/service.ts` (`novoSlug`) | mesmo formato de link |
| Página pública em `propostas.ecosunpower.eng.br` | rota `/r-pi/:slug` em `src/index.ts` | nova rota `/pasta/:slug` no mesmo host |
| Dados do cliente + sistema FV | `getClienteByLeadId` + `ResolverSistema` | capa e resumo do sistema |
| Fotos do Relatório Pós-Instalação | tabela do r-pi, mesmo bucket | botão "puxar fotos do relatório" (copia `storage_path`s) |
| Envio WhatsApp com mensagem pronta | padrão `enviarPorWhatsApp` do r-pi | botão "Enviar no zap" |
| Logo/branding | bucket `branding` (já usado por proposta e monitoramento) | capa da página |
| ZIP no navegador (store-only, crc32+mkZip) | receita validada nas coletas (`ecosunpower-site/public/coleta/`) | botão "Baixar tudo" no desktop |
| Contador de acessos | padrão do r-pi (`acessos`, `ultimo_acesso_em`) | mesma coisa |

## 1. Página pública (o que o cliente vê)

**URL:** `https://propostas.ecosunpower.eng.br/pasta/<slug>` (slug 10 letras, não vence nunca).

Feita **primeiro pra celular** (o link chega pelo zap):

- **Capa:** logo EcoSunPower, "Pasta da sua Usina Solar", nome do cliente, foto de
  destaque, data da entrega.
- **Resumo do sistema:** potência (kWp), nº de placas, marca/modelo do inversor —
  automático do cadastro (snapshot no momento da publicação, como o r-pi faz).
- **Fotos da instalação:** galeria; toque amplia (lightbox simples, sem biblioteca externa).
- **Documentos em cartões por seção:** 📐 Projeto · 📋 ART · ✅ Homologação ·
  📖 Manuais · 🛡️ Garantia · 📄 Contrato. Só aparecem seções que têm arquivo.
- **Comportamento por aparelho:**
  - **Celular:** cada cartão **abre o arquivo na hora** no navegador (PDF no viewer
    nativo; o cliente usa o compartilhar/salvar do próprio celular). Nada de ZIP na cara.
    O "Baixar tudo" existe, mas discreto no rodapé.
  - **Computador:** botão **"⬇️ Baixar pasta completa (ZIP)"** em destaque no topo
    da lista de documentos, além do item por item.
  - Detecção simples por largura de tela/UA no JS da página (progressivo, sem quebrar
    se errar — os dois caminhos funcionam nos dois aparelhos).
- **Rodapé:** contatos da EcoSunPower + botão "falar com a gente" (wa.me).
- **Links de arquivo:** signed URLs geradas **a cada visita** (TTL curto), então o link
  da pasta nunca quebra por expiração.
- **ZIP:** montado **no navegador** buscando os arquivos pelas signed URLs
  (mesma receita store-only já validada nas coletas de homologação — sem dependência nova
  no servidor). Nome do arquivo: `pasta-ecosunpower-<nome-cliente>.zip`.

Texto da página em português claro, sem jargão. Assinatura "Responsável Técnico CREA/CFT".

## 2. Tela no admin (o que o Junior/Fernanda vê)

Entrada nova **"Pasta do Cliente"** no /menu do dashboard (raia CRM/dashboard):

- **Lista:** pastas criadas com cliente, status (rascunho/publicada), nº de acessos,
  último acesso, botão copiar link.
- **Nova pasta / editar:**
  1. Escolher o cliente (lead) — mesmo seletor usado no r-pi.
  2. Upload por seção (Fotos / Projeto / ART / Homologação / Manuais / Garantia / Contrato)
     — arrastar ou escolher arquivo; aceita imagem e PDF; várias de uma vez nas fotos.
  3. Botão **"Puxar fotos do Relatório Pós-Instalação"** (aparece se o lead tiver r-pi):
     copia as referências das fotos já no bucket — sem re-upload.
  4. Escolher **foto de capa** (uma das fotos).
  5. **Prévia** (mesma página pública com banner PREVIEW, padrão do r-pi).
  6. **Publicar** → gera slug + link.
  7. **Enviar no zap** → mensagem pronta editável antes do envio (padrão r-pi;
     respeita opt_out).
- **Editar depois de publicada:** pode adicionar/remover arquivos (ex.: homologação
  que sai semanas depois). O link não muda.
- Excluir arquivo remove do storage (com o cuidado de NÃO apagar arquivo que pertence
  ao r-pi quando veio do "puxar fotos" — só desvincular).

## 3. Dados e módulos

**Migration** (número a combinar no grupo do zap — próximo livre hoje: 098):

```sql
-- pastas_cliente: UMA pasta digital por lead (garantido por unique; editar em vez de duplicar)
create table pastas_cliente (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads(id),
  slug text not null unique,
  status text not null default 'rascunho',       -- rascunho | publicada
  capa_storage_path text,
  data_entrega date,
  mensagem_zap text,
  arquivos jsonb not null default '[]',
  -- cada item: { secao: 'fotos'|'projeto'|'art'|'homologacao'|'manuais'|'garantia'|'contrato',
  --              storage_path, nome_exibicao, caption?, origem?: 'upload'|'r-pi' }
  acessos integer not null default 0,
  ultimo_acesso_em timestamptz,
  enviado_em timestamptz,
  enviado_para_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text
);
```

**Módulos novos** (seguindo a organização do r-pi):

- `src/modules/relatorios/pasta/types.ts` — tipos (Row, View, seções)
- `src/modules/relatorios/pasta/service.ts` — criar/editar/publicar/enviar, montar view
  (signed URLs por visita), puxar fotos do r-pi, contador de acesso
- `src/modules/relatorios/pasta/template.ts` — HTML público (mobile-first, prévia com banner)
- `src/modules/dashboard/pasta-views.ts` — telas do admin (lista, formulário, prévia)
- Rota pública `GET /pasta/:slug` em `src/index.ts` (ao lado da `/r-pi/:slug`)
- Rotas admin no `dashboard/router.ts` + item no /menu

**Fora do escopo agora** (anotado pra depois): login do cliente; botões "puxar do
Diário de Serviços" e "puxar da Central de Contratos"; relatório mensal dentro da pasta;
multi-tenant (nasce single-tenant EcoSunPower, sem decisão que impeça tenant depois).

## 4. Erros e casos-limite

- Lead sem sistema FV cadastrado → resumo do sistema some, resto funciona.
- Arquivo sumiu do storage → cartão não aparece; log de aviso no servidor.
- Signed URL falhou → página abre com aviso discreto "tente de novo em instantes".
- Slug não encontrado → página 404 amigável com a marca.
- Upload duplicado/interrompido → mesmo padrão de rollback do r-pi (não deixar lixo no bucket).
- Cliente com opt_out → botão de zap bloqueado (padrão r-pi), link pode ser copiado manualmente.
- ZIP no celular antigo/sem memória → é secundário lá; item por item sempre funciona.

## 5. Testes (TDD, vitest)

- service: slug único; publicar exige ≥1 arquivo; montagem da view (seções vazias somem;
  snapshot de cliente/sistema); puxar fotos do r-pi não duplica storage e marca origem;
  excluir arquivo de origem r-pi não remove do bucket; contador de acessos.
- template: renderiza seções presentes; prévia mostra banner; público não mostra nada de admin.
- `npx tsc --noEmit` limpo e `npx vitest run` verde antes do PR (2 falhas pré-existentes
  de `supabase-vincular-novo.test.ts` ignoradas).

## 6. Processo (regras do time)

- Branch `feat/pasta-digital-cliente` (criada 05/08) → PRs pequenos, Junior aprova.
- Número da migration combinado no grupo antes de aplicar (SQL Editor antes do deploy).
- Aprovação visual: print da tela real rodando (regra do Junior) antes de dar por pronto.
- Toca a raia do dashboard (Junior) e a pasta `relatorios/` — avisar no grupo.
