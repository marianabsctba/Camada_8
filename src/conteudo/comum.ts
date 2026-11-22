// Ajudantes para escrever dias.

import { avaliar } from '../motor/fisico';
import type { Mundo } from '../motor/mundo';
import { lerNumero, perto } from '../motor/util';
import type { ItemObjetivo, Pergunta } from './tipos';

export function item(texto: string, ok: boolean, detalhe?: string): ItemObjetivo {
  return { texto, ok, detalhe };
}

export interface RegistroPing {
  n: number;
  recebidos: number;
  media: number;
}

export function registroPing(m: Mundo, de: string, ip: string): RegistroPing | undefined {
  return m.flags.pings?.[`${de}>${ip}`];
}

/** Ping feito pelo jogador, com pelo menos n pedidos e perda máxima em %. */
export function pingOk(m: Mundo, de: string, ip: string, minimo = 1, perdaMax = 0, mediaMaxMs = Infinity): ItemObjetivo {
  const r = registroPing(m, de, ip);
  const texto = `ping de ${de} para ${ip} com ${minimo > 1 ? `${minimo} pedidos e ` : ''}${perdaMax === 0 ? 'zero perda' : `até ${perdaMax} % de perda`}${mediaMaxMs < Infinity ? ` e média abaixo de ${mediaMaxMs} ms` : ''}`;
  if (!r) return item(texto, false, 'ainda não foi feito');
  const perda = ((r.n - r.recebidos) / r.n) * 100;
  const ok = r.n >= minimo && perda <= perdaMax && r.recebidos > 0 && r.media < mediaMaxMs;
  return item(texto, ok, `último: ${r.recebidos} de ${r.n}${Number.isFinite(r.media) ? `, média ${r.media.toFixed(1)} ms` : ''}`);
}

export function enlace(m: Mundo, id: string) {
  return avaliar(m, m.cabos.get(id)!);
}

export function numerica(id: string, texto: string, certo: number | ((m: Mundo) => number), tolerancia: number): Pergunta {
  return {
    id,
    texto,
    confere: (r, m) => perto(r, typeof certo === 'function' ? certo(m) : certo, tolerancia),
  };
}

export function respondida(m: Mundo, p: Pergunta): ItemObjetivo {
  const r = m.respostas[p.id];
  return item(`pergunta ${p.id} respondida certo`, r !== undefined && p.confere(r, m), r === undefined ? 'sem resposta' : r);
}

export function todasRespondidas(m: Mundo, ps: Pergunta[]): ItemObjetivo[] {
  return ps.map((p) => respondida(m, p));
}

export { lerNumero };
