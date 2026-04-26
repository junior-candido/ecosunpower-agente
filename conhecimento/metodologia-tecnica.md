# Metodologia Técnica Avançada - Dimensionamento e Atendimento

Conteúdo de referência técnica para a Eva atuar como especialista em energia
solar. Complementa o arquivo dimensionamento.md (que cobre oversize e limites
de inversor).

---

## 1. Lógica de dimensionamento de sistemas fotovoltaicos

O dimensionamento sempre parte do consumo do cliente.

### Etapas fundamentais
- Levantar consumo médio mensal (kWh/mês)
- Identificar padrão de ligação (monofásico, bifásico, trifásico)
- Considerar taxa mínima da concessionária
- Avaliar irradiação solar da região
- **Aplicar SEMPRE 20% de perdas totais no dimensionamento (fator 0.80)**
  — padrão Ecosunpower: contempla perdas de cabos, inversor, temperatura,
  sujeira, mismatch, disponibilidade e envelhecimento.

### Fórmula base

Potência do sistema (kWp) = Consumo mensal (kWh) / (HSP x 30 x 0.80)

Onde:
- HSP = horas de sol pleno (Brasília/Goiás ~5.2)
- 0.80 = fator de performance padrão Ecosunpower (20% de perdas)

---

## 2. Estimativa de geração

Geração mensal (kWh/mês) = Potência (kWp) x HSP x 30 x 0.80

### Exemplo prático (padrão 20% de perdas)
- Cliente consome 600 kWh/mês, HSP = 5.0
- Sistema estimado: 600 / (5.0 x 30 x 0.80) = **5 kWp**

---

## 3. Fatores críticos no projeto (estilo PV*Sol)

- Inclinação do telhado (ideal próxima da latitude local)
- Orientação (norte é melhor no Brasil)
- Sombreamento parcial ou total
- Tipo de telha (cerâmica, metálica, fibrocimento)
- Área disponível
- Distância até o inversor
- Quedas de tensão
- Temperatura (impacto na eficiência dos módulos)

---

## 4. Tipos de sistema e aplicação

### On-grid
- Conectado à rede
- Sem bateria
- Foco em economia da conta

### Híbrido
- Com baterias
- Backup em falta de energia
- Maior complexidade e custo

### Off-grid
- Totalmente isolado
- Dimensionamento de autonomia
- Uso comum em áreas rurais sem rede

---

## 5. Dimensionamento de baterias (básico)

Capacidade (kWh) = Consumo diário x dias de autonomia / profundidade de descarga

### Exemplo
- Consumo diário: 10 kWh
- Autonomia: 1 dia
- DoD: 80%
- Capacidade = 10 / 0.8 = **12.5 kWh**

---

## 6. Respostas padrão para dúvidas frequentes

### "Vai zerar minha conta?"
Não zera 100% porque sempre fica um valor mínimo mensal da distribuidora
(custo de disponibilidade OU Fio B — o maior dos dois, não somados).
Redução real: 90-95% da conta.

### "Funciona à noite?"
Sistemas on-grid não funcionam à noite. Para isso, é necessário sistema
com bateria.

### "E quando falta energia?"
Sistema on-grid desliga por segurança (anti-ilhamento obrigatório). Para
ter energia em quedas, precisa de sistema híbrido com backup.

### "Quanto tempo dura?"
- Módulos: 25+ anos
- Inversores: 8 a 15 anos

### "Qual o retorno do investimento?"
Payback médio entre 3 a 6 anos, dependendo do consumo e tarifa.

---

## 7. Erros comuns a evitar

- Subdimensionar o sistema
- Ignorar sombreamento
- Não considerar taxa mínima da distribuidora
- Instalação mal posicionada (orientação/inclinação ruim)
- Falta de análise estrutural do telhado
- Não prever expansão futura

---

## 8. Argumentação técnica para vendas

A Eva deve reforçar (quando pertinente na conversa):
- Economia a longo prazo
- Proteção contra aumento de tarifa
- Valorização do imóvel
- Sustentabilidade
- Independência energética

---

## 9. Boas práticas de engenharia aplicadas pela Ecosunpower

- Equipamentos homologados pelo INMETRO
- Conformidade com NBR 16690 e NBR 5410
- Aterramento correto
- Dimensionamento adequado de cabos
- Proteção contra surtos (DPS)
- Organização e padrão na instalação

---

## 10. Comportamento esperado do agente

- Responder com clareza, sem complicar
- Traduzir termos técnicos para linguagem simples quando necessário
- Demonstrar domínio técnico sem ser arrogante
- Focar sempre na solução do cliente
- Evitar respostas genéricas

---

Este conhecimento deve ser usado para responder dúvidas, dimensionar sistemas
e orientar clientes com precisão, sempre alinhado à realidade técnica e às
boas práticas do setor fotovoltaico.
