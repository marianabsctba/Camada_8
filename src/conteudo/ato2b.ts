// Dias novos do ato 2 (A Linha), com prática guiada, aula e desafio no próprio dia.
// Os serviços do enlace (3.1.1), o controle de erros e de fluxo (3.1.3 e 3.1.4) e o enlace do ADSL e do cabo (3.5.2 e 3.5.3).

import { simularArq, type ConfigArq, type Linha, type ResultadoArq } from '../motor/arq';
import { transmitir, type ConfigEnlace, type ErroLinha, type ResultadoEnlace } from '../motor/enlace';
import { adicionar, aparelho, ligar, novoMundo, type Mundo } from '../motor/mundo';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes (cópia dos de ato2.ts) ---------- */

function cargas(n: number, tamanho: number, semente: number): number[][] {
  const out: number[][] = [];
  let x = semente;
  for (let i = 0; i < n; i++) {
    const q: number[] = [];
    for (let j = 0; j < tamanho; j++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      let b = (x >> 16) & 0xff;
      if (b === 0x7e || b === 0x7d) b = 0x55; // os bytes especiais só entram de propósito
      q.push(b);
    }
    out.push(q);
  }
  return out;
}

function par(m: Mundo, modelo: string, s: Record<string, unknown>) {
  const a = adicionar(m, aparelho('ctl-a', 'enlace', modelo, [{ nome: 'linha', fisica: 'antena' }], s));
  const b = adicionar(m, aparelho('ctl-b', 'enlace', modelo, [{ nome: 'linha', fisica: 'antena' }], {}));
  for (const e of [a, b]) e.antena = { ganho: 23, azimute: 0, azimuteCerto: 0, altura: 20, feixe: 9 };
  ligar(m, { equip: a.nome, porta: 'linha' }, { equip: b.nome, porta: 'linha' }, 'radio', 12000, { id: 'c1', radio: { distanciaKm: 0.05, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
  m.proxCabo = 2;
  return a;
}

const cfg = (c: Partial<ConfigEnlace> = {}): ConfigEnlace => ({ enquadramento: 'flags', enchimento: true, deteccao: 'crc32', correcao: 'nenhuma', ...c });
const arq = (c: Partial<ConfigArq>): ConfigArq => ({ protocolo: 'pare-e-espere', janela: 1, bitsSeq: 1, timeoutMs: 1000, ...c });

const ctl = (m: Mundo) => m.equipamentos.get('ctl-a')!.s;
const ultimoEnlace = (m: Mundo) => m.flags.ultimoEnlace as ResultadoEnlace | undefined;
const ultimoArq = (m: Mundo) => m.flags.ultimoArq as ResultadoArq | undefined;

/** A última transmissão foi feita com a configuração que está no controlador agora. */
const transmitiuAgora = (m: Mundo) => !!ultimoEnlace(m) && m.flags.cfgDoUltimo === JSON.stringify(ctl(m).cfg);
/** A última transferência foi feita com a configuração que está no controlador agora. */
const transferiuAgora = (m: Mundo) => !!ultimoArq(m) && m.flags.arqDoUltimo === JSON.stringify(ctl(m).arq);

/** Transferência completa: todos os quadros entregues, na ordem, sem nenhum errado. */
const completa = (r: ResultadoArq) => r.concluiu && r.entreguesErrados === 0 && r.entreguesCertos === r.quadros;

/** Janela que a numeração aguenta: 2^n - 1 no go-back-N, 2^(n-1) na seletiva. */
const janelaSegura = (a: ConfigArq) => (a.protocolo === 'seletiva' ? a.janela <= 2 ** (a.bitsSeq - 1) : a.protocolo === 'go-back-n' ? a.janela <= 2 ** a.bitsSeq - 1 : true);

const doCtl = (acao: string, extra: Partial<Passo> = {}): Partial<Passo> => ({ alvo: ['equip', 'ctl-a'], acao, ...extra });
const doCpe = (acao: string, extra: Partial<Passo> = {}): Partial<Passo> => ({ alvo: ['equip', 'cpe'], acao, ...extra });

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

/** Número com vírgula decimal, para os textos. */
const br = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');

const transmitirOk = (cond: (r: ResultadoEnlace) => true | string) => (m: Mundo) => {
  const r = ultimoEnlace(m);
  return r ? cond(r) : 'A transmissão não aconteceu.';
};

const transferirOk = (cond: (r: ResultadoArq, a: ConfigArq) => true | string) => (m: Mundo) => {
  const r = ultimoArq(m);
  return r ? cond(r, ctl(m).arq as ConfigArq) : 'A transferência não aconteceu.';
};

const semRng = () => 0;

/* ======================================================================
 * ref 57: O que o enlace promete (3.1.1)
 * ====================================================================== */

const CARGAS57 = cargas(10, 32, 57);
const ERROS57: ErroLinha[] = [
  { quadro: 1, bits: [12] },
  { quadro: 4, bits: [40] },
  { quadro: 7, bits: [90] },
];
const LINHA57: Linha = { taxaBps: 64_000, propagacaoMs: 2, bytesQuadro: 100, perdasDados: [1, 5, 9] };
const ARQ57 = arq({ timeoutMs: 100 });
const R57 = transmitir(CARGAS57, cfg(), ERROS57);
const A57 = simularArq(ARQ57, LINHA57, 10, semRng);

const p57: Pergunta[] = [
  numerica('1', 'No teste sem confirmação, quantos dos 10 quadros chegaram certos à camada de rede?', R57.corretos, 0),
  numerica('2', 'Na transferência com confirmação, quantas retransmissões o controlador fez?', A57.retransmissoes, 0),
];

const CARGAS57D = cargas(12, 24, 5757);
const ERROS57D: ErroLinha[] = [
  { quadro: 0, bits: [5] },
  { quadro: 3, bits: [33] },
  { quadro: 6, bits: [70] },
  { quadro: 10, bits: [100] },
];
const LINHA57D: Linha = { taxaBps: 128_000, propagacaoMs: 1, bytesQuadro: 200, perdasDados: [0, 4, 8, 13] };
const ARQ57D = arq({ timeoutMs: 60 });
const R57D = transmitir(CARGAS57D, cfg(), ERROS57D);
const A57D = simularArq(ARQ57D, LINHA57D, 12, semRng);

const d57: Pergunta[] = [
  numerica('1', 'Sem confirmação, quantas das 12 receitas chegaram certas ao sistema da farmácia?', R57D.corretos, 0),
  numerica('2', 'Com confirmação, quantas retransmissões o enlace precisou fazer?', A57D.retransmissoes, 0),
];

const dia57: Dia = {
  numero: 57,
  ato: 2,
  titulo: 'O que o enlace promete',
  chamado: [
    'CHAMADO #0057',
    'A prefeitura entregou a chave da central telefônica antiga, com mesas de operadora, poeira de três décadas e um rádio de dados novo ligando a central à escola do distrito.',
    'O controlador do rádio manda os quadros e nunca pergunta se chegaram. A diretora jura que de cada dez avisos da secretaria, três somem no caminho, e ninguém sabe quais.',
    'Objetivo: medir o que chega sem confirmação, transferir os 10 quadros com confirmação, todos certos e na ordem, e responder as duas perguntas.',
  ],
  manual: {
    titulo: 'Os serviços que o enlace oferece à camada de rede',
    texto: [
      'A camada de enlace trabalha para a camada de rede: recebe um pacote, embrulha num quadro e leva até a outra ponta do fio, do rádio ou da fibra. O que ela promete nessa entrega muda de um enlace para outro, e cabe em duas perguntas: ela confirma que o quadro chegou? Ela abre uma conexão antes de mandar?',
      'Serviço sem confirmação e sem conexão: o transmissor manda e esquece. Se o quadro chegar com erro, o receptor descarta, e ninguém pede de novo. Quem quiser recuperar a perda é uma camada de cima. Parece descuido, mas é o certo quando a linha quase não erra, como no Ethernet em cobre e fibra: confirmar cada quadro gastaria tempo à toa. Também serve para tráfego em tempo real, em que um dado atrasado vale menos que um dado perdido.',
      'Serviço com confirmação e sem conexão: cada quadro é confirmado (ACK) e, se a confirmação não vier, é mandado de novo. Não há conexão aberta: cada quadro vale por si. É o que faz o Wi-Fi, porque o ar erra muito. Confirmar no enlace corrige o erro no trecho em que ele aconteceu, em milissegundos, em vez de deixar a camada de transporte perceber lá na outra ponta, bem mais tarde.',
      'Serviço com confirmação e orientado a conexão: antes de mandar, os dois lados abrem uma conexão e preparam contadores e memória. Os quadros são numerados, cada um é entregue exatamente uma vez e na ordem certa, e no fim a conexão é liberada. São três fases: estabelecer, transferir e liberar. Faz sentido em enlaces longos e caros, como o de satélite, em que cada quadro perdido custa muito tempo para ser percebido.',
      'Confirmação não é de graça: cada ACK ocupa a linha de volta e cada espera atrasa o próximo quadro. Por isso a escolha depende da linha: quanto mais ela erra, mais vale confirmar ali mesmo.',
    ],
  },
  dicas: [
    'Comece pelo teste de quadros: ele manda sem confirmação nenhuma.',
    'Depois transfira o arquivo: a transferência usa confirmação e retransmissão.',
    `Sem confirmação chegam ${R57.corretos}; com confirmação, os 10 chegam, com ${A57.retransmissoes} retransmissões.`,
  ],
  perguntas: p57,
  montar: () => {
    const m = novoMundo(257);
    par(m, 'Controlador do rádio de dados da central CE-100', { cfg: cfg(), arq: { ...ARQ57 } });
    m.flags.cargas = CARGAS57.map((q) => [...q]);
    m.flags.erros = ERROS57;
    m.flags.linhaArq = LINHA57;
    m.flags.quadrosArq = 10;
    return m;
  },
  objetivo: (m) => {
    const e = ultimoEnlace(m);
    const r = ultimoArq(m);
    return [
      item('teste sem confirmação feito', transmitiuAgora(m), e ? `${e.corretos} de ${e.enviados} certos` : 'ainda não transmitiu'),
      item('transferência com confirmação: 10 de 10, na ordem, sem erro', transferiuAgora(m) && !!r && completa(r), r ? `${r.entreguesCertos} de ${r.quadros} certos` : 'ainda não transferiu'),
      ...todasRespondidas(m, p57),
    ];
  },
  posMorte: [
    `Sem confirmação, o CRC fez a parte dele: percebeu os ${R57.descartados} quadros atingidos e jogou fora. Só que ninguém pediu de novo. A camada de rede recebeu ${R57.corretos} de 10 e ficou sem saber dos outros, que é exatamente o que a diretora descreveu.`,
    `Com confirmação, cada quadro esperou o seu ACK. Os que se perderam ficaram sem resposta, o temporizador venceu e o controlador mandou de novo: ${A57.retransmissoes} retransmissões e os 10 avisos inteiros, em ${br(A57.tempoMs / 1000, 2)} s. O erro foi consertado no trecho onde aconteceu, sem incomodar ninguém lá em cima.`,
    'Não existe serviço melhor em tudo. Na fibra do galpão, confirmar cada quadro seria cerimônia à toa. No rádio da escola, é o que separa o aviso entregue do aviso sumido. No satélite até a cidade vizinha, vai valer abrir conexão e numerar tudo.',
  ],
  passos: [
    passo({ ...doCtl('transmitir'), instrucao: 'Mande os quadros de teste do jeito que o controlador faz hoje.', porque: 'O teste manda 10 quadros e não espera confirmação nenhuma: é o serviço sem confirmação e sem conexão, o mesmo do Ethernet. A linha vai errar em três deles.', conferir: transmitirOk((r) => r.descartados > 0 || 'A linha deveria ter errado em alguns quadros.'), feito: `${R57.corretos} certos e ${R57.descartados} descartados pelo CRC. Descartar não é recuperar: esses ${R57.descartados} simplesmente não existem para a camada de rede.` }),
    passo({ pergunta: '1', exemplo: { resposta: String(R57.corretos) }, instrucao: 'Quantos dos 10 quadros chegaram certos à camada de rede?', porque: 'Está na linha "chegaram certos" do resultado. Descartados e perdidos não contam: não foram entregues.', feito: `${R57.corretos}. O enlace cumpriu o que prometeu, que era pouco: entregar o que chegasse inteiro.` }),
    passo({
      escolha: {
        opcoes: [
          'O próprio enlace, confirmando cada quadro e mandando de novo o que não for confirmado',
          'Ninguém: perder três em dez é normal em rádio',
          'Só a camada de transporte, lá nas pontas da conversa',
          'A camada física, aumentando a potência até nada mais errar',
        ],
        certa: 0,
        errada: {
          1: 'Normal ou não, a diretora quer os avisos inteiros. E três em dez é muito para deixar por conta de quem está longe.',
          2: 'A camada de transporte acaba recuperando, mas só percebe a perda na outra ponta, bem mais tarde. Numa linha que erra tanto, consertar no trecho é bem mais rápido.',
          3: 'Potência ajuda até certo ponto, mas nenhuma linha de rádio fica sem erro. Alguém precisa recuperar o que se perde.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Essa linha perde três quadros em dez. Quem deveria recuperar os perdidos?',
      porque: 'Quanto mais a linha erra, mais vale corrigir ali mesmo, no trecho em que o erro acontece, em vez de esperar alguém lá na ponta perceber.',
      feito: 'O próprio enlace. É o serviço com confirmação: cada quadro espera o seu ACK, e o que não for confirmado vai de novo.',
    }),
    passo({ ...doCtl('transferir'), instrucao: 'Agora transfira os avisos com confirmação.', porque: 'A transferência usa pare e espere: manda um quadro, espera o ACK e, se o temporizador vencer antes, manda de novo. A linha vai perder três quadros, como antes.', conferir: transferirOk((r) => completa(r) || `Chegaram ${r.entreguesCertos} de ${r.quadros} certos.`), feito: `Os 10 avisos chegaram, na ordem, em ${br(A57.tempoMs / 1000, 2)} s.` }),
    passo({ pergunta: '2', exemplo: { resposta: String(A57.retransmissoes) }, instrucao: 'Quantas retransmissões o controlador fez?', porque: 'Está na linha "transmissões" do resultado, entre parênteses. Compare com o número de quadros que a linha perdeu.', feito: `${A57.retransmissoes}, uma para cada quadro perdido. Esse é o preço da confirmação: tempo de linha a mais, só quando há erro.` }),
    passo({
      escolha: {
        opcoes: [
          'Com confirmação e orientado a conexão: abrir a conexão, numerar os quadros e entregar cada um uma vez, na ordem',
          'Sem confirmação e sem conexão: o satélite é rápido, não precisa',
          'Com confirmação e sem conexão: cada quadro por si, sem ordem garantida',
          'Nenhum serviço: satélite é camada física pura',
        ],
        certa: 0,
        errada: {
          1: 'O satélite é tudo menos rápido na ida e volta: cada perda percebida lá em cima custa muito tempo. Deixar sem confirmação seria jogar isso para a ponta.',
          2: 'Funciona, mas com milhares de quadros a caminho num enlace longo, vale preparar a conexão: contadores, memória e a garantia de ordem e de nenhuma duplicata.',
          3: 'O satélite tem camada física, sim, mas por cima dela alguém precisa enquadrar, conferir e recuperar os quadros.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O enlace até a cidade vizinha vai ser por satélite: longo, caro e com milhares de quadros. Que serviço faz mais sentido?',
      porque: 'Em enlace longo, cada perda demora para ser percebida. Vale abrir uma conexão antes, com estado nos dois lados, para entregar tudo uma vez só e na ordem.',
      feito: 'Orientado a conexão: estabelecer, transferir e liberar. É o mais completo dos três, e o mais trabalhoso.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Três promessas',
        texto: ['A camada de enlace serve à camada de rede. O que ela promete cabe em duas perguntas: confirma? Abre conexão?'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Serviço', 'Confirma?', 'Conexão?', 'Exemplo', 'Faz sentido quando'],
          linhas: [
            ['sem confirmação, sem conexão', 'não', 'não', 'Ethernet', 'a linha quase não erra, ou o dado é em tempo real'],
            ['com confirmação, sem conexão', 'sim', 'não', 'Wi-Fi', 'a linha erra muito, como o ar'],
            ['com confirmação, orientado a conexão', 'sim', 'sim', 'enlaces longos, satélite', 'cada perda custa caro e a ordem importa'],
          ],
        },
      },
      {
        titulo: 'Mandar e esquecer',
        texto: [
          'Sem confirmação, o quadro com erro é descartado pelo receptor e pronto. Ninguém pede de novo. Se a camada de cima se importar, ela que recupere.',
          'Na fibra, que quase nunca erra, é o certo. No rádio da escola, foram três avisos sumidos em dez.',
        ],
        visual: { tipo: 'bits', antes: 'Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8 Q9 Q10', depois: 'Q1 __ Q3 Q4 __ Q6 Q7 __ Q9 Q10', legenda: 'Sem confirmação: o que se perde, se perdeu' },
      },
      {
        titulo: 'Confirmar cada quadro',
        texto: [
          'Com confirmação, o receptor responde com um ACK para cada quadro que chegou inteiro. Sem ACK, o temporizador do transmissor vence e o quadro vai de novo.',
          'Não há conexão: cada quadro é tratado por si. O Wi-Fi faz assim porque o ar erra demais para deixar a recuperação para depois.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'Central', x: 90, y: 120 },
            { id: 'b', rotulo: 'Escola', x: 510, y: 120 },
          ],
          ligacoes: [
            ['a', 'b', 'quadro'],
            ['b', 'a', 'ACK'],
          ],
        },
      },
      {
        titulo: 'Abrir, transferir, liberar',
        texto: [
          'No serviço orientado a conexão, os dois lados combinam antes: preparam contadores e memória. Os quadros vão numerados, cada um entregue uma vez só e na ordem. No fim, a conexão é liberada e os recursos voltam.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'e', rotulo: 'estabelecer', x: 100, y: 120 },
            { id: 't', rotulo: 'transferir', x: 300, y: 120 },
            { id: 'l', rotulo: 'liberar', x: 500, y: 120 },
          ],
          ligacoes: [
            ['e', 't', 'contadores prontos'],
            ['t', 'l', 'tudo confirmado'],
          ],
        },
      },
      {
        titulo: 'Corrigir no trecho',
        texto: [
          'Confirmar no enlace custa ACKs e espera. Em troca, o erro é consertado onde aconteceu, em milissegundos, e não lá na ponta, depois de o pacote cruzar a cidade inteira.',
          'Na linha da escola, o resultado foi este:',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Serviço', 'Chegaram certos', 'Retransmissões'],
          linhas: [
            ['sem confirmação', `${R57.corretos} de 10`, '0'],
            ['com confirmação', '10 de 10', String(A57.retransmissoes)],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O enlace de fibra entre o galpão e a prefeitura quase nunca erra. Que serviço de enlace faz mais sentido nele?',
      opcoes: ['Sem confirmação e sem conexão', 'Com confirmação e sem conexão', 'Com confirmação e orientado a conexão', 'Tanto faz: todos custam o mesmo'],
      certa: 0,
      explicacao: 'Se a linha quase não erra, confirmar cada quadro só gasta ACK e espera. O raro quadro perdido fica para uma camada de cima recuperar. É a escolha do Ethernet.',
    },
  },
  desafio: {
    carta: [
      'O posto de saúde do distrito manda as receitas para a farmácia municipal por um rádio velho que erra feito telefone sem fio. Hoje de manhã, quatro pessoas chegaram ao balcão com receita que o sistema da farmácia nunca recebeu.',
      'O controlador só sabe mandar e esquecer, mas tem retransmissão de fábrica, nunca usada.',
      'Objetivo: medir as receitas que chegam sem confirmação, transferir as 12 com confirmação, todas certas e na ordem, e responder as duas perguntas.',
    ],
    dicas: [
      'O teste de quadros mostra o serviço sem confirmação; a transferência mostra o serviço com confirmação.',
      'As respostas estão nas linhas "chegaram certos" e "retransmissões" de cada resultado.',
    ],
    perguntas: d57,
    respostas: { '1': String(R57D.corretos), '2': String(A57D.retransmissoes) },
    montar: () => {
      const m = novoMundo(2557);
      par(m, 'Controlador do rádio do posto de saúde CE-100', { cfg: cfg(), arq: { ...ARQ57D } });
      m.flags.cargas = CARGAS57D.map((q) => [...q]);
      m.flags.erros = ERROS57D;
      m.flags.linhaArq = LINHA57D;
      m.flags.quadrosArq = 12;
      return m;
    },
    objetivo: (m) => {
      const e = ultimoEnlace(m);
      const r = ultimoArq(m);
      return [
        item('teste sem confirmação feito', !!e, e ? `${e.corretos} de ${e.enviados} certos` : 'ainda não transmitiu'),
        item('transferência com confirmação: 12 de 12, na ordem, sem erro', transferiuAgora(m) && !!r && completa(r), r ? `${r.entreguesCertos} de ${r.quadros} certos` : 'ainda não transferiu'),
        ...todasRespondidas(m, d57),
      ];
    },
    solucao: [
      ['equip', 'ctl-a', 'transmitir'],
      ['equip', 'ctl-a', 'transferir'],
    ],
  },
};

/* ======================================================================
 * ref 58: Erro e fluxo (3.1.3 e 3.1.4)
 * ====================================================================== */

const LINHA58: Linha = { taxaBps: 256_000, propagacaoMs: 4, bytesQuadro: 500, perdasDados: [5], perdasAck: [2] };
const ARQ58 = arq({ bitsSeq: 0, timeoutMs: 3000 });
const A58_INICIO = simularArq(ARQ58, LINHA58, 20, semRng);
const A58_FIM = simularArq(arq({ protocolo: 'go-back-n', janela: 4, bitsSeq: 3, timeoutMs: 50 }), LINHA58, 20, semRng);
/** Ida e volta: transmitir o quadro mais a propagação de ida e a do ACK. */
const IDA_VOLTA58 = ((LINHA58.bytesQuadro * 8) / LINHA58.taxaBps) * 1000 + 2 * LINHA58.propagacaoMs;
const MEMORIA58 = 4;

const p58: Pergunta[] = [numerica('1', 'Quanto tempo leva a ida e volta: transmitir um quadro de 500 bytes a 256 kb/s mais 4 ms para ir e 4 ms para o ACK voltar? (em ms)', IDA_VOLTA58, 0.05)];

const LINHA58D: Linha = { taxaBps: 512_000, propagacaoMs: 10, bytesQuadro: 500, perdasDados: [3, 11] };
const ARQ58D = arq({ protocolo: 'go-back-n', janela: 6, bitsSeq: 3, timeoutMs: 15 });
const IDA_VOLTA58D = ((LINHA58D.bytesQuadro * 8) / LINHA58D.taxaBps) * 1000 + 2 * LINHA58D.propagacaoMs;
const A58D_INICIO = simularArq(ARQ58D, LINHA58D, 30, semRng);
const MEMORIA58D = 2;
const MAX_RETX58D = 6;

const d58: Pergunta[] = [numerica('1', 'Quanto tempo leva a ida e volta: transmitir um quadro de 500 bytes a 512 kb/s mais 10 ms para ir e 10 ms para o ACK voltar? (em ms)', IDA_VOLTA58D, 0.05)];

const dia58: Dia = {
  numero: 58,
  ato: 2,
  titulo: 'Erro e fluxo',
  chamado: [
    'CHAMADO #0058',
    'No porão da central mora um modem de dados que liga a central ao arquivo da prefeitura. Ontem ele levou mais de seis segundos para mandar 20 quadros de um decreto, e o decreto chegou com um parágrafo repetido e o resto deslocado.',
    `Do outro lado, o modem do arquivo é velho e só tem memória para ${MEMORIA58} quadros de cada vez. Quem configurou o controlador desligou o número de sequência "para sobrar espaço" e pôs um temporizador de 3 s "para não apressar ninguém".`,
    `Objetivo: o decreto inteiro, sem erro, em menos de 1 s, com número de sequência, temporizador acima da ida e volta e janela de 2 a ${MEMORIA58} quadros, e a pergunta respondida.`,
  ],
  manual: {
    titulo: 'Controle de erros e controle de fluxo',
    texto: [
      'Controle de erros é o conjunto de ferramentas que garante que cada quadro chega uma vez e na ordem. A primeira é a confirmação: o receptor responde com uma confirmação positiva (ACK) quando o quadro chega inteiro. Alguns protocolos também usam a confirmação negativa (NAK): quando o receptor percebe um buraco ou um erro, avisa na hora, sem esperar o transmissor desconfiar.',
      'A segunda ferramenta é o temporizador. E se o quadro sumir inteiro, ou o ACK se perder na volta? Ninguém vai avisar. Por isso o transmissor liga um temporizador ao mandar cada quadro; se ele vencer sem ACK, o quadro vai de novo. O temporizador precisa ser maior que a ida e volta (transmitir o quadro, ele chegar e o ACK voltar), senão o transmissor repete à toa. Grande demais, cada perda deixa a linha parada esperando.',
      'A terceira é o número de sequência. Se o ACK se perde, o transmissor repete um quadro que já tinha chegado. Sem número, o receptor não tem como saber que é repetido e entrega duas vezes. Com número, ele reconhece, descarta e só manda o ACK de novo.',
      'Controle de fluxo é outro problema: o transmissor rápido não pode afogar um receptor lento. Quadro que chega sem lugar na memória é jogado fora, mesmo tendo chegado perfeito. Há dois jeitos de evitar isso. No controle por retorno, o receptor diz ao transmissor quanto ele aguenta, e o transmissor obedece. No controle por taxa, o próprio protocolo limita a velocidade de envio, sem ouvir o receptor.',
      'O controle por retorno mais comum é a janela: o transmissor pode ter no máximo tantos quadros a caminho sem ACK. Se o receptor só guarda 4 quadros, a janela de 4 garante que ele nunca recebe mais do que cabe. A mesma janela que controla o fluxo também deixa a linha trabalhar sem parar a cada quadro.',
    ],
  },
  dicas: [
    'Transfira primeiro e leia o resultado: quadros errados e tempo total contam histórias diferentes.',
    'Quadro repetido pede número de sequência. Linha parada pede temporizador menor, mas acima da ida e volta.',
    `Bits de sequência 1, timeout de 50 ms, depois go-back-N com janela ${MEMORIA58} e 3 bits, e transfira de novo.`,
  ],
  perguntas: p58,
  montar: () => {
    const m = novoMundo(258);
    par(m, 'Controlador do modem de dados da central MD-58', { arq: { ...ARQ58 } });
    m.flags.linhaArq = LINHA58;
    m.flags.quadrosArq = 20;
    return m;
  },
  objetivo: (m) => {
    const a = ctl(m).arq as ConfigArq;
    const r = ultimoArq(m);
    const janelaOk = a.protocolo !== 'pare-e-espere' && a.janela >= 2 && a.janela <= MEMORIA58 && janelaSegura(a);
    return [
      item('número de sequência ligado', a.bitsSeq >= 1, `${a.bitsSeq} bits`),
      item(`temporizador acima da ida e volta (${br(IDA_VOLTA58, 3)} ms)`, a.timeoutMs > IDA_VOLTA58, `${a.timeoutMs} ms`),
      item(`janela de 2 a ${MEMORIA58} quadros, o que o modem do arquivo aguenta`, janelaOk, `${a.protocolo}, janela ${a.protocolo === 'pare-e-espere' ? 1 : a.janela}, ${a.bitsSeq} bits`),
      item('decreto inteiro, sem erro, em menos de 1 s', transferiuAgora(m) && !!r && completa(r) && r.tempoMs < 1000, r ? `${r.entreguesCertos} de ${r.quadros} certos em ${br(r.tempoMs / 1000, 2)} s` : 'ainda não transferiu'),
      ...todasRespondidas(m, p58),
    ];
  },
  posMorte: [
    `O ACK do terceiro quadro se perdeu na volta. Sem número de sequência, o quadro repetido entrou no decreto como se fosse novo, e daí em diante tudo ficou deslocado: só ${A58_INICIO.entreguesCertos} quadros no lugar certo. E cada perda esperou 3 s de temporizador, numa linha em que a ida e volta leva ${br(IDA_VOLTA58, 3)} ms: ${br(A58_INICIO.tempoMs / 1000, 2)} s para 20 quadros.`,
    `Com 1 bit de sequência, o repetido foi reconhecido e descartado. Com o temporizador de 50 ms, perto de duas vezes a ida e volta, as perdas passaram a custar quase nada. E com a janela de ${MEMORIA58}, o transmissor deixou de parar a cada quadro sem nunca mandar mais do que o modem do arquivo consegue guardar: ${br(A58_FIM.tempoMs / 1000, 2)} s.`,
    'O controlador desta central só conhece o temporizador. Com confirmação negativa, o receptor avisaria do buraco assim que chegasse o quadro seguinte, e a recuperação seria ainda mais rápida. Muitos enlaces fazem os dois: NAK para avisar cedo e temporizador para quando nem o NAK chega.',
  ],
  passos: [
    passo({ ...doCtl('transferir'), instrucao: 'Transfira o decreto do jeito que está configurado.', porque: 'Na linha, um quadro de dados vai se perder e um ACK vai sumir na volta. Veja o que o controlador faz com cada coisa.', feito: `${A58_INICIO.entreguesErrados} quadros entregues errados e ${br(A58_INICIO.tempoMs / 1000, 2)} s de transferência. Dois problemas diferentes no mesmo resultado.` }),
    passo({ ...doCtl('bits-seq'), pedir: ['n'], exemplo: { n: '1' }, instrucao: 'Ligue o número de sequência.', porque: 'Quando o ACK se perde, o transmissor repete um quadro que já tinha chegado. Sem número, o receptor não tem como reconhecer o repetido. Com 1 bit, os quadros alternam 0 e 1, e um quadro com o mesmo número do anterior é repetido.', conferir: (m) => (ctl(m).arq.bitsSeq >= 1 ? true : 'Com 0 bits, os quadros continuam sem número.'), feito: 'Número de sequência ligado. O repetido vai ser reconhecido, descartado e respondido só com o ACK.' }),
    passo({ pergunta: '1', exemplo: { resposta: br(IDA_VOLTA58, 3) }, instrucao: 'Calcule a ida e volta da linha, em ms.', porque: 'Transmitir 500 bytes a 256 kb/s leva 4000 bits ÷ 256.000 b/s. Some 4 ms para o quadro chegar e 4 ms para o ACK voltar.', feito: `${br(IDA_VOLTA58, 3)} ms. Antes disso, o ACK não tem como ter chegado; muito depois disso, é certo que se perdeu.` }),
    passo({
      ...doCtl('timeout'),
      pedir: ['ms'],
      exemplo: { ms: '50' },
      instrucao: 'Ajuste o temporizador.',
      porque: 'Ele precisa ser maior que a ida e volta, com uma folga, mas não muito maior: cada perda deixa a linha parada até ele vencer.',
      conferir: (m) => {
        const t = ctl(m).arq.timeoutMs as number;
        if (t <= IDA_VOLTA58) return `${t} ms é menos que a ida e volta de ${br(IDA_VOLTA58, 3)} ms: o transmissor repetiria quadros que ainda estão a caminho.`;
        if (t > 200) return `${t} ms ainda deixa a linha parada um tempão a cada perda. Algo perto de duas vezes a ida e volta basta.`;
        return true;
      },
      feito: 'Temporizador acima da ida e volta, sem exagero.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Uma confirmação negativa (NAK) do quadro que faltou, sem esperar o temporizador',
          'Nada: só o temporizador pode avisar de uma perda',
          'O ACK do quadro que chegou, para o transmissor deduzir sozinho',
          'Um pedido para o transmissor diminuir a potência',
        ],
        certa: 0,
        errada: {
          1: 'O temporizador é a rede de segurança, mas o receptor já sabe da perda antes: chegou um quadro com número adiantado.',
          2: 'O ACK diz o que chegou, não o que faltou. O transmissor só desconfiaria quando o temporizador vencesse.',
          3: 'A potência é assunto da camada física. A perda já aconteceu, e alguém precisa pedir o quadro de novo.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O receptor esperava o quadro 5 e chegou o 6. O que ele pode mandar para acelerar a recuperação?',
      porque: 'Com números de sequência, o buraco fica evidente assim que chega o quadro seguinte. Dá para avisar na hora.',
      feito: 'Um NAK. É a confirmação negativa: avisa cedo, e o temporizador fica para quando nem o NAK chega. Este controlador não fala NAK, mas muitos falam.',
    }),
    passo({
      ...doCtl('protocolo'),
      pedir: ['p', 'janela', 'bits'],
      exemplo: { p: 'go-back-n', janela: String(MEMORIA58), bits: '3' },
      instrucao: `Use uma janela para controlar o fluxo: o modem do arquivo guarda ${MEMORIA58} quadros.`,
      porque: `Com janela, o transmissor manda vários quadros sem esperar o ACK de cada um, mas nunca mais do que a janela. Janela de ${MEMORIA58} é o que cabe na memória do outro lado. A numeração precisa dar para a janela: com 3 bits, o go-back-N vai até 7.`,
      conferir: (m) => {
        const a = ctl(m).arq as ConfigArq;
        if (a.protocolo === 'pare-e-espere') return 'Pare e espere tem janela 1, sempre: a linha para a cada quadro.';
        if (a.janela > MEMORIA58) return `Janela ${a.janela} manda mais do que os ${MEMORIA58} quadros que o modem do arquivo consegue guardar. O que sobrar é jogado fora lá.`;
        if (a.janela < 2) return 'Janela 1 é pare e espere com outro nome.';
        return janelaSegura(a) || `Com ${a.bitsSeq} bits, a numeração não dá para a janela ${a.janela}. Aumente os bits.`;
      },
      feito: `Janela de ${MEMORIA58}: controle de fluxo por retorno, porque quem dita o limite é o receptor.`,
    }),
    passo({ ...doCtl('transferir'), instrucao: 'Transfira o decreto de novo.', porque: 'A mesma linha, a mesma perda e o mesmo ACK sumido. Agora com número, temporizador e janela.', conferir: transferirOk((r) => (completa(r) && r.tempoMs < 1000) || `${r.entreguesCertos} de ${r.quadros} certos em ${br(r.tempoMs / 1000, 2)} s.`), feito: `O decreto inteiro, na ordem. Com janela ${MEMORIA58} e temporizador de 50 ms, ${br(A58_FIM.tempoMs / 1000, 2)} s em vez de ${br(A58_INICIO.tempoMs / 1000, 2)} s.` }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Positiva e negativa',
        texto: [
          'O ACK é a confirmação positiva: chegou inteiro. O NAK é a negativa: chegou com erro, ou faltou um. O NAK acelera, porque avisa antes de o transmissor desconfiar.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'Central', x: 90, y: 120 },
            { id: 'b', rotulo: 'Arquivo', x: 510, y: 120 },
          ],
          ligacoes: [
            ['a', 'b', 'quadros 4, 5 e 6'],
            ['b', 'a', 'ACK 4, NAK 5'],
          ],
        },
      },
      {
        titulo: 'O temporizador',
        texto: [
          'Quando o quadro some inteiro, ou o ACK some na volta, ninguém avisa nada. O temporizador é a rede de segurança: venceu sem ACK, manda de novo.',
          `Ele precisa passar da ida e volta: tempo de transmitir mais a propagação de ida e de volta. Na linha do arquivo, ${br(IDA_VOLTA58, 3)} ms.`,
        ],
        visual: { tipo: 'calculadora', formula: 'transmissao' },
      },
      {
        titulo: 'O número que reconhece o repetido',
        texto: [
          'Se o ACK se perde, o quadro vai de novo, e o receptor recebe duas vezes a mesma coisa. Com número de sequência, ele vê o número repetido, descarta e só reenvia o ACK.',
        ],
        visual: { tipo: 'bits', antes: 'Q Q Q Q Q', depois: '0 1 0 0 1', legenda: 'O segundo 0 seguido é o repetido: descarta' },
      },
      {
        titulo: 'O receptor lento',
        texto: [
          'Controle de fluxo protege o receptor. A janela limita quantos quadros podem estar a caminho sem ACK; se a memória do outro lado guarda 4, a janela é 4.',
          'Os quadros dentro da janela podem sair sem esperar. Os de fora esperam os ACKs chegarem e a janela andar.',
        ],
        visual: { tipo: 'janela', total: 12, janela: 4 },
      },
      {
        titulo: 'Por retorno ou por taxa',
        texto: ['Há dois jeitos de não afogar o receptor.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Controle de fluxo', 'Quem decide', 'Como'],
          linhas: [
            ['por retorno', 'o receptor', 'diz quanto aguenta, por exemplo com a janela, e o transmissor obedece'],
            ['por taxa', 'o protocolo', 'limita a velocidade de envio, sem ouvir o receptor'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O modem do arquivo avisa a cada ACK quantos quadros ainda cabem na memória dele, e o transmissor nunca passa disso. Que tipo de controle é esse?',
      opcoes: ['Controle de fluxo por retorno', 'Controle de fluxo por taxa', 'Controle de erros por temporizador', 'Confirmação negativa'],
      certa: 0,
      explicacao: 'Quem dita o limite é o receptor, e ele manda essa informação de volta ao transmissor: é controle de fluxo por retorno. Por taxa, o limite seria fixo no protocolo, sem ouvir o outro lado.',
    },
  },
  desafio: {
    carta: [
      'O painel de horários da rodoviária recebe a tabela dos ônibus por um enlace de rádio, com go-back-N. O painel é do tempo do ônibus a carvão e só guarda 2 quadros de cada vez; o controlador manda 6 sem esperar.',
      `Para piorar, alguém pôs o temporizador em 15 ms, e o contador chegou a ${A58D_INICIO.retransmissoes} retransmissões numa tabela de 30 quadros. O ônibus das sete aparece no painel às sete e meia.`,
      `Objetivo: janela de no máximo ${MEMORIA58D} quadros, temporizador acima da ida e volta, a tabela inteira sem erro com no máximo ${MAX_RETX58D} retransmissões, e a pergunta respondida.`,
    ],
    dicas: [
      'Duas coisas estão erradas: quantos quadros vão sem ACK e quanto tempo o transmissor espera.',
      `A janela é o que o painel guarda, ${MEMORIA58D}. O temporizador passa da ida e volta: 4000 bits a 512 kb/s mais 10 ms de ida e 10 ms de volta.`,
      'Janela 2, timeout de 100 ms e transfira de novo.',
    ],
    perguntas: d58,
    respostas: { '1': br(IDA_VOLTA58D, 4) },
    montar: () => {
      const m = novoMundo(2558);
      par(m, 'Controlador do rádio da rodoviária CE-100', { arq: { ...ARQ58D } });
      m.flags.linhaArq = LINHA58D;
      m.flags.quadrosArq = 30;
      return m;
    },
    objetivo: (m) => {
      const a = ctl(m).arq as ConfigArq;
      const r = ultimoArq(m);
      const j = a.protocolo === 'pare-e-espere' ? 1 : a.janela;
      return [
        item(`janela de no máximo ${MEMORIA58D} quadros`, j <= MEMORIA58D, `janela ${j}`),
        item(`temporizador acima da ida e volta`, a.timeoutMs > IDA_VOLTA58D, `${a.timeoutMs} ms`),
        item(`tabela inteira, sem erro, com até ${MAX_RETX58D} retransmissões`, transferiuAgora(m) && !!r && completa(r) && r.retransmissoes <= MAX_RETX58D, r ? `${r.entreguesCertos} de ${r.quadros} certos, ${r.retransmissoes} retransmissões` : 'ainda não transferiu'),
        ...todasRespondidas(m, d58),
      ];
    },
    solucao: [
      ['equip', 'ctl-a', 'janela', { n: '2' }],
      ['equip', 'ctl-a', 'timeout', { ms: '100' }],
      ['equip', 'ctl-a', 'transferir'],
    ],
  },
};

/* ======================================================================
 * ref 59: O enlace do ADSL e do cabo (3.5.2 e 3.5.3)
 * ====================================================================== */

const MRU_PPPOE = 1492;

const p59: Pergunta[] = [
  numerica('1', 'Quantos bytes do quadro Ethernet de 1500 o PPPoE gasta, se o MRU cai para 1492?', 8, 0),
  texto('2', 'No cabo, como se chama a mensagem com que o CMTS diz a cada modem em quais minislots da subida ele pode transmitir?', /\bmap\b/i),
];

const d59: Pergunta[] = [
  numerica('1', 'Depois do LCP, com quantos bytes de MRU o enlace da rádio ficou?', (m) => (m.flags.mruPpp as number | undefined) ?? -1, 0),
  texto('2', 'No cabo, qual sentido é disputado pelos modems da rua: a subida ou a descida?', /^subida$/i),
];

/** O modem do assinante e o concentrador PPP do provedor, ligados na bancada da central. */
function linhaDsl(m: Mundo, modelo: string, ppp: { auth: string; mru: number }) {
  adicionar(m, aparelho('cpe', 'enlace', modelo, [{ nome: 'linha' }], { ppp, cfg: cfg() }));
  adicionar(m, aparelho('concentrador', 'enlace', 'Concentrador PPP do provedor, no rack da central', [{ nome: 'linha' }], { ppp: { exige: 'chap', mruMax: MRU_PPPOE, auth: 'chap', mru: MRU_PPPOE } }));
  ligar(m, { equip: 'cpe', porta: 'linha' }, { equip: 'concentrador', porta: 'linha' }, 'cat6', 20, { id: 'c1' });
  // um quadro PPP com IPv4 dentro: FF 03, protocolo 0021 e o começo do pacote
  m.flags.cargas = [[0xff, 0x03, 0x00, 0x21, 0x45, 0x00, 0x00, 0x3c, 0x7e, 0x02]];
  m.flags.erros = [];
}

const pppDe = (m: Mundo) => m.equipamentos.get('cpe')!.s.ppp as { auth: string; mru: number };

const dia59: Dia = {
  numero: 59,
  ato: 2,
  titulo: 'O enlace do ADSL e do cabo',
  chamado: [
    'CHAMADO #0059',
    'No rack velho da central entrou o concentrador do provedor, e o primeiro assinante de ADSL é a padaria da praça, que quer mandar o cardápio do dia pela internet antes de o pão esfriar.',
    'O modem da padaria veio da loja oferecendo PAP e pedindo MRU de 1500, e o concentrador derruba o enlace a cada discagem. A turma do cabo, do outro lado da praça, mandou junto um bilhete perguntando como funciona o enlace deles.',
    'Objetivo: PPP aberto com CHAP e MRU de 1492, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'A camada de enlace no ADSL e no DOCSIS',
    texto: [
      'No ADSL, o par de cobre do telefone liga cada casa à central, sozinho: ninguém divide o fio com o vizinho. A camada física cuida das frequências altas do par; por cima dela, o enlace que de fato importa para quem assina é o PPP, entre o modem da casa e o concentrador do provedor. É o PPP que autentica quem está ligando (PAP ou CHAP), negocia o tamanho máximo de quadro (MRU) e entrega o endereço IP.',
      'O PPP não viaja sozinho na linha. Há duas formas comuns de levá-lo. No PPPoE, o quadro PPP vai dentro de um quadro Ethernet, que por sua vez desce pela linha ADSL; o cabeçalho do PPPoE gasta 8 bytes dos 1500 do Ethernet, e o MRU cai para 1492. No PPPoA, o PPP vai direto sobre as células ATM que a linha ADSL carrega, sem Ethernet no meio. Em qualquer dos dois, o quadro PPP é o mesmo: endereço, controle, o campo protocolo dizendo o que vem dentro, o dado e o CRC.',
      'No cabo, a história é outra: o mesmo coaxial passa por todas as casas da rua, e o meio é compartilhado. Na ponta da rede fica o CMTS, que conversa com todos os modems. Na descida, só o CMTS fala, e todos os modems escutam tudo: é difusão. Cada modem fica com o que é endereçado a ele, e o tráfego vai cifrado, porque o vizinho recebe exatamente o mesmo sinal.',
      'Na subida, o problema é de vários falando ao mesmo tempo. O DOCSIS divide o tempo da subida em pedacinhos, os minislots. Alguns minislots são de disputa: qualquer modem pode mandar ali um pedido de banda curto. Se dois pedidos caem no mesmo minislot, colidem, e cada modem espera um tempo aleatório antes de tentar de novo. O CMTS ouve os pedidos e responde com uma mensagem MAP, que diz qual modem transmite em quais minislots da próxima rodada.',
      'Neste galpão dá para discar o PPP de verdade. O MAP e os minislots do cabo ficam para a aula e para as perguntas: a central não tem CMTS, e a turma do cabo não deixou ninguém mexer no deles.',
    ],
  },
  dicas: [
    'Disque e leia o log fase por fase: o LCP diz o que aceitou e o que recusou.',
    'O concentrador corrige o MRU sozinho com um Configure-Nak. A autenticação, não: precisa ser a mesma dos dois lados.',
    'Autenticação CHAP no modem da padaria e disque de novo. O MAP é a resposta da segunda pergunta.',
  ],
  perguntas: p59,
  montar: () => {
    const m = novoMundo(259);
    linhaDsl(m, 'Modem ADSL da padaria da praça, na bancada da central', { auth: 'pap', mru: 1500 });
    return m;
  },
  objetivo: (m) => {
    const p = pppDe(m);
    return [
      item('autenticação CHAP no modem da padaria', p.auth === 'chap', p.auth),
      item(`PPP aberto, com IP e MRU de ${MRU_PPPOE}`, m.flags.ppp === 'aberto' && m.flags.mruPpp === MRU_PPPOE, m.flags.ppp ? `${m.flags.ppp}${m.flags.mruPpp ? `, MRU ${m.flags.mruPpp}` : ''}` : 'ainda não discou'),
      ...todasRespondidas(m, p59),
    ];
  },
  posMorte: [
    `O LCP começou pedindo MRU de 1500. O concentrador respondeu com um Configure-Nak: "no máximo ${MRU_PPPOE}", porque o PPPoE gasta 8 bytes do quadro Ethernet. Esse ajuste o PPP resolve sozinho, na negociação. A autenticação, não: o concentrador exige CHAP, o modem oferecia PAP, e sem acordo o enlace caía.`,
    'Com CHAP, a senha da padaria nunca passa pela linha: o concentrador manda um desafio, e o modem devolve o desafio misturado à senha por uma função de hash. Depois vem o IPCP, e o endereço 203.0.113.77 é da padaria. O cardápio saiu com o pão ainda quente.',
    'No cabo, ninguém disca: o modem entra na rede do CMTS, e a disputa é na subida. Os pedidos de banda brigam pelos minislots de disputa, e o MAP decide quem fala quando. Guarde essa ideia de meio compartilhado e de disputa: o ato 3 inteiro é sobre ela.',
  ],
  passos: [
    passo({ ...doCpe('ppp-discar'), instrucao: 'Disque do modem da padaria e leia o log do PPP.', porque: 'Cada fase do PPP deixa uma linha no log: o LCP negocia o enlace, depois vem a autenticação e, por fim, o IPCP. A primeira que falhar diz o problema.', conferir: (m) => (m.flags.ppp ? true : 'A discagem não aconteceu.'), feito: `Duas coisas no LCP: o MRU de 1500 levou um Configure-Nak e virou ${MRU_PPPOE}, e o concentrador exige CHAP enquanto o modem só oferece PAP. Enlace derrubado.` }),
    passo({ pergunta: '1', exemplo: { resposta: '8' }, instrucao: 'Quantos bytes do quadro Ethernet o PPPoE gasta?', porque: `O quadro Ethernet carrega até 1500 bytes. O concentrador aceitou no máximo ${MRU_PPPOE} para o PPP. A diferença é o cabeçalho do PPPoE.`, feito: '8 bytes. É o preço de levar PPP dentro de Ethernet; no PPPoA, sem Ethernet no meio, esse cabeçalho não existe.' }),
    passo({ ...doCpe('ppp-auth'), pedir: ['v'], exemplo: { v: 'chap' }, instrucao: 'Ajuste a autenticação do modem da padaria.', porque: 'Os dois lados precisam concordar no método, e o concentrador só aceita um. O que não manda a senha aberta pela linha.', conferir: (m) => pppDe(m).auth === 'chap' || 'O concentrador continua recusando esse método.', feito: 'CHAP configurado.' }),
    passo({ ...doCpe('ppp-discar'), instrucao: 'Disque de novo.', porque: 'LCP, autenticação e IPCP, nessa ordem. O MRU vai passar pelo mesmo Configure-Nak.', conferir: (m) => (m.flags.ppp === 'aberto' && m.flags.mruPpp === MRU_PPPOE) || 'O PPP não subiu.', feito: `LCP aberto com MRU ${MRU_PPPOE}, CHAP aceito, IPCP entregou 203.0.113.77. A padaria está na internet.` }),
    passo({
      escolha: {
        opcoes: [
          'PPPoE: o PPP dentro de quadros Ethernet, que descem pela linha ADSL',
          'PPPoA: o PPP direto sobre as células ATM, sem Ethernet no meio',
          'DOCSIS: o PPP dividido em minislots',
          'Nenhum: o PPP vai direto no par de cobre, sem nada por baixo',
        ],
        certa: 0,
        errada: {
          1: 'No PPPoA não há quadro Ethernet, e o MRU não perderia os 8 bytes do PPPoE.',
          2: 'DOCSIS é o enlace do cabo coaxial, não do par de telefone. E ninguém disca PPP num modem de cabo.',
          3: 'Alguém precisa carregar o PPP sobre a linha ADSL. O MRU de 1492 entrega quem é.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: `O MRU caiu para ${MRU_PPPOE}. Como o PPP da padaria está viajando?`,
      porque: 'Os 8 bytes que faltam são o cabeçalho de uma das duas formas de levar PPP no ADSL. A outra forma não gastaria esses bytes.',
      feito: 'PPPoE. O modem embrulha o PPP em Ethernet, e o Ethernet desce pela linha ADSL até a central.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: 'MAP' }, instrucao: 'Responda ao bilhete da turma do cabo: como se chama a mensagem que distribui os minislots da subida?', porque: 'No cabo, o CMTS ouve os pedidos de banda dos modems e, a cada rodada, publica quem transmite em quais minislots. É um mapa da subida, e o nome é esse mesmo, em inglês.', feito: 'MAP. Com ele, cada modem sabe exatamente quando pode falar, e a subida não vira gritaria.' }),
    passo({
      escolha: {
        opcoes: [
          'Os dois pedidos colidem, nenhum modem ganha banda, e cada um espera um tempo aleatório antes de pedir de novo',
          'O CMTS escolhe o modem mais perto e ignora o outro para sempre',
          'Os dois pedidos se somam e os dois modems ganham o dobro de banda',
          'Nada acontece: na subida cada modem tem a sua frequência própria',
        ],
        certa: 0,
        errada: {
          1: 'Ninguém fica de fora para sempre. A colisão estraga os dois pedidos, e os dois tentam de novo.',
          2: 'Dois sinais no mesmo minislot se misturam e viram ruído. Ninguém ganha nada.',
          3: 'Na subida, os modems da rua dividem o mesmo canal. É por isso que existe disputa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Dois modems da rua do cabo mandam o pedido de banda no mesmo minislot de disputa. O que acontece?',
      porque: 'Os minislots de disputa são abertos a todos. Se dois falam juntos, ninguém se entende, e o jeito de não colidir de novo é não tentar de novo ao mesmo tempo.',
      feito: 'Colisão e nova tentativa depois de um tempo aleatório, que cresce a cada colisão seguida. Disputa por um meio compartilhado é o assunto do ato 3.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'PPP na linha do assinante',
        texto: [
          'No ADSL, cada casa tem o seu par de cobre até a central. O enlace que importa para o assinante é o PPP, entre o modem e o concentrador do provedor: autentica, negocia o MRU e entrega o IP.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'm', rotulo: 'modem da padaria', x: 80, y: 120 },
            { id: 'd', rotulo: 'linha ADSL', x: 250, y: 120 },
            { id: 'c', rotulo: 'concentrador PPP', x: 420, y: 120 },
            { id: 'i', rotulo: 'internet', x: 570, y: 120 },
          ],
          ligacoes: [
            ['m', 'd', 'par de cobre'],
            ['d', 'c', 'na central'],
            ['c', 'i', 'IP'],
          ],
        },
      },
      {
        titulo: 'PPPoE e PPPoA',
        texto: ['O PPP precisa de algo por baixo para descer pela linha ADSL. Há dois jeitos comuns.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Forma', 'O PPP viaja dentro de', 'O que custa'],
          linhas: [
            ['PPPoE', 'quadros Ethernet, que descem pela linha ADSL', `8 bytes de cabeçalho: MRU de ${MRU_PPPOE}`],
            ['PPPoA', 'células ATM, direto, sem Ethernet', 'sem o cabeçalho do PPPoE'],
          ],
        },
      },
      {
        titulo: 'Embrulho dentro de embrulho',
        texto: ['No PPPoE, o pacote IP vai dentro do quadro PPP, que vai dentro do PPPoE, que vai dentro do quadro Ethernet, que desce pela linha. Cada camada põe o seu cabeçalho.'],
        visual: { tipo: 'camadas', camadas: ['IP (o pacote da padaria)', 'PPP (protocolo 0021)', 'PPPoE (8 bytes)', 'Ethernet', 'linha ADSL'], rotulo: 'PPPoE, de cima para baixo' },
      },
      {
        titulo: 'DOCSIS: um CMTS, a rua inteira',
        texto: [
          'No cabo, o coaxial passa por todas as casas. Na descida, só o CMTS fala e todos escutam: difusão, com o tráfego cifrado. Na subida, os modems dividem o mesmo canal e precisam disputar a vez.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'CMTS', x: 90, y: 120 },
            { id: 'a', rotulo: 'modem da casa 1', x: 480, y: 40 },
            { id: 'b', rotulo: 'modem da casa 2', x: 480, y: 120 },
            { id: 'd', rotulo: 'modem da casa 3', x: 480, y: 200 },
          ],
          ligacoes: [
            ['c', 'a', 'descida: todos ouvem'],
            ['c', 'b', 'descida: todos ouvem'],
            ['d', 'c', 'subida: na vez dela'],
          ],
        },
      },
      {
        titulo: 'Minislots e o MAP',
        texto: [
          'A subida é cortada em minislots. Nos de disputa, qualquer modem manda um pedido curto de banda; se dois colidem, tentam de novo depois de um tempo aleatório. O CMTS responde com o MAP: quem transmite em quais minislots da próxima rodada.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Minislots da rodada', 'Uso, segundo o MAP'],
          linhas: [
            ['primeiros', 'disputa: pedidos de banda de qualquer modem'],
            ['seguintes', 'reservados ao modem da casa 2, que pediu antes'],
            ['últimos', 'reservados ao modem da casa 3'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que, no cabo, a subida precisa de minislots e MAP e a descida não?',
      opcoes: [
        'Porque na descida só o CMTS fala, e na subida muitos modems dividem o mesmo canal',
        'Porque a descida usa fibra e a subida usa coaxial',
        'Porque na descida não há erros',
        'Porque cada modem tem o seu próprio cabo de subida',
      ],
      certa: 0,
      explicacao: 'Com um só transmissor, não há disputa: o CMTS manda e cada modem pega o que é dele. Na subida, vários transmissores dividem o canal, e alguém precisa organizar a vez. É o CMTS, com o MAP.',
    },
  },
  desafio: {
    carta: [
      'A rádio comunitária assinou o ADSL para transmitir o programa da manhã pela internet. O técnico configurou o modem com MRU de 1400 "por garantia" e deixou a autenticação em PAP, "que é mais simples".',
      'O concentrador não acha nada simples e derruba o enlace. O locutor já está lendo a previsão do tempo para o microfone desligado.',
      'Objetivo: PPP aberto com CHAP, e as duas perguntas respondidas.',
    ],
    dicas: [
      'Disque e leia o log: veja o que o LCP faz com um MRU menor que o máximo.',
      'CHAP no modem e disque de novo. O MRU que o LCP aceitou está no log.',
    ],
    perguntas: d59,
    respostas: { '1': '1400', '2': 'subida' },
    montar: () => {
      const m = novoMundo(2559);
      linhaDsl(m, 'Modem ADSL da rádio comunitária', { auth: 'pap', mru: 1400 });
      return m;
    },
    objetivo: (m) => {
      const p = pppDe(m);
      return [item('autenticação CHAP no modem da rádio', p.auth === 'chap', p.auth), item('PPP aberto, com IP', m.flags.ppp === 'aberto', m.flags.ppp ?? 'ainda não discou'), ...todasRespondidas(m, d59)];
    },
    solucao: [
      ['equip', 'cpe', 'ppp-auth', { v: 'chap' }],
      ['equip', 'cpe', 'ppp-discar'],
    ],
  },
};

export const ATO2B: Dia[] = [dia57, dia58, dia59];
