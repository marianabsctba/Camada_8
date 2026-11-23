// Dias do ato 3 (O Bairro), com prática guiada, aula e desafio no próprio dia.
// O problema da alocação de canais (4.1), o ALOHA (4.2.1) e o CSMA com e sem detecção de colisão (4.2.2).

import { canal, eficienciaCsmaCd, vazaoAloha, vazaoAlohaSlotted, vazaoCsma1p, vazaoCsmaCd, vazaoCsmaNp, type EstadoMac, type ProtocoloMac, type ResultadoMac } from '../motor/mac';
import { adicionar, novoMundo, type Mundo } from '../motor/mundo';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Número com vírgula decimal, para os textos. */
const br = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');
/** Fração em porcentagem, como o simulador mostra. */
const pc = (x: number) => `${br(x * 100, 1)} %`;
/** Fração em porcentagem, só o número, para as respostas. */
const pcN = (x: number) => Math.round(x * 1000) / 10;

function mundoCanal(semente: number, nome: string, mac: Partial<EstadoMac>, modelo: string): Mundo {
  const m = novoMundo(semente);
  adicionar(m, canal(nome, mac, modelo));
  return m;
}

const estado = (m: Mundo, nome: string) => m.equipamentos.get(nome)!.s.mac as EstadoMac;
const ultimo = (m: Mundo) => m.flags.ultimoMac as ResultadoMac | undefined;
/** A última simulação foi feita com a configuração que está no canal agora. */
const simulouAgora = (m: Mundo, nome: string) => !!ultimo(m) && m.flags.macDoUltimo === JSON.stringify(estado(m, nome));

const doCanal = (nome: string, acao: string, extra: Partial<Passo> = {}): Partial<Passo> => ({ alvo: ['equip', nome], acao, ...extra });

/** Itens de objetivo comuns: protocolo, carga, estações e simulação com a configuração atual. */
function conferirCanal(m: Mundo, nome: string, quer: { protocolo?: ProtocoloMac; carga?: number; estacoes?: number; vazaoMin?: number }): ItemObjetivo[] {
  const s = estado(m, nome);
  const r = ultimo(m);
  const out: ItemObjetivo[] = [];
  if (quer.estacoes !== undefined) out.push(item(`${quer.estacoes} estações no canal`, s.estacoes === quer.estacoes, `agora: ${s.estacoes}`));
  if (quer.carga !== undefined) out.push(item(`carga oferecida G = ${br(quer.carga, 2)}`, Math.abs(s.carga - quer.carga) < 1e-9, `agora: ${br(s.carga, 2)}`));
  if (quer.protocolo !== undefined) out.push(item(`protocolo ${quer.protocolo}`, s.protocolo === quer.protocolo, `agora: ${s.protocolo}`));
  const vz = quer.vazaoMin;
  out.push(
    item(
      vz !== undefined ? `simulação com a configuração atual e vazão de pelo menos ${pc(vz)}` : 'simulação com a configuração atual',
      simulouAgora(m, nome) && (vz === undefined || (!!r && r.vazao >= vz - 1e-9)),
      r ? `última vazão: ${pc(r.vazao)}${simulouAgora(m, nome) ? '' : ' (com outra configuração)'}` : 'ainda não simulou',
    ),
  );
  return out;
}

/** Atraso médio de uma fila M/M/1: T = 1 / (μC - λ), em segundos. */
const atrasoFila = (taxaBps: number, bitsQuadro: number, quadrosPorS: number) => 1 / (taxaBps / bitsQuadro - quadrosPorS);

/* ======================================================================
 * ref 60: Um canal para muitos (4.1)
 * ====================================================================== */

const C60 = 10_000_000;
const Q60 = 10_000;
const L60 = 600;
const N60 = 10;
const T60 = atrasoFila(C60, Q60, L60) * 1000; // ms
const TN60 = atrasoFila(C60 / N60, Q60, L60 / N60) * 1000; // ms
const G60 = L60 / (C60 / Q60);
const S60 = vazaoAlohaSlotted(G60);

const p60: Pergunta[] = [
  numerica('1', 'Com o canal inteiro compartilhado, qual é o atraso médio de um quadro, em ms?', T60, 0.05),
  numerica('2', 'Com o canal fatiado em 10 pedaços fixos, um por apartamento, qual é o atraso médio, em ms?', TN60, 0.5),
];

const C60D = 20_000_000;
const Q60D = 8_000;
const L60D = 2_000;
const N60D = 5;
const T60D = atrasoFila(C60D, Q60D, L60D) * 1000;
const TN60D = atrasoFila(C60D / N60D, Q60D, L60D / N60D) * 1000;
const G60D = L60D / (C60D / Q60D);

const d60: Pergunta[] = [
  numerica('1', 'Com o cabo inteiro compartilhado pelas 5 salas, qual é o atraso médio de um quadro, em ms?', T60D, 0.05),
  numerica('2', 'Com o cabo fatiado em 5 pedaços fixos, um por sala, qual é o atraso médio, em ms?', TN60D, 0.2),
];

const dia60: Dia = {
  numero: 60,
  ato: 3,
  titulo: 'Um canal para muitos',
  secao: '4.1',
  chamado: [
    'CHAMADO #0060',
    `O Edifício Mirante tem ${N60} apartamentos e um único rádio de ${C60 / 1_000_000} Mb/s no telhado. O técnico anterior dividiu o canal em ${N60} fatias fixas de ${C60 / N60 / 1_000_000} Mb/s, uma por apartamento, "para ninguém brigar".`,
    'Ninguém briga, de fato. Todo mundo reclama junto. O síndico mandou uma planilha com o tráfego do prédio e um bilhete: "metade das fatias está sempre parada e a minha está sempre lotada".',
    'Objetivo: calcular o atraso com o canal inteiro e com as fatias, e configurar o canal de laboratório com as premissas do prédio: 10 estações, a carga real e o modelo certo.',
  ],
  manual: {
    titulo: 'O problema da alocação de canais',
    texto: [
      'Até aqui cada enlace ligava duas pontas. No bairro é diferente: muita gente divide o mesmo meio, seja um rádio, um cabo ou o ar da praça. Se duas estações falam ao mesmo tempo, os sinais se misturam e ninguém entende nada. A pergunta deste ato é simples de fazer e difícil de responder: quem fala quando? Quem decide isso é a subcamada MAC, a parte de baixo da camada de enlace.',
      'O jeito mais antigo é a alocação estática: dividir o canal em N pedaços fixos, por frequência (FDM) ou por tempo (TDM), um para cada usuário. Com poucos usuários, cada um com tráfego constante, funciona bem: é como o rádio FM, cada estação na sua frequência. Mas tráfego de computador chega em rajadas: um minuto parado, depois um arquivo inteiro de uma vez. Aí a fatia de quem está quieto fica ociosa, e quem está com pressa não pode usar a sobra do vizinho.',
      `A conta mostra o tamanho do estrago. Num canal de C b/s, com quadros de 1/μ bits em média chegando a λ quadros por segundo, o atraso médio de uma fila é T = 1/(μC - λ). Fatiando o canal em N pedaços, cada fatia tem capacidade C/N e recebe λ/N quadros por segundo, e o atraso vira T_N = 1/(μC/N - λ/N) = N·T. Dividir em N piora o atraso médio N vezes. No Mirante, isso é ${br(T60, 1)} ms contra ${br(TN60, 1)} ms.`,
      'A saída é a alocação dinâmica: o canal inteiro fica disponível e as estações disputam a vez. Os modelos de disputa partem de cinco premissas. Tráfego independente: N estações, cada uma gerando quadros por conta própria, que esperam até o quadro sair. Canal único: tudo passa pelo mesmo meio, não há outro fio para combinar a vez. Colisões observáveis: se dois quadros se sobrepõem, os dois se perdem, e todo mundo consegue perceber isso. Tempo contínuo ou com intervalos: a estação pode começar a qualquer instante, ou só no início de um intervalo marcado por um relógio comum. Detecção de portadora ou não: a estação consegue escutar se o canal está ocupado antes de falar, ou fala às cegas.',
      'Cada combinação dessas premissas dá uma família de protocolos. Sem escutar e com tempo contínuo, ALOHA puro. Sem escutar e com intervalos, ALOHA com intervalos. Escutando antes, CSMA. O laboratório já tem todos prontos; nos próximos dias você abre cada um.',
    ],
  },
  dicas: [
    'O atraso de uma fila é T = 1/(μC - λ), com μC em quadros por segundo: a taxa dividida pelo tamanho do quadro.',
    `Com o canal inteiro: μC = ${C60 / Q60} quadros/s, λ = ${L60}, então T = 1/${C60 / Q60 - L60} s. Com 10 fatias, o atraso é 10 vezes maior.`,
    `No canal de laboratório: ${N60} estações, G = ${br(G60, 1)} (${L60} quadros por segundo divididos por ${C60 / Q60}), e o rádio não escuta antes de falar, mas tem relógio comum: ALOHA com intervalos.`,
  ],
  perguntas: p60,
  montar: () => mundoCanal(260, 'radio-mirante', { protocolo: 'bitmap', estacoes: 1, carga: G60 / N60, a: 0.01 }, 'Rádio do telhado do Edifício Mirante, em modo de laboratório'),
  objetivo: (m) => [...conferirCanal(m, 'radio-mirante', { estacoes: N60, carga: G60, protocolo: 'aloha-slotted' }), ...todasRespondidas(m, p60)],
  posMorte: [
    `Cada fatia fixa tinha ${C60 / N60 / 1_000_000} Mb/s e recebia, em média, ${L60 / N60} quadros por segundo. Parece folgado, mas a média esconde a rajada: enquanto um apartamento mandava um vídeo inteiro, as outras nove fatias assistiam paradas. O atraso médio era ${br(TN60, 1)} ms; com o canal inteiro disponível, seria ${br(T60, 1)} ms.`,
    `A alocação estática não é burra, é especializada: serve para poucos usuários com tráfego constante. O prédio tem o contrário disso. No laboratório, com ${N60} estações disputando o canal inteiro num ALOHA com intervalos e G = ${br(G60, 1)}, a vazão ficou em ${pc(S60)}. Parece pouco, e é: amanhã a gente descobre por que e quanto dá para melhorar.`,
    'As cinco premissas parecem detalhe de prova, mas decidem tudo. Um rádio que não escuta antes de falar não pode usar CSMA, por mais que se queira. Um rádio sem relógio comum não tem como respeitar intervalos.',
  ],
  passos: [
    passo({ ...doCanal('radio-mirante', 'canal-ver'), instrucao: 'Veja como o canal de laboratório está configurado.', porque: 'O laboratório copia o canal do prédio, mas o técnico anterior deixou o modelo de uma fatia só: 1 estação, carga de um apartamento, e um protocolo que nem é o do rádio.', feito: 'Uma estação, carga de um décimo e mapa de bits. É o retrato de uma fatia, não do prédio.' }),
    passo({ pergunta: '1', exemplo: { resposta: br(T60, 1) }, instrucao: 'Com o canal inteiro compartilhado, qual é o atraso médio, em ms?', porque: `T = 1/(μC - λ). O rádio faz ${C60 / 1_000_000} Mb/s e o quadro médio tem ${Q60} bits, então μC = ${C60 / Q60} quadros por segundo. O prédio inteiro manda λ = ${L60} quadros por segundo.`, feito: `1/(${C60 / Q60} - ${L60}) = 1/${C60 / Q60 - L60} s = ${br(T60, 1)} ms.` }),
    passo({ pergunta: '2', exemplo: { resposta: br(TN60, 0) }, instrucao: 'Com 10 fatias fixas, uma por apartamento, qual é o atraso médio, em ms?', porque: `Cada fatia tem um décimo da capacidade (${C60 / N60 / Q60} quadros por segundo) e recebe um décimo do tráfego (${L60 / N60} quadros por segundo).`, feito: `1/(${C60 / N60 / Q60} - ${L60 / N60}) = 1/${C60 / N60 / Q60 - L60 / N60} s = ${br(TN60, 0)} ms. Dez vezes pior, exatamente como a conta T_N = N·T promete.` }),
    passo({
      escolha: {
        opcoes: [
          'Porque o tráfego vem em rajadas: a fatia de quem está quieto fica ociosa enquanto quem tem pressa espera na fila',
          'Porque fatias menores perdem mais bits no ar',
          'Porque as fatias colidem umas com as outras',
          'Porque o rádio fica mais lento quando é dividido',
        ],
        certa: 0,
        errada: {
          1: 'Uma fatia de frequência não erra mais por ser estreita, se o sinal estiver bom. O problema é de fila, não de ruído.',
          2: 'Fatias fixas nunca colidem: cada apartamento tem a sua. Esse é justamente o charme da alocação estática.',
          3: 'O rádio continua com os mesmos 10 Mb/s no total. O problema é que ninguém pode usar a sobra do vizinho.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A capacidade total é a mesma. Por que as fatias deixam tudo mais lento?',
      porque: 'Pense no apartamento 3 mandando um vídeo enquanto os outros nove dormem. Quanto da capacidade ele pode usar?',
      feito: 'Um décimo. Os outros nove décimos ficam parados, e ele espera numa fila que não precisava existir. Estática serve para tráfego constante; rajada pede alocação dinâmica.',
    }),
    passo({
      ...doCanal('radio-mirante', 'canal-carga'),
      pedir: ['g', 'n'],
      exemplo: { g: String(G60), n: String(N60) },
      instrucao: 'Configure o canal com as premissas do prédio: quantas estações e que carga oferecida.',
      porque: `Primeira premissa: N estações independentes, cada uma com seus quadros. A carga G conta quadros por tempo de quadro, somando todas: ${L60} quadros por segundo divididos pelos ${C60 / Q60} que o canal inteiro aguenta.`,
      conferir: (m) => {
        const s = estado(m, 'radio-mirante');
        if (s.estacoes !== N60) return `São ${N60} apartamentos, cada um uma estação independente.`;
        if (Math.abs(s.carga - G60) > 1e-9) return `G = λ/μC = ${L60}/${C60 / Q60}. Não divida por apartamento: a carga é do canal inteiro.`;
        return true;
      },
      feito: `${N60} estações e G = ${br(G60, 1)}: o prédio inteiro tentando ocupar 60 % do canal, cada um no seu ritmo.`,
    }),
    passo({
      ...doCanal('radio-mirante', 'canal-protocolo'),
      pedir: ['p'],
      exemplo: { p: 'aloha-slotted' },
      instrucao: 'O rádio do telhado não escuta o canal antes de falar, mas tem um relógio comum que marca intervalos. Escolha o modelo que respeita essas premissas.',
      porque: 'Duas premissas decidem a família: tempo contínuo ou com intervalos, e detecção de portadora ou não. Sem escutar e com intervalos é ALOHA com intervalos.',
      conferir: (m) => {
        const p = estado(m, 'radio-mirante').protocolo;
        if (p === 'aloha-slotted') return true;
        if (p === 'aloha') return 'ALOHA puro é para tempo contínuo. Este rádio tem relógio comum: pode esperar o início do intervalo.';
        if (p.startsWith('csma')) return 'CSMA escuta antes de falar. Este rádio não detecta portadora: fala às cegas.';
        return 'Mapa de bits e bastão precisam de coordenação que este rádio não tem. Fique com a família ALOHA e pense no relógio.';
      },
      feito: `ALOHA com intervalos, G = ${br(G60, 1)}: vazão de ${pc(S60)}. Ainda não é ótimo, mas agora o laboratório mede o prédio de verdade.`,
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quem fala quando',
        texto: [
          'Num meio compartilhado, se duas estações falam juntas, os sinais se misturam e os dois quadros se perdem. A subcamada MAC (controle de acesso ao meio) é a parte da camada de enlace que decide a vez.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r', rotulo: 'Rádio do telhado', x: 300, y: 50 },
            { id: 'a1', rotulo: 'Apto 1', x: 80, y: 190 },
            { id: 'a2', rotulo: 'Apto 2', x: 230, y: 190 },
            { id: 'a3', rotulo: 'Apto 3', x: 370, y: 190 },
            { id: 'a4', rotulo: 'Apto 10', x: 520, y: 190 },
          ],
          ligacoes: [
            ['a1', 'r', 'mesmo canal'],
            ['a2', 'r'],
            ['a3', 'r'],
            ['a4', 'r', 'mesmo canal'],
          ],
        },
      },
      {
        titulo: 'Fatiar fixo',
        texto: [
          'Alocação estática: o canal é dividido em N pedaços fixos, por frequência (FDM) ou por tempo (TDM). Ninguém colide, ninguém disputa.',
          'Com tráfego em rajadas, porém, quase todas as fatias ficam ociosas enquanto uma está lotada.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Estática serve?', 'Por quê'],
          linhas: [
            ['poucos usuários, tráfego constante (rádio FM, telefone)', 'sim', 'cada fatia está sempre em uso'],
            ['muitos usuários, tráfego em rajadas (computadores)', 'não', 'fatia de quem está quieto fica parada'],
            ['número de usuários muda o tempo todo', 'não', 'sobra fatia ou falta fatia'],
          ],
        },
      },
      {
        titulo: 'A conta do atraso',
        texto: [
          'Atraso médio de uma fila: T = 1/(μC - λ). Fatiando em N, cada pedaço tem C/N e recebe λ/N, então T_N = N·T.',
          `No Mirante: ${br(T60, 1)} ms com o canal inteiro, ${br(TN60, 1)} ms com 10 fatias. Mesma capacidade total, dez vezes mais espera.`,
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Capacidade', 'Chegadas', 'Atraso médio'],
          linhas: [
            ['canal inteiro', `${C60 / Q60} quadros/s`, `${L60} quadros/s`, `1/${C60 / Q60 - L60} s = ${br(T60, 1)} ms`],
            ['uma de 10 fatias', `${C60 / N60 / Q60} quadros/s`, `${L60 / N60} quadros/s`, `1/${C60 / N60 / Q60 - L60 / N60} s = ${br(TN60, 1)} ms`],
          ],
        },
      },
      {
        titulo: 'As cinco premissas da alocação dinâmica',
        texto: ['Na alocação dinâmica, o canal inteiro fica para quem precisar, e as estações disputam a vez. Os modelos partem destas premissas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Premissa', 'O que diz'],
          linhas: [
            ['tráfego independente', 'N estações geram quadros por conta própria e esperam até o quadro sair'],
            ['canal único', 'todo mundo fala e escuta pelo mesmo meio, não há outro canal para combinar a vez'],
            ['colisões observáveis', 'dois quadros sobrepostos se perdem, e todos percebem'],
            ['tempo contínuo ou com intervalos', 'começa a qualquer instante, ou só no início de um intervalo'],
            ['detecção de portadora ou não', 'escuta se o canal está ocupado antes de falar, ou fala às cegas'],
          ],
        },
      },
      {
        titulo: 'Premissa vira protocolo',
        texto: ['As duas últimas premissas escolhem a família. Este ato passa por todas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Escuta antes?', 'Tempo', 'Família'],
          linhas: [
            ['não', 'contínuo', 'ALOHA puro'],
            ['não', 'com intervalos', 'ALOHA com intervalos'],
            ['sim', 'contínuo ou com intervalos', 'CSMA e parentes'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um canal de 100 quadros/s atende 4 usuários com tráfego em rajadas. Dividi-lo em 4 fatias fixas faz o atraso médio:',
      opcoes: ['ficar 4 vezes maior', 'ficar igual, porque a capacidade total é a mesma', 'cair pela metade, porque ninguém colide', 'ficar 4 vezes menor'],
      certa: 0,
      explicacao: 'T_N = 1/(μC/N - λ/N) = N·T. Ninguém colide, mas cada um só pode usar a sua fatia, mesmo com as outras paradas.',
    },
  },
  desafio: {
    carta: [
      `A Escola do Morro tem ${N60D} salas ligadas por um cabo de ${C60D / 1_000_000} Mb/s, também fatiado em pedaços fixos. A professora de ciências mediu: quadros de ${Q60D} bits, ${L60D} quadros por segundo somando as salas, e a sala dela sempre na fila.`,
      'O cabo não tem relógio comum, e as placas antigas não escutam antes de falar.',
      `Objetivo: calcular o atraso com o cabo inteiro e com as ${N60D} fatias, e configurar o canal de laboratório com as premissas da escola: estações, carga e modelo.`,
    ],
    dicas: [
      `μC = ${C60D / 1_000_000} Mb/s divididos por ${Q60D} bits. O atraso fatiado é ${N60D} vezes o atraso inteiro.`,
      'Sem relógio comum, o tempo é contínuo. Sem escutar antes, nada de CSMA.',
      `G = λ/μC, com o tráfego de todas as salas: ${L60D}/${C60D / Q60D}.`,
    ],
    perguntas: d60,
    respostas: { '1': br(T60D, 1), '2': br(TN60D, 1) },
    montar: () => mundoCanal(2600, 'cabo-escola', { protocolo: 'token', estacoes: 1, carga: G60D / N60D, a: 0.01 }, 'Cabo da Escola do Morro, em modo de laboratório'),
    objetivo: (m) => [...conferirCanal(m, 'cabo-escola', { estacoes: N60D, carga: G60D, protocolo: 'aloha' }), ...todasRespondidas(m, d60)],
    solucao: [
      ['equip', 'cabo-escola', 'canal-carga', { g: String(G60D), n: String(N60D) }],
      ['equip', 'cabo-escola', 'canal-protocolo', { p: 'aloha' }],
    ],
  },
};

/* ======================================================================
 * ref 61: ALOHA (4.2.1)
 * ====================================================================== */

const G61 = 1.5;
const S61 = vazaoAloha(G61);
const S61pico = vazaoAloha(0.5);
const S61slot05 = vazaoAlohaSlotted(0.5);
const S61slot = vazaoAlohaSlotted(1);
const COL61 = 1 - Math.exp(-1);

const p61: Pergunta[] = [
  numerica('1', `No ALOHA puro com G = ${br(G61, 1)}, qual é a vazão S, em %?`, pcN(S61), 0.15),
  numerica('2', 'No ALOHA com intervalos e G = 1, que porcentagem das tentativas se perde em colisão?', pcN(COL61), 0.15),
];

const G61D = 2;
const S61D = vazaoAloha(G61D);
const d61: Pergunta[] = [
  numerica('1', `Com G = ${br(G61D, 0)}, qual era a vazão do rádio da praça, em %?`, pcN(S61D), 0.15),
  numerica('2', 'Qual é a maior vazão possível do ALOHA puro, em %?', pcN(S61pico), 0.15),
];

const dia61: Dia = {
  numero: 61,
  ato: 3,
  titulo: 'ALOHA',
  secao: '4.2.1',
  chamado: [
    'CHAMADO #0061',
    'A Cooperativa dos Pescadores tem um rádio de dados que liga os barcos ao cais. Cada barco fala quando quer, e quando dois falam juntos, os dois repetem depois de um tempo aleatório. Funcionou por anos.',
    'Neste verão a frota dobrou e o rádio quase parou: os barcos tentam mais, colidem mais, tentam mais ainda. O presidente da cooperativa escreveu "quanto mais a gente fala, menos a gente se entende", e não estava sendo filosófico.',
    'Objetivo: medir o canal como está, achar o ponto ótimo do ALOHA puro, passar para ALOHA com intervalos no seu ponto ótimo e responder as duas perguntas.',
  ],
  manual: {
    titulo: 'ALOHA: falar quando quiser',
    texto: [
      'O ALOHA é o protocolo de acesso mais simples que existe: quem tem um quadro, manda. Se colidir, espera um tempo aleatório e manda de novo. O tempo aleatório é o truque: se as duas estações esperassem o mesmo tanto, colidiriam de novo para sempre.',
      'Para medir, conte o tempo em tempos de quadro (o tempo de mandar um quadro) e chame de G a carga oferecida: quantas tentativas, somando novas e repetidas, aparecem por tempo de quadro. A vazão S é a fração do tempo em que o canal leva um quadro que chega inteiro. S nunca passa de G, e nunca passa de 1.',
      'No ALOHA puro, o quadro é vulnerável por dois tempos de quadro: qualquer outro que comece até um tempo de quadro antes dele (e ainda esteja no ar) ou durante ele (e o atropele) estraga os dois. A chance de ninguém começar nesse período de 2 tempos de quadro é e^(-2G), então S = G·e^(-2G). O pico é 1/(2e), cerca de 18,4 %, em G = 0,5.',
      'No ALOHA com intervalos (slotted), um relógio comum divide o tempo em intervalos do tamanho de um quadro, e cada estação só pode começar no início de um. Quem chega no meio espera o próximo. Agora só colide quem escolheu o mesmo intervalo: o período vulnerável cai para um tempo de quadro e S = G·e^(-G), com pico de 1/e, cerca de 36,8 %, em G = 1. O dobro, só por combinar o horário.',
      'O detalhe cruel é o que acontece depois do pico. Mais carga quer dizer mais colisão, mais colisão quer dizer mais repetição, e mais repetição quer dizer mais carga. A vazão desaba em vez de estabilizar: o canal fica cheio de tentativas e vazio de quadros entregues.',
    ],
  },
  dicas: [
    'Simule primeiro do jeito que está, para ter a régua.',
    'No ALOHA puro, o pico é em G = 0,5. No ALOHA com intervalos, em G = 1.',
    `Com G = ${br(G61, 1)} no puro, S = ${br(G61, 1)}·e^(-3) = ${pc(S61)}. No slotted com G = 1, colisão é 1 - e^(-1) = ${pc(COL61)} das tentativas.`,
  ],
  perguntas: p61,
  montar: () => mundoCanal(261, 'radio-cais', { protocolo: 'aloha', estacoes: 20, carga: G61, a: 0.01 }, 'Rádio de dados da Cooperativa dos Pescadores, em modo de laboratório'),
  objetivo: (m) => [...conferirCanal(m, 'radio-cais', { protocolo: 'aloha-slotted', carga: 1, vazaoMin: S61slot }), ...todasRespondidas(m, p61)],
  posMorte: [
    `Com G = ${br(G61, 1)}, o canal tinha três vezes a carga do pico. Cada barco tentava, colidia e tentava de novo, e a vazão era ${pc(S61)}: menos da metade do que dava para ter com bem menos esforço. Baixando para G = 0,5, o ALOHA puro chegou ao seu teto de ${pc(S61pico)}.`,
    `O relógio comum fez o resto. Começando só no início dos intervalos, um quadro só colide com quem escolheu o mesmo intervalo, e o período vulnerável cai pela metade. Com G = 1, a vazão foi a ${pc(S61slot)}, o dobro do puro. Ainda assim, ${pc(Math.exp(-1))} dos intervalos ficam vazios e ${pc(1 - 2 * Math.exp(-1))} se perdem em colisão: o ALOHA não sabe se alguém está falando.`,
    'Na prática, a cooperativa precisou de duas coisas: o relógio, que veio de um sinal de sincronismo do próprio cais, e um jeito de os barcos segurarem as repetições quando o canal está congestionado. Escutar antes de falar seria ainda melhor, mas aí já é assunto de amanhã.',
  ],
  passos: [
    passo({ ...doCanal('radio-cais', 'canal-simular'), instrucao: 'Simule o canal do jeito que está.', porque: `É o ALOHA puro com ${br(G61, 1)} tentativas por tempo de quadro. Antes de mexer, é preciso saber de onde se parte.`, conferir: (m) => (simulouAgora(m, 'radio-cais') ? true : 'A simulação não rodou.'), feito: `Vazão de ${pc(S61)}. Quase todo o tempo do canal vai para quadros que colidem.` }),
    passo({ pergunta: '1', exemplo: { resposta: br(pcN(S61), 1) }, instrucao: `Qual é a vazão do ALOHA puro com G = ${br(G61, 1)}, em %?`, porque: 'Está na linha "vazão S" da simulação. A fórmula é S = G·e^(-2G): G tentativas por tempo de quadro, cada uma com chance e^(-2G) de ninguém começar no seu período vulnerável.', feito: `${pc(S61)}. Com tanta tentativa, a chance de um quadro sobreviver aos dois tempos de quadro vulneráveis é só e^(-3), cerca de 5 %.` }),
    passo({
      escolha: {
        opcoes: [
          'Diminuir as tentativas até G = 0,5, onde fica o pico',
          'Aumentar as tentativas, para mais quadros passarem',
          'Manter G = 1,5: é o melhor que o ALOHA consegue',
          'Aumentar o número de barcos, para dividir a carga',
        ],
        certa: 0,
        errada: {
          1: 'Mais tentativas, mais colisões, mais repetições. Depois do pico, cada tentativa a mais derruba a vazão.',
          2: 'O pico do ALOHA puro é em G = 0,5. G = 1,5 está bem depois dele, na ladeira.',
          3: 'G já soma todas as estações. Mais barcos com o mesmo G é a mesma conta; mais barcos com mais tráfego é G maior, pior ainda.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A vazão está baixa porque tem tentativa demais. O que fazer com a carga?',
      porque: 'A curva S = G·e^(-2G) sobe, chega a um pico e desce. Quem está depois do pico melhora tentando menos.',
      feito: 'Diminuir. Parece contraditório: os barcos tentam menos e entregam mais.',
    }),
    passo({
      ...doCanal('radio-cais', 'canal-carga'),
      pedir: ['g'],
      exemplo: { g: '0.5' },
      instrucao: 'Leve a carga ao pico do ALOHA puro.',
      porque: 'Derivando S = G·e^(-2G), o máximo fica em G = 0,5: em média, meia tentativa por tempo de quadro.',
      conferir: (m) => (Math.abs(estado(m, 'radio-cais').carga - 0.5) < 1e-9 ? true : 'O pico do ALOHA puro é em G = 0,5. Fora dele, a vazão é menor.'),
      feito: `Vazão de ${pc(S61pico)}, o teto do ALOHA puro. Mais do que isso, só mudando o protocolo.`,
    }),
    passo({
      ...doCanal('radio-cais', 'canal-protocolo'),
      pedir: ['p'],
      exemplo: { p: 'aloha-slotted' },
      instrucao: 'O cais ganhou um sinal de sincronismo. Troque para o ALOHA que usa intervalos.',
      porque: 'Começando só no início do intervalo, um quadro só colide com quem escolheu o mesmo intervalo: o período vulnerável cai de 2 para 1 tempo de quadro.',
      conferir: (m) => (estado(m, 'radio-cais').protocolo === 'aloha-slotted' ? true : 'Os barcos ainda não escutam o canal: CSMA, mapa de bits e bastão estão fora. O que muda é o relógio.'),
      feito: `Com a mesma carga de 0,5, a vazão subiu para ${pc(S61slot05)}. Mas 0,5 não é o pico do slotted.`,
    }),
    passo({
      ...doCanal('radio-cais', 'canal-carga'),
      pedir: ['g'],
      exemplo: { g: '1' },
      instrucao: 'Leve a carga ao pico do ALOHA com intervalos.',
      porque: 'Em S = G·e^(-G), o máximo fica em G = 1: uma tentativa por intervalo, em média.',
      conferir: (m) => (Math.abs(estado(m, 'radio-cais').carga - 1) < 1e-9 ? true : 'O pico do ALOHA com intervalos é em G = 1.'),
      feito: `Vazão de ${pc(S61slot)}, o dobro do puro. A simulação também mostra quanto colide: ${pc(COL61)} das tentativas.`,
    }),
    passo({ pergunta: '2', exemplo: { resposta: br(pcN(COL61), 1) }, instrucao: 'No ALOHA com intervalos e G = 1, que porcentagem das tentativas se perde em colisão?', porque: 'Está na última linha da simulação. Uma tentativa sobrevive se ninguém mais escolher o mesmo intervalo, com chance e^(-G).', feito: `1 - e^(-1) = ${pc(COL61)}. No pico, cerca de 37 % dos intervalos levam um quadro, 37 % ficam vazios e o resto vai para colisão.` }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Fala quem quer',
        texto: [
          'ALOHA: tem quadro, manda. Colidiu, espera um tempo aleatório e manda de novo.',
          'G é a carga oferecida: tentativas por tempo de quadro, somando todas as estações e as repetições. S é a vazão: a fração do tempo com quadro entregue inteiro.',
        ],
        visual: { tipo: 'bits', antes: 'A: ███.....   B: .███....', depois: 'canal: █XX█....', legenda: 'X é colisão: A e B se sobrepõem e os dois se perdem' },
      },
      {
        titulo: 'Dois tempos de quadro vulneráveis',
        texto: [
          'No ALOHA puro, um quadro que começa em t colide com qualquer outro que comece entre t - T e t + T. São 2T de perigo, então S = G·e^(-2G).',
          'No ALOHA com intervalos, só colide quem escolheu o mesmo intervalo: T de perigo, S = G·e^(-G).',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Período vulnerável', 'Vazão', 'Pico'],
          linhas: [
            ['ALOHA puro', '2 tempos de quadro', 'S = G·e^(-2G)', `${pc(S61pico)} em G = 0,5`],
            ['ALOHA com intervalos', '1 tempo de quadro', 'S = G·e^(-G)', `${pc(S61slot)} em G = 1`],
          ],
        },
      },
      {
        titulo: 'Carga oferecida contra vazão',
        texto: ['As duas curvas sobem, chegam ao pico e desabam. Do lado direito, tentar mais é entregar menos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['G', 'ALOHA puro', 'ALOHA com intervalos'],
          linhas: [0.25, 0.5, 1, 1.5, 2, 3].map((g) => [br(g, 2), pc(vazaoAloha(g)), pc(vazaoAlohaSlotted(g))]),
        },
      },
      {
        titulo: 'Passou do ponto',
        texto: [
          'Depois do pico, o canal entra num ciclo: colisão gera repetição, repetição gera carga, carga gera colisão. A vazão vai a zero com o canal lotado.',
          'Por isso um ALOHA de verdade precisa segurar as repetições quando o canal congestiona.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'mais carga', x: 300, y: 40 },
            { id: 'k', rotulo: 'mais colisão', x: 500, y: 190 },
            { id: 'r', rotulo: 'mais repetição', x: 100, y: 190 },
          ],
          ligacoes: [
            ['c', 'k', 'gera'],
            ['k', 'r', 'gera'],
            ['r', 'c', 'gera'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um canal em ALOHA com intervalos está com G = 3. O que acontece com a vazão se as estações passarem a tentar menos, até G = 1?',
      opcoes: [`sobe de ${pc(vazaoAlohaSlotted(3))} para ${pc(S61slot)}`, 'cai, porque menos tentativas entregam menos quadros', 'fica igual, porque o canal é o mesmo', `sobe para 100 %, porque não sobra colisão`],
      certa: 0,
      explicacao: `G = 3 está depois do pico: 3·e^(-3) = ${pc(vazaoAlohaSlotted(3))}. Em G = 1, 1·e^(-1) = ${pc(S61slot)}. Ainda sobra colisão e intervalo vazio, então 100 % é impossível.`,
    },
  },
  desafio: {
    carta: [
      'O rádio da praça da matriz liga as barracas da feira ao caixa central. É um rádio antigo, sem relógio comum: cada barraca fala quando quer.',
      `Domingo de feira, a carga foi a G = ${br(G61D, 0)} e o caixa ficou mudo. O feirante do pastel jura que reenviou a venda dele umas vinte vezes.`,
      'Objetivo: medir a vazão como está, levar o canal ao melhor que esse rádio consegue sem trocar o protocolo e responder as duas perguntas.',
    ],
    dicas: [
      'Sem relógio comum, intervalos estão fora. O protocolo continua ALOHA puro.',
      'A curva do ALOHA puro tem pico em G = 0,5.',
    ],
    perguntas: d61,
    respostas: { '1': br(pcN(S61D), 1), '2': br(pcN(S61pico), 1) },
    montar: () => mundoCanal(2610, 'radio-praca', { protocolo: 'aloha', estacoes: 30, carga: G61D, a: 0.01 }, 'Rádio da praça da matriz, em modo de laboratório'),
    objetivo: (m) => [...conferirCanal(m, 'radio-praca', { protocolo: 'aloha', carga: 0.5, vazaoMin: S61pico }), ...todasRespondidas(m, d61)],
    solucao: [
      ['equip', 'radio-praca', 'canal-simular'],
      ['equip', 'radio-praca', 'canal-carga', { g: '0.5' }],
    ],
  },
};

/* ======================================================================
 * ref 62: Escutar antes de falar (4.2.2)
 * ====================================================================== */

const A62 = 0.01;
const G62 = 5;
const V62 = {
  slot: vazaoAlohaSlotted(G62),
  p1: vazaoCsma1p(G62, A62),
  np: vazaoCsmaNp(G62, A62),
  cd: vazaoCsmaCd(G62, A62),
};
const MAX62 = eficienciaCsmaCd(A62);

const p62: Pergunta[] = [
  numerica('1', `Com G = ${G62}, qual é a vazão do CSMA 1-persistente, em %?`, pcN(V62.p1), 0.15),
  numerica('2', `Com G = ${G62}, qual é a vazão do CSMA não persistente, em %?`, pcN(V62.np), 0.15),
];

const A62D = 0.1;
const G62D = 2;
const V62D = { p1: vazaoCsma1p(G62D, A62D), np: vazaoCsmaNp(G62D, A62D), slot: vazaoAlohaSlotted(G62D), aloha: vazaoAloha(G62D), cd: vazaoCsmaCd(G62D, A62D) };
const MAX62D = eficienciaCsmaCd(A62D);

const d62: Pergunta[] = [
  numerica('1', `Com a = ${br(A62D, 1)}, qual seria a eficiência máxima do CSMA/CD com muitas estações, em %?`, pcN(MAX62D), 0.15),
];

const dia62: Dia = {
  numero: 62,
  ato: 3,
  titulo: 'Escutar antes de falar',
  secao: '4.2.2',
  chamado: [
    'CHAMADO #0062',
    'O Condomínio Vila Nova ligou as 40 casas num cabo coaxial único, comprado de segunda mão numa liquidação de sucata. O cabo é curto, o sinal chega rápido, e mesmo assim a rede vive travada.',
    `O controlador do cabo está em ALOHA com intervalos e a carga oferecida é G = ${G62}. Ou seja: as placas falam às cegas num cabo onde daria para escutar antes.`,
    'Objetivo: comparar os CSMA no canal de laboratório, deixar o cabo em CSMA/CD com vazão acima de 90 % e responder as duas perguntas.',
  ],
  manual: {
    titulo: 'CSMA: escutar o canal antes de falar',
    texto: [
      'O ALOHA fala às cegas. Num cabo ou num rádio em que dá para perceber se alguém já está transmitindo, existe uma ideia óbvia e poderosa: escutar antes. É o CSMA, acesso múltiplo com detecção de portadora. A diferença entre as variantes está no que fazer quando o canal está ocupado.',
      'CSMA 1-persistente: se está ocupado, fica escutando e fala assim que vagar, com probabilidade 1. Com pouca carga é ótimo, porque ninguém perde tempo. Com muita, é um desastre: todas as estações que esperavam pulam juntas no mesmo instante e colidem. CSMA não persistente: se está ocupado, desiste por um tempo aleatório e escuta de novo depois. Perde um pouco de tempo com o canal livre, mas espalha as tentativas e aguenta carga alta. CSMA p-persistente, para canais com intervalos: com o canal livre, fala com probabilidade p e adia para o próximo intervalo com probabilidade 1 - p. É o meio-termo, e p ajusta o quanto se arrisca.',
      'Escutar não elimina a colisão, por causa do atraso de propagação. Se duas estações escutam o canal livre e começam quase juntas, uma só percebe a outra quando o sinal chega, τ segundos depois. Por isso os modelos usam a = τ / tempo de quadro: o atraso de propagação medido em quadros. Com a pequeno, o CSMA chega perto da perfeição; com a grande, escutar diz pouco, porque o que se ouve já está velho.',
      'O CSMA/CD (com detecção de colisão) dá mais um passo: escuta enquanto transmite. Se o que ouve não bate com o que mandou, houve colisão, e a estação aborta na hora, em vez de gastar o quadro inteiro. Depois espera um tempo aleatório e tenta de novo. É a Ethernet clássica.',
      'Quanto tempo leva para ter certeza de que não colidiu? No pior caso, 2τ: o sinal leva τ para chegar à ponta mais distante, e uma colisão que aconteça lá leva outros τ para voltar. Depois de transmitir por 2τ sem ouvir colisão, a estação é dona do canal. Por isso o tempo se divide em períodos de disputa de 2τ, de transmissão e de silêncio, e a eficiência máxima com muitas estações é 1/(1 + 2e·a).',
    ],
  },
  dicas: [
    'Troque o protocolo e veja a vazão em cada um. A troca já simula.',
    `Com G = ${G62}, o 1-persistente quase não ganha do ALOHA, e o não persistente passa de 75 %.`,
    'O CSMA/CD aborta a colisão cedo e chega perto da eficiência máxima 1/(1 + 2e·a).',
  ],
  perguntas: p62,
  montar: () => mundoCanal(262, 'coaxial-vila', { protocolo: 'aloha-slotted', estacoes: 40, carga: G62, a: A62 }, 'Controlador do cabo coaxial do Condomínio Vila Nova, em modo de laboratório'),
  objetivo: (m) => [...conferirCanal(m, 'coaxial-vila', { protocolo: 'csma-cd', carga: G62, vazaoMin: 0.9 }), ...todasRespondidas(m, p62)],
  posMorte: [
    `Com G = ${G62}, o ALOHA com intervalos entregava ${pc(V62.slot)}: as placas falavam por cima umas das outras num cabo em que dava para ouvir tudo. O 1-persistente foi quase igual, ${pc(V62.p1)}: escutar ajuda, mas quando todo mundo espera o mesmo silêncio e pula junto, a colisão só muda de lugar.`,
    `O não persistente foi a ${pc(V62.np)}, só por espalhar as tentativas no tempo. E o CSMA/CD chegou a ${pc(V62.cd)}, encostado no teto de ${pc(MAX62)} que a fórmula 1/(1 + 2e·a) dá para a = ${br(A62, 2)}. Colidir continua acontecendo, mas agora custa um período de disputa de 2τ, não um quadro inteiro.`,
    'O cabo da Vila Nova é curto, e isso ajudou muito: com a pequeno, quem escuta ouve o presente. Num cabo comprido, o que se escuta já está atrasado, e todo CSMA perde força.',
  ],
  passos: [
    passo({ ...doCanal('coaxial-vila', 'canal-simular'), instrucao: 'Simule o cabo como está.', porque: `ALOHA com intervalos e G = ${G62}: muito depois do pico de G = 1. É a régua para comparar.`, conferir: (m) => (simulouAgora(m, 'coaxial-vila') ? true : 'A simulação não rodou.'), feito: `${pc(V62.slot)}. O cabo está lotado de tentativas.` }),
    passo({
      ...doCanal('coaxial-vila', 'canal-protocolo'),
      valores: { p: 'csma-1p' },
      instrucao: 'Passe para o CSMA 1-persistente: escuta antes e, se estiver ocupado, fala assim que vagar.',
      porque: 'É a forma mais ansiosa de escutar. Nenhum instante de canal livre é desperdiçado, mas todo mundo que esperava começa no mesmo instante.',
      conferir: (m) => (estado(m, 'coaxial-vila').protocolo === 'csma-1p' && simulouAgora(m, 'coaxial-vila') ? true : 'O protocolo não mudou para csma-1p.'),
      feito: `${pc(V62.p1)}. Quase nada melhor que o ALOHA: com 40 casas e tanta carga, sempre tem gente esperando, e elas pulam juntas.`,
    }),
    passo({ pergunta: '1', exemplo: { resposta: br(pcN(V62.p1), 1) }, instrucao: `Com G = ${G62}, qual é a vazão do 1-persistente, em %?`, porque: 'Está na linha "vazão S" da simulação.', feito: `${pc(V62.p1)}. Escutar sem paciência não resolve.` }),
    passo({
      ...doCanal('coaxial-vila', 'canal-protocolo'),
      pedir: ['p'],
      exemplo: { p: 'csma-np' },
      instrucao: 'Agora escolha o CSMA que, com o canal ocupado, desiste por um tempo aleatório e escuta de novo depois.',
      porque: 'Esse é o não persistente. Em vez de todo mundo ficar de olho no mesmo silêncio, cada um volta num momento diferente.',
      conferir: (m) => {
        const p = estado(m, 'coaxial-vila').protocolo;
        if (p === 'csma-np') return true;
        if (p === 'csma-1p') return 'O 1-persistente fica esperando e fala assim que vagar. O pedido é o que desiste e volta depois.';
        if (p === 'csma-cd' || p === 'csma-ca') return 'Calma, esse vem depois. Primeiro o CSMA simples que espera um tempo aleatório quando ouve o canal ocupado.';
        return 'Esse nem escuta antes de falar. Fique na família CSMA.';
      },
      feito: `${pc(V62.np)}. Mesma escuta, mais paciência, e a vazão multiplicou.`,
    }),
    passo({ pergunta: '2', exemplo: { resposta: br(pcN(V62.np), 1) }, instrucao: `Com G = ${G62}, qual é a vazão do não persistente, em %?`, porque: 'Está na linha "vazão S" da simulação.', feito: `${pc(V62.np)}. Com pouca carga ele perde para o 1-persistente, que nunca deixa o canal livre à toa; com muita, ganha de longe.` }),
    passo({
      escolha: {
        opcoes: [
          'Porque o sinal leva um tempo para chegar: quem começou há pouco ainda não foi ouvido pelos outros',
          'Porque as placas escutam mal',
          'Porque escutar só funciona com tempo dividido em intervalos',
          'Não colidem: com CSMA, colisão é impossível',
        ],
        certa: 0,
        errada: {
          1: 'Mesmo com placa perfeita, o sinal precisa viajar pelo cabo. Durante esse tempo, o canal parece livre para quem está longe.',
          2: 'CSMA funciona com tempo contínuo também. O 1-persistente e o não persistente do laboratório são assim.',
          3: 'Colidem, sim. A simulação mostra tentativas perdidas mesmo no não persistente.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se todo mundo escuta antes, por que ainda há colisão?',
      porque: `O laboratório usa a = ${br(A62, 2)}: o tempo de propagação é 1 % do tempo de um quadro. Pequeno, mas não zero.`,
      feito: 'É o atraso de propagação. Durante τ, duas estações podem achar o canal livre e começar juntas. Quanto maior a, maior essa janela de azar.',
    }),
    passo({
      ...doCanal('coaxial-vila', 'canal-protocolo'),
      pedir: ['p'],
      exemplo: { p: 'csma-cd' },
      instrucao: 'Por fim, escolha o CSMA que continua escutando enquanto transmite e aborta ao perceber colisão.',
      porque: 'Com detecção de colisão, quadro atropelado não ocupa o canal até o fim: a estação percebe em até 2τ, para e tenta de novo depois de um recuo aleatório.',
      conferir: (m) => (estado(m, 'coaxial-vila').protocolo === 'csma-cd' && (ultimo(m)?.vazao ?? 0) >= 0.9 ? true : 'O que escuta enquanto transmite e aborta é o CSMA/CD.'),
      feito: `${pc(V62.cd)}, perto do teto de ${pc(MAX62)} para a = ${br(A62, 2)}. É a Ethernet clássica fazendo o que sabe.`,
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Três jeitos de esperar',
        texto: ['Todo CSMA escuta antes de falar. A diferença é o que faz com o canal ocupado, ou livre.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Variante', 'Canal ocupado', 'Canal livre', 'Ponto forte', 'Ponto fraco'],
          linhas: [
            ['1-persistente', 'fica escutando', 'fala na hora', 'nada de tempo perdido com pouca carga', 'quem esperava pula junto e colide'],
            ['não persistente', 'volta depois de um tempo aleatório', 'fala na hora', 'aguenta carga alta', 'deixa o canal livre à toa'],
            ['p-persistente (com intervalos)', 'espera o próximo intervalo', 'fala com probabilidade p, adia com 1 - p', 'p regula o risco', 'p mal escolhido vira um dos outros dois'],
          ],
        },
      },
      {
        titulo: 'O atraso que engana',
        texto: [
          'O sinal leva τ para atravessar o cabo. Nesse tempo, quem está longe ainda acha o canal livre e pode começar também.',
          'a = τ / tempo de quadro mede isso. Com a pequeno, escutar diz a verdade; com a grande, diz o passado.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'Casa A começa', x: 90, y: 110 },
            { id: 'b', rotulo: 'Casa B ainda ouve silêncio', x: 510, y: 110 },
          ],
          ligacoes: [['a', 'b', 'o sinal leva τ para chegar']],
        },
      },
      {
        titulo: 'Escutar enquanto fala',
        texto: [
          'No CSMA/CD, a estação compara o que ouve com o que manda. Diferença é colisão: aborta, espera um recuo aleatório e tenta de novo.',
          'O pior caso para perceber é 2τ: τ para o sinal ir até a ponta, τ para a colisão voltar. Por isso o tempo se divide em disputa (intervalos de 2τ), transmissão e silêncio.',
        ],
        visual: { tipo: 'bits', antes: 'transmissão | disputa | disputa | transmissão | silêncio', depois: '██████████ | ░ | ░ | ██████████ | ....', legenda: 'Cada período de disputa dura 2τ; uma colisão custa só isso' },
      },
      {
        titulo: 'Vazão com G = 5 e a = 0,01',
        texto: ['O mesmo cabo, a mesma carga, só o protocolo mudando.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Protocolo', 'Vazão S'],
          linhas: [
            ['ALOHA com intervalos', pc(V62.slot)],
            ['CSMA 1-persistente', pc(V62.p1)],
            ['CSMA não persistente', pc(V62.np)],
            ['CSMA/CD', `${pc(V62.cd)} (teto de ${pc(MAX62)})`],
          ],
        },
      },
      {
        titulo: 'Cabo comprido, CSMA fraco',
        texto: ['A eficiência máxima do CSMA/CD com muitas estações é 1/(1 + 2e·a). Cresceu a, caiu tudo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['a', 'Teto do CSMA/CD', 'CSMA não persistente com G = 5'],
          linhas: [0.01, 0.1, 0.5].map((a) => [br(a, 2), pc(eficienciaCsmaCd(a)), pc(vazaoCsmaNp(5, a))]),
        },
      },
    ],
    checagem: {
      pergunta: 'Num canal muito carregado, por que o CSMA 1-persistente rende tão pouco?',
      opcoes: [
        'Porque as estações que esperavam o canal vagar começam todas no mesmo instante e colidem',
        'Porque ele não escuta o canal antes de falar',
        'Porque ele espera tempo demais com o canal livre',
        'Porque ele só funciona com intervalos',
      ],
      certa: 0,
      explicacao: 'Ele escuta, sim, e nunca desperdiça canal livre. O problema é a persistência: com muita gente na espera, o fim de cada quadro vira largada coletiva.',
    },
  },
  desafio: {
    carta: [
      `A Escola do Alto liga os laboratórios por um cabo comprido que dá a volta no pátio. O atraso de propagação é a = ${br(A62D, 1)}, dez vezes o do condomínio, e a carga oferecida é G = ${G62D}.`,
      'As placas são velhas: escutam o canal antes de falar, mas não conseguem escutar enquanto transmitem. CSMA/CD está fora de questão, até chegar a verba das placas novas.',
      'Objetivo: deixar o cabo no protocolo de maior vazão que essas placas conseguem, entre ALOHA e CSMA sem detecção de colisão, e responder quanto o CSMA/CD daria de teto quando a verba vier.',
    ],
    dicas: [
      `Compare o 1-persistente (hoje em ${pc(V62D.p1)}), o não persistente e os ALOHA com essa carga. Cada troca já simula.`,
      `O teto do CSMA/CD é 1/(1 + 2e·a), com a = ${br(A62D, 1)}.`,
    ],
    perguntas: d62,
    respostas: { '1': br(pcN(MAX62D), 1) },
    montar: () => mundoCanal(2620, 'cabo-alto', { protocolo: 'csma-1p', estacoes: 25, carga: G62D, a: A62D }, 'Controlador do cabo da Escola do Alto, em modo de laboratório'),
    objetivo: (m) => [...conferirCanal(m, 'cabo-alto', { protocolo: 'csma-np', carga: G62D, vazaoMin: V62D.np }), ...todasRespondidas(m, d62)],
    solucao: [
      ['equip', 'cabo-alto', 'canal-protocolo', { p: 'csma-np' }],
    ],
  },
};

export const ATO3A: Dia[] = [dia60, dia61, dia62];
