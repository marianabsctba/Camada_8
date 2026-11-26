// Dias do ato 5 (A Conversa), com prática guiada, aula e desafio no próprio dia.
// Dias da camada de transporte, na sala dos servidores: QUIC e BBR (6.6) e medir desempenho de verdade
// (6.7.1 a 6.7.4), até a videochamada do hospital ficar estável. As redes rápidas (6.7.5 a 6.7.8) estão em ato5e.

import { assinaturaTcp, configTcp } from '../motor/transporte';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { configurarNat } from '../motor/roteamento';
import { escutar } from '../motor/transporte';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

const CLIENTE = 'telemed';
const VIDEO = '203.0.113.10';
const MEDIDOR = '203.0.113.20';
const IP_NOVO = '198.51.100.77';

interface OpcoesCaminho {
  semente: number;
  /** Servidor do outro lado: o de videochamada (dia 110) ou o de medição (dia 111). */
  servidor: 'video' | 'medidor';
  /** Banda do rádio do hospital até a capital, em Mb/s (até 100). */
  mbps: number;
  /** Fila da saída do rádio, em pacotes. */
  buffer: number;
  /** Atraso extra de cada sentido já presente no emulador, em segundos. */
  atraso?: number;
  /** Perda aleatória do trecho sem fio. */
  perda?: number;
  /** Serviços que já escutam no servidor. */
  escuta?: ['tcp' | 'udp', number][];
  /** Configuração TCP herdada no cliente. */
  tcp?: { janela?: number; escala?: number };
}

/**
 * A estação da sala de telemedicina (10.50.2.10) sai pela borda-hosp, que faz NAT, sobe pelo rádio até o roteador
 * da operadora na capital e chega ao data center (203.0.113.0/24), onde fica o servidor de videochamada ou o
 * servidor de medição. O rádio é o gargalo; o emulador de rede no cliente faz o papel dos quilômetros até a capital.
 */
function mundoCapital(o: OpcoesCaminho): Mundo {
  const m = novoMundo(o.semente);
  m.flags.transporte = true;
  adicionar(m, pc(CLIENTE, { ip: cidr('10.50.2.10/24'), gateway: '10.50.2.1', modelo: 'Estação da sala de telemedicina' }));
  const srvIp = o.servidor === 'video' ? VIDEO : MEDIDOR;
  const srvNome = o.servidor === 'video' ? 'srv-video' : 'medidor';
  adicionar(m, pc(srvNome, { ip: cidr(`${srvIp}/24`), gateway: '203.0.113.1', modelo: o.servidor === 'video' ? 'Servidor de videochamada Plantão Vivo (data center da capital)' : 'Servidor de medição Régua Certa da operadora' }));
  const borda = adicionar(m, roteador('borda-hosp', { modelo: 'Roteador de borda do hospital, com NAT', interfaces: { lan: '10.50.2.1/24', wan: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('capital', { modelo: 'Roteador da operadora na capital', interfaces: { wan: '198.51.100.2/30', dc: '203.0.113.1/24' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.1' }] }));
  configurarNat(borda, ['lan'], 'wan');
  borda.portas.find((p) => p.nome === 'wan')!.velocidades = [100];
  borda.s.fila = { wan: { buffer: o.buffer, capacidade: o.mbps } };
  ligar(m, { equip: CLIENTE, porta: 'eth0' }, { equip: 'borda-hosp', porta: 'lan' }, 'cat6', 20, { id: 'c1' });
  ligar(m, { equip: 'borda-hosp', porta: 'wan' }, { equip: 'capital', porta: 'wan' }, 'cat6', 80, { id: 'c2' });
  ligar(m, { equip: 'capital', porta: 'dc' }, { equip: srvNome, porta: 'eth0' }, 'cat6', 20, { id: 'c3' });
  m.proxCabo = 4;
  const cli = m.equipamentos.get(CLIENTE)!;
  const cam: { atraso?: number; perda?: number } = {};
  if (o.atraso) cam.atraso = o.atraso;
  if (o.perda) cam.perda = o.perda;
  if (Object.keys(cam).length) cli.s.caminhoTransporte = cam;
  if (o.tcp) cli.s.tcp = { ...o.tcp };
  const srv = m.equipamentos.get(srvNome)!;
  for (const [proto, porta] of o.escuta ?? []) escutar(m, srv, proto, porta);
  return m;
}

function cliente(m: Mundo) {
  return m.equipamentos.get(CLIENTE)!;
}

function caminhoCli(m: Mundo): { atraso?: number; perda?: number; buffer?: number } {
  return (cliente(m).s.caminhoTransporte ?? {}) as { atraso?: number; perda?: number; buffer?: number };
}

/* ---------- registros do QUIC e dos algoritmos ---------- */

interface QuicConexao {
  de: string;
  ip: string;
  ok: boolean;
  rttMs: number;
  tcpTls13Ms: number;
  quicMs: number;
  quic0rttMs: number;
}

interface QuicFila {
  de: string;
  ip: string;
  objetos: number;
  travadosNoTcp: number;
  esperaTcpMs: number;
  esperaQuicMs: number;
}

interface QuicMigracao {
  de: string;
  ip: string;
  ipNovo: string;
  paradoTcpMs: number;
  paradoQuicMs: number;
}

interface ResAlg {
  vazaoMbps: number;
  filaMedia: number;
  atrasoFilaMs: number;
}

interface Comparacao {
  de: string;
  ip: string;
  buffer: number;
  perda: number;
  resultados: Record<'reno' | 'cubic' | 'bbr', ResAlg>;
  assinatura: string;
}

function quic(m: Mundo): { conexao?: QuicConexao; cabecaDeFila?: QuicFila; migracao?: QuicMigracao } {
  return (m.flags.quic ?? {}) as { conexao?: QuicConexao; cabecaDeFila?: QuicFila; migracao?: QuicMigracao };
}

function conexaoOk(m: Mundo): QuicConexao | undefined {
  const c = quic(m).conexao;
  return c && c.de === CLIENTE && c.ip === VIDEO && c.ok ? c : undefined;
}

function filaOk(m: Mundo): QuicFila | undefined {
  const f = quic(m).cabecaDeFila;
  return f && f.de === CLIENTE && f.ip === VIDEO && f.objetos >= 2 && f.esperaTcpMs > 2 * f.esperaQuicMs ? f : undefined;
}

function migracaoOk(m: Mundo): QuicMigracao | undefined {
  const g = quic(m).migracao;
  return g && g.de === CLIENTE && g.ip === VIDEO && g.paradoQuicMs < g.paradoTcpMs ? g : undefined;
}

/** A última comparação; com "atual", só se foi feita com a configuração TCP e o caminho de agora. */
function comparacao(m: Mundo, atual = true): Comparacao | undefined {
  const c = m.flags.comparacao as Comparacao | undefined;
  return c && c.de === CLIENTE && c.ip === VIDEO && (!atual || c.assinatura === assinaturaTcp(cliente(m))) ? c : undefined;
}

function algoritmoBbr(m: Mundo): ItemObjetivo {
  const a = configTcp(cliente(m)).algoritmo;
  return item('a estação da telemedicina usando BBR no controle de congestionamento', a === 'bbr', `algoritmo ${a.toUpperCase()}`);
}

/* ======================================================================
 * ref 110: QUIC e BBR (6.6)
 * ====================================================================== */

/** A borda do hospital veio com uma fila de 1000 pacotes no rádio: terreno de bufferbloat. */
const BUFFER_GRANDE = 1000;

const d110: Pergunta[] = [
  numerica(
    '1',
    'Quantos milissegundos o QUIC economiza, até o primeiro byte da resposta, em relação ao TCP com TLS 1.3?',
    (m) => {
      const c = conexaoOk(m);
      return c ? c.tcpTls13Ms - c.quicMs : NaN;
    },
    1,
  ),
];

const d110D: Pergunta[] = [
  numerica(
    '1',
    'Quando o celular do plantão troca de rede, por quantos milissegundos a chamada QUIC fica parada?',
    (m) => quic(m).migracao?.paradoQuicMs ?? NaN,
    1,
  ),
];

const dia110: Dia = {
  numero: 110,
  ato: 5,
  titulo: 'QUIC e BBR',
  chamado: [
    'CHAMADO #0110',
    'A videochamada da telemedicina com o especialista da capital ainda demora a conectar, congela inteira quando um único pacote some e, pior, cai toda vez que o celular do plantão sai do Wi-Fi do hospital. A operadora trocou o rádio e a borda-hosp veio com uma fila de 1000 pacotes "para não perder nada".',
    'O servidor de videochamada do data center já fala QUIC na porta UDP 443 e TCP na 80. Falta provar, com números, o que muda.',
    'Objetivo: abrir uma conexão QUIC e responder quanto ela economiza, comparar a perda num fluxo do QUIC com o TCP, simular a troca de rede, comparar Reno, CUBIC e BBR com a fila gigante e deixar a estação em BBR.',
  ],
  manual: {
    titulo: 'QUIC e BBR: o transporte de agora',
    texto: [
      'Até aqui a conversa da web era TCP, e por cima dele o TLS para cifrar. Cada um tem o seu aperto de mão: o TCP gasta 1 RTT no SYN, SYN+ACK e ACK; o TLS 1.3 gasta mais 1; só então sai o pedido, que leva mais 1 RTT até a resposta começar a chegar. São 3 RTT até o primeiro byte (4 com o TLS 1.2). Num caminho de 40 ms, isso é mais de um décimo de segundo de tela parada, a cada conexão.',
      'O QUIC é um transporte novo que roda em cima do UDP, porque os roteadores, firewalls e NATs do caminho só deixam passar TCP e UDP, e mexer em todos eles levaria décadas. Ele faz no espaço do usuário o que o TCP fazia no sistema: confiabilidade, controle de fluxo e de congestionamento. A diferença é que o TLS 1.3 vai embutido no próprio aperto de mão do transporte: em 1 RTT a conexão está aberta e cifrada, e o primeiro byte chega em 2 RTT. Numa retomada, com a chave guardada da conversa anterior, o pedido vai já no primeiro pacote (0-RTT) e a resposta chega em 1 RTT. O preço: alguém pode repetir aquele primeiro pacote, então o 0-RTT só serve para pedido que pode repetir sem estrago.',
      'O QUIC também resolve o bloqueio de cabeça de fila. Uma conexão TCP é um fluxo único de bytes entregue em ordem: se o segmento 3 se perde, o 4, o 5 e o 6, que já chegaram, esperam a retransmissão, mesmo que sejam de outra imagem ou de outro objeto. No QUIC, cada objeto anda num fluxo próprio, com a sua ordem; a perda de um fluxo só atrasa aquele fluxo. E a conexão é reconhecida por um identificador de conexão que vai em todo pacote, não pela quádrupla de IPs e portas. Quando o celular troca o Wi-Fi pela rede móvel e o IP muda, o TCP morre e recomeça do zero; o QUIC valida o caminho novo em 1 RTT e segue.',
      'O outro lado da mudança é o controle de congestionamento. Reno e CUBIC aumentam a janela até perder pacote; perda é o sinal de que a rede encheu. Com um buffer enorme no gargalo, a perda demora a vir, e até lá a fila inteira enche: todo pacote espera centenas de milissegundos (o bufferbloat). Com perda aleatória, como num rádio com ruído, cortam a janela por um problema que não é congestionamento. O BBR troca o sinal: mede a banda do gargalo (a maior taxa de entrega que viu) e o RTT mínimo (o caminho com a fila vazia), e manda nesse ritmo, com só um pouco além do produto banda × atraso em voo. A fila fica pequena e uma perda isolada não o assusta.',
      'E o TCP? Continua aí, por baixo de quase tudo que não é web, e continua mudando: janela inicial maior, confirmação seletiva, novas formas de controle de congestionamento, versões com vários caminhos ao mesmo tempo. O caminho geral é este: menos idas e voltas para começar, menos dependência da perda como sinal e mais medição do que a rede está fazendo de verdade.',
    ],
  },
  dicas: [
    'As ações de QUIC estão na estação telemed, com destino 203.0.113.10 e porta UDP 443. O resultado da conexão mostra o tempo de cada pilha até o primeiro byte.',
    'A economia do QUIC sobre o TCP com TLS 1.3 é de exatamente 1 RTT: a diferença entre as linhas "TCP + TLS 1.3" e "QUIC".',
    'Para os algoritmos, use "Comparar Reno, CUBIC e BBR" com destino 203.0.113.10 e porta 80, e depois escolha BBR em "Controle de congestionamento".',
  ],
  perguntas: d110,
  montar: () => mundoCapital({ semente: 5110, servidor: 'video', mbps: 20, buffer: BUFFER_GRANDE, atraso: 0.02, escuta: [['tcp', 80], ['udp', 443]] }),
  objetivo: (m) => {
    const c = conexaoOk(m);
    const f = filaOk(m);
    const g = migracaoOk(m);
    const cmp = comparacao(m, false);
    const fila = cmp ? `fila média: Reno ${cmp.resultados.reno.filaMedia.toFixed(1)}, BBR ${cmp.resultados.bbr.filaMedia.toFixed(1)} pacotes` : 'nenhuma comparação feita';
    return [
      item('conexão QUIC aberta da telemed até 203.0.113.10 na porta UDP 443', !!c, c ? `QUIC ${c.quicMs.toFixed(1)} ms, TCP + TLS 1.3 ${c.tcpTls13Ms.toFixed(1)} ms` : 'ainda não'),
      item('objetos na mesma conexão com uma perda: no QUIC o segmento espera bem menos que no TCP', !!f, f ? `espera média TCP ${f.esperaTcpMs.toFixed(1)} ms, QUIC ${f.esperaQuicMs.toFixed(1)} ms` : 'ainda não comparado'),
      item('troca de endereço simulada: o QUIC fica menos tempo parado que o TCP', !!g, g ? `parado: TCP ${g.paradoTcpMs.toFixed(1)} ms, QUIC ${g.paradoQuicMs.toFixed(1)} ms` : 'ainda não simulada'),
      item(`Reno, CUBIC e BBR comparados com a fila de ${BUFFER_GRANDE} pacotes, e o BBR com fila menor`, !!cmp && cmp.buffer >= 500 && cmp.resultados.bbr.filaMedia < cmp.resultados.reno.filaMedia, fila),
      algoritmoBbr(m),
      ...todasRespondidas(m, d110),
    ];
  },
  posMorte: [
    'A demora para conectar era aperto de mão empilhado. Com 40 ms de ida e volta até a capital, o TCP com TLS 1.3 só entrega o primeiro byte em 3 RTT, uns 120 ms; o QUIC junta o transporte e a criptografia e entrega em 2 RTT, uns 80 ms; numa reconexão com 0-RTT, em 1 RTT. Não parece muito até lembrar que uma chamada abre várias conexões, e cada uma pagava o pedágio inteiro.',
    'O congelamento era bloqueio de cabeça de fila: imagem, áudio e compartilhamento de tela iam no mesmo fluxo de bytes do TCP, e um segmento perdido de um deles segurava todos os outros. A queda na troca de rede era a quádrupla: com IP novo, o servidor não reconhecia a conexão TCP e ela recomeçava do zero, com RST, aperto de mão, TLS e partida lenta, uns 160 ms parada. O QUIC reconheceu o identificador de conexão vindo do endereço novo, validou o caminho e seguiu depois de 1 RTT.',
    'A fila de 1000 pacotes era a armadilha clássica: Reno e CUBIC só freiam quando perdem, e com tanto espaço a perda demora, então eles enchem a fila e todo mundo espera centenas de milissegundos atrás dela. O BBR mediu a banda do rádio e o RTT mínimo e mandou só o que cabia: quase a mesma vazão, com a fila praticamente vazia. Para uma videochamada, isso é a diferença entre conversar e falar por cima um do outro.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['Sobre o UDP', 'Sobre o TCP', 'Direto sobre o IP, com número de protocolo próprio', 'Sobre o TLS 1.2'],
        certa: 0,
        errada: {
          1: 'Se fosse sobre o TCP, herdaria o fluxo único de bytes e o bloqueio de cabeça de fila, que é justamente o que ele quer evitar.',
          2: 'Daria para fazer, mas firewalls e NATs do caminho jogam fora o que não é TCP nem UDP. Um protocolo novo direto no IP não passaria por quase nenhuma rede.',
          3: 'O QUIC usa o TLS 1.3, e embutido no próprio aperto de mão. O TLS não é transporte: ele precisa de alguém que leve os bytes.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes de conectar: em cima de que protocolo o QUIC roda?',
      porque: 'Um transporte novo precisa atravessar redes que já existem, cheias de NATs e firewalls que só conhecem TCP e UDP.',
      feito: 'Sobre o UDP, que só traz portas e checksum. Todo o resto (confiabilidade, ordem por fluxo, congestionamento, criptografia) o QUIC faz por conta própria, fora do sistema operacional.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-quic-conectar',
      valores: { ip: VIDEO, porta: '443' },
      instrucao: 'Na estação telemed, abra uma conexão QUIC com o servidor de videochamada (203.0.113.10, porta UDP 443).',
      porque: 'O resultado mostra, no mesmo caminho, quantas idas e voltas cada pilha gasta até o primeiro byte da resposta.',
      conferir: (m) => {
        if (conexaoOk(m)) return true;
        const c = quic(m).conexao;
        if (c && !c.ok) return 'O servidor não tem nada escutando nessa porta UDP. A videochamada fica na 443.';
        return 'A conexão QUIC ainda não foi aberta até 203.0.113.10.';
      },
      feito: 'RTT de uns 40 ms até a capital. TCP com TLS 1.3: 3 RTT até o primeiro byte. QUIC: 2 RTT. Retomada em 0-RTT: 1 RTT.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '40' },
      instrucao: 'Quantos milissegundos o QUIC economiza, até o primeiro byte, em relação ao TCP com TLS 1.3?',
      porque: 'O TCP gasta 1 RTT no próprio aperto de mão antes de o TLS começar. O QUIC faz os dois no mesmo voo.',
      feito: 'Exatamente 1 RTT, uns 40 ms por conexão. Somando as conexões que uma chamada abre, a tela para bem menos.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-quic-fluxos',
      valores: { ip: VIDEO, porta: '443' },
      pedir: ['objetos'],
      exemplo: { objetos: '4' },
      instrucao: 'Mande vários objetos na mesma conexão (imagem, áudio, tela, chat) e compare TCP e QUIC com uma perda.',
      porque: 'O motor perde a mesma transmissão nos dois. No TCP tudo é um fluxo só, entregue em ordem; no QUIC cada objeto tem o seu fluxo.',
      conferir: (m) => {
        const f = quic(m).cabecaDeFila;
        if (!f) return 'A comparação ainda não foi feita.';
        if (f.objetos < 2) return 'Com um objeto só não existe "os outros" para ficar esperando. Use pelo menos 2.';
        return filaOk(m) ? true : 'Os dois empataram desta vez. Tente com 3 ou 4 objetos.';
      },
      feito: 'No TCP, os segmentos que chegaram depois do perdido ficaram parados no buffer esperando a retransmissão; no QUIC, só o fluxo que perdeu esperou. A espera média de um segmento cai várias vezes.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-quic-migrar',
      valores: { ip: VIDEO, porta: '443', novo: IP_NOVO },
      instrucao: 'Simule o celular do plantão saindo do Wi-Fi para a rede móvel no meio da chamada (o endereço passa a ser 198.51.100.77).',
      porque: 'O TCP reconhece a conexão pela quádrupla de IPs e portas. O QUIC, por um identificador de conexão que vai em todo pacote.',
      conferir: (m) => (migracaoOk(m) ? true : 'A troca de endereço ainda não foi simulada até 203.0.113.10.'),
      feito: 'TCP: RST, aperto de mão, TLS e pedido de novo, 4 RTT parado. QUIC: PATH_CHALLENGE e PATH_RESPONSE no caminho novo, 1 RTT, e a conexão segue.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-comparar',
      valores: { ip: VIDEO, porta: '80' },
      instrucao: 'Compare Reno, CUBIC e BBR no mesmo caminho, com a fila de 1000 pacotes da borda-hosp.',
      porque: 'Quem só freia na perda enche o buffer antes de frear. Olhe a coluna da fila média e a da espera na fila.',
      conferir: (m) => {
        const c = comparacao(m);
        if (!c) return 'A comparação ainda não foi feita com a configuração de agora.';
        return c.resultados.bbr.filaMedia < c.resultados.reno.filaMedia ? true : 'O BBR não ficou com fila menor desta vez. Rode a comparação de novo.';
      },
      feito: 'Vazões parecidas, perto dos 20 Mb/s do rádio. Mas Reno e CUBIC mantêm centenas de pacotes na fila e centenas de milissegundos de espera; o BBR fica com poucos pacotes e uns poucos milissegundos.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-algoritmo',
      pedir: ['alg'],
      exemplo: { alg: 'bbr' },
      instrucao: 'Escolha o controle de congestionamento que deixa a fila vazia para a videochamada.',
      porque: 'Voz e vídeo sofrem com atraso, não com falta de banda. O algoritmo certo é o que não enche a fila para descobrir o limite.',
      conferir: (m) => {
        const a = configTcp(cliente(m)).algoritmo;
        if (a === 'bbr') return true;
        if (a === 'cubic') return 'O CUBIC foi o que mais encheu a fila na comparação: ele volta rápido para perto do máximo antigo e só freia na perda.';
        return 'O Reno também só freia quando perde, depois de encher a fila. Escolha o que mede banda e RTT mínimo.';
      },
      feito: 'BBR ligado. Ele vai alternar entre medir a banda (mandando um pouco a mais por um instante) e medir o RTT mínimo (esvaziando a fila de vez em quando), sempre perto do ponto em que o cano está cheio e a fila, vazia.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Idas e voltas até o primeiro byte',
        texto: ['Cada aperto de mão custa RTTs antes de qualquer dado útil. O QUIC junta o do transporte com o da criptografia; na retomada, manda o pedido no primeiro pacote.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Pilha', 'RTT até o 1º byte', 'Com RTT de 40 ms'],
          linhas: [
            ['TCP + TLS 1.2', '4', 'uns 160 ms'],
            ['TCP + TLS 1.3', '3', 'uns 120 ms'],
            ['QUIC', '2 (abre em 1)', 'uns 80 ms'],
            ['QUIC em 0-RTT', '1', 'uns 40 ms'],
          ],
        },
      },
      {
        titulo: 'Onde o QUIC mora',
        texto: ['Os roteadores do caminho só veem UDP. Confiabilidade, fluxos, congestionamento e TLS ficam todos dentro do QUIC, num programa comum, que se atualiza sem trocar o sistema operacional.'],
        visual: { tipo: 'camadas', camadas: ['HTTP/3 (a aplicação)', 'QUIC: fluxos, confiabilidade, congestionamento e TLS 1.3 juntos', 'UDP: portas e checksum', 'IP'], rotulo: 'a pilha da web nova' },
      },
      {
        titulo: 'Cabeça de fila',
        texto: ['No TCP, um fluxo de bytes só: o segmento perdido segura todos os que vêm depois, de qualquer objeto. No QUIC, cada objeto tem a sua ordem, e o buraco só segura o próprio fluxo.'],
        visual: { tipo: 'janela', total: 12, janela: 8, perdido: 3 },
      },
      {
        titulo: 'Troca de rede sem cair',
        texto: ['O TCP é a quádrupla: mudou o IP, é outra conexão. O QUIC é o identificador de conexão, que o servidor reconhece venha de onde vier; ele só confere se o caminho novo responde.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'wifi', rotulo: 'celular no Wi-Fi', x: 80, y: 60 },
            { id: 'movel', rotulo: 'celular na rede móvel (IP novo)', x: 80, y: 220 },
            { id: 'srv', rotulo: 'servidor de videochamada', x: 480, y: 140 },
          ],
          ligacoes: [
            ['wifi', 'srv', 'identificador 8394c8f0...'],
            ['movel', 'srv', 'mesmo identificador, PATH_CHALLENGE'],
          ],
        },
      },
      {
        titulo: 'Perda ou medida?',
        texto: ['Reno e CUBIC aceleram até perder; o BBR mede a banda do gargalo e o RTT mínimo e manda nesse ritmo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Reno e CUBIC', 'BBR'],
          linhas: [
            ['buffer enorme no gargalo', 'enchem a fila: centenas de ms de espera', 'fila quase vazia'],
            ['perda aleatória (rádio com ruído)', 'cortam a janela à toa: vazão despenca', 'mantém a vazão'],
            ['sinal que usam', 'perda de pacote', 'banda entregue e RTT mínimo'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Num rádio com 2 % de perda por ruído, por que o BBR tende a ir muito melhor que o Reno?',
      opcoes: [
        'Porque o BBR não trata cada perda como congestionamento: ele segue a banda e o RTT que mede',
        'Porque o BBR retransmite cada pacote duas vezes',
        'Porque o BBR usa UDP em vez de TCP',
        'Porque o BBR desliga a confirmação dos segmentos',
      ],
      certa: 0,
      explicacao: 'O Reno corta a janela pela metade a cada perda, e num rádio ruidoso as perdas não têm nada a ver com fila cheia: a vazão despenca à toa. O BBR estima a banda do gargalo e o RTT mínimo e manda nesse ritmo; uma perda isolada é só um pacote para retransmitir.',
    },
  },
  desafio: {
    carta: [
      'O plantão agora atende em casa: o médico liga pelo celular, e o trecho até o hospital passa por um rádio com ruído que perde 2 % dos pacotes. O caminho até a capital também ficou mais longo, com uns 60 ms de ida e volta.',
      'E o servidor de videochamada foi reinstalado ontem: o TCP 80 voltou, mas ninguém lembrou do QUIC.',
      'Objetivo: o QUIC de volta e uma conexão aberta, a troca de rede simulada, os três algoritmos comparados com a perda do rádio (com a estação já em BBR) e a pergunta respondida.',
    ],
    dicas: [
      'O QUIC roda sobre UDP: no srv-video, abra o serviço em UDP 443. Depois, da telemed, conecte e simule a troca de endereço.',
      'O tempo parado do QUIC na troca de rede é 1 RTT, que aparece na linha "Parado".',
      'Escolha BBR primeiro e compare depois: a comparação só vale para a configuração que estava em vigor quando rodou.',
    ],
    perguntas: d110D,
    montar: () => mundoCapital({ semente: 6110, servidor: 'video', mbps: 20, buffer: 64, atraso: 0.03, perda: 0.02, escuta: [['tcp', 80]] }),
    objetivo: (m) => {
      const c = conexaoOk(m);
      const g = migracaoOk(m);
      const cmp = comparacao(m);
      const melhor = !!cmp && cmp.perda > 0 && cmp.resultados.bbr.vazaoMbps > 2 * cmp.resultados.reno.vazaoMbps;
      return [
        item('conexão QUIC aberta até 203.0.113.10 na porta UDP 443', !!c, c ? `QUIC ${c.quicMs.toFixed(1)} ms` : quic(m).conexao ? 'o servidor não escuta em UDP 443' : 'ainda não'),
        item('troca de endereço simulada, com o QUIC parado menos tempo que o TCP', !!g, g ? `parado: TCP ${g.paradoTcpMs.toFixed(1)} ms, QUIC ${g.paradoQuicMs.toFixed(1)} ms` : 'ainda não'),
        algoritmoBbr(m),
        item('comparação com a perda do rádio, feita com a configuração de agora: BBR com mais que o dobro da vazão do Reno', melhor, cmp ? `Reno ${cmp.resultados.reno.vazaoMbps.toFixed(2)} Mb/s, BBR ${cmp.resultados.bbr.vazaoMbps.toFixed(2)} Mb/s` : 'nenhuma comparação com a configuração de agora'),
        ...todasRespondidas(m, d110D),
      ];
    },
    solucao: [
      ['equip', 'srv-video', 'tr-escutar', { proto: 'udp', porta: '443' }],
      ['equip', CLIENTE, 'tr-quic-conectar', { ip: VIDEO, porta: '443' }],
      ['equip', CLIENTE, 'tr-quic-migrar', { ip: VIDEO, porta: '443', novo: IP_NOVO }],
      ['equip', CLIENTE, 'tr-algoritmo', { alg: 'bbr' }],
      ['equip', CLIENTE, 'tr-comparar', { ip: VIDEO, porta: '80' }],
    ],
    respostas: { '1': '60' },
  },
};

/* ======================================================================
 * ref 111: Medir de verdade (6.7.1 a 6.7.4)
 * ====================================================================== */

interface Velocidade {
  de: string;
  ip: string;
  fluxos: number;
  mbps: number;
  umFluxoMbps: number;
  rttMs: number;
  assinatura: string;
}

/** O último teste de velocidade até o medidor, se foi feito com a configuração de agora. */
function velocidade(m: Mundo): Velocidade | undefined {
  const v = m.flags.velocidade as Velocidade | undefined;
  return v && v.de === CLIENTE && v.ip === MEDIDOR && v.assinatura === assinaturaTcp(cliente(m)) ? v : undefined;
}

/** Vazão máxima de uma conexão com a janela de fábrica (65535 bytes) no RTT medido, em Mb/s. */
function tetoJanela(rttMs: number): number {
  return (65535 * 8) / (rttMs / 1000) / 1e6;
}

/** Espera de uma fila cheia: pacotes de 1500 bytes saindo à banda do rádio, em ms. */
function filaCheiaMs(pacotes: number, mbps: number): number {
  return ((pacotes * 1500 * 8) / (mbps * 1e6)) * 1000;
}

/** O rádio novo do hospital até a capital. */
const RADIO_MBPS = 100;
const FILA_RADIO = 350;

const d111: Pergunta[] = [
  numerica('1', 'Pela conta janela ÷ RTT, até quantos Mb/s uma conexão só com a janela de fábrica (65535 bytes) consegue nesse caminho? (duas casas)', (m) => tetoJanela(velocidade(m)?.rttMs ?? 40.2), 0.05),
  numerica('2', `A fila da saída do rádio guarda ${FILA_RADIO} pacotes de 1500 bytes. Cheia, quantos milissegundos de espera ela soma ao RTT?`, filaCheiaMs(FILA_RADIO, RADIO_MBPS), 0.5),
];

const d111D: Pergunta[] = [
  numerica('1', 'Com o RTT de agora, até quantos Mb/s uma conexão só com a janela de fábrica consegue? (duas casas)', (m) => tetoJanela(velocidade(m)?.rttMs ?? 60.2), 0.05),
  numerica('2', 'Pela mesma conta, qual é o menor número de conexões em paralelo cuja soma passa de 80 Mb/s?', (m) => Math.ceil(80 / tetoJanela(velocidade(m)?.rttMs ?? 60.2)), 0),
  numerica('3', 'Com a fila nova de 500 pacotes de 1500 bytes cheia, quantos milissegundos de espera ela soma ao RTT?', filaCheiaMs(500, RADIO_MBPS), 0.5),
];

const dia111: Dia = {
  numero: 111,
  ato: 5,
  titulo: 'Medir de verdade',
  chamado: [
    'CHAMADO #0111',
    'A operadora entregou o rádio novo de 100 Mb/s entre o hospital e a capital. A direção rodou o teste de velocidade do celular, viu "13 Mb/s" e já redigiu uma carta furiosa cobrando o contrato. A equipe da videochamada reclama de outra coisa: quando alguém baixa um arquivo, a voz do especialista atrasa.',
    'Antes de mandar a carta, alguém precisa medir direito: reproduzir os 20 ms de cada sentido até a capital no emulador, testar com uma conexão e com várias, e calcular o que acontece com a latência quando o rádio está cheio.',
    'Objetivo: o atraso do caminho no emulador, um teste de velocidade com pelo menos 4 conexões que mostre o enlace (mais que o dobro de uma só) e as duas perguntas respondidas, a da janela e a da fila.',
  ],
  manual: {
    titulo: 'Desempenho: onde a rede fica lenta e como medir sem se enganar',
    texto: [
      'Quase todo problema de desempenho cai em poucas famílias. O gargalo: mais tráfego do que o enlace mais estreito aguenta, e a fila cresce. A sobrecarga súbita e sincronizada: depois de uma queda de energia, todas as máquinas ligam juntas e pedem endereço ao mesmo tempo; um pacote com erro que faz cada receptor responder vira uma tempestade de broadcast. Os buffers: pequenos demais perdem rajadas, grandes demais guardam centenas de milissegundos de fila (o bufferbloat), e quem enche a fila atrasa todo mundo atrás dela. E o desajuste de capacidade: um servidor de 1 Gb/s falando com um rádio de 100 Mb/s, um receptor lento demais para o que chega, uma janela pequena num cano grande. Muitas vezes a culpa é da configuração: buffers, temporizadores e janelas com os valores de fábrica, pensados para outra rede.',
      'Medir parece fácil e engana muito. Uma amostra só não diz nada: meça muitas vezes, guarde a média e a variação, e olhe os percentis (o 95º e o 99º dizem como fica o pior momento, que é o que a pessoa lembra). Deixe o aquecimento de fora: a partida lenta do TCP, o cache que ainda está vazio, a primeira resolução de nome. Confira se o relógio tem resolução para o que mede, e não meça uma coisa de 1 ms com um relógio de 10 ms. Cuidado com o cache: a segunda leitura do mesmo arquivo pode nem passar pela rede. Meça nas condições de uso, com o atraso e a carga de verdade. E não deixe a ferramenta de medição ser o gargalo, nem confunda o que mediu com o que queria medir.',
      'O teste de velocidade da rede de acesso é o melhor exemplo. Uma conexão TCP só pode ficar presa na própria janela: vazão máxima = janela ÷ RTT. Com a janela de fábrica de 65535 bytes e 40 ms de ida e volta, isso dá uns 13 Mb/s, num rádio de 100. Por isso os bons testes abrem várias conexões em paralelo e somam, escolhem um servidor perto (RTT pequeno, menos caminho que não é da rede de acesso) e descartam os primeiros segundos. O que se quer medir é o enlace, não a configuração de uma conexão. Ao mesmo tempo, a pessoa usa a rede por uma conexão de cada vez, então o resultado de um fluxo só também é informação: diz que o problema é do host, não do rádio.',
      'Vazão não é tudo. A latência ociosa, com a rede vazia, é o RTT de base: propagação e processamento. A latência sob carga é o que a pessoa sente quando alguém está baixando um arquivo ao mesmo tempo: o RTT de base mais a espera na fila do gargalo. Com bufferbloat, um enlace de 100 Mb/s com fila de 350 pacotes soma até 42 ms a cada pacote, e uma videochamada que vai bem com a rede vazia passa a atrasar. Os testes de velocidade modernos medem as duas, e a qualidade de experiência é feita delas: quanto tempo até a imagem aparecer, quantas vezes congela, quanto atraso entre falar e ser ouvido. Vazão alta com 500 ms de fila é uma péssima videochamada.',
    ],
  },
  dicas: [
    'Comece pelo emulador ("Atraso do caminho") na telemed: 20 ms em cada sentido. Depois, "Teste de velocidade" até 203.0.113.20 com 1 conexão e com várias.',
    'Cada conexão anda no máximo janela ÷ RTT: 65535 × 8 bits ÷ 0,0402 s. Com 8 conexões, a soma já chega perto do rádio.',
    'Cada pacote de 1500 bytes leva 0,12 ms para sair pelo rádio de 100 Mb/s. A fila cheia, com 350 deles na frente, espera 350 vezes isso.',
  ],
  perguntas: d111,
  montar: () => mundoCapital({ semente: 5111, servidor: 'medidor', mbps: RADIO_MBPS, buffer: FILA_RADIO, escuta: [['tcp', 80]] }),
  objetivo: (m) => {
    const at = caminhoCli(m).atraso ?? 0;
    const v = velocidade(m);
    return [
      item('o emulador da telemed com 20 ms de atraso em cada sentido', Math.abs(at - 0.02) < 1e-9, `${(at * 1000).toFixed(0)} ms`),
      item('teste de velocidade até o medidor, com o atraso da capital e pelo menos 4 conexões, somando mais que o dobro de uma só', !!v && v.rttMs >= 30 && v.fluxos >= 4 && v.mbps > 2 * v.umFluxoMbps, v ? `${v.fluxos} conexão(ões): ${v.mbps.toFixed(2)} Mb/s; uma só: ${v.umFluxoMbps.toFixed(2)} Mb/s` : 'nenhum teste com a configuração de agora'),
      ...todasRespondidas(m, d111),
    ];
  },
  posMorte: [
    'A operadora estava inocente. Com 40 ms de ida e volta, uma conexão com a janela de fábrica (65535 bytes) só consegue 65535 × 8 ÷ 0,0402 s, uns 13 Mb/s, por mais largo que seja o rádio. O teste do celular abriu uma conexão só e mediu a janela da estação, não o enlace. Com 8 conexões o teste soma uns 97 Mb/s: o rádio entregava o contratado o tempo todo. A carta furiosa virou um e-mail agradecendo o rádio novo.',
    'A reclamação da videochamada também era real, e era de outra família: bufferbloat. Ociosa, a ida e volta até a capital é de 40,2 ms. Quando alguém baixa um arquivo com Reno ou CUBIC, que só diminuem depois de perder, a fila de 350 pacotes enche e soma até 42 ms a cada pacote, inclusive aos da voz do especialista: o RTT dobra. O BBR, do dia anterior, mede a banda e o RTT mínimo e mantém a fila quase vazia: é com ele que a estação deve atender as consultas.',
    'Sobrou o problema de verdade da estação: uma conexão só, com a janela de fábrica, não enche um cano longo e largo. É o assunto de amanhã, das redes rápidas.',
  ],
  passos: [
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-atraso',
      pedir: ['ms'],
      exemplo: { ms: '20' },
      instrucao: 'Na telemed, coloque no emulador o atraso do caminho até a capital: 20 ms em cada sentido.',
      porque: 'Os cabos do laboratório são curtos demais: sem o atraso real, o produto banda × atraso some e nenhum problema aparece. Medir fora das condições de uso é o primeiro jeito de se enganar.',
      conferir: (m) => {
        const at = (caminhoCli(m).atraso ?? 0) * 1000;
        if (Math.abs(at - 20) < 1e-6) return true;
        return at > 20 ? `${at.toFixed(0)} ms é mais longe que a capital. São 20 ms de cada lado, 40 ms de ida e volta.` : `Com ${at.toFixed(0)} ms o caminho fica mais curto que o real. São 20 ms em cada sentido.`;
      },
      feito: 'RTT de uns 40 ms, como o caminho de verdade até o data center da capital.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-velocidade',
      valores: { ip: MEDIDOR, n: '1' },
      instrucao: 'Faça o teste de velocidade até o medidor (203.0.113.20) com uma conexão só, como o celular da direção fez.',
      porque: 'Primeiro reproduzir a queixa: se a medição da direção não se repete aqui, o problema é outro. Repare que o teste deixa os 2 primeiros segundos, a partida lenta, fora da conta.',
      conferir: (m) => {
        const v = velocidade(m);
        if (!v) return 'O teste de velocidade ainda não foi feito com a configuração de agora.';
        return v.fluxos === 1 ? true : 'Este passo é com uma conexão só, como o teste do celular.';
      },
      feito: 'Uns 13 Mb/s, e a própria saída avisa: preso pela janela do receptor, 65535 bytes ÷ 40,2 ms. A queixa se repete, mas o culpado aparece junto.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '13,04' },
      instrucao: 'Pela conta janela ÷ RTT, até quantos Mb/s uma conexão só consegue nesse caminho?',
      porque: '65535 bytes são 524280 bits por RTT. Divida pelo RTT medido em segundos.',
      feito: '524280 bits ÷ 0,0402 s = 13,04 Mb/s. O teste de uma conexão mediu a conta da janela, não o rádio.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-velocidade',
      valores: { ip: MEDIDOR },
      pedir: ['n'],
      exemplo: { n: '8' },
      instrucao: 'Agora meça como um teste de velocidade sério: várias conexões em paralelo, somadas.',
      porque: 'Cada conexão tem a sua janela. Com várias, a soma deixa de ser limitada pela janela de uma e passa a mostrar o enlace.',
      conferir: (m) => {
        const v = velocidade(m);
        if (!v) return 'O teste ainda não foi feito com a configuração de agora.';
        if (v.fluxos < 4) return `Com ${v.fluxos} conexão(ões), a soma ainda fica longe dos 100 Mb/s: cada uma traz no máximo uns 13. Use pelo menos 4.`;
        return v.mbps > 2 * v.umFluxoMbps ? true : 'A soma não passou do dobro de uma conexão só. Tente com mais conexões.';
      },
      feito: 'Com 8 conexões, uns 97 Mb/s: o rádio entrega o contratado. Um fluxo só media a janela da estação, não a rede de acesso.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Um servidor perto, várias conexões e os primeiros segundos fora da conta',
          'Um servidor bem longe, para medir a internet inteira',
          'Uma conexão só, que é como as pessoas usam a rede',
          'Um arquivo pequeno, para o teste terminar rápido',
        ],
        certa: 0,
        errada: {
          1: 'Com o servidor longe, o RTT cresce e cada conexão anda menos (janela ÷ RTT). O teste passa a medir o caminho todo, não a rede de acesso.',
          2: 'Uma conexão só mede a janela e a configuração do host, como você acabou de ver. É informação útil, mas não é a capacidade do enlace.',
          3: 'Com arquivo pequeno, a transferência acaba ainda na partida lenta, e o número sai baixo por motivo que não tem a ver com a rede.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A operadora vai pôr um teste oficial no site. O que um bom teste da rede de acesso precisa ter?',
      porque: 'O que se quer medir é a rede de acesso: tire do caminho a janela de uma conexão, a distância e o aquecimento.',
      feito: 'Servidor perto, conexões em paralelo e aquecimento descartado. E, de preferência, a latência medida junto.',
    }),
    passo({
      escolha: {
        opcoes: [
          'A fila do rádio enche e cada pacote da voz espera atrás do arquivo: o atraso cresce',
          'Nada: a videochamada usa outra porta, então tem outra fila',
          'A videochamada fica mais rápida, porque o rádio está aquecido',
          'Só o arquivo atrasa; a voz tem prioridade por ser pequena',
        ],
        certa: 0,
        errada: {
          1: 'A porta separa os soquetes nos hosts, não as filas dos roteadores. Sem qualidade de serviço configurada, todo pacote entra na mesma fila de saída do rádio.',
          2: 'Com o rádio vazio a fila está vazia. Com ele cheio, cada pacote espera os que estão na frente.',
          3: 'Sem qualidade de serviço configurada, a fila é por ordem de chegada. Tamanho pequeno não fura fila.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Alguém começa a baixar um arquivo grande e enche o rádio. O que acontece com a videochamada que já estava no ar?',
      porque: 'A latência ociosa é o RTT de base. Sob carga, soma-se a espera na fila do gargalo.',
      feito: 'A voz passa a esperar na fila atrás do arquivo. É a latência sob carga, que os bons testes de velocidade medem junto com a vazão.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '42' },
      instrucao: 'A fila do rádio guarda 350 pacotes de 1500 bytes. Cheia, quantos milissegundos de espera ela soma?',
      porque: 'Cada pacote na frente precisa sair pelo rádio: 1500 × 8 bits a 100 Mb/s são 0,12 ms.',
      feito: '350 × 0,12 ms = 42 ms: o pior caso da latência sob carga, que dobra o RTT da videochamada.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Por que a rede fica lenta',
        texto: ['Antes de culpar alguém, descubra de que família é o problema. Cada uma tem um remédio diferente.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Problema', 'Exemplo', 'Remédio'],
          linhas: [
            ['gargalo', 'mais tráfego que o enlace mais estreito aguenta', 'controle de congestionamento, mais banda'],
            ['sobrecarga súbita', 'todas as máquinas ligando juntas depois de faltar luz; tempestade de broadcast', 'espalhar no tempo, com espera aleatória'],
            ['buffers', 'fila de centenas de milissegundos (bufferbloat)', 'fila curta, gestão ativa de fila, BBR'],
            ['desajuste de capacidade', 'servidor de 1 Gb/s num rádio de 100; janela pequena num cano grande', 'ajustar a parte fraca'],
          ],
        },
      },
      {
        titulo: 'Medir sem se enganar',
        texto: ['Quase todo número errado vem de um destes descuidos.'],
        visual: {
          tipo: 'camadas',
          camadas: ['amostras: muitas medidas, com média, variação e percentis', 'aquecimento: a partida lenta e o cache vazio ficam de fora', 'relógio: com resolução para o que se mede', 'cache: a segunda leitura pode nem passar pela rede', 'condições reais: o atraso e a carga de verdade'],
          rotulo: 'antes de acreditar num número',
        },
      },
      {
        titulo: 'Um fluxo só engana',
        texto: ['No rádio de 100 Mb/s com 40 ms de ida e volta e a janela de fábrica, cada conexão para em janela ÷ RTT. A soma de várias mostra o enlace.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Conexões', 'Vazão medida'],
          linhas: [
            ['1, janela de 65535 bytes', 'uns 13 Mb/s'],
            ['4', 'uns 51 Mb/s'],
            ['8', 'uns 97 Mb/s'],
          ],
        },
      },
      {
        titulo: 'Latência ociosa e sob carga',
        texto: ['O RTT de base é propagação e processamento. Sob carga, soma-se a espera na fila do gargalo: no rádio de 100 Mb/s, 0,12 ms por pacote de 1500 bytes na frente.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Ida e volta até a capital'],
          linhas: [
            ['rede vazia', '40,2 ms'],
            ['fila de 350 pacotes cheia', '40,2 + 42 = 82,2 ms'],
            ['fila de 1000 pacotes cheia (bufferbloat)', '40,2 + 120 = 160,2 ms'],
          ],
        },
      },
      {
        titulo: 'Qualidade de experiência',
        texto: ['A pessoa não vê megabits: vê a imagem demorar, a chamada congelar, a voz chegar atrasada. Um bom número de vazão com fila longa é uma experiência ruim.'],
        visual: {
          tipo: 'camadas',
          camadas: ['tempo até a imagem aparecer', 'quantas vezes congela, e por quanto tempo', 'atraso entre falar e ser ouvido (abaixo de 150 ms, conversa boa)', 'vazão: necessária, mas não suficiente'],
          rotulo: 'o que a pessoa sente',
        },
      },
    ],
    checagem: {
      pergunta: 'Um teste de velocidade com uma conexão só deu 13 Mb/s num enlace de 100 Mb/s com 40 ms de RTT. O que isso mostra?',
      opcoes: [
        'Provavelmente o limite da janela daquela conexão (janela ÷ RTT), não a capacidade do enlace',
        'Que a operadora entrega só 13 % do contratado',
        'Que o enlace perde 87 % dos pacotes',
        'Que o RTT é alto demais para qualquer TCP passar de 13 Mb/s',
      ],
      certa: 0,
      explicacao: 'Com 65535 bytes de janela e 40 ms de RTT, uma conexão TCP chega no máximo a uns 13 Mb/s, qualquer que seja o enlace. Várias conexões em paralelo mostram a capacidade real; uma janela com escala do tamanho do produto banda × atraso resolve para uma conexão só.',
    },
  },
  desafio: {
    carta: [
      'O especialista que atende o hospital mudou de consultório: agora o caminho até o medidor tem uns 60 ms de ida e volta, já no emulador. A operadora trocou também a fila do rádio por uma de 500 pacotes, e a equipe da videochamada quer saber quanto atraso isso pode somar.',
      'A direção ameaça de novo com a carta: o teste de 8 conexões que funcionou na semana passada agora não passa de uns 70 Mb/s.',
      'Objetivo: um teste de velocidade com a configuração de agora somando mais de 80 Mb/s e as três perguntas respondidas.',
    ],
    dicas: [
      'Com 60 ms de RTT, cada conexão traz menos: 65535 × 8 bits ÷ 0,0602 s.',
      'Divida os 80 Mb/s pelo que cada conexão traz e arredonde para cima. O teste aceita até 16 conexões.',
      'A fila nova cheia: 500 pacotes de 1500 bytes saindo a 100 Mb/s, 0,12 ms cada.',
    ],
    perguntas: d111D,
    montar: () => mundoCapital({ semente: 6111, servidor: 'medidor', mbps: RADIO_MBPS, buffer: 500, atraso: 0.03, escuta: [['tcp', 80]] }),
    objetivo: (m) => {
      const v = velocidade(m);
      return [
        item('teste de velocidade com a configuração de agora somando mais de 80 Mb/s', !!v && v.mbps > 80, v ? `${v.fluxos} conexões: ${v.mbps.toFixed(2)} Mb/s; uma só: ${v.umFluxoMbps.toFixed(2)} Mb/s` : 'nenhum teste com a configuração de agora'),
        ...todasRespondidas(m, d111D),
      ];
    },
    solucao: [
      ['equip', CLIENTE, 'tr-velocidade', { ip: MEDIDOR, n: '12' }],
    ],
    respostas: { '1': '8,71', '2': '10', '3': '60' },
  },
};

export const ATO5D: Dia[] = [dia110, dia111];
