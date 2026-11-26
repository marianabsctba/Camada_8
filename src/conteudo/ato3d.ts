// Dias do ato 3 (O Bairro), com prática guiada, aula e desafio no próprio dia.
// O protocolo da subcamada MAC do 802.11 (4.4.3), o quadro e os serviços do 802.11 (4.4.4 e 4.4.5) e o Bluetooth (4.5.1 a 4.5.4).

import { snrWifi } from '../motor/aparelhos';
import { avaliar, radioDados } from '../motor/fisico';
import { BT_CANAIS_CLASSICO, BT_CLASSES_POTENCIA, BT_SALTOS_POR_S, BT_SLOT_US, canal, frequenciaBtClassico, MINI_QUADRO, simularCanal, taxaBtMbps, type EstadoMac, type ResultadoMac } from '../motor/mac';
import { adicionar, aparelho, ligar, novoMundo, pc, type Equipamento, type Mundo } from '../motor/mundo';
import { lerCidr, rngSemente } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

const ip = (s: string) => lerCidr(s)!;

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

/** Número com vírgula decimal, para os textos. */
const br = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');
/** Fração em porcentagem com vírgula. */
const pc1 = (x: number) => `${br(x * 100, 1)} %`;

/* ---------- canal de laboratório ---------- */

const estadoMac = (m: Mundo, nome: string) => m.equipamentos.get(nome)!.s.mac as EstadoMac;
const ultimoMac = (m: Mundo) => m.flags.ultimoMac as ResultadoMac | undefined;
/** A última simulação foi feita com o canal exatamente como está agora. */
const simulouAgora = (m: Mundo, nome: string) => !!ultimoMac(m) && m.flags.macDoUltimo === JSON.stringify(estadoMac(m, nome));
/** Mesma conta que o console faz ao simular (semente 1234). */
const simular = (s: EstadoMac) => simularCanal(s, rngSemente(1234));
/** Quadros de dado que colidiram, lidos das linhas da simulação. */
const colisoesDados = (r: ResultadoMac) => r.colisoes;

const mac = (c: Partial<EstadoMac>): EstadoMac => ({ protocolo: 'csma-ca', estacoes: 4, carga: 0.8, a: 0.01, rtsCts: false, ocultas: true, quadroBits: 1000, bastaoBits: 24, ...c });

/** Conferência de um passo que simula o canal. */
const simulouOk = (nome: string, cond: (r: ResultadoMac, s: EstadoMac) => true | string) => (m: Mundo) => {
  const r = ultimoMac(m);
  if (!r || !simulouAgora(m, nome)) return 'A simulação não rodou com o canal como está agora.';
  return cond(r, estadoMac(m, nome));
};

/* ---------- rádios ---------- */

function radio(nome: string, modelo: string, antena: Equipamento['antena'], rumo: number, alturaMax: number): Equipamento {
  const e = aparelho(nome, 'radio', modelo, [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax });
  e.antena = antena;
  return e;
}

const pingou = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  if (!r) return 'O ping não aconteceu.';
  return r.recebidos === r.n || `Voltaram ${r.recebidos} de ${r.n}. Sem associação, o ponto de acesso descarta tudo o que a estação manda.`;
};

/* ======================================================================
 * ref 69: Pedir a vez no ar (4.4.3)
 * ====================================================================== */

const CANAL69 = 'ar-praca';
const INI69 = mac({ estacoes: 4, carga: 0.8, ocultas: true, rtsCts: false });
const SEM69 = simular(INI69);
const COM69 = simular({ ...INI69, rtsCts: true });

const p69: Pergunta[] = [
  numerica('1', 'Com RTS/CTS ligado, qual a vazão S do canal da praça, em %? (uma casa decimal basta)', (m) => (ultimoMac(m)?.vazao ?? -1) * 100, 0.5),
];

const CANAL69D = 'ar-ginasio';
const INI69D = mac({ protocolo: 'aloha', estacoes: 6, carga: 0.8, ocultas: false, rtsCts: false });
const FIM69D = simular({ ...INI69D, protocolo: 'csma-ca', ocultas: true, rtsCts: true });
const RTS69D = Number((FIM69D.linhas.find((l) => l.startsWith('RTS que colidiram')) ?? '0').replace(/^RTS que colidiram: (\d+).*$/, '$1'));

const d69: Pergunta[] = [
  numerica('1', 'Na simulação final, com as estações ocultas e RTS/CTS ligado, quantos RTS colidiram?', (m) => {
    const l = ultimoMac(m)?.linhas.find((x) => x.startsWith('RTS que colidiram'));
    return l ? Number(l.replace(/^RTS que colidiram: (\d+).*$/, '$1')) : -1;
  }, 0),
];

/** O canal da praça como o objetivo quer: CSMA/CA, ocultas, RTS/CTS e a mesma carga de sempre. */
function objetivoCanal(m: Mundo, nome: string, n: number, g: number): ReturnType<typeof item>[] {
  const s = estadoMac(m, nome);
  const r = ultimoMac(m);
  const agora = simulouAgora(m, nome);
  return [
    item('protocolo CSMA/CA, o do Wi-Fi', s.protocolo === 'csma-ca', s.protocolo),
    item('as estações continuam ocultas umas das outras (isso é geografia, não configuração)', s.ocultas, s.ocultas ? 'ocultas' : 'marcadas como se escutando'),
    item(`a mesma demanda de sempre: ${n} estações e G = ${br(g, 1)} ou mais`, s.estacoes >= n && s.carga >= g, `${s.estacoes} estações, G = ${br(s.carga, 2)}`),
    item('simulação feita com o canal como está agora, com zero quadro de dado colidindo', agora && !!r && colisoesDados(r) === 0, r ? `${pc1(r.colisoes)} dos dados colidiram` : 'ainda não simulou'),
    item('vazão de 60 % ou mais', agora && !!r && r.vazao >= 0.6, r ? pc1(r.vazao) : 'ainda não simulou'),
  ];
}

const dia69: Dia = {
  numero: 69,
  ato: 3,
  titulo: 'Pedir a vez no ar',
  chamado: [
    'CHAMADO #0069',
    'O Wi-Fi da praça tem quatro quiosques pendurados no mesmo ponto de acesso, no alto do coreto. Cada quiosque fica de um lado do chafariz, e nenhum escuta o outro: só o coreto escuta todo mundo.',
    'Na hora do almoço, o quiosque do pastel jura que a internet "trava quando a tapioca abre a boca". A tapioca diz o mesmo do pastel.',
    'Objetivo: o canal da praça em CSMA/CA, com zero quadro de dado colidindo e vazão de 60 % ou mais, sem tirar ninguém da praça, e a pergunta respondida.',
  ],
  manual: {
    titulo: 'CSMA/CA: escutar, esperar e confirmar',
    texto: [
      'No cabo da Ethernet clássica, quem transmite também escuta o fio e percebe a colisão no meio do quadro (CSMA/CD). No rádio isso não funciona. O sinal que sai da sua antena é milhões de vezes mais forte que o que chega de longe: enquanto fala, o rádio fica surdo. E a colisão que importa acontece no receptor, não no transmissor: duas estações podem estar longe uma da outra e trombar bem no meio, no ponto de acesso.',
      'Por isso o 802.11 evita a colisão em vez de detectar (CSMA/CA). A estação escuta o meio; se está livre, espera um espaço fixo (DIFS) e mais um recuo aleatório, contado em intervalos, sorteado numa janela. Se alguém começar a falar durante a contagem, ela congela o contador e continua depois. Quando o contador chega a zero, ela transmite. A cada falha, a janela dobra: no simulador vai de 8 a 64 intervalos.',
      'Como não dá para saber se o quadro chegou, o receptor responde cada quadro certo com um ACK. Sem ACK, a estação conclui que colidiu ou se perdeu, dobra a janela e tenta de novo. O ACK sai depois de um espaço curto (SIFS), menor que o DIFS: quem está no meio de uma troca tem prioridade sobre quem quer começar uma nova. Há espaços intermediários para tráfego com prioridade (AIFS, por classe), e o mais longo de todos (EIFS) para quem acabou de ouvir um quadro estragado.',
      'Terminal oculto: duas estações que não se escutam acham o meio livre e falam ao mesmo tempo. A saída é RTS/CTS. A estação manda um pedido curto (RTS) com a duração da conversa; o ponto de acesso responde com a autorização (CTS), que todas escutam. Quem ouve RTS ou CTS anota a duração no seu NAV, um cronômetro que diz "meio reservado" mesmo sem ouvir nada: é a escuta virtual do meio. Se houver colisão, é entre RTS, que são curtos: no simulador, o RTS dura 1 décimo do quadro de dados.',
      'Economia de energia, em linhas gerais: o ponto de acesso manda um quadro de sinalização (beacon) a intervalos regulares, avisando quem tem quadro guardado. A estação pode dormir entre beacons, acordar, ver se há algo para ela e pedir. Ferramentas: "Ver o canal", "RTS/CTS e terminal oculto" e "Simular o canal", no aparelho do canal.',
    ],
  },
  dicas: [
    'Simule o canal como está e olhe quantos quadros de dado colidem. Os quiosques não se escutam.',
    'Se as estações não se escutam, alguém que todas escutam precisa autorizar cada conversa em voz alta.',
    'No canal, "RTS/CTS e terminal oculto": deixe as estações ocultas (é a verdade) e ligue o RTS/CTS.',
  ],
  perguntas: p69,
  montar: () => {
    const m = novoMundo(369);
    adicionar(m, canal(CANAL69, { ...INI69 }, 'Simulador do ar da praça: 4 quiosques e o ponto de acesso do coreto'));
    return m;
  },
  objetivo: (m) => [...objetivoCanal(m, CANAL69, 4, 0.8), ...todasRespondidas(m, p69)],
  posMorte: [
    `Sem RTS/CTS, os quiosques escutavam o meio e achavam tudo livre, porque não ouviam uns aos outros. ${pc1(SEM69.colisoes)} dos quadros de dado trombavam no coreto, e a vazão ficava em ${pc1(SEM69.vazao)}. Escutar antes de falar só funciona se dá para escutar.`,
    `Com RTS/CTS, o coreto passou a autorizar cada conversa em voz alta. Todo quiosque ouve o CTS, anota a reserva no NAV e espera, mesmo sem ouvir o colega. Zero quadro de dado colidindo e ${pc1(COM69.vazao)} de vazão. As trombadas que sobraram são de RTS, que duram 1 décimo de um quadro de dados: errar com eles custa pouco.`,
    'RTS/CTS também custa: são dois quadros e dois espaços a mais antes de cada dado. Em rede pequena em que todo mundo se escuta, muita placa só liga o RTS/CTS para quadros grandes, acima de um limite configurável. Na praça, com o chafariz no meio, compensa sempre.',
  ],
  passos: [
    passo({ alvo: ['equip', CANAL69], acao: 'canal-ver', instrucao: 'Veja como está o canal da praça.', porque: 'Antes de mexer, confira o protocolo, quantas estações disputam o ar, a carga e, principalmente, se elas se escutam.', feito: 'CSMA/CA, 4 estações, G = 0,8, e as estações NÃO se escutam: cada quiosque está de um lado do chafariz.' }),
    passo({
      alvo: ['equip', CANAL69],
      acao: 'canal-simular',
      instrucao: 'Simule o canal do jeito que ele está.',
      porque: 'A simulação sorteia os quadros de cada quiosque, faz cada um escutar o meio e contar o recuo, e mostra quantos quadros de dado chegaram e quantos trombaram no coreto.',
      conferir: simulouOk(CANAL69, (r) => r.colisoes > 0.5 || 'Deveria ter muita colisão aqui.'),
      feito: `${pc1(SEM69.colisoes)} dos quadros de dado colidiram e a vazão ficou em ${pc1(SEM69.vazao)}. O recuo aleatório não ajuda quem não ouve o outro falar.`,
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque enquanto transmite o rádio fica surdo para sinais fracos, e a colisão acontece no receptor, não em quem transmite',
          'Porque o rádio é mais lento que o cabo e não daria tempo de abortar',
          'Porque no ar não existe colisão: as ondas passam umas pelas outras',
          'Porque o 802.11 é mais antigo que o CSMA/CD',
        ],
        certa: 0,
        errada: {
          1: 'Velocidade não é o problema. Mesmo um rádio rapidíssimo não ouve o sinal fraco de longe por baixo do próprio grito.',
          2: 'As ondas se somam no receptor, e o resultado é lixo. Foi isso que a simulação acabou de mostrar.',
          3: 'Não é questão de idade. É física: a própria transmissão abafa o que chega de longe.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o Wi-Fi não detecta a colisão no meio do quadro, como a Ethernet clássica faz?',
      porque: 'Na Ethernet, quem transmite mede o fio e percebe o sinal estranho. Pense no que acontece com o rádio enquanto ele mesmo está falando, e em onde o choque acontece.',
      feito: 'O rádio fala alto demais para se ouvir, e a colisão acontece lá no ponto de acesso. Daí a confirmação: cada quadro certo ganha um ACK, e quadro sem ACK é dado como perdido.',
    }),
    passo({
      escolha: {
        opcoes: [
          'O ACK, que espera só o SIFS, o espaço mais curto',
          'Um quadro novo de outro quiosque, que espera o DIFS',
          'Quem sortear o menor recuo, sempre',
          'Ninguém: depois de um quadro, o meio fica fechado por um segundo',
        ],
        certa: 0,
        errada: {
          1: 'O DIFS é mais longo que o SIFS. Antes de o DIFS acabar, o ACK já ocupou o meio.',
          2: 'O recuo só começa depois do DIFS. O ACK nem participa do sorteio.',
          3: 'Um segundo é uma eternidade em rádio. O próximo quadro sai em microssegundos.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Um quadro de dado acabou de chegar ao coreto. Quem fala primeiro no ar?',
      porque: 'Os espaços entre quadros são a fila de prioridade do 802.11: quanto mais curto o espaço que você precisa esperar, mais cedo você fala.',
      feito: 'O ACK, depois do SIFS. Quem está no meio de uma troca termina antes de alguém começar outra. QoS usa o mesmo truque: classes com espaço menor (AIFS) falam antes.',
    }),
    passo({
      alvo: ['equip', CANAL69],
      acao: 'canal-rts',
      pedir: ['rts'],
      valores: { ocultas: 'sim' },
      exemplo: { rts: 'sim' },
      instrucao: 'Ligue o RTS/CTS e deixe as estações como elas são: ocultas.',
      porque: 'Os quiosques não se ouvem, mas todos ouvem o coreto. Com RTS/CTS, cada conversa começa com um pedido curto e uma autorização em voz alta. Quem ouve a autorização anota a reserva no NAV e fica quieto.',
      conferir: simulouOk(CANAL69, (r, s) => (s.ocultas && s.rtsCts && r.colisoes === 0) || (s.ocultas ? 'Os dados ainda colidem. O RTS/CTS precisa estar ligado.' : 'Marcar as estações como se escutando é mentir para o simulador. Na praça, o chafariz continua no meio.')),
      feito: `Zero quadro de dado colidindo e vazão de ${pc1(COM69.vazao)}. As colisões que sobraram são entre RTS, curtinhos.`,
    }),
    passo({ pergunta: '1', exemplo: { resposta: (COM69.vazao * 100).toFixed(1) }, instrucao: 'Qual a vazão S do canal com RTS/CTS, em %?', porque: 'Está na linha "vazão S" da simulação que acabou de rodar.', feito: `${pc1(COM69.vazao)}, contra ${pc1(SEM69.vazao)} antes. Pedir a vez custou dois quadros curtos e devolveu a praça inteira.` }),
    passo({
      escolha: {
        opcoes: [
          'Dorme entre um beacon e outro, acorda para ver se o ponto de acesso guardou algo para ela, e pede',
          'Desliga o Wi-Fi e religa quando a pessoa tocar na tela',
          'Continua escutando o meio o tempo todo, porque senão perde quadros',
          'Pede para o ponto de acesso diminuir a potência dele',
        ],
        certa: 0,
        errada: {
          1: 'Aí ela perderia tudo o que chegasse enquanto estivesse desligada. O 802.11 combina o sono com o ponto de acesso.',
          2: 'Escutar o tempo todo é justamente o que gasta a bateria. O ponto de acesso guarda os quadros enquanto ela dorme.',
          3: 'A potência do ponto de acesso não muda o consumo da maquininha.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A maquininha de cartão do quiosque roda na bateria. Como o 802.11 deixa ela economizar energia?',
      porque: 'O ponto de acesso manda beacons a intervalos regulares, e neles diz quem tem quadro guardado.',
      feito: 'Dorme, acorda no beacon, confere a lista e pede o que é dela. O ponto de acesso faz o papel de caixa postal.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Escutar, esperar, sortear',
        texto: [
          'Com o meio livre, a estação espera o DIFS e conta um recuo aleatório. Se alguém falar no meio da contagem, ela congela e continua depois. Chegou a zero, transmite.',
          'A cada falha a janela do sorteio dobra. No simulador ela vai de 8 a 64 intervalos.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'e', rotulo: 'escuta o meio', x: 80, y: 120 },
            { id: 'd', rotulo: 'espera o DIFS', x: 230, y: 120 },
            { id: 'r', rotulo: 'conta o recuo', x: 380, y: 120 },
            { id: 't', rotulo: 'transmite', x: 530, y: 120 },
          ],
          ligacoes: [
            ['e', 'd', 'livre'],
            ['d', 'r', 'continua livre'],
            ['r', 't', 'chegou a zero'],
          ],
        },
      },
      {
        titulo: 'Confirmar cada quadro',
        texto: [
          'O rádio não se ouve enquanto fala, e a colisão acontece no receptor. Então o receptor responde cada quadro certo com um ACK. Sem ACK, é como se tivesse colidido: dobra a janela e tenta de novo.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'q', rotulo: 'Quiosque', x: 100, y: 120 },
            { id: 'c', rotulo: 'Coreto', x: 500, y: 120 },
          ],
          ligacoes: [
            ['q', 'c', 'quadro de dado'],
            ['c', 'q', 'ACK, depois do SIFS'],
          ],
        },
      },
      {
        titulo: 'Os espaços são a fila de prioridade',
        texto: ['Quanto mais curto o espaço que você espera, mais cedo você fala. A resposta de uma troca em andamento sempre passa na frente de uma troca nova.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Espaço', 'Tamanho', 'Quem usa'],
          linhas: [
            ['SIFS', 'o mais curto', 'ACK, CTS e o resto de uma troca em andamento'],
            ['AIFS', 'um por classe de QoS', 'voz e vídeo esperam menos que download'],
            ['DIFS', 'maior que o SIFS', 'quadro de dado novo, sem prioridade'],
            ['EIFS', 'o mais longo', 'quem acabou de ouvir um quadro estragado'],
          ],
        },
      },
      {
        titulo: 'RTS, CTS e o NAV',
        texto: [
          'O RTS diz quanto tempo a conversa vai durar. O CTS do ponto de acesso repete isso em voz alta. Quem ouve qualquer um dos dois põe a duração no NAV e considera o meio ocupado, mesmo sem ouvir nada: escuta virtual.',
          'Na praça, foi isto:',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Configuração', 'Dados que colidiram', 'Vazão S'],
          linhas: [
            ['CSMA/CA, quiosques ocultos, sem RTS/CTS', pc1(SEM69.colisoes), pc1(SEM69.vazao)],
            ['CSMA/CA, quiosques ocultos, com RTS/CTS', pc1(COM69.colisoes), pc1(COM69.vazao)],
          ],
        },
      },
      {
        titulo: 'Dormir sem perder nada',
        texto: [
          'O ponto de acesso manda beacons a intervalos regulares, com a lista de quem tem quadro guardado. A estação dorme entre beacons, acorda, confere a lista e pede o que é dela. A bateria agradece; a latência, um pouco menos.',
        ],
      },
    ],
    checagem: {
      pergunta: `No simulador, o quadro de dados dura ${MINI_QUADRO} mini-intervalos e o RTS dura 1. Por que o RTS/CTS ajuda quando as estações são ocultas?`,
      opcoes: [
        'Porque as colisões passam a ser entre RTS curtos, e o CTS, que todas escutam, reserva o meio para o dado',
        'Porque o RTS aumenta a potência do rádio',
        'Porque com RTS/CTS as estações passam a se escutar',
        'Porque o RTS/CTS desliga o recuo aleatório',
      ],
      certa: 0,
      explicacao: `As estações continuam sem se ouvir. Mas todas ouvem o CTS e anotam a reserva no NAV. O que ainda colide é o RTS, ${MINI_QUADRO} vezes mais curto que o dado: perder um RTS custa quase nada.`,
    },
  },
  desafio: {
    carta: [
      'O ginásio da escola ganhou Wi-Fi para os seis tablets do placar e das câmeras, espalhados pelas quatro paredes. Quem montou deixou o simulador em ALOHA "para testar" e marcou que todos os tablets se escutam, porque assim "o número ficou bonito".',
      'Na final do interclasse, o placar congelou no segundo tempo. Os tablets ficam em lados opostos da quadra, com a arquibancada no meio: um não escuta o outro.',
      'Objetivo: o canal do ginásio fiel à realidade, em CSMA/CA, com zero quadro de dado colidindo e vazão de 60 % ou mais, e a pergunta respondida.',
    ],
    dicas: [
      'Primeiro, o protocolo do Wi-Fi. Depois, a verdade sobre quem escuta quem.',
      'Com as estações ocultas, só a autorização do ponto de acesso, que todas escutam, evita a trombada dos dados.',
      'O número de RTS que colidiram aparece numa linha própria da simulação.',
    ],
    perguntas: d69,
    respostas: { '1': String(RTS69D) },
    montar: () => {
      const m = novoMundo(3069);
      adicionar(m, canal(CANAL69D, { ...INI69D }, 'Simulador do ar do ginásio: 6 tablets e o ponto de acesso no teto'));
      return m;
    },
    objetivo: (m) => [...objetivoCanal(m, CANAL69D, 6, 0.8), ...todasRespondidas(m, d69)],
    solucao: [
      ['equip', CANAL69D, 'canal-protocolo', { p: 'csma-ca' }],
      ['equip', CANAL69D, 'canal-rts', { ocultas: 'sim', rts: 'sim' }],
    ],
  },
};


/* ======================================================================
 * ref 70: Associar e autenticar (4.4.4 e 4.4.5)
 * ====================================================================== */

const AP70 = 'ap-cafe';

const p70: Pergunta[] = [
  numerica('1', 'Quantos campos de endereço cabem, no máximo, no cabeçalho de um quadro 802.11?', 4, 0),
  texto('2', 'A pessoa sai do café com o notebook aberto e entra na biblioteca da escola, que tem outro ponto de acesso da mesma rede. Como se chama o serviço que passa a estação de um ponto de acesso para o outro?', /^(a\s+)?re-?associa[çc][ãa]o$/i),
];

const d70: Pergunta[] = [
  texto('1', 'Um tablet sai da biblioteca e vai para o pátio, onde outro ponto de acesso da mesma rede da escola assume. Que serviço faz essa troca sem largar a rede?', /^(a\s+)?re-?associa[çc][ãa]o$/i),
  numerica('2', 'No quadro que o tablet manda para o servidor, passando pelo ponto de acesso, quantos dos quatro campos de endereço são usados?', 3, 0),
];

/** O enlace sem fio associado e com sinal bom. */
const associado = (m: Mundo, cabo: string, rssiMin = -65) => {
  const c = m.cabos.get(cabo)!;
  const d = radioDados(m, c);
  const up = avaliar(m, c).up;
  return { ok: up && d.rssi >= rssiMin, rssi: d.rssi, up };
};

interface Cena70 {
  cliente: string;
  ipCliente: string;
  modeloCliente: string;
  wifi: string;
  ap: string;
  modeloAp: string;
  servidor: string;
  ipServidor: string;
  modeloServidor: string;
  km: number;
  rumo: number;
  azimute: number;
  altura: number;
}

/** Estação com adaptador Wi-Fi, ponto de acesso com antena setorial e servidor no cabo. */
function cena70(m: Mundo, o: Cena70) {
  adicionar(m, pc(o.cliente, { ip: ip(o.ipCliente), modelo: o.modeloCliente, mdix: true }));
  adicionar(m, radio(o.wifi, `Adaptador Wi-Fi de ${o.cliente}, antena omnidirecional de 5 dBi, 2,4 GHz`, { ganho: 5, azimute: 0, azimuteCerto: 0, altura: 3, feixe: 360 }, (o.rumo + 180) % 360, 3));
  adicionar(m, radio(o.ap, o.modeloAp, { ganho: 14, azimute: o.azimute, azimuteCerto: o.rumo, altura: o.altura, feixe: 60 }, o.rumo, 6));
  adicionar(m, pc(o.servidor, { ip: ip(o.ipServidor), modelo: o.modeloServidor, mdix: true }));
  ligar(m, { equip: o.cliente, porta: 'eth0' }, { equip: o.wifi, porta: 'lan' }, 'cat6', 1, { id: 'c1' });
  ligar(m, { equip: o.wifi, porta: 'ar' }, { equip: o.ap, porta: 'ar' }, 'radio', o.km * 1000, { id: 'c2', radio: { distanciaKm: o.km, freqGHz: 2.4, obstaculoM: 0, ptxDbm: 15 } });
  ligar(m, { equip: o.ap, porta: 'lan' }, { equip: o.servidor, porta: 'eth0' }, 'cat6', 10, { id: 'c3' });
  m.proxCabo = 4;
}

const dia70: Dia = {
  numero: 70,
  ato: 3,
  titulo: 'Associar e autenticar',
  chamado: [
    'CHAMADO #0070',
    'O Café do Ponto Final pôs um ponto de acesso com antena setorial no toldo, para atender o totem de pedidos do quiosque, do outro lado da praça. Na faxina de sábado, alguém girou a antena para limpar o toldo e deixou ela encarando a parede do café.',
    'Desde então o totem mostra "procurando rede" e as coxinhas são anotadas no guardanapo.',
    'Objetivo: o totem associado ao ponto de acesso com RSSI de -65 dBm ou melhor, um ping de 10 pedidos até o servidor de pedidos e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'O quadro 802.11 e os serviços do Wi-Fi',
    texto: [
      'Antes de mandar o primeiro dado, a estação precisa entrar na rede. Ela ouve os beacons que o ponto de acesso transmite a intervalos regulares (ou pergunta quem está aí), se autentica e pede associação. Só depois de associada ela é uma estação daquele ponto de acesso, e o que ela mandar passa adiante. Sem associação, o ponto de acesso descarta tudo, como a portaria que não conhece você.',
      'Os serviços do 802.11 se dividem em dois grupos. Os de distribuição, que o ponto de acesso oferece: associação (entrar), reassociação (trocar de ponto de acesso na mesma rede, andando pela cidade sem largar a conexão), desassociação (sair, por iniciativa de qualquer lado), distribuição (levar o quadro até o destino, pelo ar ou pelo cabo) e integração (traduzir para outra rede, como a Ethernet do balcão). Os de estação: autenticação (provar quem é, hoje com senha ou credencial pelo WPA2 e pelo WPA3), privacidade (cifrar os dados com chave por sessão, já que qualquer um ao alcance ouve tudo), entrega de dados, QoS (voz e vídeo na frente), controle de potência (não gritar mais que o necessário) e controle de espectro (sair de canal ocupado por radar, em 5 GHz).',
      'O quadro de dados do 802.11 começa pelo campo de controle: versão, tipo (dado, controle ou gerência), subtipo e bits de sinalização, como "vai para o sistema de distribuição" (To DS), "vem dele" (From DS), "retransmissão", "a estação vai dormir" e "protegido" (cifrado). Depois vem a duração, que alimenta o NAV dos vizinhos.',
      'Em seguida, até quatro endereços MAC de 6 bytes. Saindo de uma estação para o ponto de acesso, vão três: o endereço 1 é quem recebe no ar (o ponto de acesso), o 2 é quem transmite no ar (a estação) e o 3 é o destino final, lá no cabo. O quarto só aparece quando o quadro vai de um ponto de acesso a outro pelo ar. Depois vêm o número de sequência, para o receptor descartar duplicatas das retransmissões, os dados e a verificação (FCS), um CRC de 32 bits.',
      'Ferramentas: "Ver o enlace de rádio" e "Ajustar a antena" no ponto de acesso; "Fazer ping" no totem.',
    ],
  },
  dicas: [
    'Antes de qualquer serviço, a estação precisa ouvir o ponto de acesso. Veja para onde a antena do toldo aponta.',
    'No ponto de acesso, compare o rumo até o totem com o azimute da antena. O setor tem 60°.',
    'Gire a antena do ap-cafe para 70°, depois ping de 10 pedidos do totem para 192.0.2.30.',
  ],
  perguntas: p70,
  montar: () => {
    const m = novoMundo(370);
    cena70(m, {
      cliente: 'totem',
      ipCliente: '192.0.2.31/24',
      modeloCliente: 'Totem de pedidos do quiosque da praça',
      wifi: 'wifi-totem',
      ap: AP70,
      modeloAp: 'Ponto de acesso 2,4 GHz do café, no toldo, antena setorial de 14 dBi e 60°',
      servidor: 'pedidos',
      ipServidor: '192.0.2.30/24',
      modeloServidor: 'Servidor de pedidos atrás do balcão do café',
      km: 0.15,
      rumo: 70,
      azimute: 250,
      altura: 4,
    });
    return m;
  },
  objetivo: (m) => {
    const a = associado(m, 'c2');
    return [item('totem associado, com RSSI de -65 dBm ou melhor', a.ok, `${br(a.rssi)} dBm${a.up ? '' : ', sem associação'}`), pingOk(m, 'totem', '192.0.2.30', 10), ...todasRespondidas(m, p70)];
  },
  posMorte: [
    'A antena do toldo tem um setor de 60° e apontava para 250°, de costas para o quiosque. O totem nem ouvia os beacons, e sem ouvir o ponto de acesso não há autenticação nem associação. Com a antena em 70°, o RSSI subiu para perto de -50 dBm e o totem associou.',
    'O ping só passou porque, antes dele, aconteceu a cerimônia toda: beacon, autenticação, associação e a troca de chaves que liga a privacidade. Cada quadro de dados que veio depois carregava o endereço do ponto de acesso (quem recebe no ar), o do totem (quem transmite) e o do servidor (o destino final, no cabo).',
    'Quando a cooperativa puser um segundo ponto de acesso na praça, o totem pode trocar de um para o outro com uma reassociação, sem que ninguém precise digitar a senha de novo. E se um dia for para 5 GHz, o controle de espectro e o de potência entram em cena: sair do canal do radar e não gritar mais que o necessário.',
  ],
  passos: [
    passo({ alvo: ['equip', AP70], acao: 'mostra', instrucao: 'No ponto de acesso do café, veja o enlace de rádio com o totem.', porque: 'Antes de pensar em senha ou cifra, a estação precisa ouvir o ponto de acesso. Compare o rumo até o totem com o lado para onde a antena aponta.', feito: 'Rumo até o totem: 70°. Antena apontada para 250°. RSSI abaixo de -80 dBm: sem associação.' }),
    passo({
      escolha: {
        opcoes: [
          'Ouvir o beacon, autenticar, associar e só então mandar dados, cifrados',
          'Mandar os dados primeiro e autenticar depois, se alguém reclamar',
          'Associar, mandar dados e autenticar no fim do dia',
          'Basta ouvir o beacon: a partir daí o ponto de acesso aceita qualquer quadro',
        ],
        certa: 0,
        errada: {
          1: 'Sem associação, o ponto de acesso descarta o quadro. Ele nem sabe para quem responder.',
          2: 'A associação vem depois da autenticação: o ponto de acesso só aceita como estação quem já provou quem é.',
          3: 'Ouvir o beacon é só saber que a rede existe. Ainda falta provar quem você é e entrar.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Quando a antena voltar, em que ordem o totem entra na rede?',
      porque: 'Cada serviço depende do anterior: primeiro saber que a rede existe, depois provar quem é, depois entrar. A cifra começa com a chave combinada nessa entrada.',
      feito: 'Beacon, autenticação, associação, e então dados com privacidade. É a portaria do Wi-Fi.',
    }),
    passo({
      alvo: ['equip', AP70],
      acao: 'antena',
      pedir: ['azimute'],
      valores: { altura: '4' },
      exemplo: { azimute: '70' },
      instrucao: 'Gire a antena do toldo para o rumo do totem.',
      porque: 'Azimute em graus a partir do norte. Antena setorial só ilumina a fatia de 60° à frente dela.',
      conferir: (m) => {
        const a = associado(m, 'c2');
        return a.ok || `RSSI de ${br(a.rssi)} dBm. O rumo até o totem é 70°.`;
      },
      feito: 'RSSI perto de -50 dBm: o totem ouviu o beacon, autenticou e associou.',
    }),
    passo({ alvo: ['equip', 'totem'], acao: 'ping', valores: { destino: '192.0.2.30', n: '10' }, instrucao: 'Do totem, mande 10 pings ao servidor de pedidos.', porque: 'O pedido de eco sai do totem, cruza a praça pelo ar até o ponto de acesso, que faz a distribuição e a integração: tira do quadro 802.11 e põe no cabo do balcão.', conferir: pingou('totem', '192.0.2.30'), feito: 'Dez respostas. As coxinhas voltam para o sistema.' }),
    passo({
      escolha: {
        opcoes: [
          'Endereço 1: o ponto de acesso. Endereço 2: o totem. Endereço 3: o servidor de pedidos',
          'Endereço 1: o servidor. Endereço 2: o totem. Endereço 3: vazio',
          'Endereço 1: o totem. Endereço 2: o servidor. Endereço 3: o ponto de acesso',
          'Só um endereço: o do servidor, porque é para ele que o quadro vai',
        ],
        certa: 0,
        errada: {
          1: 'O servidor nem está no ar. Quem recebe o quadro pelo rádio é o ponto de acesso, e ele precisa estar no endereço 1.',
          2: 'O endereço 1 é sempre quem recebe no ar, e o 2 quem transmite no ar. O totem transmite; o ponto de acesso recebe.',
          3: 'Com um endereço só, o ponto de acesso não saberia que o quadro é para ele repassar, nem para quem.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Num quadro de dados do totem para o servidor, o que vai em cada campo de endereço?',
      porque: 'No ar, o quadro precisa dizer quem recebe e quem transmite naquele salto. E precisa dizer o destino final, para o ponto de acesso saber para onde repassar no cabo.',
      feito: 'Receptor no ar, transmissor no ar e destino final. O bit To DS ligado avisa que o quadro vai para o sistema de distribuição.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '4' }, instrucao: 'Quantos campos de endereço cabem, no máximo, no cabeçalho do 802.11?', porque: 'O totem usou três. Falta o caso em que o quadro vai de um ponto de acesso a outro pelo ar: aí receptor, transmissor, origem e destino são quatro aparelhos diferentes.', feito: 'Quatro. O quarto só aparece com To DS e From DS ligados ao mesmo tempo, numa ponte sem fio entre pontos de acesso.' }),
    passo({ pergunta: '2', exemplo: { resposta: 'reassociação' }, instrucao: 'Como se chama o serviço de trocar de ponto de acesso dentro da mesma rede?', porque: 'A estação já está associada a um ponto de acesso e passa para outro, sem sair da rede. O nome é a associação feita de novo, em outro lugar.', feito: 'Reassociação. Depois dela, o sistema de distribuição passa a entregar os quadros da estação pelo ponto de acesso novo.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'A portaria do Wi-Fi',
        texto: ['Ninguém manda dado sem passar pela portaria. Cada etapa depende da anterior, e a desassociação, de qualquer lado, encerra tudo.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'b', rotulo: 'ouve o beacon', x: 70, y: 120 },
            { id: 'a', rotulo: 'autentica', x: 220, y: 120 },
            { id: 's', rotulo: 'associa', x: 370, y: 120 },
            { id: 'd', rotulo: 'dados cifrados', x: 530, y: 120 },
          ],
          ligacoes: [
            ['b', 'a', 'a rede existe'],
            ['a', 's', 'sei quem é'],
            ['s', 'd', 'chave combinada'],
          ],
        },
      },
      {
        titulo: 'O quadro de dados do 802.11',
        texto: ['A duração alimenta o NAV dos vizinhos. O número de sequência deixa o receptor descartar duplicatas de retransmissão. A verificação é um CRC de 32 bits, como na Ethernet.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Para que serve'],
          linhas: [
            ['controle', 'versão, tipo, subtipo, To DS, From DS, retransmissão, energia, protegido'],
            ['duração', 'quanto tempo o meio fica reservado (vai para o NAV)'],
            ['endereço 1', 'quem recebe no ar'],
            ['endereço 2', 'quem transmite no ar'],
            ['endereço 3', 'o destino final (ou a origem, na volta)'],
            ['sequência', 'numera os quadros e descarta duplicatas'],
            ['endereço 4', 'só entre pontos de acesso pelo ar'],
            ['dados', 'o pacote da camada de rede, cifrado se "protegido"'],
            ['verificação (FCS)', 'CRC de 32 bits'],
          ],
        },
      },
      {
        titulo: 'Três endereços para dois trechos',
        texto: ['O quadro do totem cruza o ar até o ponto de acesso e depois o cabo até o servidor. No ar, ele precisa dos dois que conversam ali e do destino final.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 't', rotulo: 'Totem (end. 2)', x: 90, y: 120 },
            { id: 'a', rotulo: 'Ponto de acesso (end. 1)', x: 300, y: 120 },
            { id: 's', rotulo: 'Servidor (end. 3)', x: 510, y: 120 },
          ],
          ligacoes: [
            ['t', 'a', 'ar, To DS'],
            ['a', 's', 'cabo'],
          ],
        },
      },
      {
        titulo: 'Os serviços',
        texto: ['Os de distribuição moram no ponto de acesso; os de estação valem para todo mundo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Serviço', 'O que faz'],
          linhas: [
            ['associação', 'entrar na rede de um ponto de acesso'],
            ['reassociação', 'trocar de ponto de acesso sem sair da rede'],
            ['desassociação', 'sair, por iniciativa de qualquer lado'],
            ['distribuição e integração', 'levar o quadro até o destino, pelo ar ou para outra rede'],
            ['autenticação', 'provar quem é (WPA2, WPA3)'],
            ['privacidade', 'cifrar os dados com chave por sessão'],
            ['entrega de dados', 'transmitir, com ACK e retransmissão'],
            ['QoS', 'voz e vídeo na frente'],
            ['controle de potência', 'não gritar mais que o necessário'],
            ['controle de espectro', 'sair do canal do radar, em 5 GHz'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O totem ouve os beacons do café, mas digitaram a senha errada nele. O que acontece?',
      opcoes: [
        'A autenticação falha, ele não se associa, e o ponto de acesso descarta os dados dele',
        'Ele se associa e manda dados sem cifra',
        'Ele manda dados, mas com RSSI menor',
        'Nada: senha só vale para quem está dentro do café',
      ],
      certa: 0,
      explicacao: 'Ouvir o beacon é só saber que a rede existe. Sem autenticar, não há associação, e o ponto de acesso não repassa quadro de quem não é estação dele. Sinal forte não substitui senha.',
    },
  },
  desafio: {
    carta: [
      'O carrinho de tablets da biblioteca da escola "conecta, mas não carrega nada". O ponto de acesso do prédio tem antena setorial de 60°, e o painel diz que o carrinho está associado, a 50 Mb/s, com sinal de dar dó.',
      'O zelador lembra de ter pendurado um varal de bandeirinhas de festa junina "bem do lado daquela antena".',
      'Objetivo: o carrinho associado com RSSI de -65 dBm ou melhor, um ping de 10 pedidos até o servidor da escola e as duas perguntas respondidas.',
    ],
    dicas: [
      'Associado não quer dizer bem associado. Veja o rumo e o azimute no ponto de acesso.',
      'A antena da biblioteca precisa apontar para o rumo do carrinho; a altura pode ficar como está.',
      'O quadro de uma estação para o cabo usa os endereços de quem recebe no ar, de quem transmite no ar e do destino final.',
    ],
    perguntas: d70,
    respostas: { '1': 'reassociação', '2': '3' },
    montar: () => {
      const m = novoMundo(3070);
      cena70(m, {
        cliente: 'carrinho',
        ipCliente: '192.0.2.41/24',
        modeloCliente: 'Carrinho de tablets da biblioteca',
        wifi: 'wifi-carrinho',
        ap: 'ap-biblioteca',
        modeloAp: 'Ponto de acesso 2,4 GHz do prédio da escola, antena setorial de 14 dBi e 60°',
        servidor: 'servidor-escola',
        ipServidor: '192.0.2.40/24',
        modeloServidor: 'Servidor da secretaria da escola',
        km: 0.12,
        rumo: 75,
        azimute: 165,
        altura: 5,
      });
      return m;
    },
    objetivo: (m) => {
      const a = associado(m, 'c2');
      return [item('carrinho associado, com RSSI de -65 dBm ou melhor', a.ok, `${br(a.rssi)} dBm${a.up ? '' : ', sem associação'}`), pingOk(m, 'carrinho', '192.0.2.40', 10), ...todasRespondidas(m, d70)];
    },
    solucao: [
      ['equip', 'ap-biblioteca', 'mostra'],
      ['equip', 'ap-biblioteca', 'antena', { azimute: '75', altura: '5' }],
      ['equip', 'carrinho', 'ping', { destino: '192.0.2.40', n: '10' }],
    ],
  },
};

/* ======================================================================
 * ref 71: Bluetooth (4.5.1 a 4.5.4): arquitetura, perfis, pilha e rádio
 * O enlace, o pacote e o baixo consumo (4.5.5 a 4.5.7) ficam no ref 130, em ato3g.ts.
 * ====================================================================== */

const AP71 = 'ap-academia';
const SALTOS = BT_SALTOS_POR_S;
const INTERVALO_US = BT_SLOT_US; // 625 µs
const [CLASSE1, CLASSE2, CLASSE3] = BT_CLASSES_POTENCIA;

/** O analisador mostra o Bluetooth como uma média fraca espalhada pela faixa: aproximação, porque ele salta. */
const bluetooth = (canais: number[]) => canais.map((c) => ({ nome: 'Bluetooth: fones, relógios e esteiras saltando (média aproximada)', canal: c, dbm: -88 }));

const p71: Pergunta[] = [
  numerica('1', `O Bluetooth clássico salta de frequência ${SALTOS} vezes por segundo. Quanto tempo ele fica em cada frequência, em µs?`, INTERVALO_US, 1),
  numerica('2', 'Quantos aparelhos podem estar ativos ao mesmo tempo numa piconet, contando o mestre?', 8, 0),
];

const d71: Pergunta[] = [
  numerica('1', 'A sala de bike tem 20 sensores de bicicleta ativos ao mesmo tempo. Se cada mestre aguenta 7 escravos ativos, quantas piconets são necessárias, no mínimo?', Math.ceil(20 / 7), 0),
  numerica('2', 'O EDR de 3 Mb/s usa 8DPSK, com 8 fases possíveis, a 1 milhão de símbolos por segundo. Quantos bits leva cada símbolo?', taxaBtMbps('8dpsk'), 0),
];

const snrDe = (m: Mundo, nome: string) => snrWifi(m.equipamentos.get(nome)!.s as any).snr;

const dia71: Dia = {
  numero: 71,
  ato: 3,
  titulo: 'Bluetooth',
  chamado: [
    'CHAMADO #0071',
    'A Academia Supino Reto pegou Wi-Fi com a gente e reclama que ele "some na hora da aula de dança". A turma culpa a caixa de som Bluetooth da aula, que fica no volume onze. A professora culpa os fones sem fio da turma.',
    'Na mesma faixa de 2,4 GHz moram o Wi-Fi da academia, o da academia concorrente ao lado e uma nuvem de fones, relógios e esteiras com Bluetooth.',
    'Objetivo: SNR de 25 dB ou mais no cliente do Wi-Fi da academia e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Bluetooth: rede pessoal no mesmo ar do Wi-Fi',
    texto: [
      'O Bluetooth nasceu para tirar o fio entre aparelhos próximos: fone e celular, teclado e computador, relógio e telefone. A unidade básica é a piconet: um mestre e até 7 escravos ativos, a poucos metros. Até 255 outros podem ficar estacionados, quietos, esperando o mestre chamar. Várias piconets podem se encostar numa scatternet, com um aparelho fazendo parte de duas e servindo de ponte. O mestre manda em tudo: escravo só fala quando o mestre pergunta.',
      'Cada aplicação tem o seu perfil, um acordo de quais protocolos da pilha usar e com que parâmetros, para que fone e celular de fabricantes diferentes se entendam: áudio de alta qualidade para o fone (A2DP), viva-voz no carro (HFP), teclado e mouse (HID), troca de arquivos, porta serial emulada, sensores de saúde. Antes de conectar, um aparelho pergunta ao outro, pelo protocolo de descoberta de serviços (SDP), quais perfis ele tem. A especificação traz dezenas de perfis: é o jeito de um padrão só servir para coisas tão diferentes.',
      'A pilha tem dois andares. No controlador, em geral um chip só: o rádio; a banda base, ou controlador de enlace, que transforma bits em pacotes e organiza o tempo e os saltos; e o gerenciador de enlace, que abre e configura as conexões, negocia o modo de energia e cuida do pareamento. No hospedeiro, o sistema do celular ou do computador: o L2CAP, que multiplexa os protocolos de cima e corta mensagens de até 64 KB nos pacotes pequenos de baixo, remontando na chegada; os protocolos de cima, como o SDP e a porta serial; e os perfis. Entre os dois andares fica a HCI, a interface de controle do hospedeiro: comandos e eventos padronizados por USB ou serial, para que qualquer sistema fale com qualquer chip.',
      `O rádio usa a faixa ISM de 2,4 GHz, livre de licença e a mesma do Wi-Fi e do micro-ondas, dividida em ${BT_CANAIS_CLASSICO} canais de 1 MHz: o canal k fica em 2402 + k MHz, de ${frequenciaBtClassico(0)} a ${frequenciaBtClassico(BT_CANAIS_CLASSICO - 1)} MHz. Ele salta de canal ${SALTOS} vezes por segundo, ${INTERVALO_US} µs em cada um, numa sequência pseudoaleatória tirada do endereço e do relógio do mestre. Uma interferência num canal estraga só um pedacinho da conversa, que é retransmitido. No salto adaptativo (AFH), a piconet marca os canais ruins, como os debaixo de um Wi-Fi forte, e salta só nos bons (no mínimo 20).`,
      `A modulação básica é GFSK, a 1 milhão de símbolos por segundo e 1 bit por símbolo: 1 Mb/s. A taxa melhorada (EDR) mantém o cabeçalho em GFSK e troca a carga para modulação de fase: π/4-DQPSK, com 2 bits por símbolo (2 Mb/s), ou 8DPSK, com 3 (3 Mb/s). A potência define a classe: classe 1 até ${CLASSE1.mw} mW (${CLASSE1.dbm} dBm), uns ${CLASSE1.alcanceM} m; classe 2 até ${br(CLASSE2.mw)} mW (${CLASSE2.dbm} dBm), uns ${CLASSE2.alcanceM} m, a dos fones e celulares; classe 3 até ${CLASSE3.mw} mW (${CLASSE3.dbm} dBm), uns ${CLASSE3.alcanceM} m. Atenção: o analisador do galpão não segue o salto. Ele mostra o Bluetooth como uma média fraca espalhada pela faixa, o que é uma aproximação. Ferramentas: "Analisador de espectro", "Ver SNR no cliente" e "Trocar o canal", no ponto de acesso.`,
    ],
  },
  dicas: [
    'Abra o analisador de espectro e separe o que é Wi-Fi do que é Bluetooth.',
    'O Bluetooth está espalhado pela faixa inteira, fraco. Quem estraga o canal é o Wi-Fi forte da vizinha.',
    'Canal 6: longe da vizinha no 1 e da TV no 11.',
  ],
  perguntas: p71,
  montar: () => {
    const m = novoMundo(371);
    adicionar(
      m,
      aparelho(AP71, 'ap', 'Ponto de acesso 2,4 GHz da academia', [{ nome: 'lan' }], {
        canal: 1,
        sinalCliente: -60,
        ruidoDbm: -95,
        vizinhos: [{ nome: 'ACADEMIA_BICEPS_DE_OURO', canal: 1, dbm: -58 }, { nome: 'TV_da_Sala_de_Bike', canal: 11, dbm: -70 }, ...bluetooth([2, 7, 12])],
      }),
    );
    return m;
  },
  objetivo: (m) => {
    const snr = snrDe(m, AP71);
    return [item('SNR de 25 dB ou mais no cliente', snr >= 25, `${br(snr)} dB`), ...todasRespondidas(m, p71)];
  },
  posMorte: [
    'O Wi-Fi da academia estava no canal 1, o mesmo da academia vizinha, que chegava mais forte que ele: SNR negativa. No canal 6, longe da vizinha e da TV da sala de bike, a SNR passou de 25 dB.',
    'O Bluetooth era inocente, ou quase. Cada fone fica 625 µs num canal de 1 MHz e pula para outro: para o Wi-Fi, que ocupa 22 MHz, ele aparece como uma garoa fraca e espalhada, não como uma tempestade num canal só. O analisador mostra isso como uma média, que é uma aproximação: na vida real, cada salto é um pulso curto num ponto da faixa.',
    `A caixa de som da aula, mesmo no volume onze, é classe 2: no máximo ${br(CLASSE2.mw)} mW no ar, 40 vezes menos que os 100 mW de um ponto de acesso típico. O volume é do alto-falante, não do rádio. E os fones da turma, cada um no seu perfil de áudio, com o salto adaptativo ligado, ainda marcam os canais debaixo do Wi-Fi como ruins e passam a saltar só nos bons: cada lado sai do caminho do outro.`,
  ],
  passos: [
    passo({ alvo: ['equip', AP71], acao: 'espectro', instrucao: 'Abra o analisador de espectro da academia.', porque: 'Wi-Fi e Bluetooth dividem a mesma faixa de 2,4 GHz. Antes de culpar alguém, veja quem está onde e com que força.', feito: 'Uma academia vizinha forte no canal 1, a TV da sala de bike no 11 e o Bluetooth fraco, espalhado em vários pontos. O analisador mostra a média do salto: é uma aproximação.' }),
    passo({ alvo: ['equip', AP71], acao: 'mostra', instrucao: 'Veja a SNR no cliente do Wi-Fi da academia.', porque: 'SNR é a distância entre o sinal que interessa e tudo o que não interessa. Ela diz se o problema é sério.', feito: 'SNR negativa: o cliente ouve mais a academia vizinha que a própria academia.' }),
    passo({
      alvo: ['equip', AP71],
      acao: 'canal',
      pedir: ['canal'],
      exemplo: { canal: '6' },
      instrucao: 'Escolha um canal longe dos Wi-Fi fortes.',
      porque: 'O Bluetooth está espalhado pela faixa inteira e salta: não dá para fugir dele, e ele quase não pesa. Quem pesa é o Wi-Fi da vizinha, parado num canal de 22 MHz.',
      conferir: (m) => {
        const snr = snrDe(m, AP71);
        return snr >= 25 || `SNR de ${br(snr)} dB. Fique a 5 canais ou mais da academia vizinha e da TV.`;
      },
      feito: 'SNR acima de 25 dB. O Bluetooth continua lá, dando seus saltos, e o Wi-Fi convive com ele.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: String(INTERVALO_US) }, instrucao: `Com ${SALTOS} saltos por segundo, quanto tempo o Bluetooth fica em cada frequência, em µs?`, porque: 'Um segundo tem 1.000.000 µs. Divida pelo número de saltos.', feito: `${INTERVALO_US} µs em cada frequência. Se um canal estiver ruim, só esse pedacinho se perde, e o próximo salto já está em outro lugar da faixa.` }),
    passo({ pergunta: '2', exemplo: { resposta: '8' }, instrucao: 'Quantos aparelhos cabem ativos numa piconet, contando o mestre?', porque: 'Cada escravo ativo ganha um endereço de membro ativo de 3 bits. Com 3 bits dá para contar 8 valores, e o zero fica reservado para o mestre falar com todos de uma vez.', feito: 'Oito: o mestre e 7 escravos ativos. Os outros, até 255, ficam estacionados, esperando a vez.' }),
    passo({
      escolha: {
        opcoes: [
          'O perfil de áudio na caixa: a pilha liga, mas ninguém combinou o que fazer com a música',
          'Mais potência no rádio da caixa, passando para a classe 1',
          'Outra modulação: trocar GFSK por 8DPSK',
          'Uma scatternet entre o celular e a caixa',
        ],
        certa: 0,
        errada: {
          1: 'Eles já se acham e conectam: o rádio está fazendo a parte dele. Falta o acordo de cima, o perfil.',
          2: 'A taxa não é o problema. Viva-voz e música são perfis diferentes, e a caixa só tem um deles.',
          3: 'Scatternet junta piconets. Aqui são só dois aparelhos, na mesma piconet, sem o perfil certo.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O celular da professora acha a caixa de som e conecta, mas a música não sai: a caixa anuncia só o perfil de viva-voz. O que falta?',
      porque: 'O perfil é o acordo de quais protocolos usar e como. A descoberta de serviços (SDP) conta quais perfis cada aparelho tem.',
      feito: 'O perfil de áudio (A2DP). Viva-voz (HFP) leva voz de telefone nos dois sentidos; música estéreo é outro perfil, sobre o L2CAP.',
    }),
    passo({
      escolha: {
        opcoes: [
          'A HCI: comandos e eventos padronizados entre o hospedeiro e o controlador',
          'O L2CAP, que corta e remonta as mensagens',
          'O salto de frequência, que é igual em todos os chips',
          'A classe de potência do adaptador',
        ],
        certa: 0,
        errada: {
          1: 'O L2CAP roda no sistema do notebook, acima da HCI. Ele nem fica sabendo que o chip mudou.',
          2: 'O salto é do rádio, dentro do chip. Ele explica por que os dois chips falam no ar, não por que o sistema fala com o chip novo.',
          3: 'Potência muda o alcance, não a conversa entre o sistema e o chip.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A recepção trocou o adaptador USB de Bluetooth do notebook por um de outro fabricante, e tudo funcionou sem driver especial. Que parte da pilha permite isso?',
      porque: 'A pilha tem dois andares: o controlador, no chip (rádio, banda base, gerenciador de enlace), e o hospedeiro, no sistema (L2CAP, protocolos, perfis).',
      feito: 'A HCI: o sistema manda os mesmos comandos padronizados para qualquer chip, por USB ou serial.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Piconet e scatternet',
        texto: ['Um mestre, até 7 escravos ativos e até 255 estacionados. Um aparelho que participa de duas piconets costura as duas numa scatternet.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'm1', rotulo: 'Mestre (celular)', x: 150, y: 70 },
            { id: 'f', rotulo: 'Fone', x: 60, y: 200 },
            { id: 'r', rotulo: 'Relógio', x: 170, y: 220 },
            { id: 'p', rotulo: 'Ponte (notebook)', x: 300, y: 150 },
            { id: 'm2', rotulo: 'Mestre (esteira)', x: 450, y: 70 },
            { id: 's', rotulo: 'Sensor', x: 530, y: 210 },
          ],
          ligacoes: [
            ['m1', 'f', 'piconet 1'],
            ['m1', 'r'],
            ['m1', 'p'],
            ['m2', 'p', 'piconet 2'],
            ['m2', 's'],
          ],
        },
      },
      {
        titulo: 'Saltar para não apanhar',
        texto: ['79 canais de 1 MHz, de 2402 a 2480 MHz, e 1600 saltos por segundo. Cada salto é um intervalo de 625 µs. Um canal ruim estraga só um intervalo, que é retransmitido.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Grandeza', 'Valor', 'Conta'],
          linhas: [
            ['canais', '79 de 1 MHz', '2402 a 2480 MHz'],
            ['saltos por segundo', '1600', 'sequência que mestre e escravos conhecem'],
            ['intervalo', '625 µs', '1.000.000 µs ÷ 1600'],
            ['canal k', `${frequenciaBtClassico(0)} + k MHz`, 'k de 0 a 78'],
            ['salto adaptativo (AFH)', 'pelo menos 20 canais', 'só os que a piconet marcou como bons'],
          ],
        },
      },
      {
        titulo: 'Wi-Fi e Bluetooth no mesmo ar',
        texto: ['O Wi-Fi fica parado num canal de 22 MHz; o Bluetooth passa um instante em cada canal de 1 MHz. No analisador, o Bluetooth aparece como uma média fraca espalhada, que é uma aproximação do salto.'],
        visual: {
          tipo: 'espectro',
          canais: [
            { canal: 1, dbm: -58, rotulo: 'academia vizinha' },
            { canal: 2, dbm: -88, rotulo: 'Bluetooth (média)' },
            { canal: 6, dbm: -60, rotulo: 'academia, depois' },
            { canal: 7, dbm: -88, rotulo: 'Bluetooth (média)' },
            { canal: 11, dbm: -70, rotulo: 'TV da sala de bike' },
            { canal: 12, dbm: -88, rotulo: 'Bluetooth (média)' },
          ],
        },
      },
      {
        titulo: 'A pilha em dois andares',
        texto: [
          'Em cima, no sistema do aparelho (o hospedeiro): perfis, protocolos como o SDP e o L2CAP. Embaixo, no chip (o controlador): gerenciador de enlace, banda base e rádio. A HCI é a fronteira padronizada entre os dois.',
          'Cada perfil (áudio, viva-voz, teclado, arquivos, sensores) escolhe o que usa da pilha.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: [
            'Perfis: áudio (A2DP), viva-voz (HFP), teclado e mouse (HID)...',
            'Protocolos de cima: descoberta de serviços (SDP), porta serial',
            'L2CAP: multiplexa e corta mensagens de até 64 KB',
            'HCI: comandos e eventos entre hospedeiro e controlador',
            'Gerenciador de enlace: conexões, energia e pareamento',
            'Banda base (controlador de enlace): pacotes, tempo e saltos',
            'Rádio: 2,4 GHz, 79 canais, GFSK e EDR',
          ],
          rotulo: 'Pilha do Bluetooth clássico',
        },
      },
      {
        titulo: 'Modulação e potência',
        texto: ['Todas a 1 milhão de símbolos por segundo: a taxa bruta é quantos bits cabem em cada símbolo. A classe diz quanto o rádio pode gritar.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Rádio', 'Valor', 'Uso'],
          linhas: [
            ['GFSK, 1 bit por símbolo', `${taxaBtMbps('gfsk')} Mb/s`, 'taxa básica e todo cabeçalho'],
            ['π/4-DQPSK, 2 bits por símbolo', `${taxaBtMbps('pi4-dqpsk')} Mb/s`, 'EDR'],
            ['8DPSK, 3 bits por símbolo', `${taxaBtMbps('8dpsk')} Mb/s`, 'EDR'],
            [`classe ${CLASSE1.classe}`, `${CLASSE1.mw} mW (${CLASSE1.dbm} dBm)`, `uns ${CLASSE1.alcanceM} m: adaptadores de longo alcance`],
            [`classe ${CLASSE2.classe}`, `${br(CLASSE2.mw)} mW (${CLASSE2.dbm} dBm)`, `uns ${CLASSE2.alcanceM} m: fones, caixas e celulares`],
            [`classe ${CLASSE3.classe}`, `${CLASSE3.mw} mW (${CLASSE3.dbm} dBm)`, `uns ${CLASSE3.alcanceM} m`],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um celular é mestre de uma piconet com 7 escravos ativos. Chega um oitavo aparelho que quer falar. O que pode acontecer?',
      opcoes: [
        'Um dos ativos é estacionado para abrir vaga, ou o novo entra em outra piconet, formando uma scatternet',
        'O oitavo entra como escravo ativo, e o endereço passa a ter 4 bits',
        'A piconet vira Wi-Fi',
        'O mestre aumenta os saltos para 3200 por segundo',
      ],
      certa: 0,
      explicacao: 'O endereço de membro ativo tem 3 bits, e o zero é de todos: cabem 7 escravos e o mestre. Quem sobra espera estacionado (até 255) ou vai para outra piconet, e um aparelho nas duas costura a scatternet.',
    },
  },
  desafio: {
    carta: [
      'A sala de bike da academia ganhou um ponto de acesso só dela, no canal 11 de fábrica. Do outro lado da parede, o Estúdio Pilates Zen também está no 11, e mais forte. Os 20 sensores das bicicletas falam Bluetooth com os painéis.',
      'A coordenação quer o ranking de pedaladas no telão ao vivo e já avisou que, se travar, vai culpar "o bluetooth".',
      'Objetivo: SNR de 25 dB ou mais no cliente do Wi-Fi da sala de bike e as duas perguntas respondidas.',
    ],
    dicas: [
      'O analisador mostra onde estão os Wi-Fi fortes. O Bluetooth, fraco e espalhado, quase não muda a conta.',
      'Os vizinhos de Wi-Fi estão no 11, no 9 e no 6. Só um canal bem longe deles passa de 25 dB.',
      'Cada piconet tem 1 mestre e até 7 escravos ativos. Com 8 fases, cada símbolo distingue 8 valores: 2 elevado a quanto dá 8?',
    ],
    perguntas: d71,
    respostas: { '1': String(Math.ceil(20 / 7)), '2': String(taxaBtMbps('8dpsk')) },
    montar: () => {
      const m = novoMundo(3071);
      adicionar(
        m,
        aparelho('ap-bike', 'ap', 'Ponto de acesso 2,4 GHz da sala de bike', [{ nome: 'lan' }], {
          canal: 11,
          sinalCliente: -62,
          ruidoDbm: -95,
          vizinhos: [{ nome: 'Estudio_Pilates_Zen', canal: 11, dbm: -57 }, { nome: 'Lanchonete_Natureba', canal: 6, dbm: -84 }, { nome: 'Recepcao_Academia', canal: 9, dbm: -75 }, ...bluetooth([3, 8, 13])],
        }),
      );
      return m;
    },
    objetivo: (m) => {
      const snr = snrDe(m, 'ap-bike');
      return [item('SNR de 25 dB ou mais no cliente', snr >= 25, `${br(snr)} dB`), ...todasRespondidas(m, d71)];
    },
    solucao: [
      ['equip', 'ap-bike', 'espectro'],
      ['equip', 'ap-bike', 'canal', { canal: '1' }],
    ],
  },
};

export const ATO3D: Dia[] = [dia69, dia70, dia71];
