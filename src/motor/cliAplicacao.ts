// Camada de aplicação (ato 6) no mundo do jogo: servidores que rodam DNS, web, correio, streaming e CDN, e os
// comandos do PC que usam esses serviços pelo caminho real (dig, navegar, correio, assistir, cdn, p2p).
// A parte pura fica em aplicacao.ts; aqui o nome vira IP pelos servidores DNS que existem no mundo, a página chega
// por uma conexão TCP de verdade (roteadores, NAT, firewall) e o vídeo toca com a banda medida no caminho.
// Cada resultado vai para m.flags (dns, http, correio, streaming, cdn, p2p) com a configuração usada.

import type { Acao, Campo, Opcao } from './acoes';
import type { Equipamento, Mundo } from './mundo';
import { donoDoIp, interfacesL3 } from './roteamento';
import { ipTexto, lerIp, lerNumero } from './util';
import {
  adicionarReceived,
  bordaMaisPerto,
  CacheDns,
  cabecalho,
  cabecalhos,
  CIDADES,
  compararDistribuicao,
  dhtResponsavel,
  dialogoSmtp,
  dnsCdn,
  dominioDe,
  entregaFinal,
  lerUrl,
  montarEspacoNomes,
  montarMensagem,
  Navegador,
  normalizarNome,
  novaResposta,
  dentroDe,
  resolver,
  responderServidor,
  novaConsultaDns,
  serializarMensagem,
  serializarRequisicao,
  serializarResposta,
  ServidorWeb,
  simularAdaptativo,
  simularBuffer,
  simularCdn,
  simularP2P,
  descreverMensagemDns,
  valorRegistro,
  etagDe,
  resumo32,
  dataHttp,
  vazaoNoTempo,
  atrasoMinimo,
  type EspacoNomes,
  type MensagemCorreio,
  type RegistroDns,
  type RequisicaoHttp,
  type ResultadoResolucao,
  type ServidorDns,
  type TipoRegistro,
} from './aplicacao';
import { caminhoTransporte, demultiplexar, escutar, ipPrincipal, portaEfemera, soquetesDe, type CaminhoMundo, type InundacaoSyn, type Protocolo } from './transporte';
import { anotarFlag, idsDe, inspecionarConteudo, refrescarFiltros } from './filtro';
import {
  abrirMensagem,
  apertoTls,
  assinarRrset,
  avancarRelogio,
  cifrarRegistro,
  dsDe,
  ehBlindado,
  protegerMensagem,
  registrarTrafego,
  relogio,
  TIPOS_CERTIFICADO,
  type TipoCertificado,
} from './seguranca';

type Saida = string[];

const num = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');
const r4 = (x: number) => Number(x.toFixed(4));

/* ---------- Configuração dos serviços ---------- */

export interface RegistroCfg {
  nome: string;
  tipo: TipoRegistro;
  valor: string;
  ttl?: number;
  prioridade?: number;
}

export interface PaginaCfg {
  conteudo: string;
  /** Segundos de validade no cache do navegador (Cache-Control: max-age). */
  maxAge?: number;
  /** Relógio do jogo em que mudou pela última vez. */
  modificado?: number;
  tipo?: string;
}

export interface ServicosEquip {
  dns?: {
    zona?: string;
    /** Nome do servidor (padrão ns1.<zona>, ou a.raiz. para a raiz). */
    nome?: string;
    registros?: RegistroCfg[];
    /** Resolvedor recursivo: resolve qualquer nome para os clientes, com cache. */
    recursivo?: boolean;
    /** Zona assinada (DNSSEC). */
    dnssec?: boolean;
    /** O resolvedor confere as assinaturas DNSSEC. */
    validar?: boolean;
    /** Porta de origem aleatória nas consultas (dificulta respostas forjadas). */
    portasAleatorias?: boolean;
  };
  web?: { nome?: string; paginas?: Record<string, PaginaCfg>; https?: boolean | TipoCertificado; sessao?: boolean };
  correio?: { dominio: string; caixas?: string[]; nome?: string };
  streaming?: { videos?: Record<string, { taxa: number; duracao: number }> };
  cdn?: { nome?: string; origem?: string; bordas?: string[]; capacidade?: number };
}

export function servicosDe(e: Equipamento): ServicosEquip | undefined {
  return e.s.servicos as ServicosEquip | undefined;
}

/** O mundo usa a camada de aplicação? Menus e ajuda só mostram as coisas novas quando sim. */
export function temAplicacao(m: Mundo): boolean {
  if (m.flags.aplicacao) return true;
  for (const e of m.equipamentos.values()) if (e.s.servicos && Object.keys(e.s.servicos).length) return true;
  return false;
}

const PORTAS_SERVICO: Record<keyof ServicosEquip, [Protocolo, number, string][]> = {
  dns: [['udp', 53, 'dns'], ['tcp', 53, 'dns']],
  web: [['tcp', 80, 'http']],
  correio: [['tcp', 25, 'smtp'], ['tcp', 587, 'submissão'], ['tcp', 143, 'imap'], ['tcp', 110, 'pop3']],
  streaming: [['tcp', 80, 'http']],
  cdn: [],
};

/** Cada serviço configurado ganha o soquete escutando na porta dele (como um daemon que sobe no boot). */
export function garantirEscutas(m: Mundo): void {
  for (const e of m.equipamentos.values()) {
    const s = servicosDe(e);
    if (!s || !ipPrincipal(e)) continue;
    // Só sobe de novo quando a configuração muda: "parar tcp 25" derruba o serviço até reconfigurar.
    const assinatura = JSON.stringify([Object.keys(s).filter((k) => s[k as keyof ServicosEquip]).sort(), !!s.web?.https, ipPrincipal(e)]);
    if (e.s._escutas === assinatura) continue;
    e.s._escutas = assinatura;
    const lista = soquetesDe(e);
    for (const k of Object.keys(s) as (keyof ServicosEquip)[]) {
      if (!s[k]) continue;
      const portas = [...(PORTAS_SERVICO[k] ?? [])];
      if (k === 'web' && s.web?.https) portas.push(['tcp', 443, 'https']);
      for (const [proto, porta, nome] of portas) {
        if (lista.some((x) => x.proto === proto && x.portaLocal === porta && !x.ipRemoto)) continue;
        escutar(m, e, proto, porta, nome);
      }
    }
  }
}

/* ---------- Caminho até o serviço ---------- */

export interface Abertura {
  ok: boolean;
  linhas: Saida;
  c: CaminhoMundo;
  srv?: Equipamento;
  motivo?: 'sem caminho' | 'recusada' | 'fila cheia';
}

function msTxt(s: number): string {
  return `${num(s * 1000, s * 1000 < 10 ? 2 : 1)} ms`;
}

function linhasSeguranca(c: CaminhoMundo): Saida {
  return [...(c.eventosSeguranca ?? []), ...(c.alertas ?? [])].map((x) => '  ' + x);
}

/** Aperto de mão TCP pelo caminho real: SYN, SYN+ACK, ACK (ou RST, ou silêncio). */
export function abrirTcp(m: Mundo, e: Equipamento, ipN: number, porta: number): Abertura {
  const c = caminhoTransporte(m, e.nome, ipN, 'tcp', portaEfemera(e, 'tcp'), porta);
  const ip = ipTexto(ipN);
  if (!c.ok) return { ok: false, c, motivo: 'sem caminho', linhas: [`TCP para ${ip}:${porta}: o SYN não teve resposta (${c.falha})`, ...linhasSeguranca(c)] };
  const srv = c.servidor!;
  const d = demultiplexar(srv, 'tcp', ip, porta, c.ipVisto, c.portaVista);
  if (d.como === 'nenhum') return { ok: false, c, srv, motivo: 'recusada', linhas: [`TCP para ${ip}:${porta}: ${srv.nome} respondeu RST. Ninguém escuta na porta ${porta}.`, ...linhasSeguranca(c)] };
  const inund = srv.s.inundacaoSyn as InundacaoSyn | undefined;
  if (inund?.ativa && !srv.s.synCookies && inund.meiasAbertas >= inund.backlog) {
    return { ok: false, c, srv, motivo: 'fila cheia', linhas: [`TCP para ${ip}:${porta}: ${srv.nome} está com a fila de conexões meio abertas cheia (inundação de SYN). O SYN some e o navegador desiste.`] };
  }
  return {
    ok: true,
    c,
    srv,
    linhas: [`TCP com ${ip}:${porta} (${srv.nome}): SYN, SYN+ACK, ACK em ${msTxt(c.rtt)}${c.roteadores.length ? `, por ${c.roteadores.join(', ')}` : ''}${c.nat.length ? ', com NAT no caminho' : ''}.`, ...linhasSeguranca(c)],
  };
}

/** Datagrama UDP de ida e volta (consulta DNS). */
function trocarUdp(m: Mundo, e: Equipamento, ipN: number, porta: number): Abertura {
  const c = caminhoTransporte(m, e.nome, ipN, 'udp', portaEfemera(e, 'udp'), porta);
  const ip = ipTexto(ipN);
  if (!c.ok) return { ok: false, c, motivo: 'sem caminho', linhas: [`UDP para ${ip}:${porta}: sem resposta (${c.falha}). O cliente espera e tenta de novo, depois desiste.`, ...linhasSeguranca(c)] };
  const d = demultiplexar(c.servidor!, 'udp', ip, porta, c.ipVisto, c.portaVista);
  if (d.como === 'nenhum') return { ok: false, c, srv: c.servidor, motivo: 'recusada', linhas: [`UDP para ${ip}:${porta}: ${c.servidor!.nome} devolveu ICMP "porta inalcançável". Ninguém atende DNS ali.`] };
  return { ok: true, c, srv: c.servidor, linhas: [] };
}

/** O IDS de cada roteador do caminho olha o conteúdo em claro. Se um IPS bloquear, devolve o motivo. */
export function inspecionarNoCaminho(m: Mundo, c: CaminhoMundo, origem: string, destino: string, conteudo: string): { bloqueio?: string; linhas: Saida } {
  const linhas: Saida = [];
  for (const nome of c.roteadores) {
    const r = m.equipamentos.get(nome);
    const ids = r && idsDe(r);
    if (!ids) continue;
    const d = inspecionarConteudo(ids, { origem: lerIp(origem) ?? 0, destino: lerIp(destino) ?? 0, protocolo: 6 }, conteudo);
    refrescarFiltros(m, r!);
    if (d.texto) linhas.push(`  ${nome}: ${d.texto}`);
    if (d.bloquear) return { bloqueio: `${nome}: ${d.texto}`, linhas };
  }
  return { linhas };
}

function registrar(m: Mundo, e: Equipamento, a: Abertura, proto: Protocolo, porta: number, claro: string, fio: string, cifrado: boolean, resumo: string): void {
  const c = a.c;
  registrarTrafego(m, { de: e.nome, para: a.srv?.nome ?? '?', ipDe: c.ipLocal, ipPara: c.ipDestino, proto, porta, claro, fio, cifrado, resumo, nos: c.nos ?? [], nosTunel: c.nosTunel ?? [], interceptadoPor: c.interceptadoPor ?? [] });
}

/* ---------- DNS do mundo ---------- */

interface ServidorNoMundo {
  e?: Equipamento;
  zona: string;
  nome: string;
  ip: string;
}

function absoluto(nome: string, zona: string): string {
  if (nome === '@' || nome === '') return zona;
  if (nome.endsWith('.')) return normalizarNome(nome);
  if (zona === '.') return normalizarNome(nome);
  const z = zona.slice(0, -1);
  return nome.toLowerCase() === z || nome.toLowerCase().endsWith('.' + z) ? normalizarNome(nome) : normalizarNome(`${nome}.${z}`);
}

function servidoresDoMundo(m: Mundo): ServidorNoMundo[] {
  const out: ServidorNoMundo[] = [];
  for (const e of m.equipamentos.values()) {
    const d = servicosDe(e)?.dns;
    const ip = ipPrincipal(e);
    if (!d?.zona || !ip) continue;
    const zona = normalizarNome(d.zona);
    out.push({ e, zona, nome: normalizarNome(d.nome ?? (zona === '.' ? 'a.raiz.' : `ns1.${zona}`)), ip });
  }
  return out;
}

export interface EspacoDoMundo {
  espaco: EspacoNomes;
  servidores: ServidorNoMundo[];
  /** Zonas assinadas com DNSSEC. */
  assinadas: Set<string>;
}

/**
 * Espaço de nomes a partir dos servidores do mundo. Zona de cima que ninguém no laboratório serve (a raiz, o domínio
 * de topo) vira um servidor "lá fora", com atraso padrão, e cada zona ganha a delegação (NS e cola) na zona mãe.
 */
export function espacoDoMundo(m: Mundo): EspacoDoMundo {
  const mundo = servidoresDoMundo(m);
  const porZona = new Map<string, ServidorDns & { origem?: ServidorNoMundo }>();
  const assinadas = new Set<string>();
  for (const s of mundo) {
    if (porZona.has(s.zona)) continue;
    const d = servicosDe(s.e!)!.dns!;
    if (d.dnssec) assinadas.add(s.zona);
    const regs: RegistroDns[] = (d.registros ?? []).map((r) => ({ nome: absoluto(r.nome, s.zona), tipo: r.tipo, ttl: r.ttl ?? 300, valor: ['NS', 'CNAME', 'MX', 'PTR'].includes(r.tipo) && !r.valor.includes('.') ? absoluto(r.valor, s.zona) : r.valor, prioridade: r.prioridade }));
    if (!regs.some((r) => r.tipo === 'SOA')) regs.push({ nome: s.zona, tipo: 'SOA', ttl: 3600, valor: `${s.nome} ti.${s.zona === '.' ? 'raiz.' : s.zona} 2026112601` });
    if (!regs.some((r) => r.tipo === 'NS' && r.nome === s.zona)) regs.push({ nome: s.zona, tipo: 'NS', ttl: 86400, valor: s.nome });
    if (dentroDe(s.nome, s.zona) && !regs.some((r) => r.nome === s.nome && r.tipo === 'A')) regs.push({ nome: s.nome, tipo: 'A', ttl: 86400, valor: s.ip });
    porZona.set(s.zona, { nome: s.nome, ip: s.ip, zona: s.zona, registros: regs, origem: s });
  }
  // Zonas de cima que faltam: servidores "lá fora", com endereços de documentação que ninguém usa no laboratório.
  let virt = 200;
  const ipLivre = () => {
    let ip = '';
    do ip = `192.0.2.${virt++}`;
    while (donoDoIp(m, lerIp(ip)!) && virt < 255);
    return ip;
  };
  const garantir = (zona: string) => {
    if (porZona.has(zona)) return;
    const nome = zona === '.' ? 'a.raiz.' : `a.nic.${zona}`;
    const ip = ipLivre();
    porZona.set(zona, { nome, ip, zona, registros: [{ nome: zona, tipo: 'SOA', ttl: 3600, valor: `${nome} ti.${zona === '.' ? 'raiz.' : zona} 2026112601` }, { nome: zona, tipo: 'NS', ttl: 518400, valor: nome }, { nome, tipo: 'A', ttl: 518400, valor: ip }] });
  };
  garantir('.');
  for (const z of [...porZona.keys()]) {
    const rotulos = z === '.' ? [] : z.slice(0, -1).split('.');
    for (let i = rotulos.length - 1; i >= 1; i--) {
      const acima = rotulos.slice(i).join('.') + '.';
      if (i === rotulos.length - 1) garantir(acima);
    }
  }
  // Delegação: cada zona fica com NS e cola na zona mãe mais próxima que existe.
  const zonas = [...porZona.keys()].sort((a, b) => a.split('.').length - b.split('.').length);
  for (const z of zonas) {
    if (z === '.') continue;
    const rotulos = z.slice(0, -1).split('.');
    let mae = '.';
    for (let i = 1; i < rotulos.length; i++) {
      const a = rotulos.slice(i).join('.') + '.';
      if (porZona.has(a)) {
        mae = a;
        break;
      }
    }
    const pai = porZona.get(mae)!;
    const filho = porZona.get(z)!;
    if (!pai.registros.some((r) => r.tipo === 'NS' && r.nome === z)) pai.registros.push({ nome: z, tipo: 'NS', ttl: 86400, valor: filho.nome });
    if (!pai.registros.some((r) => r.tipo === 'A' && r.nome === filho.nome)) pai.registros.push({ nome: filho.nome, tipo: 'A', ttl: 86400, valor: filho.ip });
  }
  const espaco = montarEspacoNomes([...porZona.values()].map(({ origem: _o, ...s }) => s));
  return { espaco, servidores: mundo, assinadas };
}

/** Zona mais específica do mundo que contém o nome. */
function zonaDe(e: EspacoDoMundo, nome: string): string {
  let melhor = '.';
  for (const z of e.espaco.porZona.keys()) if (dentroDe(nome, z) && z.length > melhor.length) melhor = z;
  return melhor;
}

function cacheDe(e: Equipamento): CacheDns {
  return ((e.s._cacheDns as CacheDns | undefined) ??= new CacheDns());
}

export function cacheDoResolvedor(e: Equipamento): CacheDns {
  return cacheDe(e);
}

export interface Resolucao {
  ok: boolean;
  linhas: Saida;
  r?: ResultadoResolucao;
  ip?: string;
  resolvedor?: Equipamento;
  rttMs?: number;
  dnssec?: 'validada' | 'não validada' | 'sem assinatura' | 'rejeitada' | 'não confere';
  forjado?: boolean;
}

function linhaRegistro(r: RegistroDns): string {
  return `${r.nome.padEnd(28)} ${String(r.ttl).padStart(6)} IN ${r.tipo.padEnd(5)} ${valorRegistro(r)}`;
}

/** Resolve um nome no mundo: o cliente pergunta ao resolvedor configurado (UDP 53), e o resolvedor faz o resto, com cache. */
export function resolverNoMundo(m: Mundo, cliente: Equipamento, nome: string, tipo: TipoRegistro, resolvedorIp?: string): Resolucao {
  garantirEscutas(m);
  const proprio = servicosDe(cliente)?.dns?.recursivo;
  const ipTxt = resolvedorIp ?? (cliente.s.dns as string | undefined) ?? (proprio ? ipPrincipal(cliente) ?? undefined : undefined);
  const ipN = ipTxt ? lerIp(ipTxt) : null;
  if (ipN === null || !ipTxt) return { ok: false, linhas: ['Sem resolvedor configurado: use "resolvedor <ip>" (ou peça por DHCP, que entrega o DNS junto).'] };
  let rttMs = 0;
  let R: Equipamento;
  let caminho: Abertura | undefined;
  if (ipPrincipal(cliente) === ipTxt) R = cliente;
  else {
    const a = trocarUdp(m, cliente, ipN, 53);
    if (!a.ok) return { ok: false, linhas: a.linhas };
    caminho = a;
    R = a.srv!;
    rttMs = a.c.rtt * 1000;
  }
  const cfg = servicosDe(R)?.dns;
  if (!cfg) return { ok: false, linhas: [`${R.nome} escuta na porta 53, mas não roda servidor DNS. A consulta fica sem resposta.`] };
  const mundo = espacoDoMundo(m);
  const linhas: Saida = [`Resolvedor ${ipTxt} (${R.nome}), RTT ${num(rttMs, 2)} ms pela rede${R === cliente ? ' (é esta máquina)' : ''}.`];
  let r: ResultadoResolucao;
  const agora = relogio(m);
  if (!cfg.recursivo) {
    const zona = cfg.zona ? normalizarNome(cfg.zona) : null;
    const srv = zona ? mundo.espaco.porZona.get(zona) : undefined;
    if (!srv || !dentroDe(nome, zona!)) {
      linhas.push(`${R.nome} não faz recursão (só responde pela zona ${zona ?? 'nenhuma'}): resposta REFUSED. Configure um resolvedor recursivo.`);
      return { ok: false, linhas, resolvedor: R };
    }
    const resp = responderServidor(mundo.espaco, srv, novaConsultaDns(1, nome, tipo, true));
    r = { nome: normalizarNome(nome), tipo, respostas: resp.respostas, codigo: resp.flags.rcode === 3 ? 'NXDOMAIN' : 'NOERROR', consultas: 0, tempo: rttMs, origem: 'rede', detalhes: [], passos: [`${R.nome} é autoritativo para ${zona}: responde direto, sem perguntar a ninguém.`, ...descreverMensagemDns(resp)] };
  } else {
    // RTT do resolvedor até cada servidor do laboratório; quem não responde na 53 some do espaço de nomes.
    const rtt: Record<string, number> = {};
    for (const s of mundo.servidores) {
      if (s.e === R) {
        rtt[s.nome] = 0.05;
        continue;
      }
      const c = caminhoTransporte(m, R.nome, lerIp(s.ip)!, 'udp', cfg.portasAleatorias ? 1024 + Math.floor(m.rng() * 60000) : 53, 53);
      const atende = c.ok && demultiplexar(c.servidor!, 'udp', s.ip, 53, c.ipVisto, c.portaVista).como !== 'nenhum';
      if (!atende) {
        mundo.espaco.porNome.delete(s.nome);
        linhas.push(`  ${s.nome} (${s.ip}) não responde ao resolvedor: ${c.ok ? 'ninguém na porta 53' : c.falha}`);
      } else rtt[s.nome] = r4(c.rtt * 1000);
    }
    r = resolver(mundo.espaco, nome, tipo, { cache: cacheDe(R), agora, rttCliente: r4(rttMs), rtt, rttPadrao: 20, idInicial: 1 + Math.floor(m.rng() * 60000) });
  }
  linhas.push(...r.passos.map((x) => '  ' + x));
  const forjado = r.respostas.some((x) => (x as RegistroDns & { forjado?: boolean }).forjado);
  let dnssec: Resolucao['dnssec'];
  const finais = r.respostas.filter((x) => x.tipo === tipo);
  if (finais.length) {
    const zona = zonaDe(mundo, finais[0]!.nome);
    if (mundo.assinadas.has(zona)) {
      const assin = forjado ? undefined : assinarRrset(zona, finais);
      linhas.push(`  ${finais[0]!.nome} RRSIG ${tipo}: ${assin === undefined ? 'nenhuma assinatura válida' : `assinado pela chave da zona ${zona} (${String(assin)})`}; DS da zona na zona mãe: ${dsDe(zona)}.`);
      if (cfg.validar) {
        dnssec = forjado ? 'rejeitada' : 'validada';
        linhas.push(forjado ? '  DNSSEC: a resposta não tem assinatura que confira com a chave da zona. O resolvedor descarta (SERVFAIL).' : '  DNSSEC: assinatura conferida com a chave da zona, e a chave conferida pelo DS da zona de cima até a raiz (flag ad).');
      } else dnssec = forjado ? 'não confere' : 'não validada';
    } else dnssec = 'sem assinatura';
  }
  if (dnssec === 'rejeitada') {
    r = { ...r, respostas: [], codigo: 'SERVFAIL' };
  }
  const ip = r.respostas.find((x) => x.tipo === 'A')?.valor;
  const res: Resolucao = { ok: r.codigo === 'NOERROR' && r.respostas.length > 0, linhas, r, ip, resolvedor: R, rttMs, dnssec, forjado };
  if (caminho) registrar(m, cliente, caminho, 'udp', 53, `consulta DNS ${normalizarNome(nome)} ${tipo} / resposta ${r.codigo} ${r.respostas.map((x) => `${x.tipo} ${x.valor}`).join(', ')}`, `consulta DNS ${normalizarNome(nome)} ${tipo} / resposta ${r.respostas.map((x) => `${x.tipo} ${x.valor}`).join(', ')}`, false, `DNS ${normalizarNome(nome)} ${tipo}`);
  return res;
}

const TIPOS: TipoRegistro[] = ['A', 'AAAA', 'NS', 'MX', 'CNAME', 'TXT', 'PTR', 'SOA'];

function cmdDig(m: Mundo, e: Equipamento, args: string[], curto = false): Saida {
  const nome = args[0];
  const tipo = ((args[1] ?? 'A').toUpperCase()) as TipoRegistro;
  if (!nome || !TIPOS.includes(tipo)) return ['dig <nome> [A|AAAA|NS|MX|CNAME|TXT|PTR|SOA]'];
  const res = resolverNoMundo(m, e, nome, tipo);
  const r = res.r;
  anotarFlag(m, 'dns', { de: e.nome, nome: normalizarNome(nome), tipo, resolvedor: res.resolvedor?.nome ?? null, ok: res.ok, codigo: r?.codigo ?? 'SEM RESPOSTA', respostas: (r?.respostas ?? []).filter((x) => x.tipo === tipo).map((x) => x.valor), origem: r?.origem ?? null, consultas: r?.consultas ?? 0, tempoMs: r ? r4(r.tempo) : null, dnssec: res.dnssec ?? null, forjado: !!res.forjado });
  if (res.dnssec && res.dnssec !== 'sem assinatura') anotarFlag(m, 'dnssec', { ...(m.flags.dnssec ?? {}), consulta: { nome: normalizarNome(nome), tipo, resultado: res.dnssec, resolvedor: res.resolvedor?.nome } });
  if (!r) return res.linhas;
  if (curto) {
    const v = r.respostas.filter((x) => x.tipo === tipo || x.tipo === 'CNAME');
    return [`Servidor: ${res.resolvedor?.nome} (${e.s.dns ?? ipPrincipal(res.resolvedor!)})`, `Nome: ${normalizarNome(nome)}`, ...(v.length ? v.map((x) => `  ${x.tipo === 'CNAME' ? 'apelido de' : 'endereço'} ${x.valor}`) : [`  ${r.codigo}: nada encontrado`]), r.origem === 'cache' ? 'Resposta não autoritativa (veio do cache do resolvedor).' : ''].filter(Boolean);
  }
  return [
    `; dig ${normalizarNome(nome)} ${tipo}`,
    ...res.linhas,
    `;; RESPOSTA: ${r.codigo}, ${r.origem === 'cache' ? 'do cache do resolvedor' : `${r.consultas} consulta(s) a servidores`}, ${num(r.tempo, 2)} ms${res.dnssec === 'validada' ? ', DNSSEC conferido (ad)' : ''}`,
    ...(r.respostas.length ? r.respostas.map(linhaRegistro) : ['(seção de respostas vazia)']),
    r.origem === 'cache' ? 'O TTL que aparece é o que resta no cache: quando chegar a zero, o resolvedor pergunta de novo.' : `Agora o resolvedor guarda isso no cache pelo TTL (${r.respostas[0]?.ttl ?? 0} s). Repita e veja a diferença; "esperar <s>" faz o relógio andar.`,
  ];
}

/* ---------- Web ---------- */

function servidorWebDe(e: Equipamento): ServidorWeb | null {
  const cfg = servicosDe(e)?.web;
  if (!cfg) return null;
  const assinatura = JSON.stringify({ p: cfg.paginas ?? null, s: cfg.sessao ?? true });
  const x = e.s._web as { assinatura: string; servidor: ServidorWeb } | undefined;
  if (x && x.assinatura === assinatura) return x.servidor;
  const srv = new ServidorWeb(cfg.nome ?? e.nome, cfg.sessao === false ? {} : { cookieSessao: 'sessao', prefixoSessao: 's' });
  const paginas = cfg.paginas ?? { '/': { conteudo: `<h1>${cfg.nome ?? e.nome}</h1><p>Página de teste do laboratório.</p>` } };
  for (const [caminho, p] of Object.entries(paginas)) srv.publicar(caminho, { tipo: 'estatico', conteudo: p.conteudo, maxAge: p.maxAge ?? 0, modificado: p.modificado ?? 0, tipoMime: p.tipo });
  e.s._web = { assinatura, servidor: srv };
  return srv;
}

function navegadorDe(e: Equipamento): Navegador {
  return ((e.s._navegador as Navegador | undefined) ??= new Navegador());
}

/** Mapa de servidores que só vai à rede quando o navegador pergunta por um nome (cache fresco nem chega aqui). */
class ServidoresSobDemanda extends Map<string, ServidorWeb> {
  constructor(private readonly buscarNome: (nome: string) => ServidorWeb | undefined) {
    super();
  }
  override get(nome: string): ServidorWeb | undefined {
    return this.buscarNome(nome);
  }
}

interface Ida {
  ip?: string;
  a?: Abertura;
  dns?: Resolucao;
  falha?: string;
}

/** Nome (ou IP) até uma conexão TCP aberta na porta. */
function chegar(m: Mundo, e: Equipamento, nome: string, porta: number, linhas: Saida): Ida {
  let ip = lerIp(nome) !== null ? nome : undefined;
  let dns: Resolucao | undefined;
  if (!ip) {
    dns = resolverNoMundo(m, e, nome, 'A');
    const v = dns.r?.respostas.filter((x) => x.tipo === 'A' || x.tipo === 'CNAME').map((x) => `${x.tipo} ${x.valor}`).join(', ');
    linhas.push(`DNS: ${normalizarNome(nome)} ${dns.ok && dns.ip ? `vira ${dns.ip} (${v}; ${dns.r!.origem === 'cache' ? 'do cache' : `${dns.r!.consultas} consulta(s)`}, ${num(dns.r!.tempo, 1)} ms)` : `não resolveu (${dns.r?.codigo ?? 'sem resposta'})`}`);
    if (!dns.ok || !dns.ip) {
      linhas.push(...dns.linhas.slice(0, 6).map((x) => '  ' + x.trim()));
      return { dns, falha: 'dns' };
    }
    ip = dns.ip;
  }
  const a = abrirTcp(m, e, lerIp(ip)!, porta);
  linhas.push(...a.linhas);
  if (!a.ok) return { ip, a, dns, falha: a.motivo === 'recusada' ? 'recusada' : 'sem caminho' };
  return { ip, a, dns };
}

function cortar(txt: string, n = 500): string {
  return txt.length > n ? txt.slice(0, n) + ` ... (mais ${txt.length - n} caracteres)` : txt;
}

function cmdNavegar(m: Mundo, e: Equipamento, args: string[]): Saida {
  const u = args[0] ? lerUrl(args[0]) : null;
  if (!u || (u.esquema !== 'http' && u.esquema !== 'https')) return ['navegar <url> [ignorar-aviso]. Ex.: navegar http://www.loja.exemplo/ ou navegar https://www.loja.exemplo/'];
  garantirEscutas(m);
  const https = u.esquema === 'https';
  const aceitar = args.includes('ignorar-aviso');
  const nav = navegadorDe(e);
  const linhas: Saida = [];
  const ctx: { ida?: Ida; chave?: number[]; tls?: ReturnType<typeof apertoTls>; bloqueio?: string; req?: RequisicaoHttp; respTxt?: string; falha?: string } = {};
  const mapa = new ServidoresSobDemanda((nome) => {
    const ida = chegar(m, e, nome, u.porta, linhas);
    ctx.ida = ida;
    if (ida.falha) {
      ctx.falha = ida.falha;
      return undefined;
    }
    const srvEq = ida.a!.srv!;
    const web = servidorWebDe(srvEq);
    if (!web) {
      ctx.falha = 'sem-http';
      linhas.push(`${srvEq.nome} aceitou a conexão, mas o que escuta na porta ${u.porta} não fala HTTP.`);
      return undefined;
    }
    if (https) {
      const cfg = servicosDe(srvEq)?.web;
      const tipo: TipoCertificado = typeof cfg?.https === 'string' ? cfg.https : 'valido';
      const t = apertoTls(m, u.nome, tipo);
      ctx.tls = t;
      ctx.chave = t.chave;
      linhas.push(...t.linhas);
      if (!t.ok) {
        linhas.push(`AVISO DO NAVEGADOR: sua conexão com ${u.nome} pode não ser segura: ${t.motivo}.`, '  Alguém pode estar se passando pelo site ou o site está mal configurado. Senha e cartão, aqui, nem pensar.');
        if (!aceitar) {
          ctx.falha = 'certificado';
          linhas.push('  O navegador parou antes de mandar o pedido. (Para seguir mesmo assim, "navegar <url> ignorar-aviso", o que só serve para aprender.)');
          return undefined;
        }
        linhas.push('  Você mandou seguir mesmo assim.');
      }
    }
    const proxy = Object.create(web) as ServidorWeb;
    proxy.atender = (req: RequisicaoHttp, agora?: number) => {
      ctx.req = req;
      const txt = serializarRequisicao(req);
      if (!https) {
        const insp = inspecionarNoCaminho(m, ida.a!.c, ida.a!.c.ipLocal, ida.ip!, txt);
        linhas.push(...insp.linhas);
        if (insp.bloqueio) {
          ctx.bloqueio = insp.bloqueio;
          return novaResposta(503);
        }
      }
      const resp = web.atender(req, agora);
      ctx.respTxt = serializarResposta(resp);
      return resp;
    };
    return proxy;
  });
  const b = nav.buscar(mapa, args[0]!, relogio(m));
  const base = { de: e.nome, url: args[0], nome: u.nome, https };
  if (b.origem === 'cache') {
    anotarFlag(m, 'http', { ...base, ok: true, estado: b.resposta.estado, origem: 'cache', ip: null, servidor: null, cookies: { ...(nav.cookies.get(u.nome) ?? {}) }, bytes: 0 });
    return [...b.passos, `${b.resposta.estado} ${b.resposta.frase} (do cache, sem DNS, sem TCP, sem nada na rede).`, '', cortar(b.resposta.corpo, 300)];
  }
  if (ctx.falha) {
    anotarFlag(m, 'http', { ...base, ok: false, motivo: ctx.falha, origem: 'rede' });
    if (https && ctx.tls) anotarFlag(m, 'tls', { ...base, ok: false, motivo: ctx.tls.motivo, certificado: ctx.tls.certificado, cadeia: ctx.tls.cadeia.motivo ?? null, versao: '1.3' });
    return [...linhas, `A página não carregou (${{ dns: 'o nome não resolveu', recusada: 'conexão recusada', 'sem caminho': 'sem resposta no caminho', certificado: 'certificado inválido', 'sem-http': 'o serviço não é web' }[ctx.falha] ?? ctx.falha}).`];
  }
  const a = ctx.ida!.a!;
  if (ctx.bloqueio) {
    anotarFlag(m, 'http', { ...base, ok: false, motivo: 'ips', origem: 'rede', bloqueio: ctx.bloqueio });
    return [...linhas, 'O IPS derrubou a conexão (mandou RST para os dois lados): o pedido nunca chegou ao servidor.'];
  }
  const req = ctx.req ? serializarRequisicao(ctx.req) : '';
  const claro = `${req}\r\n${ctx.respTxt ?? ''}`;
  const fio = https ? cifrarRegistro(ctx.chave!, claro) : claro;
  registrar(m, e, a, 'tcp', u.porta, claro, https ? `TLS 1.3, SNI ${u.nome}, ${claro.length + 22} bytes de dados de aplicação: ${fio.slice(0, 96)}...` : claro, https, `${https ? 'HTTPS' : 'HTTP'} ${u.nome}${u.caminho}`);
  const r = b.resposta;
  const l: Saida = [...linhas];
  l.push('PEDIDO:', ...req.trimEnd().split('\r\n').map((x) => '  ' + x));
  const topo = (ctx.respTxt ?? '').split('\r\n\r\n')[0]!.split('\r\n');
  l.push(`RESPOSTA: ${topo[0]}${b.origem === 'validado' ? ' (sem corpo: o navegador usa a cópia do cache)' : ''}`, ...topo.slice(1).map((x) => '  ' + x));
  l.push(...b.passos.map((x) => '  ' + x));
  if (r.corpo) l.push('', cortar(r.corpo, 400));
  if (https) l.push('', `NO FIO (o que um farejador vê): TLS 1.3 para ${u.nome} (o nome vai no SNI), registro cifrado ${fio.slice(0, 64)}... Caminho, cookies e conteúdo ficaram ilegíveis.`);
  else l.push('', 'NO FIO: tudo acima passa em claro. Quem estiver num hub, numa porta espelhada ou no meio do caminho lê pedido, cookie e resposta.');
  anotarFlag(m, 'http', { ...base, ok: true, estado: b.origem === 'validado' ? 304 : r.estado, estadoFinal: r.estado, origem: b.origem, ip: ctx.ida!.ip, porta: u.porta, servidor: a.srv!.nome, cookies: { ...(nav.cookies.get(u.nome) ?? {}) }, enviouCookie: !!ctx.req?.cabecalhos['Cookie'], condicional: !!ctx.req?.cabecalhos['If-None-Match'], rttMs: r4(a.c.rtt * 1000), bytes: r.corpo.length, dns: ctx.ida!.dns ? { origem: ctx.ida!.dns.r?.origem, consultas: ctx.ida!.dns.r?.consultas } : null });
  if (https) anotarFlag(m, 'tls', { ...base, ok: ctx.tls!.ok, motivo: ctx.tls!.motivo ?? null, versao: '1.3', troca: 'Diffie-Hellman efêmero', cifra: 'AES-128 em modo contador', certificado: ctx.tls!.certificado, cadeia: ctx.tls!.cadeia.motivo ?? 'valida', dh: ctx.tls!.dh, fioCifrado: fio.slice(0, 64), legivel: false, sni: u.nome });
  return l;
}

/* ---------- Correio ---------- */

interface ContaCorreio {
  endereco: string;
  servidor: string;
}

function caixasDe(e: Equipamento): Record<string, MensagemCorreio[]> {
  return ((e.s._caixas as Record<string, MensagemCorreio[]> | undefined) ??= {});
}

function dataDoMundo(m: Mundo): Date {
  return new Date(Date.UTC(2026, 10, 26, 12, 0, 0) + relogio(m) * 1000);
}

function nomeCorreio(e: Equipamento): string {
  const c = servicosDe(e)?.correio;
  return c?.nome ?? `correio.${c?.dominio ?? e.nome}`;
}

function aceitaCaixa(e: Equipamento, endereco: string): boolean {
  const c = servicosDe(e)?.correio;
  if (!c) return false;
  if (dominioDe(endereco) !== c.dominio.toLowerCase().replace(/\.$/, '')) return false;
  return !c.caixas || c.caixas.map((x) => x.toLowerCase()).includes(endereco.toLowerCase()) || c.caixas.map((x) => x.toLowerCase()).includes(endereco.split('@')[0]!.toLowerCase());
}

function cmdCorreioEnviar(m: Mundo, e: Equipamento, args: string[], seguro: boolean): Saida {
  const conta = e.s.correio as ContaCorreio | undefined;
  if (!conta) return ['Primeiro a conta: correio conta <seu endereço> <ip do seu servidor de correio>'];
  const para = args[0];
  if (!para || !para.includes('@')) return [`correio ${seguro ? 'enviar-seguro' : 'enviar'} <para> <assunto> | <texto>. Ex.: correio enviar ana@escola.exemplo Reunião | Começa às 10h.`];
  const resto = args.slice(1).join(' ');
  const [assuntoTxt, ...corpoPartes] = resto.split('|');
  const assunto = (assuntoTxt ?? '').trim() || '(sem assunto)';
  let corpo = corpoPartes.join('|').trim();
  const linhas: Saida = [];
  if (seguro) {
    const tem = [...m.equipamentos.values()].some((x) => (x.s.correio as ContaCorreio | undefined)?.endereco?.toLowerCase() === para.toLowerCase() && x.s.pgp);
    if (!e.s.pgp) return ['Você ainda não tem par de chaves: "pgp gerar".'];
    if (!tem) return [`Não achei a chave pública de ${para}. Quem recebe precisa gerar a dela ("pgp gerar") e publicar.`];
    const p = protegerMensagem(m, conta.endereco, para, corpo);
    corpo = p.blindado;
    linhas.push('PGP:', ...p.linhas.map((x) => '  ' + x));
  }
  garantirEscutas(m);
  const srvIp = lerIp(conta.servidor);
  if (srvIp === null) return ['O servidor da conta precisa ser um IP.'];
  const sub = abrirTcp(m, e, srvIp, 587);
  linhas.push('1. Submissão ao seu servidor (porta 587):', ...sub.linhas.map((x) => '  ' + x));
  const base = { de: conta.endereco, para, assunto, pgp: seguro };
  if (!sub.ok) {
    anotarFlag(m, 'correio', { ...base, entregue: false, motivo: 'submissão' });
    return [...linhas, 'A mensagem ficou na caixa de saída.'];
  }
  const srv = sub.srv!;
  if (!servicosDe(srv)?.correio) {
    anotarFlag(m, 'correio', { ...base, entregue: false, motivo: 'servidor sem correio' });
    return [...linhas, `${srv.nome} não é servidor de correio.`];
  }
  const data = dataDoMundo(m);
  let msg = montarMensagem({ de: conta.endereco, para: [para], assunto, data, corpo });
  const d1 = dialogoSmtp({ cliente: e.nome, servidor: nomeCorreio(srv), de: conta.endereco, para: [para], mensagem: serializarMensagem(msg) });
  const insp = inspecionarNoCaminho(m, sub.c, sub.c.ipLocal, conta.servidor, serializarMensagem(msg));
  linhas.push(...insp.linhas);
  registrar(m, e, sub, 'tcp', 587, d1.linhas.map((x) => `${x.quem}: ${x.texto}`).join('\n'), d1.linhas.map((x) => `${x.quem}: ${x.texto}`).join('\n'), false, `SMTP ${conta.endereco} para ${para}`);
  linhas.push(...d1.linhas.slice(0, 6).map((x) => `  ${x.quem}: ${x.texto}`), '  ...', ...d1.linhas.slice(-3).map((x) => `  ${x.quem}: ${x.texto}`));
  msg = adicionarReceived(msg, { de: e.nome, ipDe: sub.c.ipLocal, por: nomeCorreio(srv), data, protocolo: 'ESMTPSA' });
  const dominio = dominioDe(para);
  const tentativas: { mx: string; ip?: string; prioridade?: number; resultado: string }[] = [];
  let entregue = false;
  let destino: Equipamento | undefined;
  if (aceitaCaixa(srv, para)) {
    destino = srv;
    tentativas.push({ mx: nomeCorreio(srv), resultado: 'local' });
    linhas.push(`2. ${para} é deste mesmo servidor: entrega local, sem MX.`);
    entregue = true;
  } else {
    linhas.push(`2. ${nomeCorreio(srv)} procura o MX de ${dominio}:`);
    const mx = resolverNoMundo(m, srv, dominio, 'MX', (srv.s.dns as string | undefined) ?? (e.s.dns as string | undefined));
    const lista = (mx.r?.respostas ?? []).filter((x) => x.tipo === 'MX').sort((a, b) => (a.prioridade ?? 10) - (b.prioridade ?? 10));
    if (!lista.length) linhas.push(`  ${dominio} não tem MX (${mx.r?.codigo ?? 'sem resposta do DNS'}).`, ...mx.linhas.slice(0, 4).map((x) => '  ' + x.trim()));
    else linhas.push(`  MX: ${lista.map((x) => `${x.prioridade ?? 10} ${x.valor.replace(/\.$/, '')}`).join(', ')}. Tenta primeiro o de menor número.`);
    for (const x of lista) {
      const a = resolverNoMundo(m, srv, x.valor, 'A', (srv.s.dns as string | undefined) ?? (e.s.dns as string | undefined));
      if (!a.ip) {
        tentativas.push({ mx: x.valor, prioridade: x.prioridade, resultado: 'sem endereço' });
        linhas.push(`  ${x.valor}: não resolveu.`);
        continue;
      }
      const t = abrirTcp(m, srv, lerIp(a.ip)!, 25);
      linhas.push(`3. ${nomeCorreio(srv)} para ${x.valor} (${a.ip}), porta 25:`, ...t.linhas.map((y) => '  ' + y));
      if (!t.ok || !servicosDe(t.srv!)?.correio) {
        tentativas.push({ mx: x.valor, ip: a.ip, prioridade: x.prioridade, resultado: t.ok ? 'não é correio' : 'sem conexão' });
        linhas.push('  Não deu: tenta o próximo MX, se houver.');
        continue;
      }
      const d2 = dialogoSmtp({ cliente: nomeCorreio(srv), servidor: x.valor.replace(/\.$/, ''), de: conta.endereco, para: [para], mensagem: serializarMensagem(msg), aceita: (end) => aceitaCaixa(t.srv!, end) });
      registrar(m, srv, t, 'tcp', 25, d2.linhas.map((y) => `${y.quem}: ${y.texto}`).join('\n'), d2.linhas.map((y) => `${y.quem}: ${y.texto}`).join('\n'), false, `SMTP entre servidores para ${para}`);
      linhas.push(...d2.linhas.filter((y) => y.quem === 'C' ? /^(EHLO|MAIL|RCPT|DATA|QUIT)/.test(y.texto) : true).slice(0, 20).map((y) => `  ${y.quem}: ${y.texto}`));
      tentativas.push({ mx: x.valor, ip: a.ip, prioridade: x.prioridade, resultado: d2.entregue ? 'entregue' : 'recusado' });
      if (d2.entregue) {
        entregue = true;
        destino = t.srv!;
        msg = adicionarReceived(msg, { de: nomeCorreio(srv), ipDe: ipPrincipal(srv) ?? '', por: x.valor.replace(/\.$/, ''), data: new Date(data.getTime() + 2000) });
      } else linhas.push(`  ${x.valor} recusou ${para} (550): o remetente recebe um aviso de não entrega.`);
      break;
    }
  }
  if (entregue && destino) {
    (caixasDe(destino)[para.toLowerCase()] ??= []).push(msg);
    linhas.push(`Entregue na caixa de ${para} em ${destino.nome}. Cabeçalhos Received (de baixo para cima, o caminho):`, ...cabecalhos(msg, 'Received').map((x) => '  Received: ' + x));
  } else linhas.push('Não entregue.');
  const final = tentativas.find((x) => x.resultado === 'entregue' || x.resultado === 'local');
  anotarFlag(m, 'correio', { ...base, entregue, servidor: srv.nome, destino: destino?.nome ?? null, mx: final?.mx ?? null, ipMx: final?.ip ?? null, prioridade: final?.prioridade ?? null, tentativas, received: cabecalhos(msg, 'Received').length });
  if (seguro) anotarFlag(m, 'pgp', { ...(m.flags.pgp ?? {}), de: conta.endereco, para, assinada: true, cifrada: true, entregue });
  return linhas;
}

function cmdCorreioLer(m: Mundo, e: Equipamento, args: string[]): Saida {
  const conta = e.s.correio as ContaCorreio | undefined;
  if (!conta) return ['Primeiro a conta: correio conta <seu endereço> <ip do seu servidor de correio>'];
  const proto = args[0] === 'pop3' ? 'pop3' : 'imap';
  garantirEscutas(m);
  const a = abrirTcp(m, e, lerIp(conta.servidor) ?? 0, proto === 'pop3' ? 110 : 143);
  if (!a.ok) return a.linhas;
  const caixa = caixasDe(a.srv!)[conta.endereco.toLowerCase()] ?? [];
  const f = entregaFinal(proto, conta.endereco, caixa);
  const l: Saida = [...a.linhas, `${proto.toUpperCase()} com ${a.srv!.nome}:`, ...f.linhas.slice(0, 14).map((x) => `  ${x.quem}: ${x.texto}`), ...f.passos.map((x) => '  ' + x)];
  const lidas: { de: string; assunto: string; pgp: boolean; assinaturaValida?: boolean }[] = [];
  caixa.forEach((msg, i) => {
    l.push(`MENSAGEM ${i + 1}: De ${cabecalho(msg, 'From')} | Assunto ${cabecalho(msg, 'Subject')} | ${cabecalho(msg, 'Date')}`);
    if (ehBlindado(msg.corpo)) {
      const ab = e.s.pgp ? abrirMensagem(msg.corpo, conta.endereco) : { ok: false, linhas: ['Mensagem cifrada com PGP e você não tem a chave privada ("pgp gerar").'] };
      l.push(...ab.linhas.map((x) => '  ' + x));
      if (ab.ok && 'texto' in ab) l.push('  ' + cortar(ab.texto ?? '', 300));
      else l.push(...msg.corpo.split(/\r?\n/).slice(0, 3).map((x) => '  ' + x));
      lidas.push({ de: cabecalho(msg, 'From') ?? '', assunto: cabecalho(msg, 'Subject') ?? '', pgp: true, assinaturaValida: 'assinaturaValida' in ab ? ab.assinaturaValida : undefined });
      if (ab.ok) anotarFlag(m, 'pgp', { ...(m.flags.pgp ?? {}), lida: { por: conta.endereco, assinaturaValida: (ab as { assinaturaValida?: boolean }).assinaturaValida ?? false } });
    } else {
      l.push('  ' + cortar(msg.corpo, 300));
      lidas.push({ de: cabecalho(msg, 'From') ?? '', assunto: cabecalho(msg, 'Subject') ?? '', pgp: false });
    }
  });
  if (!caixa.length) l.push('Caixa vazia.');
  registrar(m, e, a, 'tcp', proto === 'pop3' ? 110 : 143, caixa.map(serializarMensagem).join('\n\n'), caixa.map(serializarMensagem).join('\n\n'), false, `${proto.toUpperCase()} caixa de ${conta.endereco}`);
  if (proto === 'pop3') caixasDe(a.srv!)[conta.endereco.toLowerCase()] = [];
  anotarFlag(m, 'correioLido', { endereco: conta.endereco, protocolo: proto, mensagens: lidas.length, lidas, ficaNoServidor: f.ficaNoServidor });
  return l;
}

function cmdCorreio(m: Mundo, e: Equipamento, args: string[]): Saida {
  switch (args[0]) {
    case 'conta': {
      if (!args[1]) {
        const c = e.s.correio as ContaCorreio | undefined;
        return [c ? `Conta ${c.endereco}, servidor ${c.servidor}.` : 'Sem conta. correio conta <endereço> <ip do servidor>'];
      }
      if (!args[1].includes('@') || lerIp(args[2] ?? '') === null) return ['correio conta <endereço> <ip do servidor>. Ex.: correio conta bia@loja.exemplo 203.0.113.25'];
      e.s.correio = { endereco: args[1].toLowerCase(), servidor: args[2] } satisfies ContaCorreio;
      return [`Conta ${args[1]} no servidor ${args[2]}: envio pela 587 (submissão), leitura pela 143 (IMAP) ou 110 (POP3).`];
    }
    case 'enviar':
      return cmdCorreioEnviar(m, e, args.slice(1), false);
    case 'enviar-seguro':
      return cmdCorreioEnviar(m, e, args.slice(1), true);
    case 'ler':
      return cmdCorreioLer(m, e, args.slice(1));
  }
  return ['correio conta <endereço> <ip do servidor> | correio enviar <para> <assunto> | <texto> | correio enviar-seguro <para> <assunto> | <texto> | correio ler [imap|pop3]'];
}

/* ---------- Streaming e CDN ---------- */

function cmdAssistir(m: Mundo, e: Equipamento, args: string[]): Saida {
  const u = args[0] ? lerUrl(args[0]) : null;
  if (!u) return ['assistir <url> [atraso inicial em s] [adaptativo]. Ex.: assistir http://video.loja.exemplo/aula 2'];
  const atraso = lerNumero(args[1] ?? '') ?? 2;
  const adaptativo = args.includes('adaptativo');
  garantirEscutas(m);
  const linhas: Saida = [];
  const ida = chegar(m, e, u.nome, u.porta, linhas);
  if (ida.falha) {
    anotarFlag(m, 'streaming', { de: e.nome, url: args[0], ok: false, motivo: ida.falha });
    return [...linhas, 'O vídeo não começou.'];
  }
  const srv = ida.a!.srv!;
  const nome = u.caminho.replace(/^\//, '') || 'video';
  const v = servicosDe(srv)?.streaming?.videos?.[nome] ?? { taxa: 4000, duracao: 60 };
  const c = ida.a!.c;
  const base = c.bandaBps / 1000;
  // A banda que sobra para o vídeo varia segundo a segundo (partida lenta, outros fluxos, quedas), mas é sempre a
  // mesma série para o mesmo servidor, cliente e vídeo: o resultado de cada tentativa é reprodutível.
  const semente = parseInt(resumo32(`vazao|${srv.nome}|${e.nome}|${nome}|${Math.round(base)}`), 16);
  const banda = vazaoNoTempo({ base, segundos: Math.ceil(v.duracao * 3) + 10, semente, rtt: c.rtt });
  const media = banda.slice(0, v.duracao).reduce((s, x) => s + x, 0) / Math.max(1, Math.min(v.duracao, banda.length));
  const trecho = banda.slice(0, Math.max(1, v.duracao));
  linhas.push(`Vídeo "${nome}" de ${srv.nome}: ${num(v.duracao, 0)} s a ${num(v.taxa, 0)} kb/s. Banda medida no caminho: gargalo de ${num(base / 1000, 1)} Mb/s em ${c.gargalo.de}:${c.gargalo.porta}; para o vídeo sobram em média ${num(media / 1000, 1)} Mb/s, de ${num(Math.min(...trecho) / 1000, 1)} a ${num(Math.max(...trecho) / 1000, 1)} Mb/s ao longo do tempo (partida lenta do TCP no primeiro segundo, outros fluxos, quedas).`);
  if (adaptativo) {
    const niveis = [
      { nome: '240p', taxa: Math.round(v.taxa / 8) },
      { nome: '480p', taxa: Math.round(v.taxa / 3) },
      { nome: '720p', taxa: Math.round(v.taxa / 1.5) },
      { nome: '1080p', taxa: v.taxa },
    ];
    const r = simularAdaptativo({ niveis, banda, segmentos: Math.ceil(v.duracao / 2), segmento: 2, inicio: atraso || 2 });
    anotarFlag(m, 'streaming', { de: e.nome, url: args[0], ok: true, adaptativo: true, taxaKbps: v.taxa, bandaKbps: Math.round(media), atrasoInicial: atraso, travamentos: r.travamentos, tempoTravado: r.tempoTravado, trocas: r.trocas, qualidadeMedia: Math.round(r.qualidadeMedia) });
    return [...linhas, ...r.passos.slice(0, 20).map((x) => '  ' + x), `Adaptativo: ${r.trocas} troca(s) de qualidade, ${r.travamentos} travamento(s), qualidade média ${num(r.qualidadeMedia, 0)} kb/s.`];
  }
  const r = simularBuffer({ duracao: v.duracao, taxaVideo: v.taxa, banda, atrasoInicial: atraso });
  const minimo = r.travamentos ? atrasoMinimo({ duracao: v.duracao, taxaVideo: v.taxa, banda }) : null;
  anotarFlag(m, 'streaming', { de: e.nome, url: args[0], ok: true, adaptativo: false, taxaKbps: v.taxa, bandaKbps: Math.round(media), atrasoInicial: atraso, travamentos: r.travamentos, tempoTravado: r.tempoTravado, fim: r.fim, atrasoMinimo: minimo });
  // Linha do tempo em uns 30 pedaços: o pedaço vira x se travou em algum momento dentro dele.
  const passo = Math.max(1, Math.round(r.linhaDoTempo.length / 30));
  let barra = '';
  for (let i = 0; i < r.linhaDoTempo.length; i += passo) {
    const pedaco = r.linhaDoTempo.slice(i, i + passo);
    barra += pedaco.some((x) => x.estado === 'travado') ? 'x' : pedaco.some((x) => x.estado === 'tocando') ? '>' : '.';
  }
  let conclusao = 'Tocou sem travar: o buffer absorveu as variações.';
  if (r.travamentos && minimo !== null) {
    const espera = `um atraso inicial de ${num(minimo, 0)} s (${num((minimo / v.duracao) * 100, 0)} % da duração)`;
    conclusao =
      media >= v.taxa
        ? `A banda média (${num(media / 1000, 1)} Mb/s) alcança a taxa do vídeo (${num(v.taxa / 1000, 1)} Mb/s), mas varia: faltou reserva para atravessar as quedas. Nesta banda, ${espera} já toca do começo ao fim.`
        : minimo <= v.duracao * 0.1
          ? `A banda média (${num(media / 1000, 1)} Mb/s) fica um pouco abaixo da taxa do vídeo (${num(v.taxa / 1000, 1)} Mb/s): a reserva vai diminuindo, mas ${espera} ainda chega ao fim sem travar. Sem esperar tanto, só baixando a qualidade ("adaptativo").`
          : `A banda média (${num(media / 1000, 1)} Mb/s) não alcança a taxa do vídeo (${num(v.taxa / 1000, 1)} Mb/s): a reserva só diminui. Para tocar liso nesta qualidade seria preciso ${espera}, quase baixar antes de ver. O que resolve é baixar a qualidade ("adaptativo").`;
  }
  return [...linhas, ...r.passos.slice(0, 14).map((x) => '  ' + x), `Linha do tempo (. esperando, > tocando, x travado): ${barra}`, conclusao];
}

function cdnDoMundo(m: Mundo): { e: Equipamento; cfg: NonNullable<ServicosEquip['cdn']> } | null {
  for (const e of m.equipamentos.values()) {
    const c = servicosDe(e)?.cdn;
    if (c) return { e, cfg: c };
  }
  return null;
}

const BORDAS_PADRAO = ['São Paulo', 'Recife', 'Porto Alegre', 'Manaus', 'Brasília'];

function cmdCdn(m: Mundo, e: Equipamento, args: string[]): Saida {
  const x = cdnDoMundo(m);
  const bordas = x?.cfg.bordas?.length ? x.cfg.bordas : BORDAS_PADRAO;
  const origem = x?.cfg.origem ?? 'São Paulo';
  if (args[0] === 'simular') {
    const espectadores = lerNumero(args[1] ?? '') ?? 2000;
    const taxa = lerNumero(args[2] ?? '') ?? 5;
    const r = simularCdn({ origem, bordas, publico: Object.keys(CIDADES).map((cidade) => ({ cidade, espectadores })), taxaPorEspectador: taxa, capacidadeEnlacePrincipal: x?.cfg.capacidade ?? 10000 });
    anotarFlag(m, 'cdn', { ...(m.flags.cdn ?? {}), simulacao: { espectadores, taxa, origem, bordas, semCdn: r.semCdn, comCdn: r.comCdn } });
    return [...r.passos, ...r.porCidade.map((p) => `  ${p.cidade.padEnd(16)} borda ${p.borda.padEnd(14)} RTT ${num(p.rttCom, 1)} ms (sem CDN: ${num(p.rttSem, 1)} ms)`)];
  }
  const nome = args[0] ?? x?.cfg.nome;
  if (!nome) return ['cdn <nome> [cidade de quem pergunta] | cdn simular [espectadores por cidade] [Mb/s cada]'];
  const cidade = args.slice(1).join(' ') || (e.s.cidade as string | undefined) || 'Curitiba';
  if (!CIDADES[cidade]) return [`Cidade desconhecida. Use uma destas: ${Object.keys(CIDADES).join(', ')}.`];
  const d = dnsCdn(nome, cidade, bordas);
  anotarFlag(m, 'cdn', { ...(m.flags.cdn ?? {}), nome: normalizarNome(nome), cidade, borda: d.borda, nomeCdn: d.nomeCdn, rttMs: r4(d.rtt), bordas, maisPerto: bordaMaisPerto(cidade, bordas) });
  return [`CDN ${x ? `configurada em ${x.e.nome}` : 'de exemplo'}: origem em ${origem}, bordas em ${bordas.join(', ')}.`, ...d.passos];
}

/* ---------- P2P ---------- */

function cmdP2p(m: Mundo, e: Equipamento, args: string[]): Saida {
  const sub = args[0] ?? 'simular';
  if (sub === 'dht') {
    const chave = args.slice(1).join(' ') || 'aula.mp4';
    const nos = [3, 17, 42, 77, 101, 150, 199, 230];
    const r = dhtResponsavel(chave, nos);
    anotarFlag(m, 'p2p', { ...(m.flags.p2p ?? {}), dht: { chave, id: r.id, responsavel: r.responsavel } });
    return r.passos;
  }
  if (sub === 'comparar') {
    const mb = lerNumero(args[1] ?? '') ?? 100;
    const usMbps = lerNumero(args[2] ?? '') ?? (e.portas[0]?.velocidades.at(-1) ?? 100);
    const uMbps = lerNumero(args[3] ?? '') ?? 10;
    const linhas = compararDistribuicao([1, 10, 100, 1000], { F: mb * 8e6, us: usMbps * 1e6, dmin: 100e6, u: uMbps * 1e6 });
    anotarFlag(m, 'p2p', { ...(m.flags.p2p ?? {}), comparacao: { mb, usMbps, uMbps, linhas } });
    return [`Arquivo de ${mb} MB, servidor sobe ${usMbps} Mb/s, cada par sobe ${uMbps} Mb/s e desce até 100 Mb/s.`, '   N   cliente-servidor     P2P', ...linhas.map((x) => `${String(x.N).padStart(5)} ${num(x.clienteServidor, 1).padStart(14)} s ${num(x.p2p, 1).padStart(10)} s`), 'No cliente-servidor o tempo cresce com N; no P2P cada par que recebe também serve, e o tempo para de crescer.'];
  }
  const nums = args.slice(sub === 'simular' ? 1 : 0).filter((x) => /^\d+$/.test(x)).map(Number);
  const pares = Math.min(200, nums[0] ?? 8);
  const pedacos = Math.min(400, nums[1] ?? 16);
  const conexoes = Math.min(20, nums[2] ?? 4);
  const politica = args.includes('aleatorio') ? 'aleatorio' : 'mais-raro';
  const olho = !args.includes('sem-olho');
  const r = simularP2P({ pares, pedacos, conexoes, politica, olhoPorOlho: olho, semente: Math.floor(m.rng() * 1e6) });
  anotarFlag(m, 'p2p', { ...(m.flags.p2p ?? {}), enxame: { pares, pedacos, conexoes, politica, olhoPorOlho: olho, rodadas: r.rodadas, transferencias: r.transferencias } });
  return r.passos;
}

/* ---------- Configurar serviços pelo console ---------- */

/**
 * Separa por espaços, mas o que vem entre aspas é uma palavra só, como a character-string do arquivo de zona
 * (RFC 1035, §5.1): "v=spf1 mx -all" vira um valor, e \" ou \\ dentro das aspas viram o próprio caractere.
 * O console junta espaços repetidos antes de chegar aqui; dentro das aspas fica um espaço só.
 */
export function lerPalavras(txt: string): string[] | string {
  const out: string[] = [];
  let i = 0;
  while (i < txt.length) {
    if (txt[i] === ' ') {
      i++;
      continue;
    }
    if (txt[i] === '"') {
      let v = '';
      i++;
      while (i < txt.length && txt[i] !== '"') {
        if (txt[i] === '\\' && i + 1 < txt.length) i++;
        v += txt[i++];
      }
      if (i >= txt.length) return 'Faltou fechar as aspas.';
      i++;
      out.push(v);
      continue;
    }
    let v = '';
    while (i < txt.length && txt[i] !== ' ') v += txt[i++];
    out.push(v);
  }
  return out;
}

function ligadoTxt(v: string | undefined): boolean | null {
  return v === 'on' || v === 'liga' || v === 'sim' ? true : v === 'off' || v === 'desliga' || v === 'nao' ? false : null;
}

function mostraServicos(e: Equipamento): Saida {
  const s = servicosDe(e);
  if (!s || !Object.keys(s).length) return [`${e.nome} não roda nenhum serviço. "servico dns zona <zona>", "servico web", "servico correio <domínio>"...`];
  const l = [`SERVIÇOS DE ${e.nome} (${ipPrincipal(e) ?? 'sem IP'})`];
  if (s.dns) {
    l.push(`  DNS: ${s.dns.zona ? `autoritativo para ${normalizarNome(s.dns.zona)}` : 'sem zona'}${s.dns.recursivo ? ', resolvedor recursivo com cache' : ''}${s.dns.dnssec ? ', zona assinada (DNSSEC)' : ''}${s.dns.validar ? ', valida DNSSEC' : ''}${s.dns.portasAleatorias ? ', portas de origem aleatórias' : ''}`);
    for (const r of s.dns.registros ?? []) l.push(`    ${r.nome} ${r.ttl ?? 300} ${r.tipo} ${valorRegistro({ ...r, ttl: r.ttl ?? 300 })}`);
    const c = e.s._cacheDns as CacheDns | undefined;
    if (c) l.push(`    cache: ${c.tamanho(0)} entrada(s) guardada(s)`);
  }
  if (s.web) {
    l.push(`  WEB: ${s.web.nome ?? e.nome}${s.web.https ? `, HTTPS com certificado ${ROTULO_CERT[typeof s.web.https === 'string' ? s.web.https : 'valido']}` : ', só HTTP'}${s.web.sessao === false ? '' : ', cookie de sessão'}`);
    for (const [k, p] of Object.entries(s.web.paginas ?? { '/': { conteudo: '(página padrão)' } })) l.push(`    ${k}: ${cortar(p.conteudo, 60)}${p.maxAge ? ` (max-age ${p.maxAge} s)` : ''}`);
  }
  if (s.correio) l.push(`  CORREIO: domínio ${s.correio.dominio}${s.correio.caixas ? `, caixas ${s.correio.caixas.join(', ')}` : ', aceita qualquer caixa do domínio'}`);
  if (s.streaming) l.push(`  STREAMING: ${Object.entries(s.streaming.videos ?? {}).map(([k, v]) => `${k} (${v.taxa} kb/s, ${v.duracao} s)`).join(', ') || 'vídeo padrão'}`);
  if (s.cdn) l.push(`  CDN: origem ${s.cdn.origem ?? 'São Paulo'}, bordas ${(s.cdn.bordas ?? BORDAS_PADRAO).join(', ')}`);
  return l;
}

function cmdServico(m: Mundo, e: Equipamento, args: string[]): Saida {
  if (!ipPrincipal(e)) return ['Sem endereço IP: serviço nenhum vai ser achado.'];
  const s = ((e.s.servicos as ServicosEquip | undefined) ??= {});
  const [tipo, op, ...resto] = args;
  const fim = (l: Saida) => {
    garantirEscutas(m);
    return [...l, ...mostraServicos(e)];
  };
  if (op === 'off' && tipo && tipo in PORTAS_SERVICO) {
    delete s[tipo as keyof ServicosEquip];
    return [`Serviço ${tipo} desligado (os soquetes continuam até "parar <proto> <porta>").`];
  }
  switch (tipo) {
    case 'dns': {
      const d = (s.dns ??= {});
      switch (op) {
        case 'zona':
          if (!resto[0]) return ['servico dns zona <zona> [nome do servidor]'];
          d.zona = normalizarNome(resto[0]);
          if (resto[1]) d.nome = normalizarNome(resto[1]);
          return fim([`${e.nome} agora é autoritativo para ${String(d.zona).replace(/\.$/, '')}. A zona mãe ganha a delegação (NS e cola) sozinha.`]);
        case 'registro': {
          const partes = lerPalavras(resto.join(' '));
          const uso = ['servico dns registro <nome> <A|AAAA|NS|MX|CNAME|TXT|PTR> <valor> [ttl] [prioridade do MX]. Texto com espaços vai entre aspas: servico dns registro @ TXT "v=spf1 mx -all"'];
          if (typeof partes === 'string') return [partes, ...uso];
          const [nome, t, valor, ttlTxt, priTxt] = partes;
          const tp = (t ?? '').toUpperCase() as TipoRegistro;
          if (!nome || !TIPOS.includes(tp) || valor === undefined || (valor === '' && tp !== 'TXT')) return uso;
          const ttl = ttlTxt ? Number(ttlTxt) : undefined;
          const pri = priTxt ? Number(priTxt) : undefined;
          // TTL é inteiro de 32 bits sem sinal (RFC 2181, §8); a preferência do MX, de 16 bits (RFC 1035, §3.3.9).
          if (ttl !== undefined && (!Number.isInteger(ttl) || ttl < 0 || ttl > 2147483647)) return ['O TTL é um número inteiro de segundos, de 0 a 2147483647.'];
          if (pri !== undefined && (!Number.isInteger(pri) || pri < 0 || pri > 65535)) return ['A prioridade do MX é um inteiro de 0 a 65535 (menor é mais preferido).'];
          if (tp === 'TXT' && new TextEncoder().encode(valor).length > 255) return ['Cada texto de um TXT cabe em 255 bytes (character-string, RFC 1035, §3.3). Divida em dois registros.'];
          if ((tp === 'A' && lerIp(valor) === null) || (tp === 'MX' && lerIp(valor) !== null)) return [tp === 'A' ? `Um registro A guarda um IPv4, e "${valor}" não é.` : 'O MX aponta para um nome (que tem o seu A), nunca direto para um IP (RFC 2181, §10.3).'];
          (d.registros ??= []).push({ nome, tipo: tp, valor, ttl, prioridade: tp === 'MX' ? (pri ?? 10) : undefined });
          const mostra = tp === 'TXT' ? `"${valor.replace(/(["\\])/g, '\\$1')}"` : tp === 'MX' ? `${pri ?? 10} ${valor}` : valor;
          return fim([`Registro ${nome} ${tp} ${mostra} na zona ${d.zona ? d.zona.replace(/\.$/, '') : '(ainda sem zona)'}.`]);
        }
        case 'recursivo':
        case 'validar':
        case 'dnssec':
        case 'portas-aleatorias': {
          const b = ligadoTxt(resto[0]);
          if (b === null) return [`servico dns ${op} <on|off>`];
          if (op === 'dnssec' && b && !d.zona) return ['Só se assina uma zona que este servidor serve: primeiro "servico dns zona <zona>".'];
          if ((op === 'validar' || op === 'portas-aleatorias') && b && !d.recursivo) return [`${op === 'validar' ? 'Quem valida DNSSEC' : 'Quem sorteia a porta de origem'} é o resolvedor, que pergunta aos outros servidores: primeiro "servico dns recursivo on".`];
          if (op === 'recursivo') d.recursivo = b;
          else if (op === 'validar') d.validar = b;
          else if (op === 'dnssec') d.dnssec = b;
          else d.portasAleatorias = b;
          const txt: Record<string, string> = {
            recursivo: b ? 'Resolvedor recursivo: os clientes perguntam aqui e este servidor vai da raiz até a resposta, guardando tudo no cache pelo TTL.' : 'Sem recursão: só responde pela própria zona.',
            validar: b ? 'O resolvedor passa a conferir as assinaturas DNSSEC: resposta de zona assinada sem assinatura certa é descartada (RFC 4035, §5).' : 'O resolvedor aceita qualquer resposta que pareça certa (id e porta batendo).',
            dnssec: b ? `Zona ${d.zona ?? '?'} assinada: cada conjunto de registros ganha RRSIG com a chave da zona (DNSKEY), e o resumo da chave vai para a zona mãe (DS). RFC 4033 a 4035.` : 'Zona sem assinatura.',
            'portas-aleatorias': b ? 'Cada consulta sai de uma porta de origem sorteada: quem quiser forjar resposta precisa acertar o id (16 bits) e a porta, mais uns 16 bits (RFC 5452).' : 'Consultas saem sempre da porta 53: só o id de 16 bits protege contra resposta forjada.',
          };
          return fim([txt[op]!]);
        }
        case 'cache': {
          const c = cacheDe(e);
          if (resto[0] === 'limpar') {
            c.limpar();
            return ['Cache do resolvedor esvaziado.'];
          }
          return [`Cache do resolvedor: ${c.tamanho(relogio(m))} entrada(s) viva(s) no relógio ${String(relogio(m)).replace(".", ",")} s.`];
        }
      }
      if (!op) return fim([]);
      return ['servico dns zona <zona> | registro <nome> <tipo> <valor> [ttl] [prioridade] | recursivo <on|off> | dnssec <on|off> | validar <on|off> | portas-aleatorias <on|off> | cache [limpar] | off'];
    }
    case 'web': {
      const w = (s.web ??= {});
      if (op === 'pagina') {
        const [caminho, ...texto] = resto;
        if (!caminho?.startsWith('/') || !texto.length) return ['servico web pagina <caminho> <conteúdo...>. Ex.: servico web pagina /promo Promoção de hoje'];
        const antiga = w.paginas?.[caminho];
        const conteudo = texto.join(' ');
        if (antiga && antiga.conteudo === conteudo) {
          // Mesmo conteúdo: mesmo ETag e mesma Last-Modified, e quem tem cópia continua recebendo 304.
          return fim([`Página ${caminho} já estava com esse conteúdo: ETag ${etagDe(conteudo)} e Last-Modified ${dataHttp(antiga.modificado ?? 0)} continuam os mesmos, e quem tem cópia continua recebendo 304.`]);
        }
        (w.paginas ??= {})[caminho] = { ...(antiga ?? {}), conteudo, modificado: relogio(m) };
        return fim([
          antiga
            ? `Página ${caminho} mudou: ETag novo ${etagDe(conteudo)} (era ${etagDe(antiga.conteudo)}), Last-Modified ${dataHttp(relogio(m))}. Quem tiver a cópia velha recebe 200 com a nova, não 304.`
            : `Página ${caminho} publicada: ETag ${etagDe(conteudo)} (resumo do conteúdo), Last-Modified ${dataHttp(relogio(m))}.`,
        ]);
      }
      if (op === 'validade') {
        const [caminho, seg] = resto;
        const n = Number(seg);
        if (!caminho || !w.paginas?.[caminho] || !Number.isFinite(n) || n < 0) return ['servico web validade <caminho já publicado> <segundos>'];
        w.paginas[caminho]!.maxAge = n;
        return fim([`Cache-Control: max-age=${n} para ${caminho}: o navegador usa a cópia sem perguntar durante ${String(n).replace(".", ",")} s.`]);
      }
      if (op === 'https') {
        const v = resto[0] ?? 'on';
        if (v === 'off') delete w.https;
        else if (v === 'on') w.https = 'valido';
        else if (TIPOS_CERTIFICADO.includes(v as TipoCertificado)) w.https = v as TipoCertificado;
        else return [`servico web https <on|off|${TIPOS_CERTIFICADO.join('|')}>`];
        return fim([w.https ? `HTTPS na porta 443 com certificado ${ROTULO_CERT[w.https]}${w.https === 'valido' ? ', emitido pela AC Intermediária Exemplo, que vem da AC Raiz Exemplo' : ' (para ver o navegador reclamar)'}.` : 'HTTPS desligado.']);
      }
      if (op === 'nome') {
        w.nome = resto[0];
        return fim([]);
      }
      if (op === 'sessao') {
        const b = ligadoTxt(resto[0]);
        if (b === null) return ['servico web sessao <on|off>'];
        w.sessao = b;
        return fim([]);
      }
      return fim([op ? 'servico web [pagina <caminho> <texto>] [validade <caminho> <s>] [https <on|off|tipo>] [sessao <on|off>] | servico web off' : 'Servidor web ligado na porta 80.']);
    }
    case 'correio': {
      if (!op) return ['servico correio <domínio> [caixas separadas por vírgula]'];
      s.correio = { dominio: op.toLowerCase().replace(/\.$/, ''), caixas: resto[0] ? resto[0].split(',').map((x) => x.trim().toLowerCase()) : undefined };
      return fim([`Servidor de correio de ${s.correio.dominio}: SMTP na 25, submissão na 587, IMAP na 143, POP3 na 110. Para receber de fora, o DNS do domínio precisa de um MX apontando para cá.`]);
    }
    case 'streaming': {
      const st = (s.streaming ??= {});
      if (op) {
        const taxa = Number(resto[0]);
        const dur = Number(resto[1] ?? 60);
        if (!Number.isFinite(taxa) || taxa <= 0 || !Number.isFinite(dur) || dur <= 0 || dur > 3600) return ['servico streaming <nome> <kb/s> [segundos]'];
        (st.videos ??= {})[op] = { taxa, duracao: dur };
      }
      return fim([]);
    }
    case 'cdn': {
      const [origem, ...bordas] = args.slice(1).join(' ').split(',').map((x) => x.trim()).filter(Boolean);
      if (origem && !CIDADES[origem]) return [`servico cdn <origem>, <borda>, <borda>... Cidades: ${Object.keys(CIDADES).join(', ')}.`];
      if (bordas.some((b) => !CIDADES[b])) return ['Bordas: cidades conhecidas separadas por vírgula, por exemplo: servico cdn São Paulo, Recife, Manaus, Porto Alegre'];
      s.cdn = { origem: origem ?? 'São Paulo', bordas: bordas.length ? bordas : undefined };
      return fim([]);
    }
  }
  return mostraServicos(e);
}

const ROTULO_CERT: Record<TipoCertificado, string> = { valido: 'válido', vencido: 'vencido', autoassinado: 'autoassinado', 'nome-errado': 'de outro nome', revogado: 'revogado' };

/* ---------- Entrada ---------- */

/** Comandos da camada de aplicação no console. Devolve null se o comando não é daqui. */
export function comandosAplicacao(m: Mundo, e: Equipamento, cmd: string, args: string[]): Saida | null {
  if (!interfacesL3(e).length && cmd !== 'servicos') return null;
  switch (cmd) {
    case 'servicos':
      garantirEscutas(m);
      return mostraServicos(e);
    case 'servico':
      return cmdServico(m, e, args);
  }
  if (e.tipo !== 'pc') return null;
  switch (cmd) {
    case 'resolvedor': {
      if (!args[0]) return [e.s.dns ? `Resolvedor ${e.s.dns}.` : 'Sem resolvedor. resolvedor <ip>'];
      if (lerIp(args[0]) === null) return ['resolvedor <ip>'];
      e.s.dns = args[0];
      return [`Resolvedor ${args[0]}: as consultas de nome vão para lá, por UDP na porta 53.`];
    }
    case 'dig':
      return cmdDig(m, e, args);
    case 'nslookup':
      return cmdDig(m, e, args, true);
    case 'esperar': {
      const n = lerNumero(args[0] ?? '');
      if (n === null || n < 0 || n > 864000) return ['esperar <segundos>: o relógio do mundo anda (o TTL do DNS e a validade do cache HTTP contam por ele).'];
      return [`Relógio do mundo: ${String(avancarRelogio(m, n)).replace(".", ",")} s.`];
    }
    case 'navegar':
      return cmdNavegar(m, e, args);
    case 'correio':
      return cmdCorreio(m, e, args);
    case 'assistir':
      return cmdAssistir(m, e, args);
    case 'cdn':
      return cmdCdn(m, e, args);
    case 'p2p':
      return cmdP2p(m, e, args);
    case 'cookies': {
      const nav = navegadorDe(e);
      const l = ['COOKIES DO NAVEGADOR'];
      for (const [k, v] of nav.cookies) l.push(`  ${k}: ${Object.entries(v).map(([a, b]) => `${a}=${b}`).join('; ')}`);
      l.push(`CACHE HTTP: ${nav.cache.size} objeto(s)`);
      if (args[0] === 'limpar') {
        nav.cookies.clear();
        nav.cache.clear();
        l.push('Cookies e cache apagados.');
      }
      return l;
    }
  }
  return null;
}

export const AJUDA_APLICACAO = [
  'servicos | servico dns zona <zona> | servico dns registro <nome> <tipo> <valor ou "texto entre aspas"> [ttl] [prioridade] | servico dns recursivo <on|off>',
  'servico dns dnssec <on|off> | servico dns validar <on|off> | servico dns portas-aleatorias <on|off> | servico dns cache [limpar]',
  'servico web [pagina <caminho> <texto>] [validade <caminho> <s>] [https <on|off|vencido|autoassinado|nome-errado|revogado>]',
  'servico correio <domínio> [caixas] | servico streaming <nome> <kb/s> [s] | servico cdn <origem>, <borda>, ... | servico <tipo> off',
  'resolvedor <ip> | dig <nome> [tipo] | nslookup <nome> | esperar <s>',
  'navegar <url> [ignorar-aviso] | cookies [limpar]',
  'correio conta <endereço> <ip> | correio enviar <para> <assunto> | <texto> | correio ler [imap|pop3]',
  'assistir <url> [atraso] [adaptativo] | cdn <nome> [cidade] | cdn simular [espectadores] [Mb/s]',
  'p2p simular [pares] [pedaços] [conexões] [aleatorio] [sem-olho] | p2p comparar [MB] [Mb/s servidor] [Mb/s par] | p2p dht <chave>',
];

/* ---------- Ações do menu ---------- */

const op = (valor: string, rotulo = valor): Opcao => ({ valor, rotulo });
const escolha = (nome: string, rotulo: string, opcoes: Opcao[], padrao?: string): Campo => ({ nome, rotulo, tipo: 'escolha', opcoes, padrao: padrao ?? opcoes[0]?.valor });
const numero = (nome: string, rotulo: string, unidade?: string, padrao?: string): Campo => ({ nome, rotulo, tipo: 'numero', unidade, padrao });
const texto = (nome: string, rotulo: string, padrao: string): Campo => ({ nome, rotulo, tipo: 'texto', padrao });

interface NomesConhecidos {
  /** Nomes com registro A. */
  a: string[];
  /** Todo nome das zonas do mundo: o ápice de cada zona e os nomes de todos os registros (A, CNAME, MX, TXT...). */
  todos: string[];
  /** Endereços das páginas publicadas, por esquema, pelos nomes que levam a cada servidor web. */
  paginas: { http: string[]; https: string[] };
  /** Endereços dos vídeos servidos, pelos nomes que levam a cada servidor de streaming. */
  videos: string[];
  dominiosCorreio: string[];
}

function nomesConhecidos(m: Mundo): NomesConhecidos {
  const a: string[] = [];
  const todos: string[] = [];
  const dominiosCorreio: string[] = [];
  /** nome → IP (do A) ou nome canônico (do CNAME), para achar o servidor de cada nome. */
  const enderecos = new Map<string, string>();
  const apelidos = new Map<string, string>();
  const semPonto = (x: string) => x.replace(/\.$/, '');
  const juntar = (lista: string[], x: string) => {
    if (!lista.includes(x)) lista.push(x);
  };
  for (const e of m.equipamentos.values()) {
    const s = servicosDe(e);
    if (s?.dns?.zona) {
      const zona = normalizarNome(s.dns.zona);
      if (zona !== '.') juntar(todos, semPonto(zona));
      for (const r of s.dns.registros ?? []) {
        const nome = semPonto(absoluto(r.nome, zona));
        if (!nome) continue;
        juntar(todos, nome);
        if (r.tipo === 'A') {
          juntar(a, nome);
          if (!enderecos.has(nome)) enderecos.set(nome, r.valor);
        }
        if (r.tipo === 'CNAME') apelidos.set(nome, semPonto(r.valor.includes('.') ? normalizarNome(r.valor) : absoluto(r.valor, zona)));
      }
    }
    if (s?.correio) dominiosCorreio.push(s.correio.dominio);
  }
  // Quem atende em cada nome: segue o apelido (até 8 voltas, como o resolvedor) e procura o dono do IP.
  const servidorDe = (nome: string): Equipamento | undefined => {
    let n = nome;
    for (let k = 0; k < 8 && !enderecos.has(n) && apelidos.has(n); k++) n = apelidos.get(n)!;
    const ip = lerIp(enderecos.get(n) ?? '');
    return ip === null ? undefined : donoDoIp(m, ip)?.e;
  };
  const paginas = { http: [] as string[], https: [] as string[] };
  const videos: string[] = [];
  for (const nome of [...a, ...apelidos.keys()]) {
    const srv = servidorDe(nome);
    const s = srv && servicosDe(srv);
    if (!s) continue;
    if (s.web) {
      for (const caminho of Object.keys(s.web.paginas ?? { '/': {} })) {
        juntar(paginas.http, `http://${nome}${caminho}`);
        if (s.web.https) juntar(paginas.https, `https://${nome}${caminho}`);
      }
    }
    if (s.streaming) for (const v of Object.keys(s.streaming.videos ?? { video: {} })) juntar(videos, `http://${nome}/${v}`);
  }
  return { a, todos, paginas, videos, dominiosCorreio };
}

/** Ações da camada de aplicação: no PC, usar e configurar serviços. Só aparecem com m.flags.aplicacao ou serviço configurado. */
export function acoesAplicacao(m: Mundo, e: Equipamento): Acao[] {
  if (e.tipo !== 'pc') return [];
  const ctx = e.nome;
  const n = nomesConhecidos(m);
  const nome = (rotulo = 'Nome') => (n.todos.length ? escolha('nome', rotulo, n.todos.map((x) => op(x))) : texto('nome', rotulo, 'www.loja.exemplo'));
  // Sem página publicada que se ache pelo DNS, os nomes que parecem de site (como antes).
  const parecemSite = n.a.filter((x) => /^(www|site|web|loja|video)/.test(x));
  const sites = parecemSite.length ? parecemSite : n.a;
  const lista = (rotulo: string, opcoes: string[], padrao: string) => (opcoes.length ? escolha('url', rotulo, opcoes.map((x) => op(x))) : texto('url', rotulo, padrao));
  const url = (esquema: 'http' | 'https') => lista('Endereço', n.paginas[esquema].length ? n.paginas[esquema] : n.paginas.http.length ? n.paginas.http.map((x) => x.replace(/^http:/, `${esquema}:`)) : sites.map((x) => `${esquema}://${x}/`), `${esquema}://www.loja.exemplo/`);
  const video = () => lista('Endereço do vídeo', n.videos.length ? n.videos : sites.map((x) => `http://${x}/video`), 'http://video.loja.exemplo/video');
  const conta = e.s.correio as ContaCorreio | undefined;
  const servidores: Opcao[] = [];
  for (const x of m.equipamentos.values()) {
    const s = servicosDe(x);
    const ip = ipPrincipal(x);
    if (s?.dns && ip) servidores.push(op(ip, `${ip} (${x.nome}${s.dns.recursivo ? ', recursivo' : ''})`));
  }
  const s = servicosDe(e);
  const a: Acao[] = [
    { id: 'ap-resolvedor', rotulo: 'Escolher o resolvedor de DNS', ajuda: 'O servidor que resolve nomes para esta máquina. Ele faz a recursão (raiz, topo, autoritativo) e guarda as respostas no cache pelo TTL.', contexto: ctx, campos: [servidores.length ? escolha('ip', 'Resolvedor', servidores, (e.s.dns as string | undefined) ?? servidores.find((x) => x.rotulo.includes('recursivo'))?.valor) : texto('ip', 'Resolvedor', (e.s.dns as string | undefined) ?? '192.168.1.53')], comandos: (v) => [`resolvedor ${v.ip}`] },
    { id: 'ap-dig', rotulo: 'Consultar um nome (dig)', ajuda: 'Pergunta ao resolvedor e mostra o passo a passo: cache, raiz, domínio de topo, autoritativo. Repita para ver a resposta vir do cache.', contexto: ctx, campos: [nome(), escolha('tipo', 'Tipo', TIPOS.map((x) => op(x)))], comandos: (v) => [`dig ${v.nome} ${v.tipo}`] },
    { id: 'ap-esperar', rotulo: 'Deixar o tempo passar', ajuda: 'O relógio do mundo anda: o TTL das respostas no cache do DNS e a validade das páginas no cache do navegador vencem.', contexto: ctx, campos: [numero('s', 'Segundos', 's', '300')], comandos: (v) => [`esperar ${v.s || 300}`] },
    { id: 'ap-navegar', rotulo: 'Abrir uma página (navegar)', ajuda: 'DNS, TCP, (TLS se for https), GET, resposta. Na segunda vez o navegador manda If-None-Match e o servidor responde 304 se nada mudou. Cookies vão e voltam.', contexto: ctx, campos: [url('http')], comandos: (v) => [`navegar ${v.url}`] },
    { id: 'ap-navegar-https', rotulo: 'Abrir uma página segura (https)', ajuda: 'TLS 1.3: troca Diffie-Hellman, certificado conferido pela cadeia até uma raiz confiável, chave de sessão, e o HTTP vai cifrado. Certificado inválido gera aviso.', contexto: ctx, campos: [url('https')], comandos: (v) => [`navegar ${v.url}`] },
    { id: 'ap-cookies', rotulo: 'Ver cookies e cache do navegador', ajuda: 'O que cada site guardou neste navegador e quantos objetos estão no cache HTTP.', contexto: ctx, comandos: () => ['cookies'] },
    { id: 'ap-correio-conta', rotulo: 'Configurar a conta de correio', ajuda: 'Seu endereço e o servidor de correio do seu domínio. Ele recebe o que você manda (submissão) e guarda o que chega para você.', contexto: ctx, campos: [texto('end', 'Endereço', conta?.endereco ?? `${e.nome}@${n.dominiosCorreio[0] ?? 'loja.exemplo'}`), texto('srv', 'IP do servidor', conta?.servidor ?? '203.0.113.25')], comandos: (v) => [`correio conta ${v.end} ${v.srv}`] },
    { id: 'ap-correio-enviar', rotulo: 'Mandar um e-mail', ajuda: 'Submissão ao seu servidor, consulta MX do domínio de destino, SMTP entre servidores (EHLO, MAIL FROM, RCPT TO, DATA) e um Received a cada salto.', contexto: ctx, campos: [texto('para', 'Para', `contato@${n.dominiosCorreio.find((d) => d !== conta?.endereco.split('@')[1]) ?? n.dominiosCorreio[0] ?? 'escola.exemplo'}`), texto('assunto', 'Assunto', 'Teste'), texto('corpo', 'Texto', 'Olá! Mensagem de teste.')], comandos: (v) => [`correio enviar ${v.para} ${v.assunto || 'Teste'} | ${v.corpo || ''}`] },
    { id: 'ap-correio-ler', rotulo: 'Ler a caixa de correio', ajuda: 'IMAP deixa as mensagens no servidor e sincroniza; POP3 baixa e apaga. Nos dois, os cabeçalhos Received contam o caminho.', contexto: ctx, campos: [escolha('proto', 'Protocolo', [op('imap', 'IMAP'), op('pop3', 'POP3')])], comandos: (v) => [`correio ler ${v.proto}`] },
    { id: 'ap-assistir', rotulo: 'Assistir a um vídeo', ajuda: 'O vídeo chega na banda medida do caminho. O reprodutor espera o atraso inicial enchendo o buffer; se a banda cair abaixo da taxa do vídeo, o buffer seca e trava.', contexto: ctx, campos: [video(), numero('atraso', 'Atraso inicial', 's', '2'), escolha('modo', 'Modo', [op('fixo', 'qualidade fixa'), op('adaptativo', 'adaptativo (troca de qualidade)')])], comandos: (v) => [`assistir ${v.url} ${v.atraso || 2}${v.modo === 'adaptativo' ? ' adaptativo' : ''}`] },
    { id: 'ap-cdn', rotulo: 'Consultar a CDN', ajuda: 'O site delega o nome por CNAME para a CDN, e o DNS da CDN escolhe a borda mais perto do resolvedor de quem pergunta.', contexto: ctx, campos: [texto('nome', 'Nome', 'video.loja.exemplo'), escolha('cidade', 'Cidade de quem pergunta', Object.keys(CIDADES).map((x) => op(x)), 'Curitiba')], comandos: (v) => [`cdn ${v.nome || 'video.loja.exemplo'} ${v.cidade}`] },
    { id: 'ap-cdn-simular', rotulo: 'Transmissão ao vivo com e sem CDN', ajuda: 'Milhares de espectadores em várias cidades: sem CDN, cada um puxa da origem; com CDN, cada borda puxa uma cópia e reparte.', contexto: ctx, campos: [numero('n', 'Espectadores por cidade', undefined, '2000'), numero('taxa', 'Taxa por espectador', 'Mb/s', '5')], comandos: (v) => [`cdn simular ${v.n || 2000} ${v.taxa || 5}`] },
    { id: 'ap-p2p', rotulo: 'Enxame P2P', ajuda: 'Uma semente e vários pares trocando pedaços em rodadas: mais raro primeiro e olho por olho (envia para quem mais lhe mandou).', contexto: ctx, campos: [numero('pares', 'Pares', undefined, '8'), numero('pedacos', 'Pedaços', undefined, '16'), escolha('pol', 'Política', [op('raro', 'mais raro primeiro'), op('aleatorio', 'aleatória')])], comandos: (v) => [`p2p simular ${v.pares || 8} ${v.pedacos || 16} 4${v.pol === 'aleatorio' ? ' aleatorio' : ''}`] },
    { id: 'ap-p2p-comparar', rotulo: 'Cliente-servidor contra P2P', ajuda: 'Tempo mínimo para N pessoas baixarem o mesmo arquivo: cresce com N no cliente-servidor, para de crescer no P2P.', contexto: ctx, campos: [numero('mb', 'Arquivo', 'MB', '100'), numero('us', 'Subida do servidor', 'Mb/s', '100'), numero('u', 'Subida de cada par', 'Mb/s', '10')], comandos: (v) => [`p2p comparar ${v.mb || 100} ${v.us || 100} ${v.u || 10}`] },
    { id: 'ap-p2p-dht', rotulo: 'Tabela de dispersão distribuída', ajuda: 'Sem rastreador central: a chave vira um número e fica no nó de menor distância XOR.', contexto: ctx, campos: [texto('chave', 'Chave', 'aula.mp4')], comandos: (v) => [`p2p dht ${v.chave || 'aula.mp4'}`] },
    { id: 'ap-servicos', rotulo: 'Ver os serviços desta máquina', ajuda: 'DNS, web, correio, streaming e CDN que rodam aqui, com as portas abertas.', contexto: ctx, comandos: () => ['servicos', 'soquetes'] },
    { id: 'ap-servico-dns', rotulo: 'Servir uma zona de DNS', ajuda: 'Esta máquina vira autoritativa para a zona. A zona mãe ganha a delegação sozinha. Depois acrescente registros A, MX, CNAME...', contexto: ctx, campos: [texto('zona', 'Zona', s?.dns?.zona?.replace(/\.$/, '') ?? 'loja.exemplo'), escolha('rec', 'Também resolver para os clientes (recursivo)?', [op('off', 'não'), op('on', 'sim')], s?.dns?.recursivo ? 'on' : 'off')], comandos: (v) => [`servico dns zona ${v.zona || 'loja.exemplo'}`, `servico dns recursivo ${v.rec}`] },
    {
      id: 'ap-servico-dns-registro',
      rotulo: 'Acrescentar registro de DNS',
      ajuda: 'A liga nome a IPv4; MX diz o servidor de correio (menor prioridade, mais preferido); CNAME é apelido; TXT é texto livre, com espaços se quiser. O TTL diz quanto tempo os caches podem guardar.',
      contexto: ctx,
      campos: [texto('nome', 'Nome (@ é a própria zona)', 'www'), escolha('tipo', 'Tipo', ['A', 'MX', 'CNAME', 'TXT', 'NS', 'AAAA'].map((x) => op(x))), texto('valor', 'Valor', ipPrincipal(e) ?? '203.0.113.10'), numero('ttl', 'TTL', 's', '300'), numero('prioridade', 'Prioridade (só MX)', undefined, '10')],
      comandos: (v) => {
        const valor = v.valor || (v.tipo === 'TXT' ? '' : ipPrincipal(e) || '203.0.113.10');
        // TXT vai sempre entre aspas, com aspas e barras de dentro escapadas: o espaço deixa de separar campos.
        const campo = v.tipo === 'TXT' ? `"${valor.replace(/(["\\])/g, '\\$1')}"` : valor;
        return [`servico dns registro ${v.nome || 'www'} ${v.tipo} ${campo} ${v.ttl || 300}${v.tipo === 'MX' ? ` ${v.prioridade || 10}` : ''}`];
      },
    },
    { id: 'ap-servico-dns-dnssec', rotulo: 'Assinar a zona (DNSSEC)', ajuda: 'Cada conjunto de registros ganha uma assinatura (RRSIG) feita com a chave da zona (DNSKEY), e o resumo da chave vai para a zona mãe (DS). Só adianta para quem valida.', contexto: ctx, campos: [escolha('v', 'Assinatura', [op('on', 'zona assinada'), op('off', 'sem assinatura')], s?.dns?.dnssec ? 'off' : 'on')], comandos: (v) => [`servico dns dnssec ${v.v}`] },
    { id: 'ap-servico-dns-validar', rotulo: 'Validar DNSSEC no resolvedor', ajuda: 'O resolvedor confere a assinatura de cada resposta de zona assinada, subindo pelos DS até a raiz. Resposta forjada não tem assinatura que confira: é descartada.', contexto: ctx, campos: [escolha('v', 'Validação', [op('on', 'ligada'), op('off', 'desligada')], s?.dns?.validar ? 'off' : 'on')], comandos: (v) => [`servico dns validar ${v.v}`] },
    { id: 'ap-servico-dns-portas', rotulo: 'Portas de origem aleatórias no resolvedor', ajuda: 'Cada consulta do resolvedor sai de uma porta sorteada: quem quiser forjar a resposta precisa acertar o id e a porta, uns 32 bits em vez de 16.', contexto: ctx, campos: [escolha('v', 'Portas aleatórias', [op('on', 'ligadas'), op('off', 'desligadas')], s?.dns?.portasAleatorias ? 'off' : 'on')], comandos: (v) => [`servico dns portas-aleatorias ${v.v}`] },
    { id: 'ap-servico-web', rotulo: 'Publicar uma página', ajuda: 'Servidor web na porta 80. Cada página tem ETag (resumo do conteúdo): mudou o conteúdo, mudou o ETag, e o 304 deixa de valer.', contexto: ctx, campos: [texto('caminho', 'Caminho', '/'), texto('conteudo', 'Conteúdo', 'Bem-vindo à loja do laboratório'), numero('validade', 'Validade no cache', 's', '0')], comandos: (v) => [`servico web pagina ${v.caminho || '/'} ${v.conteudo || 'Bem-vindo'}`, `servico web validade ${v.caminho || '/'} ${v.validade || 0}`] },
    { id: 'ap-servico-https', rotulo: 'Ligar HTTPS', ajuda: 'Certificado na porta 443. Escolha um problema para ver o aviso do navegador: vencido, autoassinado, de outro nome ou revogado.', contexto: ctx, campos: [escolha('tipo', 'Certificado', TIPOS_CERTIFICADO.map((x) => op(x, { valido: 'válido', vencido: 'vencido', autoassinado: 'autoassinado', 'nome-errado': 'de outro nome', revogado: 'revogado' }[x])))], comandos: (v) => [`servico web https ${v.tipo}`] },
    { id: 'ap-servico-correio', rotulo: 'Servir correio de um domínio', ajuda: 'SMTP na 25, submissão na 587, IMAP na 143, POP3 na 110. Para receber de outros servidores, o domínio precisa de MX no DNS.', contexto: ctx, campos: [texto('dominio', 'Domínio', s?.correio?.dominio ?? 'loja.exemplo'), texto('caixas', 'Caixas (vazio: qualquer uma)', '')], comandos: (v) => [`servico correio ${v.dominio || 'loja.exemplo'}${v.caixas ? ` ${v.caixas.replace(/\s+/g, '')}` : ''}`] },
    { id: 'ap-servico-streaming', rotulo: 'Servir um vídeo', ajuda: 'Um vídeo com taxa (kb/s) e duração. Quem assistir recebe na banda do caminho.', contexto: ctx, campos: [texto('nome', 'Nome', 'video'), numero('taxa', 'Taxa', 'kb/s', '4000'), numero('dur', 'Duração', 's', '60')], comandos: (v) => [`servico streaming ${v.nome || 'video'} ${v.taxa || 4000} ${v.dur || 60}`] },
    { id: 'ap-servico-cdn', rotulo: 'Contratar uma CDN', ajuda: 'A cidade da origem e as cidades das bordas, separadas por vírgula. O resolvedor de cada cidade passa a mandar quem assiste para a borda mais próxima.', contexto: ctx, campos: [texto('origem', 'Origem', 'São Paulo'), texto('bordas', 'Bordas', 'Curitiba, Recife, Manaus, Porto Alegre')], comandos: (v) => [`servico cdn ${v.origem || 'São Paulo'}, ${v.bordas || 'Curitiba, Recife, Manaus, Porto Alegre'}`] },
  ];
  return a;
}
