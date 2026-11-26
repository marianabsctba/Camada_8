// Dias do ato 6 (O Show), com prática guiada, aula e desafio no próprio dia.
// Os três primeiros dias da camada de aplicação, no estádio no dia da final: nomes (7.1.1 a 7.1.4),
// o resolvedor e o cache (7.1.5 a 7.1.8) e o correio eletrônico (7.2).

import { normalizarNome, type TipoRegistro } from '../motor/aplicacao';
import { cacheDoResolvedor, servicosDe } from '../motor/cliAplicacao';
import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { relogio } from '../motor/seguranca';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

const IP_RESOLVEDOR = '192.168.6.53';
const IP_SRV_ESTADIO = '203.0.113.53';
const IP_PLACAR = '203.0.113.80';
const IP_PLACAR_NOVO = '203.0.113.81';
const IP_CORREIO_PREF = '192.168.6.25';
const IP_CORREIO_EST = '203.0.113.25';
const ZONA = 'estadio.fimdelinha.exemplo';
const IMPRENSA = `imprensa@${ZONA}`;
const INGRESSOS = `ingressos@${ZONA}`;
const SECRETARIA = 'secretaria@fimdelinha.exemplo';

interface RegistroCfg {
  nome: string;
  tipo: TipoRegistro;
  valor: string;
  ttl?: number;
  prioridade?: number;
}

interface OpcoesEstadio {
  semente: number;
  /** Zona servida pelo srv-estadio, se já vier configurada. */
  estadio?: RegistroCfg[];
  /** Correio do estádio já ligado, com estas caixas. */
  caixasEstadio?: string[];
  /** Máquinas sem resolvedor configurado. */
  semResolvedor?: string[];
}

/**
 * Rede da cidade (192.168.6.0/24): bilheteria, secretaria, dns-pref (resolvedor recursivo e autoritativo de
 * fimdelinha.exemplo) e correio-pref. O r-estadio liga a cidade à rede do estádio (203.0.113.0/24), com o
 * srv-estadio (DNS do estádio), o placar (site do placar ao vivo), o correio-est e a cabine de imprensa.
 */
function mundoEstadio(o: OpcoesEstadio): Mundo {
  const m = novoMundo(o.semente);
  m.flags.aplicacao = true;
  const host = (nome: string, ip: string, gw: string, modelo: string) => adicionar(m, pc(nome, { ip: cidr(ip), gateway: gw, modelo }));
  host('bilheteria', '192.168.6.10/24', '192.168.6.1', 'Computador da bilheteria da prefeitura');
  host('secretaria', '192.168.6.20/24', '192.168.6.1', 'Computador da secretaria de esportes');
  host('dns-pref', `${IP_RESOLVEDOR}/24`, '192.168.6.1', 'Servidor de nomes da prefeitura');
  host('correio-pref', `${IP_CORREIO_PREF}/24`, '192.168.6.1', 'Servidor de correio da prefeitura');
  host('srv-estadio', `${IP_SRV_ESTADIO}/24`, '203.0.113.1', 'Servidor de nomes do estádio');
  host('placar', `${IP_PLACAR}/24`, '203.0.113.1', 'Servidor do placar ao vivo');
  host('correio-est', `${IP_CORREIO_EST}/24`, '203.0.113.1', 'Servidor de correio do estádio');
  host('cabine', '203.0.113.30/24', '203.0.113.1', 'Computador da cabine de imprensa');
  adicionar(m, roteador('r-estadio', { modelo: 'Roteador entre a cidade e o estádio', interfaces: { cidade: '192.168.6.1/24', estadio: '203.0.113.1/24' } }));
  adicionar(m, comutador('sw-cidade', { portas: 8 }));
  adicionar(m, comutador('sw-estadio', { portas: 8 }));
  ['bilheteria', 'secretaria', 'dns-pref', 'correio-pref'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw-cidade', porta: `p${i + 1}` }, 'cat6', 5));
  ligar(m, { equip: 'sw-cidade', porta: 'p8' }, { equip: 'r-estadio', porta: 'cidade' }, 'cat6', 5);
  ligar(m, { equip: 'r-estadio', porta: 'estadio' }, { equip: 'sw-estadio', porta: 'p8' }, 'cat6', 80);
  ['srv-estadio', 'placar', 'correio-est', 'cabine'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw-estadio', porta: `p${i + 1}` }, 'cat6', 5));
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('dns-pref').servicos = {
    dns: {
      zona: 'fimdelinha.exemplo',
      recursivo: true,
      registros: [
        { nome: 'www', tipo: 'A', valor: '192.168.6.80', ttl: 3600 },
        { nome: '@', tipo: 'MX', valor: 'correio', prioridade: 10, ttl: 3600 },
        { nome: 'correio', tipo: 'A', valor: IP_CORREIO_PREF, ttl: 3600 },
      ],
    },
  };
  s('correio-pref').servicos = { correio: { dominio: 'fimdelinha.exemplo' } };
  if (o.estadio) s('srv-estadio').servicos = { dns: { zona: ZONA, registros: o.estadio.map((r) => ({ ...r })) } };
  if (o.caixasEstadio) s('correio-est').servicos = { correio: { dominio: ZONA, caixas: [...o.caixasEstadio] } };
  for (const n of ['bilheteria', 'secretaria', 'correio-pref', 'cabine', 'correio-est']) if (!o.semResolvedor?.includes(n)) s(n).dns = IP_RESOLVEDOR;
  return m;
}

/** Nome relativo à zona do estádio: "www", "@" para a própria zona. */
function relativo(nome: string): string {
  const n = nome.trim().toLowerCase().replace(/\.$/, '');
  if (n === '@' || n === '' || n === ZONA) return '@';
  return n.endsWith('.' + ZONA) ? n.slice(0, -(ZONA.length + 1)) : n;
}

function dnsEstadio(m: Mundo) {
  return servicosDe(m.equipamentos.get('srv-estadio')!)?.dns;
}

function zonaServida(m: Mundo): boolean {
  const d = dnsEstadio(m);
  return !!d?.zona && normalizarNome(d.zona) === normalizarNome(ZONA);
}

function temRegistro(m: Mundo, nome: string, tipo: TipoRegistro, valor?: string): boolean {
  const d = dnsEstadio(m);
  if (!zonaServida(m)) return false;
  return (d?.registros ?? []).some((r) => relativo(r.nome) === nome && r.tipo === tipo && (valor === undefined || (['CNAME', 'MX', 'NS'].includes(tipo) ? relativo(r.valor) === valor : r.valor.toLowerCase() === valor.toLowerCase())));
}

interface ConsultaDns {
  de: string;
  nome: string;
  tipo: string;
  resolvedor: string | null;
  ok: boolean;
  codigo: string;
  respostas: string[];
  origem: 'rede' | 'cache' | null;
  consultas: number;
}

function consulta(m: Mundo, de: string, nome?: string, tipo?: string): ConsultaDns | undefined {
  const d = m.flags.dns as ConsultaDns | undefined;
  if (!d || d.de !== de) return undefined;
  if (nome && d.nome !== normalizarNome(nome)) return undefined;
  if (tipo && d.tipo !== tipo) return undefined;
  return d;
}

interface EnvioCorreio {
  de: string;
  para: string;
  entregue: boolean;
  motivo?: string;
  mx: string | null;
  received: number;
  tentativas?: { mx: string; resultado: string }[];
}

interface LeituraCorreio {
  endereco: string;
  protocolo: 'imap' | 'pop3';
  mensagens: number;
  ficaNoServidor: boolean;
}

function envio(m: Mundo, para: string): EnvioCorreio | undefined {
  const c = m.flags.correio as EnvioCorreio | undefined;
  return c && c.para.toLowerCase() === para ? c : undefined;
}

function leitura(m: Mundo, endereco: string): LeituraCorreio | undefined {
  const l = m.flags.correioLido as LeituraCorreio | undefined;
  return l && l.endereco.toLowerCase() === endereco ? l : undefined;
}

function contaDe(m: Mundo, equip: string): { endereco: string; servidor: string } | undefined {
  return m.equipamentos.get(equip)!.s.correio as { endereco: string; servidor: string } | undefined;
}

/** Explica por que o último e-mail não chegou, pelo que ficou registrado na tentativa. */
function porqueNaoChegou(c: EnvioCorreio | undefined): string {
  if (!c) return 'O e-mail ainda não foi enviado para esse endereço.';
  if (c.entregue) return 'Chegou.';
  if (c.motivo === 'submissão') return 'Nem saiu: o servidor da conta não aceitou a submissão na porta 587. Confira o IP do servidor na conta.';
  const t = c.tentativas ?? [];
  if (!t.length) return 'O servidor da prefeitura perguntou o MX do domínio do estádio e não achou nenhum. Sem MX, ninguém sabe para onde levar.';
  const r = t[t.length - 1]!.resultado;
  if (r === 'recusado') return 'O servidor do estádio recebeu a conversa e respondeu 550 no RCPT TO: essa caixa não existe lá.';
  if (r === 'sem endereço') return 'O MX existe, mas aponta para um nome que não tem registro A: o servidor sabe o nome do correio do estádio, não o endereço.';
  if (r === 'sem conexão' || r === 'não é correio') return 'O MX aponta para uma máquina que não atende SMTP na porta 25. O serviço de correio do estádio está ligado?';
  return 'Não foi entregue. Releia a saída do envio, linha por linha.';
}

/* ======================================================================
 * 112: Nomes (7.1.1 a 7.1.4)
 * ====================================================================== */

const d112: Pergunta[] = [numerica('1', 'Com o cache vazio, a quantos servidores o resolvedor da prefeitura perguntou até achar www.estadio.fimdelinha.exemplo?', 4, 0)];

function autoritativoDoRadio(r: string): boolean {
  const x = r.trim().toLowerCase().replace(/\.$/, '');
  return ['srv-estadio', IP_SRV_ESTADIO, `ns1.${ZONA}`].includes(x);
}

const d112D: Pergunta[] = [{ id: '1', texto: 'Qual máquina responde com autoridade pelo nome radio.estadio.fimdelinha.exemplo? (nome da máquina ou IP)', confere: (r) => autoritativoDoRadio(r) }];

function resolveuEstadio(m: Mundo, de: string): ConsultaDns | undefined {
  const d = consulta(m, de);
  return d && d.ok && d.nome.endsWith(`${ZONA}.`) && d.respostas.includes(IP_PLACAR) ? d : undefined;
}

const dia112: Dia = {
  numero: 112,
  ato: 6,
  titulo: 'Nomes',
  chamado: [
    'CHAMADO #0112',
    'Faltam três dias para a final, e o estádio tem um servidor de nomes novinho, o srv-estadio, ainda sem zona nenhuma. A bilheteria quer mandar a cidade para o placar ao vivo por um nome que dê para falar no rádio, não por 203.0.113.80.',
    'A prefeitura já cuida de fimdelinha.exemplo; o estádio vai cuidar da própria subzona.',
    'Objetivo: o srv-estadio com autoridade sobre estadio.fimdelinha.exemplo, um registro A para www, um apelido telao apontando para www, a bilheteria resolvendo o nome e a pergunta respondida.',
  ],
  manual: {
    titulo: 'DNS: o catálogo de nomes da rede',
    texto: [
      'Ninguém decora 203.0.113.80. As pessoas guardam nomes; os pacotes só entendem endereços. No começo da rede, a solução era um arquivo, o hosts, com uma linha por máquina (nome e endereço), mantido num lugar central e copiado por todo mundo de tempos em tempos. Com algumas centenas de máquinas, funcionava. Com milhares, o arquivo ficou enorme, desatualizado e com nomes repetidos, e cada cópia sobrecarregava o lugar central. A resposta foi o DNS, o sistema de nomes de domínio: uma base de dados distribuída, em que cada organização cuida dos próprios nomes.',
      'Na prática, é assim: o programa (o navegador, o leitor de correio) chama uma função da biblioteca do sistema, o resolvedor, com o nome. O resolvedor manda uma consulta por UDP na porta 53 a um servidor DNS, que devolve o endereço. O programa nem sabe que houve rede no meio: pediu um nome, recebeu um IP, abre a conexão.',
      'Os nomes formam uma árvore, lida da direita para a esquerda. No topo está a raiz (o ponto final, que quase nunca se escreve). Logo abaixo ficam os domínios de topo: genéricos, como com, org e net, e de país, com duas letras. Cada domínio pode criar subdomínios e entregar a gestão de um pedaço da árvore a outra pessoa: isso é a delegação. O pedaço que um servidor administra é a sua zona, e quem guarda os registros originais de uma zona é o servidor com autoridade (o autoritativo). Aqui, exemplo. é o domínio de topo, a prefeitura tem a zona fimdelinha.exemplo e vai delegar estadio.fimdelinha.exemplo ao estádio: a zona mãe ganha um registro NS dizendo quem responde pela filha, e uma cola (um registro A com o IP desse servidor).',
      'Cada informação do DNS é um registro de recurso com cinco campos: nome, tempo de vida (TTL, em segundos), classe (IN, de internet, quase sempre), tipo e valor. Os tipos mais usados: A (endereço IPv4), AAAA (endereço IPv6), MX (servidor de correio do domínio, com uma prioridade), NS (servidor com autoridade da zona), CNAME (apelido: este nome é outro nome), SOA (o início da zona, com o servidor primário, o responsável e um número de série), TXT (texto livre, muito usado para provar que você controla o domínio), PTR (o caminho inverso, de IP para nome) e SRV (onde fica um serviço, com porta e peso).',
      'A conversa é uma mensagem só, nos dois sentidos: cabeçalho com um identificador de 16 bits e indicadores (é pergunta ou resposta? quer recursão? a resposta é autoritativa?), a seção de pergunta (nome, tipo, classe) e três seções de registros: respostas, autoridade (os NS) e adicionais (as colas). O mesmo formato serve para a pergunta e para a resposta.',
    ],
  },
  dicas: [
    'Comece pelo srv-estadio: "Servir uma zona de DNS" com a zona estadio.fimdelinha.exemplo. Ele não precisa ser recursivo, só autoritativo.',
    'Depois, ainda no srv-estadio, "Acrescentar registro de DNS" duas vezes: www do tipo A com 203.0.113.80, e telao do tipo CNAME com o valor www.',
    'Na bilheteria, "Consultar um nome (dig)". A saída conta cada servidor consultado: raiz, topo, prefeitura e estádio.',
  ],
  perguntas: d112,
  montar: () => mundoEstadio({ semente: 6112 }),
  objetivo: (m) => {
    const d = resolveuEstadio(m, 'bilheteria');
    return [
      item(`srv-estadio com autoridade sobre ${ZONA}`, zonaServida(m), dnsEstadio(m)?.zona ? `zona ${dnsEstadio(m)!.zona}` : 'sem zona'),
      item(`registro www A ${IP_PLACAR} na zona do estádio`, temRegistro(m, 'www', 'A', IP_PLACAR)),
      item('apelido telao CNAME www na zona do estádio', temRegistro(m, 'telao', 'CNAME', 'www')),
      item(`a bilheteria resolveu um nome do estádio para ${IP_PLACAR}`, !!d, d ? `${d.nome} pelo ${d.resolvedor}` : 'nenhuma consulta certa ainda'),
      ...todasRespondidas(m, d112),
    ];
  },
  posMorte: [
    'A cidade ganhou um pedaço próprio da árvore de nomes. Quando o srv-estadio passou a responder por estadio.fimdelinha.exemplo, a zona da prefeitura ganhou a delegação: um NS dizendo que ns1.estadio.fimdelinha.exemplo responde pela subzona, e a cola com 203.0.113.53, para ninguém ficar preso no ovo e na galinha (como achar o IP do servidor de nomes se é ele que diz os IPs?).',
    'A primeira consulta da bilheteria desceu a árvore inteira: a raiz não sabia o nome, mas indicou quem cuida de exemplo.; o topo indicou a prefeitura; a prefeitura indicou o estádio; e o estádio respondeu com autoridade. Quatro servidores, uns 40 ms, quase tudo gasto com a raiz e o topo, que ficam longe. Ninguém no caminho precisou saber tudo, e é por isso que o DNS aguenta bilhões de nomes.',
    'O telao virou um CNAME: um nome que só diz "procure www". Se o placar mudar de máquina, basta trocar o A do www, e o apelido acompanha. Agora dá para anunciar no rádio: telão no telao.estadio.fimdelinha.exemplo.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Um arquivo de texto, o hosts, com nome e endereço de cada máquina, copiado de um lugar central',
          'Cada roteador guardava os nomes das máquinas ligadas a ele',
          'O nome ia escrito dentro do endereço MAC da placa de rede',
          'Um único servidor no mundo respondia a todas as perguntas de nome',
        ],
        certa: 0,
        errada: {
          1: 'Roteadores guardam rotas para redes, não nomes de máquinas. Nome nunca foi assunto da camada de rede.',
          2: 'O MAC é um número de 48 bits gravado na placa; ele não carrega nome nenhum, e só vale no enlace local.',
          3: 'Um servidor único seria um gargalo e um ponto único de falha. Foi justamente para fugir de um lugar central que o DNS virou uma base distribuída.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes de mexer: como as máquinas achavam o endereço de um nome antes do DNS existir?',
      porque: 'Entender o que deu errado na solução antiga explica por que o DNS é uma árvore distribuída, e não uma lista.',
      feito: 'Um arquivo hosts, baixado de tempos em tempos. Com a rede crescendo, ele virou um gargalo: grande demais, desatualizado e com nomes brigando entre si. O DNS espalha o trabalho: cada zona cuida dos seus nomes.',
    }),
    passo({
      alvo: ['equip', 'srv-estadio'],
      acao: 'ap-servico-dns',
      pedir: ['zona'],
      valores: { rec: 'off' },
      exemplo: { zona: ZONA },
      instrucao: 'No srv-estadio, sirva a zona do estádio: um subdomínio de fimdelinha.exemplo.',
      porque: 'Quem serve a zona é o servidor com autoridade sobre ela. A zona mãe (a prefeitura) ganha a delegação sozinha: um NS e a cola.',
      conferir: (m) => {
        if (zonaServida(m)) return true;
        const z = dnsEstadio(m)?.zona;
        if (z) return `A zona ficou ${z}. O estádio é um pedaço de fimdelinha.exemplo: a zona é ${ZONA}.`;
        return 'O srv-estadio ainda não serve zona nenhuma.';
      },
      feito: 'O srv-estadio agora tem autoridade sobre estadio.fimdelinha.exemplo. A zona ganhou sozinha um SOA (servidor primário, responsável e número de série 2026112601) e um NS apontando para ns1.estadio.fimdelinha.exemplo.',
    }),
    passo({
      alvo: ['equip', 'srv-estadio'],
      acao: 'ap-servico-dns-registro',
      pedir: ['nome', 'tipo', 'valor'],
      valores: { ttl: '300' },
      exemplo: { nome: 'www', tipo: 'A', valor: IP_PLACAR },
      instrucao: 'Acrescente o registro que liga o nome www ao IPv4 do placar, 203.0.113.80.',
      porque: 'O tipo A guarda um endereço IPv4. O nome é relativo à zona: www vira www.estadio.fimdelinha.exemplo.',
      conferir: (m) => {
        if (temRegistro(m, 'www', 'A', IP_PLACAR)) return true;
        if (temRegistro(m, 'www', 'AAAA')) return 'AAAA é para endereço IPv6. O placar tem um IPv4.';
        if (temRegistro(m, 'www', 'A')) return 'O registro www A existe, mas com outro endereço. O placar está em 203.0.113.80.';
        return 'Ainda não há registro www do tipo A com 203.0.113.80.';
      },
      feito: 'Registro www.estadio.fimdelinha.exemplo, TTL 300, classe IN, tipo A, valor 203.0.113.80: os cinco campos de todo registro de recurso.',
    }),
    passo({
      alvo: ['equip', 'srv-estadio'],
      acao: 'ap-servico-dns-registro',
      pedir: ['nome', 'tipo', 'valor'],
      valores: { ttl: '300' },
      exemplo: { nome: 'telao', tipo: 'CNAME', valor: 'www' },
      instrucao: 'Crie o apelido telao, que leva ao mesmo lugar que www.',
      porque: 'Um CNAME diz "este nome é, na verdade, aquele outro". Quem pergunta por telao recebe o apelido e o A do nome de verdade.',
      conferir: (m) => {
        if (temRegistro(m, 'telao', 'CNAME', 'www')) return true;
        if (temRegistro(m, 'telao', 'A')) return 'Um A também funcionaria hoje, mas se o placar mudar de IP você precisa lembrar de trocar dois registros. O apelido é do tipo CNAME, com o valor www.';
        if (temRegistro(m, 'telao', 'CNAME')) return 'O apelido existe, mas aponta para outro nome. O valor é www.';
        return 'Ainda não há o registro telao do tipo CNAME.';
      },
      feito: 'telao CNAME www. Um apelido não pode ter outros registros junto (nada de telao A e telao CNAME ao mesmo tempo), e por isso a raiz de uma zona nunca é CNAME: ela precisa do SOA e do NS.',
    }),
    passo({
      alvo: ['equip', 'bilheteria'],
      acao: 'ap-dig',
      valores: { nome: `www.${ZONA}`, tipo: 'A' },
      instrucao: 'Na bilheteria, consulte www.estadio.fimdelinha.exemplo e acompanhe a descida pela árvore.',
      porque: 'A bilheteria pergunta ao resolvedor da prefeitura (192.168.6.53), que vai de servidor em servidor, da raiz até quem tem autoridade.',
      conferir: (m) => {
        const d = consulta(m, 'bilheteria', `www.${ZONA}`);
        if (!d) return 'A consulta ainda não foi feita da bilheteria.';
        if (d.codigo === 'NXDOMAIN') return 'NXDOMAIN: o nome não existe. Confira se o registro www está na zona do estádio.';
        return resolveuEstadio(m, 'bilheteria') ? true : `Resposta ${d.codigo}, sem o endereço do placar.`;
      },
      feito: 'Raiz, depois exemplo., depois fimdelinha.exemplo (que indicou o estádio pela delegação) e, por fim, o srv-estadio, com resposta autoritativa: A 203.0.113.80.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '4' },
      instrucao: 'Responda: a quantos servidores o resolvedor perguntou até achar o nome, com o cache vazio?',
      porque: 'Cada nível da árvore é um servidor diferente. Conte as linhas "resolvedor local pergunta a" na saída do dig.',
      feito: 'Quatro: a raiz, o domínio de topo exemplo., a zona da prefeitura e a zona do estádio. A raiz e o topo ficam longe (20 ms cada) e respondem só "não sei, mas pergunte para aquele ali", uma indicação (referral).',
    }),
    passo({
      alvo: ['equip', 'bilheteria'],
      acao: 'ap-dig',
      valores: { nome: `telao.${ZONA}`, tipo: 'A' },
      instrucao: 'Agora consulte o apelido, telao.estadio.fimdelinha.exemplo, também pedindo o tipo A.',
      porque: 'Pedindo A de um apelido, o servidor devolve o CNAME e já emenda o A do nome verdadeiro, para poupar uma volta.',
      conferir: (m) => (resolveuEstadio(m, 'bilheteria')?.nome === normalizarNome(`telao.${ZONA}`) ? true : 'A consulta do telao ainda não trouxe o endereço do placar.'),
      feito: 'Duas linhas na resposta: telao CNAME www.estadio.fimdelinha.exemplo. e www A 203.0.113.80. E desta vez foi uma consulta só, direto ao estádio: o resolvedor já tinha guardado quem responde pela zona. Amanhã esse cache é o assunto.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Do arquivo à base distribuída',
        texto: ['O arquivo hosts era uma lista única, copiada por todos. O DNS reparte a lista pela árvore: cada zona cuida dos seus nomes, e ninguém precisa saber tudo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Arquivo hosts', 'DNS'],
          linhas: [
            ['Onde mora', 'um arquivo central, copiado', 'servidores de cada zona'],
            ['Quem atualiza', 'um lugar só', 'o dono de cada zona'],
            ['Nomes repetidos', 'briga na lista', 'impossíveis: cada nível é de alguém'],
            ['Crescimento', 'trava com milhares', 'bilhões de nomes'],
          ],
        },
      },
      {
        titulo: 'A árvore de nomes',
        texto: ['Lida da direita para a esquerda: raiz, domínio de topo (genérico ou de país), domínio, subdomínio. Cada seta é uma delegação, um NS na zona mãe com a cola.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'raiz', rotulo: '. (raiz)', x: 280, y: 30 },
            { id: 'com', rotulo: 'com (genérico)', x: 90, y: 110 },
            { id: 'ex', rotulo: 'exemplo (topo)', x: 280, y: 110 },
            { id: 'br', rotulo: 'domínio de país', x: 470, y: 110 },
            { id: 'fim', rotulo: 'fimdelinha (prefeitura)', x: 280, y: 190 },
            { id: 'est', rotulo: 'estadio (srv-estadio)', x: 180, y: 270 },
            { id: 'www', rotulo: 'www', x: 400, y: 270 },
          ],
          ligacoes: [
            ['raiz', 'com'],
            ['raiz', 'ex', 'NS'],
            ['raiz', 'br'],
            ['ex', 'fim', 'NS'],
            ['fim', 'est', 'NS + cola'],
            ['fim', 'www'],
          ],
        },
      },
      {
        titulo: 'Os tipos de registro',
        texto: ['Todo registro tem nome, TTL, classe, tipo e valor. O tipo diz o que o valor significa.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Tipo', 'Guarda', 'Exemplo'],
          linhas: [
            ['A', 'endereço IPv4', 'www A 203.0.113.80'],
            ['AAAA', 'endereço IPv6', 'www AAAA 2001:db8:6::80'],
            ['MX', 'servidor de correio, com prioridade', '@ MX 10 correio'],
            ['NS', 'servidor com autoridade da zona', '@ NS ns1'],
            ['CNAME', 'apelido para outro nome', 'telao CNAME www'],
            ['SOA', 'início da zona: primário, responsável, série', '@ SOA ns1 ti 2026112601'],
            ['TXT', 'texto livre', '@ TXT final-as-16h'],
            ['PTR', 'de endereço para nome', '80.113.0.203.in-addr.arpa PTR www'],
            ['SRV', 'onde fica um serviço, com porta', '_sip._udp SRV 10 5 5060 voz'],
          ],
        },
      },
      {
        titulo: 'Uma mensagem, dois sentidos',
        texto: ['Pergunta e resposta usam o mesmo formato. O identificador de 16 bits casa a resposta com a pergunta; os indicadores dizem se quer recursão e se a resposta é autoritativa.'],
        visual: { tipo: 'camadas', camadas: ['Cabeçalho: id de 16 bits, indicadores (QR, AA, RD, RA), código de resposta', 'Pergunta: nome, tipo, classe', 'Respostas: os registros pedidos', 'Autoridade: os NS da zona', 'Adicionais: as colas (A dos NS)'], rotulo: 'mensagem DNS, por UDP na porta 53' },
      },
    ],
    checagem: {
      pergunta: 'Por que a zona fimdelinha.exemplo precisa da cola (o registro A de ns1.estadio.fimdelinha.exemplo) além do NS?',
      opcoes: [
        'Porque o nome do servidor fica dentro da própria zona que ele serve: sem o IP de antemão, ninguém conseguiria perguntar a ele',
        'Porque o NS só funciona com IPv6',
        'Porque a cola acelera a página do placar',
        'Porque sem a cola o TTL do NS seria zero',
      ],
      certa: 0,
      explicacao: 'Para saber o IP de ns1.estadio.fimdelinha.exemplo, seria preciso perguntar ao servidor de estadio.fimdelinha.exemplo, que é justamente ele. A zona mãe quebra esse círculo entregando o endereço junto com a indicação, na seção de adicionais.',
    },
  },
  desafio: {
    carta: [
      'A rádio comunitária vai transmitir a final pela rede do estádio e quer um nome só para ela: radio.estadio.fimdelinha.exemplo. A transmissão sai por IPv6, em 2001:db8:6::90.',
      'A rádio também pediu que a frequência fique publicada no DNS, num registro de texto com o valor fm-104.9, para os aplicativos de celular acharem sozinhos.',
      'Objetivo: os registros AAAA e TXT do radio na zona do estádio, a cabine de imprensa resolvendo o IPv6 da rádio e a pergunta respondida.',
    ],
    dicas: [
      'A zona do estádio já existe no srv-estadio. Faltam dois registros com o mesmo nome, radio, e tipos diferentes.',
      'Endereço IPv6 vai em AAAA, não em A. Texto livre vai em TXT.',
      'Na cabine, consulte radio.estadio.fimdelinha.exemplo pedindo o tipo AAAA. Quem responde com autoridade aparece na última linha antes do total.',
    ],
    perguntas: d112D,
    montar: () => mundoEstadio({ semente: 7112, estadio: [{ nome: 'www', tipo: 'A', valor: IP_PLACAR, ttl: 300 }, { nome: 'telao', tipo: 'CNAME', valor: 'www', ttl: 300 }] }),
    objetivo: (m) => {
      const d = consulta(m, 'cabine', `radio.${ZONA}`, 'AAAA');
      const ok = !!d && d.ok && d.respostas.includes('2001:db8:6::90');
      return [
        item('registro radio AAAA 2001:db8:6::90 na zona do estádio', temRegistro(m, 'radio', 'AAAA', '2001:db8:6::90')),
        item('registro radio TXT fm-104.9 na zona do estádio', temRegistro(m, 'radio', 'TXT', 'fm-104.9')),
        item('a cabine resolveu o IPv6 da rádio', ok, d ? `${d.codigo}: ${d.respostas.join(', ') || 'nada'}` : 'nenhuma consulta AAAA da cabine ainda'),
        ...todasRespondidas(m, d112D),
      ];
    },
    solucao: [
      ['equip', 'srv-estadio', 'ap-servico-dns-registro', { nome: 'radio', tipo: 'AAAA', valor: '2001:db8:6::90', ttl: '300' }],
      ['equip', 'srv-estadio', 'ap-servico-dns-registro', { nome: 'radio', tipo: 'TXT', valor: 'fm-104.9', ttl: '300' }],
      ['equip', 'cabine', 'ap-dig', { nome: `radio.${ZONA}`, tipo: 'AAAA' }],
    ],
    respostas: { '1': 'srv-estadio' },
  },
};

/* ======================================================================
 * 113: Resolver (7.1.5 a 7.1.8)
 * ====================================================================== */

const PLACAR = `placar.${ZONA}`;

const d113: Pergunta[] = [numerica('1', 'Depois que o TTL do placar venceu, a quantos servidores o resolvedor perguntou para achar o nome de novo?', 1, 0)];

const d113D: Pergunta[] = [numerica('1', 'Na primeira consulta da bilheteria, quantos segundos ainda restavam no cache para o endereço velho do placar?', 600, 1)];

/** O A do placar foi buscado de novo depois de o TTL de 300 s vencer: está vivo no cache com o relógio já passado de 300. */
function refeitoDepoisDoTtl(m: Mundo): boolean {
  const agora = relogio(m);
  if (agora < 300) return false;
  return cacheDoResolvedor(m.equipamentos.get('dns-pref')!).buscar(PLACAR, 'A', agora) !== null;
}

const dia113: Dia = {
  numero: 113,
  ato: 6,
  titulo: 'Resolver',
  chamado: [
    'CHAMADO #0113',
    'A cabine de imprensa foi montada hoje de manhã e não acha nome nenhum: ninguém disse a ela a quem perguntar. Os repórteres vão consultar o placar a cada lance, e a operadora quer saber se isso vai atropelar os servidores de nomes no dia da final.',
    'O placar está na zona do estádio com TTL de 300 segundos.',
    'Objetivo: a cabine usando o resolvedor recursivo da prefeitura, o placar consultado de novo depois de o TTL vencer e a pergunta respondida.',
  ],
  manual: {
    titulo: 'O resolvedor, o cache e quem está olhando',
    texto: [
      'Ontem a bilheteria perguntou um nome e o resolvedor da prefeitura foi atrás da resposta. Há dois jeitos de fazer esse trabalho. Na consulta recursiva, quem pergunta diz "me traga a resposta pronta", e o servidor que recebe se vira. Na consulta iterativa, o servidor responde só o que sabe: "não tenho, mas pergunte para aquele ali". O desenho comum mistura os dois: o computador faz uma consulta recursiva ao resolvedor da rede, e o resolvedor faz consultas iterativas à raiz, ao topo e às zonas, descendo a árvore. A raiz e os domínios de topo não fazem recursão para ninguém: atendem demais para isso.',
      'O que segura o DNS de pé é o cache. Cada resposta vem com um TTL, e o resolvedor guarda o registro por esse tempo. Na segunda consulta do mesmo nome, nenhum servidor é incomodado: a resposta sai da memória, em fração de milissegundo. Ele também guarda as indicações (quem responde por exemplo., por fimdelinha.exemplo), que costumam ter TTL de horas ou dias. Por isso, mesmo quando um A vence, o resolvedor já pula direto para o autoritativo. O TTL é uma troca: longo, menos consultas e mudança lenta; curto, mudança rápida e mais carga. Antes de trocar um servidor de máquina, baixe o TTL com antecedência.',
      'Para ver tudo isso, existem ferramentas de linha de comando. O dig mostra a mensagem inteira (código de resposta, seções, TTL que resta); o nslookup dá uma resposta curta e avisa quando ela não é autoritativa, ou seja, veio de um cache. Respostas comuns: NOERROR (achou), NXDOMAIN (o nome não existe), REFUSED (o servidor não aceita fazer o que você pediu, como recursão) e SERVFAIL (deu errado no caminho).',
      'O DNS clássico anda em claro, por UDP. Qualquer um no caminho (a rede do café, o provedor) lê cada nome que você consulta, e isso diz muito sobre a pessoa. Há três defesas: DNS sobre TLS (porta 853), DNS sobre HTTPS (a consulta vai dentro de uma conexão HTTPS comum, na 443) e a minimização do QNAME, em que o resolvedor só conta a cada servidor o pedaço do nome que ele precisa saber (a raiz ouve só "exemplo.", não o nome inteiro). As duas primeiras protegem o trecho até o resolvedor; o resolvedor continua vendo tudo, então escolher em quem confiar ainda importa.',
      'Por fim, nomes valem dinheiro e confiança, e por isso dão briga. Cybersquatting é registrar o nome de outra organização para vender caro ou se passar por ela. Typosquatting é registrar o erro de digitação provável (estadoi, estadio com zero no lugar do o). E há nomes que parecem iguais e não são: letras de outros alfabetos que, na tela, ficam idênticas às nossas. O DNS responde o que lhe perguntam; quem confere se o nome é o certo é a pessoa, e o navegador ajuda mostrando o nome de verdade.',
    ],
  },
  dicas: [
    'Na cabine, "Escolher o resolvedor de DNS": o recursivo é o da prefeitura, 192.168.6.53. O srv-estadio só responde pela própria zona.',
    'Consulte o placar duas vezes seguidas e compare a linha ";; RESPOSTA": na segunda, ela vem do cache.',
    'O TTL do placar é 300 s. "Deixar o tempo passar" com mais de 300 e consulte de novo: o resolvedor volta à rede, mas pergunta a um servidor só.',
  ],
  perguntas: d113,
  montar: () => mundoEstadio({ semente: 6113, semResolvedor: ['cabine'], estadio: [{ nome: 'www', tipo: 'A', valor: IP_PLACAR, ttl: 300 }, { nome: 'placar', tipo: 'A', valor: IP_PLACAR, ttl: 300 }] }),
  objetivo: (m) => {
    const res = m.equipamentos.get('cabine')!.s.dns as string | undefined;
    return [
      item(`a cabine usa o resolvedor recursivo ${IP_RESOLVEDOR}`, res === IP_RESOLVEDOR, res ? `resolvedor ${res}` : 'sem resolvedor'),
      item('o relógio passou do TTL de 300 s e o resolvedor buscou o placar de novo', refeitoDepoisDoTtl(m), `relógio em ${relogio(m)} s`),
      ...todasRespondidas(m, d113),
    ];
  },
  posMorte: [
    'A cabine não estava quebrada: só não sabia a quem perguntar. Com o resolvedor recursivo configurado, ela faz uma única pergunta e recebe a resposta pronta; o resolvedor da prefeitura faz o trabalho iterativo de descer a árvore. Se tivesse apontado para o srv-estadio, as consultas de dentro da zona do estádio até funcionariam, mas qualquer outro nome levaria REFUSED: autoritativo não é resolvedor.',
    'A primeira consulta ao placar custou quatro servidores e uns 40 ms. A segunda, zero servidores: veio do cache, com o TTL já descontado. Quando o relógio passou dos 300 s, o A venceu, mas a indicação da zona do estádio (TTL de 86400 s) continuava viva, e o resolvedor perguntou direto ao srv-estadio. Na final, centenas de repórteres e torcedores vão perguntar o mesmo nome, e o srv-estadio vai ouvir só uma pergunta a cada 300 s por resolvedor.',
    'Tudo isso andou em claro pela rede: qualquer um no caminho sabe que a cabine olhou o placar. Para a final, o recado à operadora é ligar DNS sobre TLS ou sobre HTTPS até o resolvedor, minimizar o QNAME na saída e ficar de olho em quem registrar estadoi.fimdelinha.exemplo na semana do jogo.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'O resolvedor da prefeitura: recebe uma pergunta recursiva da cabine e faz consultas iterativas à raiz, ao topo e às zonas',
          'A própria cabine: ela pergunta à raiz, depois ao topo, depois ao estádio',
          'A raiz: ela pergunta aos servidores de baixo e devolve a resposta pronta',
          'O srv-estadio: ele conhece todos os nomes da cidade',
        ],
        certa: 0,
        errada: {
          1: 'Daria para fazer, mas aí cada computador da cidade teria o próprio cache, quase vazio. O comum é o computador ter um resolvedor simples e deixar a descida da árvore para o resolvedor da rede.',
          2: 'A raiz atende o mundo inteiro e não faz recursão para ninguém. Ela só indica quem cuida de cada domínio de topo.',
          3: 'O srv-estadio só tem autoridade sobre a zona do estádio. Fora dela, não sabe nada e não vai procurar.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes de configurar: quem desce a árvore de nomes quando a cabine pergunta um nome?',
      porque: 'Recursiva é "me traga pronto"; iterativa é "pergunte para aquele ali". Cada parte do caminho usa uma.',
      feito: 'A cabine faz uma pergunta recursiva ao resolvedor e espera. O resolvedor faz as consultas iterativas e guarda tudo no cache, para servir a cidade inteira.',
    }),
    passo({
      alvo: ['equip', 'cabine'],
      acao: 'ap-resolvedor',
      pedir: ['ip'],
      exemplo: { ip: IP_RESOLVEDOR },
      instrucao: 'Na cabine, escolha o resolvedor que faz recursão para os clientes.',
      porque: 'Sem resolvedor configurado, o computador não tem a quem mandar a consulta. Na maioria das redes ele vem pelo DHCP; aqui a cabine foi montada à mão.',
      conferir: (m) => {
        const r = m.equipamentos.get('cabine')!.s.dns as string | undefined;
        if (r === IP_RESOLVEDOR) return true;
        if (r === IP_SRV_ESTADIO) return 'O srv-estadio é autoritativo, não recursivo: para nomes fora da zona do estádio ele responde REFUSED. Escolha o da prefeitura.';
        return 'A cabine ainda não aponta para o resolvedor recursivo da prefeitura.';
      },
      feito: 'Cabine apontando para 192.168.6.53. As consultas vão por UDP na porta 53, e o dns-pref faz o resto.',
    }),
    passo({
      alvo: ['equip', 'cabine'],
      acao: 'ap-dig',
      valores: { nome: PLACAR, tipo: 'A' },
      instrucao: 'Consulte placar.estadio.fimdelinha.exemplo.',
      porque: 'Com o cache vazio, o resolvedor desce a árvore inteira e guarda cada pedaço com o seu TTL.',
      conferir: (m) => {
        const d = consulta(m, 'cabine', PLACAR, 'A');
        if (!d) return 'A consulta do placar ainda não foi feita da cabine.';
        return d.ok ? true : `Resposta ${d.codigo}. O resolvedor da cabine está certo?`;
      },
      feito: 'Quatro consultas a servidores, uns 40 ms. A resposta tem TTL 300: o resolvedor pode guardar por cinco minutos.',
    }),
    passo({
      alvo: ['equip', 'cabine'],
      acao: 'ap-dig',
      valores: { nome: PLACAR, tipo: 'A' },
      instrucao: 'Consulte o mesmo nome de novo, logo em seguida.',
      porque: 'O resolvedor ainda tem a resposta na memória, dentro do TTL.',
      conferir: (m) => {
        const d = consulta(m, 'cabine', PLACAR, 'A');
        if (!d) return 'A consulta do placar ainda não foi feita da cabine.';
        return d.origem === 'cache' ? true : 'Esta veio da rede. Consulte de novo, sem deixar o tempo passar.';
      },
      feito: 'Do cache: zero servidores consultados, fração de milissegundo. E o TTL que aparece é o que resta, não os 300 originais.',
    }),
    passo({
      alvo: ['equip', 'cabine'],
      acao: 'ap-esperar',
      pedir: ['s'],
      exemplo: { s: '301' },
      instrucao: 'Deixe o relógio andar até o TTL do placar vencer.',
      porque: 'Passado o TTL, o resolvedor não pode mais usar a cópia: o dono do nome pode ter mudado o endereço.',
      conferir: (m) => (relogio(m) > 300 ? true : `O relógio está em ${relogio(m)} s; o TTL do placar é 300 s. Deixe passar mais.`),
      feito: 'O A do placar venceu no cache. Mas as indicações (o NS do estádio, com TTL de 86400 s) continuam valendo.',
    }),
    passo({
      alvo: ['equip', 'cabine'],
      acao: 'ap-dig',
      valores: { nome: PLACAR, tipo: 'A' },
      instrucao: 'Consulte o placar pela terceira vez.',
      porque: 'Sem o A no cache, o resolvedor volta à rede. Veja por onde ele começa desta vez.',
      conferir: (m) => {
        const d = consulta(m, 'cabine', PLACAR, 'A');
        if (!d) return 'A consulta do placar ainda não foi feita da cabine.';
        if (d.origem === 'cache') return 'Ainda veio do cache: o TTL não tinha vencido. Deixe o tempo passar mais.';
        return refeitoDepoisDoTtl(m) ? true : 'A consulta não trouxe o placar de volta ao cache.';
      },
      feito: 'Voltou à rede, mas pulou a raiz e o topo: já sabia que o srv-estadio responde pela zona e perguntou direto a ele.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '1' },
      instrucao: 'Responda: depois do TTL vencer, a quantos servidores o resolvedor perguntou?',
      porque: 'Compare a linha de total desta consulta com a da primeira.',
      feito: 'Um só, o autoritativo. Cada pedaço do caminho tem o próprio TTL, e as indicações duram muito mais que os endereços.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Recursiva e iterativa',
        texto: ['A cabine faz uma pergunta recursiva (me traga pronto). O resolvedor faz perguntas iterativas, e cada servidor responde o que sabe ou indica o próximo.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'cab', rotulo: 'cabine', x: 70, y: 150 },
            { id: 'res', rotulo: 'resolvedor (dns-pref)', x: 250, y: 150 },
            { id: 'raiz', rotulo: 'raiz', x: 470, y: 30 },
            { id: 'topo', rotulo: 'exemplo.', x: 470, y: 110 },
            { id: 'pref', rotulo: 'fimdelinha.exemplo', x: 470, y: 190 },
            { id: 'est', rotulo: 'estadio (autoridade)', x: 470, y: 270 },
          ],
          ligacoes: [
            ['cab', 'res', 'recursiva'],
            ['res', 'raiz', '1: indica exemplo.'],
            ['res', 'topo', '2: indica a prefeitura'],
            ['res', 'pref', '3: indica o estádio'],
            ['res', 'est', '4: A 203.0.113.80'],
          ],
        },
      },
      {
        titulo: 'O cache e o TTL',
        texto: ['Cada registro fica no cache pelo próprio TTL. As indicações duram dias; os endereços, minutos. É assim que um nome popular não derruba ninguém.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Consulta ao placar', 'Relógio', 'Servidores consultados', 'De onde'],
          linhas: [
            ['primeira', '0 s', '4', 'rede, da raiz ao estádio'],
            ['segunda', '0 s', '0', 'cache (TTL restante)'],
            ['terceira', 'depois de 300 s', '1', 'rede, direto ao estádio'],
          ],
        },
      },
      {
        titulo: 'Quem vê as suas consultas',
        texto: ['DNS comum vai em claro. As defesas protegem pedaços diferentes do caminho.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Defesa', 'Como', 'Protege'],
          linhas: [
            ['DNS sobre TLS', 'TLS na porta 853', 'o trecho até o resolvedor'],
            ['DNS sobre HTTPS', 'dentro de HTTPS na 443', 'o trecho até o resolvedor, e parece web comum'],
            ['Minimização do QNAME', 'cada servidor ouve só o pedaço que precisa', 'o nome inteiro, dos servidores de cima'],
          ],
        },
      },
      {
        titulo: 'Nomes em disputa',
        texto: ['O DNS responde o que lhe perguntam. Quem garante que o nome é o certo é quem lê.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Golpe', 'O que é', 'Exemplo de laboratório'],
          linhas: [
            ['Cybersquatting', 'registrar o nome de outra organização', 'fimdelinha-oficial.exemplo'],
            ['Typosquatting', 'registrar o erro de digitação provável', 'estadoi.fimdelinha.exemplo'],
            ['Nomes parecidos', 'letras de outros alfabetos que parecem as nossas', 'um "о" que não é o nosso o'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O estádio vai trocar o placar de máquina amanhã, e o registro A tem TTL de um dia. O que fazer hoje?',
      opcoes: [
        'Baixar o TTL do registro agora, para que os caches esqueçam o endereço velho logo depois da troca',
        'Nada: os resolvedores percebem a troca sozinhos na hora',
        'Desligar o resolvedor da prefeitura durante a troca',
        'Trocar o registro por um TXT com o endereço novo',
      ],
      certa: 0,
      explicacao: 'Os caches confiam na cópia até o TTL acabar. Com TTL de um dia, quem perguntou ontem continuaria indo ao endereço velho por até 24 horas. Baixando o TTL antes (e esperando o TTL antigo passar), a troca se espalha em minutos.',
    },
  },
  desafio: {
    carta: [
      'Pane no meio do treino: o placar principal queimou, e a equipe do estádio ligou o reserva, em 203.0.113.81, e já trocou o registro na zona. Só que a bilheteria continua indo ao endereço velho, 203.0.113.80.',
      'O registro antigo tinha TTL de 600 s, e o resolvedor da prefeitura tinha acabado de guardá-lo quando a troca aconteceu.',
      'Objetivo: a bilheteria recebendo o endereço novo do placar pelo resolvedor da prefeitura e a pergunta respondida.',
    ],
    dicas: [
      'Consulte o placar da bilheteria: o TTL que aparece é o que resta da cópia velha no cache.',
      'Ninguém precisa reiniciar nada. É só deixar o relógio passar desse TTL e consultar de novo.',
    ],
    perguntas: d113D,
    montar: () => {
      const m = mundoEstadio({ semente: 7113, estadio: [{ nome: 'www', tipo: 'A', valor: IP_PLACAR, ttl: 300 }, { nome: 'placar', tipo: 'A', valor: IP_PLACAR_NOVO, ttl: 60 }] });
      // A resposta antiga, com TTL de 600 s, foi guardada no relógio 0, antes da troca.
      cacheDoResolvedor(m.equipamentos.get('dns-pref')!).guardar([{ nome: normalizarNome(PLACAR), tipo: 'A', ttl: 600, valor: IP_PLACAR }], 0);
      return m;
    },
    objetivo: (m) => {
      const d = consulta(m, 'bilheteria', PLACAR, 'A');
      const ok = !!d && d.ok && d.resolvedor === 'dns-pref' && d.respostas.length > 0 && d.respostas.every((x) => x === IP_PLACAR_NOVO);
      return [
        item(`a bilheteria recebeu o placar em ${IP_PLACAR_NOVO} pelo resolvedor da prefeitura`, ok, d ? `${d.respostas.join(', ') || d.codigo} (${d.origem ?? 'sem resposta'})` : 'nenhuma consulta do placar pela bilheteria'),
        ...todasRespondidas(m, d113D),
      ];
    },
    solucao: [
      ['equip', 'bilheteria', 'ap-dig', { nome: PLACAR, tipo: 'A' }],
      ['equip', 'bilheteria', 'ap-esperar', { s: '600' }],
      ['equip', 'bilheteria', 'ap-dig', { nome: PLACAR, tipo: 'A' }],
    ],
    respostas: { '1': '600' },
  },
};

/* ======================================================================
 * 114: Correio (7.2)
 * ====================================================================== */

const d114D: Pergunta[] = [numerica('1', 'Depois da leitura por POP3, quantas mensagens ficaram guardadas no servidor, na caixa dos ingressos?', 0, 0)];

function mxDoEstadio(m: Mundo): boolean {
  return temRegistro(m, '@', 'MX', 'correio');
}

function correioEstadio(m: Mundo) {
  return servicosDe(m.equipamentos.get('correio-est')!)?.correio;
}

function chegou(m: Mundo, para: string): EnvioCorreio | undefined {
  const c = envio(m, para);
  return c && c.entregue && c.mx === normalizarNome(`correio.${ZONA}`) ? c : undefined;
}

const REGISTROS_114 = [
  { nome: 'www', tipo: 'A' as const, valor: IP_PLACAR, ttl: 300 },
  { nome: 'placar', tipo: 'A' as const, valor: IP_PLACAR, ttl: 300 },
];

const dia114: Dia = {
  numero: 114,
  ato: 6,
  titulo: 'Correio',
  chamado: [
    'CHAMADO #0114',
    'A secretaria de esportes precisa mandar a escalação oficial e o horário dos portões para a cabine de imprensa, e o estádio ainda não recebe e-mail. O correio-est está instalado, desligado, e a zona do estádio nem diz onde fica o correio.',
    'Objetivo: o MX do estádio na zona, o correio-est servindo o domínio, a mensagem da secretaria entregue em imprensa@estadio.fimdelinha.exemplo e lida na cabine.',
  ],
  manual: {
    titulo: 'Correio eletrônico: carta, envelope e carteiro',
    texto: [
      'O correio tem duas peças. O agente do usuário é o programa em que a pessoa escreve, lê, responde e organiza mensagens (no computador, no celular ou numa página web). O agente de transferência é o servidor que aceita mensagens, leva de um servidor a outro e guarda cada uma na caixa de correio de quem recebe. A caixa fica no servidor, sempre ligado; o agente do usuário só vai buscar. É por isso que dá para mandar mensagem para quem está com o computador desligado.',
      'Uma mensagem é texto com duas partes: os cabeçalhos e o corpo, separados por uma linha em branco. Os cabeçalhos seguem a RFC 5322: From, To, Cc, Subject, Date, Message-ID, e os Received, um por servidor do caminho, sempre acrescentado no topo (lidos de baixo para cima, contam a viagem). O corpo original só podia ter texto simples em ASCII. O MIME estendeu isso sem quebrar nada: o cabeçalho Content-Type diz o que vem (text/plain, text/html, image/png), um multipart junta várias partes separadas por uma fronteira, e o Content-Transfer-Encoding diz como os bytes foram escritos; base64 transforma cada 3 bytes em 4 caracteres seguros, para um anexo binário atravessar servidores que só aceitam texto.',
      'A transferência usa SMTP, uma conversa de texto sobre TCP. O servidor abre com 220; o cliente se apresenta com HELO, ou EHLO para pedir as extensões, e o servidor responde 250 com a lista. Depois vêm MAIL FROM (o remetente do envelope), RCPT TO (cada destinatário; 250 se a caixa existe, 550 se não existe), DATA (o servidor responde 354 e o cliente manda a mensagem, terminando com uma linha só com um ponto) e QUIT. O programa da pessoa entrega ao servidor do próprio domínio pela porta 587 (a submissão, com autenticação); o servidor procura o registro MX do domínio de destino e entrega ao servidor de lá pela porta 25. Com mais de um MX, tenta primeiro o de menor número.',
      'A entrega final, da caixa até a tela, é outro protocolo. O POP3 (porta 110) baixa as mensagens e, no modo comum, apaga do servidor: simples, mas cada aparelho fica com uma cópia diferente. O IMAP (porta 143) deixa tudo no servidor, com pastas e marcas de lida, e cada aparelho só sincroniza. O webmail é um agente do usuário dentro do navegador: a página fala HTTP com o servidor, mas entre os servidores de correio continua sendo SMTP.',
    ],
  },
  dicas: [
    'No srv-estadio, acrescente um registro MX com o nome @ (a própria zona) e o valor correio. O correio.estadio.fimdelinha.exemplo já tem registro A.',
    'No correio-est, "Servir correio de um domínio" com estadio.fimdelinha.exemplo. A caixa imprensa basta.',
    'A secretaria tem conta no servidor da prefeitura (192.168.6.25); a cabine, no do estádio (203.0.113.25). Envie de uma e leia na outra.',
  ],
  montar: () => mundoEstadio({ semente: 6114, estadio: [...REGISTROS_114, { nome: 'correio', tipo: 'A', valor: IP_CORREIO_EST, ttl: 3600 }] }),
  objetivo: (m) => {
    const c = chegou(m, IMPRENSA);
    const l = leitura(m, IMPRENSA);
    return [
      item('registro MX da zona do estádio apontando para correio', mxDoEstadio(m)),
      item(`correio-est servindo ${ZONA}`, correioEstadio(m)?.dominio === ZONA, correioEstadio(m) ? `domínio ${correioEstadio(m)!.dominio}` : 'serviço desligado'),
      item(`mensagem da secretaria entregue em ${IMPRENSA} pelo MX do estádio`, !!c && c.de === SECRETARIA, c ? `${c.received} cabeçalhos Received` : porqueNaoChegou(envio(m, IMPRENSA))),
      item('a cabine leu a mensagem na própria caixa', !!l && l.mensagens >= 1, l ? `${l.mensagens} mensagem(ns) por ${l.protocolo.toUpperCase()}` : 'caixa ainda não lida'),
    ];
  },
  posMorte: [
    'A mensagem fez quatro viagens. O agente do usuário da secretaria entregou ao servidor da prefeitura pela porta 587. O servidor da prefeitura perguntou ao DNS o MX de estadio.fimdelinha.exemplo, recebeu "10 correio.estadio.fimdelinha.exemplo", pediu o A desse nome (203.0.113.25) e abriu uma conexão TCP na porta 25. Lá, a conversa de sempre: 220, EHLO, 250, MAIL FROM, RCPT TO com 250 porque a caixa imprensa existe, DATA, 354, a mensagem, o ponto final. Por fim, a cabine buscou a caixa por IMAP, e a mensagem continua no servidor para a outra tela da cabine ver também.',
    'Sem o MX, a prefeitura não teria para onde levar: o domínio do estádio existia, mas não dizia quem recebe correio por ele. O MX separa o nome do domínio do nome da máquina, e a prioridade permite um servidor de reserva (o de número maior só é tentado se o de número menor falhar).',
    'Os dois cabeçalhos Received contam a viagem de baixo para cima: o de baixo foi posto pela prefeitura, quando recebeu da secretaria; o de cima, pelo estádio, quando recebeu da prefeitura. Quando um e-mail chega estranho, é por eles que se começa a investigar.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'O agente de transferência da prefeitura, que entrega por SMTP ao servidor do estádio, na porta 25',
          'O agente do usuário da secretaria, que entrega direto na tela da cabine por IMAP',
          'O resolvedor DNS, que carrega a mensagem junto com a resposta do MX',
          'O navegador da cabine, que busca a mensagem por HTTP no computador da secretaria',
        ],
        certa: 0,
        errada: {
          1: 'IMAP é para a pessoa ler a própria caixa, que mora no servidor. E a cabine pode estar desligada na hora do envio: por isso a mensagem passa por servidores sempre ligados.',
          2: 'O DNS só diz para onde levar (o MX). Quem carrega a mensagem é o SMTP.',
          3: 'O computador da secretaria não guarda caixa de ninguém. E o webmail fala HTTP só entre o navegador e o servidor de correio da própria pessoa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes de ligar nada: quem leva a mensagem do domínio da prefeitura até o domínio do estádio?',
      porque: 'O correio tem papéis separados: quem escreve e lê, quem transporta e quem guarda.',
      feito: 'O agente de transferência, por SMTP. O agente do usuário só entrega ao servidor do próprio domínio (submissão, porta 587) e, do outro lado, só busca na caixa (IMAP ou POP3).',
    }),
    passo({
      alvo: ['equip', 'srv-estadio'],
      acao: 'ap-servico-dns-registro',
      pedir: ['tipo', 'valor'],
      valores: { nome: '@', ttl: '3600' },
      exemplo: { tipo: 'MX', valor: 'correio' },
      instrucao: 'Na zona do estádio, publique quem recebe correio pelo domínio: o nome @ (a própria zona) apontando para correio.',
      porque: 'Quem manda e-mail para alguém@estadio.fimdelinha.exemplo pergunta ao DNS o MX desse domínio. O valor é o nome do servidor, não o IP.',
      conferir: (m) => {
        if (mxDoEstadio(m)) return true;
        if (temRegistro(m, '@', 'MX')) return 'O MX existe, mas aponta para outro nome. O servidor de correio do estádio é correio.estadio.fimdelinha.exemplo: valor correio.';
        if (temRegistro(m, '@', 'A') || temRegistro(m, '@', 'CNAME')) return 'Esse tipo não diz nada sobre correio. O registro que indica o servidor de correio de um domínio é o MX.';
        return 'A zona do estádio ainda não tem MX.';
      },
      feito: 'estadio.fimdelinha.exemplo MX 10 correio.estadio.fimdelinha.exemplo. O 10 é a prioridade, posta pelo servidor como padrão: com dois MX, o de menor número é tentado primeiro.',
    }),
    passo({
      alvo: ['equip', 'correio-est'],
      acao: 'ap-servico-correio',
      pedir: ['dominio'],
      valores: { caixas: 'imprensa' },
      exemplo: { dominio: ZONA },
      instrucao: 'No correio-est, ligue o serviço de correio do domínio do estádio, com a caixa imprensa.',
      porque: 'O MX diz para onde ir; alguém precisa estar escutando lá, na 25 (SMTP), na 587 (submissão), na 143 (IMAP) e na 110 (POP3).',
      conferir: (m) => {
        const c = correioEstadio(m);
        if (c?.dominio === ZONA) return true;
        if (c) return `O serviço ficou com o domínio ${c.dominio}. O domínio do estádio é ${ZONA}.`;
        return 'O correio-est ainda não serve correio.';
      },
      feito: 'Agente de transferência do estádio no ar, com a caixa imprensa. Endereço para qualquer outra caixa vai levar 550.',
    }),
    passo({
      alvo: ['equip', 'secretaria'],
      acao: 'ap-correio-conta',
      valores: { end: SECRETARIA, srv: IP_CORREIO_PREF },
      instrucao: 'Na secretaria, configure a conta secretaria@fimdelinha.exemplo no servidor de correio da prefeitura, 192.168.6.25.',
      porque: 'O agente do usuário não entrega direto no destino: entrega ao servidor do próprio domínio, que cuida do resto.',
      conferir: (m) => (contaDe(m, 'secretaria')?.servidor === IP_CORREIO_PREF ? true : 'A conta da secretaria ainda não aponta para o servidor da prefeitura.'),
      feito: 'Conta configurada: envio pela 587, leitura pela 143 ou pela 110.',
    }),
    passo({
      alvo: ['equip', 'secretaria'],
      acao: 'ap-correio-enviar',
      pedir: ['para'],
      valores: { assunto: 'Escalação da final', corpo: 'Portões abrem às 14h. A escalação oficial sai às 15h.' },
      exemplo: { para: IMPRENSA },
      instrucao: 'Mande a escalação para a caixa da imprensa no estádio.',
      porque: 'Acompanhe as três etapas: submissão, consulta do MX e a conversa SMTP entre os servidores.',
      conferir: (m) => {
        if (chegou(m, IMPRENSA)) return true;
        const c = m.flags.correio as EnvioCorreio | undefined;
        if (c && c.para.toLowerCase() !== IMPRENSA) return `A mensagem foi para ${c.para}. A caixa da imprensa é ${IMPRENSA}.`;
        return porqueNaoChegou(envio(m, IMPRENSA));
      },
      feito: 'MX 10 correio.estadio.fimdelinha.exemplo, conexão na porta 25, 220, EHLO, 250, MAIL FROM, RCPT TO com 250, DATA com 354. Entregue, com dois Received no topo.',
    }),
    passo({
      alvo: ['equip', 'cabine'],
      acao: 'ap-correio-conta',
      valores: { end: IMPRENSA, srv: IP_CORREIO_EST },
      instrucao: 'Na cabine, configure a conta da imprensa no servidor de correio do estádio, 203.0.113.25.',
      porque: 'A caixa mora no correio-est. A cabine precisa saber em que servidor buscar.',
      conferir: (m) => (contaDe(m, 'cabine')?.servidor === IP_CORREIO_EST ? true : 'A conta da cabine ainda não aponta para o correio-est.'),
      feito: 'Conta da imprensa no correio-est.',
    }),
    passo({
      alvo: ['equip', 'cabine'],
      acao: 'ap-correio-ler',
      pedir: ['proto'],
      exemplo: { proto: 'imap' },
      instrucao: 'Leia a caixa da imprensa de um jeito que deixe a mensagem no servidor, para a outra tela da cabine também ver.',
      porque: 'O POP3 baixa e apaga; o IMAP sincroniza e deixa tudo no servidor.',
      conferir: (m) => {
        const l = leitura(m, IMPRENSA);
        if (!l) return 'A caixa da imprensa ainda não foi lida.';
        if (l.mensagens === 0) return 'Caixa vazia. Se a mensagem já foi lida por POP3, ela saiu do servidor.';
        return l.protocolo === 'imap' ? true : 'Leu, mas por POP3: a mensagem foi apagada do servidor, e a outra tela não vai ver. A cabine queria IMAP.';
      },
      feito: 'IMAP na porta 143: LOGIN, SELECT INBOX, FETCH. A mensagem continua no servidor, marcada como lida, e as duas telas da cabine veem o mesmo estado.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quem faz o quê',
        texto: ['Agente do usuário para escrever e ler; agente de transferência para levar e guardar. Cada trecho tem o seu protocolo.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'sec', rotulo: 'secretaria (agente do usuário)', x: 80, y: 60 },
            { id: 'pref', rotulo: 'correio-pref (transferência)', x: 280, y: 60 },
            { id: 'dns', rotulo: 'DNS: MX do estádio', x: 280, y: 220 },
            { id: 'est', rotulo: 'correio-est (caixa imprensa)', x: 480, y: 60 },
            { id: 'cab', rotulo: 'cabine (agente do usuário)', x: 480, y: 220 },
          ],
          ligacoes: [
            ['sec', 'pref', 'submissão, 587'],
            ['pref', 'dns', 'MX?'],
            ['pref', 'est', 'SMTP, 25'],
            ['cab', 'est', 'IMAP 143 ou POP3 110'],
          ],
        },
      },
      {
        titulo: 'A mensagem por dentro',
        texto: ['Cabeçalhos da RFC 5322, uma linha em branco e o corpo. O MIME diz o tipo de cada parte e como os bytes foram escritos.'],
        visual: {
          tipo: 'camadas',
          camadas: [
            'Received: um por servidor, de baixo para cima',
            'From, To, Subject, Date, Message-ID',
            'MIME-Version: 1.0 e Content-Type: multipart/mixed; boundary=...',
            'parte 1: text/plain, em base64',
            'parte 2: image/png, em base64 (o anexo)',
          ],
          rotulo: 'uma mensagem com anexo',
        },
      },
      {
        titulo: 'Base64',
        texto: ['Três bytes (24 bits) viram quatro grupos de 6 bits, e cada grupo vira um caractere seguro (A a Z, a a z, 0 a 9, + e /). O texto cresce um terço, mas passa por qualquer servidor.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Etapa', 'O texto "Ola"'],
          linhas: [
            ['3 bytes', 'O (79), l (108), a (97)'],
            ['24 bits', '01001111 01101100 01100001'],
            ['4 grupos de 6 bits', '010011 110110 110001 100001'],
            ['4 números', '19, 54, 49, 33'],
            ['4 caracteres', 'T 2 x h'],
          ],
        },
      },
      {
        titulo: 'A conversa SMTP',
        texto: ['Comandos de texto, respostas com número: 2xx deu certo, 3xx continue, 5xx erro definitivo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Cliente', 'Servidor', 'Quer dizer'],
          linhas: [
            ['(conecta na 25)', '220', 'pronto'],
            ['EHLO correio.fimdelinha.exemplo', '250 + extensões', 'olá, eu sei fazer isto'],
            ['MAIL FROM:<secretaria@...>', '250', 'remetente aceito'],
            ['RCPT TO:<imprensa@...>', '250 ou 550', 'caixa existe ou não existe'],
            ['DATA', '354', 'mande, termine com um ponto'],
            ['(mensagem) e .', '250', 'aceita'],
            ['QUIT', '221', 'tchau'],
          ],
        },
      },
      {
        titulo: 'IMAP, POP3 e webmail',
        texto: ['A entrega final é escolha de quem lê.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'POP3', 'IMAP', 'Webmail'],
          linhas: [
            ['Porta', '110 (995 com TLS)', '143 (993 com TLS)', '443 (HTTPS)'],
            ['Onde fica a mensagem', 'baixa e apaga', 'no servidor', 'no servidor'],
            ['Vários aparelhos', 'cada um com uma cópia', 'todos sincronizados', 'qualquer navegador'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O domínio do estádio tem MX 10 correio e MX 20 reserva. O correio está fora do ar. O que o servidor da prefeitura faz?',
      opcoes: [
        'Tenta o de número 10, não consegue conectar, e entrega no de número 20',
        'Desiste na hora e avisa a secretaria',
        'Entrega no 20 primeiro, porque número maior é mais importante',
        'Manda a mensagem para o resolvedor DNS guardar',
      ],
      certa: 0,
      explicacao: 'Menor número, maior preferência. Se o preferido não atende na porta 25, o remetente tenta o próximo da lista. Só se nenhum atender a mensagem fica na fila, e o servidor tenta de novo mais tarde antes de desistir.',
    },
  },
  desafio: {
    carta: [
      'A bilheteria abriu um lote extra de ingressos e quer receber os pedidos dos clubes em ingressos@estadio.fimdelinha.exemplo. Os testes da secretaria voltam todos sem entrega.',
      'Alguém publicou um MX na zona do estádio, mas a equipe jura que o servidor de correio está de pé. E a bilheteria tem um computador só, sem espaço para pastas no servidor: quer baixar e apagar.',
      'Objetivo: um pedido da secretaria entregue na caixa dos ingressos, lido pela bilheteria por POP3, e a pergunta respondida.',
    ],
    dicas: [
      'Mande um teste da secretaria e leia a saída: o MX está lá, mas o nome dele não tem endereço. Falta um registro A.',
      'Mesmo com o endereço certo, o correio-est só tem a caixa imprensa. Reconfigure o serviço com as caixas imprensa,ingressos.',
      'Na bilheteria, a conta é ingressos@estadio.fimdelinha.exemplo no 203.0.113.25, e a leitura é por POP3.',
    ],
    perguntas: d114D,
    montar: () => mundoEstadio({ semente: 7114, estadio: [...REGISTROS_114, { nome: '@', tipo: 'MX', valor: 'correio', prioridade: 10, ttl: 3600 }], caixasEstadio: ['imprensa'] }),
    objetivo: (m) => {
      const c = envio(m, INGRESSOS);
      const l = leitura(m, INGRESSOS);
      return [
        item(`pedido da secretaria entregue em ${INGRESSOS}`, !!chegou(m, INGRESSOS) && c!.de === SECRETARIA, porqueNaoChegou(c)),
        item('a bilheteria leu a caixa dos ingressos por POP3', !!l && l.protocolo === 'pop3' && l.mensagens >= 1, l ? `${l.mensagens} mensagem(ns) por ${l.protocolo.toUpperCase()}` : 'caixa ainda não lida'),
        ...todasRespondidas(m, d114D),
      ];
    },
    solucao: [
      ['equip', 'srv-estadio', 'ap-servico-dns-registro', { nome: 'correio', tipo: 'A', valor: IP_CORREIO_EST, ttl: '3600' }],
      ['equip', 'correio-est', 'ap-servico-correio', { dominio: ZONA, caixas: 'imprensa,ingressos' }],
      ['equip', 'secretaria', 'ap-correio-conta', { end: SECRETARIA, srv: IP_CORREIO_PREF }],
      ['equip', 'secretaria', 'ap-correio-enviar', { para: INGRESSOS, assunto: 'Lote extra', corpo: 'Pedimos 40 ingressos do lote extra para o clube.' }],
      ['equip', 'bilheteria', 'ap-correio-conta', { end: INGRESSOS, srv: IP_CORREIO_EST }],
      ['equip', 'bilheteria', 'ap-correio-ler', { proto: 'pop3' }],
    ],
    respostas: { '1': '0' },
  },
};

export const ATO6A: Dia[] = [dia112, dia113, dia114];
