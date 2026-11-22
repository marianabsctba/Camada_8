// Catálogo de dias, na ordem em que se joga, já com o roteiro do modo guiado.

import { ATO0 } from './ato0';
import { ATO1 } from './ato1';
import { PASSOS } from './passos';
import type { Dia } from './tipos';

export const DIAS: Dia[] = [...ATO0, ...ATO1].map((d) => ({ ...d, passos: PASSOS[d.numero] ?? [] }));
