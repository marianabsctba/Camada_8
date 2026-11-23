// Catálogo de dias jogáveis, na ordem do currículo, com aula, prática guiada e desafio.

import { ATO0 } from './ato0';
import { ATO1 } from './ato1';
import { ATO2 } from './ato2';
import { ATO0A } from './ato0a';
import { ATO0B } from './ato0b';
import { ATO0C } from './ato0c';
import { ATO0D } from './ato0d';
import { CURRICULO } from './curriculo';
import { EXTRAS } from './extras';
import { PASSOS } from './passos';
import type { Dia } from './tipos';

const ORIGINAIS = new Map([...ATO0, ...ATO1, ...ATO2, ...ATO0A, ...ATO0B, ...ATO0C, ...ATO0D].map((d) => [d.numero, d]));

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
