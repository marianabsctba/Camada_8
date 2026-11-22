// Aparelhos com física própria: modem de linha telefônica, multiplexador E1 e ponto de acesso.

import { db, deDb } from './util';

/* ---------- Modem: Nyquist e Shannon ---------- */

export const BITS_POR_SIMBOLO: Record<string, number> = { bpsk: 1, qpsk: 2, qam16: 4, qam64: 6, qam256: 8 };
/** SNR mínima para BER de 1e-6, aproximada. */
export const SNR_MINIMA: Record<string, number> = { bpsk: 10.5, qpsk: 13.5, qam16: 20.5, qam64: 26.5, qam256: 32.5 };

export interface EstadoModem {
  bandaHz: number;
  snrDb: number;
  baud: number;
  modulacao: string;
}

export function avaliarModem(s: EstadoModem) {
  const bits = BITS_POR_SIMBOLO[s.modulacao] ?? 0;
  const taxa = s.baud * bits;
  const nyquist = 2 * s.bandaHz;
  const shannon = s.bandaHz * Math.log2(1 + deDb(s.snrDb));
  const motivos: string[] = [];
  if (s.baud > nyquist) motivos.push(`${s.baud} Bd passa dos ${nyquist} Bd de Nyquist (2 × ${s.bandaHz} Hz): um símbolo pisa no outro`);
  if (s.snrDb < (SNR_MINIMA[s.modulacao] ?? 99)) motivos.push(`${s.modulacao.toUpperCase()} precisa de ${SNR_MINIMA[s.modulacao]} dB de SNR e a linha só tem ${s.snrDb} dB`);
  if (taxa > shannon) motivos.push(`${(taxa / 1000).toFixed(1)} kb/s passa da capacidade de Shannon, ${(shannon / 1000).toFixed(1)} kb/s. Shannon não negocia.`);
  return { ok: motivos.length === 0, taxa, nyquist, shannon, motivos };
}

/* ---------- Multiplexador E1 ---------- */

export type UsoSlot = 'enquadramento' | 'sinalizacao' | 'voz' | 'dados' | 'livre';

export function avaliarE1(slots: UsoSlot[]) {
  const voz = slots.filter((x) => x === 'voz').length;
  const dados = slots.filter((x) => x === 'dados').length * 64;
  const lof = slots[0] !== 'enquadramento' || slots.slice(1).includes('enquadramento');
  const sinalizacao = slots[16] === 'sinalizacao' && slots.filter((x) => x === 'sinalizacao').length === 1;
  return { voz, dados, lof, sinalizacao };
}

/* ---------- Ponto de acesso 2,4 GHz ---------- */

export interface Vizinho {
  nome: string;
  canal: number;
  dbm: number;
}

export interface EstadoAp {
  canal: number;
  sinalCliente: number;
  ruidoDbm: number;
  vizinhos: Vizinho[];
}

/** Fração do canal vizinho que cai dentro do meu: canais de 22 MHz espaçados de 5 MHz. */
export function sobreposicao(a: number, b: number): number {
  return Math.max(0, 1 - (Math.abs(a - b) * 5) / 22);
}

export function snrWifi(s: EstadoAp, canal = s.canal) {
  let mw = deDb(s.ruidoDbm);
  for (const v of s.vizinhos) {
    const f = sobreposicao(canal, v.canal);
    if (f > 0) mw += deDb(v.dbm) * f;
  }
  const interferencia = db(mw);
  return { interferencia, snr: s.sinalCliente - interferencia };
}
