// Dias novos do ato 1 (A Rua), com prática guiada, aula e desafio no próprio dia.
// A base teórica da comunicação de dados, a modulação digital e a multiplexação (seções 2.4.1, 2.4.3 e 2.4.4).

import { avaliarE1, avaliarModem, type UsoSlot } from '../motor/aparelhos';
import { adicionar, aparelho, novoMundo, type Mundo } from '../motor/mundo';
import { item, numerica, respondida, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Estado do modem do mundo, avaliado pelo motor. */
const modem = (m: Mundo) => avaliarModem(m.equipamentos.get('modem')!.s as any);
const kbps = (taxa: number) => `${(taxa / 1000).toFixed(1).replace('.', ',')} kb/s`;

/** Conferência de um passo de modem: sincronizado e com pelo menos a taxa pedida. */
const modemOk = (minimo: number) => (m: Mundo) => {
  const r = modem(m);
  if (!r.ok) return r.motivos[0]!;
  return r.taxa >= minimo || `Sincronizou a ${kbps(r.taxa)}. Precisa de ${kbps(minimo)} ou mais.`;
};

const e1 = (m: Mundo) => avaliarE1(m.equipamentos.get('mux')!.s.slots);

/* ======================================================================
 * ref 48: Por que o sinal se deforma (2.4.1)
 * ====================================================================== */

const p48: Pergunta[] = [
  numerica('1', 'Qual a taxa máxima de símbolos desta linha de 1800 Hz pelo critério de Nyquist, em Bd?', 3600, 0),
  numerica('2', 'Mandando 1010... a 600 b/s, a fundamental fica em 300 Hz. Quantos termos da soma (a fundamental, o 3º harmônico, o 5º...) cabem nos 1800 Hz da linha?', 3, 0),
];

const d48: Pergunta[] = [numerica('1', 'Mandando 1010... a 2400 b/s, qual a frequência da fundamental da onda quadrada, em Hz?', 1200, 0)];

const dia48: Dia = {
  numero: 48,
  ato: 1,
  titulo: 'Por que o sinal se deforma',
  chamado: [
    'CHAMADO #0048',
    'A casa 9 da Rua das Acácias fica no fim de um par de cobre tão comprido que a companhia antiga desistiu dele. A linha só deixa passar 1800 Hz de banda.',
    'Alguém copiou para o modem de lá a configuração de uma linha boa, 4800 Bd em QPSK. O modem apita, chia e desiste. "Deve ser a umidade."',
    'Objetivo: modem sincronizado a 7,2 kb/s ou mais, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Fourier, harmônicos e banda',
    texto: [
      'Todo sinal que se repete, por mais quadrado que pareça, é uma soma de senoides. Essa é a ideia da análise de Fourier: a senoide mais lenta, com a mesma frequência do padrão, é a fundamental; as outras, com frequências múltiplas dela, são os harmônicos.',
      'Uma onda quadrada perfeita (1010... sem fim) só tem harmônicos ímpares: a fundamental f, depois 3f com um terço da amplitude, 5f com um quinto, 7f com um sétimo, e assim por diante. São os harmônicos altos que fazem as bordas retas.',
      'Nenhum meio físico passa todas as frequências. Cada canal tem uma banda, a faixa de frequências que ele deixa passar sem atenuar demais, medida em Hz. O que fica acima da banda é cortado. Sobram só os primeiros termos da soma, e a onda quadrada chega arredondada, como uma lombada.',
      'A conta que liga bits e banda: mandando 1010... a b bits por segundo, um ciclo inteiro dura 2 bits, então a fundamental fica em b ÷ 2 Hz. Quanto mais rápido, mais alta a fundamental e menos harmônicos cabem na banda. No limite, só a fundamental passa: com banda B, isso acontece a 2B bits por segundo.',
      'Esse limite tem nome: Nyquist. Um canal de banda B aceita até 2B símbolos por segundo (baud) antes que um símbolo pise no outro. Console do modem: "mostra", "taxa-simbolos <Bd>", "modulacao <tipo>", "treinar".',
    ],
  },
  dicas: [
    'Olhe a linha no modem: o problema não é a umidade, é a banda.',
    'Nyquist: até 2 × 1800 = 3600 Bd. Mais que isso, um símbolo atropela o outro.',
    'Configure 3600 Bd em QPSK: 3600 × 2 = 7,2 kb/s.',
  ],
  perguntas: p48,
  montar: () => {
    const m = novoMundo(148);
    adicionar(m, aparelho('modem', 'modem', 'Modem da casa 9, no fim de um par de cobre muito comprido', [{ nome: 'linha' }], { bandaHz: 1800, snrDb: 15, baud: 4800, modulacao: 'qpsk' }));
    return m;
  },
  objetivo: (m) => {
    const r = modem(m);
    return [item('modem sincronizado', r.ok, r.ok ? undefined : r.motivos[0]), item('taxa de 7,2 kb/s ou mais', r.ok && r.taxa >= 7200, kbps(r.taxa)), ...todasRespondidas(m, p48)];
  },
  posMorte: [
    'A 4800 Bd, cada símbolo durava menos do que a linha de 1800 Hz consegue mostrar. Os harmônicos que davam forma a ele ficavam pelo caminho, e o que chegava era uma onda tão arredondada que um símbolo se espalhava em cima do vizinho.',
    'Com 3600 Bd, exatamente 2 × 1800 Hz, o modem fica no limite de Nyquist: cada símbolo ainda chega reconhecível. Em QPSK, isso dá 7,2 kb/s, abaixo dos 9,1 kb/s que Shannon permite com 15 dB de SNR.',
    'A lição vale para qualquer meio: mais bits por segundo pedem mais banda. Cabo de rede mais caro, fibra e rádio de faixa larga existem por causa dessa conta.',
  ],
  passos: [
    passo({ alvo: ['equip', 'modem'], acao: 'mostra', instrucao: 'Veja a linha e a configuração do modem.', porque: 'Antes de mexer, leia a banda da linha e o motivo de não sincronizar.', feito: '1800 Hz de banda e 4800 Bd configurados. O modem reclama de Nyquist e ainda de Shannon: 9,6 kb/s passa dos 9,1 kb/s que esta linha aguenta.' }),
    passo({
      escolha: {
        opcoes: [
          'Porque a linha corta os harmônicos acima da banda, e sem eles as bordas não ficam retas',
          'Porque o cobre atrasa os bits 1 mais que os bits 0',
          'Porque a onda quadrada perde a fundamental no caminho',
          'Porque o modem manda a onda já arredondada para economizar energia',
        ],
        certa: 0,
        errada: {
          1: 'O atraso é praticamente o mesmo para 0 e 1. O que muda é quais frequências passam.',
          2: 'É o contrário: a fundamental é a mais lenta e quase sempre passa. Os primeiros a sumir são os harmônicos altos.',
          3: 'O modem manda o melhor que pode. Quem arredonda é o canal, que só deixa passar a sua banda.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Uma onda quadrada sai do modem e chega do outro lado arredondada. Por quê?',
      porque: 'A onda quadrada é a soma da fundamental com os harmônicos 3f, 5f, 7f... Cada um é uma frequência, e o canal só passa algumas.',
      feito: 'O canal é um filtro. O que está acima da banda some, e a soma que sobra é uma onda redonda.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: '3' }, instrucao: 'A 600 b/s, a fundamental do padrão 1010... fica em 300 Hz. Quantos termos da soma cabem em 1800 Hz?', porque: 'Os termos da onda quadrada estão em f, 3f, 5f, 7f... Com f = 300 Hz: 300, 900, 1500, 2100 Hz. Conte os que ficam até 1800 Hz.', feito: 'Três: 300, 900 e 1500 Hz. O de 2100 Hz já fica de fora. É a mesma onda do slider da aula com 3 harmônicos.' }),
    passo({ pergunta: '1', exemplo: { resposta: '3600' }, instrucao: 'Pelo critério de Nyquist, qual a taxa máxima de símbolos desta linha?', porque: 'Um canal de banda B aceita até 2B símbolos por segundo. A banda aqui é 1800 Hz.', feito: '2 × 1800 = 3600 Bd. Os 4800 Bd configurados passavam disso em um terço.' }),
    passo({
      alvo: ['equip', 'modem'],
      acao: 'modem',
      pedir: ['baud'],
      valores: { mod: 'qpsk' },
      exemplo: { baud: '3600' },
      instrucao: 'Ajuste a taxa de símbolos para caber na banda, mantendo QPSK.',
      porque: 'Com 15 dB de SNR, QPSK (2 bits por símbolo, pede 13,5 dB) é o mais denso que passa. A taxa em bits será baud × 2.',
      conferir: modemOk(7200),
      feito: 'PIIII-KRRRRSHHHH-BONG. 3600 Bd × 2 bits = 7,2 kb/s, sincronizado.',
    }),
    passo({
      escolha: {
        opcoes: ['Dobra também', 'Fica igual, porque a modulação é a mesma', 'Cai pela metade', 'Multiplica por quatro'],
        certa: 0,
        errada: {
          1: 'Com a mesma modulação, a taxa em bits acompanha a taxa de símbolos, e Nyquist diz que o teto de símbolos é 2B.',
          2: 'Mais banda nunca piora o teto de Nyquist: deixa passar mais harmônicos, não menos.',
          3: 'Nyquist é linear na banda: 2B. Dobrar B dobra o teto.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se a linha tivesse o dobro de banda (3600 Hz), com a mesma modulação, o que aconteceria com a taxa máxima de símbolos?',
      porque: 'O teto de Nyquist é 2B, proporcional à banda.',
      feito: 'Dobra: 7200 Bd. É por isso que todo mundo briga por banda: ela é a matéria-prima da taxa de bits.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Todo sinal é soma de senoides',
        texto: [
          'A análise de Fourier diz que qualquer sinal periódico é uma soma de senoides: uma fundamental, na frequência do padrão, mais harmônicos em múltiplos dela.',
          'Com só a fundamental, a "onda quadrada" é uma senoide. Arraste o controle e veja a soma ganhar bordas.',
        ],
        visual: { tipo: 'sinal', harmonicos: 1 },
      },
      {
        titulo: 'Os harmônicos da onda quadrada',
        texto: ['A onda quadrada 1010... só tem harmônicos ímpares, cada um mais fraco que o anterior. Com fundamental de 300 Hz, fica assim:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Termo', 'Frequência', 'Amplitude'],
          linhas: [
            ['fundamental (f)', '300 Hz', '1'],
            ['3º harmônico (3f)', '900 Hz', '1/3'],
            ['5º harmônico (5f)', '1500 Hz', '1/5'],
            ['7º harmônico (7f)', '2100 Hz', '1/7'],
          ],
        },
      },
      {
        titulo: 'A banda corta o resto',
        texto: [
          'Uma linha de 1800 Hz deixa passar os três primeiros termos e corta o de 2100 Hz em diante. O que chega é esta soma: reconhecível, mas com a borda arredondada.',
          'O controle conta os termos: 1 é só a fundamental, 2 soma o 3f, 3 soma também o 5f.',
        ],
        visual: { tipo: 'sinal', harmonicos: 3 },
      },
      {
        titulo: 'Mais bits, menos harmônicos',
        texto: ['No padrão 1010..., a fundamental fica na metade da taxa de bits. Numa linha de 1800 Hz:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Taxa', 'Fundamental', 'Termos que passam'],
          linhas: [
            ['600 b/s', '300 Hz', '3 (300, 900, 1500 Hz)'],
            ['1000 b/s', '500 Hz', '2 (500, 1500 Hz)'],
            ['2000 b/s', '1000 Hz', '1'],
            ['3600 b/s', '1800 Hz', '1, no limite'],
            ['4800 b/s', '2400 Hz', 'nenhum'],
          ],
        },
      },
      {
        titulo: 'Nyquist fecha a conta',
        texto: ['Quando só a fundamental passa, ainda dá para ler cada símbolo, mas não cabe nem um a mais: 2B símbolos por segundo. Mexa na banda e veja o teto andar junto.'],
        visual: { tipo: 'calculadora', formula: 'nyquist' },
      },
    ],
    checagem: {
      pergunta: 'Um enlace precisa do dobro da taxa de bits, com a mesma modulação. O que ele precisa do canal?',
      opcoes: ['Do dobro da banda', 'Da mesma banda e de um cabo mais curto', 'Da metade da banda, para filtrar o ruído', 'De um modem com mais volume'],
      certa: 0,
      explicacao: 'Com a mesma modulação, bits por segundo acompanham símbolos por segundo, e o teto de símbolos é 2B. Dobrar a taxa pede o dobro da banda.',
    },
  },
  desafio: {
    carta: [
      'O posto de saúde do distrito manda as fichas de vacinação por um par de cobre com bobinas de carga, daquelas que a companhia antiga punha para melhorar a voz. Efeito colateral: a banda caiu para 1200 Hz.',
      'O modem está a 1200 Bd em QPSK, 2,4 kb/s, e o sistema novo de fichas pede pelo menos 4,8 kb/s. A SNR da linha é 16 dB.',
      'Objetivo: modem sincronizado a 4,8 kb/s ou mais, e a pergunta respondida.',
    ],
    dicas: [
      'Leia a banda da linha e calcule o teto de Nyquist.',
      'Com 16 dB, 16-QAM não passa: fica em QPSK. Então a taxa só cresce com mais baud, até 2 × 1200.',
      'Configure 2400 Bd em QPSK: 4,8 kb/s. A fundamental do 1010... a 2400 b/s é a metade disso.',
    ],
    perguntas: d48,
    respostas: { '1': '1200' },
    montar: () => {
      const m = novoMundo(1548);
      adicionar(m, aparelho('modem', 'modem', 'Modem do posto de saúde, num par com bobinas de carga', [{ nome: 'linha' }], { bandaHz: 1200, snrDb: 16, baud: 1200, modulacao: 'qpsk' }));
      return m;
    },
    objetivo: (m) => {
      const r = modem(m);
      return [item('modem sincronizado', r.ok, r.ok ? undefined : r.motivos[0]), item('taxa de 4,8 kb/s ou mais', r.ok && r.taxa >= 4800, kbps(r.taxa)), respondida(m, d48[0]!)];
    },
    solucao: [
      ['equip', 'modem', 'mostra'],
      ['equip', 'modem', 'modem', { baud: '2400', mod: 'qpsk' }],
    ],
  },
};

/* ======================================================================
 * ref 49: Constelações (2.4.3)
 * ====================================================================== */

const p49: Pergunta[] = [
  numerica('1', 'Quantos pontos tem a constelação de uma modulação que leva 4 bits por símbolo?', 16, 0),
  numerica('2', 'Em Manchester, cada bit vira dois meios níveis. Para mandar 10 Mb/s, quantos milhões de níveis por segundo vão no fio?', 20, 0),
];

const d49: Pergunta[] = [numerica('1', 'Quantos pontos tem a constelação do QPSK?', 4, 0)];

const dia49: Dia = {
  numero: 49,
  ato: 1,
  titulo: 'Constelações',
  chamado: [
    'CHAMADO #0049',
    'A casa 10 ganhou uma linha decente: 3000 Hz de banda e 24 dB de SNR. O modem está fixo em 2400 Bd, porque a central do outro lado não aceita outra taxa.',
    'A pessoa que instalou escolheu 64-QAM "porque tem mais pontos, então tem mais bits". O modem não sincroniza desde então.',
    'Objetivo: modem sincronizado a 9,6 kb/s ou mais, sem mexer nos 2400 Bd, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Banda base, banda passante e modulação digital',
    texto: [
      'Há dois jeitos de pôr bits num meio. Em banda base, o sinal vai direto no fio, com níveis de tensão, ocupando de perto de 0 Hz para cima: é o que o cabo de rede faz. Em banda passante, os bits mexem numa portadora, uma senoide numa frequência que o canal deixa passar: é o que rádio, fibra e linha telefônica (que só passa de uns 300 a 3400 Hz) precisam.',
      'Em banda base, o código mais simples é o NRZ: 1 é nível alto, 0 é nível baixo. O problema é uma fila longa de zeros (ou de uns): o sinal fica parado e o receptor perde a conta de onde cada bit começa. O Manchester resolve pondo uma transição no meio de cada bit (no Ethernet, 1 vai de baixo para alto e 0 de alto para baixo), ao custo de dobrar a taxa de níveis no fio. O 4B/5B troca cada 4 bits por 5 escolhidos para nunca ter mais de três zeros seguidos, gastando só 25 % a mais.',
      'Em banda passante, dá para mexer em três coisas da portadora: a amplitude (ASK), a frequência (FSK) ou a fase (PSK). BPSK usa duas fases e leva 1 bit por símbolo; QPSK usa quatro fases e leva 2. QAM mexe em amplitude e fase ao mesmo tempo: 16-QAM tem 16 combinações (4 bits), 64-QAM tem 64 (6 bits), 256-QAM tem 256 (8 bits).',
      'O diagrama de constelação desenha cada símbolo possível como um ponto: a distância ao centro é a amplitude e o ângulo é a fase. Com M pontos, cada símbolo leva log₂(M) bits. Quanto mais pontos, mais perto um do outro, e menos ruído basta para o receptor confundir dois vizinhos.',
      'Por isso cada modulação exige uma SNR mínima. No nosso modem, para quase não errar: BPSK 10,5 dB, QPSK 13,5 dB, 16-QAM 20,5 dB, 64-QAM 26,5 dB e 256-QAM 32,5 dB. Mais bits por símbolo só se a linha for silenciosa o bastante.',
    ],
  },
  dicas: [
    'A taxa de símbolos está presa em 2400 Bd. Só sobra escolher quantos bits cada símbolo leva.',
    '64-QAM pede 26,5 dB e a linha tem 24 dB. Qual a mais densa que cabe?',
    'Escolha 16-QAM: 2400 Bd × 4 bits = 9,6 kb/s.',
  ],
  perguntas: p49,
  montar: () => {
    const m = novoMundo(149);
    adicionar(m, aparelho('modem', 'modem', 'Modem da casa 10, preso em 2400 Bd pela central', [{ nome: 'linha' }], { bandaHz: 3000, snrDb: 24, baud: 2400, modulacao: 'qam64' }));
    return m;
  },
  objetivo: (m) => {
    const r = modem(m);
    const s = m.equipamentos.get('modem')!.s;
    return [
      item('modem sincronizado', r.ok, r.ok ? undefined : r.motivos[0]),
      item('taxa de símbolos em 2400 Bd', s.baud === 2400, `${s.baud} Bd`),
      item('taxa de 9,6 kb/s ou mais', r.ok && r.taxa >= 9600, kbps(r.taxa)),
      ...todasRespondidas(m, p49),
    ];
  },
  posMorte: [
    'Com 64-QAM, os 64 pontos da constelação ficavam tão juntos que os 24 dB de SNR da linha não bastavam: o ruído empurrava cada símbolo para o ponto vizinho, e o modem desistia. Mais pontos dão mais bits só quando o ruído deixa.',
    'Em 16-QAM, 2400 Bd viram 9,6 kb/s, com folga sobre os 20,5 dB exigidos e longe dos 23,9 kb/s de Shannon desta linha.',
    'Banda base ou banda passante, NRZ, Manchester ou QAM: todo código de linha é uma troca entre banda, ruído e facilidade de achar o relógio. Não existe almoço grátis, só cardápio.',
  ],
  passos: [
    passo({ alvo: ['equip', 'modem'], acao: 'mostra', instrucao: 'Veja a linha e o motivo de o modem não sincronizar.', porque: 'A banda e a taxa de símbolos estão boas. Leia o que o modem diz sobre a SNR.', feito: '64-QAM precisa de 26,5 dB e a linha só tem 24 dB. Os pontos da constelação estão juntos demais para este ruído.' }),
    passo({
      escolha: {
        opcoes: [
          'Porque NRZ é banda base, com energia perto de 0 Hz, e a linha só passa de uns 300 a 3400 Hz: é preciso modular uma portadora',
          'Porque NRZ só funciona em fibra',
          'Porque NRZ manda os bits ao contrário',
          'Porque o NRZ precisa de quatro pares, como o gigabit',
        ],
        certa: 0,
        errada: {
          1: 'NRZ é o código mais comum em cobre. O problema aqui é a faixa que a linha deixa passar.',
          2: 'NRZ manda 1 como nível alto e 0 como nível baixo, sem inverter nada.',
          3: 'NRZ funciona num par só. O problema é de frequência, não de número de fios.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o modem não pode simplesmente mandar os bits em NRZ direto na linha telefônica?',
      porque: 'Uma fila de bits iguais em NRZ é um nível parado, quase corrente contínua. Compare isso com a faixa que a linha deixa passar.',
      feito: 'Banda base ocupa as frequências baixas, e a linha telefônica corta abaixo de uns 300 Hz. Daí a portadora: banda passante.',
    }),
    passo({
      escolha: {
        opcoes: [
          'O receptor perde a conta de onde cada bit começa, porque o sinal fica parado',
          'Os zeros gastam mais energia que os uns',
          'O cabo esquenta',
          'Nada: zero é só nível baixo, o receptor conta sem problema',
        ],
        certa: 0,
        errada: {
          1: 'Em NRZ, zero é nível baixo: gasta menos, se gasta alguma coisa. O problema é outro.',
          2: 'Mil zeros não esquentam nada. Mas deixam o receptor sem nenhuma borda para acertar o relógio.',
          3: 'Sem transição, o receptor depende só do próprio relógio, e qualquer diferença de ritmo vira bit a mais ou a menos.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Num enlace de banda base em NRZ, chega uma fila de mil zeros seguidos. Qual o problema?',
      porque: 'O receptor acerta o relógio pelas transições do sinal. Sem transição, ele conta no escuro.',
      feito: 'É o problema da recuperação do relógio. Manchester põe uma transição em cada bit; 4B/5B garante que nunca passem de três zeros seguidos.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: '20' }, instrucao: 'Em Manchester, cada bit vira dois meios níveis. Para 10 Mb/s, quantos milhões de níveis por segundo vão no fio?', porque: 'A transição no meio do bit corta cada bit em duas metades, e cada metade é um nível.', feito: '20 milhões. Manchester compra o relógio com o dobro da banda, por isso o Ethernet mais rápido trocou por códigos como o 4B/5B, que gastam só 25 % a mais.' }),
    passo({ pergunta: '1', exemplo: { resposta: '16' }, instrucao: 'Quantos pontos tem a constelação de uma modulação que leva 4 bits por símbolo?', porque: 'Com M pontos, cada símbolo leva log₂(M) bits. Ao contrário: com n bits, são 2 elevado a n pontos.', feito: '2⁴ = 16: é o 16-QAM. Quatro bits por símbolo, o dobro do QPSK.' }),
    passo({
      alvo: ['equip', 'modem'],
      acao: 'modem',
      pedir: ['mod'],
      valores: { baud: '2400' },
      exemplo: { mod: 'qam16' },
      instrucao: 'Escolha a modulação mais densa que a SNR desta linha permite, mantendo 2400 Bd.',
      porque: 'A linha tem 24 dB. Compare com o que cada modulação exige: QPSK 13,5 dB, 16-QAM 20,5 dB, 64-QAM 26,5 dB.',
      conferir: modemOk(9600),
      feito: '16-QAM sincronizou: 2400 Bd × 4 bits = 9,6 kb/s, com 3,5 dB de folga na SNR.',
    }),
    passo({
      escolha: {
        opcoes: ['A fase da portadora, entre quatro valores', 'A amplitude, entre quatro níveis', 'A frequência, entre quatro tons', 'A amplitude e a frequência ao mesmo tempo'],
        certa: 0,
        errada: {
          1: 'Mexer só na amplitude é ASK. O "PSK" do nome é de fase.',
          2: 'Mexer na frequência é FSK, o assobio dos modems mais antigos.',
          3: 'Amplitude junto com fase é QAM. QPSK mexe só na fase: os quatro pontos ficam no mesmo círculo.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O QPSK leva 2 bits por símbolo. O que ele muda na portadora?',
      porque: 'Leia o nome: Q de quatro (quadratura), PSK de chaveamento de fase.',
      feito: 'Quatro fases, todas com a mesma amplitude: na constelação, quatro pontos num círculo. O QAM é que espalha pontos em vários círculos.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Banda base e banda passante',
        texto: ['Em banda base, o sinal vai direto no fio. Em banda passante, os bits mexem numa portadora que cabe na faixa do canal.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Banda base', 'Banda passante'],
          linhas: [
            ['como', 'níveis de tensão direto no fio', 'portadora modulada'],
            ['ocupa', 'de perto de 0 Hz para cima', 'uma faixa em volta da portadora'],
            ['onde', 'cabo de rede', 'linha telefônica, rádio, fibra'],
            ['exemplos', 'NRZ, Manchester, 4B/5B', 'ASK, FSK, PSK, QAM'],
          ],
        },
      },
      {
        titulo: 'Manchester: uma transição por bit',
        texto: [
          'Na convenção do Ethernet, 1 vira baixo e depois alto (01) e 0 vira alto e depois baixo (10). Toda borda no meio do bit é um tique de relógio de graça.',
          'O preço: o dobro de níveis por segundo, e o dobro de banda.',
        ],
        visual: { tipo: 'bits', antes: '1011', depois: '01100101', legenda: 'Os bits 1011 em Manchester: cada bit vira um par de meios níveis.' },
      },
      {
        titulo: '4B/5B: relógio mais barato',
        texto: ['Cada grupo de 4 bits vira um código de 5, escolhido para nunca deixar mais de três zeros seguidos. Custa 25 % a mais, contra os 100 % do Manchester.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Dado (4 bits)', 'Código (5 bits)'],
          linhas: [
            ['0000', '11110'],
            ['0001', '01001'],
            ['0010', '10100'],
            ['0011', '10101'],
            ['1111', '11101'],
          ],
        },
      },
      {
        titulo: 'O que dá para mexer na portadora',
        texto: ['Amplitude, frequência ou fase, sozinhas ou juntas. Quanto mais estados, mais bits por símbolo e mais SNR exigida.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Modulação', 'O que muda', 'Pontos', 'Bits por símbolo', 'SNR mínima'],
          linhas: [
            ['ASK', 'amplitude', '2', '1', 'pouco usada sozinha'],
            ['FSK', 'frequência', '2', '1', 'pouco usada sozinha'],
            ['BPSK', 'fase', '2', '1', '10,5 dB'],
            ['QPSK', 'fase', '4', '2', '13,5 dB'],
            ['16-QAM', 'amplitude e fase', '16', '4', '20,5 dB'],
            ['64-QAM', 'amplitude e fase', '64', '6', '26,5 dB'],
            ['256-QAM', 'amplitude e fase', '256', '8', '32,5 dB'],
          ],
        },
      },
      {
        titulo: 'A constelação do QPSK',
        texto: [
          'Quatro pontos no mesmo círculo, um em cada quadrante, a 45°, 135°, 225° e 315°. Os vizinhos diferem em um bit só (código de Gray): se o ruído empurrar um símbolo para o lado, só um bit sai errado.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: '01 (135°)', x: 180, y: 50 },
            { id: 'b', rotulo: '00 (45°)', x: 420, y: 50 },
            { id: 'c', rotulo: '11 (225°)', x: 180, y: 190 },
            { id: 'd', rotulo: '10 (315°)', x: 420, y: 190 },
          ],
          ligacoes: [
            ['a', 'b', '1 bit muda'],
            ['b', 'd', '1 bit muda'],
            ['d', 'c', '1 bit muda'],
            ['c', 'a', '1 bit muda'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Uma linha tem 22 dB de SNR. Qual a modulação mais densa que ela aguenta, segundo a tabela?',
      opcoes: ['16-QAM', '64-QAM', '256-QAM', 'BPSK, porque é a mais segura'],
      certa: 0,
      explicacao: '16-QAM pede 20,5 dB e cabe nos 22 dB. 64-QAM pede 26,5 dB. BPSK também funciona, mas leva só 1 bit por símbolo, um quarto do 16-QAM.',
    },
  },
  desafio: {
    carta: [
      'A balança da cooperativa manda as pesagens por uma linha de 2600 Hz de banda e só 18 dB de SNR, porque o par passa ao lado da cerca elétrica.',
      'Alguém fez a conta "certinha": 2600 Bd em 16-QAM dá 10,4 kb/s. Só que o modem não sincroniza. O sistema de pesagem precisa de 10 kb/s ou mais.',
      'Objetivo: modem sincronizado a 10 kb/s ou mais, e a pergunta respondida.',
    ],
    dicas: [
      'Veja o que o modem reclama: não é a banda.',
      'Com 18 dB, a mais densa que passa é QPSK. Para não perder taxa, compense em símbolos por segundo, até o teto de Nyquist.',
      'Configure 5200 Bd em QPSK: 2 × 2600 Hz de banda, 2 bits por símbolo, 10,4 kb/s.',
    ],
    perguntas: d49,
    respostas: { '1': '4' },
    montar: () => {
      const m = novoMundo(1549);
      adicionar(m, aparelho('modem', 'modem', 'Modem da balança da cooperativa, ao lado da cerca elétrica', [{ nome: 'linha' }], { bandaHz: 2600, snrDb: 18, baud: 2600, modulacao: 'qam16' }));
      return m;
    },
    objetivo: (m) => {
      const r = modem(m);
      return [item('modem sincronizado', r.ok, r.ok ? undefined : r.motivos[0]), item('taxa de 10 kb/s ou mais', r.ok && r.taxa >= 10000, kbps(r.taxa)), respondida(m, d49[0]!)];
    },
    solucao: [
      ['equip', 'modem', 'mostra'],
      ['equip', 'modem', 'modem', { baud: '5200', mod: 'qpsk' }],
    ],
  },
};

/* ======================================================================
 * ref 50: Dividir o meio (2.4.4)
 * ====================================================================== */

const p50: Pergunta[] = [
  numerica('1', 'CDMA com A = (+1 +1 +1 +1), B = (+1 -1 +1 -1) e C = (+1 +1 -1 -1). Chegou S = (0 +2 0 +2). Quanto dá S · B ÷ 4?', -1, 0),
  numerica('2', 'Uma fibra leva 40 comprimentos de onda, cada um com 10 Gb/s. Quantos Gb/s no total?', 400, 0),
];

const d50: Pergunta[] = [numerica('1', 'Quantas vezes por segundo o intervalo 5 do E1 passa pela linha?', 8000, 0)];

const dia50: Dia = {
  numero: 50,
  ato: 1,
  titulo: 'Dividir o meio',
  chamado: [
    'CHAMADO #0050',
    'O tronco de fibra até a cidade vizinha ficou pronto, e a prefeitura já quer dividir: hospital, rádio comunitária, cooperativa, todo mundo quer um pedaço. Uma fibra, muitos donos.',
    'Para começar, o hospital vai usar um E1 que sai do galpão: 15 linhas de telefone e o resto em dados. O mux veio de fábrica com tudo livre, menos o enquadramento.',
    'Objetivo: 15 canais de voz, sinalização no intervalo 16, quadro alinhado, 960 kb/s ou mais de dados, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Multiplexação: FDM, TDM, CDM e WDM',
    texto: [
      'Multiplexar é fazer vários sinais dividirem um meio só. Há quatro jeitos clássicos de fatiar: por frequência, por tempo, por código e, na fibra, por cor da luz.',
      'Na divisão de frequência (FDM), cada sinal ganha a sua faixa do espectro, com uma banda de guarda entre vizinhos para não se atropelarem. É como funcionam as rádios: todas no mesmo ar, ao mesmo tempo, cada uma na sua frequência. A telefonia antiga empilhava canais de voz de 4 kHz assim, um ao lado do outro.',
      'Na divisão de tempo (TDM), todos usam a faixa inteira, mas cada um na sua vez, em fatias fixas que se repetem. O E1 é TDM: 32 intervalos de 8 bits, 8000 quadros por segundo, 64 kb/s por intervalo, 2048 kb/s no total. O intervalo 0 marca o começo do quadro e o 16 leva a sinalização das linhas de voz. Console do mux: "mostra" e "slot <lista> <uso>".',
      'Na divisão de código (CDM, ou CDMA quando é acesso), todos falam ao mesmo tempo, na mesma faixa. Cada estação tem um código de chips, e os códigos são ortogonais: o produto interno de dois códigos diferentes dá zero. Para mandar 1, a estação manda o seu código; para 0, o código invertido. O receptor soma tudo, faz o produto interno com o código de quem quer ouvir e divide pelo número de chips: dá +1 (bit 1), -1 (bit 0) ou 0 (calado).',
      'Na divisão de comprimento de onda (WDM), cada sinal vai numa cor de luz (um lambda) dentro da mesma fibra. Um multiplexador óptico junta as cores de um lado e um prisma, ou uma grade, separa do outro. É FDM com luz, e é por isso que uma fibra só leva centenas de Gb/s.',
    ],
  },
  dicas: [
    'Comece olhando o quadro E1: só o intervalo 0 está em uso.',
    'São 30 intervalos úteis (de 1 a 15 e de 17 a 31). O 16 é da sinalização.',
    'Voz de 1 a 15, sinalização no 16, dados de 17 a 31. Para o CDMA, some o produto chip a chip: 0 - 2 + 0 - 2.',
  ],
  perguntas: p50,
  montar: () => {
    const m = novoMundo(150);
    const slots: UsoSlot[] = Array.from({ length: 32 }, (_, i) => (i === 0 ? 'enquadramento' : 'livre'));
    adicionar(m, aparelho('mux', 'mux', 'Multiplexador E1 do hospital, saindo do galpão', [{ nome: 'e1' }], { slots }));
    return m;
  },
  objetivo: (m) => {
    const r = e1(m);
    return [
      item('quadro alinhado (intervalo 0 em enquadramento)', !r.lof),
      item('sinalização no intervalo 16', r.sinalizacao),
      item('15 canais de voz ou mais', r.voz >= 15, `${r.voz}`),
      item('960 kb/s de dados ou mais', r.dados >= 960, `${r.dados} kb/s`),
      ...todasRespondidas(m, p50),
    ];
  },
  posMorte: [
    'O hospital ficou com 15 linhas de voz de 64 kb/s, sinalização no 16 e 15 intervalos de dados: 960 kb/s. Cada um com a sua fatia de tempo garantida, falando ou calado.',
    'TDM é uma das quatro maneiras de dividir um meio. As rádios dividem o ar por frequência, os celulares de terceira geração dividiam por código, e o tronco de fibra vai dividir por cor: o E1 do hospital é só um pedacinho de um lambda.',
    'No CDMA, o produto interno deu -1: a estação B mandou um 0, mesmo com A falando ao mesmo tempo, na mesma faixa. Com C, daria 0: calada. É matemática fazendo o papel de educação à mesa.',
  ],
  passos: [
    passo({ alvo: ['equip', 'mux'], acao: 'mostra', instrucao: 'Veja como estão os 32 intervalos do E1.', porque: 'O E1 divide o tempo em 32 fatias que se repetem 8000 vezes por segundo. Cada uma vai servir a um dono.', feito: 'Só o intervalo 0 está em uso, com o padrão de enquadramento. Os outros 31 estão livres: nenhuma voz e nenhum dado.' }),
    passo({
      alvo: ['equip', 'mux'],
      acao: 'slot',
      valores: { uso: 'voz' },
      pedir: ['lista'],
      exemplo: { lista: '1-15' },
      instrucao: 'Reserve 15 intervalos para as linhas de voz do hospital.',
      porque: 'Cada linha de voz é um intervalo de 64 kb/s. O 0 não se toca e o 16 fica para a sinalização: do 1 ao 15 cabem exatamente 15.',
      conferir: (m) => {
        const r = e1(m);
        if (r.lof) return 'O intervalo 0 deixou de ser enquadramento e o E1 perdeu o quadro (LOF). Use intervalos a partir do 1.';
        if (m.equipamentos.get('mux')!.s.slots[16] === 'voz') return 'O 16 é da sinalização. Escolha outros intervalos.';
        return r.voz >= 15 || `Só ${r.voz} canais de voz. Precisa de 15.`;
      },
      feito: '15 canais de voz, cada um com a sua vez garantida no quadro.',
    }),
    passo({
      alvo: ['equip', 'mux'],
      acao: 'slot',
      valores: { uso: 'sinalizacao' },
      pedir: ['lista'],
      exemplo: { lista: '16' },
      instrucao: 'Reserve o intervalo da sinalização das linhas de voz.',
      porque: 'Telefone fora do gancho, número discado: isso vai num intervalo próprio, o de número 16.',
      conferir: (m) => {
        const r = e1(m);
        if (r.lof) return 'O intervalo 0 é do enquadramento. Mexer nele derruba o E1.';
        return r.sinalizacao || 'A sinalização precisa estar sozinha no intervalo 16.';
      },
      feito: 'Sinalização no 16. Sobram 15 intervalos livres, do 17 ao 31.',
    }),
    passo({
      alvo: ['equip', 'mux'],
      acao: 'slot',
      valores: { uso: 'dados' },
      pedir: ['lista'],
      exemplo: { lista: '17-31' },
      instrucao: 'Ponha os intervalos que sobraram em dados.',
      porque: 'Intervalo livre é banda jogada fora. Cada um em dados vale 64 kb/s.',
      conferir: (m) => {
        const r = e1(m);
        if (r.lof) return 'O intervalo 0 é do enquadramento. Mexer nele derruba o E1.';
        if (!r.sinalizacao) return 'O 16 tem que continuar na sinalização.';
        if (r.voz < 15) return `Sobraram só ${r.voz} canais de voz. Não ponha dados por cima da voz.`;
        return r.dados >= 960 || `Só ${r.dados} kb/s de dados. Use todos os intervalos que sobraram, do 17 ao 31.`;
      },
      feito: '15 intervalos × 64 kb/s = 960 kb/s de dados. O quadro está cheio: 1 de enquadramento, 15 de voz, 1 de sinalização e 15 de dados.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Cada uma transmite numa faixa de frequência própria, com banda de guarda entre elas',
          'Cada uma transmite num horário do dia',
          'As duas usam a mesma frequência e o rádio do ouvinte escolhe pela voz',
          'Cada uma usa um código ortogonal',
        ],
        certa: 0,
        errada: {
          1: 'Isso seria TDM com fatias de horas. As duas tocam o dia inteiro, ao mesmo tempo.',
          2: 'Na mesma frequência, as duas se somam no ar e o ouvinte escuta uma salada.',
          3: 'Códigos ortogonais são CDMA, usado em celular. Rádio comum é a divisão mais antiga de todas.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A rádio comunitária e a rádio da igreja tocam o dia inteiro, no mesmo ar, ao mesmo tempo. Como não se misturam?',
      porque: 'Pense no dial: cada estação tem o seu número.',
      feito: 'FDM: cada rádio numa frequência, com uma folga entre elas. O dial do rádio é um seletor de fatias do espectro.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '-1' }, instrucao: 'CDMA: com S = (0 +2 0 +2) e B = (+1 -1 +1 -1), quanto dá S · B ÷ 4?', porque: 'Produto interno: multiplique chip a chip e some. 0 × 1 + 2 × (-1) + 0 × 1 + 2 × (-1). Depois divida pelos 4 chips.', feito: '-4 ÷ 4 = -1: B mandou um 0. Faça o mesmo com A e dá +1 (bit 1); com C dá 0, porque C ficou calada. Todos ao mesmo tempo, na mesma faixa.' }),
    passo({ pergunta: '2', exemplo: { resposta: '400' }, instrucao: 'WDM: uma fibra com 40 comprimentos de onda de 10 Gb/s cada. Quantos Gb/s no total?', porque: 'Cada lambda é um canal independente na mesma fibra, como uma estação de rádio feita de luz.', feito: '40 × 10 = 400 Gb/s numa fibra só. O tronco até a cidade vizinha vai ter cor para todo mundo.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'FDM: cada um na sua faixa',
        texto: [
          'Na divisão de frequência, os sinais ficam lado a lado no espectro, com banda de guarda entre eles. A telefonia antiga empilhava canais de voz assim, de 4 kHz em 4 kHz.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Canal', 'Faixa', 'Voz útil'],
          linhas: [
            ['1', '60 a 64 kHz', 'uns 3,1 kHz, o resto é guarda'],
            ['2', '64 a 68 kHz', 'uns 3,1 kHz, o resto é guarda'],
            ['3', '68 a 72 kHz', 'uns 3,1 kHz, o resto é guarda'],
          ],
        },
      },
      {
        titulo: 'TDM: cada um na sua vez',
        texto: ['Na divisão de tempo, todos usam a faixa inteira, mas em fatias fixas. O E1 tem 32 intervalos de 64 kb/s: 2048 kb/s, repetidos 8000 vezes por segundo.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'v', rotulo: '15 de voz', x: 70, y: 40 },
            { id: 's', rotulo: 'sinalização', x: 70, y: 120 },
            { id: 'd', rotulo: '15 de dados', x: 70, y: 200 },
            { id: 'm1', rotulo: 'mux E1', x: 280, y: 120 },
            { id: 'm2', rotulo: 'mux E1', x: 520, y: 120 },
          ],
          ligacoes: [
            ['v', 'm1'],
            ['s', 'm1', 'intervalo 16'],
            ['d', 'm1'],
            ['m1', 'm2', '2048 kb/s'],
          ],
        },
      },
      {
        titulo: 'CDMA: todos ao mesmo tempo',
        texto: [
          'Cada estação tem um código de chips, e os códigos são ortogonais: o produto interno entre dois diferentes dá zero. A manda 1 (o próprio código), B manda 0 (o código invertido), C fica calada. No ar, tudo se soma em S.',
          'Para ouvir uma estação, faça o produto interno de S com o código dela e divida pelo número de chips.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Chips', 'S · código ÷ 4', 'Leitura'],
          linhas: [
            ['A', '+1 +1 +1 +1', '+1', 'bit 1'],
            ['B', '+1 -1 +1 -1', '-1', 'bit 0'],
            ['C', '+1 +1 -1 -1', '0', 'calada'],
            ['S = A - B', '0 +2 0 +2', '', 'o que chega'],
          ],
        },
      },
      {
        titulo: 'WDM: cada um na sua cor',
        texto: ['Na fibra, cada sinal vai num comprimento de onda (lambda). O mux óptico junta as cores e o demux separa. É FDM com luz.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'l1', rotulo: 'λ1 hospital', x: 70, y: 40 },
            { id: 'l2', rotulo: 'λ2 escola', x: 70, y: 120 },
            { id: 'l3', rotulo: 'λ3 rádio', x: 70, y: 200 },
            { id: 'mx', rotulo: 'mux óptico', x: 250, y: 120 },
            { id: 'dx', rotulo: 'demux óptico', x: 530, y: 120 },
          ],
          ligacoes: [
            ['l1', 'mx'],
            ['l2', 'mx'],
            ['l3', 'mx'],
            ['mx', 'dx', 'uma fibra'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O tronco de fibra até a cidade vizinha vai levar o hospital, a escola e a rádio, cada um num laser de cor diferente. Que multiplexação é essa?',
      opcoes: ['WDM, por comprimento de onda', 'TDM, por tempo', 'CDMA, por código', 'Nenhuma: cada um precisa da sua fibra'],
      certa: 0,
      explicacao: 'Cada cor de luz é um comprimento de onda. Juntar vários na mesma fibra é WDM, a divisão de frequência aplicada à luz.',
    },
  },
  desafio: {
    carta: [
      'A central rural do distrito tem um E1 para 12 linhas de telefone e dados. Na última manutenção, alguém trocou as etiquetas: o intervalo 0 virou sinalização e o 16 virou enquadramento. O mux pisca LOF desde então.',
      'O sistema da cooperativa precisa de pelo menos 1152 kb/s de dados, e hoje só 8 linhas de voz estão configuradas.',
      'Objetivo: quadro alinhado, sinalização no 16, 12 canais de voz ou mais, 1152 kb/s de dados ou mais, e a pergunta respondida.',
    ],
    dicas: [
      'Abra o quadro E1 e procure o que está fora do lugar.',
      'Devolva o 0 ao enquadramento e o 16 à sinalização. Dos 30 que sobram, 12 em voz deixam 18 em dados: 18 × 64 kb/s.',
      'Intervalo 0 em enquadramento, 16 em sinalização, 9 a 12 em voz. Cada intervalo passa uma vez por quadro.',
    ],
    perguntas: d50,
    respostas: { '1': '8000' },
    montar: () => {
      const m = novoMundo(1550);
      const slots: UsoSlot[] = Array.from({ length: 32 }, (_, i) => (i === 0 ? 'sinalizacao' : i === 16 ? 'enquadramento' : i <= 8 ? 'voz' : 'dados'));
      adicionar(m, aparelho('mux', 'mux', 'Multiplexador E1 da central rural, com etiquetas trocadas', [{ nome: 'e1' }], { slots }));
      return m;
    },
    objetivo: (m) => {
      const r = e1(m);
      return [
        item('quadro alinhado (intervalo 0 em enquadramento)', !r.lof),
        item('sinalização no intervalo 16', r.sinalizacao),
        item('12 canais de voz ou mais', r.voz >= 12, `${r.voz}`),
        item('1152 kb/s de dados ou mais', r.dados >= 1152, `${r.dados} kb/s`),
        respondida(m, d50[0]!),
      ];
    },
    solucao: [
      ['equip', 'mux', 'mostra'],
      ['equip', 'mux', 'slot', { lista: '0', uso: 'enquadramento' }],
      ['equip', 'mux', 'slot', { lista: '16', uso: 'sinalizacao' }],
      ['equip', 'mux', 'slot', { lista: '9-12', uso: 'voz' }],
    ],
  },
};

export const ATO1C: Dia[] = [dia48, dia49, dia50];
