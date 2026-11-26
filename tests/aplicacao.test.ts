// Camada de aplicação (ato 6): DNS, correio, web, streaming e entrega de conteúdo.
import { describe, expect, it } from 'vitest';
import {
  CD,
  CacheDns,
  Navegador,
  ServidorWeb,
  arvoreDeNomes,
  base64Codificar,
  base64Decodificar,
  bytesParaTexto,
  cabecalhos,
  compararDistribuicao,
  descreverMensagemDns,
  dhtResponsavel,
  chordAtalhos,
  chordBuscar,
  chordSucessor,
  idDht,
  dialogoSmtp,
  dnsCdn,
  enviarCorreio,
  espacoExemplo,
  frequenciaAparente,
  lerMime,
  lerRequisicao,
  lerUrl,
  montarMime,
  nomeReverso,
  nomesSuspeitos,
  ordemDecodificacao,
  quantizar,
  resolver,
  rttsPagina,
  servidorDeCorreio,
  simularAdaptativo,
  simularBuffer,
  simularCdn,
  simularJitter,
  simularP2P,
  simularProxyCache,
  simularRastreamento,
  pedidosZipf,
  balancear,
  taxaAudio,
  taxaVideo,
  tempoClienteServidor,
  tempoP2P,
  visaoDoResolvedor,
} from '../src/motor/aplicacao';

const TRAVESSAO = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('DNS', () => {
  const rtt = { 'a.raiz.': 20, 'a.nic.exemplo.': 30, 'ns1.loja.exemplo.': 50 };

  it('monta a árvore do espaço de nomes', () => {
    const a = arvoreDeNomes(espacoExemplo());
    expect(a[0]).toMatch(/^\. \(raiz/);
    expect(a.some((l) => l.includes('loja.exemplo.') && l.includes('segundo nível'))).toBe(true);
  });

  it('resolução iterativa: raiz, topo e autoritativo; a segunda vem do cache', () => {
    const espaco = espacoExemplo();
    const cache = new CacheDns();
    const r1 = resolver(espaco, 'www.loja.exemplo', 'A', { cache, rtt, rttCliente: 2, agora: 0 });
    expect(r1.codigo).toBe('NOERROR');
    expect(r1.consultas).toBe(3);
    expect(r1.detalhes.map((d) => d.servidor)).toEqual(['a.raiz.', 'a.nic.exemplo.', 'ns1.loja.exemplo.']);
    expect(r1.tempo).toBe(2 + 20 + 30 + 50);
    expect(r1.respostas.find((r) => r.tipo === 'A')?.valor).toBe('203.0.113.10');
    const r2 = resolver(espaco, 'www.loja.exemplo', 'A', { cache, rtt, rttCliente: 2, agora: 10 });
    expect(r2.consultas).toBe(0);
    expect(r2.origem).toBe('cache');
    expect(r2.tempo).toBe(2);
    expect(r2.respostas[0]!.ttl).toBe(290);
    // outro nome da mesma zona: o NS já está no cache, vai direto ao autoritativo
    const r3 = resolver(espaco, 'correio.loja.exemplo', 'A', { cache, rtt, agora: 20 });
    expect(r3.consultas).toBe(1);
    for (const p of [...r1.passos, ...r2.passos, ...r3.passos]) expect(p).not.toMatch(TRAVESSAO);
  });

  it('TTL expira e a consulta volta à rede', () => {
    const espaco = espacoExemplo();
    const cache = new CacheDns();
    resolver(espaco, 'www.loja.exemplo', 'A', { cache, agora: 0 });
    expect(cache.buscar('www.loja.exemplo', 'A', 299)).not.toBeNull();
    expect(cache.buscar('www.loja.exemplo', 'A', 300)).toBeNull();
    const r = resolver(espaco, 'www.loja.exemplo', 'A', { cache, agora: 301 });
    expect(r.origem).toBe('rede');
    expect(r.consultas).toBe(1);
    const tarde = resolver(espaco, 'www.loja.exemplo', 'A', { cache, agora: 10_000_000 });
    expect(tarde.consultas).toBe(3);
  });

  it('modo recursivo, CNAME, NXDOMAIN e PTR', () => {
    const espaco = espacoExemplo();
    const rec = resolver(espaco, 'www.escola.exemplo', 'A', { modo: 'recursivo' });
    expect(rec.consultas).toBe(3);
    expect(rec.passos.join(' ')).toMatch(/volta pela mesma cadeia/);
    const cn = resolver(espaco, 'site.loja.exemplo', 'A');
    expect(cn.respostas.map((r) => r.tipo)).toEqual(['CNAME', 'A']);
    const nx = resolver(espaco, 'nada.loja.exemplo', 'A');
    expect(nx.codigo).toBe('NXDOMAIN');
    const ptr = resolver(espaco, nomeReverso('203.0.113.10'), 'PTR');
    expect(ptr.respostas[0]!.valor).toBe('www.loja.exemplo.');
    expect(ptr.consultas).toBe(2);
  });

  it('descreve a mensagem com cabeçalho e seções', () => {
    const r = resolver(espacoExemplo(), 'www.loja.exemplo', 'A');
    const indicacao = descreverMensagemDns(r.detalhes[0]!.resposta);
    expect(indicacao[0]).toMatch(/id 1, resposta/);
    expect(indicacao.join('\n')).toMatch(/Seção de autoridade:\n  exemplo\. 172800 IN NS a\.nic\.exemplo\./);
    expect(indicacao.join('\n')).toMatch(/Seção adicional/);
  });

  it('privacidade e nomes parecidos', () => {
    const c = [{ cliente: '192.168.0.10', nome: 'www.loja.exemplo', hora: 1 }];
    expect(visaoDoResolvedor(c, 'udp53').redeVe[0]).toMatch(/www\.loja\.exemplo/);
    const doh = visaoDoResolvedor(c, 'doh');
    expect(doh.redeVe[0]).not.toMatch(/loja/);
    expect(doh.resolvedorVe[0]).toMatch(/loja/);
    const s = nomesSuspeitos('loja.exemplo', ['loja.exemplo', 'l0ja.exemplo', 'loja-oficial.exemplo', 'padaria.exemplo', 'lojа.outro']);
    const nomes = s.map((x) => x.nome);
    expect(nomes).toContain('l0ja.exemplo.');
    expect(nomes).not.toContain('padaria.exemplo.');
    expect(s[0]!.semelhanca).toBeGreaterThan(0.8);
  });
});

describe('Correio eletrônico', () => {
  it('MX aponta o servidor de correio com menor preferência', () => {
    const s = servidorDeCorreio(espacoExemplo(), 'loja.exemplo')!;
    expect(s.mx).toBe('correio.loja.exemplo.');
    expect(s.ip).toBe('203.0.113.25');
    expect(s.alternativos[0]!.mx).toBe('reserva.loja.exemplo.');
  });

  it('diálogo SMTP com 220, 250, 354 e 221', () => {
    const d = dialogoSmtp({
      cliente: 'mta.escola.exemplo',
      servidor: 'correio.loja.exemplo',
      de: 'ana@escola.exemplo',
      para: ['bia@loja.exemplo', 'fantasma@loja.exemplo'],
      mensagem: 'Subject: oi\r\n\r\nOlá!\r\n.linha com ponto',
      aceita: (e) => e.startsWith('bia'),
    });
    expect(d.codigos[0]).toBe(220);
    expect(d.codigos).toContain(250);
    expect(d.codigos).toContain(354);
    expect(d.codigos).toContain(550);
    expect(d.codigos[d.codigos.length - 1]).toBe(221);
    expect(d.linhas.some((l) => l.quem === 'C' && l.texto === '..linha com ponto')).toBe(true);
    expect(d.linhas.filter((l) => l.texto === '.').length).toBe(1);
    expect(d.aceitos).toEqual(['bia@loja.exemplo']);
    expect(d.entregue).toBe(true);
  });

  it('envio completo acumula Received por servidor', () => {
    const r = enviarCorreio(espacoExemplo(), {
      de: 'ana@escola.exemplo',
      para: 'bia@loja.exemplo',
      assunto: 'Prova',
      corpo: 'Até amanhã.',
      data: new Date(Date.UTC(2026, 10, 26, 12, 0, 0)),
      servidorRemetente: { nome: 'mx.escola.exemplo', ip: '203.0.113.45' },
      ipCliente: '192.168.0.10',
    });
    expect(r.servidorDestino?.mx).toBe('correio.loja.exemplo.');
    expect(r.caixas['bia@loja.exemplo']).toHaveLength(1);
    const rec = cabecalhos(r.mensagem, 'Received');
    expect(rec).toHaveLength(2);
    expect(rec[0]).toMatch(/by correio\.loja\.exemplo\./);
    expect(r.mensagem.cabecalhos.find(([n]) => n === 'Date')![1]).toBe('Thu, 26 Nov 2026 12:00:00 +0000');
  });

  it('base64 ida e volta, e MIME multipart', () => {
    expect(base64Codificar('Man')).toBe('TWFu');
    expect(base64Codificar('Ma')).toBe('TWE=');
    expect(base64Codificar('M')).toBe('TQ==');
    const texto = 'Olá, ação e coração! 0123456789';
    expect(bytesParaTexto(base64Decodificar(base64Codificar(texto)))).toBe(texto);
    const bin = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    expect([...base64Decodificar(base64Codificar(bin, 76))]).toEqual([...bin]);
    const m = montarMime({ texto: 'Segue o anexo.', anexos: [{ nome: 'dados.bin', tipo: 'application/octet-stream', conteudo: bin }] });
    const partes = lerMime(m.cabecalhos[1]![1], m.corpo);
    expect(partes).toHaveLength(2);
    expect(partes[0]!.texto).toBe('Segue o anexo.');
    expect([...partes[1]!.conteudo]).toEqual([...bin]);
  });
});

describe('Web e HTTP', () => {
  it('lê URLs', () => {
    const u = lerUrl('https://www.loja.exemplo:8443/produtos/ver?id=42&cor=azul+claro#fotos')!;
    expect(u.esquema).toBe('https');
    expect(u.nome).toBe('www.loja.exemplo');
    expect(u.porta).toBe(8443);
    expect(u.portaPadrao).toBe(false);
    expect(u.caminho).toBe('/produtos/ver');
    expect(u.consulta).toEqual({ id: '42', cor: 'azul claro' });
    expect(u.fragmento).toBe('fotos');
    const p = lerUrl('http://escola.exemplo')!;
    expect(p.porta).toBe(80);
    expect(p.caminho).toBe('/');
    expect(lerUrl('sem esquema')).toBeNull();
  });

  it('conta RTTs com e sem conexão persistente', () => {
    expect(rttsPagina({ objetos: 10, modo: 'nao-persistente', rtt: 10 }).rtts).toBe(22);
    expect(rttsPagina({ objetos: 10, modo: 'nao-persistente', rtt: 10, paralelas: 5 }).rtts).toBe(6);
    expect(rttsPagina({ objetos: 10, modo: 'persistente', rtt: 10 }).rtts).toBe(12);
    expect(rttsPagina({ objetos: 10, modo: 'pipelining', rtt: 10 }).rtts).toBe(3);
    const h2 = rttsPagina({ objetos: 10, modo: 'http2', rtt: 10, tls: '1.3' });
    expect(h2.rtts).toBe(4);
    expect(h2.tempo).toBe(40);
    expect(rttsPagina({ objetos: 10, modo: 'nao-persistente', rtt: 10 }).conexoes).toBe(11);
  });

  it('ETag gera 304 e o cache respeita max-age', () => {
    const srv = new ServidorWeb('www.loja.exemplo').publicar('/logo.png', {
      tipo: 'estatico',
      conteudo: 'PNG...',
      tipoMime: 'image/png',
      maxAge: 60,
    });
    const servidores = { 'www.loja.exemplo': srv };
    const nav = new Navegador();
    const b1 = nav.buscar(servidores, 'https://www.loja.exemplo/logo.png', 0);
    expect(b1.resposta.estado).toBe(200);
    expect(b1.origem).toBe('rede');
    const b2 = nav.buscar(servidores, 'https://www.loja.exemplo/logo.png', 30);
    expect(b2.origem).toBe('cache');
    const b3 = nav.buscar(servidores, 'https://www.loja.exemplo/logo.png', 100);
    expect(b3.origem).toBe('validado');
    expect(b3.requisicao!.cabecalhos['If-None-Match']).toBe(b1.resposta.cabecalhos['ETag']);
    const direto = srv.atender(lerRequisicao(`GET /logo.png HTTP/1.1\r\nHost: www.loja.exemplo\r\nIf-None-Match: ${b1.resposta.cabecalhos['ETag']}\r\n\r\n`)!);
    expect(direto.estado).toBe(304);
    expect(direto.corpo).toBe('');
    expect(srv.atender(lerRequisicao('GET /nada HTTP/1.1\r\n\r\n')!).estado).toBe(404);
  });

  it('cookie definido pelo servidor volta no pedido seguinte (página dinâmica)', () => {
    const srv = new ServidorWeb('loja.exemplo', { cookieSessao: 'sessao' }).publicar('/carrinho', {
      tipo: 'dinamico',
      gerar: ({ cookies, estado }) => {
        const k = `visitas:${cookies['sessao']}`;
        const n = ((estado.get(k) as number) ?? 0) + 1;
        estado.set(k, n);
        return { corpo: `visita ${n}` };
      },
    });
    const nav = new Navegador();
    const a = nav.buscar({ 'loja.exemplo': srv }, 'https://loja.exemplo/carrinho');
    expect(a.resposta.cabecalhos['Set-Cookie']).toMatch(/^sessao=s1/);
    expect(a.resposta.corpo).toBe('visita 1');
    const b = nav.buscar({ 'loja.exemplo': srv }, 'https://loja.exemplo/carrinho');
    expect(b.requisicao!.cabecalhos['Cookie']).toBe('sessao=s1');
    expect(b.resposta.corpo).toBe('visita 2');
    expect(b.resposta.cabecalhos['Set-Cookie']).toBeUndefined();
  });

  it('rastreador de terceiro monta o histórico em três sites', () => {
    const sites = ['noticias.exemplo', 'receitas.exemplo', 'farmacia.exemplo'];
    const r = simularRastreamento(sites);
    expect(r.maiorPerfil).toBe(3);
    expect(Object.keys(r.historico)).toHaveLength(1);
    expect(Object.values(r.historico)[0]).toEqual(sites);
    const bloqueado = simularRastreamento(sites, undefined, { bloquearTerceiros: true });
    expect(bloqueado.maiorPerfil).toBe(1);
    expect(Object.keys(bloqueado.historico)).toHaveLength(3);
  });
});

describe('Streaming', () => {
  it('taxa do CD é 1411,2 kb/s e Nyquist dobra', () => {
    expect(taxaAudio(CD).kbps).toBe(1411.2);
    expect(taxaAudio(CD).passos[0]).toMatch(/1411,2 kb\/s/);
    expect(frequenciaAparente(30000, 44100)).toBe(14100);
    expect(quantizar([0.3, -0.9], 3).erroMaximo).toBeLessThanOrEqual(0.125);
    expect(taxaVideo({ largura: 1920, altura: 1080, quadrosPorSegundo: 30 }).semCompressao).toBe(1492992000);
    expect(ordemDecodificacao('IBBP')).toBe('I0 P3 B1 B2');
  });

  it('buffer inicial maior reduz travamentos', () => {
    const banda = [...Array(10).fill(1500), ...Array(15).fill(300), ...Array(100).fill(1500)];
    const curto = simularBuffer({ duracao: 60, taxaVideo: 1000, banda, atrasoInicial: 1 });
    const longo = simularBuffer({ duracao: 60, taxaVideo: 1000, banda, atrasoInicial: 15 });
    expect(curto.travamentos).toBeGreaterThan(0);
    expect(longo.travamentos).toBeLessThan(curto.travamentos);
    expect(longo.tempoTravado).toBeLessThan(curto.tempoTravado);
  });

  it('adaptativo baixa a qualidade quando a banda cai', () => {
    const niveis = [
      { nome: '240p', taxa: 300 },
      { nome: '480p', taxa: 750 },
      { nome: '720p', taxa: 1500 },
      { nome: '1080p', taxa: 3000 },
    ];
    const banda = [...Array(20).fill(5000), ...Array(200).fill(800)];
    const r = simularAdaptativo({ niveis, banda, segmentos: 30 });
    const taxas = r.historico.map((h) => h.taxa);
    expect(Math.max(...taxas.slice(0, 8))).toBe(3000);
    expect(taxas[taxas.length - 1]).toBeLessThanOrEqual(750);
    expect(r.trocas).toBeGreaterThanOrEqual(2);
    expect(r.passos.join(' ')).toMatch(/baixa de/);
  });

  it('jitter: FEC e ocultação reduzem as falhas', () => {
    const base = { pacotes: 500, atrasoBase: 40, variacao: 60, perda: 0.05, atrasoReproducao: 90, semente: 7 };
    const nada = simularJitter(base);
    const fec = simularJitter({ ...base, correcao: 'fec' });
    const oc = simularJitter({ ...base, correcao: 'ocultacao' });
    expect(nada.falhas).toBeGreaterThan(0);
    expect(fec.falhas).toBeLessThan(nada.falhas);
    expect(oc.falhas).toBeLessThan(nada.falhas);
    expect(simularJitter({ ...base, atrasoReproducao: 200 }).atrasados).toBe(0);
  });
});

describe('Entrega de conteúdo', () => {
  it('menor carga responde melhor que rodízio com pedidos desiguais', () => {
    const pedidos = Array.from({ length: 12 }, (_, i) => ({ chegada: i, duracao: i % 3 === 0 ? 9 : 1 }));
    const rod = balancear(pedidos, 3, 'rodizio');
    const menor = balancear(pedidos, 3, 'menor-carga');
    expect(menor.tempoRespostaMedio).toBeLessThan(rod.tempoRespostaMedio);
  });

  it('proxy de cache economiza tráfego', () => {
    const pedidos = pedidosZipf(3, 100, 1000);
    expect(pedidosZipf(3, 100, 1000)).toEqual(pedidos);
    const r = simularProxyCache({ pedidos, capacidade: 20 });
    expect(r.taxaAcerto).toBeGreaterThan(0.4);
    expect(r.trafegoEconomizado).toBe(r.acertos * 100_000);
  });

  it('CDN reduz atraso e tráfego no enlace principal no dia da final', () => {
    const bordas = ['São Paulo', 'Recife', 'Manaus', 'Porto Alegre'];
    const r = simularCdn({
      origem: 'São Paulo',
      bordas,
      publico: [
        { cidade: 'Recife', espectadores: 20000 },
        { cidade: 'Fortaleza', espectadores: 15000 },
        { cidade: 'Manaus', espectadores: 8000 },
        { cidade: 'Curitiba', espectadores: 12000 },
        { cidade: 'Porto Alegre', espectadores: 10000 },
      ],
      taxaPorEspectador: 5,
      capacidadeEnlacePrincipal: 100000,
    });
    expect(r.comCdn.atrasoMedio).toBeLessThan(r.semCdn.atrasoMedio);
    expect(r.comCdn.trafegoEnlacePrincipal).toBeLessThan(r.semCdn.trafegoEnlacePrincipal);
    expect(r.semCdn.ocupacao).toBeGreaterThan(1);
    expect(r.comCdn.trafegoEnlacePrincipal).toBe(4 * 5);
    expect(dnsCdn('www.loja.exemplo', 'Fortaleza', bordas).borda).toBe('Recife');
  });

  it('P2P distribui mais rápido que cliente-servidor para N grande', () => {
    const base = { F: 1e9, us: 30e6, dmin: 2e6, u: 1e6 };
    expect(tempoP2P({ ...base, N: 1000 })).toBeLessThan(tempoClienteServidor({ ...base, N: 1000 }) / 10);
    const t = compararDistribuicao([10, 100, 1000], base);
    // N = 10: o gargalo é a descida (F/dmin = 500 s); N = 1000: a subida do servidor (N·F/us)
    expect(t[0]!.clienteServidor).toBe(500);
    expect(t[2]!.clienteServidor).toBeCloseTo(33333.33, 1);
    expect(t[2]!.p2p).toBeLessThan(1000);
    const sim = simularP2P({ pares: 30, pedacos: 20, semente: 5 });
    expect(sim.completosPorRodada[sim.completosPorRodada.length - 1]).toBe(30);
    // servidor sozinho mandando 4 pedaços por rodada levaria 30 × 20 / 4 = 150 rodadas
    expect(sim.rodadas).toBeLessThan(150);
    expect(dhtResponsavel('arquivo.iso', [3, 77, 140, 200]).responsavel).toBeTypeOf('number');
  });

  it('DHT em anel (tipo Chord): sucessor, atalhos n + 2^i e busca em O(log N) saltos; XOR como variante', () => {
    const nos = [3, 17, 42, 77, 101, 150, 199, 230];
    expect(chordSucessor(132, nos)).toBe(150);
    expect(chordSucessor(230, nos)).toBe(230);
    expect(chordSucessor(237, nos)).toBe(3); // dá a volta no anel
    const tab = chordAtalhos(3, nos);
    expect(tab.map((a) => a.inicio)).toEqual([4, 5, 7, 11, 19, 35, 67, 131]);
    expect(tab.map((a) => a.no)).toEqual([17, 17, 17, 17, 42, 42, 77, 150]);
    expect(chordAtalhos(150, nos).at(-1)).toEqual({ i: 7, inicio: 22, no: 42 });
    // a busca sempre termina no sucessor da chave, de qualquer nó: cada salto corta pelo menos metade da distância
    // no anel, então nunca passa de 8 (os bits do espaço), e em média fica perto de log₂ N
    let total = 0;
    for (let k = 0; k < 60; k++) {
      const chave = `arquivo-${k}.mp4`;
      for (const inicio of nos) {
        const b = chordBuscar(chave, nos, inicio);
        expect(b.responsavel).toBe(chordSucessor(idDht(chave), nos));
        expect(b.saltos).toBeLessThanOrEqual(8);
        total += b.saltos;
      }
    }
    expect(total / (60 * nos.length)).toBeLessThanOrEqual(Math.log2(nos.length));
    // a mesma chave pode cair em nós diferentes no anel e no XOR
    expect(idDht('compacto-da-final.mp4')).toBe(237);
    expect(chordBuscar('compacto-da-final.mp4', nos).responsavel).toBe(3);
    expect(dhtResponsavel('compacto-da-final.mp4', nos).responsavel).toBe(230);
    expect(chordBuscar('final-completa.mp4', nos)).toMatchObject({ id: 132, responsavel: 150, caminho: [3, 77, 101, 150], saltos: 3 });
  });
});
