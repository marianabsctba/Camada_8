// Catálogo de dias jogáveis, na ordem do currículo, com aula, prática guiada e desafio.

import { ATO0 } from './ato0';
import { ATO1 } from './ato1';
import { ATO2 } from './ato2';
import { ATO0A } from './ato0a';
import { ATO0B } from './ato0b';
import { ATO0C } from './ato0c';
import { ATO0D } from './ato0d';
import { ATO1A } from './ato1a';
import { ATO1B } from './ato1b';
import { ATO1C } from './ato1c';
import { ATO1D } from './ato1d';
import { ATO1E } from './ato1e';
import { ATO2B } from './ato2b';
import { ATO3A } from './ato3a';
import { ATO3B } from './ato3b';
import { ATO3C } from './ato3c';
import { ATO3D } from './ato3d';
import { ATO3E } from './ato3e';
import { ATO3F } from './ato3f';
import { ATO4A } from './ato4a';
import { ATO4B } from './ato4b';
import { ATO4C } from './ato4c';
import { ATO4D } from './ato4d';
import { ATO4E } from './ato4e';
import { ATO4F } from './ato4f';
import { ATO4G } from './ato4g';
import { ATO4H } from './ato4h';
import { CURRICULO } from './curriculo';
import { EXTRAS } from './extras';
import { PASSOS } from './passos';
import type { Dia } from './tipos';

const ORIGINAIS = new Map([...ATO0, ...ATO1, ...ATO2, ...ATO0A, ...ATO0B, ...ATO0C, ...ATO0D, ...ATO1A, ...ATO1B, ...ATO1C, ...ATO1D, ...ATO1E, ...ATO2B, ...ATO3A, ...ATO3B, ...ATO3C, ...ATO3D, ...ATO3E, ...ATO3F, ...ATO4A, ...ATO4B, ...ATO4C, ...ATO4D, ...ATO4E, ...ATO4F, ...ATO4G, ...ATO4H].map((d) => [d.numero, d]));

export const DIAS: Dia[] = CURRICULO.filter((e) => e.ref !== undefined && ORIGINAIS.has(e.ref)).map((e) => {
  const d = ORIGINAIS.get(e.ref!)!;
  const x = EXTRAS[e.ref!];
  // a carta usa o número novo do dia, não o do roteiro original
  const chamado = d.chamado.map((l) => l.replace(/^CHAMADO #\d+/, `CHAMADO #${String(e.numero).padStart(4, '0')}`));
  return {
    ...d,
    chamado,
    numero: e.numero,
    ato: e.ato,
    ref: e.ref,
    secao: e.secao,
    luz: e.luz,
    passos: d.passos ?? PASSOS[e.ref!] ?? [],
    aula: d.aula ?? x?.aula,
    desafio: d.desafio ?? x?.desafio,
  };
});

/** Dia pelo número original (usado nos testes e nos roteiros escritos antes da renumeração). */
export function porRef(ref: number): Dia {
  const d = DIAS.find((x) => x.ref === ref);
  if (!d) throw new Error(`dia ${ref} não existe`);
  return d;
}
