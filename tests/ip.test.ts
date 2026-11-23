// Camada de rede: roteador que repassa, TTL, traceroute, sub-redes, fragmentação, NAT, DHCP e IPv6.
import { describe, expect, it } from 'vitest';
import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../src/motor/mundo';
import { ping } from '../src/motor/rede';
import { configurarDhcp, configurarNat, escolherRota, nat, pedirDhcp, ping6, traceroute } from '../src/motor/roteamento';
import {
  abreviarIpv6,
  agregar,
  cabecalhoConfere,
  decrementarTtl,
  enderecoEui64,
  enlaceLocal,
  eui64,
  expandirIpv6,
  fragmentarDatagrama,
  infoSubrede,
  mascaraTexto,
  montarCabecalho,
  pertence,
  prefixoDaMascara,
  prefixoIpv6,
  quantidadeHosts,
  remontar,
  superrede,
  textoCidr,
} from '../src/motor/ip';
import { Terminal } from '../src/motor/cli';
import { acoesEquip, executarAcao, padroes } from '../src/motor/acoes';
import { lerCidr, lerIp } from '../src/motor/util';
import type { Dia } from '../src/conteudo/tipos';

const ip = (s: string) => lerIp(s)!;
const cidr = (s: string) => lerCidr(s)!;

/** a (192.0.2.0/24), sw, r1, enlace /30, r2, b (203.0.113.0/24). */
function duasRedes(o: { semVolta?: boolean } = {}): Mundo {
  const m = novoMundo(7);
  adicionar(m, pc('a', { ip: cidr('192.0.2.10/24'), gateway: '192.0.2.1' }));
  adicionar(m, pc('b', { ip: cidr('203.0.113.10/24'), gateway: '203.0.113.1' }));
  adicionar(m, comutador('sw', { portas: 4 }));
  adicionar(m, roteador('r1', { interfaces: { p1: '192.0.2.1/24', p2: '198.51.100.1/30' }, rotas: [{ destino: '203.0.113.0/24', via: '198.51.100.2' }] }));
  adicionar(m, roteador('r2', { interfaces: { p1: '198.51.100.2/30', p2: '203.0.113.1/24' }, rotas: o.semVolta ? [] : [{ destino: '192.0.2.0/24', via: '198.51.100.1' }] }));
  ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'sw', porta: 'p1' }, 'cat6', 10);
  ligar(m, { equip: 'sw', porta: 'p2' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r2', porta: 'p1' }, 'cat6', 50);
  ligar(m, { equip: 'r2', porta: 'p2' }, { equip: 'b', porta: 'eth0' }, 'cat6', 5);
  return m;
}

describe('roteador repassando', () => {
  it('ping atravessa dois roteadores e o TTL cai dois', () => {
    const m = duasRedes();
    const r = ping(m, 'a', ip('203.0.113.10'));
    expect(r.recebidos).toBe(4);
    expect(r.roteadores).toEqual(['r1', 'r2']);
    expect(r.ttl).toBe(62); // b sai com 64, passa por r2 e r1
    expect(m.ultimaCaptura!.ip.ttl).toBe(62); // a sai com 64 e chega com 62
    expect(m.ultimaCaptura!.detalhe!.roteadores).toEqual(['r1', 'r2']);
    // O quadro que chega em b vem do MAC de r2, não do de a.
    expect(m.ultimaCaptura!.eth.origem).toBe(m.equipamentos.get('r2')!.mac);
    // ARP só até o gateway: a conhece o MAC de r1, nunca o de b.
    const arp = m.equipamentos.get('a')!.s.arp as Record<number, string>;
    expect(arp[ip('192.0.2.1')]).toBe(m.equipamentos.get('r1')!.mac);
    expect(arp[ip('203.0.113.10')]).toBeUndefined();
  });

  it('ping ao gateway responde', () => {
    const m = duasRedes();
    expect(ping(m, 'a', ip('192.0.2.1')).recebidos).toBe(4);
  });

  it('sem rota de volta, o pedido chega e a resposta não', () => {
    const m = duasRedes({ semVolta: true });
    const r = ping(m, 'a', ip('203.0.113.10'), 2);
    expect(r.recebidos).toBe(0);
    expect(m.ultimaCaptura).toBeDefined(); // o pedido chegou em b
    expect(r.linhas.join('\n')).toMatch(/resposta morreu na volta: r2 disse "rede inalcançável"/);
  });

  it('sem rota na ida, o roteador devolve destino inalcançável', () => {
    const m = duasRedes();
    const r = ping(m, 'a', ip('10.9.9.9'), 1);
    expect(r.recebidos).toBe(0);
    expect(r.icmp).toEqual({ tipo: 3, codigo: 0, de: ip('192.0.2.1') });
    expect(r.linhas.join('\n')).toMatch(/r1\): rede inalcançável/);
  });

  it('sem gateway, o PC nem tenta (como antes)', () => {
    const m = duasRedes();
    delete m.equipamentos.get('a')!.s.gateway;
    expect(ping(m, 'a', ip('203.0.113.10')).erro).toMatch(/não tenho gateway/);
  });

  it('TTL esgotado gera ICMP tipo 11 do roteador onde zerou', () => {
    const m = duasRedes();
    const r = ping(m, 'a', ip('203.0.113.10'), 1, { ttl: 2 });
    expect(r.recebidos).toBe(0);
    expect(r.icmp).toEqual({ tipo: 11, codigo: 0, de: ip('198.51.100.2') });
    expect(r.linhas.join('\n')).toMatch(/tempo esgotado em trânsito/);
  });

  it('traceroute lista cada roteador e depois o destino', () => {
    const m = duasRedes();
    const t = traceroute(m, 'a', ip('203.0.113.10'));
    expect(t.chegou).toBe(true);
    expect(t.saltos.map((s) => s.nome)).toEqual(['r1', 'r2', 'b']);
    expect(t.saltos.map((s) => s.ip)).toEqual([ip('192.0.2.1'), ip('198.51.100.2'), ip('203.0.113.10')]);
    expect(t.saltos.every((s) => s.rtts.length === 3 && s.rtts.every((x) => x !== null && x > 0))).toBe(true);
    // Cada salto mais longe demora mais.
    expect(t.saltos[2]!.rtts[0]!).toBeGreaterThan(t.saltos[0]!.rtts[0]!);
  });

  it('laço de roteamento: o TTL acaba e o traceroute mostra os dois se alternando', () => {
    const m = duasRedes();
    m.equipamentos.get('r1')!.s.rotas.push({ destino: '0.0.0.0/0', via: '198.51.100.2' });
    m.equipamentos.get('r2')!.s.rotas.push({ destino: '0.0.0.0/0', via: '198.51.100.1' });
    const r = ping(m, 'a', ip('10.1.1.1'), 1);
    expect(r.icmp?.tipo).toBe(11);
    const t = traceroute(m, 'a', ip('10.1.1.1'), 8);
    expect(t.laco).toBe(true);
    expect(t.saltos.map((s) => s.nome)).toEqual(['r1', 'r2', 'r1', 'r2', 'r1', 'r2', 'r1', 'r2']);
  });

  it('prefixo mais longo vence', () => {
    const m = duasRedes();
    const r1 = m.equipamentos.get('r1')!;
    r1.s.rotas.push({ destino: '0.0.0.0/0', via: '198.51.100.2' }, { destino: '203.0.113.128/25', via: '192.0.2.99' });
    expect(escolherRota(r1, ip('203.0.113.200'))!.destino.prefixo).toBe(25);
    expect(escolherRota(r1, ip('203.0.113.10'))!.destino.prefixo).toBe(24);
    expect(escolherRota(r1, ip('8.8.8.8'))!.origem).toBe('padrão');
    expect(escolherRota(r1, ip('192.0.2.50'))!.origem).toBe('conectada');
    // Ninguém tem 192.0.2.99: o ping para a /25 morre no ARP de r1 (host inalcançável).
    const r = ping(m, 'a', ip('203.0.113.200'), 1);
    expect(r.icmp?.tipo).toBe(3);
    expect(r.icmp?.codigo).toBe(1);
  });

  it('roteador em boot não repassa', () => {
    const m = duasRedes();
    m.equipamentos.get('r2')!.s.estado = 'boot';
    expect(ping(m, 'a', ip('203.0.113.10'), 1).recebidos).toBe(0);
  });
});

describe('contas de sub-rede', () => {
  it('192.0.2.64/26 tem 62 hosts', () => {
    const i = infoSubrede(cidr('192.0.2.77/26'));
    expect(i).toMatchObject({ rede: '192.0.2.64', broadcast: '192.0.2.127', primeiro: '192.0.2.65', ultimo: '192.0.2.126', hosts: 62, mascara: '255.255.255.192' });
  });
  it('casos de borda e máscara', () => {
    expect(quantidadeHosts(24)).toBe(254);
    expect(quantidadeHosts(30)).toBe(2);
    expect(quantidadeHosts(31)).toBe(2);
    expect(quantidadeHosts(32)).toBe(1);
    expect(mascaraTexto(20)).toBe('255.255.240.0');
    expect(prefixoDaMascara('255.255.255.248')).toBe(29);
    expect(prefixoDaMascara('255.0.255.0')).toBeNull();
    expect(pertence(ip('192.0.2.130'), cidr('192.0.2.128/25'))).toBe(true);
    expect(pertence(ip('192.0.2.127'), cidr('192.0.2.128/25'))).toBe(false);
  });
  it('agregação de prefixos', () => {
    const a = agregar(['192.0.2.0/26', '192.0.2.64/26', '192.0.2.128/25', '198.51.100.0/24', '198.51.100.8/29'].map(cidr));
    expect(a.map(textoCidr)).toEqual(['192.0.2.0/24', '198.51.100.0/24']);
    expect(agregar(['10.0.0.0/24', '10.0.2.0/24'].map(cidr)).length).toBe(2); // não são irmãs
    expect(textoCidr(superrede(['10.0.0.0/24', '10.0.3.0/24'].map(cidr))!)).toBe('10.0.0.0/22');
  });
});

describe('cabeçalho IPv4', () => {
  it('checksum confere e muda a cada TTL', () => {
    // Exemplo clássico: 45 00 00 73 00 00 40 00 40 11 [b861] c0 a8 00 01 c0 a8 00 c7
    const h = montarCabecalho({ tamanhoTotal: 0x73, identificacao: 0, df: true, ttl: 64, protocolo: 17, origem: ip('192.168.0.1'), destino: ip('192.168.0.199') });
    expect(h.checksum).toBe(0xb861);
    expect(cabecalhoConfere(h)).toBe(true);
    const d = decrementarTtl(h);
    expect(d.ttl).toBe(63);
    expect(d.checksum).not.toBe(h.checksum);
    expect(cabecalhoConfere(d)).toBe(true);
    expect(cabecalhoConfere({ ...d, ttl: 62 })).toBe(false);
  });
});

describe('fragmentação', () => {
  it('4000 bytes em MTU 1500: deslocamentos 0, 185, 370', () => {
    const f = fragmentarDatagrama(4000, 1500, 0x1234);
    expect(f.map((x) => x.deslocamento)).toEqual([0, 185, 370]);
    expect(f.map((x) => x.dados)).toEqual([1480, 1480, 1020]);
    expect(f.map((x) => x.mf)).toEqual([true, true, false]);
    expect(remontar(f)).toBe(3980);
  });

  it('no mundo: roteador fragmenta num enlace de MTU menor, e com DF devolve erro', () => {
    const m = duasRedes();
    [...m.cabos.values()].find((c) => c.a.equip === 'r1' && c.b.equip === 'r2')!.mtu = 1000;
    let r = ping(m, 'a', ip('203.0.113.10'), 1, { tamanho: 1472 }); // 1500 bytes no total
    expect(r.recebidos).toBe(1);
    expect(r.linhas.join('\n')).toMatch(/r1 fragmenta: MTU 1000/);
    expect(m.ultimaCaptura!.detalhe!.fragmentos).toEqual([
      { deslocamento: 0, dados: 976, mf: true },
      { deslocamento: 122, dados: 504, mf: false },
    ]);
    expect(m.ultimaCaptura!.detalhe!.confere).toBe(true);
    r = ping(m, 'a', ip('203.0.113.10'), 1, { tamanho: 1472, df: true });
    expect(r.recebidos).toBe(0);
    expect(r.icmp).toEqual({ tipo: 3, codigo: 4, de: ip('192.0.2.1') });
    expect(r.linhas.join('\n')).toMatch(/MTU do próximo salto 1000/);
    // Na origem, com DF e acima de 1500, nem sai.
    expect(ping(m, 'a', ip('203.0.113.10'), 1, { tamanho: 2000, df: true }).erro).toMatch(/Mensagem longa demais/);
  });
});

/** Casa com endereços privados atrás de um roteador com NAT e DHCP, saindo para 203.0.113.x. */
function casaComNat(): Mundo {
  const m = novoMundo(3);
  adicionar(m, pc('note'));
  adicionar(m, pc('tv'));
  adicionar(m, comutador('sw', { portas: 4 }));
  adicionar(m, roteador('casa', { interfaces: { lan: '192.168.0.1/24', wan: '203.0.113.2/30' }, rotas: [{ destino: '0.0.0.0/0', via: '203.0.113.1' }] }));
  adicionar(m, roteador('prov', { interfaces: { p1: '203.0.113.1/30', p2: '198.51.100.1/24' } }));
  adicionar(m, pc('site', { ip: cidr('198.51.100.80/24'), gateway: '198.51.100.1' }));
  ligar(m, { equip: 'note', porta: 'eth0' }, { equip: 'sw', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'tv', porta: 'eth0' }, { equip: 'sw', porta: 'p2' }, 'cat6', 5);
  ligar(m, { equip: 'sw', porta: 'p4' }, { equip: 'casa', porta: 'lan' }, 'cat6', 2);
  ligar(m, { equip: 'casa', porta: 'wan' }, { equip: 'prov', porta: 'p1' }, 'cat6', 80);
  ligar(m, { equip: 'prov', porta: 'p2' }, { equip: 'site', porta: 'eth0' }, 'cat6', 3);
  configurarNat(m.equipamentos.get('casa')!, ['lan'], 'wan');
  configurarDhcp(m.equipamentos.get('casa')!, 'lan', '192.168.0.100', '192.168.0.199', { dns: '192.168.0.1', concessao: 86400 });
  return m;
}

describe('DHCP e NAT', () => {
  it('DHCP entrega endereço, máscara e gateway, em quatro mensagens', () => {
    const m = casaComNat();
    const d = pedirDhcp(m, 'note');
    expect(d.ok).toBe(true);
    expect(d.linhas.filter((l) => /^DHCP(DISCOVER|OFFER|REQUEST|ACK)/.test(l)).map((l) => l.split(' ')[0])).toEqual(['DHCPDISCOVER', 'DHCPOFFER', 'DHCPREQUEST', 'DHCPACK']);
    const note = m.equipamentos.get('note')!;
    expect(textoCidr(note.ip!)).toBe('192.168.0.100/24');
    expect(note.s.gateway).toBe('192.168.0.1');
    expect(note.s.dns).toBe('192.168.0.1');
    pedirDhcp(m, 'tv');
    expect(textoCidr(m.equipamentos.get('tv')!.ip!)).toBe('192.168.0.101/24');
    // Pedir de novo devolve o mesmo endereço (a concessão é do MAC).
    pedirDhcp(m, 'note');
    expect(textoCidr(note.ip!)).toBe('192.168.0.100/24');
  });

  it('sem servidor na rede de enlace, ninguém oferece', () => {
    const m = casaComNat();
    delete m.equipamentos.get('casa')!.s.dhcp;
    expect(pedirDhcp(m, 'note').ok).toBe(false);
  });

  it('NAT traduz os privados para o endereço público e mostra a tabela', () => {
    const m = casaComNat();
    pedirDhcp(m, 'note');
    pedirDhcp(m, 'tv');
    expect(ping(m, 'note', ip('198.51.100.80'), 2).recebidos).toBe(2);
    expect(ping(m, 'tv', ip('198.51.100.80'), 2).recebidos).toBe(2);
    // O site vê o endereço público da casa, nunca o privado.
    expect(m.ultimaCaptura!.ip.origem).toBe(ip('203.0.113.2'));
    const t = nat(m.equipamentos.get('casa')!)!.tabela;
    expect(t).toEqual([
      { protocolo: 'icmp', ipInterno: '192.168.0.100', portaInterna: 0x1c8, ipExterno: '203.0.113.2', portaExterna: 0x1c8 },
      { protocolo: 'icmp', ipInterno: '192.168.0.101', portaInterna: 0x1c8, ipExterno: '203.0.113.2', portaExterna: 50000 },
    ]);
    // Sem NAT, o provedor não sabe voltar para 192.168.0.x.
    delete m.equipamentos.get('casa')!.s.nat;
    expect(ping(m, 'note', ip('198.51.100.80'), 1).recebidos).toBe(0);
  });

  it('pelo console: dhcp no PC, mostra nat no roteador', () => {
    const m = casaComNat();
    const t = new Terminal(m, {} as Dia);
    t.executar('console note');
    expect(t.executar('dhcp').join('\n')).toMatch(/DHCPACK/);
    expect(t.executar('ping 198.51.100.80 2').join('\n')).toMatch(/2 de 2 respondidos/);
    expect(t.executar('traceroute 198.51.100.80').join('\n')).toMatch(/casa \(192\.168\.0\.1\)/);
    t.executar('sair');
    t.executar('console casa');
    const s = t.executar('mostra nat').join('\n');
    expect(s).toMatch(/192\.168\.0\.100:456/);
    expect(s).toMatch(/203\.0\.113\.2:456/);
    expect(t.executar('mostra rotas').join('\n')).toMatch(/0\.0\.0\.0\/0 +via 203\.0\.113\.1/);
  });
});

describe('console e ações do roteador', () => {
  it('monta as rotas pelo console', () => {
    const m = duasRedes();
    const r1 = m.equipamentos.get('r1')!;
    r1.s.interfaces = {};
    r1.s.rotas = [];
    const t = new Terminal(m, {} as Dia);
    t.executar('console r1');
    expect(t.executar('ip p1 192.0.2.1/24')[0]).toMatch(/p1/);
    t.executar('ip p2 198.51.100.1/30');
    expect(t.executar('rota 203.0.113.0/24 198.51.100.2')[0]).toMatch(/Rota/);
    expect(t.executar('mostra interfaces').join('\n')).toMatch(/198\.51\.100\.1\/30/);
    expect(t.executar('mostra rotas').join('\n')).toMatch(/203\.0\.113\.0\/24 +via 198\.51\.100\.2/);
    t.executar('sair');
    t.executar('console a');
    expect(t.executar('ping 203.0.113.10 1').join('\n')).toMatch(/ttl=62/);
    t.executar('sair');
    t.executar('console r1');
    t.executar('sem-rota 203.0.113.0/24');
    t.executar('sair');
    t.executar('console a');
    expect(t.executar('ping 203.0.113.10 1').join('\n')).toMatch(/rede inalcançável/);
  });

  it('ações do menu geram os comandos', () => {
    const m = duasRedes();
    const t = new Terminal(m, {} as Dia);
    const a = acoesEquip(m, m.equipamentos.get('a')!);
    const trace = a.find((x) => x.id === 'traceroute')!;
    const saida = executarAcao(t, trace, { ...padroes(trace), destino: '203.0.113.10' });
    expect(saida.at(-1)!.saida.join('\n')).toMatch(/r2 \(198\.51\.100\.2\)/);
    const r = acoesEquip(m, m.equipamentos.get('r1')!);
    for (const id of ['rot-ip', 'rot-rota', 'rot-sem-rota', 'rot-rotas', 'rot-interfaces', 'rot-nat', 'rot-nat-ver', 'rot-dhcp', 'rot-mtu']) expect(r.some((x) => x.id === id)).toBe(true);
  });
});

describe('IPv6', () => {
  it('abrevia e expande', () => {
    expect(abreviarIpv6('2001:0db8:0000:0000:0000:ff00:0042:8329')).toBe('2001:db8::ff00:42:8329');
    expect(abreviarIpv6('2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1'); // no empate, a primeira
    expect(abreviarIpv6('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1'); // um zero sozinho fica
    expect(abreviarIpv6('0:0:0:0:0:0:0:1')).toBe('::1');
    expect(expandirIpv6('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(expandirIpv6('::')).toBe('0000:0000:0000:0000:0000:0000:0000:0000');
    expect(expandirIpv6('1::2::3')).toBeNull();
    expect(prefixoIpv6('2001:db8:1:2:a:b:c:d')).toBe('2001:db8:1:2::/64');
  });
  it('EUI-64 e enlace local', () => {
    expect(eui64('00:1a:2b:3c:4d:5e')!.map((x) => x.toString(16))).toEqual(['21a', '2bff', 'fe3c', '4d5e']);
    expect(enlaceLocal('00:1a:2b:3c:4d:5e')).toBe('fe80::21a:2bff:fe3c:4d5e');
    expect(enderecoEui64('2001:db8:1::', '02:c8:00:00:00:01')).toBe('2001:db8:1:0:c8:ff:fe00:1');
  });
  it('ping6 no enlace', () => {
    const m = duasRedes();
    const b = m.equipamentos.get('sw')!;
    expect(b).toBeDefined();
    const r1 = m.equipamentos.get('r1')!;
    const r = ping6(m, 'a', enlaceLocal(r1.mac)!, 2);
    expect(r.recebidos).toBe(2);
    expect(ping6(m, 'a', '2001:db8:9::1', 1).erro).toMatch(/fora do meu \/64/);
  });
});
