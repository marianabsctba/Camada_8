// Dias novos do ato 1 (A Rua), com prática guiada, aula e desafio no próprio dia.
// Meios de transmissão: armazenamento levado na mão, cabo coaxial e linhas de energia (seções 2.1.1, 2.1.3 e 2.1.4).

import { coaxDados } from '../motor/fisico';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, TRANSCEPTORES, type Equipamento, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { enlace, item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

const ip = (s: string) => lerCidr(s)!;

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

/** Última vazão medida no mundo, em Mb/s (ou -1 se ainda não mediu). */
const vazaoMedida = (m: Mundo): number => (typeof m.flags.ultimaVazao === 'number' ? m.flags.ultimaVazao : -1);

/** Conferência de um passo de ping: todas as respostas voltaram. */
const pingou = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  if (!r) return 'O ping não aconteceu.';
  return r.recebidos === r.n || `Voltaram ${r.recebidos} de ${r.n}.`;
};

/** Põe um transceptor numa porta SFP. */
const sfp = (e: Equipamento, porta: string, modelo: string): Equipamento => {
  e.portas.find((p) => p.nome === porta)!.sfp = { ...TRANSCEPTORES[modelo]! };
  return e;
};

/** Um rádio com antena já alinhada. */
function radio(nome: string, modelo: string, ganho: number, rumo: number, altura: number): Equipamento {
  const e = aparelho(nome, 'radio', modelo, [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax: altura });
  e.antena = { ganho, azimute: rumo, azimuteCerto: rumo, altura, feixe: 8 };
  return e;
}

/* ======================================================================
 * ref 42: A caminhonete cheia de discos (2.1.1)
 * ====================================================================== */

/** 120 TB do arquivo, em bits (TB do SI: 10^12 bytes). */
const ARQUIVO_BITS = 120e12 * 8;
/** Viagem de 8 h até o data center regional. */
const VIAGEM_S = 8 * 3600;

const p42: Pergunta[] = [
  numerica('1', 'Qual a vazão medida pelo enlace de rádio até o data center, em Mb/s?', vazaoMedida, 1),
  numerica('2', 'Com essa vazão, quantos dias a rede leva para mandar os 120 TB do arquivo? (sem parar, uma casa decimal basta)', (m) => ARQUIVO_BITS / (vazaoMedida(m) * 1e6) / 86400, 0.5),
  numerica('3', 'A caminhonete leva os 120 TB em 8 horas de estrada. Qual a vazão dela, em Gb/s?', ARQUIVO_BITS / VIAGEM_S / 1e9, 0.5),
];

const d42: Pergunta[] = [
  numerica('1', 'Com a vazão medida pela fibra, quantos minutos a rede leva para mandar os 500 GB da cooperativa?', (m) => (500e9 * 8) / (vazaoMedida(m) * 1e6) / 60, 2),
  texto('2', 'A caminhonete leva 8 horas até a capital. Quem entrega os 500 GB primeiro: a rede ou a caminhonete?', /^(a\s+)?rede$/i),
];

const dia42: Dia = {
  numero: 42,
  ato: 1,
  titulo: 'A caminhonete cheia de discos',
  chamado: [
    'CHAMADO #0042',
    'O cartório de Fim de Linha vai digitalizar cem anos de certidões e precisa guardar uma cópia no data center regional, na capital, a 8 horas de estrada. São 120 TB de imagens.',
    'O tabelião já reservou a caminhonete da prefeitura e encheu de discos. O secretário de tecnologia acha um absurdo: "temos rádio até a cidade vizinha, isso é coisa de 1990". Os dois pediram que você desempate.',
    'Objetivo: medir a vazão do enlace de rádio até o data center, fazer um ping de 4 pedidos até ele e responder as três perguntas do chamado.',
  ],
  manual: {
    titulo: 'Armazenamento como meio de transmissão',
    texto: [
      'Um meio de transmissão é qualquer coisa que leve bits de um lugar a outro. Cabo, fibra e rádio são os óbvios. Mas um disco dentro de uma caminhonete também leva bits: devagar para começar, e com uma quantidade enorme de uma vez.',
      'A vazão de uma caminhonete é a conta de sempre: bits levados divididos pelo tempo de viagem. 120 TB são 120 × 10¹² bytes, ou 960 × 10¹² bits. Em 8 horas (28.800 s), isso dá uns 33 Gb/s. Uma caminhonete cheia de verdade, com mil discos de 20 TB, leva 20 PB e chega a mais de 5 Tb/s. Nenhum enlace de Fim de Linha chega perto.',
      'O preço é o atraso. O primeiro bit só chega quando a caminhonete chega: 8 horas, e não os milissegundos de um enlace. Para um ping, uma videochamada ou um site, isso é inútil. Vazão e atraso são grandezas diferentes, e cada uso pede uma.',
      'Por isso levar discos na mão faz sentido quando há muitos dados e nenhuma pressa: mudar um data center de lugar, fazer a primeira cópia completa de um backup (as diárias, pequenas, vão pela rede) ou mandar dados de pesquisa com petabytes. Provedores de nuvem de verdade alugam caixas de discos, e até caminhões, para isso.',
      'Ferramenta: "vazao" no console do servidor do cartório mede quantos Mb/s o caminho entrega de verdade. Depois é só dividir os bits pelo resultado.',
    ],
  },
  dicas: [
    'Primeiro meça: sem a vazão real do rádio, a conta é chute.',
    'Tempo = bits ÷ vazão. 120 TB × 8 = 960 × 10¹² bits. Divida pela vazão em b/s e depois por 86.400 para ter dias.',
    'A caminhonete: 960 × 10¹² bits ÷ 28.800 s dá uns 33,3 × 10⁹ b/s, ou 33,3 Gb/s.',
  ],
  perguntas: p42,
  montar: () => {
    const m = novoMundo(142);
    adicionar(m, pc('cartorio', { modelo: 'Servidor do cartório, com 120 TB de certidões digitalizadas', ip: ip('198.51.100.10/24') }));
    adicionar(m, comutador('sw-galpao', { modelo: 'Switch do rack do galpão' }));
    adicionar(m, radio('radio-galpao', 'Rádio de 5,8 GHz no mastro do galpão, antena de 24 dBi', 24, 70, 30));
    adicionar(m, radio('radio-vizinha', 'Rádio de 5,8 GHz na torre da cidade vizinha, antena de 24 dBi', 24, 250, 30));
    adicionar(m, pc('datacenter', { modelo: 'Servidor de cópias do data center regional (atrás do rádio, pela rede da cidade vizinha)', ip: ip('198.51.100.200/24') }));
    ligar(m, { equip: 'cartorio', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p1' }, 'cat6', 5, { id: 'c1' });
    ligar(m, { equip: 'sw-galpao', porta: 'p8' }, { equip: 'radio-galpao', porta: 'lan' }, 'cat6', 35, { id: 'c2' });
    ligar(m, { equip: 'radio-galpao', porta: 'ar' }, { equip: 'radio-vizinha', porta: 'ar' }, 'radio', 15000, { id: 'c3', radio: { distanciaKm: 15, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'radio-vizinha', porta: 'lan' }, { equip: 'datacenter', porta: 'eth0' }, 'cat6', 40, { id: 'c4' });
    m.proxCabo = 5;
    m.flags.servidorTeste = 'datacenter';
    return m;
  },
  objetivo: (m) => {
    const v = vazaoMedida(m);
    return [item('vazão até o data center medida', v > 0, v > 0 ? `${v.toFixed(1)} Mb/s` : 'ainda não'), pingOk(m, 'cartorio', '198.51.100.200', 4), ...todasRespondidas(m, p42)];
  },
  posMorte: [
    'O rádio entrega uns 285 Mb/s. Parece muito até fazer a conta: 960 × 10¹² bits divididos por 285 × 10⁶ b/s dão uns 3,4 milhões de segundos, ou 39 dias de rede ocupada sem parar. A caminhonete leva tudo em 8 horas, a uns 33 Gb/s: mais de cem vezes a vazão do rádio.',
    'Em compensação, o ping pelo rádio volta em 1,8 ms, e o primeiro bit da caminhonete chega 8 horas depois. Para o arquivo inteiro, ganha a estrada. Para as certidões novas de cada dia, umas poucas centenas de megabytes, ganha a rede.',
    'O desempate ficou assim: a primeira cópia vai de caminhonete, e as diferenças diárias vão pelo rádio. O tabelião e o secretário saíram achando que ganharam. Os dois estão certos.',
  ],
  passos: [
    passo({ alvo: ['cabo', 'c3'], acao: 'detalhes', instrucao: 'Veja os detalhes do enlace de rádio até a cidade vizinha.', porque: 'Antes de comparar com a caminhonete, é bom saber como está o caminho pela rede: se está de pé e com que sinal.', feito: 'O rádio está associado, com RSSI de -63,2 dBm. Taxa nominal de 300 Mb/s. Nominal é o que está na caixa; o que interessa é o que passa.' }),
    passo({
      alvo: ['equip', 'cartorio'],
      acao: 'vazao',
      instrucao: 'No servidor do cartório, meça a vazão até o data center.',
      porque: 'A vazão real é menor que a nominal: cada quadro gasta bytes com cabeçalhos, e o enlace mais lento manda no caminho todo.',
      conferir: (m) => vazaoMedida(m) > 0 || 'A vazão não foi medida.',
      feito: 'Uns 284,8 Mb/s: 300 Mb/s do rádio vezes 1460 de 1538 bytes de cada quadro. Guarde esse número.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '284.8' }, instrucao: 'Qual foi a vazão medida, em Mb/s?', porque: 'O resultado aparece na última linha do teste, em Mb/s.', feito: 'É a régua da rede. Agora a conta com o arquivo.' }),
    passo({ pergunta: '2', exemplo: { resposta: '39' }, instrucao: 'Quantos dias a rede leva para mandar os 120 TB?', porque: 'Tempo = bits ÷ vazão. 120 TB = 960 × 10¹² bits. Divida por 284,8 × 10⁶ b/s e depois por 86.400 segundos de cada dia.', feito: 'Uns 39 dias, com o rádio ocupado dia e noite e mais ninguém usando. A cidade inteira ficaria sem internet por mais de um mês.' }),
    passo({ pergunta: '3', exemplo: { resposta: '33.3' }, instrucao: 'Qual a vazão da caminhonete, em Gb/s?', porque: 'A mesma conta: bits levados ÷ tempo de viagem. 960 × 10¹² bits em 8 horas, que são 28.800 s.', feito: 'Uns 33,3 Gb/s, mais de cem vezes o rádio. E a caminhonete cabe muito mais disco do que isso.' }),
    passo({ alvo: ['equip', 'cartorio'], acao: 'ping', valores: { destino: '198.51.100.200', n: '4' }, instrucao: 'Agora faça um ping de 4 pedidos do servidor do cartório até o data center.', porque: 'Vazão é quanto cabe no cano. Atraso é quanto cada bit demora para chegar. O ping mede o atraso.', conferir: pingou('cartorio', '198.51.100.200'), feito: 'Uns 1,8 ms de ida e volta pelo rádio. A caminhonete, para o mesmo ping, levaria 16 horas: 8 de ida e 8 de volta.' }),
    passo({
      escolha: {
        opcoes: [
          'A primeira cópia inteira vai de caminhonete, e as certidões novas de cada dia vão pela rede',
          'Tudo pela rede, porque caminhonete é coisa do passado',
          'Tudo de caminhonete, inclusive as certidões novas de cada dia',
          'Tanto faz: a vazão das duas é parecida',
        ],
        certa: 0,
        errada: {
          1: 'Pela rede seriam uns 39 dias com o rádio lotado. Antiga ou não, a caminhonete leva mais de cem vezes mais bits por segundo.',
          2: 'As certidões do dia são poucas e precisam chegar logo. Esperar 8 horas de estrada por umas centenas de megabytes é desperdício: o rádio manda isso em segundos.',
          3: 'Não é parecida: uns 33 Gb/s contra uns 285 Mb/s. O que a rede tem de melhor é o atraso, não a vazão.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual o desempate certo entre o tabelião e o secretário?',
      porque: 'Muito dado sem pressa pede vazão. Pouco dado com pressa pede atraso baixo.',
      feito: 'Cada meio no que faz melhor. É assim que se faz a primeira cópia de um backup grande em qualquer lugar do mundo.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Disco na estrada também é meio',
        texto: [
          'Um meio de transmissão é qualquer coisa que leve bits. Um disco dentro de uma caminhonete leva bits do galpão até o data center, só que pela estrada.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'cartório (120 TB)', x: 80, y: 60 },
            { id: 'r', rotulo: 'rádio até a vizinha', x: 300, y: 60 },
            { id: 'k', rotulo: 'caminhonete com discos', x: 300, y: 190 },
            { id: 'd', rotulo: 'data center regional', x: 530, y: 120 },
          ],
          ligacoes: [
            ['c', 'r', 'cabo'],
            ['r', 'd', '285 Mb/s, 1,8 ms'],
            ['c', 'k', 'carregar'],
            ['k', 'd', '8 h de estrada'],
          ],
        },
      },
      {
        titulo: 'A conta da caminhonete',
        texto: [
          'Vazão = bits levados ÷ tempo. 120 TB são 960 × 10¹² bits; em 28.800 s de viagem, dão uns 33,3 Gb/s.',
          'Uma caminhonete cheia, com mil discos de 20 TB, leva 20 PB: mais de 5 Tb/s. Mexa nos números e veja quanto os prefixos pesam.',
        ],
        visual: { tipo: 'calculadora', formula: 'unidades' },
      },
      {
        titulo: 'Vazão enorme, atraso enorme',
        texto: ['A caminhonete ganha de longe em vazão e perde de longe em atraso. São grandezas diferentes.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Rádio até a vizinha', 'Caminhonete com 120 TB'],
          linhas: [
            ['vazão', 'uns 285 Mb/s', 'uns 33,3 Gb/s'],
            ['120 TB chegam em', 'uns 39 dias', '8 horas'],
            ['primeiro bit chega em', 'menos de 1 ms', '8 horas'],
            ['um ping', '1,8 ms', '16 horas'],
          ],
        },
      },
      {
        titulo: 'Quando vale a estrada',
        texto: ['Muito dado e nenhuma pressa: estrada. Pouco dado ou pressa: rede. Na prática, os dois juntos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Melhor meio'],
          linhas: [
            ['mudar um data center de cidade', 'discos na estrada'],
            ['primeira cópia completa de um backup', 'discos na estrada'],
            ['backup diário, só com o que mudou', 'rede'],
            ['videochamada, jogo, site', 'rede (só ela tem atraso baixo)'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Uma caminhonete leva 1 PB em 10 horas. Por que ela não serve para uma videochamada, mesmo com vazão de mais de 200 Gb/s?',
      opcoes: [
        'Porque o atraso é de 10 horas: a imagem chegaria muito depois de a conversa acabar',
        'Porque a vazão é baixa demais para vídeo',
        'Porque disco não guarda vídeo',
        'Porque a caminhonete só leva bits num sentido',
      ],
      certa: 0,
      explicacao: 'Conversa precisa de atraso baixo, não de vazão enorme. O primeiro bit da caminhonete só chega quando ela chega.',
    },
  },
  desafio: {
    carta: [
      'Bilhete da cooperativa: "precisamos mandar 500 GB de notas fiscais para o contador da capital até o fim do dia. O motorista já está esquentando a caminhonete. Vai mais rápido de estrada, não vai?"',
      'A cooperativa tem cabo até o galpão, e o galpão tem 38 km de fibra até a cidade vizinha, de onde a rede do provedor regional segue até a capital. A estrada continua com 8 horas.',
      'Objetivo: medir a vazão da cooperativa até o contador e responder as duas perguntas.',
    ],
    dicas: [
      'Meça antes de decidir: a vazão do caminho de fibra muda tudo.',
      'Tempo = 500 × 10⁹ × 8 bits ÷ vazão em b/s. Divida por 60 para ter minutos.',
      'Uns 949 Mb/s dão uns 70 minutos. Contra 8 horas de estrada.',
    ],
    perguntas: d42,
    montar: () => {
      const m = novoMundo(1542);
      adicionar(m, pc('cooperativa', { modelo: 'Servidor da cooperativa, com 500 GB de notas fiscais', ip: ip('203.0.113.20/24'), mdix: true }));
      adicionar(m, sfp(comutador('sw-galpao', { modelo: 'Switch do galpão, com porta de fibra', portas: 4, sfp: 1 }), 'sfp1', 'ER-40'));
      adicionar(m, sfp(comutador('sw-vizinha', { modelo: 'Switch da cidade vizinha (dali em diante, rede do provedor regional até a capital, sem gargalo)', portas: 4, sfp: 1 }), 'sfp1', 'ER-40'));
      adicionar(m, pc('contador', { modelo: 'Servidor do escritório de contabilidade na capital', ip: ip('203.0.113.80/24'), mdix: true }));
      ligar(m, { equip: 'cooperativa', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p1' }, 'cat6', 20, { id: 'c1' });
      ligar(m, { equip: 'sw-galpao', porta: 'sfp1' }, { equip: 'sw-vizinha', porta: 'sfp1' }, 'fibra', 38000, { id: 'c2', nota: 'fibra monomodo ao lado da estrada' });
      ligar(m, { equip: 'sw-vizinha', porta: 'p1' }, { equip: 'contador', porta: 'eth0' }, 'cat6', 15, { id: 'c3' });
      m.proxCabo = 4;
      m.flags.servidorTeste = 'contador';
      return m;
    },
    objetivo: (m) => {
      const v = vazaoMedida(m);
      return [item('vazão até o contador medida', v > 0, v > 0 ? `${v.toFixed(1)} Mb/s` : 'ainda não'), ...todasRespondidas(m, d42)];
    },
    solucao: [['equip', 'cooperativa', 'vazao']],
    respostas: { '1': '70.2', '2': 'rede' },
  },
};

/* ======================================================================
 * ref 43: Cabo coaxial (2.1.3)
 * ====================================================================== */

/** Itens do objetivo de uma descida coaxial: modem online, nível na janela ideal e MER bom. */
function objetivoCoax(m: Mundo, id: string) {
  const { nivel, mer } = coaxDados(m.cabos.get(id)!);
  const e = enlace(m, id);
  return [
    item('modem ONLINE', e.up, e.up ? undefined : e.motivos[0]),
    item('nível entre -7 e +7 dBmV', nivel >= -7 && nivel <= 7, `${nivel.toFixed(1)} dBmV`),
    item('MER de 35 dB ou mais', mer >= 35, `${mer.toFixed(1)} dB`),
  ];
}

const nivelCoax = (id: string) => (m: Mundo) => coaxDados(m.cabos.get(id)!).nivel;

const p43: Pergunta[] = [numerica('1', 'Depois da troca, qual o nível de descida no modem, em dBmV?', nivelCoax('c1'), 0.2)];

const d43: Pergunta[] = [
  texto('1', 'Qual a impedância do coaxial de TV a cabo, em ohms?', /^75(\s*(ohms?|Ω))?$/i),
  numerica('2', 'Com o conserto feito, qual o nível de descida no modem, em dBmV?', nivelCoax('c1'), 0.2),
];

const dia43: Dia = {
  numero: 43,
  ato: 1,
  titulo: 'Cabo coaxial',
  chamado: [
    'CHAMADO #0043',
    'A casa 7 é a última da Rua das Acácias, depois de três quintais e um pé de manga. A descida coaxial até lá tem 100 m e veio de herança da antena coletiva antiga: "um cabo fininho, mas que sempre funcionou para a novela".',
    'A internet funciona, mas engasga toda noite. O modem diz que está online, e a família diz que ele está mentindo.',
    'Objetivo: modem ONLINE com nível de descida entre -7 e +7 dBmV, MER de 35 dB ou mais, e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Cabo coaxial',
    texto: [
      'O coaxial tem quatro camadas, de dentro para fora: um condutor central de cobre, um isolante plástico em volta dele (o dielétrico), uma malha metálica trançada (às vezes com uma folha de alumínio junto) e a capa externa. O nome vem daí: o condutor e a malha dividem o mesmo eixo.',
      'O sinal viaja entre o condutor central e a malha, e a malha envolve tudo. Ela segura o sinal do lado de dentro e barra o ruído de fora. Por isso o coaxial blinda muito melhor que o par trançado sem blindagem, que depende só da torção dos fios para cancelar o ruído, e aguenta frequências bem mais altas.',
      'Cada coaxial tem uma impedância característica, que depende da espessura do condutor, do diâmetro da malha e do isolante. Os dois valores mais comuns: 75 ohms, para TV a cabo e antena (e para a internet que vem pela rede de TV, o DOCSIS), e 50 ohms, para rádio e para a Ethernet antiga, que passava um coaxial pelo prédio inteiro. Emendar um no outro reflete parte do sinal.',
      'Todo cabo perde sinal, e a perda cresce com o comprimento e com a frequência. A internet da TV a cabo usa frequências altas, de centenas de megahertz, onde cabo fino sofre. A 750 MHz, o RG59, mais fino, perde 24,6 dB a cada 100 m, e o RG6, de condutor mais grosso, perde 18,5 dB. Numa descida curta, tanto faz. Numa de 100 m, são 6,1 dB de diferença.',
      'No modem, o nível de sinal se mede em dBmV. O ideal fica entre -7 e +7 dBmV. Abaixo de -7, a qualidade da modulação (o MER) começa a cair, e com MER baixo o modem fica online, mas engasga.',
    ],
  },
  dicas: [
    'Veja a descida inteira: quanto sai do tap e quanto chega no modem?',
    'Quase toda a perda está num lugar só: no cabo. E o cabo é o fininho.',
    'Troque o cabo RG59 da descida (peça 1) por RG6.',
  ],
  perguntas: p43,
  montar: () => {
    const m = novoMundo(143);
    adicionar(m, aparelho('tap', 'cmts', 'Tap da rede coaxial no poste da Rua das Acácias', [{ nome: 'saida', fisica: 'coax' }]));
    adicionar(m, aparelho('modem', 'cablemodem', 'Cable modem DOCSIS 3.1 da casa 7', [{ nome: 'rf', fisica: 'coax' }, { nome: 'lan' }]));
    ligar(m, { equip: 'tap', porta: 'saida' }, { equip: 'modem', porta: 'rf' }, 'coax', 100, {
      id: 'c1',
      nota: 'passa por três quintais e um pé de manga',
      coax: {
        tapDbmv: 12,
        elementos: [
          { tipo: 'cabo', modelo: 'rg59', metros: 100 },
          { tipo: 'conector' },
        ],
      },
    });
    m.proxCabo = 2;
    return m;
  },
  objetivo: (m) => [...objetivoCoax(m, 'c1'), ...todasRespondidas(m, p43)],
  posMorte: [
    'Saindo do tap com +12 dBmV, o sinal perdia 24,6 dB nos 100 m de RG59 e mais 0,2 dB no conector: chegava a -12,8 dBmV. O modem ainda travava na portadora, mas o MER caía para 33 dB, e a constelação do 256-QAM ficava borrada. Online, mas engasgando.',
    'O RG6, com condutor central mais grosso, perde 18,5 dB nos mesmos 100 m. O nível subiu para -6,7 dBmV, dentro da janela ideal, e o MER voltou a 40 dB. Ninguém mexeu no tap nem no modem: só no meio.',
    'O cabo fininho "sempre funcionou para a novela" porque a TV analógica antiga usava frequências mais baixas e aceitava imagem com chuvisco. Dado digital em frequência alta não aceita chuvisco. A perda cresce com a frequência, e a internet mora lá em cima.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Condutor central, isolante, malha metálica, capa',
          'Malha metálica, condutor central, capa, isolante',
          'Quatro pares trançados dentro de uma capa',
          'Condutor central, capa, isolante, malha metálica',
        ],
        certa: 0,
        errada: {
          1: 'A malha fica por fora, envolvendo o isolante. Se ela estivesse no centro, não blindaria nada.',
          2: 'Esse é o par trançado, o cabo de rede comum. O coaxial tem um condutor só, no centro.',
          3: 'A capa é a última camada, por fora de tudo. Malha por fora da capa enferruja no primeiro temporal.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes de mexer no cabo: qual a ordem das camadas do coaxial, de dentro para fora?',
      porque: 'Corte um coaxial e olhe a ponta: o fio de cobre no centro, o plástico branco em volta, a malha brilhante e a capa preta.',
      feito: 'Condutor, isolante, malha e capa, todos no mesmo eixo. O sinal anda entre o condutor e a malha, e a malha fecha a porta para o ruído de fora.',
    }),
    passo({ alvo: ['cabo', 'c1'], acao: 'coax-ver', instrucao: 'Veja a descida coaxial, peça por peça.', porque: 'Cada peça cobra um pedágio em dB. Somando tudo, dá para achar quem come o sinal.', feito: 'Saem +12 dBmV do tap e chegam -12,8 dBmV no modem. Quase tudo foi o cabo: 24,6 dB nos 100 m de RG59.' }),
    passo({ alvo: ['equip', 'modem'], acao: 'status', instrucao: 'Pergunte ao modem o nível e o MER.', porque: 'O modem aceita de -15 a +15 dBmV, então está online. Mas o MER diz se a modulação chega nítida.', feito: 'MER de 33 dB: acima do mínimo de 30, então ele fica online, mas abaixo de 35, então os erros aparecem a cada pequena piora da noite.' }),
    passo({
      escolha: {
        opcoes: [
          'A perda cresce com o comprimento e com a frequência, e o RG59, mais fino, perde mais que o RG6',
          'O coaxial só perde sinal quando chove',
          'A perda do cabo não depende do comprimento, só dos conectores',
          'O RG59 perde menos, mas é mais caro',
        ],
        certa: 0,
        errada: {
          1: 'Água no conector piora, mas o cabo perde sinal sempre, chova ou faça sol. Os 24,6 dB estão lá num dia seco.',
          2: 'Depende, e muito: a perda do cabo é dada a cada 100 m. Dobrar o comprimento dobra a perda em dB.',
          3: 'É o contrário: o RG59 perde 24,6 dB a cada 100 m, e o RG6, 18,5 dB.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que 100 m de RG59 são um problema para a internet e não eram para a TV antiga?',
      porque: 'A internet da TV a cabo usa frequências altas, de centenas de megahertz. Lá em cima, condutor fino perde mais.',
      feito: 'Comprimento e frequência, os dois juntos. Em descida curta, RG59 resolve. Em descida longa e frequência alta, só RG6.',
    }),
    passo({
      alvo: ['cabo', 'c1'],
      acao: 'coax-trocar',
      pedir: ['nova'],
      valores: { n: '1' },
      exemplo: { nova: 'rg6' },
      instrucao: 'Troque o cabo da descida (peça 1) por um cabo de menor perda.',
      porque: 'O problema é o meio, não o tap nem o modem. Mesmo caminho, mesmo comprimento, cabo melhor.',
      conferir: (m) => {
        const { nivel, mer } = coaxDados(m.cabos.get('c1')!);
        if (nivel < -7) return `Nível de ${nivel.toFixed(1)} dBmV, ainda abaixo de -7. Qual dos dois cabos perde menos a cada 100 m?`;
        return mer >= 35 || `MER de ${mer.toFixed(1)} dB.`;
      },
      feito: 'Com RG6, os 100 m custam 18,5 dB em vez de 24,6. Seis decibéis a mais de sinal, sem tocar em mais nada.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '-6.7' }, instrucao: 'Qual o nível de descida no modem agora, em dBmV?', porque: 'Faça a conta ou pergunte ao modem: +12 dBmV do tap, menos 18,5 dB do cabo, menos 0,2 dB do conector.', feito: '-6,7 dBmV: dentro da janela ideal, por pouco. Em descida longa, cada decibel conta.' }),
    passo({
      escolha: {
        opcoes: ['75 ohms', '50 ohms', '100 ohms', 'Tanto faz: coaxial é tudo igual'],
        certa: 0,
        errada: {
          1: '50 ohms é o coaxial de rádio e da Ethernet antiga. Emendar um no outro causa reflexão, e parte do sinal volta para o tap.',
          2: '100 ohms é a impedância do par trançado de rede, não de coaxial.',
          3: 'Não é. A impedância depende da espessura do condutor, do isolante e da malha, e emendar impedâncias diferentes reflete o sinal.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Vai ficar um rolo de reserva na casa 7. Qual impedância o coaxial de TV a cabo precisa ter?',
      porque: 'Os dois valores comuns de coaxial servem a mundos diferentes: um para TV e antena, outro para rádio e Ethernet antiga.',
      feito: '75 ohms, como o RG59 e o RG6. O de 50 ohms fica para o rádio da torre e para o museu da Ethernet.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quatro camadas no mesmo eixo',
        texto: ['De dentro para fora: condutor central de cobre, isolante (dielétrico), malha metálica e capa. O sinal anda entre o condutor e a malha.'],
        visual: { tipo: 'camadas', camadas: ['capa externa', 'malha metálica (blindagem)', 'isolante (dielétrico)', 'condutor central de cobre'], rotulo: 'de fora para dentro' },
      },
      {
        titulo: 'Por que blinda melhor que o par',
        texto: [
          'No par trançado sem blindagem, a defesa contra o ruído é a torção: o ruído entra igual nos dois fios e se cancela. No coaxial, a malha envolve o sinal inteiro e barra o ruído antes de ele chegar.',
          'Por isso o coaxial aguenta frequências de centenas de megahertz em ambiente barulhento.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Par trançado sem blindagem', 'Coaxial'],
          linhas: [
            ['defesa contra ruído', 'torção dos fios', 'malha em volta do sinal'],
            ['frequências comuns', 'até algumas centenas de MHz', 'perto de 1 GHz ou mais'],
            ['impedância', '100 ohms', '75 ohms (TV) ou 50 ohms (rádio, Ethernet antiga)'],
          ],
        },
      },
      {
        titulo: '75 ou 50 ohms',
        texto: ['A impedância depende da geometria do cabo. Emendar impedâncias diferentes reflete parte do sinal de volta, como eco numa sala vazia.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Impedância', 'Onde aparece'],
          linhas: [
            ['75 ohms', 'TV a cabo, antena, internet por DOCSIS (RG59, RG6)'],
            ['50 ohms', 'rádio, cabos de antena de torre, Ethernet antiga em coaxial'],
          ],
        },
      },
      {
        titulo: 'Comprimento e frequência',
        texto: [
          'A perda em dB cresce com o comprimento e com a frequência. O jogo usa a perda a 750 MHz, onde mora a internet da TV a cabo.',
          'Em 100 m, o RG6 entrega 6,1 dB a mais que o RG59. Foi a diferença entre engasgar e funcionar na casa 7.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Cabo (a 750 MHz)', '25 m', '100 m'],
          linhas: [
            ['RG59', '6,2 dB', '24,6 dB'],
            ['RG6', '4,6 dB', '18,5 dB'],
          ],
        },
      },
      {
        titulo: 'Do tap ao modem',
        texto: ['O nível que chega é o do tap menos a soma das perdas. O ideal no modem fica entre -7 e +7 dBmV, com MER de 35 dB ou mais.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 't', rotulo: 'tap (+12 dBmV)', x: 80, y: 110 },
            { id: 'c', rotulo: '100 m de RG6 (-18,5 dB)', x: 310, y: 110 },
            { id: 'm', rotulo: 'modem (-6,7 dBmV)', x: 540, y: 110 },
          ],
          ligacoes: [
            ['t', 'c'],
            ['c', 'm', 'conector (-0,2 dB)'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O cabo de rede da portaria passa ao lado do motor do portão e pega ruído. Por que um coaxial no mesmo lugar sofreria menos?',
      opcoes: [
        'Porque a malha metálica envolve o sinal e barra o ruído de fora antes de ele chegar ao condutor',
        'Porque o coaxial tem quatro pares trançados',
        'Porque o coaxial é mais curto',
        'Porque o coaxial usa luz em vez de eletricidade',
      ],
      certa: 0,
      explicacao: 'O par sem blindagem só cancela o ruído pela torção. No coaxial, a malha em volta do condutor central é uma blindagem contínua.',
    },
  },
  desafio: {
    carta: [
      'Na casa 3, o vizinho achou o sinal "fraco" e comprou um amplificador de 20 dB na feira. Instalou sozinho, logo na entrada, e mandou foto orgulhoso.',
      'Desde então a internet piorou. O modem continua online, mas a videochamada da avó trava a cada minuto.',
      'Objetivo: modem ONLINE com nível de descida entre -7 e +7 dBmV, MER de 35 dB ou mais, e as duas perguntas respondidas.',
    ],
    dicas: [
      'Veja a descida: quanto sinal sobra depois de cada peça?',
      'O nível passou do ideal, e cada amplificador ainda põe ruído próprio. O sinal da rua já bastava.',
      'Tire o amplificador (peça 1) da descida.',
    ],
    perguntas: d43,
    montar: () => {
      const m = novoMundo(1543);
      adicionar(m, aparelho('tap', 'cmts', 'Tap da rede coaxial no poste em frente à casa 3', [{ nome: 'saida', fisica: 'coax' }]));
      adicionar(m, aparelho('modem', 'cablemodem', 'Cable modem DOCSIS 3.1 da casa 3', [{ nome: 'rf', fisica: 'coax' }, { nome: 'lan' }]));
      ligar(m, { equip: 'tap', porta: 'saida' }, { equip: 'modem', porta: 'rf' }, 'coax', 30, {
        id: 'c1',
        coax: {
          tapDbmv: 4,
          elementos: [
            { tipo: 'amplificador', db: 20 },
            { tipo: 'cabo', modelo: 'rg6', metros: 30 },
            { tipo: 'splitter', vias: 2 },
            { tipo: 'conector' },
          ],
        },
      });
      m.proxCabo = 2;
      return m;
    },
    objetivo: (m) => [...objetivoCoax(m, 'c1'), ...todasRespondidas(m, d43)],
    solucao: [
      ['equip', 'modem', 'status'],
      ['cabo', 'c1', 'coax-ver'],
      ['cabo', 'c1', 'coax-remover', { n: '1' }],
    ],
    respostas: { '1': '75', '2': '-5.3' },
  },
};

/* ======================================================================
 * ref 44: Internet pela tomada (2.1.4)
 * O motor não tem fiação elétrica. O trecho entre os dois adaptadores PLC é um cabo de cobre
 * com o ruído que os aparelhos da casa injetam; "afastar" faz o papel de mudar de tomada.
 * ====================================================================== */

/** Adaptador PLC: uma porta de rede e a "tomada", que no jogo é uma porta de cobre de 100 Mb/s. */
function adaptadorPlc(nome: string, modelo: string): Equipamento {
  return aparelho(nome, 'switch', modelo, [{ nome: 'rede' }, { nome: 'tomada', velocidades: [10, 100] }]);
}

const p44: Pergunta[] = [numerica('1', 'Com o adaptador na tomada nova, qual a vazão medida até o servidor de teste, em Mb/s?', vazaoMedida, 1)];

const d44: Pergunta[] = [
  texto('1', 'O sinal de dados do PLC viaja na fiação em frequências bem acima ou bem abaixo dos 60 Hz da energia?', /^(bem\s+)?acima$/i),
  numerica('2', 'Depois do conserto, qual a vazão medida até o servidor da cooperativa, em Mb/s?', vazaoMedida, 1),
];

const dia44: Dia = {
  numero: 44,
  ato: 1,
  titulo: 'Internet pela tomada',
  chamado: [
    'CHAMADO #0044',
    'Na casa 8, o sinal chega bem até a sala. Para levar a internet ao quarto dos fundos, a família comprou na feira um par de adaptadores Tomadanet, "a internet que sai da tomada, 500 Mb/s na caixa".',
    'De manhã a internet do quarto até funciona. À tarde, quando alguém abre a geladeira ou liga a furadeira, ela some. A família está desconfiada da geladeira, e a geladeira não se defende.',
    'Objetivo: vazão de 90 Mb/s ou mais do notebook do quarto até o servidor de teste, o trecho da tomada com margem de 6 dB ou mais, e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Linhas de energia elétrica como meio',
    texto: [
      'A fiação elétrica já chega a todo cômodo, então dá para usá-la como meio de dados: é a comunicação por linha de energia, ou PLC. Um adaptador numa tomada pega os bits da rede, transforma em sinal de alta frequência (de alguns megahertz a dezenas de megahertz) e injeta na fiação, por cima dos 60 Hz da energia. Outro adaptador, em outra tomada, separa esse sinal e devolve os bits.',
      'O problema é que a fiação foi feita para levar energia a 60 Hz, não dados a megahertz. Cada aparelho ligado nela injeta ruído: motor de geladeira, furadeira, liquidificador, carregador barato, lâmpada com reator. O sinal também se atenua pelo caminho: a cada emenda, a cada derivação, a cada disjuntor, e mais ainda quando os dois adaptadores estão em circuitos diferentes do quadro de luz.',
      'E não existe fiação padrão: cada casa tem a sua, com comprimentos, emendas e aparelhos diferentes. A taxa da caixa é a do melhor laboratório; na sua casa, ela varia com a hora do dia e com quem está usando o quê. Filtro de linha e régua com proteção cortam justamente as frequências altas, e o sinal do PLC junto.',
      'Por isso o PLC é uma solução doméstica de quebra-galho: levar a rede a um cômodo onde o Wi-Fi não chega e não dá para passar cabo. Funciona melhor com os dois adaptadores direto na parede, no mesmo circuito, longe de motores.',
      'Aviso honesto: o jogo não tem fiação elétrica. Aqui, o trecho entre os dois adaptadores é um cabo de cobre que recebe o ruído dos aparelhos da casa, e "refazer a rota longe do ruído" faz o papel de mudar o adaptador para uma tomada longe da geladeira. A física simplificada é a mesma: ruído come margem, e margem baixa vira erro.',
    ],
  },
  dicas: [
    'Meça antes, para ter com o que comparar depois.',
    'Os detalhes do trecho da tomada (c2) mostram quanto ruído entra nele e quanta margem sobra.',
    'Refaça a rota do c2 longe do ruído (é a tomada nova) e meça a vazão de novo.',
  ],
  perguntas: p44,
  montar: () => {
    const m = novoMundo(144);
    adicionar(m, pc('notebook', { modelo: 'Notebook do quarto dos fundos da casa 8', ip: ip('192.0.2.80/24') }));
    adicionar(m, adaptadorPlc('plc-quarto', 'Adaptador Tomadanet do quarto, ligado na tomada ao lado da cozinha ("500 Mb/s" na caixa)'));
    adicionar(m, adaptadorPlc('plc-sala', 'Adaptador Tomadanet da sala, ligado na tomada atrás da estante'));
    adicionar(m, pc('servidor', { modelo: 'Servidor de teste do provedor, atrás do roteador da sala', ip: ip('192.0.2.1/24'), mdix: true }));
    ligar(m, { equip: 'notebook', porta: 'eth0' }, { equip: 'plc-quarto', porta: 'rede' }, 'cat6', 2, { id: 'c1' });
    ligar(m, { equip: 'plc-quarto', porta: 'tomada' }, { equip: 'plc-sala', porta: 'tomada' }, 'cat5e', 25, { id: 'c2', ruidoDb: 21, nota: 'fiação elétrica da casa: no jogo, cobre com o ruído da geladeira e da furadeira' });
    ligar(m, { equip: 'plc-sala', porta: 'rede' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 3, { id: 'c3' });
    m.proxCabo = 4;
    m.flags.servidorTeste = 'servidor';
    return m;
  },
  objetivo: (m) => {
    const v = vazaoMedida(m);
    const e = enlace(m, 'c2');
    return [
      item('vazão de 90 Mb/s ou mais até o servidor de teste', v >= 90, v > 0 ? `${v.toFixed(1)} Mb/s` : 'ainda não medida'),
      item('trecho da tomada com margem de 6 dB ou mais', e.up && e.margemDb >= 6, e.up ? `${e.margemDb.toFixed(1)} dB` : e.motivos[0]),
      ...todasRespondidas(m, p44),
    ];
  },
  posMorte: [
    'No começo, o trecho da tomada recebia 21 dB de ruído, e a margem ficava em -1 dB. O enlace subia, mas com uma taxa de erro de bit de 1 em 100 mil: quase 12 % dos quadros grandes chegavam estragados, e a vazão desabava para uns 8 Mb/s. Com a geladeira ligando e desligando, era uma loteria.',
    'Na tomada nova, longe da geladeira, o ruído caiu para 9 dB, a margem subiu para 11 dB, e a vazão chegou a uns 94,9 Mb/s, o teto dos 100 Mb/s depois dos cabeçalhos. Os "500 Mb/s" da caixa continuam na caixa.',
    'Aqui o jogo aproximou a fiação com um cabo de cobre ruidoso, mas a lição vale para a tomada de verdade: PLC depende da casa, da hora e dos aparelhos. É quebra-galho bom para um cômodo sem Wi-Fi. Quando der para passar um cabo de rede, passe o cabo.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'notebook'],
      acao: 'vazao',
      instrucao: 'No notebook do quarto, meça a vazão até o servidor de teste.',
      porque: 'Antes de mexer, meça. Sem o número de antes, não dá para saber se a mudança ajudou.',
      conferir: (m) => vazaoMedida(m) > 0 || 'A vazão não foi medida.',
      feito: 'Uns 8 Mb/s, num caminho de 100 Mb/s. E a "perda de quadros" diz quase 12 %. Algo no meio está estragando os bits.',
    }),
    passo({ alvo: ['cabo', 'c2'], acao: 'detalhes', instrucao: 'Veja os detalhes do trecho da tomada, entre os dois adaptadores.', porque: 'No jogo, a fiação elétrica é este trecho de cobre (c2). Os detalhes mostram o ruído que entra nele e a margem que sobra.', feito: '21 dB de ruído e taxa de erro de bit de 1 em 100 mil. Pela conta do jogo, a margem fica em -1 dB: o sinal mal se distingue do barulho da geladeira.' }),
    passo({
      escolha: {
        opcoes: [
          'A fiação foi feita para energia a 60 Hz: os aparelhos injetam ruído, o sinal se atenua em emendas e derivações, e cada casa tem uma fiação diferente',
          'A eletricidade da tomada apaga os bits que passam por ela',
          'O PLC manda os dados a 60 Hz, que é lento demais',
          'A fiação elétrica é de fibra, e o adaptador é de cobre',
        ],
        certa: 0,
        errada: {
          1: 'Os bits e a energia convivem no mesmo fio, em frequências bem diferentes. O que atrapalha é o ruído dos aparelhos e a atenuação, não a energia em si.',
          2: 'É o contrário: o PLC usa frequências bem acima dos 60 Hz, de alguns megahertz a dezenas de megahertz, justamente para não se misturar com a energia.',
          3: 'A fiação da casa é de cobre. Ela só não foi pensada para carregar dados.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que a fiação elétrica é um meio ruim para dados?',
      porque: 'Pense no que mais está ligado nos mesmos fios, e em quem desenhou esses fios.',
      feito: 'Ruído, atenuação e fiação imprevisível. É por isso que a taxa da caixa nunca aparece na casa de ninguém.',
    }),
    passo({
      alvo: ['cabo', 'c2'],
      acao: 'afastar',
      instrucao: 'Mude o adaptador do quarto para uma tomada longe da geladeira. No jogo, isso é refazer a rota do c2 longe do ruído.',
      porque: 'Quanto mais longe do motor, menos ruído entra no sinal. Na casa de verdade, ajuda também ficar no mesmo circuito do quadro de luz e longe de filtros de linha.',
      conferir: (m) => {
        const e = enlace(m, 'c2');
        return (e.up && e.margemDb >= 6) || `Margem de ${e.margemDb.toFixed(1)} dB.`;
      },
      feito: 'O ruído caiu de 21 para 9 dB, e a margem subiu para 11 dB. A geladeira continua lá, só que longe.',
    }),
    passo({
      alvo: ['equip', 'notebook'],
      acao: 'vazao',
      instrucao: 'Meça a vazão de novo, no notebook do quarto.',
      porque: 'A mesma medida de antes, agora com a tomada nova. É a única prova de que melhorou.',
      conferir: (m) => vazaoMedida(m) >= 90 || `Vazão de ${vazaoMedida(m).toFixed(1)} Mb/s.`,
      feito: 'Uns 94,9 Mb/s, sem perda de quadros. É o teto de um caminho de 100 Mb/s depois dos cabeçalhos.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '94.9' }, instrucao: 'Qual a vazão medida agora, em Mb/s?', porque: 'Está na última linha do teste de vazão.', feito: 'Mais de 11 vezes o que era de manhã. E bem longe dos 500 Mb/s da caixa, que nunca existiram.' }),
    passo({
      escolha: {
        opcoes: [
          'Direto na tomada da parede, sem régua nem filtro de linha',
          'Numa régua com filtro de linha, para proteger o adaptador',
          'Numa extensão, junto com o micro-ondas e a geladeira',
          'Tanto faz, a tomada é toda igual',
        ],
        certa: 0,
        errada: {
          1: 'O filtro de linha existe para cortar ruído de alta frequência. O sinal do PLC é alta frequência: o filtro corta ele junto.',
          2: 'Micro-ondas e geladeira na mesma extensão é o pior lugar da casa: ruído colado no adaptador.',
          3: 'Não é. Cada tomada tem um caminho diferente pela fiação, com emendas, disjuntores e aparelhos diferentes no meio.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Para durar, onde o adaptador PLC deve ficar ligado?',
      porque: 'O sinal do PLC é alta frequência por cima da energia. Tudo o que limpa ou suja alta frequência mexe com ele.',
      feito: 'Direto na parede. É a regra número um do manual que ninguém lê.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'A fiação vira rede',
        texto: ['Um adaptador transforma bits em sinal de alta frequência e injeta na fiação; outro, em outra tomada, separa o sinal e devolve os bits. A energia de 60 Hz continua passando, no mesmo fio.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r', rotulo: 'roteador da sala', x: 70, y: 110 },
            { id: 'a', rotulo: 'adaptador PLC', x: 220, y: 110 },
            { id: 'b', rotulo: 'adaptador PLC', x: 420, y: 110 },
            { id: 'n', rotulo: 'notebook do quarto', x: 560, y: 110 },
            { id: 'g', rotulo: 'geladeira', x: 320, y: 220 },
          ],
          ligacoes: [
            ['r', 'a', 'cabo de rede'],
            ['a', 'b', 'fiação elétrica'],
            ['b', 'n', 'cabo de rede'],
            ['g', 'a', 'ruído'],
          ],
        },
      },
      {
        titulo: 'Feita para energia, não para dados',
        texto: ['A fiação foi desenhada para 60 Hz. Para sinal de megahertz, ela tem quase todos os defeitos possíveis.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Problema', 'De onde vem'],
          linhas: [
            ['ruído', 'motores, furadeira, liquidificador, carregador barato, lâmpada com reator'],
            ['atenuação', 'emendas, derivações, disjuntores e circuitos diferentes no quadro de luz'],
            ['imprevisível', 'cada casa tem uma fiação, e ela muda com o que está ligado na hora'],
            ['filtros', 'régua com filtro de linha corta a alta frequência, e o sinal junto'],
          ],
        },
      },
      {
        titulo: 'Ruído come margem',
        texto: [
          'Na casa 8, a margem passou de -1 dB para 11 dB só de mudar de tomada. Com margem baixa, um em cada 100 mil bits chega errado, e isso basta para estragar uns 12 % dos quadros grandes.',
          'No jogo, a fiação é aproximada por um cabo de cobre com ruído. A conta de margem é a mesma.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tomada', 'Ruído', 'Margem', 'Vazão medida'],
          linhas: [
            ['ao lado da cozinha', '21 dB', '-1 dB', 'uns 8 Mb/s'],
            ['longe da geladeira', '9 dB', '11 dB', 'uns 94,9 Mb/s'],
          ],
        },
      },
      {
        titulo: 'Quando usar',
        texto: ['PLC é quebra-galho doméstico: leva rede a um cômodo onde o Wi-Fi não chega e não dá para passar cabo. Se der para passar cabo, o cabo ganha sempre.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Melhor escolha'],
          linhas: [
            ['quarto dos fundos sem Wi-Fi, casa alugada', 'PLC, direto na parede'],
            ['escritório novo, parede aberta', 'cabo de rede'],
            ['enlace entre prédios', 'fibra ou rádio, nunca a fiação'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'A internet pela tomada funciona de madrugada e piora toda tarde. Qual a explicação mais provável?',
      opcoes: [
        'À tarde há mais aparelhos ligados na fiação, injetando ruído no sinal do PLC',
        'A companhia de energia desliga os dados à tarde',
        'A fiação esfria de madrugada e conduz melhor os bits',
        'O adaptador cansa depois de muitas horas ligado',
      ],
      certa: 0,
      explicacao: 'O meio do PLC é compartilhado com todos os aparelhos da casa. Mais aparelhos ligados, mais ruído, menos margem e mais erro.',
    },
  },
  desafio: {
    carta: [
      'O escritório da cooperativa ligou a sala do fundo pela tomada, com o mesmo par de Tomadanet. O adaptador do fundo ficou na tomada do compressor da câmara fria.',
      'Desde que o compressor foi trocado por um maior, a sala do fundo não tem rede nenhuma. A luz do adaptador pisca em vermelho, o que não ajuda ninguém.',
      'Objetivo: trecho da tomada no ar, vazão de 90 Mb/s ou mais até o servidor da cooperativa e as duas perguntas respondidas.',
    ],
    dicas: [
      'Veja o trecho da tomada: está fora por quê?',
      'O compressor injeta ruído demais. Tire o adaptador de perto dele.',
      'Refaça a rota do c2 longe do ruído e meça a vazão no pc do fundo.',
    ],
    perguntas: d44,
    montar: () => {
      const m = novoMundo(1544);
      adicionar(m, pc('pc-fundo', { modelo: 'PC da sala do fundo da cooperativa', ip: ip('203.0.113.40/24') }));
      adicionar(m, adaptadorPlc('plc-fundo', 'Adaptador Tomadanet da sala do fundo, na tomada do compressor da câmara fria'));
      adicionar(m, adaptadorPlc('plc-frente', 'Adaptador Tomadanet da recepção'));
      adicionar(m, pc('servidor', { modelo: 'Servidor da cooperativa, na recepção', ip: ip('203.0.113.1/24'), mdix: true }));
      ligar(m, { equip: 'pc-fundo', porta: 'eth0' }, { equip: 'plc-fundo', porta: 'rede' }, 'cat6', 2, { id: 'c1' });
      ligar(m, { equip: 'plc-fundo', porta: 'tomada' }, { equip: 'plc-frente', porta: 'tomada' }, 'cat5e', 30, { id: 'c2', ruidoDb: 30, nota: 'fiação elétrica: no jogo, cobre com o ruído do compressor' });
      ligar(m, { equip: 'plc-frente', porta: 'rede' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 3, { id: 'c3' });
      m.proxCabo = 4;
      m.flags.servidorTeste = 'servidor';
      return m;
    },
    objetivo: (m) => {
      const v = vazaoMedida(m);
      const e = enlace(m, 'c2');
      return [
        item('trecho da tomada no ar', e.up, e.up ? `margem ${e.margemDb.toFixed(1)} dB` : e.motivos[0]),
        item('vazão de 90 Mb/s ou mais até o servidor', v >= 90, v > 0 ? `${v.toFixed(1)} Mb/s` : 'ainda não medida'),
        ...todasRespondidas(m, d44),
      ];
    },
    solucao: [
      ['cabo', 'c2', 'detalhes'],
      ['cabo', 'c2', 'afastar'],
      ['equip', 'pc-fundo', 'vazao'],
    ],
    respostas: { '1': 'acima', '2': '94.7' },
  },
};

export const ATO1A: Dia[] = [dia42, dia43, dia44];
