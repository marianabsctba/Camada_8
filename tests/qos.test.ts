// Congestionamento, qualidade de serviço e SDN do ato 4: fila de saída, RED, ECN, admissão, choke, descarte de
// carga, baldes, escalonamento, DSCP na captura, regras de fluxo e telemetria. Primeiro puros, depois no mundo.
import { describe, expect, it } from 'vitest';
import { admitir, atrasoMD1, curvaCarga, fonteDeCarga, janelaInicial, RTO_MIN_S, simularFila } from '../src/motor/fila';
import { byteServico, escalonar, lerDscp, nomeDscp, simularBalde, tempoRajada } from '../src/motor/qos';
import { buscar, decidir, instalarRegra, lerAcoes, lerCasamento } from '../src/motor/sdn';
import { filaConfere, temQos } from '../src/motor/cliQos';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../src/motor/mundo';
import { ping } from '../src/motor/rede';
import { traceroute } from '../src/motor/roteamento';
import { Terminal } from '../src/motor/cli';
import { acoesEquip, executarAcao, padroes } from '../src/motor/acoes';
import { lerCidr, lerIp } from '../src/motor/util';
import type { Dia } from '../src/conteudo/tipos';

const ip = (s: string) => lerIp(s)!;
const TRAVESSAO = /[—–]/;

describe('fila de saída e congestionamento', () => {
  const cap = 100;
  it('o atraso cresce com a carga e explode perto de 100 %', () => {
    const cfg = { buffer: 1000 };
    const a = [0.3, 0.7, 0.95].map((c) => simularFila(cfg, [fonteDeCarga(c, cap)], { capacidadeMbps: cap, pacotes: 6000 }).atrasoMedio);
    expect(a[1]).toBeGreaterThan(a[0]!);
    expect(a[2]).toBeGreaterThan(3 * a[1]!);
    // Com 50 % a simulação fica perto da conta M/D/1 (pacote de 1000 bytes a 100 Mb/s: 80 µs).
    const meio = simularFila(cfg, [fonteDeCarga(0.5, cap)], { capacidadeMbps: cap, pacotes: 8000 });
    expect(meio.atrasoMedio).toBeCloseTo(atrasoMD1(0.5, 80e-6), 4);
    expect(meio.perdas).toBe(0);
    expect(atrasoMD1(1, 80e-6)).toBe(Infinity);
    const curva = curvaCarga(cfg, cap, [0.2, 0.6, 0.9, 0.99]);
    for (let i = 1; i < curva.length; i++) expect(curva[i]!.atrasoMedio).toBeGreaterThan(curva[i - 1]!.atrasoMedio);
  });

  it('com mais carga do que cabe, o buffer enche e o resto se perde', () => {
    const r = simularFila({ buffer: 10 }, [fonteDeCarga(1.3, cap)], { capacidadeMbps: cap });
    expect(r.perdasBuffer).toBeGreaterThan(0);
    expect(r.ocupacaoMax).toBe(10);
    expect(r.taxaPerda).toBeGreaterThan(0.15);
    expect(r.utilizacao).toBeGreaterThan(0.95);
  });

  it('buffer grande demais: perde quase o mesmo e espera muito mais', () => {
    const pequeno = simularFila({ buffer: 8 }, [fonteDeCarga(1.2, cap)], { capacidadeMbps: cap, pacotes: 6000 });
    const grande = simularFila({ buffer: 4096 }, [fonteDeCarga(1.2, cap)], { capacidadeMbps: cap, pacotes: 6000 });
    expect(grande.atrasoMedio).toBeGreaterThan(20 * pequeno.atrasoMedio);
    expect(grande.atrasoBufferCheio).toBeCloseTo(4096 * 80e-6, 6);
  });

  it('RED descarta antes de o buffer encher', () => {
    const tail = simularFila({ buffer: 50 }, [fonteDeCarga(1.1, cap)], { capacidadeMbps: cap });
    const red = simularFila({ buffer: 50, red: { min: 5, max: 15, pmax: 0.1 } }, [fonteDeCarga(1.1, cap)], { capacidadeMbps: cap });
    expect(tail.perdasBuffer).toBeGreaterThan(0);
    expect(tail.perdasRed).toBe(0);
    expect(red.perdasRed).toBeGreaterThan(0);
    // Com a média lenta (peso 0,002), só a subida do começo ainda pega o buffer cheio.
    expect(red.perdasBuffer).toBeLessThan(red.perdasRed / 100);
    expect(red.ocupacaoMedia).toBeLessThan(tail.ocupacaoMedia / 2);
    expect(red.atrasoMedio).toBeLessThan(tail.atrasoMedio);
  });

  it('TCP em laço fechado: a perda no fim da fila faz a origem cortar a janela, e a perda fica pequena', () => {
    // A mesma porta, a mesma taxa pedida: sem controle, o excesso vira perda; com TCP, a origem recua.
    // Buffer de 20: a janela máxima do receptor (65 pacotes) passa do caminho (40) mais o buffer, e algo cai.
    const udp = simularFila({ buffer: 20 }, [{ nome: 'x', mbps: 130, responde: false }], { capacidadeMbps: cap });
    const tcp = simularFila({ buffer: 20 }, [{ nome: 'x', mbps: 130 }], { capacidadeMbps: cap });
    const f = tcp.porFonte[0]!;
    expect(f.tcp).toBe(true);
    expect(udp.taxaPerda).toBeGreaterThan(0.2);
    expect(tcp.perdasBuffer).toBeGreaterThan(0);
    expect(tcp.taxaPerda).toBeLessThan(0.02);
    expect(f.recuos).toBeGreaterThan(0);
    expect(f.retransmitidos).toBeGreaterThanOrEqual(f.perdidos);
    // Mesmo cortada pela metade, a janela ainda enche quase todo o caminho: o enlace segue ocupado.
    expect(tcp.utilizacao).toBeGreaterThan(0.8);
    expect(f.vazaoMbps).toBeLessThanOrEqual(cap);
  });

  it('janela inicial da RFC 3390 e piso do temporizador', () => {
    expect(janelaInicial(1000)).toBe(4);
    expect(janelaInicial(1460)).toBe(3);
    expect(janelaInicial(1500)).toBe(2);
    expect(RTO_MIN_S).toBe(0.2);
  });

  it('RED dessincroniza: com descarte no fim da fila as origens recuam juntas; com RED, cada uma na sua hora', () => {
    const quatro = Array.from({ length: 4 }, (_, i) => ({ nome: `f${i}`, mbps: 40 }));
    const tail = simularFila({ buffer: 64 }, quatro, { capacidadeMbps: cap });
    const red = simularFila({ buffer: 64, red: { min: 5, max: 30 } }, quatro, { capacidadeMbps: cap });
    expect(tail.sincronia).not.toBeNull();
    expect(red.sincronia).not.toBeNull();
    expect(red.sincronia!).toBeLessThan(tail.sincronia! - 0.1);
    expect(red.perdasRed).toBeGreaterThan(red.perdasBuffer);
    expect(red.ocupacaoMedia).toBeLessThan(tail.ocupacaoMedia / 4);
    for (const f of red.porFonte) expect(f.recuos + f.expiracoes).toBeGreaterThan(0);
  });

  it('ECN marca em vez de descartar, e a origem obedece e diminui a taxa, no máximo uma vez por ida e volta', () => {
    const r = simularFila({ buffer: 50, red: { min: 5, max: 30, pmax: 0.2 }, ecn: true }, [{ nome: 'tcp', mbps: 110 }], { capacidadeMbps: cap });
    expect(r.marcadosEcn).toBeGreaterThan(0);
    expect(r.porFonte[0]!.sinais).toBeGreaterThan(0);
    expect(r.porFonte[0]!.sinais).toBeLessThan(r.marcadosEcn);
    // Uma redução por janela de dados: nunca mais reduções do que idas e voltas na simulação.
    expect(r.porFonte[0]!.sinais).toBeLessThanOrEqual(r.duracao / r.rtt);
    expect(r.porFonte[0]!.fatorFinal).toBeLessThan(1);
    // Fonte que não entende ECN: o RED volta a descartar.
    const surda = simularFila({ buffer: 50, red: { min: 5, max: 30, pmax: 0.2 }, ecn: true }, [{ nome: 'velha', mbps: 110, ecn: false }], { capacidadeMbps: cap });
    expect(surda.marcadosEcn).toBe(0);
    expect(surda.perdasRed).toBeGreaterThan(r.perdasRed);
  });

  it('choke packet: o roteador avisa a origem, que reduz a taxa e perde menos', () => {
    const sem = simularFila({ buffer: 20 }, [{ nome: 'a', mbps: 150 }], { capacidadeMbps: cap });
    const com = simularFila({ buffer: 20, choke: true }, [{ nome: 'a', mbps: 150 }], { capacidadeMbps: cap });
    expect(com.sinais).toBeGreaterThan(0);
    expect(com.porFonte[0]!.fatorFinal).toBeLessThan(1);
    expect(com.perdas).toBeLessThan(sem.perdas);
  });

  it('controle de admissão recusa o fluxo que não cabe', () => {
    const f = [40, 30, 20].map((x, i) => ({ nome: `f${i + 1}`, mbps: x }));
    expect(admitir(f, 100, 0.8).recusadas.map((x) => x.nome)).toEqual(['f3']);
    const r = simularFila({ buffer: 64, admissao: 0.8 }, f, { capacidadeMbps: cap });
    expect(r.recusadas).toEqual(['f3']);
    expect(r.porFonte.find((x) => x.nome === 'f3')!.admitida).toBe(false);
    expect(r.carga).toBeCloseTo(0.7, 5);
  });

  it('descarte de carga joga fora o menos importante', () => {
    const fontes = [
      { nome: 'filme', mbps: 70, importancia: 1 },
      { nome: 'cirurgia', mbps: 70, importancia: 5 },
    ];
    const sem = simularFila({ buffer: 16 }, fontes, { capacidadeMbps: cap });
    const com = simularFila({ buffer: 16, descarte: true }, fontes, { capacidadeMbps: cap });
    const perdeu = (r: typeof com, n: string) => r.porFonte.find((x) => x.nome === n)!.perdidos;
    expect(com.perdasDescarte).toBeGreaterThan(0);
    expect(perdeu(com, 'cirurgia')).toBeLessThan(perdeu(sem, 'cirurgia') / 3);
    expect(perdeu(com, 'filme')).toBeGreaterThan(perdeu(com, 'cirurgia'));
  });
});

describe('modelagem de tráfego: baldes', () => {
  // R = 25 MB/s, B = 9,6 MB, M = 125 MB/s: S = 9,6 / (125 - 25) = 96 ms.
  const base = { taxa: 25e6, profundidade: 9.6e6, pico: 125e6, rajada: 30e6 };
  it('balde de fichas: a rajada passa no pico até a profundidade e depois cai para a taxa, com S = B / (M - R)', () => {
    const S = tempoRajada(base.profundidade, base.pico, base.taxa);
    expect(S).toBeCloseTo(0.096, 6);
    const r = simularBalde({ tipo: 'fichas', ...base });
    expect(r.sTeorico).toBeCloseTo(S, 6);
    expect(r.tempoNoPico).toBeGreaterThan(S * 0.98);
    expect(r.tempoNoPico).toBeLessThan(S * 1.02);
    // No pico sai B + R·S = M·S.
    expect(r.bytesNoPico).toBeGreaterThan(0.98 * (base.profundidade + base.taxa * S));
    expect(r.bytesNoPico).toBeLessThan(1.02 * base.pico * S);
    expect(r.descartado).toBe(0);
    expect(r.esperou).toBeGreaterThan(0);
    // Depois das fichas, a saída fica em R: o resto (30 - 12 MB) leva uns 18 / 25 s.
    expect(r.fim).toBeGreaterThan(0.096 + 0.7);
    const fimSerie = r.serie.filter((x) => x.t > 0.2 && x.saida > 0);
    for (const x of fimSerie) expect(x.saida).toBeLessThan(base.taxa * 1.05);
  });

  it('balde de fichas policiando (sem fila): o que não tem ficha é descartado', () => {
    const r = simularBalde({ tipo: 'fichas', ...base, espera: 0 });
    expect(r.descartado).toBeGreaterThan(0);
    expect(r.esperou).toBeLessThan(1);
    expect(r.passouDireto + r.descartado).toBeCloseTo(base.rajada, -3);
  });

  it('balde furado: nunca sai acima de R, e o que transborda se perde', () => {
    const r = simularBalde({ tipo: 'furado', ...base });
    expect(r.tempoNoPico).toBe(0);
    for (const x of r.serie) expect(x.saida).toBeLessThanOrEqual(base.taxa * 1.001);
    // Chega em 0,24 s; nesse tempo saem R·0,24 = 6 MB e cabem 9,6 MB no balde: sobram uns 14,4 MB para perder.
    expect(r.descartado / 1e6).toBeCloseTo(14.4, 0);
  });
});

describe('escalonamento de pacotes', () => {
  it('WFQ divide a banda pela proporção dos pesos', () => {
    const r = escalonar('wfq', [
      { nome: 'a', mbps: 100, peso: 3 },
      { nome: 'b', mbps: 100, peso: 1 },
    ], { capacidadeMbps: 100 });
    expect(r.fluxos[0]!.fracao).toBeGreaterThan(0.71);
    expect(r.fluxos[0]!.fracao).toBeLessThan(0.79);
    expect(r.fluxos[1]!.fracao).toBeGreaterThan(0.21);
    expect(r.fluxos[1]!.fracao).toBeLessThan(0.29);
    // FIFO não olha peso: os dois iguais.
    const f = escalonar('fifo', [
      { nome: 'a', mbps: 100, peso: 3 },
      { nome: 'b', mbps: 100, peso: 1 },
    ], { capacidadeMbps: 100 });
    expect(Math.abs(f.fluxos[0]!.fracao - f.fluxos[1]!.fracao)).toBeLessThan(0.06);
  });

  it('WFQ: quem pede menos que a fatia leva tudo que pediu', () => {
    const r = escalonar('wfq', [
      { nome: 'voz', mbps: 10, tamanho: 200 },
      { nome: 'dados', mbps: 150 },
    ], { capacidadeMbps: 100 });
    expect(r.fluxos[0]!.vazaoMbps).toBeGreaterThan(9);
    expect(r.fluxos[1]!.vazaoMbps).toBeGreaterThan(85);
  });

  it('prioridade estrita favorece a classe alta', () => {
    const fl = [
      { nome: 'voz', mbps: 30, tamanho: 200, prioridade: 6 },
      { nome: 'dados', mbps: 100, prioridade: 0 },
    ];
    const pr = escalonar('prioridade', fl, { capacidadeMbps: 100 });
    const fifo = escalonar('fifo', fl, { capacidadeMbps: 100 });
    expect(pr.fluxos[0]!.vazaoMbps).toBeGreaterThan(28);
    expect(pr.fluxos[0]!.perdidos).toBe(0);
    expect(pr.fluxos[0]!.atrasoMedio).toBeLessThan(pr.fluxos[1]!.atrasoMedio / 10);
    expect(pr.fluxos[0]!.atrasoMedio).toBeLessThan(fifo.fluxos[0]!.atrasoMedio / 5);
    expect(fifo.fluxos[0]!.perdidos).toBeGreaterThan(0);
  });
});

describe('DSCP e tabela de fluxo, partes puras', () => {
  it('classes e byte de serviço', () => {
    expect(lerDscp('EF')).toBe(46);
    expect(lerDscp('af41')).toBe(34);
    expect(lerDscp('63')).toBe(63);
    expect(lerDscp('AF99')).toBeNull();
    expect(byteServico(46)).toBe(0xb8);
    expect(nomeDscp(10)).toBe('AF11');
  });
  it('vence a regra de maior prioridade que casa e o contador sobe', () => {
    const e = { s: {} as Record<string, any> };
    const c1 = lerCasamento('destino=203.0.113.0/24');
    const c2 = lerCasamento('destino=203.0.113.0/24,dscp=EF');
    expect(typeof c1).toBe('object');
    instalarRegra(e, 10, c1 as object, lerAcoes('porta:p2') as never);
    const alta = instalarRegra(e, 50, c2 as object, lerAcoes('dscp=AF41+porta:p3') as never);
    const p = { origem: ip('192.0.2.10'), destino: ip('203.0.113.10'), protocolo: 1, tos: byteServico(46), tamanho: 84 };
    expect(buscar(e.s.fluxos, p)!.id).toBe(alta.id);
    const d = decidir(e.s.fluxos, p);
    expect(d).toMatchObject({ destino: 'porta', porta: 'p3', novoTos: byteServico(34) });
    expect(alta.contadores).toEqual({ pacotes: 1, bytes: 84 });
    expect(buscar(e.s.fluxos, { ...p, tos: 0 })!.prioridade).toBe(10);
    expect(lerAcoes('porta:p1+descartar')).toMatch(/um destino final/);
    expect(lerCasamento('cor=azul')).toMatch(/não existe/);
  });
});

/**
 * Triângulo r1, r2, r3 com rotas estáticas: a (192.0.2.0/24) atrás de r1, b (203.0.113.0/24) atrás de r3 e
 * d (198.51.100.0/24) atrás de r2. A tabela de rotas manda tudo pelo r2; o enlace direto r1-r3 fica sobrando.
 */
function triangulo(): Mundo {
  const m = novoMundo(21);
  adicionar(m, pc('a', { ip: lerCidr('192.0.2.10/24')!, gateway: '192.0.2.1' }));
  adicionar(m, pc('b', { ip: lerCidr('203.0.113.10/24')!, gateway: '203.0.113.1' }));
  adicionar(m, pc('d', { ip: lerCidr('198.51.100.10/24')!, gateway: '198.51.100.1' }));
  adicionar(m, roteador('r1', { interfaces: { p1: '192.0.2.1/24', p2: '10.0.12.1/30', p3: '10.0.13.1/30' }, rotas: [{ destino: '203.0.113.0/24', via: '10.0.12.2' }, { destino: '198.51.100.0/24', via: '10.0.12.2' }] }));
  adicionar(m, roteador('r2', { interfaces: { p1: '10.0.12.2/30', p2: '10.0.23.1/30', p3: '198.51.100.1/24' }, rotas: [{ destino: '203.0.113.0/24', via: '10.0.23.2' }, { destino: '192.0.2.0/24', via: '10.0.12.1' }] }));
  adicionar(m, roteador('r3', { interfaces: { p1: '10.0.23.2/30', p2: '10.0.13.2/30', p3: '203.0.113.1/24' }, rotas: [{ destino: '192.0.2.0/24', via: '10.0.23.1' }, { destino: '198.51.100.0/24', via: '10.0.23.1' }] }));
  ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r2', porta: 'p1' }, 'cat6', 30);
  ligar(m, { equip: 'r2', porta: 'p2' }, { equip: 'r3', porta: 'p1' }, 'cat6', 30);
  ligar(m, { equip: 'r1', porta: 'p3' }, { equip: 'r3', porta: 'p2' }, 'cat6', 30);
  ligar(m, { equip: 'r3', porta: 'p3' }, { equip: 'b', porta: 'eth0' }, 'cat6', 5);
  ligar(m, { equip: 'r2', porta: 'p3' }, { equip: 'd', porta: 'eth0' }, 'cat6', 5);
  return m;
}

function rodar(t: Terminal, nome: string, cmds: string[]): string {
  t.executar(`console ${nome}`);
  const s = cmds.map((c) => t.executar(c).join('\n')).join('\n');
  t.executar('sair');
  return s;
}

describe('no mundo: DSCP, RSVP e SDN', () => {
  it('sem nada configurado, nada muda: captura sem serviço diferenciado, caminho pela tabela de rotas', () => {
    const m = triangulo();
    expect(temQos(m)).toBe(false);
    expect(ping(m, 'a', ip('203.0.113.10'), 2).recebidos).toBe(2);
    expect(m.ultimaCaptura!.detalhe!.servico).toBeUndefined();
    expect(traceroute(m, 'a', ip('203.0.113.10')).saltos.map((x) => x.nome)).toEqual(['r1', 'r2', 'r3', 'b']);
  });

  it('a marcação DSCP na borda aparece no cabeçalho IPv4 da captura', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'r1', ['dscp 192.0.2.0/24 EF', 'mostra qos']);
    expect(s).toMatch(/DSCP 46 \(EF\)/);
    expect(ping(m, 'a', ip('203.0.113.10'), 1).recebidos).toBe(1);
    expect(m.ultimaCaptura!.detalhe!.servico).toEqual({ byte: 0xb8, dscp: 46, ecn: 0, classe: 'EF' });
    const cap = rodar(t, 'a', ['capturar']);
    expect(cap).toMatch(/serviço diferenciado 0xb8: DSCP 46 \(EF\)/);
    expect(m.flags.dscp.r1[0]).toMatchObject({ prefixo: '192.0.2.0/24', dscp: 46, classe: 'EF' });
  });

  it('regra SDN muda o caminho de um fluxo e descarta outro; a telemetria conta por regra', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'r1', ['sdn regra 200 destino=203.0.113.0/24 porta:p3'])).toMatch(/Sem controlador/);
    const s = rodar(t, 'r1', ['sdn controlador on', 'sdn regra 200 destino=203.0.113.0/24 porta:p3', 'sdn regra 300 destino=198.51.100.10,proto=icmp descartar']);
    expect(s).toMatch(/instalou a regra #1/);
    expect(traceroute(m, 'a', ip('203.0.113.10')).saltos.map((x) => x.nome)).toEqual(['r1', 'r3', 'b']);
    const r = ping(m, 'a', ip('203.0.113.10'), 4);
    expect(r.recebidos).toBe(4);
    expect(r.roteadores).toEqual(['r1', 'r3']);
    const d = ping(m, 'a', ip('198.51.100.10'), 2);
    expect(d.recebidos).toBe(0);
    expect(d.linhas.join(' ')).toMatch(/regra 2 da tabela de fluxo manda descartar/);
    const tel = rodar(t, 'r1', ['sdn telemetria']);
    expect(tel).toMatch(/TELEMETRIA/);
    // Traceroute manda 3 sondas por salto: 3 morrem no r1 (TTL 1) antes da tabela, 6 passam pela regra; depois, 4 pings.
    expect(m.flags.sdn.telemetria.r1['1'].pacotes).toBe(6 + 4);
    expect(m.flags.sdn.telemetria.r1['2'].pacotes).toBe(2);
    expect(m.flags.sdn.ultimaRegra).toMatchObject({ equip: 'r1', id: 2, prioridade: 300, acoes: 'descartar' });
    // Apagou a regra: volta a tabela de rotas.
    rodar(t, 'r1', ['sdn apagar 1']);
    expect(ping(m, 'a', ip('203.0.113.10'), 1).roteadores).toEqual(['r1', 'r2', 'r3']);
  });

  it('regra "controlador": o pacote sobe, o controlador responde com a visão central e instala regra reativa', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r1', ['sdn controlador on', 'sdn regra 100 destino=203.0.113.0/24 controlador']);
    const r = ping(m, 'a', ip('203.0.113.10'), 3);
    expect(r.recebidos).toBe(3);
    // O controlador calculou o caminho mais curto (o enlace direto) e instalou a regra uma vez só.
    expect(r.roteadores).toEqual(['r1', 'r3']);
    expect(m.flags.sdn.packetIn).toBe(1);
    expect(rodar(t, 'r1', ['mostra fluxos'])).toMatch(/prio 101 +destino=203\.0\.113\.0\/24 .*porta:p3 .*\(reativa\)/);
    // Controlador desligado: a regra reativa continua valendo; sem ela, o pacote morre no packet-in.
    rodar(t, 'r1', ['sdn controlador off', 'sdn apagar 2']);
    const sem = ping(m, 'a', ip('203.0.113.10'), 1);
    expect(sem.recebidos).toBe(0);
    expect(sem.linhas.join(' ')).toMatch(/controlador está desligado/);
  });

  it('RSVP reserva salto a salto e recusa quando não cabe', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'r1', ['rsvp 203.0.113.10 500'])).toMatch(/Reserva feita/);
    expect(m.flags.rsvp).toMatchObject({ ok: true, caminho: ['r1:p2', 'r2:p2', 'r3:p3'] });
    expect(rodar(t, 'r1', ['rsvp 203.0.113.10 500'])).toMatch(/RECUSADA/);
    expect(m.flags.rsvp.ok).toBe(false);
    expect(m.equipamentos.get('r2')!.s.reservas.p2).toHaveLength(1);
  });
});

describe('console e menus de QoS', () => {
  it('fila, balde e escalonar gravam a configuração usada nas flags', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'r1', ['fila p2 buffer 20', 'fila p2 red 4 12', 'fila p2 ecn on', 'fila simular 0,95 p2', 'fila curva p2', 'fila buffers 1,2 p2', 'balde fichas 200 9600 1000 30000', 'escalonar wfq 3,2,1', 'qos requisitos', 'mostra fila']);
    expect(s).toMatch(/SIMULAÇÃO DA FILA DE SAÍDA DA P2/);
    expect(s).toMatch(/CURVA CARGA × ATRASO/);
    expect(s).toMatch(/videoconferência/);
    expect(m.flags.fila).toMatchObject({ equip: 'r1', porta: 'p2', carga: 0.95, capacidadeMbps: 1000, config: { buffer: 20, red: { min: 4, max: 12 }, ecn: true } });
    expect(filaConfere(m)).toBe(true);
    rodar(t, 'r1', ['fila p2 buffer 30']);
    expect(filaConfere(m)).toBe(false);
    expect(m.flags.balde).toMatchObject({ tipo: 'fichas', taxaMbps: 200, profundidadeKB: 9600, picoMbps: 1000 });
    expect(m.flags.balde.sTeoricoMs).toBeCloseTo(96, 3);
    expect(m.flags.escalonamento).toMatchObject({ disciplina: 'wfq', pesos: [3, 2, 1] });
    expect(m.flags.escalonamento.resultado.voz.vazaoMbps).toBeGreaterThan(150);
    expect(m.flags.filaCurva.pontos).toHaveLength(9);
    expect(TRAVESSAO.test(s)).toBe(false);
  });

  it('com m.flags.qos, as ações aparecem no menu e todas rodam com os valores padrão', () => {
    const m = triangulo();
    expect(acoesEquip(m, m.equipamentos.get('r1')!).some((a) => a.id === 'fila-simular')).toBe(false);
    m.flags.qos = true;
    const ids = acoesEquip(m, m.equipamentos.get('r1')!).map((a) => a.id);
    for (const id of ['qos-requisitos', 'fila-buffer', 'fila-red', 'fila-ecn', 'fila-simular', 'fila-curva', 'balde', 'escalonar', 'dscp', 'rsvp', 'sdn-controlador', 'sdn-regra', 'sdn-ver', 'sdn-telemetria']) expect(ids).toContain(id);
    for (const a of acoesEquip(m, m.equipamentos.get('r1')!)) {
      if (!a.id.startsWith('fila') && !a.id.startsWith('sdn') && !['qos-requisitos', 'balde', 'escalonar', 'dscp', 'rsvp'].includes(a.id)) continue;
      const m2 = triangulo();
      m2.flags.qos = true;
      const t = new Terminal(m2, {} as Dia);
      const saida = executarAcao(t, a, padroes(a)).flatMap((x) => x.saida).join('\n');
      expect(saida, a.id).not.toMatch(/desconhecido/);
      expect(TRAVESSAO.test(saida), a.id).toBe(false);
    }
    t2Ajuda(m);
  });
});

function t2Ajuda(m: Mundo) {
  const t = new Terminal(m, {} as Dia);
  t.executar('console r1');
  expect(t.executar('?').join('\n')).toMatch(/congestionamento, QoS e SDN/);
}

describe('revisão: classes DSCP e casamento SDN', () => {
  it('CS1 fica abaixo do melhor esforço na prioridade estrita (menos que melhor esforço)', async () => {
    const { prioridadeDaClasse } = await import('../src/motor/qos');
    expect(prioridadeDaClasse(8)).toBeLessThan(prioridadeDaClasse(0));
    expect(prioridadeDaClasse(46)).toBeGreaterThan(prioridadeDaClasse(34));
    expect(prioridadeDaClasse(48)).toBeGreaterThan(prioridadeDaClasse(46));
  });
  it('campo do casamento aceita maiúsculas sem trocar destino por origem', () => {
    expect(lerCasamento('DESTINO=192.0.2.0/24')).toEqual({ destino: '192.0.2.0/24' });
  });
});
