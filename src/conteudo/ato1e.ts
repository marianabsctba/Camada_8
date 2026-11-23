// Dias novos do ato 1 (A Rua), com prática guiada, aula e desafio no próprio dia.
// As gerações do celular, a comparação das redes de acesso e a política da camada física (2.6.5 a 2.6.7, 2.9 e 2.10).

import { snrWifi } from '../motor/aparelhos';
import { avaliar, fspl, radioDados } from '../motor/fisico';
import { vazao } from '../motor/rede';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, TRANSCEPTORES, type Equipamento, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

const ip = (s: string) => lerCidr(s)!;

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

/** Conferência de um passo de ping: todas as respostas voltaram. */
const pingou = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  if (!r) return 'O ping não aconteceu.';
  return r.recebidos === r.n || `Voltaram ${r.recebidos} de ${r.n}. Confira se o rádio está associado.`;
};

/** Média do último ping registrado, em ms (ou -1 se ainda não houve ping). */
const mediaPing = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  return r && Number.isFinite(r.media) ? r.media : -1;
};

/** Um rádio com antena: estação, célula pequena, celular ou antena externa. */
function radio(nome: string, modelo: string, antena: Equipamento['antena'], rumo: number, alturaMax: number): Equipamento {
  const e = aparelho(nome, 'radio', modelo, [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax });
  e.antena = antena;
  return e;
}

/** O rádio do cabo está associado e com RSSI de pelo menos o mínimo pedido? */
function radioOk(m: Mundo, cabo: string, minimo = -65) {
  const c = m.cabos.get(cabo)!;
  const d = radioDados(m, c);
  return { ok: avaliar(m, c).up && d.rssi >= minimo, rssi: d.rssi };
}

/** Põe o mesmo transceptor nas portas SFP indicadas. */
function sfp(e: Equipamento, modelo: string, ...portas: string[]): Equipamento {
  for (const p of e.portas) if (portas.includes(p.nome)) p.sfp = { ...TRANSCEPTORES[modelo]! };
  return e;
}

/** Número com vírgula decimal, para os textos. */
const br = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');

/* ======================================================================
 * ref 54: Do 3G ao 5G (2.6.5 a 2.6.7)
 * ====================================================================== */

const p54: Pergunta[] = [
  numerica('1', 'Qual a perda no espaço livre do enlace entre a célula pequena e o celular da praça, em dB? (uma casa decimal)', fspl(0.2, 26), 0.1),
  numerica('2', 'Se a célula de 26 GHz estivesse a 2 km, como a torre da escola, de quanto seria a perda no espaço livre, em dB? (uma casa decimal)', fspl(2, 26), 0.1),
];

const d54: Pergunta[] = [
  numerica('1', 'Qual a perda no espaço livre do enlace de 3,5 GHz até a cabine de imprensa, em dB? (uma casa decimal)', fspl(0.5, 3.5), 0.1),
  texto('2', 'Que recurso do 5G divide a mesma rede física em redes lógicas com garantias diferentes, uma para a ambulância e outra para a torcida?', /fatia|slicing/i),
];

const dia54: Dia = {
  numero: 54,
  ato: 1,
  titulo: 'Do 3G ao 5G',
  chamado: [
    'CHAMADO #0054',
    'A Alô Logo anunciou o 5G em Fim de Linha com carro de som, balão e jingle. Na praça, instalou uma célula pequena de 26 GHz num poste; a torre de 700 MHz continua servindo a escola, a 2 km dali.',
    'O celular de teste da praça mostra o ícone do 5G no anúncio e nenhuma barrinha na vida real. Quem parafusou a célula deixou o feixe olhando para o muro da igreja.',
    'Objetivo: o celular da praça associado à célula pequena com RSSI de -65 dBm ou melhor, um ping de 10 pedidos do notebook da praça até o servidor, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'As gerações da rede celular: 3G, 4G e 5G',
    texto: [
      'O 3G foi a geração que tratou voz e dados como coisas digitais de verdade. No rádio, usou CDMA de banda larga: todos os aparelhos da célula transmitem ao mesmo tempo, na mesma faixa larga, e cada um é separado dos outros por um código próprio, como várias conversas numa sala em que cada dupla fala uma língua diferente. A voz ainda andava por circuito, e os dados, por pacote, num núcleo que tinha as duas partes.',
      'O 4G jogou fora o circuito: tudo é pacote, até a voz, e o núcleo da rede é todo IP. No rádio, trocou o código pelo OFDM, que corta a faixa em centenas de subportadoras estreitas e ortogonais (não se atrapalham, mesmo encostadas). A estação reparte essa grade de frequência e de tempo entre os aparelhos, um pedaço para cada um, a cada fração de segundo.',
      'O 5G mantém o OFDM e o núcleo IP e mexe em três frentes. Usa também ondas milimétricas, faixas acima de 24 GHz em que sobra muita banda, mas o sinal perde muito mais no caminho e morre em parede, folha e chuva. Por isso vêm as células pequenas: estações do tamanho de uma caixa de sapato em postes e fachadas, cada uma cobrindo poucas centenas de metros.',
      'Para compensar a perda, a estação 5G tem dezenas de antenas (MIMO massivo) e faz formação de feixe: em vez de espalhar o sinal em leque, concentra a energia num feixe estreito apontado para cada aparelho. Apontado errado, o feixe ilumina o muro. Neste jogo, apontar o feixe é girar a antena; numa célula de verdade, isso é feito eletronicamente, sem nada se mexer.',
      'O 5G também mira atraso bem menor que o do 4G e o fatiamento da rede: a mesma rede física vira várias redes lógicas, cada uma com as suas garantias. Uma fatia para a ambulância, com atraso mínimo; outra para milhares de sensores que mandam pouco dado; outra para a torcida assistindo ao jogo. E a regra de ouro continua: frequência baixa vai longe e carrega pouco; frequência alta carrega muito e vai perto.',
    ],
  },
  dicas: [
    'Compare as duas células: veja o enlace da torre de 700 MHz e os detalhes do enlace de 26 GHz da praça.',
    'Nos detalhes do enlace c2 aparece a perda no espaço livre. A calculadora de espaço livre da aula faz a conta para 2 km.',
    'Gire a antena da celula-26 para 45°, depois ping de 10 pedidos do notebook-praca para 192.0.2.1.',
  ],
  perguntas: p54,
  montar: () => {
    const m = novoMundo(154);
    adicionar(m, pc('notebook-praca', { modelo: 'Notebook de teste na praça, ligado ao celular pelo cabo de dados', ttl: 64, ip: ip('192.0.2.60/24') }));
    adicionar(m, radio('celular-praca', 'Celular de teste na mão, no banco da praça (antena interna de 2 dBi)', { ganho: 2, azimute: 225, azimuteCerto: 225, altura: 1.5, feixe: 360 }, 225, 2));
    adicionar(m, radio('celula-26', 'Célula pequena 5G de 26 GHz no poste da praça, MIMO massivo com feixe de 12° e 25 dBi', { ganho: 25, azimute: 225, azimuteCerto: 45, altura: 6, feixe: 12 }, 45, 8));
    adicionar(m, radio('celular-escola', 'Celular de teste da escola, preso na janela do 2º andar (antena interna de 2 dBi)', { ganho: 2, azimute: 300, azimuteCerto: 300, altura: 9, feixe: 360 }, 300, 9));
    adicionar(m, radio('erb-700', 'Estação rádio-base 4G da caixa d\'água, setor de 65° e 17 dBi, 700 MHz', { ganho: 17, azimute: 120, azimuteCerto: 120, altura: 30, feixe: 65 }, 120, 30));
    adicionar(m, comutador('nucleo', { modelo: 'Núcleo da rede móvel no rack do galpão, todo IP' }));
    adicionar(m, pc('servidor', { modelo: 'Servidor de teste na saída para a internet, com Pinguix', ttl: 64, ip: ip('192.0.2.1/24') }));
    ligar(m, { equip: 'notebook-praca', porta: 'eth0' }, { equip: 'celular-praca', porta: 'lan' }, 'cat6', 1, { id: 'c1' });
    ligar(m, { equip: 'celular-praca', porta: 'ar' }, { equip: 'celula-26', porta: 'ar' }, 'radio', 200, { id: 'c2', radio: { distanciaKm: 0.2, freqGHz: 26, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'celula-26', porta: 'lan' }, { equip: 'nucleo', porta: 'p1' }, 'cat6', 60, { id: 'c3' });
    ligar(m, { equip: 'celular-escola', porta: 'ar' }, { equip: 'erb-700', porta: 'ar' }, 'radio', 2000, { id: 'c4', radio: { distanciaKm: 2, freqGHz: 0.7, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'erb-700', porta: 'lan' }, { equip: 'nucleo', porta: 'p2' }, 'cat6', 80, { id: 'c5' });
    ligar(m, { equip: 'nucleo', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 3, { id: 'c6' });
    m.proxCabo = 7;
    return m;
  },
  objetivo: (m) => {
    const r = radioOk(m, 'c2');
    return [
      item('celular da praça associado à célula pequena, com RSSI de -65 dBm ou melhor', r.ok, `${r.rssi.toFixed(1)} dBm`),
      pingOk(m, 'notebook-praca', '192.0.2.1', 10),
      ...todasRespondidas(m, p54),
    ];
  },
  posMorte: [
    `O feixe da célula pequena tem só 12° e estava apontado para 225°, o lado oposto do banco da praça, que fica a 45°. Com o feixe no rumo certo, o RSSI subiu para ${br(-59.76)} dBm e o celular associou a 300 Mb/s. Um feixe estreito concentra a energia, e é por isso que ele funciona; é também por isso que, errado, ele não funciona nada.`,
    `A torre de 700 MHz perde ${br(fspl(2, 0.7))} dB nos 2 km até a escola. A célula de 26 GHz já perde ${br(fspl(0.2, 26))} dB em 200 m e, se estivesse a 2 km, perderia ${br(fspl(2, 26))} dB: ${br(fspl(2, 26) - fspl(2, 0.7))} dB a mais que a de 700 MHz na mesma distância. Com os mesmos 20 dBm e as mesmas antenas, o celular receberia ${br(-79.76)} dBm, raspando nos -80 dBm em que o rádio nem associa. E isso sem contar parede, árvore e chuva, que nas ondas milimétricas pesam muito mais.`,
    'Por que, então, 26 GHz? Porque lá em cima sobra banda: dá para usar canais muito mais largos que em 700 MHz, e cada célula pequena serve pouca gente, perto, com muita capacidade. A operadora usa as duas pontas: frequência baixa para cobrir a cidade, frequência alta onde junta multidão.',
  ],
  passos: [
    passo({ alvo: ['equip', 'erb-700'], acao: 'mostra', instrucao: 'Na estação de 700 MHz da caixa d\'água, veja o enlace com o celular da escola.', porque: 'Ela é a régua: frequência baixa, 2 km de distância e um setor largo de 65°. Compare com a célula da praça.', feito: `RSSI de ${br(-56.36)} dBm a 2 km: associado a 300 Mb/s. A 700 MHz, o sinal vai longe sem esforço.` }),
    passo({ alvo: ['cabo', 'c2'], acao: 'detalhes', instrucao: 'Agora veja os detalhes do enlace c2, entre a célula pequena de 26 GHz e o celular da praça.', porque: 'Os detalhes mostram a perda no espaço livre e o desalinhamento da antena, separados. Assim dá para ver o que é física e o que é parafuso.', feito: 'Duas perdas grandes: a do espaço livre, mesmo em só 200 m, e a do feixe apontado para o lado errado. O rádio nem associa.' }),
    passo({ pergunta: '1', exemplo: { resposta: br(fspl(0.2, 26)).replace(',', '.') }, instrucao: 'Qual a perda no espaço livre do enlace c2, em dB?', porque: 'Está na primeira linha dos detalhes. A conta é 32,44 + 20 log(distância em km) + 20 log(frequência em MHz).', feito: `${br(fspl(0.2, 26))} dB em 200 m. A torre de 700 MHz perde menos que isso em 2 km.` }),
    passo({ pergunta: '2', exemplo: { resposta: br(fspl(2, 26)).replace(',', '.') }, instrucao: 'Se a célula de 26 GHz estivesse a 2 km, como a torre, de quanto seria a perda no espaço livre?', porque: 'Use a calculadora de espaço livre da aula ou faça a conta: 10 vezes mais distância somam 20 dB.', feito: `${br(fspl(2, 26))} dB, ${br(fspl(2, 26) - fspl(2, 0.7))} dB a mais que 700 MHz na mesma distância. É por isso que onda milimétrica vive em célula pequena.` }),
    passo({
      alvo: ['equip', 'celula-26'],
      acao: 'antena',
      pedir: ['azimute'],
      valores: { altura: '6' },
      exemplo: { azimute: '45' },
      instrucao: 'Aponte o feixe da célula pequena para o celular da praça.',
      porque: 'Com MIMO massivo, a célula concentra a energia num feixe estreito, de 12°. O azimute certo é o rumo até o celular, que o menu da antena mostra.',
      conferir: (m) => {
        const r = radioOk(m, 'c2');
        return r.ok || `RSSI de ${r.rssi.toFixed(1)} dBm. O rumo até o celular é 45°, e o feixe tem só 12°: não dá para chutar perto.`;
      },
      feito: `RSSI de ${br(-59.76)} dBm. O feixe estreito ganhou de volta o que a frequência alta perde no caminho.`,
    }),
    passo({ alvo: ['equip', 'notebook-praca'], acao: 'ping', valores: { destino: '192.0.2.1', n: '10' }, instrucao: 'Do notebook da praça, mande 10 pings ao servidor, passando pela célula pequena.', porque: 'O pacote cruza 200 m de ar, desce pelo cabo até o núcleo todo IP e chega ao servidor. No 4G e no 5G, até a voz faz esse caminho como pacote.', conferir: pingou('notebook-praca', '192.0.2.1'), feito: 'Dez respostas. O ícone do 5G finalmente diz a verdade.' }),
    passo({
      escolha: {
        opcoes: [
          'Fatiamento da rede: uma rede física dividida em redes lógicas, cada uma com as suas garantias',
          'CDMA de banda larga: cada serviço com um código diferente',
          'Ondas milimétricas: cada serviço numa frequência acima de 24 GHz',
          'Comutação de circuitos: uma linha reservada para cada aparelho',
        ],
        certa: 0,
        errada: {
          1: 'CDMA separa aparelhos no rádio do 3G. Não promete atraso para a ambulância nem trata os sensores diferente da torcida.',
          2: 'Onda milimétrica é uma faixa de frequência, com alcance curto. Não garante nada a ninguém.',
          3: 'Circuito reservado foi justamente o que o 4G aposentou: desperdiça a linha quando ninguém fala.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O hospital quer que a ambulância tenha atraso mínimo garantido, os sensores da represa sejam milhares na mesma célula e a torcida veja o jogo, tudo na mesma rede. Que recurso do 5G é esse?',
      porque: 'São três necessidades diferentes numa rede física só. O 5G separa essas necessidades sem construir três redes.',
      feito: 'Fatiamento. Cada fatia é uma rede lógica com regras próprias, sobre as mesmas torres, as mesmas antenas e o mesmo núcleo.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Três gerações, três ideias',
        texto: ['Cada geração mudou o jeito de dividir o rádio e o que o núcleo carrega. As células, a estação e o núcleo continuam lá.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Geração', 'No rádio', 'No núcleo', 'A novidade'],
          linhas: [
            ['3G', 'CDMA de banda larga: todos ao mesmo tempo, cada um com seu código', 'voz por circuito, dados por pacote', 'voz e dados digitais, internet no celular'],
            ['4G', 'OFDM: centenas de subportadoras estreitas repartidas entre os aparelhos', 'todo IP, até a voz', 'comutação de pacotes em tudo'],
            ['5G', 'OFDM também em ondas milimétricas, com MIMO massivo e feixes', 'todo IP, fatiado', 'células pequenas, atraso menor, fatiamento'],
          ],
        },
      },
      {
        titulo: 'OFDM: a grade do 4G',
        texto: [
          'A faixa vira uma grade: subportadoras na frequência, fatias no tempo. A estação dá cada quadradinho a um aparelho, e quem precisa de mais ganha mais quadradinhos.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tempo', 'subportadora 1', 'subportadora 2', 'subportadora 3', 'subportadora 4'],
          linhas: [
            ['instante 1', 'escola', 'escola', 'posto', 'praça'],
            ['instante 2', 'posto', 'escola', 'praça', 'praça'],
            ['instante 3', 'praça', 'praça', 'praça', 'escola'],
          ],
        },
      },
      {
        titulo: 'Frequência alta: muita banda, pouco alcance',
        texto: [
          'A perda no espaço livre cresce 20 dB a cada 10 vezes mais frequência. A 2 km, 26 GHz perde 31,4 dB a mais que 700 MHz. Em troca, lá em cima sobra banda para canais muito largos.',
        ],
        visual: { tipo: 'calculadora', formula: 'fspl' },
      },
      {
        titulo: 'Célula pequena, MIMO e feixe',
        texto: [
          'A célula pequena cobre poucas centenas de metros. Com dezenas de antenas, ela forma um feixe estreito para cada aparelho, em vez de espalhar sinal em leque.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 't', rotulo: 'torre 700 MHz', x: 90, y: 120 },
            { id: 'c', rotulo: 'célula pequena 26 GHz', x: 330, y: 120 },
            { id: 'a', rotulo: 'celular no banco', x: 560, y: 50 },
            { id: 'b', rotulo: 'celular no coreto', x: 560, y: 190 },
          ],
          ligacoes: [
            ['t', 'c', 'cobertura larga, pouca banda'],
            ['c', 'a', 'feixe 1'],
            ['c', 'b', 'feixe 2'],
          ],
        },
      },
      {
        titulo: 'Fatiamento da rede',
        texto: ['Uma rede física, várias redes lógicas, cada uma com as suas garantias.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r', rotulo: 'rede física 5G', x: 100, y: 120 },
            { id: 'f1', rotulo: 'fatia da ambulância', x: 450, y: 40 },
            { id: 'f2', rotulo: 'fatia dos sensores', x: 450, y: 120 },
            { id: 'f3', rotulo: 'fatia da torcida', x: 450, y: 200 },
          ],
          ligacoes: [
            ['r', 'f1', 'atraso mínimo'],
            ['r', 'f2', 'muitos aparelhos'],
            ['r', 'f3', 'muita banda'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que a célula de 26 GHz fica num poste da praça, e não no alto da torre cobrindo a cidade inteira?',
      opcoes: [
        'Porque a frequência alta perde muito mais no caminho e em obstáculos, e a célula serve muita gente perto, com muita banda',
        'Porque 26 GHz só funciona de noite',
        'Porque o núcleo IP não aceita torres altas',
        'Porque célula pequena dispensa o núcleo da rede',
      ],
      certa: 0,
      explicacao: 'Onda milimétrica vai perto e carrega muito. Na torre alta, ela perderia o sinal antes de chegar; no poste, atende a multidão da praça com feixes estreitos.',
    },
  },
  desafio: {
    carta: [
      'Ofício do clube: "a final do campeonato regional é domingo no estádio municipal. A Alô Logo pôs na torre um setor de 3,5 GHz com MIMO massivo só para o jogo. O teste da cabine de imprensa deu zero barrinha. A narração vai ser por pombo-correio."',
      'O setor novo saiu da fábrica apontado para o cemitério, que tem ótima audiência e nenhum celular.',
      'Objetivo: o celular da cabine de imprensa associado ao setor de 3,5 GHz com RSSI de -65 dBm ou melhor, e as duas perguntas respondidas.',
    ],
    dicas: [
      'Veja para onde o setor aponta e qual é o rumo até a cabine de imprensa.',
      'Gire a antena do setor-35 para o rumo que o menu mostra, 300°. A perda no espaço livre aparece nos detalhes do enlace c1.',
    ],
    perguntas: d54,
    montar: () => {
      const m = novoMundo(1554);
      adicionar(m, radio('celular-cabine', 'Celular de teste na cabine de imprensa do estádio, a 12 m do chão (2 dBi)', { ganho: 2, azimute: 120, azimuteCerto: 120, altura: 12, feixe: 360 }, 120, 12));
      adicionar(m, radio('setor-35', 'Setor 5G de 3,5 GHz na torre, MIMO massivo com feixe de 20° e 20 dBi', { ganho: 20, azimute: 120, azimuteCerto: 300, altura: 35, feixe: 20 }, 300, 40));
      adicionar(m, comutador('nucleo', { modelo: 'Núcleo da rede móvel no rack do galpão, todo IP' }));
      ligar(m, { equip: 'celular-cabine', porta: 'ar' }, { equip: 'setor-35', porta: 'ar' }, 'radio', 500, { id: 'c1', radio: { distanciaKm: 0.5, freqGHz: 3.5, obstaculoM: 0, ptxDbm: 20 } });
      ligar(m, { equip: 'setor-35', porta: 'lan' }, { equip: 'nucleo', porta: 'p1' }, 'cat6', 50, { id: 'c2' });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => {
      const r = radioOk(m, 'c1');
      return [item('celular da cabine associado ao setor de 3,5 GHz, com RSSI de -65 dBm ou melhor', r.ok, `${r.rssi.toFixed(1)} dBm`), ...todasRespondidas(m, d54)];
    },
    solucao: [
      ['equip', 'setor-35', 'mostra'],
      ['cabo', 'c1', 'detalhes'],
      ['equip', 'setor-35', 'antena', { azimute: '300', altura: '35' }],
    ],
    respostas: { '1': fspl(0.5, 3.5).toFixed(1), '2': 'fatiamento' },
  },
};

/* ======================================================================
 * ref 55: Qual acesso para quem (2.9)
 * ====================================================================== */

const p55: Pergunta[] = [numerica('1', 'Qual a média do ping da fazenda até o servidor, pelo satélite geoestacionário, em ms? (sem casas decimais basta)', mediaPing('fazenda', '192.0.2.1'), 1)];

/** Vazão do posto até o servidor da teleconsulta, pela conta do motor. */
const vazaoPosto = (m: Mundo) => {
  const v = vazao(m, 'posto', 'servidor-tele');
  return typeof v === 'string' ? -1 : v.mbps;
};

const d55: Pergunta[] = [numerica('1', 'Depois da troca, quantos Mb/s úteis o posto mede até o servidor da teleconsulta? (duas casas decimais)', vazaoPosto, 0.05)];

const dia55: Dia = {
  numero: 55,
  ato: 1,
  titulo: 'Qual acesso para quem',
  chamado: [
    'CHAMADO #0055',
    'Antes de acender a Rua das Acácias, a câmara quer um parecer: "cada vereador defende um acesso diferente, e todos têm certeza. Queremos números, não discurso."',
    'No galpão está montada uma bancada com quatro acessos até o mesmo servidor: o prédio por fibra, uma casa por cabo coaxial, a fazenda por satélite geoestacionário e o sítio por rádio.',
    'Objetivo: medir a vazão pelos acessos, um ping de 10 pedidos da fazenda até o servidor e a pergunta respondida. Depois, o parecer: qual acesso para o prédio e qual para a escola rural.',
  ],
  manual: {
    titulo: 'Comparando as redes de acesso',
    texto: [
      'Não existe acesso melhor em tudo; existe o acesso certo para cada lugar. Quatro perguntas decidem: quanto de vazão chega, quanto atraso tem, quanta gente divide o mesmo meio e quanto custa levar até lá. Os acessos terrestres (fibra, cabo coaxial e ADSL no par de cobre do telefone) ganham em vazão e atraso; o satélite ganha onde nada terrestre chega.',
      'No cabo coaxial, o canal de descida é compartilhado: todas as casas do mesmo trecho da rede de cabo ouvem o mesmo sinal e dividem a mesma capacidade. Sozinha numa bancada, a casa mede tanto quanto a fibra; às oito da noite, com a rua inteira assistindo a vídeo, cada uma fica com uma fatia. Na fibra até a casa também há divisão no trecho óptico, mas a capacidade é tão grande que quase ninguém percebe.',
      'No ADSL, o problema é a distância. Ele usa as frequências altas do par de cobre, acima da voz, e o cobre come essas frequências a cada metro. Perto da central telefônica, a linha tem SNR alta e taxa boa; a alguns quilômetros, a SNR despenca e, com ela, a capacidade de Shannon. Não é compartilhado: cada casa tem o seu par, mas cada par tem o seu comprimento.',
      'No satélite geoestacionário, o problema é o atraso. O satélite fica a 35.786 km de altura, e cada pedido sobe e desce duas vezes (ida e volta): só de propagação, perto de meio segundo por ping. A vazão até serve para vídeo; para videochamada e jogo, a conversa fica cheia de "câmbio". Órbita baixa corta o atraso, com mais satélites para manter a cobertura.',
      'A fibra é a melhor em quase tudo, e a mais cara de levar: o custo está em puxar cabo, abrir vala, pendurar em poste e passar em cada casa. Em prédio e rua densa, o custo se divide por muita gente; numa fazenda a 40 km, alguém pagaria quilômetros de cabo por uma casa só. Para o meio do caminho, o rádio com visada costuma resolver.',
    ],
  },
  dicas: [
    'A medição de vazão sai do PC de cada acesso até o mesmo servidor. Comece pelo prédio e pela casa do cabo.',
    'O ping da fazenda vai demorar: a média aparece na última linha. Depois meça a vazão do sítio, pelo rádio.',
    'Prédio denso no centro: fibra. Escola rural com visada para a torre e longe da central telefônica: rádio.',
  ],
  perguntas: p55,
  montar: () => {
    const m = novoMundo(155);
    adicionar(m, pc('predio', { modelo: 'PC do apartamento 301 do Edifício Acácias, por fibra', ttl: 64, ip: ip('192.0.2.11/24') }));
    adicionar(m, pc('casa-cabo', { modelo: 'PC da casa 5, pela rede de cabo coaxial da antiga TV a cabo', ttl: 128, ip: ip('192.0.2.12/24') }));
    adicionar(m, pc('fazenda', { modelo: 'PC da Fazenda Fim do Mundo, por satélite geoestacionário', ttl: 64, ip: ip('192.0.2.13/24') }));
    adicionar(m, pc('sitio', { modelo: 'PC do Sítio Boa Vista, por rádio de 5,8 GHz', ttl: 64, ip: ip('192.0.2.14/24') }));
    adicionar(m, sfp(comutador('ont', { modelo: 'Terminal de fibra do prédio', portas: 2, sfp: 1 }), 'LX-10', 'sfp1'));
    adicionar(m, aparelho('modem-cabo', 'cablemodem', 'Cable modem DOCSIS da casa 5', [{ nome: 'rf', fisica: 'coax' }, { nome: 'lan' }]));
    adicionar(m, aparelho('cmts', 'cmts', 'Cabeça da rede de cabo no galpão, que serve a rua inteira pelo mesmo canal', [{ nome: 'saida', fisica: 'coax' }, { nome: 'lan' }]));
    adicionar(m, aparelho('terminal', 'terminal-sat', 'Terminal de satélite da fazenda', [{ nome: 'lan' }, { nome: 'ceu', fisica: 'sat' }]));
    adicionar(m, aparelho('gateway', 'gateway-sat', 'Estação terrena da Céu Aberto Satélites', [{ nome: 'ceu', fisica: 'sat' }, { nome: 'lan' }]));
    adicionar(m, radio('radio-sitio', 'Rádio PTP 5,8 GHz do sítio, antena de 23 dBi', { ganho: 23, azimute: 135, azimuteCerto: 135, altura: 20, feixe: 9 }, 135, 30));
    adicionar(m, radio('radio-torre', 'Rádio PTP 5,8 GHz na torre do galpão, antena de 23 dBi', { ganho: 23, azimute: 315, azimuteCerto: 315, altura: 20, feixe: 9 }, 315, 30));
    adicionar(m, sfp(comutador('sw-galpao', { modelo: 'Switch do rack do galpão SG-8', sfp: 1 }), 'LX-10', 'sfp1'));
    adicionar(m, pc('servidor', { modelo: 'Servidor de teste do galpão, com Pinguix', ttl: 64, mdix: true, ip: ip('192.0.2.1/24') }));
    ligar(m, { equip: 'predio', porta: 'eth0' }, { equip: 'ont', porta: 'p1' }, 'cat6', 5, { id: 'c1' });
    ligar(m, { equip: 'ont', porta: 'sfp1' }, { equip: 'sw-galpao', porta: 'sfp1' }, 'fibra', 1500, { id: 'c2' });
    ligar(m, { equip: 'casa-cabo', porta: 'eth0' }, { equip: 'modem-cabo', porta: 'lan' }, 'cat6', 3, { id: 'c3' });
    ligar(m, { equip: 'cmts', porta: 'saida' }, { equip: 'modem-cabo', porta: 'rf' }, 'coax', 300, { id: 'c4', coax: { tapDbmv: 6, elementos: [{ tipo: 'cabo', modelo: 'rg6', metros: 30 }, { tipo: 'conector' }] } });
    ligar(m, { equip: 'cmts', porta: 'lan' }, { equip: 'sw-galpao', porta: 'p2' }, 'cat6', 5, { id: 'c5' });
    ligar(m, { equip: 'fazenda', porta: 'eth0' }, { equip: 'terminal', porta: 'lan' }, 'cat6', 10, { id: 'c6' });
    ligar(m, { equip: 'terminal', porta: 'ceu' }, { equip: 'gateway', porta: 'ceu' }, 'satelite', 0, { id: 'c7', sat: { orbita: 'geo' } });
    ligar(m, { equip: 'gateway', porta: 'lan' }, { equip: 'sw-galpao', porta: 'p3' }, 'cat6', 20, { id: 'c8' });
    ligar(m, { equip: 'sitio', porta: 'eth0' }, { equip: 'radio-sitio', porta: 'lan' }, 'cat6', 10, { id: 'c9' });
    ligar(m, { equip: 'radio-sitio', porta: 'ar' }, { equip: 'radio-torre', porta: 'ar' }, 'radio', 3000, { id: 'c10', radio: { distanciaKm: 3, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'radio-torre', porta: 'lan' }, { equip: 'sw-galpao', porta: 'p4' }, 'cat6', 40, { id: 'c11' });
    ligar(m, { equip: 'sw-galpao', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 3, { id: 'c12' });
    m.proxCabo = 13;
    m.flags.servidorTeste = 'servidor';
    return m;
  },
  objetivo: (m) => [
    item('vazão medida em pelo menos um acesso', m.flags.ultimaVazao !== undefined),
    pingOk(m, 'fazenda', '192.0.2.1', 10),
    ...todasRespondidas(m, p55),
  ],
  posMorte: [
    'O prédio, por fibra, e a casa, pelo cabo coaxial, mediram os mesmos 949,28 Mb/s: os dois enlaces levam 1000 Mb/s, e na bancada a casa está sozinha na rede de cabo. Na rua de verdade, o canal de descida do cabo é um só para todas as casas do trecho, e às oito da noite a conta se divide. O sítio, por rádio, mediu 284,79 Mb/s; a fazenda, por satélite, fica nos 50 Mb/s do enlace geoestacionário.',
    'O ping da fazenda passou de meio segundo: quatro viagens de 35.786 km por pedido, ida e volta, mais o processamento em solo. Para baixar a previsão do tempo, tudo bem. Para videochamada, cada "oi" chega depois do "tchau".',
    'O parecer para a câmara: fibra onde há gente junta, porque o custo se divide; rádio onde há visada e pouca gente; satélite onde nada mais chega; ADSL só perto da central, e cabo coaxial onde a rede de TV antiga já está pendurada no poste. Cada vereador estava certo sobre um pedaço da cidade.',
  ],
  passos: [
    passo({ alvo: ['equip', 'predio'], acao: 'vazao', instrucao: 'Do apartamento do prédio, meça a vazão até o servidor do galpão.', porque: 'Para comparar acessos, meça todos até o mesmo servidor: o que mudar no resultado é culpa do acesso.', conferir: (m) => (m.flags.ultimaVazao !== undefined ? true : 'A medição não aconteceu.'), feito: '949,28 Mb/s. O enlace mais lento do caminho é de 1000 Mb/s, e a fibra nem está perto do limite dela.' }),
    passo({ alvo: ['equip', 'casa-cabo'], acao: 'vazao', instrucao: 'Agora meça da casa ligada pelo cabo coaxial.', porque: 'O cable modem conversa com a cabeça da rede de cabo no galpão por um canal de descida que, na rua, é de todas as casas do trecho.', conferir: (m) => (m.flags.ultimaVazao !== undefined ? true : 'A medição não aconteceu.'), feito: 'O mesmo número da fibra. Na bancada, a casa está sozinha no canal. Com 50 casas assistindo a vídeo ao mesmo tempo, os 1000 Mb/s viram uns 20 Mb/s para cada uma.' }),
    passo({ alvo: ['equip', 'fazenda'], acao: 'ping', valores: { destino: '192.0.2.1', n: '10' }, instrucao: 'Da fazenda, mande 10 pings ao servidor, pelo satélite geoestacionário.', porque: 'Vazão não é tudo. O ping mede o atraso, e o satélite está a 35.786 km de altura.', conferir: pingou('fazenda', '192.0.2.1'), feito: 'Dez respostas, todas sem pressa nenhuma.' }),
    passo({ pergunta: '1', exemplo: { resposta: '511.6' }, instrucao: 'Qual foi a média do ping da fazenda, em ms?', porque: 'A média aparece na última linha do ping. Cada pedido sobe ao satélite, desce no gateway, e a resposta faz o mesmo caminho de volta.', feito: 'Mais de meio segundo. Só a luz subindo e descendo duas vezes gasta quase tudo isso; nenhuma configuração resolve.' }),
    passo({ alvo: ['equip', 'sitio'], acao: 'vazao', instrucao: 'Agora meça a vazão do sítio, pelo rádio de 5,8 GHz.', porque: 'O rádio ponto a ponto é o meio-termo: não precisa de cabo até a casa, só de visada livre até a torre.', conferir: (m) => ((m.flags.ultimaVazao ?? 0) > 200 && (m.flags.ultimaVazao ?? 999) < 300 ? true : 'Essa medição não foi a do sítio.'), feito: '284,79 Mb/s pelos 3 km de ar. Menos que a fibra, muito mais que o satélite, e o atraso é de cabo.' }),
    passo({
      escolha: {
        opcoes: [
          'Fibra até o prédio: muita gente junta divide o custo de puxar o cabo, e cada apartamento ganha vazão de sobra',
          'Satélite geoestacionário para cada apartamento',
          'ADSL, porque o prédio já tem linha de telefone',
          'Um rádio ponto a ponto por apartamento',
        ],
        certa: 0,
        errada: {
          1: 'Quarenta antenas parabólicas na fachada, 50 Mb/s cada e meio segundo de atraso. O síndico não aprova, e a vazão também não.',
          2: 'Depende da distância até a central, e o par de cobre nunca chega perto da fibra. Num prédio com 40 apartamentos, a fibra se paga.',
          3: 'Cada rádio precisa de visada e de alinhamento próprio. Para 40 vizinhos colados, é muito mais simples um cabo só.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O Edifício Acácias, no centro, tem 40 apartamentos e fica a 1,5 km do galpão. Qual acesso?',
      porque: 'Pese vazão, atraso, compartilhamento e custo. No centro, o custo da fibra se divide por muita gente.',
      feito: 'Fibra. Um cabo até o prédio atende 40 famílias, e a vazão sobra para todas.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Rádio ponto a ponto até a torre, com visada livre',
          'ADSL pela linha de telefone, a 7 km da central',
          'Fibra própria por 7 km de estrada só para a escola',
          'Satélite geoestacionário',
        ],
        certa: 0,
        errada: {
          1: 'A 7 km da central, o cobre come as frequências altas que o ADSL usa. A SNR cai, e com ela a capacidade de Shannon: sobra pouca taxa.',
          2: 'Quilômetros de vala ou de poste para um prédio só. Um dia, talvez; hoje, o orçamento da prefeitura chora.',
          3: 'Chega, mas a aula por vídeo fica com meio segundo de atraso a cada fala. Com visada para a torre, há opção melhor.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A escola rural fica a 7 km da central telefônica pelo par de cobre e a 3 km da torre do galpão, com visada livre. Qual acesso?',
      porque: 'Compare com o que você mediu: o sítio tem visada e 3 km de rádio. O ADSL depende do comprimento do par.',
      feito: 'Rádio. É o mesmo enlace do sítio: centenas de Mb/s, atraso pequeno e nenhuma vala aberta.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quatro perguntas para cada acesso',
        texto: ['Vazão, atraso, compartilhamento e custo de chegar. Nenhum acesso ganha nas quatro.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Acesso', 'Vazão', 'Atraso', 'O que pesa'],
          linhas: [
            ['fibra', 'altíssima', 'mínimo', 'custo de puxar o cabo até cada casa'],
            ['cabo coaxial', 'alta', 'baixo', 'canal compartilhado por toda a vizinhança'],
            ['ADSL', 'cai com a distância', 'baixo', 'comprimento do par até a central'],
            ['rádio ponto a ponto', 'alta', 'baixo', 'precisa de visada livre'],
            ['satélite geoestacionário', 'média', 'altíssimo', '35.786 km de subida e de descida'],
          ],
        },
      },
      {
        titulo: 'Compartilhado no cabo, sozinho no ADSL',
        texto: [
          'No cabo coaxial, a vizinhança inteira divide o mesmo canal de descida. No ADSL, cada casa tem o seu par até a central, mas a taxa depende de quão longe ela fica.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'cm', rotulo: 'cabeça da rede de cabo', x: 90, y: 60 },
            { id: 'h1', rotulo: 'casa 1', x: 300, y: 30 },
            { id: 'h2', rotulo: 'casa 2', x: 420, y: 30 },
            { id: 'h3', rotulo: 'casa 3', x: 540, y: 30 },
            { id: 'ct', rotulo: 'central telefônica', x: 90, y: 190 },
            { id: 'p', rotulo: 'casa perto', x: 330, y: 160 },
            { id: 'l', rotulo: 'casa longe', x: 540, y: 210 },
          ],
          ligacoes: [
            ['cm', 'h1', 'mesmo canal'],
            ['h1', 'h2', 'mesmo canal'],
            ['h2', 'h3', 'mesmo canal'],
            ['ct', 'p', 'par curto, SNR alta'],
            ['ct', 'l', 'par longo, SNR baixa'],
          ],
        },
      },
      {
        titulo: 'Satélite ou terrestre',
        texto: [
          'O satélite chega a qualquer lugar com céu aberto, sem cabo nem visada para torre. O preço é o atraso: no geoestacionário, cada ping sobe e desce duas vezes 35.786 km.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 's', rotulo: 'satélite a 35.786 km', x: 300, y: 30 },
            { id: 'f', rotulo: 'fazenda', x: 90, y: 200 },
            { id: 'g', rotulo: 'estação terrena', x: 510, y: 200 },
          ],
          ligacoes: [
            ['f', 's', 'sobe'],
            ['s', 'g', 'desce'],
            ['f', 'g', 'terrestre: sem cabo até aqui'],
          ],
        },
      },
      {
        titulo: 'Na bancada',
        texto: ['O mesmo servidor, quatro acessos. Na bancada, a casa do cabo está sozinha no canal.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Acesso', 'Enlace', 'Vazão medida'],
          linhas: [
            ['fibra (prédio)', '1000 Mb/s', '949,28 Mb/s'],
            ['cabo coaxial (casa 5)', '1000 Mb/s', '949,28 Mb/s, sozinha'],
            ['rádio (sítio)', '300 Mb/s', '284,79 Mb/s'],
            ['satélite geoestacionário (fazenda)', '50 Mb/s', '47,46 Mb/s, com ping de mais de meio segundo'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'A Fazenda Fim do Mundo fica a 40 km do galpão, atrás da serra, sem visada para torre nenhuma e sem linha de telefone. Qual acesso?',
      opcoes: ['Satélite', 'Fibra própria por 40 km', 'ADSL', 'Rádio ponto a ponto direto até o galpão'],
      certa: 0,
      explicacao: 'Sem visada, o rádio não fecha; sem par de cobre, não há ADSL; 40 km de fibra para uma casa não se pagam. O satélite chega, com atraso.',
    },
  },
  desafio: {
    carta: [
      'Ofício da secretaria de saúde: "o posto do distrito vai começar a teleconsulta com o hospital. O satélite foi instalado ano passado e funciona, mas a equipe médica diz que a consulta parece ligação internacional de novela: um fala, espera, o outro responde."',
      'Na reforma do posto, alguém instalou um rádio de 5,8 GHz no telhado, com visada para a torre do galpão a 12 km. Ninguém ligou o cabo, e a antena ficou apontada para o norte por tradição.',
      'Objetivo: o posto pingando o servidor da teleconsulta (192.0.2.1) com 10 pedidos e média abaixo de 20 ms, e a pergunta respondida.',
    ],
    dicas: [
      'Para teleconsulta, o que pesa é o atraso. Veja por onde o PC do posto está ligado e que outro acesso está parado no telhado.',
      'Mude a ponta do cabo c1 do terminal de satélite para a porta lan do radio-posto, aponte a antena para 250° e meça.',
    ],
    perguntas: d55,
    montar: () => {
      const m = novoMundo(1555);
      adicionar(m, pc('posto', { modelo: 'PC da teleconsulta do posto de saúde do distrito', ttl: 64, ip: ip('192.0.2.80/24') }));
      adicionar(m, aparelho('terminal-posto', 'terminal-sat', 'Terminal de satélite geoestacionário do posto', [{ nome: 'lan' }, { nome: 'ceu', fisica: 'sat' }]));
      adicionar(m, aparelho('gateway', 'gateway-sat', 'Estação terrena da Céu Aberto Satélites', [{ nome: 'ceu', fisica: 'sat' }, { nome: 'lan' }]));
      adicionar(m, radio('radio-posto', 'Rádio PTP 5,8 GHz no telhado do posto, antena de 23 dBi e feixe de 9°', { ganho: 23, azimute: 0, azimuteCerto: 250, altura: 20, feixe: 9 }, 250, 30));
      adicionar(m, radio('radio-torre', 'Rádio PTP 5,8 GHz na torre do galpão, antena de 23 dBi', { ganho: 23, azimute: 70, azimuteCerto: 70, altura: 30, feixe: 9 }, 70, 30));
      adicionar(m, comutador('sw-galpao', { modelo: 'Switch do rack do galpão SG-8' }));
      adicionar(m, pc('servidor-tele', { modelo: 'Servidor da teleconsulta do hospital, com Pinguix', ttl: 64, mdix: true, ip: ip('192.0.2.1/24') }));
      ligar(m, { equip: 'posto', porta: 'eth0' }, { equip: 'terminal-posto', porta: 'lan' }, 'cat6', 5, { id: 'c1' });
      ligar(m, { equip: 'terminal-posto', porta: 'ceu' }, { equip: 'gateway', porta: 'ceu' }, 'satelite', 0, { id: 'c2', sat: { orbita: 'geo' } });
      ligar(m, { equip: 'gateway', porta: 'lan' }, { equip: 'sw-galpao', porta: 'p1' }, 'cat6', 20, { id: 'c3' });
      ligar(m, { equip: 'radio-posto', porta: 'ar' }, { equip: 'radio-torre', porta: 'ar' }, 'radio', 12000, { id: 'c4', radio: { distanciaKm: 12, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
      ligar(m, { equip: 'radio-torre', porta: 'lan' }, { equip: 'sw-galpao', porta: 'p2' }, 'cat6', 40, { id: 'c5' });
      ligar(m, { equip: 'sw-galpao', porta: 'p8' }, { equip: 'servidor-tele', porta: 'eth0' }, 'cat6', 3, { id: 'c6' });
      m.proxCabo = 7;
      m.flags.servidorTeste = 'servidor-tele';
      return m;
    },
    objetivo: (m) => [pingOk(m, 'posto', '192.0.2.1', 10, 0, 20), ...todasRespondidas(m, d55)],
    solucao: [
      ['cabo', 'c1', 'detalhes'],
      ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'radio-posto:lan' }],
      ['equip', 'radio-posto', 'antena', { azimute: '250', altura: '20' }],
      ['equip', 'posto', 'ping', { destino: '192.0.2.1', n: '10' }],
      ['equip', 'posto', 'vazao'],
    ],
    respostas: { '1': '284.79' },
  },
};

/* ======================================================================
 * ref 56: Política na camada física (2.10)
 * ====================================================================== */

const d56: Pergunta[] = [
  numerica('1', 'Na mesma distância, quantos dB a mais de perda no espaço livre a faixa de 3,5 GHz tem em relação à de 700 MHz? (uma casa decimal)', fspl(20, 3.5) - fspl(20, 0.7), 0.1),
  texto('2', 'Como se chama o arranjo em que duas operadoras dividem a mesma torre e a mesma estação?', /compartilha/i),
];

const VIZINHOS_VILA = [
  { nome: 'CASA_DO_VEREADOR', canal: 6, dbm: -52 },
  { nome: 'Feira_da_Vila', canal: 7, dbm: -70 },
  { nome: 'Capela_Sao_Benedito', canal: 11, dbm: -86 },
];

const dia56: Dia = {
  numero: 56,
  ato: 1,
  titulo: 'Política na camada física',
  chamado: [
    'CHAMADO #0056',
    'A Rua das Acácias acendeu: as 12 casas estão online, e a câmara mandou parabéns junto com uma pergunta: "e a Vila Esperança?"',
    'A Alô Logo ganhou a faixa de 700 MHz no leilão com a obrigação de cobrir a vila, a 15 km da torre, e cumpriu no papel: o setor rural está lá, apontado com muito carinho para o centro da cidade. O Wi-Fi da praça da vila, em faixa livre, também sofre.',
    'Objetivo: a escola da vila associada pela faixa de 700 MHz com RSSI de -65 dBm ou melhor, um ping de 10 pedidos até o servidor e SNR de 25 dB ou mais no Wi-Fi da praça da vila.',
  ],
  manual: {
    titulo: 'Quem decide quem usa o ar, as torres e os fios',
    texto: [
      'O espectro é um recurso finito: só existe uma faixa de 700 MHz em cada lugar, e dois transmissores nela se atropelam. Por isso o Estado, pela agência reguladora de telecomunicações, decide quem usa cada faixa. Há três jeitos clássicos. No concurso de beleza, as empresas apresentam propostas e o governo escolhe a melhor; é subjetivo e abre espaço para favor. Na loteria, sorteia-se; é justo no sorteio e ruim no resultado, porque quem ganha nem sempre vai usar. No leilão, ganha quem paga mais; é transparente e põe dinheiro no caixa público, mas o preço alto pode sair do investimento em torres e voltar na conta do cliente.',
      'Por isso, os leilões costumam vir com obrigações: em troca de parte do valor, a operadora tem que cobrir estradas, vilas e escolas que o mercado sozinho deixaria para depois. A licença vale por um prazo, numa região, e dá uso exclusivo: ninguém mais transmite ali. E há as faixas livres, como a de 2,4 GHz do Wi-Fi: qualquer um liga um aparelho homologado, sem pedir licença, com potência baixa. A vantagem é a inovação barata; o custo é dividir o ar com o vizinho.',
      'Na rede celular, as torres são a parte cara. Em área densa, várias operadoras constroem as suas e competem; em área rural, uma torre mal se paga. Daí o compartilhamento de infraestrutura: operadoras dividem a mesma torre, a mesma energia e às vezes a mesma estação, e empresas só de torres alugam espaço para todas. Os críticos dizem que compartilhar demais reduz a competição; os defensores, que é o único jeito de a torre existir onde há pouca gente.',
      'A rede telefônica nasceu, em quase todo lugar, como monopólio. O argumento é o do monopólio natural: duas redes de fio paralelas até cada casa quase nunca se pagam. Em troca, o Estado regulava preço e exigia universalização, a obrigação de atender todo mundo, inclusive quem dá prejuízo, muitas vezes com um fundo pago por todas as contas. Mais tarde, muitos países abriram o mercado para a competição. A discussão de hoje é a mesma de sempre com outro nome: quem paga para levar rede a quem o mercado não quer atender.',
    ],
  },
  dicas: [
    'Veja para onde o setor rural da torre aponta e qual é o rumo até a vila.',
    'Gire a antena da erb-torre para 210°. Depois, no Wi-Fi da vila, abra o analisador de espectro.',
    'O canal 1 fica longe de todos os vizinhos da praça. Ping de 10 pedidos da escola-vila para 192.0.2.1.',
  ],
  montar: () => {
    const m = novoMundo(156);
    adicionar(m, pc('escola-vila', { modelo: 'PC da escola da Vila Esperança, com Pinguix', ttl: 64, ip: ip('192.0.2.90/24') }));
    adicionar(m, radio('cpe-vila', 'Antena externa de 700 MHz no alto da caixa d\'água da vila, 12 dBi', { ganho: 12, azimute: 30, azimuteCerto: 30, altura: 25, feixe: 30 }, 30, 30));
    adicionar(m, radio('erb-torre', 'Setor rural de 700 MHz da Alô Logo na torre, 65° e 17 dBi', { ganho: 17, azimute: 0, azimuteCerto: 210, altura: 40, feixe: 65 }, 210, 50));
    adicionar(m, comutador('nucleo', { modelo: 'Núcleo da rede móvel no rack do galpão' }));
    adicionar(m, pc('servidor', { modelo: 'Servidor de teste na saída para a internet, com Pinguix', ttl: 64, ip: ip('192.0.2.1/24') }));
    adicionar(m, aparelho('ap-vila', 'ap', 'Ponto de acesso da praça da vila, na faixa livre de 2,4 GHz', [{ nome: 'lan' }], { canal: 6, sinalCliente: -58, ruidoDbm: -95, vizinhos: VIZINHOS_VILA.map((v) => ({ ...v })) }));
    ligar(m, { equip: 'escola-vila', porta: 'eth0' }, { equip: 'cpe-vila', porta: 'lan' }, 'cat6', 30, { id: 'c1' });
    ligar(m, { equip: 'cpe-vila', porta: 'ar' }, { equip: 'erb-torre', porta: 'ar' }, 'radio', 15000, { id: 'c2', radio: { distanciaKm: 15, freqGHz: 0.7, obstaculoM: 0, ptxDbm: 30 } });
    ligar(m, { equip: 'erb-torre', porta: 'lan' }, { equip: 'nucleo', porta: 'p1' }, 'cat6', 60, { id: 'c3' });
    ligar(m, { equip: 'nucleo', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 3, { id: 'c4' });
    m.proxCabo = 5;
    return m;
  },
  objetivo: (m) => {
    const r = radioOk(m, 'c2');
    const w = snrWifi(m.equipamentos.get('ap-vila')!.s as any);
    return [
      item('escola da vila associada pela faixa de 700 MHz, com RSSI de -65 dBm ou melhor', r.ok, `${r.rssi.toFixed(1)} dBm`),
      pingOk(m, 'escola-vila', '192.0.2.1', 10),
      item('SNR de 25 dB ou mais no Wi-Fi da praça da vila', w.snr >= 25, `${w.snr.toFixed(1)} dB`),
    ];
  },
  posMorte: [
    `O setor rural estava apontado para 0°, o centro da cidade, e a vila fica a 210°. Com a antena no rumo certo, a escola recebe ${br(-53.86)} dBm a 15 km e associa a 300 Mb/s. A obrigação de cobertura estava no contrato; faltava estar na antena. A 700 MHz, a perda no espaço livre nos 15 km é de ${br(fspl(15, 0.7))} dB, e é por isso que os leilões amarram a cobertura rural às faixas baixas: elas vão longe com poucas torres.`,
    'No Wi-Fi da praça, ninguém fez nada de errado: a faixa de 2,4 GHz é livre, e o vereador tem todo o direito de ligar o roteador dele no canal 6, bem forte. Faixa livre não tem dono para reclamar; tem canal vazio para procurar. No canal 1, longe de todos, a SNR voltou para 37 dB.',
    'A Rua das Acácias está acesa, a vila também. Cobre, fibra, coaxial, rádio, satélite e um pouco de política: a camada física está de pé. Agora os bits chegam. O problema é que chegam do jeito que a física deixa, com erro, sem começo e sem fim. É assunto para a central telefônica antiga.',
  ],
  passos: [
    passo({ alvo: ['equip', 'erb-torre'], acao: 'mostra', instrucao: 'No setor rural da torre, veja o enlace com a antena da vila.', porque: 'A licença obriga a cobrir a vila. O jeito mais rápido de saber se cobre é comparar o rumo até ela com o azimute da antena.', feito: 'Rumo para a vila: 210°. Antena apontada para 0°: o centro da cidade, onde a conta de cada cliente é maior. A vila não associa.' }),
    passo({
      alvo: ['equip', 'erb-torre'],
      acao: 'antena',
      pedir: ['azimute'],
      valores: { altura: '40' },
      exemplo: { azimute: '210' },
      instrucao: 'Gire o setor rural para o rumo da vila.',
      porque: 'Cobertura no papel não liga ninguém. O setor de 65° só ilumina a fatia que fica na frente dele.',
      conferir: (m) => {
        const r = radioOk(m, 'c2');
        return r.ok || `RSSI de ${r.rssi.toFixed(1)} dBm. O rumo até a vila é 210°.`;
      },
      feito: `RSSI de ${br(-53.86)} dBm a 15 km. A faixa baixa faz o que prometeu no leilão.`,
    }),
    passo({ alvo: ['equip', 'escola-vila'], acao: 'ping', valores: { destino: '192.0.2.1', n: '10' }, instrucao: 'Da escola da vila, mande 10 pings ao servidor.', porque: 'O pacote cruza 15 km de ar na faixa licenciada, desce pela torre até o núcleo e chega ao servidor.', conferir: pingou('escola-vila', '192.0.2.1'), feito: 'Dez respostas. A Vila Esperança está na rede, e a obrigação do leilão, cumprida de verdade.' }),
    passo({ alvo: ['equip', 'ap-vila'], acao: 'espectro', instrucao: 'No Wi-Fi da praça da vila, abra o analisador de espectro.', porque: 'A faixa de 2,4 GHz é livre: ninguém precisa de licença, e todo mundo divide o mesmo ar. Veja quem mais está lá.', feito: 'O roteador do vereador grita no canal 6, o mesmo do AP da praça. Na faixa livre, isso é perfeitamente legal.' }),
    passo({
      alvo: ['equip', 'ap-vila'],
      acao: 'canal',
      pedir: ['canal'],
      exemplo: { canal: '1' },
      instrucao: 'Escolha um canal para o AP da praça longe dos vizinhos fortes.',
      porque: 'Cada canal de 2,4 GHz ocupa 22 MHz e os canais andam de 5 em 5 MHz. Fuja do 6 e do 7, onde estão os sinais fortes.',
      conferir: (m) => {
        const w = snrWifi(m.equipamentos.get('ap-vila')!.s as any);
        return w.snr >= 25 || `SNR de ${w.snr.toFixed(1)} dB. Ainda tem vizinho forte encostando nesse canal.`;
      },
      feito: 'SNR de 37 dB no canal 1. Na faixa livre, a solução não é reclamar na agência: é achar um canal vazio.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Sem obrigação, a operadora cobre primeiro onde dá lucro; a obrigação troca parte do valor do leilão por cobertura onde o mercado sozinho não chega',
          'Porque a faixa de 700 MHz não funciona em cidade grande',
          'Porque o leilão é ilegal sem obrigação',
          'Para a operadora não precisar construir torre nenhuma',
        ],
        certa: 0,
        errada: {
          1: 'A faixa de 700 MHz funciona muito bem na cidade. A questão não é física, é de dinheiro: onde a torre se paga.',
          2: 'Leilão sem obrigação existe e é legal. A obrigação é uma escolha de política pública, com prós e contras.',
          3: 'É o contrário: a obrigação faz a operadora construir torre onde ela não construiria.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o leilão da faixa de 700 MHz veio com a obrigação de cobrir a vila, em vez de só aceitar o lance mais alto?',
      porque: 'Pense no que a antena estava fazendo antes do seu ajuste, e por quê.',
      feito: 'O leilão puro arrecada mais; o leilão com obrigação arrecada menos e cobre mais. Os dois lados têm argumento, e cada país escolhe a mistura.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Duas redes de fio até cada casa quase nunca se pagam; o Estado aceitava um dono só em troca de regular o preço e exigir atendimento universal',
          'Porque o telefone só funciona com uma empresa',
          'Porque a faixa de rádio da telefonia era leiloada',
          'Porque não havia demanda por telefone',
        ],
        certa: 0,
        errada: {
          1: 'Tecnicamente, duas centrais convivem bem. O problema era o custo de duplicar fios até cada casa.',
          2: 'A telefonia fixa anda em fio, não em faixa de rádio. O leilão de espectro veio muito depois, com o celular.',
          3: 'Havia fila de anos para conseguir uma linha. Demanda sobrava; o que faltava era rede.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que a rede telefônica fixa nasceu como monopólio regulado em quase todo lugar?',
      porque: 'Pense no custo de puxar fio até cada casa da Rua das Acácias, e no que acontece se duas empresas fizerem isso na mesma rua.',
      feito: 'Monopólio natural, regulação de preço e universalização. Quando a tecnologia barateou a rede, muitos países abriram para a competição e mantiveram fundos para levar rede a quem dá prejuízo.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Três jeitos de dar uma faixa',
        texto: ['O espectro é finito, e dois transmissores na mesma faixa se atropelam. Alguém precisa decidir quem usa cada pedaço.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Jeito', 'A favor', 'Contra'],
          linhas: [
            ['concurso de beleza', 'escolhe quem promete o melhor serviço', 'subjetivo, abre espaço para favor'],
            ['loteria', 'simples e imparcial no sorteio', 'quem ganha pode nem usar a faixa'],
            ['leilão', 'transparente, põe dinheiro no caixa público', 'o preço alto pode sair do investimento e voltar na conta'],
          ],
        },
      },
      {
        titulo: 'Licenciada ou livre',
        texto: [
          'Na faixa licenciada, só a dona transmite naquela região, por um prazo e com obrigações. Na faixa livre, qualquer aparelho homologado transmite, com potência baixa, e o ar é de todos.',
        ],
        visual: { tipo: 'espectro', canais: [{ canal: 1, dbm: -58, rotulo: 'AP da praça (depois)' }, ...VIZINHOS_VILA.map((v) => ({ canal: v.canal, dbm: v.dbm, rotulo: v.nome }))] },
      },
      {
        titulo: 'Torres: competir ou compartilhar',
        texto: [
          'No centro, cada operadora ergue a sua torre e compete. No campo, uma torre mal se paga, e o compartilhamento faz uma torre servir a várias operadoras.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 't', rotulo: 'torre compartilhada', x: 300, y: 120 },
            { id: 'a', rotulo: 'operadora A', x: 90, y: 40 },
            { id: 'b', rotulo: 'operadora B', x: 90, y: 200 },
            { id: 'v', rotulo: 'Vila Esperança', x: 520, y: 120 },
          ],
          ligacoes: [
            ['a', 't', 'aluga espaço'],
            ['b', 't', 'aluga espaço'],
            ['t', 'v', 'uma torre, duas redes'],
          ],
        },
      },
      {
        titulo: 'A rede telefônica',
        texto: ['Da linha com fila de espera ao mercado aberto, a pergunta de fundo não mudou: quem paga para atender quem dá prejuízo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Ideia', 'O que quer dizer'],
          linhas: [
            ['monopólio natural', 'duas redes de fio na mesma rua quase nunca se pagam'],
            ['regulação', 'o Estado controla preço e qualidade de quem tem o monopólio'],
            ['universalização', 'obrigação de atender todo mundo, inclusive quem dá prejuízo'],
            ['fundo de universalização', 'um pedaço de cada conta paga a rede onde ela não se paga'],
            ['abertura do mercado', 'mais empresas competindo, com a obrigação de cobertura ainda de pé'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O roteador do vereador no canal 6 atrapalha o Wi-Fi da praça. O que a regra da faixa livre diz?',
      opcoes: [
        'Ele pode usar a faixa, como qualquer um com aparelho homologado; cabe a cada rede escolher um canal melhor',
        'Ele precisa de licença para usar o canal 6',
        'A praça tem prioridade porque é pública',
        'A agência reguladora sorteia os canais entre os moradores',
      ],
      certa: 0,
      explicacao: 'Faixa livre não tem dono. A regra limita a potência e exige aparelho homologado; o resto é convivência e escolha de canal.',
    },
  },
  desafio: {
    carta: [
      'Ofício da escola do Sítio do Meio, a 20 km da torre: "a Alô Logo instalou a nossa antena de 3,5 GHz e disse que é 5G. O ícone diz 5G. A internet diz nada."',
      'A torre é compartilhada: a TeleTrem, outra operadora, também pôs ali um setor de 700 MHz para cobrir a zona rural, e a antena dela já está na caixa d\'água da escola, alinhada e sem cabo.',
      'Objetivo: a escola pingando o servidor (192.0.2.1) e as duas perguntas respondidas.',
    ],
    dicas: [
      'Veja os detalhes do enlace de 3,5 GHz: a 20 km, o RSSI não chega a -80 dBm.',
      'Mude a ponta do cabo c1 para a porta lan da cpe-700 e faça o ping.',
    ],
    perguntas: d56,
    montar: () => {
      const m = novoMundo(1556);
      adicionar(m, pc('escola-sitio', { modelo: 'PC da escola do Sítio do Meio, com JanelOS', ttl: 128, ip: ip('192.0.2.95/24') }));
      adicionar(m, radio('cpe-3500', 'Antena externa de 3,5 GHz da Alô Logo, 12 dBi, na caixa d\'água da escola', { ganho: 12, azimute: 45, azimuteCerto: 45, altura: 30, feixe: 30 }, 45, 30));
      adicionar(m, radio('erb-3500', 'Setor de 3,5 GHz da Alô Logo na torre compartilhada, 17 dBi', { ganho: 17, azimute: 225, azimuteCerto: 225, altura: 40, feixe: 65 }, 225, 50));
      adicionar(m, radio('cpe-700', 'Antena externa de 700 MHz da TeleTrem, 12 dBi, na mesma caixa d\'água', { ganho: 12, azimute: 45, azimuteCerto: 45, altura: 30, feixe: 30 }, 45, 30));
      adicionar(m, radio('erb-700', 'Setor de 700 MHz da TeleTrem na torre compartilhada, 17 dBi', { ganho: 17, azimute: 225, azimuteCerto: 225, altura: 40, feixe: 65 }, 225, 50));
      adicionar(m, comutador('nucleo', { modelo: 'Núcleo da rede móvel no rack do galpão' }));
      adicionar(m, pc('servidor', { modelo: 'Servidor de teste na saída para a internet, com Pinguix', ttl: 64, ip: ip('192.0.2.1/24') }));
      ligar(m, { equip: 'escola-sitio', porta: 'eth0' }, { equip: 'cpe-3500', porta: 'lan' }, 'cat6', 30, { id: 'c1' });
      ligar(m, { equip: 'cpe-3500', porta: 'ar' }, { equip: 'erb-3500', porta: 'ar' }, 'radio', 20000, { id: 'c2', radio: { distanciaKm: 20, freqGHz: 3.5, obstaculoM: 0, ptxDbm: 20 } });
      ligar(m, { equip: 'cpe-700', porta: 'ar' }, { equip: 'erb-700', porta: 'ar' }, 'radio', 20000, { id: 'c3', radio: { distanciaKm: 20, freqGHz: 0.7, obstaculoM: 0, ptxDbm: 20 } });
      ligar(m, { equip: 'erb-3500', porta: 'lan' }, { equip: 'nucleo', porta: 'p1' }, 'cat6', 60, { id: 'c4' });
      ligar(m, { equip: 'erb-700', porta: 'lan' }, { equip: 'nucleo', porta: 'p2' }, 'cat6', 60, { id: 'c5' });
      ligar(m, { equip: 'nucleo', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 3, { id: 'c6' });
      m.proxCabo = 7;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'escola-sitio', '192.0.2.1'), ...todasRespondidas(m, d56)],
    solucao: [
      ['cabo', 'c2', 'detalhes'],
      ['cabo', 'c3', 'detalhes'],
      ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'cpe-700:lan' }],
      ['equip', 'escola-sitio', 'ping', { destino: '192.0.2.1', n: '4' }],
    ],
    respostas: { '1': (fspl(20, 3.5) - fspl(20, 0.7)).toFixed(1), '2': 'compartilhamento' },
  },
};

export const ATO1E: Dia[] = [dia54, dia55, dia56];
