# BASE DE CONHECIMENTO — REDES, CABEAMENTO E FIBRA ÓPTICA

> **Finalidade:** arquivo Markdown consolidado para uso em uma IA de estudos, revisão, resolução de questões e consulta técnica.
>
> **Base utilizada:** materiais enviados sobre fibra óptica, cabeamento óptico, cabeamento estruturado, redes OTN/DWDM, LANs, modems, bridges, switches e tecnologias de acesso/interconexão.
>
> **Importante:** este arquivo prioriza o conteúdo apresentado nos materiais de estudo. Quando houver divergência interna, possível erro de digitação ou ponto não coberto explicitamente pelos PDFs, isso é indicado em uma observação.

---

## 0. INSTRUÇÕES PARA A IA QUE USAR ESTA BASE

Ao responder perguntas com base neste arquivo:

1. **Priorize o conteúdo desta base** quando a pergunta disser “de acordo com o material”, “segundo a disciplina”, “conforme a norma apresentada” ou trouxer alternativas semelhantes às questões resolvidas.
2. Em questões de múltipla escolha:
   - informe primeiro a **letra e a alternativa correta**;
   - depois explique de forma curta por que ela está correta;
   - se útil, explique por que as demais estão erradas.
3. Em questões V/F:
   - classifique cada item separadamente;
   - depois forneça a sequência final.
4. Não invente dados que não estejam nesta base.
5. Se uma pergunta exigir informação não contida aqui, responda claramente: **“Esse ponto não está explicitamente coberto na base fornecida.”**
6. Quando houver possível inconsistência do material, **não corrija silenciosamente**. Informe que a fonte apresenta uma inconsistência.
7. Para memorização, use comparações, tabelas e macetes simples.
8. Em dúvidas práticas, diferencie:
   - conceito de prova;
   - aplicação real;
   - limitação do material.
9. Use linguagem técnica, porém didática.
10. Para questões sobre fibra, lembre que o material enfatiza:
    - transmissão por luz;
    - baixa atenuação;
    - ausência de interferência eletromagnética;
    - necessidade de cuidados com conectores, curvaturas, sujeira, emendas e testes.

---

# PARTE I — FUNDAMENTOS DE FIBRA ÓPTICA

## 1. O que é fibra óptica

Fibra óptica é um **meio físico de transmissão de dados que utiliza luz**.

Em vez de transportar a informação por variações elétricas no condutor, como ocorre em cabos metálicos, a fibra transporta pulsos luminosos.

Fluxo simplificado:

```text
DADOS
  ↓
Conversão elétrico → óptico
  ↓
PULSOS DE LUZ
  ↓
FIBRA ÓPTICA
  ↓
Conversão óptico → elétrico
  ↓
DADOS NO DESTINO
```

### Características destacadas no material

- alta velocidade de transmissão;
- grande alcance;
- baixa perda quando comparada a muitos meios metálicos;
- alta largura de banda;
- excelente confiabilidade;
- imunidade a interferências eletromagnéticas;
- isolamento elétrico;
- pequena dimensão física.

A luz infravermelha é apresentada como uma das formas mais utilizadas como portadora de informação em sistemas ópticos.

---

## 2. Materiais de fabricação

O material descreve fibras fabricadas com:

- sílica;
- vidro composto;
- plástico.

### Sílica

É indicada no material como o material que oferece as melhores características de transmissão para telecomunicações.

### Vidro composto e plástico

Podem apresentar:

- maior atenuação;
- menor largura de banda;
- aplicação em distâncias menores ou sistemas de baixa demanda.

---

## 3. Refração e reflexão

### 3.1 Refração

Refração é a mudança de direção e de velocidade da luz quando ela passa de um meio para outro com propriedades ópticas diferentes.

Exemplo didático:

```text
Ar → Água
```

Um objeto parcialmente mergulhado na água parece “torto” porque a luz muda de direção ao atravessar meios com índices de refração diferentes.

### 3.2 Reflexão interna

A fibra depende da **reflexão interna** para conduzir a luz pelo núcleo.

A luz é lançada de forma que continue refletindo internamente ao longo da fibra:

```text
| Núcleo da fibra                                  |
|  ↘      ↗      ↘      ↗      ↘      ↗          |
|    ↘  ↗          ↘  ↗          ↘  ↗            |
|      →              →              →             |
```

A diferença entre o índice de refração do núcleo e o da casca permite a propagação do sinal luminoso.

---

# PARTE II — CONSTRUÇÃO DA FIBRA ÓPTICA

## 4. Componentes básicos

A estrutura básica apresentada no material possui três componentes:

### 4.1 Núcleo

É a região central da fibra.

Função:

- transportar o sinal luminoso.

Pode ser formado por:

- vidro;
- sílica;
- plástico.

### 4.2 Casca

Fica ao redor do núcleo.

Sua função é permitir que a luz permaneça confinada no núcleo pela diferença de índice de refração.

### 4.3 Capa protetora

Protege a fibra contra:

- danos mecânicos;
- ambiente externo;
- intempéries;
- contato direto com agentes externos.

Resumo:

```text
┌───────────────────────────┐
│       Capa protetora      │
│   ┌───────────────────┐   │
│   │       Casca       │   │
│   │   ┌───────────┐   │   │
│   │   │  Núcleo   │   │   │
│   │   └───────────┘   │   │
│   └───────────────────┘   │
└───────────────────────────┘
```

---

## 5. Multiplexação na fibra

A fibra pode transportar múltiplas informações simultaneamente.

Exemplos de serviços:

- dados de Internet;
- telefonia;
- televisão;
- voz;
- vídeo.

Conceito geral:

```text
Internet ─┐
Telefonia ├──> multiplexação ──> uma fibra
TV ───────┤
Dados ────┘
```

---

# PARTE III — TIPOS DE FIBRA ÓPTICA

## 6. Classificação geral

O material trabalha com dois grandes tipos:

- **multimodo**;
- **monomodo**.

A multimodo aparece subdividida em:

- multimodo índice degrau;
- multimodo índice gradual.

---

## 7. Fibra multimodo

A fibra multimodo possui núcleo maior e permite diferentes modos/caminhos de propagação da luz.

Representação simplificada:

```text
Entrada
  ↓
| ↗↘↗↘↗↘ |
| →→→→→→ |
| ↘↗↘↗↘↗ |
```

### Características gerais no material

- núcleo maior que o da monomodo;
- maior quantidade de caminhos ópticos;
- maior dispersão;
- maior atenuação em comparação com monomodo;
- aplicação típica em enlaces internos e distâncias menores.

O material cita valores de distância de até aproximadamente **300 m ou 2 km**, conforme o tipo/aplicação.

---

## 8. Multimodo índice degrau

Características:

- núcleo com índice de refração aproximadamente uniforme;
- mudança mais abrupta na interface núcleo/casca;
- construção mais simples;
- boa captura de energia luminosa;
- transmissor pode ser mais econômico;
- maior atenuação;
- largura de banda inferior às opções mais avançadas;
- recomendada para curtas distâncias.

### Macete

**Degrau = mudança brusca.**

---

## 9. Multimodo índice gradual

Características:

- o índice de refração varia gradualmente;
- reduz a dispersão;
- aumenta a largura de banda;
- apresenta melhor desempenho que a multimodo degrau;
- pode ser utilizada em distâncias maiores que a multimodo degrau.

### Macete

**Gradual = mudança progressiva.**

---

## 10. Fibra monomodo

A monomodo trabalha com núcleo muito fino e propagação essencialmente por um modo óptico.

Representação:

```text
Entrada ───────────────────────────────> Saída
```

### Características

- núcleo menor;
- menos caminhos de propagação;
- menor dispersão;
- menor atenuação;
- maior largura de banda;
- maiores distâncias;
- muito utilizada em telecomunicações.

O material cita possibilidade de alcance de até **300 km**, dependendo do sistema.

### Resposta típica de prova

> A fibra que permite atingir as maiores distâncias e velocidades é a **monomodo**.

### Observação de consistência da fonte

Em um dos materiais, as dimensões de casca e núcleo da fibra monomodo aparecem em **nm**. Esse dado pode ser resultado de erro editorial. Como esta base preserva o material, não deve ser alterado silenciosamente em questão baseada na apostila.

---

## 11. Comparação entre fibras

| Característica | Multimodo degrau | Multimodo gradual | Monomodo |
|---|---|---|---|
| Núcleo | maior | maior | muito fino |
| Caminhos de luz | vários | vários, mais controlados | essencialmente um |
| Dispersão | alta | menor | muito baixa |
| Atenuação | maior | intermediária | menor |
| Distância | curta | média | longa |
| Largura de banda | menor | maior | muito alta |
| Aplicação típica | enlaces curtos | LAN/backbone curto | telecom/longa distância |

---

# PARTE IV — PERDAS E INTERFERÊNCIAS EM FIBRA

## 12. Atenuação

**Atenuação = perda de energia/potência do sinal ao longo da transmissão.**

Exemplo:

```text
Origem:  ██████████
              ↓ fibra
Destino: ██████
```

A intensidade recebida é menor que a intensidade transmitida.

### Causas destacadas

- distância;
- material da fibra;
- conectores;
- emendas;
- absorção;
- espalhamento;
- curvaturas;
- impurezas;
- danos mecânicos.

### Resposta típica de prova

> Pulsos de luz que perdem potência conforme percorrem a fibra apresentam **atenuação**.

---

## 13. Atenuação em emendas e conectores

Uma emenda ou conector mal executado pode provocar:

- desalinhamento;
- reflexão;
- perda de potência;
- perda parcial ou total do sinal.

A qualidade da conectorização é fundamental.

---

## 14. Absorção

A absorção ocorre quando parte da energia luminosa é absorvida pelo material.

### 14.1 Absorção intrínseca

Relacionada às propriedades do próprio material.

Mesmo materiais transparentes não são perfeitamente transparentes.

### 14.2 Absorção extrínseca

Relacionada a impurezas introduzidas no processo de fabricação, inclusive contaminantes.

---

## 15. Espalhamento

O espalhamento ocorre quando parte da luz é desviada de seu caminho.

### Tipos citados

- Rayleigh;
- Raman.

### Rayleigh

Relacionado a variações de densidade e imperfeições estruturais.

### Raman

Relacionado à interação do sinal óptico com elementos do material, alterando a forma de propagação.

---

## 16. Macrocurvatura

Ocorre quando a fibra é dobrada com raio de curvatura inadequado.

Consequência:

- parte da luz pode escapar do núcleo;
- aumenta a atenuação.

```text
Correto:  ─────────────────────

Ruim:     ───────╮
                 ╰──────
             curva muito fechada
```

---

## 17. Microcurvatura

É uma deformação pequena, muitas vezes pouco visível.

Pode resultar de:

- impacto;
- pressão;
- irregularidade mecânica.

Pode provocar perda de sinal e até inutilizar a fibra.

---

## 18. Interferência eletromagnética

O material enfatiza:

> **A fibra óptica é imune à interferência eletromagnética**, pois transmite a informação por luz, e não por corrente elétrica no núcleo de transmissão.

Portanto, em uma questão que liste “interferência eletromagnética” como um tipo de interferência do sinal óptico, a tendência, de acordo com o material, é considerá-la **incorreta**.

---

# PARTE V — CABEAMENTO ÓPTICO E COMPONENTES DE INFRAESTRUTURA

## 19. Sistema básico de comunicação óptica

Um sistema de comunicação possui:

1. transmissor;
2. meio de transmissão;
3. receptor.

Em fibra:

```text
Sinal elétrico
      ↓
Transmissor + E/O
      ↓
Sinal óptico
      ↓
Fibra
      ↓
Receptor + E/O
      ↓
Sinal elétrico
```

---

## 20. Circuito E/O

E/O = **elétrico/óptico**.

Funções:

- no transmissor: converte sinal elétrico em óptico;
- no receptor: converte sinal óptico em elétrico.

---

## 21. TX e RX

- **TX** = transmissor;
- **RX** = receptor.

São associados à geração/detecção da fonte luminosa.

---

## 22. LED e laser

O transmissor e o receptor precisam ser compatíveis com o tipo de fonte óptica.

Se o transmissor usa LED, o receptor precisa ser capaz de receber aquela fonte.

Se o transmissor usa laser, o receptor precisa detectar o laser correspondente.

---

## 23. Distribuidor óptico

O distribuidor óptico tem a função de:

- receber o cabo de fibra;
- expor as fibras internas de forma protegida;
- organizar as fibras;
- disponibilizar as extremidades para conexão.

### Resposta típica de prova

> Função do distribuidor óptico: **dispor/disponibilizar as fibras ópticas que fazem parte do cabo óptico**.

Não é função dele:

- converter sinal elétrico em óptico;
- converter óptico em elétrico;
- transformar LED em laser.

---

## 24. Caixa de emenda

Usada para:

- proteger emendas;
- organizar fibras emendadas;
- manter a fibra protegida depois de removida a proteção original do cabo.

Em ambiente externo ou subterrâneo, a proteção contra agentes do ambiente, incluindo líquidos, é essencial.

---

## 25. Conectores ópticos

O material destaca:

- **ST — Straight Tip**;
- **SC — Standard Connector**;
- **LC — Lucent Connector**.

### ST

Conector de formato cilíndrico, associado no material a encaixe com mecanismo semelhante a rosca/trava.

### SC

Conector maior, formato mais quadrado.

### LC

Conector compacto, menor que o SC.

### Patch cord SC–LC

Um patch cord pode ter conectores diferentes em cada ponta, por exemplo:

```text
[SC] ======================= [LC]
```

---

## 26. Problemas de conectorização

Podem ocorrer perdas por:

- desalinhamento dos núcleos;
- sujeira;
- impurezas;
- encaixe parcial;
- conexão mal executada.

---

# PARTE VI — PARÂMETROS DE QUALIDADE ÓPTICA

## 27. Principais parâmetros

O material destaca três:

1. atenuação;
2. dispersão;
3. perda de retorno.

---

## 28. Dispersão

A dispersão é a alteração do formato do sinal ao longo da propagação.

Pode ocorrer porque componentes do sinal percorrem caminhos ou velocidades diferentes.

É mais comum em fibras multimodo.

### Diferença importante

- **Atenuação:** reduz a potência.
- **Dispersão:** altera o formato do pulso.

---

## 29. Perda de retorno

É a relação associada à potência óptica que é refletida de volta em direção à fonte.

Pode ocorrer devido a:

- conector parcialmente acoplado;
- falha de emenda;
- impurezas;
- descontinuidades.

Não significa “luz excedente que não era necessária”.

---

# PARTE VII — INSTALAÇÃO, MANUTENÇÃO E CERTIFICAÇÃO DE FIBRA

## 30. Formas de instalação

O material cita:

- subterrânea em dutos;
- diretamente enterrada;
- aérea;
- transoceânica.

O cabo deve possuir características adequadas ao ambiente.

---

## 31. Cuidados de instalação

Antes e durante o lançamento:

- realizar inspeção visual;
- seguir recomendações do fabricante;
- controlar a tração;
- respeitar o raio de curvatura;
- proteger extremidades;
- evitar sujeira;
- prever folgas para manutenção;
- usar caixas de emenda adequadas.

---

## 32. Sujeira em fibra

A contaminação dos conectores e das extremidades pode causar falhas graves.

Exemplos:

- poeira;
- óleo dos dedos;
- resíduos;
- sujeira em conectores.

Regra prática da base:

> **Inspecionar e limpar antes de conectar.**

---

## 33. Testes de fibra

### Em laboratório

O material cita:

- dispersão cromática;
- largura de banda;
- comprimento de onda de corte;
- diâmetro do campo modal;
- atenuação espectral;
- características geométricas;
- características mecânicas.

### Em campo

- continuidade;
- atenuação.

---

## 34. Teste de continuidade

Objetivo:

- descobrir se a fibra está rompida.

O material apresenta o uso de fonte/caneta óptica em uma ponta e verificação da presença de luz na outra.

---

## 35. OTDR

OTDR = **Optical Time Domain Reflectometer**.

Funções apresentadas:

- medir/analisar perdas;
- localizar eventos ao longo da fibra;
- identificar ruptura;
- localizar emendas;
- identificar curvaturas excessivas;
- identificar trincas;
- relacionar os eventos à distância.

Princípio simplificado:

```text
OTDR ──pulso──> fibra
OTDR <─reflexos/retornos── fibra
```

O instrumento analisa o retorno ao longo do tempo para estimar a posição dos eventos.

---

## 36. Certificação

Após a instalação, os valores medidos devem ser comparados aos limites/especificações do sistema ou fabricante.

O enlace deve ficar dentro dos critérios de aceitação.

Exemplo de interpretação discutido:

- perda medida: 0,16 dB;
- limite por volta de 1,50 dB;
- resultado: aprovado/passa;
- margem é diferente do limite.

---

# PARTE VIII — CABEAMENTO ESTRUTURADO

## 37. Conceito

Cabeamento estruturado é uma forma padronizada de organizar a infraestrutura de telecomunicações.

Objetivos:

- organização;
- facilidade de manutenção;
- expansão futura;
- identificação;
- interoperabilidade;
- desempenho;
- redução de improvisos.

O material recomenda planejar a infraestrutura considerando necessidades futuras, inclusive horizonte de vários anos.

---

## 38. ANSI/TIA-568

O material apresenta a família ANSI/TIA-568 dividida em partes.

### Parte 0

Base do sistema genérico de cabeamento estruturado.

### Parte 1

Cabeamento para edifícios comerciais.

### Parte 2

Componentes de par trançado balanceado.

### Parte 3

Componentes de fibra óptica.

### Parte 4

Componentes de cabo coaxial.

---

## 39. ANSI/TIA-568.0-D

No material, a ANSI/TIA-568.0-D representa a quarta revisão (“D”) da Parte 0.

Ela aborda, na visão apresentada:

- estrutura do sistema;
- topologia;
- instalação;
- desempenho;
- testes;
- requisitos gerais.

### Questão típica

> A especificação da 568.0-D é a **estrutura de um sistema de cabeamento, sua topologia, desempenho e testes**.

---

# PARTE IX — TOPOLOGIAS DE REDE

## 40. Topologia estrela

É a topologia priorizada/destacada no material de cabeamento estruturado.

```text
         PC
          |
PC ─── SWITCH ─── PC
          |
        Servidor
```

### Vantagens

- fácil adicionar nós;
- gerenciamento centralizado;
- falha de um computador não derruba os outros;
- caminho direto ao dispositivo central.

### Desvantagens

- falha do equipamento central pode parar a rede;
- possível gargalo;
- maior necessidade de cabeamento.

### Questão típica

> Topologia indicada prioritariamente: **estrela**.

---

## 41. Outras topologias

### Anel

Dispositivos organizados em circuito.

### Barramento

Meio compartilhado entre dispositivos.

### Árvore

Combinação hierárquica de redes, frequentemente entendida como agrupamento de estrelas.

### Ponto a ponto

Comunicação direta entre pontos.

### Mesh/malha

Múltiplos caminhos entre os dispositivos.

---

# PARTE X — CABO DE PAR TRANÇADO E DISTÂNCIAS

## 42. UTP

UTP = **Unshielded Twisted Pair**.

Vantagem:

- baixo custo.

Limitação:

- distância.

O material cita:

- cabeamento horizontal: até aproximadamente **90 m**;
- canal Ethernet de categorias 3 a 6A: até **100 m**.

### Interpretação

```text
Permanent link ≈ 90 m
Canal completo ≈ 100 m
```

---

## 43. Outras distâncias citadas

No material:

- Ethernet Cat 3 a Cat 6A: até 100 m;
- ADSL: até cerca de 5.000 m;
- telefonia analógica: até cerca de 800 m.

Esses números devem ser usados em questões baseadas diretamente no material.

---

# PARTE XI — MICE, ATERRAMENTO E GAIOLA DE FARADAY

## 44. MICE

MICE:

- **M** = Mecânico;
- **I** = Ingresso;
- **C** = Climático;
- **E** = Eletromagnético.

Classificação apresentada:

- MICE 1: ambiente controlado;
- MICE 2: ambiente industrial leve;
- MICE 3: ambiente industrial pesado.

Pode existir classificação combinada, por exemplo:

```text
M1 I2 C2 E1
```

---

## 45. Aterramento

O aterramento ajuda a:

- proteger equipamentos contra sobretensão;
- melhorar desempenho e compatibilidade;
- reduzir efeitos de ruído conduzido;
- proporcionar caminho de dissipação.

---

## 46. Gaiola de Faraday

Conceito associado à proteção contra campos elétricos externos e ao controle eletromagnético do ambiente.

---

# PARTE XII — REGRAS DE INSTALAÇÃO DESTACADAS

## 47. Categoria mínima

O material cita:

- par trançado: categoria 5e ou superior;
- multimodo: OM3 ou superior.

## 48. Número mínimo de fibras

O material menciona alteração para **duas fibras** em aplicações gerais.

## 49. Raio de curvatura — par trançado

Raio interno mínimo:

> **4 vezes o diâmetro total do cabo.**

Questão típica:

✅ resposta: **4 vezes o diâmetro do cabo**.

## 50. Raio de curvatura — fibra

O material cita **25 mm (1 polegada)** como raio interno mínimo.

## 51. Tração em par trançado

Para cabo de quatro pares, o material cita limite de **110 N (11 kgf)**.

## 52. Hardware

Switch/roteador deve ser compatível ou superior ao desempenho da categoria do cabeamento.

Regra:

> O desempenho final fica limitado pelo componente de menor desempenho.

---

# PARTE XIII — TESTES DE CABEAMENTO E NORMAS DE TESTE

## 53. Calibração

Instrumentos de teste devem possuir documentação de calibração e registro da calibração.

## 54. Testes por categoria

O material diferencia testes para:

- Cat 3 a 5e;
- Cat 6 ou superior.

Logo, é **falso** dizer que testes de desempenho são realizados igualmente, independentemente da categoria.

## 55. Testes de fibra

O material associa normas TIA específicas aos testes de multimodo e monomodo.

### Atenção — inconsistência interna da fonte

Em um trecho, o material associa:
- TIA-526-14-A a multimodo;
- TIA-526-7 a monomodo.

Na lista de referências, os títulos apresentados sugerem a associação inversa.

Portanto:

> **Há uma inconsistência interna no material.** Em questão da plataforma, priorize a associação exatamente apresentada no enunciado/apostila da disciplina; em aplicação técnica real, verificar a norma original.

---

# PARTE XIV — REDES LAN

## 56. LAN

LAN = **Local Area Network**.

É uma rede local, usada em:

- escritório;
- prédio;
- campus;
- ambiente limitado.

O material menciona LANs cobrindo até aproximadamente **10 km** em sua abordagem didática.

---

## 57. VLAN

VLAN = rede local virtual.

Permite separar logicamente grupos mesmo dentro da mesma infraestrutura física.

Exemplos:

- alunos;
- professores;
- administrativo;
- gerência.

---

## 58. Projeto de LAN

Itens a considerar:

- número de equipamentos;
- topologia;
- cabeamento;
- concentradores;
- disponibilidade;
- segurança;
- desempenho;
- custo;
- viabilidade;
- expansão.

---

# PARTE XV — DOCUMENTAÇÃO DE REDE

## 59. Mapa lógico

Mostra como a informação trafega.

Pode conter:

- sub-redes;
- VLANs;
- máscaras;
- endereços;
- roteadores;
- firewalls;
- protocolos de roteamento.

## 60. Mapa físico

Mostra a disposição física:

- equipamentos;
- racks;
- cabos;
- salas;
- caminhos.

## 61. Diagrama de cabeamento

Mostra:

- origem do cabo;
- destino do cabo;
- ligações físicas.

## 62. Mapa de VLANs

Mostra:

- VLANs existentes;
- perfis de usuários;
- permissões.

## 63. Mapa de endereços

Ajuda em:

- manutenção;
- localização de dispositivos;
- identificação de problemas.

---

# PARTE XVI — EQUIPAMENTOS DE REDE

## 64. Modem

Conecta a rede à operadora/tecnologia de acesso.

## 65. Roteador

Encaminha pacotes entre redes.

## 66. Hub

Também chamado de concentrador no material.

Função:

- interligar computadores em uma LAN;
- atuar como ponto central.

O material cita que ele possui buffer de armazenamento.

### Questão típica

> Dispositivo com buffer capaz de alterar a velocidade de transmissão: **concentrador (Hub)**, conforme a formulação do material.

## 67. Switch

Dispositivo com múltiplas portas que interliga equipamentos.

Diferencial:

- identifica origem e destino;
- encaminha de forma mais direcionada;
- não precisa propagar todo o tráfego por todas as portas como um hub clássico.

### Questão típica

> Switch = ativo de rede constituído por múltiplas portas, cada uma podendo ligar um dispositivo/computador.

## 68. Bridge

Usada para interligar/segmentar partes de uma LAN.

### Questão típica

> Tecnologia para conectar dois segmentos de LAN: **Bridge**.

---

# PARTE XVII — LAN, MAN E WAN

## 69. LAN

Área local.

## 70. MAN

MAN = **Metropolitan Area Network**.

Atende:

- área metropolitana;
- cidade;
- municípios próximos.

## 71. WAN

WAN = **Wide Area Network**.

Pode interligar:

- cidades;
- estados;
- países;
- continentes.

A Internet pode ser vista como interconexão de várias redes.

---

# PARTE XVIII — FIBRA EM LANs E MODEMS DE FIBRA

## 72. Quando utilizar fibra

Aplicações:

- grandes distâncias;
- interligação de prédios;
- alta velocidade;
- ambientes com interferência;
- backbones;
- enlaces entre segmentos.

## 73. Vantagens da fibra citadas

- baixa perda;
- pequeno tamanho/peso;
- imunidade a interferência;
- isolação elétrica;
- alta taxa de transmissão.

## 74. Desvantagens citadas

- fragilidade;
- dificuldade de conexão;
- perdas em alguns acopladores;
- impossibilidade de alimentação remota de repetidores;
- limitações/padronização de componentes conforme abordagem do material.

## 75. Modem de fibra

Apresentado como um extensor para resolver problemas de grandes distâncias.

Características citadas:

- baixo atraso;
- banda larga.

### Questão típica

> Alternativa para aliviar limitações de LANs de grande distância: **modems de fibra**.

---

# PARTE XIX — TECNOLOGIAS DE ACESSO À INTERNET

## 76. Upstream e downstream

### Downstream

Do provedor para o assinante.

```text
ISP ─────────> usuário
   downstream
```

### Upstream

Do assinante para o provedor.

```text
usuário ─────> ISP
      upstream
```

Usuários residenciais geralmente recebem mais dados do que enviam.

---

## 77. Narrowband

Banda estreita.

O material cita tecnologias até aproximadamente **128 kbit/s**.

Exemplos:

- conexão discada;
- modems analógicos;
- alguns serviços ISDN.

---

## 78. Broadband

Banda larga.

Tecnologias citadas:

- DSL;
- cable modem;
- wireless;
- circuitos T1 ou superiores.

---

# PARTE XX — ISDN/RDSI

## 79. Estrutura 2B + D

A ISDN/RDSI apresentada possui:

- 2 canais B;
- 1 canal D.

### Canais B

Cada um com **64 kbit/s**.

Podem transportar:

- voz digital;
- dados;
- vídeo comprimido.

### Canal D

**16 kbit/s** para controle.

### Bonding

Os dois B podem ser combinados:

```text
64 + 64 = 128 kbit/s
```

---

# PARTE XXI — DSL E ADSL

## 80. DSL

DSL = **Digital Subscriber Line**.

Usa a linha do assinante (par de cobre) para comunicação de dados.

Variantes citadas:

- ADSL;
- ADSL2;
- SDSL;
- HDSL;
- VDSL.

---

## 81. ADSL

ADSL = **Asymmetric DSL**.

É assimétrica porque normalmente oferece:

- downstream maior;
- upstream menor.

---

## 82. FDM na ADSL

FDM = **Frequency Division Multiplexing**.

A ADSL divide a faixa de frequências para que telefone e dados usem o mesmo par.

Faixas didáticas do material:

```text
0 ─ 4 kHz      : POTS / voz
4 ─ 26 kHz     : banda de guarda
26 ─ 138 kHz   : upstream
138 ─ 1100 kHz : downstream
```

---

## 83. DMT

DMT = **Discrete Multi Tone**.

A largura de banda é dividida em muitos subcanais/frequências.

O material cita:

- 286 frequências;
- 255 para downstream;
- 31 para upstream;
- parte dos canais de upstream reservada para controle.

Espaçamento citado:

- aproximadamente 4,1325 kHz.

### Característica essencial

ADSL é **adaptativa**.

Os modems:

1. sondam a linha;
2. analisam interferência;
3. avaliam relação sinal/ruído;
4. selecionam frequências;
5. ajustam a modulação.

Se uma frequência tem bom SNR:

- mais bits podem ser codificados.

Se tem SNR ruim:

- menos bits são utilizados.

---

## 84. Taxas ADSL citadas

No material:

- downstream máximo em boas condições: **8,448 Mbit/s**;
- upstream: **640 kbit/s**;
- upstream efetivo para usuário: **576 kbit/s** após canal de controle;
- ADSL2 pode chegar próximo de **20 Mbit/s** em boas condições.

A taxa depende de:

- distância;
- qualidade da linha;
- interferência;
- diâmetro do fio;
- condições elétricas.

---

## 85. Splitter

Splitter = divisor de frequências.

Função:

- separar baixa frequência de voz;
- separar alta frequência de DSL.

É apresentado como **passivo**, sem necessidade de alimentação.

```text
Linha
  |
Splitter
 /     \
POTS   Modem DSL
```

---

# PARTE XXII — CABLE MODEM

## 86. Meio físico

Cable modem utiliza infraestrutura de TV a cabo, principalmente **cabo coaxial**.

Características citadas:

- maior largura de banda que o par telefônico;
- menor suscetibilidade a interferência eletromagnética que o par trançado;
- uso de FDM.

---

## 87. Compartilhamento

Em redes a cabo, assinantes podem compartilhar um canal.

O sistema combina:

- FDM;
- multiplexação estatística.

Cada assinante possui identificação/endereço e o modem aceita as mensagens destinadas a ele.

---

## 88. Taxas de cable modem citadas

Valores teóricos no material:

- downstream: até **52 Mbit/s**;
- upstream: **512 kbit/s**.

Na prática, a taxa por assinante pode ser menor porque a capacidade é compartilhada.

---

## 89. Instalação

Cable modem pode ser ligado diretamente à fiação a cabo existente.

O material contrasta com xDSL, em que splitters podem ser necessários.

---

# PARTE XXIII — HFC E FTTx

## 90. HFC

HFC = **Hybrid Fiber Coax**.

Combina:

- fibra óptica no tronco;
- coaxial na distribuição final.

```text
Provedor
   |
 Fibra
   |
Nó do bairro
   |
 Coaxial
   |
Assinante
```

A fibra é utilizada onde é necessária maior largura de banda.

---

## 91. Trunk e feeder

No material:

- **trunk** = ligação de alta capacidade até a área/bairro;
- **feeder circuit** = ligação até o assinante.

---

## 92. FTTC

Fiber To The Curb.

Fibra vai até próximo do usuário e outro meio completa a ligação.

## 93. FTTB

Fiber To The Building.

Fibra até o edifício.

## 94. FTTH

Fiber To The Home.

Fibra até a residência.

## 95. FTTP

Fiber To The Premises.

Termo genérico que engloba fibra até as instalações, incluindo FTTB e FTTH.

---

# PARTE XXIV — HEAD-END, TAIL-END, CMTS E DOCSIS

## 96. Head-end modem

Modem no lado do provedor.

## 97. Tail-end modem

Modem no lado do assinante.

## 98. CMTS

Cable Modem Termination System.

Conjunto/sistema de modems head-end de uma operadora de cabo.

## 99. DOCSIS

Conjunto de especificações para sistemas de dados sobre cabo.

Define aspectos como:

- formato dos dados;
- mensagens de solicitação de serviço.

---

# PARTE XXV — ACESSO SEM FIO

## 100. Aplicações

Útil quando:

- distâncias impedem ADSL;
- região não possui cabo;
- área rural;
- infraestrutura física é difícil.

Tecnologias citadas:

- 3G;
- 4G;
- WiMAX;
- satélite.

---

# PARTE XXVI — NÚCLEO DA INTERNET E CIRCUITOS ALUGADOS

## 101. Núcleo

O núcleo da Internet exige capacidade muito maior que uma conexão residencial.

Exemplo do material:

```text
5.000 clientes × 2 Mbit/s ≈ 10 Gbit/s
```

---

## 102. Circuitos digitais ponto a ponto

Para alta capacidade e longa distância, empresas e provedores podem alugar circuitos digitais ponto a ponto de operadoras.

O custo depende de:

- capacidade;
- distância.

### Carrier

No contexto de telecomunicações:

- **carrier = operadora/portadora**.

Em questão de prova discutida, a alternativa considerada correta descrevia “circuitos digitais alugados de portadoras”. Tecnicamente, é importante distinguir a operadora do circuito que ela fornece.

---

# PARTE XXVII — DSU, CSU E NIU

## 103. DSU/CSU

Hardware necessário para interface entre computador e circuito digital de companhia telefônica.

### CSU — Channel Service Unit

Funções:

- terminação;
- diagnóstico;
- testes;
- adequação ao circuito.

### DSU — Data Service Unit

Função:

- processar/traduzir os dados entre o formato do circuito da portadora e o formato utilizado pelo computador.

### Questão típica

> Dispositivos necessários para interação de um computador com circuito digital de empresa telefônica: **DSU e CSU**.

---

## 104. Interfaces citadas

- abaixo de 56 kbit/s: RS-232 pode ser utilizada;
- acima de 56 kbit/s: interfaces de maior velocidade, como RS-449 ou V.35.

---

## 105. NIU

NIU = **Network Interface Unit**.

Forma a fronteira/demarcação entre:

- equipamento da operadora;
- equipamento do assinante.

---

# PARTE XXVIII — PADRÕES TELEFÔNICOS DIGITAIS

## 106. T-series

Na América do Norte, padrões usam a letra T.

Exemplos:

| Padrão | Taxa | Canais de voz |
|---|---:|---:|
| T1 | 1,544 Mbit/s | 24 |
| T2 | 6,312 Mbit/s | 96 |
| T3 | 44,736 Mbit/s | 672 |

O T1 é apresentado como muito popular.

---

## 107. E-series

Na Europa:

| Padrão | Taxa | Canais de voz |
|---|---:|---:|
| E1 | 2,048 Mbit/s | 30 |
| E2 | 8,448 Mbit/s | 120 |
| E3 | 34,368 Mbit/s | 480 |

O Japão utiliza uma versão modificada dos padrões T.

---

## 108. Crescimento não linear

A capacidade não aumenta linearmente com o número.

Exemplo:

> T3 tem capacidade muito maior que três vezes T1.

### Questão típica

A afirmação “a capacidade cresce linearmente, T1, T2, T3...” é **incorreta**.

---

# PARTE XXIX — MULTIPLEXAÇÃO E DS

## 109. Multiplexação

Multiplexação permite combinar múltiplos fluxos/canais em uma infraestrutura de maior capacidade.

Exemplo didático:

```text
Canal 1 ─┐
Canal 2 ─┼──> circuito de maior capacidade
Canal 3 ─┘
```

Em questões da disciplina, pode aparecer como:

> um circuito maior carregando vários circuitos/canais menores.

---

## 110. DS standards

DS = Digital Signal Level.

Exemplo:

- DS1 pode multiplexar 24 chamadas telefônicas;
- T1 é um padrão de portadora que opera na taxa correspondente.

O material destaca que, embora haja distinção técnica entre DS e T, no uso comum os termos podem ser misturados.

---

# PARTE XXX — STS, OC E SONET

## 111. STS

STS = **Synchronous Transport Signal**.

Padrões de alta velocidade para circuitos trunk.

Valores citados:

| STS | OC equivalente | Taxa |
|---|---|---:|
| STS-1 | OC-1 | 51,840 Mbit/s |
| STS-3 | OC-3 | 155,520 Mbit/s |
| STS-12 | OC-12 | 622,080 Mbit/s |
| STS-24 | OC-24 | 1.244,160 Mbit/s |
| STS-48 | OC-48 | 2.488,320 Mbit/s |
| STS-192 | OC-192 | 9.953,280 Mbit/s |

---

## 112. OC — Optical Carrier

OC representa padrões de portadoras ópticas.

Diferença conceitual no material:

- STS: referência aos sinais elétricos/interfaces;
- OC: sinais ópticos em fibra.

---

## 113. Sufixo C

Exemplo:

- OC-3;
- OC-3C.

O “C” significa **concatenado**.

Indica um circuito único operando com a capacidade total, sem divisão em subcircuitos por multiplexação inversa.

---

## 114. SONET

SONET = **Synchronous Optical Network**.

Padrão usado principalmente na América do Norte.

Na Europa, o equivalente conceitual citado é **SDH — Synchronous Digital Hierarchy**.

SONET especifica:

- enquadramento;
- multiplexação;
- sincronismo;
- transporte em circuitos de alta capacidade.

### Quadro SONET

No exemplo STS-1:

- 9 linhas;
- 90 colunas;
- 810 bytes;
- duração de quadro relacionada a 125 μs.

### SONET em anel

Pode ser configurada em anel e usar **add/drop mux** para:

- adicionar dados;
- retirar dados;
- manter tráfego;
- auxiliar em reconfiguração diante de falhas.

---

# PARTE XXXI — REDES OTN/DWDM

## 115. OTN

OTN = **Optical Transport Network**.

Funções:

- transporte;
- multiplexação;
- roteamento;
- supervisão;
- gerenciamento;
- correção de erros.

A recomendação destacada é a **ITU-T G.709**.

A OTN é apresentada como evolução de SONET/SDH.

---

## 116. Características da OTN

- rede síncrona/determinística;
- quadros de tamanho fixo;
- taxa de transmissão variável;
- fibra monomodo;
- DWDM;
- arquitetura óptica em camadas;
- gerenciamento ponta a ponta;
- transparência de protocolos;
- FEC;
- OAM;
- reconfiguração dinâmica.

---

## 117. FEC

FEC = **Forward Error Correction**.

Permite:

- detectar erros;
- corrigir erros sem pedir retransmissão.

O material cita código **Reed-Solomon**.

Exemplo:

```text
Dados + redundância → transmissão → correção no destino
```

---

# PARTE XXXII — ARQUITETURA OTN

## 118. Níveis principais

### Nível elétrico — TC

Transmission Convergence.

Camadas:

```text
OPUk → ODUk → OTUk
```

### Nível óptico — OT

Optical Transmission.

Camadas descritas:

```text
OCh → OTM/OMS → OTS
```

---

## 119. OPU

OPU = **Optical Channel Payload Unit**.

Funções:

- receber/adaptar a carga útil do cliente;
- ajustar taxa;
- encapsular sinais de clientes.

---

## 120. ODU

ODU = **Optical Channel Data Unit**.

Funções:

- transporte lógico;
- monitoramento;
- proteção;
- acompanhamento da qualidade;
- funções de TDM.

---

## 121. OTU

OTU = **Optical Channel Transport Unit**.

Funções:

- encapsular ODU;
- monitorar;
- adicionar FEC;
- preparar o envio ao nível óptico.

---

## 122. Fluxo didático OTN

```text
Cliente
  ↓
OPU
  ↓
ODU
  ↓
OTU
  ↓
OCh
  ↓
OMS/OTM
  ↓
OTS
  ↓
Fibra
```

---

# PARTE XXXIII — TAXAS OTN

## 123. OPUk

Taxas citadas:

- k=1: 2,488320 Gbit/s;
- k=2: 9,995277 Gbit/s;
- k=3: 40,150519 Gbit/s.

## 124. ODUk

- k=1: 2,498775 Gbit/s;
- k=2: 10,037274 Gbit/s;
- k=3: 40,319219 Gbit/s.

## 125. OTUk

- k=1: 2,666057 Gbit/s;
- k=2: 10,709225 Gbit/s;
- k=3: 43,018413 Gbit/s.

---

# PARTE XXXIV — QUADRO OTN

## 126. Estrutura

O material apresenta:

- 4 linhas;
- 4080 bytes por linha;
- carga útil: 3808 bytes;
- FEC: 256 bytes.

---

## 127. FAS e MFAS

### FAS

Frame Alignment Signal.

- 6 bytes;
- identifica alinhamento/início-fim do quadro.

### MFAS

Multi-Frame Alignment Signal.

- 1 byte;
- permite extensão de cabeçalhos por múltiplos quadros.

---

## 128. Cabeçalho OTU

Tamanho citado: 7 bytes.

Campos:

### SM

Section Monitoring.

Inclui:

- TTI;
- BIP-8;
- alarmes.

### GCC0

General Communication Channel 0.

Usado para comunicação entre camadas/entidades OTU.

---

## 129. Cabeçalho ODU

Tamanho citado: 14 bytes.

Campos importantes:

- PM — Path Monitoring;
- TCM — Tandem Connection Monitoring.

---

## 130. Cabeçalho OPU

Campos:

- PSI — Payload Structure Identifier;
- justificativa JC/NJO/PJO.

---

## 131. Campos principais do quadro OTUk

Em questão discutida, a resposta foi:

> **FAS, OPUk-OH, ODUk-OH e OTUk-OH.**

Campos como TCM, PM e GCC são subcampos/campos internos dos respectivos overheads.

---

# PARTE XXXV — DWDM

## 132. Conceito

DWDM = **Dense Wavelength Division Multiplexing**.

Permite transmitir múltiplos comprimentos de onda na mesma fibra.

```text
λ1 ─┐
λ2 ─┤
λ3 ─┤──> mesma fibra
λ4 ─┘
```

O material cita:

- até 64 canais;
- possibilidade de até 128 comprimentos de onda.

---

# PARTE XXXVI — CAMADAS ÓPTICAS OTN

## 133. OCh

OCh = **Optical Channel**.

Função:

- transportar o canal óptico fim a fim;
- preservar integridade/qualidade;
- associar o sinal ao comprimento de onda.

Pode envolver transponder.

---

## 134. OMS

OMS = **Optical Multiplex Section**.

Função:

- multiplexar vários OCh em diferentes comprimentos de onda;
- agrupá-los em uma fibra.

### Macete

**OMS = junta lambdas.**

---

## 135. OTS

OTS = **Optical Transmission Section**.

Funções:

- interface física;
- canal de supervisão;
- transportar o sinal multiplexado.

Parâmetros:

- frequência;
- potência;
- relação sinal/ruído.

---

# PARTE XXXVII — QUESTÕES COMPLEMENTARES DE OTN NÃO EXPLICITAMENTE DETALHADAS NO PDF

Esta seção preserva respostas discutidas durante os exercícios, mas deve ser usada com cautela quando o enunciado exigir estritamente “de acordo com o PDF”.

## 136. IrDI x IaDI

Questão discutida:

> Diferença entre IrDI e IaDI.

Resposta adotada no exercício:

- **IrDI:** extensão única;
- **IaDI:** múltiplas extensões ópticas.

Alternativa considerada: **C**.

**Observação:** esse detalhe não está explicado no PDF de OTN fornecido; portanto, em uma nova questão, validar o enunciado antes de responder.

---

## 137. Bufferização em rede totalmente óptica

Questão discutida:

> Dificuldade de realizar buffer óptico.

Resposta adotada:

- separação entre **plano de sinalização e controle óptico** e **plano de dados do usuário**.

Alternativa considerada: **E**.

**Observação:** esse conteúdo não aparece de forma explícita no PDF de OTN enviado.

---

# PARTE XXXVIII — BANCO DE QUESTÕES RESOLVIDAS

## 138. Fibra: custo, laser e material

Afirmações:

- instalação de fibra é muito barata → falsa;
- fibra com laser pode atingir altas taxas e longas distâncias → verdadeira;
- todas as fibras são plásticas → falsa.

**Resposta:** apenas II correta.

---

## 139. Maior distância e velocidade

Pergunta:

> Qual tipo de fibra permite maiores distâncias e velocidades?

**Resposta:** monomodo.

---

## 140. Degrau x gradual

I. Reflexão total com interface núcleo/casca de índice menor.  
II. Índice de refração varia do núcleo para a casca.

**Resposta:** multimodo degrau e multimodo gradual.

---

## 141. Interferências/perdas em fibra

Itens:

- atenuação por emendas/conectores → correto;
- absorção intrínseca → correto;
- interferência eletromagnética → incorreto;
- macrocurvatura → correto;
- microcurvatura → correto.

**Resposta:** I, II, IV e V.

---

## 142. Perda de potência com distância

**Resposta:** atenuação.

---

## 143. Distribuidor óptico

**Resposta:** dispor/disponibilizar as fibras ópticas do cabo.

---

## 144. Conectores por imagem

Questão discutida com patch cord contendo conectores diferentes.

**Resposta:** SC–LC.

---

## 145. Parâmetro óptico — espalhamento

Alternativa correta discutida:

> atenuação por espalhamento ocorre quando o sinal é refletido/desviado em várias direções por irregularidades/partículas internas.

**Resposta:** alternativa C.

---

## 146. Caixa óptica exposta

Cenário com caixa/distribuição em ambiente sujeito a umidade.

**Resposta:** a caixa deveria possuir proteção adequada contra líquidos/agentes externos.

---

## 147. Tela de certificação

Valores observados:

- perda: 0,16 dB;
- limites aproximadamente 1,50/1,51 dB;
- resultado “PASSA”.

**Resposta:** alternativa que reconhecia 0,16 dB nos dois comprimentos de onda e que esse valor era ligeiramente superior a 10% de 1,50 dB, mas ainda muito abaixo do limite.

---

## 148. Topologia ANSI/TIA

**Resposta:** estrela.

---

## 149. ANSI/TIA-568.0-D

**Resposta:** especifica a estrutura do sistema genérico, topologia, desempenho e testes.

---

## 150. Afirmações ANSI/TIA

I. distância máxima do par trançado varia simplesmente conforme a categoria → considerada falsa no exercício;  
II. distância varia conforme cabo/aplicação → verdadeira;  
III. norma define padrões específicos por fabricante → falsa;  
IV. distribuidores fornecem local de administração/reconfiguração/conexão/testes → verdadeira.

**Resposta:** II e IV.

---

## 151. MICE, testes e atenuação

1. MICE inclui fator climático → V;  
2. testes são iguais em todas as categorias → F;  
3. atenuação de fibra deve ser testada → V.

**Resposta:** V – F – V.

---

## 152. Raio de curvatura do par trançado

**Resposta:** 4 vezes o diâmetro.

---

## 153. OTN — característica

Entre as alternativas discutidas, foi escolhida:

**Rede determinística com comutação de circuitos.**

**Observação:** o PDF afirma explicitamente que a OTN é síncrona/determinística; a expressão “comutação de circuitos” apareceu na alternativa da questão, não como frase central do texto.

---

## 154. OTN — níveis TC

**Resposta:** OPUk, ODUk e OTUk.

---

## 155. OTN — quadro OTUk

**Resposta:** FAS, OPUk-OH, ODUk-OH e OTUk-OH.

---

## 156. LAN de longa distância

**Resposta:** modems de fibra.

---

## 157. Dispositivo com buffer

**Resposta conforme material:** concentrador/Hub.

---

## 158. Conectar segmentos LAN

**Resposta:** Bridge.

---

## 159. Switch

**Resposta:** ativo de rede com múltiplas portas, capaz de ligar dispositivos e encaminhar tráfego de forma direcionada.

---

## 160. Hub

**Resposta:** fornece conexão central/concentração para o cabeamento de uma rede e permite interligar segmentos/dispositivos.

---

## 161. Computador x circuito digital da operadora

**Resposta:** DSU + CSU.

---

## 162. Sistemas telefônicos digitais também transportam

**Resposta:** dados.

---

## 163. Carriers

Na questão discutida, a alternativa aceita foi:

> circuitos digitais alugados de portadoras.

Mas tecnicamente:

> carrier é a própria operadora/portadora.

Guardar a diferença para evitar confusão.

---

## 164. Padrões telefônicos — alternativa incorreta

Afirmação incorreta:

> a capacidade cresce linearmente conforme T1, T2, T3.

**Resposta:** E.

---

## 165. Multiplexação

Entre as alternativas discutidas:

> divisão/organização de um circuito maior para transportar vários circuitos/canais menores.

**Resposta:** B.

Conceito mais geral:

> multiplexação combina vários fluxos em um mesmo meio/canal de maior capacidade.

---

# PARTE XXXIX — TABELAS DE MEMORIZAÇÃO RÁPIDA

## 166. Fibra

| Termo | Significado rápido |
|---|---|
| Núcleo | onde a luz trafega |
| Casca | mantém a luz confinada |
| Capa | proteção |
| Monomodo | longa distância, baixa dispersão |
| Multimodo | vários caminhos ópticos |
| Atenuação | perda de potência |
| Dispersão | deformação/alargamento do pulso |
| Retorno | potência refletida à fonte |
| Macrocurvatura | curva grande/fechada demais |
| Microcurvatura | pequena deformação |
| OTDR | testa/localiza eventos na fibra |
| DIO | organiza/disponibiliza fibras |
| SC/LC/ST | conectores ópticos |

---

## 167. Cabeamento estruturado

| Termo | Ideia |
|---|---|
| ANSI/TIA-568.0-D | base genérica |
| Estrela | topologia centralizada |
| UTP | par trançado sem blindagem |
| 90 m | cabeamento horizontal citado |
| 100 m | canal Ethernet citado |
| MICE | ambiente mecânico/ingresso/clima/EM |
| 4× diâmetro | raio mínimo citado para par trançado |
| 25 mm | raio mínimo de fibra citado |
| 110 N | tração citada para cabo de 4 pares |

---

## 168. LAN e equipamentos

| Termo | Função |
|---|---|
| LAN | rede local |
| MAN | metropolitana |
| WAN | longa distância |
| VLAN | separação lógica |
| Bridge | une segmentos |
| Hub | concentrador |
| Switch | encaminhamento por porta/destino |
| Router | encaminha entre redes |
| Modem | interface com tecnologia de acesso |

---

## 169. Acesso à Internet

| Tecnologia | Resumo |
|---|---|
| ADSL | DSL assimétrica |
| DMT | muitos subcanais |
| FDM | divisão por frequência |
| Splitter | separa POTS/DSL |
| Cable modem | dados sobre coaxial |
| HFC | fibra + coaxial |
| FTTC | fibra até perto do usuário |
| FTTB | fibra até edifício |
| FTTH | fibra até casa |
| FTTP | fibra até as instalações |
| CMTS | terminação de cable modems |
| DOCSIS | especificações de dados sobre cabo |

---

## 170. Telefonia digital

| Padrão | Taxa |
|---|---:|
| T1 | 1,544 Mbit/s |
| T2 | 6,312 Mbit/s |
| T3 | 44,736 Mbit/s |
| E1 | 2,048 Mbit/s |
| E2 | 8,448 Mbit/s |
| E3 | 34,368 Mbit/s |
| STS-1 / OC-1 | 51,840 Mbit/s |
| STS-3 / OC-3 | 155,520 Mbit/s |
| STS-12 / OC-12 | 622,080 Mbit/s |
| STS-24 / OC-24 | 1.244,160 Mbit/s |
| STS-48 / OC-48 | 2.488,320 Mbit/s |
| STS-192 / OC-192 | 9.953,280 Mbit/s |

---

## 171. OTN

| Camada | Função resumida |
|---|---|
| OPU | adapta carga útil |
| ODU | monitora/transporta |
| OTU | FEC e transporte |
| OCh | canal óptico |
| OMS | multiplexa lambdas |
| OTS | seção física/supervisão |
| DWDM | vários λ na mesma fibra |
| FEC | correção de erros |
| FAS | alinhamento de quadro |
| PM | monitoramento de caminho |
| TCM | monitoramento de conexões |
| GCC0 | comunicação de gerenciamento |

---

# PARTE XL — MACETES DE PROVA

## 172. Macetes essenciais

### Fibra

- **MONO = um modo → menos dispersão → mais distância.**
- **Atenuação = sinal enfraquece.**
- **Dispersão = pulso se deforma.**
- **Retorno = luz volta.**
- **DIO = distribui/organiza fibra.**
- **OTDR = encontra problema por distância.**

### Cabeamento

- **Estrela = switch no centro.**
- **UTP = barato, mas limitado em distância.**
- **MICE = Mecânico, Ingresso, Climático, Eletromagnético.**
- **Par trançado = curva mínima 4× diâmetro, conforme material.**

### LAN

- **Bridge = ponte entre segmentos.**
- **Switch = várias portas e encaminhamento seletivo.**
- **Hub = concentrador.**

### ADSL

- **Down = download.**
- **Up = upload.**
- **ADSL = assimétrica.**
- **DMT = vários tons/subcanais.**
- **Splitter = separa voz e dados.**

### OTN

- **Elétrico: OPU → ODU → OTU.**
- **Óptico: OCh → OMS/OTM → OTS.**
- **FEC = corrige erro.**
- **DWDM = vários comprimentos de onda na mesma fibra.**

---

# PARTE XLI — GLOSSÁRIO

## 173. Siglas

- **ADSL** — Asymmetric Digital Subscriber Line
- **BIP-8** — mecanismo/código de detecção de erros usado em overhead
- **CMTS** — Cable Modem Termination System
- **CSU** — Channel Service Unit
- **DIO** — Distribuidor Interno/Óptico, conforme contexto de infraestrutura
- **DMT** — Discrete Multi Tone
- **DOCSIS** — Data Over Cable Service Interface Specification
- **DSL** — Digital Subscriber Line
- **DSU** — Data Service Unit
- **DWDM** — Dense Wavelength Division Multiplexing
- **E/O** — Elétrico/Óptico
- **FAS** — Frame Alignment Signal
- **FDM** — Frequency Division Multiplexing
- **FEC** — Forward Error Correction
- **FTTB** — Fiber To The Building
- **FTTC** — Fiber To The Curb
- **FTTH** — Fiber To The Home
- **FTTP** — Fiber To The Premises
- **GCC** — General Communication Channel
- **HFC** — Hybrid Fiber Coax
- **ISDN/RDSI** — Integrated Services Digital Network / Rede Digital de Serviços Integrados
- **LAN** — Local Area Network
- **LC** — Lucent Connector
- **MAN** — Metropolitan Area Network
- **MFAS** — Multi-Frame Alignment Signal
- **NIU** — Network Interface Unit
- **OAM** — Operation, Administration and Management
- **OCh** — Optical Channel
- **OC** — Optical Carrier
- **ODU** — Optical Channel Data Unit
- **OMS** — Optical Multiplex Section
- **OPU** — Optical Channel Payload Unit
- **OTDR** — Optical Time Domain Reflectometer
- **OTN** — Optical Transport Network
- **OTS** — Optical Transmission Section
- **OTU** — Optical Channel Transport Unit
- **PM** — Path Monitoring
- **POTS** — Plain Old Telephone Service
- **PSI** — Payload Structure Identifier
- **RX** — Receiver
- **SC** — Standard Connector
- **SDH** — Synchronous Digital Hierarchy
- **SONET** — Synchronous Optical Network
- **ST** — Straight Tip
- **STS** — Synchronous Transport Signal
- **TC** — Transmission Convergence
- **TCM** — Tandem Connection Monitoring
- **TDM** — Time Division Multiplexing
- **TX** — Transmitter
- **UTP** — Unshielded Twisted Pair
- **VLAN** — Virtual LAN
- **WAN** — Wide Area Network

---

# PARTE XLII — FONTES CONSOLIDADAS

Este arquivo foi montado a partir dos seguintes materiais enviados:

1. **cabeamento estruturado(1).pdf**
   - fundamentos de fibra;
   - refração/reflexão;
   - monomodo/multimodo;
   - atenuação;
   - absorção;
   - macro/microcurvaturas;
   - espalhamento.

2. **cabeamento optico.pdf**
   - componentes do sistema óptico;
   - E/O;
   - distribuidores;
   - caixas de emenda;
   - conectores;
   - parâmetros;
   - instalação;
   - OTDR;
   - certificação.

3. **SISTEMA DE CABEAMENTO ESTRUTURADO.pdf**
   - ANSI/TIA-568.0-D;
   - topologias;
   - UTP;
   - distâncias;
   - MICE;
   - aterramento;
   - curvaturas;
   - testes;
   - requisitos de fibra.

4. **REDES OPYICAS DE TRANSPORTE.pdf**
   - OTN;
   - DWDM;
   - OPU/ODU/OTU;
   - OCh/OMS/OTS;
   - FEC;
   - quadros e overheads.

5. **ENTENDENDO LANS MODEMS.pdf**
   - LAN;
   - topologias;
   - VLAN;
   - bridges;
   - hubs;
   - switches;
   - modems de fibra;
   - LAN/MAN/WAN.

6. **REDES DE COMPUTADORES.pdf**
   - tecnologias de acesso;
   - upstream/downstream;
   - DSL/ADSL/DMT;
   - splitters;
   - cable modem;
   - HFC;
   - FTTx;
   - CMTS/DOCSIS;
   - DSU/CSU/NIU;
   - T/E/DS;
   - STS/OC;
   - SONET.

---

# PARTE XLIII — REGRA FINAL PARA RESOLVER QUESTÕES

Quando uma questão for enviada para a IA:

```text
1. Identificar o assunto.
2. Procurar o conceito nesta base.
3. Comparar cada alternativa com a definição da base.
4. Eliminar alternativas contraditórias.
5. Responder com letra + texto.
6. Explicar em 2–5 linhas.
7. Se houver conflito no material, avisar.
8. Se não houver base suficiente, não inventar.
```

Formato recomendado:

```markdown
✅ **Resposta: C — Monomodo.**

A fibra monomodo possui núcleo menor, menor dispersão e menor atenuação,
o que permite maiores distâncias e altas taxas de transmissão.
```

---

# FIM DA BASE DE CONHECIMENTO

**Tema geral:** Redes de Computadores, Cabeamento Estruturado, Fibra Óptica, LAN, Tecnologias de Acesso, SONET e OTN/DWDM.
