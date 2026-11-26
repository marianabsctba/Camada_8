# Camada 8: desenho (versão 2)

Do zero ao hero: o jogo passa por todo o currículo clássico de redes, seção por seção, contado como uma única história.

## 1. A história

**Fim de Linha** é uma cidade no fim da estrada, sem internet. A prefeitura cedeu um galpão, um rack vazio e uma caixa de ferramentas para quem topasse ligar a cidade ao mundo. Você topou, sem saber nada de redes.

O jogo inteiro é esse caminho: da primeira casa conectada até Fim de Linha virar um ponto de troca de tráfego, com a internet do mundo passando por ela.

Ninguém aparece em cena. A história chega por:

- **ofícios e cartas** na mesa do galpão (a prefeitura, a escola, o hospital, a cooperativa);
- **chamados** no terminal velho;
- **etiquetas e post-its** nos equipamentos;
- **o mapa da cidade**, que é o placar da história.

### O mapa da cidade

Entre um dia e outro, a tela mostra o mapa de Fim de Linha à noite. No começo está tudo apagado. Cada dia resolvido acende alguma coisa: uma casa, uma rua, a escola, o hospital, um bairro, a torre, o data center. No fim de cada ato, um marco grande acende e a história anda:

| Ato | Lugar em 3D | Marco no mapa ao terminar |
|---|---|---|
| 0. Fim de Linha | o galpão do provedor | o galpão acende: a empresa existe |
| 1. A Rua | rua, poste, caixa de emenda, torre, telhado | a primeira rua acende: 12 casas online |
| 2. A Linha | a central telefônica antiga | o enlace até a cidade vizinha liga |
| 3. O Bairro | prédio, escola, condomínio | o bairro inteiro acende, com Wi-Fi na praça |
| 4. A Cidade | data center municipal, sala de roteadores | todos os bairros se enxergam; a cidade tem rota para fora |
| 5. A Conversa | sala dos servidores | as conexões ficam rápidas e estáveis: videochamada no hospital |
| 6. O Show | estádio e estúdio no dia da final do campeonato | a cidade inteira assiste ao jogo ao vivo |
| 7. O Cerco | centro de operações, à noite, durante um ataque | Fim de Linha vira ponto de troca de tráfego: final |

## 2. Como cada dia ensina

Todo dia tem quatro partes, sempre na mesma ordem:

1. **A carta.** Um ofício ou chamado de uma frase ou duas, contando o problema da cidade.
2. **A aula.** De três a cinco telas curtas e visuais, com uma animação ou um mini interativo por conceito: os bits sendo enchidos, a janela deslizando, o pacote pulando de roteador em roteador. Termina com uma pergunta rápida de checagem.
3. **A prática.** O modo guiado que já existe: passos curtos, seta laranja no objeto certo, o porquê, e o erro explicado.
4. **O desafio.** O mesmo conceito com outros números ou outro defeito, sem seta e sem passo a passo. Só a carta, a sala e as ferramentas. Se travar, pode pedir dicas.

No fim, a tela de **fechamento** mostra o que se aprendeu, a seção do currículo que foi coberta e o que acendeu no mapa.

## 3. O que já existe e continua

- O motor de simulação das camadas física e de enlace (cobre, fibra, rádio, coaxial, satélite, enquadramento, CRC, Hamming, ARQ).
- A sala em 3D, a seta laranja e a janela de passo com o porquê.
- Os 30 dias já escritos viram a prática de dias da versão nova, encaixados no lugar certo do currículo.

## 4. O que muda

- **A camada de história:** cartas, mapa da cidade, abertura e encerramento de cada ato.
- **Um lugar em 3D por ato**, em vez da mesma sala para tudo.
- **A aula antes da prática e o desafio depois.**
- **Cobertura completa:** toda seção do currículo vira pelo menos um dia (seção 5).

## 5. Mapa de cobertura

Cada linha é uma seção (ou um grupo de subseções pequenas) e o dia em que ela é ensinada. A ordem oficial, já com os dias escritos encaixados, está em `src/conteudo/curriculo.ts`: **125 dias**, porque algumas seções ganharam mais de um dia (o par trançado tem cinco, a fibra tem três). A tabela abaixo é o plano original, por seção.

### Ato 0: Fim de Linha (introdução), dias 1 a 14

| Dia | Seção | Conteúdo |
|---|---|---|
| 1 | 1.1 | Para que serve uma rede: informação, comunicação, comércio, entretenimento, internet das coisas |
| 2 | 1.2 | Tipos de rede: banda larga, móvel, provedor de conteúdo, trânsito, corporativa |
| 3 | 1.3.1 a 1.3.3 | Rede pessoal, local e doméstica |
| 4 | 1.3.4 a 1.3.6 | Rede metropolitana, de longa distância e a interligação de redes |
| 5 | 1.4.1 | A Internet: como ela é montada, de casa ao backbone |
| 6 | 1.4.2 e 1.4.3 | Rede de telefonia móvel e Wi-Fi como exemplos |
| 7 | 1.5.1 e 1.5.2 | Objetivos de projeto e camadas de protocolos |
| 8 | 1.5.3 a 1.5.5 | Conexão, confiabilidade, primitivas de serviço, serviço contra protocolo |
| 9 | 1.6.1 e 1.6.2 | Modelo OSI e modelo TCP/IP: o encapsulamento na prática |
| 10 | 1.6.3 a 1.6.5 | Críticas aos dois modelos e o modelo de cinco camadas |
| 11 | 1.7 | Padronização: código aberto, telecomunicações, padrões internacionais, IETF e RFCs |
| 12 | 1.8.1 e 1.8.2 | Discurso on-line e neutralidade da rede |
| 13 | 1.8.3 a 1.8.5 | Segurança, privacidade e desinformação |
| 14 | 1.9 | Unidades de medida: bit, byte, prefixos decimais e binários |

### Ato 1: A Rua (camada física), dias 15 a 40

| Dia | Seção | Conteúdo |
|---|---|---|
| 15 | 2.1.1 | Armazenamento persistente como meio (a caminhonete cheia de discos) |
| 16 | 2.1.2 | Par trançado: crimpagem, T568A/B |
| 17 | 2.1.2 | Par trançado: categorias, 100 m, cruzado e direto |
| 18 | 2.1.2 | Par trançado: ruído, blindagem e aterramento |
| 19 | 2.1.3 | Cabo coaxial |
| 20 | 2.1.4 | Linhas de energia elétrica (PLC) |
| 21 | 2.1.5 | Fibra óptica: monomodo, multimodo, dispersão |
| 22 | 2.1.5 | Fibra óptica: orçamento de potência |
| 23 | 2.1.5 | Fibra óptica: OTDR e fusão |
| 24 | 2.2.1 | O espectro eletromagnético |
| 25 | 2.2.2 a 2.2.4 | Espectro espalhado: salto de frequência, sequência direta, banda ultralarga |
| 26 | 2.3.1 e 2.3.2 | Rádio e micro-ondas: espaço livre, alinhamento, Fresnel |
| 27 | 2.3.3 e 2.3.4 | Infravermelho e luz (enlace óptico no ar) |
| 28 | 2.4.1 | Fourier e banda: por que o sinal se deforma |
| 29 | 2.4.2 | Nyquist e Shannon |
| 30 | 2.4.3 | Modulação digital: ASK, FSK, PSK, QAM, constelações |
| 31 | 2.4.4 | Multiplexação: frequência, tempo, código, comprimento de onda |
| 32 | 2.5.1 e 2.5.2 | Telefonia: estrutura, circuito terminal, modem, ADSL, fibra até a casa |
| 33 | 2.5.3 | Troncos e TDM: o E1 |
| 34 | 2.5.4 | Comutação de circuitos e de pacotes |
| 35 | 2.6.1 a 2.6.4 | Celular: células, handoff, paging, 1G, 2G, GSM |
| 36 | 2.6.5 a 2.6.7 | Celular: 3G, 4G, 5G |
| 37 | 2.7 | Rede por cabo: HFC, DOCSIS, nós e minislots |
| 38 | 2.8 | Satélites: geoestacionário, órbita média e baixa |
| 39 | 2.9 | Comparar redes de acesso: cabo, fibra, ADSL, satélite |
| 40 | 2.10 | Política na camada física: espectro, celular, telefonia |

### Ato 2: A Linha (camada de enlace), dias 41 a 53

| Dia | Seção | Conteúdo |
|---|---|---|
| 41 | 3.1.1 | Serviços que o enlace oferece à rede |
| 42 | 3.1.2 | Enquadramento por contagem e por flags |
| 43 | 3.1.2 | Escape de bytes |
| 44 | 3.1.2 | Enchimento de bits |
| 45 | 3.1.3 e 3.1.4 | Controle de erros e de fluxo |
| 46 | 3.2.1 | Correção de erros: Hamming (e a ideia de códigos convolucionais, Reed-Solomon e LDPC) |
| 47 | 3.2.2 | Detecção: paridade, soma de verificação |
| 48 | 3.2.2 | Detecção: CRC à mão |
| 49 | 3.3 | Protocolos básicos: simplex, pare e espere, timeout, número de sequência |
| 50 | 3.4 | Janela deslizante: encher o cano |
| 51 | 3.4 | Go-back-N e o tamanho da janela |
| 52 | 3.4 | Retransmissão seletiva |
| 53 | 3.5 | Exemplos: pacotes sobre SONET (PPP), ADSL e DOCSIS |

### Ato 3: O Bairro (subcamada MAC), dias 54 a 71

| Dia | Seção | Conteúdo |
|---|---|---|
| 54 | 4.1 | O problema de dividir um canal: alocação estática contra dinâmica |
| 55 | 4.2.1 | ALOHA puro e com intervalos |
| 56 | 4.2.2 | CSMA, CSMA/CD |
| 57 | 4.2.3 e 4.2.4 | Protocolos livres de colisão e de disputa limitada |
| 58 | 4.2.5 | MAC sem fio: terminal oculto e exposto, MACA |
| 59 | 4.3.1 e 4.3.2 | Ethernet clássica: cabo, quadro, endereço MAC, recuo exponencial |
| 60 | 4.3.3 | Desempenho da Ethernet |
| 61 | 4.3.4 | Ethernet comutada: hub contra switch |
| 62 | 4.3.5 a 4.3.9 | Fast, Gigabit, 10G, 40G e 100G |
| 63 | 4.4.1 e 4.4.2 | Wi-Fi: arquitetura e camada física (do 802.11b ao Wi-Fi 6) |
| 64 | 4.4.3 | Wi-Fi: CSMA/CA, RTS/CTS |
| 65 | 4.4.4 e 4.4.5 | Wi-Fi: quadro, associação, autenticação |
| 66 | 4.5 | Bluetooth: arquitetura, rádio, enlace, quadro, Bluetooth 5 |
| 67 | 4.6 | DOCSIS: alcance e alocação de banda |
| 68 | 4.7.1 e 4.7.2 | Bridges e aprendizado de endereços |
| 69 | 4.7.3 | Spanning tree: matando o laço |
| 70 | 4.7.4 | Repetidor, hub, bridge, switch, roteador, gateway: quem é de qual camada |
| 71 | 4.7.5 | VLANs |

### Ato 4: A Cidade (camada de rede), dias 72 a 95

| Dia | Seção | Conteúdo |
|---|---|---|
| 72 | 5.1.1 e 5.1.2 | Armazena e repassa; serviços para o transporte |
| 73 | 5.1.3 a 5.1.5 | Datagramas contra circuitos virtuais |
| 74 | 5.2.1 e 5.2.2 | Princípio de otimização e caminho mais curto (Dijkstra) |
| 75 | 5.2.3 | Inundação |
| 76 | 5.2.4 | Vetor de distância e a contagem ao infinito |
| 77 | 5.2.5 | Estado de enlace |
| 78 | 5.2.6 | Roteamento hierárquico |
| 79 | 5.2.7 a 5.2.9 | Broadcast, multicast e anycast |
| 80 | 5.3 | Congestionamento e como controlar |
| 81 | 5.4.1 a 5.4.3 | Requisitos de QoS, superprovisionamento, filas e escalonamento |
| 82 | 5.4.4 e 5.4.5 | Serviços integrados e diferenciados |
| 83 | 5.5.1 a 5.5.4 | Interligar redes diferentes, túneis |
| 84 | 5.5.5 e 5.5.6 | Roteamento entre redes e fragmentação |
| 85 | 5.6 | Redes definidas por software |
| 86 | 5.7.1 | O cabeçalho IPv4 |
| 87 | 5.7.2 | Endereços IP, sub-redes, CIDR |
| 88 | 5.7.2 | NAT |
| 89 | 5.7.3 | IPv6 |
| 90 | 5.7.4 | ICMP, ARP, DHCP |
| 91 | 5.7.5 | MPLS |
| 92 | 5.7.6 | OSPF |
| 93 | 5.7.7 | BGP |
| 94 | 5.7.8 | Multicast na Internet |
| 95 | 5.8 | Política na camada de rede: disputas entre redes e priorização |

### Ato 5: A Conversa (camada de transporte), dias 96 a 106

| Dia | Seção | Conteúdo |
|---|---|---|
| 96 | 6.1 | Serviço de transporte, primitivas, soquetes |
| 97 | 6.2.1 a 6.2.3 | Endereçamento por porta, abrir e fechar conexão (o aperto de mão em três vias) |
| 98 | 6.2.4 a 6.2.6 | Erros, fluxo, multiplexação e recuperação de falhas |
| 99 | 6.3 | Controle de congestionamento: justiça e AIMD |
| 100 | 6.4 | UDP, RPC e tempo real (RTP) |
| 101 | 6.5.1 a 6.5.6 | TCP: serviço, cabeçalho, conexão e encerramento |
| 102 | 6.5.7 e 6.5.8 | TCP: estados e janela deslizante |
| 103 | 6.5.9 | TCP: timers e cálculo do RTO |
| 104 | 6.5.10 e 6.5.11 | TCP: partida lenta, recuperação rápida, CUBIC |
| 105 | 6.6 | QUIC e BBR |
| 106 | 6.7 | Desempenho: medir vazão, qualidade de experiência, redes longas e rápidas |

### Ato 6: O Show (camada de aplicação), dias 107 a 114

| Dia | Seção | Conteúdo |
|---|---|---|
| 107 | 7.1.1 a 7.1.4 | DNS: hierarquia, consultas, registros |
| 108 | 7.1.5 a 7.1.8 | DNS: resolução, prática, privacidade, disputa por nomes |
| 109 | 7.2 | Correio eletrônico: agentes, formato, transferência, entrega |
| 110 | 7.3.1 a 7.3.3 | Web: arquitetura, páginas estáticas e dinâmicas |
| 111 | 7.3.4 e 7.3.5 | HTTP, HTTPS e privacidade na web |
| 112 | 7.4 | Streaming: áudio e vídeo digital, armazenado e ao vivo |
| 113 | 7.5.1 a 7.5.3 | Entrega de conteúdo: servidores, proxies, CDN |
| 114 | 7.5.4 e 7.5.5 | Peer-to-peer e a evolução da internet |

### Ato 7: O Cerco (segurança), dias 115 a 122

| Dia | Seção | Conteúdo |
|---|---|---|
| 115 | 8.1 e 8.2 | Princípios de segurança e ingredientes de um ataque: exploração, farejamento, falsificação, interrupção |
| 116 | 8.3 | Firewall e detecção de intrusão |
| 117 | 8.4 e 8.5 | Criptografia: substituição, transposição, chave única, DES, AES, modos de cifra |
| 118 | 8.6 e 8.7 | Chave pública (RSA), assinaturas, resumos e o ataque do aniversário |
| 119 | 8.8 e 8.9 | Certificados, X.509, infraestrutura de chaves, autenticação, Diffie-Hellman, Kerberos |
| 120 | 8.10 | IPsec, VPN e segurança no Wi-Fi |
| 121 | 8.11 e 8.12 | Correio seguro, DNSSEC, TLS, código não confiável |
| 122 | 8.13 | Questões sociais: anonimato, liberdade de expressão, direitos autorais. Final: Fim de Linha vira ponto de troca de tráfego |

## 6. Regras de conteúdo

- Todo texto e todo exercício são originais. Nenhum livro, autor ou fabricante é citado no jogo, no README, nos metadados ou nos commits.
- Marcas são paródias, domínios usam `.exemplo`, IPs públicos usam faixas de documentação.
- Nenhum travessão nos textos; textos neutros quanto ao gênero de quem joga.
- Todo número citado num texto é conferido contra a simulação por teste.

## 7. Ordem de construção

1. **Camada de história e formato**: mapa da cidade, cartas, abertura e encerramento de ato, aula e desafio. Aplicado primeiro aos dias que já existem, reorganizados na numeração nova.
2. **Lugares em 3D**: um cenário por ato, começando pelo galpão e pela rua.
3. **Completar os atos 0, 1 e 2** com os dias que faltam no mapa de cobertura.
4. **Atos 3 a 7**, um de cada vez, cada um publicado quando ficar pronto.

Situação: os quatro passos estão feitos: o prólogo e os 126 dias escritos, e um lugar 3D próprio por ato (src/tres/lugares.ts).
