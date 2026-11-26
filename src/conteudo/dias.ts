// Catálogo de dias jogáveis, na ordem do currículo, com aula, prática guiada e desafio.
// Carrega tudo de uma vez e de forma síncrona: é o caminho dos testes e das ferramentas.
// O jogo no navegador usa carregar.ts, que baixa um ato por vez.
// Arquivo novo ato*.ts, extras<N>*.ts ou passos*.ts entra sozinho, sem import a acrescentar aqui.

import { fontesDosModulos, montarDias } from './montagem';
import type { Dia } from './tipos';

const MODULOS = import.meta.glob<Record<string, unknown>>(['./ato*.ts', './extras[0-9]*.ts', './passos*.ts'], { eager: true });

export const DIAS: Dia[] = montarDias(fontesDosModulos(Object.values(MODULOS)));

/** Dia pelo número original (usado nos testes e nos roteiros escritos antes da renumeração). */
export function porRef(ref: number): Dia {
  const d = DIAS.find((x) => x.ref === ref);
  if (!d) throw new Error(`dia ${ref} não existe`);
  return d;
}
