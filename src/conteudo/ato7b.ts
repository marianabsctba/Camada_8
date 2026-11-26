// Dias do ato 7 (O Cerco), com prática guiada, aula e desafio no próprio dia.
// Chave pública e assinatura (8.6 e 8.7), certificados e autenticação (8.8 e 8.9) e VPN com Wi-Fi seguro (8.10),
// no centro de operações de Fim de Linha, à noite.

import { adicionar, aparelho, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { buscarColisao, cifrarRsa, diffieHellman, gerarChavesRsa, homemNoMeio, sha256, sha256Bytes } from '../motor/cripto';
import { associarWifi, DICIONARIO_PEQUENO, wifiDe } from '../motor/seguranca';
import { SOBRA_ESP, tuneisDe } from '../motor/filtro';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Registro = Record<string, any>;

/** Chaves de m.flags que o motor sobrescreve a cada comando e que os objetivos destes dias precisam lembrar. */
const LEMBRAR = ['cripto', 'tls', 'http', 'vpn', 'wifi'];

/**
 * O motor guarda só o último resultado em cada flag (o último RSA, o último TLS...). Para o objetivo pedir várias
 * contas no mesmo dia, cada escrita nessas flags também vai para m.flags.historico7b, sem mudar o que o motor lê.
 */
function lembrar(m: Mundo): Mundo {
  const hist: Record<string, Registro[]> = {};
  m.flags.historico7b = hist;
  for (const k of LEMBRAR) {
    let atual: unknown = m.flags[k];
    hist[k] = [];
    Object.defineProperty(m.flags, k, {
      configurable: true,
      enumerable: true,
      get: () => atual,
      set: (v: unknown) => {
        atual = v;
        if (v && typeof v === 'object') hist[k]!.push({ ...(v as Registro) });
      },
    });
  }
  return m;
}

function hist(m: Mundo, k: string): Registro[] {
  return ((m.flags.historico7b as Record<string, Registro[]> | undefined)?.[k] ?? []) as Registro[];
}

function cripto(m: Mundo, op: string, f: (x: Registro) => boolean = () => true): Registro | undefined {
  return [...hist(m, 'cripto')].reverse().find((x) => x.op === op && f(x));
}

function contarBitsDiferentes(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = (a[i]! ^ b[i]!) & 0xff;
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

/* ======================================================================
 * ref 123: Chave pública e assinatura (8.6 e 8.7)
 * ====================================================================== */

const RSA_AULA = gerarChavesRsa(61n, 53n);
const MSG_AULA = 65n;
const C_AULA = cifrarRsa(MSG_AULA, RSA_AULA.publica).resultado;

const RSA_DES = gerarChavesRsa(47n, 59n);
const MSG_DES = 1234n;

const ORDEM = 'Pague 100 a Lia';
const ORDEM_FALSA = 'Pague 100 a Lua';
const H_ORDEM = sha256(ORDEM);
const H_FALSA = sha256(ORDEM_FALSA);
const BITS_AVALANCHE = contarBitsDiferentes(sha256Bytes(ORDEM), sha256Bytes(ORDEM_FALSA));

const CONTRATO = 'Entregar 40 sacos de cimento na escola';
const CONTRATO_ALTERADO = 'Entregar 90 sacos de cimento na escola';
const H_CONTRATO = sha256(CONTRATO);
const H_CONTRATO_ALT = sha256(CONTRATO_ALTERADO);

const COLISAO = buscarColisao(16);

function rsaFeito(m: Mundo, n: bigint): Registro | undefined {
  return cripto(m, 'rsa', (x) => x.n === String(n) && x.decifrado !== undefined && x.cifrado !== x.decifrado);
}

function resumoFeito(m: Mundo, h: string): boolean {
  return !!cripto(m, 'sha256', (x) => x.resumo === h);
}

function assinaturaFeita(m: Mundo): Registro | undefined {
  return cripto(m, 'assinar', (x) => x.confere === true && x.alteradaConfere === false);
}

function itemRsa(m: Mundo, n: bigint, texto: string): ItemObjetivo {
  const r = rsaFeito(m, n);
  return item(texto, !!r, r ? `n = ${r.n}, e = ${r.e}, d = ${r.d}, cifrado ${r.cifrado}, decifrado ${r.decifrado}` : 'ainda não calculado com esses primos');
}

const d123: Pergunta[] = [
  numerica('1', `Com p = 61, q = 53 e e = ${RSA_AULA.e}, qual é o expoente privado d?`, Number(RSA_AULA.d), 0),
  numerica('2', 'Um resumo de 256 bits resiste a cerca de 2 elevado a quanto em tentativas antes de aparecer uma colisão? (responda o expoente)', 128, 0),
];

const d123D: Pergunta[] = [
  numerica('1', `Com p = 47, q = 59 e e = ${RSA_DES.e}, qual é o expoente privado d da cooperativa?`, Number(RSA_DES.d), 0),
  numerica('2', 'O fornecedor usa um resumo de 40 bits. Com cerca de 2 elevado a quanto em tentativas alguém acha duas mensagens com o mesmo resumo? (responda o expoente)', 20, 0),
];

const dia123: Dia = {
  numero: 123,
  ato: 7,
  titulo: 'Chave pública e assinatura',
  chamado: [
    'CHAMADO #0123',
    `Às duas da manhã a cooperativa recebeu pela rede uma ordem de pagamento: "${ORDEM_FALSA}". A tesoureira jura que escreveu "${ORDEM}". Alguém mexeu no meio do caminho, e ninguém consegue provar quem escreveu o quê.`,
    'O centro de operações quer um jeito de a tesouraria publicar uma chave que qualquer um use para conferir as ordens, sem nunca ter de entregar um segredo a ninguém.',
    `Objetivo: montar um RSA pequeno com p = 61 e q = 53 e responder o d, resumir com SHA-256 as duas ordens que diferem numa letra, assinar uma ordem e conferir, e responder até onde um resumo de 256 bits aguenta o ataque do aniversário.`,
  ],
  manual: {
    titulo: 'Chave pública, resumo e assinatura',
    texto: [
      'Toda cifra simétrica tem um calcanhar: as duas pontas precisam da mesma chave, e essa chave precisa viajar por algum lugar antes de a conversa começar. Com 100 pessoas que querem falar duas a duas são 4950 chaves para entregar em mãos. A criptografia de chave pública resolve isso com um par: uma chave pública, que vai para quem quiser, e uma privada, que nunca sai de casa. O que uma cifra, só a outra decifra, e saber a pública não ajuda a descobrir a privada.',
      `O RSA faz isso com aritmética. Escolha dois primos, p e q, e multiplique: n = p × q. Calcule φ(n) = (p - 1)(q - 1). Escolha e sem fator comum com φ(n) e ache d tal que e × d deixe resto 1 na divisão por φ(n). A chave pública é (n, e); a privada é (n, d). Cifrar é c = m^e mod n; decifrar é m = c^d mod n. Com p = 61 e q = 53: n = ${RSA_AULA.n}, φ(n) = ${RSA_AULA.phi}, e = ${RSA_AULA.e} e d = ${RSA_AULA.d}; a mensagem ${MSG_AULA} vira ${C_AULA} e volta a ${MSG_AULA}. Quem conhece só n precisaria fatorar n para chegar a φ(n) e a d, e para números de 600 dígitos ninguém sabe fazer isso em tempo útil. Aqui os primos são de brinquedo (n de quatro dígitos se fatora de cabeça); no mundo real, n tem 2048 bits ou mais.`,
      'O RSA não é o único. As curvas elípticas fazem a mesma mágica com pontos de uma curva sobre um corpo finito: o problema difícil é o logaritmo discreto na curva, e chaves de 256 bits dão a segurança que o RSA só alcança com mais de 3000. A cifra da mochila, uma das primeiras ideias de chave pública, escondia uma mochila fácil de resolver dentro de uma difícil, e acabou quebrada: é o lembrete de que "parece difícil" não é prova de nada. A chave pública é lenta, por isso na prática ela só combina uma chave de sessão, e quem cifra o grosso é uma cifra simétrica.',
      'Assinar é provar quem escreveu e que nada mudou. Com chave simétrica, precisa de um árbitro em quem todos confiam: a tesoureira cifra a ordem com a chave que divide com o árbitro, o árbitro confere e repassa à cooperativa com o seu próprio selo e uma marca de tempo, e em caso de briga o árbitro testemunha. Com chave pública, ninguém no meio: a tesoureira aplica a chave privada, e qualquer um confere com a pública. Só quem tem a privada produziria aquilo, então ela nem pode negar depois.',
      `Assinar o texto inteiro seria lento; assina-se o resumo. Uma função de resumo criptográfico, como o SHA-256, transforma qualquer entrada em 256 bits: é fácil de calcular, impossível de inverter na prática, e mudar uma letra muda cerca de metade dos bits (o efeito avalanche). Se o resumo da ordem recebida bate com o que a assinatura abre, a ordem é a mesma. O HMAC é o primo simétrico: o resumo com uma chave secreta misturada, para quem divide um segredo. E o ataque do aniversário diz quanto o resumo aguenta: com 23 pessoas numa sala, a chance de duas fazerem aniversário no mesmo dia já passa de metade. Achar duas mensagens com o mesmo resumo de n bits leva cerca de 2^(n/2) tentativas, não 2^n. O SHA-256 aguenta 2^128; um resumo de 64 bits, só 2^32, coisa de uma tarde.`,
    ],
  },
  dicas: [
    'As contas estão na tesouraria: "RSA pequeno", "Resumo SHA-256" e "Assinar e conferir".',
    `O d sai na linha "d = ..." do RSA: é o número que, multiplicado por ${RSA_AULA.e}, deixa resto 1 na divisão por ${RSA_AULA.phi}.`,
    'Para o aniversário, divida o número de bits do resumo por 2.',
  ],
  perguntas: d123,
  montar: () => lembrar(mundoCooperativa(7123)),
  objetivo: (m) => [
    itemRsa(m, RSA_AULA.n, 'RSA com p = 61 e q = 53 (n = 3233), cifrando e decifrando de volta'),
    item(`resumo SHA-256 de "${ORDEM}"`, resumoFeito(m, H_ORDEM), H_ORDEM.slice(0, 16) + '...'),
    item(`resumo SHA-256 de "${ORDEM_FALSA}", que difere numa letra`, resumoFeito(m, H_FALSA), H_FALSA.slice(0, 16) + '...'),
    item('uma ordem assinada com a chave privada, conferida com a pública, e a alterada recusada', !!assinaturaFeita(m), assinaturaFeita(m) ? `chave ${assinaturaFeita(m)!.idChave}` : 'ainda não assinada'),
    ...todasRespondidas(m, d123),
  ],
  posMorte: [
    `A ordem falsa caiu pelo resumo. "${ORDEM}" e "${ORDEM_FALSA}" diferem numa letra, e os resumos SHA-256 diferem em ${BITS_AVALANCHE} dos 256 bits. Quem mexeu no meio trocou a letra, mas não tinha como trocar a assinatura: ela só abre para o resumo certo com a chave pública da tesouraria, e produzir outra exigiria a chave privada, que nunca saiu da tesouraria.`,
    `O RSA do laboratório é de brinquedo de propósito: com n = ${RSA_AULA.n}, qualquer um acha 61 × 53 e, daí, φ(n) = ${RSA_AULA.phi} e d = ${RSA_AULA.d}. A segurança inteira mora em fatorar ser difícil, por isso o n de verdade tem centenas de dígitos. Também a assinatura do jogo reduz o resumo módulo n para caber na conta; no mundo real o n é maior que o resumo e nada se perde.`,
    'E o aniversário explica por que ninguém usa resumo curto para assinar. Quem quer fraudar não precisa achar uma mensagem com o resumo de uma ordem dada (2^256 tentativas); basta gerar muitas versões de uma ordem honesta e de uma desonesta até duas baterem, e aí pedir a assinatura na honesta. Com 256 bits, isso são 2^128 tentativas: fora de alcance. A tesouraria passou a assinar toda ordem, e a cooperativa só paga o que confere.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Combinar uma chave secreta com cada parceiro exige que ela viaje antes; com par de chaves, a pública pode ir para todo mundo',
          'Cifra simétrica é fácil de quebrar, e a de chave pública não',
          'Chave pública dispensa o resumo da mensagem',
          'Chave pública é mais rápida que a simétrica',
        ],
        certa: 0,
        errada: {
          1: 'Uma cifra simétrica moderna, como o AES, é tão forte quanto se queira. O problema não é a força, é como a chave chega até o outro lado.',
          2: 'É o contrário: a assinatura de chave pública quase sempre assina o resumo, para a conta ficar pequena.',
          3: 'É bem mais lenta. Por isso, na prática, a chave pública só combina uma chave de sessão, e a simétrica cifra o grosso.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes das contas: que problema a criptografia de chave pública resolve?',
      porque: 'A tesouraria fala com dezenas de fornecedores. Entregar um segredo diferente em mãos para cada um não escala.',
      feito: 'Com um par de chaves, a pública vai para quem quiser (até para o atacante) e a privada fica em casa. Nada secreto precisa viajar.',
    }),
    passo({
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-rsa',
      pedir: ['p', 'q', 'm'],
      exemplo: { p: '61', q: '53', m: '65' },
      instrucao: 'Na tesouraria, monte um RSA com p = 61 e q = 53 e cifre a mensagem 65.',
      porque: 'Cada passo do RSA aparece na saída: n, φ(n), a escolha de e, o Euclides estendido que acha d, e a exponenciação que cifra e decifra.',
      conferir: (m) => {
        if (rsaFeito(m, RSA_AULA.n)) return true;
        const r = cripto(m, 'rsa');
        if (r) return `Esse RSA deu n = ${r.n}. Para o exercício, p = 61 e q = 53, n = 3233.`;
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
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-sha256',
      valores: { t: ORDEM },
      instrucao: `Calcule o SHA-256 da ordem verdadeira, "${ORDEM}".`,
      porque: 'O resumo é a impressão digital do texto: 256 bits, sempre do mesmo tamanho, qualquer que seja a entrada.',
      conferir: (m) => (resumoFeito(m, H_ORDEM) ? true : `O resumo de "${ORDEM}" ainda não foi calculado.`),
      feito: `Resumo: ${H_ORDEM.slice(0, 32)}... Guarde o começo para comparar.`,
    }),
    passo({
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-sha256',
      valores: { t: ORDEM_FALSA },
      instrucao: `Agora o da ordem que chegou, "${ORDEM_FALSA}", com uma letra trocada.`,
      porque: 'Uma boa função de resumo espalha qualquer mudança pela saída inteira: não dá para "ajustar um pouquinho" o texto e manter o resumo.',
      conferir: (m) => (resumoFeito(m, H_FALSA) ? true : `O resumo de "${ORDEM_FALSA}" ainda não foi calculado.`),
      feito: `Resumo: ${H_FALSA.slice(0, 32)}... Uma letra mudou ${BITS_AVALANCHE} dos 256 bits, perto da metade: o efeito avalanche.`,
    }),
    passo({
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-assinar',
      valores: { t: ORDEM },
      instrucao: `Assine a ordem "${ORDEM}" com a chave privada da tesouraria e confira.`,
      porque: 'A assinatura é o resumo elevado ao d da tesouraria. Quem confere eleva ao e público e compara com o resumo do que recebeu.',
      conferir: (m) => {
        if (assinaturaFeita(m)) return true;
        return cripto(m, 'assinar') ? 'A assinatura não conferiu desta vez. Tente de novo.' : 'A ordem ainda não foi assinada.';
      },
      feito: 'Conferiu com a chave pública. Com um caractere a mais no texto, o resumo muda e a mesma assinatura deixa de conferir: integridade e autoria na mesma conta.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '128' },
      instrucao: 'Até quantas tentativas, em potência de 2, um resumo de 256 bits aguenta o ataque do aniversário?',
      porque: `Achar duas entradas quaisquer com o mesmo resumo é bem mais fácil que achar uma entrada para um resumo dado. No laboratório, um resumo de brinquedo de 16 bits colidiu em ${COLISAO.tentativas} tentativas, perto de √(2^16) = 256.`,
      feito: 'Cerca de 2^(256/2) = 2^128. É por isso que um resumo para assinatura precisa do dobro dos bits da segurança que se quer.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Uma chave para fechar, outra para abrir',
        texto: ['A pública vai para todo mundo, até para o atacante. A privada nunca sai de casa. O que uma cifra, só a outra abre.'],
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
        titulo: 'Uma letra, metade dos bits',
        texto: [`O SHA-256 de dois textos que diferem numa letra. Os resumos diferem em ${BITS_AVALANCHE} dos 256 bits.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Texto', 'Começo do SHA-256'],
          linhas: [
            [ORDEM, H_ORDEM.slice(0, 24)],
            [ORDEM_FALSA, H_FALSA.slice(0, 24)],
          ],
        },
      },
      {
        titulo: 'Assina-se o resumo',
        texto: ['A tesouraria resume e assina o resumo com d. Quem recebe resume de novo, abre a assinatura com e e compara. Iguais: o texto é o mesmo e veio de quem tem d.'],
        visual: { tipo: 'camadas', camadas: ['ordem (qualquer tamanho)', 'SHA-256: 256 bits', 'resumo elevado a d mod n: a assinatura', 'quem confere: assinatura elevada a e, comparada com o resumo'], rotulo: 'assinar e conferir' },
      },
      {
        titulo: 'O paradoxo do aniversário',
        texto: ['Achar duas mensagens com o mesmo resumo de n bits leva cerca de 2^(n/2) tentativas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Resumo', 'Achar uma mensagem para um resumo dado', 'Achar duas que colidem'],
          linhas: [
            ['16 bits (brinquedo)', '2^16 = 65536', `cerca de 2^8; no laboratório, ${COLISAO.tentativas} tentativas`],
            ['64 bits', '2^64', '2^32: uma tarde'],
            ['256 bits (SHA-256)', '2^256', '2^128: fora de alcance'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que a assinatura com chave pública dispensa o árbitro da assinatura simétrica?',
      opcoes: [
        'Porque só quem tem a chave privada consegue produzir a assinatura, e qualquer um confere com a pública',
        'Porque a chave pública é secreta',
        'Porque o resumo já basta para provar quem escreveu',
        'Porque a mensagem vai cifrada e ninguém a lê',
      ],
      certa: 0,
      explicacao: 'Na assinatura simétrica, quem confere tem a mesma chave de quem assina e poderia ter forjado; por isso precisa de um árbitro. Com par de chaves, a privada é só de quem assina e a pública confere sem poder assinar. O resumo sozinho qualquer um calcula, e a assinatura nem precisa esconder o texto.',
    },
  },
  desafio: {
    carta: [
      `A cooperativa vai publicar a própria chave para os fornecedores: os primos guardados no cofre são p = 47 e q = 59. Antes, quer ver a chave funcionando com a mensagem ${MSG_DES}.`,
      `Ao mesmo tempo, um fornecedor mandou o contrato "${CONTRATO}", e na rede circulou a versão "${CONTRATO_ALTERADO}". O sistema antigo do fornecedor usa um resumo de 40 bits.`,
      'Objetivo: o RSA da cooperativa com d respondido, os resumos SHA-256 das duas versões do contrato, um contrato assinado e conferido e quanto o resumo de 40 bits aguenta.',
    ],
    dicas: [
      `"RSA pequeno" na tesouraria com p = 47, q = 59 e m = ${MSG_DES}; o d aparece na saída.`,
      'Resuma as duas versões do contrato com "Resumo SHA-256", exatamente como na carta, e assine a original com "Assinar e conferir".',
      'Para o aniversário, metade dos bits: 40 ÷ 2.',
    ],
    perguntas: d123D,
    montar: () => lembrar(mundoCooperativa(8123)),
    objetivo: (m) => [
      itemRsa(m, RSA_DES.n, `RSA da cooperativa (p = 47, q = 59, n = ${RSA_DES.n}), cifrando e decifrando`),
      item('resumo SHA-256 do contrato original', resumoFeito(m, H_CONTRATO), H_CONTRATO.slice(0, 16) + '...'),
      item('resumo SHA-256 da versão alterada', resumoFeito(m, H_CONTRATO_ALT), H_CONTRATO_ALT.slice(0, 16) + '...'),
      item('um contrato assinado e conferido, com a alteração recusada', !!assinaturaFeita(m), assinaturaFeita(m) ? 'confere' : 'ainda não'),
      ...todasRespondidas(m, d123D),
    ],
    solucao: [
      ['equip', 'tesouraria', 'sg-rsa', { p: '47', q: '59', m: String(MSG_DES) }],
      ['equip', 'tesouraria', 'sg-sha256', { t: CONTRATO }],
      ['equip', 'tesouraria', 'sg-sha256', { t: CONTRATO_ALTERADO }],
      ['equip', 'tesouraria', 'sg-assinar', { t: CONTRATO }],
    ],
    respostas: { '1': String(RSA_DES.d), '2': '20' },
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
 * ref 124: Certificados e autenticação (8.8 e 8.9)
 * ====================================================================== */

const PORTAL = 'www.prefeitura.exemplo';
const URL_PORTAL = `https://${PORTAL}/`;
const DH_A = 6n;
const DH_B = 15n;
const DH_M = 13n;
const DH = diffieHellman(23n, 5n, DH_A, DH_B);
const MITM = homemNoMeio(23n, 5n, DH_A, DH_B, DH_M);

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
  return cripto(m, 'cadeia', (x) => x.valida === true);
}

function kerberosCom(m: Mundo, sucesso: boolean): Registro | undefined {
  return cripto(m, 'kerberos', (x) => x.sucesso === sucesso);
}

const dia124: Dia = {
  numero: 124,
  ato: 7,
  titulo: 'Certificados e autenticação',
  chamado: [
    'CHAMADO #0124',
    `Moradores ligaram de madrugada: o portal da prefeitura, ${PORTAL}, abriu com um aviso vermelho do navegador, e alguns clicaram em "continuar" e digitaram a senha. O certificado do portal venceu ontem e ninguém renovou.`,
    'Antes de renovar, o centro de operações quer entender a corrente inteira: quem garante que aquela chave pública é mesmo da prefeitura, o que o navegador confere e como os sistemas de dentro provam quem é quem sem mandar senha pela rede.',
    'Objetivo: conferir uma cadeia de certificados válida, ver o navegador parar diante do certificado vencido, simular o homem no meio no Diffie-Hellman e fazer um login Kerberos completo.',
  ],
  manual: {
    titulo: 'Quem garante a chave pública',
    texto: [
      'A chave pública resolve a distribuição de segredos, mas cria outro problema: como saber que a chave que chegou é mesmo de quem diz? Se o atacante está no meio, ele troca a chave da prefeitura pela dele quando o navegador pede, decifra tudo, lê e cifra de novo com a chave verdadeira. As duas pontas acham que conversam entre si. É o homem no meio, e criptografia nenhuma resolve sem um jeito de amarrar nome a chave.',
      'O certificado faz essa amarração: um documento que diz "esta chave pública pertence a www.prefeitura.exemplo", assinado por uma autoridade certificadora (AC). O formato é o X.509, com versão, número de série, algoritmo da assinatura, emissor, período de validade (não antes, não depois), sujeito (o nome), a chave pública do sujeito, extensões (nomes alternativos, se pode assinar outros certificados) e a assinatura da AC sobre tudo isso.',
      'Ninguém confia numa AC só porque ela diz. A infraestrutura de chave pública (PKI) é uma árvore: uma AC raiz assina as intermediárias, as intermediárias assinam os servidores. As raízes vêm instaladas no navegador e no sistema, são as âncoras de confiança. O navegador sobe a cadeia: o nome bate com o endereço? Está na validade? Cada assinatura confere com a chave de quem está acima? A raiz é uma das âncoras? E não foi revogado? A revogação existe porque chave privada vaza: a AC publica uma lista de certificados revogados (CRL), ou responde na hora a uma consulta sobre um certificado (OCSP). Vencido, autoassinado, de outro nome ou revogado: o navegador para e avisa.',
      `Autenticar é provar quem é. Com uma chave compartilhada, o jeito clássico é desafio e resposta: o servidor manda um número aleatório usado uma vez só, e o cliente devolve um HMAC dele com a chave, que nunca viaja. O protocolo ingênuo de mão dupla cai no ataque de reflexão: o atacante abre uma segunda sessão e faz o próprio servidor responder o desafio que ele recebeu. As regras para não cair: quem inicia prova primeiro, cada lado usa chave ou identidade diferente na conta, e os desafios dos dois lados vêm de conjuntos diferentes. O Diffie-Hellman deixa duas pontas combinarem uma chave sem ela passar pelo fio (com p = 23 e g = 5, os segredos ${DH_A} e ${DH_B} levam os dois à chave ${DH.chaveAlice}; números de brinquedo, que no mundo real têm centenas de dígitos), mas sozinho não autentica: o homem no meio fecha uma chave com cada lado. Por isso, no TLS, o servidor assina a sua metade.`,
      'Com muita gente e muitos serviços, as chaves compartilhadas viram centenas. Um centro de distribuição de chaves (KDC) guarda uma chave para cada um e entrega chaves de sessão sob demanda. O Kerberos é o KDC de quase toda rede corporativa: o servidor de autenticação entrega um tíquete de concessão (TGT), cifrado para o servidor de concessão de tíquetes; com ele, o usuário pede tíquetes para cada serviço, sem digitar a senha de novo, e a senha nunca passa pela rede. A autenticação por chave pública é o caminho que dispensa o KDC: cada lado prova que tem a chave privada do próprio certificado.',
    ],
  },
  dicas: [
    '"Conferir uma cadeia de certificados" está no atendimento; "Ligar HTTPS" está no portal.',
    `Com o portal servindo o certificado vencido, abra ${URL_PORTAL} no atendimento: o navegador precisa parar.`,
    'No Diffie-Hellman, preencha o segredo do atacante para ver as duas chaves diferentes. No Kerberos, a senha digitada igual à cadastrada.',
  ],
  montar: () => lembrar(mundoPortal(7124)),
  objetivo: (m) => {
    const dh = cripto(m, 'dh-homem-no-meio');
    const k = kerberosCom(m, true);
    return [
      item(`cadeia de ${PORTAL} conferida até a raiz, e válida`, !!cadeiaValida(m), cadeiaValida(m) ? 'válida' : 'ainda não conferida'),
      item('o navegador do atendimento parou diante do certificado vencido do portal', paradasPor(m, 'vencido'), paradasPor(m, 'vencido') ? 'parou: certificado vencido' : 'ainda não'),
      item('Diffie-Hellman com o homem no meio simulado', !!dh, dh ? `Alice ficou com ${dh.chaveAlice}, Bob com ${dh.chaveBob}` : 'ainda não'),
      item('login Kerberos completo, com autenticação mútua', !!k, k ? k.etapas.join(', ') : 'ainda não'),
    ];
  },
  posMorte: [
    `O aviso vermelho estava certo. O certificado do portal valia até o dia ${200 - 3} e hoje é dia 200: o navegador subiu a cadeia, viu a validade vencida e parou antes de mandar o pedido. Quem clicou em "continuar" mandou a senha para um servidor que podia ser qualquer um; a prefeitura pediu a essas pessoas que troquem a senha. Certificado vencido quase sempre é descuido, mas o navegador não tem como distinguir descuido de ataque, e é por isso que avisa igual.`,
    `O Diffie-Hellman mostrou por que a assinatura do servidor importa. Sem atacante, os segredos ${DH_A} e ${DH_B} levaram os dois lados à chave ${DH.chaveAlice}. Com o atacante no meio trocando as metades públicas, Alice ficou com a chave ${MITM.chaveAlice} e Bob com ${MITM.chaveBob}, ambas conhecidas do atacante, e nenhum dos dois percebeu. No TLS, o servidor assina o aperto de mão com a chave do certificado, e o navegador confere: a troca que o atacante fizesse não teria assinatura válida.`,
    'O Kerberos fechou o outro lado: no sistema interno da prefeitura, a atendente digitou a senha uma vez, a estação usou a senha só para abrir a resposta do servidor de autenticação, e daí em diante os tíquetes fizeram o trabalho. Seis mensagens, nenhuma com senha, e o serviço também provou quem era. O certificado novo do portal foi emitido pela AC Intermediária Exemplo, que vem da AC Raiz Exemplo, já instalada em todo navegador da cidade.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Que aquela chave pública pertence àquele nome, com a assinatura de uma autoridade em quem o navegador confia',
          'Que o servidor não tem vírus',
          'Que a conversa vai ser cifrada com RSA',
          'Que o site é de uma empresa honesta',
        ],
        certa: 0,
        errada: {
          1: 'O certificado não diz nada sobre o que roda no servidor. Ele só amarra um nome a uma chave.',
          2: 'O certificado traz uma chave pública, que no TLS serve para o servidor assinar o aperto de mão; a conversa em si vai com uma cifra simétrica e uma chave de sessão.',
          3: 'A autoridade confere que quem pediu controla o nome. Um golpista com domínio próprio também consegue certificado para o domínio dele.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O que um certificado garante, exatamente?',
      porque: 'Sem saber o que o certificado promete, não dá para saber o que o aviso do navegador quer dizer.',
      feito: 'Nome e chave, amarrados pela assinatura da AC. Todo o resto (validade, revogação, a cadeia até a raiz) existe para o navegador saber se ainda pode acreditar nessa amarração.',
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-cadeia',
      valores: { nome: PORTAL, tipo: 'valido' },
      instrucao: `No atendimento, confira a cadeia de um certificado válido de ${PORTAL}.`,
      porque: 'A saída mostra cada verificação do navegador, na ordem: nome, validade, revogação, assinatura de cada elo e a raiz.',
      conferir: (m) => (cadeiaValida(m) ? true : 'A cadeia válida ainda não foi conferida.'),
      feito: 'Folha assinada pela AC Intermediária Exemplo, que foi assinada pela AC Raiz Exemplo, que está no repositório de raízes confiáveis. A confiança desce da âncora até o servidor.',
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
        return w ? `O portal está com o certificado ${w}. O que venceu ontem é o "vencido".` : 'O HTTPS do portal ainda não foi ligado.';
      },
      feito: 'HTTPS na porta 443, com um certificado que venceu há 3 dias.',
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
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-dh',
      valores: { a: String(DH_A), b: String(DH_B) },
      pedir: ['m'],
      exemplo: { m: String(DH_M) },
      instrucao: 'Simule um Diffie-Hellman entre Alice e Bob com um atacante no meio (escolha o segredo do atacante).',
      porque: 'O Diffie-Hellman combina uma chave sem ela passar pelo fio, mas não diz com quem você combinou.',
      conferir: (m) => {
        if (cripto(m, 'dh-homem-no-meio')) return true;
        return cripto(m, 'dh') ? 'Esse foi sem atacante. Preencha o segredo do atacante para ver o homem no meio.' : 'O Diffie-Hellman ainda não rodou.';
      },
      feito: `Alice ficou com a chave ${MITM.chaveAlice}, Bob com ${MITM.chaveBob}, e o atacante tem as duas. Sem ataque, os dois teriam chegado a ${DH.chaveAlice}. A cura é autenticar as metades públicas: assinatura com certificado.`,
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-kerberos',
      valores: { u: 'atendente', s: 'Balcao-2026!', c: 'Balcao-2026!' },
      instrucao: 'Faça o login da atendente no sistema interno pelo Kerberos.',
      porque: 'Seis mensagens: pedir o tíquete de concessão, recebê-lo, pedir o tíquete do serviço, recebê-lo, apresentá-lo ao serviço e a resposta do serviço.',
      conferir: (m) => {
        if (kerberosCom(m, true)) return true;
        return kerberosCom(m, false) ? 'A senha digitada não bateu com a cadastrada: a resposta do servidor de autenticação não abriu. Use a mesma nas duas.' : 'O Kerberos ainda não rodou.';
      },
      feito: 'AS-REQ, AS-REP, TGS-REQ, TGS-REP, AP-REQ e AP-REP. A senha só abriu a primeira resposta, na própria estação; o serviço devolveu a hora mais um, provando que também é legítimo.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Fazer quem inicia a conversa provar a identidade primeiro, e pôr a identidade de quem responde na conta',
          'Usar desafios maiores',
          'Repetir o mesmo desafio para os dois lados',
          'Mandar a chave junto com a resposta',
        ],
        certa: 0,
        errada: {
          1: 'Um desafio de qualquer tamanho é refletido do mesmo jeito: o atacante só copia o que o servidor mandou.',
          2: 'É justamente o que permite o reflexo: se o desafio de um lado pode ser usado no outro, a resposta de um serve para o outro.',
          3: 'A graça do desafio e resposta é a chave nunca viajar. Mandá-la entrega tudo para quem escuta.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'No desafio e resposta de mão dupla, o que derruba o ataque de reflexão?',
      porque: 'No ataque, o atacante abre uma segunda sessão e faz o servidor responder o desafio que ele mesmo mandou na primeira.',
      feito: 'Se a resposta carrega quem respondeu (HMAC da chave sobre identidade e desafio), a resposta do servidor não serve como resposta do cliente. E se quem inicia prova primeiro, o atacante nem chega a receber um desafio para refletir.',
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
        texto: ['Tudo que está acima da assinatura é assinado pela AC: mexeu num campo, a assinatura não confere.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'O que diz'],
          linhas: [
            ['versão e número de série', 'qual certificado é este (a série é o que vai para a lista de revogados)'],
            ['emissor', 'quem assinou: AC Intermediária Exemplo'],
            ['validade', 'não antes de, não depois de'],
            ['sujeito e nomes alternativos', PORTAL],
            ['chave pública do sujeito', 'a chave que o certificado garante'],
            ['extensões', 'pode ou não assinar outros certificados, para que serve'],
            ['assinatura', 'da AC sobre todos os campos acima'],
          ],
        },
      },
      {
        titulo: 'A cadeia até a âncora',
        texto: ['O navegador sobe elo por elo até uma raiz que já vem instalada. Se a raiz não é uma das âncoras, a cadeia não vale nada.'],
        visual: { tipo: 'camadas', camadas: ['AC Raiz Exemplo: âncora de confiança no navegador', 'AC Intermediária Exemplo: assinada pela raiz', `${PORTAL}: assinado pela intermediária`], rotulo: 'PKI' },
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
            ['revogado', 'a lista de revogados (CRL) ou a consulta (OCSP)', 'a chave privada vazou'],
          ],
        },
      },
      {
        titulo: 'Kerberos em seis mensagens',
        texto: ['A senha só abre a primeira resposta, na estação. Depois, os tíquetes fazem o trabalho.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mensagem', 'De quem para quem', 'O que leva'],
          linhas: [
            ['AS-REQ', 'usuário para o servidor de autenticação', 'quem é (sem senha)'],
            ['AS-REP', 'servidor de autenticação para o usuário', 'chave de sessão cifrada com a senha e o TGT'],
            ['TGS-REQ', 'usuário para o servidor de tíquetes', 'TGT, serviço desejado e um autenticador'],
            ['TGS-REP', 'servidor de tíquetes para o usuário', 'tíquete do serviço e nova chave de sessão'],
            ['AP-REQ', 'usuário para o serviço', 'tíquete do serviço e autenticador'],
            ['AP-REP', 'serviço para o usuário', 'a hora mais um: o serviço também prova quem é'],
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
      explicacao: 'Revogação é a AC desfazendo a própria assinatura antes da hora: o número de série entra na lista de revogados, ou a consulta online responde "revogado". Venceu e autoassinado são outros avisos, e servidor fora do ar nem chega ao certificado.',
    },
  },
  desafio: {
    carta: [
      `A empresa que cuida do portal "consertou" o certificado três vezes esta noite, e cada vez o aviso mudou. Agora ${PORTAL} está com um certificado autoassinado, gerado às pressas no próprio servidor.`,
      'O centro de operações quer cada problema visto e entendido no balcão, e o portal de volta com um certificado válido. E a supervisora quer confirmar que, no Kerberos, senha errada não abre nada e não passa pela rede.',
      'Objetivo: ver o navegador parar com o certificado autoassinado, com o de outro nome e com o revogado; deixar o portal com o certificado válido e a página aberta; e um login Kerberos com senha errada recusado.',
    ],
    dicas: [
      'Alterne: no portal, "Ligar HTTPS" com cada tipo de certificado; no atendimento, abra a página segura depois de cada troca.',
      'O último certificado é o válido, e a página precisa abrir sem aviso.',
      'No Kerberos, digite uma senha diferente da cadastrada.',
    ],
    montar: () => lembrar(mundoPortal(8124, 'autoassinado')),
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
        item('login Kerberos com senha errada recusado', !!kerberosCom(m, false)),
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
      ['equip', 'atendimento', 'sg-kerberos', { u: 'atendente', s: 'balcao2026', c: 'Balcao-2026!' }],
    ],
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

function tunelEm(m: Mundo, r: string) {
  return Object.values(tuneisDe(m.equipamentos.get(r)!) ?? {})[0];
}

function tunelAtivo(m: Mundo): boolean {
  const v = m.flags.vpn as Registro | undefined;
  return !!v?.ativo && !!tunelEm(m, 'borda-fdl') && !!tunelEm(m, 'borda-represa');
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
      `A rede privada virtual (VPN) é isso aplicado a duas redes: em vez de uma linha alugada, cada borda cifra o que vai para a outra rede e manda pela internet. A internet só vê pacotes de protocolo 50 (ESP) entre dois endereços públicos. O preço é espaço: o IP novo, o cabeçalho ESP, o vetor de inicialização, o preenchimento, o trailer e o código de integridade somam, no motor do jogo, ${SOBRA_ESP} bytes por pacote. Num enlace de 1500 bytes, o pacote de dentro só pode ter ${MTU_TUNEL}; pacote maior com "não fragmente" volta com erro de ICMP e precisa ser reduzido. (O ESP do jogo usa AES em modo contador; o de verdade costuma usar AES-GCM, que cifra e autentica junto.)`,
      'No sem fio, o meio do caminho é o ar, e qualquer um ao alcance escuta. O WEP, o primeiro esquema, caiu inteiro: usava RC4 com um vetor de inicialização de só 24 bits, que se repete em horas e entrega o fluxo de chave; o código de integridade era um CRC, que dá para ajustar depois de mexer no quadro; e a chave era a mesma para todos e quase nunca mudava. Hoje se quebra em minutos.',
      `O WPA2 deriva uma chave mestra da senha e do nome da rede (no padrão, 4096 rodadas de HMAC-SHA1; no jogo, só 16 de HMAC-SHA256) e, a cada associação, faz o aperto de mão de 4 vias: o ponto de acesso manda um número aleatório, o cliente manda outro com um código de integridade feito com a chave que saiu da senha, e os dois derivam a chave temporária da sessão. O problema: quem captura esse aperto de mão tem tudo para testar senhas em casa, sem falar com ninguém, uma palavra de dicionário por vez, até o código bater. Senha curta e comum cai em segundos. O WPA3 troca a senha compartilhada pelo SAE, uma troca do tipo Diffie-Hellman amarrada à senha: o que passa no ar não serve para testar senha fora dali, e cada palpite exige uma tentativa ao vivo com o ponto de acesso, que desacelera quem erra.`,
    ],
  },
  dicas: [
    'O túnel se configura nos dois roteadores de borda com "Túnel VPN (IPsec) com outro roteador": a outra ponta é o endereço público da outra borda, e as redes daqui e de lá se invertem de um lado para o outro.',
    `O segredo pré-compartilhado precisa ser igual nas duas pontas: ${SEGREDO_VPN}.`,
    `O MTU efetivo aparece em "Ver os túneis": 1500 menos os ${SOBRA_ESP} bytes do ESP.`,
  ],
  perguntas: d125,
  montar: () => lembrar(mundoTunel(7125)),
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
      feito: `IKE fechado: Diffie-Hellman, os dois HMACs do segredo batendo e a associação de segurança com o seu SPI. MTU efetivo ${MTU_TUNEL} bytes.`,
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
      feito: 'Só os IPs públicos das bordas, protocolo 50, o SPI, o número de sequência e uma carga cifrada. Quem fala com quem do lado de dentro, a porta e o conteúdo só as pontas veem.',
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
    montar: () => lembrar(mundoPraca(8125)),
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
