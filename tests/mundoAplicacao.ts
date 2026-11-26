// Mundo de teste dos atos 6 e 7: rede de dentro com resolvedor e correio, rede pública com loja e correio da loja.
import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../src/motor/mundo';
import type { Terminal } from '../src/motor/cli';
import { lerCidr } from '../src/motor/util';

/**
 * Rede de dentro (192.168.1.0/24, switch sw): ana, bia, dns1 (resolvedor recursivo e autoritativo de escola.exemplo)
 * e mxesc (correio da escola). r1 liga a rede ao enlace com r2 (10 Mb/s, o gargalo); atrás do r2, a rede pública
 * 203.0.113.0/24 com loja (DNS e web de loja.exemplo), correio (correio da loja) e caio.
 */
export function mundoAplicacao(o: { hub?: boolean } = {}): Mundo {
  const m = novoMundo(11);
  const host = (nome: string, ip: string, gw: string) => adicionar(m, pc(nome, { ip: lerCidr(ip)!, gateway: gw }));
  host('ana', '192.168.1.10/24', '192.168.1.1');
  host('bia', '192.168.1.11/24', '192.168.1.1');
  host('dns1', '192.168.1.53/24', '192.168.1.1');
  host('mxesc', '192.168.1.25/24', '192.168.1.1');
  host('espiao', '192.168.1.66/24', '192.168.1.1');
  host('loja', '203.0.113.10/24', '203.0.113.1');
  host('correio', '203.0.113.25/24', '203.0.113.1');
  host('caio', '203.0.113.30/24', '203.0.113.1');
  const r1 = adicionar(m, roteador('r1', { interfaces: { p1: '192.168.1.1/24', p2: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('r2', { interfaces: { p1: '198.51.100.2/30', p2: '203.0.113.1/24' }, rotas: [{ destino: '192.168.1.0/24', via: '198.51.100.1' }] }));
  adicionar(m, comutador('sw', { portas: 8, tipo: o.hub ? 'hub' : 'switch' }));
  adicionar(m, comutador('sw2', { portas: 8 }));
  r1.portas.find((p) => p.nome === 'p2')!.velocidades = [10];
  ['ana', 'bia', 'dns1', 'mxesc', 'espiao'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw', porta: `p${i + 1}` }, 'cat6', 5));
  ligar(m, { equip: 'sw', porta: 'p8' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r2', porta: 'p1' }, 'cat6', 90);
  ligar(m, { equip: 'r2', porta: 'p2' }, { equip: 'sw2', porta: 'p8' }, 'cat6', 5);
  ['loja', 'correio', 'caio'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw2', porta: `p${i + 1}` }, 'cat6', 5));
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('loja').servicos = {
    dns: {
      zona: 'loja.exemplo',
      registros: [
        { nome: 'www', tipo: 'A', valor: '203.0.113.10', ttl: 300 },
        { nome: 'video', tipo: 'A', valor: '203.0.113.10', ttl: 300 },
        { nome: 'site', tipo: 'CNAME', valor: 'www', ttl: 600 },
        { nome: '@', tipo: 'MX', valor: 'correio', prioridade: 10, ttl: 3600 },
        { nome: '@', tipo: 'MX', valor: 'reserva', prioridade: 20, ttl: 3600 },
        { nome: 'correio', tipo: 'A', valor: '203.0.113.25', ttl: 3600 },
        { nome: 'reserva', tipo: 'A', valor: '203.0.113.26', ttl: 3600 },
      ],
    },
    web: { paginas: { '/': { conteudo: '<h1>Loja do laboratório</h1>' } } },
    streaming: { videos: { aula: { taxa: 12000, duracao: 30 }, leve: { taxa: 2000, duracao: 30 } } },
  };
  s('dns1').servicos = { dns: { zona: 'escola.exemplo', recursivo: true, registros: [{ nome: '@', tipo: 'MX', valor: 'mx', prioridade: 5 }, { nome: 'mx', tipo: 'A', valor: '192.168.1.25' }] } };
  s('mxesc').servicos = { correio: { dominio: 'escola.exemplo' } };
  s('correio').servicos = { correio: { dominio: 'loja.exemplo', caixas: ['contato'] } };
  for (const n of ['ana', 'bia', 'mxesc', 'espiao']) s(n).dns = '192.168.1.53';
  for (const n of ['loja', 'correio', 'caio']) s(n).dns = '192.168.1.53';
  return m;
}

export function rodar(t: Terminal, nome: string, cmds: string[]): string {
  t.executar(`console ${nome}`);
  const s = cmds.map((c) => t.executar(c).join('\n')).join('\n');
  t.executar('sair');
  return s;
}
