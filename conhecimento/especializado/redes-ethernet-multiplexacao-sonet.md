---
title: "Base de Conhecimento — Redes de Computadores, Telecomunicações, Multiplexação e Redes Emergentes"
version: "1.0"
language: "pt-BR"
purpose: "Material estruturado para estudo, resolução de questões e alimentação de uma IA"
scope:
  - Protocolo Ethernet
  - Infraestrutura residencial ANSI/TIA/EIA 570-D
  - Multiplexação FDM, WDM e TDM
  - Linhas T/E e hierarquia digital
  - SONET
  - Redes ópticas
  - Redes de armazenamento: NAS, SAN e DAS
  - Fibre Channel
  - Virtualização, VN, VPN, SLA e NFV
---

# BASE DE CONHECIMENTO PARA IA — REDES E TELECOMUNICAÇÕES

> **Objetivo deste arquivo:** transformar o conteúdo dos materiais estudados e das questões respondidas em uma base única, organizada e didática para que uma IA consiga:
>
> 1. explicar os conceitos;
> 2. diferenciar tecnologias semelhantes;
> 3. responder questões objetivas;
> 4. justificar alternativas corretas e incorretas;
> 5. reconhecer números, padrões, siglas e relações importantes;
> 6. evitar respostas inventadas quando o conteúdo não estiver sustentado pelos materiais.

---

# 1. FONTES UTILIZADAS

Esta base foi construída a partir dos seguintes materiais fornecidos para estudo:

1. **Protocolo Ethernet** — conteúdo de Fundamentos de Redes de Computadores.
2. **Infraestrutura de telecomunicações em projetos de redes residenciais** — com foco na norma **ANSI/TIA/EIA 570-D**.
3. **Comunicação de Dados e Redes de Computadores — 4ª edição — Behrouz A. Forouzan**, trecho do Capítulo 6: **Utilização da Largura de Banda: Multiplexação e Espalhamento**.
4. **Gerenciamento de redes emergentes** — redes ópticas, armazenamento, Fibre Channel, virtualização, VPN e NFV.
5. Questões objetivas respondidas durante o estudo.

> **Importante:** este arquivo é um resumo didático e estruturado. Ele não reproduz integralmente os livros.

---

# 2. INSTRUÇÕES PARA A IA QUE USAR ESTA BASE

## 2.1 Regra principal

Ao responder perguntas baseadas nesta base:

- use primeiro os conceitos aqui registrados;
- preserve os nomes técnicos e siglas;
- não troque um padrão por outro;
- não invente requisitos ausentes;
- quando a informação não estiver sustentada, diga claramente que **não está especificada nesta base**.

## 2.2 Formato ideal para responder questões objetivas

Quando a pergunta tiver alternativas:

```text
Resposta: X.

Motivo:
[explicação curta e direta]

Por que as demais estão erradas:
- A: ...
- B: ...
- C: ...
```

## 2.3 Cuidados importantes

- **Ethernet** não é Wi-Fi.
- **MAC** não é endereço IP.
- **FDM** divide frequência.
- **TDM** divide tempo.
- **WDM** trabalha com comprimentos de onda ópticos.
- **SONET** usa as camadas seção, linha e caminho/trajeto.
- **TDM síncrono** pode desperdiçar slots.
- **TDM estatístico** aloca slots dinamicamente.
- **SAN** não deve ser confundida com NAS ou DAS.
- **FC-0** é física; **FC-4** é superior/aplicação.
- **SLA** é acordo de nível de serviço, não protocolo.

---

# PARTE I — PROTOCOLO ETHERNET

# 3. CONCEITO DE ETHERNET

Ethernet é uma tecnologia usada principalmente em **redes locais (LAN — Local Area Network)**.

Uma LAN Ethernet permite que equipamentos compartilhem recursos e troquem dados em uma área geográfica limitada, como:

- residência;
- escritório;
- edifício;
- empresa;
- campus.

A tecnologia Ethernet foi desenvolvida inicialmente pela Xerox e posteriormente padronizada pelo IEEE.

## Padrão principal

```text
Ethernet = IEEE 802.3
```

## Finalidade

Permitir a comunicação de dados entre:

- computadores;
- servidores;
- impressoras;
- roteadores;
- outros dispositivos conectados à LAN.

---

# 4. CSMA/CD

O funcionamento clássico da Ethernet compartilhada é explicado pelo mecanismo:

```text
CSMA/CD
Carrier Sense Multiple Access with Collision Detection
```

## 4.1 Carrier Sense — CS

Antes de transmitir, o equipamento verifica se o meio está livre.

```text
Meio livre → transmite
Meio ocupado → espera
```

## 4.2 Multiple Access — MA

Vários dispositivos podem compartilhar o mesmo meio de transmissão.

## 4.3 Collision Detection — CD

Se dois dispositivos transmitirem simultaneamente em um meio compartilhado, pode ocorrer colisão.

Quando isso acontece:

1. a colisão é detectada;
2. a transmissão é interrompida;
3. os dispositivos aguardam um intervalo;
4. tentam transmitir novamente.

## Regra de memorização

```text
CS = escuta
MA = vários acessam
CD = detecta colisão
```

---

# 5. HUB E SWITCH

## 5.1 Hub

O hub:

- opera na camada física;
- recebe um sinal;
- replica para os dispositivos conectados;
- cria um domínio de colisão compartilhado;
- pode gerar maior congestionamento;
- foi substituído em grande parte por switches.

### Ideia simples

```text
HUB:
Recebe de A
↓
envia para B, C, D, E...
```

## 5.2 Switch

O switch:

- é o componente central das LANs Ethernet modernas;
- encaminha dados para a porta adequada;
- utiliza endereço MAC;
- melhora o desempenho;
- reduz colisões em relação ao ambiente com hub.

### Ideia simples

```text
SWITCH:
Recebe de A para D
↓
encaminha apenas para D
```

---

# 6. ENDEREÇO MAC

MAC significa:

```text
Media Access Control
```

É o endereço físico associado à interface de rede.

## Características

```text
Tamanho: 48 bits
Equivalência: 6 bytes
Representação: hexadecimal
Exemplo: 00:1A:2B:3C:4D:5E
```

## Divisão

- primeiros 3 pares: identificam o fabricante — OUI;
- últimos 3 pares: identificam a interface/dispositivo.

## Camada OSI

```text
MAC → Camada 2 — Enlace de Dados
```

## MAC x IP

| MAC | IP |
|---|---|
| endereço físico | endereço lógico |
| associado à interface | configurável |
| usado em comunicação local de camada 2 | usado na camada de rede |

---

# 7. PDU E FRAME ETHERNET

No Ethernet, a PDU da camada de enlace é chamada:

```text
Frame
ou
Quadro
```

## Relação simplificada das PDUs

| Camada | PDU |
|---|---|
| Física | Bit |
| Enlace | Frame / Quadro |
| Rede | Pacote / Datagrama |
| Transporte | Segmento |

---

# 8. ESTRUTURA DO FRAME ETHERNET

Campos principais:

1. Preâmbulo
2. SFD
3. Endereço de destino
4. Endereço de origem
5. Tipo/EtherType ou comprimento
6. Dados/Payload
7. FCS

## 8.1 Preâmbulo

Ajuda na sincronização.

```text
7 bytes
```

## 8.2 SFD — Start Frame Delimiter

Marca o início efetivo do frame.

```text
1 byte
```

Preâmbulo + SFD:

```text
8 bytes
```

## 8.3 Endereço de destino

MAC do destinatário.

```text
6 bytes
```

## 8.4 Endereço de origem

MAC do transmissor.

```text
6 bytes
```

## 8.5 Tipo/EtherType ou comprimento

Indica o tipo de protocolo superior ou comprimento, conforme o frame.

```text
2 bytes
```

## 8.6 Payload

Parte que contém os dados transportados.

```text
46 a 1500 bytes
```

## 8.7 FCS

```text
Frame Check Sequence
```

Utiliza verificação baseada em CRC para detectar erros no frame.

```text
FCS = 4 bytes
```

---

# 9. CABEAMENTOS E PADRÕES ETHERNET

## 9.1 10Base5 — Thicknet

Também chamado:

```text
Thick Ethernet
```

Características:

- 10 Mbps;
- cabo coaxial grosso;
- até 500 m por segmento;
- topologia barramento;
- difícil de instalar e manusear;
- padrão antigo/obsoleto.

## 9.2 10Base2 — Thinnet

Também chamado:

```text
Thin Ethernet
```

Características:

- 10 Mbps;
- coaxial fino;
- até 185 m;
- barramento;
- mais flexível que Thicknet;
- obsoleto.

## 9.3 10Base-T

- 10 Mbps;
- par trançado UTP;
- Cat 3, 4 ou 5 conforme o material;
- até 100 m;
- topologia estrela.

## 9.4 100Base-FX

- Fast Ethernet;
- 100 Mbps;
- fibra multimodo;
- até 400 m.

## 9.5 100Base-TX

- Fast Ethernet;
- 100 Mbps;
- UTP Cat 5;
- até 100 m;
- estrela comutada.

## 9.6 1000Base-T

- Gigabit Ethernet;
- 1000 Mbps = 1 Gbps;
- Cat 5e ou superior;
- até 100 m.

## 9.7 1000Base-SX

- 1 Gbps;
- fibra multimodo;
- até 550 m.

## 9.8 1000Base-LX

- 1 Gbps;
- fibra monomodo;
- até 5 km.

---

# 10. TABELA DE MEMORIZAÇÃO — ETHERNET

| Padrão | Velocidade | Meio | Distância |
|---|---:|---|---:|
| 10Base5 | 10 Mbps | coaxial grosso | 500 m |
| 10Base2 | 10 Mbps | coaxial fino | 185 m |
| 10Base-T | 10 Mbps | UTP | 100 m |
| 100Base-FX | 100 Mbps | fibra multimodo | 400 m |
| 100Base-TX | 100 Mbps | UTP Cat 5 | 100 m |
| 1000Base-T | 1 Gbps | Cat 5e+ | 100 m |
| 1000Base-SX | 1 Gbps | fibra multimodo | 550 m |
| 1000Base-LX | 1 Gbps | fibra monomodo | 5 km |

---

# 11. UTP E STP

## UTP

```text
Unshielded Twisted Pair
Par trançado sem blindagem
```

Características:

- mais comum;
- fácil instalação;
- menor proteção contra interferências.

## STP

```text
Shielded Twisted Pair
Par trançado blindado
```

Indicado quando existe interferência eletromagnética relevante.

### Regra rápida

```text
STP → Shield → Blindagem
```

---

# 12. RJ-45

O RJ-45 é o conector mais associado às redes Ethernet sobre par trançado.

```text
RJ-45 = 8 pinos
```

---

# 13. MONTAGEM DE UMA LAN ETHERNET

## Passo 1 — Planejamento

Definir:

- quantidade de equipamentos;
- área;
- velocidade necessária;
- posição do switch;
- topologia.

## Passo 2 — Recursos

Normalmente:

- switch;
- dispositivos;
- cabos;
- RJ-45;
- ferramenta de crimpagem;
- patch panel, quando necessário.

## Passo 3 — Instalação

- posicionar switch;
- medir cabos;
- conectorizar;
- organizar o cabeamento;
- conectar equipamentos.

## Passo 4 — Configuração

Configurar:

- IP;
- máscara;
- gateway.

## Passo 5 — Testes e manutenção

- testar conexão;
- verificar comunicação;
- testar velocidade;
- inspecionar cabos;
- manter firmware atualizado.

---

# PARTE II — INFRAESTRUTURA RESIDENCIAL ANSI/TIA/EIA 570-D

# 14. OBJETIVO DA NORMA

A ANSI/TIA/EIA 570-D trata da infraestrutura de telecomunicações para ambientes residenciais.

Abrange estrutura para serviços como:

- voz;
- dados;
- vídeo;
- entretenimento;
- automação;
- segurança.

Seu foco é a **infraestrutura física de telecomunicações**, e não o controle por software de eletrodomésticos ou consumo elétrico.

---

# 15. TOPOLOGIA RESIDENCIAL

A topologia física indicada é:

```text
ESTRELA
```

Os equipamentos com fio são conectados à estrutura interna.

Equipamentos sem fio recebem conexão por meio de um:

```text
Access Point
```

O access point, por sua vez, é conectado à rede cabeada.

---

# 16. COMPONENTES DA ESTRUTURA

## 16.1 Outlet

Ponto de conexão disponível ao usuário.

Fluxo simplificado:

```text
Equipamento
↓
Patch cord
↓
Outlet
↓
Cabeamento permanente
↓
Caixa de distribuição
```

## 16.2 Caixa de distribuição

Características:

- fica dentro da residência;
- deve ficar em local acessível;
- distribui o cabeamento da infraestrutura residencial.

## 16.3 ADO

```text
Auxiliary Disconnect Outlet
```

Função:

- separar/isolar a infraestrutura interna da conexão do provedor;
- facilitar a troca de operadora sem reconstruir o cabeamento interno.

### Ideia

```text
Operadora → ADO → Rede interna
```

## 16.4 Concentrador

Elemento interno associado à disponibilização e concentração dos serviços de rede aos usuários domésticos.

## 16.5 Dispositivos de rede da operadora

Área onde ficam equipamentos do provedor de acesso.

Em muitos casos fica em área externa ou comum adequada, dependendo do tipo de edificação.

---

# 17. MULTIMORADIA E MDU

Em edifícios residenciais, cada unidade pode possuir sua própria infraestrutura interna.

Pode existir um espaço comum para os equipamentos da operadora.

## MDU

```text
Multi-Dwelling Unit
Unidade de habitação múltipla
```

Pode ser utilizado como elemento intermediário para concentrar conexões por pavimento e encaminhá-las ao espaço comum da operadora.

---

# 18. CABOS PERMITIDOS NO AMBIENTE RESIDENCIAL

Segundo o material:

## Par trançado

```text
4 pares
100 Ω
UTP
Categoria 6A
```

## Coaxial

```text
RG-6
75 Ω
3 ou 4 blindagens
```

## Fibra óptica

Permitidas:

- multimodo 50 µm;
- multimodo 62,5 µm;
- monomodo.

---

# 19. NORMAS ASSOCIADAS AOS CABOS

| Meio | Norma |
|---|---|
| Par trançado | ANSI/TIA 568.2-D |
| Fibra óptica | ANSI/TIA 568.3-D |
| Coaxial | ANSI/TIA 568.4-D |

---

# 20. GRAUS DE CABEAMENTO RESIDENCIAL

A classificação é feita em:

```text
Grau 1
Grau 2
Grau 3
```

## Grau 1

Suporta serviços básicos como:

- voz;
- televisão por antena;
- dados.

Cabeamento:

- par trançado: sim;
- coaxial: sim;
- fibra: opcional em conjunto com os demais.

## Grau 2

Inclui Grau 1 e acrescenta:

- internet em alta velocidade;
- acesso sem fio;
- captura de vídeo para segurança.

Cabeamento:

- par trançado: sim;
- coaxial: sim;
- fibra: opcional.

## Grau 3

Inclui os serviços anteriores e conexão com equipamentos que precisam de interface por fibra.

Cabeamento:

- par trançado: sim;
- coaxial: sim;
- fibra: prevista como parte do grau.

---

# 21. DISTÂNCIAS IMPORTANTES — 570-D

## Patch cords

```text
10 m no total por tipo de ligação
```

## Caixa de distribuição até outlet

```text
máximo de 90 m
```

## Outlet até o ponto de transição para a operadora

```text
máximo de 150 m
```

## Espaçamento entre outlets adicionais

```text
3,7 m horizontalmente
```

---

# 22. CONECTORES

## Par trançado

```text
RJ-45 fêmea
Cat 6A
T568A
```

## Coaxial

```text
Conector F
```

## Fibra

```text
Conector compatível com o equipamento
```

---

# 23. QUANTIDADE MÍNIMA DE INTERFACES NOS OUTLETS

## Grau 1

- 1 RJ-45 fêmea de quatro pares Cat 6A;
- 1 coaxial 75 Ω;
- se houver fibra: conexão para duas fibras.

## Grau 2

- 2 RJ-45 fêmea Cat 6A;
- 1 coaxial 75 Ω;
- se houver fibra: conexão para duas fibras.

## Grau 3

- 2 RJ-45 fêmea Cat 6A;
- 1 coaxial 75 Ω;
- 1 conexão para duas fibras.

---

# 24. TESTES EM REDES RESIDENCIAIS

A estrutura deve passar por três grandes etapas:

1. exame visual;
2. teste de verificação;
3. teste de qualificação.

---

# 25. EXAME VISUAL

Verificar:

- danos físicos;
- capa externa;
- caminho do cabo;
- exposição a interferência;
- proximidade com fontes eletromagnéticas;
- risco de danos por animais.

---

# 26. TESTES POR TIPO DE CABO

## Coaxial

Teste de conectividade para verificar ausência de curto.

## Par trançado

Testar:

- mapa de condutores;
- comprimento do enlace;
- conectividade.

## Fibra

Devem ser aplicados procedimentos apropriados para verificar a qualidade do sinal óptico, conforme suas normas específicas.

---

# 27. TESTE DE QUALIFICAÇÃO

Serve para confirmar se as aplicações utilizadas pelos usuários podem ser suportadas pelo cabeamento instalado.

Pode ser feito:

- com os próprios equipamentos;
- com equipamentos de teste.

---

# 28. LINK PERMANENTE E TESTE DE CANAL

## Link permanente

Compreende o enlace:

```text
Caixa de distribuição ↔ Outlet
```

Os patch cords do equipamento de teste pertencem ao próprio instrumento.

## Teste de canal

Utiliza os patch cords dos equipamentos do usuário.

---

# 29. CERTIFICAÇÃO

Teste visual, verificação e qualificação não eliminam a importância da certificação.

A certificação busca comprovar compatibilidade com as especificações técnicas do cabeamento.

---

# PARTE III — MULTIPLEXAÇÃO E UTILIZAÇÃO DA LARGURA DE BANDA

# 30. CONCEITO DE MULTIPLEXAÇÃO

Multiplexação é o conjunto de técnicas que permite que vários sinais compartilhem um único link de dados.

Objetivo principal:

```text
EFICIÊNCIA
```

Quando um link possui mais largura de banda do que um único sinal necessita, essa capacidade pode ser compartilhada.

---

# 31. MUX E DEMUX

## MUX

```text
Multiplexador
```

Combina vários fluxos em um fluxo agregado.

```text
vários → um
```

## DEMUX

```text
Demultiplexador
```

Separa o fluxo agregado no destino.

```text
um → vários
```

---

# 32. LINK E CANAL

```text
Link = caminho físico
Canal = parte do link reservada para uma transmissão
```

Um único link pode possuir vários canais.

---

# 33. PRINCIPAIS TÉCNICAS

| Técnica | Divisão | Natureza principal no material |
|---|---|---|
| FDM | frequência | analógica |
| WDM | comprimento de onda | óptica/analógica |
| TDM | tempo | digital |

---

# 34. FDM — FREQUENCY DIVISION MULTIPLEXING

Multiplexação por Divisão de Frequência.

## Funcionamento

Cada sinal usa uma portadora diferente.

As frequências são combinadas e enviadas pelo mesmo meio.

```text
Canal 1 → f1
Canal 2 → f2
Canal 3 → f3
↓
mesmo link
```

## Bandas de proteção

Podem existir faixas não utilizadas entre canais para evitar sobreposição e interferência.

```text
Canal A | proteção | Canal B | proteção | Canal C
```

## FDM e dados digitais

FDM é tratado como técnica analógica, mas uma fonte digital pode ser convertida/modulada para um sinal analógico antes da multiplexação.

---

# 35. APLICAÇÕES DO FDM

## Rádio AM

Faixa citada no material:

```text
530 a 1700 kHz
```

Cada estação usa uma frequência portadora diferente.

## Rádio FM

Faixa citada:

```text
88 a 108 MHz
```

Cada estação:

```text
200 kHz
```

## Televisão

Cada canal de TV:

```text
6 MHz
```

## Telefonia celular de primeira geração

Também aparece como aplicação de FDM.

---

# 36. WDM — WAVELENGTH DIVISION MULTIPLEXING

Multiplexação por Divisão de Comprimento de Onda.

Desenvolvida para explorar a grande capacidade da fibra óptica.

## Ideia

Combinar diferentes sinais ópticos em uma única fibra.

```text
λ1
λ2
λ3
↓
WDM
↓
λ1 + λ2 + λ3
```

No receptor, o DEMUX separa os comprimentos de onda.

## Relação WDM x FDM

São conceitualmente semelhantes porque combinam sinais associados a diferentes frequências.

A grande diferença:

```text
WDM → sinais ópticos em fibra
FDM → divisão de frequências em sistemas analógicos
```

## DWDM

```text
Dense WDM
WDM denso
```

Permite grande quantidade de canais muito próximos.

---

# 37. TDM — TIME DIVISION MULTIPLEXING

Multiplexação por Divisão de Tempo.

É uma técnica digital.

Em vez de separar frequências, cada conexão recebe uma fração do tempo.

```text
Tempo →
| A | B | C | D | A | B | C | D |
```

---

# 38. TDM SÍNCRONO

Cada entrada recebe um slot fixo em cada frame.

Mesmo sem dados:

```text
o slot continua reservado
```

Isso pode gerar desperdício.

## Frames e time slots

Com `n` conexões:

```text
n conexões → n slots por frame
```

A taxa do link de saída precisa acompanhar a soma das entradas.

No modelo apresentado:

```text
taxa do link = n × taxa de uma entrada
```

## Interleaving

Processo de intercalar unidades dos diferentes canais no fluxo multiplexado.

---

# 39. PROBLEMA DOS SLOTS VAZIOS

No TDM síncrono:

```text
canal sem dados → slot vazio
```

Isso reduz eficiência.

Exemplo conceitual:

```text
Frame 1: A B C D
Frame 2: A _ C D
Frame 3: A B _ D
```

Os espaços vazios ainda ocupam tempo do link.

---

# 40. GERENCIAMENTO DE TAXAS DIFERENTES NO TDM

O material apresenta estratégias como:

## Multiplexação multinível

Entradas de menor taxa podem ser combinadas antes de uma segunda etapa de multiplexação.

## Alocação de múltiplos slots

Uma entrada de maior velocidade pode receber mais de um slot por frame.

## Inserção de pulsos / bit stuffing

Quando as taxas não são múltiplos adequados, podem ser inseridos bits fictícios para ajustar velocidades.

---

# 41. SINCRONIZAÇÃO DO TDM SÍNCRONO

MUX e DEMUX precisam permanecer sincronizados.

Podem ser usados bits extras de sincronização no frame.

---

# 42. TDM ESTATÍSTICO

Foi desenvolvido para melhorar a eficiência do TDM síncrono.

## Regra principal

```text
slot é dado apenas a quem tem dados para enviar
```

O multiplexador verifica as entradas e:

```text
tem dados → recebe slot
não tem dados → é pulada
```

## Vantagem

Evita slots vazios quando há dados em outras entradas aguardando.

---

# 43. ENDEREÇAMENTO NO TDM ESTATÍSTICO

Como os slots não ficam presos a uma entrada específica, cada slot deve indicar seu destino.

```text
TDM síncrono → posição do slot identifica o canal
TDM estatístico → slot carrega dados + endereço
```

Isso gera overhead.

---

# 44. SINCRONIZAÇÃO NO TDM ESTATÍSTICO

Segundo o material:

```text
frames estatísticos não precisam dos mesmos bits de sincronização usados no TDM síncrono
```

---

# 45. CAPACIDADE DO LINK NO TDM ESTATÍSTICO

A capacidade pode ser dimensionada com base no comportamento estatístico das cargas.

Durante picos:

```text
alguns slots podem ter de esperar
```

---

# 46. SERVIÇOS DS E LINHAS T

## DS-0

```text
64 kbps
```

## DS-1 / T-1

```text
1,544 Mbps
24 canais de voz
```

## DS-2 / T-2

```text
6,312 Mbps
96 canais
```

## DS-3 / T-3

```text
44,736 Mbps na tabela de linhas T
672 canais
```

## DS-4 / T-4

```text
274,176 Mbps
4032 canais
```

---

# 47. FRAME T-1

O frame T-1 possui:

```text
24 time slots × 8 bits = 192 bits
+ 1 bit de sincronização
= 193 bits
```

Taxa:

```text
8000 frames/s
```

Resultado:

```text
193 × 8000 ≈ 1,544 Mbps
```

---

# 48. LINHAS E

Sistema europeu conceitualmente semelhante às linhas T, mas com capacidades diferentes.

| Linha | Taxa | Canais de voz |
|---|---:|---:|
| E-1 | 2,048 Mbps | 30 |
| E-2 | 8,448 Mbps | 120 |
| E-3 | 34,368 Mbps | 480 |
| E-4 | 139,264 Mbps | 1920 |

---

# 49. ESPALHAMENTO ESPECTRAL

O trecho disponibilizado do livro introduz **Spread Spectrum (SS)**.

A ideia principal apresentada é diferente da multiplexação:

```text
Multiplexação → eficiência
Espalhamento → privacidade + imunidade a interferências
```

O espalhamento expande a largura de banda do sinal e introduz redundância para atingir esses objetivos.

> **Limite da fonte fornecida:** o trecho disponibilizado termina logo após a introdução da seção de espalhamento espectral. Portanto, detalhes posteriores de FHSS e DSSS não devem ser inventados a partir deste arquivo.

---

# PARTE IV — REDES ÓPTICAS E SONET

# 50. REDES ÓPTICAS

Redes ópticas utilizam componentes e tecnologias ópticas para transmissão eficiente de dados.

Podem existir:

## Sistemas não guiados

O feixe óptico se propaga pelo espaço.

## Sistemas guiados

O meio é:

```text
fibra óptica
```

---

# 51. VANTAGENS DAS REDES ÓPTICAS

## Largura de banda

Alta capacidade de transporte de dados.

## Qualidade de sinal

A fibra não sofre interferência eletromagnética como os meios metálicos.

## Manutenção e implantação

- imunidade à corrosão;
- peso reduzido em relação ao cobre.

## Segurança

Para interferir fisicamente no sinal óptico, seria necessário acesso físico ao meio, segundo a abordagem apresentada no material.

---

# 52. GERENCIAMENTO ÓPTICO

O gerenciamento pode envolver:

- conexões em vários domínios;
- falhas de transmissão;
- recursos de rede;
- comprimento de onda;
- seleção de circuitos;
- rotas ponto a ponto;
- monitoramento de desempenho.

---

# 53. SONET

```text
SONET = Synchronous Optical Network
```

É uma arquitetura padronizada para redes ópticas.

O material apresenta o SONET como protocolo/padrão de multiplexação para redes de fibra óptica.

## STS

```text
Synchronous Transport Signal
```

O nível básico citado:

```text
STS-1 = 51,84 Mbps
```

---

# 54. CAMADAS SONET

As três camadas da hierarquia SONET são:

```text
Seção — Section
Linha — Line
Caminho/Trajeto — Path
```

## Seção

Responsável por aspectos do trecho entre equipamentos e formação/transmissão dos sinais ópticos.

## Linha

Relacionada à:

- multiplexação;
- sincronização dos quadros SONET.

## Caminho / Trajeto

Responsável pelo transporte ponto a ponto.

### Regra de memorização

```text
SONET = Seção → Linha → Caminho
```

---

# 55. GERENCIAMENTO DE FALHAS EM REDES ÓPTICAS

O tratamento de falhas ocorre próximo da camada física.

O material apresenta duas grandes abordagens:

1. dedicação antecipada de recursos de backup;
2. restauração dinâmica.

---

# 56. DEDICAÇÃO DE RECURSOS DE BACKUP COM ANTECEDÊNCIA

Características:

- recursos são reservados antes da falha;
- restauração garantida;
- tempo de restauração rápido.

## Proteção 1+1

Pertence a esta categoria.

Para uma conexão protegida, são reservados previamente:

- rota;
- comprimento de onda.

Quando o caminho principal falha, o backup pode ser utilizado.

---

# 57. RESTAURAÇÃO DINÂMICA

Utiliza a capacidade restante da rede após a falha.

Inclui:

- restauração de link;
- restauração de caminho.

## Restauração de link

As conexões que passam pelo elemento com falha são redirecionadas.

Os nós relacionados ao link com problema procuram uma alternativa ao redor do link defeituoso.

## Restauração de caminho

Um novo caminho é descoberto ponta a ponta.

---

# PARTE V — REDES DE ARMAZENAMENTO

# 58. TIPOS DE REDES DE ARMAZENAMENTO

O material trabalha com três conceitos principais:

```text
NAS
SAN
DAS
```

---

# 59. NAS

```text
Network Attached Storage
```

Características:

- armazenamento conectado à rede;
- dispositivo recebe endereço IP;
- pode ser acessado pela rede;
- há uma rede entre a aplicação e o sistema de arquivos na representação do material.

---

# 60. SAN

```text
Storage Area Network
```

Rede dedicada aos dispositivos de armazenamento.

Características:

- armazenamento conectado por rede própria;
- diversos servidores podem acessar recursos;
- reduz dependência direta entre armazenamento e um único servidor;
- favorece arquitetura centrada em armazenamento.

Tecnologias citadas:

- Fibre Channel;
- Ethernet;
- TCP/IP;
- FCoE;
- InfiniBand.

---

# 61. DAS

```text
Direct Attached Storage
```

Armazenamento ligado diretamente ao host.

Exemplos:

- HD interno;
- SSD diretamente conectado ao sistema.

---

# 62. ARQUITETURA CENTRADA NO SERVIDOR

Modelo tradicional:

```text
Servidor
↓
SCSI
↓
Armazenamento
```

Problema:

- armazenamento fica fortemente ligado ao servidor;
- outros servidores não acessam diretamente o recurso;
- falha do servidor pode comprometer o acesso.

---

# 63. ARQUITETURA CENTRADA EM ARMAZENAMENTO

Com redes de armazenamento:

- storage torna-se independente de um único computador;
- vários servidores podem acessar o mesmo conteúdo;
- os dispositivos de armazenamento ficam no centro da arquitetura.

Os dispositivos podem ser consolidados em:

```text
subsistemas de discos
```

acessados e compartilhados pela rede.

---

# 64. FIBRE CHANNEL

É uma das tecnologias mais associadas a SAN.

Características citadas:

- implementação em hardware;
- baixo atraso;
- baixa taxa de erros;
- alta velocidade;
- longas distâncias.

---

# 65. CAMADAS DO FIBRE CHANNEL

São cinco:

```text
FC-0
FC-1
FC-2
FC-3
FC-4
```

---

# 66. FC-0

```text
Camada física
```

Define:

- conectores;
- cabos;
- parâmetros elétricos;
- parâmetros ópticos;
- meio físico.

### Memorização

```text
FC-0 = físico
```

---

# 67. FC-1

```text
Protocolo de transmissão
```

Funções:

- codificação;
- decodificação;
- controle de erros;
- integração com clock em tecnologias seriais.

---

# 68. FC-2

Camada relacionada ao mecanismo de transporte de dados.

Associada a:

- estrutura e transporte de frames;
- mecanismo de rede do Fibre Channel;
- funcionamento de diferentes ambientes/topologias FC.

---

# 69. FC-3

```text
Serviços comuns
```

Define funções auxiliares.

Exemplos citados:

- hunt groups;
- funções para aumento de largura de banda;
- multicast.

---

# 70. FC-4

```text
Camada superior
```

Define como protocolos de aplicação/superiores são mapeados sobre Fibre Channel.

### Regra de memorização

```text
FC0 = meio físico
FC1 = codificação
FC2 = frames/transporte
FC3 = serviços comuns
FC4 = protocolos superiores/aplicação
```

---

# PARTE VI — VIRTUALIZAÇÃO E REDES VIRTUAIS

# 71. VIRTUALIZAÇÃO DE SERVIDOR

Um servidor físico pode ser dividido em várias máquinas virtuais.

Cada VM pode:

- executar sistema operacional próprio;
- executar aplicações;
- interagir como recurso independente;
- compartilhar hardware físico.

---

# 72. VIRTUALIZAÇÃO DE ARMAZENAMENTO

Permite combinar recursos físicos de armazenamento em um recurso virtual único.

Objetivo:

```text
gerenciamento mais simples e eficiente
```

---

# 73. VIRTUALIZAÇÃO DE REDE

Divide a largura de banda disponível em:

```text
canais independentes
```

Esses canais podem ser atribuídos a:

- servidores;
- dispositivos;
- clientes.

> Atenção: virtualização de rede não significa aglutinar toda a banda em um único canal.

---

# 74. VIRTUALIZAÇÃO DE APLICATIVOS

Separa aplicativos do hardware/sistema, permitindo que sejam movidos ou executados de maneira mais independente.

---

# 75. VIRTUALIZAÇÃO DE DESKTOP

Um servidor centralizado fornece e gerencia desktops remotamente.

A equipe de TI pode:

- corrigir;
- atualizar;
- provisionar;
- administrar desktops remotamente.

---

# 76. SLA

```text
Service-Level Agreement
Acordo de Nível de Serviço
```

Não é protocolo.

Define requisitos de serviço que o provedor deve atender.

Exemplos de parâmetros relacionados:

- largura de banda;
- atraso;
- recursos;
- qualidade esperada.

---

# 77. REDE VIRTUAL — VN

```text
Virtual Network
```

Uma VN é uma abstração/partição de recursos de uma rede física.

Recursos são alocados a um cliente para:

- acomodar fluxos;
- cumprir SLA.

O mesmo ambiente físico pode atender clientes com políticas de tráfego diferentes.

---

# 78. VPN

```text
Virtual Private Network
```

Usa infraestrutura compartilhada/pública para criar comunicação privada.

Pode usar:

- protocolos de túnel;
- criptografia;
- autenticação.

## Formas de encapsulamento citadas

- acesso remoto;
- site-to-site.

---

# 79. BENEFÍCIOS DA VPN

O material cita:

- menor custo operacional;
- maior produtividade;
- maior segurança;
- maior privacidade;
- escalabilidade;
- agilidade.

---

# 80. SEGURANÇA EM VPN

Mecanismos podem incluir:

- senha;
- biometria;
- criptografia;
- autenticação;
- protocolos de túnel.

Protocolos citados:

- IPsec;
- SSL/TLS;
- OpenVPN;
- L2TPv3;
- mecanismos de quarentena VPN.

---

# 81. NFV

```text
Network Functions Virtualization
Virtualização das Funções de Rede
```

Virtualiza funções de nós de rede para permitir criação e conexão de serviços.

## Desafios citados

- investimento inicial;
- mudanças organizacionais;
- capacitação;
- necessidade de conhecimento em software;
- mudança de responsabilidades;
- migração;
- interoperabilidade entre fabricantes;
- necessidade de estratégia tecnológica;
- flexibilidade;
- escalabilidade.

---

# PARTE VII — QUESTÕES DE ESTUDO E GABARITO COMENTADO

> As questões abaixo foram reformuladas em formato resumido para criar um banco de treinamento da IA.

---

# 82. QUESTÕES — ETHERNET

## Q1 — Primeira tecnologia Ethernet entre as opções apresentadas

**Pergunta resumida:** Entre 10BaseT, 10BaseU, 10Base2, 10Base5 e 10BaseCx, qual corresponde à tecnologia Ethernet mais antiga apresentada?

**Resposta: D — 10Base5**

### Justificativa

10Base5/Thicknet é um dos padrões Ethernet iniciais, usa coaxial grosso, 10 Mbps e até 500 m por segmento.

---

## Q2 — Thicknet, Thinnet e hubs

Afirmações:

- I: Thicknet é de difícil manuseio, mas a afirmação acrescentava características não sustentadas como definição própria do padrão.
- II: Thinnet = 10Base2, coaxial fino e mais fácil de manusear.
- III: hubs podem formar topologia física em estrela, mas funcionam como meio compartilhado.

**Resposta: E — II e III apenas**

---

## Q3 — PDU pronta para transmissão Ethernet

Alternativas incluíam bit, mensagem, datagrama, frame/quadro e segmento.

**Resposta: D — Frame ou quadro**

### Regra

```text
Ethernet / Enlace → Frame
```

---

## Q4 — Afirmação correta sobre Ethernet

A alternativa considerada correta era a que reconhecia que o frame Ethernet pode encapsular informações de camadas superiores.

**Resposta: C**

### Por exclusão

- MAC não depende do domínio da rede.
- Ethernet não é protocolo da camada de rede.
- Wi-Fi não é meio físico do padrão Gigabit Ethernet.
- FCS detecta erros, mas a alternativa sobre latência não definia adequadamente o padrão.

---

## Q5 — Tamanho do endereço MAC

**Resposta: C — 48 bits**

```text
48 bits = 6 bytes
```

---

# 83. QUESTÕES — ANSI/TIA/EIA 570-D

## Q6 — Serviços abrangidos

**Resposta: D — infraestrutura de cabos para dados, áudio, vídeo e entretenimento**

### Regra

A norma trata da infraestrutura, não de softwares de controle de geladeira, temperatura ou energia.

---

## Q7 — Topologia para condomínio com casas e edifício

**Resposta: D**

### Ideia central

Uso de área comum para dispositivos da operadora e distribuição adequada para cada unidade, incluindo MDU em edifícios.

---

## Q8 — Componentes mínimos

**Resposta: D — concentrador interno relacionado à disponibilização do serviço**

### Erros típicos

- dispositivos de rede da operadora não são os equipamentos Wi-Fi do usuário;
- ADO não é simplesmente um opcional para linha analógica;
- coaxial é permitido;
- não existe a regra apresentada de “uma dupla a cada 10 m²”.

---

## Q9 — Cabos permitidos

**Resposta: E — fibra monomodo pode ser usada com conector compatível**

### Regra

A base permite:

- UTP Cat 6A;
- coaxial RG-6;
- fibra multimodo;
- fibra monomodo.

---

## Q10 — Testes

**Resposta: C — T568A no cabeamento par trançado conforme o material**

### Complementos

- link permanente é reconhecido;
- teste de canal pode ser aplicado;
- coaxial pode ter conectividade/curto verificados;
- fibra exige testes apropriados.

---

# 84. QUESTÕES — MULTIPLEXAÇÃO

## Q11 — Tecnologias que usam FDM

**Resposta: A — rádio e televisão**

### Regra

```text
FDM → rádio + TV
```

---

## Q12 — Componentes essenciais de um sistema multiplexado

**Resposta: E — MUX e DEMUX**

```text
MUX junta
DEMUX separa
```

---

## Q13 — Similaridade entre WDM e FDM

**Resposta: C — combinam diferentes frequências para transmissão simultânea**

No WDM essas frequências correspondem a sinais ópticos/comprimentos de onda em fibra.

---

## Q14 — Técnica associada à multiplexação digital

**Resposta: C — TDM**

### Regra

```text
FDM → frequência
WDM → comprimento de onda
TDM → tempo/digital
```

---

## Q15 — Deficiência que o TDM estatístico busca corrigir

**Resposta: C**

### Conceito real a memorizar

O problema do TDM síncrono é manter slot reservado mesmo quando uma entrada não possui dados.

O TDM estatístico:

```text
não há dados → não reserva slot
há dados → aloca slot dinamicamente
```

---

# 85. QUESTÕES — SONET E REDES EMERGENTES

## Q16 — Camadas SONET

**Resposta: B — Seção, trajeto/caminho e linha**

### Regra

```text
SONET:
Section
Line
Path
```

---

## Q17 — Controle de falhas em redes ópticas

Afirmações:

1. backup antecipado teria restauração garantida e lenta;
2. proteção 1+1 seria restauração dinâmica;
3. restauração de link e caminho seriam backup antecipado;
4. nós associados ao link defeituoso procuram alternativa.

**Resposta: C — F, F, F, V**

### Razões

- backup antecipado é rápido;
- 1+1 pertence ao backup previamente reservado;
- restauração de link/caminho é dinâmica;
- a última afirmação corresponde ao funcionamento apresentado.

---

## Q18 — Característica de SAN

**Resposta: D**

Dispositivos de armazenamento podem ser consolidados em subsistemas de disco acessados e compartilhados pela rede.

---

## Q19 — Camadas Fibre Channel

Relacionamento:

1. Protocolos de aplicação/ULP → FC-4
2. Física, conectores e parâmetros → FC-0
3. Protocolos de sinal e estrutura de frames → FC-2
4. Ambientes de conexão FC → FC-2

**Resposta: E — III, I, II, II**

---

## Q20 — Virtualização de rede

**Resposta: C**

### Conceito

Diferentes tráfegos compartilham a mesma infraestrutura física, e o provedor aplica políticas distintas para atender aos SLAs.

---

# PARTE VIII — MAPA DE CONFUSÕES FREQUENTES

# 86. HUB x SWITCH

```text
Hub → replica para todos
Switch → encaminha conforme MAC
```

---

# 87. MAC x IP

```text
MAC → físico / camada 2 / 48 bits
IP → lógico / camada de rede
```

---

# 88. FDM x WDM x TDM

```text
FDM → divide frequência
WDM → divide comprimentos de onda ópticos
TDM → divide tempo
```

---

# 89. TDM SÍNCRONO x ESTATÍSTICO

```text
Síncrono:
slot fixo
pode ficar vazio
posição identifica canal

Estatístico:
slot dinâmico
evita slot vazio quando há outros dados
precisa de endereço no slot
```

---

# 90. NAS x SAN x DAS

```text
DAS → storage direto no host
NAS → storage acessível via rede/IP
SAN → rede dedicada para armazenamento
```

---

# 91. SONET x SDH

Nesta base:

```text
SONET → Section / Line / Path
```

Termos como `multiplex section` e `regenerator section` aparecem associados à nomenclatura SDH em questões comparativas, e não como a lista pedida de camadas SONET.

---

# 92. FC-0 A FC-4

```text
FC-0 → físico
FC-1 → transmissão/codificação
FC-2 → transporte/frames
FC-3 → serviços comuns
FC-4 → protocolos superiores
```

---

# 93. VIRTUALIZAÇÃO DE REDE x APLICAÇÃO x DESKTOP

```text
Rede → divide recursos/banda em canais virtuais
Aplicação → desacopla aplicação do ambiente físico
Desktop → desktops administrados/providos centralmente
```

---

# 94. SLA x VPN x VN

```text
SLA → acordo de nível de serviço
VN → partição lógica de recursos de rede
VPN → rede privada virtual com tunelamento/segurança
```

---

# PARTE IX — NÚMEROS QUE A IA DEVE MEMORIZAR

# 95. ETHERNET

```text
MAC = 48 bits = 6 bytes
RJ-45 = 8 pinos
Payload Ethernet = 46 a 1500 bytes
Preâmbulo = 7 bytes
SFD = 1 byte
FCS = 4 bytes
```

---

# 96. DISTÂNCIAS ETHERNET

```text
10Base5 = 500 m
10Base2 = 185 m
10Base-T = 100 m
100Base-FX = 400 m
100Base-TX = 100 m
1000Base-T = 100 m
1000Base-SX = 550 m
1000Base-LX = 5 km
```

---

# 97. RESIDENCIAL

```text
Patch cords = 10 m
Distribuição → outlet = 90 m
Outlet → transição operadora = 150 m
Outlets adicionais = 3,7 m
```

---

# 98. T/E

```text
T1 = 1,544 Mbps = 24 canais
Frame T1 = 193 bits
T1 = 8000 frames/s

E1 = 2,048 Mbps = 30 canais
E2 = 8,448 Mbps = 120 canais
E3 = 34,368 Mbps = 480 canais
E4 = 139,264 Mbps = 1920 canais
```

---

# 99. SONET

```text
STS-1 = 51,84 Mbps
```

---

# PARTE X — GLOSSÁRIO

# 100. SIGLAS

| Sigla | Significado |
|---|---|
| LAN | Local Area Network |
| IEEE | Institute of Electrical and Electronics Engineers |
| MAC | Media Access Control |
| NIC | Network Interface Card |
| PDU | Protocol Data Unit |
| FCS | Frame Check Sequence |
| CRC | Cyclic Redundancy Check |
| UTP | Unshielded Twisted Pair |
| STP | Shielded Twisted Pair |
| ADO | Auxiliary Disconnect Outlet |
| MDU | Multi-Dwelling Unit |
| FDM | Frequency Division Multiplexing |
| WDM | Wavelength Division Multiplexing |
| DWDM | Dense Wavelength Division Multiplexing |
| TDM | Time Division Multiplexing |
| MUX | Multiplexador |
| DEMUX | Demultiplexador |
| SONET | Synchronous Optical Network |
| STS | Synchronous Transport Signal |
| NAS | Network Attached Storage |
| SAN | Storage Area Network |
| DAS | Direct Attached Storage |
| FC | Fibre Channel |
| FCoE | Fibre Channel over Ethernet |
| VM | Virtual Machine |
| VN | Virtual Network |
| VPN | Virtual Private Network |
| SLA | Service-Level Agreement |
| NFV | Network Functions Virtualization |
| SCSI | Small Computer System Interface |

---

# PARTE XI — REGRAS DE RACIOCÍNIO PARA RESOLVER PROVAS

# 101. QUANDO A QUESTÃO FALAR EM “ENDEREÇO FÍSICO”

Responder mentalmente:

```text
MAC → 48 bits → camada 2
```

---

# 102. QUANDO FALAR EM “QUADRO”

Associar:

```text
Frame → Ethernet → camada de enlace
```

---

# 103. QUANDO FALAR EM “DIVISÃO POR FREQUÊNCIA”

Associar:

```text
FDM → rádio / TV / frequência
```

---

# 104. QUANDO FALAR EM “FIBRA + VÁRIAS CORES/COMPRIMENTOS DE ONDA”

Associar:

```text
WDM
```

---

# 105. QUANDO FALAR EM “FRAÇÕES DE TEMPO”

Associar:

```text
TDM
```

---

# 106. QUANDO FALAR EM SLOT VAZIO

Associar:

```text
problema do TDM síncrono
```

Solução:

```text
TDM estatístico
```

---

# 107. QUANDO FALAR EM REDE RESIDENCIAL PADRONIZADA

Associar:

```text
ANSI/TIA/EIA 570-D
Topologia estrela
Cat 6A
RG-6
Fibra
ADO
Caixa de distribuição
Outlet
```

---

# 108. QUANDO FALAR EM BACKUP 1+1

Associar:

```text
recurso reservado antecipadamente
restauração rápida
```

---

# 109. QUANDO FALAR EM STORAGE COMPARTILHADO POR VÁRIOS SERVIDORES

Associar:

```text
SAN / arquitetura centrada em armazenamento
```

---

# 110. QUANDO FALAR EM CABOS, CONECTORES E PARÂMETROS ÓPTICOS NO FIBRE CHANNEL

Associar:

```text
FC-0
```

---

# 111. QUANDO FALAR EM PROTOCOLOS SUPERIORES NO FIBRE CHANNEL

Associar:

```text
FC-4
```

---

# 112. QUANDO FALAR EM ACORDO ENTRE CLIENTE E PROVEDOR

Associar:

```text
SLA
```

---

# PARTE XII — CHECKLIST DE RESPOSTA DA IA

Antes de responder uma questão, a IA deve verificar:

- [ ] A questão é Ethernet?
- [ ] Trata de camada OSI?
- [ ] Está falando de PDU?
- [ ] É norma residencial 570-D?
- [ ] O meio é par trançado, coaxial ou fibra?
- [ ] É FDM, WDM ou TDM?
- [ ] O TDM é síncrono ou estatístico?
- [ ] A pergunta envolve T1/E1?
- [ ] É SONET?
- [ ] É gerenciamento de falhas?
- [ ] É NAS, SAN ou DAS?
- [ ] É uma camada Fibre Channel?
- [ ] É virtualização?
- [ ] É VPN, VN, SLA ou NFV?
- [ ] Existe algum número-chave que elimina alternativas?
- [ ] A alternativa mistura conceitos de tecnologias diferentes?
- [ ] A informação está realmente sustentada por esta base?

---

# PARTE XIII — MODELO DE RESPOSTA RECOMENDADO

## Para múltipla escolha

```text
A alternativa correta é:

✅ X. [alternativa]

Motivo:
[explicação de 2 a 5 linhas]

Por que as demais estão erradas:
- A: ...
- B: ...
- C: ...

🧠 Para memorizar:
[regra curta]
```

## Para verdadeiro ou falso

```text
1. F — motivo
2. V — motivo
3. F — motivo
4. V — motivo

Sequência: F – V – F – V
Resposta: alternativa X.
```

## Para relação de colunas

```text
I = conceito A
II = conceito B
III = conceito C

Ordem:
III – I – II – II

Resposta: X.
```

---

# 114. RESUMO ULTRARRÁPIDO

```text
ETHERNET
IEEE 802.3
MAC = 48 bits
Frame = camada 2
Switch usa MAC
RJ-45 = 8 pinos
1000Base-T = 1 Gbps / 100 m

RESIDENCIAL
ANSI/TIA/EIA 570-D
Estrela
Cat 6A
RG-6
Fibra
ADO
90 m cabeamento
10 m patch cords
150 m até transição
T568A

MULTIPLEXAÇÃO
MUX junta
DEMUX separa
FDM = frequência
WDM = óptico
TDM = tempo
TDM síncrono = slot fixo
TDM estatístico = slot dinâmico

TELEFONIA DIGITAL
T1 = 1,544 Mbps / 24 canais
E1 = 2,048 Mbps / 30 canais

SONET
Section
Line
Path
STS-1 = 51,84 Mbps

FALHAS ÓPTICAS
1+1 = backup antecipado
Link/path restoration = dinâmica

ARMAZENAMENTO
DAS = direto
NAS = rede/IP
SAN = rede de storage
Fibre Channel = muito usado

FIBRE CHANNEL
FC0 = físico
FC1 = codificação
FC2 = transporte/frames
FC3 = serviços
FC4 = aplicação

VIRTUALIZAÇÃO
VN = recursos virtuais
SLA = acordo
VPN = túnel/privacidade
NFV = funções de rede virtualizadas
```

---

# 115. REGRA FINAL PARA A IA

Quando houver dúvida entre duas alternativas:

1. identifique as palavras-chave;
2. determine a tecnologia;
3. elimine alternativas que misturem camadas, meios ou padrões diferentes;
4. confira números;
5. dê preferência à terminologia exata desta base;
6. não invente algo que não esteja sustentado pelo material.

**Fim da Base de Conhecimento.**
