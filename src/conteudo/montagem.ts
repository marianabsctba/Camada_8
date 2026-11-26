// Montagem dos dias jogáveis a partir dos arquivos de conteúdo, usada igual pelo catálogo
// síncrono (dias.ts, dos testes) e pelo carregamento por ato do jogo (carregar.ts).

import { CURRICULO, type EntradaCurriculo } from './curriculo';
import type { Extra } from './extras';
import type { Dia, Passo } from './tipos';

/** O que os arquivos de conteúdo trazem: dias no número original, aula e desafio, e passos do modo guiado. */
export interface Fontes {
  dias: Map<number, Dia>;
  extras: Record<number, Extra>;
  passos: Record<number, Passo[]>;
}

/**
 * Junta os módulos de conteúdo pelo nome das exportações: ATO* (lista de dias), EXTRAS* (aula e
 * desafio por número original) e PASSOS* (modo guiado por número original). As outras exportações
 * (constantes e funções que um arquivo empresta a outro) ficam de fora.
 */
export function fontesDosModulos(modulos: Iterable<Record<string, unknown>>): Fontes {
  const f: Fontes = { dias: new Map(), extras: {}, passos: {} };
  for (const m of modulos) {
    for (const [nome, valor] of Object.entries(m)) {
      if (/^ATO\d/.test(nome) && Array.isArray(valor)) for (const d of valor as Dia[]) f.dias.set(d.numero, d);
      else if (/^EXTRAS\d/.test(nome)) Object.assign(f.extras, valor);
      else if (/^PASSOS/.test(nome)) Object.assign(f.passos, valor);
    }
  }
  return f;
}

/** Os dias na ordem do currículo, só os que já têm roteiro escrito, com o número, o ato e a luz do currículo. */
export function montarDias(f: Fontes, entradas: EntradaCurriculo[] = CURRICULO): Dia[] {
  return entradas
    .filter((e) => e.ref !== undefined && f.dias.has(e.ref))
    .map((e) => {
      const d = f.dias.get(e.ref!)!;
      const x = f.extras[e.ref!];
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
        passos: d.passos ?? f.passos[e.ref!] ?? [],
        aula: d.aula ?? x?.aula,
        desafio: d.desafio ?? x?.desafio,
      };
    });
}
