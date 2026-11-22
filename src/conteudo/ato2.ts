// Ato 2: O Quadro. Camada de enlace: enquadramento, erros e retransmissão.

import type { ConfigArq, Linha, ResultadoArq } from '../motor/arq';
import { escaparBytes, hex, restoCrc, type ConfigEnlace, type ErroLinha, type ResultadoEnlace } from '../motor/enlace';
import { adicionar, aparelho, ligar, novoMundo, type Mundo } from '../motor/mundo';
import { item, numerica, respondida } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function cargas(n: number, tamanho: number, semente: number, especiais: Record<number, number[]> = {}): number[][] {
  const out: number[][] = [];
  let x = semente;
  for (let i = 0; i < n; i++) {
    const q: number[] = [];
    for (let j = 0; j < tamanho; j++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      let b = (x >> 16) & 0xff;
      if (b === 0x7e || b === 0x7d) b = 0x55; // os bytes especiais só entram de propósito
      q.push(b);
    }
    const esp = especiais[i];
    if (esp) q.splice(3, esp.length, ...esp);
    out.push(q);
  }
  return out;
}

function par(m: Mundo, modelo: string, meio: 'radio' | 'satelite' | 'fibra', s: Record<string, unknown>) {
  const a = adicionar(m, aparelho('ctl-a', 'enlace', modelo, [{ nome: 'linha', fisica: meio === 'fibra' ? 'sfp' : meio === 'satelite' ? 'sat' : 'antena' }], s));
  const b = adicionar(m, aparelho('ctl-b', 'enlace', modelo, [{ nome: 'linha', fisica: meio === 'fibra' ? 'sfp' : meio === 'satelite' ? 'sat' : 'antena' }], {}));
  if (meio === 'radio') for (const e of [a, b]) e.antena = { ganho: 23, azimute: 0, azimuteCerto: 0, altura: 20, feixe: 9 };
  if (meio === 'satelite') ligar(m, { equip: a.nome, porta: 'linha' }, { equip: b.nome, porta: 'linha' }, 'satelite', 0, { id: 'c1', sat: { orbita: 'geo' } });
  else if (meio === 'radio') ligar(m, { equip: a.nome, porta: 'linha' }, { equip: b.nome, porta: 'linha' }, 'radio', 12000, { id: 'c1', radio: { distanciaKm: 0.05, freqGHz: 5.8, obstaculoM: 0, ptxDbm: 20 } });
  m.proxCabo = 2;
  return a;
}

const cfg = (c: Partial<ConfigEnlace>): ConfigEnlace => ({ enquadramento: 'flags', enchimento: true, deteccao: 'crc32', correcao: 'nenhuma', ...c });
const arq = (c: Partial<ConfigArq>): ConfigArq => ({ protocolo: 'pare-e-espere', janela: 1, bitsSeq: 1, timeoutMs: 1000, ...c });

const ctl = (m: Mundo) => m.equipamentos.get('ctl-a')!.s;
const ultimoEnlace = (m: Mundo) => m.flags.ultimoEnlace as ResultadoEnlace | undefined;
const ultimoArq = (m: Mundo) => m.flags.ultimoArq as ResultadoArq | undefined;

/** O resultado vale se a última transmissão foi feita com a configuração atual. */
function transmitiuCom(m: Mundo, campo: keyof ConfigEnlace, valor: unknown): boolean {
  return !!ultimoEnlace(m) && ctl(m).cfg[campo] === valor && m.flags.cfgDoUltimo === JSON.stringify(ctl(m).cfg);
}

const SAT: Linha = { taxaBps: 1_000_000, propagacaoMs: 270, bytesQuadro: 1000 };

const normHex = (s: string) => s.toUpperCase().replace(/0X/g, '').replace(/[^0-9A-F]/g, '');

/* ---------- Dia 19 ---------- */

const dia19: Dia = {
  numero: 19,
  ato: 2,
  titulo: 'Onde começa o quadro',
  chamado: [
    'CHAMADO #0019',
    'O enlace de dados entre o centro e a estação de bombeamento da água "embaralha tudo depois do primeiro chiado".',
    'Um único bit errado e o resto do dia vem lixo. A pessoa anterior configurou o enquadramento por contagem "porque é mais simples".',
    'Objetivo: um erro na linha estragar só um quadro, e não todos os que vêm depois.',
  ],
  manual: {
    titulo: 'Enquadramento',
    texto: [
      'A camada física entrega um rio de bits. A camada de enlace precisa cortar esse rio em quadros, e o receptor precisa saber onde cada quadro começa e termina.',
      'Contagem: cada quadro começa dizendo o próprio tamanho. Simples, mas se um erro atingir o número, o receptor lê o tamanho errado, perde o compasso e não acha mais o começo de nenhum quadro.',
      'Flags: um byte especial (0x7E) marca o começo e o fim de cada quadro. Um erro estraga aquele quadro, mas o próximo 0x7E põe o receptor de volta no compasso.',
      'Com detecção de erros, o quadro estragado é descartado e o protocolo de retransmissão pede de novo. Sem compasso, não há o que pedir.',
    ],
  },
  dicas: ['Transmita e veja quantos quadros se perdem.', 'O problema é o enquadramento por contagem.', 'Troque para flags e transmita de novo.'],
  montar: () => {
    const m = novoMundo(219);
    par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ enquadramento: 'contagem' }) });
    m.flags.cargas = cargas(10, 40, 19);
    m.flags.erros = [{ quadro: 3, bits: [13], noCabecalho: true }] satisfies ErroLinha[];
    return m;
  },
  objetivo: (m) => {
    const r = ultimoEnlace(m);
    const ok = transmitiuCom(m, 'enquadramento', 'flags') && !!r && r.corretos >= 9 && r.corrompidos === 0;
    return [item('enquadramento por flags', ctl(m).cfg.enquadramento === 'flags'), item('transmissão de teste com só o quadro atingido perdido', ok, r ? `${r.corretos} de ${r.enviados} certos` : 'ainda não transmitiu')];
  },
  posMorte: [
    'Com contagem, o erro caiu bem no campo de tamanho do quarto quadro. O receptor leu um tamanho errado, cortou no lugar errado e nunca mais achou o começo de nada.',
    'Com flags, o mesmo erro estragou só aquele quadro. O CRC percebeu e descartou, e o próximo 0x7E pôs o receptor de volta no compasso.',
    'Contagem pura quase não se usa sozinha por isso. Quando aparece, vem combinada com outra marca de começo.',
  ],
};

/* ---------- Dia 20 ---------- */

const perguntas20: Pergunta[] = [
  { id: '1', texto: 'Como ficam os bytes 41 7E 42 7D depois do escape de bytes?', confere: (r) => normHex(r) === normHex(hex(escaparBytes([0x41, 0x7e, 0x42, 0x7d]))) },
];

const dia20: Dia = {
  numero: 20,
  ato: 2,
  titulo: 'O byte que é flag',
  chamado: [
    'CHAMADO #0020',
    'Agora com flags, o enlace da estação funciona... menos quando a planilha da conta de água tem certos valores. Aí o quadro chega pela metade.',
    'Objetivo: todos os quadros de teste chegando certos.',
  ],
  manual: {
    titulo: 'Escape de bytes',
    texto: [
      'Se o byte 0x7E marca o fim do quadro, o que acontece quando o próprio dado tem um 0x7E? O receptor acha que o quadro acabou no meio.',
      'A solução é o escape: antes de mandar, o transmissor troca todo 0x7E do dado por dois bytes, 0x7D 0x5E. E todo 0x7D (o próprio byte de escape) vira 0x7D 0x5D. O segundo byte é o original com o bit 5 invertido (XOR com 0x20).',
      'O receptor faz o contrário: viu 0x7D, joga fora e inverte o bit 5 do próximo. Assim, um 0x7E no fio é sempre uma flag de verdade.',
      'É exatamente o que o PPP faz.',
    ],
  },
  dicas: ['Olhe um quadro no analisador.', 'O dado contém 7E.', 'Ligue o escape de bytes.'],
  perguntas: perguntas20,
  montar: () => {
    const m = novoMundo(220);
    par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ enchimento: false }) });
    m.flags.cargas = cargas(8, 32, 20, { 0: [0x41, 0x7e, 0x42, 0x7d], 2: [0x7e], 5: [0x7d, 0x7e, 0x7e] });
    m.flags.erros = [];
    return m;
  },
  objetivo: (m) => {
    const r = ultimoEnlace(m);
    return [item('escape de bytes ligado', ctl(m).cfg.enchimento), item('todos os quadros chegando certos', transmitiuCom(m, 'enchimento', true) && r?.corretos === r?.enviados, r ? `${r.corretos} de ${r.enviados}` : undefined), respondida(m, perguntas20[0]!)];
  },
  posMorte: [
    'Os quadros 1, 3 e 6 tinham 0x7E no meio do dado. Sem escape, o receptor cortava ali e descartava os pedaços (o CRC não batia).',
    'Com escape, 41 7E 42 7D viaja como 41 7D 5E 42 7D 5D. O quadro fica um pouco maior, e nunca mais há 0x7E fora do lugar.',
    'O custo é variável: um dado cheio de 0x7E pode quase dobrar de tamanho. Por isso enlaces síncronos preferem fazer isso no nível do bit.',
  ],
};

/* ---------- Dia 21 ---------- */

const perguntas21: Pergunta[] = [{ id: '1', texto: 'Como fica 01111110 depois do enchimento de bits?', confere: (r) => r.replace(/[^01]/g, '') === '011111010' }];

const dia21: Dia = {
  numero: 21,
  ato: 2,
  titulo: 'Cinco uns',
  chamado: [
    'CHAMADO #0021',
    'O enlace de fibra da prefeitura usa flags no nível do bit (o padrão 01111110). Os quadros chegam picados sempre que o dado tem uma sequência longa de uns.',
    'Objetivo: todos os quadros de teste chegando certos.',
  ],
  manual: {
    titulo: 'Enchimento de bits',
    texto: [
      'Protocolos orientados a bit (como o HDLC) marcam começo e fim com o padrão 01111110: um zero, seis uns e um zero.',
      'Para esse padrão nunca aparecer dentro do dado, o transmissor enfia um 0 depois de cada cinco 1 seguidos. Assim nunca saem seis uns em sequência, a não ser na flag.',
      'O receptor faz o contrário: depois de cinco uns, se vier um 0, ele joga fora.',
      'Diferente do escape de bytes, o custo é pequeno e previsível: no pior caso, 1 bit a cada 5.',
    ],
  },
  dicas: ['Veja um quadro no analisador, em bits.', 'O dado tem seis uns seguidos.', 'Ligue o enchimento de bits.'],
  perguntas: perguntas21,
  montar: () => {
    const m = novoMundo(221);
    par(m, 'Controlador HDLC CH-200', 'radio', { cfg: cfg({ enquadramento: 'bits', enchimento: false }) });
    m.flags.cargas = cargas(8, 24, 21, { 1: [0x7e, 0x3f], 4: [0xff, 0xfe], 6: [0x7e] });
    m.flags.quadroAmostra = 1;
    m.flags.erros = [];
    return m;
  },
  objetivo: (m) => {
    const r = ultimoEnlace(m);
    return [item('enchimento de bits ligado', ctl(m).cfg.enchimento), item('todos os quadros chegando certos', transmitiuCom(m, 'enchimento', true) && r?.corretos === r?.enviados, r ? `${r.corretos} de ${r.enviados}` : undefined), respondida(m, perguntas21[0]!)];
  },
  posMorte: [
    'Sem enchimento, o dado 0x7E era lido como uma flag no meio do quadro, e o receptor picava tudo ali.',
    'Com enchimento, 01111110 viaja como 011111010. O zero extra some do outro lado, e o padrão de seis uns fica reservado para as flags.',
  ],
};

/* ---------- Dia 22 ---------- */

const perguntas22: Pergunta[] = [numerica('1', 'Qual o bit de paridade par para 1011001?', 0, 0)];

const dia22: Dia = {
  numero: 22,
  ato: 2,
  titulo: 'Paridade não basta',
  chamado: [
    'CHAMADO #0022',
    'O enlace da cooperativa usa bit de paridade para detectar erros. Mesmo assim, o sistema de estoque registrou 3.000 sacas de milho que não existem.',
    'Objetivo: nenhum quadro errado entregue sem ser percebido.',
  ],
  manual: {
    titulo: 'Detecção de erros',
    texto: [
      'Paridade par: um bit extra que deixa o total de uns par. Se um bit mudar no caminho, a conta não fecha e o erro é detectado.',
      'Mas se dois bits mudarem, a paridade volta a fechar e o erro passa. Ruído costuma vir em rajadas, atingindo vários bits seguidos. A paridade só pega erros ímpares.',
      'A soma de verificação (checksum) soma o quadro em palavras de 16 bits. Pega muito mais coisa, mas tem pontos cegos.',
      'O CRC trata o quadro como um polinômio e divide por um polinômio gerador. O CRC-32 do Ethernet pega qualquer rajada de até 32 bits e quase tudo além disso.',
    ],
  },
  dicas: ['Transmita e veja os quadros entregues errados.', 'Os erros vêm em pares de bits vizinhos.', 'Troque a detecção por CRC-32.'],
  perguntas: perguntas22,
  montar: () => {
    const m = novoMundo(222);
    par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ deteccao: 'paridade' }) });
    m.flags.cargas = cargas(8, 32, 22);
    m.flags.erros = [
      { quadro: 1, bits: [40, 41] },
      { quadro: 2, bits: [70] },
      { quadro: 5, bits: [100, 101] },
    ] satisfies ErroLinha[];
    return m;
  },
  objetivo: (m) => {
    const r = ultimoEnlace(m);
    const ok = !!r && m.flags.cfgDoUltimo === JSON.stringify(ctl(m).cfg) && r.corrompidos === 0;
    return [item('detecção mais forte que paridade', ['checksum', 'crc32'].includes(ctl(m).cfg.deteccao)), item('nenhum quadro errado entregue', ok, r ? `${r.corrompidos} errados` : undefined), respondida(m, perguntas22[0]!)];
  },
  posMorte: [
    'A paridade pegou o quadro com um bit errado e deixou passar os dois quadros com dois bits errados: duas viradas se anulam na conta.',
    'Com CRC, os três foram detectados e descartados. Num enlace com retransmissão, eles seriam pedidos de novo, e as sacas fantasmas nunca chegariam ao estoque.',
  ],
};

/* ---------- Dia 23 ---------- */

const perguntas23: Pergunta[] = [
  numerica('1', 'No Hamming, quantos bits de verificação são precisos para 4 bits de dados?', 3, 0),
  numerica('2', 'Chegou a palavra 0110111 (posições 1 a 7). Em que posição está o bit errado?', 5, 0),
];

const dia23: Dia = {
  numero: 23,
  ato: 2,
  titulo: 'Mão única',
  chamado: [
    'CHAMADO #0023',
    'As boias de medição da represa mandam dados por rádio, só de ida: não existe canal de volta para pedir retransmissão.',
    'O CRC detecta os erros direitinho e descarta... todos os quadros. Faz uma semana que ninguém sabe o nível da água.',
    'Objetivo: os quadros chegando certos mesmo com os erros da linha.',
  ],
  manual: {
    titulo: 'Correção de erros e o código de Hamming',
    texto: [
      'Detectar não basta quando não dá para pedir de novo (enlace de mão única, satélite muito longe, transmissão ao vivo). Aí o receptor precisa corrigir sozinho.',
      'O código de Hamming espalha bits de verificação nas posições que são potência de 2 (1, 2, 4...). Cada um confere um grupo de posições. Com m bits de dados, são precisos r bits de verificação, com 2^r maior ou igual a m + r + 1.',
      'Para 4 bits de dados bastam 3 de verificação: Hamming (7,4). O receptor refaz as três conferências; os resultados, lidos como número binário (síndrome), dizem a posição do bit errado. Síndrome zero: tudo certo.',
      'Conferência das posições 1, 3, 5, 7 vale 1; das 2, 3, 6, 7 vale 2; das 4, 5, 6, 7 vale 4. Some as que falharem.',
      'O preço: 7 bits para cada 4 de dado, 75 % a mais. Corrige um erro por palavra.',
    ],
  },
  dicas: ['Transmita: o CRC descarta, mas ninguém pode pedir de novo.', 'Precisa corrigir, não só detectar.', 'Ligue a correção Hamming.'],
  perguntas: perguntas23,
  montar: () => {
    const m = novoMundo(223);
    par(m, 'Transmissor de telemetria TM-1 (só ida)', 'radio', { cfg: cfg({ enquadramento: 'contagem' }) });
    m.flags.simplex = true;
    m.flags.cargas = cargas(6, 16, 23);
    m.flags.erros = Array.from({ length: 6 }, (_, q) => ({ quadro: q, bits: [3, 17, 40, 66, 95] })) satisfies ErroLinha[];
    return m;
  },
  objetivo: (m) => {
    const r = ultimoEnlace(m);
    return [item('correção Hamming ligada', ctl(m).cfg.correcao === 'hamming'), item('todos os quadros chegando certos', transmitiuCom(m, 'correcao', 'hamming') && r?.corretos === r?.enviados, r ? `${r.corretos} de ${r.enviados}` : undefined), ...perguntas23.map((p) => respondida(m, p))];
  },
  posMorte: [
    'Cada quadro sofria cinco erros isolados. O CRC via todos e descartava, mas sem canal de volta, descartar é perder.',
    'Com Hamming, cada palavra de 7 bits sofreu no máximo um erro, e o receptor consertou sozinho. Trinta bits corrigidos, nenhuma retransmissão.',
    'É a troca clássica: correção custa banda sempre; detecção custa retransmissão só quando há erro. Em fibra, quase nunca há erro, e só detectar compensa. Em rádio de mão única, só corrigir resolve.',
  ],
};

/* ---------- Dia 24 ---------- */

const perguntas24: Pergunta[] = [{ id: '1', texto: 'Divida 101100 por 1101 (x³ + x² + 1) em módulo 2. Qual é o resto (3 bits)?', confere: (r) => r.replace(/[^01]/g, '') === restoCrc('101100', '1101') }];

const dia24: Dia = {
  numero: 24,
  ato: 2,
  titulo: 'Divisão por polinômio',
  chamado: [
    'CHAMADO #0024',
    'O enlace do laboratório de análises usa soma de verificação de 16 bits. De vez em quando um resultado de exame chega trocado, e a soma não acusa nada.',
    'Objetivo: nenhum quadro errado entregue sem ser percebido.',
  ],
  manual: {
    titulo: 'CRC',
    texto: [
      'A soma de verificação soma palavras de 16 bits. Se um bit sobe numa palavra e o bit de mesmo peso desce em outra, a soma não muda: erro invisível.',
      'O CRC trata a sequência de bits como os coeficientes de um polinômio. 1101 é x³ + x² + 1. O transmissor acrescenta r zeros ao dado (r = grau do gerador), divide pelo gerador em módulo 2 e manda o resto junto.',
      'Divisão em módulo 2 é só XOR: alinhe o gerador embaixo do primeiro 1, faça XOR, desça, repita. O que sobrar no fim, com r bits, é o resto.',
      'O receptor divide o quadro inteiro pelo mesmo gerador. Resto zero: chegou certo. O CRC-32 do Ethernet usa um gerador de grau 32.',
    ],
  },
  dicas: ['Transmita: a soma deixa passar dois quadros.', 'Os erros se anulam na soma.', 'Troque para CRC-32.'],
  perguntas: perguntas24,
  montar: () => {
    const m = novoMundo(224);
    par(m, 'Controlador de enlace serial CE-100', 'radio', { cfg: cfg({ deteccao: 'checksum' }) });
    const base = cargas(8, 32, 24);
    for (const q of base) q.splice(0, 4, 0x12, 0x34, 0x56, 0x78);
    m.flags.cargas = base;
    m.flags.erros = [
      { quadro: 2, bits: [5, 21] },
      { quadro: 5, bits: [5, 21] },
    ] satisfies ErroLinha[];
    return m;
  },
  objetivo: (m) => {
    const r = ultimoEnlace(m);
    return [item('detecção por CRC-32', ctl(m).cfg.deteccao === 'crc32'), item('nenhum quadro errado entregue', transmitiuCom(m, 'deteccao', 'crc32') && r?.corrompidos === 0, r ? `${r.corrompidos} errados` : undefined), respondida(m, perguntas24[0]!)];
  },
  posMorte: [
    'Nos quadros 3 e 6, o mesmo bit virou para cima na primeira palavra e para baixo na segunda. A soma deu igual, e o exame trocado passou.',
    'O CRC não é soma: é resto de divisão de polinômio. Esse tipo de erro muda o resto, e o quadro é descartado.',
  ],
};

/* ---------- Dia 25 ---------- */

const perguntas25: Pergunta[] = [
  numerica('1', 'Quanto tempo leva a ida e volta: transmitir o quadro de 1000 bytes a 1 Mb/s mais 270 ms para ir e 270 ms para o ACK voltar? (em ms)', 548, 1),
  numerica('2', 'Que porcentagem do tempo a linha fica transmitindo no pare e espere? (8 ms de 548 ms)', (8 / 548) * 100, 0.05),
];

const dia25: Dia = {
  numero: 25,
  ato: 2,
  titulo: 'Pare e espere',
  chamado: [
    'CHAMADO #0025',
    'A fazenda Fim do Mundo manda o relatório da colheita pelo satélite geoestacionário, com pare e espere: manda um quadro e espera o ACK.',
    'O contador de retransmissões não para de subir, mesmo sem nenhum erro na linha.',
    'Objetivo: transferência sem nenhuma retransmissão à toa, e responder as perguntas.',
  ],
  manual: {
    titulo: 'Pare e espere e o timeout',
    texto: [
      'Pare e espere (stop-and-wait): o transmissor manda um quadro e espera a confirmação (ACK). Se o ACK não chega dentro do timeout, manda de novo.',
      'O timeout precisa ser maior que o tempo de ida e volta: transmitir o quadro, ele chegar do outro lado e o ACK voltar. Com timeout menor, o transmissor desiste antes da resposta poder chegar e retransmite à toa.',
      'Tempo de transmissão = tamanho em bits ÷ taxa. 1000 bytes a 1 Mb/s: 8000 bits ÷ 1.000.000 b/s = 8 ms.',
      'O aproveitamento do pare e espere é tempo transmitindo ÷ tempo de cada ciclo: Tf ÷ (Tf + 2 Tp).',
    ],
  },
  dicas: ['Transfira e veja as retransmissões à toa.', 'O timeout está menor que a ida e volta.', 'Ponha o timeout em 700 ms.'],
  perguntas: perguntas25,
  montar: () => {
    const m = novoMundo(225);
    par(m, 'Controlador de satélite CS-300', 'satelite', { arq: arq({ timeoutMs: 300 }) });
    m.flags.linhaArq = SAT;
    m.flags.quadrosArq = 20;
    return m;
  },
  objetivo: (m) => {
    const r = ultimoArq(m);
    const vale = !!r && m.flags.arqDoUltimo === JSON.stringify(ctl(m).arq);
    return [item('timeout maior que a ida e volta', ctl(m).arq.timeoutMs > 548, `${ctl(m).arq.timeoutMs} ms`), item('transferência sem retransmissão à toa', vale && r!.concluiu && r!.desnecessarias === 0, r ? `${r.desnecessarias} à toa` : undefined), ...perguntas25.map((p) => respondida(m, p))];
  },
  posMorte: [
    'Com timeout de 300 ms, o transmissor desistia antes do ACK, que só podia chegar depois de 548 ms. Cada quadro ia duas vezes.',
    'Com timeout acima da ida e volta, cada quadro vai uma vez só. Mas veja o aproveitamento: 1,5 %. A linha passa 98,5 % do tempo em silêncio, esperando ACK. O próximo passo é não esperar.',
  ],
};

/* ---------- Dia 26 ---------- */

const perguntas26: Pergunta[] = [numerica('1', 'No pare e espere, quantos números de sequência diferentes bastam?', 2, 0)];

const dia26: Dia = {
  numero: 26,
  ato: 2,
  titulo: 'O ACK que sumiu',
  chamado: [
    'CHAMADO #0026',
    'O enlace de rádio do posto de saúde usa pare e espere sem número de sequência. Às vezes a receita sai duplicada: duas caixas do mesmo remédio.',
    'Objetivo: nenhum quadro entregue duplicado.',
  ],
  manual: {
    titulo: 'Número de sequência',
    texto: [
      'Se o quadro chega e o ACK se perde na volta, o transmissor dá timeout e manda o mesmo quadro de novo. Para o receptor, é um quadro novo, e ele entrega duas vezes.',
      'A solução é numerar os quadros. No pare e espere basta 1 bit: os quadros alternam 0, 1, 0, 1. Se chegar de novo o mesmo número, o receptor sabe que é repetido, descarta e só reenvia o ACK.',
      'Por isso o pare e espere com 1 bit de sequência também é chamado de protocolo de bit alternado.',
    ],
  },
  dicas: ['Transfira e veja a duplicata.', 'Sem número, o receptor não distingue quadro novo de repetido.', 'Use 1 bit de sequência.'],
  perguntas: perguntas26,
  montar: () => {
    const m = novoMundo(226);
    par(m, 'Controlador de enlace serial CE-100', 'radio', { arq: arq({ bitsSeq: 0, timeoutMs: 60 }) });
    m.flags.linhaArq = { taxaBps: 500_000, propagacaoMs: 10, bytesQuadro: 500, perdasAck: [2] } satisfies Linha;
    m.flags.quadrosArq = 10;
    return m;
  },
  objetivo: (m) => {
    const r = ultimoArq(m);
    const vale = !!r && m.flags.arqDoUltimo === JSON.stringify(ctl(m).arq);
    return [item('número de sequência ligado', ctl(m).arq.bitsSeq >= 1), item('nenhum quadro duplicado', vale && r!.concluiu && r!.entreguesErrados === 0, r ? `${r.entreguesErrados} duplicados` : undefined), respondida(m, perguntas26[0]!)];
  },
  posMorte: [
    'O ACK do terceiro quadro se perdeu. O transmissor mandou de novo, e o receptor, sem número para comparar, entregou duas vezes.',
    'Com 1 bit, o repetido chegou com o mesmo número do anterior. O receptor percebeu, descartou e só reenviou o ACK.',
  ],
};

/* ---------- Dia 27 ---------- */

const perguntas27: Pergunta[] = [numerica('1', 'Quantos quadros precisam estar a caminho para a linha nunca parar? (1 + 2 × 270 ms ÷ 8 ms, arredondado para cima)', 69, 0)];

const dia27: Dia = {
  numero: 27,
  ato: 2,
  titulo: 'Encher o cano',
  chamado: [
    'CHAMADO #0027',
    'A fazenda quer mandar as fotos do drone da lavoura pelo satélite. Com pare e espere, as 1000 fotos levam uma eternidade e a linha fica 98 % do tempo parada.',
    'Objetivo: aproveitar 90 % da linha ou mais.',
  ],
  manual: {
    titulo: 'Janela deslizante',
    texto: [
      'Em vez de mandar um e esperar, o transmissor pode mandar vários quadros seguidos sem ACK: a janela. Conforme os ACKs chegam, a janela anda para a frente.',
      'Para a linha nunca parar, a janela precisa cobrir todo o tempo de ida e volta: enquanto o primeiro ACK não chega, continua mandando. Janela = 1 + 2 Tp ÷ Tf, onde Tp é a propagação e Tf o tempo de transmitir um quadro.',
      'Esse valor é o produto banda × atraso medido em quadros: quanto cabe dentro do cano.',
      'Os números de sequência precisam dar para a janela: no go-back-N, com n bits, a janela pode ir até 2^n - 1.',
    ],
  },
  dicas: ['Faça a conta da janela.', '69 quadros a caminho. Quantos bits de sequência para numerar isso?', 'Go-back-N, janela 69, 7 bits de sequência.'],
  perguntas: perguntas27,
  montar: () => {
    const m = novoMundo(227);
    par(m, 'Controlador de satélite CS-300', 'satelite', { arq: arq({ timeoutMs: 700 }) });
    m.flags.linhaArq = SAT;
    m.flags.quadrosArq = 1000;
    return m;
  },
  objetivo: (m) => {
    const r = ultimoArq(m);
    const vale = !!r && m.flags.arqDoUltimo === JSON.stringify(ctl(m).arq);
    return [item('aproveitamento de 90 % ou mais', vale && r!.concluiu && r!.utilizacao >= 0.9 && r!.entreguesErrados === 0, r ? `${(r.utilizacao * 100).toFixed(1)} %` : undefined), respondida(m, perguntas27[0]!)];
  },
  posMorte: [
    'Com 69 quadros a caminho, quando o ACK do primeiro chega, o transmissor está acabando de mandar o 69º. A linha nunca para.',
    'O aproveitamento passou de 1,5 % para mais de 93 %. Sobra um pouco no começo e no fim, quando o cano enche e esvazia.',
    'Atraso não se negocia, mas se esconde: a janela é o truque que toda conexão longa usa, do TCP ao satélite.',
  ],
};

/* ---------- Dia 28 ---------- */

const perguntas28: Pergunta[] = [numerica('1', 'Com 3 bits de sequência, qual a maior janela segura no go-back-N?', 7, 0)];

const dia28: Dia = {
  numero: 28,
  ato: 2,
  titulo: 'Janela de oito',
  chamado: [
    'CHAMADO #0028',
    'O enlace do hospital usa go-back-N com 3 bits de sequência e janela 8. Num dia de chuva, um exame de raio-X chegou com uma fatia repetida no meio.',
    'Objetivo: nenhum quadro entregue errado, mesmo quando todos os ACKs de uma janela se perdem.',
  ],
  manual: {
    titulo: 'Go-back-N e o tamanho da janela',
    texto: [
      'Go-back-N: o transmissor manda até W quadros sem ACK. O receptor só aceita o próximo em ordem e descarta o resto. Se algo se perde, o transmissor volta e repete daquele em diante.',
      'Com n bits, os números vão de 0 a 2^n - 1 e recomeçam. Com 3 bits: 0 a 7.',
      'A armadilha: com janela 8, o transmissor manda os quadros 0 a 7. Todos chegam, mas todos os ACKs se perdem. O receptor agora espera o próximo, de número 0. O transmissor dá timeout e reenvia o velho quadro 0. O receptor aceita como se fosse novo.',
      'Por isso, no go-back-N, a janela máxima é 2^n - 1.',
    ],
  },
  dicas: ['Transfira e veja o quadro entregue errado.', 'A janela é do tamanho da numeração inteira.', 'Janela 7.'],
  perguntas: perguntas28,
  montar: () => {
    const m = novoMundo(228);
    par(m, 'Controlador de enlace HDLC CH-200', 'radio', { arq: arq({ protocolo: 'go-back-n', janela: 8, bitsSeq: 3, timeoutMs: 100 }) });
    m.flags.linhaArq = { taxaBps: 1_000_000, propagacaoMs: 20, bytesQuadro: 1000, perdasAck: [0, 1, 2, 3, 4, 5, 6, 7] } satisfies Linha;
    m.flags.quadrosArq = 20;
    return m;
  },
  objetivo: (m) => {
    const r = ultimoArq(m);
    const vale = !!r && m.flags.arqDoUltimo === JSON.stringify(ctl(m).arq);
    const a = ctl(m).arq as ConfigArq;
    return [item('janela menor que a numeração', a.janela <= 2 ** a.bitsSeq - 1, `janela ${a.janela}, ${a.bitsSeq} bits`), item('nenhum quadro entregue errado', vale && r!.concluiu && r!.entreguesErrados === 0, r ? `${r.entreguesErrados} errados` : undefined), respondida(m, perguntas28[0]!)];
  },
  posMorte: [
    'Com janela 8 e numeração de 0 a 7, o quadro 0 velho e o quadro 8 novo têm o mesmo número. Quando os ACKs sumiram, o receptor não teve como distinguir.',
    'Com janela 7, sempre sobra um número fora da janela. O quadro velho chega com um número que o receptor não está esperando, e é descartado.',
  ],
};

/* ---------- Dia 29 ---------- */

const perguntas29: Pergunta[] = [numerica('1', 'Com 4 bits de sequência, qual a maior janela segura na retransmissão seletiva?', 8, 0)];

const LINHA29: Linha = { taxaBps: 256_000, propagacaoMs: 100, bytesQuadro: 1000, perdaDados: 0.1 };

const dia29: Dia = {
  numero: 29,
  ato: 2,
  titulo: 'Só o que se perdeu',
  chamado: [
    'CHAMADO #0029',
    'O rádio da serra perde um quadro a cada dez quando venta. Com go-back-N, cada perda faz o transmissor repetir a janela inteira.',
    'Objetivo: transferir com 40 retransmissões ou menos, sem nenhum quadro errado.',
  ],
  manual: {
    titulo: 'Retransmissão seletiva',
    texto: [
      'No go-back-N, o receptor joga fora tudo que chega depois de uma perda, e o transmissor repete tudo de novo. Em linha boa, tudo bem. Em linha ruim, a maior parte da banda vira repetição.',
      'Na retransmissão seletiva, o receptor guarda os quadros que chegam fora de ordem e confirma um por um. O transmissor repete só o que se perdeu.',
      'Custa memória no receptor e tem uma regra própria: a janela pode ser no máximo metade da numeração, 2^(n-1). Senão, quadros velhos e novos se confundem dentro da janela do receptor.',
    ],
  },
  dicas: ['Transfira com go-back-N e veja as retransmissões.', 'Troque para retransmissão seletiva.', 'Com 4 bits, janela 8.'],
  perguntas: perguntas29,
  montar: () => {
    const m = novoMundo(229);
    par(m, 'Controlador de enlace HDLC CH-200', 'radio', { arq: arq({ protocolo: 'go-back-n', janela: 15, bitsSeq: 4, timeoutMs: 300 }) });
    m.flags.linhaArq = LINHA29;
    m.flags.quadrosArq = 200;
    return m;
  },
  objetivo: (m) => {
    const r = ultimoArq(m);
    const vale = !!r && m.flags.arqDoUltimo === JSON.stringify(ctl(m).arq);
    const a = ctl(m).arq as ConfigArq;
    return [
      item('retransmissão seletiva com janela até metade da numeração', a.protocolo === 'seletiva' && a.janela <= 2 ** (a.bitsSeq - 1), `${a.protocolo}, janela ${a.janela}, ${a.bitsSeq} bits`),
      item('40 retransmissões ou menos, sem erro', vale && r!.concluiu && r!.retransmissoes <= 40 && r!.entreguesErrados === 0, r ? `${r.retransmissoes} retransmissões` : undefined),
      respondida(m, perguntas29[0]!),
    ];
  },
  posMorte: [
    'Com go-back-N, cada quadro perdido levava junto os que vinham atrás: quase 300 retransmissões para 200 quadros.',
    'Com retransmissão seletiva, só os perdidos voltaram: umas duas dezenas. A linha fez trabalho útil em vez de repetir o que já tinha chegado.',
    'O TCP moderno usa a mesma ideia, com confirmações seletivas (SACK). Você encontra isso de novo no ato 5.',
  ],
};

/* ---------- Dia 30 ---------- */

const perguntas30: Pergunta[] = [{ id: '1', texto: 'No quadro PPP, qual é o valor do campo protocolo para IPv4 (em hexadecimal)?', confere: (r) => ['0021', '21'].includes(normHex(r)) }];

const dia30: Dia = {
  numero: 30,
  ato: 2,
  titulo: 'PPP no último quilômetro',
  chamado: [
    'CHAMADO #0030  último do ato',
    'Cliente novo de DSL. O roteador dele sobe o enlace e cai em seguida, a cada tentativa. No log do concentrador: "autenticação recusada".',
    'Objetivo: PPP aberto, com endereço IP negociado, e responder a pergunta do chamado.',
  ],
  manual: {
    titulo: 'PPP',
    texto: [
      'O PPP (Point-to-Point Protocol) é o enlace de quem liga um cliente a um provedor: DSL, fibra com PPPoE, links seriais. O quadro tem flag 7E, endereço FF, controle 03, o campo protocolo (0021 para IPv4), o dado e um CRC, com escape de bytes.',
      'Subir um PPP tem três fases. LCP: os dois lados negociam o enlace (tamanho máximo de quadro, MRU, e o método de autenticação). Autenticação: PAP manda usuário e senha abertos; CHAP manda um desafio e o cliente prova que sabe a senha sem mandá-la. IPCP: negocia o endereço IP.',
      'Se uma fase falha, o enlace cai. O log diz qual.',
    ],
  },
  dicas: ['Veja um quadro PPP no analisador.', 'O concentrador exige CHAP.', 'Mude a autenticação do roteador do cliente para CHAP e disque.'],
  perguntas: perguntas30,
  montar: () => {
    const m = novoMundo(230);
    adicionar(m, aparelho('cpe', 'enlace', 'Roteador DSL do cliente', [{ nome: 'linha' }], { ppp: { auth: 'pap', mru: 1500 }, cfg: cfg({}) }));
    adicionar(m, aparelho('concentrador', 'enlace', 'Concentrador PPPoE do provedor', [{ nome: 'linha' }], { ppp: { exige: 'chap', mruMax: 1492, auth: 'chap', mru: 1492 } }));
    ligar(m, { equip: 'cpe', porta: 'linha' }, { equip: 'concentrador', porta: 'linha' }, 'cat6', 30, { id: 'c1' });
    m.flags.cargas = [[0xff, 0x03, 0x00, 0x21, 0x45, 0x00, 0x00, 0x54, 0x7e, 0x01]];
    m.flags.erros = [];
    return m;
  },
  objetivo: (m) => [item('autenticação CHAP no roteador do cliente', m.equipamentos.get('cpe')!.s.ppp.auth === 'chap'), item('PPP aberto, com IP', m.flags.ppp === 'aberto'), respondida(m, perguntas30[0]!)],
  posMorte: [
    'O LCP subia, mas o concentrador exige CHAP e o roteador só oferecia PAP. Sem acordo na autenticação, o concentrador derrubava o enlace.',
    'Com CHAP, a senha nunca passa pela linha: o concentrador manda um desafio, e o cliente devolve o desafio misturado à senha por uma função de hash.',
    'O MRU caiu de 1500 para 1492 sozinho: o PPPoE gasta 8 bytes do quadro Ethernet. Guarde esse número; ele volta no ato 4, quando um site não abrir.',
    'Fim do ato 2. Os bits agora chegam em quadros, conferidos e na ordem. No ato 3, muita gente vai querer usar o mesmo meio ao mesmo tempo.',
  ],
};

/* ---------- passos guiados ---------- */

const doCtl = (acao: string, extra: Partial<Passo> = {}): Partial<Passo> => ({ alvo: ['equip', 'ctl-a'], acao, ...extra });

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const transmitirOk = (cond: (m: Mundo, r: ResultadoEnlace) => true | string) => (m: Mundo) => {
  const r = ultimoEnlace(m);
  return r ? cond(m, r) : 'A transmissão não aconteceu.';
};

const transferirOk = (cond: (m: Mundo, r: ResultadoArq) => true | string) => (m: Mundo) => {
  const r = ultimoArq(m);
  return r ? cond(m, r) : 'A transferência não aconteceu.';
};

dia19.passos = [
  passo({ ...doCtl('transmitir'), instrucao: 'Mande uma rajada de quadros de teste pela linha.', porque: 'Antes de mexer, veja o tamanho do estrago. O teste manda 10 quadros e a linha erra um bit no meio do caminho.', feito: 'Só os quadros de antes do erro chegaram. Do quadro atingido em diante, nada: o receptor perdeu o compasso.' }),
  passo({ ...doCtl('enquadramento'), pedir: ['v'], exemplo: { v: 'flags' }, instrucao: 'Escolha outro jeito de marcar o começo e o fim dos quadros.', porque: 'Na contagem, o erro caiu no campo de tamanho, e o receptor nunca mais achou o começo de nada. Um marcador fixo de começo e fim deixa o receptor se reencontrar no quadro seguinte.', conferir: (m) => ctl(m).cfg.enquadramento === 'flags' || (ctl(m).cfg.enquadramento === 'contagem' ? 'Continua na contagem.' : 'Flags de bits também marcam começo e fim, mas este enlace trabalha em bytes. Use as flags de byte.'), feito: 'Enquadramento por flags: o byte 7E abre e fecha cada quadro.' }),
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita de novo e compare.', porque: 'O mesmo erro vai acontecer. A diferença é o que o receptor faz depois dele.', conferir: transmitirOk((_m, r) => (r.corretos >= 9 && r.corrompidos === 0) || `Chegaram ${r.corretos} de ${r.enviados}.`), feito: 'Nove de dez. O quadro atingido foi descartado pelo CRC, e os outros chegaram. Com retransmissão, até ele voltaria.' }),
];

dia20.passos = [
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita os quadros de teste.', porque: 'Os quadros com dados da planilha são os que falham. Vamos ver quantos.', feito: 'Só 5 de 8 chegaram, e o receptor descartou vários pedaços de quadro, sem nenhum erro na linha. O problema está no próprio dado.' }),
  passo({ ...doCtl('quadro'), instrucao: 'Abra o analisador e veja o primeiro quadro na linha.', porque: 'Compare o dado original com o que vai no fio.', feito: 'O dado tem um 7E no meio. No fio, esse 7E é idêntico à flag de fim: o receptor corta o quadro ali.' }),
  passo({ pergunta: '1', instrucao: 'Faça o escape à mão: como ficam 41 7E 42 7D?', porque: 'Todo 7E vira 7D 5E. Todo 7D vira 7D 5D. Os outros bytes não mudam.', exemplo: { resposta: '41 7D 5E 42 7D 5D' }, feito: '41 7D 5E 42 7D 5D. Agora não existe 7E dentro do quadro.' }),
  passo({ ...doCtl('enchimento'), pedir: ['v'], exemplo: { v: 'sim' }, instrucao: 'Ligue o escape de bytes no controlador.', porque: 'É a mesma conta que você fez, feita em cada byte de cada quadro.', conferir: (m) => ctl(m).cfg.enchimento || 'O escape continua desligado.', feito: 'Escape ligado.' }),
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita de novo.', porque: 'Agora o receptor só vê 7E nas pontas de cada quadro.', conferir: transmitirOk((_m, r) => r.corretos === r.enviados || `Chegaram ${r.corretos} de ${r.enviados}.`), feito: 'Todos certos. O preço: alguns bytes a mais nos quadros que tinham 7E ou 7D.' }),
];

dia21.passos = [
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita os quadros de teste.', porque: 'Veja quantos quadros se perdem.', feito: 'Só metade chegou, e o receptor descartou um monte de pedaços. Nenhum erro na linha.' }),
  passo({ ...doCtl('quadro'), instrucao: 'Veja um desses quadros no analisador, bit a bit.', porque: 'A flag é 01111110. Procure esse padrão dentro do dado.', feito: 'O dado tem 01111110 no meio. O receptor acha que é a flag de fim.' }),
  passo({ pergunta: '1', instrucao: 'Encha à mão: como fica 01111110?', porque: 'Depois de cada cinco 1 seguidos, enfie um 0. Depois do zero, a contagem recomeça.', exemplo: { resposta: '011111010' }, feito: '011111010: cinco uns, o zero enfiado, e o resto. Nunca saem seis uns seguidos.' }),
  passo({ ...doCtl('enchimento'), pedir: ['v'], exemplo: { v: 'sim' }, instrucao: 'Ligue o enchimento de bits.', porque: 'O controlador faz a mesma conta em todo o fluxo de bits, e o receptor tira os zeros extras.', conferir: (m) => ctl(m).cfg.enchimento || 'O enchimento continua desligado.', feito: 'Enchimento ligado.' }),
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita de novo.', porque: 'Agora seis uns seguidos só existem nas flags.', conferir: transmitirOk((_m, r) => r.corretos === r.enviados || `Chegaram ${r.corretos} de ${r.enviados}.`), feito: 'Todos certos.' }),
];

dia22.passos = [
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita os quadros de teste.', porque: 'A linha vai errar em três quadros. Veja quantos a paridade percebe.', feito: 'A paridade pegou um e deixou passar dois: entregues errados, sem ninguém perceber.' }),
  passo({ pergunta: '1', instrucao: 'Calcule o bit de paridade par de 1011001.', porque: 'Conte os uns. Se já for par, o bit de paridade é 0. Se for ímpar, é 1, para o total ficar par.', exemplo: { resposta: '0' }, feito: 'Quatro uns, já é par: o bit é 0. Se dois bits virarem, o total continua par, e ninguém percebe.' }),
  passo({ ...doCtl('deteccao'), pedir: ['v'], exemplo: { v: 'crc32' }, instrucao: 'Escolha uma detecção que pegue erros em rajada.', porque: 'Os erros vêm em pares de bits vizinhos. Precisa de um código que perceba qualquer quantidade de bits trocados numa rajada.', conferir: (m) => (['checksum', 'crc32'].includes(ctl(m).cfg.deteccao) ? true : 'Paridade (ou nada) não pega dois bits trocados.'), feito: 'Detecção trocada.' }),
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita de novo.', porque: 'Os mesmos erros vão acontecer.', conferir: transmitirOk((_m, r) => r.corrompidos === 0 || `${r.corrompidos} quadros ainda passaram errados.`), feito: 'Os três quadros com erro foram descartados. Nenhuma saca fantasma.' }),
];

dia23.passos = [
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita os dados das boias.', porque: 'O CRC está ligado. Veja o que ele consegue fazer sem canal de volta.', feito: 'Todos os quadros descartados. O CRC detectou, mas não há como pedir de novo.' }),
  passo({ pergunta: '1', instrucao: 'Quantos bits de verificação o Hamming precisa para 4 bits de dados?', porque: 'O menor r com 2^r maior ou igual a 4 + r + 1. Teste r = 2 e r = 3.', exemplo: { resposta: '3' }, feito: 'r = 3, porque 2³ = 8 ≥ 4 + 3 + 1. A palavra fica com 7 bits: Hamming (7,4).' }),
  passo({ pergunta: '2', instrucao: 'Chegou 0110111. Em que posição está o erro?', porque: 'Confira as posições 1, 3, 5, 7 (vale 1), as 2, 3, 6, 7 (vale 2) e as 4, 5, 6, 7 (vale 4). Cada grupo deveria ter um número par de uns. Some os valores dos grupos que falharem.', exemplo: { resposta: '5' }, feito: 'Os grupos de valor 1 e 4 falharam: 1 + 4 = 5. Basta inverter o bit 5.' }),
  passo({ ...doCtl('correcao'), pedir: ['v'], exemplo: { v: 'hamming' }, instrucao: 'Ligue a correção de erros.', porque: 'Sem volta, o receptor precisa consertar sozinho.', conferir: (m) => ctl(m).cfg.correcao === 'hamming' || 'Sem correção, os quadros continuam descartados.', feito: 'Hamming ligado: cada 4 bits viajam como 7.' }),
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita de novo.', porque: 'Os mesmos erros, agora com Hamming do outro lado.', conferir: transmitirOk((_m, r) => r.corretos === r.enviados || `Chegaram ${r.corretos} de ${r.enviados}.`), feito: 'Todos certos, com 30 bits corrigidos. A represa voltou a ter nível de água.' }),
];

dia24.passos = [
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita os quadros de teste.', porque: 'Veja se a soma de verificação pega tudo.', feito: 'Dois quadros entregues errados. A soma não percebeu.' }),
  passo({ pergunta: '1', instrucao: 'Faça um CRC à mão: o resto de 101100 dividido por 1101.', porque: 'Acrescente 3 zeros (o grau do gerador): 101100000. Alinhe 1101 embaixo do primeiro 1, faça XOR, e repita a partir do próximo 1. Os 3 últimos bits que sobrarem são o resto.', exemplo: { resposta: '111' }, feito: 'Resto 111. O transmissor manda 101100111; o receptor divide tudo por 1101 e, se chegou certo, o resto dá zero.' }),
  passo({ ...doCtl('deteccao'), pedir: ['v'], exemplo: { v: 'crc32' }, instrucao: 'Troque a detecção por CRC.', porque: 'Erros que se anulam numa soma não se anulam numa divisão de polinômio.', conferir: (m) => ctl(m).cfg.deteccao === 'crc32' || 'Esse código tem o mesmo ponto cego, ou pior.', feito: 'CRC-32 ligado.' }),
  passo({ ...doCtl('transmitir'), instrucao: 'Transmita de novo.', porque: 'Os mesmos erros traiçoeiros.', conferir: transmitirOk((_m, r) => r.corrompidos === 0 || `${r.corrompidos} ainda passaram.`), feito: 'Os dois quadros foram descartados. Nenhum exame trocado.' }),
];

dia25.passos = [
  passo({ ...doCtl('transferir'), instrucao: 'Transfira o relatório da colheita.', porque: 'A linha não tem erro nenhum. Veja o contador de retransmissões mesmo assim.', feito: 'Cada quadro foi mandado duas vezes. O timeout está desistindo antes do ACK poder chegar.' }),
  passo({ pergunta: '1', instrucao: 'Calcule o tempo de ida e volta, em ms.', porque: 'Transmitir 1000 bytes a 1 Mb/s leva 8 ms. Depois, 270 ms até o satélite e de volta à terra, e mais 270 ms para o ACK voltar.', exemplo: { resposta: '548' }, feito: '8 + 270 + 270 = 548 ms. Antes disso, o ACK não tem como ter chegado.' }),
  passo({ ...doCtl('timeout'), pedir: ['ms'], exemplo: { ms: '700' }, instrucao: 'Ajuste o timeout.', porque: 'O timeout precisa ser maior que a ida e volta, com uma folga para variações.', conferir: (m) => (ctl(m).arq.timeoutMs > 548 ? true : `${ctl(m).arq.timeoutMs} ms ainda é menos que 548 ms.`), feito: 'Timeout acima da ida e volta.' }),
  passo({ ...doCtl('transferir'), instrucao: 'Transfira de novo.', porque: 'Agora o transmissor espera o tempo certo.', conferir: transferirOk((_m, r) => r.desnecessarias === 0 || `${r.desnecessarias} retransmissões à toa.`), feito: 'Nenhuma retransmissão à toa. Mas olhe o aproveitamento.' }),
  passo({ pergunta: '2', instrucao: 'Que porcentagem do tempo a linha passa transmitindo?', porque: 'A cada ciclo de 548 ms, só 8 ms são transmissão. Divida e multiplique por 100.', exemplo: { resposta: '1,46' }, feito: 'Uns 1,46 %. A linha passa quase o tempo todo em silêncio, esperando ACK.' }),
];

dia26.passos = [
  passo({ ...doCtl('transferir'), instrucao: 'Transfira as receitas.', porque: 'Num dos quadros, o ACK vai se perder na volta.', feito: 'Um quadro foi entregue duas vezes, e dali em diante tudo ficou deslocado: o receptor não tem como saber que era repetido.' }),
  passo({ pergunta: '1', instrucao: 'Quantos números diferentes bastam no pare e espere?', porque: 'Só existe um quadro a caminho por vez. O receptor só precisa distinguir "o mesmo de antes" de "o próximo".', exemplo: { resposta: '2' }, feito: 'Dois: 0 e 1, alternando. Isso cabe em 1 bit.' }),
  passo({ ...doCtl('bits-seq'), pedir: ['n'], exemplo: { n: '1' }, instrucao: 'Ligue o número de sequência.', porque: 'Com 1 bit, os quadros alternam entre 0 e 1.', conferir: (m) => (ctl(m).arq.bitsSeq >= 1 ? true : 'Com 0 bits, continua sem número.'), feito: 'Número de sequência ligado.' }),
  passo({ ...doCtl('transferir'), instrucao: 'Transfira de novo.', porque: 'O mesmo ACK vai se perder.', conferir: transferirOk((_m, r) => r.entreguesErrados === 0 || `${r.entreguesErrados} duplicados.`), feito: 'O repetido chegou, o receptor viu o número igual e descartou. Uma caixa de remédio só.' }),
];

dia27.passos = [
  passo({ ...doCtl('transferir'), instrucao: 'Transfira as fotos com pare e espere.', porque: 'Veja quanto tempo leva e quanto da linha é aproveitado.', feito: 'Quase 10 minutos, aproveitando só 1,5 % da linha.' }),
  passo({ pergunta: '1', instrucao: 'Calcule a janela que enche o cano.', porque: 'Janela = 1 + 2 × Tp ÷ Tf = 1 + 2 × 270 ÷ 8. Arredonde para cima.', exemplo: { resposta: '69' }, feito: '1 + 67,5 = 68,5: 69 quadros a caminho ao mesmo tempo.' }),
  passo({ ...doCtl('protocolo'), pedir: ['p', 'janela', 'bits'], exemplo: { p: 'go-back-n', janela: '69', bits: '7' }, instrucao: 'Configure uma janela deslizante.', porque: 'Use go-back-N com a janela que você calculou. A numeração precisa ser maior que a janela: com n bits, a janela vai até 2^n - 1.', conferir: (m) => {
    const a = ctl(m).arq as ConfigArq;
    if (a.protocolo === 'pare-e-espere') return 'Pare e espere tem janela 1, sempre.';
    if (a.janela < 69) return `Janela ${a.janela} ainda deixa a linha parada esperando ACK. Precisa de 69.`;
    const max = a.protocolo === 'seletiva' ? 2 ** (a.bitsSeq - 1) : 2 ** a.bitsSeq - 1;
    return a.janela <= max || `Com ${a.bitsSeq} bits, a janela máxima é ${max}. Aumente os bits.`;
  }, feito: 'Janela de 69 quadros, numerados com 7 bits (0 a 127).' }),
  passo({ ...doCtl('transferir'), instrucao: 'Transfira de novo.', porque: 'Agora o transmissor não para enquanto espera.', conferir: transferirOk((_m, r) => (r.concluiu && r.utilizacao >= 0.9 && r.entreguesErrados === 0) || `Aproveitamento de ${(r.utilizacao * 100).toFixed(1)} %.`), feito: 'Mais de 93 % de aproveitamento: de 10 minutos para menos de 9 segundos.' }),
];

dia28.passos = [
  passo({ ...doCtl('transferir'), instrucao: 'Transfira o exame.', porque: 'Na chuva, todos os ACKs da primeira janela vão se perder.', feito: 'O receptor aceitou quadros velhos como se fossem novos, e tudo dali em diante ficou embaralhado.' }),
  passo({ pergunta: '1', instrucao: 'Com 3 bits, qual a maior janela segura no go-back-N?', porque: 'Com 3 bits, os números vão de 0 a 7: são 8. Se a janela usar todos, o quadro velho e o novo podem ter o mesmo número.', exemplo: { resposta: '7' }, feito: '2³ - 1 = 7. Sempre sobra um número fora da janela.' }),
  passo({ ...doCtl('janela'), pedir: ['n'], exemplo: { n: '7' }, instrucao: 'Ajuste a janela.', porque: 'Mantenha os 3 bits e diminua a janela até o limite seguro.', conferir: (m) => {
    const a = ctl(m).arq as ConfigArq;
    return a.janela <= 2 ** a.bitsSeq - 1 || `Janela ${a.janela} com ${a.bitsSeq} bits ainda é grande demais.`;
  }, feito: 'Janela 7.' }),
  passo({ ...doCtl('transferir'), instrucao: 'Transfira de novo.', porque: 'Os mesmos ACKs vão se perder.', conferir: transferirOk((_m, r) => (r.concluiu && r.entreguesErrados === 0) || `${r.entreguesErrados} entregues errados.`), feito: 'O quadro velho chegou com um número fora do esperado e foi descartado. Raio-X inteiro.' }),
];

dia29.passos = [
  passo({ ...doCtl('transferir'), instrucao: 'Transfira com go-back-N.', porque: 'A linha perde um quadro a cada dez. Conte as retransmissões.', feito: 'Perto de 300 retransmissões para 200 quadros: cada perda arrasta a janela inteira de volta.' }),
  passo({ pergunta: '1', instrucao: 'Na retransmissão seletiva, qual a maior janela com 4 bits?', porque: 'Na seletiva, a janela do transmissor e a do receptor não podem se sobrepor na numeração: no máximo metade dos números, 2^(n-1).', exemplo: { resposta: '8' }, feito: '2⁴⁻¹ = 8.' }),
  passo({ ...doCtl('protocolo'), pedir: ['p', 'janela', 'bits'], exemplo: { p: 'seletiva', janela: '8', bits: '4' }, instrucao: 'Troque para retransmissão seletiva.', porque: 'Repetir só o que se perdeu economiza a banda que o go-back-N gasta repetindo quadros que já tinham chegado.', conferir: (m) => {
    const a = ctl(m).arq as ConfigArq;
    if (a.protocolo !== 'seletiva') return 'Esse protocolo continua repetindo mais do que precisa.';
    return a.janela <= 2 ** (a.bitsSeq - 1) || `Com ${a.bitsSeq} bits, a janela da seletiva vai até ${2 ** (a.bitsSeq - 1)}.`;
  }, feito: 'Retransmissão seletiva, janela 8.' }),
  passo({ ...doCtl('transferir'), instrucao: 'Transfira de novo.', porque: 'A mesma linha ruim.', conferir: transferirOk((_m, r) => (r.concluiu && r.retransmissoes <= 40 && r.entreguesErrados === 0) || `${r.retransmissoes} retransmissões.`), feito: 'Umas duas dezenas de retransmissões: só os quadros que de fato se perderam.' }),
];

dia30.passos = [
  passo({ alvo: ['equip', 'cpe'], acao: 'quadro', instrucao: 'Veja um quadro PPP no analisador.', porque: 'Repare nos campos do começo: endereço, controle e protocolo.', feito: 'FF 03 00 21 e o pacote IPv4. O 7E no meio do dado virou 7D 5E: o mesmo escape do dia 20.' }),
  passo({ pergunta: '1', instrucao: 'Qual é o campo protocolo para IPv4?', porque: 'Depois de FF (endereço) e 03 (controle) vêm dois bytes que dizem o que vem dentro.', exemplo: { resposta: '0021' }, feito: '0021 é IPv4. LCP é C021, CHAP é C223, IPCP é 8021.' }),
  passo({ alvo: ['equip', 'cpe'], acao: 'ppp-discar', instrucao: 'Disque e leia o log da negociação.', porque: 'Cada fase do PPP deixa uma linha no log. A que falhar diz o problema.', feito: 'O LCP abriu, mas o concentrador exige CHAP e o roteador só oferece PAP. Enlace derrubado.' }),
  passo({ alvo: ['equip', 'cpe'], acao: 'ppp-auth', pedir: ['v'], exemplo: { v: 'chap' }, instrucao: 'Ajuste a autenticação do roteador do cliente.', porque: 'Os dois lados precisam concordar no método. O concentrador só aceita um.', conferir: (m) => m.equipamentos.get('cpe')!.s.ppp.auth === 'chap' || 'O concentrador continua recusando esse método.', feito: 'CHAP configurado.' }),
  passo({ alvo: ['equip', 'cpe'], acao: 'ppp-discar', instrucao: 'Disque de novo.', porque: 'LCP, autenticação e IPCP, nessa ordem.', conferir: (m) => m.flags.ppp === 'aberto' || 'O PPP não subiu.', feito: 'LCP aberto, CHAP aceito, IPCP deu o endereço 203.0.113.77. O cliente está na internet.' }),
];

export const ATO2: Dia[] = [dia19, dia20, dia21, dia22, dia23, dia24, dia25, dia26, dia27, dia28, dia29, dia30];

