// Fila de saída de uma porta de roteador e congestionamento (ato 4), parte pura.
// Uma porta com fontes de tráfego (taxa, tamanho de pacote, rajadas), capacidade do enlace e buffer em pacotes,
// simulada pacote a pacote no simulador de eventos discretos. Mede atraso médio, variação do atraso (jitter),
// ocupação e perdas. Técnicas: descarte no fim da fila, RED, marcação ECN, controle de admissão,
// sinal de volta para a origem (choke packet) e descarte de carga (load shedding) pelo menos importante.
// Nada aqui conhece o mundo do jogo: entra configuração, sai número. O console fica em cliQos.ts.

import { Simulador } from './eventos';
import { rngSemente } from './util';

export interface FonteTrafego {
  nome: string;
  /** Taxa média oferecida, em Mb/s. */
  mbps: number;
  /** Bytes por pacote (padrão 1000). */
  tamanho?: number;
  /** Pacotes que chegam juntos em cada rajada (padrão 1: chegadas soltas, de Poisson). */
  rajada?: number;
  /** Importância para o descarte de carga: maior é mais importante (padrão 1). */
  importancia?: number;
  /** A fonte entende ECN (padrão sim). Se não entende, o RED descarta em vez de marcar. */
  ecn?: boolean;
  /** A fonte diminui a taxa quando recebe sinal de congestionamento (eco do ECN ou choke). Padrão sim. */
  responde?: boolean;
  /** Classe DSCP do tráfego (só informativa aqui; o escalonador usa). */
  classe?: string;
}

export interface ConfigRed {
  /** Limiar mínimo da média da fila, em pacotes: abaixo dele nada é descartado. */
  min: number;
  /** Limiar máximo: acima dele, tudo que chega é descartado. */
  max: number;
  /** Probabilidade de descarte quando a média encosta no máximo (padrão 0,1). */
  pmax?: number;
}

export interface ConfigFila {
  /** Quantos pacotes cabem esperando (o que está sendo transmitido não conta). */
  buffer: number;
  red?: ConfigRed;
  /** Marca o pacote (bits ECN do cabeçalho IP) em vez de descartar, quando a fonte entende. */
  ecn?: boolean;
  /** Choke packet: com a fila passando de 3/4 do buffer, o roteador manda um aviso direto para a origem. */
  choke?: boolean;
  /** Descarte de carga: com o buffer cheio, joga fora o pacote menos importante que está na fila. */
  descarte?: boolean;
  /** Controle de admissão: aceita fluxos novos só enquanto a soma das taxas cabe nesta fração da capacidade. */
  admissao?: number;
  /** Capacidade do enlace em Mb/s; sem isso, a velocidade do enlace da porta. */
  capacidade?: number;
}

export const BUFFER_PADRAO = 64;
export const TAMANHO_PADRAO = 1000;

export interface ResultadoFonte {
  nome: string;
  admitida: boolean;
  enviados: number;
  entregues: number;
  perdidos: number;
  marcados: number;
  sinais: number;
  atrasoMedio: number;
  vazaoMbps: number;
  /** Fator de taxa no fim (1 é a taxa pedida; cai quando a fonte obedece aos sinais). */
  fatorFinal: number;
}

export interface ResultadoFila {
  capacidadeMbps: number;
  /** Carga oferecida pelas fontes admitidas, em fração da capacidade. */
  carga: number;
  enviados: number;
  entregues: number;
  /** Perdas por buffer cheio (descarte no fim da fila). */
  perdasBuffer: number;
  /** Perdas antecipadas do RED. */
  perdasRed: number;
  /** Pacotes jogados fora pelo descarte de carga (estavam na fila e eram menos importantes). */
  perdasDescarte: number;
  perdas: number;
  /** Fração dos enviados que se perdeu. */
  taxaPerda: number;
  marcadosEcn: number;
  /** Choke packets mandados de volta. */
  sinais: number;
  /** Fontes recusadas pelo controle de admissão. */
  recusadas: string[];
  /** Segundos: espera na fila mais a transmissão. */
  atrasoMedio: number;
  /** Desvio padrão do atraso, em segundos. */
  jitter: number;
  atrasoMax: number;
  /** Pacotes esperando, em média no tempo. */
  ocupacaoMedia: number;
  ocupacaoMax: number;
  /** Fração do tempo em que o enlace transmitiu. */
  utilizacao: number;
  /** Atraso que o buffer cheio impõe: buffer × tempo de transmissão de um pacote. */
  atrasoBufferCheio: number;
  duracao: number;
  porFonte: ResultadoFonte[];
}

export interface OpcoesFila {
  /** Capacidade do enlace em Mb/s (vale mais que a da configuração, se vier). */
  capacidadeMbps: number;
  /** Quantos tempos de pacote simular (padrão 3000). */
  pacotes?: number;
  semente?: number;
  /** Quanto o sinal (eco do ECN ou choke) leva para chegar à origem, em segundos. Padrão: 20 tempos de pacote. */
  atrasoSinal?: number;
}

interface NaFila {
  fonte: number;
  chegada: number;
  bytes: number;
  importancia: number;
  marcado: boolean;
}

/** Quais fontes o controle de admissão deixa entrar, na ordem em que pediram. */
export function admitir(fontes: FonteTrafego[], capacidadeMbps: number, limite?: number): { aceitas: FonteTrafego[]; recusadas: FonteTrafego[] } {
  if (limite === undefined) return { aceitas: [...fontes], recusadas: [] };
  const aceitas: FonteTrafego[] = [];
  const recusadas: FonteTrafego[] = [];
  let soma = 0;
  for (const f of fontes) {
    if (soma + f.mbps <= limite * capacidadeMbps + 1e-9) {
      aceitas.push(f);
      soma += f.mbps;
    } else recusadas.push(f);
  }
  return { aceitas, recusadas };
}

/** Probabilidade de descarte (ou marcação) do RED para uma média de fila. */
export function probRed(red: ConfigRed, media: number): number {
  if (media < red.min) return 0;
  if (media >= red.max) return 1;
  return (red.pmax ?? 0.1) * ((media - red.min) / (red.max - red.min));
}

/**
 * Simula a porta: cada fonte manda rajadas com intervalos exponenciais (chegadas de Poisson) e a porta transmite
 * um pacote de cada vez, na ordem de chegada. Quem chega com o buffer cheio é descartado (ou, com descarte de
 * carga, derruba alguém menos importante). Com RED, a média da fila decide descartes antecipados. Com ECN, o
 * pacote é marcado em vez de descartado, e o destino devolve o aviso à origem. Fonte que recebe aviso corta a
 * taxa pela metade e volta a subir aos poucos.
 */
export function simularFila(cfg: ConfigFila, fontesPedidas: FonteTrafego[], o: OpcoesFila): ResultadoFila {
  const cap = (o.capacidadeMbps > 0 ? o.capacidadeMbps : (cfg.capacidade ?? 100)) * 1e6;
  const rng = rngSemente(o.semente ?? 4242);
  const { aceitas, recusadas } = admitir(fontesPedidas, cap / 1e6, cfg.admissao);
  const fontes = aceitas.map((f) => ({ ...f, tamanho: f.tamanho ?? TAMANHO_PADRAO, rajada: Math.max(1, Math.round(f.rajada ?? 1)), importancia: f.importancia ?? 1 }));
  const tamMedio = fontes.length ? fontes.reduce((s, f) => s + f.tamanho * f.mbps, 0) / Math.max(1e-9, fontes.reduce((s, f) => s + f.mbps, 0)) : TAMANHO_PADRAO;
  const tPacote = (tamMedio * 8) / cap;
  const duracao = (o.pacotes ?? 3000) * tPacote;
  const atrasoSinal = o.atrasoSinal ?? 20 * tPacote;
  const recupera = 1 / (20 * atrasoSinal); // fator por segundo: volta inteira em uns 20 tempos de sinal
  const buffer = Math.max(0, Math.floor(cfg.buffer));
  const sim = new Simulador();
  const fila: NaFila[] = [];
  let ocupado = false;
  let ocupadoDesde = 0;
  let tempoOcupado = 0;
  let area = 0;
  let ultimoT = 0;
  let ocupacaoMax = 0;
  let mediaRed = 0;
  const atrasos: number[] = [];
  const st = fontes.map(() => ({ enviados: 0, entregues: 0, perdidos: 0, marcados: 0, sinais: 0, somaAtraso: 0, bytes: 0, fator: 1, ultimoAjuste: 0, ultimoSinal: -Infinity, ultimoChoke: -Infinity }));
  const r: Omit<ResultadoFila, 'porFonte' | 'atrasoMedio' | 'jitter' | 'atrasoMax' | 'ocupacaoMedia' | 'ocupacaoMax' | 'utilizacao' | 'taxaPerda' | 'perdas'> = {
    capacidadeMbps: cap / 1e6,
    carga: fontes.reduce((s, f) => s + f.mbps, 0) / (cap / 1e6),
    enviados: 0,
    entregues: 0,
    perdasBuffer: 0,
    perdasRed: 0,
    perdasDescarte: 0,
    marcadosEcn: 0,
    sinais: 0,
    recusadas: recusadas.map((f) => f.nome),
    atrasoBufferCheio: buffer * tPacote,
    duracao,
  };

  const contar = () => {
    area += fila.length * (sim.agora - ultimoT);
    ultimoT = sim.agora;
  };
  const fator = (i: number) => {
    const s = st[i]!;
    s.fator = Math.min(1, s.fator + recupera * (sim.agora - s.ultimoAjuste));
    s.ultimoAjuste = sim.agora;
    return s.fator;
  };
  /** O aviso chega na origem depois de um tempo; ela corta pela metade, no máximo uma vez por ida e volta (como o TCP). */
  const avisar = (i: number) => {
    const f = fontes[i]!;
    if (f.responde === false) return;
    sim.agendar(atrasoSinal, () => {
      const s = st[i]!;
      fator(i);
      if (sim.agora - s.ultimoSinal < 4 * atrasoSinal) return;
      s.ultimoSinal = sim.agora;
      s.fator = Math.max(0.05, s.fator / 2);
      s.sinais++;
    });
  };
  const transmitir = () => {
    if (ocupado || !fila.length) return;
    const p = fila.shift()!;
    contar();
    ocupado = true;
    ocupadoDesde = sim.agora;
    sim.agendar((p.bytes * 8) / cap, () => {
      contar();
      ocupado = false;
      tempoOcupado += sim.agora - ocupadoDesde;
      const atraso = sim.agora - p.chegada;
      atrasos.push(atraso);
      const s = st[p.fonte]!;
      s.entregues++;
      s.somaAtraso += atraso;
      if (sim.agora <= duracao) s.bytes += p.bytes;
      r.entregues++;
      if (p.marcado) avisar(p.fonte);
      transmitir();
    });
  };
  const chegar = (i: number, bytes: number) => {
    const f = fontes[i]!;
    const s = st[i]!;
    s.enviados++;
    r.enviados++;
    const pkt: NaFila = { fonte: i, chegada: sim.agora, bytes, importancia: f.importancia, marcado: false };
    // RED: média móvel da fila, atualizada a cada chegada.
    if (cfg.red) {
      mediaRed = 0.95 * mediaRed + 0.05 * fila.length;
      const p = probRed(cfg.red, mediaRed);
      if (p > 0 && (p >= 1 || rng() < p)) {
        if (cfg.ecn && f.ecn !== false && p < 1) {
          pkt.marcado = true;
        } else {
          r.perdasRed++;
          s.perdidos++;
          return;
        }
      }
    } else if (cfg.ecn && f.ecn !== false && fila.length >= Math.max(1, buffer / 2)) {
      // Sem RED, a marcação vale a partir da metade do buffer.
      pkt.marcado = true;
    }
    if (cfg.choke && fila.length >= Math.max(1, (3 * buffer) / 4) && sim.agora - s.ultimoChoke >= atrasoSinal) {
      s.ultimoChoke = sim.agora;
      r.sinais++;
      avisar(i);
    }
    if (!ocupado && !fila.length) {
      fila.push(pkt);
      if (pkt.marcado) (r.marcadosEcn++, s.marcados++);
      transmitir();
      return;
    }
    if (fila.length >= buffer) {
      if (cfg.descarte && fila.length) {
        // O menos importante; no empate, o que chegou por último (o mais novo vale menos para quem já esperou).
        let k = -1;
        for (let j = 0; j < fila.length; j++) if (fila[j]!.importancia < pkt.importancia && (k < 0 || fila[j]!.importancia <= fila[k]!.importancia)) k = j;
        if (k >= 0) {
          const fora = fila.splice(k, 1)[0]!;
          r.perdasDescarte++;
          st[fora.fonte]!.perdidos++;
          if (fora.marcado) (r.marcadosEcn--, st[fora.fonte]!.marcados--);
        } else {
          r.perdasBuffer++;
          s.perdidos++;
          return;
        }
      } else {
        r.perdasBuffer++;
        s.perdidos++;
        return;
      }
    }
    contar();
    fila.push(pkt);
    if (pkt.marcado) (r.marcadosEcn++, s.marcados++);
    ocupacaoMax = Math.max(ocupacaoMax, fila.length);
  };
  // Cada fonte agenda a próxima rajada quando a anterior chega; a taxa de rajadas acompanha o fator.
  fontes.forEach((f, i) => {
    const proxima = () => {
      const pps = ((f.mbps * 1e6) / (f.tamanho * 8)) * fator(i);
      const intervalo = -Math.log(1 - rng()) / (pps / f.rajada);
      sim.agendar(intervalo, () => {
        if (sim.agora > duracao) return;
        for (let k = 0; k < f.rajada; k++) chegar(i, f.tamanho);
        proxima();
      });
    };
    if (f.mbps > 0) proxima();
  });
  sim.rodar(5e6);
  const n = atrasos.length;
  const media = n ? atrasos.reduce((s, x) => s + x, 0) / n : 0;
  const desvio = n > 1 ? Math.sqrt(atrasos.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1)) : 0;
  const perdas = r.perdasBuffer + r.perdasRed + r.perdasDescarte;
  const fim = Math.max(sim.agora, duracao);
  return {
    ...r,
    perdas,
    taxaPerda: r.enviados ? perdas / r.enviados : 0,
    atrasoMedio: media,
    jitter: desvio,
    atrasoMax: n ? Math.max(...atrasos) : 0,
    ocupacaoMedia: fim > 0 ? area / fim : 0,
    ocupacaoMax,
    utilizacao: fim > 0 ? tempoOcupado / fim : 0,
    porFonte: [
      ...fontes.map((f, i) => {
        const s = st[i]!;
        return { nome: f.nome, admitida: true, enviados: s.enviados, entregues: s.entregues, perdidos: s.perdidos, marcados: s.marcados, sinais: s.sinais, atrasoMedio: s.entregues ? s.somaAtraso / s.entregues : 0, vazaoMbps: (s.bytes * 8) / duracao / 1e6, fatorFinal: s.fator };
      }),
      ...recusadas.map((f) => ({ nome: f.nome, admitida: false, enviados: 0, entregues: 0, perdidos: 0, marcados: 0, sinais: 0, atrasoMedio: 0, vazaoMbps: 0, fatorFinal: 0 })),
    ],
  };
}

/** Fonte única de Poisson que oferece "carga" (fração da capacidade). */
export function fonteDeCarga(carga: number, capacidadeMbps: number, tamanho = TAMANHO_PADRAO): FonteTrafego {
  return { nome: 'tráfego', mbps: carga * capacidadeMbps, tamanho };
}

/** Escala as fontes para que a soma ofereça "carga" da capacidade, mantendo a proporção entre elas. */
export function escalarFontes(fontes: FonteTrafego[], carga: number, capacidadeMbps: number): FonteTrafego[] {
  const soma = fontes.reduce((s, f) => s + f.mbps, 0);
  if (!soma) return fontes.map((f) => ({ ...f }));
  return fontes.map((f) => ({ ...f, mbps: (f.mbps / soma) * carga * capacidadeMbps }));
}

/**
 * Atraso médio teórico de uma fila com chegadas de Poisson e pacotes de tamanho fixo (M/D/1), buffer infinito:
 * W = T + ρT / (2(1 - ρ)), com T o tempo de transmissão de um pacote. Explode quando ρ chega perto de 1.
 */
export function atrasoMD1(carga: number, tPacote: number): number {
  if (carga >= 1) return Infinity;
  return tPacote + (carga * tPacote) / (2 * (1 - carga));
}

export interface PontoCurva {
  carga: number;
  atrasoMedio: number;
  teorico: number;
  jitter: number;
  taxaPerda: number;
}

/** A curva carga × atraso: roda a mesma porta com várias cargas. */
export function curvaCarga(cfg: ConfigFila, capacidadeMbps: number, cargas: number[], tamanho = TAMANHO_PADRAO, semente = 7): PontoCurva[] {
  const tPacote = (tamanho * 8) / (capacidadeMbps * 1e6);
  return cargas.map((c) => {
    const r = simularFila(cfg, [fonteDeCarga(c, capacidadeMbps, tamanho)], { capacidadeMbps, semente, pacotes: 4000 });
    return { carga: c, atrasoMedio: r.atrasoMedio, teorico: atrasoMD1(c, tPacote), jitter: r.jitter, taxaPerda: r.taxaPerda };
  });
}

/** Tempo em texto: µs, ms ou s. */
export function tempoTxt(s: number): string {
  if (!Number.isFinite(s)) return '∞';
  if (s < 1e-3) return `${(s * 1e6).toFixed(1).replace('.', ',')} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(2).replace('.', ',')} ms`;
  return `${s.toFixed(2).replace('.', ',')} s`;
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

/** O resultado em linhas para o console. */
export function textoFila(cfg: ConfigFila, r: ResultadoFila): string[] {
  const tecnicas = [
    cfg.red ? `RED (mín ${cfg.red.min}, máx ${cfg.red.max}, pmáx ${String(cfg.red.pmax ?? 0.1).replace('.', ',')})` : 'descarte no fim da fila',
    cfg.ecn ? 'ECN ligado' : '',
    cfg.choke ? 'choke packet' : '',
    cfg.descarte ? 'descarte de carga' : '',
    cfg.admissao !== undefined ? `admissão até ${pct(cfg.admissao)}` : '',
  ].filter(Boolean);
  const l = [
    `Enlace de ${r.capacidadeMbps} Mb/s, buffer de ${cfg.buffer} pacote(s), ${tecnicas.join(', ')}.`,
    `Carga oferecida: ${pct(r.carga)} da capacidade.${r.recusadas.length ? ` Recusadas pelo controle de admissão: ${r.recusadas.join(', ')}.` : ''}`,
    `  atraso médio        ${tempoTxt(r.atrasoMedio)} (o pior: ${tempoTxt(r.atrasoMax)})`,
    `  variação (jitter)   ${tempoTxt(r.jitter)} de desvio padrão`,
    `  ocupação da fila    ${r.ocupacaoMedia.toFixed(1).replace('.', ',')} pacote(s) em média, ${r.ocupacaoMax} no pico`,
    `  enlace ocupado      ${pct(r.utilizacao)} do tempo`,
    `  perdas              ${r.perdas} de ${r.enviados} (${pct(r.taxaPerda)}): ${r.perdasBuffer} por buffer cheio, ${r.perdasRed} antecipadas pelo RED, ${r.perdasDescarte} pelo descarte de carga`,
  ];
  if (cfg.ecn || r.marcadosEcn) l.push(`  marcados com ECN    ${r.marcadosEcn}: chegaram, e o destino avisou a origem para ir mais devagar`);
  if (cfg.choke) l.push(`  choke packets       ${r.sinais} aviso(s) mandados direto para a origem`);
  if (r.porFonte.length > 1 || r.porFonte.some((f) => !f.admitida || f.sinais)) {
    l.push('  POR FONTE:');
    for (const f of r.porFonte) l.push(f.admitida ? `    ${f.nome.padEnd(10)} ${String(f.entregues).padStart(5)} entregues, ${String(f.perdidos).padStart(4)} perdidos, atraso ${tempoTxt(f.atrasoMedio)}, ${f.vazaoMbps.toFixed(2).replace('.', ',')} Mb/s${f.sinais ? `, obedeceu ${f.sinais} aviso(s) e terminou em ${pct(f.fatorFinal)} da taxa` : ''}` : `    ${f.nome.padEnd(10)} recusada na entrada: não cabia`);
  }
  l.push(`Com o buffer cheio, quem entra no fim espera ${tempoTxt(r.atrasoBufferCheio)} antes de sair.${r.atrasoBufferCheio > 0.1 ? ' Buffer grande demais: não perde quase nada, mas o pacote chega tão atrasado que para voz ou jogo já não serve.' : ''}`);
  return l;
}
