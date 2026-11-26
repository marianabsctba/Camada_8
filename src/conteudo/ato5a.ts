// Dias do ato 5 (A Conversa), com prática guiada, aula e desafio no próprio dia.
// A camada de transporte na sala dos servidores: soquetes e primitivas (6.1), endereçamento, aperto de mão
// e encerramento (6.2.1 a 6.2.3), controle de fluxo, multiplexação e recuperação de falhas (6.2.4 a 6.2.6).

import { tcpConfere } from '../motor/cliTransporte';
import { adicionar, comutador, ligar, novoMundo, pc, type Mundo } from '../motor/mundo';
import { conectar, escutar, soquetesDe, type Soquete } from '../motor/transporte';
import { lerCidr, lerIp } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

interface Host {
  nome: string;
  ip: string;
  modelo: string;
}

/** A sala dos servidores: um comutador e os hosts pendurados nele, todos na 10.5.0.0/16. */
function salaDosServidores(semente: number, hosts: Host[]): Mundo {
  const m = novoMundo(semente);
  m.flags.transporte = true;
  adicionar(m, comutador('sw-sala', { portas: 8, modelo: 'Comutador do rack da sala dos servidores' }));
  hosts.forEach((h, i) => {
    adicionar(m, pc(h.nome, { ip: cidr(`${h.ip}/16`), modelo: h.modelo }));
    ligar(m, { equip: h.nome, porta: 'eth0' }, { equip: 'sw-sala', porta: `p${i + 1}` }, 'cat6', 3, { id: `c${i + 1}` });
  });
  m.proxCabo = hosts.length + 1;
  return m;
}

function soq(m: Mundo, nome: string): Soquete[] {
  const e = m.equipamentos.get(nome);
  return e ? soquetesDe(e) : [];
}

function escutando(m: Mundo, nome: string, proto: 'tcp' | 'udp', porta: number): boolean {
  return soq(m, nome).some((s) => s.proto === proto && s.portaLocal === porta && !s.ipRemoto && (s.estado === 'LISTEN' || s.estado === 'ABERTO'));
}

/** Soquetes conectados (ESTABLISHED) num host, numa porta local. */
function estabelecidos(m: Mundo, nome: string, porta: number): Soquete[] {
  return soq(m, nome).filter((s) => s.proto === 'tcp' && s.portaLocal === porta && s.estado === 'ESTABLISHED');
}

/** A conexão do cliente com ip:porta está aberta agora? */
function conectado(m: Mundo, cliente: string, ip: string, porta: number): boolean {
  return soq(m, cliente).some((s) => s.proto === 'tcp' && s.estado === 'ESTABLISHED' && s.ipRemoto === ip && s.portaRemota === porta);
}

function primitivas(m: Mundo): string[] {
  return (m.flags.soquetes as { primitivas?: string[] } | undefined)?.primitivas ?? [];
}

function chamou(m: Mundo, host: string, trecho: string): boolean {
  return primitivas(m).some((l) => l.startsWith(`${host}: `) && l.includes(trecho));
}

function descreverSoquetes(m: Mundo, nome: string): string {
  const l = soq(m, nome);
  return l.length ? l.map((s) => `${s.proto} ${s.portaLocal} ${s.estado}`).join(', ') : 'nenhum soquete';
}

/* ======================================================================
 * ref 101: Soquetes (6.1)
 * ====================================================================== */

const ARQUIVOS = '10.5.0.10';
const ESTACAO = '10.5.0.20';
const PORTA_ARQUIVOS = 5000;

function mundo101(): Mundo {
  return salaDosServidores(5101, [
    { nome: 'arquivos', ip: ARQUIVOS, modelo: 'Servidor de arquivos da prefeitura' },
    { nome: 'estacao', ip: ESTACAO, modelo: 'Estação de trabalho da sala dos servidores' },
  ]);
}

const COPIAS = '10.5.0.40';

function mundo101D(): Mundo {
  const m = salaDosServidores(6101, [
    { nome: 'copias', ip: COPIAS, modelo: 'Servidor de cópias de segurança' },
    { nome: 'estacao', ip: ESTACAO, modelo: 'Estação de trabalho da sala dos servidores' },
  ]);
  // O programa de cópias novo abriu o soquete errado: datagrama, não fluxo.
  escutar(m, m.equipamentos.get('copias')!, 'udp', PORTA_ARQUIVOS, 'copias');
  return m;
}

const dia101: Dia = {
  numero: 101,
  ato: 5,
  titulo: 'Soquetes',
  chamado: [
    'CHAMADO #0101',
    'A cidade inteira se enxerga, os pacotes chegam a qualquer bairro. Agora a secretaria quer usar isso: um servidor de arquivos na sala dos servidores, para as escolas e o hospital guardarem documentos num lugar só.',
    'O servidor está ligado e tem endereço, mas nenhum programa nele atende ninguém. A rede entrega pacotes de máquina para máquina; falta alguém do outro lado da porta para conversar.',
    'Objetivo: o servidor de arquivos escutando em TCP 5000, a estação conectada a ele, um envio de dados registrado nas primitivas dos dois lados.',
  ],
  manual: {
    titulo: 'O serviço de transporte e os soquetes',
    texto: [
      'A camada de rede leva um pacote de uma máquina a outra, sem promessa nenhuma: pode perder, duplicar, atrasar, entregar fora de ordem. A camada de transporte fica em cima dela e muda duas coisas. Primeiro, a conversa passa a ser de processo para processo, e não de máquina para máquina: dentro do servidor podem rodar o correio, a página e os arquivos ao mesmo tempo, e cada um tem a sua porta. Segundo, o transporte pode esconder os defeitos da rede, entregando um fluxo de bytes em ordem, sem buraco e sem repetição, sobre uma rede que não garante nada disso.',
      'Por que isso não fica na própria rede? Porque a rede é dos roteadores, e o transporte roda só nas pontas, nas máquinas de quem usa. Se a rede perde pacotes, quem usa não tem como consertar os roteadores, mas pode pôr uma camada em cima que confirma, retransmite e reordena. A unidade que o transporte troca se chama segmento: um cabeçalho de transporte com os dados, e esse conjunto vai dentro do pacote IP, que vai dentro do quadro.',
      'Um serviço de transporte se usa com poucas primitivas. LISTEN: o servidor avisa que aceita conexões e fica esperando. CONNECT: o cliente pede uma conexão com o servidor. SEND e RECEIVE: mandam e recebem dados. DISCONNECT: encerra. O servidor quase sempre começa com LISTEN e espera; quem toma a iniciativa é o cliente.',
      'Os soquetes de Berkeley são a versão dessas primitivas que quase todo sistema usa. socket cria um ponto de comunicação e devolve um número, o descritor. bind amarra esse soquete a um endereço e uma porta. listen o deixa pronto para receber conexões, com uma fila para quem chegar enquanto o programa está ocupado. accept bloqueia até alguém conectar e devolve um soquete novo, só para aquela conversa, enquanto o original continua escutando. Do lado do cliente, connect faz o aperto de mão (e escolhe sozinho uma porta de origem). send e recv trocam bytes; close encerra.',
      'Um servidor de arquivos simples, em linhas gerais: socket, bind na porta 5000, listen, e então um laço: accept, recv do nome do arquivo, abre o arquivo, send dos pedaços até o fim, close daquela conversa, e volta ao accept. O cliente faz socket, connect no endereço e porta do servidor, send do nome, recv até acabar, close. Não precisa saber nada de rotas, quadros ou retransmissões: o transporte cuida disso.',
    ],
  },
  dicas: [
    'Primeiro o servidor precisa existir de verdade: um programa escutando numa porta. Só depois o cliente conecta.',
    'No servidor de arquivos, "Abrir um serviço": TCP, porta 5000. Na estação, "Conectar" em 10.5.0.10, porta 5000.',
    'Com a conexão aberta, "Enviar dados na conexão" na estação. "Ver os soquetes" mostra a tabela e as últimas primitivas.',
  ],
  montar: mundo101,
  objetivo: (m) => [
    item(`o servidor de arquivos escuta em TCP ${PORTA_ARQUIVOS}`, escutando(m, 'arquivos', 'tcp', PORTA_ARQUIVOS), descreverSoquetes(m, 'arquivos')),
    item(`a estação está conectada a ${ARQUIVOS}:${PORTA_ARQUIVOS}`, conectado(m, 'estacao', ARQUIVOS, PORTA_ARQUIVOS), descreverSoquetes(m, 'estacao')),
    item('o servidor aceitou a conexão com accept', chamou(m, 'arquivos', 'devolve o descritor novo'), 'procure accept nas primitivas do servidor'),
    item('dados enviados pela estação (send) e recebidos pelo servidor (recv)', chamou(m, 'estacao', 'send(') && chamou(m, 'arquivos', 'recv('), 'ainda não houve send e recv'),
  ],
  posMorte: [
    'O servidor fez socket, bind e listen, e ficou parado no accept, como uma telefonista esperando o telefone tocar. A estação fez socket e connect, sem bind nenhum: o sistema escolheu sozinho uma porta de origem efêmera, a 49152. Quando o aperto de mão terminou, o accept do servidor voltou com um descritor novo, só para aquela conversa, e o soquete original continuou em LISTEN, pronto para a próxima.',
    'Repare na tabela de soquetes: o servidor tem duas linhas na mesma porta 5000. Uma escuta (*:* do outro lado, qualquer um) e outra está presa a 10.5.0.20:49152. É assim que um servidor atende muita gente ao mesmo tempo sem misturar as conversas.',
    'O send da estação entregou os bytes ao TCP, que cortou em segmentos de até 1460 bytes, mandou, esperou confirmação e entregou tudo em ordem do outro lado, onde o recv devolveu exatamente o que foi enviado. Nenhum programa precisou saber que a rede embaixo não promete nada.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Levar os dados de um processo a outro processo, por cima de uma rede que pode perder e embaralhar pacotes',
          'Escolher a rota entre os roteadores da cidade',
          'Transformar bits em sinal elétrico no cabo',
          'Dar endereço IP para cada máquina',
        ],
        certa: 0,
        errada: {
          1: 'Rota é trabalho da camada de rede, dos roteadores. O transporte roda só nas pontas e nem sabe por onde o pacote passou.',
          2: 'Sinal no cabo é a camada física, lá do ato 1. O transporte está quatro andares acima.',
          3: 'Endereço IP é da camada de rede. O transporte acrescenta outra coisa: a porta, que diz qual programa dentro da máquina.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A rede já entrega pacotes de uma máquina a outra. O que a camada de transporte acrescenta?',
      porque: 'Numa máquina rodam vários programas, e a rede só sabe chegar até a máquina. Além disso, ela não garante entrega nem ordem.',
      feito: 'De processo para processo, e com a confiabilidade que a rede não dá. O endereço completo vira IP mais porta.',
    }),
    passo({
      alvo: ['equip', 'arquivos'],
      acao: 'tr-escutar',
      pedir: ['proto', 'porta'],
      exemplo: { proto: 'tcp', porta: '5000' },
      instrucao: 'No servidor de arquivos, abra o serviço: TCP na porta 5000.',
      porque: 'O servidor faz a abertura passiva: socket, bind na porta e listen. TCP porque arquivo precisa chegar inteiro e em ordem.',
      conferir: (m) => {
        if (escutando(m, 'arquivos', 'tcp', PORTA_ARQUIVOS)) return true;
        if (escutando(m, 'arquivos', 'udp', PORTA_ARQUIVOS)) return 'Isso abriu um soquete UDP, de datagramas. Não há conexão nem garantia de entrega: para arquivo, o certo é TCP.';
        return `O servidor ainda não escuta em TCP ${PORTA_ARQUIVOS}. Agora: ${descreverSoquetes(m, 'arquivos')}.`;
      },
      feito: 'socket devolveu o descritor 3, bind o amarrou à porta 5000, listen passou de CLOSED para LISTEN, e o accept ficou bloqueado esperando.',
    }),
    passo({
      alvo: ['equip', 'estacao'],
      acao: 'tr-conectar',
      valores: { ip: ARQUIVOS },
      pedir: ['porta'],
      exemplo: { porta: '5000' },
      instrucao: 'Na estação, conecte no servidor de arquivos (10.5.0.10), na porta em que ele escuta.',
      porque: 'connect faz o aperto de mão com o servidor. O cliente não precisa de bind: o sistema escolhe uma porta de origem livre sozinho.',
      conferir: (m) => {
        if (conectado(m, 'estacao', ARQUIVOS, PORTA_ARQUIVOS)) return true;
        const c = m.flags.conexao as { resultado?: string; porta?: number } | undefined;
        if (c?.resultado === 'recusada') return `Conexão recusada: ninguém escuta em TCP ${c.porta} no servidor. O serviço está na porta ${PORTA_ARQUIVOS}.`;
        return 'A estação ainda não tem conexão com o servidor de arquivos.';
      },
      feito: 'Conexão aberta. A estação saiu da porta efêmera 49152; o accept do servidor devolveu um descritor novo para essa conversa.',
    }),
    passo({
      alvo: ['equip', 'estacao'],
      acao: 'tr-enviar',
      valores: { bytes: '200k' },
      instrucao: 'Mande 200 kB pela conexão aberta.',
      porque: 'send entrega bytes ao TCP; quem corta em segmentos, numera, confirma e retransmite é o transporte, não o programa.',
      conferir: (m) => (chamou(m, 'estacao', 'send(') && chamou(m, 'arquivos', 'recv(') ? true : 'O envio não foi registrado. A conexão precisa estar aberta antes.'),
      feito: 'Os 200000 bytes saíram em 137 segmentos de até 1460 bytes, e o recv do servidor devolveu os 200000, em ordem.',
    }),
    passo({
      alvo: ['equip', 'arquivos'],
      acao: 'tr-soquetes',
      instrucao: 'No servidor de arquivos, veja a tabela de soquetes e as últimas primitivas.',
      porque: 'A tabela mostra cada ponto de comunicação do host: protocolo, endereço e porta de cada lado, estado e descritor.',
      conferir: (m) => (estabelecidos(m, 'arquivos', PORTA_ARQUIVOS).length >= 1 && escutando(m, 'arquivos', 'tcp', PORTA_ARQUIVOS) ? true : 'O servidor deveria ter um soquete em LISTEN e outro em ESTABLISHED na porta 5000.'),
      feito: 'Dois soquetes na mesma porta 5000: o 3 em LISTEN, esperando qualquer um, e o 4 em ESTABLISHED, preso a 10.5.0.20:49152.',
    }),
    passo({
      escolha: {
        opcoes: ['accept', 'listen', 'bind', 'socket'],
        certa: 0,
        errada: {
          1: 'listen só deixa o soquete pronto para receber conexões e cria a fila de espera. Ele não devolve conversa nenhuma.',
          2: 'bind amarra o soquete a uma porta. Foi ele que pôs o serviço na 5000, mas antes de qualquer cliente aparecer.',
          3: 'socket criou o soquete que escuta, o descritor 3. O da conversa é outro, criado quando a estação chegou.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual primitiva do servidor criou o soquete novo, o 4, que conversa só com a estação?',
      porque: 'O soquete que escuta não pode ser usado para uma conversa só, senão o servidor não atenderia mais ninguém.',
      feito: 'accept: devolve um soquete novo por conexão e deixa o original escutando. É o que permite um servidor ter mil clientes na mesma porta.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Onde mora o transporte',
        texto: [
          'O transporte roda só nas pontas. Os roteadores do caminho olham até a camada de rede e nem abrem o segmento.',
          'Cada camada põe o seu cabeçalho: o segmento vai dentro do pacote, que vai dentro do quadro.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['aplicação: o programa de arquivos', 'transporte: segmento, portas, confiabilidade (só nas pontas)', 'rede: pacote IP, de máquina para máquina, sem garantia', 'enlace e física: quadro e sinal no cabo'],
          rotulo: 'de processo a processo, sobre uma rede que não promete',
        },
      },
      {
        titulo: 'As cinco primitivas',
        texto: ['Um serviço de transporte orientado a conexão cabe em cinco operações. O servidor espera; o cliente toma a iniciativa.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Primitiva', 'O que faz', 'O que vai pela rede'],
          linhas: [
            ['LISTEN', 'fica esperando alguém conectar', 'nada'],
            ['CONNECT', 'pede uma conexão', 'segmento de pedido de conexão'],
            ['SEND', 'manda dados', 'segmentos de dados'],
            ['RECEIVE', 'espera e recebe dados', 'nada (só espera)'],
            ['DISCONNECT', 'encerra a conexão', 'segmento de desconexão'],
          ],
        },
      },
      {
        titulo: 'Soquetes de Berkeley',
        texto: ['A versão das primitivas que quase todo sistema usa. O servidor faz quatro chamadas antes do primeiro cliente; o cliente, duas.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 's1', rotulo: 'socket', x: 80, y: 40 },
            { id: 's2', rotulo: 'bind :5000', x: 80, y: 100 },
            { id: 's3', rotulo: 'listen', x: 80, y: 160 },
            { id: 's4', rotulo: 'accept (bloqueia)', x: 80, y: 220 },
            { id: 's5', rotulo: 'recv / send', x: 80, y: 280 },
            { id: 'c1', rotulo: 'socket', x: 480, y: 160 },
            { id: 'c2', rotulo: 'connect', x: 480, y: 220 },
            { id: 'c3', rotulo: 'send / recv', x: 480, y: 280 },
          ],
          ligacoes: [
            ['s1', 's2'],
            ['s2', 's3'],
            ['s3', 's4'],
            ['s4', 's5'],
            ['c1', 'c2'],
            ['c2', 's4', 'aperto de mão'],
            ['c2', 'c3'],
            ['c3', 's5', 'bytes'],
          ],
        },
      },
      {
        titulo: 'Um servidor de arquivos em seis linhas',
        texto: ['O laço do servidor é sempre o mesmo: aceitar, atender, fechar, voltar a aceitar. O programa nunca vê segmento, confirmação ou retransmissão.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Servidor', 'Cliente'],
          linhas: [
            ['s = socket(); bind(s, 5000); listen(s)', ''],
            ['laço: c = accept(s)', 'k = socket(); connect(k, 10.5.0.10:5000)'],
            ['nome = recv(c)', 'send(k, "ata.pdf")'],
            ['send(c, pedaço) até acabar o arquivo', 'recv(k) até acabar'],
            ['close(c) e volta ao accept', 'close(k)'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O servidor de arquivos tem três clientes conectados na porta 5000. Quantos soquetes TCP ele tem nessa porta?',
      opcoes: ['Quatro: um escutando e um por cliente', 'Um só, compartilhado por todos', 'Três, um por cliente', 'Nenhum: soquete é coisa do cliente'],
      certa: 0,
      explicacao: 'O soquete do listen continua escutando, e cada accept cria um soquete novo para cada conversa. Três clientes, três soquetes conectados, mais o que escuta: quatro, todos na porta 5000.',
    },
  },
  desafio: {
    carta: [
      'O programa novo de cópias de segurança foi instalado no servidor "copias" (10.5.0.40), na porta 5000, e a estação não consegue mandar nada: "conexão recusada".',
      'Quem instalou jura que o serviço está no ar. A tabela de soquetes do servidor conta outra história.',
      'Objetivo: o serviço de cópias atendendo conexões na porta 5000, sem o soquete errado ocupando a porta, a estação conectada e um envio de dados registrado.',
    ],
    dicas: [
      'Veja os soquetes do servidor de cópias. Repare no protocolo.',
      'O serviço abriu um soquete UDP (SOCK_DGRAM), que não aceita conexão. Pare o UDP 5000 e abra o TCP 5000.',
      'Depois, na estação: conectar em 10.5.0.40 porta 5000 e enviar dados.',
    ],
    montar: mundo101D,
    objetivo: (m) => [
      item('nenhum soquete UDP ocupando a porta 5000 do servidor de cópias', !escutando(m, 'copias', 'udp', PORTA_ARQUIVOS), descreverSoquetes(m, 'copias')),
      item('o servidor de cópias escuta em TCP 5000', escutando(m, 'copias', 'tcp', PORTA_ARQUIVOS), descreverSoquetes(m, 'copias')),
      item(`a estação conectada a ${COPIAS}:${PORTA_ARQUIVOS}`, conectado(m, 'estacao', COPIAS, PORTA_ARQUIVOS), descreverSoquetes(m, 'estacao')),
      item('dados enviados pela estação e recebidos pelo servidor de cópias', chamou(m, 'estacao', 'send(') && chamou(m, 'copias', 'recv('), 'ainda não houve send e recv'),
    ],
    solucao: [
      ['equip', 'copias', 'tr-parar', { proto: 'udp', porta: '5000' }],
      ['equip', 'copias', 'tr-escutar', { proto: 'tcp', porta: '5000' }],
      ['equip', 'estacao', 'tr-conectar', { ip: COPIAS, porta: '5000' }],
      ['equip', 'estacao', 'tr-enviar', { bytes: '500k' }],
    ],
  },
};

/* ======================================================================
 * ref 102: Aperto de mão (6.2.1 a 6.2.3)
 * ====================================================================== */

const PORTAL = '10.5.0.30';
const CORREIO = '10.5.0.25';
/** O TIME_WAIT da simulação: 2 MSL, com MSL de 60 s. */
const TIME_WAIT_S = 120;

function mundo102(): Mundo {
  const m = salaDosServidores(5102, [
    { nome: 'portal', ip: PORTAL, modelo: 'Servidor do portal da prefeitura' },
    { nome: 'estacao', ip: ESTACAO, modelo: 'Estação de trabalho da sala dos servidores' },
  ]);
  escutar(m, m.equipamentos.get('portal')!, 'tcp', 80);
  return m;
}

function mundo102D(): Mundo {
  const m = salaDosServidores(6102, [
    { nome: 'correio', ip: CORREIO, modelo: 'Servidor de correio da prefeitura' },
    { nome: 'estacao', ip: ESTACAO, modelo: 'Estação de trabalho da sala dos servidores' },
  ]);
  // Sobrou da instalação: o correio de teste escutando numa porta alta, e nada na porta de verdade.
  escutar(m, m.equipamentos.get('correio')!, 'tcp', 2525, 'correio de teste');
  return m;
}

interface Fechamento {
  modo: string;
  estadosCliente: string[];
  estadosServidor: string[];
}

function fechamento(m: Mundo, ip: string, porta: number): Fechamento | undefined {
  const c = m.flags.conexao as { ip?: string; porta?: number; fechamento?: Fechamento } | undefined;
  return c && c.ip === ip && c.porta === porta ? c.fechamento : undefined;
}

function emTimeWait(m: Mundo, nome: string, porta: number, remoto?: string): boolean {
  return soq(m, nome).some((s) => s.proto === 'tcp' && s.estado === 'TIME_WAIT' && (remoto ? s.ipRemoto === remoto && s.portaRemota === porta : s.portaLocal === porta));
}

const d102D: Pergunta[] = [numerica('1', 'Por quantos segundos o soquete de quem fechou primeiro fica em TIME_WAIT nesta simulação?', TIME_WAIT_S, 0)];

const dia102: Dia = {
  numero: 102,
  ato: 5,
  titulo: 'Aperto de mão',
  chamado: [
    'CHAMADO #0102',
    'O portal da prefeitura está no ar na sala dos servidores, mas a equipe de comunicação jura que "às vezes o site recusa" e "às vezes demora para soltar". Ninguém sabe dizer em que porta ele atende.',
    'Antes de culpar o servidor, é preciso entender como uma conexão nasce, como ela é recusada e como ela morre.',
    'Objetivo: uma tentativa recusada com RST registrada, uma conexão com o portal aberta pelo aperto de mão em três vias e encerrada pela estação, que fica em TIME_WAIT.',
  ],
  manual: {
    titulo: 'Endereçamento, estabelecimento e encerramento',
    texto: [
      'Para falar com um programa numa máquina, não basta o IP: é preciso a porta, um número de 16 bits (de 1 a 65535) que identifica o ponto de transporte. As portas abaixo de 1024 são as conhecidas, combinadas para os serviços de sempre: 80 para a web, 443 para a web segura, 25 para correio, 53 para nomes, 22 para acesso remoto seguro. Quem conecta não escolhe porta nenhuma: o sistema dá uma porta efêmera, aqui de 49152 em diante, que só vive enquanto a conexão existir. Uma conexão TCP fica identificada pela quádrupla: IP e porta de cada lado.',
      'Abrir uma conexão parece fácil, mas a rede pode atrasar e duplicar pacotes. Imagine um pedido de conexão velho, preso numa fila, que chega minutos depois e abre uma conexão que ninguém pediu; ou um segmento de dados de uma conexão antiga que cai dentro de uma nova com as mesmas portas. A defesa tem duas partes: cada segmento tem uma vida máxima na rede (MSL), e cada conexão começa com um número de sequência inicial sorteado, longe do da conexão anterior. Um segmento velho chega com números que não fazem sentido e é jogado fora.',
      'O aperto de mão em três vias combina os números iniciais dos dois lados. O cliente manda SYN com o seu número x e passa a SYN_SENT. O servidor, em LISTEN, responde SYN+ACK com o número dele, y, e confirma x+1, passando a SYN_RCVD. O cliente confirma y+1 com um ACK e está em ESTABLISHED; quando esse ACK chega, o servidor também. Se um SYN velho aparecer, o servidor responde SYN+ACK, o cliente percebe que não pediu nada e recusa. Se ninguém escuta na porta, a resposta é RST: conexão recusada, na hora. Se nada volta, o cliente reenvia o SYN depois de 1 s, 2 s, 4 s e desiste.',
      'Encerrar é mais difícil do que abrir. No encerramento assimétrico, um lado desliga e a conexão acaba, o que pode perder dados ainda em trânsito. No simétrico, cada sentido é fechado separadamente: "não tenho mais nada a dizer", mas ainda escuto. E nenhum protocolo garante que os dois lados saibam que o outro sabe: é o problema dos dois exércitos, em que dois aliados precisam combinar um ataque por mensageiros que podem ser capturados, e cada confirmação pede outra confirmação, sem fim.',
      'O TCP aceita essa limitação e faz o razoável: quem fecha manda FIN e vai para FIN_WAIT_1; o outro confirma (ACK) e fica em CLOSE_WAIT até a aplicação dele fechar também, quando manda o seu FIN e vai para LAST_ACK. Quem fechou primeiro confirma esse FIN e fica em TIME_WAIT por 2 MSL (aqui, 120 s), para o caso de o último ACK se perder e o FIN voltar, e para nenhum segmento atrasado dessa conexão cair numa conexão nova com as mesmas portas.',
    ],
  },
  dicas: [
    'O portal escuta em uma porta só. Tente uma que ele não usa para ver a recusa, depois a certa.',
    'Conecte em 10.5.0.30 porta 443 (recusa com RST) e depois porta 80 (abre). "Máquina de estados do TCP" mostra todos os estados.',
    'Com a conexão aberta, "Fechar a conexão" escolhendo "eu primeiro": quem fecha primeiro é quem fica em TIME_WAIT.',
  ],
  montar: mundo102,
  objetivo: (m) => {
    const f = fechamento(m, PORTAL, 80);
    return [
      item('uma tentativa de conexão recusada com RST', chamou(m, 'estacao', 'conexão recusada (RST)'), 'nenhuma recusa registrada'),
      item(`a conexão com ${PORTAL}:80 aberta e encerrada pela estação`, !!f && f.modo === 'cliente' && f.estadosCliente.includes('FIN_WAIT_1'), f ? `encerramento pelo ${f.modo}` : 'nenhum encerramento com o portal'),
      item('o soquete da estação em TIME_WAIT para o portal', emTimeWait(m, 'estacao', 80, PORTAL), descreverSoquetes(m, 'estacao')),
    ];
  },
  posMorte: [
    'A recusa era isso: alguém digitava o endereço seguro, porta 443, e o portal só atende na 80. O SYN chegou, o servidor não achou nenhum soquete escutando naquela porta e respondeu RST na hora. O cliente voltou de SYN_SENT direto para CLOSED. Recusa não é demora: quando nada responde, aí sim o cliente fica reenviando o SYN, depois de 1 s, 2 s, 4 s, até desistir.',
    'Na porta 80, três segmentos: SYN com o número inicial sorteado da estação, SYN+ACK com o do portal e a confirmação do primeiro mais um, ACK confirmando o do portal mais um. Os números parecem aleatórios porque são: assim um segmento velho de outra conexão não se encaixa nesta.',
    'O "demora para soltar" é o TIME_WAIT. Quem fecha primeiro guarda o soquete por 2 MSL, 120 s aqui, para absorver um FIN repetido e deixar morrer qualquer segmento atrasado. Não é defeito, é o preço de não confundir conexões. Num servidor muito movimentado que fecha primeiro, milhares de soquetes em TIME_WAIT viram assunto, e é por isso que interessa saber quem fecha.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'De uma porta efêmera, de 49152 em diante, que o sistema escolhe sozinho',
          'Da porta 80 também, a mesma do servidor',
          'De uma porta conhecida qualquer, abaixo de 1024',
          'De porta nenhuma: só o servidor tem porta',
        ],
        certa: 0,
        errada: {
          1: 'Se todo cliente saísse da 80, duas abas no mesmo computador teriam a mesma quádrupla e o servidor não saberia separar as conversas.',
          2: 'Portas abaixo de 1024 são para serviços conhecidos, e só o administrador abre. O cliente não precisa ser encontrado por ninguém.',
          3: 'Toda ponta de uma conexão TCP tem IP e porta. Sem porta de origem, a resposta não teria para onde voltar dentro da estação.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O portal atende numa porta conhecida. E a conexão da estação, sai de que porta?',
      porque: 'O servidor precisa de uma porta fixa e combinada para ser encontrado. O cliente só precisa de uma porta livre durante a conversa.',
      feito: 'Porta efêmera. A quádrupla (IP e porta da estação, IP e porta do portal) identifica a conexão inteira.',
    }),
    passo({
      alvo: ['equip', 'estacao'],
      acao: 'tr-conectar',
      valores: { ip: PORTAL, porta: '443' },
      instrucao: 'Na estação, tente conectar no portal (10.5.0.30) pela porta 443, a da web segura.',
      porque: 'É o que o navegador faz quando alguém digita o endereço seguro. Vamos ver o que o portal responde.',
      conferir: (m) => (chamou(m, 'estacao', 'conexão recusada (RST)') ? true : 'Não houve recusa. A ideia é tentar uma porta em que o portal não escuta, a 443.'),
      feito: 'SYN foi, RST voltou: ninguém escuta na 443. O cliente saiu de SYN_SENT direto para CLOSED, sem esperar nada.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Para um segmento velho, atrasado na rede, não se encaixar numa conexão nova com as mesmas portas',
          'Para criptografar a conexão',
          'Porque o número 0 é proibido no cabeçalho',
          'Para o servidor saber quantos bytes vão chegar',
        ],
        certa: 0,
        errada: {
          1: 'O número de sequência não esconde nada: vai às claras no cabeçalho. Sigilo é outro assunto, do ato 7.',
          2: 'Zero é um número de sequência válido. O problema de começar sempre do mesmo lugar é outro.',
          3: 'O número inicial não diz nada sobre o tamanho. Ele só marca de onde a contagem de bytes começa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Cada conexão começa com um número de sequência inicial sorteado. Para quê?',
      porque: 'A rede pode guardar um segmento por um bom tempo e entregá-lo depois. Se toda conexão começasse do zero, um segmento da conversa anterior pareceria fazer parte desta.',
      feito: 'Com números iniciais distantes e uma vida máxima para cada segmento, duplicatas atrasadas caem fora da janela e são descartadas.',
    }),
    passo({
      alvo: ['equip', 'estacao'],
      acao: 'tr-conectar',
      valores: { ip: PORTAL },
      pedir: ['porta'],
      exemplo: { porta: '80' },
      instrucao: 'Agora conecte no portal pela porta em que ele de fato escuta.',
      porque: 'O portal faz HTTP comum, na porta conhecida da web. No log aparecem os três segmentos do aperto de mão e os estados dos dois lados.',
      conferir: (m) => {
        if (conectado(m, 'estacao', PORTAL, 80)) return true;
        const c = m.flags.conexao as { resultado?: string; porta?: number } | undefined;
        if (c?.resultado === 'recusada') return `RST de novo: o portal não escuta em TCP ${c.porta}. A porta da web comum é a 80.`;
        return 'A estação ainda não tem conexão aberta com o portal.';
      },
      feito: 'SYN, SYN+ACK, ACK. Cada lado confirmou o número inicial do outro mais um, e os dois estão em ESTABLISHED.',
    }),
    passo({
      alvo: ['equip', 'estacao'],
      acao: 'tr-estados',
      instrucao: 'Abra a máquina de estados do TCP e encontre o caminho do cliente e o do servidor.',
      porque: 'Os mesmos onze estados servem aos dois lados. O que muda é a ordem dos eventos: quem abre ativo, quem abre passivo, quem fecha primeiro.',
      feito: 'Cliente: CLOSED, SYN_SENT, ESTABLISHED. Servidor: LISTEN, SYN_RCVD, ESTABLISHED. Para fechar: FIN_WAIT_1, FIN_WAIT_2 e TIME_WAIT de quem fecha primeiro; CLOSE_WAIT e LAST_ACK do outro.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Nenhum protocolo garante isso: a última mensagem pode sempre se perder, e confirmá-la exige outra mensagem',
          'Basta mandar o FIN duas vezes',
          'Basta o servidor responder com RST',
          'Basta esperar 1 segundo depois do FIN',
        ],
        certa: 0,
        errada: {
          1: 'Duas cópias podem se perder do mesmo jeito que uma. E quem mandou continua sem saber se alguma chegou.',
          2: 'RST derruba a conexão na hora, sem confirmar nada, e ainda pode jogar fora dados que estavam em trânsito.',
          3: 'Esperar não traz notícia nenhuma. Se a mensagem se perdeu, o outro lado continua sem saber.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Dá para encerrar uma conexão com a certeza de que os dois lados sabem que o outro sabe que acabou?',
      porque: 'É o problema dos dois exércitos: cada confirmação mandada por um canal que perde mensagens pede uma confirmação dela, sem fim.',
      feito: 'Não dá. O TCP faz o razoável: cada lado fecha o seu sentido com FIN e ACK, e quem fecha primeiro espera um tempo para o caso de algo voltar.',
    }),
    passo({
      alvo: ['equip', 'estacao'],
      acao: 'tr-fechar',
      pedir: ['modo'],
      exemplo: { modo: 'cliente' },
      instrucao: 'Feche a conexão com a estação fechando primeiro.',
      porque: 'Encerramento simétrico: cada lado fecha o seu sentido. Quem manda o primeiro FIN é quem fica em TIME_WAIT.',
      conferir: (m) => {
        if (emTimeWait(m, 'estacao', 80, PORTAL)) return true;
        const f = fechamento(m, PORTAL, 80);
        if (f && f.modo !== 'cliente') return 'A conexão fechou, mas quem ficou em TIME_WAIT foi o portal. Para a estação esperar, ela precisa fechar primeiro. Conecte de novo e feche escolhendo "eu primeiro".';
        return 'A estação não está em TIME_WAIT com o portal.';
      },
      feito: 'FIN, ACK, FIN, ACK. A estação passou por FIN_WAIT_1, FIN_WAIT_2 e ficou em TIME_WAIT por 120 s; o portal passou por CLOSE_WAIT e LAST_ACK e já está livre.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Portas',
        texto: ['A porta diz qual programa, dentro da máquina, recebe o segmento. O servidor usa uma porta conhecida; o cliente, uma efêmera.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Faixa', 'Quem usa', 'Exemplos'],
          linhas: [
            ['1 a 1023', 'serviços conhecidos (só o administrador abre)', '22 acesso remoto, 25 correio, 53 nomes, 80 web, 443 web segura'],
            ['1024 a 49151', 'serviços registrados', '5000, 5004 (áudio em tempo real)'],
            ['49152 a 65535', 'portas efêmeras do cliente', 'a 49152 da primeira conexão da estação'],
          ],
        },
      },
      {
        titulo: 'Três vias',
        texto: ['Cada lado anuncia o seu número inicial e confirma o do outro mais um. Três segmentos bastam para os dois saberem que o outro está vivo e de onde a contagem começa.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c0', rotulo: 'estação: CLOSED', x: 100, y: 40 },
            { id: 'c1', rotulo: 'SYN_SENT', x: 100, y: 120 },
            { id: 'c2', rotulo: 'ESTABLISHED', x: 100, y: 220 },
            { id: 's0', rotulo: 'portal: LISTEN', x: 480, y: 40 },
            { id: 's1', rotulo: 'SYN_RCVD', x: 480, y: 170 },
            { id: 's2', rotulo: 'ESTABLISHED', x: 480, y: 270 },
          ],
          ligacoes: [
            ['c0', 'c1'],
            ['c1', 's1', 'SYN seq=x'],
            ['s1', 'c2', 'SYN+ACK seq=y ack=x+1'],
            ['c2', 's2', 'ACK ack=y+1'],
            ['s0', 's1'],
          ],
        },
      },
      {
        titulo: 'Recusa, silêncio e duplicata',
        texto: ['RST é uma resposta: alguém disse não. Silêncio é outra coisa, e o cliente reenvia o SYN até desistir. Uma duplicata velha morre porque o número dela não bate com nada.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'O que volta', 'O cliente'],
          linhas: [
            ['ninguém escuta na porta', 'RST', 'SYN_SENT → CLOSED na hora: conexão recusada'],
            ['máquina desligada ou caminho quebrado', 'nada', 'reenvia o SYN depois de 1 s, 2 s, 4 s e desiste'],
            ['SYN velho e atrasado chega ao servidor', 'SYN+ACK', 'não pediu nada: responde RST e a conexão fantasma morre'],
          ],
        },
      },
      {
        titulo: 'Fechar cada sentido',
        texto: [
          'Quem fecha primeiro: FIN_WAIT_1, FIN_WAIT_2, TIME_WAIT. O outro: CLOSE_WAIT até a aplicação fechar, depois LAST_ACK.',
          'O TIME_WAIT dura 2 MSL (120 s aqui): se o último ACK se perder, o FIN repetido ainda encontra alguém para confirmá-lo.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['estação manda FIN: ESTABLISHED → FIN_WAIT_1', 'portal confirma com ACK: CLOSE_WAIT; estação em FIN_WAIT_2', 'portal fecha e manda FIN: LAST_ACK', 'estação confirma: TIME_WAIT por 2 MSL, depois CLOSED'],
          rotulo: 'encerramento simétrico, quatro segmentos',
        },
      },
      {
        titulo: 'Os dois exércitos',
        texto: ['Dois aliados nos morros, um inimigo no vale. Só vencem se atacarem juntos, e cada mensageiro pode ser capturado. Quem mandou a última confirmação nunca sabe se ela chegou. Não existe protocolo que resolva; existe protocolo que se contenta.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'aliado azul', x: 80, y: 60 },
            { id: 'v', rotulo: 'vale: mensageiros somem', x: 300, y: 200 },
            { id: 'b', rotulo: 'aliado verde', x: 520, y: 60 },
          ],
          ligacoes: [
            ['a', 'v', 'ataque ao amanhecer?'],
            ['v', 'b', 'chegou?'],
            ['b', 'a', 'combinado (chegou?)'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'A estação tenta conectar no portal e recebe RST imediatamente. O que isso diz?',
      opcoes: [
        'O portal está ligado e alcançável, mas nenhum programa escuta naquela porta',
        'O cabo do portal está solto',
        'O portal está sobrecarregado e vai responder mais tarde',
        'A conexão abriu e fechou rápido',
      ],
      certa: 0,
      explicacao: 'Para responder RST, o SYN precisou chegar e alguém precisou responder: a máquina está lá. RST quer dizer "aqui não tem ninguém nessa porta". Cabo solto ou máquina desligada não respondem nada, e o cliente fica reenviando o SYN até desistir.',
    },
  },
  desafio: {
    carta: [
      'O servidor de correio da prefeitura (10.5.0.25) foi instalado ontem e ninguém consegue mandar mensagem: "conexão recusada". O instalador deixou o programa rodando "numa porta de teste" e foi embora.',
      'No correio, quem encerra a conversa é o servidor: o cliente manda QUIT, o servidor responde e fecha. A equipe quer ver uma conexão inteira assim e saber quanto tempo o servidor segura cada soquete depois.',
      'Objetivo: o correio atendendo na porta conhecida certa e sem o serviço de teste, uma conexão da estação aberta e encerrada pelo servidor, o soquete do servidor em TIME_WAIT e a pergunta respondida.',
    ],
    dicas: [
      'Veja os soquetes do correio: em que porta o serviço de teste está? E qual é a porta conhecida do correio?',
      'Pare o TCP 2525, abra o TCP 25. Depois conecte da estação em 10.5.0.25 porta 25.',
      'Feche escolhendo "o servidor primeiro". O TIME_WAIT dura 2 MSL; o log do encerramento mostra quantos segundos.',
    ],
    perguntas: d102D,
    montar: mundo102D,
    objetivo: (m) => {
      const f = fechamento(m, CORREIO, 25);
      return [
        item('o correio escuta em TCP 25', escutando(m, 'correio', 'tcp', 25), descreverSoquetes(m, 'correio')),
        item('o serviço de teste da porta 2525 desligado', !escutando(m, 'correio', 'tcp', 2525), descreverSoquetes(m, 'correio')),
        item(`uma conexão com ${CORREIO}:25 encerrada pelo servidor`, !!f && f.modo === 'servidor', f ? `encerramento: ${f.modo}` : 'nenhum encerramento com o correio'),
        item('o soquete do correio em TIME_WAIT', emTimeWait(m, 'correio', 25), descreverSoquetes(m, 'correio')),
        ...todasRespondidas(m, d102D),
      ];
    },
    solucao: [
      ['equip', 'correio', 'tr-parar', { proto: 'tcp', porta: '2525' }],
      ['equip', 'correio', 'tr-escutar', { proto: 'tcp', porta: '25' }],
      ['equip', 'estacao', 'tr-conectar', { ip: CORREIO, porta: '25' }],
      ['equip', 'estacao', 'tr-fechar', { modo: 'servidor' }],
    ],
    respostas: { '1': String(TIME_WAIT_S) },
  },
};

/* ======================================================================
 * ref 103: Fluxo e falhas (6.2.4 a 6.2.6)
 * ====================================================================== */

const HOSP = '10.5.2.20';
const ESCOLA = '10.5.3.20';
const BACKUP = '10.5.0.50';
/** Buffer do receptor pedido na prática, em bytes. */
const JANELA_PEQUENA = 16000;

function mundo103(): Mundo {
  const m = salaDosServidores(5103, [
    { nome: 'arquivos', ip: ARQUIVOS, modelo: 'Servidor de arquivos da prefeitura' },
    { nome: 'terminal-hosp', ip: HOSP, modelo: 'Terminal do hospital (chega à sala pelo anel da cidade)' },
    { nome: 'escola', ip: ESCOLA, modelo: 'Computador da secretaria da escola' },
    { nome: 'backup', ip: BACKUP, modelo: 'Robô de cópias da madrugada' },
  ]);
  escutar(m, m.equipamentos.get('arquivos')!, 'tcp', PORTA_ARQUIVOS, 'arquivos');
  // O robô de cópias já está conectado desde a madrugada.
  conectar(m, m.equipamentos.get('backup')!, lerIp(ARQUIVOS)!, PORTA_ARQUIVOS);
  return m;
}

const LAUDOS = '10.5.1.10';
/** Buffer de recepção que veio de fábrica no exame-2, pequeno demais para o caminho. */
const JANELA_FABRICA = 8000;
const VAZAO_MINIMA = 8;

function mundo103D(): Mundo {
  const m = salaDosServidores(6103, [
    { nome: 'laudos', ip: LAUDOS, modelo: 'Servidor de laudos do hospital (recém-reiniciado)' },
    { nome: 'exame-1', ip: '10.5.1.21', modelo: 'Estação de exames da radiologia' },
    { nome: 'exame-2', ip: '10.5.1.22', modelo: 'Estação de exames do anexo (do outro lado do rádio)' },
  ]);
  const e2 = m.equipamentos.get('exame-2')!;
  e2.s.tcp = { janela: JANELA_FABRICA };
  // O anexo fica do outro lado do rádio: 20 ms de cada sentido, emulados no laboratório.
  e2.s.caminhoTransporte = { atraso: 0.02 };
  return m;
}

function contaPorta(m: Mundo, nome: string, porta: number): number {
  return soq(m, nome).filter((s) => s.proto === 'tcp' && s.portaLocal === porta).length;
}

const d103D: Pergunta[] = [numerica('1', 'Com os dois exames conectados, quantos soquetes TCP o servidor de laudos tem na porta 443?', (m) => contaPorta(m, 'laudos', 443), 0)];

interface FlagTcp {
  de: string;
  ip: string;
  porta: number;
  ok: boolean;
  concluiu?: boolean;
  vazaoMbps?: number;
  janelasZero?: number;
  sondas?: number;
  config?: { janela: number };
}

function ultimaTcp(m: Mundo, de: string, ip: string, porta: number): FlagTcp | undefined {
  const t = m.flags.tcp as FlagTcp | undefined;
  return t && t.de === de && t.ip === ip && t.porta === porta && tcpConfere(m) ? t : undefined;
}

function clientesDistintos(m: Mundo, nome: string, porta: number): number {
  return new Set(estabelecidos(m, nome, porta).map((s) => `${s.ipRemoto}:${s.portaRemota}`)).size;
}

const dia103: Dia = {
  numero: 103,
  ato: 5,
  titulo: 'Fluxo e falhas',
  chamado: [
    'CHAMADO #0103',
    'O hospital manda toda noite a cópia dos prontuários para o servidor de arquivos, que grava no disco aos trancos: de vez em quando o programa para de ler por meio segundo. A equipe do hospital quer saber se a cópia "se perde" nessas paradas.',
    'Enquanto isso, a escola também precisa usar o mesmo serviço, na mesma porta, e o robô de cópias da madrugada já está conectado lá.',
    'Objetivo: uma transferência do terminal do hospital com buffer do receptor pequeno e leitura parada, que passe por janela zero e sonda e termine inteira, e o servidor atendendo duas conversas ao mesmo tempo na porta 5000.',
  ],
  manual: {
    titulo: 'Controle de erros e de fluxo, multiplexação e falhas',
    texto: [
      'O transporte resolve os mesmos problemas que o enlace resolveu no ato 2: erros e fluxo. Os segmentos têm número de sequência e soma de verificação, o receptor confirma o que chegou, e o emissor retransmite o que não foi confirmado a tempo. A diferença é o tamanho do mundo: no enlace o atraso é de um cabo, conhecido; no transporte o caminho atravessa a cidade, o atraso varia, e cabem muito mais segmentos em voo ao mesmo tempo.',
      'Controle de fluxo é não afogar o receptor. Os bytes que chegam vão para um buffer, e a aplicação lê quando pode. Em cada confirmação o receptor anuncia a janela: quanto espaço livre ainda tem. O emissor nunca manda mais do que isso sem confirmação. Se a aplicação para de ler, o buffer enche e a janela anunciada vai a zero: o emissor para. Para não ficar travado para sempre caso o anúncio de "abriu" se perca, ele manda de tempos em tempos uma sonda de 1 byte, que obriga o receptor a dizer a janela de novo. A janela também limita a velocidade: no máximo uma janela por tempo de ida e volta.',
      'Multiplexação é várias conversas usando a mesma máquina e a mesma rede. Na saída, o transporte junta os segmentos de todos os soquetes num só fluxo de pacotes; na chegada, faz a demultiplexação, olhando as portas para decidir qual soquete recebe cada segmento. No TCP a conta é pela quádrupla inteira, então um servidor pode ter centenas de conversas na mesma porta 5000, uma para cada IP e porta de origem, sem misturar nada.',
      'E se uma máquina reinicia no meio da conversa? O transporte dela esquece tudo: soquetes, números de sequência, o que já tinha confirmado. Quando o próximo segmento do outro lado chega, não casa com soquete nenhum e a resposta é RST. Pior: o servidor pode ter confirmado um pedaço e caído antes de gravar no disco, ou gravado e caído antes de confirmar. Nenhuma regra só do transporte, de retransmitir sempre ou nunca, acerta todos os casos. A recuperação de uma falha da máquina precisa da camada de cima: a aplicação reconecta e combina de onde continuar.',
    ],
  },
  dicas: [
    'O laboratório tem cabos de 3 metros. Para o caminho parecer o do hospital, ponha atraso no terminal do hospital antes de mexer na janela.',
    'No terminal-hosp: atraso de 20 ms, janela de 16000 bytes com escala 0, "Aplicação lenta no receptor" e depois transferir 1M para 10.5.0.10 porta 5000.',
    'Na escola, conecte em 10.5.0.10 porta 5000. Os soquetes do servidor mostram o robô e a escola na mesma porta.',
  ],
  montar: mundo103,
  objetivo: (m) => {
    const t = ultimaTcp(m, 'terminal-hosp', ARQUIVOS, PORTA_ARQUIVOS);
    return [
      item(`transferência do terminal do hospital com buffer do receptor de até ${JANELA_PEQUENA} bytes`, !!t && (t.config?.janela ?? Infinity) <= JANELA_PEQUENA, t ? `buffer ${t.config?.janela} bytes` : 'nenhuma transferência válida com a configuração atual'),
      item('o receptor anunciou janela zero e o emissor mandou sonda', !!t && (t.janelasZero ?? 0) > 0 && (t.sondas ?? 0) > 0, t ? `${t.janelasZero} janela(s) zero, ${t.sondas} sonda(s)` : 'sem transferência'),
      item('a cópia chegou inteira', !!t && !!t.concluiu, t ? (t.concluiu ? 'concluída' : 'não terminou') : 'sem transferência'),
      item('o servidor de arquivos com duas conversas ao mesmo tempo na porta 5000', clientesDistintos(m, 'arquivos', PORTA_ARQUIVOS) >= 2, `${clientesDistintos(m, 'arquivos', PORTA_ARQUIVOS)} conversa(s) abertas`),
    ];
  },
  posMorte: [
    'A cópia nunca se perdeu. Quando o programa do servidor parou de ler, os 16000 bytes do buffer encheram e o receptor anunciou janela zero. O emissor parou de mandar dados, e algum tempo depois mandou uma sonda de 1 byte só para perguntar "e agora?". Quando a leitura voltou, a janela abriu e a transferência seguiu de onde estava, sem retransmitir nada. Controle de fluxo não perde dado: ele só manda esperar.',
    'Repare também na vazão. Com 16000 bytes de janela e 40 ms de ida e volta, o máximo é 16000 bytes a cada 40 ms, 3,2 Mb/s, num enlace de 1000 Mb/s. A janela do receptor é um freio de mão: num caminho longo, um buffer pequeno segura tudo. O ato volta a isso quando a videochamada do hospital precisar de banda.',
    'No fim, o servidor tinha um soquete escutando e dois conectados na mesma porta 5000: o do robô e o da escola. Cada segmento que chega é entregue pela quádrupla, então as duas conversas nunca se misturam. E se o servidor reiniciasse agora, as duas morreriam com RST no próximo segmento, e caberia aos programas reconectar e combinar de onde continuar.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'terminal-hosp'],
      acao: 'tr-atraso',
      valores: { ms: '20' },
      instrucao: 'No terminal do hospital, ponha 20 ms de atraso em cada sentido, como o caminho pelo anel da cidade.',
      porque: 'No laboratório o cabo tem 3 m e a ida e volta leva microssegundos. Com 40 ms de ida e volta, a janela passa a fazer diferença.',
      conferir: (m) => (((m.equipamentos.get('terminal-hosp')!.s.caminhoTransporte as { atraso?: number } | undefined)?.atraso ?? 0) >= 0.01 ? true : 'Sem atraso, o caminho é curto demais para ver a janela trabalhar.'),
      feito: 'Ida e volta de 40 ms, como um caminho entre bairros distantes.',
    }),
    passo({
      alvo: ['equip', 'terminal-hosp'],
      acao: 'tr-janela',
      valores: { escala: '0' },
      pedir: ['janela'],
      exemplo: { janela: String(JANELA_PEQUENA) },
      instrucao: 'Deixe o buffer do receptor em 16000 bytes, sem escala de janela.',
      porque: 'O buffer do receptor é o maior valor que ele pode anunciar na janela. No laboratório, a configuração da conversa inteira, inclusive o buffer de quem recebe, fica no host que inicia a transferência.',
      conferir: (m) => {
        const j = (m.equipamentos.get('terminal-hosp')!.s.tcp as { janela?: number } | undefined)?.janela;
        return j !== undefined && j <= JANELA_PEQUENA ? true : `O buffer está em ${j ?? 65535} bytes. Para encher rápido na parada da leitura, use ${JANELA_PEQUENA}.`;
      },
      feito: 'Buffer do receptor de 16000 bytes: cabem 10 segmentos cheios de 1460 bytes (14600 bytes) esperando a aplicação ler.',
    }),
    passo({
      alvo: ['equip', 'terminal-hosp'],
      acao: 'tr-leitura',
      instrucao: 'Simule o servidor gravando aos trancos: a aplicação que recebe para de ler entre 0,05 s e 0,5 s.',
      porque: 'Enquanto a aplicação não lê, os bytes que chegam ficam no buffer. Quando ele enche, o receptor não tem mais espaço para anunciar.',
      conferir: (m) => ((m.equipamentos.get('terminal-hosp')!.s.tcp as { pausaLeitura?: number[] } | undefined)?.pausaLeitura ? true : 'A pausa na leitura não foi configurada.'),
      feito: 'Meio segundo sem leitura: tempo de sobra para o buffer de 16000 bytes encher.',
    }),
    passo({
      alvo: ['equip', 'terminal-hosp'],
      acao: 'tr-transferir',
      valores: { ip: ARQUIVOS, porta: String(PORTA_ARQUIVOS) },
      pedir: ['bytes'],
      exemplo: { bytes: '1M' },
      instrucao: 'Transfira a cópia, 1 MB, para o servidor de arquivos.',
      porque: 'Nos eventos aparecem o anúncio de janela zero, a sonda de 1 byte e a janela abrindo quando a leitura volta.',
      conferir: (m) => {
        const t = ultimaTcp(m, 'terminal-hosp', ARQUIVOS, PORTA_ARQUIVOS);
        if (!t) return 'Não há transferência do terminal do hospital com a configuração de agora.';
        if (!t.concluiu) return 'A transferência não terminou. Mande 1 MB.';
        if (!t.janelasZero) return 'Não houve janela zero: a transferência acabou antes da parada na leitura. Mande mais dados, 1 MB.';
        if (!t.sondas) return 'Houve janela zero, mas nenhuma sonda. Mande mais dados, para a parada durar mais que a espera do emissor.';
        return true;
      },
      feito: 'Janela zero, sonda, janela aberta de novo, e o 1 MB inteiro do outro lado. A vazão ficou abaixo de 3,2 Mb/s: 16000 bytes por ida e volta de 40 ms.',
    }),
    passo({
      alvo: ['equip', 'escola'],
      acao: 'tr-conectar',
      valores: { ip: ARQUIVOS, porta: String(PORTA_ARQUIVOS) },
      instrucao: 'Na escola, conecte no servidor de arquivos, na mesma porta 5000.',
      porque: 'O robô de cópias já está conectado nessa porta. A escola vai usar a mesma porta do mesmo servidor.',
      conferir: (m) => (conectado(m, 'escola', ARQUIVOS, PORTA_ARQUIVOS) ? true : 'A escola ainda não tem conexão com o servidor de arquivos.'),
      feito: 'Conexão aberta, de 10.5.3.20, porta efêmera 49152, para 10.5.0.10:5000.',
    }),
    passo({
      alvo: ['equip', 'arquivos'],
      acao: 'tr-soquetes',
      instrucao: 'No servidor de arquivos, veja a tabela de soquetes.',
      porque: 'Duas conversas na mesma porta local. O que separa uma da outra é o resto da quádrupla: o IP e a porta de cada cliente.',
      conferir: (m) => (clientesDistintos(m, 'arquivos', PORTA_ARQUIVOS) >= 2 ? true : 'O servidor deveria ter duas conversas abertas na porta 5000.'),
      feito: 'Um soquete em LISTEN e dois em ESTABLISHED, todos na porta 5000: um para 10.5.0.50, o robô, e outro para 10.5.3.20, a escola.',
    }),
    passo({
      escolha: {
        opcoes: [
          'O servidor esquece as conexões; o próximo segmento leva RST, e a aplicação precisa reconectar e combinar de onde continuar',
          'O TCP retoma sozinho do byte exato em que parou',
          'O TCP do cliente retransmite tudo desde o começo e resolve',
          'Nada: as conexões continuam abertas no servidor',
        ],
        certa: 0,
        errada: {
          1: 'Depois de reiniciar, o servidor não lembra nem dos números de sequência. E não sabe se gravou no disco o último pedaço que confirmou.',
          2: 'O cliente nem sabe se o servidor gravou ou não o último pedaço. Repetir tudo pode duplicar; não repetir pode perder. Só a aplicação sabe o que de fato foi gravado.',
          3: 'O estado das conexões mora na memória, e a memória se foi com o reinício. A tabela de soquetes volta vazia.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se o servidor de arquivos reiniciar agora, o que acontece com a conversa da escola?',
      porque: 'Recuperar de uma falha do host exige saber o que foi feito antes de cair, e isso o transporte não guarda.',
      feito: 'RST no próximo segmento, e a recuperação fica com a aplicação: reconectar e perguntar "até onde você gravou?".',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'A janela do receptor',
        texto: [
          'O emissor só tem em voo o que cabe na janela anunciada. Confirmou, a janela anda; a aplicação não leu, a janela encolhe.',
          'Na figura: 10 segmentos, janela de 4. Os da esquerda já foram confirmados; os 4 seguintes podem estar em voo; os outros esperam.',
        ],
        visual: { tipo: 'janela', total: 10, janela: 4 },
      },
      {
        titulo: 'Janela zero e sonda',
        texto: ['A janela zero manda o emissor parar. Se o aviso de que a janela abriu se perder, os dois ficariam esperando um pelo outro para sempre; a sonda de 1 byte quebra esse impasse.'],
        visual: {
          tipo: 'camadas',
          camadas: ['a aplicação para de ler e o buffer de 16000 bytes enche', 'o receptor anuncia janela 0: o emissor para', 'passa um tempo: o emissor manda uma sonda de 1 byte', 'a aplicação volta a ler: o receptor anuncia janela aberta e a cópia segue'],
          rotulo: 'controle de fluxo: esperar sem perder nada',
        },
      },
      {
        titulo: 'Demultiplexação pela quádrupla',
        texto: ['Na chegada, o TCP procura o soquete cuja quádrupla casa inteira. Se nenhum casa, procura quem escuta na porta. Se nem isso, RST.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r', rotulo: 'robô 10.5.0.50:49152', x: 80, y: 50 },
            { id: 'e', rotulo: 'escola 10.5.3.20:49152', x: 80, y: 150 },
            { id: 'n', rotulo: 'alguém novo', x: 80, y: 250 },
            { id: 's1', rotulo: 'soquete do robô (ESTABLISHED)', x: 470, y: 50 },
            { id: 's2', rotulo: 'soquete da escola (ESTABLISHED)', x: 470, y: 150 },
            { id: 's0', rotulo: 'soquete que escuta :5000 (LISTEN)', x: 470, y: 250 },
          ],
          ligacoes: [
            ['r', 's1', 'quádrupla casa'],
            ['e', 's2', 'quádrupla casa'],
            ['n', 's0', 'só a porta casa: vai para o accept'],
          ],
        },
      },
      {
        titulo: 'Quando o servidor cai',
        texto: ['O servidor confirma e grava; pode cair entre uma coisa e outra. O cliente não sabe em qual ordem aconteceu, e qualquer regra fixa erra em algum caso.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['O servidor caiu...', 'O cliente sempre retransmite', 'O cliente nunca retransmite'],
          linhas: [
            ['depois de confirmar e gravar', 'grava duas vezes', 'certo'],
            ['depois de confirmar, antes de gravar', 'certo', 'perde o pedaço'],
            ['depois de gravar, antes de confirmar', 'grava duas vezes', 'certo'],
            ['antes de gravar e de confirmar', 'certo', 'perde o pedaço'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O receptor anunciou janela zero. O que o emissor faz?',
      opcoes: [
        'Para de mandar dados e, de tempos em tempos, manda uma sonda pequena para saber se a janela abriu',
        'Retransmite tudo o que mandou, porque a janela zero quer dizer que se perdeu',
        'Fecha a conexão com RST',
        'Continua mandando, porque a janela é só uma sugestão',
      ],
      certa: 0,
      explicacao: 'Janela zero não é perda: os dados chegaram e estão no buffer, esperando a aplicação ler. O emissor espera, e a sonda garante que um anúncio de janela aberta perdido não trave a conexão para sempre.',
    },
  },
  desafio: {
    carta: [
      'O servidor de laudos do hospital (10.5.1.10) reiniciou de madrugada por causa de uma queda de energia. Desde então, as duas estações de exame recebem RST em tudo e o serviço de imagens da porta 443 sumiu.',
      'E o exame-2, que fica no anexo, do outro lado do rádio, sempre mandou imagens "a passo de tartaruga": veio de fábrica com um buffer de recepção minúsculo para a conversa.',
      'Objetivo: o serviço de laudos de volta na porta 443, uma transferência do exame-2 a pelo menos 8 Mb/s, as duas estações conectadas ao mesmo tempo no servidor e a pergunta respondida.',
    ],
    dicas: [
      'Depois do reinício, o servidor não lembra de nada: nem do serviço que escutava, nem das conexões. Comece por ele.',
      'O exame-2 tem buffer do receptor de 8000 bytes e 40 ms de ida e volta: no máximo 8000 bytes a cada 40 ms, 1,6 Mb/s. Com 65535 bytes, o limite passa de 13 Mb/s.',
      'Cada estação faz a sua conexão na porta 443. O servidor fica com o soquete que escuta mais um por conversa.',
    ],
    perguntas: d103D,
    montar: mundo103D,
    objetivo: (m) => {
      const t = ultimaTcp(m, 'exame-2', LAUDOS, 443);
      return [
        item('o servidor de laudos escuta em TCP 443', escutando(m, 'laudos', 'tcp', 443), descreverSoquetes(m, 'laudos')),
        item(`uma transferência do exame-2 para o laudos a pelo menos ${VAZAO_MINIMA} Mb/s`, !!t && !!t.concluiu && (t.vazaoMbps ?? 0) >= VAZAO_MINIMA, t ? `${(t.vazaoMbps ?? 0).toFixed(2).replace('.', ',')} Mb/s` : 'nenhuma transferência válida com a configuração atual'),
        item('as duas estações de exame conectadas ao mesmo tempo na porta 443', conectado(m, 'exame-1', LAUDOS, 443) && conectado(m, 'exame-2', LAUDOS, 443), `${clientesDistintos(m, 'laudos', 443)} conversa(s) no servidor`),
        ...todasRespondidas(m, d103D),
      ];
    },
    solucao: [
      ['equip', 'laudos', 'tr-escutar', { proto: 'tcp', porta: '443' }],
      ['equip', 'exame-2', 'tr-janela', { janela: '65535', escala: '0' }],
      ['equip', 'exame-2', 'tr-transferir', { ip: LAUDOS, porta: '443', bytes: '2M' }],
      ['equip', 'exame-1', 'tr-conectar', { ip: LAUDOS, porta: '443' }],
      ['equip', 'exame-2', 'tr-conectar', { ip: LAUDOS, porta: '443' }],
    ],
    respostas: { '1': '3' },
  },
};

export const ATO5A: Dia[] = [dia101, dia102, dia103];
