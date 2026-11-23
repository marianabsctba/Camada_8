// Dias novos do ato 0 (Fim de Linha), com prática guiada, aula e desafio no próprio dia.
// Escala das redes, da cidade ao mundo, e como a Internet é montada (seções 1.3.4 a 1.4.1).

import { vazao } from '../motor/rede';
import { TRANSCEPTORES, adicionar, aparelho, comutador, ligar, novoMundo, pc, type Equipamento, type Mundo } from '../motor/mundo';
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

/** Conferência de um passo de ping: chegaram todas as respostas. */
const pingou = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  if (!r) return 'O ping não aconteceu.';
  return r.recebidos === r.n || `Voltaram ${r.recebidos} de ${r.n}. Confira o destino.`;
};

/** Põe um transceptor do catálogo numa porta SFP. */
const sfp = (e: Equipamento, porta: string, modelo: string): Equipamento => {
  e.portas.find((p) => p.nome === porta)!.sfp = { ...TRANSCEPTORES[modelo]! };
  return e;
};

/** Média do último ping registrado, em ms (NaN se não houve). */
const mediaPing = (de: string, destino: string) => (m: Mundo) => registroPing(m, de, destino)?.media ?? NaN;

/* ======================================================================
 * Dia 33: Do bairro ao mundo (1.3.4 a 1.3.6)
 * ====================================================================== */

const p33: Pergunta[] = [
  numerica('1', 'Qual a média do ping do galpão até o servidor da capital, em ms? (três casas decimais)', mediaPing('galpao', '192.0.2.90'), 0.01),
  numerica('2', 'Qual a perda total do enlace de fibra até a capital (c4), em dB?', 18.6, 0.1),
];

/** Perguntas do desafio. */
const d33: Pergunta[] = [
  numerica('1', 'Na régua da distância, que tipo de rede é o enlace entre o hospital e o laboratório de outra cidade? (1 PAN, 2 LAN, 3 MAN, 4 WAN)', 4, 0),
  texto('2', 'Quando o hospital ligar a rede dele à rede do laboratório, que é de outro dono e outra tecnologia, que aparelho fica na fronteira escolhendo o caminho de cada pacote?', /^(o\s+)?(roteador|gateway)$/i),
];

const dia33: Dia = {
  numero: 33,
  ato: 0,
  titulo: 'Do bairro ao mundo',
  chamado: [
    'CHAMADO #0033',
    'Um ofício da prefeitura chegou dobrado em quatro: "o anel de fibra da cidade ficou pronto e a operadora Longa Via entregou o circuito até a capital, a 80 km. O prefeito quer saber se a capital vai parecer tão perto quanto a prefeitura".',
    'Spoiler: não vai. Mas dá para medir quanto mais longe ela parece.',
    'Objetivo: pingar o servidor da prefeitura e o da capital, medir a luz do enlace longo e responder as duas perguntas.',
  ],
  manual: {
    titulo: 'MAN, WAN e redes que se interligam',
    texto: [
      'Redes se classificam pela distância que cobrem. PAN é a rede pessoal, de um metro em volta de alguém (fone sem fio, relógio). LAN é a rede local, de uma sala, um prédio ou um galpão. MAN é a rede metropolitana, que cobre uma cidade inteira, como as redes de TV a cabo e os anéis de fibra que ligam os prédios públicos. WAN é a rede de longa distância, entre cidades, estados ou países. E a internet é a rede de redes, que junta todas elas.',
      'Uma WAN é feita de hosts (os computadores que rodam os programas das pessoas) e de uma sub-rede de comunicação, que só transporta. Essa sub-rede tem dois ingredientes: enlaces de transmissão (fibra, rádio, satélite, alugados de uma operadora) e roteadores, que recebem cada pacote e escolhem por qual enlace ele segue.',
      'Em vez de alugar enlaces, uma empresa pode montar uma VPN (rede privada virtual): túneis cifrados por cima da internet, ligando os escritórios como se fossem uma rede só. É mais barato e flexível, mas a empresa não controla o caminho. A SD-WAN vai além: um software central usa vários enlaces ao mesmo tempo (fibra, rádio, celular) e escolhe por qual mandar cada tipo de tráfego.',
      'Distância custa tempo. A luz anda na fibra a uns 200.000 km/s, ou seja, 5 µs por km. Cada 100 km de fibra somam 1 ms no ping, que vai e volta. Em 4 km de cidade isso some no meio do resto; em 80 km de estrada, já aparece.',
      'Quando redes diferentes (de donos, tecnologias e endereços diferentes) se ligam, isso se chama interligação de redes, ou internetworking. Quem fica na fronteira e repassa pacotes entre elas é o roteador. Gateway é o nome genérico de quem liga redes diferentes, em qualquer camada; quando a ligação é na camada de rede, o gateway é um roteador.',
    ],
  },
  dicas: [
    'Meça os dois destinos com o mesmo número de pedidos e compare.',
    'Ping do galpão para 192.0.2.2 e para 192.0.2.90; depois o medidor de luz no cabo c4.',
    'A perda do c4 é 80 km vezes 0,22 dB/km mais dois conectores de 0,5 dB.',
  ],
  perguntas: p33,
  montar: () => {
    const m = novoMundo(133);
    adicionar(m, pc('galpao', { modelo: 'PC do galpão, com Pinguix', ttl: 64, ip: ip('192.0.2.10/24') }));
    adicionar(m, sfp(sfp(comutador('sw-galpao', { modelo: 'Switch do rack do galpão, com duas portas SFP', portas: 4, sfp: 2 }), 'sfp1', 'LX-10'), 'sfp2', 'ZX-80'));
    adicionar(m, sfp(comutador('sw-prefeitura', { modelo: 'Switch da prefeitura, no anel da cidade', portas: 4, sfp: 1 }), 'sfp1', 'LX-10'));
    adicionar(m, pc('servidor-pref', { modelo: 'Servidor da prefeitura, com Pinguix', ttl: 64, ip: ip('192.0.2.2/24') }));
    adicionar(m, sfp(comutador('sw-capital', { modelo: 'Switch do data center da capital', portas: 4, sfp: 1 }), 'sfp1', 'ZX-80'));
    adicionar(m, pc('servidor-capital', { modelo: 'Servidor da secretaria estadual, na capital', ttl: 64, ip: ip('192.0.2.90/24') }));
    ligar(m, { equip: 'galpao', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p1' }, 'cat6', 5, { id: 'c1' });
    ligar(m, { equip: 'sw-galpao', porta: 'sfp1' }, { equip: 'sw-prefeitura', porta: 'sfp1' }, 'fibra', 4000, { id: 'c2', nota: 'anel metropolitano, pelos postes da avenida' });
    ligar(m, { equip: 'sw-prefeitura', porta: 'p1' }, { equip: 'servidor-pref', porta: 'eth0' }, 'cat6', 10, { id: 'c3' });
    ligar(m, { equip: 'sw-galpao', porta: 'sfp2' }, { equip: 'sw-capital', porta: 'sfp1' }, 'fibra', 80000, { id: 'c4', nota: 'circuito alugado da operadora Longa Via, ao longo da rodovia' });
    ligar(m, { equip: 'sw-capital', porta: 'p1' }, { equip: 'servidor-capital', porta: 'eth0' }, 'cat6', 10, { id: 'c5' });
    m.proxCabo = 6;
    return m;
  },
  objetivo: (m) => [pingOk(m, 'galpao', '192.0.2.2'), pingOk(m, 'galpao', '192.0.2.90'), ...todasRespondidas(m, p33)],
  posMorte: [
    'O ping até a prefeitura atravessou 4 km de anel metropolitano e voltou em 0,116 ms, quase tudo gasto em placas e switches: na escala da cidade, a distância pesa pouco. Até a capital, foram 80 km de ida e 80 de volta, e só a luz andando na fibra gastou 0,8 ms. A MAN parece LAN; a WAN já se sente.',
    'O enlace c4 perde 18,6 dB (17,6 dB de fibra e 1 dB dos dois conectores), e o transceptor de 80 km põe luz de sobra para isso. Na capital chegam -14,6 dBm, longe da sensibilidade de -24 dBm.',
    'Hoje a operadora entrega o circuito como se fosse um cabo muito comprido, e o galpão e a capital ficam na mesma rede. Quando a cidade quiser falar com redes de outros donos, vai precisar de um roteador na fronteira: isso é interligação de redes, e é o assunto da camada de rede, mais adiante.',
  ],
  passos: [
    passo({ alvo: ['equip', 'galpao'], acao: 'ping', valores: { destino: '192.0.2.2', n: '4' }, instrucao: 'Do galpão, mande um ping para o servidor da prefeitura.', porque: 'A prefeitura está a 4 km, no anel de fibra da cidade. É a medida da rede metropolitana.', conferir: pingou('galpao', '192.0.2.2'), feito: 'Respostas em 0,116 ms. Dos 8 km de ida e volta, a luz gasta só 0,04 ms; o resto é placa e switch.' }),
    passo({ alvo: ['equip', 'galpao'], acao: 'ping', valores: { destino: '192.0.2.90', n: '4' }, instrucao: 'Agora mande um ping para o servidor da capital.', porque: 'A capital está a 80 km, no circuito alugado da operadora. É a medida de um enlace de longa distância.', conferir: pingou('galpao', '192.0.2.90'), feito: 'Respostas bem mais lentas que as da prefeitura, mesmo com o mesmo tipo de fibra e de switch. A diferença é só a distância.' }),
    passo({ pergunta: '1', exemplo: { resposta: '0.876' }, instrucao: 'Qual a média do ping até a capital, em ms?', porque: 'Está na última linha do ping. Repare que quase tudo é a luz indo e voltando: 160 km a 5 µs por km.', feito: '0,876 ms: 0,8 ms de pura propagação e o mesmo pouquinho de placa e switch da prefeitura. Cada 100 km de fibra custam 1 ms de ida e volta.' }),
    passo({ alvo: ['cabo', 'c4'], acao: 'luz', instrucao: 'No cabo c4, o enlace até a capital, use o medidor de potência óptica.', porque: 'Num enlace longo, além do atraso, a luz se gasta. É preciso saber se ainda chega luz suficiente do outro lado.', feito: 'A conta aparece trecho por trecho: o tronco de 80 km, os dois conectores e quanto chega em cada ponta.' }),
    passo({ pergunta: '2', exemplo: { resposta: '18.6' }, instrucao: 'Qual a perda total do enlace c4, em dB?', porque: 'Está na linha de perda total do medidor. Em 1550 nm, a fibra monomodo perde 0,22 dB por km.', feito: '18,6 dB: 17,6 da fibra e 1 dos conectores. Por isso o enlace longo usa o transceptor que grita, o de 80 km.' }),
    passo({
      escolha: {
        opcoes: ['c2 é MAN (dentro da cidade) e c4 é WAN (entre cidades)', 'Os dois são LAN, porque saem do mesmo galpão', 'c2 é WAN e c4 é MAN', 'Os dois são PAN, porque são fibra'],
        certa: 0,
        errada: {
          1: 'LAN é um prédio ou um galpão. O c2 sai do galpão e atravessa a cidade; o c4 sai da cidade.',
          2: 'Está invertido: a rede metropolitana é a da cidade, e a de longa distância é a que vai até outra cidade.',
          3: 'A escala não depende do meio, e sim da distância. PAN é o metro em volta de uma pessoa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Na régua da distância, o que são os enlaces c2 (4 km, até a prefeitura) e c4 (80 km, até a capital)?',
      porque: 'PAN é pessoal, LAN é o prédio, MAN é a cidade, WAN liga cidades e países.',
      feito: 'O anel da cidade é a MAN; o circuito da rodovia é um pedaço de WAN. O galpão, sozinho, é uma LAN.',
    }),
    passo({
      escolha: {
        opcoes: ['Um roteador na fronteira, repassando pacotes entre as duas redes', 'Um cabo mais comprido, sem nada no meio', 'Um hub, que repete os bits para todo mundo', 'Nada: duas redes de donos diferentes nunca se ligam'],
        certa: 0,
        errada: {
          1: 'Um cabo só junta aparelhos numa rede. Redes de donos, endereços e tecnologias diferentes precisam de alguém que entenda as duas.',
          2: 'O hub trabalha na camada física: repete bits e não sabe nada de redes nem de endereços.',
          3: 'A internet inteira é feita disso: redes de donos diferentes, interligadas.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A secretaria estadual tem a rede dela, com outro dono e outros endereços. O que liga a rede da cidade à dela?',
      porque: 'Ligar redes diferentes é interligação de redes. Quem fica na divisa precisa falar a língua das duas.',
      feito: 'Um roteador, que é o gateway da camada de rede. Junte muitas redes assim e o nome do conjunto é internet.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'A régua da distância',
        texto: ['A mesma ideia de rede, em escalas diferentes. Quanto maior a distância, mais caro o enlace e mais tempo a luz leva.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Escala', 'Distância', 'Em Fim de Linha'],
          linhas: [
            ['PAN (pessoal)', 'cerca de 1 m', 'o fone sem fio do vigia do galpão'],
            ['LAN (local)', 'uma sala, um prédio', 'o rack do galpão e os PCs ligados nele'],
            ['MAN (metropolitana)', 'uma cidade', 'o anel de fibra entre galpão, prefeitura, escola e hospital'],
            ['WAN (longa distância)', 'entre cidades e países', 'o circuito de 80 km até a capital'],
            ['internet', 'o planeta', 'a rede de redes que a cidade quer alcançar'],
          ],
        },
      },
      {
        titulo: 'MAN: a cidade numa rede só',
        texto: [
          'A rede metropolitana liga os prédios de uma cidade, muitas vezes num anel de fibra pelos postes. Se um trecho rompe, o tráfego dá a volta pelo outro lado.',
          'As redes de TV a cabo foram as primeiras MANs: a mesma rede de cabos coaxiais do bairro todo passou a levar dados.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'g', rotulo: 'galpão', x: 300, y: 30 },
            { id: 'p', rotulo: 'prefeitura', x: 520, y: 120 },
            { id: 'h', rotulo: 'hospital', x: 300, y: 210 },
            { id: 'e', rotulo: 'escola', x: 80, y: 120 },
          ],
          ligacoes: [
            ['g', 'p', '4 km de fibra'],
            ['p', 'h', 'fibra'],
            ['h', 'e', 'fibra'],
            ['e', 'g', 'fibra'],
          ],
        },
      },
      {
        titulo: 'WAN: hosts e sub-rede de comunicação',
        texto: [
          'Numa WAN, os hosts ficam nas pontas e a sub-rede de comunicação fica no meio, só transportando. Ela tem enlaces (alugados, de fibra, rádio ou satélite) e roteadores, que escolhem por qual enlace cada pacote segue.',
          'Cada 100 km de fibra somam 1 ms no ping. A capital, a 80 km, já aparece no cronômetro.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'h1', rotulo: 'host: PC do galpão', x: 70, y: 40 },
            { id: 'r1', rotulo: 'roteador de Fim de Linha', x: 230, y: 130 },
            { id: 'r2', rotulo: 'roteador da serra', x: 400, y: 50 },
            { id: 'r3', rotulo: 'roteador da capital', x: 520, y: 150 },
            { id: 'h2', rotulo: 'host: servidor estadual', x: 520, y: 240 },
          ],
          ligacoes: [
            ['h1', 'r1', 'LAN'],
            ['r1', 'r2', 'enlace alugado'],
            ['r2', 'r3', 'enlace alugado'],
            ['r1', 'r3', 'enlace alugado (rota alternativa)'],
            ['r3', 'h2', 'LAN'],
          ],
        },
      },
      {
        titulo: 'Alugar, tunelar ou misturar',
        texto: ['Há mais de um jeito de ligar o galpão à capital. Cada um troca controle por preço.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Jeito', 'Como funciona', 'Prós e contras'],
          linhas: [
            ['enlace alugado', 'a operadora reserva um circuito só seu', 'previsível e caro'],
            ['VPN', 'túneis cifrados por cima da internet', 'barato e flexível, mas o caminho é de outros'],
            ['SD-WAN', 'software escolhe entre fibra, rádio e celular para cada tráfego', 'aproveita tudo o que tem; precisa de gestão central'],
          ],
        },
      },
      {
        titulo: 'Redes diferentes, conversa comum',
        texto: [
          'Interligar redes (internetworking) é juntar redes de donos e tecnologias diferentes. Quem fica na fronteira é o gateway; na camada de rede, o gateway é o roteador.',
          'A internet é exatamente isso: milhares de redes interligadas por roteadores, cada rede com o seu dono.',
        ],
        visual: { tipo: 'camadas', camadas: ['rede da cidade (fibra, endereços da prefeitura)', 'roteador na fronteira: lê o pacote e escolhe a saída', 'rede da secretaria estadual (outra tecnologia, outros endereços)'], rotulo: 'duas redes e um gateway entre elas' },
      },
    ],
    checagem: {
      pergunta: 'O hospital tem unidades em três cidades e quer ligá-las sem alugar circuito, usando a internet que já paga, mas com os dados protegidos. O que ele monta?',
      opcoes: ['Uma VPN: túneis cifrados por cima da internet', 'Uma PAN em cada unidade', 'Uma MAN que atravessa os três municípios', 'Um hub em cada cidade'],
      certa: 0,
      explicacao: 'A VPN cria uma rede privada virtual por cima de uma rede pública. É mais barata que alugar enlaces, mas o caminho no meio não é do hospital.',
    },
  },
  desafio: {
    carta: [
      'Bilhete do hospital, grampeado num laudo em branco: "puxaram a fibra até o laboratório regional, na cidade vizinha, a 60 km. Está tudo ligado, a luzinha do switch acende, mas nenhum exame chega".',
      'O técnico aproveitou os transceptores que sobraram do anel da cidade.',
      'Objetivo: o hospital pingando o laboratório (192.0.2.150) com zero perda e as duas perguntas respondidas.',
    ],
    dicas: [
      'Olhe os detalhes do enlace longo: o que chega do outro lado?',
      'Transceptor de 10 km em 60 km de fibra não tem luz suficiente. Troque os dois lados por um de longo alcance, do mesmo tipo.',
      'Rede entre cidades é WAN. E quem liga redes de donos diferentes é o roteador.',
    ],
    perguntas: d33,
    montar: () => {
      const m = novoMundo(1533);
      adicionar(m, pc('hospital', { modelo: 'PC do laboratório do hospital, com JanelOS', ttl: 128, ip: ip('192.0.2.140/24') }));
      adicionar(m, sfp(comutador('sw-hospital', { modelo: 'Switch do hospital, com uma porta SFP', portas: 4, sfp: 1 }), 'sfp1', 'LX-10'));
      adicionar(m, sfp(comutador('sw-laboratorio', { modelo: 'Switch do laboratório regional', portas: 4, sfp: 1 }), 'sfp1', 'LX-10'));
      adicionar(m, pc('laboratorio', { modelo: 'Servidor de laudos do laboratório regional', ttl: 64, ip: ip('192.0.2.150/24') }));
      ligar(m, { equip: 'hospital', porta: 'eth0' }, { equip: 'sw-hospital', porta: 'p1' }, 'cat6', 20, { id: 'c1' });
      ligar(m, { equip: 'sw-hospital', porta: 'sfp1' }, { equip: 'sw-laboratorio', porta: 'sfp1' }, 'fibra', 60000, { id: 'c2', nota: 'lançada ontem pela estrada até a cidade vizinha' });
      ligar(m, { equip: 'sw-laboratorio', porta: 'p1' }, { equip: 'laboratorio', porta: 'eth0' }, 'cat6', 15, { id: 'c3' });
      m.proxCabo = 4;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'hospital', '192.0.2.150'), ...todasRespondidas(m, d33)],
    solucao: [
      ['cabo', 'c2', 'detalhes'],
      ['equip', 'sw-hospital', 'sfp:sfp1', { modelo: 'ZX-80' }],
      ['equip', 'sw-laboratorio', 'sfp:sfp1', { modelo: 'ZX-80' }],
      ['equip', 'hospital', 'ping', { destino: '192.0.2.150', n: '4' }],
    ],
    respostas: { '1': '4', '2': 'roteador' },
  },
};

/* ======================================================================
 * Dia 34: Como a Internet é montada (1.4.1)
 * ====================================================================== */

/** Vazão útil medida agora de uma casa até o cache, em Mb/s. */
const vazaoAte = (de: string, para: string) => (m: Mundo) => {
  const v = vazao(m, de, para);
  return typeof v === 'string' ? NaN : v.mbps;
};

/** Conferência de um passo de vazão: a última medição caiu na faixa esperada, em Mb/s. */
const mediu = (min: number, max: number) => (m: Mundo) => {
  const v = m.flags.ultimaVazao as number | undefined;
  if (v === undefined) return 'A medição não aconteceu.';
  return (v >= min && v <= max) || 'A medição deu outro valor. Confira se mediu na casa certa.';
};

const p34: Pergunta[] = [
  numerica('1', 'Quantos Mb/s úteis o sítio da serra (casa-sat) mede até o cache? (duas casas decimais)', vazaoAte('casa-sat', 'cdn'), 0.05),
  numerica('2', 'Qual a média do ping da casa da fibra até o servidor de origem, na capital, em ms? (uma casa decimal)', mediaPing('casa-fibra', '198.51.100.90'), 0.05),
];

/** Perguntas do desafio. */
const d34: Pergunta[] = [
  texto('1', 'Como se chama o acordo em que duas redes trocam tráfego diretamente entre si, sem uma pagar à outra?', /^(o\s+)?peering$/i),
  numerica('2', 'Antes da ponte no IXP, quantos km de fibra o pedido do cliente do Vizinho Net percorria, só de ida, até o cache?', 160, 0),
];

const dia34: Dia = {
  numero: 34,
  ato: 0,
  titulo: 'Como a Internet é montada',
  chamado: [
    'CHAMADO #0034',
    'Chegou uma carta escrita à mão, de alguém da rua de cima: "me disseram que a internet é uma nuvem. Então por que tem gente pendurada no poste da minha rua com um rolo de fibra?".',
    'Porque a nuvem tem postes, caixas, galpões e muita fibra. Hoje dá para seguir o caminho inteiro, da casa até o data center.',
    'Objetivo: medir a vazão da casa com fibra e do sítio com satélite até o cache de vídeo, pingar o cache e a origem do vídeo, e responder as duas perguntas.',
  ],
  manual: {
    titulo: 'De rede de pesquisa a rede de redes',
    texto: [
      'Nos anos 1960, as redes eram telefônicas: comutação de circuitos, com um caminho reservado de ponta a ponta durante a chamada inteira. Bastava destruir uma central para cortar tudo. A ideia nova foi a comutação de pacotes: picotar a mensagem em pacotes que viajam sozinhos, guardados e repassados de nó em nó, cada um pelo caminho que estiver de pé.',
      'Com essa ideia nasceu uma rede de pesquisa, a ARPANET, que em 1969 ligava quatro universidades. Ela cresceu, adotou o TCP/IP em 1983, se juntou a redes acadêmicas de vários países e, nos anos 1990, com a web e os provedores comerciais, virou a internet de todo mundo.',
      'Hoje a internet é montada em camadas de redes. Na ponta fica a rede de acesso, o último trecho até a casa: DSL (pelo par telefônico), cabo coaxial (pela rede de TV), fibra até a casa, celular ou satélite. Quem oferece esse acesso é o provedor de acesso. Para alcançar o resto do mundo, ele compra trânsito de um provedor de backbone, dono de enlaces de longa distância entre cidades e países.',
      'Provedores também trocam tráfego diretamente nos pontos de troca de tráfego (IXP): um prédio com switches onde muitas redes se ligam. Quando duas redes trocam tráfego diretamente, sem uma pagar à outra, isso é peering. Trânsito é pago; peering é um acordo entre vizinhos.',
      'O conteúdo mora em data centers, prédios cheios de servidores. Para não buscar cada vídeo longe, as redes de entrega de conteúdo (CDN) põem cópias, os caches, perto das pessoas, dentro do IXP ou do próprio provedor. Perto quer dizer menos atraso e menos trânsito pago.',
    ],
  },
  dicas: [
    'Meça a vazão das duas casas e compare o enlace mais lento do caminho de cada uma.',
    'Medir vazão na casa-fibra e na casa-sat; depois ping da casa-fibra para 198.51.100.80 e para 198.51.100.90.',
    'O satélite geoestacionário entrega 50 Mb/s; tire os cabeçalhos (1460 de 1538 bytes).',
  ],
  perguntas: p34,
  montar: () => {
    const m = novoMundo(134);
    adicionar(m, pc('casa-fibra', { modelo: 'PC da casa da rua de cima, com fibra até a sala', ttl: 64, ip: ip('198.51.100.10/24') }));
    adicionar(m, sfp(comutador('ont', { modelo: 'Terminal de fibra da casa (ONT)', portas: 2, sfp: 1 }), 'sfp1', 'LX-10'));
    adicionar(m, pc('casa-sat', { modelo: 'PC do sítio da serra, sem cabo nenhum por perto', ttl: 128, ip: ip('198.51.100.20/24') }));
    adicionar(m, aparelho('antena-sat', 'terminal-sat', 'Antena e terminal de satélite geoestacionário do sítio', [{ nome: 'lan' }, { nome: 'ceu', fisica: 'sat' }]));
    adicionar(m, aparelho('estacao-sat', 'gateway-sat', 'Estação terrena do satélite, no provedor', [{ nome: 'ceu', fisica: 'sat' }, { nome: 'lan' }]));
    adicionar(m, sfp(sfp(comutador('sw-provedor', { modelo: 'Switch do provedor de acesso Fim de Linha Net', portas: 4, sfp: 2 }), 'sfp1', 'LX-10'), 'sfp2', 'LX-10'));
    adicionar(m, sfp(sfp(comutador('sw-ixp', { modelo: 'Switch do ponto de troca de tráfego (IXP) da região', portas: 4, sfp: 2 }), 'sfp1', 'LX-10'), 'sfp2', 'ZX-80'));
    adicionar(m, pc('cdn', { modelo: 'Cache da rede de entrega de conteúdo VideoTudo, dentro do IXP', ttl: 64, ip: ip('198.51.100.80/24') }));
    adicionar(m, sfp(comutador('sw-capital', { modelo: 'Switch do data center da capital', portas: 4, sfp: 1 }), 'sfp1', 'ZX-80'));
    adicionar(m, pc('origem', { modelo: 'Servidor de origem da VideoTudo, no data center da capital', ttl: 64, ip: ip('198.51.100.90/24') }));
    ligar(m, { equip: 'casa-fibra', porta: 'eth0' }, { equip: 'ont', porta: 'p1' }, 'cat6', 5, { id: 'c1' });
    ligar(m, { equip: 'ont', porta: 'sfp1' }, { equip: 'sw-provedor', porta: 'sfp1' }, 'fibra', 3000, { id: 'c2', nota: 'rede de acesso: a fibra do poste da rua de cima' });
    ligar(m, { equip: 'casa-sat', porta: 'eth0' }, { equip: 'antena-sat', porta: 'lan' }, 'cat6', 10, { id: 'c3' });
    ligar(m, { equip: 'antena-sat', porta: 'ceu' }, { equip: 'estacao-sat', porta: 'ceu' }, 'satelite', 0, { id: 'c4', sat: { orbita: 'geo' }, nota: 'rede de acesso: subida e descida pelo satélite' });
    ligar(m, { equip: 'estacao-sat', porta: 'lan' }, { equip: 'sw-provedor', porta: 'p1' }, 'cat6', 5, { id: 'c5' });
    ligar(m, { equip: 'sw-provedor', porta: 'sfp2' }, { equip: 'sw-ixp', porta: 'sfp1' }, 'fibra', 8000, { id: 'c6', nota: 'do provedor até o ponto de troca de tráfego' });
    ligar(m, { equip: 'sw-ixp', porta: 'p1' }, { equip: 'cdn', porta: 'eth0' }, 'cat6', 3, { id: 'c7' });
    ligar(m, { equip: 'sw-ixp', porta: 'sfp2' }, { equip: 'sw-capital', porta: 'sfp1' }, 'fibra', 80000, { id: 'c8', nota: 'backbone: trânsito pago até a capital' });
    ligar(m, { equip: 'sw-capital', porta: 'p1' }, { equip: 'origem', porta: 'eth0' }, 'cat6', 5, { id: 'c9' });
    m.proxCabo = 10;
    m.flags.servidorTeste = 'cdn';
    return m;
  },
  objetivo: (m) => [
    item('vazão medida até o cache', m.flags.ultimaVazao !== undefined, m.flags.ultimaVazao === undefined ? 'ainda não foi medida' : undefined),
    pingOk(m, 'casa-fibra', '198.51.100.80'),
    pingOk(m, 'casa-fibra', '198.51.100.90'),
    ...todasRespondidas(m, p34),
  ],
  posMorte: [
    'A casa da fibra mediu 949,28 Mb/s: o caminho inteiro é de 1 Gb/s, e só os cabeçalhos ficaram com a diferença. O sítio da serra mediu 47,46 Mb/s, porque o enlace mais lento do caminho dele é o satélite, de 50 Mb/s. A rede de acesso é quase sempre o gargalo, e é ela que muda de casa para casa.',
    'O vídeo pedido pela rua de cima saiu do cache no IXP, a 11 km de fibra, e voltou em 0,198 ms. Buscar na origem, na capital, somou 80 km de backbone em cada sentido e deu 1,0 ms. E cada pacote que vai à capital passa pelo trânsito, que o provedor paga.',
    'Resumo do caminho: casa, rede de acesso, provedor de acesso, ponto de troca de tráfego, backbone e data center. A nuvem é isso, com postes.',
  ],
  passos: [
    passo({ alvo: ['equip', 'casa-fibra'], acao: 'vazao', instrucao: 'Na casa da fibra, meça a vazão até o cache de vídeo.', porque: 'A rede de acesso é o último trecho até a casa. Medir a vazão mostra quanto esse trecho entrega.', conferir: mediu(900, 1000), feito: '949,28 Mb/s. O enlace mais lento do caminho é de 1 Gb/s, e o resto foi para os cabeçalhos.' }),
    passo({ alvo: ['equip', 'casa-sat'], acao: 'vazao', instrucao: 'Agora meça a vazão no sítio da serra, que usa satélite.', porque: 'Mesmo provedor, mesmo cache. Só a rede de acesso é diferente.', conferir: mediu(0, 100), feito: 'Uma fração da fibra. O satélite é o enlace mais lento do caminho, e ele manda na vazão.' }),
    passo({ pergunta: '1', exemplo: { resposta: '47.46' }, instrucao: 'Quantos Mb/s úteis o sítio mediu?', porque: 'Está no resultado da medição. É o satélite de 50 Mb/s vezes a eficiência do quadro.', feito: '47,46 Mb/s: 50 Mb/s vezes 1460/1538. A rede de acesso define o teto de cada casa.' }),
    passo({ alvo: ['equip', 'casa-fibra'], acao: 'ping', valores: { destino: '198.51.100.80', n: '4' }, instrucao: 'Da casa da fibra, mande um ping para o cache, que fica no IXP.', porque: 'O cache é a cópia do conteúdo que a rede de entrega de conteúdo põe perto das pessoas.', conferir: pingou('casa-fibra', '198.51.100.80'), feito: '0,198 ms: 3 km de acesso, 8 km até o IXP, e o vídeo já estava lá.' }),
    passo({ alvo: ['equip', 'casa-fibra'], acao: 'ping', valores: { destino: '198.51.100.90', n: '4' }, instrucao: 'Agora mande um ping para o servidor de origem, no data center da capital.', porque: 'Sem cache, todo pedido teria de atravessar o backbone até a capital.', conferir: pingou('casa-fibra', '198.51.100.90'), feito: 'Bem mais lento: 80 km a mais de fibra em cada sentido, pelo enlace de trânsito.' }),
    passo({ pergunta: '2', exemplo: { resposta: '1.0' }, instrucao: 'Qual a média do ping até a origem, em ms?', porque: 'Está na última linha do ping. Compare com o do cache.', feito: '1,0 ms, uns 0,8 ms a mais que o cache, só de luz andando no backbone. Com milhares de km, como entre continentes, a diferença vira dezenas de ms.' }),
    passo({
      escolha: {
        opcoes: ['Porque o cache fica perto, no IXP: menos atraso e nada de trânsito pago até a capital', 'Porque o cache tem um vídeo melhor que o da origem', 'Porque o satélite não alcança a capital', 'Porque o IXP é o dono do vídeo'],
        certa: 0,
        errada: {
          1: 'O cache é uma cópia: o vídeo é o mesmo. O que muda é a distância.',
          2: 'A casa da fibra nem usa satélite. E a origem está na capital, ligada pelo backbone.',
          3: 'O IXP é só o prédio onde as redes se encontram. O conteúdo é de quem o publica; a CDN só põe cópias perto.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que a rede de entrega de conteúdo põe cópias do vídeo dentro do IXP?',
      porque: 'Compare os dois pings e lembre quem paga pelo enlace de trânsito até a capital.',
      feito: 'Perto é mais rápido e mais barato. Por isso os vídeos mais vistos moram perto de quem assiste.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'De rede de pesquisa a internet',
        texto: ['A internet não foi projetada inteira de uma vez. Ela cresceu juntando redes, uma de cada vez.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Quando', 'O que aconteceu'],
          linhas: [
            ['anos 1960', 'a ideia da comutação de pacotes: uma rede sem centro, que não cai inteira se um nó cair'],
            ['1969', 'a ARPANET liga quatro universidades, com computadores dedicados a repassar pacotes'],
            ['1983', 'a rede inteira passa a usar TCP/IP'],
            ['anos 1980', 'redes acadêmicas de vários países se ligam a ela'],
            ['anos 1990', 'chegam a web e os provedores comerciais: a rede de pesquisa vira a rede de todo mundo'],
          ],
        },
      },
      {
        titulo: 'Circuitos ou pacotes',
        texto: ['A rede telefônica reserva um caminho para cada chamada. A internet picota tudo em pacotes que dividem os enlaces.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Comutação de circuitos', 'Comutação de pacotes'],
          linhas: [
            ['antes de falar', 'reserva o caminho inteiro', 'nada: o pacote sai e pronto'],
            ['enlace em silêncio', 'fica reservado, ocioso', 'outros pacotes aproveitam'],
            ['se um nó cai', 'a chamada cai', 'os pacotes seguintes contornam'],
            ['exemplo', 'o telefone fixo da prefeitura', 'o ping que você mandou hoje'],
          ],
        },
      },
      {
        titulo: 'A rede de acesso',
        texto: [
          'O último trecho até a casa é a rede de acesso, e é ele que quase sempre define o teto de cada casa. Hoje, a fibra mediu 949,28 Mb/s e o satélite geoestacionário, 47,46 Mb/s.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Acesso', 'Por onde passa', 'Em Fim de Linha'],
          linhas: [
            ['DSL', 'o par de cobre do telefone, até a central', 'as casas antigas do centro'],
            ['cabo', 'a rede coaxial da TV a cabo, dividida pelo bairro', 'a rua da antiga TV comunitária'],
            ['fibra até a casa', 'luz do provedor até um terminal (ONT) na sala', 'a rua de cima'],
            ['celular', 'rádio até a torre mais próxima', 'quem está na estrada'],
            ['satélite', 'subida e descida pelo espaço', 'o sítio da serra'],
          ],
        },
      },
      {
        titulo: 'Da casa ao data center',
        texto: [
          'O provedor de acesso junta as casas. No ponto de troca de tráfego (IXP), muitas redes se encontram. O backbone leva o tráfego longe, e o conteúdo mora em data centers, com cópias (caches) perto das pessoas.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'casa', x: 60, y: 120 },
            { id: 'p', rotulo: 'provedor de acesso', x: 200, y: 120 },
            { id: 'x', rotulo: 'IXP', x: 350, y: 120 },
            { id: 'k', rotulo: 'cache da CDN', x: 350, y: 220 },
            { id: 'v', rotulo: 'provedor vizinho', x: 350, y: 30 },
            { id: 'b', rotulo: 'backbone', x: 470, y: 120 },
            { id: 'd', rotulo: 'data center', x: 560, y: 220 },
          ],
          ligacoes: [
            ['c', 'p', 'rede de acesso'],
            ['p', 'x', 'fibra'],
            ['x', 'k'],
            ['x', 'v', 'peering'],
            ['x', 'b', 'trânsito (pago)'],
            ['b', 'd', 'longa distância'],
          ],
        },
      },
      {
        titulo: 'Trânsito e peering',
        texto: ['Toda rede precisa alcançar todas as outras. Há dois jeitos de conseguir isso.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Trânsito', 'Peering'],
          linhas: [
            ['o que é', 'uma rede maior leva o seu tráfego para o mundo todo', 'duas redes trocam o tráfego delas diretamente'],
            ['quem paga', 'o cliente paga ao provedor de trânsito', 'em geral, ninguém paga ninguém'],
            ['alcance', 'a internet inteira', 'só as duas redes e os clientes delas'],
            ['onde', 'enlaces de longa distância do backbone', 'quase sempre num IXP'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Dois provedores da mesma cidade só se falam pela capital, a 80 km, pagando trânsito. O que resolve?',
      opcoes: ['Os dois se ligarem no IXP da cidade e fazerem peering', 'Comprar mais trânsito até a capital', 'Trocar a rede de acesso das casas por satélite', 'Desligar o cache da CDN'],
      certa: 0,
      explicacao: 'No IXP, o tráfego entre os dois fica na cidade: menos atraso, e nenhum dos dois paga trânsito para falar com o vizinho.',
    },
  },
  desafio: {
    carta: [
      'Reclamação do provedor Vizinho Net, que atende o outro lado do rio: "os nossos clientes assistem aos vídeos do cache do IXP, que fica a 2 km da nossa sala, mas o tráfego vai e volta pela capital. E a conta do trânsito chegou".',
      'O switch deles já tem uma porta SFP livre com transceptor, e o IXP também.',
      'Objetivo: o cliente do Vizinho Net pingando o cache (198.51.100.80) com 10 pedidos, zero perda e média abaixo de 0,5 ms, e as duas perguntas respondidas.',
    ],
    dicas: [
      'Ping primeiro, para sentir a volta pela capital. Depois procure as portas SFP livres.',
      'Passe uma fibra de 2000 m da sfp2 do sw-vizinho até a sfp2 do sw-ixp.',
      'Troca direta sem pagamento tem nome em inglês: peering. E a volta pela capital era 80 km mais 80 km.',
    ],
    perguntas: d34,
    montar: () => {
      const m = novoMundo(1534);
      adicionar(m, pc('cliente-vizinho', { modelo: 'PC de cliente do Vizinho Net, do outro lado do rio', ttl: 128, ip: ip('198.51.100.110/24') }));
      adicionar(m, sfp(sfp(comutador('sw-vizinho', { modelo: 'Switch do provedor Vizinho Net', portas: 4, sfp: 2 }), 'sfp1', 'ZX-80'), 'sfp2', 'LX-10'));
      adicionar(m, sfp(sfp(comutador('sw-capital', { modelo: 'Switch do provedor de trânsito, na capital', portas: 4, sfp: 2 }), 'sfp1', 'ZX-80'), 'sfp2', 'ZX-80'));
      adicionar(m, sfp(sfp(comutador('sw-ixp', { modelo: 'Switch do ponto de troca de tráfego (IXP) da região', portas: 4, sfp: 2 }), 'sfp1', 'ZX-80'), 'sfp2', 'LX-10'));
      adicionar(m, pc('cdn', { modelo: 'Cache da rede de entrega de conteúdo VideoTudo, dentro do IXP', ttl: 64, ip: ip('198.51.100.80/24') }));
      ligar(m, { equip: 'cliente-vizinho', porta: 'eth0' }, { equip: 'sw-vizinho', porta: 'p1' }, 'cat6', 30, { id: 'c1' });
      ligar(m, { equip: 'sw-vizinho', porta: 'sfp1' }, { equip: 'sw-capital', porta: 'sfp1' }, 'fibra', 80000, { id: 'c2', nota: 'trânsito pago até a capital' });
      ligar(m, { equip: 'sw-capital', porta: 'sfp2' }, { equip: 'sw-ixp', porta: 'sfp1' }, 'fibra', 80000, { id: 'c3', nota: 'trânsito da capital de volta à região' });
      ligar(m, { equip: 'sw-ixp', porta: 'p1' }, { equip: 'cdn', porta: 'eth0' }, 'cat6', 3, { id: 'c4' });
      m.proxCabo = 5;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'cliente-vizinho', '198.51.100.80', 10, 0, 0.5), ...todasRespondidas(m, d34)],
    solucao: [
      ['equip', 'cliente-vizinho', 'ping', { destino: '198.51.100.80', n: '4' }],
      ['equip', 'sw-vizinho', 'cabo-novo', { porta: 'sfp2', destino: 'sw-ixp:sfp2', meio: 'fibra', metros: '2000' }],
      ['equip', 'cliente-vizinho', 'ping', { destino: '198.51.100.80', n: '10' }],
    ],
    respostas: { '1': 'peering', '2': '160' },
  },
};

export const ATO0C: Dia[] = [dia33, dia34];
