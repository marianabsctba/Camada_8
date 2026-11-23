// Dias novos do ato 0 (Fim de Linha), com prática guiada, aula e desafio no próprio dia.
// Redes sem fio: a rede de telefonia móvel e o Wi-Fi, em visão geral (seções 1.4.2 e 1.4.3).

import { snrWifi } from '../motor/aparelhos';
import { avaliar, radioDados } from '../motor/fisico';
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

/** Um rádio com antena: a estação rádio-base ou o próprio celular. */
function radio(nome: string, modelo: string, antena: Equipamento['antena'], rumo: number, alturaMax: number): Equipamento {
  const e = aparelho(nome, 'radio', modelo, [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax });
  e.antena = antena;
  return e;
}

/* ======================================================================
 * ref 35: Celular e Wi-Fi (1.4.2 e 1.4.3)
 * ====================================================================== */

const p35: Pergunta[] = [
  numerica('1', 'Qual a média do ping do notebook até o servidor, passando pelo celular, em ms? (uma casa decimal basta)', mediaPing('notebook', '192.0.2.1'), 0.1),
  texto('2', 'Como se chama a passagem de um aparelho de uma estação rádio-base para outra, sem derrubar a ligação?', /^(o\s+)?hand\s*-?\s*(over|off)$/i),
];

/** Perguntas do desafio. */
const d35: Pergunta[] = [
  texto('1', 'Os celulares da praça falam todos com o ponto de acesso, e não direto entre si. Qual é esse modo do Wi-Fi: infraestrutura ou ad hoc?', /^(modo\s+)?(de\s+)?infra(estrutura)?$/i),
  numerica('2', 'Depois do ajuste, qual a SNR no cliente, em dB?', (m) => snrWifi(m.equipamentos.get('ap-praca')!.s as any).snr, 0.5),
];

const ERB = 'erb-caixa';

const dia35: Dia = {
  numero: 35,
  ato: 0,
  titulo: 'Celular e Wi-Fi',
  chamado: [
    'CHAMADO #0035',
    'A operadora Alô Logo, depois de dez anos de "estamos estudando", instalou uma estação rádio-base no alto da caixa d\'água. O contrato com a prefeitura diz que o núcleo da rede e a saída para a internet ficam no galpão. Ou seja: com você.',
    'Na primeira noite, a ventania girou o setor da antena. Agora a torre ilumina com muito carinho o pasto atrás da represa, e a escola, do lado oposto, continua sem sinal.',
    'Objetivo: o celular de teste da escola associado à estação, um ping de 10 pedidos pelo celular e outro pelo cabo até o servidor do galpão, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Rede de telefonia móvel e Wi-Fi',
    texto: [
      'A rede de telefonia móvel tem quatro pedaços. O aparelho (o celular) fala pelo ar com uma estação rádio-base, a torre com antenas. A estação rádio-base liga, por cabo ou fibra, ao núcleo da rede, que sabe quem é cada assinante, onde ele está e para onde mandar cada pacote. E o núcleo tem uma saída para a internet. Só o primeiro trecho é sem fio: o resto é rede com cabo, como a do galpão.',
      'O território é dividido em células, cada uma atendida por uma estação (ou por um setor dela). Células vizinhas usam frequências diferentes para não se atropelarem, e células distantes reaproveitam as mesmas frequências: é o reuso de frequência, que deixa milhares de pessoas usarem um pedaço pequeno do espectro. Quando o aparelho se move e sai de uma célula, a rede passa a conversa para a vizinha sem derrubar a ligação: é o handover.',
      'As gerações, em linhas gerais: a 1G era voz analógica; a 2G digitalizou a voz e trouxe as mensagens de texto; a 3G trouxe dados de verdade; a 4G virou tudo pacote IP, até a voz; a 5G aumenta a banda, corta o atraso e aguenta muito mais aparelhos por célula.',
      'O Wi-Fi é a família de padrões 802.11, para rede local sem fio. No modo infraestrutura, todo aparelho fala com um ponto de acesso (o AP), que está ligado à rede com fio. No modo ad hoc, os aparelhos falam direto entre si, sem AP. Quase todo Wi-Fi que você vai ver é infraestrutura.',
      'O ar é um meio difícil. O sinal cai com a distância (alcance), perde força em cada parede, chega por vários caminhos refletidos que se somam ou se anulam (multipercurso), disputa a faixa com os vizinhos e o micro-ondas (interferência) e pode ser ouvido por qualquer um ao alcance (segurança). Cabo não tem nenhum desses cinco problemas, e é por isso que o núcleo continua no cabo.',
    ],
  },
  dicas: [
    'Antes de ping, a estação precisa enxergar a escola. Olhe para onde a antena aponta.',
    'No rádio da estação, compare o rumo até o celular com o azimute da antena. O setor tem 65°: errar 180° é iluminar o pasto.',
    'Ajuste a antena da erb-caixa para 120°, depois ping de 10 pedidos para 192.0.2.1 no notebook e no pc-galpao.',
  ],
  perguntas: p35,
  montar: () => {
    const m = novoMundo(135);
    adicionar(m, pc('notebook', { modelo: 'Notebook da escola, ligado ao celular de teste pelo cabo de dados', ttl: 64, ip: ip('192.0.2.50/24') }));
    adicionar(m, radio('celular', 'Celular de teste da escola, preso na janela do 2º andar (antena interna de 2 dBi, 700 MHz)', { ganho: 2, azimute: 300, azimuteCerto: 300, altura: 9, feixe: 360 }, 300, 9));
    adicionar(m, radio(ERB, 'Estação rádio-base da caixa d\'água, setor de 65° e 17 dBi, 700 MHz', { ganho: 17, azimute: 300, azimuteCerto: 120, altura: 30, feixe: 65 }, 120, 30));
    adicionar(m, comutador('nucleo', { modelo: 'Núcleo da rede móvel no rack do galpão (assinantes, localização e encaminhamento)' }));
    adicionar(m, pc('servidor', { modelo: 'Servidor de teste na saída para a internet, com Pinguix', ttl: 64, ip: ip('192.0.2.1/24') }));
    adicionar(m, pc('pc-galpao', { modelo: 'PC do galpão, no cabo, com JanelOS', ttl: 128, ip: ip('192.0.2.10/24') }));
    ligar(m, { equip: 'notebook', porta: 'eth0' }, { equip: 'celular', porta: 'lan' }, 'cat6', 1, { id: 'c1' });
    ligar(m, { equip: 'celular', porta: 'ar' }, { equip: ERB, porta: 'ar' }, 'radio', 2000, { id: 'c2', radio: { distanciaKm: 2, freqGHz: 0.7, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: ERB, porta: 'lan' }, { equip: 'nucleo', porta: 'p1' }, 'cat6', 80, { id: 'c3' });
    ligar(m, { equip: 'nucleo', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 3, { id: 'c4' });
    ligar(m, { equip: 'pc-galpao', porta: 'eth0' }, { equip: 'nucleo', porta: 'p2' }, 'cat6', 5, { id: 'c5' });
    m.proxCabo = 6;
    return m;
  },
  objetivo: (m) => {
    const d = radioDados(m, m.cabos.get('c2')!);
    const up = avaliar(m, m.cabos.get('c2')!).up;
    return [
      item('celular associado à estação, com RSSI de -65 dBm ou melhor', up && d.rssi >= -65, `${d.rssi.toFixed(1)} dBm`),
      pingOk(m, 'notebook', '192.0.2.1', 10),
      pingOk(m, 'pc-galpao', '192.0.2.1', 10),
      ...todasRespondidas(m, p35),
    ];
  },
  posMorte: [
    'O setor da estação tem um feixe de 65° e estava apontado para 300°, exatamente o lado oposto da escola. Com a antena de volta a 120°, o RSSI no celular subiu para perto de -56 dBm, e o rádio associou a 300 Mb/s.',
    'O ping pelo celular demorou bem mais que o do cabo, mesmo com a luz levando só uns 7 µs para cruzar os 2 km. O que pesa é o rádio: cada aparelho sem fio no caminho gasta tempo para organizar quem fala quando no ar. Numa rede móvel de verdade, com núcleo longe e muita gente na célula, isso vira dezenas de milissegundos.',
    'O trecho sem fio é o mais curto e o mais frágil: tudo depois da antena é cabo. Amanhã alguém vai perguntar por que a internet do celular cai na curva da represa. A resposta tem nome: falta uma célula ali para o handover acontecer.',
  ],
  passos: [
    passo({ alvo: ['equip', ERB], acao: 'mostra', instrucao: 'Na estação rádio-base, veja o enlace de rádio com o celular da escola.', porque: 'Antes de mexer, compare para onde a antena aponta com o rumo até a escola. Antena de setor só ilumina a fatia que fica na frente dela.', feito: 'Rumo para o celular: 120°. Antena apontada para 300°. A estação está de costas para a escola, e o RSSI está tão baixo que o celular nem associa.' }),
    passo({
      alvo: ['equip', ERB],
      acao: 'antena',
      pedir: ['azimute'],
      valores: { altura: '30' },
      exemplo: { azimute: '120' },
      instrucao: 'Gire a antena da estação para o rumo da escola.',
      porque: 'O azimute é medido em graus a partir do norte. A antena precisa apontar para o mesmo rumo que o mostra indicou.',
      conferir: (m) => {
        const c = m.cabos.get('c2')!;
        const d = radioDados(m, c);
        return (avaliar(m, c).up && d.rssi >= -65) || `RSSI de ${d.rssi.toFixed(1)} dBm. O rumo até o celular é 120°.`;
      },
      feito: 'RSSI perto de -56 dBm: o celular associou. A célula agora cobre a escola, e o pasto vai ter que se virar sem 4G.',
    }),
    passo({ alvo: ['equip', 'notebook'], acao: 'ping', valores: { destino: '192.0.2.1', n: '10' }, instrucao: 'Do notebook, mande 10 pings ao servidor do galpão, passando pelo celular.', porque: 'O pacote sai do notebook, entra no celular, cruza 2 km de ar até a estação, desce pelo cabo até o núcleo e chega ao servidor da saída para a internet.', conferir: pingou('notebook', '192.0.2.1'), feito: 'Dez respostas. Repare no tempo: passa de 1 ms.' }),
    passo({ alvo: ['equip', 'pc-galpao'], acao: 'ping', valores: { destino: '192.0.2.1', n: '10' }, instrucao: 'Agora, do PC do galpão, mande 10 pings ao mesmo servidor, só por cabo.', porque: 'Mesmo destino, sem rádio no caminho. É a régua para comparar.', conferir: pingou('pc-galpao', '192.0.2.1'), feito: 'Centésimos de milissegundo. O cabo nem esquentou.' }),
    passo({ pergunta: '1', exemplo: { resposta: '1.7' }, instrucao: 'Qual foi a média do ping pelo celular, em ms?', porque: 'A média aparece na última linha do ping do notebook.', feito: 'Algumas dezenas de vezes mais que pelo cabo. Quase nada disso é distância: é o tempo que cada rádio gasta para pôr o quadro no ar.' }),
    passo({
      escolha: {
        opcoes: [
          'Muitas células pequenas, com as vizinhas em frequências diferentes e as distantes reaproveitando as mesmas',
          'Uma torre gigante no alto do morro, cobrindo a região inteira com todas as frequências',
          'Todas as células na mesma frequência, para o aparelho não precisar trocar',
          'Uma frequência exclusiva para cada assinante',
        ],
        certa: 0,
        errada: {
          1: 'Uma torre só divide o mesmo pedaço de espectro entre todo mundo da região. Com muita gente, sobra quase nada para cada um.',
          2: 'Células vizinhas na mesma frequência se atropelam na borda, justamente onde o aparelho mais precisa de sinal.',
          3: 'Não há espectro para isso: seriam milhares de frequências, quase todas paradas a maior parte do tempo.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A operadora quer atender a cidade inteira e a represa no fim de semana. Qual o desenho certo?',
      porque: 'O espectro é pequeno e caro. A saída é dividir o território e reaproveitar as frequências onde elas não se ouvem.',
      feito: 'Células e reuso de frequência. Quanto menor a célula, mais vezes a mesma frequência é reaproveitada, e mais gente cabe.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: 'handover' }, instrucao: 'Como se chama a passagem do aparelho de uma estação para outra sem derrubar a ligação?', porque: 'Quem vai de carro da escola até a represa sai de uma célula e entra em outra. A rede precisa passar a conversa adiante.', feito: 'Handover. A rede mede o sinal das estações vizinhas e troca na hora certa. Se não houver vizinha, a ligação cai: é a curva da represa.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Do celular à internet',
        texto: [
          'Só o primeiro trecho é sem fio. A estação rádio-base liga por cabo ao núcleo, que sabe quem é cada assinante e onde ele está, e o núcleo tem a saída para a internet.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'aparelho', x: 60, y: 110 },
            { id: 'e', rotulo: 'estação rádio-base', x: 220, y: 110 },
            { id: 'n', rotulo: 'núcleo da rede', x: 390, y: 110 },
            { id: 'i', rotulo: 'internet', x: 550, y: 110 },
          ],
          ligacoes: [
            ['a', 'e', 'ar (rádio)'],
            ['e', 'n', 'cabo ou fibra'],
            ['n', 'i', 'saída'],
          ],
        },
      },
      {
        titulo: 'Células, reuso e handover',
        texto: [
          'Cada estação cobre uma célula. Vizinhas usam frequências diferentes (f1, f2, f3); células longe o bastante reaproveitam as mesmas.',
          'Quem anda de uma célula para outra é passado adiante sem a ligação cair: handover.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'escola (f1)', x: 90, y: 60 },
            { id: 'b', rotulo: 'praça (f2)', x: 300, y: 60 },
            { id: 'c', rotulo: 'represa (f3)', x: 510, y: 60 },
            { id: 'd', rotulo: 'cooperativa (f1 de novo)', x: 300, y: 190 },
          ],
          ligacoes: [
            ['a', 'b', 'handover'],
            ['b', 'c', 'handover'],
            ['a', 'd', 'longe: reusa f1'],
          ],
        },
      },
      {
        titulo: 'As gerações, em linhas gerais',
        texto: ['Cada geração mudou o que a rede leva e quanto leva. A ideia de células, estação e núcleo continua a mesma desde a primeira.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Geração', 'O que trouxe'],
          linhas: [
            ['1G', 'voz analógica: dava para ouvir a conversa com um rádio'],
            ['2G', 'voz digital e mensagens de texto'],
            ['3G', 'dados móveis de verdade'],
            ['4G', 'tudo vira pacote IP, até a voz'],
            ['5G', 'mais banda, menos atraso e muito mais aparelhos por célula'],
          ],
        },
      },
      {
        titulo: 'Wi-Fi: infraestrutura ou ad hoc',
        texto: [
          'O Wi-Fi é a família 802.11. No modo infraestrutura, todos falam com o ponto de acesso (AP), que está no cabo. No modo ad hoc, os aparelhos falam direto entre si, sem AP.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r', rotulo: 'rede com fio', x: 150, y: 30 },
            { id: 'ap', rotulo: 'AP', x: 150, y: 110 },
            { id: 'c1', rotulo: 'celular', x: 60, y: 200 },
            { id: 'c2', rotulo: 'notebook', x: 240, y: 200 },
            { id: 'x1', rotulo: 'notebook', x: 430, y: 110 },
            { id: 'x2', rotulo: 'notebook', x: 560, y: 200 },
          ],
          ligacoes: [
            ['r', 'ap', 'cabo'],
            ['ap', 'c1', 'infraestrutura'],
            ['ap', 'c2', 'infraestrutura'],
            ['x1', 'x2', 'ad hoc'],
          ],
        },
      },
      {
        titulo: 'O que atrapalha o ar',
        texto: ['Cinco problemas que o cabo não tem e o Wi-Fi tem todos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Problema', 'Na praça de Fim de Linha'],
          linhas: [
            ['alcance', 'o sinal cai com a distância: do coreto até o banco do fundo já é outro sinal'],
            ['paredes', 'cada parede come sinal; a igreja de pedra come muito'],
            ['multipercurso', 'o sinal bate na fachada e chega duas vezes, somando ou anulando'],
            ['interferência', 'as redes da feira e o micro-ondas do pastel disputam a mesma faixa'],
            ['segurança', 'qualquer um ao alcance ouve: sem cifra, a conversa é pública'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O celular de um passageiro funciona na escola e cai sempre na curva da represa, no meio do caminho para a próxima torre. Qual a explicação mais provável?',
      opcoes: [
        'Ali não há célula vizinha com sinal bom o bastante, e o handover não tem para onde passar a ligação',
        'O núcleo da rede desliga os assinantes que se movem',
        'O 4G não funciona perto de água',
        'O cabo entre a estação e o núcleo é curto demais',
      ],
      certa: 0,
      explicacao: 'O handover só passa a ligação se houver outra estação ouvindo o aparelho. Num buraco de cobertura, a conversa não tem para onde ir e cai.',
    },
  },
  desafio: {
    carta: [
      'Bilhete da associação de feirantes: "o Wi-Fi da praça funciona de segunda a sexta e morre todo sábado de manhã, exatamente na hora da feira. Desconfiamos de feitiço."',
      'Não é feitiço. O ponto de acesso da praça mora no mesmo pedaço do ar que a rede nova da barraca de pastel.',
      'Objetivo: SNR de 25 dB ou mais no cliente do AP da praça, e as duas perguntas respondidas.',
    ],
    dicas: [
      'Antes de mudar qualquer coisa, descubra quem mais está no ar.',
      'O analisador de espectro mostra os vizinhos; procure um canal longe dos fortes e veja a SNR no AP.',
      'Ponha o ap-praca no canal 1: nenhum vizinho forte encosta nele.',
    ],
    perguntas: d35,
    montar: () => {
      const m = novoMundo(1535);
      adicionar(
        m,
        aparelho('ap-praca', 'ap', 'Ponto de acesso da praça, no poste do coreto (802.11, 2,4 GHz)', [{ nome: 'lan' }], {
          canal: 6,
          sinalCliente: -60,
          ruidoDbm: -95,
          vizinhos: [
            { nome: 'PASTEL_DA_FEIRA_GRATIS', canal: 6, dbm: -50 },
            { nome: 'CameraDoCoreto_SETUP', canal: 8, dbm: -75 },
            { nome: 'Igreja_Matriz_Visitantes', canal: 11, dbm: -88 },
          ],
        }),
      );
      return m;
    },
    objetivo: (m) => {
      const r = snrWifi(m.equipamentos.get('ap-praca')!.s as any);
      return [item('SNR de 25 dB ou mais no cliente', r.snr >= 25, `${r.snr.toFixed(1)} dB`), ...todasRespondidas(m, d35)];
    },
    solucao: [
      ['equip', 'ap-praca', 'espectro'],
      ['equip', 'ap-praca', 'canal', { canal: '1' }],
      ['equip', 'ap-praca', 'mostra'],
    ],
    respostas: { '1': 'infraestrutura', '2': '35' },
  },
};

export const ATO0D: Dia[] = [dia35];
