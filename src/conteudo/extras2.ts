// Aula e desafio dos dias do ato 2 (A Linha), por número original do dia.

import type { ConfigArq, Linha, ResultadoArq } from '../motor/arq';
import { encherBits, escaparBytes, hammingDecodificar, hex, restoCrc, type ConfigEnlace, type ErroLinha, type ResultadoEnlace } from '../motor/enlace';
import { adicionar, aparelho, ligar, novoMundo, type Mundo } from '../motor/mundo';
import { item, numerica, respondida } from './comum';
import type { Extra } from './extras';
import type { Pergunta } from './tipos';

/* ---------- ajudantes (cópia dos de ato2.ts) ---------- */

function cargas(n: number, tamanho: number, semente: number, especiais: Record<number, number[]> = {}): number[][] {
  const out: number[][] = [];
  let x = semente;
  for (let i = 0; i < n; i++) {
    const q: number[] = [];
    for (let j = 0; j < tamanho; j++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      let b = (x >> 16) & 0xff;
      if (b === 0x7e || b === 0x7d) b = 0x55;
      q.push(b);
    }
    const esp = especiais[i];
    if (esp) q.splice(3, esp.length, ...esp);
    out.push(q);
  }
  return out;
}

function par(m: Mundo, modelo: string, meio: 'radio' | 'satelite', s: Record<string, unknown>) {
  const fisica = meio === 'satelite' ? 'sat' : 'antena';
  const a = adicionar(m, aparelho('ctl-a', 'enlace', modelo, [{ nome: 'linha', fisica }], s));
  const b = adicionar(m, aparelho('ctl-b', 'enlace', modelo, [{ nome: 'linha', fisica }], {}));
  if (meio === 'radio') {
    for (const e of [a, b]) e.antena = { ganho: 23, azimute: 0, azimuteCerto: 0, altura: 20, feixe: 9 };
    ligar(m, { equip: a.nome, porta: 'linha' }, { equip: b.nome, porta: 'linha' }, 'radio', 12000, { id: 'c1', radio: { distanciaKm: 0.05, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
  } else ligar(m, { equip: a.nome, porta: 'linha' }, { equip: b.nome, porta: 'linha' }, 'satelite', 0, { id: 'c1', sat: { orbita: 'geo' } });
  m.proxCabo = 2;
  return a;
}

const cfg = (c: Partial<ConfigEnlace>): ConfigEnlace => ({ enquadramento: 'flags', enchimento: true, deteccao: 'crc32', correcao: 'nenhuma', ...c });
const arq = (c: Partial<ConfigArq>): ConfigArq => ({ protocolo: 'pare-e-espere', janela: 1, bitsSeq: 1, timeoutMs: 1000, ...c });

const ctl = (m: Mundo) => m.equipamentos.get('ctl-a')!.s;
const ultimoEnlace = (m: Mundo) => m.flags.ultimoEnlace as ResultadoEnlace | undefined;
const ultimoArq = (m: Mundo) => m.flags.ultimoArq as ResultadoArq | undefined;

/** A última transmissão foi feita com a configuração que está no controlador agora. */
const transmitiuAgora = (m: Mundo) => !!ultimoEnlace(m) && m.flags.cfgDoUltimo === JSON.stringify(ctl(m).cfg);
/** A última transferência foi feita com a configuração que está no controlador agora. */
const transferiuAgora = (m: Mundo) => !!ultimoArq(m) && m.flags.arqDoUltimo === JSON.stringify(ctl(m).arq);

const certos = (r?: ResultadoEnlace) => (r ? `${r.corretos} de ${r.enviados} certos` : 'ainda não transmitiu');

const normHex = (s: string) => s.toUpperCase().replace(/0X/g, '').replace(/[^0-9A-F]/g, '');
const soBits = (s: string) => s.replace(/[^01]/g, '');

/* ---------- perguntas dos desafios ---------- */

const p20: Pergunta[] = [{ id: '1', texto: 'Como ficam os bytes 7D 7E 10 7E depois do escape de bytes?', confere: (r) => normHex(r) === normHex(hex(escaparBytes([0x7d, 0x7e, 0x10, 0x7e]))) }];
const p21: Pergunta[] = [{ id: '1', texto: 'Como fica 11111111111 (onze uns) depois do enchimento de bits?', confere: (r) => soBits(r) === encherBits('11111111111') }];
const p22: Pergunta[] = [numerica('1', 'Qual o bit de paridade par para 1110110?', 1, 0)];
const PALAVRA23 = '0110001';
const p23: Pergunta[] = [
  numerica('1', 'No Hamming, quantos bits de verificação são precisos para 8 bits de dados?', 4, 0),
  numerica('2', `Chegou a palavra ${PALAVRA23} (posições 1 a 7). Em que posição está o bit errado?`, hammingDecodificar(PALAVRA23.split('').map(Number)).corrigido, 0),
];
const p24: Pergunta[] = [{ id: '1', texto: 'Divida 1101011 por 10011 (x⁴ + x + 1) em módulo 2. Qual é o resto (4 bits)?', confere: (r) => soBits(r) === restoCrc('1101011', '10011') }];
const p25: Pergunta[] = [
  numerica('1', 'Quanto tempo leva a ida e volta: transmitir o quadro de 500 bytes a 2 Mb/s mais 250 ms para ir e 250 ms para o ACK voltar? (em ms)', 502, 1),
  numerica('2', 'Que porcentagem do tempo a linha fica transmitindo no pare e espere? (2 ms de 502 ms)', (2 / 502) * 100, 0.02),
];
const p26: Pergunta[] = [numerica('1', 'Com 1 bit de sequência, que número leva o quinto quadro, se o primeiro é o 0?', 0, 0)];
const p27: Pergunta[] = [
  numerica('1', 'Quantos quadros precisam estar a caminho para a linha nunca parar? (1000 bytes a 512 kb/s, propagação de 270 ms)', 36, 0),
  numerica('2', 'No go-back-N, quantos bits de sequência, no mínimo, para essa janela?', 6, 0),
];
const p28: Pergunta[] = [numerica('1', 'Com 4 bits de sequência, qual a maior janela segura no go-back-N?', 15, 0)];
const p29: Pergunta[] = [numerica('1', 'Com 3 bits de sequência, qual a maior janela segura na retransmissão seletiva?', 4, 0)];
const p30: Pergunta[] = [numerica('1', 'Depois do LCP, com quantos bytes de MRU o enlace ficou?', 1492, 0)];

const LINHA25: Linha = { taxaBps: 2_000_000, propagacaoMs: 250, bytesQuadro: 500 };
const LINHA27: Linha = { taxaBps: 512_000, propagacaoMs: 270, bytesQuadro: 1000 };
const LINHA29: Linha = { taxaBps: 128_000, propagacaoMs: 30, bytesQuadro: 500, perdaDados: 0.15 };

export const EXTRAS2: Record<number, Extra> = {
  /* ---------- 19: contagem x flags ---------- */
  19: {
    aula: {
      cartoes: [
        {
          titulo: 'Um rio de bits',
          texto: [
            'A camada física só entrega bits, um atrás do outro, sem pausa. Para a estação de bombeamento de Fim de Linha, é como receber um livro sem pontos, sem parágrafos e sem capítulos.',
            'A camada de enlace corta esse rio em pedaços chamados quadros. Cada quadro é conferido, confirmado e, se preciso, mandado de novo. Mas antes o receptor precisa saber onde cada um começa.',
          ],
          visual: { tipo: 'camadas', camadas: ['Rede', 'Enlace (quadros)', 'Física (bits)'], rotulo: 'O enquadramento mora no enlace' },
        },
        {
          titulo: 'Contagem: o quadro diz o próprio tamanho',
          texto: [
            'No enquadramento por contagem, o quadro começa com um número: "tenho 320 bits". O receptor lê o número, conta 320 bits e sabe que o próximo quadro começa ali.',
            'É simples e não gasta nada além do campo de tamanho. Até o dia em que um bit erra justamente nesse campo.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Quadro', 'Tamanho anunciado', 'O que o receptor faz'],
            linhas: [
              ['1', '320', 'conta 320 bits, certo'],
              ['2', '320 virou 384', 'conta 384: invade o quadro 3'],
              ['3 em diante', '?', 'lê lixo como tamanho, para sempre'],
            ],
          },
        },
        {
          titulo: 'Flags: uma marca fixa nas pontas',
          texto: [
            'No enquadramento por flags, um byte especial, 0x7E, abre e fecha cada quadro. O receptor não precisa confiar em conta nenhuma: procura o próximo 0x7E.',
            'Se um erro estraga um quadro, o CRC descarta aquele quadro, e o próximo 0x7E põe tudo de volta no compasso. O estrago fica preso num quadro só.',
          ],
          visual: { tipo: 'bits', antes: '[320] dados [320] dados [320] dados', depois: '7E dados 7E 7E dados 7E 7E dados 7E', legenda: 'Contagem em cima, flags embaixo' },
        },
        {
          titulo: 'Perder o compasso custa caro',
          texto: [
            'Com contagem, um único bit errado no cabeçalho pode levar todos os quadros seguintes. Com flags, leva um. Por isso a contagem pura quase não aparece sozinha nos enlaces de verdade.',
            'Quando o quadro estragado é só um, a retransmissão resolve. Quando o receptor perdeu o compasso, nem há o que pedir de novo.',
          ],
        },
      ],
      checagem: {
        pergunta: 'Um bit erra no campo de tamanho do terceiro de dez quadros enquadrados por contagem. O que acontece?',
        opcoes: ['Só o terceiro quadro se perde.', 'O receptor perde o compasso e os quadros seguintes também se perdem.', 'Nada: o CRC corrige o tamanho.', 'O receptor pede o tamanho de novo.'],
        certa: 1,
        explicacao: 'O receptor usa o tamanho para achar o começo do próximo quadro. Tamanho errado, começo errado, e daí em diante ele lê lixo como se fosse cabeçalho. O CRC detecta, mas não devolve o compasso.',
      },
    },
    desafio: {
      carta: [
        'O painel da escola municipal recebe a merenda do dia por um enlace de rádio, enquadrado por contagem. Desde a última tempestade, o cardápio para no segundo quadro e o resto vira sopa de letrinhas.',
        'Objetivo: um erro na linha estragar só o quadro atingido, com 11 dos 12 quadros de teste chegando certos.',
      ],
      dicas: ['Transmita e veja a partir de qual quadro tudo se perde.', 'O erro cai no cabeçalho de um quadro, e a contagem não se recupera.', 'Troque o enquadramento para flags e transmita de novo.'],
      montar: () => {
        const m = novoMundo(1919);
        par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ enquadramento: 'contagem' }) });
        m.flags.cargas = cargas(12, 30, 1919);
        m.flags.erros = [{ quadro: 1, bits: [9], noCabecalho: true }] satisfies ErroLinha[];
        return m;
      },
      objetivo: (m) => {
        const r = ultimoEnlace(m);
        const enq = ctl(m).cfg.enquadramento;
        return [item('enquadramento que se recupera de erro (flags)', enq !== 'contagem', enq), item('11 de 12 certos e nenhum errado', transmitiuAgora(m) && !!r && r.corretos >= 11 && r.corrompidos === 0, certos(r))];
      },
      solucao: [
        ['equip', 'ctl-a', 'enquadramento', { v: 'flags' }],
        ['equip', 'ctl-a', 'transmitir'],
      ],
    },
  },

  /* ---------- 20: escape de bytes ---------- */
  20: {
    aula: {
      cartoes: [
        {
          titulo: 'Quando o dado parece flag',
          texto: [
            'Se 0x7E quer dizer "acabou o quadro", o que acontece quando a planilha da conta de água tem um byte 0x7E no meio? O receptor corta o quadro ali, e o resto vira um pedaço sem pé nem cabeça.',
            'O dado pode ter qualquer byte. Quem precisa se adaptar é o enquadramento.',
          ],
          visual: { tipo: 'bits', antes: '7E 41 7E 42 7E', depois: '7E 41 | 7E | 42 7E', legenda: 'Sem escape, o 7E do dado vira fim de quadro' },
        },
        {
          titulo: 'O byte de escape',
          texto: [
            'O transmissor troca todo 0x7E do dado por dois bytes: 0x7D 0x5E. E, como agora o 0x7D também é especial, todo 0x7D do dado vira 0x7D 0x5D.',
            'O segundo byte é o original com o bit 5 invertido, ou seja, XOR com 0x20. 7E XOR 20 dá 5E; 7D XOR 20 dá 5D.',
          ],
          visual: { tipo: 'bits', antes: '41 7E 42 7D', depois: '41 7D 5E 42 7D 5D', legenda: 'Escape de bytes, como no PPP' },
        },
        {
          titulo: 'O receptor desfaz',
          texto: [
            'Do outro lado, viu 0x7D: joga fora e inverte o bit 5 do byte seguinte. Pronto, o dado volta a ser o original.',
            'Com isso, um 0x7E no fio é sempre uma flag de verdade. Nunca mais um quadro picado no meio.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['No dado', 'No fio', 'Volta como'],
            linhas: [
              ['7E', '7D 5E', '7E'],
              ['7D', '7D 5D', '7D'],
              ['qualquer outro', 'igual', 'igual'],
            ],
          },
        },
        {
          titulo: 'O preço varia',
          texto: [
            'Cada 7E ou 7D no dado custa um byte a mais. Num texto comum, quase nada. Num arquivo cheio de 7E, o quadro pode quase dobrar de tamanho.',
            'Por isso enlaces síncronos rápidos preferem fazer o mesmo truque no nível do bit, com custo previsível. É o assunto do próximo dia.',
          ],
        },
      ],
      checagem: {
        pergunta: 'Com escape de bytes, como viaja o dado 7D 41?',
        opcoes: ['7D 41', '7D 5D 41', '7D 5E 41', '7E 7D 41'],
        certa: 1,
        explicacao: 'O próprio byte de escape, 7D, também precisa de escape: vira 7D 5D (7D XOR 20 = 5D). O 41 não muda.',
      },
    },
    desafio: {
      carta: [
        'A secretaria da escola manda os boletins por um enlace com flags, mas com o escape de bytes desligado "para economizar". Os boletins de quem tirou certas notas chegam pela metade.',
        'Objetivo: todos os quadros de teste chegando certos e responder a pergunta do chamado.',
      ],
      dicas: ['Veja um quadro no analisador e procure 7E no meio do dado.', 'O dado tem bytes iguais à flag.', 'Ligue o escape de bytes e transmita de novo.'],
      perguntas: p20,
      respostas: { '1': '7D 5D 7D 5E 10 7D 5E' },
      montar: () => {
        const m = novoMundo(2020);
        par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ enchimento: false }) });
        m.flags.cargas = cargas(10, 28, 2020, { 1: [0x7d, 0x7e, 0x10, 0x7e], 4: [0x7e, 0x7e], 8: [0x30, 0x7e] });
        m.flags.quadroAmostra = 1;
        m.flags.erros = [];
        return m;
      },
      objetivo: (m) => {
        const r = ultimoEnlace(m);
        return [item('escape de bytes ligado', ctl(m).cfg.enchimento), item('todos os quadros chegando certos', transmitiuAgora(m) && ctl(m).cfg.enchimento && r?.corretos === r?.enviados, certos(r)), respondida(m, p20[0]!)];
      },
      solucao: [
        ['equip', 'ctl-a', 'enchimento', { v: 'sim' }],
        ['equip', 'ctl-a', 'transmitir'],
      ],
    },
  },

  /* ---------- 21: enchimento de bits ---------- */
  21: {
    aula: {
      cartoes: [
        {
          titulo: 'A flag de bits',
          texto: [
            'Protocolos orientados a bit, como o HDLC, marcam começo e fim com o padrão 01111110: um zero, seis uns e um zero.',
            'O problema é o mesmo do escape: se o dado tiver seis uns seguidos, o receptor acha que o quadro acabou. A fibra da prefeitura de Fim de Linha descobriu isso do pior jeito.',
          ],
          visual: { tipo: 'bits', antes: '01111110', depois: '01111110', legenda: 'A flag: seis uns entre dois zeros' },
        },
        {
          titulo: 'Cinco uns, um zero',
          texto: [
            'A regra do transmissor: depois de cinco 1 seguidos, enfia um 0, venha o que vier. Depois do zero enfiado, a contagem recomeça.',
            'Assim nunca saem seis uns seguidos no meio do dado. Seis uns só existem na flag.',
          ],
          visual: { tipo: 'bits', antes: '01111110', depois: '011111010', legenda: 'O zero extra entra depois do quinto 1' },
        },
        {
          titulo: 'O receptor tira o zero',
          texto: [
            'Do outro lado, o receptor conta os uns. Depois de cinco, se vier um 0, ele sabe que foi enfiado e joga fora. Se vier um sexto 1, é flag.',
            'O zero é enfiado mesmo quando o próximo bit já seria 0. A regra não olha para a frente, e é isso que a deixa simples.',
          ],
          visual: { tipo: 'bits', antes: '1111111111', depois: '111110111110', legenda: 'Dez uns viajam com dois zeros enfiados' },
        },
        {
          titulo: 'Custo pequeno e previsível',
          texto: ['No pior caso, um dado só de uns, o enchimento põe 1 bit a cada 5: 20 % a mais. Num dado comum, quase nada.', 'Compare com o escape de bytes, que no pior caso dobra o quadro. É por isso que enlaces síncronos rápidos preferem bits.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Técnica', 'Trabalha com', 'Pior caso'],
            linhas: [
              ['escape de bytes', 'bytes (7E, 7D)', '+100 %'],
              ['enchimento de bits', 'bits (cinco uns)', '+20 %'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'Como fica 0111110 depois do enchimento de bits?',
        opcoes: ['0111110', '01111100', '011111010', '0111101'],
        certa: 1,
        explicacao: 'Depois do quinto 1 entra um 0, mesmo que o próximo bit já seja 0: 011111 + 0 + 0 = 01111100. O receptor tira o zero enfiado e recupera 0111110.',
      },
    },
    desafio: {
      carta: [
        'O enlace HDLC da usina solar manda as leituras dos painéis com flags de bits e o enchimento desligado. Ao meio-dia, com os painéis no máximo, as leituras viram uma sequência de uns e os quadros chegam picados.',
        'Objetivo: todos os quadros de teste chegando certos e responder a pergunta do chamado.',
      ],
      dicas: ['Veja um quadro no analisador e procure seis uns seguidos.', 'Sem enchimento, FF FF no dado parece flag.', 'Ligue o enchimento de bits e transmita de novo.'],
      perguntas: p21,
      respostas: { '1': encherBits('11111111111') },
      montar: () => {
        const m = novoMundo(2121);
        par(m, 'Controlador HDLC CH-200', 'radio', { cfg: cfg({ enquadramento: 'bits', enchimento: false }) });
        m.flags.cargas = cargas(9, 20, 2121, { 0: [0xff, 0xff], 3: [0x7e], 5: [0x3f, 0xf0], 7: [0xff] });
        m.flags.quadroAmostra = 0;
        m.flags.erros = [];
        return m;
      },
      objetivo: (m) => {
        const r = ultimoEnlace(m);
        return [item('enchimento de bits ligado', ctl(m).cfg.enchimento), item('todos os quadros chegando certos', transmitiuAgora(m) && ctl(m).cfg.enchimento && r?.corretos === r?.enviados, certos(r)), respondida(m, p21[0]!)];
      },
      solucao: [
        ['equip', 'ctl-a', 'enchimento', { v: 'sim' }],
        ['equip', 'ctl-a', 'transmitir'],
      ],
    },
  },

  /* ---------- 22: paridade x CRC ---------- */
  22: {
    aula: {
      cartoes: [
        {
          titulo: 'O bit de paridade',
          texto: [
            'Paridade par: o transmissor conta os uns do dado e acrescenta um bit que deixa o total par. 1011001 tem quatro uns: o bit é 0. 1011000 tem três: o bit é 1.',
            'O receptor refaz a conta. Se um bit mudou no caminho, o total fica ímpar e o erro aparece.',
          ],
          visual: { tipo: 'bits', antes: '1011000', depois: '1011000 1', legenda: 'Três uns: o bit de paridade é 1' },
        },
        {
          titulo: 'Dois erros se anulam',
          texto: [
            'Se dois bits mudarem, o total volta a ser par, e a paridade jura que está tudo certo. Ela só pega quantidades ímpares de erros.',
            'E ruído de rádio raramente vem sozinho: um trovão em Fim de Linha atinge vários bits seguidos, uma rajada.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Bits errados', 'Total de uns', 'Paridade percebe?'],
            linhas: [
              ['1', 'ímpar', 'sim'],
              ['2', 'par', 'não'],
              ['3', 'ímpar', 'sim'],
              ['4', 'par', 'não'],
            ],
          },
        },
        {
          titulo: 'Soma e CRC',
          texto: [
            'A soma de verificação soma o quadro em palavras de 16 bits. Pega muito mais coisa que a paridade, mas tem pontos cegos.',
            'O CRC divide o quadro por um polinômio gerador e manda o resto. O CRC-32 do Ethernet pega qualquer rajada de até 32 bits e quase tudo além disso.',
          ],
          visual: { tipo: 'camadas', camadas: ['CRC-32: rajadas de até 32 bits', 'Soma de 16 bits: quase tudo', 'Paridade: só erros ímpares'], rotulo: 'Do mais fraco (embaixo) ao mais forte' },
        },
      ],
      checagem: {
        pergunta: 'Uma rajada inverte 4 bits seguidos de um quadro protegido só por paridade par. O que acontece?',
        opcoes: ['A paridade detecta e o quadro é descartado.', 'A paridade não percebe e o quadro errado é entregue.', 'A paridade corrige os 4 bits.', 'O quadro some na linha.'],
        certa: 1,
        explicacao: 'Quatro inversões deixam o total de uns com a mesma paridade de antes. A conta fecha e o quadro errado passa. É o tipo de erro que o CRC pega.',
      },
    },
    desafio: {
      carta: [
        'O enlace do banco de sangue do hospital confere os quadros com bit de paridade. Na semana do temporal, a planilha de estoque passou a mostrar bolsas de um tipo sanguíneo que ninguém doou.',
        'Objetivo: nenhum quadro errado entregue sem ser percebido e responder a pergunta do chamado.',
      ],
      dicas: ['Transmita e conte os quadros entregues errados.', 'As rajadas atingem 2 e 4 bits: quantidade par.', 'Troque a detecção por CRC-32 e transmita de novo.'],
      perguntas: p22,
      respostas: { '1': '1' },
      montar: () => {
        const m = novoMundo(2222);
        par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ deteccao: 'paridade' }) });
        m.flags.cargas = cargas(10, 32, 2222);
        m.flags.erros = [
          { quadro: 0, bits: [8, 9, 10, 11] },
          { quadro: 3, bits: [50, 52] },
          { quadro: 4, bits: [7] },
          { quadro: 6, bits: [20, 21, 22] },
          { quadro: 8, bits: [130, 131] },
        ] satisfies ErroLinha[];
        return m;
      },
      objetivo: (m) => {
        const r = ultimoEnlace(m);
        return [
          item('detecção mais forte que paridade', ['checksum', 'crc32'].includes(ctl(m).cfg.deteccao), ctl(m).cfg.deteccao),
          item('nenhum quadro errado entregue', transmitiuAgora(m) && ['checksum', 'crc32'].includes(ctl(m).cfg.deteccao) && r?.corrompidos === 0, r ? `${r.corrompidos} errados` : 'ainda não transmitiu'),
          respondida(m, p22[0]!),
        ];
      },
      solucao: [
        ['equip', 'ctl-a', 'deteccao', { v: 'crc32' }],
        ['equip', 'ctl-a', 'transmitir'],
      ],
    },
  },

  /* ---------- 23: Hamming ---------- */
  23: {
    aula: {
      cartoes: [
        {
          titulo: 'Detectar ou corrigir',
          texto: [
            'Detectar o erro só adianta se der para pedir o quadro de novo. As boias da represa de Fim de Linha transmitem só de ida: não existe canal de volta.',
            'Nesses casos, o receptor precisa corrigir sozinho. Para isso, o transmissor manda bits a mais, que apontam onde está o erro.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Situação', 'Melhor estratégia'],
            linhas: [
              ['fibra, quase sem erro, com volta', 'detectar e retransmitir'],
              ['rádio de mão única', 'corrigir no receptor'],
              ['transmissão ao vivo', 'corrigir no receptor'],
            ],
          },
        },
        {
          titulo: 'Bits de verificação nas potências de 2',
          texto: [
            'No código de Hamming, os bits de verificação ficam nas posições 1, 2, 4, 8... e os dados nas outras. Cada verificação confere um grupo de posições.',
            'Com m bits de dados, são precisos r bits de verificação, com 2^r maior ou igual a m + r + 1. Para 4 bits de dados, r = 3: Hamming (7,4).',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Verificação', 'Confere as posições', 'Vale'],
            linhas: [
              ['bit 1', '1, 3, 5, 7', '1'],
              ['bit 2', '2, 3, 6, 7', '2'],
              ['bit 4', '4, 5, 6, 7', '4'],
            ],
          },
        },
        {
          titulo: 'A síndrome aponta o culpado',
          texto: [
            'O receptor refaz as três conferências. Cada grupo deveria ter um número par de uns. Some os valores dos grupos que falharam: o resultado é a posição do bit errado.',
            'Exemplo: 1011 viaja como 0110011. Se chegar 0110001, falham os grupos de valor 2 e 4: o erro está na posição 6. Basta inverter o bit.',
          ],
          visual: { tipo: 'bits', antes: '0110001', depois: '0110011', legenda: 'Grupos 2 e 4 falharam: posição 6 corrigida' },
        },
        {
          titulo: 'O preço da correção',
          texto: ['Hamming (7,4) manda 7 bits para cada 4 de dado: 75 % a mais, sempre, com ou sem erro. E corrige só um erro por palavra.', 'Detecção custa pouco e só cobra retransmissão quando há erro. Correção cobra banda o tempo todo. Escolha conforme a linha.'],
        },
      ],
      checagem: {
        pergunta: 'Num Hamming (7,4), falharam as conferências de valor 1 e 2. Onde está o erro?',
        opcoes: ['Na posição 1', 'Na posição 2', 'Na posição 3', 'Em dois bits ao mesmo tempo'],
        certa: 2,
        explicacao: 'A síndrome é a soma dos valores dos grupos que falharam: 1 + 2 = 3. A posição 3 é a única que pertence aos grupos 1 e 2 e não ao grupo 4.',
      },
    },
    desafio: {
      carta: [
        'A estação meteorológica no alto do morro manda vento e chuva por um rádio que só transmite. O CRC descarta os quadros com erro, e a previsão do tempo da rádio comunitária virou chute.',
        'Objetivo: os quadros chegando certos mesmo com os erros da linha e responder as perguntas do chamado.',
      ],
      dicas: ['Transmita: detectar não adianta sem canal de volta.', 'Os erros são isolados, no máximo um por palavra de 7 bits.', 'Ligue a correção Hamming e transmita de novo.'],
      perguntas: p23,
      respostas: { '1': '4', '2': '6' },
      montar: () => {
        const m = novoMundo(2323);
        par(m, 'Transmissor de telemetria TM-1 (só ida)', 'radio', { cfg: cfg({ enquadramento: 'contagem' }) });
        m.flags.simplex = true;
        m.flags.cargas = cargas(5, 12, 2323);
        m.flags.erros = Array.from({ length: 5 }, (_, q) => ({ quadro: q, bits: [2, 20, 33, 50, 71, 90, 120] })) satisfies ErroLinha[];
        return m;
      },
      objetivo: (m) => {
        const r = ultimoEnlace(m);
        return [item('correção Hamming ligada', ctl(m).cfg.correcao === 'hamming'), item('todos os quadros chegando certos', transmitiuAgora(m) && ctl(m).cfg.correcao === 'hamming' && r?.corretos === r?.enviados, certos(r)), ...p23.map((p) => respondida(m, p))];
      },
      solucao: [
        ['equip', 'ctl-a', 'correcao', { v: 'hamming' }],
        ['equip', 'ctl-a', 'transmitir'],
      ],
    },
  },

  /* ---------- 24: CRC ---------- */
  24: {
    aula: {
      cartoes: [
        {
          titulo: 'O ponto cego da soma',
          texto: [
            'A soma de verificação soma palavras de 16 bits. Se um bit sobe numa palavra e o bit de mesmo peso desce em outra, a soma dá igual: o erro some.',
            'No laboratório de Fim de Linha, foi assim que um exame chegou com um número trocado e ninguém percebeu.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['', 'Palavra 1', 'Palavra 2', 'Soma'],
            linhas: [
              ['enviado', '0x1234', '0x5678', '0x68AC'],
              ['recebido', '0x1634', '0x5278', '0x68AC'],
            ],
          },
        },
        {
          titulo: 'Bits como polinômio',
          texto: [
            'O CRC lê os bits como coeficientes de um polinômio. 1101 é x³ + x² + 1; 10011 é x⁴ + x + 1.',
            'O transmissor acrescenta r zeros ao dado (r é o grau do gerador), divide pelo gerador e manda o resto junto com o dado.',
          ],
          visual: { tipo: 'bits', antes: '101100', depois: '101100 111', legenda: 'Dado e resto da divisão por 1101' },
        },
        {
          titulo: 'Divisão em módulo 2 é XOR',
          texto: [
            'Não tem "vai um" nem "empresta". Alinhe o gerador embaixo do primeiro 1, faça XOR, desça para o próximo 1 e repita. Os r bits que sobrarem no fim são o resto.',
            'Exemplo: 101100 com três zeros, 101100000, dividido por 1101, deixa resto 111.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Passo', 'Bits'],
            linhas: [
              ['dado com zeros', '101100000'],
              ['XOR 1101', '011000000'],
              ['XOR 1101', '000010000'],
              ['XOR 1101', '000001010'],
              ['XOR 1101', '000000111: resto 111'],
            ],
          },
        },
        {
          titulo: 'Resto zero, quadro limpo',
          texto: ['O receptor divide o quadro inteiro, dado e resto, pelo mesmo gerador. Se der zero, chegou certo. Se sobrar qualquer coisa, descarta.', 'O CRC-32 do Ethernet usa um gerador de grau 32 e pega erros que se anulariam numa soma.'],
        },
      ],
      checagem: {
        pergunta: 'Com gerador 10011 (grau 4), quantos zeros o transmissor acrescenta antes de dividir?',
        opcoes: ['3', '4', '5', 'Depende do tamanho do dado'],
        certa: 1,
        explicacao: 'O número de zeros é o grau do gerador, que tem 5 bits e grau 4. O resto também terá 4 bits.',
      },
    },
    desafio: {
      carta: [
        'O enlace da cooperativa leiteira usa soma de verificação de 16 bits. Na pesagem de ontem, o tanque de um produtor apareceu com litros que saíram do tanque de outro, e a soma não acusou nada.',
        'Objetivo: nenhum quadro errado entregue sem ser percebido e responder a pergunta do chamado.',
      ],
      dicas: ['Transmita: a soma deixa passar alguns quadros.', 'Um bit sobe numa palavra e o mesmo bit desce em outra.', 'Troque a detecção por CRC-32 e transmita de novo.'],
      perguntas: p24,
      respostas: { '1': restoCrc('1101011', '10011') },
      montar: () => {
        const m = novoMundo(2424);
        par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ deteccao: 'checksum' }) });
        const base = cargas(8, 32, 2424);
        for (const q of base) q.splice(0, 4, 0x21, 0x07, 0x4c, 0x98);
        m.flags.cargas = base;
        m.flags.erros = [
          { quadro: 1, bits: [1, 17] },
          { quadro: 4, bits: [12, 28] },
          { quadro: 6, bits: [1, 17] },
        ] satisfies ErroLinha[];
        return m;
      },
      objetivo: (m) => {
        const r = ultimoEnlace(m);
        return [item('detecção por CRC-32', ctl(m).cfg.deteccao === 'crc32'), item('nenhum quadro errado entregue', transmitiuAgora(m) && ctl(m).cfg.deteccao === 'crc32' && r?.corrompidos === 0, r ? `${r.corrompidos} errados` : 'ainda não transmitiu'), respondida(m, p24[0]!)];
      },
      solucao: [
        ['equip', 'ctl-a', 'deteccao', { v: 'crc32' }],
        ['equip', 'ctl-a', 'transmitir'],
      ],
    },
  },

  /* ---------- 25: pare e espere e timeout ---------- */
  25: {
    aula: {
      cartoes: [
        {
          titulo: 'Manda um, espera a resposta',
          texto: [
            'No pare e espere, o transmissor manda um quadro e fica parado até chegar a confirmação, o ACK. Só então manda o próximo.',
            'Se o ACK não chegar dentro do timeout, ele conclui que algo se perdeu e manda de novo.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'a', rotulo: 'Transmissor', x: 80, y: 120 },
              { id: 's', rotulo: 'Satélite', x: 300, y: 30 },
              { id: 'b', rotulo: 'Receptor', x: 520, y: 120 },
            ],
            ligacoes: [
              ['a', 's', 'quadro'],
              ['s', 'b', 'quadro'],
              ['b', 'a', 'ACK'],
            ],
          },
        },
        {
          titulo: 'Quanto demora a ida e volta',
          texto: [
            'Tempo de transmissão: tamanho em bits dividido pela taxa. 1000 bytes a 1 Mb/s: 8000 ÷ 1.000.000 = 8 ms.',
            'Pelo satélite, o sinal leva uns 270 ms para ir e outros 270 ms para o ACK voltar. Ida e volta: 8 + 270 + 270 = 548 ms.',
          ],
          visual: { tipo: 'calculadora', formula: 'transmissao' },
        },
        {
          titulo: 'Timeout curto demais',
          texto: [
            'Se o timeout for menor que a ida e volta, o transmissor desiste antes de a resposta ter tido tempo de chegar e manda tudo duas vezes. A linha não tem erro nenhum e o contador de retransmissões sobe sem parar.',
            'Regra: timeout maior que a ida e volta, com uma folga para variações.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Timeout', 'Ida e volta', 'Resultado'],
            linhas: [
              ['300 ms', '548 ms', 'todo quadro vai duas vezes'],
              ['700 ms', '548 ms', 'cada quadro vai uma vez'],
            ],
          },
        },
        {
          titulo: 'Aproveitamento',
          texto: ['Aproveitamento é o tempo transmitindo dividido pelo tempo de cada ciclo: Tf ÷ (Tf + 2 Tp). No satélite, 8 ÷ 548, uns 1,5 %.', 'A linha passa quase o tempo todo calada, esperando ACK. O remédio para isso vem no dia da janela deslizante.'],
        },
      ],
      checagem: {
        pergunta: 'Um quadro leva 4 ms para ser transmitido e a propagação é de 100 ms em cada sentido. Qual timeout evita retransmissão à toa?',
        opcoes: ['50 ms', '104 ms', '150 ms', '250 ms'],
        certa: 3,
        explicacao: 'A ida e volta é 4 + 100 + 100 = 204 ms. Só um timeout acima disso, como 250 ms, dá tempo de o ACK chegar.',
      },
    },
    desafio: {
      carta: [
        'O posto da reserva florestal manda as fotos das armadilhas fotográficas pelo satélite, com pare e espere, quadros de 500 bytes a 2 Mb/s. O técnico baixou o timeout para 400 ms "para ficar mais esperto", e agora toda foto vai duas vezes.',
        'Objetivo: transferência sem nenhuma retransmissão à toa e responder as perguntas do chamado.',
      ],
      dicas: ['Transfira e veja as retransmissões à toa.', 'Calcule a ida e volta: transmissão mais 250 ms de ida e 250 ms de volta.', 'Ponha o timeout em 600 ms e transfira de novo.'],
      perguntas: p25,
      respostas: { '1': '502', '2': '0,4' },
      montar: () => {
        const m = novoMundo(2525);
        par(m, 'Controlador de satélite CS-300', 'satelite', { arq: arq({ timeoutMs: 400 }) });
        m.flags.linhaArq = LINHA25;
        m.flags.quadrosArq = 25;
        return m;
      },
      objetivo: (m) => {
        const r = ultimoArq(m);
        const t = ctl(m).arq.timeoutMs as number;
        return [item('timeout maior que a ida e volta', t > 502, `${t} ms`), item('transferência sem retransmissão à toa', transferiuAgora(m) && t > 502 && r!.concluiu && r!.desnecessarias === 0, r ? `${r.desnecessarias} à toa` : 'ainda não transferiu'), ...p25.map((p) => respondida(m, p))];
      },
      solucao: [
        ['equip', 'ctl-a', 'timeout', { ms: '600' }],
        ['equip', 'ctl-a', 'transferir'],
      ],
    },
  },

  /* ---------- 26: número de sequência ---------- */
  26: {
    aula: {
      cartoes: [
        {
          titulo: 'O ACK que se perde na volta',
          texto: [
            'O quadro chega, o receptor entrega e manda o ACK. O ACK se perde. O transmissor dá timeout e manda o mesmo quadro de novo.',
            'Para o receptor, sem nenhuma pista, é um quadro novo. Ele entrega duas vezes. No posto de saúde de Fim de Linha, foram duas caixas do mesmo remédio.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Passo', 'Transmissor', 'Receptor'],
            linhas: [
              ['1', 'manda a receita', 'entrega a receita'],
              ['2', 'ACK some no caminho', 'acha que está tudo certo'],
              ['3', 'timeout: manda de novo', 'entrega a receita outra vez'],
            ],
          },
        },
        {
          titulo: 'Numere os quadros',
          texto: [
            'Com um número de sequência, o receptor compara: se o número é o mesmo do último que ele aceitou, é repetido. Descarta e só manda o ACK de novo.',
            'No pare e espere só existe um quadro a caminho por vez, então basta distinguir "o mesmo" de "o próximo": dois números, 0 e 1, cabem em 1 bit.',
          ],
          visual: { tipo: 'bits', antes: 'Q Q Q Q Q Q', depois: '0 1 0 1 0 1', legenda: 'Bit alternado: os quadros revezam 0 e 1' },
        },
        {
          titulo: 'Protocolo de bit alternado',
          texto: ['Pare e espere com 1 bit de sequência tem nome próprio: protocolo de bit alternado. O ACK também leva o número, para o transmissor saber o que foi confirmado.', 'Repare: o número não serve para ordenar nada. Serve para reconhecer o repetido.'],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'a', rotulo: 'Transmissor', x: 90, y: 120 },
              { id: 'b', rotulo: 'Receptor', x: 510, y: 120 },
            ],
            ligacoes: [
              ['a', 'b', 'quadro 0'],
              ['b', 'a', 'ACK 0'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'No protocolo de bit alternado, chega ao receptor um quadro com o mesmo número do último aceito. O que ele faz?',
        opcoes: ['Entrega de novo, por garantia.', 'Descarta e manda o ACK de novo.', 'Descarta e não responde.', 'Pede o quadro anterior.'],
        certa: 1,
        explicacao: 'É um repetido: o ACK anterior se perdeu. O receptor descarta para não duplicar e reenvia o ACK, senão o transmissor ficaria repetindo para sempre.',
      },
    },
    desafio: {
      carta: [
        'O caixa da cooperativa de crédito manda os pagamentos para a central por rádio, com pare e espere e sem número de sequência. Dois associados reclamaram de boleto pago duas vezes no mesmo dia.',
        'Objetivo: nenhum pagamento entregue duplicado e responder a pergunta do chamado.',
      ],
      dicas: ['Transfira e veja os quadros entregues errados.', 'Alguns ACKs se perdem na volta, e o receptor não reconhece o repetido.', 'Ponha 1 bit de sequência e transfira de novo.'],
      perguntas: p26,
      respostas: { '1': '0' },
      montar: () => {
        const m = novoMundo(2626);
        par(m, 'Controlador de enlace serial CE-100', 'radio', { arq: arq({ bitsSeq: 0, timeoutMs: 40 }) });
        m.flags.linhaArq = { taxaBps: 1_000_000, propagacaoMs: 5, bytesQuadro: 250, perdasAck: [4, 7] } satisfies Linha;
        m.flags.quadrosArq = 12;
        return m;
      },
      objetivo: (m) => {
        const r = ultimoArq(m);
        const b = ctl(m).arq.bitsSeq as number;
        return [item('número de sequência ligado', b >= 1, `${b} bits`), item('nenhum pagamento duplicado', transferiuAgora(m) && b >= 1 && r!.concluiu && r!.entreguesErrados === 0, r ? `${r.entreguesErrados} errados` : 'ainda não transferiu'), respondida(m, p26[0]!)];
      },
      solucao: [
        ['equip', 'ctl-a', 'bits-seq', { n: '1' }],
        ['equip', 'ctl-a', 'transferir'],
      ],
    },
  },

  /* ---------- 27: janela deslizante ---------- */
  27: {
    aula: {
      cartoes: [
        {
          titulo: 'Não espere, continue mandando',
          texto: [
            'Na janela deslizante, o transmissor pode ter vários quadros a caminho sem ACK. Conforme os ACKs chegam, a janela anda para a frente e libera novos quadros.',
            'É como a fila do posto de vacinação de Fim de Linha: não se espera a pessoa da frente ir embora para chamar a próxima.',
          ],
          visual: { tipo: 'janela', total: 16, janela: 5 },
        },
        {
          titulo: 'Quanto cabe no cano',
          texto: [
            'Para a linha nunca parar, a janela precisa cobrir a ida e volta inteira: quando o primeiro ACK chegar, o transmissor ainda deve ter quadro para mandar.',
            'Janela = 1 + 2 Tp ÷ Tf, arredondado para cima. Tp é a propagação, Tf o tempo de transmitir um quadro. É o produto banda × atraso, medido em quadros.',
          ],
          visual: { tipo: 'calculadora', formula: 'janela' },
        },
        {
          titulo: 'Exemplo do satélite',
          texto: ['Quadros de 1000 bytes a 1 Mb/s: Tf = 8 ms. Propagação de 270 ms. Janela = 1 + 2 × 270 ÷ 8 = 68,5, ou seja, 69 quadros a caminho.', 'Com janela 1 (pare e espere), o aproveitamento é 1,5 %. Com 69, passa de 90 %.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Janela', 'Aproveitamento'],
            linhas: [
              ['1', '1,5 %'],
              ['10', '15 %'],
              ['69', 'mais de 90 %'],
            ],
          },
        },
        {
          titulo: 'A numeração precisa caber',
          texto: ['Cada quadro da janela precisa de um número de sequência diferente. No go-back-N, com n bits, a janela vai até 2^n - 1.', 'Para 69 quadros: 6 bits dão até 63, pouco; 7 bits dão até 127, serve.'],
        },
      ],
      checagem: {
        pergunta: 'Quadros levam 10 ms para ser transmitidos e a propagação é de 45 ms. Qual janela enche o cano?',
        opcoes: ['5', '6', '10', '46'],
        certa: 2,
        explicacao: 'Janela = 1 + 2 × 45 ÷ 10 = 10. Com 10 quadros a caminho, o ACK do primeiro chega bem quando o décimo termina de sair.',
      },
    },
    desafio: {
      carta: [
        'A ilha da colônia de pescadores só tem um link de satélite de 512 kb/s, com quadros de 1000 bytes e 270 ms de propagação. O boletim do tempo de alto-mar demora tanto com pare e espere que chega depois do barco sair.',
        'Objetivo: aproveitar 90 % da linha ou mais, sem quadro errado, e responder as perguntas do chamado.',
      ],
      dicas: ['Calcule Tf: 8000 bits a 512 kb/s.', 'Janela = 1 + 2 × 270 ÷ 15,625, arredondado para cima, e bits suficientes para numerar.', 'Go-back-N, janela 36, 6 bits de sequência.'],
      perguntas: p27,
      respostas: { '1': '36', '2': '6' },
      montar: () => {
        const m = novoMundo(2727);
        par(m, 'Controlador de satélite CS-300', 'satelite', { arq: arq({ timeoutMs: 800 }) });
        m.flags.linhaArq = LINHA27;
        m.flags.quadrosArq = 1000;
        return m;
      },
      objetivo: (m) => {
        const r = ultimoArq(m);
        return [item('aproveitamento de 90 % ou mais', transferiuAgora(m) && r!.concluiu && r!.utilizacao >= 0.9 && r!.entreguesErrados === 0, r ? `${(r.utilizacao * 100).toFixed(1)} %` : 'ainda não transferiu'), ...p27.map((p) => respondida(m, p))];
      },
      solucao: [
        ['equip', 'ctl-a', 'protocolo', { p: 'go-back-n', janela: '36', bits: '6' }],
        ['equip', 'ctl-a', 'transferir'],
      ],
    },
  },

  /* ---------- 28: go-back-N e 2^n - 1 ---------- */
  28: {
    aula: {
      cartoes: [
        {
          titulo: 'Go-back-N',
          texto: [
            'O transmissor manda até W quadros sem ACK. O receptor só aceita o próximo em ordem; o que chegar fora de ordem, descarta.',
            'Se um quadro se perde, o transmissor volta até ele e repete dali em diante, inclusive os que já tinham chegado. Daí o nome: volta N.',
          ],
          visual: { tipo: 'janela', total: 14, janela: 4, perdido: 2 },
        },
        {
          titulo: 'Números que dão a volta',
          texto: ['Com n bits, os números vão de 0 a 2^n - 1 e recomeçam. Com 3 bits: 0, 1, 2, ..., 7, 0, 1...', 'O quadro 8 e o quadro 0 têm o mesmo número. O receptor só enxerga o número, nunca o quadro "de verdade".'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Quadro', '0', '1', '...', '7', '8', '9'],
            linhas: [['Número (3 bits)', '0', '1', '...', '7', '0', '1']],
          },
        },
        {
          titulo: 'A armadilha da janela cheia',
          texto: [
            'Janela 8 com 3 bits: o transmissor manda 0 a 7, todos chegam, todos os ACKs se perdem. O receptor agora espera o número 0, do quadro 8.',
            'O transmissor dá timeout e reenvia o velho quadro 0. O receptor vê "0" e aceita como se fosse o novo. Dado repetido no meio do arquivo, sem ninguém perceber.',
          ],
        },
        {
          titulo: 'Sempre sobra um número',
          texto: ['Com janela 2^n - 1, o receptor espera um número que nunca está na janela velha. O quadro repetido chega com número fora do esperado e é descartado.', 'Regra do go-back-N: janela máxima 2^n - 1.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Bits', 'Números', 'Janela máxima'],
            linhas: [
              ['2', '0 a 3', '3'],
              ['3', '0 a 7', '7'],
              ['4', '0 a 15', '15'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'No go-back-N com 2 bits de sequência e janela 4, todos os ACKs da primeira janela se perdem. O que acontece?',
        opcoes: ['Nada: o timeout resolve.', 'O receptor aceita um quadro velho como novo.', 'O transmissor trava para sempre.', 'O receptor pede para diminuir a janela.'],
        certa: 1,
        explicacao: 'Com 2 bits há só 4 números. Depois de aceitar 0 a 3, o receptor espera o 0 do quadro 4, e o quadro 0 reenviado tem esse mesmo número. A janela segura seria 3.',
      },
    },
    desafio: {
      carta: [
        'O enlace da prefeitura com o cartório usa go-back-N com 4 bits de sequência e janela 16, "porque 16 é redondo". Num dia de chuva, uma certidão de nascimento saiu com duas páginas iguais.',
        'Objetivo: nenhum quadro entregue errado, mesmo quando todos os ACKs de uma janela se perdem, e responder a pergunta do chamado.',
      ],
      dicas: ['Transfira e veja os quadros entregues errados.', 'A janela usa todos os 16 números da numeração.', 'Mantenha os 4 bits e ponha a janela em 15.'],
      perguntas: p28,
      respostas: { '1': '15' },
      montar: () => {
        const m = novoMundo(2828);
        par(m, 'Controlador de enlace HDLC CH-200', 'radio', { arq: arq({ protocolo: 'go-back-n', janela: 16, bitsSeq: 4, timeoutMs: 80 }) });
        m.flags.linhaArq = { taxaBps: 2_000_000, propagacaoMs: 15, bytesQuadro: 500, perdasAck: Array.from({ length: 16 }, (_, i) => i) } satisfies Linha;
        m.flags.quadrosArq = 40;
        return m;
      },
      objetivo: (m) => {
        const r = ultimoArq(m);
        const a = ctl(m).arq as ConfigArq;
        const seguro = a.janela <= 2 ** a.bitsSeq - 1;
        return [item('janela menor que a numeração', seguro, `janela ${a.janela}, ${a.bitsSeq} bits`), item('nenhum quadro entregue errado', transferiuAgora(m) && seguro && r!.concluiu && r!.entreguesErrados === 0, r ? `${r.entreguesErrados} errados` : 'ainda não transferiu'), respondida(m, p28[0]!)];
      },
      solucao: [
        ['equip', 'ctl-a', 'janela', { n: '15' }],
        ['equip', 'ctl-a', 'transferir'],
      ],
    },
  },

  /* ---------- 29: retransmissão seletiva e 2^(n-1) ---------- */
  29: {
    aula: {
      cartoes: [
        {
          titulo: 'Repetir só o que se perdeu',
          texto: [
            'No go-back-N, uma perda faz o transmissor repetir a janela inteira, inclusive quadros que já tinham chegado. Em linha ruim, a banda vira repetição.',
            'Na retransmissão seletiva, o receptor guarda os quadros que chegam fora de ordem e confirma um por um. O transmissor repete só o perdido.',
          ],
          visual: { tipo: 'janela', total: 14, janela: 4, perdido: 1 },
        },
        {
          titulo: 'O receptor também tem janela',
          texto: ['Para guardar fora de ordem, o receptor aceita qualquer número dentro da janela dele. Isso custa memória: espaço para W quadros esperando o buraco ser preenchido.', 'E cria um perigo novo: a janela do receptor e a do transmissor podem se sobrepor na numeração.'],
        },
        {
          titulo: 'Metade da numeração',
          texto: [
            'Se todos os ACKs se perdem, o transmissor reenvia a janela velha enquanto o receptor já espera a janela nova. Se as duas tiverem números em comum, o velho entra como novo.',
            'Para nunca se sobreporem, cada janela pode ter no máximo metade dos números: 2^(n-1).',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Bits', 'Go-back-N', 'Seletiva'],
            linhas: [
              ['3', '7', '4'],
              ['4', '15', '8'],
              ['7', '127', '64'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'A linha perde muitos quadros e a numeração tem 3 bits. Qual configuração repete menos e continua segura?',
        opcoes: ['Go-back-N com janela 8', 'Go-back-N com janela 7', 'Retransmissão seletiva com janela 4', 'Retransmissão seletiva com janela 7'],
        certa: 2,
        explicacao: 'A seletiva só repete o perdido. Com 3 bits, a janela dela vai até 2² = 4. Janela 7 na seletiva deixaria as janelas do transmissor e do receptor se sobreporem.',
      },
    },
    desafio: {
      carta: [
        'O rádio do posto de bombeiros no pé da serra perde uns 15 % dos quadros quando a neblina desce. Ele usa go-back-N com 3 bits e janela 7, e o mapa de focos de incêndio demora a montar de tanta repetição.',
        'Objetivo: transferir com 45 retransmissões ou menos, sem nenhum quadro errado, e responder a pergunta do chamado.',
      ],
      dicas: ['Transfira e conte as retransmissões do go-back-N.', 'Troque para retransmissão seletiva, que repete só o perdido.', 'Com 3 bits, janela 4 na seletiva.'],
      perguntas: p29,
      respostas: { '1': '4' },
      montar: () => {
        const m = novoMundo(2929);
        par(m, 'Controlador de enlace HDLC CH-200', 'radio', { arq: arq({ protocolo: 'go-back-n', janela: 7, bitsSeq: 3, timeoutMs: 150 }) });
        m.flags.linhaArq = LINHA29;
        m.flags.quadrosArq = 150;
        return m;
      },
      objetivo: (m) => {
        const r = ultimoArq(m);
        const a = ctl(m).arq as ConfigArq;
        const ok = a.protocolo === 'seletiva' && a.janela <= 2 ** (a.bitsSeq - 1);
        return [
          item('retransmissão seletiva com janela até metade da numeração', ok, `${a.protocolo}, janela ${a.janela}, ${a.bitsSeq} bits`),
          item('45 retransmissões ou menos, sem erro', transferiuAgora(m) && ok && r!.concluiu && r!.retransmissoes <= 45 && r!.entreguesErrados === 0, r ? `${r.retransmissoes} retransmissões` : 'ainda não transferiu'),
          respondida(m, p29[0]!),
        ];
      },
      solucao: [
        ['equip', 'ctl-a', 'protocolo', { p: 'seletiva', janela: '4', bits: '3' }],
        ['equip', 'ctl-a', 'transferir'],
      ],
    },
  },

  /* ---------- 30: PPP ---------- */
  30: {
    aula: {
      cartoes: [
        {
          titulo: 'O enlace do último quilômetro',
          texto: [
            'O PPP liga um cliente ao provedor ponto a ponto: DSL, fibra com PPPoE, linhas seriais. É o que o roteador da casa de quem mora em Fim de Linha conversa com o concentrador do provedor.',
            'O quadro junta tudo o que você viu no ato: flag 7E, escape de bytes e CRC no fim.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Flag', 'Endereço', 'Controle', 'Protocolo', 'Dado', 'CRC', 'Flag'],
            linhas: [['7E', 'FF', '03', '0021 (IPv4)', '...', '2 ou 4 bytes', '7E']],
          },
        },
        {
          titulo: 'Três fases para subir',
          texto: [
            'LCP: os dois lados negociam o enlace, como o tamanho máximo de quadro (MRU) e o método de autenticação.',
            'Autenticação: o cliente prova quem é. IPCP: o provedor entrega o endereço IP. Se uma fase falha, o enlace cai, e o log diz qual.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'lcp', rotulo: 'LCP', x: 80, y: 120 },
              { id: 'auth', rotulo: 'Autenticação', x: 240, y: 120 },
              { id: 'ipcp', rotulo: 'IPCP', x: 400, y: 120 },
              { id: 'ok', rotulo: 'Internet', x: 540, y: 120 },
            ],
            ligacoes: [
              ['lcp', 'auth', 'aberto'],
              ['auth', 'ipcp', 'aceito'],
              ['ipcp', 'ok', 'IP'],
            ],
          },
        },
        {
          titulo: 'PAP ou CHAP',
          texto: ['PAP manda usuário e senha abertos pela linha. Quem estiver escutando, leva.', 'CHAP manda um desafio; o cliente devolve o desafio misturado à senha por uma função de hash. A senha nunca passa pela linha. Os dois lados precisam concordar no método, senão o LCP derruba tudo.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Método', 'A senha passa na linha?', 'Campo protocolo'],
            linhas: [
              ['PAP', 'sim, aberta', 'C023'],
              ['CHAP', 'não', 'C223'],
            ],
          },
        },
        {
          titulo: 'O MRU de 1492',
          texto: ['No PPPoE, o quadro PPP viaja dentro de um quadro Ethernet de 1500 bytes, e o PPPoE gasta 8 deles. Sobram 1492.', 'Se o roteador pedir 1500, o concentrador responde com um Configure-Nak e propõe 1492. Esse número volta no ato 4.'],
        },
      ],
      checagem: {
        pergunta: 'No log aparece "LCP: aberto" e logo depois o enlace cai com "autenticação recusada". Que fase falhou?',
        opcoes: ['LCP', 'Autenticação', 'IPCP', 'Camada física'],
        certa: 1,
        explicacao: 'O LCP abriu, então o enlace foi negociado. A falha veio na fase seguinte: o método ou a credencial de autenticação não bateu.',
      },
    },
    desafio: {
      carta: [
        'O roteador da biblioteca municipal voltou da assistência resetado de fábrica: sem autenticação e pedindo MRU de 1500. O concentrador do provedor exige CHAP e derruba o enlace a cada discagem.',
        'Objetivo: PPP aberto, com endereço IP negociado, e responder a pergunta do chamado.',
      ],
      dicas: ['Disque e leia em que fase o log para.', 'O concentrador só aceita CHAP.', 'Ponha CHAP no roteador, disque de novo e veja que MRU o LCP aceitou.'],
      perguntas: p30,
      respostas: { '1': '1492' },
      montar: () => {
        const m = novoMundo(3030);
        adicionar(m, aparelho('cpe', 'enlace', 'Roteador DSL da biblioteca', [{ nome: 'linha' }], { ppp: { auth: 'nenhuma', mru: 1500 }, cfg: cfg({}) }));
        adicionar(m, aparelho('concentrador', 'enlace', 'Concentrador PPPoE do provedor', [{ nome: 'linha' }], { ppp: { exige: 'chap', mruMax: 1492, auth: 'chap', mru: 1492 } }));
        ligar(m, { equip: 'cpe', porta: 'linha' }, { equip: 'concentrador', porta: 'linha' }, 'cat6', 25, { id: 'c1' });
        m.flags.cargas = [[0xff, 0x03, 0xc0, 0x21, 0x01, 0x01, 0x00, 0x0e, 0x7d, 0x05]];
        m.flags.erros = [];
        return m;
      },
      objetivo: (m) => [item('autenticação CHAP no roteador', m.equipamentos.get('cpe')!.s.ppp.auth === 'chap'), item('PPP aberto, com IP', m.flags.ppp === 'aberto', m.flags.ppp ?? 'ainda não discou'), respondida(m, p30[0]!)],
      solucao: [
        ['equip', 'cpe', 'ppp-auth', { v: 'chap' }],
        ['equip', 'cpe', 'ppp-discar'],
      ],
    },
  },
};
