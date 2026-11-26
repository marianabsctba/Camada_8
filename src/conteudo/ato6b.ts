// Dias do ato 6 (O Show), com prática guiada, aula e desafio no próprio dia.
// A web por dentro (7.3.1 a 7.3.3), HTTP e HTTPS (7.3.4 e 7.3.5) e mídia ao vivo (7.4), na semana da final
// no estádio: o site da prefeitura no ar, rápido e seguro, e a transmissão chegando ao telão sem travar.

import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

const RESOLVEDOR = '192.168.10.53';
const PREFEITURA_IP = '203.0.113.80';
const ARENA_IP = '203.0.113.81';
const SITE = 'www.prefeitura.exemplo';
const SITE_ARENA = 'www.final.exemplo';
const URL_SITE = `http://${SITE}/`;
const URL_SITE_S = `https://${SITE}/`;
const URL_ARENA = `http://${SITE_ARENA}/`;
const URL_ARENA_S = `https://${SITE_ARENA}/`;
const URL_VIDEO = 'http://video.final.exemplo/video';

interface PaginaIni {
  conteudo: string;
  maxAge?: number;
}

interface OpcoesFinal {
  semente: number;
  /** Banda do enlace da borda da cidade até a operadora, em Mb/s (o gargalo). */
  mbps?: number;
  /** Página inicial já publicada no servidor da prefeitura. */
  paginaPrefeitura?: PaginaIni;
  /** Página inicial já publicada no servidor da arena. */
  paginaArena?: PaginaIni;
  /** Certificado já ligado no servidor da prefeitura. */
  httpsPrefeitura?: 'valido' | 'vencido' | 'autoassinado' | 'nome-errado' | 'revogado';
  /** Certificado já ligado no servidor da arena. */
  httpsArena?: 'valido' | 'vencido' | 'autoassinado' | 'nome-errado' | 'revogado';
  /** Vídeo já servido pela arena (taxa em kb/s, duração em s). */
  video?: { taxa: number; duracao: number };
  /** PCs da cidade que vêm sem resolvedor configurado. */
  semResolvedor?: string[];
}

/**
 * A rede da cidade (192.168.10.0/24, switch sw-cidade): balcao (balcão de informações do estádio), bilheteria,
 * telao (o computador que alimenta o telão) e dns-cidade (resolvedor recursivo, autoritativo de fimdelinha.exemplo).
 * A borda liga a cidade à operadora por um enlace que é o gargalo; atrás da operadora, a rede pública 203.0.113.0/24
 * com o servidor da prefeitura (DNS de prefeitura.exemplo e, se publicado, o site) e o da arena (DNS de final.exemplo,
 * site dos ingressos e a transmissão).
 */
function mundoFinal(o: OpcoesFinal): Mundo {
  const m = novoMundo(o.semente);
  m.flags.aplicacao = true;
  const host = (nome: string, ip: string, gw: string, modelo: string) => adicionar(m, pc(nome, { ip: cidr(ip), gateway: gw, modelo }));
  host('balcao', '192.168.10.20/24', '192.168.10.1', 'PC do balcão de informações do estádio');
  host('bilheteria', '192.168.10.21/24', '192.168.10.1', 'PC da bilheteria do estádio');
  host('telao', '192.168.10.30/24', '192.168.10.1', 'Computador que alimenta o telão do estádio');
  host('dns-cidade', `${RESOLVEDOR}/24`, '192.168.10.1', 'Resolvedor de nomes da cidade');
  host('prefeitura', `${PREFEITURA_IP}/24`, '203.0.113.1', 'Servidor da prefeitura, no data center da operadora');
  host('arena', `${ARENA_IP}/24`, '203.0.113.1', 'Servidor da arena da final, no data center da operadora');
  const borda = adicionar(m, roteador('borda', { modelo: 'Roteador de borda da cidade', interfaces: { lan: '192.168.10.1/24', wan: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('operadora', { modelo: 'Roteador da operadora', interfaces: { wan: '198.51.100.2/30', dc: '203.0.113.1/24' }, rotas: [{ destino: '192.168.10.0/24', via: '198.51.100.1' }] }));
  adicionar(m, comutador('sw-cidade', { portas: 8 }));
  adicionar(m, comutador('sw-dc', { portas: 8 }));
  borda.portas.find((p) => p.nome === 'wan')!.velocidades = [o.mbps ?? 100];
  ['balcao', 'bilheteria', 'telao', 'dns-cidade'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw-cidade', porta: `p${i + 1}` }, 'cat6', 10));
  ligar(m, { equip: 'sw-cidade', porta: 'p8' }, { equip: 'borda', porta: 'lan' }, 'cat6', 5);
  ligar(m, { equip: 'borda', porta: 'wan' }, { equip: 'operadora', porta: 'wan' }, 'cat6', 90);
  ligar(m, { equip: 'operadora', porta: 'dc' }, { equip: 'sw-dc', porta: 'p8' }, 'cat6', 5);
  ['prefeitura', 'arena'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw-dc', porta: `p${i + 1}` }, 'cat6', 5));
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('dns-cidade').servicos = { dns: { zona: 'fimdelinha.exemplo', recursivo: true, registros: [] } };
  const prefeitura: Record<string, unknown> = { dns: { zona: 'prefeitura.exemplo', registros: [{ nome: 'www', tipo: 'A', valor: PREFEITURA_IP, ttl: 300 }] } };
  if (o.paginaPrefeitura || o.httpsPrefeitura) {
    prefeitura.web = {
      paginas: o.paginaPrefeitura ? { '/': { conteudo: o.paginaPrefeitura.conteudo, maxAge: o.paginaPrefeitura.maxAge ?? 0 } } : undefined,
      https: o.httpsPrefeitura,
    };
  }
  s('prefeitura').servicos = prefeitura;
  const arena: Record<string, unknown> = {
    dns: {
      zona: 'final.exemplo',
      registros: [
        { nome: 'www', tipo: 'A', valor: ARENA_IP, ttl: 300 },
        { nome: 'video', tipo: 'A', valor: ARENA_IP, ttl: 300 },
      ],
    },
  };
  if (o.paginaArena || o.httpsArena) {
    arena.web = {
      paginas: o.paginaArena ? { '/': { conteudo: o.paginaArena.conteudo, maxAge: o.paginaArena.maxAge ?? 0 } } : undefined,
      https: o.httpsArena,
    };
  }
  if (o.video) arena.streaming = { videos: { video: { ...o.video } } };
  s('arena').servicos = arena;
  for (const n of ['balcao', 'bilheteria', 'telao', 'prefeitura', 'arena']) if (!o.semResolvedor?.includes(n)) s(n).dns = RESOLVEDOR;
  return m;
}

interface Http {
  de: string;
  url: string;
  nome: string;
  https: boolean;
  ok: boolean;
  estado?: number;
  origem?: 'cache' | 'validado' | 'rede';
  servidor?: string | null;
  motivo?: string;
  cookies?: Record<string, string>;
  enviouCookie?: boolean;
  condicional?: boolean;
}

interface Tls {
  de: string;
  nome: string;
  ok: boolean;
  motivo?: string | null;
  certificado?: { sujeito: string; emissor: string; validoAte: number };
}

interface Streaming {
  de: string;
  url: string;
  ok: boolean;
  adaptativo?: boolean;
  taxaKbps?: number;
  bandaKbps?: number;
  atrasoInicial?: number;
  travamentos?: number;
  tempoTravado?: number;
  trocas?: number;
  qualidadeMedia?: number;
}

const semPonto = (x: string | undefined) => (x ?? '').replace(/\.$/, '');

/** A última navegação, se foi feita por `de` até o nome `nome`. */
function http(m: Mundo, de: string, nome: string): Http | undefined {
  const h = m.flags.http as Http | undefined;
  return h && h.de === de && semPonto(h.nome) === nome ? h : undefined;
}

function tls(m: Mundo, de: string, nome: string): Tls | undefined {
  const t = m.flags.tls as Tls | undefined;
  return t && t.de === de && semPonto(t.nome) === nome ? t : undefined;
}

function streaming(m: Mundo, de: string): Streaming | undefined {
  const v = m.flags.streaming as Streaming | undefined;
  return v && v.de === de && /video\.final\.exemplo/.test(v.url) ? v : undefined;
}

function paginaDe(m: Mundo, servidor: string, caminho = '/'): { conteudo: string; maxAge?: number } | undefined {
  const sv = m.equipamentos.get(servidor)?.s.servicos as { web?: { paginas?: Record<string, { conteudo: string; maxAge?: number }> } } | undefined;
  return sv?.web?.paginas?.[caminho];
}

function certificadoDe(m: Mundo, servidor: string): string | undefined {
  const sv = m.equipamentos.get(servidor)?.s.servicos as { web?: { https?: boolean | string } } | undefined;
  const h = sv?.web?.https;
  return h === true ? 'valido' : typeof h === 'string' ? h : undefined;
}

function videoDe(m: Mundo): { taxa: number; duracao: number } | undefined {
  const sv = m.equipamentos.get('arena')?.s.servicos as { streaming?: { videos?: Record<string, { taxa: number; duracao: number }> } } | undefined;
  return sv?.streaming?.videos?.video;
}

function paginaPublicada(m: Mundo, servidor: string, rotulo: string): ItemObjetivo {
  const p = paginaDe(m, servidor);
  return item(`página inicial (/) publicada no servidor ${rotulo}`, !!p, p ? `conteúdo: ${p.conteudo.slice(0, 60)}` : 'nenhuma página publicada');
}

/* ======================================================================
 * ref 115: A teia (7.3.1 a 7.3.3)
 * ====================================================================== */

const d115: Pergunta[] = [
  {
    id: '1',
    texto: 'Qual é o valor do cookie "sessao" que o site da prefeitura entregou ao balcão?',
    confere: (r, m) => {
      const v = (m.flags.http as Http | undefined)?.cookies?.sessao;
      const x = r.trim().replace(/^sessao\s*=\s*/i, '');
      return !!v && x === v;
    },
  },
];

const d115D: Pergunta[] = [
  {
    id: '1',
    texto: 'Para qual endereço IP o navegador da bilheteria transformou o host www.final.exemplo?',
    confere: (r) => r.trim() === ARENA_IP,
  },
];

const dia115: Dia = {
  numero: 115,
  ato: 6,
  titulo: 'A teia',
  chamado: [
    'CHAMADO #0115',
    'Faltam três dias para a final, e a prefeitura quer um site com os portões, os horários e o mapa do estádio. O servidor da prefeitura (203.0.113.80) já responde pelo nome www.prefeitura.exemplo no DNS, mas ninguém publicou página nenhuma: quem tenta abrir dá com a porta fechada.',
    'O balcão de informações do estádio vai ser o primeiro a testar, porque é ali que o povo vai perguntar "que horas abre o portão?".',
    'Objetivo: publicar a página inicial no servidor da prefeitura, abri-la do balcão, abrir de novo para ver o cookie voltar sozinho e dizer qual sessão o site deu ao balcão.',
  ],
  manual: {
    titulo: 'A web: páginas, endereços e quem faz o quê',
    texto: [
      'A web é um jeito de usar a internet, não a internet inteira. Ela é feita de páginas, e cada página pode apontar para outras por hiperlinks: um texto ou imagem que, clicado, leva a outra página, no mesmo servidor ou do outro lado do mundo. Essa teia de páginas ligadas é que deu o nome. De um lado fica o navegador, o programa que pede as páginas e as desenha na tela; do outro, o servidor web, o programa que guarda as páginas e as entrega a quem pedir. O idioma entre os dois é o HTTP.',
      'Toda página tem um endereço, a URL, com três partes que importam. Em http://www.prefeitura.exemplo/portoes, o esquema (http) diz qual protocolo usar; o host (www.prefeitura.exemplo) diz qual máquina, e o navegador pergunta ao DNS para transformar esse nome em IP; o caminho (/portoes) diz qual página dentro daquela máquina. A porta vem implícita pelo esquema: 80 para http, 443 para https. Do lado do cliente, o navegador faz sempre a mesma dança: resolve o nome, abre uma conexão TCP com o servidor, manda o pedido (GET /portoes), recebe a resposta, desenha e, se a página citar imagens, folhas de estilo e scripts, pede cada um deles também.',
      'Do lado do servidor, o trabalho é aceitar a conexão na porta 80, ler o pedido, achar o arquivo ou programa que corresponde ao caminho e devolver a resposta com um código (200 deu certo, 404 não existe) e o conteúdo. Uma página estática é um arquivo pronto, igual para todo mundo: o HTML diz a estrutura (títulos, parágrafos, links), o CSS diz a aparência (cores, fontes, posição) e as imagens vão em arquivos à parte, cada uma num pedido próprio. Uma página com 10 imagens é, na verdade, 11 objetos.',
      'Muita página, porém, não existe pronta: é gerada na hora. Numa página dinâmica, o servidor roda um programa que consulta um banco de dados e monta o HTML para aquele pedido (o placar de agora, os ingressos que ainda restam). E há código que roda do lado do cliente: scripts que o navegador baixa junto com a página e executa, para validar um formulário, animar um mapa ou buscar dados novos em segundo plano, sem recarregar a página inteira. É assim que uma aplicação web parece um programa instalado: a página fica, e só os dados vão e voltam.',
      'Falta um detalhe: o HTTP não tem memória. Cada pedido chega ao servidor como se fosse o primeiro, sem saber quem é você. Para lembrar (o carrinho, o login, o idioma escolhido), o servidor manda na resposta um cabeçalho Set-Cookie com um identificador; o navegador guarda e devolve esse cookie em todo pedido seguinte ao mesmo site. O servidor olha o identificador e acha o seu estado no banco dele. O cookie em si é só um bilhete; quem lembra é o servidor.',
    ],
  },
  dicas: [
    'Antes de publicar, abra a página do balcão: a conexão recusada (RST) mostra que o DNS funciona e que o que falta é o servidor web.',
    'Publique a página no servidor prefeitura com "Publicar uma página", caminho /. Depois volte ao balcão e abra http://www.prefeitura.exemplo/ duas vezes.',
    'O valor do cookie aparece na linha do Set-Cookie da primeira resposta e em "Ver cookies e cache do navegador" no balcão. Responda só o valor, sem o "sessao=".',
  ],
  perguntas: d115,
  montar: () => mundoFinal({ semente: 6115 }),
  objetivo: (m) => {
    const h = http(m, 'balcao', SITE);
    return [
      paginaPublicada(m, 'prefeitura', 'da prefeitura'),
      item(`o balcão abriu ${URL_SITE} e recebeu a página`, !!h?.ok && h.servidor === 'prefeitura', h ? (h.ok ? `${h.estado}, servida por ${h.servidor}` : `não carregou (${h.motivo})`) : 'ainda não abriu'),
      item('na visita seguinte, o navegador devolveu sozinho o cookie de sessão', !!h?.ok && !!h.enviouCookie, h?.ok ? (h.enviouCookie ? `Cookie: sessao=${h.cookies?.sessao}` : 'primeira visita: o cookie ainda não tinha voltado') : 'ainda não'),
      ...todasRespondidas(m, d115),
    ];
  },
  posMorte: [
    'A porta fechada não era DNS: o nome virava 203.0.113.80 direitinho, o TCP chegava lá, e o servidor respondia com RST porque não havia ninguém escutando na porta 80. Faltava o lado do servidor. Publicar a página subiu o servidor web, e o mesmo pedido passou a receber 200 OK com o HTML.',
    'Na primeira resposta veio um Set-Cookie: sessao=s1. O navegador do balcão guardou e, na segunda visita, mandou Cookie: sessao=s1 sem ninguém pedir. É assim que um site sem memória reconhece quem voltou: o HTTP esquece tudo a cada pedido, e o cookie é o bilhete que o navegador devolve para o servidor achar o estado dele. A segunda visita ainda trouxe um tal de 304, que é assunto de amanhã.',
    'A página de hoje é estática: um texto pronto, igual para todo mundo. O placar ao vivo e a contagem de ingressos vão precisar de páginas geradas no servidor e de scripts que buscam dados em segundo plano, mas o caminho é sempre o mesmo: nome, conexão, pedido, resposta.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['O host: o nome da máquina, que o DNS transforma em IP', 'O esquema: o protocolo a usar', 'O caminho: qual página dentro do servidor', 'A porta do servidor'],
        certa: 0,
        errada: {
          1: 'O esquema é o que vem antes do "://", o http. Ele diz o protocolo (e, com ele, a porta padrão).',
          2: 'O caminho é o que vem depois do host, começando pela barra: /portoes.',
          3: 'A porta viria depois de dois-pontos, como em www.prefeitura.exemplo:8080. Sem ela, vale a padrão do esquema: 80 para http.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Em http://www.prefeitura.exemplo/portoes, o que é www.prefeitura.exemplo?',
      porque: 'Cada parte da URL responde a uma pergunta diferente do navegador: com que protocolo, com qual máquina, qual página.',
      feito: 'Esquema http, host www.prefeitura.exemplo, caminho /portoes. O navegador resolve o host no DNS, conecta na porta 80 e pede o caminho.',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar',
      valores: { url: URL_SITE },
      instrucao: 'No balcão, tente abrir http://www.prefeitura.exemplo/ antes de publicar qualquer coisa.',
      porque: 'Ver onde a dança para ensina quem faz o quê: o nome resolve? a conexão abre? alguém responde?',
      conferir: (m) => {
        const h = http(m, 'balcao', SITE);
        if (!h) return 'O balcão ainda não tentou abrir o site da prefeitura.';
        return !h.ok && h.motivo === 'recusada' ? true : h.ok ? 'Abriu? Então alguém já publicou a página. Siga em frente.' : `Parou em outro ponto (${h.motivo}).`;
      },
      feito: 'O DNS respondeu 203.0.113.80 e o SYN chegou, mas voltou RST: nada escuta na porta 80. O lado do cliente está pronto; falta o lado do servidor.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'ap-servico-web',
      valores: { caminho: '/', validade: '0' },
      pedir: ['conteudo'],
      exemplo: { conteudo: '<h1>Final no estádio</h1><p>Portões abrem às 14h</p>' },
      instrucao: 'No servidor da prefeitura, publique a página inicial (caminho /) com os avisos da final.',
      porque: 'Publicar sobe o servidor web na porta 80 e diz o que ele entrega quando alguém pede o caminho /. É uma página estática: o mesmo HTML para todo mundo.',
      conferir: (m) => (paginaDe(m, 'prefeitura') ? true : 'A página / ainda não existe no servidor da prefeitura.'),
      feito: 'Servidor web no ar, com a página / e um ETag (um resumo do conteúdo) que vai servir para o cache amanhã.',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar',
      valores: { url: URL_SITE },
      instrucao: 'Volte ao balcão e abra http://www.prefeitura.exemplo/ de novo.',
      porque: 'Agora a dança vai até o fim: DNS, TCP, GET / e a resposta. Repare no Set-Cookie da resposta.',
      conferir: (m) => {
        const h = http(m, 'balcao', SITE);
        return h?.ok && h.servidor === 'prefeitura' ? true : `A página ainda não carregou (${h?.motivo ?? 'sem tentativa'}).`;
      },
      feito: '200 OK com o HTML. E o servidor mandou Set-Cookie: sessao=s1; o navegador guardou o bilhete.',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar',
      valores: { url: URL_SITE },
      instrucao: 'Abra a mesma página mais uma vez e olhe o pedido que o navegador mandou.',
      porque: 'O HTTP não lembra de ninguém. Se o servidor reconhecer o balcão, é porque o navegador levou alguma coisa no pedido.',
      conferir: (m) => (http(m, 'balcao', SITE)?.enviouCookie ? true : 'O pedido ainda não levou o cookie. Abra a página de novo.'),
      feito: 'O pedido levou Cookie: sessao=s1 sem ninguém mandar. O servidor reconhece a sessão e não dá outra.',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-cookies',
      instrucao: 'Veja o que o navegador do balcão guarda: cookies e cache.',
      porque: 'Cookie e cache ficam do lado do cliente. Apagar os dois é como chegar ao site pela primeira vez.',
      feito: 'Um cookie para www.prefeitura.exemplo e um objeto no cache HTTP: a página inicial.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: 's1' },
      instrucao: 'Qual é o valor do cookie "sessao" que o site deu ao balcão?',
      porque: 'Esse valor é a chave que o servidor usa para achar o estado do balcão no banco dele.',
      feito: 's1. Quem tiver esse bilhete se passa pelo balcão no site: por isso cookie de login precisa viajar cifrado, que é parte do assunto de amanhã.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quem faz o quê',
        texto: ['O navegador pede e desenha; o servidor guarda e entrega; o HTTP é a conversa. Uma página com imagens e estilo é vários objetos, cada um pedido à parte.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'nav', rotulo: 'navegador (balcão)', x: 80, y: 140 },
            { id: 'dns', rotulo: 'DNS: nome vira IP', x: 300, y: 40 },
            { id: 'srv', rotulo: 'servidor web (porta 80)', x: 520, y: 140 },
            { id: 'obj', rotulo: 'HTML, CSS, imagens', x: 520, y: 250 },
          ],
          ligacoes: [
            ['nav', 'dns', 'www.prefeitura.exemplo?'],
            ['nav', 'srv', 'GET / e a resposta'],
            ['srv', 'obj', 'um pedido por objeto'],
          ],
        },
      },
      {
        titulo: 'Anatomia de uma URL',
        texto: ['Cada pedaço responde a uma pergunta do navegador.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Parte', 'Em http://www.prefeitura.exemplo/portoes', 'Pergunta que responde'],
          linhas: [
            ['esquema', 'http', 'que protocolo (e qual porta padrão: 80)'],
            ['host', 'www.prefeitura.exemplo', 'qual máquina (o DNS dá o IP)'],
            ['caminho', '/portoes', 'qual página dentro dela'],
          ],
        },
      },
      {
        titulo: 'Estático, dinâmico e no cliente',
        texto: ['Nem toda página existe pronta. E nem todo código roda no servidor.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tipo', 'Onde nasce', 'Exemplo na final'],
          linhas: [
            ['estática (HTML, CSS, imagens)', 'arquivo pronto no servidor', 'mapa dos portões'],
            ['dinâmica', 'programa no servidor, consultando um banco', 'ingressos que ainda restam'],
            ['script no cliente', 'código que o navegador baixa e roda', 'validar o formulário de compra'],
            ['chamada em segundo plano', 'script pede só os dados, sem recarregar', 'placar que se atualiza sozinho'],
          ],
        },
      },
      {
        titulo: 'Cookie: o bilhete de quem não tem memória',
        texto: ['O HTTP esquece tudo a cada pedido. O servidor entrega um bilhete, o navegador devolve em todo pedido ao mesmo site, e o servidor acha o estado pelo bilhete.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'p1', rotulo: 'GET / (sem cookie)', x: 80, y: 50 },
            { id: 'r1', rotulo: '200 OK + Set-Cookie: sessao=s1', x: 460, y: 50 },
            { id: 'p2', rotulo: 'GET / + Cookie: sessao=s1', x: 80, y: 200 },
            { id: 'r2', rotulo: 'servidor acha a sessão s1', x: 460, y: 200 },
          ],
          ligacoes: [
            ['p1', 'r1', '1ª visita'],
            ['r1', 'p2', 'o navegador guarda'],
            ['p2', 'r2', '2ª visita'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Se o HTTP não guarda estado, como o site da loja sabe o que está no seu carrinho quando você muda de página?',
      opcoes: [
        'O servidor dá um cookie com um identificador; o navegador devolve em cada pedido, e o servidor acha o carrinho por ele',
        'A conexão TCP fica aberta para sempre e o servidor reconhece a porta',
        'O DNS guarda o carrinho junto com o IP do site',
        'O roteador da sua casa lembra o que você comprou',
      ],
      certa: 0,
      explicacao: 'O cookie é só um identificador que vai e volta. O estado (o carrinho) fica no servidor, guardado sob aquele identificador. Conexão TCP cai e reabre o tempo todo, e o DNS e o roteador não sabem nada de carrinho.',
    },
  },
  desafio: {
    carta: [
      'A arena da final publicou o nome www.final.exemplo para vender os ingressos, mas o servidor dela (203.0.113.81) também está sem página.',
      'E a bilheteria do estádio veio de fábrica sem resolvedor de nomes: o navegador dela nem sabe a quem perguntar o IP de um host.',
      'Objetivo: a página inicial da arena publicada, a bilheteria abrindo http://www.final.exemplo/ com o cookie voltando na segunda visita e a pergunta respondida.',
    ],
    dicas: [
      'Sem resolvedor, a URL para no primeiro passo: o host não vira IP. Configure na bilheteria o resolvedor recursivo da cidade (192.168.10.53).',
      'Depois, publique a página / no servidor arena e abra o site duas vezes da bilheteria.',
      'O IP aparece na linha "DNS:" do resultado da navegação.',
    ],
    perguntas: d115D,
    montar: () => mundoFinal({ semente: 7115, paginaPrefeitura: { conteudo: '<h1>Final no estádio</h1>' }, semResolvedor: ['bilheteria'] }),
    objetivo: (m) => {
      const h = http(m, 'bilheteria', SITE_ARENA);
      return [
        paginaPublicada(m, 'arena', 'da arena'),
        item(`a bilheteria abriu ${URL_ARENA} e recebeu a página`, !!h?.ok && h.servidor === 'arena', h ? (h.ok ? `${h.estado}, servida por ${h.servidor}` : `não carregou (${h.motivo})`) : 'ainda não abriu'),
        item('na visita seguinte, o cookie de sessão voltou sozinho', !!h?.ok && !!h.enviouCookie, h?.enviouCookie ? `Cookie: sessao=${h.cookies?.sessao}` : 'ainda não'),
        ...todasRespondidas(m, d115D),
      ];
    },
    solucao: [
      ['equip', 'bilheteria', 'ap-resolvedor', { ip: RESOLVEDOR }],
      ['equip', 'arena', 'ap-servico-web', { caminho: '/', conteudo: '<h1>Ingressos da final</h1>', validade: '0' }],
      ['equip', 'bilheteria', 'ap-navegar', { url: URL_ARENA }],
      ['equip', 'bilheteria', 'ap-navegar', { url: URL_ARENA }],
    ],
    respostas: { '1': ARENA_IP },
  },
};

/* ======================================================================
 * ref 116: HTTP e HTTPS (7.3.4 e 7.3.5)
 * ====================================================================== */

const PAGINA_FINAL = '<h1>Final no estádio</h1><p>Portões abrem às 14h</p>';

function certificadoValido(m: Mundo, servidor: string, rotulo: string): ItemObjetivo {
  const c = certificadoDe(m, servidor);
  const nomes: Record<string, string> = { valido: 'válido', vencido: 'vencido', autoassinado: 'autoassinado', 'nome-errado': 'de outro nome', revogado: 'revogado' };
  return item(`HTTPS ligado no servidor ${rotulo} com certificado válido`, c === 'valido', c ? `certificado ${nomes[c] ?? c}` : 'sem HTTPS');
}

function tlsOk(m: Mundo, de: string, nome: string, rotulo: string): ItemObjetivo {
  const t = tls(m, de, nome);
  return item(`${rotulo} abriu https://${nome}/ com o TLS conferido, sem aviso`, !!t?.ok, t ? (t.ok ? `certificado "${t.certificado?.sujeito}", emitido por "${t.certificado?.emissor}"` : `aviso: ${t.motivo}`) : 'ainda não abriu por https');
}

function validadeOk(m: Mundo, servidor: string, rotulo: string): ItemObjetivo {
  const p = paginaDe(m, servidor);
  return item(`a página / ${rotulo} com validade de pelo menos 60 s no cache`, (p?.maxAge ?? 0) >= 60, p ? `max-age=${p.maxAge ?? 0}` : 'sem página');
}

function doCache(m: Mundo, de: string, nome: string, rotulo: string): ItemObjetivo {
  const h = http(m, de, nome);
  return item(`a última visita ${rotulo} saiu do cache do navegador, sem ir à rede`, h?.origem === 'cache', h ? (h.ok ? `${h.estado}, origem: ${h.origem}` : `não carregou (${h.motivo})`) : 'nenhuma visita');
}

const d116D: Pergunta[] = [
  {
    id: '1',
    texto: 'Qual era o problema do certificado do site da arena, segundo o aviso do navegador? (uma palavra)',
    confere: (r) => /venc|expir/i.test(r),
  },
];

const dia116: Dia = {
  numero: 116,
  ato: 6,
  titulo: 'HTTP e HTTPS',
  chamado: [
    'CHAMADO #0116',
    'O site da prefeitura está no ar, e a cidade inteira vai abrir a página dos portões ao mesmo tempo no dia do jogo. O enlace da cidade aguenta, mas cada visita baixa a página inteira de novo, e tudo passa em claro: quem estiver no meio do caminho lê pedido, cookie e resposta.',
    'A prefeitura quer duas coisas: que o navegador não baixe o que já tem e que o site fale HTTPS.',
    'Objetivo: ver o 200 e depois o 304 do balcão, ligar o HTTPS com certificado válido e abrir o site seguro, e dar validade à página para a visita seguinte sair do cache sem tocar na rede.',
  ],
  manual: {
    titulo: 'HTTP por dentro, o cache e o cadeado',
    texto: [
      'Um pedido HTTP é texto: uma linha com o método, o caminho e a versão (GET / HTTP/1.1), depois cabeçalhos, um por linha (Host diz qual site, porque um servidor pode hospedar vários; User-Agent diz qual navegador; Cookie devolve o bilhete; Accept diz o que o navegador entende), uma linha em branco e, às vezes, um corpo. Os métodos dizem a intenção: GET busca, HEAD busca só os cabeçalhos, POST manda dados para o servidor processar (um formulário), PUT grava um recurso num caminho, DELETE apaga. A resposta começa com um código de três dígitos: 1xx é informação, 2xx deu certo (200 OK), 3xx manda olhar em outro lugar (301 mudou de endereço de vez, 304 não mudou desde a sua cópia), 4xx é erro de quem pediu (404 não existe, 403 proibido) e 5xx é erro do servidor (500 deu pane lá dentro).',
      'Abrir uma conexão TCP custa 1 RTT antes de qualquer dado, e uma página tem muitos objetos. No HTTP mais antigo, cada objeto abria e fechava a sua conexão: 2 RTT por objeto. Com conexões persistentes, a mesma conexão serve vários pedidos, um depois do outro: 1 RTT por objeto, depois da base. Com pipelining, os pedidos saem todos de uma vez, mas as respostas voltam em ordem, e uma lenta segura as de trás. O HTTP/2 resolve isso no próprio HTTP: uma conexão só, com vários fluxos intercalados em quadros binários, respostas fora de ordem e cabeçalhos comprimidos (eles se repetem quase iguais em todo pedido). Sobra a cabeça de fila do TCP quando um segmento se perde, e por isso o HTTP/3 roda sobre o QUIC, em UDP.',
      'Melhor que buscar rápido é não buscar. O navegador guarda cópias no cache, e o servidor diz por quanto tempo elas valem (Cache-Control: max-age=300 são 300 segundos). Dentro da validade, o navegador usa a cópia sem nem perguntar: zero bytes na rede. Vencida a validade, ele pergunta de um jeito condicional: manda o ETag da cópia (If-None-Match, um resumo do conteúdo) e a data dela (If-Modified-Since). Se nada mudou, o servidor responde 304 Not Modified, sem corpo; se mudou, 200 com o objeto novo. Neste laboratório, a data sai do relógio do mundo no formato de data do HTTP (Thu, 26 Nov 2026 12:00:00 GMT, sempre em GMT e com precisão de segundo), e o ETag é um resumo do conteúdo: muda quando o conteúdo muda, e só nessa hora.',
      'O HTTPS é o mesmo HTTP, só que dentro de um túnel TLS na porta 443. Antes do primeiro pedido, navegador e servidor trocam chaves (Diffie-Hellman), o servidor mostra um certificado assinado por uma autoridade certificadora em que o navegador confia, e daí em diante pedido, cookie e resposta viajam cifrados e protegidos contra alteração. Se o certificado estiver vencido, for de outro nome ou assinado por ninguém confiável, o navegador para e avisa. Quem olha o fio vê só o IP, a porta e o nome do site (que vai no SNI), não o caminho nem o conteúdo. A criptografia deste laboratório é de brinquedo, com números pequenos e AES em modo contador no lugar do modo usado de verdade; a ideia é a mesma, a força não.',
      'Cifrar o caminho não resolve tudo na privacidade. Um cookie de terceiro vem de outro site embutido na página (um anúncio, um botão de curtir): o navegador devolve o cookie desse terceiro em todo site que o embute, e ele monta o seu histórico pela web inteira. Mesmo sem cookie, o fingerprinting junta detalhes do navegador (versão, fontes, tamanho da tela, fuso) até virar uma impressão digital quase única. O pedido doNotTrack (o cabeçalho DNT: 1) pedia para não ser rastreado, mas obedecer era opcional, e quase ninguém obedeceu. A defesa que funciona é do navegador: bloquear cookie de terceiro e parecer igual a todo mundo.',
    ],
  },
  dicas: [
    'Abra http://www.prefeitura.exemplo/ do balcão duas vezes e compare o pedido: na segunda vão If-None-Match e If-Modified-Since.',
    'No servidor prefeitura, "Ligar HTTPS" com certificado válido; depois, no balcão, "Abrir uma página segura (https)".',
    'Para a validade, use "Publicar uma página" de novo no caminho /, com o mesmo conteúdo e validade de 300 s. A visita seguinte ainda pergunta (e aprende a validade nova); a outra sai do cache.',
  ],
  montar: () => mundoFinal({ semente: 6116, paginaPrefeitura: { conteudo: PAGINA_FINAL } }),
  objetivo: (m) => [certificadoValido(m, 'prefeitura', 'da prefeitura'), tlsOk(m, 'balcao', SITE, 'o balcão'), validadeOk(m, 'prefeitura', 'da prefeitura'), doCache(m, 'balcao', SITE, 'do balcão')],
  posMorte: [
    'A primeira visita trouxe 200 OK com a página inteira e um ETag. A segunda, com a cópia vencida (max-age=0), mandou If-None-Match com aquele ETag e ouviu 304 Not Modified: nenhum byte de corpo, só cabeçalhos. Num dia normal isso já economiza; no dia da final, com milhares de visitas à mesma página, é a diferença entre o enlace folgado e o enlace entupido.',
    'Com a validade de 300 s, nem a pergunta vai mais: o navegador usa a cópia sozinho durante cinco minutos. O preço é que uma mudança no site (portão trocado de última hora) só aparece depois que a validade vence. Página que muda o tempo todo fica com validade curta e vive de 304; mapa e logotipo podem ter validade longa.',
    'O HTTPS pôs o mesmo HTTP dentro do TLS: troca Diffie-Hellman, certificado conferido até uma raiz confiável e o resto cifrado. Quem olha o fio agora vê que o balcão falou com www.prefeitura.exemplo, e só. E a última visita nem abriu TLS: saiu do cache, sem sair da máquina.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar',
      valores: { url: URL_SITE },
      instrucao: 'No balcão, abra http://www.prefeitura.exemplo/ e leia o pedido e a resposta linha por linha.',
      porque: 'O HTTP é texto: método, caminho, versão, cabeçalhos. Na resposta, o código de estado e os cabeçalhos que o cache vai usar (ETag, Last-Modified, Cache-Control).',
      conferir: (m) => {
        const h = http(m, 'balcao', SITE);
        if (!h) return 'O balcão ainda não abriu o site.';
        return h.ok && h.estado === 200 ? true : `Veio outra coisa (${h.estado ?? h.motivo}).`;
      },
      feito: 'GET / HTTP/1.1 com Host, User-Agent e Accept. Voltou 200 OK, o HTML, um ETag e Cache-Control: max-age=0, que quer dizer "pode guardar, mas pergunte antes de usar".',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar',
      valores: { url: URL_SITE },
      instrucao: 'Abra a mesma página de novo e compare o pedido com o primeiro.',
      porque: 'A cópia está no cache, mas vencida. O navegador não sabe se ela ainda serve, então pergunta de um jeito que o servidor pode responder sem mandar o corpo.',
      conferir: (m) => {
        const h = http(m, 'balcao', SITE);
        if (h?.estado === 304) return true;
        return h?.estado === 200 ? 'Veio 200 de novo: a página mudou ou o cache foi apagado. Abra mais uma vez.' : 'A segunda visita ainda não foi feita.';
      },
      feito: 'O pedido levou If-None-Match com o ETag e If-Modified-Since. O servidor viu que nada mudou e respondeu 304 Not Modified, sem corpo. O navegador mostrou a cópia que já tinha.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'ap-servico-https',
      pedir: ['tipo'],
      exemplo: { tipo: 'valido' },
      instrucao: 'No servidor da prefeitura, ligue o HTTPS com um certificado que o navegador vai aceitar.',
      porque: 'O certificado diz "esta chave pública é de www.prefeitura.exemplo", assinado por uma autoridade em que o navegador confia, dentro do prazo e não revogado.',
      conferir: (m) => {
        const c = certificadoDe(m, 'prefeitura');
        if (c === 'valido') return true;
        if (!c) return 'O HTTPS ainda não foi ligado.';
        return `Com um certificado ${c === 'nome-errado' ? 'de outro nome' : c}, o navegador vai parar e avisar. Escolha o válido.`;
      },
      feito: 'Porta 443 aberta, com o certificado de www.prefeitura.exemplo emitido pela AC Intermediária Exemplo, que vem da AC Raiz Exemplo.',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar-https',
      valores: { url: URL_SITE_S },
      instrucao: 'No balcão, abra https://www.prefeitura.exemplo/ e veja o aperto de mão do TLS antes do HTTP.',
      porque: 'O HTTP é o mesmo de antes; muda o que vem antes dele (o TLS) e o que um farejador vê no fio.',
      conferir: (m) => {
        const t = tls(m, 'balcao', SITE);
        if (!t) return 'O balcão ainda não abriu o site por https.';
        return t.ok ? true : `O navegador avisou: ${t.motivo}.`;
      },
      feito: 'ClientHello e ServerHello com as chaves Diffie-Hellman, certificado conferido pela cadeia, e o mesmo GET de antes, agora cifrado. Desta vez sem If-None-Match: para o cache do navegador, http://www.prefeitura.exemplo/ e https://www.prefeitura.exemplo/ são endereços diferentes, e a cópia do primeiro não vale para o segundo. No fio, só o nome no SNI fica legível.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'ap-servico-web',
      valores: { caminho: '/', conteudo: PAGINA_FINAL },
      pedir: ['validade'],
      exemplo: { validade: '300' },
      instrucao: 'No servidor da prefeitura, publique a mesma página com uma validade no cache de pelo menos 60 s.',
      porque: 'Com validade, o navegador nem pergunta enquanto a cópia estiver fresca. O conteúdo é o mesmo, então o resumo também é: repare que a próxima resposta traz o mesmo ETag de antes.',
      conferir: (m) => {
        const v = paginaDe(m, 'prefeitura')?.maxAge ?? 0;
        return v >= 60 ? true : v > 0 ? `${v} s é pouco para o pico do jogo. Use pelo menos 60.` : 'A página continua com validade 0: toda visita pergunta.';
      },
      feito: 'Agora o servidor responde com Cache-Control: max-age igual à validade.',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar-https',
      valores: { url: URL_SITE_S },
      instrucao: 'No balcão, abra o site seguro mais uma vez.',
      porque: 'A cópia do balcão ainda tem a validade antiga (0). Esta visita pergunta, ouve 304 e, junto, aprende a validade nova.',
      conferir: (m) => {
        const h = http(m, 'balcao', SITE);
        return h?.ok ? true : `A página não carregou (${h?.motivo ?? 'sem tentativa'}).`;
      },
      feito: '304 de novo, mas agora com Cache-Control: max-age novo. O navegador renovou a cópia com a validade nova.',
    }),
    passo({
      alvo: ['equip', 'balcao'],
      acao: 'ap-navegar-https',
      valores: { url: URL_SITE_S },
      instrucao: 'E abra de novo, logo em seguida.',
      porque: 'Dentro da validade, o navegador nem abre conexão.',
      conferir: (m) => (http(m, 'balcao', SITE)?.origem === 'cache' ? true : 'Ainda foi à rede. Abra mais uma vez, antes de a validade vencer.'),
      feito: 'Do cache: sem DNS, sem TCP, sem TLS, sem nada na rede. A página aparece na hora, e o enlace da cidade nem fica sabendo.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Métodos e códigos',
        texto: ['O método diz a intenção; o primeiro dígito do código diz de quem é o problema.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Método', 'Para quê', 'Código', 'Quer dizer'],
          linhas: [
            ['GET', 'buscar', '200', 'deu certo'],
            ['HEAD', 'só os cabeçalhos', '301', 'mudou de endereço de vez'],
            ['POST', 'mandar dados para processar', '304', 'não mudou: use a sua cópia'],
            ['PUT', 'gravar no caminho', '404', 'não existe (erro de quem pediu)'],
            ['DELETE', 'apagar', '500', 'pane no servidor'],
          ],
        },
      },
      {
        titulo: 'Quantas idas e voltas por página',
        texto: ['Uma página base com 10 imagens, sem contar o DNS. Reaproveitar a conexão e mandar os pedidos juntos é o que mais pesa.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Jeito', 'Conexões', 'RTT'],
          linhas: [
            ['não persistente (uma conexão por objeto)', '11', '22'],
            ['persistente, um pedido por vez', '1', '12'],
            ['pipelining (respostas em ordem)', '1', '3'],
            ['HTTP/2 (fluxos intercalados, cabeçalho comprimido)', '1', '3'],
          ],
        },
      },
      {
        titulo: 'O cache em três situações',
        texto: ['Fresca: nem pergunta. Vencida: pergunta com o ETag. Mudou: vem tudo de novo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação da cópia', 'O navegador', 'O servidor', 'Na rede'],
          linhas: [
            ['dentro do max-age', 'usa a cópia', 'nem fica sabendo', 'nada'],
            ['vencida, conteúdo igual', 'GET com If-None-Match', '304 Not Modified', 'só cabeçalhos'],
            ['vencida, conteúdo mudou', 'GET com If-None-Match', '200 com o objeto novo', 'tudo'],
          ],
        },
      },
      {
        titulo: 'HTTPS: o mesmo HTTP, dentro do TLS',
        texto: ['O TLS vem antes do primeiro pedido e embrulha tudo o que vem depois. HTTP/3 troca o TCP pelo QUIC, com o TLS embutido.'],
        visual: { tipo: 'camadas', camadas: ['HTTP (GET, cabeçalhos, cookie)', 'TLS: chaves, certificado e cifra', 'TCP na porta 443', 'IP'], rotulo: 'o que viaja no HTTPS' },
      },
      {
        titulo: 'Quem sabe o que de você',
        texto: ['O HTTPS esconde o conteúdo de quem está no fio, não de quem está na página.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Técnica', 'Como rastreia', 'Defesa'],
          linhas: [
            ['cookie de terceiro', 'o mesmo terceiro embutido em vários sites lê o mesmo cookie', 'bloquear cookie de terceiro'],
            ['fingerprinting', 'versão, fontes, tela e fuso viram uma impressão quase única', 'navegador que parece igual a todos'],
            ['doNotTrack (DNT: 1)', 'é só um pedido; obedecer é opcional', 'quase nenhuma'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O navegador tem a página no cache, vencida, e o conteúdo no servidor não mudou. O que acontece na próxima visita?',
      opcoes: [
        'O navegador manda um GET com If-None-Match e o servidor responde 304, sem corpo',
        'O navegador usa a cópia sem perguntar nada',
        'O servidor manda a página inteira de novo com 200',
        'O servidor responde 404 porque a cópia venceu',
      ],
      certa: 0,
      explicacao: 'Vencida, a cópia não pode ser usada às cegas, mas pode ser validada: o ETag vai no If-None-Match, o servidor compara com o atual e, se for igual, responde 304 só com cabeçalhos. Usar sem perguntar é o que acontece dentro da validade; 200 com tudo é quando o conteúdo mudou.',
    },
  },
  desafio: {
    carta: [
      'A arena publicou o site de ingressos já com HTTPS, mas a bilheteria reclama: o navegador para numa tela de aviso e não mostra nada.',
      'E na hora da venda a bilheteria vai abrir a mesma página centenas de vezes; não dá para cada uma atravessar o enlace.',
      'Objetivo: descobrir o problema do certificado e trocar por um válido, abrir https://www.final.exemplo/ da bilheteria sem aviso, dar à página / da arena uma validade de pelo menos 60 s e fazer a visita seguinte sair do cache.',
    ],
    dicas: [
      'Abra https://www.final.exemplo/ da bilheteria e leia a linha do AVISO DO NAVEGADOR: ela diz o que há de errado com o certificado.',
      'No servidor arena, "Ligar HTTPS" com o certificado válido e "Publicar uma página" no caminho / com validade de 300 s.',
      'Com a página nova já com validade, a primeira visita traz 200 e a validade; a segunda sai do cache.',
    ],
    perguntas: d116D,
    montar: () => mundoFinal({ semente: 7116, paginaPrefeitura: { conteudo: PAGINA_FINAL }, paginaArena: { conteudo: '<h1>Ingressos da final</h1>' }, httpsArena: 'vencido' }),
    objetivo: (m) => [certificadoValido(m, 'arena', 'da arena'), tlsOk(m, 'bilheteria', SITE_ARENA, 'a bilheteria'), validadeOk(m, 'arena', 'da arena'), doCache(m, 'bilheteria', SITE_ARENA, 'da bilheteria'), ...todasRespondidas(m, d116D)],
    solucao: [
      ['equip', 'bilheteria', 'ap-navegar-https', { url: URL_ARENA_S }],
      ['equip', 'arena', 'ap-servico-https', { tipo: 'valido' }],
      ['equip', 'arena', 'ap-servico-web', { caminho: '/', conteudo: '<h1>Ingressos da final</h1><p>Setor norte esgotado</p>', validade: '300' }],
      ['equip', 'bilheteria', 'ap-navegar-https', { url: URL_ARENA_S }],
      ['equip', 'bilheteria', 'ap-navegar-https', { url: URL_ARENA_S }],
    ],
    respostas: { '1': 'vencido' },
  },
};

/* ======================================================================
 * ref 117: Ao vivo (7.4)
 * ====================================================================== */

/** Taxa da transmissão em alta definição que o codificador da arena entrega, em kb/s. */
const TAXA_HD = 8700;
/** Duração do aquecimento transmitido, em segundos. */
const DUR_HD = 300;
/** Taxa da transmissão em 4K do desafio, em kb/s: acima da banda do enlace. */
const TAXA_4K = 12000;
/** Banda do enlace da cidade até a operadora, em Mb/s. */
const BANDA_CIDADE = 10;

const d117: Pergunta[] = [numerica('1', 'A voz do narrador vai até 4000 Hz. Quantas amostras por segundo, no mínimo, para digitalizar sem perder nada?', 8000, 0)];

const d117D: Pergunta[] = [
  numerica('1', 'Quantos Mb/s teria o vídeo cru de 1920 × 1080 pontos, 24 bits por ponto e 30 quadros por segundo, sem compressão nenhuma? (arredonde)', (1920 * 1080 * 24 * 30) / 1e6, 5),
];

function assistiuSemTravar(m: Mundo, adaptativo: boolean, atrasoMax = Infinity): ItemObjetivo {
  const v = streaming(m, 'telao');
  const ok = !!v?.ok && v.travamentos === 0 && (!adaptativo || !!v.adaptativo) && (v.atrasoInicial ?? 0) <= atrasoMax;
  const modo = adaptativo ? ' no modo adaptativo' : '';
  const limite = atrasoMax < Infinity ? `, começando em até ${atrasoMax} s` : '';
  const det = !v
    ? 'o telão ainda não assistiu à transmissão'
    : !v.ok
      ? `não começou (${(m.flags.streaming as { motivo?: string }).motivo})`
      : `${v.adaptativo ? 'adaptativo' : 'qualidade fixa'}, atraso inicial ${String(v.atrasoInicial).replace('.', ',')} s, ${v.travamentos} travamento(s)${v.adaptativo ? `, qualidade média ${v.qualidadeMedia} kb/s` : ''}`;
  return item(`o telão assistiu à transmissão do início ao fim sem travar${modo}${limite}`, ok, det);
}

const dia117: Dia = {
  numero: 117,
  ato: 6,
  titulo: 'Ao vivo',
  chamado: [
    'CHAMADO #0117',
    `É hoje. A arena vai transmitir o aquecimento e o jogo, e o telão do estádio, mais metade das casas da cidade, vão assistir pela rede. O codificador da arena entrega a imagem em alta definição a ${TAXA_HD} kb/s, e o enlace da cidade até a operadora é de ${BANDA_CIDADE} Mb/s, dividido com todo o resto.`,
    'No ensaio de ontem, o reprodutor do telão começou a tocar na hora, sem reserva nenhuma, e a imagem congelou no meio do aquecimento. O técnico da arena jura que a banda dá.',
    'Objetivo: pôr no ar a transmissão dos 5 minutos de aquecimento no servidor da arena, ver o telão travar sem buffer, achar o atraso inicial que segura a transmissão inteira e responder a conta do áudio.',
  ],
  manual: {
    titulo: 'Áudio, vídeo e o que chega ao vivo',
    texto: [
      'O som é uma onda contínua; para virar bits, é medido muitas vezes por segundo (amostragem) e cada medida vira um número de tamanho fixo (quantização). O teorema de Nyquist diz quantas medidas bastam: o dobro da maior frequência que se quer guardar. A voz humana cabe em 4000 Hz, então o telefone mede 8000 vezes por segundo; com 8 bits por amostra, são 64 kb/s, o PCM clássico. Música vai até uns 20 kHz: 44100 amostras por segundo, 16 bits, dois canais, mais de 1,4 Mb/s. Poucos bits por amostra deixam degraus entre o som real e o guardado, o erro de quantização, que se ouve como chiado.',
      'Para caber na rede, o áudio é comprimido com perda, de um jeito esperto: a compressão perceptual joga fora o que o ouvido não percebe. Um som forte mascara os sons fracos de frequência vizinha (e os que vêm logo depois dele); esses não precisam ser guardados com cuidado, ou nem ser guardados. É assim que uma música cai para uns 128 kb/s sem que quase ninguém note.',
      'Vídeo é uma sequência de quadros, imagens paradas mostradas depressa (25 ou 30 por segundo). Cru, ele é enorme: 1920 × 1080 pontos com 24 bits cada, 30 vezes por segundo, dá perto de 1,5 Gb/s, muito mais do que cabe na maioria das conexões. A compressão aproveita que um quadro parece muito com o seguinte. Um quadro I é uma imagem completa, comprimida sozinha (como uma foto). Um quadro P guarda só a diferença em relação ao anterior, com vetores de movimento ("este bloco andou 3 pontos para a direita"). Um quadro B olha para o anterior e para o seguinte, e costuma ser o menor. Os quadros I aparecem de tempos em tempos, para quem chega no meio poder começar.',
      'Assistir a um vídeo guardado (streaming de mídia armazenada) é baixar e tocar ao mesmo tempo. A banda que sobra varia segundo a segundo, e os pacotes chegam com espaçamento irregular (jitter). O reprodutor se defende com um buffer: espera um atraso inicial juntando alguns segundos de vídeo e, se a banda cair, consome a reserva. Buffer curto começa rápido e trava na primeira queda; buffer longo segura as quedas, mas demora a começar. Se a banda média fica abaixo da taxa do vídeo, nenhum buffer resolve. Por isso o streaming adaptativo (tipo DASH) corta o vídeo em trechos de poucos segundos, cada um em várias qualidades, e o reprodutor escolhe, trecho a trecho, a maior qualidade que a banda medida aguenta.',
      'Ao vivo há menos folga: o buffer não pode ser grande, ou o gol aparece no telão depois de o vizinho gritar. E na conferência em tempo real (voz e vídeo nos dois sentidos), o atraso fim a fim tolerável é de uns 150 ms; acima de 400 ms a conversa vira um falando por cima do outro. Ali vale mais perder um pacote do que esperar a retransmissão, e por isso a mídia vai em RTP sobre UDP, com número de sequência e carimbo de tempo para o receptor reordenar e tocar no ritmo certo. Quem combina a chamada (quem liga para quem, em que endereço, com que codificador) é um protocolo de sinalização, o SIP, que só arma a conversa: a mídia anda por fora dele.',
    ],
  },
  dicas: [
    `No servidor arena, "Servir um vídeo" com o nome video, taxa de ${TAXA_HD} kb/s e ${DUR_HD} s de duração (os 5 minutos de aquecimento).`,
    'No telão, "Assistir a um vídeo" com atraso inicial de 0 s em qualidade fixa, como no ensaio: a banda média dá, mas varia, e sem reserva a primeira queda congela a imagem.',
    'Aumente o atraso inicial até a linha do tempo não ter nenhum x. Quando trava, a própria saída diz o menor atraso que segura esta transmissão; 10 s de reserva sobram.',
  ],
  perguntas: d117,
  montar: () => mundoFinal({ semente: 6117, mbps: BANDA_CIDADE, paginaPrefeitura: { conteudo: PAGINA_FINAL, maxAge: 300 }, httpsPrefeitura: 'valido' }),
  objetivo: (m) => {
    const v = videoDe(m);
    return [
      item(`a arena servindo a transmissão "video" de ${DUR_HD} s a ${TAXA_HD} kb/s`, v?.taxa === TAXA_HD && v.duracao === DUR_HD, v ? `${v.taxa} kb/s, ${v.duracao} s` : 'nenhum vídeo no ar'),
      assistiuSemTravar(m, false),
      ...todasRespondidas(m, d117),
    ];
  },
  posMorte: [
    `O técnico tinha razão pela metade: a banda média que sobrava para o vídeo, uns 9 Mb/s, dava conta dos ${TAXA_HD} kb/s, mas por pouco, e a banda não é média, é segundo a segundo. Com outros fluxos dividindo o enlace, ela oscila, e nas quedas (um fluxo novo disputando o enlace, uma perda que faz o TCP cortar a janela pela metade) cai a uns 5 Mb/s por alguns segundos seguidos. Cada segundo abaixo da taxa do vídeo come a reserva do buffer. Sem reserva nenhuma, a primeira queda já congelou a imagem.`,
    'Com alguns segundos de atraso inicial, o reprodutor começou com uma reserva grande o bastante para atravessar as quedas, e os 5 minutos tocaram do começo ao fim. O preço foi a espera no começo, aceitável para o aquecimento; para o jogo em si, cada segundo de buffer é um segundo de atraso em relação ao estádio, e o vizinho com rádio grita gol antes do telão.',
    'Para quem conversa ao vivo, essa conta não fecha: 10 s de atraso numa videochamada é inviável. Lá a mídia vai em RTP sobre UDP, o buffer é de dezenas de milissegundos, e o que se perde fica perdido. E se a banda média cair abaixo da taxa do vídeo, buffer nenhum salva; aí o que salva é baixar a qualidade, que é o assunto do desafio.',
  ],
  passos: [
    passo({
      pergunta: '1',
      exemplo: { resposta: '8000' },
      instrucao: 'Antes do vídeo, o som: a voz do narrador vai até 4000 Hz. Quantas amostras por segundo, no mínimo?',
      porque: 'Nyquist: para reconstruir uma onda, é preciso medir pelo menos duas vezes a cada ciclo da frequência mais alta.',
      feito: '8000 amostras por segundo. Com 8 bits cada, 64 kb/s de PCM, o mesmo número da telefonia digital. A compressão perceptual derruba isso bastante, jogando fora o que o ouvido não percebe.',
    }),
    passo({
      escolha: {
        opcoes: ['Um quadro B, que só guarda a diferença em relação ao anterior e ao seguinte', 'Um quadro I, que é a imagem completa', 'Os três têm o mesmo tamanho', 'Um quadro P, porque guarda a imagem completa e a diferença'],
        certa: 0,
        errada: {
          1: 'O quadro I é o maior: é uma foto inteira, comprimida sozinha, sem aproveitar os vizinhos.',
          2: 'Se fossem iguais, a compressão entre quadros não serviria para nada. O que diferencia é o quanto cada um aproveita dos vizinhos.',
          3: 'O P guarda só a diferença em relação ao anterior, não a imagem completa. Fica entre o I e o B.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Câmera parada no gramado, quase nada muda de um quadro para o outro. Qual tipo de quadro tende a ser o menor?',
      porque: 'A compressão de vídeo vive de não repetir o que já foi mandado. Quanto mais vizinhos um quadro pode consultar, menos ele precisa guardar.',
      feito: 'O B, que consulta o anterior e o seguinte. O I é o maior e aparece de tempos em tempos, para quem liga a TV no meio poder começar.',
    }),
    passo({
      alvo: ['equip', 'arena'],
      acao: 'ap-servico-streaming',
      valores: { nome: 'video', dur: String(DUR_HD) },
      pedir: ['taxa'],
      exemplo: { taxa: String(TAXA_HD) },
      instrucao: 'No servidor da arena, ponha no ar a transmissão "video" dos 5 minutos de aquecimento, com a taxa que o codificador entrega.',
      porque: 'A taxa do vídeo, em kb/s, é quanto a rede precisa entregar por segundo para a imagem não esperar.',
      conferir: (m) => {
        const v = videoDe(m);
        if (!v) return 'A transmissão "video" ainda não está no ar na arena.';
        return v.taxa === TAXA_HD ? true : `O codificador da arena entrega ${TAXA_HD} kb/s, não ${v.taxa}.`;
      },
      feito: `Transmissão de ${DUR_HD} s a ${TAXA_HD} kb/s, na porta 80 da arena.`,
    }),
    passo({
      alvo: ['equip', 'telao'],
      acao: 'ap-assistir',
      valores: { url: URL_VIDEO, modo: 'fixo' },
      pedir: ['atraso'],
      exemplo: { atraso: '0' },
      instrucao: 'No telão, assista à transmissão em qualidade fixa, começando na hora, com atraso inicial de 0 s, como no ensaio.',
      porque: 'Sem reserva, qualquer segundo em que a banda fica abaixo da taxa do vídeo deixa o reprodutor sem ter o que mostrar.',
      conferir: (m) => {
        const v = streaming(m, 'telao');
        if (!v) return 'O telão ainda não assistiu à transmissão.';
        if (!v.ok) return 'A transmissão não começou.';
        if (v.adaptativo) return 'Use a qualidade fixa: o adaptativo é para o desafio.';
        if ((v.atrasoInicial ?? 0) > 1) return 'Com reserva, o buffer segura. Para ver o problema do ensaio, use 0 s.';
        return (v.travamentos ?? 0) > 0 ? true : 'Não travou: confira se o atraso inicial ficou mesmo em 0 s e a qualidade fixa.';
      },
      feito: 'Travou: a linha do tempo mostra os x onde o buffer secou e a imagem congelou esperando os próximos pedaços de vídeo chegarem. A banda média deu conta; o que faltou foi reserva.',
    }),
    passo({
      alvo: ['equip', 'telao'],
      acao: 'ap-assistir',
      valores: { url: URL_VIDEO, modo: 'fixo' },
      pedir: ['atraso'],
      exemplo: { atraso: '10' },
      instrucao: 'Agora aumente o atraso inicial até a transmissão tocar do começo ao fim sem travar.',
      porque: 'A banda média dá conta da taxa; o que falta é reserva para atravessar as quedas. Mais atraso inicial é mais reserva.',
      conferir: (m) => {
        const v = streaming(m, 'telao');
        if (!v?.ok) return 'A transmissão não começou.';
        if (v.adaptativo) return 'Use a qualidade fixa: o objetivo é ver o buffer resolver sozinho.';
        return v.travamentos === 0 ? true : `${v.travamentos} travamento(s) com ${v.atrasoInicial} s de reserva. Aumente o atraso inicial.`;
      },
      feito: 'Sem nenhum x: a reserva de alguns segundos atravessou todas as quedas. O preço é começar alguns segundos depois.',
    }),
    passo({
      escolha: {
        opcoes: ['Perder um pacote de vez em quando, com RTP sobre UDP e buffer de dezenas de milissegundos', 'Um buffer de 10 s, como o do telão', 'TCP, para retransmitir tudo que se perder', 'Baixar a chamada inteira antes de começar a falar'],
        certa: 0,
        errada: {
          1: 'Com 10 s de atraso, ninguém conversa: o tolerável numa chamada é uns 150 ms de ponta a ponta.',
          2: 'Esperar a retransmissão custa pelo menos mais um RTT, e o pedaço chega tarde demais para ser tocado. Na conversa, atrasado é o mesmo que perdido.',
          3: 'Numa conversa ao vivo, o que vai ser dito ainda não existe para ser baixado.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O médico do posto vai comentar o jogo numa chamada de vídeo com a rádio da cidade. O que serve para ele?',
      porque: 'Na conferência, o atraso fim a fim pesa mais do que um pedaço de imagem perdido.',
      feito: 'RTP sobre UDP: número de sequência e carimbo de tempo para tocar no ritmo, sem esperar retransmissão. O SIP combina a chamada antes (quem, onde, com que codificador), e a mídia anda por fora dele.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Do som aos bits',
        texto: ['Amostre a pelo menos o dobro da maior frequência (Nyquist) e guarde cada amostra com um número fixo de bits.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Som', 'Maior frequência', 'Amostras por segundo', 'Bits por amostra', 'Taxa PCM'],
          linhas: [
            ['voz no telefone', '4000 Hz', '8000', '8', '64 kb/s'],
            ['música (2 canais)', 'uns 20000 Hz', '44100', '16', '1411,2 kb/s'],
          ],
        },
      },
      {
        titulo: 'Quanto pesa cada coisa',
        texto: ['A compressão é o que faz áudio e vídeo caberem na rede.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mídia', 'Crua', 'Comprimida (típico)'],
          linhas: [
            ['voz de telefone (8000 amostras, 8 bits)', '64 kb/s', 'uns 8 a 32 kb/s'],
            ['música (44100 amostras, 16 bits, 2 canais)', 'uns 1,4 Mb/s', 'uns 128 kb/s, com mascaramento'],
            ['vídeo 1920 × 1080, 24 bits, 30 quadros/s', 'uns 1,5 Gb/s', 'uns 5 a 8 Mb/s, com quadros I, P e B'],
          ],
        },
      },
      {
        titulo: 'Quadros I, P e B',
        texto: ['O I é a imagem inteira; o P é a diferença do anterior; o B, a diferença do anterior e do seguinte.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'i', rotulo: 'I (completo)', x: 60, y: 120 },
            { id: 'b1', rotulo: 'B', x: 200, y: 120 },
            { id: 'b2', rotulo: 'B', x: 320, y: 120 },
            { id: 'p', rotulo: 'P (diferença do I)', x: 470, y: 120 },
          ],
          ligacoes: [
            ['i', 'p', 'P consulta o anterior'],
            ['i', 'b1', ''],
            ['b1', 'p', 'B consulta os dois lados'],
            ['b2', 'p', ''],
          ],
        },
      },
      {
        titulo: 'O buffer contra as quedas',
        texto: ['A banda oscila e os pacotes chegam com jitter. O buffer guarda uma reserva; o adaptativo troca a qualidade trecho a trecho.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Buffer curto', 'Buffer longo', 'Adaptativo'],
          linhas: [
            ['banda média acima da taxa, oscilando', 'trava nas quedas', 'toca liso, começa tarde', 'toca liso'],
            ['banda média abaixo da taxa', 'trava', 'trava (só demora mais)', 'baixa a qualidade e toca'],
            ['ao vivo', 'perto do estádio, frágil', 'seguro, mas atrasado', 'o meio-termo usado de fato'],
          ],
        },
      },
      {
        titulo: 'Conversa em tempo real',
        texto: ['Na conferência, a conta é outra: perder um pacote é melhor do que esperar por ele.'],
        visual: { tipo: 'camadas', camadas: ['voz e vídeo comprimidos', 'RTP: sequência e carimbo de tempo', 'UDP: sem retransmissão', 'IP'], rotulo: 'a mídia; o SIP só combina a chamada, por fora' },
      },
    ],
    checagem: {
      pergunta: 'O vídeo pede 12 Mb/s e a banda média do caminho é de uns 9 Mb/s. O que faz a transmissão tocar sem travar, começando logo?',
      opcoes: [
        'Streaming adaptativo: o reprodutor escolhe trechos de qualidade menor, que caibam na banda medida',
        'Um atraso inicial de 3 s em vez de 1 s',
        'Trocar o TCP por UDP no reprodutor',
        'Aumentar a taxa de amostragem do áudio',
      ],
      certa: 0,
      explicacao: 'Com a banda média abaixo da taxa, a reserva do buffer só diminui: um atraso maior adia o travamento, mas não evita, a não ser esperando quase o vídeo inteiro baixar. O adaptativo corta o vídeo em trechos com várias qualidades e pede, a cada trecho, a maior que a banda aguenta.',
    },
  },
  desafio: {
    carta: [
      `Começou o jogo, e a arena trocou a transmissão por uma versão em 4K a ${TAXA_4K} kb/s, "para o telão ficar bonito". O enlace da cidade continua com ${BANDA_CIDADE} Mb/s.`,
      'O povo no estádio não aceita esperar mais que uns segundos para a imagem começar, nem a imagem congelando no meio do lance.',
      'Objetivo: o telão assistindo do começo ao fim sem travar, começando em até 4 s, e a conta do vídeo cru respondida.',
    ],
    dicas: [
      `Com ${TAXA_4K} kb/s contra uma banda média de uns 9 Mb/s, buffer pequeno não resolve: a reserva só diminui.`,
      'No telão, "Assistir a um vídeo" no modo adaptativo, com atraso inicial de 2 a 4 s.',
      'Vídeo cru: pontos por quadro × bits por ponto × quadros por segundo, dividido por um milhão para dar Mb/s.',
    ],
    perguntas: d117D,
    montar: () => mundoFinal({ semente: 7117, mbps: BANDA_CIDADE, paginaPrefeitura: { conteudo: PAGINA_FINAL, maxAge: 300 }, httpsPrefeitura: 'valido', video: { taxa: TAXA_4K, duracao: DUR_HD } }),
    objetivo: (m) => [assistiuSemTravar(m, true, 4), ...todasRespondidas(m, d117D)],
    solucao: [['equip', 'telao', 'ap-assistir', { url: URL_VIDEO, atraso: '4', modo: 'adaptativo' }]],
    respostas: { '1': '1493' },
  },
};

export const ATO6B: Dia[] = [dia115, dia116, dia117];
