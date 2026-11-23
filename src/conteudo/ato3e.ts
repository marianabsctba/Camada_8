// Dias do ato 3 (O Bairro), com prática guiada, aula e desafio no próprio dia.
// Bairros Sul e Leste: o DOCSIS por dentro, a ponte que aprende e o spanning tree.

import { coaxDados } from '../motor/fisico';
import { canal, vazaoAlohaSlotted, type EstadoMac, type ResultadoMac } from '../motor/mac';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, type ElementoCoax, type Mundo } from '../motor/mundo';
import { calcularStp, stpLigado, tabelaMac } from '../motor/rede';
import { LUZ, lerCidr } from '../motor/util';
import { enlace, item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Número com vírgula decimal, para os textos. */
const br = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');
const pct = (x: number) => `${br(x * 100, 1)} %`;
const cidr = (s: string) => lerCidr(s)!;

/* ---------- DOCSIS: coaxial, modem e a subida em disputa ---------- */

/** Velocidade do sinal no coaxial, como o motor calcula a propagação: 85 % da luz. */
const V_COAX = 0.85 * LUZ;
/** Atraso de ida e volta entre o CMTS e um modem a "km" quilômetros, em µs. */
const idaVoltaUs = (km: number) => ((2 * km * 1000) / V_COAX) * 1e6;

function ruaCoax(m: Mundo, tapDbmv: number, elementos: ElementoCoax[], modeloModem: string) {
  adicionar(m, aparelho('tap', 'cmts', 'Tap da rede do CMTS no poste', [{ nome: 'saida', fisica: 'coax' }]));
  adicionar(m, aparelho('modem', 'cablemodem', modeloModem, [{ nome: 'rf', fisica: 'coax' }, { nome: 'lan' }]));
  ligar(m, { equip: 'tap', porta: 'saida' }, { equip: 'modem', porta: 'rf' }, 'coax', 40, { id: 'c1', coax: { tapDbmv, elementos } });
  m.proxCabo = 2;
}

const nivelDe = (m: Mundo) => coaxDados(m.cabos.get('c1')!).nivel;
const modemIdeal = (m: Mundo) => {
  const e = enlace(m, 'c1');
  const n = nivelDe(m);
  return [item('modem ONLINE', e.up, e.up ? undefined : e.motivos[0]), item('nível de descida entre -7 e +7 dBmV', n >= -7 && n <= 7, `${br(n)} dBmV`)];
};

const estadoCanal = (m: Mundo) => m.equipamentos.get('subida')!.s.mac as EstadoMac;
/** A última simulação foi com a configuração que está no canal agora? */
const simulouAgora = (m: Mundo) => !!m.flags.ultimoMac && m.flags.macDoUltimo === JSON.stringify(estadoCanal(m));
const subidaCerta = (m: Mundo) => {
  const s = estadoCanal(m);
  const r = m.flags.ultimoMac as ResultadoMac | undefined;
  return item(
    'subida simulada com ALOHA com intervalos e G = 1',
    simulouAgora(m) && s.protocolo === 'aloha-slotted' && Math.abs(s.carga - 1) < 1e-9,
    r ? `última: ${r.protocolo}, G = ${br(s.carga, 2)}, vazão ${pct(r.vazao)}${simulouAgora(m) ? '' : ' (mudou depois de simular)'}` : 'ainda não simulou',
  );
};

/* ======================================================================
 * 72: DOCSIS por dentro (4.6)
 * ====================================================================== */

const KM72 = 5.1;
const S72_ANTES = vazaoAlohaSlotted(3);
const S72_DEPOIS = vazaoAlohaSlotted(1);

const p72: Pergunta[] = [
  numerica(
    '1',
    `A oficina fica a ${br(KM72)} km do CMTS, e no coaxial o sinal anda a 85 % da velocidade da luz (uns 254.800 km/s). Quanto o modem precisa adiantar a transmissão, em µs, para o pedido cair no minislot certo?`,
    idaVoltaUs(KM72),
    1,
  ),
  numerica('2', 'Com 30 pedidos de banda espalhados por 30 minislots de disputa (G = 1), quantos pedidos passam sem colidir em uma rodada, em média?', 30 * S72_DEPOIS, 0.5),
];

const d72: Pergunta[] = [numerica('1', 'O ateliê fica a 2,55 km do CMTS. Quanto o modem precisa adiantar a transmissão, em µs?', idaVoltaUs(2.55), 1)];

const dia72: Dia = {
  numero: 72,
  ato: 3,
  titulo: 'DOCSIS por dentro',
  chamado: [
    'CHAMADO #0072',
    'No Bairro Sul, a Oficina de Bicicletas Pedal Torto assinou internet pelo cabo. O modem acende, pisca e desiste. O técnico jura que "sinal forte é sinal bom" e ligou a casa direto no tap mais quente da rua.',
    'Junto veio um bilhete da central do cabo: na hora do almoço, os pedidos de banda da rua inteira brigam pelos poucos minislots de disputa da subida, e quase nenhum passa.',
    'Objetivo: modem ONLINE com nível entre -7 e +7 dBmV, a subida simulada com G = 1 e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'A subcamada MAC do cabo',
    texto: [
      'O DOCSIS é a subcamada MAC do cabo coaxial. Um CMTS, na ponta da rede, conversa com todos os modems da rua pelo mesmo cabo. Na descida, só o CMTS fala: é difusão, todo modem recebe tudo e fica com o que é dele, com o tráfego cifrado. Na subida, os modems dividem um canal, e alguém precisa organizar a vez. Esse alguém é o CMTS.',
      'Antes de falar, o modem precisa saber onde está. Ao entrar na rede, ele sintoniza a descida, lê as mensagens do CMTS e faz o ranging: manda um sinal num intervalo reservado para isso, o CMTS mede quanto ele chegou atrasado e devolve a correção de tempo (e de potência). Um modem longe recebe tudo atrasado e, se não se corrigir, fala atrasado também: o pedido dele invade o minislot do vizinho.',
      'O tempo da subida é cortado em minislots. Uma parte deles é de disputa: qualquer modem manda ali um pedido curto de banda. Se dois pedidos caem no mesmo minislot, colidem, e cada modem espera um tempo aleatório para tentar de novo. É ALOHA com intervalos, com o pico conhecido de 36,8 % quando há, em média, um pedido por minislot (G = 1).',
      'O CMTS junta os pedidos que chegaram inteiros e publica, pela descida, o MAP: qual modem transmite em quais minislots da próxima rodada. Quem já tem reserva pode pedir mais banda de carona no próprio dado, sem disputar. A arte do CMTS é dosar quantos minislots ficam para disputa: poucos demais e os pedidos colidem; muitos demais e sobra pouco para os dados.',
      'Na bancada dá para medir o coaxial e ler o modem. O ranging e os minislots o motor não simula um a um: o canal "subida" aproxima a disputa dos pedidos com ALOHA com intervalos, em que o quadro é o pedido e o tempo de quadro é um minislot.',
    ],
  },
  dicas: [
    'Leia o modem: ele diz se falta ou se sobra sinal. Acima de +15 dBmV o receptor satura.',
    'Sobra sinal: ponha um atenuador que traga o nível para dentro da janela de -7 a +7. Na subida, G é pedidos por minislot.',
    'Atenuador de 10 dB no c1. Na subida, carga 1. Ida e volta a 5,1 km dá uns 40 µs; 30 × 36,8 % dá uns 11 pedidos.',
  ],
  perguntas: p72,
  montar: () => {
    const m = novoMundo(372);
    ruaCoax(m, 20, [{ tipo: 'cabo', modelo: 'rg6', metros: 20 }, { tipo: 'conector' }], 'Cable modem DOCSIS 3.1 da oficina');
    adicionar(m, canal('subida', { protocolo: 'aloha-slotted', carga: 3, estacoes: 30 }, 'Subida do nó Sul: minislots de disputa (aproximação por ALOHA com intervalos)'));
    return m;
  },
  objetivo: (m) => [...modemIdeal(m), subidaCerta(m), ...todasRespondidas(m, p72)],
  posMorte: [
    `O tap da rua entregava +20 dBmV, e o caminho até a oficina só perdia 3,9 dB: chegavam ${br(20 - 3.7 - 0.2)} dBmV, acima dos +15 que o receptor aguenta. O atenuador de 10 dB trouxe o nível para ${br(20 - 3.7 - 0.2 - 10)} dBmV. Em RF, o certo não é "mais sinal", é o sinal na janela.`,
    `Com o modem na rede, o ranging resolveu a distância: a ${br(KM72)} km, a ida e a volta somam uns ${br(idaVoltaUs(KM72), 0)} µs, e o modem passou a falar adiantado exatamente isso. Na subida, 30 pedidos em 10 minislots de disputa davam G = 3 e só ${pct(S72_ANTES)} dos minislots aproveitados, cerca de ${br(10 * S72_ANTES)} pedido por rodada. Com 30 minislots de disputa, G = 1 e ${pct(S72_DEPOIS)}: uns ${br(30 * S72_DEPOIS, 0)} pedidos passam.`,
    'O preço: os 20 minislots extras de disputa saem dos dados. Por isso o CMTS ajusta essa conta o tempo todo, conforme a rua acorda, almoça e assiste à novela.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'modem'],
      acao: 'status',
      instrucao: 'Leia o modem da oficina.',
      porque: 'O modem diz o nível que chega da descida e por que não entra na rede. Antes de pensar em minislot, o sinal precisa estar certo: sem descida, o modem nem escuta o MAP.',
      conferir: () => true,
      feito: 'OFFLINE: o nível passa de +15 dBmV e o receptor satura. Aqui o problema é sinal demais, não de menos.',
    }),
    passo({
      alvo: ['cabo', 'c1'],
      acao: 'coax-atenuador',
      pedir: ['db'],
      exemplo: { db: '10' },
      instrucao: 'Ponha um atenuador na descida da oficina.',
      porque: 'Chegam cerca de 16 dBmV e a janela ideal vai de -7 a +7. O atenuador precisa tirar o suficiente para cair dentro dela, não só abaixo de +15.',
      conferir: (m) => {
        const n = nivelDe(m);
        if (n > 15) return `Ainda ${br(n)} dBmV: o receptor continua saturado. Tire o atenuador (Tirar uma peça) e ponha um maior.`;
        if (n > 7) return `${br(n)} dBmV: o modem até sobe, mas fora da janela ideal. Tire esse atenuador e ponha um maior.`;
        if (n < -7) return `${br(n)} dBmV: agora falta sinal. Tire um dos atenuadores.`;
        return true;
      },
      feito: 'Nível perto de +6 dBmV, dentro da janela. O modem sincroniza a descida, lê as mensagens do CMTS e parte para o ranging.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Para medir o atraso até o CMTS e adiantar a própria transmissão, para o pedido chegar dentro do minislot certo',
          'Para descobrir a velocidade máxima do cabo coaxial',
          'Para escolher o canal de TV que vai passar a internet',
          'Para avisar os vizinhos que um modem novo chegou e eles se calarem',
        ],
        certa: 0,
        errada: {
          1: 'A velocidade do canal é a da modulação. O ranging mede tempo e potência, não velocidade.',
          2: 'O canal da descida o modem já achou antes, sintonizando. O ranging vem depois.',
          3: 'Os vizinhos não conversam entre si: tudo passa pelo CMTS. Quem precisa saber do modem novo é ele.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o modem faz o ranging antes de pedir banda?',
      porque: 'Os minislots são marcados no relógio do CMTS. Um modem longe recebe o MAP atrasado e, se transmitir no horário que leu, chega mais atrasado ainda.',
      feito: 'O CMTS mede o atraso e devolve a correção. Depois disso, cada modem fala adiantado na medida certa, e os pedidos chegam alinhados aos minislots, perto ou longe.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: br(idaVoltaUs(KM72), 0) },
      instrucao: 'Calcule quanto o modem da oficina precisa adiantar a transmissão.',
      porque: `O MAP leva ${br(KM72)} km para descer e o pedido leva ${br(KM72)} km para subir: o adiantamento é a ida e a volta. Tempo = 2 × 5.100 m ÷ 254.800.000 m/s, em µs.`,
      feito: `Uns ${br(idaVoltaUs(KM72), 0)} µs. Parece nada, mas um minislot é curto: sem essa correção, o pedido de quem mora longe pisa no minislot seguinte.`,
    }),
    passo({
      alvo: ['equip', 'subida'],
      acao: 'canal-simular',
      instrucao: 'Simule a subida do jeito que está.',
      porque: 'Na hora do almoço, 30 modems pedem banda e o CMTS deixou só 10 minislots de disputa: G = 3 pedidos por minislot. Veja quantos minislots carregam um pedido inteiro.',
      conferir: (m) => (m.flags.ultimoMac ? true : 'A simulação não rodou.'),
      feito: `Só ${pct(S72_ANTES)}: quase todo minislot tem dois ou mais pedidos se atropelando. Os modems recuam, tentam de novo e colidem outra vez.`,
    }),
    passo({
      alvo: ['equip', 'subida'],
      acao: 'canal-carga',
      pedir: ['g'],
      exemplo: { g: '1' },
      instrucao: 'Faça o CMTS abrir minislots de disputa até G ficar no pico do ALOHA com intervalos.',
      porque: 'G é pedidos por minislot. Com os mesmos 30 pedidos, mais minislots de disputa baixam G. O pico de vazão do ALOHA com intervalos é com um pedido por minislot, em média.',
      conferir: (m) => {
        const s = estadoCanal(m);
        if (s.protocolo !== 'aloha-slotted') return 'O protocolo mudou. Volte para ALOHA com intervalos.';
        if (Math.abs(s.carga - 1) > 1e-9) return `Com G = ${br(s.carga, 2)}, a vazão fica abaixo do pico. O pico do ALOHA com intervalos é em G = 1.`;
        return true;
      },
      feito: `${pct(S72_DEPOIS)} dos minislots de disputa com um pedido inteiro, o máximo que essa disputa entrega. O resto é colisão ou minislot vazio.`,
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: br(30 * S72_DEPOIS, 0) },
      instrucao: 'Quantos pedidos passam por rodada, agora com 30 minislots de disputa?',
      porque: `Cada minislot de disputa tem ${pct(S72_DEPOIS)} de chance de levar um pedido inteiro. São 30 minislots.`,
      feito: `Uns ${br(30 * S72_DEPOIS, 0)} pedidos por rodada, contra ${br(10 * S72_ANTES)} antes. Quem passou ganha reserva no próximo MAP; quem colidiu tenta de novo depois de um recuo.`,
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Um CMTS, a rua inteira',
        texto: [
          'O DOCSIS é a subcamada MAC do cabo. Na descida, só o CMTS transmite, e todo modem escuta tudo: difusão. Na subida, os modems dividem o mesmo canal, e o CMTS decide quem fala quando.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'CMTS', x: 90, y: 120 },
            { id: 'a', rotulo: 'modem perto', x: 480, y: 40 },
            { id: 'b', rotulo: 'modem da oficina', x: 480, y: 120 },
            { id: 'd', rotulo: 'modem longe', x: 480, y: 200 },
          ],
          ligacoes: [
            ['c', 'a', 'descida: todos ouvem'],
            ['c', 'b', 'descida e MAP'],
            ['d', 'c', 'subida: na vez dele'],
          ],
        },
      },
      {
        titulo: 'Ranging: quanto falta para chegar',
        texto: [
          'Ao entrar, o modem manda um sinal num intervalo reservado. O CMTS mede o atraso e devolve a correção de tempo e de potência. O modem passa a transmitir adiantado o tempo de ida e volta.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Distância até o CMTS', 'Descida do MAP', 'Subida do pedido', 'Adiantamento'],
          linhas: [1.7, KM72].map((km) => [`${br(km)} km`, `${br(idaVoltaUs(km) / 2)} µs`, `${br(idaVoltaUs(km) / 2)} µs`, `${br(idaVoltaUs(km))} µs`]),
        },
      },
      {
        titulo: 'Minislots e o MAP',
        texto: [
          'A subida é cortada em minislots. Nos de disputa, qualquer modem manda um pedido curto; nos reservados, só quem o MAP mandou. Quem já tem reserva pede mais de carona no próprio dado.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Minislots da rodada', 'Uso, segundo o MAP'],
          linhas: [
            ['primeiros', 'ranging de quem acabou de chegar'],
            ['seguintes', 'disputa: pedidos de banda de qualquer modem'],
            ['o resto', 'dados, reservados a quem pediu na rodada anterior'],
          ],
        },
      },
      {
        titulo: 'A disputa dos pedidos',
        texto: [
          'Os pedidos nos minislots de disputa se comportam como ALOHA com intervalos: S = G·e^(-G), com G em pedidos por minislot. Mais minislots de disputa baixam G, mas roubam espaço dos dados.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Pedidos por minislot (G)', 'Minislots com um pedido inteiro (S)'],
          linhas: [3, 1, 0.5].map((g) => [br(g, 1), pct(vazaoAlohaSlotted(g))]),
        },
      },
      {
        titulo: 'Onde o DOCSIS mora',
        texto: ['Por cima do coaxial e dos canais QAM, o DOCSIS cuida de quem fala quando. Por cima dele, o tráfego da casa segue como qualquer outro.'],
        visual: { tipo: 'camadas', camadas: ['IP (o tráfego da oficina)', 'MAC DOCSIS: ranging, pedidos, MAP', 'física: canais QAM no coaxial'], rotulo: 'o cabo, de cima para baixo' },
      },
    ],
    checagem: {
      pergunta: 'Dois modems, um a 1,7 km e outro a 5,1 km do CMTS, recebem o mesmo MAP. Sem ranging, o que acontece?',
      opcoes: [
        'O de 5,1 km transmite atrasado em relação ao relógio do CMTS e pode invadir o minislot seguinte',
        'Nada: os dois recebem o MAP no mesmo instante',
        'O de 1,7 km fica sem descida',
        'O CMTS muda a velocidade do canal para o mais longe',
      ],
      certa: 0,
      explicacao: 'O MAP chega a cada modem com o atraso da distância, e o pedido sobe com o mesmo atraso. O ranging mede essa ida e volta e manda cada modem se adiantar, para todos caberem nos minislots certos.',
    },
  },
  desafio: {
    carta: [
      'Do outro lado do Bairro Sul, o ateliê de cerâmica tem um ponto de internet só, mas o técnico de antena deixou um divisor de 4 vias "para o futuro". O modem entra na rede, com o nível lá embaixo.',
      'E a central do cabo trocou o firmware de teste da subida: agora os modems mandam pedidos fora do compasso dos minislots, e a hora do almoço virou gritaria.',
      'Objetivo: modem com nível entre -7 e +7 dBmV, a subida em ALOHA com intervalos e G = 1, e a pergunta respondida.',
    ],
    dicas: [
      'Veja a descida peça por peça: o que perde muito e não serve para nada numa casa com um ponto só?',
      'Na subida, pedido fora do minislot é ALOHA puro. Volte para ALOHA com intervalos e ajuste G para o pico.',
      'Ida e volta, em µs: 2 × distância ÷ 254.800 km/s.',
    ],
    perguntas: d72,
    respostas: { '1': br(idaVoltaUs(2.55), 0) },
    montar: () => {
      const m = novoMundo(3072);
      ruaCoax(m, 8, [{ tipo: 'cabo', modelo: 'rg59', metros: 50 }, { tipo: 'splitter', vias: 4 }, { tipo: 'conector' }], 'Cable modem DOCSIS 3.1 do ateliê');
      adicionar(m, canal('subida', { protocolo: 'aloha', carga: 2, estacoes: 30 }, 'Subida do nó Sul: minislots de disputa (aproximação por ALOHA)'));
      return m;
    },
    objetivo: (m) => [...modemIdeal(m), subidaCerta(m), ...todasRespondidas(m, d72)],
    solucao: [
      ['cabo', 'c1', 'coax-remover', { n: '2' }],
      ['equip', 'subida', 'canal-protocolo', { p: 'aloha-slotted' }],
      ['equip', 'subida', 'canal-carga', { g: '1' }],
    ],
  },
};

/* ======================================================================
 * 73: A ponte que aprende (4.7.1 e 4.7.2)
 * ====================================================================== */

const macDe = (m: Mundo, nome: string) => m.equipamentos.get(nome)!.mac;
const portaNaTabela = (m: Mundo, sw: string, host: string) => tabelaMac(m.equipamentos.get(sw)!)[macDe(m, host)];

const p73: Pergunta[] = [numerica('1', 'Depois de esvaziar a tabela, quantos quadros a ponte inundou no ping de 4 pedidos?', (m) => m.flags.inundacoes ?? 0, 0)];

const d73: Pergunta[] = [numerica('1', 'Se ninguém fizer nada, quantos segundos sem ouvir o caixa até o envelhecimento apagar sozinho a entrada velha?', 300, 0)];

const dia73: Dia = {
  numero: 73,
  ato: 3,
  titulo: 'A ponte que aprende',
  chamado: [
    'CHAMADO #0073',
    'A biblioteca e o posto de saúde do Bairro Sul dividiam um hub só, e cada vídeo do telecentro travava o prontuário do posto. A prefeitura cortou a rede em duas metades, cada uma com o seu hub, e pôs uma ponte de duas portas no meio.',
    'A enfermeira-chefe quer saber se a ponte "sabe o que está fazendo" ou se só repete tudo como o hub velho.',
    'Objetivo: ping da biblioteca ao posto sem perda, a ponte com o posto aprendido na porta certa, uma inundação vista depois de esvaziar a tabela e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Pontes e switches que aprendem',
    texto: [
      'Uma ponte liga duas ou mais LANs na camada de enlace. Serve para juntar redes que nasceram separadas, para esticar a rede além do que um segmento aguenta e, principalmente, para separar tráfego: o que é de uma metade fica naquela metade. Um switch é uma ponte com muitas portas.',
      'A ponte não vem configurada. Ela aprende sozinha olhando o endereço de origem de cada quadro que chega: "esse MAC mora atrás da porta por onde o quadro entrou". É o aprendizado pela origem, guardado na tabela de endereços MAC.',
      'Para decidir o que fazer, ela olha o destino. Se o destino está na tabela, em outra porta, encaminha só para lá. Se está na mesma porta por onde o quadro entrou, descarta: o destino já ouviu, do lado de lá. Se não está na tabela, inunda: manda por todas as portas menos a de entrada. Broadcast, como o pedido de ARP, sempre sai por todas.',
      'A tabela envelhece. Uma entrada que fica 300 s sem ser renovada por um quadro daquele MAC é apagada, porque o computador pode ter mudado de porta ou de lugar. Enquanto a ponte não reaprende, ela volta a inundar.',
    ],
  },
  dicas: [
    'Faça um ping que atravesse a ponte e depois leia a tabela dela.',
    'Esvazie a tabela da ponte e faça o ping de novo: conte quantas vezes ela inundou.',
    'Ping de biblioteca para 192.0.2.30, mac-limpar na ponte, ping de novo. Foi 1 inundação.',
  ],
  perguntas: p73,
  montar: () => {
    const m = novoMundo(373);
    adicionar(m, pc('biblioteca', { ip: cidr('192.0.2.10/24'), modelo: 'PC do balcão da biblioteca' }));
    adicionar(m, pc('telecentro', { ip: cidr('192.0.2.11/24'), modelo: 'PC do telecentro, sempre num vídeo' }));
    adicionar(m, pc('posto', { ip: cidr('192.0.2.30/24'), modelo: 'PC do prontuário do posto de saúde' }));
    adicionar(m, pc('recepcao', { ip: cidr('192.0.2.31/24'), modelo: 'PC da recepção do posto' }));
    adicionar(m, comutador('hub-biblioteca', { tipo: 'hub', portas: 4, velocidades: [10, 100], modelo: 'Hub de 100 Mb/s da biblioteca' }));
    adicionar(m, comutador('hub-posto', { tipo: 'hub', portas: 4, velocidades: [10, 100], modelo: 'Hub de 100 Mb/s do posto' }));
    adicionar(m, comutador('ponte', { portas: 2, modelo: 'Ponte de duas portas entre a biblioteca e o posto' }));
    ligar(m, { equip: 'biblioteca', porta: 'eth0' }, { equip: 'hub-biblioteca', porta: 'p1' }, 'cat6', 10);
    ligar(m, { equip: 'telecentro', porta: 'eth0' }, { equip: 'hub-biblioteca', porta: 'p2' }, 'cat6', 15);
    ligar(m, { equip: 'hub-biblioteca', porta: 'p4' }, { equip: 'ponte', porta: 'p1' }, 'cat6', 40, { id: 'c3' });
    ligar(m, { equip: 'ponte', porta: 'p2' }, { equip: 'hub-posto', porta: 'p4' }, 'cat6', 40, { id: 'c4' });
    ligar(m, { equip: 'posto', porta: 'eth0' }, { equip: 'hub-posto', porta: 'p1' }, 'cat6', 10, { id: 'c5' });
    ligar(m, { equip: 'recepcao', porta: 'eth0' }, { equip: 'hub-posto', porta: 'p2' }, 'cat6', 12, { id: 'c6' });
    m.proxCabo = 7;
    return m;
  },
  objetivo: (m) => {
    const p = portaNaTabela(m, 'ponte', 'posto');
    return [
      pingOk(m, 'biblioteca', '192.0.2.30', 4),
      item('a ponte sabe que o posto está na porta p2', p === 'p2', p ?? 'não está na tabela'),
      item('pelo menos uma inundação vista', (m.flags.inundacoes ?? 0) >= 1, `${m.flags.inundacoes ?? 0} até agora`),
      ...todasRespondidas(m, p73),
    ];
  },
  posMorte: [
    'O primeiro ping começou com um pedido de ARP em broadcast. A ponte o espalhou pelas duas portas e, de quebra, aprendeu que a biblioteca mora atrás da p1. A resposta do posto veio direto para a biblioteca, e a ponte aprendeu o posto na p2, pela origem. Daí em diante, cada eco foi só para a porta certa.',
    'Esvaziar a tabela é o envelhecimento com pressa. No ping seguinte, o ARP já estava guardado na biblioteca, o eco saiu direto para o MAC do posto, e a ponte, sem saber onde ele mora, inundou uma vez. A resposta ensinou de novo, e os outros três ecos passaram sem inundar.',
    'O que o telecentro manda para a biblioteca chega na ponte pela p1 e tem destino na p1: descartado. O vídeo fica na metade da biblioteca, e o prontuário do posto respira.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'biblioteca'],
      acao: 'ping',
      valores: { destino: '192.0.2.30', n: '4' },
      instrucao: 'Faça um ping da biblioteca até o posto.',
      porque: 'O quadro atravessa as duas metades pela ponte. Antes do eco vai o ARP, em broadcast, perguntando quem é 192.0.2.30. Cada quadro que passa ensina alguma coisa à ponte.',
      conferir: (m) => ((registroPing(m, 'biblioteca', '192.0.2.30')?.recebidos ?? 0) > 0 ? true : 'O ping não voltou.'),
      feito: '4 de 4. O ping passou, e nenhum quadro precisou ser inundado: o broadcast do ARP já tinha ensinado a ponte.',
    }),
    passo({
      alvo: ['equip', 'ponte'],
      acao: 'mac-tabela',
      instrucao: 'Leia a tabela de endereços MAC da ponte.',
      porque: 'Ninguém configurou essa tabela. O que estiver ali, a ponte aprendeu sozinha com o ping.',
      conferir: () => true,
      feito: 'Dois endereços: o da biblioteca na p1 e o do posto na p2. O telecentro e a recepção ainda não falaram, então a ponte não sabe deles.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Pela origem: a resposta do ARP saiu do posto e entrou na ponte pela p2',
          'Pelo destino: o pedido de ARP era para o IP do posto',
          'Pelo IP: a ponte lê o endereço 192.0.2.30 e sabe de que lado ele fica',
          'Pelo hub do posto, que avisa a ponte de quem está ligado nele',
        ],
        certa: 0,
        errada: {
          1: 'O destino diz para onde mandar, não onde alguém mora. E o pedido de ARP ia em broadcast, para todo mundo.',
          2: 'A ponte trabalha na camada de enlace: olha MAC, não IP.',
          3: 'Hub não conversa com ninguém. Ele só repete bits.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Como a ponte descobriu que o posto está na p2?',
      porque: 'A ponte só aprende com o que entra por cada porta. A pergunta é: qual quadro do posto entrou nela, e por onde.',
      feito: 'Aprender pela origem, encaminhar pelo destino. A tabela é o resultado de ouvir quem fala, porta por porta.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Descarta: o destino está na mesma porta por onde o quadro entrou',
          'Encaminha para a p2, por garantia',
          'Inunda as duas portas',
          'Devolve o quadro para o telecentro',
        ],
        certa: 0,
        errada: {
          1: 'Mandar para a p2 seria levar o vídeo do telecentro para dentro do posto, que é exatamente o que a prefeitura queria evitar.',
          2: 'Inundar é para destino desconhecido. A biblioteca já está na tabela, na p1.',
          3: 'Ponte não devolve quadro. A biblioteca já recebeu pelo hub, do lado de lá.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O telecentro manda um quadro para a biblioteca. Ele chega na ponte pela p1, e a tabela diz que a biblioteca está na p1. O que a ponte faz?',
      porque: 'O telecentro e a biblioteca estão no mesmo hub: o quadro já chegou à biblioteca antes de chegar à ponte.',
      feito: 'Descarta. É isso que separa o tráfego: o que é da metade da biblioteca não atravessa para o posto.',
    }),
    passo({
      alvo: ['equip', 'ponte'],
      acao: 'mac-limpar',
      instrucao: 'Esvazie a tabela da ponte.',
      porque: 'É o que o envelhecimento faz sozinho depois de 300 s sem ouvir um endereço. Serve para ver o que a ponte faz quando não sabe.',
      conferir: (m) => (Object.keys(tabelaMac(m.equipamentos.get('ponte')!)).length === 0 ? true : 'A tabela ainda tem endereços.'),
      feito: 'Tabela vazia. A ponte esqueceu onde mora todo mundo.',
    }),
    passo({
      alvo: ['equip', 'biblioteca'],
      acao: 'ping',
      valores: { destino: '192.0.2.30', n: '4' },
      instrucao: 'Faça o ping da biblioteca ao posto de novo.',
      porque: 'A biblioteca já guardou o MAC do posto e não pergunta de novo no ARP: o eco sai direto para o MAC do posto. A ponte, de tabela vazia, não sabe para onde mandar.',
      conferir: (m) => ((m.flags.inundacoes ?? 0) >= 1 ? true : 'A ponte não inundou nada. Esvazie a tabela antes do ping.'),
      feito: 'O ping passou de novo, e a ponte inundou o primeiro eco. A resposta do posto ensinou a p2 outra vez.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '1' },
      instrucao: 'Quantos quadros a ponte inundou nesse ping de 4 pedidos?',
      porque: 'Só inunda quem não conhece o destino. Depois do primeiro eco, a resposta do posto passou pela ponte. O que a ponte aprendeu com ela?',
      feito: 'Um só. O primeiro eco foi inundado, a resposta ensinou onde mora o posto e os outros três foram direto para a p2.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Para que serve uma ponte',
        texto: [
          'Juntar LANs que nasceram separadas, esticar a rede além de um segmento e, acima de tudo, separar tráfego: o que é de uma metade não atravessa para a outra. Um switch é uma ponte de muitas portas.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'b', rotulo: 'biblioteca', x: 60, y: 60 },
            { id: 't', rotulo: 'telecentro', x: 60, y: 180 },
            { id: 'h1', rotulo: 'hub da biblioteca', x: 200, y: 120 },
            { id: 'p', rotulo: 'ponte', x: 330, y: 120 },
            { id: 'h2', rotulo: 'hub do posto', x: 460, y: 120 },
            { id: 'po', rotulo: 'posto', x: 590, y: 60 },
            { id: 'r', rotulo: 'recepção', x: 590, y: 180 },
          ],
          ligacoes: [
            ['b', 'h1'],
            ['t', 'h1'],
            ['h1', 'p', 'p1'],
            ['p', 'h2', 'p2'],
            ['h2', 'po'],
            ['h2', 'r'],
          ],
        },
      },
      {
        titulo: 'Aprender pela origem',
        texto: ['Cada quadro que entra ensina: o MAC de origem mora atrás da porta de entrada. A tabela se monta sozinha, só de ouvir.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Quadro que entrou', 'Pela porta', 'A ponte anota'],
          linhas: [
            ['ARP da biblioteca (broadcast)', 'p1', 'biblioteca → p1'],
            ['resposta do posto', 'p2', 'posto → p2'],
            ['eco da biblioteca', 'p1', 'biblioteca → p1 (renova)'],
          ],
        },
      },
      {
        titulo: 'Encaminhar pelo destino',
        texto: ['Com a tabela, a ponte decide o que fazer com cada quadro olhando o MAC de destino.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Destino', 'O que a ponte faz'],
          linhas: [
            ['na tabela, em outra porta', 'encaminha só para aquela porta'],
            ['na tabela, na mesma porta de entrada', 'descarta: o destino já ouviu'],
            ['fora da tabela', 'inunda todas as portas menos a de entrada'],
            ['broadcast (ff:ff:ff:ff:ff:ff)', 'manda por todas as portas menos a de entrada'],
          ],
        },
      },
      {
        titulo: 'A tabela envelhece',
        texto: [
          'Entrada sem renovar por 300 s é apagada: o computador pode ter mudado de porta. Até alguém falar de novo, a ponte volta a inundar. Inundar não é erro, é o jeito de a ponte não perder quadro enquanto não sabe.',
        ],
      },
    ],
    checagem: {
      pergunta: 'A tabela da ponte tem o posto na p2. Chega pela p1 um quadro com destino ao MAC do posto. O que acontece?',
      opcoes: ['Sai só pela p2', 'Sai pelas duas portas', 'É descartado', 'A ponte espera o ARP'],
      certa: 0,
      explicacao: 'Destino conhecido em outra porta: encaminha só para lá. Inundar seria para destino desconhecido; descartar, para destino na mesma porta de entrada.',
    },
  },
  desafio: {
    carta: [
      'Na Farmácia do Leste, o computador do caixa mudou da p2 para a p5 do switch, porque a tomada da p2 queimou. O switch continua jurando que o caixa mora na p2.',
      'O caixa é tímido: só fala quando alguém fala com ele, e desde a mudança ninguém falou.',
      'Objetivo: o switch com o caixa aprendido na p5, e a pergunta respondida.',
    ],
    dicas: [
      'A tabela só muda quando o caixa transmite alguma coisa. Faça alguém conversar com ele.',
      'Um ping do servidor até o caixa obriga o caixa a responder. Ou esvazie a tabela e espere ele falar.',
    ],
    perguntas: d73,
    respostas: { '1': '300' },
    montar: () => {
      const m = novoMundo(3073);
      adicionar(m, pc('servidor', { ip: cidr('192.0.2.50/24'), modelo: 'Servidor do estoque da farmácia' }));
      adicionar(m, pc('balanca', { ip: cidr('192.0.2.53/24'), modelo: 'Balança de bebê com rede, não pergunte' }));
      adicionar(m, pc('caixa', { ip: cidr('192.0.2.55/24'), modelo: 'PC do caixa' }));
      const sw = adicionar(m, comutador('sw-farmacia', { modelo: 'Switch da farmácia SF-8' }));
      ligar(m, { equip: 'servidor', porta: 'eth0' }, { equip: 'sw-farmacia', porta: 'p1' }, 'cat6', 8);
      ligar(m, { equip: 'balanca', porta: 'eth0' }, { equip: 'sw-farmacia', porta: 'p3' }, 'cat6', 12);
      ligar(m, { equip: 'caixa', porta: 'eth0' }, { equip: 'sw-farmacia', porta: 'p5' }, 'cat6', 15);
      sw.s.tabelaMac = { [macDe(m, 'servidor')]: 'p1', [macDe(m, 'balanca')]: 'p3', [macDe(m, 'caixa')]: 'p2' };
      return m;
    },
    objetivo: (m) => {
      const p = portaNaTabela(m, 'sw-farmacia', 'caixa');
      return [item('o switch sabe que o caixa está na p5', p === 'p5', p ?? 'não está na tabela'), ...todasRespondidas(m, d73)];
    },
    solucao: [['equip', 'servidor', 'ping', { destino: '192.0.2.55', n: '4' }]],
  },
};

/* ======================================================================
 * 74: Matando o laço (4.7.3)
 * ====================================================================== */

const raizDe = (m: Mundo, sw: string) => calcularStp(m).get(sw)?.raiz;
const papel = (m: Mundo, sw: string, porta: string) => calcularStp(m).get(sw)?.portas[porta];
const todosComStp = (m: Mundo, nomes: string[]) => {
  const sem = nomes.filter((n) => !stpLigado(m.equipamentos.get(n)!));
  return item('STP ligado em todos os switches do laço', sem.length === 0, sem.length ? `desligado em ${sem.join(', ')}` : undefined);
};

const d74: Pergunta[] = [numerica('1', 'Com o sw-praca na raiz, qual é o custo do sw-feira até ela?', 8, 0)];

const dia74: Dia = {
  numero: 74,
  ato: 3,
  titulo: 'Matando o laço',
  chamado: [
    'CHAMADO #0074',
    'Para o Bairro Leste não cair quando um cabo some, a equipe ligou os switches do Sul, do Leste e um terceiro, comprado na promoção, em triângulo. Funcionou por exatos zero segundos: a rede inteira parou, e os LEDs piscam como árvore de Natal.',
    'O mercado e a creche estão sem rede. O switch da promoção veio com o spanning tree desligado de fábrica.',
    'Objetivo: STP ligado nos três, o sw-sul como raiz e ping do mercado à creche sem perda.',
  ],
  manual: {
    titulo: 'Spanning tree: redundância sem laço',
    texto: [
      'Ligar switches em laço é tentador: se um cabo cai, sobra outro caminho. Mas o quadro Ethernet não tem contador de saltos. Um broadcast, como o pedido de ARP, sai por todas as portas, dá a volta no laço, volta, sai de novo e se multiplica. Em segundos, os switches só fazem isso: é a tempestade de broadcast, com CPU a 100 % e nada mais passando.',
      'O spanning tree (STP) mantém os cabos de reserva e desliga logicamente o que fecha laço. Os switches trocam mensagens curtas, as BPDUs, e elegem uma raiz: a de menor identificador, que é a prioridade (padrão 32768, em passos de 4096) e, no empate, o menor MAC.',
      'Cada switch calcula o custo até a raiz somando o custo dos enlaces: 100 para 10 Mb/s, 19 para 100 Mb/s, 4 para 1 Gb/s e 2 para 10 Gb/s. A porta que leva mais barato até a raiz é a porta raiz. Em cada enlace, o lado mais perto da raiz é a porta designada. Toda porta que não é raiz nem designada bloqueia: não passa quadro, só escuta BPDU.',
      'Quando um enlace cai, as BPDUs param de chegar por ele, e a árvore é recalculada: uma porta que estava bloqueada passa a encaminhar. A redundância continua lá, só que adormecida.',
      'Deixar a eleição ao acaso costuma pôr a raiz no switch mais velho ou mais barato, que tem o menor MAC. O certo é escolher a raiz baixando a prioridade do switch do meio da rede.',
    ],
  },
  dicas: [
    'Um switch do laço não manda nem escuta BPDU. Sem ele, a árvore não enxerga o laço.',
    'Com STP nos três, veja quem virou raiz e por quê. A prioridade menor ganha.',
    'STP on no sw-barato, prioridade 4096 no sw-sul e ping do mercado para 192.0.2.22.',
  ],
  montar: () => {
    const m = novoMundo(374);
    adicionar(m, comutador('sw-barato', { modelo: 'Switch da promoção, STP desligado de fábrica' })).s.stp = false;
    adicionar(m, comutador('sw-sul', { modelo: 'Switch do Bairro Sul SG-8' }));
    adicionar(m, comutador('sw-leste', { modelo: 'Switch do Bairro Leste SG-8' }));
    adicionar(m, pc('mercado', { ip: cidr('192.0.2.11/24'), modelo: 'PC do caixa do mercado' }));
    adicionar(m, pc('creche', { ip: cidr('192.0.2.22/24'), modelo: 'PC da secretaria da creche' }));
    ligar(m, { equip: 'mercado', porta: 'eth0' }, { equip: 'sw-sul', porta: 'p1' }, 'cat6', 30);
    ligar(m, { equip: 'creche', porta: 'eth0' }, { equip: 'sw-leste', porta: 'p1' }, 'cat6', 30);
    ligar(m, { equip: 'sw-sul', porta: 'p8' }, { equip: 'sw-leste', porta: 'p8' }, 'cat6', 80);
    ligar(m, { equip: 'sw-leste', porta: 'p7' }, { equip: 'sw-barato', porta: 'p7' }, 'cat6', 60);
    ligar(m, { equip: 'sw-barato', porta: 'p8' }, { equip: 'sw-sul', porta: 'p7' }, 'cat6', 60);
    m.proxCabo = 6;
    return m;
  },
  objetivo: (m) => [
    todosComStp(m, ['sw-barato', 'sw-sul', 'sw-leste']),
    item('sw-sul é a raiz', raizDe(m, 'sw-sul') === 'sw-sul', raizDe(m, 'sw-sul') ?? 'sem árvore'),
    pingOk(m, 'mercado', '192.0.2.22', 4),
  ],
  posMorte: [
    'Com o sw-barato fora da conversa, os outros dois não enxergavam o laço, e o primeiro ARP do mercado girou para sempre no triângulo. Ligar o STP nele fechou a árvore, mas a eleição foi decidida no MAC: o sw-barato, o mais antigo da caixa, virou raiz, e o tráfego do mercado para a creche passava por ele.',
    'Com prioridade 4096, o sw-sul ganhou a eleição. O sw-leste chega na raiz pelo cabo direto, com custo 4 (1 Gb/s), e bloqueia a p7, que fecharia o laço pelo sw-barato. O mercado fala com a creche em linha reta.',
    'Quando o cabo direto saiu, as BPDUs pararam de chegar por ele. A árvore foi recalculada, a p7 do sw-leste virou porta raiz, com custo 8, e o ping voltou pelo caminho de reserva. É para isso que o laço existe.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'mercado'],
      acao: 'ping',
      valores: { destino: '192.0.2.22', n: '4' },
      instrucao: 'Faça um ping do mercado até a creche.',
      porque: 'Antes de mexer, veja o sintoma. O primeiro quadro do ping é um ARP em broadcast, e broadcast sai por todas as portas de todos os switches.',
      conferir: (m) => (m.flags.tempestade ? true : 'Não houve tempestade. Confira se o laço está montado.'),
      feito: 'Tempestade de broadcast. O ARP entrou no triângulo, deu a volta, voltou, saiu de novo e se multiplicou. Sem TTL no Ethernet, nada para o giro.',
    }),
    passo({
      alvo: ['equip', 'sw-barato'],
      acao: 'stp',
      pedir: ['v'],
      exemplo: { v: 'on' },
      instrucao: 'Ligue o spanning tree no switch da promoção.',
      porque: 'Os outros dois rodam STP, mas o sw-barato não manda nem escuta BPDU. Para eles, o laço não existe, e ninguém corta nada.',
      conferir: (m) => (stpLigado(m.equipamentos.get('sw-barato')!) ? true : 'O STP continua desligado. Sem ele, o laço segue lá.'),
      feito: 'STP ligado. A árvore se fecha, e uma porta passa a bloquear. Repare em quem foi eleito raiz.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Os três têm a mesma prioridade, 32768, e no empate ganha o menor MAC, que é o do sw-barato',
          'O sw-barato é o mais rápido dos três',
          'A raiz é sempre o último switch a ligar o STP',
          'O sw-barato está no meio do triângulo',
        ],
        certa: 0,
        errada: {
          1: 'Os três têm portas de 1 Gb/s. Velocidade entra no custo dos enlaces, não na eleição da raiz.',
          2: 'A ordem de ligar não importa: a eleição compara identificadores, prioridade e depois MAC.',
          3: 'Num triângulo ninguém está no meio. E a eleição não olha posição, olha identificador.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o sw-barato virou a raiz?',
      porque: 'O identificador de ponte é a prioridade seguida do MAC, e o menor ganha. Ninguém mexeu na prioridade.',
      feito: 'Eleição no MAC, e o MAC menor costuma ser o do aparelho mais antigo ou mais barato. Com ele na raiz, o tráfego do mercado para a creche dá a volta pelo sw-barato.',
    }),
    passo({
      alvo: ['equip', 'sw-sul'],
      acao: 'stp-prioridade',
      pedir: ['n'],
      exemplo: { n: '4096' },
      instrucao: 'Faça o sw-sul ganhar a eleição da raiz.',
      porque: 'A prioridade vem antes do MAC no identificador. Qualquer valor abaixo de 32768 põe o sw-sul na frente dos outros dois.',
      conferir: (m) => {
        const r = raizDe(m, 'sw-sul');
        return r === 'sw-sul' ? true : `A raiz continua sendo o ${r}. A prioridade do sw-sul precisa ficar abaixo de 32768.`;
      },
      feito: 'O sw-sul é a raiz. O sw-leste chega nela pelo cabo direto, com custo 4, e a p7 dele, que fecharia o laço pelo sw-barato, ficou BLOQUEANDO.',
    }),
    passo({
      alvo: ['equip', 'mercado'],
      acao: 'ping',
      valores: { destino: '192.0.2.22', n: '4' },
      instrucao: 'Faça o ping do mercado até a creche de novo.',
      porque: 'Com uma porta bloqueada, o broadcast não tem mais por onde dar a volta. O ARP chega uma vez em cada switch e para.',
      conferir: (m) => ((registroPing(m, 'mercado', '192.0.2.22')?.recebidos ?? 0) === 4 ? true : 'O ping não passou inteiro.'),
      feito: '4 de 4, em linha reta: mercado, sw-sul, sw-leste, creche.',
    }),
    passo({
      alvo: ['cabo', 'c3'],
      acao: 'desligar',
      instrucao: 'Tire o cabo direto entre o sw-sul e o sw-leste, como se um caminhão tivesse levado o poste.',
      porque: 'A redundância só vale se a árvore se refaz sozinha. Sem o cabo, as BPDUs param de chegar por ele.',
      conferir: (m) => (papel(m, 'sw-leste', 'p7') === 'raiz' ? true : 'A p7 do sw-leste não virou porta raiz.'),
      feito: 'A árvore foi recalculada: a p7 do sw-leste, que estava bloqueada, virou porta raiz, com custo 8 até o sw-sul (dois enlaces de 1 Gb/s).',
    }),
    passo({
      alvo: ['equip', 'mercado'],
      acao: 'ping',
      valores: { destino: '192.0.2.22', n: '4' },
      instrucao: 'Faça o ping mais uma vez, agora sem o cabo direto.',
      porque: 'O caminho de reserva passa pelo sw-barato. Ele estava ali o tempo todo, só que adormecido.',
      conferir: (m) => ((registroPing(m, 'mercado', '192.0.2.22')?.recebidos ?? 0) === 4 ? true : 'O ping não passou inteiro.'),
      feito: '4 de 4 pelo caminho de reserva. O laço existe para isso; o STP existe para ele não matar a rede.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Por que o laço mata',
        texto: [
          'Laço dá redundância, mas o Ethernet não tem TTL. Um broadcast sai por todas as portas, volta pelo outro lado e se multiplica a cada volta: tempestade de broadcast, CPU a 100 %, rede parada.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 's', rotulo: 'sw-sul', x: 120, y: 60 },
            { id: 'l', rotulo: 'sw-leste', x: 480, y: 60 },
            { id: 'b', rotulo: 'sw-barato', x: 300, y: 200 },
          ],
          ligacoes: [
            ['s', 'l', 'ARP'],
            ['l', 'b', 'ARP de novo'],
            ['b', 's', 'e de novo'],
          ],
        },
      },
      {
        titulo: 'A eleição da raiz',
        texto: ['Os switches trocam BPDUs e comparam identificadores: prioridade primeiro, MAC no empate. O menor vira raiz.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Switch', 'Prioridade', 'Quem ganha'],
          linhas: [
            ['sw-barato', '32768', 'raiz por acaso: menor MAC'],
            ['sw-sul', '32768 → 4096', 'raiz de propósito: menor prioridade'],
            ['sw-leste', '32768', 'nunca, enquanto ninguém mexer'],
          ],
        },
      },
      {
        titulo: 'Custo, porta raiz e porta designada',
        texto: ['Cada switch soma o custo dos enlaces até a raiz. A porta mais barata até ela é a raiz; em cada enlace, o lado mais perto da raiz é o designado. O que sobra bloqueia.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Velocidade do enlace', 'Custo'],
          linhas: [
            ['10 Mb/s', '100'],
            ['100 Mb/s', '19'],
            ['1 Gb/s', '4'],
            ['10 Gb/s', '2'],
          ],
        },
      },
      {
        titulo: 'A árvore com o sw-sul na raiz',
        texto: ['O sw-sul encaminha em todas as portas. O sw-barato e o sw-leste chegam nele por um cabo direto. O enlace entre os dois fecharia o laço: a p7 do sw-leste bloqueia e só escuta BPDU.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 's', rotulo: 'sw-sul (raiz)', x: 300, y: 50 },
            { id: 'l', rotulo: 'sw-leste', x: 500, y: 190 },
            { id: 'b', rotulo: 'sw-barato', x: 100, y: 190 },
          ],
          ligacoes: [
            ['s', 'l', 'custo 4'],
            ['s', 'b', 'custo 4'],
            ['b', 'l', 'p7 do sw-leste bloqueada'],
          ],
        },
      },
      {
        titulo: 'Quando um enlace cai',
        texto: [
          'As BPDUs param de chegar pelo enlace que caiu, e a árvore é recalculada. A porta bloqueada vira porta raiz, e o tráfego volta pelo caminho de reserva, com custo maior: 8 em vez de 4.',
        ],
      },
    ],
    checagem: {
      pergunta: 'Num laço de três switches com STP, quantas portas ficam bloqueadas?',
      opcoes: ['Uma: basta cortar um enlace para o laço virar árvore', 'Nenhuma: o STP só avisa', 'Três: uma em cada switch', 'Todas as da raiz'],
      certa: 0,
      explicacao: 'Três switches e três enlaces: uma árvore com três nós precisa de dois enlaces. Bloquear uma ponta do enlace que sobra já desfaz o laço. A raiz nunca bloqueia: todas as portas dela são designadas.',
    },
  },
  desafio: {
    carta: [
      'No Bairro Leste, a praça, a escola, a feira e um switch velho de 100 Mb/s esquecido no armário da feira formam um anel. O switch velho nunca ouviu falar de spanning tree, e o quiosque da praça não alcança a banca da feira.',
      'A equipe quer a raiz na praça, onde chega o enlace do galpão.',
      'Objetivo: STP ligado nos quatro, o sw-praca como raiz, ping do quiosque à banca sem perda e a pergunta respondida.',
    ],
    dicas: [
      'Primeiro tire a tempestade: quem do anel não fala BPDU?',
      'Depois escolha a raiz pela prioridade. Para o custo, some os enlaces do caminho mais barato até a praça: 1 Gb/s custa 4 e 100 Mb/s custa 19.',
    ],
    perguntas: d74,
    respostas: { '1': '8' },
    montar: () => {
      const m = novoMundo(3074);
      adicionar(m, comutador('sw-velho', { velocidades: [10, 100], modelo: 'Switch de 100 Mb/s do armário, sem STP' })).s.stp = false;
      adicionar(m, comutador('sw-praca', { modelo: 'Switch da praça SG-8' }));
      adicionar(m, comutador('sw-escola', { modelo: 'Switch da escola SG-8' }));
      adicionar(m, comutador('sw-feira', { modelo: 'Switch da feira SG-8' }));
      adicionar(m, pc('quiosque', { ip: cidr('198.51.100.10/24'), modelo: 'Quiosque de informações da praça' }));
      adicionar(m, pc('banca', { ip: cidr('198.51.100.40/24'), modelo: 'Maquininha da banca da feira' }));
      ligar(m, { equip: 'quiosque', porta: 'eth0' }, { equip: 'sw-praca', porta: 'p1' }, 'cat6', 20);
      ligar(m, { equip: 'banca', porta: 'eth0' }, { equip: 'sw-feira', porta: 'p1' }, 'cat6', 20);
      ligar(m, { equip: 'sw-praca', porta: 'p8' }, { equip: 'sw-escola', porta: 'p8' }, 'cat6', 70);
      ligar(m, { equip: 'sw-escola', porta: 'p7' }, { equip: 'sw-feira', porta: 'p7' }, 'cat6', 70);
      ligar(m, { equip: 'sw-feira', porta: 'p8' }, { equip: 'sw-velho', porta: 'p8' }, 'cat6', 70);
      ligar(m, { equip: 'sw-velho', porta: 'p7' }, { equip: 'sw-praca', porta: 'p7' }, 'cat6', 70);
      m.proxCabo = 7;
      return m;
    },
    objetivo: (m) => [
      todosComStp(m, ['sw-velho', 'sw-praca', 'sw-escola', 'sw-feira']),
      item('sw-praca é a raiz', raizDe(m, 'sw-feira') === 'sw-praca', raizDe(m, 'sw-feira') ?? 'sem árvore'),
      pingOk(m, 'quiosque', '198.51.100.40', 4),
      ...todasRespondidas(m, d74),
    ],
    solucao: [
      ['equip', 'sw-velho', 'stp', { v: 'on' }],
      ['equip', 'sw-praca', 'stp-prioridade', { n: '4096' }],
      ['equip', 'quiosque', 'ping', { destino: '198.51.100.40', n: '4' }],
    ],
  },
};

export const ATO3E: Dia[] = [dia72, dia73, dia74];
