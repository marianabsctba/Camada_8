// Camada de aplicação ligada ao mundo (ato 6): servidores do laboratório rodando DNS, web, correio, streaming e CDN,
// e o PC usando tudo pelo caminho real (resolvedor com cache, navegador com 304 e cookies, correio pelo MX,
// vídeo que trava com banda baixa), mais console, ações e as flags que os dias conferem.
import { describe, expect, it } from 'vitest';
import { adicionar, novoMundo, pc } from '../src/motor/mundo';
import { mundoAplicacao, rodar } from './mundoAplicacao';
import { Terminal } from '../src/motor/cli';
import { acoesEquip, executarAcao, padroes } from '../src/motor/acoes';
import { espacoDoMundo, temAplicacao } from '../src/motor/cliAplicacao';
import { arvoreDeNomes, atrasoMinimo, dataHttp, etagDe, lerDataHttp, Navegador, ServidorWeb, simularBuffer, vazaoNoTempo } from '../src/motor/aplicacao';
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
    expect(m.flags.p2p.dht).toMatchObject({ chave: 'aula.mp4', modo: 'anel', responsavel: 150, saltos: 3 });
    rodar(t, 'ana', ['p2p dht aula.mp4 xor']);
    expect(m.flags.p2p.dht).toMatchObject({ modo: 'xor', responsavel: 101 });
    expect(m.flags.p2p.dhtPor.anel.responsavel).toBe(150);
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

describe('HTTP: datas, validadores e cache', () => {
  it('data HTTP no formato IMF-fixdate a partir do relógio do mundo, e os formatos obsoletos também se leem', () => {
    expect(dataHttp(0)).toBe('Thu, 26 Nov 2026 12:00:00 GMT');
    expect(dataHttp(3661.7)).toBe('Thu, 26 Nov 2026 13:01:01 GMT');
    expect(dataHttp(86400 * 6)).toBe('Wed, 02 Dec 2026 12:00:00 GMT');
    expect(lerDataHttp('Thu, 26 Nov 2026 13:01:01 GMT')).toBe(3661);
    expect(lerDataHttp('Thursday, 26-Nov-26 12:00:10 GMT')).toBe(10);
    expect(lerDataHttp('Thu Nov 26 12:00:20 2026')).toBe(20);
    expect(lerDataHttp('ontem à tarde')).toBeNull();
  });

  it('If-Modified-Since compara datas; If-None-Match manda quando vem; data ilegível é ignorada', () => {
    const srv = new ServidorWeb('x').publicar('/', { tipo: 'estatico', conteudo: 'oi', modificado: 100 });
    const pedir = (cab: Record<string, string>) => srv.atender({ metodo: 'GET', caminho: '/', versao: 'HTTP/1.1', cabecalhos: cab, corpo: '' }, 500);
    const r = pedir({});
    expect(r.cabecalhos).toMatchObject({ 'Last-Modified': dataHttp(100), Date: dataHttp(500), ETag: etagDe('oi') });
    expect(pedir({ 'If-Modified-Since': dataHttp(100) }).estado).toBe(304);
    expect(pedir({ 'If-Modified-Since': dataHttp(99) }).estado).toBe(200);
    expect(pedir({ 'If-Modified-Since': 'não é data' }).estado).toBe(200);
    // Com If-None-Match, o If-Modified-Since não conta (RFC 9110, §13.1.3).
    expect(pedir({ 'If-None-Match': '"outro"', 'If-Modified-Since': dataHttp(400) }).estado).toBe(200);
    expect(pedir({ 'If-None-Match': `"zzz", W/${etagDe('oi')}` }).estado).toBe(304);
    expect(pedir({ 'If-None-Match': '*' }).estado).toBe(304);
  });

  it('servico web pagina: ETag novo só quando o conteúdo muda; o cache separa esquema e porta', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const igual = rodar(t, 'loja', ['servico web pagina / <h1>Loja do laboratório</h1>']);
    expect(igual).toMatch(/já estava com esse conteúdo/);
    expect(igual).not.toMatch(/ETag novo/);
    rodar(t, 'ana', ['navegar http://www.loja.exemplo/', 'navegar http://www.loja.exemplo/']);
    expect(m.flags.http.estado).toBe(304);
    rodar(t, 'loja', ['esperar 30']);
    const mudou = rodar(t, 'loja', ['servico web pagina / Promoção']);
    expect(mudou).toMatch(/ETag novo/);
    expect(mudou).toMatch(/Thu, 26 Nov 2026 12:00:30 GMT/);
    const s = rodar(t, 'ana', ['navegar http://www.loja.exemplo/']);
    expect(m.flags.http.estado).toBe(200);
    expect(s).toMatch(/If-Modified-Since: Thu, 26 Nov 2026 12:00:00 GMT/);
    expect(s).toMatch(/Last-Modified: Thu, 26 Nov 2026 12:00:30 GMT/);
    const nav = new Navegador();
    const srv = new ServidorWeb('w').publicar('/', { tipo: 'estatico', conteudo: 'a', maxAge: 60 });
    nav.buscar({ w: srv }, 'http://w/', 0);
    expect(nav.buscar({ w: srv }, 'http://w:80/', 1).origem).toBe('cache');
    expect(nav.buscar({ w: srv }, 'http://w:8080/', 1).origem).toBe('rede');
    expect(nav.buscar({ w: srv }, 'https://w/', 1).origem).toBe('rede');
  });
});

describe('DNS pelo menu: defesas, prioridade do MX, TXT com espaços e todos os nomes', () => {
  it('ações de DNSSEC, validação e portas aleatórias ligam as chaves certas', () => {
    const m = mundoAplicacao();
    m.flags.aplicacao = true;
    const t = new Terminal(m, {} as Dia);
    const acao = (eq: string, id: string, v: Record<string, string>) => executarAcao(t, acoesEquip(m, m.equipamentos.get(eq)!).find((a) => a.id === id)!, v).flatMap((x) => x.saida).join('\n');
    acao('loja', 'ap-servico-dns-dnssec', { v: 'on' });
    acao('dns1', 'ap-servico-dns-validar', { v: 'on' });
    acao('dns1', 'ap-servico-dns-portas', { v: 'on' });
    const dns = (n: string) => m.equipamentos.get(n)!.s.servicos.dns;
    expect(dns('loja').dnssec).toBe(true);
    expect(dns('dns1')).toMatchObject({ validar: true, portasAleatorias: true });
    // Validar e sortear porta é coisa de resolvedor; assinar, de quem tem zona.
    expect(acao('loja', 'ap-servico-dns-validar', { v: 'on' })).toMatch(/recursivo on/);
    expect(dns('loja').validar).toBeUndefined();
    const s = rodar(t, 'ana', ['dig www.loja.exemplo']);
    expect(m.flags.dns).toMatchObject({ dnssec: 'validada' });
    expect(s).toMatch(/RRSIG/);
  });

  it('MX com prioridade e TXT com espaços pelo menu; dig mostra o TXT entre aspas', () => {
    const m = mundoAplicacao();
    m.flags.aplicacao = true;
    const t = new Terminal(m, {} as Dia);
    const acao = (id: string, v: Record<string, string>) => executarAcao(t, acoesEquip(m, m.equipamentos.get('loja')!).find((a) => a.id === id)!, v).flatMap((x) => x.saida).join('\n');
    acao('ap-servico-dns-registro', { nome: '@', tipo: 'MX', valor: 'reserva2', ttl: '3600', prioridade: '5' });
    acao('ap-servico-dns-registro', { nome: '@', tipo: 'TXT', valor: 'v=spf1 mx -all "fim"', ttl: '300', prioridade: '' });
    const regs = m.equipamentos.get('loja')!.s.servicos.dns.registros as { tipo: string; valor: string; prioridade?: number }[];
    expect(regs.find((r) => r.valor === 'reserva2')?.prioridade).toBe(5);
    expect(regs.find((r) => r.tipo === 'TXT')?.valor).toBe('v=spf1 mx -all "fim"');
    const s = rodar(t, 'ana', ['dig loja.exemplo TXT', 'dig loja.exemplo MX']);
    expect(s).toMatch(/TXT\s+"v=spf1 mx -all \\"fim\\""/);
    expect(s).toMatch(/MX\s+5 reserva2\.loja\.exemplo\./);
    // Pelo console também, com aspas; e o que não faz sentido é recusado com o porquê.
    expect(rodar(t, 'loja', ['servico dns registro x TXT "sem fim'])).toMatch(/aspas/);
    expect(rodar(t, 'loja', ['servico dns registro x A correio'])).toMatch(/não é/);
    expect(rodar(t, 'loja', ['servico dns registro @ MX 203.0.113.25'])).toMatch(/nunca direto para um IP/);
    expect(rodar(t, 'loja', ['servico dns registro @ MX correio 300 70000'])).toMatch(/0 a 65535/);
  });

  it('o nome do dig oferece todos os nomes das zonas; navegar e assistir, todas as páginas e vídeos publicados', () => {
    const m = mundoAplicacao();
    m.flags.aplicacao = true;
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'loja', ['servico dns registro @ TXT "teste"', 'servico web pagina /promo Promoção', 'servico web https on']);
    const acoes = acoesEquip(m, m.equipamentos.get('ana')!);
    const opcoes = (id: string, campo: string) => acoes.find((a) => a.id === id)!.campos!.find((c) => c.nome === campo)!.opcoes!.map((o) => o.valor);
    const nomes = opcoes('ap-dig', 'nome');
    for (const n of ['loja.exemplo', 'www.loja.exemplo', 'site.loja.exemplo', 'correio.loja.exemplo', 'escola.exemplo', 'mx.escola.exemplo']) expect(nomes).toContain(n);
    const http = opcoes('ap-navegar', 'url');
    for (const u of ['http://www.loja.exemplo/', 'http://www.loja.exemplo/promo', 'http://site.loja.exemplo/promo']) expect(http).toContain(u);
    expect(opcoes('ap-navegar-https', 'url')).toContain('https://www.loja.exemplo/promo');
    const videos = opcoes('ap-assistir', 'url');
    for (const u of ['http://video.loja.exemplo/aula', 'http://video.loja.exemplo/leve']) expect(videos).toContain(u);
  });

  it('o dig fala com vírgula decimal em todo lugar', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    const s = rodar(t, 'ana', ['dig www.loja.exemplo']);
    expect(s).not.toMatch(/\d\.\d+ ms/);
    expect(s).toMatch(/RTT \d+,\d+ ms/);
  });
});

describe('streaming reprodutível', () => {
  it('a vazão tem partida lenta, memória e quedas, e é a mesma para a mesma semente', () => {
    const a = vazaoNoTempo({ base: 10000, segundos: 300, semente: 42, rtt: 0.2 });
    expect(vazaoNoTempo({ base: 10000, segundos: 300, semente: 42, rtt: 0.2 })).toEqual(a);
    expect(vazaoNoTempo({ base: 10000, segundos: 300, semente: 43, rtt: 0.2 })).not.toEqual(a);
    // Primeiro segundo na partida lenta, bem abaixo da banda; nunca acima de 98 % do gargalo.
    expect(a[0]!).toBeLessThan(a[5]! * 0.8);
    expect(Math.max(...a)).toBeLessThanOrEqual(9800);
    const media = a.reduce((s, x) => s + x, 0) / a.length;
    expect(media).toBeGreaterThan(8000);
    expect(media).toBeLessThan(9500);
    // Correlação no tempo: segundos vizinhos se parecem mais do que segundos ao acaso.
    const dif = (k: number) => a.slice(k).reduce((s, x, i) => s + Math.abs(x - a[i]!), 0) / (a.length - k);
    expect(dif(1)).toBeLessThan(dif(40));
  });

  it('atraso mínimo: com ele toca liso, com um segundo a menos trava', () => {
    const banda = vazaoNoTempo({ base: 10000, segundos: 900, semente: 7, rtt: 0.05 });
    const taxa = 8900;
    const min = atrasoMinimo({ duracao: 300, taxaVideo: taxa, banda });
    expect(min).toBeGreaterThan(0);
    expect(simularBuffer({ duracao: 300, taxaVideo: taxa, banda, atrasoInicial: min }).travamentos).toBe(0);
    expect(simularBuffer({ duracao: 300, taxaVideo: taxa, banda, atrasoInicial: min - 1 }).travamentos).toBeGreaterThan(0);
  });

  it('no mundo, assistir é reprodutível e diz o atraso que resolve, mesmo com a banda um pouco abaixo da taxa', () => {
    const m = mundoAplicacao();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'loja', ['servico streaming hd 9000 120']);
    const r1 = rodar(t, 'ana', ['assistir http://video.loja.exemplo/hd 0']);
    const f1 = { ...m.flags.streaming };
    // A segunda vez o DNS vem do cache; do vídeo em diante, tudo igual.
    const video = (x: string) => x.slice(x.indexOf('Vídeo "hd"'));
    expect(video(rodar(t, 'ana', ['assistir http://video.loja.exemplo/hd 0']))).toBe(video(r1));
    expect(f1.travamentos).toBeGreaterThan(0);
    expect(f1.atrasoMinimo).toBeGreaterThan(0);
    expect(r1).toMatch(new RegExp(`atraso inicial de ${f1.atrasoMinimo} s`));
    rodar(t, 'ana', [`assistir http://video.loja.exemplo/hd ${f1.atrasoMinimo}`]);
    expect(m.flags.streaming.travamentos).toBe(0);
    // Banda média abaixo da taxa, mas por pouco: o recado diz que esperar resolve, e quanto.
    if (f1.bandaKbps < 9000) expect(r1).toMatch(/ainda chega ao fim sem travar|seria preciso/);
    expect(r1).not.toMatch(/nada resolve/);
  });
});
