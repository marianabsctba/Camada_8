// Camada de aplicação ligada ao mundo (ato 6): servidores do laboratório rodando DNS, web, correio, streaming e CDN,
// e o PC usando tudo pelo caminho real (resolvedor com cache, navegador com 304 e cookies, correio pelo MX,
// vídeo que trava com banda baixa), mais console, ações e as flags que os dias conferem.
import { describe, expect, it } from 'vitest';
import { adicionar, novoMundo, pc } from '../src/motor/mundo';
import { mundoAplicacao, rodar } from './mundoAplicacao';
import { Terminal } from '../src/motor/cli';
import { acoesEquip, executarAcao, padroes } from '../src/motor/acoes';
import { espacoDoMundo, temAplicacao } from '../src/motor/cliAplicacao';
import { arvoreDeNomes } from '../src/motor/aplicacao';
import { lerCidr } from '../src/motor/util';
import type { Dia } from '../src/conteudo/tipos';

const TRAVESSAO = /[—–]/;

describe('DNS no mundo', () => {
  it('o espaço de nomes sai dos servidores do laboratório, com raiz e topo de fora e a delegação feita sozinha', () => {
    const e = espacoDoMundo(mundoAplicacao());
    const arv = arvoreDeNomes(e.espaco).join('\n');
    expect(arv).toMatch(/^\. \(raiz/);
    expect(arv).toMatch(/exemplo\. \(domínio de topo/);
    expect(arv).toMatch(/loja\.exemplo\. .*ns1\.loja\.exemplo\. 203\.0\.113\.10/);
    expect(arv).toMatch(/escola\.exemplo\. .*192\.168\.1\.53/);
  });

  it('dig pelo resolvedor: a primeira vai da raiz ao autoritativo, a segunda vem do cache, e o TTL vence', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const s1 = rodar(t, 'ana', ['dig www.loja.exemplo']);
    expect(TRAVESSAO.test(s1)).toBe(false);
    expect(m.flags.dns).toMatchObject({ ok: true, origem: 'rede', respostas: ['203.0.113.10'], resolvedor: 'dns1', codigo: 'NOERROR' });
    expect(m.flags.dns.consultas).toBe(3);
    expect(s1).toMatch(/Começa pela raiz/);
    rodar(t, 'bia', ['dig www.loja.exemplo']);
    expect(m.flags.dns).toMatchObject({ origem: 'cache', consultas: 0, de: 'bia' });
    rodar(t, 'ana', ['esperar 301', 'dig www.loja.exemplo']);
    // O A venceu (TTL 300), mas o NS de loja.exemplo ainda vale: pula direto para o autoritativo.
    expect(m.flags.dns).toMatchObject({ origem: 'rede', consultas: 1 });
    const mx = rodar(t, 'ana', ['dig loja.exemplo MX', 'dig site.loja.exemplo', 'nslookup naoexiste.loja.exemplo']);
    expect(mx).toMatch(/MX\s+10 correio\.loja\.exemplo\./);
    expect(m.flags.dns.codigo).toBe('NXDOMAIN');
  });

  it('sem resolvedor, ou com o resolvedor sem ninguém na porta 53, a consulta falha e diz por quê', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    delete m.equipamentos.get('ana')!.s.dns;
    expect(rodar(t, 'ana', ['dig www.loja.exemplo'])).toMatch(/Sem resolvedor/);
    expect(rodar(t, 'ana', ['resolvedor 192.168.1.11', 'dig www.loja.exemplo'])).toMatch(/porta inalcançável/);
  });
});

describe('web no mundo', () => {
  it('navegar: DNS, TCP, 200 com cookie; na segunda, If-None-Match e 304; página nova, 200 de novo', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'ana', ['navegar http://www.loja.exemplo/']);
    expect(TRAVESSAO.test(s)).toBe(false);
    expect(s).toMatch(/GET \/ HTTP\/1\.1/);
    expect(m.flags.http).toMatchObject({ ok: true, estado: 200, origem: 'rede', servidor: 'loja', ip: '203.0.113.10', enviouCookie: false });
    expect(m.flags.http.cookies.sessao).toBe('s1');
    rodar(t, 'ana', ['navegar http://www.loja.exemplo/']);
    expect(m.flags.http).toMatchObject({ estado: 304, origem: 'validado', enviouCookie: true, condicional: true });
    rodar(t, 'loja', ['servico web pagina / Promoção nova']);
    rodar(t, 'ana', ['navegar http://www.loja.exemplo/']);
    expect(m.flags.http).toMatchObject({ estado: 200, origem: 'rede' });
    // Com validade no cache, nem vai à rede.
    rodar(t, 'loja', ['servico web validade / 60']);
    rodar(t, 'ana', ['esperar 1', 'navegar http://www.loja.exemplo/', 'navegar http://www.loja.exemplo/']);
    expect(m.flags.http.origem).toBe('cache');
  });

  it('porta fechada dá RST, nome inexistente não carrega', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'ana', ['navegar http://www.loja.exemplo:8080/'])).toMatch(/RST/);
    expect(m.flags.http).toMatchObject({ ok: false, motivo: 'recusada' });
    rodar(t, 'ana', ['navegar http://nada.loja.exemplo/']);
    expect(m.flags.http.motivo).toBe('dns');
  });
});

describe('correio no mundo', () => {
  it('submissão, MX de menor número, SMTP entre servidores e dois Received; quem recebe lê por IMAP', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'bia', ['correio conta bia@escola.exemplo 192.168.1.25', 'correio enviar contato@loja.exemplo Pedido de cabos | Quero dois cabos de 5 metros.']);
    expect(TRAVESSAO.test(s)).toBe(false);
    expect(s).toMatch(/MX: 10 correio\.loja\.exemplo, 20 reserva\.loja\.exemplo\. Tenta/);
    expect(s).toMatch(/RCPT TO:<contato@loja\.exemplo>/);
    expect(m.flags.correio).toMatchObject({ entregue: true, mx: 'correio.loja.exemplo.', ipMx: '203.0.113.25', prioridade: 10, received: 2, destino: 'correio' });
    const l = rodar(t, 'caio', ['correio conta contato@loja.exemplo 203.0.113.25', 'correio ler']);
    expect(l).toMatch(/Assunto Pedido de cabos/);
    expect(l).toMatch(/Quero dois cabos/);
    expect(m.flags.correioLido).toMatchObject({ protocolo: 'imap', mensagens: 1, ficaNoServidor: true });
    rodar(t, 'caio', ['correio ler pop3']);
    rodar(t, 'caio', ['correio ler']);
    expect(m.flags.correioLido.mensagens).toBe(0);
  });

  it('caixa inexistente leva 550; com o MX principal fora do ar, tenta o de reserva', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'bia', ['correio conta bia@escola.exemplo 192.168.1.25', 'correio enviar ninguem@loja.exemplo Oi | teste']);
    expect(m.flags.correio.entregue).toBe(false);
    expect(m.flags.correio.tentativas[0].resultado).toBe('recusado');
    rodar(t, 'correio', ['parar tcp 25']);
    rodar(t, 'bia', ['correio enviar contato@loja.exemplo Oi | teste']);
    expect(m.flags.correio.entregue).toBe(false);
    expect(m.flags.correio.tentativas.map((x: { mx: string }) => x.mx)).toEqual(['correio.loja.exemplo.', 'reserva.loja.exemplo.']);
  });
});

describe('streaming, CDN e P2P no mundo', () => {
  it('assistir: o vídeo que pede mais que a banda do caminho trava; o leve toca liso', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'ana', ['assistir http://video.loja.exemplo/aula 2']);
    expect(TRAVESSAO.test(s)).toBe(false);
    expect(m.flags.streaming).toMatchObject({ ok: true, taxaKbps: 12000 });
    expect(m.flags.streaming.bandaKbps).toBeLessThan(10000);
    expect(m.flags.streaming.travamentos).toBeGreaterThan(0);
    rodar(t, 'ana', ['assistir http://video.loja.exemplo/leve 2']);
    expect(m.flags.streaming.travamentos).toBe(0);
    rodar(t, 'ana', ['assistir http://video.loja.exemplo/aula 2 adaptativo']);
    expect(m.flags.streaming.adaptativo).toBe(true);
    expect(m.flags.streaming.qualidadeMedia).toBeLessThan(12000);
  });

  it('CDN escolhe a borda mais perto e P2P registra enxame, comparação e DHT', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'loja', ['servico cdn São Paulo, Recife, Porto Alegre, Manaus']);
    rodar(t, 'ana', ['cdn video.loja.exemplo Curitiba']);
    expect(m.flags.cdn).toMatchObject({ cidade: 'Curitiba', borda: 'Porto Alegre' });
    rodar(t, 'ana', ['cdn simular 1000 5', 'p2p simular 6 12', 'p2p comparar 100 100 10', 'p2p dht aula.mp4']);
    expect(m.flags.cdn.simulacao.comCdn.trafegoEnlacePrincipal).toBeLessThan(m.flags.cdn.simulacao.semCdn.trafegoEnlacePrincipal);
    expect(m.flags.p2p.enxame.pares).toBe(6);
    expect(m.flags.p2p.comparacao.linhas[3].p2p).toBeLessThan(m.flags.p2p.comparacao.linhas[3].clienteServidor);
    expect(typeof m.flags.p2p.dht.responsavel).toBe('number');
  });
});

describe('console, menu e flags', () => {
  it('sem nada configurado, nada aparece; com m.flags.aplicacao, a ajuda e as ações aparecem e todas rodam', () => {
    const m0 = novoMundo(1);
    adicionar(m0, pc('x', { ip: lerCidr('192.0.2.10/24')! }));
    expect(temAplicacao(m0)).toBe(false);
    expect(acoesEquip(m0, m0.equipamentos.get('x')!).some((a) => a.id.startsWith('ap-'))).toBe(false);
    const t0 = new Terminal(m0, {} as Dia);
    expect(rodar(t0, 'x', ['?'])).not.toMatch(/camada de aplicação/);
    const m = mundoAplicacao();
    m.flags.aplicacao = true;
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'ana', ['?'])).toMatch(/camada de aplicação/);
    const ids = acoesEquip(m, m.equipamentos.get('ana')!).map((a) => a.id);
    for (const id of ['ap-resolvedor', 'ap-dig', 'ap-navegar', 'ap-navegar-https', 'ap-correio-conta', 'ap-correio-enviar', 'ap-correio-ler', 'ap-assistir', 'ap-cdn', 'ap-p2p', 'ap-servico-dns', 'ap-servico-web', 'ap-servico-correio']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of acoesEquip(m, m.equipamentos.get('ana')!)) {
      if (!a.id.startsWith('ap-')) continue;
      const m2 = mundoAplicacao();
      m2.flags.aplicacao = true;
      const t2 = new Terminal(m2, {} as Dia);
      const saida = executarAcao(t2, a, padroes(a)).flatMap((x) => x.saida).join('\n');
      expect(saida, a.id).not.toMatch(/desconhecido|não entendi/i);
      expect(TRAVESSAO.test(saida), a.id).toBe(false);
    }
  });
});
