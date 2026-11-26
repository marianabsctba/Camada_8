// Camada de aplicação (ato 6), parte pura: DNS (espaço de nomes, resolução iterativa e recursiva, cache com TTL,
// mensagens, privacidade e nomes parecidos), correio eletrônico (SMTP linha a linha, MX, cabeçalhos, MIME e base64
// de verdade, IMAP e POP3), web (URL, HTTP/1.1, cookies, cache, conexões persistentes, HTTP/2, HTTPS, rastreamento),
// streaming (áudio e vídeo digitais, buffer de reprodução, adaptativo, jitter, perda) e entrega de conteúdo (parques
// de servidores, proxies, CDN, P2P). Nada aqui conhece o mundo do jogo: entra configuração, sai número e `passos`.

import { rngSemente } from './util';

/* ---------- Utilidades ---------- */

/** FNV-1a de 32 bits em hexadecimal: serve de ETag, de Message-ID e de "hash" de pedaço. Não é criptográfico. */
export function resumo32(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function arred(x: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(x * f) / f;
}

function fmt(x: number, casas = 2): string {
  return arred(x, casas).toString().replace('.', ',');
}

/* ======================================================================
 * 1. DNS
 * ====================================================================== */

export type TipoRegistro = 'A' | 'AAAA' | 'NS' | 'MX' | 'CNAME' | 'TXT' | 'PTR' | 'SOA';

export interface RegistroDns {
  nome: string;
  tipo: TipoRegistro;
  /** Tempo de vida em segundos: quanto tempo um cache pode guardar o registro. */
  ttl: number;
  /** A: IPv4; AAAA: IPv6; NS, CNAME, PTR: outro nome; MX: nome do servidor; TXT: texto; SOA: "primário responsável serial". */
  valor: string;
  /** Só no MX: menor número, maior preferência. */
  prioridade?: number;
}

export interface ServidorDns {
  /** Nome do próprio servidor, por exemplo `a.raiz.` ou `ns1.loja.exemplo.`. */
  nome: string;
  ip: string;
  /** Zona pela qual o servidor é autoritativo (`.` para a raiz). */
  zona: string;
  registros: RegistroDns[];
}

export interface EspacoNomes {
  servidores: ServidorDns[];
  /** Servidor por nome de servidor (para seguir um NS). */
  porNome: Map<string, ServidorDns>;
  /** Servidor por zona. */
  porZona: Map<string, ServidorDns>;
  raiz: ServidorDns;
}

/** Deixa o nome em minúsculas e com o ponto final (nome totalmente qualificado). */
export function normalizarNome(nome: string): string {
  const n = nome.trim().toLowerCase();
  if (n === '' || n === '.') return '.';
  return n.endsWith('.') ? n : n + '.';
}

/** `www.loja.exemplo.` está dentro de `loja.exemplo.`, de `exemplo.` e de `.`. */
export function dentroDe(nome: string, zona: string): boolean {
  const n = normalizarNome(nome);
  const z = normalizarNome(zona);
  return z === '.' || n === z || n.endsWith('.' + z);
}

/** Lista os ancestrais do nome, do mais específico ao mais geral, terminando na raiz. */
export function ancestrais(nome: string): string[] {
  const n = normalizarNome(nome);
  if (n === '.') return ['.'];
  const rotulos = n.slice(0, -1).split('.');
  const lista: string[] = [];
  for (let i = 0; i < rotulos.length; i++) lista.push(rotulos.slice(i).join('.') + '.');
  lista.push('.');
  return lista;
}

export function montarEspacoNomes(servidores: ServidorDns[]): EspacoNomes {
  const lista = servidores.map((s) => ({
    ...s,
    nome: normalizarNome(s.nome),
    zona: normalizarNome(s.zona),
    registros: s.registros.map((r) => ({
      ...r,
      nome: normalizarNome(r.nome),
      valor: ['NS', 'CNAME', 'PTR', 'MX'].includes(r.tipo) ? normalizarNome(r.valor) : r.valor,
    })),
  }));
  const porNome = new Map(lista.map((s) => [s.nome, s] as const));
  const porZona = new Map(lista.map((s) => [s.zona, s] as const));
  const raiz = porZona.get('.');
  if (!raiz) throw new Error('O espaço de nomes precisa de um servidor da raiz (zona ".").');
  return { servidores: lista, porNome, porZona, raiz };
}

/** Árvore do espaço de nomes em linhas indentadas: raiz, domínios de topo, segundo nível e zonas. */
export function arvoreDeNomes(espaco: EspacoNomes): string[] {
  const zonas = [...espaco.porZona.keys()].sort((a, b) => a.split('.').length - b.split('.').length || a.localeCompare(b));
  const linhas: string[] = [];
  const nivel = (z: string) => (z === '.' ? 0 : z.split('.').length - 1);
  const nomeNivel = ['raiz', 'domínio de topo', 'segundo nível', 'terceiro nível'];
  const visitar = (z: string) => {
    const s = espaco.porZona.get(z)!;
    const n = nivel(z);
    linhas.push(`${'  '.repeat(n)}${z} (${nomeNivel[n] ?? 'zona'}; autoritativo: ${s.nome} ${s.ip})`);
    for (const filho of zonas) if (filho !== z && pai(filho) === z) visitar(filho);
  };
  const pai = (z: string): string => {
    for (const a of ancestrais(z).slice(1)) if (espaco.porZona.has(a)) return a;
    return '.';
  };
  visitar('.');
  return linhas;
}

/** Nome reverso para o PTR: 203.0.113.10 vira 10.113.0.203.in-addr.arpa. */
export function nomeReverso(ip: string): string {
  return ip.split('.').reverse().join('.') + '.in-addr.arpa.';
}

/* ---------- Mensagem DNS ---------- */

export interface FlagsDns {
  /** 0 consulta, 1 resposta. */
  qr: boolean;
  /** Resposta autoritativa. */
  aa: boolean;
  /** Truncada (não coube no UDP). */
  tc: boolean;
  /** Recursão desejada (o cliente pede que o servidor resolva tudo). */
  rd: boolean;
  /** Recursão disponível (o servidor aceita fazer isso). */
  ra: boolean;
  /** 0 NOERROR, 3 NXDOMAIN. */
  rcode: 0 | 2 | 3;
}

export interface PerguntaDns {
  nome: string;
  tipo: TipoRegistro;
}

export interface MensagemDns {
  id: number;
  flags: FlagsDns;
  perguntas: PerguntaDns[];
  respostas: RegistroDns[];
  autoridade: RegistroDns[];
  adicionais: RegistroDns[];
}

export function novaConsultaDns(id: number, nome: string, tipo: TipoRegistro, recursao = true): MensagemDns {
  return {
    id: id & 0xffff,
    flags: { qr: false, aa: false, tc: false, rd: recursao, ra: false, rcode: 0 },
    perguntas: [{ nome: normalizarNome(nome), tipo }],
    respostas: [],
    autoridade: [],
    adicionais: [],
  };
}

/** O valor como no arquivo de zona: TXT entre aspas (character-string, RFC 1035, §5.1), MX com a preferência antes. */
export function valorRegistro(r: RegistroDns): string {
  if (r.tipo === 'TXT') return `"${r.valor.replace(/(["\\])/g, '\\$1')}"`;
  return r.tipo === 'MX' ? `${r.prioridade ?? 10} ${r.valor}` : r.valor;
}

function linhaRegistro(r: RegistroDns): string {
  return `${r.nome} ${r.ttl} IN ${r.tipo} ${valorRegistro(r)}`;
}

/** A mensagem em linhas gerais, no formato de cabeçalho mais quatro seções. */
export function descreverMensagemDns(m: MensagemDns): string[] {
  const f = m.flags;
  const flags = [f.qr ? 'qr' : '', f.aa ? 'aa' : '', f.tc ? 'tc' : '', f.rd ? 'rd' : '', f.ra ? 'ra' : '']
    .filter(Boolean)
    .join(' ');
  const rcode = f.rcode === 0 ? 'NOERROR' : f.rcode === 3 ? 'NXDOMAIN' : 'SERVFAIL';
  const linhas = [
    `Cabeçalho: id ${m.id}, ${f.qr ? 'resposta' : 'consulta'}, flags [${flags}], código ${rcode}`,
    `Contagens: ${m.perguntas.length} pergunta(s), ${m.respostas.length} resposta(s), ${m.autoridade.length} de autoridade, ${m.adicionais.length} adicional(is)`,
    'Seção de perguntas:',
    ...m.perguntas.map((p) => `  ${p.nome} IN ${p.tipo}`),
  ];
  const secao = (titulo: string, rs: RegistroDns[]) => {
    if (rs.length) linhas.push(titulo, ...rs.map((r) => '  ' + linhaRegistro(r)));
  };
  secao('Seção de respostas:', m.respostas);
  secao('Seção de autoridade:', m.autoridade);
  secao('Seção adicional:', m.adicionais);
  return linhas;
}

/** O que um único servidor responde, sem perguntar a ninguém (é assim que a raiz e o topo trabalham). */
export function responderServidor(espaco: EspacoNomes, servidor: ServidorDns, consulta: MensagemDns): MensagemDns {
  const p = consulta.perguntas[0]!;
  const nome = normalizarNome(p.nome);
  const resp: MensagemDns = {
    id: consulta.id,
    flags: { qr: true, aa: false, tc: false, rd: consulta.flags.rd, ra: false, rcode: 0 },
    perguntas: [{ nome, tipo: p.tipo }],
    respostas: [],
    autoridade: [],
    adicionais: [],
  };
  // Delegação: o filho mais específico desta zona que contém o nome e tem NS aqui.
  const delegados = servidor.registros.filter(
    (r) => r.tipo === 'NS' && r.nome !== servidor.zona && dentroDe(nome, r.nome),
  );
  if (delegados.length) {
    const maisLongo = delegados.reduce((a, b) => (b.nome.length > a.nome.length ? b : a)).nome;
    resp.autoridade = delegados.filter((r) => r.nome === maisLongo);
    for (const ns of resp.autoridade) {
      const cola = servidor.registros.filter((r) => r.nome === ns.valor && (r.tipo === 'A' || r.tipo === 'AAAA'));
      if (cola.length) resp.adicionais.push(...cola);
      else {
        const s = espaco.porNome.get(ns.valor);
        if (s) resp.adicionais.push({ nome: s.nome, tipo: 'A', ttl: ns.ttl, valor: s.ip });
      }
    }
    return resp;
  }
  resp.flags.aa = true;
  const exatos = servidor.registros.filter((r) => r.nome === nome && r.tipo === p.tipo);
  if (exatos.length) {
    resp.respostas = exatos;
    if (p.tipo === 'MX' || p.tipo === 'NS') {
      for (const r of exatos) resp.adicionais.push(...servidor.registros.filter((x) => x.nome === r.valor && x.tipo === 'A'));
    }
    return resp;
  }
  const cname = servidor.registros.find((r) => r.nome === nome && r.tipo === 'CNAME');
  if (cname) {
    resp.respostas.push(cname);
    resp.respostas.push(...servidor.registros.filter((r) => r.nome === cname.valor && r.tipo === p.tipo));
    return resp;
  }
  const existeNome = servidor.registros.some((r) => r.nome === nome);
  if (!existeNome) resp.flags.rcode = 3;
  const soa = servidor.registros.find((r) => r.tipo === 'SOA');
  if (soa) resp.autoridade.push(soa);
  return resp;
}

/* ---------- Cache com TTL ---------- */

interface EntradaCache {
  registro: RegistroDns;
  expira: number;
}

/** Cache do resolvedor local. O relógio é passado por fora (segundos), para tudo ser determinístico. */
export class CacheDns {
  private entradas = new Map<string, EntradaCache[]>();

  private chave(nome: string, tipo: TipoRegistro) {
    return `${normalizarNome(nome)} ${tipo}`;
  }

  guardar(registros: RegistroDns[], agora: number): void {
    for (const r of registros) {
      const k = this.chave(r.nome, r.tipo);
      const lista = (this.entradas.get(k) ?? []).filter((e) => e.registro.valor !== r.valor && e.expira > agora);
      lista.push({ registro: { ...r }, expira: agora + r.ttl });
      this.entradas.set(k, lista);
    }
  }

  /** Devolve os registros ainda válidos, com o TTL que resta (é isso que o resolvedor repassa ao cliente). */
  buscar(nome: string, tipo: TipoRegistro, agora: number): RegistroDns[] | null {
    const k = this.chave(nome, tipo);
    const vivos = (this.entradas.get(k) ?? []).filter((e) => e.expira > agora);
    if (vivos.length === 0) {
      this.entradas.delete(k);
      return null;
    }
    this.entradas.set(k, vivos);
    return vivos.map((e) => ({ ...e.registro, ttl: Math.ceil(e.expira - agora) }));
  }

  /** Quantas entradas (nome e tipo) ainda estão vivas. */
  tamanho(agora: number): number {
    let n = 0;
    for (const lista of this.entradas.values()) if (lista.some((e) => e.expira > agora)) n++;
    return n;
  }

  limpar(): void {
    this.entradas.clear();
  }
}

/* ---------- Resolução ---------- */

export interface OpcoesResolucao {
  /** `iterativo`: o resolvedor local pergunta a cada servidor. `recursivo`: cada servidor pergunta ao próximo. */
  modo?: 'iterativo' | 'recursivo';
  /** RTT entre o cliente (resolvedor de stub) e o resolvedor local, em ms. */
  rttCliente?: number;
  /** RTT até cada servidor, por nome de servidor (ms). Quem não estiver aqui usa `rttPadrao`. */
  rtt?: Record<string, number>;
  rttPadrao?: number;
  cache?: CacheDns;
  /** Relógio em segundos (para o TTL). */
  agora?: number;
  /** Id da primeira consulta; as seguintes somam 1. */
  idInicial?: number;
  /** Limite de servidores consultados (proteção contra laço). */
  maxConsultas?: number;
}

export interface ConsultaFeita {
  servidor: string;
  ip: string;
  pergunta: PerguntaDns;
  resposta: MensagemDns;
  rtt: number;
}

export interface ResultadoResolucao {
  nome: string;
  tipo: TipoRegistro;
  respostas: RegistroDns[];
  codigo: 'NOERROR' | 'NXDOMAIN' | 'SERVFAIL';
  /** Consultas enviadas a servidores (não conta a do cliente ao resolvedor local). */
  consultas: number;
  /** Tempo total em ms, incluindo o RTT do cliente ao resolvedor local. */
  tempo: number;
  /** `cache` se nenhum servidor externo precisou ser consultado. */
  origem: 'cache' | 'rede';
  detalhes: ConsultaFeita[];
  passos: string[];
}

/** Resolve um nome passo a passo, como o resolvedor local faz: cache, raiz, topo, autoritativo (e segue CNAME). */
export function resolver(
  espaco: EspacoNomes,
  nome: string,
  tipo: TipoRegistro,
  opcoes: OpcoesResolucao = {},
): ResultadoResolucao {
  const modo = opcoes.modo ?? 'iterativo';
  const cache = opcoes.cache;
  const agora = opcoes.agora ?? 0;
  const rttCliente = opcoes.rttCliente ?? 1;
  const rttDe = (s: ServidorDns) => opcoes.rtt?.[s.nome] ?? opcoes.rttPadrao ?? 30;
  const max = opcoes.maxConsultas ?? 20;
  let id = opcoes.idInicial ?? 1;
  const passos: string[] = [];
  const detalhes: ConsultaFeita[] = [];
  const respostas: RegistroDns[] = [];
  let tempo = rttCliente;
  let codigo: ResultadoResolucao['codigo'] = 'NOERROR';
  let alvo = normalizarNome(nome);

  passos.push(`O cliente pede ${alvo} (${tipo}) ao resolvedor local, com recursão desejada (RTT ${fmt(rttCliente, 2)} ms).`);
  if (modo === 'recursivo') {
    passos.push('Modo recursivo: cada servidor pergunta ao próximo em nome de quem perguntou, e a resposta volta pelo mesmo caminho.');
  }

  let seguidos = 0;
  externo: while (seguidos < 8) {
    seguidos++;
    // 1. Resposta pronta no cache?
    if (cache) {
      const pronta = cache.buscar(alvo, tipo, agora);
      if (pronta) {
        respostas.push(...pronta);
        passos.push(`Cache: ${alvo} ${tipo} ainda vale (TTL restante ${pronta[0]!.ttl} s); nenhum servidor consultado.`);
        break;
      }
      const cn = cache.buscar(alvo, 'CNAME', agora);
      if (cn && tipo !== 'CNAME') {
        respostas.push(...cn);
        passos.push(`Cache: ${alvo} é apelido (CNAME) de ${cn[0]!.valor}.`);
        alvo = cn[0]!.valor;
        continue;
      }
    }
    // 2. Por onde começar: o NS mais específico já conhecido, senão a raiz.
    let servidor = espaco.raiz;
    if (cache) {
      for (const a of ancestrais(alvo)) {
        if (a === '.') break;
        const ns = cache.buscar(a, 'NS', agora);
        const s = ns?.map((r) => espaco.porNome.get(r.valor)).find(Boolean);
        if (s) {
          servidor = s;
          passos.push(`Cache: já sabe que ${a} é servido por ${s.nome}; pula direto para ele.`);
          break;
        }
      }
    }
    if (servidor === espaco.raiz) passos.push(`Começa pela raiz (${servidor.nome} ${servidor.ip}).`);

    let anterior = 'resolvedor local';
    while (true) {
      if (detalhes.length >= max) {
        codigo = 'SERVFAIL';
        passos.push('Consultas demais: o resolvedor desiste (SERVFAIL).');
        break externo;
      }
      const consulta = novaConsultaDns(id++, alvo, tipo, modo === 'recursivo');
      const resp = responderServidor(espaco, servidor, consulta);
      const rtt = rttDe(servidor);
      tempo += rtt;
      detalhes.push({ servidor: servidor.nome, ip: servidor.ip, pergunta: consulta.perguntas[0]!, resposta: resp, rtt });
      const quem = modo === 'recursivo' ? anterior : 'resolvedor local';
      if (resp.respostas.length) {
        passos.push(
          `${quem} pergunta a ${servidor.nome} (${fmt(rtt, 2)} ms): resposta autoritativa com ${resp.respostas.map((r) => `${r.tipo} ${r.valor}`).join(', ')}.`,
        );
        cache?.guardar(resp.respostas, agora);
        respostas.push(...resp.respostas);
        const final = resp.respostas.filter((r) => r.tipo === tipo);
        const ultimo = resp.respostas[resp.respostas.length - 1]!;
        if (final.length === 0 && ultimo.tipo === 'CNAME') {
          passos.push(`${alvo} é apelido de ${ultimo.valor}; a resolução recomeça para o nome canônico.`);
          alvo = ultimo.valor;
          continue externo;
        }
        break externo;
      }
      if (resp.autoridade.some((r) => r.tipo === 'NS')) {
        const ns = resp.autoridade.filter((r) => r.tipo === 'NS');
        cache?.guardar([...ns, ...resp.adicionais], agora);
        const prox = ns.map((r) => espaco.porNome.get(r.valor)).find(Boolean);
        passos.push(
          `${quem} pergunta a ${servidor.nome} (${fmt(rtt, 2)} ms): não sabe, mas indica ${ns[0]!.nome} em ${ns.map((r) => r.valor).join(', ')}` +
            (resp.adicionais.length ? ` (cola: ${resp.adicionais.map((r) => r.valor).join(', ')}).` : '.'),
        );
        if (!prox) {
          codigo = 'SERVFAIL';
          passos.push('O servidor indicado não existe neste espaço de nomes (SERVFAIL).');
          break externo;
        }
        anterior = servidor.nome;
        servidor = prox;
        continue;
      }
      codigo = resp.flags.rcode === 3 ? 'NXDOMAIN' : 'NOERROR';
      passos.push(
        `${quem} pergunta a ${servidor.nome} (${fmt(rtt, 2)} ms): ${codigo === 'NXDOMAIN' ? 'o nome não existe (NXDOMAIN)' : `o nome existe, mas não tem ${tipo}`}; o SOA da zona diz por quanto tempo guardar essa negativa.`,
      );
      break externo;
    }
  }

  const consultas = detalhes.length;
  if (modo === 'recursivo' && consultas > 1) {
    passos.push(`A resposta volta pela mesma cadeia: ${detalhes.map((d) => d.servidor).reverse().join(' → ')} → resolvedor local → cliente.`);
  }
  passos.push(
    `Total: ${consultas} consulta(s) a servidores, ${fmt(tempo, 1)} ms (o cliente espera ${fmt(rttCliente, 2)} ms + a soma dos RTTs consultados).`,
  );
  return {
    nome: normalizarNome(nome),
    tipo,
    respostas,
    codigo,
    consultas,
    tempo,
    origem: consultas === 0 ? 'cache' : 'rede',
    detalhes,
    passos,
  };
}

/** Espaço de nomes de exemplo usado nas aulas: raiz, `exemplo.`, `arpa.`, `loja.exemplo.` e `escola.exemplo.`. */
export function espacoExemplo(): EspacoNomes {
  return montarEspacoNomes([
    {
      nome: 'a.raiz.',
      ip: '192.0.2.1',
      zona: '.',
      registros: [
        { nome: '.', tipo: 'NS', ttl: 518400, valor: 'a.raiz.' },
        { nome: 'exemplo.', tipo: 'NS', ttl: 172800, valor: 'a.nic.exemplo.' },
        { nome: 'a.nic.exemplo.', tipo: 'A', ttl: 172800, valor: '192.0.2.53' },
        { nome: 'arpa.', tipo: 'NS', ttl: 172800, valor: 'a.nic.arpa.' },
        { nome: 'a.nic.arpa.', tipo: 'A', ttl: 172800, valor: '192.0.2.54' },
      ],
    },
    {
      nome: 'a.nic.exemplo.',
      ip: '192.0.2.53',
      zona: 'exemplo.',
      registros: [
        { nome: 'exemplo.', tipo: 'SOA', ttl: 3600, valor: 'a.nic.exemplo. dns.nic.exemplo. 2026112601' },
        { nome: 'exemplo.', tipo: 'NS', ttl: 172800, valor: 'a.nic.exemplo.' },
        { nome: 'loja.exemplo.', tipo: 'NS', ttl: 86400, valor: 'ns1.loja.exemplo.' },
        { nome: 'ns1.loja.exemplo.', tipo: 'A', ttl: 86400, valor: '198.51.100.53' },
        { nome: 'escola.exemplo.', tipo: 'NS', ttl: 86400, valor: 'ns1.escola.exemplo.' },
        { nome: 'ns1.escola.exemplo.', tipo: 'A', ttl: 86400, valor: '198.51.100.54' },
      ],
    },
    {
      nome: 'a.nic.arpa.',
      ip: '192.0.2.54',
      zona: 'arpa.',
      registros: [
        { nome: 'arpa.', tipo: 'SOA', ttl: 3600, valor: 'a.nic.arpa. dns.nic.arpa. 2026112601' },
        { nome: '10.113.0.203.in-addr.arpa.', tipo: 'PTR', ttl: 3600, valor: 'www.loja.exemplo.' },
        { nome: '25.113.0.203.in-addr.arpa.', tipo: 'PTR', ttl: 3600, valor: 'correio.loja.exemplo.' },
      ],
    },
    {
      nome: 'ns1.loja.exemplo.',
      ip: '198.51.100.53',
      zona: 'loja.exemplo.',
      registros: [
        { nome: 'loja.exemplo.', tipo: 'SOA', ttl: 3600, valor: 'ns1.loja.exemplo. ti.loja.exemplo. 2026112601' },
        { nome: 'loja.exemplo.', tipo: 'NS', ttl: 86400, valor: 'ns1.loja.exemplo.' },
        { nome: 'ns1.loja.exemplo.', tipo: 'A', ttl: 86400, valor: '198.51.100.53' },
        { nome: 'www.loja.exemplo.', tipo: 'A', ttl: 300, valor: '203.0.113.10' },
        { nome: 'www.loja.exemplo.', tipo: 'AAAA', ttl: 300, valor: '2001:db8::10' },
        { nome: 'site.loja.exemplo.', tipo: 'CNAME', ttl: 600, valor: 'www.loja.exemplo.' },
        { nome: 'loja.exemplo.', tipo: 'MX', ttl: 3600, valor: 'correio.loja.exemplo.', prioridade: 10 },
        { nome: 'loja.exemplo.', tipo: 'MX', ttl: 3600, valor: 'reserva.loja.exemplo.', prioridade: 20 },
        { nome: 'correio.loja.exemplo.', tipo: 'A', ttl: 3600, valor: '203.0.113.25' },
        { nome: 'reserva.loja.exemplo.', tipo: 'A', ttl: 3600, valor: '203.0.113.26' },
        { nome: 'loja.exemplo.', tipo: 'TXT', ttl: 3600, valor: 'v=spf1 mx -all' },
      ],
    },
    {
      nome: 'ns1.escola.exemplo.',
      ip: '198.51.100.54',
      zona: 'escola.exemplo.',
      registros: [
        { nome: 'escola.exemplo.', tipo: 'SOA', ttl: 3600, valor: 'ns1.escola.exemplo. ti.escola.exemplo. 2026112601' },
        { nome: 'escola.exemplo.', tipo: 'NS', ttl: 86400, valor: 'ns1.escola.exemplo.' },
        { nome: 'ns1.escola.exemplo.', tipo: 'A', ttl: 86400, valor: '198.51.100.54' },
        { nome: 'www.escola.exemplo.', tipo: 'A', ttl: 120, valor: '203.0.113.40' },
        { nome: 'escola.exemplo.', tipo: 'MX', ttl: 3600, valor: 'mx.escola.exemplo.', prioridade: 5 },
        { nome: 'mx.escola.exemplo.', tipo: 'A', ttl: 3600, valor: '203.0.113.45' },
      ],
    },
  ]);
}

/* ---------- Privacidade no DNS ---------- */

export type TransporteDns = 'udp53' | 'dot' | 'doh';

export interface ConsultaObservada {
  cliente: string;
  nome: string;
  /** Hora em segundos, só para ordenar. */
  hora: number;
}

export interface VisaoPrivacidade {
  /** O que quem escuta a rede entre o cliente e o resolvedor consegue ler. */
  redeVe: string[];
  /** O que o próprio resolvedor registra (ele sempre vê tudo, seja qual for o transporte). */
  resolvedorVe: string[];
  /** O que os servidores autoritativos veem (o IP do resolvedor, não o do cliente, salvo extensões como ECS). */
  autoritativoVe: string[];
  passos: string[];
}

/** Mostra quem vê o quê quando o cliente consulta nomes, em DNS comum (UDP 53), sobre TLS (DoT, 853) ou HTTPS (DoH, 443). */
export function visaoDoResolvedor(
  consultas: ConsultaObservada[],
  transporte: TransporteDns,
  ipResolvedor = '192.0.2.200',
): VisaoPrivacidade {
  const ordem = [...consultas].sort((a, b) => a.hora - b.hora);
  const resolvedorVe = ordem.map((c) => `${c.hora}s ${c.cliente} perguntou ${normalizarNome(c.nome)}`);
  const autoritativoVe = ordem.map((c) => `${c.hora}s ${ipResolvedor} perguntou ${normalizarNome(c.nome)}`);
  let redeVe: string[];
  const passos: string[] = [];
  if (transporte === 'udp53') {
    redeVe = ordem.map((c) => `${c.hora}s ${c.cliente} → ${ipResolvedor}:53 UDP, em claro: ${normalizarNome(c.nome)}`);
    passos.push('DNS comum vai em texto claro na porta 53: qualquer um no caminho lê e até falsifica as respostas.');
  } else if (transporte === 'dot') {
    redeVe = ordem.map((c) => `${c.hora}s ${c.cliente} → ${ipResolvedor}:853 TLS (conteúdo cifrado)`);
    passos.push('DNS sobre TLS (porta 853): o conteúdo fica cifrado, mas a porta dedicada mostra que é DNS e pode ser bloqueada.');
  } else {
    redeVe = ordem.map((c) => `${c.hora}s ${c.cliente} → ${ipResolvedor}:443 HTTPS (parece navegação comum)`);
    passos.push('DNS sobre HTTPS (porta 443): o conteúdo vai cifrado e se mistura ao tráfego web.');
  }
  passos.push(
    'Em qualquer transporte, o resolvedor escolhido vê todos os nomes e de quem vieram: cifrar o caminho troca em quem você confia, não elimina a confiança.',
    'Os autoritativos veem o IP do resolvedor, não o do cliente; o cache também esconde consultas repetidas.',
  );
  return { redeVe, resolvedorVe, autoritativoVe, passos };
}

/* ---------- Disputa de nomes (nomes parecidos) ---------- */

/** Distância de edição (Levenshtein): inserções, remoções e trocas para ir de um texto ao outro. */
export function distanciaEdicao(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(ant[j]! + 1, atual[j - 1]! + 1, ant[j - 1]! + custo);
    }
    ant = atual;
  }
  return ant[n]!;
}

/** Trocas visuais clássicas de quem registra nome parecido. */
const SOSIAS: [string, string][] = [
  ['rn', 'm'],
  ['vv', 'w'],
  ['0', 'o'],
  ['1', 'l'],
  ['l', 'i'],
  ['3', 'e'],
  ['5', 's'],
];

/** Reduz o nome a um "esqueleto" visual (troca sósias, tira hífens e o domínio de topo). */
export function esqueletoNome(nome: string): string {
  let s = normalizarNome(nome).replace(/\.$/, '');
  const partes = s.split('.');
  if (partes.length > 1) partes.pop();
  s = partes.filter((p) => p !== 'www').join('.');
  s = s.replace(/-/g, '');
  for (const [de, para] of SOSIAS) s = s.split(de).join(para);
  return s;
}

export interface Semelhanca {
  nome: string;
  /** De 0 (nada a ver) a 1 (idêntico ao olho). */
  semelhanca: number;
  distancia: number;
  motivos: string[];
}

/** Mede o quanto `candidato` se parece com o nome `legitimo` (para achar registro de nome parecido). */
export function semelhancaNomes(legitimo: string, candidato: string): Semelhanca {
  const a = normalizarNome(legitimo).replace(/\.$/, '');
  const b = normalizarNome(candidato).replace(/\.$/, '');
  const motivos: string[] = [];
  const d = distanciaEdicao(a, b);
  const simTexto = 1 - d / Math.max(a.length, b.length, 1);
  const ea = esqueletoNome(a);
  const eb = esqueletoNome(b);
  const dEsq = distanciaEdicao(ea, eb);
  const simEsq = 1 - dEsq / Math.max(ea.length, eb.length, 1);
  if (a !== b && ea === eb) motivos.push('mesmo esqueleto visual (letras trocadas por sósias, hífen ou outro domínio de topo)');
  if (d === 1) motivos.push('uma única letra de diferença');
  const ta = a.split('.').pop();
  const tb = b.split('.').pop();
  if (ta !== tb && a.split('.').slice(0, -1).join('.') === b.split('.').slice(0, -1).join('.')) {
    motivos.push(`mesmo nome em outro domínio de topo (${tb})`);
  }
  if (b.includes(a.split('.')[0]!) && a !== b) motivos.push('contém o nome legítimo inteiro');
  return { nome: b + '.', semelhanca: arred(Math.max(simTexto, simEsq), 3), distancia: d, motivos };
}

/** Filtra, de uma lista de registros novos, os que parecem imitação do nome legítimo. */
export function nomesSuspeitos(legitimo: string, candidatos: string[], limiar = 0.8): Semelhanca[] {
  const leg = normalizarNome(legitimo);
  return candidatos
    .filter((c) => normalizarNome(c) !== leg)
    .map((c) => semelhancaNomes(legitimo, c))
    .filter((s) => s.semelhanca >= limiar || s.motivos.length > 0)
    .sort((x, y) => y.semelhanca - x.semelhanca);
}

/* ======================================================================
 * 2. Correio eletrônico
 * ====================================================================== */

/* ---------- Base64 (de verdade) ---------- */

const ALFABETO_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function textoParaBytes(texto: string): Uint8Array {
  return new TextEncoder().encode(texto);
}

export function bytesParaTexto(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Codifica em base64: cada 3 bytes (24 bits) viram 4 caracteres de 6 bits; o que sobra é completado com `=`. */
export function base64Codificar(dados: Uint8Array | string, larguraLinha = 0): string {
  const b = typeof dados === 'string' ? textoParaBytes(dados) : dados;
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += ALFABETO_B64[(n >> 18) & 63]! + ALFABETO_B64[(n >> 12) & 63]!;
    s += i + 1 < b.length ? ALFABETO_B64[(n >> 6) & 63]! : '=';
    s += i + 2 < b.length ? ALFABETO_B64[n & 63]! : '=';
  }
  if (larguraLinha > 0) {
    const linhas: string[] = [];
    for (let i = 0; i < s.length; i += larguraLinha) linhas.push(s.slice(i, i + larguraLinha));
    return linhas.join('\r\n');
  }
  return s;
}

/** Decodifica base64 (ignora quebras de linha e espaços). Lança erro se aparecer caractere fora do alfabeto. */
export function base64Decodificar(texto: string): Uint8Array {
  const s = texto.replace(/[\s]/g, '');
  const saida: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    if (ch === '=') break;
    const v = ALFABETO_B64.indexOf(ch);
    if (v < 0) throw new Error(`Caractere inválido em base64: ${ch}`);
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      saida.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(saida);
}

/* ---------- Arquitetura e MX ---------- */

export const ARQUITETURA_CORREIO: string[] = [
  'Agente do usuário (o programa de correio da pessoa): escreve, lê e organiza mensagens.',
  'Agente de transferência (servidor de correio): recebe do agente do usuário e entrega a outro agente de transferência por SMTP, porta 25 (ou 587 para submissão autenticada).',
  'Caixa de correio: fica no servidor do destinatário; a pessoa busca as mensagens com IMAP (porta 143 ou 993) ou POP3 (porta 110 ou 995), nunca com SMTP.',
  'O servidor de destino é achado pelo registro MX do domínio do destinatário; menor preferência é tentada primeiro.',
];

export interface ServidorCorreio {
  dominio: string;
  mx: string;
  ip: string;
  prioridade: number;
  /** Os outros MX, em ordem, para tentar se o primeiro não responder. */
  alternativos: { mx: string; prioridade: number }[];
  consultas: number;
  tempo: number;
  passos: string[];
}

/** Descobre para qual servidor entregar mensagens de um domínio: consulta MX, escolhe a menor preferência e resolve o A dele. */
export function servidorDeCorreio(
  espaco: EspacoNomes,
  dominio: string,
  opcoes: OpcoesResolucao = {},
): ServidorCorreio | null {
  const passos: string[] = [];
  const mx = resolver(espaco, dominio, 'MX', opcoes);
  passos.push(...mx.passos);
  const lista = mx.respostas
    .filter((r) => r.tipo === 'MX')
    .sort((a, b) => (a.prioridade ?? 10) - (b.prioridade ?? 10));
  if (lista.length === 0) {
    passos.push(`${normalizarNome(dominio)} não tem MX; o padrão manda tentar o próprio A do domínio, e se nem isso houver a mensagem volta.`);
    return null;
  }
  const escolhido = lista[0]!;
  passos.push(`MX encontrados: ${lista.map((r) => `${r.prioridade ?? 10} ${r.valor}`).join(', ')}. Escolhe o de menor número: ${escolhido.valor}.`);
  const a = resolver(espaco, escolhido.valor, 'A', { ...opcoes, idInicial: (opcoes.idInicial ?? 1) + mx.consultas });
  passos.push(...a.passos);
  const ip = a.respostas.find((r) => r.tipo === 'A')?.valor;
  if (!ip) return null;
  return {
    dominio: normalizarNome(dominio),
    mx: escolhido.valor,
    ip,
    prioridade: escolhido.prioridade ?? 10,
    alternativos: lista.slice(1).map((r) => ({ mx: r.valor, prioridade: r.prioridade ?? 10 })),
    consultas: mx.consultas + a.consultas,
    tempo: mx.tempo + a.tempo,
    passos,
  };
}

/* ---------- Cabeçalhos e mensagem ---------- */

export interface MensagemCorreio {
  /** Cabeçalhos em ordem, como aparecem na mensagem. `Received` mais recente fica em cima. */
  cabecalhos: [string, string][];
  corpo: string;
}

const DIAS_SEMANA = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Data no formato do correio (RFC 5322), sempre em UTC para ser determinística. */
export function dataCorreio(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${p(d.getUTCDate())} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
}

export function dominioDe(endereco: string): string {
  const m = /@([^>\s]+)/.exec(endereco);
  return m ? m[1]!.toLowerCase() : '';
}

export function montarMensagem(dados: {
  de: string;
  para: string[];
  assunto: string;
  data: Date;
  corpo: string;
  cabecalhosExtras?: [string, string][];
}): MensagemCorreio {
  const id = resumo32(`${dados.de}|${dados.para.join(',')}|${dados.assunto}|${dados.data.getTime()}|${dados.corpo}`);
  return {
    cabecalhos: [
      ['From', dados.de],
      ['To', dados.para.join(', ')],
      ['Subject', dados.assunto],
      ['Date', dataCorreio(dados.data)],
      ['Message-ID', `<${id}.${dados.data.getTime().toString(36)}@${dominioDe(dados.de) || 'exemplo'}>`],
      ...(dados.cabecalhosExtras ?? []),
    ],
    corpo: dados.corpo,
  };
}

/** Cada servidor que recebe a mensagem acrescenta um `Received` no topo: lido de baixo para cima, é o caminho percorrido. */
export function adicionarReceived(
  m: MensagemCorreio,
  salto: { de: string; ipDe: string; por: string; data: Date; protocolo?: string },
): MensagemCorreio {
  const valor = `from ${salto.de} (${salto.ipDe}) by ${salto.por} with ${salto.protocolo ?? 'ESMTP'}; ${dataCorreio(salto.data)}`;
  return { ...m, cabecalhos: [['Received', valor], ...m.cabecalhos] };
}

export function cabecalho(m: MensagemCorreio, nome: string): string | undefined {
  return m.cabecalhos.find(([n]) => n.toLowerCase() === nome.toLowerCase())?.[1];
}

export function cabecalhos(m: MensagemCorreio, nome: string): string[] {
  return m.cabecalhos.filter(([n]) => n.toLowerCase() === nome.toLowerCase()).map(([, v]) => v);
}

export function serializarMensagem(m: MensagemCorreio): string {
  return m.cabecalhos.map(([n, v]) => `${n}: ${v}`).join('\r\n') + '\r\n\r\n' + m.corpo;
}

export function lerMensagem(texto: string): MensagemCorreio {
  const corte = texto.indexOf('\r\n\r\n');
  const topo = corte < 0 ? texto : texto.slice(0, corte);
  const corpo = corte < 0 ? '' : texto.slice(corte + 4);
  const cab: [string, string][] = [];
  for (const linha of topo.split('\r\n')) {
    if (/^[ \t]/.test(linha) && cab.length) cab[cab.length - 1]![1] += ' ' + linha.trim();
    else {
      const i = linha.indexOf(':');
      if (i > 0) cab.push([linha.slice(0, i), linha.slice(i + 1).trim()]);
    }
  }
  return { cabecalhos: cab, corpo };
}

/* ---------- MIME ---------- */

export interface AnexoMime {
  nome: string;
  tipo: string;
  conteudo: Uint8Array | string;
}

export interface ParteMime {
  cabecalhos: Record<string, string>;
  /** Conteúdo já decodificado. */
  conteudo: Uint8Array;
  texto?: string;
}

/** Monta um corpo multipart/mixed: texto em uma parte, cada anexo em outra, codificado em base64. */
export function montarMime(dados: {
  texto: string;
  html?: string;
  anexos?: AnexoMime[];
  fronteira?: string;
}): { cabecalhos: [string, string][]; corpo: string } {
  const fronteira = dados.fronteira ?? `=_fronteira_${resumo32(dados.texto + (dados.anexos?.length ?? 0))}`;
  const partes: string[] = [];
  partes.push(
    'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + base64Codificar(dados.texto, 76),
  );
  if (dados.html !== undefined) {
    partes.push('Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + base64Codificar(dados.html, 76));
  }
  for (const a of dados.anexos ?? []) {
    partes.push(
      `Content-Type: ${a.tipo}; name="${a.nome}"\r\nContent-Disposition: attachment; filename="${a.nome}"\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
        base64Codificar(a.conteudo, 76),
    );
  }
  const corpo =
    'Esta é uma mensagem MIME em várias partes.\r\n' +
    partes.map((p) => `--${fronteira}\r\n${p}\r\n`).join('') +
    `--${fronteira}--\r\n`;
  return {
    cabecalhos: [
      ['MIME-Version', '1.0'],
      ['Content-Type', `multipart/mixed; boundary="${fronteira}"`],
    ],
    corpo,
  };
}

/** Lê um corpo multipart, separa as partes pela fronteira e decodifica base64 de cada uma. */
export function lerMime(contentType: string, corpo: string): ParteMime[] {
  const m = /boundary="?([^";]+)"?/i.exec(contentType);
  if (!m) return [];
  const fronteira = '--' + m[1]!;
  const pedacos = corpo.split(fronteira).slice(1);
  const partes: ParteMime[] = [];
  for (const p of pedacos) {
    if (p.startsWith('--')) break;
    const bruto = p.replace(/^\r\n/, '');
    const corte = bruto.indexOf('\r\n\r\n');
    const topo = bruto.slice(0, corte);
    const conteudoBruto = bruto.slice(corte + 4).replace(/\r\n$/, '');
    const cab: Record<string, string> = {};
    for (const linha of topo.split('\r\n')) {
      const i = linha.indexOf(':');
      if (i > 0) cab[linha.slice(0, i).toLowerCase()] = linha.slice(i + 1).trim();
    }
    const conteudo =
      (cab['content-transfer-encoding'] ?? '').toLowerCase() === 'base64'
        ? base64Decodificar(conteudoBruto)
        : textoParaBytes(conteudoBruto);
    const parte: ParteMime = { cabecalhos: cab, conteudo };
    if ((cab['content-type'] ?? '').startsWith('text/')) parte.texto = bytesParaTexto(conteudo);
    partes.push(parte);
  }
  return partes;
}

/* ---------- Diálogo SMTP ---------- */

export interface LinhaDialogo {
  quem: 'C' | 'S';
  texto: string;
  codigo?: number;
}

export interface ResultadoSmtp {
  linhas: LinhaDialogo[];
  /** Códigos de resposta do servidor, em ordem. */
  codigos: number[];
  aceitos: string[];
  recusados: string[];
  entregue: boolean;
  passos: string[];
}

/** Diálogo SMTP linha a linha entre dois agentes de transferência (ou entre o agente do usuário e o seu servidor). */
export function dialogoSmtp(dados: {
  cliente: string;
  servidor: string;
  de: string;
  para: string[];
  mensagem: string;
  /** Quem o servidor aceita como destinatário (padrão: todos). */
  aceita?: (endereco: string) => boolean;
  /** `EHLO` (SMTP estendido, padrão) ou `HELO` (o original). */
  saudacao?: 'EHLO' | 'HELO';
}): ResultadoSmtp {
  const linhas: LinhaDialogo[] = [];
  const codigos: number[] = [];
  const passos: string[] = [];
  const S = (codigo: number, texto: string, continua = false) => {
    linhas.push({ quem: 'S', texto: `${codigo}${continua ? '-' : ' '}${texto}`, codigo });
    if (!continua) codigos.push(codigo);
  };
  const C = (texto: string) => linhas.push({ quem: 'C', texto });
  const aceita = dados.aceita ?? (() => true);
  const aceitos: string[] = [];
  const recusados: string[] = [];

  passos.push(`${dados.cliente} abre uma conexão TCP com ${dados.servidor} na porta 25; quem fala primeiro é o servidor.`);
  S(220, `${dados.servidor} ESMTP pronto`);
  const sauda = dados.saudacao ?? 'EHLO';
  C(`${sauda} ${dados.cliente}`);
  if (sauda === 'EHLO') {
    S(250, `${dados.servidor} olá ${dados.cliente}`, true);
    S(250, 'SIZE 10485760', true);
    S(250, '8BITMIME', true);
    S(250, 'STARTTLS');
    passos.push('EHLO pede a lista de extensões (tamanho máximo, 8 bits, STARTTLS para cifrar o restante).');
  } else {
    S(250, `${dados.servidor} olá ${dados.cliente}`);
  }
  C(`MAIL FROM:<${dados.de}>`);
  S(250, 'Remetente ok');
  passos.push('MAIL FROM diz o remetente do envelope (para onde voltam os avisos de erro).');
  for (const p of dados.para) {
    C(`RCPT TO:<${p}>`);
    if (aceita(p)) {
      S(250, 'Destinatário ok');
      aceitos.push(p);
    } else {
      S(550, 'Caixa de correio inexistente');
      recusados.push(p);
    }
  }
  passos.push('Um RCPT TO por destinatário; o envelope pode diferir do To que aparece na mensagem.');
  if (aceitos.length === 0) {
    C('QUIT');
    S(221, `${dados.servidor} encerrando`);
    passos.push('Nenhum destinatário aceito: nada de DATA, a conexão se fecha.');
    return { linhas, codigos, aceitos, recusados, entregue: false, passos };
  }
  C('DATA');
  S(354, 'Envie a mensagem; termine com uma linha só com ponto');
  for (const l of dados.mensagem.split(/\r?\n/)) C(l.startsWith('.') ? '.' + l : l);
  C('.');
  S(250, `Mensagem aceita, fila ${resumo32(dados.mensagem).slice(0, 6)}`);
  passos.push('Depois do DATA vai a mensagem inteira (cabeçalhos, linha em branco, corpo); linha que começa com ponto ganha outro ponto.');
  passos.push('A linha só com ponto encerra a mensagem e o servidor assume a responsabilidade pela entrega (250).');
  C('QUIT');
  S(221, `${dados.servidor} encerrando`);
  return { linhas, codigos, aceitos, recusados, entregue: true, passos };
}

/* ---------- Envio completo e entrega final ---------- */

export interface ResultadoEnvio {
  mensagem: MensagemCorreio;
  servidorDestino: ServidorCorreio | null;
  smtp: ResultadoSmtp[];
  /** Caixa de correio do destino, por endereço. */
  caixas: Record<string, MensagemCorreio[]>;
  passos: string[];
}

/**
 * Do agente do usuário à caixa de correio: submissão ao servidor do remetente, consulta MX do destino,
 * SMTP entre os servidores e um `Received` a cada salto.
 */
export function enviarCorreio(
  espaco: EspacoNomes,
  dados: {
    de: string;
    para: string;
    assunto: string;
    corpo: string;
    data: Date;
    servidorRemetente: { nome: string; ip: string };
    ipCliente: string;
    /** Caixas que existem no destino (padrão: aceita qualquer uma). */
    caixasExistentes?: string[];
  },
  opcoes: OpcoesResolucao = {},
): ResultadoEnvio {
  const passos: string[] = [];
  let msg = montarMensagem({ de: dados.de, para: [dados.para], assunto: dados.assunto, data: dados.data, corpo: dados.corpo });
  passos.push(`O agente do usuário monta a mensagem e a submete a ${dados.servidorRemetente.nome} (porta 587, com autenticação).`);
  const sub = dialogoSmtp({
    cliente: 'estacao.' + (dominioDe(dados.de) || 'exemplo'),
    servidor: dados.servidorRemetente.nome,
    de: dados.de,
    para: [dados.para],
    mensagem: serializarMensagem(msg),
  });
  msg = adicionarReceived(msg, {
    de: 'estacao',
    ipDe: dados.ipCliente,
    por: dados.servidorRemetente.nome,
    data: dados.data,
    protocolo: 'ESMTPSA',
  });
  const destino = servidorDeCorreio(espaco, dominioDe(dados.para), opcoes);
  const caixas: Record<string, MensagemCorreio[]> = {};
  if (!destino) {
    passos.push('Sem servidor de destino: o servidor do remetente devolve um aviso de não entrega ao remetente.');
    return { mensagem: msg, servidorDestino: null, smtp: [sub], caixas, passos };
  }
  passos.push(`${dados.servidorRemetente.nome} consulta o MX de ${destino.dominio} e acha ${destino.mx} (${destino.ip}).`);
  const existentes = dados.caixasExistentes?.map((e) => e.toLowerCase());
  const rel = dialogoSmtp({
    cliente: dados.servidorRemetente.nome,
    servidor: destino.mx,
    de: dados.de,
    para: [dados.para],
    mensagem: serializarMensagem(msg),
    aceita: existentes ? (e) => existentes.includes(e.toLowerCase()) : undefined,
  });
  if (rel.entregue) {
    msg = adicionarReceived(msg, {
      de: dados.servidorRemetente.nome,
      ipDe: dados.servidorRemetente.ip,
      por: destino.mx,
      data: new Date(dados.data.getTime() + 2000),
    });
    caixas[dados.para] = [msg];
    passos.push(`${destino.mx} grava a mensagem na caixa de ${dados.para}; agora há ${cabecalhos(msg, 'Received').length} cabeçalhos Received.`);
  } else {
    passos.push(`${destino.mx} recusou ${dados.para}; o remetente recebe um aviso de erro.`);
  }
  return { mensagem: msg, servidorDestino: destino, smtp: [sub, rel], caixas, passos };
}

/** Busca da caixa com IMAP ou POP3, em linhas gerais (o diálogo resumido e o que muda entre os dois). */
export function entregaFinal(
  protocolo: 'imap' | 'pop3',
  usuario: string,
  caixa: MensagemCorreio[],
): { linhas: LinhaDialogo[]; ficaNoServidor: boolean; passos: string[] } {
  const linhas: LinhaDialogo[] = [];
  const C = (t: string) => linhas.push({ quem: 'C', texto: t });
  const S = (t: string) => linhas.push({ quem: 'S', texto: t });
  const tam = caixa.map((m) => serializarMensagem(m).length);
  if (protocolo === 'pop3') {
    S('+OK servidor POP3 pronto');
    C(`USER ${usuario}`);
    S('+OK');
    C('PASS ********');
    S(`+OK ${caixa.length} mensagem(ns)`);
    C('LIST');
    S('+OK');
    tam.forEach((t, i) => S(`${i + 1} ${t}`));
    S('.');
    caixa.forEach((_, i) => {
      C(`RETR ${i + 1}`);
      S(`+OK ${tam[i]} octetos`);
      C(`DELE ${i + 1}`);
      S('+OK apagada');
    });
    C('QUIT');
    S('+OK até logo');
    return {
      linhas,
      ficaNoServidor: false,
      passos: [
        'POP3 (porta 110, ou 995 com TLS): baixa e, no modo comum, apaga do servidor.',
        'Simples, mas ruim para quem lê em vários aparelhos: cada um baixa uma cópia e as pastas não se sincronizam.',
      ],
    };
  }
  S('* OK servidor IMAP pronto');
  C(`a1 LOGIN ${usuario} ********`);
  S('a1 OK');
  C('a2 SELECT INBOX');
  S(`* ${caixa.length} EXISTS`);
  S('a2 OK [READ-WRITE]');
  caixa.forEach((m, i) => {
    C(`a${3 + i} FETCH ${i + 1} (FLAGS BODY[HEADER.FIELDS (SUBJECT FROM)])`);
    S(`* ${i + 1} FETCH (Subject: ${cabecalho(m, 'Subject') ?? ''})`);
    S(`a${3 + i} OK`);
  });
  C('z LOGOUT');
  S('* BYE');
  return {
    linhas,
    ficaNoServidor: true,
    passos: [
      'IMAP (porta 143, ou 993 com TLS): as mensagens e as pastas ficam no servidor; o programa só sincroniza.',
      'Dá para baixar só os cabeçalhos ou partes do MIME, e várias telas veem o mesmo estado (lida, apagada, movida).',
      'Correio pela web troca IMAP por HTTP entre o navegador e o servidor, mas entre servidores continua sendo SMTP.',
    ],
  };
}

/* ======================================================================
 * 3. Web e HTTP
 * ====================================================================== */

/* ---------- URL ---------- */

export const PORTAS_PADRAO: Record<string, number> = { http: 80, https: 443, ftp: 21, ws: 80, wss: 443 };

export interface Url {
  esquema: string;
  usuario?: string;
  nome: string;
  porta: number;
  /** Verdadeiro se a porta não veio escrita e foi deduzida do esquema. */
  portaPadrao: boolean;
  caminho: string;
  consultaBruta: string;
  consulta: Record<string, string>;
  fragmento: string;
}

/** Lê `esquema://[usuário@]nome[:porta][/caminho][?consulta][#fragmento]`. Devolve null se não for uma URL absoluta. */
export function lerUrl(texto: string): Url | null {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(?:([^@/?#]*)@)?(\[[^\]]+\]|[^:/?#]*)(?::(\d+))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(
    texto.trim(),
  );
  if (!m) return null;
  const esquema = m[1]!.toLowerCase();
  const nome = m[3]!.toLowerCase();
  if (!nome) return null;
  const portaTxt = m[4];
  const porta = portaTxt ? Number(portaTxt) : PORTAS_PADRAO[esquema] ?? 0;
  if (porta < 0 || porta > 65535) return null;
  const consultaBruta = m[6] ?? '';
  const consulta: Record<string, string> = {};
  for (const par of consultaBruta.split('&')) {
    if (!par) continue;
    const i = par.indexOf('=');
    const k = decodeURIComponent((i < 0 ? par : par.slice(0, i)).replace(/\+/g, ' '));
    const v = i < 0 ? '' : decodeURIComponent(par.slice(i + 1).replace(/\+/g, ' '));
    consulta[k] = v;
  }
  return {
    esquema,
    usuario: m[2] || undefined,
    nome,
    porta,
    portaPadrao: !portaTxt,
    caminho: m[5] || '/',
    consultaBruta,
    consulta,
    fragmento: m[7] ?? '',
  };
}

export function descreverUrl(u: Url): string[] {
  return [
    `Esquema: ${u.esquema} (diz o protocolo da camada de aplicação)`,
    `Nome: ${u.nome} (vai para o DNS virar endereço IP)`,
    `Porta: ${u.porta}${u.portaPadrao ? ' (padrão do esquema, não veio escrita)' : ''}`,
    `Caminho: ${u.caminho} (o recurso dentro do servidor)`,
    `Consulta: ${u.consultaBruta ? Object.entries(u.consulta).map(([k, v]) => `${k}=${v}`).join(', ') : 'nenhuma'}`,
    ...(u.fragmento ? [`Fragmento: ${u.fragmento} (fica no navegador, nunca vai ao servidor)`] : []),
  ];
}

/* ---------- Mensagens HTTP ---------- */

export type MetodoHttp = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS' | 'PATCH';

export const FRASES_ESTADO: Record<number, string> = {
  100: 'Continue',
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

export const CLASSES_ESTADO: Record<number, string> = {
  1: 'informativo',
  2: 'sucesso',
  3: 'redirecionamento',
  4: 'erro do cliente',
  5: 'erro do servidor',
};

export interface RequisicaoHttp {
  metodo: MetodoHttp;
  caminho: string;
  versao: string;
  cabecalhos: Record<string, string>;
  corpo: string;
}

export interface RespostaHttp {
  versao: string;
  estado: number;
  frase: string;
  cabecalhos: Record<string, string>;
  corpo: string;
}

function minusculas(c: Record<string, string>): Record<string, string> {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) r[k.toLowerCase()] = v;
  return r;
}

export function serializarRequisicao(r: RequisicaoHttp): string {
  const cab = Object.entries(r.cabecalhos).map(([k, v]) => `${k}: ${v}\r\n`).join('');
  return `${r.metodo} ${r.caminho} ${r.versao}\r\n${cab}\r\n${r.corpo}`;
}

export function serializarResposta(r: RespostaHttp): string {
  const cab = Object.entries(r.cabecalhos).map(([k, v]) => `${k}: ${v}\r\n`).join('');
  return `${r.versao} ${r.estado} ${r.frase}\r\n${cab}\r\n${r.corpo}`;
}

function lerCabecalhosHttp(linhas: string[]): Record<string, string> {
  const c: Record<string, string> = {};
  for (const l of linhas) {
    const i = l.indexOf(':');
    if (i > 0) c[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  return c;
}

export function lerRequisicao(texto: string): RequisicaoHttp | null {
  const corte = texto.indexOf('\r\n\r\n');
  const topo = (corte < 0 ? texto : texto.slice(0, corte)).split('\r\n');
  const m = /^([A-Z]+) (\S+) (HTTP\/\d\.\d)$/.exec(topo[0] ?? '');
  if (!m) return null;
  return {
    metodo: m[1] as MetodoHttp,
    caminho: m[2]!,
    versao: m[3]!,
    cabecalhos: lerCabecalhosHttp(topo.slice(1)),
    corpo: corte < 0 ? '' : texto.slice(corte + 4),
  };
}

export function lerResposta(texto: string): RespostaHttp | null {
  const corte = texto.indexOf('\r\n\r\n');
  const topo = (corte < 0 ? texto : texto.slice(0, corte)).split('\r\n');
  const m = /^(HTTP\/\d\.\d) (\d{3}) ?(.*)$/.exec(topo[0] ?? '');
  if (!m) return null;
  return {
    versao: m[1]!,
    estado: Number(m[2]),
    frase: m[3]!,
    cabecalhos: lerCabecalhosHttp(topo.slice(1)),
    corpo: corte < 0 ? '' : texto.slice(corte + 4),
  };
}

export function novaResposta(estado: number, cabecalhos: Record<string, string> = {}, corpo = ''): RespostaHttp {
  return { versao: 'HTTP/1.1', estado, frase: FRASES_ESTADO[estado] ?? '', cabecalhos, corpo };
}

/* ---------- Servidor web (páginas estáticas e dinâmicas) ---------- */

export interface ContextoDinamico {
  requisicao: RequisicaoHttp;
  cookies: Record<string, string>;
  agora: number;
  /** Estado guardado no servidor (por exemplo, visitas por sessão). */
  estado: Map<string, unknown>;
}

export type Recurso =
  | {
      tipo: 'estatico';
      conteudo: string;
      tipoMime?: string;
      /** Segundos do relógio do jogo em que o arquivo mudou pela última vez. */
      modificado?: number;
      maxAge?: number;
    }
  | {
      tipo: 'dinamico';
      gerar: (ctx: ContextoDinamico) => { corpo: string; estado?: number; cabecalhos?: Record<string, string> };
    };

export function lerCookies(cabecalho: string | undefined): Record<string, string> {
  const r: Record<string, string> = {};
  for (const par of (cabecalho ?? '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) r[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
  return r;
}

/**
 * ETag forte derivado do conteúdo (RFC 9110, §8.8.3): conteúdo igual dá o mesmo ETag, qualquer mudança dá outro.
 * O resumo FNV-1a de 32 bits não é criptográfico; basta para um validador (colisão entre versões é improvável).
 */
export function etagDe(conteudo: string): string {
  return `"${resumo32(conteudo)}"`;
}

/** Comparação fraca de ETag (RFC 9110, §8.8.3.2), a que o If-None-Match usa: ignora o prefixo W/. */
function etagFraco(a: string, b: string): boolean {
  const tira = (x: string) => x.trim().replace(/^W\//, '');
  return tira(a) === tira(b);
}

/** Instante zero do relógio do mundo: 26 de novembro de 2026, 12:00:00 UTC (o mesmo do correio). */
export const EPOCA_MUNDO_MS = Date.UTC(2026, 10, 26, 12, 0, 0);

const dois = (x: number) => String(x).padStart(2, '0');

/** Data HTTP no formato IMF-fixdate (RFC 9110, §5.6.7) de um instante do relógio do mundo, em segundos. */
export function dataHttp(segundos: number): string {
  const d = new Date(EPOCA_MUNDO_MS + Math.floor(segundos) * 1000);
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${dois(d.getUTCDate())} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}:${dois(d.getUTCSeconds())} GMT`;
}

/**
 * Lê uma data HTTP e devolve o instante no relógio do mundo, em segundos (pode ser negativo). Aceita o IMF-fixdate e,
 * como a RFC 9110 (§5.6.7) pede a quem recebe, os dois formatos obsoletos: o da RFC 850 e o do asctime(). Data que
 * não se lê vira null, e quem recebe ignora o cabeçalho.
 */
export function lerDataHttp(txt: string): number | null {
  const mes = (m: string) => MESES.indexOf(m);
  let ano: number, mm: number, dia: number, h: number, mi: number, s: number;
  let x = /^\w{3}, (\d{2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(txt.trim());
  if (x) [dia, mm, ano, h, mi, s] = [Number(x[1]), mes(x[2]!), Number(x[3]), Number(x[4]), Number(x[5]), Number(x[6])];
  else if ((x = /^\w+, (\d{2})-(\w{3})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(txt.trim()))) {
    // Ano de dois dígitos: o século que não deixa a data mais de 50 anos no futuro.
    const yy = Number(x[3]);
    [dia, mm, ano, h, mi, s] = [Number(x[1]), mes(x[2]!), yy + (2000 + yy > 2026 + 50 ? 1900 : 2000), Number(x[4]), Number(x[5]), Number(x[6])];
  } else if ((x = /^\w{3} (\w{3}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(txt.trim()))) {
    [dia, mm, ano, h, mi, s] = [Number(x[2]), mes(x[1]!), Number(x[6]), Number(x[3]), Number(x[4]), Number(x[5])];
  } else return null;
  if (mm < 0 || dia < 1 || dia > 31 || h > 23 || mi > 59 || s > 60) return null;
  return (Date.UTC(ano, mm, dia, h, mi, s) - EPOCA_MUNDO_MS) / 1000;
}

/** Servidor HTTP/1.1 mínimo. Dá a cada navegador novo um cookie de sessão e responde 304 a quem já tem a versão certa. */
export class ServidorWeb {
  readonly recursos = new Map<string, Recurso>();
  readonly estado = new Map<string, unknown>();
  /** Registro de acesso: o que o servidor fica sabendo a cada pedido. */
  readonly registro: { caminho: string; cookies: Record<string, string>; referer?: string; agora: number }[] = [];
  private proximaSessao = 1;

  constructor(
    readonly nome: string,
    readonly opcoes: { cookieSessao?: string; prefixoSessao?: string } = {},
  ) {}

  publicar(caminho: string, recurso: Recurso): this {
    this.recursos.set(caminho, recurso);
    return this;
  }

  atender(req: RequisicaoHttp, agora = 0): RespostaHttp {
    const cab = minusculas(req.cabecalhos);
    const cookies = lerCookies(cab['cookie']);
    const caminho = req.caminho.split('?')[0]!;
    this.registro.push({ caminho: req.caminho, cookies, referer: cab['referer'], agora });
    const extra: Record<string, string> = {};
    const nomeCookie = this.opcoes.cookieSessao;
    if (nomeCookie && !cookies[nomeCookie]) {
      const id = `${this.opcoes.prefixoSessao ?? 's'}${this.proximaSessao++}`;
      cookies[nomeCookie] = id;
      extra['Set-Cookie'] = `${nomeCookie}=${id}; Path=/; HttpOnly`;
    }
    const r = this.recursos.get(caminho);
    if (!r) return novaResposta(404, { ...extra, 'Content-Length': '0' });
    if (req.metodo !== 'GET' && req.metodo !== 'HEAD' && r.tipo === 'estatico') {
      return novaResposta(405, { ...extra, Allow: 'GET, HEAD' });
    }
    if (r.tipo === 'dinamico') {
      const g = r.gerar({ requisicao: req, cookies, agora, estado: this.estado });
      return novaResposta(g.estado ?? 200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        ...g.cabecalhos,
        ...extra,
        'Content-Length': String(g.corpo.length),
      }, req.metodo === 'HEAD' ? '' : g.corpo);
    }
    const etag = etagDe(r.conteudo);
    // Datas HTTP têm resolução de 1 s: o que vale é o segundo inteiro (RFC 9110, §8.8.2).
    const modificado = Math.floor(r.modificado ?? 0);
    const base: Record<string, string> = {
      ...extra,
      // Servidor com relógio manda Date em toda resposta (RFC 9110, §6.6.1).
      Date: dataHttp(agora),
      ETag: etag,
      'Last-Modified': dataHttp(Math.min(modificado, Math.floor(agora))),
      'Cache-Control': `max-age=${r.maxAge ?? 0}`,
    };
    const inm = cab['if-none-match'];
    const ims = cab['if-modified-since'] !== undefined ? lerDataHttp(cab['if-modified-since']) : null;
    // If-None-Match decide sozinho quando vem (comparação fraca, "*" casa qualquer um); só sem ele o
    // If-Modified-Since é avaliado, e data ilegível é ignorada (RFC 9110, §13.1.2, §13.1.3 e §13.2.2).
    const naoMudou =
      inm !== undefined ? inm.trim() === '*' || inm.split(',').some((x) => etagFraco(x, etag)) : ims !== null && modificado <= ims;
    if (naoMudou) return novaResposta(304, base);
    return novaResposta(
      200,
      { 'Content-Type': r.tipoMime ?? 'text/html; charset=utf-8', ...base, 'Content-Length': String(r.conteudo.length) },
      req.metodo === 'HEAD' ? '' : r.conteudo,
    );
  }
}

/* ---------- Navegador (cookies e cache) ---------- */

interface EntradaCacheHttp {
  resposta: RespostaHttp;
  recebida: number;
  maxAge: number;
  etag?: string;
  modificado?: string;
}

export interface Busca {
  resposta: RespostaHttp;
  /** `cache`: nem foi à rede; `validado`: perguntou e ouviu 304; `rede`: veio o objeto inteiro. */
  origem: 'cache' | 'validado' | 'rede';
  requisicao?: RequisicaoHttp;
  passos: string[];
}

/** Navegador com pote de cookies por nome de servidor e cache HTTP privado. */
export class Navegador {
  readonly cookies = new Map<string, Record<string, string>>();
  readonly cache = new Map<string, EntradaCacheHttp>();

  constructor(readonly opcoes: { bloquearTerceiros?: boolean; agenteUsuario?: string } = {}) {}

  /** Busca uma URL. `site` é o site que está na barra de endereço (para saber se o pedido é de terceiro). */
  buscar(
    servidores: Map<string, ServidorWeb> | Record<string, ServidorWeb>,
    url: string,
    agora = 0,
    site?: string,
  ): Busca {
    const u = lerUrl(url);
    if (!u) throw new Error(`URL inválida: ${url}`);
    const mapa = servidores instanceof Map ? servidores : new Map(Object.entries(servidores));
    const servidor = mapa.get(u.nome);
    const passos: string[] = [];
    // A chave do cache é a URI do pedido (RFC 9111, §2): esquema, nome e porta (http e https nunca se misturam).
    // A porta padrão do esquema fica de fora, como na normalização da RFC 3986, §6.2.3.
    const chave = `${u.esquema}://${u.nome}${u.porta === PORTAS_PADRAO[u.esquema] ? '' : `:${u.porta}`}${u.caminho}${u.consultaBruta ? '?' + u.consultaBruta : ''}`;
    const terceiro = site !== undefined && site !== u.nome;
    const salvo = this.cache.get(chave);
    if (salvo && agora - salvo.recebida < salvo.maxAge) {
      passos.push(`Cache do navegador: ${chave} ainda está fresco (idade ${agora - salvo.recebida} s de ${salvo.maxAge} s); nada vai à rede.`);
      return { resposta: salvo.resposta, origem: 'cache', passos };
    }
    const cab: Record<string, string> = {
      Host: u.nome + (u.portaPadrao ? '' : `:${u.porta}`),
      'User-Agent': this.opcoes.agenteUsuario ?? 'NavegadorDidatico/1.0',
      Accept: '*/*',
      Connection: 'keep-alive',
    };
    if (site) cab['Referer'] = `https://${site}/`;
    const pote = this.cookies.get(u.nome);
    const enviaCookie = pote && Object.keys(pote).length && !(terceiro && this.opcoes.bloquearTerceiros);
    if (enviaCookie) {
      cab['Cookie'] = Object.entries(pote).map(([k, v]) => `${k}=${v}`).join('; ');
      passos.push(`O navegador devolve o cookie que ${u.nome} definiu antes: ${cab['Cookie']}.`);
    }
    if (salvo) {
      if (salvo.etag) cab['If-None-Match'] = salvo.etag;
      if (salvo.modificado) cab['If-Modified-Since'] = salvo.modificado;
      passos.push(`Cópia vencida no cache: pede de novo, mas condicional (If-None-Match ${salvo.etag ?? 'nenhum'}).`);
    }
    const req: RequisicaoHttp = { metodo: 'GET', caminho: u.caminho + (u.consultaBruta ? '?' + u.consultaBruta : ''), versao: 'HTTP/1.1', cabecalhos: cab, corpo: '' };
    if (!servidor) {
      passos.push(`Nenhum servidor responde por ${u.nome}.`);
      return { resposta: novaResposta(503), origem: 'rede', requisicao: req, passos };
    }
    const resp = servidor.atender(req, agora);
    const rc = minusculas(resp.cabecalhos);
    passos.push(`GET ${req.caminho} em ${u.nome}: ${resp.estado} ${resp.frase}.`);
    const setCookie = rc['set-cookie'];
    if (setCookie) {
      if (terceiro && this.opcoes.bloquearTerceiros) {
        passos.push(`${u.nome} tentou definir cookie como terceiro dentro de ${site}; o navegador recusou.`);
      } else {
        const [par] = setCookie.split(';');
        const i = par!.indexOf('=');
        const novo = { ...(this.cookies.get(u.nome) ?? {}), [par!.slice(0, i).trim()]: par!.slice(i + 1).trim() };
        this.cookies.set(u.nome, novo);
        passos.push(`O servidor definiu um cookie (Set-Cookie: ${par}); o navegador guarda e devolverá nos próximos pedidos a ${u.nome}.`);
      }
    }
    const maxAge = Number(/max-age=(\d+)/.exec(rc['cache-control'] ?? '')?.[1] ?? 0);
    const semCache = /no-store/.test(rc['cache-control'] ?? '');
    if (resp.estado === 304 && salvo) {
      salvo.recebida = agora;
      salvo.maxAge = maxAge;
      passos.push('304 Not Modified: o objeto não mudou; usa a cópia do cache e economiza o corpo inteiro.');
      return { resposta: salvo.resposta, origem: 'validado', requisicao: req, passos };
    }
    if (resp.estado === 200 && !semCache) {
      this.cache.set(chave, { resposta: resp, recebida: agora, maxAge, etag: rc['etag'], modificado: rc['last-modified'] });
    }
    return { resposta: resp, origem: 'rede', requisicao: req, passos };
  }
}

/* ---------- Conexões persistentes, pipelining e HTTP/2 ---------- */

export type ModoConexao = 'nao-persistente' | 'persistente' | 'pipelining' | 'http2';

export interface ResultadoRtts {
  rtts: number;
  conexoes: number;
  tempo: number;
  passos: string[];
}

/**
 * RTTs para carregar uma página base mais N objetos (sem contar o DNS):
 * não persistente: 2 RTT por objeto (1 do aperto de mão TCP, 1 do pedido e resposta);
 * persistente sem pipelining: 2 RTT para a base e 1 RTT por objeto;
 * pipelining e HTTP/2: 2 RTT para a base e 1 RTT para todos os objetos juntos.
 * `paralelas` só vale no não persistente (navegadores abrem várias conexões ao mesmo tempo).
 * `tls` acrescenta 1 RTT (TLS 1.3) ou 2 RTT (TLS 1.2) por conexão.
 */
export function rttsPagina(dados: {
  objetos: number;
  modo: ModoConexao;
  rtt: number;
  paralelas?: number;
  tls?: 'nenhum' | '1.2' | '1.3';
  /** Tempo de transmissão de cada objeto (ms), somado por objeto. */
  transmissao?: number;
}): ResultadoRtts {
  const n = Math.max(0, Math.floor(dados.objetos));
  const tlsRtt = dados.tls === '1.2' ? 2 : dados.tls === '1.3' ? 1 : 0;
  const passos: string[] = [];
  let rtts: number;
  let conexoes: number;
  let rodadas = 0;
  switch (dados.modo) {
    case 'nao-persistente': {
      const p = Math.max(1, dados.paralelas ?? 1);
      rodadas = Math.ceil(n / p);
      conexoes = n + 1;
      rtts = (2 + tlsRtt) * (1 + rodadas);
      passos.push(`Página base: 2 RTT (TCP + pedido)${tlsRtt ? ` + ${tlsRtt} de TLS` : ''}.`);
      passos.push(
        p === 1
          ? `Cada um dos ${n} objetos abre e fecha a própria conexão: ${2 + tlsRtt} RTT cada.`
          : `${n} objetos em ${p} conexões paralelas: ${rodadas} rodada(s) de ${2 + tlsRtt} RTT.`,
      );
      break;
    }
    case 'persistente':
      conexoes = 1;
      rtts = 2 + tlsRtt + n;
      passos.push(`Uma conexão só: 2 RTT para a base${tlsRtt ? ` + ${tlsRtt} de TLS` : ''}, depois 1 RTT por objeto, um de cada vez (${n}).`);
      break;
    case 'pipelining':
      conexoes = 1;
      rtts = 2 + tlsRtt + (n > 0 ? 1 : 0);
      passos.push('Pipelining: os pedidos dos objetos saem todos de uma vez e as respostas voltam em ordem, em cerca de 1 RTT.');
      passos.push('Problema: uma resposta lenta segura as de trás (bloqueio de cabeça de fila no HTTP/1.1).');
      break;
    case 'http2':
      conexoes = 1;
      rtts = 2 + tlsRtt + (n > 0 ? 1 : 0);
      passos.push('HTTP/2: uma conexão, vários fluxos intercalados em quadros; respostas voltam fora de ordem e a lenta não segura as outras.');
      passos.push('Ainda há bloqueio de cabeça de fila no TCP quando um segmento se perde; o HTTP/3 vai para QUIC sobre UDP para escapar disso.');
      break;
  }
  const tempo = rtts * dados.rtt + (n + 1) * (dados.transmissao ?? 0);
  passos.push(`Total: ${rtts} RTT em ${conexoes} conexão(ões), ${fmt(tempo, 1)} ms com RTT de ${fmt(dados.rtt, 2)} ms.`);
  return { rtts, conexoes, tempo, passos };
}

/** HTTPS em linhas gerais: TCP, depois TLS, só então o HTTP vai dentro do túnel cifrado. */
export function passosHttps(url: string, versaoTls: '1.2' | '1.3' = '1.3'): string[] {
  const u = lerUrl(url);
  const nome = u?.nome ?? url;
  return [
    `DNS: ${nome} vira endereço IP (fora do túnel, a menos que use DoH ou DoT).`,
    `TCP: aperto de mão em três vias com a porta ${u?.porta ?? 443} (1 RTT).`,
    `TLS ${versaoTls}: o cliente manda ClientHello com o nome do servidor (SNI, ainda visível para a rede) e as cifras que aceita.`,
    'O servidor responde com o certificado; o navegador confere a cadeia até uma autoridade em que confia e se o nome bate.',
    `Troca de chaves (Diffie-Hellman efêmero): os dois chegam à mesma chave de sessão sem ela passar pelo fio (${versaoTls === '1.3' ? '1 RTT' : '2 RTT'}).`,
    'Só agora o HTTP começa, cifrado: quem escuta vê o nome (SNI), o IP, os tamanhos e os horários, mas não o caminho, os cookies nem o conteúdo.',
  ];
}

/* ---------- Privacidade na web ---------- */

export interface PaginaComTerceiros {
  /** Nome do site na barra de endereço. */
  site: string;
  /** URLs embutidas (imagens, scripts) que o navegador busca ao abrir a página. */
  objetos: string[];
}

export interface ResultadoRastreamento {
  /** Histórico que o rastreador montou, por identificador de cookie. */
  historico: Record<string, string[]>;
  /** Quantos sites o maior perfil cobre. */
  maiorPerfil: number;
  passos: string[];
}

/**
 * Um rastreador embutido em vários sites (um pixel ou um script) recebe um cookie de terceiro e o `Referer`
 * de cada página: com isso junta, sob o mesmo identificador, o histórico de navegação da pessoa.
 */
export function simularRastreamento(
  sites: string[],
  rastreador = 'pixel.rastreio.exemplo',
  opcoes: { bloquearTerceiros?: boolean } = {},
): ResultadoRastreamento {
  const servidores = new Map<string, ServidorWeb>();
  const pixel = new ServidorWeb(rastreador, { cookieSessao: 'uid', prefixoSessao: 'u' });
  pixel.publicar('/p.gif', { tipo: 'dinamico', gerar: () => ({ corpo: 'GIF89a', cabecalhos: { 'Content-Type': 'image/gif' } }) });
  servidores.set(rastreador, pixel);
  for (const s of sites) {
    servidores.set(s, new ServidorWeb(s).publicar('/', { tipo: 'estatico', conteudo: `<html>${s}<img src="https://${rastreador}/p.gif"></html>` }));
  }
  const nav = new Navegador({ bloquearTerceiros: opcoes.bloquearTerceiros });
  const passos: string[] = [];
  sites.forEach((s, i) => {
    nav.buscar(servidores, `https://${s}/`, i * 60);
    const b = nav.buscar(servidores, `https://${rastreador}/p.gif`, i * 60, s);
    passos.push(`Visita a ${s}: a página embute ${rastreador}. ${b.passos.filter((p) => /cookie/i.test(p)).join(' ')}`.trim());
  });
  // O pedido que recebeu o cookie novo chega sem cookie; atribui ao id que o servidor criou nessa resposta.
  const corrigido: Record<string, string[]> = {};
  let criados = 0;
  for (const r of pixel.registro) {
    const id = r.cookies['uid'] ?? `u${++criados}`;
    const site = r.referer ? lerUrl(r.referer)?.nome ?? '?' : '?';
    (corrigido[id] ??= []).push(site);
  }
  const maior = Math.max(0, ...Object.values(corrigido).map((l) => new Set(l).size));
  passos.push(
    opcoes.bloquearTerceiros
      ? `Com cookies de terceiros bloqueados, cada visita parece de uma pessoa diferente: ${Object.keys(corrigido).length} identificadores, nenhum com mais de ${maior} site.`
      : `O rastreador juntou ${maior} sites sob o mesmo identificador: ${Object.entries(corrigido).map(([k, v]) => `${k} = ${v.join(', ')}`).join('; ')}.`,
    'Mesmo sem cookie, o rastreador ainda vê o IP e pode tentar a impressão digital do navegador.',
  );
  return { historico: corrigido, maiorPerfil: maior, passos };
}

export interface AtributoNavegador {
  nome: string;
  valor: string;
  /** Fração dos navegadores que têm esse mesmo valor (de 0 a 1). */
  fracao: number;
}

/**
 * Impressão digital do navegador em linhas gerais: cada atributo raro acrescenta bits de identificação
 * (menos log2 da fração). Somados (supondo independência, o que é otimista), dizem "1 em quantos".
 */
export function impressaoDigital(atributos: AtributoNavegador[]): {
  bits: number;
  umEm: number;
  identificador: string;
  passos: string[];
} {
  let bits = 0;
  const passos: string[] = [];
  for (const a of atributos) {
    const b = -Math.log2(Math.min(1, Math.max(a.fracao, 1e-9)));
    bits += b;
    passos.push(`${a.nome} = ${a.valor}: ${fmt(a.fracao * 100, 2)}% dos navegadores têm igual, ${fmt(b, 2)} bits.`);
  }
  const umEm = Math.round(2 ** bits);
  passos.push(`Somando: cerca de ${fmt(bits, 1)} bits, ou seja, 1 em ${umEm} navegadores. Uns 33 bits bastam para separar qualquer pessoa conectada.`);
  return { bits: arred(bits, 3), umEm, identificador: resumo32(atributos.map((a) => `${a.nome}=${a.valor}`).join('|')), passos };
}

/* ======================================================================
 * 4. Streaming
 * ====================================================================== */

/* ---------- Áudio digital ---------- */

/** Taxa de amostragem mínima para reproduzir uma frequência máxima sem distorção (Nyquist): o dobro. */
export function nyquist(frequenciaMaxima: number): number {
  return 2 * frequenciaMaxima;
}

/** Frequência que aparece de fato quando se amostra `f` a `fs` (dobramento, ou aliasing). */
export function frequenciaAparente(f: number, fs: number): number {
  return Math.abs(f - fs * Math.round(f / fs));
}

export function niveisQuantizacao(bits: number): number {
  return 2 ** bits;
}

/** Taxa de bits do áudio sem compressão: amostras por segundo × bits por amostra × canais. */
export function taxaAudio(dados: { amostragem: number; bits: number; canais: number }): {
  bps: number;
  kbps: number;
  bytesPorMinuto: number;
  passos: string[];
} {
  const bps = dados.amostragem * dados.bits * dados.canais;
  return {
    bps,
    kbps: bps / 1000,
    bytesPorMinuto: (bps * 60) / 8,
    passos: [
      `${dados.amostragem} amostras/s × ${dados.bits} bits × ${dados.canais} canal(is) = ${bps} b/s = ${fmt(bps / 1000, 1)} kb/s.`,
      `Pela regra de Nyquist, ${dados.amostragem} amostras/s guardam frequências até ${fmt(dados.amostragem / 2, 1)} Hz.`,
      `${dados.bits} bits dão ${niveisQuantizacao(dados.bits)} níveis de quantização.`,
      `Um minuto ocupa ${fmt((bps * 60) / 8 / 1e6, 2)} MB sem compressão.`,
    ],
  };
}

export const CD = { amostragem: 44100, bits: 16, canais: 2 } as const;
export const TELEFONE = { amostragem: 8000, bits: 8, canais: 1 } as const;

/** Quantização uniforme de amostras entre -1 e 1: devolve o valor reconstruído e o erro de cada amostra. */
export function quantizar(amostras: number[], bits: number): { codigos: number[]; valores: number[]; erroMaximo: number } {
  const n = niveisQuantizacao(bits);
  const passo = 2 / n;
  const codigos: number[] = [];
  const valores: number[] = [];
  let erroMaximo = 0;
  for (const x of amostras) {
    const c = Math.min(n - 1, Math.max(0, Math.floor((x + 1) / passo)));
    const v = -1 + (c + 0.5) * passo;
    codigos.push(c);
    valores.push(v);
    erroMaximo = Math.max(erroMaximo, Math.abs(v - x));
  }
  return { codigos, valores, erroMaximo };
}

/** Amostra um seno puro: útil para mostrar Nyquist e o dobramento. */
export function amostrarSeno(frequencia: number, amostragem: number, quantidade: number): number[] {
  return Array.from({ length: quantidade }, (_, i) => Math.sin((2 * Math.PI * frequencia * i) / amostragem));
}

export function razaoCompressao(taxaOriginal: number, taxaComprimida: number): number {
  return taxaOriginal / taxaComprimida;
}

export const COMPRESSAO_AUDIO: string[] = [
  'Sem perdas: reorganiza os bits e volta ao original exato; costuma reduzir à metade.',
  'Com perdas (psicoacústica): joga fora o que o ouvido não percebe, como sons mascarados por outros mais fortes ao lado em frequência ou tempo.',
  'Voz em chamadas usa taxas bem menores, porque só precisa da faixa da fala e aceita mais perda de fidelidade.',
];

/* ---------- Vídeo digital ---------- */

export function taxaVideo(dados: {
  largura: number;
  altura: number;
  quadrosPorSegundo: number;
  bitsPorPixel?: number;
  /** Quantas vezes o codificador reduz (por exemplo 100). */
  razaoCompressao?: number;
}): { semCompressao: number; comCompressao: number; passos: string[] } {
  const bpp = dados.bitsPorPixel ?? 24;
  const sem = dados.largura * dados.altura * bpp * dados.quadrosPorSegundo;
  const r = dados.razaoCompressao ?? 1;
  const com = sem / r;
  return {
    semCompressao: sem,
    comCompressao: com,
    passos: [
      `${dados.largura} × ${dados.altura} pixels × ${bpp} bits × ${dados.quadrosPorSegundo} quadros/s = ${fmt(sem / 1e6, 1)} Mb/s sem compressão.`,
      r > 1
        ? `Com razão de compressão ${r}: ${fmt(com / 1e6, 2)} Mb/s. A compressão aproveita a redundância dentro do quadro (espacial) e entre quadros (temporal).`
        : 'Sem compressão nenhuma rede doméstica daria conta; o codificador aproveita redundância espacial e temporal.',
    ],
  };
}

export const TIPOS_QUADRO: Record<'I' | 'P' | 'B', string> = {
  I: 'Quadro I (intra): imagem completa, comprimida sozinha; é o ponto de entrada para pular no vídeo, e o maior.',
  P: 'Quadro P (previsto): guarda só o que mudou em relação ao I ou P anterior, com vetores de movimento.',
  B: 'Quadro B (bidirecional): usa o anterior e o seguinte; é o menor, mas obriga a decodificar o seguinte antes.',
};

/** Ordem em que um grupo de quadros precisa ser decodificado (cada B espera a próxima âncora I ou P). */
export function ordemDecodificacao(padrao: string): string {
  const q = padrao.toUpperCase().split('');
  const saida: string[] = [];
  let pendentes: string[] = [];
  q.forEach((t, i) => {
    const r = `${t}${i}`;
    if (t === 'B') pendentes.push(r);
    else {
      saida.push(r, ...pendentes);
      pendentes = [];
    }
  });
  saida.push(...pendentes);
  return saida.join(' ');
}

/** Tamanho médio por quadro e taxa resultante para um padrão de GOP, dados os tamanhos típicos de I, P e B (bits). */
export function taxaGop(
  padrao: string,
  tamanhos: { I: number; P: number; B: number },
  quadrosPorSegundo: number,
): { bitsPorGop: number; mediaPorQuadro: number; taxa: number } {
  const q = padrao.toUpperCase().split('') as ('I' | 'P' | 'B')[];
  const bitsPorGop = q.reduce((s, t) => s + (tamanhos[t] ?? 0), 0);
  const media = bitsPorGop / Math.max(q.length, 1);
  return { bitsPorGop, mediaPorQuadro: media, taxa: media * quadrosPorSegundo };
}

/* ---------- Streaming de mídia armazenada com buffer ---------- */

function bandaEm(banda: number[], t: number): number {
  if (banda.length === 0) return 0;
  return banda[Math.min(banda.length - 1, Math.max(0, Math.floor(t)))]!;
}

export interface ResultadoBuffer {
  travamentos: number;
  /** Segundos parados esperando dados (sem contar o atraso inicial). */
  tempoTravado: number;
  /** Quando o vídeo terminou de tocar (s). */
  fim: number;
  /** Uma amostra por segundo: buffer em segundos de vídeo e se estava tocando. */
  linhaDoTempo: { t: number; buffer: number; estado: 'esperando' | 'tocando' | 'travado' }[];
  passos: string[];
}

/**
 * Vídeo de `duracao` segundos a `taxaVideo` kb/s chegando por uma rede de banda variável (kb/s por segundo).
 * O reprodutor espera `atrasoInicial` segundos antes de começar; se o buffer secar, trava até juntar `retomarCom` segundos.
 */
export function simularBuffer(dados: {
  duracao: number;
  taxaVideo: number;
  banda: number[];
  atrasoInicial: number;
  retomarCom?: number;
  dt?: number;
}): ResultadoBuffer {
  const dt = dados.dt ?? 0.1;
  const retomar = dados.retomarCom ?? 1;
  let baixado = 0;
  let tocado = 0;
  let travado = false;
  let travamentos = 0;
  let tempoTravado = 0;
  const linha: ResultadoBuffer['linhaDoTempo'] = [];
  const passos: string[] = [];
  let k = 0;
  const eps = 1e-9;
  const passosPorSeg = Math.round(1 / dt);
  while (tocado < dados.duracao - eps && k < 1e6) {
    const t = k * dt;
    baixado = Math.min(dados.duracao, baixado + (bandaEm(dados.banda, t) * dt) / dados.taxaVideo);
    const buffer = baixado - tocado;
    let estado: 'esperando' | 'tocando' | 'travado' = 'esperando';
    if (t + eps >= dados.atrasoInicial) {
      const tudo = baixado >= dados.duracao - eps;
      if (travado && (buffer >= retomar || tudo)) {
        travado = false;
        passos.push(`${fmt(t + dt, 1)} s: buffer com ${fmt(buffer, 1)} s de vídeo, volta a tocar.`);
      }
      if (!travado) {
        if (buffer + eps >= dt || tudo) {
          tocado += Math.min(dt, buffer);
          estado = 'tocando';
        } else {
          travado = true;
          travamentos++;
          passos.push(`${fmt(t, 1)} s: o buffer secou na posição ${fmt(tocado, 1)} s do vídeo; travou (${travamentos}º travamento).`);
        }
      }
      if (travado) {
        tempoTravado += dt;
        estado = 'travado';
      }
    }
    if (k % passosPorSeg === 0) linha.push({ t: arred(t, 3), buffer: arred(baixado - tocado, 3), estado });
    k++;
  }
  const fim = arred(k * dt, 3);
  passos.unshift(
    `Vídeo de ${fmt(dados.duracao, 1)} s a ${fmt(dados.taxaVideo, 1)} kb/s; o reprodutor espera ${fmt(dados.atrasoInicial, 1)} s antes de começar.`,
  );
  passos.push(
    `Resultado: ${travamentos} travamento(s), ${fmt(tempoTravado, 1)} s parado; terminou em ${fmt(fim, 1)} s.` +
      (travamentos ? ' Um atraso inicial maior enche o buffer antes e absorve as quedas de banda.' : ''),
  );
  return { travamentos, tempoTravado: arred(tempoTravado, 3), fim, linhaDoTempo: linha, passos };
}

/**
 * Vazão que sobra para um fluxo TCP num enlace compartilhado, segundo a segundo (kb/s), sempre a mesma para a mesma
 * semente. A banda do gargalo (`base`, kb/s) não chega inteira ao vídeo, e não chega igual todo segundo:
 * 1. Partida lenta (RFC 5681): a janela começa com 10 segmentos (RFC 6928) e dobra a cada RTT até encher o cano, então
 *    o primeiro segundo traz bem menos que a banda.
 * 2. Variação com memória: os outros fluxos do enlace vão e vêm devagar, e um segundo ruim costuma vir junto de outros
 *    ruins. Modelo AR(1) em torno da média, com coeficiente 0,9 de um segundo para o seguinte.
 * 3. Quedas: de vez em quando (umas 1,3 vez por minuto) um fluxo novo disputa o enlace ou uma perda faz o TCP cortar a
 *    janela pela metade (RFC 5681, §3.1), e por 3 a 7 s sobra só de 50 a 65 % do que sobrava.
 * Nunca passa de 98 % do gargalo (cabeçalhos e confirmações também ocupam o enlace). Aproximação declarada: não é uma
 * simulação pacote a pacote do TCP, é uma série com o comportamento dele, reprodutível pela semente.
 */
export function vazaoNoTempo(d: { base: number; segundos: number; semente: number; rtt?: number; mss?: number; media?: number; desvio?: number; quedasPorMinuto?: number }): number[] {
  const rnd = rngSemente(d.semente);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(rnd(), 1e-12))) * Math.cos(2 * Math.PI * rnd());
  const phi = 0.9;
  const sigma = d.desvio ?? 0.06;
  const media = d.media ?? 0.9;
  const pQueda = (d.quedasPorMinuto ?? 1.3) / 60;
  const rtt = Math.max(d.rtt ?? 0.1, 0.001);
  const mss = d.mss ?? 1460;
  // Janela da partida lenta em kb/s no instante t: 10 segmentos dobrando a cada RTT.
  const partida = (t: number) => (10 * mss * 8 * 2 ** (t / rtt)) / rtt / 1000;
  const out: number[] = [];
  let x = 0;
  let queda = 0;
  let fator = 1;
  for (let t = 0; t < d.segundos; t++) {
    x = phi * x + Math.sqrt(1 - phi * phi) * sigma * normal();
    if (queda === 0 && rnd() < pQueda) {
      queda = 3 + Math.floor(rnd() * 5);
      fator = 0.5 + 0.15 * rnd();
    }
    const f = Math.min(0.98, Math.max(0.2, media * (1 + x) * (queda > 0 ? fator : 1)));
    if (queda > 0) queda--;
    const teto = f * d.base;
    let v = teto;
    if (partida(t) < teto) {
      // Ainda na partida lenta: média do segundo em 20 pedaços.
      let soma = 0;
      for (let k = 0; k < 20; k++) soma += Math.min(teto, partida(t + (k + 0.5) / 20));
      v = soma / 20;
    }
    out.push(Math.round(v));
  }
  return out;
}

/**
 * Menor atraso inicial, em segundos inteiros, com que o vídeo toca do começo ao fim sem travar nessa série de banda.
 * Mais espera nunca piora (o buffer só fica maior em cada instante), então dá para procurar por bisseção.
 */
export function atrasoMinimo(d: { duracao: number; taxaVideo: number; banda: number[] }): number {
  const total = d.duracao * d.taxaVideo;
  let acumulado = 0;
  let hi = 0;
  while (acumulado < total && hi < 100000) acumulado += bandaEm(d.banda, hi++);
  hi += 1;
  const trava = (a: number) => simularBuffer({ duracao: d.duracao, taxaVideo: d.taxaVideo, banda: d.banda, atrasoInicial: a }).travamentos > 0;
  if (!trava(0)) return 0;
  let lo = 0;
  while (hi - lo > 1) {
    const meio = Math.floor((lo + hi) / 2);
    if (trava(meio)) lo = meio;
    else hi = meio;
  }
  return hi;
}

/* ---------- Streaming adaptativo ---------- */

export interface NivelQualidade {
  nome: string;
  /** kb/s. */
  taxa: number;
}

export interface SegmentoAdaptativo {
  segmento: number;
  nivel: string;
  taxa: number;
  /** Banda medida no download anterior (kb/s), usada para escolher este. */
  bandaMedida: number | null;
  inicio: number;
  tempoDownload: number;
  /** Buffer logo depois que o segmento chegou (s de vídeo). */
  buffer: number;
}

export interface ResultadoAdaptativo {
  historico: SegmentoAdaptativo[];
  travamentos: number;
  tempoTravado: number;
  trocas: number;
  qualidadeMedia: number;
  passos: string[];
}

function tempoParaBaixar(kbits: number, t0: number, banda: number[]): number {
  let falta = kbits;
  let t = t0;
  let guarda = 0;
  while (falta > 1e-9 && guarda++ < 1e6) {
    const b = bandaEm(banda, t);
    const fimSeg = Math.floor(t) + 1;
    const cabe = b * (fimSeg - t);
    if (b > 0 && cabe >= falta) {
      t += falta / b;
      falta = 0;
    } else {
      falta -= cabe;
      t = fimSeg;
    }
  }
  return t - t0;
}

/**
 * Streaming adaptativo por segmentos (como DASH): o vídeo está em vários níveis, cada um cortado em segmentos de
 * `segmento` segundos. Antes de pedir cada segmento o cliente olha a banda medida no anterior e escolhe o maior nível
 * com taxa até `margem` × banda. O primeiro sai no nível mais baixo.
 */
export function simularAdaptativo(dados: {
  niveis: NivelQualidade[];
  banda: number[];
  segmentos: number;
  segmento?: number;
  margem?: number;
  /** Segundos de vídeo no buffer para começar a tocar. */
  inicio?: number;
  /** Limite do buffer; acima disso o cliente espera antes de pedir mais. */
  bufferMaximo?: number;
}): ResultadoAdaptativo {
  const niveis = [...dados.niveis].sort((a, b) => a.taxa - b.taxa);
  const seg = dados.segmento ?? 2;
  const margem = dados.margem ?? 0.8;
  const inicio = dados.inicio ?? seg;
  const bufMax = dados.bufferMaximo ?? 30;
  let t = 0;
  let buffer = 0;
  let tocando = false;
  let medida: number | null = null;
  let travamentos = 0;
  let tempoTravado = 0;
  let trocas = 0;
  const historico: SegmentoAdaptativo[] = [];
  const passos: string[] = [];
  let anterior: NivelQualidade | null = null;
  let somaTaxa = 0;
  for (let i = 0; i < dados.segmentos; i++) {
    let nivel = niveis[0]!;
    if (medida !== null) for (const n of niveis) if (n.taxa <= margem * medida) nivel = n;
    if (anterior && anterior.nome !== nivel.nome) {
      trocas++;
      passos.push(
        `Segmento ${i}: banda medida ${fmt(medida ?? 0, 0)} kb/s; ${nivel.taxa > anterior.taxa ? 'sobe' : 'baixa'} de ${anterior.nome} para ${nivel.nome}.`,
      );
    }
    const kbits = nivel.taxa * seg;
    const dur = tempoParaBaixar(kbits, t, dados.banda);
    if (tocando) {
      if (buffer >= dur) buffer -= dur;
      else {
        travamentos++;
        tempoTravado += dur - buffer;
        passos.push(`Segmento ${i}: demorou ${fmt(dur, 1)} s e o buffer tinha ${fmt(buffer, 1)} s; travou.`);
        buffer = 0;
      }
    }
    const inicioDl = t;
    const medidaUsada = medida;
    t += dur;
    buffer += seg;
    medida = kbits / Math.max(dur, 1e-9);
    if (!tocando && buffer >= inicio) tocando = true;
    historico.push({
      segmento: i,
      nivel: nivel.nome,
      taxa: nivel.taxa,
      bandaMedida: medidaUsada === null ? null : arred(medidaUsada, 1),
      inicio: arred(inicioDl, 3),
      tempoDownload: arred(dur, 3),
      buffer: arred(buffer, 3),
    });
    // a medida usada para escolher este segmento era a do anterior; corrige o campo para refletir isso
    if (buffer > bufMax) {
      const espera = buffer - bufMax;
      if (tocando) buffer -= espera;
      t += espera;
    }
    somaTaxa += nivel.taxa;
    anterior = nivel;
  }
  const qualidadeMedia = arred(somaTaxa / Math.max(dados.segmentos, 1), 1);
  passos.unshift(`Níveis: ${niveis.map((n) => `${n.nome} ${n.taxa} kb/s`).join(', ')}; segmentos de ${fmt(seg, 1)} s, margem ${fmt(margem, 2)}.`);
  passos.push(`Resultado: ${trocas} troca(s) de nível, ${travamentos} travamento(s), qualidade média ${fmt(qualidadeMedia, 0)} kb/s.`);
  return { historico, travamentos, tempoTravado: arred(tempoTravado, 3), trocas, qualidadeMedia, passos };
}

/* ---------- Ao vivo e conferência: atraso, jitter, perda ---------- */

/** Atraso fim a fim de uma chamada e a avaliação usual (até 150 ms bom, até 400 ms tolerável, acima disso ruim). */
export function atrasoFimAFim(partes: {
  codificacao: number;
  empacotamento: number;
  rede: number;
  bufferJitter: number;
  decodificacao: number;
}): { total: number; avaliacao: 'bom' | 'aceitável' | 'ruim'; passos: string[] } {
  const total = partes.codificacao + partes.empacotamento + partes.rede + partes.bufferJitter + partes.decodificacao;
  const avaliacao = total <= 150 ? 'bom' : total <= 400 ? 'aceitável' : 'ruim';
  return {
    total,
    avaliacao,
    passos: [
      `Codificação ${fmt(partes.codificacao, 2)} ms + empacotamento ${fmt(partes.empacotamento, 2)} ms + rede ${fmt(partes.rede, 2)} ms + buffer de jitter ${fmt(partes.bufferJitter, 2)} ms + decodificação ${fmt(partes.decodificacao, 2)} ms = ${fmt(total, 2)} ms.`,
      `Para conversa: ${avaliacao}. Em transmissão ao vivo de mão única, alguns segundos de atraso são aceitáveis; numa conversa, não.`,
    ],
  };
}

export type CorrecaoPerda = 'nenhuma' | 'fec' | 'ocultacao';

export interface ResultadoJitter {
  enviados: number;
  perdidosNaRede: number;
  atrasados: number;
  tocados: number;
  recuperadosFec: number;
  ocultados: number;
  /** Buracos que a pessoa ouve. */
  falhas: number;
  /** Estimativa de jitter no estilo do RTP (ms). */
  jitter: number;
  /** Banda a mais gasta com FEC (fração). */
  sobrecarga: number;
  passos: string[];
}

/**
 * Pacotes de voz a cada `intervalo` ms com atraso de rede base + variação aleatória (semeada) e perda.
 * O receptor toca o pacote i no instante envio + `atrasoReproducao`: quem chega depois disso é descartado.
 * FEC: a cada `grupoFec` pacotes vai um de paridade, que recupera um buraco por grupo. Ocultação: repete o anterior.
 */
export function simularJitter(dados: {
  pacotes: number;
  intervalo?: number;
  atrasoBase: number;
  variacao: number;
  perda: number;
  atrasoReproducao: number;
  semente?: number;
  correcao?: CorrecaoPerda;
  grupoFec?: number;
}): ResultadoJitter {
  const rng = rngSemente(dados.semente ?? 1);
  const intervalo = dados.intervalo ?? 20;
  const correcao = dados.correcao ?? 'nenhuma';
  const k = dados.grupoFec ?? 4;
  const chegou: boolean[] = [];
  let perdidosNaRede = 0;
  let atrasados = 0;
  let jitter = 0;
  let transitoAnterior: number | null = null;
  for (let i = 0; i < dados.pacotes; i++) {
    const envio = i * intervalo;
    const perdido = rng() < dados.perda;
    const atraso = dados.atrasoBase + rng() * dados.variacao;
    if (perdido) {
      perdidosNaRede++;
      chegou.push(false);
      continue;
    }
    const chegada = envio + atraso;
    if (transitoAnterior !== null) jitter += (Math.abs(atraso - transitoAnterior) - jitter) / 16;
    transitoAnterior = atraso;
    if (chegada > envio + dados.atrasoReproducao) {
      atrasados++;
      chegou.push(false);
    } else chegou.push(true);
  }
  const tocados = chegou.filter(Boolean).length;
  let recuperadosFec = 0;
  let ocultados = 0;
  const ok = [...chegou];
  if (correcao === 'fec') {
    for (let g = 0; g < dados.pacotes; g += k) {
      const grupo = ok.slice(g, g + k);
      const buracos = grupo.filter((x) => !x).length;
      const paridadeChegou = rng() >= dados.perda;
      if (buracos === 1 && paridadeChegou) {
        recuperadosFec++;
        for (let j = g; j < g + grupo.length; j++) ok[j] = true;
      }
    }
  } else if (correcao === 'ocultacao') {
    for (let i = 1; i < ok.length; i++) {
      if (!ok[i] && chegou[i - 1]) {
        ocultados++;
        ok[i] = true;
      }
    }
  }
  const falhas = ok.filter((x) => !x).length;
  const passos = [
    `${dados.pacotes} pacotes a cada ${intervalo} ms; atraso de rede entre ${dados.atrasoBase} e ${dados.atrasoBase + dados.variacao} ms; perda de ${fmt(dados.perda * 100, 1)}%.`,
    `Reprodução fixa em ${fmt(dados.atrasoReproducao, 2)} ms após o envio: ${perdidosNaRede} perdidos na rede, ${atrasados} chegaram tarde demais e foram descartados.`,
  ];
  if (correcao === 'fec') passos.push(`FEC com 1 pacote de paridade a cada ${k} (${fmt(100 / k, 0)}% a mais de banda): recuperou ${recuperadosFec} buraco(s).`);
  if (correcao === 'ocultacao') passos.push(`Ocultação: ${ocultados} buraco(s) disfarçados repetindo o som anterior (funciona para buracos curtos).`);
  passos.push(`A pessoa ouve ${falhas} falha(s). Buffer de jitter maior descarta menos, mas aumenta o atraso da conversa.`);
  return {
    enviados: dados.pacotes,
    perdidosNaRede,
    atrasados,
    tocados,
    recuperadosFec,
    ocultados,
    falhas,
    jitter: arred(jitter, 3),
    sobrecarga: correcao === 'fec' ? 1 / k : 0,
    passos,
  };
}

/**
 * Atraso de reprodução adaptativo: média móvel do atraso (d) e do desvio (v), com reprodução em d + K·v.
 * Recebe os atrasos de rede medidos de cada pacote (ms).
 */
export function estimarAtrasoReproducao(atrasos: number[], u = 0.01, K = 4): { media: number; desvio: number; reproducao: number } {
  let d = atrasos[0] ?? 0;
  let v = 0;
  for (const a of atrasos.slice(1)) {
    d = (1 - u) * d + u * a;
    v = (1 - u) * v + u * Math.abs(a - d);
  }
  return { media: arred(d, 3), desvio: arred(v, 3), reproducao: arred(d + K * v, 3) };
}

/* ======================================================================
 * 5. Entrega de conteúdo
 * ====================================================================== */

/* ---------- Parque de servidores ---------- */

export interface PedidoServidor {
  chegada: number;
  duracao: number;
}

export interface ResultadoBalanceamento {
  /** Índice do servidor que atendeu cada pedido. */
  atribuicao: number[];
  /** Trabalho total por servidor. */
  cargas: number[];
  tempoRespostaMedio: number;
  tempoRespostaMaximo: number;
  passos: string[];
}

/** Balanceador na frente de um parque de servidores iguais: rodízio (um para cada) ou menor carga (menos trabalho pendente). */
export function balancear(
  pedidos: PedidoServidor[],
  servidores: number,
  politica: 'rodizio' | 'menor-carga',
): ResultadoBalanceamento {
  const livreEm = Array(servidores).fill(0) as number[];
  const cargas = Array(servidores).fill(0) as number[];
  const atribuicao: number[] = [];
  let soma = 0;
  let maximo = 0;
  const ordem = pedidos.map((p, i) => ({ ...p, i })).sort((a, b) => a.chegada - b.chegada || a.i - b.i);
  let vez = 0;
  for (const p of ordem) {
    let s: number;
    if (politica === 'rodizio') s = vez++ % servidores;
    else {
      s = 0;
      for (let j = 1; j < servidores; j++) {
        if (Math.max(livreEm[j]! - p.chegada, 0) < Math.max(livreEm[s]! - p.chegada, 0)) s = j;
      }
    }
    const comeca = Math.max(livreEm[s]!, p.chegada);
    livreEm[s] = comeca + p.duracao;
    cargas[s]! += p.duracao;
    const resp = livreEm[s]! - p.chegada;
    soma += resp;
    maximo = Math.max(maximo, resp);
    atribuicao[p.i] = s;
  }
  const medio = arred(soma / Math.max(pedidos.length, 1), 3);
  return {
    atribuicao,
    cargas,
    tempoRespostaMedio: medio,
    tempoRespostaMaximo: arred(maximo, 3),
    passos: [
      politica === 'rodizio'
        ? 'Rodízio: cada pedido vai para o próximo servidor da lista, sem olhar se ele está ocupado.'
        : 'Menor carga: cada pedido vai para o servidor com menos trabalho pendente naquele instante.',
      `Trabalho por servidor: ${cargas.map((c, i) => `s${i + 1}=${fmt(c, 1)}`).join(', ')}; resposta média ${fmt(medio, 2)}, pior ${fmt(maximo, 2)}.`,
    ],
  };
}

/* ---------- Proxy de cache ---------- */

/** Pedidos com popularidade de Zipf (poucos objetos muito pedidos, muitos quase nunca), semeados. */
export function pedidosZipf(semente: number, objetos: number, pedidos: number, s = 1): string[] {
  const rng = rngSemente(semente);
  const pesos = Array.from({ length: objetos }, (_, i) => 1 / (i + 1) ** s);
  const total = pesos.reduce((a, b) => a + b, 0);
  const acum: number[] = [];
  let a = 0;
  for (const p of pesos) acum.push((a += p / total));
  return Array.from({ length: pedidos }, () => {
    const x = rng();
    let i = acum.findIndex((c) => x <= c);
    if (i < 0) i = objetos - 1;
    return `/obj${i + 1}`;
  });
}

export interface ResultadoProxy {
  acertos: number;
  falhas: number;
  taxaAcerto: number;
  /** Bytes que subiram pelo enlace de acesso da instituição até a origem. */
  bytesEnlace: number;
  /** Bytes que teriam subido sem proxy. */
  bytesSemProxy: number;
  trafegoEconomizado: number;
  atrasoMedio: number;
  passos: string[];
}

/** Proxy de cache dentro da rede da instituição, com substituição do menos usado recentemente (LRU). */
export function simularProxyCache(dados: {
  pedidos: string[];
  capacidade: number;
  tamanhoObjeto?: number;
  /** RTT até o proxy (rede local) e até a origem (ms). */
  rttProxy?: number;
  rttOrigem?: number;
}): ResultadoProxy {
  const tam = dados.tamanhoObjeto ?? 100_000;
  const rttP = dados.rttProxy ?? 2;
  const rttO = dados.rttOrigem ?? 80;
  const cache = new Map<string, true>();
  let acertos = 0;
  let falhas = 0;
  let atraso = 0;
  for (const p of dados.pedidos) {
    if (cache.has(p)) {
      acertos++;
      cache.delete(p);
      cache.set(p, true);
      atraso += rttP;
    } else {
      falhas++;
      atraso += rttP + rttO;
      if (dados.capacidade > 0) {
        if (cache.size >= dados.capacidade) cache.delete(cache.keys().next().value!);
        cache.set(p, true);
      }
    }
  }
  const n = dados.pedidos.length;
  const taxa = arred(acertos / Math.max(n, 1), 4);
  const bytesEnlace = falhas * tam;
  const bytesSem = n * tam;
  const atrasoMedio = arred(atraso / Math.max(n, 1), 3);
  return {
    acertos,
    falhas,
    taxaAcerto: taxa,
    bytesEnlace,
    bytesSemProxy: bytesSem,
    trafegoEconomizado: bytesSem - bytesEnlace,
    atrasoMedio,
    passos: [
      `${n} pedidos, cache para ${dados.capacidade} objetos: ${acertos} acertos (${fmt(taxa * 100, 1)}%), ${falhas} foram à origem.`,
      `Tráfego no enlace de acesso: ${fmt(bytesEnlace / 1e6, 2)} MB em vez de ${fmt(bytesSem / 1e6, 2)} MB; atraso médio ${fmt(atrasoMedio, 1)} ms em vez de ${rttP + rttO} ms.`,
    ],
  };
}

/* ---------- CDN ---------- */

/** Cidades de exemplo (latitude e longitude aproximadas). */
export const CIDADES: Record<string, [number, number]> = {
  'São Paulo': [-23.55, -46.63],
  'Rio de Janeiro': [-22.91, -43.17],
  Curitiba: [-25.43, -49.27],
  'Porto Alegre': [-30.03, -51.23],
  'Belo Horizonte': [-19.92, -43.94],
  Brasília: [-15.79, -47.88],
  Salvador: [-12.97, -38.5],
  Recife: [-8.05, -34.88],
  Fortaleza: [-3.73, -38.52],
  Belém: [-1.46, -48.5],
  Manaus: [-3.12, -60.02],
};

export function distanciaKm(a: string, b: string): number {
  const pa = CIDADES[a];
  const pb = CIDADES[b];
  if (!pa || !pb) throw new Error(`Cidade desconhecida: ${!pa ? a : b}`);
  const r = (g: number) => (g * Math.PI) / 180;
  const dLat = r(pb[0] - pa[0]);
  const dLon = r(pb[1] - pa[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(pa[0])) * Math.cos(r(pb[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** RTT aproximado: 2 ms de processamento + ida e volta na fibra (cerca de 200 km por ms), com caminho 1,5 vez a reta. */
export function rttEntre(a: string, b: string): number {
  return arred(2 + (distanciaKm(a, b) * 1.5 * 2) / 200, 2);
}

export function bordaMaisPerto(cidade: string, bordas: string[]): string {
  return bordas.reduce((m, b) => (rttEntre(cidade, b) < rttEntre(cidade, m) ? b : m));
}

/** O DNS da CDN: o site delega o nome por CNAME, e o autoritativo da CDN escolhe a borda mais perto do resolvedor. */
export function dnsCdn(
  nome: string,
  cidadeResolvedor: string,
  bordas: string[],
): { borda: string; nomeCdn: string; rtt: number; passos: string[] } {
  const n = normalizarNome(nome);
  const nomeCdn = `${n.split('.')[0]}.cdn.exemplo.`;
  const borda = bordaMaisPerto(cidadeResolvedor, bordas);
  const rtt = rttEntre(cidadeResolvedor, borda);
  return {
    borda,
    nomeCdn,
    rtt,
    passos: [
      `O autoritativo do site responde ${n} CNAME ${nomeCdn}: o nome passa a ser da CDN.`,
      `O autoritativo da CDN vê o IP do resolvedor (em ${cidadeResolvedor}), não o do cliente, e calcula a borda mais perto.`,
      `Resposta: o servidor de borda de ${borda} (RTT ${fmt(rtt, 1)} ms), com TTL curto para poder mudar a escolha depressa.`,
      'Se o cliente usar um resolvedor distante, a CDN pode errar a cidade; daí extensões que passam parte do IP do cliente.',
    ],
  };
}

export interface ResultadoCdn {
  semCdn: { atrasoMedio: number; trafegoEnlacePrincipal: number; ocupacao: number };
  comCdn: { atrasoMedio: number; trafegoEnlacePrincipal: number; ocupacao: number; bordasUsadas: string[] };
  porCidade: { cidade: string; espectadores: number; borda: string; rttSem: number; rttCom: number }[];
  passos: string[];
}

/**
 * Transmissão ao vivo (por exemplo, a final do campeonato) com milhares de espectadores em várias cidades.
 * Sem CDN, cada espectador puxa a própria cópia do servidor de origem; com CDN, cada borda puxa uma cópia e
 * reparte localmente. Taxas em Mb/s.
 */
export function simularCdn(dados: {
  origem: string;
  bordas: string[];
  publico: { cidade: string; espectadores: number }[];
  taxaPorEspectador: number;
  capacidadeEnlacePrincipal: number;
}): ResultadoCdn {
  let total = 0;
  let somaSem = 0;
  let somaCom = 0;
  const usadas = new Set<string>();
  const porCidade: ResultadoCdn['porCidade'] = [];
  for (const p of dados.publico) {
    const borda = bordaMaisPerto(p.cidade, dados.bordas);
    const rttSem = rttEntre(p.cidade, dados.origem);
    const rttCom = rttEntre(p.cidade, borda);
    if (p.espectadores > 0) usadas.add(borda);
    total += p.espectadores;
    somaSem += rttSem * p.espectadores;
    somaCom += rttCom * p.espectadores;
    porCidade.push({ cidade: p.cidade, espectadores: p.espectadores, borda, rttSem, rttCom });
  }
  const trafSem = total * dados.taxaPorEspectador;
  const trafCom = usadas.size * dados.taxaPorEspectador;
  const cap = dados.capacidadeEnlacePrincipal;
  const r: ResultadoCdn = {
    semCdn: { atrasoMedio: arred(somaSem / Math.max(total, 1), 2), trafegoEnlacePrincipal: trafSem, ocupacao: arred(trafSem / cap, 4) },
    comCdn: {
      atrasoMedio: arred(somaCom / Math.max(total, 1), 2),
      trafegoEnlacePrincipal: trafCom,
      ocupacao: arred(trafCom / cap, 4),
      bordasUsadas: [...usadas],
    },
    porCidade,
    passos: [],
  };
  r.passos.push(
    `${total} espectadores a ${fmt(dados.taxaPorEspectador, 2)} Mb/s; origem em ${dados.origem}, enlace principal de ${cap} Mb/s.`,
    `Sem CDN: ${fmt(trafSem, 0)} Mb/s saindo da origem (${fmt(r.semCdn.ocupacao * 100, 1)}% do enlace)` +
      (trafSem > cap ? ', o enlace não aguenta e todo mundo trava.' : '.') +
      ` Atraso médio ${fmt(r.semCdn.atrasoMedio, 1)} ms.`,
    `Com CDN: cada uma das ${usadas.size} bordas puxa uma cópia, ${fmt(trafCom, 0)} Mb/s na origem; atraso médio ${fmt(r.comCdn.atrasoMedio, 1)} ms.`,
  );
  return r;
}

/* ---------- Peer-to-peer ---------- */

export interface ParametrosDistribuicao {
  /** Número de pares que querem o arquivo. */
  N: number;
  /** Tamanho do arquivo (bits). */
  F: number;
  /** Banda de subida do servidor (b/s). */
  us: number;
  /** Menor banda de descida entre os pares (b/s). */
  dmin: number;
  /** Banda de subida de cada par (b/s), igual para todos. */
  u: number;
}

/** Tempo mínimo cliente-servidor: max(N·F/us, F/dmin). Cresce linear com N. */
export function tempoClienteServidor(p: ParametrosDistribuicao): number {
  return Math.max((p.N * p.F) / p.us, p.F / p.dmin);
}

/** Tempo mínimo P2P: max(F/us, F/dmin, N·F/(us + N·u)). Fica limitado quando N cresce. */
export function tempoP2P(p: ParametrosDistribuicao): number {
  return Math.max(p.F / p.us, p.F / p.dmin, (p.N * p.F) / (p.us + p.N * p.u));
}

export function compararDistribuicao(
  Ns: number[],
  base: Omit<ParametrosDistribuicao, 'N'>,
): { N: number; clienteServidor: number; p2p: number }[] {
  return Ns.map((N) => ({
    N,
    clienteServidor: arred(tempoClienteServidor({ ...base, N }), 4),
    p2p: arred(tempoP2P({ ...base, N }), 4),
  }));
}

export interface Pedaco {
  indice: number;
  tamanho: number;
  hash: string;
}

/** Corta o arquivo em pedaços de tamanho fixo (o último pode ser menor), cada um com o resumo para conferir. */
export function dividirEmPedacos(conteudo: string, tamanhoPedaco: number): Pedaco[] {
  const lista: Pedaco[] = [];
  for (let i = 0, k = 0; i < conteudo.length; i += tamanhoPedaco, k++) {
    const p = conteudo.slice(i, i + tamanhoPedaco);
    lista.push({ indice: k, tamanho: p.length, hash: resumo32(p) });
  }
  return lista;
}

/** O rastreador devolve uma amostra dos pares do enxame (semeada). */
export function consultarRastreador(enxame: string[], pedinte: string, maximo: number, semente = 1): string[] {
  const rng = rngSemente(semente);
  const outros = enxame.filter((p) => p !== pedinte);
  for (let i = outros.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [outros[i], outros[j]] = [outros[j]!, outros[i]!];
  }
  return outros.slice(0, maximo);
}

/** Bits do espaço de identificadores da DHT do jogo: 2^8 = 256 posições no anel. */
export const BITS_DHT = 8;

/** Os 8 nós da DHT da cidade (os mesmos em todo dia que usa a tabela). */
export const NOS_DHT: readonly number[] = [3, 17, 42, 77, 101, 150, 199, 230];
const TAMANHO_ANEL = 1 << BITS_DHT;

/** O identificador de uma chave: o resumo do nome reduzido a BITS_DHT bits. */
export function idDht(chave: string): number {
  return parseInt(resumo32(chave), 16) & (TAMANHO_ANEL - 1);
}

const bin8 = (x: number) => x.toString(2).padStart(BITS_DHT, '0');

/** Variante XOR (como no Kademlia): a chave fica no nó de menor distância XOR até o identificador dela. */
export function dhtResponsavel(chave: string, nos: number[]): { id: number; responsavel: number; passos: string[] } {
  const id = idDht(chave);
  const ordem = [...nos].sort((a, b) => (a ^ id) - (b ^ id));
  const responsavel = ordem[0]!;
  return {
    id,
    responsavel,
    passos: [
      `Resumo de "${chave}" em ${BITS_DHT} bits: ${id} (${bin8(id)}).`,
      `Variante XOR: distância de cada nó até a chave, d(x, y) = x XOR y: ${nos.map((n) => `${n}→${n ^ id}`).join(', ')}.`,
      `Responsável: nó ${responsavel}. A distância XOR é a mesma nos dois sentidos, e cada bit de prefixo em comum corta o espaço pela metade: cada nó guarda contatos em cada faixa de distância (2^i a 2^(i+1)) e a busca também chega em uns log₂ N passos.`,
    ],
  };
}

/** Distância no anel, no sentido horário, de `a` até `b`. */
const noSentido = (a: number, b: number) => (b - a + TAMANHO_ANEL) % TAMANHO_ANEL;

/** Está em (a, b] andando no sentido horário do anel? */
function noIntervalo(x: number, a: number, b: number, fechadoNoFim: boolean): boolean {
  const dx = noSentido(a, x);
  const db = noSentido(a, b) || TAMANHO_ANEL;
  return fechadoNoFim ? dx > 0 && dx <= db : dx > 0 && dx < db;
}

/** sucessor(id): o primeiro nó igual ou depois do identificador, andando no anel (e dando a volta no 255). */
export function chordSucessor(id: number, nos: number[]): number {
  const ordem = [...new Set(nos)].sort((a, b) => a - b);
  return ordem.find((n) => n >= id) ?? ordem[0]!;
}

export interface Atalho {
  i: number;
  /** n + 2^i, módulo 2^BITS_DHT. */
  inicio: number;
  no: number;
}

/** Tabela de atalhos do nó n: atalho[i] = sucessor(n + 2^i), para i de 0 a BITS_DHT - 1. O atalho 0 é o sucessor. */
export function chordAtalhos(n: number, nos: number[]): Atalho[] {
  return Array.from({ length: BITS_DHT }, (_, i) => {
    const inicio = (n + (1 << i)) % TAMANHO_ANEL;
    return { i, inicio, no: chordSucessor(inicio, nos) };
  });
}

export interface BuscaAnel {
  id: number;
  responsavel: number;
  /** Os nós por onde a busca passou, do primeiro ao que respondeu. */
  caminho: number[];
  saltos: number;
  passos: string[];
}

/**
 * Busca no anel do tipo Chord: o nó que pergunta confere se a chave cai entre ele e o sucessor dele; se não, pula
 * para o atalho que mais se aproxima da chave sem passar dela (o predecessor mais próximo na tabela). Cada salto
 * corta pelo menos metade da distância que falta: a busca termina em O(log N) saltos.
 */
export function chordBuscar(chave: string, nos: number[], inicio = Math.min(...nos)): BuscaAnel {
  const id = idDht(chave);
  const passos = [`Resumo de "${chave}" em ${BITS_DHT} bits: ${id} (${bin8(id)}). No anel de 0 a ${TAMANHO_ANEL - 1}, cada nó cuida das chaves desde o nó anterior (exclusive) até ele: o responsável é sucessor(${id}).`];
  const caminho = [inicio];
  let n = inicio;
  for (let guarda = 0; guarda < nos.length + 1; guarda++) {
    const tab = chordAtalhos(n, nos);
    const suc = tab[0]!.no;
    if (id === n) {
      passos.push(`  Nó ${n}: a chave ${id} é o próprio identificador dele. Responde.`);
      return { id, responsavel: n, caminho, saltos: caminho.length - 1, passos };
    }
    if (noIntervalo(id, n, suc, true)) {
      passos.push(`  Nó ${n}: ${id} cai entre ele e o sucessor dele, ${suc}. O responsável é ${suc}.`);
      if (suc !== n) caminho.push(suc);
      passos.push(`Responsável: nó ${suc}, em ${caminho.length - 1} salto(s) com ${nos.length} nós (log₂ ${nos.length} ≈ ${Math.log2(nos.length).toFixed(1).replace('.', ',')}).`);
      return { id, responsavel: suc, caminho, saltos: caminho.length - 1, passos };
    }
    let prox = n;
    for (let i = tab.length - 1; i >= 0; i--) if (noIntervalo(tab[i]!.no, n, id, false)) { prox = tab[i]!.no; break; }
    if (prox === n) prox = suc;
    passos.push(`  Nó ${n}: atalhos ${tab.map((a) => `${a.inicio}→${a.no}`).join(', ')}. O que mais se aproxima de ${id} sem passar dele é ${prox}: pula para lá.`);
    caminho.push(prox);
    n = prox;
  }
  throw new Error('a busca no anel não terminou');
}

export interface ResultadoP2P {
  rodadas: number;
  /** Quantos pares tinham o arquivo inteiro ao fim de cada rodada (sem contar a semente). */
  completosPorRodada: number[];
  /** Pedaços que cada par recebeu de cada outro (para olho por olho). */
  transferencias: number;
  passos: string[];
}

/**
 * Enxame em rodadas: o par 0 é a semente com o arquivo inteiro. A cada rodada, cada par envia um pedaço para até
 * `conexoes` vizinhos interessados. Olho por olho: envia aos que mais lhe enviaram na rodada anterior e guarda uma
 * vaga para um desbloqueio otimista sorteado. Cada receptor pede o pedaço mais raro entre os que o emissor tem.
 */
export function simularP2P(dados: {
  pares: number;
  pedacos: number;
  conexoes?: number;
  politica?: 'mais-raro' | 'aleatorio';
  olhoPorOlho?: boolean;
  semente?: number;
  maxRodadas?: number;
}): ResultadoP2P {
  const rng = rngSemente(dados.semente ?? 1);
  const n = dados.pares + 1;
  const P = dados.pedacos;
  const k = dados.conexoes ?? 4;
  const politica = dados.politica ?? 'mais-raro';
  const tft = dados.olhoPorOlho ?? true;
  const tem: boolean[][] = Array.from({ length: n }, (_, i) => Array(P).fill(i === 0) as boolean[]);
  let recebidoDe: number[][] = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
  const completos: number[] = [];
  const passos: string[] = [];
  let transferencias = 0;
  let rodada = 0;
  const completo = (i: number) => tem[i]!.every(Boolean);
  const max = dados.maxRodadas ?? 1000;
  while (rodada < max && !tem.every((t) => t.every(Boolean))) {
    rodada++;
    const raridade = Array.from({ length: P }, (_, p) => tem.reduce((s, t) => s + (t[p] ? 1 : 0), 0));
    const chegando: [number, number, number][] = [];
    const recebendo = Array(n).fill(0) as number[];
    const pedido = Array.from({ length: n }, () => new Set<number>());
    const novoRecebido: number[][] = Array.from({ length: n }, () => Array(n).fill(0) as number[]);
    for (let e = 0; e < n; e++) {
      if (!tem[e]!.some(Boolean)) continue;
      const interessados: number[] = [];
      for (let r = 0; r < n; r++) {
        if (r !== e && !completo(r) && tem[e]!.some((x, p) => x && !tem[r]![p])) interessados.push(r);
      }
      if (!interessados.length) continue;
      let escolhidos: number[];
      if (tft && e !== 0) {
        const ordem = [...interessados].sort((a, b) => recebidoDe[e]![b]! - recebidoDe[e]![a]! || a - b);
        escolhidos = ordem.slice(0, Math.max(k - 1, 0));
        const resto = ordem.slice(Math.max(k - 1, 0));
        if (resto.length) escolhidos.push(resto[Math.floor(rng() * resto.length)]!);
      } else {
        const embaralhado = [...interessados];
        for (let i = embaralhado.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [embaralhado[i], embaralhado[j]] = [embaralhado[j]!, embaralhado[i]!];
        }
        escolhidos = embaralhado.slice(0, k);
      }
      for (const r of escolhidos) {
        if (recebendo[r]! >= k) continue;
        const candidatos = tem[e]!.map((x, p) => (x && !tem[r]![p] && !pedido[r]!.has(p) ? p : -1)).filter((p) => p >= 0);
        if (!candidatos.length) continue;
        let p: number;
        if (politica === 'mais-raro') {
          const menor = Math.min(...candidatos.map((c) => raridade[c]!));
          const empatados = candidatos.filter((c) => raridade[c] === menor);
          p = empatados[Math.floor(rng() * empatados.length)]!;
        } else p = candidatos[Math.floor(rng() * candidatos.length)]!;
        pedido[r]!.add(p);
        recebendo[r]!++;
        chegando.push([e, r, p]);
      }
    }
    for (const [e, r, p] of chegando) {
      tem[r]![p] = true;
      novoRecebido[r]![e]!++;
      transferencias++;
    }
    recebidoDe = novoRecebido;
    const c = tem.slice(1).filter((t) => t.every(Boolean)).length;
    completos.push(c);
    if (rodada <= 3 || c === dados.pares) {
      passos.push(`Rodada ${rodada}: ${chegando.length} pedaço(s) trocados; ${c} de ${dados.pares} pares completos.`);
    }
  }
  passos.unshift(
    `${dados.pares} pares e 1 semente, arquivo em ${P} pedaços; até ${k} envios por par e por rodada; política ${politica === 'mais-raro' ? 'mais raro primeiro' : 'aleatória'}${tft ? ', olho por olho' : ''}.`,
  );
  passos.push(`Todos completos em ${rodada} rodada(s). Cada par que recebe passa a servir: a capacidade de envio cresce com o enxame.`);
  return { rodadas: rodada, completosPorRodada: completos, transferencias, passos };
}

/* ---------- Evolução do tráfego ---------- */

/** Tabela qualitativa de que tipo de tráfego predominava em cada época (sem números de empresas). */
export const TRAFEGO_POR_EPOCA: { epoca: string; predominante: string; observacao: string }[] = [
  { epoca: 'Anos 1970 e 1980', predominante: 'Terminal remoto, transferência de arquivos e correio', observacao: 'Poucos computadores, quase só universidades e pesquisa.' },
  { epoca: 'Anos 1990', predominante: 'Web e correio', observacao: 'A web leva a rede para o público; páginas leves, muito texto e imagens.' },
  { epoca: 'Anos 2000', predominante: 'Peer-to-peer de arquivos', observacao: 'Troca de músicas e filmes entre pares ocupa uma fatia enorme do tráfego.' },
  { epoca: 'Anos 2010', predominante: 'Vídeo sob demanda servido por CDN', observacao: 'Streaming adaptativo e parques de servidores; o P2P perde espaço relativo.' },
  { epoca: 'Anos 2020', predominante: 'Vídeo (sob demanda e ao vivo) e conferência', observacao: 'Vídeo domina o volume; quase tudo vai cifrado (HTTPS, QUIC) e perto do usuário.' },
];
