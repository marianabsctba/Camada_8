# Camada 8

Jogo 3D em primeira pessoa para aprender redes de computadores de verdade, da crimpagem do cabo ao certificado TLS.

Você está sozinha, ou sozinho, com um alicate, um rack e uma cidade inteira que depende de você. Não tem colega, chefe nem cliente em cena: só você e os equipamentos. E os equipamentos têm opinião.

> A camada 8 do modelo OSI é a do usuário. Neste jogo, ela é você.

## Estado

Modo guiado: cada dia é uma sequência de passos curtos. O jogo diz em uma frase o que fazer e por quê, uma seta laranja marca o objeto certo na sala em 3D, e o E faz o passo. Nas escolhas (cores do cabo, transceptor, canal), o erro vem explicado. Estão prontos os atos 0 (Sem Senha), 1 (O Poste) e 2 (O Quadro), com 30 dias e o motor de simulação das camadas física e de enlace. O documento de desenho está em [DESENHO.md](DESENHO.md).

## Rodar

```
npm install
npm run dev
npm test
```

Os testes trazem um robô que resolve cada dia digitando no terminal, e um conjunto de armadilhas que precisam falhar do jeito que o manual explica.

## Tecnologia

TypeScript, Vite e Three.js, publicado no GitHub Pages.

Powered by Mariana BS.
