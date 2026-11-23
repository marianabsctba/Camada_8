// Dias do ato 3 (O Bairro), com prática guiada, aula e desafio no próprio dia.
// Protocolos livres de colisão e de disputa limitada (4.2.3 e 4.2.4), LAN sem fio e o terminal oculto (4.2.5)
// e a Ethernet clássica: camada física, quadro, endereços e CSMA/CD (4.3.1 e 4.3.2).

import { canal, eficienciaBitmap, eficienciaEthernet, recuoExponencial, simularCanal, tempoVoltaToken, eficienciaToken, simularOculto, type EstadoMac, type ResultadoMac } from '../motor/mac';
import { adicionar, comutador, ligar, novoMundo, pc, type Mundo } from '../motor/mundo';
import { fmt, lerCidr, rngSemente } from '../motor/util';
import { item, numerica, pingOk, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const ip = (s: string) => lerCidr(s)!;
const pct = (x: number) => `${fmt(x * 100, 1)} %`;

/** Estado do canal como o aparelho guarda, com os padrões do motor. */
const estadoDe = (c: Partial<EstadoMac>) => canal('x', c).s.mac as EstadoMac;
/** A mesma simulação que o console roda (mesma semente). */
const simDe = (c: Partial<EstadoMac>) => simularCanal(estadoDe(c), rngSemente(1234));

const est = (m: Mundo, nome: string) => m.equipamentos.get(nome)!.s.mac as EstadoMac;
const ultimoMac = (m: Mundo) => m.flags.ultimoMac as ResultadoMac | undefined;
/** O último resultado foi simulado com a configuração que está no canal agora. */
const simulouAgora = (m: Mundo, nome: string) => !!ultimoMac(m) && m.flags.macDoUltimo === JSON.stringify(est(m, nome));

const doCanal = (nome: string, acao: string, extra: Partial<Passo> = {}): Partial<Passo> => ({ alvo: ['equip', nome], acao, ...extra });
const doPc = (nome: string, acao: string, extra: Partial<Passo> = {}): Partial<Passo> => ({ alvo: ['equip', nome], acao, ...extra });

const semColisao = (p: string) => p === 'bitmap' || p === 'token';

/** MAC digitado de qualquer jeito (maiúsculas, hífen, dois-pontos) contra o MAC certo. */
const soHex = (s: string) => s.replace(/[^0-9a-f]/gi, '').toLowerCase();
function macDe(id: string, enunciado: string, nome: string): Pergunta {
  return { id, texto: enunciado, confere: (r, m) => soHex(r) === soHex(m.equipamentos.get(nome)!.mac) };
}

/* ======================================================================
 * 63: Sem colisão (4.2.3 e 4.2.4)
 * ====================================================================== */

const CFG63: Partial<EstadoMac> = { protocolo: 'aloha', estacoes: 8, carga: 1, a: 0.01, quadroBits: 100, bastaoBits: 24 };
const S63_ALOHA = simDe(CFG63);
const S63_TOKEN = simDe({ ...CFG63, protocolo: 'token' });
const S63_BITMAP = simDe({ ...CFG63, protocolo: 'bitmap' });
const VOLTA63 = tempoVoltaToken(8, 0.01, 24, 100);
const EF63_BAIXA8 = eficienciaBitmap(8, 100, 'baixa');
const EF63_BAIXA64 = eficienciaBitmap(64, 100, 'baixa');
const EF63_REGRESSIVA64 = 100 / (100 + Math.log2(64));

const p63: Pergunta[] = [numerica('1', 'Num prédio com 64 estações e quadros de 100 bits, qual a eficiência do mapa de bits com carga baixa, em %?', EF63_BAIXA64 * 100, 0.5)];

const CFG63D: Partial<EstadoMac> = { protocolo: 'aloha-slotted', estacoes: 12, carga: 0.4, a: 0.05, quadroBits: 1000, bastaoBits: 24 };
const VOLTA63D = tempoVoltaToken(12, 0.05, 24, 1000);
const EF63D = eficienciaToken(12, VOLTA63D);
const S63D_INICIO = simDe({ ...CFG63D, carga: 1 });

const d63: Pergunta[] = [numerica('1', 'Quanto dura uma volta do bastão no anel da escola, em tempos de quadro?', VOLTA63D, 0.005)];

const dia63: Dia = {
  numero: 63,
  ato: 3,
  titulo: 'Sem colisão',
  chamado: [
    'CHAMADO #0063',
    'O Edifício Mirante, no Bairro Norte, ligou os medidores de água e gás dos 8 apartamentos no par de fios do interfone antigo. Às 7 da manhã todos mandam a leitura ao mesmo tempo, em quadros curtos de 100 bits, e quase nada chega.',
    'O síndico quer saber se dá para combinar a vez de cada um em vez de todo mundo gritar junto.',
    'Objetivo: um protocolo livre de colisão no barramento, simulado no horário de pico (G = 1), com vazão acima de 95 %, e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Protocolos livres de colisão e de disputa limitada',
    texto: [
      'ALOHA e CSMA disputam o canal: cada estação arrisca e, se colidir, tenta de novo. Os protocolos livres de colisão fazem o contrário: combinam a vez antes de falar. No mapa de bits (um protocolo de reserva), cada rodada começa com N intervalos curtos de 1 bit, um por estação. Quem tem quadro põe 1 no seu intervalo. Depois, as que reservaram transmitem em ordem, e ninguém colide.',
      'O preço do mapa de bits é a reserva. Com carga alta, todas reservam e cada quadro de d bits paga só 1 bit: eficiência d/(d+1). Com carga baixa, uma estação por rodada, e cada quadro paga os N bits da rodada inteira: d/(d+N). Com muitas estações e pouca conversa, a reserva vira o grosso do canal.',
      'Na passagem de bastão, uma mensagem curta, o bastão (token), circula de estação em estação, num anel ou numa ordem combinada. Só fala quem está com o bastão; quem não tem nada a dizer passa adiante. O custo é a volta do bastão: a propagação pelo anel mais N passagens. A contagem regressiva binária resolve a disputa com menos bits: cada estação transmite o próprio endereço, bit a bit e ao mesmo tempo; o canal faz o OU dos bits, e quem mandou 0 e ouviu 1 desiste. Ganha o maior endereço, e a disputa custa só log2 N bits.',
      'Disputa e reserva brigam bem em cargas diferentes. Com pouca carga, disputar é ótimo: quase ninguém colide e ninguém espera a vez. Com muita carga, reservar é ótimo: nada colide. Os protocolos de disputa limitada pegam o melhor dos dois: dividem as estações em grupos e só deixam disputar um grupo por intervalo, de modo que cada intervalo tenha perto de uma estação pronta.',
      'O percurso adaptativo em árvore faz essa divisão sob medida. As estações são folhas de uma árvore binária. No primeiro intervalo, todas podem falar. Se colidir, no intervalo seguinte só disputa a metade da esquerda; depois, a da direita; e assim descendo, até cada grupo ter uma estação só. Com carga alta, vale começar a busca já de um nível mais baixo da árvore.',
    ],
  },
  dicas: [
    'Simule o barramento como está e veja quanto colide no pico.',
    'Os dois protocolos sem colisão do menu são o mapa de bits e a passagem de bastão. Compare os dois com quadros de 100 bits.',
    `O bastão de 24 bits fica caro com quadros tão curtos (${pct(S63_TOKEN.vazao)}). O mapa de bits no pico dá ${pct(S63_BITMAP.vazao)}.`,
  ],
  perguntas: p63,
  montar: () => {
    const m = novoMundo(363);
    adicionar(m, canal('barramento', CFG63, 'Barramento do interfone do Edifício Mirante'));
    return m;
  },
  objetivo: (m) => {
    const s = est(m, 'barramento');
    const r = ultimoMac(m);
    const agora = simulouAgora(m, 'barramento');
    return [
      item('protocolo livre de colisão (mapa de bits ou bastão)', semColisao(s.protocolo), s.protocolo),
      item('simulado no horário de pico (G = 1 ou mais), com a configuração atual', agora && s.carga >= 1, agora ? `G = ${fmt(s.carga, 2)}` : 'simule de novo depois de mexer'),
      item('vazão acima de 95 % e nenhuma colisão', agora && !!r && r.vazao > 0.95 && r.colisoes === 0, r ? `vazão ${pct(r.vazao)}` : 'ainda não simulou'),
      ...todasRespondidas(m, p63),
    ];
  },
  posMorte: [
    `Com ALOHA, as 8 leituras das 7 da manhã se atropelavam: ${pct(S63_ALOHA.colisoes)} das tentativas colidiam e só ${pct(S63_ALOHA.vazao)} do barramento virava leitura entregue. O problema não era o fio, era a falta de combinado.`,
    `O bastão acabou com as colisões, mas cobra pedágio: um bastão de 24 bits passando por 8 estações custa ${fmt(VOLTA63, 2)} tempos de quadro por volta, quase dois quadros inteiros de 100 bits, e a vazão ficou em ${pct(S63_TOKEN.vazao)}. O mapa de bits, no pico, paga 1 bit por quadro: ${pct(S63_BITMAP.vazao)}. Fora do pico, com um medidor por vez, paga os 8 bits da rodada e fica em ${pct(EF63_BAIXA8)}.`,
    `Se o Mirante fosse um conjunto de 64 apartamentos, o mapa de bits cairia para ${pct(EF63_BAIXA64)} fora do pico. A contagem regressiva binária gastaria só 6 bits por disputa (${pct(EF63_REGRESSIVA64)}), e um percurso em árvore deixaria disputar livremente quando quase ninguém fala. Não existe protocolo campeão: existe o que combina com a carga.`,
  ],
  passos: [
    passo({ ...doCanal('barramento', 'canal-simular'), instrucao: 'Simule o barramento do jeito que está, no horário de pico.', porque: 'O canal está com ALOHA puro e G = 1: em média um quadro tentado por tempo de quadro, somando os 8 medidores. É o caos das 7 da manhã.', feito: `${pct(S63_ALOHA.colisoes)} das tentativas colidem e a vazão fica em ${pct(S63_ALOHA.vazao)}. Disputar com tanta gente pronta ao mesmo tempo não funciona.` }),
    passo({
      ...doCanal('barramento', 'canal-protocolo'),
      pedir: ['p'],
      exemplo: { p: 'token' },
      instrucao: 'Troque para a passagem de bastão.',
      porque: 'Com bastão, só fala quem está com ele, e ele passa de estação em estação. Ninguém colide. O custo é o tempo que o bastão gasta circulando.',
      conferir: (m) => (est(m, 'barramento').protocolo === 'token' ? true : 'Escolha a passagem de bastão (token).'),
      feito: `Zero colisão, mas vazão de ${pct(S63_TOKEN.vazao)}. Cada volta custa ${fmt(VOLTA63, 2)} tempos de quadro: 8 passagens de um bastão de 24 bits com quadros de só 100 bits.`,
    }),
    passo({
      ...doCanal('barramento', 'canal-protocolo'),
      pedir: ['p'],
      exemplo: { p: 'bitmap' },
      instrucao: 'Agora experimente o mapa de bits.',
      porque: 'No mapa de bits, a rodada começa com 8 intervalos de 1 bit, um por medidor. Quem tem leitura marca 1 no seu; depois, cada um que marcou fala na sua vez. Com todos prontos, cada quadro paga só 1 bit de reserva.',
      conferir: (m) => (est(m, 'barramento').protocolo === 'bitmap' ? true : 'Escolha o mapa de bits (bitmap).'),
      feito: `${pct(S63_BITMAP.vazao)} no pico, sem colisão: d/(d+1) = 100/101. Fora do pico, com um medidor por vez, seriam os 8 bits inteiros por quadro: ${pct(EF63_BAIXA8)}.`,
    }),
    passo({ pergunta: '1', exemplo: { resposta: fmt(EF63_BAIXA64 * 100, 1) }, instrucao: 'Com 64 estações e carga baixa, qual seria a eficiência do mapa de bits, em %?', porque: 'Carga baixa: uma estação pronta por rodada, então cada quadro de 100 bits carrega os 64 bits da rodada inteira. Eficiência d/(d+N), vezes 100.', feito: `${fmt(EF63_BAIXA64 * 100, 1)} %. Mais de um terço do canal vira reserva. Com mil estações e pouca conversa, seria pior ainda.` }),
    passo({
      escolha: {
        opcoes: ['1010', '1001', '0100', 'Ninguém: os quatro colidem e recomeçam'],
        certa: 0,
        errada: {
          1: '1001 e 1010 empatam nos dois primeiros bits. No terceiro, 1001 manda 0 e ouve o 1 de 1010, e desiste.',
          2: '0100 manda 0 no primeiro bit e ouve o 1 dos outros: desiste logo de cara.',
          3: 'Na contagem regressiva não há colisão que destrua: o canal faz o OU dos bits e cada estação decide sozinha se continua.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Contagem regressiva binária: as estações 0010, 0100, 1001 e 1010 disputam o canal. Quem ganha?',
      porque: 'Cada uma manda o próprio endereço, do bit mais alto para o mais baixo, todas ao mesmo tempo. O canal faz o OU. Quem mandou 0 e ouviu 1 sabe que tem alguém maior e desiste.',
      feito: 'Ganha 1010, o maior endereço. A disputa custou 4 bits, log2 de 16 estações, em vez dos 16 bits de um mapa de bits.',
    }),
    passo({
      escolha: {
        opcoes: ['3 intervalos', '2 intervalos', '4 intervalos', '8 intervalos, um por estação'],
        certa: 0,
        errada: {
          1: 'No primeiro intervalo a árvore inteira disputa e as duas colidem. Depois disso ainda faltam as duas metades.',
          2: 'Depois da colisão na raiz, a metade da esquerda (0 a 3) só tem a 2 e a da direita (4 a 7) só tem a 5. Não precisa descer mais.',
          3: 'Oito intervalos seria um mapa de bits. A árvore só desce onde há colisão.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Percurso adaptativo em árvore com as estações 0 a 7: só a 2 e a 5 têm quadro. Quantos intervalos até as duas transmitirem?',
      porque: 'Intervalo 1: todas podem falar. Se colidir, intervalo seguinte só a metade da esquerda; depois, a da direita. Cada grupo com uma estação só transmite sem colidir.',
      feito: 'Três: colisão na raiz, a 2 sozinha na esquerda, a 5 sozinha na direita. A árvore separou as duas sem perguntar a cada uma das oito.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Mapa de bits: reservar antes de falar',
        texto: [
          'Cada rodada começa com um intervalo de 1 bit por estação. Quem tem quadro marca 1 no seu. Depois, quem marcou transmite, na ordem.',
          'Com todos prontos, a reserva custa 1 bit por quadro. Com um só pronto, custa a rodada inteira.',
        ],
        visual: { tipo: 'bits', antes: '0 1 0 0 1 0 0 1', depois: 'Q2 Q5 Q8', legenda: 'Rodada de 8 bits de reserva: as estações 2, 5 e 8 marcaram e falam nessa ordem' },
      },
      {
        titulo: 'Passagem de bastão',
        texto: ['Um quadro curto, o bastão, circula pelo anel. Só transmite quem está com ele; quem não tem nada a dizer passa adiante. Ninguém colide, mas a volta do bastão custa tempo de canal.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'Apto 1', x: 300, y: 40 },
            { id: 'b', rotulo: 'Apto 2', x: 500, y: 130 },
            { id: 'c', rotulo: 'Apto 3', x: 300, y: 220 },
            { id: 'd', rotulo: 'Apto 4', x: 100, y: 130 },
          ],
          ligacoes: [
            ['a', 'b', 'bastão'],
            ['b', 'c'],
            ['c', 'd'],
            ['d', 'a'],
          ],
        },
      },
      {
        titulo: 'Contagem regressiva binária',
        texto: ['Todas mandam o endereço ao mesmo tempo, bit a bit. O canal faz o OU. Quem mandou 0 e ouviu 1 desiste. Ganha o maior endereço, e a disputa custa só log2 N bits.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Estação', 'bit 1', 'bit 2', 'bit 3', 'bit 4'],
          linhas: [
            ['0010', '0 (sai)', '', '', ''],
            ['0100', '0 (sai)', '', '', ''],
            ['1001', '1', '0', '0 (sai)', ''],
            ['1010', '1', '0', '1', '0'],
            ['o canal ouve', '1', '0', '1', '0'],
          ],
        },
      },
      {
        titulo: 'Disputa limitada: a árvore',
        texto: [
          'Com pouca carga, disputar é melhor; com muita, reservar. A disputa limitada divide as estações em grupos para que cada intervalo tenha perto de uma pronta.',
          'No percurso em árvore, a colisão na raiz faz a disputa descer para a metade da esquerda, depois para a da direita, até separar todo mundo.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'r', rotulo: 'todas (colide)', x: 300, y: 40 },
            { id: 'e', rotulo: '0 a 3: só a 2', x: 150, y: 130 },
            { id: 'd', rotulo: '4 a 7: só a 5', x: 450, y: 130 },
            { id: 'ok2', rotulo: 'a 2 transmite', x: 150, y: 220 },
            { id: 'ok5', rotulo: 'a 5 transmite', x: 450, y: 220 },
          ],
          ligacoes: [
            ['r', 'e', 'intervalo 2'],
            ['r', 'd', 'intervalo 3'],
            ['e', 'ok2'],
            ['d', 'ok5'],
          ],
        },
      },
      {
        titulo: 'Quem ganha em cada carga',
        texto: ['No barramento do Mirante, com 8 estações, quadros de 100 bits e bastão de 24 bits:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Protocolo', 'Pico (todas prontas)', 'Fora do pico (uma por vez)'],
          linhas: [
            ['ALOHA puro', `${pct(S63_ALOHA.vazao)} (G = 1)`, 'quase sem colisão'],
            ['passagem de bastão', pct(S63_TOKEN.vazao), 'espera o bastão dar a volta'],
            ['mapa de bits', pct(S63_BITMAP.vazao), pct(EF63_BAIXA8)],
            ['mapa de bits com 64 estações', pct(eficienciaBitmap(64, 100, 'alta')), pct(EF63_BAIXA64)],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Mil sensores dividem um canal e quase nunca têm o que dizer. Qual destas opções desperdiça mais canal com reserva?',
      opcoes: ['Mapa de bits', 'Contagem regressiva binária', 'ALOHA com intervalos', 'Todas desperdiçam igual'],
      certa: 0,
      explicacao: 'Com carga baixa, cada quadro do mapa de bits carrega a rodada inteira de reserva: mil bits. A contagem regressiva gasta uns 10 bits (log2 de 1000), e o ALOHA nem reserva: com tão pouca carga, quase não colide.',
    },
  },
  desafio: {
    carta: [
      'O laboratório da escola municipal tem 12 terminais num anel: o cabo sai de um, entra no outro e volta ao primeiro. Alguém configurou ALOHA com intervalos, e no horário do simulado on-line a turma inteira trava.',
      'O anel foi feito para passagem de bastão. Os quadros são de 1000 bits, o bastão tem 24 bits e o sinal leva 0,05 tempo de quadro para dar a volta no anel.',
      'Objetivo: passagem de bastão no anel, simulada no pico (G = 1) com as 12 estações, sem colisão, e a pergunta respondida.',
    ],
    dicas: [
      `Hoje, no pico, o anel entrega ${pct(S63D_INICIO.vazao)}. Troque o protocolo e ajuste a carga para o horário do simulado.`,
      'Volta do bastão = propagação no anel + N passagens do bastão, tudo em tempos de quadro: a + N × 24 / 1000.',
    ],
    perguntas: d63,
    respostas: { '1': fmt(VOLTA63D, 3) },
    montar: () => {
      const m = novoMundo(1363);
      adicionar(m, canal('anel', CFG63D, 'Anel do laboratório da escola municipal'));
      return m;
    },
    objetivo: (m) => {
      const s = est(m, 'anel');
      const r = ultimoMac(m);
      const agora = simulouAgora(m, 'anel');
      return [
        item('passagem de bastão no anel', s.protocolo === 'token', s.protocolo),
        item('simulado no pico (G = 1 ou mais) com as 12 estações e a configuração atual', agora && s.carga >= 1 && s.estacoes === 12, agora ? `G = ${fmt(s.carga, 2)}, ${s.estacoes} estações` : 'simule de novo depois de mexer'),
        item(`sem colisão e vazão perto de ${pct(EF63D)}`, agora && !!r && r.colisoes === 0 && r.vazao > 0.95, r ? `vazão ${pct(r.vazao)}` : 'ainda não simulou'),
        ...todasRespondidas(m, d63),
      ];
    },
    solucao: [
      ['equip', 'anel', 'canal-protocolo', { p: 'token' }],
      ['equip', 'anel', 'canal-carga', { g: '1', n: '12' }],
    ],
  },
};

/* ======================================================================
 * 64: O terminal escondido (4.2.5)
 * ====================================================================== */

const CFG64: Partial<EstadoMac> = { protocolo: 'csma-ca', estacoes: 2, carga: 1, ocultas: true, rtsCts: false };
const S64_OCULTAS = simDe(CFG64);
const S64_VISIVEIS = simDe({ ...CFG64, ocultas: false });
const S64_RTS = simDe({ ...CFG64, rtsCts: true });
const O64_RTS = simularOculto({ estacoes: 2, ocultas: true, rtsCts: true, carga: 1 }, rngSemente(1234));

const p64: Pergunta[] = [numerica('1', 'Com RTS/CTS ligado, quantos por cento dos RTS colidiram no ponto de acesso?', O64_RTS.fracaoRtsColisao * 100, 0.2)];

const CFG64D: Partial<EstadoMac> = { protocolo: 'csma-cd', estacoes: 4, carga: 1.5, ocultas: true, rtsCts: false };
const S64D_CA = simDe({ ...CFG64D, protocolo: 'csma-ca' });
const S64D_RTS = simDe({ ...CFG64D, protocolo: 'csma-ca', rtsCts: true });

const d64: Pergunta[] = [numerica('1', 'Já com CSMA/CA e ainda sem RTS/CTS, quantos por cento dos quadros de dado das câmeras colidem?', S64D_CA.colisoes * 100, 0.2)];

const dia64: Dia = {
  numero: 64,
  ato: 3,
  titulo: 'O terminal escondido',
  chamado: [
    'CHAMADO #0064',
    'O Wi-Fi da praça foi para o coreto. A banca de jornal e a pastelaria ficam em lados opostos, cada uma com o seu terminal de vendas, e as duas enxergam o ponto de acesso, mas o coreto e a fonte ficam no meio: uma não escuta a outra.',
    'No galpão, com os dois terminais na mesma mesa, tudo funcionou. Na praça, mais da metade das vendas some no meio do caminho e o pastel esfria na fila do cartão.',
    'Objetivo: simular a praça como ela é (estações que não se escutam), com RTS/CTS ligado e nenhum quadro de dado colidindo, e responder a pergunta.',
  ],
  manual: {
    titulo: 'LAN sem fio: terminal oculto, terminal exposto e MACA',
    texto: [
      'No cabo, toda estação ouve todas. No rádio, não: o alcance é limitado e obstáculos atrapalham. Pior: o que importa é a interferência no receptor, e quem transmite só escuta o meio onde ele está. O CSMA escuta o meio perto do transmissor, então decide com a informação errada.',
      'Terminal oculto: A e C estão longe uma da outra, mas as duas alcançam o ponto de acesso B. A escuta, não ouve nada, e fala. C escuta, também não ouve nada, e fala. As duas colidem em B, e nenhuma das duas fica sabendo. Terminal exposto é o problema ao contrário: B está mandando para A; C, vizinha de B, quer mandar para D, do outro lado. C ouve B e se cala, embora a transmissão dela chegasse a D sem atrapalhar nada em A.',
      'Detectar colisão, como faz o CSMA/CD, não funciona no rádio por dois motivos. Primeiro, o próprio sinal do transmissor é muitíssimo mais forte que o sinal fraco que chega de longe, então ele não consegue ouvir outra coisa enquanto fala. Segundo, a colisão que importa acontece no receptor, que pode estar longe de quem transmite. Por isso o Wi-Fi usa CSMA/CA: escuta, sorteia um recuo e só então fala, e confirma cada quadro com ACK.',
      'O MACA (acesso múltiplo com prevenção de colisão) faz o receptor falar em voz alta. Antes do dado, A manda um RTS (pedido para enviar), curto, dizendo quanto vai durar. B responde com um CTS (livre para enviar), também curto, com a mesma duração. Quem ouve o CTS está perto do receptor e fica quieto pelo tempo anunciado, mesmo sem ter ouvido o RTS: isso resolve o terminal oculto. Quem ouve o RTS mas não o CTS está longe do receptor e pode falar com outro: isso alivia o terminal exposto.',
      'RTS ainda pode colidir com RTS. Mas um RTS dura uma fração de um quadro de dado: perder um RTS custa pouco, perder um quadro inteiro custa muito. É uma troca de colisões caras por colisões baratas.',
    ],
  },
  dicas: [
    'Simule a praça como está e compare com o teste do galpão, em que os terminais se escutavam.',
    'O que resolve o terminal oculto não é escutar melhor, é o ponto de acesso anunciar a reserva para todos.',
    'No RTS/CTS e terminal oculto: estações que não se escutam (ocultas) e RTS/CTS ligado.',
  ],
  perguntas: p64,
  montar: () => {
    const m = novoMundo(364);
    adicionar(m, canal('praca', CFG64, 'Wi-Fi do coreto da praça'));
    return m;
  },
  objetivo: (m) => {
    const s = est(m, 'praca');
    const r = ultimoMac(m);
    const agora = simulouAgora(m, 'praca');
    return [
      item('a praça como ela é: estações que não se escutam', s.ocultas, s.ocultas ? 'ocultas' : 'se escutam (só no galpão)'),
      item('CSMA/CA com RTS/CTS ligado', s.protocolo === 'csma-ca' && s.rtsCts, `${s.protocolo}, RTS/CTS ${s.rtsCts ? 'ligado' : 'desligado'}`),
      item('simulado com a configuração atual, sem nenhum quadro de dado colidindo', agora && !!r && r.colisoes === 0, r ? `colisões de dado: ${pct(r.colisoes)}` : 'ainda não simulou'),
      ...todasRespondidas(m, p64),
    ];
  },
  posMorte: [
    `No galpão, os dois terminais se escutavam: o CSMA/CA via o meio ocupado e esperava, e só ${pct(S64_VISIVEIS.colisoes)} dos quadros colidiam, quando os dois sorteavam o mesmo recuo. Na praça, com o coreto no meio, cada um achava o meio livre: ${pct(S64_OCULTAS.colisoes)} dos quadros de dado colidiam no ponto de acesso, e a vazão caía para ${pct(S64_OCULTAS.vazao)}.`,
    `Com RTS/CTS, o ponto de acesso passou a anunciar cada reserva. A banca não ouve a pastelaria, mas ouve o CTS do coreto, e fica quieta. Nenhum quadro de dado colidiu, e a vazão subiu para ${pct(S64_RTS.vazao)}. Ainda colidiram ${pct(O64_RTS.fracaoRtsColisao)} dos RTS, mas cada um dura um décimo de um quadro de dado.`,
    'Nos pontos de acesso de verdade, o RTS/CTS costuma ficar desligado para quadros pequenos, porque o próprio RTS e o CTS custam tempo. Vale ligar quando há estações escondidas umas das outras e quadros grandes, como na praça.',
  ],
  passos: [
    passo({ ...doCanal('praca', 'canal-simular'), instrucao: 'Simule a praça como ela é, com os dois terminais escondidos um do outro.', porque: 'O canal usa CSMA/CA, o acesso do Wi-Fi: escuta, sorteia um recuo e fala. Mas a banca e a pastelaria não se escutam; só o ponto de acesso, no coreto, escuta as duas.', feito: `${pct(S64_OCULTAS.colisoes)} dos quadros de dado colidem e a vazão fica em ${pct(S64_OCULTAS.vazao)}. Cada terminal escuta, acha o meio livre e fala por cima do outro.` }),
    passo({
      ...doCanal('praca', 'canal-rts'),
      valores: { ocultas: 'nao', rts: 'nao' },
      instrucao: 'Agora simule como foi o teste no galpão, com os dois terminais se escutando.',
      porque: 'Na mesma mesa, cada terminal ouve o outro transmitindo e espera. Compare para ver o que o coreto mudou.',
      conferir: (m) => (!est(m, 'praca').ocultas ? true : 'No galpão, as estações se escutavam.'),
      feito: `Só ${pct(S64_VISIVEIS.colisoes)} colidem, quando os dois sorteiam o mesmo recuo, e a vazão vai a ${pct(S64_VISIVEIS.vazao)}. O protocolo é o mesmo: o que mudou foi quem escuta quem.`,
    }),
    passo({
      escolha: {
        opcoes: [
          'Quem transmite não consegue ouvir nada enquanto fala, e a colisão acontece no coreto, longe dele',
          'Porque o rádio é mais lento que o cabo',
          'Porque o Wi-Fi não tem quadro, só bits',
          'Funcionaria, mas os terminais são baratos demais',
        ],
        certa: 0,
        errada: {
          1: 'Velocidade não é a questão. Mesmo um rádio rápido não ouve um sinal fraco de longe por cima do próprio sinal, que é muito mais forte.',
          2: 'O Wi-Fi tem quadro, com endereços e CRC, como o Ethernet. O problema é onde a colisão acontece e quem consegue percebê-la.',
          3: 'Não é questão de preço. Mesmo que a banca ouvisse enquanto fala, ela escutaria o meio perto dela, e a colisão é no coreto.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que não usar CSMA/CD na praça, abortando ao detectar colisão, como na Ethernet de cabo?',
      porque: 'No cabo, quem transmite ouve a colisão no próprio fio. No rádio, o próprio sinal abafa o resto, e o que importa é a interferência no receptor.',
      feito: 'Isso. No rádio não dá para ouvir enquanto se fala, e a colisão que importa é no receptor. Por isso o Wi-Fi evita colisão (CA) em vez de detectar (CD).',
    }),
    passo({
      escolha: {
        opcoes: [
          'Não precisava: é o terminal exposto. A transmissão dela chegaria à sorveteria sem atrapalhar o coreto',
          'Precisava: ouviu alguém, então o meio está ocupado para todo mundo',
          'Precisava: senão a pastelaria colide no coreto',
          'É o terminal oculto, igual ao da banca',
        ],
        certa: 0,
        errada: {
          1: 'O meio está ocupado perto dela, não perto da sorveteria. Quem importa é o receptor.',
          2: 'A pastelaria não está falando com o coreto nesse caso. O sinal da banca vai para o outro lado, longe do coreto.',
          3: 'Oculto é quem deveria ter esperado e não esperou. Aqui é o contrário: esperou sem precisar.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A pastelaria manda para o coreto. A banca, vizinha da pastelaria, ouve e se cala, embora quisesse mandar para a sorveteria, do outro lado, longe do coreto. Ela precisava esperar?',
      porque: 'O CSMA decide pelo que se ouve perto do transmissor. Mas a colisão só estraga o quadro no receptor, e a sorveteria não ouve a pastelaria.',
      feito: 'É o terminal exposto: a banca se calou à toa. No MACA, quem ouve o RTS mas não ouve o CTS está longe do receptor e pode falar com outro.',
    }),
    passo({
      ...doCanal('praca', 'canal-rts'),
      pedir: ['ocultas', 'rts'],
      exemplo: { ocultas: 'sim', rts: 'sim' },
      instrucao: 'Volte para a praça de verdade e ligue o RTS/CTS.',
      porque: 'Com RTS/CTS, antes do dado vai um RTS curto e o ponto de acesso responde com um CTS que todos ouvem. Quem ouve o CTS fica quieto pelo tempo anunciado, mesmo sem ter ouvido o RTS.',
      conferir: (m) => {
        const s = est(m, 'praca');
        if (!s.ocultas) return 'Na praça, a banca e a pastelaria não se escutam. Simule a praça como ela é.';
        if (!s.rtsCts) return 'Falta ligar o RTS/CTS.';
        return true;
      },
      feito: `Nenhum quadro de dado colidiu, e a vazão subiu para ${pct(S64_RTS.vazao)}. A reserva anunciada pelo coreto chega a todo mundo.`,
    }),
    passo({ pergunta: '1', exemplo: { resposta: fmt(O64_RTS.fracaoRtsColisao * 100, 1) }, instrucao: 'Quantos por cento dos RTS colidiram?', porque: 'Está na linha "RTS que colidiram" do resultado. Os RTS das duas ainda podem se encontrar no coreto, porque elas continuam sem se escutar.', feito: `${fmt(O64_RTS.fracaoRtsColisao * 100, 1)} %. Colisão continua existindo, só que barata: um RTS dura um décimo de um quadro de dado.` }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Terminal oculto',
        texto: ['A banca e a pastelaria alcançam o coreto, mas não se escutam. Cada uma acha o meio livre, fala, e as duas colidem no coreto sem nenhuma perceber.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'Banca', x: 80, y: 130 },
            { id: 'b', rotulo: 'Coreto (ponto de acesso)', x: 300, y: 130 },
            { id: 'c', rotulo: 'Pastelaria', x: 520, y: 130 },
          ],
          ligacoes: [
            ['a', 'b', 'dado'],
            ['c', 'b', 'dado'],
          ],
        },
      },
      {
        titulo: 'Terminal exposto',
        texto: ['A pastelaria fala com o coreto. A banca, vizinha dela, quer falar com a sorveteria, do outro lado. Ela ouve a pastelaria e se cala, sem necessidade: a sorveteria nem ouve a pastelaria.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'cor', rotulo: 'Coreto', x: 70, y: 130 },
            { id: 'pas', rotulo: 'Pastelaria', x: 230, y: 130 },
            { id: 'ban', rotulo: 'Banca', x: 380, y: 130 },
            { id: 'sor', rotulo: 'Sorveteria', x: 540, y: 130 },
          ],
          ligacoes: [
            ['pas', 'cor', 'falando'],
            ['ban', 'sor', 'calada à toa'],
          ],
        },
      },
      {
        titulo: 'Por que não detectar colisão',
        texto: ['No cabo, quem transmite ouve a colisão no próprio fio e aborta. No rádio, nada disso vale:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Cabo (CSMA/CD)', 'Rádio (CSMA/CA)'],
          linhas: [
            ['ouvir enquanto fala', 'sim', 'não: o próprio sinal abafa o resto'],
            ['onde a colisão importa', 'no fio, que é de todos', 'no receptor, que pode estar longe'],
            ['o que o protocolo faz', 'detecta e aborta', 'evita com recuo, e confirma com ACK'],
          ],
        },
      },
      {
        titulo: 'MACA: RTS e CTS',
        texto: [
          'A banca pede com um RTS curto, dizendo quanto vai durar. O coreto responde com um CTS, que todos ao redor dele ouvem. A pastelaria não ouviu o RTS, mas ouviu o CTS, e fica quieta pelo tempo anunciado.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'Banca', x: 80, y: 130 },
            { id: 'b', rotulo: 'Coreto', x: 300, y: 130 },
            { id: 'c', rotulo: 'Pastelaria (quieta)', x: 520, y: 130 },
          ],
          ligacoes: [
            ['a', 'b', '1. RTS'],
            ['b', 'a', '2. CTS'],
            ['b', 'c', '2. CTS'],
            ['a', 'b', '3. dado'],
          ],
        },
      },
      {
        titulo: 'O que a praça mostrou',
        texto: ['Dois terminais, carga G = 1, CSMA/CA:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Dados que colidem', 'Vazão'],
          linhas: [
            ['se escutam (galpão)', pct(S64_VISIVEIS.colisoes), pct(S64_VISIVEIS.vazao)],
            ['ocultas, sem RTS/CTS', pct(S64_OCULTAS.colisoes), pct(S64_OCULTAS.vazao)],
            ['ocultas, com RTS/CTS', pct(S64_RTS.colisoes), pct(S64_RTS.vazao)],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um terminal ouve o CTS do ponto de acesso, mas não ouviu o RTS que veio antes. O que ele deve fazer?',
      opcoes: ['Ficar quieto pelo tempo anunciado no CTS', 'Transmitir: se não ouviu o RTS, quem pediu está longe', 'Mandar o próprio RTS na mesma hora', 'Ignorar: CTS só vale para quem pediu'],
      certa: 0,
      explicacao: 'Quem ouve o CTS está perto do receptor, e qualquer coisa que ele mandar vai estragar o dado que está para chegar lá. Não ter ouvido o RTS só mostra que ele é oculto em relação a quem pediu.',
    },
  },
  desafio: {
    carta: [
      'A quadra da escola ganhou 4 câmeras sem fio, uma em cada canto, ligadas a um ponto de acesso no alto do ginásio. As arquibancadas ficam no meio: nenhuma câmera ouve as outras.',
      'Quem configurou copiou o acesso do cabo do laboratório e pôs CSMA/CD. As imagens chegam aos pedaços.',
      'Objetivo: o acesso certo para rádio, com a quadra simulada como ela é (câmeras que não se escutam), RTS/CTS ligado, nenhum quadro de dado colidindo, e a pergunta respondida.',
    ],
    dicas: [
      'Primeiro o protocolo: no rádio não dá para detectar colisão, só evitar. Simule e veja quanto ainda colide.',
      'Depois anuncie as reservas pelo ponto de acesso: RTS/CTS, mantendo as câmeras como ocultas.',
    ],
    perguntas: d64,
    respostas: { '1': fmt(S64D_CA.colisoes * 100, 1) },
    montar: () => {
      const m = novoMundo(1364);
      adicionar(m, canal('quadra', CFG64D, 'Wi-Fi das câmeras da quadra'));
      return m;
    },
    objetivo: (m) => {
      const s = est(m, 'quadra');
      const r = ultimoMac(m);
      const agora = simulouAgora(m, 'quadra');
      return [
        item('CSMA/CA, o acesso do rádio', s.protocolo === 'csma-ca', s.protocolo),
        item('câmeras que não se escutam, com RTS/CTS ligado', s.ocultas && s.rtsCts, `${s.ocultas ? 'ocultas' : 'se escutam'}, RTS/CTS ${s.rtsCts ? 'ligado' : 'desligado'}`),
        item(`simulado agora, sem quadro de dado colidindo (vazão perto de ${pct(S64D_RTS.vazao)})`, agora && !!r && r.colisoes === 0 && r.vazao > 0.5, r ? `colisões de dado ${pct(r.colisoes)}, vazão ${pct(r.vazao)}` : 'ainda não simulou'),
        ...todasRespondidas(m, d64),
      ];
    },
    solucao: [
      ['equip', 'quadra', 'canal-protocolo', { p: 'csma-ca' }],
      ['equip', 'quadra', 'canal-rts', { ocultas: 'sim', rts: 'sim' }],
    ],
  },
};

/* ======================================================================
 * 65: Ethernet clássica (4.3.1 e 4.3.2)
 * ====================================================================== */

const CFG65: Partial<EstadoMac> = { protocolo: 'csma-1p', estacoes: 20, carga: 2, a: 0.01 };
const S65_1P = simDe(CFG65);
const S65_CD = simDe({ ...CFG65, protocolo: 'csma-cd' });
const RECUO65 = [2, 4, 8, 16].map((k) => ({ k, r: recuoExponencial(k, rngSemente(65)) }));
const EF65_64 = eficienciaEthernet(10e6, 2500, 512);
const EF65_1024 = eficienciaEthernet(10e6, 2500, 8192);

function montar65(): Mundo {
  const m = novoMundo(365);
  adicionar(m, pc('prof', { modelo: 'Computador da mesa do professor', ttl: 64, ip: ip('192.0.2.65/24') }));
  adicionar(m, comutador('hub', { tipo: 'hub', modelo: 'Hub de 10 Mb/s, herdeiro do coaxial do laboratório', velocidades: [10], portas: 4 }));
  adicionar(m, pc('aluno', { modelo: 'Computador da bancada 7', ttl: 64, ip: ip('192.0.2.66/24') }));
  adicionar(m, canal('barramento', CFG65, 'Simulador do barramento do laboratório'));
  ligar(m, { equip: 'prof', porta: 'eth0' }, { equip: 'hub', porta: 'p1' }, 'cat5e', 6, { id: 'c1' });
  ligar(m, { equip: 'hub', porta: 'p2' }, { equip: 'aluno', porta: 'eth0' }, 'cat5e', 9, { id: 'c2' });
  m.proxCabo = 3;
  return m;
}
const MAC65_PROF = montar65().equipamentos.get('prof')!.mac;

const p65: Pergunta[] = [
  macDe('1', 'Qual o endereço MAC de origem do quadro capturado?', 'prof'),
  numerica('2', 'Num quadro de 64 bytes (do endereço de destino ao CRC), quantos bytes sobram para os dados?', 46, 0),
  numerica('3', 'Depois da 3ª colisão seguida, qual o maior número de intervalos que a placa pode sortear para esperar?', 7, 0),
];

function montar65d(): Mundo {
  const m = novoMundo(1365);
  adicionar(m, pc('bib-1', { modelo: 'Terminal da biblioteca da escola', ttl: 64, ip: ip('192.0.2.70/24') }));
  adicionar(m, comutador('hub', { tipo: 'hub', modelo: 'Hub de 10 Mb/s da biblioteca', velocidades: [10], portas: 4 }));
  adicionar(m, pc('bib-2', { modelo: 'Impressora de etiquetas com placa de rede', ttl: 64, ip: ip('192.0.2.71/24') }));
  adicionar(m, canal('barramento', { protocolo: 'aloha', estacoes: 30, carga: 1.5, a: 0.01 }, 'Simulador do barramento da biblioteca'));
  ligar(m, { equip: 'bib-1', porta: 'eth0' }, { equip: 'hub', porta: 'p1' }, 'cat5e', 4, { id: 'c1' });
  ligar(m, { equip: 'hub', porta: 'p3' }, { equip: 'bib-2', porta: 'eth0' }, 'cat5e', 12, { id: 'c2' });
  m.proxCabo = 3;
  return m;
}
const MAC65D_DESTINO = montar65d().equipamentos.get('bib-2')!.mac;
const S65D_ALOHA = simDe({ protocolo: 'aloha', estacoes: 30, carga: 1.5, a: 0.01 });
const S65D_CD = simDe({ protocolo: 'csma-cd', estacoes: 30, carga: 1.5, a: 0.01 });

const d65: Pergunta[] = [
  macDe('1', 'Qual o endereço MAC de destino do quadro capturado?', 'bib-2'),
  numerica('2', 'Depois da 5ª colisão seguida, qual o maior número de intervalos que a placa pode sortear?', 31, 0),
];

const dia65: Dia = {
  numero: 65,
  ato: 3,
  titulo: 'Ethernet clássica',
  chamado: [
    'CHAMADO #0065',
    'O laboratório da escola tem 20 computadores numa Ethernet de 10 Mb/s que já foi coaxial e hoje passa por um hub, que repete tudo para todos como o cabo antigo fazia. Quando a turma inteira baixa a apostila, o laboratório para.',
    'O técnico anterior desligou a detecção de colisão no simulador das placas "porque a luz vermelha assustava os alunos".',
    'Objetivo: ping do professor para a bancada 7 sem perda, um quadro capturado e lido, o barramento simulado com CSMA/CD e as três perguntas respondidas.',
  ],
  manual: {
    titulo: 'A Ethernet clássica: cabo, quadro, endereço e CSMA/CD',
    texto: [
      'A Ethernet clássica era um cabo coaxial só, em que todas as estações penduravam, a 10 Mb/s. O cabo grosso (10Base5) aceitava segmentos de até 500 m, com a placa presa por um transceptor que furava o cabo. O fino (10Base2) era mais barato e dobrável, com conector em T, mas cada segmento ia só até 185 m. Para ir mais longe, repetidores ligavam segmentos, regenerando o sinal bit a bit: no máximo 2500 m e 4 repetidores entre duas estações quaisquer. O hub é o herdeiro disso: um repetidor com várias portas.',
      'Os bits iam no cabo em codificação Manchester: cada bit tem uma transição no meio, para cima para 1 e para baixo para 0. Assim o receptor tira o relógio do próprio sinal e nunca confunde uma sequência longa de zeros com cabo desligado. O preço é gastar o dobro de transições por bit.',
      'O quadro começa com 8 bytes de preâmbulo (10101010 repetido, terminando em 10101011) para os relógios se acertarem. Depois vêm o endereço de destino e o de origem, de 6 bytes cada; 2 bytes de tipo (o EtherType, como 0x0800 para IPv4) ou, no formato antigo, de tamanho, que fica sempre abaixo de 1500; de 46 a 1500 bytes de dados, com enchimento se faltar; e 4 bytes de CRC. Do destino ao CRC, o quadro tem de 64 a 1518 bytes.',
      'O endereço MAC tem 6 bytes: os 3 primeiros identificam o fabricante, e os 3 últimos, a placa. O bit mais baixo do primeiro byte diz se é unicast (0, uma placa só) ou multicast (1, um grupo). Tudo em 1, FF:FF:FF:FF:FF:FF, é broadcast: todas as placas aceitam. O bit logo acima dele diz se o endereço é administrado localmente, como nas placas do laboratório, que começam com 02.',
      'O acesso é CSMA/CD 1-persistente: escuta, fala assim que o cabo vagar e, se ouvir colisão, aborta e manda um sinal de reforço. Depois da i-ésima colisão, a placa sorteia um número entre 0 e 2^i - 1 e espera esse tanto de intervalos de 51,2 µs (recuo binário exponencial). A janela para de crescer em 1023, depois da 10ª colisão, e na 16ª a placa desiste. O intervalo de 51,2 µs explica o quadro mínimo: no pior caso, 2500 m com 4 repetidores, a notícia da colisão leva quase isso para ir e voltar, e a 10 Mb/s são 512 bits, ou 64 bytes. Um quadro menor terminaria antes de a colisão ser percebida.',
    ],
  },
  dicas: [
    'Faça o ping do professor para a bancada e depois capture o quadro no próprio computador do professor.',
    'Do destino ao CRC: 6 + 6 + 2 + dados + 4 bytes. A janela depois da i-ésima colisão vai de 0 a 2^i - 1.',
    'No barramento, escolha o CSMA/CD. As respostas são o MAC do professor, 46 e 7.',
  ],
  perguntas: p65,
  montar: montar65,
  objetivo: (m) => {
    const s = est(m, 'barramento');
    const r = ultimoMac(m);
    const agora = simulouAgora(m, 'barramento');
    return [
      pingOk(m, 'prof', '192.0.2.66'),
      item('barramento simulado com CSMA/CD, com a configuração atual', s.protocolo === 'csma-cd' && agora, agora && r ? `${s.protocolo}, vazão ${pct(r.vazao)}` : 'simule com a configuração atual'),
      ...todasRespondidas(m, p65),
    ];
  },
  posMorte: [
    `O quadro capturado tinha tudo no lugar: o MAC da bancada 7 no destino, o do professor (${MAC65_PROF}) na origem e o EtherType 0x0800, que avisa que dentro vai IPv4. O hub nem olhou para isso; só repetiu os bits para todas as portas, como o coaxial fazia.`,
    `Sem detecção de colisão, a placa 1-persistente ia até o fim de cada quadro estragado, e com a turma toda baixando a apostila só ${pct(S65_1P.vazao)} do barramento virava dado. Com CSMA/CD, a colisão é abortada nos primeiros bits e o recuo exponencial espalha as tentativas: ${pct(S65_CD.vazao)}. No simulador, quando ${RECUO65[3]!.k} placas colidem juntas, levam em média ${fmt(RECUO65[3]!.r.intervalos, 1)} intervalos para todas passarem, contra ${fmt(RECUO65[0]!.r.intervalos, 1)} com só ${RECUO65[0]!.k}.`,
    `O quadro mínimo de 64 bytes também cobra o seu preço. Com cabo de 2500 m a 10 Mb/s, quadros mínimos aproveitam só ${pct(EF65_64)} do cabo com muitas estações disputando; quadros de 1024 bytes, ${pct(EF65_1024)}. Quanto maior o quadro em relação ao cabo, menos tempo se perde disputando.`,
  ],
  passos: [
    passo({
      ...doPc('prof', 'ping'),
      valores: { destino: '192.0.2.66', n: '4' },
      instrucao: 'Faça um ping do computador do professor para a bancada 7.',
      porque: 'O ping gera quadros Ethernet de verdade no laboratório. O hub repete cada um para todas as portas, como o coaxial antigo, e a placa da bancada 7 aceita os que têm o MAC dela no destino.',
      conferir: (m) => (pingOk(m, 'prof', '192.0.2.66').ok ? true : 'O ping não voltou inteiro.'),
      feito: 'Respondido sem perda. Antes do primeiro pedido de eco, o professor perguntou por broadcast quem tinha 192.0.2.66, e a bancada respondeu com o próprio MAC.',
    }),
    passo({ ...doPc('prof', 'capturar'), instrucao: 'Veja o último quadro capturado.', porque: 'A captura mostra o cabeçalho Ethernet: MAC de destino, MAC de origem e o EtherType, que diz o que vai dentro.', feito: 'Destino, origem e EtherType 0x0800 (IPv4). O preâmbulo e o CRC não aparecem: a placa tira os dois antes de entregar o quadro.' }),
    passo({ pergunta: '1', exemplo: { resposta: MAC65_PROF }, instrucao: 'Qual o MAC de origem do quadro?', porque: 'Está na linha Ethernet da captura, depois de "origem". São 6 bytes: os 3 primeiros do fabricante, os 3 últimos da placa.', feito: `${MAC65_PROF}. O 02 no primeiro byte tem o bit de administração local ligado e o de multicast desligado: endereço unicast, atribuído pela escola.` }),
    passo({
      escolha: {
        opcoes: ['FF:FF:FF:FF:FF:FF', '00:00:00:00:00:00', 'O MAC da bancada 7', '01:00:5E:00:00:01'],
        certa: 0,
        errada: {
          1: 'Tudo em zero não é endereço de ninguém. Broadcast é tudo em um.',
          2: 'Se o professor soubesse o MAC da bancada, nem precisaria perguntar.',
          3: 'Esse tem o bit de multicast ligado, mas é de um grupo específico. Para todas as placas, é tudo em um.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Para perguntar quem tem 192.0.2.66, o professor mandou um quadro para todas as placas. Qual o MAC de destino?',
      porque: 'Um endereço com o bit mais baixo do primeiro byte em 1 é de grupo (multicast). Com todos os 48 bits em 1, o grupo é todo mundo.',
      feito: 'FF:FF:FF:FF:FF:FF, o broadcast. Toda placa do laboratório leu aquele quadro, e só a bancada 7 respondeu.',
    }),
    passo({ pergunta: '2', exemplo: { resposta: '46' }, instrucao: 'Num quadro de 64 bytes, quantos bytes sobram para os dados?', porque: 'Do destino ao CRC: 6 de destino, 6 de origem, 2 de tipo e 4 de CRC. O resto é dado. Se o dado for menor, a placa completa com enchimento.', feito: '46 bytes. Um pacote menor que isso ganha enchimento para chegar lá, porque o quadro precisa durar o bastante para a colisão ser percebida.' }),
    passo({ pergunta: '3', exemplo: { resposta: '7' }, instrucao: 'Depois da 3ª colisão seguida, qual o maior número de intervalos que a placa pode sortear?', porque: 'Depois da i-ésima colisão, a placa sorteia entre 0 e 2^i - 1 intervalos de 51,2 µs. A cada colisão a janela dobra.', feito: '7: a placa sorteia de 0 a 7. Dobrar a janela espalha as placas rápido quando muitas disputam, sem fazer ninguém esperar muito quando são poucas.' }),
    passo({
      ...doCanal('barramento', 'canal-protocolo'),
      pedir: ['p'],
      exemplo: { p: 'csma-cd' },
      instrucao: 'No simulador do barramento, ligue de novo a detecção de colisão.',
      porque: 'Sem detecção, a placa 1-persistente transmite o quadro inteiro mesmo depois de colidir. Com CSMA/CD, ela aborta logo, manda o reforço e sorteia o recuo.',
      conferir: (m) => (est(m, 'barramento').protocolo === 'csma-cd' ? true : 'Escolha o CSMA/CD, o acesso da Ethernet clássica.'),
      feito: `De ${pct(S65_1P.vazao)} para ${pct(S65_CD.vazao)}, com a turma inteira disputando. A luz vermelha voltou, e era ela que salvava o laboratório.`,
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O cabo da Ethernet clássica',
        texto: ['Um cabo para todos, a 10 Mb/s. Repetidores ligam segmentos, mas entre duas estações cabem no máximo 4 repetidores e 2500 m.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Nome', 'Cabo', 'Segmento máximo', 'Estações por segmento'],
          linhas: [
            ['10Base5', 'coaxial grosso', '500 m', '100'],
            ['10Base2', 'coaxial fino', '185 m', '30'],
            ['10Base-T', 'par trançado até o hub', '100 m', '1 por porta'],
          ],
        },
      },
      {
        titulo: 'Manchester',
        texto: ['Cada bit tem uma transição no meio: de baixo para cima é 1, de cima para baixo é 0. O receptor tira o relógio do sinal, ao custo do dobro de transições.'],
        visual: { tipo: 'bits', antes: '1 0 1 1 0', depois: '01 10 01 01 10', legenda: 'Cada bit vira meio bit baixo e meio alto (1) ou o contrário (0)' },
      },
      {
        titulo: 'O quadro',
        texto: ['Do destino ao CRC, de 64 a 1518 bytes. O campo de 2 bytes é tipo (EtherType, de 0x0600 para cima) ou tamanho (até 1500).'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Bytes', 'Para quê'],
          linhas: [
            ['preâmbulo', '8', 'acertar os relógios (10101010... 10101011)'],
            ['destino', '6', 'quem deve aceitar'],
            ['origem', '6', 'quem mandou'],
            ['tipo ou tamanho', '2', '0x0800 = IPv4'],
            ['dados e enchimento', '46 a 1500', 'o pacote, completado até 46'],
            ['CRC', '4', 'detectar erro'],
          ],
        },
      },
      {
        titulo: 'Endereço MAC',
        texto: ['6 bytes: fabricante e placa. Bit mais baixo do primeiro byte em 1 é grupo; tudo em 1 é todo mundo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tipo', 'Exemplo', 'Quem aceita'],
          linhas: [
            ['unicast', MAC65_PROF, 'só aquela placa'],
            ['multicast', '01:00:5E:00:00:01', 'as placas do grupo'],
            ['broadcast', 'FF:FF:FF:FF:FF:FF', 'todas as placas'],
          ],
        },
      },
      {
        titulo: 'CSMA/CD e recuo exponencial',
        texto: [
          'Colidiu: aborta, sorteia de 0 a 2^i - 1 intervalos de 51,2 µs e tenta de novo. Os 51,2 µs são a ida e volta do pior caso (2500 m, 4 repetidores): 512 bits, por isso o quadro mínimo de 64 bytes.',
          'No simulador, quando k placas colidem juntas:',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Placas', 'Colisões em média', 'Intervalos até todas passarem'],
          linhas: RECUO65.map(({ k, r }) => [String(k), fmt(r.colisoes, 1), fmt(r.intervalos, 1)]),
        },
      },
    ],
    checagem: {
      pergunta: 'Por que a Ethernet clássica exige quadros de pelo menos 64 bytes?',
      opcoes: [
        'Para o quadro durar mais que a ida e volta no cabo e a placa ainda estar transmitindo quando a colisão for percebida',
        'Porque o CRC precisa de 64 bytes para funcionar',
        'Para caber o preâmbulo',
        'Porque o hub não repete quadros menores',
      ],
      certa: 0,
      explicacao: 'Se o quadro acabasse antes de a notícia da colisão voltar, a placa acharia que deu tudo certo. A 10 Mb/s, os 51,2 µs da ida e volta no pior caso são 512 bits: 64 bytes.',
    },
  },
  desafio: {
    carta: [
      'Na biblioteca da escola, um terminal e a impressora de etiquetas dividem um hub antigo com mais 28 aparelhos. Alguém configurou o simulador do barramento com ALOHA puro "porque é mais simples", e no recreio nada imprime.',
      `Hoje, com G = 1,5, o barramento entrega ${pct(S65D_ALOHA.vazao)}.`,
      'Objetivo: ping do terminal para a impressora sem perda, o quadro capturado e lido, o barramento simulado com o acesso da Ethernet clássica e as duas perguntas respondidas.',
    ],
    dicas: [
      'O quadro capturado fica no terminal que fez o ping. O destino é a primeira coisa da linha Ethernet.',
      `A janela depois da i-ésima colisão vai de 0 a 2^i - 1. E o acesso da Ethernet clássica dá ${pct(S65D_CD.vazao)} nesse barramento.`,
    ],
    perguntas: d65,
    respostas: { '1': MAC65D_DESTINO, '2': '31' },
    montar: montar65d,
    objetivo: (m) => {
      const s = est(m, 'barramento');
      const r = ultimoMac(m);
      const agora = simulouAgora(m, 'barramento');
      return [
        pingOk(m, 'bib-1', '192.0.2.71'),
        item('barramento simulado com CSMA/CD, com a configuração atual', s.protocolo === 'csma-cd' && agora, agora && r ? `${s.protocolo}, vazão ${pct(r.vazao)}` : 'simule com a configuração atual'),
        ...todasRespondidas(m, d65),
      ];
    },
    solucao: [
      ['equip', 'bib-1', 'ping', { destino: '192.0.2.71', n: '4' }],
      ['equip', 'bib-1', 'capturar'],
      ['equip', 'barramento', 'canal-protocolo', { p: 'csma-cd' }],
    ],
  },
};

export const ATO3B: Dia[] = [dia63, dia64, dia65];
