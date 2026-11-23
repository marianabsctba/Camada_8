// Dias novos do ato 0 (Fim de Linha), com prática guiada, aula e desafio no próprio dia.
// Para que serve uma rede e os tipos de rede (seções 1.1 e 1.2).

import { vazao } from '../motor/rede';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, TRANSCEPTORES, type Equipamento, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

const ip = (s: string) => lerCidr(s)!;

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Conferência de um passo de ping: voltaram todas as respostas. */
const pingou = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  if (!r) return 'O ping não aconteceu.';
  return r.recebidos === r.n || `Voltaram ${r.recebidos} de ${r.n}. Confira o destino e os cabos.`;
};

/** Existe um cabo ligando direto estes dois equipamentos? */
const ligadosDireto = (m: Mundo, x: string, y: string) =>
  [...m.cabos.values()].some((c) => (c.a.equip === x && c.b.equip === y) || (c.a.equip === y && c.b.equip === x));

/* ======================================================================
 * ref 31: Para que serve uma rede (1.1)
 * ====================================================================== */

/** Pergunta do desafio. */
const d31: Pergunta[] = [numerica('1', 'Se cada casa mandar 4 pedidos de ping, quantas respostas a loja manda ao todo?', 8, 0)];

const dia31: Dia = {
  numero: 31,
  ato: 0,
  titulo: 'Para que serve uma rede',
  chamado: [
    'CHAMADO #0001',
    'Ofício da prefeitura, com carimbo e tudo: "Fim de Linha é a única cidade da região em que a receita do posto vai a cavalo, a cooperativa vende por bilhete e a escola baixa a lição no pendrive de quem foi à capital. Queremos rede. Queremos saber também para que ela serve, porque a câmara vai perguntar."',
    'No galpão já tem um switch, o servidor do portal da prefeitura e o PC de uma casa ligados. A escola e a biblioteca mandaram os PCs delas, ainda sem cabo.',
    'Objetivo: a casa conversando com o servidor da prefeitura e a escola conversando direto com a biblioteca, sem servidor no meio.',
  ],
  manual: {
    titulo: 'Para que serve uma rede de computadores',
    texto: [
      'Rede de computadores é um conjunto de computadores autônomos ligados entre si por alguma tecnologia: cobre, fibra, rádio, satélite. Autônomos quer dizer que cada um funciona sozinho; a rede é o que deixa eles trocarem informação.',
      'As pessoas usam rede para cinco coisas grandes. Acesso à informação: ler notícia, consultar o horário do ônibus, pesquisar para a prova. Comunicação entre pessoas: mensagem, e-mail, videochamada, rede social. Comércio eletrônico: comprar e vender sem ir até a loja. Entretenimento: vídeo, música, jogo. E a internet das coisas: aparelhos que não são computador (um medidor de luz, um sensor de nível da represa, uma câmera) mandando dados sozinhos.',
      'O jeito mais comum de organizar isso é o modelo cliente-servidor. O servidor guarda os dados e fica esperando pedidos; o cliente pede e recebe a resposta. Um servidor atende muitos clientes. O portal da prefeitura é servidor; o PC da casa que abre o portal é cliente.',
      'O outro jeito é o peer-to-peer, ou par a par: não existe servidor fixo, e cada máquina pode pedir e responder. É como uma roda de troca de figurinhas, em que cada um tem algumas e passa adiante para quem pede.',
      'Rede também tem lado ruim: dá para espionar, enganar e perseguir pela rede. Você vê isso de perto no fim da história. Por enquanto, a cidade só quer ser ouvida.',
    ],
  },
  dicas: [
    'Comece pelo que já está ligado: a casa e o servidor da prefeitura.',
    'Ping da casa para 192.0.2.2. Depois passe um cabo da escola direto até a biblioteca.',
    'Com o cabo escola até biblioteca no lugar, faça um ping da escola para 192.0.2.32.',
  ],
  montar: () => {
    const m = novoMundo(131);
    adicionar(m, pc('casa', { modelo: 'PC da família da Rua das Acácias', ttl: 64, ip: ip('192.0.2.21/24') }));
    adicionar(m, comutador('sw-galpao', { modelo: 'Switch do rack do galpão SG-8' }));
    adicionar(m, pc('servidor-pref', { modelo: 'Servidor do portal da prefeitura, com Pinguix', ttl: 64, ip: ip('192.0.2.2/24') }));
    adicionar(m, pc('escola', { modelo: 'PC da escola, com Pinguix', ttl: 64, ip: ip('192.0.2.31/24') }));
    adicionar(m, pc('biblioteca', { modelo: 'PC da biblioteca, com JanelOS e porta que se ajusta sozinha', ttl: 128, mdix: true, ip: ip('192.0.2.32/24') }));
    ligar(m, { equip: 'casa', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p1' }, 'cat6', 30, { id: 'c1' });
    ligar(m, { equip: 'sw-galpao', porta: 'p8' }, { equip: 'servidor-pref', porta: 'eth0' }, 'cat6', 3, { id: 'c2' });
    m.proxCabo = 3;
    return m;
  },
  objetivo: (m) => [
    pingOk(m, 'casa', '192.0.2.2'),
    item('escola e biblioteca ligadas direto, sem switch no meio', ligadosDireto(m, 'escola', 'biblioteca')),
    pingOk(m, 'escola', '192.0.2.32'),
  ],
  posMorte: [
    'A casa fez um pedido e o servidor da prefeitura respondeu: isso é cliente-servidor. O servidor não sabe de antemão quem vai pedir; ele só fica ali, ligado, esperando. Amanhã mil casas podem abrir o portal ao mesmo tempo, e o servidor é um só.',
    'Escola e biblioteca falaram direto, sem ninguém no meio para guardar nada: isso é par a par. Na prática, o par a par aparece quando muita gente troca arquivos entre si, e cada máquina que baixa um pedaço também passa esse pedaço adiante.',
    'Para a câmara: acesso à informação, comunicação, comércio, entretenimento e coisas falando sozinhas. A receita do posto, o bilhete da cooperativa e o pendrive da escola cabem nas três primeiras. O cavalo pode se aposentar.',
  ],
  passos: [
    passo({ alvo: ['equip', 'casa'], acao: 'ping', valores: { destino: '192.0.2.2', n: '4' }, instrucao: 'Da casa, mande um ping para o servidor da prefeitura.', porque: 'O ping é a menor conversa possível numa rede: um pedido e uma resposta. Serve para ver quem pede e quem responde.', conferir: pingou('casa', '192.0.2.2'), feito: 'Quatro pedidos saíram da casa, quatro respostas voltaram do servidor. A rede existe.' }),
    passo({
      escolha: {
        opcoes: ['A casa é cliente e o servidor da prefeitura é servidor', 'A casa é servidor, porque foi ela que começou', 'Os dois são servidores', 'O switch é o servidor, porque está no meio'],
        certa: 0,
        errada: {
          1: 'Quem começa a conversa pedindo é o cliente. O servidor é quem fica esperando e responde.',
          2: 'A casa não guarda o portal e não atende ninguém: ela só pediu.',
          3: 'O switch só repassa quadros de uma porta para outra. Ele não guarda nem responde nada.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Nessa conversa, quem é o cliente e quem é o servidor?',
      porque: 'No modelo cliente-servidor, o cliente faz o pedido e o servidor, que guarda os dados e fica esperando, responde.',
      feito: 'Casa pede, servidor responde. Um servidor só atende muitas casas: é por isso que ele fica no galpão, ligado o tempo todo.',
    }),
    passo({ alvo: ['equip', 'escola'], acao: 'cabo-novo', valores: { porta: 'eth0', destino: 'biblioteca:eth0', meio: 'cat6', metros: '15' }, instrucao: 'Passe um cabo da escola direto até a biblioteca.', porque: 'Para ver o par a par, tire o servidor da história: duas máquinas, um cabo, ninguém no meio.', conferir: (m) => ligadosDireto(m, 'escola', 'biblioteca') || 'A escola e a biblioteca ainda não estão ligadas uma na outra.', feito: 'Um cabo de 15 m entre as duas. A porta da biblioteca se ajusta sozinha, então o cabo comum serve.' }),
    passo({ alvo: ['equip', 'escola'], acao: 'ping', valores: { destino: '192.0.2.32', n: '4' }, instrucao: 'Da escola, mande um ping para a biblioteca.', porque: 'Não tem servidor nem switch no caminho: se responder, as duas estão conversando de igual para igual.', conferir: pingou('escola', '192.0.2.32'), feito: 'Quatro respostas. A biblioteca respondeu à escola, e poderia muito bem ter perguntado também.' }),
    passo({
      escolha: {
        opcoes: ['Par a par: cada máquina pode pedir e responder, sem servidor fixo', 'Cliente-servidor, com a biblioteca de servidor para sempre', 'Não é rede, porque só tem dois computadores', 'Comércio eletrônico'],
        certa: 0,
        errada: {
          1: 'Agora a escola perguntou. Amanhã a biblioteca pode perguntar e a escola responder. Ninguém tem o papel fixo de servidor.',
          2: 'Dois computadores autônomos trocando informação já são uma rede. Pequena, mas rede.',
          3: 'Comércio eletrônico é um uso da rede, não um jeito de organizar as máquinas.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Como se chama esse jeito de organizar a conversa?',
      porque: 'Compare com a casa e o servidor: lá, os papéis eram fixos. Aqui, qualquer um dos dois pode pedir.',
      feito: 'Par a par. É o que a escola e a biblioteca vão usar para trocar o acervo digitalizado sem passar pela prefeitura.',
    }),
    passo({
      escolha: {
        opcoes: ['Internet das coisas', 'Entretenimento', 'Comunicação entre pessoas', 'Comércio eletrônico'],
        certa: 0,
        errada: {
          1: 'Ninguém está se divertindo: é um sensor mandando número.',
          2: 'Não tem pessoa nenhuma dos dois lados escrevendo. É um aparelho que manda dados sozinho.',
          3: 'Ninguém está comprando nem vendendo nada.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A represa quer um sensor que mande o nível da água para a prefeitura a cada cinco minutos, sem ninguém apertar botão. Que uso da rede é esse?',
      porque: 'Acesso à informação, comunicação, comércio, entretenimento e internet das coisas. Só um deles não tem gente apertando botão.',
      feito: 'Internet das coisas: um aparelho que não é computador, falando sozinho pela rede. A prefeitura vai gostar de saber antes que a água chegue na praça.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O que é uma rede',
        texto: [
          'Rede de computadores é um conjunto de computadores autônomos ligados por alguma tecnologia, que trocam informação entre si.',
          'Autônomo quer dizer que cada um liga e funciona sozinho. A rede é o que deixa eles conversarem.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'casa', rotulo: 'casa', x: 90, y: 60 },
            { id: 'escola', rotulo: 'escola', x: 90, y: 180 },
            { id: 'sw', rotulo: 'switch do galpão', x: 300, y: 120 },
            { id: 'pref', rotulo: 'servidor da prefeitura', x: 510, y: 60 },
            { id: 'bib', rotulo: 'biblioteca', x: 510, y: 180 },
          ],
          ligacoes: [
            ['casa', 'sw', 'cabo'],
            ['escola', 'sw', 'cabo'],
            ['sw', 'pref', 'cabo'],
            ['sw', 'bib', 'cabo'],
          ],
        },
      },
      {
        titulo: 'Cinco usos, uma cidade',
        texto: ['Quase tudo o que as pessoas fazem com rede cabe em cinco caixas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Uso', 'Em Fim de Linha'],
          linhas: [
            ['acesso à informação', 'a escola consulta o acervo da biblioteca sem pendrive'],
            ['comunicação entre pessoas', 'o posto manda a receita para a farmácia, sem cavalo'],
            ['comércio eletrônico', 'a cooperativa vende queijo para a capital'],
            ['entretenimento', 'a final do campeonato ao vivo, na praça'],
            ['internet das coisas', 'o sensor da represa avisa o nível da água sozinho'],
          ],
        },
      },
      {
        titulo: 'Cliente-servidor',
        texto: [
          'O servidor guarda os dados e espera. O cliente pede, o servidor responde. Um servidor atende muitos clientes, um de cada vez ou vários ao mesmo tempo.',
          'Quase tudo o que você abre num navegador funciona assim.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c1', rotulo: 'cliente: casa 1', x: 100, y: 40 },
            { id: 'c2', rotulo: 'cliente: casa 2', x: 100, y: 120 },
            { id: 'c3', rotulo: 'cliente: escola', x: 100, y: 200 },
            { id: 's', rotulo: 'servidor do portal', x: 480, y: 120 },
          ],
          ligacoes: [
            ['c1', 's', 'pedido e resposta'],
            ['c2', 's', 'pedido e resposta'],
            ['c3', 's', 'pedido e resposta'],
          ],
        },
      },
      {
        titulo: 'Par a par',
        texto: [
          'No par a par não há servidor fixo: cada máquina pede e responde. Quem baixa um pedaço de arquivo também entrega esse pedaço a quem pedir.',
          'A vantagem é não depender de um servidor só. A desvantagem é não ter ninguém responsável por manter o arquivo no ar.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'escola', x: 120, y: 50 },
            { id: 'b', rotulo: 'biblioteca', x: 480, y: 50 },
            { id: 'c', rotulo: 'cooperativa', x: 120, y: 200 },
            { id: 'd', rotulo: 'posto', x: 480, y: 200 },
          ],
          ligacoes: [
            ['a', 'b', 'pede e responde'],
            ['a', 'c', 'pede e responde'],
            ['b', 'd', 'pede e responde'],
            ['c', 'd', 'pede e responde'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O portal da prefeitura caiu. Quem continua conseguindo trocar arquivos?',
      opcoes: ['As máquinas que trocam par a par, porque não dependem daquele servidor', 'Ninguém: sem servidor não existe rede', 'Só as casas que eram clientes do portal', 'Só o switch'],
      certa: 0,
      explicacao: 'No cliente-servidor, sem servidor não há resposta. No par a par, cada máquina responde pelo que tem, e a conversa continua entre quem sobrou.',
    },
  },
  desafio: {
    carta: [
      'Bilhete da cooperativa, escrito às pressas: "a feira de sábado vai ser pela internet! A loja virtual já está instalada no servidor novo. Só que nenhuma casa consegue abrir. O técnico disse que o servidor está ótimo, só não está ligado em nada."',
      'Duas casas da Rua das Acácias querem ser as primeiras clientes.',
      'Objetivo: as duas casas pingando a loja (192.0.2.50) e a pergunta respondida.',
    ],
    dicas: [
      'Servidor que não está ligado em nada não atende ninguém. Veja as portas livres do switch.',
      'Passe um cabo da loja até uma porta livre do sw-galpao e faça o ping de cada casa.',
    ],
    perguntas: d31,
    montar: () => {
      const m = novoMundo(1531);
      adicionar(m, pc('casa-a', { modelo: 'PC da casa 3 da Rua das Acácias', ttl: 64, ip: ip('192.0.2.23/24') }));
      adicionar(m, pc('casa-b', { modelo: 'Notebook da casa 7 da Rua das Acácias', ttl: 128, ip: ip('192.0.2.27/24') }));
      adicionar(m, comutador('sw-galpao', { modelo: 'Switch do rack do galpão SG-8' }));
      adicionar(m, pc('loja', { modelo: 'Servidor da loja virtual da cooperativa, com Pinguix', ttl: 64, ip: ip('192.0.2.50/24') }));
      ligar(m, { equip: 'casa-a', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p1' }, 'cat6', 40, { id: 'c1' });
      ligar(m, { equip: 'casa-b', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p2' }, 'cat6', 55, { id: 'c2' });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => [
      pingOk(m, 'casa-a', '192.0.2.50'),
      pingOk(m, 'casa-b', '192.0.2.50'),
      ...todasRespondidas(m, d31),
    ],
    solucao: [
      ['equip', 'sw-galpao', 'mostra'],
      ['equip', 'loja', 'cabo-novo', { porta: 'eth0', destino: 'sw-galpao:p8', meio: 'cat6', metros: '3' }],
      ['equip', 'casa-a', 'ping', { destino: '192.0.2.50', n: '4' }],
      ['equip', 'casa-b', 'ping', { destino: '192.0.2.50', n: '4' }],
    ],
    respostas: { '1': '8' },
  },
};

/* ======================================================================
 * ref 32: Tipos de rede (1.2)
 * ====================================================================== */

/** Põe o mesmo transceptor nas portas SFP indicadas. */
function sfp(e: Equipamento, modelo: string, ...portas: string[]): Equipamento {
  for (const p of e.portas) if (portas.includes(p.nome)) p.sfp = TRANSCEPTORES[modelo];
  return e;
}

function radio(nome: string, rumo: number): Equipamento {
  const e = aparelho(nome, 'radio', 'Rádio PTP 5,8 GHz com antena de 23 dBi', [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax: 30 });
  e.antena = { ganho: 23, azimute: rumo, azimuteCerto: rumo, altura: 20, feixe: 9 };
  return e;
}

/** Vazão até o servidor de vídeo, pela conta do motor. */
const vazaoAte = (de: string) => (m: Mundo) => {
  const v = vazao(m, de, 'servidor-video');
  return typeof v === 'string' ? -1 : v.mbps;
};

const VIZINHOS_PRACA = [
  { nome: 'Fibra_Fim_de_Linha_Praca', canal: 1, dbm: -48 },
  { nome: 'Padaria Pao Nosso', canal: 6, dbm: -62 },
  { nome: 'CelularDoVereador', canal: 11, dbm: -58 },
  { nome: 'Igreja_Matriz_Visitantes', canal: 11, dbm: -77 },
];

const p32: Pergunta[] = [
  numerica('1', 'Quantos Mb/s úteis a casa do satélite mede até o servidor de vídeo? (duas casas decimais)', vazaoAte('casa-sat'), 0.05),
  numerica('2', 'Quantas redes sem fio o analisador de espectro mostra na praça?', VIZINHOS_PRACA.length, 0),
];

/** Perguntas do desafio. */
const d32: Pergunta[] = [
  numerica('1', 'De que tipo é a rede em que está o servidor de prontuários? (1 acesso, 2 móvel, 3 provedor de conteúdo, 4 trânsito, 5 corporativa)', 5, 0),
  numerica('2', 'E a caixa do provedor na calçada, onde a recepção estava ligada? (1 acesso, 2 móvel, 3 provedor de conteúdo, 4 trânsito, 5 corporativa)', 1, 0),
];

const portaDaRecepcao = (m: Mundo) => {
  const c = m.cabos.get('c1')!;
  return c.a.equip === 'recepcao' ? c.b : c.a;
};

const dia32: Dia = {
  numero: 32,
  ato: 0,
  titulo: 'Tipos de rede',
  chamado: [
    'CHAMADO #0002',
    'Carta da câmara de vereadores: "a prefeitura diz que a cidade precisa de rede. Mas qual? O vereador da zona rural jura que satélite resolve tudo, o da praça quer Wi-Fi e o presidente da câmara só quer assistir ao jogo sem travar."',
    'No galpão montaram uma bancada de teste: uma casa por fibra, um sítio por rádio, uma fazenda por satélite, todos chegando ao mesmo servidor de vídeo num data center lá fora.',
    'Objetivo: medir a vazão pelos acessos, contar as redes sem fio da praça e responder às perguntas.',
  ],
  manual: {
    titulo: 'Redes de acesso, móveis, de conteúdo, de trânsito e corporativas',
    texto: [
      'A internet não é uma rede só: é uma rede de redes, cada uma com um trabalho. A rede de acesso, ou de banda larga, é a que chega na casa das pessoas: fibra, cabo coaxial, par de cobre do telefone, rádio, satélite. É o último trecho, e quase sempre o mais lento e o mais caro de construir.',
      'Redes móveis e sem fio levam a rede pelo ar. O Wi-Fi cobre uma casa ou uma praça, com um ponto de acesso. A rede celular cobre uma região inteira com torres, e passa a conversa de uma torre para outra quando a pessoa anda. O ar é dividido entre todo mundo que está por perto, e é por isso que um analisador de espectro mostra as redes vizinhas.',
      'Redes de provedor de conteúdo ficam nos data centers: salas cheias de servidores que guardam vídeo, busca, rede social e loja. Os provedores grandes constroem redes próprias e põem cópias do conteúdo perto de quem assiste, para não atravessar o mundo a cada clique.',
      'Redes de trânsito ligam provedores entre si. Um provedor pequeno, como a futura Fibra Fim de Linha, não tem cabo até cada data center do planeta: ele paga um provedor de trânsito para levar o tráfego adiante. Provedores do mesmo porte também trocam tráfego direto, em pontos de troca de tráfego.',
      'Redes corporativas são as redes internas de uma organização: a prefeitura, o hospital, a cooperativa. Ligam os computadores e servidores de dentro, muitas vezes em vários prédios, e só saem para a internet por uma porta controlada.',
    ],
  },
  dicas: [
    'A medição de vazão de cada casa vai até o servidor de vídeo. Comece pela casa da fibra e depois a do satélite.',
    'O resultado sai em Mb/s, MB/s e MiB/s. A pergunta quer Mb/s.',
    'O analisador de espectro fica no menu do ponto de acesso da praça. Conte as linhas de rede, sem contar o ruído de fundo.',
  ],
  perguntas: p32,
  montar: () => {
    const m = novoMundo(132);
    adicionar(m, pc('casa-fibra', { modelo: 'PC da casa ligada por fibra', ttl: 64, mdix: true, ip: ip('192.0.2.41/24') }));
    adicionar(m, pc('casa-radio', { modelo: 'PC do sítio ligado por rádio', ttl: 64, mdix: true, ip: ip('192.0.2.42/24') }));
    adicionar(m, pc('casa-sat', { modelo: 'PC da fazenda ligada por satélite', ttl: 64, mdix: true, ip: ip('192.0.2.43/24') }));
    adicionar(m, sfp(comutador('ont', { modelo: 'Terminal de fibra da casa', portas: 2, sfp: 1 }), 'LX-10', 'sfp1'));
    adicionar(m, radio('radio-sitio', 135));
    adicionar(m, radio('radio-torre', 315));
    adicionar(m, aparelho('terminal', 'terminal-sat', 'Terminal de satélite da fazenda', [{ nome: 'lan' }, { nome: 'ceu', fisica: 'sat' }]));
    adicionar(m, aparelho('gateway', 'gateway-sat', 'Estação terrena da Céu Aberto Satélites', [{ nome: 'ceu', fisica: 'sat' }, { nome: 'lan' }]));
    adicionar(m, sfp(comutador('sw-acesso', { modelo: 'Borda da rede de acesso no galpão', portas: 4, sfp: 2 }), 'LX-10', 'sfp1', 'sfp2'));
    adicionar(m, sfp(comutador('sw-transito', { modelo: 'Borda da Rodovia Trânsito IP, que leva o tráfego dos provedores pequenos', portas: 4, sfp: 2 }), 'LX-10', 'sfp1', 'sfp2'));
    adicionar(m, sfp(comutador('sw-datacenter', { modelo: 'Rede do data center da TocaVídeo', portas: 4, sfp: 1 }), 'LX-10', 'sfp1'));
    adicionar(m, pc('servidor-video', { modelo: 'Servidor de vídeo da TocaVídeo, num data center', ttl: 64, mdix: true, ip: ip('192.0.2.200/24') }));
    adicionar(
      m,
      aparelho('ap-praca', 'ap', 'Ponto de acesso 2,4 GHz da praça', [{ nome: 'lan' }], { canal: 6, sinalCliente: -55, ruidoDbm: -95, vizinhos: VIZINHOS_PRACA.map((v) => ({ ...v })) }),
    );
    ligar(m, { equip: 'casa-fibra', porta: 'eth0' }, { equip: 'ont', porta: 'p1' }, 'cat6', 5, { id: 'c1' });
    ligar(m, { equip: 'ont', porta: 'sfp1' }, { equip: 'sw-acesso', porta: 'sfp1' }, 'fibra', 2500, { id: 'c2' });
    ligar(m, { equip: 'casa-radio', porta: 'eth0' }, { equip: 'radio-sitio', porta: 'lan' }, 'cat6', 10, { id: 'c3' });
    ligar(m, { equip: 'radio-sitio', porta: 'ar' }, { equip: 'radio-torre', porta: 'ar' }, 'radio', 3000, { id: 'c4', radio: { distanciaKm: 3, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'radio-torre', porta: 'lan' }, { equip: 'sw-acesso', porta: 'p1' }, 'cat6', 40, { id: 'c5' });
    ligar(m, { equip: 'casa-sat', porta: 'eth0' }, { equip: 'terminal', porta: 'lan' }, 'cat6', 10, { id: 'c6' });
    ligar(m, { equip: 'terminal', porta: 'ceu' }, { equip: 'gateway', porta: 'ceu' }, 'satelite', 0, { id: 'c7', sat: { orbita: 'geo' } });
    ligar(m, { equip: 'gateway', porta: 'lan' }, { equip: 'sw-transito', porta: 'p1' }, 'cat6', 20, { id: 'c8' });
    ligar(m, { equip: 'sw-acesso', porta: 'sfp2' }, { equip: 'sw-transito', porta: 'sfp1' }, 'fibra', 8000, { id: 'c9' });
    ligar(m, { equip: 'sw-transito', porta: 'sfp2' }, { equip: 'sw-datacenter', porta: 'sfp1' }, 'fibra', 6000, { id: 'c10' });
    ligar(m, { equip: 'sw-datacenter', porta: 'p1' }, { equip: 'servidor-video', porta: 'eth0' }, 'cat6', 2, { id: 'c11' });
    m.proxCabo = 12;
    m.flags.servidorTeste = 'servidor-video';
    return m;
  },
  objetivo: (m) => [...todasRespondidas(m, p32)],
  posMorte: [
    'A casa da fibra mediu 949,28 Mb/s, o sítio, por rádio, 284,79 Mb/s, e a fazenda, por satélite, 47,46 Mb/s. As três usaram a mesma rede de trânsito e o mesmo data center: o que mudou foi só a rede de acesso, o último trecho até a casa.',
    'Cada medição atravessou três tipos de rede: a de acesso (fibra, rádio ou satélite), a de trânsito da Rodovia Trânsito IP e a do provedor de conteúdo, no data center da TocaVídeo. No ar da praça, quatro redes sem fio dividem o mesmo espectro. Falta a corporativa, a rede de dentro da prefeitura, do hospital ou da cooperativa: ela aparece no desafio.',
    'Para a câmara: o satélite chega aonde nada mais chega, mas é o mais lento da bancada. A fibra é a melhor e a mais cara de puxar. O rádio fica no meio. O presidente da câmara vai querer fibra.',
  ],
  passos: [
    passo({ alvo: ['equip', 'casa-fibra'], acao: 'vazao', instrucao: 'Da casa da fibra, meça a vazão até o servidor de vídeo.', porque: 'A rede de acesso é o último trecho até a casa. Para comparar acessos, meça todos até o mesmo servidor.', conferir: (m) => (m.flags.ultimaVazao !== undefined ? true : 'A medição não aconteceu.'), feito: '949,28 Mb/s. O enlace mais lento do caminho é de 1000 Mb/s: a fibra não segura ninguém.' }),
    passo({ alvo: ['equip', 'casa-sat'], acao: 'vazao', instrucao: 'Agora meça da casa do satélite.', porque: 'Mesmo servidor, mesma rede de trânsito. Só a rede de acesso muda.', conferir: (m) => ((m.flags.ultimaVazao ?? 999) < 60 ? true : 'Essa medição não foi da casa do satélite.'), feito: 'Bem menos: o enlace de satélite geoestacionário leva 50 Mb/s e vira o gargalo do caminho inteiro.' }),
    passo({ pergunta: '1', exemplo: { resposta: '47.46' }, instrucao: 'Quantos Mb/s úteis a casa do satélite mediu?', porque: 'O resultado sai em três unidades. Use a primeira, em Mb/s.', feito: '47,46 Mb/s, vinte vezes menos que a fibra. Para a fazenda, ainda assim, é a única opção que chega lá.' }),
    passo({ alvo: ['equip', 'ap-praca'], acao: 'espectro', instrucao: 'No ponto de acesso da praça, abra o analisador de espectro.', porque: 'Rede sem fio usa o ar, e o ar é dividido com todo mundo por perto. O analisador mostra quem mais está transmitindo na mesma faixa.', feito: 'Redes vizinhas em vários canais, duas delas no canal 11. Todas dividem a mesma faixa de 2,4 GHz.' }),
    passo({ pergunta: '2', exemplo: { resposta: '4' }, instrucao: 'Quantas redes sem fio o analisador mostrou?', porque: 'Conte as linhas com canal e potência. O ruído de fundo não é rede.', feito: 'Quatro. Até o celular do vereador vira uma rede sem fio quando compartilha a internet.' }),
    passo({
      escolha: {
        opcoes: ['Rede de trânsito: leva o tráfego de provedores menores até o resto da internet', 'Rede de acesso: chega na casa das pessoas', 'Rede corporativa: é a rede interna de uma empresa', 'Rede de provedor de conteúdo: guarda os vídeos'],
        certa: 0,
        errada: {
          1: 'Nenhuma casa está ligada no sw-transito. Ele recebe o galpão e a estação de satélite, que já são provedores.',
          2: 'A Rodovia Trânsito IP não tem computador de funcionário pendurado: o que passa por ela é o tráfego dos outros.',
          3: 'Os vídeos estão no servidor do data center. O sw-transito só leva até lá.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que tipo de rede é a do sw-transito, que liga o galpão e a estação de satélite ao data center?',
      porque: 'Olhe quem está ligado nele: não são casas, são outras redes.',
      feito: 'Trânsito. O galpão sozinho não tem cabo até cada data center do mundo, então paga quem tem.',
    }),
    passo({
      escolha: {
        opcoes: ['Rede de provedor de conteúdo, num data center', 'Rede móvel', 'Rede de acesso', 'Rede de trânsito'],
        certa: 0,
        errada: {
          1: 'Nada ali se mexe nem usa o ar: é um servidor num rack.',
          2: 'Nenhuma casa está ligada ali. É lá que o conteúdo mora.',
          3: 'O sw-datacenter não leva o tráfego dos outros adiante: o caminho termina nele.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'E o sw-datacenter, onde está o servidor de vídeo?',
      porque: 'É ali que o vídeo fica guardado, esperando quem peça.',
      feito: 'Provedor de conteúdo. Os grandes têm data centers espalhados pelo mundo e redes próprias ligando todos eles.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Rede de redes',
        texto: ['Do PC da casa até o vídeo, o caminho atravessa redes de donos diferentes, cada uma com o seu trabalho.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'casa', rotulo: 'casa', x: 60, y: 120 },
            { id: 'acesso', rotulo: 'rede de acesso', x: 200, y: 120 },
            { id: 'transito', rotulo: 'rede de trânsito', x: 360, y: 120 },
            { id: 'dc', rotulo: 'provedor de conteúdo', x: 520, y: 60 },
            { id: 'corp', rotulo: 'rede corporativa', x: 520, y: 190 },
          ],
          ligacoes: [
            ['casa', 'acesso', 'último trecho'],
            ['acesso', 'transito', 'paga para passar'],
            ['transito', 'dc', 'até o data center'],
            ['transito', 'corp', 'até o hospital'],
          ],
        },
      },
      {
        titulo: 'O último trecho',
        texto: ['A rede de acesso é a que chega até a casa. Mesmo servidor, mesmo caminho lá fora: na bancada, só o acesso muda.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Acesso', 'Enlace na bancada', 'Vazão medida'],
          linhas: [
            ['fibra', '1000 Mb/s', '949,28 Mb/s'],
            ['rádio ponto a ponto', '300 Mb/s', '284,79 Mb/s'],
            ['satélite geoestacionário', '50 Mb/s', '47,46 Mb/s'],
          ],
        },
      },
      {
        titulo: 'O ar é de todo mundo',
        texto: [
          'Redes sem fio e móveis usam o ar. Wi-Fi cobre uma casa ou uma praça; a rede celular cobre a região com torres e passa a conversa de uma para outra quando a pessoa anda.',
          'Todo mundo por perto divide a mesma faixa. Na praça, são quatro redes.',
        ],
        visual: { tipo: 'espectro', canais: VIZINHOS_PRACA.map((v) => ({ canal: v.canal, dbm: v.dbm, rotulo: v.nome })) },
      },
      {
        titulo: 'Quem faz o quê',
        texto: ['Cinco tipos de rede, cada um com um trabalho.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tipo', 'Trabalho', 'Na bancada'],
          linhas: [
            ['acesso (banda larga)', 'chegar na casa', 'terminal de fibra, rádio do sítio, terminal de satélite'],
            ['móvel e sem fio', 'levar a rede pelo ar', 'ponto de acesso da praça, celular do vereador'],
            ['provedor de conteúdo', 'guardar e servir o conteúdo', 'data center da TocaVídeo'],
            ['trânsito', 'ligar provedores entre si', 'Rodovia Trânsito IP'],
            ['corporativa', 'ligar o lado de dentro de uma organização', 'a rede do hospital, no desafio'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'A Fibra Fim de Linha quer que as casas assistam a vídeos de um data center do outro lado do país. Do que ela precisa?',
      opcoes: ['De um provedor de trânsito que leve o tráfego até lá, ou de uma troca direta com o provedor de conteúdo', 'De puxar fibra própria de cada casa até o data center', 'De uma rede corporativa', 'De mais pontos de acesso na praça'],
      certa: 0,
      explicacao: 'O provedor de acesso cuida do último trecho. Para chegar ao resto da internet, ele paga trânsito ou troca tráfego direto com quem tem o conteúdo.',
    },
  },
  desafio: {
    carta: [
      'Ofício do hospital: "a recepção não abre o prontuário. O técnico do provedor ligou o PC novo na caixa da calçada, disse que agora tem internet e foi embora."',
      'Internet tem. Só que o prontuário não fica na internet: fica na rede de dentro do hospital, que não tem nada a ver com a caixa da calçada.',
      'Objetivo: a recepção na rede interna, pingando o servidor de prontuários (192.0.2.72), e as duas perguntas respondidas.',
    ],
    dicas: [
      'Veja onde o cabo da recepção está ligado e onde está o servidor de prontuários.',
      'Mude a ponta do cabo c1 que está na caixa da calçada para uma porta livre do sw-hospital e faça o ping.',
    ],
    perguntas: d32,
    montar: () => {
      const m = novoMundo(1532);
      adicionar(m, pc('recepcao', { modelo: 'PC novo da recepção do hospital, com JanelOS', ttl: 128, ip: ip('192.0.2.71/24') }));
      adicionar(m, comutador('caixa-calcada', { modelo: 'Caixa de acesso do provedor na calçada', portas: 4 }));
      adicionar(m, comutador('sw-hospital', { modelo: 'Switch da rede interna do hospital SG-8' }));
      adicionar(m, pc('prontuario', { modelo: 'Servidor de prontuários do hospital, com Pinguix', ttl: 64, ip: ip('192.0.2.72/24') }));
      adicionar(m, pc('enfermaria', { modelo: 'PC da enfermaria', ttl: 64, ip: ip('192.0.2.73/24') }));
      ligar(m, { equip: 'recepcao', porta: 'eth0' }, { equip: 'caixa-calcada', porta: 'p1' }, 'cat6', 30, { id: 'c1', nota: 'etiqueta do técnico: "internet ok"' });
      ligar(m, { equip: 'sw-hospital', porta: 'p8' }, { equip: 'prontuario', porta: 'eth0' }, 'cat6', 5, { id: 'c2' });
      ligar(m, { equip: 'sw-hospital', porta: 'p3' }, { equip: 'enfermaria', porta: 'eth0' }, 'cat6', 45, { id: 'c3' });
      m.proxCabo = 4;
      return m;
    },
    objetivo: (m) => {
      const p = portaDaRecepcao(m);
      return [item('recepção ligada na rede interna do hospital', p.equip === 'sw-hospital', `${p.equip}:${p.porta}`), pingOk(m, 'recepcao', '192.0.2.72'), ...todasRespondidas(m, d32)];
    },
    solucao: [
      ['cabo', 'c1', 'detalhes'],
      ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'sw-hospital:p1' }],
      ['equip', 'recepcao', 'ping', { destino: '192.0.2.72', n: '4' }],
    ],
    respostas: { '1': '5', '2': '1' },
  },
};

export const ATO0A: Dia[] = [dia31, dia32];
