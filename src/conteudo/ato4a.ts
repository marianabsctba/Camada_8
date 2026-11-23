// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// No data center municipal: armazena e repassa (5.1.1 e 5.1.2), datagrama ou circuito virtual (5.1.3 a 5.1.5)
// e o cabeçalho IPv4 (5.7.1).

import { acharPorta, adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

interface RegistroTrace {
  chegou: boolean;
  saltos: (string | null)[];
}

function registroTrace(m: Mundo, de: string, ip: string): RegistroTrace | undefined {
  return m.flags.traceroutes?.[`${de}>${ip}`];
}

/** Traceroute feito pelo jogador, que chegou ao destino e, se pedido, passou por um endereço. */
function traceOk(m: Mundo, de: string, ip: string, passaPor?: string): ItemObjetivo {
  const r = registroTrace(m, de, ip);
  const texto = `traceroute de ${de} até ${ip}${passaPor ? ` passando por ${passaPor}` : ''}`;
  if (!r) return item(texto, false, 'ainda não foi feito');
  const ok = r.chegou && (!passaPor || r.saltos.includes(passaPor));
  return item(texto, ok, `saltos: ${r.saltos.map((s) => s ?? '*').join(', ')}`);
}

/** Ping feito e sem nenhuma resposta. */
const pingFalhou = (m: Mundo, de: string, ip: string) => {
  const r = registroPing(m, de, ip);
  return !!r && r.recebidos === 0;
};

const rotaVia = (m: Mundo, r: string, destino: string, via: string) =>
  ((m.equipamentos.get(r)!.s.rotas ?? []) as { destino: string; via: string }[]).some((x) => x.destino === destino && x.via === via);

const caiu = (m: Mundo, r: string) => m.equipamentos.get(r)!.s.estado !== 'ligado';

const pc1 = (n: string, ip: string, gw: string) => pc(n, { ip: cidr(ip), gateway: gw });

/* ======================================================================
 * ref 77: Armazena e repassa (5.1.1 e 5.1.2)
 * ====================================================================== */

const IP77 = { norte: '192.168.10.10', sul: '192.168.20.10' };

/** pc-norte, r-norte, r-dc, r-sul, pc-sul: quatro enlaces, três roteadores. */
function mundo77(): Mundo {
  const m = novoMundo(477);
  adicionar(m, pc1('pc-norte', `${IP77.norte}/24`, '192.168.10.1'));
  adicionar(m, pc1('pc-sul', `${IP77.sul}/24`, '192.168.20.1'));
  adicionar(m, roteador('r-norte', { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: '192.168.10.1/24', p2: '10.0.0.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '10.0.0.2' }] }));
  adicionar(m, roteador('r-dc', { modelo: 'Roteador Encruzilhada 4 (núcleo)', interfaces: { p1: '10.0.0.2/30', p2: '10.0.0.5/30' }, rotas: [{ destino: '192.168.10.0/24', via: '10.0.0.1' }, { destino: '192.168.20.0/24', via: '10.0.0.6' }] }));
  adicionar(m, roteador('r-sul', { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: '10.0.0.6/30', p2: '192.168.20.1/24' }, rotas: [{ destino: '0.0.0.0/0', via: '10.0.0.5' }] }));
  ligar(m, { equip: 'pc-norte', porta: 'eth0' }, { equip: 'r-norte', porta: 'p1' }, 'cat6', 20, { id: 'c1' });
  ligar(m, { equip: 'r-norte', porta: 'p2' }, { equip: 'r-dc', porta: 'p1' }, 'cat6', 90, { id: 'c2' });
  ligar(m, { equip: 'r-dc', porta: 'p2' }, { equip: 'r-sul', porta: 'p1' }, 'cat6', 90, { id: 'c3' });
  ligar(m, { equip: 'r-sul', porta: 'p2' }, { equip: 'pc-sul', porta: 'eth0' }, 'cat6', 20, { id: 'c4' });
  m.proxCabo = 5;
  m.flags.camadaRede = true;
  return m;
}

const d77: Pergunta[] = [
  numerica('1', 'Do pc-norte ao pc-sul, quantas vezes o pacote inteiro foi transmitido num enlace (contando o primeiro, que sai do PC)?', 4, 0),
  numerica('2', 'Quantos microssegundos leva só para transmitir um pacote de 1500 bytes num enlace de 100 Mb/s?', 120, 1),
];

const d77D: Pergunta[] = [numerica('1', 'Quantos microssegundos leva só para transmitir um pacote de 1500 bytes num enlace de 1 Gb/s?', 12, 0.5)];

const dia77: Dia = {
  numero: 77,
  ato: 4,
  titulo: 'Armazena e repassa',
  chamado: [
    'CHAMADO #0077',
    'A prefeitura liberou o data center municipal: uma sala gelada no subsolo, três roteadores novos e um bilhete colado no rack dizendo "não encostar no núcleo". Os bairros Norte e Sul já têm rede cada um, mas uma não enxerga a outra sem passar por aqui.',
    'O secretário quer saber, antes de assinar qualquer coisa, se um pacote do Norte chega mesmo ao Sul e por onde ele passa.',
    'Objetivo: ping do pc-norte ao pc-sul, traceroute mostrando o caminho e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Comutação de pacotes e o que a camada de rede promete',
    texto: [
      'Até aqui, cada quadro viajava dentro de uma rede só: um cabo, um switch, uma VLAN. A camada de rede é a primeira que leva dados de ponta a ponta, atravessando várias redes. Quem faz isso são os roteadores, e o jeito clássico de fazer se chama armazena e repassa (store and forward).',
      'Funciona assim: o computador manda o pacote ao roteador mais próximo. O roteador recebe o pacote inteiro, guarda na memória, confere se chegou sem erro (o CRC do quadro e o checksum do cabeçalho), consulta a tabela de rotas para decidir a saída e só então transmite para o próximo roteador. E assim, salto a salto, até o destino. Ninguém repassa um pedaço de pacote: cada roteador espera o último bit chegar.',
      'Por isso cada salto custa tempo. O atraso de um salto soma a transmissão (tamanho do pacote dividido pela taxa do enlace: 1500 bytes a 100 Mb/s são 120 µs), a propagação (a distância dividida pela velocidade do sinal, uns 5 µs por quilômetro de cabo ou fibra), a fila (quanto o pacote espera atrás dos outros) e o processamento (no simulador, 50 µs por roteador para consultar a tabela). Com armazena e repassa, a transmissão se repete em cada enlace do caminho.',
      'O que a camada de rede oferece para a camada de transporte, logo acima, segue três metas. O serviço não depende da tecnologia dos roteadores. A camada de transporte não precisa saber quantos roteadores existem, de que tipo são nem como estão ligados. E os endereços que ela usa seguem uma numeração uniforme, que vale para a rede inteira, mesmo que ela atravesse redes locais e longas distâncias diferentes.',
      'A grande briga é sobre o tipo de serviço. Um lado diz que a rede é não confiável por natureza e que os computadores devem cuidar de erros e ordem sozinhos: a rede só manda pacotes, sem conexão, cada um com o endereço completo do destino. É o caminho da internet. O outro lado diz que a rede deve oferecer conexões confiáveis e com qualidade garantida, como a telefonia sempre fez. O IP é sem conexão, mas a briga nunca acabou de vez, e o próximo dia mostra o outro lado: os circuitos virtuais.',
    ],
  },
  dicas: [
    'Comece pelo ping do pc-norte para o pc-sul e repare no TTL da resposta.',
    'O traceroute mostra cada roteador do caminho. Conte os roteadores e os enlaces entre eles.',
    'São três roteadores e quatro enlaces. Transmitir 1500 bytes a 100 Mb/s: 1500 × 8 ÷ 100 = 120 µs.',
  ],
  perguntas: d77,
  montar: mundo77,
  objetivo: (m) => [pingOk(m, 'pc-norte', IP77.sul), traceOk(m, 'pc-norte', IP77.sul), ...todasRespondidas(m, d77)],
  posMorte: [
    'O pedido de eco saiu do pc-norte, foi inteiro até o r-norte, que guardou, conferiu, consultou a rota padrão e repassou ao r-dc. O r-dc fez a mesma coisa olhando a linha 192.168.20.0/24 da tabela, e o r-sul entregou no pc-sul. Quatro enlaces, quatro transmissões completas do mesmo pacote. A resposta voltou com TTL 61: saiu com 64 do pc-sul e perdeu um em cada roteador.',
    'O traceroute usou o próprio TTL para enxergar o caminho: com TTL 1 a sonda morre no r-norte, com TTL 2 no r-dc, com TTL 3 no r-sul, e cada um avisa de volta quem é. O pc-norte nunca precisou saber que roteadores eram esses, nem como estavam ligados: só entregou ao gateway. É isso que a camada de rede promete ao transporte.',
    'Nenhum roteador reservou nada para esta conversa. Cada pacote chegou com o endereço completo do destino e foi decidido na hora. Isso é serviço sem conexão, e é assim que a cidade vai funcionar daqui em diante, pelo menos até alguém pedir garantia de qualidade.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'pc-norte'],
      acao: 'ping',
      valores: { destino: IP77.sul, n: '4' },
      instrucao: 'Do pc-norte, faça ping no pc-sul, que fica do outro lado do data center.',
      porque: 'O pc-sul está em outra rede (192.168.20.0/24). O pc-norte não tenta falar com ele direto: entrega o pacote ao gateway, o r-norte, e a partir daí cada roteador decide o próximo salto.',
      conferir: (m) => pingOk(m, 'pc-norte', IP77.sul).ok || 'O ping no pc-sul não voltou.',
      feito: 'Voltou com TTL 61. O pc-sul respondeu com 64, e cada um dos três roteadores tirou um. O TTL é o contador de saltos que todo pacote carrega.',
    }),
    passo({
      alvo: ['equip', 'pc-norte'],
      acao: 'traceroute',
      valores: { destino: IP77.sul },
      instrucao: 'Agora faça um traceroute do pc-norte até o pc-sul.',
      porque: 'O traceroute manda sondas com TTL 1, 2, 3... Cada roteador que zera o TTL descarta a sonda e avisa de volta. Assim cada salto se revela, um por linha.',
      conferir: (m) => registroTrace(m, 'pc-norte', IP77.sul)?.chegou || 'O traceroute não chegou ao pc-sul.',
      feito: 'Quatro linhas: r-norte, r-dc, r-sul e o próprio pc-sul. E cada linha demora um pouco mais que a anterior, porque cada salto soma transmissão, propagação e processamento.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-rotas',
      instrucao: 'Abra a tabela de rotas do r-dc, o roteador do meio.',
      porque: 'Depois de receber e conferir o pacote inteiro, o roteador consulta esta tabela com o endereço de destino. A linha que casar diz por onde sair.',
      feito: 'Duas redes conectadas e duas estáticas: 192.168.10.0/24 volta para o r-norte, 192.168.20.0/24 segue para o r-sul. Não há nenhuma linha sobre esta conversa em particular, só sobre destinos.',
    }),
    passo({
      alvo: ['equip', 'pc-sul'],
      acao: 'capturar',
      instrucao: 'No pc-sul, veja o último pacote que chegou.',
      porque: 'A captura mostra o pacote do jeito que chegou ao destino, com o TTL que sobrou e a lista dos roteadores que ele atravessou.',
      feito: 'Saiu com TTL 64 e chegou com 61, depois de r-norte, r-dc e r-sul. E o MAC de origem é o do r-sul: o quadro Ethernet é refeito a cada salto, o pacote IP é que segue viagem.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '4' },
      instrucao: 'Quantas vezes o pacote inteiro foi transmitido num enlace, do pc-norte ao pc-sul?',
      porque: 'Com armazena e repassa, cada enlace é uma transmissão completa: o pacote só sai do roteador depois de chegar todo. Conte os cabos do caminho, não os roteadores.',
      feito: 'Quatro: PC até o r-norte, r-norte até o r-dc, r-dc até o r-sul e r-sul até o PC. Três roteadores no meio, sempre um enlace a mais que roteadores.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '120' },
      instrucao: 'Quantos microssegundos leva só para transmitir 1500 bytes num enlace de 100 Mb/s?',
      porque: 'Atraso de transmissão é o tamanho em bits dividido pela taxa. 1500 bytes são 12.000 bits; a 100 Mb/s, cada microssegundo passa 100 bits.',
      feito: '120 µs por enlace. Em quatro enlaces, só de transmissão já são 480 µs, antes de contar propagação, fila e processamento.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Dizer à camada de transporte quantos roteadores existem no caminho',
          'Não depender da tecnologia dos roteadores',
          'Usar uma numeração de endereços uniforme na rede inteira',
          'Esconder do transporte o tipo e a topologia dos roteadores',
        ],
        certa: 0,
        errada: {
          1: 'Essa é uma das metas: o serviço não pode depender de que marca ou tecnologia de roteador a cidade comprou.',
          2: 'Essa também é meta: o mesmo plano de endereços vale do bairro Norte ao outro lado do mundo.',
          3: 'Meta também: o pc-norte só conhece o gateway. Quantos roteadores há depois dele não é problema do transporte.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual destas NÃO é uma meta do serviço que a camada de rede oferece ao transporte?',
      porque: 'As três metas falam de esconder detalhes: tecnologia, quantidade e topologia dos roteadores, e de dar um endereço uniforme. O transporte só quer entregar ao endereço.',
      feito: 'Isso. A camada de rede esconde os roteadores; quem quiser vê-los usa o traceroute, que é ferramenta de diagnóstico, não serviço.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Recebe tudo, confere, consulta, repassa',
        texto: [
          'Cada roteador espera o pacote chegar inteiro, confere se veio sem erro, olha o destino na tabela de rotas e só então transmite para o próximo. É o armazena e repassa.',
          'O pacote é o mesmo do começo ao fim; o quadro que o embrulha é refeito em cada enlace.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'pc-norte', x: 40, y: 120 },
            { id: 'r1', rotulo: 'r-norte', x: 180, y: 120 },
            { id: 'r2', rotulo: 'r-dc', x: 320, y: 120 },
            { id: 'r3', rotulo: 'r-sul', x: 460, y: 120 },
            { id: 'b', rotulo: 'pc-sul', x: 600, y: 120 },
          ],
          ligacoes: [
            ['a', 'r1', 'enlace 1'],
            ['r1', 'r2', 'enlace 2'],
            ['r2', 'r3', 'enlace 3'],
            ['r3', 'b', 'enlace 4'],
          ],
        },
      },
      {
        titulo: 'O preço de cada salto',
        texto: ['Em cada salto, o atraso soma quatro parcelas. A transmissão se repete em cada enlace, porque o roteador só começa a mandar depois de receber tudo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Parcela', 'De onde vem', 'Exemplo'],
          linhas: [
            ['transmissão', 'tamanho ÷ taxa do enlace', '1500 bytes: 1200 µs a 10 Mb/s, 120 µs a 100 Mb/s, 12 µs a 1 Gb/s'],
            ['propagação', 'distância ÷ velocidade do sinal', 'uns 5 µs por km de cabo ou fibra'],
            ['fila', 'pacotes na frente esperando a mesma saída', 'zero numa rede vazia; muito na hora do pico'],
            ['processamento', 'conferir e consultar a tabela', '50 µs por roteador, no simulador'],
          ],
        },
      },
      {
        titulo: 'O que a rede promete ao transporte',
        texto: ['A camada de transporte não quer saber de roteador. Ela quer entregar a um endereço e pronto. Para isso, a camada de rede segue três metas.'],
        visual: {
          tipo: 'camadas',
          camadas: [
            'transporte: só conhece endereços de origem e destino',
            'meta 1: o serviço não depende da tecnologia dos roteadores',
            'meta 2: o transporte não vê quantos roteadores há, de que tipo nem como se ligam',
            'meta 3: numeração de endereços uniforme, em LAN ou em longa distância',
            'rede: roteadores, rotas, armazena e repassa',
          ],
          rotulo: 'a fronteira entre a camada de transporte e a de rede',
        },
      },
      {
        titulo: 'Sem conexão ou com conexão?',
        texto: ['A briga é antiga. Um lado quer a rede simples e os computadores espertos; o outro quer a rede garantindo a qualidade, como a telefonia.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Sem conexão', 'Orientado a conexão'],
          linhas: [
            ['quem cuida de erro e ordem', 'os computadores, nas pontas', 'a própria rede'],
            ['o que vai em cada pacote', 'o endereço completo do destino', 'um identificador curto da conexão'],
            ['argumento a favor', 'a rede fica simples e barata, e cada aplicação decide o que precisa', 'qualidade garantida, bom para voz e vídeo'],
            ['exemplo', 'IP, a internet', 'a telefonia de sempre, e o MPLS por baixo do IP'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um roteador está recebendo um pacote de 1500 bytes. Quando ele começa a transmitir esse pacote para o próximo salto?',
      opcoes: [
        'Depois que o pacote chega inteiro, é conferido e a tabela de rotas é consultada',
        'Assim que lê o endereço de destino, no começo do pacote',
        'Quando o destino final confirma que pode receber',
        'Assim que o primeiro bit chega',
      ],
      certa: 0,
      explicacao: 'Armazena e repassa: o roteador guarda o pacote inteiro, confere e decide. Por isso a transmissão se repete em cada enlace do caminho.',
    },
  },
  desafio: {
    carta: [
      'O posto de saúde do bairro Oeste precisa mandar a fila de vacinação para a prefeitura todo fim de tarde. O pacote sai, passa pelo data center e some. O posto jura que o cabo está bom, e está.',
      'O roteador do núcleo recebe o pacote inteiro, confere e consulta a tabela. Se a tabela não tem nada a dizer sobre o destino, o pacote não tem para onde ir.',
      'Objetivo: ping do pc-posto ao pc-prefeitura funcionando e a pergunta respondida.',
    ],
    dicas: [
      'Faça o ping e leia quem devolveu o aviso de erro. O traceroute também mostra até onde o pacote vai.',
      'Abra a tabela de rotas do r-dc: falta a linha para a rede da prefeitura, 192.168.40.0/24. O próximo salto é o r-prefeitura, em 10.0.1.6.',
      'Transmissão é tamanho ÷ taxa: 1500 × 8 bits ÷ 1000 bits por microssegundo.',
    ],
    perguntas: d77D,
    respostas: { '1': '12' },
    montar: () => {
      const m = novoMundo(4077);
      adicionar(m, pc1('pc-posto', '192.168.30.10/24', '192.168.30.1'));
      adicionar(m, pc1('pc-prefeitura', '192.168.40.10/24', '192.168.40.1'));
      adicionar(m, roteador('r-posto', { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: '192.168.30.1/24', p2: '10.0.1.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '10.0.1.2' }] }));
      adicionar(m, roteador('r-dc', { modelo: 'Roteador Encruzilhada 4 (núcleo)', interfaces: { p1: '10.0.1.2/30', p2: '10.0.1.5/30' }, rotas: [{ destino: '192.168.30.0/24', via: '10.0.1.1' }] }));
      adicionar(m, roteador('r-prefeitura', { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: '10.0.1.6/30', p2: '192.168.40.1/24' }, rotas: [{ destino: '0.0.0.0/0', via: '10.0.1.5' }] }));
      ligar(m, { equip: 'pc-posto', porta: 'eth0' }, { equip: 'r-posto', porta: 'p1' }, 'cat6', 15, { id: 'c1' });
      ligar(m, { equip: 'r-posto', porta: 'p2' }, { equip: 'r-dc', porta: 'p1' }, 'cat6', 80, { id: 'c2' });
      ligar(m, { equip: 'r-dc', porta: 'p2' }, { equip: 'r-prefeitura', porta: 'p1' }, 'cat6', 60, { id: 'c3' });
      ligar(m, { equip: 'r-prefeitura', porta: 'p2' }, { equip: 'pc-prefeitura', porta: 'eth0' }, 'cat6', 10, { id: 'c4' });
      m.proxCabo = 5;
      m.flags.camadaRede = true;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'pc-posto', '192.168.40.10'), ...todasRespondidas(m, d77D)],
    solucao: [
      ['equip', 'r-dc', 'rot-rota', { destino: '192.168.40.0/24', via: '10.0.1.6' }],
      ['equip', 'pc-posto', 'ping', { destino: '192.168.40.10', n: '4' }],
    ],
  },
};

/* ======================================================================
 * ref 78: Datagrama ou circuito virtual (5.1.3 a 5.1.5)
 * ====================================================================== */

interface Triangulo {
  pc: string;
  r1: string;
  a: string;
  b: string;
  dc: string;
  srv: string;
  /** Primeiros três octetos de cada rede. */
  lan: string;
  rsrv: string;
  la: string;
  lb: string;
  /** Por onde vai a ida (rota no r1) e por onde volta a resposta (rota no dc). */
  ida: 'a' | 'b';
  volta: 'a' | 'b';
}

/**
 * Dois caminhos entre o bairro e o servidor: r1 liga em a e em b, e os dois ligam no dc.
 * Datagrama: cada roteador decide sozinho, e a ida pode ir por um lado e a volta pelo outro.
 */
function triangulo(semente: number, t: Triangulo): Mundo {
  const m = novoMundo(semente);
  const via = (lado: 'a' | 'b', fim: string) => `${lado === 'a' ? t.la : t.lb}.${fim}`;
  adicionar(m, pc1(t.pc, `${t.lan}.10/24`, `${t.lan}.1`));
  adicionar(m, pc1(t.srv, `${t.rsrv}.10/24`, `${t.rsrv}.1`));
  adicionar(m, roteador(t.r1, { modelo: 'Roteador Encruzilhada 4', interfaces: { p1: `${t.lan}.1/24`, p2: `${t.la}.1/30`, p3: `${t.lb}.1/30` }, rotas: [{ destino: `${t.rsrv}.0/24`, via: via(t.ida, '2') }] }));
  adicionar(m, roteador(t.a, { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: `${t.la}.2/30`, p2: `${t.la}.5/30` }, rotas: [{ destino: `${t.rsrv}.0/24`, via: `${t.la}.6` }, { destino: `${t.lan}.0/24`, via: `${t.la}.1` }] }));
  adicionar(m, roteador(t.b, { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: `${t.lb}.2/30`, p2: `${t.lb}.5/30` }, rotas: [{ destino: `${t.rsrv}.0/24`, via: `${t.lb}.6` }, { destino: `${t.lan}.0/24`, via: `${t.lb}.1` }] }));
  adicionar(m, roteador(t.dc, { modelo: 'Roteador Encruzilhada 4 (núcleo)', interfaces: { p1: `${t.la}.6/30`, p2: `${t.lb}.6/30`, p3: `${t.rsrv}.1/24` }, rotas: [{ destino: `${t.lan}.0/24`, via: via(t.volta, '5') }] }));
  ligar(m, { equip: t.pc, porta: 'eth0' }, { equip: t.r1, porta: 'p1' }, 'cat6', 20, { id: 'c1' });
  ligar(m, { equip: t.r1, porta: 'p2' }, { equip: t.a, porta: 'p1' }, 'cat6', 80, { id: 'c2' });
  ligar(m, { equip: t.a, porta: 'p2' }, { equip: t.dc, porta: 'p1' }, 'cat6', 80, { id: 'c3' });
  ligar(m, { equip: t.r1, porta: 'p3' }, { equip: t.b, porta: 'p1' }, 'cat6', 90, { id: 'c4' });
  ligar(m, { equip: t.b, porta: 'p2' }, { equip: t.dc, porta: 'p2' }, 'cat6', 90, { id: 'c5' });
  ligar(m, { equip: t.dc, porta: 'p3' }, { equip: t.srv, porta: 'eth0' }, 'cat6', 5, { id: 'c6' });
  m.proxCabo = 7;
  m.flags.camadaRede = true;
  return m;
}

const T78: Triangulo = { pc: 'pc-norte', r1: 'r-norte', a: 'r-meio', b: 'r-leste', dc: 'r-dc', srv: 'servidor', lan: '192.168.10', rsrv: '192.168.50', la: '10.0.1', lb: '10.0.2', ida: 'a', volta: 'b' };
const SRV78 = '192.168.50.10';

const T78D: Triangulo = { pc: 'pc-escola', r1: 'r-escola', a: 'r-ponte', b: 'r-rio', dc: 'r-dc', srv: 'srv-notas', lan: '192.168.11', rsrv: '192.168.51', la: '10.0.5', lb: '10.0.6', ida: 'a', volta: 'b' };
const SRV78D = '192.168.51.10';

/** Aceita "identificador do circuito", "número do circuito virtual", "rótulo" e parecidos. */
const RE_VC = /identificador|circuito|r[oó]tulo|\bvc\b|n[uú]mero da conex/i;

const d78: Pergunta[] = [texto('1', 'Num circuito virtual, o que cada pacote carrega no lugar do endereço completo do destino?', RE_VC)];
const d78D: Pergunta[] = [texto('1', 'Numa rede de circuitos virtuais, a tabela do roteador tem uma linha por destino ou uma linha por circuito?', /circuito|conex/i)];

const dia78: Dia = {
  numero: 78,
  ato: 4,
  titulo: 'Datagrama ou circuito virtual',
  chamado: [
    'CHAMADO #0078',
    'O servidor da prefeitura agora fica no data center, e o bairro Norte tem dois caminhos até ele: pelo r-meio e pelo r-leste. Hoje à tarde o eletricista vai trocar a tomada do r-meio, e ninguém sabe dizer se o Norte fica sem servidor enquanto isso.',
    'A cooperativa de telefonia, do outro lado da praça, garante que na rede dela "quando cai, cai tudo, mas pelo menos a gente sabe".',
    'Objetivo: ver o caminho de hoje, derrubar o r-meio, mandar o tráfego do Norte pelo r-leste e responder a pergunta.',
  ],
  manual: {
    titulo: 'Sem conexão (datagramas) e orientado a conexão (circuitos virtuais)',
    texto: [
      'No serviço sem conexão, cada pacote entra na rede sozinho e é roteado sozinho, sem nenhum combinado prévio. Os pacotes se chamam datagramas, como os telegramas, e a rede se chama rede de datagramas. Cada roteador tem uma tabela que diz, para cada destino, qual a saída. Ao receber um pacote, ele olha o endereço de destino completo que vem no cabeçalho e decide. Dois pacotes da mesma conversa podem ir por caminhos diferentes, e a ida pode ir por um lado enquanto a volta vem pelo outro. O IP funciona assim.',
      'No serviço orientado a conexão, antes de mandar qualquer dado se estabelece um caminho, o circuito virtual, e todos os pacotes daquela conexão seguem por ele, como numa ligação telefônica. Na hora do estabelecimento, cada roteador do caminho anota na tabela uma linha para o circuito: o que chega pela porta tal com o identificador tal sai pela porta tal com o identificador tal. Cada pacote carrega só esse identificador curto, não o endereço inteiro, e o roteador pode trocá-lo a cada salto. Quando a conexão acaba, o circuito é desfeito e as linhas somem. O MPLS faz isso dentro de muitas redes de provedor.',
      'Comparando: o circuito virtual precisa de estabelecimento, o datagrama não. No datagrama todo pacote leva o endereço completo de origem e destino; no circuito, um número pequeno. No datagrama o roteador não guarda estado de conexão nenhuma; no circuito guarda uma linha por conexão que passa por ele. No datagrama cada pacote é roteado sozinho; no circuito a rota é escolhida uma vez, no estabelecimento.',
      'Falhas e qualidade são o outro lado da balança. Se um roteador cai numa rede de datagramas, só se perdem os pacotes que estavam nele; os próximos vão por outro caminho assim que as tabelas mudarem. Se cai numa rede de circuitos virtuais, todo circuito que passava por ele morre e precisa ser estabelecido de novo. Em troca, como o circuito reserva o caminho antes, fica fácil garantir qualidade de serviço e evitar congestionamento reservando banda e memória na hora de abrir; no datagrama isso é difícil.',
      'Neste laboratório os roteadores não descobrem caminho sozinhos: as rotas são estáticas, digitadas por alguém. Quando o r-meio cair, quem muda a tabela é você. Fazer isso sozinho é trabalho dos algoritmos de roteamento, que vêm logo adiante no ato.',
    ],
  },
  dicas: [
    'Faça um traceroute do pc-norte até o servidor para ver por onde a ida passa hoje.',
    'Religue o r-meio para simular a troca de tomada e veja o ping morrer. Depois olhe as rotas do r-norte.',
    'No r-norte, a rota para 192.168.50.0/24 precisa apontar para o r-leste, em 10.0.2.2.',
  ],
  perguntas: d78,
  montar: () => triangulo(478, T78),
  objetivo: (m) => [
    item('o r-meio fora do ar', caiu(m, 'r-meio'), m.equipamentos.get('r-meio')!.s.estado as string),
    item('r-norte mandando 192.168.50.0/24 pelo r-leste', rotaVia(m, 'r-norte', '192.168.50.0/24', '10.0.2.2')),
    traceOk(m, 'pc-norte', SRV78, '10.0.2.2'),
    ...todasRespondidas(m, d78),
  ],
  posMorte: [
    'O primeiro traceroute mostrou a ida pelo r-meio. A volta, que o traceroute não mostra, vinha pelo r-leste, porque a tabela do r-dc dizia isso. Ninguém achou estranho, porque numa rede de datagramas não existe "o caminho da conversa": cada roteador decide cada pacote sozinho, olhando só o destino.',
    'Quando o r-meio entrou em boot, os pacotes que chegavam ao r-norte morreram ali: o ARP para 10.0.1.2 ficou sem resposta e o r-norte devolveu "host inalcançável". Bastou trocar uma linha da tabela, e o pacote seguinte já foi pelo r-leste. Nenhuma conexão precisou ser refeita, porque nenhuma existia.',
    'Numa rede de circuitos virtuais, o r-meio guardaria uma linha para cada circuito que passava por ele. Ao cair, levaria todos junto, e cada um teria de ser estabelecido de novo por outro caminho. Em compensação, a cooperativa de telefonia consegue reservar banda para cada ligação na hora de abrir o circuito, coisa que aqui ninguém garante.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'pc-norte'],
      acao: 'traceroute',
      valores: { destino: SRV78 },
      instrucao: 'Faça um traceroute do pc-norte até o servidor.',
      porque: 'Antes de mexer, é bom saber por onde a ida passa hoje. Cada linha do traceroute é um roteador que decidiu o próximo salto olhando só o endereço de destino.',
      conferir: (m) => registroTrace(m, 'pc-norte', SRV78)?.chegou || 'O traceroute não chegou ao servidor.',
      feito: 'Ida pelo r-norte, r-meio (10.0.1.2) e r-dc. Nenhum desses roteadores sabe que existe uma conversa entre o pc-norte e o servidor: eles só conhecem destinos.',
    }),
    passo({
      alvo: ['equip', 'r-meio'],
      acao: 'religar',
      instrucao: 'Religue o r-meio, como o eletricista vai fazer ao trocar a tomada.',
      porque: 'Um roteador em boot não repassa nada. É o jeito mais honesto de simular uma queda.',
      conferir: (m) => caiu(m, 'r-meio') || 'O r-meio continua ligado.',
      feito: 'O r-meio está carregando o sistema. Enquanto isso, é como se não existisse.',
    }),
    passo({
      alvo: ['equip', 'pc-norte'],
      acao: 'ping',
      valores: { destino: SRV78, n: '4' },
      instrucao: 'Do pc-norte, faça ping no servidor de novo.',
      porque: 'O r-norte continua mandando para 10.0.1.2, porque é o que a tabela dele diz. Rota estática não percebe queda sozinha.',
      conferir: (m) => pingFalhou(m, 'pc-norte', SRV78) || 'O ping passou? O r-meio deveria estar fora. Religue o r-meio e tente de novo.',
      feito: 'Nada passou: o r-norte perguntou por 10.0.1.2 no ARP, ninguém respondeu, e ele devolveu "host inalcançável". Só os pacotes que iam por ali se perderam; nenhuma conexão foi derrubada, porque não havia nenhuma.',
    }),
    passo({
      alvo: ['equip', 'r-norte'],
      acao: 'rot-rota',
      pedir: ['destino', 'via'],
      exemplo: { destino: '192.168.50.0/24', via: '10.0.2.2' },
      instrucao: 'No r-norte, mande a rede do servidor (192.168.50.0/24) pelo r-leste.',
      porque: 'O r-leste está ligado na p3 do r-norte, com o endereço 10.0.2.2. A rota nova para o mesmo destino substitui a antiga. Numa rede de datagramas, mudar o caminho é só mudar a tabela: não há circuito para refazer.',
      conferir: (m) => rotaVia(m, 'r-norte', '192.168.50.0/24', '10.0.2.2') || 'A rota ainda não aponta para o r-leste. Destino 192.168.50.0/24, próximo salto 10.0.2.2.',
      feito: 'Rota trocada. A partir do próximo pacote, a ida vai pelo r-leste.',
    }),
    passo({
      alvo: ['equip', 'pc-norte'],
      acao: 'traceroute',
      valores: { destino: SRV78 },
      instrucao: 'Faça o traceroute até o servidor mais uma vez.',
      porque: 'Se a tabela do r-norte mudou, o caminho mudou junto, sem ninguém avisar o pc-norte nem o servidor.',
      conferir: (m) => traceOk(m, 'pc-norte', SRV78, '10.0.2.2').ok || 'O traceroute não passou pelo r-leste (10.0.2.2) até o servidor.',
      feito: 'Agora é r-norte, r-leste (10.0.2.2), r-dc e o servidor. O pc-norte nem ficou sabendo: continuou entregando tudo ao mesmo gateway.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Todos os circuitos que passavam pelo r-meio morrem e precisam ser estabelecidos de novo',
          'Nada acontece: os pacotes de cada circuito desviam sozinhos, um a um',
          'Só se perdem os pacotes que estavam dentro do r-meio na hora',
          'Os circuitos esperam o r-meio voltar e seguem do ponto em que pararam',
        ],
        certa: 0,
        errada: {
          1: 'Isso é o datagrama. No circuito virtual, a rota foi escolhida uma vez, no estabelecimento, e os pacotes não decidem caminho.',
          2: 'Também é o comportamento do datagrama. No circuito virtual, o r-meio guardava o estado de cada conexão, e esse estado se foi com ele.',
          3: 'O r-meio voltou do boot sem a tabela de circuitos. Do ponto de vista da rede, aqueles circuitos não existem mais.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se a cidade usasse circuitos virtuais e o r-meio caísse, o que aconteceria com as conexões que passavam por ele?',
      porque: 'No circuito virtual, cada roteador do caminho guarda uma linha por conexão. Perder o roteador é perder essas linhas.',
      feito: 'Todos morrem. É o preço de guardar estado nos roteadores. O ganho é poder reservar banda e memória na hora de estabelecer cada circuito.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: 'identificador do circuito' },
      instrucao: 'Num circuito virtual, o que cada pacote carrega no lugar do endereço completo do destino?',
      porque: 'No estabelecimento, cada roteador anotou o circuito na tabela. Depois disso, o pacote só precisa dizer de qual circuito ele é.',
      feito: 'O identificador do circuito, um número curto que o roteador pode trocar a cada salto. No datagrama, cada pacote leva o endereço inteiro, porque cada um é decidido sozinho.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Datagrama: cada pacote por si',
        texto: [
          'Sem combinado prévio. Cada pacote leva o endereço completo do destino, e cada roteador decide a saída olhando só esse endereço na tabela.',
          'Dois pacotes da mesma conversa podem seguir caminhos diferentes, e a resposta pode voltar por outro lado.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'pc', rotulo: 'pc-norte', x: 40, y: 120 },
            { id: 'r1', rotulo: 'r-norte', x: 180, y: 120 },
            { id: 'a', rotulo: 'r-meio', x: 330, y: 50 },
            { id: 'b', rotulo: 'r-leste', x: 330, y: 190 },
            { id: 'dc', rotulo: 'r-dc', x: 480, y: 120 },
            { id: 's', rotulo: 'servidor', x: 610, y: 120 },
          ],
          ligacoes: [
            ['pc', 'r1'],
            ['r1', 'a', 'ida'],
            ['a', 'dc', 'ida'],
            ['r1', 'b', 'volta'],
            ['b', 'dc', 'volta'],
            ['dc', 's'],
          ],
        },
      },
      {
        titulo: 'Circuito virtual: combina antes, segue o trilho',
        texto: [
          'Antes dos dados, um pedido de estabelecimento escolhe o caminho, e cada roteador anota uma linha para o circuito. Depois, o pacote leva só o identificador, que pode mudar a cada salto.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Chega pela porta', 'Com identificador', 'Sai pela porta', 'Com identificador'],
          linhas: [
            ['p1', '1', 'p2', '4'],
            ['p1', '2', 'p3', '7'],
            ['p3', '7', 'p1', '2'],
          ],
        },
      },
      {
        titulo: 'Lado a lado',
        texto: ['Nenhum dos dois é melhor sempre. Cada um paga por um lado o que ganha do outro.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Questão', 'Datagrama', 'Circuito virtual'],
          linhas: [
            ['estabelecimento', 'não precisa', 'precisa, antes de qualquer dado'],
            ['endereço em cada pacote', 'origem e destino completos', 'só um identificador curto'],
            ['estado no roteador', 'nenhum por conexão', 'uma linha por circuito'],
            ['roteamento', 'cada pacote, sozinho', 'uma vez, no estabelecimento'],
            ['roteador que cai', 'perde só os pacotes que estavam nele', 'derruba todos os circuitos que passavam por ele'],
            ['qualidade de serviço', 'difícil de garantir', 'fácil: reserva na hora de abrir'],
            ['congestionamento', 'difícil de controlar', 'fácil: banda reservada por circuito'],
          ],
        },
      },
      {
        titulo: 'Quando um roteador cai',
        texto: [
          'No datagrama, o próximo pacote vai por outro caminho assim que a tabela muda. Aqui a tabela muda na mão; com um algoritmo de roteamento, muda sozinha.',
          'No circuito virtual, cada conexão que passava pelo roteador perdido precisa ser estabelecida de novo, pedindo um caminho novo.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r1', rotulo: 'r-norte', x: 120, y: 120 },
            { id: 'a', rotulo: 'r-meio (caiu)', x: 320, y: 50 },
            { id: 'b', rotulo: 'r-leste', x: 320, y: 190 },
            { id: 'dc', rotulo: 'r-dc', x: 520, y: 120 },
          ],
          ligacoes: [
            ['r1', 'a', 'sem resposta'],
            ['r1', 'b', 'rota nova'],
            ['b', 'dc'],
            ['a', 'dc'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Uma rede precisa garantir banda para cada videochamada e aceita refazer conexões quando um roteador cai. Que serviço combina mais com ela?',
      opcoes: ['Orientado a conexão, com circuitos virtuais', 'Sem conexão, com datagramas', 'Tanto faz, os dois garantem banda igual', 'Nenhum: garantir banda é tarefa da camada física'],
      certa: 0,
      explicacao: 'O circuito virtual reserva recursos no estabelecimento, o que facilita garantir qualidade. O preço é guardar estado nos roteadores e perder os circuitos quando um deles cai.',
    },
  },
  desafio: {
    carta: [
      'Noite de fechamento de notas na escola. O r-rio, um dos dois caminhos entre a escola e o data center, queimou a fonte e está preso no boot. O pc-escola manda o pedido, o servidor de notas recebe, e mesmo assim nada volta.',
      'A ida passa pelo r-ponte, que está bem. Numa rede de datagramas, quem decide a volta é outra tabela, em outro roteador.',
      'Objetivo: ping do pc-escola ao srv-notas funcionando e a pergunta respondida.',
    ],
    dicas: [
      'Faça o ping e leia com calma: o pedido chega, a resposta é que morre no caminho de volta.',
      'A resposta sai do srv-notas para o r-dc. Veja a rota do r-dc para 192.168.11.0/24: ela aponta para o r-rio. Troque pelo r-ponte, em 10.0.5.5.',
    ],
    perguntas: d78D,
    respostas: { '1': 'uma linha por circuito' },
    montar: () => {
      const m = triangulo(4078, T78D);
      m.equipamentos.get('r-rio')!.s.estado = 'boot';
      return m;
    },
    objetivo: (m) => [pingOk(m, 'pc-escola', SRV78D), ...todasRespondidas(m, d78D)],
    solucao: [
      ['equip', 'r-dc', 'rot-rota', { destino: '192.168.11.0/24', via: '10.0.5.5' }],
      ['equip', 'pc-escola', 'ping', { destino: SRV78D, n: '4' }],
    ],
  },
};

/* ======================================================================
 * ref 91: O cabeçalho IPv4 (5.7.1)
 * ====================================================================== */

const IP91 = { lab: '192.168.60.10', gw: '192.168.60.1', pref: '192.168.70.10' };

function mundo91(): Mundo {
  const m = novoMundo(491);
  adicionar(m, pc1('pc-lab', `${IP91.lab}/24`, IP91.gw));
  adicionar(m, pc1('pc-prefeitura', `${IP91.pref}/24`, '192.168.70.1'));
  adicionar(m, roteador('r-escola', { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: '192.168.60.1/24', p2: '10.0.3.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '10.0.3.2' }] }));
  adicionar(m, roteador('r-dc', { modelo: 'Roteador Encruzilhada 4 (núcleo)', interfaces: { p1: '10.0.3.2/30', p2: '192.168.70.1/24' }, rotas: [{ destino: '192.168.60.0/24', via: '10.0.3.1' }] }));
  ligar(m, { equip: 'pc-lab', porta: 'eth0' }, { equip: 'r-escola', porta: 'p1' }, 'cat6', 15, { id: 'c1' });
  ligar(m, { equip: 'r-escola', porta: 'p2' }, { equip: 'r-dc', porta: 'p1' }, 'cat6', 90, { id: 'c2' });
  ligar(m, { equip: 'r-dc', porta: 'p2' }, { equip: 'pc-prefeitura', porta: 'eth0' }, 'cat6', 10, { id: 'c3' });
  m.proxCabo = 4;
  m.flags.camadaRede = true;
  return m;
}

const d91: Pergunta[] = [
  numerica('1', 'Com que TTL o pedido de eco do pc-lab chegou ao pc-prefeitura?', 62, 0),
  numerica('2', 'Quanto vale o campo tamanho total desse pacote, em bytes?', 84, 0),
];

const d91D: Pergunta[] = [
  numerica('1', 'Quanto vale o campo tamanho total do pacote que chegou ao pc-arquivo, em bytes?', 1500, 0),
  numerica('2', 'Com que TTL ele chegou?', 61, 0),
];

/** O último pacote capturado chegou neste destino, com DF ligado e este tamanho total. */
function capturouDf(m: Mundo, destino: string, tamanho: number): ItemObjetivo {
  const c = m.ultimaCaptura;
  const ok = !!c && c.ip.destino === lerCidr(`${destino}/32`)!.endereco && c.ip.tamanho === tamanho && !!c.detalhe?.df && (c.detalhe?.fragmentos.length ?? 0) <= 1;
  return item(`pacote de ${tamanho} bytes com DF ligado chegou inteiro em ${destino}`, ok, c ? `último: ${c.ip.tamanho} bytes, DF ${c.detalhe?.df ? 1 : 0}` : 'nada capturado');
}

const dia91: Dia = {
  numero: 91,
  ato: 4,
  titulo: 'O cabeçalho IPv4',
  chamado: [
    'CHAMADO #0091',
    'O professor de informática da escola quer usar a rede da cidade numa aula e pediu "um pacote de verdade, aberto, com tudo o que vai escrito nele". Também quer saber o que muda nesse pacote quando ele passa por um roteador, porque um aluno jurou que "o roteador reescreve tudo".',
    'Objetivo: capturar o mesmo tipo de pacote antes e depois de dois roteadores e responder as duas perguntas.',
  ],
  manual: {
    titulo: 'Os 20 bytes que vão na frente de todo pacote IP',
    texto: [
      'Todo datagrama IPv4 começa com um cabeçalho de 20 bytes fixos, às vezes seguido de opções, e depois vem a carga: um segmento TCP, um datagrama UDP, uma mensagem ICMP. O cabeçalho é lido em palavras de 32 bits. Versão (4 bits) diz 4, para o roteador saber como ler o resto. IHL (4 bits) é o tamanho do cabeçalho contado em palavras de 32 bits: 5 sem opções (20 bytes), até 15 (60 bytes). Serviço diferenciado (8 bits) marca a classe do pacote: 6 bits dizem a prioridade, como voz ou tráfego comum, e 2 bits avisam de congestionamento.',
      'Tamanho total (16 bits) é o datagrama inteiro, cabeçalho mais dados, até 65.535 bytes. Um ping comum tem 56 bytes de dados, mais 8 do ICMP e 20 do IP: 84. Depois vêm os campos da fragmentação. Identificação (16 bits) é o número do datagrama, igual em todos os pedaços dele. Um bit fica reservado, o DF (não fragmente) proíbe os roteadores de partir o pacote, e o MF (mais fragmentos) diz que este não é o último pedaço. Deslocamento do fragmento (13 bits) diz onde este pedaço começa dentro do original, contado em unidades de 8 bytes.',
      'TTL (8 bits) é um contador de saltos: cada roteador tira 1 e, se chegar a zero, descarta o pacote e avisa a origem com ICMP "tempo esgotado". Sem ele, um laço de roteamento faria o pacote girar para sempre. Protocolo (8 bits) diz para quem entregar a carga no destino: 1 é ICMP, 6 é TCP, 17 é UDP. Checksum do cabeçalho (16 bits) é a soma em complemento de um de todas as palavras de 16 bits do cabeçalho, e protege só o cabeçalho, não os dados.',
      'Endereço de origem e endereço de destino (32 bits cada) dizem de onde o pacote veio e para onde vai. E as opções, raramente usadas, ocupam o espaço que o IHL permite além dos 20 bytes: registrar a rota, carimbar a hora em cada roteador, impor um caminho (rota de origem estrita ou livre) e marcar segurança. Quase nenhum roteador moderno dá atenção a elas.',
      'O que cada roteador muda: o TTL, que cai 1, e por isso o checksum, que precisa ser recalculado em cada salto. Se precisar fragmentar, mexe também em tamanho total, MF e deslocamento dos pedaços. Endereços, identificação, protocolo e dados seguem iguais. O quadro Ethernet em volta é que é refeito do zero em cada enlace, com MACs novos.',
    ],
  },
  dicas: [
    'Faça um ping do pc-lab até o gateway e capture: esse pacote não passou por nenhum roteador.',
    'Depois faça um ping até o pc-prefeitura e capture de novo. Compare o TTL e o checksum.',
    'O TTL sai com 64 e cai 1 por roteador. Tamanho total: 56 de dados + 8 do ICMP + 20 do IP.',
  ],
  perguntas: d91,
  montar: mundo91,
  objetivo: (m) => [pingOk(m, 'pc-lab', IP91.gw), pingOk(m, 'pc-lab', IP91.pref), ...todasRespondidas(m, d91)],
  posMorte: [
    'O primeiro pacote foi do pc-lab ao r-escola, no mesmo enlace: saiu com TTL 64 e chegou com 64, porque o próprio destino não desconta nada. O segundo atravessou o r-escola e o r-dc e chegou com 62. Os endereços de origem e destino, o protocolo 1 e o tamanho total de 84 bytes chegaram iguaizinhos.',
    'O checksum dos dois era diferente, e por dois motivos: o TTL mudou, e cada pacote tem a sua identificação. Mesmo num pacote só, cada roteador do caminho recalculou o checksum depois de tirar 1 do TTL, senão o próximo roteador acharia que o cabeçalho chegou corrompido e jogaria o pacote fora. O aluno estava errado: o roteador reescreve dois campos, e só.',
    'O DF veio zerado e não houve fragmentos: 84 bytes cabem com folga nos 1500 do Ethernet. Quando um pacote não couber, é nos campos de identificação, MF e deslocamento que a história vai se contar.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'pc-lab'],
      acao: 'ping',
      valores: { destino: IP91.gw, n: '4' },
      instrucao: 'Do pc-lab, faça ping no gateway, o r-escola (192.168.60.1).',
      porque: 'O gateway está no mesmo enlace. O pacote vai direto, sem atravessar roteador nenhum: é o "antes".',
      conferir: (m) => pingOk(m, 'pc-lab', IP91.gw).ok || 'O ping no gateway não voltou.',
      feito: 'Respondeu. Agora o pacote que chegou ao r-escola está guardado na captura.',
    }),
    passo({
      alvo: ['equip', 'pc-lab'],
      acao: 'capturar',
      instrucao: 'Abra a captura desse pacote.',
      porque: 'A captura mostra o cabeçalho IPv4: versão, IHL, tamanho total, identificação, DF, TTL, protocolo, checksum, origem e destino.',
      feito: 'Versão 4, IHL 5 (20 bytes), tamanho 84, DF 0, protocolo 1 (ICMP). TTL saiu com 64 e chegou com 64: nenhum roteador no caminho. Guarde o checksum.',
    }),
    passo({
      alvo: ['equip', 'pc-lab'],
      acao: 'ping',
      valores: { destino: IP91.pref, n: '4' },
      instrucao: 'Agora faça ping no pc-prefeitura, do outro lado do data center.',
      porque: 'Este pacote atravessa o r-escola e o r-dc. Cada um recebe, confere o checksum, tira 1 do TTL, recalcula o checksum e repassa.',
      conferir: (m) => pingOk(m, 'pc-lab', IP91.pref).ok || 'O ping no pc-prefeitura não voltou.',
      feito: 'Voltou. A resposta chegou com TTL 62: o pc-prefeitura respondeu com 64 e passou pelos mesmos dois roteadores na volta.',
    }),
    passo({
      alvo: ['equip', 'pc-lab'],
      acao: 'capturar',
      instrucao: 'Abra a captura de novo e compare com a primeira.',
      porque: 'A captura agora é do pedido que chegou ao pc-prefeitura, depois de dois roteadores. Os campos que mudaram são os que os roteadores mexem (e a identificação, porque é outro pacote).',
      feito: 'Mesmo tamanho total, mesmo protocolo, mesma origem, DF ainda 0. O TTL chegou com 62 e o checksum é outro, e confere. O MAC de origem agora é o do r-dc, porque o quadro foi refeito no último enlace.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '62' },
      instrucao: 'Com que TTL o pedido de eco chegou ao pc-prefeitura?',
      porque: 'O pc-lab manda com TTL 64. Cada roteador tira 1 antes de repassar; o destino não tira nada.',
      feito: '62: dois roteadores, dois a menos. Se chegasse a zero no meio do caminho, o roteador descartaria e avisaria com ICMP "tempo esgotado".',
    }),
    passo({
      escolha: {
        opcoes: ['O TTL e o checksum do cabeçalho', 'O endereço de origem e o de destino', 'A identificação e o protocolo', 'Todos os campos, porque o pacote é remontado'],
        certa: 0,
        errada: {
          1: 'Os endereços chegaram iguais. Quem troca endereço é o NAT, que é assunto de outro dia; o roteador comum só lê o destino para escolher a saída.',
          2: 'A identificação muda entre um pacote e outro, mas não no caminho: os fragmentos de um datagrama precisam da mesma para serem remontados. O protocolo também não muda.',
          3: 'Quem é refeito a cada salto é o quadro Ethernet. O pacote IP segue quase intacto.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Sem fragmentar e sem NAT, que campos do cabeçalho IPv4 cada roteador muda?',
      porque: 'O roteador precisa descontar o salto, e qualquer campo mudado invalida a soma de verificação do cabeçalho.',
      feito: 'TTL e checksum. O TTL cai 1, e o checksum é recalculado porque o cabeçalho mudou.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '84' },
      instrucao: 'Quanto vale o campo tamanho total desse pacote, em bytes?',
      porque: 'Tamanho total conta o datagrama inteiro: o cabeçalho IP mais tudo o que vem dentro dele. O ping comum leva 56 bytes de dados, e o cabeçalho ICMP tem 8.',
      feito: '84 = 56 + 8 + 20. O Ethernet em volta acrescenta mais 18 de cabeçalho e FCS, mas esses não contam no IP.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O cabeçalho, palavra por palavra',
        texto: ['O cabeçalho IPv4 tem cinco palavras fixas de 32 bits (20 bytes) e, se houver, opções até completar 60 bytes.'],
        visual: {
          tipo: 'camadas',
          camadas: [
            'palavra 1: versão (4) | IHL (4) | serviço diferenciado (8) | tamanho total (16)',
            'palavra 2: identificação (16) | reservado, DF, MF (3) | deslocamento do fragmento (13)',
            'palavra 3: TTL (8) | protocolo (8) | checksum do cabeçalho (16)',
            'palavra 4: endereço de origem (32)',
            'palavra 5: endereço de destino (32)',
            'opções (0 a 40 bytes), depois os dados',
          ],
          rotulo: 'os campos com o tamanho em bits',
        },
      },
      {
        titulo: 'Para que serve cada campo',
        texto: ['Cada campo responde a uma pergunta de quem recebe o pacote.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Bits', 'Para quê'],
          linhas: [
            ['versão', '4', 'qual IP é este (4)'],
            ['IHL', '4', 'tamanho do cabeçalho em palavras de 32 bits: 5 a 15'],
            ['serviço diferenciado', '8', 'classe do pacote (6 bits) e aviso de congestionamento (2 bits)'],
            ['tamanho total', '16', 'cabeçalho mais dados, até 65.535 bytes'],
            ['identificação', '16', 'número do datagrama, igual em todos os fragmentos'],
            ['DF e MF', '1 + 1', 'não fragmente; mais fragmentos vêm depois'],
            ['deslocamento', '13', 'onde o fragmento começa, em unidades de 8 bytes'],
            ['TTL', '8', 'saltos que ainda restam; zero é descarte'],
            ['protocolo', '8', 'para quem entregar: 1 ICMP, 6 TCP, 17 UDP'],
            ['checksum', '16', 'confere só o cabeçalho'],
            ['origem e destino', '32 + 32', 'de onde veio e para onde vai'],
            ['opções', 'variável', 'registrar rota, carimbo de hora, rota de origem, segurança'],
          ],
        },
      },
      {
        titulo: 'Cada roteador tira 1',
        texto: [
          'Antes de repassar, o roteador desconta 1 do TTL. O cabeçalho mudou, então o checksum velho não confere mais: o roteador soma de novo e grava o checksum novo.',
        ],
        visual: { tipo: 'bits', antes: '01000000', depois: '00111111', legenda: 'TTL 64 vira 63 no primeiro roteador, e o checksum é recalculado' },
      },
      {
        titulo: 'O que muda e o que fica',
        texto: ['Do pc-lab ao pc-prefeitura, por dois roteadores, sem fragmentar.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Saindo do pc-lab', 'Chegando ao pc-prefeitura'],
          linhas: [
            ['TTL', '64', '62'],
            ['checksum', 'um valor', 'outro valor, recalculado em cada salto'],
            ['tamanho total', '84', '84'],
            ['identificação', 'a do pacote', 'a mesma'],
            ['protocolo', '1 (ICMP)', '1 (ICMP)'],
            ['origem e destino', '192.168.60.10 para 192.168.70.10', 'os mesmos'],
            ['MAC de origem do quadro', 'o do pc-lab', 'o do r-dc (o quadro é refeito)'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um pacote sai com TTL 64 e atravessa três roteadores. Com que TTL chega, e que outro campo do cabeçalho foi refeito em cada salto?',
      opcoes: ['61, e o checksum do cabeçalho', '61, e o endereço de origem', '64, porque o TTL só muda se houver laço', '63, e a identificação'],
      certa: 0,
      explicacao: 'Cada roteador tira 1 do TTL (64 - 3 = 61) e recalcula o checksum, que deixou de conferir quando o TTL mudou.',
    },
  },
  desafio: {
    carta: [
      'A câmara de vereadores precisa mandar as atas para o arquivo municipal em pacotes de 1500 bytes com o bit DF ligado, porque o sistema delas não aceita fragmento. O pacote sai e volta um aviso dizendo que precisava fragmentar, e o DF proíbe.',
      'Alguém deixou a porta do r-dc que vai para o r-arquivo com MTU de 1400, de um teste antigo. O enlace é Ethernet comum.',
      'Objetivo: um ping de 1500 bytes no total, com DF, do pc-camara ao pc-arquivo, chegando inteiro, e as duas perguntas respondidas.',
    ],
    dicas: [
      'Ping com tamanho e DF: 1472 bytes de dados + 8 do ICMP + 20 do IP = 1500. Leia quem devolve o aviso e o MTU que ele cita.',
      'No r-dc, ponha a p2 de volta no MTU do Ethernet, 1500, e repita o ping.',
      'O pc-camara sai com TTL 64, e no caminho há três roteadores.',
    ],
    perguntas: d91D,
    respostas: { '1': '1500', '2': '61' },
    montar: () => {
      const m = novoMundo(4091);
      adicionar(m, pc1('pc-camara', '192.168.80.10/24', '192.168.80.1'));
      adicionar(m, pc1('pc-arquivo', '192.168.90.10/24', '192.168.90.1'));
      adicionar(m, roteador('r-camara', { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: '192.168.80.1/24', p2: '10.0.4.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '10.0.4.2' }] }));
      adicionar(m, roteador('r-dc', { modelo: 'Roteador Encruzilhada 4 (núcleo)', interfaces: { p1: '10.0.4.2/30', p2: '10.0.4.5/30' }, rotas: [{ destino: '192.168.80.0/24', via: '10.0.4.1' }, { destino: '192.168.90.0/24', via: '10.0.4.6' }] }));
      adicionar(m, roteador('r-arquivo', { modelo: 'Roteador Encruzilhada 2', interfaces: { p1: '10.0.4.6/30', p2: '192.168.90.1/24' }, rotas: [{ destino: '0.0.0.0/0', via: '10.0.4.5' }] }));
      ligar(m, { equip: 'pc-camara', porta: 'eth0' }, { equip: 'r-camara', porta: 'p1' }, 'cat6', 10, { id: 'c1' });
      ligar(m, { equip: 'r-camara', porta: 'p2' }, { equip: 'r-dc', porta: 'p1' }, 'cat6', 70, { id: 'c2' });
      ligar(m, { equip: 'r-dc', porta: 'p2' }, { equip: 'r-arquivo', porta: 'p1' }, 'cat6', 70, { id: 'c3' });
      ligar(m, { equip: 'r-arquivo', porta: 'p2' }, { equip: 'pc-arquivo', porta: 'eth0' }, 'cat6', 10, { id: 'c4' });
      acharPorta(m, { equip: 'r-dc', porta: 'p2' }).mtu = 1400;
      m.proxCabo = 5;
      m.flags.camadaRede = true;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'pc-camara', '192.168.90.10'), capturouDf(m, '192.168.90.10', 1500), ...todasRespondidas(m, d91D)],
    solucao: [
      ['equip', 'r-dc', 'rot-mtu', { porta: 'p2', mtu: '1500' }],
      ['equip', 'pc-camara', 'ping-tamanho', { destino: '192.168.90.10', n: '1', tamanho: '1472', df: 'df' }],
    ],
  },
};

export const ATO4A: Dia[] = [dia77, dia78, dia91];
