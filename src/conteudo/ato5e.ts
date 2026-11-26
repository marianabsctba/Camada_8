// Dias novos do ato 5 (A Conversa), com prática guiada, aula e desafio no próprio dia.
// O cabeçalho do TCP, a abertura e o encerramento da conexão (6.5.4 a 6.5.6), na sala dos servidores, e as redes
// rápidas (6.7.5 a 6.7.8): host rápido, caminho rápido, compactação de cabeçalho e redes longas de banda larga.

import { configTcp, escutar, soquetesDe } from '../motor/transporte';
import { tcpConfere } from '../motor/cliTransporte';
import type { ConfigTcp } from '../motor/tcp';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { configurarNat } from '../motor/roteamento';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;
const num = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');

function escutando(m: Mundo, equip: string, proto: 'tcp' | 'udp', porta: number): boolean {
  return soquetesDe(m.equipamentos.get(equip)!).some((s) => s.proto === proto && s.portaLocal === porta && !s.ipRemoto && (s.estado === 'LISTEN' || s.estado === 'ABERTO'));
}

/* ======================================================================
 * ref 129: Cabeçalho, abrir e fechar (6.5.4 a 6.5.6)
 * ====================================================================== */

const VIDEO = '198.51.100.20';

/**
 * A mesma sala dos servidores do dia anterior: a estação de telemedicina (10.50.1.10) sai pela borda-sala, por um
 * enlace de 20 Mb/s, até o roteador da regional de saúde, onde fica o servidor de videoconsulta. 10 ms de cada lado.
 */
function mundo129(o: { semente: number; tcp?: Partial<ConfigTcp>; escutas: [number, string][] }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.transporte = true;
  adicionar(m, pc('telemed', { ip: cidr('10.50.1.10/24'), gateway: '10.50.1.1', modelo: 'Estação de telemedicina do hospital' }));
  adicionar(m, pc('video-regional', { ip: cidr(`${VIDEO}/24`), gateway: '198.51.100.1', modelo: 'Servidor de videoconsulta da regional de saúde' }));
  adicionar(m, roteador('borda-sala', { modelo: 'Roteador de borda da sala dos servidores', interfaces: { lan: '10.50.1.1/24', wan: '10.0.50.1/30' }, rotas: [{ destino: '198.51.100.0/24', via: '10.0.50.2' }] }));
  adicionar(m, roteador('regional', { modelo: 'Roteador do data center regional', interfaces: { sala: '10.0.50.2/30', lan: '198.51.100.1/24' }, rotas: [{ destino: '10.50.1.0/24', via: '10.0.50.1' }] }));
  ligar(m, { equip: 'telemed', porta: 'eth0' }, { equip: 'borda-sala', porta: 'lan' }, 'cat6', 10, { id: 'c1' });
  ligar(m, { equip: 'borda-sala', porta: 'wan' }, { equip: 'regional', porta: 'sala' }, 'cat6', 90, { id: 'c2' });
  ligar(m, { equip: 'regional', porta: 'lan' }, { equip: 'video-regional', porta: 'eth0' }, 'cat6', 10, { id: 'c3' });
  m.proxCabo = 4;
  m.equipamentos.get('borda-sala')!.portas.find((p) => p.nome === 'wan')!.velocidades = [20];
  m.equipamentos.get('regional')!.portas.find((p) => p.nome === 'sala')!.velocidades = [20];
  m.equipamentos.get('borda-sala')!.s.fila = { wan: { buffer: 64, capacidade: 20 } };
  m.equipamentos.get('regional')!.s.fila = { sala: { buffer: 64, capacidade: 20 } };
  const cli = m.equipamentos.get('telemed')!;
  cli.s.caminhoTransporte = { atraso: 0.01 };
  if (o.tcp) cli.s.tcp = { ...o.tcp };
  const srv = m.equipamentos.get('video-regional')!;
  for (const [porta, nome] of o.escutas) escutar(m, srv, 'tcp', porta, nome);
  return m;
}

/** A estação abriu uma conexão com a porta e fechou do jeito pedido (quem fechou primeiro ficou em TIME_WAIT). */
function fechouAssim(m: Mundo, porta: number, modo: 'cliente' | 'simultaneo'): boolean {
  const c = m.flags.conexao;
  if (!c || c.de !== 'telemed' || c.porta !== porta || c.resultado !== 'aberta' || !c.fechamento || c.fechamento.modo !== modo) return false;
  const cli = c.fechamento.estadosCliente as string[];
  const srv = c.fechamento.estadosServidor as string[];
  return modo === 'cliente' ? cli.includes('TIME_WAIT') : cli.includes('CLOSING') && srv.includes('CLOSING') && cli.includes('TIME_WAIT') && srv.includes('TIME_WAIT');
}

function detalheConexao(m: Mundo): string {
  const c = m.flags.conexao;
  if (!c) return 'nenhuma conexão tentada';
  if (c.resultado !== 'aberta') return `porta ${c.porta}: ${c.resultado}`;
  if (!c.fechamento) return `porta ${c.porta}: aberta, ainda não fechada`;
  return `porta ${c.porta}: estação ${(c.fechamento.estadosCliente as string[]).join(', ')}; servidor ${(c.fechamento.estadosServidor as string[]).join(', ')}`;
}

const d129: Pergunta[] = [
  numerica('1', 'Quantos bytes tem o cabeçalho TCP do SYN que a estação de telemedicina mandou?', 28, 0),
  numerica('2', 'Que número vai no campo "tamanho do cabeçalho" desse SYN?', 7, 0),
];

const d129D: Pergunta[] = [
  numerica('1', 'Com a escala de janela ligada, quantos bytes tem o cabeçalho TCP do SYN da estação?', 32, 0),
  numerica('2', 'Que valor vai no campo janela desse SYN, em bytes?', 65535, 0),
];

const dia129: Dia = {
  numero: 129,
  ato: 5,
  titulo: 'Cabeçalho, abrir e fechar',
  chamado: [
    'CHAMADO #0129',
    'A videoconsulta da regional já atende na 443, mas o suporte de lá agora desconfia do aperto de mão e mandou outro questionário: quer o tamanho do cabeçalho do SYN da estação, byte a byte, e o valor do campo que diz esse tamanho.',
    'E fez um pedido de etiqueta: no fim de cada teste, quem fecha primeiro é a estação, para o TIME_WAIT ficar do lado de cá e não ocupar a tabela do servidor.',
    'Objetivo: uma conexão da estação com a porta 443 aberta pelo aperto de mão em três vias e fechada pela estação, que termina em TIME_WAIT, e as duas perguntas do suporte respondidas.',
  ],
  manual: {
    titulo: 'O cabeçalho TCP, o aperto de mão e o encerramento',
    texto: [
      'Todo segmento TCP começa com 20 bytes fixos (RFC 9293, seção 3.1). Porta de origem e porta de destino, 16 bits cada. Número de sequência e número de confirmação, 32 bits cada. O tamanho do cabeçalho (data offset), em 4 bits, contado em palavras de 32 bits: 5 sem opções, no máximo 15, ou seja, até 60 bytes, dos quais até 40 de opções. Depois 4 bits reservados e as 8 flags: CWR e ECE (do ECN, RFC 3168), URG, ACK, PSH, RST, SYN e FIN. A janela, 16 bits, diz quantos bytes o receptor ainda aceita a partir do número de confirmação. O checksum, 16 bits, cobre o cabeçalho, os dados e um pseudocabeçalho com os IPs de origem e destino, o número do protocolo (6) e o tamanho do segmento: um segmento entregue ao IP errado não confere. Por fim, o ponteiro de urgência, que só vale com a flag URG.',
      'As opções vão quase todas no SYN, porque são combinadas na abertura. MSS (tipo 2, 4 bytes): o maior pedaço de dados que este lado aceita, 1460 no Ethernet. Escala de janela (tipo 3, 3 bytes, RFC 7323): quantos bits deslocar o campo janela daqui em diante; só vale se os dois lados mandarem, e o próprio SYN nunca é escalado. SACK permitido (tipo 4, 2 bytes, RFC 2018). Marcas de tempo (tipo 8, 10 bytes, RFC 7323), para medir o RTT e proteger contra número de sequência que deu a volta. O NOP (tipo 1, 1 byte) e o preenchimento com zeros alinham tudo em múltiplos de 4.',
      'A abertura é o aperto de mão em três vias. O servidor fez socket, bind e listen e está em LISTEN. O cliente manda SYN com o seu número inicial x (sorteado, RFC 6528) e vai para SYN_SENT. O servidor responde SYN+ACK com o seu número inicial y e confirmação x+1, porque o SYN consome um número de sequência mesmo sem levar dados, e vai para SYN_RCVD. O cliente confirma y+1 e os dois chegam a ESTABLISHED, depois de 1 RTT para o cliente. Se ninguém escuta, volta RST e o connect falha com "conexão recusada". Dois lados que mandam SYN ao mesmo tempo um para o outro (abertura simultânea) também se entendem: cada um responde SYN+ACK e sai uma conexão só. E quem guarda estado a cada SYN fica vulnerável à inundação de SYN, em que alguém manda milhares de SYN e nunca completa; a defesa clássica são os SYN cookies (RFC 4987), em que o número inicial do servidor carrega o estado e nada fica guardado até o ACK voltar.',
      'O encerramento é um sentido de cada vez, porque a conexão é full-duplex. Quem fecha primeiro manda FIN (que também consome um número) e vai para FIN_WAIT_1; com o ACK, FIN_WAIT_2, e ainda pode receber dados: a conexão está meio fechada. O outro lado passa por CLOSE_WAIT até a aplicação dele chamar close, manda o seu FIN e vai para LAST_ACK. Quem fechou primeiro confirma e fica em TIME_WAIT por 2 MSL (o tempo máximo de vida de um segmento, aqui 60 s, então 120 s) por dois motivos: se o último ACK se perder, o FIN repetido ainda tem quem responda; e nenhum segmento atrasado desta conexão é aceito por outra igual que nasça na mesma quádrupla. Se os dois fecham ao mesmo tempo, os dois passam por CLOSING e os dois ficam em TIME_WAIT. Já o RST corta a conexão na hora, sem despedida: dados em trânsito se perdem.',
    ],
  },
  dicas: [
    'O servidor já escuta na 443. Da estação, "Conectar" até 198.51.100.20 na 443 e depois "Ver o cabeçalho TCP".',
    'São 20 bytes fixos mais as opções do SYN: MSS (4) e SACK permitido (2), completados até múltiplo de 4. O campo de tamanho conta palavras de 32 bits.',
    'Feche com "eu primeiro": quem fecha primeiro é quem fica em TIME_WAIT.',
  ],
  perguntas: d129,
  montar: () => mundo129({ semente: 1129, escutas: [[443, 'videoconsulta']] }),
  objetivo: (m) => [
    item('uma conexão da estação com a porta 443 aberta e fechada pela estação, que termina em TIME_WAIT', fechouAssim(m, 443, 'cliente'), detalheConexao(m)),
    ...todasRespondidas(m, d129),
  ],
  posMorte: [
    'O aperto de mão estava certinho. O SYN da estação saiu com o número inicial sorteado, o SYN+ACK do servidor confirmou esse número mais 1 e trouxe o número inicial dele, e o ACK da estação confirmou o do servidor mais 1. Um RTT, uns 20 ms aqui, e os dois lados em ESTABLISHED, cada um sabendo de onde o outro começa a contar.',
    'O SYN tinha 28 bytes de cabeçalho: os 20 fixos, 4 do MSS de 1460, 2 do SACK permitido e 2 de preenchimento. O campo de tamanho dizia 7, porque conta palavras de 32 bits; é por isso que as opções sempre fecham em múltiplo de 4. O checksum conferiu com o pseudocabeçalho, ou seja, com os IPs de verdade das duas pontas.',
    'No fim, a estação fechou primeiro: FIN_WAIT_1, FIN_WAIT_2 e TIME_WAIT de 120 s do lado de cá; CLOSE_WAIT e LAST_ACK do lado do servidor, que terminou em CLOSED e liberou a tabela na hora. A porta efêmera da estação fica presa enquanto isso, o que não incomoda ninguém: há mais de 16 mil delas.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-conectar',
      valores: { porta: '443' },
      instrucao: 'Da estação de telemedicina, conecte ao video-regional na porta 443 e acompanhe o aperto de mão.',
      porque: 'Repare nos números: o SYN sai com o número inicial da estação, o SYN+ACK confirma esse número mais 1 e o ACK final confirma o número inicial do servidor mais 1.',
      conferir: (m) => {
        const c = m.flags.conexao;
        if (!c) return 'A conexão ainda não foi tentada.';
        if (c.resultado === 'recusada') return 'Voltou RST: ninguém escuta nessa porta. A videoconsulta está na 443.';
        return c.resultado === 'aberta' && c.porta === 443 ? true : `A conexão foi para a porta ${c.porta}. A videoconsulta está na 443.`;
      },
      feito: 'SYN, SYN+ACK, ACK: os dois lados em ESTABLISHED depois de 1 RTT, e o accept do servidor devolveu um descritor novo para esta conexão.',
    }),
    passo({
      escolha: {
        opcoes: ['x+1: o SYN consome um número de sequência', 'x: o SYN não leva dados, então não gasta número', 'x+1460: um MSS depois', 'zero: a confirmação só começa depois do aperto de mão'],
        certa: 0,
        errada: {
          1: 'O SYN e o FIN consomem um número de sequência cada um, mesmo sem dados. É isso que permite confirmar o SYN sem ambiguidade.',
          2: 'O SYN não leva 1460 bytes de dados; o MSS é só uma opção que ele anuncia. O que ele ocupa é um número de sequência.',
          3: 'O SYN+ACK já leva a flag ACK, e o campo de confirmação vale: ele confirma o SYN do cliente.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se o SYN da estação saiu com seq=x, que confirmação vem no SYN+ACK do servidor?',
      porque: 'A confirmação é sempre o próximo número que o receptor espera.',
      feito: 'x+1. E o próximo byte de dados da estação vai sair com seq=x+1 também.',
    }),
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-cabecalho',
      instrucao: 'Na estação, veja o cabeçalho TCP do SYN que acabou de sair.',
      porque: 'O SYN é o segmento com mais opções: é nele que cada lado diz o seu MSS e se aceita SACK e escala de janela. As portas são as de verdade: a efêmera da estação e a 443.',
      feito: 'Portas, sequência, confirmação zerada (sem a flag ACK ela não vale), tamanho do cabeçalho, flags, janela, checksum e as opções, byte a byte.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '28' },
      instrucao: 'Quantos bytes tem o cabeçalho TCP desse SYN?',
      porque: 'São 20 fixos mais as opções: MSS (4 bytes) e SACK permitido (2 bytes), completados até múltiplo de 4.',
      feito: '28 bytes: 20 fixos, 6 de opções e 2 de preenchimento.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '7' },
      instrucao: 'Que número vai no campo "tamanho do cabeçalho"?',
      porque: 'O campo tem 4 bits e conta palavras de 32 bits, não bytes.',
      feito: '7 palavras de 4 bytes = 28 bytes. Com 4 bits, o máximo é 15 palavras: 60 bytes de cabeçalho, 40 de opções.',
    }),
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-fechar',
      valores: { modo: 'cliente' },
      instrucao: 'Feche a conexão a partir da estação, que fecha primeiro.',
      porque: 'Cada sentido fecha por conta própria: FIN e ACK de um lado, FIN e ACK do outro. Quem fecha primeiro é quem espera no TIME_WAIT.',
      conferir: (m) => {
        const f = m.flags.conexao?.fechamento;
        if (!f) return 'A conexão ainda não foi fechada.';
        if (f.modo === 'simultaneo') return 'Com os dois fechando juntos, os dois ficam em TIME_WAIT, e o suporte pediu a tabela do servidor livre. Conecte de novo e feche a partir da estação.';
        return (f.estadosCliente as string[]).includes('TIME_WAIT') ? true : 'Quem fechou primeiro foi o servidor, então quem ficou em TIME_WAIT foi ele. Conecte de novo e feche a partir da estação.';
      },
      feito: 'ESTABLISHED, FIN_WAIT_1, FIN_WAIT_2, TIME_WAIT na estação; CLOSE_WAIT e LAST_ACK no servidor, que termina em CLOSED.',
    }),
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-soquetes',
      instrucao: 'Veja a tabela de soquetes da estação.',
      porque: 'O TIME_WAIT é um soquete de verdade, que ocupa a quádrupla até os 2 MSL passarem.',
      feito: 'Lá está a quádrupla da estação em TIME_WAIT: a porta efêmera não volta a ser usada para 198.51.100.20:443 antes de 120 s.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Os 20 bytes fixos, campo a campo',
        texto: ['Cinco palavras de 32 bits, sempre. Tudo o que vem depois é opção, e o campo de tamanho diz onde acabam.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Bits', 'Para quê'],
          linhas: [
            ['portas de origem e destino', '16 + 16', 'que soquete em cada ponta'],
            ['número de sequência', '32', 'o primeiro byte deste segmento'],
            ['número de confirmação', '32', 'o próximo byte esperado (só com a flag ACK)'],
            ['tamanho do cabeçalho', '4', 'em palavras de 32 bits: de 5 a 15'],
            ['reservado e flags', '4 + 8', 'CWR, ECE, URG, ACK, PSH, RST, SYN, FIN'],
            ['janela', '16', 'quantos bytes o receptor ainda aceita'],
            ['checksum', '16', 'cabeçalho, dados e pseudocabeçalho com os IPs'],
            ['ponteiro de urgência', '16', 'onde acaba o dado urgente (com URG)'],
          ],
        },
      },
      {
        titulo: 'As opções do SYN',
        texto: ['Tipo, tamanho e valor, alinhados em múltiplos de 4 com NOP e zeros. O SYN da estação leva MSS e SACK permitido: 6 bytes, que viram 8.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Opção', 'Tipo', 'Bytes', 'O que combina'],
          linhas: [
            ['MSS', '2', '4', 'maior pedaço de dados aceito (1460 no Ethernet)'],
            ['escala de janela', '3', '3', 'quantos bits deslocar a janela (RFC 7323)'],
            ['SACK permitido', '4', '2', 'aceita confirmação seletiva (RFC 2018)'],
            ['marcas de tempo', '8', '10', 'medir o RTT e o PAWS (RFC 7323)'],
            ['NOP', '1', '1', 'alinhar a opção seguinte'],
          ],
        },
      },
      {
        titulo: 'Aperto de mão em três vias',
        texto: ['O SYN e o FIN consomem um número de sequência cada um, mesmo sem dados. Por isso a confirmação do SYN é o número inicial mais 1.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c1', rotulo: 'cliente: SYN_SENT', x: 80, y: 40 },
            { id: 's1', rotulo: 'servidor: LISTEN, depois SYN_RCVD', x: 460, y: 110 },
            { id: 'c2', rotulo: 'cliente: ESTABLISHED', x: 80, y: 180 },
            { id: 's2', rotulo: 'servidor: ESTABLISHED', x: 460, y: 250 },
          ],
          ligacoes: [
            ['c1', 's1', 'SYN seq=x'],
            ['s1', 'c2', 'SYN+ACK seq=y ack=x+1'],
            ['c2', 's2', 'ACK ack=y+1'],
          ],
        },
      },
      {
        titulo: 'Inundação de SYN e SYN cookies',
        texto: ['Cada SYN que chega a um servidor comum ocupa um lugar na fila de conexões meio abertas. Quem manda SYN de endereços falsos e nunca completa enche a fila, e os clientes de verdade ficam de fora.'],
        visual: {
          tipo: 'camadas',
          camadas: ['SYN chega: o servidor normal guarda o estado e espera o ACK', 'milhares de SYN falsos: a fila de meio abertas enche', 'com SYN cookie: o número inicial do servidor codifica a quádrupla, o tempo e o MSS', 'o ACK volta com esse número mais 1, e só então o estado é criado'],
          rotulo: 'RFC 4987',
        },
      },
      {
        titulo: 'Encerramento: um sentido de cada vez',
        texto: ['Quem fecha primeiro espera 2 MSL em TIME_WAIT: para reenviar o último ACK se ele se perder, e para os segmentos atrasados desta conexão morrerem antes que outra igual nasça.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Segmento', 'Quem fecha primeiro', 'O outro lado'],
          linhas: [
            ['FIN', 'FIN_WAIT_1', 'CLOSE_WAIT'],
            ['ACK do FIN', 'FIN_WAIT_2 (meio fechada)', 'CLOSE_WAIT'],
            ['FIN do outro lado', 'TIME_WAIT', 'LAST_ACK'],
            ['ACK final', 'TIME_WAIT, por 2 MSL', 'CLOSED'],
            ['os dois fecham juntos', 'CLOSING, depois TIME_WAIT', 'CLOSING, depois TIME_WAIT'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um servidor web fecha primeiro milhares de conexões por minuto. Onde ficam os soquetes em TIME_WAIT?',
      opcoes: ['No próprio servidor, porque quem fecha primeiro é quem espera 2 MSL', 'Nos clientes, que receberam o FIN', 'Em nenhum lado: o TIME_WAIT só existe no fechamento simultâneo', 'No roteador do caminho, que guarda a quádrupla'],
      certa: 0,
      explicacao: 'O TIME_WAIT fica com quem manda o primeiro FIN. Por isso protocolos como o HTTP procuram deixar o cliente fechar primeiro, ou reaproveitam a mesma conexão para vários pedidos.',
    },
  },
  desafio: {
    carta: [
      'A estação de telemedicina ganhou um buffer de recepção de 1 MiB para as imagens, e o SYN dela passou a levar também a escala de janela. O suporte da regional quer o tamanho novo do cabeçalho e o que vai no campo janela desse SYN.',
      'Na mesma semana, o servidor de videoconsulta foi reinstalado e voltou só com o site antigo, na porta 80: a estação leva "conexão recusada" na 443. E o programa novo da consulta fecha dos dois lados ao mesmo tempo, que a regional quer ver funcionando.',
      'Objetivo: o video-regional escutando em TCP 443, uma conexão da estação com a 443 aberta e fechada com os dois lados ao mesmo tempo, os dois passando por CLOSING até o TIME_WAIT, e as duas perguntas respondidas.',
    ],
    montar: () => mundo129({ semente: 2129, tcp: { janela: 1 << 20, escala: 5 }, escutas: [[80, 'site antigo']] }),
    objetivo: (m) => [
      item('o video-regional escuta em TCP 443', escutando(m, 'video-regional', 'tcp', 443)),
      item('uma conexão com a 443 fechada pelos dois lados ao mesmo tempo, os dois em CLOSING e depois TIME_WAIT', fechouAssim(m, 443, 'simultaneo'), detalheConexao(m)),
      ...todasRespondidas(m, d129D),
    ],
    dicas: [
      'Conexão recusada é RST: falta quem escute na 443. A 80 não serve.',
      'O SYN agora leva MSS (4 bytes), SACK permitido (2) e escala de janela (3, mais um NOP de alinhamento). Some aos 20 fixos e complete até múltiplo de 4. "Ver o cabeçalho TCP" depois de conectar confirma.',
      'A escala só passa a valer depois do aperto de mão: o campo janela do próprio SYN nunca é escalado, e com 16 bits não passa de 65535.',
    ],
    perguntas: d129D,
    solucao: [
      ['equip', 'video-regional', 'tr-escutar', { proto: 'tcp', porta: '443' }],
      ['equip', 'telemed', 'tr-conectar', { ip: VIDEO, porta: '443' }],
      ['equip', 'telemed', 'tr-fechar', { modo: 'simultaneo' }],
    ],
    respostas: { '1': '32', '2': '65535' },
  },
};

/* ======================================================================
 * ref 128: Redes rápidas (6.7.5 a 6.7.8)
 * ====================================================================== */

const CLIENTE = 'telemed';
const MEDIDOR = '203.0.113.20';
const RADIO_MBPS = 100;
/** O exame de tomografia: grande o bastante para a partida lenta pesar pouco na conta. */
const EXAME = '50M';

/**
 * O caminho do hospital até a capital, como no dia anterior: a estação (10.50.2.10) sai pela borda-hosp, com NAT,
 * pelo rádio de 100 Mb/s até a operadora e o data center (203.0.113.0/24), onde fica o servidor de arquivos.
 */
function mundo128(o: { semente: number; buffer: number; atraso?: number; tcp?: Partial<ConfigTcp> }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.transporte = true;
  adicionar(m, pc(CLIENTE, { ip: cidr('10.50.2.10/24'), gateway: '10.50.2.1', modelo: 'Estação da sala de telemedicina' }));
  adicionar(m, pc('arquivo-capital', { ip: cidr(`${MEDIDOR}/24`), gateway: '203.0.113.1', modelo: 'Servidor de arquivos de imagem do hospital da capital' }));
  const borda = adicionar(m, roteador('borda-hosp', { modelo: 'Roteador de borda do hospital, com NAT', interfaces: { lan: '10.50.2.1/24', wan: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('capital', { modelo: 'Roteador da operadora na capital', interfaces: { wan: '198.51.100.2/30', dc: '203.0.113.1/24' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.1' }] }));
  configurarNat(borda, ['lan'], 'wan');
  borda.portas.find((p) => p.nome === 'wan')!.velocidades = [100];
  borda.s.fila = { wan: { buffer: o.buffer, capacidade: RADIO_MBPS } };
  ligar(m, { equip: CLIENTE, porta: 'eth0' }, { equip: 'borda-hosp', porta: 'lan' }, 'cat6', 20, { id: 'c1' });
  ligar(m, { equip: 'borda-hosp', porta: 'wan' }, { equip: 'capital', porta: 'wan' }, 'cat6', 80, { id: 'c2' });
  ligar(m, { equip: 'capital', porta: 'dc' }, { equip: 'arquivo-capital', porta: 'eth0' }, 'cat6', 20, { id: 'c3' });
  m.proxCabo = 4;
  const cli = m.equipamentos.get(CLIENTE)!;
  if (o.atraso) cli.s.caminhoTransporte = { atraso: o.atraso };
  if (o.tcp) cli.s.tcp = { ...o.tcp };
  escutar(m, m.equipamentos.get('arquivo-capital')!, 'tcp', 443, 'arquivos de imagem');
  return m;
}

function cliente(m: Mundo) {
  return m.equipamentos.get(CLIENTE)!;
}

function atrasoCli(m: Mundo): number {
  return ((cliente(m).s.caminhoTransporte ?? {}) as { atraso?: number }).atraso ?? 0;
}

interface Desempenho {
  de: string;
  ip: string;
  rttMs: number;
  bdpBytes: number;
  escalaNecessaria: number;
}

function desempenho(m: Mundo, rttMinMs: number): Desempenho | undefined {
  const d = m.flags.desempenho as Desempenho | undefined;
  return d && d.de === CLIENTE && d.ip === MEDIDOR && d.rttMs >= rttMinMs ? d : undefined;
}

/** O que o receptor consegue anunciar: o buffer, limitado pelo campo de 16 bits vezes 2 elevado à escala. */
function janelaEfetiva(m: Mundo): number {
  const c = configTcp(cliente(m));
  return Math.min(c.janela, 65535 * 2 ** c.escala);
}

function janelaCobre(m: Mundo, d: Desempenho | undefined): ItemObjetivo {
  const j = janelaEfetiva(m);
  const bdp = d?.bdpBytes;
  return item('a janela que a estação anuncia cobre o produto banda × atraso do caminho', bdp !== undefined && j >= bdp, bdp === undefined ? 'meça o desempenho do caminho primeiro' : `janela anunciável ${j} bytes, produto ${bdp} bytes`);
}

interface Transferencia {
  de: string;
  ip: string;
  ok: boolean;
  concluiu: boolean;
  vazaoMbps: number;
  rttMs: number;
}

/** A última transferência até o servidor de arquivos, se foi com a configuração e o caminho de agora. */
function transferencia(m: Mundo): Transferencia | undefined {
  const t = m.flags.tcp as Transferencia | undefined;
  return t && t.de === CLIENTE && t.ip === MEDIDOR && t.ok && t.concluiu && tcpConfere(m) ? t : undefined;
}

function rapida(m: Mundo, minimo: number): ItemObjetivo {
  const t = transferencia(m);
  return item(`o exame transferido com a configuração de agora a mais de ${minimo} Mb/s`, !!t && t.vazaoMbps > minimo, t ? `${num(t.vazaoMbps, 2)} Mb/s` : 'nenhuma transferência com a configuração de agora');
}

const d128: Pergunta[] = [
  numerica('1', 'Qual é a menor escala de janela que deixa a estação anunciar o produto banda × atraso do caminho até a capital?', (m) => (m.flags.desempenho as Desempenho | undefined)?.escalaNecessaria ?? NaN, 0),
  numerica('2', 'Numa voz com 20 bytes de fala por pacote, que porcentagem do pacote é fala depois de compactar os 40 bytes de IP, UDP e RTP em 3? (sem casas decimais)', (20 / 23) * 100, 0.6),
];

/** A 10 Gb/s, o número de sequência de 32 bits dá a volta em 2³² × 8 ÷ 10¹⁰ s. */
const VOLTA_10G = (2 ** 32 * 8) / 10e9;

const d128D: Pergunta[] = [
  numerica('1', 'Com o caminho de agora, qual é a menor escala de janela que cobre o produto banda × atraso?', (m) => (m.flags.desempenho as Desempenho | undefined)?.escalaNecessaria ?? NaN, 0),
  numerica('2', 'Se o rádio virar um enlace de 10 Gb/s, em quantos segundos o número de sequência de 32 bits dá a volta? (uma casa decimal)', VOLTA_10G, 0.1),
];

const dia128: Dia = {
  numero: 128,
  ato: 5,
  titulo: 'Redes rápidas',
  chamado: [
    'CHAMADO #0128',
    'A medição de ontem absolveu a operadora: o rádio de 100 Mb/s entrega o contratado, e quem segura cada conexão em uns 13 Mb/s é a janela da estação. Só que o exame de tomografia de 50 MB sobe por uma conexão só, e o especialista da capital está esperando.',
    'Hora de tratar o caminho como o que ele é: uma rede longa e larga, com meio megabyte em voo.',
    'Objetivo: o atraso da capital no emulador, o desempenho do caminho até o servidor de arquivos medido, a janela da estação cobrindo o produto banda × atraso, o exame de 50 MB subindo a mais de 80 Mb/s e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Redes rápidas: host, segmento, cabeçalho e o cano longo',
    texto: [
      'Quando a linha fica rápida, o gargalo passa para dentro do host. A velocidade da CPU e da memória importa mais que a da linha: a 10 Gb/s, com segmentos de 1500 bytes, chegam mais de 800 mil pacotes por segundo, pouco mais de 1 µs para cada um. As regras de projeto saem daí. Reduza o número de pacotes, porque o custo é por pacote e não por byte: segmentos grandes e descarregamento de segmentação na placa. Minimize cópias: cada passagem dos dados pela memória custa caro, e o ideal é a placa escrever direto no buffer da aplicação (zero-copy). Minimize trocas de contexto entre núcleo e aplicação, juntando trabalho em lotes. Evitar congestionamento sai mais barato que se recuperar dele. E evite tempo esgotado: um RTO perdido para a linha parada.',
      'O caso comum precisa ser rápido. Numa conexão aberta, quase todo segmento que chega é o próximo esperado, com as flags de sempre e nada de especial. A predição de cabeçalho (o caminho rápido) testa isso com poucas comparações e, se acertar, pula o resto do processamento. O bloco de controle da conexão (PCB) da última consulta fica num cache, porque o próximo segmento quase sempre é da mesma conexão. E os temporizadores ficam numa roda de temporizadores: um vetor de casas, uma por tique do relógio, em que armar e desarmar custam tempo constante, sem lista ordenada para percorrer.',
      'Nos enlaces estreitos, o problema é o contrário: o cabeçalho pesa demais. Numa voz com 20 bytes de fala por pacote, IP, UDP e RTP somam 40 bytes, e só um terço do pacote é voz. Como quase tudo se repete de um pacote para o outro (endereços, portas) ou muda de um jeito previsível (sequência, marca de tempo), a compactação robusta de cabeçalho (ROHC, RFC 3095 e RFC 5795) manda só a diferença: de 40 bytes para 1 a 3. Com 3 bytes, a voz passa a ocupar 87 % do pacote. É robusta porque aguenta perda no enlace sem dessincronizar os dois lados por muito tempo.',
      'Nas redes longas de banda larga, o que manda é o produto banda × atraso: quantos bytes precisam estar em voo para o cano ficar cheio. 100 Mb/s × 40 ms são uns 500 mil bytes; uma conexão só anda janela ÷ RTT, e o campo janela de 16 bits para em 65535. A escala de janela (RFC 7323) desloca o campo até 14 bits, até 1 GiB, e é combinada no SYN. Com a banda alta, o número de sequência de 32 bits dá a volta depressa (a 1 Gb/s, em 34 s), antes da vida máxima de um segmento na rede, e um segmento velho atrasado poderia ser aceito como novo: o PAWS usa a opção de marcas de tempo para descartar quem vem de uma volta anterior. E o controle de congestionamento também precisa de outro jeito: com meio megabyte em voo, esperar perda para descobrir a banda custa caro, e o BBR mede a banda do gargalo e o RTT mínimo e manda nesse ritmo.',
    ],
  },
  dicas: [
    'Comece pelo emulador ("Atraso do caminho") na telemed: 20 ms em cada sentido. Depois transfira o exame de 50M para 203.0.113.20 na 443 e leia a linha do produto banda × atraso.',
    '"Desempenho" mostra o produto e a escala necessária. O campo de 16 bits vai até 65535; cada ponto de escala dobra o limite.',
    'Em "Janela do receptor e escala", um buffer de 600000 bytes com escala 3 (até 524280 bytes anunciáveis) cobre os uns 502 mil bytes do caminho. Depois transfira de novo.',
  ],
  perguntas: d128,
  montar: () => mundo128({ semente: 5128, buffer: 350 }),
  objetivo: (m) => {
    const at = atrasoCli(m);
    const d = desempenho(m, 30);
    return [
      item('o emulador da telemed com 20 ms de atraso em cada sentido', Math.abs(at - 0.02) < 1e-9, `${num(at * 1000, 0)} ms`),
      item('desempenho do caminho até o servidor de arquivos medido com o atraso da capital', !!d, d ? `RTT ${num(d.rttMs, 1)} ms, produto ${d.bdpBytes} bytes` : 'ainda não medido com o atraso'),
      janelaCobre(m, d),
      rapida(m, 80),
      ...todasRespondidas(m, d128),
    ];
  },
  posMorte: [
    'A primeira transferência mostrou o teto sem rodeio: 65535 bytes por RTT de 40,2 ms dão uns 13 Mb/s, e o exame de 50 MB levou 31,6 s. O rádio ficava ocioso quase todo o tempo, esperando confirmação. A conta do caminho pedia uns 502 mil bytes em voo, 344 segmentos.',
    'Com escala 3 no SYN (65535 × 8 = 524280 bytes anunciáveis) e um buffer de 600000, a estação passou a deixar o cano cheio, e o mesmo exame subiu em 4,5 s, a uns 90 Mb/s; o que falta para os 100 é a partida lenta do começo, que leva uns 9 RTTs para encher o cano. A 100 Mb/s o número de sequência só dá a volta em 343,6 s, bem mais que a vida máxima de um segmento; a 1 Gb/s seriam 34,4 s, e aí o PAWS, com marcas de tempo, deixa de ser luxo.',
    'Com o BBR mantendo a fila curta, o QUIC abrindo em 1 RTT e sobrevivendo à troca de rede, e agora a janela do tamanho do caminho, a primeira consulta inteira com o especialista da capital rodou sem congelar, e as imagens chegaram antes de ele pedir. A sala de telemedicina aplaudiu. A camada de transporte de Fim de Linha está pronta: a conversa ficou rápida, justa e confiável.',
  ],
  passos: [
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-atraso',
      pedir: ['ms'],
      exemplo: { ms: '20' },
      instrucao: 'Na telemed, coloque no emulador o atraso do caminho até a capital: 20 ms em cada sentido.',
      porque: 'Sem o atraso real, o produto banda × atraso some do laboratório, e o problema da janela não aparece.',
      conferir: (m) => {
        const at = atrasoCli(m) * 1000;
        if (Math.abs(at - 20) < 1e-6) return true;
        return `Com ${num(at, 0)} ms o caminho fica diferente do real. São 20 ms em cada sentido.`;
      },
      feito: 'RTT de uns 40 ms, como o caminho de verdade até o data center da capital.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-transferir',
      valores: { ip: MEDIDOR, porta: '443', bytes: EXAME },
      instrucao: 'Transfira o exame de 50 MB para o servidor de arquivos (203.0.113.20) na porta 443, com a configuração de fábrica.',
      porque: 'Antes de mexer, ver o sintoma: uma conexão só, num caminho longo, com a janela de 65535 bytes.',
      conferir: (m) => {
        const t = transferencia(m);
        if (!t) return 'A transferência ainda não foi feita com a configuração de agora.';
        return t.rttMs >= 30 ? true : 'A transferência foi feita sem o atraso da capital. Coloque os 20 ms no emulador antes.';
      },
      feito: 'Uns 13 Mb/s num rádio de 100, e a própria saída diz: a janela do receptor é que segura a vazão, não a rede.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-desempenho',
      valores: { ip: MEDIDOR },
      instrucao: 'Meça o desempenho do caminho: produto banda × atraso, limite da janela, escala, número de sequência e compactação.',
      porque: 'Saber que a janela é o limite não basta: é preciso saber de quanto ela precisa para este caminho.',
      conferir: (m) => (desempenho(m, 30) ? true : 'O desempenho ainda não foi medido com os 20 ms de atraso no emulador.'),
      feito: 'Produto banda × atraso: 100 Mb/s × 40,2 ms, uns 502 mil bytes (344 segmentos em voo). A 100 Mb/s, o número de sequência só dá a volta em 343,6 s: aqui o PAWS ainda não é necessário.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '3' },
      instrucao: 'Qual é a menor escala de janela que deixa anunciar esse produto banda × atraso?',
      porque: 'A janela anunciada vale 65535 vezes 2 elevado à escala. Dobre 65535 até passar de uns 502 mil bytes.',
      feito: 'Escala 3: 65535 × 8 = 524280 bytes. Com escala 2 (262140) ainda faltaria metade.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-janela',
      pedir: ['janela', 'escala'],
      exemplo: { janela: '600000', escala: '3' },
      instrucao: 'Ajuste o buffer do receptor e a escala de janela da telemed para cobrir o produto banda × atraso.',
      porque: 'São duas peças: o buffer diz quanto o receptor aguenta guardar; a escala diz quanto o campo de 16 bits consegue anunciar. Vale o menor dos dois.',
      conferir: (m) => {
        const d = desempenho(m, 30);
        if (!d) return 'Meça o desempenho primeiro, para saber o tamanho do caminho.';
        const c = configTcp(cliente(m));
        if (c.janela < d.bdpBytes) return `Um buffer de ${c.janela} bytes é menor que os ${d.bdpBytes} bytes que precisam estar em voo. Aumente o buffer.`;
        if (janelaEfetiva(m) < d.bdpBytes) return `O buffer dá, mas com escala ${c.escala} o campo só anuncia ${65535 * 2 ** c.escala} bytes. Suba a escala.`;
        return true;
      },
      feito: 'Agora a estação anuncia mais de meio megabyte de janela. A escala vai no SYN: se o outro lado não mandar a opção, nenhum dos dois usa.',
    }),
    passo({
      alvo: ['equip', CLIENTE],
      acao: 'tr-transferir',
      valores: { ip: MEDIDOR, porta: '443', bytes: EXAME },
      instrucao: 'Transfira o exame de novo, com a janela nova.',
      porque: 'A prova do conserto é a mesma medição que mostrou o problema, nas mesmas condições.',
      conferir: (m) => {
        const t = transferencia(m);
        if (!t) return 'A transferência ainda não foi feita com a configuração de agora.';
        return t.vazaoMbps > 80 ? true : `O exame subiu a ${num(t.vazaoMbps, 2)} Mb/s. Confira se a janela anunciável cobre o produto banda × atraso.`;
      },
      feito: 'Uns 90 Mb/s, sete vezes mais que antes. O que falta para os 100 é a partida lenta do começo, que leva uns 9 RTTs para encher o cano; depois disso a janela deixa de ser o teto.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '87' },
      instrucao: 'Na linha da compactação de cabeçalho: com 20 bytes de fala e 3 de cabeçalho compactado, que porcentagem do pacote é fala?',
      porque: 'O aproveitamento é fala ÷ (fala + cabeçalho). Sem compactar, 20 ÷ 60.',
      feito: '20 ÷ 23, uns 87 %, contra 33 % sem compactar. Num enlace estreito, é quase o triplo de chamadas no mesmo fio.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Host rápido: o custo é por pacote',
        texto: ['A 10 Gb/s com segmentos de 1500 bytes, são mais de 800 mil pacotes por segundo. O que se faz a cada pacote precisa ser pouco.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Regra', 'Como'],
          linhas: [
            ['CPU importa mais que a linha', 'menos instruções por pacote'],
            ['menos pacotes', 'segmentos grandes, segmentação na placa'],
            ['menos cópias', 'a placa escreve direto no buffer da aplicação (zero-copy)'],
            ['menos trocas de contexto', 'trabalho em lotes, uma interrupção para vários pacotes'],
            ['evitar congestionamento', 'mais barato que se recuperar dele'],
            ['evitar tempo esgotado', 'retransmissão rápida antes do RTO'],
          ],
        },
      },
      {
        titulo: 'O caminho rápido',
        texto: ['Quase todo segmento numa conexão aberta é o próximo esperado. Testar isso primeiro poupa o resto.'],
        visual: {
          tipo: 'camadas',
          camadas: ['o PCB da última conexão está no cache? quase sempre', 'predição de cabeçalho: só ACK, seq igual ao esperado, mesma janela', 'acertou: copia os dados para a aplicação, confirma e pronto', 'errou: o caminho completo, com todos os casos'],
          rotulo: 'o caso comum em poucas instruções',
        },
      },
      {
        titulo: 'Compactação de cabeçalho',
        texto: ['O que se repete não precisa viajar de novo. O ROHC (RFC 3095 e 5795) manda só a diferença: o aproveitamento da voz sobe de 33 % para 87 %.'],
        visual: { tipo: 'bits', antes: '20 de voz + 40 de IP, UDP e RTP', depois: '20 de voz + 3 de cabeçalho compactado', legenda: 'o que muda de um pacote para o outro é só a sequência e a marca de tempo' },
      },
      {
        titulo: 'Redes longas e largas',
        texto: ['Com RTT de 40,2 ms: o produto banda × atraso diz a janela necessária, e a escala é quantas vezes dobrar 65535 até chegar lá. Acima de uns 290 Mb/s, a sequência dá a volta antes da vida máxima de um segmento (120 s) e o PAWS passa a ser obrigatório.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Banda', 'Banda × atraso', 'Escala', 'Sequência dá a volta em'],
          linhas: [
            ['100 Mb/s', '502515 bytes', '3', '343,6 s (sem PAWS)'],
            ['1 Gb/s', '5025150 bytes', '7', '34,4 s (PAWS)'],
            ['10 Gb/s', '50251500 bytes', '10', '3,4 s (PAWS)'],
          ],
        },
      },
      {
        titulo: 'A janela é o teto',
        texto: ['Uma conexão anda no máximo janela ÷ RTT. Sem escala, no caminho até a capital, isso dá uns 13 Mb/s em qualquer rádio.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Janela anunciável', 'Limite a 40,2 ms', 'O exame de 50 MB'],
          linhas: [
            ['65535 bytes (sem escala)', 'uns 13 Mb/s', 'uns 31 s'],
            ['262140 bytes (escala 2)', 'uns 52 Mb/s', 'uns 8 s'],
            ['524280 bytes (escala 3)', 'acima dos 100 Mb/s do rádio', 'uns 4,5 s'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um enlace de 1 Gb/s entre duas capitais tem 80 ms de RTT. O que limita uma conexão TCP sem a opção de escala de janela?',
      opcoes: ['A janela: 65535 bytes ÷ 80 ms, uns 6,5 Mb/s, por mais largo que seja o enlace', 'A CPU do servidor, que não processa 1 Gb/s', 'A perda, que cresce com a distância', 'O número de sequência, que dá a volta em 80 ms'],
      certa: 0,
      explicacao: 'Sem escala, o receptor anuncia no máximo 65535 bytes, e o emissor só pode ter isso em voo por RTT: 65535 × 8 ÷ 0,08 s ≈ 6,5 Mb/s. O produto banda × atraso desse enlace é de 10 MB; a escala 8 (65535 × 256, uns 16,8 MB) resolveria.',
    },
  },
  desafio: {
    carta: [
      'O especialista que atende o hospital mudou de consultório: agora o caminho até o servidor de arquivos tem uns 60 ms de ida e volta, já no emulador. Na estação, um técnico de passagem deixou o buffer do receptor em 1 MB "para resolver de vez" e foi embora.',
      'O exame continua subindo devagar, e a operadora ofereceu, para o ano que vem, um enlace de 10 Gb/s.',
      'Objetivo: o desempenho do caminho medido, a janela anunciável cobrindo o produto banda × atraso, o exame de 50 MB transferido a mais de 80 Mb/s com a configuração de agora e as perguntas respondidas.',
    ],
    dicas: [
      'Um buffer de 1 MB não adianta se o campo de 16 bits continua sem escala: ele para em 65535 bytes.',
      'Com 60 ms de RTT, o produto passa de 750 mil bytes. Escala 3 anuncia até 524280; escala 4, até 1048560.',
      'O número de sequência tem 2³² valores, um por byte: a 10 Gb/s, 2³² × 8 bits ÷ 10¹⁰ bits por segundo.',
    ],
    perguntas: d128D,
    montar: () => mundo128({ semente: 6128, buffer: 500, atraso: 0.03, tcp: { janela: 1000000 } }),
    objetivo: (m) => {
      const d = desempenho(m, 50);
      return [item('desempenho do caminho até o servidor de arquivos medido', !!d, d ? `RTT ${num(d.rttMs, 1)} ms, produto ${d.bdpBytes} bytes` : 'ainda não'), janelaCobre(m, d), rapida(m, 80), ...todasRespondidas(m, d128D)];
    },
    solucao: [
      ['equip', CLIENTE, 'tr-desempenho', { ip: MEDIDOR }],
      ['equip', CLIENTE, 'tr-janela', { janela: '1000000', escala: '4' }],
      ['equip', CLIENTE, 'tr-transferir', { ip: MEDIDOR, porta: '443', bytes: EXAME }],
    ],
    respostas: { '1': '4', '2': '3,4' },
  },
};

export const ATO5E: Dia[] = [dia129, dia128];
