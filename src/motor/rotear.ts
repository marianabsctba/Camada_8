// Algoritmos de roteamento do ato 4, parte pura: grafo, caminho mais curto (Dijkstra), árvore de escoamento,
// inundação, vetor de distância (estilo RIP), estado de enlace (estilo OSPF), roteamento hierárquico,
// difusão por caminho reverso, multicast com poda, anycast, MPLS e BGP entre sistemas autônomos.
// Nada aqui conhece o mundo do jogo: entra grafo, sai tabela. A ligação com os roteadores do mundo fica em protocolos.ts.

/* ---------- Grafo ---------- */

/** Um sentido de um enlace. Enlace comum vira duas arestas, uma para cada lado (o custo pode ser diferente em cada sentido). */
export interface Aresta {
  de: string;
  para: string;
  custo: number;
  /** Porta de saída em "de" (só no grafo tirado do mundo). */
  porta?: string;
  /** Porta de chegada em "para". */
  portaPara?: string;
  /** Endereço IP de "para" neste enlace: o próximo salto. */
  ipPara?: number;
  /** Área OSPF do enlace. */
  area?: number;
}

export interface Grafo {
  nos: string[];
  arestas: Aresta[];
}

/** Monta um grafo de enlaces nos dois sentidos: [a, b, custo] ou [a, b, custo de a para b, custo de b para a]. */
export function grafo(ligacoes: ([string, string, number] | [string, string, number, number])[], nosSoltos: string[] = []): Grafo {
  const nos = new Set(nosSoltos);
  const arestas: Aresta[] = [];
  for (const l of ligacoes) {
    const [a, b, c, volta] = l;
    nos.add(a);
    nos.add(b);
    arestas.push({ de: a, para: b, custo: c }, { de: b, para: a, custo: volta ?? c });
  }
  return { nos: [...nos], arestas };
}

export function saindoDe(g: Grafo, no: string): Aresta[] {
  return g.arestas.filter((a) => a.de === no);
}

/** Tira o enlace entre a e b (os dois sentidos), como se o cabo fosse cortado. */
export function semEnlace(g: Grafo, a: string, b: string): Grafo {
  return { nos: [...g.nos], arestas: g.arestas.filter((x) => !((x.de === a && x.para === b) || (x.de === b && x.para === a))) };
}

/** Só as arestas de uma área (e os nós que tocam nela). */
export function subgrafo(g: Grafo, manter: (a: Aresta) => boolean): Grafo {
  const arestas = g.arestas.filter(manter);
  const nos = new Set<string>();
  for (const a of arestas) nos.add(a.de).add(a.para);
  return { nos: g.nos.filter((n) => nos.has(n)), arestas };
}

/* ---------- Caminho mais curto (Dijkstra) ---------- */

export interface PassoDijkstra {
  /** Quem virou permanente neste passo. */
  permanente: string;
  distancia: number;
  /** Rótulos provisórios depois de relaxar os vizinhos dele: distância e por quem. */
  provisorios: Record<string, { distancia: number; anterior?: string }>;
  /** Vizinhos cujo rótulo melhorou neste passo. */
  melhorou: string[];
}

export interface ResultadoDijkstra {
  origem: string;
  dist: Record<string, number>;
  anterior: Record<string, string | undefined>;
  /** Aresta usada para chegar a cada nó (a última do caminho). */
  arestaAnterior: Record<string, Aresta | undefined>;
  /** Ordem em que os nós viraram permanentes. */
  ordem: string[];
  passos: PassoDijkstra[];
}

/**
 * Dijkstra: todo nó começa com rótulo provisório infinito, menos a origem (0). A cada passo, o provisório
 * de menor distância vira permanente e relaxa os vizinhos: se passar por ele fica mais barato, troca o rótulo.
 * Empate: vence o nome menor, para o passo a passo sair sempre igual.
 */
export function dijkstra(g: Grafo, origem: string): ResultadoDijkstra {
  const dist: Record<string, number> = {};
  const anterior: Record<string, string | undefined> = {};
  const arestaAnterior: Record<string, Aresta | undefined> = {};
  for (const n of g.nos) dist[n] = Infinity;
  dist[origem] = 0;
  const permanentes = new Set<string>();
  const ordem: string[] = [];
  const passos: PassoDijkstra[] = [];
  const nos = [...new Set([...g.nos, origem])].sort();
  for (;;) {
    let x: string | null = null;
    for (const n of nos) if (!permanentes.has(n) && dist[n]! < Infinity && (x === null || dist[n]! < dist[x]!)) x = n;
    if (x === null) break;
    permanentes.add(x);
    ordem.push(x);
    const melhorou: string[] = [];
    for (const a of saindoDe(g, x)) {
      if (permanentes.has(a.para)) continue;
      const d = dist[x]! + a.custo;
      if (d < (dist[a.para] ?? Infinity)) {
        dist[a.para] = d;
        anterior[a.para] = x;
        arestaAnterior[a.para] = a;
        melhorou.push(a.para);
      }
    }
    const provisorios: PassoDijkstra['provisorios'] = {};
    for (const n of nos) if (!permanentes.has(n)) provisorios[n] = { distancia: dist[n]!, anterior: anterior[n] };
    passos.push({ permanente: x, distancia: dist[x]!, provisorios, melhorou });
  }
  return { origem, dist, anterior, arestaAnterior, ordem, passos };
}

/** Caminho da origem até o destino, nó a nó; null se não alcança. */
export function caminhoAte(r: ResultadoDijkstra, destino: string): string[] | null {
  if (r.dist[destino] === undefined || r.dist[destino] === Infinity) return null;
  const c = [destino];
  while (c[0] !== r.origem) {
    const a = r.anterior[c[0]!];
    if (a === undefined) return null;
    c.unshift(a);
  }
  return c;
}

/** A primeira aresta do caminho até o destino: é o que vai para a tabela de rotas (o próximo salto). */
export function primeiraAresta(r: ResultadoDijkstra, destino: string): Aresta | undefined {
  const c = caminhoAte(r, destino);
  if (!c || c.length < 2) return undefined;
  return r.arestaAnterior[c[1]!];
}

const infTxt = (n: number) => (n === Infinity ? '∞' : String(n));

/** O passo a passo do Dijkstra em linhas de texto, para a aula e o console. */
export function textoDijkstra(r: ResultadoDijkstra): string[] {
  const l = [`Dijkstra a partir de ${r.origem}: todo mundo começa provisório com ∞, ${r.origem} com 0.`];
  r.passos.forEach((p, i) => {
    const prov = Object.entries(p.provisorios).map(([n, v]) => `${n}=${infTxt(v.distancia)}${v.anterior ? `(${v.anterior})` : ''}`);
    l.push(`passo ${i + 1}: ${p.permanente} vira permanente com ${p.distancia}${p.melhorou.length ? `; melhoram ${p.melhorou.join(', ')}` : ''}${prov.length ? `. Provisórios: ${prov.join(' ')}` : '. Não sobrou ninguém provisório.'}`);
  });
  const fora = Object.entries(r.dist).filter(([, d]) => d === Infinity).map(([n]) => n);
  if (fora.length) l.push(`Sem caminho até ${fora.join(', ')}.`);
  return l;
}

/**
 * Árvore de escoamento (sink tree) para um destino: o princípio de otimização diz que, se o caminho ótimo
 * de I a K passa por J, o trecho de J a K também é ótimo. Então os caminhos ótimos de todos até K formam uma árvore.
 * Devolve, para cada nó, o próximo salto rumo ao destino e o custo.
 */
export function arvoreEscoamento(g: Grafo, destino: string): Record<string, { proximo?: string; custo: number }> {
  // Inverte os sentidos: o Dijkstra a partir do destino no grafo invertido dá o custo de cada um ATÉ o destino.
  const inv: Grafo = { nos: g.nos, arestas: g.arestas.map((a) => ({ ...a, de: a.para, para: a.de })) };
  const r = dijkstra(inv, destino);
  const out: Record<string, { proximo?: string; custo: number }> = {};
  for (const n of g.nos) out[n] = { proximo: r.anterior[n], custo: r.dist[n] ?? Infinity };
  return out;
}

/* ---------- Inundação ---------- */

export type ModoInundacao = 'sem-controle' | 'saltos' | 'sequencia';

export interface ResultadoInundacao {
  modo: ModoInundacao;
  /** Cópias transmitidas em enlaces, no total. */
  copias: number;
  /** Cópias por rodada (uma rodada é um salto de todo mundo ao mesmo tempo). */
  porRodada: number[];
  /** Quem recebeu pelo menos uma cópia (a origem conta). */
  alcancados: string[];
  /** Cópias que chegaram e foram jogadas fora (contador zerado ou número de sequência repetido). */
  descartadas: number;
  /** Sem controle e com laço, a inundação não para sozinha: paramos no limite de rodadas. */
  semFim: boolean;
}

/**
 * Inundação: cada roteador manda o pacote por todos os enlaces, menos o de onde ele veio.
 * Sem controle, num grafo com laço, as cópias não acabam nunca. Com contador de saltos, cada cópia nasce com k
 * e morre ao chegar em zero. Com número de sequência por origem, cada roteador repassa só a primeira cópia
 * que vê de (origem, sequência) e joga fora as repetidas.
 */
export function inundar(g: Grafo, origem: string, o: { modo: ModoInundacao; saltos?: number; limiteRodadas?: number }): ResultadoInundacao {
  const k = o.saltos ?? Math.max(1, g.nos.length - 1);
  const limite = o.limiteRodadas ?? 10;
  const vistos = new Set([origem]);
  const alcancados = new Set([origem]);
  type Copia = { em: string; veio: string; saltos: number };
  let voando: Copia[] = saindoDe(g, origem).map((a) => ({ em: a.para, veio: origem, saltos: k - 1 }));
  const porRodada: number[] = [];
  let descartadas = 0;
  let semFim = false;
  while (voando.length) {
    if (porRodada.length >= limite) {
      semFim = true;
      break;
    }
    porRodada.push(voando.length);
    const prox: Copia[] = [];
    for (const c of voando) {
      alcancados.add(c.em);
      if (o.modo === 'sequencia') {
        if (vistos.has(c.em)) {
          descartadas++;
          continue;
        }
        vistos.add(c.em);
      }
      if (o.modo === 'saltos' && c.saltos <= 0) {
        descartadas++;
        continue;
      }
      for (const a of saindoDe(g, c.em)) if (a.para !== c.veio) prox.push({ em: a.para, veio: c.em, saltos: c.saltos - 1 });
    }
    voando = prox;
  }
  return { modo: o.modo, copias: porRodada.reduce((s, x) => s + x, 0), porRodada, alcancados: [...alcancados].sort(), descartadas, semFim };
}

/* ---------- Vetor de distância (estilo RIP) ---------- */

export interface EntradaVD {
  custo: number;
  /** Vizinho por onde se chega (o próximo salto). Sem via: é do próprio roteador. */
  via?: string;
  aresta?: Aresta;
}

/** Tabela de cada roteador: destino → custo e por onde. */
export type TabelasVD = Record<string, Record<string, EntradaVD>>;

export type Horizonte = 'nenhum' | 'dividido' | 'envenenado';

export interface OpcoesVD {
  /** Métrica que vale infinito. No RIP, 16. */
  infinito?: number;
  /**
   * Horizonte dividido: não conta ao vizinho a rota que se aprendeu dele. Envenenamento reverso: conta, mas com infinito.
   * Pode ser um só para todos ou um por roteador (vale o de quem manda o vetor).
   */
  horizonte?: Horizonte | Record<string, Horizonte>;
  /** "saltos" ignora o custo das arestas e conta 1 por enlace, como o RIP. */
  metrica?: 'saltos' | 'custo';
}

/** Cada roteador começa sabendo só de si (ou das redes que ele mesmo tem), com custo 0. */
export function iniciarVD(g: Grafo, origina?: Record<string, string[]>): TabelasVD {
  const t: TabelasVD = {};
  for (const n of g.nos) {
    t[n] = {};
    for (const d of origina ? (origina[n] ?? []) : [n]) t[n]![d] = { custo: 0 };
  }
  return t;
}

/** O vetor que "de" manda ao vizinho "para", já com o horizonte aplicado. */
export function vetorPara(t: TabelasVD, de: string, para: string, o: OpcoesVD = {}): Record<string, number> {
  const inf = o.infinito ?? 16;
  const h = typeof o.horizonte === 'string' ? o.horizonte : (o.horizonte?.[de] ?? 'nenhum');
  const v: Record<string, number> = {};
  for (const [d, e] of Object.entries(t[de] ?? {})) {
    if (e.via === para && h === 'dividido') continue;
    v[d] = e.via === para && h === 'envenenado' ? inf : e.custo;
  }
  return v;
}

/**
 * Uma rodada: todo mundo manda o vetor aos vizinhos ao mesmo tempo, e cada um refaz a tabela só com o que recebeu
 * (Bellman-Ford distribuído). Quem se origina continua com 0. Destino que ninguém mais anuncia fica com infinito
 * se ainda havia rota antes (é assim que a queda se espalha), e some quando já estava em infinito.
 */
export function rodadaVD(g: Grafo, t: TabelasVD, o: OpcoesVD = {}, origina?: Record<string, string[]>): { tabelas: TabelasVD; mudou: boolean } {
  const inf = o.infinito ?? 16;
  const nova: TabelasVD = {};
  let mudou = false;
  for (const n of g.nos) {
    const tab: Record<string, EntradaVD> = {};
    const proprios = origina ? (origina[n] ?? []) : [n];
    for (const d of proprios) tab[d] = { custo: 0 };
    for (const a of saindoDe(g, n)) {
      const vet = vetorPara(t, a.para, n, o);
      const c = o.metrica === 'saltos' ? 1 : a.custo;
      for (const [d, cv] of Object.entries(vet)) {
        if (proprios.includes(d)) continue;
        const total = Math.min(inf, cv + c);
        // Notícia de infinito só serve para quem já tinha aquele destino; não cria entrada nova.
        if (total >= inf && !t[n]?.[d]) continue;
        const atual = tab[d];
        if (!atual || total < atual.custo || (total === atual.custo && a.para < (atual.via ?? '') && total < inf)) tab[d] = total >= inf ? { custo: inf } : { custo: total, via: a.para, aresta: a };
      }
    }
    // Destino que sumiu dos vetores: vira infinito uma vez (o aviso de queda) e depois sai da tabela.
    for (const [d, e] of Object.entries(t[n] ?? {})) if (!tab[d] && e.custo < inf) tab[d] = { custo: inf };
    const antes = t[n] ?? {};
    const chaves = new Set([...Object.keys(antes), ...Object.keys(tab)]);
    for (const d of chaves) if (antes[d]?.custo !== tab[d]?.custo || antes[d]?.via !== tab[d]?.via) mudou = true;
    nova[n] = tab;
  }
  return { tabelas: nova, mudou };
}

export interface ResultadoVD {
  tabelas: TabelasVD;
  /** Tabelas depois de cada rodada (a 0 é a de antes da primeira). */
  historico: TabelasVD[];
  rodadas: number;
  convergiu: boolean;
}

/** Roda rodadas até ninguém mudar mais (ou até o limite). */
export function convergirVD(g: Grafo, o: OpcoesVD = {}, inicio?: TabelasVD, max = 40, origina?: Record<string, string[]>): ResultadoVD {
  let t = inicio ?? iniciarVD(g, origina);
  const historico = [t];
  for (let i = 0; i < max; i++) {
    const r = rodadaVD(g, t, o, origina);
    if (!r.mudou) return { tabelas: t, historico, rodadas: i, convergiu: true };
    t = r.tabelas;
    historico.push(t);
  }
  return { tabelas: t, historico, rodadas: max, convergiu: false };
}

/** Métrica de cada roteador até um destino, rodada a rodada: é aqui que a contagem ao infinito aparece. */
export function metricasPorRodada(h: TabelasVD[], destino: string, nos: string[]): Record<string, number | null>[] {
  return h.map((t) => Object.fromEntries(nos.map((n) => [n, t[n]?.[destino]?.custo ?? null])));
}

/* ---------- Estado de enlace (estilo OSPF) ---------- */

/** Pacote de estado de enlace: quem sou, meus vizinhos e quanto custa chegar em cada um, mais as redes que eu tenho. */
export interface Lsp {
  origem: string;
  seq: number;
  /** Segundos de vida que sobram; a cada salto e a cada segundo diminui. Zero: some do banco. */
  idade: number;
  vizinhos: { no: string; custo: number }[];
  redes: { prefixo: string; custo: number }[];
  area?: number;
}

export const IDADE_LSP = 3600;

export function montarLsp(g: Grafo, no: string, seq = 1, redes: { prefixo: string; custo: number }[] = [], area?: number): Lsp {
  return { origem: no, seq, idade: IDADE_LSP, vizinhos: saindoDe(g, no).map((a) => ({ no: a.para, custo: a.custo })), redes, area };
}

export interface ResultadoLsdb {
  /** Banco de estado de enlace de cada roteador: origem → LSP mais novo que ele viu. */
  bancos: Record<string, Record<string, Lsp>>;
  /** Cópias de LSP que trafegaram nos enlaces na inundação. */
  copias: number;
  /** Cópias que chegaram repetidas ou velhas e foram descartadas. */
  descartadas: number;
}

/**
 * Inunda todos os LSPs com controle por número de sequência: quem recebe um LSP mais novo do que o que tem
 * guarda e repassa para os outros vizinhos; igual ou mais velho, descarta. A idade cai 1 a cada salto.
 */
export function inundarLsps(g: Grafo, lsps: Lsp[], bancosAntes?: Record<string, Record<string, Lsp>>): ResultadoLsdb {
  const bancos: Record<string, Record<string, Lsp>> = {};
  for (const n of g.nos) bancos[n] = { ...(bancosAntes?.[n] ?? {}) };
  let copias = 0;
  let descartadas = 0;
  for (const lsp of lsps) {
    bancos[lsp.origem] ??= {};
    bancos[lsp.origem]![lsp.origem] = lsp;
    let voando = saindoDe(g, lsp.origem).map((a) => ({ em: a.para, veio: lsp.origem, l: { ...lsp, idade: lsp.idade - 1 } }));
    while (voando.length) {
      const prox: typeof voando = [];
      for (const c of voando) {
        copias++;
        const b = (bancos[c.em] ??= {});
        const tenho = b[lsp.origem];
        if (tenho && tenho.seq >= c.l.seq) {
          descartadas++;
          continue;
        }
        b[lsp.origem] = c.l;
        if (c.l.idade <= 1) continue;
        for (const a of saindoDe(g, c.em)) if (a.para !== c.veio) prox.push({ em: a.para, veio: c.em, l: { ...c.l, idade: c.l.idade - 1 } });
      }
      voando = prox;
    }
  }
  return { bancos, copias, descartadas };
}

/** Grafo que um roteador monta com o próprio banco. Enlace só vale se os dois lados se anunciam (checagem de mão dupla). */
export function grafoDoBanco(banco: Record<string, Lsp>): Grafo {
  const arestas: Aresta[] = [];
  for (const l of Object.values(banco)) {
    if (l.idade <= 0) continue;
    for (const v of l.vizinhos) if (banco[v.no]?.vizinhos.some((x) => x.no === l.origem)) arestas.push({ de: l.origem, para: v.no, custo: v.custo });
  }
  return { nos: Object.keys(banco).sort(), arestas };
}

/** Cada roteador roda o Dijkstra no próprio banco e acha, para cada rede anunciada, o custo e o próximo salto. */
export function rotasEstadoEnlace(banco: Record<string, Lsp>, raiz: string): Record<string, { custo: number; proximo?: string; anunciante: string }> {
  const r = dijkstra(grafoDoBanco(banco), raiz);
  const out: Record<string, { custo: number; proximo?: string; anunciante: string }> = {};
  for (const l of Object.values(banco)) {
    const d = r.dist[l.origem];
    if (d === undefined || d === Infinity) continue;
    const c = caminhoAte(r, l.origem)!;
    for (const rede of l.redes) {
      const total = d + rede.custo;
      const atual = out[rede.prefixo];
      if (!atual || total < atual.custo) out[rede.prefixo] = { custo: total, proximo: c[1], anunciante: l.origem };
    }
  }
  return out;
}

/* ---------- Roteamento hierárquico ---------- */

export interface ResultadoHierarquico {
  /** Entradas na tabela de cada roteador: plano (um por destino) e hierárquico (os da região mais uma por região). */
  tabelas: Record<string, { plano: number; hierarquico: number }>;
  /** Para cada par origem>destino: custo ótimo, custo seguindo a tabela hierárquica e o caminho. */
  pares: Record<string, { otimo: number; hierarquico: number; caminho: string[] }>;
  /** Soma de custo a mais e o pior caso. */
  extraTotal: number;
  piorExtra: { par: string; extra: number } | null;
}

/**
 * Hierarquia: cada roteador sabe os detalhes da própria região e, das outras, só o melhor caminho até a região
 * (até o roteador mais perto dela). A tabela encolhe, mas às vezes o pacote entra na região pela porta errada
 * e anda mais do que precisava.
 */
export function roteamentoHierarquico(g: Grafo, regioes: Record<string, string>): ResultadoHierarquico {
  const nos = [...g.nos].sort();
  const todas = [...new Set(nos.map((n) => regioes[n] ?? '?'))];
  const tabelas: ResultadoHierarquico['tabelas'] = {};
  const dj: Record<string, ResultadoDijkstra> = {};
  for (const n of nos) dj[n] = dijkstra(g, n);
  const djReg: Record<string, ResultadoDijkstra> = {};
  for (const n of nos) {
    const reg = regioes[n];
    djReg[n] = dijkstra(subgrafo(g, (a) => regioes[a.de] === reg && regioes[a.para] === reg), n);
    const mesma = nos.filter((x) => regioes[x] === reg).length;
    tabelas[n] = { plano: nos.length - 1, hierarquico: mesma - 1 + todas.length - 1 };
  }
  // Para onde cada roteador manda, rumo a um destino, só com o que a tabela hierárquica sabe.
  const proximo = (x: string, d: string): Aresta | undefined => {
    if (regioes[x] === regioes[d]) {
      const a = primeiraAresta(djReg[x]!, d);
      if (a) return a;
      return primeiraAresta(dj[x]!, d);
    }
    // Melhor caminho até a região de d: até o roteador dela mais perto de x (empate, nome menor).
    const alvo = nos.filter((y) => regioes[y] === regioes[d]).sort((p, q) => dj[x]!.dist[p]! - dj[x]!.dist[q]! || (p < q ? -1 : 1))[0];
    return alvo ? primeiraAresta(dj[x]!, alvo) : undefined;
  };
  const pares: ResultadoHierarquico['pares'] = {};
  let extraTotal = 0;
  let piorExtra: ResultadoHierarquico['piorExtra'] = null;
  for (const s of nos) {
    for (const d of nos) {
      if (s === d || dj[s]!.dist[d] === Infinity) continue;
      const caminho = [s];
      let custo = 0;
      let x = s;
      for (let i = 0; i < nos.length * 2 && x !== d; i++) {
        const a = proximo(x, d);
        if (!a) break;
        custo += a.custo;
        x = a.para;
        caminho.push(x);
      }
      if (x !== d) custo = Infinity;
      const otimo = dj[s]!.dist[d]!;
      const par = `${s}>${d}`;
      pares[par] = { otimo, hierarquico: custo, caminho };
      const extra = custo - otimo;
      extraTotal += extra;
      if (!piorExtra || extra > piorExtra.extra) piorExtra = { par, extra };
    }
  }
  return { tabelas, pares, extraTotal, piorExtra };
}

/** Com N roteadores, o número ótimo de níveis é ln N, e cada roteador fica com cerca de e·ln N entradas. */
export function niveisOtimos(n: number): { niveis: number; entradas: number } {
  return { niveis: Math.log(n), entradas: Math.E * Math.log(n) };
}

/* ---------- Difusão (broadcast), multicast e anycast ---------- */

export interface ResultadoDifusao {
  copias: number;
  aceitas: number;
  descartadas: number;
  alcancados: string[];
  /** Enlaces usados (de>para) que entregaram cópia aceita. */
  usados: string[];
}

/**
 * Encaminhamento por caminho reverso (RPF): o roteador só aceita o pacote de difusão se ele chegou pelo enlace
 * que ele mesmo usaria para mandar algo à origem. Aí repassa por todos os outros. O resto é cópia que veio
 * pelo caminho "errado" e é descartada. Não precisa lembrar número de sequência.
 */
export function difusaoRpf(g: Grafo, origem: string): ResultadoDifusao {
  const arv = arvoreEscoamento(g, origem);
  let copias = 0;
  let aceitas = 0;
  let descartadas = 0;
  const alcancados = new Set([origem]);
  const usados: string[] = [];
  let voando = saindoDe(g, origem).map((a) => ({ em: a.para, veio: origem }));
  while (voando.length) {
    const prox: typeof voando = [];
    for (const c of voando) {
      copias++;
      if (arv[c.em]?.proximo !== c.veio) {
        descartadas++;
        continue;
      }
      aceitas++;
      alcancados.add(c.em);
      usados.push(`${c.veio}>${c.em}`);
      for (const a of saindoDe(g, c.em)) if (a.para !== c.veio) prox.push({ em: a.para, veio: c.em });
    }
    voando = prox;
  }
  return { copias, aceitas, descartadas, alcancados: [...alcancados].sort(), usados };
}

/** Árvore de difusão: a de caminhos mais curtos a partir da origem. Cada roteador recebe exatamente uma cópia: n - 1 no total. */
export function arvoreDifusao(g: Grafo, origem: string): { arestas: string[]; copias: number } {
  const r = dijkstra(g, origem);
  const arestas = Object.entries(r.anterior).filter(([, a]) => a !== undefined).map(([n, a]) => `${a}>${n}`).sort();
  return { arestas, copias: arestas.length };
}

/**
 * Multicast: parte da árvore de difusão a partir da origem e poda todo galho que não leva a nenhum roteador
 * com membro do grupo (quem quer ouvir avisou pelo IGMP).
 */
export function arvoreMulticast(g: Grafo, origem: string, membros: string[]): { arestas: string[]; podadas: string[]; copias: number; alcancados: string[] } {
  const r = dijkstra(g, origem);
  const manter = new Set<string>();
  for (const m of membros) {
    const c = caminhoAte(r, m);
    if (!c) continue;
    for (let i = 1; i < c.length; i++) manter.add(`${c[i - 1]}>${c[i]}`);
  }
  const todas = arvoreDifusao(g, origem).arestas;
  const arestas = todas.filter((a) => manter.has(a));
  const alcancados = [...new Set([origem, ...arestas.map((a) => a.split('>')[1]!)])].sort();
  return { arestas, podadas: todas.filter((a) => !manter.has(a)), copias: arestas.length, alcancados };
}

/** Anycast: o mesmo endereço em vários lugares; o roteamento leva cada um ao mais perto. */
export function anycast(g: Grafo, origem: string, servidores: string[]): { escolhido: string | null; custo: number; custos: Record<string, number> } {
  const r = dijkstra(g, origem);
  const custos = Object.fromEntries(servidores.map((s) => [s, r.dist[s] ?? Infinity]));
  const escolhido = [...servidores].sort((a, b) => custos[a]! - custos[b]! || (a < b ? -1 : 1))[0] ?? null;
  return { escolhido: escolhido && custos[escolhido]! < Infinity ? escolhido : null, custo: escolhido ? custos[escolhido]! : Infinity, custos };
}

/* ---------- MPLS ---------- */

export type OperacaoMpls = 'empilhar' | 'trocar' | 'desempilhar';

/** Uma linha da tabela de encaminhamento por rótulo (LFIB). Entrada null: pacote IP sem rótulo, casado pela FEC. */
export interface EntradaLfib {
  entrada: number | null;
  fec: string;
  operacao: OperacaoMpls;
  saida?: number;
  proximo?: string;
}

export type Lfib = Record<string, EntradaLfib[]>;

/** Rótulos 0 a 15 são reservados. Cada roteador escolhe os rótulos que quer receber (alocação a jusante). */
export const PRIMEIRO_ROTULO = 16;

/**
 * Monta um caminho comutado por rótulos (LSP) ao longo de "caminho" para a FEC: o primeiro empilha,
 * os do meio trocam, o último desempilha e segue pelo IP. Cada roteador dá o próprio número ao rótulo de entrada.
 */
export function montarLspMpls(lfib: Lfib, caminho: string[], fec: string): Lfib {
  const nova: Lfib = Object.fromEntries(Object.entries(lfib).map(([k, v]) => [k, v.filter((x) => x.fec !== fec)]));
  // Cada roteador numera do jeito dele; aqui o i-ésimo do caminho começa em 16 + 100·i, para a troca aparecer na tela.
  const proxRotulo = (r: string, i: number) => {
    const usados = new Set((nova[r] ?? []).filter((x) => x.entrada !== null).map((x) => x.entrada!));
    let n = PRIMEIRO_ROTULO + 100 * i;
    while (usados.has(n)) n++;
    return n;
  };
  // Do fim para o começo: o rótulo que o de baixo pediu é o que o de cima põe.
  let abaixo: number | undefined;
  for (let i = caminho.length - 1; i >= 0; i--) {
    const r = caminho[i]!;
    const lista = (nova[r] ??= []);
    if (i === caminho.length - 1) {
      const rot = proxRotulo(r, i);
      lista.push({ entrada: rot, fec, operacao: 'desempilhar' });
      abaixo = rot;
    } else if (i === 0) {
      lista.push({ entrada: null, fec, operacao: 'empilhar', saida: abaixo, proximo: caminho[1] });
    } else {
      const rot = proxRotulo(r, i);
      lista.push({ entrada: rot, fec, operacao: 'trocar', saida: abaixo, proximo: caminho[i + 1] });
      abaixo = rot;
    }
  }
  return nova;
}

export interface PassoMpls {
  roteador: string;
  pilhaAntes: number[];
  operacao: OperacaoMpls | 'ip';
  pilhaDepois: number[];
  proximo?: string;
}

/** Leva um pacote da FEC a partir do roteador de entrada, olhando só o rótulo do topo em cada salto. */
export function comutarMpls(lfib: Lfib, entrada: string, fec: string): { passos: PassoMpls[]; saida: string | null; erro?: string } {
  const passos: PassoMpls[] = [];
  let r = entrada;
  let pilha: number[] = [];
  for (let i = 0; i < 64; i++) {
    const tab = lfib[r] ?? [];
    const topo = pilha[pilha.length - 1];
    const e = topo === undefined ? tab.find((x) => x.entrada === null && x.fec === fec) : tab.find((x) => x.entrada === topo);
    if (!e) {
      if (topo === undefined && i > 0) return { passos, saida: r };
      return { passos, saida: null, erro: topo === undefined ? `${r} não tem caminho de rótulos para ${fec}.` : `${r} não conhece o rótulo ${topo} e descarta o pacote.` };
    }
    const antes = [...pilha];
    if (e.operacao === 'empilhar') pilha = [...pilha, e.saida!];
    else if (e.operacao === 'trocar') pilha = [...pilha.slice(0, -1), e.saida!];
    else pilha = pilha.slice(0, -1);
    passos.push({ roteador: r, pilhaAntes: antes, operacao: e.operacao, pilhaDepois: [...pilha], proximo: e.proximo });
    if (e.operacao === 'desempilhar' && !pilha.length) return { passos, saida: r };
    if (!e.proximo) return { passos, saida: r };
    r = e.proximo;
  }
  return { passos, saida: null, erro: 'O pacote rodou demais entre rótulos.' };
}

/* ---------- BGP ---------- */

/** O que o vizinho é para mim: cliente (me paga), par (troca de graça) ou provedor (eu pago). */
export type Relacao = 'cliente' | 'par' | 'provedor';

export interface NoBgp {
  /** Identificador do roteador (no BGP puro, pode ser o próprio número do AS em texto). */
  id: string;
  asn: number;
  /** Prefixos que este AS origina. */
  prefixos: string[];
  sessoes: { com: string; relacao: Relacao }[];
}

export interface RotaBgp {
  prefixo: string;
  /** Caminho de AS: o primeiro é o vizinho, o último é quem originou. Vazio: é meu. */
  caminho: number[];
  /** Vizinho (id) de quem aprendi; null para prefixo próprio. */
  de: string | null;
  relacao: Relacao | 'propria';
  prefLocal: number;
}

/** Preferência local pela política comercial: rota de cliente dá dinheiro, de par é de graça, de provedor custa. */
export const PREF_LOCAL: Record<Relacao | 'propria', number> = { propria: 1000, cliente: 200, par: 100, provedor: 50 };

/** Decisão do BGP, simplificada: maior preferência local, depois caminho de AS mais curto, depois o menor AS vizinho. */
export function melhorRotaBgp(a: RotaBgp, b: RotaBgp): RotaBgp {
  if (a.prefLocal !== b.prefLocal) return a.prefLocal > b.prefLocal ? a : b;
  if (a.caminho.length !== b.caminho.length) return a.caminho.length < b.caminho.length ? a : b;
  const pa = a.caminho[0] ?? 0;
  const pb = b.caminho[0] ?? 0;
  if (pa !== pb) return pa < pb ? a : b;
  return (a.de ?? '') <= (b.de ?? '') ? a : b;
}

/** Exportação (Gao-Rexford): o que é meu ou de cliente vai para todos; o que veio de par ou de provedor só vai para cliente. */
export function exporta(r: RotaBgp, para: Relacao): boolean {
  if (r.relacao === 'propria' || r.relacao === 'cliente') return true;
  return para === 'cliente';
}

export interface ResultadoBgp {
  /** Todas as rotas candidatas que cada um recebeu (Adj-RIB-In mais as próprias). */
  candidatas: Record<string, RotaBgp[]>;
  /** A melhor por prefixo, em cada nó. */
  melhores: Record<string, Record<string, RotaBgp>>;
  rodadas: number;
  convergiu: boolean;
}

/**
 * Propagação do BGP em rodadas: cada nó anuncia aos vizinhos as melhores rotas que a política deixa exportar,
 * pondo o próprio AS na frente do caminho. Quem recebe descarta se já vê o próprio AS no caminho (evita laço),
 * aplica a preferência local da relação e escolhe a melhor. Sessão só sobe se os dois lados a configuraram.
 */
export function propagarBgp(nos: NoBgp[], max = 30): ResultadoBgp {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const sessoes = (n: NoBgp) => n.sessoes.filter((s) => porId.get(s.com)?.sessoes.some((x) => x.com === n.id));
  const proprias = (n: NoBgp): RotaBgp[] => n.prefixos.map((p) => ({ prefixo: p, caminho: [], de: null, relacao: 'propria', prefLocal: PREF_LOCAL.propria }));
  const escolher = (lista: RotaBgp[]) => {
    const m: Record<string, RotaBgp> = {};
    for (const r of lista) m[r.prefixo] = m[r.prefixo] ? melhorRotaBgp(m[r.prefixo]!, r) : r;
    return m;
  };
  let melhores: Record<string, Record<string, RotaBgp>> = Object.fromEntries(nos.map((n) => [n.id, escolher(proprias(n))]));
  let candidatas: Record<string, RotaBgp[]> = {};
  const chave = (x: Record<string, Record<string, RotaBgp>>) => JSON.stringify(Object.entries(x).map(([k, v]) => [k, Object.entries(v).sort().map(([p, r]) => [p, r.de, r.caminho])]));
  for (let i = 1; i <= max; i++) {
    candidatas = {};
    for (const n of nos) {
      const lista = proprias(n);
      for (const s of sessoes(n)) {
        const viz = porId.get(s.com)!;
        // O que o vizinho é para mim (s.relacao) e o que eu sou para ele.
        const euParaEle = viz.sessoes.find((x) => x.com === n.id)!.relacao;
        for (const r of Object.values(melhores[viz.id] ?? {})) {
          if (r.de === n.id) continue;
          if (!exporta(r, euParaEle)) continue;
          const caminho = [viz.asn, ...r.caminho];
          if (caminho.includes(n.asn)) continue;
          lista.push({ prefixo: r.prefixo, caminho, de: viz.id, relacao: s.relacao, prefLocal: PREF_LOCAL[s.relacao] });
        }
      }
      candidatas[n.id] = lista;
    }
    const novas = Object.fromEntries(nos.map((n) => [n.id, escolher(candidatas[n.id]!)]));
    if (chave(novas) === chave(melhores)) return { candidatas, melhores, rodadas: i, convergiu: true };
    melhores = novas;
  }
  return { candidatas, melhores, rodadas: max, convergiu: false };
}

/** Casa o prefixo mais longo entre as rotas BGP de um nó. Os prefixos vêm em texto "a.b.c.d/n". */
export function casarBgp(melhores: Record<string, RotaBgp>, ip: number, ler: (p: string) => { endereco: number; prefixo: number } | null): RotaBgp | null {
  let melhor: RotaBgp | null = null;
  let tam = -1;
  for (const r of Object.values(melhores)) {
    const c = ler(r.prefixo);
    if (!c) continue;
    const mascara = c.prefixo === 0 ? 0 : (0xffffffff << (32 - c.prefixo)) >>> 0;
    if (((ip & mascara) >>> 0) === ((c.endereco & mascara) >>> 0) && c.prefixo > tam) {
      melhor = r;
      tam = c.prefixo;
    }
  }
  return melhor;
}

/** Os AS que um pacote atravessa de "id" até quem originou o prefixo, seguindo as melhores rotas salto a salto. */
export function caminhoDeDados(res: ResultadoBgp, nos: NoBgp[], id: string, ip: number, ler: (p: string) => { endereco: number; prefixo: number } | null): { ases: number[]; chegouEm: string | null } {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const ases: number[] = [];
  let x: string | null = id;
  for (let i = 0; x && i < 64; i++) {
    const n = porId.get(x)!;
    ases.push(n.asn);
    const r = casarBgp(res.melhores[x] ?? {}, ip, ler);
    if (!r) return { ases, chegouEm: null };
    if (r.de === null) return { ases, chegouEm: x };
    x = r.de;
  }
  return { ases, chegouEm: null };
}
