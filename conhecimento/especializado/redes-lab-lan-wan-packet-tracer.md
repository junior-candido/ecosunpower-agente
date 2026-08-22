# Redes na prática — laboratório LAN–WAN (Cisco Packet Tracer)

Resumo prático de um laboratório de rede montado e validado pela EcoSunPower (22/08/2026): 3 computadores ligados a um switch, um roteador de borda do cliente (CPE) e um roteador da operadora (PE) interligados por enlace serial. Serve de base para entender redes locais em casas, empresas e usinas solares (monitoramento de inversores, câmeras, interfonia, Wi-Fi).

## Topologia usada

```
PC1 (192.168.10.10) ─┐
PC2 (192.168.10.11) ─┼─ SW1 (switch 2960) ─ CPE1 (roteador 2911) ═══ serial ═══ PE1 (roteador 2911)
PC3 (192.168.10.12) ─┘       LAN 192.168.10.0/24    WAN 172.16.19.0/30
```

- **LAN** 192.168.10.0/24 (máscara 255.255.255.0): até 254 equipamentos. Gateway = 192.168.10.1 (interface G0/0 do CPE1).
- **WAN** 172.16.19.0/30 (máscara 255.255.255.252): só 2 endereços úteis (.1 e .2) — o tamanho certo para um enlace ponto a ponto.
- Cabos: par trançado direto (PC→switch, switch→roteador) e serial DCE/DTE entre roteadores. O lado **DCE** fornece o relógio (`clock rate`).

## Conceitos que o lab comprova

- **Switch** trabalha na camada 2: entrega quadros pelo endereço MAC, só para a porta de destino. PCs na mesma rede conversam sem passar pelo roteador (ping entre PCs responde com TTL 128).
- **Roteador** trabalha na camada 3: decide pelo IP e pela tabela de roteamento. Ping ao gateway responde com TTL 255; ping ao roteador remoto, TTL 254 (passou por 1 salto).
- **Gateway padrão**: todo pacote para fora da rede local vai para ele. Sem gateway configurado no PC, nada sai da LAN.
- **Rota de retorno**: não basta o pacote chegar — o destino precisa saber voltar. O PE1 só respondeu ao ping depois de `ip route 192.168.10.0 255.255.255.0 172.16.19.1`. Esse é o erro mais comum em redes com mais de um roteador.
- **tracert/traceroute** mostra o caminho salto a salto (aqui: 192.168.10.1 → 172.16.19.2).

## Configuração dos roteadores (Cisco IOS)

```
CPE1
configure terminal
 no ip domain-lookup
 hostname CPE1
 interface GigabitEthernet0/0
  ip address 192.168.10.1 255.255.255.0
  no shutdown
 interface Serial0/3/0
  ip address 172.16.19.1 255.255.255.252
  clock rate 64000        ! só no lado DCE
  no shutdown
end
copy running-config startup-config

PE1
configure terminal
 no ip domain-lookup
 hostname PE1
 interface Serial0/3/0
  ip address 172.16.19.2 255.255.255.252
  no shutdown
 ip route 192.168.10.0 255.255.255.0 172.16.19.1   ! rota estática de retorno
end
copy running-config startup-config
```

Conferência: `show ip interface brief` (interfaces devem estar up/up) e `show ip route` (no PE1 aparece `S 192.168.10.0/24 via 172.16.19.1`).

## Testes e resultados obtidos

| Teste | Comando (no PC1) | Resultado |
|---|---|---|
| PC → gateway | `ping 192.168.10.1` | 4/4, 0% perda, TTL 255 |
| PC → PC | `ping 192.168.10.11` | 4/4, 0% perda, TTL 128 |
| PC → roteador remoto | `ping 172.16.19.2` | 4/4, 0% perda, TTL 254 |
| Caminho | `tracert 172.16.19.2` | 2 saltos: 192.168.10.1 → 172.16.19.2 |

## Problemas reais encontrados e como resolver

1. **Roteador sem porta serial**: o 2911 precisa do módulo HWIC-2T, inserido com o equipamento desligado. O nome da interface segue o slot (módulo no slot 3 → Serial0/3/0).
2. **Serial down/down com tudo configurado**: `show controllers Serial0/3/0` mostrou "No serial cable attached" — o cabo tinha sido ligado com o roteador desligado. Remover e reconectar com os dois ligados resolveu.
3. **Console travado em "Translating ..."**: um comando errado vira consulta DNS. Sai com Ctrl+Shift+6; evita-se com `no ip domain-lookup`.
4. **Ping falha só para a rede remota**: faltava a rota de retorno no roteador de destino.
5. **Primeiro pacote perdido** no primeiro ping a um destino novo: é a resolução ARP. Repetindo o comando, 0% de perda.

## Onde isso aparece na EcoSunPower

- **Monitoramento de inversores** (GoodWe, Sungrow, Hoymiles, Deye…): o inversor/datalogger precisa de IP, máscara, gateway e DNS corretos na rede do cliente; se fica "offline", os mesmos testes valem — ping do celular/PC para o inversor, ping para o gateway, conferir se está na mesma sub-rede.
- **Rede separada para câmeras/interfonia (CFTV, IP77)**: switch + roteador com sub-rede própria e rota entre as redes — exatamente o desenho do lab.
- **Usinas em sítios/chácaras com link de rádio ou 4G**: o roteador da operadora (PE) é o "lado de fora"; nossa rede fica atrás do CPE. Sem rota/NAT correto, o portal de monitoramento não recebe dados.
- **Diagnóstico rápido no campo**: `ipconfig` (IP/gateway), `ping <gateway>`, `ping 8.8.8.8`, `tracert <destino>`. Se o gateway responde e a internet não, o problema é do roteador/operadora; se nem o gateway responde, é cabo, switch ou configuração de IP.

Referências: Forouzan, Comunicação de Dados e Redes de Computadores, 4. ed.; Kurose & Ross, Redes de Computadores e a Internet, 8. ed.; Cisco Networking Academy — Packet Tracer.
