# Camada 8: documento de desenho

## 1. Premissa

Você herda um provedor de internet de cidade pequena, a Fibra Fim de Linha (nome provisório), no dia em que a pessoa anterior foi embora sem deixar senha. Ninguém aparece em cena. O mundo fala com você por:

- **chamados** que chegam num terminal velho ("a internet caiu de novo, mas só quando a geladeira liga");
- **logs e mensagens dos equipamentos**, cada um com personalidade (o switch gerenciável é passivo-agressivo, o roteador de borda é dramático, o modem DOCSIS só responde em caixa alta);
- **etiquetas, post-its e gambiarras** deixados pela pessoa anterior, que explicam o problema e às vezes são o problema;
- **o Reclamômetro**, um painel de QoE da cidade inteira que sobe quando você erra.

Você começa com duas casas ligadas por um cabo mal crimpado e termina operando uma rede de cidade com backbone, CDN própria, BGP com dois provedores de trânsito e um ataque em andamento.

## 2. Pilares

1. **Hiper técnico.** Cada pacote existe e é processado pelo equipamento. Se você esquece o gateway, o ping falha de verdade, e não porque o roteiro mandou falhar.
2. **Didático.** O jogo é para aprender. Antes de cada dia há um manual curto, durante o dia há dicas sob demanda, e depois vem o pós-morte, que explica por que funcionou ou por que caiu.
3. **Humor.** Ácido e brasileiro, nos textos dos equipamentos, dos chamados e dos post-its. A piada nunca troca o conceito por uma informação errada.
4. **Primeira pessoa, com as mãos.** Você crimpa, funde, encaixa, sobe no poste, liga o console e digita.
5. **Sem pessoas.** Só quem joga e os equipamentos. Os textos são neutros quanto ao gênero de quem joga.

## 3. Estrutura: 8 atos, 100 dias

A ordem segue o currículo clássico de redes, de baixo para cima. Cada dia tem uma mecânica diferente da do dia anterior.

| Ato | Tema | Dias | O que se aprende |
|---|---|---|---|
| 0. Sem Senha | Introdução | 1 a 4 | Tipos de rede, camadas, unidades (bit, byte, kbps e KiB), o que é um protocolo |
| 1. O Poste | Física | 5 a 18 | Par trançado e T568A/B, coaxial, fibra (fusão, atenuação, dB), rádio e espectro, Nyquist e Shannon, modulação, telefonia, 4G e 5G, DOCSIS, satélite |
| 2. O Quadro | Enlace | 19 a 30 | Enquadramento, Hamming, CRC, stop-and-wait, janela deslizante, go-back-n, retransmissão seletiva, PPP |
| 3. O Barramento | Subcamada MAC | 31 a 44 | ALOHA, CSMA/CD e recuo exponencial, Ethernet, hub contra switch, tabela MAC, VLAN, spanning tree, Wi-Fi 6 e terminal oculto, Bluetooth |
| 4. A Cidade | Rede | 45 a 64 | IPv4, sub-rede e CIDR, ARP, ICMP, DHCP, roteamento estático, vetor de distância e contagem ao infinito, estado de enlace, NAT, IPv6, BGP, QoS e QoE, MPLS, SDN |
| 5. A Conversa | Transporte | 65 a 76 | UDP, portas, handshake do TCP, janela, controle de congestionamento, perda contra atraso, QUIC, desempenho |
| 6. O Show | Aplicação | 77 a 88 | DNS, e-mail, HTTP, cache, streaming adaptativo, CDN no dia da final do campeonato |
| 7. O Cerco | Segurança | 89 a 100 | Varredura, spoofing, DDoS, firewall, IDS, criptografia simétrica e de chave pública, assinatura, certificados, TLS, VPN, DNSSEC |

O catálogo antigo de 99 dias, feito para a versão 2D, serve de ponto de partida e vai ser refeito para primeira pessoa.

## 4. Ciclo de um dia

1. **Chamado.** O terminal mostra o problema do dia e o objetivo mensurável ("a casa 14 precisa de 50 Mbps sem perda").
2. **Manual de bolso.** Uma página curta com o conceito, um diagrama e um exemplo. Pode ser reaberto a qualquer momento.
3. **Campo.** Você vai até o local em 3D e resolve com as mãos e com o console.
4. **Verificação.** O motor mede de verdade: ping, vazão, perda, convergência, tempo de handshake.
5. **Pós-morte.** O que aconteceu em cada camada, com os pacotes reais da sua tentativa. Se der errado, você pode repetir o dia.

## 5. Mecânicas centrais

- **Óculos de camadas.** Teclas de 1 a 7 trocam a visão: na física você vê o sinal, o ruído e a atenuação no cabo; no enlace, os quadros com MAC; na rede, os pacotes com IP e TTL; no transporte, segmentos com número de sequência.
- **Console dos equipamentos.** Uma CLI própria, inspirada nas de mercado sem copiar nenhuma, com autocompletar no Tab e `?` para ajuda.
- **Captura de pacotes.** Um analisador dentro do jogo, com filtros, que lê o tráfego do próprio motor.
- **Bancada.** Crimpagem, testador de cabo, máquina de fusão, OTDR e analisador de espectro, cada um como minijogo com a regra real.
- **Rede persistente.** O que você monta num dia continua lá nos seguintes. Uma gambiarra do ato 1 volta para cobrar no ato 7.
- **Reclamômetro.** QoE da cidade inteira, como placar e como fonte de humor.

## 6. Arquitetura

```
src/
  motor/        simulador de eventos discretos, sem gráfico, testável em Node
    fisico.ts     enlace físico: banda, atraso, taxa de erro, atenuação
    enlace.ts     quadros, CRC, ARP, switch, VLAN, STP, Wi-Fi
    rede.ts       IPv4/IPv6, tabela de rotas, RIP, OSPF, BGP simplificado, NAT
    transporte.ts UDP, TCP com máquina de estados e janela de congestionamento
    aplicacao.ts  DNS, HTTP, SMTP, streaming, CDN
    seguranca.ts  firewall, IDS, TLS, VPN
    cli.ts        console dos equipamentos
  conteudo/     dias, chamados, manuais, falas dos equipamentos (tipos.ts é o contrato)
  tres/         cena Three.js, primeira pessoa, interação, óculos de camadas
  ui/           terminal, manual, analisador, pós-morte
tests/
  robo.test.ts  robô que resolve os 100 dias só pelo console e confere as métricas
```

O motor vem primeiro e sem gráfico. Só quando o robô resolver os dias do ato 1 é que o mundo 3D é montado em volta.

## 7. Identidade visual

Própria, ligada ao tema: **sala de rack de madrugada.**

- Paleta: preto azulado de sala técnica, verde e âmbar dos LEDs de porta, e as cores do padrão T568B (laranja, verde, azul e marrom) como acentos.
- Tipografia: Saira Condensed nos títulos, Atkinson Hyperlegible no texto (legibilidade para estudar) e Fira Code nos consoles.
- Capa: um patch panel em que os cabos ligados formam a palavra CAMADA 8, com as portas piscando.
- Ambiente: poste, caixa de emenda, armário de rua, sala de rack, data center pequeno. Equipamentos modelados ou CC0, nunca caixas genéricas.
- Trilha sonora CC0/CC-BY: zumbido de ventoinha, ar-condicionado e uma trilha lo-fi.

## 8. Regras de conteúdo

- Todo texto e todo exercício são originais. Nenhum livro, autor ou fabricante é citado no jogo, no README, nos metadados ou nos commits.
- Marcas de equipamento são paródias. Domínios usam `.exemplo`, e IPs públicos usam as faixas de documentação (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24, 2001:db8::/32).
- Nenhum travessão nos textos.

## 9. Fases de construção

1. Motor do ato 0 e do ato 1, CLI e robô, sem 3D.
2. Cena 3D mínima: sala de rack, primeira pessoa, console no equipamento.
3. Óculos de camadas e analisador de pacotes.
4. Atos 2 a 4.
5. Atos 5 a 7.
6. Identidade final, trilha e publicação no Pages.
