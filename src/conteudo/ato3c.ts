// Dias do ato 3 (O Bairro), com prática guiada, aula e desafio no próprio dia.
// Desempenho da Ethernet (4.3.3), Ethernet comutada (4.3.4) e as Ethernets rápidas, de 100 Mb/s a 100 Gb/s (4.3.5 a 4.3.9).

import { C_MEIO, canal, eficienciaEthernet, type EstadoMac, type ResultadoMac } from '../motor/mac';
import { adicionar, comutador, ligar, novoMundo, pc, TRANSCEPTORES, type Equipamento, type Mundo } from '../motor/mundo';
import { tabelaMac } from '../motor/rede';
import { lerCidr, lerIp } from '../motor/util';
import { enlace, item, numerica, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Número com vírgula decimal, para os textos. */
const br = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');
/** Fração em porcentagem com uma casa, como o canal mostra. */
const pct = (x: number) => `${br(x * 100, 1)} %`;

/** Atraso normalizado a = tempo de propagação ÷ tempo de quadro = B·L / (c·F). */
const aDe = (taxaBps: number, metros: number, quadroBits: number) => (taxaBps * metros) / (C_MEIO * quadroBits);

const macDe = (m: Mundo, nome: string) => m.equipamentos.get(nome)!.s.mac as EstadoMac;
const ultimoMac = (m: Mundo) => m.flags.ultimoMac as ResultadoMac | undefined;
/** A última simulação foi feita neste canal, com a configuração que ele tem agora. */
const simulouAgora = (m: Mundo, nome: string) => !!ultimoMac(m) && m.flags.macDoUltimo === JSON.stringify(macDe(m, nome));

const vazaoMedida = (m: Mundo): number => (typeof m.flags.ultimaVazao === 'number' ? m.flags.ultimaVazao : -1);

/** Vazão útil de TCP sobre Ethernet, como o motor calcula: 1460 de 1538 bytes. */
const util = (mbps: number) => mbps * (1460 / 1538);

/** Põe o mesmo transceptor nas portas SFP indicadas. */
function comSfp(e: Equipamento, modelo: string, ...portas: string[]): Equipamento {
  for (const p of e.portas) if (portas.includes(p.nome)) p.sfp = { ...TRANSCEPTORES[modelo]! };
  return e;
}

/* ======================================================================
 * ref 66: Desempenho da Ethernet (4.3.3)
 * ====================================================================== */

interface Rede66 {
  nome: string;
  taxa: number;
  metros: number;
  bits: number;
  modelo: string;
}

const R66: Rede66[] = [
  { nome: 'barramento', taxa: 10e6, metros: 2500, bits: 512, modelo: 'Barramento coaxial da escola: 10 Mb/s, 2500 m de ponta a ponta, quadros mínimos de 512 bits' },
  { nome: 'quadro-grande', taxa: 10e6, metros: 2500, bits: 12000, modelo: 'O mesmo barramento, só com quadros cheios de 1500 bytes (12.000 bits)' },
  { nome: 'cabo-curto', taxa: 10e6, metros: 100, bits: 512, modelo: 'Um só segmento de 100 m, 10 Mb/s, quadros mínimos de 512 bits' },
  { nome: 'gigabit', taxa: 1e9, metros: 200, bits: 512, modelo: 'Proposta do grêmio: CSMA/CD a 1 Gb/s, 200 m, quadros de 512 bits' },
];
const EF66 = Object.fromEntries(R66.map((r) => [r.nome, eficienciaEthernet(r.taxa, r.metros, r.bits)])) as Record<string, number>;
const A66 = Object.fromEntries(R66.map((r) => [r.nome, aDe(r.taxa, r.metros, r.bits)])) as Record<string, number>;
const CARGA_ALTA = 5;

const p66: Pergunta[] = [numerica('1', 'Qual a eficiência do barramento da escola (10 Mb/s, 2500 m, quadros de 512 bits) com muitas estações prontas, em %?', EF66.barramento! * 100, 0.5)];

const montar66 = (): Mundo => {
  const m = novoMundo(366);
  for (const r of R66) adicionar(m, canal(r.nome, { protocolo: 'csma-cd', estacoes: 30, carga: 0.5, a: A66[r.nome]! }, r.modelo));
  return m;
};

/** Desafio: três propostas para a rede da cooperativa. */
const D66 = [
  { nome: 'proposta-a', taxa: 10e6, metros: 2500, bits: 512, modelo: 'Proposta A: reaproveitar o barramento velho, 10 Mb/s, 2500 m, quadros mínimos de 512 bits' },
  { nome: 'proposta-b', taxa: 100e6, metros: 200, bits: 512, modelo: 'Proposta B: hub de 100 Mb/s, 200 m de diâmetro, quadros mínimos de 512 bits' },
  { nome: 'proposta-c', taxa: 10e6, metros: 500, bits: 12000, modelo: 'Proposta C: 10 Mb/s, 500 m, só quadros cheios de 12.000 bits (os backups das notas fiscais)' },
];
const EFD66 = Object.fromEntries(D66.map((r) => [r.nome, eficienciaEthernet(r.taxa, r.metros, r.bits)])) as Record<string, number>;
const d66: Pergunta[] = [numerica('1', 'Qual a eficiência da proposta B (100 Mb/s, 200 m, quadros de 512 bits) com muitas estações prontas, em %?', EFD66['proposta-b']! * 100, 0.5)];

const simulouAlta = (nome: string) => (m: Mundo) => {
  const r = ultimoMac(m);
  if (!r || !simulouAgora(m, nome)) return 'A simulação não aconteceu neste canal.';
  if (macDe(m, nome).carga < CARGA_ALTA) return `Com G = ${br(macDe(m, nome).carga, 2)}, quase ninguém disputa o canal e a vazão é só o que se oferece. A fórmula da eficiência vale com muitas estações sempre prontas: use G de ${CARGA_ALTA} para cima.`;
  return true;
};

const dia66: Dia = {
  numero: 66,
  ato: 3,
  titulo: 'Desempenho da Ethernet',
  chamado: [
    'CHAMADO #0066',
    'A escola tirou do depósito o barramento coaxial que ligava as salas nos anos 90: 10 Mb/s, 2500 m de cabo e repetidores, e todo mundo no mesmo fio. A diretora quer saber se dá para usar de novo, e o grêmio estudantil já propôs "a mesma coisa, só que a 1 Gb/s".',
    'Na bancada há quatro canais de laboratório, um para cada cenário, todos com CSMA/CD.',
    'Objetivo: simular os quatro canais com muitas estações prontas (G de 5 para cima) e responder quanto do barramento vira dado de verdade.',
  ],
  manual: {
    titulo: 'Quanto do canal a Ethernet clássica aproveita',
    texto: [
      'Na Ethernet clássica todas as estações dividem o mesmo fio e usam CSMA/CD: escutam antes de falar e abortam ao perceber colisão. Quando muitas estações querem falar ao mesmo tempo, o canal alterna entre quadros que passam e intervalos de disputa, em que as estações colidem, recuam e tentam de novo. Eficiência é a fração do tempo em que o canal carrega quadro útil.',
      'Cada intervalo de disputa dura o tempo que um sinal leva para ir de uma ponta do cabo à outra e voltar: 2L/c, com L o comprimento do cabo e c a velocidade de propagação, uns 2 × 10^8 m/s no cobre. Com muitas estações prontas, gasta-se em média perto de e (2,718) intervalos de disputa antes de alguém acertar. O quadro dura F/B: F bits à taxa de B bits por segundo.',
      'Juntando: eficiência = 1 / (1 + 2BLe / cF). O termo 2BLe/cF é quanto tempo de disputa se paga por tempo de quadro. Quanto menor ele, mais perto de 100 % o canal chega.',
      'Daí saem as regras. Quadro maior (F grande) melhora: paga-se a mesma disputa para mandar mais bits. Cabo menor (L pequeno) melhora: a disputa fica mais curta. E velocidade maior (B grande) piora: o quadro passa a durar menos, mas a colisão continua levando o mesmo tempo para atravessar o cabo. A disputa pesa mais.',
      'O quadro mínimo de 64 bytes (512 bits) existe por causa dessa mesma conta: ele precisa durar mais que a ida e volta do sinal, senão a estação termina de transmitir antes de saber que colidiu.',
    ],
  },
  dicas: [
    'Em cada canal, use "Carga e estações" com G alto, como 10: a fórmula vale quando há sempre alguém querendo falar.',
    'Some o tempo de disputa por quadro: 2BLe/cF. Com 10 Mb/s, 2500 m e 512 bits, isso dá uns 1,33.',
    `Barramento: 1 / (1 + 1,33) = ${pct(EF66.barramento!)}.`,
  ],
  perguntas: p66,
  montar: montar66,
  objetivo: (m) => {
    const altos = R66.filter((r) => macDe(m, r.nome).carga >= CARGA_ALTA);
    return [
      item('os quatro canais simulados com muitas estações prontas (G de 5 para cima)', altos.length === R66.length && !!ultimoMac(m), `${altos.length} de ${R66.length} com carga alta`),
      ...todasRespondidas(m, p66),
    ];
  },
  posMorte: [
    `O barramento velho, cheio de quadros mínimos, aproveita só ${pct(EF66.barramento!)} do canal. O resto do tempo é gasto em disputa: o sinal leva 12,5 µs para ir de uma ponta à outra dos 2500 m, e cada rodada de disputa custa a ida e a volta. Um quadro de 512 bits a 10 Mb/s dura 51,2 µs, e a disputa média leva mais que isso.`,
    `Com quadros cheios de 12.000 bits, o mesmo cabo chega a ${pct(EF66['quadro-grande']!)}; encurtando o cabo para 100 m, mesmo com quadros mínimos, chega a ${pct(EF66['cabo-curto']!)}. Já a proposta do grêmio, a 1 Gb/s em 200 m, despenca para ${pct(EF66.gigabit!)}: o quadro de 512 bits dura 0,512 µs, menos que os 2 µs da ida e volta, e a estação nem saberia que colidiu.`,
    'Por isso a Ethernet rápida não ficou no fio compartilhado. A saída foi parar de disputar: cada máquina com o seu cabo até um switch, falando e ouvindo ao mesmo tempo. Sem colisão, a fórmula deixa de valer, e esse é o assunto do próximo chamado.',
  ],
  passos: [
    passo({ alvo: ['equip', 'barramento'], acao: 'canal-ver', instrucao: 'Veja como está o barramento da escola.', porque: `O canal mostra o atraso normalizado a: o tempo de propagação dividido pelo tempo de quadro. Aqui, a = BL / (cF) = ${br(A66.barramento!, 3)}. A eficiência é 1 / (1 + 2e·a), a mesma conta da fórmula.`, feito: `a = ${br(A66.barramento!, 3)}: o sinal leva perto de um quarto de quadro para atravessar o cabo. Parece pouco, mas a disputa custa a ida e a volta, várias vezes.` }),
    passo({
      alvo: ['equip', 'barramento'],
      acao: 'canal-carga',
      pedir: ['g'],
      exemplo: { g: '10' },
      instrucao: 'Ponha muitas estações prontas no barramento e simule.',
      porque: 'A eficiência da fórmula é a do pior caso: sempre tem alguém querendo falar, e toda janela livre vira disputa. Com G baixo, a vazão é só o pouco que se oferece, e não diz nada sobre o canal.',
      conferir: simulouAlta('barramento'),
      feito: `Vazão de ${pct(EF66.barramento!)}, encostada no máximo do CSMA/CD para esse cabo. Mais carga não aumenta: o canal já está cheio de disputa.`,
    }),
    passo({ pergunta: '1', exemplo: { resposta: br(EF66.barramento! * 100, 1) }, instrucao: 'Calcule a eficiência do barramento com a fórmula, em %.', porque: '2BLe / cF = 2 × 10.000.000 × 2500 × 2,718 ÷ (200.000.000 × 512) ≈ 1,33. A eficiência é 1 / (1 + 1,33).', feito: `${pct(EF66.barramento!)}. Mais da metade do tempo do fio vai embora em colisão e recuo.` }),
    passo({ alvo: ['equip', 'quadro-grande'], acao: 'canal-carga', valores: { g: '10' }, instrucao: 'Agora simule o mesmo barramento só com quadros cheios.', porque: 'O cabo é o mesmo, então a disputa custa o mesmo tempo. Só que cada quadro que vence leva 12.000 bits em vez de 512.', conferir: simulouAlta('quadro-grande'), feito: `${pct(EF66['quadro-grande']!)}. Quadro maior divide o mesmo custo de disputa por muito mais dado.` }),
    passo({ alvo: ['equip', 'cabo-curto'], acao: 'canal-carga', valores: { g: '10' }, instrucao: 'E agora um segmento curto, de 100 m, com quadros mínimos.', porque: 'Com o cabo 25 vezes menor, o sinal atravessa 25 vezes mais rápido, e a disputa encolhe na mesma proporção.', conferir: simulouAlta('cabo-curto'), feito: `${pct(EF66['cabo-curto']!)}. Cabo curto e quadro grande fazem a mesma coisa na conta: diminuem 2BLe/cF.` }),
    passo({
      escolha: {
        opcoes: [
          'Cai muito: o quadro passa a durar menos que a ida e volta do sinal, e a disputa pesa cada vez mais',
          'Sobe para perto de 100 %: mais velocidade é sempre melhor',
          'Fica igual: a eficiência não depende da taxa',
          'Sobe um pouco, porque as colisões passam mais rápido',
        ],
        certa: 0,
        errada: {
          1: 'A taxa B está no numerador do termo de disputa. Multiplicar B por 100 pesa na conta como multiplicar o cabo por 100.',
          2: 'Depende sim: B aparece na fórmula, multiplicando L. O quadro encurta com a taxa, a propagação não.',
          3: 'A colisão não passa mais rápido: o sinal continua andando a 2 × 10^8 m/s, seja qual for a taxa. Só o quadro encolhe.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O grêmio quer o mesmo CSMA/CD a 1 Gb/s, em 200 m, com quadros de 512 bits. O que acontece com a eficiência?',
      porque: 'Pense no tempo de quadro e no tempo de propagação. Um encolhe com a velocidade; o outro, não.',
      feito: 'Cai. Mais velocidade, com o mesmo cabo e o mesmo quadro, deixa a disputa proporcionalmente mais cara.',
    }),
    passo({ alvo: ['equip', 'gigabit'], acao: 'canal-carga', valores: { g: '10' }, instrucao: 'Simule a proposta do grêmio para confirmar.', porque: `Aqui a = ${br(A66.gigabit!, 2)}: só a ida do sinal já dura quase dois quadros inteiros.`, conferir: simulouAlta('gigabit'), feito: `${pct(EF66.gigabit!)}. Um gigabit no papel, menos de 90 Mb/s de dado. O grêmio vai precisar de outra ideia.` }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'A conta da eficiência',
        texto: ['Com muitas estações prontas, o canal alterna entre disputa e quadro. A eficiência é a fração do tempo que vira quadro.', 'eficiência = 1 / (1 + 2BLe / cF)'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Letra', 'O que é', 'No barramento da escola'],
          linhas: [
            ['B', 'taxa do canal', '10 Mb/s'],
            ['L', 'comprimento do cabo', '2500 m'],
            ['F', 'tamanho do quadro', '512 bits'],
            ['c', 'velocidade do sinal no cabo', '2 × 10^8 m/s'],
            ['e', 'intervalos de disputa por quadro, em média', '2,718'],
          ],
        },
      },
      {
        titulo: 'Por que 2L/c',
        texto: ['Uma estação só tem certeza de que não colidiu depois que o sinal dela chega à outra ponta e uma eventual colisão volta. Cada intervalo de disputa dura essa ida e volta.', 'Nos 2500 m da escola, são 12,5 µs para ir e 12,5 µs para voltar: 25 µs por intervalo.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'sala 1', x: 90, y: 120 },
            { id: 'b', rotulo: 'sala 40', x: 510, y: 120 },
          ],
          ligacoes: [
            ['a', 'b', 'quadro: 12,5 µs'],
            ['b', 'a', 'colisão: 12,5 µs'],
          ],
        },
      },
      {
        titulo: 'Quadro maior, cabo menor',
        texto: ['Os quatro canais da bancada, todos com CSMA/CD e muitas estações prontas:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Canal', 'Taxa', 'Cabo', 'Quadro', 'a = BL/cF', 'Eficiência'],
          linhas: R66.map((r) => [r.nome, r.taxa >= 1e9 ? `${r.taxa / 1e9} Gb/s` : `${r.taxa / 1e6} Mb/s`, `${r.metros} m`, `${r.bits} bits`, br(A66[r.nome]!, 3), pct(EF66[r.nome]!)]),
        },
      },
      {
        titulo: 'Mais rápido, pior',
        texto: ['Mesmo cabo de 200 m e mesmo quadro de 512 bits, só mudando a taxa. O quadro encolhe; a ida e volta do sinal, não.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Taxa', 'Duração do quadro', 'Ida e volta', 'Eficiência'],
          linhas: [
            ['10 Mb/s', '51,2 µs', '2 µs', pct(eficienciaEthernet(10e6, 200, 512))],
            ['100 Mb/s', '5,12 µs', '2 µs', pct(eficienciaEthernet(100e6, 200, 512))],
            ['1 Gb/s', '0,512 µs', '2 µs', pct(eficienciaEthernet(1e9, 200, 512))],
          ],
        },
      },
      {
        titulo: 'A saída: parar de disputar',
        texto: [
          'O CSMA/CD clássico não escala com a velocidade. Para manter a eficiência a 100 Mb/s, ou o cabo encurta, ou o quadro mínimo cresce, ou as duas coisas.',
          'A Ethernet escolheu um terceiro caminho: cada máquina no seu cabo até um switch, falando e ouvindo ao mesmo tempo. Sem colisão, sem disputa, e a fórmula deixa de importar.',
        ],
      },
    ],
    checagem: {
      pergunta: 'Num canal com CSMA/CD, o que aumenta a eficiência?',
      opcoes: ['Quadros maiores e cabos mais curtos', 'Taxa maior com o mesmo cabo e o mesmo quadro', 'Cabos mais longos, para caber mais estações', 'Quadros menores, para cada colisão desperdiçar menos'],
      certa: 0,
      explicacao: 'O termo de disputa é 2BLe/cF. Ele diminui quando F cresce ou L diminui. Taxa maior e cabo mais longo aumentam esse termo; quadro menor também, porque divide a mesma disputa por menos bits.',
    },
  },
  desafio: {
    carta: [
      'A cooperativa vai ligar o escritório, o armazém e a balança, e recebeu três propostas, todas com CSMA/CD e fio compartilhado. O gerente quer a que aproveita pelo menos 90 % do canal quando todo mundo estiver mandando ao mesmo tempo, no fechamento do mês.',
      'Os três canais de laboratório estão na bancada, ainda com carga baixa.',
      'Objetivo: simular, com muitas estações prontas, a proposta que passa de 90 %, e responder a eficiência da proposta B.',
    ],
    dicas: [
      'Calcule 2BLe/cF para cada proposta antes de simular: quanto menor, melhor.',
      'Na proposta B, 2BLe/cF ≈ 1,06. Na C, os quadros cheios e o cabo curto deixam o termo perto de 0,01.',
    ],
    perguntas: d66,
    respostas: { '1': br(EFD66['proposta-b']! * 100, 1) },
    montar: () => {
      const m = novoMundo(3366);
      for (const r of D66) adicionar(m, canal(r.nome, { protocolo: 'csma-cd', estacoes: 20, carga: 0.5, a: aDe(r.taxa, r.metros, r.bits) }, r.modelo));
      return m;
    },
    objetivo: (m) => {
      const r = ultimoMac(m);
      const ultimo = m.flags.macDoUltimo ? (JSON.parse(m.flags.macDoUltimo) as EstadoMac) : undefined;
      const ok = !!r && !!ultimo && ultimo.protocolo === 'csma-cd' && ultimo.carga >= CARGA_ALTA && r.vazao >= 0.9;
      return [item('simulação com muitas estações prontas de uma proposta que aproveita 90 % ou mais', ok, r && ultimo ? `última: G = ${br(ultimo.carga, 2)}, vazão ${pct(r.vazao)}` : 'nenhuma simulação ainda'), ...todasRespondidas(m, d66)];
    },
    solucao: [['equip', 'proposta-c', 'canal-carga', { g: '10' }]],
  },
};


/* ======================================================================
 * ref 67: Hub ou switch (4.3.4)
 * ====================================================================== */

const IP_NAS = '192.0.2.10';
const IP_AP101 = '192.0.2.11';
const IP_PORTARIA = '192.0.2.12';
const HUB67 = 100;
const SW67 = 1000;

const montar67 = (): Mundo => {
  const m = novoMundo(367);
  const ap = adicionar(m, pc('ap101', { ip: lerCidr(`${IP_AP101}/24`)!, modelo: 'Computador do apartamento 101' }));
  const nas = adicionar(m, pc('nas', { ip: lerCidr(`${IP_NAS}/24`)!, modelo: 'Servidor de arquivos do condomínio (câmeras, atas e a planilha das contas)' }));
  adicionar(m, pc('portaria', { ip: lerCidr(`${IP_PORTARIA}/24`)!, modelo: 'Computador da portaria' }));
  adicionar(m, comutador('hub', { tipo: 'hub', modelo: 'Hub de 100 Mb/s, da inauguração do prédio', velocidades: [10, HUB67], portas: 4 }));
  adicionar(m, comutador('sw-predio', { modelo: 'Switch gigabit de 8 portas, novinho, ainda com plástico' }));
  ligar(m, { equip: 'ap101', porta: 'eth0' }, { equip: 'hub', porta: 'p1' }, 'cat5e', 12, { id: 'c1' });
  ligar(m, { equip: 'nas', porta: 'eth0' }, { equip: 'hub', porta: 'p2' }, 'cat5e', 3, { id: 'c2' });
  ligar(m, { equip: 'portaria', porta: 'eth0' }, { equip: 'sw-predio', porta: 'p3' }, 'cat5e', 15, { id: 'c3' });
  m.proxCabo = 4;
  // Os dois já conversavam pelo hub: cada um sabe o MAC do outro (ARP em cache). O switch novo não sabe nada.
  ap.s.arp = { [lerIp(IP_NAS)!]: nas.mac };
  nas.s.arp = { [lerIp(IP_AP101)!]: ap.mac };
  m.flags.servidorTeste = 'nas';
  return m;
};
const M67 = montar67();
const MAC_AP101 = M67.equipamentos.get('ap101')!.mac;
const MAC_NAS = M67.equipamentos.get('nas')!.mac;

const naPonta = (m: Mundo, cabo: string, equip: string) => {
  const c = m.cabos.get(cabo);
  return !!c && (c.a.equip === equip || c.b.equip === equip);
};

const moveuPara = (cabo: string, sw: string) => (m: Mundo) => {
  if (naPonta(m, cabo, sw)) return true;
  if (naPonta(m, cabo, 'hub')) return `O ${cabo} continua no hub. Mude a ponta que está no hub (a ponta b) para uma porta do ${sw}.`;
  return `O ${cabo} saiu do hub, mas não foi para o ${sw}.`;
};

const vazaoEntre = (min: number, max: number, msg: string) => (m: Mundo) => {
  const v = vazaoMedida(m);
  if (v < 0) return 'A medição não aconteceu.';
  return v >= min && v <= max ? true : msg;
};

const d67: Pergunta[] = [
  numerica('1', 'O laboratório vai ganhar um switch de 24 portas, com um computador em cada porta. Quantos domínios de colisão ele terá?', 24, 0),
  numerica('2', 'E se as mesmas 24 máquinas estivessem num hub de 24 portas, quantos domínios de colisão seriam?', 1, 0),
];

const dia67: Dia = {
  numero: 67,
  ato: 3,
  titulo: 'Hub ou switch',
  chamado: [
    'CHAMADO #0067',
    'O condomínio do prédio da esquina guarda as câmeras e as atas num servidor de arquivos ligado a um hub de 100 Mb/s da inauguração. Quem mora no 101 faz o backup do mês e reclama que leva a tarde inteira; a portaria reclama que, enquanto o backup roda, a internet some.',
    'Compraram um switch gigabit, que já está no rack com o computador da portaria ligado. O resto continua no hub.',
    'Objetivo: o 101 e o servidor no switch, o switch sabendo onde está cada um, e a vazão do 101 até o servidor acima de 900 Mb/s.',
  ],
  manual: {
    titulo: 'Ethernet comutada: cada máquina no seu domínio',
    texto: [
      'Um hub é um fio compartilhado dentro de uma caixa. Cada bit que entra por uma porta sai por todas as outras, sem ninguém ler endereço nenhum. Todas as máquinas ligadas a ele estão no mesmo domínio de colisão: se duas falam ao mesmo tempo, colidem, e todo mundo escuta tudo o que qualquer uma manda. A capacidade do hub é dividida entre todas, e cada porta trabalha em half-duplex: ou fala, ou escuta.',
      'Um switch lê o endereço MAC de destino de cada quadro e o manda só para a porta onde está o destino. Cada porta é seu próprio domínio de colisão. Com uma máquina por porta, o cabo tem só duas pontas, o computador e o switch, e as duas podem falar ao mesmo tempo, cada sentido nos seus fios: é o full-duplex. Sem ninguém para disputar, não há colisão, e o CSMA/CD fica sem trabalho.',
      'Como cada porta é independente, o switch comuta vários pares de portas ao mesmo tempo: o 101 copia para o servidor enquanto a portaria fala com outra máquina, cada conversa na velocidade cheia da porta. Por dentro, o switch tem uma malha de comutação que dá conta de todas as portas juntas, e memória para guardar um quadro quando duas portas mandam para o mesmo destino ao mesmo tempo.',
      'Para saber qual porta é de quem, o switch monta a tabela MAC. Cada quadro que chega ensina alguma coisa: o MAC de origem está atrás da porta por onde ele entrou. Quando o destino ainda não está na tabela, o switch inunda: manda o quadro para todas as portas menos a de entrada, como um hub faria, só dessa vez. A resposta do destino ensina onde ele está, e dali em diante o quadro vai só para a porta certa. Entrada sem uso por 300 s é esquecida.',
      'Trocar um hub por um switch não exige mudar nada nos computadores: as placas e o formato do quadro são os mesmos. Por isso a troca aconteceu em quase toda rede do mundo, sem cerimônia.',
    ],
  },
  dicas: [
    'Meça a vazão antes, para ter com o que comparar.',
    'Os cabos c1 e c2 estão com a ponta b no hub. Mude essas pontas para portas livres do sw-predio.',
    'Depois de um ping, a tabela MAC do sw-predio mostra onde ficou cada um. Meça a vazão de novo.',
  ],
  montar: montar67,
  objetivo: (m) => {
    const t = tabelaMac(m.equipamentos.get('sw-predio')!);
    const ap = m.equipamentos.get('ap101')!.mac;
    const nas = m.equipamentos.get('nas')!.mac;
    const v = vazaoMedida(m);
    return [
      item('o 101 (c1) e o servidor (c2) ligados ao switch', naPonta(m, 'c1', 'sw-predio') && naPonta(m, 'c2', 'sw-predio')),
      item('a tabela MAC do switch sabe onde estão o 101 e o servidor', ap in t && nas in t, `${Object.keys(t).length} endereço(s) aprendido(s)`),
      item('vazão do 101 até o servidor acima de 900 Mb/s', v > 900, v < 0 ? 'ainda não mediu' : `${br(v, 2)} Mb/s`),
    ];
  },
  posMorte: [
    `No hub, o 101 e o servidor dividiam ${HUB67} Mb/s em half-duplex com quem mais estivesse ligado. O teste deu ${br(util(HUB67), 2)} Mb/s com os dois sozinhos; com a portaria no mesmo hub, cada quadro do backup disputaria o mesmo fio com os quadros da portaria, e as colisões comeriam o resto. Era exatamente a reclamação da portaria.`,
    `No switch, o primeiro pedido de eco saiu para um MAC que o switch não conhecia: ele inundou, e o quadro chegou também à portaria, que viu que não era com ela e descartou. A resposta do servidor ensinou onde ele estava. Daí em diante, cada quadro foi só para a porta certa, e a vazão subiu para ${br(util(SW67), 2)} Mb/s, cada porta no seu domínio de colisão, em full-duplex.`,
    'Bônus de privacidade: no hub, qualquer computador ligado podia capturar o backup inteiro, porque recebia todos os bits. No switch, cada um só recebe o que é para ele, mais um ou outro quadro inundado. Não é segurança de verdade, mas já é educação.',
  ],
  passos: [
    passo({ alvo: ['equip', 'ap101'], acao: 'vazao', instrucao: 'Do 101, meça a vazão até o servidor, ainda pelo hub.', porque: 'O caminho passa pelo hub. A vazão mostra o enlace mais lento e quanto sobra de cada quadro para o dado.', conferir: vazaoEntre(90, 100, 'Essa medição não passou pelo hub.'), feito: `${br(util(HUB67), 2)} Mb/s: o hub de ${HUB67} Mb/s é o gargalo. E esses ${HUB67} Mb/s não são do 101: são de todos que estiverem no hub, ao mesmo tempo.` }),
    passo({ alvo: ['equip', 'hub'], acao: 'mac-tabela', instrucao: 'Procure a tabela de endereços MAC do hub.', porque: 'Um aparelho que sabe para onde mandar cada quadro precisa de uma tabela de endereços. Veja se o hub tem uma.', feito: 'Não tem. O hub não lê quadro: repete cada bit para todas as portas. Todos os ligados a ele estão num domínio de colisão só, e todo mundo escuta tudo.' }),
    passo({ alvo: ['cabo', 'c1'], acao: 'mover', valores: { ponta: 'b' }, pedir: ['destino'], exemplo: { destino: 'sw-predio:p1' }, instrucao: 'Mude a ponta do cabo do 101 (c1) do hub para uma porta livre do switch.', porque: 'No switch, o 101 ganha uma porta só para ele: um domínio de colisão com duas pontas, ele e o switch.', conferir: moveuPara('c1', 'sw-predio'), feito: 'O 101 está no switch, sozinho no seu cabo. A placa e o quadro são os mesmos de antes; só o aparelho do outro lado mudou.' }),
    passo({ alvo: ['cabo', 'c2'], acao: 'mover', valores: { ponta: 'b' }, pedir: ['destino'], exemplo: { destino: 'sw-predio:p2' }, instrucao: 'Agora mude o cabo do servidor (c2) para o switch.', porque: 'O servidor também precisa de uma porta só dele. O hub fica sem ninguém e pode ir para a gaveta das relíquias.', conferir: moveuPara('c2', 'sw-predio'), feito: 'Os três no switch. Ele ainda não sabe quem está em qual porta: a tabela MAC começa vazia.' }),
    passo({
      alvo: ['equip', 'ap101'],
      acao: 'ping',
      valores: { destino: IP_NAS, n: '4' },
      instrucao: 'Do 101, faça um ping para o servidor.',
      porque: 'O 101 já sabe o MAC do servidor (aprendeu pelo ARP nos tempos do hub) e manda o quadro direto. O switch, que acabou de chegar, não sabe onde esse MAC mora.',
      conferir: (m) => {
        const r = registroPing(m, 'ap101', IP_NAS);
        if (!r || r.recebidos < r.n) return 'O ping não voltou inteiro. Confira se o 101 e o servidor estão no switch.';
        return (m.flags.inundacoes ?? 0) >= 1 ? true : 'O switch não precisou inundar: ele já conhecia o destino.';
      },
      feito: 'Quatro respostas e uma inundação: o primeiro pedido foi para todas as portas, até para a da portaria, que descartou. Na volta, a resposta do servidor ensinou onde ele está. Os outros três pedidos foram direto.',
    }),
    passo({ alvo: ['equip', 'sw-predio'], acao: 'mac-tabela', instrucao: 'Veja a tabela MAC do switch.', porque: 'Cada quadro que entrou ensinou ao switch onde está o MAC de origem dele.', feito: `${MAC_AP101} na p1 (o 101) e ${MAC_NAS} na p2 (o servidor). A portaria ainda não falou nada, então o switch não sabe dela. E quem fica 300 s calado é esquecido.` }),
    passo({ alvo: ['equip', 'ap101'], acao: 'vazao', instrucao: 'Meça a vazão do 101 até o servidor de novo.', porque: 'Agora o caminho é o switch, com cada porta full-duplex no seu próprio domínio de colisão.', conferir: vazaoEntre(900, 1000, 'A vazão não chegou perto do gigabit. Os dois estão mesmo no switch?'), feito: `${br(util(SW67), 2)} Mb/s, dez vezes mais. E a portaria pode usar a internet ao mesmo tempo, sem disputar nada com o backup.` }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Hub: um fio dentro da caixa',
        texto: ['O hub repete cada bit para todas as portas. Todas as máquinas estão no mesmo domínio de colisão, dividem a mesma capacidade e escutam tudo o que as outras mandam.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'h', rotulo: 'hub', x: 300, y: 120 },
            { id: 'a', rotulo: '101', x: 90, y: 50 },
            { id: 'n', rotulo: 'servidor', x: 510, y: 50 },
            { id: 'p', rotulo: 'portaria', x: 300, y: 220 },
          ],
          ligacoes: [
            ['a', 'h', 'quadro do 101'],
            ['h', 'n', 'mesmos bits'],
            ['h', 'p', 'mesmos bits'],
          ],
        },
      },
      {
        titulo: 'Switch: uma porta, um domínio',
        texto: [
          'O switch manda cada quadro só para a porta do destino. Cada porta é um domínio de colisão, com duas pontas só.',
          'Com duas pontas, as duas falam ao mesmo tempo, cada sentido nos seus fios: full-duplex. Sem disputa, sem colisão.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 's', rotulo: 'switch', x: 300, y: 120 },
            { id: 'a', rotulo: '101', x: 90, y: 50 },
            { id: 'n', rotulo: 'servidor', x: 510, y: 50 },
            { id: 'p', rotulo: 'portaria', x: 300, y: 220 },
          ],
          ligacoes: [
            ['a', 's', 'p1: full-duplex'],
            ['s', 'n', 'p2: full-duplex'],
            ['s', 'p', 'p3: em paz'],
          ],
        },
      },
      {
        titulo: 'Várias conversas ao mesmo tempo',
        texto: ['No hub, uma conversa por vez, dividindo o fio. No switch, cada par de portas conversa na velocidade cheia, todos juntos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', `Hub de ${HUB67} Mb/s`, `Switch de ${SW67} Mb/s, 8 portas`],
          linhas: [
            ['domínios de colisão', '1 para todas as portas', '1 por porta'],
            ['duplex', 'half: fala ou escuta', 'full: fala e escuta'],
            ['conversas simultâneas', '1', '4 pares de portas'],
            ['capacidade somada', `${HUB67} Mb/s para todos`, `4 × ${SW67} Mb/s em cada sentido`],
            ['quem recebe o quadro', 'todo mundo', 'só o destino (ou todos, se o destino é desconhecido)'],
          ],
        },
      },
      {
        titulo: 'A tabela MAC',
        texto: [
          'O switch aprende pela origem: o MAC de quem mandou fica associado à porta por onde o quadro entrou. Destino desconhecido é inundado para todas as outras portas, uma vez. Entrada parada por 300 s é esquecida.',
          'A tabela do prédio, depois do primeiro ping:',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['MAC', 'Porta', 'Quem é', 'Aprendido quando'],
          linhas: [
            [MAC_AP101, 'p1', 'o 101', 'o primeiro pedido de eco entrou pela p1 (e foi inundado)'],
            [MAC_NAS, 'p2', 'o servidor', 'a primeira resposta entrou pela p2'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um switch de 8 portas tem um computador em cada porta. Quantos domínios de colisão há?',
      opcoes: ['8, um por porta', '1, o switch inteiro', 'Nenhum, porque switch não tem colisão', '2, um por sentido do cabo'],
      certa: 0,
      explicacao: 'Cada porta do switch é seu próprio domínio de colisão. Com uma máquina por porta e full-duplex, a colisão nem chega a acontecer, mas os domínios existem: são 8.',
    },
  },
  desafio: {
    carta: [
      'Na escola, alguém da turma entregou a prova de informática com o gabarito anexado. Não decorou: capturou o tráfego do computador do professor. O professor e a máquina da fileira do fundo estão no hub velho de 10 Mb/s do canto, pendurado no switch do laboratório.',
      'A coordenação quer cada computador na sua porta do switch, e o professor baixando as provas do servidor a velocidade de gente.',
      'Objetivo: nenhum computador no hub, vazão do professor até o servidor acima de 900 Mb/s, e as duas perguntas respondidas.',
    ],
    dicas: [
      'O hub não lê endereço: a máquina do fundo recebe cada bit que o professor manda. No switch, cada um recebe só o que é seu.',
      'Os cabos c1 (professor) e c2 (fileira do fundo) estão com a ponta b no hub-velho. Mude cada um para uma porta livre do sw-lab.',
    ],
    perguntas: d67,
    respostas: { '1': '24', '2': '1' },
    montar: () => {
      const m = novoMundo(3367);
      adicionar(m, pc('professor', { ip: lerCidr('192.0.2.21/24')!, modelo: 'Computador da mesa do professor' }));
      adicionar(m, pc('fundo', { ip: lerCidr('192.0.2.22/24')!, modelo: 'Computador da fileira do fundo (suspeito)' }));
      adicionar(m, pc('servidor', { ip: lerCidr('192.0.2.20/24')!, modelo: 'Servidor de provas da escola' }));
      adicionar(m, comutador('hub-velho', { tipo: 'hub', modelo: 'Hub de 10 Mb/s esquecido no canto do laboratório', velocidades: [10], portas: 4 }));
      adicionar(m, comutador('sw-lab', { modelo: 'Switch gigabit do laboratório, 8 portas' }));
      ligar(m, { equip: 'professor', porta: 'eth0' }, { equip: 'hub-velho', porta: 'p1' }, 'cat5e', 6, { id: 'c1' });
      ligar(m, { equip: 'fundo', porta: 'eth0' }, { equip: 'hub-velho', porta: 'p2' }, 'cat5e', 6, { id: 'c2' });
      ligar(m, { equip: 'hub-velho', porta: 'p4' }, { equip: 'sw-lab', porta: 'p8' }, 'cat5e', 2, { id: 'c3' });
      ligar(m, { equip: 'servidor', porta: 'eth0' }, { equip: 'sw-lab', porta: 'p1' }, 'cat6', 3, { id: 'c4' });
      m.proxCabo = 5;
      m.flags.servidorTeste = 'servidor';
      return m;
    },
    objetivo: (m) => {
      const noHub = ['professor', 'fundo'].filter((x) => [...m.cabos.values()].some((c) => (c.a.equip === x && c.b.equip === 'hub-velho') || (c.b.equip === x && c.a.equip === 'hub-velho')));
      const v = vazaoMedida(m);
      return [
        item('nenhum computador no hub', noHub.length === 0, noHub.length ? `no hub: ${noHub.join(', ')}` : undefined),
        item('vazão até o servidor acima de 900 Mb/s', v > 900, v < 0 ? 'ainda não mediu' : `${br(v, 2)} Mb/s`),
        ...todasRespondidas(m, d67),
      ];
    },
    solucao: [
      ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'sw-lab:p2' }],
      ['cabo', 'c2', 'mover', { ponta: 'b', destino: 'sw-lab:p3' }],
      ['equip', 'professor', 'vazao'],
    ],
  },
};

/* ======================================================================
 * ref 68: De 100 mega a 100 giga (4.3.5 a 4.3.9)
 * ====================================================================== */

const DEZ_GIGA = 10000;
const PORTAS_10G = [100, 1000, DEZ_GIGA];

const montar68 = (): Mundo => {
  const m = novoMundo(368);
  adicionar(m, pc('servidor', { velocidades: PORTAS_10G, modelo: 'Servidor de edição do subsolo, placa de 10 Gb/s' }));
  adicionar(m, pc('produtora', { velocidades: PORTAS_10G, modelo: 'Estação de edição da produtora do 7º andar, placa de 10 Gb/s' }));
  adicionar(m, comutador('sw-subsolo', { modelo: 'Switch do subsolo, 4 portas de cobre de 10 Gb/s e 1 SFP', portas: 4, velocidades: PORTAS_10G, sfp: 1 }));
  adicionar(m, comutador('sw-andar7', { modelo: 'Switch do 7º andar, 4 portas de cobre de 10 Gb/s e 1 SFP', portas: 4, velocidades: PORTAS_10G, sfp: 1 }));
  ligar(m, { equip: 'servidor', porta: 'eth0' }, { equip: 'sw-subsolo', porta: 'p1' }, 'cat5e', 30, { id: 'c1', nota: 'cabo da reforma de 2009' });
  ligar(m, { equip: 'sw-subsolo', porta: 'sfp1' }, { equip: 'sw-andar7', porta: 'sfp1' }, 'fibra', 60, { id: 'c2', segmentos: [{ nome: 'tronco', fibra: 'om4', metros: 60 }], nota: 'fibra multimodo OM4 (violeta) pela prumada' });
  ligar(m, { equip: 'sw-andar7', porta: 'p1' }, { equip: 'produtora', porta: 'eth0' }, 'cat6a', 15, { id: 'c3' });
  m.proxCabo = 4;
  m.flags.servidorTeste = 'servidor';
  return m;
};

const sfpCerto = (equip: string) => (m: Mundo) => {
  const p = m.equipamentos.get(equip)!.portas.find((x) => x.nome === 'sfp1')!;
  if (!p.sfp) return 'A porta continua vazia.';
  if (p.sfp.modelo === 'SR-10G') return true;
  return `${p.sfp.modelo} é de 1 Gb/s e monomodo. A fibra da prumada é OM4, multimodo, e o pedido é 10 Gb/s: o transceptor certo é multimodo, de 850 nm e de 10 Gb/s.`;
};

const dezGiga = (m: Mundo, id: string) => {
  const e = enlace(m, id);
  return e.up && e.velocidade === DEZ_GIGA;
};

const d68: Pergunta[] = [numerica('1', 'Quantos pares do cabo o 1000BASE-T usa ao mesmo tempo?', 4, 0)];

const dia68: Dia = {
  numero: 68,
  ato: 3,
  titulo: 'De 100 mega a 100 giga',
  chamado: [
    'CHAMADO #0068',
    'A produtora de vídeo do 7º andar do condomínio edita direto do servidor que fica no subsolo, e cada arquivo de câmera tem dezenas de gigabytes. As placas dos dois lados são de 10 Gb/s, os switches também, e a fibra pela prumada já foi passada. Mesmo assim, nada passa.',
    'A gaveta de transceptores está cheia, e o cabo do servidor é da reforma de 2009.',
    'Objetivo: fibra e cobre a 10 Gb/s e vazão da produtora até o servidor acima de 9000 Mb/s.',
  ],
  manual: {
    titulo: 'A família Ethernet, de 100 Mb/s a 100 Gb/s',
    texto: [
      'Fast Ethernet (100BASE-TX) multiplicou a taxa por 10 sem mudar o quadro: mesmo formato, mesmos endereços, mesmo tamanho mínimo. Usa dois pares de cabo Cat5, um para cada sentido, até 100 m. Ainda permitia hub, mas o diâmetro da rede encolheu para uns 200 m, pela mesma conta da eficiência e do quadro mínimo. Na fibra, a versão 100BASE-FX ia a 2 km.',
      'Gigabit Ethernet (1000BASE-T) usa os quatro pares do cabo Cat5e ao mesmo tempo, nos dois sentidos em cada par, com cancelamento de eco para separar o que sai do que chega. Cada par leva 250 Mb/s: 125 milhões de símbolos por segundo, cada símbolo escolhido entre 5 níveis. Na fibra, há a versão multimodo de 850 nm (SX) e a monomodo de 1310 nm (LX), que vai a quilômetros. O padrão ainda previa hub, esticando o quadro mínimo para 512 bytes, mas quase ninguém usou: o gigabit nasceu em switch, full-duplex.',
      '10 Gigabit Ethernet abandonou de vez o CSMA/CD: só full-duplex. No cobre, o 10GBASE-T precisa de Cat6a para 100 m; o Cat6 garante só até 55 m. Na fibra multimodo de 850 nm (SR), vai a 300 m em OM3 e 400 m em OM4; na monomodo (LR), a 10 km.',
      '40 e 100 Gigabit usam várias pistas em paralelo: 40 Gb/s são 4 pistas de 10 Gb/s, e 100 Gb/s são 4 pistas de 25 Gb/s (ou 10 de 10). As pistas podem ser fibras separadas num mesmo cabo, para distâncias curtas em multimodo, ou cores diferentes de luz na mesma fibra monomodo, para distâncias longas. Isso já é coisa de data center e de provedor; a gaveta daqui vai até 10 Gb/s.',
      'Quando duas portas de cobre se ligam, elas fazem autonegociação: trocam pulsos anunciando o que sabem fazer (velocidades, half ou full-duplex) e escolhem o melhor em comum. Se o cabo não aguenta a velocidade escolhida, o enlace fica numa menor. Foi assim que a Ethernet cresceu de 10 Mb/s para 100 Gb/s sem obrigar ninguém a trocar tudo de uma vez: simples, barata, com o mesmo quadro desde sempre e sempre compatível com a geração anterior. Por isso ela venceu.',
    ],
  },
  dicas: [
    'Comece pelos detalhes da fibra c2: o motivo de estar fora está lá.',
    'Fibra violeta é OM4, multimodo. Para 10 Gb/s em multimodo, o transceptor é de 850 nm, nas duas pontas.',
    'Depois da fibra, o gargalo é o c1: Cat5e não leva 10 Gb/s. Troque por Cat6a e meça de novo.',
  ],
  montar: montar68,
  objetivo: (m) => {
    const e1 = enlace(m, 'c1');
    const e2 = enlace(m, 'c2');
    const v = vazaoMedida(m);
    return [
      item('fibra da prumada (c2) a 10 Gb/s', dezGiga(m, 'c2'), e2.up ? `${e2.velocidade} Mb/s` : e2.motivos[0]),
      item('cabo do servidor (c1) a 10 Gb/s', dezGiga(m, 'c1'), e1.up ? `${e1.velocidade} Mb/s` : e1.motivos[0]),
      item('vazão da produtora até o servidor acima de 9000 Mb/s', v > 9000, v < 0 ? 'ainda não mediu' : `${br(v, 2)} Mb/s`),
    ];
  },
  posMorte: [
    'A fibra estava perfeita e escura: SFP vazio não acende nada. Com um SR-10G de cada lado, 850 nm em fibra OM4 por 60 m, o enlace subiu a 10 Gb/s com folga de luz, bem longe dos 400 m que a OM4 aguenta nessa taxa.',
    `Aí apareceu o segundo gargalo. O cabo do servidor era Cat5e: as duas placas anunciaram 10 Gb/s na autonegociação, mas o cabo não sustenta, e o enlace ficou em 1 Gb/s. A vazão parou em ${br(util(1000), 2)} Mb/s. Com Cat6a, o 10GBASE-T fechou e a vazão foi a ${br(util(DEZ_GIGA), 2)} Mb/s.`,
    'Do barramento de 10 Mb/s da escola até aqui, o quadro é o mesmo e o endereço MAC é o mesmo. Mudaram o meio, a codificação e o fim da disputa. Se um dia a produtora precisar de 100 Gb/s, vai ser com várias pistas de luz, e a placa nova ainda vai saber conversar com um computador de 100 Mb/s.',
  ],
  passos: [
    passo({ alvo: ['cabo', 'c2'], acao: 'detalhes', instrucao: 'Veja os detalhes da fibra da prumada (c2).', porque: 'Antes de trocar qualquer coisa, descubra por que o enlace está fora. O motivo vem escrito.', feito: 'Porta sem transceptor: a fibra foi passada, mas ninguém pôs o módulo óptico nas portas SFP. Sem ele, não sai luz nenhuma.' }),
    passo({ alvo: ['equip', 'sw-subsolo'], acao: 'sfp:sfp1', pedir: ['modelo'], exemplo: { modelo: 'SR-10G' }, instrucao: 'Escolha o transceptor da porta SFP do switch do subsolo.', porque: 'A fibra é OM4 (violeta), multimodo, e o pedido é 10 Gb/s. O transceptor tem que ser multimodo, de 850 nm e de 10 Gb/s.', conferir: sfpCerto('sw-subsolo'), feito: 'SR-10G encaixado: 10 Gb/s, multimodo, 850 nm. Em OM4, essa combinação vai até 400 m.' }),
    passo({
      alvo: ['equip', 'sw-andar7'],
      acao: 'sfp:sfp1',
      pedir: ['modelo'],
      exemplo: { modelo: 'SR-10G' },
      instrucao: 'Agora o transceptor do 7º andar.',
      porque: 'Os dois lados do enlace precisam do mesmo tipo: mesmo comprimento de onda e mesma velocidade.',
      conferir: (m) => {
        const s = sfpCerto('sw-andar7')(m);
        if (s !== true) return s;
        return dezGiga(m, 'c2') ? true : 'A fibra ainda não subiu a 10 Gb/s. Confira o transceptor do subsolo.';
      },
      feito: 'A fibra subiu a 10 Gb/s, com folga de luz nos dois lados.',
    }),
    passo({ alvo: ['equip', 'produtora'], acao: 'vazao', instrucao: 'Da produtora, meça a vazão até o servidor.', porque: 'A fibra está a 10 Gb/s, e o cabo da produtora é Cat6a. Veja se o caminho inteiro acompanha.', conferir: vazaoEntre(900, 1000, 'O resultado deveria ter parado perto de 1 Gb/s.'), feito: `${br(util(1000), 2)} Mb/s. Tem um enlace de 1 Gb/s no caminho.` }),
    passo({
      escolha: {
        opcoes: [
          'O c1, do servidor: é Cat5e, que não sustenta 10 Gb/s, e a autonegociação ficou em 1 Gb/s',
          'A fibra: SR-10G só vai a 1 Gb/s',
          'A placa da produtora, que negociou 1 Gb/s por padrão',
          'O switch do 7º andar, que só tem portas de 1 Gb/s',
        ],
        certa: 0,
        errada: {
          1: 'O SR-10G é de 10 Gb/s, e a fibra acabou de subir nessa velocidade.',
          2: 'A placa da produtora é de 10 Gb/s, e o cabo dela é Cat6a de 15 m: esse enlace está a 10 Gb/s.',
          3: 'As portas de cobre dos dois switches são de 10 Gb/s, está no modelo.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual enlace está segurando a vazão em 1 Gb/s?',
      porque: 'As duas pontas de cada enlace anunciam o que sabem fazer e ficam com o melhor em comum que o meio aguenta. Procure o meio mais antigo.',
      feito: 'O c1. As duas placas anunciaram 10 Gb/s, mas o Cat5e não leva o 10GBASE-T, e o enlace ficou na melhor velocidade que funciona: 1 Gb/s, usando os quatro pares.',
    }),
    passo({
      alvo: ['cabo', 'c1'],
      acao: 'trocar',
      pedir: ['meio'],
      exemplo: { meio: 'cat6a' },
      instrucao: 'Troque o cabo do servidor por um que leve 10 Gb/s.',
      porque: 'O 10GBASE-T precisa de Cat6a para 100 m. O Cat6 garante só até 55 m; o Cat5e fica no gigabit.',
      conferir: (m) => {
        const e = enlace(m, 'c1');
        if (!e.up) return `O c1 caiu: ${e.motivos[0]}.`;
        return e.velocidade === DEZ_GIGA ? true : `O c1 negociou ${e.velocidade} Mb/s. Cat5e não passa de 1 Gb/s.`;
      },
      feito: 'O c1 subiu a 10 Gb/s. Em 30 m, até Cat6 serviria; Cat6a dá folga para os 100 m e para a próxima reforma.',
    }),
    passo({ alvo: ['equip', 'produtora'], acao: 'vazao', instrucao: 'Meça a vazão de novo.', porque: 'Agora todos os enlaces do caminho estão a 10 Gb/s.', conferir: vazaoEntre(9000, 10000, 'A vazão não chegou a 9000 Mb/s. Confira os três enlaces.'), feito: `${br(util(DEZ_GIGA), 2)} Mb/s. O arquivo de câmera que levava minutos agora leva segundos.` }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Dez vezes, de novo e de novo',
        texto: ['Cada geração multiplicou a taxa e manteve o quadro. As principais:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Nome', 'Taxa', 'Meio', 'Alcance', 'Como'],
          linhas: [
            ['100BASE-TX', '100 Mb/s', 'Cat5, 2 pares', '100 m', 'um par para cada sentido'],
            ['100BASE-FX', '100 Mb/s', 'fibra multimodo', '2 km', 'um par de fibras'],
            ['1000BASE-T', '1 Gb/s', 'Cat5e, 4 pares', '100 m', 'os 4 pares nos dois sentidos, 5 níveis por símbolo'],
            ['1000BASE-SX / LX', '1 Gb/s', 'fibra multimodo / monomodo', 'centenas de metros / quilômetros', '850 nm / 1310 nm'],
            ['10GBASE-T', '10 Gb/s', 'Cat6a (Cat6 até 55 m)', '100 m', 'só full-duplex'],
            ['10GBASE-SR / LR', '10 Gb/s', 'multimodo OM3, OM4 / monomodo', '300 m, 400 m / 10 km', '850 nm / 1310 nm'],
            ['40GBASE e 100GBASE', '40 e 100 Gb/s', 'fibras em paralelo ou várias cores numa fibra', 'de metros a dezenas de km', '4 pistas de 10 ou 4 de 25 Gb/s'],
          ],
        },
      },
      {
        titulo: 'Gigabit nos quatro pares',
        texto: [
          'O 1000BASE-T manda e recebe ao mesmo tempo em cada um dos quatro pares. Um circuito de cancelamento de eco tira do sinal recebido o que a própria placa acabou de mandar.',
          '125 milhões de símbolos por segundo por par, 2 bits de dado por símbolo: 250 Mb/s por par, 1000 Mb/s nos quatro.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'placa A', x: 90, y: 120 },
            { id: 'b', rotulo: 'placa B', x: 510, y: 120 },
          ],
          ligacoes: [
            ['a', 'b', '4 pares × 250 Mb/s'],
            ['b', 'a', '4 pares × 250 Mb/s, ao mesmo tempo'],
          ],
        },
      },
      {
        titulo: 'Pistas: 40 e 100 Gb/s',
        texto: ['Em vez de um sinal cada vez mais rápido, vários sinais em paralelo. Fibras separadas para perto, cores de luz diferentes na mesma fibra para longe.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Taxa', 'Pistas', 'Para perto (multimodo)', 'Para longe (monomodo)'],
          linhas: [
            ['40 Gb/s', '4 × 10 Gb/s', '4 fibras para cada sentido', '4 comprimentos de onda numa fibra'],
            ['100 Gb/s', '4 × 25 Gb/s (ou 10 × 10)', '4 fibras para cada sentido', '4 comprimentos de onda numa fibra'],
          ],
        },
      },
      {
        titulo: 'Autonegociação',
        texto: ['As duas portas anunciam o que sabem fazer e ficam com o melhor em comum. Se o meio não aguenta, o enlace fica na velocidade que funciona.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Placa A', 'Placa B', 'Cabo', 'Fica em'],
          linhas: [
            ['10 Gb/s', '10 Gb/s', 'Cat5e, 30 m', '1 Gb/s'],
            ['10 Gb/s', '10 Gb/s', 'Cat6, 30 m', '10 Gb/s'],
            ['10 Gb/s', '10 Gb/s', 'Cat6, 80 m', '1 Gb/s'],
            ['10 Gb/s', '10 Gb/s', 'Cat6a, 80 m', '10 Gb/s'],
            ['10 Gb/s', '100 Mb/s', 'Cat6a, 15 m', '100 Mb/s'],
          ],
        },
      },
      {
        titulo: 'Por que a Ethernet venceu',
        texto: [
          'Era simples e barata, e cada geração conversava com a anterior. O quadro e o endereço MAC não mudaram desde os 10 Mb/s, então trocar o switch nunca obrigou a trocar o resto.',
          'Quando a disputa virou problema, a Ethernet largou a disputa: switch e full-duplex. Quando o cobre ficou curto, foi para a fibra. Quando um sinal só ficou curto, foram várias pistas. O nome ficou; quase todo o resto mudou.',
        ],
      },
    ],
    checagem: {
      pergunta: 'Duas placas de 10 Gb/s ligadas por um cabo Cat5e de 30 m. Em que velocidade o enlace fica?',
      opcoes: ['1 Gb/s', '10 Gb/s', '100 Mb/s', 'Não sobe'],
      certa: 0,
      explicacao: 'As placas anunciam 10 Gb/s, mas o Cat5e não sustenta o 10GBASE-T. O enlace fica na melhor velocidade que funciona no cabo: 1 Gb/s, com os quatro pares.',
    },
  },
  desafio: {
    carta: [
      'O laboratório da escola recebeu uma estação de 10 Gb/s para o curso de edição, e o rack da secretaria tem um servidor de 10 Gb/s. Entre eles há um cabo Cat6 de 80 m, um switch e uma fibra OM3 de 200 m até o rack. A vazão está zerada.',
      'Pelo jeito, alguém montou a fibra com um transceptor de cada gaveta.',
      'Objetivo: os dois enlaces a 10 Gb/s, vazão do laboratório até o servidor acima de 9000 Mb/s, e a pergunta respondida.',
    ],
    dicas: [
      'Os dois lados da fibra precisam do mesmo transceptor. Fibra OM3 é multimodo, e 10 Gb/s em multimodo é 850 nm.',
      'Cat6 leva 10 Gb/s só até 55 m. Para 80 m, precisa de Cat6a.',
    ],
    perguntas: d68,
    respostas: { '1': '4' },
    montar: () => {
      const m = novoMundo(3368);
      adicionar(m, pc('lab', { velocidades: PORTAS_10G, modelo: 'Estação de edição do laboratório, placa de 10 Gb/s' }));
      adicionar(m, pc('servidor', { velocidades: PORTAS_10G, modelo: 'Servidor da secretaria, placa de 10 Gb/s' }));
      adicionar(m, comSfp(comutador('sw-escola', { modelo: 'Switch do laboratório, 4 portas de 10 Gb/s e 1 SFP', portas: 4, velocidades: PORTAS_10G, sfp: 1 }), 'SR-10G', 'sfp1'));
      adicionar(m, comSfp(comutador('sw-rack', { modelo: 'Switch do rack da secretaria, 4 portas de 10 Gb/s e 1 SFP', portas: 4, velocidades: PORTAS_10G, sfp: 1 }), 'LX-10', 'sfp1'));
      ligar(m, { equip: 'lab', porta: 'eth0' }, { equip: 'sw-escola', porta: 'p1' }, 'cat6', 80, { id: 'c1' });
      ligar(m, { equip: 'sw-escola', porta: 'sfp1' }, { equip: 'sw-rack', porta: 'sfp1' }, 'fibra', 200, { id: 'c2', segmentos: [{ nome: 'tronco', fibra: 'om3', metros: 200 }] });
      ligar(m, { equip: 'sw-rack', porta: 'p1' }, { equip: 'servidor', porta: 'eth0' }, 'cat6a', 5, { id: 'c3' });
      m.proxCabo = 4;
      m.flags.servidorTeste = 'servidor';
      return m;
    },
    objetivo: (m) => {
      const v = vazaoMedida(m);
      const e2 = enlace(m, 'c2');
      return [
        item('fibra (c2) a 10 Gb/s', dezGiga(m, 'c2'), e2.up ? `${e2.velocidade} Mb/s` : e2.motivos[0]),
        item('cabo do laboratório (c1) a 10 Gb/s', dezGiga(m, 'c1'), `${enlace(m, 'c1').velocidade} Mb/s`),
        item('vazão do laboratório até o servidor acima de 9000 Mb/s', v > 9000, v < 0 ? 'ainda não mediu' : `${br(v, 2)} Mb/s`),
        ...todasRespondidas(m, d68),
      ];
    },
    solucao: [
      ['equip', 'sw-rack', 'sfp:sfp1', { modelo: 'SR-10G' }],
      ['cabo', 'c1', 'trocar', { meio: 'cat6a' }],
      ['equip', 'lab', 'vazao'],
    ],
  },
};

export const ATO3C: Dia[] = [dia66, dia67, dia68];
