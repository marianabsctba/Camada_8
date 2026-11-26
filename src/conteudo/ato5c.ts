// Dias do ato 5 (A Conversa), com prática guiada, aula e desafio no próprio dia.
// O TCP por dentro, segunda parte: máquina de estados e janela deslizante (6.5.7 e 6.5.8), os temporizadores (6.5.9)
// e o controle de congestionamento, da partida lenta ao CUBIC (6.5.10 e 6.5.11).

import { tcpConfere } from '../motor/cliTransporte';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import type { ConfigTcp } from '../motor/tcp';
import { assinaturaTcp, configTcp, escutar } from '../motor/transporte';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** O servidor do outro lado de todas as conversas deste arquivo. */
const SERVIDOR_IP = '203.0.113.10';
const PORTA = '443';

interface OpcoesConversa {
  semente: number;
  cliente: string;
  modeloCliente: string;
  servidor: string;
  modeloServidor: string;
  /** Atraso extra de cada sentido, em segundos (o emulador do caminho). */
  atraso?: number;
  /** Perda aleatória depois do gargalo (enlace sem fio). */
  perda?: number;
  /** Configuração TCP que já vem mexida no cliente. */
  tcp?: Partial<ConfigTcp>;
}

/**
 * A sala dos servidores: o cliente (192.168.50.10) sai pela borda, atravessa um enlace de 10 Mb/s até o roteador
 * da regional e chega ao servidor (203.0.113.10), que escuta em TCP 443. O enlace de 10 Mb/s é o gargalo.
 */
function mundoConversa(o: OpcoesConversa): Mundo {
  const m = novoMundo(o.semente);
  m.flags.transporte = true;
  adicionar(m, pc(o.cliente, { ip: lerCidr('192.168.50.10/24')!, gateway: '192.168.50.1', modelo: o.modeloCliente }));
  adicionar(m, pc(o.servidor, { ip: lerCidr(`${SERVIDOR_IP}/24`)!, gateway: '203.0.113.1', modelo: o.modeloServidor }));
  const borda = adicionar(
    m,
    roteador('borda', {
      modelo: 'Roteador de borda da sala dos servidores',
      interfaces: { lan: '192.168.50.1/24', wan: '198.51.100.1/30' },
      rotas: [{ destino: '203.0.113.0/24', via: '198.51.100.2' }],
    }),
  );
  adicionar(
    m,
    roteador('regional', {
      modelo: 'Roteador da regional',
      interfaces: { wan: '198.51.100.2/30', lan: '203.0.113.1/24' },
      rotas: [{ destino: '192.168.50.0/24', via: '198.51.100.1' }],
    }),
  );
  borda.portas.find((p) => p.nome === 'wan')!.velocidades = [10];
  ligar(m, { equip: o.cliente, porta: 'eth0' }, { equip: 'borda', porta: 'lan' }, 'cat6', 10, { id: 'c1' });
  ligar(m, { equip: 'borda', porta: 'wan' }, { equip: 'regional', porta: 'wan' }, 'cat6', 90, { id: 'c2' });
  ligar(m, { equip: 'regional', porta: 'lan' }, { equip: o.servidor, porta: 'eth0' }, 'cat6', 10, { id: 'c3' });
  m.proxCabo = 4;
  escutar(m, m.equipamentos.get(o.servidor)!, 'tcp', 443);
  const c = m.equipamentos.get(o.cliente)!;
  const caminho: { atraso?: number; perda?: number } = {};
  if (o.atraso) caminho.atraso = o.atraso;
  if (o.perda) caminho.perda = o.perda;
  if (Object.keys(caminho).length) c.s.caminhoTransporte = caminho;
  if (o.tcp) c.s.tcp = { ...o.tcp };
  return m;
}

interface FlagTcp {
  de: string;
  ok: boolean;
  bytes: number;
  concluiu?: boolean;
  algoritmo?: string;
  vazaoMbps?: number;
  segmentos?: number;
  timeouts?: number;
  retransRapidas?: number;
  retransmissoes?: number;
  janelasZero?: number;
  sondas?: number;
  migalhas?: number;
  karnDescartadas?: number;
  rtoMaxMs?: number;
  perda?: number;
  janelaMax?: number;
  config?: Partial<ConfigTcp>;
}

function ftcp(m: Mundo): FlagTcp | undefined {
  return m.flags.tcp as FlagTcp | undefined;
}

function atrasoDe(m: Mundo, nome: string): number {
  return ((m.equipamentos.get(nome)!.s.caminhoTransporte as { atraso?: number } | undefined) ?? {}).atraso ?? 0;
}

function resumoTcp(t: FlagTcp | undefined): string {
  if (!t) return 'nenhuma transferência feita';
  if (!t.ok) return 'a conexão não abriu';
  return `${t.bytes} bytes, ${t.concluiu ? 'concluída' : 'não terminou'}, ${t.vazaoMbps} Mb/s, ${t.segmentos} segmento(s), ${t.timeouts} tempo(s) esgotado(s), ${t.retransRapidas} retransmissão(ões) rápida(s)`;
}

/* ======================================================================
 * 107: Estados e janela do TCP (6.5.7 e 6.5.8)
 * ====================================================================== */

const CLIENTE_107 = 'sala-video';

const d107: Pergunta[] = [
  numerica('1', 'No laboratório de Nagle, as 40 teclas de 1 byte viraram quantos segmentos com o algoritmo ligado?', (m) => (m.flags.nagle as { com?: { segmentos: number } } | undefined)?.com?.segmentos ?? NaN, 0),
];

const dia107: Dia = {
  numero: 107,
  ato: 5,
  titulo: 'Estados e janela do TCP',
  chamado: [
    'CHAMADO #0107',
    'A videochamada do hospital com a regional abre, conversa e de repente congela. A equipe da sala dos servidores achou duas pistas: o programa que recebe o vídeo às vezes para de ler o que chega por quase meio segundo, e o terminal que controla a câmera da sala manda cada tecla num pacote separado.',
    'Ninguém sabe dizer o que o TCP faz nessas horas. Antes de mexer em qualquer coisa, a direção quer ver a conversa por dentro, do primeiro SYN ao último ACK.',
    'Objetivo: ver a máquina de estados, transferir 500 kB com a leitura pausada até aparecer janela zero e sonda, rodar os laboratórios de Nagle e de janela boba e responder a pergunta.',
  ],
  manual: {
    titulo: 'A máquina de estados e a janela deslizante do TCP',
    texto: [
      'Cada conexão TCP está, a todo instante, em um de 11 estados: CLOSED, LISTEN, SYN_SENT, SYN_RCVD, ESTABLISHED, FIN_WAIT_1, FIN_WAIT_2, CLOSING, TIME_WAIT, CLOSE_WAIT e LAST_ACK. O que faz trocar de estado é um evento (a aplicação chama listen, connect ou close, ou chega um segmento com SYN, ACK, FIN ou RST), e muitas transições mandam um segmento de volta. O servidor faz a abertura passiva (CLOSED, LISTEN, SYN_RCVD, ESTABLISHED); o cliente faz a ativa (CLOSED, SYN_SENT, ESTABLISHED).',
      'Para fechar, quem chama close primeiro manda FIN e anda por FIN_WAIT_1 e FIN_WAIT_2 até receber o FIN do outro lado; aí entra em TIME_WAIT e espera 2 MSL (aqui no jogo, MSL de 60 s, então 120 s) para nenhum segmento atrasado ser confundido com uma conexão nova. O outro lado passa por CLOSE_WAIT (avisou a aplicação e espera ela fechar) e LAST_ACK (mandou o próprio FIN e espera a confirmação). Se os dois fecham ao mesmo tempo, ambos passam por CLOSING.',
      'O controle de fluxo é a janela do receptor. Cada ACK diz até onde chegou e quanto espaço ainda há no buffer de quem recebe. Se a aplicação para de ler, o buffer enche e o receptor anuncia janela zero: o emissor para. Para não ficar parado para sempre (o aviso de que a janela abriu pode se perder), o emissor arma o temporizador de persistência e, quando ele estoura, manda uma sonda de 1 byte para perguntar se já há espaço.',
      'Mandar pouco de cada vez também é desperdício: cada segmento leva 40 bytes de cabeçalho IP e TCP. O algoritmo de Nagle junta as escritas pequenas enquanto houver dado sem confirmação e só manda quando o ACK volta ou quando encher um MSS. Do lado de quem recebe, o ACK atrasado confirma a cada dois segmentos ou depois de 200 ms, para economizar ACKs (e às vezes pegar carona numa resposta).',
      'O pior caso é a síndrome da janela boba: o receptor lê 1 byte, anuncia janela de 1 byte, o emissor manda 1 byte com 40 de cabeçalho, e assim por diante. A solução de Clark ataca do lado do receptor: ele finge que a janela continua fechada até abrir pelo menos 1 MSS ou metade do buffer. O emissor ajuda não mandando migalhas.',
    ],
  },
  dicas: [
    'Comece pela "Máquina de estados do TCP" na sala-video. Depois, "Aplicação lenta no receptor" com a pausa de 0,05 s a 0,5 s.',
    'Com a pausa configurada, "Transferir um arquivo por TCP" para 203.0.113.10, porta 443, 500k. Procure "janela zero" e "sonda" nos eventos.',
    'Os laboratórios ficam no mesmo menu: "Laboratório: algoritmo de Nagle" e "Laboratório: janela boba". A pergunta usa o número da linha "com Nagle".',
  ],
  perguntas: d107,
  montar: () =>
    mundoConversa({
      semente: 107,
      cliente: CLIENTE_107,
      modeloCliente: 'Estação de videochamada do hospital',
      servidor: 'video-regional',
      modeloServidor: 'Servidor de videochamada da regional',
      atraso: 0.02,
    }),
  objetivo: (m) => {
    const t = ftcp(m);
    const f = (m.flags.conexao as { de?: string; fechamento?: { estadosCliente: string[] } } | undefined)?.fechamento;
    return [
      item('transferência para 203.0.113.10:443 concluída com janela zero anunciada e pelo menos uma sonda', !!t?.ok && !!t.concluiu && (t.janelasZero ?? 0) >= 1 && (t.sondas ?? 0) >= 1, t ? `janela zero ${t.janelasZero ?? 0} vez(es), ${t.sondas ?? 0} sonda(s)` : 'nenhuma transferência feita'),
      item('a sala-video fechou primeiro e passou por TIME_WAIT', !!f && (m.flags.conexao as { de: string }).de === CLIENTE_107 && f.estadosCliente.includes('TIME_WAIT'), f ? f.estadosCliente.join(', ') : 'nenhuma conexão encerrada'),
      item('laboratório de Nagle rodado', !!m.flags.nagle),
      item('laboratório de janela boba rodado', !!m.flags.janelaBoba),
      ...todasRespondidas(m, d107),
    ];
  },
  posMorte: [
    'O congelamento tinha nome: janela zero. Quando o programa de vídeo parou de ler, os 65535 bytes do buffer encheram em poucos RTTs e o receptor anunciou janela zero. A estação parou de mandar, armou o temporizador de persistência e, quando ele estourou, mandou uma sonda de 1 byte. Assim que o programa voltou a ler, o receptor avisou que a janela abriu e a transferência seguiu de onde parou, sem perder nada. Para quem assistia, foi meio segundo de imagem parada.',
    'O fechamento mostrou o outro lado da máquina de estados: a sala-video chamou close, passou por FIN_WAIT_1 e FIN_WAIT_2 e ficou 120 s em TIME_WAIT, enquanto o servidor andou por CLOSE_WAIT e LAST_ACK e terminou em CLOSED. É por isso que quem fecha primeiro guarda o soquete por um tempo: se o último ACK se perder, o FIN do outro lado chega de novo e ainda tem quem responda.',
    'O terminal da câmera era o caso do Nagle: 40 teclas de 1 byte saem em 40 segmentos sem ele, e em 11 com ele, cada tecla esperando em média um pouco para pegar carona. E a janela boba mostrou o estrago de anunciar migalhas: sem a solução de Clark, 20000 bytes viraram 15906 segmentos de pouco mais de 1 byte; com ela, 30 segmentos com 94,3 % do fio sendo dado de verdade.',
  ],
  passos: [
    passo({
      alvo: ['equip', CLIENTE_107],
      acao: 'tr-estados',
      instrucao: 'Na sala-video, abra a máquina de estados do TCP e leia as transições.',
      porque: 'Tudo o que o TCP faz numa conexão é andar por esse diagrama. Cada linha diz: estando aqui, se acontecer isto, mande aquilo e vá para lá.',
      feito: 'São 11 estados. Abrir é LISTEN e SYN_RCVD do lado do servidor, SYN_SENT do lado do cliente; fechar é FIN_WAIT_1, FIN_WAIT_2 e TIME_WAIT de quem fecha primeiro, CLOSE_WAIT e LAST_ACK de quem fecha depois.',
    }),
    passo({
      escolha: {
        opcoes: ['Quem chamou close primeiro', 'Quem recebeu o primeiro FIN', 'Sempre o servidor', 'Ninguém: o TIME_WAIT só existe no fechamento simultâneo'],
        certa: 0,
        errada: {
          1: 'Quem recebe o primeiro FIN vai para CLOSE_WAIT e depois LAST_ACK. Termina em CLOSED assim que o último ACK chega, sem esperar.',
          2: 'Não depende de ser servidor ou cliente, e sim de quem fecha primeiro. Um servidor web que fecha cada conexão primeiro acumula milhares de soquetes em TIME_WAIT.',
          3: 'No fechamento simultâneo os dois lados passam por CLOSING e os dois terminam em TIME_WAIT. Mas no fechamento comum também há TIME_WAIT, só que de um lado só.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Pela tabela, qual lado da conexão passa pelo TIME_WAIT?',
      porque: 'Siga a linha que chega em TIME_WAIT: ela sai de FIN_WAIT_2 ou de CLOSING, estados de quem mandou o primeiro FIN.',
      feito: 'Quem fecha primeiro espera 2 MSL. Se o último ACK dele se perder, o outro lado reenvia o FIN, e alguém precisa estar lá para confirmar de novo.',
    }),
    passo({
      alvo: ['equip', CLIENTE_107],
      acao: 'tr-leitura',
      pedir: ['ini', 'fim'],
      exemplo: { ini: '0,05', fim: '0,5' },
      instrucao: 'Simule o programa de vídeo travando: ele para de ler em 0,05 s e só volta em 0,5 s.',
      porque: 'Enquanto a aplicação não lê, o que chega fica no buffer do receptor. A janela anunciada é justamente o espaço livre nesse buffer.',
      conferir: (m) => {
        const p = configTcp(m.equipamentos.get(CLIENTE_107)!).pausaLeitura;
        if (!p) return 'A pausa na leitura ainda não foi configurada.';
        return p[1] - p[0] >= 0.3 ? true : `A pausa de ${p[0]} s a ${p[1]} s é curta demais para o buffer encher. Use de 0,05 s a 0,5 s.`;
      },
      feito: 'Pausa gravada. Durante esse intervalo o buffer de 65535 bytes só enche, nunca esvazia.',
    }),
    passo({
      alvo: ['equip', CLIENTE_107],
      acao: 'tr-transferir',
      valores: { ip: SERVIDOR_IP, porta: PORTA, bytes: '500k' },
      instrucao: 'Transfira 500 kB para o servidor de vídeo da regional (203.0.113.10, porta 443).',
      porque: 'A transferência abre a conexão, manda tudo e fecha. Nos eventos aparecem o anúncio de janela zero, a sonda e o aviso de que a janela abriu.',
      conferir: (m) => {
        const t = ftcp(m);
        if (!t?.ok) return 'A transferência não aconteceu. Confira o destino 203.0.113.10 e a porta 443.';
        if (!t.janelasZero) return 'Não houve janela zero: a aplicação leu tudo a tempo. Configure a pausa na leitura (de 0,05 s a 0,5 s) e transfira de novo.';
        return t.sondas ? true : 'Houve janela zero, mas nenhuma sonda. A pausa precisa durar mais que um RTO para o temporizador de persistência estourar.';
      },
      feito: 'Janela zero, sonda de 1 byte, janela aberta de novo e 500000 bytes entregues em ordem. No fim, FIN dos dois lados: a sala-video ficou em TIME_WAIT.',
    }),
    passo({
      alvo: ['equip', CLIENTE_107],
      acao: 'tr-nagle',
      instrucao: 'Rode o laboratório de Nagle: alguém digitando no terminal da câmera, uma tecla a cada 50 ms.',
      porque: 'Cada tecla é 1 byte de dado. Sem Nagle, cada uma vira um segmento com 40 bytes de cabeçalho.',
      conferir: (m) => (m.flags.nagle ? true : 'O laboratório ainda não rodou.'),
      feito: 'Sem Nagle, 40 segmentos e 2,4 % do fio é dado. Com Nagle, as teclas esperam o ACK e saem juntas.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '11' },
      instrucao: 'Com Nagle ligado, quantos segmentos levaram as 40 teclas?',
      porque: 'A linha "com Nagle" do laboratório conta os segmentos. Enquanto o primeiro byte não é confirmado, os seguintes se acumulam.',
      feito: 'Onze segmentos em vez de 40. O preço é a espera: cada tecla aguarda o ACK do segmento anterior para sair.',
    }),
    passo({
      alvo: ['equip', CLIENTE_107],
      acao: 'tr-janela-boba',
      instrucao: 'Rode o laboratório de janela boba: um receptor que lê 1 byte por vez.',
      porque: 'É o espelho do Nagle, do lado de quem recebe: cada byte lido vira um anúncio de janela minúscula, e o emissor responde com segmentos minúsculos.',
      conferir: (m) => (m.flags.janelaBoba ? true : 'O laboratório ainda não rodou.'),
      feito: 'Sem proteção, 15906 segmentos de 1,3 byte em média, 3,0 % de dado. Com a solução de Clark, 30 segmentos de 666,7 bytes e 94,3 % de dado.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Abrir: a metade de cima da máquina',
        texto: [
          'O servidor chama listen e fica em LISTEN. O cliente chama connect, manda SYN e vai para SYN_SENT. O SYN chega, o servidor responde SYN+ACK e vai para SYN_RCVD. O cliente confirma com ACK e entra em ESTABLISHED; quando esse ACK chega, o servidor também.',
          'Se ninguém escuta na porta, volta RST e o cliente cai de SYN_SENT direto para CLOSED.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'closed', rotulo: 'CLOSED', x: 300, y: 25 },
            { id: 'listen', rotulo: 'LISTEN', x: 110, y: 100 },
            { id: 'synsent', rotulo: 'SYN_SENT', x: 490, y: 100 },
            { id: 'synrcvd', rotulo: 'SYN_RCVD', x: 110, y: 205 },
            { id: 'est', rotulo: 'ESTABLISHED', x: 400, y: 205 },
          ],
          ligacoes: [
            ['closed', 'listen', 'listen'],
            ['closed', 'synsent', 'connect / SYN'],
            ['listen', 'synrcvd', 'SYN / SYN+ACK'],
            ['synsent', 'est', 'SYN+ACK / ACK'],
            ['synrcvd', 'est', 'ACK'],
          ],
        },
      },
      {
        titulo: 'Fechar: a metade de baixo',
        texto: [
          'Quem fecha primeiro manda FIN (FIN_WAIT_1), recebe o ACK (FIN_WAIT_2), recebe o FIN do outro e confirma (TIME_WAIT). Quem recebe o primeiro FIN confirma (CLOSE_WAIT), espera a aplicação fechar, manda o próprio FIN (LAST_ACK) e termina em CLOSED quando chega o ACK.',
          'Se os dois FIN se cruzam no caminho, os dois lados passam por CLOSING. O TIME_WAIT dura 2 MSL: 120 s aqui no jogo.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'est', rotulo: 'ESTABLISHED', x: 300, y: 22 },
            { id: 'fw1', rotulo: 'FIN_WAIT_1', x: 80, y: 85 },
            { id: 'fw2', rotulo: 'FIN_WAIT_2', x: 80, y: 150 },
            { id: 'closing', rotulo: 'CLOSING', x: 250, y: 150 },
            { id: 'tw', rotulo: 'TIME_WAIT', x: 170, y: 215 },
            { id: 'cw', rotulo: 'CLOSE_WAIT', x: 520, y: 85 },
            { id: 'la', rotulo: 'LAST_ACK', x: 520, y: 150 },
            { id: 'closed', rotulo: 'CLOSED', x: 450, y: 215 },
          ],
          ligacoes: [
            ['est', 'fw1', 'close / FIN'],
            ['est', 'cw', 'FIN / ACK'],
            ['fw1', 'fw2', 'ACK'],
            ['fw1', 'closing', 'FIN'],
            ['fw2', 'tw', 'FIN / ACK'],
            ['closing', 'tw', 'ACK'],
            ['cw', 'la', 'close / FIN'],
            ['la', 'closed', 'ACK'],
            ['tw', 'closed', '2 MSL'],
          ],
        },
      },
      {
        titulo: 'A janela do receptor desliza',
        texto: [
          'O emissor só pode ter em voo, sem confirmação, o tanto que o receptor anunciou. Cada ACK empurra a janela para a frente: confirma o que chegou e diz quanto espaço sobrou. Se a aplicação não lê, o espaço não volta, e a janela encolhe até zero.',
          'Com janela zero, o emissor arma o temporizador de persistência. Quando ele estoura, sai uma sonda de 1 byte; a resposta traz a janela de agora. Sem isso, um único aviso de "abri a janela" perdido travaria os dois lados para sempre.',
        ],
        visual: { tipo: 'janela', total: 12, janela: 4 },
      },
      {
        titulo: 'Nagle, ACK atrasado e Clark',
        texto: ['Três remédios contra segmentos pequenos demais, cada um de um lado da conversa. Juntos, Nagle e ACK atrasado podem segurar uma resposta pequena por até 200 ms: um espera o ACK, o outro atrasa o ACK.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mecanismo', 'Lado', 'O que faz', 'No laboratório'],
          linhas: [
            ['Nagle', 'emissor', 'junta escritas pequenas enquanto houver dado sem ACK', '40 teclas: 40 segmentos sem, 11 com'],
            ['ACK atrasado', 'receptor', 'confirma a cada 2 segmentos ou 200 ms', 'metade dos ACKs'],
            ['Clark', 'receptor', 'só anuncia janela nova de 1 MSS ou metade do buffer', '15906 segmentos sem, 30 com'],
            ['emissor esperto', 'emissor', 'não manda migalha quando a janela é pequena', 'junto com Clark: 94,3 % de dado'],
          ],
        },
      },
      {
        titulo: 'Quanto do fio é dado',
        texto: ['Um segmento de 1 byte leva 40 bytes de cabeçalho IP e TCP: só 1 de 41 bytes é dado, cerca de 2,4 %. Um segmento cheio, de 1460 bytes, leva os mesmos 40: 97,3 % é dado.'],
        visual: {
          tipo: 'camadas',
          camadas: ['20 bytes de cabeçalho IP', '20 bytes de cabeçalho TCP', '1 byte de dado (uma tecla)'],
          rotulo: 'o segmento de uma tecla sem Nagle',
        },
      },
    ],
    checagem: {
      pergunta: 'O receptor anunciou janela zero e o segmento que avisaria "abri espaço" se perdeu. O que impede a conexão de ficar parada para sempre?',
      opcoes: [
        'O temporizador de persistência do emissor, que manda uma sonda de 1 byte',
        'O TIME_WAIT, que reabre a conexão depois de 2 MSL',
        'O algoritmo de Nagle, que junta os dados parados',
        'O receptor manda RST e a conexão recomeça',
      ],
      certa: 0,
      explicacao: 'Com janela zero e nada em voo, nenhum ACK vai chegar sozinho. O emissor arma o temporizador de persistência e manda sondas; a resposta a cada sonda traz a janela atual, e quando ela abre a transferência continua. TIME_WAIT é do fechamento, Nagle é sobre escritas pequenas e RST derrubaria a conexão.',
    },
  },
  desafio: {
    carta: [
      'Na semana seguinte, o monitor remoto da UTI passou a mandar o traçado dos pacientes para a central da regional pelo mesmo caminho. O programa da central lê devagar, 200 bytes a cada milissegundo, e a transferência anda em segmentos picados, muito menores que o MSS.',
      'Quem instalou o monitor desligou "umas proteções que atrasavam as teclas": o algoritmo de Nagle e a proteção contra janela boba.',
      'Objetivo: mandar 200 kB para a central (203.0.113.10, porta 443) sem nenhum segmento menor que o MSS por falta de janela, com Nagle e a proteção contra janela boba ligados.',
    ],
    dicas: [
      'Veja a configuração TCP do monitor-uti: as duas proteções estão desligadas, e a aplicação do outro lado lê aos pouquinhos.',
      'Em "Nagle, ACK atrasado e janela boba", ligue o Nagle e a proteção contra janela boba. Depois transfira 200k para 203.0.113.10, porta 443.',
      'No resultado, a linha de "segmento(s) menores que o MSS por falta de janela" não deve aparecer.',
    ],
    montar: () =>
      mundoConversa({
        semente: 1107,
        cliente: 'monitor-uti',
        modeloCliente: 'Monitor remoto da UTI',
        servidor: 'central-uti',
        modeloServidor: 'Central de monitoramento da regional',
        atraso: 0.02,
        tcp: { sws: false, nagle: false, leitura: { bytes: 200, intervalo: 0.001 } },
      }),
    objetivo: (m) => {
      const t = ftcp(m);
      const c = configTcp(m.equipamentos.get('monitor-uti')!);
      const feita = !!t?.ok && !!t.concluiu && t.de === 'monitor-uti' && t.bytes >= 200000;
      return [
        item('Nagle ligado no monitor-uti', c.nagle),
        item('proteção contra janela boba ligada no monitor-uti', c.sws),
        item('200 kB entregues à central com a configuração de agora', feita && tcpConfere(m), resumoTcp(t)),
        item('nenhum segmento menor que o MSS por falta de janela', feita && t!.migalhas === 0, t?.ok ? `${t.migalhas ?? 0} segmento(s) picado(s)` : 'nenhuma transferência feita'),
      ];
    },
    solucao: [
      ['equip', 'monitor-uti', 'tr-opcoes', { nagle: 'on', ack: 'off', sws: 'on' }],
      ['equip', 'monitor-uti', 'tr-transferir', { ip: SERVIDOR_IP, porta: PORTA, bytes: '200k' }],
    ],
  },
};

/* ======================================================================
 * 108: Timers do TCP (6.5.9)
 * ====================================================================== */

const CLIENTE_108 = 'posto-fazenda';

interface PassoRtoFlag {
  amostraMs: number;
  srttMs: number;
  rttvarMs: number;
  rtoMs: number;
}

function rtoApos(m: Mundo, amostra: number): number {
  const p = ((m.flags.rto as { passos?: PassoRtoFlag[] } | undefined)?.passos ?? []).find((x) => x.amostraMs === amostra);
  return p ? p.rtoMs : NaN;
}

const d108: Pergunta[] = [numerica('1', 'Na tabela do RTO, quanto valia o RTO, em ms, logo depois da amostra de 300 ms?', (m) => rtoApos(m, 300), 1)];

const AMOSTRAS_108D = [60, 62, 58, 200, 60];
const d108D: Pergunta[] = [
  numerica('1', 'Quanto valia o RTO, em ms, logo depois da amostra de 200 ms?', (m) => rtoApos(m, 200), 1),
  numerica('2', 'Se o segmento seguinte estourar o tempo duas vezes seguidas, a partir desse RTO, quanto vale o RTO, em ms, depois do segundo estouro?', (m) => rtoApos(m, 200) * 4, 2),
];

const dia108: Dia = {
  numero: 108,
  ato: 5,
  titulo: 'Timers do TCP',
  chamado: [
    'CHAMADO #0108',
    'O posto de saúde da Fazenda Boa Água entrou na rede por um rádio que atravessa o vale, com uns 100 ms de ida e volta. A teleconsulta funciona, mas de vez em quando congela por um, dois segundos inteiros e depois volta como se nada fosse.',
    'O técnico do rádio jura que a perda é "só uns 10 % quando venta". Falta entender quanto tempo o TCP espera antes de reenviar um segmento, e por que essa espera às vezes dobra.',
    'Objetivo: calcular o RTO a partir de amostras de RTT, transferir 300 kB com 10 % de perda até ver tempo esgotado acontecer e responder a pergunta.',
  ],
  manual: {
    titulo: 'Os temporizadores do TCP',
    texto: [
      'O temporizador de retransmissão é o mais importante. Cada segmento enviado arma um relógio; se o ACK não chega antes de o relógio estourar, o segmento sai de novo. O tempo de espera é o RTO. Curto demais, o TCP reenvia o que só estava atrasado e enche a rede de cópias; longo demais, cada perda vira um silêncio comprido, como na teleconsulta.',
      'O RTO precisa acompanhar o RTT, que muda o tempo todo. Jacobson e Karels propuseram guardar duas médias: o SRTT, a média suavizada do RTT, e o RTTVAR, o quanto ele varia. Na primeira amostra R, SRTT = R e RTTVAR = R/2. Depois, a cada amostra: RTTVAR = 3/4 RTTVAR + 1/4 |SRTT - R| e SRTT = 7/8 SRTT + 1/8 R. O RTO é SRTT + 4 RTTVAR, com um piso (200 ms aqui no jogo). Antes da primeira amostra, o RTO é 1 s.',
      'O algoritmo de Karn resolve uma ambiguidade: quando um segmento foi retransmitido e o ACK chega, não dá para saber se ele confirma o envio original ou a cópia. Então essa amostra é descartada. E a cada tempo esgotado o RTO dobra (recuo exponencial), até chegar uma amostra limpa de um segmento que não foi retransmitido.',
      'Há outros relógios. O temporizador de persistência, visto no dia anterior, dispara as sondas quando a janela do receptor está zerada. O keepalive manda, depois de muito tempo de conexão parada (o padrão comum é de horas), um segmento só para saber se o outro lado ainda existe. E o TIME_WAIT segura por 2 MSL o soquete de quem fechou primeiro.',
      'Num enlace sem fio, a perda não é congestionamento, mas o TCP não sabe disso. Quando perde um segmento isolado, sem segmentos depois dele para gerar ACKs duplicados, só o temporizador salva: espera o RTO inteiro, reenvia, a janela volta a 1 e o RTO dobra.',
    ],
  },
  dicas: [
    'No posto-fazenda, "Calcular o RTO (Jacobson e Karels)" já vem com cinco amostras. A pergunta usa a quarta linha da tabela.',
    'Depois, "Perda no meio sem fio" com 10%, e "Transferir um arquivo por TCP" para 203.0.113.10, porta 443, 300k.',
    'Nos eventos, procure "tempo esgotado": cada um mostra o RTO dobrando.',
  ],
  perguntas: d108,
  montar: () =>
    mundoConversa({
      semente: 108,
      cliente: CLIENTE_108,
      modeloCliente: 'Estação de teleconsulta do posto da fazenda',
      servidor: 'video-regional',
      modeloServidor: 'Servidor de videochamada da regional',
      atraso: 0.05,
    }),
  objetivo: (m) => {
    const t = ftcp(m);
    const rto = m.flags.rto as { amostrasMs: number[] } | undefined;
    const com = !!t?.ok && t.de === CLIENTE_108 && !!t.concluiu && t.bytes >= 300000 && (t.perda ?? 0) >= 0.099;
    return [
      item('RTO calculado com pelo menos 5 amostras', (rto?.amostrasMs.length ?? 0) >= 5, rto ? `${rto.amostrasMs.length} amostra(s)` : 'ainda não calculado'),
      item('300 kB entregues com pelo menos 10 % de perda no caminho e a configuração de agora', com && tcpConfere(m), resumoTcp(t)),
      item('pelo menos um tempo esgotado na transferência', com && (t!.timeouts ?? 0) >= 1, t?.ok ? `${t.timeouts ?? 0} tempo(s) esgotado(s), RTO chegou a ${t.rtoMaxMs} ms` : 'nenhuma transferência feita'),
      ...todasRespondidas(m, d108),
    ];
  },
  posMorte: [
    'O congelamento era o temporizador de retransmissão fazendo o trabalho dele. No rádio com 10 % de perda, vários segmentos sumiram sem deixar segmentos atrás para gerar três ACKs duplicados. Sem retransmissão rápida, só restava esperar o RTO inteiro, reenviar e recomeçar a janela em 1 segmento. E como cada estouro dobra o RTO, dois estouros seguidos viram uma espera quatro vezes maior: é aí que a imagem para por segundos.',
    'A tabela do RTO mostrou por que a espera não é fixa. Com amostras de 100, 120, 80, 300 e 100 ms, o SRTT quase não se mexe, mas o RTTVAR salta quando chega a amostra de 300 ms, e o RTO vai junto para 437,5 ms. Margem grande quando o caminho é imprevisível, margem pequena quando ele é estável: o RTO se ajusta sozinho, e o algoritmo de Karn garante que nenhuma amostra ambígua de segmento retransmitido estrague essa conta.',
    'Na ponta da fazenda, a solução de verdade é tirar a perda do rádio (alinhar a antena, correção de erro no enlace), porque o TCP vai continuar tratando cada perda como congestionamento. Mas agora a equipe sabe ler o que vê: cada congelamento é um RTO, e cada RTO dobrado é uma perda seguida de outra.',
  ],
  passos: [
    passo({
      alvo: ['equip', CLIENTE_108],
      acao: 'tr-rto',
      pedir: ['amostras'],
      exemplo: { amostras: '100 120 80 300 100' },
      instrucao: 'No posto-fazenda, calcule o RTO a partir de cinco amostras de RTT do rádio: 100, 120, 80, 300 e 100 ms.',
      porque: 'Cada amostra ajusta duas médias, o SRTT e o RTTVAR, e o RTO sai delas. A amostra de 300 ms é uma rajada de vento no rádio.',
      conferir: (m) => {
        const r = m.flags.rto as { amostrasMs: number[] } | undefined;
        if (!r) return 'O RTO ainda não foi calculado.';
        return r.amostrasMs.length >= 5 ? true : `Foram só ${r.amostrasMs.length} amostra(s). Use as cinco: 100 120 80 300 100.`;
      },
      feito: 'Primeira amostra: SRTT 100, RTTVAR 50, RTO 300 ms. Depois, cada amostra puxa o SRTT só 1/8 na direção dela, e o RTTVAR mede o susto.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '437,5' },
      instrucao: 'Quanto valia o RTO logo depois da amostra de 300 ms?',
      porque: 'Leia a quarta linha. O SRTT foi de 99,7 para 124,7 ms, mas o RTTVAR quase dobrou, e ele conta quatro vezes no RTO.',
      feito: 'RTO de 437,5 ms: 124,7 de SRTT mais 4 vezes 78,2 de RTTVAR. Um susto no RTT abre a margem na hora.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Descarta a amostra: não dá para saber se o ACK é do envio original ou da cópia',
          'Usa a amostra medida desde o primeiro envio',
          'Usa a amostra medida desde a retransmissão',
          'Usa a média das duas medidas',
        ],
        certa: 0,
        errada: {
          1: 'Se o ACK for da cópia, essa amostra inclui o RTO inteiro de espera e infla o RTT estimado sem motivo.',
          2: 'Se o ACK for do envio original, que só estava atrasado, essa amostra sai curta demais, e o RTO encolhe justo quando o caminho piorou.',
          3: 'A média de uma medida errada com outra possivelmente errada continua errada. O problema é não saber a qual envio o ACK responde.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Um segmento foi retransmitido e o ACK chegou. O que o algoritmo de Karn faz com essa amostra de RTT?',
      porque: 'O ACK diz só até onde chegou, não qual das cópias chegou.',
      feito: 'Karn descarta a amostra e mantém o RTO dobrado até chegar o ACK de um segmento que saiu uma vez só.',
    }),
    passo({
      alvo: ['equip', CLIENTE_108],
      acao: 'tr-sem-fio',
      pedir: ['p'],
      exemplo: { p: '10%' },
      instrucao: 'Simule o rádio em dia de vento: 10 % de perda aleatória no caminho.',
      porque: 'É perda por ruído, não por fila cheia. Para o TCP dá no mesmo: um segmento que não foi confirmado.',
      conferir: (m) => {
        const p = ((m.equipamentos.get(CLIENTE_108)!.s.caminhoTransporte as { perda?: number } | undefined) ?? {}).perda ?? 0;
        return p >= 0.099 ? true : `A perda está em ${(p * 100).toFixed(1)} %. O técnico falou em 10 %.`;
      },
      feito: 'Perda de 10 % depois do gargalo: um segmento em cada dez some no ar.',
    }),
    passo({
      alvo: ['equip', CLIENTE_108],
      acao: 'tr-transferir',
      valores: { ip: SERVIDOR_IP, porta: PORTA, bytes: '300k' },
      instrucao: 'Transfira 300 kB para o servidor da regional (203.0.113.10, porta 443) e veja os eventos.',
      porque: 'Com perda alta e janela pequena, muitas perdas não têm três segmentos atrás delas para gerar ACKs duplicados. Só o temporizador resolve.',
      conferir: (m) => {
        const t = ftcp(m);
        if (!t?.ok) return 'A transferência não aconteceu. Confira o destino e a porta 443.';
        if ((t.perda ?? 0) < 0.099) return 'A transferência saiu sem a perda de 10 %. Configure a perda no meio sem fio e transfira de novo.';
        return (t.timeouts ?? 0) >= 1 ? true : 'Desta vez o TCP se virou só com retransmissões rápidas. Transfira de novo: com 10 % de perda, o tempo esgotado aparece logo.';
      },
      feito: 'Tempos esgotados nos eventos, cada um com o RTO dobrado e a janela de volta a 1. E amostras descartadas pelo algoritmo de Karn no resultado.',
    }),
    passo({
      escolha: {
        opcoes: ['O de persistência', 'O keepalive', 'O de retransmissão', 'O TIME_WAIT'],
        certa: 1,
        errada: {
          0: 'O de persistência só age com a janela do receptor em zero, para mandar sondas. Uma conexão parada sem nada para mandar não arma esse relógio.',
          2: 'O de retransmissão só existe com dado em voo esperando ACK. Numa conexão ociosa, não há nada para retransmitir.',
          3: 'O TIME_WAIT é do fim da conexão, depois do FIN. Aqui a conexão ainda está aberta, só calada.',
        },
      },
      exemplo: { resposta: '1' },
      instrucao: 'A teleconsulta ficou aberta a noite inteira, sem tráfego, e o rádio caiu de madrugada. Qual temporizador descobre que o outro lado sumiu?',
      porque: 'Sem dado para mandar, nenhum ACK é esperado e nenhum relógio de retransmissão está armado. Alguém precisa perguntar de propósito.',
      feito: 'O keepalive manda, depois de muito tempo de silêncio, um segmento sem dado só para provocar um ACK. Se nada volta depois de algumas tentativas, a conexão é dada como morta.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Os quatro relógios',
        texto: ['Cada um responde a uma pergunta diferente. Só o de retransmissão mexe com o desempenho o tempo todo; os outros cuidam de casos que, sem eles, travariam a conexão.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Temporizador', 'Quando arma', 'Quando estoura'],
          linhas: [
            ['retransmissão (RTO)', 'segmento enviado sem ACK', 'reenvia, janela volta a 1, RTO dobra'],
            ['persistência', 'janela do receptor zerada', 'manda sonda de 1 byte'],
            ['keepalive', 'conexão parada por muito tempo', 'segmento vazio para provocar ACK'],
            ['TIME_WAIT', 'quem fechou primeiro recebeu o FIN', 'depois de 2 MSL (120 s no jogo), CLOSED'],
          ],
        },
      },
      {
        titulo: 'Jacobson e Karels, passo a passo',
        texto: [
          'SRTT é a média suavizada; RTTVAR mede o quanto o RTT oscila. O RTO fica a 4 RTTVAR acima do SRTT: num caminho estável a margem é curta, num caminho nervoso a margem é larga.',
          'Com as amostras do rádio da fazenda, o salto de 300 ms quase não move o SRTT, mas faz o RTTVAR crescer e o RTO subir para 437,5 ms.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Amostra', 'SRTT', 'RTTVAR', 'RTO'],
          linhas: [
            ['100 ms', '100 ms', '50 ms', '300 ms'],
            ['120 ms', '102,5 ms', '42,5 ms', '272,5 ms'],
            ['80 ms', '99,7 ms', '37,5 ms', '249,7 ms'],
            ['300 ms', '124,7 ms', '78,2 ms', '437,5 ms'],
            ['100 ms', '121,6 ms', '64,8 ms', '381 ms'],
          ],
        },
      },
      {
        titulo: 'Karn e o recuo exponencial',
        texto: [
          'Depois de uma retransmissão, o ACK que chega é ambíguo: pode ser do original atrasado ou da cópia. Karn manda descartar essa amostra.',
          'E a cada tempo esgotado o RTO dobra: 300, 600, 1200 ms. Se o caminho piorou de verdade, o TCP para de insistir no ritmo antigo e não enche a rede de cópias.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'env', rotulo: 'envia seq 1000', x: 90, y: 40 },
            { id: 'est1', rotulo: 'RTO estoura', x: 300, y: 40 },
            { id: 'ret', rotulo: 'reenvia, RTO x2', x: 510, y: 40 },
            { id: 'ack', rotulo: 'chega ACK 2460', x: 510, y: 140 },
            { id: 'q', rotulo: 'de qual envio?', x: 300, y: 140 },
            { id: 'karn', rotulo: 'Karn: descarta', x: 300, y: 215 },
          ],
          ligacoes: [
            ['env', 'est1', 'sem ACK'],
            ['est1', 'ret'],
            ['ret', 'ack'],
            ['ack', 'q'],
            ['q', 'karn', 'amostra ambígua'],
          ],
        },
      },
      {
        titulo: 'Retransmissão por tempo ou rápida',
        texto: [
          'Se há segmentos depois do perdido, cada um gera um ACK duplicado pedindo o mesmo byte. Três duplicados e o TCP reenvia na hora, sem esperar o RTO. Se o perdido era o último da rajada, ninguém reclama, e só o relógio salva.',
          'No rádio da fazenda, com janela pequena e muita perda, o relógio aparece mais do que gostaríamos.',
        ],
        visual: { tipo: 'janela', total: 10, janela: 4, perdido: 3 },
      },
    ],
    checagem: {
      pergunta: 'As amostras de RTT vinham estáveis em 100 ms e de repente chega uma de 300 ms. O que acontece com o RTO?',
      opcoes: [
        'Sobe bastante, porque o RTTVAR cresce e conta quatro vezes',
        'Vai direto para 300 ms, o valor da última amostra',
        'Não muda, porque o SRTT só anda 1/8 por amostra',
        'Cai, porque a amostra alta é descartada pelo algoritmo de Karn',
      ],
      certa: 0,
      explicacao: 'O SRTT anda só 1/8 do caminho até a amostra nova, mas o RTTVAR anda 1/4 da diferença, e o RTO soma 4 RTTVAR. Um susto no RTT abre a margem na hora. Karn só descarta amostras de segmentos retransmitidos, não amostras altas.',
    },
  },
  desafio: {
    carta: [
      'A escola rural, do outro lado do vale, vai dar aula a distância pelo mesmo rádio. O professor mediu o RTT do enlace cinco vezes seguidas: 60, 62, 58, 200 e 60 ms. A quarta medida foi quando um caminhão de leite passou na frente da antena.',
      'A secretaria quer saber quanto o TCP vai esperar antes de reenviar um segmento depois desse susto, e quanto essa espera pode crescer se o azar se repetir.',
      'Objetivo: calcular o RTO com exatamente essas cinco amostras e responder as duas perguntas.',
    ],
    dicas: [
      'É a mesma ação do dia, "Calcular o RTO (Jacobson e Karels)", com as amostras 60 62 58 200 60.',
      'A primeira resposta é a linha da amostra de 200 ms. Repare que o piso de 200 ms segura as três primeiras.',
      'Cada tempo esgotado dobra o RTO. Dois seguidos: vezes 2, vezes 2 de novo.',
    ],
    perguntas: d108D,
    montar: () =>
      mundoConversa({
        semente: 1108,
        cliente: 'escola-rural',
        modeloCliente: 'Computador da sala de aula da escola rural',
        servidor: 'aulas-regional',
        modeloServidor: 'Servidor de aulas a distância da regional',
        atraso: 0.03,
      }),
    objetivo: (m) => {
      const r = m.flags.rto as { amostrasMs: number[] } | undefined;
      const certas = !!r && r.amostrasMs.length === AMOSTRAS_108D.length && r.amostrasMs.every((x, i) => x === AMOSTRAS_108D[i]);
      return [item('RTO calculado com as amostras 60, 62, 58, 200 e 60 ms', certas, r ? r.amostrasMs.join(', ') : 'ainda não calculado'), ...todasRespondidas(m, d108D)];
    },
    solucao: [['equip', 'escola-rural', 'tr-rto', { amostras: AMOSTRAS_108D.join(' ') }]],
    respostas: { '1': '270,9', '2': '1083,8' },
  },
};

/* ======================================================================
 * 109: Partida lenta e CUBIC (6.5.10 e 6.5.11)
 * ====================================================================== */

const CLIENTE_109 = 'servidor-arquivos';

interface ResultadoAlg {
  vazaoMbps: number;
}

function comparacao(m: Mundo): { resultados: Record<string, ResultadoAlg>; assinatura: string; de: string } | undefined {
  return m.flags.comparacao as { resultados: Record<string, ResultadoAlg>; assinatura: string; de: string } | undefined;
}

const d109: Pergunta[] = [numerica('1', 'No caminho longo, quantos Mb/s o CUBIC conseguiu na comparação?', (m) => comparacao(m)?.resultados.cubic?.vazaoMbps ?? NaN, 0.1)];

const dia109: Dia = {
  numero: 109,
  ato: 5,
  titulo: 'Partida lenta e CUBIC',
  chamado: [
    'CHAMADO #0109',
    'Toda noite a sala dos servidores manda a cópia dos prontuários para o data center da capital pelo enlace de 10 Mb/s. A cópia começa devagar, acelera, perde pacotes, desacelera, acelera de novo, e o gráfico de uso do enlace parece um serrote.',
    'Para piorar, a capital avisou que vai trocar a rota por uma bem mais longa, com 100 ms de atraso em cada sentido. A direção quer saber qual controle de congestionamento aguenta caminho longo antes de a troca acontecer.',
    'Objetivo: transferir 3 MB com a janela do receptor aberta até ver a partida lenta, a perda e a retransmissão rápida, comparar os algoritmos no caminho longo e responder a pergunta.',
  ],
  manual: {
    titulo: 'Controle de congestionamento: da partida lenta ao CUBIC',
    texto: [
      'A janela do receptor protege quem recebe; a janela de congestionamento (cwnd) protege a rede. O emissor só põe em voo o menor dos dois valores. Ninguém conta ao TCP qual é a banda do caminho: ele descobre testando, aumentando a cwnd até perder algo, e entende cada perda como sinal de fila cheia em algum roteador.',
      'Na partida lenta, a conexão começa com uma janela pequena (aqui, 1 segmento) e soma 1 segmento a cada ACK. Como cada segmento confirmado gera um ACK, a janela dobra a cada RTT: 1, 2, 4, 8, 16. O nome engana: o crescimento é exponencial. Ela vai assim até a primeira perda ou até o limiar (ssthresh).',
      'Acima do limiar vem a prevenção de congestionamento: a janela cresce 1 segmento por RTT, linear. Quando três ACKs duplicados avisam que um segmento sumiu mas os seguintes chegaram, o TCP faz a retransmissão rápida, sem esperar o RTO. No Reno, vem junto a recuperação rápida: o limiar vai para metade do que estava em voo e a janela recomeça dali, não do zero. Sobe linear, perde, corta pela metade: é o dente de serra do AIMD (aumento aditivo, diminuição multiplicativa). Tempo esgotado é pior: limiar na metade e janela de volta a 1.',
      'O problema do Reno é o caminho rápido e longo. Com RTT de 200 ms, subir 1 segmento por RTT é subir 5 segmentos por segundo; se o cano comporta centenas de segmentos, depois de cada corte pela metade o Reno leva dezenas de segundos para encher o cano de novo.',
      'O CUBIC troca a reta por uma curva cúbica em função do tempo desde a última perda, não do número de RTTs. Na perda ele guarda o máximo antigo (Wmax) e corta para 70 %. Depois cresce rápido, desacelera perto do Wmax (onde a perda aconteceu da última vez), fica um tempo ali e, se nada se perde, acelera de novo para sondar mais banda. Como depende do tempo e não do RTT, um fluxo longo cresce tão depressa quanto um curto. É o padrão no Linux.',
    ],
  },
  dicas: [
    'Primeiro abra a janela do receptor no servidor-arquivos ("Janela do receptor e escala"): 4000000 bytes com escala 7. Senão, os 65535 bytes seguram tudo antes de a rede congestionar.',
    'Transfira 3M para 203.0.113.10, porta 443, e leia a tabela da janela: partida lenta, perda, recuperação rápida, dente de serra.',
    'Depois, "Atraso do caminho" em 100 ms e "Comparar Reno, CUBIC e BBR" para 203.0.113.10. A pergunta é a vazão da linha do CUBIC.',
  ],
  perguntas: d109,
  montar: () =>
    mundoConversa({
      semente: 109,
      cliente: CLIENTE_109,
      modeloCliente: 'Servidor de arquivos do hospital',
      servidor: 'copia-capital',
      modeloServidor: 'Servidor de cópias do data center da capital',
      atraso: 0.02,
    }),
  objetivo: (m) => {
    const t = ftcp(m);
    const c = comparacao(m);
    const e = m.equipamentos.get(CLIENTE_109)!;
    const janelaOk = !!t?.config && Math.min(t.config.janela ?? 0, 65535 * 2 ** (t.config.escala ?? 0)) >= 1e6;
    const longo = !!c && c.de === CLIENTE_109 && c.assinatura === assinaturaTcp(e) && atrasoDe(m, CLIENTE_109) >= 0.1;
    return [
      item('3 MB copiados com a janela do receptor acima de 1 MB e pelo menos uma retransmissão rápida', !!t?.ok && !!t.concluiu && t.bytes >= 3e6 && janelaOk && (t.retransRapidas ?? 0) >= 1, resumoTcp(t)),
      item('Reno, CUBIC e BBR comparados no caminho com 100 ms de atraso em cada sentido', longo, c ? `atraso de ${Math.round(atrasoDe(m, CLIENTE_109) * 1000)} ms por sentido` : 'nenhuma comparação feita'),
      item('no caminho longo, o CUBIC entregou mais que o Reno', longo && c!.resultados.cubic!.vazaoMbps > c!.resultados.reno!.vazaoMbps, c ? `Reno ${c.resultados.reno?.vazaoMbps} Mb/s, CUBIC ${c.resultados.cubic?.vazaoMbps} Mb/s` : 'nenhuma comparação feita'),
      ...todasRespondidas(m, d109),
    ];
  },
  posMorte: [
    'O serrote do gráfico é o TCP funcionando como foi desenhado. A cópia começou com 1 segmento e dobrou a cada RTT até passar do que o cano e o buffer do gargalo comportam (uns 34 segmentos no cano e 64 na fila). Aí o buffer transbordou, chegaram três ACKs duplicados, e o Reno retransmitiu na hora, cortou o limiar pela metade e passou a subir 1 segmento por RTT. Sobe, perde, corta: a cópia nunca usa o enlace de forma constante porque é assim que ela descobre quanto cabe.',
    'No caminho longo, com RTT de 200 ms, a diferença apareceu. O Reno, depois de cada corte, sobe só 5 segmentos por segundo e passa a maior parte do tempo longe da banda que o cano comporta. O CUBIC volta para perto do máximo antigo pela curva cúbica, medida em segundos e não em RTTs, e entregou quase o dobro. O BBR, que nem espera perda para decidir, fica para o próximo dia.',
    'Para a troca de rota, a recomendação está pronta: CUBIC na sala dos servidores e a janela do receptor grande o suficiente para o produto banda × atraso do caminho novo. Um sem o outro não resolve.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['4 segmentos', '5 segmentos', '16 segmentos', '8 segmentos'],
        certa: 2,
        errada: {
          0: 'Somar 1 segmento por RTT é a prevenção de congestionamento, a fase linear. Na partida lenta cada ACK soma 1, e a janela dobra a cada RTT.',
          1: 'Isso seria crescer 1 por RTT a partir de 1. Na partida lenta a janela dobra: 1, 2, 4, 8, 16.',
          3: 'Quase: 8 é depois de 3 RTTs. Conte de novo: 1, 2, 4, 8, 16.',
        },
      },
      exemplo: { resposta: '2' },
      instrucao: 'Na partida lenta, começando com 1 segmento, quantos segmentos cabem na janela depois de 4 RTTs?',
      porque: 'Cada segmento confirmado soma 1 segmento à janela. Se a janela tinha n segmentos, chegam n ACKs naquele RTT.',
      feito: 'Dezesseis. A partida lenta é lenta só no começo: em 10 RTTs ela passaria de mil segmentos.',
    }),
    passo({
      alvo: ['equip', CLIENTE_109],
      acao: 'tr-janela',
      pedir: ['janela', 'escala'],
      exemplo: { janela: '4000000', escala: '7' },
      instrucao: 'No servidor-arquivos, abra a janela do receptor: 4000000 bytes, com escala de janela 7.',
      porque: 'Com 65535 bytes, o receptor limita antes da rede: a cópia nunca chega a congestionar o enlace, e o controle de congestionamento nem aparece. O campo de 16 bits só passa de 65535 com a escala.',
      conferir: (m) => {
        const c = configTcp(m.equipamentos.get(CLIENTE_109)!);
        const efetiva = Math.min(c.janela, 65535 * 2 ** c.escala);
        return efetiva >= 1e6 ? true : `A janela que dá para anunciar é ${efetiva} bytes. Precisa passar de 1 MB: buffer de 4000000 bytes e escala 7 (65535 vezes 128).`;
      },
      feito: 'Agora quem manda no ritmo é a janela de congestionamento, e ela vai crescer até a rede reclamar.',
    }),
    passo({
      alvo: ['equip', CLIENTE_109],
      acao: 'tr-transferir',
      valores: { ip: SERVIDOR_IP, porta: PORTA, bytes: '3M' },
      instrucao: 'Copie 3 MB para o servidor da capital (203.0.113.10, porta 443) e leia a tabela da janela.',
      porque: 'A tabela mostra a cwnd ao longo do tempo e a fase em cada momento: partida lenta, recuperação rápida, prevenção de congestionamento.',
      conferir: (m) => {
        const t = ftcp(m);
        if (!t?.ok) return 'A transferência não aconteceu. Confira o destino 203.0.113.10 e a porta 443.';
        if (!t.config || Math.min(t.config.janela ?? 0, 65535 * 2 ** (t.config.escala ?? 0)) < 1e6) return 'A cópia saiu com a janela do receptor pequena, e ela segurou tudo. Abra a janela e copie de novo.';
        return (t.retransRapidas ?? 0) >= 1 ? true : 'Não houve retransmissão rápida. Copie 3M para ver a janela passar do que o caminho comporta.';
      },
      feito: 'A janela dobrou até estourar o buffer do gargalo, três ACKs duplicados dispararam a retransmissão rápida, o limiar caiu pela metade e a janela passou a subir linear. Depois, outro corte: o dente de serra.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Os segmentos seguintes chegaram, então o caminho ainda funciona: basta reenviar o que faltou e cortar a janela pela metade',
          'Três ACKs duplicados indicam que o receptor está sem buffer',
          'O RTO estourou três vezes',
          'Três ACKs duplicados significam que três segmentos se perderam',
        ],
        certa: 0,
        errada: {
          1: 'Sem buffer, o receptor anunciaria janela zero. ACK duplicado é o receptor dizendo "chegou coisa depois do buraco, mas ainda falta este byte".',
          2: 'Se o RTO tivesse estourado, seria retransmissão por tempo, com a janela voltando a 1. A retransmissão rápida existe justamente para não esperar o RTO.',
          3: 'Cada duplicado vem de um segmento que chegou depois do buraco. O buraco pode ser de um segmento só.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o Reno, ao ver três ACKs duplicados, corta só pela metade em vez de voltar a janela para 1?',
      porque: 'Cada ACK duplicado só existe porque um segmento novo chegou ao receptor depois do que se perdeu.',
      feito: 'Os ACKs continuam chegando, então ainda há dados passando. O Reno reenvia, corta pela metade e segue na recuperação rápida. Janela 1 fica para o tempo esgotado, quando nem ACK volta.',
    }),
    passo({
      alvo: ['equip', CLIENTE_109],
      acao: 'tr-atraso',
      pedir: ['ms'],
      exemplo: { ms: '100' },
      instrucao: 'Simule a rota nova da capital: 100 ms de atraso em cada sentido.',
      porque: 'Com RTT de 200 ms, o cano de 10 Mb/s comporta uns 250 kB em voo. Para o Reno, que sobe 1 segmento por RTT, é muito chão.',
      conferir: (m) => (atrasoDe(m, CLIENTE_109) >= 0.1 ? true : `O atraso está em ${Math.round(atrasoDe(m, CLIENTE_109) * 1000)} ms por sentido. A rota nova tem 100 ms.`),
      feito: 'Caminho longo configurado: RTT de uns 200 ms no lugar dos 40 de antes.',
    }),
    passo({
      alvo: ['equip', CLIENTE_109],
      acao: 'tr-comparar',
      valores: { ip: SERVIDOR_IP, porta: PORTA },
      instrucao: 'Compare Reno, CUBIC e BBR no caminho longo até o servidor da capital.',
      porque: 'Os três correm no mesmo caminho pelo mesmo tempo, cada um com o seu jeito de crescer e de reagir à perda.',
      conferir: (m) => {
        const c = comparacao(m);
        if (!c) return 'A comparação ainda não foi feita.';
        if (atrasoDe(m, CLIENTE_109) < 0.1 || c.assinatura !== assinaturaTcp(m.equipamentos.get(CLIENTE_109)!)) return 'A comparação é de antes do caminho longo. Configure os 100 ms e compare de novo.';
        return true;
      },
      feito: 'No caminho longo, o Reno passa a maior parte do tempo subindo devagar depois de cada corte. O CUBIC volta para perto do máximo antigo pela curva e entrega quase o dobro.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '6,21' },
      instrucao: 'Quantos Mb/s o CUBIC conseguiu no caminho longo?',
      porque: 'Leia a coluna de vazão da linha do CUBIC e compare com a do Reno logo acima.',
      feito: 'O CUBIC tirou quase o dobro do Reno no mesmo cano. Em caminho curto os dois empatam; é o RTT longo que separa um do outro.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Partida lenta: dobra a cada RTT',
        texto: [
          'Cada ACK soma 1 segmento à janela de congestionamento. Numa rodada de n segmentos chegam n ACKs, e a janela vira 2n. Começando em 1: 1, 2, 4, 8, 16, 32.',
          'Ela para de dobrar no limiar ou na primeira perda. Na cópia dos prontuários, foi a perda: o buffer do gargalo transbordou.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['RTT', '0', '1', '2', '3', '4', '5'],
          linhas: [['janela (segmentos)', '1', '2', '4', '8', '16', '32']],
        },
      },
      {
        titulo: 'O dente de serra do Reno',
        texto: [
          'Acima do limiar, 1 segmento por RTT. Três ACKs duplicados: retransmissão rápida, limiar na metade, recuperação rápida e volta a subir linear. Tempo esgotado: limiar na metade e janela em 1, partida lenta de novo.',
          'Aumento aditivo, diminuição multiplicativa: é isso que faz vários fluxos no mesmo gargalo convergirem para partes iguais.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['partida lenta: 1, 2, 4, 8... até perder', '3 ACKs duplicados: retransmite na hora e corta pela metade', 'prevenção de congestionamento: +1 segmento por RTT', 'nova perda: corta pela metade de novo', 'tempo esgotado: janela volta a 1'],
          rotulo: 'a vida de uma janela Reno',
        },
      },
      {
        titulo: 'Três ACKs duplicados',
        texto: ['O segmento 3 se perdeu. Os segmentos 4, 5 e 6 chegam, e cada um faz o receptor repetir: "ainda espero o 3". No terceiro duplicado, o emissor reenvia o 3 sem esperar o RTO.'],
        visual: { tipo: 'janela', total: 10, janela: 4, perdido: 3 },
      },
      {
        titulo: 'CUBIC: uma curva no tempo',
        texto: [
          'Na perda, o CUBIC guarda a janela onde ela aconteceu (Wmax) e corta para 70 %. Depois segue W(t) = C (t - K)³ + Wmax, com C = 0,4 e t contado em segundos desde a perda. K é o tempo que a curva leva para voltar ao Wmax.',
          'Longe do Wmax, cresce rápido; perto dele, quase para (foi ali que doeu); passando dele sem perda, acelera de novo para sondar.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Reno', 'CUBIC'],
          linhas: [
            ['na perda (3 ACKs duplicados)', 'corta para 50 %', 'corta para 70 %'],
            ['crescimento', '+1 segmento por RTT', 'curva cúbica no tempo'],
            ['depende do RTT?', 'sim: RTT longo, subida lenta', 'não: conta segundos desde a perda'],
            ['perto do máximo antigo', 'não sabe onde fica', 'desacelera e fica ali'],
            ['caminho de 200 ms de RTT', 'sobe 5 segmentos por segundo', 'volta ao Wmax em poucos segundos'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que o CUBIC rende mais que o Reno num caminho rápido e longo?',
      opcoes: [
        'Porque cresce em função do tempo desde a última perda, e não 1 segmento por RTT',
        'Porque nunca perde pacotes',
        'Porque usa uma janela do receptor maior',
        'Porque não faz partida lenta',
      ],
      certa: 0,
      explicacao: 'O Reno sobe 1 segmento por RTT; com RTT longo e cano grande, leva muito tempo para voltar a encher o cano depois de cada corte. O CUBIC volta ao máximo antigo por uma curva medida em segundos, e corta menos (para 70 %). Ele perde pacotes como qualquer um, usa a mesma janela do receptor e também começa com partida lenta.',
    },
  },
  desafio: {
    carta: [
      'A rota nova para a capital entrou no ar, com 100 ms de atraso em cada sentido. Na primeira noite, a cópia de 5 MB dos prontuários se arrastou a uns 2,4 Mb/s num enlace de 10 Mb/s.',
      'Alguém já sugeriu "trocar para CUBIC e pronto". Outra pessoa jura que o problema é a janela. A direção quer a cópia andando a pelo menos 5 Mb/s.',
      'Objetivo: copiar 5 MB para a capital (203.0.113.10, porta 443) com CUBIC a pelo menos 5 Mb/s, com a configuração de agora.',
    ],
    dicas: [
      'Faça a conta do teto da janela: 65535 bytes a cada RTT de 200 ms dão uns 2,6 Mb/s, seja qual for o algoritmo.',
      'Só CUBIC não basta, e só janela grande também não. Abra a janela do receptor (4000000 bytes, escala 7) e escolha o CUBIC.',
      'Depois, transfira 5M para 203.0.113.10, porta 443.',
    ],
    montar: () =>
      mundoConversa({
        semente: 3109,
        cliente: CLIENTE_109,
        modeloCliente: 'Servidor de arquivos do hospital',
        servidor: 'copia-capital',
        modeloServidor: 'Servidor de cópias do data center da capital',
        atraso: 0.1,
      }),
    objetivo: (m) => {
      const t = ftcp(m);
      const feita = !!t?.ok && !!t.concluiu && t.de === CLIENTE_109 && t.bytes >= 5e6;
      return [
        item('cópia de 5 MB concluída com a configuração de agora', feita && tcpConfere(m), resumoTcp(t)),
        item('controle de congestionamento CUBIC', feita && t!.algoritmo === 'cubic', t?.algoritmo ?? 'nenhuma transferência'),
        item('vazão de pelo menos 5 Mb/s', feita && (t!.vazaoMbps ?? 0) >= 5, t?.ok ? `${t.vazaoMbps} Mb/s` : 'nenhuma transferência'),
      ];
    },
    solucao: [
      ['equip', CLIENTE_109, 'tr-janela', { janela: '4000000', escala: '7' }],
      ['equip', CLIENTE_109, 'tr-algoritmo', { alg: 'cubic' }],
      ['equip', CLIENTE_109, 'tr-transferir', { ip: SERVIDOR_IP, porta: PORTA, bytes: '5M' }],
    ],
  },
};

export const ATO5C: Dia[] = [dia107, dia108, dia109];
