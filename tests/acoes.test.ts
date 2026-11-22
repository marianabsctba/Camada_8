// O robô resolve todos os dias só clicando: escolhe o alvo, a ação e preenche o formulário.
import { describe, expect, it } from 'vitest';
import { DIAS } from '../src/conteudo/dias';
import { acoesDo, executarAcao, padroes, type TipoAlvo } from '../src/motor/acoes';
import { Terminal } from '../src/motor/cli';

type Passo = [TipoAlvo, string, string, Record<string, string>?];

const B = 'branco-laranja laranja branco-verde azul branco-azul verde branco-marrom marrom';
const A = 'branco-verde verde branco-laranja azul branco-azul laranja branco-marrom marrom';

/** Respostas das perguntas vão pelo formulário do painel, que digita "responder". */
const RESPOSTAS: Record<number, Record<string, string>> = {
  3: { '1': '12,5', '2': '11,87', '3': '343,6' },
  4: { '1': '0x0800', '2': '1', '3': '128', '4': '2', '5': 'hub' },
  10: { '1': '8,84' },
  13: { '1': '30,9' },
  14: { '1': '64' },
  15: { '1': '10,2' },
  16: { '1': '1, 6 e 11' },
  18: { '1': '238,7' },
};

const ROTEIROS: Record<number, Passo[]> = {
  1: [
    ['equip', 'roteador', 'religar'],
    ['equip', 'roteador', 'interromper'],
    ['equip', 'roteador', 'inicio', { modo: 'ignorar-config' }],
    ['equip', 'roteador', 'boot'],
    ['equip', 'roteador', 'copiar'],
    ['equip', 'roteador', 'senha'],
    ['equip', 'roteador', 'inicio', { modo: 'normal' }],
    ['equip', 'roteador', 'salvar'],
  ],
  2: [
    ['equip', 'casa1', 'ip', { ip: '192.0.2.10/24' }],
    ['equip', 'casa2', 'ip', { ip: '192.0.2.20/24' }],
    ['equip', 'casa1', 'ping', { destino: '192.0.2.20' }],
    ['equip', 'casa2', 'ping', { destino: '192.0.2.10' }],
  ],
  3: [['equip', 'casa', 'vazao']],
  4: [
    ['equip', 'pc1', 'ping'],
    ['equip', 'pc1', 'capturar'],
  ],
  5: [
    ['cabo', 'c1', 'testar'],
    ['cabo', 'c1', 'crimpar', { ponta: 'a', cores: B }],
  ],
  6: [
    ['cabo', 'c3', 'crimpar', { ponta: 'b', cores: A }],
    ['equip', 'pc-secretaria', 'ping'],
  ],
  7: [
    ['cabo', 'c2', 'desligar'],
    ['almox', 'almox', 'instalar', { nome: 'sw-meio' }],
    ['equip', 'sw-escritorio', 'cabo-novo', { porta: 'p2', destino: 'sw-meio:p1', meio: 'cat6', metros: '65' }],
    ['equip', 'sw-meio', 'cabo-novo', { porta: 'p2', destino: 'pc-galpao:eth0', meio: 'cat6', metros: '65' }],
    ['equip', 'pc-escritorio', 'ping', { n: '100' }],
  ],
  8: [['cabo', 'c1', 'trocar', { meio: 'cat6a' }]],
  9: [
    ['cabo', 'c1', 'afastar'],
    ['equip', 'portaria', 'ping', { n: '1000' }],
  ],
  10: [
    ['cabo', 'c1', 'luz'],
    ['equip', 'sw-centro', 'sfp:sfp1', { modelo: 'ER-40' }],
    ['equip', 'sw-distrito', 'sfp:sfp1', { modelo: 'ER-40' }],
    ['equip', 'sw-centro', 'aten:sfp2', { db: '10' }],
    ['equip', 'sw-escola', 'aten:sfp1', { db: '10' }],
  ],
  11: [
    ['cabo', 'c1', 'otdr'],
    ['cabo', 'c1', 'clivar'],
    ['cabo', 'c1', 'clivar'],
    ['cabo', 'c1', 'fundir', { metros: '1340' }],
  ],
  12: [['cabo', 'c1', 'segmento', { n: '1', fibra: 'om3' }]],
  13: [['equip', 'modem', 'modem', { baud: '4800', mod: 'qam64' }]],
  14: [
    ['equip', 'mux', 'slot', { lista: '1-10', uso: 'voz' }],
    ['equip', 'mux', 'slot', { lista: '16', uso: 'sinalizacao' }],
  ],
  15: [['equip', 'radio-morro', 'antena', { azimute: '47', altura: '25' }]],
  16: [
    ['equip', 'ap', 'espectro'],
    ['equip', 'ap', 'canal', { canal: '6' }],
  ],
  17: [
    ['cabo', 'c1', 'coax-remover', { n: '2' }],
    ['cabo', 'c1', 'coax-trocar', { n: '2', nova: 'conector' }],
  ],
  18: [
    ['cabo', 'c2', 'orbita', { orbita: 'leo' }],
    ['equip', 'casa', 'ping', { n: '10' }],
  ],
};

describe('robô resolve os dias só pelos menus', () => {
  for (const dia of DIAS) {
    it(`dia ${dia.numero}: ${dia.titulo}`, () => {
      const t = new Terminal(dia.montar(), dia);
      const log: string[] = [];
      for (const [tipo, id, acaoId, valores] of ROTEIROS[dia.numero] ?? []) {
        const acoes = acoesDo(t.mundo, tipo, id);
        const acao = acoes.find((a) => a.id === acaoId);
        expect(acao, `dia ${dia.numero}: ação ${acaoId} em ${id}; tem ${acoes.map((a) => a.id).join(', ')}`).toBeDefined();
        for (const f of executarAcao(t, acao!, { ...padroes(acao!), ...(valores ?? {}) })) log.push(`${f.prompt} ${f.comando}`, ...f.saida);
      }
      for (const [id, v] of Object.entries(RESPOSTAS[dia.numero] ?? {})) t.executar(`responder ${id} ${v}`);
      const falhas = dia.objetivo(t.mundo).filter((i) => !i.ok).map((i) => `${i.texto} (${i.detalhe ?? ''})`);
      expect(falhas, log.join('\n')).toEqual([]);
    });
  }

  it('toda ação de todo alvo roda sem quebrar, com os valores padrão', () => {
    for (const dia of DIAS) {
      const m = dia.montar();
      const alvos: [TipoAlvo, string][] = [...[...m.equipamentos.keys()].map((k) => ['equip', k] as [TipoAlvo, string]), ...[...m.cabos.keys()].map((k) => ['cabo', k] as [TipoAlvo, string]), ['almox', 'almox']];
      for (const [tipo, id] of alvos) {
        for (const a of acoesDo(m, tipo, id)) {
          const t = new Terminal(dia.montar(), dia);
          expect(() => executarAcao(t, a, padroes(a)), `dia ${dia.numero} ${id} ${a.id}`).not.toThrow();
          expect(a.ajuda.length, `${a.id} sem ajuda`).toBeGreaterThan(10);
        }
      }
    }
  });
});
