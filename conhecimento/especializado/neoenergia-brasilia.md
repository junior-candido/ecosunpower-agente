# Normas Neoenergia Brasilia (DF) - Completo

A Neoenergia Brasilia (antiga CEB Distribuicao) e a concessionaria do DF.

## DIS-NOR-030 - Norma Principal (Fornecimento em Baixa Tensao)

### Objetivo
Estabelece os requisitos tecnicos para fornecimento de energia eletrica em
tensao secundaria de distribuicao (220/380V) a edificacoes individuais.
Aplica-se a instalacoes com carga ate 75 kW.

### Tipos de fornecimento (NAO existe bifasico!)
- **Monofasico**: 1 fase + neutro = 220V
- **Trifasico**: 3 fases + neutro = 220V (fase-neutro) / 380V (fase-fase)
- Em Brasilia NAO existe padrao bifasico para novas ligacoes!
- Padroes bifasicos antigos (epoca CEB) podem ser mantidos

### Tabela de dimensionamento - MONOFASICO (220V)

| Carga (kW) | Demanda (kW) | Disjuntor (A) | Cabo fase (mm2) | Cabo neutro (mm2) | Eletroduto (mm) |
|---|---|---|---|---|---|
| ate 4 | ate 3 | 20A | 6 mm2 | 6 mm2 | 25 mm |
| ate 6 | ate 5 | 30A | 6 mm2 | 6 mm2 | 25 mm |
| ate 8 | ate 7 | 40A | 10 mm2 | 10 mm2 | 32 mm |
| ate 10 | ate 8 | 50A | 10 mm2 | 10 mm2 | 32 mm |

### Tabela de dimensionamento - TRIFASICO (220/380V)

| Carga (kW) | Demanda (kW) | Disjuntor (A) | Cabo fase (mm2) | Cabo neutro (mm2) | Eletroduto (mm) |
|---|---|---|---|---|---|
| ate 15 | ate 10 | 40A | 10 mm2 | 10 mm2 | 32 mm |
| ate 22 | ate 15 | 50A | 10 mm2 | 10 mm2 | 40 mm |
| ate 30 | ate 22 | 63A | 16 mm2 | 16 mm2 | 40 mm |
| ate 40 | ate 30 | 80A | 25 mm2 | 16 mm2 | 50 mm |
| ate 50 | ate 38 | 100A | 35 mm2 | 25 mm2 | 50 mm |
| ate 75 | ate 55 | 125A | 50 mm2 | 35 mm2 | 65 mm |

### Componentes do padrao de entrada
1. **Poste**: concreto ou metalico (altura conforme orientacao)
   - Poste de 6m ou 7m conforme rede local
   - Pode usar poste existente se estiver em boas condicoes
2. **Caixa de medicao**: padrao Neoenergia (policarbonato ou metalica)
   - Monofasica: 1 medidor
   - Trifasica: 1 medidor
   - Altura: 1.20m a 1.80m do piso
3. **Disjuntor geral**: conforme tabela acima
   - Bipolar (monofasico)
   - Tripolar (trifasico)
4. **Condutores**: cobre, isolacao 750V ou 1kV
   - Secao conforme tabela acima
   - Cores: vermelho/preto/branco (fases), azul (neutro), verde (terra)
5. **Eletroduto**: PVC rigido ou metalico
   - Diametro conforme tabela acima
6. **Aterramento**: OBRIGATORIO
   - Haste de cobre cobreada 12mm x 2.40m OU
   - Cantoneira de aco zincado 25x25x5mm x 2.40m
   - Cabo de aterramento: minimo 10 mm2 (cobre)

### Ramal de entrada (do poste ate a caixa de medicao)
- Cabo multiplexado (concessionaria fornece) ou
- Cabos individuais em eletroduto
- Altura minima: 4.5m sobre via publica, 3.5m sobre calcada

### Medicao
- Medidor fornecido pela Neoenergia (apos aprovacao)
- Para solar: medidor BIDIRECIONAL (registra energia injetada e consumida)
- Transformador de corrente (TC) para cargas maiores

### Quando precisa mudar o padrao para instalar solar
ATENCAO: o sistema solar NAO e carga! NAO some corrente do inversor com carga da casa!

Precisa mudar padrao SOMENTE quando:
- A potencia do INVERSOR for MAIOR que a potencia disponivel no padrao atual
  (ex: inversor de 10kW num padrao monofasico de 40A que so suporta 8.8kW)
- A distribuidora exigir no parecer de acesso (raro)
- Caixa de medicao antiga que nao aceita medidor bidirecional
- Sem aterramento (obrigatorio para solar)
- Poste ou cabo em condicoes inadequadas

NAO precisa mudar padrao quando:
- O inversor cabe na potencia disponivel do padrao (maioria dos casos!)
- Ex: inversor 5kW num padrao monofasico 40A (8.8kW disponivel) = OK!

### Custo estimado de adequacao (DF)
| Servico | Custo estimado |
|---|---|
| Troca de disjuntor | R$ 200 - R$ 500 |
| Adequacao simples (caixa + disjuntor + aterramento) | R$ 1.500 - R$ 3.000 |
| Mudanca mono para trifasico | R$ 2.500 - R$ 4.000 |
| Adequacao completa (poste + caixa + cabos) | R$ 3.500 - R$ 6.000 |

---

## NTD 6.09 - Conexao de Geracao Distribuida (Energia Solar)

### Requisitos para conectar sistema solar
- Projeto eletrico assinado por engenheiro (ART/TRT)
- Potencia da ART = potencia dos modulos OU inversores
- Formulario de solicitacao de acesso
- Diagrama unifilar do sistema
- Memorial descritivo
- Certificados INMETRO dos equipamentos (inversores e modulos)
- Medidor bidirecional (Neoenergia fornece apos aprovacao)

### Limites de potencia
- Microgeracao: ate 75 kW — conexao em baixa tensao
- Minigeracao: 75 kW a 5 MW — pode exigir media tensao + transformador
- Acima de 75 kW: pode necessitar estudo de impacto na rede

### Prazos da Neoenergia
| Etapa | Prazo |
|---|---|
| Parecer de acesso (micro ate 10kW) | 15 dias uteis |
| Parecer de acesso (micro 10-75kW) | 30 dias uteis |
| Parecer de acesso (mini) | 60 dias uteis |
| Vistoria | 7 dias uteis |
| Troca de medidor | 7 dias uteis apos aprovacao |

### Requisitos tecnicos dos inversores
- Certificacao INMETRO obrigatoria
- Protecao anti-ilhamento (todos os homologados ja tem)
- Frequencia de operacao: 57.5 a 62 Hz
- Desconexao automatica em falta de energia da rede
- Fator de potencia: 0.92 a 1.00

### Documentos necessarios
1. Requerimento de acesso preenchido
2. ART ou TRT do responsavel tecnico
3. Projeto eletrico com diagrama unifilar
4. Memorial descritivo dos equipamentos
5. Datasheet dos modulos e inversores
6. Certificados INMETRO
7. Comprovante de titularidade da UC (conta de luz recente)

---

## DIS-NOR-031 - Conexao de Microgeradores (ate 75 kW)
Norma especifica para microgeradores conectados em baixa tensao.
- Inversores devem ter certificacao INMETRO
- Protecao anti-ilhamento obrigatoria
- Desconexao automatica em falta de rede

## DIS-NOR-033 - Conexao de Minigeracao em Paralelo
Para sistemas de 75 kW a 5 MW em media tensao.
- Exige estudo de impacto na rede
- Pode necessitar transformador proprio
- Protecao mais complexa (reles, seccionadoras)

---

## Sobre Transformador (DF)

### Quando precisa
- Sistemas acima de 75 kW
- Redes sobrecarregadas (Neoenergia define no parecer)
- Consumidores Grupo A (ja possuem)

### Potencias padrao
75, 112.5, 150, 225, 300, 500, 750, 1000 kVA

### Custo estimado
| Item | Custo |
|---|---|
| Transformador (equipamento) | R$ 15.000 - R$ 80.000 |
| Instalacao + obras civis | R$ 10.000 - R$ 30.000 |
| Total | R$ 25.000 - R$ 130.000 |

---

## Processo completo de instalacao solar em Brasilia

1. Ecosunpower faz visita tecnica gratuita
2. Engenheiro Junior dimensiona o sistema e verifica padrao de entrada
3. Se precisa adequar padrao: inclui no orcamento
4. Elabora projeto eletrico com ART
5. Solicita acesso na Neoenergia
6. Neoenergia emite parecer (15-30 dias)
7. Ecosunpower instala o sistema
8. Solicita vistoria da Neoenergia
9. Neoenergia vistoria, aprova e troca o medidor para bidirecional
10. Sistema comeca a gerar e compensar creditos!

O cliente NAO precisa ir a Neoenergia — a Ecosunpower cuida de TUDO!
