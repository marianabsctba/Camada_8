// Aula e desafio de cada dia, por número original do dia.

import { EXTRAS0 } from './extras0';
import { EXTRAS1 } from './extras1';
import { EXTRAS2 } from './extras2';
import type { Aula, Desafio } from './tipos';

export interface Extra {
  aula: Aula;
  desafio: Desafio;
}

export const EXTRAS: Record<number, Extra> = { ...EXTRAS0, ...EXTRAS1, ...EXTRAS2 };
