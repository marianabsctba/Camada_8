// O carregamento por ato do jogo monta exatamente os mesmos dias do catálogo síncrono,
// e o índice lido do texto no build bate com o conteúdo de verdade.
import { describe, expect, it } from 'vitest';
import { REFS_POR_ARQUIVO } from 'virtual:indice-conteudo';
import { arquivosDoAto, carregarAto, diaJaCarregado, diaPorNumero, NUMEROS_JOGAVEIS } from '../src/conteudo/carregar';
import { CURRICULO } from '../src/conteudo/curriculo';
import { DIAS } from '../src/conteudo/dias';
import { fontesDosModulos } from '../src/conteudo/montagem';
import { ATOS } from '../src/conteudo/tipos';

const MODULOS = import.meta.glob<Record<string, unknown>>(['../src/conteudo/ato*.ts', '../src/conteudo/extras[0-9]*.ts', '../src/conteudo/passos*.ts'], { eager: true });

describe('carregamento por ato', () => {
  it('o índice do build traz os mesmos dias de cada arquivo', () => {
    const real: Record<string, number[]> = {};
    for (const [caminho, m] of Object.entries(MODULOS)) {
      const f = fontesDosModulos([m]);
      const refs = caminho.includes('/ato') ? [...f.dias.keys()] : [...Object.keys(f.extras), ...Object.keys(f.passos)].map(Number);
      real[caminho.replace('../src/conteudo/', './')] = refs.sort((a, b) => a - b);
    }
    const indice = Object.fromEntries(Object.entries(REFS_POR_ARQUIVO).map(([a, r]) => [a, [...r].sort((x, y) => x - y)]));
    expect(indice).toEqual(real);
  });

  it('o mapa sabe sem baixar nada quais dias são jogáveis', () => {
    expect([...NUMEROS_JOGAVEIS].sort((a, b) => a - b)).toEqual(DIAS.map((d) => d.numero).sort((a, b) => a - b));
  });

  it('cada ato carregado sozinho é igual ao pedaço dele no catálogo', async () => {
    for (const ato of ATOS) {
      const dias = await carregarAto(ato.numero);
      expect(dias).toEqual(DIAS.filter((d) => d.ato === ato.numero));
    }
  });

  it('um ato baixa só os arquivos dos dias dele', () => {
    expect(arquivosDoAto(0).some((a) => /ato[1-9]/.test(a))).toBe(false);
    // o dia de origem 16 é do ato 3 no currículo, mas mora em ato1.ts
    if (CURRICULO.some((e) => e.ref === 16 && e.ato === 3)) expect(arquivosDoAto(3)).toContain('./ato1.ts');
  });

  it('acha o dia pelo número do currículo', async () => {
    const d = DIAS[DIAS.length - 1]!;
    expect((await diaPorNumero(d.numero)).ref).toBe(d.ref);
    expect(diaJaCarregado(d.numero)?.numero).toBe(d.numero);
  });
});
