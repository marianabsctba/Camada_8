// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// A ligação com a cidade vizinha e os protocolos de apoio do IP: redes diferentes e túnel (5.5.1 a 5.5.4),
// fragmentação (5.5.5 e 5.5.6) e ICMP, ARP e DHCP (5.7.4).

import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { pertence } from '../motor/ip';
import { configurarDhcp, type ServidorDhcp } from '../motor/roteamento';
import { ipTexto, lerCidr, lerIp } from '../motor/util';
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

/** O endereço (texto) está dentro do prefixo (texto)? */
function dentro(ip: string | undefined, rede: string): boolean {
  const x = lerIp(ip ?? '');
  return x !== null && pertence(x, cidr(rede));
}

/** IP do PC, em texto, ou undefined. */
function ipDe(m: Mundo, nome: string): string | undefined {
  const e = m.equipamentos.get(nome)!;
  return e.ip ? ipTexto(e.ip.endereco) : undefined;
}

function traceRegistro(m: Mundo, de: string, ip: string): { chegou: boolean; saltos: (string | null)[] } | undefined {
  return m.flags.traceroutes?.[`${de}>${ip}`];
}

function temRota(m: Mundo, r: string, destino: string, via: string): boolean {
  const rotas = (m.equipamentos.get(r)!.s.rotas ?? []) as { destino: string; via: string }[];
  return rotas.some((x) => x.destino === destino && x.via === via);
}

/** O último pedido de eco que chegou ao destino tinha DF ligado e este tamanho de dados? */
function chegouComDf(m: Mundo, dados: number): boolean {
  const d = m.ultimaCaptura?.detalhe;
  return !!d && d.df && d.dados === dados && d.fragmentos.length === 1;
}

/* ======================================================================
 * ref 88: Redes diferentes, um túnel (5.5.1 a 5.5.4)
 * ====================================================================== */

const d88: Pergunta[] = [numerica('1', 'Com o túnel de MTU 1476, qual é o maior número de bytes de dados de um ping com DF ligado que atravessa sem ser recusado?', 1448, 0)];
const d88D: Pergunta[] = [numerica('1', 'A VPN da cidade vizinha tem MTU de 1420 num caminho de 1500. Quantos bytes cada pacote perde para os cabeçalhos e a cifra do túnel?', 80, 0)];

/** Duas prefeituras com redes privadas, um provedor público no meio e um túnel entre as bordas. */
function mundoTunel(o: { semente: number; mtuTunel: number; rotaFim: boolean; rotaViz: boolean; hostFim: [string, string]; hostViz: [string, string] }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.camadaRede = true;
  adicionar(m, pc(o.hostFim[0], { ip: cidr(`${o.hostFim[1]}/24`), gateway: '10.1.0.1', modelo: 'PC da prefeitura de Fim de Linha' }));
  adicionar(m, pc(o.hostViz[0], { ip: cidr(`${o.hostViz[1]}/24`), gateway: '10.2.0.1', modelo: 'PC da cidade vizinha' }));
  adicionar(
    m,
    roteador('b-fim', {
      modelo: 'Roteador de borda Fronteira 2 (Fim de Linha)',
      interfaces: { lan: '10.1.0.1/24', internet: '203.0.113.2/30', tunel: '172.16.0.1/30' },
      rotas: [{ destino: '0.0.0.0/0', via: '203.0.113.1' }, ...(o.rotaFim ? [{ destino: '10.2.0.0/24', via: '172.16.0.2' }] : [])],
    }),
  );
  adicionar(m, roteador('provedor', { modelo: 'Roteador do provedor Estrada Larga', interfaces: { fim: '203.0.113.1/30', viz: '198.51.100.1/30' } }));
  adicionar(
    m,
    roteador('b-viz', {
      modelo: 'Roteador de borda Fronteira 2 (cidade vizinha)',
      interfaces: { lan: '10.2.0.1/24', internet: '198.51.100.2/30', tunel: '172.16.0.2/30' },
      rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.1' }, ...(o.rotaViz ? [{ destino: '10.1.0.0/24', via: '172.16.0.1' }] : [])],
    }),
  );
  ligar(m, { equip: o.hostFim[0], porta: 'eth0' }, { equip: 'b-fim', porta: 'lan' }, 'cat6', 15, { id: 'c1' });
  ligar(m, { equip: 'b-fim', porta: 'internet' }, { equip: 'provedor', porta: 'fim' }, 'cat6', 80, { id: 'c2' });
  ligar(m, { equip: 'provedor', porta: 'viz' }, { equip: 'b-viz', porta: 'internet' }, 'cat6', 80, { id: 'c3' });
  ligar(m, { equip: 'b-fim', porta: 'tunel' }, { equip: 'b-viz', porta: 'tunel' }, 'cat6', 90, {
    id: 'tunel',
    mtu: o.mtuTunel,
    nota: `Túnel entre as bordas: um enlace virtual que, no mundo de verdade, viaja embrulhado dentro de pacotes IPv4 públicos pelo provedor. MTU efetivo ${o.mtuTunel}.`,
  });
  ligar(m, { equip: 'b-viz', porta: 'lan' }, { equip: o.hostViz[0], porta: 'eth0' }, 'cat6', 15, { id: 'c4' });
  m.proxCabo = 5;
  return m;
}

const dia88: Dia = {
  numero: 88,
  ato: 4,
  titulo: 'Redes diferentes, um túnel',
  chamado: [
    'CHAMADO #0088',
    'A prefeitura de Fim de Linha e a da cidade vizinha assinaram um convênio: o gabinete daqui precisa abrir o sistema de protocolo da câmara de lá. As duas redes usam endereços privados, 10.1.0.0/24 aqui e 10.2.0.0/24 lá, e entre elas só existe a internet do provedor Estrada Larga, que não quer nem saber de endereço privado.',
    'O técnico da cidade vizinha já configurou o lado dele do túnel e deixou um bilhete: "do meu lado está pronto, falta a rota do seu".',
    'Objetivo: a rota para 10.2.0.0/24 pelo túnel no b-fim, um traceroute do gabinete até a câmara chegando pelo túnel e a pergunta sobre o MTU respondida.',
  ],
  manual: {
    titulo: 'Interligar redes diferentes',
    texto: [
      'Redes nascem diferentes. Uma usa endereços de 32 bits, outra de 128; uma aceita pacotes de 1500 bytes, outra de 9000 e outra só de 576; uma tem conexão e garante a ordem, outra entrega datagramas soltos; uma tem prioridade para voz, outra trata todo mundo igual. Endereçamento, tamanho de pacote, tipo de serviço, qualidade de serviço, segurança e até a forma de cobrar mudam de uma rede para outra. Ligar duas redes é resolver essas diferenças no ponto de encontro.',
      'O jeito mais simples de ligar é ter um aparelho que fala as duas línguas. Um roteador multiprotocolo recebe pacotes de um tipo numa porta e entrega pacotes do outro tipo em outra, traduzindo o que dá para traduzir. Só que tradução é cara e sempre perde alguma coisa. A solução que venceu foi outra: pôr uma camada comum por cima de tudo. O IP é essa camada: cada rede embaixo pode ser Ethernet, rádio, fibra ou linha telefônica, mas todas carregam o mesmo pacote IP, e o roteador só precisa saber IP.',
      'Às vezes, porém, as duas pontas falam a mesma língua e o meio do caminho fala outra. Duas redes IPv6 separadas por uma rede só IPv4; duas prefeituras com endereços privados separadas pela internet pública. A saída é o tunelamento: na borda, o pacote inteiro vira carga útil de outro pacote, com endereços que o meio entende. Do outro lado, a borda desembrulha e entrega o pacote original. Para quem está no meio, é só mais um pacote entre dois endereços públicos.',
      'O túnel tem custo: o cabeçalho de fora. Num túnel IPv4 simples com um cabeçalho de encapsulamento de 4 bytes, são 20 + 4 = 24 bytes a mais em cada pacote. Se o caminho aguenta 1500, o pacote de dentro só pode ter 1476. Uma VPN, que é um túnel com cifra, gasta ainda mais. Outro detalhe: os roteadores do meio não veem o pacote de dentro, então não mexem no TTL dele e não aparecem no traceroute.',
      'Neste laboratório, o túnel aparece como um cabo direto entre o b-fim e o b-viz, com MTU de 1476. É uma aproximação: no mundo de verdade esse enlace não existe como fio, e cada pacote dele passa embrulhado pelo provedor. O efeito que importa para a camada de rede é o mesmo: um próximo salto do outro lado e um MTU menor.',
    ],
  },
  dicas: [
    'Primeiro tente o ping do gabinete para a câmara (10.2.0.10) e veja onde ele morre.',
    'O provedor não tem rota para endereço privado. A rota para 10.2.0.0/24 precisa apontar para a outra ponta do túnel, não para o provedor.',
    'No b-fim, crie a rota 10.2.0.0/24 via 172.16.0.2. Depois traceroute do gabinete para 10.2.0.10. Para a pergunta: 1476 menos 20 do IP menos 8 do ICMP.',
  ],
  perguntas: d88,
  montar: () => mundoTunel({ semente: 488, mtuTunel: 1476, rotaFim: false, rotaViz: true, hostFim: ['gabinete', '10.1.0.10'], hostViz: ['camara-viz', '10.2.0.10'] }),
  objetivo: (m) => {
    const tr = traceRegistro(m, 'gabinete', '10.2.0.10');
    return [
      item('rota 10.2.0.0/24 via 172.16.0.2 (o túnel) no b-fim', temRota(m, 'b-fim', '10.2.0.0/24', '172.16.0.2')),
      item('traceroute do gabinete até 10.2.0.10 chegando pelo túnel', !!tr && tr.chegou && tr.saltos.includes('172.16.0.2'), tr ? tr.saltos.map((x) => x ?? '*').join(' > ') : 'ainda não foi feito'),
      ...todasRespondidas(m, d88),
    ];
  },
  posMorte: [
    'Sem a rota, o pacote para 10.2.0.10 seguiu a rota padrão do b-fim até o provedor. O provedor olhou a tabela, não achou nada para 10.2.0.0/24 (nenhum roteador da internet tem rota para endereço privado) e descartou com "rede inalcançável". O aviso ICMP também morreu, porque o provedor não sabe voltar para 10.1.0.10. Duas redes que falam IP, a mesma língua, e mesmo assim não se enxergam.',
    'Com a rota pelo túnel, o pacote privado entrou no enlace virtual e saiu no b-viz. No traceroute aparecem só três linhas: b-fim, b-viz e a câmara. O provedor sumiu, porque dentro do túnel o pacote de dentro não passa por ele como pacote: passa como carga útil de outro. Quem gasta TTL no meio é o pacote de fora.',
    'O preço apareceu no tamanho: 1500 bytes com DF não cabem em 1476 e o b-fim recusou com "fragmentação necessária". O maior ping com DF tem 1476 - 20 - 8 = 1448 bytes de dados. É por isso que VPN às vezes "abre o site mas trava no anexo grande": o pacote grande não passa e ninguém percebe o aviso.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'gabinete'],
      acao: 'ping',
      valores: { destino: '10.2.0.10', n: '2' },
      instrucao: 'Do gabinete, faça ping na câmara da cidade vizinha (10.2.0.10).',
      porque: 'O gabinete manda tudo que não é da rede dele para o gateway, o b-fim. O b-fim, sem rota específica, usa a rota padrão para o provedor.',
      conferir: (m) => (registroPing(m, 'gabinete', '10.2.0.10') ? true : 'O ping ainda não foi feito.'),
      feito: 'Nenhuma resposta. O pacote morreu no provedor, e nem o aviso de "rede inalcançável" voltou: o provedor não tem rota para nenhum endereço 10.x, nem de ida nem de volta.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Endereços privados não são roteados na internet: o provedor não tem rota para 10.2.0.0/24',
          'O TTL acabou no caminho',
          'O cabo até o provedor está com defeito',
          'A cidade vizinha usa outra versão do IP',
        ],
        certa: 0,
        errada: {
          1: 'Com TTL esgotado viria "tempo esgotado", e o pacote saiu com TTL 64 para atravessar dois roteadores. Sobra TTL para dar e vender.',
          2: 'O pacote chegou ao provedor, tanto que foi ele quem descartou. O cabo está bom.',
          3: 'As duas pontas falam IPv4. O problema não é a língua, é o endereço que o meio não aceita.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o provedor não entrega o pacote para 10.2.0.10?',
      porque: 'As faixas 10/8, 172.16/12 e 192.168/16 podem ser usadas por qualquer um, em qualquer lugar. Por isso nenhum roteador da internet aceita rota para elas: seria impossível saber qual das milhões de redes 10.2.0.0 é a certa.',
      feito: 'Mesma língua nas pontas, endereços que o meio não entende. É o caso clássico para um túnel: embrulhar o pacote privado num pacote com endereços públicos.',
    }),
    passo({
      alvo: ['equip', 'b-fim'],
      acao: 'rot-rota',
      valores: { destino: '10.2.0.0/24' },
      pedir: ['via'],
      exemplo: { via: '172.16.0.2' },
      instrucao: 'No b-fim, crie a rota para 10.2.0.0/24 tendo como próximo salto a outra ponta do túnel.',
      porque: 'A porta "tunel" do b-fim é 172.16.0.1/30; a outra ponta, no b-viz, é 172.16.0.2. Com essa rota, o prefixo /24 vence a rota padrão /0 (prefixo mais longo) e o pacote vai pelo túnel em vez de ir cru para o provedor.',
      conferir: (m) =>
        temRota(m, 'b-fim', '10.2.0.0/24', '172.16.0.2')
          ? true
          : temRota(m, 'b-fim', '10.2.0.0/24', '203.0.113.1')
            ? 'Essa é a rota que já existia na prática: mandar para o provedor, que não sabe o que fazer com 10.x. O próximo salto é a outra ponta do túnel.'
            : 'A rota para 10.2.0.0/24 precisa apontar para 172.16.0.2, a ponta do túnel no b-viz.',
      feito: 'Rota criada. O b-viz já tinha a rota de volta, 10.1.0.0/24 via 172.16.0.1, deixada pelo técnico da cidade vizinha.',
    }),
    passo({
      alvo: ['equip', 'gabinete'],
      acao: 'ping',
      valores: { destino: '10.2.0.10', n: '4' },
      instrucao: 'Faça o ping na câmara de novo.',
      porque: 'Agora o b-fim escolhe a rota do túnel, e o b-viz sabe devolver pelo mesmo túnel. Ida e volta resolvidas.',
      conferir: (m) => pingOk(m, 'gabinete', '10.2.0.10').ok || 'O ping ainda não voltou inteiro. Confira a rota no b-fim.',
      feito: 'Quatro respostas. Duas redes privadas conversando através de uma rede que não as aceita.',
    }),
    passo({
      alvo: ['equip', 'gabinete'],
      acao: 'traceroute',
      valores: { destino: '10.2.0.10' },
      instrucao: 'Rode um traceroute do gabinete até a câmara.',
      porque: 'O traceroute mostra quem gasta o TTL do pacote. Dentro do túnel, o pacote de dentro só existe nas duas bordas.',
      conferir: (m) => (traceRegistro(m, 'gabinete', '10.2.0.10')?.chegou ? true : 'O traceroute não chegou até 10.2.0.10.'),
      feito: 'Três linhas: b-fim (10.1.0.1), b-viz (172.16.0.2) e a câmara. O provedor não aparece. Para o pacote de dentro, o túnel inteiro é um salto só.',
    }),
    passo({
      alvo: ['equip', 'gabinete'],
      acao: 'ping-tamanho',
      valores: { destino: '10.2.0.10', n: '1', tamanho: '1472', df: 'df' },
      instrucao: 'Mande um ping de 1472 bytes de dados com DF ligado, o maior que cabe num Ethernet comum.',
      porque: '1472 de dados, mais 8 do ICMP e 20 do IP, dá 1500 bytes: cabe em qualquer Ethernet. Mas o túnel tem MTU 1476, porque o cabeçalho de fora come 24 bytes.',
      conferir: (m) => {
        const r = registroPing(m, 'gabinete', '10.2.0.10');
        return r && r.recebidos === 0 ? true : 'Esse ping deveria ter sido recusado no b-fim. Confira se foi com 1472 bytes e DF ligado.';
      },
      feito: 'O b-fim devolveu ICMP tipo 3 código 4, "fragmentação necessária", com o MTU do próximo salto: 1476. É o aviso que a origem usa para baixar o tamanho.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '1448' },
      instrucao: 'Com o túnel de MTU 1476, qual é o maior número de bytes de dados de um ping com DF que atravessa?',
      porque: 'O pacote IP inteiro precisa caber em 1476. Dele saem 20 bytes do cabeçalho IP e 8 do cabeçalho ICMP.',
      feito: '1476 - 20 - 8 = 1448. Todo túnel é um pouco de MTU a menos, e quem esquece disso descobre no primeiro anexo grande.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Cada rede com seu jeito',
        texto: ['Ligar redes é resolver as diferenças entre elas no ponto de encontro. Algumas se traduzem, outras só se contornam.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['O que muda', 'Exemplos'],
          linhas: [
            ['endereçamento', '32 bits no IPv4, 128 no IPv6, endereço privado que só vale dentro de casa'],
            ['tamanho de pacote', '1500 no Ethernet, 9000 com quadro jumbo, 576 em enlaces antigos'],
            ['serviço', 'com conexão e ordem garantida, ou datagramas soltos'],
            ['qualidade de serviço', 'prioridade para voz numa rede, todo mundo igual na outra'],
            ['segurança e cobrança', 'cifrado ou aberto, por tempo ou por volume'],
          ],
        },
      },
      {
        titulo: 'Tradutor ou língua comum',
        texto: [
          'Um roteador multiprotocolo traduz um tipo de pacote em outro, mas cada tradução perde algo. O que venceu foi uma camada comum: todas as redes de baixo carregam o mesmo pacote IP, e o roteador só precisa falar IP.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['aplicação e transporte: iguais nas duas pontas', 'IP: a camada comum, igual em todo lugar', 'enlace e física: Ethernet aqui, rádio ali, fibra lá'],
          rotulo: 'a cintura fina: muitas redes embaixo, um IP só no meio',
        },
      },
      {
        titulo: 'Túnel: pacote dentro de pacote',
        texto: [
          'Quando as pontas falam a mesma língua e o meio fala outra, a borda embrulha o pacote inteiro num pacote que o meio entende. Do outro lado, a outra borda desembrulha.',
          'É assim que duas ilhas IPv6 conversam por uma rede só IPv4, e que duas prefeituras com endereços privados se ligam por uma VPN pela internet.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['IPv4 de fora: 203.0.113.2 para 198.51.100.2 (o provedor só lê isto)', 'cabeçalho do túnel', 'IP de dentro: 10.1.0.10 para 10.2.0.10', 'ICMP, TCP ou o que for', 'dados'],
          rotulo: 'um pacote no túnel entre as prefeituras, de fora para dentro',
        },
      },
      {
        titulo: 'O caminho visto de dentro',
        texto: ['Para o pacote de dentro, o túnel é um salto só. O provedor existe, mas só o pacote de fora passa por ele.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'g', rotulo: 'gabinete 10.1.0.10', x: 60, y: 120 },
            { id: 'bf', rotulo: 'b-fim', x: 190, y: 120 },
            { id: 'pr', rotulo: 'provedor', x: 320, y: 40 },
            { id: 'bv', rotulo: 'b-viz', x: 450, y: 120 },
            { id: 'c', rotulo: 'câmara 10.2.0.10', x: 580, y: 120 },
          ],
          ligacoes: [
            ['g', 'bf'],
            ['bf', 'pr', 'pacote de fora'],
            ['pr', 'bv', 'pacote de fora'],
            ['bf', 'bv', 'túnel, MTU 1476'],
            ['bv', 'c'],
          ],
        },
      },
      {
        titulo: 'O custo do embrulho',
        texto: ['Cada pacote no túnel carrega um cabeçalho a mais. O caminho continua aguentando 1500; o pacote de dentro é que precisa encolher.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Túnel', 'Cabeçalho extra', 'MTU de dentro', 'Maior ping com DF'],
          linhas: [
            ['nenhum (Ethernet puro)', '0 bytes', '1500', '1472 bytes de dados'],
            ['IPv4 com encapsulamento simples', '20 + 4 = 24 bytes', '1476', '1448 bytes de dados'],
            ['IPv6 dentro de IPv4', '20 bytes', '1480', 'depende do IPv6 de dentro'],
            ['VPN cifrada da cidade vizinha', '80 bytes', '1420', '1392 bytes de dados'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Duas redes IPv6 precisam conversar, mas entre elas só existe uma rede IPv4. O que a borda de cada lado faz?',
      opcoes: [
        'Embrulha o pacote IPv6 inteiro dentro de um pacote IPv4 e manda para a outra borda',
        'Traduz cada endereço de 128 bits para 32 bits, sem perder nada',
        'Manda o pacote IPv6 cru, e os roteadores IPv4 aprendem sozinhos',
        'Nada: redes diferentes nunca se ligam',
      ],
      certa: 0,
      explicacao: 'É tunelamento: o pacote IPv6 vira carga útil de um IPv4 entre as duas bordas. Tradução de 128 para 32 bits não cabe, e roteador IPv4 não entende pacote IPv6.',
    },
  },
  desafio: {
    carta: [
      'O hospital da cidade vizinha precisa mandar exames para a central de regulação de Fim de Linha (10.1.0.40) pela VPN entre as prefeituras. Desta vez, o lado de Fim de Linha está pronto. O de lá, nem tanto: o técnico de lá está de férias e o bilhete dele diz só "acho que fiz tudo".',
      'A VPN é cifrada, e o fornecedor jura que "não muda nada no tamanho". O MTU dela, 1420, discorda.',
      'Objetivo: ping do hospital até a regulação, um ping com DF do maior tamanho que passa pela VPN e a pergunta respondida.',
    ],
    dicas: [
      'Veja a tabela de rotas do b-viz. Para onde vai um pacote para 10.1.0.0/24?',
      'Falta a rota 10.1.0.0/24 via 172.16.0.1 no b-viz. Sem ela, o pacote vai cru para o provedor.',
      'Com MTU 1420, o maior ping com DF tem 1420 - 28 = 1392 bytes de dados. E 1500 - 1420 dá o custo da VPN.',
    ],
    perguntas: d88D,
    respostas: { '1': '80' },
    montar: () => mundoTunel({ semente: 3088, mtuTunel: 1420, rotaFim: true, rotaViz: false, hostFim: ['regulacao', '10.1.0.40'], hostViz: ['hospital-viz', '10.2.0.30'] }),
    objetivo: (m) => {
      const r = registroPing(m, 'hospital-viz', '10.1.0.40');
      return [
        pingOk(m, 'hospital-viz', '10.1.0.40'),
        item('ping com DF e 1392 bytes de dados, o maior que passa pela VPN, chegou inteiro', !!r && r.recebidos > 0 && chegouComDf(m, 1392), m.ultimaCaptura?.detalhe ? `último: ${m.ultimaCaptura.detalhe.dados} bytes, DF ${m.ultimaCaptura.detalhe.df ? 'ligado' : 'desligado'}` : 'ainda não foi feito'),
        ...todasRespondidas(m, d88D),
      ];
    },
    solucao: [
      ['equip', 'b-viz', 'rot-rota', { destino: '10.1.0.0/24', via: '172.16.0.1' }],
      ['equip', 'hospital-viz', 'ping', { destino: '10.1.0.40', n: '4' }],
      ['equip', 'hospital-viz', 'ping-tamanho', { destino: '10.1.0.40', n: '1', tamanho: '1392', df: 'df' }],
    ],
  },
};

/* ======================================================================
 * ref 89: Fragmentação (5.5.5 e 5.5.6)
 * ====================================================================== */

const d89: Pergunta[] = [numerica('1', 'No ping de 1472 bytes pelo enlace de MTU 1000, o segundo fragmento começa em que byte dos dados originais?', 976, 0)];
const d89D: Pergunta[] = [
  numerica('1', 'Antes do conserto, em quantos fragmentos um pacote IP de 1500 bytes saía pela porta de MTU 576?', 3, 0),
  numerica('2', 'E qual era o campo deslocamento (em unidades de 8 bytes) do último desses fragmentos?', 138, 0),
];

/** Prefeitura, enlace até a vizinha e o cartório (ou o laboratório) do outro lado. */
function mundoFragmentos(o: { semente: number; origem: [string, string]; destino: [string, string]; mtuCabo?: number; mtuPorta?: number; redeLan: string; redeEnlace: [string, string] }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.camadaRede = true;
  const gw = o.redeLan.replace(/\.0\/24$/, '.1');
  adicionar(m, pc(o.origem[0], { ip: cidr(`${o.origem[1]}/24`), gateway: gw }));
  adicionar(m, pc(o.destino[0], { ip: cidr(`${o.destino[1]}/24`), gateway: '198.51.100.1' }));
  adicionar(m, roteador('r-pref', { modelo: 'Roteador Cruzamento 4 (prefeitura)', interfaces: { lan: `${gw}/24`, viz: `${o.redeEnlace[0]}/30` }, rotas: [{ destino: '198.51.100.0/24', via: o.redeEnlace[1] }] }));
  adicionar(m, roteador('r-viz', { modelo: 'Roteador Cruzamento 4 (cidade vizinha)', interfaces: { fim: `${o.redeEnlace[1]}/30`, lan: '198.51.100.1/24' }, rotas: [{ destino: o.redeLan, via: o.redeEnlace[0] }] }));
  ligar(m, { equip: o.origem[0], porta: 'eth0' }, { equip: 'r-pref', porta: 'lan' }, 'cat6', 10, { id: 'c1' });
  ligar(m, { equip: 'r-pref', porta: 'viz' }, { equip: 'r-viz', porta: 'fim' }, 'cat6', 90, {
    id: 'enlace',
    ...(o.mtuCabo ? { mtu: o.mtuCabo, nota: `Enlace de rádio antigo até a cidade vizinha: MTU ${o.mtuCabo}.` } : {}),
  });
  ligar(m, { equip: 'r-viz', porta: 'lan' }, { equip: o.destino[0], porta: 'eth0' }, 'cat6', 10, { id: 'c3' });
  if (o.mtuPorta) m.equipamentos.get('r-pref')!.portas.find((p) => p.nome === 'viz')!.mtu = o.mtuPorta;
  m.proxCabo = 4;
  return m;
}

const dia89: Dia = {
  numero: 89,
  ato: 4,
  titulo: 'Fragmentação',
  chamado: [
    'CHAMADO #0089',
    'O arquivo da prefeitura manda certidões digitalizadas para o cartório da cidade vizinha por um enlace de rádio antigo, herdado do tempo em que a prefeitura só mandava fax. O rádio só aceita pacotes de até 1000 bytes.',
    'Tudo chega, mas o cartório reclama que "vem em pedacinhos", e um sistema novo do cartório, que manda tudo com o bit "não fragmente", simplesmente não funciona.',
    'Objetivo: ver um pacote grande ser fragmentado, descobrir com DF o maior ping que atravessa o rádio inteiro e responder a pergunta.',
  ],
  manual: {
    titulo: 'Tamanho de pacote e fragmentação',
    texto: [
      'Cada rede tem um tamanho máximo de pacote, o MTU (unidade máxima de transmissão). No Ethernet são 1500 bytes de pacote IP; num enlace antigo podem ser 576; num túnel, um pouco menos que o caminho embaixo dele. O motivo são limites de hardware, de memória, do próprio padrão, ou a vontade de não deixar um pacote gigante ocupar a linha por muito tempo. Quando um pacote entra numa rede de MTU menor que ele, alguém tem que quebrá-lo.',
      'Fragmentar é cortar o pacote em pedaços que caibam, cada um com seu próprio cabeçalho IP. Existem dois jeitos. Na fragmentação transparente, o roteador de entrada da rede pequena corta e o de saída junta de novo, e ninguém fora percebe; o problema é que todos os pedaços precisam sair pelo mesmo roteador. Na não transparente, que é a do IP, quem corta é qualquer roteador do caminho e só o destino final junta. Os pedaços seguem como pacotes independentes.',
      'Três campos do cabeçalho IPv4 fazem isso funcionar. A identificação é igual em todos os fragmentos de um mesmo pacote, para o destino saber quem é de quem. O bit MF (mais fragmentos) vale 1 em todos menos no último. E o deslocamento diz onde, nos dados originais, o pedaço começa, contado em unidades de 8 bytes (o campo tem 13 bits). Por isso todo fragmento, menos o último, carrega um múltiplo de 8 bytes de dados.',
      'Fragmentar custa caro: mais cabeçalhos, mais trabalho nos roteadores e, se um pedaço se perde, o pacote inteiro se perde. Então a moda é evitar. Na descoberta do MTU do caminho, a origem liga o bit DF (não fragmente). Se um roteador não consegue passar o pacote, ele descarta e devolve ICMP tipo 3 código 4, "fragmentação necessária", dizendo o MTU do próximo salto. A origem diminui o tamanho e tenta de novo, até achar o maior que passa inteiro.',
    ],
  },
  dicas: [
    'Mande um ping grande, de 1472 bytes de dados, sem DF, e olhe a captura no cartório.',
    'Depois repita com DF ligado e leia o aviso que volta: ele diz o MTU do próximo salto.',
    'O maior ping com DF tem MTU - 20 (IP) - 8 (ICMP) bytes de dados. Para a pergunta: o primeiro fragmento leva quantos bytes?',
  ],
  perguntas: d89,
  montar: () => mundoFragmentos({ semente: 489, origem: ['arquivo', '192.168.10.20'], destino: ['cartorio', '198.51.100.20'], mtuCabo: 1000, redeLan: '192.168.10.0/24', redeEnlace: ['192.0.2.1', '192.0.2.2'] }),
  objetivo: (m) => {
    const r = registroPing(m, 'arquivo', '198.51.100.20');
    return [
      item('ping com DF e 972 bytes de dados, o maior que atravessa o rádio, chegou inteiro', !!r && r.recebidos > 0 && chegouComDf(m, 972), m.ultimaCaptura?.detalhe ? `último: ${m.ultimaCaptura.detalhe.dados} bytes, DF ${m.ultimaCaptura.detalhe.df ? 'ligado' : 'desligado'}` : 'ainda não foi feito'),
      ...todasRespondidas(m, d89),
    ];
  },
  posMorte: [
    'O ping de 1472 bytes de dados virou um pacote IP de 1500 bytes. O r-pref viu que não cabia no rádio de MTU 1000 e cortou em dois: 976 bytes de dados com MF 1 e deslocamento 0, e 504 bytes com MF 0 e deslocamento 122 (976 / 8). Os dois levavam a mesma identificação, e só o cartório juntou. Os 976 não são acaso: 1000 - 20 do cabeçalho dá 980, e o maior múltiplo de 8 que cabe é 976.',
    'Com DF ligado, o r-pref não pôde cortar. Descartou e devolveu ICMP tipo 3 código 4 com o MTU do próximo salto, 1000. É exatamente o que a descoberta do MTU do caminho faz: a origem ouve o aviso, encolhe para 1000 - 28 = 972 bytes de dados e passa inteira, sem fragmento nenhum.',
    'O sistema novo do cartório manda tudo com DF e pacotes de 1500 bytes, e com o rádio no meio cada um deles morre no roteador. Se o sistema escutar o ICMP tipo 3 código 4, encolhe para 1000 e funciona. Se algum firewall no caminho bloquear todo ICMP "por segurança", o aviso nunca chega e a origem fica mandando pacote grande no vazio. Bloquear ICMP inteiro é arrancar da estrada a placa de "ponte baixa".',
  ],
  passos: [
    passo({
      alvo: ['equip', 'arquivo'],
      acao: 'ping-tamanho',
      valores: { destino: '198.51.100.20', n: '1', df: 'nao' },
      pedir: ['tamanho'],
      exemplo: { tamanho: '1472' },
      instrucao: 'Do arquivo, mande para o cartório um ping de 1472 bytes de dados, sem DF.',
      porque: '1472 de dados, mais 8 do ICMP e 20 do IP, dá um pacote de 1500 bytes: o máximo do Ethernet. Sai do arquivo sem problema, mas não cabe no rádio de 1000.',
      conferir: (m) => {
        const f = m.ultimaCaptura?.detalhe?.fragmentos ?? [];
        return f.length === 2 ? true : f.length === 1 ? 'Chegou num pedaço só: o pacote coube no rádio. Use 1472 bytes de dados para passar dos 1000.' : 'O ping ainda não chegou ao cartório.';
      },
      feito: 'Chegou em dois fragmentos com a mesma identificação: 976 bytes com MF 1 e deslocamento 0, depois 504 bytes com MF 0 e deslocamento 122. O cartório juntou os 1480 bytes de novo.',
    }),
    passo({
      escolha: {
        opcoes: ['122, porque o deslocamento conta em unidades de 8 bytes: 976 / 8', '976, o byte onde o fragmento começa', '1000, o MTU do rádio', '1, porque é o segundo fragmento'],
        certa: 0,
        errada: {
          1: 'O fragmento começa no byte 976, sim, mas o campo não guarda bytes: guarda unidades de 8 bytes. São só 13 bits de campo para cobrir até 65535 bytes.',
          2: 'O MTU limita o tamanho de cada fragmento, não diz onde ele começa.',
          3: 'O campo não numera os fragmentos: diz a posição dos dados dele no pacote original. É isso que deixa o destino montar mesmo com os pedaços fora de ordem.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que valor vai no campo deslocamento do segundo fragmento?',
      porque: 'O deslocamento diz onde, nos dados originais, o pedaço começa. Com 13 bits de campo, contar em bytes só alcançaria 8191; contando em blocos de 8, chega a 65528.',
      feito: '122. E é por isso que todo fragmento, menos o último, precisa ter um múltiplo de 8 bytes de dados.',
    }),
    passo({
      alvo: ['equip', 'arquivo'],
      acao: 'ping-tamanho',
      valores: { destino: '198.51.100.20', n: '1', tamanho: '1472', df: 'df' },
      instrucao: 'Repita o ping de 1472 bytes, agora com o bit DF (não fragmente) ligado.',
      porque: 'Com DF, nenhum roteador pode cortar o pacote. Quem não consegue passar descarta e avisa a origem com ICMP, dizendo o MTU que cabe.',
      conferir: (m) => {
        const r = registroPing(m, 'arquivo', '198.51.100.20');
        return r && r.recebidos === 0 ? true : 'Esse ping deveria ter sido recusado. Confira se foi com 1472 bytes e DF ligado.';
      },
      feito: 'O r-pref (192.168.10.1) devolveu ICMP tipo 3 código 4, "fragmentação necessária", com o MTU do próximo salto: 1000. Recado claro.',
    }),
    passo({
      alvo: ['equip', 'arquivo'],
      acao: 'ping-tamanho',
      valores: { destino: '198.51.100.20', n: '1', df: 'df' },
      pedir: ['tamanho'],
      exemplo: { tamanho: '972' },
      instrucao: 'Com DF ligado, mande o maior ping que cabe inteiro no MTU de 1000.',
      porque: 'O pacote IP inteiro precisa caber em 1000 bytes. Tire 20 do cabeçalho IP e 8 do cabeçalho ICMP: o que sobra é o máximo de dados.',
      conferir: (m) => {
        const d = m.ultimaCaptura?.detalhe;
        const r = registroPing(m, 'arquivo', '198.51.100.20');
        if (!r || r.recebidos === 0) return 'Ainda grande demais: o r-pref recusou de novo com "fragmentação necessária". O pacote IP é o dado mais 28 bytes.';
        if (!d?.df) return 'Ligue o DF: a ideia é achar o tamanho que passa sem que ninguém precise cortar.';
        return d.dados === 972 ? true : `Passou, com ${d.dados} bytes de dados, mas ainda cabe mais. Ache o maior: 1000 - 20 - 8.`;
      },
      feito: '972 bytes de dados, 1000 no pacote IP: passou inteiro, num pedaço só. Foi isso que a origem aprendeu com o aviso. Descoberta do MTU do caminho na mão.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '976' },
      instrucao: 'No ping de 1472 bytes sem DF, em que byte dos dados originais começou o segundo fragmento?',
      porque: 'O primeiro fragmento levou o maior múltiplo de 8 que cabe em 1000 - 20 = 980 bytes. O segundo começa logo depois.',
      feito: 'No byte 976, que é o deslocamento 122 vezes 8. A identificação junta os pedaços, o deslocamento põe cada um no lugar e o MF diz quando acabou.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Cada rede, um MTU',
        texto: ['O MTU é o maior pacote IP que cabe num enlace. Quando o caminho passa por redes diferentes, o menor MTU do caminho manda.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'arquivo', x: 60, y: 120 },
            { id: 'r1', rotulo: 'r-pref', x: 220, y: 120 },
            { id: 'r2', rotulo: 'r-viz', x: 400, y: 120 },
            { id: 'c', rotulo: 'cartório', x: 560, y: 120 },
          ],
          ligacoes: [
            ['a', 'r1', 'Ethernet, MTU 1500'],
            ['r1', 'r2', 'rádio, MTU 1000'],
            ['r2', 'c', 'Ethernet, MTU 1500'],
          ],
        },
      },
      {
        titulo: 'Transparente ou não',
        texto: [
          'Na transparente, quem corta na entrada da rede pequena junta na saída dela, e o resto do mundo nem sabe. Na não transparente, a do IP, qualquer roteador corta e só o destino final junta.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Transparente', 'Não transparente (IP)'],
          linhas: [
            ['quem corta', 'o roteador de entrada da rede pequena', 'qualquer roteador do caminho'],
            ['quem junta', 'o roteador de saída da rede pequena', 'só o destino final'],
            ['caminho dos pedaços', 'todos pelo mesmo roteador de saída', 'cada um como pacote independente'],
            ['custo', 'trabalho extra em cada borda', 'cabeçalho extra até o fim do caminho'],
          ],
        },
      },
      {
        titulo: 'Os três campos',
        texto: [
          'Mesma identificação em todos os pedaços; MF = 1 em todos menos o último; deslocamento em unidades de 8 bytes. Assim o destino remonta mesmo se os pedaços chegarem fora de ordem.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Fragmento', 'Dados', 'MF', 'Deslocamento', 'Começa no byte'],
          linhas: [
            ['pacote original', '1480 bytes', '0', '0', '0'],
            ['1º no MTU 1000', '976 bytes', '1', '0', '0'],
            ['2º no MTU 1000', '504 bytes', '0', '122', '976'],
          ],
        },
      },
      {
        titulo: 'Descobrir o MTU do caminho',
        texto: [
          'A origem manda com DF ligado. Quem não consegue passar descarta e devolve ICMP tipo 3 código 4 com o MTU do próximo salto. A origem encolhe e tenta de novo.',
          'Por isso bloquear todo ICMP quebra a rede: o aviso não chega e o pacote grande some sem explicação.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['1. arquivo manda 1500 bytes com DF', '2. r-pref: não cabe em 1000, descarta', '3. r-pref devolve ICMP 3/4, MTU do próximo salto 1000', '4. arquivo manda 1000 bytes com DF', '5. passa inteiro até o cartório'],
          rotulo: 'a conversa da descoberta do MTU do caminho',
        },
      },
    ],
    checagem: {
      pergunta: 'Um pacote IP de 1500 bytes (1480 de dados) entra num enlace de MTU 576. Quantos bytes de dados leva o primeiro fragmento?',
      opcoes: ['552', '556', '576', '1480'],
      certa: 0,
      explicacao: '576 - 20 de cabeçalho dá 556, mas fragmento que não é o último precisa ter múltiplo de 8 bytes de dados: o maior é 552. Saem 552, 552 e 376.',
    },
  },
  desafio: {
    carta: [
      'O posto de saúde manda laudos de imagem para o laboratório da cidade vizinha (198.51.100.30). O rádio antigo foi trocado por fibra, que aguenta 1500 bytes sem reclamar. Mesmo assim os laudos continuam chegando picotados, e o sistema novo do laboratório, que usa DF, recusa tudo.',
      'Suspeita do plantão: alguém esqueceu na porta do roteador a configuração do tempo do rádio, com 576 bytes, o tamanho que todo host IPv4 é obrigado a aceitar.',
      'Objetivo: o posto mandando um ping de 1472 bytes com DF até o laboratório, inteiro, e as duas perguntas sobre os pedaços de antes respondidas.',
    ],
    dicas: [
      'Veja as interfaces do r-pref. Qual porta está com MTU diferente de 1500?',
      'Ponha a porta viz do r-pref de volta em 1500 e mande o ping de 1472 bytes com DF.',
      'Com MTU 576, cada fragmento leva no máximo 552 bytes de dados. Divida 1480 nisso e conte; o deslocamento do último é 1104 / 8.',
    ],
    perguntas: d89D,
    respostas: { '1': '3', '2': '138' },
    montar: () => mundoFragmentos({ semente: 3089, origem: ['posto', '192.168.20.30'], destino: ['laboratorio', '198.51.100.30'], mtuPorta: 576, redeLan: '192.168.20.0/24', redeEnlace: ['192.0.2.5', '192.0.2.6'] }),
    objetivo: (m) => {
      const r = registroPing(m, 'posto', '198.51.100.30');
      return [
        item('ping de 1472 bytes com DF do posto até o laboratório chegou inteiro', !!r && r.recebidos > 0 && chegouComDf(m, 1472), m.ultimaCaptura?.detalhe ? `último: ${m.ultimaCaptura.detalhe.dados} bytes, DF ${m.ultimaCaptura.detalhe.df ? 'ligado' : 'desligado'}` : 'ainda não foi feito'),
        ...todasRespondidas(m, d89D),
      ];
    },
    solucao: [
      ['equip', 'r-pref', 'rot-mtu', { porta: 'viz', mtu: '1500' }],
      ['equip', 'posto', 'ping-tamanho', { destino: '198.51.100.30', n: '1', tamanho: '1472', df: 'df' }],
    ],
  },
};

/* ======================================================================
 * ref 95: ICMP, ARP e DHCP (5.7.4)
 * ====================================================================== */

const d95: Pergunta[] = [numerica('1', 'Que tipo ICMP o roteador devolve quando o TTL de um pacote chega a zero, a mensagem que o traceroute usa?', 11, 0)];
const d95D: Pergunta[] = [texto('1', 'Que mensagem DHCP o PC manda primeiro, em broadcast, quando ainda não tem endereço?', /^(o\s+)?(dhcp\s*)?(discover|dhcpdiscover|descoberta|dhcp\s+discover)$/i)];

/** Um bairro atrás de um roteador, ligado ao roteador do data center, onde mora o servidor. */
function mundoBairro(o: { semente: number; r: string; lan: string; wan: [string, string]; pcs: string[]; dhcp?: [string, string] }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.camadaRede = true;
  const gw = o.lan.replace(/\.0\/24$/, '.1');
  adicionar(m, comutador('sw-bairro', { portas: 8, modelo: 'Switch Decorador 8 (8 portas, 1 Gb/s)' }));
  for (const n of o.pcs) adicionar(m, pc(n));
  adicionar(m, roteador(o.r, { modelo: 'Roteador Cruzamento 4', interfaces: { lan: `${gw}/24`, wan: `${o.wan[1]}/30` }, rotas: [{ destino: '0.0.0.0/0', via: o.wan[0] }] }));
  adicionar(m, roteador('r-centro', { modelo: 'Roteador Cruzamento 8 (data center municipal)', interfaces: { bairro: `${o.wan[0]}/30`, dc: '10.20.0.1/24' }, rotas: [{ destino: o.lan, via: o.wan[1] }] }));
  adicionar(m, pc('prontuario', { ip: cidr('10.20.0.10/24'), gateway: '10.20.0.1', modelo: 'Servidor do prontuário municipal' }));
  o.pcs.forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw-bairro', porta: `p${i + 1}` }, 'cat6', 10 + 5 * i, { id: `c${i + 1}` }));
  const k = o.pcs.length;
  ligar(m, { equip: 'sw-bairro', porta: 'p8' }, { equip: o.r, porta: 'lan' }, 'cat6', 3, { id: `c${k + 1}` });
  ligar(m, { equip: o.r, porta: 'wan' }, { equip: 'r-centro', porta: 'bairro' }, 'cat6', 90, { id: `c${k + 2}` });
  ligar(m, { equip: 'r-centro', porta: 'dc' }, { equip: 'prontuario', porta: 'eth0' }, 'cat6', 5, { id: `c${k + 3}` });
  m.proxCabo = k + 4;
  if (o.dhcp) configurarDhcp(m.equipamentos.get(o.r)!, 'lan', o.dhcp[0], o.dhcp[1], { dns: '10.20.0.53', concessao: 3600 });
  return m;
}

function servidorDhcp(m: Mundo, r: string): ServidorDhcp | undefined {
  return m.equipamentos.get(r)!.s.dhcp as ServidorDhcp | undefined;
}

/** Cache ARP do PC: tem o MAC do gateway e não tem o do destino lá fora. */
function arpSoDoGateway(m: Mundo, quem: string, gw: string, longe: string): boolean {
  const arp = (m.equipamentos.get(quem)!.s.arp ?? {}) as Record<string, string>;
  const macs = Object.values(arp);
  return macs.includes(m.equipamentos.get(gw)!.mac) && !macs.includes(m.equipamentos.get(longe)!.mac);
}

const dia95: Dia = {
  numero: 95,
  ato: 4,
  titulo: 'ICMP, ARP e DHCP',
  chamado: [
    'CHAMADO #0095',
    'O posto de saúde novo do bairro Sul ganhou dois PCs e um roteador, o r-posto, ligado ao data center municipal. Os PCs saíram da caixa sem endereço nenhum, e a enfermeira-chefe avisou que não vai configurar IP na mão "nem por decreto".',
    'O prontuário eletrônico mora no data center, em 10.20.0.10. Os PCs precisam chegar lá sozinhos, assim que forem ligados.',
    'Objetivo: servidor DHCP no r-posto, a recepção com endereço por DHCP, ping e traceroute até o prontuário e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Os ajudantes do IP',
    texto: [
      'O IP sozinho só sabe levar pacote. Para a rede funcionar, ele depende de três protocolos de apoio, que trabalham o tempo todo sem ninguém ver. O ICMP dá notícias, o ARP acha vizinhos e o DHCP entrega endereço para quem chega.',
      'O ICMP (protocolo de mensagens de controle) é o carteiro das más notícias, e de algumas boas. Tipo 8 é o pedido de eco e tipo 0 a resposta: é o ping. Tipo 3 é destino inalcançável, com um código dizendo o motivo: 0 rede inalcançável (sem rota), 1 host inalcançável (o ARP não achou ninguém), 4 fragmentação necessária com DF ligado. Tipo 11 é tempo esgotado: o TTL chegou a zero. O traceroute usa justamente esse: manda sondas com TTL 1, 2, 3, e cada roteador que zera o TTL se denuncia ao avisar.',
      'O ARP resolve outro problema: o IP diz para quem é o pacote, mas o Ethernet só entrega para um MAC. O PC pergunta em broadcast "quem tem o IP tal?", o dono responde direto com o MAC, e o PC guarda a resposta num cache para não perguntar de novo a cada pacote. O ARP só funciona dentro da mesma rede de enlace. Se o destino está em outra rede, o PC nem pergunta por ele: faz ARP para o gateway e entrega o quadro ao roteador. No cache ficam só vizinhos.',
      'O DHCP dá endereço a quem não tem. São quatro mensagens: a descoberta (DISCOVER), em broadcast, porque o PC ainda não sabe nem o próprio IP; a oferta (OFFER) do servidor; o pedido (REQUEST), de novo em broadcast, para avisar a todos os servidores qual oferta foi aceita; e a confirmação (ACK). Junto do endereço vêm a máscara, o gateway e o DNS. O endereço é uma concessão por tempo limitado: na metade do prazo, o PC pede para renovar. Como o broadcast não atravessa roteador, o servidor precisa estar na mesma rede de enlace (ou ter um agente de repasse).',
    ],
  },
  dicas: [
    'Comece pelo servidor DHCP no r-posto, na porta lan. A faixa precisa caber na rede 192.168.50.0/24.',
    'Depois peça endereço por DHCP na recepção, faça ping no prontuário e veja o cache ARP.',
    'Faixa 192.168.50.100 a 192.168.50.150 na lan; DHCP na recepção; ping e traceroute para 10.20.0.10. O tempo esgotado é o tipo 11.',
  ],
  perguntas: d95,
  montar: () => mundoBairro({ semente: 495, r: 'r-posto', lan: '192.168.50.0/24', wan: ['10.0.0.1', '10.0.0.2'], pcs: ['recepcao', 'consultorio'] }),
  objetivo: (m) => {
    const d = servidorDhcp(m, 'r-posto');
    const ip = ipDe(m, 'recepcao');
    const tr = traceRegistro(m, 'recepcao', '10.20.0.10');
    return [
      item('servidor DHCP na lan do r-posto, com a faixa dentro de 192.168.50.0/24', !!d && d.porta === 'lan' && dentro(d.inicio, '192.168.50.0/24') && dentro(d.fim, '192.168.50.0/24'), d ? `${d.porta}: ${d.inicio} a ${d.fim}` : 'desligado'),
      item('recepção com endereço entregue por DHCP', !!m.equipamentos.get('recepcao')!.s.concessao && dentro(ip, '192.168.50.0/24'), ip ?? 'sem endereço'),
      pingOk(m, 'recepcao', '10.20.0.10'),
      item('traceroute da recepção até o prontuário', !!tr && tr.chegou, tr ? tr.saltos.map((x) => x ?? '*').join(' > ') : 'ainda não foi feito'),
      ...todasRespondidas(m, d95),
    ];
  },
  posMorte: [
    'A recepção ligou sem nada e gritou DHCPDISCOVER em broadcast, de 0.0.0.0 para 255.255.255.255. O r-posto ofereceu o primeiro endereço livre da faixa, com máscara /24, ela pediu (em broadcast de novo, para qualquer outro servidor saber que perdeu) e o r-posto confirmou. Junto vieram o gateway 192.168.50.1, o DNS 10.20.0.53 e uma concessão de 86400 s, um dia, com renovação na metade.',
    'Para o ping ao prontuário, a recepção viu que 10.20.0.10 está fora da rede dela e fez ARP só para o gateway. No cache dela ficou um único MAC: o do r-posto. O MAC do prontuário quem descobriu foi o r-centro, no último salto. Cada roteador refaz o quadro com o MAC do próximo vizinho; o pacote IP segue o mesmo, só com o TTL menor.',
    'O traceroute mandou sondas com TTL 1, 2 e 3. A primeira morreu no r-posto, que devolveu ICMP tipo 11 com o próprio endereço; a segunda, no r-centro; a terceira chegou e o prontuário respondeu com eco. Três mensagens de erro bem-educadas desenharam o mapa do caminho.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'r-posto'],
      acao: 'rot-dhcp',
      valores: { porta: 'lan', dns: '10.20.0.53', tempo: '86400' },
      pedir: ['inicio', 'fim'],
      exemplo: { inicio: '192.168.50.100', fim: '192.168.50.150' },
      instrucao: 'No r-posto, ligue o servidor DHCP na porta lan, com uma faixa de endereços para os PCs.',
      porque: 'A porta lan do r-posto é 192.168.50.1/24. A faixa precisa estar nessa rede, senão o servidor oferece endereço que não funciona aqui. O gateway entregue será o próprio r-posto, e o DNS é o do data center.',
      conferir: (m) => {
        const d = servidorDhcp(m, 'r-posto');
        if (!d || d.porta !== 'lan') return 'O servidor precisa estar na porta lan, onde os PCs estão.';
        return dentro(d.inicio, '192.168.50.0/24') && dentro(d.fim, '192.168.50.0/24') ? true : `A faixa ${d.inicio} a ${d.fim} sai da rede 192.168.50.0/24 da lan. Use endereços 192.168.50.x.`;
      },
      feito: 'Servidor DHCP ligado na lan, com DNS 10.20.0.53 e concessão de 86400 s (um dia).',
    }),
    passo({
      alvo: ['equip', 'recepcao'],
      acao: 'dhcp',
      instrucao: 'Na recepção, peça endereço por DHCP.',
      porque: 'Sem IP, a recepção não sabe nem quem ela é. Por isso a primeira mensagem sai de 0.0.0.0 para 255.255.255.255, em broadcast, para quem puder ouvir.',
      conferir: (m) => (dentro(ipDe(m, 'recepcao'), '192.168.50.0/24') ? true : 'A recepção não recebeu endereço. Confira o servidor DHCP do r-posto.'),
      feito: 'Quatro mensagens: DISCOVER, OFFER, REQUEST e ACK. A recepção ficou com o primeiro endereço livre da faixa, máscara /24, gateway 192.168.50.1 e DNS 10.20.0.53.',
    }),
    passo({
      alvo: ['equip', 'recepcao'],
      acao: 'ping',
      valores: { destino: '10.20.0.10', n: '4' },
      instrucao: 'Da recepção, faça ping no prontuário (10.20.0.10).',
      porque: 'O ping é ICMP: pedido de eco (tipo 8) na ida e resposta de eco (tipo 0) na volta. O destino é de outra rede, então o quadro vai para o gateway.',
      conferir: (m) => pingOk(m, 'recepcao', '10.20.0.10').ok || 'O ping no prontuário não voltou.',
      feito: 'Quatro respostas, com TTL menor do que saiu: dois roteadores no caminho, cada um gastando um.',
    }),
    passo({
      alvo: ['equip', 'recepcao'],
      acao: 'rotas',
      instrucao: 'Veja a tabela de rotas e o cache ARP da recepção.',
      porque: 'A rota padrão veio do DHCP, apontando para o gateway. O cache ARP mostra de quem a recepção já precisou saber o MAC.',
      conferir: (m) => (arpSoDoGateway(m, 'recepcao', 'r-posto', 'prontuario') ? true : 'O cache ARP deveria ter o MAC do r-posto. Faça o ping no prontuário antes.'),
      feito: 'Uma entrada só no ARP: 192.168.50.1, com o MAC do r-posto. Nenhum sinal do prontuário.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque o prontuário está em outra rede: a recepção só faz ARP para o gateway, e o quadro vai para o MAC do roteador',
          'Porque o cache ARP apaga o MAC do destino logo depois do ping',
          'Porque o prontuário não responde a ARP',
          'Porque o DHCP já entregou o MAC do prontuário',
        ],
        certa: 0,
        errada: {
          1: 'O cache guarda as respostas por um bom tempo, justamente para não perguntar a cada pacote. O MAC do prontuário nunca esteve ali.',
          2: 'Responde, sim, mas só para quem está na rede dele: o r-centro. O broadcast do ARP da recepção não atravessa roteador.',
          3: 'O DHCP entrega endereço, máscara, gateway e DNS. MAC de ninguém.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o MAC do prontuário não aparece no cache ARP da recepção?',
      porque: 'O ARP é uma pergunta em broadcast, e broadcast não passa de roteador. Para destino fora da rede, o PC entrega ao gateway e deixa o resto com ele.',
      feito: 'ARP só até o próximo salto. Cada roteador do caminho faz o seu ARP para o vizinho seguinte.',
    }),
    passo({
      alvo: ['equip', 'recepcao'],
      acao: 'traceroute',
      valores: { destino: '10.20.0.10' },
      instrucao: 'Rode um traceroute da recepção até o prontuário.',
      porque: 'Cada sonda sai com um TTL maior. O roteador onde o TTL chega a zero descarta a sonda e devolve uma mensagem ICMP de erro com o próprio endereço.',
      conferir: (m) => (traceRegistro(m, 'recepcao', '10.20.0.10')?.chegou ? true : 'O traceroute não chegou ao prontuário.'),
      feito: 'Três saltos: r-posto (192.168.50.1), r-centro (10.0.0.1) e o prontuário. Os dois primeiros se revelaram com ICMP de tempo esgotado.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '11' },
      instrucao: 'Que tipo ICMP os roteadores devolveram para as sondas do traceroute?',
      porque: 'É a mensagem de quando o TTL de um pacote chega a zero em trânsito. Tipo 3 é destino inalcançável; o do TTL é outro.',
      feito: 'Tipo 11, tempo esgotado. Uma mensagem de erro virou ferramenta de diagnóstico.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'As mensagens do ICMP',
        texto: ['O ICMP viaja dentro do IP e dá notícias sobre ele. Nunca se manda ICMP de erro sobre outro ICMP de erro, senão vira bola de neve.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tipo', 'Código', 'Nome', 'Para que serve'],
          linhas: [
            ['8', '0', 'pedido de eco', 'o ping de ida'],
            ['0', '0', 'resposta de eco', 'o ping de volta'],
            ['3', '0', 'rede inalcançável', 'o roteador não tem rota'],
            ['3', '1', 'host inalcançável', 'o ARP do último salto não achou ninguém'],
            ['3', '4', 'fragmentação necessária', 'não cabe no MTU e o DF está ligado'],
            ['11', '0', 'tempo esgotado', 'o TTL chegou a zero; o traceroute vive disso'],
          ],
        },
      },
      {
        titulo: 'ARP: quem tem este IP?',
        texto: [
          'O PC pergunta em broadcast, o dono responde direto, e o PC guarda no cache. Para fora da rede, a pergunta é sempre pelo gateway.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'p', rotulo: 'recepção', x: 60, y: 120 },
            { id: 'r1', rotulo: 'r-posto', x: 230, y: 120 },
            { id: 'r2', rotulo: 'r-centro', x: 400, y: 120 },
            { id: 's', rotulo: 'prontuário', x: 570, y: 120 },
          ],
          ligacoes: [
            ['p', 'r1', 'ARP pelo gateway'],
            ['r1', 'r2', 'ARP pelo próximo salto'],
            ['r2', 's', 'ARP pelo destino'],
          ],
        },
      },
      {
        titulo: 'DHCP em quatro mensagens',
        texto: ['Descoberta, oferta, pedido e confirmação. As duas do cliente vão em broadcast, porque ele ainda não tem endereço confirmado.'],
        visual: {
          tipo: 'camadas',
          camadas: [
            'DISCOVER: 0.0.0.0 para 255.255.255.255, "alguém me dá um endereço?"',
            'OFFER: o servidor oferece endereço, máscara, gateway, DNS e prazo',
            'REQUEST: em broadcast de novo, "quero o que aquele servidor ofereceu"',
            'ACK: confirmado, o endereço é seu durante a concessão',
          ],
          rotulo: 'a conversa, de cima para baixo',
        },
      },
      {
        titulo: 'Concessão e renovação',
        texto: [
          'O endereço é emprestado. Com concessão de 86400 s (um dia), o PC pede para renovar depois de 43200 s (12 h). Se o PC some, o endereço volta para a faixa quando o prazo vence.',
          'O broadcast não atravessa roteador: o servidor precisa estar na mesma rede de enlace, ou um agente de repasse leva o pedido até ele.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['O DHCP entrega', 'Exemplo no posto'],
          linhas: [
            ['endereço e máscara', '192.168.50.100/24'],
            ['gateway', '192.168.50.1 (o r-posto)'],
            ['DNS', '10.20.0.53'],
            ['concessão', '86400 s, renovação em 43200 s'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um PC em 192.168.50.100/24 faz ping em 10.20.0.10. De quem ele pede o MAC por ARP?',
      opcoes: ['Do gateway, 192.168.50.1', 'Do próprio 10.20.0.10', 'Do servidor DNS', 'De ninguém: o ping não usa ARP'],
      certa: 0,
      explicacao: 'O destino está em outra rede, e o broadcast do ARP não sai da rede de enlace. O PC entrega o quadro ao MAC do gateway, e o roteador cuida do resto.',
    },
  },
  desafio: {
    carta: [
      'O laboratório de informática da escola do bairro Norte ganhou o r-escola, já com servidor DHCP configurado por um estagiário entusiasmado. Os dois PCs dos alunos ligam, pedem endereço e ficam esperando. O r-escola ouve, mas não oferece nada.',
      'O estagiário garante que copiou a configuração do posto de saúde "quase igualzinha".',
      'Objetivo: os dois PCs com endereços diferentes na rede 192.168.70.0/24 entregues por DHCP, os dois pingando o prontuário (10.20.0.10) e a pergunta respondida.',
    ],
    dicas: [
      'Veja o servidor DHCP do r-escola e compare a faixa com o endereço da porta lan.',
      'A faixa está em 192.168.60.x, mas a lan é 192.168.70.1/24. Refaça o servidor com uma faixa 192.168.70.x.',
      'Depois peça DHCP nos dois PCs e faça ping no prontuário a partir de cada um.',
    ],
    perguntas: d95D,
    respostas: { '1': 'DHCPDISCOVER' },
    montar: () => mundoBairro({ semente: 3095, r: 'r-escola', lan: '192.168.70.0/24', wan: ['10.0.0.5', '10.0.0.6'], pcs: ['aluno-1', 'aluno-2'], dhcp: ['192.168.60.100', '192.168.60.150'] }),
    objetivo: (m) => {
      const a = ipDe(m, 'aluno-1');
      const b = ipDe(m, 'aluno-2');
      return [
        item('aluno-1 com endereço da rede 192.168.70.0/24', dentro(a, '192.168.70.0/24'), a ?? 'sem endereço'),
        item('aluno-2 com outro endereço da mesma rede', dentro(b, '192.168.70.0/24') && a !== b, b ?? 'sem endereço'),
        pingOk(m, 'aluno-1', '10.20.0.10'),
        pingOk(m, 'aluno-2', '10.20.0.10'),
        ...todasRespondidas(m, d95D),
      ];
    },
    solucao: [
      ['equip', 'r-escola', 'rot-dhcp', { porta: 'lan', inicio: '192.168.70.100', fim: '192.168.70.150', dns: '10.20.0.53', tempo: '3600' }],
      ['equip', 'aluno-1', 'dhcp'],
      ['equip', 'aluno-2', 'dhcp'],
      ['equip', 'aluno-1', 'ping', { destino: '10.20.0.10', n: '4' }],
      ['equip', 'aluno-2', 'ping', { destino: '10.20.0.10', n: '4' }],
    ],
  },
};

export const ATO4C: Dia[] = [dia88, dia89, dia95];
