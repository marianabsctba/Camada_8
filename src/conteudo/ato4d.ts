// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// O anel de fibra que liga os bairros: o caminho mais curto e a árvore de escoamento (5.2.1 e 5.2.2),
// inundação (5.2.3) e vetor de distância com a contagem ao infinito (5.2.4).

import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { configRip, grafoDoMundo, rodarRip } from '../motor/protocolos';
import { dijkstra, caminhoAte } from '../motor/rotear';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Nome curto da porta que aponta para um vizinho: "r-escola" vira "escola". */
const curto = (n: string) => n.replace(/^r-/, '');

type Lig = [string, string, number];

/**
 * Uma malha de roteadores ligados por enlaces ponto a ponto (/30). Cada porta tem o nome do vizinho e o custo
 * dado, nos dois sentidos, guardado como custo OSPF da interface (o OSPF fica desligado: só o mapa importa).
 */
function malha(semente: number, rede: number, nos: string[], ligs: Lig[], modelo: string): Mundo {
  const m = novoMundo(semente);
  m.flags.camadaRede = true;
  const ifs: Record<string, Record<string, string>> = Object.fromEntries(nos.map((n) => [n, {}]));
  const custos: Record<string, Record<string, number>> = Object.fromEntries(nos.map((n) => [n, {}]));
  ligs.forEach(([a, b, c], i) => {
    ifs[a]![curto(b)] = `10.${rede}.${i + 1}.1/30`;
    ifs[b]![curto(a)] = `10.${rede}.${i + 1}.2/30`;
    custos[a]![curto(b)] = c;
    custos[b]![curto(a)] = c;
  });
  for (const n of nos) {
    adicionar(m, roteador(n, { modelo, interfaces: ifs[n] }));
    m.equipamentos.get(n)!.s.ospf = { ligado: false, custos: custos[n], areas: {} };
  }
  ligs.forEach(([a, b], i) => ligar(m, { equip: a, porta: curto(b) }, { equip: b, porta: curto(a) }, 'cat6', 90, { id: `c${i + 1}` }));
  m.proxCabo = ligs.length + 1;
  return m;
}

const custoPorta = (m: Mundo, r: string, porta: string): number | undefined => (m.equipamentos.get(r)!.s.ospf?.custos?.[porta] as number | undefined);

const derrubou = (m: Mundo, ...portas: string[]) => ((m.flags.derrubadas ?? []) as string[]).some((x) => portas.includes(x));

/** Métrica RIP que o roteador acredita ter até o destino (16 se não sabe). */
const metricaRip = (m: Mundo, r: string, destino: string): number => (m.flags.rip?.metricas?.[r]?.[destino] as number | undefined) ?? 16;

/* ======================================================================
 * ref 79: O caminho mais curto (5.2.1 e 5.2.2)
 * ====================================================================== */

const NOS79 = ['r-dc', 'r-escola', 'r-praca', 'r-coop', 'r-hosp', 'r-represa'];
const LIG79: Lig[] = [
  ['r-dc', 'r-escola', 2],
  ['r-dc', 'r-praca', 3],
  ['r-escola', 'r-praca', 2],
  ['r-escola', 'r-coop', 6],
  ['r-praca', 'r-coop', 3],
  ['r-praca', 'r-hosp', 7],
  ['r-coop', 'r-hosp', 1],
  ['r-coop', 'r-represa', 4],
  ['r-hosp', 'r-represa', 2],
];

const NOS79D = ['r-dc', 'r-norte', 'r-mercado', 'r-igreja', 'r-posto'];
const LIG79D: Lig[] = [
  ['r-dc', 'r-norte', 1],
  ['r-dc', 'r-mercado', 4],
  ['r-norte', 'r-mercado', 2],
  ['r-norte', 'r-igreja', 5],
  ['r-mercado', 'r-posto', 6],
  ['r-igreja', 'r-posto', 1],
  ['r-mercado', 'r-igreja', 1],
];

const d79: Pergunta[] = [numerica('1', 'Qual é o custo do caminho mais curto do r-dc até o r-represa?', 9, 0)];
const d79D: Pergunta[] = [numerica('1', 'Com o trecho r-mercado e r-igreja a custo 10, qual é o custo do caminho mais curto do r-dc até o r-posto?', 7, 0)];

const dia79: Dia = {
  numero: 79,
  ato: 4,
  titulo: 'O caminho mais curto',
  chamado: [
    'CHAMADO #0079',
    'O anel norte ficou pronto: seis roteadores, do data center à represa, ligados por trechos de comprimento e qualidade diferentes. Cada trecho ganhou um custo no projeto, e a prefeitura quer saber por onde o tráfego do data center vai passar até cada bairro.',
    'O técnico de plantão não confia em máquina que ele nunca viu errar, então quer conferir o cálculo passo a passo antes de ligar qualquer protocolo.',
    'Objetivo: o Dijkstra rodado no r-dc, a árvore de escoamento até o r-dc montada e a pergunta do custo respondida.',
  ],
  manual: {
    titulo: 'O caminho mais curto',
    texto: [
      'Roteamento é escolher, para cada destino, por qual enlace o pacote sai. Para escolher, a rede vira um grafo: cada roteador é um nó, cada enlace é uma aresta com um número, a métrica. O melhor caminho é o de menor soma. A métrica pode ser o número de saltos (cada enlace vale 1), a distância em quilômetros, o atraso medido, a largura de banda ou um custo inventado por quem projeta a rede para dizer "prefiro não passar por aqui". Neste anel, cada trecho já tem o custo do projeto.',
      'O princípio de otimização diz: se o caminho ótimo de I até K passa por J, então o pedaço de J até K também é o caminho ótimo de J até K. Se houvesse um atalho melhor de J a K, o caminho de I usaria esse atalho. Consequência direta: juntando os caminhos ótimos de todos os roteadores até um mesmo destino, sai uma árvore, sem laço nenhum. É a árvore de escoamento, e cada roteador só precisa guardar o primeiro galho dela: o próximo salto.',
      'O algoritmo de Dijkstra acha esses caminhos a partir de uma origem. Todo nó começa com rótulo provisório infinito, menos a origem, que é permanente com 0. A cada passo, o nó provisório de menor rótulo vira permanente, e os vizinhos dele são conferidos: se chegar a um vizinho passando por ele custa menos que o rótulo atual, o rótulo troca, anotando por quem veio. Quando todo mundo é permanente, acabou: cada rótulo é a menor distância, e seguindo os "por quem veio" de trás para frente sai o caminho.',
      'O segredo está na escolha: o menor provisório pode virar permanente porque qualquer outro caminho até ele teria de passar por um provisório maior, e com custos positivos nada fica mais barato depois. Por isso o Dijkstra não aceita custo negativo, e por isso o rótulo de um nó pode melhorar várias vezes enquanto ele é provisório, mas nunca depois.',
      'No laboratório, o comando de Dijkstra usa o custo de cada porta (o mesmo campo que o OSPF usa) e mostra os rótulos depois de cada passo. Rode, compare com a sua previsão e desconfie de quem acerta sem fazer a conta.',
    ],
  },
  dicas: [
    'Comece pelo r-dc com 0. Os vizinhos dele ganham rótulo provisório: r-escola com 2 e r-praca com 3.',
    'A cada passo, vira permanente o provisório de menor rótulo. Depois confira se passar por ele melhora algum vizinho.',
    'No r-dc, rode o Dijkstra até o r-hosp e leia o custo do r-represa no resultado. Depois peça a árvore de escoamento com destino r-dc.',
  ],
  perguntas: d79,
  montar: () => malha(479, 79, NOS79, LIG79, 'Roteador Anel 6 (anel norte)'),
  objetivo: (m) => {
    const dj = m.flags.dijkstra as { origem: string } | undefined;
    const ar = m.flags.arvore as { destino: string } | undefined;
    return [
      item('Dijkstra rodado a partir do r-dc', dj?.origem === 'r-dc', dj ? `último a partir de ${dj.origem}` : 'ainda não foi rodado'),
      item('árvore de escoamento até o r-dc', ar?.destino === 'r-dc', ar ? `última até ${ar.destino}` : 'ainda não foi montada'),
      ...todasRespondidas(m, d79),
    ];
  },
  posMorte: [
    'O Dijkstra fez seis escolhas, uma por roteador: r-dc com 0, r-escola com 2, r-praca com 3, r-coop com 6, r-hosp com 7 e r-represa com 9. Três rótulos melhoraram no meio do caminho: o r-coop começou com 8 pelo r-escola e caiu para 6 pelo r-praca; o r-hosp foi de 10 para 7; o r-represa, de 10 para 9. Ninguém mexeu num rótulo permanente.',
    'A árvore de escoamento até o r-dc ficou assim: r-escola e r-praca entregam direto ao r-dc, o r-coop entrega ao r-praca, o r-hosp ao r-coop e o r-represa ao r-hosp. O trecho r-escola até o r-coop, de custo 6, e o r-praca até o r-hosp, de custo 7, não fazem parte da árvore: estão lá como reserva, para o dia em que algum trecho cair.',
    'Repare no princípio de otimização trabalhando: o caminho do r-represa (r-hosp, r-coop, r-praca, r-dc) contém o do r-hosp, que contém o do r-coop. Ninguém precisa decorar caminhos inteiros. Cada roteador guarda só o próximo salto, e o resto do caminho é problema do vizinho, que também escolheu o melhor.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['r-escola, com 2', 'r-praca, com 3', 'Os dois juntos, porque são vizinhos do r-dc', 'r-represa, o mais longe, para resolver o difícil primeiro'],
        certa: 0,
        errada: {
          1: 'O 3 do r-praca é provisório e maior que o 2 do r-escola. Pode ser que passando pelo r-escola o r-praca fique mais barato; ainda não dá para fechar.',
          2: 'Um por vez: só o menor provisório tem a garantia de que nada vai melhorar o rótulo dele.',
          3: 'O r-represa ainda está com infinito. O Dijkstra cresce de perto para longe, nunca ao contrário.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O Dijkstra começa no r-dc, permanente com 0. Os vizinhos ganham rótulos provisórios: r-escola com 2 e r-praca com 3. Quem vira permanente agora?',
      porque: 'Vira permanente o provisório de menor rótulo. Qualquer outro caminho até ele passaria por alguém com rótulo maior, e somando custos positivos não dá para chegar mais barato.',
      feito: 'r-escola, com 2. Agora o r-escola confere os vizinhos: o r-coop ganha 2 + 6 = 8, e o r-praca continuaria com 3, porque 2 + 2 = 4 não melhora.',
    }),
    passo({
      escolha: {
        opcoes: ['r-praca, com 3', 'r-coop, com 8', 'r-hosp, porque é o destino que importa'],
        certa: 0,
        errada: {
          1: 'O 8 do r-coop ainda é provisório e maior que o 3 do r-praca. E vai melhorar: pelo r-praca dá 3 + 3 = 6.',
          2: 'O r-hosp ainda está com infinito: nenhum permanente é vizinho dele.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Com r-dc e r-escola permanentes, os provisórios são r-praca com 3 e r-coop com 8. Quem é o próximo permanente?',
      porque: 'A regra não muda: o menor provisório. Quem tem rótulo grande ainda pode ser salvo por um caminho que ninguém olhou.',
      feito: 'r-praca, com 3. E ele melhora dois vizinhos: o r-coop cai de 8 para 6, e o r-hosp sai do infinito para 10.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-dijkstra',
      valores: { destino: 'r-hosp' },
      instrucao: 'Agora rode o Dijkstra no r-dc até o r-hosp e confira as suas previsões.',
      porque: 'O comando mostra os rótulos provisórios depois de cada passo, com quem virou permanente e quem melhorou.',
      conferir: (m) => (m.flags.dijkstra?.origem === 'r-dc' ? true : 'O Dijkstra precisa ser rodado a partir do r-dc.'),
      feito: 'Seis passos: r-dc 0, r-escola 2, r-praca 3, r-coop 6, r-hosp 7 e r-represa 9. Até o r-hosp: r-dc, r-praca, r-coop, r-hosp, custo 7. Na tabela do r-dc vai só o primeiro salto, r-praca.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '9' },
      instrucao: 'Qual é o custo do caminho mais curto do r-dc até o r-represa?',
      porque: 'O r-represa começou com 10 pelo r-coop (6 + 4) e melhorou quando o r-hosp virou permanente (7 + 2).',
      feito: '9, por r-praca, r-coop e r-hosp. O trecho direto r-coop e r-represa, de custo 4, perdeu para a volta por r-hosp, que soma 1 + 2 = 3.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-arvore',
      valores: { destino: 'r-dc' },
      instrucao: 'Monte a árvore de escoamento com destino r-dc: o melhor caminho de cada roteador até o data center.',
      porque: 'O Dijkstra olha de uma origem para todos. A árvore de escoamento olha de todos para um destino, que é o que cada roteador precisa saber para encaminhar.',
      conferir: (m) => (m.flags.arvore?.destino === 'r-dc' ? true : 'A árvore precisa ter o r-dc como destino.'),
      feito: 'Cada roteador aponta para um vizinho só, e nenhum caminho forma laço: r-escola e r-praca vão direto ao r-dc, r-coop vai ao r-praca, r-hosp ao r-coop, r-represa ao r-hosp.',
    }),
    passo({
      escolha: {
        opcoes: ['r-hosp', 'r-coop', 'r-dc direto'],
        certa: 0,
        errada: {
          1: 'Pelo r-coop dá 4 + 6 = 10. Pelo r-hosp, 2 + 7 = 9. Vence o menor.',
          2: 'Não existe trecho do r-represa ao r-dc. O próximo salto tem de ser um vizinho.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Na árvore até o r-dc, para qual vizinho o r-represa entrega o pacote?',
      porque: 'O próximo salto é o vizinho que minimiza o custo do trecho até ele mais o custo dele até o destino.',
      feito: 'r-hosp. O r-represa não sabe o caminho inteiro e nem precisa: confia que o r-hosp também escolheu o melhor dele.',
    }),
    passo({
      escolha: {
        opcoes: ['r-coop, r-praca, r-dc: o pedaço que já estava no caminho do r-represa', 'r-coop, r-escola, r-dc', 'Não dá para saber sem rodar outro Dijkstra a partir do r-coop'],
        certa: 0,
        errada: {
          1: 'Pelo r-escola dá 6 + 2 = 8, contra 3 + 3 = 6 pelo r-praca.',
          2: 'Dá para saber, sim: é o princípio de otimização. Um trecho de caminho ótimo é ótimo também para quem está no meio dele.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O caminho ótimo do r-represa até o r-dc passa por r-hosp, r-coop e r-praca. Qual é o caminho ótimo do r-coop até o r-dc?',
      porque: 'Se o r-coop tivesse um caminho melhor até o r-dc, o r-represa usaria esse caminho também, e o dele não seria ótimo.',
      feito: 'O mesmo pedaço. É por isso que os caminhos ótimos até um destino formam uma árvore e que cada roteador só guarda o próximo salto.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'A rede vira um grafo',
        texto: ['Roteadores são nós, enlaces são arestas, e cada aresta tem um custo. O melhor caminho é o de menor soma, não o de menos trechos.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'dc', rotulo: 'r-dc', x: 60, y: 120 },
            { id: 'es', rotulo: 'r-escola', x: 200, y: 40 },
            { id: 'pr', rotulo: 'r-praca', x: 200, y: 200 },
            { id: 'co', rotulo: 'r-coop', x: 340, y: 120 },
            { id: 'ho', rotulo: 'r-hosp', x: 480, y: 200 },
            { id: 're', rotulo: 'r-represa', x: 600, y: 60 },
          ],
          ligacoes: [
            ['dc', 'es', '2'],
            ['dc', 'pr', '3'],
            ['es', 'pr', '2'],
            ['es', 'co', '6'],
            ['pr', 'co', '3'],
            ['pr', 'ho', '7'],
            ['co', 'ho', '1'],
            ['co', 're', '4'],
            ['ho', 're', '2'],
          ],
        },
      },
      {
        titulo: 'Que número é esse?',
        texto: ['A métrica é o que se quer economizar. Mudar a métrica muda o caminho, com o mesmo algoritmo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Métrica', 'Cada enlace vale', 'Bom para'],
          linhas: [
            ['saltos', '1', 'rede simples, sem enlace muito pior que outro'],
            ['distância', 'quilômetros de fibra', 'quando a luz demorando é o que pesa'],
            ['atraso', 'milissegundos medidos', 'voz e vídeo, que odeiam espera'],
            ['custo', 'um número do projeto', 'dizer "prefiro não passar por aqui" sem desligar nada'],
          ],
        },
      },
      {
        titulo: 'Dijkstra, passo a passo',
        texto: ['A cada passo, o provisório de menor rótulo vira permanente e confere os vizinhos. Entre parênteses, por quem o rótulo veio.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Passo', 'Vira permanente', 'Provisórios depois do passo'],
          linhas: [
            ['1', 'r-dc com 0', 'r-escola 2 (r-dc), r-praca 3 (r-dc)'],
            ['2', 'r-escola com 2', 'r-praca 3 (r-dc), r-coop 8 (r-escola)'],
            ['3', 'r-praca com 3', 'r-coop 6 (r-praca), r-hosp 10 (r-praca)'],
            ['4', 'r-coop com 6', 'r-hosp 7 (r-coop), r-represa 10 (r-coop)'],
            ['5', 'r-hosp com 7', 'r-represa 9 (r-hosp)'],
            ['6', 'r-represa com 9', 'ninguém: acabou'],
          ],
        },
      },
      {
        titulo: 'Princípio de otimização',
        texto: [
          'Se o caminho ótimo de I até K passa por J, o pedaço de J até K é o ótimo de J. Juntando os caminhos ótimos de todos até o mesmo destino, sai uma árvore: a árvore de escoamento. Cada roteador guarda só o primeiro galho, o próximo salto.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'dc', rotulo: 'r-dc (destino)', x: 60, y: 120 },
            { id: 'es', rotulo: 'r-escola', x: 200, y: 40 },
            { id: 'pr', rotulo: 'r-praca', x: 200, y: 200 },
            { id: 'co', rotulo: 'r-coop', x: 340, y: 120 },
            { id: 'ho', rotulo: 'r-hosp', x: 480, y: 200 },
            { id: 're', rotulo: 'r-represa', x: 600, y: 60 },
          ],
          ligacoes: [
            ['es', 'dc', 'custo 2'],
            ['pr', 'dc', 'custo 3'],
            ['co', 'pr', 'custo 6'],
            ['ho', 'co', 'custo 7'],
            ['re', 'ho', 'custo 9'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'No meio do Dijkstra, os provisórios são X com 5, Y com 7 e Z com infinito. O que acontece no próximo passo?',
      opcoes: [
        'X vira permanente com 5 e confere os vizinhos',
        'Y vira permanente, porque pode estar mais perto do destino',
        'Z vira permanente, para sair do infinito',
        'Os três viram permanentes de uma vez',
      ],
      certa: 0,
      explicacao: 'Sempre o provisório de menor rótulo. Com custos positivos, ninguém consegue chegar a X por menos de 5 passando por Y ou Z, então o 5 já é definitivo.',
    },
  },
  desafio: {
    carta: [
      'O trecho entre o r-mercado e o r-igreja, no anel do centro, vai passar a semana em manutenção: a emenda da fibra está ruim e a equipe vai refazer aos poucos, sem desligar. O técnico quer que o tráfego do data center até o posto de saúde pare de passar por ali, mas sem derrubar nada.',
      'A ordem é subir o custo desse trecho para 10, nos dois sentidos, e provar com o Dijkstra e com a árvore de escoamento que o caminho mudou.',
      'Objetivo: custo 10 nos dois lados do trecho, o Dijkstra no r-dc mostrando o caminho novo até o r-posto, a árvore de escoamento até o r-posto e a pergunta respondida.',
    ],
    dicas: [
      'O custo de um trecho é o custo da porta de quem manda. São duas portas: a "igreja" no r-mercado e a "mercado" no r-igreja.',
      'Depois de mudar, rode o Dijkstra no r-dc até o r-posto. O caminho novo passa pelo r-norte e pelo r-igreja.',
      'Na árvore até o r-posto, o r-mercado passa a entregar direto ao r-posto (6), porque pela igreja daria 10 + 1 = 11. Até o r-posto: 1 + 5 + 1 = 7.',
    ],
    perguntas: d79D,
    respostas: { '1': '7' },
    montar: () => malha(3079, 97, NOS79D, LIG79D, 'Roteador Anel 6 (anel do centro)'),
    objetivo: (m) => {
      const cm = custoPorta(m, 'r-mercado', 'igreja');
      const ci = custoPorta(m, 'r-igreja', 'mercado');
      const dj = m.flags.dijkstra as { origem: string; dist: Record<string, number> } | undefined;
      const ar = m.flags.arvore as { destino: string; proximos: Record<string, string | null> } | undefined;
      const vivo = caminhoAte(dijkstra(grafoDoMundo(m), 'r-dc'), 'r-posto') ?? [];
      const evita = !vivo.join(' ').match(/r-mercado r-igreja|r-igreja r-mercado/);
      return [
        item('custo 10 nas duas pontas do trecho r-mercado e r-igreja', cm === 10 && ci === 10, `r-mercado: ${cm ?? 1}, r-igreja: ${ci ?? 1}`),
        item('Dijkstra no r-dc com o caminho novo até o r-posto (custo 7, fora do trecho em manutenção)', evita && dj?.origem === 'r-dc' && dj.dist['r-posto'] === 7, dj ? `último a partir de ${dj.origem}, custo até o r-posto ${dj.dist['r-posto']}` : 'ainda não foi rodado'),
        item('árvore de escoamento até o r-posto, com o r-mercado entregando direto', ar?.destino === 'r-posto' && ar.proximos['r-mercado'] === 'r-posto', ar ? `última até ${ar.destino}` : 'ainda não foi montada'),
        ...todasRespondidas(m, d79D),
      ];
    },
    solucao: [
      ['equip', 'r-mercado', 'rot-ospf-custo', { porta: 'igreja', custo: '10' }],
      ['equip', 'r-igreja', 'rot-ospf-custo', { porta: 'mercado', custo: '10' }],
      ['equip', 'r-dc', 'rot-dijkstra', { destino: 'r-posto' }],
      ['equip', 'r-posto', 'rot-arvore', { destino: 'r-posto' }],
    ],
  },
};

/* ======================================================================
 * ref 80: Inundação (5.2.3)
 * ====================================================================== */

const NOS80 = ['r-represa', 'r-sul', 'r-feira', 'r-porto', 'r-estacao', 'r-mata'];
const LIG80: Lig[] = [
  ['r-represa', 'r-sul', 1],
  ['r-sul', 'r-feira', 1],
  ['r-feira', 'r-porto', 1],
  ['r-porto', 'r-estacao', 1],
  ['r-estacao', 'r-mata', 1],
  ['r-mata', 'r-represa', 1],
  ['r-sul', 'r-estacao', 1],
];

const NOS80D = ['r-defesa', 'r-ponte', 'r-morro', 'r-vila', 'r-cais', 'r-farol', 'r-ilha'];
const LIG80D: Lig[] = [
  ['r-defesa', 'r-ponte', 1],
  ['r-defesa', 'r-morro', 1],
  ['r-ponte', 'r-morro', 1],
  ['r-ponte', 'r-vila', 1],
  ['r-morro', 'r-cais', 1],
  ['r-vila', 'r-cais', 1],
  ['r-vila', 'r-farol', 1],
  ['r-cais', 'r-farol', 1],
  ['r-farol', 'r-ilha', 1],
];

interface Inundacao {
  'sem-controle'?: number;
  saltos?: number;
  sequencia?: number;
  ultima?: { modo: string; copias: number; alcancados: number; semFim: boolean };
}

const inund = (m: Mundo) => m.flags.inundacao as Inundacao | undefined;

const d80: Pergunta[] = [numerica('1', 'Com número de sequência, quantas cópias a inundação a partir do r-represa gastou no anel inteiro?', 9, 0)];
const d80D: Pergunta[] = [numerica('1', 'Qual é o menor contador de saltos que leva o alarme do r-defesa a todos os sete roteadores?', 4, 0)];

const dia80: Dia = {
  numero: 80,
  ato: 4,
  titulo: 'Inundação',
  chamado: [
    'CHAMADO #0080',
    'A represa quer um alarme de cheia que chegue a todos os roteadores do anel sul, mesmo com trecho cortado e mesmo antes de qualquer tabela de rotas existir. O engenheiro da represa sugeriu o jeito mais bruto que existe: mandar o aviso por todo lado e ver no que dá.',
    'No que dá é justamente o que a prefeitura quer saber antes de ligar a sirene de verdade.',
    'Objetivo: inundar a partir do r-represa sem controle, com o menor contador de saltos que alcança todos e com número de sequência; depois cortar o trecho até o r-sul e provar que o alarme ainda chega a todos.',
  ],
  manual: {
    titulo: 'Inundação',
    texto: [
      'Inundação é o algoritmo de roteamento que não precisa saber nada: todo pacote que chega é repassado por todos os enlaces, menos aquele por onde chegou. Não há tabela, não há mapa, não há cálculo. Se existe algum caminho até o destino, alguma cópia passa por ele, e passa pelo mais curto primeiro.',
      'O problema é a conta. Numa rede com laço, cada cópia que dá a volta encontra outra porta para sair e vira mais cópias. Sem controle nenhum, a inundação não termina nunca: o número de cópias só cresce, e a rede afoga no próprio aviso.',
      'O primeiro remédio é o contador de saltos. O pacote nasce com um número k, cada roteador diminui um, e quando chega a zero o pacote é jogado fora. Com k igual à distância em saltos até o roteador mais longe, todo mundo recebe. Sem saber essa distância, usa-se o pior caso, o número de roteadores menos um, e paga-se em cópias.',
      'O segundo remédio é o número de sequência. A origem numera cada pacote, e cada roteador anota, por origem, os números que já viu. Chegou repetido, joga fora; chegou novo, anota e repassa uma vez só. Assim cada roteador repassa cada pacote uma única vez, e o total fica no máximo uma cópia por enlace em cada sentido.',
      'Parece desperdício, mas a inundação tem usos sérios. É robusta: enquanto houver um caminho, o pacote chega, mesmo com metade da rede no chão, o que serve para alarmes e para aplicações militares. É a forma de espalhar uma mensagem a todos, a difusão. E é como os protocolos de estado de enlace espalham o mapa da rede: cada roteador inunda o próprio pacote de estado de enlace, com número de sequência. Como sempre tenta todos os caminhos, ela também serve de régua: nada chega antes da inundação.',
    ],
  },
  dicas: [
    'No r-represa, use a inundação nos três modos de controle e compare o total de cópias.',
    'O roteador mais longe do r-represa, em saltos, é o r-porto: está a 3 saltos, por qualquer lado.',
    'Contador de saltos com 3; depois número de sequência. Para o corte, derrube a porta "sul" do r-represa e inunde de novo com número de sequência.',
  ],
  perguntas: d80,
  montar: () => malha(480, 80, NOS80, LIG80, 'Roteador Anel 6 (anel sul)'),
  objetivo: (m) => {
    const f = inund(m);
    return [
      item('inundação sem controle, para ver que ela não para', f?.['sem-controle'] !== undefined),
      item('contador de saltos com o menor k que alcança todos (10 cópias)', f?.saltos === 10, f?.saltos !== undefined ? `último: ${f.saltos} cópias` : 'ainda não foi feito'),
      item('inundação com número de sequência', f?.sequencia !== undefined),
      item('com o trecho r-represa e r-sul derrubado, a inundação com sequência chega aos 6 roteadores', derrubou(m, 'r-represa:sul', 'r-sul:represa') && f?.ultima?.modo === 'sequencia' && f.ultima.alcancados === 6, f?.ultima ? `última: ${f.ultima.modo}, ${f.ultima.alcancados} alcançados` : 'ainda não foi feito'),
      ...todasRespondidas(m, d80),
    ];
  },
  posMorte: [
    'Sem controle, a inundação gastou 2, 3, 5, 6, 7, 11, 16, 19, 25 e 38 cópias nos dez primeiros saltos e só parou porque o laboratório desligou o relógio. Seis roteadores, sete trechos e dois laços bastam: cada volta no anel devolve cópias que saem de novo pelas outras portas.',
    'Com contador de saltos, parou. No pior caso, k = 5, foram 23 cópias; com k = 3, a distância até o r-porto, 10 cópias, e ninguém ficou sem aviso. Com número de sequência, 9 cópias: cada roteador repassou uma vez só, e as 4 que chegaram repetidas foram jogadas fora. O preço do número de sequência é memória: cada roteador guarda o que já viu de cada origem.',
    'Depois do corte, o alarme ainda chegou aos seis, com 7 cópias, sem ninguém recalcular nada. É essa teimosia que faz a inundação servir de alicerce: o estado de enlace usa exatamente isso, com número de sequência, para que o mapa da rede chegue a todo mundo mesmo enquanto a rede muda.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'r-represa'],
      acao: 'rot-inundar',
      valores: { modo: 'sem-controle' },
      instrucao: 'No r-represa, inunde sem controle nenhum.',
      porque: 'Cada roteador repassa por todas as portas menos a de chegada. O anel sul tem laços: r-represa, r-sul, r-estacao e r-mata formam um, e r-sul, r-feira, r-porto e r-estacao, outro.',
      conferir: (m) => (inund(m)?.ultima?.modo === 'sem-controle' && inund(m)!.ultima!.semFim ? true : 'A inundação precisa ser sem controle.'),
      feito: '132 cópias em dez saltos, 38 só no último, e o laboratório desistiu. Cada cópia que fecha um laço volta a ser repassada: a conta só cresce.',
    }),
    passo({
      alvo: ['equip', 'r-represa'],
      acao: 'rot-inundar',
      valores: { modo: 'saltos', k: '5' },
      instrucao: 'Inunde de novo com contador de saltos começando em 5, o número de roteadores menos um.',
      porque: 'Sem saber a distância até o roteador mais longe, o pior caso é uma fila com todo mundo: n menos 1 saltos.',
      conferir: (m) => (inund(m)?.ultima?.modo === 'saltos' && inund(m)!.ultima!.alcancados === 6 ? true : 'Use o contador de saltos com 5.'),
      feito: '23 cópias em cinco saltos, e parou. Chegou a todos, mas os dois últimos saltos só levaram cópias para quem já tinha recebido.',
    }),
    passo({
      alvo: ['equip', 'r-represa'],
      acao: 'rot-inundar',
      valores: { modo: 'saltos' },
      pedir: ['k'],
      exemplo: { k: '3' },
      instrucao: 'Agora use o menor contador que ainda leva o alarme a todos os roteadores.',
      porque: 'O contador ideal é a distância em saltos até o roteador mais longe. Conte os saltos do r-represa até cada um.',
      conferir: (m) => {
        const u = inund(m)?.ultima;
        if (!u || u.modo !== 'saltos') return 'Use o modo contador de saltos.';
        if (u.alcancados < 6) return 'Alguém ficou sem o aviso: o r-porto está a 3 saltos do r-represa, por qualquer lado.';
        if (u.copias !== 10) return 'Chegou a todos, mas gastou mais que o necessário. Tente um contador menor.';
        return true;
      },
      feito: 'Com 3, foram 10 cópias e todos receberam. Com 2, o r-porto ficaria de fora. A conta certa exige saber o tamanho da rede, coisa que a inundação, por definição, não sabe.',
    }),
    passo({
      alvo: ['equip', 'r-represa'],
      acao: 'rot-inundar',
      valores: { modo: 'sequencia' },
      instrucao: 'Inunde com número de sequência.',
      porque: 'Cada roteador anota o par (origem, número) do que já viu. Repetido vai para o lixo; novo é repassado uma vez só.',
      conferir: (m) => (inund(m)?.ultima?.modo === 'sequencia' ? true : 'Use o modo número de sequência.'),
      feito: 'Quatro saltos, e quatro cópias chegaram repetidas e foram descartadas. Não precisou saber o tamanho da rede.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '9' },
      instrucao: 'Quantas cópias a inundação com número de sequência gastou?',
      porque: 'Cada roteador repassa uma vez, por todas as portas menos a de chegada: a origem manda por 2, e cada um dos outros manda pelo número de portas menos 1.',
      feito: '9: 2 do r-represa, mais 2 do r-sul e 2 do r-estacao (três portas cada), mais 1 de cada um dos outros três. Menos que o contador mais justo, e sem precisar conhecer a rede.',
    }),
    passo({
      alvo: ['equip', 'r-represa'],
      acao: 'rot-derrubar',
      valores: { porta: 'sul' },
      instrucao: 'Uma retroescavadeira cortou o trecho entre o r-represa e o r-sul. Derrube a porta "sul" do r-represa.',
      porque: 'Quem quer alarme quer que ele chegue no pior dia, não no melhor.',
      conferir: (m) => (derrubou(m, 'r-represa:sul') ? true : 'Derrube a porta "sul" do r-represa.'),
      feito: 'O trecho caiu. Nenhuma tabela foi refeita, nenhum protocolo foi avisado.',
    }),
    passo({
      alvo: ['equip', 'r-represa'],
      acao: 'rot-inundar',
      valores: { modo: 'sequencia' },
      instrucao: 'Inunde de novo com número de sequência, agora com o trecho cortado.',
      porque: 'A inundação tenta todos os caminhos. Enquanto existir um, o pacote passa.',
      conferir: (m) => {
        const u = inund(m)?.ultima;
        return u?.modo === 'sequencia' && u.alcancados === 6 ? true : 'Inunde com número de sequência e confira se os 6 roteadores receberam.';
      },
      feito: 'Seis de seis, com 7 cópias, saindo só pela porta "mata". É essa robustez que faz da inundação o jeito de espalhar alarmes, difusões e o mapa do estado de enlace.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Por todas as portas, menos a de chegada',
        texto: ['Inundação não precisa de tabela nem de mapa. Se existe caminho, alguma cópia passa por ele, e pelo mais curto primeiro.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 're', rotulo: 'r-represa (origem)', x: 60, y: 120 },
            { id: 'su', rotulo: 'r-sul', x: 220, y: 40 },
            { id: 'ma', rotulo: 'r-mata', x: 220, y: 200 },
            { id: 'es', rotulo: 'r-estacao', x: 380, y: 200 },
            { id: 'fe', rotulo: 'r-feira', x: 380, y: 40 },
            { id: 'po', rotulo: 'r-porto', x: 540, y: 120 },
          ],
          ligacoes: [
            ['re', 'su', '1 salto'],
            ['re', 'ma', '1 salto'],
            ['su', 'fe'],
            ['su', 'es'],
            ['ma', 'es'],
            ['fe', 'po'],
            ['es', 'po'],
          ],
        },
      },
      {
        titulo: 'A explosão de cópias',
        texto: ['Num anel com laços, cada cópia que dá a volta sai de novo pelas outras portas. Sem controle, não termina.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Salto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
          linhas: [['Cópias nos enlaces', '2', '3', '5', '6', '7', '11', '16', '19', '25', '38']],
        },
      },
      {
        titulo: 'Dois jeitos de parar',
        texto: [
          'Contador de saltos: o pacote nasce com k e morre no zero. Precisa saber a distância até o mais longe. Número de sequência: cada roteador lembra o que já viu de cada origem e repassa uma vez só. Precisa de memória.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Controle', 'Cópias no anel sul', 'Todos recebem?', 'Precisa de'],
          linhas: [
            ['nenhum', 'sem fim (132 em 10 saltos)', 'sim, e não para', 'nada, e é esse o problema'],
            ['contador k = 5 (n menos 1)', '23', 'sim', 'só o tamanho da rede'],
            ['contador k = 3 (distância exata)', '10', 'sim', 'conhecer a rede'],
            ['contador k = 2', '5', 'não: o r-porto fica de fora', 'sorte'],
            ['número de sequência', '9', 'sim', 'memória por origem'],
          ],
        },
      },
      {
        titulo: 'Para que serve',
        texto: ['A inundação é cara, mas é teimosa: chega enquanto houver um caminho. Por isso aparece onde robustez vale mais que economia.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Uso', 'Por quê'],
          linhas: [
            ['alarmes e redes que podem perder metade dos enlaces', 'não depende de tabela que ainda não se refez'],
            ['estado de enlace (o mapa da rede)', 'cada roteador inunda o próprio pacote, com número de sequência'],
            ['difusão para todos', 'é o jeito mais simples de alcançar todo mundo'],
            ['régua para outros algoritmos', 'tenta todos os caminhos: nada chega antes'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Num roteador com inundação por número de sequência, chega uma cópia com a mesma origem e o mesmo número de uma que ele já repassou. O que ele faz?',
      opcoes: ['Joga fora', 'Repassa por todas as portas, menos a de chegada', 'Devolve pela porta de chegada', 'Diminui o contador e repassa'],
      certa: 0,
      explicacao: 'Já viu aquele par (origem, número), então já repassou. Repassar de novo só criaria mais cópias de um aviso que todos os vizinhos já receberam ou vão receber.',
    },
  },
  desafio: {
    carta: [
      'A defesa civil ligou as sirenes dos bairros da beira do rio numa malha de sete roteadores, e o alarme sai do r-defesa por inundação com contador de saltos. No teste de ontem, a sirene da ilha ficou muda.',
      'O técnico que configurou pôs o contador em 2, "para não congestionar". Agora a ordem é usar o menor contador que alcance todo mundo, nem um a mais.',
      'Objetivo: uma inundação a partir do r-defesa com o menor contador que alcança os sete roteadores, e a pergunta respondida.',
    ],
    dicas: [
      'Conte os saltos do r-defesa até cada roteador pelo caminho mais curto. O mais longe decide o contador.',
      'O r-ilha só se alcança pelo r-farol, que está a 3 saltos do r-defesa.',
      'Contador 4. Com 3, o r-ilha fica sem alarme; com 5, chega a todos gastando 52 cópias em vez de 28.',
    ],
    perguntas: d80D,
    respostas: { '1': '4' },
    montar: () => malha(3080, 98, NOS80D, LIG80D, 'Roteador Anel 6 (beira do rio)'),
    objetivo: (m) => {
      const f = inund(m);
      return [
        item('inundação do r-defesa com contador de saltos alcançando os 7 roteadores com o mínimo de cópias (28)', f?.saltos === 28 && f.ultima?.modo === 'saltos' && f.ultima.alcancados === 7, f?.ultima ? `última: ${f.ultima.modo}, ${f.ultima.copias} cópias, ${f.ultima.alcancados} alcançados` : 'ainda não foi feita'),
        ...todasRespondidas(m, d80D),
      ];
    },
    solucao: [['equip', 'r-defesa', 'rot-inundar', { modo: 'saltos', k: '4' }]],
  },
};

/* ======================================================================
 * ref 81: Contagem ao infinito (5.2.4)
 * ====================================================================== */

interface NoLinha {
  nome: string;
  /** LAN atrás do roteador: [nome do PC, terceiro octeto]. */
  lan?: [string, number];
}

/**
 * Uma linha de roteadores, cada um ligado ao seguinte por um /30, alguns com uma LAN e um PC.
 * "rip" diz quem já vem com o RIP ligado; "convergir" já roda as rodadas até as tabelas pararem.
 */
function linha(semente: number, rede: number, nos: NoLinha[], o: { rip: string[]; convergir?: boolean }): Mundo {
  const m = novoMundo(semente);
  m.flags.camadaRede = true;
  const ifs: Record<string, Record<string, string>> = Object.fromEntries(nos.map((n) => [n.nome, {}]));
  for (let i = 0; i + 1 < nos.length; i++) {
    const a = nos[i]!.nome;
    const b = nos[i + 1]!.nome;
    ifs[a]![curto(b)] = `10.${rede}.${100 + i}.1/30`;
    ifs[b]![curto(a)] = `10.${rede}.${100 + i}.2/30`;
  }
  for (const n of nos) if (n.lan) ifs[n.nome]!.lan = `10.${rede}.${n.lan[1]}.1/24`;
  for (const n of nos) {
    adicionar(m, roteador(n.nome, { modelo: 'Roteador Anel 6 (anel leste)', interfaces: ifs[n.nome] }));
    if (o.rip.includes(n.nome)) configRip(m.equipamentos.get(n.nome)!).ligado = true;
  }
  let c = 1;
  for (const n of nos) {
    if (!n.lan) continue;
    adicionar(m, pc(n.lan[0], { ip: cidr(`10.${rede}.${n.lan[1]}.10/24`), gateway: `10.${rede}.${n.lan[1]}.1` }));
    ligar(m, { equip: n.lan[0], porta: 'eth0' }, { equip: n.nome, porta: 'lan' }, 'cat6', 20, { id: `c${c++}` });
  }
  for (let i = 0; i + 1 < nos.length; i++) {
    const a = nos[i]!.nome;
    const b = nos[i + 1]!.nome;
    ligar(m, { equip: a, porta: curto(b) }, { equip: b, porta: curto(a) }, 'cat6', 90, { id: `c${c++}` });
  }
  m.proxCabo = c;
  if (o.convergir) rodarRip(m);
  return m;
}

const LINHA81: NoLinha[] = [
  { nome: 'r-dc', lan: ['painel', 0] },
  { nome: 'r-leste', lan: ['escola-leste', 3] },
  { nome: 'r-represa', lan: ['telemetria', 4] },
];
const LAN_REPRESA = '10.81.4.0/24';
const LAN_ESCOLA = '10.81.3.0/24';

const LINHA81D: NoLinha[] = [{ nome: 'r-centro', lan: ['prefeitura', 0] }, { nome: 'r-ponte' }, { nome: 'r-serra' }, { nome: 'r-antena', lan: ['radio-comunitaria', 9] }];
const LAN_ANTENA = '10.91.9.0/24';

const horizonteDe = (m: Mundo, r: string) => (m.equipamentos.get(r)!.s.rip?.horizonte as string | undefined) ?? 'nenhum';

const ripLigado = (m: Mundo, r: string) => !!m.equipamentos.get(r)!.s.rip?.ligado;
const comHorizonte = (m: Mundo, r: string) => ['dividido', 'envenenado'].includes(horizonteDe(m, r));

const dia81: Dia = {
  numero: 81,
  ato: 4,
  titulo: 'Contagem ao infinito',
  chamado: [
    'CHAMADO #0081',
    'O anel leste vai rodar RIP: o r-dc, o r-leste da escola e o r-represa, em fila. O técnico de lá já ligou o protocolo nos dois roteadores dele; falta o do data center.',
    'Antes de confiar a telemetria da represa a um protocolo que aprende sozinho, a prefeitura quer ver o que acontece quando um trecho cai. O técnico jura que "o RIP se vira". Vamos ver como.',
    'Objetivo: RIP convergido nos três, a contagem ao infinito vista depois do corte entre o r-leste e o r-represa, e o horizonte dividido no r-dc fazendo a próxima queda se espalhar sem contar.',
  ],
  manual: {
    titulo: 'Vetor de distância',
    texto: [
      'No roteamento por vetor de distância, ninguém tem o mapa da rede. Cada roteador guarda uma tabela com uma linha por destino: a distância que acredita ter e o vizinho por onde se chega. De tempos em tempos, manda essa tabela inteira, o vetor, a cada vizinho. Quem recebe soma a distância até aquele vizinho e fica, para cada destino, com o menor resultado. É o algoritmo de Bellman-Ford feito em pedaços, cada roteador fazendo a sua parte só com o que ouve dos vizinhos.',
      'O RIP é o exemplo clássico: a métrica é o número de saltos, e a rede que o roteador tem numa porta vale 0. Rodada a rodada, as notícias se espalham, e quando uma rodada passa sem ninguém mudar nada, a rede convergiu. Boa notícia corre: uma rede nova anda um salto por rodada, e numa fila de n roteadores todo mundo sabe de tudo em n menos 1 rodadas.',
      'Má notícia anda devagar. Quando um trecho cai, o roteador que perdeu a rota ouve do vizinho "eu chego lá com 2" e acredita, sem saber que o caminho do vizinho passava por ele mesmo. Fica com 3. O vizinho ouve 3 e vai para 4. Os dois se enganam um ao outro, subindo de dois em dois, até chegar ao número que o protocolo chama de infinito. É a contagem ao infinito. Por isso o infinito do RIP é 16, pequeno de propósito: a mentira acaba logo, e a rede nunca pode ter mais que 15 saltos.',
      'O horizonte dividido corta a mentira na origem: não conte ao vizinho a rota que você aprendeu dele. O envenenamento reverso vai além: conte, mas com 16, para o vizinho saber que por você não dá. Numa fila, os dois resolvem. Em redes com laço de três ou mais roteadores, a mentira ainda pode dar a volta pelo outro lado, e é por isso que os protocolos de estado de enlace venceram nas redes grandes.',
      'No laboratório, o RIP anda em rodadas, e o horizonte dividido vem desligado, para a contagem aparecer. Nos roteadores de verdade ele vem ligado, e cada rodada leva 30 segundos.',
    ],
  },
  dicas: [
    'Ligue o RIP no r-dc e rode os protocolos até convergir. Depois derrube a porta "represa" do r-leste e rode de novo.',
    'Quem mente para o r-leste é o r-dc: ele conta de volta a rota que aprendeu do próprio r-leste.',
    'Ligue o horizonte dividido no r-dc, derrube a porta "lan" do r-leste e rode 5 rodadas: tem de convergir antes disso.',
  ],
  montar: () => linha(481, 81, LINHA81, { rip: ['r-leste', 'r-represa'] }),
  objetivo: (m) => {
    const f = m.flags.rip as { convergiu?: boolean; contouAoInfinito?: boolean } | undefined;
    return [
      item('RIP ligado no r-dc', ripLigado(m, 'r-dc')),
      item('contagem ao infinito vista: o r-dc acabou com 16 até a LAN da represa', !!f?.contouAoInfinito && derrubou(m, 'r-leste:represa', 'r-represa:leste') && metricaRip(m, 'r-dc', LAN_REPRESA) >= 16, `r-dc até ${LAN_REPRESA}: ${metricaRip(m, 'r-dc', LAN_REPRESA)}`),
      item('horizonte dividido (ou envenenamento reverso) no r-dc', comHorizonte(m, 'r-dc'), horizonteDe(m, 'r-dc')),
      item('LAN da escola derrubada e a queda espalhada até o r-dc, já convergido', derrubou(m, 'r-leste:lan') && !!f?.convergiu && metricaRip(m, 'r-dc', LAN_ESCOLA) >= 16, `r-dc até ${LAN_ESCOLA}: ${metricaRip(m, 'r-dc', LAN_ESCOLA)}`),
    ];
  },
  posMorte: [
    'A boa notícia levou 2 rodadas: na primeira, cada roteador aprendeu as redes dos vizinhos diretos; na segunda, o r-dc soube da LAN da represa com 2 saltos. A má notícia levou 16. Com o trecho cortado, o r-represa marcou tudo como 16 na hora, porque ficou sem vizinho. Mas o r-leste ouviu o r-dc dizer "chego na represa com 2" e acreditou: 3, pelo r-dc. O r-dc ouviu 3 e foi para 4. E assim de dois em dois, até 16. Com o RIP de verdade, que manda o vetor a cada 30 segundos, seriam 8 minutos de pacotes da telemetria rodando entre o r-dc e o r-leste até o TTL acabar.',
    'O erro não era de ninguém em particular: cada roteador fez exatamente a conta do Bellman-Ford com o que ouviu. O defeito é do algoritmo, que não sabe que o caminho do vizinho passa por ele mesmo. O horizonte dividido no r-dc tirou essa informação do vetor que vai para o r-leste.',
    'Na segunda queda, a da LAN da escola, o r-leste não ouviu mais nada do r-dc sobre ela, marcou 16 na primeira rodada, e o r-dc, na segunda. Três rodadas e acabou, sem contar nada. Numa fila isso basta. Num laço de três roteadores ou mais, nem o horizonte dividido salva sempre, e esse é um dos motivos de o estado de enlace ter tomado o lugar do vetor de distância nas redes grandes.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-rip',
      valores: { estado: 'on' },
      instrucao: 'Ligue o RIP no r-dc. Os outros dois já estão com ele ligado.',
      porque: 'No vetor de distância, cada roteador só conversa com os vizinhos. Sem RIP no r-dc, ninguém troca vetor com ele.',
      conferir: (m) => (ripLigado(m, 'r-dc') ? true : 'O RIP do r-dc continua desligado.'),
      feito: 'RIP ligado. Por enquanto, cada roteador só conhece as próprias redes, com distância 0.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-rodar',
      valores: { n: '' },
      instrucao: 'Rode os protocolos até convergir.',
      porque: 'Em cada rodada, todo mundo manda o vetor aos vizinhos ao mesmo tempo, e cada um soma 1 ao que ouviu e fica com o menor.',
      conferir: (m) => (m.flags.rip?.convergiu && metricaRip(m, 'r-dc', LAN_REPRESA) === 2 ? true : 'As tabelas ainda não convergiram. Rode até ninguém mudar nada.'),
      feito: 'Duas rodadas. Na primeira, o r-dc aprendeu a LAN da escola com 1 salto; na segunda, a da represa com 2, pelo r-leste. Boa notícia anda um salto por rodada.',
    }),
    passo({
      alvo: ['equip', 'r-leste'],
      acao: 'rot-derrubar',
      valores: { porta: 'represa' },
      instrucao: 'Corte o trecho entre o r-leste e o r-represa: derrube a porta "represa" do r-leste.',
      porque: 'O RIP não percebe a queda na hora como o OSPF. A rota velha fica na tabela até as próximas rodadas mudarem a opinião de cada um.',
      conferir: (m) => (derrubou(m, 'r-leste:represa') ? true : 'Derrube a porta "represa" do r-leste.'),
      feito: 'O trecho caiu. O r-dc ainda acredita que chega na represa com 2 saltos.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-rodar',
      valores: { n: '' },
      instrucao: 'Rode os protocolos de novo, até convergir, e acompanhe a métrica até a LAN da represa (10.81.4.0/24).',
      porque: 'O r-leste perdeu o caminho, mas o vetor do r-dc ainda diz "chego na represa com 2". O r-leste não sabe que esse caminho passava por ele mesmo.',
      conferir: (m) => (m.flags.rip?.contouAoInfinito && metricaRip(m, 'r-dc', LAN_REPRESA) >= 16 ? true : 'A contagem ainda não chegou a 16. Rode até convergir.'),
      feito: 'O r-leste foi para 3, o r-dc para 4, o r-leste para 5, e assim até 16: dezesseis rodadas depois do corte. Contagem ao infinito. Pelo caminho, todo pacote para a represa ficou indo e voltando entre os dois.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-rip-horizonte',
      pedir: ['h'],
      exemplo: { h: 'on' },
      instrucao: 'Ligue no r-dc o remédio que impede que ele conte ao r-leste a rota que aprendeu do próprio r-leste.',
      porque: 'Horizonte dividido: não conto a rota ao vizinho de quem aprendi. Envenenamento reverso: conto, mas com 16. Nos dois, o r-leste não tem mais em quem acreditar.',
      conferir: (m) => (comHorizonte(m, 'r-dc') ? true : 'Desligado, o r-dc continua contando tudo a todos, e a próxima queda conta até 16 de novo.'),
      feito: 'Pronto. Repare que o remédio vai em quem fala, não em quem escuta: o r-dc é que muda o que manda ao r-leste.',
    }),
    passo({
      alvo: ['equip', 'r-leste'],
      acao: 'rot-derrubar',
      valores: { porta: 'lan' },
      instrucao: 'Agora a LAN da escola leste cai: derrube a porta "lan" do r-leste.',
      porque: 'É o mesmo desenho de antes: o r-dc aprendeu essa rede pelo r-leste, que acaba de perdê-la.',
      conferir: (m) => (derrubou(m, 'r-leste:lan') ? true : 'Derrube a porta "lan" do r-leste.'),
      feito: 'A LAN da escola caiu. O r-dc ainda acha que chega nela com 1 salto.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-rodar',
      valores: { n: '5' },
      instrucao: 'Rode só 5 rodadas. Sem o horizonte, isso não daria nem para começar a contagem.',
      porque: 'Com o horizonte dividido no r-dc, o r-leste não ouve mais nada sobre a escola e marca 16 na hora.',
      conferir: (m) => (m.flags.rip?.convergiu && metricaRip(m, 'r-dc', LAN_ESCOLA) >= 16 ? true : 'Não convergiu em 5 rodadas. Confira se o horizonte do r-dc está ligado.'),
      feito: 'Três rodadas: o r-leste foi direto para 16, o r-dc o seguiu, e acabou. O aviso de que a contagem já aconteceu continua aparecendo porque é da queda anterior.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Cada um com a sua tabela',
        texto: ['Ninguém tem o mapa. Cada roteador recebe o vetor do vizinho, soma a distância até ele e fica com o menor. É o Bellman-Ford distribuído.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Destino', 'O r-leste diz', 'Mais 1 salto até o r-leste', 'O r-dc anota'],
          linhas: [
            ['LAN da escola', '0', '1', '1, via r-leste'],
            ['LAN da represa', '1', '2', '2, via r-leste'],
            ['LAN do painel (é do r-dc)', '1', '2', '0, é minha: fica a minha'],
          ],
        },
      },
      {
        titulo: 'A fila do anel leste',
        texto: ['Três roteadores em fila. Boa notícia anda um salto por rodada: em 2 rodadas, todos sabem de tudo.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'pa', rotulo: 'painel', x: 40, y: 160 },
            { id: 'dc', rotulo: 'r-dc', x: 160, y: 80 },
            { id: 'le', rotulo: 'r-leste', x: 340, y: 80 },
            { id: 'es', rotulo: 'escola-leste', x: 340, y: 200 },
            { id: 're', rotulo: 'r-represa', x: 520, y: 80 },
            { id: 'te', rotulo: 'telemetria', x: 620, y: 160 },
          ],
          ligacoes: [
            ['pa', 'dc'],
            ['dc', 'le', '1 salto'],
            ['le', 'es'],
            ['le', 're', 'aqui vai cair'],
            ['re', 'te'],
          ],
        },
      },
      {
        titulo: 'Má notícia anda devagar',
        texto: ['Depois do corte entre o r-leste e o r-represa, a distância até a LAN da represa, rodada a rodada. Um acredita no outro.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Rodada', 'r-leste', 'r-dc'],
          linhas: [
            ['antes do corte', '1', '2'],
            ['1', '3 (ouviu o 2 do r-dc)', '2'],
            ['2', '3', '4 (ouviu o 3 do r-leste)'],
            ['3', '5', '4'],
            ['4', '5', '6'],
            ['...', 'de dois em dois', 'de dois em dois'],
            ['14', '15', '16, infinito'],
            ['15', '16, infinito', '16'],
          ],
        },
      },
      {
        titulo: 'Horizonte dividido e envenenamento reverso',
        texto: ['O remédio vai em quem fala: o que o r-dc conta ao r-leste sobre uma rota que aprendeu do próprio r-leste.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Modo no r-dc', 'O r-dc diz ao r-leste sobre a represa', 'Depois da queda'],
          linhas: [
            ['desligado', '2', 'o r-leste acredita e conta até 16'],
            ['horizonte dividido', 'nada', 'o r-leste fica sem rota e marca 16'],
            ['envenenamento reverso', '16', 'o r-leste sabe que por ali não dá'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Na fila A, B, C, a rede atrás de C cai. B aprendeu essa rede de C, e A aprendeu de B. Com horizonte dividido em todos, o que A conta a B sobre essa rede?',
      opcoes: ['Nada, porque aprendeu dela pelo próprio B', 'Que chega com 2 saltos', 'Que chega com 16', 'A rota inteira, salto por salto'],
      certa: 0,
      explicacao: 'Horizonte dividido: não se conta ao vizinho a rota que se aprendeu dele. Com 16 seria o envenenamento reverso. E vetor de distância nunca manda o caminho, só a distância.',
    },
  },
  desafio: {
    carta: [
      'A rádio comunitária fica no fim do ramal leste, na fila r-centro, r-ponte, r-serra e r-antena, todos com RIP e tabelas convergidas. Sexta-feira a concessionária vai trocar o poste entre o r-serra e o r-antena, e o trecho vai cair.',
      'Da última vez que caiu, a prefeitura ficou minutos mandando pacote para a rádio em círculo. Desta vez, a queda tem de chegar ao r-centro sem nenhuma métrica subir pelo caminho. A concessionária só desliga uma vez, então prepare antes de cortar.',
      'Objetivo: o trecho entre o r-serra e o r-antena derrubado, o RIP convergido, nenhuma métrica subindo no caminho e o r-centro sem rota para a LAN da rádio (10.91.9.0/24).',
    ],
    dicas: [
      'Quem pode mentir é quem aprendeu a rota da rádio de um vizinho e conta de volta para ele. Vá do r-antena para o r-centro e veja quem aprendeu de quem.',
      'O r-ponte aprendeu do r-serra, e o r-centro do r-ponte. Os dois precisam do horizonte dividido (ou do envenenamento reverso) antes do corte.',
      'Depois de ligar o horizonte no r-centro e no r-ponte, derrube a porta "antena" do r-serra e rode os protocolos até convergir.',
    ],
    montar: () => linha(3081, 91, LINHA81D, { rip: ['r-centro', 'r-ponte', 'r-serra', 'r-antena'], convergir: true }),
    objetivo: (m) => {
      const f = m.flags.rip as { convergiu?: boolean; subidas?: number; infinitos?: number; contouAoInfinito?: boolean } | undefined;
      return [
        item('trecho entre o r-serra e o r-antena derrubado', derrubou(m, 'r-serra:antena', 'r-antena:serra')),
        item('RIP convergido, com a queda espalhada', !!f?.convergiu && (f.infinitos ?? 0) > 0, `convergiu: ${f?.convergiu ? 'sim' : 'não'}`),
        item('nenhuma métrica subiu no caminho (sem contagem ao infinito)', (f?.subidas ?? 0) === 0 && !f?.contouAoInfinito, `subidas: ${f?.subidas ?? 0}`),
        item(`r-centro sem rota para ${LAN_ANTENA}`, metricaRip(m, 'r-centro', LAN_ANTENA) >= 16, `r-centro: ${metricaRip(m, 'r-centro', LAN_ANTENA)}`),
      ];
    },
    solucao: [
      ['equip', 'r-centro', 'rot-rip-horizonte', { h: 'on' }],
      ['equip', 'r-ponte', 'rot-rip-horizonte', { h: 'on' }],
      ['equip', 'r-serra', 'rot-derrubar', { porta: 'antena' }],
      ['equip', 'r-centro', 'rot-rodar', { n: '' }],
    ],
  },
};

export const ATO4D: Dia[] = [dia79, dia80, dia81];
