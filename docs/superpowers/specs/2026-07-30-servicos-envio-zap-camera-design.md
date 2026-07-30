# Diário de Serviços — 📤 Enviar pelo zap + 📷 Tirar foto (spec 30/07/2026)

Aprovado pelo Junior em conversa 30/07 ("aprovado o zap" · câmera opção (a) com replicação).

## Parte 1 — Botão "📤 Enviar pelo zap"

### Objetivo
Ao criar um serviço e nomear alguém (ou a qualquer momento depois), o Junior quer um
botão que mande pelo WhatsApp as informações pro instalador/visitante — seja o usuário
atribuído, seja um número avulso.

### Onde aparece
1. **Detalhe do serviço**: botão "📤 Enviar pelo zap" (visível pra quem pode editar serviços).
2. **Depois de salvar** um serviço novo: aviso "Serviço criado ✅" na própria tela com o
   mesmo botão (fluxo criar → nomear → enviar sem toque extra).

### O modal (igual nos dois lugares)
- **Pra quem?**
  - **Atribuído** (se o serviço tiver `atribuido_a`): pré-selecionado, mostra nome + telefone.
    Sem telefone cadastrado → aviso com link pra editar o usuário.
  - **Outro número**: campos telefone + nome.
- **Se for outro número**, segunda escolha obrigatória:
  - **🔑 Criar acesso temporário** — cria usuário na hora (papel Campo, `acesso_temporario=true`),
    **atribui o serviço a ele** e manda zap com login + senha + link do guia.
    Ao concluir, o acesso expira sozinho (motor do #184). Reusa criação do users-store
    e o texto de boas-vindas do #183.
  - **📄 Só as informações** — zap com tipo de serviço, cliente, endereço e o roteiro de
    fotos do tipo (GUIAS_FOTOS) numerado no corpo. Sem acesso ao sistema.

### Mensagens
- Reenvio pro atribuído: mesmo texto do aviso de atribuição (#182).
- Acesso novo: mesmo texto de boas-vindas (#183) + link do serviço.
- Só informações: texto novo (tipo, cliente, endereço, guia numerado). PT-BR simples.

### Por trás
- Rota nova `POST /servicos/:id/enviar-zap` (gate: mesma permissão de editar serviços).
  Corpo: `{ destino: 'atribuido' | 'avulso', telefone?, nome?, modo?: 'acesso' | 'info' }`.
- Sem migration nova — telefone (094), acesso_temporario (095) e atribuido_a (093) já existem.
- Envio pelo mesmo canal de zap dos avisos atuais (meta-whatsapp).
- Telefone avulso normalizado com o padrão do sistema (dedup 9º dígito).
- Se o telefone avulso JÁ pertence a um usuário: não duplica — atribui e reenvia pro
  usuário existente (informa no retorno).

### Erros
- Zap falhou (Meta fora etc.): serviço/usuário ficam salvos; modal mostra "não consegui
  enviar, tente de novo".
- Atribuído sem telefone: botão orienta, não quebra.

## Parte 2 — 📷 Câmera no celular (bug da visita de hoje)

### Problema
`<input type="file" accept="image/*">` sem `capture` → muitos Androids abrem só o
seletor de arquivos, sem opção de câmera. Aconteceu com o Junior hoje na visita técnica.

### Solução (opção (a) aprovada)
Dois botões lado a lado onde hoje é um:
- **📷 Tirar foto** — `<input type="file" accept="image/*" capture="environment">`
  (câmera traseira direto; uma foto por vez, pode repetir que soma).
- **🖼️ Galeria** — o input atual, `multiple`, sem `capture`.
Os dois alimentam o MESMO fluxo de compressão/upload já existente.

### Onde aplicar (replicar em todos os campos de foto — pedido do Junior)
Dash (este repo):
- `servicos-views.ts` — formulário novo (~L92) e tela de trabalho do instalador (~L277).
- `proposta-form-view.ts` (fotos), `relatorio-pi-views.ts`, `os-views.ts`.
- `clientes-views.ts` e `contrato-form-views.ts`/`contratos-views.ts` (aceitam PDF também):
  ganham o botão "📷 Tirar foto" AO LADO do campo de arquivo atual.
- Vídeo: fica como está (galeria), sem capture.
Site (repo `ecosunpower-site`, push direto na main — regra do site):
- formulários de coleta de homologação `/coleta/*` — mesmo padrão de dois botões.

## Testes
- TDD: rotas e textos das mensagens com vitest; teste-guarda dos `<script>` embutidos
  (lição do #177) cobre os modais/botões novos.
- `npx tsc --noEmit` limpo + suíte verde antes de cada PR.

## Fatias de entrega
1. **Fatia 1**: câmera no Diário (servicos-views ×2) — mata o bug da visita já.
2. **Fatia 2**: botão + modal "Enviar pelo zap" (rota, textos, modal, aviso pós-salvar).
3. **Fatia 3**: replicação da câmera nas demais telas do dash.
4. **Fatia 4**: replicação nas coletas do site (repo separado).

## Fora do escopo (depois, se o Junior quiser)
Botão de zap na lista de serviços · envio por e-mail · escolher fotos no zap.
