// Dias do ato 7 (O Cerco), com prática guiada, aula e desafio no próprio dia.
// Chave pública (8.6), certificados (8.8) e VPN com Wi-Fi seguro (8.10),
// no centro de operações de Fim de Linha, à noite.

import { adicionar, aparelho, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { cifrarRsa, deHex, gerarChavesRsa, paraHex, parX25519, x25519 } from '../motor/cripto';
import { associarWifi, cadeiaDoServidor, DICIONARIO_PEQUENO, wifiDe } from '../motor/seguranca';
import { historicoDe, SOBRA_ESP } from '../motor/filtro';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Registro = Record<string, any>;

/** Tudo que o motor anotou de um tipo neste dia (m.flags.historico), do mais antigo para o mais novo. */
function hist(m: Mundo, k: string): Registro[] {
  return historicoDe(m, k);
}

function cripto(m: Mundo, op: string, f: (x: Registro) => boolean = () => true): Registro | undefined {
  return [...hist(m, 'cripto')].reverse().find((x) => x.op === op && f(x));
}

/* ======================================================================
 * ref 123: Chave pública (8.6). As assinaturas e os resumos (8.7) estão em ato7d.ts.
 * ====================================================================== */

const RSA_AULA = gerarChavesRsa(61n, 53n);
const MSG_AULA = 65n;
const C_AULA = cifrarRsa(MSG_AULA, RSA_AULA.publica).resultado;

const RSA_DES = gerarChavesRsa(47n, 59n);
const MSG_DES = 1234n;

/** Vetor de teste do X25519 (RFC 7748, seção 6.1), calculado pelo motor. */
const X_ALICE = parX25519(deHex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'));
const X_BOB = parX25519(deHex('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb'));
const X_SEGREDO_A = paraHex(x25519(X_ALICE.privada, X_BOB.publica));
const X_SEGREDO_B = paraHex(x25519(X_BOB.privada, X_ALICE.publica));
const curto = (h: string) => `${h.slice(0, 12)}...${h.slice(-6)}`;

/** Dígitos decimais de um número de 2048 bits: piso de 2048 × log10(2), mais 1. */
const DIGITOS_2048 = Math.floor(2048 * Math.log10(2)) + 1;

function rsaFeito(m: Mundo, n: bigint): Registro | undefined {
  return cripto(m, 'rsa', (x) => x.n === String(n) && x.decifrado !== undefined && x.cifrado !== x.decifrado);
}

function itemRsa(m: Mundo, n: bigint, texto: string): ItemObjetivo {
  const r = rsaFeito(m, n);
  return item(texto, !!r, r ? `n = ${r.n}, e = ${r.e}, d = ${r.d}, cifrado ${r.cifrado}, decifrado ${r.decifrado}` : 'ainda não calculado com esses primos');
}

const d123: Pergunta[] = [
  numerica('1', `Com p = 61, q = 53 e e = ${RSA_AULA.e}, qual é o expoente privado d?`, Number(RSA_AULA.d), 0),
  numerica('2', 'Uma chave de curva elíptica de quantos bits dá a mesma segurança de um RSA de 3072 bits?', 256, 0),
];

const d123D: Pergunta[] = [
  numerica('1', `Com p = 47, q = 59 e e = ${RSA_DES.e}, qual é o expoente privado d da cooperativa?`, Number(RSA_DES.d), 0),
  numerica('2', 'Quantos dígitos decimais tem um n de 2048 bits?', DIGITOS_2048, 0),
];

const dia123: Dia = {
  numero: 123,
  ato: 7,
  titulo: 'Chave pública',
  chamado: [
    'CHAMADO #0123',
    'A cooperativa quer receber pela rede as propostas de 40 fornecedores, cifradas. Com cifra simétrica, cada fornecedor precisaria combinar antes uma chave secreta com a tesouraria, em mãos, e a lista de 40 chaves guardada lá viraria o alvo preferido de quem ronda a cidade.',
    'O centro de operações propõe outra coisa: a tesouraria publica uma chave que qualquer um usa para cifrar, e só ela consegue abrir o que foi cifrado.',
    `Objetivo: montar um RSA pequeno com p = 61 e q = 53, cifrar e decifrar a mensagem ${MSG_AULA}, responder o d e responder quantos bits de curva elíptica dão a segurança de um RSA de 3072 bits.`,
  ],
  manual: {
    titulo: 'Chave pública: RSA, tamanhos de verdade e curvas elípticas',
    texto: [
      'Toda cifra simétrica tem um calcanhar: as duas pontas precisam da mesma chave, e essa chave precisa viajar por algum lugar antes de a conversa começar. Com n pessoas que querem falar duas a duas, são n(n - 1)/2 chaves: 100 pessoas pedem 4950 chaves entregues em mãos. A criptografia de chave pública resolve isso com um par: uma chave pública, que vai para quem quiser, e uma privada, que nunca sai de casa. O que uma cifra, só a outra decifra, e saber a pública não ajuda a descobrir a privada. A ideia pede uma conta fácil num sentido e impossível no outro, a não ser para quem sabe um segredo: uma função de mão única com alçapão.',
      `O RSA faz isso com aritmética. Escolha dois primos, p e q, e multiplique: n = p × q. Calcule φ(n) = (p - 1)(q - 1). Escolha e sem fator comum com φ(n) e ache d tal que e × d deixe resto 1 na divisão por φ(n) (o algoritmo de Euclides estendido faz isso). A chave pública é (n, e); a privada é (n, d). Cifrar é c = m^e mod n; decifrar é m = c^d mod n, e funciona porque m^(e × d) volta a ser m módulo n. Com p = 61 e q = 53: n = ${RSA_AULA.n}, φ(n) = ${RSA_AULA.phi}, e = ${RSA_AULA.e} e d = ${RSA_AULA.d}; a mensagem ${MSG_AULA} vira ${C_AULA} e volta a ${MSG_AULA}. Quem conhece só n e e precisaria fatorar n para chegar a φ(n) e daí a d.`,
      `Tudo depende de fatorar ser difícil, e é por isso que os números da aula não protegem nada: ${RSA_AULA.n} se fatora de cabeça. Tentar todos os divisores até a raiz de n leva cerca de 2^(bits/2) divisões; o melhor algoritmo conhecido, o crivo geral de corpos de números, é muito mais rápido que isso e ainda assim cresce depressa demais. O maior RSA de desafio fatorado em público tinha 829 bits e consumiu milhares de anos de processador. No mundo real, n tem 2048 bits, uns ${DIGITOS_2048} dígitos decimais, com p e q de 1024 bits cada, sorteados e conferidos por um teste de primalidade (Miller-Rabin, com várias rodadas). O e quase sempre é 65537 = 2^16 + 1, que tem só dois bits 1: cifrar e conferir custam 17 multiplicações. Para os órgãos de padrão, RSA de 2048 bits equivale a 112 bits de segurança simétrica, e 3072 bits a 128. Duas ressalvas: o RSA de livro, como o da aula, é determinístico e maleável, então na prática a mensagem passa por um enchimento aleatório antes (OAEP, RFC 8017); e um computador quântico grande o bastante fatoraria n depressa, o que já move os padrões para algoritmos pós-quânticos, baseados em reticulados.`,
      'O RSA não é o único. Uma das primeiras propostas de chave pública foi a cifra da mochila: escolher, numa lista de pesos, os que somam um total dado é difícil em geral e fácil para uma lista especial, que a chave privada esconde dentro da pública. Ela foi quebrada poucos anos depois, e ficou o lembrete de que "parece difícil" não é prova de nada. Quem tomou espaço foram as curvas elípticas: os pontos de uma curva y² = x³ + ax + b, com as contas feitas módulo um primo, formam um grupo em que somar pontos é fácil e desfazer a multiplicação de um ponto por um número (o logaritmo discreto na curva) é difícil. Como não se conhece atalho parecido com o crivo, as chaves ficam muito menores: 256 bits de curva dão a segurança de 3072 bits de RSA. O X25519 (RFC 7748) é a troca de chaves de Diffie-Hellman sobre uma dessas curvas, com chaves de 32 bytes, e é o que o TLS 1.3 negocia quase sempre.',
      'Chave pública é lenta: uma exponenciação RSA de 2048 bits custa milhares de vezes mais que cifrar um bloco de AES. Por isso, na prática, ninguém cifra o grosso com ela. O par de chaves serve para combinar ou transportar uma chave de sessão (com RSA ou com X25519), e quem cifra a conversa inteira é uma cifra simétrica, como o AES-GCM. A mesma assimetria serve para provar autoria, aplicando a chave privada em vez da pública: é a assinatura, assunto da próxima noite.',
    ],
  },
  dicas: [
    'A conta está na tesouraria: "RSA pequeno", com p = 61, q = 53 e a mensagem 65.',
    `O d sai na linha "d = ..." do RSA: é o número que, multiplicado por ${RSA_AULA.e}, deixa resto 1 na divisão por ${RSA_AULA.phi}.`,
    'Para a curva elíptica, a tabela de equivalência dos órgãos de padrão: 128 bits de segurança pedem 3072 bits de RSA e o dobro de 128 bits de curva.',
  ],
  perguntas: d123,
  montar: () => mundoCooperativa(7123),
  objetivo: (m) => [
    itemRsa(m, RSA_AULA.n, `RSA com p = 61 e q = 53 (n = ${RSA_AULA.n}), cifrando e decifrando de volta`),
    ...todasRespondidas(m, d123),
  ],
  posMorte: [
    `O RSA da aula fez o caminho inteiro: n = ${RSA_AULA.n}, φ(n) = ${RSA_AULA.phi}, e = ${RSA_AULA.e}, d = ${RSA_AULA.d}, e a mensagem ${MSG_AULA} foi a ${C_AULA} com a chave pública e voltou com a privada. A tesouraria pode publicar (n, e) num cartaz na praça: quem quiser mandar proposta cifra com ela, e ninguém além da tesouraria abre.`,
    `Mas não com esses números. ${RSA_AULA.n} é 61 × 53, e quem fatora acha φ(n) e d em segundos. A chave de verdade da tesouraria tem n de 2048 bits, ${DIGITOS_2048} dígitos, e e = 65537; fatorar isso está fora do alcance de qualquer um, e é só isso que a segurança do RSA promete. Se um dia a fatoração ficar fácil, por matemática nova ou por computador quântico, toda chave RSA cai junto.`,
    'As curvas elípticas fazem o mesmo serviço com chaves de 256 bits, e o X25519 é o jeito mais comum de duas pontas combinarem uma chave de sessão hoje. Em qualquer dos casos, a chave pública só abre a porta: quem atravessa com a conversa é uma cifra simétrica. Falta resolver o outro lado da moeda, provar quem escreveu, e é para isso que a próxima noite usa a chave privada.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Combinar uma chave secreta com cada parceiro exige que ela viaje antes; com par de chaves, a pública pode ir para todo mundo',
          'Cifra simétrica é fácil de quebrar, e a de chave pública não',
          'Chave pública dispensa a cifra simétrica de vez',
          'Chave pública é mais rápida que a simétrica',
        ],
        certa: 0,
        errada: {
          1: 'Uma cifra simétrica moderna, como o AES, é tão forte quanto se queira. O problema não é a força, é como a chave chega até o outro lado.',
          2: 'Na prática, as duas trabalham juntas: a chave pública combina uma chave de sessão, e a simétrica cifra o grosso.',
          3: 'É bem mais lenta, milhares de vezes. Por isso ela só combina a chave de sessão, e a simétrica cifra o resto.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes das contas: que problema a criptografia de chave pública resolve?',
      porque: 'A tesouraria fala com 40 fornecedores. Entregar um segredo diferente em mãos para cada um não escala, e a lista de segredos vira alvo.',
      feito: 'Com um par de chaves, a pública vai para quem quiser (até para quem ataca) e a privada fica em casa. Nada secreto precisa viajar.',
    }),
    passo({
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-rsa',
      pedir: ['p', 'q', 'm'],
      exemplo: { p: '61', q: '53', m: String(MSG_AULA) },
      instrucao: `Na tesouraria, monte um RSA com p = 61 e q = 53 e cifre a mensagem ${MSG_AULA}.`,
      porque: 'Cada passo do RSA aparece na saída: n, φ(n), a escolha de e, o Euclides estendido que acha d e a exponenciação que cifra e decifra.',
      conferir: (m) => {
        if (rsaFeito(m, RSA_AULA.n)) return true;
        const r = cripto(m, 'rsa');
        if (r) return `Esse RSA deu n = ${r.n}. Para o exercício, p = 61 e q = 53, n = ${RSA_AULA.n}.`;
        return 'O RSA ainda não rodou. Os dois números precisam ser primos e diferentes, e a mensagem menor que p × q.';
      },
      feito: `n = ${RSA_AULA.n}, φ(n) = ${RSA_AULA.phi}, e = ${RSA_AULA.e}, d = ${RSA_AULA.d}. A mensagem ${MSG_AULA} virou ${C_AULA} com a pública e voltou a ${MSG_AULA} com a privada.`,
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: String(RSA_AULA.d) },
      instrucao: 'Qual é o expoente privado d?',
      porque: `d é o inverso de e módulo φ(n): e × d deixa resto 1 na divisão por ${RSA_AULA.phi}. Sem saber φ(n), isto é, sem fatorar n, não há como achá-lo.`,
      feito: `${RSA_AULA.e} × ${RSA_AULA.d} = ${RSA_AULA.e * RSA_AULA.d}, que é ${(RSA_AULA.e * RSA_AULA.d) / RSA_AULA.phi} × ${RSA_AULA.phi} + 1. É por isso que m^(e × d) volta a ser m.`,
    }),
    passo({
      escolha: {
        opcoes: [
          `Nada, com esses números: ${RSA_AULA.n} = 61 × 53 se fatora de cabeça, e daí saem φ(n) e d; a proteção só vem com n de 2048 bits`,
          'O e é secreto, então ninguém consegue calcular d',
          'O d viaja cifrado com AES',
          `${RSA_AULA.n} é primo, e primo não se fatora`,
        ],
        certa: 0,
        errada: {
          1: 'O e faz parte da chave pública e vai para todo mundo. O que protege d é não se conseguir fatorar n.',
          2: 'O d nunca viaja: ele fica na tesouraria. O risco é alguém recalculá-lo a partir de n.',
          3: `Se n fosse primo, não haveria p e q. ${RSA_AULA.n} é 61 × 53, por construção.`,
        },
      },
      exemplo: { resposta: '0' },
      instrucao: `Quem escuta a rede conhece n = ${RSA_AULA.n} e e = ${RSA_AULA.e}. O que o impede de achar d?`,
      porque: 'A chave pública é pública de verdade: a pergunta é o que separa quem tem só ela de quem tem a privada.',
      feito: `Nada, aqui. Com n de 2048 bits, ${DIGITOS_2048} dígitos, a mesma conta exige uma fatoração que ninguém sabe fazer em tempo útil. O RSA é exatamente tão seguro quanto fatorar é difícil.`,
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '256' },
      instrucao: 'Uma chave de curva elíptica de quantos bits dá a segurança de um RSA de 3072 bits?',
      porque: 'Para a curva não se conhece atalho como o crivo que acelera a fatoração. A regra prática é a chave de curva ter o dobro dos bits de segurança.',
      feito: 'Duzentos e cinquenta e seis. Os dois dão 128 bits de segurança, a mesma do AES-128, e a chave de curva é doze vezes menor.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Combinar uma chave de sessão entre duas pontas, sem ela passar pelo fio',
          'Assinar documentos',
          'Cifrar a conversa inteira no lugar do AES',
          'Resumir mensagens, como o SHA-256',
        ],
        certa: 0,
        errada: {
          1: 'Com a mesma curva existe um esquema de assinatura (o Ed25519), mas o X25519 é só a troca de chaves.',
          2: 'Chave pública é lenta demais para cifrar tudo. O X25519 produz um segredo comum de 32 bytes, e dele sai a chave da cifra simétrica.',
          3: 'Resumo não tem chave nenhuma. O X25519 é uma troca de Diffie-Hellman numa curva elíptica.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O X25519 é a curva elíptica que o TLS 1.3 mais usa. Para quê?',
      porque: 'Cada ponta sorteia uma privada, publica a pública e combina a sua privada com a pública da outra. O vetor de teste do padrão está na aula.',
      feito: `Para combinar a chave de sessão. No vetor da RFC 7748, as duas pontas chegam ao mesmo segredo, ${curto(X_SEGREDO_A)}, sem que ele passe pela rede.`,
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Uma chave para fechar, outra para abrir',
        texto: ['A pública vai para todo mundo, até para quem ataca. A privada nunca sai de casa. O que uma cifra, só a outra abre.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'forn', rotulo: 'fornecedor', x: 90, y: 60 },
            { id: 'pub', rotulo: 'chave pública (n, e)', x: 300, y: 40 },
            { id: 'tes', rotulo: 'tesouraria (guarda d)', x: 510, y: 60 },
            { id: 'meio', rotulo: 'quem escuta: vê n, e e c', x: 300, y: 200 },
          ],
          ligacoes: [
            ['forn', 'pub', 'pega a pública'],
            ['pub', 'tes', 'publicada'],
            ['forn', 'meio', 'c = m^e mod n'],
            ['meio', 'tes', 'só d abre'],
          ],
        },
      },
      {
        titulo: 'RSA passo a passo',
        texto: ['Dois primos, um produto e um inverso. Toda a segurança está em não conseguir voltar de n para p e q.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Passo', 'Conta', 'Valor'],
          linhas: [
            ['primos', 'p e q', '61 e 53'],
            ['módulo', 'n = p × q', String(RSA_AULA.n)],
            ['φ(n)', '(p - 1)(q - 1)', String(RSA_AULA.phi)],
            ['pública', 'e sem fator comum com φ(n)', String(RSA_AULA.e)],
            ['privada', 'e × d deixa resto 1 por φ(n)', String(RSA_AULA.d)],
            ['cifrar', `${MSG_AULA}^${RSA_AULA.e} mod ${RSA_AULA.n}`, String(C_AULA)],
            ['decifrar', `${C_AULA}^${RSA_AULA.d} mod ${RSA_AULA.n}`, String(MSG_AULA)],
          ],
        },
      },
      {
        titulo: 'Tamanhos de verdade',
        texto: ['Chaves de tipos diferentes com a mesma segurança, segundo a tabela de equivalência dos órgãos de padrão. A curva cresce devagar; o RSA, depressa.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Segurança', 'Simétrica', 'RSA', 'Curva elíptica'],
          linhas: [
            ['112 bits', 'triplo DES', '2048 bits', '224 bits'],
            ['128 bits', 'AES-128', '3072 bits', '256 bits'],
            ['192 bits', 'AES-192', '7680 bits', '384 bits'],
            ['256 bits', 'AES-256', '15360 bits', '512 bits'],
          ],
        },
      },
      {
        titulo: 'X25519, de verdade',
        texto: ['O vetor de teste da RFC 7748, calculado pelo motor do jogo. Cada ponta combina a própria privada com a pública da outra, e as duas chegam ao mesmo segredo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Alice', 'Bob'],
          linhas: [
            ['privada (32 bytes, nunca sai)', curto(paraHex(X_ALICE.privada)), curto(paraHex(X_BOB.privada))],
            ['pública (vai pela rede)', curto(paraHex(X_ALICE.publica)), curto(paraHex(X_BOB.publica))],
            ['segredo calculado', curto(X_SEGREDO_A), curto(X_SEGREDO_B)],
          ],
        },
      },
      {
        titulo: 'Outros algoritmos',
        texto: ['Cada esquema de chave pública aposta num problema difícil. Quando o problema deixa de ser difícil, o esquema cai.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Esquema', 'Problema difícil', 'Situação'],
          linhas: [
            ['RSA', 'fatorar n = p × q', 'em uso, 2048 bits ou mais'],
            ['curvas elípticas (X25519)', 'logaritmo discreto na curva', 'em uso, chaves de 256 bits'],
            ['mochila', 'achar os pesos que somam um total', 'quebrada pouco depois de publicada'],
            ['reticulados', 'achar o vetor curto numa grade', 'pós-quântico, entrando agora'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: `Por que o RSA da aula, com n = ${RSA_AULA.n}, não protege nada, mesmo com todas as contas certas?`,
      opcoes: [
        'Porque n se fatora em segundos, e de p e q saem φ(n) e d',
        'Porque e = 17 é pequeno demais',
        'Porque a mensagem 65 é pequena demais',
        'Porque o RSA só funciona com chave de curva elíptica',
      ],
      certa: 0,
      explicacao: `A segurança do RSA é exatamente a dificuldade de fatorar n. ${RSA_AULA.n} = 61 × 53, e com isso qualquer um calcula φ(n) = ${RSA_AULA.phi} e d = ${RSA_AULA.d}. O e pode ser pequeno (o padrão é 65537), e o tamanho da mensagem não muda nada. Com n de 2048 bits, a mesma conta exige uma fatoração que ninguém sabe fazer.`,
    },
  },
  desafio: {
    carta: [
      `A cooperativa vai publicar a própria chave para os fornecedores: os primos guardados no cofre são p = 47 e q = 59. Antes, quer ver a chave funcionando com a mensagem ${MSG_DES}.`,
      'E quer saber, para o cartaz da praça, quão grande é o n da chave de verdade, a de 2048 bits.',
      'Objetivo: o RSA da cooperativa cifrando e decifrando, com o d respondido, e o número de dígitos decimais de um n de 2048 bits.',
    ],
    dicas: [
      `"RSA pequeno" na tesouraria com p = 47, q = 59 e m = ${MSG_DES}; o d aparece na saída.`,
      'Cada bit vale log10(2), perto de 0,301 dígito decimal.',
      '2048 × 0,30103 dá perto de 616,5; arredonde para cima.',
    ],
    perguntas: d123D,
    montar: () => mundoCooperativa(8123),
    objetivo: (m) => [itemRsa(m, RSA_DES.n, `RSA da cooperativa (p = 47, q = 59, n = ${RSA_DES.n}), cifrando e decifrando`), ...todasRespondidas(m, d123D)],
    solucao: [['equip', 'tesouraria', 'sg-rsa', { p: '47', q: '59', m: String(MSG_DES) }]],
    respostas: { '1': String(RSA_DES.d), '2': String(DIGITOS_2048) },
  },
};

/** Tesouraria e escritório da cooperativa numa rede pequena, com o roteador do centro de operações. */
function mundoCooperativa(semente: number): Mundo {
  const m = novoMundo(semente);
  m.flags.seguranca = true;
  adicionar(m, pc('tesouraria', { ip: cidr('192.168.7.10/24'), gateway: '192.168.7.1', modelo: 'Estação da tesouraria da cooperativa' }));
  adicionar(m, pc('escritorio', { ip: cidr('192.168.7.20/24'), gateway: '192.168.7.1', modelo: 'Estação do escritório da cooperativa' }));
  adicionar(m, roteador('r-coop', { modelo: 'Roteador da cooperativa', interfaces: { lan: '192.168.7.1/24', wan: '198.51.100.21/30' } }));
  adicionar(m, comutador('sw-coop', { portas: 8 }));
  ligar(m, { equip: 'tesouraria', porta: 'eth0' }, { equip: 'sw-coop', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'escritorio', porta: 'eth0' }, { equip: 'sw-coop', porta: 'p2' }, 'cat6', 5);
  ligar(m, { equip: 'sw-coop', porta: 'p8' }, { equip: 'r-coop', porta: 'lan' }, 'cat6', 5);
  return m;
}

/* ======================================================================
 * ref 124: Certificados (8.8)
 * ====================================================================== */

const PORTAL = 'www.prefeitura.exemplo';
const URL_PORTAL = `https://${PORTAL}/`;
/** O dia do mundo quando ninguém mexe no relógio (diaDoMundo). */
const HOJE = 200;
/** A cadeia que o portal apresenta com o certificado em dia: folha, intermediária e raiz (RFC 5280). */
const CADEIA_OK = cadeiaDoServidor(PORTAL, 'valido', HOJE);
const FOLHA = CADEIA_OK[0]!;
const INTER = CADEIA_OK[1]!;
const RAIZ = CADEIA_OK[2]!;
const VENCIDO_ATE = cadeiaDoServidor(PORTAL, 'vencido', HOJE)[0]!.validoAte;

/**
 * Rede da prefeitura: o balcão de atendimento e o resolvedor ficam na rede de dentro (192.168.1.0/24); o portal da
 * prefeitura (DNS e web de prefeitura.exemplo) fica no data center, atrás do r-dc, em 203.0.113.0/24.
 */
function mundoPortal(semente: number, https?: string): Mundo {
  const m = novoMundo(semente);
  m.flags.aplicacao = true;
  m.flags.seguranca = true;
  const host = (nome: string, ip: string, gw: string, modelo: string) => adicionar(m, pc(nome, { ip: cidr(ip), gateway: gw, modelo }));
  host('atendimento', '192.168.1.10/24', '192.168.1.1', 'Estação do balcão de atendimento');
  host('dns1', '192.168.1.53/24', '192.168.1.1', 'Resolvedor de DNS da prefeitura');
  host('portal', '203.0.113.10/24', '203.0.113.1', 'Servidor do portal da prefeitura');
  adicionar(m, roteador('r-pref', { modelo: 'Roteador da prefeitura', interfaces: { p1: '192.168.1.1/24', p2: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('r-dc', { modelo: 'Roteador do data center', interfaces: { p1: '198.51.100.2/30', p2: '203.0.113.1/24' }, rotas: [{ destino: '192.168.1.0/24', via: '198.51.100.1' }] }));
  adicionar(m, comutador('sw', { portas: 8 }));
  adicionar(m, comutador('sw-dc', { portas: 8 }));
  ligar(m, { equip: 'atendimento', porta: 'eth0' }, { equip: 'sw', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'dns1', porta: 'eth0' }, { equip: 'sw', porta: 'p2' }, 'cat6', 5);
  ligar(m, { equip: 'sw', porta: 'p8' }, { equip: 'r-pref', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r-pref', porta: 'p2' }, { equip: 'r-dc', porta: 'p1' }, 'cat6', 80);
  ligar(m, { equip: 'r-dc', porta: 'p2' }, { equip: 'sw-dc', porta: 'p8' }, 'cat6', 5);
  ligar(m, { equip: 'portal', porta: 'eth0' }, { equip: 'sw-dc', porta: 'p1' }, 'cat6', 5);
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('portal').servicos = {
    dns: { zona: 'prefeitura.exemplo', registros: [{ nome: 'www', tipo: 'A', valor: '203.0.113.10', ttl: 300 }] },
    web: { paginas: { '/': { conteudo: '<h1>Portal da Prefeitura de Fim de Linha</h1><p>Segunda via do IPTU e agendamento.</p>' } }, ...(https ? { https } : {}) },
  };
  s('dns1').servicos = { dns: { zona: 'fimdelinha.exemplo', recursivo: true, registros: [{ nome: 'balcao', tipo: 'A', valor: '192.168.1.10' }] } };
  for (const n of ['atendimento', 'portal']) s(n).dns = '192.168.1.53';
  return m;
}

/** Tentativas de navegação https que pararam pelo certificado, por motivo da cadeia. */
function paradasPor(m: Mundo, motivo: string): boolean {
  return hist(m, 'tls').some((t) => t.ok === false && t.cadeia === motivo && t.nome === PORTAL);
}

function cadeiaValida(m: Mundo): Registro | undefined {
  return cripto(m, 'cadeia', (x) => x.valida === true && x.nome === PORTAL);
}

function cadeiaRevogada(m: Mundo): Registro | undefined {
  return cripto(m, 'cadeia', (x) => x.valida === false && x.motivo === 'revogado' && x.nome === PORTAL);
}

const d124: Pergunta[] = [
  numerica('1', `Qual é o número de série do certificado de ${PORTAL}, o número que a AC põe na lista de revogados?`, FOLHA.serie, 0),
];

const d124D: Pergunta[] = [
  numerica('1', 'O certificado válido que ficou no portal vale até que dia?', FOLHA.validoAte, 0),
  numerica('2', 'Quantos certificados a cadeia válida do portal tem, contando a folha e a raiz?', CADEIA_OK.length, 0),
];

const dia124: Dia = {
  numero: 124,
  ato: 7,
  titulo: 'Certificados',
  chamado: [
    'CHAMADO #0124',
    `Moradores ligaram de madrugada: o portal da prefeitura, ${PORTAL}, abriu com um aviso vermelho do navegador, e alguns clicaram em "continuar" e digitaram a senha. O certificado do portal venceu e ninguém renovou.`,
    'Antes de renovar, o centro de operações quer entender a corrente inteira: quem garante que aquela chave pública é mesmo da prefeitura, o que vai escrito dentro de um certificado, o que o navegador confere, elo por elo, e como um certificado deixa de valer antes da hora.',
    'Objetivo: conferir a cadeia válida do portal até a raiz, conferir a mesma cadeia com o certificado revogado, responder o número de série que vai para a lista de revogados e ver o navegador do balcão parar diante do certificado vencido.',
  ],
  manual: {
    titulo: 'Quem garante a chave pública',
    texto: [
      'A chave pública resolve a distribuição de segredos, mas cria outro problema: como saber que a chave que chegou é mesmo de quem diz? Se o atacante está no meio, ele troca a chave do portal pela dele quando o navegador pede, decifra tudo, lê e cifra de novo com a chave verdadeira. As duas pontas acham que conversam entre si. É o homem no meio, e matemática nenhuma resolve isso sozinha: falta alguém que amarre o nome à chave.',
      `O certificado faz essa amarração: um documento que diz "esta chave pública pertence a ${PORTAL}", assinado por uma autoridade certificadora (AC). O formato é o X.509 versão 3 (RFC 5280), campo a campo: versão (v3, que no arquivo vale 2); número de série, único entre os certificados daquela AC (o do portal é ${FOLHA.serie}); algoritmo da assinatura (sha256WithRSAEncryption: resumo SHA-256 assinado com RSA); emissor (${FOLHA.emissor}); validade, com "não antes de" e "não depois de"; sujeito, o dono; a chave pública do sujeito (RSA de 2048 bits, e = 65537); e as extensões. As que mais importam: nomes alternativos do sujeito (SAN), a lista de nomes DNS que o certificado cobre e que o navegador compara com o endereço; basicConstraints, que diz se o certificado é de AC (CA:TRUE, pode assinar outros) ou não (CA:FALSE, o caso do portal); e keyUsage, para que a chave serve (assinatura digital, assinar certificados, assinar listas de revogados). A assinatura da AC cobre todos os campos: mexeu em um, não confere.`,
      `Ninguém confia numa AC só porque ela diz. A infraestrutura de chave pública (PKI) é uma árvore: uma AC raiz assina as intermediárias, as intermediárias assinam os servidores. A raiz assina a si mesma e fica guardada fora de linha; quem trabalha no dia a dia é a intermediária, para que um vazamento nela não derrube a raiz. As raízes vêm instaladas no navegador e no sistema: são as âncoras de confiança. O servidor manda a folha e a intermediária, e o navegador sobe a cadeia: o nome bate? Cada certificado está na validade? Não foi revogado? Quem emitiu é mesmo o próximo da cadeia, e é AC? Cada assinatura confere com a chave pública de quem está acima? A raiz é uma das âncoras? No portal: ${FOLHA.sujeito}, emitido por ${INTER.sujeito} (válida até o dia ${INTER.validoAte}), emitida por ${RAIZ.sujeito} (até o dia ${RAIZ.validoAte}).`,
      'Chave privada vaza, servidor é roubado, empresa fecha: por isso existe revogação, a AC desfazendo a própria assinatura antes da validade. Do jeito antigo, a AC publica uma lista de certificados revogados (CRL), assinada, com o emissor e o número de série de cada um, e o navegador baixa a lista inteira. Do jeito novo, o navegador pergunta só por um número de série a um respondedor OCSP (RFC 6960), que devolve "bom", "revogado" ou "desconhecido", assinado. Perguntar a cada visita é lento e conta à AC que sites você visita; no grampeamento OCSP (a extensão status_request do TLS, RFC 6066), o próprio servidor busca a resposta assinada de tempos em tempos e a entrega no aperto de mão. E a transparência de certificados (RFC 6962), em linhas gerais: toda AC publica cada certificado que emite em registros públicos, só de acréscimo, e o navegador exige o recibo desse registro. Quem emite um certificado errado para o seu domínio, por erro ou ataque, aparece ali, e o dono do domínio pode vigiar.',
      `Vencido, autoassinado, de outro nome ou revogado: em qualquer desses o navegador para e avisa, antes de mandar o pedido, o cookie ou a senha. Ele não tem como distinguir descuido de ataque, e é por isso que avisa igual. Hoje é dia ${HOJE} no jogo, e o certificado esquecido do portal valia até o dia ${VENCIDO_ATE}.`,
    ],
  },
  dicas: [
    '"Conferir uma cadeia de certificados" está no atendimento; "Ligar HTTPS" está no portal.',
    'Na cadeia revogada, o número de série aparece na linha da folha: "série ...".',
    `Com o portal servindo o certificado vencido, abra ${URL_PORTAL} no atendimento: o navegador precisa parar.`,
  ],
  perguntas: d124,
  montar: () => mundoPortal(7124),
  objetivo: (m) => [
    item(`cadeia de ${PORTAL} conferida até a raiz, e válida`, !!cadeiaValida(m), cadeiaValida(m) ? 'válida' : 'ainda não conferida'),
    item(`cadeia de ${PORTAL} com o certificado revogado conferida, e recusada`, !!cadeiaRevogada(m), cadeiaRevogada(m) ? 'recusada: revogado' : 'ainda não conferida'),
    item('o navegador do atendimento parou diante do certificado vencido do portal', paradasPor(m, 'vencido'), paradasPor(m, 'vencido') ? 'parou: certificado vencido' : 'ainda não'),
    ...todasRespondidas(m, d124),
  ],
  posMorte: [
    `O aviso vermelho estava certo. O certificado do portal valia até o dia ${VENCIDO_ATE} e hoje é dia ${HOJE}: o navegador subiu a cadeia, viu a validade vencida e parou antes de mandar o pedido. Quem clicou em "continuar" mandou a senha para um servidor que podia ser qualquer um; a prefeitura pediu a essas pessoas que troquem a senha. Certificado vencido quase sempre é descuido, mas, para o navegador, descuido e ataque têm a mesma cara.`,
    `A cadeia válida mostrou a corrente inteira: ${FOLHA.sujeito} (série ${FOLHA.serie}, CA:FALSE) assinado por ${INTER.sujeito}, assinada por ${RAIZ.sujeito}, que já vem instalada em todo navegador da cidade. Com o certificado revogado, tudo conferia (nome, validade, assinaturas) e mesmo assim a cadeia caiu: a série ${FOLHA.serie} estava na lista de revogados da intermediária. É esse número que a AC publica na CRL ou responde pelo OCSP.`,
    'O certificado novo do portal saiu da mesma intermediária, com o nome no SAN, e o servidor passou a grampear a resposta OCSP no aperto de mão. A equipe também começou a vigiar os registros de transparência de certificados: se alguém emitir um certificado para prefeitura.exemplo sem ela saber, aparece ali.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Entrega a própria chave pública no lugar da do portal e fica com as duas conversas, decifrando e cifrando de novo',
          'Quebra a cifra do portal na força bruta',
          'Apaga os pacotes do portal e nada mais',
          'Nada: com chave pública não há homem no meio',
        ],
        certa: 0,
        errada: {
          1: 'Não precisa quebrar nada. Se o navegador aceita qualquer chave que chega, o atacante entrega a dele e o navegador cifra para o atacante, feliz.',
          2: 'Apagar só derruba a conversa. O perigo do homem no meio é a conversa continuar, passando por ele.',
          3: 'É exatamente com chave pública que ele aparece: a chave viaja pela rede, e quem está no caminho pode trocá-la.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Sem certificado, o que faz um atacante no meio do caminho quando o navegador pede a chave pública do portal?',
      porque: 'O certificado só faz sentido como resposta a esse ataque.',
      feito: 'Ele troca a chave. Por isso a chave precisa vir amarrada ao nome pela assinatura de alguém em quem o navegador já confia: a AC.',
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-cadeia',
      valores: { nome: PORTAL, tipo: 'valido' },
      instrucao: `No atendimento, confira a cadeia do certificado válido de ${PORTAL}.`,
      porque: 'A saída mostra cada verificação do navegador, na ordem: nome, validade, revogação, quem emitiu e a assinatura de cada elo, e a raiz entre as âncoras.',
      conferir: (m) => (cadeiaValida(m) ? true : 'A cadeia válida do portal ainda não foi conferida.'),
      feito: `Folha (série ${FOLHA.serie}) assinada pela ${INTER.sujeito}, que foi assinada pela ${RAIZ.sujeito}, que está no repositório de raízes confiáveis. A confiança desce da âncora até o servidor.`,
    }),
    passo({
      escolha: {
        opcoes: [
          'basicConstraints com CA:FALSE',
          'O número de série',
          'O algoritmo de assinatura',
          'A validade',
        ],
        certa: 0,
        errada: {
          1: 'A série só identifica o certificado (é ela que vai para a lista de revogados). Não diz o que o dono pode fazer.',
          2: 'O algoritmo diz como a AC assinou este certificado, não se o dono pode assinar outros.',
          3: 'A validade diz até quando vale, não para quê.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que campo do X.509 impede o dono do certificado do portal de usá-lo para emitir certificados para outros sites?',
      porque: 'Se qualquer folha pudesse assinar outras, quem tivesse o certificado de um site qualquer viraria AC.',
      feito: 'Na extensão basicConstraints, a intermediária e a raiz têm CA:TRUE e o portal tem CA:FALSE. O navegador recusa a cadeia em que alguém sem CA:TRUE assinou outro certificado. O keyUsage completa: o portal só assina o aperto de mão, não certificados nem listas de revogados.',
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-cadeia',
      valores: { nome: PORTAL },
      pedir: ['tipo'],
      exemplo: { tipo: 'revogado' },
      instrucao: 'Confira de novo a cadeia do portal, agora com o certificado que a AC revogou.',
      porque: 'Revogado é o caso mais traiçoeiro: nome, validade e assinaturas estão todos certos.',
      conferir: (m) => {
        if (cadeiaRevogada(m)) return true;
        const c = cripto(m, 'cadeia');
        if (c && c.tipo !== 'revogado') return `Essa foi a cadeia com o certificado ${c.tipo}. Escolha o revogado.`;
        return 'A cadeia revogada ainda não foi conferida.';
      },
      feito: `Nome e validade passaram, e a série ${FOLHA.serie} estava na lista de revogados da ${INTER.sujeito}. A cadeia caiu ali, antes de qualquer assinatura.`,
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: String(FOLHA.serie) },
      instrucao: 'Qual é o número de série do certificado do portal?',
      porque: 'A CRL não guarda nomes, guarda pares emissor e número de série. O OCSP também pergunta pela série.',
      feito: `Série ${FOLHA.serie}, emitida pela ${INTER.sujeito}. Cada AC garante que não repete série; por isso o par emissor e série identifica um certificado no mundo inteiro.`,
    }),
    passo({
      alvo: ['equip', 'portal'],
      acao: 'ap-servico-https',
      pedir: ['tipo'],
      exemplo: { tipo: 'vencido' },
      instrucao: 'No portal, ligue o HTTPS com o certificado que está lá de verdade: o vencido.',
      porque: 'Reproduzir o problema no laboratório é o primeiro passo para ter certeza de qual é.',
      conferir: (m) => {
        const w = (m.equipamentos.get('portal')!.s.servicos as Registro | undefined)?.web?.https;
        if (w === 'vencido') return true;
        return w ? `O portal está com o certificado ${w}. O esquecido é o "vencido".` : 'O HTTPS do portal ainda não foi ligado.';
      },
      feito: `HTTPS na porta 443, com um certificado que valia até o dia ${VENCIDO_ATE}.`,
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'ap-navegar-https',
      valores: { url: URL_PORTAL },
      instrucao: `No atendimento, abra ${URL_PORTAL}.`,
      porque: 'O navegador faz o aperto de mão do TLS, recebe a cadeia e confere tudo antes de mandar qualquer byte do pedido.',
      conferir: (m) => {
        if (paradasPor(m, 'vencido')) return true;
        const t = m.flags.tls as Registro | undefined;
        if (t?.ok) return 'A página abriu sem aviso: o portal está com outro certificado. Volte o passo anterior para o vencido.';
        return 'A navegação https até o portal ainda não foi tentada.';
      },
      feito: 'AVISO DO NAVEGADOR e nada de pedido. O aperto de mão até aconteceu, mas a cadeia falhou na validade, e o navegador parou antes de mandar caminho, cookie ou senha.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O homem no meio troca a chave',
        texto: ['Sem nada que amarre nome a chave, quem está no caminho entrega a própria chave pública no lugar da verdadeira e fica com as duas conversas.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'nav', rotulo: 'navegador', x: 80, y: 120 },
            { id: 'atk', rotulo: 'atacante no meio', x: 300, y: 120 },
            { id: 'srv', rotulo: 'portal', x: 520, y: 120 },
          ],
          ligacoes: [
            ['nav', 'atk', 'recebe a chave do atacante'],
            ['atk', 'srv', 'recebe a chave do portal'],
          ],
        },
      },
      {
        titulo: 'Dentro de um certificado X.509',
        texto: ['Tudo acima da assinatura é assinado pela AC: mexeu num campo, a assinatura não confere.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'No certificado do portal'],
          linhas: [
            ['versão', 'v3 (vale 2 no arquivo)'],
            ['número de série', String(FOLHA.serie)],
            ['algoritmo de assinatura', 'sha256WithRSAEncryption'],
            ['emissor', FOLHA.emissor],
            ['validade', `do dia ${FOLHA.validoDe} ao ${FOLHA.validoAte}`],
            ['sujeito e SAN', PORTAL],
            ['chave pública', 'RSA de 2048 bits, e = 65537'],
            ['basicConstraints e keyUsage', 'CA:FALSE; assinatura digital'],
          ],
        },
      },
      {
        titulo: 'A cadeia até a âncora',
        texto: ['O navegador sobe elo por elo até uma raiz que já vem instalada. Se a raiz não é uma das âncoras, a cadeia não vale nada.'],
        visual: { tipo: 'camadas', camadas: [`${RAIZ.sujeito}: âncora no navegador, CA:TRUE, até o dia ${RAIZ.validoAte}`, `${INTER.sujeito}: assinada pela raiz, CA:TRUE, até o dia ${INTER.validoAte}`, `${PORTAL}: assinado pela intermediária, CA:FALSE`], rotulo: 'PKI' },
      },
      {
        titulo: 'Revogar antes da hora',
        texto: ['Três jeitos de saber se a AC desfez a assinatura, e um registro público para pegar quem emite errado.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mecanismo', 'Como funciona', 'Custo'],
          linhas: [
            ['CRL', 'lista assinada de pares emissor e série, baixada inteira', 'lista grande, atualizada de tempos em tempos'],
            ['OCSP (RFC 6960)', 'pergunta por uma série: bom, revogado ou desconhecido', 'uma consulta por visita, e a AC fica sabendo'],
            ['grampeamento OCSP', 'o servidor entrega a resposta assinada no aperto de mão', 'nenhuma consulta do navegador'],
            ['transparência (RFC 6962)', 'todo certificado emitido vai para registros públicos', 'o dono do domínio vigia'],
          ],
        },
      },
      {
        titulo: 'Os quatro avisos',
        texto: ['Em todos eles o navegador para antes de mandar o pedido. Ignorar o aviso é escolha de quem usa, e quase sempre má escolha.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Certificado', 'O que falhou', 'O que pode ser'],
          linhas: [
            ['vencido', 'a validade', 'descuido na renovação, ou chave antiga reaproveitada'],
            ['autoassinado', 'a raiz não é âncora', 'alguém se passando pelo site'],
            ['de outro nome', 'o sujeito não bate com o endereço', 'certificado de outro site, ou desvio'],
            ['revogado', 'a série está na CRL, ou o OCSP diz revogado', 'a chave privada vazou'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um certificado foi emitido corretamente, está na validade e o nome bate, mas o navegador recusa dizendo que foi revogado. O que aconteceu?',
      opcoes: [
        'A AC declarou que o certificado não vale mais, em geral porque a chave privada vazou',
        'O certificado venceu',
        'O certificado é autoassinado',
        'O servidor está fora do ar',
      ],
      certa: 0,
      explicacao: 'Revogação é a AC desfazendo a própria assinatura antes da hora: o par emissor e série entra na lista de revogados, ou a consulta OCSP responde "revogado". Venceu e autoassinado são outros avisos, e servidor fora do ar nem chega ao certificado.',
    },
  },
  desafio: {
    carta: [
      `A empresa que cuida do portal "consertou" o certificado três vezes esta noite, e cada vez o aviso mudou. Agora ${PORTAL} está com um certificado autoassinado, gerado às pressas no próprio servidor.`,
      'O centro de operações quer cada problema visto e entendido no balcão, e o portal de volta com um certificado válido, com a validade e o tamanho da cadeia anotados na ficha.',
      'Objetivo: ver o navegador parar com o certificado autoassinado, com o de outro nome e com o revogado; deixar o portal com o certificado válido e a página aberta; e responder até que dia ele vale e quantos certificados a cadeia tem.',
    ],
    dicas: [
      'Alterne: no portal, "Ligar HTTPS" com cada tipo de certificado; no atendimento, abra a página segura depois de cada troca.',
      'O último certificado é o válido, e a página precisa abrir sem aviso.',
      'A validade e os elos aparecem na saída da página aberta, ou em "Conferir uma cadeia de certificados" no atendimento.',
    ],
    perguntas: d124D,
    montar: () => mundoPortal(8124, 'autoassinado'),
    objetivo: (m) => {
      const cfg = (m.equipamentos.get('portal')!.s.servicos as Registro | undefined)?.web?.https;
      const t = m.flags.tls as Registro | undefined;
      const h = m.flags.http as Registro | undefined;
      const aberto = cfg === 'valido' && !!t?.ok && t.nome === PORTAL && !!h?.ok && h.https === true;
      return [
        item('o navegador parou com o certificado autoassinado', paradasPor(m, 'raiz-desconhecida')),
        item('o navegador parou com o certificado de outro nome', paradasPor(m, 'nome')),
        item('o navegador parou com o certificado revogado', paradasPor(m, 'revogado')),
        item(`${PORTAL} com o certificado válido e a página segura aberta sem aviso`, aberto, `certificado ${cfg ?? 'nenhum'}${t ? `, último TLS ${t.ok ? 'válido' : 'com aviso'}` : ''}`),
        ...todasRespondidas(m, d124D),
      ];
    },
    solucao: [
      ['equip', 'atendimento', 'ap-navegar-https', { url: URL_PORTAL }],
      ['equip', 'portal', 'ap-servico-https', { tipo: 'nome-errado' }],
      ['equip', 'atendimento', 'ap-navegar-https', { url: URL_PORTAL }],
      ['equip', 'portal', 'ap-servico-https', { tipo: 'revogado' }],
      ['equip', 'atendimento', 'ap-navegar-https', { url: URL_PORTAL }],
      ['equip', 'portal', 'ap-servico-https', { tipo: 'valido' }],
      ['equip', 'atendimento', 'ap-navegar-https', { url: URL_PORTAL }],
    ],
    respostas: { '1': String(FOLHA.validoAte), '2': String(CADEIA_OK.length) },
  },
};

/* ======================================================================
 * ref 125: VPN e Wi-Fi seguro (8.10)
 * ====================================================================== */

const MTU_TUNEL = 1500 - SOBRA_ESP;
const SEGREDO_VPN = 'Frase-longa-da-represa-2026';
const DESTINO_VPN = '192.168.2.10';

/**
 * Centro de operações de Fim de Linha (192.168.1.0/24, atrás da borda-fdl) e a sala de controle da represa
 * (192.168.2.0/24, atrás da borda-represa), ligadas pela rede do provedor, que só conhece os endereços públicos.
 * Num hub do provedor, um curioso escuta tudo que passa.
 */
function mundoTunel(semente: number): Mundo {
  const m = novoMundo(semente);
  m.flags.seguranca = true;
  adicionar(m, pc('operacoes', { ip: cidr('192.168.1.10/24'), gateway: '192.168.1.1', modelo: 'Estação do centro de operações' }));
  adicionar(m, pc('represa', { ip: cidr('192.168.2.10/24'), gateway: '192.168.2.1', modelo: 'Painel da sala de controle da represa' }));
  adicionar(m, pc('curioso', { ip: cidr('198.51.100.11/29'), gateway: '198.51.100.9', modelo: 'Máquina de alguém na rede do provedor' }));
  adicionar(m, roteador('borda-fdl', { modelo: 'Roteador de borda do centro de operações', interfaces: { lan: '192.168.1.1/24', wan: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('provedor', { modelo: 'Roteador do provedor regional', interfaces: { p1: '198.51.100.2/30', p2: '198.51.100.9/29' } }));
  adicionar(m, roteador('borda-represa', { modelo: 'Roteador de borda da represa', interfaces: { wan: '198.51.100.10/29', lan: '192.168.2.1/24' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.9' }] }));
  adicionar(m, comutador('hub-provedor', { tipo: 'hub', portas: 4, modelo: 'Hub velho no armário do provedor' }));
  ligar(m, { equip: 'operacoes', porta: 'eth0' }, { equip: 'borda-fdl', porta: 'lan' }, 'cat6', 5);
  ligar(m, { equip: 'borda-fdl', porta: 'wan' }, { equip: 'provedor', porta: 'p1' }, 'cat6', 50);
  ligar(m, { equip: 'provedor', porta: 'p2' }, { equip: 'hub-provedor', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'hub-provedor', porta: 'p2' }, { equip: 'borda-represa', porta: 'wan' }, 'cat6', 5);
  ligar(m, { equip: 'curioso', porta: 'eth0' }, { equip: 'hub-provedor', porta: 'p3' }, 'cat6', 5);
  ligar(m, { equip: 'borda-represa', porta: 'lan' }, { equip: 'represa', porta: 'eth0' }, 'cat6', 5);
  return m;
}

/** O primeiro túnel do roteador, como o motor resume em m.flags.vpnPor (estado do IKE e contadores de agora). */
function tunelEm(m: Mundo, r: string): Registro | undefined {
  return (m.flags.vpnPor as Record<string, Registro[]> | undefined)?.[r]?.[0];
}

function tunelAtivo(m: Mundo): boolean {
  return !!tunelEm(m, 'borda-fdl')?.ativo && !!tunelEm(m, 'borda-represa')?.ativo;
}

function capturaVista(m: Mundo): Registro | undefined {
  return hist(m, 'vpn').find((x) => x.captura)?.captura as Registro | undefined;
}

const d125: Pergunta[] = [numerica('1', 'Com o túnel, qual é o maior pacote IP (em bytes) que cabe dentro dele sem fragmentar?', MTU_TUNEL, 0)];

const SSID = 'Praca-Livre';
const SENHA_FRACA = 'senha123';
const SENHA_FORTE = 'cavalo bateria grampo correto';
const TENTATIVAS_FRACA = DICIONARIO_PEQUENO.indexOf(SENHA_FRACA) + 1;

/** Ponto de acesso da praça em WPA2 com senha fraca, o tablet da biblioteca já associado e a bancada do laboratório. */
function mundoPraca(semente: number): Mundo {
  const m = novoMundo(semente);
  m.flags.seguranca = true;
  adicionar(m, pc('tablet', { ip: cidr('192.168.30.20/24'), gateway: '192.168.30.1', modelo: 'Tablet de consulta da biblioteca' }));
  adicionar(m, pc('bancada', { ip: cidr('192.168.30.66/24'), gateway: '192.168.30.1', modelo: 'Bancada do laboratório do centro de operações' }));
  const ap = adicionar(m, aparelho('ap-praca', 'ap', 'Ponto de acesso da praça', [{ nome: 'p1' }], { canal: 6 }));
  adicionar(m, roteador('r-praca', { modelo: 'Roteador da praça', interfaces: { lan: '192.168.30.1/24' } }));
  adicionar(m, comutador('sw-praca', { portas: 8 }));
  ligar(m, { equip: 'ap-praca', porta: 'p1' }, { equip: 'sw-praca', porta: 'p1' }, 'cat6', 10);
  ligar(m, { equip: 'bancada', porta: 'eth0' }, { equip: 'sw-praca', porta: 'p2' }, 'cat6', 5);
  ligar(m, { equip: 'sw-praca', porta: 'p8' }, { equip: 'r-praca', porta: 'lan' }, 'cat6', 5);
  ap.s.wifi = { ssid: SSID, seguranca: 'wpa2', senha: SENHA_FRACA };
  const tablet = m.equipamentos.get('tablet')!;
  associarWifi(m, ap, tablet, SENHA_FRACA);
  tablet.s.wifiConectado = SSID;
  tablet.s.senhaWifi = SENHA_FRACA;
  return m;
}

function senhaSegura(senha: string | undefined): boolean {
  return !!senha && senha.length >= 16 && !DICIONARIO_PEQUENO.includes(senha);
}

const d125D: Pergunta[] = [
  numerica(
    '1',
    'Quantas senhas do dicionário foram testadas até a da praça cair?',
    (m) => {
      const q = [...hist(m, 'wifi')].reverse().find((x) => x.quebra?.senha)?.quebra;
      return q ? Number(q.testadas) : NaN;
    },
    0,
  ),
];

const dia125: Dia = {
  numero: 125,
  ato: 7,
  titulo: 'VPN e Wi-Fi seguro',
  chamado: [
    'CHAMADO #0125',
    'A sala de controle da represa precisa mandar as leituras das comportas para o centro de operações a noite toda. As duas redes são privadas, e entre elas só existe a rede do provedor regional, que não conhece endereço privado nenhum e tem um hub velho num armário onde qualquer um pode plugar.',
    'Ninguém vai puxar um cabo de 30 km até a represa. A saída é fazer as duas redes privadas conversarem por dentro da internet, cifradas.',
    'Objetivo: um túnel IPsec entre a borda-fdl e a borda-represa, o ping da estação de operações chegando ao painel da represa (192.168.2.10), ver o que o meio do caminho enxerga do túnel e responder o MTU que sobra dentro dele.',
  ],
  manual: {
    titulo: 'IPsec, VPN e Wi-Fi',
    texto: [
      'O IPsec põe segurança na própria camada de rede, para qualquer protocolo de cima. Antes de mandar o primeiro pacote, as duas pontas combinam uma associação de segurança (SA): cifra, integridade, chaves e um número, o SPI, que vai em cada pacote para dizer qual SA usar. A SA vale num sentido só; uma conversa usa duas. Quem combina tudo isso é o IKE: as pontas trocam metades de um Diffie-Hellman e provam quem são, com um segredo pré-compartilhado ou com certificados, como no dia anterior.',
      'Há dois cabeçalhos. O AH (cabeçalho de autenticação) protege a integridade do pacote inteiro, inclusive dos endereços, mas não cifra nada. O ESP (carga de segurança encapsulada) cifra a carga e protege a integridade dela; é o que quase todo mundo usa. E há dois modos. No modo transporte, o cabeçalho IPsec entra entre o IP original e o TCP: protege o conteúdo, mas os endereços de quem fala ficam à vista. No modo túnel, o pacote IP inteiro vira carga de um pacote novo, com os endereços dos dois roteadores de borda: quem está no meio não vê nem quem conversa com quem do lado de dentro.',
      `A rede privada virtual (VPN) é isso aplicado a duas redes: em vez de uma linha alugada, cada borda cifra o que vai para a outra rede e manda pela internet. A internet só vê pacotes de protocolo 50 (ESP) entre dois endereços públicos. O preço é espaço: o IP novo, o cabeçalho ESP, o vetor de inicialização, o preenchimento, o trailer e o código de integridade somam, no motor do jogo, ${SOBRA_ESP} bytes por pacote. Num enlace de 1500 bytes, o pacote de dentro só pode ter ${MTU_TUNEL}; pacote maior com "não fragmente" volta com erro de ICMP e precisa ser reduzido. O ESP do jogo usa AES-128-GCM, como o de verdade costuma usar: cifra e autentica junto, e um byte mexido no caminho faz o código de integridade não conferir. A chave sai de uma troca X25519 no IKE; o segredo pré-compartilhado só prova quem é quem.`,
      'No sem fio, o meio do caminho é o ar, e qualquer um ao alcance escuta. O WEP, o primeiro esquema, caiu inteiro: usava RC4 com um vetor de inicialização de só 24 bits, que se repete em horas e entrega o fluxo de chave; o código de integridade era um CRC, que dá para ajustar depois de mexer no quadro; e a chave era a mesma para todos e quase nunca mudava. Hoje se quebra em minutos.',
      `O WPA2 deriva uma chave mestra da senha e do nome da rede (PBKDF2 com 4096 iterações de HMAC-SHA1, as mesmas no jogo) e, a cada associação, faz o aperto de mão de 4 vias: o ponto de acesso manda um número aleatório, o cliente manda outro com um código de integridade feito com a chave que saiu da senha, e os dois derivam a chave temporária da sessão. O problema: quem captura esse aperto de mão tem tudo para testar senhas em casa, sem falar com ninguém, uma palavra de dicionário por vez, até o código bater. Senha curta e comum cai em segundos. O WPA3 troca a senha compartilhada pelo SAE, uma troca do tipo Diffie-Hellman amarrada à senha: o que passa no ar não serve para testar senha fora dali, e cada palpite exige uma tentativa ao vivo com o ponto de acesso, que desacelera quem erra.`,
    ],
  },
  dicas: [
    'O túnel se configura nos dois roteadores de borda com "Túnel VPN (IPsec) com outro roteador": a outra ponta é o endereço público da outra borda, e as redes daqui e de lá se invertem de um lado para o outro.',
    `O segredo pré-compartilhado precisa ser igual nas duas pontas: ${SEGREDO_VPN}.`,
    `O MTU efetivo aparece em "Ver os túneis": 1500 menos os ${SOBRA_ESP} bytes do ESP.`,
  ],
  perguntas: d125,
  montar: () => mundoTunel(7125),
  objetivo: (m) => {
    const c = capturaVista(m);
    return [
      item('túnel IPsec ativo entre a borda-fdl e a borda-represa', tunelAtivo(m), (m.flags.vpn as Registro | undefined)?.motivo ?? (tunelAtivo(m) ? 'ativo' : 'ainda não')),
      pingOk(m, 'operacoes', DESTINO_VPN),
      item('visto o que o meio do caminho enxerga do túnel', !!c, c ? `protocolo ${c.protocolo}, carga ilegível` : 'ainda não'),
      ...todasRespondidas(m, d125),
    ];
  },
  posMorte: [
    'Antes do túnel, o ping morria no roteador do provedor: ele não tem rota para 192.168.2.0/24, nem deveria ter, porque endereço privado não anda na internet. Com o túnel, a borda-fdl pega o pacote destinado à represa, cifra o pacote inteiro em ESP e o põe dentro de um pacote novo de 198.51.100.1 para 198.51.100.10. O provedor só roteia esse pacote público; a borda-represa decifra, confere a integridade e entrega o original ao painel.',
    `No hub do provedor, o curioso viu protocolo 50 entre as duas bordas e uma carga ilegível: nem o endereço privado de quem falava, nem a porta, nem o conteúdo. O custo foi de ${SOBRA_ESP} bytes por pacote, e o MTU de dentro caiu para ${MTU_TUNEL} bytes. Leitura de comporta é pequena e nem percebe; quem manda pacote grande com "não fragmente" precisa descobrir o MTU do caminho e reduzir.`,
    'Os dois roteadores se autenticaram com um segredo pré-compartilhado, que é o mais simples e serve para duas pontas. Com dezenas de filiais, cada uma ganharia um certificado da PKI da prefeitura, e o IKE conferiria a cadeia como o navegador confere a do portal. As leituras da represa agora chegam a noite toda, cifradas, por uma internet que não sabe o que carrega.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['ESP em modo túnel', 'AH em modo transporte', 'ESP em modo transporte', 'AH em modo túnel'],
        certa: 0,
        errada: {
          1: 'O AH não cifra nada: garante que ninguém mexeu, mas quem escuta lê tudo. E no modo transporte os endereços privados iriam à vista, se é que chegariam.',
          2: 'O ESP cifra o conteúdo, mas no modo transporte o cabeçalho IP original fica de fora, com os endereços privados que o provedor nem sabe rotear.',
          3: 'O túnel resolve os endereços, mas o AH não cifra: o curioso do hub leria as leituras das comportas.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Para ligar duas redes privadas pela internet sem ninguém no meio ler nada, que combinação do IPsec serve?',
      porque: 'Os pacotes de dentro têm endereços privados, que a internet não roteia, e o conteúdo não pode ser lido no caminho.',
      feito: 'ESP cifra; o modo túnel embrulha o pacote IP inteiro num pacote novo, com os endereços públicos das duas bordas.',
    }),
    passo({
      alvo: ['equip', 'operacoes'],
      acao: 'ping',
      valores: { destino: DESTINO_VPN, n: '2' },
      instrucao: 'Antes de tudo, faça um ping da estação de operações para o painel da represa (192.168.2.10).',
      porque: 'Ver o problema primeiro: a internet entre as duas bordas não conhece as redes privadas.',
      conferir: (m) => {
        const r = registroPing(m, 'operacoes', DESTINO_VPN);
        if (!r) return 'O ping ainda não foi feito.';
        return r.recebidos === 0 ? true : 'O ping já passou: o túnel já está de pé.';
      },
      feito: 'Morreu no roteador do provedor: não há rota para 192.168.2.0/24 na internet, e não deveria haver.',
    }),
    passo({
      alvo: ['equip', 'borda-fdl'],
      acao: 'sg-vpn',
      valores: { nome: 'represa', par: '198.51.100.10', local: '192.168.1.0/24', segredo: SEGREDO_VPN },
      pedir: ['remota'],
      exemplo: { remota: '192.168.2.0/24' },
      instrucao: 'Na borda-fdl, crie o túnel até a borda-represa (198.51.100.10): diga qual rede fica do outro lado.',
      porque: 'O túnel é uma regra: o que vai da rede daqui para a rede de lá entra em ESP até a outra ponta.',
      conferir: (m) => {
        const t = tunelEm(m, 'borda-fdl');
        if (!t) return 'O túnel ainda não foi criado na borda-fdl.';
        if (t.remota !== '192.168.2.0/24') return `A rede de lá é a da represa, 192.168.2.0/24, e não ${t.remota}.`;
        return true;
      },
      feito: 'Túnel criado, mas parado: a borda-represa ainda não tem o túnel espelhado, e o IKE não tem com quem conversar.',
    }),
    passo({
      alvo: ['equip', 'borda-represa'],
      acao: 'sg-vpn',
      valores: { nome: 'centro', par: '198.51.100.1', local: '192.168.2.0/24', remota: '192.168.1.0/24' },
      pedir: ['segredo'],
      exemplo: { segredo: SEGREDO_VPN },
      instrucao: 'Na borda-represa, crie o túnel espelhado até a borda-fdl (198.51.100.1), com o mesmo segredo pré-compartilhado.',
      porque: 'Daqui, a rede local é a da represa e a remota é a do centro. O segredo prova, no IKE, que as duas pontas são quem dizem.',
      conferir: (m) => {
        if (tunelAtivo(m)) return true;
        const v = m.flags.vpn as Registro | undefined;
        return v?.motivo ? `O túnel não subiu: ${v.motivo}.` : 'O túnel da borda-represa ainda não foi criado.';
      },
      feito: `IKE fechado: troca X25519, a prova do segredo (AUTH) batendo dos dois lados e a associação de segurança com o seu SPI e a chave do AES-GCM. MTU efetivo ${MTU_TUNEL} bytes.`,
    }),
    passo({
      alvo: ['equip', 'operacoes'],
      acao: 'ping',
      valores: { destino: DESTINO_VPN, n: '4' },
      instrucao: 'Agora o ping de novo, da estação de operações para o painel da represa.',
      porque: 'O pacote é o mesmo; o que muda é que a borda-fdl agora o embrulha antes de mandar.',
      conferir: (m) => {
        const r = registroPing(m, 'operacoes', DESTINO_VPN);
        return r && r.recebidos > 0 ? true : 'O ping ainda não passou. Confira o túnel nas duas bordas.';
      },
      feito: 'Respostas da represa. O provedor roteou pacotes de 198.51.100.1 para 198.51.100.10, sem saber que dentro deles ia um ping entre duas redes privadas.',
    }),
    passo({
      alvo: ['equip', 'borda-fdl'],
      acao: 'sg-vpn-captura',
      instrucao: 'Na borda-fdl, veja o último pacote do túnel como o meio do caminho vê.',
      porque: 'É o que o curioso do hub do provedor enxerga: vale conferir que é pouco.',
      conferir: (m) => (capturaVista(m) ? true : 'Nada passou pelo túnel ainda: faça o ping primeiro.'),
      feito: 'Só os IPs públicos das bordas, protocolo 50, o SPI, o número de sequência e uma carga cifrada, com o código de integridade do AES-GCM no fim: um byte trocado no caminho e a outra ponta descarta. Quem fala com quem do lado de dentro, a porta e o conteúdo só as pontas veem.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: String(MTU_TUNEL) },
      instrucao: 'Qual é o maior pacote IP que cabe dentro do túnel sem fragmentar?',
      porque: `O enlace continua com 1500 bytes, e o embrulho do ESP ocupa ${SOBRA_ESP} deles.`,
      feito: `1500 - ${SOBRA_ESP} = ${MTU_TUNEL} bytes. Um pacote de 1500 com "não fragmente" volta com ICMP pedindo para caber em ${MTU_TUNEL}.`,
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Dois cabeçalhos, dois modos',
        texto: ['AH garante que ninguém mexeu; ESP também cifra. Transporte protege o conteúdo; túnel esconde até quem fala com quem.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Modo transporte', 'Modo túnel'],
          linhas: [
            ['AH', 'integridade do pacote, nada cifrado', 'integridade do pacote novo inteiro, nada cifrado'],
            ['ESP', 'carga cifrada, endereços à vista', 'pacote original inteiro cifrado dentro de um novo'],
          ],
        },
      },
      {
        titulo: 'Duas redes privadas, um túnel',
        texto: ['A internet só roteia o pacote de fora, entre as duas bordas. O de dentro viaja cifrado.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: '192.168.1.0/24', x: 60, y: 120 },
            { id: 'r1', rotulo: 'borda-fdl', x: 180, y: 120 },
            { id: 'net', rotulo: 'provedor', x: 300, y: 60 },
            { id: 'r3', rotulo: 'borda-represa', x: 420, y: 120 },
            { id: 'b', rotulo: '192.168.2.0/24', x: 540, y: 120 },
          ],
          ligacoes: [
            ['a', 'r1', 'claro'],
            ['r1', 'net', 'ESP'],
            ['net', 'r3', 'ESP'],
            ['r1', 'r3', 'túnel'],
            ['r3', 'b', 'claro'],
          ],
        },
      },
      {
        titulo: 'O embrulho custa bytes',
        texto: [`No motor do jogo, o embrulho soma ${SOBRA_ESP} bytes. Sobram ${MTU_TUNEL} para o pacote de dentro.`],
        visual: { tipo: 'camadas', camadas: ['IP novo: borda-fdl para borda-represa, protocolo 50', 'ESP: SPI e número de sequência', 'cifrado: IP original, TCP ou ICMP e dados', 'trailer do ESP e código de integridade'], rotulo: 'ESP em modo túnel' },
      },
      {
        titulo: 'Do WEP ao WPA3',
        texto: ['Cada geração do Wi-Fi seguro caiu ou se defendeu por um motivo concreto.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Esquema', 'Chave', 'Ponto fraco', 'Situação'],
          linhas: [
            ['WEP', 'fixa, igual para todos', 'vetor de 24 bits repete; integridade por CRC', 'quebra em minutos'],
            ['WPA2', 'derivada da senha e do nome da rede', 'aperto de mão capturado permite dicionário offline', 'seguro com senha longa'],
            ['WPA3', 'SAE, troca amarrada à senha', 'cada palpite é uma tentativa ao vivo', 'resiste a dicionário offline'],
          ],
        },
      },
      {
        titulo: 'O aperto de mão de 4 vias',
        texto: ['Tudo que o atacante precisa para testar senhas em casa passa no ar nas duas primeiras mensagens.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mensagem', 'O que leva'],
          linhas: [
            ['1. ponto de acesso para cliente', 'ANonce (número aleatório)'],
            ['2. cliente para ponto de acesso', 'SNonce e o código de integridade feito com a chave da senha'],
            ['3. ponto de acesso para cliente', 'confere o código e manda a chave de grupo cifrada'],
            ['4. cliente para ponto de acesso', 'confirma; daí em diante tudo cifrado com a chave da sessão'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Alguém capturou o aperto de mão de uma rede WPA2 com a senha "futebol". Por que trocar para WPA3 resolve, mesmo mantendo uma senha fraca por um tempo?',
      opcoes: [
        'Porque no WPA3 o que passa no ar não permite testar senhas fora dali: cada palpite precisa ser uma tentativa ao vivo com o ponto de acesso',
        'Porque o WPA3 não usa senha',
        'Porque o WPA3 cifra com WEP por cima',
        'Porque o WPA3 esconde o nome da rede',
      ],
      certa: 0,
      explicacao: 'No WPA2, o código de integridade da mensagem 2 deixa conferir cada palavra do dicionário em casa, milhões por segundo. O SAE do WPA3 é uma troca do tipo Diffie-Hellman: sem a senha certa ao vivo, nada confere, e o ponto de acesso desacelera quem erra. A senha ainda deve ser longa, mas o ataque offline acaba.',
    },
  },
  desafio: {
    carta: [
      `O Wi-Fi da praça, "${SSID}", que serve o tablet de consulta da biblioteca, está em WPA2 com uma senha que alguém escolheu na pressa. O centro de operações desconfia que ela cai num dicionário.`,
      'Na bancada do laboratório, prove: capture o aperto de mão e teste o dicionário pequeno contra ele. Depois corrija a rede, com WPA3 ou com uma senha longa de verdade, e reconecte o tablet.',
      'Objetivo: a senha fraca descoberta a partir do aperto de mão, a rede corrigida, o tablet conectado de novo e quantas senhas foram testadas até cair.',
    ],
    dicas: [
      'Na bancada: "Capturar o aperto de mão do Wi-Fi" e depois "Testar senhas de um dicionário" (deixe as palavras vazias para usar o dicionário pequeno).',
      `No ap-praca, "Segurança da rede sem fio" com WPA3, ou WPA2 com uma frase longa (16 caracteres ou mais) fora do dicionário, como "${SENHA_FORTE}".`,
      'No tablet, "Conectar numa rede sem fio" com a senha nova. A resposta da pergunta é a contagem que aparece na quebra.',
    ],
    perguntas: d125D,
    montar: () => mundoPraca(8125),
    objetivo: (m) => {
      const q = [...hist(m, 'wifi')].reverse().find((x) => x.quebra)?.quebra as Registro | undefined;
      const w = wifiDe(m.equipamentos.get('ap-praca')!);
      const corrigida = !!w && w.ssid === SSID && (w.seguranca === 'wpa3' ? (w.senha ?? '').length >= 8 : w.seguranca === 'wpa2' && senhaSegura(w.senha));
      const tablet = m.equipamentos.get('tablet')!;
      const reconectado = corrigida && tablet.s.wifiConectado === SSID && tablet.s.senhaWifi === w!.senha && w!.senha !== SENHA_FRACA;
      return [
        item('a senha da praça descoberta a partir do aperto de mão capturado', q?.senha === SENHA_FRACA, q ? (q.senha ? `"${q.senha}" em ${q.testadas} tentativa(s)` : 'o dicionário não achou') : 'ainda não testado'),
        item(`"${SSID}" corrigida: WPA3, ou WPA2 com senha longa fora do dicionário`, corrigida, w ? `${w.seguranca.toUpperCase()}, senha de ${(w.senha ?? '').length} caracteres` : 'sem rede'),
        item('o tablet da biblioteca conectado de novo, com a senha nova', reconectado),
        ...todasRespondidas(m, d125D),
      ];
    },
    solucao: [
      ['equip', 'bancada', 'sg-wifi-capturar', { ssid: SSID }],
      ['equip', 'bancada', 'sg-wifi-quebrar', { ssid: SSID, palavras: '' }],
      ['equip', 'ap-praca', 'sg-wifi-ap', { ssid: SSID, seg: 'wpa3', senha: SENHA_FORTE }],
      ['equip', 'tablet', 'sg-wifi-conectar', { ssid: SSID, senha: SENHA_FORTE }],
    ],
    respostas: { '1': String(TENTATIVAS_FRACA) },
  },
};

export const ATO7B: Dia[] = [dia123, dia124, dia125];
