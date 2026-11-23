// Dias do ato 3 (O Bairro), com prática guiada, aula e desafio no próprio dia.
// Os dois últimos dias do ato, no bairro Leste: quem é de qual camada (4.7.4) e VLANs (4.7.5).

import { adicionar, caboNaPorta, comutador, ligar, novoMundo, pc, type Mundo } from '../motor/mundo';
import { caminho, tabelaMac } from '../motor/rede';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

/** O MAC de um equipamento está na tabela do switch? */
function aprendeu(m: Mundo, sw: string, quem: string): boolean {
  const e = m.equipamentos.get(sw)!;
  return m.equipamentos.get(quem)!.mac in tabelaMac(e);
}

/** O aparelho do outro lado do cabo ligado na eth0 de um PC. */
function vizinho(m: Mundo, quem: string): string | undefined {
  const c = caboNaPorta(m, { equip: quem, porta: 'eth0' });
  if (!c) return undefined;
  return c.a.equip === quem ? c.b.equip : c.a.equip;
}

function porta(m: Mundo, equip: string, nome: string) {
  return m.equipamentos.get(equip)!.portas.find((p) => p.nome === nome)!;
}

/** Ping feito e sem nenhuma resposta: o isolamento foi visto de perto. */
const pingFalhou = (m: Mundo, de: string, ip: string) => {
  const r = registroPing(m, de, ip);
  return !!r && r.recebidos === 0;
};

/* ======================================================================
 * ref 75: Quem é de qual camada (4.7.4)
 * ====================================================================== */

const IP75 = { pc1: '192.0.2.11', pc2: '192.0.2.12', pc3: '192.0.2.21', pc4: '192.0.2.22', pc5: '192.0.2.23' };

/** Aceita "MAC", "o MAC", "endereço MAC de destino" e parecidos. */
const RE_MAC = /^(o\s+)?(endere[cç]o\s+)?mac(\s+de\s+destino)?$/i;

const d75: Pergunta[] = [texto('1', 'Que endereço o switch lê para escolher a porta de saída de um quadro: MAC ou IP?', RE_MAC)];
const d75D: Pergunta[] = [texto('1', 'Que endereço o switch lê para mandar o quadro só para a porta certa: MAC ou IP?', RE_MAC)];

const dia75: Dia = {
  numero: 75,
  ato: 3,
  titulo: 'Quem é de qual camada',
  chamado: [
    'CHAMADO #0075',
    'O centro comunitário do bairro Leste herdou duas caixinhas de rede iguaizinhas por fora: uma é um hub velho, a outra um switch novo. O zelador ligou dois PCs em uma e três na outra e jura que "tanto faz, é tudo a mesma coisa com luzinha".',
    'Antes de o bairro inteiro depender delas, alguém precisa mostrar o que cada caixinha enxerga de um quadro, e por que não é tudo a mesma coisa.',
    'Objetivo: ping entre os dois PCs do hub, ping entre o pc-3 e o pc-4 no switch, o switch com os dois endereços aprendidos e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Repetidor, hub, bridge, switch, roteador e gateway',
    texto: [
      'Muitos aparelhos de rede têm a mesma cara: uma caixa com portas e LEDs. O que separa um do outro é até que camada ele lê o que passa por ele. Quanto mais alto, mais ele entende e mais ele decide.',
      'Repetidor e hub são da camada física. Não entendem quadro nenhum: recebem um sinal, regeneram e mandam os bits adiante. O repetidor liga dois trechos de cabo para ir mais longe; o hub é um repetidor com várias portas, que repete cada bit para todas as outras. Todo mundo ligado num hub ouve tudo e colide com todo mundo: o hub inteiro é um domínio de colisão só.',
      'Bridge e switch são da camada de enlace. Leem o cabeçalho do quadro, olham o endereço MAC de destino e mandam o quadro só para a porta onde aquele endereço mora. Para saber onde mora, aprendem com o MAC de origem de cada quadro que chega. Destino desconhecido, ou broadcast, é inundado para todas as portas. Switch é o nome moderno da bridge com muitas portas, em que cada porta é seu próprio domínio de colisão.',
      'O roteador é da camada de rede. Ele tira o quadro do envelope Ethernet, lê o pacote de dentro, olha o endereço IP de destino e escolhe a saída numa tabela de rotas. Por isso consegue ligar redes diferentes, até de tecnologias diferentes, coisa que o switch não faz. O roteador é assunto do ato 4.',
      'Acima disso ficam os gateways. O de transporte liga duas conversas de transporte diferentes, recebendo de um lado e repassando do outro com outro protocolo. O de aplicação entende o conteúdo da conversa e traduz de um formato para outro, como transformar um e-mail numa mensagem de texto no celular. Gateway, aqui, é tradutor, não só passador de quadro.',
    ],
  },
  dicas: [
    'Faça os dois pings primeiro: um do lado do hub, outro do lado do switch.',
    'Depois olhe a tabela de endereços MAC de cada caixinha e compare.',
    'Ping do pc-1 para 192.0.2.12, ping do pc-3 para 192.0.2.22 e "Ver a tabela de endereços MAC" no sw-novo.',
  ],
  montar: () => {
    const m = novoMundo(375);
    adicionar(m, comutador('hub-velho', { tipo: 'hub', portas: 4, velocidades: [10], modelo: 'Hub RepeteTudo 10 (4 portas, 10 Mb/s)' }));
    adicionar(m, comutador('sw-novo', { portas: 8, modelo: 'Switch Decorador 8 (8 portas, 1 Gb/s)' }));
    adicionar(m, pc('pc-1', { ip: cidr(`${IP75.pc1}/24`) }));
    adicionar(m, pc('pc-2', { ip: cidr(`${IP75.pc2}/24`) }));
    adicionar(m, pc('pc-3', { ip: cidr(`${IP75.pc3}/24`) }));
    adicionar(m, pc('pc-4', { ip: cidr(`${IP75.pc4}/24`) }));
    adicionar(m, pc('pc-5', { ip: cidr(`${IP75.pc5}/24`) }));
    ligar(m, { equip: 'pc-1', porta: 'eth0' }, { equip: 'hub-velho', porta: 'p1' }, 'cat5e', 5);
    ligar(m, { equip: 'pc-2', porta: 'eth0' }, { equip: 'hub-velho', porta: 'p2' }, 'cat5e', 5);
    ligar(m, { equip: 'pc-3', porta: 'eth0' }, { equip: 'sw-novo', porta: 'p1' }, 'cat6', 5);
    ligar(m, { equip: 'pc-4', porta: 'eth0' }, { equip: 'sw-novo', porta: 'p2' }, 'cat6', 5);
    ligar(m, { equip: 'pc-5', porta: 'eth0' }, { equip: 'sw-novo', porta: 'p3' }, 'cat6', 5);
    return m;
  },
  objetivo: (m) => [
    pingOk(m, 'pc-1', IP75.pc2),
    pingOk(m, 'pc-3', IP75.pc4),
    item('sw-novo aprendeu onde moram o pc-3 e o pc-4', aprendeu(m, 'sw-novo', 'pc-3') && aprendeu(m, 'sw-novo', 'pc-4'), `${Object.keys(tabelaMac(m.equipamentos.get('sw-novo')!)).length} endereços na tabela`),
    ...todasRespondidas(m, d75),
  ],
  posMorte: [
    'No hub, o ping do pc-1 chegou ao pc-2, mas cada bit dele também saiu pelas outras portas, ligadas ou não. O hub não tem tabela porque não tem o que guardar: ele não lê endereço nenhum. Com mais gente ligada, todo mundo ouviria tudo e colidiria com todo mundo, e qualquer um com um capturador leria a conversa alheia.',
    'No switch, o primeiro quadro foi o pedido de ARP, em broadcast: esse foi para todas as portas, e o pc-5 ouviu. Mas o switch anotou de que porta ele veio, e a resposta anotou a outra ponta. Daí em diante, os pedidos de eco foram só da p1 para a p2. O pc-5 não viu nenhum. Aprender é isso: inundar uma vez, decorar e parar de gritar.',
    'O quadro capturado mostra a pilha inteira: o switch parou no cabeçalho Ethernet; um roteador abriria o IPv4 e leria o destino; um gateway de aplicação abriria até a conversa. Mesma caixa com luzinha, cabeças muito diferentes.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'pc-1'],
      acao: 'ping',
      valores: { destino: IP75.pc2, n: '4' },
      instrucao: 'Do pc-1, faça ping no pc-2, os dois ligados no hub.',
      porque: 'O hub é da camada física: recebe os bits por uma porta e repete para todas as outras. O ping chega ao pc-2 porque chega a todo mundo.',
      conferir: (m) => pingOk(m, 'pc-1', IP75.pc2).ok || 'O ping no pc-2 não voltou.',
      feito: 'Chegou. Só que a porta p3 e a p4 do hub também receberam cada bit, mesmo sem ninguém do outro lado para ouvir.',
    }),
    passo({
      alvo: ['equip', 'hub-velho'],
      acao: 'mac-tabela',
      instrucao: 'Peça ao hub a tabela de endereços MAC.',
      porque: 'Um switch guarda de que porta veio cada endereço. Se o hub soubesse, poderia mandar o quadro só para o destino.',
      feito: 'Não tem tabela. O hub nunca leu um endereço na vida: ele não sabe onde o quadro começa, só que há bits chegando.',
    }),
    passo({
      alvo: ['equip', 'pc-3'],
      acao: 'ping',
      valores: { destino: IP75.pc4, n: '4' },
      instrucao: 'Agora do pc-3, faça ping no pc-4, os dois no switch.',
      porque: 'O switch é da camada de enlace. Antes do ping, o pc-3 pergunta em broadcast quem tem o IP do pc-4 (ARP); o switch inunda esse pedido e aproveita para anotar de onde ele veio.',
      conferir: (m) => pingOk(m, 'pc-3', IP75.pc4).ok || 'O ping no pc-4 não voltou.',
      feito: 'Chegou também. Por fora, igual ao hub. Por dentro, bem diferente.',
    }),
    passo({
      alvo: ['equip', 'sw-novo'],
      acao: 'mac-tabela',
      instrucao: 'Veja a tabela de endereços MAC do switch.',
      porque: 'O switch aprende com o MAC de origem de cada quadro que entra: "esse endereço mora atrás desta porta". Com o destino na tabela, ele manda o quadro só para lá.',
      conferir: (m) => (aprendeu(m, 'sw-novo', 'pc-3') && aprendeu(m, 'sw-novo', 'pc-4') ? true : 'O switch ainda não aprendeu os dois endereços. Faça o ping do pc-3 para o pc-4.'),
      feito: 'Dois endereços: o do pc-3 na p1 e o do pc-4 na p2. O pc-5 não aparece porque não falou nada ainda. Ele ouviu o broadcast do ARP, mas nenhum dos pedidos de eco.',
    }),
    passo({
      alvo: ['equip', 'pc-4'],
      acao: 'capturar',
      instrucao: 'No pc-4, abra o último quadro capturado.',
      porque: 'A captura mostra o quadro camada por camada: o cabeçalho Ethernet com os MACs, o pacote IPv4 com os IPs e a mensagem ICMP do ping. Cada aparelho para de ler numa dessas linhas.',
      feito: 'Três cabeçalhos, um dentro do outro. Repetidor e hub não leem nenhum; switch lê o primeiro; roteador abre até o segundo.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: 'MAC' },
      instrucao: 'Desse quadro, que endereço o switch lê para escolher a porta de saída: MAC ou IP?',
      porque: 'O switch trabalha na camada de enlace. Ele lê a primeira linha da captura, a do Ethernet, e não abre o pacote de dentro.',
      feito: 'MAC de destino. O IP está logo ali dentro, mas é assunto do roteador.',
    }),
    passo({
      escolha: {
        opcoes: ['Um gateway de aplicação', 'Um roteador', 'Um switch', 'Um repetidor'],
        certa: 0,
        errada: {
          1: 'O roteador lê o IP e escolhe o caminho, mas entrega o pacote do jeito que recebeu. Não muda a mensagem de formato.',
          2: 'O switch nem abre o pacote: lê o MAC de destino e escolhe a porta. Do e-mail, ele não sabe nada.',
          3: 'O repetidor só regenera bits. Ele não sabe nem onde o quadro começa, quanto mais o que é um e-mail.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A associação de moradores quer que cada aviso por e-mail chegue como mensagem de texto no celular de quem não usa e-mail. Que aparelho faz essa tradução?',
      porque: 'Traduzir um e-mail em mensagem de texto exige entender o conteúdo: quem mandou, para quem, o assunto. Isso é a camada de aplicação.',
      feito: 'Gateway de aplicação: ele entende as duas conversas e traduz uma na outra. O gateway de transporte faz parecido um andar abaixo, ligando duas conexões de transporte diferentes.',
    }),
  ],
  perguntas: d75,
  aula: {
    cartoes: [
      {
        titulo: 'Cada caixa numa camada',
        texto: ['Por fora, tudo é caixa com porta e LED. Por dentro, cada aparelho lê o tráfego até uma camada, e só decide com o que leu.'],
        visual: {
          tipo: 'camadas',
          camadas: ['aplicação: gateway de aplicação', 'transporte: gateway de transporte', 'rede: roteador', 'enlace: bridge e switch', 'física: repetidor e hub'],
          rotulo: 'quem trabalha em cada camada, de cima para baixo',
        },
      },
      {
        titulo: 'O que cada um enxerga',
        texto: ['Quanto mais alto o aparelho, mais fundo ele abre o quadro, e mais ele consegue decidir.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Aparelho', 'Camada', 'Lê', 'Faz'],
          linhas: [
            ['repetidor', 'física', 'só o sinal', 'regenera os bits e manda adiante'],
            ['hub', 'física', 'só o sinal', 'repete cada bit para todas as outras portas'],
            ['bridge e switch', 'enlace', 'MAC de destino e de origem', 'aprende onde mora cada MAC e manda só para lá'],
            ['roteador', 'rede', 'IP de destino', 'escolhe a saída pela tabela de rotas, ligando redes diferentes'],
            ['gateway de transporte', 'transporte', 'a conexão', 'liga duas conexões de transporte diferentes'],
            ['gateway de aplicação', 'aplicação', 'a mensagem', 'traduz o conteúdo, como e-mail para mensagem de texto'],
          ],
        },
      },
      {
        titulo: 'Envelope dentro de envelope',
        texto: [
          'O quadro é um envelope Ethernet com um pacote IP dentro, e dentro dele a conversa de transporte e os dados. O switch lê só o envelope de fora. O roteador abre o envelope, lê o pacote e põe num envelope novo para o próximo trecho.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['cabeçalho Ethernet: MAC de destino e de origem (o switch para aqui)', 'cabeçalho IP: IP de origem e de destino (o roteador para aqui)', 'cabeçalho de transporte', 'dados da aplicação (o gateway de aplicação chega aqui)', 'FCS: o CRC do quadro'],
          rotulo: 'um quadro, de fora para dentro',
        },
      },
      {
        titulo: 'Hub grita, switch aprende',
        texto: [
          'No hub, todo quadro vai para todas as portas, sempre. No switch, só o broadcast e o destino desconhecido são inundados; o resto vai direto para a porta certa.',
          'Por isso, no hub, todas as portas dividem um domínio de colisão só. No switch, cada porta tem o seu.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'h', rotulo: 'hub', x: 150, y: 60 },
            { id: 'h1', rotulo: 'pc-1', x: 60, y: 180 },
            { id: 'h2', rotulo: 'pc-2', x: 150, y: 180 },
            { id: 'h3', rotulo: 'porta vazia', x: 240, y: 180 },
            { id: 's', rotulo: 'switch', x: 450, y: 60 },
            { id: 's3', rotulo: 'pc-3', x: 360, y: 180 },
            { id: 's4', rotulo: 'pc-4', x: 450, y: 180 },
            { id: 's5', rotulo: 'pc-5', x: 540, y: 180 },
          ],
          ligacoes: [
            ['h1', 'h', 'quadro'],
            ['h', 'h2', 'cópia'],
            ['h', 'h3', 'cópia'],
            ['s3', 's', 'quadro'],
            ['s', 's4', 'só para cá'],
            ['s', 's5'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um aparelho recebe o quadro, descarta o cabeçalho Ethernet, lê o endereço IP de destino e escolhe por onde mandar. Que aparelho é?',
      opcoes: ['Roteador', 'Switch', 'Hub', 'Repetidor'],
      certa: 0,
      explicacao: 'Quem lê o IP é o roteador, da camada de rede. O switch para no MAC; hub e repetidor nem chegam a ler endereço.',
    },
  },
  desafio: {
    carta: [
      'A cooperativa do bairro Leste ligou o caixa, a diretoria e o PC dos visitantes no mesmo hub, e o hub no switch do servidor. Ontem um visitante comentou, rindo, o valor exato do último pagamento da cooperativa. Ele só tinha aberto um capturador.',
      'O switch tem portas sobrando. O hub, infelizmente, tem ouvidos sobrando.',
      'Objetivo: o caixa e a diretoria ligados direto no switch, os dois pingando o servidor, e a pergunta respondida.',
    ],
    dicas: [
      'Num hub, todo bit sai por todas as portas, inclusive a do visitante. Num switch, o quadro vai só para a porta do destino.',
      'Mude a ponta do cabo do caixa e a da diretoria do hub para portas livres do sw-coop, e faça ping do servidor a partir dos dois.',
      'O switch lê o cabeçalho Ethernet. Que endereço está lá?',
    ],
    perguntas: d75D,
    respostas: { '1': 'MAC' },
    montar: () => {
      const m = novoMundo(3075);
      adicionar(m, comutador('hub-coop', { tipo: 'hub', portas: 4, velocidades: [10], modelo: 'Hub RepeteTudo 10 (4 portas, 10 Mb/s)' }));
      adicionar(m, comutador('sw-coop', { portas: 8, modelo: 'Switch Decorador 8 (8 portas, 1 Gb/s)' }));
      adicionar(m, pc('caixa', { ip: cidr('203.0.113.11/24') }));
      adicionar(m, pc('diretoria', { ip: cidr('203.0.113.12/24') }));
      adicionar(m, pc('pc-visita', { ip: cidr('203.0.113.13/24') }));
      adicionar(m, pc('servidor', { ip: cidr('203.0.113.2/24') }));
      ligar(m, { equip: 'caixa', porta: 'eth0' }, { equip: 'hub-coop', porta: 'p1' }, 'cat5e', 5, { id: 'c1' });
      ligar(m, { equip: 'diretoria', porta: 'eth0' }, { equip: 'hub-coop', porta: 'p2' }, 'cat5e', 5, { id: 'c2' });
      ligar(m, { equip: 'pc-visita', porta: 'eth0' }, { equip: 'hub-coop', porta: 'p3' }, 'cat5e', 5, { id: 'c3' });
      ligar(m, { equip: 'hub-coop', porta: 'p4' }, { equip: 'sw-coop', porta: 'p8' }, 'cat5e', 10, { id: 'c4' });
      ligar(m, { equip: 'servidor', porta: 'eth0' }, { equip: 'sw-coop', porta: 'p1' }, 'cat6', 3, { id: 'c5' });
      m.proxCabo = 6;
      return m;
    },
    objetivo: (m) => [
      item('caixa ligado direto no switch', vizinho(m, 'caixa') === 'sw-coop', `ligado em ${vizinho(m, 'caixa') ?? 'nada'}`),
      item('diretoria ligada direto no switch', vizinho(m, 'diretoria') === 'sw-coop', `ligada em ${vizinho(m, 'diretoria') ?? 'nada'}`),
      pingOk(m, 'caixa', '203.0.113.2'),
      pingOk(m, 'diretoria', '203.0.113.2'),
      ...todasRespondidas(m, d75D),
    ],
    solucao: [
      ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'sw-coop:p2' }],
      ['cabo', 'c2', 'mover', { ponta: 'b', destino: 'sw-coop:p3' }],
      ['equip', 'caixa', 'ping', { destino: '203.0.113.2', n: '4' }],
      ['equip', 'diretoria', 'ping', { destino: '203.0.113.2', n: '4' }],
    ],
  },
};

/* ======================================================================
 * ref 76: VLANs (4.7.5)
 * ====================================================================== */

const IP76 = { lab: '192.0.2.10', secretaria: '192.0.2.20', arquivo: '192.0.2.21' };

const d76D: Pergunta[] = [numerica('1', 'Quantos bits tem o campo VLAN ID da etiqueta 802.1Q?', 12, 0)];

const dia76: Dia = {
  numero: 76,
  ato: 3,
  titulo: 'VLANs',
  chamado: [
    'CHAMADO #0076',
    'A escola do bairro Leste tem um switch só para tudo: o laboratório dos alunos e a secretaria, com boletim, matrícula e a folha de pagamento. Semana passada um aluno achou a pasta de notas compartilhada na rede e corrigiu a própria média para cima. Com capricho, até.',
    'Recabear a escola não cabe no orçamento. O arquivo da secretaria fica no anexo, noutro switch, que um técnico da rede municipal já deixou configurado antes de sair de férias.',
    'Objetivo: o laboratório na VLAN 10, a secretaria na VLAN 20, sem um enxergar o outro, e a secretaria falando com o arquivo do anexo por um tronco.',
  ],
  manual: {
    titulo: 'LANs virtuais',
    texto: [
      'Numa rede com switches, todo mundo ligado neles está na mesma LAN: um broadcast chega a todas as portas, e qualquer um pode tentar falar com qualquer outro. Para separar grupos, o jeito antigo era ter um switch e um cabeamento para cada grupo. A VLAN (LAN virtual) faz isso por configuração: o mesmo switch passa a ser vários switches lógicos, um por VLAN, e mudar alguém de grupo é mudar a porta, não o cabo.',
      'Os motivos são quatro. Segurança: quem está numa VLAN não recebe nem o broadcast da outra. Carga: o tráfego pesado de um grupo não passa pelas portas do outro. Broadcast: cada VLAN tem seu próprio domínio de broadcast, e o barulho de ARP de cem PCs do laboratório não chega à secretaria. E organização: os grupos seguem os departamentos, não o lugar onde a tomada ficou.',
      'Porta de acesso pertence a uma VLAN só, e quem está ligado nela nem sabe que VLAN existe: o quadro entra e sai sem nada de diferente. Porta de tronco liga um switch a outro e carrega várias VLANs no mesmo cabo. Para o outro lado saber de que VLAN é cada quadro, o switch acrescenta uma etiqueta 802.1Q de 4 bytes logo depois dos endereços MAC: 2 bytes de identificador (TPID, sempre 0x8100), 3 bits de prioridade, 1 bit de descarte e 12 bits de VLAN ID. Com 12 bits dá 4096 valores, mas o 0 e o 4095 são reservados: sobram as VLANs de 1 a 4094.',
      'No tronco, uma VLAN pode ir sem etiqueta: é a VLAN nativa, por padrão a 1. Quadro sem etiqueta que chega num tronco é tratado como da nativa. E o tronco só carrega as VLANs da sua lista de permitidas: se a VLAN não está na lista dos dois lados, o quadro dela não atravessa.',
      'O ponto mais importante: VLANs diferentes são redes de enlace diferentes, mesmo dentro do mesmo switch. O switch não passa quadro de uma para a outra, nunca. Se algum dia a secretaria precisar falar com o laboratório, quem faz a ponte é um roteador, e isso é conversa para o ato 4.',
    ],
  },
  dicas: [
    'Comece vendo as VLANs do sw-escola: todas as portas estão na VLAN 1.',
    'Ponha a p1 (laboratório) na VLAN 10 e a p2 (secretaria) na VLAN 20. Depois veja o que o sw-anexo espera na p8.',
    'No sw-escola, faça da p8 um tronco com as VLANs 1,10,20 e pingue o arquivo (192.0.2.21) a partir da secretaria.',
  ],
  montar: () => {
    const m = novoMundo(376);
    adicionar(m, comutador('sw-escola', { portas: 8, modelo: 'Switch Decorador 8G gerenciável (8 portas, 1 Gb/s)' }));
    adicionar(m, comutador('sw-anexo', { portas: 8, modelo: 'Switch Decorador 8G gerenciável (8 portas, 1 Gb/s)' }));
    adicionar(m, pc('lab', { ip: cidr(`${IP76.lab}/24`), modelo: 'PC do laboratório dos alunos' }));
    adicionar(m, pc('secretaria', { ip: cidr(`${IP76.secretaria}/24`), modelo: 'PC da secretaria' }));
    adicionar(m, pc('arquivo', { ip: cidr(`${IP76.arquivo}/24`), modelo: 'Servidor de arquivos da secretaria' }));
    ligar(m, { equip: 'lab', porta: 'eth0' }, { equip: 'sw-escola', porta: 'p1' }, 'cat6', 15);
    ligar(m, { equip: 'secretaria', porta: 'eth0' }, { equip: 'sw-escola', porta: 'p2' }, 'cat6', 20);
    ligar(m, { equip: 'sw-escola', porta: 'p8' }, { equip: 'sw-anexo', porta: 'p8' }, 'cat6', 60);
    ligar(m, { equip: 'arquivo', porta: 'eth0' }, { equip: 'sw-anexo', porta: 'p1' }, 'cat6', 3);
    // O anexo veio pronto: arquivo na VLAN 20 e tronco 1,10,20 para o prédio da escola.
    porta(m, 'sw-anexo', 'p1').vlan = 20;
    porta(m, 'sw-anexo', 'p8').tronco = [1, 10, 20];
    return m;
  },
  objetivo: (m) => {
    const p1 = porta(m, 'sw-escola', 'p1');
    const p2 = porta(m, 'sw-escola', 'p2');
    const p8 = porta(m, 'sw-escola', 'p8');
    return [
      item('laboratório (sw-escola p1) na VLAN 10', !p1.tronco && p1.vlan === 10, p1.tronco ? 'é tronco' : `VLAN ${p1.vlan ?? 1}`),
      item('secretaria (sw-escola p2) na VLAN 20', !p2.tronco && p2.vlan === 20, p2.tronco ? 'é tronco' : `VLAN ${p2.vlan ?? 1}`),
      item('o laboratório não alcança a secretaria', caminho(m, 'lab', 'secretaria') === null, caminho(m, 'lab', 'secretaria') ? 'ainda se enxergam' : 'separados'),
      item('tronco no sw-escola p8 carregando as VLANs 10 e 20', !!p8.tronco && p8.tronco.includes(10) && p8.tronco.includes(20), p8.tronco ? `tronco ${p8.tronco.join(',')}` : `acesso, VLAN ${p8.vlan ?? 1}`),
      pingOk(m, 'secretaria', IP76.arquivo),
    ];
  },
  posMorte: [
    'Antes, a escola era uma LAN só: o ARP do laboratório chegava à secretaria e a pasta de notas estava a um clique de qualquer aluno. Agora são duas LANs virtuais no mesmo switch. O ping do laboratório para a secretaria nem chegou a sair: o pedido de ARP, em broadcast, morreu na fronteira da VLAN 10. Nenhum cabo mudou de lugar.',
    'O sw-anexo já falava 802.1Q na p8 e esperava etiquetas. Enquanto a p8 do sw-escola era porta de acesso, tudo saía de lá sem etiqueta, e o anexo tratava como VLAN 1, a nativa: a secretaria, na 20, não chegava ao arquivo. Com o tronco 1,10,20 nos dois lados, cada quadro da secretaria cruza o cabo com 4 bytes a mais dizendo "VLAN 20", e o anexo entrega na porta certa.',
    'Laboratório e secretaria ainda estão no mesmo bloco de IPs, e mesmo assim não se falam: a VLAN separa na camada de enlace, antes de o IP ter vez. Na vida real, cada VLAN ganha sua própria sub-rede, e um roteador entre elas decide quem pode falar com quem. Com isso, o bairro está aceso de ponta a ponta. Próxima parada: a cidade.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'sw-escola'],
      acao: 'vlan-ver',
      instrucao: 'Veja como estão as VLANs do sw-escola.',
      porque: 'Todo switch gerenciável sai de fábrica com todas as portas na VLAN 1. Uma VLAN só é uma LAN só: o broadcast de qualquer porta chega a todas.',
      feito: 'Tudo na VLAN 1, inclusive a p8, que vai para o anexo. Laboratório e secretaria dividem o mesmo domínio de broadcast.',
    }),
    passo({
      alvo: ['equip', 'sw-escola'],
      acao: 'vlan',
      valores: { porta: 'p1' },
      pedir: ['id'],
      exemplo: { id: '10' },
      instrucao: 'Ponha a porta do laboratório (p1) na VLAN 10.',
      porque: 'A p1 vira porta de acesso da VLAN 10. O PC do laboratório não percebe nada: o quadro dele entra e sai sem etiqueta, como antes. Quem sabe da VLAN é o switch.',
      conferir: (m) => (porta(m, 'sw-escola', 'p1').vlan === 10 ? true : `A p1 ficou na VLAN ${porta(m, 'sw-escola', 'p1').vlan ?? 1}. O chamado pede o laboratório na VLAN 10.`),
      feito: 'Laboratório na VLAN 10.',
    }),
    passo({
      alvo: ['equip', 'sw-escola'],
      acao: 'vlan',
      valores: { porta: 'p2' },
      pedir: ['id'],
      exemplo: { id: '20' },
      instrucao: 'Agora a porta da secretaria (p2) na VLAN 20.',
      porque: 'É a mesma VLAN que o técnico deixou para o arquivo, lá no anexo. VLAN é número: os dois lados precisam combinar o mesmo.',
      conferir: (m) => {
        const v = porta(m, 'sw-escola', 'p2').vlan ?? 1;
        if (v === 10) return 'Na VLAN 10, a secretaria ficaria junto com o laboratório. Era isso que o chamado queria evitar.';
        return v === 20 ? true : `Na VLAN ${v}, a secretaria não encontraria o arquivo, que está na VLAN 20 lá no anexo.`;
      },
      feito: 'Secretaria na VLAN 20. No mesmo switch, agora há dois switches lógicos.',
    }),
    passo({
      alvo: ['equip', 'lab'],
      acao: 'ping',
      valores: { destino: IP76.secretaria, n: '4' },
      instrucao: 'Do laboratório, tente pingar a secretaria.',
      porque: 'Os dois continuam no mesmo switch e no mesmo bloco de IPs. Se a VLAN separa mesmo, este ping tem que falhar.',
      conferir: (m) => (pingFalhou(m, 'lab', IP76.secretaria) ? true : 'O ping passou: laboratório e secretaria ainda estão na mesma VLAN.'),
      feito: 'Nenhuma resposta. O ARP do laboratório ficou preso na VLAN 10, e a secretaria nunca soube que alguém perguntou por ela.',
    }),
    passo({
      escolha: {
        opcoes: ['Um roteador entre a VLAN 10 e a VLAN 20', 'Um tronco entre as duas portas', 'Um hub ligado nas duas portas', 'Nada: basta mudar o IP do laboratório'],
        certa: 0,
        errada: {
          1: 'Tronco leva várias VLANs no mesmo cabo, cada uma com sua etiqueta, mas não mistura uma com a outra. A VLAN 10 continua só na 10.',
          2: 'Um hub entre as duas portas juntaria as VLANs na marra, desfazendo a separação toda. É o contrário do que a escola quer, e ainda fecharia um caminho torto entre duas redes.',
          3: 'O problema não é o IP: os dois já estão no mesmo bloco. A VLAN separa na camada de enlace, antes de o IP ter vez.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se um dia a secretaria precisar mandar um arquivo para o laboratório, o que tem que existir entre as duas VLANs?',
      porque: 'Cada VLAN é uma rede de enlace separada. O switch só repassa quadro dentro da mesma VLAN. Para sair de uma e entrar na outra, alguém tem que ler o IP e decidir.',
      feito: 'Um roteador. É ele, na camada de rede, que liga redes diferentes, e pode decidir quem passa. Fica para o ato 4.',
    }),
    passo({
      alvo: ['equip', 'sw-escola'],
      acao: 'tronco',
      valores: { porta: 'p8' },
      pedir: ['lista'],
      exemplo: { lista: '1,10,20' },
      instrucao: 'Faça da p8 do sw-escola, que vai para o anexo, um tronco 802.1Q com as VLANs do prédio.',
      porque: 'O sw-anexo espera um tronco com 1, 10 e 20. Do lado de cá, a p8 ainda é porta de acesso da VLAN 1: o quadro da secretaria, na 20, nem sai por ela. No tronco, cada quadro ganha uma etiqueta de 4 bytes com o número da VLAN, menos o da 1, a nativa.',
      conferir: (m) => {
        const t = porta(m, 'sw-escola', 'p8').tronco;
        if (!t) return 'A p8 continua porta de acesso.';
        if (!t.includes(20)) return `O tronco carrega ${t.join(',')}, mas não a 20. O quadro da secretaria não atravessa.`;
        return true;
      },
      feito: 'Tronco nos dois lados. O mesmo cabo de 60 m agora carrega três LANs virtuais, separadas pela etiqueta.',
    }),
    passo({
      alvo: ['equip', 'secretaria'],
      acao: 'ping',
      valores: { destino: IP76.arquivo, n: '4' },
      instrucao: 'Da secretaria, pingue o arquivo, no anexo.',
      porque: 'O quadro sai da secretaria sem etiqueta, entra na p2 como VLAN 20, sai pelo tronco com a etiqueta 20, chega ao sw-anexo e sai pela p1, de acesso da VLAN 20, de novo sem etiqueta.',
      conferir: (m) => pingOk(m, 'secretaria', IP76.arquivo).ok || 'O ping no arquivo não voltou. Confira o tronco com "Ver as VLANs".',
      feito: 'Quatro respostas. A secretaria fala com o arquivo, o laboratório não fala com nenhum dos dois, e nenhum cabo foi trocado.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Por que LANs virtuais',
        texto: ['Separar grupos com cabos e switches próprios custa caro e engessa. A VLAN separa por configuração, no mesmo equipamento.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Motivo', 'O que a VLAN resolve'],
          linhas: [
            ['segurança', 'quem está numa VLAN não recebe nem o broadcast da outra'],
            ['carga', 'o tráfego pesado de um grupo não ocupa as portas do outro'],
            ['broadcast', 'cada VLAN é um domínio de broadcast próprio, menor e mais quieto'],
            ['organização', 'os grupos seguem o departamento, não a tomada; mudar de grupo é mudar a porta'],
          ],
        },
      },
      {
        titulo: 'Acesso e tronco',
        texto: [
          'Porta de acesso pertence a uma VLAN e o quadro passa por ela sem etiqueta: o PC nem sabe que VLAN existe.',
          'Porta de tronco liga switch a switch e carrega várias VLANs no mesmo cabo, cada quadro com a sua etiqueta.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'lab', rotulo: 'lab (VLAN 10)', x: 80, y: 60 },
            { id: 'sec', rotulo: 'secretaria (VLAN 20)', x: 80, y: 190 },
            { id: 'sw1', rotulo: 'sw-escola', x: 260, y: 125 },
            { id: 'sw2', rotulo: 'sw-anexo', x: 440, y: 125 },
            { id: 'arq', rotulo: 'arquivo (VLAN 20)', x: 560, y: 190 },
          ],
          ligacoes: [
            ['lab', 'sw1', 'acesso 10'],
            ['sec', 'sw1', 'acesso 20'],
            ['sw1', 'sw2', 'tronco 1,10,20'],
            ['sw2', 'arq', 'acesso 20'],
          ],
        },
      },
      {
        titulo: 'A etiqueta 802.1Q',
        texto: [
          'No tronco, o switch enfia 4 bytes no quadro, logo depois dos dois endereços MAC: 16 bits de TPID (sempre 0x8100, para avisar que vem etiqueta), 3 bits de prioridade, 1 bit de descarte e 12 bits de VLAN ID. Na saída para uma porta de acesso, a etiqueta é tirada de novo.',
        ],
        visual: {
          tipo: 'bits',
          antes: 'MAC destino | MAC origem | tipo | dados | FCS',
          depois: 'MAC destino | MAC origem | 8100 | PRI DEI VID | tipo | dados | FCS',
          legenda: 'o mesmo quadro sem etiqueta e com etiqueta: 4 bytes a mais, e o FCS recalculado',
        },
      },
      {
        titulo: '4094 VLANs e uma nativa',
        texto: ['O VLAN ID tem 12 bits: 4096 valores. O 0 e o 4095 são reservados, então as VLANs vão de 1 a 4094.', 'Uma VLAN do tronco pode ir sem etiqueta: a nativa, por padrão a 1. E o tronco só carrega as VLANs da lista de permitidas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Tamanho', 'Para quê'],
          linhas: [
            ['TPID', '16 bits', '0x8100: avisa que é um quadro etiquetado'],
            ['prioridade', '3 bits', 'de 0 a 7, para voz e vídeo passarem na frente'],
            ['descarte (DEI)', '1 bit', 'pode ser jogado fora primeiro se faltar espaço'],
            ['VLAN ID', '12 bits', 'de 1 a 4094; 0 e 4095 são reservados'],
          ],
        },
      },
      {
        titulo: 'Entre VLANs, só roteador',
        texto: ['VLANs diferentes são redes de enlace diferentes, mesmo no mesmo switch. O switch nunca passa quadro de uma para a outra. Quem liga as duas é um roteador, que lê o IP e decide.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'v10', rotulo: 'VLAN 10', x: 100, y: 120 },
            { id: 'r', rotulo: 'roteador', x: 300, y: 120 },
            { id: 'v20', rotulo: 'VLAN 20', x: 500, y: 120 },
          ],
          ligacoes: [
            ['v10', 'r', 'pacote IP'],
            ['r', 'v20', 'pacote IP'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O arquivo está na VLAN 20, num switch do anexo. O tronco entre os prédios carrega as VLANs 1 e 10. O que acontece no ping da secretaria, também na VLAN 20, para o arquivo?',
      opcoes: ['Falha: o tronco não carrega a VLAN 20', 'Passa: o tronco carrega tudo que for VLAN', 'Passa pela VLAN 1, que é a nativa', 'Falha porque falta um hub no meio'],
      certa: 0,
      explicacao: 'O tronco só carrega as VLANs da lista de permitidas. Sem a 20 na lista, o quadro etiquetado com 20 não atravessa, e a nativa não serve de atalho: a VLAN 1 é outra rede.',
    },
  },
  desafio: {
    carta: [
      'Que dia. O bairro Leste está aceso de ponta a ponta, e a praça já tem Wi-Fi: tem gente sentada no banco só para ver a barrinha cheia.',
      'Falta uma coisa no posto de saúde. A recepção (VLAN 10) fica no térreo e a médica, no primeiro andar, na VLAN 30 da saúde. O prontuário, no térreo, ninguém configurou; e o tronco entre os andares só carrega 1 e 10. A médica não abre ficha nenhuma desde as oito.',
      'Objetivo: o prontuário na VLAN 30, sem a recepção enxergar, a médica pingando o prontuário pelo tronco, e a pergunta respondida.',
    ],
    dicas: [
      'Veja as VLANs dos dois switches. O prontuário está na VLAN de fábrica, e o tronco não tem a 30.',
      'Ponha a porta do prontuário no sw-terreo na VLAN 30 e acrescente a 30 ao tronco dos dois lados (1,10,30). Depois pingue o prontuário a partir da médica.',
      'Os 12 bits do VLAN ID dão 4096 valores, menos os dois reservados.',
    ],
    perguntas: d76D,
    respostas: { '1': '12' },
    montar: () => {
      const m = novoMundo(3076);
      adicionar(m, comutador('sw-terreo', { portas: 8, modelo: 'Switch Decorador 8G gerenciável (8 portas, 1 Gb/s)' }));
      adicionar(m, comutador('sw-andar', { portas: 8, modelo: 'Switch Decorador 8G gerenciável (8 portas, 1 Gb/s)' }));
      adicionar(m, pc('recepcao', { ip: cidr('198.51.100.10/24'), modelo: 'PC da recepção' }));
      adicionar(m, pc('prontuario', { ip: cidr('198.51.100.30/24'), modelo: 'Servidor de prontuários' }));
      adicionar(m, pc('medica', { ip: cidr('198.51.100.31/24'), modelo: 'PC do consultório' }));
      ligar(m, { equip: 'recepcao', porta: 'eth0' }, { equip: 'sw-terreo', porta: 'p1' }, 'cat6', 10);
      ligar(m, { equip: 'prontuario', porta: 'eth0' }, { equip: 'sw-terreo', porta: 'p2' }, 'cat6', 5);
      ligar(m, { equip: 'sw-terreo', porta: 'p8' }, { equip: 'sw-andar', porta: 'p8' }, 'cat6', 25);
      ligar(m, { equip: 'medica', porta: 'eth0' }, { equip: 'sw-andar', porta: 'p1' }, 'cat6', 12);
      porta(m, 'sw-terreo', 'p1').vlan = 10;
      porta(m, 'sw-terreo', 'p8').tronco = [1, 10];
      porta(m, 'sw-andar', 'p1').vlan = 30;
      porta(m, 'sw-andar', 'p8').tronco = [1, 10];
      return m;
    },
    objetivo: (m) => {
      const p2 = porta(m, 'sw-terreo', 'p2');
      return [
        item('prontuário (sw-terreo p2) na VLAN 30', !p2.tronco && p2.vlan === 30, p2.tronco ? 'é tronco' : `VLAN ${p2.vlan ?? 1}`),
        item('a recepção não alcança o prontuário', caminho(m, 'recepcao', 'prontuario') === null, caminho(m, 'recepcao', 'prontuario') ? 'ainda se enxergam' : 'separados'),
        pingOk(m, 'medica', '198.51.100.30'),
        ...todasRespondidas(m, d76D),
      ];
    },
    solucao: [
      ['equip', 'sw-terreo', 'vlan-ver'],
      ['equip', 'sw-terreo', 'vlan', { porta: 'p2', id: '30' }],
      ['equip', 'sw-terreo', 'tronco', { porta: 'p8', lista: '1,10,30' }],
      ['equip', 'sw-andar', 'tronco', { porta: 'p8', lista: '1,10,30' }],
      ['equip', 'medica', 'ping', { destino: '198.51.100.30', n: '4' }],
    ],
  },
};

export const ATO3F: Dia[] = [dia75, dia76];
