// Ato 3: subcamada MAC, switch que aprende, spanning tree e VLANs.
import { describe, expect, it } from 'vitest';
import {
  bssidIbss,
  CAMADAS_FISICAS_80211,
  canaisSemSobreposicao,
  canal,
  entrarNaRede,
  frequenciaCanal24,
  INTERVALO_BEACON_MS,
  modulacaoAdaptativa,
  TAXAS_80211AG,
  TAXAS_80211B,
  eficienciaBitmap,
  eficienciaEthernet,
  eficienciaToken,
  recuoExponencial,
  simularOculto,
  tempoVoltaToken,
  vazaoAloha,
  vazaoAlohaSlotted,
  vazaoCsma1p,
  vazaoCsmaCd,
  vazaoCsmaNp,
} from '../src/motor/mac';
import { adicionar, comutador, ligar, novoMundo, pc, type Mundo } from '../src/motor/mundo';
import { calcularStp, caminho, passarQuadro, ping, tabelaMac } from '../src/motor/rede';
import { acoesDo, executarAcao, padroes } from '../src/motor/acoes';
import { Terminal } from '../src/motor/cli';
import { lerCidr, lerIp, rngSemente } from '../src/motor/util';
import type { Dia } from '../src/conteudo/tipos';

const ip = (s: string) => lerIp(s)!;

describe('acesso múltiplo', () => {
  it('ALOHA puro tem pico de 18,4 % em G = 0,5', () => {
    expect(vazaoAloha(0.5)).toBeCloseTo(1 / (2 * Math.E), 6);
    expect(vazaoAloha(0.5)).toBeGreaterThan(vazaoAloha(0.4));
    expect(vazaoAloha(0.5)).toBeGreaterThan(vazaoAloha(0.6));
  });
  it('ALOHA com intervalos tem pico de 36,8 % em G = 1', () => {
    expect(vazaoAlohaSlotted(1)).toBeCloseTo(1 / Math.E, 6);
    expect(vazaoAlohaSlotted(1)).toBeGreaterThan(vazaoAlohaSlotted(0.9));
    expect(vazaoAlohaSlotted(1)).toBeGreaterThan(vazaoAlohaSlotted(1.1));
  });
  it('CSMA ganha do ALOHA com atraso pequeno e o não persistente aguenta carga alta', () => {
    expect(vazaoCsmaNp(1, 0.01)).toBeGreaterThan(vazaoAlohaSlotted(1));
    expect(vazaoCsma1p(1, 0)).toBeCloseTo((2 * Math.exp(-1)) / (1 + Math.exp(-1)), 6);
    expect(vazaoCsmaNp(10, 0.01)).toBeGreaterThan(vazaoCsma1p(10, 0.01));
    expect(vazaoCsmaCd(10, 0.01)).toBeGreaterThan(0.9);
  });
  it('eficiência da Ethernet cai com o comprimento do cabo', () => {
    const curto = eficienciaEthernet(10e6, 100, 512);
    const longo = eficienciaEthernet(10e6, 2500, 512);
    expect(curto).toBeGreaterThan(longo);
    expect(longo).toBeCloseTo(1 / (1 + (2 * 10e6 * 2500 * Math.E) / (2e8 * 512)), 9);
    expect(eficienciaEthernet(1e9, 2500, 512)).toBeLessThan(longo);
  });
  it('recuo exponencial resolve as colisões e demora mais com mais estações', () => {
    const duas = recuoExponencial(2, rngSemente(7));
    const dez = recuoExponencial(10, rngSemente(7));
    expect(duas.desistencias).toBe(0);
    expect(duas.colisoes).toBeGreaterThanOrEqual(1);
    expect(dez.intervalos).toBeGreaterThan(duas.intervalos);
    expect(recuoExponencial(10, rngSemente(7))).toEqual(dez);
  });
  it('mapa de bits e bastão não colidem e têm as eficiências clássicas', () => {
    expect(eficienciaBitmap(8, 1000, 'baixa')).toBeCloseTo(1000 / 1008, 9);
    expect(eficienciaBitmap(8, 1000, 'alta')).toBeCloseTo(1000 / 1001, 9);
    const volta = tempoVoltaToken(10, 0.1, 24, 1000);
    expect(volta).toBeCloseTo(0.34, 9);
    expect(eficienciaToken(10, volta)).toBeCloseTo(10 / 10.34, 9);
  });
  it('terminal oculto colide muito e RTS/CTS resolve', () => {
    const cfg = { estacoes: 2, ocultas: true, carga: 0.8 };
    const sem = simularOculto({ ...cfg, rtsCts: false }, rngSemente(3));
    const com = simularOculto({ ...cfg, rtsCts: true }, rngSemente(3));
    const visiveis = simularOculto({ ...cfg, ocultas: false, rtsCts: false }, rngSemente(3));
    expect(sem.fracaoColisao).toBeGreaterThan(0.2);
    expect(com.fracaoColisao).toBe(0);
    expect(com.colisoesRts).toBeGreaterThan(0);
    expect(com.vazao).toBeGreaterThan(sem.vazao);
    expect(visiveis.fracaoColisao).toBeLessThan(sem.fracaoColisao);
  });
  it('o canal simula no console e grava o resultado', () => {
    const m = novoMundo(1);
    adicionar(m, canal('meio', { protocolo: 'aloha', carga: 0.5 }));
    const t = new Terminal(m, {} as Dia);
    t.executar('console meio');
    const saida = t.executar('simular').join('\n');
    expect(saida).toContain('18,4 %');
    expect(m.flags.ultimoMac.vazao).toBeCloseTo(0.184, 3);
    expect(JSON.parse(m.flags.macDoUltimo).protocolo).toBe('aloha');
    t.executar('protocolo aloha-slotted');
    t.executar('carga 1');
    expect(t.executar('simular').join('\n')).toContain('36,8 %');
    const ids = acoesDo(m, 'equip', 'meio').map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['canal-ver', 'canal-protocolo', 'canal-carga', 'canal-rts', 'canal-simular']));
  });
});

/** Dois PCs, cada um num switch, com os switches ligados entre si. */
function doisSwitches(): Mundo {
  const m = novoMundo(1);
  adicionar(m, pc('a', { ip: lerCidr('192.0.2.1/24')! }));
  adicionar(m, pc('b', { ip: lerCidr('192.0.2.2/24')! }));
  adicionar(m, comutador('sw1'));
  adicionar(m, comutador('sw2'));
  ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'sw1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'b', porta: 'eth0' }, { equip: 'sw2', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'sw1', porta: 'p8' }, { equip: 'sw2', porta: 'p8' }, 'cat6', 20);
  return m;
}

/** Triângulo de switches: sw1, sw2 e sw3 todos ligados entre si. */
function triangulo(): Mundo {
  const m = doisSwitches();
  adicionar(m, comutador('sw3'));
  ligar(m, { equip: 'sw2', porta: 'p7' }, { equip: 'sw3', porta: 'p7' }, 'cat6', 20);
  ligar(m, { equip: 'sw3', porta: 'p8' }, { equip: 'sw1', porta: 'p7' }, 'cat6', 20);
  return m;
}

describe('switch que aprende', () => {
  it('inunda o primeiro quadro e não o segundo', () => {
    const m = doisSwitches();
    const ida = passarQuadro(m, 'a', 'b')!;
    expect(ida.inundou).toEqual(['sw1', 'sw2']);
    expect(m.flags.inundacoes).toBe(2);
    expect(tabelaMac(m.equipamentos.get('sw1')!)[m.equipamentos.get('a')!.mac]).toBe('p1');
    const volta = passarQuadro(m, 'b', 'a')!;
    expect(volta.inundou).toEqual([]);
    const segunda = passarQuadro(m, 'a', 'b')!;
    expect(segunda.inundou).toEqual([]);
    expect(m.flags.inundacoes).toBe(2);
  });
  it('ping aprende pelo ARP e a tabela esvaziada volta a inundar', () => {
    const m = doisSwitches();
    expect(ping(m, 'a', ip('192.0.2.2')).recebidos).toBe(4);
    expect(m.flags.inundacoes ?? 0).toBe(0);
    expect(m.flags.broadcasts).toBe(2);
    const t = new Terminal(m, {} as Dia);
    t.executar('console sw1');
    expect(t.executar('mostra mac').join('\n')).toContain('p8');
    t.executar('limpa mac');
    ping(m, 'a', ip('192.0.2.2'), 1);
    expect(m.flags.inundacoes).toBe(1);
  });
  it('hub não aprende', () => {
    const m = novoMundo(1);
    adicionar(m, pc('a'));
    adicionar(m, pc('b'));
    adicionar(m, comutador('hub', { tipo: 'hub', portas: 4 }));
    ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'hub', porta: 'p1' }, 'cat5e', 5);
    ligar(m, { equip: 'b', porta: 'eth0' }, { equip: 'hub', porta: 'p2' }, 'cat5e', 5);
    passarQuadro(m, 'a', 'b');
    expect(m.equipamentos.get('hub')!.s.tabelaMac).toBeUndefined();
    expect(m.flags.inundacoes).toBeUndefined();
  });
});

describe('spanning tree', () => {
  it('laço com um switch sem STP vira tempestade', () => {
    const m = triangulo();
    m.equipamentos.get('sw3')!.s.stp = false;
    const r = ping(m, 'a', ip('192.0.2.2'));
    expect(r.recebidos).toBe(0);
    expect(r.erro).toBe('tempestade');
    expect(r.linhas[0]).toContain('Tempestade de broadcast');
    const t = new Terminal(m, {} as Dia);
    t.executar('console sw1');
    expect(t.executar('mostra').join('\n')).toContain('CPU: 100 %');
  });
  it('com STP em todos o laço é cortado e o ping passa', () => {
    const m = triangulo();
    const r = ping(m, 'a', ip('192.0.2.2'));
    expect(r.recebidos).toBe(4);
    const stp = calcularStp(m);
    // Mesma prioridade: a raiz é o menor MAC, o sw1 (o terceiro aparelho criado).
    expect(stp.get('sw2')!.raiz).toBe('sw1');
    expect(stp.get('sw2')!.custo).toBe(4);
    const bloqueadas = [...stp].flatMap(([n, e]) => Object.entries(e.portas).filter(([, p]) => p === 'bloqueada').map(([p]) => `${n}:${p}`));
    expect(bloqueadas).toEqual(['sw3:p7']);
  });
  it('prioridade muda a raiz e a porta bloqueada', () => {
    const m = triangulo();
    m.equipamentos.get('sw3')!.s.prioridade = 4096;
    const stp = calcularStp(m);
    expect(stp.get('sw1')!.raiz).toBe('sw3');
    expect(stp.get('sw2')!.portas.p8).toBe('bloqueada');
    // a e b agora conversam passando pela raiz, sw3.
    const s = caminho(m, 'a', 'b')!;
    expect(s.map((x) => x.para)).toEqual(['sw1', 'sw3', 'sw2', 'b']);
  });
  it('enlace mais lento custa mais', () => {
    const m = triangulo();
    // Troca o enlace direto sw1-sw2 por um de 100 Mb/s: a árvore prefere ir por sw3 (4 + 4 < 19).
    for (const p of m.equipamentos.get('sw2')!.portas) p.velocidades = p.nome === 'p8' ? [10, 100] : p.velocidades;
    const stp = calcularStp(m);
    expect(stp.get('sw2')!.custo).toBe(8);
    expect(stp.get('sw2')!.portaRaiz).toBe('p7');
    expect(stp.get('sw2')!.portas.p8).toBe('bloqueada');
  });
  it('comandos e ações do STP', () => {
    const m = triangulo();
    const t = new Terminal(m, {} as Dia);
    const acao = acoesDo(m, 'equip', 'sw3').find((x) => x.id === 'stp')!;
    executarAcao(t, acao, { v: 'off' });
    expect(m.equipamentos.get('sw3')!.s.stp).toBe(false);
    expect(ping(m, 'a', ip('192.0.2.2')).erro).toBe('tempestade');
    const saida = executarAcao(t, acao, { v: 'on' });
    expect(saida.at(-1)!.saida.join('\n')).toContain('BLOQUEANDO');
    expect(ping(m, 'a', ip('192.0.2.2')).recebidos).toBe(4);
  });
});

describe('VLANs', () => {
  it('hosts em VLANs diferentes não se falam', () => {
    const m = doisSwitches();
    const t = new Terminal(m, {} as Dia);
    t.executar('console sw2');
    t.executar('vlan p1 20');
    const r = ping(m, 'a', ip('192.0.2.2'));
    expect(r.recebidos).toBe(0);
    expect(r.linhas[0]).toContain('VLAN 1 e b na VLAN 20');
  });
  it('mesma VLAN dos dois lados precisa de tronco que a carregue', () => {
    const m = doisSwitches();
    const t = new Terminal(m, {} as Dia);
    t.executar('console sw1');
    t.executar('vlan p1 10');
    t.executar('tronco p8 1,20');
    t.executar('sair');
    t.executar('console sw2');
    t.executar('vlan p1 10');
    t.executar('tronco p8 1,20');
    let r = ping(m, 'a', ip('192.0.2.2'));
    expect(r.recebidos).toBe(0);
    expect(r.linhas[0]).toContain('não carrega a VLAN');
    t.executar('tronco p8 1,10,20');
    t.executar('sair');
    t.executar('console sw1');
    t.executar('tronco p8 10,20');
    r = ping(m, 'a', ip('192.0.2.2'));
    expect(r.recebidos).toBe(4);
    expect(t.executar('mostra vlan').join('\n')).toContain('tronco    10,20');
  });
  it('ações de VLAN no menu', () => {
    const m = doisSwitches();
    const t = new Terminal(m, {} as Dia);
    const acoes = acoesDo(m, 'equip', 'sw1');
    expect(acoes.map((x) => x.id)).toEqual(expect.arrayContaining(['mostra', 'mac-tabela', 'mac-limpar', 'stp-ver', 'stp', 'stp-prioridade', 'vlan-ver', 'vlan', 'tronco']));
    const vlan = acoes.find((x) => x.id === 'vlan')!;
    executarAcao(t, vlan, { ...padroes(vlan), porta: 'p1', id: '30' });
    expect(m.equipamentos.get('sw1')!.portas[0]!.vlan).toBe(30);
    expect(ping(m, 'a', ip('192.0.2.2')).recebidos).toBe(0);
  });
});

describe('802.11: arquitetura e camadas físicas', () => {
  const bss = { ssid: 'Padaria', bssid: '02:00:5e:10:00:01', canal: 6, modo: 'infraestrutura' as const };
  it('estação entra no BSS: acha, autentica e associa', () => {
    const passiva = entrarNaRede(bss, '02:00:5e:20:00:02', 'passiva');
    expect(passiva.map((p) => p.quadro)).toEqual(['beacon', 'authentication', 'authentication', 'association request', 'association response']);
    expect(passiva[0]!.subtipo).toBe(8);
    expect(passiva[0]!.para).toBe('ff:ff:ff:ff:ff:ff');
    const ativa = entrarNaRede(bss, '02:00:5e:20:00:02', 'ativa');
    expect(ativa.slice(0, 2).map((p) => [p.quadro, p.subtipo])).toEqual([
      ['probe request', 4],
      ['probe response', 5],
    ]);
    expect(ativa.at(-1)!.de).toBe(bss.bssid);
    expect(entrarNaRede({ ...bss, modo: 'ad-hoc' }, 'x', 'passiva')).toEqual([]);
    expect(INTERVALO_BEACON_MS).toBeCloseTo(102.4, 6);
  });
  it('BSSID de IBSS é individual e administrado localmente', () => {
    const b = bssidIbss(rngSemente(3));
    const primeiro = parseInt(b.slice(0, 2), 16);
    expect(b).toMatch(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/);
    expect(primeiro & 1).toBe(0);
    expect(primeiro & 2).toBe(2);
  });
  it('taxas máximas saem da conta do OFDM', () => {
    expect(CAMADAS_FISICAS_80211['802.11b'].taxaMaxMbps).toBe(11);
    expect(CAMADAS_FISICAS_80211['802.11a'].taxaMaxMbps).toBe(54);
    expect(CAMADAS_FISICAS_80211['802.11g'].taxaMaxMbps).toBe(54);
    expect(CAMADAS_FISICAS_80211['802.11n'].taxaMaxMbps).toBeCloseTo(600, 6);
    expect(CAMADAS_FISICAS_80211['802.11ac'].taxaMaxMbps).toBeCloseTo(6933.3, 1);
    expect(CAMADAS_FISICAS_80211['802.11ax'].taxaMaxMbps).toBeCloseTo(9607.8, 1);
    expect(TAXAS_80211AG.map((t) => t.mbps)).toEqual([6, 9, 12, 18, 24, 36, 48, 54]);
  });
  it('modulação adaptativa acompanha a SNR', () => {
    expect(modulacaoAdaptativa(31.7)!.mbps).toBe(54);
    expect(modulacaoAdaptativa(20)!.mbps).toBe(36);
    expect(modulacaoAdaptativa(10)!.modulacao).toBe('QPSK');
    expect(modulacaoAdaptativa(-5)).toBeNull();
    expect(modulacaoAdaptativa(9, TAXAS_80211B)!.mbps).toBe(5.5);
  });
  it('canais de 2,4 GHz: 1, 6 e 11 com 22 MHz', () => {
    expect(canaisSemSobreposicao()).toEqual([1, 6, 11]);
    expect(canaisSemSobreposicao(20, 13)).toEqual([1, 5, 9, 13]);
    expect(frequenciaCanal24(1)).toBe(2412);
    expect(frequenciaCanal24(13)).toBe(2472);
    expect(frequenciaCanal24(14)).toBe(2484);
  });
});
