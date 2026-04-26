# Normas Equatorial Goias - Completo

A Equatorial Energia Goias (antiga CELG/Enel Goias) e a concessionaria de GO.

## NT.001 - Norma Principal (Fornecimento em Baixa Tensao)

### Objetivo
Estabelece requisitos tecnicos para fornecimento de energia eletrica em
baixa tensao (220/380V) a unidades consumidoras individuais ou multiplas
com medicao individualizada. Aplica-se a cargas ate 75 kW.

### Tipos de fornecimento
- **Monofasico**: 1 fase + neutro = 220V (ate 12 kW)
  - Inclui o antigo "bifasico" (2 fases + neutro = 220V entre fases)
  - Pela norma Equatorial, ambos sao classificados como MONOFASICO
- **Trifasico**: 3 fases + neutro = 380/220V (12 a 75 kW)

**IMPORTANTE sobre "bifasico" em Goias:**
O que popularmente se chama "bifasico" em GO e um fornecimento monofasico
com 2 fios de fase e 1 neutro (220V entre as fases). Pela classificacao
oficial da Equatorial, NAO existe categoria "bifasico" — e monofasico.

### Tabela de dimensionamento - MONOFASICO (220V)

| Carga (kW) | Demanda (kW) | Disjuntor (A) | Cabo fase (mm2) | Cabo neutro (mm2) | Eletroduto (mm) |
|---|---|---|---|---|---|
| ate 4 | ate 3 | 20A | 6 mm2 | 6 mm2 | 25 mm |
| ate 6 | ate 4.5 | 30A | 6 mm2 | 6 mm2 | 25 mm |
| ate 8 | ate 6 | 40A | 10 mm2 | 10 mm2 | 32 mm |
| ate 10 | ate 7.5 | 40A | 10 mm2 | 10 mm2 | 32 mm |
| ate 12 | ate 9 | 50A | 10 mm2 | 10 mm2 | 32 mm |

### Tabela de dimensionamento - TRIFASICO (380/220V)

| Carga (kW) | Demanda (kW) | Disjuntor (A) | Cabo fase (mm2) | Cabo neutro (mm2) | Eletroduto (mm) |
|---|---|---|---|---|---|
| ate 15 | ate 10 | 40A | 10 mm2 | 10 mm2 | 32 mm |
| ate 22 | ate 15 | 50A | 10 mm2 | 10 mm2 | 40 mm |
| ate 30 | ate 22 | 63A | 16 mm2 | 16 mm2 | 40 mm |
| ate 40 | ate 30 | 80A | 25 mm2 | 16 mm2 | 50 mm |
| ate 50 | ate 38 | 100A | 35 mm2 | 25 mm2 | 50 mm |
| ate 75 | ate 55 | 125A | 50 mm2 | 35 mm2 | 65 mm |

### Trifasico por opcao do consumidor
Segundo o item 6.2.2.2 da NT.001: mesmo que a carga seja inferior a 12 kW,
o consumidor pode solicitar fornecimento trifasico. Neste caso, o cliente
assume o custo da diferenca do medidor e materiais adicionais.
Util quando: o cliente quer instalar solar com inversor trifasico.

### Componentes do padrao de entrada
1. **Poste**: concreto (DT ou circular)
   - Altura: 6m ou 7m conforme rede
   - Pode usar poste existente se em boas condicoes
2. **Caixa de medicao**: padrao Equatorial (policarbonato)
   - Monofasica ou trifasica
   - Altura: 1.20m a 1.80m do piso (centro da caixa)
   - Deve ficar na fachada, acessivel ao leiturista
3. **Disjuntor geral**: conforme tabela
   - Bipolar (monofasico) ou tripolar (trifasico)
   - Curva C padrao
4. **Condutores**: cobre com isolacao 750V ou 1kV
   - Secao conforme tabela
   - Cores padrao: vermelho/preto/branco (fases), azul (neutro), verde/amarelo (terra)
5. **Eletroduto**: PVC rigido
   - Diametro conforme tabela
6. **Aterramento**: OBRIGATORIO
   - Haste cobreada 12mm x 2.40m (minimo 1 haste)
   - Cabo de aterramento: minimo 10 mm2 (cobre)
   - Resistencia maxima de aterramento: 20 ohms

### Ramal de entrada
- Do poste ate a caixa de medicao
- Cabo multiplexado (fornecido pela Equatorial) ou
- Cabos individuais em eletroduto
- Altura minima: 4.5m sobre via publica, 3.0m sobre calcada

---

## NT.020 - Conexao de Micro e Minigeracao Distribuida (Energia Solar)

### Requisitos para conectar sistema solar em Goias
- Projeto eletrico assinado por engenheiro (ART ou TRT)
- Formulario de solicitacao de acesso (via portal online Equatorial)
- Diagrama unifilar do sistema fotovoltaico
- Memorial descritivo dos equipamentos
- Datasheet dos modulos (paineis) e inversores
- Certificados INMETRO dos inversores
- Comprovante de titularidade da UC (conta de luz)
- Medidor bidirecional (Equatorial fornece apos aprovacao)

### Classificacao
- Microgeracao: ate 75 kW
- Minigeracao: 75 kW a 5 MW

### Prazos da Equatorial Goias
| Etapa | Prazo |
|---|---|
| Parecer de acesso (micro ate 10kW) | 15 dias uteis |
| Parecer de acesso (micro 10-75kW) | 30 dias uteis |
| Parecer de acesso (mini) | 60 dias uteis |
| Vistoria | 7 dias uteis |
| Troca de medidor | 7 dias uteis apos aprovacao |

### Requisitos tecnicos
- Inversores com protecao anti-ilhamento (obrigatorio)
- Frequencia de operacao: 57.5 a 62 Hz
- Desconexao automatica em caso de falta de energia
- Fator de potencia: 0.92 a 1.00
- Maquinas sincronas devem suportar variacao de frequencia de ate 1.0 Hz/s

### Documentos para solicitacao de acesso
1. Requerimento de acesso (formulario Equatorial)
2. ART/TRT do responsavel tecnico
3. Projeto eletrico com diagrama unifilar
4. Memorial descritivo
5. Datasheet modulos e inversores
6. Certificados INMETRO
7. Comprovante de titularidade (conta de luz)

---

## NT.009 - Conexao de Geradores Particulares
Norma para conexao de geradores de qualquer tipo ao sistema da Equatorial.
Base para a NT.020 (mais especifica para solar).

## NT.002 - Fornecimento em Media Tensao
Para consumidores Grupo A (13.8kV):
- Transformador proprio obrigatorio
- Cabine de medicao e protecao
- Sistemas solares acima de 75 kW podem exigir

---

## Sobre Transformador (GO)

### Quando precisa
- Sistemas acima de 75 kW (minigeracao)
- Redes sobrecarregadas (Equatorial define no parecer)
- Consumidores Grupo A ja possuem

### Potencias padrao
75, 112.5, 150, 225, 300, 500, 750, 1000 kVA

### Custo estimado
| Item | Custo |
|---|---|
| Transformador (equipamento) | R$ 15.000 - R$ 80.000 |
| Instalacao + obras civis | R$ 10.000 - R$ 30.000 |
| Total | R$ 25.000 - R$ 130.000 |

---

## Adequacao de padrao para instalar solar (GO)

### Quando precisa adequar
ATENCAO: o sistema solar NAO e carga! NAO some corrente do inversor com carga!

Precisa adequar SOMENTE quando:
1. Potencia do INVERSOR e MAIOR que potencia disponivel no padrao
   (ex: inversor 15kW num padrao monofasico de 50A que suporta 11kW)
2. Distribuidora exigir no parecer de acesso
3. Padrao antigo (ex-CELG) fora do modelo Equatorial
4. Sem aterramento -> instalar
5. Caixa de medicao antiga -> trocar
6. Poste inadequado ou cabo subdimensionado

NAO precisa adequar quando:
- Inversor cabe na potencia disponivel do padrao (maioria dos casos!)
- Ex: inversor 8kW num padrao monofasico 50A (11kW disponivel) = OK!

### Custo estimado de adequacao (GO)
| Servico | Custo estimado |
|---|---|
| Troca de disjuntor | R$ 200 - R$ 500 |
| Adequacao simples (caixa + disjuntor + aterramento) | R$ 1.500 - R$ 3.000 |
| Mudanca mono para trifasico | R$ 2.000 - R$ 4.000 |
| Adequacao completa (poste + caixa + cabos) | R$ 3.000 - R$ 6.000 |

### Exemplo pratico
Cliente em Goiania, padrao monofasico 50A (220V) = ~11kW disponivel
Quer sistema de 8 kWp com inversor de 8kW:
- Inversor 8kW < 11kW disponivel no padrao → NAO precisa mudar!
- O solar NAO e carga — nao soma com a carga da casa
- O padrao atual suporta o inversor normalmente

Outro exemplo: padrao monofasico 40A (220V) = ~8.8kW disponivel
Quer sistema de 10 kWp com inversor de 10kW:
- Inversor 10kW > 8.8kW disponivel → PODE precisar adequar para trifasico
- Custo: ~R$ 2.500 - R$ 4.000

---

## Processo completo de instalacao solar em Goias

1. Ecosunpower faz visita tecnica gratuita
2. Engenheiro Junior dimensiona sistema e verifica padrao
3. Se precisa adequar padrao: inclui no orcamento
4. Elabora projeto eletrico com ART
5. Solicita acesso na Equatorial (portal online)
6. Equatorial emite parecer (15-60 dias)
7. Ecosunpower instala o sistema
8. Solicita vistoria da Equatorial
9. Equatorial vistoria e troca medidor para bidirecional
10. Sistema comeca a gerar e compensar creditos!

O cliente NAO precisa ir a Equatorial — a Ecosunpower cuida de TUDO!

---

## Comparativo Neoenergia-DF x Equatorial-GO

| Aspecto | Neoenergia (Brasilia) | Equatorial (Goias) |
|---|---|---|
| Norma principal | DIS-NOR-030 | NT.001 |
| Norma solar | NTD 6.09 / DIS-NOR-031 | NT.020 |
| Fases | Mono e tri (SEM bifasico) | Mono e tri (SEM bifasico) |
| "Bifasico" | NAO existe | E monofasico 2F+N |
| Tensao mono | 220V (1F+N) | 220V (1F+N ou 2F+N) |
| Tensao tri | 220/380V (3F+N) | 220/380V (3F+N) |
| Limite mono | ~10 kW | 12 kW |
| Tri por opcao | Verificar viabilidade | Sim (cliente paga diferenca) |
| Prazo parecer | 15-30 dias | 15-60 dias |
| Medidor | Bidirecional fornecido | Bidirecional fornecido |

## O que a Eva deve dizer sobre padrao de entrada
- Se DF: "A Neoenergia trabalha com monofasico ou trifasico. O engenheiro Junior verifica seu padrao na visita tecnica e, se precisar adequar, ja inclui no orcamento."
- Se GO: "A Equatorial trabalha com monofasico (ate 12kW) ou trifasico. Se seu sistema precisar de mais potencia, a gente cuida da mudanca de padrao pra voce."
- Sobre bifasico: explicar conforme a distribuidora do cliente
- Sempre: "A Ecosunpower cuida de toda a burocracia — voce nao precisa se preocupar com isso!"
