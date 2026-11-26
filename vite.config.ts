import { defineConfig } from 'vite';

// muda a cada build: entra no endereço dos modelos para o navegador não reaproveitar arquivo velho
const VERSAO = Date.now().toString(36);

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(VERSAO) },
  base: '/Camada_8/',
  server: { port: 5388 },
  build: {
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // pedaços separados: o navegador baixa em paralelo e guarda o que não mudou entre publicações
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('/src/conteudo/')) return 'conteudo';
          if (id.includes('/src/motor/')) return 'motor';
          return undefined;
        },
      },
    },
  },
});
