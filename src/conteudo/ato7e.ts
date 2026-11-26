// Dias novos, com prática guiada, aula e desafio no próprio dia.
// Ato 7 (O Cerco): autenticação (8.9), na rede interna da prefeitura, e correio seguro (8.11), entre a escola e a
// loja que imprime os boletins.

import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { ataqueReflexao, diffieHellman, homemNoMeio, responderDesafio } from '../motor/cripto';
import { historicoDe } from '../motor/filtro';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Registro = Record<string, any>;

/** Pergunta de resposta curta, conferida por expressão regular. */
function curta(id: string, texto: string, re: RegExp): Pergunta {
  return { id, texto, confere: (r) => re.test(r.trim()) };
}

/** O registro mais novo de criptografia (m.flags.historico.cripto) com essa operação que satisfaz a condição. */
function cripto(m: Mundo, op: string, f: (x: Registro) => boolean = () => true): Registro | undefined {
  return [...historicoDe(m, 'cripto')].reverse().find((x) => x.op === op && f(x));
}

/* ======================================================================
 * ref 134: Autenticação (8.9)
 * ====================================================================== */

/** Os números de aula do Diffie-Hellman: o motor usa sempre p = 23 e g = 5 (comando dh). */
const P_DH = 23n;
const G_DH = 5n;
const DH_A = 6n;
const DH_B = 15n;
const DH_M = 13n;
const DH = diffieHellman(P_DH, G_DH, DH_A, DH_B);
const MITM = homemNoMeio(P_DH, G_DH, DH_A, DH_B, DH_M);

const DH_A2 = 4n;
const DH_B2 = 9n;
const DH_M2 = 7n;
const DH2 = diffieHellman(P_DH, G_DH, DH_A2, DH_B2);
const MITM2 = homemNoMeio(P_DH, G_DH, DH_A2, DH_B2, DH_M2);

/** O ataque de reflexão do motor, com os desafios padrão (RT-7731 do atacante, RB-4096 de Bob). */
const CHAVE_REFLEXAO = 'chave-do-balcao';
const REFLEXAO_INGENUA = ataqueReflexao(CHAVE_REFLEXAO, false);
const REFLEXAO_PROTEGIDA = ataqueReflexao(CHAVE_REFLEXAO, true);
const RESP_INGENUA = responderDesafio(CHAVE_REFLEXAO, 'RB-4096');
const RESP_BOB = responderDesafio(CHAVE_REFLEXAO, 'RB-4096', 'B|');
const RESP_ALICE = responderDesafio(CHAVE_REFLEXAO, 'RB-4096', 'A|');

const ARQUIVOS = 'arquivos.prefeitura.exemplo';
const URL_ARQUIVOS = `https://${ARQUIVOS}/`;
/** Validade do tíquete de concessão no motor (simularKerberos), em minutos. */
const VALIDADE_TGT = 480;

/**
 * Rede interna da prefeitura (192.168.1.0/24, switch sw): o balcão de atendimento, o resolvedor (que também é o
 * autoritativo de prefeitura.exemplo), o centro de distribuição de chaves (KDC do Kerberos) e o servidor de arquivos,
 * com HTTPS. O r-pref leva para fora, mas hoje nada sai da prefeitura.
 */
function mundoPrefeitura(semente: number): Mundo {
  const m = novoMundo(semente);
  m.flags.aplicacao = true;
  m.flags.seguranca = true;
  const host = (nome: string, ip: string, modelo: string) => adicionar(m, pc(nome, { ip: cidr(ip), gateway: '192.168.1.1', modelo }));
  host('atendimento', '192.168.1.10/24', 'Estação do balcão de atendimento');
  host('kdc', '192.168.1.88/24', 'Centro de distribuição de chaves (Kerberos) da prefeitura');
  host('arquivos', '192.168.1.20/24', 'Servidor de arquivos da prefeitura');
  host('dns1', '192.168.1.53/24', 'Resolvedor de DNS da prefeitura');
  adicionar(m, roteador('r-pref', { modelo: 'Roteador da prefeitura', interfaces: { p1: '192.168.1.1/24', p2: '198.51.100.1/30' } }));
  adicionar(m, comutador('sw', { portas: 8 }));
  ['atendimento', 'kdc', 'arquivos', 'dns1'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw', porta: `p${i + 1}` }, 'cat6', 5));
  ligar(m, { equip: 'sw', porta: 'p8' }, { equip: 'r-pref', porta: 'p1' }, 'cat6', 5);
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('dns1').servicos = {
    dns: {
      zona: 'prefeitura.exemplo',
      recursivo: true,
      registros: [
        { nome: 'arquivos', tipo: 'A', valor: '192.168.1.20', ttl: 300 },
        { nome: 'kdc', tipo: 'A', valor: '192.168.1.88', ttl: 300 },
      ],
    },
  };
  s('arquivos').servicos = { web: { paginas: { '/': { conteudo: '<h1>Arquivos da prefeitura</h1><p>Protocolos, alvarás e contratos.</p>' } }, https: 'valido' } };
  for (const n of ['atendimento', 'kdc', 'arquivos']) s(n).dns = '192.168.1.53';
  return m;
}

function dhSemAtaque(m: Mundo, chave: bigint): Registro | undefined {
  return cripto(m, 'dh', (x) => x.chave === String(chave));
}

function dhComAtaque(m: Mundo, alice: bigint, bob: bigint): Registro | undefined {
  return cripto(m, 'dh-homem-no-meio', (x) => x.chaveAlice === String(alice) && x.chaveBob === String(bob));
}

function kerberosCom(m: Mundo, sucesso: boolean): Registro | undefined {
  return cripto(m, 'kerberos', (x) => x.sucesso === sucesso);
}

/** A navegação https até o servidor de arquivos, com a cadeia válida e as duas metades X25519 de 32 bytes. */
function tlsArquivos(m: Mundo): Registro | undefined {
  return [...historicoDe(m, 'tls')].reverse().find((t) => t.ok === true && t.nome === ARQUIVOS && t.dh?.A?.length === 64 && t.dh?.B?.length === 64);
}

const d134: Pergunta[] = [
  numerica('1', `Com p = ${P_DH}, g = ${G_DH} e os segredos ${DH_A} e ${DH_B}, a que chave Alice e Bob chegam?`, Number(DH.chaveAlice), 0),
  numerica('2', 'No X25519 do TLS, quantos bytes tem cada metade pública que vai pelo fio?', 32, 0),
];

const d134D: Pergunta[] = [
  numerica('1', `Com os segredos ${DH_A2} e ${DH_B2}, a que chave os dois lados chegam sem atacante?`, Number(DH2.chaveAlice), 0),
  numerica('2', `Com o atacante no meio usando o segredo ${DH_M2}, com que chave Alice fica (e o atacante também)?`, Number(MITM2.chaveAlice), 0),
];

const dia134: Dia = {
  numero: 134,
  ato: 7,
  titulo: 'Autenticação',
  chamado: [
    'CHAMADO #0134',
    'O sistema interno da prefeitura ainda autentica o balcão com uma senha que viaja pela rede a cada pedido, e o servidor de arquivos responde a qualquer um que diga "sou o balcão". A auditoria achou um programinha capaz de se passar por qualquer estação.',
    'O centro de operações quer trocar tudo por protocolos que provam identidade sem mandar segredo pelo fio: desafio e resposta, Diffie-Hellman autenticado e o Kerberos que o centro de distribuição de chaves já roda.',
    `Objetivo: entender o ataque de reflexão, combinar uma chave por Diffie-Hellman e ver o homem no meio quebrá-lo, abrir ${URL_ARQUIVOS} e ver o X25519 de verdade, e fazer um login Kerberos completo da atendente.`,
  ],
  manual: {
    titulo: 'Provar quem é sem mandar o segredo',
    texto: [
      `Autenticar é provar quem é. Com uma chave secreta compartilhada, o jeito clássico é desafio e resposta: o servidor manda um número aleatório usado uma vez só (um nonce), e o cliente devolve um HMAC dele com a chave. A chave nunca viaja, e como o desafio não se repete, uma resposta gravada não serve amanhã. O protocolo ingênuo de mão dupla, em que cada lado desafia o outro e os dois respondem com a mesma conta, cai no ataque de reflexão: o atacante abre uma segunda sessão e faz o próprio servidor responder o desafio que recebeu na primeira. No laboratório, a resposta do servidor ao desafio RB-4096 foi ${RESP_INGENUA}, exatamente a que ele esperava de Alice. As regras para não cair: quem inicia a conversa prova primeiro; cada lado usa chave diferente, ou põe a própria identidade na conta (HMAC da chave sobre identidade e desafio: ${RESP_BOB} de Bob contra ${RESP_ALICE} de Alice); e os desafios dos dois lados vêm de conjuntos diferentes. Se a resposta de um lado não serve como resposta do outro, o reflexo morre.`,
      `O Diffie-Hellman deixa duas pontas combinarem uma chave sem ela passar pelo fio. Públicos, um primo p e um gerador g; Alice sorteia a e manda A = g^a mod p, Bob sorteia b e manda B = g^b mod p; cada um eleva o que recebeu ao próprio segredo, e os dois chegam a g^(ab) mod p. Com p = ${P_DH}, g = ${G_DH}, a = ${DH_A} e b = ${DH_B}: A = ${DH.A}, B = ${DH.B} e a chave é ${DH.chaveAlice}. Quem só ouviu p, g, A e B precisa do logaritmo discreto. Os números de aula se resolvem de cabeça; no mundo real, o grupo de corpo finito tem 2048 bits ou mais (RFC 7919), ou a troca vira pontos de uma curva elíptica: o X25519 (RFC 7748), que o TLS do jogo usa, tem segredo, metade pública e resultado de 32 bytes cada, e segurança de cerca de 128 bits. Mas o Diffie-Hellman sozinho não diz com quem você combinou: o homem no meio troca A e B pela metade dele e fecha uma chave com cada lado. Com o segredo ${DH_M} do atacante, Alice fica com ${MITM.chaveAlice}, Bob com ${MITM.chaveBob}, e o atacante tem as duas. A cura é autenticar as metades: no TLS, o servidor assina o aperto de mão com a chave do certificado.`,
      'Com muita gente e muitos serviços, as chaves compartilhadas viram centenas. Um centro de distribuição de chaves (KDC) guarda uma chave para cada um e entrega chaves de sessão sob demanda. O protocolo de Needham-Schroeder faz assim: Alice pede ao KDC uma chave para falar com Bob, mandando um nonce; o KDC devolve, cifrado com a chave de Alice, o nonce, a chave de sessão e um tíquete para Bob (a chave de sessão e o nome de Alice, cifrados com a chave de Bob); Alice entrega o tíquete, e Bob a desafia com um nonce cifrado na chave de sessão. A falha é de repetição: o tíquete não tem data. Quem um dia descobrir uma chave de sessão antiga reapresenta o tíquete velho a Bob e se passa por Alice para sempre. O Otway-Rees, em linhas gerais, põe nonces dos dois lados na conversa com o KDC, para que cada um saiba que a chave é nova; o Kerberos resolve com o tempo.',
      `O Kerberos (RFC 4120) é o KDC de quase toda rede corporativa, em duas partes: o servidor de autenticação (AS) e o servidor de concessão de tíquetes (TGS). Na AS-REQ o usuário só diz quem é; a AS-REP traz uma chave de sessão cifrada com a chave derivada da senha, que a estação abre e esquece, e o tíquete de concessão (TGT), cifrado com a chave do TGS, que o usuário nem consegue ler. Com o TGT e um autenticador (nome e hora, cifrados com a chave de sessão), o usuário pede ao TGS um tíquete para cada serviço (TGS-REQ e TGS-REP), sem digitar a senha de novo. Ao serviço vão o tíquete e um autenticador novo (AP-REQ), e o serviço devolve a hora mais um (AP-REP): autenticação mútua. A hora no autenticador derruba a repetição, por isso os relógios da rede precisam andar juntos (a tolerância costuma ser de 5 minutos), e o TGT vence: no jogo, vale ${VALIDADE_TGT} minutos, 8 horas. No terminal, os tíquetes aparecem como bilhetes.`,
      'A autenticação por chave pública dispensa o KDC: cada lado prova que tem a chave privada do próprio certificado, assinando um desafio ou o aperto de mão inteiro. É o que o servidor faz no TLS, e o que o cliente faz quando apresenta certificado próprio. O custo é a PKI: alguém precisa garantir que aquela chave pública é mesmo de quem diz.',
    ],
  },
  dicas: [
    '"Diffie-Hellman (e o homem no meio)", "Abrir uma página segura (https)" e "Kerberos passo a passo" estão no atendimento.',
    `Sem atacante, deixe o segredo do atacante vazio. A chave é B elevado a a, módulo ${P_DH}.`,
    'O X25519 aparece na saída do aperto de mão do TLS. No Kerberos, a senha digitada igual à cadastrada.',
  ],
  perguntas: d134,
  montar: () => mundoPrefeitura(7134),
  objetivo: (m) => {
    const dh = dhSemAtaque(m, DH.chaveAlice);
    const mitm = dhComAtaque(m, MITM.chaveAlice, MITM.chaveBob);
    const t = tlsArquivos(m);
    const k = kerberosCom(m, true);
    return [
      item(`Diffie-Hellman com p = ${P_DH}, g = ${G_DH}, a = ${DH_A} e b = ${DH_B}, sem atacante`, !!dh, dh ? `A = ${dh.A}, B = ${dh.B}, chave ${dh.chave}` : 'ainda não'),
      item(`o mesmo Diffie-Hellman com o atacante no meio (segredo ${DH_M})`, !!mitm, mitm ? `Alice ficou com ${mitm.chaveAlice}, Bob com ${mitm.chaveBob}` : 'ainda não'),
      item(`${URL_ARQUIVOS} aberto com TLS 1.3 e X25519`, !!t, t ? `metades de ${t.dh.A.length / 2} bytes, cadeia ${t.cadeia}` : 'ainda não'),
      item('login Kerberos completo, com autenticação mútua', !!k, k ? k.etapas.join(', ') : 'ainda não'),
      ...todasRespondidas(m, d134),
    ];
  },
  posMorte: [
    `O programinha da auditoria era um refletor: abria duas conexões com o servidor de arquivos e devolvia a cada uma o desafio da outra. Funcionava porque os dois lados respondiam com a mesma chave e a mesma conta; com a identidade dentro do HMAC, a resposta de Bob (${RESP_BOB}) deixou de servir como a de Alice (${RESP_ALICE}).`,
    `O Diffie-Hellman mostrou por que a assinatura importa. Sem atacante, os segredos ${DH_A} e ${DH_B} levaram os dois lados à chave ${DH.chaveAlice}. Com o atacante no meio trocando as metades públicas, Alice ficou com ${MITM.chaveAlice} e Bob com ${MITM.chaveBob}, ambas conhecidas do atacante, e nenhum dos dois percebeu. No servidor de arquivos, o TLS fez o mesmo Diffie-Hellman em X25519, com metades de 32 bytes, e o servidor assinou o aperto de mão com a chave do certificado: a troca que o atacante fizesse não teria assinatura válida.`,
    `O Kerberos fechou o resto: a atendente digitou a senha uma vez, a estação usou a senha só para abrir a resposta do AS, e daí em diante os tíquetes fizeram o trabalho por ${VALIDADE_TGT} minutos. Seis mensagens, nenhuma com senha, hora em cada autenticador para matar a repetição que derrubava o Needham-Schroeder, e o serviço também provou quem era.`,
  ],
  passos: [
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
      instrucao: 'No desafio e resposta de mão dupla com chave compartilhada, o que derruba o ataque de reflexão?',
      porque: `No ataque, o atacante abre uma segunda sessão e faz o servidor responder o desafio que ele mesmo mandou na primeira. No laboratório, a resposta ${RESP_INGENUA} do servidor serviu como a de Alice.`,
      feito: `Com HMAC(chave, identidade e desafio), Bob responde ${RESP_BOB} e Alice teria de responder ${RESP_ALICE}: o reflexo ${REFLEXAO_PROTEGIDA.sucesso ? 'ainda passa (!)' : 'não serve'}. E se quem inicia prova primeiro, o atacante nem chega a receber um desafio para refletir.`,
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-dh',
      valores: { a: String(DH_A), b: String(DH_B) },
      instrucao: `No atendimento, rode um Diffie-Hellman entre Alice (segredo ${DH_A}) e Bob (segredo ${DH_B}), sem atacante.`,
      porque: 'Cada passo aparece na saída: as metades públicas A e B, e a conta que cada lado faz com o próprio segredo.',
      conferir: (m) => {
        if (dhSemAtaque(m, DH.chaveAlice)) return true;
        if (cripto(m, 'dh-homem-no-meio')) return 'Esse foi com atacante. Deixe o segredo do atacante vazio desta vez.';
        return cripto(m, 'dh') ? `Esses segredos não são os do exercício: Alice ${DH_A}, Bob ${DH_B}.` : 'O Diffie-Hellman ainda não rodou.';
      },
      feito: `A = ${G_DH}^${DH_A} mod ${P_DH} = ${DH.A} e B = ${G_DH}^${DH_B} mod ${P_DH} = ${DH.B} foram pelo fio; ${DH.B}^${DH_A} e ${DH.A}^${DH_B}, módulo ${P_DH}, ficaram em casa.`,
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: String(DH.chaveAlice) },
      instrucao: 'A que chave os dois chegaram?',
      porque: 'É g elevado a a vezes b, módulo p, sem que a nem b tenham saído de casa.',
      feito: `${DH.chaveAlice}. Para quem só ouviu ${DH.A} e ${DH.B}, achar a partir deles o ${DH_A} ou o ${DH_B} é o logaritmo discreto: de cabeça com p = ${P_DH}, fora de alcance com 2048 bits.`,
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-dh',
      valores: { a: String(DH_A), b: String(DH_B) },
      pedir: ['m'],
      exemplo: { m: String(DH_M) },
      instrucao: 'Agora o mesmo Diffie-Hellman com um atacante no meio. Escolha o segredo do atacante.',
      porque: 'O Diffie-Hellman combina uma chave sem ela passar pelo fio, mas não diz com quem você combinou.',
      conferir: (m) => {
        if (dhComAtaque(m, MITM.chaveAlice, MITM.chaveBob)) return true;
        const x = cripto(m, 'dh-homem-no-meio');
        if (x) return `Com esse segredo, Alice ficou com ${x.chaveAlice}. Para o exercício, o segredo do atacante é ${DH_M}.`;
        return 'Preencha o segredo do atacante para ver o homem no meio.';
      },
      feito: `Alice ficou com a chave ${MITM.chaveAlice}, Bob com ${MITM.chaveBob}, e o atacante tem as duas. Sem ataque, os dois teriam chegado a ${DH.chaveAlice}. A cura é autenticar as metades públicas: assinatura com certificado.`,
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'ap-navegar-https',
      valores: { url: URL_ARQUIVOS },
      instrucao: `Abra ${URL_ARQUIVOS} e procure o X25519 no aperto de mão.`,
      porque: 'É o mesmo Diffie-Hellman, numa curva elíptica e com números de verdade, e com o servidor assinando a própria metade.',
      conferir: (m) => {
        if (tlsArquivos(m)) return true;
        const t = m.flags.tls as Registro | undefined;
        return t && t.ok === false ? `O navegador parou: ${t.motivo}.` : 'A página segura do servidor de arquivos ainda não abriu.';
      },
      feito: 'Metade X25519 do cliente e do servidor, 32 bytes cada, pelo fio; o segredo comum, também de 32 bytes, nunca passou. O servidor assinou o aperto de mão com RSA-PSS e a chave do certificado, e o navegador conferiu: homem no meio, aqui, não fecha.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '32' },
      instrucao: 'Quantos bytes tem cada metade pública do X25519?',
      porque: 'O tamanho diz muito sobre a eficiência das curvas: o Diffie-Hellman clássico com a mesma segurança precisaria de uns 3072 bits.',
      feito: '32 bytes, 256 bits, com segurança de cerca de 128 bits. Um Diffie-Hellman de corpo finito com a mesma força manda 384 bytes por metade.',
    }),
    passo({
      alvo: ['equip', 'atendimento'],
      acao: 'sg-kerberos',
      valores: { u: 'atendente', s: 'Balcao-2026!', c: 'Balcao-2026!' },
      instrucao: 'Faça o login da atendente no sistema interno pelo Kerberos.',
      porque: 'Seis mensagens: pedir o tíquete de concessão, recebê-lo, pedir o tíquete do serviço, recebê-lo, apresentá-lo ao serviço e a resposta do serviço.',
      conferir: (m) => {
        if (kerberosCom(m, true)) return true;
        return kerberosCom(m, false) ? 'A senha digitada não bateu com a cadastrada: a resposta do AS não abriu. Use a mesma nas duas.' : 'O Kerberos ainda não rodou.';
      },
      feito: 'AS-REQ, AS-REP, TGS-REQ, TGS-REP, AP-REQ e AP-REP. A senha só abriu a primeira resposta, na própria estação; cada autenticador levou a hora, e o serviço devolveu a hora mais um, provando que também é legítimo.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Desafio e resposta',
        texto: ['O desafio é novo a cada vez; a resposta é um HMAC com a chave que os dois já têm. A chave nunca passa pelo fio.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'Alice (tem a chave K)', x: 100, y: 120 },
            { id: 'b', rotulo: 'servidor (tem a chave K)', x: 500, y: 120 },
          ],
          ligacoes: [
            ['a', 'b', '1. sou Alice'],
            ['b', 'a', '2. desafio RB-4096 (usado uma vez)'],
            ['a', 'b', '3. HMAC(K, desafio)'],
          ],
        },
      },
      {
        titulo: 'O reflexo e a correção',
        texto: ['Com a mesma conta nos dois lados, a resposta do servidor serve como a de Alice. Com a identidade dentro do HMAC, não serve mais.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Protocolo', 'Resposta de Bob a RB-4096', 'O que Bob espera de Alice', 'Atacante entra?'],
          linhas: [
            ['ingênuo: HMAC(K, desafio)', RESP_INGENUA, RESP_INGENUA, REFLEXAO_INGENUA.sucesso ? 'sim' : 'não'],
            ['corrigido: HMAC(K, identidade e desafio)', RESP_BOB, RESP_ALICE, REFLEXAO_PROTEGIDA.sucesso ? 'sim' : 'não'],
          ],
        },
      },
      {
        titulo: 'Diffie-Hellman com números pequenos',
        texto: [`p = ${P_DH} e g = ${G_DH} são públicos. Com o atacante no meio (segredo ${DH_M}), cada lado fecha a chave com ele.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Sem atacante', `Com atacante (m = ${DH_M})`],
          linhas: [
            ['Alice manda', `A = ${DH.A}`, `A = ${DH.A}, que o atacante segura`],
            ['Bob manda', `B = ${DH.B}`, `B = ${DH.B}, que o atacante segura`],
            ['chave de Alice', String(DH.chaveAlice), `${MITM.chaveAlice}, igual à do atacante com ela`],
            ['chave de Bob', String(DH.chaveBob), `${MITM.chaveBob}, igual à do atacante com ele`],
          ],
        },
      },
      {
        titulo: 'Os tamanhos de verdade',
        texto: ['A mesma ideia, com números que ninguém resolve. As curvas fazem com 32 bytes o que o corpo finito faz com centenas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Troca', 'Metade pública', 'Segurança aproximada'],
          linhas: [
            [`aula: p = ${P_DH}`, 'menos de 1 byte', 'nenhuma'],
            ['corpo finito, 2048 bits (RFC 7919)', '256 bytes', '112 bits'],
            ['corpo finito, 3072 bits', '384 bytes', '128 bits'],
            ['X25519 (RFC 7748), a do TLS do jogo', '32 bytes', '128 bits'],
          ],
        },
      },
      {
        titulo: 'Needham-Schroeder e a repetição',
        texto: ['O tíquete sem data pode ser reapresentado anos depois por quem descobriu a chave de sessão antiga. O Kerberos põe hora no autenticador e validade no tíquete.'],
        visual: {
          tipo: 'camadas',
          camadas: ['1. Alice para o KDC: Alice, Bob e um nonce', '2. KDC para Alice, cifrado com a chave de Alice: nonce, chave de sessão e o tíquete para Bob', '3. Alice para Bob: o tíquete (Alice e chave de sessão, cifrados com a chave de Bob)', '4 e 5. Bob desafia com um nonce cifrado na chave de sessão, Alice responde o nonce menos um', 'a falha: o tíquete do passo 3 não tem data, e um velho ainda é aceito'],
          rotulo: 'de cima para baixo',
        },
      },
      {
        titulo: 'Kerberos em seis mensagens',
        texto: [`A senha só abre a primeira resposta, na estação. Depois, os tíquetes fazem o trabalho, por ${VALIDADE_TGT} minutos.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mensagem', 'De quem para quem', 'O que leva'],
          linhas: [
            ['AS-REQ', 'usuário para o AS', 'quem é (sem senha)'],
            ['AS-REP', 'AS para o usuário', 'chave de sessão cifrada com a senha, e o TGT'],
            ['TGS-REQ', 'usuário para o TGS', 'TGT, serviço desejado e um autenticador com a hora'],
            ['TGS-REP', 'TGS para o usuário', 'tíquete do serviço e nova chave de sessão'],
            ['AP-REQ', 'usuário para o serviço', 'tíquete do serviço e um autenticador novo'],
            ['AP-REP', 'serviço para o usuário', 'a hora mais um: o serviço também prova quem é'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que o Diffie-Hellman sozinho não protege contra o homem no meio?',
      opcoes: [
        'Porque ele combina uma chave com quem estiver do outro lado, sem provar quem é; é preciso assinar as metades públicas',
        'Porque a chave passa pelo fio',
        'Porque o logaritmo discreto é fácil',
        'Porque só funciona com números pequenos',
      ],
      certa: 0,
      explicacao: 'A chave nunca passa pelo fio, e com números grandes o logaritmo discreto é inviável. O problema é outro: nada no Diffie-Hellman diz de quem veio cada metade. O atacante no meio troca as metades e fecha uma chave com cada lado. No TLS, o servidor assina o aperto de mão com a chave do certificado.',
    },
  },
  desafio: {
    carta: [
      'A supervisora quer a ficha do treinamento fechada antes da troca de turno, com outros números, para ninguém decorar o exemplo.',
      `Diffie-Hellman entre o balcão (segredo ${DH_A2}) e o servidor (segredo ${DH_B2}), com e sem um atacante de segredo ${DH_M2}. E, no Kerberos, a prova de que senha errada não abre nada e não passa pela rede, e um login certo do fiscal.`,
      'Objetivo: os dois Diffie-Hellman com as chaves respondidas, um login Kerberos com senha errada recusado e o login do fiscal completo.',
    ],
    dicas: [
      `"Diffie-Hellman (e o homem no meio)" no atendimento, com Alice ${DH_A2} e Bob ${DH_B2}; da segunda vez, o atacante ${DH_M2}.`,
      'No Kerberos, digite uma senha diferente da cadastrada; depois, o usuário fiscal com a mesma senha nas duas.',
      `Com atacante, a chave de Alice é (g^m mod ${P_DH}) elevado a a, módulo ${P_DH}.`,
    ],
    perguntas: d134D,
    montar: () => mundoPrefeitura(8134),
    objetivo: (m) => {
      const dh = dhSemAtaque(m, DH2.chaveAlice);
      const mitm = dhComAtaque(m, MITM2.chaveAlice, MITM2.chaveBob);
      const ok = cripto(m, 'kerberos', (x) => x.sucesso === true);
      return [
        item(`Diffie-Hellman com os segredos ${DH_A2} e ${DH_B2}, sem atacante`, !!dh, dh ? `chave ${dh.chave}` : 'ainda não'),
        item(`o mesmo com o atacante de segredo ${DH_M2}`, !!mitm, mitm ? `Alice ${mitm.chaveAlice}, Bob ${mitm.chaveBob}` : 'ainda não'),
        item('login Kerberos com senha errada recusado', !!kerberosCom(m, false)),
        item('login Kerberos completo', !!ok, ok ? ok.etapas.join(', ') : 'ainda não'),
        ...todasRespondidas(m, d134D),
      ];
    },
    solucao: [
      ['equip', 'atendimento', 'sg-dh', { a: String(DH_A2), b: String(DH_B2), m: '' }],
      ['equip', 'atendimento', 'sg-dh', { a: String(DH_A2), b: String(DH_B2), m: String(DH_M2) }],
      ['equip', 'atendimento', 'sg-kerberos', { u: 'atendente', s: 'balcao2026', c: 'Balcao-2026!' }],
      ['equip', 'atendimento', 'sg-kerberos', { u: 'fiscal', s: 'Fiscal-Obras-26', c: 'Fiscal-Obras-26' }],
    ],
    respostas: { '1': String(DH2.chaveAlice), '2': String(MITM2.chaveAlice) },
  },
};

/* ======================================================================
 * ref 135: Correio seguro (8.11)
 * ====================================================================== */

const CONTATO = 'contato@loja.exemplo';
const BIA = 'bia@escola.exemplo';
const ANA = 'ana@escola.exemplo';
/** Chave RSA de 2048 bits: a chave de sessão embrulhada (RSAES-PKCS1-v1_5, RFC 8017) sai com 2048 / 8 bytes. */
const BYTES_EMBRULHO = 2048 / 8;
/** Base64 (RFC 4648): cada 3 bytes viram 4 caracteres. */
const CARACTERES_EMBRULHO = Math.ceil(BYTES_EMBRULHO / 3) * 4;

/**
 * A rede da escola (192.168.1.0/24, switch sw): ana, bia, dns1 (resolvedor, autoritativo de escola.exemplo),
 * mxesc (correio da escola) e a bancada do laboratório (espiao, na porta p5, espelhada). r1 e r2 levam à rede
 * pública 203.0.113.0/24, com a loja (DNS de loja.exemplo, com o MX), o servidor de correio da loja e caio, que
 * lê a caixa contato@loja.exemplo e já publicou a chave pública.
 */
function mundoCorreio(o: { semente: number; desafio: boolean }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.aplicacao = true;
  m.flags.seguranca = true;
  const host = (nome: string, ip: string, gw: string, modelo: string) => adicionar(m, pc(nome, { ip: cidr(ip), gateway: gw, modelo }));
  host('ana', '192.168.1.10/24', '192.168.1.1', 'PC da secretaria da escola');
  host('bia', '192.168.1.11/24', '192.168.1.1', 'PC da coordenação da escola');
  host('dns1', '192.168.1.53/24', '192.168.1.1', 'Resolvedor da escola');
  host('mxesc', '192.168.1.25/24', '192.168.1.1', 'Servidor de correio da escola');
  host('espiao', '192.168.1.66/24', '192.168.1.1', 'Bancada de testes do centro de operações');
  host('loja', '203.0.113.10/24', '203.0.113.1', 'Servidor da loja: DNS de loja.exemplo');
  host('correio', '203.0.113.25/24', '203.0.113.1', 'Servidor de correio da loja');
  host('caio', '203.0.113.30/24', '203.0.113.1', 'PC do atendimento da loja');
  adicionar(m, roteador('r1', { modelo: 'Roteador da escola', interfaces: { p1: '192.168.1.1/24', p2: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('r2', { modelo: 'Roteador do provedor', interfaces: { p1: '198.51.100.2/30', p2: '203.0.113.1/24' }, rotas: [{ destino: '192.168.1.0/24', via: '198.51.100.1' }] }));
  adicionar(m, comutador('sw', { portas: 8 }));
  adicionar(m, comutador('sw2', { portas: 8 }));
  ['ana', 'bia', 'dns1', 'mxesc', 'espiao'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw', porta: `p${i + 1}` }, 'cat6', 5));
  ligar(m, { equip: 'sw', porta: 'p8' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r2', porta: 'p1' }, 'cat6', 90);
  ligar(m, { equip: 'r2', porta: 'p2' }, { equip: 'sw2', porta: 'p8' }, 'cat6', 5);
  ['loja', 'correio', 'caio'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw2', porta: `p${i + 1}` }, 'cat6', 5));
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('loja').servicos = {
    dns: {
      zona: 'loja.exemplo',
      registros: [
        { nome: '@', tipo: 'MX', valor: 'correio', prioridade: 10, ttl: 3600 },
        { nome: 'correio', tipo: 'A', valor: '203.0.113.25', ttl: 3600 },
      ],
    },
  };
  s('dns1').servicos = { dns: { zona: 'escola.exemplo', recursivo: true, registros: [{ nome: '@', tipo: 'MX', valor: 'mx', prioridade: 5 }, { nome: 'mx', tipo: 'A', valor: '192.168.1.25' }] } };
  s('mxesc').servicos = { correio: { dominio: 'escola.exemplo' } };
  s('correio').servicos = { correio: { dominio: 'loja.exemplo', caixas: ['contato'] } };
  for (const n of ['ana', 'bia', 'mxesc', 'espiao', 'loja', 'correio', 'caio']) s(n).dns = '192.168.1.53';
  // Quem recebe já tem par de chaves e publicou a pública.
  s('caio').correio = { endereco: CONTATO, servidor: '203.0.113.25' };
  s('caio').pgp = true;
  s('bia').correio = { endereco: BIA, servidor: '192.168.1.25' };
  // A porta p5, da bancada, espelha o switch inteiro: é por ela que o laboratório olha o tráfego.
  if (!o.desafio) s('sw').espelho = 'p5';
  return m;
}

/** Uma carta assinada e cifrada de quem para quem, entregue (m.flags.historico.pgp). */
function cartaSegura(m: Mundo, de: string, para: string): boolean {
  return historicoDe(m, 'pgp').some((p) => p.de === de && p.para === para && p.assinada && p.cifrada && p.entregue);
}

/** A caixa de quem foi lida, com uma mensagem PGP de quem mandou e a assinatura conferida. */
function lidaConferida(m: Mundo, por: string, de: string): boolean {
  return historicoDe(m, 'correioLido').some((x) => x.endereco === por && (x.lidas as Registro[] | undefined)?.some((l) => l.pgp && l.assinaturaValida === true && String(l.de).toLowerCase().includes(de)));
}

interface RegistroFarejar {
  de?: string;
  emClaro?: number;
  segredos?: string[];
}

const d135: Pergunta[] = [
  numerica('1', 'A chave de sessão embrulhada com a chave pública RSA de 2048 bits da loja vai em quantos bytes?', BYTES_EMBRULHO, 0),
];

const d135D: Pergunta[] = [
  curta('1', 'Na carta da ana, o que vai cifrado com a chave pública de quem recebe: o texto inteiro ou só a chave de sessão? (responda "texto" ou "chave")', /^(a\s+)?chave(\s+de\s+sess[aã]o)?$/i),
];

const dia135: Dia = {
  numero: 135,
  ato: 7,
  titulo: 'Correio seguro',
  chamado: [
    'CHAMADO #0135',
    'A coordenação da escola manda as notas finais para a loja que imprime os boletins, e hoje cedo alguém da loja leu em voz alta, no balcão, uma nota que ainda nem tinha saído. O correio passa em claro por dois servidores e um provedor, e fica guardado na caixa do servidor da loja.',
    'O laboratório do centro de operações tem uma bancada na porta espelhada do switch da escola. A loja já tem par de chaves PGP e publicou a chave pública de contato@loja.exemplo.',
    'Objetivo: gerar as chaves da coordenação, mandar as notas assinadas e cifradas, ver a loja abrir e conferir a assinatura, farejar o que passou e responder em quantos bytes vai a chave de sessão embrulhada.',
  ],
  manual: {
    titulo: 'Correio de ponta a ponta',
    texto: [
      'Correio comum é um cartão-postal: o SMTP leva o texto em claro, e cada servidor do caminho guarda uma cópia. Cifrar o enlace (STARTTLS) protege um trecho por vez, mas cada servidor ainda lê tudo, e a mensagem fica em claro na caixa. Segurança de verdade no correio é de ponta a ponta: só quem escreveu e quem recebe leem, e quem recebe consegue provar quem escreveu. Os dois padrões que fazem isso são o PGP (OpenPGP, RFC 4880 e RFC 9580) e o S/MIME (RFC 8551).',
      `O PGP junta tudo que o ato ensinou num envelope só, de dentro para fora. Assina: calcula o resumo SHA-256 do texto e assina o resumo com a chave privada de quem manda (RSA de 2048 bits). Comprime texto e assinatura, para a mensagem ficar menor e com menos padrão (o PGP do jogo pula essa parte). Cifra: sorteia uma chave de sessão nova, AES de 128 bits, e cifra texto e assinatura com ela em AES-GCM, que põe uma etiqueta de 128 bits: mexeu num bit no servidor, não abre. Embrulha: cifra só a chave de sessão, 16 bytes, com a chave pública de quem recebe; com RSA de 2048 bits, o embrulho sai com ${BYTES_EMBRULHO} bytes. A cifra de chave pública é lenta e cara por byte; por isso ela só embrulha a chave, e a simétrica cuida do texto. Blinda: codifica tudo em base64, porque o correio só leva texto, e cada 3 bytes viram 4 caracteres (os ${BYTES_EMBRULHO} bytes do embrulho viram ${CARACTERES_EMBRULHO}), entre as linhas BEGIN PGP MESSAGE e END PGP MESSAGE.`,
      'Quem recebe faz o caminho de volta: tira o base64, abre a chave de sessão com a própria chave privada, confere a etiqueta do GCM e decifra, e confere a assinatura com a chave pública de quem mandou. O PGP esconde o conteúdo, não quem fala com quem: os cabeçalhos De, Para, Assunto e os Received continuam em claro, e o assunto, portanto, não deve contar segredo.',
      'De onde vem a chave pública certa? No PGP, cada pessoa tem um anel de chaves privadas (as suas) e um anel de chaves públicas (as dos outros), cada chave com um identificador curto e uma impressão digital. A confiança é uma teia, sem autoridade no centro: você confere a impressão digital pessoalmente, ou por telefone, e assina aquela chave; quem confia em você passa a confiar nela também, e cada um decide quanto confia em quem apresenta chaves. Quem aceita uma chave pública sem conferir está aberto ao homem no meio do mesmo jeito que o navegador sem certificado.',
      'O S/MIME faz a mesma conta de assinar e cifrar (no formato CMS, RFC 5652), mas a chave pública vem dentro de um certificado X.509 com o endereço de correio no SAN, emitido por uma autoridade certificadora, como na web. A diferença é a de onde vem a confiança: hierarquia de ACs, que os programas de correio de empresa já trazem configurada, contra a teia de pessoas. O S/MIME é mais fácil de distribuir numa organização; o PGP não depende de ninguém além de quem você conhece.',
    ],
  },
  dicas: [
    'O PGP fica no PC bia: primeiro "Gerar chaves PGP", depois "Mandar e-mail assinado e cifrado" para contato@loja.exemplo.',
    'Na loja, caio lê a caixa com "Ler a caixa de correio". Na bancada espiao, "Farejar a rede".',
    `RSA de 2048 bits: o embrulho tem o tamanho do módulo, 2048 ÷ 8 bytes.`,
  ],
  perguntas: d135,
  montar: () => mundoCorreio({ semente: 5135, desafio: false }),
  objetivo: (m) => {
    const f = m.flags.farejar as RegistroFarejar | undefined;
    const viu = !!f && f.de === 'espiao' && (f.emClaro ?? 0) > 0 && (f.segredos ?? []).length === 0;
    return [
      item('par de chaves PGP da coordenação (bia)', !!m.equipamentos.get('bia')!.s.pgp, m.equipamentos.get('bia')!.s.pgp ? 'gerado' : 'ainda não'),
      item(`notas da bia para ${CONTATO}, assinadas e cifradas com PGP, entregues`, cartaSegura(m, BIA, CONTATO), m.flags.pgp?.entregue ? 'entregue' : 'ainda não'),
      item('caio abriu as notas na loja e conferiu a assinatura da bia', lidaConferida(m, CONTATO, BIA), m.flags.correioLido ? `${m.flags.correioLido.mensagens} mensagem(ns) lida(s)` : 'ainda não leu'),
      item('a bancada farejou: o SMTP passou em claro, o corpo não', viu, f ? `${f.emClaro ?? 0} em claro, segredos: ${(f.segredos ?? []).length}` : 'ainda não farejou'),
      ...todasRespondidas(m, d135),
    ];
  },
  posMorte: [
    'A nota vazou porque correio comum é cartão-postal: as notas saíram em claro do PC da coordenação, passaram pelo servidor da escola, pelo provedor e ficaram guardadas no servidor da loja, onde qualquer um com acesso à caixa lia. Com o PGP, a bia assinou o resumo do texto com a chave privada dela, uma chave de sessão AES-128 sorteada cifrou texto e assinatura em AES-GCM, e só essa chave de sessão foi embrulhada com a chave pública de contato@loja.exemplo.',
    `Na caixa do servidor ficou um bloco em base64 entre BEGIN e END, com o embrulho de ${BYTES_EMBRULHO} bytes dentro. Só a chave privada do caio abriu a chave de sessão; a etiqueta do GCM conferiu, e a assinatura bateu com a chave pública da bia. A bancada, na porta espelhada, pegou as conversas SMTP e as consultas de MX em claro, com quem mandou para quem; no corpo, só o bloco ilegível: o PGP esconde o conteúdo, não quem fala com quem.`,
    'A loja e a escola combinaram conferir as impressões digitais das chaves por telefone, uma vez, e assinar a chave uma da outra: o começo de uma teia de confiança. E o assunto dos e-mails passou a ser só "Notas", sem número nenhum.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Não: o STARTTLS cifra cada trecho, mas cada servidor do caminho lê e guarda a mensagem em claro',
          'Sim: com STARTTLS ninguém mais lê a mensagem',
          'Sim, desde que o servidor da loja também use STARTTLS',
          'Não, porque o STARTTLS não cifra nada',
        ],
        certa: 0,
        errada: {
          1: 'Quem escuta o fio, não. Mas o servidor da escola, o do provedor e o da loja recebem a mensagem decifrada, e ela fica assim na caixa.',
          2: 'Mesmo com todos os trechos cifrados, a mensagem é decifrada em cada servidor e guardada em claro na caixa. O vazamento foi justamente na loja.',
          3: 'O STARTTLS cifra, sim, mas só o trecho entre dois servidores. É proteção de enlace, não de ponta a ponta.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Ligar o STARTTLS em todos os servidores resolveria o vazamento das notas?',
      porque: 'A nota vazou dentro da loja, na caixa do servidor, e não no fio.',
      feito: 'Cifra de enlace protege um trecho por vez. Para o servidor da loja não conseguir ler, a cifra tem de ser feita no PC de quem escreve e desfeita só no de quem lê: ponta a ponta.',
    }),
    passo({
      alvo: ['equip', 'bia'],
      acao: 'sg-pgp',
      instrucao: 'No PC bia, gere o par de chaves PGP da coordenação.',
      porque: 'Assinar pede a chave privada de quem manda; a pública vai para os outros conferirem a assinatura e cifrarem para você.',
      conferir: (m) => (m.equipamentos.get('bia')!.s.pgp ? true : 'O par de chaves da bia ainda não existe.'),
      feito: 'Par de chaves RSA de 2048 bits de bia@escola.exemplo, com um identificador de 64 bits tirado de um resumo da chave pública. A privada fica só no PC, no anel de chaves privadas; a pública entra no anel de chaves públicas de quem a recebe.',
    }),
    passo({
      alvo: ['equip', 'bia'],
      acao: 'sg-correio-seguro',
      valores: { para: CONTATO, assunto: 'Notas', corpo: 'Notas finais do 9º ano: conferidas pela coordenação.' },
      instrucao: `Mande as notas para ${CONTATO}, assinadas e cifradas.`,
      porque: 'O PGP assina com a chave privada da bia e cifra para a chave pública da loja. Só quem tem a privada da loja abre.',
      conferir: (m) => {
        if (cartaSegura(m, BIA, CONTATO)) return true;
        const p = (m.flags.pgp ?? {}) as Registro;
        if (p.para && p.para !== CONTATO) return `Foi para ${p.para}. As notas vão para ${CONTATO}, que publicou a chave pública.`;
        return 'A carta segura ainda não foi entregue.';
      },
      feito: `Resumo SHA-256 assinado, chave de sessão AES-128 sorteada cifrando texto e assinatura em AES-GCM, chave de sessão embrulhada em ${BYTES_EMBRULHO} bytes com a pública da loja, tudo em base64. Submissão pela 587 ao servidor da escola, MX da loja, SMTP até o servidor dela.`,
    }),
    passo({
      alvo: ['equip', 'caio'],
      acao: 'ap-correio-ler',
      valores: { proto: 'imap' },
      instrucao: 'Na loja, caio lê a caixa de contato@loja.exemplo.',
      porque: 'Quem recebe faz o caminho de volta: base64, chave de sessão aberta com a privada, etiqueta do GCM, texto, e a assinatura conferida com a pública de quem mandou.',
      conferir: (m) => (lidaConferida(m, CONTATO, BIA) ? true : 'A caixa ainda não foi lida, ou a carta da bia ainda não chegou.'),
      feito: 'Decifrado com a chave privada do caio, a etiqueta do AES-GCM conferiu, e a assinatura da bia bateu: íntegra e de quem diz ser. No servidor, a mensagem continua sendo só o bloco blindado.',
    }),
    passo({
      alvo: ['equip', 'espiao'],
      acao: 'sg-farejar',
      instrucao: 'Na bancada, que está na porta espelhada do switch da escola, fareje a rede.',
      porque: 'É o ponto de vista de quem escuta no caminho, e também o de um servidor curioso: tudo que o SMTP leva.',
      conferir: (m) => {
        const f = m.flags.farejar as RegistroFarejar | undefined;
        if (!f) return 'Ainda não farejou.';
        return (f.emClaro ?? 0) > 0 ? true : 'Nada passou em claro ainda. Mande a carta da bia antes de farejar.';
      },
      feito: 'Em claro: a conversa SMTP da bia com o servidor da escola e a dele com o da loja (o resumo de cada uma já diz "bia@escola.exemplo para contato@loja.exemplo"), e as consultas de MX e A que o servidor da escola fez. Dentro do SMTP vão em claro também MAIL FROM, RCPT TO e os cabeçalhos De, Para e Assunto; o corpo é só BEGIN PGP MESSAGE, base64 ilegível e END. Quem escuta sabe quem mandou para quem e quando; não sabe as notas.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: String(BYTES_EMBRULHO) },
      instrucao: 'Em quantos bytes foi a chave de sessão embrulhada?',
      porque: 'No RSA, o cifrado é um número menor que o módulo n, escrito sempre com o tamanho de n.',
      feito: `${BYTES_EMBRULHO} bytes, para embrulhar uma chave de 16. Em base64, ${CARACTERES_EMBRULHO} caracteres. É por isso que a chave pública só embrulha a chave, e o texto vai na simétrica.`,
    }),
    passo({
      escolha: {
        opcoes: [
          'Um certificado X.509 com o endereço, emitido por uma autoridade certificadora',
          'A teia de confiança: pessoas assinando chaves de pessoas',
          'O próprio servidor de correio da loja',
          'O DNS da loja',
        ],
        certa: 0,
        errada: {
          1: 'Essa é a resposta do PGP. O S/MIME confia numa hierarquia de autoridades, como a web.',
          2: 'O servidor é justamente quem não deveria precisar de confiança: ele guarda a mensagem e não deve conseguir ler.',
          3: 'O DNS diz para onde mandar a mensagem (o MX), não de quem é a chave.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Se a escola e a loja usassem S/MIME em vez de PGP, quem garantiria que a chave pública é de contato@loja.exemplo?',
      porque: 'PGP e S/MIME assinam e cifram do mesmo jeito; a diferença é de onde vem a confiança na chave.',
      feito: 'No S/MIME, a chave vem num certificado X.509 com o endereço de correio no SAN, e a cadeia sobe até uma AC raiz, como no navegador. No PGP, vem de quem você conhece, conferida pela impressão digital.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Enlace ou ponta a ponta',
        texto: ['O STARTTLS protege cada trecho; o PGP protege a mensagem. A diferença está no que fica guardado nos servidores.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Sem nada', 'STARTTLS', 'PGP ou S/MIME'],
          linhas: [
            ['quem escuta o fio', 'lê tudo', 'não lê', 'lê só os cabeçalhos'],
            ['os servidores do caminho', 'leem tudo', 'leem tudo', 'leem só os cabeçalhos'],
            ['a caixa no servidor da loja', 'em claro', 'em claro', 'bloco blindado'],
            ['prova de quem escreveu', 'nenhuma', 'nenhuma', 'assinatura'],
          ],
        },
      },
      {
        titulo: 'O envelope do PGP',
        texto: ['Assinar usa a chave de quem manda; cifrar usa a de quem recebe. A cifra pesada só embrulha a chave de sessão.'],
        visual: {
          tipo: 'camadas',
          camadas: [`base64 entre BEGIN e END: 3 bytes viram 4 caracteres`, `chave de sessão embrulhada com a chave PÚBLICA de quem recebe: ${BYTES_EMBRULHO} bytes`, 'texto e assinatura cifrados com a chave de sessão: AES-128-GCM, etiqueta de 128 bits', '(compressão, que o PGP do jogo pula)', 'assinatura: resumo SHA-256 do texto, assinado com a chave PRIVADA de quem manda', 'o texto das notas'],
          rotulo: 'de fora para dentro',
        },
      },
      {
        titulo: 'Os números do envelope',
        texto: ['Cada peça com o seu padrão, e todos batem com o que o terminal mostra.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Peça', 'Como', 'Tamanho'],
          linhas: [
            ['resumo', 'SHA-256', '32 bytes'],
            ['assinatura', 'RSA PKCS#1 v1.5, chave de 2048 bits', '256 bytes'],
            ['chave de sessão', 'AES-128, sorteada a cada mensagem', '16 bytes'],
            ['etiqueta', 'AES-GCM', '16 bytes (128 bits)'],
            ['embrulho da chave', 'RSA PKCS#1 v1.5 com a pública de quem recebe', `${BYTES_EMBRULHO} bytes, ${CARACTERES_EMBRULHO} caracteres em base64`],
          ],
        },
      },
      {
        titulo: 'A teia de confiança',
        texto: ['Sem autoridade no centro: cada um assina as chaves que conferiu pessoalmente e decide em quem confia para apresentar chaves.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'bia', rotulo: 'bia', x: 90, y: 60 },
            { id: 'caio', rotulo: 'caio (contato da loja)', x: 300, y: 60 },
            { id: 'ana', rotulo: 'ana', x: 90, y: 200 },
            { id: 'graf', rotulo: 'gráfica da loja', x: 510, y: 200 },
          ],
          ligacoes: [
            ['bia', 'caio', 'conferiu a impressão digital e assinou'],
            ['ana', 'bia', 'confia na bia para apresentar chaves'],
            ['caio', 'graf', 'assinou a chave da gráfica'],
          ],
        },
      },
      {
        titulo: 'PGP ou S/MIME?',
        texto: ['Os dois assinam e cifram o corpo do mesmo jeito. A diferença é de onde vem a confiança na chave pública.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'PGP (RFC 4880, RFC 9580)', 'S/MIME (RFC 8551)'],
          linhas: [
            ['a chave pública vem', 'de quem você conhece, num anel de chaves', 'num certificado X.509, com o endereço no SAN'],
            ['quem garante', 'a teia de confiança: pessoas assinam chaves de pessoas', 'uma autoridade certificadora'],
            ['formato', 'pacotes OpenPGP, blindados em base64', 'CMS (RFC 5652) dentro do MIME'],
            ['os cabeçalhos De, Para, Assunto', 'em claro', 'em claro'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Num e-mail com PGP, por que o texto é cifrado com uma chave de sessão aleatória, e não direto com a chave pública de quem recebe?',
      opcoes: [
        'Porque a cifra de chave pública é lenta: ela só cifra a chave de sessão, pequena, e a cifra simétrica cuida do texto',
        'Porque a chave pública de quem recebe é secreta',
        'Porque a chave de sessão é a mesma para todos os e-mails, e assim o servidor consegue ler',
        'Porque o base64 só funciona com chave simétrica',
      ],
      certa: 0,
      explicacao: 'Cifra de chave pública custa caro por byte e só cabe um bloco do tamanho do módulo. O PGP sorteia uma chave de sessão nova a cada mensagem, cifra o texto com ela numa cifra simétrica rápida e usa a chave pública só para embrulhar essa chave. Quem recebe abre a chave de sessão com a privada e decifra o resto.',
    },
  },
  desafio: {
    carta: [
      'Na manhã seguinte, a secretaria (ana) também precisa mandar documentos para a loja, mas nunca configurou o correio nem tem chaves. E a loja quer responder cifrado, assinado pelo caio.',
      'Objetivo: a conta da ana no servidor da escola, a carta dela assinada e cifrada para contato@loja.exemplo, aberta e conferida na loja, a resposta do caio assinada e cifrada para a ana, aberta e conferida na secretaria, e a pergunta respondida.',
    ],
    dicas: [
      'A conta da ana é ana@escola.exemplo, no servidor 192.168.1.25. Depois, chaves PGP e o e-mail seguro, como fez a bia.',
      'O caio só consegue cifrar para a ana depois que ela gerar as chaves dela. Cada um lê a própria caixa com "Ler a caixa de correio".',
      'Na carta, a chave pública da loja embrulha só a chave de sessão.',
    ],
    perguntas: d135D,
    montar: () => mundoCorreio({ semente: 6135, desafio: true }),
    objetivo: (m) => [
      item('carta da ana para contato@loja.exemplo, assinada e cifrada, entregue', cartaSegura(m, ANA, CONTATO), m.equipamentos.get('ana')!.s.correio ? 'conta configurada' : 'sem conta de correio'),
      item('caio abriu a carta da ana e conferiu a assinatura', lidaConferida(m, CONTATO, ANA)),
      item('resposta do caio para a ana, assinada e cifrada, entregue', cartaSegura(m, CONTATO, ANA)),
      item('ana abriu a resposta e conferiu a assinatura do caio', lidaConferida(m, ANA, CONTATO)),
      ...todasRespondidas(m, d135D),
    ],
    solucao: [
      ['equip', 'ana', 'ap-correio-conta', { end: ANA, srv: '192.168.1.25' }],
      ['equip', 'ana', 'sg-pgp'],
      ['equip', 'ana', 'sg-correio-seguro', { para: CONTATO, assunto: 'Documentos', corpo: 'Seguem os documentos da secretaria.' }],
      ['equip', 'caio', 'ap-correio-ler', { proto: 'imap' }],
      ['equip', 'caio', 'sg-correio-seguro', { para: ANA, assunto: 'Recebido', corpo: 'Documentos recebidos. Os boletins saem na sexta.' }],
      ['equip', 'ana', 'ap-correio-ler', { proto: 'imap' }],
    ],
    respostas: { '1': 'chave' },
  },
};

export const ATO7E: Dia[] = [dia134, dia135];
