// Algoritmos e protocolos de roteamento do ato 4: Dijkstra, inundação, vetor de distância, estado de enlace,
// hierarquia, difusão, multicast, anycast, MPLS e BGP. Primeiro puros, depois nos roteadores do mundo.
import { describe, expect, it } from 'vitest';
import {
  anycast,
  arvoreDifusao,
  arvoreEscoamento,
  arvoreMulticast,
  caminhoAte,
  caminhoDeDados,
  comutarMpls,
  convergirVD,
  difusaoRpf,
  dijkstra,
  grafo,
  inundar,
  inundarLsps,
  melhorRotaBgp,
  metricasPorRodada,
  montarLsp,
  montarLspMpls,
  propagarBgp,
  rotasEstadoEnlace,
  roteamentoHierarquico,
  semEnlace,
  textoDijkstra,
  type NoBgp,
} from '../src/motor/rotear';
import { lerCidr, lerIp } from '../src/motor/util';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../src/motor/mundo';
import { ping } from '../src/motor/rede';
import { escolherRota, traceroute } from '../src/motor/roteamento';
import { Terminal } from '../src/motor/cli';
import { rodarRip, RIP_ATUALIZACAO_S, RIP_COLETA_S, RIP_EXPIRA_S } from '../src/motor/protocolos';
import type { RotaRip } from '../src/motor/rotear';
import { acoesEquip, executarAcao, padroes } from '../src/motor/acoes';
import type { Dia } from '../src/conteudo/tipos';

const ip = (s: string) => lerIp(s)!;

/** Um grafo de oito nós (A a H) com pesos conhecidos. */
const classico = () =>
  grafo([
    ['A', 'B', 2],
    ['A', 'G', 6],
    ['B', 'E', 2],
    ['B', 'C', 7],
    ['G', 'E', 1],
    ['G', 'H', 4],
    ['E', 'F', 2],
    ['F', 'C', 3],
    ['F', 'H', 2],
    ['C', 'D', 3],
    ['H', 'D', 2],
  ]);

describe('Dijkstra', () => {
  it('acha o caminho mais curto de A a D no grafo conhecido', () => {
    const r = dijkstra(classico(), 'A');
    expect(r.dist).toMatchObject({ A: 0, B: 2, E: 4, G: 5, F: 6, H: 8, C: 9, D: 10 });
    expect(caminhoAte(r, 'D')).toEqual(['A', 'B', 'E', 'F', 'H', 'D']);
    expect(r.ordem).toEqual(['A', 'B', 'E', 'G', 'F', 'H', 'C', 'D']);
    // No primeiro passo, B e G ganham rótulo provisório.
    expect(r.passos[0]!.melhorou.sort()).toEqual(['B', 'G']);
    expect(r.passos[0]!.provisorios.G).toEqual({ distancia: 6, anterior: 'A' });
    // G começa com 6 por A e melhora para 5 por E.
    expect(r.passos[2]!.melhorou).toContain('G');
    expect(textoDijkstra(r)[1]).toMatch(/passo 1: A vira permanente com 0/);
  });

  it('árvore de escoamento: todos os caminhos ótimos até D formam uma árvore', () => {
    const t = arvoreEscoamento(classico(), 'D');
    expect(t.D).toEqual({ proximo: undefined, custo: 0 });
    expect(t.A).toEqual({ proximo: 'B', custo: 10 });
    expect(t.F).toEqual({ proximo: 'H', custo: 4 });
    // Princípio de otimização: o trecho de B a D do caminho de A também é o ótimo de B.
    expect(t.B!.custo).toBe(8);
  });
});

describe('inundação', () => {
  const g = classico();
  it('sem controle, no grafo com laços, as cópias crescem sem parar', () => {
    const r = inundar(g, 'A', { modo: 'sem-controle', limiteRodadas: 8 });
    expect(r.semFim).toBe(true);
    expect(r.porRodada.at(-1)!).toBeGreaterThan(r.porRodada[0]!);
  });
  it('com contador de saltos, para; com número de sequência, gasta bem menos', () => {
    const saltos = inundar(g, 'A', { modo: 'saltos', saltos: 5 });
    const seq = inundar(g, 'A', { modo: 'sequencia' });
    expect(saltos.semFim).toBe(false);
    expect(saltos.alcancados).toHaveLength(8);
    expect(seq.alcancados).toHaveLength(8);
    // Com sequência, cada nó repassa uma vez só: cada enlace leva no máximo uma cópia em cada sentido.
    expect(seq.copias).toBeLessThanOrEqual(g.arestas.length);
    expect(seq.copias).toBeLessThan(saltos.copias);
  });
});

describe('vetor de distância', () => {
  it('converge para os mesmos custos do Dijkstra', () => {
    const g = classico();
    const r = convergirVD(g, { infinito: 100 });
    expect(r.convergiu).toBe(true);
    expect(r.tabelas.A!.D).toMatchObject({ custo: 10, via: 'B' });
    expect(r.tabelas.H!.A!.custo).toBe(8);
  });

  it('linha A-B-C: o enlace A-B cai e a métrica sobe rodada a rodada até 16', () => {
    const g = grafo([
      ['A', 'B', 1],
      ['B', 'C', 1],
    ]);
    const antes = convergirVD(g, { metrica: 'saltos' });
    expect(antes.tabelas.C!.A).toMatchObject({ custo: 2, via: 'B' });
    const depois = convergirVD(semEnlace(g, 'A', 'B'), { metrica: 'saltos' }, antes.tabelas);
    const m = metricasPorRodada(depois.historico, 'A', ['B', 'C']);
    expect(m[1]).toEqual({ B: 3, C: 2 }); // B acredita em C, que acreditava em B
    expect(m[2]).toEqual({ B: 3, C: 4 });
    expect(m[3]).toEqual({ B: 5, C: 4 });
    expect(m.at(-1)).toEqual({ B: 16, C: 16 });
    expect(depois.rodadas).toBeGreaterThan(10);
  });

  it('com horizonte dividido (ou envenenamento reverso), a queda se espalha em poucas rodadas', () => {
    const g = grafo([
      ['A', 'B', 1],
      ['B', 'C', 1],
    ]);
    for (const horizonte of ['dividido', 'envenenado'] as const) {
      const antes = convergirVD(g, { metrica: 'saltos', horizonte });
      const depois = convergirVD(semEnlace(g, 'A', 'B'), { metrica: 'saltos', horizonte }, antes.tabelas);
      expect(depois.convergiu).toBe(true);
      expect(depois.rodadas).toBeLessThanOrEqual(3);
      const m = metricasPorRodada(depois.historico, 'A', ['B', 'C']);
      expect(m.every((x) => (x.B ?? 16) >= 16 || x.B === 1)).toBe(true); // B nunca acredita numa rota falsa
    }
  });
});

describe('estado de enlace', () => {
  it('LSPs inundados com sequência dão o mesmo banco a todos, e cada um roda o Dijkstra', () => {
    const g = classico();
    const lsps = g.nos.map((n) => montarLsp(g, n, 1, [{ prefixo: `rede-${n}`, custo: 0 }]));
    const r = inundarLsps(g, lsps);
    for (const n of g.nos) expect(Object.keys(r.bancos[n]!).sort()).toEqual([...g.nos].sort());
    expect(r.descartadas).toBeGreaterThan(0);
    const rotas = rotasEstadoEnlace(r.bancos.A!, 'A');
    expect(rotas['rede-D']).toEqual({ custo: 10, proximo: 'B', anunciante: 'D' });
    // Um LSP mais velho (sequência menor) não sobrescreve o novo.
    const velho = { ...montarLsp(g, 'D', 0), vizinhos: [] };
    const r2 = inundarLsps(g, [velho], r.bancos);
    expect(r2.bancos.A!.D!.seq).toBe(1);
  });
});

describe('hierarquia, difusão, multicast e anycast', () => {
  it('hierárquico encolhe a tabela e às vezes anda mais', () => {
    const g = grafo([
      ['1A', '1B', 1],
      ['1B', '1C', 1],
      ['1A', '2A', 1],
      ['1C', '2B', 1],
      ['2A', '2B', 5],
      ['2B', '2C', 1],
      ['2A', '3A', 1],
      ['3A', '3B', 1],
    ]);
    const reg = { '1A': '1', '1B': '1', '1C': '1', '2A': '2', '2B': '2', '2C': '2', '3A': '3', '3B': '3' };
    const r = roteamentoHierarquico(g, reg);
    expect(r.tabelas['1A']).toEqual({ plano: 7, hierarquico: 4 });
    // 1A vai para a região 2 pelo 2A (o mais perto), mas 2C fica do outro lado: custo a mais.
    expect(r.pares['1A>2C']!.otimo).toBe(4);
    expect(r.pares['1A>2C']!.hierarquico).toBe(7);
    expect(r.piorExtra!.extra).toBeGreaterThan(0);
  });

  it('RPF descarta as cópias que chegam pelo caminho errado; a árvore usa n - 1', () => {
    const g = classico();
    const rpf = difusaoRpf(g, 'A');
    expect(rpf.alcancados).toHaveLength(8);
    expect(rpf.aceitas).toBe(7);
    expect(rpf.descartadas).toBeGreaterThan(0);
    expect(arvoreDifusao(g, 'A').copias).toBe(7);
  });

  it('multicast poda os galhos sem ninguém ouvindo; anycast escolhe o mais perto', () => {
    const g = classico();
    const mc = arvoreMulticast(g, 'A', ['F']);
    expect(mc.arestas).toEqual(['A>B', 'B>E', 'E>F']);
    expect(mc.podadas.length).toBe(4);
    expect(anycast(g, 'A', ['D', 'G']).escolhido).toBe('G');
    expect(anycast(g, 'C', ['D', 'G']).escolhido).toBe('D');
  });
});

describe('MPLS e BGP puros', () => {
  it('MPLS empilha, troca e desempilha ao longo do caminho', () => {
    const lfib = montarLspMpls({}, ['R1', 'R2', 'R3', 'R4'], '203.0.113.0/24');
    const r = comutarMpls(lfib, 'R1', '203.0.113.0/24');
    expect(r.saida).toBe('R4');
    expect(r.passos.map((p) => p.operacao)).toEqual(['empilhar', 'trocar', 'trocar', 'desempilhar']);
    expect(r.passos[1]!.pilhaAntes[0]).not.toBe(r.passos[1]!.pilhaDepois[0]);
    expect(r.passos[3]!.pilhaDepois).toEqual([]);
  });

  /** 64500 provedor de 64501 e 64502; 64501 e 64502 são pares; 64503 é cliente de 64501 e de 64502. */
  const ases = (): NoBgp[] => [
    { id: 'A', asn: 64500, prefixos: [], sessoes: [{ com: 'B', relacao: 'cliente' }, { com: 'C', relacao: 'cliente' }] },
    { id: 'B', asn: 64501, prefixos: [], sessoes: [{ com: 'A', relacao: 'provedor' }, { com: 'C', relacao: 'par' }, { com: 'D', relacao: 'cliente' }] },
    { id: 'C', asn: 64502, prefixos: ['198.51.100.0/24'], sessoes: [{ com: 'A', relacao: 'provedor' }, { com: 'B', relacao: 'par' }] },
    { id: 'D', asn: 64503, prefixos: ['203.0.113.0/24'], sessoes: [{ com: 'B', relacao: 'provedor' }] },
  ];
  it('BGP prefere rota de cliente e o caminho de AS mais curto, e respeita a exportação', () => {
    const nos = ases();
    const r = propagarBgp(nos);
    expect(r.convergiu).toBe(true);
    // A aprende 203.0.113.0/24 pelo cliente B (caminho 64501 64503).
    expect(r.melhores.A!['203.0.113.0/24']!.caminho).toEqual([64501, 64503]);
    // B chega em 198.51.100.0/24 pelo par C (pref 100) e não pelo provedor A (pref 50).
    expect(r.melhores.B!['198.51.100.0/24']!.de).toBe('C');
    // C não repassa a A o que aprendeu do par B: A chega em 203.0.113.0/24 só por B.
    expect(r.candidatas.A!.filter((x) => x.prefixo === '203.0.113.0/24').map((x) => x.de)).toEqual(['B']);
    // D (cliente de B) recebe tudo.
    expect(r.melhores.D!['198.51.100.0/24']!.caminho).toEqual([64501, 64502]);
  });
  it('sequestro: um anúncio mais específico de outro AS leva o tráfego', () => {
    const nos = ases();
    nos[2]!.prefixos.push('203.0.113.0/25');
    const r = propagarBgp(nos);
    const ler = (p: string) => lerCidr(p);
    expect(caminhoDeDados(r, nos, 'A', ip('203.0.113.10'), ler).chegouEm).toBe('C');
    expect(caminhoDeDados(r, nos, 'A', ip('203.0.113.200'), ler).chegouEm).toBe('D');
  });
});

describe('decisão do BGP na ordem da RFC 4271', () => {
  const base = { prefixo: '203.0.113.0/24', relacao: 'par' as const, prefLocal: 100 };
  it('preferência local, caminho, ORIGIN, MED do mesmo vizinho e identificador BGP, nessa ordem', () => {
    const a = { ...base, caminho: [64501, 64510], de: 'x', idBgp: 9 };
    const b = { ...base, caminho: [64502, 64510], de: 'y', idBgp: 5 };
    expect(melhorRotaBgp(a, b)).toBe(b);
    expect(melhorRotaBgp({ ...a, origem: 0 }, { ...b, origem: 2 }).de).toBe('x');
    // MED só compara rotas do mesmo AS vizinho: de AS diferentes, quem decide é o identificador.
    expect(melhorRotaBgp({ ...a, med: 0 }, { ...b, med: 50 }).de).toBe('y');
    const c = { ...base, caminho: [64501, 64510], de: 'z', idBgp: 1, med: 50 };
    expect(melhorRotaBgp({ ...a, med: 10 }, c).de).toBe('x');
    expect(melhorRotaBgp({ ...a, prefLocal: 200 }, { ...b, caminho: [64502] }).de).toBe('x');
  });
});

/* ---------- No mundo, pelo console ---------- */


/**
 * Triângulo r1, r2, r3 com a (192.0.2.0/24) atrás de r1 e b (203.0.113.0/24) atrás de r3.
 * O enlace direto r1-r3 é ruim (custo 10): o caminho bom é r1, r2, r3.
 */
function triangulo(): Mundo {
  const m = novoMundo(11);
  adicionar(m, pc('a', { ip: lerCidr('192.0.2.10/24')!, gateway: '192.0.2.1' }));
  adicionar(m, pc('b', { ip: lerCidr('203.0.113.10/24')!, gateway: '203.0.113.1' }));
  adicionar(m, roteador('r1', { interfaces: { p1: '192.0.2.1/24', p2: '10.0.12.1/30', p3: '10.0.13.1/30' } }));
  adicionar(m, roteador('r2', { interfaces: { p1: '10.0.12.2/30', p2: '10.0.23.1/30' } }));
  adicionar(m, roteador('r3', { interfaces: { p1: '10.0.23.2/30', p2: '10.0.13.2/30', p3: '203.0.113.1/24' } }));
  ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r2', porta: 'p1' }, 'cat6', 30);
  ligar(m, { equip: 'r2', porta: 'p2' }, { equip: 'r3', porta: 'p1' }, 'cat6', 30);
  ligar(m, { equip: 'r1', porta: 'p3' }, { equip: 'r3', porta: 'p2' }, 'cat6', 30);
  ligar(m, { equip: 'r3', porta: 'p3' }, { equip: 'b', porta: 'eth0' }, 'cat6', 5);
  return m;
}

function rodar(t: Terminal, nome: string, cmds: string[]): string {
  t.executar(`console ${nome}`);
  const s = cmds.map((c) => t.executar(c).join('\n')).join('\n');
  t.executar('sair');
  return s;
}

describe('OSPF nos roteadores do mundo', () => {
  it('instala rotas e o ping atravessa três roteadores sem nenhuma rota estática', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    expect(ping(m, 'a', ip('203.0.113.10'), 1).recebidos).toBe(0);
    rodar(t, 'r1', ['ospf on', 'ospf custo p3 10']);
    rodar(t, 'r2', ['ospf on']);
    const s = rodar(t, 'r3', ['ospf on', 'ospf custo p2 10', 'mostra ospf', 'mostra rotas', 'mostra lsdb']);
    expect(s).toMatch(/r1 +pela p2/);
    expect(s).toMatch(/ospf +192\.0\.2\.0\/24 +via 10\.0\.23\.1/);
    expect(s).toMatch(/seq \d/);
    const r = ping(m, 'a', ip('203.0.113.10'));
    expect(r.recebidos).toBe(4);
    expect(r.roteadores).toEqual(['r1', 'r2', 'r3']);
    expect(escolherRota(m.equipamentos.get('r1')!, ip('203.0.113.10'))!.origem).toBe('ospf');
    expect(m.flags.ospf.rotas.r1).toBeGreaterThan(0);
  });

  it('quando um enlace cai, o OSPF troca a rota pelo caminho que sobrou', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r1', ['ospf on', 'ospf custo p3 10']);
    rodar(t, 'r2', ['ospf on']);
    rodar(t, 'r3', ['ospf on', 'ospf custo p2 10']);
    const s = rodar(t, 'r2', ['derrubar p2']);
    expect(s).toMatch(/derrubada/);
    const tr = traceroute(m, 'a', ip('203.0.113.10'));
    expect(tr.saltos.map((x) => x.nome)).toEqual(['r1', 'r3', 'b']);
    expect(m.flags.derrubadas).toEqual(['r2:p2']);
    rodar(t, 'r2', ['levantar p2']);
    expect(traceroute(m, 'a', ip('203.0.113.10')).saltos.map((x) => x.nome)).toEqual(['r1', 'r2', 'r3', 'b']);
  });

  it('áreas: r3 na área 1, r2 vira roteador de borda e a rota entre áreas chega', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r1', ['ospf on', 'derrubar p3']);
    rodar(t, 'r2', ['ospf on', 'ospf area p2 1']);
    rodar(t, 'r3', ['ospf on', 'ospf area p1 1', 'ospf area p2 1', 'ospf area p3 1']);
    expect(m.flags.ospf.abr).toEqual(['r2']);
    const r1 = rodar(t, 'r1', ['mostra rotas']);
    expect(r1).toMatch(/203\.0\.113\.0\/24 +via 10\.0\.12\.2 .*entre áreas/);
    expect(ping(m, 'a', ip('203.0.113.10'), 1).recebidos).toBe(1);
  });

  it('Dijkstra, árvore, inundação, difusão e hierarquia pelo console', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r1', ['ospf custo p3 10']);
    const s = rodar(t, 'r1', ['dijkstra r3', 'arvore r3', 'inundar sem-controle', 'inundar sequencia', 'difusao', 'regiao norte', 'hierarquia']);
    expect(s).toMatch(/passo 1: r1 vira permanente com 0/);
    expect(s).toMatch(/Até r3: r1 > r2 > r3, custo 2/);
    expect(m.flags.dijkstra.ordem).toEqual(['r1', 'r2', 'r3']);
    expect(m.flags.inundacao['sem-controle']).toBeGreaterThan(m.flags.inundacao.sequencia);
    expect(m.flags.difusao.arvore).toBe(2);
    expect(m.flags.hierarquia.tabelas.r1.plano).toBe(2);
  });
});

describe('RIP nos roteadores do mundo', () => {
  /** Linha r1, r2, r3 e o b atrás de r3. */
  function linha(): Mundo {
    const m = triangulo();
    m.cabos.delete([...m.cabos.values()].find((c) => c.a.equip === 'r1' && c.a.porta === 'p3')!.id);
    return m;
  }
  /** RIP ligado nos três; sem as disparadas, cada notícia só anda na periódica e a contagem aparece. */
  function ligar3(t: Terminal, extra: string[] = [], disparadas = false): void {
    for (const r of ['r1', 'r2', 'r3']) rodar(t, r, ['rip on', ...(disparadas ? [] : ['rip disparadas off']), ...extra]);
  }
  const LAN_B = '203.0.113.0/24';
  it('converge, e depois de uma queda conta até o infinito sem horizonte dividido nem disparadas', () => {
    const m = linha();
    const t = new Terminal(m, {} as Dia);
    ligar3(t);
    const s = rodar(t, 'r1', ['rodar-protocolos']);
    expect(s).toMatch(/convergiu/);
    expect(ping(m, 'a', ip('203.0.113.10'), 1).recebidos).toBe(1);
    expect(rodar(t, 'r1', ['mostra rip'])).toMatch(/203\.0\.113\.0\/24 +2 +r2 +renovada há/);
    // r3 perde a LAN do b: r2 e r1 ficam se enganando até 16.
    rodar(t, 'r3', ['derrubar p3']);
    const q = rodar(t, 'r1', ['rodar-protocolos 3']);
    expect(q).toMatch(/LINHA DO TEMPO/);
    rodar(t, 'r1', ['rodar-protocolos']);
    expect(m.flags.rip.contouAoInfinito).toBe(true);
    expect(m.flags.rip.metricas.r1[LAN_B] ?? 16).toBe(16);
  });
  it('com horizonte dividido a queda se espalha sem contar até o infinito', () => {
    const m = linha();
    const t = new Terminal(m, {} as Dia);
    ligar3(t, ['rip horizonte on']);
    rodar(t, 'r1', ['rodar-protocolos']);
    rodar(t, 'r3', ['derrubar p3']);
    const r = rodar(t, 'r1', ['rodar-protocolos']);
    expect(m.flags.rip.contouAoInfinito).toBe(false);
    expect(m.flags.rip.subidas).toBe(0);
    expect(r).toMatch(/convergiu/);
    expect(r).not.toMatch(/contagem ao infinito/);
  });
  it('o aviso de contagem ao infinito some quando a rede se acerta (enlace de volta, depois horizonte dividido)', () => {
    const m = linha();
    const t = new Terminal(m, {} as Dia);
    ligar3(t);
    rodar(t, 'r1', ['rodar-protocolos']);
    rodar(t, 'r3', ['derrubar p3']);
    const contou = rodar(t, 'r1', ['rodar-protocolos']);
    expect(contou).toMatch(/Repare: a métrica subiu/);
    expect(m.flags.rip.contagens).toBe(1);
    // Rodar de novo sem mudança nenhuma: o aviso não se repete.
    expect(rodar(t, 'r1', ['rodar-protocolos'])).not.toMatch(/contagem ao infinito/);
    // O enlace volta: a boa notícia corre, e o estado deixa de dizer que contou.
    rodar(t, 'r3', ['levantar p3']);
    const volta = rodar(t, 'r1', ['rodar-protocolos']);
    expect(volta).toMatch(/convergiu/);
    expect(volta).not.toMatch(/contagem ao infinito/);
    expect(m.flags.rip.contouAoInfinito).toBe(false);
    expect(m.flags.rip.contando).toBe(false);
    expect(m.flags.rip.metricas.r1[LAN_B]).toBe(2);
    // Com horizonte dividido, a próxima queda se espalha sem aviso; o histórico guarda só a primeira contagem.
    for (const r of ['r1', 'r2', 'r3']) rodar(t, r, ['rip horizonte on']);
    rodar(t, 'r3', ['derrubar p3']);
    const queda = rodar(t, 'r1', ['rodar-protocolos']);
    expect(queda).not.toMatch(/contagem ao infinito/);
    expect(m.flags.rip.contouAoInfinito).toBe(false);
    expect(m.flags.rip.subidas).toBe(0);
    expect(m.flags.rip.contagens).toBe(1);
  });
  it('contagem interrompida no meio: avisa que está contando e para de avisar depois do horizonte dividido', () => {
    const m = linha();
    const t = new Terminal(m, {} as Dia);
    ligar3(t);
    rodar(t, 'r1', ['rodar-protocolos']);
    rodar(t, 'r3', ['derrubar p3']);
    expect(rodar(t, 'r1', ['rodar-protocolos 4'])).toMatch(/contagem ao infinito em andamento/);
    expect(m.flags.rip.contando).toBe(true);
    for (const r of ['r1', 'r2']) rodar(t, r, ['rip horizonte on']);
    const fim = rodar(t, 'r1', ['rodar-protocolos']);
    expect(fim).toMatch(/convergiu/);
    expect(fim).not.toMatch(/contagem ao infinito/);
    expect(m.flags.rip.contando).toBe(false);
    expect(m.flags.rip.contouAoInfinito).toBe(false);
    expect(m.flags.rip.metricas.r1[LAN_B] ?? 16).toBe(16);
  });
  it('temporizadores da RFC 2453: a rota aprendida fica 180 s, vai a 16 e a coleta de lixo a apaga 120 s depois', () => {
    const m = linha();
    const t = new Terminal(m, {} as Dia);
    ligar3(t, ['rip horizonte on']);
    rodar(t, 'r1', ['rodar-protocolos']);
    // Corta o cabo entre r2 e r3: ninguém avisa o r2 de que a rota para a LAN do b morreu.
    rodar(t, 'r2', ['derrubar p2']);
    const r2 = m.equipamentos.get('r2')!;
    const renovada = (r2.s.rip.tabela[LAN_B] as RotaRip).renovada!;
    const um = rodarRip(m, 1);
    expect(m.flags.rip.metricas.r2[LAN_B]).toBe(1);
    // A rede da própria porta caída, essa sim, vai a 16 na hora.
    expect(um.eventos.some((x) => x.roteador === 'r2' && x.tipo === 'perdeu-rede' && x.destino === '10.0.23.0/30' && x.t === um.inicio)).toBe(true);
    const r = rodarRip(m);
    const expirou = r.eventos.find((x) => x.roteador === 'r2' && x.destino === LAN_B && x.tipo === 'expirou')!;
    expect(expirou.t).toBeCloseTo(renovada + RIP_EXPIRA_S, 6);
    const apagou = r.eventos.find((x) => x.roteador === 'r2' && x.destino === LAN_B && x.tipo === 'apagou')!;
    expect(apagou.t).toBeCloseTo(expirou.t + RIP_COLETA_S, 6);
    // O r1 soube pela periódica do r2, que anunciou 16 durante a coleta de lixo.
    const r1 = r.eventos.find((x) => x.roteador === 'r1' && x.destino === LAN_B && x.tipo === 'infinito')!;
    expect(r1.t).toBeGreaterThanOrEqual(expirou.t);
    expect(r1.t - expirou.t).toBeLessThanOrEqual(RIP_ATUALIZACAO_S + 5);
    expect(r.convergiu).toBe(true);
    expect(m.flags.rip.metricas.r2[LAN_B]).toBeUndefined();
  });
  it('periódica sorteada entre 25 e 35 s, e o mesmo mundo dá a mesma linha do tempo', () => {
    const linhaDoTempo = () => {
      const m = linha();
      const t = new Terminal(m, {} as Dia);
      ligar3(t);
      rodar(t, 'r1', ['rodar-protocolos']);
      rodar(t, 'r3', ['derrubar p3']);
      const r = rodarRip(m);
      for (const n of ['r1', 'r2', 'r3']) {
        const falta = (m.equipamentos.get(n)!.s.rip.proxPeriodica as number) - m.flags.rip.relogio;
        expect(falta).toBeGreaterThan(0);
        expect(falta).toBeLessThanOrEqual(35);
      }
      // Cada passo da contagem é uma periódica do vizinho: nunca dois passos do mesmo roteador a menos de 25 s.
      const passos = r.eventos.filter((x) => x.roteador === 'r1' && x.destino === LAN_B && x.tipo === 'subiu');
      for (let i = 1; i < passos.length; i++) expect(passos[i]!.t - passos[i - 1]!.t).toBeGreaterThanOrEqual(25 - 1e-9);
      return r.linhas.join('\n');
    };
    expect(linhaDoTempo()).toBe(linhaDoTempo());
  });
  it('com as atualizações disparadas, a queda chega a todos em segundos e ninguém conta', () => {
    const m = linha();
    const t = new Terminal(m, {} as Dia);
    ligar3(t, [], true);
    rodar(t, 'r1', ['rodar-protocolos']);
    rodar(t, 'r3', ['derrubar p3']);
    const r = rodarRip(m);
    const r1 = r.eventos.find((x) => x.roteador === 'r1' && x.destino === LAN_B && x.tipo === 'infinito')!;
    expect(r1.por).toBe('disparada');
    expect(r1.t - r.inicio).toBeLessThanOrEqual(5);
    expect(r.disparadas).toBeGreaterThan(0);
    expect(m.flags.rip.contouAoInfinito).toBe(false);
  });
});

describe('BGP e MPLS no mundo', () => {
  /** Dois AS: r1 no 64500 (rede de a) e r3 no 64501 (rede de b), ligados direto pelo 10.0.13.0/30. */
  function doisAs(): { m: Mundo; t: Terminal } {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r1', ['bgp as 64500', 'bgp vizinho 10.0.13.2 64501 par', 'bgp anunciar 192.0.2.0/24']);
    rodar(t, 'r3', ['bgp as 64501', 'bgp vizinho 10.0.13.1 64500 par', 'bgp anunciar 203.0.113.0/24']);
    return { m, t };
  }
  it('sessão sobe, as rotas viram "bgp" e o ping atravessa os dois AS', () => {
    const { m, t } = doisAs();
    const s = rodar(t, 'r1', ['mostra bgp', 'mostra rotas']);
    expect(s).toMatch(/sessão estabelecida/);
    expect(s).toMatch(/bgp +203\.0\.113\.0\/24 +via 10\.0\.13\.2/);
    expect(ping(m, 'a', ip('203.0.113.10'), 1).recebidos).toBe(1);
    expect(m.flags.bgp.melhores.r1['203.0.113.0/24'].caminho).toEqual([64501]);
  });
  it('sequestro: r2 entra como AS 64502 e anuncia um /25 mais específico', () => {
    const { m, t } = doisAs();
    rodar(t, 'r1', ['bgp vizinho 10.0.12.2 64502 cliente']);
    const s = rodar(t, 'r2', ['bgp as 64502', 'bgp vizinho 10.0.12.1 64500 provedor', 'bgp anunciar 203.0.113.0/25']);
    expect(s).toMatch(/sequestro de prefixo/);
    expect(escolherRota(m.equipamentos.get('r1')!, ip('203.0.113.10'))!.via).toBe(ip('10.0.12.2'));
    expect(escolherRota(m.equipamentos.get('r1')!, ip('203.0.113.200'))!.via).toBe(ip('10.0.13.2'));
    expect(m.flags.bgp.sequestros.some((x: { roteador: string; origem: number }) => x.roteador === 'r1' && x.origem === 64502)).toBe(true);
    expect(rodar(t, 'r1', ['mostra bgp'])).toMatch(/ALERTA/);
    expect(ping(m, 'a', ip('203.0.113.10'), 1).recebidos).toBe(0);
  });
  it('MPLS: caminho de rótulos r1, r2, r3 com troca no meio', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'r1', ['mpls lsp 203.0.113.0/24 r2 r3', 'mpls enviar 203.0.113.10', 'mostra mpls']);
    expect(m.flags.mpls.operacoes).toEqual(['empilhar', 'trocar', 'desempilhar']);
    expect(m.flags.mpls.saida).toBe('r3');
    expect(s).toMatch(/rótulo 116 vira 216/);
    expect(rodar(t, 'r1', ['mpls lsp 203.0.113.0/24 b'])).toMatch(/não é um roteador/);
  });
  it('multicast e anycast no mundo', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'b', ['grupo entrar 239.1.1.1']);
    const s = rodar(t, 'r1', ['mostra igmp', 'multicast 239.1.1.1', 'anycast 203.0.113.10']);
    expect(m.flags.multicast['239.1.1.1'].membros).toEqual(['r3']);
    expect(rodar(t, 'r3', ['mostra igmp'])).toMatch(/239\.1\.1\.1 +membros: b/);
    expect(s).toMatch(/Vence o mais perto: r3/);
  });
  it('as ações do menu existem e rodam com os valores padrão', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    const ids = acoesEquip(m, m.equipamentos.get('r1')!).map((a) => a.id);
    for (const id of ['rot-ospf', 'rot-ospf-custo', 'rot-ospf-area', 'rot-ospf-ver', 'rot-rip', 'rot-rip-horizonte', 'rot-rip-ver', 'rot-rodar', 'rot-dijkstra', 'rot-arvore', 'rot-inundar', 'rot-difusao', 'rot-multicast', 'rot-anycast', 'rot-regiao', 'rot-hierarquia', 'rot-derrubar', 'rot-levantar', 'rot-mpls-lsp', 'rot-mpls-enviar', 'rot-mpls-ver', 'rot-bgp-as', 'rot-bgp-vizinho', 'rot-bgp-anunciar', 'rot-bgp-retirar', 'rot-bgp-ver']) expect(ids).toContain(id);
    for (const a of acoesEquip(m, m.equipamentos.get('r1')!)) expect(() => executarAcao(t, a, padroes(a))).not.toThrow();
    expect(acoesEquip(m, m.equipamentos.get('a')!).some((a) => a.id === 'grupo')).toBe(true);
  });
});
