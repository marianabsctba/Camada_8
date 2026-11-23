// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// No anel de fibra que liga os bairros: estado de enlace (5.2.5), roteamento hierárquico (5.2.6)
// e difusão, multicast e anycast (5.2.7 a 5.2.9).

import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { grafoDoMundo, ospfDe, roteadoresComMembros } from '../motor/protocolos';
import { roteamentoHierarquico, type ResultadoHierarquico } from '../motor/rotear';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Roteador com custos OSPF já anotados nas portas e, se pedido, o OSPF já ligado. */
function rot(m: Mundo, nome: string, modelo: string, interfaces: Record<string, string>, o: { ospf?: boolean; custos?: Record<string, number>; regiao?: string } = {}): void {
  const e = roteador(nome, { modelo, interfaces });
  if (o.ospf !== undefined || o.custos) e.s.ospf = { ligado: !!o.ospf, custos: { ...(o.custos ?? {}) }, areas: {} };
  if (o.regiao) e.s.regiao = o.regiao;
  adicionar(m, e);
}

/** Liga duas portas de roteador com um trecho do anel (cat6 no laboratório). */
function trecho(m: Mundo, a: string, pa: string, b: string, pb: string, id: string): void {
  ligar(m, { equip: a, porta: pa }, { equip: b, porta: pb }, 'cat6', 60, { id });
}

function host(m: Mundo, nome: string, ip: string, gw: string, r: string, porta: string, id: string, modelo?: string): void {
  adicionar(m, pc(nome, { ip: cidr(ip), gateway: gw, modelo }));
  ligar(m, { equip: nome, porta: 'eth0' }, { equip: r, porta }, 'cat6', 10, { id });
}

function ospfLigado(m: Mundo, nome: string): boolean {
  return !!ospfDe(m.equipamentos.get(nome)!)?.ligado;
}

/** O enlace entre a:pa e b:pb foi derrubado por um dos dois lados? */
function derrubado(m: Mundo, a: string, b: string): boolean {
  const d = (m.flags.derrubadas as string[] | undefined) ?? [];
  return d.includes(a) || d.includes(b);
}

function traceRegistro(m: Mundo, de: string, ip: string): { chegou: boolean; saltos: (string | null)[] } | undefined {
  return m.flags.traceroutes?.[`${de}>${ip}`];
}

function traceOk(m: Mundo, de: string, ip: string, passaPor: string, nomeSalto: string): ItemObjetivo {
  const r = traceRegistro(m, de, ip);
  const texto = `traceroute de ${de} até ${ip} chegando pela ${nomeSalto} (${passaPor})`;
  if (!r) return item(texto, false, 'ainda não foi feito');
  return item(texto, r.chegou && r.saltos.includes(passaPor), `saltos: ${r.saltos.map((s) => s ?? '*').join(', ')}`);
}

function regiaoDe(m: Mundo, nome: string): string {
  const e = m.equipamentos.get(nome)!;
  return String(e.s.regiao ?? nome);
}

/** Roteamento hierárquico calculado agora, com as regiões que estão configuradas. */
function hierarquiaAgora(m: Mundo): ResultadoHierarquico {
  const g = grafoDoMundo(m);
  return roteamentoHierarquico(g, Object.fromEntries(g.nos.map((n) => [n, regiaoDe(m, n)])));
}

function grupos(m: Mundo, nome: string): string[] {
  return (m.equipamentos.get(nome)!.s.grupos as string[] | undefined) ?? [];
}

interface RegistroMulticast {
  origem: string;
  membros: string[];
  arestas: string[];
  podadas: string[];
  copias: number;
}

function multicastRegistro(m: Mundo, grupo: string): RegistroMulticast | undefined {
  return m.flags.multicast?.[grupo];
}

/** A árvore multicast foi calculada a partir da origem e com os membros de agora (ninguém entrou ou saiu depois). */
function multicastAtual(m: Mundo, grupo: string, origem: string, esperados: string[]): ItemObjetivo {
  const r = multicastRegistro(m, grupo);
  const agora = roteadoresComMembros(m, grupo);
  const texto = `árvore multicast de ${grupo} a partir do ${origem}, chegando em ${esperados.join(', ')}`;
  if (!r) return item(texto, false, 'ainda não foi calculada');
  const ok = r.origem === origem && r.membros.join(',') === agora.join(',') && agora.join(',') === [...esperados].sort().join(',');
  return item(texto, ok, `membros na última árvore: ${r.membros.join(', ') || 'nenhum'}; ouvindo agora: ${agora.join(', ') || 'ninguém'}`);
}

/* ======================================================================
 * Mundos
 * ====================================================================== */

/** Anel oeste: dc, olaria, moinho e serraria. O caminho curto até o Moinho passa pela Olaria. */
function mundoAnelOeste(): Mundo {
  const m = novoMundo(482);
  m.flags.camadaRede = true;
  rot(m, 'dc', 'Roteador Anel 8 (data center municipal)', { lan: '10.0.0.1/24', olaria: '10.255.1.1/30', serraria: '10.255.4.2/30' }, { ospf: false, custos: { olaria: 1, serraria: 2 } });
  rot(m, 'olaria', 'Roteador Anel 8 (bairro da Olaria)', { dc: '10.255.1.2/30', moinho: '10.255.2.1/30' }, { ospf: true, custos: { dc: 1, moinho: 1 } });
  rot(m, 'moinho', 'Roteador Anel 8 (bairro do Moinho)', { olaria: '10.255.2.2/30', serraria: '10.255.3.1/30', lan: '192.168.40.1/24' }, { ospf: true, custos: { olaria: 1, serraria: 2 } });
  rot(m, 'serraria', 'Roteador Anel 8 (bairro da Serraria)', { moinho: '10.255.3.2/30', dc: '10.255.4.1/30' }, { ospf: true, custos: { moinho: 2, dc: 2 } });
  trecho(m, 'dc', 'olaria', 'olaria', 'dc', 'f1');
  trecho(m, 'olaria', 'moinho', 'moinho', 'olaria', 'f2');
  trecho(m, 'moinho', 'serraria', 'serraria', 'moinho', 'f3');
  trecho(m, 'serraria', 'dc', 'dc', 'serraria', 'f4');
  host(m, 'prefeitura', '10.0.0.10/24', '10.0.0.1', 'dc', 'lan', 'c1', 'PC do protocolo da prefeitura');
  host(m, 'posto', '192.168.40.10/24', '192.168.40.1', 'moinho', 'lan', 'c2', 'PC do posto de saúde do Moinho');
  m.proxCabo = 3;
  return m;
}

/** Anel da represa: represa, cooperativa, quartel e escola. O lado da escola é o caminho reserva (custo 3). */
function mundoAnelRepresa(): Mundo {
  const m = novoMundo(3082);
  m.flags.camadaRede = true;
  rot(m, 'represa', 'Roteador Anel 8 (represa)', { lan: '10.20.0.1/24', coop: '10.255.11.1/30', escola: '10.255.14.2/30' }, { ospf: true, custos: { coop: 1, escola: 3 } });
  rot(m, 'cooperativa', 'Roteador Anel 8 (cooperativa)', { represa: '10.255.11.2/30', quartel: '10.255.12.1/30' }, { custos: { represa: 1, quartel: 1 } });
  rot(m, 'quartel', 'Roteador Anel 8 (quartel dos bombeiros)', { coop: '10.255.12.2/30', escola: '10.255.13.1/30', lan: '10.30.0.1/24' }, { ospf: true, custos: { coop: 1, escola: 3 } });
  rot(m, 'escola', 'Roteador Anel 8 (escola estadual)', { quartel: '10.255.13.2/30', represa: '10.255.14.1/30' }, { custos: { quartel: 3, represa: 3 } });
  trecho(m, 'represa', 'coop', 'cooperativa', 'represa', 'f1');
  trecho(m, 'cooperativa', 'quartel', 'quartel', 'coop', 'f2');
  trecho(m, 'quartel', 'escola', 'escola', 'quartel', 'f3');
  trecho(m, 'escola', 'represa', 'represa', 'escola', 'f4');
  host(m, 'comporta', '10.20.0.10/24', '10.20.0.1', 'represa', 'lan', 'c1', 'Sensor da comporta da represa');
  host(m, 'defesa-civil', '10.30.0.10/24', '10.30.0.1', 'quartel', 'lan', 'c2', 'Painel da Defesa Civil');
  m.proxCabo = 3;
  return m;
}

/** Centro (matriz, mercado, rodoviária) e oeste (olaria, moinho, serraria), ligados pela matriz e pela rodoviária. */
function mundoRegioes(): Mundo {
  const m = novoMundo(483);
  m.flags.camadaRede = true;
  rot(m, 'matriz', 'Roteador Anel 8 (praça da Matriz)', { mercado: '10.255.21.1/30', rodoviaria: '10.255.22.1/30', olaria: '10.255.23.1/30' }, { regiao: 'centro' });
  rot(m, 'mercado', 'Roteador Anel 8 (mercado municipal)', { matriz: '10.255.21.2/30' });
  rot(m, 'rodoviaria', 'Roteador Anel 8 (rodoviária)', { matriz: '10.255.22.2/30', serraria: '10.255.24.1/30' });
  rot(m, 'olaria', 'Roteador Anel 8 (bairro da Olaria)', { matriz: '10.255.23.2/30', moinho: '10.255.25.1/30' }, { regiao: 'oeste' });
  rot(m, 'moinho', 'Roteador Anel 8 (bairro do Moinho)', { olaria: '10.255.25.2/30', serraria: '10.255.26.1/30' }, { regiao: 'oeste' });
  rot(m, 'serraria', 'Roteador Anel 8 (bairro da Serraria)', { moinho: '10.255.26.2/30', rodoviaria: '10.255.24.2/30' }, { regiao: 'oeste' });
  trecho(m, 'matriz', 'mercado', 'mercado', 'matriz', 'f1');
  trecho(m, 'matriz', 'rodoviaria', 'rodoviaria', 'matriz', 'f2');
  trecho(m, 'matriz', 'olaria', 'olaria', 'matriz', 'f3');
  trecho(m, 'rodoviaria', 'serraria', 'serraria', 'rodoviaria', 'f4');
  trecho(m, 'olaria', 'moinho', 'moinho', 'olaria', 'f5');
  trecho(m, 'moinho', 'serraria', 'serraria', 'moinho', 'f6');
  m.proxCabo = 1;
  return m;
}

/** Anel norte de seis roteadores; o trecho igreja-represa é mais caro (custo 2). */
function mundoRegioesNorte(): Mundo {
  const m = novoMundo(3083);
  m.flags.camadaRede = true;
  rot(m, 'escola', 'Roteador Anel 8 (escola estadual)', { praca: '10.255.31.1/30', cooperativa: '10.255.36.1/30' });
  rot(m, 'praca', 'Roteador Anel 8 (praça do coreto)', { escola: '10.255.31.2/30', igreja: '10.255.32.1/30' });
  rot(m, 'igreja', 'Roteador Anel 8 (igreja do alto)', { praca: '10.255.32.2/30', represa: '10.255.33.1/30' }, { custos: { represa: 2 } });
  rot(m, 'represa', 'Roteador Anel 8 (represa)', { igreja: '10.255.33.2/30', usina: '10.255.34.1/30' }, { custos: { igreja: 2 } });
  rot(m, 'usina', 'Roteador Anel 8 (usina de reciclagem)', { represa: '10.255.34.2/30', cooperativa: '10.255.35.1/30' });
  rot(m, 'cooperativa', 'Roteador Anel 8 (cooperativa)', { usina: '10.255.35.2/30', escola: '10.255.36.2/30' });
  trecho(m, 'escola', 'praca', 'praca', 'escola', 'f1');
  trecho(m, 'praca', 'igreja', 'igreja', 'praca', 'f2');
  trecho(m, 'igreja', 'represa', 'represa', 'igreja', 'f3');
  trecho(m, 'represa', 'usina', 'usina', 'represa', 'f4');
  trecho(m, 'usina', 'cooperativa', 'cooperativa', 'usina', 'f5');
  trecho(m, 'cooperativa', 'escola', 'escola', 'cooperativa', 'f6');
  m.proxCabo = 1;
  return m;
}

/** A rádio no estúdio, cinco bairros com laço e duas cópias do servidor de nomes no mesmo endereço. */
function mundoRadio(): Mundo {
  const m = novoMundo(484);
  m.flags.camadaRede = true;
  rot(m, 'estudio', 'Roteador Anel 8 (prédio da rádio e do servidor de nomes)', { lan: '10.80.0.1/24', centro: '10.255.41.1/30', dns: '10.53.0.1/24' });
  rot(m, 'centro', 'Roteador Anel 8 (centro)', { estudio: '10.255.41.2/30', norte: '10.255.42.1/30', sul: '10.255.43.1/30' });
  rot(m, 'norte', 'Roteador Anel 8 (bairro norte)', { centro: '10.255.42.2/30', leste: '10.255.44.1/30', oeste: '10.255.46.1/30', lan: '10.81.0.1/24' });
  rot(m, 'sul', 'Roteador Anel 8 (bairro sul)', { centro: '10.255.43.2/30', leste: '10.255.45.1/30', oeste: '10.255.47.1/30', lan: '10.83.0.1/24' });
  rot(m, 'leste', 'Roteador Anel 8 (bairro leste)', { norte: '10.255.44.2/30', sul: '10.255.45.2/30', lan: '10.82.0.1/24' });
  rot(m, 'oeste', 'Roteador Anel 8 (bairro oeste)', { norte: '10.255.46.2/30', sul: '10.255.47.2/30', lan: '10.84.0.1/24', dns: '10.53.0.1/24' });
  trecho(m, 'estudio', 'centro', 'centro', 'estudio', 'f1');
  trecho(m, 'centro', 'norte', 'norte', 'centro', 'f2');
  trecho(m, 'centro', 'sul', 'sul', 'centro', 'f3');
  trecho(m, 'norte', 'leste', 'leste', 'norte', 'f4');
  trecho(m, 'sul', 'leste', 'leste', 'sul', 'f5');
  trecho(m, 'norte', 'oeste', 'oeste', 'norte', 'f6');
  trecho(m, 'sul', 'oeste', 'oeste', 'sul', 'f7');
  host(m, 'transmissor', '10.80.0.10/24', '10.80.0.1', 'estudio', 'lan', 'c1', 'Transmissor da Rádio Fim de Linha FM');
  host(m, 'escola', '10.81.0.10/24', '10.81.0.1', 'norte', 'lan', 'c2', 'PC da escola');
  host(m, 'hospital', '10.82.0.10/24', '10.82.0.1', 'leste', 'lan', 'c3', 'PC da recepção do hospital');
  host(m, 'cooperativa', '10.83.0.10/24', '10.83.0.1', 'sul', 'lan', 'c4', 'PC da cooperativa');
  host(m, 'biblioteca', '10.84.0.10/24', '10.84.0.1', 'oeste', 'lan', 'c5', 'PC da biblioteca');
  host(m, 'dns-estudio', '10.53.0.53/24', '10.53.0.1', 'estudio', 'dns', 'c6', 'Servidor de nomes (cópia do prédio da rádio)');
  host(m, 'dns-oeste', '10.53.0.53/24', '10.53.0.1', 'oeste', 'dns', 'c7', 'Servidor de nomes (cópia do bairro oeste)');
  m.proxCabo = 8;
  return m;
}

/* ======================================================================
 * 82: Estado de enlace (5.2.5)
 * ====================================================================== */

const d82: Pergunta[] = [numerica('1', 'Depois da queda, qual é a métrica da rota do dc para 192.168.40.0/24?', 5, 0)];

const dia82: Dia = {
  numero: 82,
  ato: 4,
  titulo: 'Estado de enlace',
  chamado: [
    'CHAMADO #0082',
    'O anel oeste ficou pronto: data center, Olaria, Moinho e Serraria, cada um ligado aos dois vizinhos. Os três bairros já rodam o protocolo de estado de enlace; só falta o roteador do data center, e por isso a prefeitura ainda não alcança o posto de saúde do Moinho.',
    'A empreiteira avisou que vai abrir a calçada entre o data center e a Olaria na semana que vem. A secretaria de saúde quer uma prova de que o posto não fica fora do ar quando a retroescavadeira encontrar a fibra.',
    'Objetivo: OSPF ligado no dc, o trecho dc-Olaria derrubado de propósito, um traceroute da prefeitura até o posto (192.168.40.10) chegando pela Serraria e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Roteamento por estado de enlace',
    texto: [
      'No vetor de distância, cada roteador conta aos vizinhos só a distância que acha ter até cada destino, e acredita no que ouve. Funciona, mas demora para perceber uma queda e, no pior caso, conta ao infinito. O roteamento por estado de enlace troca a fofoca pelo mapa: cada roteador conta a todos da rede só o que sabe de primeira mão (quem são os vizinhos dele e quanto custa chegar em cada um), e cada um monta sozinho o mapa inteiro.',
      'São cinco passos. Um: descobrir os vizinhos, mandando um pacote HELLO por cada enlace; quem responde é vizinho. Dois: medir o custo de cada enlace, seja pelo atraso de um pacote de eco, seja pela velocidade (no OSPF o padrão é 10^8 dividido pelos bits por segundo, e aqui os custos já vêm anotados). Três: montar o pacote de estado de enlace (LSP), com a identidade de quem manda, um número de sequência, uma idade e a lista de vizinhos com o custo de cada um.',
      'Quatro: inundar o LSP para todos os roteadores. Cada um repassa o LSP por todos os enlaces, menos o de chegada, mas só se ele for mais novo do que o que já tem guardado: o número de sequência diz quem é mais novo, e cópia repetida ou velha vai para o lixo. A idade começa num valor fixo (aqui, 3600 segundos), cai a cada salto e a cada segundo, e LSP que chega a zero sai do banco. Assim um LSP perdido ou de um roteador que reiniciou não fica para sempre. Cinco: com todos os LSPs no banco de estado de enlace (a LSDB), cada roteador roda o Dijkstra a partir de si mesmo e põe na tabela só o primeiro salto de cada caminho.',
      'Como todos têm o mesmo banco, todos chegam a caminhos coerentes. Quando um enlace cai, os dois roteadores das pontas percebem pelo HELLO que sumiu, mandam LSPs novos com sequência maior, a inundação leva a notícia a todos em poucos saltos e cada um refaz o Dijkstra. Não tem rodada de boato: a convergência é rápida. O preço é memória e processamento, porque cada roteador guarda o mapa inteiro e calcula o caminho para todo mundo. O OSPF e o IS-IS, os dois protocolos de estado de enlace mais usados dentro de uma rede, seguem exatamente esses passos.',
    ],
  },
  dicas: [
    'Comece pelo dc: sem o protocolo ligado nele, os vizinhos não recebem HELLO de volta e ninguém aprende o caminho até a prefeitura.',
    'Depois de ligar, veja a LSDB e a tabela de rotas do dc. Para derrubar o trecho, use a porta "olaria" do dc.',
    'A métrica nova é a soma dos custos: dc até Serraria (2), Serraria até Moinho (2) e a rede do posto no Moinho (1).',
  ],
  perguntas: d82,
  montar: mundoAnelOeste,
  objetivo: (m) => [
    item('OSPF ligado no dc', ospfLigado(m, 'dc')),
    item('trecho dc-Olaria derrubado (a obra chegou)', derrubado(m, 'dc:olaria', 'olaria:dc')),
    traceOk(m, 'prefeitura', '192.168.40.10', '10.255.4.1', 'Serraria'),
    ...todasRespondidas(m, d82),
  ],
  posMorte: [
    'Antes de você ligar o OSPF no dc, a Olaria e a Serraria mandavam HELLO para o data center e ninguém respondia. Sem vizinho, nada de enlace no mapa, e a prefeitura ficou de fora. Ligado o protocolo, os HELLOs fecharam, o dc mandou o LSP dele, recebeu os três dos bairros e rodou o Dijkstra: o caminho até o Moinho pela Olaria custa 1 + 1 = 2, contra 2 + 2 = 4 pela Serraria. A rota para o posto entrou com métrica 3 (os 2 do caminho mais 1 da rede do posto).',
    'Quando o trecho caiu, o dc e a Olaria perceberam na hora e publicaram LSPs com sequência maior. Todos receberam, jogaram fora a versão velha e recalcularam. A rota trocou para a Serraria, com métrica 5, sem ninguém digitar rota nenhuma. No vetor de distância, a mesma queda levaria algumas rodadas de troca de vetores; aqui foi uma inundação e um Dijkstra.',
    'Repare na LSDB: o banco do dc é igual ao de qualquer outro roteador do anel. É isso que torna o estado de enlace previsível: todo mundo calcula sobre o mesmo mapa. Quando o mapa diverge (um LSP que não chegou, uma área mal configurada), começam os problemas, e é por isso que os números de sequência e a idade existem.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'dc'],
      acao: 'rot-ospf',
      valores: { estado: 'on' },
      instrucao: 'No dc, ligue o OSPF.',
      porque: 'Os passos um e dois: o dc manda HELLO por cada enlace e descobre os vizinhos, Olaria e Serraria. O custo de cada enlace já está anotado nas portas: 1 para a Olaria, 2 para a Serraria.',
      conferir: (m) => (ospfLigado(m, 'dc') ? true : 'O OSPF do dc continua desligado.'),
      feito: 'Dois vizinhos encontrados e três rotas instaladas. Os bairros também passaram a conhecer a rede da prefeitura: o dc já inundou o LSP dele.',
    }),
    passo({
      alvo: ['equip', 'dc'],
      acao: 'rot-ospf-ver',
      instrucao: 'Veja o OSPF do dc e o banco de estado de enlace.',
      porque: 'Os passos três e quatro: cada roteador montou um LSP com sequência, idade, vizinhos e redes, e a inundação levou todos a todos.',
      feito: 'Quatro LSPs na LSDB, um por roteador do anel, cada um com a sua sequência e a sua idade. A rota para 192.168.40.0/24 vai pela Olaria (10.255.1.2), com métrica 3.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque todos receberam os mesmos quatro LSPs pela inundação: o banco é igual em todos os roteadores do anel',
          'Porque o dc perguntou a rota pronta para cada vizinho, como no vetor de distância',
          'Porque alguém digitou as rotas à mão no dc',
          'Porque o dc só conhece os vizinhos diretos e nada além deles',
        ],
        certa: 0,
        errada: {
          1: 'Isso é vetor de distância: o vizinho conta a distância que acha ter. No estado de enlace, ninguém manda rota pronta; cada um manda só os próprios vizinhos, e o mapa inteiro se monta em cada roteador.',
          2: 'A tabela do dc não tem nenhuma rota estática. As três rotas novas têm origem "ospf".',
          3: 'Se fosse assim, o dc não saberia do enlace entre o Moinho e a Serraria. Ele sabe, porque o LSP do Moinho chegou até ele.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Como o dc sabe do enlace entre o Moinho e a Serraria, se não está ligado a nenhum dos dois por ele?',
      porque: 'O LSP de cada roteador só fala dos vizinhos dele. Mas a inundação leva cada LSP a todos, e quem junta todos tem o mapa inteiro.',
      feito: 'Mapa igual para todos, Dijkstra em cada um. É o coração do estado de enlace.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'traceroute',
      valores: { destino: '192.168.40.10' },
      instrucao: 'Da prefeitura, rode um traceroute até o posto de saúde (192.168.40.10).',
      porque: 'O caminho pela Olaria custa 2 até o Moinho; o da Serraria custa 4. O Dijkstra escolhe o menor.',
      conferir: (m) => (traceRegistro(m, 'prefeitura', '192.168.40.10')?.chegou ? true : 'O traceroute não chegou ao posto. O OSPF do dc está ligado?'),
      feito: 'dc, Olaria (10.255.1.2), Moinho e o posto. Caminho mais curto, aprendido sozinho.',
    }),
    passo({
      alvo: ['equip', 'dc'],
      acao: 'rot-derrubar',
      pedir: ['porta'],
      exemplo: { porta: 'olaria' },
      instrucao: 'Faça o papel da retroescavadeira: no dc, derrube a porta que vai para a Olaria.',
      porque: 'O HELLO para de chegar pelos dois lados do trecho. O dc e a Olaria montam LSPs novos, com número de sequência maior, e inundam.',
      conferir: (m) =>
        derrubado(m, 'dc:olaria', 'olaria:dc')
          ? true
          : derrubado(m, 'dc:lan', 'dc:lan')
            ? 'Essa é a porta da prefeitura: agora ninguém sai do data center. Levante a "lan" com "Levantar uma porta derrubada" e derrube a "olaria".'
            : 'O trecho até a Olaria continua de pé. Escolha a porta "olaria".',
      feito: 'Um vizinho só agora. Veja a tabela: a rota para 192.168.40.0/24 mudou para via 10.255.4.1, a Serraria, na mesma hora.',
    }),
    passo({
      alvo: ['equip', 'prefeitura'],
      acao: 'traceroute',
      valores: { destino: '192.168.40.10' },
      instrucao: 'Rode o traceroute da prefeitura até o posto de novo.',
      porque: 'Todos receberam os LSPs novos e refizeram o Dijkstra. Ida e volta agora contornam o anel pelo outro lado.',
      conferir: (m) => (traceRegistro(m, 'prefeitura', '192.168.40.10')?.saltos.includes('10.255.4.1') ? true : 'O caminho ainda não passou pela Serraria (10.255.4.1). O trecho até a Olaria caiu mesmo?'),
      feito: 'dc, Serraria (10.255.4.1), Moinho e o posto. A obra pode começar.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '5' },
      instrucao: 'Depois da queda, qual é a métrica da rota do dc para 192.168.40.0/24?',
      porque: 'A métrica é a soma dos custos do caminho até o roteador que anuncia a rede, mais o custo da própria rede: dc até a Serraria custa 2, Serraria até o Moinho custa 2, e a rede do posto no Moinho custa 1.',
      feito: '2 + 2 + 1 = 5. Antes da queda eram 1 + 1 + 1 = 3. O caminho ficou mais caro, mas continuou existindo.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Os cinco passos',
        texto: ['Todo roteador de estado de enlace faz a mesma coisa, na mesma ordem. Os três primeiros são locais; o quarto espalha; o quinto calcula.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Passo', 'O que o roteador faz'],
          linhas: [
            ['1. descobrir vizinhos', 'manda HELLO por cada enlace; quem responde é vizinho'],
            ['2. medir custos', 'pelo atraso de um eco ou pela velocidade (10^8 / bps no OSPF)'],
            ['3. montar o LSP', 'quem sou, sequência, idade, vizinhos e o custo de cada um'],
            ['4. inundar', 'repassa só LSP mais novo do que o guardado; o resto é descartado'],
            ['5. calcular', 'Dijkstra sobre o banco inteiro; na tabela vai o primeiro salto'],
          ],
        },
      },
      {
        titulo: 'O pacote de estado de enlace',
        texto: ['O LSP de um roteador fala só dele mesmo. É pouco, mas somando os LSPs de todos sai o mapa inteiro.'],
        visual: {
          tipo: 'camadas',
          camadas: ['origem: moinho', 'sequência: 1 (cresce a cada mudança)', 'idade: começa em 3600 s e cai até zero', 'vizinhos: olaria (custo 1), serraria (custo 2)', 'redes: 192.168.40.0/24 e os dois trechos do anel'],
          rotulo: 'o LSP do Moinho no anel oeste',
        },
      },
      {
        titulo: 'O anel oeste visto pelo mapa',
        texto: ['Com os quatro LSPs, o dc enxerga o anel inteiro com os custos. Pela Olaria, o Moinho fica a 2; pela Serraria, a 4. Quando o trecho dc-Olaria cai, sobra o 4.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'dc', rotulo: 'dc', x: 120, y: 120 },
            { id: 'ol', rotulo: 'olaria', x: 300, y: 40 },
            { id: 'mo', rotulo: 'moinho', x: 480, y: 120 },
            { id: 'se', rotulo: 'serraria', x: 300, y: 200 },
          ],
          ligacoes: [
            ['dc', 'ol', 'custo 1'],
            ['ol', 'mo', 'custo 1'],
            ['mo', 'se', 'custo 2'],
            ['se', 'dc', 'custo 2'],
          ],
        },
      },
      {
        titulo: 'Estado de enlace contra vetor de distância',
        texto: ['Os dois chegam às mesmas rotas quando a rede está calma. A diferença aparece quando algo quebra.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Vetor de distância', 'Estado de enlace'],
          linhas: [
            ['o que cada um manda', 'a tabela inteira, só aos vizinhos', 'só os próprios vizinhos, a todos'],
            ['quem calcula o caminho', 'todos juntos, em rodadas de boato', 'cada um sozinho, com o Dijkstra'],
            ['depois de uma queda', 'várias rodadas; pode contar ao infinito', 'uma inundação e um Dijkstra'],
            ['custo', 'pouca memória e pouca conta', 'guarda o mapa inteiro e calcula tudo'],
            ['exemplos', 'RIP', 'OSPF e IS-IS'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um roteador recebe um LSP do Moinho com sequência 3, mas já tem guardado um LSP do Moinho com sequência 4. O que ele faz?',
      opcoes: ['Descarta a cópia, porque é mais velha do que a guardada', 'Troca a guardada pela recebida e repassa', 'Guarda as duas e roda o Dijkstra duas vezes', 'Repassa sem olhar, porque inundação manda tudo para todos'],
      certa: 0,
      explicacao: 'O número de sequência existe justamente para isso: só LSP mais novo entra no banco e segue na inundação. Cópia repetida ou velha morre ali, e a inundação termina.',
    },
  },
  desafio: {
    carta: [
      'A concessionária vai trocar a fibra entre a represa e a cooperativa amanhã cedo, bem no meio do período de chuva. O painel da Defesa Civil, no quartel dos bombeiros, lê o sensor da comporta (10.20.0.10) a cada minuto e não pode ficar cego.',
      'O anel da represa tem quatro roteadores, mas só a represa e o quartel rodam o OSPF. A cooperativa e a escola, que ficam no meio do caminho, nunca foram configuradas: os custos estão anotados nas portas e só.',
      'Objetivo: OSPF ligado nos quatro roteadores, o trecho represa-cooperativa derrubado para a troca, e o painel alcançando a comporta pelo lado da escola, com traceroute e quatro pings sem perda.',
    ],
    dicas: [
      'Sem OSPF na cooperativa e na escola, a represa e o quartel não têm caminho nenhum entre si: os HELLOs morrem no meio.',
      'Ligue o OSPF na cooperativa e na escola, e derrube a porta "coop" da represa.',
      'Depois da queda, o traceroute do painel até 10.20.0.10 precisa passar pela escola (10.255.13.2).',
    ],
    montar: mundoAnelRepresa,
    objetivo: (m) => [
      item('OSPF ligado nos quatro roteadores do anel', ['represa', 'cooperativa', 'quartel', 'escola'].every((n) => ospfLigado(m, n)), ['represa', 'cooperativa', 'quartel', 'escola'].filter((n) => !ospfLigado(m, n)).join(', ') ? `faltam: ${['represa', 'cooperativa', 'quartel', 'escola'].filter((n) => !ospfLigado(m, n)).join(', ')}` : undefined),
      item('trecho represa-cooperativa derrubado para a troca', derrubado(m, 'represa:coop', 'cooperativa:represa')),
      traceOk(m, 'defesa-civil', '10.20.0.10', '10.255.13.2', 'escola'),
      pingOk(m, 'defesa-civil', '10.20.0.10', 4),
    ],
    solucao: [
      ['equip', 'cooperativa', 'rot-ospf', { estado: 'on' }],
      ['equip', 'escola', 'rot-ospf', { estado: 'on' }],
      ['equip', 'represa', 'rot-derrubar', { porta: 'coop' }],
      ['equip', 'defesa-civil', 'traceroute', { destino: '10.20.0.10' }],
      ['equip', 'defesa-civil', 'ping', { destino: '10.20.0.10', n: '4' }],
    ],
  },
};

/* ======================================================================
 * 83: Roteamento hierárquico (5.2.6)
 * ====================================================================== */

const d83: Pergunta[] = [
  numerica('1', 'Com as duas regiões montadas, quantas entradas tem a tabela hierárquica da Olaria?', 3, 0),
  numerica('2', 'Da Matriz até a Serraria, quanto o caminho hierárquico custa a mais que o ótimo?', 1, 0),
];
const d83D: Pergunta[] = [numerica('1', 'Com as regiões norte e leste, quanto custa, pela tabela hierárquica, o caminho da usina até a igreja?', 4, 0)];

const NORTE = ['escola', 'praca', 'igreja'];
const LESTE = ['represa', 'usina', 'cooperativa'];

const dia83: Dia = {
  numero: 83,
  ato: 4,
  titulo: 'Roteamento hierárquico',
  chamado: [
    'CHAMADO #0083',
    'A cidade cresceu e as tabelas de rotas cresceram junto. Por enquanto são seis roteadores, mas o plano diretor fala em um por quarteirão. O fornecedor dos roteadores, a Anel 8, avisou que a memória deles não aguenta "uma linha para cada roteador do universo".',
    'A solução combinada foi dividir a cidade em regiões. A Matriz já está na região centro e os três bairros do oeste já estão na região oeste. Faltam o mercado e a rodoviária.',
    'Objetivo: mercado e rodoviária na região centro, a tabela da Olaria encolhida para 3 entradas e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Regiões e tabelas menores',
    texto: [
      'No roteamento que vimos até aqui, cada roteador tem uma linha para cada outro roteador da rede. Com seis, são cinco linhas. Com mil, são 999, e cada mudança em qualquer canto da cidade obriga todo mundo a recalcular. Memória, processamento e banda gastos com o mapa crescem junto com a rede. Em algum momento não cabe mais.',
      'A saída é a mesma do correio: ninguém decora todas as ruas do país. Os roteadores são divididos em regiões. Cada roteador sabe os detalhes da própria região, com uma linha para cada vizinho de região, e das outras regiões sabe só uma coisa: por onde se chega até ela. A tabela hierárquica tem os roteadores da minha região, menos eu, mais uma linha por região que não é a minha. Na cidade com seis roteadores em duas regiões de três, são 2 + 1 = 3 linhas em vez de 5.',
      'Dá para empilhar mais níveis: regiões viram grupos, grupos viram zonas. Com 1000 roteadores numa hierarquia de três níveis, dez zonas de dez regiões de dez roteadores, cada tabela tem 9 + 9 + 9 = 27 linhas. A conta que equilibra tudo diz que o número ideal de níveis é cerca de ln N, com cerca de e vezes ln N linhas por roteador. Para 1000 roteadores, ln 1000 dá perto de 7 níveis e umas 19 linhas. Na prática ninguém usa tantos níveis, mas a lição fica: tabela cresce com o logaritmo, não com a rede.',
      'O preço é o caminho. Quem não conhece os detalhes de uma região manda tudo para a entrada mais perto dela, mesmo quando o destino fica do outro lado e outra entrada seria melhor. O pacote entra pela porta errada e anda a mais. Em geral é pouco, um salto ou dois, e a troca vale a pena: tabelas pequenas, recálculo só dentro da região e um problema num bairro que não balança a cidade inteira.',
    ],
  },
  dicas: [
    'Ponha o mercado e a rodoviária na região "centro", com "Pôr numa região". A Matriz já está lá.',
    'A tabela hierárquica tem os roteadores da própria região, menos ele mesmo, mais uma linha por região que não é a dele.',
    'Rode "Comparar plano com hierárquico" na Matriz e procure o destino que "anda a mais": compare a coluna ótimo com a hierárquico.',
  ],
  perguntas: d83,
  montar: mundoRegioes,
  objetivo: (m) => {
    const h = hierarquiaAgora(m);
    return [
      item('mercado na região centro', regiaoDe(m, 'mercado') === 'centro', regiaoDe(m, 'mercado')),
      item('rodoviária na região centro', regiaoDe(m, 'rodoviaria') === 'centro', regiaoDe(m, 'rodoviaria')),
      item('tabela hierárquica da Olaria com 3 entradas', h.tabelas.olaria?.hierarquico === 3, `agora: ${h.tabelas.olaria?.hierarquico ?? '?'}`),
      item('comparação plano e hierárquico feita', !!m.flags.hierarquia),
      ...todasRespondidas(m, d83),
    ];
  },
  posMorte: [
    'Com o mercado e a rodoviária soltos, cada um contava como uma região de um roteador só, e a Olaria ainda precisava de uma linha para cada um: 5 entradas, igual ao plano. Bastou juntar os três do centro numa região para a tabela da Olaria cair para 3: Moinho, Serraria e "região centro". O mesmo aconteceu em todos os seis roteadores.',
    'O custo apareceu na Matriz. Para ela, a região oeste é uma linha só, e a entrada mais perto do oeste é a Olaria, a um salto. Então tudo que vai para o oeste sai pela Olaria, inclusive o que vai para a Serraria, que fica do outro lado. O caminho ótimo era Matriz, rodoviária, Serraria, custo 2; o hierárquico foi Matriz, Olaria, Moinho, Serraria, custo 3. Um a mais, o preço de esquecer o detalhe.',
    'Na cidade real a mesma ideia aparece em vários lugares: as áreas do OSPF, os sistemas autônomos da internet, até os prefixos que agregam muitas redes numa linha só. Sempre a mesma troca: tabela menor, caminho às vezes um pouco maior.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'olaria'],
      acao: 'rot-hierarquia',
      instrucao: 'Na Olaria, compare o roteamento plano com o hierárquico, do jeito que está.',
      porque: 'O mercado e a rodoviária ainda não têm região: cada um conta como uma região de um roteador só.',
      conferir: (m) => (m.flags.hierarquia ? true : 'A comparação ainda não foi feita.'),
      feito: '5 entradas no plano e 5 no hierárquico: Moinho e Serraria (região oeste), mais centro, mercado e rodoviária como três regiões. Hierarquia pela metade não economiza nada.',
    }),
    passo({
      alvo: ['equip', 'mercado'],
      acao: 'rot-regiao',
      pedir: ['regiao'],
      exemplo: { regiao: 'centro' },
      instrucao: 'Ponha o mercado na região centro.',
      porque: 'O mercado só se liga à Matriz, que já está no centro. Região boa é feita de vizinhos.',
      conferir: (m) => (regiaoDe(m, 'mercado') === 'centro' ? true : `O mercado está na região "${regiaoDe(m, 'mercado')}". O nome precisa ser exatamente "centro", como o da Matriz.`),
      feito: 'O mercado entrou no centro. Uma região de dois, por enquanto.',
    }),
    passo({
      alvo: ['equip', 'rodoviaria'],
      acao: 'rot-regiao',
      pedir: ['regiao'],
      exemplo: { regiao: 'centro' },
      instrucao: 'Ponha a rodoviária na região centro também.',
      porque: 'Com os três do centro juntos, o resto da cidade passa a ver o centro como uma linha só.',
      conferir: (m) => (regiaoDe(m, 'rodoviaria') === 'centro' ? true : `A rodoviária está na região "${regiaoDe(m, 'rodoviaria')}". Use "centro".`),
      feito: 'Duas regiões na cidade: centro (Matriz, mercado, rodoviária) e oeste (Olaria, Moinho, Serraria).',
    }),
    passo({
      alvo: ['equip', 'olaria'],
      acao: 'rot-hierarquia',
      instrucao: 'Volte à Olaria e compare de novo.',
      porque: 'A Olaria continua sabendo os detalhes do oeste, mas agora o centro inteiro cabe numa linha.',
      feito: 'O plano continua com 5. O hierárquico caiu para 3.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '3' },
      instrucao: 'Quantas entradas tem a tabela hierárquica da Olaria agora?',
      porque: 'Roteadores da própria região, menos ela mesma, mais uma linha por região que não é a dela.',
      feito: '(3 - 1) + 1 = 3: Moinho, Serraria e a região centro.',
    }),
    passo({
      alvo: ['equip', 'matriz'],
      acao: 'rot-hierarquia',
      instrucao: 'Na Matriz, compare o plano com o hierárquico e procure quem anda a mais.',
      porque: 'Para a Matriz, o oeste é uma linha só, e a entrada mais perto do oeste é a Olaria, a um salto.',
      feito: 'A Serraria aparece marcada: ótimo 2 (pela rodoviária), hierárquico 3 (pela Olaria e pelo Moinho).',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '1' },
      instrucao: 'Da Matriz até a Serraria, quanto o caminho hierárquico custa a mais que o ótimo?',
      porque: 'A Matriz não sabe que a Serraria fica colada na rodoviária; sabe só que o oeste começa na Olaria.',
      feito: '3 - 2 = 1. É o pior caso desta cidade, e é pequeno: um salto a mais em troca de tabelas com 3 linhas em vez de 5.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Plano contra hierárquico',
        texto: ['No plano, uma linha por roteador. No hierárquico, uma linha por roteador da minha região e uma por região de fora.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Destino na tabela da Olaria', 'Plano', 'Hierárquico'],
          linhas: [
            ['moinho', 'via moinho', 'via moinho'],
            ['serraria', 'via moinho', 'via moinho'],
            ['matriz', 'via matriz', 'região centro: via matriz'],
            ['mercado', 'via matriz', '(coberto pela linha do centro)'],
            ['rodoviaria', 'via matriz', '(coberto pela linha do centro)'],
            ['total', '5 linhas', '3 linhas'],
          ],
        },
      },
      {
        titulo: 'As duas regiões da cidade',
        texto: ['Duas pontes entre as regiões: Matriz com Olaria e rodoviária com Serraria. Quem está do lado de cá só enxerga a ponte mais perto.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'me', rotulo: 'mercado', x: 80, y: 40 },
            { id: 'ma', rotulo: 'matriz', x: 220, y: 70 },
            { id: 'ro', rotulo: 'rodoviaria', x: 220, y: 190 },
            { id: 'ol', rotulo: 'olaria', x: 400, y: 70 },
            { id: 'mo', rotulo: 'moinho', x: 520, y: 130 },
            { id: 'se', rotulo: 'serraria', x: 400, y: 190 },
          ],
          ligacoes: [
            ['me', 'ma'],
            ['ma', 'ro'],
            ['ma', 'ol', 'ponte'],
            ['ro', 'se', 'ponte'],
            ['ol', 'mo'],
            ['mo', 'se'],
          ],
        },
      },
      {
        titulo: 'Quantos níveis',
        texto: ['Mais níveis, tabela menor. O equilíbrio fica perto de ln N níveis e de e vezes ln N linhas por roteador.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['1000 roteadores em', 'Linhas por tabela'],
          linhas: [
            ['um nível (plano)', '999'],
            ['dois níveis: 40 regiões de 25', '24 + 39 = 63'],
            ['três níveis: 10 zonas de 10 regiões de 10', '9 + 9 + 9 = 27'],
            ['ideal teórico: perto de 7 níveis (ln 1000)', 'perto de 19 (e vezes ln 1000)'],
          ],
        },
      },
      {
        titulo: 'O preço: entrar pela porta errada',
        texto: [
          'Quem só tem uma linha para a região inteira manda tudo para a entrada mais perto dela. Se o destino fica perto de outra entrada, o pacote atravessa a região por dentro.',
          'Na cidade, Matriz até Serraria: ótimo 2 pela rodoviária, hierárquico 3 pela Olaria e pelo Moinho.',
        ],
      },
    ],
    checagem: {
      pergunta: 'Uma rede tem 4 regiões de 5 roteadores cada. Quantas linhas tem a tabela hierárquica de cada roteador?',
      opcoes: ['7', '19', '4', '20'],
      certa: 0,
      explicacao: 'Os outros 4 da própria região (5 - 1) mais uma linha para cada uma das outras 3 regiões: 4 + 3 = 7. No plano seriam 19.',
    },
  },
  desafio: {
    carta: [
      'O anel norte ganhou seis roteadores numa tacada só: escola, praça, igreja, represa, usina e cooperativa, nessa ordem em volta do anel. O trecho entre a igreja e a represa sobe o morro e custa 2; o resto custa 1.',
      'A secretaria de obras decidiu: região norte para escola, praça e igreja; região leste para represa, usina e cooperativa. A usina, que manda o relatório diário para a igreja, quer saber quanto o caminho vai custar depois da mudança.',
      'Objetivo: as duas regiões montadas como a secretaria decidiu, todas as tabelas hierárquicas com 3 entradas e a pergunta respondida.',
    ],
    dicas: [
      'Use "Pôr numa região" em cada um dos seis roteadores: "norte" para escola, praça e igreja; "leste" para represa, usina e cooperativa.',
      'Na usina, compare o plano com o hierárquico. Para a usina, o norte começa na entrada mais perto, que não é a igreja.',
      'A entrada mais perto do norte, vista da usina, é a escola (cooperativa e escola, custo 2). Dali até a igreja, por dentro do norte, são mais 2.',
    ],
    perguntas: d83D,
    respostas: { '1': '4' },
    montar: mundoRegioesNorte,
    objetivo: (m) => {
      const h = hierarquiaAgora(m);
      const mesma = (ns: string[]) => ns.every((n) => regiaoDe(m, n) === regiaoDe(m, ns[0]!));
      const ok = mesma(NORTE) && mesma(LESTE) && regiaoDe(m, NORTE[0]!) !== regiaoDe(m, LESTE[0]!);
      const maiores = Object.entries(h.tabelas).filter(([, t]) => t.hierarquico > 3).map(([n]) => n);
      return [
        item('escola, praça e igreja numa região; represa, usina e cooperativa em outra', ok, [...NORTE, ...LESTE].map((n) => `${n}: ${regiaoDe(m, n)}`).join(', ')),
        item('todas as tabelas hierárquicas com no máximo 3 entradas', maiores.length === 0, maiores.length ? `ainda maiores: ${maiores.join(', ')}` : undefined),
        ...todasRespondidas(m, d83D),
      ];
    },
    solucao: [
      ['equip', 'escola', 'rot-regiao', { regiao: 'norte' }],
      ['equip', 'praca', 'rot-regiao', { regiao: 'norte' }],
      ['equip', 'igreja', 'rot-regiao', { regiao: 'norte' }],
      ['equip', 'represa', 'rot-regiao', { regiao: 'leste' }],
      ['equip', 'usina', 'rot-regiao', { regiao: 'leste' }],
      ['equip', 'cooperativa', 'rot-regiao', { regiao: 'leste' }],
      ['equip', 'usina', 'rot-hierarquia'],
    ],
  },
};

/* ======================================================================
 * 84: Um para todos, um para alguns (5.2.7 a 5.2.9)
 * ====================================================================== */

const GRUPO_RADIO = '239.8.8.8';
const d84: Pergunta[] = [numerica('1', 'Com a escola e o hospital no grupo, quantas cópias de cada pacote da rádio trafegam nos enlaces?', 3, 0)];
const d84D: Pergunta[] = [numerica('1', 'Com a escola, a cooperativa e a biblioteca no grupo, quantas cópias de cada pacote da rádio trafegam nos enlaces?', 4, 0)];

const dia84: Dia = {
  numero: 84,
  ato: 4,
  titulo: 'Um para todos, um para alguns',
  chamado: [
    'CHAMADO #0084',
    'A Rádio Fim de Linha FM quer transmitir pela rede. O primeiro programa é a aula de música da escola, e o hospital pediu para pôr o som na sala de espera. O diretor da rádio sugeriu "mandar para todo mundo, que é mais fácil"; a cooperativa e a biblioteca, que não pediram nada, já reclamaram da ideia.',
    'No mesmo prédio da rádio fica uma cópia do servidor de nomes da cidade, 10.53.0.53. A outra cópia, com o mesmo endereço, fica no bairro oeste.',
    'Objetivo: comparar os jeitos de difusão a partir do estúdio, pôr a escola e o hospital no grupo 239.8.8.8, montar a árvore multicast, responder a pergunta e descobrir qual cópia do servidor de nomes atende o bairro leste.',
  ],
  manual: {
    titulo: 'Difusão, multicast e anycast',
    texto: [
      'Até aqui, todo pacote ia de um para um (unicast). Às vezes a origem quer falar com todos (difusão, ou broadcast). O jeito ingênuo é mandar uma cópia separada para cada destino: funciona, mas a origem precisa saber a lista de todos e o mesmo enlace carrega a mesma coisa várias vezes. A inundação resolve sem lista, mas gasta cópias de sobra, e sem controle num grafo com laço nunca para.',
      'O encaminhamento por caminho reverso (RPF) é um truque elegante: quando chega um pacote de difusão, o roteador olha por qual enlace ele veio. Se é o enlace que o próprio roteador usaria para mandar algo à origem, é provável que seja a primeira cópia, pelo caminho bom: ele repassa por todos os outros enlaces. Se veio por outro enlace, é cópia repetida: descarta. Não precisa guardar número de sequência de ninguém. Melhor ainda é a árvore de difusão: uma árvore que alcança todos a partir da origem (a de caminhos mais curtos serve), em que cada roteador recebe exatamente uma cópia. Com N roteadores, são N - 1 cópias, o mínimo possível.',
      'Multicast é falar com alguns: os membros de um grupo, identificado por um endereço de 224.0.0.0 a 239.255.255.255. Quem quer ouvir avisa o roteador da própria rede pelo IGMP. O roteador da origem parte da árvore de difusão e poda os galhos que não levam a nenhum membro. Pode haver uma árvore por origem (ótima para cada transmissor, mas cada roteador guarda uma árvore por origem e por grupo) ou uma árvore só por grupo, com raiz num roteador de núcleo: quem transmite manda ao núcleo, e o núcleo distribui pela árvore compartilhada. Gasta menos memória e às vezes faz o pacote dar uma volta.',
      'Anycast é falar com qualquer um: o mesmo endereço existe em vários lugares, e o roteamento comum leva cada pacote ao mais perto. Ninguém configura nada além das rotas, porque para o roteamento são só dois caminhos para o mesmo destino, e vence o mais curto. É assim que servidores de nomes espalhados pelo mundo respondem pelo mesmo endereço: quem está perto de um cai nele, e se um cair, o roteamento leva ao próximo.',
    ],
  },
  dicas: [
    'Comece pelo estúdio: "Comparar jeitos de difusão" mostra a inundação, o caminho reverso e a árvore lado a lado.',
    'O grupo é 239.8.8.8. Cada PC entra no grupo com "Entrar ou sair de grupo multicast"; depois, no estúdio, monte a árvore multicast.',
    'Conte os enlaces da árvore depois da poda: estúdio até o centro, centro até o norte, norte até o leste. Para o anycast, use o roteador leste.',
  ],
  perguntas: d84,
  montar: mundoRadio,
  objetivo: (m) => [
    item('difusão comparada a partir do estúdio', m.flags.difusao?.origem === 'estudio'),
    item('escola e hospital no grupo 239.8.8.8', grupos(m, 'escola').includes(GRUPO_RADIO) && grupos(m, 'hospital').includes(GRUPO_RADIO)),
    multicastAtual(m, GRUPO_RADIO, 'estudio', ['norte', 'leste']),
    ...todasRespondidas(m, d84),
    item('anycast do leste para 10.53.0.53 resolvido', m.flags.anycast?.['leste>10.53.0.53'] === 'oeste', m.flags.anycast?.['leste>10.53.0.53'] ? `escolhido: ${m.flags.anycast['leste>10.53.0.53']}` : 'ainda não foi feito'),
  ],
  posMorte: [
    'Para alcançar os 5 outros roteadores a partir do estúdio, cópias separadas custariam 11 transmissões (1 + 2 + 2 + 3 + 3, uma por enlace de cada caminho). A inundação com número de sequência gastou 9, das quais 4 foram descartadas por serem repetidas, e o caminho reverso também 9, com 4 descartadas, sem precisar lembrar sequência nenhuma. A árvore de difusão gastou 5, uma por roteador. Sem controle, a inundação passa de 140 cópias em 10 saltos e não para nunca.',
    'Depois que a escola e o hospital avisaram pelo IGMP que queriam ouvir, o estúdio partiu da árvore de difusão e podou os galhos sem ninguém: centro até o sul e norte até o oeste. Sobraram 3 enlaces, 3 cópias por pacote, e a cooperativa e a biblioteca ficaram em paz. Se alguém da cooperativa entrar no grupo amanhã, o galho do sul volta sozinho.',
    'O servidor de nomes em dois lugares com o mesmo endereço é anycast. Do leste, a cópia do oeste fica a 2 e a do prédio da rádio a 3: vence o oeste. Do centro, vence a do prédio da rádio. Nenhuma configuração especial, só roteamento escolhendo o caminho mais curto até um destino que por acaso existe duas vezes.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'estudio'],
      acao: 'rot-difusao',
      instrucao: 'No estúdio, compare os jeitos de mandar um pacote para todos os roteadores.',
      porque: 'A rede tem laços (centro, norte, sul, leste e oeste se cruzam), e é aí que a difusão se complica: um mesmo roteador recebe o pacote por mais de um caminho.',
      conferir: (m) => (m.flags.difusao?.origem === 'estudio' ? true : 'A comparação ainda não foi feita no estúdio.'),
      feito: 'Inundação com sequência: 9 cópias. Caminho reverso: 9 cópias, 4 descartadas. Árvore de difusão: 5 cópias, uma para cada um dos 5 roteadores.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque chegaram por um enlace que não é o que o próprio roteador usaria para mandar algo de volta ao estúdio',
          'Porque o contador de saltos chegou a zero',
          'Porque o roteador já tinha visto aquele número de sequência',
          'Porque nenhum PC daquele bairro pediu a transmissão',
        ],
        certa: 0,
        errada: {
          1: 'O caminho reverso não usa contador de saltos. Ele só olha por onde o pacote entrou.',
          2: 'Isso é a inundação com número de sequência. A graça do caminho reverso é não precisar guardar sequência de ninguém.',
          3: 'Na difusão todo mundo recebe, quer tenha pedido ou não. Escolher quem recebe é o multicast, que vem já.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'No caminho reverso, por que 4 cópias foram descartadas?',
      porque: 'Cada roteador sabe, pela própria tabela, por qual enlace manda pacotes ao estúdio. A cópia que chega por ali veio pelo caminho mais curto; as outras vieram dando volta.',
      feito: 'Só a cópia que chega pelo enlace de volta à origem segue adiante. As outras morrem ali, e a inundação termina sozinha.',
    }),
    passo({
      alvo: ['equip', 'escola'],
      acao: 'grupo',
      valores: { acao: 'entrar' },
      pedir: ['grupo'],
      exemplo: { grupo: GRUPO_RADIO },
      instrucao: 'Na escola, entre no grupo da rádio, 239.8.8.8.',
      porque: 'O PC manda um relatório IGMP para o roteador da rede dele, o norte. É assim que o roteador fica sabendo que tem alguém querendo ouvir aquele grupo.',
      conferir: (m) => (grupos(m, 'escola').includes(GRUPO_RADIO) ? true : `A escola não está no grupo ${GRUPO_RADIO}. Confira o endereço: ${grupos(m, 'escola').join(', ') || 'nenhum grupo'}.`),
      feito: 'O roteador norte anotou: na porta da escola, alguém ouve 239.8.8.8.',
    }),
    passo({
      alvo: ['equip', 'hospital'],
      acao: 'grupo',
      valores: { acao: 'entrar', grupo: GRUPO_RADIO },
      instrucao: 'No hospital, entre no mesmo grupo.',
      porque: 'O hospital fica atrás do roteador leste. Mais um roteador com membro, mais um galho que a árvore precisa manter.',
      conferir: (m) => (grupos(m, 'hospital').includes(GRUPO_RADIO) ? true : 'O hospital ainda não está no grupo.'),
      feito: 'Norte e leste têm membros. Sul e oeste, ninguém.',
    }),
    passo({
      alvo: ['equip', 'estudio'],
      acao: 'rot-multicast',
      pedir: ['grupo'],
      exemplo: { grupo: GRUPO_RADIO },
      instrucao: 'No estúdio, monte a árvore multicast do grupo 239.8.8.8.',
      porque: 'O estúdio parte da árvore de difusão e poda os galhos que não levam a nenhum roteador com membro.',
      conferir: (m) => multicastAtual(m, GRUPO_RADIO, 'estudio', ['norte', 'leste']).ok || 'A árvore precisa ser do grupo 239.8.8.8, com a escola e o hospital já no grupo.',
      feito: 'Árvore podada: estúdio até o centro, centro até o norte, norte até o leste. Galhos cortados: centro até o sul e norte até o oeste.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '3' },
      instrucao: 'Quantas cópias de cada pacote da rádio trafegam nos enlaces agora?',
      porque: 'Na árvore, cada enlace carrega uma cópia. Conte os enlaces que sobraram depois da poda.',
      feito: '3 cópias, contra 5 da difusão para todos e 11 de cópias separadas para cada bairro.',
    }),
    passo({
      alvo: ['equip', 'leste'],
      acao: 'rot-anycast',
      valores: { destino: '10.53.0.53' },
      instrucao: 'No roteador leste, descubra qual cópia do servidor de nomes (10.53.0.53) fica mais perto.',
      porque: 'O mesmo endereço existe atrás do estúdio e atrás do oeste. Para o roteamento, são dois caminhos para o mesmo destino, e vence o mais curto.',
      conferir: (m) => (m.flags.anycast?.['leste>10.53.0.53'] ? true : 'O anycast ainda não foi consultado no leste.'),
      feito: 'Atrás do oeste, custo 2; atrás do estúdio, custo 3. O leste é atendido pelo oeste, sem ninguém configurar nada.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quatro jeitos de falar com todos',
        texto: ['A partir do estúdio, para alcançar os 5 outros roteadores da cidade:'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Jeito', 'Cópias nos enlaces', 'O que precisa'],
          linhas: [
            ['uma cópia separada para cada um', '11 (1 + 2 + 2 + 3 + 3)', 'a lista de todos os destinos'],
            ['inundação com sequência', '9, com 4 descartadas', 'lembrar a sequência de cada origem'],
            ['caminho reverso (RPF)', '9, com 4 descartadas', 'só a própria tabela de rotas'],
            ['árvore de difusão', '5, uma por roteador', 'conhecer a árvore'],
          ],
        },
      },
      {
        titulo: 'A árvore da rádio',
        texto: ['A árvore de difusão parte do estúdio e chega em todos. O multicast poda o que não leva a nenhum membro.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'es', rotulo: 'estudio', x: 70, y: 120 },
            { id: 'ce', rotulo: 'centro', x: 200, y: 120 },
            { id: 'no', rotulo: 'norte (escola)', x: 340, y: 50 },
            { id: 'su', rotulo: 'sul', x: 340, y: 190 },
            { id: 'le', rotulo: 'leste (hospital)', x: 500, y: 50 },
            { id: 'oe', rotulo: 'oeste', x: 500, y: 190 },
          ],
          ligacoes: [
            ['es', 'ce', 'fica'],
            ['ce', 'no', 'fica'],
            ['no', 'le', 'fica'],
            ['ce', 'su', 'podado'],
            ['no', 'oe', 'podado'],
          ],
        },
      },
      {
        titulo: 'Multicast: entrar no grupo',
        texto: [
          'Grupo é um endereço de 224.0.0.0 a 239.255.255.255. O PC avisa o roteador da rede dele pelo IGMP; o roteador pergunta de tempos em tempos quem ainda ouve e, se ninguém responde, poda o galho.',
          'Árvore por origem: ótima para cada transmissor, mas uma por origem e por grupo. Árvore com núcleo: uma só por grupo, com raiz num roteador escolhido; quem transmite manda para o núcleo.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['PC: "quero ouvir 239.8.8.8" (relatório IGMP)', 'roteador do bairro: anota o grupo naquela porta', 'árvore: o galho até esse roteador fica', 'origem: uma cópia por enlace da árvore'],
          rotulo: 'do pedido do PC até o pacote chegar',
        },
      },
      {
        titulo: 'Anycast: o mais perto atende',
        texto: ['O mesmo endereço em vários lugares. Cada roteador manda para a cópia mais perto dele, e se uma cair, o roteamento acha a outra.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Pergunta feita no', 'Cópia do estúdio', 'Cópia do oeste', 'Atende'],
          linhas: [
            ['centro', 'custo 1', 'custo 2', 'estúdio'],
            ['norte', 'custo 2', 'custo 1', 'oeste'],
            ['sul', 'custo 2', 'custo 1', 'oeste'],
            ['leste', 'custo 3', 'custo 2', 'oeste'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um roteador usa o enlace A para mandar pacotes à origem de uma difusão. Chega uma cópia da difusão pelo enlace B. No caminho reverso, o que ele faz?',
      opcoes: ['Descarta, porque não chegou pelo enlace que leva de volta à origem', 'Repassa por todos os enlaces, menos o B', 'Devolve pelo enlace B', 'Guarda e espera a cópia do enlace A para comparar'],
      certa: 0,
      explicacao: 'Só a cópia que chega pelo enlace que o roteador usaria para alcançar a origem é aceita e repassada. A que chega pelo B veio dando volta e é descartada.',
    },
  },
  desafio: {
    carta: [
      'A aula de música da escola virou sucesso e a grade da rádio mudou. A cooperativa e a biblioteca agora querem o programa do meio-dia; o hospital desistiu, porque a sala de espera prefere silêncio.',
      'De quebra, a cópia do servidor de nomes do bairro oeste vai para manutenção: a porta "dns" do roteador oeste precisa cair. A escola, no bairro norte, não pode ficar sem resolver nomes.',
      'Objetivo: o hospital fora do grupo 239.8.8.8, a cooperativa e a biblioteca dentro, a árvore multicast refeita no estúdio, a pergunta respondida, a porta dns do oeste derrubada e o anycast do norte mostrando qual cópia atende agora.',
    ],
    dicas: [
      'O hospital sai do grupo e a cooperativa e a biblioteca entram, cada um com "Entrar ou sair de grupo multicast". Depois monte a árvore de novo no estúdio.',
      'Com membros no norte, no sul e no oeste, só o galho do leste é podado.',
      'Derrube a porta "dns" do oeste e consulte o anycast de 10.53.0.53 no roteador norte: sobra a cópia do estúdio.',
    ],
    perguntas: d84D,
    respostas: { '1': '4' },
    montar: () => {
      const m = mundoRadio();
      for (const n of ['escola', 'hospital']) m.equipamentos.get(n)!.s.grupos = [GRUPO_RADIO];
      return m;
    },
    objetivo: (m) => [
      item('hospital fora do grupo; cooperativa e biblioteca dentro', !grupos(m, 'hospital').includes(GRUPO_RADIO) && grupos(m, 'cooperativa').includes(GRUPO_RADIO) && grupos(m, 'biblioteca').includes(GRUPO_RADIO)),
      multicastAtual(m, GRUPO_RADIO, 'estudio', ['norte', 'sul', 'oeste']),
      ...todasRespondidas(m, d84D),
      item('porta dns do oeste derrubada para a manutenção', derrubado(m, 'oeste:dns', 'oeste:dns')),
      item('anycast do norte para 10.53.0.53 caindo na cópia do estúdio', m.flags.anycast?.['norte>10.53.0.53'] === 'estudio', m.flags.anycast?.['norte>10.53.0.53'] ? `escolhido: ${m.flags.anycast['norte>10.53.0.53']}` : 'ainda não foi feito'),
    ],
    solucao: [
      ['equip', 'hospital', 'grupo', { acao: 'sair', grupo: GRUPO_RADIO }],
      ['equip', 'cooperativa', 'grupo', { acao: 'entrar', grupo: GRUPO_RADIO }],
      ['equip', 'biblioteca', 'grupo', { acao: 'entrar', grupo: GRUPO_RADIO }],
      ['equip', 'estudio', 'rot-multicast', { grupo: GRUPO_RADIO }],
      ['equip', 'oeste', 'rot-derrubar', { porta: 'dns' }],
      ['equip', 'norte', 'rot-anycast', { destino: '10.53.0.53' }],
    ],
  },
};

export const ATO4E: Dia[] = [dia82, dia83, dia84];
