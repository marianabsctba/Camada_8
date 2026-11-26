# Auditoria de cobertura do currículo

Cada subseção do currículo de referência (8 capítulos) e o dia do jogo que a ensina. A ordem oficial dos dias está em `src/conteudo/curriculo.ts`.

Legenda: **287 subseções**: 278 com dia pronto, 9 resumos de capítulo. 177 subseções dividem o dia com outras (dias com três ou mais subseções). Os atos 0 a 7 (capítulos 1 a 8) estão completos.

## Correções feitas nesta auditoria

- **Sem senha** (recuperar a senha do roteador pelo console) estava na subseção 1.8.3, que trata segurança como questão social. Virou o **prólogo** do jogo (dia 0): a chegada ao galpão com o roteador trancado. A 1.8.3 a 1.8.5 ganhou um dia próprio.
- **Canal lotado** (canais do Wi-Fi em 2,4 GHz) estava na 2.2.1, que é o espectro eletromagnético em geral. Foi para a 4.4.1 e 4.4.2 (arquitetura e camada física do Wi-Fi), onde o assunto mora, e ganhou a arquitetura do 802.11 (BSS, ESS, IBSS, pilha, varredura, autenticação e associação) e as camadas físicas do 802.11b ao 802.11ax, com modulação adaptativa. A 2.2.1 ganhou um dia próprio.
- **PPP no último quilômetro** cobria só a 3.5.1. A 3.5.2 e 3.5.3 (o enlace do ADSL e do cabo) ganharam um dia próprio.
- **Duas casas, um cabo** continua na 1.3.1 a 1.3.3: a aula ensina rede pessoal, local e doméstica, e a prática mostra o que define uma rede local (hosts que falam direto, sem roteador). Fica registrado que a prática adianta o endereçamento IP, aprofundado depois em 5.7.2.
- Os dias de par trançado e de OTDR ensinam a seção e vão além dela com prática de campo (crimpagem, MDI-X, limite de 100 m, ruído, fusão). Isso é acréscimo, não troca de conteúdo.
- Oito dias que juntavam de 6 a 8 subseções viraram dois cada: Bluetooth (4.5.1 a 4.5.4 e 4.5.5 a 4.5.7), TCP por dentro (6.5.1 a 6.5.3 e 6.5.4 a 6.5.6), Medir de verdade (6.7.1 a 6.7.4 e 6.7.5 a 6.7.8), Princípios da segurança (8.1) e Anatomia de um ataque (8.2), Segredos (8.4) e Chave simétrica (8.5), Chave pública (8.6) e Assinaturas e resumos (8.7), Certificados (8.8) e Autenticação (8.9), Correio seguro (8.11) e Web segura (8.12).

## Ainda falta

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
| 4.4.1 | 67: Canal lotado | pronta e fiel |
| 4.4.2 | 67: Canal lotado | pronta e fiel |
| 4.4.3 | 68: Pedir a vez no ar | pronta e fiel |
| 4.4.4 | 69: Associar e autenticar | pronta e fiel |
| 4.4.5 | 69: Associar e autenticar | pronta e fiel |
| 4.5.1 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.2 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.3 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.4 | 70: Bluetooth | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 4.5.5 | 71: Bluetooth por dentro | pronta e fiel, agrupada |
| 4.5.6 | 71: Bluetooth por dentro | pronta e fiel, agrupada |
| 4.5.7 | 71: Bluetooth por dentro | pronta e fiel, agrupada |
| 4.6.1 | 72: DOCSIS por dentro | pronta e fiel, agrupada |
| 4.6.2 | 72: DOCSIS por dentro | pronta e fiel, agrupada |
| 4.6.3 | 72: DOCSIS por dentro | pronta e fiel, agrupada |
| 4.7.1 | 73: A ponte que aprende | pronta e fiel |
| 4.7.2 | 73: A ponte que aprende | pronta e fiel |
| 4.7.3 | 74: Matando o laço | pronta e fiel |
| 4.7.4 | 75: Quem é de qual camada | pronta e fiel |
| 4.7.5 | 76: VLANs | pronta e fiel |
| 4.8 | (nenhum) | resumo |

## Capítulo 5

| Subseção | Dia | Situação |
|---|---|---|
| 5.1.1 | 77: Armazena e repassa | pronta e fiel |
| 5.1.2 | 77: Armazena e repassa | pronta e fiel |
| 5.1.3 | 78: Datagrama ou circuito virtual | pronta e fiel, agrupada |
| 5.1.4 | 78: Datagrama ou circuito virtual | pronta e fiel, agrupada |
| 5.1.5 | 78: Datagrama ou circuito virtual | pronta e fiel, agrupada |
| 5.2.1 | 79: O caminho mais curto | pronta e fiel |
| 5.2.2 | 79: O caminho mais curto | pronta e fiel |
| 5.2.3 | 80: Inundação | pronta e fiel |
| 5.2.4 | 81: Contagem ao infinito | pronta e fiel |
| 5.2.5 | 82: Estado de enlace | pronta e fiel |
| 5.2.6 | 83: Roteamento hierárquico | pronta e fiel |
| 5.2.7 | 84: Um para todos, um para alguns | pronta e fiel, agrupada |
| 5.2.8 | 84: Um para todos, um para alguns | pronta e fiel, agrupada |
| 5.2.9 | 84: Um para todos, um para alguns | pronta e fiel, agrupada |
| 5.3.1 | 85: Congestionamento | pronta e fiel |
| 5.3.2 | 85: Congestionamento | pronta e fiel |
| 5.4.1 | 86: Filas e prioridades | pronta e fiel, agrupada |
| 5.4.2 | 86: Filas e prioridades | pronta e fiel, agrupada |
| 5.4.3 | 86: Filas e prioridades | pronta e fiel, agrupada |
| 5.4.4 | 87: Serviços diferenciados | pronta e fiel |
| 5.4.5 | 87: Serviços diferenciados | pronta e fiel |
| 5.5.1 | 88: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.2 | 88: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.3 | 88: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.4 | 88: Redes diferentes, um túnel | pronta e fiel na aula; a prática usa uma aproximação no simulador, avisada no texto, agrupada |
| 5.5.5 | 89: Fragmentação | pronta e fiel |
| 5.5.6 | 89: Fragmentação | pronta e fiel |
| 5.6.1 | 90: A rede programável | pronta e fiel, agrupada |
| 5.6.2 | 90: A rede programável | pronta e fiel, agrupada |
| 5.6.3 | 90: A rede programável | pronta e fiel, agrupada |
| 5.6.4 | 90: A rede programável | pronta e fiel, agrupada |
| 5.7.1 | 91: O cabeçalho IPv4 | pronta e fiel |
| 5.7.2 | 92: Sub-redes; 93: NAT | pronta e fiel |
| 5.7.3 | 94: IPv6 | pronta e fiel |
| 5.7.4 | 95: ICMP, ARP e DHCP | pronta e fiel |
| 5.7.5 | 96: MPLS | pronta e fiel |
| 5.7.6 | 97: OSPF | pronta e fiel |
| 5.7.7 | 98: BGP | pronta e fiel |
| 5.7.8 | 99: Multicast | pronta e fiel |
| 5.8.1 | 100: Política na camada de rede | pronta e fiel |
| 5.8.2 | 100: Política na camada de rede | pronta e fiel |
| 5.9 | (nenhum) | resumo |

## Capítulo 6

| Subseção | Dia | Situação |
|---|---|---|
| 6.1.1 | 101: Soquetes | pronta e fiel, agrupada |
| 6.1.2 | 101: Soquetes | pronta e fiel, agrupada |
| 6.1.3 | 101: Soquetes | pronta e fiel, agrupada |
| 6.1.4 | 101: Soquetes | pronta e fiel, agrupada |
| 6.2.1 | 102: Aperto de mão | pronta e fiel, agrupada |
| 6.2.2 | 102: Aperto de mão | pronta e fiel, agrupada |
| 6.2.3 | 102: Aperto de mão | pronta e fiel, agrupada |
| 6.2.4 | 103: Fluxo e falhas | pronta e fiel, agrupada |
| 6.2.5 | 103: Fluxo e falhas | pronta e fiel, agrupada |
| 6.2.6 | 103: Fluxo e falhas | pronta e fiel, agrupada |
| 6.3.1 | 104: Dividir a banda com justiça | pronta e fiel, agrupada |
| 6.3.2 | 104: Dividir a banda com justiça | pronta e fiel, agrupada |
| 6.3.3 | 104: Dividir a banda com justiça | pronta e fiel, agrupada |
| 6.4.1 | 105: UDP e tempo real | pronta e fiel, agrupada |
| 6.4.2 | 105: UDP e tempo real | pronta e fiel, agrupada |
| 6.4.3 | 105: UDP e tempo real | pronta e fiel, agrupada |
| 6.5.1 | 106: TCP por dentro | pronta e fiel, agrupada |
| 6.5.2 | 106: TCP por dentro | pronta e fiel, agrupada |
| 6.5.3 | 106: TCP por dentro | pronta e fiel, agrupada |
| 6.5.4 | 107: Cabeçalho, abrir e fechar | pronta e fiel, agrupada |
| 6.5.5 | 107: Cabeçalho, abrir e fechar | pronta e fiel, agrupada |
| 6.5.6 | 107: Cabeçalho, abrir e fechar | pronta e fiel, agrupada |
| 6.5.7 | 108: Estados e janela do TCP | pronta e fiel |
| 6.5.8 | 108: Estados e janela do TCP | pronta e fiel |
| 6.5.9 | 109: Timers do TCP | pronta e fiel |
| 6.5.10 | 110: Partida lenta e CUBIC | pronta e fiel |
| 6.5.11 | 110: Partida lenta e CUBIC | pronta e fiel |
| 6.6.1 | 111: QUIC e BBR | pronta e fiel, agrupada |
| 6.6.2 | 111: QUIC e BBR | pronta e fiel, agrupada |
| 6.6.3 | 111: QUIC e BBR | pronta e fiel, agrupada |
| 6.7.1 | 112: Medir de verdade | pronta e fiel, agrupada |
| 6.7.2 | 112: Medir de verdade | pronta e fiel, agrupada |
| 6.7.3 | 112: Medir de verdade | pronta e fiel, agrupada |
| 6.7.4 | 112: Medir de verdade | pronta e fiel, agrupada |
| 6.7.5 | 113: Redes rápidas | pronta e fiel, agrupada |
| 6.7.6 | 113: Redes rápidas | pronta e fiel, agrupada |
| 6.7.7 | 113: Redes rápidas | pronta e fiel, agrupada |
| 6.7.8 | 113: Redes rápidas | pronta e fiel, agrupada |
| 6.8 | (nenhum) | resumo |

## Capítulo 7

| Subseção | Dia | Situação |
|---|---|---|
| 7.1.1 | 114: Nomes | pronta e fiel, agrupada |
| 7.1.2 | 114: Nomes | pronta e fiel, agrupada |
| 7.1.3 | 114: Nomes | pronta e fiel, agrupada |
| 7.1.4 | 114: Nomes | pronta e fiel, agrupada |
| 7.1.5 | 115: Resolver | pronta e fiel, agrupada |
| 7.1.6 | 115: Resolver | pronta e fiel, agrupada |
| 7.1.7 | 115: Resolver | pronta e fiel, agrupada |
| 7.1.8 | 115: Resolver | pronta e fiel, agrupada |
| 7.2.1 | 116: Correio | pronta e fiel, agrupada |
| 7.2.2 | 116: Correio | pronta e fiel, agrupada |
| 7.2.3 | 116: Correio | pronta e fiel, agrupada |
| 7.2.4 | 116: Correio | pronta e fiel, agrupada |
| 7.2.5 | 116: Correio | pronta e fiel, agrupada |
| 7.3.1 | 117: A teia | pronta e fiel, agrupada |
| 7.3.2 | 117: A teia | pronta e fiel, agrupada |
| 7.3.3 | 117: A teia | pronta e fiel, agrupada |
| 7.3.4 | 118: HTTP e HTTPS | pronta e fiel |
| 7.3.5 | 118: HTTP e HTTPS | pronta e fiel |
| 7.4.1 | 119: Ao vivo | pronta e fiel, agrupada |
| 7.4.2 | 119: Ao vivo | pronta e fiel, agrupada |
| 7.4.3 | 119: Ao vivo | pronta e fiel, agrupada |
| 7.4.4 | 119: Ao vivo | pronta e fiel, agrupada |
| 7.5.1 | 120: Perto de quem assiste | pronta e fiel, agrupada |
| 7.5.2 | 120: Perto de quem assiste | pronta e fiel, agrupada |
| 7.5.3 | 120: Perto de quem assiste | pronta e fiel, agrupada |
| 7.5.4 | 121: De par em par | pronta e fiel |
| 7.5.5 | 121: De par em par | pronta e fiel |
| 7.6 | (nenhum) | resumo |

## Capítulo 8

| Subseção | Dia | Situação |
|---|---|---|
| 8.1.1 | 122: Princípios da segurança | pronta e fiel, agrupada |
| 8.1.2 | 122: Princípios da segurança | pronta e fiel, agrupada |
| 8.1.3 | 122: Princípios da segurança | pronta e fiel, agrupada |
| 8.2.1 | 123: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.2.2 | 123: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.2.3 | 123: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.2.4 | 123: Anatomia de um ataque | pronta e fiel, agrupada |
| 8.3.1 | 124: Firewall | pronta e fiel |
| 8.3.2 | 124: Firewall | pronta e fiel |
| 8.4.1 | 125: Segredos | pronta e fiel, agrupada |
| 8.4.2 | 125: Segredos | pronta e fiel, agrupada |
| 8.4.3 | 125: Segredos | pronta e fiel, agrupada |
| 8.4.4 | 125: Segredos | pronta e fiel, agrupada |
| 8.4.5 | 125: Segredos | pronta e fiel, agrupada |
| 8.5.1 | 126: Chave simétrica | pronta e fiel, agrupada |
| 8.5.2 | 126: Chave simétrica | pronta e fiel, agrupada |
| 8.5.3 | 126: Chave simétrica | pronta e fiel, agrupada |
| 8.6.1 | 127: Chave pública | pronta e fiel |
| 8.6.2 | 127: Chave pública | pronta e fiel |
| 8.7.1 | 128: Assinaturas e resumos | pronta e fiel, agrupada |
| 8.7.2 | 128: Assinaturas e resumos | pronta e fiel, agrupada |
| 8.7.3 | 128: Assinaturas e resumos | pronta e fiel, agrupada |
| 8.7.4 | 128: Assinaturas e resumos | pronta e fiel, agrupada |
| 8.8.1 | 129: Certificados | pronta e fiel, agrupada |
| 8.8.2 | 129: Certificados | pronta e fiel, agrupada |
| 8.8.3 | 129: Certificados | pronta e fiel, agrupada |
| 8.9.1 | 130: Autenticação | pronta e fiel, agrupada |
| 8.9.2 | 130: Autenticação | pronta e fiel, agrupada |
| 8.9.3 | 130: Autenticação | pronta e fiel, agrupada |
| 8.9.4 | 130: Autenticação | pronta e fiel, agrupada |
| 8.9.5 | 130: Autenticação | pronta e fiel, agrupada |
| 8.10.1 | 131: VPN e Wi-Fi seguro | pronta e fiel, agrupada |
| 8.10.2 | 131: VPN e Wi-Fi seguro | pronta e fiel, agrupada |
| 8.10.3 | 131: VPN e Wi-Fi seguro | pronta e fiel, agrupada |
| 8.11.1 | 132: Correio seguro | pronta e fiel |
| 8.11.2 | 132: Correio seguro | pronta e fiel |
| 8.12.1 | 133: Web segura | pronta e fiel, agrupada |
| 8.12.2 | 133: Web segura | pronta e fiel, agrupada |
| 8.12.3 | 133: Web segura | pronta e fiel, agrupada |
| 8.12.4 | 133: Web segura | pronta e fiel, agrupada |
| 8.13.1 | 134: O ponto de troca | pronta e fiel, agrupada |
| 8.13.2 | 134: O ponto de troca | pronta e fiel, agrupada |
| 8.13.3 | 134: O ponto de troca | pronta e fiel, agrupada |
| 8.14 | (nenhum) | resumo |
