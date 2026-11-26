// Camada de transporte (ato 5) no mundo do jogo: tabela de soquetes por host, serviços escutando em portas
// conhecidas, primitivas (socket, bind, listen, accept, connect, send, receive, close) num log, multiplexação e
// demultiplexação pela quádrupla, e o caminho real entre dois hosts (atraso, banda do gargalo, buffer e perda),
// medido com um segmento de verdade atravessando roteadores e NAT (que agora traduz a porta TCP ou UDP).
// A física do TCP, do UDP e do QUIC fica em tcp.ts, udp.ts e quic.ts; aqui só se liga uma coisa à outra.

import type { Equipamento, Mundo } from './mundo';
import { interfacesL3, novoPacote, viajar, type Viagem } from './roteamento';
import { BUFFER_PADRAO } from './fila';
import { filasDe } from './cliQos';
import { ipTexto } from './util';
import { simularConexao, TCP_PADRAO, type ConfigTcp, type EstadoTcp, type Gargalo, type ResultadoConexao } from './tcp';

export type Protocolo = 'tcp' | 'udp';

export interface Soquete {
  proto: Protocolo;
  ipLocal: string;
  portaLocal: number;
  ipRemoto?: string;
  portaRemota?: number;
  /** Estado TCP; no UDP, "ABERTO" (não existe conexão, só a porta reservada). */
  estado: EstadoTcp | 'ABERTO';
  servico?: string;
  /** Descritor que a primitiva socket devolveu. */
  fd: number;
}

/** Portas conhecidas (até 1023, reservadas pela IANA) e algumas registradas. */
export const PORTAS_CONHECIDAS: Record<number, string> = {
  20: 'ftp-dados',
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  53: 'dns',
  67: 'dhcp',
  69: 'tftp',
  80: 'http',
  110: 'pop3',
  123: 'ntp',
  143: 'imap',
  161: 'snmp',
  443: 'https',
  514: 'syslog',
  587: 'submissão',
  993: 'imaps',
  3478: 'stun',
  5060: 'sip',
  5004: 'rtp',
};

export const PRIMEIRA_EFEMERA = 49152;

/** O mundo usa a camada de transporte? Menus e ajuda só mostram as coisas novas quando sim. */
export function temTransporte(m: Mundo): boolean {
  if (m.flags.transporte) return true;
  for (const e of m.equipamentos.values()) if ((e.s.soquetes as Soquete[] | undefined)?.length || e.s.tcp) return true;
  return false;
}

export function soquetesDe(e: Equipamento): Soquete[] {
  return ((e.s.soquetes as Soquete[] | undefined) ??= []);
}

/** Configuração TCP do host (o padrão mais o que foi mudado com "tcp <opção> <valor>"). */
export function configTcp(e: Equipamento): ConfigTcp {
  return { ...TCP_PADRAO, ...((e.s.tcp as Partial<ConfigTcp> | undefined) ?? {}) };
}

/** O que muda o resultado de uma transferência: a configuração TCP e as opções de caminho (perda e buffer extra). */
export function assinaturaTcp(e: Equipamento): string {
  const c = configTcp(e);
  return JSON.stringify({ ...c, limiar: Number.isFinite(c.limiar) ? c.limiar : 'infinito', caminho: e.s.caminhoTransporte ?? {} });
}

function estadoSoquetes(m: Mundo): { primitivas: string[]; demux?: unknown } {
  return ((m.flags.soquetes as { primitivas: string[] } | undefined) ??= { primitivas: [] });
}

/** Anota uma primitiva no log (o que um programa chamaria na API de soquetes). */
export function primitiva(m: Mundo, e: Equipamento, texto: string): string {
  const l = `${e.nome}: ${texto}`;
  const s = estadoSoquetes(m);
  s.primitivas.push(l);
  if (s.primitivas.length > 200) s.primitivas.splice(0, s.primitivas.length - 200);
  return l;
}

function proxFd(e: Equipamento): number {
  e.s.proxFd = ((e.s.proxFd as number | undefined) ?? 2) + 1;
  return e.s.proxFd as number;
}

export function ipPrincipal(e: Equipamento): string | null {
  const i = interfacesL3(e)[0];
  return i ? ipTexto(i.cidr.endereco) : null;
}

/** Porta efêmera livre (de 49152 em diante), como o sistema escolhe no connect sem bind. */
export function portaEfemera(e: Equipamento, proto: Protocolo): number {
  const usadas = new Set(soquetesDe(e).filter((s) => s.proto === proto).map((s) => s.portaLocal));
  let p = ((e.s.proxEfemera as number | undefined) ?? PRIMEIRA_EFEMERA);
  while (usadas.has(p)) p = p >= 65535 ? PRIMEIRA_EFEMERA : p + 1;
  e.s.proxEfemera = p >= 65535 ? PRIMEIRA_EFEMERA : p + 1;
  return p;
}

/** Abertura passiva: socket, bind na porta e listen (TCP). No UDP basta socket e bind. */
export function escutar(m: Mundo, e: Equipamento, proto: Protocolo, porta: number, nome?: string): { ok: boolean; linhas: string[] } {
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return { ok: false, linhas: ['Porta de 1 a 65535.'] };
  const ip = ipPrincipal(e);
  if (!ip) return { ok: false, linhas: ['Sem endereço IP: não tenho onde escutar.'] };
  const lista = soquetesDe(e);
  const ja = lista.find((s) => s.proto === proto && s.portaLocal === porta && (s.estado === 'LISTEN' || (proto === 'udp' && !s.ipRemoto)));
  if (ja) return { ok: false, linhas: [`bind: endereço já em uso. A porta ${proto.toUpperCase()} ${porta} já é de "${ja.servico ?? 'alguém'}" neste host. Cada porta, um dono (por protocolo: a 53 do UDP e a 53 do TCP são portas diferentes).`] };
  const fd = proxFd(e);
  const servico = nome ?? PORTAS_CONHECIDAS[porta] ?? `serviço ${porta}`;
  const linhas = [primitiva(m, e, `socket(${proto === 'tcp' ? 'SOCK_STREAM' : 'SOCK_DGRAM'}) devolve o descritor ${fd}`), primitiva(m, e, `bind(${fd}, 0.0.0.0:${porta})`)];
  if (proto === 'tcp') linhas.push(primitiva(m, e, `listen(${fd}, fila de 128): CLOSED → LISTEN`), primitiva(m, e, `accept(${fd}) bloqueia esperando alguém conectar`));
  else linhas.push(primitiva(m, e, `recvfrom(${fd}) bloqueia esperando um datagrama`));
  lista.push({ proto, ipLocal: '0.0.0.0', portaLocal: porta, estado: proto === 'tcp' ? 'LISTEN' : 'ABERTO', servico, fd });
  linhas.push(`${servico} escutando em ${proto.toUpperCase()} ${porta}${porta < 1024 ? ' (porta conhecida: abaixo de 1024, só o administrador pode abrir)' : ''}.`);
  return { ok: true, linhas };
}

export function pararDeEscutar(m: Mundo, e: Equipamento, proto: Protocolo, porta: number): string[] {
  const lista = soquetesDe(e);
  const i = lista.findIndex((s) => s.proto === proto && s.portaLocal === porta && (s.estado === 'LISTEN' || (proto === 'udp' && !s.ipRemoto)));
  if (i < 0) return [`Ninguém escuta em ${proto.toUpperCase()} ${porta} aqui.`];
  const s = lista[i]!;
  lista.splice(i, 1);
  return [primitiva(m, e, `close(${s.fd})${proto === 'tcp' ? ': LISTEN → CLOSED' : ''}`), `${s.servico ?? 'O serviço'} parou de escutar em ${proto.toUpperCase()} ${porta}. Quem tentar agora ${proto === 'tcp' ? 'leva RST' : 'leva ICMP "porta inalcançável"'}.`];
}

export interface Demux {
  soquete?: Soquete;
  como: 'quadrupla' | 'escuta' | 'nenhum';
  texto: string;
}

/**
 * Demultiplexação: o segmento que chega vai para o soquete cuja quádrupla (IP e porta de origem e destino) casa
 * exatamente. Se nenhum casa, vai para quem escuta na porta de destino (TCP com LISTEN, UDP aberto). Se nem isso,
 * ninguém: o TCP responde RST e o UDP, ICMP "porta inalcançável".
 */
export function demultiplexar(e: Equipamento, proto: Protocolo, ipDestino: string, portaDestino: number, ipOrigem: string, portaOrigem: number): Demux {
  const lista = soquetesDe(e);
  const exato = lista.find((s) => s.proto === proto && s.portaLocal === portaDestino && s.ipRemoto === ipOrigem && s.portaRemota === portaOrigem && (s.ipLocal === ipDestino || s.ipLocal === '0.0.0.0'));
  if (exato) return { soquete: exato, como: 'quadrupla', texto: `${proto.toUpperCase()} ${ipOrigem}:${portaOrigem} → ${ipDestino}:${portaDestino} casa com o soquete ${exato.fd} (${exato.estado}) pela quádrupla inteira` };
  const escuta = lista.find((s) => s.proto === proto && s.portaLocal === portaDestino && !s.ipRemoto && (s.estado === 'LISTEN' || s.estado === 'ABERTO'));
  if (escuta) return { soquete: escuta, como: 'escuta', texto: `${proto.toUpperCase()} ${ipOrigem}:${portaOrigem} → ${ipDestino}:${portaDestino} vai para o soquete ${escuta.fd}, que escuta na porta ${portaDestino} (${escuta.servico})` };
  return { como: 'nenhum', texto: `${proto.toUpperCase()} ${ipOrigem}:${portaOrigem} → ${ipDestino}:${portaDestino}: nenhum soquete nesta porta. ${proto === 'tcp' ? 'Resposta: RST.' : 'Resposta: ICMP tipo 3 código 3, porta inalcançável.'}` };
}

/* ---------- O caminho entre dois hosts ---------- */

export interface CaminhoMundo {
  ok: boolean;
  falha?: string;
  servidor?: Equipamento;
  ipLocal: string;
  ipDestino: string;
  /** Endereço e porta de origem como o servidor vê (depois do NAT, se houver). */
  ipVisto: string;
  portaVista: number;
  portaLocal: number;
  /** Propagação mais processamento de um sentido, em segundos. */
  ida: number;
  volta: number;
  rtt: number;
  bandaBps: number;
  gargalo: { de: string; porta: string; mbps: number };
  buffer: number;
  /** Probabilidade de perder um segmento cheio (1500 bytes) pelos erros de bit do caminho. */
  perda: number;
  nat: string[];
  roteadores: string[];
  /** Equipamentos por onde a ida e a volta passaram (quem pode ter ouvido), os que só viram ESP e os que interceptaram por ARP falso. */
  nos?: string[];
  nosTunel?: string[];
  interceptadoPor?: string[];
  /** Quem descartou no firewall ou no IPS (quando falhou) e os alertas de IDS pelo caminho. */
  bloqueadoPor?: string;
  alertas?: string[];
  /** Eventos de túnel (VPN) e de ARP falso, para mostrar. */
  eventosSeguranca?: string[];
}

function viagemTransporte(m: Mundo, de: Equipamento, origem: number, destino: number, proto: Protocolo, porta: number, dados: number, l4?: { origem: number; destino: number; flags?: string }): Viagem {
  const p = novoPacote(m, { origem, destino, ttl: de.ttl, dados, icmp: { tipo: 0, codigo: 0, id: porta, seq: 0 } });
  p.protocolo = proto === 'tcp' ? 6 : 17;
  if (l4) p.l4 = { ...l4, flags: proto === 'tcp' ? l4.flags : undefined };
  // O "id" carrega a porta que o NAT olha: a de origem na ida, a de destino na volta.
  p.tamanho = 20 + (proto === 'tcp' ? 20 : 8) + dados;
  p.fragmentos = [{ identificacao: p.identificacao, deslocamento: 0, dados: p.tamanho - 20, mf: false }];
  return viajar(m, de.nome, p);
}

function falhaViagem(v: Viagem): string {
  if (v.icmpErro) return `${v.icmpErro.nome} devolveu ICMP tipo ${v.icmpErro.tipo} código ${v.icmpErro.codigo}${v.falha ? '' : ''}. O segmento não chegou.`;
  if (v.perdido) return `segmento perdido no caminho (erro de bit em ${v.onde}).`;
  return v.falha ?? `o segmento parou em ${v.onde}.`;
}

/**
 * Manda um segmento de verdade (roteadores, ARP, NAT) até o IP e a resposta de volta, e daí tira o que a
 * transferência precisa: atraso de cada sentido, banda e buffer do trecho mais lento, perda pelos erros de bit.
 */
export function caminhoTransporte(m: Mundo, origemNome: string, ipDestinoN: number, proto: Protocolo, portaLocal: number, portaDestino: number): CaminhoMundo {
  const de = m.equipamentos.get(origemNome)!;
  const ipLocal = ipPrincipal(de) ?? '0.0.0.0';
  const base: CaminhoMundo = { ok: false, ipLocal, ipDestino: ipTexto(ipDestinoN), ipVisto: ipLocal, portaVista: portaLocal, portaLocal, ida: 0, volta: 0, rtt: 0, bandaBps: 0, gargalo: { de: '', porta: '', mbps: 0 }, buffer: BUFFER_PADRAO, perda: 0, nat: [], roteadores: [] };
  if (!interfacesL3(de).length) return { ...base, falha: 'Sem endereço IP. Eu sou só uma placa de rede com sonhos.' };
  const origem = interfacesL3(de)[0]!.cidr.endereco;
  let ida: Viagem | null = null;
  for (let k = 0; k < 5; k++) {
    ida = viagemTransporte(m, de, origem, ipDestinoN, proto, portaLocal, 0, { origem: portaLocal, destino: portaDestino, flags: 'SYN' });
    if (!ida.perdido) break;
  }
  const seg = (v: Viagem | null) => (v ? { bloqueadoPor: v.bloqueadoPor, alertas: v.alertas, interceptadoPor: v.interceptadoPor, nos: v.nos, eventosSeguranca: v.eventos.filter((x) => x.includes('VPN') || x.includes('ARP envenenado') || x.includes('homem no meio') || x.includes('firewall') || x.includes('antifalsificação')) } : {});
  if (!ida || !ida.entregue) return { ...base, ...seg(ida), falha: falhaViagem(ida!) };
  const servidor = m.equipamentos.get(ida.onde)!;
  const ipVisto = ipTexto(ida.pacote.origem);
  const portaVista = ida.pacote.icmp.id;
  let volta: Viagem | null = null;
  for (let k = 0; k < 5; k++) {
    volta = viagemTransporte(m, servidor, ipDestinoN, ida.pacote.origem, proto, portaVista, 0, { origem: portaDestino, destino: portaVista, flags: 'SYN+ACK' });
    if (!volta.perdido) break;
  }
  if (!volta || !volta.entregue || volta.onde !== de.nome) {
    const s = seg(volta);
    return { ...base, ...s, alertas: [...(ida.alertas ?? []), ...(s.alertas ?? [])], servidor, ipVisto, portaVista, falha: `o segmento chegou em ${servidor.nome}, mas a resposta não voltou: ${volta ? falhaViagem(volta) : 'sem rota'}` };
  }
  const sentido = (v: Viagem) => (v.trechos ?? []).reduce((t, x) => t + x.atrasoS, 0) + v.roteadores.length * 5e-5;
  const trechos = ida.trechos ?? [];
  const pior = trechos.reduce((a, b) => (b.mbps < a.mbps ? b : a), trechos[0] ?? { de: de.nome, porta: de.portas[0]?.nome ?? '', mbps: 1000, atrasoS: 0, ber: 0 });
  const eq = m.equipamentos.get(pior.de);
  const fila = eq ? filasDe(eq)[pior.porta] : undefined;
  const mbps = fila?.capacidade ?? pior.mbps;
  const ber = trechos.reduce((t, x) => t + x.ber, 0);
  const perda = 1 - Math.exp(-ber * 1500 * 8);
  const extra = (de.s.caminhoTransporte as { buffer?: number; atraso?: number } | undefined) ?? {};
  // Atraso extra de cada sentido, como um emulador de rede no caminho ("tcp atraso <ms>").
  const ex = extra.atraso ?? 0;
  return {
    ok: true,
    servidor,
    ipLocal,
    ipDestino: ipTexto(ipDestinoN),
    ipVisto,
    portaVista,
    portaLocal,
    ida: sentido(ida) + ex,
    volta: sentido(volta) + ex,
    rtt: sentido(ida) + sentido(volta) + 2 * ex,
    bandaBps: mbps * 1e6,
    gargalo: { de: pior.de, porta: pior.porta, mbps },
    buffer: extra.buffer ?? fila?.buffer ?? BUFFER_PADRAO,
    // erro de bit de cobre bom (1e-13) dá perda desprezível: conta como zero
    perda: perda < 1e-6 ? 0 : perda,
    nat: [...ida.eventos, ...volta.eventos].filter((x) => x.includes('NAT')),
    roteadores: ida.roteadores.map((r) => r.nome),
    nos: [...new Set([...(ida.nos ?? []), ...(volta.nos ?? [])])],
    nosTunel: [...new Set([...(ida.nosTunel ?? []), ...(volta.nosTunel ?? [])])],
    interceptadoPor: [...new Set([...(ida.interceptadoPor ?? []), ...(volta.interceptadoPor ?? [])])],
    alertas: [...(ida.alertas ?? []), ...(volta.alertas ?? [])],
    eventosSeguranca: [...(seg(ida).eventosSeguranca ?? []), ...(seg(volta).eventosSeguranca ?? [])],
  };
}

/** O gargalo do caminho no formato do motor do TCP, com a perda extra configurada no host ("tcp perda"). */
export function gargaloDo(c: CaminhoMundo, e: Equipamento): Gargalo {
  const extra = (e.s.caminhoTransporte as { perda?: number } | undefined) ?? {};
  const p = 1 - (1 - c.perda) * (1 - (extra.perda ?? 0));
  return { banda: c.bandaBps, atraso: c.ida, atrasoVolta: c.volta, buffer: c.buffer, perda: p > 0 ? p : undefined };
}

/* ---------- Conexão no mundo ---------- */

export interface Conexao {
  servidor: string;
  ipServidor: string;
  porta: number;
  portaLocal: number;
  ipLocal: string;
  ipVisto: string;
  portaVista: number;
  isnCliente: number;
  isnServidor: number;
  rtt: number;
  fdCliente: number;
  fdServidor: number;
}

/** Estado de um servidor sob inundação de SYN (ato 7): a fila de meio abertas cheia derruba quem chega de verdade. */
export interface InundacaoSyn {
  ativa: boolean;
  /** SYN por segundo que chegam. */
  taxa: number;
  meiasAbertas: number;
  backlog: number;
  origem: string;
  falsificada: boolean;
}

export interface ResultadoConectar {
  resultado: 'aberta' | 'recusada' | 'sem resposta';
  linhas: string[];
  caminho: CaminhoMundo;
  conexao?: ResultadoConexao;
}

function isn(m: Mundo): number {
  return Math.floor(m.rng() * 2 ** 32) >>> 0;
}

/** connect: SYN, SYN+ACK, ACK, com os estados dos dois lados, pelo caminho real. Recusa com RST se ninguém escuta. */
export function conectar(m: Mundo, e: Equipamento, ipN: number, porta: number): ResultadoConectar {
  const ip = ipTexto(ipN);
  const portaLocal = portaEfemera(e, 'tcp');
  const fd = proxFd(e);
  const linhas = [primitiva(m, e, `socket(SOCK_STREAM) devolve o descritor ${fd}`), primitiva(m, e, `connect(${fd}, ${ip}:${porta}): o sistema escolhe a porta efêmera ${portaLocal} (bind implícito) e manda SYN`)];
  const c = caminhoTransporte(m, e.nome, ipN, 'tcp', portaLocal, porta);
  const registro = (resultado: ResultadoConectar['resultado'], extra: Record<string, unknown> = {}) => {
    m.flags.conexao = { de: e.nome, ip, porta, resultado, portaLocal, ipVisto: c.ipVisto, portaVista: c.portaVista, rttMs: Number((c.rtt * 1000).toFixed(4)), nat: c.nat.length > 0, ...extra };
  };
  if (!c.ok) {
    linhas.push(`SYN para ${ip}:${porta}: ${c.falha}`, 'O cliente fica em SYN_SENT, reenvia o SYN depois de 1 s, 2 s, 4 s... e desiste: "tempo esgotado na conexão". Diferente de RST: aqui ninguém respondeu nada.');
    registro('sem resposta', { falha: c.falha });
    return { resultado: 'sem resposta', linhas, caminho: c };
  }
  const srv = c.servidor!;
  const d = demultiplexar(srv, 'tcp', ip, porta, c.ipVisto, c.portaVista);
  m.flags.soquetes = { ...estadoSoquetes(m), demux: { equip: srv.nome, como: d.como, proto: 'tcp', porta, origem: `${c.ipVisto}:${c.portaVista}` } };
  for (const n of c.nat) linhas.push(n);
  linhas.push(`${srv.nome} demultiplexa: ${d.texto}`);
  const inund = srv.s.inundacaoSyn as InundacaoSyn | undefined;
  if (inund?.ativa && d.como === 'escuta') {
    if (srv.s.synCookies) linhas.push(`${srv.nome} está sob inundação de SYN, mas responde com SYN cookie: o número de sequência inicial leva o estado da conexão, e nada fica guardado na fila até o ACK voltar.`);
    else if (inund.meiasAbertas >= inund.backlog) {
      linhas.push(`${srv.nome} recebeu o SYN, mas a fila de conexões meio abertas está cheia (${inund.meiasAbertas} de ${inund.backlog}, todas de SYN que nunca vão completar). O SYN é descartado em silêncio.`, 'O cliente reenvia depois de 1 s, 2 s, 4 s... e desiste: negação de serviço sem derrubar nada, só ocupando a fila.');
      registro('sem resposta', { falha: 'fila de SYN cheia' });
      return { resultado: 'sem resposta', linhas, caminho: c };
    }
  }
  const cfg = configTcp(e);
  const iC = isn(m);
  const iS = isn(m);
  const r = simularConexao({ ida: c.ida, volta: c.volta, escutando: d.como === 'escuta', isnCliente: iC, isnServidor: iS, fechamento: 'nenhum', mss: cfg.mss, escala: cfg.escala || undefined, janela: Math.min(65535, cfg.janela) });
  linhas.push(...r.linhas.filter((l) => !l.includes('servidor: socket')));
  if (!r.aberta) {
    linhas.push(primitiva(m, e, `connect(${fd}) falha: conexão recusada (RST)`));
    registro('recusada', { estadosCliente: r.estadosCliente, estadosServidor: r.estadosServidor });
    return { resultado: 'recusada', linhas, caminho: c, conexao: r };
  }
  const fdS = proxFd(srv);
  soquetesDe(e).push({ proto: 'tcp', ipLocal: c.ipLocal, portaLocal, ipRemoto: ip, portaRemota: porta, estado: 'ESTABLISHED', fd });
  soquetesDe(srv).push({ proto: 'tcp', ipLocal: ip, portaLocal: porta, ipRemoto: c.ipVisto, portaRemota: c.portaVista, estado: 'ESTABLISHED', servico: d.soquete?.servico, fd: fdS });
  linhas.push(primitiva(m, srv, `accept(${d.soquete!.fd}) devolve o descritor novo ${fdS} para ${c.ipVisto}:${c.portaVista}; o ${d.soquete!.fd} continua em LISTEN, esperando o próximo`), primitiva(m, e, `connect(${fd}) volta com sucesso depois de 1 RTT (${(c.rtt * 1000).toFixed(3)} ms)`));
  if (c.ipVisto !== c.ipLocal || c.portaVista !== portaLocal) linhas.push(`Do lado de lá, a conexão é ${c.ipVisto}:${c.portaVista} → ${ip}:${porta}: o NAT trocou o IP e a porta de origem. Para o servidor, ${e.nome} nem existe.`);
  const cx: Conexao = { servidor: srv.nome, ipServidor: ip, porta, portaLocal, ipLocal: c.ipLocal, ipVisto: c.ipVisto, portaVista: c.portaVista, isnCliente: iC, isnServidor: iS, rtt: c.rtt, fdCliente: fd, fdServidor: fdS };
  e.s.conexao = cx;
  e.s.ultimoSyn = r.segmentos[0]?.seg;
  registro('aberta', { estadosCliente: r.estadosCliente, estadosServidor: r.estadosServidor, isnCliente: iC, isnServidor: iS });
  return { resultado: 'aberta', linhas, caminho: c, conexao: r };
}

/** close: encerramento com FIN de cada lado, TIME_WAIT de quem fechou primeiro (ou dos dois, se simultâneo). */
export function fecharConexao(m: Mundo, e: Equipamento, modo: 'cliente' | 'servidor' | 'simultaneo' = 'cliente'): string[] {
  const cx = e.s.conexao as Conexao | undefined;
  if (!cx) return ['Nenhuma conexão aberta. Use "conectar <ip> <porta>".'];
  const srv = m.equipamentos.get(cx.servidor);
  const r = simularConexao({ ida: cx.rtt / 2, volta: cx.rtt / 2, escutando: true, isnCliente: cx.isnCliente, isnServidor: cx.isnServidor, fechamento: modo, jaAberta: true, dados: (e.s.enviados as number | undefined) ?? 0 });
  const linhas = [primitiva(m, e, modo === 'servidor' ? `(o servidor fecha primeiro; quando o FIN chegar, a aplicação daqui chama close(${cx.fdCliente}))` : `close(${cx.fdCliente})${modo === 'simultaneo' ? ' (e o servidor também, ao mesmo tempo)' : ''}`), ...r.linhas];
  const lista = soquetesDe(e);
  const meu = lista.find((s) => s.fd === cx.fdCliente);
  const fimC = r.estadosCliente.includes('TIME_WAIT') ? 'TIME_WAIT' : 'CLOSED';
  if (meu) {
    if (fimC === 'TIME_WAIT') meu.estado = 'TIME_WAIT';
    else lista.splice(lista.indexOf(meu), 1);
  }
  if (srv) {
    const ls = soquetesDe(srv);
    const dele = ls.find((s) => s.fd === cx.fdServidor);
    const fimS = r.estadosServidor.includes('TIME_WAIT') ? 'TIME_WAIT' : 'CLOSED';
    if (dele) {
      if (fimS === 'TIME_WAIT') dele.estado = 'TIME_WAIT';
      else ls.splice(ls.indexOf(dele), 1);
    }
  }
  delete e.s.conexao;
  delete e.s.enviados;
  m.flags.conexao = { ...(m.flags.conexao ?? {}), fechamento: { modo, estadosCliente: r.estadosCliente.slice(r.estadosCliente.indexOf('ESTABLISHED')), estadosServidor: r.estadosServidor.slice(r.estadosServidor.indexOf('ESTABLISHED')), passos: r.passos.length } };
  linhas.push(fimC === 'TIME_WAIT' ? `O soquete de ${e.nome} fica em TIME_WAIT por 2 MSL: a porta ${cx.portaLocal} não volta a ser usada para ${cx.ipServidor}:${cx.porta} até lá.` : `${e.nome} terminou em CLOSED; quem fechou primeiro foi o outro lado, e é ele quem espera no TIME_WAIT.`);
  return linhas;
}
