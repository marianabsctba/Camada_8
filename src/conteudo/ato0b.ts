// Dias novos do ato 0 (Fim de Linha), com prática guiada, aula e desafio no próprio dia.
// Camadas, serviços, modelos, padrões e as questões sociais da rede (seções 1.5 a 1.8).

import { vazao } from '../motor/rede';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, type Equipamento, type Mundo } from '../motor/mundo';
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

/** Conferência de um passo de ping: chegou pelo menos uma resposta. */
const pingou = (de: string, destino: string) => (m: Mundo) => {
  const r = registroPing(m, de, destino);
  if (!r) return 'O ping não aconteceu.';
  return r.recebidos === r.n || `Voltaram ${r.recebidos} de ${r.n}. Confira o destino.`;
};

const capturou = (m: Mundo) => !!m.ultimaCaptura || 'Nada capturado ainda: o ping precisa chegar ao destino.';

/** Uma câmera IP que já vem com senha de fábrica e com a sessão aberta (acabou de ser instalada). */
function camera(nome: string, modelo: string, local: string): Equipamento {
  const config = [`hostname ${nome}`, `local ${local}`, 'usuario admin', 'acesso-remoto ligado', 'gravacao continua'];
  return aparelho(nome, 'roteador', modelo, [{ nome: 'eth0' }], {
    estado: 'ligado',
    senha: 'admin',
    senhaRunning: 'admin',
    logado: true,
    inicio: 'normal',
    startup: [...config],
    running: [...config],
  });
}

const senhaTrocada = (m: Mundo, nome: string) => {
  const s = m.equipamentos.get(nome)!.s;
  return item(`${nome} com senha nova gravada`, !!s.senha && s.senha !== 'admin', s.senha === 'admin' ? 'ainda com a senha de fábrica' : undefined);
};

const configInteira = (m: Mundo, nome: string) => {
  const s = m.equipamentos.get(nome)!.s;
  const ok = ['acesso-remoto ligado', 'gravacao continua'].every((l) => s.startup.includes(l));
  return item(`${nome} com a configuração preservada`, ok, ok ? undefined : 'a configuração gravada perdeu linhas');
};

/* ======================================================================
 * ref 36: Camadas de protocolos (1.5.1 e 1.5.2)
 * ====================================================================== */

const p36: Pergunta[] = [
  numerica('1', 'Qual o tamanho do pacote IPv4 capturado, em bytes?', 84, 0),
  numerica('2', 'Desses bytes, quantos são cabeçalho (IPv4 mais ICMP), sem contar os dados?', 28, 0),
];

/** Perguntas do desafio. */
const d36: Pergunta[] = [
  numerica('1', 'Em que camada do modelo de cinco camadas estava o defeito? (1 física, 2 enlace, 3 rede, 4 transporte, 5 aplicação)', 3, 0),
  numerica('2', 'No quadro capturado, com que TTL o pedido chegou ao posto?', 128, 0),
];

const dia36: Dia = {
  numero: 36,
  ato: 0,
  titulo: 'Camadas de protocolos',
  chamado: [
    'CHAMADO #0007',
    'Chegou um envelope da secretaria de educação, com um post-it colado: "A escola e a biblioteca já estão no mesmo switch do galpão. A diretora quer saber o que exatamente viaja no cabo, porque o filho dela disse que a internet tem camadas, igual bolo."',
    'Ela tem razão, e o bolo é recheado de cabeçalhos.',
    'Objetivo: mandar um ping da escola para a biblioteca, capturar o quadro e dizer quanto dele é cabeçalho.',
  ],
  manual: {
    titulo: 'Camadas, protocolos e encapsulamento',
    texto: [
      'Uma rede precisa ser confiável (perceber e contornar erros e falhas), dividir bem os recursos (muita gente usando o mesmo cabo), evoluir (aceitar tecnologia nova sem jogar tudo fora) e ser segura (só quem deve lê, ninguém falsifica). É problema demais para um programa só.',
      'A saída é dividir em camadas. Cada camada resolve um pedaço do problema e oferece um serviço para a de cima, por uma interface bem definida. O conjunto de camadas e protocolos de um sistema se chama pilha de protocolos.',
      'Protocolo é o acordo entre camadas pares: a camada 3 da escola conversa com a camada 3 da biblioteca, com regras combinadas. Mas essa conversa é virtual: de verdade, a mensagem desce até o cabo, atravessa e sobe do outro lado.',
      'Na descida, cada camada põe o seu cabeçalho na frente do que recebeu de cima: isso é encapsular. Na subida, cada camada lê e tira o seu. Num ping, o ICMP vai dentro do IPv4, que vai dentro do Ethernet.',
    ],
  },
  dicas: [
    'Primeiro gere tráfego; depois olhe o que passou.',
    'Ping da escola para 192.0.2.30, depois "capturar" na biblioteca.',
    'O tamanho do IPv4 é 84. Os dados do ping são 56 bytes. O resto é cabeçalho.',
  ],
  perguntas: p36,
  montar: () => {
    const m = novoMundo(136);
    adicionar(m, pc('escola', { modelo: 'PC da escola, com Pinguix', ttl: 64, ip: ip('192.0.2.10/24') }));
    adicionar(m, comutador('sw-galpao', { modelo: 'Switch do rack do galpão SG-8' }));
    adicionar(m, pc('biblioteca', { modelo: 'PC da biblioteca, com JanelOS', ttl: 128, ip: ip('192.0.2.30/24') }));
    ligar(m, { equip: 'escola', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p1' }, 'cat6', 25, { id: 'c1' });
    ligar(m, { equip: 'sw-galpao', porta: 'p2' }, { equip: 'biblioteca', porta: 'eth0' }, 'cat6', 40, { id: 'c2' });
    m.proxCabo = 3;
    return m;
  },
  objetivo: (m) => [pingOk(m, 'escola', '192.0.2.30'), item('quadro capturado', !!m.ultimaCaptura), ...todasRespondidas(m, p36)],
  posMorte: [
    'O ping desceu a pilha na escola: o ICMP montou a mensagem, o IPv4 pôs endereços e TTL na frente, o Ethernet pôs os MACs e o EtherType, e a placa virou tudo em sinal. Na biblioteca, o caminho foi o inverso, cada camada tirando o seu cabeçalho.',
    'Dos 84 bytes do pacote IPv4, 28 são cabeçalho (20 do IPv4 e 8 do ICMP) e 56 são dado. O Ethernet ainda soma 14 bytes na frente e 4 de verificação no fim. Cabeçalho não é desperdício: é o que deixa cada camada trabalhar sem conhecer as outras.',
    'O switch do galpão só abriu o envelope de fora. Ele não sabe o que é um ping, e não precisa saber. É isso que deixa trocar uma camada sem mexer nas outras.',
  ],
  passos: [
    passo({ alvo: ['equip', 'escola'], acao: 'ping', valores: { destino: '192.0.2.30', n: '4' }, instrucao: 'Da escola, mande um ping para a biblioteca.', porque: 'Para estudar as camadas é preciso uma mensagem de verdade passando pelo fio. O ping é a menor delas.', conferir: pingou('escola', '192.0.2.30'), feito: 'Quatro pedidos, quatro respostas. Cada um desceu a pilha na escola, virou sinal no cabo e subiu a pilha na biblioteca.' }),
    passo({ alvo: ['equip', 'biblioteca'], acao: 'capturar', instrucao: 'Na biblioteca, veja o último quadro que chegou.', porque: 'A captura mostra o quadro aberto, envelope por envelope, do de fora para o de dentro.', conferir: capturou, feito: 'Três cabeçalhos, um dentro do outro: Ethernet por fora, IPv4 no meio, ICMP por dentro, e os 56 bytes de dados no miolo.' }),
    passo({
      escolha: {
        opcoes: ['ICMP', 'IPv4', 'Ethernet', 'Nenhum: o dado vai pelado'],
        certa: 2,
        errada: {
          0: 'O ICMP foi o primeiro: ele é a própria mensagem do ping, e cada camada de baixo embrulha por fora dele.',
          1: 'O IPv4 embrulha o ICMP, mas ainda falta a camada de enlace pôr o envelope dela por fora.',
          3: 'Sem cabeçalho, ninguém saberia para quem é nem o que vai dentro. A captura mostra três.',
        },
      },
      exemplo: { resposta: '2' },
      instrucao: 'Na escola, qual cabeçalho foi colocado por último, logo antes de o quadro virar sinal?',
      porque: 'Na descida, cada camada põe o cabeçalho dela na frente do que recebeu de cima. O último a entrar é o que fica mais por fora.',
      feito: 'Ethernet. É também o primeiro que a biblioteca lê na chegada, e o único que o switch lê.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '84' }, instrucao: 'Qual o tamanho do pacote IPv4 capturado, em bytes?', porque: 'O campo tamanho do IPv4 conta o cabeçalho IP e tudo o que vai dentro dele. Está na linha do IPv4 da captura.', feito: '84 bytes: 20 de cabeçalho IPv4, 8 de cabeçalho ICMP e 56 de dados.' }),
    passo({ pergunta: '2', exemplo: { resposta: '28' }, instrucao: 'Desses 84 bytes, quantos são cabeçalho?', porque: 'Tire os 56 bytes de dados dos 84 do pacote.', feito: '28 bytes de cabeçalho para levar 56 de dado. E o Ethernet ainda põe 14 na frente e 4 de verificação no fim.' }),
    passo({
      escolha: {
        opcoes: ['Com a camada IPv4 da biblioteca, a sua par, usando as camadas de baixo como transporte', 'Com o switch, que lê o IPv4 e responde', 'Direto com o cabo, pulando o Ethernet', 'Só com o ICMP da própria escola'],
        certa: 0,
        errada: {
          1: 'O switch trabalha na camada 2: lê o envelope Ethernet e nem abre o IPv4.',
          2: 'Nenhuma camada pula a de baixo. O IPv4 entrega o pacote ao Ethernet, que entrega à camada física.',
          3: 'O ICMP fica em cima do IPv4 na mesma máquina. Isso é interface entre vizinhos de pilha, não conversa entre pares.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Com quem a camada IPv4 da escola conversa?',
      porque: 'Protocolo é o acordo entre camadas do mesmo nível em máquinas diferentes. Interface é a passagem entre camadas vizinhas na mesma máquina.',
      feito: 'Com a IPv4 da biblioteca. A conversa é virtual: o que existe de verdade é a descida, o cabo e a subida.',
    }),
    passo({ alvo: ['equip', 'sw-galpao'], acao: 'mostra', instrucao: 'Veja as portas do switch do galpão.', porque: 'O switch está no meio do caminho. Vale ver o que ele percebeu do ping.', feito: 'O switch contou quadros na coluna RX e mais nada. Abriu só o envelope de fora para escolher a porta de saída.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O que uma rede precisa dar conta',
        texto: ['Quatro objetivos puxam o projeto de qualquer rede. Nenhum programa sozinho resolve todos: por isso o trabalho é dividido.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Objetivo', 'Em Fim de Linha'],
          linhas: [
            ['confiabilidade', 'o exame do hospital chega inteiro, mesmo com um bit trocado ou um cabo cortado'],
            ['alocação de recursos', 'escola e cooperativa dividem o mesmo enlace sem uma sufocar a outra'],
            ['capacidade de evoluir', 'trocar cobre por fibra sem reescrever o sistema da biblioteca'],
            ['segurança', 'a folha de pagamento da prefeitura não é lida nem alterada no caminho'],
          ],
        },
      },
      {
        titulo: 'Camadas, serviços e interfaces',
        texto: [
          'Cada camada resolve um pedaço e oferece um serviço à de cima, por uma interface. Quem usa não precisa saber como foi feito.',
          'O conjunto inteiro, camada por camada, é a pilha de protocolos.',
        ],
        visual: { tipo: 'camadas', camadas: ['aplicação: o programa da biblioteca', 'transporte: conversa entre programas', 'rede: endereço e rota', 'enlace: quadro entre vizinhos', 'física: bits no cabo'], rotulo: 'a pilha do PC da escola, de cima para baixo' },
      },
      {
        titulo: 'Pares conversam, mas pelo andar de baixo',
        texto: [
          'A camada 3 da escola segue um protocolo com a camada 3 da biblioteca. Essa conversa é virtual (linha tracejada, nos livros). O caminho real desce, cruza o cabo e sobe.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'e3', rotulo: 'escola: rede', x: 90, y: 40 },
            { id: 'e2', rotulo: 'escola: enlace', x: 90, y: 120 },
            { id: 'e1', rotulo: 'escola: física', x: 90, y: 200 },
            { id: 'b3', rotulo: 'biblioteca: rede', x: 510, y: 40 },
            { id: 'b2', rotulo: 'biblioteca: enlace', x: 510, y: 120 },
            { id: 'b1', rotulo: 'biblioteca: física', x: 510, y: 200 },
          ],
          ligacoes: [
            ['e3', 'b3', 'protocolo (virtual)'],
            ['e3', 'e2', 'interface'],
            ['e2', 'e1', 'interface'],
            ['e1', 'b1', 'o cabo de verdade'],
            ['b1', 'b2', 'interface'],
            ['b2', 'b3', 'interface'],
          ],
        },
      },
      {
        titulo: 'Envelope dentro de envelope',
        texto: [
          'Na descida, cada camada põe o seu cabeçalho na frente. Na subida, cada uma lê e tira o seu. Num ping, o pacote IPv4 tem 84 bytes: 20 de IPv4, 8 de ICMP e 56 de dados.',
        ],
        visual: { tipo: 'camadas', camadas: ['Ethernet: 14 bytes de MACs e EtherType (+ 4 no fim)', 'IPv4: 20 bytes de endereços, TTL e protocolo', 'ICMP: 8 bytes de tipo, código e sequência', 'dados: 56 bytes'], rotulo: 'um ping no cabo, de fora para dentro' },
      },
    ],
    checagem: {
      pergunta: 'A cooperativa trocou o cabo de cobre por fibra. O que precisa mudar no programa de vendas dela?',
      opcoes: ['Nada: só a camada física mudou, e as de cima continuam recebendo o mesmo serviço', 'O programa inteiro, porque fibra usa luz', 'Só o cabeçalho IPv4', 'O protocolo ICMP'],
      certa: 0,
      explicacao: 'Esse é o prêmio das camadas: cada uma só depende do serviço da de baixo, não de como ele é feito. Trocar o meio físico não mexe na aplicação.',
    },
  },
  desafio: {
    carta: [
      'Ofício do hospital, em papel timbrado: "o cabo até o posto de saúde está podre". O técnico da cooperativa já trocou esse cabo duas vezes. As duas vezes, nada mudou.',
      'Antes de trocar pela terceira vez, descubra em qual camada está o defeito.',
      'Objetivo: o hospital pingando o posto (192.0.2.41) e as duas perguntas respondidas.',
    ],
    dicas: [
      'Se os enlaces estão ativos, a física e o enlace estão de pé. Suba uma camada.',
      'Compare o endereço do hospital com o do posto.',
      'Ponha o hospital em 192.0.2.40/24, faça o ping e capture o quadro no posto.',
    ],
    perguntas: d36,
    montar: () => {
      const m = novoMundo(1536);
      adicionar(m, pc('hospital', { modelo: 'PC da recepção do hospital, com JanelOS', ttl: 128, ip: ip('198.51.100.20/24') }));
      adicionar(m, comutador('sw-saude', { modelo: 'Switch da rede de saúde SG-8' }));
      adicionar(m, pc('posto', { modelo: 'PC do posto de saúde, com Pinguix', ttl: 64, ip: ip('192.0.2.41/24') }));
      ligar(m, { equip: 'hospital', porta: 'eth0' }, { equip: 'sw-saude', porta: 'p1' }, 'cat6', 60, { id: 'c1', nota: 'novinho, trocado ontem pela segunda vez' });
      ligar(m, { equip: 'sw-saude', porta: 'p2' }, { equip: 'posto', porta: 'eth0' }, 'cat6', 35, { id: 'c2' });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => [
      pingOk(m, 'hospital', '192.0.2.41'),
      ...todasRespondidas(m, d36),
    ],
    solucao: [
      ['equip', 'hospital', 'mostra'],
      ['equip', 'hospital', 'ip', { ip: '192.0.2.40/24' }],
      ['equip', 'hospital', 'ping', { destino: '192.0.2.41', n: '4' }],
      ['equip', 'posto', 'capturar'],
    ],
    respostas: { '1': '3', '2': '128' },
  },
};

/* ======================================================================
 * ref 37: Conexões e serviços (1.5.3 a 1.5.5)
 * ====================================================================== */

const p37: Pergunta[] = [
  numerica('1', 'Qual o número de sequência (seq) do último pedido capturado no servidor?', 10, 0),
  texto('2', 'Numa conversa orientada a conexão, qual a primeira primitiva, chamada pelo servidor antes de qualquer cliente aparecer?', /^listen$/i),
];

/** Perguntas do desafio. */
const d37: Pergunta[] = [
  texto('1', 'Quando chega um pedido de conexão ao servidor que estava em LISTEN, que primitiva ele usa para aceitar?', /^accept$/i),
  numerica('2', 'Quantas conexões o seu ping de 20 pedidos abriu?', 0, 0),
];

const dia37: Dia = {
  numero: 37,
  ato: 0,
  titulo: 'Conexões e serviços',
  chamado: [
    'CHAMADO #0008',
    'A cooperativa vai mandar o pedido de sementes para o servidor da prefeitura pela rede, e o tesoureiro deixou um bilhete: "isso liga igual telefone ou vai igual carta? Porque carta extravia".',
    'Boa pergunta. Depende do serviço que a camada oferece.',
    'Objetivo: um ping de 10 pedidos da cooperativa ao servidor e as duas perguntas sobre serviços respondidas.',
  ],
  manual: {
    titulo: 'Serviço orientado a conexão, sem conexão e as primitivas',
    texto: [
      'Serviço orientado a conexão funciona como telefone: primeiro se estabelece a conexão, depois se conversa, depois se desliga. As mensagens chegam na ordem em que saíram. Serviço sem conexão funciona como correio: cada mensagem leva o endereço completo e viaja sozinha, e duas cartas podem chegar fora de ordem.',
      'Confiável é o serviço que nunca perde dado: o receptor confirma o que recebeu e o que se perdeu é mandado de novo. Isso custa tempo. Voz e vídeo ao vivo preferem perder um pedaço a esperar. Sem conexão e sem confirmação é o datagrama; com confirmação, é a carta registrada; e há ainda a solicitação e resposta, em que cada pergunta espera a sua resposta.',
      'Conexão confiável pode entregar uma sequência de mensagens (cada uma com fronteira própria, como as páginas de um livro enviadas uma a uma) ou um fluxo de bytes (sem fronteira nenhuma, como um download).',
      'Um serviço é oferecido por primitivas. Numa conversa cliente-servidor: o servidor chama LISTEN e espera; o cliente chama CONNECT; o servidor aceita com ACCEPT e faz RECEIVE para esperar o pedido; o cliente faz SEND do pedido; o servidor responde com SEND e o cliente recebe com RECEIVE; no fim, os dois chamam DISCONNECT.',
      'Serviço é o que a camada oferece para cima (a lista de primitivas). Protocolo é como ela faz isso com a camada par do outro lado (formato e ordem das mensagens). Dá para trocar o protocolo sem mudar o serviço, e quem está em cima nem percebe.',
    ],
  },
  dicas: [
    'O ping numera os pedidos. Mande dez e olhe o último que chegou.',
    'Ping da cooperativa para 192.0.2.2 com 10 pedidos, depois "capturar" no servidor.',
    'Antes de alguém ligar, alguém precisa estar escutando: LISTEN.',
  ],
  perguntas: p37,
  montar: () => {
    const m = novoMundo(137);
    adicionar(m, pc('cooperativa', { modelo: 'PC da cooperativa agrícola, com Pinguix', ttl: 64, ip: ip('192.0.2.60/24') }));
    adicionar(m, comutador('sw-galpao', { modelo: 'Switch do rack do galpão SG-8' }));
    adicionar(m, pc('servidor-pref', { modelo: 'Servidor da prefeitura, com Pinguix', ttl: 64, ip: ip('192.0.2.2/24') }));
    ligar(m, { equip: 'cooperativa', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p3' }, 'cat6', 70, { id: 'c1' });
    ligar(m, { equip: 'sw-galpao', porta: 'p8' }, { equip: 'servidor-pref', porta: 'eth0' }, 'cat6', 3, { id: 'c2' });
    m.proxCabo = 3;
    return m;
  },
  objetivo: (m) => [pingOk(m, 'cooperativa', '192.0.2.2', 10), ...todasRespondidas(m, p37)],
  posMorte: [
    'O ping é um serviço sem conexão, do tipo solicitação e resposta: ninguém ligou para ninguém antes, cada pedido de eco viajou sozinho com o endereço completo, e cada resposta casou com o seu pedido pelo número de sequência. O último a chegar foi o 10.',
    'O pedido de sementes é outra história: precisa chegar inteiro e na ordem. Para isso a camada de transporte oferece um serviço orientado a conexão e confiável, com as primitivas LISTEN, CONNECT, ACCEPT, RECEIVE, SEND e DISCONNECT, e por baixo um protocolo que confirma e retransmite.',
    'Respondendo ao tesoureiro: na camada de rede, vai como carta. Quem transforma as cartas em telefonema é a camada de cima. Você vê isso de perto no ato 5.',
  ],
  passos: [
    passo({ alvo: ['equip', 'cooperativa'], acao: 'ping', valores: { destino: '192.0.2.2', n: '10' }, instrucao: 'Da cooperativa, mande 10 pings para o servidor da prefeitura.', porque: 'Repare se acontece alguma coisa antes do primeiro pedido, como um "alô" de telefone.', conferir: pingou('cooperativa', '192.0.2.2'), feito: 'Dez pedidos, dez respostas, e nenhuma conexão aberta antes. Cada pedido saiu sozinho, com o endereço completo, como uma carta.' }),
    passo({
      escolha: {
        opcoes: ['Sem conexão, de solicitação e resposta: cada pedido vai sozinho e espera a sua resposta', 'Orientado a conexão: primeiro liga, depois fala, depois desliga', 'Fluxo de bytes confiável, com retransmissão automática', 'Nenhum: ping não usa serviço de camada nenhuma'],
        certa: 0,
        errada: {
          1: 'Não houve nada antes do primeiro pedido: nenhum CONNECT, nenhum ACCEPT. O primeiro pacote já era o pedido.',
          2: 'Se um pedido se perder, o ping não manda de novo: só anota a perda. E cada pedido tem fronteira própria, não é um fluxo.',
          3: 'O ping usa o serviço da camada de rede, que entrega pacotes sem conexão. Sem esse serviço, ele não sairia da placa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que tipo de serviço o ping usa?',
      porque: 'Pense no que aconteceu antes do primeiro pedido e no que aconteceria se um pedido se perdesse.',
      feito: 'Sem conexão, solicitação e resposta. Se um pedido se perder, ninguém manda de novo: o ping só conta a perda.',
    }),
    passo({ alvo: ['equip', 'servidor-pref'], acao: 'capturar', instrucao: 'No servidor, veja o último pedido que chegou.', porque: 'O cabeçalho ICMP leva um número de sequência. Ele serve para casar pedido com resposta, não para abrir conexão.', conferir: capturou, feito: 'A linha do ICMP mostra o seq do último pedido.' }),
    passo({ pergunta: '1', exemplo: { resposta: '10' }, instrucao: 'Qual o seq do último pedido capturado?', porque: 'Os pedidos são numerados de 1 até a quantidade que você mandou.', feito: 'Seq 10. Numerar não é o mesmo que ter conexão: o número só diz qual resposta é de qual pedido.' }),
    passo({ pergunta: '2', exemplo: { resposta: 'LISTEN' }, instrucao: 'Qual a primeira primitiva de uma conversa orientada a conexão?', porque: 'Antes de alguém ligar, alguém precisa estar esperando a ligação. É o servidor que faz isso.', feito: 'LISTEN: o servidor avisa que aceita conexões e fica bloqueado esperando.' }),
    passo({
      escolha: {
        opcoes: ['CONNECT (cliente), ACCEPT e RECEIVE (servidor), SEND do pedido, SEND da resposta, RECEIVE no cliente, DISCONNECT dos dois lados', 'SEND (cliente) primeiro, depois CONNECT e ACCEPT', 'ACCEPT (servidor) antes de o cliente pedir, depois CONNECT', 'CONNECT, SEND e DISCONNECT, sem ACCEPT nenhum'],
        certa: 0,
        errada: {
          1: 'Num serviço orientado a conexão, não se manda dado antes de a conexão existir. Seria falar antes de alguém atender.',
          2: 'ACCEPT aceita um pedido de conexão que chegou. Sem CONNECT do cliente, não há o que aceitar.',
          3: 'Sem ACCEPT, o pedido de conexão fica tocando sem ninguém atender.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Depois do LISTEN, qual a ordem certa da conversa?',
      porque: 'Pense num telefonema: alguém liga, alguém atende, fala um, responde o outro, os dois desligam.',
      feito: 'Ligar, atender, perguntar, responder, desligar. A ordem das primitivas é a mesma de um telefonema educado.',
    }),
    passo({
      escolha: {
        opcoes: ['No protocolo: as regras entre as camadas pares. O serviço oferecido para cima continua igual', 'No serviço: os programas vão precisar de primitivas novas', 'Na interface com o cabo', 'Em tudo: trocar o protocolo sempre obriga a reescrever os programas'],
        certa: 0,
        errada: {
          1: 'Se as primitivas continuam as mesmas para quem está em cima, o serviço não mudou.',
          2: 'O jeito de confirmar pacotes é um acordo entre os dois lados da mesma camada, não entre a camada e o cabo.',
          3: 'É exatamente o contrário: separar serviço de protocolo existe para poder trocar um sem mexer no outro.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A prefeitura quer mudar o jeito como os dois lados confirmam os pacotes, sem mexer nos programas de cima. Ela está mexendo em quê?',
      porque: 'Serviço é o que a camada oferece para cima. Protocolo é como ela combina isso com a camada par do outro lado.',
      feito: 'No protocolo. Quem usa o serviço nem percebe a troca: é o mesmo balcão, com outro jeito de trabalhar lá dentro.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Telefone ou correio',
        texto: [
          'Orientado a conexão é telefone: liga, conversa, desliga, e tudo chega na ordem. Sem conexão é correio: cada carta leva o endereço inteiro e viaja sozinha.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Orientado a conexão', 'Sem conexão'],
          linhas: [
            ['antes de falar', 'estabelece a conexão', 'nada'],
            ['endereço', 'só na hora de ligar', 'em toda mensagem'],
            ['ordem', 'garantida', 'pode trocar'],
            ['em Fim de Linha', 'a ata da câmara, página por página', 'o aviso de vacinação, um por casa'],
          ],
        },
      },
      {
        titulo: 'Confiável custa caro',
        texto: ['Confiável é o serviço que confirma tudo e manda de novo o que se perdeu. Nem todo mundo quer pagar a espera.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Serviço', 'Exemplo na cidade'],
          linhas: [
            ['fluxo de mensagens confiável', 'as páginas do livro digitalizado da biblioteca'],
            ['fluxo de bytes confiável', 'o download do exame do hospital'],
            ['conexão não confiável', 'a videochamada da escola: melhor perder um quadro que congelar'],
            ['datagrama (sem confirmação)', 'propaganda da feira por e-mail'],
            ['datagrama com confirmação', 'carta registrada: a intimação da câmara'],
            ['solicitação e resposta', 'perguntar ao servidor se a biblioteca tem um livro'],
          ],
        },
      },
      {
        titulo: 'As seis primitivas',
        texto: ['Primitiva é a chamada que o programa faz para usar o serviço. A conversa cliente-servidor segue sempre esta ordem.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'l', rotulo: '1. LISTEN (servidor)', x: 120, y: 30 },
            { id: 'c', rotulo: '2. CONNECT (cliente)', x: 480, y: 30 },
            { id: 'a', rotulo: '3. ACCEPT e RECEIVE (servidor)', x: 120, y: 120 },
            { id: 's', rotulo: '4. SEND do pedido (cliente)', x: 480, y: 120 },
            { id: 'r', rotulo: '5. SEND da resposta, RECEIVE no cliente', x: 120, y: 210 },
            { id: 'd', rotulo: '6. DISCONNECT dos dois lados', x: 480, y: 210 },
          ],
          ligacoes: [
            ['l', 'c', 'esperando'],
            ['c', 'a', 'pedido de conexão'],
            ['a', 's', 'conexão aceita'],
            ['s', 'r', 'pedido'],
            ['r', 'd', 'resposta'],
          ],
        },
      },
      {
        titulo: 'Serviço não é protocolo',
        texto: [
          'Serviço é o balcão da biblioteca: "empresto livro por 15 dias". Protocolo é como as bibliotecas combinam entre si o empréstimo de um livro que só a outra tem.',
          'A biblioteca pode mudar o combinado com as outras sem mudar nada no balcão. Com camadas é igual: troca-se o protocolo, o serviço continua.',
        ],
        visual: { tipo: 'camadas', camadas: ['camada de cima (usa o serviço)', 'interface: as primitivas', 'camada que oferece o serviço', 'protocolo com a camada par do outro lado'], rotulo: 'serviço é vertical, protocolo é horizontal' },
      },
    ],
    checagem: {
      pergunta: 'A videochamada da escola trava toda vez que um pacote se perde e é retransmitido. Que serviço ela deveria usar?',
      opcoes: ['Não confiável: melhor perder um pedacinho da imagem do que congelar esperando', 'Fluxo de bytes confiável, com mais retransmissão', 'Datagrama com confirmação de cada quadro', 'Solicitação e resposta'],
      certa: 0,
      explicacao: 'Para voz e vídeo ao vivo, atraso é pior que perda. Um pedaço retransmitido chega tarde demais para ser útil.',
    },
  },
  desafio: {
    carta: [
      'A câmara municipal quer mandar a ata da sessão para o servidor da prefeitura. O PC da câmara acabou de ser formatado e está sem endereço nenhum.',
      'O vereador da oposição duvida: "vinte pings, zero perda, senão eu não acredito em internet".',
      'Objetivo: a câmara (use 192.0.2.70/24) pingando o servidor com 20 pedidos e zero perda, e as duas perguntas respondidas.',
    ],
    dicas: [
      'Sem endereço, a câmara não manda nem carta.',
      'Configure o IP da câmara e faça um ping de 20 pedidos até 192.0.2.2.',
      'Quando o pedido de conexão chega, o servidor aceita. E o ping nunca pediu conexão nenhuma.',
    ],
    perguntas: d37,
    montar: () => {
      const m = novoMundo(1537);
      adicionar(m, pc('camara', { modelo: 'PC da câmara municipal, recém-formatado' }));
      adicionar(m, comutador('sw-galpao', { modelo: 'Switch do rack do galpão SG-8' }));
      adicionar(m, pc('servidor-pref', { modelo: 'Servidor da prefeitura, com Pinguix', ttl: 64, ip: ip('192.0.2.2/24') }));
      ligar(m, { equip: 'camara', porta: 'eth0' }, { equip: 'sw-galpao', porta: 'p4' }, 'cat6', 85, { id: 'c1' });
      ligar(m, { equip: 'sw-galpao', porta: 'p8' }, { equip: 'servidor-pref', porta: 'eth0' }, 'cat6', 3, { id: 'c2' });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => [
      pingOk(m, 'camara', '192.0.2.2', 20, 0),
      ...todasRespondidas(m, d37),
    ],
    solucao: [
      ['equip', 'camara', 'ip', { ip: '192.0.2.70/24' }],
      ['equip', 'camara', 'ping', { destino: '192.0.2.2', n: '20' }],
    ],
    respostas: { '1': 'ACCEPT', '2': '0' },
  },
};

/* ======================================================================
 * ref 38: Os modelos e as críticas (1.6.3 a 1.6.5)
 * ====================================================================== */

const p38: Pergunta[] = [
  numerica('1', 'No modelo híbrido de cinco camadas, qual o número da camada do IPv4?', 3, 0),
  numerica('2', 'Quantas camadas o modelo OSI tem a mais que o modelo híbrido?', 2, 0),
];

/** Perguntas do desafio. */
const d38: Pergunta[] = [
  numerica('1', 'Em que camada do modelo de cinco camadas estava o defeito?', 1, 0),
  numerica('2', 'E em que camada desse modelo trabalha o switch?', 2, 0),
];

const dia38: Dia = {
  numero: 38,
  ato: 0,
  titulo: 'Os modelos e as críticas',
  chamado: [
    'CHAMADO #0010',
    'A bibliotecária achou no porão dois cartazes velhos: um com sete camadas, outro com quatro. Pendurou os dois na parede e colou um post-it entre eles: "qual dos dois está certo? Os alunos estão brigando".',
    'Nenhum dos dois, e os dois. O galpão usa um terceiro.',
    'Objetivo: ping do terminal da biblioteca até o acervo, captura do quadro e as duas perguntas sobre os modelos respondidas.',
  ],
  manual: {
    titulo: 'OSI, TCP/IP e o modelo de cinco camadas',
    texto: [
      'O modelo OSI tem sete camadas e separa com cuidado três ideias: serviço (o que a camada oferece), interface (como se pede) e protocolo (como se faz). Mas não pegou na prática. Chegou tarde, quando o TCP/IP já rodava nas universidades. As camadas ficaram desequilibradas: sessão e apresentação quase vazias, enlace e rede abarrotadas. As primeiras implementações eram pesadas e lentas. E ganhou fama de padrão imposto por governos e companhias telefônicas.',
      'O modelo TCP/IP tem o problema oposto: os protocolos vieram primeiro e o modelo depois, como descrição. Ele não separa serviço, interface e protocolo; só descreve a própria pilha e não serve para outras; a camada de baixo (acesso à rede) é mais uma interface do que uma camada, e nem distingue física de enlace; e vários protocolos foram feitos às pressas e ficaram cheios de remendos.',
      'Por isso se usa um modelo híbrido, de cinco camadas: física, enlace, rede, transporte e aplicação. Do OSI vem a separação clara entre física e enlace e o vocabulário. Do TCP/IP vêm os protocolos que existem de verdade. É o modelo que este jogo segue, um ato por camada.',
    ],
  },
  dicas: [
    'Gere tráfego antes de capturar.',
    'Ping do terminal para 192.0.2.81, depois "capturar" no acervo.',
    'Física 1, enlace 2, rede 3. Sete menos cinco.',
  ],
  perguntas: p38,
  montar: () => {
    const m = novoMundo(138);
    adicionar(m, pc('terminal', { modelo: 'Terminal de consulta da biblioteca', ttl: 64, ip: ip('192.0.2.80/24') }));
    adicionar(m, comutador('hub', { tipo: 'hub', modelo: 'Hub de 100 Mb/s, doado pela escola', velocidades: [10, 100], portas: 4 }));
    adicionar(m, comutador('sw-biblio', { modelo: 'Switch da biblioteca SG-8' }));
    adicionar(m, pc('acervo', { modelo: 'Servidor do acervo, com Pinguix', ttl: 64, ip: ip('192.0.2.81/24') }));
    ligar(m, { equip: 'terminal', porta: 'eth0' }, { equip: 'hub', porta: 'p1' }, 'cat5e', 8, { id: 'c1' });
    ligar(m, { equip: 'hub', porta: 'p4' }, { equip: 'sw-biblio', porta: 'p1' }, 'cat5e', 2, { id: 'c2' });
    ligar(m, { equip: 'sw-biblio', porta: 'p8' }, { equip: 'acervo', porta: 'eth0' }, 'cat6', 4, { id: 'c3' });
    m.proxCabo = 4;
    return m;
  },
  objetivo: (m) => [pingOk(m, 'terminal', '192.0.2.81'), ...todasRespondidas(m, p38)],
  posMorte: [
    'O quadro que você capturou atravessou um hub (camada 1, só repete bits), um switch (camada 2, lê o MAC) e chegou ao acervo com Ethernet, IPv4 e ICMP. Cada pedaço tem lugar certo nas cinco camadas do modelo híbrido.',
    'Os dois cartazes da parede estavam certos pela metade. O de sete camadas tem a separação boa de ideias e camadas que quase ninguém usa. O de quatro tem os protocolos de verdade e uma camada de baixo que mistura cabo com quadro.',
    'A briga dos alunos, aliás, é antiga: o OSI venceu nos livros e o TCP/IP venceu nos cabos.',
  ],
  passos: [
    passo({ alvo: ['equip', 'terminal'], acao: 'ping', valores: { destino: '192.0.2.81', n: '4' }, instrucao: 'Do terminal, mande um ping para o acervo.', porque: 'O caminho passa por um hub e por um switch. Cada um trabalha numa camada diferente.', conferir: pingou('terminal', '192.0.2.81'), feito: 'Respostas de volta. O pedido atravessou dois aparelhos de camadas diferentes sem que nenhum deles soubesse o que é ping.' }),
    passo({ alvo: ['equip', 'acervo'], acao: 'capturar', instrucao: 'No acervo, veja o último quadro que chegou.', porque: 'A captura mostra os cabeçalhos. Agora a pergunta é em que camada cada um mora.', conferir: capturou, feito: 'Ethernet, IPv4 e ICMP, de fora para dentro.' }),
    passo({
      escolha: {
        opcoes: ['Numa camada só, de acesso à rede, que o modelo quase não descreve', 'Em duas camadas bem separadas, física e enlace', 'Na camada internet, junto com o IPv4', 'Na camada de aplicação'],
        certa: 0,
        errada: {
          1: 'Essa separação é justamente o que o modelo TCP/IP não faz. É o OSI (e o modelo híbrido) que separa física de enlace.',
          2: 'A camada internet do TCP/IP é a do IP. O Ethernet fica embaixo dela.',
          3: 'Aplicação é o topo, onde mora o programa. Cabo e quadro são o porão.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'No modelo TCP/IP original, onde ficam o cabeçalho Ethernet e o sinal no cabo?',
      porque: 'O modelo TCP/IP tem quatro camadas: aplicação, transporte, internet e acesso à rede.',
      feito: 'Tudo junto na camada de acesso à rede, que é mais uma interface do que uma camada. É uma das críticas ao modelo.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '3' }, instrucao: 'No modelo híbrido, qual o número da camada do IPv4?', porque: 'Conte de baixo para cima: física, enlace, rede, transporte, aplicação.', feito: 'Camada 3, a de rede. Física é 1, enlace (o Ethernet) é 2.' }),
    passo({ pergunta: '2', exemplo: { resposta: '2' }, instrucao: 'Quantas camadas o OSI tem a mais que o modelo híbrido?', porque: 'O OSI tem sete. O híbrido tirou duas que quase nenhuma pilha real implementa separadas.', feito: 'Duas: sessão e apresentação. No mundo real, o que elas fariam ficou dentro da aplicação.' }),
    passo({
      escolha: {
        opcoes: ['Chegou tarde, com camadas desequilibradas, implementações pesadas e fama de imposição de governo', 'Tinha camadas de menos', 'Foi proibido por lei', 'Copiava o TCP/IP sem melhorar nada'],
        certa: 0,
        errada: {
          1: 'Pelo contrário: duas das sete camadas ficaram quase vazias.',
          2: 'Ninguém proibiu. Houve até governos que exigiam o OSI nas compras públicas, e mesmo assim ele não pegou.',
          3: 'O OSI foi pensado separado, e a separação entre serviço, interface e protocolo é melhor que a do TCP/IP. O problema foi outro.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o OSI, tão organizado, não pegou na prática?',
      porque: 'São quatro críticas: momento, tecnologia, implementação e política.',
      feito: 'Momento ruim, tecnologia desequilibrada, implementações ruins e política. Ficou como ótimo modelo para estudar e conversar.',
    }),
    passo({ alvo: ['equip', 'hub'], acao: 'mostra', instrucao: 'Veja as portas do hub.', porque: 'O hub é o aparelho mais simples do caminho. Veja o que ele sabe sobre o tráfego.', feito: 'Só portas, velocidade e contadores. O hub repete bits para todas as portas sem ler endereço nenhum: camada 1 pura.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Por que o OSI não pegou',
        texto: ['O modelo é bom. O que deu errado foi o resto.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Crítica', 'O que aconteceu'],
          linhas: [
            ['momento ruim', 'os padrões saíram quando o TCP/IP já rodava nas universidades'],
            ['tecnologia ruim', 'sessão e apresentação quase vazias; enlace e rede lotadas; controle de erro repetido em várias camadas'],
            ['implementações ruins', 'as primeiras eram enormes e lentas, e a fama ficou'],
            ['política', 'parecia imposição de governos e companhias telefônicas'],
          ],
        },
      },
      {
        titulo: 'Por que o TCP/IP também apanha',
        texto: ['Os protocolos vieram antes do modelo, e o modelo saiu como descrição deles.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Crítica', 'Na prática'],
          linhas: [
            ['não separa serviço, interface e protocolo', 'difícil trocar uma peça sem mexer na vizinha'],
            ['não é genérico', 'só descreve a própria pilha'],
            ['a camada de baixo não é camada', 'acesso à rede é uma interface, e mistura física com enlace'],
            ['protocolos com remendos', 'feitos às pressas, consertados depois de já estarem em uso'],
          ],
        },
      },
      {
        titulo: 'Sete, quatro e cinco',
        texto: ['O modelo híbrido junta a organização do OSI com os protocolos do TCP/IP.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['OSI (7)', 'TCP/IP (4)', 'Híbrido (5)'],
          linhas: [
            ['aplicação, apresentação, sessão', 'aplicação', '5 aplicação'],
            ['transporte', 'transporte', '4 transporte'],
            ['rede', 'internet', '3 rede'],
            ['enlace', 'acesso à rede', '2 enlace'],
            ['física', '(não descreve)', '1 física'],
          ],
        },
      },
      {
        titulo: 'O mapa do jogo',
        texto: ['Cada ato de Fim de Linha é uma camada do modelo híbrido, de baixo para cima. Depois vem a segurança, que atravessa todas.'],
        visual: { tipo: 'camadas', camadas: ['5 aplicação: o show no estádio (ato 6)', '4 transporte: a conversa no hospital (ato 5)', '3 rede: a cidade inteira (ato 4)', '2 enlace: a linha e o bairro (atos 2 e 3)', '1 física: a rua (ato 1)'], rotulo: 'modelo híbrido, de cima para baixo' },
      },
    ],
    checagem: {
      pergunta: 'Qual destas é uma crítica ao modelo TCP/IP, e não ao OSI?',
      opcoes: ['A camada de baixo mistura física com enlace e é mais interface que camada', 'Sessão e apresentação ficaram quase vazias', 'Chegou tarde demais', 'Tinha fama de padrão imposto por governos'],
      certa: 0,
      explicacao: 'As outras três são críticas ao OSI. O TCP/IP nem chega a separar física de enlace, e é por isso que o modelo híbrido as separa.',
    },
  },
  desafio: {
    carta: [
      'Chegou o leitor novo da sala de estudos, um PC moderno que só trabalha a 1 Gb/s. Ligaram no hub velho e nada funciona.',
      'O técnico da cooperativa já culpou o IP, o sistema operacional e a lua. Siga as camadas de baixo para cima.',
      'Objetivo: o leitor pingando o acervo (192.0.2.91) e as duas perguntas respondidas.',
    ],
    dicas: [
      'Comece pela camada 1. O enlace do leitor está ativo?',
      'O hub só vai a 10 Mb/s, e o leitor só a 1000. Não têm velocidade em comum.',
      'Mude a ponta do cabo c1 do hub para uma porta livre do switch e faça o ping.',
    ],
    perguntas: d38,
    montar: () => {
      const m = novoMundo(1538);
      adicionar(m, pc('leitor', { modelo: 'Leitor da sala de estudos, só gigabit', ttl: 64, velocidades: [1000], mdix: true, ip: ip('192.0.2.90/24') }));
      adicionar(m, comutador('hub', { tipo: 'hub', modelo: 'Hub de 10 Mb/s, relíquia do porão', velocidades: [10], portas: 4 }));
      adicionar(m, comutador('sw', { modelo: 'Switch da biblioteca SG-8' }));
      adicionar(m, pc('acervo', { modelo: 'Servidor do acervo, com Pinguix', ttl: 64, ip: ip('192.0.2.91/24') }));
      ligar(m, { equip: 'leitor', porta: 'eth0' }, { equip: 'hub', porta: 'p1' }, 'cat6', 6, { id: 'c1' });
      ligar(m, { equip: 'hub', porta: 'p4' }, { equip: 'sw', porta: 'p1' }, 'cat5e', 2, { id: 'c2' });
      ligar(m, { equip: 'sw', porta: 'p8' }, { equip: 'acervo', porta: 'eth0' }, 'cat6', 4, { id: 'c3' });
      m.proxCabo = 4;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'leitor', '192.0.2.91'), ...todasRespondidas(m, d38)],
    solucao: [
      ['cabo', 'c1', 'detalhes'],
      ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'sw:p2' }],
      ['equip', 'leitor', 'ping', { destino: '192.0.2.91', n: '4' }],
    ],
    respostas: { '1': '1', '2': '2' },
  },
};

/* ======================================================================
 * ref 39: Quem manda nos padrões (1.7)
 * ====================================================================== */

const p39: Pergunta[] = [texto('1', 'Qual o número do grupo do IEEE que padroniza o Wi-Fi? (802.?)', /^(802\.)?11$/)];

/** Perguntas do desafio. */
const d39: Pergunta[] = [texto('1', 'Qual o número do grupo do IEEE que padroniza a Ethernet com fio? (802.?)', /^(802\.)?3$/)];

const dia39: Dia = {
  numero: 39,
  ato: 0,
  titulo: 'Quem manda nos padrões',
  chamado: [
    'CHAMADO #0011',
    'Circular da prefeitura: "fica decidido que a rede municipal usará apenas padrões oficiais". O secretário anexou um post-it: "oficiais de quem? E quem decide o formato do ping?".',
    'Ninguém em Fim de Linha decide. Mas dá para descobrir quem decidiu.',
    'Objetivo: ping da prefeitura até a câmara, captura do quadro e a pergunta sobre os grupos do IEEE respondida.',
  ],
  manual: {
    titulo: 'Padrões de fato, de direito e quem escreve cada um',
    texto: [
      'Padrão de fato é o que pegou porque todo mundo usou, sem ninguém votar. Padrão de direito é o que um órgão de padronização aprovou formalmente. Muito padrão de fato vira de direito depois. Padrão aberto, que qualquer um pode ler e implementar, é o que deixa equipamentos de fabricantes diferentes conversarem; e o código aberto ajuda, porque uma implementação pública vira referência para as outras.',
      'No mundo das telecomunicações manda a ITU (União Internacional de Telecomunicações), órgão da ONU com braços para padrões de telefonia e dados (ITU-T), rádio e satélite (ITU-R) e desenvolvimento (ITU-D). Os membros são governos, empresas e universidades.',
      'Nos padrões internacionais em geral está a ISO, formada pelos órgãos nacionais de cada país (no Brasil, a ABNT). Para redes locais, quem escreve é o comitê 802 do IEEE, a associação dos engenheiros eletricistas: o 802.3 é a Ethernet com fio, o 802.11 é o Wi-Fi.',
      'Na internet, os protocolos saem da IETF, a força-tarefa de engenharia da internet, aberta a quem quiser participar, sob a supervisão de arquitetura do IAB. Cada documento é um RFC (pedido de comentários). Uma proposta começa como rascunho, vira padrão proposto quando há consenso aproximado e código funcionando, e padrão da internet quando já tem uso amplo. Os padrões da web, como CSS e as regras de acessibilidade, ficam com o W3C, o consórcio da web.',
    ],
  },
  dicas: [
    'Primeiro gere tráfego e capture. Depois pergunte quem escreveu cada cabeçalho.',
    'Ping da prefeitura para 192.0.2.101 e "capturar" na câmara.',
    'Ethernet com fio é 802.3. O Wi-Fi é o grupo 11.',
  ],
  perguntas: p39,
  montar: () => {
    const m = novoMundo(139);
    adicionar(m, pc('prefeitura', { modelo: 'PC do gabinete da prefeitura, com JanelOS', ttl: 128, ip: ip('192.0.2.100/24') }));
    adicionar(m, comutador('sw-centro', { modelo: 'Switch do centro SG-8' }));
    adicionar(m, pc('camara', { modelo: 'PC da câmara municipal, com Pinguix', ttl: 64, ip: ip('192.0.2.101/24') }));
    ligar(m, { equip: 'prefeitura', porta: 'eth0' }, { equip: 'sw-centro', porta: 'p1' }, 'cat6', 30, { id: 'c1' });
    ligar(m, { equip: 'sw-centro', porta: 'p2' }, { equip: 'camara', porta: 'eth0' }, 'cat6', 45, { id: 'c2' });
    m.proxCabo = 3;
    return m;
  },
  objetivo: (m) => [pingOk(m, 'prefeitura', '192.0.2.101'), ...todasRespondidas(m, p39)],
  posMorte: [
    'Cada cabeçalho que você viu tem dono. O quadro Ethernet e o formato do MAC são do comitê 802 do IEEE. O IPv4 e o ICMP estão em RFCs da IETF, escritos no começo dos anos 80 e usados até hoje. O cabo de cobre segue normas de cabeamento aprovadas por órgãos nacionais e pela ISO.',
    'Nenhum deles é lei. São acordos. A prefeitura pode exigir padrão aberto na compra, e é isso que garante que o switch de um fabricante fale com o PC de outro.',
    'O MAC dos aparelhos do jogo começa com 02: endereço administrado localmente, fora dos blocos que o IEEE distribui aos fabricantes. Até para inventar endereço existe padrão.',
  ],
  passos: [
    passo({ alvo: ['equip', 'prefeitura'], acao: 'mostra', instrucao: 'Veja a placa de rede da prefeitura.', porque: 'O endereço MAC tem formato definido pelo IEEE: 48 bits, em seis bytes.', feito: 'Seis bytes, começando com 02: o bit que diz "endereço administrado localmente" está ligado. Os fabricantes compram blocos de endereços do IEEE; este não é de nenhum deles.' }),
    passo({ alvo: ['equip', 'prefeitura'], acao: 'ping', valores: { destino: '192.0.2.101', n: '4' }, instrucao: 'Mande um ping da prefeitura para a câmara.', porque: 'Para ver os padrões em ação, é preciso um quadro de verdade no fio.', conferir: pingou('prefeitura', '192.0.2.101'), feito: 'PC JanelOS falando com PC Pinguix, por um switch de um terceiro fabricante. Isso só funciona porque os três seguem o mesmo padrão.' }),
    passo({ alvo: ['equip', 'camara'], acao: 'capturar', instrucao: 'Na câmara, veja o quadro que chegou.', porque: 'Cada linha da captura é um cabeçalho, e cada cabeçalho foi escrito por um órgão diferente.', conferir: capturou, feito: 'Ethernet com EtherType 0x0800, IPv4 com protocolo 1, ICMP tipo 8.' }),
    passo({
      escolha: {
        opcoes: ['IEEE, no padrão 802.3', 'IETF, num RFC', 'ITU, no setor de telecomunicações', 'W3C, o consórcio da web'],
        certa: 0,
        errada: {
          1: 'A IETF escreve os protocolos da camada de rede para cima, como o IPv4. O quadro Ethernet vem de outro lugar.',
          2: 'A ITU cuida de telefonia, rádio e satélite. Rede local com fio não é com ela.',
          3: 'O W3C cuida da web, lá em cima na camada de aplicação.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Quem padronizou o quadro Ethernet que você capturou?',
      porque: 'Rede local é assunto do comitê 802.',
      feito: 'IEEE 802.3. O comitê 802 tem um grupo para cada tipo de rede local.',
    }),
    passo({
      escolha: {
        opcoes: ['A IETF, num RFC', 'O IEEE, no 802.11', 'A ISO, no modelo OSI', 'O fabricante do PC'],
        certa: 0,
        errada: {
          1: 'O 802.11 é o Wi-Fi, uma camada de enlace. O IPv4 roda por cima dele e de qualquer outro enlace.',
          2: 'O OSI tinha protocolos próprios de rede, que não pegaram. O IPv4 não é deles.',
          3: 'Se cada fabricante inventasse o próprio IP, o JanelOS não falaria com o Pinguix.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'E o cabeçalho IPv4, quem escreveu?',
      porque: 'Os protocolos da internet saem de um grupo aberto, em documentos numerados.',
      feito: 'A IETF. Qualquer pessoa pode ler o RFC do IPv4 de graça e implementar.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '11' }, instrucao: 'Qual o número do grupo do IEEE que padroniza o Wi-Fi?', porque: 'A Ethernet com fio é o 802.3. O Wi-Fi é outro grupo do mesmo comitê.', feito: '802.11. Quando a praça ganhar Wi-Fi, no ato 3, é esse o padrão.' }),
    passo({
      escolha: {
        opcoes: ['De fato: pegou pelo uso, sem ninguém votar', 'De direito: foi aprovado por um órgão de padronização', 'Aberto: qualquer um pode ler e implementar', 'Proibido: formato fechado não pode ser padrão'],
        certa: 0,
        errada: {
          1: 'Ninguém votou nem aprovou nada. Foi o uso que impôs.',
          2: 'O formato é fechado: só o fabricante sabe como funciona por dentro.',
          3: 'Pode, sim. Muito padrão de fato começou fechado.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O formato de documento do editor de texto Escrivão Plus virou o que todo mundo na prefeitura usa, só porque todo mundo usa. Que tipo de padrão é esse?',
      porque: 'A diferença entre de fato e de direito é quem decidiu: o uso ou um órgão.',
      feito: 'De fato. Se um dia um órgão aprovar esse formato, ele vira também de direito.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'De fato e de direito',
        texto: [
          'Padrão de fato pega pelo uso. Padrão de direito é aprovado por um órgão. Padrão aberto qualquer um pode ler e implementar, e é ele que deixa a prefeitura comprar switch de um fabricante e PC de outro.',
          'Código aberto ajuda: uma implementação pública vira a referência que os outros testam contra.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tipo', 'Quem decidiu', 'Exemplo'],
          linhas: [
            ['de fato', 'o uso', 'o formato de documento que toda a prefeitura usa'],
            ['de direito', 'um órgão de padronização', 'Ethernet 802.3'],
            ['aberto', 'qualquer um pode implementar', 'IPv4, num RFC grátis'],
          ],
        },
      },
      {
        titulo: 'Os órgãos e o que cada um escreve',
        texto: ['Cada camada tem a sua turma. Nenhuma é fabricante.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Órgão', 'Quem é', 'Escreve'],
          linhas: [
            ['ITU', 'agência da ONU para telecomunicações', 'telefonia, rádio, satélite (ITU-T, ITU-R)'],
            ['ISO', 'federação dos órgãos nacionais (no Brasil, a ABNT)', 'padrões internacionais em geral, o modelo OSI'],
            ['IEEE 802', 'comitê da associação de engenheiros eletricistas', '802.3 Ethernet, 802.11 Wi-Fi'],
            ['IETF', 'força-tarefa aberta, supervisionada pelo IAB', 'IP, TCP, os RFCs'],
            ['W3C', 'consórcio da web', 'CSS, acessibilidade na web'],
          ],
        },
      },
      {
        titulo: 'Um quadro, três donos',
        texto: ['O ping que você capturou junta padrões de órgãos diferentes, cada um na sua camada.'],
        visual: { tipo: 'camadas', camadas: ['ICMP: RFC da IETF', 'IPv4: RFC da IETF', 'Ethernet: IEEE 802.3', 'cabo de cobre: norma de cabeamento (ISO e órgãos nacionais)'], rotulo: 'quem escreveu cada envelope' },
      },
      {
        titulo: 'Como um RFC vira padrão',
        texto: ['Na IETF não se vota: busca-se consenso aproximado e código funcionando. Quem quiser pode mandar um rascunho.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r', rotulo: 'rascunho', x: 80, y: 120 },
            { id: 'p', rotulo: 'padrão proposto (RFC)', x: 300, y: 120 },
            { id: 'i', rotulo: 'padrão da internet', x: 520, y: 120 },
          ],
          ligacoes: [
            ['r', 'p', 'consenso e implementação'],
            ['p', 'i', 'uso amplo e maduro'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'A cooperativa quer saber qual padrão seguir para o Wi-Fi do armazém. Onde ela procura?',
      opcoes: ['No IEEE 802.11', 'Num RFC da IETF', 'No W3C', 'Na ITU'],
      certa: 0,
      explicacao: 'Wi-Fi é rede local sem fio, assunto do comitê 802 do IEEE, grupo 11. A IETF entra da camada de rede para cima.',
    },
  },
  desafio: {
    carta: [
      'A cooperativa ganhou numa rifa um switch TurboNet X, "tecnologia exclusiva TurboEthernet a 777 Mb/s". Ligou os dois PCs do escritório nele, e nenhum dos dois acende.',
      'O manual do TurboNet diz que ele só conversa com outros aparelhos TurboNet. Há um switch comum, de padrão aberto, no mesmo rack.',
      'Objetivo: coop-a pingando coop-b (192.0.2.111) e a pergunta sobre o padrão da Ethernet respondida.',
    ],
    dicas: [
      'Veja os detalhes dos cabos: o motivo de estarem fora está lá.',
      'Nenhuma placa de rede padrão fala 777 Mb/s. As velocidades da Ethernet são 10, 100 e 1000 Mb/s.',
      'Mude a ponta b dos cabos c1 e c2 para o switch padrão e faça o ping.',
    ],
    perguntas: d39,
    montar: () => {
      const m = novoMundo(1539);
      adicionar(m, pc('coop-a', { modelo: 'PC do escritório da cooperativa, com Pinguix', ttl: 64, ip: ip('192.0.2.110/24') }));
      adicionar(m, pc('coop-b', { modelo: 'PC do armazém da cooperativa, com JanelOS', ttl: 128, ip: ip('192.0.2.111/24') }));
      adicionar(m, aparelho('turbonet', 'switch', 'Switch TurboNet X, TurboEthernet proprietária a 777 Mb/s', [{ nome: 'p1', velocidades: [777] }, { nome: 'p2', velocidades: [777] }, { nome: 'p3', velocidades: [777] }, { nome: 'p4', velocidades: [777] }]));
      adicionar(m, comutador('sw-padrao', { modelo: 'Switch comum SG-8, Ethernet 802.3' }));
      ligar(m, { equip: 'coop-a', porta: 'eth0' }, { equip: 'turbonet', porta: 'p1' }, 'cat6', 12, { id: 'c1' });
      ligar(m, { equip: 'coop-b', porta: 'eth0' }, { equip: 'turbonet', porta: 'p2' }, 'cat6', 18, { id: 'c2' });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'coop-a', '192.0.2.111'), ...todasRespondidas(m, d39)],
    solucao: [
      ['cabo', 'c1', 'detalhes'],
      ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'sw-padrao:p1' }],
      ['cabo', 'c2', 'mover', { ponta: 'b', destino: 'sw-padrao:p2' }],
      ['equip', 'coop-a', 'ping', { destino: '192.0.2.111', n: '4' }],
    ],
    respostas: { '1': '802.3' },
  },
};

/* ======================================================================
 * ref 40: Neutralidade da rede (1.8.1 e 1.8.2)
 * ====================================================================== */

const vazaoTv = (m: Mundo) => {
  const v = vazao(m, 'casa', 'tv-comunitaria');
  return typeof v === 'string' ? -1 : v.mbps;
};

const p40: Pergunta[] = [numerica('1', 'Quantos Mb/s úteis a casa mede agora até a TV comunitária? (duas casas decimais)', vazaoTv, 0.05)];

const portaDaTv = (m: Mundo) => {
  const c = m.cabos.get('c3')!;
  return c.a.equip === 'tv-comunitaria' ? c.b : c.a;
};

/** Perguntas do desafio. */
const d40: Pergunta[] = [texto('1', 'Que prática o modelador fazia com a Lojinha: bloqueio, estrangulamento, priorização paga ou zero-rating?', /^bloqueio$/i)];

const dia40: Dia = {
  numero: 40,
  ato: 0,
  titulo: 'Neutralidade da rede',
  chamado: [
    'CHAMADO #0012',
    'Carta da associação de moradores: "a transmissão da sessão da câmara pela TV comunitária trava toda noite, mas o VídeoJá, aquele dos filmes, roda liso. Vocês estão escolhendo o que a gente assiste?".',
    'No rack tem um "modelador de tráfego" que o provedor anterior instalou, com um post-it: "contrato de parceria, NÃO MEXER". Você mexe.',
    'Objetivo: a TV comunitária fora da porta estrangulada e a vazão medida e anotada.',
  ],
  manual: {
    titulo: 'Discurso on-line e neutralidade da rede',
    texto: [
      'Quem hospeda conteúdo de outras pessoas (rede social, fórum, o mural da escola na internet) decide o que tirar do ar: isso é moderação. De um lado, quem quer mais remoção, contra golpe, ódio e mentira. Do outro, quem teme censura e plataformas decidindo o que pode ser dito. No Brasil, o Marco Civil da Internet (Lei 12.965, de 2014) dizia que a plataforma só responde pelo conteúdo de terceiros se desobedecer uma ordem judicial de remoção, com exceções como a divulgação de nudez sem consentimento. Em 2025 o Supremo Tribunal Federal ampliou os casos em que ela responde sem ordem judicial, e o equilíbrio continua em debate.',
      'Neutralidade da rede é a regra de que o provedor trata todos os pacotes de forma igual, sem olhar quem mandou, para quem vai ou o que tem dentro. O Marco Civil adota essa regra no Brasil.',
      'O que a neutralidade proíbe: bloqueio (impedir o acesso a um serviço legal), estrangulamento (deixar um serviço de propósito mais lento) e priorização paga (uma via expressa para quem pagou ao provedor). O zero-rating, quando o tráfego de um aplicativo não conta na franquia, fica na zona cinzenta: tem quem veja como acesso grátis para quem tem pouco e quem veja como vantagem injusta para os grandes. No Brasil, a prática foi analisada pelas autoridades de concorrência e não foi proibida.',
      'Há exceções técnicas legítimas: gerenciar congestionamento sem escolher vencedor, bloquear ataques e spam, e priorizar serviços de emergência. Os defensores da neutralidade dizem que ela protege a concorrência e a liberdade de escolha; os críticos dizem que impede o provedor de investir e de cobrar por qualidade. Os dois lados concordam numa coisa: a regra precisa ser clara.',
    ],
  },
  dicas: [
    'Meça antes de acusar.',
    'Veja as portas do modelador: a TV comunitária e o VídeoJá estão em portas de velocidades diferentes.',
    'Mude a ponta do cabo c3 que está no modelador da porta "comum" para a porta "p3" e meça de novo.',
  ],
  perguntas: p40,
  montar: () => {
    const m = novoMundo(140);
    adicionar(m, pc('casa', { modelo: 'PC da associação de moradores', ttl: 64, velocidades: [10, 100], mdix: true, ip: ip('192.0.2.130/24') }));
    adicionar(
      m,
      aparelho('modelador', 'switch', 'Modelador de tráfego do provedor anterior', [
        { nome: 'clientes', velocidades: [10, 100, 1000], mdi: 'mdix' },
        { nome: 'expressa', velocidades: [10, 100, 1000], mdi: 'mdix' },
        { nome: 'comum', velocidades: [10], mdi: 'mdix' },
        { nome: 'p3', velocidades: [10, 100, 1000], mdi: 'mdix' },
      ]),
    );
    adicionar(m, pc('videoja', { modelo: 'Servidor de cache do VídeoJá, parceiro pago', ttl: 64, mdix: true, ip: ip('192.0.2.140/24') }));
    adicionar(m, pc('tv-comunitaria', { modelo: 'Servidor da TV comunitária de Fim de Linha', ttl: 64, mdix: true, ip: ip('192.0.2.141/24') }));
    ligar(m, { equip: 'casa', porta: 'eth0' }, { equip: 'modelador', porta: 'clientes' }, 'cat6', 50, { id: 'c1' });
    ligar(m, { equip: 'videoja', porta: 'eth0' }, { equip: 'modelador', porta: 'expressa' }, 'cat6', 2, { id: 'c2', nota: 'etiqueta: "parceria"' });
    ligar(m, { equip: 'tv-comunitaria', porta: 'eth0' }, { equip: 'modelador', porta: 'comum' }, 'cat6', 2, { id: 'c3', nota: 'etiqueta: "não pagante"' });
    m.proxCabo = 4;
    m.flags.servidorTeste = 'tv-comunitaria';
    return m;
  },
  objetivo: (m) => {
    const p = portaDaTv(m);
    const v = m.flags.ultimaVazao as number | undefined;
    return [
      item('TV comunitária fora da porta estrangulada', !(p.equip === 'modelador' && p.porta === 'comum'), `${p.equip}:${p.porta}`),
      item('vazão até a TV comunitária medida acima de 90 Mb/s', v !== undefined && v > 90, v === undefined ? 'ainda não medida' : `${v.toFixed(2)} Mb/s`),
      ...todasRespondidas(m, p40),
    ];
  },
  posMorte: [
    'O modelador fazia duas coisas que a neutralidade proíbe ao mesmo tempo: dava via expressa ao VídeoJá, que pagava a parceria, e estrangulava a TV comunitária numa porta de 10 Mb/s, onde não passavam nem 9,49 Mb/s úteis. Na mesma porta que todo mundo usa, a TV passa a entregar 94,93 Mb/s, o máximo que a placa da casa aguenta.',
    'Repare que você não mexeu no VídeoJá. Neutralidade não é deixar todo mundo lento: é não escolher vencedor pelo conteúdo ou por quem pagou.',
    'A sessão da câmara de ontem à noite, aliás, discutia justamente o contrato com o provedor anterior.',
  ],
  passos: [
    passo({ alvo: ['equip', 'casa'], acao: 'vazao', instrucao: 'Da casa, meça a vazão até a TV comunitária.', porque: 'Antes de acusar alguém de estrangular tráfego, meça. Pode ser só o cabo.', conferir: (m) => (m.flags.ultimaVazao !== undefined ? true : 'A medição não aconteceu.'), feito: 'Menos de 10 Mb/s, numa casa com placa de 100. Algo no caminho está segurando.' }),
    passo({ alvo: ['equip', 'modelador'], acao: 'mostra', instrucao: 'Veja as portas do modelador de tráfego.', porque: 'Compare a porta da TV comunitária com a do VídeoJá.', feito: 'O VídeoJá está na porta "expressa", a 1000 Mb/s. A TV comunitária está na porta "comum", limitada a 10 Mb/s.' }),
    passo({
      escolha: {
        opcoes: ['Priorização paga para o VídeoJá e estrangulamento da TV comunitária', 'Bloqueio da TV comunitária', 'Zero-rating do VídeoJá', 'Gerência legítima de congestionamento'],
        certa: 0,
        errada: {
          1: 'A TV comunitária ainda chega, só que devagar. Bloqueio seria não chegar.',
          2: 'Zero-rating é não descontar da franquia. Aqui ninguém está contando franquia: é velocidade.',
          3: 'Gerência legítima trataria todo mundo igual na hora do aperto. Aqui a regra é por quem pagou, a qualquer hora.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O que o modelador está fazendo?',
      porque: 'Veja as etiquetas dos cabos: "parceria" e "não pagante".',
      feito: 'Via expressa para quem pagou, via estreita para o resto. É exatamente o que a regra de neutralidade proíbe.',
    }),
    passo({ alvo: ['cabo', 'c3'], acao: 'mover', valores: { ponta: 'b', destino: 'modelador:p3' }, instrucao: 'Passe a TV comunitária para a porta comum de verdade, a p3.', porque: 'A porta p3 é igual à do VídeoJá. Ninguém ganha via expressa: todo mundo anda na mesma pista.', conferir: (m) => !(portaDaTv(m).porta === 'comum') || 'A TV continua na porta estrangulada.', feito: 'Cabo da TV na p3, ativo a 1000 Mb/s.' }),
    passo({ alvo: ['equip', 'casa'], acao: 'vazao', instrucao: 'Meça de novo.', porque: 'Agora o gargalo do caminho deve ser a placa da própria casa.', conferir: (m) => ((m.flags.ultimaVazao ?? 0) > 90 ? true : 'A vazão continua baixa.'), feito: 'Perto de 95 Mb/s: o máximo da placa de 100 Mb/s da casa, descontados os cabeçalhos.' }),
    passo({ pergunta: '1', exemplo: { resposta: '94.93' }, instrucao: 'Quantos Mb/s úteis a casa mede agora?', porque: 'O resultado da medição sai em Mb/s, MB/s e MiB/s. Use o primeiro.', feito: '94,93 Mb/s. Antes eram 9,49: dez vezes menos, de propósito.' }),
    passo({
      escolha: {
        opcoes: ['Dar prioridade às chamadas de emergência e gerenciar congestionamento igual para todos', 'Deixar mais lento um site concorrente do parceiro', 'Cobrar de um serviço de vídeo para ele andar mais rápido', 'Bloquear um aplicativo de mensagens legal'],
        certa: 0,
        errada: {
          1: 'Isso é estrangulamento: escolher perdedor pelo conteúdo.',
          2: 'Isso é priorização paga, o que o modelador fazia.',
          3: 'Isso é bloqueio de serviço legal, o caso mais grave.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual destas práticas a neutralidade permite?',
      porque: 'As exceções são técnicas: segurança da rede, congestionamento tratado sem escolher vencedor e emergência.',
      feito: 'Emergência e congestionamento sem favoritos. O que a regra barra é escolher quem anda rápido por quem pagou ou pelo que é.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quem responde pelo que é dito',
        texto: [
          'O mural da escola na internet aceita comentários. Se alguém posta uma calúnia, de quem é a culpa: de quem escreveu ou da escola, que hospedou?',
          'Mais moderação protege contra golpe, ódio e mentira; menos moderação protege contra censura e contra plataformas decidindo o que pode ser dito. No Brasil, o Marco Civil (2014) exigia ordem judicial para a plataforma responder, com exceções; em 2025 o Supremo ampliou os casos sem ordem judicial. O debate segue.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mais moderação', 'Menos moderação'],
          linhas: [
            ['tira golpe e ódio do ar mais rápido', 'evita remover o que é só opinião incômoda'],
            ['protege quem é atacado', 'protege quem critica quem tem poder'],
            ['põe peso na plataforma', 'põe peso na Justiça e em quem escreveu'],
          ],
        },
      },
      {
        titulo: 'O que a neutralidade proíbe',
        texto: ['O provedor carrega pacotes. A neutralidade diz que ele não escolhe quais andam rápido pelo conteúdo, pela origem ou por quem pagou.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Prática', 'Em Fim de Linha', 'Neutralidade'],
          linhas: [
            ['bloqueio', 'o aplicativo de mensagens não abre', 'proíbe'],
            ['estrangulamento', 'a TV comunitária limitada a 10 Mb/s', 'proíbe'],
            ['priorização paga', 'via expressa para o VídeoJá, que pagou', 'proíbe'],
            ['zero-rating', 'o VídeoJá não conta na franquia', 'zona cinzenta'],
          ],
        },
      },
      {
        titulo: 'Via expressa e via estreita',
        texto: ['No rack do galpão, o modelador fazia a escolha pela porta. Medido da casa, a diferença é de dez vezes: 9,49 contra 94,93 Mb/s.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'casa', rotulo: 'casa (placa de 100 Mb/s)', x: 90, y: 120 },
            { id: 'mod', rotulo: 'modelador', x: 300, y: 120 },
            { id: 'v', rotulo: 'VídeoJá (pagou)', x: 520, y: 40 },
            { id: 't', rotulo: 'TV comunitária', x: 520, y: 200 },
          ],
          ligacoes: [
            ['casa', 'mod', '100 Mb/s'],
            ['mod', 'v', 'expressa, 1000 Mb/s'],
            ['mod', 't', 'comum, 10 Mb/s'],
          ],
        },
      },
      {
        titulo: 'As exceções e os dois lados',
        texto: [
          'Permitido: gerenciar congestionamento sem escolher vencedor, barrar ataques e spam, priorizar serviços de emergência.',
          'A favor da neutralidade: protege a concorrência, a TV pequena e a escolha de quem usa. Contra: pode desestimular investimento e impedir planos mais baratos com menos coisa. Os dois lados querem regra clara.',
        ],
        visual: { tipo: 'camadas', camadas: ['permitido: emergência primeiro', 'permitido: congestionamento igual para todos', 'permitido: barrar ataque e spam', 'proibido: escolher vencedor pelo conteúdo ou por quem pagou'], rotulo: 'o que o provedor pode fazer com os pacotes' },
      },
    ],
    checagem: {
      pergunta: 'Na hora do jogo da seleção, o enlace da cidade lota e o provedor reduz um pouco a velocidade de todo mundo, igual. Isso fere a neutralidade?',
      opcoes: ['Não: é gerência de congestionamento sem escolher vencedor', 'Sim: é estrangulamento', 'Sim: é bloqueio', 'Sim: é priorização paga'],
      certa: 0,
      explicacao: 'O que a neutralidade barra é a escolha por conteúdo, origem ou pagamento. Reduzir todos por igual no aperto é exceção técnica legítima.',
    },
  },
  desafio: {
    carta: [
      'Novo bilhete da associação: "a Lojinha da Feira, a loja virtual dos produtores da cooperativa, não abre de jeito nenhum. Já o MegaMercado, que tem parceria com o provedor anterior, abre na hora".',
      'O mesmo modelador está no rack. O cabo da Lojinha foi parar numa porta chamada "descarte".',
      'Objetivo: a casa pingando a Lojinha (192.0.2.151) e a pergunta respondida.',
    ],
    dicas: [
      'Veja as portas do modelador e os detalhes do cabo da Lojinha.',
      'A porta "descarte" não liga com nada. Há uma porta normal livre.',
      'Mude a ponta do cabo c3 no modelador para a porta p3, faça o ping e responda "bloqueio".',
    ],
    perguntas: d40,
    montar: () => {
      const m = novoMundo(1540);
      adicionar(m, pc('casa', { modelo: 'PC da associação de moradores', ttl: 64, ip: ip('192.0.2.130/24') }));
      adicionar(
        m,
        aparelho('modelador', 'switch', 'Modelador de tráfego do provedor anterior', [
          { nome: 'clientes', velocidades: [10, 100, 1000], mdi: 'mdix' },
          { nome: 'expressa', velocidades: [10, 100, 1000], mdi: 'mdix' },
          { nome: 'descarte', velocidades: [], mdi: 'mdix' },
          { nome: 'p3', velocidades: [10, 100, 1000], mdi: 'mdix' },
        ]),
      );
      adicionar(m, pc('megamercado', { modelo: 'Servidor do MegaMercado, parceiro pago', ttl: 64, mdix: true, ip: ip('192.0.2.150/24') }));
      adicionar(m, pc('lojinha', { modelo: 'Servidor da Lojinha da Feira', ttl: 64, mdix: true, ip: ip('192.0.2.151/24') }));
      ligar(m, { equip: 'casa', porta: 'eth0' }, { equip: 'modelador', porta: 'clientes' }, 'cat6', 50, { id: 'c1' });
      ligar(m, { equip: 'megamercado', porta: 'eth0' }, { equip: 'modelador', porta: 'expressa' }, 'cat6', 2, { id: 'c2', nota: 'etiqueta: "parceria"' });
      ligar(m, { equip: 'lojinha', porta: 'eth0' }, { equip: 'modelador', porta: 'descarte' }, 'cat6', 2, { id: 'c3', nota: 'etiqueta: "concorrente"' });
      m.proxCabo = 4;
      return m;
    },
    objetivo: (m) => [pingOk(m, 'casa', '192.0.2.151'), ...todasRespondidas(m, d40)],
    solucao: [
      ['equip', 'modelador', 'mostra'],
      ['cabo', 'c3', 'mover', { ponta: 'b', destino: 'modelador:p3' }],
      ['equip', 'casa', 'ping', { destino: '192.0.2.151', n: '4' }],
    ],
    respostas: { '1': 'bloqueio' },
  },
};

/* ======================================================================
 * ref 41: Segurança, privacidade e desinformação (1.8.3 a 1.8.5)
 * ====================================================================== */

const p41: Pergunta[] = [texto('1', 'No quadro capturado, qual o endereço IP de destino que qualquer equipamento do caminho consegue ler?', /^192\.0\.2\.121$/)];

/** Perguntas do desafio. */
const d41: Pergunta[] = [texto('1', 'Como se chama a rede de aparelhos invadidos controlados por uma só pessoa para atacar juntos?', /^(botnet|rede (de )?zumbis?)$/i)];

const dia41: Dia = {
  numero: 41,
  ato: 0,
  titulo: 'Segurança, privacidade e desinformação',
  chamado: [
    'CHAMADO #0013',
    'Três envelopes no mesmo dia. A Defesa Civil: "a câmera nova da praça apareceu numa lista de aparelhos invadidos". O posto de saúde: "o provedor consegue ver quem marca consulta com a psicóloga?". E a rádio: "tem um áudio dizendo que a represa vai romper hoje, a cidade está em pânico".',
    'Um de cada vez.',
    'Objetivo: trocar a senha de fábrica da câmera da praça sem perder a configuração, capturar um ping da casa até o posto e dizer o que o provedor vê.',
  ],
  manual: {
    titulo: 'Segurança, privacidade e desinformação',
    texto: [
      'Segurança de rede é questão social. Num ataque de negação de serviço (DoS), alguém inunda um servidor de tráfego até ele não atender mais ninguém; quando o tráfego vem de milhares de aparelhos ao mesmo tempo, é distribuído (DDoS). Esses aparelhos costumam ser câmeras, roteadores e outros objetos da internet das coisas invadidos com a senha de fábrica e reunidos numa botnet, uma rede de zumbis controlada por uma pessoa só. Já o phishing não ataca a máquina: engana a pessoa com uma mensagem falsa que pede senha ou clique.',
      'Privacidade: sites e aplicativos coletam dados de quem usa, e os cookies e rastreadores de terceiros seguem a pessoa de site em site. Mesmo com o conteúdo cifrado, sobram os metadados: quem falou com quem, quando, quanto e de onde. O provedor de acesso vê os endereços de todos os pacotes. No Brasil, o Marco Civil obriga o provedor de conexão a guardar os registros de conexão (data, hora e IP) por um ano, e proíbe que ele guarde os registros de acesso a aplicações. A LGPD (Lei 13.709, de 2018) exige base legal para tratar dados pessoais, dá direitos a quem é dono dos dados e trata dado de saúde como sensível.',
      'Desinformação é conteúdo falso ou enganoso espalhado como se fosse verdade, de propósito ou não. Ela corre porque mexe com medo e raiva, porque chega por gente de confiança e porque as redes sociais ordenam o que mostrar pelo engajamento: o que dá mais reação aparece mais. Checar é perguntar quem disse, onde mais saiu, de quando é e o que a fonte oficial diz, antes de repassar. Há quem defenda que as plataformas reduzam o alcance do falso e há quem tema que isso vire controle do que se pode dizer.',
    ],
  },
  dicas: [
    'A câmera ainda aceita a senha que veio na caixa. Troque e grave.',
    'Na câmera: "Trocar a senha" e depois "Salvar". Depois, ping da casa para 192.0.2.121 e "capturar" no posto.',
    'O destino que todo mundo do caminho lê é o IP do posto: 192.0.2.121.',
  ],
  perguntas: p41,
  montar: () => {
    const m = novoMundo(141);
    adicionar(m, pc('casa', { modelo: 'PC de uma casa da Rua das Acácias', ttl: 64, ip: ip('192.0.2.120/24') }));
    adicionar(m, comutador('sw-bairro', { modelo: 'Switch do bairro SG-8' }));
    adicionar(m, pc('posto', { modelo: 'PC do posto de saúde, agenda de consultas', ttl: 128, ip: ip('192.0.2.121/24') }));
    adicionar(m, camera('cam-praca', 'Câmera IP OlhoBom C-1, recém-instalada', 'praca'));
    ligar(m, { equip: 'casa', porta: 'eth0' }, { equip: 'sw-bairro', porta: 'p1' }, 'cat6', 40, { id: 'c1' });
    ligar(m, { equip: 'sw-bairro', porta: 'p2' }, { equip: 'posto', porta: 'eth0' }, 'cat6', 55, { id: 'c2' });
    ligar(m, { equip: 'sw-bairro', porta: 'p8' }, { equip: 'cam-praca', porta: 'eth0' }, 'cat6', 30, { id: 'c3' });
    m.proxCabo = 4;
    return m;
  },
  objetivo: (m) => [senhaTrocada(m, 'cam-praca'), configInteira(m, 'cam-praca'), pingOk(m, 'casa', '192.0.2.121'), ...todasRespondidas(m, p41)],
  posMorte: [
    'A câmera da praça tinha a mesma senha de milhares de câmeras iguais, e o acesso remoto ligado. Quem monta botnet só precisa varrer a internet tentando "admin". Com a senha trocada e gravada, ela deixa de ser recruta.',
    'A captura mostrou o que qualquer equipamento do caminho lê: MAC, IP de origem, IP de destino, tamanho e horário. Mesmo com o conteúdo cifrado, saber que uma casa fala com o posto às 19 h toda terça já conta muita coisa. Por isso o provedor guarda só o que a lei manda, pelo tempo que a lei manda, e mais nada.',
    'O áudio da represa era de outra cidade, de três anos atrás. A Defesa Civil desmentiu em uma hora; o áudio levou dois dias para parar de circular. Desmentido anda mais devagar que boato.',
  ],
  passos: [
    passo({ alvo: ['equip', 'cam-praca'], acao: 'mostra-config', instrucao: 'Veja a configuração da câmera da praça.', porque: 'Antes de mexer, saiba o que ela faz e o que não pode se perder.', feito: 'Usuário admin, acesso remoto ligado e gravação contínua. E a senha é a que veio impressa na caixa: igual em todas as câmeras do modelo.' }),
    passo({ alvo: ['equip', 'cam-praca'], acao: 'senha', pedir: ['senha'], exemplo: { senha: 'Praca!Segura2026' }, instrucao: 'Troque a senha da câmera.', porque: 'Botnets de câmeras e outros aparelhos se formam tentando a senha de fábrica em tudo que responde na internet. Uma senha própria tira a câmera da lista.', conferir: (m) => m.equipamentos.get('cam-praca')!.s.senhaRunning !== 'admin' || 'A senha continua a de fábrica. Use 8 ou mais caracteres.', feito: 'Senha nova na memória. Ainda falta gravar.' }),
    passo({ alvo: ['equip', 'cam-praca'], acao: 'salvar', instrucao: 'Grave a configuração.', porque: 'A senha nova está só na memória. Se a câmera reiniciar com a queda de luz de sempre, volta a ser "admin".', conferir: (m) => m.equipamentos.get('cam-praca')!.s.senha !== 'admin' || 'A senha gravada ainda é a de fábrica.', feito: 'Gravada, com a configuração inteira. A câmera continua filmando a praça, agora só para quem deve.' }),
    passo({ alvo: ['equip', 'casa'], acao: 'ping', valores: { destino: '192.0.2.121', n: '4' }, instrucao: 'Da casa, mande um ping para o posto de saúde.', porque: 'Vamos ver o que um equipamento no meio do caminho, como o do provedor, consegue ler de uma conversa entre os dois.', conferir: pingou('casa', '192.0.2.121'), feito: 'Pedidos e respostas. Cada um passou pelo switch do bairro, que é do provedor.' }),
    passo({ alvo: ['equip', 'posto'], acao: 'capturar', instrucao: 'No posto, veja o quadro que chegou.', porque: 'É o que qualquer equipamento do caminho vê, mesmo quando o conteúdo vai cifrado.', conferir: capturou, feito: 'MAC e IP de origem e de destino, tamanho e tipo. Isso são metadados: dizem quem falou com quem, mesmo sem dizer o quê.' }),
    passo({ pergunta: '1', exemplo: { resposta: '192.0.2.121' }, instrucao: 'Qual IP de destino qualquer equipamento do caminho consegue ler?', porque: 'Olhe a linha IPv4 da captura. Endereço não pode ir cifrado: sem ele, o pacote não chega.', feito: '192.0.2.121, o posto de saúde. Cifrar protege o conteúdo; o endereço continua à mostra.' }),
    passo({
      escolha: {
        opcoes: ['O endereço do remetente é fibra-fimdelinha-suporte.exemplo, parecido mas diferente do verdadeiro, e a mensagem pede a senha com urgência', 'A mensagem tem o logotipo do provedor', 'A mensagem foi enviada de manhã', 'A mensagem está escrita sem erros de português'],
        certa: 0,
        errada: {
          1: 'Logotipo se copia em segundos. Ele não prova nada.',
          2: 'Horário não diz nada sobre quem mandou.',
          3: 'Golpe bem escrito existe, e cada vez mais. Falta de erro não é garantia.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Chegou um e-mail: "sua conta será bloqueada hoje, confirme sua senha neste link". Qual é o sinal mais forte de phishing?',
      porque: 'Phishing engana pela pressa e pela aparência. O que denuncia é o que não dá para falsificar direito: o endereço real e o pedido de segredo.',
      feito: 'Domínio parecido com o verdadeiro mais urgência mais pedido de senha. Provedor sério nunca pede senha por e-mail.',
    }),
    passo({
      escolha: {
        opcoes: ['Procurar o aviso na fonte oficial, a Defesa Civil, antes de repassar', 'Repassar para os grupos da família, por precaução', 'Acreditar, porque foi um vizinho de confiança que mandou', 'Responder no grupo que é mentira, sem conferir'],
        certa: 0,
        errada: {
          1: 'Repassar "por precaução" é exatamente como o boato se espalha.',
          2: 'Desinformação corre justamente por gente de confiança, que também foi enganada.',
          3: 'Desmentir sem conferir é a mesma pressa com o sinal trocado. E se fosse verdade?',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Chega o áudio: "a represa vai romper hoje, saiam de casa". O que fazer primeiro?',
      porque: 'Checar é perguntar quem disse, de quando é, onde mais saiu e o que a fonte oficial diz.',
      feito: 'Fonte oficial primeiro. A Defesa Civil confirmou: o áudio era de outra cidade, de três anos atrás.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Botnet de câmera',
        texto: [
          'Num ataque de negação de serviço, alguém inunda um servidor até ele parar de atender. Quando o tráfego vem de milhares de aparelhos, é distribuído (DDoS).',
          'Os soldados são câmeras, roteadores e outros aparelhos da internet das coisas invadidos com a senha de fábrica e reunidos numa botnet.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'ctl', rotulo: 'quem controla', x: 90, y: 120 },
            { id: 'c1', rotulo: 'câmera (admin)', x: 300, y: 30 },
            { id: 'c2', rotulo: 'roteador (admin)', x: 300, y: 120 },
            { id: 'c3', rotulo: 'babá eletrônica (admin)', x: 300, y: 210 },
            { id: 'alvo', rotulo: 'site do hospital', x: 520, y: 120 },
          ],
          ligacoes: [
            ['ctl', 'c1', 'ordem'],
            ['ctl', 'c2', 'ordem'],
            ['ctl', 'c3', 'ordem'],
            ['c1', 'alvo', 'inundação'],
            ['c2', 'alvo', 'inundação'],
            ['c3', 'alvo', 'inundação'],
          ],
        },
      },
      {
        titulo: 'Phishing engana gente, não máquina',
        texto: ['A mensagem imita alguém de confiança, cria urgência e pede senha ou clique. A defesa é desconfiar do pedido, não do logotipo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Sinal', 'Por quê'],
          linhas: [
            ['domínio parecido, mas diferente', 'fibra-fimdelinha-suporte.exemplo não é o do provedor'],
            ['urgência', '"sua conta será bloqueada hoje" corta o tempo de pensar'],
            ['pede senha ou código', 'quem é sério nunca pede por mensagem'],
          ],
        },
      },
      {
        titulo: 'O que o provedor vê',
        texto: [
          'Mesmo com o conteúdo cifrado, o caminho lê os metadados: quem falou com quem, quando e quanto. O Marco Civil manda o provedor de conexão guardar data, hora e IP por um ano, e proíbe que ele guarde os sites acessados. A LGPD exige base legal para tratar dados pessoais e trata dado de saúde como sensível.',
          'Cookies e rastreadores de terceiros seguem a pessoa de site em site: há quem veja propaganda útil e grátis, há quem veja vigilância.',
        ],
        visual: { tipo: 'camadas', camadas: ['conteúdo: pode ir cifrado', 'IPv4: origem e destino à mostra', 'Ethernet: MACs à mostra', 'horário e tamanho: sempre à mostra'], rotulo: 'um pacote visto do caminho' },
      },
      {
        titulo: 'Por que o boato corre',
        texto: [
          'Mexe com medo e raiva, chega por gente de confiança e é empurrado pelo engajamento: a rede social mostra mais o que dá mais reação.',
          'Checar antes de repassar: quem disse, de quando é, onde mais saiu, o que a fonte oficial diz. Há quem defenda que as plataformas reduzam o alcance do falso e quem tema que isso vire controle do discurso.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'áudio falso', x: 80, y: 120 },
            { id: 'g', rotulo: 'grupo da família', x: 300, y: 40 },
            { id: 'r', rotulo: 'rede social', x: 300, y: 200 },
            { id: 'c', rotulo: 'a cidade inteira', x: 520, y: 120 },
          ],
          ligacoes: [
            ['a', 'g', 'confiança'],
            ['a', 'r', 'engajamento'],
            ['g', 'c', 'repasse'],
            ['r', 'c', 'algoritmo'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O posto de saúde passou a cifrar a agenda de consultas. O que o provedor ainda consegue saber?',
      opcoes: ['Que uma casa conversou com o posto, quando e quanto', 'O nome da especialidade marcada', 'O texto inteiro da consulta', 'Nada: cifrar esconde tudo'],
      certa: 0,
      explicacao: 'Cifrar protege o conteúdo, mas os endereços e o horário precisam ficar à mostra para o pacote chegar. Esses metadados continuam visíveis no caminho.',
    },
  },
  desafio: {
    carta: [
      'A lista de aparelhos invadidos tem mais dois nomes de Fim de Linha: a câmera da entrada da escola e a do estacionamento do hospital. As duas com a senha que veio na caixa.',
      'As duas precisam continuar gravando. Não pode perder nenhuma linha de configuração.',
      'Objetivo: as duas câmeras com senha nova gravada, a configuração inteira, e a pergunta respondida.',
    ],
    dicas: [
      'É o mesmo conserto da câmera da praça, duas vezes.',
      'Em cada câmera: "Trocar a senha" e depois "Salvar".',
      'Rede de aparelhos invadidos sob o comando de uma pessoa só tem nome próprio: botnet.',
    ],
    perguntas: d41,
    montar: () => {
      const m = novoMundo(1541);
      adicionar(m, comutador('sw-bairro', { modelo: 'Switch do bairro SG-8' }));
      adicionar(m, camera('cam-escola', 'Câmera IP OlhoBom C-1 da entrada da escola', 'escola'));
      adicionar(m, camera('cam-hospital', 'Câmera IP OlhoBom C-1 do estacionamento do hospital', 'hospital'));
      ligar(m, { equip: 'sw-bairro', porta: 'p1' }, { equip: 'cam-escola', porta: 'eth0' }, 'cat6', 60, { id: 'c1' });
      ligar(m, { equip: 'sw-bairro', porta: 'p2' }, { equip: 'cam-hospital', porta: 'eth0' }, 'cat6', 75, { id: 'c2' });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => [
      senhaTrocada(m, 'cam-escola'),
      configInteira(m, 'cam-escola'),
      senhaTrocada(m, 'cam-hospital'),
      configInteira(m, 'cam-hospital'),
      ...todasRespondidas(m, d41),
    ],
    solucao: [
      ['equip', 'cam-escola', 'senha', { senha: 'Escola!Cam2026' }],
      ['equip', 'cam-escola', 'salvar'],
      ['equip', 'cam-hospital', 'senha', { senha: 'Hospital!Cam2026' }],
      ['equip', 'cam-hospital', 'salvar'],
    ],
    respostas: { '1': 'botnet' },
  },
};

export const ATO0B: Dia[] = [dia36, dia37, dia38, dia39, dia40, dia41];
