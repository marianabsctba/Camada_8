import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// muda a cada build: entra no endereço dos modelos para o navegador não reaproveitar arquivo velho
const VERSAO = Date.now().toString(36);

const PASTA_CONTEUDO = fileURLToPath(new URL('./src/conteudo/', import.meta.url));
/** Mesmos arquivos que o import.meta.glob de src/conteudo/carregar.ts e dias.ts. */
const ARQUIVO_DE_CONTEUDO = /^(ato\d.*|extras\d.*|passos.*)\.ts$/;

/**
 * Índice leve do conteúdo, lido do texto dos arquivos na hora do build: que números originais de dia
 * cada arquivo traz. Com ele o mapa sabe o que já é jogável e o jogo sabe que arquivos baixar para um
 * ato sem baixar o conteúdo antes. tests/carregar.test.ts confere o índice contra o conteúdo de verdade.
 */
function indiceDoConteudo(): Plugin {
  const ID = 'virtual:indice-conteudo';
  return {
    name: 'camada8-indice-conteudo',
    resolveId: (id) => (id === ID ? '\0' + ID : undefined),
    load(id) {
      if (id !== '\0' + ID) return undefined;
      this.addWatchFile(PASTA_CONTEUDO);
      const indice: Record<string, number[]> = {};
      for (const nome of readdirSync(PASTA_CONTEUDO).filter((n) => ARQUIVO_DE_CONTEUDO.test(n)).sort()) {
        const caminho = join(PASTA_CONTEUDO, nome);
        this.addWatchFile(caminho);
        const texto = readFileSync(caminho, 'utf8');
        const refs = nome.startsWith('ato')
          ? // um dia: "numero: 16," e logo abaixo "ato: 1,"
            [...texto.matchAll(/\bnumero:\s*(\d+),\s*\n\s*ato:\s*\d+/g)]
          : // aula, desafio ou passos de um dia: chave "  16: [" ou "  16: {" no primeiro nível do objeto
            [...texto.matchAll(/^ {2}(\d+):\s*[[{]/gm)];
        indice[`./${nome}`] = refs.map((m) => Number(m[1]));
      }
      return `export const REFS_POR_ARQUIVO = ${JSON.stringify(indice)};\n`;
    },
  };
}

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  base: '/Camada_8/',
  server: { port: 5388 },
  plugins: [indiceDoConteudo()],
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // pedaços separados: o navegador baixa em paralelo e guarda o que não mudou entre publicações.
        // O conteúdo dos atos fica fora daqui: cada arquivo vira um pedaço pelo import() de carregar.ts,
        // e o jogo baixa só os do ato aberto. Currículo e tipos vão no pedaço principal.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('/src/motor/')) return 'motor';
          return undefined;
        },
      },
    },
  },
});
