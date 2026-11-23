// Dias novos do ato 1 (A Rua), com prática guiada, aula e desafio no próprio dia.
// A rede telefônica (2.5.1, 2.5.2 e 2.5.4) e a telefonia móvel até o GSM (2.6.1 a 2.6.4).

import { avaliarE1, avaliarModem, type UsoSlot } from '../motor/aparelhos';
import { avaliar, radioDados } from '../motor/fisico';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, type Equipamento, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

const ip = (s: string) => lerCidr(s)!;

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

/** Estado de um modem do mundo. */
const modemDe = (m: Mundo, nome: string) => avaliarModem(m.equipamentos.get(nome)!.s as any);

/** Capacidade de Shannon de um modem do mundo, em kb/s. */
const shannonKbps = (nome: string) => (m: Mundo) => modemDe(m, nome).shannon / 1000;

/** Item de objetivo: modem sincronizado com pelo menos tantos kb/s. */
function modemOk(m: Mundo, nome: string, minKbps: number): ItemObjetivo {
  const r = modemDe(m, nome);
  return item(`${nome} sincronizado a ${minKbps} kb/s ou mais`, r.ok && r.taxa >= minKbps * 1000, r.ok ? `${(r.taxa / 1000).toFixed(1)} kb/s` : r.motivos[0]);
}

/* ======================================================================
 * ref 51: A linha do telefone (2.5.1 e 2.5.2)
 * ====================================================================== */

const p51: Pergunta[] = [
  numerica('1', 'Qual a capacidade de Shannon da linha da casa 11, em kb/s? (uma casa decimal basta)', shannonKbps('modem'), 0.3),
  texto('2', 'Como se chama o par de cobre que liga a casa até a central telefônica?', /^(o\s+)?(circuito\s+terminal|[uú]ltima\s+milha|loop\s+local|la[cç]o\s+local)$/i),
];

const d51: Pergunta[] = [numerica('1', 'Qual a capacidade de Shannon do par do sítio, em kb/s? (uma casa decimal basta)', shannonKbps('modem-sitio'), 0.3)];

const dia51: Dia = {
  numero: 51,
  ato: 1,
  titulo: 'A linha do telefone',
  chamado: [
    'CHAMADO #0051',
    'Dona da casa 11 da Rua das Acácias, por carta: "o técnico da companhia telefônica disse que minha linha é longa demais para internet. Longa como? Ela é do tamanho do fio que sai da parede."',
    'O fio que sai da parede tem 5 km até a central, com emendas da época em que a central ainda era manual. O modem dela está a 4,8 kb/s, no modo "não sei, vai devagar" da fábrica.',
    'Objetivo: o modem da casa 11 sincronizado a 20 kb/s ou mais, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'O sistema telefônico, o modem, o ADSL e a fibra até a casa',
    texto: [
      'O sistema telefônico tem três pedaços. O circuito terminal (a "última milha") é o par de cobre trançado que sai de cada casa e vai até a central local; é analógico e é o único trecho que não é compartilhado. As centrais comutam as ligações. Os troncos ligam as centrais entre si, em fibra e digitais, cada um levando milhares de conversas multiplexadas. Quase todo o sistema é digital; só a última milha continua sendo o fio velho de cobre.',
      'Na entrada da central, a voz passa por um filtro de 300 a 3400 Hz e é digitalizada. Um modem de linha discada mora dentro dessa fatia de uns 3100 Hz: modula os bits em símbolos de áudio e, por mais esperto que seja, esbarra em Nyquist (no máximo 2 símbolos por hertz) e em Shannon. O par mais longo chega com menos sinal e mais ruído, e a SNR baixa barra as modulações mais densas.',
      'O ADSL pula o filtro: usa o mesmo par, mas a banda inteira que o cobre aguenta, até cerca de 1,1 MHz. A faixa de baixo continua com a voz; acima dela, a banda é cortada em centenas de subcanais de 4,3125 kHz, uns poucos para a subida e a maioria para a descida. É assimétrico porque quem mora na casa baixa muito mais do que manda. Um divisor (splitter) na casa separa o telefone do modem.',
      'O ADSL tem um inimigo: a distância. Quanto mais longo o par até a central, mais ele atenua as frequências altas, e são justamente elas que carregam a maior parte dos bits. Perto da central, o modem treina todos os subcanais; a 5 km, os de cima já nem ouvem nada e a taxa despenca.',
      'A saída de vez é a fibra até a casa (FTTH). A rede óptica passiva (PON) leva uma fibra da central até a rua e, num divisor óptico sem energia nenhuma, reparte a luz entre dezenas de casas. A descida vai para todas, cada casa só lê o que é dela, e a subida é organizada em turnos para ninguém falar por cima. Sem eletrônica no poste, não há nada para queimar na tempestade.',
    ],
  },
  dicas: [
    'Antes de mexer, olhe a linha: a banda e a SNR dizem o que cabe.',
    'Com 22 dB de SNR, o 64-QAM (26,5 dB) não fecha. O 16-QAM (20,5 dB) fecha. Nyquist deixa até 6200 Bd.',
    'Modem em 5000 Bd com QAM16: 20 kb/s, abaixo dos 22,7 kb/s de Shannon. Responda 22,7 e "circuito terminal".',
  ],
  perguntas: p51,
  montar: () => {
    const m = novoMundo(151);
    adicionar(m, aparelho('modem', 'modem', 'Modem de linha discada MD-336 da casa 11, no fim de 5 km de par até a central', [{ nome: 'linha' }], { bandaHz: 3100, snrDb: 22, baud: 2400, modulacao: 'qpsk' }));
    return m;
  },
  objetivo: (m) => [modemOk(m, 'modem', 20), ...todasRespondidas(m, p51)],
  posMorte: [
    'A linha tem 3100 Hz de banda e 22 dB de SNR. Nyquist deixa até 6200 Bd, a SNR deixa até 16-QAM e Shannon põe o teto em 22,7 kb/s. Em 5000 Bd com 16-QAM, o modem sincronizou a 20 kb/s, longe dos 4,8 kb/s do modo da fábrica.',
    'Uma casa perto da central, com SNR mais alta, passaria dos 30 kb/s no mesmo modem. A diferença não é o modem: é o comprimento do circuito terminal. O ADSL sofre do mesmo jeito, só que em escala maior: a 5 km, os subcanais de cima somem e sobra pouco mais que o de uma casa vizinha da central.',
    'A carta da companhia não estava errada, só mal explicada. Para a casa 11 sair de vez dessa conta, a resposta é a fibra: um divisor óptico no poste da Rua das Acácias e a distância deixa de mandar.',
  ],
  passos: [
    passo({ alvo: ['equip', 'modem'], acao: 'mostra', instrucao: 'Veja a linha do modem da casa 11.', porque: 'A banda (3100 Hz, a fatia da voz) e a SNR (22 dB, rebaixada pelos 5 km de par) dizem o que cabe nesta linha.', feito: 'Está em 2400 Bd e QPSK: 4,8 kb/s. A linha aguenta bem mais, mas não tanto quanto uma casa perto da central.' }),
    passo({
      escolha: {
        opcoes: [
          'Par de cobre analógico até a central local, depois troncos digitais entre centrais',
          'Fibra da casa até a central, depois par de cobre entre as centrais',
          'Um fio direto da casa até a casa de quem recebe a ligação',
          'Rádio da casa até a central, depois satélite entre as centrais',
        ],
        certa: 0,
        errada: {
          1: 'É o contrário: o cobre ficou na ponta, porque trocar o fio de cada casa custa caro. Os troncos entre centrais foram os primeiros a virar fibra.',
          2: 'Assim eram os primeiros telefones, e a rua virava uma teia de fios. Por isso inventaram a central: cada casa tem um fio só, até ela.',
          3: 'Telefone fixo não é rádio. O trecho até a casa é o par de cobre, o circuito terminal.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por onde a ligação da casa 11 passa até chegar ao telefone de alguém em outra cidade?',
      porque: 'O sistema telefônico tem três pedaços: o circuito terminal até a central local, as centrais que comutam e os troncos entre elas.',
      feito: 'Circuito terminal analógico, centrais e troncos digitais. Só o primeiro trecho é cobre velho, e é ele que limita o modem.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '22,7' }, instrucao: 'Calcule a capacidade de Shannon desta linha, em kb/s.', porque: 'C = B × log₂(1 + S/N). 22 dB em escala linear são cerca de 158,5 vezes. log₂(159,5) ≈ 7,32. Multiplique por 3100 Hz.', feito: 'Uns 22,7 kb/s. Nenhuma configuração passa disso.' }),
    passo({
      alvo: ['equip', 'modem'],
      acao: 'modem',
      pedir: ['baud', 'mod'],
      exemplo: { baud: '5000', mod: 'qam16' },
      instrucao: 'Configure o modem para 20 kb/s ou mais, sem passar de nenhum limite.',
      porque: 'Taxa = baud × bits por símbolo. Até 6200 Bd (Nyquist); com 22 dB, o 16-QAM (4 bits, pede 20,5 dB) fecha e o 64-QAM (pede 26,5 dB) não; e o total fica abaixo de 22,7 kb/s.',
      conferir: (m) => {
        const r = modemDe(m, 'modem');
        if (!r.ok) return r.motivos[0]!;
        return r.taxa >= 20000 || `Sincronizou a ${(r.taxa / 1000).toFixed(1)} kb/s. Precisa de 20 kb/s ou mais.`;
      },
      feito: 'Sincronizado. A SNR que os 5 km deixaram é o que segurou a modulação.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Usa a banda do par acima da voz, corta em subcanais e dá muito mais deles para a descida',
          'Comprime a voz para sobrar espaço nos mesmos 3100 Hz',
          'Troca o par de cobre por um mais grosso até a central',
          'Divide a banda meio a meio entre subida e descida',
        ],
        certa: 0,
        errada: {
          1: 'Dentro dos 3100 Hz, Shannon já disse quanto cabe. O ADSL foge do filtro da voz e usa as frequências que o cobre ainda carrega.',
          2: 'O ADSL roda no mesmo par que já está lá. Essa é a graça dele: nada de obra na rua.',
          3: 'Isso seria simétrico. Quem está em casa baixa muito mais do que envia, e o ADSL aposta nisso: é assimétrico.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A companhia oferece ADSL na mesma linha. O que o ADSL faz de diferente do modem discado?',
      porque: 'O filtro de 300 a 3400 Hz fica na central. O par em si carrega frequências bem mais altas, até perto de 1,1 MHz.',
      feito: 'Voz embaixo, subida numa faixa estreita e descida na faixa larga. E, quanto mais longe da central, menos subcanais de cima sobrevivem.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Uma fibra até a rua e um divisor óptico passivo que reparte a luz entre as casas',
          'Um switch com energia em cada poste, ligado por fibra a cada casa',
          'Uma fibra exclusiva, sem divisão, da central até cada uma das casas',
          'Um amplificador de ADSL no poste para o par parecer mais curto',
        ],
        certa: 0,
        errada: {
          1: 'Isso funciona, mas é rede ativa: cada poste vira um aparelho que precisa de tomada e queima na tempestade. A PON não tem eletrônica no caminho.',
          2: 'Funciona e é caríssimo: uma fibra e uma porta na central por casa. A PON divide uma fibra entre dezenas de casas.',
          3: 'Não existe milagre no cobre: o par continua longo. A saída da distância é trocar o meio.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Para a Rua das Acácias inteira, qual o desenho da fibra até a casa (FTTH)?',
      porque: 'Na rede óptica passiva, a central manda a luz por uma fibra e um divisor sem energia reparte entre as casas.',
      feito: 'PON: uma fibra, um divisor passivo no poste e uma ponta em cada casa. A descida chega para todas; a subida vai em turnos.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: 'circuito terminal' }, instrucao: 'Como se chama o par de cobre que liga a casa até a central?', porque: 'É o único trecho do sistema telefônico que é de uma casa só, e o último a ser trocado.', feito: 'Circuito terminal, a última milha. O comprimento dele é o que o técnico chamou de "linha longa".' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Três pedaços do sistema telefônico',
        texto: ['Cada casa tem um par até a central local: o circuito terminal, analógico. As centrais se ligam por troncos digitais, que carregam milhares de ligações.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'casa 11', x: 60, y: 110 },
            { id: 'l', rotulo: 'central local', x: 230, y: 110 },
            { id: 't', rotulo: 'central de trânsito', x: 400, y: 110 },
            { id: 'v', rotulo: 'central da cidade vizinha', x: 570, y: 110 },
          ],
          ligacoes: [
            ['c', 'l', 'circuito terminal (cobre)'],
            ['l', 't', 'tronco (fibra)'],
            ['t', 'v', 'tronco (fibra)'],
          ],
        },
      },
      {
        titulo: 'O modem e os dois limites',
        texto: [
          'Na linha discada, o modem só tem os 3100 Hz da voz. Nyquist limita os símbolos por segundo; a SNR limita a modulação; Shannon limita o total.',
          'Mexa na SNR: é o que muda entre uma casa perto e uma casa longe da central.',
        ],
        visual: { tipo: 'calculadora', formula: 'shannon' },
      },
      {
        titulo: 'ADSL: o mesmo par, a banda inteira',
        texto: ['Sem o filtro da voz, o par carrega até cerca de 1,1 MHz. O ADSL corta essa faixa em subcanais de 4,3125 kHz e dá a maioria para a descida.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Faixa', 'Uso'],
          linhas: [
            ['até 4 kHz', 'voz, como sempre'],
            ['de cerca de 26 a 138 kHz', 'subida: poucos subcanais'],
            ['de cerca de 138 kHz a 1,1 MHz', 'descida: a maioria dos subcanais'],
            ['par longo', 'os subcanais de cima atenuam demais e saem do treino'],
          ],
        },
      },
      {
        titulo: 'Fibra até a casa: rede óptica passiva',
        texto: ['Uma fibra sai da central, um divisor óptico sem energia reparte a luz no poste e cada casa recebe a sua ponta. A descida vai para todas; a subida é em turnos.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'o', rotulo: 'central (terminal de linha óptica)', x: 110, y: 110 },
            { id: 'd', rotulo: 'divisor passivo no poste', x: 330, y: 110 },
            { id: 'a', rotulo: 'casa 10', x: 540, y: 40 },
            { id: 'b', rotulo: 'casa 11', x: 540, y: 110 },
            { id: 'c', rotulo: 'casa 12', x: 540, y: 180 },
          ],
          ligacoes: [
            ['o', 'd', 'uma fibra'],
            ['d', 'a'],
            ['d', 'b'],
            ['d', 'c'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Duas casas na mesma rua assinam o mesmo ADSL. Uma fica a 800 m da central e sincroniza alto; a outra, a 5 km, sincroniza a uma fração disso. Por quê?',
      opcoes: [
        'O par mais longo atenua mais as frequências altas, e os subcanais de cima deixam de carregar bits',
        'A central dá prioridade para quem pagou primeiro',
        'O modem da casa longe é de outra marca',
        'O ADSL divide a banda entre todas as casas da rua',
      ],
      certa: 0,
      explicacao: 'O circuito terminal é de cada casa, não é compartilhado. O que muda é o comprimento: o cobre longo derruba a SNR nas frequências altas, e o ADSL perde justamente os subcanais que mais levam dados.',
    },
  },
  desafio: {
    carta: [
      'Bilhete da cooperativa: "compramos dois modens iguais, um para a escola e outro para o sítio do Morro Alto. O da escola anda, o do sítio se arrasta. Queremos o dinheiro de volta de um dos dois."',
      'Os dois modens são iguais. Os pares é que não são: a escola fica a 1 km da central, o sítio a 6 km. Cada um dá o que a sua linha deixa.',
      'Objetivo: modem da escola a 28 kb/s ou mais, modem do sítio a 12 kb/s ou mais, e a pergunta respondida.',
    ],
    dicas: [
      'Veja a SNR de cada linha antes. Ela decide a modulação.',
      'A escola tem 33 dB: até 256-QAM. O sítio tem 18 dB: só QPSK. Nyquist deixa até 6200 Bd nas duas.',
      'Escola: 4000 Bd em QAM256 (32 kb/s). Sítio: 6000 Bd em QPSK (12 kb/s). Shannon do sítio: 18,6 kb/s.',
    ],
    perguntas: d51,
    montar: () => {
      const m = novoMundo(1551);
      adicionar(m, aparelho('modem-escola', 'modem', 'Modem de par dedicado MD-336 da escola, a 1 km da central', [{ nome: 'linha' }], { bandaHz: 3100, snrDb: 33, baud: 1200, modulacao: 'qpsk' }));
      adicionar(m, aparelho('modem-sitio', 'modem', 'Modem de par dedicado MD-336 do sítio do Morro Alto, a 6 km da central', [{ nome: 'linha' }], { bandaHz: 3100, snrDb: 18, baud: 1200, modulacao: 'qpsk' }));
      return m;
    },
    objetivo: (m) => [modemOk(m, 'modem-escola', 28), modemOk(m, 'modem-sitio', 12), ...todasRespondidas(m, d51)],
    solucao: [
      ['equip', 'modem-escola', 'mostra'],
      ['equip', 'modem-escola', 'modem', { baud: '4000', mod: 'qam256' }],
      ['equip', 'modem-sitio', 'mostra'],
      ['equip', 'modem-sitio', 'modem', { baud: '6000', mod: 'qpsk' }],
    ],
    respostas: { '1': '18,6' },
  },
};

/* ======================================================================
 * ref 52: Circuito ou pacote (2.5.4)
 * ====================================================================== */

/** Média do último ping registrado, em ms (ou -1 se ainda não houve ping). */
const mediaPing = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  return r && Number.isFinite(r.media) ? r.media : -1;
};

/** Conferência de um passo de ping: todas as respostas voltaram. */
const pingou = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  if (!r) return 'O ping não aconteceu.';
  return r.recebidos === r.n || `Voltaram ${r.recebidos} de ${r.n}.`;
};

/** Switch antigo, só 10 Mb/s, que guarda o quadro inteiro antes de repassar. */
const sw10 = (nome: string, onde: string) => comutador(nome, { velocidades: [10], modelo: `Switch de 10 Mb/s ${onde}, armazena e repassa` });

const MUX = 'mux-e1';
const slotsDe = (m: Mundo) => m.equipamentos.get(MUX)!.s.slots as UsoSlot[];

const p52: Pergunta[] = [
  numerica('1', 'Qual a média do ping do PC da cooperativa até o servidor de teste, em ms? (três casas decimais)', mediaPing('pc-coop', '192.0.2.1'), 0.005),
  numerica('2', 'Um pacote de 1250 bytes atravessa 4 enlaces de 10 Mb/s, e cada switch guarda o pacote inteiro antes de repassar. Só de transmissão, quanto tempo ele leva de ponta a ponta, em ms?', 4, 0.05),
];

const d52: Pergunta[] = [numerica('1', 'Depois do ajuste, quantos enlaces o ping atravessa em cada sentido?', 3, 0)];

const dia52: Dia = {
  numero: 52,
  ato: 1,
  titulo: 'Circuito ou pacote',
  chamado: [
    'CHAMADO #0052',
    'A cooperativa precisa decidir até sexta: renovar o contrato de 6 linhas de telefone num E1 da central, ou passar tudo para a rede de pacotes que você está montando. O presidente resumiu a dúvida assim: "qual das duas é a internet?"',
    'Na bancada da central estão as duas lado a lado: o multiplexador E1, vazio, e três switches velhos em fila até o servidor de teste.',
    'Objetivo: 6 circuitos de voz e a sinalização no E1, com o quadro alinhado, um ping de 10 pedidos pela rede de pacotes e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Comutação de circuitos e comutação de pacotes',
    texto: [
      'Na comutação de circuitos, antes de falar, a rede reserva um caminho inteiro de ponta a ponta: um intervalo em cada tronco, de central em central. Isso leva tempo (o tempo de estabelecimento, aquele silêncio entre discar e chamar) e, depois, a banda é garantida: 64 kb/s só seus, sem fila e com atraso constante. O preço é o desperdício: se ninguém fala, o intervalo vai vazio do mesmo jeito.',
      'Na comutação de pacotes, nada é reservado. Cada pacote leva o endereço de destino e sai quando está pronto. Cada switch ou roteador recebe o pacote inteiro, confere, guarda e repassa para o próximo: é o armazena e repassa (store-and-forward). A banda é compartilhada por quem estiver falando naquele instante, e o silêncio de um vira espaço para o outro.',
      'O preço do pacote é o atraso variável. Cada salto soma o tempo de transmissão (o tamanho do pacote dividido pela taxa do enlace), o de propagação e, quando o enlace está ocupado, o tempo na fila. Com tráfego, a fila cresce e encolhe, e dois pacotes seguidos podem chegar com atrasos diferentes. E, se a fila enche, o pacote é descartado.',
      'Resumo para a cooperativa: circuito tem estabelecimento, banda garantida, ordem e atraso fixo, e cobra pelo tempo reservado. Pacote não tem estabelecimento, divide a banda e aproveita o silêncio, e cobra em atraso que varia. Voz em tempo real se dá bem nos dois; dados em rajadas, como quase tudo da internet, se dão muito melhor no pacote.',
      'Console do mux: "mostra" e "slot <lista> <uso>". O intervalo 0 é do enquadramento e o 16 é da sinalização.',
    ],
  },
  dicas: [
    'No E1, cada linha de voz é um intervalo de 64 kb/s. O 0 não se toca.',
    'Voz em 6 intervalos (do 1 ao 6), sinalização no 16. Depois, ping de 10 pedidos do pc-coop para 192.0.2.1.',
    'Na conta do pacote: 1250 bytes são 10.000 bits; a 10 Mb/s, 1 ms por enlace; 4 enlaces, 4 ms.',
  ],
  perguntas: p52,
  montar: () => {
    const m = novoMundo(152);
    const slots: UsoSlot[] = Array.from({ length: 32 }, (_, i) => (i === 0 ? 'enquadramento' : 'livre'));
    adicionar(m, aparelho(MUX, 'mux', 'Multiplexador E1 da central, tronco até a central da cidade vizinha', [{ nome: 'e1' }], { slots }));
    adicionar(m, pc('pc-coop', { modelo: 'PC da cooperativa, na rede de pacotes', ttl: 128, ip: ip('192.0.2.20/24') }));
    adicionar(m, sw10('sw-central', 'da central'));
    adicionar(m, sw10('sw-rodoviaria', 'do armário da rodoviária'));
    adicionar(m, sw10('sw-vizinha', 'da ponta da cidade vizinha'));
    adicionar(m, pc('servidor', { modelo: 'Servidor de teste, com Pinguix', ttl: 64, ip: ip('192.0.2.1/24') }));
    ligar(m, { equip: 'pc-coop', porta: 'eth0' }, { equip: 'sw-central', porta: 'p1' }, 'cat5e', 10, { id: 'c1' });
    ligar(m, { equip: 'sw-central', porta: 'p8' }, { equip: 'sw-rodoviaria', porta: 'p1' }, 'cat5e', 90, { id: 'c2' });
    ligar(m, { equip: 'sw-rodoviaria', porta: 'p8' }, { equip: 'sw-vizinha', porta: 'p1' }, 'cat5e', 90, { id: 'c3' });
    ligar(m, { equip: 'sw-vizinha', porta: 'p2' }, { equip: 'servidor', porta: 'eth0' }, 'cat5e', 10, { id: 'c4' });
    m.proxCabo = 5;
    return m;
  },
  objetivo: (m) => {
    const r = avaliarE1(slotsDe(m));
    return [
      item('quadro E1 alinhado (intervalo 0 em enquadramento)', !r.lof),
      item('sinalização no intervalo 16', r.sinalizacao),
      item('6 circuitos de voz ou mais', r.voz >= 6, `${r.voz}`),
      pingOk(m, 'pc-coop', '192.0.2.1', 10),
      ...todasRespondidas(m, p52),
    ];
  },
  posMorte: [
    'No E1, os 6 circuitos da cooperativa ficaram com 6 intervalos de 64 kb/s, 384 kb/s reservados dia e noite. Às 3 da manhã, com todo mundo dormindo, eles continuam lá, cheios de silêncio, e a cooperativa continua pagando por eles.',
    'Na rede de pacotes, o ping levou cerca de 0,863 ms de ida e volta. Quase tudo é transmissão: um quadro de ping ocupa 122 bytes no fio (976 bits), e cada um dos 4 enlaces de 10 Mb/s gasta 97,6 µs para pô-lo no cabo, porque cada switch espera o quadro inteiro antes de repassar. A propagação nos 200 m de cabo deu só 1 µs.',
    'O ping saiu sem fila porque a bancada estava vazia. Com a cidade inteira usando os mesmos switches, cada pacote espera a sua vez, e o atraso passa a variar. O circuito nunca tem esse problema; em troca, nunca empresta a banda parada. A internet escolheu o pacote.',
  ],
  passos: [
    passo({ alvo: ['equip', MUX], acao: 'mostra', instrucao: 'Veja como está o E1 da central.', porque: 'O E1 é comutação de circuitos em estado puro: 32 intervalos de 64 kb/s, cada um reservado para uma conversa.', feito: 'O intervalo 0 cuida do enquadramento e os outros 31 estão livres. Nenhum circuito ainda.' }),
    passo({
      alvo: ['equip', MUX],
      acao: 'slot',
      valores: { uso: 'voz' },
      pedir: ['lista'],
      exemplo: { lista: '1-6' },
      instrucao: 'Reserve 6 intervalos para as 6 linhas de voz da cooperativa.',
      porque: 'Cada linha ganha um intervalo só dela. O 0 é do enquadramento e o 16 vai para a sinalização: use, por exemplo, do 1 ao 6.',
      conferir: (m) => {
        const r = avaliarE1(slotsDe(m));
        if (r.lof) return 'O intervalo 0 deixou de ser enquadramento e o E1 perdeu o quadro (LOF). Use intervalos a partir do 1.';
        if (slotsDe(m)[16] === 'voz') return 'O 16 é da sinalização. Escolha outros intervalos.';
        return r.voz >= 6 || `Só ${r.voz} circuitos de voz. Precisa de 6.`;
      },
      feito: 'Seis circuitos reservados, 384 kb/s que agora são da cooperativa, falando ou não.',
    }),
    passo({
      alvo: ['equip', MUX],
      acao: 'slot',
      valores: { uso: 'sinalizacao' },
      pedir: ['lista'],
      exemplo: { lista: '16' },
      instrucao: 'Reserve o intervalo da sinalização.',
      porque: 'É a sinalização que estabelece cada circuito: fora do gancho, número discado, chamando. Ela vai no intervalo 16.',
      conferir: (m) => {
        const r = avaliarE1(slotsDe(m));
        if (r.lof) return 'O intervalo 0 é do enquadramento. Mexer nele derruba o E1.';
        return r.sinalizacao || 'A sinalização precisa estar sozinha no intervalo 16.';
      },
      feito: 'Com a sinalização no 16, as centrais conseguem montar e desmontar os circuitos. Montar leva tempo: é o silêncio entre discar e ouvir chamar.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Os 6 intervalos continuam reservados e vazios: 384 kb/s parados que ninguém mais pode usar',
          'O E1 libera os intervalos sozinho e empresta para quem estiver mandando dados',
          'Os intervalos ficam com a metade da banda enquanto ninguém fala',
          'O E1 desliga para economizar energia',
        ],
        certa: 0,
        errada: {
          1: 'Isso é o que a comutação de pacotes faz. No circuito, o intervalo é de quem reservou, do começo ao fim, mesmo calado.',
          2: 'No TDM não existe meio intervalo: cada um tem 8 bits por quadro, 8000 vezes por segundo, cheios de voz ou de silêncio.',
          3: 'O E1 não dorme. Os quadros continuam saindo 8000 vezes por segundo, com ou sem conversa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Às 3 da manhã, ninguém fala nas 6 linhas. O que acontece com os intervalos reservados?',
      porque: 'Circuito é reserva: a banda é garantida justamente porque ninguém mais pode tocar nela.',
      feito: 'Desperdício garantido. É a outra face da banda garantida.',
    }),
    passo({ alvo: ['equip', 'pc-coop'], acao: 'ping', valores: { destino: '192.0.2.1', n: '10' }, instrucao: 'Agora o pacote: do PC da cooperativa, mande 10 pings ao servidor de teste.', porque: 'Nada é reservado. Cada quadro passa pelos 3 switches, e cada um recebe o quadro inteiro antes de mandar para o próximo.', conferir: pingou('pc-coop', '192.0.2.1'), feito: 'Dez respostas, sem estabelecimento nenhum: o primeiro pacote já saiu.' }),
    passo({ pergunta: '1', exemplo: { resposta: '0,863' }, instrucao: 'Qual foi a média do ping, em ms?', porque: 'A média aparece na última linha do ping, com três casas porque é menos de 1 ms.', feito: 'Uns 0,863 ms. Quase tudo é transmissão: 976 bits a 10 Mb/s são 97,6 µs por enlace, e são 4 enlaces na ida e 4 na volta.' }),
    passo({ pergunta: '2', exemplo: { resposta: '4' }, instrucao: 'Um pacote de 1250 bytes atravessa 4 enlaces de 10 Mb/s, armazenado e repassado em cada switch. Quanto tempo de transmissão, em ms?', porque: '1250 bytes são 10.000 bits. A 10 Mb/s, cada enlace leva 10.000 ÷ 10.000.000 s para pôr o pacote no fio. Como cada switch espera o pacote inteiro, isso se repete em cada enlace.', feito: '1 ms por enlace, 4 ms no total, sem contar fila nem propagação. Mais saltos, mais atraso: é o preço de não reservar nada.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Circuito: reserva antes de falar',
        texto: ['A sinalização monta o caminho central por central e reserva um intervalo em cada tronco. Depois disso, a banda é sua até desligar, falando ou não.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'cooperativa', x: 60, y: 110 },
            { id: 'c1', rotulo: 'central local', x: 230, y: 110 },
            { id: 'c2', rotulo: 'central de trânsito', x: 400, y: 110 },
            { id: 'b', rotulo: 'cidade vizinha', x: 570, y: 110 },
          ],
          ligacoes: [
            ['a', 'c1', 'linha'],
            ['c1', 'c2', 'intervalo 3 reservado'],
            ['c2', 'b', 'intervalo 9 reservado'],
          ],
        },
      },
      {
        titulo: 'Pacote: armazena e repassa',
        texto: [
          'Cada switch recebe o pacote inteiro, confere e só então repassa. O tempo de transmissão (tamanho ÷ taxa) se paga de novo em cada enlace.',
          'Experimente: 1250 bytes a 10 Mb/s dão 1 ms por enlace.',
        ],
        visual: { tipo: 'calculadora', formula: 'transmissao' },
      },
      {
        titulo: 'Lado a lado',
        texto: ['Nenhuma das duas é melhor em tudo. Cada uma escolheu um preço.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Circuito', 'Pacote'],
          linhas: [
            ['estabelecimento', 'sim, antes de falar', 'não, sai na hora'],
            ['banda', 'garantida e reservada', 'compartilhada'],
            ['silêncio', 'desperdiçado', 'vira espaço para os outros'],
            ['atraso', 'constante', 'variável, conforme a fila'],
            ['caminho', 'o mesmo para tudo', 'cada pacote pode ir por um'],
            ['se um nó cai', 'o circuito cai', 'os pacotes contornam'],
            ['cobrança', 'por tempo reservado', 'por volume de dados'],
          ],
        },
      },
      {
        titulo: 'O atraso do pacote, salto por salto',
        texto: ['Em cada salto: transmissão (tamanho ÷ taxa), propagação (distância ÷ velocidade no meio), processamento e fila. Só a fila varia com o tráfego, e é ela que faz o atraso do pacote oscilar.'],
        visual: {
          tipo: 'camadas',
          camadas: ['fila: espera o enlace ficar livre (varia)', 'transmissão: 976 bits a 10 Mb/s = 97,6 µs', 'processamento no switch: alguns µs', 'propagação: 90 m de cobre = 0,45 µs'],
          rotulo: 'um quadro de ping num enlace da bancada',
        },
      },
    ],
    checagem: {
      pergunta: 'A cooperativa manda planilhas em rajadas: 2 minutos de muito tráfego e 58 minutos de nada. O que faz mais sentido?',
      opcoes: [
        'Comutação de pacotes: a banda só é usada quando há o que mandar, e o resto do tempo fica para os outros',
        'Comutação de circuitos: reservar banda para o pico dos 2 minutos, a hora inteira',
        'Tanto faz: as duas desperdiçam o silêncio igual',
        'Comutação de circuitos, porque pacote não chega em ordem',
      ],
      certa: 0,
      explicacao: 'Tráfego em rajadas é o caso em que o circuito mais desperdiça: 58 minutos de banda reservada e vazia. No pacote, o silêncio da cooperativa vira banda para o vizinho.',
    },
  },
  desafio: {
    carta: [
      'Chamado do caixa da cooperativa: "a maquininha nova demora para aprovar. O fornecedor disse que a rede precisa responder em menos de 0,8 ms, e a nossa leva mais que isso."',
      'O servidor de pagamentos fica no mesmo rack do sw-b. Mas alguém ligou o cabo dele no sw-e, no fim da fila, e cada pacote atravessa cinco switches de 10 Mb/s, armazenado e repassado em cada um.',
      'Objetivo: ping de 10 pedidos do caixa até o servidor, sem perda e com média abaixo de 0,8 ms, e a pergunta respondida.',
    ],
    dicas: [
      'Cada enlace a 10 Mb/s soma uns 98 µs por sentido. Menos enlaces, menos atraso.',
      'O cabo do servidor (c6) está no sw-e. Mude essa ponta para uma porta livre do sw-b.',
      'Mova a ponta a do c6 para sw-b:p2 e faça o ping de 10 pedidos. São 3 enlaces em cada sentido.',
    ],
    perguntas: d52,
    montar: () => {
      const m = novoMundo(1552);
      adicionar(m, pc('caixa', { modelo: 'Caixa da cooperativa, com a maquininha nova', ttl: 128, ip: ip('192.0.2.30/24') }));
      for (const x of ['a', 'b', 'c', 'd', 'e']) adicionar(m, sw10(`sw-${x}`, `do rack ${x.toUpperCase()}`));
      adicionar(m, pc('servidor', { modelo: 'Servidor de pagamentos, no rack B', ttl: 64, ip: ip('192.0.2.1/24') }));
      ligar(m, { equip: 'caixa', porta: 'eth0' }, { equip: 'sw-a', porta: 'p1' }, 'cat5e', 3, { id: 'c1' });
      ligar(m, { equip: 'sw-a', porta: 'p8' }, { equip: 'sw-b', porta: 'p1' }, 'cat5e', 40, { id: 'c2' });
      ligar(m, { equip: 'sw-b', porta: 'p8' }, { equip: 'sw-c', porta: 'p1' }, 'cat5e', 40, { id: 'c3' });
      ligar(m, { equip: 'sw-c', porta: 'p8' }, { equip: 'sw-d', porta: 'p1' }, 'cat5e', 40, { id: 'c4' });
      ligar(m, { equip: 'sw-d', porta: 'p8' }, { equip: 'sw-e', porta: 'p1' }, 'cat5e', 40, { id: 'c5' });
      ligar(m, { equip: 'sw-e', porta: 'p2' }, { equip: 'servidor', porta: 'eth0' }, 'cat5e', 3, { id: 'c6' });
      m.proxCabo = 7;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'caixa', '192.0.2.1', 10, 0, 0.8), ...todasRespondidas(m, d52)],
    solucao: [
      ['cabo', 'c6', 'mover', { ponta: 'a', destino: 'sw-b:p2' }],
      ['equip', 'caixa', 'ping', { destino: '192.0.2.1', n: '10' }],
    ],
    respostas: { '1': '3' },
  },
};

/* ======================================================================
 * ref 53: A célula (2.6.1 a 2.6.4)
 * ====================================================================== */

/** Um rádio com antena e portas próprias: setor da estação base ou telefone de teste. */
function radio(nome: string, modelo: string, antena: Equipamento['antena'], rumo: number, portas: { nome: string; fisica?: 'antena' }[] = [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }]): Equipamento {
  const e = aparelho(nome, 'radio', modelo, portas, { rumo, alturaMax: antena!.altura });
  e.antena = antena;
  return e;
}

/** Setor de 65° e 17 dBi, a 30 m, em 900 MHz. */
const setor = (nome: string, rotulo: string, azimute: number, certo: number) =>
  radio(nome, `Setor ${rotulo} da estação base da cooperativa: 65°, 17 dBi, 900 MHz`, { ganho: 17, azimute, azimuteCerto: certo, altura: 30, feixe: 65 }, certo);

/** Telefone de teste com antena interna de 2 dBi. */
const telefone = (nome: string, onde: string, rumo: number) =>
  radio(nome, `Telefone de teste ${onde} (antena interna de 2 dBi, 900 MHz)`, { ganho: 2, azimute: rumo, azimuteCerto: rumo, altura: 10, feixe: 360 }, rumo);

/** RSSI e associação de um enlace de rádio. */
function radioOk(m: Mundo, id: string, minDbm: number, rotulo: string): ItemObjetivo {
  const c = m.cabos.get(id)!;
  const d = radioDados(m, c);
  return item(`${rotulo}, com RSSI de ${minDbm} dBm ou melhor`, avaliar(m, c).up && d.rssi >= minDbm, `${d.rssi.toFixed(1)} dBm`);
}

const p53: Pergunta[] = [
  numerica('1', 'A operadora tem 21 portadoras GSM e reparte entre grupos de 7 células, sem repetir dentro do grupo. Quantas portadoras ficam em cada célula?', 3, 0),
  numerica('2', 'Cada portadora GSM é dividida em 8 intervalos de tempo por quadro. Com 3 portadoras, quantas ligações simultâneas a célula aguenta, sem descontar os canais de controle?', 24, 0),
  texto('3', 'Como se chama o cartão que guarda a identidade do assinante e passa de um aparelho para outro?', /^((o\s+)?(cart[aã]o\s+)?sim(\s+card)?|chip)$/i),
];

const d53: Pergunta[] = [
  numerica('1', 'No 1G, cada ligação ocupava um canal de 30 kHz só dela (FDMA). Numa faixa de 1,2 MHz, quantas ligações cabem?', 40, 0),
  numerica('2', 'No GSM, a mesma faixa de 1,2 MHz vira portadoras de 200 kHz com 8 intervalos de tempo cada. Quantas ligações cabem, sem descontar os canais de controle?', 48, 0),
  texto('3', 'Como se chama a passagem da ligação de uma célula para a vizinha, sem cair?', /^(o\s+)?hand\s*-?\s*(off|over)$/i),
];

const S2 = 'setor-2';

const dia53: Dia = {
  numero: 53,
  ato: 1,
  titulo: 'A célula',
  chamado: [
    'CHAMADO #0053',
    'A estação base nova da cooperativa tem três setores, um para cada lado da cidade: o 1 para a escola, ao norte, o 2 para a represa, a sudeste, e o 3 para a cooperativa, a sudoeste.',
    'O instalador apertou os três parafusos, tirou uma foto bonita e foi embora. O setor 2 ficou olhando para o mesmo lado do setor 1, e o telefone de teste da represa diz "sem serviço" com uma convicção admirável.',
    'Objetivo: os três telefones de teste associados com RSSI de -65 dBm ou melhor, e as três perguntas respondidas.',
  ],
  manual: {
    titulo: 'Células, reuso, handoff e o GSM',
    texto: [
      'A telefonia móvel divide o território em células, cada uma atendida por uma estação base, muitas vezes partida em três setores de 120°. O espectro é pouco, então ele é reaproveitado: as frequências são repartidas num grupo de células vizinhas (por exemplo, 7), sem repetir dentro do grupo, e o grupo se repete adiante, longe o bastante para uma célula não ouvir a outra. Célula menor reaproveita mais vezes a mesma frequência e atende mais gente.',
      'Quando o aparelho sai de uma célula e entra na vizinha, a rede passa a ligação adiante sem derrubá-la: é o handoff (ou handover). O aparelho mede o sinal das vizinhas o tempo todo e a rede decide a hora. Quando alguém liga para um aparelho parado, a rede não sabe a célula exata: ela chama o aparelho em todas as células da área onde ele se registrou por último. Isso é o paging.',
      'A 1G era voz analógica, com FDMA: cada ligação ganhava um canal de frequência só dela, ocupado do começo ao fim, e qualquer rádio sintonizado ouvia a conversa. A 2G digitalizou a voz: comprimida, ela cabe em pouca banda, pode ser cifrada e dá para pôr várias conversas na mesma frequência, cada uma no seu turno.',
      'O GSM, a 2G mais difundida, usa portadoras de 200 kHz, e cada portadora é dividida no tempo (TDMA) em quadros de 8 intervalos: 8 aparelhos falam na mesma frequência, um em cada intervalo. Subida e descida usam faixas separadas. Alguns intervalos são canais de controle, por onde passam o paging, o registro e a sinalização.',
      'A arquitetura do GSM: o aparelho e o cartão SIM (que guarda a identidade do assinante e as chaves, e vai de um aparelho para outro); a estação base, com os rádios; o controlador de estações base, que gerencia os rádios de várias delas e decide o handoff entre elas; e a central de comutação móvel, que encaminha as ligações e consulta o cadastro dos assinantes e de onde cada um está.',
    ],
  },
  dicas: [
    'Três setores, três rumos. Veja para onde o setor 2 aponta e para onde está a represa.',
    'O rumo do setor 2 até o telefone da represa é 120°. A antena está em 0°, junto com o setor 1.',
    'Antena do setor-2 em 120°. Respostas: 21 ÷ 7 = 3 portadoras; 3 × 8 = 24 ligações; o cartão é o SIM.',
  ],
  perguntas: p53,
  montar: () => {
    const m = novoMundo(153);
    adicionar(m, setor('setor-1', '1 (escola)', 0, 0));
    adicionar(m, setor(S2, '2 (represa)', 0, 120));
    adicionar(m, setor('setor-3', '3 (cooperativa)', 240, 240));
    adicionar(m, telefone('tel-escola', 'preso na janela da escola', 180));
    adicionar(m, telefone('tel-represa', 'na casa de máquinas da represa', 300));
    adicionar(m, telefone('tel-coop', 'no balcão da cooperativa', 60));
    adicionar(m, comutador('controlador', { modelo: 'Controlador de estações base, no rack do galpão (rádios e handoff)' }));
    ligar(m, { equip: 'tel-escola', porta: 'ar' }, { equip: 'setor-1', porta: 'ar' }, 'radio', 1500, { id: 'c1', radio: { distanciaKm: 1.5, freqGHz: 0.9, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'tel-represa', porta: 'ar' }, { equip: S2, porta: 'ar' }, 'radio', 2500, { id: 'c2', radio: { distanciaKm: 2.5, freqGHz: 0.9, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'tel-coop', porta: 'ar' }, { equip: 'setor-3', porta: 'ar' }, 'radio', 1000, { id: 'c3', radio: { distanciaKm: 1, freqGHz: 0.9, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'setor-1', porta: 'lan' }, { equip: 'controlador', porta: 'p1' }, 'cat6', 40, { id: 'c4' });
    ligar(m, { equip: S2, porta: 'lan' }, { equip: 'controlador', porta: 'p2' }, 'cat6', 40, { id: 'c5' });
    ligar(m, { equip: 'setor-3', porta: 'lan' }, { equip: 'controlador', porta: 'p3' }, 'cat6', 40, { id: 'c6' });
    m.proxCabo = 7;
    return m;
  },
  objetivo: (m) => [
    radioOk(m, 'c1', -65, 'telefone da escola associado ao setor 1'),
    radioOk(m, 'c2', -65, 'telefone da represa associado ao setor 2'),
    radioOk(m, 'c3', -65, 'telefone da cooperativa associado ao setor 3'),
    ...todasRespondidas(m, p53),
  ],
  posMorte: [
    'O setor 2 estava em 0°, olhando para a escola junto com o setor 1, e a represa ficava 120° fora do feixe de 65°. Virado para 120°, o telefone da represa chegou perto de -60,5 dBm, a 2,5 km. O da escola ficou perto de -56 dBm e o da cooperativa perto de -52,5 dBm.',
    'Com dois setores olhando para o mesmo lado, a escola teria duas fontes na mesma região e a represa nenhuma. Setorizar é dividir a célula em fatias que não se pisam, cada uma com o seu grupo de frequências: é o mesmo raciocínio do reuso, só que dentro da torre.',
    'As contas mostram por que o GSM ganhou: 21 portadoras em grupos de 7 dão 3 por célula, e o TDMA põe 8 conversas em cada uma, 24 ligações por célula. No 1G, cada conversa era um canal de frequência inteiro, aberto para qualquer rádio ouvir.',
  ],
  passos: [
    passo({ alvo: ['equip', S2], acao: 'mostra', instrucao: 'No setor 2 da estação base, veja o enlace com o telefone da represa.', porque: 'Cada setor cobre uma fatia de 120° da célula, mas a antena tem feixe de 65°: precisa estar bem apontada para o centro da sua fatia.', feito: 'Rumo para a represa: 120°. Antena em 0°, a mesma direção do setor 1. O telefone nem associa.' }),
    passo({
      alvo: ['equip', S2],
      acao: 'antena',
      pedir: ['azimute'],
      valores: { altura: '30' },
      exemplo: { azimute: '120' },
      instrucao: 'Gire a antena do setor 2 para a represa.',
      porque: 'O azimute é medido a partir do norte, no sentido do relógio. O setor 2 precisa apontar para o rumo que o mostra indicou.',
      conferir: (m) => {
        const c = m.cabos.get('c2')!;
        const d = radioDados(m, c);
        return (avaliar(m, c).up && d.rssi >= -65) || `RSSI de ${d.rssi.toFixed(1)} dBm. O rumo até a represa é 120°.`;
      },
      feito: 'RSSI perto de -60,5 dBm: o telefone da represa associou. Agora os três setores cobrem três fatias diferentes da célula.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Repartir as portadoras num grupo de células vizinhas, sem repetir, e repetir o grupo mais adiante',
          'Pôr todas as portadoras em todas as células, para ter o máximo em cada uma',
          'Dar uma portadora exclusiva para cada assinante da cidade',
          'Usar uma célula só, gigante, com todas as portadoras',
        ],
        certa: 0,
        errada: {
          1: 'Células vizinhas na mesma frequência se atropelam na borda, justamente onde o aparelho mais precisa de sinal.',
          2: 'Não há espectro para isso, e quase todas ficariam paradas a maior parte do tempo.',
          3: 'Uma célula só divide as mesmas portadoras com a região inteira. Células pequenas reaproveitam a mesma frequência muitas vezes.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Como a operadora reparte as frequências entre as células da região?',
      porque: 'O espectro é pequeno e caro. A saída é reaproveitar cada frequência onde ela não é mais ouvida.',
      feito: 'Reuso de frequência. Quanto menor o grupo e menores as células, mais vezes a mesma frequência trabalha, desde que as cópias fiquem longe o bastante.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '3' }, instrucao: 'Com 21 portadoras em grupos de 7 células, quantas ficam em cada célula?', porque: 'As 21 são repartidas entre as 7 células do grupo, sem repetir dentro dele.', feito: '21 ÷ 7 = 3. O preço de não interferir é cada célula ficar com um sétimo do espectro.' }),
    passo({ pergunta: '2', exemplo: { resposta: '24' }, instrucao: 'Cada portadora GSM tem 8 intervalos de tempo. Quantas ligações simultâneas cabem na célula?', porque: 'O TDMA põe um aparelho em cada intervalo do quadro: 8 por portadora.', feito: '3 × 8 = 24 ligações, antes de descontar os intervalos dos canais de controle. No 1G, as mesmas 3 portadoras dariam bem menos conversas por hertz.' }),
    passo({
      escolha: {
        opcoes: [
          'Chama o aparelho em todas as células da área onde ele se registrou por último (paging)',
          'Faz handoff do aparelho para todas as células ao mesmo tempo',
          'Pergunta ao cartão SIM onde ele está, por mensagem de texto',
          'Espera o aparelho ligar para a rede primeiro',
        ],
        certa: 0,
        errada: {
          1: 'Handoff é passar uma ligação que já existe para a célula vizinha. Aqui ainda não há ligação: é preciso achar o aparelho.',
          2: 'A rede não consegue mandar nada para o aparelho antes de saber em que célula ele está. Esse é justamente o problema.',
          3: 'Assim ninguém receberia ligação nunca. A rede sabe a área de registro e procura ali.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Alguém liga para o telefone da represa, parado na casa de máquinas. Como a rede encontra o aparelho?',
      porque: 'Parado, o aparelho só avisa a rede quando muda de área. A rede sabe a área, não a célula.',
      feito: 'Paging pelos canais de controle: todas as células da área chamam, e o aparelho responde pela sua.',
    }),
    passo({ pergunta: '3', exemplo: { resposta: 'SIM' }, instrucao: 'Como se chama o cartão que guarda a identidade do assinante?', porque: 'No GSM, a identidade não mora no aparelho: mora num cartão que passa de um telefone para outro.', feito: 'O cartão SIM. Com ele, a central de comutação móvel sabe quem é você, não importa em que aparelho.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Células e reuso em grupos de 7',
        texto: ['As portadoras são repartidas entre 7 células vizinhas (A a G), sem repetir. Adiante, o grupo se repete: a célula A de lá usa as mesmas portadoras da A de cá.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'A', x: 300, y: 110 },
            { id: 'b', rotulo: 'B', x: 300, y: 30 },
            { id: 'c', rotulo: 'C', x: 390, y: 70 },
            { id: 'd', rotulo: 'D', x: 390, y: 150 },
            { id: 'e', rotulo: 'E', x: 300, y: 190 },
            { id: 'f', rotulo: 'F', x: 210, y: 150 },
            { id: 'g', rotulo: 'G', x: 210, y: 70 },
            { id: 'a2', rotulo: 'A de novo', x: 560, y: 110 },
          ],
          ligacoes: [
            ['a', 'b'],
            ['a', 'c'],
            ['a', 'd'],
            ['a', 'e'],
            ['a', 'f'],
            ['a', 'g'],
            ['d', 'a2', 'longe: reusa as de A'],
          ],
        },
      },
      {
        titulo: 'Handoff e paging',
        texto: ['Handoff: a ligação em andamento passa para a célula vizinha quando o sinal de lá fica melhor. Paging: para achar um aparelho parado, a rede chama em todas as células da área de registro.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'x', rotulo: 'célula da escola', x: 110, y: 60 },
            { id: 'y', rotulo: 'célula da represa', x: 480, y: 60 },
            { id: 'z', rotulo: 'célula da cooperativa', x: 300, y: 190 },
          ],
          ligacoes: [
            ['x', 'y', 'handoff: o carro na estrada'],
            ['x', 'z', 'paging: mesma área'],
            ['y', 'z', 'paging: mesma área'],
          ],
        },
      },
      {
        titulo: 'Do 1G ao GSM',
        texto: ['A 1G dava um canal de frequência inteiro para cada conversa. A 2G digitalizou a voz e, no GSM, dividiu cada portadora no tempo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', '1G', 'GSM (2G)'],
          linhas: [
            ['voz', 'analógica', 'digital, comprimida'],
            ['divisão do espectro', 'FDMA: um canal por conversa', 'FDMA + TDMA: portadoras de 200 kHz, 8 intervalos cada'],
            ['em 1,2 MHz', '40 canais de 30 kHz', '6 portadoras × 8 = 48 intervalos'],
            ['sigilo', 'qualquer rádio ouve', 'cifrado no ar'],
            ['identidade', 'presa ao aparelho', 'no cartão SIM'],
          ],
        },
      },
      {
        titulo: 'O quadro TDMA',
        texto: ['Cada portadora GSM repete um quadro de 8 intervalos. Cada aparelho fala só no seu, e o rádio da estação base atende os 8 em turnos, na mesma frequência.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Intervalo', '0', '1', '2', '3', '4', '5', '6', '7'],
          linhas: [
            ['quadro 1', 'controle', 'tel. A', 'tel. B', 'tel. C', 'tel. D', 'tel. E', 'tel. F', 'tel. G'],
            ['quadro 2', 'controle', 'tel. A', 'tel. B', 'tel. C', 'tel. D', 'tel. E', 'tel. F', 'tel. G'],
          ],
        },
      },
      {
        titulo: 'A arquitetura do GSM',
        texto: ['O aparelho com o SIM fala com a estação base. O controlador gerencia os rádios de várias estações e decide o handoff entre elas. A central de comutação móvel encaminha as ligações e sabe quem é cada assinante e onde ele está.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'aparelho + SIM', x: 60, y: 110 },
            { id: 'e', rotulo: 'estação base', x: 210, y: 110 },
            { id: 'c', rotulo: 'controlador de estações', x: 380, y: 110 },
            { id: 'm', rotulo: 'central de comutação móvel', x: 560, y: 110 },
          ],
          ligacoes: [
            ['a', 'e', 'ar (TDMA)'],
            ['e', 'c', 'cabo'],
            ['c', 'm', 'cabo'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Uma operadora quer atender o dobro de gente na mesma região, sem ganhar espectro novo. Qual o caminho?',
      opcoes: [
        'Células menores: com mais células, cada portadora é reaproveitada mais vezes na mesma área',
        'Aumentar a potência das estações para cobrir mais longe',
        'Pôr todas as portadoras em todas as células',
        'Voltar para o FDMA do 1G',
      ],
      certa: 0,
      explicacao: 'A capacidade vem do reuso. Células menores repetem o grupo de frequências mais vezes no mesmo território. Potência maior faz o contrário: espalha a interferência para longe e obriga as cópias a ficarem mais distantes.',
    },
  },
  desafio: {
    carta: [
      'Carta de um motorista do ônibus da represa: "a ligação cai sempre na mesma curva. Já testei com três celulares, dois chips e uma reza. Cai do mesmo jeito."',
      'Na curva, o telefone ainda ouve a estação do centro, a 4 km, no limite. A estação nova da represa, a 3 km, devia pegar a ligação ali, mas a antena dela foi montada olhando para o lado da serra.',
      'Objetivo: o telefone de teste da curva associado às duas estações com RSSI de -70 dBm ou melhor, para o handoff ter para onde ir, e as três perguntas respondidas.',
    ],
    dicas: [
      'O handoff só acontece se a célula vizinha também ouvir o aparelho. Veja o enlace da erb-represa.',
      'O rumo da erb-represa até a curva é 300°. A antena está em 200°.',
      'Antena da erb-represa em 300°. Respostas: 1200 ÷ 30 = 40; 1200 ÷ 200 = 6 portadoras, × 8 = 48; handoff.',
    ],
    perguntas: d53,
    montar: () => {
      const m = novoMundo(1553);
      adicionar(m, radio('erb-centro', 'Estação base do centro, setor de 65° e 17 dBi, 900 MHz', { ganho: 17, azimute: 90, azimuteCerto: 90, altura: 30, feixe: 65 }, 90));
      adicionar(m, radio('erb-represa', 'Estação base nova da represa, setor de 65° e 17 dBi, 900 MHz', { ganho: 17, azimute: 200, azimuteCerto: 300, altura: 30, feixe: 65 }, 300));
      adicionar(
        m,
        radio('tel-curva', 'Telefone de teste preso no poste da curva da represa (antena interna de 2 dBi, 900 MHz)', { ganho: 2, azimute: 0, azimuteCerto: 0, altura: 10, feixe: 360 }, 270, [
          { nome: 'ar1', fisica: 'antena' },
          { nome: 'ar2', fisica: 'antena' },
        ]),
      );
      ligar(m, { equip: 'tel-curva', porta: 'ar1' }, { equip: 'erb-centro', porta: 'ar' }, 'radio', 4000, { id: 'c1', radio: { distanciaKm: 4, freqGHz: 0.9, obstaculoM: 0, ptxDbm: 20 } });
      ligar(m, { equip: 'tel-curva', porta: 'ar2' }, { equip: 'erb-represa', porta: 'ar' }, 'radio', 3000, { id: 'c2', radio: { distanciaKm: 3, freqGHz: 0.9, obstaculoM: 0, ptxDbm: 20 } });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => [radioOk(m, 'c1', -70, 'telefone da curva ouvindo a erb-centro'), radioOk(m, 'c2', -70, 'telefone da curva ouvindo a erb-represa'), ...todasRespondidas(m, d53)],
    solucao: [
      ['equip', 'erb-represa', 'mostra'],
      ['equip', 'erb-represa', 'antena', { azimute: '300', altura: '30' }],
    ],
    respostas: { '1': '40', '2': '48', '3': 'handoff' },
  },
};

export const ATO1D: Dia[] = [dia51, dia52, dia53];
