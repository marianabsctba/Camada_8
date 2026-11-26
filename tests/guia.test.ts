// O robô segue o modo guiado de todos os dias, escolhendo a resposta certa de cada passo.
import { describe, expect, it } from 'vitest';
import { DIAS, porRef } from '../src/conteudo/dias';
import { camposDoPasso, executarPasso } from '../src/conteudo/guia';
import { Terminal } from '../src/motor/cli';

const TRAVESSAO = /[—–]/;

describe('modo guiado', () => {
  for (const dia of DIAS) {
    it(`dia ${dia.numero}: ${dia.titulo}`, () => {
      const t = new Terminal(dia.montar(), dia);
      expect(dia.passos!.length, 'sem passos').toBeGreaterThan(0);
      dia.passos!.forEach((p, i) => {
        for (const nome of p.pedir ?? []) {
          expect(camposDoPasso(t, p).some((c) => c.nome === nome), `dia ${dia.numero} passo ${i + 1}: campo ${nome} não existe`).toBe(true);
          expect(p.exemplo?.[nome], `dia ${dia.numero} passo ${i + 1}: sem exemplo de ${nome}`).toBeDefined();
        }
        // como na tela: quando dá errado, a pessoa tenta de novo (a clivagem torta do dia 11 é de propósito)
        let r = executarPasso(t, dia, p, p.exemplo ?? {});
        for (let k = 0; k < 2 && r.ok !== true; k++) r = executarPasso(t, dia, p, p.exemplo ?? {});
        expect(r.ok, `dia ${dia.numero} passo ${i + 1}: ${p.instrucao}\n${r.feito.map((f) => f.saida.join('\n')).join('\n')}`).toBe(true);
        for (const x of [p.instrucao, p.porque, p.feito]) expect(TRAVESSAO.test(x), x).toBe(false);
      });
      const falhas = dia.objetivo(t.mundo).filter((i) => !i.ok).map((i) => i.texto);
      expect(falhas).toEqual([]);
    });
  }

  it('escolhas erradas explicam o porquê', () => {
    const casos: [number, number, Record<string, string>, RegExp][] = [
      [1, 2, { modo: 'normal' }, /senha que você não sabe/],
      [8, 1, { meio: 'cat6' }, /55 m/],
      [10, 2, { modelo: 'LX-10' }, /1550/],
      [13, 2, { baud: '6000', mod: 'qam64' }, /Shannon/],
      [16, 1, { resposta: '2' }, /BSSID/],
      [16, 8, { canal: '7' }, /SNR/],
      [18, 2, { orbita: 'meo' }, /100 ms/],
    ];
    for (const [n, idx, escolha, re] of casos) {
      const dia = porRef(n);
      const t = new Terminal(dia.montar(), dia);
      for (let i = 0; i < idx; i++) executarPasso(t, dia, dia.passos![i]!, dia.passos![i]!.exemplo ?? {});
      const r = executarPasso(t, dia, dia.passos![idx]!, escolha);
      expect(r.ok, `dia ${n}`).toMatch(re);
    }
  });
});
