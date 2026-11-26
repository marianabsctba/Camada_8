// Dias do ato 6 (O Show), com prática guiada, aula e desafio no próprio dia.
// Os dois últimos dias da camada de aplicação, no estádio no dia da final: entrega de conteúdo
// (7.5.1 a 7.5.3: tráfego, parques de servidores, proxies e CDN) e peer-to-peer (7.5.4 e 7.5.5).

import { dhtResponsavel } from '../motor/aplicacao';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Tira acento, espaço e caixa, para conferir respostas escritas. */
function normal(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function textual(id: string, texto: string, certo: string): Pergunta {
  return { id, texto, confere: (r) => normal(r) === normal(certo) };
}

const NOME_FINAL = 'final.arquibancada.exemplo';

interface OpcoesMundo {
  semente: number;
  /** A máquina de onde a pessoa joga (o telão do estádio ou o computador da praça). */
  cliente: string;
  modeloCliente: string;
  /** O servidor do outro lado. */
  servidor: string;
  modeloServidor: string;
  servicos: Record<string, unknown>;
}

/**
 * A rede do estádio (10.60.0.0/24) sai pela borda-estadio até o roteador da operadora, que leva ao data center
 * (203.0.113.0/24), onde mora o servidor. As contas de CDN e P2P do motor não dependem do caminho, mas o caminho
 * existe para que tudo seja o mundo de verdade: servidor com serviço configurado, cliente com rota até ele.
 */
function mundoFinal(o: OpcoesMundo): Mundo {
  const m = novoMundo(o.semente);
  m.flags.aplicacao = true;
  adicionar(m, pc(o.cliente, { ip: cidr('10.60.0.10/24'), gateway: '10.60.0.1', modelo: o.modeloCliente }));
  adicionar(m, pc(o.servidor, { ip: cidr('203.0.113.10/24'), gateway: '203.0.113.1', modelo: o.modeloServidor }));
  adicionar(m, roteador('borda-estadio', { modelo: 'Roteador de borda do estádio', interfaces: { lan: '10.60.0.1/24', wan: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('operadora', { modelo: 'Roteador da operadora regional', interfaces: { wan: '198.51.100.2/30', dc: '203.0.113.1/24' }, rotas: [{ destino: '10.60.0.0/24', via: '198.51.100.1' }] }));
  ligar(m, { equip: o.cliente, porta: 'eth0' }, { equip: 'borda-estadio', porta: 'lan' }, 'cat6', 30, { id: 'c1' });
  ligar(m, { equip: 'borda-estadio', porta: 'wan' }, { equip: 'operadora', porta: 'wan' }, 'cat6', 90, { id: 'c2' });
  ligar(m, { equip: 'operadora', porta: 'dc' }, { equip: o.servidor, porta: 'eth0' }, 'cat6', 20, { id: 'c3' });
  m.proxCabo = 4;
  m.equipamentos.get(o.servidor)!.s.servicos = o.servicos;
  return m;
}

/* ---------- registros da CDN e do P2P ---------- */

interface ConsultaCdn {
  nome: string;
  cidade: string;
  borda: string;
  nomeCdn: string;
  rttMs: number;
  bordas: string[];
  maisPerto: string;
}

interface SimulacaoCdn {
  espectadores: number;
  taxa: number;
  origem: string;
  bordas: string[];
  semCdn: { atrasoMedio: number; trafegoEnlacePrincipal: number; ocupacao: number };
  comCdn: { atrasoMedio: number; trafegoEnlacePrincipal: number; ocupacao: number; bordasUsadas: string[] };
}

function consultaCdn(m: Mundo): ConsultaCdn | undefined {
  const c = m.flags.cdn as (Partial<ConsultaCdn> & { simulacao?: SimulacaoCdn }) | undefined;
  return c && c.cidade && c.borda ? (c as ConsultaCdn) : undefined;
}

function simulacaoCdn(m: Mundo): SimulacaoCdn | undefined {
  return (m.flags.cdn as { simulacao?: SimulacaoCdn } | undefined)?.simulacao;
}

interface Enxame {
  pares: number;
  pedacos: number;
  conexoes: number;
  politica: 'mais-raro' | 'aleatorio';
  olhoPorOlho: boolean;
  rodadas: number;
  transferencias: number;
}

interface ComparacaoP2P {
  mb: number;
  usMbps: number;
  uMbps: number;
  linhas: { N: number; clienteServidor: number; p2p: number }[];
}

function p2p(m: Mundo): { enxame?: Enxame; comparacao?: ComparacaoP2P; dht?: { chave: string; id: number; responsavel: number } } {
  return (m.flags.p2p ?? {}) as { enxame?: Enxame; comparacao?: ComparacaoP2P; dht?: { chave: string; id: number; responsavel: number } };
}

/** A comparação feita com estes números de arquivo e de banda, se houver. */
function comparacaoCom(m: Mundo, mb: number, us: number, u: number): ComparacaoP2P | undefined {
  const c = p2p(m).comparacao;
  return c && c.mb === mb && c.usMbps === us && c.uMbps === u ? c : undefined;
}

/** O tempo P2P para N = 1000 da comparação feita com esses números. */
function p2pMil(m: Mundo, mb: number, us: number, u: number): number {
  return comparacaoCom(m, mb, us, u)?.linhas.find((l) => l.N === 1000)?.p2p ?? NaN;
}

function enxameRaro(m: Mundo, minimo: number): ItemObjetivo {
  const e = p2p(m).enxame;
  const ok = !!e && e.pares >= minimo && e.politica === 'mais-raro' && e.rodadas > 0;
  return item(
    `enxame com pelo menos ${minimo} pares simulado com o pedaço mais raro primeiro`,
    ok,
    e ? `${e.pares} pares, ${e.pedacos} pedaços, política ${e.politica === 'mais-raro' ? 'mais raro primeiro' : 'aleatória'}, todos completos em ${e.rodadas} rodada(s)` : 'nenhum enxame simulado',
  );
}

function dhtFeita(m: Mundo, chave: string): ItemObjetivo {
  const d = p2p(m).dht;
  return item(`chave ${chave} procurada na tabela de dispersão distribuída`, !!d && d.chave === chave, d ? `última chave: ${d.chave}, nó ${d.responsavel}` : 'nenhuma busca feita');
}

/* ======================================================================
 * 118: Perto de quem assiste (7.5.1 a 7.5.3)
 * ====================================================================== */

/** A CDN contratada pela emissora: origem em São Paulo e cinco bordas. */
const BORDAS_118 = ['São Paulo', 'Curitiba', 'Recife', 'Manaus', 'Porto Alegre'];
/** A CDN da reprise: origem no Rio de Janeiro e seis bordas, nenhuma em Manaus. */
const BORDAS_118D = ['Rio de Janeiro', 'Brasília', 'Fortaleza', 'Belém', 'Porto Alegre', 'Salvador'];

const d118: Pergunta[] = [
  textual('1', 'Quem pergunta de Fortaleza é mandado para a borda de qual cidade?', 'Recife'),
  numerica('2', 'Na transmissão que você simulou, quantos Mb/s saem da origem quando a CDN está no caminho?', (m) => simulacaoCdn(m)?.comCdn.trafegoEnlacePrincipal ?? NaN, 0.5),
];

const d118D: Pergunta[] = [
  textual('1', 'Manaus ficou sem borda na CDN da reprise. Quem pergunta de lá é mandado para a borda de qual cidade?', 'Belém'),
  numerica('2', 'Na reprise que você simulou, quantos Mb/s saem da origem com a CDN?', (m) => simulacaoCdn(m)?.comCdn.trafegoEnlacePrincipal ?? NaN, 0.5),
];

/** A CDN configurada no servidor origem, se houver. */
function cdnDoServidor(m: Mundo): { origem?: string; bordas?: string[] } | undefined {
  const s = m.equipamentos.get('origem')?.s.servicos as { cdn?: { origem?: string; bordas?: string[] } } | undefined;
  return s?.cdn;
}

function mesmasCidades(a: string[] | undefined, b: string[]): boolean {
  return !!a && a.length === b.length && b.every((x) => a.includes(x));
}

/** Confere a CDN do servidor; devolve true ou a explicação do que está diferente. */
function confereCdn(m: Mundo, origem: string, bordas: string[]): true | string {
  const c = cdnDoServidor(m);
  if (!c) return 'O servidor origem ainda não tem CDN configurada.';
  if (c.origem !== origem) return `A origem ficou em ${c.origem}. O sinal sai de ${origem}.`;
  if (!c.bordas?.length) return 'Faltaram as bordas: escreva as cidades separadas por vírgula.';
  const faltam = bordas.filter((b) => !c.bordas!.includes(b));
  const sobram = c.bordas.filter((b) => !bordas.includes(b));
  if (faltam.length) return `Falta borda em ${faltam.join(', ')}.`;
  if (sobram.length) return `A emissora não contratou borda em ${sobram.join(', ')}.`;
  return true;
}

function cdnConfigurada(m: Mundo, origem: string, bordas: string[]): ItemObjetivo {
  const c = cdnDoServidor(m);
  const r = confereCdn(m, origem, bordas);
  return item(`CDN configurada no servidor origem: origem em ${origem}, bordas em ${bordas.join(', ')}`, r === true, c ? `origem ${c.origem}, bordas ${(c.bordas ?? []).join(', ') || 'nenhuma'}` : 'sem CDN');
}

function cdnLonge(m: Mundo, cidade: string, borda: string): ItemObjetivo {
  const c = consultaCdn(m);
  return item(
    `consulta à CDN feita de ${cidade}, que não tem borda própria, e resposta da borda mais perto (${borda})`,
    !!c && c.cidade === cidade && c.borda === borda && c.borda === c.maisPerto,
    c ? `última consulta: de ${c.cidade}, borda ${c.borda}, RTT ${c.rttMs.toFixed(1)} ms` : 'nenhuma consulta feita',
  );
}

function transmissaoSimulada(m: Mundo, origem: string, bordas: string[], taxaMin: number): ItemObjetivo {
  const s = simulacaoCdn(m);
  const ok = !!s && s.origem === origem && mesmasCidades(s.bordas, bordas) && s.taxa >= taxaMin && s.semCdn.ocupacao > 1 && s.comCdn.trafegoEnlacePrincipal < s.semCdn.trafegoEnlacePrincipal;
  return item(
    `transmissão simulada com a origem em ${origem}, pelo menos ${taxaMin} Mb/s por espectador, e a origem sozinha estourando o enlace`,
    ok,
    s ? `${s.espectadores} por cidade a ${s.taxa} Mb/s: sem CDN ${s.semCdn.trafegoEnlacePrincipal} Mb/s (${(s.semCdn.ocupacao * 100).toFixed(0)} % do enlace), com CDN ${s.comCdn.trafegoEnlacePrincipal} Mb/s` : 'nenhuma simulação feita',
  );
}

const dia118: Dia = {
  numero: 118,
  ato: 6,
  titulo: 'Perto de quem assiste',
  chamado: [
    'CHAMADO #0118',
    'Faltam três horas para a final e a Rede Arquibancada, que transmite o jogo, avisa: o sinal sai do servidor de origem em São Paulo, e no ensaio de ontem o país inteiro pediu a mesma imagem ao mesmo tempo. O enlace da origem caiu em dois minutos, e o telão do estádio de Fim de Linha travou junto.',
    'A emissora contratou uma rede de entrega de conteúdo (CDN) com bordas em cinco cidades: São Paulo, Curitiba, Recife, Manaus e Porto Alegre. Falta ligar a CDN no servidor de origem e ver com números para onde cada espectador vai e quanto a origem deixa de carregar.',
    'Objetivo: configurar a CDN no servidor de origem, consultar a CDN de Curitiba (o resolvedor de Fim de Linha) e de Fortaleza, simular a transmissão com e sem CDN e responder às perguntas.',
  ],
  manual: {
    titulo: 'Entregar conteúdo: perto, repetido e repartido',
    texto: [
      'O que anda na internet hoje é, em volume, principalmente vídeo: sob demanda e ao vivo, ele passa de longe a soma de páginas, correio e mensagens. E o pedido não se espalha por igual. A popularidade segue aproximadamente a lei de Zipf: o objeto que está em k-ésimo lugar no ranking recebe uma fração proporcional a 1/k dos pedidos. O primeiro colocado tem o dobro do segundo e dez vezes o décimo. Numa simulação do motor com 5000 pedidos para 1000 objetos, os 10 mais pedidos levaram 39,1 % dos pedidos e os 100 mais pedidos, 71,6 %. O resto é a cauda longa: muitos objetos pedidos quase nunca, que somados ainda pesam.',
      'A primeira forma de aguentar o público é dentro de casa: o parque de servidores. Vários servidores iguais ficam atrás de um front-end, o balanceador de carga, que recebe cada pedido e escolhe quem atende. Pode ser por rodízio (um para cada, sem olhar quem está ocupado) ou por menor carga (quem tem menos trabalho pendente). O DNS também pode espalhar: o mesmo nome responde com IPs diferentes para clientes diferentes. Mas o parque inteiro continua num lugar só, atrás de um enlace só.',
      'A segunda forma é guardar cópias perto de quem pede. Um proxy web é um cache compartilhado: fica na rede da escola ou da empresa, recebe os pedidos de todo mundo e, se já tem o objeto, responde na hora; se não tem, busca na origem e guarda. A medida é a taxa de acerto, a fração de pedidos respondida pelo cache. Com Zipf, um cache pequeno já pega muito: na simulação do motor, um proxy com lugar para 100 dos 1000 objetos acertou 58,6 % dos pedidos, e o atraso médio caiu de 82 ms para 35,1 ms.',
      'A rede de entrega de conteúdo (CDN) leva a ideia para a escala do país. Ela tem servidores de borda espalhados por várias cidades, cada um com cópia do conteúdo. O truque é o DNS: o site delega o nome por CNAME para a CDN, e o servidor autoritativo da CDN olha o IP do resolvedor de quem perguntou e responde com o endereço da borda mais perto, com TTL curto para poder mudar de ideia. O espectador busca na borda a poucos milissegundos; a borda busca na origem uma cópia só e reparte. Menos atraso para quem assiste, e a origem carrega uma cópia por borda, não uma por espectador.',
      'Um detalhe que vira pegadinha: a CDN vê o resolvedor, não o cliente. Fim de Linha usa o resolvedor da operadora em Curitiba, então é a borda de Curitiba que atende a cidade. Quem usa um resolvedor do outro lado do país pode ser mandado para uma borda longe.',
    ],
  },
  dicas: [
    'No servidor origem, "Contratar uma CDN": origem São Paulo e as cinco bordas do chamado, separadas por vírgula (São Paulo também é borda).',
    'As consultas e a simulação ficam no telao: "Consultar a CDN" com o nome final.arquibancada.exemplo e a cidade, e "Transmissão ao vivo com e sem CDN".',
    'Com a CDN, a origem manda uma cópia para cada borda usada: o tráfego dela é o número de bordas vezes a taxa de um espectador.',
  ],
  perguntas: d118,
  montar: () =>
    mundoFinal({
      semente: 5118,
      cliente: 'telao',
      modeloCliente: 'Computador do telão do estádio de Fim de Linha',
      servidor: 'origem',
      modeloServidor: 'Servidor de origem da Rede Arquibancada (São Paulo)',
      servicos: { streaming: { videos: { final: { taxa: 5000, duracao: 60 } } } },
    }),
  objetivo: (m) => [cdnConfigurada(m, 'São Paulo', BORDAS_118), cdnLonge(m, 'Fortaleza', 'Recife'), transmissaoSimulada(m, 'São Paulo', BORDAS_118, 5), ...todasRespondidas(m, d118)],
  posMorte: [
    'O ensaio caiu por conta simples: 11 cidades com 2000 espectadores cada, a 5 Mb/s, são 110000 Mb/s pedidos ao mesmo servidor, 11 vezes o enlace de 10000 Mb/s da origem. Não existe fila nem algoritmo de congestionamento que faça caber onze vezes mais do que o cano. Com a CDN, cada uma das 5 bordas puxa uma cópia, e a origem passa a mandar 25 Mb/s.',
    'O atraso também caiu: a média de ida e volta até a origem era de 21,1 ms, e até a borda mais perto ficou em 7,9 ms. Quem mora em cidade com borda fala com ela a 2 ms; Fortaleza, sem borda, vai para Recife a 11,4 ms em vez de 37,5 ms até São Paulo. Tudo isso decidido pelo DNS: o nome da final vira, por CNAME, final.cdn.exemplo, e o autoritativo da CDN escolhe a borda pelo resolvedor de quem pergunta.',
    'Proxy, parque de servidores e CDN são a mesma ideia em escalas diferentes: aproveitar que poucos objetos concentram quase todos os pedidos. A final é o caso extremo de Zipf, um objeto só pedido por todo mundo no mesmo segundo. O telão de Fim de Linha pega a imagem da borda de Curitiba, e a origem em São Paulo nem percebe a cidade.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['Vídeo, sob demanda e ao vivo', 'Páginas web com texto e imagens', 'Correio eletrônico', 'Consultas de DNS'],
        certa: 0,
        errada: {
          1: 'Páginas são muitas, mas pequenas. Um minuto de vídeo pesa mais que centenas de páginas.',
          2: 'O correio é antigo e importante, mas cada mensagem tem poucos kilobytes. No volume, quase some.',
          3: 'Há uma consulta de DNS antes de quase tudo, mas cada uma tem poucas dezenas de bytes.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes de mexer na final: o que domina o volume de tráfego da internet hoje?',
      porque: 'Quem quer aguentar o público precisa saber o que pesa. Não é o que tem mais pedidos, é o que tem mais bytes.',
      feito: 'Vídeo. É por isso que entregar conteúdo virou uma especialidade: quem resolve o vídeo resolve a maior parte do tráfego.',
    }),
    passo({
      escolha: {
        opcoes: ['Uns 100 pedidos', 'Uns 900 pedidos', 'Uns 10 pedidos', 'Os mesmos 1000 pedidos'],
        certa: 0,
        errada: {
          1: 'Isso seria uma queda linear, de 100 em 100. Na lei de Zipf a fração é proporcional a 1/k: o décimo tem 1/10 do primeiro.',
          2: 'Seria 1/100, a fração do centésimo colocado. O décimo tem 1/10 do primeiro.',
          3: 'Se todos tivessem o mesmo número de pedidos, um cache não ajudaria em nada. A graça da Zipf é a concentração.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Pela lei de Zipf, se o vídeo mais pedido do dia tem 1000 pedidos, quantos tem o décimo do ranking?',
      porque: 'O k-ésimo colocado recebe uma fração proporcional a 1/k. Poucos objetos concentram muito; a cauda longa é enorme e rala.',
      feito: 'Uns 100. Por isso guardar só os mais pedidos já resolve boa parte: na simulação do motor, um cache com 100 de 1000 objetos acertou 58,6 % dos pedidos.',
    }),
    passo({
      alvo: ['equip', 'origem'],
      acao: 'ap-servico-cdn',
      valores: { origem: 'São Paulo' },
      pedir: ['bordas'],
      exemplo: { bordas: BORDAS_118.join(', ') },
      instrucao: 'No servidor origem, ligue a CDN: origem em São Paulo e as cinco bordas que a emissora contratou.',
      porque: 'A CDN é configurada do lado do site: ela precisa saber onde fica a origem e em quais cidades há borda para receber as cópias. São Paulo também é borda: quem está lá pega na borda, não na origem.',
      conferir: (m) => confereCdn(m, 'São Paulo', BORDAS_118),
      feito: 'CDN ligada: origem em São Paulo e bordas em São Paulo, Curitiba, Recife, Manaus e Porto Alegre. O vídeo "final" sai a 5000 kb/s, 5 Mb/s por espectador.',
    }),
    passo({
      alvo: ['equip', 'telao'],
      acao: 'ap-cdn',
      valores: { nome: NOME_FINAL },
      pedir: ['cidade'],
      exemplo: { cidade: 'Curitiba' },
      instrucao: 'No telao, consulte a CDN pelo nome da final como faria o resolvedor de Fim de Linha, que fica em Curitiba.',
      porque: 'O autoritativo da CDN não vê o telão; vê o IP do resolvedor que fez a pergunta, e escolhe a borda mais perto dele.',
      conferir: (m) => {
        const c = consultaCdn(m);
        if (!c) return 'A consulta à CDN ainda não foi feita.';
        if (c.cidade !== 'Curitiba') return `Você consultou como se o resolvedor estivesse em ${c.cidade}. O de Fim de Linha é o da operadora, em Curitiba.`;
        return true;
      },
      feito: 'O nome vira, por CNAME, final.cdn.exemplo, e a CDN responde com a borda de Curitiba, a 2 ms. Até a origem em São Paulo seriam 7,1 ms, e com a origem já sem fôlego.',
    }),
    passo({
      alvo: ['equip', 'telao'],
      acao: 'ap-cdn',
      valores: { nome: NOME_FINAL },
      pedir: ['cidade'],
      exemplo: { cidade: 'Fortaleza' },
      instrucao: 'Agora pergunte como um resolvedor de Fortaleza, cidade sem borda própria.',
      porque: 'Nem toda cidade tem borda. A CDN escolhe a de menor RTT entre as que existem.',
      conferir: (m) => {
        const c = consultaCdn(m);
        if (!c) return 'A consulta à CDN ainda não foi feita.';
        if (c.cidade !== 'Fortaleza') return `A consulta foi de ${c.cidade}. Escolha Fortaleza como cidade de quem pergunta.`;
        return true;
      },
      feito: 'Fortaleza vai para a borda de Recife, a 11,4 ms. Até São Paulo seriam 37,5 ms. A borda não precisa estar na cidade; precisa estar perto.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: 'Recife' },
      instrucao: 'Quem pergunta de Fortaleza é mandado para a borda de qual cidade?',
      porque: 'A resposta está na última linha da consulta: a borda escolhida e o RTT até ela.',
      feito: 'Recife. Se a emissora abrir uma borda em Fortaleza, o DNS da CDN passa a mandar a cidade para lá sem ninguém mexer no telão.',
    }),
    passo({
      alvo: ['equip', 'telao'],
      acao: 'ap-cdn-simular',
      valores: { n: '2000', taxa: '5' },
      instrucao: 'Simule a final ao vivo: 2000 espectadores em cada cidade, a 5 Mb/s cada, com e sem CDN.',
      porque: 'Sem CDN, cada espectador puxa a própria cópia da origem. Com CDN, cada borda puxa uma e reparte entre os seus.',
      conferir: (m) => {
        const s = simulacaoCdn(m);
        if (!s) return 'A simulação ainda não foi feita.';
        return s.semCdn.ocupacao > 1 ? true : 'Com tão pouco público a origem dá conta sozinha. Use 2000 espectadores por cidade a 5 Mb/s.';
      },
      feito: 'Sem CDN: 110000 Mb/s saindo da origem, 1100 % do enlace, e todo mundo trava. Com CDN: 25 Mb/s na origem, e o atraso médio cai de 21,1 ms para 7,9 ms.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '25' },
      instrucao: 'Quantos Mb/s saem da origem quando a CDN está no caminho?',
      porque: 'Uma cópia por borda usada, não uma por espectador: número de bordas vezes a taxa do vídeo.',
      feito: '25 Mb/s: 5 bordas vezes 5 Mb/s. Os 22000 espectadores viram, para a origem, só 5.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Poucos pedem muito, muitos pedem pouco',
        texto: ['Na lei de Zipf, o k-ésimo objeto recebe uma fração proporcional a 1/k dos pedidos. Simulação do motor: 5000 pedidos para 1000 objetos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Objetos mais pedidos', 'Fração dos pedidos'],
          linhas: [
            ['os 10 primeiros (1 %)', '39,1 %'],
            ['os 100 primeiros (10 %)', '71,6 %'],
            ['os outros 900 (a cauda longa)', '28,4 %'],
          ],
        },
      },
      {
        titulo: 'Parque de servidores',
        texto: ['Vários servidores iguais atrás de um front-end que distribui os pedidos, por rodízio ou por menor carga. Aguenta mais gente, mas continua tudo num lugar só, atrás de um enlace só.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'cli', rotulo: 'clientes', x: 60, y: 140 },
            { id: 'bal', rotulo: 'front-end (balanceador)', x: 260, y: 140 },
            { id: 's1', rotulo: 'servidor 1', x: 480, y: 50 },
            { id: 's2', rotulo: 'servidor 2', x: 480, y: 140 },
            { id: 's3', rotulo: 'servidor 3', x: 480, y: 230 },
          ],
          ligacoes: [
            ['cli', 'bal', 'um enlace só'],
            ['bal', 's1'],
            ['bal', 's2', 'menor carga'],
            ['bal', 's3'],
          ],
        },
      },
      {
        titulo: 'Proxy: o cache de todo mundo',
        texto: ['Um cache compartilhado na rede da instituição. Acerto responde em 2 ms; falha vai à origem e volta em 82 ms. Com Zipf, guardar pouco já acerta muito.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Lugar no cache', 'Taxa de acerto', 'Atraso médio'],
          linhas: [
            ['10 objetos', '21 %', '65,2 ms'],
            ['100 objetos', '58,6 %', '35,1 ms'],
            ['300 objetos', '76,3 %', '20,9 ms'],
          ],
        },
      },
      {
        titulo: 'CDN: a borda mais perto, pelo DNS',
        texto: ['O site delega o nome por CNAME; o autoritativo da CDN responde com a borda mais perto do resolvedor. A borda busca uma cópia na origem e reparte.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'org', rotulo: 'origem (São Paulo)', x: 300, y: 40 },
            { id: 'cwb', rotulo: 'borda Curitiba', x: 110, y: 150 },
            { id: 'rec', rotulo: 'borda Recife', x: 490, y: 150 },
            { id: 'fdl', rotulo: 'telão de Fim de Linha', x: 110, y: 250 },
            { id: 'for', rotulo: 'espectador de Fortaleza', x: 490, y: 250 },
          ],
          ligacoes: [
            ['org', 'cwb', 'uma cópia'],
            ['org', 'rec', 'uma cópia'],
            ['cwb', 'fdl', '2 ms'],
            ['rec', 'for', '11,4 ms'],
          ],
        },
      },
      {
        titulo: 'A final com e sem CDN',
        texto: ['11 cidades, 2000 espectadores em cada, 5 Mb/s por espectador, enlace da origem de 10000 Mb/s.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Sem CDN', 'Com CDN (5 bordas)'],
          linhas: [
            ['tráfego na origem', '110000 Mb/s', '25 Mb/s'],
            ['ocupação do enlace', '1100 %', '0,25 %'],
            ['atraso médio', '21,1 ms', '7,9 ms'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Fim de Linha passa a usar um resolvedor público que fica em Manaus. O que acontece com o telão do estádio?',
      opcoes: [
        'A CDN o manda para a borda de Manaus, longe, porque decide pela posição do resolvedor e não do cliente',
        'Nada muda: a CDN sempre descobre onde o telão está pelo IP dele',
        'O telão passa a buscar direto na origem, sem CDN',
        'A CDN recusa a consulta porque o resolvedor é de outra cidade',
      ],
      certa: 0,
      explicacao: 'O autoritativo da CDN só vê quem pergunta a ele, e quem pergunta é o resolvedor. Com o resolvedor em Manaus, a borda escolhida é a de Manaus, e o vídeo atravessa o país à toa. Existem extensões do DNS que passam um pedaço do IP do cliente para corrigir isso, mas o padrão é decidir pelo resolvedor.',
    },
  },
  desafio: {
    carta: [
      'A final acabou empatada e vai ter jogo de volta. A Rede Arquibancada mudou o contrato para a reprise e para o segundo jogo: agora a origem fica no Rio de Janeiro, com bordas em Rio de Janeiro, Brasília, Fortaleza, Belém, Porto Alegre e Salvador. O servidor origem ainda está com a CDN do primeiro jogo.',
      'A torcida de Manaus reclamou que ficou sem borda própria e quer saber para onde vai. E a emissora quer subir a qualidade para 8 Mb/s por espectador, com 1000 espectadores por cidade.',
      'Objetivo: reconfigurar a CDN com o contrato novo, consultar a CDN como um resolvedor de Manaus, simular a transmissão com a nova qualidade e responder às perguntas.',
    ],
    dicas: [
      'Primeiro, no servidor origem, "Contratar uma CDN" com a origem e as seis bordas novas. A consulta e a simulação ficam no telao e usam a CDN que estiver configurada.',
      'Na consulta, a borda escolhida é a de menor RTT entre as que existem. Na simulação, a origem manda uma cópia para cada borda que tem público.',
      'Com a CDN, o tráfego na origem é o número de bordas usadas vezes a taxa de um espectador.',
    ],
    perguntas: d118D,
    montar: () =>
      mundoFinal({
        semente: 6118,
        cliente: 'telao',
        modeloCliente: 'Computador do telão do estádio de Fim de Linha',
        servidor: 'origem',
        modeloServidor: 'Servidor de origem da Rede Arquibancada (Rio de Janeiro)',
        servicos: { streaming: { videos: { final: { taxa: 8000, duracao: 60 } } }, cdn: { origem: 'São Paulo', bordas: [...BORDAS_118] } },
      }),
    objetivo: (m) => [cdnConfigurada(m, 'Rio de Janeiro', BORDAS_118D), cdnLonge(m, 'Manaus', 'Belém'), transmissaoSimulada(m, 'Rio de Janeiro', BORDAS_118D, 8), ...todasRespondidas(m, d118D)],
    solucao: [
      ['equip', 'origem', 'ap-servico-cdn', { origem: 'Rio de Janeiro', bordas: BORDAS_118D.join(', ') }],
      ['equip', 'telao', 'ap-cdn', { nome: NOME_FINAL, cidade: 'Manaus' }],
      ['equip', 'telao', 'ap-cdn-simular', { n: '1000', taxa: '8' }],
    ],
    respostas: { '1': 'Belém', '2': '48' },
  },
};

/* ======================================================================
 * 119: De par em par (7.5.4 e 7.5.5)
 * ====================================================================== */

const CHAVE_119 = 'final-completa.mp4';
const CHAVE_119D = 'compacto-da-final.mp4';
const NOS_DHT = [3, 17, 42, 77, 101, 150, 199, 230];

const d119: Pergunta[] = [
  numerica('1', 'Com 1000 pessoas baixando a final completa, quantos segundos leva, no mínimo, a distribuição P2P?', (m) => p2pMil(m, 800, 100, 10), 1),
  numerica('2', `Na tabela de dispersão do motor, qual nó guarda a chave ${CHAVE_119}?`, () => dhtResponsavel(CHAVE_119, NOS_DHT).responsavel, 0),
];

const d119D: Pergunta[] = [
  numerica('1', 'Com 1000 pessoas baixando o compacto pelo servidor da escola, quantos segundos leva, no mínimo, a distribuição P2P?', (m) => p2pMil(m, 500, 50, 5), 1),
  numerica('2', `Na tabela de dispersão do motor, qual nó guarda a chave ${CHAVE_119D}?`, () => dhtResponsavel(CHAVE_119D, NOS_DHT).responsavel, 0),
];

function comparacaoItem(m: Mundo, mb: number, us: number, u: number): ItemObjetivo {
  const c = comparacaoCom(m, mb, us, u);
  const mil = c?.linhas.find((l) => l.N === 1000);
  return item(
    `cliente-servidor comparado com P2P para um arquivo de ${mb} MB, servidor subindo ${us} Mb/s e cada par ${u} Mb/s`,
    !!mil && mil.p2p < mil.clienteServidor / 10,
    mil ? `N = 1000: cliente-servidor ${mil.clienteServidor.toFixed(0)} s, P2P ${mil.p2p.toFixed(1)} s` : p2p(m).comparacao ? 'a última comparação usou outros números' : 'nenhuma comparação feita',
  );
}

const dia119: Dia = {
  numero: 119,
  ato: 6,
  titulo: 'De par em par',
  chamado: [
    'CHAMADO #0119',
    'O apito final soou e Fim de Linha inteira quer o jogo completo para rever: 800 MB, e o acervo da prefeitura, que guarda o arquivo, sobe só 100 Mb/s. Se mil casas pedirem ao mesmo tempo, a fila vai até amanhã.',
    'A ideia da praça é cada casa que já baixou ajudar as outras, de par em par, sem servidor central dizendo quem tem o quê.',
    'Objetivo: comparar cliente-servidor com P2P para o arquivo da final, simular um enxame com o pedaço mais raro primeiro, procurar a chave do arquivo na tabela de dispersão distribuída e responder às perguntas.',
  ],
  manual: {
    titulo: 'Peer-to-peer: quem baixa também serve',
    texto: [
      'No modelo cliente-servidor, um servidor sobe uma cópia para cada cliente. Se N pessoas querem um arquivo de F bits e o servidor sobe us bits por segundo, ele precisa mandar N vezes F: o tempo mínimo é N·F/us, e cresce em linha reta com N. Numa rede peer-to-peer (P2P), cada par é cliente e servidor ao mesmo tempo: quem já tem um pedaço sobe para os outros. A capacidade total de envio passa a ser us + N·u, onde u é a subida de cada par, e cresce junto com o público. O tempo mínimo é o maior entre F/us (a semente precisa mandar o arquivo uma vez), F/dmin (o par mais lento precisa baixar tudo) e N·F/(us + N·u). Quando N cresce, essa última conta para de crescer e encosta em F/u.',
      'O protocolo BitTorrent é o exemplo clássico. O arquivo é cortado em pedaços de tamanho fixo, cada um com um resumo para conferir que chegou inteiro. O conjunto de pares trocando o mesmo arquivo é o enxame; quem chega pergunta a um rastreador, que devolve uma amostra de pares. Cada par pede primeiro o pedaço mais raro entre os vizinhos: assim nenhum pedaço fica preso num par só, e se a semente sair, o enxame ainda tem tudo.',
      'Para não virar bagunça de quem só baixa, entra o toma-lá-dá-cá (olho por olho): cada par sobe para os poucos vizinhos que mais lhe mandaram nos últimos segundos, e corta os outros. Uma vaga fica para o desbloqueio otimista, um vizinho sorteado de vez em quando, para conhecer quem pode retribuir e para dar a quem acabou de chegar, sem nada, a chance do primeiro pedaço. Quem só baixa e nunca sobe acaba atendido só pelos desbloqueios e fica para trás.',
      'E sem rastreador? Uma tabela de dispersão distribuída (DHT) espalha o índice entre os próprios pares. Os nós e as chaves ganham identificadores no mesmo espaço de números (o resumo do nome do arquivo vira um número). Na forma clássica de anel, cada nó cuida da faixa de chaves que vai do nó anterior até ele, e guarda atalhos para nós a meia volta, a um quarto, a um oitavo do anel: cada salto corta a distância pela metade, e a busca chega em uns log₂ N saltos. Mil nós, uns 10 saltos. O motor usa uma variante muito comum em que a proximidade é medida pela distância XOR entre os identificadores, com 8 nós num espaço de 8 bits.',
      'A internet mudou de forma por causa disso tudo. Nasceu como rede de pontas, computadores conversando de igual para igual; virou rede de conteúdo. Nos anos 2000 o P2P de arquivos ocupava uma fatia enorme do tráfego; nos anos 2010 o vídeo sob demanda servido por CDN tomou o lugar. Hoje grandes provedores de conteúdo e de nuvem têm rede própria, com data centers e bordas espalhados, e se ligam direto aos provedores de acesso nos pontos de troca de tráfego, sem passar pelas operadoras do meio. O caminho entre quem assiste e o conteúdo ficou curto.',
    ],
  },
  dicas: [
    'Tudo fica no computador praca: "Cliente-servidor contra P2P", "Enxame P2P" e "Tabela de dispersão distribuída".',
    'Para a comparação, use o arquivo de 800 MB, a subida de 100 Mb/s do acervo e 10 Mb/s de cada casa. A resposta é a coluna P2P da linha N = 1000.',
    `Procure a chave ${CHAVE_119}. A resposta é o nó com a menor distância XOR, que o resultado mostra.`,
  ],
  perguntas: d119,
  montar: () =>
    mundoFinal({
      semente: 5119,
      cliente: 'praca',
      modeloCliente: 'Computador da praça, ligado ao enxame da cidade',
      servidor: 'acervo',
      modeloServidor: 'Acervo da prefeitura, com a final completa (800 MB)',
      servicos: { streaming: { videos: { final: { taxa: 5000, duracao: 60 } } } },
    }),
  objetivo: (m) => [comparacaoItem(m, 800, 100, 10), enxameRaro(m, 20), dhtFeita(m, CHAVE_119), ...todasRespondidas(m, d119)],
  posMorte: [
    'A fila de amanhã era a conta do cliente-servidor: 1000 casas vezes 800 MB, pelos 100 Mb/s do acervo, são 64000 segundos, quase 18 horas. Em P2P, cada casa que recebe um pedaço passa a subir seus 10 Mb/s para as outras, e a capacidade total cresce com o público: o mínimo cai para uns 634 segundos, uns 10 minutos e meio. Com 10 casas a diferença era só o dobro; com 1000, cem vezes. É isso que quer dizer escalar com o número de pares.',
    'No enxame, o pedaço mais raro primeiro espalhou cada pedaço por vários pares logo cedo, e o toma-lá-dá-cá fez quem sobe receber de volta. O desbloqueio otimista deu o primeiro pedaço a quem acabou de chegar sem nada para oferecer. E a busca pelo arquivo não dependeu de ninguém no centro: o resumo do nome virou o identificador 132, e o nó 150, o mais perto dele, respondeu onde estão os pares.',
    'Fecha aqui a camada de aplicação, e com ela o dia da final. Nomes resolvidos, páginas e correio no ar, vídeo com buffer certo, imagem servida pela borda de Curitiba e o jogo completo correndo de casa em casa. Fim de Linha inteira assistiu ao jogo ao vivo: o telão do estádio, as casas da Rua das Acácias, o hospital, a escola. A cidade que não tinha internet virou plateia. E, como toda plateia grande, agora chama atenção.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['Porque cada par que baixa também sobe para os outros', 'Porque o servidor central fica mais rápido quando há mais gente', 'Porque os arquivos ficam menores quando divididos em pedaços', 'Porque cada par baixa só uma parte e nunca o arquivo inteiro'],
        certa: 0,
        errada: {
          1: 'O servidor não ganha banda com o público. No P2P ele pode até ser o mesmo; quem traz capacidade nova são os pares.',
          2: 'Dividir em pedaços não encolhe nada: a soma dos pedaços é o arquivo. Os pedaços servem para vários pares trocarem ao mesmo tempo.',
          3: 'Cada par termina com o arquivo inteiro. O que muda é de quem ele recebe cada pedaço.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Antes de começar: por que uma rede P2P aguenta mais gente justamente quando chega mais gente?',
      porque: 'No cliente-servidor, cada cliente novo é só mais demanda. No P2P, cada par novo traz demanda e capacidade.',
      feito: 'A capacidade de envio do enxame é a do servidor mais a soma das subidas de todos os pares. Ela cresce com o público.',
    }),
    passo({
      alvo: ['equip', 'praca'],
      acao: 'ap-p2p-comparar',
      valores: { mb: '800', us: '100', u: '10' },
      instrucao: 'No computador da praça, compare cliente-servidor e P2P para a final completa: 800 MB, o acervo subindo 100 Mb/s e cada casa 10 Mb/s.',
      porque: 'O motor calcula o tempo mínimo de cada modelo para 1, 10, 100 e 1000 pessoas. Olhe como cada coluna cresce.',
      conferir: (m) => (comparacaoCom(m, 800, 100, 10) ? true : 'A comparação ainda não foi feita com 800 MB, 100 Mb/s e 10 Mb/s.'),
      feito: 'Com 1 pessoa, 64 s nos dois. Com 1000, o cliente-servidor vai a 64000 s e o P2P fica em 633,7 s. A coluna do P2P quase para de crescer: encosta em F/u, 640 s.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '634' },
      instrucao: 'Com 1000 pessoas, quantos segundos leva, no mínimo, a distribuição P2P?',
      porque: 'É a linha N = 1000, coluna P2P. A conta é N·F/(us + N·u): 1000 × 6400 Mb dividido por 100 + 1000 × 10 Mb/s.',
      feito: 'Uns 634 segundos, pouco mais de 10 minutos, contra quase 18 horas no cliente-servidor.',
    }),
    passo({
      alvo: ['equip', 'praca'],
      acao: 'ap-p2p',
      valores: { pares: '20', pedacos: '32' },
      pedir: ['pol'],
      exemplo: { pol: 'raro' },
      instrucao: 'Simule um enxame de 20 casas e uma semente, com o arquivo em 32 pedaços. Escolha a política que protege o enxame se a semente sair.',
      porque: 'Se todo mundo pegar os mesmos pedaços populares, os raros ficam só na semente. Quando ela sai, ninguém termina.',
      conferir: (m) => {
        const e = p2p(m).enxame;
        if (!e) return 'O enxame ainda não foi simulado.';
        if (e.politica !== 'mais-raro') return 'Na política aleatória, um pedaço pode ficar só na semente por muito tempo. Escolha o pedaço mais raro primeiro.';
        return e.pares >= 20 ? true : 'Use pelo menos 20 pares.';
      },
      feito: 'Cada par pediu o pedaço que menos vizinhos tinham, e em poucas rodadas cada pedaço já estava em vários lugares. Cada par que recebe passa a servir: a capacidade de envio cresce com o enxame.',
    }),
    passo({
      escolha: {
        opcoes: ['Para os vizinhos que mais lhe mandaram, mais um sorteado de vez em quando', 'Para todos os vizinhos por igual, sempre', 'Só para a semente, que tem o arquivo inteiro', 'Para quem pedir primeiro, até acabar a banda'],
        certa: 0,
        errada: {
          1: 'Repartir igual com todos premia quem só baixa: ele recebe o mesmo que quem ajuda, sem subir nada.',
          2: 'A semente já tem tudo; mandar para ela é desperdício. Os pedaços vão para quem ainda precisa.',
          3: 'Assim quem chega primeiro leva tudo, e quem retribui não ganha nada por isso. Não há incentivo para subir.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'No toma-lá-dá-cá, para quem cada par sobe os seus pedaços?',
      porque: 'O enxame só funciona se valer a pena subir. A regra precisa premiar quem retribui sem trancar a porta para quem acabou de chegar.',
      feito: 'Para os poucos que mais lhe mandaram, e uma vaga para o desbloqueio otimista, sorteada. É assim que quem chega sem nada ganha o primeiro pedaço, e quem só baixa fica para trás.',
    }),
    passo({
      alvo: ['equip', 'praca'],
      acao: 'ap-p2p-dht',
      valores: { chave: CHAVE_119 },
      instrucao: `Sem rastreador, procure a chave ${CHAVE_119} na tabela de dispersão distribuída.`,
      porque: 'O resumo do nome vira um identificador no mesmo espaço dos nós. O nó mais perto dele guarda quem tem o arquivo.',
      conferir: (m) => (p2p(m).dht?.chave === CHAVE_119 ? true : `A busca ainda não foi feita com a chave ${CHAVE_119}.`),
      feito: 'O resumo do nome deu 132 (10000100). A menor distância XOR é até o nó 150 (distância 18). Num anel, com cada nó cuidando da faixa até ele, a mesma chave também cairia no 150, o primeiro nó depois de 132.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '150' },
      instrucao: `Qual nó guarda a chave ${CHAVE_119}?`,
      porque: 'É a última linha da busca: o responsável é o nó com a menor distância XOR até o identificador da chave.',
      feito: 'O nó 150. Com 8 nós, qualquer busca chega lá em uns 3 saltos (log₂ 8); com um milhão de nós, uns 20.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Cliente-servidor contra P2P',
        texto: ['Arquivo de 800 MB, servidor subindo 100 Mb/s, cada par subindo 10 Mb/s e baixando até 100 Mb/s. Tempos mínimos do motor.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Pessoas', 'Cliente-servidor', 'P2P'],
          linhas: [
            ['1', '64 s', '64 s'],
            ['10', '640 s', '320 s'],
            ['100', '6400 s', '581,8 s'],
            ['1000', '64000 s', '633,7 s'],
          ],
        },
      },
      {
        titulo: 'O enxame',
        texto: ['O rastreador apresenta os pares. Cada um pede o pedaço mais raro entre os vizinhos e sobe para quem lhe retribui, com uma vaga para o desbloqueio otimista.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'ras', rotulo: 'rastreador', x: 300, y: 30 },
            { id: 'sem', rotulo: 'semente (arquivo inteiro)', x: 100, y: 130 },
            { id: 'a', rotulo: 'casa A', x: 500, y: 130 },
            { id: 'b', rotulo: 'casa B', x: 180, y: 250 },
            { id: 'c', rotulo: 'casa C (acabou de chegar)', x: 440, y: 250 },
          ],
          ligacoes: [
            ['ras', 'a', 'lista de pares'],
            ['sem', 'a', 'pedaço 7'],
            ['a', 'b', 'toma-lá-dá-cá'],
            ['b', 'a', 'pedaço 12'],
            ['a', 'c', 'desbloqueio otimista'],
          ],
        },
      },
      {
        titulo: 'DHT: o índice espalhado',
        texto: ['Nós e chaves no mesmo espaço de números. No anel, cada nó cuida da faixa até ele, e os atalhos cortam a distância pela metade a cada salto: uns log₂ N saltos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Nós na tabela', 'Saltos de uma busca (log₂ N)'],
          linhas: [
            ['8', '3'],
            ['1000', 'uns 10'],
            ['1 milhão', 'uns 20'],
          ],
        },
      },
      {
        titulo: 'O que dominou cada época',
        texto: ['A rede de pontas virou rede de conteúdo. Hoje grandes provedores têm rede própria e se ligam aos provedores de acesso nos pontos de troca de tráfego.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Época', 'Tráfego predominante'],
          linhas: [
            ['Anos 1970 e 1980', 'Terminal remoto, transferência de arquivos e correio'],
            ['Anos 1990', 'Web e correio'],
            ['Anos 2000', 'Peer-to-peer de arquivos'],
            ['Anos 2010', 'Vídeo sob demanda servido por CDN'],
            ['Anos 2020', 'Vídeo (sob demanda e ao vivo) e conferência'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Num enxame, a semente sai da rede no meio da distribuição. Por que a política do pedaço mais raro primeiro ajuda?',
      opcoes: [
        'Porque espalha cedo cópias de cada pedaço, e nenhum fica preso só na semente',
        'Porque faz a semente subir mais rápido antes de sair',
        'Porque dispensa o resumo que confere cada pedaço',
        'Porque obriga cada par a baixar o arquivo em ordem',
      ],
      certa: 0,
      explicacao: 'Pedindo primeiro o que menos vizinhos têm, o enxame faz cópias justamente dos pedaços em risco. Quando a semente sai, cada pedaço já está em algum par e todo mundo consegue terminar. Na escolha aleatória, um pedaço azarado pode continuar só na semente e sumir com ela.',
    },
  },
  desafio: {
    carta: [
      'A escola também quer distribuir o compacto da final, com os gols e a festa: 500 MB, a partir do servidor dela, que sobe só 50 Mb/s. As casas do bairro da escola sobem 5 Mb/s cada.',
      'A diretora pergunta quanto tempo leva para mil famílias, se cada uma que baixar ajudar as outras, e onde a chave do arquivo vai parar na tabela de dispersão da cidade.',
      'Objetivo: comparar cliente-servidor com P2P com esses números, simular um enxame de pelo menos 30 casas com o pedaço mais raro primeiro, procurar a chave compacto-da-final.mp4 e responder às perguntas.',
    ],
    dicas: [
      'Tudo no computador praca. Na comparação, use os números da carta: arquivo, subida do servidor e subida de cada casa.',
      'O tempo P2P de 1000 pessoas é a linha N = 1000, coluna P2P. Ele fica perto de F/u, o tempo de um par subir o arquivo inteiro.',
      'Na DHT do motor, o responsável é o nó de menor distância XOR, que nem sempre é o primeiro nó depois da chave no anel.',
    ],
    perguntas: d119D,
    montar: () =>
      mundoFinal({
        semente: 6119,
        cliente: 'praca',
        modeloCliente: 'Computador da praça, ligado ao enxame da cidade',
        servidor: 'escola',
        modeloServidor: 'Servidor da escola, com o compacto da final (500 MB)',
        servicos: { streaming: { videos: { compacto: { taxa: 4000, duracao: 60 } } } },
      }),
    objetivo: (m) => [comparacaoItem(m, 500, 50, 5), enxameRaro(m, 30), dhtFeita(m, CHAVE_119D), ...todasRespondidas(m, d119D)],
    solucao: [
      ['equip', 'praca', 'ap-p2p-comparar', { mb: '500', us: '50', u: '5' }],
      ['equip', 'praca', 'ap-p2p', { pares: '30', pedacos: '40', pol: 'raro' }],
      ['equip', 'praca', 'ap-p2p-dht', { chave: CHAVE_119D }],
    ],
    respostas: { '1': '792', '2': '230' },
  },
};

export const ATO6C: Dia[] = [dia118, dia119];
