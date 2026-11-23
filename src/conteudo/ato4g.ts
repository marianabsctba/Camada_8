// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// No anel de fibra e no data center municipal: MPLS (5.7.5) e OSPF (5.7.6).

import { acharPorta, adicionar, ligar, novoMundo, pc, roteador, TRANSCEPTORES, type Mundo } from '../motor/mundo';
import { calcularOspf, configOspf, criarLspMundo } from '../motor/protocolos';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

function traceRegistro(m: Mundo, de: string, ip: string): { chegou: boolean; saltos: (string | null)[] } | undefined {
  return m.flags.traceroutes?.[`${de}>${ip}`];
}

/** Caminho de rótulos montado para a FEC, como texto "a b c", ou undefined. */
function lsp(m: Mundo, fec: string): string | undefined {
  const r = (m.flags.mplsLsp ?? {})[fec] as string[] | undefined;
  return r ? r.join(' ') : undefined;
}

/** Último envio pelo MPLS: saiu inteiro, de onde, para onde e com que operações. */
function envioMpls(m: Mundo): { entrada: string; alvo: string; ok: boolean; operacoes: string[]; saida: string | null } | undefined {
  return m.flags.mpls;
}

/** Rota que o OSPF instalou no roteador para o destino (texto), com o próximo salto e a métrica. */
function rotaOspf(m: Mundo, r: string, destino: string): { via: string; metrica: number } | undefined {
  const rs = (m.equipamentos.get(r)!.s.rotasDinamicas ?? []) as { destino: string; via: string; origem: string; metrica: number }[];
  return rs.find((x) => x.origem === 'ospf' && x.destino === destino);
}

function ospfLigado(m: Mundo, r: string): boolean {
  return !!m.equipamentos.get(r)!.s.ospf?.ligado;
}

function abr(m: Mundo): string[] {
  return (m.flags.ospf?.abr ?? []) as string[];
}

/** Liga o OSPF num roteador já montado, com custos e áreas opcionais por porta. */
function prepararOspf(m: Mundo, r: string, o: { custos?: Record<string, number>; areas?: Record<string, number> } = {}): void {
  const cfg = configOspf(m.equipamentos.get(r)!);
  cfg.ligado = true;
  Object.assign(cfg.custos, o.custos ?? {});
  Object.assign(cfg.areas, o.areas ?? {});
}

/** Põe as duas pontas de um enlace numa placa mais lenta (só esta velocidade em comum). */
function enlaceLento(m: Mundo, a: [string, string], b: [string, string], mbps: number): void {
  for (const [eq, porta] of [a, b]) m.equipamentos.get(eq)!.portas.find((p) => p.nome === porta)!.velocidades = [mbps];
}

/** Põe um transceptor monomodo de 1 Gb/s nas duas pontas de cada fibra do anel. */
function sfpNasFibras(m: Mundo): void {
  for (const c of m.cabos.values()) {
    if (c.meio !== 'fibra') continue;
    for (const ponta of [c.a, c.b]) {
      const p = acharPorta(m, ponta);
      p.fisica = 'sfp';
      p.sfp = TRANSCEPTORES['LX-10'];
    }
  }
}

/* ======================================================================
 * ref 96: MPLS (5.7.5)
 * ====================================================================== */

const d96: Pergunta[] = [numerica('1', 'Que rótulo o pacote carrega no enlace entre o r-praca e o r-mercado?', 216, 0)];
const d96D: Pergunta[] = [
  numerica('1', 'Um pacote para 10.40.9.20 casa com duas FECs na borda-hosp, 10.40.0.0/16 e 10.40.9.0/24. Qual é o comprimento de prefixo da que vence?', 24, 0),
];

/** O anel do centro: escola atrás da borda-norte, data center atrás da borda-sul, dois lados do anel entre elas. */
function mundoAnelMpls(): Mundo {
  const m = novoMundo(496);
  m.flags.camadaRede = true;
  adicionar(m, pc('escola', { ip: cidr('10.30.0.10/24'), gateway: '10.30.0.1', modelo: 'PC da secretaria da escola' }));
  adicionar(m, pc('servidor-dc', { ip: cidr('10.40.0.25/24'), gateway: '10.40.0.1', modelo: 'Servidor do data center municipal' }));
  adicionar(m, roteador('borda-norte', { modelo: 'Roteador Anel 6 (borda norte)', interfaces: { escola: '10.30.0.1/24', praca: '10.0.11.1/30', represa: '10.0.14.1/30' } }));
  adicionar(m, roteador('r-praca', { modelo: 'Roteador Anel 4 (praça)', interfaces: { norte: '10.0.11.2/30', mercado: '10.0.12.1/30' } }));
  adicionar(m, roteador('r-mercado', { modelo: 'Roteador Anel 4 (mercado)', interfaces: { praca: '10.0.12.2/30', sul: '10.0.13.1/30' } }));
  adicionar(m, roteador('r-represa', { modelo: 'Roteador Anel 4 (represa)', interfaces: { norte: '10.0.14.2/30', sul: '10.0.15.1/30' } }));
  adicionar(m, roteador('borda-sul', { modelo: 'Roteador Anel 6 (borda sul)', interfaces: { mercado: '10.0.13.2/30', represa: '10.0.15.2/30', dc: '10.40.0.1/24' } }));
  ligar(m, { equip: 'escola', porta: 'eth0' }, { equip: 'borda-norte', porta: 'escola' }, 'cat6', 20, { id: 'c1' });
  ligar(m, { equip: 'borda-norte', porta: 'praca' }, { equip: 'r-praca', porta: 'norte' }, 'fibra', 900, { id: 'c2' });
  ligar(m, { equip: 'r-praca', porta: 'mercado' }, { equip: 'r-mercado', porta: 'praca' }, 'fibra', 700, { id: 'c3' });
  ligar(m, { equip: 'r-mercado', porta: 'sul' }, { equip: 'borda-sul', porta: 'mercado' }, 'fibra', 800, { id: 'c4' });
  ligar(m, { equip: 'borda-norte', porta: 'represa' }, { equip: 'r-represa', porta: 'norte' }, 'fibra', 1500, { id: 'c5' });
  ligar(m, { equip: 'r-represa', porta: 'sul' }, { equip: 'borda-sul', porta: 'represa' }, 'fibra', 1400, { id: 'c6' });
  ligar(m, { equip: 'borda-sul', porta: 'dc' }, { equip: 'servidor-dc', porta: 'eth0' }, 'cat6', 10, { id: 'c7' });
  m.proxCabo = 8;
  sfpNasFibras(m);
  return m;
}

/** O anel do hospital: um caminho curto pelo centro, já com rótulos, e um mais longo pela represa e pela usina. */
function mundoAnelHospital(): Mundo {
  const m = novoMundo(3096);
  m.flags.camadaRede = true;
  adicionar(m, pc('hospital', { ip: cidr('10.80.0.10/24'), gateway: '10.80.0.1', modelo: 'Servidor de exames do hospital' }));
  adicionar(m, pc('backup-dc', { ip: cidr('10.40.9.20/24'), gateway: '10.40.9.1', modelo: 'Servidor de cópias de segurança' }));
  adicionar(m, pc('prontuario', { ip: cidr('10.40.0.10/24'), gateway: '10.40.0.1', modelo: 'Servidor do prontuário municipal' }));
  adicionar(m, roteador('borda-hosp', { modelo: 'Roteador Anel 6 (borda do hospital)', interfaces: { lan: '10.80.0.1/24', centro: '10.0.21.1/30', represa: '10.0.23.1/30' } }));
  adicionar(m, roteador('r-centro', { modelo: 'Roteador Anel 4 (centro)', interfaces: { hosp: '10.0.21.2/30', dc: '10.0.22.1/30' } }));
  adicionar(m, roteador('r-represa', { modelo: 'Roteador Anel 4 (represa)', interfaces: { hosp: '10.0.23.2/30', usina: '10.0.24.1/30' } }));
  adicionar(m, roteador('r-usina', { modelo: 'Roteador Anel 4 (usina)', interfaces: { represa: '10.0.24.2/30', dc: '10.0.25.1/30' } }));
  adicionar(m, roteador('borda-dc', { modelo: 'Roteador Anel 6 (borda do data center)', interfaces: { centro: '10.0.22.2/30', usina: '10.0.25.2/30', prontuario: '10.40.0.1/24', backup: '10.40.9.1/24' } }));
  ligar(m, { equip: 'hospital', porta: 'eth0' }, { equip: 'borda-hosp', porta: 'lan' }, 'cat6', 15, { id: 'c1' });
  ligar(m, { equip: 'borda-hosp', porta: 'centro' }, { equip: 'r-centro', porta: 'hosp' }, 'fibra', 600, { id: 'c2' });
  ligar(m, { equip: 'r-centro', porta: 'dc' }, { equip: 'borda-dc', porta: 'centro' }, 'fibra', 500, { id: 'c3' });
  ligar(m, { equip: 'borda-hosp', porta: 'represa' }, { equip: 'r-represa', porta: 'hosp' }, 'fibra', 1800, { id: 'c4' });
  ligar(m, { equip: 'r-represa', porta: 'usina' }, { equip: 'r-usina', porta: 'represa' }, 'fibra', 1200, { id: 'c5' });
  ligar(m, { equip: 'r-usina', porta: 'dc' }, { equip: 'borda-dc', porta: 'usina' }, 'fibra', 1600, { id: 'c6' });
  ligar(m, { equip: 'borda-dc', porta: 'prontuario' }, { equip: 'prontuario', porta: 'eth0' }, 'cat6', 10, { id: 'c7' });
  ligar(m, { equip: 'borda-dc', porta: 'backup' }, { equip: 'backup-dc', porta: 'eth0' }, 'cat6', 10, { id: 'c8' });
  m.proxCabo = 9;
  sfpNasFibras(m);
  const rota = ['borda-hosp', 'r-centro', 'borda-dc'];
  criarLspMundo(m, rota, '10.40.0.0/16');
  m.flags.mplsLsp = { '10.40.0.0/16': rota };
  return m;
}

const dia96: Dia = {
  numero: 96,
  ato: 4,
  titulo: 'MPLS',
  chamado: [
    'CHAMADO #0096',
    'O anel de fibra do centro ficou pronto, e os roteadores do meio dele passam o dia fazendo a mesma coisa: pegar cada pacote da escola, ler o endereço de destino, procurar o prefixo mais longo na tabela e decidir. Milhares de vezes por segundo, sempre para o mesmo data center.',
    'A secretaria de tecnologia quer testar uma ideia velha das operadoras: decidir uma vez só, na entrada do anel, colar uma etiqueta no pacote e deixar o meio do caminho ler só a etiqueta.',
    'Objetivo: um caminho comutado por rótulos da borda-norte até a borda-sul para a rede do data center (10.40.0.0/24), pela praça e pelo mercado, um pacote enviado por ele e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Comutação por rótulos',
    texto: [
      'Num roteador IP comum, cada pacote é uma decisão nova: ler o destino de 32 bits, achar na tabela o prefixo mais longo que casa e escolher a porta. O MPLS (comutação de rótulos multiprotocolo) troca essa busca por uma consulta direta. Na entrada da rede, o roteador de borda põe na frente do pacote IP um rótulo, um número curto. Daí em diante, ninguém olha o IP: cada roteador lê o rótulo, consulta uma tabela pequena indexada por ele e manda adiante.',
      'O rótulo mora num cabeçalho de 4 bytes entre o quadro de enlace e o pacote IP, e por isso o MPLS ganhou o apelido de "camada 2,5". São 20 bits de rótulo, 3 de classe de tráfego, 1 bit que marca o fim da pilha e 8 bits de TTL. Pilha, sim: um pacote pode carregar vários rótulos, um em cima do outro, e cada roteador só olha o de cima. Os rótulos de 0 a 15 são reservados.',
      'Quem entra no mesmo caminho? Todos os pacotes de uma mesma classe de equivalência de encaminhamento, a FEC: um grupo de pacotes que vai ser tratado do mesmo jeito, quase sempre "tudo o que vai para tal prefixo". O roteador de borda de entrada classifica o pacote numa FEC e empilha o rótulo dela. Os roteadores do meio trocam o rótulo que chegou pelo rótulo que o próximo pediu (cada roteador numera os próprios rótulos, por isso o número muda a cada salto). O roteador de saída desempilha, e dali o pacote segue pelo IP normal. A sequência de roteadores dessa FEC é o caminho comutado por rótulos, o LSP.',
      'Ganhar velocidade na busca foi a motivação original, mas hoje o MPLS vale por outras duas coisas. Engenharia de tráfego: o LSP pode seguir o caminho que quem administra a rede escolher, não necessariamente o mais curto, e assim dá para tirar o backup pesado do enlace por onde passa a videochamada. E VPN: com dois rótulos na pilha, o de fora diz o caminho e o de dentro diz de qual cliente é o pacote, o que deixa a operadora carregar redes privadas de vários clientes, até com endereços repetidos, pelo mesmo núcleo.',
      'Neste laboratório, o comando de enviar mostra o pacote atravessando o caminho de rótulos, salto a salto, com a pilha em cada roteador. É uma simulação à parte: o ping continua seguindo pela tabela IP. E a numeração é de mentirinha didática: o i-ésimo roteador do caminho escolhe rótulos a partir de 16 + 100 vezes i, para a troca aparecer na tela.',
    ],
  },
  dicas: [
    'Comece vendo a tabela de rótulos da borda-norte: ela está vazia.',
    'O caminho é montado na borda de entrada, dizendo os roteadores seguintes em ordem, até a borda de saída.',
    'Na borda-norte, monte o caminho para 10.40.0.0/24 com "r-praca r-mercado borda-sul" e mande um pacote para 10.40.0.25. Para a pergunta: o r-praca troca 116 por quanto?',
  ],
  perguntas: d96,
  montar: mundoAnelMpls,
  objetivo: (m) => {
    const c = lsp(m, '10.40.0.0/24');
    const e = envioMpls(m);
    return [
      item('caminho de rótulos para 10.40.0.0/24: borda-norte, r-praca, r-mercado, borda-sul', c === 'borda-norte r-praca r-mercado borda-sul', c ?? 'ainda não foi montado'),
      item(
        'pacote para 10.40.0.25 pelo caminho: empilhar, trocar, trocar, desempilhar',
        !!e && e.ok && e.alvo === '10.40.0.25' && e.saida === 'borda-sul' && e.operacoes.join(' ') === 'empilhar trocar trocar desempilhar',
        e ? `${e.operacoes.join(', ') || 'nada'}, saída ${e.saida ?? 'nenhuma'}` : 'ainda não foi enviado',
      ),
      ...todasRespondidas(m, d96),
    ];
  },
  posMorte: [
    'A borda-norte foi a única que pensou de verdade. Viu o pacote para 10.40.0.25, achou a FEC 10.40.0.0/24 e empilhou o rótulo 116, que é o número que o r-praca escolheu para aquela FEC. O r-praca leu só o 116, trocou por 216 (o número do r-mercado) e passou adiante; o r-mercado trocou 216 por 316 (o da borda-sul). A borda-sul desempilhou e entregou o pacote ao IP, que o levou ao data center. No meio do anel, ninguém abriu o cabeçalho IP.',
    'Repare que o rótulo não é um endereço: vale só num enlace, entre dois vizinhos, e por isso muda a cada salto. Quem decide o número é o roteador de baixo, que diz ao de cima "para esta FEC, me mande com o rótulo tal". Na vida real, um protocolo de distribuição de rótulos faz essa conversa sozinho; aqui o comando de montar o caminho fez tudo de uma vez.',
    'E o caminho foi escolhido por você, não por um algoritmo. O outro lado do anel, pela represa, também chegava à borda-sul, e um caminho de rótulos para outra FEC poderia ir por lá. É essa liberdade que faz das operadoras grandes fãs do MPLS: tráfego pesado de um lado, tráfego sensível do outro, e redes privadas de clientes diferentes passando no mesmo núcleo, cada uma com o próprio rótulo.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'borda-norte'],
      acao: 'rot-mpls-ver',
      instrucao: 'Veja a tabela de rótulos da borda-norte.',
      porque: 'Cada roteador do MPLS tem uma tabela de encaminhamento por rótulo: rótulo que chega, operação, rótulo que sai e próximo roteador. Ela é bem menor que a tabela de rotas IP.',
      feito: 'Vazia. Por enquanto a borda-norte só sabe rotear pelo IP: ler o destino, procurar o prefixo, decidir.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Todos os pacotes com destino dentro de 10.40.0.0/24, qualquer que seja a máquina: eles formam uma FEC',
          'Só os pacotes para 10.40.0.25, com um caminho separado para cada máquina',
          'Todos os pacotes que entram pela porta da escola, seja qual for o destino',
          'Só os pacotes grandes, porque os pequenos não compensam o rótulo',
        ],
        certa: 0,
        errada: {
          1: 'Funcionaria, mas seria um caminho por máquina: centenas de rótulos para levar tudo ao mesmo lugar pelo mesmo trajeto. A FEC junta quem é tratado igual.',
          2: 'Pacotes da escola para a internet e para o data center saem pela mesma porta, mas não vão para o mesmo lugar. A FEC agrupa pelo tratamento, e aqui o tratamento depende do destino.',
          3: 'O tamanho não muda o trajeto. O rótulo custa 4 bytes em qualquer pacote e economiza a busca em todos.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que pacotes devem entrar no caminho de rótulos até o data center?',
      porque: 'FEC é a classe de equivalência de encaminhamento: o conjunto de pacotes que recebe o mesmo tratamento e, portanto, o mesmo rótulo. Quase sempre é definida por um prefixo de destino.',
      feito: 'Uma FEC só, 10.40.0.0/24, e todo pacote que casar com ela ganha o mesmo rótulo na entrada.',
    }),
    passo({
      alvo: ['equip', 'borda-norte'],
      acao: 'rot-mpls-lsp',
      valores: { fec: '10.40.0.0/24' },
      pedir: ['rota'],
      exemplo: { rota: 'r-praca r-mercado borda-sul' },
      instrucao: 'Na borda-norte, monte o caminho de rótulos para 10.40.0.0/24 pela praça e pelo mercado, até a borda-sul.',
      porque: 'O caminho é a lista dos roteadores seguintes, em ordem, cada um vizinho do anterior. A borda-norte empilha, o r-praca e o r-mercado trocam, a borda-sul desempilha.',
      conferir: (m) => {
        const c = lsp(m, '10.40.0.0/24');
        if (c === 'borda-norte r-praca r-mercado borda-sul') return true;
        if (c?.includes('r-represa')) return 'Esse é o outro lado do anel, pela represa. Também chega, mas o chamado pede o caminho pela praça e pelo mercado.';
        return 'O caminho não foi montado. Liste os roteadores depois da borda-norte, em ordem e separados por espaço: cada um precisa ser vizinho do anterior.';
      },
      feito: 'Caminho montado: borda-norte > r-praca > r-mercado > borda-sul. Cada roteador ganhou uma linha na tabela para essa FEC.',
    }),
    passo({
      alvo: ['equip', 'borda-norte'],
      acao: 'rot-mpls-enviar',
      valores: { destino: '10.40.0.25' },
      instrucao: 'Mande um pacote da borda-norte para o servidor do data center, 10.40.0.25, pelo MPLS.',
      porque: 'A borda-norte procura a FEC do destino (10.40.0.25 cai em 10.40.0.0/24), empilha o rótulo e entrega ao r-praca. A partir daí, só o rótulo do topo importa.',
      conferir: (m) => {
        const e = envioMpls(m);
        return e?.ok && e.saida === 'borda-sul' ? true : 'O pacote não atravessou o caminho de rótulos. Confira se o caminho foi montado e se o destino é 10.40.0.25.';
      },
      feito: 'Pilha vazia, depois [116], [216], [316] e vazia de novo: empilhar na borda-norte, trocar no r-praca, trocar no r-mercado, desempilhar na borda-sul.',
    }),
    passo({
      alvo: ['equip', 'r-mercado'],
      acao: 'rot-mpls-ver',
      instrucao: 'Agora veja a tabela de rótulos do r-mercado, no meio do anel.',
      porque: 'Um roteador do meio não tem FEC nem prefixo para procurar: tem uma linha por rótulo de entrada, com o rótulo de saída e o próximo roteador.',
      feito: 'Uma linha: chega 216, troca por 316, manda para a borda-sul. Uma consulta direta, sem procurar prefixo mais longo em tabela nenhuma.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '216' },
      instrucao: 'Que rótulo o pacote carrega no enlace entre o r-praca e o r-mercado?',
      porque: 'O rótulo vale só num enlace. Quem escolhe o número é o roteador que vai receber: o r-praca põe no pacote o rótulo que o r-mercado pediu.',
      feito: '216, o número do r-mercado. Na entrada do r-praca era 116, na saída do r-mercado será 316. Mesmo pacote, três rótulos.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Uma etiqueta na entrada',
        texto: ['A borda de entrada decide uma vez e cola o rótulo. Os do meio trocam o rótulo a cada salto. A borda de saída tira o rótulo e devolve o pacote ao IP.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'e', rotulo: 'escola', x: 40, y: 120 },
            { id: 'bn', rotulo: 'borda-norte (empilha)', x: 150, y: 120 },
            { id: 'p', rotulo: 'r-praca (troca)', x: 270, y: 50 },
            { id: 'me', rotulo: 'r-mercado (troca)', x: 410, y: 50 },
            { id: 'r', rotulo: 'r-represa', x: 340, y: 200 },
            { id: 'bs', rotulo: 'borda-sul (desempilha)', x: 530, y: 120 },
            { id: 'dc', rotulo: 'data center', x: 640, y: 120 },
          ],
          ligacoes: [
            ['e', 'bn', 'IP'],
            ['bn', 'p', 'rótulo 116'],
            ['p', 'me', 'rótulo 216'],
            ['me', 'bs', 'rótulo 316'],
            ['bn', 'r'],
            ['r', 'bs'],
            ['bs', 'dc', 'IP'],
          ],
        },
      },
      {
        titulo: 'Onde mora o rótulo',
        texto: [
          'Um cabeçalho de 4 bytes entre o enlace e o IP: 20 bits de rótulo, 3 de classe de tráfego, 1 de fim de pilha e 8 de TTL. Pode haver vários, empilhados; cada roteador só lê o de cima.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['cabeçalho Ethernet', 'rótulo MPLS: rótulo (20 bits), classe (3), fim de pilha (1), TTL (8)', 'cabeçalho IP: 10.30.0.10 para 10.40.0.25', 'TCP, UDP ou ICMP', 'dados'],
          rotulo: 'entre a camada 2 e a 3: a "camada 2,5"',
        },
      },
      {
        titulo: 'Empilhar, trocar, desempilhar',
        texto: ['A FEC é o grupo de pacotes tratados igual, quase sempre um prefixo de destino. A sequência de roteadores dela é o LSP, o caminho comutado por rótulos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Roteador', 'Chega', 'Operação', 'Sai', 'Próximo'],
          linhas: [
            ['borda-norte', 'IP para 10.40.0.0/24', 'empilhar', '116', 'r-praca'],
            ['r-praca', '116', 'trocar', '216', 'r-mercado'],
            ['r-mercado', '216', 'trocar', '316', 'borda-sul'],
            ['borda-sul', '316', 'desempilhar', 'IP', 'data center'],
          ],
        },
      },
      {
        titulo: 'Por que vale a pena',
        texto: ['A busca rápida foi o motivo original. Hoje o que pesa é a liberdade de escolher o caminho e de separar tráfegos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Roteamento IP', 'Comutação por rótulo'],
          linhas: [
            ['o que cada roteador lê', 'o destino de 32 bits', 'só o rótulo do topo'],
            ['como decide', 'prefixo mais longo na tabela inteira', 'consulta direta pelo número do rótulo'],
            ['quem escolhe o caminho', 'o protocolo de roteamento, salto a salto', 'a borda de entrada, para a FEC inteira'],
            ['caminho diferente do mais curto', 'difícil', 'é só montar outro LSP: engenharia de tráfego'],
          ],
        },
      },
      {
        titulo: 'VPN com dois rótulos',
        texto: [
          'Com dois rótulos na pilha, o de fora leva o pacote pelo núcleo e o de dentro diz de qual cliente ele é. Duas empresas podem usar o mesmo 10.0.0.0/8 sem se misturar: quem separa é o rótulo, não o endereço.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['rótulo de fora: o caminho pelo anel, trocado a cada salto', 'rótulo de dentro: qual VPN, lido só na saída', 'pacote IP do cliente, com o endereço privado dele'],
          rotulo: 'a pilha de um pacote de VPN no meio do núcleo',
        },
      },
    ],
    checagem: {
      pergunta: 'No meio do anel, o r-mercado recebe um pacote com rótulo 216. O que ele consulta para decidir para onde mandar?',
      opcoes: [
        'Só o rótulo 216, na tabela de rótulos',
        'O endereço IP de destino, procurando o prefixo mais longo',
        'O endereço IP de origem, para saber de que escola veio',
        'O rótulo e o IP, para conferir um com o outro',
      ],
      certa: 0,
      explicacao: 'No meio do caminho de rótulos, ninguém abre o cabeçalho IP. O rótulo do topo é a chave da tabela: 216 chega, 316 sai, para a borda-sul. Só a borda de entrada olhou o IP para escolher a FEC.',
    },
  },
  desafio: {
    carta: [
      'O hospital faz backup dos exames toda noite no servidor de cópias do data center (10.40.9.20). Hoje tudo o que vai para o data center, 10.40.0.0/16, segue um caminho de rótulos pelo r-centro, o mesmo da videochamada da telemedicina. Às 22 h, quando o backup começa, a consulta da dermatologista congela no meio do "agora mostre a pinta".',
      'A engenharia quer o backup pelo outro lado do anel, pela represa e pela usina, sem mexer no caminho do resto.',
      'Objetivo: um caminho de rótulos só para a rede do backup, 10.40.9.0/24, da borda-hosp até a borda-dc pela represa e pela usina, um pacote para 10.40.9.20 enviado por ele e a pergunta respondida.',
    ],
    dicas: [
      'Veja a tabela de rótulos da borda-hosp: o caminho que existe é para a FEC 10.40.0.0/16 inteira.',
      'Uma FEC mais específica, 10.40.9.0/24, pode ter o próprio caminho. Na borda-hosp, monte-o com "r-represa r-usina borda-dc".',
      'Depois mande um pacote para 10.40.9.20 pela borda-hosp. Entre duas FECs que casam, vence o prefixo mais longo.',
    ],
    perguntas: d96D,
    respostas: { '1': '24' },
    montar: mundoAnelHospital,
    objetivo: (m) => {
      const c = lsp(m, '10.40.9.0/24');
      const e = envioMpls(m);
      return [
        item('caminho de rótulos para 10.40.9.0/24: borda-hosp, r-represa, r-usina, borda-dc', c === 'borda-hosp r-represa r-usina borda-dc', c ?? 'ainda não foi montado'),
        item('o caminho do resto (10.40.0.0/16) continua pelo r-centro', lsp(m, '10.40.0.0/16') === 'borda-hosp r-centro borda-dc'),
        item(
          'pacote para 10.40.9.20 enviado pela borda-hosp, saindo na borda-dc com duas trocas no meio',
          !!e && e.ok && e.entrada === 'borda-hosp' && e.alvo === '10.40.9.20' && e.saida === 'borda-dc' && e.operacoes.filter((x) => x === 'trocar').length === 2,
          e ? `${e.operacoes.join(', ') || 'nada'}, saída ${e.saida ?? 'nenhuma'}` : 'ainda não foi enviado',
        ),
        ...todasRespondidas(m, d96D),
      ];
    },
    solucao: [
      ['equip', 'borda-hosp', 'rot-mpls-lsp', { fec: '10.40.9.0/24', rota: 'r-represa r-usina borda-dc' }],
      ['equip', 'borda-hosp', 'rot-mpls-enviar', { destino: '10.40.9.20' }],
    ],
  },
};

/* ======================================================================
 * ref 97: OSPF (5.7.6)
 * ====================================================================== */

const d97: Pergunta[] = [numerica('1', 'Depois do ajuste, qual é a métrica OSPF da rota do r-leste para a rede do data center, 10.50.0.0/24?', 12, 0)];
const d97D: Pergunta[] = [numerica('1', 'Com o custo corrigido, qual é a métrica OSPF da rota do r-hosp para 10.50.0.0/24?', 2, 0)];

/**
 * O anel da cidade: data center no r-centro, escola no r-leste, dois caminhos entre eles (norte, por um enlace
 * antigo de 10 Mb/s, e sul, pelo r-sul novo) e a represa pendurada no r-norte, já configurada na área 1.
 */
function mundoAnelOspf(): Mundo {
  const m = novoMundo(497);
  m.flags.camadaRede = true;
  adicionar(m, pc('servidor', { ip: cidr('10.50.0.10/24'), gateway: '10.50.0.1', modelo: 'Servidor do data center municipal' }));
  adicionar(m, pc('escola', { ip: cidr('10.60.0.10/24'), gateway: '10.60.0.1', modelo: 'PC da secretaria da escola' }));
  adicionar(m, pc('usina', { ip: cidr('10.70.0.10/24'), gateway: '10.70.0.1', modelo: 'PC da sala de controle da usina' }));
  adicionar(m, roteador('r-centro', { modelo: 'Roteador Anel 6 (data center)', interfaces: { dc: '10.50.0.1/24', norte: '10.0.1.1/30', sul: '10.0.2.1/30' } }));
  adicionar(m, roteador('r-norte', { modelo: 'Roteador Anel 6 (norte)', interfaces: { centro: '10.0.1.2/30', leste: '10.0.3.1/30', represa: '10.0.5.1/30' } }));
  adicionar(m, roteador('r-sul', { modelo: 'Roteador Anel 4 (sul, recém-instalado)', interfaces: { centro: '10.0.2.2/30', leste: '10.0.4.1/30' } }));
  adicionar(m, roteador('r-leste', { modelo: 'Roteador Anel 4 (leste)', interfaces: { norte: '10.0.3.2/30', sul: '10.0.4.2/30', escola: '10.60.0.1/24' } }));
  adicionar(m, roteador('r-represa', { modelo: 'Roteador Anel 4 (represa)', interfaces: { norte: '10.0.5.2/30', usina: '10.70.0.1/24' } }));
  ligar(m, { equip: 'r-centro', porta: 'dc' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 5, { id: 'c1' });
  ligar(m, { equip: 'r-centro', porta: 'norte' }, { equip: 'r-norte', porta: 'centro' }, 'fibra', 1200, { id: 'c2' });
  ligar(m, { equip: 'r-centro', porta: 'sul' }, { equip: 'r-sul', porta: 'centro' }, 'fibra', 1100, { id: 'c3' });
  ligar(m, { equip: 'r-norte', porta: 'leste' }, { equip: 'r-leste', porta: 'norte' }, 'cat5e', 90, {
    id: 'c4',
    nota: 'Enlace antigo entre o norte e o leste: as placas dos dois lados só falam 10 Mb/s.',
  });
  ligar(m, { equip: 'r-sul', porta: 'leste' }, { equip: 'r-leste', porta: 'sul' }, 'fibra', 1300, { id: 'c5' });
  ligar(m, { equip: 'r-leste', porta: 'escola' }, { equip: 'escola', porta: 'eth0' }, 'cat6', 20, { id: 'c6' });
  ligar(m, { equip: 'r-norte', porta: 'represa' }, { equip: 'r-represa', porta: 'norte' }, 'fibra', 4000, { id: 'c7' });
  ligar(m, { equip: 'r-represa', porta: 'usina' }, { equip: 'usina', porta: 'eth0' }, 'cat6', 15, { id: 'c8' });
  m.proxCabo = 9;
  sfpNasFibras(m);
  enlaceLento(m, ['r-norte', 'leste'], ['r-leste', 'norte'], 10);
  for (const r of ['r-centro', 'r-norte', 'r-leste']) prepararOspf(m, r);
  prepararOspf(m, 'r-represa', { areas: { norte: 1, usina: 1 } });
  calcularOspf(m);
  return m;
}

/** O anel do hospital: caminho direto pelo r-centro, um custo esquecido de um teste e a vila nova na área 2. */
function mundoAnelOspfHospital(): Mundo {
  const m = novoMundo(3097);
  m.flags.camadaRede = true;
  adicionar(m, pc('servidor', { ip: cidr('10.50.0.10/24'), gateway: '10.50.0.1', modelo: 'Servidor do data center municipal' }));
  adicionar(m, pc('hospital', { ip: cidr('10.80.0.10/24'), gateway: '10.80.0.1', modelo: 'Servidor de exames do hospital' }));
  adicionar(m, pc('posto-vila', { ip: cidr('10.90.0.10/24'), gateway: '10.90.0.1', modelo: 'PC do posto de saúde da vila' }));
  adicionar(m, roteador('r-centro', { modelo: 'Roteador Anel 6 (data center)', interfaces: { dc: '10.50.0.1/24', hosp: '10.1.1.1/30', porto: '10.1.2.1/30' } }));
  adicionar(m, roteador('r-hosp', { modelo: 'Roteador Anel 4 (hospital)', interfaces: { centro: '10.1.1.2/30', porto: '10.1.3.1/30', lan: '10.80.0.1/24' } }));
  adicionar(m, roteador('r-porto', { modelo: 'Roteador Anel 6 (porto)', interfaces: { centro: '10.1.2.2/30', hosp: '10.1.3.2/30', vila: '10.1.4.1/30' } }));
  adicionar(m, roteador('r-vila', { modelo: 'Roteador Anel 4 (vila)', interfaces: { porto: '10.1.4.2/30', lan: '10.90.0.1/24' } }));
  ligar(m, { equip: 'r-centro', porta: 'dc' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 5, { id: 'c1' });
  ligar(m, { equip: 'r-centro', porta: 'hosp' }, { equip: 'r-hosp', porta: 'centro' }, 'fibra', 800, { id: 'c2' });
  ligar(m, { equip: 'r-centro', porta: 'porto' }, { equip: 'r-porto', porta: 'centro' }, 'fibra', 2100, { id: 'c3' });
  ligar(m, { equip: 'r-hosp', porta: 'porto' }, { equip: 'r-porto', porta: 'hosp' }, 'fibra', 1900, { id: 'c4' });
  ligar(m, { equip: 'r-hosp', porta: 'lan' }, { equip: 'hospital', porta: 'eth0' }, 'cat6', 15, { id: 'c5' });
  ligar(m, { equip: 'r-porto', porta: 'vila' }, { equip: 'r-vila', porta: 'porto' }, 'fibra', 5200, { id: 'c6' });
  ligar(m, { equip: 'r-vila', porta: 'lan' }, { equip: 'posto-vila', porta: 'eth0' }, 'cat6', 10, { id: 'c7' });
  m.proxCabo = 8;
  sfpNasFibras(m);
  prepararOspf(m, 'r-centro');
  prepararOspf(m, 'r-hosp', { custos: { centro: 500 } });
  prepararOspf(m, 'r-porto');
  prepararOspf(m, 'r-vila', { areas: { porto: 2, lan: 2 } });
  calcularOspf(m);
  return m;
}

const dia97: Dia = {
  numero: 97,
  ato: 4,
  titulo: 'OSPF',
  chamado: [
    'CHAMADO #0097',
    'O anel inteiro da cidade já roda OSPF, menos o r-sul, que chegou ontem e ainda está com o protocolo desligado. Enquanto isso, a escola fala com o data center pelo enlace antigo do norte, de 10 Mb/s, e o professor de geografia diz que o mapa-múndi "carrega por continente".',
    'Tem mais: a fibra do sul passa pela obra do viaduto, e a prefeitura quer o tráfego da escola fora dela até a obra acabar. E a usina, atrás do r-represa, configurada pela empreiteira "na área 1, como manda o figurino", não fala com ninguém.',
    'Objetivo: OSPF ligado no r-sul, a escola chegando ao data center pelo norte por causa do custo, a represa na área 1 com o r-norte de borda, a usina alcançando o servidor e a pergunta respondida.',
  ],
  manual: {
    titulo: 'O protocolo de estado de enlace da cidade',
    texto: [
      'Dentro de uma rede com um dono só, como a da prefeitura, o roteamento é feito por um protocolo de gateway interior. O mais usado é o OSPF (abrir primeiro o caminho mais curto), um protocolo de estado de enlace aberto, de padrão público. Cada roteador descobre os vizinhos, mede o custo de cada enlace, conta isso a todos por inundação e roda o Dijkstra num mapa que é igual em todos os roteadores da área. Diferente do vetor de distância, ninguém acredita no que o vizinho acha: cada um calcula o próprio caminho com o mapa inteiro na mão.',
      'O custo é por interface e por sentido. Por padrão vale 10^8 dividido pela velocidade em bit/s, no mínimo 1: um enlace de 10 Mb/s custa 10, um de 100 Mb/s ou mais custa 1. Mas quem administra pode pôr o número que quiser, de 1 a 65535. Subir o custo de uma porta afasta o tráfego dela; é o jeito mais simples de engenharia de tráfego no OSPF. Como cada roteador põe custo nas próprias portas, a ida e a volta de uma conversa podem seguir caminhos diferentes.',
      'Rede grande demais vira problema: banco de estado de enlace enorme, Dijkstra pesado e uma queda no canto da cidade fazendo todo mundo recalcular. Por isso o OSPF divide a rede em áreas. Dentro de uma área, todos têm o mapa detalhado dela; de fora, só chegam resumos. A área 0 é o backbone, e toda área precisa se ligar a ela: o tráfego entre duas áreas sempre passa pela 0. O roteador que tem portas na área 0 e em outra é o roteador de borda de área (ABR), que resume uma para a outra. E as duas pontas de um enlace precisam estar na mesma área, ou o hello não fecha e a vizinhança não nasce.',
      'Tudo isso anda em poucas mensagens, levadas direto sobre o IP. O hello descobre os vizinhos e confirma, de tempos em tempos, que continuam vivos. Ao fazer vizinhança, os dois trocam a descrição do banco: a lista dos anúncios que cada um tem, com número de sequência. Quem vê que está faltando algo manda um pedido de estado de enlace, e o outro responde com uma atualização de estado de enlace, que é também a mensagem usada para inundar mudanças; cada atualização recebe uma confirmação. No OSPF os anúncios se chamam LSA; o laboratório mostra o banco com o nome genérico, LSP.',
      'Numa rede de difusão, como um switch com dez roteadores pendurados, cada um fazendo vizinhança completa com todos daria 45 pares trocando banco. O OSPF elege um roteador designado (DR), e um reserva (BDR): todo mundo sincroniza só com eles, e o DR fala pela rede no mapa. Este laboratório não simula a eleição; aqui os enlaces entre roteadores são pares diretos, e os temporizadores do hello também ficam de fora: a queda é percebida na hora.',
    ],
  },
  dicas: [
    'Comece ligando o OSPF no r-sul e rode um traceroute da escola para o servidor (10.50.0.10).',
    'Para tirar o tráfego da escola do sul, suba o custo da porta sul do r-leste até o caminho do norte (10 + 1) ficar mais barato.',
    'A represa está na área 1 dos dois lados do r-represa. A porta represa do r-norte continua na 0: ponha-a na área 1. Para a pergunta: 10 do enlace antigo, 1 até o centro e 1 da rede do data center.',
  ],
  perguntas: d97,
  montar: mundoAnelOspf,
  objetivo: (m) => {
    const r = rotaOspf(m, 'r-leste', '10.50.0.0/24');
    const tr = traceRegistro(m, 'escola', '10.50.0.10');
    return [
      item('OSPF ligado no r-sul', ospfLigado(m, 'r-sul')),
      item('rota do r-leste para 10.50.0.0/24 pelo norte (via 10.0.3.1), com o sul ligado', ospfLigado(m, 'r-sul') && r?.via === '10.0.3.1', r ? `via ${r.via}, métrica ${r.metrica}` : 'sem rota OSPF'),
      item('traceroute da escola ao servidor passando pelo r-norte', !!tr && tr.chegou && tr.saltos.includes('10.0.3.1'), tr ? tr.saltos.map((x) => x ?? '*').join(' > ') : 'ainda não foi feito'),
      item('r-norte como roteador de borda de área (áreas 0 e 1)', abr(m).includes('r-norte'), abr(m).join(', ') || 'nenhum'),
      pingOk(m, 'usina', '10.50.0.10'),
      ...todasRespondidas(m, d97),
    ];
  },
  posMorte: [
    'Com o r-sul ligado, os vizinhos dele ouviram o hello, trocaram a descrição do banco, pediram o que faltava e receberam as atualizações. Em seguida todos rodaram o Dijkstra de novo e acharam um caminho melhor para a escola: pelo sul, custo 1 + 1 até o centro, contra 10 + 1 pelo enlace antigo. Ninguém configurou rota; o mapa mudou e a decisão veio sozinha.',
    'Aí entrou a obra. Subir o custo da porta sul do r-leste para 50 fez o caminho do sul custar 51 e o do norte voltar a ganhar com 11; somando a rede do data center, a métrica ficou em 12. Só que o custo vale por sentido: o r-centro continua vendo o sul barato e manda a resposta por lá. Ida pelo norte, volta pelo sul. Se a obra cortar a fibra, o OSPF percebe e desvia; para tirar também a volta, seria preciso subir o custo no r-centro, ou no r-sul.',
    'A usina estava muda porque as duas pontas do enlace não concordavam: o r-represa dizia área 1 e o r-norte dizia área 0, e com áreas diferentes o hello não fecha. Com a porta do r-norte na área 1, ele passou a ter um pé em cada área e virou roteador de borda: dentro da área 1 só existe o r-represa, que recebe do r-norte um resumo do resto da cidade, e a área 0 recebe o resumo da usina. A rota da usina chega ao r-centro marcada como "entre áreas".',
  ],
  passos: [
    passo({
      alvo: ['equip', 'r-sul'],
      acao: 'rot-ospf',
      valores: { estado: 'on' },
      instrucao: 'Ligue o OSPF no r-sul, o roteador recém-instalado.',
      porque: 'Ao ligar, o r-sul manda hello pelas interfaces. Quem responde vira vizinho, os dois sincronizam o banco de estado de enlace e o anúncio novo é inundado pela área.',
      conferir: (m) => (ospfLigado(m, 'r-sul') ? true : 'O OSPF do r-sul continua desligado.'),
      feito: 'Dois vizinhos, o r-centro e o r-leste. O mapa da área 0 ganhou um roteador e dois enlaces de fibra, e todo mundo recalculou.',
    }),
    passo({
      alvo: ['equip', 'escola'],
      acao: 'traceroute',
      valores: { destino: '10.50.0.10' },
      instrucao: 'Rode um traceroute da escola até o servidor do data center (10.50.0.10).',
      porque: 'O traceroute mostra o caminho que o OSPF escolheu. Pelo norte, o custo até o centro é 10 (enlace de 10 Mb/s) + 1; pelo sul, 1 + 1.',
      conferir: (m) => (traceRegistro(m, 'escola', '10.50.0.10')?.chegou ? true : 'O traceroute não chegou ao servidor.'),
      feito: 'O caminho agora passa pelo r-sul (10.0.4.1). O enlace antigo do norte ficou de reserva sem ninguém mandar.',
    }),
    passo({
      alvo: ['equip', 'r-leste'],
      acao: 'rot-ospf-custo',
      valores: { porta: 'sul' },
      pedir: ['custo'],
      exemplo: { custo: '50' },
      instrucao: 'No r-leste, suba o custo OSPF da porta sul o suficiente para o caminho do norte voltar a ganhar.',
      porque: 'O caminho do norte custa 10 + 1 = 11 até o r-centro. O do sul custa o custo da porta sul do r-leste mais 1. Para o norte ganhar, o sul precisa passar de 11.',
      conferir: (m) => {
        const r = rotaOspf(m, 'r-leste', '10.50.0.0/24');
        if (r?.via === '10.0.3.1') return true;
        const c = m.equipamentos.get('r-leste')!.s.ospf?.custos?.sul as number | undefined;
        return c !== undefined && c <= 10
          ? `Com custo ${c}, o sul ainda custa ${c + 1} contra 11 do norte${c === 10 ? ': empate, e no empate o desempate não é seu' : ''}. Suba mais.`
          : 'A rota do r-leste para o data center ainda não vai pelo norte. Ajuste o custo da porta sul.';
      },
      feito: 'O Dijkstra rodou de novo: sul agora custa mais que 11, e a rota do r-leste para 10.50.0.0/24 passou para 10.0.3.1, o r-norte.',
    }),
    passo({
      alvo: ['equip', 'escola'],
      acao: 'traceroute',
      valores: { destino: '10.50.0.10' },
      instrucao: 'Repita o traceroute da escola até o servidor.',
      porque: 'Nenhuma rota foi digitada. Mudou só um número numa porta, e o mapa recalculado mudou o caminho.',
      conferir: (m) => (traceRegistro(m, 'escola', '10.50.0.10')?.saltos.includes('10.0.3.1') ? true : 'O traceroute ainda não passa pelo r-norte (10.0.3.1).'),
      feito: 'Pelo r-norte, mais lento, mas fora da obra. A resposta do servidor, porém, ainda volta pelo sul: o custo que você mudou vale só para quem sai pelo r-leste.',
    }),
    passo({
      escolha: {
        opcoes: [
          'As duas pontas do enlace estão em áreas diferentes: o r-represa na 1 e o r-norte na 0, e o hello não fecha',
          'A área 1 não pode existir sem uma área 2',
          'O enlace da represa é longo demais para o OSPF',
          'O r-represa precisa do OSPF desligado para ficar na área 1',
        ],
        certa: 0,
        errada: {
          1: 'As áreas não precisam vir em sequência. O que toda área precisa é de um roteador de borda ligado à área 0.',
          2: 'São 4000 m de fibra, com o enlace de pé. Distância não entra no OSPF; o que entra é o custo, e esse enlace custa 1.',
          3: 'Com o OSPF desligado ele não fala com ninguém de vez. O protocolo está ligado, só não concorda com o vizinho.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o r-represa não vira vizinho do r-norte?',
      porque: 'O hello carrega o número da área. Se os dois lados do enlace dizem áreas diferentes, cada um recusa o hello do outro, e sem vizinhança não há troca de banco nem rota.',
      feito: 'Área diferente nas pontas é um dos erros mais comuns do OSPF. O OSPF do r-norte até avisa, na tela dele: "o hello não fecha e não vira vizinho".',
    }),
    passo({
      alvo: ['equip', 'r-norte'],
      acao: 'rot-ospf-area',
      valores: { porta: 'represa' },
      pedir: ['area'],
      exemplo: { area: '1' },
      instrucao: 'No r-norte, ponha a porta represa na mesma área do r-represa.',
      porque: 'Com a porta represa na área 1 e as outras na 0, o r-norte fica com um pé em cada área: vira roteador de borda e resume uma para a outra.',
      conferir: (m) => (abr(m).includes('r-norte') ? true : 'O r-norte ainda não é roteador de borda. A porta represa precisa estar na área do r-represa, a 1.'),
      feito: 'Vizinhança feita na área 1, e o r-norte é ABR. A área 1 tem um mapa de dois roteadores; o resto da cidade chega a ela como resumo.',
    }),
    passo({
      alvo: ['equip', 'usina'],
      acao: 'ping',
      valores: { destino: '10.50.0.10', n: '4' },
      instrucao: 'Da usina, faça ping no servidor do data center.',
      porque: 'Ida: o r-represa recebeu do ABR o resumo com 10.50.0.0/24. Volta: o r-centro recebeu, pela área 0, o resumo da rede da usina.',
      conferir: (m) => pingOk(m, 'usina', '10.50.0.10').ok || 'O ping da usina ainda não voltou inteiro.',
      feito: 'Quatro respostas. No r-centro, a rota 10.70.0.0/24 aparece como "entre áreas, área 0": ele não conhece o mapa da área 1, só o resumo.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '12' },
      instrucao: 'Qual é agora a métrica OSPF da rota do r-leste para 10.50.0.0/24?',
      porque: 'A métrica soma o custo de cada porta de saída no caminho, mais o custo da rede de destino na porta do roteador que a anuncia.',
      feito: '10 do enlace antigo, 1 do r-norte ao r-centro e 1 da rede do data center: 12. A tabela de rotas do r-leste mostra o mesmo número.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O mapa inteiro em cada roteador',
        texto: [
          'O OSPF é um protocolo de gateway interior de estado de enlace: cada roteador anuncia os próprios vizinhos e custos, o anúncio é inundado pela área e todos rodam o Dijkstra no mesmo mapa.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'r-centro (data center)', x: 330, y: 40 },
            { id: 'n', rotulo: 'r-norte', x: 140, y: 130 },
            { id: 's', rotulo: 'r-sul', x: 520, y: 130 },
            { id: 'l', rotulo: 'r-leste (escola)', x: 330, y: 220 },
            { id: 'r', rotulo: 'r-represa', x: 40, y: 220 },
          ],
          ligacoes: [
            ['c', 'n', 'custo 1'],
            ['c', 's', 'custo 1'],
            ['n', 'l', 'custo 10 (10 Mb/s)'],
            ['s', 'l', 'custo 1'],
            ['n', 'r', 'área 1'],
          ],
        },
      },
      {
        titulo: 'Custo por interface',
        texto: ['Por padrão, 10^8 dividido pela velocidade em bit/s, no mínimo 1. Quem administra pode mudar, e o Dijkstra obedece. O custo vale para quem sai pela porta: ida e volta podem divergir.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Enlace', 'Custo padrão', 'Caminho da escola ao centro'],
          linhas: [
            ['10 Mb/s', '10', 'norte: 10 + 1 = 11'],
            ['100 Mb/s', '1', ''],
            ['1 Gb/s ou mais', '1 (o mínimo)', 'sul: 1 + 1 = 2, vence'],
            ['porta sul do r-leste com custo 50', '50', 'sul: 50 + 1 = 51, perde para o norte'],
          ],
        },
      },
      {
        titulo: 'Áreas e o backbone',
        texto: [
          'Cada área tem o próprio mapa detalhado; das outras, chegam só resumos. A área 0 é o backbone, e toda área se liga a ela por um roteador de borda de área (ABR), que tem portas nas duas.',
          'Dividir encolhe o banco de estado de enlace, alivia o Dijkstra e prende as instabilidades dentro da área onde acontecem.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['área 0 (backbone): r-centro, r-norte, r-sul, r-leste', 'r-norte: ABR, porta represa na área 1, as outras na 0', 'área 1: r-represa e a rede da usina'],
          rotulo: 'a cidade dividida: o tráfego entre áreas passa sempre pela 0',
        },
      },
      {
        titulo: 'As conversas do OSPF',
        texto: ['Poucas mensagens, levadas direto sobre o IP. Cada anúncio leva número de sequência, para o velho não apagar o novo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mensagem', 'Para quê'],
          linhas: [
            ['hello', 'descobrir vizinhos e provar, de tempos em tempos, que continuam vivos; leva a área'],
            ['descrição do banco', 'ao fazer vizinhança, cada um lista os anúncios que tem'],
            ['pedido de estado de enlace', 'pedir os anúncios que faltam ou estão velhos'],
            ['atualização de estado de enlace', 'mandar anúncios, inclusive para inundar uma mudança'],
            ['confirmação', 'avisar que a atualização chegou'],
          ],
        },
      },
      {
        titulo: 'O roteador designado',
        texto: [
          'Numa rede de difusão com n roteadores, vizinhança completa entre todos daria n(n - 1) / 2 pares: com 10, são 45. O OSPF elege um roteador designado (DR) e um reserva (BDR), e cada um sincroniza só com eles.',
          'Este laboratório não simula a eleição: os enlaces aqui são pares diretos, de dois roteadores cada.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'sw', rotulo: 'switch da sala', x: 330, y: 130 },
            { id: 'dr', rotulo: 'DR', x: 330, y: 30 },
            { id: 'bdr', rotulo: 'BDR', x: 520, y: 130 },
            { id: 'a', rotulo: 'r-a', x: 140, y: 130 },
            { id: 'b', rotulo: 'r-b', x: 200, y: 230 },
            { id: 'c', rotulo: 'r-c', x: 460, y: 230 },
          ],
          ligacoes: [
            ['dr', 'sw'],
            ['bdr', 'sw'],
            ['a', 'sw', 'sincroniza com DR e BDR'],
            ['b', 'sw'],
            ['c', 'sw'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um roteador novo entra numa área do OSPF com as portas configuradas na área 3, mas o vizinho dele, do outro lado do enlace, está na área 0. O que acontece?',
      opcoes: [
        'O hello não fecha, eles não viram vizinhos e nenhuma rota é trocada por esse enlace',
        'O roteador novo vira roteador de borda entre a 3 e a 0',
        'O OSPF ajusta sozinho a área do roteador novo para 0',
        'Viram vizinhos, mas só trocam resumos',
      ],
      certa: 0,
      explicacao: 'As duas pontas de um enlace precisam estar na mesma área. Roteador de borda é quem tem portas em duas áreas, cada uma casando com o vizinho daquele lado: o vizinho na 0 precisaria pôr a porta dele na 3, ou o novo pôr a dele na 0.',
    },
  },
  desafio: {
    carta: [
      'O hospital manda exames para o data center pelo anel, e o caminho direto, de uma fibra só até o r-centro, está parado. Tudo vai pela volta do porto. Alguém fez "um teste rapidinho" no r-hosp na semana passada e não desfez.',
      'Além disso, a vila ganhou um posto de saúde atrás do r-vila, configurado na área 2. O posto não alcança o prontuário do data center.',
      'Objetivo: o hospital chegando ao servidor (10.50.0.10) pelo caminho direto, o posto da vila alcançando o servidor com o r-porto de borda de área e a pergunta respondida.',
    ],
    dicas: [
      'Veja o OSPF do r-hosp: uma das portas tem um custo configurado bem diferente do padrão.',
      'Ponha o custo da porta centro do r-hosp em 1, o mesmo de uma fibra de 1 Gb/s. Depois olhe o r-porto: a porta vila está em que área?',
      'A porta vila do r-porto precisa ir para a área 2. A métrica do r-hosp até o data center soma a porta centro e a rede do data center.',
    ],
    perguntas: d97D,
    respostas: { '1': '2' },
    montar: mundoAnelOspfHospital,
    objetivo: (m) => {
      const tr = traceRegistro(m, 'hospital', '10.50.0.10');
      return [
        item(
          'traceroute do hospital ao servidor pelo caminho direto, sem passar pelo r-porto',
          !!tr && tr.chegou && tr.saltos.includes('10.1.1.1') && !tr.saltos.includes('10.1.3.2'),
          tr ? tr.saltos.map((x) => x ?? '*').join(' > ') : 'ainda não foi feito',
        ),
        item('r-porto como roteador de borda de área (áreas 0 e 2)', abr(m).includes('r-porto'), abr(m).join(', ') || 'nenhum'),
        pingOk(m, 'posto-vila', '10.50.0.10'),
        ...todasRespondidas(m, d97D),
      ];
    },
    solucao: [
      ['equip', 'r-hosp', 'rot-ospf-custo', { porta: 'centro', custo: '1' }],
      ['equip', 'r-porto', 'rot-ospf-area', { porta: 'vila', area: '2' }],
      ['equip', 'hospital', 'traceroute', { destino: '10.50.0.10' }],
      ['equip', 'posto-vila', 'ping', { destino: '10.50.0.10', n: '4' }],
    ],
  },
};

export const ATO4G: Dia[] = [dia96, dia97];
