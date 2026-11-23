// Qualidade de serviço (ato 4), parte pura: requisitos de cada aplicação, modelagem de tráfego
// (balde furado e balde de fichas), escalonamento de pacotes (FIFO, prioridade estrita e WFQ) e as
// classes de serviços diferenciados (DSCP: EF, AF e as de precedência). Nada aqui conhece o mundo do jogo.

import { Simulador } from './eventos';
import { rngSemente } from './util';

/* ---------- Requisitos por aplicação ---------- */

export type Exigencia = 'baixa' | 'média' | 'alta';

export interface Requisito {
  aplicacao: string;
  banda: Exigencia;
  atraso: Exigencia;
  jitter: Exigencia;
  perda: Exigencia;
  /** Números de referência, só para dar a ordem de grandeza. */
  referencia: string;
}

/** O quanto cada aplicação exige da rede (sensibilidade), do jeito clássico dos livros de redes. */
export const REQUISITOS: Requisito[] = [
  { aplicacao: 'e-mail', banda: 'baixa', atraso: 'baixa', jitter: 'baixa', perda: 'média', referencia: 'kb/s; minutos de atraso não incomodam; perda vira retransmissão' },
  { aplicacao: 'web', banda: 'média', atraso: 'média', jitter: 'baixa', perda: 'média', referencia: 'alguns Mb/s; até uns 2 s para a página aparecer' },
  { aplicacao: 'vídeo sob demanda', banda: 'alta', atraso: 'baixa', jitter: 'alta', perda: 'baixa', referencia: '5 a 25 Mb/s; o player guarda segundos no buffer, então atraso pouco importa' },
  { aplicacao: 'voz', banda: 'baixa', atraso: 'alta', jitter: 'alta', perda: 'baixa', referencia: '64 kb/s ou menos; menos de 150 ms num sentido, jitter abaixo de 30 ms, perda abaixo de 1 %' },
  { aplicacao: 'videoconferência', banda: 'alta', atraso: 'alta', jitter: 'alta', perda: 'baixa', referencia: '1 a 4 Mb/s por pessoa; os mesmos 150 ms e 30 ms da voz' },
];

/* ---------- Balde furado e balde de fichas ---------- */

export type TipoBalde = 'fichas' | 'furado';

export interface ConfigBalde {
  tipo: TipoBalde;
  /** Taxa R, em bytes por segundo: a vazão de longo prazo que o balde deixa sair. */
  taxa: number;
  /** Profundidade B, em bytes: as fichas guardadas (balde de fichas) ou a água que cabe (balde furado). */
  profundidade: number;
  /** Taxa M de chegada da rajada e da linha de saída, em bytes por segundo. */
  pico: number;
  /** Bytes da rajada que chega de uma vez, na taxa M. */
  rajada: number;
  /**
   * Bytes que podem esperar na fila do modelador (só no balde de fichas). Infinity: modelador, nada se perde.
   * 0: policiador, o que não tem ficha é descartado. No balde furado, quem espera é o próprio balde (B).
   */
  espera?: number;
}

export interface ResultadoBalde {
  /** Bytes que saíram sem esperar. */
  passouDireto: number;
  /** Bytes que esperaram na fila do modelador ou dentro do balde. */
  esperou: number;
  descartado: number;
  /** Tempo saindo na taxa de pico M (no balde de fichas, enquanto há fichas). */
  tempoNoPico: number;
  /** S = B / (M - R): quanto dura a rajada no pico, pela conta. Infinito se M <= R. */
  sTeorico: number;
  /** Bytes que saíram no pico: a conta dá M·S = B + R·S. */
  bytesNoPico: number;
  atrasoMax: number;
  /** Quando o último byte saiu. */
  fim: number;
  /** Taxa de saída ao longo do tempo (bytes por segundo), em pontos. */
  serie: { t: number; saida: number }[];
}

/** Tempo máximo de rajada do balde de fichas: S = B / (M - R). */
export function tempoRajada(b: number, m: number, r: number): number {
  return m > r ? b / (m - r) : Infinity;
}

/**
 * Simula a rajada passando pelo balde, em passos pequenos de tempo (fluido: bytes, não pacotes).
 * Balde de fichas: começa cheio de fichas (B); cada byte que sai gasta uma ficha; as fichas voltam na taxa R.
 * Enquanto há fichas, a saída vai na taxa de pico M; quando acabam, cai para R. O que não cabe espera ou é descartado.
 * Balde furado: o que chega entra no balde e sai no máximo na taxa R, sempre; o que transborda (passa de B) se perde.
 */
export function simularBalde(c: ConfigBalde): ResultadoBalde {
  const tChegada = c.rajada / c.pico;
  const tTotal = Math.max(tChegada, c.rajada / Math.max(1, c.taxa));
  const dt = Math.max(tTotal / 5000, 1e-7);
  const furado = c.tipo === 'furado';
  const limite = furado ? c.profundidade : (c.espera ?? Infinity);
  let fichas = c.profundidade;
  let chegou = 0;
  const fila: { bytes: number; t: number }[] = [];
  let naFila = 0;
  const r: ResultadoBalde = { passouDireto: 0, esperou: 0, descartado: 0, tempoNoPico: 0, sTeorico: furado ? 0 : tempoRajada(c.profundidade, c.pico, c.taxa), bytesNoPico: 0, atrasoMax: 0, fim: 0, serie: [] };
  const passoSerie = Math.max(1, Math.round(tTotal / dt / 60));
  let t = 0;
  for (let i = 0; i < 2e6; i++) {
    const entra = Math.min(c.pico * dt, c.rajada - chegou);
    if (entra > 0) {
      chegou += entra;
      fila.push({ bytes: entra, t });
      naFila += entra;
    }
    // Capacidade de saída neste passo.
    let pode: number;
    if (furado) pode = c.taxa * dt;
    else {
      fichas = Math.min(c.profundidade, fichas + c.taxa * dt);
      pode = Math.min(c.pico * dt, fichas);
    }
    let saiu = 0;
    while (fila.length && pode - saiu > 1e-9) {
      const h = fila[0]!;
      const n = Math.min(h.bytes, pode - saiu);
      const espera = t - h.t;
      if (espera < dt * 0.5) r.passouDireto += n;
      else r.esperou += n;
      r.atrasoMax = Math.max(r.atrasoMax, espera);
      saiu += n;
      h.bytes -= n;
      naFila -= n;
      if (h.bytes <= 1e-9) fila.shift();
    }
    if (!furado) fichas -= saiu;
    if (saiu >= c.pico * dt * 0.999 && c.pico > c.taxa) {
      r.tempoNoPico += dt;
      r.bytesNoPico += saiu;
    }
    // O que passou do limite de espera se perde (o mais novo, que acabou de chegar).
    while (naFila > limite + 1e-9 && fila.length) {
      const u = fila[fila.length - 1]!;
      const tira = Math.min(u.bytes, naFila - limite);
      u.bytes -= tira;
      naFila -= tira;
      r.descartado += tira;
      if (u.bytes <= 1e-9) fila.pop();
    }
    if (i % passoSerie === 0) r.serie.push({ t, saida: saiu / dt });
    t += dt;
    if (saiu > 0) r.fim = t;
    // Fila vazia zera o acumulado: sem isso, um resíduo de ponto flutuante segurava o laço até o limite.
    if (!fila.length) naFila = 0;
    if (chegou >= c.rajada * (1 - 1e-9) && naFila <= 1e-6) break;
  }
  return r;
}

/* ---------- Escalonamento de pacotes ---------- */

export type Disciplina = 'fifo' | 'prioridade' | 'wfq';

export interface FluxoEsc {
  nome: string;
  /** Taxa oferecida, em Mb/s. */
  mbps: number;
  tamanho?: number;
  /** Peso no WFQ (padrão 1). */
  peso?: number;
  /** Prioridade estrita: maior passa na frente (padrão 0). */
  prioridade?: number;
  classe?: string;
}

export interface ResultadoFluxo {
  nome: string;
  ofertaMbps: number;
  vazaoMbps: number;
  /** Fração da capacidade que o fluxo levou. */
  fracao: number;
  atrasoMedio: number;
  entregues: number;
  perdidos: number;
}

export interface ResultadoEscalonamento {
  disciplina: Disciplina;
  capacidadeMbps: number;
  fluxos: ResultadoFluxo[];
}

/**
 * Vários fluxos disputam a mesma porta, cada um com a própria fila (buffer de "buffer" pacotes; no FIFO, uma fila só
 * com o buffer somado). FIFO atende por ordem de chegada; prioridade estrita sempre atende a fila mais alta que tiver
 * pacote; WFQ dá a cada pacote um tempo de término virtual F = max(V, F anterior do fluxo) + tamanho / peso e atende
 * o menor F (versão com relógio virtual autossincronizado). Com todo mundo querendo mais do que cabe, o WFQ divide a
 * banda na proporção dos pesos.
 */
export function escalonar(disciplina: Disciplina, fluxosPedidos: FluxoEsc[], o: { capacidadeMbps: number; pacotes?: number; semente?: number; buffer?: number }): ResultadoEscalonamento {
  const cap = o.capacidadeMbps * 1e6;
  const rng = rngSemente(o.semente ?? 99);
  const fluxos = fluxosPedidos.map((f) => ({ ...f, tamanho: f.tamanho ?? 1000, peso: Math.max(1e-6, f.peso ?? 1), prioridade: f.prioridade ?? 0 }));
  const buffer = o.buffer ?? 50;
  const tamMedio = fluxos.length ? fluxos.reduce((s, f) => s + f.tamanho, 0) / fluxos.length : 1000;
  const duracao = ((o.pacotes ?? 4000) * tamMedio * 8) / cap;
  const sim = new Simulador();
  type Pk = { f: number; bytes: number; chegada: number; ordem: number; fim: number };
  const filas: Pk[][] = fluxos.map(() => []);
  const ultimoF = fluxos.map(() => 0);
  let v = 0;
  let ordem = 0;
  let ocupado = false;
  const st = fluxos.map(() => ({ bytes: 0, entregues: 0, perdidos: 0, somaAtraso: 0 }));
  const total = () => filas.reduce((s, q) => s + q.length, 0);
  const escolher = (): number => {
    let melhor = -1;
    for (let i = 0; i < filas.length; i++) {
      const h = filas[i]![0];
      if (!h) continue;
      if (melhor < 0) {
        melhor = i;
        continue;
      }
      const b = filas[melhor]![0]!;
      if (disciplina === 'fifo' ? h.ordem < b.ordem : disciplina === 'prioridade' ? fluxos[i]!.prioridade > fluxos[melhor]!.prioridade || (fluxos[i]!.prioridade === fluxos[melhor]!.prioridade && h.ordem < b.ordem) : h.fim < b.fim || (h.fim === b.fim && h.ordem < b.ordem)) melhor = i;
    }
    return melhor;
  };
  const servir = () => {
    if (ocupado) return;
    const i = escolher();
    if (i < 0) return;
    const p = filas[i]!.shift()!;
    ocupado = true;
    v = p.fim;
    sim.agendar((p.bytes * 8) / cap, () => {
      ocupado = false;
      const s = st[p.f]!;
      s.entregues++;
      s.somaAtraso += sim.agora - p.chegada;
      if (sim.agora <= duracao) s.bytes += p.bytes;
      servir();
    });
  };
  fluxos.forEach((f, i) => {
    const pps = (f.mbps * 1e6) / (f.tamanho * 8);
    if (pps <= 0) return;
    const proxima = () => {
      sim.agendar(-Math.log(1 - rng()) / pps, () => {
        if (sim.agora > duracao) return;
        const cheio = disciplina === 'fifo' ? total() >= buffer * fluxos.length : filas[i]!.length >= buffer;
        if (cheio) st[i]!.perdidos++;
        else {
          const fim = Math.max(v, ultimoF[i]!) + f.tamanho / f.peso;
          ultimoF[i] = fim;
          filas[i]!.push({ f: i, bytes: f.tamanho, chegada: sim.agora, ordem: ordem++, fim });
          servir();
        }
        proxima();
      });
    };
    proxima();
  });
  sim.rodar(5e6);
  return {
    disciplina,
    capacidadeMbps: o.capacidadeMbps,
    fluxos: fluxos.map((f, i) => {
      const s = st[i]!;
      const vazao = (s.bytes * 8) / duracao / 1e6;
      return { nome: f.nome, ofertaMbps: f.mbps, vazaoMbps: vazao, fracao: vazao / o.capacidadeMbps, atrasoMedio: s.entregues ? s.somaAtraso / s.entregues : 0, entregues: s.entregues, perdidos: s.perdidos };
    }),
  };
}

/* ---------- Serviços diferenciados (DSCP) ---------- */

/** Classes do campo DSCP (os 6 bits de cima do byte "serviço diferenciado" do IPv4). */
export const CLASSES_DSCP: Record<string, { dscp: number; descricao: string }> = {
  BE: { dscp: 0, descricao: 'melhor esforço (o padrão, sem tratamento especial)' },
  CS1: { dscp: 8, descricao: 'classe de precedência 1 (costuma ser o "menos que melhor esforço")' },
  AF11: { dscp: 10, descricao: 'encaminhamento garantido, classe 1, descarte baixo' },
  AF12: { dscp: 12, descricao: 'encaminhamento garantido, classe 1, descarte médio' },
  AF13: { dscp: 14, descricao: 'encaminhamento garantido, classe 1, descarte alto' },
  CS2: { dscp: 16, descricao: 'classe de precedência 2' },
  AF21: { dscp: 18, descricao: 'encaminhamento garantido, classe 2, descarte baixo' },
  AF22: { dscp: 20, descricao: 'encaminhamento garantido, classe 2, descarte médio' },
  AF23: { dscp: 22, descricao: 'encaminhamento garantido, classe 2, descarte alto' },
  CS3: { dscp: 24, descricao: 'classe de precedência 3' },
  AF31: { dscp: 26, descricao: 'encaminhamento garantido, classe 3, descarte baixo' },
  AF32: { dscp: 28, descricao: 'encaminhamento garantido, classe 3, descarte médio' },
  AF33: { dscp: 30, descricao: 'encaminhamento garantido, classe 3, descarte alto' },
  CS4: { dscp: 32, descricao: 'classe de precedência 4' },
  AF41: { dscp: 34, descricao: 'encaminhamento garantido, classe 4, descarte baixo' },
  AF42: { dscp: 36, descricao: 'encaminhamento garantido, classe 4, descarte médio' },
  AF43: { dscp: 38, descricao: 'encaminhamento garantido, classe 4, descarte alto' },
  CS5: { dscp: 40, descricao: 'classe de precedência 5' },
  EF: { dscp: 46, descricao: 'encaminhamento expresso: pouca fila, pouco atraso, pouca perda (voz)' },
  CS6: { dscp: 48, descricao: 'controle da rede (protocolos de roteamento)' },
  CS7: { dscp: 56, descricao: 'reservado para controle da rede' },
};

/** Aceita o nome da classe (EF, AF41, BE...) ou o número de 0 a 63. */
export function lerDscp(txt: string): number | null {
  const t = txt.trim().toUpperCase();
  if (CLASSES_DSCP[t]) return CLASSES_DSCP[t]!.dscp;
  if (t === 'CS0' || t === 'DF') return 0;
  if (/^\d{1,2}$/.test(t) && Number(t) <= 63) return Number(t);
  return null;
}

export function nomeDscp(dscp: number): string {
  for (const [k, v] of Object.entries(CLASSES_DSCP)) if (v.dscp === dscp) return k;
  return `DSCP ${dscp}`;
}

/** O byte de serviço diferenciado: DSCP nos 6 bits de cima, ECN nos 2 de baixo. */
export function byteServico(dscp: number, ecn = 0): number {
  return ((dscp & 63) << 2) | (ecn & 3);
}

export function lerByteServico(tos: number): { dscp: number; ecn: number } {
  return { dscp: (tos >> 2) & 63, ecn: tos & 3 };
}

export const NOMES_ECN = ['00: não usa ECN', '01: entende ECN (ECT 1)', '10: entende ECN (ECT 0)', '11: congestionamento visto (CE)'];

/** Prioridade estrita de cada classe nos roteadores: EF passa na frente, depois AF4 a AF1, depois o resto. */
export function prioridadeDaClasse(dscp: number): number {
  if (dscp === 46) return 6;
  if (dscp >= 48) return 7;
  const af = dscp >> 3;
  if (dscp % 2 === 0 && dscp % 8 !== 0 && af >= 1 && af <= 4) return af + 1;
  if (dscp % 8 === 0 && dscp > 0) return Math.min(5, dscp >> 3);
  return 0;
}
