// Camada física: cobre, fibra, rádio, coaxial e satélite.
// Os modelos são simplificados, mas as grandezas e os limites são os de verdade.

import { acharPorta, type Cabo, type ElementoCoax, type Equipamento, type Fibra, type Mundo } from './mundo';
import { LUZ } from './util';

/* ---------- Par trançado ---------- */

export type Cor =
  | 'branco-laranja'
  | 'laranja'
  | 'branco-verde'
  | 'verde'
  | 'branco-azul'
  | 'azul'
  | 'branco-marrom'
  | 'marrom';

export const CORES: Cor[] = ['branco-laranja', 'laranja', 'branco-verde', 'verde', 'branco-azul', 'azul', 'branco-marrom', 'marrom'];
export const T568A: Cor[] = ['branco-verde', 'verde', 'branco-laranja', 'azul', 'branco-azul', 'laranja', 'branco-marrom', 'marrom'];
export const T568B: Cor[] = ['branco-laranja', 'laranja', 'branco-verde', 'azul', 'branco-azul', 'verde', 'branco-marrom', 'marrom'];

const APELIDOS: Record<string, Cor> = {
  bl: 'branco-laranja',
  l: 'laranja',
  bv: 'branco-verde',
  v: 'verde',
  baz: 'branco-azul',
  az: 'azul',
  bm: 'branco-marrom',
  m: 'marrom',
};

export function lerCor(s: string): Cor | null {
  const t = s.trim().toLowerCase();
  if ((CORES as string[]).includes(t)) return t as Cor;
  return APELIDOS[t] ?? null;
}

const PAR = (c: Cor) => c.replace('branco-', '');
/** Pinos que formam um par trançado no conector (contando de 0). */
const PARES_PINOS: [number, number][] = [
  [0, 1],
  [2, 5],
  [3, 4],
  [6, 7],
];

const CRUZ = [2, 5, 0, 3, 4, 1, 6, 7];
const CRUZ_GIGA = [2, 5, 0, 6, 7, 1, 3, 4];
const INVERTIDO = [7, 6, 5, 4, 3, 2, 1, 0];

export interface Wiremap {
  mapa: (number | null)[];
  abertos: number[]; // pinos (1 a 8) sem continuidade
  tipo: 'direto' | 'cruzado' | 'cruzado-giga' | 'invertido' | 'trocado';
  parDividido: boolean;
  duplicadas: Cor[];
}

export function wiremap(a: (Cor | null)[], b: (Cor | null)[]): Wiremap {
  const mapa = a.map((cor) => {
    if (!cor) return null;
    const j = b.indexOf(cor);
    return j < 0 ? null : j;
  });
  const abertos = mapa.flatMap((v, i) => (v === null ? [i + 1] : []));
  const igual = (padrao: number[]) => mapa.every((v, i) => v === null || v === padrao[i]);
  let tipo: Wiremap['tipo'] = 'trocado';
  if (igual([0, 1, 2, 3, 4, 5, 6, 7])) tipo = 'direto';
  else if (igual(CRUZ)) tipo = 'cruzado';
  else if (igual(CRUZ_GIGA)) tipo = 'cruzado-giga';
  else if (igual(INVERTIDO)) tipo = 'invertido';
  const dividido = (p: (Cor | null)[]) =>
    PARES_PINOS.some(([x, y]) => p[x] && p[y] && PAR(p[x]!) !== PAR(p[y]!));
  const duplicadas = [a, b].flatMap((p) => p.filter((c, i) => c && p.indexOf(c) !== i)) as Cor[];
  return { mapa, abertos, tipo, parDividido: dividido(a) || dividido(b), duplicadas };
}

/* ---------- Estado de um enlace ---------- */

export interface EstadoEnlace {
  up: boolean;
  velocidade: number; // Mb/s
  ber: number;
  margemDb: number;
  atrasoS: number; // propagação, um sentido
  motivos: string[];
  info: string[];
  dados: Record<string, number>;
}

/** Taxa de erro de bit a partir da margem sobre o mínimo exigido. */
export function berDaMargem(margem: number): number {
  if (margem >= 6) return 1e-13;
  return Math.min(1e-2, Math.pow(10, -(6 + margem)));
}

function fora(motivo: string, atrasoS = 0, info: string[] = [], dados: Record<string, number> = {}): EstadoEnlace {
  return { up: false, velocidade: 0, ber: 1, margemDb: -99, atrasoS, motivos: [motivo], info, dados };
}

export function avaliar(m: Mundo, c: Cabo): EstadoEnlace {
  const derrubada = [c.a, c.b].find((p) => m.equipamentos.get(p.equip)?.portas.find((x) => x.nome === p.porta)?.desligada);
  if (derrubada) return fora(`porta ${derrubada.equip}:${derrubada.porta} derrubada de propósito (use "levantar ${derrubada.porta}" no console dela)`, c.metros / 2e8);
  switch (c.meio) {
    case 'cat5e':
    case 'cat6':
    case 'cat6a':
      return avaliarCobre(m, c);
    case 'fibra':
      return avaliarFibra(m, c);
    case 'radio':
      return avaliarRadio(m, c);
    case 'coax':
      return avaliarCoax(c);
    case 'satelite':
      return avaliarSatelite(c);
  }
}

/* ---------- Cobre ---------- */

export function ruidoEfetivo(c: Cabo): number {
  let r = c.ruidoDb ?? 0;
  if (c.afastado) r -= 12;
  if (c.blindado) r += c.aterrado ? -18 : 3;
  return Math.max(0, r);
}

function avaliarCobre(m: Mundo, c: Cabo): EstadoEnlace {
  const pa = acharPorta(m, c.a);
  const pb = acharPorta(m, c.b);
  const prop = c.metros / 2e8;
  const wm = wiremap(c.pinosA ?? [], c.pinosB ?? []);
  const info: string[] = [];
  if (wm.duplicadas.length) return fora(`fio repetido no conector (${wm.duplicadas.join(', ')}): dois pinos com a mesma cor`, prop);
  if (wm.abertos.some((p) => [1, 2, 3, 6].includes(p))) {
    return fora(`fio aberto nos pinos ${wm.abertos.join(', ')}: sem os pinos 1, 2, 3 e 6 nem o 10BASE-T acende`, prop);
  }
  if (wm.tipo === 'trocado' || wm.tipo === 'invertido') {
    return fora('pares trocados: o fio que sai do pino 1 não chega no par certo do outro lado', prop);
  }
  const cruzado = wm.tipo !== 'direto';
  if (!pa.mdix && !pb.mdix) {
    const precisaCruzar = pa.mdi === pb.mdi;
    if (precisaCruzar && !cruzado) {
      return fora(`as duas portas são ${pa.mdi.toUpperCase()} e nenhuma tem auto-MDIX: transmissor falando com transmissor`, prop);
    }
    if (!precisaCruzar && cruzado) {
      return fora('cabo cruzado entre MDI e MDI-X sem auto-MDIX: o cruzamento desfez o que a porta já fazia', prop);
    }
  }
  const comuns = pa.velocidades.filter((v) => pb.velocidades.includes(v));
  const maxCat = c.meio === 'cat5e' ? 1000 : c.meio === 'cat6' ? (c.metros <= 55 ? 10000 : 1000) : 10000;
  const possiveis = comuns.filter((v) => v <= maxCat);
  if (!possiveis.length) return fora('as portas não têm velocidade em comum', prop);
  let v = Math.max(...possiveis);
  if (c.meio === 'cat6' && c.metros > 55 && comuns.includes(10000)) info.push('Cat6 só garante 10 Gb/s até 55 m; negociou 1 Gb/s');
  if (wm.abertos.length) {
    v = Math.min(v, 100);
    info.push(`pinos ${wm.abertos.join(', ')} abertos: com dois pares, 100 Mb/s no máximo`);
  }
  if (wm.parDividido && v > 100) {
    v = 100;
    info.push('par dividido: diafonia alta, o gigabit desistiu e caiu para 100 Mb/s');
  }
  const ruido = ruidoEfetivo(c);
  const margem = 20 - Math.max(0, c.metros - 100) - ruido - (wm.parDividido ? 18 : 0) - (v >= 10000 ? 4 : 0);
  if (c.metros > 100) info.push(`${c.metros} m: acima dos 100 m do canal, a atenuação come a margem`);
  if (ruido > 0) info.push(`ruído acoplado no cabo: ${ruido} dB`);
  if (margem < -4) return fora('sinal abaixo do ruído: o receptor desistiu', prop, info);
  return { up: true, velocidade: v, ber: berDaMargem(margem), margemDb: margem, atrasoS: prop, motivos: [], info, dados: { margem } };
}

/* ---------- Fibra ---------- */

export const ATENUACAO: Record<Fibra, Record<number, number>> = {
  os2: { 1310: 0.35, 1550: 0.22, 850: 2.5 },
  om1: { 850: 3.5, 1310: 1.5, 1550: 1.5 },
  om3: { 850: 3.0, 1310: 1.0, 1550: 1.0 },
  om4: { 850: 3.0, 1310: 1.0, 1550: 1.0 },
};

/** Alcance máximo em multimodo por dispersão modal (m), por velocidade. */
export const ALCANCE_MM: Record<Exclude<Fibra, 'os2'>, Record<number, number>> = {
  om1: { 1000: 275, 10000: 33 },
  om3: { 1000: 1000, 10000: 300 },
  om4: { 1000: 1100, 10000: 400 },
};

export const MODO_FIBRA = (f: Fibra) => (f === 'os2' ? 'sm' : 'mm');

export function perdaFibra(m: Mundo, c: Cabo): { perda: number; partes: string[]; misto: boolean } {
  const ta = acharPorta(m, c.a).sfp;
  const lambda = ta?.lambda ?? 1310;
  const segs = c.segmentos ?? [];
  const partes: string[] = [];
  let perda = 0;
  for (const s of segs) {
    const p = (s.metros / 1000) * (ATENUACAO[s.fibra][lambda] ?? 3);
    perda += p;
    partes.push(`${s.nome} (${s.fibra.toUpperCase()}, ${s.metros} m): ${p.toFixed(2)} dB`);
  }
  const con = (c.conectores ?? 2) * 0.5;
  perda += con;
  partes.push(`${c.conectores ?? 2} conectores: ${con.toFixed(2)} dB`);
  for (const e of c.emendas ?? []) {
    perda += e.perdaDb;
    partes.push(`emenda a ${e.metros} m: ${e.perdaDb.toFixed(2)} dB`);
  }
  const misto = new Set(segs.map((s) => MODO_FIBRA(s.fibra))).size > 1;
  if (misto) {
    perda += 18;
    partes.push('núcleo de 50 µm encostado em núcleo de 9 µm: 18 dB jogados fora');
  } else if (ta && segs[0] && ta.modo !== MODO_FIBRA(segs[0].fibra)) {
    perda += 15;
    partes.push(`transceptor ${ta.modo === 'mm' ? 'multimodo' : 'monomodo'} em fibra ${segs[0].fibra.toUpperCase()}: 15 dB`);
  }
  return { perda, partes, misto };
}

function avaliarFibra(m: Mundo, c: Cabo): EstadoEnlace {
  const pa = acharPorta(m, c.a);
  const pb = acharPorta(m, c.b);
  const total = (c.segmentos ?? []).reduce((s, x) => s + x.metros, 0);
  const prop = total / 2e8;
  const ta = pa.sfp;
  const tb = pb.sfp;
  if (!ta || !tb) return fora('porta sem transceptor: SFP vazio não acende nada', prop);
  if (ta.lambda !== tb.lambda) return fora(`comprimentos de onda diferentes (${ta.lambda} nm e ${tb.lambda} nm): um fala, o outro não ouve`, prop);
  if (ta.velocidade !== tb.velocidade) return fora('transceptores de velocidades diferentes', prop);
  if (c.ruptura !== undefined) return fora('LOS (perda de sinal): a luz sai e não volta', prop);
  const { perda, partes, misto } = perdaFibra(m, c);
  if (ta.modo === 'mm' && !misto) {
    for (const s of c.segmentos ?? []) {
      if (s.fibra === 'os2') continue;
      const alcance = ALCANCE_MM[s.fibra][ta.velocidade] ?? 0;
      if (total > alcance) {
        return fora(`dispersão modal: ${s.fibra.toUpperCase()} leva ${ta.velocidade / 1000} Gb/s só até ${alcance} m, e o enlace tem ${total} m`, prop, partes);
      }
    }
  }
  const rxB = ta.txDbm - perda - (pb.atenuadorDb ?? 0);
  const rxA = tb.txDbm - perda - (pa.atenuadorDb ?? 0);
  const dados = { perda, rxA, rxB, margemA: rxA - ta.sensDbm, margemB: rxB - tb.sensDbm };
  const info = [...partes, `perda total: ${perda.toFixed(2)} dB`, `${c.a.equip} recebe ${rxA.toFixed(1)} dBm, ${c.b.equip} recebe ${rxB.toFixed(1)} dBm`];
  for (const [rx, t, quem] of [
    [rxA, ta, c.a.equip],
    [rxB, tb, c.b.equip],
  ] as const) {
    if (rx < t.sensDbm) return fora(`${quem} recebe ${rx.toFixed(1)} dBm, abaixo da sensibilidade de ${t.sensDbm} dBm`, prop, info, dados);
    if (rx > t.saturaDbm) return fora(`${quem} recebe ${rx.toFixed(1)} dBm, acima dos ${t.saturaDbm} dBm que o receptor aguenta: saturado`, prop, info, dados);
  }
  const margem = Math.min(dados.margemA, dados.margemB);
  return { up: true, velocidade: ta.velocidade, ber: berDaMargem(margem * 2), margemDb: margem, atrasoS: prop, motivos: [], info, dados };
}

/* ---------- Rádio ---------- */

export function fspl(km: number, ghz: number): number {
  return 32.44 + 20 * Math.log10(km) + 20 * Math.log10(ghz * 1000);
}

export function raioFresnel(km: number, ghz: number): number {
  return 8.657 * Math.sqrt(km / ghz);
}

function desalinhamento(e: Equipamento): number {
  const a = e.antena!;
  let d = (((a.azimute - a.azimuteCerto) % 360) + 540) % 360 - 180;
  d = Math.abs(d);
  return Math.min(40, 12 * (d / a.feixe) ** 2);
}

export function radioDados(m: Mundo, c: Cabo) {
  const r = c.radio!;
  const ea = m.equipamentos.get(c.a.equip)!;
  const eb = m.equipamentos.get(c.b.equip)!;
  const perdaLivre = fspl(r.distanciaKm, r.freqGHz);
  const r1 = raioFresnel(r.distanciaKm, r.freqGHz);
  const folga = Math.min(ea.antena!.altura, eb.antena!.altura) - r.obstaculoM;
  const precisa = 0.6 * r1;
  const perdaFresnel = folga >= precisa ? 0 : folga >= 0 ? (6 * (precisa - folga)) / precisa : 6 + Math.min(14, -folga * 1.5);
  const desA = desalinhamento(ea);
  const desB = desalinhamento(eb);
  const rssi = r.ptxDbm + ea.antena!.ganho + eb.antena!.ganho - perdaLivre - desA - desB - perdaFresnel;
  return { perdaLivre, r1, folga, precisa, perdaFresnel, desA, desB, rssi };
}

function avaliarRadio(m: Mundo, c: Cabo): EstadoEnlace {
  const d = radioDados(m, c);
  const prop = (c.radio!.distanciaKm * 1000) / LUZ;
  const info = [
    `perda no espaço livre: ${d.perdaLivre.toFixed(1)} dB`,
    `1ª zona de Fresnel no meio do caminho: ${d.r1.toFixed(1)} m de raio, folga sobre o obstáculo ${d.folga.toFixed(1)} m (precisa de ${d.precisa.toFixed(1)} m)`,
    `perda por obstrução: ${d.perdaFresnel.toFixed(1)} dB; desalinhamento: ${d.desA.toFixed(1)} dB + ${d.desB.toFixed(1)} dB`,
    `RSSI: ${d.rssi.toFixed(1)} dBm`,
  ];
  if (d.rssi < -80) return fora(`RSSI de ${d.rssi.toFixed(1)} dBm: abaixo de -80 dBm o rádio nem associa`, prop, info, { rssi: d.rssi });
  const v = d.rssi >= -65 ? 300 : d.rssi >= -72 ? 130 : 50;
  return { up: true, velocidade: v, ber: berDaMargem(d.rssi + 74), margemDb: d.rssi + 74, atrasoS: prop, motivos: [], info, dados: { rssi: d.rssi } };
}

/* ---------- Coaxial (DOCSIS) ---------- */

/** Perda por 100 m a 750 MHz. */
export const PERDA_COAX = { rg59: 24.6, rg6: 18.5 };
export const PERDA_SPLITTER: Record<number, number> = { 2: 3.5, 3: 5.5, 4: 7, 8: 11 };

export function perdaElemento(e: ElementoCoax): number {
  switch (e.tipo) {
    case 'cabo':
      return ((e.metros ?? 0) / 100) * PERDA_COAX[e.modelo ?? 'rg6'];
    case 'splitter':
      return PERDA_SPLITTER[e.vias ?? 2] ?? 3.5;
    case 'conector':
      return e.oxidado ? 6 : 0.2;
    case 'amplificador':
      return -(e.db ?? 0);
    case 'atenuador':
      return e.db ?? 0;
  }
}

export function coaxDados(c: Cabo) {
  const els = c.coax!.elementos;
  const nivel = c.coax!.tapDbmv - els.reduce((s, e) => s + perdaElemento(e), 0);
  const amps = els.filter((e) => e.tipo === 'amplificador').length;
  const oxidado = els.some((e) => e.tipo === 'conector' && e.oxidado);
  const mer = 40 - (nivel < -7 ? (-7 - nivel) * 1.2 : 0) - (nivel > 10 ? (nivel - 10) * 1.5 : 0) - (oxidado ? 8 : 0) - amps * 1.5;
  return { nivel, mer };
}

function avaliarCoax(c: Cabo): EstadoEnlace {
  const { nivel, mer } = coaxDados(c);
  const prop = c.metros / (0.85 * LUZ);
  const dados = { nivel, mer };
  const info = [`nível de descida: ${nivel.toFixed(1)} dBmV`, `MER: ${mer.toFixed(1)} dB`];
  if (nivel > 15) return fora('nível acima de +15 dBmV: o receptor do modem saturou', prop, info, dados);
  if (nivel < -15) return fora('nível abaixo de -15 dBmV: o modem não trava na portadora', prop, info, dados);
  if (mer < 30) return fora(`MER de ${mer.toFixed(1)} dB: abaixo de 30 dB o 256-QAM vira sopa`, prop, info, dados);
  return { up: true, velocidade: 1000, ber: berDaMargem((mer - 30) / 1.5), margemDb: mer - 30, atrasoS: prop, motivos: [], info, dados };
}

/* ---------- Satélite ---------- */

export const ORBITAS = {
  geo: { altitudeKm: 35786, extraMs: 10, velocidade: 50, nome: 'geoestacionária' },
  meo: { altitudeKm: 8062, extraMs: 10, velocidade: 150, nome: 'média' },
  leo: { altitudeKm: 550, extraMs: 18, velocidade: 200, nome: 'baixa' },
};

function avaliarSatelite(c: Cabo): EstadoEnlace {
  const o = ORBITAS[c.sat!.orbita];
  const subidaDescida = (2 * o.altitudeKm * 1000) / LUZ;
  const prop = subidaDescida + o.extraMs / 1000;
  return {
    up: true,
    velocidade: o.velocidade,
    ber: 1e-10,
    margemDb: 6,
    atrasoS: prop,
    motivos: [],
    info: [`órbita ${o.nome}, ${o.altitudeKm} km de altitude`, `subida e descida: ${(subidaDescida * 1000).toFixed(1)} ms; processamento e solo: ${o.extraMs} ms`],
    dados: { propMs: subidaDescida * 1000 },
  };
}
