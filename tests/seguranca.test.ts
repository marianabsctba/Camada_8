// Segurança de rede (ato 7) no mundo: ataques simulados (varredura, farejamento, ARP falso, IP falsificado,
// inundação de SYN, DDoS, envenenamento de DNS, Wi-Fi) e as defesas (firewall com estado, IDS e IPS, filtro
// antifalsificação, inspeção de ARP, SYN cookies, DNSSEC, TLS, VPN, WPA3, PGP, sandbox). Tudo dentro do jogo.
import { describe, expect, it } from 'vitest';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../src/motor/mundo';
import { Terminal } from '../src/motor/cli';
import { acoesEquip, executarAcao, padroes } from '../src/motor/acoes';
import { temSeguranca } from '../src/motor/cliSeguranca';
import { avaliarFirewall, lerRegra, novoFirewall, novoIds, inspecionarPacote } from '../src/motor/filtro';
import { quebrarAperto, cadeiaDoServidor, conferirCadeia, apertoTls, decifrarRegistro, cifrarRegistro, protegerMensagem, abrirMensagem } from '../src/motor/seguranca';
import { lerCidr, lerIp } from '../src/motor/util';
import type { Dia } from '../src/conteudo/tipos';
import { mundoAplicacao, rodar } from './mundoAplicacao';

const TRAVESSAO = /[—–]/;
const ip = (s: string) => lerIp(s)!;

describe('peças puras', () => {
  it('firewall: primeira regra que casa decide; estado reconhece a volta da conversa', () => {
    const fw = novoFirewall();
    fw.padrao = 'negar';
    const r = lerRegra(['permitir', 'tcp', 'de', '192.168.1.0/24', 'porta', '80']);
    expect(typeof r).toBe('object');
    fw.regras.push({ ...(r as object), id: 1, contador: 0 } as never);
    const ida = { origem: ip('192.168.1.10'), destino: ip('203.0.113.10'), protocolo: 6, portaOrigem: 49152, portaDestino: 80, flags: 'SYN' };
    const volta = { origem: ip('203.0.113.10'), destino: ip('192.168.1.10'), protocolo: 6, portaOrigem: 80, portaDestino: 49152, flags: 'SYN+ACK' };
    expect(avaliarFirewall(fw, ida, 'p1').acao).toBe('permitir');
    expect(avaliarFirewall(fw, volta, 'p2')).toMatchObject({ acao: 'negar', por: 'padrao', estabelecida: true });
    fw.comEstado = true;
    expect(avaliarFirewall(fw, volta, 'p2')).toMatchObject({ acao: 'permitir', por: 'estado' });
    expect(lerRegra(['negar', 'icmp', 'porta', '80'])).toMatch(/ICMP não tem porta/);
  });

  it('IDS: varredura dispara no limiar; IPS passa a bloquear a origem', () => {
    const ids = novoIds('ips');
    ids.limiarVarredura = 5;
    let ultimo = { bloquear: false } as ReturnType<typeof inspecionarPacote>;
    for (let p = 20; p < 25; p++) ultimo = inspecionarPacote(ids, { origem: ip('192.168.1.10'), destino: ip('203.0.113.10'), protocolo: 6, portaDestino: p, flags: 'SYN' });
    expect(ultimo.bloquear).toBe(true);
    expect(ids.alertas[0]).toMatchObject({ nome: 'varredura de portas', acao: 'bloqueio' });
    expect(inspecionarPacote(ids, { origem: ip('192.168.1.10'), destino: ip('203.0.113.10'), protocolo: 6, portaDestino: 80 }).bloquear).toBe(true);
  });

  it('cadeia de certificados e TLS: válido passa, vencido e autoassinado não; o registro cifrado volta com a chave', () => {
    expect(conferirCadeia('www.loja.exemplo', cadeiaDoServidor('www.loja.exemplo', 'valido', 200), 200).valida).toBe(true);
    expect(conferirCadeia('www.loja.exemplo', cadeiaDoServidor('www.loja.exemplo', 'vencido', 200), 200).motivo).toBe('vencido');
    expect(conferirCadeia('www.loja.exemplo', cadeiaDoServidor('www.loja.exemplo', 'autoassinado', 200), 200).motivo).toBe('raiz-desconhecida');
    expect(conferirCadeia('www.loja.exemplo', cadeiaDoServidor('www.loja.exemplo', 'nome-errado', 200), 200).motivo).toBe('nome');
    expect(conferirCadeia('www.loja.exemplo', cadeiaDoServidor('www.loja.exemplo', 'revogado', 200), 200, true).motivo).toBe('revogado');
    const t = apertoTls(novoMundo(3), 'www.loja.exemplo', 'valido');
    expect(t.ok).toBe(true);
    const hex = cifrarRegistro(t.chave, 'GET /conta?senha=123 HTTP/1.1');
    expect(hex).not.toMatch(/senha/);
    expect(decifrarRegistro(t.chave, hex)).toBe('GET /conta?senha=123 HTTP/1.1');
  });

  it('PGP: só o destinatário abre, e a assinatura confere', () => {
    const p = protegerMensagem(novoMundo(4), 'bia@escola.exemplo', 'contato@loja.exemplo', 'Pagamento amanhã');
    expect(p.blindado).toMatch(/BEGIN PGP MESSAGE/);
    expect(p.blindado).not.toMatch(/Pagamento/);
    expect(abrirMensagem(p.blindado, 'contato@loja.exemplo')).toMatchObject({ ok: true, texto: 'Pagamento amanhã', assinaturaValida: true });
    expect(abrirMensagem(p.blindado, 'outra@loja.exemplo').ok).toBe(false);
  });

  it('Wi-Fi: senha de dicionário cai a partir do aperto de mão; WPA3 não deixa testar fora do ar', () => {
    const r = quebrarAperto({ ssid: 'X', seguranca: 'wpa3', macAp: 'a', macCliente: 'b', anonce: '1', snonce: '2', mic: '' }, ['senha123']);
    expect(r.senha).toBeUndefined();
  });
});

describe('ataques e defesas no mundo', () => {
  it('varredura acha as portas abertas; com firewall de política negar, o resto vira filtrado', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'ana', ['varrer 203.0.113.10']);
    expect(TRAVESSAO.test(s)).toBe(false);
    expect(m.flags.ataque).toMatchObject({ tipo: 'varredura', alvo: '203.0.113.10' });
    expect(m.flags.ataque.abertas).toEqual(expect.arrayContaining([53, 80]));
    expect(m.flags.ataque.filtradas).toBe(0);
    rodar(t, 'r2', ['firewall regra permitir tcp para 203.0.113.10 porta 80', 'firewall estado on', 'firewall padrao negar']);
    rodar(t, 'ana', ['varrer 203.0.113.10']);
    expect(m.flags.ataque.abertas).toEqual([80]);
    expect(m.flags.ataque.filtradas).toBe(15);
    expect(m.flags.firewall).toMatchObject({ roteador: 'r2', padrao: 'negar', comEstado: true });
  });

  it('firewall com estado: sem ele a resposta não volta; com ele volta, e quem vem de fora continua barrado', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r1', ['firewall regra permitir de 192.168.1.0/24', 'firewall padrao negar']);
    rodar(t, 'ana', ['navegar http://203.0.113.10/']);
    expect(m.flags.http).toMatchObject({ ok: false, motivo: 'sem caminho' });
    rodar(t, 'r1', ['firewall']);
    expect(m.flags.firewall.contadores.negados).toBeGreaterThan(0);
    rodar(t, 'r1', ['firewall estado on']);
    rodar(t, 'ana', ['navegar http://www.loja.exemplo/']);
    expect(m.flags.http).toMatchObject({ ok: true, estado: 200 });
    rodar(t, 'ana', ['escutar tcp 22']);
    const f = rodar(t, 'caio', ['conectar 192.168.1.10 22']);
    expect(f).toMatch(/firewall/);
    expect(m.flags.conexao.resultado).toBe('sem resposta');
  });

  it('IDS alerta a varredura e a senha em claro; IPS bloqueia a origem; HTTPS passa sem o IDS ler', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r2', ['ids ids']);
    rodar(t, 'ana', ['varrer 203.0.113.10 1-30']);
    expect(m.flags.ataque.alertas).toBeGreaterThan(0);
    expect(m.flags.ataque.filtradas).toBe(0);
    rodar(t, 'bia', ['navegar http://www.loja.exemplo/?usuario=bia&senha=123']);
    expect(m.flags.http.ok).toBe(true);
    const al = rodar(t, 'r2', ['ids alertas']);
    expect(al).toMatch(/varredura de portas/);
    expect(al).toMatch(/senha em texto claro/);
    rodar(t, 'r2', ['ids ips']);
    rodar(t, 'loja', ['servico web https on']);
    rodar(t, 'bia', ['navegar https://www.loja.exemplo/?usuario=bia&senha=123']);
    expect(m.flags.http.ok).toBe(true);
    rodar(t, 'bia', ['navegar http://www.loja.exemplo/?senha=123']);
    expect(m.flags.http).toMatchObject({ ok: false, motivo: 'ips' });
    rodar(t, 'r2', ['ids']);
    expect(m.flags.ids.bloqueados).toContain('192.168.1.11');
    rodar(t, 'bia', ['navegar http://www.loja.exemplo/']);
    expect(m.flags.http.ok).toBe(false);
  });

  it('farejar num hub mostra a senha do HTTP; com HTTPS fica ilegível', () => {
    const m = mundoAplicacao({ hub: true });
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'bia', ['navegar http://www.loja.exemplo/login?usuario=bia&senha=Gato123']);
    const s = rodar(t, 'espiao', ['farejar']);
    expect(s).toMatch(/hub/);
    expect(m.flags.farejar.segredos).toContain('senha=Gato123');
    const m2 = mundoAplicacao({ hub: true });
    const t2 = new Terminal(m2, {} as Dia);
    rodar(t2, 'loja', ['servico web https on']);
    rodar(t2, 'bia', ['navegar https://www.loja.exemplo/login?usuario=bia&senha=Gato123']);
    expect(m2.flags.tls).toMatchObject({ ok: true, legivel: false, versao: '1.3' });
    const s2 = rodar(t2, 'espiao', ['farejar']);
    expect(s2).not.toMatch(/Gato123/);
    expect(m2.flags.farejar.cifrados).toBeGreaterThan(0);
    expect(m2.flags.farejar.segredos).toEqual([]);
  });

  it('num switch comum o farejador não vê nada; com ARP falso vira homem no meio; ARP estático e inspeção defendem', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'bia', ['navegar http://www.loja.exemplo/?senha=um']);
    rodar(t, 'espiao', ['farejar']);
    expect(m.flags.farejar.quadros).toBe(0);
    rodar(t, 'espiao', ['arp-falso 192.168.1.11 192.168.1.1']);
    expect(m.flags.ataque).toMatchObject({ tipo: 'arp', ok: true, ambosSentidos: true, repassa: true });
    expect(rodar(t, 'bia', ['mostra arp'])).toMatch(new RegExp(m.equipamentos.get('espiao')!.mac));
    rodar(t, 'bia', ['navegar http://www.loja.exemplo/?senha=dois']);
    expect(m.flags.http.ok).toBe(true);
    rodar(t, 'espiao', ['farejar']);
    expect(m.flags.farejar.segredos).toContain('senha=dois');
    // Descartando em vez de repassar, a vítima fica sem rede.
    rodar(t, 'espiao', ['parar-ataque', 'arp-falso 192.168.1.11 192.168.1.1 derrubar']);
    rodar(t, 'bia', ['navegar http://203.0.113.10/']);
    expect(m.flags.http.ok).toBe(false);
    rodar(t, 'espiao', ['parar-ataque']);
    rodar(t, 'bia', ['navegar http://203.0.113.10/']);
    expect(m.flags.http.ok).toBe(true);
    rodar(t, 'bia', ['arp-estatico 192.168.1.1']);
    rodar(t, 'espiao', ['arp-falso 192.168.1.11 192.168.1.1']);
    expect(m.flags.ataque.ok).toBe(false);
    expect(m.flags.defesaArp).toMatchObject({ tipo: 'estatico', bloqueou: true });
    rodar(t, 'sw', ['inspecao-arp on']);
    rodar(t, 'espiao', ['arp-falso 192.168.1.10 192.168.1.1']);
    expect(m.flags.ataque.ok).toBe(false);
    expect(m.flags.defesaArp).toMatchObject({ tipo: 'inspecao', switch: 'sw', bloqueou: true });
  });

  it('inundação de SYN enche a fila e o cliente de verdade não entra; SYN cookies resolvem', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'loja', ['servicos']);
    rodar(t, 'ana', ['inundar 203.0.113.10 80 1000']);
    expect(m.flags.ataque).toMatchObject({ tipo: 'syn', cheia: true, backlog: 128, meiasAbertas: 128, synCookies: false });
    expect(rodar(t, 'loja', ['soquetes'])).toMatch(/SYN_RCVD/);
    const c = rodar(t, 'bia', ['conectar 203.0.113.10 80']);
    expect(c).toMatch(/fila de conexões meio abertas está cheia/);
    expect(m.flags.conexao.resultado).toBe('sem resposta');
    rodar(t, 'loja', ['syncookies on']);
    rodar(t, 'bia', ['conectar 203.0.113.10 80', 'fechar']);
    expect(m.flags.conexao.resultado).toBe('aberta');
    rodar(t, 'ana', ['inundar 203.0.113.10 80 1000']);
    expect(m.flags.ataque).toMatchObject({ cheia: false, meiasAbertas: 0, synCookies: true });
  });

  it('DDoS satura o enlace; IPS para a inundação de uma origem só, mas não a de origens falsificadas', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'ana', ['ddos 203.0.113.10 80 1000 100']);
    expect(m.flags.ataque).toMatchObject({ tipo: 'ddos', zumbis: 1000, capacidadeMbps: 10 });
    expect(m.flags.ataque.ocupacao).toBeGreaterThan(1);
    expect(m.flags.ataque.perdaLegitima).toBeGreaterThan(0.5);
    rodar(t, 'ana', ['parar-ataque']);
    rodar(t, 'r1', ['ids ips']);
    rodar(t, 'ana', ['inundar 203.0.113.10 80 1000']);
    expect(m.flags.ataque).toMatchObject({ chegou: false, bloqueadoPor: 'r1' });
    rodar(t, 'r1', ['ids desbloquear tudo']);
    rodar(t, 'ana', ['inundar 203.0.113.10 80 1000 falsificado']);
    expect(m.flags.ataque).toMatchObject({ chegou: true, cheia: true });
  });

  it('IP falsificado chega e a resposta vai para outro; o filtro antifalsificação barra na saída', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'ana', ['ip-falso 198.51.100.99 203.0.113.10 80']);
    expect(s).toMatch(/nunca vê a resposta/);
    expect(m.flags.ataque).toMatchObject({ tipo: 'ip-falso', entregue: true });
    rodar(t, 'r1', ['antifalsificacao on']);
    rodar(t, 'ana', ['ip-falso 198.51.100.99 203.0.113.10 80']);
    expect(m.flags.ataque).toMatchObject({ entregue: false, bloqueadoPor: 'r1' });
    rodar(t, 'ana', ['navegar http://www.loja.exemplo/']);
    expect(m.flags.http.ok).toBe(true);
  });

  it('envenenamento de DNS: sem DNSSEC o resolvedor guarda o endereço falso; com zona assinada e validação, rejeita', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'loja', ['servico dns dnssec on']);
    rodar(t, 'dns1', ['servico dns validar on']);
    rodar(t, 'espiao', ['envenenar-dns 192.168.1.53 www.loja.exemplo 198.51.100.66']);
    expect(m.flags.ataque).toMatchObject({ tipo: 'dns', envenenado: false, rejeitadaPorDnssec: true });
    expect(m.flags.dnssec).toMatchObject({ assinada: true, validar: true, rejeitada: true });
    rodar(t, 'ana', ['dig www.loja.exemplo']);
    expect(m.flags.dns).toMatchObject({ respostas: ['203.0.113.10'], dnssec: 'validada' });
    rodar(t, 'dns1', ['servico dns validar off', 'servico dns cache limpar']);
    rodar(t, 'espiao', ['envenenar-dns 192.168.1.53 www.loja.exemplo 198.51.100.66']);
    expect(m.flags.ataque.envenenado).toBe(true);
    rodar(t, 'ana', ['dig www.loja.exemplo']);
    expect(m.flags.dns).toMatchObject({ respostas: ['198.51.100.66'], forjado: true, origem: 'cache' });
    // Com a validação de volta, a resposta forjada que já estava no cache é descartada.
    rodar(t, 'dns1', ['servico dns validar on']);
    rodar(t, 'ana', ['dig www.loja.exemplo']);
    expect(m.flags.dns).toMatchObject({ codigo: 'SERVFAIL', dnssec: 'rejeitada' });
    // Portas aleatórias: as respostas forjadas não acertam.
    rodar(t, 'dns1', ['servico dns validar off', 'servico dns cache limpar', 'servico dns portas-aleatorias on']);
    rodar(t, 'espiao', ['envenenar-dns 192.168.1.53 www.loja.exemplo 198.51.100.66']);
    expect(m.flags.ataque.envenenado).toBe(false);
  });

  it('TLS: certificado vencido gera aviso e o navegador para; ignorar o aviso é escolha da pessoa', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'loja', ['servico web https vencido']);
    const s = rodar(t, 'ana', ['navegar https://www.loja.exemplo/']);
    expect(s).toMatch(/AVISO DO NAVEGADOR/);
    expect(TRAVESSAO.test(s)).toBe(false);
    expect(m.flags.tls).toMatchObject({ ok: false, cadeia: 'vencido' });
    expect(m.flags.tls.motivo).toMatch(/vencido/);
    expect(m.flags.http).toMatchObject({ ok: false, motivo: 'certificado' });
    rodar(t, 'ana', ['navegar https://www.loja.exemplo/ ignorar-aviso']);
    expect(m.flags.http.ok).toBe(true);
    rodar(t, 'loja', ['servico web https autoassinado']);
    rodar(t, 'ana', ['navegar https://www.loja.exemplo/']);
    expect(m.flags.tls.cadeia).toBe('raiz-desconhecida');
  });

  it('PGP no correio: assinado e cifrado no servidor, aberto e conferido por quem recebe', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'caio', ['correio conta contato@loja.exemplo 203.0.113.25', 'pgp gerar']);
    const s = rodar(t, 'bia', ['correio conta bia@escola.exemplo 192.168.1.25', 'pgp gerar', 'correio enviar-seguro contato@loja.exemplo Notas | As notas saem amanhã.']);
    expect(s).toMatch(/Assina/);
    expect(m.flags.pgp).toMatchObject({ assinada: true, cifrada: true, entregue: true });
    const caixa = (m.equipamentos.get('correio')!.s._caixas as Record<string, { corpo: string }[]>)['contato@loja.exemplo']!;
    expect(caixa[0]!.corpo).not.toMatch(/notas saem/);
    const l = rodar(t, 'caio', ['correio ler']);
    expect(l).toMatch(/As notas saem amanhã/);
    expect(m.flags.pgp.lida).toMatchObject({ por: 'contato@loja.exemplo', assinaturaValida: true });
  });
});

/** Duas filiais com rede privada, ligadas por um roteador da internet (r0) que não conhece as redes privadas. */
function mundoVpn(): Mundo {
  const m = novoMundo(21);
  adicionar(m, pc('a', { ip: lerCidr('192.168.1.10/24')!, gateway: '192.168.1.1' }));
  adicionar(m, pc('b', { ip: lerCidr('192.168.2.10/24')!, gateway: '192.168.2.1' }));
  adicionar(m, pc('olheiro', { ip: lerCidr('198.51.100.11/29')!, gateway: '198.51.100.9' }));
  adicionar(m, roteador('r1', { interfaces: { p1: '192.168.1.1/24', p2: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('r0', { interfaces: { p1: '198.51.100.2/30', p2: '198.51.100.9/29' } }));
  adicionar(m, roteador('r3', { interfaces: { p1: '198.51.100.10/29', p2: '192.168.2.1/24' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.9' }] }));
  adicionar(m, comutador('hubwan', { tipo: 'hub', portas: 4 }));
  ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r0', porta: 'p1' }, 'cat6', 50);
  ligar(m, { equip: 'r0', porta: 'p2' }, { equip: 'hubwan', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'hubwan', porta: 'p2' }, { equip: 'r3', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'olheiro', porta: 'eth0' }, { equip: 'hubwan', porta: 'p3' }, 'cat6', 5);
  ligar(m, { equip: 'r3', porta: 'p2' }, { equip: 'b', porta: 'eth0' }, 'cat6', 5);
  m.equipamentos.get('b')!.s.servicos = { web: { paginas: { '/': { conteudo: 'Relatório interno da filial' } } } };
  return m;
}

describe('VPN entre dois roteadores', () => {
  it('sem túnel a rede privada não atravessa; com o túnel dos dois lados, passa cifrada, com MTU menor', () => {
    const m = mundoVpn();
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'a', ['ping 192.168.2.10 1'])).toMatch(/morreu em r0|inalcançável/);
    rodar(t, 'r1', ['vpn filial 198.51.100.10 192.168.1.0/24 192.168.2.0/24 Segredo-da-filial-2026']);
    expect(m.flags.vpn).toMatchObject({ ativo: false });
    rodar(t, 'r3', ['vpn matriz 198.51.100.1 192.168.2.0/24 192.168.1.0/24 Segredo-da-filial-2026']);
    expect(m.flags.vpn).toMatchObject({ ativo: true, mtuEfetivo: 1427 });
    const p = rodar(t, 'a', ['ping 192.168.2.10 2']);
    expect(p).toMatch(/ttl=/);
    rodar(t, 'r1', ['vpn']);
    expect(m.flags.vpn.cifrados).toBeGreaterThan(0);
    const cap = rodar(t, 'r1', ['vpn captura']);
    expect(cap).toMatch(/protocolo 50 \(ESP\)/);
    expect(m.flags.vpn.captura).toMatchObject({ protocolo: 50, legivel: false });
    // O pacote grande com DF não cabe mais: 1472 + 28 + 73 passa de 1500.
    expect(rodar(t, 'a', ['ping 192.168.2.10 1 1472 df'])).toMatch(/MTU do próximo salto 1427/);
    expect(rodar(t, 'a', ['ping 192.168.2.10 1 1399 df'])).toMatch(/ttl=/);
    // Quem está no meio, num hub do provedor, só vê ESP.
    rodar(t, 'a', ['resolvedor 192.168.1.1', 'navegar http://192.168.2.10/']);
    expect(m.flags.http).toMatchObject({ ok: true, servidor: 'b' });
    const f = rodar(t, 'olheiro', ['farejar']);
    expect(f).toMatch(/ESP/);
    expect(f).not.toMatch(/Relatório interno/);
  });

  it('segredo diferente: o IKE não fecha e nada passa', () => {
    const m = mundoVpn();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'r1', ['vpn filial 198.51.100.10 192.168.1.0/24 192.168.2.0/24 um']);
    rodar(t, 'r3', ['vpn matriz 198.51.100.1 192.168.2.0/24 192.168.1.0/24 outro']);
    expect(m.flags.vpn.motivo).toMatch(/segredo/);
    expect(rodar(t, 'a', ['ping 192.168.2.10 1'])).toMatch(/morreu em r0|inalcançável/);
  });
});

describe('Wi-Fi no mundo', () => {
  function mundoWifi(): Mundo {
    const m = mundoAplicacao();
    adicionar(m, aparelho('ap1', 'ap', 'Ponto de acesso', [{ nome: 'p1' }], { canal: 6 }));
    return m;
  }

  it('WPA2 com senha fraca: desautentica, captura o aperto de mão e o dicionário acha a senha', () => {
    const m = mundoWifi();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'ap1', ['wifi LAB-Visitantes wpa2 senha123']);
    expect(rodar(t, 'bia', ['wifi conectar LAB-Visitantes senha123'])).toMatch(/4 vias/);
    expect(m.flags.wifi).toMatchObject({ conectado: true, seguranca: 'wpa2' });
    rodar(t, 'espiao', ['wifi desautenticar LAB-Visitantes', 'wifi capturar LAB-Visitantes', 'wifi quebrar LAB-Visitantes']);
    expect(m.flags.wifi.quebra).toMatchObject({ senha: 'senha123', seguranca: 'wpa2' });
    expect(m.flags.ataque).toMatchObject({ tipo: 'wifi', quebrada: true });
  });

  it('senha longa não está no dicionário; WPA3 nem deixa tentar', () => {
    const m = mundoWifi();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'ap1', ['wifi LAB wpa2 cavalo bateria grampo correto']);
    rodar(t, 'bia', ['wifi conectar LAB cavalo bateria grampo correto']);
    rodar(t, 'espiao', ['wifi capturar LAB', 'wifi quebrar LAB']);
    expect(m.flags.wifi.quebra.senha).toBeNull();
    rodar(t, 'ap1', ['wifi LAB wpa3 senha123']);
    rodar(t, 'bia', ['wifi conectar LAB senha123']);
    expect(m.flags.wifi.conectado).toBe(true);
    const s = rodar(t, 'espiao', ['wifi desautenticar LAB', 'wifi capturar LAB', 'wifi quebrar LAB']);
    expect(s).toMatch(/quadros de gerência protegidos/);
    expect(m.flags.wifi.quebra).toMatchObject({ seguranca: 'wpa3', senha: null });
  });
});

describe('calculadora, sandbox, console e menu', () => {
  it('a calculadora de criptografia grava em m.flags.cripto', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'ana', ['rsa 61 53 65']);
    expect(m.flags.cripto).toMatchObject({ op: 'rsa', n: '3233', decifrado: '65' });
    rodar(t, 'ana', ['cesar 3 ATAQUE']);
    expect(m.flags.cripto.resultado).toBe('DWDTXH');
    rodar(t, 'ana', ['quebrar-cesar WRGR PXQGR VDEH TXH D UHGH WHP FDPDGDV']);
    expect(m.flags.cripto.chave).toBe(3);
    rodar(t, 'ana', ['kerberos ana certa errada']);
    expect(m.flags.cripto).toMatchObject({ op: 'kerberos', sucesso: false });
    rodar(t, 'ana', ['verificar-cadeia www.loja.exemplo revogado']);
    expect(m.flags.cripto).toMatchObject({ valida: false, motivo: 'revogado' });
    rodar(t, 'ana', ['dh 6 15 13']);
    expect(m.flags.cripto.op).toBe('dh-homem-no-meio');
    rodar(t, 'ana', ['sha256 abc', 'assinar pago 100']);
    expect(m.flags.cripto).toMatchObject({ op: 'assinar', confere: true });
    rodar(t, 'ana', ['executar jogo-gratis sandbox']);
    expect(m.flags.sandbox.bloqueadas.length).toBeGreaterThan(2);
    rodar(t, 'ana', ['executar jogo-gratis direto']);
    expect(m.flags.sandbox.bloqueadas).toEqual([]);
  });

  it('sem flag, nada aparece; com m.flags.seguranca, ajuda e ações de PC, roteador e switch aparecem e todas rodam', () => {
    const m0 = mundoAplicacao();
    expect(temSeguranca(m0)).toBe(false);
    expect(acoesEquip(m0, m0.equipamentos.get('ana')!).some((a) => a.id.startsWith('sg-'))).toBe(false);
    const m = mundoAplicacao();
    m.flags.seguranca = true;
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'ana', ['?'])).toMatch(/segurança de rede/);
    expect(rodar(t, 'r1', ['?'])).toMatch(/firewall/);
    for (const alvo of ['ana', 'r1', 'sw']) {
      const ids = acoesEquip(m, m.equipamentos.get(alvo)!).map((a) => a.id);
      expect(new Set(ids).size, alvo).toBe(ids.length);
      for (const a of acoesEquip(m, m.equipamentos.get(alvo)!)) {
        if (!a.id.startsWith('sg-')) continue;
        const m2 = mundoAplicacao();
        m2.flags.seguranca = true;
        const t2 = new Terminal(m2, {} as Dia);
        const saida = executarAcao(t2, a, padroes(a)).flatMap((x) => x.saida).join('\n');
        expect(saida, a.id).not.toMatch(/desconhecido|não entendi/i);
        expect(TRAVESSAO.test(saida), a.id).toBe(false);
      }
    }
    const ids = acoesEquip(m, m.equipamentos.get('ana')!).map((a) => a.id);
    for (const id of ['sg-varrer', 'sg-farejar', 'sg-arp-falso', 'sg-inundar', 'sg-ddos', 'sg-envenenar-dns', 'sg-wifi-quebrar', 'sg-rsa', 'sg-kerberos', 'sg-sandbox']) expect(ids).toContain(id);
    const rids = acoesEquip(m, m.equipamentos.get('r1')!).map((a) => a.id);
    for (const id of ['sg-fw-regra', 'sg-fw-estado', 'sg-ids', 'sg-vpn', 'sg-antifalsificacao', 'sg-bgp-sequestro']) expect(rids).toContain(id);
  });
});

describe('porta espelhada e ping pelo firewall', () => {
  it('a porta espelhada do switch vê o tráfego dos outros; o firewall também julga o ping (ICMP com estado)', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'sw', ['espelhar p5']);
    expect(m.flags.espelho).toMatchObject({ switch: 'sw', porta: 'p5' });
    rodar(t, 'bia', ['navegar http://www.loja.exemplo/?senha=espelhada']);
    rodar(t, 'espiao', ['farejar']);
    expect(m.flags.farejar.segredos).toContain('senha=espelhada');
    expect(m.flags.farejar.como).toMatch(/espelha/);
    rodar(t, 'r1', ['firewall regra permitir icmp de 192.168.1.0/24', 'firewall padrao negar']);
    expect(rodar(t, 'ana', ['ping 203.0.113.10 1'])).toMatch(/firewall/);
    rodar(t, 'r1', ['firewall estado on']);
    expect(rodar(t, 'ana', ['ping 203.0.113.10 1'])).toMatch(/ttl=/);
    expect(rodar(t, 'caio', ['ping 192.168.1.10 1'])).toMatch(/firewall/);
  });
});
