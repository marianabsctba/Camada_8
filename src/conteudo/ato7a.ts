// Dias do ato 7 (O Cerco), com prática guiada, aula e desafio no próprio dia.
// O centro de operações, à noite: anatomia de um ataque (8.1 e 8.2), firewall e IDS (8.3) e
// os primeiros segredos da criptografia (8.4 e 8.5). Os ataques rodam só no laboratório da cidade.

import { avaliarFirewall, firewallDe, idsDe, type ConfigFirewall, type InfoPacote } from '../motor/filtro';
import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Equipamento, type Mundo } from '../motor/mundo';
import type { InundacaoSyn } from '../motor/transporte';
import { lerCidr, lerIp } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;
const ip = (s: string) => lerIp(s)!;

const LOJA = '203.0.113.10';
const GATEWAY = '192.168.1.1';
const BIBLIOTECA = '192.168.1.11';
const PORTAL = '192.168.1.80';

/* ---------- o laboratório da cidade ---------- */

/**
 * Rede de dentro do laboratório (192.168.1.0/24, switch sw): secretaria, biblioteca, dns1 (resolvedor da cidade)
 * e a bancada de testes. A borda liga a rede ao provedor por um enlace de 10 Mb/s; atrás do provedor, a rede
 * pública 203.0.113.0/24 com a loja (DNS e web de loja.exemplo) e uma máquina visitante.
 */
function laboratorio(semente: number, o: { portal?: boolean } = {}): Mundo {
  const m = novoMundo(semente);
  m.flags.aplicacao = true;
  m.flags.seguranca = true;
  const host = (nome: string, end: string, gw: string, modelo: string) => adicionar(m, pc(nome, { ip: cidr(end), gateway: gw, modelo }));
  host('secretaria', '192.168.1.10/24', GATEWAY, 'Computador da secretaria do centro de operações');
  host('biblioteca', `${BIBLIOTECA}/24`, GATEWAY, 'Terminal público da biblioteca');
  host('dns1', '192.168.1.53/24', GATEWAY, 'Resolvedor DNS da cidade');
  host('bancada', '192.168.1.66/24', GATEWAY, 'Bancada de testes do laboratório (só para ensaio)');
  if (o.portal) host('portal', `${PORTAL}/24`, GATEWAY, 'Servidor do portal da prefeitura');
  host('loja', `${LOJA}/24`, '203.0.113.1', 'Servidor da loja do laboratório');
  host('visitante', '203.0.113.30/24', '203.0.113.1', 'Máquina de fora, do outro lado do provedor');
  const borda = adicionar(m, roteador('borda', { modelo: 'Roteador de borda do laboratório', interfaces: { p1: `${GATEWAY}/24`, p2: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('provedor', { modelo: 'Roteador do provedor', interfaces: { p1: '198.51.100.2/30', p2: '203.0.113.1/24' }, rotas: [{ destino: '192.168.1.0/24', via: '198.51.100.1' }] }));
  adicionar(m, comutador('sw', { portas: 8 }));
  adicionar(m, comutador('sw2', { portas: 8 }));
  borda.portas.find((p) => p.nome === 'p2')!.velocidades = [10];
  const dentro = ['secretaria', 'biblioteca', 'dns1', 'bancada', ...(o.portal ? ['portal'] : [])];
  dentro.forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw', porta: `p${i + 1}` }, 'cat6', 5));
  ligar(m, { equip: 'sw', porta: 'p8' }, { equip: 'borda', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'borda', porta: 'p2' }, { equip: 'provedor', porta: 'p1' }, 'cat6', 90);
  ligar(m, { equip: 'provedor', porta: 'p2' }, { equip: 'sw2', porta: 'p8' }, 'cat6', 5);
  ['loja', 'visitante'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw2', porta: `p${i + 1}` }, 'cat6', 5));
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('loja').servicos = {
    dns: { zona: 'loja.exemplo', registros: [{ nome: 'www', tipo: 'A', valor: LOJA, ttl: 300 }] },
    web: { paginas: { '/': { conteudo: '<h1>Loja do laboratório</h1>' }, '/login': { conteudo: '<h1>Entrar</h1>' } } },
  };
  s('dns1').servicos = { dns: { zona: 'fimdelinha.exemplo', recursivo: true, registros: [{ nome: 'portal', tipo: 'A', valor: PORTAL }] } };
  if (o.portal) s('portal').servicos = { web: { paginas: { '/': { conteudo: '<h1>Prefeitura de Fim de Linha</h1>' } } } };
  for (const n of ['secretaria', 'biblioteca', 'bancada', 'loja', 'visitante', ...(o.portal ? ['portal'] : [])]) s(n).dns = '192.168.1.53';
  return m;
}

function equip(m: Mundo, nome: string): Equipamento {
  return m.equipamentos.get(nome)!;
}

interface Varredura {
  de: string;
  alvo: string;
  proto: string;
  abertas: number[];
  filtradas: number;
  alertas: number;
}

/** A última varredura TCP da bancada até a loja. */
function varredura(m: Mundo): Varredura | undefined {
  const v = m.flags.varredura as Varredura | undefined;
  return v && v.de === 'bancada' && v.alvo === LOJA && v.proto === 'tcp' ? v : undefined;
}

function segredosFarejados(m: Mundo): string[] {
  const f = m.flags.farejar as { de: string; segredos: string[] } | undefined;
  return f && f.de === 'bancada' ? f.segredos : [];
}

function arpFixo(m: Mundo, nome: string, end: string): boolean {
  const est = equip(m, nome).s.arpEstatico as Record<number, string> | undefined;
  return !!est?.[ip(end)];
}

/* ======================================================================
 * ref 120: Anatomia de um ataque (8.1 e 8.2)
 * ====================================================================== */

const SENHA = 'Livro42';
const URL_SENHA = `http://www.loja.exemplo/login?usuario=biblioteca&senha=${SENHA}`;

const d120: Pergunta[] = [numerica('1', 'Quantas portas TCP a varredura achou abertas na loja (203.0.113.10)?', (m) => varredura(m)?.abertas.length ?? NaN, 0)];

const d120D: Pergunta[] = [numerica('1', 'Quantas conexões meio abertas cabem na fila da loja?', 128, 0)];

interface AtaqueSyn {
  tipo: string;
  de?: string;
  servidor?: string;
  synCookies?: boolean;
  cheia?: boolean;
  chegou?: boolean;
}

const dia120: Dia = {
  numero: 120,
  ato: 7,
  titulo: 'Anatomia de um ataque',
  chamado: [
    'CHAMADO #0120',
    'Primeira noite no centro de operações. Desde que a final passou ao vivo, Fim de Linha aparece no mapa, e alguém começou a bater na porta: o registro da borda mostra sondas em portas que ninguém usa, e o terminal da biblioteca teve uma senha trocada sem explicação.',
    'Para defender, é preciso entender como se ataca. A prefeitura montou um laboratório isolado, com uma bancada de testes, para ensaiar o ataque inteiro sem tocar em ninguém de verdade.',
    'Objetivo: varrer as portas da loja do laboratório a partir da bancada, ficar no meio do caminho da biblioteca com ARP falso e ler a senha dela no farejador, e depois fixar o ARP do gateway na biblioteca.',
  ],
  manual: {
    titulo: 'Segurança: o que proteger e como se ataca',
    texto: [
      'Segurança de rede começa com uma lista curta do que se quer garantir. Confidencialidade: só quem deve lê. Integridade: ninguém altera no caminho sem ser percebido. Disponibilidade: o serviço responde quando alguém precisa. Autenticação: quem fala é quem diz ser. Não repúdio: quem mandou não consegue negar depois. Quase todo ataque quebra um desses, e quase toda defesa protege um ou dois. Junto vêm os princípios de projeto: menor privilégio (cada um com o mínimo de acesso que precisa), padrão seguro (o que ninguém configurou fica fechado), mediação completa (todo acesso conferido, toda vez, não só no primeiro), economia de mecanismo (quanto mais simples, menos lugar para erro) e projeto aberto (a segurança não pode depender de ninguém saber como o sistema funciona, só da chave).',
      'Um ataque costuma ter três fases. Reconhecimento: descobrir o que existe, que máquinas, que portas, que versões. Exploração: usar uma falha para entrar ou para atrapalhar. Persistência: ficar lá dentro, com uma porta dos fundos, para voltar quando quiser. A defesa pensa ao contrário, das ameaças às soluções: para cada ameaça, que princípio ela fere e que mecanismo segura. A varredura de portas é o reconhecimento clássico: mandar um SYN para cada porta e ver o que volta. SYN+ACK quer dizer aberta (alguém escuta; a bancada responde RST e a conexão nunca se completa, por isso o nome meio aberta). RST quer dizer fechada (a máquina existe, mas ninguém escuta ali). Silêncio quer dizer filtrada (um firewall jogou fora, ou a máquina nem existe). No UDP não há aperto de mão: manda-se um datagrama vazio, e só a mensagem ICMP de porta inalcançável diz que está fechada.',
      'Farejar (sniffing) é ler o tráfego dos outros com a placa em modo promíscuo, aceitando todo quadro que chegar. Num hub, tudo chega a todos. Num switch, cada porta recebe só o que é dela, mais os broadcasts, a não ser que alguém configure uma porta espelhada (o switch manda cópia de tudo para lá, que é para o IDS e por isso fica trancada) ou que o atacante desvie o tráfego para si. O desvio mais simples é o ARP falso: o ARP não tem autenticação, então a bancada manda respostas ARP dizendo que o IP do gateway está no MAC dela. A vítima acredita, troca o cache e passa a entregar tudo à bancada, que copia e repassa ao gateway verdadeiro. A vítima não percebe nada: é o homem no meio. Bisbilhotar assim (snooping) só funciona contra o que vai em claro; contra TLS, o homem no meio vê, mas não lê.',
      'Falsificar (spoofing) vai além do ARP. O IP não confere a origem: qualquer um monta um pacote com o endereço de outra pessoa, e a resposta vai para essa outra pessoa, nunca para quem mandou. Por isso o IP falso serve para esconder quem ataca, não para conversar. No roteamento entre redes, quem anuncia por BGP um prefixo que não é seu, ou um pedaço mais específico dele, puxa o tráfego daquele endereço para si (sequestro de BGP). No DNS, uma resposta forjada que acerta o identificador da consulta fica no cache do resolvedor, e a cidade inteira passa a ir ao endereço errado (DNS envenenado).',
      'O último ingrediente é a interrupção, que ataca a disponibilidade. Na inundação de SYN, o atacante manda muitos SYN e nunca o ACK final: cada um vira uma conexão meio aberta que o servidor guarda por 63 s na fila, e a fila da loja tem 128 lugares. Com 1000 SYN por segundo, enche num piscar, e cliente de verdade não entra. A defesa são os SYN cookies: o servidor responde o SYN sem guardar nada, com o estado escondido no número de sequência, e só cria a conexão quando o ACK volta. Na negação de serviço distribuída (DDoS), milhares de máquinas zumbis, computadores de terceiros infectados sem que ninguém saiba, atacam ao mesmo tempo: aí não é só a fila, é o cano que enche. Com amplificação, o atacante manda pedidos pequenos com a origem falsificada para servidores que respondem muito mais, e a resposta grande cai na vítima. Contra volume, só o provedor, longe do servidor.',
    ],
  },
  dicas: [
    'Tudo de ataque sai da bancada. A varredura vai até 203.0.113.10; o ARP falso tem a biblioteca (192.168.1.11) como vítima e o gateway (192.168.1.1) como disfarce.',
    'O farejador só mostra o que passou depois do desvio: primeiro o ARP falso, depois a biblioteca abre a página com a senha, e só então farejar.',
    'A defesa fica na vítima: na biblioteca, fixe o ARP de 192.168.1.1. Uma entrada estática não muda com resposta ARP nenhuma.',
  ],
  perguntas: d120,
  montar: () => laboratorio(7120),
  objetivo: (m) => {
    const v = varredura(m);
    const seg = segredosFarejados(m);
    return [
      item('varredura TCP da bancada até a loja (203.0.113.10)', !!v, v ? `abertas: ${v.abertas.join(', ') || 'nenhuma'}` : 'ainda não'),
      item(`homem no meio: o farejador da bancada leu a senha que a biblioteca mandou em claro`, seg.includes(`senha=${SENHA}`), seg.length ? seg.join(' | ') : 'nenhum segredo farejado'),
      item('biblioteca com o ARP do gateway fixo (entrada estática)', arpFixo(m, 'biblioteca', GATEWAY), arpFixo(m, 'biblioteca', GATEWAY) ? '192.168.1.1 estático' : 'cache ARP aberto a qualquer resposta'),
      ...todasRespondidas(m, d120),
    ];
  },
  posMorte: [
    'O ensaio refez o roteiro de quem anda rondando a cidade. A varredura foi o reconhecimento: 1024 SYN, duas respostas SYN+ACK (53, o DNS, e 80, a web) e 1022 RST. Do lado de fora, isso é um mapa de por onde tentar entrar; do lado de dentro, é a lista do que precisa estar aberto e do que sobrou aberto por descuido.',
    'O ARP falso foi a exploração, e não precisou de falha nenhuma em programa: bastou o ARP acreditar em quem responde. A bancada disse à biblioteca que era o gateway e disse ao gateway que era a biblioteca, ficou no meio e repassou tudo. A página de login ia em HTTP, então a senha passou em claro diante do farejador, e a confidencialidade acabou ali. Com a entrada estática, a biblioteca deixa de acreditar em resposta ARP para o gateway. É trabalhoso manter em toda máquina, por isso a defesa de verdade junta várias camadas: inspeção de ARP no switch, e cifrar tudo que importa, porque o homem no meio que só vê bytes cifrados não leva nada.',
    'Faltou a persistência, de propósito: no laboratório não se instala porta dos fundos em ninguém. Mas é ela que o centro de operações vai caçar nas próximas noites, porque um atacante que entrou quer voltar sem precisar repetir o trabalho.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'bancada'],
      acao: 'sg-varrer',
      valores: { ip: LOJA, portas: '1-1024' },
      instrucao: 'Na bancada, varra as portas TCP de 1 a 1024 da loja (203.0.113.10).',
      porque: 'Reconhecimento: antes de atacar, quem ataca descobre o que escuta. Cada porta recebe um SYN, e a resposta diz o estado.',
      conferir: (m) => (varredura(m) ? true : 'A varredura TCP da bancada até 203.0.113.10 ainda não foi feita.'),
      feito: 'SYN+ACK em 53 e 80: abertas. RST em todas as outras: fechadas, a máquina existe mas ninguém escuta. Nenhuma filtrada, porque não há firewall no caminho. Ainda.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '2' },
      instrucao: 'Quantas portas TCP a varredura achou abertas na loja?',
      porque: 'Cada porta aberta é um serviço que alguém pode tentar explorar. Contar é o primeiro passo para fechar o que sobra.',
      feito: 'Duas: o DNS na 53 e a web na 80. É o mínimo para a loja funcionar, o que já é um bom sinal de padrão seguro.',
    }),
    passo({
      alvo: ['equip', 'bancada'],
      acao: 'sg-arp-falso',
      valores: { vitima: BIBLIOTECA, fingido: GATEWAY, modo: 'repassar' },
      instrucao: 'Ainda na bancada, envenene o ARP da biblioteca fingindo ser o gateway, repassando o tráfego.',
      porque: 'Num switch, a bancada não vê o tráfego da biblioteca. Mas se a biblioteca achar que o gateway mora no MAC da bancada, ela mesma entrega tudo.',
      conferir: (m) => {
        const a = m.flags.ataque as { tipo: string; ok?: boolean; vitima?: string } | undefined;
        if (a?.tipo === 'arp' && a.ok && a.vitima === 'biblioteca') return true;
        return 'O ARP falso ainda não pegou na biblioteca. A vítima é 192.168.1.11 e o disfarce, 192.168.1.1.';
      },
      feito: 'Dois ARP gratuitos e falsos: para a biblioteca, "o gateway está na bancada"; para a borda, "a biblioteca está na bancada". Ninguém confere, e os dois caches mudam.',
    }),
    passo({
      alvo: ['equip', 'biblioteca'],
      acao: 'ap-navegar',
      valores: { url: URL_SENHA },
      instrucao: 'Agora faça o papel da vítima: na biblioteca, abra a página de login da loja (em HTTP, com a senha no endereço).',
      porque: 'O homem no meio só ganha alguma coisa quando a vítima usa a rede. E o login em HTTP leva a senha em claro.',
      conferir: (m) => {
        const h = m.flags.http as { de?: string; ok?: boolean } | undefined;
        return h?.de === 'biblioteca' && h.ok ? true : 'A página ainda não abriu na biblioteca.';
      },
      feito: 'A página abriu normalmente, e a saída mostra o desvio: cada quadro foi para o MAC da bancada, que copiou e repassou. Da biblioteca, nada parece errado.',
    }),
    passo({
      alvo: ['equip', 'bancada'],
      acao: 'sg-farejar',
      instrucao: 'Na bancada, fareje a rede.',
      porque: 'A placa em modo promíscuo mostra tudo que chegou nela. Depois do ARP falso, isso inclui o tráfego da biblioteca.',
      conferir: (m) => (segredosFarejados(m).includes(`senha=${SENHA}`) ? true : 'O farejador não viu a senha. Confira se o ARP falso pegou antes de a biblioteca navegar.'),
      feito: `O pedido inteiro aparece, e o farejador grifa a senha: senha=${SENHA}. Num switch, sem hub e sem espelho, quem desvia o tráfego lê como se estivesse no fio.`,
    }),
    passo({
      escolha: {
        opcoes: ['Confidencialidade', 'Disponibilidade', 'Integridade', 'Não repúdio'],
        certa: 0,
        errada: {
          1: 'A biblioteca continuou navegando normalmente: a bancada repassou tudo. A disponibilidade cairia se ela descartasse em vez de repassar.',
          2: 'A bancada só copiou, não mudou nada no caminho. Estando no meio, poderia mudar, mas desta vez a página chegou intacta.',
          3: 'Não repúdio é quem mandou não poder negar depois. Aqui o problema é outro: alguém leu o que não devia.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que princípio de segurança a bancada quebrou ao ler a senha?',
      porque: 'Dar nome ao que foi quebrado ajuda a escolher a defesa: cada princípio pede mecanismos diferentes.',
      feito: 'Confidencialidade: alguém que não devia leu. A defesa que protege esse princípio é cifrar (HTTPS); a de hoje, fixar o ARP, tira a bancada do meio.',
    }),
    passo({
      alvo: ['equip', 'biblioteca'],
      acao: 'sg-arp-estatico',
      valores: { ip: GATEWAY },
      instrucao: 'Na biblioteca, fixe o ARP do gateway (192.168.1.1) com o MAC verdadeiro.',
      porque: 'O ARP acredita na última resposta que ouvir. Uma entrada estática não muda com resposta nenhuma.',
      conferir: (m) => (arpFixo(m, 'biblioteca', GATEWAY) ? true : 'A entrada estática para 192.168.1.1 ainda não está na biblioteca.'),
      feito: 'O cache da biblioteca volta a apontar para a borda, e uma nova resposta falsa será ignorada. O preço é manter isso à mão; em rede grande, quem faz esse papel é a inspeção de ARP no switch.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O que se protege',
        texto: ['Cinco garantias. Quase todo ataque quebra uma delas, e cada defesa protege uma ou duas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Princípio', 'Garante que', 'Quebrado quando'],
          linhas: [
            ['confidencialidade', 'só quem deve lê', 'alguém fareja a senha em claro'],
            ['integridade', 'ninguém altera sem ser notado', 'o homem no meio troca a página'],
            ['disponibilidade', 'o serviço responde', 'a inundação enche a fila'],
            ['autenticação', 'quem fala é quem diz ser', 'o ARP acredita em qualquer um'],
            ['não repúdio', 'quem mandou não nega', 'mensagem sem assinatura'],
          ],
        },
      },
      {
        titulo: 'Princípios de projeto',
        texto: ['Antes de qualquer mecanismo, um jeito de pensar: começar fechado, dar o mínimo, conferir sempre, manter simples e não contar com segredo de projeto.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Princípio', 'Na prática'],
          linhas: [
            ['menor privilégio', 'o terminal da biblioteca não administra nada'],
            ['padrão seguro', 'o que ninguém liberou fica fechado'],
            ['mediação completa', 'todo acesso é conferido, toda vez'],
            ['economia de mecanismo', 'regra simples tem menos lugar para erro'],
            ['projeto aberto', 'o segredo é a chave, não o funcionamento'],
          ],
        },
      },
      {
        titulo: 'Reconhecimento: o que a porta responde',
        texto: ['O ataque começa descobrindo, segue explorando e termina tentando ficar. A varredura é o primeiro passo: o tipo de resposta diz o estado da porta.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Estado', 'TCP (manda SYN)', 'UDP (manda datagrama vazio)'],
          linhas: [
            ['aberta', 'volta SYN+ACK', 'volta resposta, ou nada'],
            ['fechada', 'volta RST', 'volta ICMP porta inalcançável'],
            ['filtrada', 'nada volta', 'nada volta (e não dá para separar de aberta)'],
          ],
        },
      },
      {
        titulo: 'Homem no meio pelo ARP',
        texto: ['O ARP não tem autenticação. A bancada diz para cada lado que é o outro e fica no meio, copiando e repassando. Falsificar também funciona com o IP de origem, com anúncios de BGP e com respostas de DNS.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'bib', rotulo: 'biblioteca', x: 90, y: 60 },
            { id: 'gw', rotulo: 'gateway (borda)', x: 510, y: 60 },
            { id: 'atk', rotulo: 'bancada', x: 300, y: 190 },
          ],
          ligacoes: [
            ['bib', 'atk', '"o gateway sou eu"'],
            ['atk', 'gw', '"a biblioteca sou eu"'],
            ['bib', 'gw', 'caminho de antes'],
          ],
        },
      },
      {
        titulo: 'Interrupção e as defesas',
        texto: ['Quando o ataque é contra a disponibilidade, a pergunta é o que enche primeiro: a fila do servidor ou o cano até ele.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Ataque', 'O que enche', 'Defesa'],
          linhas: [
            ['inundação de SYN', 'fila de 128 meio abertas', 'SYN cookies no servidor'],
            ['DDoS com zumbis', 'o enlace inteiro', 'filtragem no provedor'],
            ['amplificação', 'o enlace da vítima, com respostas grandes', 'filtro antifalsificação na origem'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Uma varredura manda SYN para a porta 22 de um servidor e não recebe nada de volta, nem SYN+ACK, nem RST. O que dá para concluir?',
      opcoes: [
        'A porta está filtrada: algo no caminho descartou, ou a máquina não existe',
        'A porta está aberta, esperando o ACK',
        'A porta está fechada, porque ninguém respondeu',
        'O servidor caiu por causa da varredura',
      ],
      certa: 0,
      explicacao: 'Porta fechada responde RST: a máquina existe e avisa que ninguém escuta ali. Porta aberta responde SYN+ACK. Silêncio é o sinal de que um firewall jogou o SYN fora (ou de que não há ninguém naquele endereço). É por isso que a política padrão negar de um firewall transforma as portas fechadas em filtradas.',
    },
  },
  desafio: {
    carta: [
      'Duas da manhã. A loja do laboratório parou de aceitar cliente: o painel mostra a fila de conexões cheia de SYN_RCVD, de origens que mudam a cada pacote. Ninguém completa o aperto de mão.',
      'É uma inundação de SYN com origem falsificada. Bloquear endereço não adianta, porque cada pacote diz vir de um lugar diferente.',
      'Objetivo: ligar a defesa no próprio servidor, provar com uma inundação de ensaio a partir da bancada que a fila não enche mais e responder quantas conexões meio abertas cabem na fila da loja.',
    ],
    dicas: [
      'A defesa contra a inundação de SYN mora no servidor atacado, não no roteador: SYN cookies na loja.',
      'Depois de ligar, repita a inundação de SYN da bancada contra 203.0.113.10, porta 80. A saída mostra a fila.',
      'O tamanho da fila aparece na própria saída da inundação: "Fila: 0 de ...".',
    ],
    perguntas: d120D,
    montar: () => {
      const m = laboratorio(8120);
      const loja = equip(m, 'loja');
      loja.s.inundacaoSyn = { ativa: true, taxa: 1000, meiasAbertas: 128, backlog: 128, origem: 'várias (falsificadas)', falsificada: true } satisfies InundacaoSyn;
      return m;
    },
    objetivo: (m) => {
      const cookies = !!equip(m, 'loja').s.synCookies;
      const a = m.flags.ataque as AtaqueSyn | undefined;
      const ensaio = !!a && a.tipo === 'syn' && a.de === 'bancada' && a.servidor === 'loja' && !!a.synCookies && a.cheia === false;
      return [
        item('SYN cookies ligados na loja', cookies, cookies ? 'ligados' : 'desligados'),
        item('inundação de ensaio da bancada contra a loja, com a fila sem encher', ensaio, a?.tipo === 'syn' ? (a.cheia ? 'a fila encheu' : a.synCookies ? 'fila vazia' : 'sem SYN cookies') : 'nenhuma inundação de ensaio'),
        ...todasRespondidas(m, d120D),
      ];
    },
    solucao: [
      ['equip', 'loja', 'sg-syncookies', { v: 'on' }],
      ['equip', 'bancada', 'sg-inundar', { ip: LOJA, porta: '80', taxa: '1000', falso: '' }],
    ],
    respostas: { '1': '128' },
  },
};

/* ======================================================================
 * ref 121: Firewall (8.3)
 * ====================================================================== */

function firewall(m: Mundo): ConfigFirewall | undefined {
  return firewallDe(equip(m, 'borda'));
}

function alertasVarredura(m: Mundo): number {
  return (idsDe(equip(m, 'borda'))?.alertas ?? []).filter((a) => a.nome === 'varredura de portas').length;
}

/** Julga um pacote numa cópia do firewall da borda, sem mexer no de verdade. */
function julgar(m: Mundo, pacotes: [InfoPacote, string][]): string[] {
  const fw = firewall(m);
  if (!fw) return pacotes.map(() => 'permitir');
  const copia = structuredClone(fw);
  return pacotes.map(([p, em]) => avaliarFirewall(copia, p, em).acao);
}

const tcp = (de: string, para: string, pd: number, po: number, flags: string): InfoPacote => ({ origem: ip(de), destino: ip(para), protocolo: 6, portaOrigem: po, portaDestino: pd, flags });

const dia121: Dia = {
  numero: 121,
  ato: 7,
  titulo: 'Firewall',
  chamado: [
    'CHAMADO #0121',
    'A borda do laboratório deixa passar tudo, nos dois sentidos. Ontem a varredura de ensaio mapeou a loja sem que ninguém percebesse, e no mundo real seria igual: ninguém está olhando.',
    'Hoje a borda ganha um porteiro e um vigia: um firewall que só deixa passar o que foi pensado, e um sistema de detecção de intrusão que avisa quando alguém sonda a rede.',
    'Objetivo: na borda, uma regra liberando a saída da rede de dentro, política padrão negar e filtro com estado (a resposta precisa voltar); depois o IDS ligado e uma varredura da bancada gerando alerta.',
  ],
  manual: {
    titulo: 'Firewall e detecção de intrusão',
    texto: [
      'Um firewall fica na passagem entre duas redes e decide, pacote a pacote, o que atravessa. O mais simples é o filtro de pacotes sem estado: uma lista de regras que olham o cabeçalho (protocolo, endereço de origem e de destino, porta, interface por onde o pacote entrou) e mandam permitir ou negar. As regras valem em ordem, e a primeira que casa decide; por isso uma regra larga no topo engole as específicas de baixo. O que nenhuma regra casou cai na política padrão. Padrão permitir é uma lista de proibições, sempre atrasada; padrão negar é o princípio do padrão seguro: só passa o que alguém pensou e escreveu.',
      'O problema do filtro sem estado aparece logo. Uma regra libera a saída da rede de dentro, a secretaria manda o SYN para a loja, ele passa. A loja responde SYN+ACK, de fora para dentro, e esse pacote não casa regra nenhuma: a política padrão nega, e a página não abre. Para consertar sem estado, seria preciso uma regra para a volta, e essa regra (tudo de fora com porta de origem 80, por exemplo) deixa entrar qualquer um que escolha a porta 80 como origem. O firewall com estado guarda uma tabela de conexões: cada conversa que ele deixou começar fica anotada, e o que pertence a ela passa na volta. Quem vem de fora sem ninguém ter chamado continua barrado.',
      'Há firewalls que olham mais fundo. O gateway de aplicação (um proxy) entende o protocolo, termina a conexão de um lado e abre outra do outro, e pode barrar um comando HTTP ou um anexo de correio. A arquitetura também ajuda: os servidores que precisam ser vistos de fora (o portal, o correio) ficam numa DMZ, uma rede separada, com regras próprias, para que um servidor invadido não seja a porta da rede interna. E toda borda deveria ter o filtro antifalsificação: pacote que chega de dentro com origem que não é de dentro, ou de fora com origem de dentro, é falsificado e vai para o lixo.',
      'O firewall decide pelo cabeçalho, mas muito ataque usa portas liberadas. Aí entra o IDS, sistema de detecção de intrusão. O IDS por assinatura procura padrões conhecidos: muitas portas diferentes da mesma origem (varredura), muitos SYN por segundo (inundação), um texto suspeito no conteúdo em claro. O IDS da borda alerta a partir de 10 portas diferentes, 200 SYN por segundo ou 5000 pacotes por segundo. O IDS por anomalia aprende o normal e reclama do que foge dele, pegando ataque novo e gerando mais alarme falso.',
      'Todo limiar é uma troca. Baixo demais, o falso positivo: a impressora que acorda e procura todo mundo vira ataque, e de tanto alarme falso ninguém lê mais os alertas. Alto demais, o falso negativo: a varredura lenta, uma porta por minuto, passa sem ser vista. O IDS só observa e avisa; o IPS, sistema de prevenção, fica no caminho e bloqueia a origem do alerta. Bloquear é mais forte e mais perigoso: um falso positivo no IPS derruba gente honesta. E nenhum dos dois lê o que vai cifrado: contra conteúdo, a assinatura só enxerga HTTP, não HTTPS.',
    ],
  },
  dicas: [
    'As ações de firewall e IDS estão na borda. A regra de saída vale para a origem 192.168.1.0/24, qualquer protocolo.',
    'Com a política negar e sem estado, a página da secretaria não abre: o SYN sai, mas o SYN+ACK que volta não casa regra nenhuma. O registro do firewall mostra isso linha a linha.',
    'Com o filtro com estado e o IDS ligados, varra a loja a partir da bancada (o limiar é de 10 portas) e veja os alertas na borda.',
  ],
  montar: () => laboratorio(7121),
  objetivo: (m) => {
    const fw = firewall(m);
    const saida = !!fw?.regras.some((r) => r.acao === 'permitir' && r.origem === '192.168.1.0/24');
    const v = varredura(m);
    const n = alertasVarredura(m);
    return [
      item('regra na borda permitindo o que sai da rede de dentro (192.168.1.0/24)', saida, fw ? `${fw.regras.length} regra(s)` : 'sem firewall'),
      item('borda com política padrão negar e filtro com estado', !!fw && fw.padrao === 'negar' && fw.comEstado, fw ? `padrão ${fw.padrao}, estado ${fw.comEstado ? 'ligado' : 'desligado'}` : 'sem firewall'),
      item('varredura da bancada atravessando o firewall: a resposta da porta 80 voltou', !!v && v.abertas.includes(80), v ? `abertas: ${v.abertas.join(', ') || 'nenhuma'}, filtradas: ${v.filtradas}` : 'nenhuma varredura'),
      item('IDS da borda com alerta de varredura de portas', n > 0, `${n} alerta(s) de varredura`),
    ];
  },
  posMorte: [
    'A primeira tentativa falhou do jeito mais instrutivo. A regra liberava a saída, o SYN da secretaria passou, e o SYN+ACK da loja, que vinha de fora para dentro, não casou regra nenhuma e morreu na política padrão. O registro contou a história em duas linhas: PASSOU na ida, NEGADO na volta. Um filtro sem estado julga cada pacote sozinho e não sabe que aquela resposta foi pedida.',
    'Com o filtro com estado, a borda passou a anotar cada conversa que deixou começar, e a volta delas passa pela tabela antes de chegar às regras. É por isso que a varredura da bancada viu de novo a 53 e a 80 abertas: saiu pela regra e voltou pelo estado. E é por isso também que quem está do lado de fora, sem ninguém ter chamado, encontra só silêncio.',
    'O IDS alertou na décima porta diferente, como manda o limiar, e deixou o resto passar, porque IDS só avisa. Alguém precisa ler os alertas, e o limiar precisa de cuidado: mais baixo, a rede vira um alarme que ninguém escuta; mais alto, a varredura lenta passa despercebida. Trocar para IPS bloquearia a bancada no primeiro alerta, o que é ótimo contra quem ataca e péssimo se o alerta for falso.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-fw-regra',
      valores: { acao: 'permitir', proto: 'qualquer', para: 'qualquer', porta: '', estado: '', em: '' },
      pedir: ['de'],
      exemplo: { de: '192.168.1.0/24' },
      instrucao: 'Na borda, acrescente uma regra que permite tudo que vem da rede de dentro.',
      porque: 'Antes de fechar a porta, é preciso dizer quem pode sair. A origem é o prefixo da rede interna.',
      conferir: (m) => {
        const fw = firewall(m);
        if (fw?.regras.some((r) => r.acao === 'permitir' && r.origem === '192.168.1.0/24')) return true;
        if (fw?.regras.some((r) => !r.origem || r.origem === 'qualquer')) return 'Uma regra com origem "qualquer" permite tudo, inclusive quem vem de fora: não serve de porteiro. Apague-a e use a rede de dentro.';
        return 'A regra precisa ter como origem a rede de dentro, 192.168.1.0/24.';
      },
      feito: 'Regra 1: PERMITIR qualquer de 192.168.1.0/24. Por enquanto não muda nada, porque a política padrão ainda é permitir.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-fw-padrao',
      valores: { v: 'negar' },
      instrucao: 'Mude a política padrão da borda para negar.',
      porque: 'Padrão seguro: o que nenhuma regra pensou não passa. É a política que transforma uma lista de proibições num porteiro.',
      conferir: (m) => (firewall(m)?.padrao === 'negar' ? true : 'A política padrão da borda ainda não é negar.'),
      feito: 'Agora só passa o que a regra 1 permitir. E a regra 1 só fala de quem vem de dentro.',
    }),
    passo({
      alvo: ['equip', 'secretaria'],
      acao: 'ap-navegar',
      valores: { url: `http://${LOJA}/` },
      instrucao: 'Na secretaria, tente abrir a página da loja pelo endereço (http://203.0.113.10/).',
      porque: 'Um teste antes de confiar. A secretaria é de dentro, a regra deixa sair. Mas uma conversa tem ida e volta.',
      conferir: (m) => {
        const h = m.flags.http as { de?: string; ok?: boolean } | undefined;
        if (h?.de !== 'secretaria') return 'A secretaria ainda não tentou abrir a página.';
        return h.ok ? 'A página abriu: a política padrão ainda não está em negar, ou o filtro com estado já foi ligado.' : true;
      },
      feito: 'Não abriu. O SYN saiu, chegou na loja, e a resposta não voltou: a borda descartou no firewall.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-fw-log',
      instrucao: 'Veja o que o firewall da borda decidiu.',
      porque: 'O registro mostra cada pacote, a regra que casou e a decisão. É o primeiro lugar para olhar quando algo não passa.',
      feito: 'PASSOU o SYN de 192.168.1.10 para a loja, pela regra 1. NEGADO o SYN+ACK de volta, pela política padrão: a resposta vem de fora, e nenhuma regra fala dela.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-fw-estado',
      valores: { v: 'on' },
      instrucao: 'Ligue o filtro com estado na borda.',
      porque: 'Uma regra para a volta abriria demais. O firewall com estado lembra as conversas que deixou começar e só deixa passar a resposta delas.',
      conferir: (m) => (firewall(m)?.comEstado ? true : 'O filtro com estado ainda está desligado.'),
      feito: 'Aparece a linha 0, antes de todas: o que é de conversa já permitida passa pela tabela de estado. Quem chega de fora sem ser chamado continua no padrão negar.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-ids',
      valores: { modo: 'ids' },
      instrucao: 'Ligue o IDS na borda, no modo que só observa e alerta.',
      porque: 'O firewall não percebe a varredura: cada SYN, sozinho, é um pacote permitido. Quem percebe o padrão (muitas portas diferentes da mesma origem) é o IDS.',
      conferir: (m) => (idsDe(equip(m, 'borda'))?.modo === 'ids' ? true : 'O IDS da borda ainda não está no modo IDS.'),
      feito: 'IDS ligado: varredura a partir de 10 portas, inundação a partir de 200 SYN/s, anomalia acima de 5000 pacotes/s, e quatro assinaturas de conteúdo.',
    }),
    passo({
      alvo: ['equip', 'bancada'],
      acao: 'sg-varrer',
      valores: { ip: LOJA, portas: '1-1024' },
      instrucao: 'Da bancada, varra de novo as portas TCP 1 a 1024 da loja.',
      porque: 'Um teste para as duas coisas: a resposta tem que voltar pelo estado, e a sonda tem que acender o IDS.',
      conferir: (m) => {
        const v = varredura(m);
        if (!v) return 'A varredura da bancada até a loja ainda não foi feita.';
        if (!v.abertas.includes(80)) return 'A porta 80 apareceu filtrada: a resposta não voltou. Confira o filtro com estado.';
        return alertasVarredura(m) > 0 ? true : 'A varredura passou sem alerta. Confira se o IDS está ligado na borda.';
      },
      feito: '53 e 80 abertas de novo, porque a resposta voltou pela tabela de estado. E no caminho, o IDS viu: alerta de varredura de portas na décima porta diferente.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-ids-alertas',
      instrucao: 'Leia os alertas do IDS na borda.',
      porque: 'IDS que ninguém lê é enfeite. O alerta diz quem, contra quem, por quê e o que foi feito.',
      feito: 'Alerta 1: 192.168.1.66 tentou 10 portas diferentes de 203.0.113.10. Ação: alerta, porque o IDS só avisa. No modo IPS, a bancada estaria bloqueada.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Regras em ordem',
        texto: ['O firewall lê de cima para baixo e para na primeira regra que casa. O que nenhuma casa, cai na política padrão.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Ordem', 'Regra', 'Efeito'],
          linhas: [
            ['0', 'conversa já permitida (com estado)', 'a volta passa'],
            ['1', 'permitir tcp para o portal, porta 80', 'o mundo vê o portal'],
            ['2', 'permitir de 192.168.1.0/24, entrando pela p1', 'quem é de dentro sai'],
            ['*', 'negar o resto (padrão)', 'o resto encontra silêncio'],
          ],
        },
      },
      {
        titulo: 'Sem estado e com estado',
        texto: ['Sem estado, o SYN+ACK que volta é um estranho. Com estado, ele pertence a uma conversa que a borda viu começar.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'sec', rotulo: 'secretaria', x: 80, y: 120 },
            { id: 'fw', rotulo: 'borda', x: 300, y: 120 },
            { id: 'loja', rotulo: 'loja', x: 520, y: 120 },
            { id: 'tab', rotulo: 'tabela', x: 300, y: 210 },
          ],
          ligacoes: [
            ['sec', 'fw', 'SYN: regra 1'],
            ['fw', 'loja', 'SYN+ACK volta'],
            ['fw', 'tab', 'anota a conversa'],
          ],
        },
      },
      {
        titulo: 'Onde cada servidor mora',
        texto: ['Servidor que o mundo precisa ver fica numa DMZ, separado da rede interna. A borda também joga fora o que chega com origem impossível: o filtro antifalsificação.'],
        visual: { tipo: 'camadas', camadas: ['internet: ninguém é de confiança', 'DMZ: portal e correio, só as portas deles', 'rede interna: só sai, nunca é chamada de fora'], rotulo: 'da borda para dentro' },
      },
      {
        titulo: 'O vigia: IDS e IPS',
        texto: ['O IDS procura padrões e avisa; o IPS fica no caminho e bloqueia. Os dois erram para os dois lados, e o limiar escolhe qual erro se prefere.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Era ataque', 'Não era ataque'],
          linhas: [
            ['alertou', 'acerto', 'falso positivo: alarme à toa (no IPS, gente honesta bloqueada)'],
            ['não alertou', 'falso negativo: ataque passou', 'acerto'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'A borda tem padrão negar e uma regra permitindo a saída da rede de dentro, sem filtro com estado. Por que a página não abre na secretaria?',
      opcoes: [
        'A resposta da loja vem de fora, não casa regra nenhuma e cai na política padrão negar',
        'O SYN da secretaria é barrado pela regra de saída',
        'O IDS bloqueou a secretaria',
        'O firewall não deixa passar HTTP de jeito nenhum',
      ],
      certa: 0,
      explicacao: 'O SYN sai pela regra. O SYN+ACK volta com origem 203.0.113.10 e destino 192.168.1.10: para um filtro sem estado é um pacote como outro qualquer, vindo de fora, e nenhuma regra o permite. O filtro com estado reconhece que ele pertence a uma conversa que a própria borda deixou começar.',
    },
  },
  desafio: {
    carta: [
      'A prefeitura colocou o portal (192.168.1.80) no ar para a cidade toda, e a borda está do jeito que veio de fábrica: sem regra, permitindo tudo. Qualquer máquina de fora chega em qualquer porta de qualquer computador de dentro.',
      'E no registro do provedor apareceram pacotes chegando de fora com origem 192.168.1.10, que é a secretaria. Alguém está forjando endereço de dentro.',
      'Objetivo: de fora, só a porta 80 do portal; de dentro, tudo sai e a resposta volta; pacote vindo de fora com origem de dentro barrado pelo firewall; e o filtro antifalsificação ligado na borda.',
    ],
    dicas: [
      'Duas regras e duas chaves: permitir tcp para 192.168.1.80 porta 80; permitir a rede de dentro; filtro com estado; política negar.',
      'Uma regra "permitir de 192.168.1.0/24" sem interface também casa o pacote forjado que entra pela p2, a interface do provedor. Na regra da rede de dentro, escolha "entrando por p1".',
      'O filtro antifalsificação é uma chave própria, também na borda.',
    ],
    montar: () => laboratorio(8121, { portal: true }),
    objetivo: (m) => {
      const fw = firewall(m);
      const [portal, ssh, ida, volta, forjado] = julgar(m, [
        [tcp('203.0.113.30', PORTAL, 80, 51000, 'SYN'), 'p2'],
        [tcp('203.0.113.30', '192.168.1.10', 22, 51001, 'SYN'), 'p2'],
        [tcp('192.168.1.10', LOJA, 80, 52000, 'SYN'), 'p1'],
        [tcp(LOJA, '192.168.1.10', 52000, 80, 'SYN+ACK'), 'p2'],
        [{ origem: ip('192.168.1.10'), destino: ip('192.168.1.53'), protocolo: 17, portaOrigem: 53000, portaDestino: 53 }, 'p2'],
      ]);
      const anti = !!equip(m, 'borda').s.antiFalsificacao;
      return [
        item('borda com política padrão negar', fw?.padrao === 'negar', fw ? `padrão ${fw.padrao}` : 'sem firewall'),
        item('de fora, o portal responde na porta 80', portal === 'permitir', `SYN de 203.0.113.30 para 192.168.1.80:80: ${portal}`),
        item('de fora, a porta 22 da secretaria não', ssh === 'negar', `SYN de 203.0.113.30 para 192.168.1.10:22: ${ssh}`),
        item('a secretaria sai para a loja e a resposta volta', ida === 'permitir' && volta === 'permitir', `ida ${ida}, volta ${volta}`),
        item('pacote de fora com origem forjada da secretaria barrado pelo firewall', forjado === 'negar', `UDP "de 192.168.1.10" entrando pela p2: ${forjado}`),
        item('filtro antifalsificação ligado na borda', anti, anti ? 'ligado' : 'desligado'),
      ];
    },
    solucao: [
      ['equip', 'borda', 'sg-fw-regra', { acao: 'permitir', proto: 'tcp', de: 'qualquer', para: PORTAL, porta: '80', estado: '', em: '' }],
      ['equip', 'borda', 'sg-fw-regra', { acao: 'permitir', proto: 'qualquer', de: '192.168.1.0/24', para: 'qualquer', porta: '', estado: '', em: 'p1' }],
      ['equip', 'borda', 'sg-fw-estado', { v: 'on' }],
      ['equip', 'borda', 'sg-fw-padrao', { v: 'negar' }],
      ['equip', 'borda', 'sg-antifalsificacao', { v: 'on' }],
    ],
  },
};

/* ======================================================================
 * ref 122: Segredos (8.4 e 8.5)
 * ====================================================================== */

/** Bilhete achado na bancada, cifrado com César de chave 7. */
const BILHETE = 'V HAHJHUAL CVSAH XBHUKV H JPKHKL KVYTPY LUAHV KLPEL H WVYAH KVZ MBUKVZ MLJOHKH L VZ VSOVZ HILYAVZ';
/** Nota antiga da equipe da represa, cifrada com César de chave 11. */
const NOTA = 'L DPYSL OZ CLOTZ OL CPACPDL PDEL LYZELOL YZ NLOPCYZ LKFW OL DLWL OP XLBFTYLD APCEZ OL ULYPWL';

const ACENTOS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');
const normal = (r: string) => r.normalize('NFD').replace(ACENTOS, '').trim().toUpperCase().replace(/\s+/g, ' ');

const d122: Pergunta[] = [
  { id: '1', texto: 'Como fica a palavra NOVE cifrada com César de chave 3?', confere: (r) => normal(r) === 'QRYH' },
  numerica('2', 'Qual é a chave do bilhete cifrado que estava na bancada?', 7, 0),
];

const d122D: Pergunta[] = [
  numerica('1', 'Qual é a chave da nota da represa?', 11, 0),
  { id: '2', texto: 'De que cor é o caderno onde está a senha do rádio?', confere: (r) => normal(r).includes('AZUL') },
];

function quebrou(m: Mundo, chave: number): boolean {
  const c = m.flags.cripto as { op?: string; chave?: number } | undefined;
  return c?.op === 'quebrar-cesar' && c.chave === chave;
}

const dia122: Dia = {
  numero: 122,
  ato: 7,
  titulo: 'Segredos',
  chamado: [
    'CHAMADO #0122',
    'Na limpeza da bancada apareceu um bilhete cifrado, deixado em algum dos ensaios: letras embaralhadas, espaços no lugar. Parece coisa antiga, uma cifra de deslocamento.',
    'Hoje começa a parte da segurança que não depende de onde o cabo passa: transformar a mensagem para que só quem tem a chave leia.',
    'Objetivo: cifrar uma frase com César, responder como fica a palavra NOVE, quebrar o bilhete pela frequência das letras e responder a chave.',
  ],
  manual: {
    titulo: 'Criptografia: da cifra de César ao AES',
    texto: [
      'Cifrar é transformar o texto claro em texto cifrado com um algoritmo e uma chave; decifrar é o caminho de volta, com a chave. O princípio de Kerckhoffs diz que o algoritmo deve ser público e só a chave secreta: algoritmo se descobre (alguém desmonta o aparelho, lê o programa, escuta o bastante), e um algoritmo que muita gente estudou e não quebrou vale mais que um escondido. Quem tenta ler sem a chave faz criptoanálise, e o que tem nas mãos define o jogo: só o texto cifrado (o mais difícil), texto claro conhecido (alguns pares de claro e cifrado, como o cabeçalho que toda mensagem tem) ou texto claro escolhido (consegue cifrar o que quiser e olhar o resultado). Uma boa cifra resiste aos três.',
      'Dois princípios valem para qualquer sistema. Redundância: a mensagem precisa ter estrutura que permita notar que foi forjada, senão um intruso manda lixo aleatório e o receptor executa como se fosse ordem válida. Atualidade: a mensagem precisa provar que é recente, senão alguém grava uma ordem legítima e repete depois (ataque de repetição); por isso entram carimbo de tempo e números usados uma vez só.',
      'As cifras mais antigas são de substituição. Na de César, cada letra anda a mesma quantidade de casas: com chave 3, A vira D e B vira E. São só 25 chaves, e tentar todas leva segundos. A substituição monoalfabética troca cada letra por outra qualquer, com 26! (perto de 4 × 10^26) tabelas possíveis, o que mata a força bruta. Mas cada letra clara vira sempre a mesma letra cifrada, então a frequência sobrevive: em português, A e E são as mais comuns, e a letra que mais aparece no cifrado provavelmente é uma delas. A análise de frequência quebra as duas, desde que haja texto suficiente; uma palavra curta engana a estatística. As cifras de transposição fazem o contrário: mantêm as letras e mudam a ordem. Na transposição por colunas, o texto é escrito em linhas sob uma palavra chave e lido coluna por coluna, na ordem alfabética das letras da chave. A frequência fica igual à do português, o que denuncia a transposição, e quem a quebra procura pares de letras comuns.',
      'Existe uma cifra que não se quebra: a chave única (one-time pad). A chave é uma sequência aleatória do tamanho da mensagem, combinada bit a bit (com XOR) e usada uma vez só. Qualquer texto claro do mesmo tamanho é igualmente provável para quem só tem o cifrado, então não há o que analisar. É perfeita e impraticável: a chave tem o tamanho de tudo que se vai dizer, precisa chegar ao outro lado em segredo e não pode ser reutilizada nunca. A distribuição quântica de chaves ataca justamente a entrega: os bits vão em fótons polarizados, e medir um fóton na base errada o perturba, então quem escuta no meio deixa rastro e a chave é descartada.',
      'Na prática, usam-se algoritmos de chave simétrica, com a mesma chave dos dois lados, cifrando blocos. O DES, padrão por mais de vinte anos, cifrava blocos de 64 bits em 16 rodadas com chave de 56 bits; morreu quando máquinas dedicadas passaram a testar todas as 2^56 chaves em poucos dias. O triplo DES aplica o DES três vezes (cifra, decifra, cifra), com segurança efetiva de 112 bits, e é lento. O AES, que o substituiu depois de um concurso aberto, cifra blocos de 128 bits com chave de 128, 192 ou 256 bits, em 10, 12 ou 14 rodadas de substituição, permutação e mistura com a chave. Falta decidir como cifrar mais de um bloco, o modo. O ECB cifra cada bloco sozinho: bloco claro igual, bloco cifrado igual, e uma imagem cifrada ainda mostra o contorno. O CBC mistura cada bloco claro com o cifrado anterior antes de cifrar, e o primeiro com um vetor de inicialização (IV) aleatório. O modo contador cifra um contador e combina o resultado com o texto, como uma cifra de fluxo: rápido e paralelo, mas se a mesma chave e o mesmo contador forem usados duas vezes, o XOR dos dois cifrados é o XOR dos dois textos claros, e a segurança vai embora junto.',
    ],
  },
  dicas: [
    'As ações de criptografia estão na bancada. Para cifrar, a chave 3 e a frase que já vem no campo.',
    'A saída da cifra mostra o resultado letra a letra: NOVE é a última palavra da frase.',
    'Para quebrar, cole o bilhete inteiro em "Quebrar César pela frequência". A chave mais provável aparece no fim.',
  ],
  perguntas: d122,
  montar: () => laboratorio(7122),
  objetivo: (m) => [
    item('bilhete da bancada quebrado pela frequência das letras', quebrou(m, 7), quebrou(m, 7) ? 'chave 7' : 'ainda não'),
    ...todasRespondidas(m, d122),
  ],
  posMorte: [
    'A cifra de César protege tanto quanto um envelope transparente. A chave 3 levou A ESTRADA FECHA AS NOVE para D HVWUDGD IHFKD DV QRYH, e qualquer um que saiba que é César tenta as 25 chaves possíveis antes de terminar o café. O princípio de Kerckhoffs já condena de saída: o algoritmo é conhecido, e a chave cabe num dedo.',
    'O bilhete caiu sem força bruta, pela frequência: a letra que mais aparecia no cifrado era H, e H menos 7 casas é A, a letra mais comum do português. Para cada uma das 26 chaves, a análise mediu a distância entre a frequência das letras e a do português, e a chave 7 ficou muito à frente das outras. O texto dizia, sem cerimônia, que o atacante volta quando a cidade dormir. É texto suficiente que faz a estatística funcionar: só com NOVE, a mesma análise erraria.',
    'Toda cifra que veio depois tenta apagar esse rastro. A transposição mantém as letras e embaralha a ordem; a chave única apaga tudo, mas pede uma chave do tamanho da mensagem; o AES mistura bloco a bloco em várias rodadas até nada do texto claro sobreviver, e o modo de operação cuida de que dois blocos iguais não virem dois cifrados iguais. A rede de Fim de Linha, daqui em diante, só vai confiar no que estiver cifrado com algoritmo público e chave bem guardada.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['Só a chave', 'Só o algoritmo', 'O algoritmo e a chave', 'O tamanho da mensagem'],
        certa: 0,
        errada: {
          1: 'Algoritmo se descobre: alguém desmonta o aparelho ou lê o programa. Se a segurança dependesse dele, acabaria na primeira descoberta.',
          2: 'Esconder o algoritmo não atrapalha quem ataca por muito tempo e impede que quem defende confira se ele presta. O princípio diz o contrário: algoritmo público.',
          3: 'O tamanho da mensagem até vaza informação, mas não é o que sustenta a cifra.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Pelo princípio de Kerckhoffs, o que precisa ficar em segredo numa cifra?',
      porque: 'Antes de cifrar qualquer coisa, a pergunta é onde mora a segurança.',
      feito: 'Só a chave. O algoritmo pode, e deve, ser público: quanto mais gente tentou quebrá-lo sem sucesso, mais confiança ele merece.',
    }),
    passo({
      alvo: ['equip', 'bancada'],
      acao: 'sg-cesar',
      valores: { t: 'A ESTRADA FECHA AS NOVE' },
      pedir: ['k'],
      exemplo: { k: '3' },
      instrucao: 'Na bancada, cifre a frase A ESTRADA FECHA AS NOVE com César, chave 3.',
      porque: 'Cada letra anda 3 casas: A vira D, B vira E, e depois do Z volta ao A. Os espaços ficam onde estão, o que já ajuda quem ataca.',
      conferir: (m) => {
        const c = m.flags.cripto as { op?: string; chave?: number } | undefined;
        if (c?.op === 'cesar' && c.chave === 3) return true;
        return c?.op === 'cesar' ? `Essa foi a chave ${c.chave}. Use a chave 3.` : 'A frase ainda não foi cifrada.';
      },
      feito: 'D HVWUDGD IHFKD DV QRYH. O A virou D em todo lugar, e a palavra de uma letra só continua sozinha: dois vazamentos de uma vez.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: 'QRYH' },
      instrucao: 'Como fica a palavra NOVE cifrada com a chave 3?',
      porque: 'N anda 3 casas (O, P, Q), O vira R, V vira Y, E vira H.',
      feito: 'QRYH. Repare que a cifra é a mesma conta para qualquer letra: quem descobre uma letra descobre a chave inteira.',
    }),
    passo({
      alvo: ['equip', 'bancada'],
      acao: 'sg-quebrar-cesar',
      valores: { t: BILHETE },
      instrucao: 'Quebre pela frequência o bilhete achado na bancada.',
      porque: 'Sem a chave, só com o cifrado. Cada letra clara vira sempre a mesma cifrada, então a frequência do português continua lá, só deslocada.',
      conferir: (m) => (quebrou(m, 7) ? true : 'O bilhete ainda não foi quebrado. Use o texto inteiro, que já vem no campo.'),
      feito: 'H é a letra mais comum do cifrado, e H menos 7 é A. A chave 7 fica muito à frente das outras na distância até o português, e o texto aparece: O ATACANTE VOLTA QUANDO A CIDADE DORMIR.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '7' },
      instrucao: 'Qual é a chave do bilhete?',
      porque: 'A saída mostra as melhores chaves, da mais provável para a menos.',
      feito: 'Chave 7. Ataque só com o texto cifrado, o mais difícil dos três, e ainda assim foi rápido: César não resiste a nada.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque no ECB blocos claros iguais viram blocos cifrados iguais',
          'Porque o AES só usa chave de 56 bits',
          'Porque o ECB não usa chave',
          'Porque a imagem é grande demais para o AES',
        ],
        certa: 0,
        errada: {
          1: '56 bits era a chave do DES. O AES usa 128, 192 ou 256 bits, e o problema aqui não é a chave, é o modo.',
          2: 'O ECB usa a chave normalmente em cada bloco. O problema é cifrar cada bloco sozinho, sempre do mesmo jeito.',
          3: 'O AES cifra mensagens de qualquer tamanho, bloco de 128 bits por bloco de 128 bits. O modo diz como juntar os blocos.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Uma imagem cifrada com AES em modo ECB ainda mostra o contorno do desenho. Por quê?',
      porque: 'Um bloco cifrado sozinho, com a mesma chave, sai sempre igual. A pergunta é o que acontece quando a mensagem tem muitos blocos parecidos.',
      feito: 'Áreas de mesma cor viram blocos iguais, que viram cifrados iguais: o padrão vaza. O CBC mistura cada bloco com o cifrado anterior, começando por um IV aleatório, e o modo contador cifra um contador que nunca se repete.',
    }),
    passo({
      escolha: {
        opcoes: [
          'O XOR dos dois cifrados dá o XOR dos dois textos claros, e a chave nem precisa ser descoberta',
          'Nada: a chave única é perfeita em qualquer caso',
          'As duas mensagens ficam do dobro do tamanho',
          'O receptor não consegue mais decifrar',
        ],
        certa: 0,
        errada: {
          1: 'É perfeita só se a chave for aleatória, do tamanho da mensagem, secreta e usada uma vez. Reusar quebra a última condição, e a perfeição vai junto.',
          2: 'O tamanho continua o mesmo: a chave única combina bit a bit, sem acrescentar nada.',
          3: 'O receptor decifra normalmente. O problema é que quem escuta também começa a conseguir.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Alguém usou a mesma chave única para cifrar duas mensagens. O que quem interceptou as duas ganha?',
      porque: 'Cifrar com chave única é fazer XOR do texto com a chave. Fazer XOR duas vezes com a mesma coisa desfaz.',
      feito: 'O XOR dos dois cifrados cancela a chave e deixa o XOR dos dois textos claros, que tem toda a redundância da língua. O mesmo vale para o modo contador e qualquer cifra de fluxo: mesma chave e mesmo contador duas vezes é a chave única reusada.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'As peças',
        texto: ['O algoritmo é público; a chave é o único segredo. Quem ataca é classificado pelo que tem nas mãos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Ataque', 'Quem ataca tem', 'Exemplo'],
          linhas: [
            ['só cifrado', 'o texto cifrado', 'o bilhete da bancada'],
            ['claro conhecido', 'pares de claro e cifrado', 'todo e-mail começa igual'],
            ['claro escolhido', 'uma máquina que cifra o que quiser', 'mandar texto para um servidor cifrar'],
          ],
        },
      },
      {
        titulo: 'Substituição e transposição',
        texto: ['A substituição troca as letras e deixa a frequência intacta. A transposição deixa as letras e troca a ordem.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Cifra', 'Chaves possíveis', 'Como cai'],
          linhas: [
            ['César', '25', 'força bruta ou frequência'],
            ['monoalfabética', '26!, perto de 4 × 10^26', 'frequência das letras'],
            ['transposição por colunas', 'as ordens da palavra chave', 'pares de letras comuns'],
            ['chave única', 'tantas quanto os textos possíveis', 'não cai, se usada uma vez'],
          ],
        },
      },
      {
        titulo: 'DES, triplo DES e AES',
        texto: ['Cifras de bloco simétricas: a mesma chave cifra e decifra, em rodadas que misturam, trocam e somam a chave.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Algoritmo', 'Bloco', 'Chave', 'Rodadas'],
          linhas: [
            ['DES', '64 bits', '56 bits (caiu por força bruta)', '16'],
            ['triplo DES', '64 bits', '112 bits efetivos', '3 × 16'],
            ['AES-128', '128 bits', '128 bits', '10'],
            ['AES-192', '128 bits', '192 bits', '12'],
            ['AES-256', '128 bits', '256 bits', '14'],
          ],
        },
      },
      {
        titulo: 'Modos: como juntar os blocos',
        texto: ['O algoritmo cifra um bloco; o modo decide o que fazer com uma mensagem de muitos blocos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Modo', 'Como funciona', 'Cuidado'],
          linhas: [
            ['ECB', 'cada bloco sozinho', 'bloco igual, cifrado igual: vaza o padrão'],
            ['CBC', 'bloco XOR cifrado anterior, começando pelo IV', 'IV previsível ajuda quem ataca'],
            ['contador', 'cifra um contador e faz XOR com o texto', 'nunca repetir chave e contador'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que a análise de frequência quebra a substituição monoalfabética, mesmo com 26! chaves possíveis?',
      opcoes: [
        'Porque cada letra clara vira sempre a mesma letra cifrada, e a frequência do português sobrevive',
        'Porque 26! é um número pequeno para um computador',
        'Porque a substituição muda a ordem das letras',
        'Porque a chave fica escrita no começo da mensagem',
      ],
      certa: 0,
      explicacao: 'Tentar 4 × 10^26 tabelas é inviável, mas não é preciso: se o E do português virou X em todo lugar, o X será a letra mais comum do cifrado. A estatística da língua passa pela cifra e entrega as letras, uma a uma. Quem muda a ordem é a transposição.',
    },
  },
  desafio: {
    carta: [
      'Na sala de máquinas da represa, a equipe antiga deixou uma nota "protegida" na parede. É a mesma cifra de deslocamento do bilhete, com outra chave.',
      'Se a nota fala de senha, a senha precisa ser trocada hoje, antes que alguém com mais tempo leia.',
      'Objetivo: quebrar a nota pela frequência na bancada e responder a chave e a cor do caderno onde está a senha.',
    ],
    dicas: [
      'Use "Quebrar César pela frequência" na bancada com o texto inteiro da nota.',
      `A nota: ${NOTA}`,
      'A letra mais comum da nota é L. Se ela for o A do texto claro, quantas casas L anda até A, para trás?',
    ],
    perguntas: d122D,
    montar: () => laboratorio(8122),
    objetivo: (m) => [item('nota da represa quebrada pela frequência', quebrou(m, 11), quebrou(m, 11) ? 'chave 11' : 'ainda não'), ...todasRespondidas(m, d122D)],
    solucao: [['equip', 'bancada', 'sg-quebrar-cesar', { t: NOTA }]],
    respostas: { '1': '11', '2': 'azul' },
  },
};

export const ATO7A: Dia[] = [dia120, dia121, dia122];
