// Toda aula ensina e todo desafio se resolve só clicando, sem seta.
import { describe, expect, it } from 'vitest';
import { DIAS } from '../src/conteudo/dias';
import { acoesDo, executarAcao, padroes } from '../src/motor/acoes';
import { Terminal } from '../src/motor/cli';
import type { Dia } from '../src/conteudo/tipos';

const TRAVESSAO = /[—–]/;

function textosDaAula(d: Dia): string[] {
  const a = d.aula!;
  return [...a.cartoes.flatMap((c) => [c.titulo, ...c.texto]), a.checagem.pergunta, ...a.checagem.opcoes, a.checagem.explicacao];
}

describe('aulas e desafios', () => {
  it('todo dia jogável tem aula e desafio', () => {
    const faltando = DIAS.filter((d) => !d.aula || !d.desafio).map((d) => `${d.numero} (${d.titulo}, ref ${d.ref})`);
    expect(faltando).toEqual([]);
  });

  for (const dia of DIAS.filter((d) => d.aula && d.desafio)) {
    it(`dia ${dia.numero}: ${dia.titulo}`, () => {
      const a = dia.aula!;
      expect(a.cartoes.length).toBeGreaterThanOrEqual(3);
      expect(a.cartoes.length).toBeLessThanOrEqual(6);
      expect(a.checagem.certa).toBeGreaterThanOrEqual(0);
      expect(a.checagem.certa).toBeLessThan(a.checagem.opcoes.length);
      expect(a.cartoes.some((c) => c.visual), 'aula sem nenhum visual').toBe(true);
      const des = dia.desafio!;
      for (const x of [...textosDaAula(dia), ...des.carta, ...des.dicas, ...(des.perguntas ?? []).map((p) => p.texto)]) expect(TRAVESSAO.test(x), x).toBe(false);

      const t = new Terminal(des.montar(), { ...dia, perguntas: des.perguntas ?? [], objetivo: des.objetivo });
      expect(des.objetivo(t.mundo).every((i) => i.ok), 'desafio já começa resolvido').toBe(false);
      const log: string[] = [];
      for (const [tipo, id, acaoId, valores] of des.solucao) {
        const acoes = acoesDo(t.mundo, tipo, id);
        const acao = acoes.find((x) => x.id === acaoId);
        expect(acao, `ação ${acaoId} em ${id}; tem ${acoes.map((x) => x.id).join(', ')}`).toBeDefined();
        for (const f of executarAcao(t, acao!, { ...padroes(acao!), ...(valores ?? {}) })) log.push(`${f.prompt} ${f.comando}`, ...f.saida);
      }
      for (const [id, v] of Object.entries(des.respostas ?? {})) t.executar(`responder ${id} ${v}`);
      const falhas = des.objetivo(t.mundo).filter((i) => !i.ok).map((i) => `${i.texto} (${i.detalhe ?? ''})`);
      expect(falhas, log.join('\n')).toEqual([]);
    });
  }
});
