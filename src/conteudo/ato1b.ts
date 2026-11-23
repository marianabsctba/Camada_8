// Dias novos do ato 1 (A Rua), com prática guiada, aula e desafio no próprio dia.
// O espectro eletromagnético, o espectro espalhado e a luz pelo ar (seções 2.2.1 a 2.2.4, 2.3.3 e 2.3.4).

import { snrWifi } from '../motor/aparelhos';
import { avaliar, fspl, radioDados } from '../motor/fisico';
import { adicionar, aparelho, ligar, novoMundo, type Equipamento, type Mundo } from '../motor/mundo';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Rádio ponto a ponto com antena direcional. */
function radio(nome: string, modelo: string, antena: Equipamento['antena'], rumo: number, alturaMax = 30): Equipamento {
  const e = aparelho(nome, 'radio', modelo, [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax });
  e.antena = antena;
  return e;
}

/** Conferência de enlace de rádio: associado e com RSSI mínimo. */
const rssiOk = (cabo: string, minimo: number, dica: string) => (m: Mundo) => {
  const c = m.cabos.get(cabo)!;
  const d = radioDados(m, c);
  return (avaliar(m, c).up && d.rssi >= minimo) || `RSSI de ${d.rssi.toFixed(1)} dBm. ${dica}`;
};

const snrDe = (m: Mundo, ap: string) => snrWifi(m.equipamentos.get(ap)!.s as any).snr;

/* ======================================================================
 * ref 45: O espectro eletromagnético (2.2.1)
 * ====================================================================== */

const p45: Pergunta[] = [
  numerica('1', 'Na mesma distância de 5 km, quantos dB o enlace de 5,8 GHz perde no espaço livre a mais que o de 2,4 GHz? (uma casa decimal)', fspl(5, 5.8) - fspl(5, 2.4), 0.15),
  numerica('2', 'Qual o comprimento de onda de 5,8 GHz, em centímetros? (use c = 300.000 km/s, uma casa decimal)', 30 / 5.8, 0.1),
];

const d45: Pergunta[] = [numerica('1', 'Na mesma distância, quantos dB o rádio de 24 GHz perde no espaço livre a mais que o de 5,8 GHz? (uma casa decimal)', fspl(1, 24) - fspl(1, 5.8), 0.2)];

const dia45: Dia = {
  numero: 45,
  ato: 1,
  titulo: 'O espectro eletromagnético',
  chamado: [
    'CHAMADO #0045',
    'A cooperativa, a 5 km da torre, já tem um enlace de rádio em 2,4 GHz. Funciona, mas divide a faixa com todo Wi-Fi, babá eletrônica e micro-ondas de Fim de Linha.',
    'A diretoria comprou um segundo par de rádios, de 5,8 GHz, "porque o número é maior". O instalador subiu os dois lados e foi embora antes de apontar a antena da cooperativa.',
    'Objetivo: o enlace de 5,8 GHz (c2) associado com RSSI de -65 dBm ou melhor, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Frequência, comprimento de onda e as faixas do espectro',
    texto: [
      'Uma onda eletromagnética é um campo elétrico e magnético que oscila e se espalha. A frequência (f) diz quantas oscilações acontecem por segundo, em hertz (Hz): 2,4 GHz são 2,4 bilhões de oscilações por segundo. O comprimento de onda (λ, lâmbda) é a distância entre duas cristas seguidas, em metros.',
      'No vácuo, toda onda eletromagnética anda à velocidade da luz, c, perto de 300.000 km/s (3 × 10⁸ m/s). Por isso as duas grandezas andam presas uma à outra: c = λ × f. Frequência maior, onda mais curta. Em 2,4 GHz, λ = 3 × 10⁸ ÷ 2,4 × 10⁹ = 0,125 m, ou 12,5 cm.',
      'O espectro é a régua inteira das frequências, da mais baixa à mais alta: rádio (até uns 300 MHz), micro-ondas (de 300 MHz a 300 GHz, onde moram o celular, o Wi-Fi e os enlaces ponto a ponto), infravermelho, luz visível, ultravioleta e, acima disso, raios X e gama, que não servem para rede nenhuma e ainda fazem mal.',
      'A regra de bolso: quanto mais alta a frequência, mais banda cabe (há mais hertz disponíveis em cada faixa), mas menor o alcance e maior a sensibilidade a obstáculos. Ondas curtas atravessam mal paredes, folhas e chuva, e a perda no espaço livre cresce com a frequência: perda = 32,44 + 20 log₁₀(d em km) + 20 log₁₀(f em MHz), em dB. Dobrar a frequência custa 6 dB, como dobrar a distância.',
      'O espectro é dividido pelo governo. Faixas licenciadas são de uso exclusivo de quem paga a licença (a operadora de celular, a TV). Faixas não licenciadas, como as ISM (industrial, científica e médica) de 2,4 GHz e as de 5 GHz, são de quem chegar, desde que respeite o limite de potência. É por isso que o Wi-Fi existe, e é por isso que ele vive lotado.',
    ],
  },
  dicas: [
    'Compare a perda no espaço livre dos dois enlaces: os detalhes de cada um mostram o número.',
    'No rádio coop-alta, compare o rumo até a torre com o azimute da antena.',
    'Ajuste a antena da coop-alta para 255°. As respostas são 7,7 dB e 5,2 cm.',
  ],
  perguntas: p45,
  montar: () => {
    const m = novoMundo(145);
    adicionar(m, radio('torre-baixa', 'Rádio PTP de 2,4 GHz na torre, antena de 18 dBi', { ganho: 18, azimute: 75, azimuteCerto: 75, altura: 25, feixe: 15 }, 75));
    adicionar(m, radio('coop-baixa', 'Rádio PTP de 2,4 GHz na cooperativa, antena de 18 dBi', { ganho: 18, azimute: 255, azimuteCerto: 255, altura: 20, feixe: 15 }, 255));
    adicionar(m, radio('torre-alta', 'Rádio PTP de 5,8 GHz na torre, antena de 23 dBi', { ganho: 23, azimute: 75, azimuteCerto: 75, altura: 25, feixe: 9 }, 75));
    adicionar(m, radio('coop-alta', 'Rádio PTP de 5,8 GHz na cooperativa, antena de 23 dBi (apontada "mais ou menos")', { ganho: 23, azimute: 300, azimuteCerto: 255, altura: 20, feixe: 9 }, 255));
    ligar(m, { equip: 'torre-baixa', porta: 'ar' }, { equip: 'coop-baixa', porta: 'ar' }, 'radio', 5000, { id: 'c1', radio: { distanciaKm: 5, freqGHz: 2.4, obstaculoM: 0, ptxDbm: 20 } });
    ligar(m, { equip: 'torre-alta', porta: 'ar' }, { equip: 'coop-alta', porta: 'ar' }, 'radio', 5000, { id: 'c2', radio: { distanciaKm: 5, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
    m.proxCabo = 3;
    return m;
  },
  objetivo: (m) => {
    const c = m.cabos.get('c2')!;
    const d = radioDados(m, c);
    return [item('enlace de 5,8 GHz associado com RSSI de -65 dBm ou melhor', avaliar(m, c).up && d.rssi >= -65, `${d.rssi.toFixed(1)} dBm`), ...todasRespondidas(m, p45)];
  },
  posMorte: [
    'A antena da cooperativa estava 45° fora do rumo, com um feixe de 9°: perda de desalinhamento no teto do modelo, 40 dB. Apontada para 255°, o RSSI foi para perto de -56 dBm, e o rádio associou a 300 Mb/s.',
    'Os 5,8 GHz perdem 7,7 dB a mais no espaço livre que os 2,4 GHz, porque a frequência é 2,4 vezes maior: 20 log₁₀(2,4) ≈ 7,7. O que paga essa conta são as antenas de 23 dBi, 5 dB melhores de cada lado, e uma faixa bem menos disputada.',
    'Com λ de 5,2 cm contra 12,5 cm, a onda de 5,8 GHz também sofre mais com folha molhada e parede. Para 5 km de visada limpa entre a torre e a cooperativa, tanto faz. Para o pomar do vizinho no meio do caminho, faria toda a diferença.',
  ],
  passos: [
    passo({ alvo: ['cabo', 'c1'], acao: 'detalhes', instrucao: 'Abra os detalhes do enlace antigo, de 2,4 GHz.', porque: 'A perda no espaço livre é o quanto o sinal se espalha só por viajar. Ela depende da distância e da frequência, e o detalhe do enlace mostra o número.', feito: 'Perda no espaço livre de 114,0 dB em 5 km. Mesmo assim o rádio chega a uns -58 dBm, porque potência e antenas compensam.' }),
    passo({ alvo: ['cabo', 'c2'], acao: 'detalhes', instrucao: 'Agora os detalhes do enlace novo, de 5,8 GHz.', porque: 'Mesma distância, frequência mais alta. Compare a primeira linha com a do enlace antigo.', feito: 'Perda no espaço livre de 121,7 dB. E o RSSI lá no fundo, porque ainda tem outro problema: a antena.' }),
    passo({ pergunta: '1', exemplo: { resposta: '7.7' }, instrucao: 'Quantos dB a mais o enlace de 5,8 GHz perde no espaço livre?', porque: 'Subtraia as duas perdas. Ou faça a conta direto: só a frequência mudou, então a diferença é 20 log₁₀(5,8 ÷ 2,4).', feito: '7,7 dB. A frequência subiu 2,4 vezes, e cada vez que ela dobra o espaço livre cobra 6 dB.' }),
    passo({ alvo: ['equip', 'coop-alta'], acao: 'mostra', instrucao: 'No rádio de 5,8 GHz da cooperativa, veja o enlace.', porque: 'Antes de culpar a frequência, confira o básico: para onde a antena aponta e qual é o rumo até a torre.', feito: 'Rumo para a torre: 255°. Antena apontada para 300°. Com um feixe de 9°, 45° de erro é olhar para o lado errado do mundo.' }),
    passo({
      alvo: ['equip', 'coop-alta'],
      acao: 'antena',
      pedir: ['azimute'],
      valores: { altura: '20' },
      exemplo: { azimute: '255' },
      instrucao: 'Gire a antena da cooperativa para o rumo da torre.',
      porque: 'Antena direcional concentra a energia num feixe estreito. Fora dele, os 23 dBi de ganho viram desperdício.',
      conferir: rssiOk('c2', -65, 'O rumo até a torre é 255°.'),
      feito: 'RSSI perto de -56 dBm, associado a 300 Mb/s. A frequência alta perde mais, mas a antena maior e o alinhamento pagam a conta.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque 5,8 GHz é faixa não licenciada com muito mais espaço livre que os 2,4 GHz, onde a cidade inteira já briga',
          'Porque frequência mais alta sempre vai mais longe',
          'Porque 5,8 GHz é faixa licenciada, exclusiva da cooperativa',
          'Porque em 5,8 GHz a onda é mais longa e atravessa melhor as paredes',
        ],
        certa: 0,
        errada: {
          1: 'É o contrário: a perda no espaço livre cresce com a frequência. Você acabou de medir 7,7 dB a mais.',
          2: 'As faixas de 5 GHz são não licenciadas, como a de 2,4 GHz. Qualquer um usa, respeitando o limite de potência. Ninguém tem exclusividade.',
          3: 'Frequência maior, onda mais curta: c = λ × f. E onda curta atravessa pior, não melhor.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se 5,8 GHz perde mais, por que valeu a pena trocar?',
      porque: 'A escolha de faixa é uma troca: alcance e penetração de um lado, banda e sossego do outro.',
      feito: 'Mais banda disponível e menos vizinhos. Em 2,4 GHz há só três canais de 22 MHz que não se sobrepõem; em 5 GHz há muitos mais.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: '5.2' }, instrucao: 'Qual o comprimento de onda de 5,8 GHz, em centímetros?', porque: 'λ = c ÷ f. Com c = 3 × 10⁸ m/s e f = 5,8 × 10⁹ Hz, o resultado sai em metros; multiplique por 100.', feito: 'Uns 5,2 cm, menos da metade dos 12,5 cm de 2,4 GHz. É por isso que a antena de 5,8 GHz é menor para o mesmo ganho.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'A régua do espectro',
        texto: ['Da esquerda para a direita, a frequência sobe e o comprimento de onda encolhe. Rede usa rádio, micro-ondas e luz (infravermelho e visível). Do ultravioleta para cima, a energia já danifica tecido vivo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Faixa', 'Frequência', 'Comprimento de onda', 'Em Fim de Linha'],
          linhas: [
            ['rádio', 'até 300 MHz', 'acima de 1 m', 'a rádio AM e FM da praça'],
            ['micro-ondas', '300 MHz a 300 GHz', '1 m a 1 mm', 'celular, Wi-Fi, enlaces da torre'],
            ['infravermelho', '300 GHz a 400 THz', '1 mm a 750 nm', 'controle remoto, fibra óptica'],
            ['luz visível', '400 a 750 THz', '750 a 400 nm', 'o poste da rua, o laser apontador'],
            ['ultravioleta', '750 THz a 30 PHz', '400 a 10 nm', 'protetor solar; rede, nenhuma'],
          ],
        },
      },
      {
        titulo: 'c = λ × f',
        texto: [
          'A velocidade é fixa (c, uns 3 × 10⁸ m/s no vácuo), então frequência e comprimento de onda são duas formas de dizer a mesma coisa.',
          '2,4 GHz: λ = 12,5 cm. 5,8 GHz: λ ≈ 5,2 cm. 60 GHz: λ = 5 mm. A antena costuma ter tamanho da ordem de λ, por isso o rádio de frequência alta é pequeno.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'f', rotulo: 'frequência sobe', x: 120, y: 60 },
            { id: 'l', rotulo: 'onda encurta', x: 480, y: 60 },
            { id: 'b', rotulo: 'mais banda', x: 120, y: 180 },
            { id: 'a', rotulo: 'menos alcance, mais sensível', x: 480, y: 180 },
          ],
          ligacoes: [
            ['f', 'l', 'c = λ × f'],
            ['f', 'b', 'mais Hz na faixa'],
            ['l', 'a', 'espaço livre e obstáculo cobram'],
          ],
        },
      },
      {
        titulo: 'Quanto a frequência cobra',
        texto: ['Ponha 5 km de distância e mude só a frequência. De 2,4 GHz para 5,8 GHz são 7,7 dB a mais. De 5,8 para 24 GHz, mais 12,3 dB. Dobrar a frequência custa 6 dB, como dobrar a distância.'],
        visual: { tipo: 'calculadora', formula: 'fspl' },
      },
      {
        titulo: 'Licenciada ou não licenciada',
        texto: ['A faixa licenciada é exclusiva e sossegada, mas custa caro. A não licenciada é grátis, mas é condomínio: qualquer aparelho dentro do limite de potência pode usar.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Faixa', 'Tipo', 'Quem usa'],
          linhas: [
            ['700 MHz', 'licenciada', 'a operadora de celular, que pagou pelo leilão'],
            ['2,4 GHz (ISM)', 'não licenciada', 'Wi-Fi, fones sem fio, babá eletrônica, micro-ondas'],
            ['5 GHz', 'não licenciada', 'Wi-Fi e enlaces ponto a ponto, com muito mais canais'],
            ['24 GHz (ISM)', 'não licenciada', 'radares curtos e enlaces de alcance pequeno'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'A escola quer um enlace de 3 km atravessando um bosque de eucaliptos. Entre 900 MHz e 5,8 GHz, qual tende a sofrer menos com as árvores, e qual entrega mais banda?',
      opcoes: [
        '900 MHz sofre menos com as árvores; 5,8 GHz entrega mais banda',
        '5,8 GHz sofre menos com as árvores e ainda entrega mais banda',
        'Os dois sofrem igual, porque a velocidade da luz é a mesma',
        '900 MHz entrega mais banda, porque a onda é mais comprida',
      ],
      certa: 0,
      explicacao: 'Frequência baixa, onda longa: atravessa melhor folhas e perde menos no espaço livre, mas a faixa tem poucos hertz. Frequência alta tem banda de sobra e alcance curto.',
    },
  },
  desafio: {
    carta: [
      'Recado do hospital, a 12 km da torre: "o fornecedor disse que o rádio de 24 GHz é o mais rápido. Instalamos, e nada. O de 5,8 GHz, que veio de brinde, ninguém apontou."',
      'Os dois pares estão montados. Um não chega de jeito nenhum; o outro só precisa de alguém com bússola.',
      'Objetivo: um enlace até o hospital associado a 130 Mb/s ou mais, e a pergunta respondida.',
    ],
    dicas: [
      'Veja os detalhes dos dois enlaces e compare a perda no espaço livre com o que as antenas compensam.',
      'O de 24 GHz está bem apontado e mesmo assim não associa. O de 5,8 GHz tem uma ponta torta.',
      'Aponte a antena do hosp-5g8 para o rumo da torre, 200°. A diferença de perda é 20 log₁₀(24 ÷ 5,8), uns 12,3 dB.',
    ],
    perguntas: d45,
    montar: () => {
      const m = novoMundo(1545);
      adicionar(m, radio('torre-24g', 'Rádio PTP de 24 GHz na torre, antena de 20 dBi', { ganho: 20, azimute: 20, azimuteCerto: 20, altura: 30, feixe: 5 }, 20));
      adicionar(m, radio('hosp-24g', 'Rádio PTP de 24 GHz no hospital, antena de 20 dBi', { ganho: 20, azimute: 200, azimuteCerto: 200, altura: 25, feixe: 5 }, 200));
      adicionar(m, radio('torre-5g8', 'Rádio PTP de 5,8 GHz na torre, antena de 23 dBi', { ganho: 23, azimute: 20, azimuteCerto: 20, altura: 30, feixe: 9 }, 20));
      adicionar(m, radio('hosp-5g8', 'Rádio PTP de 5,8 GHz no hospital, antena de 23 dBi (ainda na posição da caixa)', { ganho: 23, azimute: 10, azimuteCerto: 200, altura: 25, feixe: 9 }, 200));
      ligar(m, { equip: 'torre-24g', porta: 'ar' }, { equip: 'hosp-24g', porta: 'ar' }, 'radio', 12000, { id: 'c1', radio: { distanciaKm: 12, freqGHz: 24, obstaculoM: 0, ptxDbm: 20 } });
      ligar(m, { equip: 'torre-5g8', porta: 'ar' }, { equip: 'hosp-5g8', porta: 'ar' }, 'radio', 12000, { id: 'c2', radio: { distanciaKm: 12, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
      m.proxCabo = 3;
      return m;
    },
    objetivo: (m) => {
      const melhor = Math.max(...['c1', 'c2'].map((id) => avaliar(m, m.cabos.get(id)!).velocidade));
      return [item('enlace até o hospital associado a 130 Mb/s ou mais', melhor >= 130, `${melhor} Mb/s`), ...todasRespondidas(m, d45)];
    },
    solucao: [
      ['cabo', 'c1', 'detalhes'],
      ['cabo', 'c2', 'detalhes'],
      ['equip', 'hosp-5g8', 'mostra'],
      ['equip', 'hosp-5g8', 'antena', { azimute: '200', altura: '25' }],
    ],
    respostas: { '1': '12,3' },
  },
};

/* ======================================================================
 * ref 46: Espalhar para não brigar (2.2.2 a 2.2.4)
 * ====================================================================== */

const p46: Pergunta[] = [
  numerica('1', 'Cada bit vira uma sequência de 11 chips. Com os dados a 1 Mb/s, quantos milhões de chips por segundo vão para o ar?', 11, 0.01),
  numerica('2', 'Espalhar cada bit em 11 chips dá ao receptor um ganho de processamento de 10 log₁₀(11). Quantos dB? (uma casa decimal)', 10 * Math.log10(11), 0.15),
];

const d46: Pergunta[] = [numerica('1', 'Um transmissor salta por 79 canais de 1 MHz, por igual. Um interferente fixo ocupa um desses canais. Que porcentagem dos saltos ele atinge? (uma casa decimal)', 100 / 79, 0.1)];

const dia46: Dia = {
  numero: 46,
  ato: 1,
  titulo: 'Espalhar para não brigar',
  chamado: [
    'CHAMADO #0046',
    'Sábado é dia de feira na praça, e o ponto de acesso da feira está no canal 4, "bem no meio, para ficar perto de todo mundo". Ficou: perto do quiosque do coco no canal 1 e da câmera da prefeitura no canal 6, ao mesmo tempo.',
    'A associação de feirantes quer saber por que o Wi-Fi não fica no canal 4 "e pronto", e por que cada rede ocupa tanto espaço se manda tão pouco.',
    'Objetivo: SNR de 25 dB ou mais no cliente do ap-feira, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Espectro espalhado: salto de frequência, sequência direta e banda ultralarga',
    texto: [
      'O jeito óbvio de transmitir é usar uma faixa estreita, só do tamanho necessário. O problema é que qualquer interferente estreito em cima dela derruba tudo. O espectro espalhado faz o contrário de propósito: gasta muito mais banda do que precisa, e em troca fica difícil de derrubar e consegue dividir a faixa com outros.',
      'No salto de frequência (FHSS), o transmissor pula de canal em canal muitas vezes por segundo, numa ordem que o receptor também conhece. Um interferente parado num canal só atinge os saltos que caem nele: com 79 canais, uns 1,3 % do tempo. Os fones e teclados sem fio da cidade fazem isso, e por isso dividem os 2,4 GHz sem combinar nada com ninguém.',
      'Na sequência direta (DSSS), cada bit é multiplicado por um código de chips, uma sequência mais rápida que o próprio bit. O Wi-Fi original de 2,4 GHz usa 11 chips por bit: a 1 Mb/s, saem 11 milhões de chips por segundo, e é isso que faz o canal ocupar uns 22 MHz, embora os canais sejam numerados de 5 em 5 MHz. O receptor conhece o código e desfaz o espalhamento: o sinal volta a ficar estreito e forte, e um interferente estreito, ao contrário, é espalhado e vira um ruído baixo. Esse ganho de processamento vale 10 log₁₀(11) ≈ 10,4 dB.',
      'Com códigos diferentes e quase sem correlação entre si, vários transmissores podem até usar a mesma faixa ao mesmo tempo: cada receptor desespalha o seu e enxerga os outros como ruído. É a ideia que a telefonia celular 3G levou a sério, com o CDMA.',
      'A banda ultralarga (UWB) leva isso ao extremo: pulsos curtíssimos que ocupam mais de 500 MHz, com potência tão baixa em cada pedaço da faixa que, para os outros rádios, ficam abaixo do ruído de fundo. Alcance curto, banda enorme e, de brinde, medição de distância muito precisa. Espalhar não é mágica, porém: um vizinho forte e largo, no mesmo pedaço da faixa, continua sendo um vizinho forte e largo.',
    ],
  },
  dicas: [
    'Comece pelo analisador de espectro: veja onde estão os vizinhos fortes.',
    'Cada canal ocupa 22 MHz, uns 4 canais e meio. Procure um canal a 5 ou mais de distância dos vizinhos fortes.',
    'Ponha o ap-feira no canal 11. As respostas são 11 e 10,4.',
  ],
  perguntas: p46,
  montar: () => {
    const m = novoMundo(146);
    adicionar(
      m,
      aparelho('ap-feira', 'ap', 'Ponto de acesso da feira, no poste da praça (802.11 em 2,4 GHz, sequência direta)', [{ nome: 'lan' }], {
        canal: 4,
        sinalCliente: -58,
        ruidoDbm: -95,
        vizinhos: [
          { nome: 'Quiosque_Coco_Gelado', canal: 1, dbm: -50 },
          { nome: 'CAMERA_PORTARIA_PREFEITURA', canal: 6, dbm: -55 },
          { nome: 'Escola_Visitantes', canal: 13, dbm: -85 },
        ],
      }),
    );
    return m;
  },
  objetivo: (m) => [item('SNR de 25 dB ou mais no cliente do ap-feira', snrDe(m, 'ap-feira') >= 25, `${snrDe(m, 'ap-feira').toFixed(1)} dB`), ...todasRespondidas(m, p46)],
  posMorte: [
    'No canal 4, o ap-feira herdava um terço do quiosque do canal 1 e mais da metade da câmera do canal 6: SNR negativa, o cliente ouvia mais os vizinhos que a própria feira. No canal 11, a câmera fica a 5 canais, 25 MHz de distância, e não encosta. Sobra só a borda fraca da escola no 13: SNR perto de 29 dB.',
    'Os 22 MHz de cada canal não são desperdício: são os 11 chips por bit da sequência direta. É esse espalhamento que deixa o Wi-Fi conviver com um interferente estreito, que o receptor dilui em 10,4 dB de ganho de processamento.',
    'Mas espalhar não resolve vizinho largo e forte no mesmo pedaço do ar. Para isso o remédio é outro, o mais antigo de todos: cada um no seu canal.',
  ],
  passos: [
    passo({ alvo: ['equip', 'ap-feira'], acao: 'espectro', instrucao: 'Abra o analisador de espectro na praça.', porque: 'Antes de mexer no canal, veja quem mais está no ar, em que canal e com que força.', feito: 'Quiosque no canal 1 a -50 dBm, câmera no 6 a -55 dBm, escola no 13 bem fraquinha. E a feira no 4, espremida entre os dois fortes.' }),
    passo({ alvo: ['equip', 'ap-feira'], acao: 'mostra', instrucao: 'Veja a SNR no cliente do ap-feira.', porque: 'A SNR compara o sinal da feira com tudo o que não é ela: ruído de fundo mais a fração de cada vizinho que cai dentro do canal.', feito: 'SNR negativa. O canal 4 fica a 3 canais do quiosque e a 2 da câmera, e como cada transmissão ocupa 22 MHz, os dois caem em cima.' }),
    passo({ pergunta: '1', exemplo: { resposta: '11' }, instrucao: 'Cada bit vira 11 chips. A 1 Mb/s, quantos milhões de chips por segundo vão para o ar?', porque: 'Na sequência direta, o código de chips é bem mais rápido que os dados. Multiplique a taxa de bits pelo número de chips por bit.', feito: '11 milhões de chips por segundo. Um sinal que muda 11 milhões de vezes por segundo ocupa uns 22 MHz: é por isso que o canal é tão largo.' }),
    passo({
      escolha: {
        opcoes: [
          'O receptor desfaz o espalhamento com o código: o sinal certo volta a ficar estreito e forte, e o interferente estreito se espalha e vira um ruído baixo',
          'O interferente estreito derruba o sinal espalhado, porque basta acertar um pedaço da faixa',
          'Nada, porque sinal espalhado não pode receber interferência nenhuma',
          'O transmissor percebe o interferente e muda de canal sozinho',
        ],
        certa: 0,
        errada: {
          1: 'Isso aconteceria com um sinal estreito. O espalhado tem a informação distribuída na faixa inteira: perder um pedaço só custa um pouco.',
          2: 'Pode, sim. Ele aguenta bem interferente estreito, mas um vizinho largo e forte, no mesmo canal, ainda faz estrago. Você está vendo isso no analisador.',
          3: 'Quem pula de canal é o salto de frequência, e numa ordem combinada, não por perceber interferência. Aqui é sequência direta.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A babá eletrônica da barraca de queijo transmite um sinal estreito, de 1 MHz, bem no meio do canal da feira. O que acontece?',
      porque: 'O código de chips é conhecido pelo receptor e só por ele. Pense no que a multiplicação pelo código faz com o que é do código e com o que não é.',
      feito: 'O receptor concentra de volta o que é dele e espalha o que não é. O interferente estreito sai diluído, com 10,4 dB a menos de estrago.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: '10.4' }, instrucao: 'Quanto vale o ganho de processamento de 11 chips por bit, em dB?', porque: 'O ganho de processamento é a razão entre a taxa de chips e a taxa de bits, em dB: 10 log₁₀(11).', feito: '10,4 dB. É a vantagem que o receptor ganha sobre qualquer interferente estreito.' }),
    passo({
      alvo: ['equip', 'ap-feira'],
      acao: 'canal',
      pedir: ['canal'],
      exemplo: { canal: '11' },
      instrucao: 'Mude o ap-feira para um canal onde os vizinhos fortes não encostem.',
      porque: 'Vizinho largo e forte o espalhamento não resolve. Canais a 5 ou mais de distância (25 MHz) não se sobrepõem.',
      conferir: (m) => snrDe(m, 'ap-feira') >= 25 || `SNR de ${snrDe(m, 'ap-feira').toFixed(1)} dB. Fique a 5 canais ou mais do quiosque (1) e da câmera (6).`,
      feito: 'No canal 11, SNR perto de 29 dB. A câmera ficou a 25 MHz de distância, e da escola só encosta a borda.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Por que o canal tem 22 MHz',
        texto: ['Os canais de 2,4 GHz são numerados de 5 em 5 MHz, mas cada transmissão de sequência direta ocupa uns 22 MHz. É a largura dos 11 milhões de chips por segundo. Por isso só 1, 6 e 11 ficam sem se encostar.'],
        visual: {
          tipo: 'espectro',
          canais: [
            { canal: 1, dbm: -50, rotulo: 'quiosque' },
            { canal: 6, dbm: -55, rotulo: 'câmera' },
            { canal: 11, dbm: -58, rotulo: 'feira' },
          ],
        },
      },
      {
        titulo: 'Sequência direta: o código de chips',
        texto: [
          'Cada bit é trocado por 11 chips. O bit 1 vira a sequência do código; o bit 0, a mesma sequência invertida. O receptor, que conhece o código, compara o que chegou com ele e decide se era 1 ou 0, mesmo com alguns chips estragados.',
        ],
        visual: { tipo: 'bits', antes: '1 0', depois: '10110111000 01001000111', legenda: 'Um bit vira 11 chips: 1 Mb/s de dados, 11 Mchip/s no ar' },
      },
      {
        titulo: 'Três jeitos de espalhar',
        texto: ['Todos gastam mais banda do que precisam. Em troca, resistem a interferência e deixam vários dividirem a faixa.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Técnica', 'Como espalha', 'Contra um interferente estreito', 'Onde aparece'],
          linhas: [
            ['salto de frequência', 'pula de canal numa ordem combinada', 'só perde os saltos que caem nele', 'fones e teclados sem fio'],
            ['sequência direta', 'multiplica cada bit por um código de chips', 'dilui o interferente no desespalhamento', 'Wi-Fi original de 2,4 GHz, 3G'],
            ['banda ultralarga', 'pulsos curtíssimos em mais de 500 MHz', 'fica abaixo do ruído dos outros', 'medição de distância, ligação curta'],
          ],
        },
      },
      {
        titulo: 'Desespalhar: o que é do código volta, o resto se dilui',
        texto: ['O receptor multiplica o que chega pelo mesmo código. O sinal certo se concentra de novo; o interferente, que não tem o código, se espalha. A vantagem é o ganho de processamento: 10 log₁₀(11) ≈ 10,4 dB.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'd', rotulo: 'dados (1 Mb/s)', x: 70, y: 60 },
            { id: 'x', rotulo: '× código', x: 230, y: 60 },
            { id: 'ar', rotulo: 'ar: 22 MHz + interferente', x: 400, y: 60 },
            { id: 'y', rotulo: '× mesmo código', x: 400, y: 180 },
            { id: 's', rotulo: 'dados de volta, interferente diluído', x: 160, y: 180 },
          ],
          ligacoes: [
            ['d', 'x', 'espalha'],
            ['x', 'ar', '11 Mchip/s'],
            ['ar', 'y', 'recebe'],
            ['y', 's', 'desespalha'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Num salto de frequência por 79 canais, um forno de micro-ondas estraga 1 canal. Num enlace de sequência direta com 11 chips por bit, uma babá eletrônica estreita cai no meio do canal. Qual frase é verdadeira?',
      opcoes: [
        'Os dois sobrevivem: o salto perde só uns 1,3 % dos saltos, e a sequência direta dilui a babá com o ganho de processamento',
        'Os dois caem, porque qualquer interferente na faixa derruba sinal espalhado',
        'Só o salto sobrevive, porque a sequência direta fica parada num canal',
        'Só a sequência direta sobrevive, porque o salto sempre cai no canal ruim',
      ],
      certa: 0,
      explicacao: 'Espalhar, de qualquer jeito, é dividir o risco: o salto foge do interferente na maior parte do tempo, e a sequência direta o dilui ao desespalhar.',
    },
  },
  desafio: {
    carta: [
      'Chamado da biblioteca da praça: "o Wi-Fi do salão de leitura está no canal 7, que o técnico achou bonito. Agora ninguém consegue nem abrir o catálogo."',
      'O analisador mostra a feira de pastel e o Wi-Fi da prefeitura, fortes e largos. Espalhamento nenhum dá conta disso.',
      'Objetivo: SNR de 25 dB ou mais no cliente do ap-biblioteca, e a pergunta respondida.',
    ],
    dicas: [
      'Olhe o analisador e procure o pedaço da faixa onde os vizinhos fortes não chegam.',
      'Os fortes estão no 6 e no 11. A 5 canais deles, só sobra a ponta de baixo da faixa.',
      'Ponha o ap-biblioteca no canal 1. A resposta é 100 ÷ 79 ≈ 1,3 %.',
    ],
    perguntas: d46,
    montar: () => {
      const m = novoMundo(1546);
      adicionar(
        m,
        aparelho('ap-biblioteca', 'ap', 'Ponto de acesso da biblioteca da praça (802.11 em 2,4 GHz)', [{ nome: 'lan' }], {
          canal: 7,
          sinalCliente: -60,
          ruidoDbm: -95,
          vizinhos: [
            { nome: 'Coreto_Antigo', canal: 1, dbm: -90 },
            { nome: 'PASTEL_DA_FEIRA_GRATIS', canal: 6, dbm: -48 },
            { nome: 'Prefeitura_Wifi_Livre', canal: 11, dbm: -52 },
          ],
        }),
      );
      return m;
    },
    objetivo: (m) => [item('SNR de 25 dB ou mais no cliente do ap-biblioteca', snrDe(m, 'ap-biblioteca') >= 25, `${snrDe(m, 'ap-biblioteca').toFixed(1)} dB`), ...todasRespondidas(m, d46)],
    solucao: [
      ['equip', 'ap-biblioteca', 'espectro'],
      ['equip', 'ap-biblioteca', 'canal', { canal: '1' }],
      ['equip', 'ap-biblioteca', 'mostra'],
    ],
    respostas: { '1': '1,3' },
  },
};

/* ======================================================================
 * ref 47: Luz pelo ar (2.3.3 e 2.3.4)
 * ====================================================================== */

const p47: Pergunta[] = [
  numerica('1', 'No modelo do simulador, a perda por desalinhamento é 12 × (erro ÷ feixe)² dB. Com o feixe de 2°, quantos dB custa 1° de erro?', 3, 0.1),
  numerica('2', 'Qual o comprimento de onda de 60 GHz, em milímetros? (use c = 3 × 10⁸ m/s)', 5, 0.1),
];

const d47: Pergunta[] = [numerica('1', 'A 60 GHz e 0,8 km, o raio da 1ª zona de Fresnel no meio do caminho é de 1 m. Quantos metros, no mínimo, o feixe precisa passar acima da caixa d\'água?', 0.6 * 8.657 * Math.sqrt(0.8 / 60), 0.05)];

const dia47: Dia = {
  numero: 47,
  ato: 1,
  titulo: 'Luz pelo ar',
  chamado: [
    'CHAMADO #0047',
    'A prefeitura e o prédio vizinho, a 400 m, conversavam por um feixe apontado de um telhado ao outro. Na terça, o compressor novo do ar-condicionado do prédio começou a vibrar o suporte, e o feixe saiu do alvo.',
    'O simulador do galpão não tem laser no ar. Ele trata este enlace como um rádio de 60 GHz com feixe de 2°: a física da luz é outra, mas o drama do alinhamento é o mesmo, e é ele que você vai treinar.',
    'Objetivo: o enlace c1 associado com RSSI de -65 dBm ou melhor, e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Infravermelho e enlace óptico no espaço livre',
    texto: [
      'Luz também é onda eletromagnética, só que de frequência muito alta: centenas de terahertz. Dá para mandar bits por ela sem fibra nenhuma, pelo ar. Os dois casos clássicos são o infravermelho de curto alcance e o enlace óptico no espaço livre, com laser.',
      'O infravermelho é o do controle remoto: um LED pisca rápido, invisível ao olho, e o receptor da TV lê o padrão. É barato, não precisa de licença e não atravessa parede. Isso é defeito e virtude ao mesmo tempo: o controle da sala não muda o canal da TV do quarto, nem a do vizinho. O alcance é de poucos metros e precisa de visada, ou pelo menos de uma parede clara para refletir.',
      'O enlace óptico no espaço livre aponta um laser de um prédio para o outro. Tem banda enorme, não precisa de licença, não depende de cavar a rua e é difícil de grampear sem ficar no meio do feixe. Em troca, o feixe é estreitíssimo: o prédio balança com o vento, dilata com o sol e vibra com máquina no telhado, e qualquer fração de grau tira o feixe do receptor. Por isso os equipamentos têm feixe um pouco aberto ou se realinham sozinhos.',
      'O tempo é o outro inimigo. Neblina é o pior para a luz: as gotículas têm tamanho parecido com o comprimento de onda dela e espalham o feixe em todas as direções. Chuva forte também atrapalha, e o calor do telhado cria bolhas de ar quente que entortam o feixe, como a estrada que parece molhada num dia quente.',
      'Aproximação honesta: o simulador não tem laser no ar, então este dia usa um rádio de 60 GHz com feixe de 2°, que também é uma faixa de alcance curto, muita banda e alinhamento crítico. A diferença que importa: chuva forte castiga mais a onda milimétrica, e neblina castiga mais a luz. No modelo, errar o rumo custa 12 × (erro ÷ feixe)² dB, até um máximo de 40 dB.',
    ],
  },
  dicas: [
    'Comece pelo rádio do prédio: compare o rumo até a prefeitura com o azimute.',
    'Com feixe de 2°, 4° de erro já são 48 dB pela fórmula, e o modelo para nos 40. Volte a antena exatamente para o rumo.',
    'Ajuste a antena do feixe-predio para 270°. As respostas são 3 dB e 5 mm.',
  ],
  perguntas: p47,
  montar: () => {
    const m = novoMundo(147);
    adicionar(m, radio('feixe-pref', 'Terminal de feixe no telhado da prefeitura (no simulador: rádio de 60 GHz, antena de 38 dBi, feixe de 2°)', { ganho: 38, azimute: 90, azimuteCerto: 90, altura: 22, feixe: 2 }, 90, 25));
    adicionar(m, radio('feixe-predio', 'Terminal de feixe no telhado do prédio vizinho, ao lado do compressor (no simulador: rádio de 60 GHz, 38 dBi, feixe de 2°)', { ganho: 38, azimute: 274, azimuteCerto: 270, altura: 25, feixe: 2 }, 270, 25));
    ligar(m, { equip: 'feixe-pref', porta: 'ar' }, { equip: 'feixe-predio', porta: 'ar' }, 'radio', 400, { id: 'c1', radio: { distanciaKm: 0.4, freqGHz: 60, obstaculoM: 0, ptxDbm: 0 } });
    m.proxCabo = 2;
    return m;
  },
  objetivo: (m) => {
    const c = m.cabos.get('c1')!;
    const d = radioDados(m, c);
    return [item('enlace c1 associado com RSSI de -65 dBm ou melhor', avaliar(m, c).up && d.rssi >= -65, `${d.rssi.toFixed(1)} dBm`), ...todasRespondidas(m, p47)];
  },
  posMorte: [
    'A vibração do compressor deixou o terminal do prédio 4° fora do rumo. Com um feixe de 2°, isso passa do teto de 40 dB do modelo, e o RSSI foi para uns -84 dBm, abaixo dos -80 em que o rádio desiste. De volta a 270°, o RSSI subiu para perto de -44 dBm.',
    'Repare na sensibilidade: 1° de erro custa 3 dB, 2° custam 12 dB, 3° custam 27 dB. Num laser de verdade o feixe é ainda mais fino. A solução séria é tirar o suporte de perto do compressor, ou usar um terminal que se realinha sozinho.',
    'E guarde a diferença que o simulador não mostra: na manhã de neblina em Fim de Linha, um enlace a laser pode cair inteiro, enquanto o de 60 GHz mal sente. No temporal de verão, é o contrário.',
  ],
  passos: [
    passo({ alvo: ['equip', 'feixe-predio'], acao: 'mostra', instrucao: 'No terminal do prédio vizinho, veja o enlace.', porque: 'Feixe estreito não perdoa. Compare o rumo até a prefeitura com o azimute para onde ele está apontado.', feito: 'Rumo para a prefeitura: 270°. Apontado para 274°. Só 4° de erro, e o rádio já nem associa.' }),
    passo({
      alvo: ['equip', 'feixe-predio'],
      acao: 'antena',
      pedir: ['azimute'],
      valores: { altura: '25' },
      exemplo: { azimute: '270' },
      instrucao: 'Realinhe o terminal do prédio com o rumo da prefeitura.',
      porque: 'Com um feixe de 2°, é preciso acertar o rumo quase exato: cada grau de erro cobra caro, e o custo cresce com o quadrado do erro.',
      conferir: rssiOk('c1', -65, 'O rumo até a prefeitura é 270°.'),
      feito: 'RSSI perto de -44 dBm, associado a 300 Mb/s. Acertou o rumo, o feixe voltou para dentro do receptor.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: '3' }, instrucao: 'Se a vibração voltar e tirar o terminal 1° do rumo, quantos dB o enlace perde?', porque: 'Use a fórmula do modelo: 12 × (erro ÷ feixe)². Aqui o erro é 1° e o feixe é 2°.', feito: '3 dB, metade da potência, por um grau. Com 2° seriam 12 dB, com 3°, 27 dB. É por isso que suporte de feixe fica longe de máquina.' }),
    passo({
      escolha: {
        opcoes: ['Neblina', 'Vento fraco', 'Sol a pino num dia limpo', 'Noite sem lua'],
        certa: 0,
        errada: {
          1: 'Vento fraco balança pouco o prédio. Incomoda, mas não é o que mais derruba um laser.',
          2: 'O sol forte faz o ar ondular sobre o telhado e entorta o feixe um pouco, mas raramente derruba o enlace.',
          3: 'O laser não precisa de luz ambiente. À noite, aliás, o receptor sofre menos com o brilho do sol.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se o enlace fosse um laser de verdade, qual destas condições mais o derrubaria?',
      porque: 'Pense no tamanho das gotículas de água em suspensão comparado com o comprimento de onda da luz.',
      feito: 'Neblina. As gotículas têm o tamanho do comprimento de onda da luz e espalham o feixe para todo lado. Para 60 GHz, quem castiga é a chuva forte.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque infravermelho não atravessa parede, e o alcance é de poucos metros',
          'Porque cada controle tem uma faixa licenciada exclusiva',
          'Porque infravermelho anda mais devagar que a luz visível',
          'Porque o controle usa espectro espalhado com código de chips',
        ],
        certa: 0,
        errada: {
          1: 'Infravermelho não precisa de licença nenhuma, e todos os controles usam praticamente a mesma faixa.',
          2: 'Toda onda eletromagnética anda à velocidade da luz no ar. O infravermelho só tem frequência mais baixa que o visível.',
          3: 'O controle só pisca um LED num padrão simples. Quem o isola do vizinho é a parede.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que o controle remoto da sala do prefeito não muda o canal da TV da sala ao lado?',
      porque: 'O infravermelho é luz, só que invisível. Pense no que a luz faz quando encontra uma parede.',
      feito: 'A parede bloqueia, e o alcance é curto. O que seria defeito numa rede vira isolamento de graça entre salas.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: '5' }, instrucao: 'Qual o comprimento de onda de 60 GHz, em milímetros?', porque: 'λ = c ÷ f = 3 × 10⁸ ÷ 6 × 10¹⁰, em metros. Converta para milímetros.', feito: '5 mm: onda milimétrica. A luz do laser fica perto de 1 µm, umas cinco mil vezes menor ainda.' }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Luz é onda, e onda carrega bits',
        texto: ['Infravermelho e luz visível ficam centenas de vezes acima das micro-ondas no espectro. Muita banda, alcance curto, e nenhuma parede atravessada.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Meio', 'Alcance', 'Atravessa parede?', 'Licença', 'O que derruba'],
          linhas: [
            ['infravermelho (controle remoto)', 'poucos metros', 'não', 'não precisa', 'qualquer coisa no caminho'],
            ['laser no espaço livre', 'centenas de metros a poucos km', 'não', 'não precisa', 'neblina, vibração, desalinhamento'],
            ['rádio de 60 GHz', 'centenas de metros', 'quase nada', 'não precisa', 'chuva forte, desalinhamento'],
            ['rádio de 5,8 GHz', 'dezenas de km', 'mal', 'não precisa', 'obstáculo na zona de Fresnel'],
          ],
        },
      },
      {
        titulo: 'Telhado a telhado',
        texto: ['O feixe vai em linha reta da prefeitura ao prédio vizinho. O que balança o suporte balança o feixe, e o receptor do outro lado é um alvo pequeno.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'p', rotulo: 'telhado da prefeitura', x: 90, y: 110 },
            { id: 'v', rotulo: 'telhado do prédio vizinho', x: 510, y: 110 },
            { id: 'n', rotulo: 'neblina e chuva', x: 300, y: 30 },
            { id: 'c', rotulo: 'compressor vibrando', x: 510, y: 200 },
          ],
          ligacoes: [
            ['p', 'v', 'feixe de 400 m'],
            ['n', 'p', 'espalha o feixe'],
            ['c', 'v', 'desalinha'],
          ],
        },
      },
      {
        titulo: 'O custo de errar o rumo',
        texto: ['No modelo do simulador, a perda por desalinhamento é 12 × (erro ÷ feixe)² dB, até 40 dB. Com feixe de 2°, o erro dói muito mais que com o feixe de 9° de um rádio de 5,8 GHz.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Erro de rumo', 'Feixe de 9° (5,8 GHz)', 'Feixe de 2° (60 GHz)'],
          linhas: [
            ['1°', '0,1 dB', '3 dB'],
            ['2°', '0,6 dB', '12 dB'],
            ['3°', '1,3 dB', '27 dB'],
            ['4°', '2,4 dB', '40 dB (teto)'],
          ],
        },
      },
      {
        titulo: 'Curto alcance, sem desculpa',
        texto: ['A 60 GHz o espaço livre cobra caro: em 400 m já são 120 dB, quase o mesmo que 5 km a 5,8 GHz. Teste na calculadora com 0,4 km e 60 GHz, depois com 2 km.'],
        visual: { tipo: 'calculadora', formula: 'fspl' },
      },
    ],
    checagem: {
      pergunta: 'A cooperativa quer ligar dois galpões a 300 m, em uma região com neblina quase toda manhã de inverno. Entre um laser no espaço livre e um rádio de 60 GHz, qual é mais seguro, e por quê?',
      opcoes: [
        'O rádio de 60 GHz, porque a neblina espalha muito mais a luz que a onda milimétrica',
        'O laser, porque luz atravessa neblina melhor que rádio',
        'Tanto faz, os dois usam feixe estreito',
        'Nenhum dos dois: 300 m é longe demais para luz e para 60 GHz',
      ],
      certa: 0,
      explicacao: 'As gotículas de neblina têm tamanho parecido com o comprimento de onda da luz e a espalham. A onda de 5 mm passa por elas quase sem notar; quem a castiga é a chuva forte.',
    },
  },
  desafio: {
    carta: [
      'Segundo feixe: do hospital ao prédio vizinho, 800 m, de novo simulado como rádio de 60 GHz com feixe de 2°. No meio do caminho, a caixa d\'água nova da cooperativa, com 12 m de altura.',
      'O terminal do hospital foi montado num mastro de 11 m e apontado "de olho". Erraram as duas coisas.',
      'Objetivo: RSSI de -65 dBm ou melhor no enlace c1, e a pergunta respondida.',
    ],
    dicas: [
      'Veja o enlace no terminal do hospital: confira o rumo e se a zona de Fresnel está livre.',
      'Dois problemas: o azimute e a altura. Com 1 m de raio de Fresnel, o feixe precisa passar 0,6 m acima da caixa d\'água.',
      'Antena do feixe-hosp em 135° e 13 m de altura. A resposta é 0,6.',
    ],
    perguntas: d47,
    montar: () => {
      const m = novoMundo(1547);
      adicionar(m, radio('feixe-hosp', 'Terminal de feixe no hospital (no simulador: rádio de 60 GHz, 38 dBi, feixe de 2°), mastro de até 20 m', { ganho: 38, azimute: 139, azimuteCerto: 135, altura: 11, feixe: 2 }, 135, 20));
      adicionar(m, radio('feixe-vizinho', 'Terminal de feixe no prédio vizinho (no simulador: rádio de 60 GHz, 38 dBi, feixe de 2°)', { ganho: 38, azimute: 315, azimuteCerto: 315, altura: 16, feixe: 2 }, 315, 20));
      ligar(m, { equip: 'feixe-hosp', porta: 'ar' }, { equip: 'feixe-vizinho', porta: 'ar' }, 'radio', 800, { id: 'c1', radio: { distanciaKm: 0.8, freqGHz: 60, obstaculoM: 12, ptxDbm: -10 } });
      m.proxCabo = 2;
      return m;
    },
    objetivo: (m) => {
      const d = radioDados(m, m.cabos.get('c1')!);
      return [item('RSSI de -65 dBm ou melhor no enlace c1', d.rssi >= -65, `${d.rssi.toFixed(1)} dBm`), ...todasRespondidas(m, d47)];
    },
    solucao: [
      ['equip', 'feixe-hosp', 'mostra'],
      ['equip', 'feixe-hosp', 'antena', { azimute: '135', altura: '13' }],
      ['cabo', 'c1', 'detalhes'],
    ],
    respostas: { '1': '0,6' },
  },
};

export const ATO1B: Dia[] = [dia45, dia46, dia47];
