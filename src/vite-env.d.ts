/// <reference types="vite/client" />
declare const __VERSAO__: string;

/** Índice do conteúdo gerado no build (vite.config.ts): números originais de dia por arquivo de src/conteudo. */
declare module 'virtual:indice-conteudo' {
  export const REFS_POR_ARQUIVO: Record<string, number[]>;
}
