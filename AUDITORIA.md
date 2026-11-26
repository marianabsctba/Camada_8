# Auditoria de cobertura do currículo

Cada subseção do currículo de referência (8 capítulos) e o dia do jogo que a ensina. A ordem oficial dos dias está em `src/conteudo/curriculo.ts`.

Legenda: **287 subseções**: 278 com dia pronto, 9 resumos de capítulo. 181 subseções dividem o dia com outras. Os atos 0 a 7 (capítulos 1 a 8) estão completos.

## Correções feitas nesta auditoria

- **Sem senha** (recuperar a senha do roteador pelo console) estava na subseção 1.8.3, que trata segurança como questão social. Virou o **prólogo** do jogo (dia 0): a chegada ao galpão com o roteador trancado. A 1.8.3 a 1.8.5 ganhou um dia próprio.
- **Canal lotado** (canais do Wi-Fi em 2,4 GHz) estava na 2.2.1, que é o espectro eletromagnético em geral. Foi para a 4.4.1 e 4.4.2 (camada física do Wi-Fi), onde o assunto mora. A 2.2.1 ganhou um dia próprio.
- **PPP no último quilômetro** cobria só a 3.5.1. A 3.5.2 e 3.5.3 (o enlace do ADSL e do cabo) ganharam um dia próprio.
- **Duas casas, um cabo** continua na 1.3.1 a 1.3.3: a aula ensina rede pessoal, local e doméstica, e a prática mostra o que define uma rede local (hosts que falam direto, sem roteador). Fica registrado que a prática adianta o endereçamento IP, aprofundado depois em 5.7.2.
- Os dias de par trançado e de OTDR ensinam a seção e vão além dela com prática de campo (crimpagem, MDI-X, limite de 100 m, ruído, fusão). Isso é acréscimo, não troca de conteúdo.

## Ainda falta

- Reforçar a arquitetura do 802.11 (4.4.1) no dia Canal lotado.
- Subseções agrupadas podem ganhar um dia só delas quando o conteúdo pedir.

## Capítulo 1

| Subseção | Dia | Situação |
|---|---|---|
| 1.1.1 | 1: Para que serve uma rede | pronta e fiel, agrupada |
| 1.1.2 | 1: Para que serve uma rede | pronta e fiel, agrupada |
| 1.1.3 | 1: Para que serve uma rede | pronta e fiel, agrupada |
| 1.1.4 | 1: Para que serve uma rede | pronta e fiel, agrupada |
| 1.1.5 | 1: Para que serve uma rede | pronta e fiel, agrupada |
| 1.2.1 | 2: Tipos de rede | pronta e fiel, agrupada |
| 1.2.2 | 2: Tipos de rede | pronta e fiel, agrupada |
| 1.2.3 | 2: Tipos de rede | pronta e fiel, agrupada |
| 1.2.4 | 2: Tipos de rede | pronta e fiel, agrupada |
| 1.2.5 | 2: Tipos de rede | pronta e fiel, agrupada |
| 1.3.1 | 3: Duas casas, um cabo | pronta e fiel (a prática adianta endereço IP), agrupada |
| 1.3.2 | 3: Duas casas, um cabo | pronta e fiel (a prática adianta endereço IP), agrupada |
| 1.3.3 | 3: Duas casas, um cabo | pronta e fiel (a prática adianta endereço IP), agrupada |
| 1.3.4 | 4: Do bairro ao mundo | pronta e fiel, agrupada |
| 1.3.5 | 4: Do bairro ao mundo | pronta e fiel, agrupada |
| 1.3.6 | 4: Do bairro ao mundo | pronta e fiel, agrupada |
| 1.4.1 | 5: Como a Internet é montada | pronta e fiel |
| 1.4.2 | 6: Celular e Wi-Fi | pronta e fiel |
| 1.4.3 | 6: Celular e Wi-Fi | pronta e fiel |
| 1.5.1 | 7: Camadas de protocolos | pronta e fiel |
| 1.5.2 | 7: Camadas de protocolos | pronta e fiel |
| 1.5.3 | 8: Conexões e serviços | pronta e fiel, agrupada |
| 1.5.4 | 8: Conexões e serviços | pronta e fiel, agrupada |
| 1.5.5 | 8: Conexões e serviços | pronta e fiel, agrupada |
| 1.6.1 | 9: Quem fala com quem | pronta e fiel |
| 1.6.2 | 9: Quem fala com quem | pronta e fiel |
| 1.6.3 | 10: Os modelos e as críticas | pronta e fiel, agrupada |
| 1.6.4 | 10: Os modelos e as críticas | pronta e fiel, agrupada |
| 1.6.5 | 10: Os modelos e as críticas | pronta e fiel, agrupada |
| 1.7.1 | 11: Quem manda nos padrões | pronta e fiel, agrupada |
| 1.7.2 | 11: Quem manda nos padrões | pronta e fiel, agrupada |
| 1.7.3 | 11: Quem manda nos padrões | pronta e fiel, agrupada |
| 1.7.4 | 11: Quem manda nos padrões | pronta e fiel, agrupada |
| 1.8.1 | 12: Neutralidade da rede | pronta e fiel |
| 1.8.2 | 12: Neutralidade da rede | pronta e fiel |
| 1.8.3 | 13: Segurança, privacidade e desinformação | pronta e fiel, agrupada |
| 1.8.4 | 13: Segurança, privacidade e desinformação | pronta e fiel, agrupada |
| 1.8.5 | 13: Segurança, privacidade e desinformação | pronta e fiel, agrupada |
| 1.9 | 14: Bit não é byte | pronta e fiel |
| 1.10 | (nenhum) | resumo |
| 1.11 | (nenhum) | resumo |

## Capítulo 2

| Subseção | Dia | Situação |
|---|---|---|
| 2.1.1 | 15: A caminhonete cheia de discos | pronta e fiel |
| 2.1.2 | 16: Crimpa direito; 17: Cruzado ou direto; 18: 100 metros e um palmo; 19: Cat errado; 20: O elevador | pronta e fiel, com prática de campo além do conteúdo da seção |
| 2.1.3 | 21: Cabo coaxial | pronta e fiel |
| 2.1.4 | 22: Internet pela tomada | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto |
| 2.1.5 | 23: Amarelo com aqua; 24: Orçamento de potência; 25: Retroescavadeira | pronta e fiel; pronta e fiel, com prática de campo além do conteúdo da seção |
| 2.2.1 | 26: O espectro eletromagnético | pronta e fiel |
| 2.2.2 | 27: Espalhar para não brigar | pronta e fiel, agrupada |
| 2.2.3 | 27: Espalhar para não brigar | pronta e fiel, agrupada |
| 2.2.4 | 27: Espalhar para não brigar | pronta e fiel, agrupada |
| 2.3.1 | 28: Rádio no morro | pronta e fiel |
| 2.3.2 | 28: Rádio no morro | pronta e fiel |
| 2.3.3 | 29: Luz pelo ar | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto |
| 2.3.4 | 29: Luz pelo ar | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto |
| 2.4.1 | 30: Por que o sinal se deforma | pronta e fiel |
| 2.4.2 | 31: Nyquist manda lembranças | pronta e fiel |
| 2.4.3 | 32: Constelações | pronta e fiel |
| 2.4.4 | 33: Dividir o meio | pronta e fiel |
| 2.5.1 | 34: A linha do telefone | pronta e fiel |
| 2.5.2 | 34: A linha do telefone | pronta e fiel |
| 2.5.3 | 35: O E1 da prefeitura | pronta e fiel |
| 2.5.4 | 36: Circuito ou pacote | pronta e fiel |
| 2.6.1 | 37: A célula | pronta e fiel, agrupada |
| 2.6.2 | 37: A célula | pronta e fiel, agrupada |
| 2.6.3 | 37: A célula | pronta e fiel, agrupada |
| 2.6.4 | 37: A célula | pronta e fiel, agrupada |
| 2.6.5 | 38: Do 3G ao 5G | pronta e fiel, agrupada |
| 2.6.6 | 38: Do 3G ao 5G | pronta e fiel, agrupada |
| 2.6.7 | 38: Do 3G ao 5G | pronta e fiel, agrupada |
| 2.7.1 | 39: DOCSIS na rua | pronta e fiel, agrupada |
| 2.7.2 | 39: DOCSIS na rua | pronta e fiel, agrupada |
| 2.7.3 | 39: DOCSIS na rua | pronta e fiel, agrupada |
| 2.7.4 | 39: DOCSIS na rua | pronta e fiel, agrupada |
| 2.8.1 | 40: Satélite e paciência | pronta e fiel, agrupada |
| 2.8.2 | 40: Satélite e paciência | pronta e fiel, agrupada |
| 2.8.3 | 40: Satélite e paciência | pronta e fiel, agrupada |
| 2.9.1 | 41: Qual acesso para quem | pronta e fiel |
| 2.9.2 | 41: Qual acesso para quem | pronta e fiel |
| 2.10.1 | 42: Política na camada física | pronta e fiel, agrupada |
| 2.10.2 | 42: Política na camada física | pronta e fiel, agrupada |
| 2.10.3 | 42: Política na camada física | pronta e fiel, agrupada |
| 2.11 | (nenhum) | resumo |

## Capítulo 3

| Subseção | Dia | Situação |
|---|---|---|
| 3.1.1 | 43: O que o enlace promete | pronta e fiel |
| 3.1.2 | 44: Onde começa o quadro; 45: O byte que é flag; 46: Cinco uns | pronta e fiel |
| 3.1.3 | 47: Erro e fluxo | pronta e fiel |
| 3.1.4 | 47: Erro e fluxo | pronta e fiel |
| 3.2.1 | 48: Mão única | pronta e fiel |
| 3.2.2 | 49: Paridade não basta; 50: Divisão por polinômio | pronta e fiel |
| 3.3.1 | 51: Pare e espere; 52: O ACK que sumiu | pronta e fiel, agrupada |
| 3.3.2 | 51: Pare e espere; 52: O ACK que sumiu | pronta e fiel, agrupada |
| 3.3.3 | 51: Pare e espere; 52: O ACK que sumiu | pronta e fiel, agrupada |
| 3.4.1 | 53: Encher o cano; 54: Janela de oito; 55: Só o que se perdeu | pronta e fiel |
| 3.4.2 | 53: Encher o cano; 54: Janela de oito; 55: Só o que se perdeu | pronta e fiel |
| 3.5.1 | 56: PPP no último quilômetro | pronta e fiel |
| 3.5.2 | 57: O enlace do ADSL e do cabo | pronta e fiel |
| 3.5.3 | 57: O enlace do ADSL e do cabo | pronta e fiel |
| 3.6 | (nenhum) | resumo |

## Capítulo 4

| Subseção | Dia | Situação |
|---|---|---|
| 4.1.1 | 58: Um canal para muitos | pronta e fiel |
| 4.1.2 | 58: Um canal para muitos | pronta e fiel |
| 4.2.1 | 59: ALOHA | pronta e fiel |
| 4.2.2 | 60: Escutar antes de falar | pronta e fiel |
| 4.2.3 | 61: Sem colisão | pronta e fiel |
| 4.2.4 | 61: Sem colisão | pronta e fiel |
| 4.2.5 | 62: O terminal escondido | pronta e fiel |
| 4.3.1 | 63: Ethernet clássica | pronta e fiel |
| 4.3.2 | 63: Ethernet clássica | pronta e fiel |
| 4.3.3 | 64: Desempenho da Ethernet | pronta e fiel |
| 4.3.4 | 65: Hub ou switch | pronta e fiel |
| 4.3.5 | 66: De 100 mega a 100 giga | pronta e fiel, agrupada |
| 4.3.6 | 66: De 100 mega a 100 giga | pronta e fiel, agrupada |
| 4.3.7 | 66: De 100 mega a 100 giga | pronta e fiel, agrupada |
| 4.3.8 | 66: De 100 mega a 100 giga | pronta e fiel, agrupada |
| 4.3.9 | 66: De 100 mega a 100 giga | pronta e fiel, agrupada |
| 4.4.1 | 67: Canal lotado | pronta, parcial: cobre a camada física do Wi-Fi (canais); a arquitetura do 802.11 ainda pede reforço |
| 4.4.2 | 67: Canal lotado | pronta, parcial: cobre a camada física do Wi-Fi (canais); a arquitetura do 802.11 ainda pede reforço |
| 4.4.3 | 68: Pedir a vez no ar | pronta e fiel |
| 4.4.4 | 69: Associar e autenticar | pronta e fiel |
| 4.4.5 | 69: Associar e autenticar | pronta e fiel |
| 4.5.1 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.2 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.3 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.4 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.5 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.6 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.7 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.6.1 | 71: DOCSIS por dentro | pronta e fiel, agrupada |
| 4.6.2 | 71: DOCSIS por dentro | pronta e fiel, agrupada |
| 4.6.3 | 71: DOCSIS por dentro | pronta e fiel, agrupada |
| 4.7.1 | 72: A ponte que aprende | pronta e fiel |
| 4.7.2 | 72: A ponte que aprende | pronta e fiel |
| 4.7.3 | 73: Matando o laço | pronta e fiel |
| 4.7.4 | 74: Quem é de qual camada | pronta e fiel |
| 4.7.5 | 75: VLANs | pronta e fiel |
| 4.8 | (nenhum) | resumo |

## Capítulo 5

| Subseção | Dia | Situação |
|---|---|---|
| 5.1.1 | 76: Armazena e repassa | pronta e fiel |
| 5.1.2 | 76: Armazena e repassa | pronta e fiel |
| 5.1.3 | 77: Datagrama ou circuito virtual | pronta e fiel, agrupada |
| 5.1.4 | 77: Datagrama ou circuito virtual | pronta e fiel, agrupada |
| 5.1.5 | 77: Datagrama ou circuito virtual | pronta e fiel, agrupada |
| 5.2.1 | 78: O caminho mais curto | pronta e fiel |
| 5.2.2 | 78: O caminho mais curto | pronta e fiel |
| 5.2.3 | 79: Inundação | pronta e fiel |
| 5.2.4 | 80: Contagem ao infinito | pronta e fiel |
| 5.2.5 | 81: Estado de enlace | pronta e fiel |
| 5.2.6 | 82: Roteamento hierárquico | pronta e fiel |
| 5.2.7 | 83: Um para todos, um para alguns | pronta e fiel, agrupada |
| 5.2.8 | 83: Um para todos, um para alguns | pronta e fiel, agrupada |
| 5.2.9 | 83: Um para todos, um para alguns | pronta e fiel, agrupada |
| 5.3.1 | 84: Congestionamento | pronta e fiel |
| 5.3.2 | 84: Congestionamento | pronta e fiel |
| 5.4.1 | 85: Filas e prioridades | pronta e fiel, agrupada |
| 5.4.2 | 85: Filas e prioridades | pronta e fiel, agrupada |
| 5.4.3 | 85: Filas e prioridades | pronta e fiel, agrupada |
| 5.4.4 | 86: Serviços diferenciados | pronta e fiel |
| 5.4.5 | 86: Serviços diferenciados | pronta e fiel |
| 5.5.1 | 87: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.2 | 87: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.3 | 87: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.4 | 87: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.5 | 88: Fragmentação | pronta e fiel |
| 5.5.6 | 88: Fragmentação | pronta e fiel |
| 5.6.1 | 89: A rede programável | pronta e fiel, agrupada |
| 5.6.2 | 89: A rede programável | pronta e fiel, agrupada |
| 5.6.3 | 89: A rede programável | pronta e fiel, agrupada |
| 5.6.4 | 89: A rede programável | pronta e fiel, agrupada |
| 5.7.1 | 90: O cabeçalho IPv4 | pronta e fiel |
| 5.7.2 | 91: Sub-redes; 92: NAT | pronta e fiel |
| 5.7.3 | 93: IPv6 | pronta e fiel |
| 5.7.4 | 94: ICMP, ARP e DHCP | pronta e fiel |
| 5.7.5 | 95: MPLS | pronta e fiel |
| 5.7.6 | 96: OSPF | pronta e fiel |
| 5.7.7 | 97: BGP | pronta e fiel |
| 5.7.8 | 98: Multicast | pronta e fiel |
| 5.8.1 | 99: Política na camada de rede | pronta e fiel |
| 5.8.2 | 99: Política na camada de rede | pronta e fiel |
| 5.9 | (nenhum) | resumo |

## Capítulo 6

| Subseção | Dia | Situação |
|---|---|---|
| 6.1.1 | 100: Soquetes | pronta e fiel, agrupada |
| 6.1.2 | 100: Soquetes | pronta e fiel, agrupada |
| 6.1.3 | 100: Soquetes | pronta e fiel, agrupada |
| 6.1.4 | 100: Soquetes | pronta e fiel, agrupada |
| 6.2.1 | 101: Aperto de mão | pronta e fiel, agrupada |
| 6.2.2 | 101: Aperto de mão | pronta e fiel, agrupada |
| 6.2.3 | 101: Aperto de mão | pronta e fiel, agrupada |
| 6.2.4 | 102: Fluxo e falhas | pronta e fiel, agrupada |
| 6.2.5 | 102: Fluxo e falhas | pronta e fiel, agrupada |
| 6.2.6 | 102: Fluxo e falhas | pronta e fiel, agrupada |
| 6.3.1 | 103: Dividir a banda com justiça | pronta e fiel, agrupada |
| 6.3.2 | 103: Dividir a banda com justiça | pronta e fiel, agrupada |
| 6.3.3 | 103: Dividir a banda com justiça | pronta e fiel, agrupada |
| 6.4.1 | 104: UDP e tempo real | pronta e fiel, agrupada |
| 6.4.2 | 104: UDP e tempo real | pronta e fiel, agrupada |
| 6.4.3 | 104: UDP e tempo real | pronta e fiel, agrupada |
| 6.5.1 | 105: TCP por dentro | pronta e fiel, agrupada |
| 6.5.2 | 105: TCP por dentro | pronta e fiel, agrupada |
| 6.5.3 | 105: TCP por dentro | pronta e fiel, agrupada |
| 6.5.4 | 105: TCP por dentro | pronta e fiel, agrupada |
| 6.5.5 | 105: TCP por dentro | pronta e fiel, agrupada |
| 6.5.6 | 105: TCP por dentro | pronta e fiel, agrupada |
| 6.5.7 | 106: Estados e janela do TCP | pronta e fiel |
| 6.5.8 | 106: Estados e janela do TCP | pronta e fiel |
| 6.5.9 | 107: Timers do TCP | pronta e fiel |
| 6.5.10 | 108: Partida lenta e CUBIC | pronta e fiel |
| 6.5.11 | 108: Partida lenta e CUBIC | pronta e fiel |
| 6.6.1 | 109: QUIC e BBR | pronta e fiel, agrupada |
| 6.6.2 | 109: QUIC e BBR | pronta e fiel, agrupada |
| 6.6.3 | 109: QUIC e BBR | pronta e fiel, agrupada |
| 6.7.1 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.7.2 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.7.3 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.7.4 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.7.5 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.7.6 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.7.7 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.7.8 | 110: Medir de verdade | pronta e fiel, agrupada |
| 6.8 | (nenhum) | resumo |

## Capítulo 7

| Subseção | Dia | Situação |
|---|---|---|
| 7.1.1 | 111: Nomes | pronta e fiel, agrupada |
| 7.1.2 | 111: Nomes | pronta e fiel, agrupada |
| 7.1.3 | 111: Nomes | pronta e fiel, agrupada |
| 7.1.4 | 111: Nomes | pronta e fiel, agrupada |
| 7.1.5 | 112: Resolver | pronta e fiel, agrupada |
| 7.1.6 | 112: Resolver | pronta e fiel, agrupada |
| 7.1.7 | 112: Resolver | pronta e fiel, agrupada |
| 7.1.8 | 112: Resolver | pronta e fiel, agrupada |
| 7.2.1 | 113: Correio | pronta e fiel, agrupada |
| 7.2.2 | 113: Correio | pronta e fiel, agrupada |
| 7.2.3 | 113: Correio | pronta e fiel, agrupada |
| 7.2.4 | 113: Correio | pronta e fiel, agrupada |
| 7.2.5 | 113: Correio | pronta e fiel, agrupada |
| 7.3.1 | 114: A teia | pronta e fiel, agrupada |
| 7.3.2 | 114: A teia | pronta e fiel, agrupada |
| 7.3.3 | 114: A teia | pronta e fiel, agrupada |
| 7.3.4 | 115: HTTP e HTTPS | pronta e fiel |
| 7.3.5 | 115: HTTP e HTTPS | pronta e fiel |
| 7.4.1 | 116: Ao vivo | pronta e fiel, agrupada |
| 7.4.2 | 116: Ao vivo | pronta e fiel, agrupada |
| 7.4.3 | 116: Ao vivo | pronta e fiel, agrupada |
| 7.4.4 | 116: Ao vivo | pronta e fiel, agrupada |
| 7.5.1 | 117: Perto de quem assiste | pronta e fiel, agrupada |
| 7.5.2 | 117: Perto de quem assiste | pronta e fiel, agrupada |
| 7.5.3 | 117: Perto de quem assiste | pronta e fiel, agrupada |
| 7.5.4 | 118: De par em par | pronta e fiel; a DHT do simulador usa distância XOR, e o texto ensina também o anel |
| 7.5.5 | 118: De par em par | pronta e fiel; a DHT do simulador usa distância XOR, e o texto ensina também o anel |
| 7.6 | (nenhum) | resumo |

## Capítulo 8

| Subseção | Dia | Situação |
|---|---|---|
| 8.1.1 | 119: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.1.2 | 119: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.1.3 | 119: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.2.1 | 119: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.2.2 | 119: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.2.3 | 119: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.2.4 | 119: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.3.1 | 120: Firewall | pronta e fiel |
| 8.3.2 | 120: Firewall | pronta e fiel |
| 8.4.1 | 121: Segredos | pronta e fiel, agrupada |
| 8.4.2 | 121: Segredos | pronta e fiel, agrupada |
| 8.4.3 | 121: Segredos | pronta e fiel, agrupada |
| 8.4.4 | 121: Segredos | pronta e fiel, agrupada |
| 8.4.5 | 121: Segredos | pronta e fiel, agrupada |
| 8.5.1 | 121: Segredos | pronta e fiel, agrupada |
| 8.5.2 | 121: Segredos | pronta e fiel, agrupada |
| 8.5.3 | 121: Segredos | pronta e fiel, agrupada |
| 8.6.1 | 122: Chave pública e assinatura | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.6.2 | 122: Chave pública e assinatura | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.7.1 | 122: Chave pública e assinatura | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.7.2 | 122: Chave pública e assinatura | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.7.3 | 122: Chave pública e assinatura | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.7.4 | 122: Chave pública e assinatura | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.8.1 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.8.2 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.8.3 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.9.1 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.9.2 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.9.3 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.9.4 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.9.5 | 123: Certificados e autenticação | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.10.1 | 124: VPN e Wi-Fi seguro | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.10.2 | 124: VPN e Wi-Fi seguro | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.10.3 | 124: VPN e Wi-Fi seguro | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.11.1 | 125: Correio e web seguros | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.11.2 | 125: Correio e web seguros | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.12.1 | 125: Correio e web seguros | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.12.2 | 125: Correio e web seguros | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.12.3 | 125: Correio e web seguros | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.12.4 | 125: Correio e web seguros | pronta e fiel; a criptografia do simulador usa números pequenos, avisado no texto, agrupada |
| 8.13.1 | 126: O ponto de troca | pronta e fiel na aula; a prática imita a cebola com túneis encadeados, avisado no texto, agrupada |
| 8.13.2 | 126: O ponto de troca | pronta e fiel na aula; a prática imita a cebola com túneis encadeados, avisado no texto, agrupada |
| 8.13.3 | 126: O ponto de troca | pronta e fiel na aula; a prática imita a cebola com túneis encadeados, avisado no texto, agrupada |
| 8.14 | (nenhum) | resumo |
