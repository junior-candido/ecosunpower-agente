# Especificacao - Super Agente WhatsApp Ecosunpower

## Resumo

Agente de IA para WhatsApp da empresa **Ecosunpower Energia**, atuante em Brasilia e Goias desde 2019. O agente funciona como consultor tecnico inteligente que qualifica leads, identifica oportunidades (solar, armazenamento, BESS, mercado livre) e entrega dossies completos para o engenheiro de operacao e venda fechar negocio.

**Filosofia:** O agente NAO vende nem gera proposta. Ele qualifica profundamente e passa o lead mastigado para o engenheiro.

---

## Glossario

| Termo | Definicao |
|---|---|
| Grupo A | Consumidores atendidos em alta tensao (13.8kV, 23kV, 69kV). Tem demanda contratada. Geralmente comercial/industrial. |
| Grupo B | Consumidores atendidos em baixa tensao (127/220V). Residencias e pequenos comercios. |
| Horosazonal | Tarifa que varia conforme horario do dia (ponta e fora-ponta) e epoca do ano. Aplicada ao Grupo A. |
| BESS | Battery Energy Storage System. Sistema de armazenamento de energia em escala comercial/industrial para gestao de demanda. |
| Demanda contratada | Potencia (kW) que o consumidor contrata com a distribuidora. Cobra-se mesmo se nao usar. |
| Mercado livre | Ambiente onde consumidores com demanda >= 500kW podem comprar energia de qualquer fornecedor, negociando preco. |
| kW | Quilowatt. Unidade de potencia (capacidade instantanea). Usada para demanda contratada e dimensionamento de sistemas. |
| kWh | Quilowatt-hora. Unidade de energia (consumo ao longo do tempo). Usada para medir consumo mensal. |
| Payback | Tempo de retorno do investimento em energia solar. |
| RAG | Retrieval-Augmented Generation. Tecnica de IA que busca informacoes relevantes antes de gerar resposta. |

---

## Arquitetura

```
Cliente WhatsApp
    |
    v
Evolution API (self-hosted, ponte WhatsApp, HTTPS obrigatorio)
    |
    v
Fila de Mensagens (BullMQ + Redis)
    |
    v
Servidor do Agente (Node.js + TypeScript, gerenciado por PM2)
    |
    +-- Claude API (cerebro - qualificacao inteligente)
    +-- Base de Conhecimento (arquivos .md carregados como contexto)
    +-- Supabase Pro (banco de dados + auth + dashboard inicial)
    +-- OpenAI Whisper API (transcricao de audio)
    +-- Google Calendar API (agendamento de visitas)
```

### Tecnologias e Custos

Volume estimado: 10-30 leads/dia em picos de campanha, 3-10 leads/dia organico.
Conversa media: 15 mensagens, ~2.000 tokens entrada + 500 tokens saida por chamada ao Claude.

| Componente | Tecnologia | Custo |
|---|---|---|
| Conexao WhatsApp | Evolution API (self-hosted) | Gratis |
| Cerebro do agente | Claude API Haiku (triagem) + Sonnet (qualificacao) | ~R$ 80-300/mes |
| Codigo do agente | Node.js + TypeScript | Gratis |
| Banco de dados | Supabase Pro (backup automatico, sem pausa) | R$ 25/mes |
| Base de conhecimento | Arquivos Markdown locais (contexto completo) | Gratis |
| Transcricao de audio | OpenAI Whisper API | ~R$ 10-30/mes |
| Agendamento | Google Calendar API | Gratis |
| Fila de mensagens | Redis + BullMQ | Gratis (mesmo servidor) |
| Gerenciador de processo | PM2 (auto-restart, health check) | Gratis |
| Servidor | VPS (2vCPU, 4GB RAM) | R$ 50-100/mes |
| **Total estimado** | | **R$ 165-455/mes** |

**Estrategia de economia de tokens:**
- Claude Haiku para triagem inicial (identificar perfil, perguntas simples)
- Claude Sonnet apenas para qualificacao complexa (analise de conta, recomendacoes)
- Historico limitado a ultimas 20 mensagens por conversa
- Conversas longas: resumo automatico das mensagens antigas antes de enviar ao Claude

---

## LGPD e Privacidade

### Base legal
Consentimento explicito do titular (art. 7, I da LGPD).

### Mensagem de consentimento
No inicio de toda conversa nova, antes de coletar qualquer dado, o agente envia:

> "Antes de comecarmos, informo que a Ecosunpower Energia coleta e armazena seus dados (nome, telefone, consumo de energia) para fins de atendimento e elaboracao de proposta comercial. Seus dados sao protegidos conforme a LGPD. Voce pode solicitar a exclusao dos seus dados a qualquer momento. Ao continuar, voce concorda com o tratamento dos seus dados. Posso prosseguir?"

Se o cliente disser nao: o agente agradece e encerra sem coletar dados.

### Direito de exclusao
- Cliente pode pedir a qualquer momento: "quero que apaguem meus dados"
- O agente aciona a funcao de exclusao no Supabase (soft delete com anonimizacao)
- Confirma a exclusao ao cliente
- Dados anonimizados sao mantidos apenas para metricas agregadas (sem identificacao)

### Politica de retencao
- Dados de leads que nao viraram cliente: 12 meses, depois anonimizados automaticamente
- Dados de clientes ativos: enquanto durar o relacionamento comercial + 5 anos (obrigacao fiscal)
- Conversas: 6 meses em texto completo, depois apenas resumo anonimizado

### Acesso aos dados
- Apenas o engenheiro (dono) tem acesso completo via dashboard autenticado
- APIs da Anthropic e OpenAI nao usam dados de API para treinamento (conforme suas politicas vigentes)

---

## Schema do Banco de Dados (Supabase)

### Tabela: leads

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid (PK) | Identificador unico |
| phone | text (unique) | Numero do WhatsApp |
| name | text | Nome do cliente |
| city | text | Cidade |
| neighborhood | text | Bairro |
| profile | enum | 'residencial', 'comercial', 'agronegocio', 'indefinido' |
| origin | text | Origem do lead (ver secao Origem do Lead) |
| status | enum | 'novo', 'qualificando', 'qualificado', 'agendado', 'transferido', 'inativo' |
| energy_data | jsonb | Dados energeticos (grupo, demanda, consumo, tarifa, valor fatura) |
| opportunities | jsonb | Oportunidades identificadas (solar, bateria, bess, mercado_livre, etc.) |
| future_demand | text | Descricao da demanda futura |
| consent_given | boolean | Consentimento LGPD |
| consent_date | timestamptz | Data do consentimento |
| created_at | timestamptz | Data de criacao |
| updated_at | timestamptz | Ultima atualizacao |
| anonymized_at | timestamptz | Data de anonimizacao (null se ativo) |

### Tabela: conversations

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid (PK) | Identificador unico |
| lead_id | uuid (FK -> leads) | Referencia ao lead |
| session_status | enum | 'active', 'paused', 'completed', 'expired' |
| qualification_step | text | Etapa atual da qualificacao (ex: 'aguardando_cidade', 'aguardando_consumo') |
| messages | jsonb[] | Array de mensagens {role, content, timestamp} |
| summary | text | Resumo gerado pelo Claude quando conversa fica longa |
| message_count | integer | Total de mensagens na sessao |
| last_message_at | timestamptz | Ultima mensagem recebida |
| created_at | timestamptz | Inicio da sessao |
| expires_at | timestamptz | Expiracao da sessao |

### Tabela: dossiers

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid (PK) | Identificador unico |
| lead_id | uuid (FK -> leads) | Referencia ao lead |
| content | jsonb | Conteudo estruturado do dossie |
| formatted_text | text | Texto formatado para envio no WhatsApp |
| status | enum | 'draft', 'sent', 'read', 'actioned' |
| sent_at | timestamptz | Data de envio ao engenheiro |
| read_at | timestamptz | Data de confirmacao de leitura |
| created_at | timestamptz | Data de criacao |

### Tabela: appointments

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid (PK) | Identificador unico |
| lead_id | uuid (FK -> leads) | Referencia ao lead |
| engineer_id | text | Identificador do engenheiro (preparado para multiplos) |
| datetime | timestamptz | Data/hora do agendamento |
| type | enum | 'visita_tecnica', 'ligacao', 'reuniao_online' |
| status | enum | 'agendado', 'confirmado', 'realizado', 'cancelado', 'reagendado' |
| google_event_id | text | ID do evento no Google Calendar |
| reminder_sent | boolean | Se lembrete de 24h foi enviado |
| created_at | timestamptz | Data de criacao |

### Tabela: engineers

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid (PK) | Identificador unico |
| name | text | Nome do engenheiro |
| phone | text | WhatsApp do engenheiro |
| region | text[] | Regioes atendidas (ex: ['brasilia', 'goiania', 'anapolis']) |
| calendar_id | text | ID do Google Calendar |
| is_active | boolean | Se esta ativo para receber leads |
| created_at | timestamptz | Data de criacao |

### Tabela: logs

| Coluna | Tipo | Descricao |
|---|---|---|
| id | uuid (PK) | Identificador unico |
| level | enum | 'info', 'warn', 'error', 'debug' |
| module | text | Modulo de origem (router, brain, dossier, etc.) |
| message | text | Descricao do evento |
| metadata | jsonb | Dados adicionais (lead_id, erro, stack trace, etc.) |
| created_at | timestamptz | Timestamp do log |

---

## Gerenciamento de Estado da Conversa

### Sessoes

Cada conversa com um cliente e uma **sessao**. Regras:

- **Nova sessao:** criada quando cliente manda primeira mensagem ou quando sessao anterior expirou
- **Expiracao:** sessao expira apos **2 horas** de inatividade
- **Retomada:** se cliente volta antes de expirar, conversa continua do ponto onde parou
- **Apos expiracao:** agente inicia nova sessao mas consulta dados do lead no banco (nao perde informacoes ja coletadas). Cumprimenta com: "Ola [nome]! Bom te ver de novo. Como posso ajudar?"

### Historico de mensagens enviado ao Claude

- Ultimas **20 mensagens** da sessao atual sao enviadas como historico
- Se a conversa ultrapassar 20 mensagens: as mensagens antigas sao **resumidas pelo Claude** em um paragrafo e enviadas como contexto no campo `summary`
- Formato enviado ao Claude: system prompt + base de conhecimento + summary (se houver) + ultimas 20 mensagens

### Persistencia de estado

O campo `qualification_step` na tabela `conversations` registra em qual etapa da qualificacao o cliente esta, permitindo retomada precisa. Exemplo de valores:
- `inicio` -> aguardando identificacao do perfil
- `perfil_identificado` -> perfil definido, iniciando coleta
- `aguardando_cidade` -> perguntou cidade, aguardando resposta
- `aguardando_consumo` -> perguntou consumo, aguardando resposta
- `aguardando_demanda_futura` -> perguntou demanda futura
- `qualificacao_completa` -> todos os dados coletados
- `dossie_enviado` -> dossie montado e enviado ao engenheiro

---

## Modulos

### Modulo 1 - Roteador de Mensagens

Recebe tudo que chega do WhatsApp via webhook da Evolution API, coloca na fila (BullMQ) e processa em ordem.

**Arquivo:** `src/modules/router.ts`

**Responsabilidades:**
- Receber webhook da Evolution API (com validacao de token)
- Colocar mensagem na fila Redis (garante que nenhuma mensagem se perde)
- Processar da fila: identificar tipo e rotear
- **Texto** -> envia direto para o cerebro processar
- **Audio** -> transcreve com Whisper, depois processa como texto
- **Imagem** -> Claude Vision analisa (conta de luz, local de instalacao)
- **Localizacao** -> salva para visita tecnica
- Detectar e ignorar spam (mensagens identicas em massa, correntes, links suspeitos)

**Interface:**
```typescript
interface IncomingMessage {
  type: 'text' | 'audio' | 'image' | 'location';
  from: string; // numero do cliente
  content: string | Buffer;
  timestamp: Date;
  messageId: string; // para deduplicacao
}
```

**Validacao do webhook:**
- Token de autenticacao configurado no .env
- Aceitar apenas requests da Evolution API (IP ou header de verificacao)
- HTTPS obrigatorio em producao

### Modulo 2 - Cerebro (Qualificacao Inteligente)

O coracao do sistema. Classifica o cliente em 3 perfis e conduz qualificacao com perguntas inteligentes.

**Arquivo:** `src/modules/brain.ts`

**Estrategia de modelos:**
- **Claude Haiku:** triagem inicial (identificar perfil, responder FAQ simples, saudacoes)
- **Claude Sonnet:** qualificacao complexa (analise de conta de luz, recomendacoes de armazenamento/BESS/mercado livre, montagem de dossie)

#### Perfil Residencial

Sequencia de qualificacao:
1. Cidade e bairro
2. Valor da conta de luz atual (R$/mes)
3. Tipo de residencia (casa/apartamento, telhado disponivel)
4. **Demanda futura:** carro eletrico, piscina aquecida, equipamentos de alto consumo
5. **Armazenamento:** se conta alta ou regiao com quedas frequentes -> sugere baterias
6. Horarios de maior consumo

#### Perfil Comercial / Industrial

Sequencia de qualificacao:
1. Tipo de negocio e cidade
2. **Classificacao da conta:** Grupo A ou Grupo B
3. Se nao souber -> perguntas auxiliares (valor da fatura, se tem taxa de demanda, tensao de alimentacao)
4. Demanda contratada (kW) vs. demanda medida (kW)
5. Consumo mensal (kWh/mes) e valor da fatura (R$/mes)
6. Horario de funcionamento (tarifa horosazonal?)
7. **Mercado livre:** consumo alto -> sugerir migracao (economia 20-35%)
8. **BESS:** Grupo A com demanda contratada > 100 kW -> sugerir reducao de pico de demanda
9. Planos de expansao / novos equipamentos

#### Perfil Agronegocio

Sequencia de qualificacao:
1. Tipo de atividade (irrigacao, avicultura, pecuaria, beneficiamento)
2. **Conta de luz:** rural? Grupo A ou B? Multiplos pontos de consumo na propriedade?
3. Sazonalidade do consumo (safra vs entressafra)
4. Equipamentos de alto consumo (pivos de irrigacao, resfriadores, secadores)
5. **Demanda futura:** expansao da operacao, novos pivos, galpoes, beneficiamento
6. Area disponivel (telhado e/ou solo)
7. **Mercado livre + BESS:** avaliar conforme consumo mensal (kWh) e demanda contratada (kW)
8. Se usa gerador diesel -> sugerir solar + armazenamento como substituto

#### Logica de Oferta de Armazenamento

| Perfil | Condicao | Oferta |
|---|---|---|
| Residencial | Fatura > R$ 800/mes | Armazenamento como conforto/independencia energetica |
| Residencial | Regiao com quedas frequentes | Backup energetico residencial |
| Residencial | Carro eletrico futuro | Sistema maior + bateria para carga noturna |
| Comercial Grupo A | Demanda contratada > 100 kW | BESS para reducao de pico de demanda (kW) |
| Comercial | Consumo > 30.000 kWh/mes | Mercado livre de energia + solar |
| Agronegocio | Usa gerador diesel | Solar + armazenamento como substituto |
| Agronegocio | Irrigacao noturna | Bateria para uso fora do horario de geracao solar |

#### Acoes do Agente

| Acao | Quando |
|---|---|
| **Qualificar** | Sempre - coletar dados com perguntas inteligentes |
| **Educar** | Explicar beneficios de solar, armazenamento, mercado livre |
| **Identificar oportunidades** | Bateria, BESS, mercado livre, demanda futura |
| **Montar dossie** | Quando tem dados suficientes |
| **Agendar com engenheiro** | Cliente pronto para proximo passo |
| **Follow-up** | Cliente nao responde em 24h -> lembrete gentil (maximo 2 lembretes) |
| **Transferir para humano** | Duvida que nao consegue resolver, reclamacao, urgencia |

#### Regras do que o agente NUNCA deve fazer

- Prometer precos ou valores exatos
- Dar prazos de instalacao definitivos
- Criticar concorrentes
- Inventar informacoes tecnicas que nao estao na base de conhecimento
- Compartilhar dados de um cliente com outro
- Continuar coletando dados se o cliente nao deu consentimento LGPD
- Responder sobre assuntos fora do escopo (politica, religiao, etc.)

### Modulo 2.1 - System Prompt (Rascunho)

**Arquivo:** `src/prompts/system-prompt.md`

```markdown
Voce e o assistente virtual da Ecosunpower Energia, empresa especializada em
energia solar fotovoltaica com atuacao em Brasilia-DF e Goias desde 2019.

## Tom de voz
- Profissional mas acessivel. Use linguagem simples, evite jargoes tecnicos
  a menos que o cliente demonstre conhecimento.
- Seja consultivo: faca perguntas inteligentes para entender a necessidade.
- Seja entusiasmado com energia solar mas nunca exagerado ou forcado.
- Use "voce" (informal). Trate pelo nome quando souber.

## Seu papel
Voce e um consultor inicial. Sua funcao e:
1. Entender a necessidade do cliente (residencial, comercial ou agronegocio)
2. Coletar informacoes energeticas com perguntas naturais
3. Identificar oportunidades alem do solar (baterias, BESS, mercado livre)
4. Montar um dossie completo para o engenheiro da Ecosunpower

## Regras absolutas
- NUNCA prometa precos, valores ou descontos
- NUNCA de prazos de instalacao definitivos
- NUNCA critique concorrentes
- NUNCA invente informacoes - use apenas a base de conhecimento fornecida
- NUNCA continue coletando dados antes do consentimento LGPD
- Se nao souber a resposta, diga: "Essa e uma otima pergunta! Vou pedir
  para nosso engenheiro te responder com precisao."

## Fluxo obrigatorio
1. Saudacao + mensagem de consentimento LGPD (se primeiro contato)
2. Identificar perfil (residencial/comercial/agronegocio)
3. Qualificar conforme perfil (seguir sequencia de perguntas)
4. Identificar oportunidades de armazenamento/BESS/mercado livre
5. Montar dossie e agendar com engenheiro

## Quando transferir para humano
- Cliente pede para falar com pessoa
- Reclamacao ou insatisfacao
- Duvida tecnica fora da base de conhecimento
- Negociacao de valores
- Urgencia (sistema parou, problema eletrico)
```

### Modulo 3 - Base de Conhecimento

Arquivos Markdown editaveis sem codigo. **Abordagem simplificada:** todos os arquivos sao carregados como contexto direto nas chamadas ao Claude (sem busca semantica). O volume total estimado dos arquivos e de 5.000-15.000 tokens, que cabe confortavelmente no contexto do Claude.

**Diretorio:** `conhecimento/`

```
conhecimento/
  empresa.md          -> historia, diferenciais, regioes atendidas
  produtos.md         -> paineis, inversores, marcas, garantias
  precos-referencia.md -> faixas de referencia por consumo (NAO valores exatos)
  faq.md              -> perguntas frequentes dos clientes
  processo.md         -> etapas da instalacao, prazos medios
  financiamento.md    -> opcoes de pagamento, bancos parceiros
  pos-venda.md        -> manutencao, monitoramento, garantia
  objecoes.md         -> respostas para objecoes comuns de venda
  mercado-livre.md    -> info sobre migracao para mercado livre
  armazenamento.md    -> baterias, BESS, casos de uso
  agronegocio.md      -> solucoes especificas para agro
```

**Como funciona:**
1. Na inicializacao do servidor, todos os arquivos .md sao lidos e concatenados
2. O conteudo concatenado e enviado como parte do contexto em toda chamada ao Claude
3. Se o conteudo total ultrapassar 15.000 tokens, o sistema avisa no log para o engenheiro revisar e enxugar

**Versionamento:**
- Os arquivos ficam no Git do projeto
- Ao editar qualquer arquivo, um commit automatico e criado com a data e descricao da alteracao
- Permite reverter alteracoes erradas com `git revert`

**Como o engenheiro edita:**
- Abre o arquivo no Bloco de Notas, VS Code, ou qualquer editor de texto
- Edita o conteudo em portugues simples
- Salva. O servidor detecta a mudanca e recarrega automaticamente (file watcher)

### Modulo 4 - Dossie do Cliente

Ao final da qualificacao, monta resumo estruturado e envia para o engenheiro.

**Arquivo:** `src/modules/dossier.ts`

**Formato do dossie:**
```
DOSSIE - Lead #[numero sequencial]
Data: [data/hora]
========================================
Nome: [nome]
Telefone: [telefone]
Cidade: [cidade/bairro]
Perfil: [RESIDENCIAL | COMERCIAL | AGRONEGOCIO]
Origem: [ver secao Origem do Lead]

DADOS ENERGETICOS
- Classificacao: Grupo [A/B] [subgrupo se aplicavel]
- Demanda contratada: [valor] kW (se Grupo A)
- Consumo medio: [valor] kWh/mes
- Tarifa: [convencional | horosazonal verde | horosazonal azul]
- Valor medio da fatura: R$ [valor]/mes

OPORTUNIDADES IDENTIFICADAS
- [x/ ] Sistema fotovoltaico
- [x/ ] Migracao para mercado livre de energia
- [x/ ] BESS (armazenamento comercial/industrial)
- [x/ ] Bateria residencial
- [x/ ] Substituicao de gerador diesel
- [x/ ] Preparacao para carro eletrico

DEMANDA FUTURA
- [descricao do que o cliente planeja]

RESUMO DA CONVERSA
- [pontos principais da conversa em 3-5 bullets]
- [objecoes levantadas e como foram tratadas]
- [nivel de interesse percebido: alto/medio/baixo]

RECOMENDACAO DO AGENTE
- [sugestao de proximo passo e por que]
========================================
```

**Entrega e confirmacao:**
1. Dossie e salvo no Supabase (tabela `dossiers`)
2. Dossie e enviado para o WhatsApp do engenheiro responsavel pela regiao do lead
3. Se o engenheiro nao confirmar leitura em **30 minutos**, o dossie e reenviado
4. Se nao confirmar em **2 horas**, alerta enviado por outro canal (configuravel: email ou SMS)
5. Status do dossie e atualizado no banco (sent -> read -> actioned)

### Modulo 5 - Agendamento

**Arquivo:** `src/modules/scheduler.ts`

- Integra com Google Calendar do engenheiro responsavel pela regiao
- Verifica horarios disponiveis
- Agenda visita tecnica, ligacao ou reuniao online
- Envia confirmacao ao cliente pelo WhatsApp
- Envia lembrete **24h antes** para cliente e engenheiro
- Permite reagendamento pelo WhatsApp ("quero mudar o horario")
- Permite cancelamento ("preciso cancelar")

**Roteamento por regiao (preparado para multiplos engenheiros):**
- Tabela `engineers` define regioes atendidas por cada engenheiro
- Lead de Brasilia -> engenheiro que cobre Brasilia
- Lead de Goiania -> engenheiro que cobre Goiania
- Inicialmente: 1 engenheiro cobre tudo. Quando crescer, basta adicionar na tabela.

### Modulo 6 - Follow-up Automatico

**Arquivo:** `src/modules/followup.ts`

Quando o cliente para de responder no meio da qualificacao:

| Tempo sem resposta | Acao |
|---|---|
| 24 horas | 1o lembrete gentil: "Oi [nome]! Vi que ficou uma conversa em aberto. Posso te ajudar com mais alguma coisa sobre energia solar?" |
| 48 horas | 2o lembrete: "Ola [nome], so passando pra lembrar que estamos a disposicao. Se quiser retomar quando for melhor, e so mandar mensagem!" |
| 72 horas | Marca lead como inativo. Sem mais follow-ups. |

Quando o engenheiro nao age apos receber dossie:

| Tempo sem acao | Acao |
|---|---|
| 30 minutos | Reenvia dossie no WhatsApp |
| 2 horas | Alerta por canal alternativo (email/SMS) |
| 24 horas | Log de alerta no dashboard |

### Modulo 7 - Dashboard e Metricas

**Abordagem em 2 fases:**

**Fase MVP:** Usar **Supabase Studio** como dashboard (ja vem pronto com o Supabase Pro). O engenheiro acessa pelo navegador, ve as tabelas, filtra leads, consulta dossies. Sem desenvolvimento necessario.

**Fase futura:** Painel web customizado com:
- Leads do dia / semana / mes
- Distribuicao por perfil (residencial / comercial / agro)
- Oportunidades identificadas (solar, bateria, mercado livre, BESS)
- Conversas transferidas para humano (motivo)
- Origem dos leads (Instagram, Google Ads, organico)
- Historico de conversas consultavel
- Taxa de conversao e tempo medio de resposta

**Autenticacao:** Supabase Auth com email + senha. Apenas engenheiros cadastrados na tabela `engineers` tem acesso. Dashboard acessivel via HTTPS com certificado SSL.

### Modulo 8 - Analise de Imagens (Conta de Luz)

**Arquivo:** `src/modules/vision.ts`

Quando o cliente envia foto da conta de luz:

1. Claude Vision analisa a imagem
2. Tenta extrair: consumo (kWh), valor (R$), grupo (A/B), distribuidora, demanda contratada
3. **Validacao:** valores extraidos sao verificados contra limites razoaveis:
   - Consumo residencial: 50-5.000 kWh/mes
   - Consumo comercial: 500-500.000 kWh/mes
   - Valor: compativel com consumo x tarifa media da regiao
4. Se a qualidade da imagem for ruim ou os dados nao fizerem sentido:
   - "Nao consegui ler bem a foto. Pode tirar outra com melhor iluminacao, mostrando a parte de consumo e valores?"
5. Dados extraidos sao confirmados com o cliente antes de salvar

**Concessionarias suportadas:** CEB (Brasilia), CELG/Enel Goias, Enel (geral). O prompt do Claude Vision inclui instrucoes especificas para o layout de cada concessionaria.

---

## Origem do Lead

Como o agente determina de onde veio o lead:

1. **UTM parameters:** Se o link do WhatsApp vier com parametros UTM (ex: `?utm_source=instagram&utm_campaign=marco2026`), o sistema captura automaticamente via Evolution API
2. **Numero de telefone de entrada:** Se a empresa usar numeros diferentes para cada canal (um para Instagram, outro para Google Ads), a origem e determinada pelo numero que recebeu a mensagem
3. **Pergunta direta (fallback):** Se nao houver UTM nem numero diferenciado, o agente pergunta naturalmente: "Como voce conheceu a Ecosunpower? Foi por Instagram, Google, indicacao de alguem?"

Prioridade: UTM > numero de entrada > pergunta direta.

---

## Tratamento de Erros e Resiliencia

### Fila de mensagens (BullMQ + Redis)
Toda mensagem recebida entra na fila antes de ser processada. Isso garante:
- Nenhuma mensagem perdida mesmo sob carga alta
- Processamento em ordem (FIFO)
- Retry automatico em caso de falha

### Fallbacks por servico

| Servico | Erro | Acao |
|---|---|---|
| Claude API | Timeout ou 500 | Retry com backoff exponencial (3 tentativas: 2s, 8s, 32s). Se falhar: "Estou com uma dificuldade tecnica. Um momento, por favor." + alerta no log |
| Claude API | Fora do ar prolongado | Mensagem ao cliente: "Nosso sistema esta em manutencao. Um atendente vai te responder em breve." + notifica engenheiro |
| Whisper API | Falha na transcricao | "Nao consegui ouvir o audio. Pode me enviar por texto, por favor?" |
| Whisper API | Audio muito longo (>5min) | "O audio ficou um pouco longo. Pode resumir em texto ou em um audio mais curto?" |
| Google Calendar | Falha | "Nao consegui verificar a agenda agora. Posso tentar novamente em alguns minutos, ou prefere combinar o horario direto com nosso engenheiro?" |
| Supabase | Falha | Mensagens continuam sendo processadas (fila em Redis). Dados pendentes sao salvos quando banco voltar (fila de persistencia). |
| Evolution API | Webhook perdido | Health check a cada 60 segundos. Se 3 checks consecutivos falharem: alerta no log + tentativa de reconexao |

### Deduplicacao
- Cada mensagem tem um `messageId` unico
- Mensagens duplicadas (reenvio do WhatsApp) sao detectadas e ignoradas

### Monitoramento e Alertas

**PM2** gerencia o processo:
- Auto-restart em caso de crash
- Monitoramento de memoria e CPU
- Logs estruturados em JSON para facilitar debug

**Logs estruturados** (tabela `logs` no Supabase):
- Toda acao relevante e logada com nivel (info/warn/error), modulo de origem e metadata
- Erros incluem stack trace
- Dashboard do Supabase permite filtrar e buscar logs

**Health check endpoint:** `/health` retorna status de todos os servicos (Evolution API, Claude, Supabase, Redis, Google Calendar). Pode ser monitorado por servicos externos como UptimeRobot (gratis).

---

## Modo de Teste (Sandbox)

Para testar o agente sem afetar dados reais:

**Flag de ambiente:** `NODE_ENV=sandbox`

Quando em modo sandbox:
- Usa banco de dados separado no Supabase (schema `sandbox`)
- Mensagens nao sao enviadas de verdade (logadas no console)
- Dossies nao sao enviados ao engenheiro (salvos apenas no banco sandbox)
- API do Claude e chamada normalmente (para testar respostas reais)
- Numero de teste configuravel no .env

**Como testar:**
1. Configurar `NODE_ENV=sandbox` no .env
2. Reiniciar o servidor
3. Enviar mensagens pelo WhatsApp para o numero de teste
4. Ver logs no console e dados no schema sandbox do Supabase

---

## Seguranca

- **HTTPS obrigatorio** em producao para Evolution API e dashboard
- **Token de autenticacao** no webhook da Evolution API (configurado no .env)
- **Supabase Row Level Security (RLS)** ativado em todas as tabelas
- **Variaveis sensiveis** (API keys, tokens) em arquivo `.env` (nunca commitado, listado no `.gitignore`)
- **Rate limiting:** maximo 30 mensagens/minuto por numero (evita abuso)
- Agente nunca compartilha dados de um cliente com outro (isolamento por lead_id)
- Dados criptografados em transito (HTTPS/TLS) e em repouso (Supabase Pro)
- Dashboard acessivel apenas com autenticacao (Supabase Auth)
- Firewall do servidor: apenas portas 443 (HTTPS) e 22 (SSH) abertas

---

## Estrutura de Arquivos do Projeto

```
ecosunpower-agente/
  src/
    index.ts              -> ponto de entrada, inicia servidor e fila
    config.ts             -> variaveis de ambiente e configuracao
    health.ts             -> endpoint /health para monitoramento
    modules/
      router.ts           -> roteador de mensagens + anti-spam
      brain.ts            -> cerebro do agente (qualificacao inteligente)
      dossier.ts          -> gerador de dossies
      scheduler.ts        -> agendamento com Google Calendar
      knowledge.ts        -> carregamento da base de conhecimento
      transcriber.ts      -> transcricao de audio (Whisper)
      vision.ts           -> analise de imagens (conta de luz)
      evolution.ts        -> integracao com Evolution API
      supabase.ts         -> integracao com Supabase
      followup.ts         -> follow-up automatico de leads e dossies
      queue.ts            -> configuracao do BullMQ + Redis
    prompts/
      system-prompt.md    -> prompt principal do agente
      residencial.md      -> instrucoes para perfil residencial
      comercial.md        -> instrucoes para perfil comercial
      agronegocio.md      -> instrucoes para perfil agronegocio
  conhecimento/
    empresa.md
    produtos.md
    precos-referencia.md
    faq.md
    processo.md
    financiamento.md
    pos-venda.md
    objecoes.md
    mercado-livre.md
    armazenamento.md
    agronegocio.md
  package.json
  tsconfig.json
  .env.example            -> template de variaveis de ambiente
  .gitignore              -> inclui .env, node_modules, dist
  ecosystem.config.js     -> configuracao do PM2
  README.md
```

---

## Fluxo de Atendimento Completo

### Lead de Anuncio (Instagram/Google Ads)

```
Cliente ve anuncio -> clica -> manda "Oi" no WhatsApp
    |
    v
Evolution API recebe -> webhook -> fila BullMQ
    |
    v
Router processa -> identifica como texto
    |
    v
Brain verifica: cliente novo? -> Sim
    |
    v
Agente: "Ola! Sou o assistente da Ecosunpower Energia.
Atuamos com energia solar em Brasilia e Goias desde 2019.

Antes de comecarmos, preciso informar que coletamos seus
dados para fins de atendimento, conforme a LGPD.
Voce pode solicitar exclusao a qualquer momento.
Posso prosseguir?"
    |
    v
Cliente: "Sim"
    |
    v
Agente: "Otimo! Para entender melhor sua necessidade,
o sistema seria para:
1. Residencia
2. Empresa/comercio
3. Propriedade rural/agronegocio"
    |
    v
[Identifica perfil -> inicia qualificacao especifica]
    |
    v
[Perguntas inteligentes conforme perfil]
[Inclui demanda futura, tipo de conta, classificacao]
    |
    v
[Identifica oportunidades: bateria? mercado livre? BESS?]
    |
    v
[Monta dossie completo]
    |
    v
Agente: "Excelente, [nome]! Com essas informacoes, nosso
engenheiro vai preparar uma analise personalizada.
Posso agendar um horario para ele te ligar ou visitar?"
    |
    v
[Agenda no Google Calendar do engenheiro da regiao]
    |
    v
[Envia dossie para o engenheiro no WhatsApp]
[Monitora confirmacao de leitura]
```

### Transferencia para Humano

Situacoes que acionam transferencia:
- Cliente pede explicitamente para falar com uma pessoa
- Reclamacao ou insatisfacao detectada
- Duvida tecnica que o agente nao consegue responder com a base de conhecimento
- Cliente quer negociar valores/desconto
- Situacao de urgencia (sistema parou, problema eletrico)

Fluxo:
```
Agente detecta necessidade de humano
    |
    v
"Vou te conectar com nosso engenheiro agora.
Ele vai ter todo o contexto da nossa conversa."
    |
    v
Monta dossie parcial + historico da conversa
    |
    v
Envia para engenheiro da regiao no WhatsApp
    |
    v
Monitora confirmacao de leitura (30min/2h)
```

---

## Fases de Implementacao

### Fase 1 - MVP (Semana 1-2)
- Conexao Evolution API + webhook + fila BullMQ/Redis
- Modulo router (texto apenas, sem audio/imagem)
- Cerebro basico (qualificacao residencial)
- System prompt completo
- Base de conhecimento (empresa, produtos, faq, processo)
- Consentimento LGPD
- Envio de dossie por WhatsApp para o engenheiro
- Salvamento de leads e conversas no Supabase
- PM2 + health check
- Modo sandbox para testes
- Logging estruturado

### Fase 2 - Expansao (Semana 3-4)
- Perfis comercial e agronegocio no cerebro
- Transcricao de audio (Whisper)
- Logica completa de armazenamento/BESS/mercado livre
- Follow-up automatico (leads e dossies)
- Roteamento por regiao (tabela engineers)
- Base de conhecimento expandida (todos os arquivos)

### Fase 3 - Completo (Semana 5-6)
- Agendamento Google Calendar
- Analise de imagens (conta de luz) com validacao por concessionaria
- Lembretes automaticos (24h antes da visita)
- Dashboard customizado (se Supabase Studio nao for suficiente)
- Deteccao de origem do lead (UTM + numero + pergunta)

---

## Criterios de Sucesso

| Metrica | Alvo | Como medir |
|---|---|---|
| Tempo de resposta | < 10 segundos | Timestamp da mensagem recebida vs. timestamp da resposta enviada (logado no banco) |
| Duracao da qualificacao | < 15 mensagens do agente | Contagem de mensagens do agente ate status 'qualificacao_completa' |
| Completude do dossie | 100% dos campos obrigatorios preenchidos | Validacao automatica antes de enviar (campos obrigatorios: nome, cidade, perfil, consumo ou valor da fatura) |
| Base de conhecimento | Editavel sem codigo | Engenheiro consegue editar .md e ver mudanca refletida no agente sem reiniciar servidor |
| Disponibilidade | > 99% uptime mensal | Health check endpoint monitorado por UptimeRobot |
| Custo operacional | < R$ 455/mes | Soma das faturas mensais de todos os servicos |
| Consentimento LGPD | 100% dos leads com consentimento registrado | Query no Supabase: leads sem consent_given = true nao tem dados pessoais |
