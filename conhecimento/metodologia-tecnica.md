# Metodologia Tecnica Avancada - Dimensionamento e Atendimento

Conteudo de referencia tecnica para a Eva atuar como especialista em energia
solar. Complementa o arquivo dimensionamento.md (que cobre oversize e limites
de inversor).

---

## 1. Logica de dimensionamento de sistemas fotovoltaicos

O dimensionamento sempre parte do consumo do cliente.

### Etapas fundamentais
- Levantar consumo medio mensal (kWh/mes)
- Identificar padrao de ligacao (monofasico, bifasico, trifasico)
- Considerar taxa minima da concessionaria
- Avaliar irradiacao solar da regiao
- Aplicar perdas do sistema (15% a 25%)

### Formula base

Potencia do sistema (kWp) = Consumo mensal (kWh) / (HSP x 30 x eficiencia)

Onde:
- HSP = horas de sol pleno (media da regiao, Brasilia/Goias ~5.2)
- eficiencia do sistema = 0.75 a 0.85

---

## 2. Estimativa de geracao

Geracao mensal (kWh/mes) = Potencia (kWp) x HSP x 30 x eficiencia

### Exemplo pratico
- Cliente consome 600 kWh/mes
- Sistema estimado: 600 / (5 x 30 x 0.8) = **5 kWp**

---

## 3. Fatores criticos no projeto (estilo PV*Sol)

- Inclinacao do telhado (ideal proxima da latitude local)
- Orientacao (norte e melhor no Brasil)
- Sombreamento parcial ou total
- Tipo de telha (ceramica, metalica, fibrocimento)
- Area disponivel
- Distancia ate o inversor
- Quedas de tensao
- Temperatura (impacto na eficiencia dos modulos)

---

## 4. Tipos de sistema e aplicacao

### On-grid
- Conectado a rede
- Sem bateria
- Foco em economia da conta

### Hibrido
- Com baterias
- Backup em falta de energia
- Maior complexidade e custo

### Off-grid
- Totalmente isolado
- Dimensionamento de autonomia
- Uso comum em areas rurais sem rede

---

## 5. Dimensionamento de baterias (basico)

Capacidade (kWh) = Consumo diario x dias de autonomia / profundidade de descarga

### Exemplo
- Consumo diario: 10 kWh
- Autonomia: 1 dia
- DoD: 80%
- Capacidade = 10 / 0.8 = **12.5 kWh**

---

## 6. Respostas padrao para duvidas frequentes

### "Vai zerar minha conta?"
Nao zera totalmente por causa da taxa minima da concessionaria, mas reduz
ate 90-95%.

### "Funciona a noite?"
Sistemas on-grid nao funcionam a noite. Para isso, e necessario sistema
com bateria.

### "E quando falta energia?"
Sistema on-grid desliga por seguranca (anti-ilhamento obrigatorio). Para
ter energia em quedas, precisa de sistema hibrido com backup.

### "Quanto tempo dura?"
- Modulos: 25+ anos
- Inversores: 8 a 15 anos

### "Qual o retorno do investimento?"
Payback medio entre 3 a 6 anos, dependendo do consumo e tarifa.

---

## 7. Erros comuns a evitar

- Subdimensionar o sistema
- Ignorar sombreamento
- Nao considerar taxa minima da distribuidora
- Instalacao mal posicionada (orientacao/inclinacao ruim)
- Falta de analise estrutural do telhado
- Nao prever expansao futura

---

## 8. Argumentacao tecnica para vendas

A Eva deve reforcar (quando pertinente na conversa):
- Economia a longo prazo
- Protecao contra aumento de tarifa
- Valorizacao do imovel
- Sustentabilidade
- Independencia energetica

---

## 9. Boas praticas de engenharia aplicadas pela Ecosunpower

- Equipamentos homologados pelo INMETRO
- Conformidade com NBR 16690 e NBR 5410
- Aterramento correto
- Dimensionamento adequado de cabos
- Protecao contra surtos (DPS)
- Organizacao e padrao na instalacao

---

## 10. Comportamento esperado do agente

- Responder com clareza, sem complicar
- Traduzir termos tecnicos para linguagem simples quando necessario
- Demonstrar dominio tecnico sem ser arrogante
- Focar sempre na solucao do cliente
- Evitar respostas genericas

---

Este conhecimento deve ser usado para responder duvidas, dimensionar sistemas
e orientar clientes com precisao, sempre alinhado a realidade tecnica e as
boas praticas do setor fotovoltaico.
