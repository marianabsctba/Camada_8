import { describe, expect, it } from 'vitest';
import { DIAS } from '../src/conteudo/dias';
import { Terminal } from '../src/motor/cli';
import { SOLUCOES } from './solucoes';

const TRAVESSAO = /[—–]/;

describe('robô joga os dias pelo terminal', () => {
  it('tem solução para todo dia, em sequência', () => {
    // os dias escritos depois do modo guiado são conferidos pelos testes de guia e de desafio
    for (const d of DIAS.filter((x) => x.ref! <= 30)) expect(SOLUCOES[d.ref!], `dia ${d.numero}`).toBeDefined();
  });

  for (const dia of DIAS.filter((d) => SOLUCOES[d.ref!])) {
    it(`dia ${dia.numero}: ${dia.titulo}`, () => {
      const t = new Terminal(dia.montar(), dia);
      expect(dia.objetivo(t.mundo).every((i) => i.ok), 'já começa resolvido').toBe(false);
      const saidas: string[] = [];
      for (const linha of SOLUCOES[dia.ref!]!) saidas.push(`> ${linha}`, ...t.executar(linha));
      const itens = dia.objetivo(t.mundo);
      const falhas = itens.filter((i) => !i.ok).map((i) => `${i.texto} (${i.detalhe ?? ''})`);
      expect(falhas, saidas.join('\n')).toEqual([]);
      expect(t.executar('objetivo').join('\n')).toContain('CHAMADO FECHADO');
      expect(t.executar('posmorte')[0]).toBe('== Pós-morte ==');
    });
  }

  it('nenhum texto do jogo tem travessão', () => {
    for (const d of DIAS) {
      const textos = [d.titulo, ...d.chamado, d.manual.titulo, ...d.manual.texto, ...d.dicas, ...d.posMorte, ...(d.perguntas ?? []).map((p) => p.texto)];
      for (const x of textos) expect(TRAVESSAO.test(x), `dia ${d.numero}: ${x}`).toBe(false);
    }
  });

  it('todo comando de ajuda roda sem quebrar em todo dia', () => {
    for (const d of DIAS) {
      const t = new Terminal(d.montar(), d);
      for (const cmd of ['ajuda', 'mapa', 'manual', 'chamado', 'dica', 'perguntas', 'instalar', 'sfp', 'espectro', 'clivar', 'objetivo']) {
        expect(() => t.executar(cmd), `${cmd} no dia ${d.numero}`).not.toThrow();
      }
      for (const e of t.mundo.equipamentos.keys()) {
        t.executar(`console ${e}`);
        expect(() => t.executar('?')).not.toThrow();
        expect(() => t.executar('mostra')).not.toThrow();
        t.executar('sair');
      }
    }
  });
});
