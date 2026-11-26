// Protocolos de roteamento nos roteadores do mundo: OSPF (estado de enlace, com áreas), RIP (vetor de distância,
// com os temporizadores da RFC 2453 num relógio simulado), BGP (entre sistemas autônomos, com política) e MPLS (caminho por rótulos).
// Os algoritmos estão em rotear.ts; aqui se descobre quem é vizinho de quem pelos cabos e pelas sub-redes,
// e as rotas aprendidas vão para s.rotasDinamicas, que a tabela de rotas (roteamento.ts) já lê.

import { avaliar } from './fisico';
import { enderecoRede, pertence, textoCidr } from './ip';
import { caboNaPorta, type Equipamento, type Mundo } from './mundo';
import { caminho } from './rede';
import { donoDoIp, interfacesL3, roteadorLigado, type RotaDinamica } from './roteamento';
import {
  caminhoAte,
  comutarMpls,
  dijkstra,
  grafoDoBanco,
  inundarLsps,
  montarLsp,
  montarLspMpls,
  propagarBgp,
  avancarRip,
  RIP_ATUALIZACAO_S,
  RIP_COLETA_S,
  RIP_EXPIRA_S,
  rotasEstadoEnlace,
  type Aresta,
  type EntradaLfib,
  type EventoRip,
  type Grafo,
  type Horizonte,
  type Lfib,
  type Lsp,
  type NoBgp,
  type Relacao,
  type ResultadoBgp,
  type RelogioRip,
  type ResultadoDijkstra,
  type RotaRip,
  type RoteadorRip,
} from './rotear';
import { ipTexto, lerCidr, lerIp, type Cidr } from './util';

/* ---------- Vizinhança: quem fala com quem ---------- */

const rede = (c: Cidr) => textoCidr({ endereco: enderecoRede(c), prefixo: c.prefixo });

/** A porta tem cabo e o enlace está de pé (porta derrubada conta como caída). */
export function interfaceAtiva(m: Mundo, e: Equipamento, porta: string): boolean {
  const c = caboNaPorta(m, { equip: e.nome, porta });
  return !!c && avaliar(m, c).up;
}

function velocidade(m: Mundo, e: Equipamento, porta: string): number {
  const c = caboNaPorta(m, { equip: e.nome, porta });
  if (!c) return 0;
  const est = avaliar(m, c);
  return est.up ? est.velocidade : 0;
}

export interface Adjacencia {
  de: string;
  para: string;
  porta: string;
  portaPara: string;
  ipDe: number;
  ipPara: number;
  rede: string;
}

/**
 * Dois roteadores são vizinhos quando têm interfaces na mesma sub-rede e o quadro passa de um ao outro
 * (cabo direto ou atravessando switches). Devolve os dois sentidos.
 */
export function adjacencias(m: Mundo, aceita: (e: Equipamento) => boolean = () => true): Adjacencia[] {
  const rs = [...m.equipamentos.values()].filter((e) => roteadorLigado(e) && aceita(e));
  const out: Adjacencia[] = [];
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i]!;
      const b = rs[j]!;
      for (const ia of interfacesL3(a)) {
        for (const ib of interfacesL3(b)) {
          if (ia.cidr.prefixo !== ib.cidr.prefixo || enderecoRede(ia.cidr) !== enderecoRede(ib.cidr)) continue;
          if (!interfaceAtiva(m, a, ia.porta) || !interfaceAtiva(m, b, ib.porta)) continue;
          if (!caminho(m, a.nome, b.nome, { portaOrigem: ia.porta, portaDestino: ib.porta })) continue;
          const r = rede(ia.cidr);
          out.push({ de: a.nome, para: b.nome, porta: ia.porta, portaPara: ib.porta, ipDe: ia.cidr.endereco, ipPara: ib.cidr.endereco, rede: r });
          out.push({ de: b.nome, para: a.nome, porta: ib.porta, portaPara: ia.porta, ipDe: ib.cidr.endereco, ipPara: ia.cidr.endereco, rede: r });
        }
      }
    }
  }
  return out;
}

/* ---------- Custo e área por interface (OSPF) ---------- */

export interface ConfigOspf {
  ligado: boolean;
  custos: Record<string, number>;
  areas: Record<string, number>;
  /** Número de sequência do LSP de cada área e o conteúdo da última versão. */
  seqs?: Record<string, { seq: number; conteudo: string }>;
  vizinhos?: { vizinho: string; porta: string; area: number; custo: number }[];
  lsdb?: Record<string, Lsp[]>;
}

export function ospfDe(e: Equipamento): ConfigOspf | undefined {
  return e.s.ospf as ConfigOspf | undefined;
}

export function configOspf(e: Equipamento): ConfigOspf {
  return (e.s.ospf ??= { ligado: false, custos: {}, areas: {} }) as ConfigOspf;
}

/** Referência de largura de banda do OSPF: 100 Mb/s. Custo = 10^8 / bps, com a divisão inteira truncada como nos roteadores de verdade (a RFC 2328 deixa a conta para cada fabricante), no mínimo 1. Acima de 100 Mb/s, tudo dá 1. */
export const REFERENCIA_OSPF = 1e8;

export function custoOspf(m: Mundo, e: Equipamento, porta: string): number {
  const c = ospfDe(e)?.custos[porta];
  if (c) return c;
  const v = velocidade(m, e, porta);
  if (!v) return 65535;
  return Math.max(1, Math.min(65535, Math.floor(REFERENCIA_OSPF / (v * 1e6))));
}

export function areaDa(e: Equipamento, porta: string): number {
  return ospfDe(e)?.areas[porta] ?? 0;
}

/** Grafo dos roteadores do mundo: nós são roteadores, arestas são os enlaces entre eles, com o custo OSPF de quem manda. */
export function grafoDoMundo(m: Mundo, o: { aceita?: (e: Equipamento) => boolean; metrica?: 'ospf' | 'saltos' } = {}): Grafo {
  const aceita = o.aceita ?? (() => true);
  const nos = [...m.equipamentos.values()].filter((e) => roteadorLigado(e) && aceita(e)).map((e) => e.nome).sort();
  const arestas: Aresta[] = adjacencias(m, aceita).map((a) => {
    const e = m.equipamentos.get(a.de)!;
    return { de: a.de, para: a.para, custo: o.metrica === 'saltos' ? 1 : custoOspf(m, e, a.porta), porta: a.porta, portaPara: a.portaPara, ipPara: a.ipPara, area: areaDa(e, a.porta) };
  });
  return { nos, arestas };
}

/** Redes que o roteador tem e estão de pé: é o que ele anuncia. */
function redesAtivas(m: Mundo, e: Equipamento): { prefixo: string; porta: string }[] {
  return interfacesL3(e).filter((i) => interfaceAtiva(m, e, i.porta)).map((i) => ({ prefixo: rede(i.cidr), porta: i.porta }));
}

function instalar(e: Equipamento, origem: RotaDinamica['origem'], novas: RotaDinamica[]): void {
  const outras = ((e.s.rotasDinamicas as RotaDinamica[] | undefined) ?? []).filter((r) => r.origem !== origem);
  const todas = [...outras, ...novas];
  if (todas.length) e.s.rotasDinamicas = todas;
  else delete e.s.rotasDinamicas;
}

/* ---------- OSPF ---------- */

export interface ResultadoOspf {
  roteadores: string[];
  areas: number[];
  abr: string[];
  copias: number;
  descartadas: number;
  rotas: Record<string, RotaDinamica[]>;
  erros: string[];
}

interface Candidata {
  custo: number;
  proximo: string;
  area: number;
  tipo: 'intra' | 'inter';
}

/**
 * OSPF inteiro, do jeito que acontece num roteador de verdade (resumido): descobre os vizinhos (hello), mede o custo
 * de cada interface, monta um LSP por área, inunda com número de sequência, cada um roda o Dijkstra no próprio banco
 * e instala as rotas. Entre áreas, o roteador de borda (ABR) resume o que sabe de uma área para as outras, sempre
 * passando pela área 0 (o backbone).
 */
export function calcularOspf(m: Mundo): ResultadoOspf {
  const todos = [...m.equipamentos.values()];
  for (const e of todos) if (e.s.rotasDinamicas) instalar(e, 'ospf', []);
  const ligados = todos.filter((e) => ospfDe(e)?.ligado && roteadorLigado(e));
  const nomes = ligados.map((e) => e.nome).sort();
  const res: ResultadoOspf = { roteadores: nomes, areas: [], abr: [], copias: 0, descartadas: 0, rotas: {}, erros: [] };
  if (!ligados.length) {
    delete m.flags.ospf;
    return res;
  }
  const eq = (n: string) => m.equipamentos.get(n)!;
  const adj = adjacencias(m, (e) => !!ospfDe(e)?.ligado);
  const arestas: Aresta[] = [];
  for (const a of adj) {
    const ea = eq(a.de);
    const eb = eq(a.para);
    const aa = areaDa(ea, a.porta);
    const ab = areaDa(eb, a.portaPara);
    if (aa !== ab) {
      if (a.de < a.para) res.erros.push(`${a.de}:${a.porta} está na área ${aa} e ${a.para}:${a.portaPara} na área ${ab}: com áreas diferentes no mesmo enlace, o hello não fecha e não vira vizinho.`);
      continue;
    }
    arestas.push({ de: a.de, para: a.para, custo: custoOspf(m, ea, a.porta), porta: a.porta, portaPara: a.portaPara, ipPara: a.ipPara, area: aa });
  }
  const redes: Record<string, { prefixo: string; porta: string; custo: number; area: number }[]> = {};
  for (const e of ligados) redes[e.nome] = redesAtivas(m, e).map((r) => ({ ...r, custo: custoOspf(m, e, r.porta), area: areaDa(e, r.porta) }));
  const areas = [...new Set(Object.values(redes).flat().map((r) => r.area))].sort((a, b) => a - b);
  res.areas = areas;
  const areasDe = (n: string) => [...new Set(redes[n]!.map((r) => r.area))];
  // Um banco de estado de enlace por área.
  const bancos: Record<number, Record<string, Record<string, Lsp>>> = {};
  for (const area of areas) {
    const nosA = nomes.filter((n) => areasDe(n).includes(area));
    const gA: Grafo = { nos: nosA, arestas: arestas.filter((x) => x.area === area) };
    const lsps = nosA.map((n) => {
      const cfg = ospfDe(eq(n))!;
      const minhas = redes[n]!.filter((r) => r.area === area).map((r) => ({ prefixo: r.prefixo, custo: r.custo }));
      const base = montarLsp(gA, n, 1, minhas, area);
      const conteudo = JSON.stringify([base.vizinhos, base.redes]);
      const s = ((cfg.seqs ??= {})[String(area)] ??= { seq: 0, conteudo: '' });
      if (s.conteudo !== conteudo) {
        s.seq++;
        s.conteudo = conteudo;
      }
      return { ...base, seq: s.seq };
    });
    const inund = inundarLsps(gA, lsps);
    res.copias += inund.copias;
    res.descartadas += inund.descartadas;
    bancos[area] = inund.bancos;
  }
  // Rotas dentro da área: Dijkstra de cada um no próprio banco.
  const dj: Record<string, Record<number, ResultadoDijkstra>> = {};
  const melhor: Record<string, Record<string, Candidata>> = {};
  const conectadas = (n: string) => new Set(redes[n]!.map((r) => r.prefixo));
  const propor = (n: string, p: string, c: Candidata) => {
    if (conectadas(n).has(p)) return;
    const atual = melhor[n]![p];
    if (atual && atual.tipo === 'intra' && c.tipo === 'inter') return;
    if (!atual || (c.tipo === 'intra' && atual.tipo === 'inter') || c.custo < atual.custo) melhor[n]![p] = c;
  };
  for (const n of nomes) {
    dj[n] = {};
    melhor[n] = {};
    for (const area of areasDe(n)) {
      const banco = bancos[area]![n] ?? {};
      dj[n]![area] = dijkstra(grafoDoBanco(banco), n);
      for (const [p, r] of Object.entries(rotasEstadoEnlace(banco, n))) if (r.proximo) propor(n, p, { custo: r.custo, proximo: r.proximo, area, tipo: 'intra' });
    }
  }
  // Entre áreas: os ABRs resumem.
  const abr = nomes.filter((n) => areasDe(n).includes(0) && areasDe(n).some((a) => a !== 0));
  res.abr = abr;
  const conhecido = (b: string) => {
    const k: Record<string, { custo: number; area: number }> = {};
    for (const r of redes[b]!) if (!k[r.prefixo] || r.custo < k[r.prefixo]!.custo) k[r.prefixo] = { custo: r.custo, area: r.area };
    for (const [p, c] of Object.entries(melhor[b]!)) if (!k[p]) k[p] = { custo: c.custo, area: c.tipo === 'intra' ? c.area : -1 };
    return k;
  };
  const usarResumos = (n: string, area: number, resumos: { b: string; p: string; custo: number }[]) => {
    for (const s of resumos) {
      if (s.b === n) continue;
      const d = dj[n]![area]?.dist[s.b];
      if (d === undefined || d === Infinity) continue;
      const c = caminhoAte(dj[n]![area]!, s.b)!;
      propor(n, s.p, { custo: d + s.custo, proximo: c[1]!, area, tipo: 'inter' });
    }
  };
  if (abr.length) {
    // Para a área 0: o que cada ABR sabe por dentro das outras áreas.
    const r0 = abr.flatMap((b) => Object.entries(conhecido(b)).filter(([, k]) => k.area > 0).map(([p, k]) => ({ b, p, custo: k.custo })));
    for (const n of nomes.filter((x) => areasDe(x).includes(0))) usarResumos(n, 0, r0);
    // Para cada área que não é a 0: tudo o que o ABR sabe e não é daquela área.
    for (const area of areas.filter((a) => a !== 0)) {
      const rx = abr.filter((b) => areasDe(b).includes(area)).flatMap((b) => Object.entries(conhecido(b)).filter(([, k]) => k.area !== area).map(([p, k]) => ({ b, p, custo: k.custo })));
      for (const n of nomes.filter((x) => !abr.includes(x) && areasDe(x).includes(area))) usarResumos(n, area, rx);
    }
  }
  // Instala.
  for (const n of nomes) {
    const e = eq(n);
    const novas: RotaDinamica[] = [];
    for (const [p, c] of Object.entries(melhor[n]!)) {
      const a = arestas.filter((x) => x.de === n && x.para === c.proximo && x.area === c.area).sort((x, y) => x.custo - y.custo)[0];
      if (!a?.ipPara) continue;
      novas.push({ destino: p, via: ipTexto(a.ipPara), origem: 'ospf', metrica: c.custo, nota: `${c.tipo === 'intra' ? 'intra-área' : 'entre áreas'}, área ${c.area}` });
    }
    novas.sort((a, b) => a.destino.localeCompare(b.destino));
    instalar(e, 'ospf', novas);
    res.rotas[n] = novas;
    const cfg = ospfDe(e)!;
    cfg.vizinhos = arestas.filter((x) => x.de === n).map((x) => ({ vizinho: x.para, porta: x.porta!, area: x.area!, custo: x.custo }));
    cfg.lsdb = Object.fromEntries(areasDe(n).map((a) => [String(a), Object.values(bancos[a]![n] ?? {}).sort((x, y) => x.origem.localeCompare(y.origem))]));
  }
  m.flags.ospf = { roteadores: nomes, areas, abr, copias: res.copias, descartadas: res.descartadas, rotas: Object.fromEntries(nomes.map((n) => [n, res.rotas[n]!.length])), erros: res.erros };
  return res;
}

/* ---------- RIP ---------- */

/** Configuração e estado do RIP num roteador: a tabela com os temporizadores fica aqui mesmo (RoteadorRip). */
export interface ConfigRip extends RoteadorRip {
  ligado: boolean;
  horizonte: Horizonte;
  tabela?: Record<string, RotaRip>;
}

export function ripDe(e: Equipamento): ConfigRip | undefined {
  return e.s.rip as ConfigRip | undefined;
}

export function configRip(e: Equipamento): ConfigRip {
  return (e.s.rip ??= { ligado: false, horizonte: 'nenhum' }) as ConfigRip;
}

/** Apaga o estado do RIP de um roteador (tabela e temporizadores), como se o processo reiniciasse. */
export function zerarRip(e: Equipamento): void {
  const c = ripDe(e);
  if (!c) return;
  delete c.tabela;
  delete c.proxPeriodica;
  delete c.seguraAte;
  delete c.pendente;
}

export const INFINITO_RIP = 16;
export { RIP_ATUALIZACAO_S, RIP_COLETA_S, RIP_EXPIRA_S } from './rotear';

/** O que o laboratório guarda sobre o RIP em m.flags.rip. */
export interface EstadoRip {
  /** Relógio do RIP, em segundos desde que o primeiro roteador ligou o protocolo. */
  relogio: number;
  /** Estado do sorteio das variações de tempo (mesmo dia, mesma linha do tempo). */
  sorteio: number;
  /** Métricas finitas que subiram no episódio atual (desde a última convergência). */
  subidas: number;
  /** Rotas que viraram 16 no episódio atual. */
  infinitos: number;
  /** No episódio atual, alguma rota foi empurrada de 15 para 16 por um vizinho que ainda anunciava 15: contou até o fim. */
  contouAoInfinito: boolean;
  /** Agora: na última execução alguma métrica finita subiu e a rede ainda não parou (a contagem está andando). */
  contando: boolean;
  /** Histórico: quantos episódios terminaram em contagem ao infinito (não volta a zero). */
  contagens: number;
  /** Nenhuma atualização futura muda métrica ou próximo salto. */
  convergiu?: boolean;
  metricas?: Record<string, Record<string, number>>;
}

/** Semente do sorteio tirada dos nomes dos roteadores: o mesmo dia dá sempre a mesma linha do tempo. */
function sementeRip(nomes: string[]): number {
  let h = 2166136261;
  for (const c of nomes.join(',')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export function estadoRip(m: Mundo, nomes: string[] = []): EstadoRip {
  const f = (m.flags.rip ??= {}) as Partial<EstadoRip>;
  f.relogio ??= 0;
  f.sorteio ??= sementeRip(nomes);
  f.subidas ??= 0;
  f.infinitos ??= 0;
  f.contouAoInfinito ??= false;
  f.contando ??= false;
  f.contagens ??= 0;
  return f as EstadoRip;
}

function instalarRip(e: Equipamento): void {
  const t = ripDe(e)?.ligado ? (ripDe(e)!.tabela ?? {}) : {};
  const novas: RotaDinamica[] = [];
  for (const [d, x] of Object.entries(t)) {
    if (x.custo >= INFINITO_RIP || !x.via || x.aresta?.ipPara === undefined) continue;
    novas.push({ destino: d, via: ipTexto(x.aresta.ipPara), origem: 'rip', metrica: x.custo, nota: `${x.custo} salto(s) via ${x.via}` });
  }
  instalar(e, 'rip', novas.sort((a, b) => a.destino.localeCompare(b.destino)));
}

const metricaTxt = (n: number | undefined) => (n === undefined ? 'nada' : n >= INFINITO_RIP ? '16 (infinito)' : String(n));

/** Segundos com uma casa e vírgula: 95.3 vira "95,3". */
export const segTxt = (s: number) => s.toFixed(1).replace('.', ',');

/** Uma linha da linha do tempo do RIP. */
function textoEvento(x: EventoRip): string {
  const por = x.por === 'resposta' ? `resposta do ${x.de} ao pedido de tabela` : x.por ? `${x.por} do ${x.de}` : '';
  const pre = `  ${segTxt(x.t).padStart(7)} s  ${x.roteador}: `;
  switch (x.tipo) {
    case 'partida':
      return `${pre}RIP começou; pediu a tabela aos vizinhos`;
    case 'aprendeu':
      return `${pre}${x.destino} nova, ${x.depois} via ${x.via} (${por})`;
    case 'melhorou':
    case 'subiu':
      return `${pre}${x.destino} ${metricaTxt(x.antes)} → ${x.depois} via ${x.via} (${por})`;
    case 'infinito':
      return `${pre}${x.destino} ${metricaTxt(x.antes)} → 16 (infinito): o ${x.de} anunciou ${x.contou ? '15' : '16'} na ${x.por}; coleta de lixo em ${RIP_COLETA_S} s`;
    case 'expirou':
      return `${pre}${x.destino} ${metricaTxt(x.antes)} → 16 (infinito): ${RIP_EXPIRA_S} s sem notícia do ${x.via}; coleta de lixo em ${RIP_COLETA_S} s`;
    case 'perdeu-rede':
      return `${pre}${x.destino} 0 → 16 (infinito): a interface caiu e a rede deixou de ser minha; coleta de lixo em ${RIP_COLETA_S} s`;
    case 'rede-voltou':
      return `${pre}${x.destino} ${metricaTxt(x.antes)} → 0: a interface voltou`;
    case 'apagou':
      return `${pre}${x.destino} apagada da tabela pela coleta de lixo`;
  }
}

export interface ExecucaoRip {
  inicio: number;
  fim: number;
  convergiu: boolean;
  linhas: string[];
  /** Nesta execução alguma rota chegou a 16 contando (o vizinho ainda dizia 15). */
  contou: boolean;
  /** Há métrica subindo e a rede ainda não parou. */
  contando: boolean;
  periodicas: number;
  disparadas: number;
  eventos: EventoRip[];
}

/**
 * Faz o relógio do RIP andar (RFC 2453; os temporizadores estão em avancarRip, rotear.ts). Sem n, até a rede
 * ficar quieta: nenhuma atualização muda mais nada e nenhuma coleta de lixo pendente (no máximo 1 h de relógio).
 * Com n, anda n intervalos de 30 s e para onde estiver.
 *
 * O estado da contagem ao infinito reflete a rede atual: a primeira mudança de rota depois de uma convergência
 * abre um episódio novo e zera subidas, infinitos e contouAoInfinito. Assim, depois de ligar o horizonte dividido
 * ou de o enlace voltar, o aviso some quando a rede convergir de novo. O histórico fica em "contagens".
 */
export function rodarRip(m: Mundo, n?: number): ExecucaoRip {
  const todos = [...m.equipamentos.values()];
  for (const e of todos) {
    if (ripDe(e)?.ligado && roteadorLigado(e)) continue;
    if (ripDe(e)) zerarRip(e);
    if (e.s.rotasDinamicas) instalar(e, 'rip', []);
  }
  const ligados = todos.filter((e) => ripDe(e)?.ligado && roteadorLigado(e));
  const nomes = ligados.map((e) => e.nome).sort();
  const f = estadoRip(m, nomes);
  if (!ligados.length) return { inicio: f.relogio, fim: f.relogio, convergiu: true, linhas: ['Nenhum roteador com RIP ligado.'], contou: false, contando: false, periodicas: 0, disparadas: 0, eventos: [] };
  const g: Grafo = {
    nos: nomes,
    arestas: adjacencias(m, (e) => !!ripDe(e)?.ligado).map((a) => ({ de: a.de, para: a.para, custo: 1, porta: a.porta, portaPara: a.portaPara, ipPara: a.ipPara })),
  };
  const origina: Record<string, string[]> = Object.fromEntries(ligados.map((e) => [e.nome, redesAtivas(m, e).map((r) => r.prefixo)]));
  const rs: Record<string, RoteadorRip> = Object.fromEntries(ligados.map((e) => [e.nome, ripDe(e)!]));
  const rel: RelogioRip = { agora: f.relogio, sorteio: f.sorteio };
  const r = avancarRip(g, origina, rs, rel, n === undefined ? { convergir: true, infinito: INFINITO_RIP } : { ate: f.relogio + n * RIP_ATUALIZACAO_S, infinito: INFINITO_RIP });
  f.relogio = rel.agora;
  f.sorteio = rel.sorteio;
  let subiu = false;
  let contou = false;
  for (const x of r.eventos) {
    if (!x.mudanca) continue;
    // Rede estava parada (ou é a primeira vez) e agora mudou: episódio novo, o aviso velho não vale mais.
    if (f.convergiu !== false) {
      f.subidas = 0;
      f.infinitos = 0;
      f.contouAoInfinito = false;
      f.convergiu = false;
    }
    if (x.tipo === 'subiu' && (x.antes ?? 0) > 0) {
      f.subidas++;
      subiu = true;
    }
    if ((x.tipo === 'infinito' || x.tipo === 'expirou' || x.tipo === 'perdeu-rede') && (x.antes ?? INFINITO_RIP) < INFINITO_RIP) f.infinitos++;
    if (x.contou && (x.antes ?? 0) > 0) contou = true;
  }
  if (contou && !f.contouAoInfinito) f.contagens++;
  if (contou) f.contouAoInfinito = true;
  if (r.estavel) f.convergiu = true;
  f.contando = subiu && !r.estavel;
  for (const e of ligados) instalarRip(e);
  f.metricas = Object.fromEntries(ligados.map((e) => [e.nome, Object.fromEntries(Object.entries(ripDe(e)!.tabela ?? {}).map(([d, x]) => [d, x.custo]))]));
  const visiveis = r.eventos.filter((x) => x.tipo !== 'partida');
  const linhas = visiveis.slice(0, 60).map(textoEvento);
  if (visiveis.length > 60) linhas.push(`  ... e mais ${visiveis.length - 60} acontecimento(s) até ${segTxt(r.fim)} s`);
  return { inicio: r.inicio, fim: r.fim, convergiu: r.estavel, linhas, contou, contando: f.contando, periodicas: r.periodicas, disparadas: r.disparadas, eventos: r.eventos };
}

/* ---------- BGP ---------- */

export interface ConfigBgp {
  asn: number;
  vizinhos: { ip: string; asn: number; relacao: Relacao }[];
  anuncia: string[];
}

export function bgpDe(e: Equipamento): ConfigBgp | undefined {
  return e.s.bgp as ConfigBgp | undefined;
}

export interface SessaoBgp {
  de: string;
  ip: string;
  asn: number;
  relacao: Relacao;
  com?: string;
  estabelecida: boolean;
  motivo?: string;
}

/** AS de documentação (64496 a 64511, 65536 a 65551) ou privado (64512 a 65534 e 4200000000 a 4294967294). */
export function asnValido(n: number): boolean {
  return Number.isInteger(n) && ((n >= 64496 && n <= 65534) || (n >= 65536 && n <= 65551) || (n >= 4200000000 && n <= 4294967294));
}

/** Confere cada vizinho configurado: o outro lado tem BGP, o número de AS bate, ele também me configurou e o enlace passa. */
export function sessoesBgp(m: Mundo): SessaoBgp[] {
  const out: SessaoBgp[] = [];
  for (const e of m.equipamentos.values()) {
    const cfg = bgpDe(e);
    if (!cfg || !roteadorLigado(e)) continue;
    for (const v of cfg.vizinhos) {
      const s: SessaoBgp = { de: e.nome, ip: v.ip, asn: v.asn, relacao: v.relacao, estabelecida: false };
      out.push(s);
      const ip = lerIp(v.ip);
      const dono = ip === null ? undefined : donoDoIp(m, ip);
      const minha = ip === null ? undefined : interfacesL3(e).find((i) => pertence(ip, i.cidr));
      if (!dono || !minha) {
        s.motivo = 'ninguém com esse endereço numa rede minha';
        continue;
      }
      s.com = dono.e.nome;
      const outro = bgpDe(dono.e);
      if (!outro || !roteadorLigado(dono.e)) {
        s.motivo = `${dono.e.nome} não fala BGP`;
        continue;
      }
      if (outro.asn !== v.asn) {
        s.motivo = `${dono.e.nome} é do AS ${outro.asn}, não do ${v.asn}`;
        continue;
      }
      if (!outro.vizinhos.some((x) => x.ip === ipTexto(minha.cidr.endereco) && x.asn === cfg.asn)) {
        s.motivo = `${dono.e.nome} não me configurou como vizinho (${ipTexto(minha.cidr.endereco)}, AS ${cfg.asn})`;
        continue;
      }
      if (!interfaceAtiva(m, e, minha.porta) || !caminho(m, e.nome, dono.e.nome, { portaOrigem: minha.porta, portaDestino: dono.porta })) {
        s.motivo = 'o enlace até o vizinho está caído';
        continue;
      }
      s.estabelecida = true;
    }
  }
  return out;
}

export interface ResultadoBgpMundo {
  nos: NoBgp[];
  res: ResultadoBgp;
  sessoes: SessaoBgp[];
  sequestros: { roteador: string; especifico: string; origem: number; coberto: string; legitimo: number }[];
}

const origemAs = (asn: number, caminho: number[]) => caminho[caminho.length - 1] ?? asn;

/** Identificador BGP: sem um configurado, os roteadores usam o maior endereço IPv4 das próprias interfaces. */
function idBgp(e: Equipamento): number | undefined {
  const ips = interfacesL3(e).map((i) => i.cidr.endereco >>> 0);
  return ips.length ? Math.max(...ips) : undefined;
}

/** BGP no mundo: um roteador por AS, sessões eBGP entre vizinhos diretos. As melhores rotas viram rotas "bgp" na tabela. */
export function calcularBgp(m: Mundo): ResultadoBgpMundo {
  const todos = [...m.equipamentos.values()];
  for (const e of todos) if (e.s.rotasDinamicas) instalar(e, 'bgp', []);
  const sessoes = sessoesBgp(m);
  const nos: NoBgp[] = todos
    .filter((e) => bgpDe(e) && roteadorLigado(e))
    .map((e) => ({ id: e.nome, asn: bgpDe(e)!.asn, prefixos: [...bgpDe(e)!.anuncia], sessoes: sessoes.filter((s) => s.de === e.nome && s.estabelecida).map((s) => ({ com: s.com!, relacao: s.relacao })), idBgp: idBgp(e) }));
  const res = propagarBgp(nos);
  const sequestros: ResultadoBgpMundo['sequestros'] = [];
  for (const n of nos) {
    const e = m.equipamentos.get(n.id)!;
    const novas: RotaDinamica[] = [];
    const melhores = res.melhores[n.id] ?? {};
    for (const [p, r] of Object.entries(melhores)) {
      if (r.de === null) continue;
      const s = sessoes.find((x) => x.de === n.id && x.com === r.de && x.estabelecida);
      if (!s) continue;
      novas.push({ destino: p, via: s.ip, origem: 'bgp', metrica: r.caminho.length, nota: `caminho de AS ${r.caminho.join(' ')}` });
    }
    instalar(e, 'bgp', novas.sort((a, b) => a.destino.localeCompare(b.destino)));
    // Sequestro: um prefixo mais específico originado por um AS diferente de quem origina o prefixo que o cobre.
    for (const [p, r] of Object.entries(melhores)) {
      const cp = lerCidr(p);
      if (!cp) continue;
      for (const [q, s] of Object.entries(melhores)) {
        const cq = lerCidr(q);
        if (!cq || cq.prefixo >= cp.prefixo || !pertence(cp.endereco, cq)) continue;
        const oa = origemAs(n.asn, r.caminho);
        const ob = origemAs(n.asn, s.caminho);
        if (oa !== ob) sequestros.push({ roteador: n.id, especifico: p, origem: oa, coberto: q, legitimo: ob });
      }
    }
  }
  if (nos.length) {
    m.flags.bgp = {
      sessoes: sessoes.filter((s) => s.estabelecida).length,
      rodadas: res.rodadas,
      convergiu: res.convergiu,
      melhores: Object.fromEntries(nos.map((n) => [n.id, Object.fromEntries(Object.entries(res.melhores[n.id] ?? {}).map(([p, r]) => [p, { caminho: r.caminho, de: r.de, relacao: r.relacao }]))])),
      sequestros,
    };
  } else delete m.flags.bgp;
  return { nos, res, sessoes, sequestros };
}

/* ---------- MPLS ---------- */

export function lfibDoMundo(m: Mundo): Lfib {
  const l: Lfib = {};
  for (const e of m.equipamentos.values()) if (e.s.mpls) l[e.nome] = e.s.mpls as EntradaLfib[];
  return l;
}

/** Monta um caminho comutado por rótulos por uma sequência de roteadores vizinhos. Devolve o erro, se houver. */
export function criarLspMundo(m: Mundo, rota: string[], fec: string): string | null {
  if (rota.length < 2) return 'O caminho precisa de pelo menos dois roteadores.';
  const adj = adjacencias(m);
  for (let i = 1; i < rota.length; i++) {
    const a = rota[i - 1]!;
    const b = rota[i]!;
    if (!m.equipamentos.get(b) || !roteadorLigado(m.equipamentos.get(b)!)) return `${b} não é um roteador ligado.`;
    if (!adj.some((x) => x.de === a && x.para === b)) return `${a} e ${b} não são vizinhos (sem enlace ativo na mesma sub-rede).`;
  }
  const nova = montarLspMpls(lfibDoMundo(m), rota, fec);
  for (const [r, lista] of Object.entries(nova)) {
    const e = m.equipamentos.get(r);
    if (!e) continue;
    if (lista.length) e.s.mpls = lista;
    else delete e.s.mpls;
  }
  return null;
}

/** Acha a FEC de um destino na tabela do roteador de entrada (prefixo mais longo que contém o IP). */
export function fecPara(m: Mundo, entrada: string, alvo: string): string | null {
  const lista = (m.equipamentos.get(entrada)?.s.mpls ?? []) as EntradaLfib[];
  const fecs = lista.filter((x) => x.entrada === null).map((x) => x.fec);
  if (fecs.includes(alvo)) return alvo;
  const ip = lerIp(alvo);
  if (ip === null) return null;
  let melhor: string | null = null;
  let tam = -1;
  for (const f of fecs) {
    const c = lerCidr(f);
    if (c && pertence(ip, c) && c.prefixo > tam) {
      melhor = f;
      tam = c.prefixo;
    }
  }
  return melhor;
}

export function enviarMpls(m: Mundo, entrada: string, alvo: string): { ok: boolean; linhas: string[]; operacoes: string[]; saida: string | null } {
  const fec = fecPara(m, entrada, alvo);
  if (!fec) return { ok: false, linhas: [`${entrada} não tem caminho de rótulos para ${alvo}. Monte um com "mpls lsp <prefixo> <roteador> <roteador> ...".`], operacoes: [], saida: null };
  const r = comutarMpls(lfibDoMundo(m), entrada, fec);
  const pilha = (p: number[]) => (p.length ? `[${p.join(' ')}]` : '[vazia]');
  const linhas = [`Pacote para ${alvo}, FEC ${fec}:`];
  for (const p of r.passos) {
    const acao = p.operacao === 'empilhar' ? `pacote IP sem rótulo casa com a FEC: empilha ${p.pilhaDepois.at(-1)}` : p.operacao === 'trocar' ? `rótulo ${p.pilhaAntes.at(-1)} vira ${p.pilhaDepois.at(-1)}` : `rótulo ${p.pilhaAntes.at(-1)}: desempilha, daqui segue pelo IP`;
    linhas.push(`  ${p.roteador.padEnd(8)} ${pilha(p.pilhaAntes).padEnd(9)} ${acao}${p.proximo ? `, manda para ${p.proximo}` : ''}`);
  }
  if (r.erro) linhas.push(r.erro);
  else linhas.push(`Saiu do caminho de rótulos em ${r.saida}. No meio, ninguém olhou o endereço IP: só o rótulo do topo.`);
  return { ok: !r.erro, linhas, operacoes: r.passos.map((p) => p.operacao), saida: r.saida };
}

/* ---------- IGMP, multicast e anycast no mundo ---------- */

/** Grupos que cada porta do roteador ouviu no IGMP: hosts na rede daquela porta que pediram para entrar no grupo. */
export function igmp(m: Mundo, r: Equipamento): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const i of interfacesL3(r)) {
    if (!interfaceAtiva(m, r, i.porta)) continue;
    for (const h of m.equipamentos.values()) {
      const grupos = (h.s.grupos as string[] | undefined) ?? [];
      if (h.nome === r.nome || !grupos.length || !h.ip || !pertence(h.ip.endereco, i.cidr)) continue;
      if (!caminho(m, r.nome, h.nome, { portaOrigem: i.porta })) continue;
      for (const g of grupos) ((out[i.porta] ??= {})[g] ??= []).push(h.nome);
    }
  }
  return out;
}

/** Roteadores que têm alguém ouvindo o grupo em alguma porta. */
export function roteadoresComMembros(m: Mundo, grupo: string): string[] {
  return [...m.equipamentos.values()].filter((e) => roteadorLigado(e) && Object.values(igmp(m, e)).some((g) => g[grupo]?.length)).map((e) => e.nome).sort();
}

/** Roteadores ligados diretamente (na mesma rede de enlace) a quem tem este IP: os "lugares" de um endereço anycast. */
export function roteadoresDoIp(m: Mundo, ip: number): string[] {
  const out = new Set<string>();
  for (const h of m.equipamentos.values()) {
    if (!interfacesL3(h).some((i) => i.cidr.endereco === ip)) continue;
    for (const r of m.equipamentos.values()) {
      if (!roteadorLigado(r) || r.nome === h.nome) continue;
      const i = interfacesL3(r).find((x) => pertence(ip, x.cidr));
      if (i && caminho(m, r.nome, h.nome, { portaOrigem: i.porta })) out.add(r.nome);
    }
  }
  return [...out].sort();
}

/* ---------- Recalcular sozinho ---------- */

/** O mundo tem algum protocolo que se recalcula sozinho (OSPF ou BGP)? */
export function temProtocolos(m: Mundo): boolean {
  for (const e of m.equipamentos.values()) if (e.s.ospf || e.s.bgp) return true;
  return false;
}

/**
 * OSPF e BGP reagem rápido a mudança (o hello some, a sessão cai), então são recalculados a cada comando.
 * O RIP não: o relógio dele só anda com "rodar-protocolos", para dar para ver os temporizadores e a contagem ao infinito.
 */
export function recalcularProtocolos(m: Mundo): void {
  let ospf = false;
  let bgp = false;
  for (const e of m.equipamentos.values()) {
    if (e.s.ospf) ospf = true;
    if (e.s.bgp) bgp = true;
  }
  if (ospf) calcularOspf(m);
  if (bgp) calcularBgp(m);
}
