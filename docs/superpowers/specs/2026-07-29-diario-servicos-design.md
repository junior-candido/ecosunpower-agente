# Diário de Serviços — registro de campo pelo celular (design)

**Data:** 29/07/2026 (noite) · Decidido com o Junior na conversa (nasceu do pedido
"coleta de visita técnica guardada no pós-venda") e cresceu pro registro de TODO
serviço elétrico da EcoSun.

## O problema

O Junior faz muitos serviços além do solar (projeto elétrico, reforma de quadro,
padrão de entrada, laudo...) — pra cliente da plataforma OU cliente avulso — e
nada disso fica registrado num lugar só. Fotos de visita se perdem no zap; a
história da instalação não existe no pós-venda.

## A visão (frases do Junior)

"Quando eu enviar, já vai pra lá automaticamente" (gravado na instalação, sem
passo manual) · "faço vários serviços diferentes dentro da elétrica e gostaria
de registrar tudo — cliente que nasceu comigo ou que peguei pra outro serviço" ·
terceiro com login "tem acesso apenas a isso?" (sim — papel restrito) · "aí já
começamos alinhando o pós-vendas".

## O que é

**Registro de serviço de campo**, feito pelo celular, dentro do dashboard:

- **Tipo de serviço** (tabela `servico_tipos` com seed, ajustável):
  visita técnica · instalação FV · manutenção/limpeza · projeto elétrico ·
  padrão de entrada · reforma de quadro · laudo/vistoria · outro.
- **Cliente**: busca existente por nome/telefone (autocomplete) **ou cria na
  hora** (nome + telefone → reusa `getOrCreateLeadByPhone`, dedup do 9º dígito).
  Cliente avulso vira lead normal — histórico num lugar só.
- **Usina (opcional)**: se o serviço é numa instalação cadastrada, amarra nela.
- **Fotos** (câmera do celular, múltiplas, comprimidas no navegador como nas
  coletas ~1600px) + **vídeo** (pedido do Junior 29/07: "opção de pelo menos 1
  vídeo" — até 2 por registro, direto da câmera, curto; sem transcodificar no
  navegador, sobe como veio, com teto de tamanho ~100 MB e aviso "vídeo curto
  sobe rápido") + **observações** (texto livre) + **data** (default hoje) +
  **quem fez** (usuário logado, automático).
- **Salvar → gravado**. Sem zap no meio, sem passo manual.

## Onde aparece

1. **Ficha do cliente** (dashboard): linha do tempo de serviços dele.
2. **Pós-venda da usina**: aba/bloco "Serviços" com os registros amarrados nela.
3. **Tela "🔧 Serviços"** (lista geral com filtro por tipo/cliente/período) +
   botão "➕ Novo registro" — é a tela que o papel Campo enxerga.

## Segurança (pergunta do Junior)

- Área nova de permissão: **`servicos`**. Papel **"Campo"** = só essa área →
  terceiro loga e vê SÓ a tela de registrar (sem leads/valores/propostas; a
  rota barra por trás, não é só menu escondido).
- Registro guarda `criado_por` (auditoria de quem fez).
- EcoSun-only na Fase 1 (tenant não vê; se um dia o Sabion quiser, vira módulo
  vendável — [[assinaturas]] venda modular).

## Fotos — onde ficam (decisão técnica)

**Supabase Storage** (bucket `servicos-fotos`, path `servico/<id>/<n>.jpg`),
metadados na tabela. NÃO base64 no banco (visita com 20 fotos estouraria a
linha; Storage é feito pra isso e a casa já usa pra vídeos do site).
Upload direto do navegador via URL assinada gerada pelo servidor (service-role;
o papel Campo não ganha chave nenhuma).

## Dados (migration 092 — combinar número no grupo!)

- `servico_tipos`: id slug, nome, ativo (seed acima). Global (allowlist guarda).
- `servicos`: id, company_id (EcoSun), tipo_id, lead_id (cliente — obrigatório),
  sistema_id (usina, opcional), descricao/observacoes text, data_servico date,
  criado_por (dashboard_users), criado_em. RLS company_isolation.
- `servico_fotos` (fotos E vídeos): id, servico_id, company_id, path storage,
  tipo_midia ('foto'|'video'), legenda opcional, ordem, criado_em. RLS idem.

## Fases

- **F1**: migration + tela Novo registro (mobile-first) + lista + ficha do
  cliente mostra os serviços + papel/área `servicos`. Fotos no Storage.
- **F2**: bloco "Serviços" no detalhe da usina (pós-venda) + filtros da lista +
  editar/excluir registro (com trilha).
- **Depois (se pedir)**: checklist estruturado por tipo (ex: visita técnica com
  itens obrigatórios estilo coleta), PDF do registro, tenant como módulo.

## Fora do escopo agora

- Assinatura digital do cliente no local · agendamento (já existe /agenda da
  Eva — integrar depois) · orçamento a partir do serviço.
