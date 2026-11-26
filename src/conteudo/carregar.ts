// Conteúdo dos dias sob demanda: o jogo baixa um ato quando a pessoa abre um dia dele, e não antes.
// A capa e o mapa só precisam do currículo e do índice gerado no build (quais dias já têm roteiro).
// A montagem é a mesma de dias.ts (montagem.ts); só a forma de trazer os arquivos muda.

import { REFS_POR_ARQUIVO } from 'virtual:indice-conteudo';
import { CURRICULO } from './curriculo';
import { fontesDosModulos, montarDias } from './montagem';
import type { Dia } from './tipos';

/** Um import() por arquivo; o Vite troca cada um pelo pedaço gerado no build. */
const ARQUIVOS = import.meta.glob<Record<string, unknown>>(['./ato*.ts', './extras[0-9]*.ts', './passos*.ts']);

/** Números originais dos dias que existem em algum ato*.ts. */
const ESCRITOS = new Set(
  Object.entries(REFS_POR_ARQUIVO)
    .filter(([arquivo]) => arquivo.startsWith('./ato'))
    .flatMap(([, refs]) => refs),
);

/** Números (do currículo) dos dias que já têm roteiro escrito. */
export const NUMEROS_JOGAVEIS: ReadonlySet<number> = new Set(CURRICULO.filter((e) => e.ref !== undefined && ESCRITOS.has(e.ref)).map((e) => e.numero));

/**
 * Arquivos que um ato precisa: os que trazem algum dia dele, mais aula, desafio e passos desses dias.
 * Vem do índice, então um dia que mora em arquivo de outro ato (o 16 do ato 3 está em ato1.ts) também entra.
 */
export function arquivosDoAto(n: number): string[] {
  const refs = new Set(CURRICULO.filter((e) => e.ato === n && e.ref !== undefined).map((e) => e.ref!));
  return Object.entries(REFS_POR_ARQUIVO)
    .filter(([arquivo, rs]) => arquivo in ARQUIVOS && rs.some((r) => refs.has(r)))
    .map(([arquivo]) => arquivo);
}

const pedidos = new Map<number, Promise<Dia[]>>();
const prontos = new Map<number, Dia[]>();

/** Dias de um ato, na ordem do currículo. Uma falha de rede não fica guardada: chamar de novo tenta de novo. */
export function carregarAto(n: number): Promise<Dia[]> {
  let p = pedidos.get(n);
  if (!p) {
    p = Promise.all(arquivosDoAto(n).map((a) => ARQUIVOS[a]!())).then((modulos) => {
      const dias = montarDias(fontesDosModulos(modulos), CURRICULO.filter((e) => e.ato === n));
      prontos.set(n, dias);
      return dias;
    });
    p.catch(() => pedidos.delete(n));
    pedidos.set(n, p);
  }
  return p;
}

/** O dia, se o ato dele já chegou; senão undefined (sem baixar nada). */
export function diaJaCarregado(numero: number): Dia | undefined {
  const ato = CURRICULO.find((e) => e.numero === numero)?.ato;
  return ato === undefined ? undefined : prontos.get(ato)?.find((d) => d.numero === numero);
}

/** O dia pelo número do currículo, baixando o ato dele se preciso. */
export async function diaPorNumero(numero: number): Promise<Dia> {
  const entrada = CURRICULO.find((e) => e.numero === numero);
  if (!entrada) throw new Error(`dia ${numero} não está no currículo`);
  const d = (await carregarAto(entrada.ato)).find((x) => x.numero === numero);
  if (!d) throw new Error(`dia ${numero} ainda não tem roteiro`);
  return d;
}

/** Baixa um ato em segundo plano, quando o navegador estiver folgado. Falha aqui é silenciosa: quem abrir o dia tenta de novo. */
export function preCarregarAto(n: number): void {
  if (n < 0 || prontos.has(n) || pedidos.has(n) || !arquivosDoAto(n).length) return;
  const ir = () => void carregarAto(n).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(ir, { timeout: 3000 });
  else setTimeout(ir, 500);
}
