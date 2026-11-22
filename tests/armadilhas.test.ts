// As armadilhas didáticas precisam falhar do jeito que o manual promete.
import { describe, expect, it } from 'vitest';
import { DIAS } from '../src/conteudo/dias';
import { Terminal } from '../src/motor/cli';
import { avaliar } from '../src/motor/fisico';

function jogar(n: number, linhas: string[]) {
  const dia = DIAS[n - 1]!;
  const t = new Terminal(dia.montar(), dia);
  const saida = linhas.flatMap((l) => t.executar(l));
  return { t, dia, saida, ok: dia.objetivo(t.mundo).every((i) => i.ok) };
}
const cabo = (t: Terminal, id: string) => avaliar(t.mundo, t.mundo.cabos.get(id)!);

describe('armadilhas', () => {
  it('dia 1: salvar antes de copiar grava roteador vazio', () => {
    const r = jogar(1, ['religar roteador', 'console roteador', 'interromper', 'inicio ignorar-config', 'boot', 'senha Fim!Linha2026', 'inicio normal', 'salvar']);
    expect(r.ok).toBe(false);
  });
  it('dia 1: esquecer o registro de inicialização reprova', () => {
    const r = jogar(1, ['religar roteador', 'console roteador', 'interromper', 'inicio ignorar-config', 'boot', 'copiar startup running', 'senha Fim!Linha2026', 'salvar']);
    expect(r.ok).toBe(false);
  });
  it('dia 1: perder a janela de boot não abre o resgate', () => {
    const r = jogar(1, ['religar roteador', 'console roteador', 'mostra', 'interromper']);
    expect(r.t.prompt()).toBe('roteador >');
  });
  it('dia 5: mesma ordem errada nas duas pontas vira par dividido a 100 Mb/s', () => {
    const r = jogar(5, ['crimpar c1 b bl l bv v baz az bm m']);
    const e = cabo(r.t, 'c1');
    expect(e.up).toBe(true);
    expect(e.velocidade).toBe(100);
    expect(r.t.executar('testar c1').join('\n')).toContain('cabo direto');
    expect(r.t.executar('certificar c1').join('\n')).toContain('REPROVADO');
  });
  it('dia 6: porta uplink também resolve', () => {
    const r = jogar(6, ['mover c3 a velho-secretaria:uplink', 'console pc-secretaria', 'ping 192.0.2.20']);
    expect(r.ok).toBe(true);
  });
  it('dia 8: Cat6 a 80 m fica em 1 Gb/s', () => {
    const r = jogar(8, ['trocar c1 cat6']);
    expect(cabo(r.t, 'c1').velocidade).toBe(1000);
  });
  it('dia 9: blindagem sem aterramento piora', () => {
    const r = jogar(9, ['trocar c1 cat6 blindado']);
    expect(cabo(r.t, 'c1').up).toBe(false);
    r.t.executar('aterrar c1');
    expect(cabo(r.t, 'c1').margemDb).toBeGreaterThanOrEqual(6);
  });
  it('dia 9: antes da correção o ping perde pacotes', () => {
    const r = jogar(9, ['console portaria', 'ping 192.0.2.2 200']);
    expect(r.saida.join('\n')).toMatch(/erro de CRC/);
  });
  it('dia 10: LX-10 no distrito sobe com margem curta, ZX-80 na escola satura', () => {
    const r = jogar(10, []);
    const c1 = cabo(r.t, 'c1');
    expect(c1.up).toBe(true);
    expect(c1.margemDb).toBeLessThan(3);
    expect(cabo(r.t, 'c2').motivos[0]).toContain('saturado');
  });
  it('dia 11: fundir com clivagem torta passa de 0,1 dB', () => {
    const r = jogar(11, ['clivar', 'fundir c1 1340']);
    expect(cabo(r.t, 'c1').up).toBe(true);
    expect(r.ok).toBe(false);
    const r2 = jogar(11, ['clivar', 'fundir c1 1340', 'cortar c1 1340', 'clivar', 'fundir c1 1340']);
    expect(r2.ok).toBe(true);
  });
  it('dia 12: cordão OM1 esbarra na dispersão modal', () => {
    const r = jogar(12, ['segmento c1 1 om1']);
    expect(cabo(r.t, 'c1').motivos[0]).toContain('dispersão modal');
  });
  it('dia 13: 6000 Bd em 64-QAM passa Nyquist e SNR, mas não Shannon', () => {
    const r = jogar(13, ['console modem', 'taxa-simbolos 6000', 'modulacao qam64', 'mostra']);
    const txt = r.saida.join('\n');
    expect(txt).toContain('Shannon não negocia');
    expect(txt).not.toContain('Nyquist (');
  });
  it('dia 14: mexer no intervalo 0 dá LOF', () => {
    const r = jogar(14, ['console mux', 'slot 0-9 voz', 'mostra']);
    expect(r.saida.join('\n')).toContain('LOF');
  });
  it('dia 16: só o canal 6 resolve', () => {
    for (let c = 1; c <= 13; c++) {
      const r = jogar(16, ['console ap', `canal ${c}`, 'sair', 'responder 1 1 6 11']);
      expect(r.ok, `canal ${c}`).toBe(c === 6);
    }
  });
  it('dia 17: só trocar o conector deixa o nível fora da janela ideal', () => {
    const r = jogar(17, ['coax c1 trocar 3 conector']);
    expect(cabo(r.t, 'c1').up).toBe(true);
    expect(r.ok).toBe(false);
  });
  it('dia 18: em órbita geoestacionária o ping passa de 480 ms', () => {
    const r = jogar(18, ['console casa', 'ping 192.0.2.60 4']);
    const media = Number(r.saida.join('\n').match(/média ([\d.]+) ms/)![1]);
    expect(media).toBeGreaterThan(480);
  });
});
