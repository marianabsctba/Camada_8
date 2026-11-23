// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// O fim do ato: a cidade vira um sistema autônomo e ganha rota para o mundo (BGP, 5.7.7), a rádio chega
// só a quem pediu (multicast, 5.7.8) e as brigas de quem paga o quê na camada de rede (5.8).

import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { bgpDe, sessoesBgp, type ConfigBgp } from '../motor/protocolos';
import type { Relacao } from '../motor/rotear';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

function traceRegistro(m: Mundo, de: string, ip: string): { chegou: boolean; saltos: (string | null)[] } | undefined {
  return m.flags.traceroutes?.[`${de}>${ip}`];
}

/** Sessão BGP do roteador com o vizinho de tal IP, de pé. */
function sessaoOk(m: Mundo, r: string, ip: string): boolean {
  return sessoesBgp(m).some((s) => s.de === r && s.ip === ip && s.estabelecida);
}

function relacaoCom(m: Mundo, r: string, ip: string): Relacao | undefined {
  return bgpDe(m.equipamentos.get(r)!)?.vizinhos.find((v) => v.ip === ip)?.relacao;
}

interface MelhorBgp {
  caminho: number[];
  de: string | null;
  relacao: string;
}

/** Melhor rota BGP de um roteador para um prefixo, como o motor calculou no último comando. */
function melhorBgp(m: Mundo, r: string, prefixo: string): MelhorBgp | undefined {
  return m.flags.bgp?.melhores?.[r]?.[prefixo];
}

/* ======================================================================
 * O pedaço da internet em volta de Fim de Linha (dias 98 e 100)
 * ====================================================================== */

const AS_FIM = 64500;
const AS_ESTRADA = 64501;
const AS_VIZINHA = 64502;
const AS_ATALHO = 64511;

type VizinhoBgp = ConfigBgp['vizinhos'][number];

function ligarBgp(m: Mundo, r: string, asn: number, vizinhos: VizinhoBgp[], anuncia: string[]): void {
  m.equipamentos.get(r)!.s.bgp = { asn, vizinhos, anuncia } satisfies ConfigBgp;
}

/**
 * Fim de Linha (borda, 192.0.2.0/24), o provedor Estrada Larga (estrada, com o portal do mundo em 203.0.113.0/24)
 * e a cidade vizinha (vizinha, 198.51.100.0/24). A borda tem um enlace para o provedor e outro direto para a vizinha.
 * O provedor e a vizinha já falam BGP; a borda só se "bordaPronta".
 */
function mundoAs(o: {
  semente: number;
  bordaPronta: boolean;
  /** Relação que a vizinha tem com a borda (o que a borda é para ela). */
  vizinhaVeBorda: Relacao;
  /** Relação que a borda tem com a vizinha, quando pronta. */
  bordaVeVizinha?: Relacao;
  /** Um cliente novo do provedor anunciando um pedaço do bloco de Fim de Linha. */
  sequestro?: boolean;
  /** O enlace da borda até o provedor começa derrubado. */
  provedorCaido?: boolean;
}): Mundo {
  const m = novoMundo(o.semente);
  m.flags.camadaRede = true;
  // No dia do sequestro, o bloco está dividido em redes /26: a prefeitura embaixo, a biblioteca em cima.
  const lan = o.sequestro ? 26 : 24;
  adicionar(m, pc('prefeitura', { ip: cidr(`192.0.2.10/${lan}`), gateway: '192.0.2.1', modelo: 'PC da prefeitura de Fim de Linha' }));
  adicionar(m, pc('portal', { ip: cidr('203.0.113.10/24'), gateway: '203.0.113.1', modelo: 'Servidor do portal de serviços do estado (o "mundo")' }));
  adicionar(m, pc('camara-viz', { ip: cidr('198.51.100.10/24'), gateway: '198.51.100.1', modelo: 'PC da câmara da cidade vizinha' }));
  adicionar(m, roteador('borda', { modelo: 'Roteador de borda Fronteira 4 (Fim de Linha)', interfaces: { lan: `192.0.2.1/${lan}`, prov: '10.0.1.2/30', viz: '10.0.2.1/30', ...(o.sequestro ? { bib: '192.0.2.129/26' } : {}) } }));
  adicionar(
    m,
    roteador('estrada', {
      modelo: 'Roteador do provedor Estrada Larga',
      interfaces: { fim: '10.0.1.1/30', mundo: '203.0.113.1/24', viz: '10.0.3.1/30', ...(o.sequestro ? { atalho: '10.0.4.1/30' } : {}) },
    }),
  );
  adicionar(m, roteador('vizinha', { modelo: 'Roteador da cidade vizinha', interfaces: { fim: '10.0.2.2/30', lan: '198.51.100.1/24', prov: '10.0.3.2/30' } }));
  ligar(m, { equip: 'prefeitura', porta: 'eth0' }, { equip: 'borda', porta: 'lan' }, 'cat6', 10, { id: 'c1' });
  ligar(m, { equip: 'borda', porta: 'prov' }, { equip: 'estrada', porta: 'fim' }, 'cat6', 90, { id: 'c2' });
  ligar(m, { equip: 'borda', porta: 'viz' }, { equip: 'vizinha', porta: 'fim' }, 'cat6', 90, { id: 'c3' });
  ligar(m, { equip: 'estrada', porta: 'mundo' }, { equip: 'portal', porta: 'eth0' }, 'cat6', 10, { id: 'c4' });
  ligar(m, { equip: 'estrada', porta: 'viz' }, { equip: 'vizinha', porta: 'prov' }, 'cat6', 90, { id: 'c5' });
  ligar(m, { equip: 'vizinha', porta: 'lan' }, { equip: 'camara-viz', porta: 'eth0' }, 'cat6', 10, { id: 'c6' });
  m.proxCabo = 7;

  const clientesEstrada: VizinhoBgp[] = [
    { ip: '10.0.1.2', asn: AS_FIM, relacao: 'cliente' },
    { ip: '10.0.3.2', asn: AS_VIZINHA, relacao: 'cliente' },
  ];
  if (o.sequestro) {
    adicionar(m, pc('biblioteca', { ip: cidr('192.0.2.130/26'), gateway: '192.0.2.129', modelo: 'PC da biblioteca municipal' }));
    ligar(m, { equip: 'borda', porta: 'bib' }, { equip: 'biblioteca', porta: 'eth0' }, 'cat6', 40, { id: 'c8' });
    adicionar(m, roteador('atalho', { modelo: 'Roteador da Rede Atalho (cliente novo do provedor)', interfaces: { prov: '10.0.4.2/30' } }));
    ligar(m, { equip: 'estrada', porta: 'atalho' }, { equip: 'atalho', porta: 'prov' }, 'cat6', 60, { id: 'c7' });
    m.proxCabo = 9;
    clientesEstrada.push({ ip: '10.0.4.2', asn: AS_ATALHO, relacao: 'cliente' });
    ligarBgp(m, 'atalho', AS_ATALHO, [{ ip: '10.0.4.1', asn: AS_ESTRADA, relacao: 'provedor' }], ['192.0.2.0/25']);
  }
  ligarBgp(m, 'estrada', AS_ESTRADA, clientesEstrada, ['203.0.113.0/24']);
  ligarBgp(
    m,
    'vizinha',
    AS_VIZINHA,
    [
      { ip: '10.0.3.1', asn: AS_ESTRADA, relacao: 'provedor' },
      { ip: '10.0.2.1', asn: AS_FIM, relacao: o.vizinhaVeBorda },
    ],
    ['198.51.100.0/24'],
  );
  if (o.bordaPronta) {
    ligarBgp(
      m,
      'borda',
      AS_FIM,
      [
        { ip: '10.0.1.1', asn: AS_ESTRADA, relacao: 'provedor' },
        { ip: '10.0.2.2', asn: AS_VIZINHA, relacao: o.bordaVeVizinha ?? 'par' },
      ],
      ['192.0.2.0/24'],
    );
  }
  if (o.provedorCaido) {
    m.equipamentos.get('borda')!.portas.find((p) => p.nome === 'prov')!.desligada = true;
    m.flags.derrubadas = ['borda:prov'];
  }
  return m;
}

/* ======================================================================
 * ref 98: BGP (5.7.7)
 * ====================================================================== */

const d98: Pergunta[] = [texto('1', 'Qual é o caminho de AS que a borda usa para chegar em 198.51.100.0/24? Escreva os números separados por espaço.', /^64502$/)];
const d98D: Pergunta[] = [numerica('1', 'Qual é o número do AS que anunciou o pedaço do bloco de Fim de Linha?', AS_ATALHO, 0)];

const dia98: Dia = {
  numero: 98,
  ato: 4,
  titulo: 'BGP',
  chamado: [
    'CHAMADO #0098',
    'Chegou do registro regional de endereços a carta que a cidade esperava desde o ato 0: Fim de Linha agora é o sistema autônomo 64500, dono do bloco 192.0.2.0/24. O provedor Estrada Larga (AS 64501) e a cidade vizinha (AS 64502) já ligaram o lado deles e mandaram um bilhete conjunto: "falta só vocês dizerem ao mundo quem são".',
    'O contrato diz que a Estrada Larga é provedora (a cidade paga) e que a vizinha é par (troca de graça, só o tráfego de uma para a outra).',
    'Objetivo: o BGP ligado na borda com as duas sessões de pé, o bloco 192.0.2.0/24 anunciado, ping da prefeitura até o portal do mundo, traceroute até a câmara da vizinha e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Roteamento entre sistemas autônomos',
    texto: [
      'A internet não é uma rede: é uma federação de dezenas de milhares de redes independentes, cada uma com seu dono, seus roteadores e suas regras. Cada uma delas é um sistema autônomo (AS), identificado por um número. Dentro de um AS, quem decide o caminho é um protocolo de gateway interior, como o OSPF da cidade: ali todo mundo é da mesma casa e o objetivo é só achar o caminho mais curto. Entre um AS e outro, quem decide é o protocolo de gateway exterior, e na internet inteira só existe um: o BGP (Border Gateway Protocol).',
      'Entre redes de donos diferentes, o caminho mais curto quase nunca é a pergunta certa. A pergunta é "posso, quero e quanto custa?". Uma rede não quer carregar de graça o tráfego entre dois estranhos; um governo pode não querer que seus pacotes passem por certo país; uma empresa prefere o enlace que já pagou. Por isso o BGP é um protocolo de política: cada AS escolhe, por regra própria, quais rotas aceita, qual prefere e para quem repassa cada uma.',
      'Dois roteadores de borda vizinhos abrem uma sessão BGP (uma conversa TCP que fica aberta) e trocam anúncios. Um anúncio diz "chego no prefixo tal" e leva o caminho de AS: a lista de sistemas autônomos que o anúncio atravessou, com quem originou no fim. Cada AS que repassa põe o próprio número na frente. Isso serve para duas coisas: quem recebe vê o próprio número no caminho e descarta (sem laço), e o tamanho do caminho vira um critério de escolha. É um vetor de distância que, em vez de distância, carrega o caminho inteiro.',
      'As relações comerciais mandam em tudo. Cliente paga ao provedor para chegar na internet inteira; dois pares trocam de graça só o tráfego entre si e os clientes deles. Daí sai a regra de exportação: o que é meu ou de cliente eu anuncio para todo mundo (quanto mais gente me usar para chegar nos meus clientes, mais eles me pagam); o que aprendi de par ou de provedor eu só anuncio para cliente (senão eu carregaria de graça o tráfego entre dois estranhos). E sai a regra de escolha: primeiro a preferência local, que aqui é 200 para rota de cliente, 100 para par e 50 para provedor; só no empate vale o caminho de AS mais curto.',
      'O ponto fraco é a confiança. Um AS pode anunciar um prefixo que não é dele, por erro de digitação ou de propósito. Pior: se anunciar um pedaço mais específico (um /25 dentro do /24 de outro), vence em todo lugar, porque o encaminhamento sempre escolhe o prefixo mais longo, antes de qualquer preferência. É o sequestro de prefixo. A defesa é filtrar: o provedor só aceita do cliente os blocos que o cliente comprovadamente tem.',
    ],
  },
  dicas: [
    'Na borda, primeiro ligue o BGP com o número que a cidade recebeu. Depois configure os dois vizinhos com o AS e a relação de cada um.',
    'Provedor: 10.0.1.1, AS 64501, relação provedor. Vizinha: 10.0.2.2, AS 64502, relação par. Depois anuncie 192.0.2.0/24.',
    'Com tudo de pé, ping da prefeitura para 203.0.113.10 e traceroute para 198.51.100.10. O "Ver o BGP" mostra o caminho de AS de cada rota.',
  ],
  perguntas: d98,
  montar: () => mundoAs({ semente: 498, bordaPronta: false, vizinhaVeBorda: 'par' }),
  objetivo: (m) => {
    const tr = traceRegistro(m, 'prefeitura', '198.51.100.10');
    const noProvedor = melhorBgp(m, 'estrada', '192.0.2.0/24');
    return [
      item('BGP ligado na borda como AS 64500', bgpDe(m.equipamentos.get('borda')!)?.asn === AS_FIM),
      item('sessão com o provedor (10.0.1.1) de pé, com relação provedor', sessaoOk(m, 'borda', '10.0.1.1') && relacaoCom(m, 'borda', '10.0.1.1') === 'provedor'),
      item('sessão com a vizinha (10.0.2.2) de pé, com relação par', sessaoOk(m, 'borda', '10.0.2.2') && relacaoCom(m, 'borda', '10.0.2.2') === 'par'),
      item('o provedor aprendeu 192.0.2.0/24 com origem no AS 64500', !!noProvedor && noProvedor.caminho.at(-1) === AS_FIM, noProvedor ? `caminho de AS ${noProvedor.caminho.join(' ')}` : 'o provedor ainda não ouviu falar do bloco'),
      pingOk(m, 'prefeitura', '203.0.113.10'),
      item('traceroute da prefeitura até 198.51.100.10 chegando direto pela vizinha', !!tr && tr.chegou && tr.saltos.includes('10.0.2.2') && !tr.saltos.includes('10.0.1.1'), tr ? tr.saltos.map((x) => x ?? '*').join(' > ') : 'ainda não foi feito'),
      ...todasRespondidas(m, d98),
    ];
  },
  posMorte: [
    'Antes do BGP, a borda só conhecia as próprias redes. O provedor e a vizinha estavam com a sessão armada e parada, esperando o outro lado: sessão BGP só sobe quando os dois se configuram, com o número de AS certo de cada lado. Assim que a borda virou AS 64500 e apontou para os dois, as sessões subiram e as rotas chegaram sozinhas, cada uma com o caminho de AS.',
    'Para chegar em 198.51.100.0/24, a borda recebeu duas ofertas: direto da vizinha, caminho 64502, de par (preferência 100), e pelo provedor, caminho 64501 64502, de provedor (preferência 50). Aqui as duas regras concordam, a de política e a do caminho curto. Mas a ordem importa: se o provedor oferecesse um caminho mais curto, ainda assim a borda escolheria o par, porque tráfego pelo par é de graça e pelo provedor é pago. No BGP, quem decide primeiro é o dinheiro, e só depois a geometria.',
    'O anúncio do 192.0.2.0/24 foi para os dois vizinhos, porque é próprio. Mas repare no que a borda não fez: não repassou à vizinha as rotas que aprendeu do provedor, nem ao provedor as da vizinha. Se repassasse, a cidade viraria passagem grátis entre os dois, pagando o trânsito do provedor para carregar tráfego que não é dela. É a regra de exportação que impede Fim de Linha de virar o atalho de ninguém.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Porque entre redes de donos diferentes vale a política (quem paga, quem aceita), não só o caminho mais curto',
          'Porque o OSPF não aguenta mais de três roteadores',
          'Porque o BGP é mais rápido para achar o caminho mais curto',
          'Porque o BGP não precisa de vizinhos configurados',
        ],
        certa: 0,
        errada: {
          1: 'O OSPF aguenta centenas de roteadores, e a cidade usa ele dentro de casa. O problema não é tamanho: é que o provedor nunca deixaria a cidade ver o mapa inteiro da rede dele.',
          2: 'O BGP nem tenta achar o caminho mais curto primeiro. Ele escolhe pela preferência local, que vem do contrato, e só desempata pelo tamanho do caminho de AS.',
          3: 'Pelo contrário: no BGP cada vizinho é configurado à mão, dos dois lados, com o número do AS. Ninguém vira vizinho de ninguém por acaso.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Dentro da cidade já roda OSPF. Por que, para falar com o provedor e com a vizinha, o protocolo é outro?',
      porque: 'O OSPF supõe que todo mundo confia em todo mundo e compartilha o mapa inteiro, buscando o menor custo. Entre sistemas autônomos, cada dono esconde a própria rede e decide por contrato o que carrega para quem.',
      feito: 'Dentro do AS, gateway interior (OSPF, menor custo). Entre AS, gateway exterior (BGP, política). Cada protocolo no seu andar.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'rot-bgp-as',
      pedir: ['asn'],
      exemplo: { asn: '64500' },
      instrucao: 'Na borda, ligue o BGP com o número do sistema autônomo que a cidade recebeu.',
      porque: 'Esse número vai na frente do caminho de AS de tudo o que a cidade anunciar, e é por ele que os vizinhos reconhecem a sessão.',
      conferir: (m) => {
        const asn = bgpDe(m.equipamentos.get('borda')!)?.asn;
        return asn === AS_FIM ? true : asn === AS_ESTRADA || asn === AS_VIZINHA ? 'Esse número é de um vizinho. Dois AS com o mesmo número se confundem: cada um descarta o anúncio do outro achando que é laço. O da cidade é 64500.' : 'O número que o registro deu para Fim de Linha está na carta: 64500.';
      },
      feito: 'Fim de Linha é o AS 64500. Por enquanto, um AS sozinho no mundo, sem vizinho nenhum.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'rot-bgp-vizinho',
      valores: { ip: '10.0.1.1', asn: '64501' },
      pedir: ['rel'],
      exemplo: { rel: 'provedor' },
      instrucao: 'Configure o vizinho Estrada Larga (10.0.1.1, AS 64501) com a relação que o contrato diz.',
      porque: 'A relação é o que o vizinho é para a cidade. A cidade paga a Estrada Larga para chegar na internet inteira, então ela é provedora.',
      conferir: (m) => {
        const r = relacaoCom(m, 'borda', '10.0.1.1');
        if (r === 'provedor') return sessaoOk(m, 'borda', '10.0.1.1') ? true : 'A relação está certa, mas a sessão não subiu. Confira se o AS do vizinho é 64501.';
        if (r === 'cliente') return 'Cliente é quem paga a cidade. Aqui é a cidade que paga a Estrada Larga, e com essa relação a borda exportaria para ela até as rotas da vizinha, virando trânsito de graça.';
        return 'Par é troca de graça, só entre os dois. A Estrada Larga cobra para levar a cidade ao mundo inteiro: é provedora.';
      },
      feito: 'Sessão estabelecida com o AS 64501. Em seguida chegou o anúncio do 203.0.113.0/24, o portal do mundo, com caminho de AS 64501.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'rot-bgp-vizinho',
      valores: { ip: '10.0.2.2', asn: '64502' },
      pedir: ['rel'],
      exemplo: { rel: 'par' },
      instrucao: 'Agora a cidade vizinha (10.0.2.2, AS 64502), também com a relação do contrato.',
      porque: 'As duas cidades trocam de graça o tráfego entre elas, sem que uma vire passagem da outra para o resto do mundo. Isso é ser par.',
      conferir: (m) => {
        const r = relacaoCom(m, 'borda', '10.0.2.2');
        if (r === 'par') return sessaoOk(m, 'borda', '10.0.2.2') ? true : 'A relação está certa, mas a sessão não subiu. Confira se o AS do vizinho é 64502.';
        if (r === 'provedor') return 'Com a vizinha como provedora, a borda trataria as rotas dela como pagas (preferência 50) e as duas cidades discordariam do contrato: ela configurou a cidade como par.';
        return 'Como cliente, a vizinha pagaria a cidade e receberia tudo, inclusive as rotas do provedor. O contrato é de troca entre iguais: par.';
      },
      feito: 'Segunda sessão de pé. A vizinha anunciou 198.51.100.0/24, e o provedor também, com caminho 64501 64502. A borda tem duas ofertas para o mesmo prefixo.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'rot-bgp-anunciar',
      pedir: ['p'],
      exemplo: { p: '192.0.2.0/24' },
      instrucao: 'Anuncie ao mundo o bloco da cidade.',
      porque: 'Até aqui a cidade ouve, mas ninguém sabe chegar nela. A resposta do portal para 192.0.2.10 morreria no provedor, sem rota de volta.',
      conferir: (m) => {
        const a = bgpDe(m.equipamentos.get('borda')!)?.anuncia ?? [];
        if (a.includes('192.0.2.0/24')) return true;
        if (a.some((p) => p.startsWith('203.0.113') || p.startsWith('198.51.100'))) return 'Esse bloco é de outro AS. Anunciar o que não é seu é sequestro de prefixo, e o tráfego dele viria parar aqui. O da cidade é 192.0.2.0/24.';
        return 'O bloco da cidade, que está na carta do registro, é 192.0.2.0/24.';
      },
      feito: 'O anúncio saiu com caminho de AS 64500. O provedor repassou para a vizinha como 64501 64500, e a internet inteira agora sabe o caminho até Fim de Linha.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'ping',
      valores: { destino: '203.0.113.10', n: '4' },
      instrucao: 'Da prefeitura, faça ping no portal do mundo (203.0.113.10).',
      porque: 'Ida pela rota BGP da borda até o provedor; volta pela rota que o provedor aprendeu do anúncio da cidade. Os dois sentidos dependem do BGP.',
      conferir: (m) => pingOk(m, 'prefeitura', '203.0.113.10').ok || (registroPing(m, 'prefeitura', '203.0.113.10') ? 'O ping não voltou inteiro. Confira as duas sessões e o anúncio no "Ver o BGP".' : 'O ping ainda não foi feito.'),
      feito: 'Quatro respostas. Pela primeira vez, Fim de Linha tem rota para o mundo aprendida, e não digitada.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'traceroute',
      valores: { destino: '198.51.100.10' },
      instrucao: 'Agora um traceroute da prefeitura até a câmara da vizinha (198.51.100.10).',
      porque: 'São duas ofertas para o mesmo destino: pelo par, caminho 64502, e pelo provedor, caminho 64501 64502. O traceroute mostra qual venceu.',
      conferir: (m) => (traceRegistro(m, 'prefeitura', '198.51.100.10')?.chegou ? true : 'O traceroute não chegou até 198.51.100.10.'),
      feito: 'Três linhas: borda, vizinha (10.0.2.2) e a câmara. O provedor não aparece: rota de par tem preferência 100, de provedor só 50, e o par venceu antes mesmo de contar o caminho.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '64502' },
      instrucao: 'Qual é o caminho de AS que a borda usa para chegar em 198.51.100.0/24?',
      porque: 'O caminho de AS de uma rota começa no vizinho de quem ela veio e termina em quem originou o prefixo. O traceroute acabou de mostrar de qual vizinho veio.',
      feito: 'Só 64502: a vizinha é ao mesmo tempo quem entrega e quem originou. A alternativa, 64501 64502, ficou guardada como reserva.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Uma federação de sistemas autônomos',
        texto: [
          'Cada AS é uma rede com um dono e uma política. Dentro, um protocolo interior (como o OSPF) acha o caminho mais curto. Entre eles, o BGP leva anúncios de prefixo com o caminho de AS.',
          'Números de AS como 64500 a 64511 são reservados para documentação, como os blocos 192.0.2.0/24, 198.51.100.0/24 e 203.0.113.0/24.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'fim', rotulo: 'AS 64500 Fim de Linha', x: 120, y: 160 },
            { id: 'est', rotulo: 'AS 64501 Estrada Larga', x: 330, y: 50 },
            { id: 'viz', rotulo: 'AS 64502 vizinha', x: 540, y: 160 },
            { id: 'mundo', rotulo: 'o resto da internet', x: 330, y: 250 },
          ],
          ligacoes: [
            ['fim', 'est', 'cliente paga provedor'],
            ['viz', 'est', 'cliente paga provedor'],
            ['fim', 'viz', 'pares: troca de graça'],
            ['est', 'mundo', 'trânsito'],
          ],
        },
      },
      {
        titulo: 'O anúncio leva o caminho',
        texto: [
          'Quem repassa um anúncio põe o próprio número na frente. Quem recebe e já se vê no caminho descarta: é assim que o BGP evita laço. E o tamanho do caminho serve de desempate.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['a vizinha origina: 198.51.100.0/24, caminho 64502', 'o provedor repassa: 198.51.100.0/24, caminho 64501 64502', 'a borda recebe as duas versões e escolhe uma', 'se o anúncio voltasse para a vizinha, ela veria 64502 no caminho e descartaria'],
          rotulo: 'um prefixo, dois caminhos de AS',
        },
      },
      {
        titulo: 'Quem paga quem, e o que vai para quem',
        texto: [
          'Rota própria ou de cliente vai para todos os vizinhos. Rota de par ou de provedor vai só para clientes. Assim ninguém carrega de graça o tráfego entre dois estranhos.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Rota aprendida de', 'Preferência local', 'Repasso para cliente?', 'Repasso para par ou provedor?'],
          linhas: [
            ['eu mesmo (prefixo próprio)', '1000', 'sim', 'sim'],
            ['cliente (ele me paga)', '200', 'sim', 'sim'],
            ['par (troca de graça)', '100', 'sim', 'não'],
            ['provedor (eu pago)', '50', 'sim', 'não'],
          ],
        },
      },
      {
        titulo: 'Como o BGP escolhe',
        texto: [
          'Primeiro a preferência local, que vem do contrato: rota de cliente dá dinheiro, de par é de graça, de provedor custa. Só no empate entra o caminho de AS mais curto. Um caminho longo de cliente vence um curto de provedor.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Oferta para 198.51.100.0/24', 'De quem', 'Preferência', 'Caminho', 'Resultado'],
          linhas: [
            ['direto da vizinha', 'par', '100', '64502', 'vence'],
            ['pelo provedor', 'provedor', '50', '64501 64502', 'reserva'],
          ],
        },
      },
      {
        titulo: 'Sequestro de prefixo',
        texto: [
          'O BGP acredita no que ouve. Se um AS anuncia um pedaço mais específico do bloco de outro, o encaminhamento escolhe o prefixo mais longo em todo roteador, antes de olhar preferência ou caminho, e o tráfego daquele pedaço vai para quem mentiu.',
          'A defesa é o provedor filtrar o que aceita de cada cliente, e o dono do bloco vigiar quem anuncia o quê.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Anúncio', 'Origem', 'Pacote para 192.0.2.10 vai para'],
          linhas: [
            ['192.0.2.0/24', 'AS 64500 (o dono)', 'Fim de Linha, se não houver nada mais específico'],
            ['192.0.2.0/25', 'AS 64511 (quem errou)', 'o AS 64511: /25 é mais longo que /24'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um AS recebe a mesma rota de um cliente, com caminho de quatro AS, e de um provedor, com caminho de dois. Qual ele escolhe?',
      opcoes: [
        'A do cliente: a preferência local vem antes do tamanho do caminho',
        'A do provedor: o caminho de AS é mais curto',
        'As duas, dividindo o tráfego meio a meio',
        'Nenhuma: caminho com mais de três AS é descartado',
      ],
      certa: 0,
      explicacao: 'O BGP olha primeiro a preferência local, que reflete o contrato: rota de cliente (200) vence rota de provedor (50). O caminho mais curto só desempata entre rotas de mesma preferência.',
    },
  },
  desafio: {
    carta: [
      'Segunda-feira, oito da manhã: metade da prefeitura não recebe nada de fora. O portal do estado não responde para a prefeitura (192.0.2.10), e a câmara da vizinha também não. Já a biblioteca (192.0.2.130), na outra metade do bloco, funciona normalmente. Desde a semana passada o bloco está dividido em redes /26: a prefeitura na 192.0.2.0/26, a biblioteca na 192.0.2.128/26.',
      'A Estrada Larga ligou um cliente novo no fim de semana, a Rede Atalho. O suporte de lá jura que "não mexeu em nada da cidade". O BGP da borda já está todo configurado como no dia anterior.',
      'Objetivo: o portal e a câmara da vizinha voltando a alcançar a prefeitura, e a pergunta respondida. Filtrar o cliente novo é com o provedor; a cidade só controla o que ela mesma anuncia.',
    ],
    dicas: [
      'Olhe o BGP no roteador do provedor ou da vizinha. Tem um prefixo ali que não deveria existir, e um ALERTA explicando.',
      'A Rede Atalho anuncia 192.0.2.0/25. Mais específico vence sempre. Como a cidade vence um /25 sem depender de ninguém?',
      'Anuncie na borda os dois /26 que formam o /25 sequestrado: 192.0.2.0/26 e 192.0.2.64/26. Depois ping do portal e da câmara para 192.0.2.10.',
    ],
    perguntas: d98D,
    respostas: { '1': String(AS_ATALHO) },
    montar: () => mundoAs({ semente: 3098, bordaPronta: true, vizinhaVeBorda: 'par', sequestro: true }),
    objetivo: (m) => {
      const prov = melhorBgp(m, 'estrada', '192.0.2.0/26');
      return [
        pingOk(m, 'portal', '192.0.2.10'),
        pingOk(m, 'camara-viz', '192.0.2.10'),
        item('o provedor chega na metade de baixo do bloco por uma rota originada no AS 64500', !!prov && prov.caminho.at(-1) === AS_FIM, prov ? `caminho de AS ${prov.caminho.join(' ')}` : 'nenhuma rota mais específica que o /25 da Rede Atalho'),
        ...todasRespondidas(m, d98D),
      ];
    },
    solucao: [
      ['equip', 'estrada', 'rot-bgp-ver'],
      ['equip', 'borda', 'rot-bgp-anunciar', { p: '192.0.2.0/26' }],
      ['equip', 'borda', 'rot-bgp-anunciar', { p: '192.0.2.64/26' }],
      ['equip', 'portal', 'ping', { destino: '192.0.2.10', n: '4' }],
      ['equip', 'camara-viz', 'ping', { destino: '192.0.2.10', n: '4' }],
    ],
  },
};

/* ======================================================================
 * ref 99: Multicast (5.7.8)
 * ====================================================================== */

const RADIO = '239.10.0.1';
const TV = '239.20.0.5';

interface Ouvinte {
  nome: string;
  modelo: string;
  grupos?: string[];
}

/**
 * A rede dos bairros: o r-centro no meio, ligado a r-norte, r-sul e r-leste; o r-oeste fica depois do r-leste.
 * Cada roteador tem uma rede local com um aparelho (10.40.0.0/24 no centro, 10.41 a 10.44 nos bairros).
 */
function mundoBairros(semente: number, aparelhos: Record<'r-centro' | 'r-norte' | 'r-sul' | 'r-leste' | 'r-oeste', Ouvinte>): Mundo {
  const m = novoMundo(semente);
  m.flags.camadaRede = true;
  const lans: Record<string, number> = { 'r-centro': 40, 'r-norte': 41, 'r-sul': 42, 'r-leste': 43, 'r-oeste': 44 };
  adicionar(m, roteador('r-centro', { modelo: 'Roteador Praça 6 (centro)', interfaces: { lan: '10.40.0.1/24', norte: '10.40.1.1/30', sul: '10.40.2.1/30', leste: '10.40.3.1/30' } }));
  adicionar(m, roteador('r-norte', { modelo: 'Roteador Praça 6 (bairro norte)', interfaces: { centro: '10.40.1.2/30', lan: '10.41.0.1/24' } }));
  adicionar(m, roteador('r-sul', { modelo: 'Roteador Praça 6 (bairro sul)', interfaces: { centro: '10.40.2.2/30', lan: '10.42.0.1/24' } }));
  adicionar(m, roteador('r-leste', { modelo: 'Roteador Praça 6 (bairro leste)', interfaces: { centro: '10.40.3.2/30', lan: '10.43.0.1/24', oeste: '10.40.4.1/30' } }));
  adicionar(m, roteador('r-oeste', { modelo: 'Roteador Praça 6 (bairro oeste)', interfaces: { leste: '10.40.4.2/30', lan: '10.44.0.1/24' } }));
  let n = 1;
  const cabo = (a: [string, string], b: [string, string], metros: number) => ligar(m, { equip: a[0], porta: a[1] }, { equip: b[0], porta: b[1] }, 'cat6', metros, { id: `c${n++}` });
  cabo(['r-centro', 'norte'], ['r-norte', 'centro'], 90);
  cabo(['r-centro', 'sul'], ['r-sul', 'centro'], 90);
  cabo(['r-centro', 'leste'], ['r-leste', 'centro'], 90);
  cabo(['r-leste', 'oeste'], ['r-oeste', 'leste'], 90);
  for (const [r, x] of Object.entries(aparelhos)) {
    const rede = lans[r]!;
    const h = pc(x.nome, { ip: cidr(`10.${rede}.0.10/24`), gateway: `10.${rede}.0.1`, modelo: x.modelo });
    if (x.grupos?.length) h.s.grupos = [...x.grupos];
    adicionar(m, h);
    cabo([r, 'lan'], [x.nome, 'eth0'], 30);
  }
  m.proxCabo = n;
  return m;
}

interface ArvoreMulticast {
  origem: string;
  membros: string[];
  arestas: string[];
  podadas: string[];
  copias: number;
}

function arvore(m: Mundo, grupo: string): ArvoreMulticast | undefined {
  return m.flags.multicast?.[grupo];
}

function grupos(m: Mundo, nome: string): string[] {
  return (m.equipamentos.get(nome)!.s.grupos as string[] | undefined) ?? [];
}

const d99: Pergunta[] = [numerica('1', 'Com o norte e o oeste ouvindo, quantas cópias de cada pacote da rádio atravessam enlaces entre roteadores?', 3, 0)];
const d99D: Pergunta[] = [numerica('1', 'Na árvore da TV, depois de tudo arrumado, quantos galhos foram podados?', 1, 0)];

const dia99: Dia = {
  numero: 99,
  ato: 4,
  titulo: 'Multicast',
  chamado: [
    'CHAMADO #0099',
    'A rádio comunitária Fim de Linha FM quer transmitir pela rede, ao vivo, o programa "Bom Dia, Fim de Linha", das seis às nove. O locutor está animado; o roteador do centro, nem tanto: mandar uma cópia do áudio para cada ouvinte, uma por uma, derrubaria o enlace no primeiro intervalo comercial.',
    'Nesta manhã, só uma casa do bairro norte e uma do oeste querem ouvir. A rádio fica atrás do r-centro e vai transmitir no grupo 239.10.0.1.',
    'Objetivo: as duas casas no grupo, a árvore multicast montada a partir do r-centro chegando só onde tem ouvinte, e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Um para muitos, só para quem pediu',
    texto: [
      'Unicast é um para um: cada pacote tem um destino. Difusão (broadcast) é um para todos. Multicast é o meio-termo: um para um grupo, e só para quem pediu para entrar nele. Para a rádio, a diferença é enorme. Com unicast, mil ouvintes custam mil cópias saindo do estúdio; com multicast, sai uma cópia, e os roteadores só duplicam o pacote onde o caminho se divide.',
      'Um grupo multicast é um endereço IPv4 da classe D: de 224.0.0.0 a 239.255.255.255, o bloco 224.0.0.0/4. Ele não é de nenhuma máquina; é um canal. Alguns têm uso fixo: 224.0.0.1 é "todos os hosts desta rede" e 224.0.0.2, "todos os roteadores desta rede", e nenhum pacote para 224.0.0.0/24 passa de um roteador. A faixa 239.0.0.0/8 é de uso local, como os endereços privados: serve para a rádio da cidade sem atrapalhar ninguém lá fora.',
      'Como o roteador sabe quem quer ouvir? Pelo IGMP (Internet Group Management Protocol). De tempos em tempos o roteador pergunta na rede local "alguém aqui quer algum grupo?", para 224.0.0.1, e cada host interessado responde com um relatório de participação. Quando o último ouvinte avisa que saiu (ou para de responder), o roteador para de levar aquele grupo para aquela rede. O IGMP só fala entre host e roteador, dentro da rede local.',
      'Entre roteadores, o roteamento multicast monta uma árvore. Na árvore por origem, cada fonte tem a sua: parte-se da árvore de difusão a partir da fonte e se poda todo galho que não leva a nenhum ouvinte. É simples e dá o caminho mais curto, mas com muitas fontes são muitas árvores. Na árvore compartilhada, existe um roteador central, o ponto de encontro: as fontes mandam para ele e uma árvore só, a partir dele, alcança todos os membros. Gasta menos memória, às vezes com caminho mais longo.',
      'É assim que funciona TV e rádio por IP numa rede de provedor: cada canal é um grupo, trocar de canal é sair de um grupo e entrar em outro, e o roteador só leva até o bairro os canais que alguém ali está assistindo. Na internet aberta, entre AS diferentes, multicast quase não existe, porque ninguém quer combinar árvores e cobranças com estranhos. Dentro de uma rede só, com um dono só, ele brilha.',
    ],
  },
  dicas: [
    'Primeiro as casas pedem para entrar no grupo 239.10.0.1: o PC manda o relatório IGMP para o roteador do bairro.',
    'As duas casas que querem ouvir são a casa-norte e a casa-oeste. Depois, no r-centro, monte a árvore multicast do grupo.',
    'Conte as cópias olhando a árvore depois da poda: cada enlace da árvore leva uma cópia de cada pacote.',
  ],
  perguntas: d99,
  montar: () =>
    mundoBairros(499, {
      'r-centro': { nome: 'radio', modelo: 'Computador de transmissão da Fim de Linha FM' },
      'r-norte': { nome: 'casa-norte', modelo: 'PC de uma casa do bairro norte' },
      'r-sul': { nome: 'casa-sul', modelo: 'PC de uma casa do bairro sul' },
      'r-leste': { nome: 'casa-leste', modelo: 'PC de uma casa do bairro leste' },
      'r-oeste': { nome: 'casa-oeste', modelo: 'PC de uma casa do bairro oeste' },
    }),
  objetivo: (m) => {
    const a = arvore(m, RADIO);
    return [
      item('a casa-norte entrou no grupo 239.10.0.1', grupos(m, 'casa-norte').includes(RADIO)),
      item('a casa-oeste entrou no grupo 239.10.0.1', grupos(m, 'casa-oeste').includes(RADIO)),
      item('árvore do grupo montada a partir do r-centro, chegando só ao norte e ao oeste', !!a && a.origem === 'r-centro' && a.membros.join(',') === 'r-norte,r-oeste', a ? `membros: ${a.membros.join(', ') || 'nenhum'}` : 'ainda não foi montada'),
      ...todasRespondidas(m, d99),
    ];
  },
  posMorte: [
    'Quando a casa-norte entrou no grupo, ela mandou um relatório IGMP para o r-norte, e só para ele: o IGMP não sai da rede local. Daí em diante, o r-norte passou a contar como "roteador com ouvinte". O mesmo com a casa-oeste e o r-oeste. A casa-sul e a casa-leste não pediram nada.',
    'O r-centro montou a árvore de difusão a partir dele (quatro enlaces, uma cópia para cada roteador) e podou o galho do sul, onde ninguém ouve. Sobraram três enlaces: centro até o norte, centro até o leste e leste até o oeste. O leste ficou na árvore mesmo sem ouvinte, porque é passagem obrigatória para o oeste. A casa-leste não recebe o áudio, mas o r-leste repassa.',
    'Para a rádio, isso quer dizer uma cópia saindo do estúdio, não importa se são dois ou dois mil ouvintes. Se amanhã o bairro sul inteiro ligar o rádio, o galho volta a crescer, com uma cópia a mais no enlace centro-sul e nenhuma a mais na saída da rádio. É por isso que multicast é o jeito certo de fazer rádio e TV dentro de uma rede.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['239.10.0.1', '10.40.0.10', '255.255.255.255', '224.0.0.1'],
        certa: 0,
        errada: {
          1: 'Esse é o endereço do computador da rádio. Pacote para ele vai para uma máquina só: é unicast.',
          2: 'Esse é o broadcast: todo mundo da rede recebe, queira ou não, e o roteador não repassa para outras redes.',
          3: 'É multicast, mas reservado: "todos os hosts desta rede". Nenhum roteador repassa 224.0.0.0/24 para fora, e a rádio nunca sairia do centro.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual destes endereços serve de grupo para a rádio alcançar só quem quiser ouvir, em qualquer bairro?',
      porque: 'Grupo multicast é um endereço de 224.0.0.0 a 239.255.255.255. A faixa 224.0.0.0/24 é do controle da rede local, e a 239.0.0.0/8 é de uso dentro de uma organização, como a cidade.',
      feito: '239.10.0.1 é um canal, não uma máquina. Quem entrar nele recebe; quem não entrar, nem fica sabendo.',
    }),
    passo({
      alvo: ['equip', 'casa-norte'],
      acao: 'grupo',
      valores: { acao: 'entrar' },
      pedir: ['grupo'],
      exemplo: { grupo: RADIO },
      instrucao: 'Na casa-norte, entre no grupo da rádio.',
      porque: 'O PC manda um relatório de participação do IGMP. Quem ouve é o roteador da rede local, o r-norte, que passa a saber que tem ouvinte ali.',
      conferir: (m) => (grupos(m, 'casa-norte').includes(RADIO) ? true : grupos(m, 'casa-norte').length ? 'A casa entrou num grupo, mas não no da rádio. O grupo da Fim de Linha FM é 239.10.0.1.' : 'A casa-norte ainda não entrou no grupo 239.10.0.1.'),
      feito: 'Relatório IGMP enviado. O r-norte anotou: na porta lan, alguém quer 239.10.0.1.',
    }),
    passo({
      alvo: ['equip', 'casa-oeste'],
      acao: 'grupo',
      valores: { acao: 'entrar', grupo: RADIO },
      instrucao: 'Agora a casa-oeste entra no mesmo grupo.',
      porque: 'Um grupo pode ter membros em quantas redes quiser. Cada roteador só precisa saber se, na rede dele, tem pelo menos um.',
      conferir: (m) => (grupos(m, 'casa-oeste').includes(RADIO) ? true : 'A casa-oeste ainda não entrou no grupo.'),
      feito: 'O r-oeste também tem ouvinte. A casa-sul e a casa-leste continuam fora.',
    }),
    passo({
      alvo: ['equip', 'r-centro'],
      acao: 'rot-multicast',
      pedir: ['grupo'],
      exemplo: { grupo: RADIO },
      instrucao: 'No r-centro, onde a rádio está, monte a árvore multicast do grupo.',
      porque: 'A árvore parte da fonte. O r-centro começa pela árvore de difusão, que alcança todo roteador, e corta os galhos que não levam a nenhum ouvinte.',
      conferir: (m) => {
        const a = arvore(m, RADIO);
        if (!a) return 'A árvore do grupo 239.10.0.1 ainda não foi montada.';
        return a.membros.join(',') === 'r-norte,r-oeste' ? true : `A árvore saiu com membros ${a.membros.join(', ') || 'nenhum'}. Confira se as duas casas entraram no grupo 239.10.0.1.`;
      },
      feito: 'Árvore depois da poda: centro até leste, centro até norte e leste até oeste. O galho do sul foi podado.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '3' },
      instrucao: 'Quantas cópias de cada pacote da rádio atravessam enlaces entre roteadores?',
      porque: 'Cada enlace que ficou na árvore leva exatamente uma cópia de cada pacote. A difusão para todos usaria os quatro enlaces.',
      feito: 'Três, contra quatro da difusão e contra uma cópia por ouvinte no unicast. E a saída da rádio continua com uma só.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque o r-leste é passagem para o r-oeste, mesmo sem ouvinte no leste',
          'Porque a casa-leste entrou no grupo sem avisar',
          'Porque a árvore nunca poda roteador vizinho da fonte',
          'Porque multicast sempre manda para todos os roteadores',
        ],
        certa: 0,
        errada: {
          1: 'A casa-leste não pediu nada, e o r-leste não tem ouvinte na rede dele. Ele está na árvore por outro motivo.',
          2: 'O r-sul também é vizinho da fonte e foi podado. Poda depende de ter ouvinte para lá, não de distância.',
          3: 'Isso é a difusão. O multicast acabou de cortar o galho do sul.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Ninguém no bairro leste quer ouvir. Por que o enlace centro-leste ficou na árvore?',
      porque: 'Um galho só é podado quando nenhum ouvinte fica para lá dele. O caminho do centro até o oeste passa pelo leste.',
      feito: 'O r-leste repassa sem entregar na rede dele. Poda olha o galho inteiro, não um roteador só.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Unicast, difusão e multicast',
        texto: ['A diferença está em quantas cópias saem da fonte e em quem recebe.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Jeito', 'Quem recebe', 'Cópias saindo da rádio com 500 ouvintes'],
          linhas: [
            ['unicast', 'um destino por pacote', '500'],
            ['difusão', 'todo mundo, queira ou não', '1, mas chega a quem não pediu'],
            ['multicast', 'só quem entrou no grupo', '1, duplicada só onde o caminho se divide'],
          ],
        },
      },
      {
        titulo: 'Endereços de grupo',
        texto: ['Um grupo é um endereço de 224.0.0.0 a 239.255.255.255 (224.0.0.0/4). Não é de nenhuma máquina: é um canal.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Faixa', 'Uso'],
          linhas: [
            ['224.0.0.0/24', 'controle da rede local, nunca passa de um roteador (224.0.0.1 todos os hosts, 224.0.0.2 todos os roteadores)'],
            ['232.0.0.0/8', 'multicast de fonte específica: o ouvinte escolhe o grupo e também a fonte'],
            ['239.0.0.0/8', 'uso dentro de uma organização, como a rádio e a TV da cidade'],
            ['o resto do 224.0.0.0/4', 'grupos de alcance maior'],
          ],
        },
      },
      {
        titulo: 'IGMP: quem quer ouvir',
        texto: ['O IGMP fala só entre host e roteador, dentro da rede local. O roteador pergunta, quem quer responde, e quem sai avisa.'],
        visual: {
          tipo: 'camadas',
          camadas: ['roteador pergunta para 224.0.0.1: "alguém quer algum grupo?"', 'casa-norte responde: relatório de participação em 239.10.0.1', 'o r-norte anota: na porta lan tem ouvinte', 'casa-norte sai do grupo: o r-norte para de pedir a rádio, e o galho é podado'],
          rotulo: 'uma conversa IGMP, de cima para baixo',
        },
      },
      {
        titulo: 'A árvore com poda',
        texto: ['Parte-se da árvore de difusão a partir da fonte e se corta todo galho sem ouvinte. Roteador de passagem fica, mesmo sem ninguém ouvindo na rede dele.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'r-centro (rádio)', x: 300, y: 60 },
            { id: 'n', rotulo: 'r-norte: ouve', x: 100, y: 180 },
            { id: 's', rotulo: 'r-sul: ninguém', x: 300, y: 180 },
            { id: 'l', rotulo: 'r-leste: passagem', x: 500, y: 180 },
            { id: 'o', rotulo: 'r-oeste: ouve', x: 500, y: 290 },
          ],
          ligacoes: [
            ['c', 'n', 'cópia'],
            ['c', 's', 'podado'],
            ['c', 'l', 'cópia'],
            ['l', 'o', 'cópia'],
          ],
        },
      },
      {
        titulo: 'Árvore por origem ou compartilhada',
        texto: ['As duas podam do mesmo jeito. A diferença é de onde a árvore nasce.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Por origem', 'Compartilhada'],
          linhas: [
            ['quantas árvores', 'uma por fonte', 'uma por grupo'],
            ['de onde nasce', 'da própria fonte', 'de um ponto de encontro escolhido'],
            ['caminho', 'o mais curto da fonte a cada ouvinte', 'passa pelo ponto de encontro, às vezes mais longo'],
            ['bom para', 'poucas fontes com muito tráfego, como uma rádio', 'muitas fontes pequenas, como uma videoconferência'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O último ouvinte da rádio no bairro sul desliga o computador. O que acontece com o galho do sul?',
      opcoes: [
        'O r-sul deixa de ver relatórios IGMP para o grupo, e o galho é podado',
        'Continua recebendo para sempre, porque a árvore não muda',
        'A rádio passa a mandar uma cópia unicast para o sul',
        'O r-sul vira o ponto de encontro do grupo',
      ],
      certa: 0,
      explicacao: 'O roteador pergunta de tempos em tempos quem quer o grupo. Sem ninguém respondendo, ele para de pedir aquele grupo e o galho sai da árvore. Ninguém paga banda por um rádio desligado.',
    },
  },
  desafio: {
    carta: [
      'Domingo tem final do campeonato regional, e a TV comunitária vai transmitir ao vivo do estúdio no bairro oeste, no grupo 239.20.0.5. A escola, no bairro norte, quer passar o jogo no telão do pátio. O hospital, no leste, quer passar na sala de espera.',
      'Problema: o telão do posto de saúde do bairro sul, que fechou para reforma, ficou ligado e continua no grupo desde o último jogo. Ninguém assiste, mas o enlace até o sul segue carregando a partida inteira.',
      'Objetivo: só a escola e o hospital no grupo, o posto fora, a árvore da TV montada a partir do roteador do estúdio e a pergunta respondida.',
    ],
    dicas: [
      'A fonte agora é outra: o estúdio fica atrás do r-oeste. A árvore nasce lá.',
      'Tire o posto do grupo 239.20.0.5 e ponha a escola e o hospital. Depois monte a árvore do grupo no r-oeste.',
      'Compare a árvore depois da poda com os galhos podados: só o enlace até o sul deve ficar de fora.',
    ],
    perguntas: d99D,
    respostas: { '1': '1' },
    montar: () =>
      mundoBairros(3099, {
        'r-centro': { nome: 'camara', modelo: 'PC da câmara municipal' },
        'r-norte': { nome: 'escola', modelo: 'Computador do telão da escola' },
        'r-sul': { nome: 'posto', modelo: 'Telão do posto de saúde (fechado para reforma)', grupos: [TV] },
        'r-leste': { nome: 'hospital', modelo: 'TV da sala de espera do hospital' },
        'r-oeste': { nome: 'tv', modelo: 'Estúdio da TV comunitária' },
      }),
    objetivo: (m) => {
      const a = arvore(m, TV);
      return [
        item('o posto saiu do grupo 239.20.0.5', !grupos(m, 'posto').includes(TV)),
        item('a escola e o hospital estão no grupo', grupos(m, 'escola').includes(TV) && grupos(m, 'hospital').includes(TV)),
        item('árvore da TV montada a partir do r-oeste, chegando só ao leste e ao norte', !!a && a.origem === 'r-oeste' && a.membros.join(',') === 'r-leste,r-norte', a ? `origem ${a.origem}, membros: ${a.membros.join(', ') || 'nenhum'}` : 'ainda não foi montada'),
        ...todasRespondidas(m, d99D),
      ];
    },
    solucao: [
      ['equip', 'posto', 'grupo', { acao: 'sair', grupo: TV }],
      ['equip', 'escola', 'grupo', { acao: 'entrar', grupo: TV }],
      ['equip', 'hospital', 'grupo', { acao: 'entrar', grupo: TV }],
      ['equip', 'r-oeste', 'rot-multicast', { grupo: TV }],
    ],
  },
};

/* ======================================================================
 * ref 100: Política na camada de rede (5.8)
 * ====================================================================== */

const d100: Pergunta[] = [texto('1', 'Com o enlace do par derrubado, qual era o caminho de AS da borda até 198.51.100.0/24? Escreva os números separados por espaço.', /^64501\s+64502$/)];
const d100D: Pergunta[] = [texto('1', 'Com o contrato novo, qual é o caminho de AS da borda até o portal (203.0.113.0/24)? Escreva os números separados por espaço.', /^64502\s+64501$/)];

const dia100: Dia = {
  numero: 100,
  ato: 4,
  titulo: 'Política na camada de rede',
  chamado: [
    'CHAMADO #0100',
    'Chegou um ofício da cidade vizinha. Desde que o servidor regional de exames foi para lá, Fim de Linha recebe da vizinha muito mais tráfego do que manda, e a vizinha acha que troca de graça entre pares só é justa quando o fluxo é parecido. Proposta: a cidade passa a pagar pelo enlace direto, ou ele será desligado na sexta.',
    'Antes de responder, a prefeitura quer saber o que acontece se o par for mesmo desligado: o tráfego para, ou só fica mais caro?',
    'Objetivo: simular o desligamento do par, ver por onde o tráfego vai, responder a pergunta e religar o enlace no fim, com a sessão de pé.',
  ],
  manual: {
    titulo: 'Quem paga, quem prioriza',
    texto: [
      'A camada de rede não é só algoritmo; é também negócio. Duas redes que se ligam como pares trocam tráfego sem cobrança (peering gratuito) porque as duas ganham: cada uma deixa de pagar trânsito a um provedor pelo tráfego entre elas. A conta fecha quando o tráfego é mais ou menos equilibrado e as duas têm tamanho parecido. Quando uma rede passa a mandar ou receber muito mais que a outra, a do lado "pesado" pode querer cobrar: é o peering pago, um meio-termo entre o par de graça e o trânsito comprado.',
      'O desequilíbrio não tem dono óbvio. Quem hospeda conteúdo (vídeo, exames, arquivos) manda muito mais do que recebe; quem tem os moradores pede esse conteúdo. A rede de conteúdo diz "estou entregando o que os seus clientes pediram, você deveria me agradecer"; a rede de acesso diz "você está usando os meus enlaces até a casa de cada um, deveria ajudar a pagar". As duas têm argumento. Quando ninguém cede, uma das partes desliga a sessão: o despeering. O tráfego não some, porque o BGP acha outro caminho, normalmente por provedores de trânsito pagos, mais longe e às vezes congestionado.',
      'A segunda briga é sobre prioridade. Tecnicamente, dá para tratar pacotes diferente: filas com prioridade, serviços diferenciados, como no começo do ato. A pergunta é quem decide e por quê. Uma via rápida paga deixa um serviço que pagou chegar antes dos outros; quem defende diz que isso financia a rede e permite oferecer serviços que precisam de garantia, como telemedicina; quem critica diz que, se a pista rápida é vendida, a pista normal pode ser deixada piorar, e que o serviço novo que não pode pagar nunca terá chance contra o grande que pode.',
      'A neutralidade da rede é o princípio de que o provedor trata igual o tráfego de qualquer origem, destino ou aplicação, sem bloquear, estrangular ou dar prioridade paga. Muitas regras de neutralidade aceitam exceções de gerenciamento razoável: medidas técnicas, transparentes e proporcionais para segurança, emergências ou congestionamento, que valem para todos de forma igual, e não pelo tamanho da conta de quem manda o tráfego. Onde exatamente fica a linha entre gerenciamento e favorecimento é uma discussão que continua, em cada país, entre provedores, empresas de conteúdo, reguladores e usuários.',
    ],
  },
  dicas: [
    'Comece com um traceroute da prefeitura para a câmara da vizinha (198.51.100.10) para ver o caminho de hoje.',
    'Para simular o despeering, derrube na borda a porta que vai direto para a vizinha (viz), e repita o traceroute.',
    'O caminho de AS que vale durante o despeering aparece na tabela de rotas e no "Ver o BGP". No fim, levante a porta viz.',
  ],
  perguntas: d100,
  montar: () => mundoAs({ semente: 4100, bordaPronta: true, vizinhaVeBorda: 'par' }),
  objetivo: (m) => {
    const b = melhorBgp(m, 'borda', '198.51.100.0/24');
    return [
      ...todasRespondidas(m, d100),
      item('o enlace com a vizinha de volta, com a sessão de par de pé', sessaoOk(m, 'borda', '10.0.2.2') && relacaoCom(m, 'borda', '10.0.2.2') === 'par'),
      item('a borda chega em 198.51.100.0/24 de novo direto pelo par', !!b && b.de === 'vizinha', b ? `caminho de AS ${b.caminho.join(' ')} (de ${b.relacao})` : 'sem rota BGP calculada ainda'),
    ];
  },
  posMorte: [
    'Com o par de pé, o tráfego entre as cidades ia direto, de graça, num salto entre AS. Quando o enlace viz caiu, a sessão caiu junto e a rota do par foi retirada. O BGP não entrou em pânico: a reserva já estava guardada, a rota pelo provedor com caminho 64501 64502. O traceroute ganhou uma linha, a Estrada Larga, e cada exame vindo da vizinha passou a ser cobrado duas vezes: Fim de Linha paga o trânsito para receber, e a vizinha paga o dela para mandar.',
    'Essa é a ironia de quase todo despeering: o tráfego não para, só fica mais longo e mais caro para os dois lados, e quem ganha é o provedor do meio. Por isso a ameaça de desligar costuma ser uma ferramenta de negociação. Aqui, a conta fechou com um acordo: o par continua gratuito, e Fim de Linha passa a hospedar uma cópia do servidor de exames, o que equilibra o tráfego nos dois sentidos.',
    'E com isso o ato 4 termina. Os bairros se enxergam pelo OSPF, a cidade é um sistema autônomo com nome e número, anuncia o próprio bloco, conversa de graça com a vizinha e tem rota para o mundo inteiro pela Estrada Larga. Daqui para cima, a pergunta muda: não é mais "por onde o pacote vai", e sim "a conversa chega inteira, na ordem e na velocidade certa".',
  ],
  passos: [
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'traceroute',
      valores: { destino: '198.51.100.10' },
      instrucao: 'Da prefeitura, faça um traceroute até a câmara da vizinha (198.51.100.10).',
      porque: 'Antes de mexer em contrato, vale ver o caminho de hoje. A borda tem duas rotas para a vizinha: pelo par e pelo provedor.',
      conferir: (m) => {
        const tr = traceRegistro(m, 'prefeitura', '198.51.100.10');
        return tr?.chegou ? true : 'O traceroute ainda não chegou até 198.51.100.10.';
      },
      feito: 'Três linhas: borda, vizinha (10.0.2.2) e a câmara. Tráfego de par, de graça, sem passar pela Estrada Larga.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque as duas economizam trânsito pago pelo tráfego entre elas, e a troca é parecida nos dois sentidos',
          'Porque o BGP proíbe cobrar entre redes vizinhas',
          'Porque o par carrega de graça o tráfego da cidade para a internet inteira',
          'Porque enlace direto não tem custo nenhum para ninguém',
        ],
        certa: 0,
        errada: {
          1: 'O BGP não sabe de dinheiro; ele só aplica a política que cada AS configura. Cobrar ou não é contrato, e peering pago existe.',
          2: 'Par troca só o tráfego entre os dois e os clientes deles. Para a internet inteira, a cidade continua pagando o provedor. É a regra de exportação.',
          3: 'Fibra, equipamento e manutenção custam. A troca é gratuita porque cada lado paga a sua metade e as duas ganham, não porque é de graça fazer.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que duas redes como as duas cidades trocam tráfego sem cobrar uma da outra?',
      porque: 'Peering gratuito é um acordo de conveniência mútua. Quando o tráfego fica muito desequilibrado, o lado que se sente prejudicado pede para cobrar ou ameaça desligar.',
      feito: 'Par de graça vale enquanto as duas ganham. O desequilíbrio é o que transforma um acordo técnico em briga comercial.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'rot-derrubar',
      pedir: ['porta'],
      exemplo: { porta: 'viz' },
      instrucao: 'Simule o despeering: na borda, derrube a porta que vai direto para a vizinha.',
      porque: 'Desligar a sessão de par é o que a vizinha ameaça fazer na sexta. Derrubar o enlace tem o mesmo efeito no BGP: a sessão cai e as rotas aprendidas por ela somem.',
      conferir: (m) => {
        const portas = m.equipamentos.get('borda')!.portas;
        if (portas.find((p) => p.nome === 'prov')?.desligada) return 'Essa é a porta do provedor: a cidade acabou de ficar sem trânsito para o mundo. Levante a prov e derrube a viz, a do enlace direto com a vizinha.';
        if (portas.find((p) => p.nome === 'lan')?.desligada) return 'Essa é a rede da prefeitura. Levante a lan e derrube a viz, a do enlace direto com a vizinha.';
        return portas.find((p) => p.nome === 'viz')?.desligada ? true : 'A porta viz ainda está de pé.';
      },
      feito: 'Porta viz derrubada. A sessão BGP com o AS 64502 caiu, e a rota do par foi retirada.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'traceroute',
      valores: { destino: '198.51.100.10' },
      instrucao: 'Repita o traceroute até a câmara da vizinha.',
      porque: 'Se o tráfego parasse, a negociação seria uma. Se ele só desvia, é outra. O traceroute responde.',
      conferir: (m) => {
        const tr = traceRegistro(m, 'prefeitura', '198.51.100.10');
        if (!tr?.chegou) return 'O traceroute não chegou. Confira se só a porta viz foi derrubada.';
        return tr.saltos.includes('10.0.1.1') ? true : 'O caminho ainda não passa pelo provedor. Confira se a porta viz está derrubada.';
      },
      feito: 'Quatro linhas: borda, Estrada Larga (10.0.1.1), vizinha e a câmara. O tráfego continua chegando, só que por trânsito pago.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '64501 64502' },
      instrucao: 'Com o par derrubado, qual é o caminho de AS da borda até 198.51.100.0/24?',
      porque: 'A rota que sobrou veio do provedor. O caminho começa no vizinho de quem a borda aprendeu e termina em quem originou o prefixo.',
      feito: '64501 64502: a Estrada Larga e depois a vizinha. Era a reserva, de preferência 50, que estava guardada desde o dia do BGP.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'rot-levantar',
      valores: { porta: 'viz' },
      instrucao: 'Acordo fechado: levante de novo a porta viz.',
      porque: 'Com o enlace de pé, a sessão volta, a vizinha anuncia de novo o 198.51.100.0/24 e a rota de par (preferência 100) volta a vencer a do provedor.',
      conferir: (m) => (sessaoOk(m, 'borda', '10.0.2.2') ? true : 'A sessão com a vizinha ainda não voltou. Levante a porta viz.'),
      feito: 'Sessão de par de pé de novo. O trânsito pago volta a ser só reserva.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Em horário de pico, segurar um pouco as atualizações automáticas gigantes de todos os sistemas igualmente, avisando os clientes',
          'Deixar mais lento o vídeo de quem não pagou a via rápida',
          'Bloquear o aplicativo de chamadas de uma empresa concorrente do provedor',
          'Dar prioridade ao site de quem tem o maior contrato com o provedor',
        ],
        certa: 0,
        errada: {
          1: 'Aqui a diferença no tratamento vem de quem pagou, não de uma necessidade técnica. É justamente a via rápida paga que a neutralidade discute.',
          2: 'Bloquear um serviço por ser concorrente é o caso que quase toda regra de neutralidade proíbe, de qualquer lado do debate.',
          3: 'Prioridade pelo tamanho do contrato é favorecimento comercial, não gerenciamento de congestionamento.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A Estrada Larga quer "gerenciar a rede" na hora do pico. Qual destas medidas se parece com gerenciamento razoável?',
      porque: 'Gerenciamento razoável é técnico, transparente, proporcional e igual para todos que estão na mesma situação. O que vira disputa é quando o critério passa a ser quem paga ou quem é concorrente.',
      feito: 'Tratar o tráfego diferente não é proibido em si; o que se discute é o critério. Por necessidade técnica e igual para todos, quase ninguém briga. Por dinheiro ou concorrência, começa a discussão.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Três jeitos de se ligar',
        texto: ['O que muda é quem paga e o que cada um carrega para o outro.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Acordo', 'Quem paga', 'O que carrega'],
          linhas: [
            ['trânsito', 'o cliente paga o provedor', 'a internet inteira, nos dois sentidos'],
            ['peering gratuito', 'ninguém cobra; cada um paga a sua metade do enlace', 'só o tráfego entre os dois e os clientes deles'],
            ['peering pago', 'o lado que manda ou recebe mais paga uma parte', 'o mesmo do gratuito, com a conta acertada'],
          ],
        },
      },
      {
        titulo: 'O desequilíbrio',
        texto: [
          'Quem hospeda conteúdo manda mais do que recebe; quem tem os moradores recebe mais do que manda. Cada lado acha que o outro é quem deveria pagar, e os dois têm argumento.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'v', rotulo: 'vizinha: servidor de exames', x: 120, y: 120 },
            { id: 'f', rotulo: 'Fim de Linha: moradores', x: 520, y: 120 },
          ],
          ligacoes: [
            ['v', 'f', 'muito tráfego para cá, pouco para lá'],
          ],
        },
      },
      {
        titulo: 'Despeering: o tráfego não some',
        texto: [
          'Quando um lado desliga a sessão de par, o BGP usa a reserva pelos provedores. O tráfego continua, mais longo e pago pelos dois lados.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Com o par', 'Depois do despeering'],
          linhas: [
            ['caminho de AS até 198.51.100.0/24', '64502', '64501 64502'],
            ['preferência local da rota', '100 (par)', '50 (provedor)'],
            ['saltos no traceroute até a câmara', '3', '4'],
            ['quem cobra', 'ninguém', 'a Estrada Larga, dos dois lados'],
          ],
        },
      },
      {
        titulo: 'Via rápida e neutralidade',
        texto: [
          'Neutralidade: o provedor trata igual o tráfego de qualquer origem, destino ou aplicação. Quem defende vias rápidas pagas diz que elas financiam a rede e garantem serviços críticos. Quem critica diz que a pista comum fica abandonada e o pequeno nunca compete.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Argumento', 'A favor de vias pagas', 'A favor da neutralidade estrita'],
          linhas: [
            ['investimento', 'quem gera mais tráfego ajuda a pagar a expansão', 'o assinante já paga pelo acesso'],
            ['qualidade', 'serviço crítico pode comprar garantia', 'a pista comum tende a piorar quando a rápida é vendida'],
            ['concorrência', 'mais modelos de negócio possíveis', 'o serviço novo não pode pagar e não compete'],
          ],
        },
      },
      {
        titulo: 'Gerenciamento razoável',
        texto: [
          'Quase toda regra de neutralidade aceita medidas técnicas para segurança, emergência e congestionamento, desde que sejam transparentes, proporcionais e iguais para quem está na mesma situação. A briga mora na fronteira.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['aceito por quase todos: conter um ataque, dar passagem a chamada de emergência', 'zona de debate: tratar diferente tipos de tráfego no pico, igual para todos', 'favorecimento: prioridade porque pagou, lentidão porque é concorrente'],
          rotulo: 'do menos ao mais contestado',
        },
      },
    ],
    checagem: {
      pergunta: 'Duas redes de pares brigam e uma desliga a sessão. O que acontece com o tráfego entre elas?',
      opcoes: [
        'Continua, pelos provedores de trânsito, com caminho mais longo e pago pelos dois lados',
        'Para de vez: sem sessão de par, as duas redes nunca mais se alcançam',
        'Fica igual, porque o BGP religa a sessão sozinho',
        'Passa a ir por qualquer outro par de uma das duas, de graça',
      ],
      certa: 0,
      explicacao: 'O BGP guarda as rotas de reserva. Sem o par, vence a rota pelo provedor, que existe se as duas têm trânsito. Outro par não serve de passagem, porque rota de par não é repassada para par.',
    },
  },
  desafio: {
    carta: [
      'Uma retroescavadeira da obra da rodovia cortou a fibra entre a borda e a Estrada Larga. Conserto: três dias. A prefeitura está sem rota para o mundo, embora o enlace com a vizinha esteja perfeito.',
      'A vizinha oferece um quebra-galho: vender trânsito à cidade por uma semana, levando o tráfego dela até a Estrada Larga. Hoje as duas são pares, e par não carrega tráfego para o resto da internet. Os dois prefeitos já assinaram; falta a rede saber.',
      'Objetivo: a prefeitura alcançando o portal do mundo (203.0.113.10) pela vizinha e a pergunta respondida.',
    ],
    dicas: [
      'Veja o BGP na vizinha: ela tem a rota para 203.0.113.0/24, mas não repassa para a cidade. Por quê?',
      'Rota que veio de provedor só é exportada para cliente. Pelo contrato novo, a cidade é cliente da vizinha, e a vizinha é provedora da cidade.',
      'Na borda, o vizinho 10.0.2.2 (AS 64502) vira provedor. Na vizinha, o vizinho 10.0.2.1 (AS 64500) vira cliente. Depois ping da prefeitura para 203.0.113.10.',
    ],
    perguntas: d100D,
    respostas: { '1': '64502 64501' },
    montar: () => mundoAs({ semente: 4200, bordaPronta: true, vizinhaVeBorda: 'par', provedorCaido: true }),
    objetivo: (m) => {
      const b = melhorBgp(m, 'borda', '203.0.113.0/24');
      return [
        pingOk(m, 'prefeitura', '203.0.113.10'),
        item('a borda chega no portal pela vizinha, como cliente dela', !!b && b.de === 'vizinha' && b.relacao === 'provedor', b ? `caminho de AS ${b.caminho.join(' ')} (de ${b.relacao})` : 'sem rota para 203.0.113.0/24'),
        ...todasRespondidas(m, d100D),
      ];
    },
    solucao: [
      ['equip', 'vizinha', 'rot-bgp-ver'],
      ['equip', 'borda', 'rot-bgp-vizinho', { ip: '10.0.2.2', asn: '64502', rel: 'provedor' }],
      ['equip', 'vizinha', 'rot-bgp-vizinho', { ip: '10.0.2.1', asn: '64500', rel: 'cliente' }],
      ['equip', 'prefeitura', 'ping', { destino: '203.0.113.10', n: '4' }],
    ],
  },
};

export const ATO4H: Dia[] = [dia98, dia99, dia100];
