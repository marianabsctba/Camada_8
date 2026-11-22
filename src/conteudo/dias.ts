// Catálogo de dias, na ordem em que se joga.

import { ATO0 } from './ato0';
import { ATO1 } from './ato1';
import type { Dia } from './tipos';

export const DIAS: Dia[] = [...ATO0, ...ATO1];
