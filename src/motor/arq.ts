// Protocolos de retransmissão (ARQ) simulados evento a evento: pare e espere, go-back-N e
// retransmissão seletiva. O receptor só enxerga o número de sequência, nunca o quadro "de verdade":
// é assim que janela grande demais faz ele aceitar um quadro velho como se fosse novo.

import { Simulador } from './eventos';

export type ProtocoloArq = 'pare-e-espere' | 'go-back-n' | 'seletiva';

export interface ConfigArq {
  protocolo: ProtocoloArq;
  janela: number;
  /** Bits do número de sequência. 0 = sem número nenhum. */
  bitsSeq: number;
  timeoutMs: number;
}

export interface Linha {
  taxaBps: number;
  propagacaoMs: number;
  bytesQuadro: number;
  /** Probabilidade de perder um quadro de dados. */
  perdaDados?: number;
  /** Transmissões de dados perdidas (contando a partir de 0, retransmissões incluídas). */
  perdasDados?: number[];
  /** ACKs perdidos (contando a partir de 0). */
  perdasAck?: number[];
}

export interface ResultadoArq {
  quadros: number;
  entreguesCertos: number;
  /** Quadro velho aceito como novo, ou fora de ordem: corrompe o arquivo sem ninguém notar. */
  entreguesErrados: number;
  transmissoes: number;
  retransmissoes: number;
  /** Retransmissões de quadros que já tinham chegado (timeout cedo demais). */
  desnecessarias: number;
  tempoMs: number;
  utilizacao: number;
  concluiu: boolean;
  linhas: string[];
}

export function simularArq(c: ConfigArq, l: Linha, quadros: number, rng: () => number = Math.random): ResultadoArq {
  const sim = new Simulador();
  const Tf = (l.bytesQuadro * 8) / l.taxaBps; // s
  const Tp = l.propagacaoMs / 1000;
  const T = c.timeoutMs / 1000;
  const modulo = c.bitsSeq > 0 ? 2 ** c.bitsSeq : 1;
  const W = c.protocolo === 'pare-e-espere' ? 1 : Math.max(1, c.janela);
  const seq = (id: number) => id % modulo;

  let txIdx = 0;
  let ackIdx = 0;
  let linhaLivre = 0;
  let base = 0;
  let proximo = 0;
  const confirmado = new Set<number>();
  const recebidoDeVerdade = new Set<number>();
  const timers = new Map<number, number>(); // id -> geração do timer
  let geracao = 0;
  let fim = -1;
  let transmissoes = 0;
  let retransmissoes = 0;
  let desnecessarias = 0;
  const enviadoAlgumaVez = new Set<number>();
  const linhas: string[] = [];
  const log = (s: string) => {
    if (linhas.length < 14) linhas.push(`${(sim.agora * 1000).toFixed(1).padStart(8)} ms  ${s}`);
  };

  // receptor
  let esperado = 0; // id que o receptor acha que vem agora
  const buffer = new Map<number, number>(); // id suposto -> id real (seletiva)
  const entregues: number[] = []; // ids reais, na ordem entregue
  let entreguesErrados = 0;

  const entregar = (suposto: number, real: number) => {
    entregues.push(real);
    if (suposto !== real) {
      entreguesErrados++;
      log(`!! receptor entregou o quadro ${real} achando que era o ${suposto}`);
    }
  };

  const enviarAck = (s: number) => {
    const meu = ackIdx++;
    const perdido = l.perdasAck?.includes(meu);
    sim.agendar(Tp, () => {
      if (perdido) return log(`ACK ${s} perdido no caminho`);
      receberAck(s);
    });
  };

  const receber = (real: number) => {
    const s = seq(real);
    recebidoDeVerdade.add(real);
    if (c.protocolo === 'seletiva') {
      // aceita qualquer coisa dentro da janela do receptor, pelo número de sequência
      for (let k = 0; k < W; k++) {
        const candidato = esperado + k;
        if (seq(candidato) === s) {
          if (!buffer.has(candidato)) buffer.set(candidato, real);
          break;
        }
      }
      while (buffer.has(esperado)) {
        entregar(esperado, buffer.get(esperado)!);
        buffer.delete(esperado);
        esperado++;
      }
      enviarAck(s);
      return;
    }
    if (s === seq(esperado)) {
      entregar(esperado, real);
      esperado++;
      enviarAck(s);
    } else {
      // fora de ordem: descarta e repete o ACK do último aceito
      enviarAck(seq(esperado - 1 + modulo * 1000));
    }
  };

  const transmitir = (id: number) => {
    const inicio = Math.max(sim.agora, linhaLivre);
    linhaLivre = inicio + Tf;
    const meu = txIdx++;
    transmissoes++;
    if (enviadoAlgumaVez.has(id)) {
      retransmissoes++;
      if (recebidoDeVerdade.has(id)) desnecessarias++;
    }
    enviadoAlgumaVez.add(id);
    const perdido = l.perdasDados?.includes(meu) || (l.perdaDados ? rng() < l.perdaDados : false);
    sim.agendar(inicio - sim.agora + Tf + Tp, () => {
      if (perdido) return log(`quadro ${id} (seq ${seq(id)}) perdido`);
      log(`chegou o quadro ${id} (seq ${seq(id)})`);
      receber(id);
    });
    armar(id, inicio - sim.agora + Tf);
  };

  const armar = (id: number, depois: number) => {
    const g = ++geracao;
    timers.set(id, g);
    sim.agendar(depois + T, () => {
      if (timers.get(id) !== g || confirmado.has(id)) return;
      log(`timeout do quadro ${id}: retransmitindo`);
      if (c.protocolo === 'go-back-n') {
        for (let k = base; k < proximo; k++) transmitir(k);
      } else transmitir(id);
    });
  };

  const encher = () => {
    while (proximo < quadros && proximo < base + W) transmitir(proximo++);
  };

  const receberAck = (s: number) => {
    // procura, dentro da janela de envio, o quadro que este ACK confirma
    for (let k = base; k < proximo; k++) {
      if (seq(k) !== s) continue;
      if (c.protocolo === 'seletiva') {
        confirmado.add(k);
        timers.delete(k);
        while (confirmado.has(base)) base++;
      } else {
        for (let j = base; j <= k; j++) {
          confirmado.add(j);
          timers.delete(j);
        }
        base = k + 1;
      }
      break;
    }
    if (base >= quadros && fim < 0) fim = sim.agora;
    encher();
  };

  encher();
  sim.rodar(200000);

  const entreguesCertos = entregues.filter((id, i) => id === i).length;
  const concluiu = entregues.length >= quadros && fim >= 0;
  const tempoMs = (concluiu ? fim : sim.agora) * 1000;
  const utilizacao = concluiu ? (quadros * Tf) / fim : 0;
  return { quadros, entreguesCertos, entreguesErrados, transmissoes, retransmissoes, desnecessarias, tempoMs, utilizacao, concluiu, linhas };
}

/** Utilização teórica do pare e espere: Tf / (Tf + 2 Tp). */
export function utilizacaoPareEspere(l: Linha): number {
  const Tf = (l.bytesQuadro * 8) / l.taxaBps;
  return Tf / (Tf + (2 * l.propagacaoMs) / 1000);
}

/** Janela para encher o cano: 1 + 2 Tp / Tf, arredondado para cima. */
export function janelaIdeal(l: Linha): number {
  const Tf = (l.bytesQuadro * 8) / l.taxaBps;
  return Math.ceil(1 + (2 * l.propagacaoMs) / 1000 / Tf);
}
