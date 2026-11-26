// Camada de transporte (ato 5), parte pura do TCP: cabeçalho com checksum de verdade, máquina de estados,
// aperto de mão e encerramento evento a evento, e a transferência confiável num gargalo compartilhado:
// segmentação por MSS, ACK acumulativo, ACK atrasado, janela do receptor (com janela zero, sonda e janela boba),
// RTO de Jacobson e Karels com o algoritmo de Karn, retransmissão por tempo e rápida, e o controle de
// congestionamento Reno, CUBIC e BBR. Nada aqui conhece o mundo do jogo: entra configuração, sai número.

import { Simulador, SimuladorHeap } from './eventos';
import { rngSemente } from './util';

/* ---------- Cabeçalho e checksum ---------- */

export const CABECALHO_TCP = 20;
export const CABECALHO_UDP = 8;
/** IPv4 + TCP sem opções: o que cada segmento carrega a mais no fio (fora o Ethernet). */
export const SOBRA_TCP_IP = 40;

export interface FlagsTcp {
  urg?: boolean;
  ack?: boolean;
  psh?: boolean;
  rst?: boolean;
  syn?: boolean;
  fin?: boolean;
}

export interface OpcoesTcp {
  mss?: number;
  /** Deslocamento da escala de janela (RFC 7323), de 0 a 14. Só vale no SYN. */
  escala?: number;
  sackOk?: boolean;
  /** Marca de tempo (RFC 7323): serve para medir RTT e para o PAWS. */
  marcaTempo?: [number, number];
}

export interface SegmentoTcp {
  portaOrigem: number;
  portaDestino: number;
  seq: number;
  ack: number;
  flags: FlagsTcp;
  janela: number;
  urgente?: number;
  opcoes?: OpcoesTcp;
  /** Bytes de dados (o conteúdo é zero; só o tamanho importa aqui). */
  dados?: number;
}

export interface CabecalhoMontado {
  bytes: number[];
  /** Tamanho do cabeçalho em bytes (o campo "tamanho do cabeçalho" vezes 4). */
  tamanho: number;
  checksum: number;
}

function soma16(bytes: number[], inicial = 0): number {
  let s = inicial;
  for (let i = 0; i < bytes.length; i += 2) s += ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
  while (s > 0xffff) s = (s & 0xffff) + (s >>> 16);
  return s;
}

/** Pseudo-cabeçalho do IPv4: origem, destino, zero, protocolo e tamanho do segmento. O checksum protege isso também. */
function pseudo(ipOrigem: number, ipDestino: number, protocolo: number, tamanho: number): number[] {
  const b = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return [...b(ipOrigem), ...b(ipDestino), 0, protocolo, (tamanho >> 8) & 255, tamanho & 255];
}

/** Checksum da Internet (complemento de um da soma de palavras de 16 bits) sobre pseudo-cabeçalho, cabeçalho e dados. */
export function checksumTransporte(ipOrigem: number, ipDestino: number, protocolo: number, segmento: number[], dados = 0): number {
  const total = segmento.length + dados;
  const s = soma16(segmento, soma16(pseudo(ipOrigem, ipDestino, protocolo, total)));
  return ~s & 0xffff;
}

export function bitsFlags(f: FlagsTcp): number {
  return (f.urg ? 32 : 0) | (f.ack ? 16 : 0) | (f.psh ? 8 : 0) | (f.rst ? 4 : 0) | (f.syn ? 2 : 0) | (f.fin ? 1 : 0);
}

export function textoFlags(f: FlagsTcp): string {
  const l = (['syn', 'fin', 'rst', 'psh', 'urg', 'ack'] as const).filter((k) => f[k]).map((k) => k.toUpperCase());
  return l.length ? l.join('+') : '(nenhuma)';
}

/** Monta o cabeçalho TCP em bytes, com opções (MSS, escala, SACK, marca de tempo) e o checksum calculado. */
export function montarCabecalhoTcp(s: SegmentoTcp, ipOrigem: number, ipDestino: number): CabecalhoMontado {
  const op: number[] = [];
  const o = s.opcoes ?? {};
  if (o.mss !== undefined) op.push(2, 4, (o.mss >> 8) & 255, o.mss & 255);
  if (o.sackOk) op.push(4, 2);
  if (o.marcaTempo) {
    const b = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    op.push(8, 10, ...b(o.marcaTempo[0]), ...b(o.marcaTempo[1]));
  }
  if (o.escala !== undefined) op.push(1, 3, 3, o.escala);
  while (op.length % 4) op.push(0);
  const tamanho = CABECALHO_TCP + op.length;
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const bytes = [
    (s.portaOrigem >> 8) & 255,
    s.portaOrigem & 255,
    (s.portaDestino >> 8) & 255,
    s.portaDestino & 255,
    ...u32(s.seq >>> 0),
    ...u32(s.ack >>> 0),
    (tamanho / 4) << 4,
    bitsFlags(s.flags),
    (s.janela >> 8) & 255,
    s.janela & 255,
    0,
    0,
    ((s.urgente ?? 0) >> 8) & 255,
    (s.urgente ?? 0) & 255,
    ...op,
  ];
  const checksum = checksumTransporte(ipOrigem, ipDestino, 6, bytes, s.dados ?? 0);
  bytes[16] = checksum >> 8;
  bytes[17] = checksum & 255;
  return { bytes, tamanho, checksum };
}

/** Recalcula sobre o cabeçalho com o checksum dentro: dá zero quando nada mudou no caminho. */
export function checksumConfere(bytes: number[], ipOrigem: number, ipDestino: number, protocolo: number, dados = 0): boolean {
  return checksumTransporte(ipOrigem, ipDestino, protocolo, bytes, dados) === 0;
}

export interface DatagramaUdp {
  portaOrigem: number;
  portaDestino: number;
  dados: number;
}

/** Cabeçalho UDP: 8 bytes, portas, tamanho (cabeçalho mais dados) e checksum. Mais nada. */
export function montarCabecalhoUdp(d: DatagramaUdp, ipOrigem: number, ipDestino: number): CabecalhoMontado & { tamanhoTotal: number } {
  const tamanhoTotal = CABECALHO_UDP + d.dados;
  const bytes = [(d.portaOrigem >> 8) & 255, d.portaOrigem & 255, (d.portaDestino >> 8) & 255, d.portaDestino & 255, (tamanhoTotal >> 8) & 255, tamanhoTotal & 255, 0, 0];
  let checksum = checksumTransporte(ipOrigem, ipDestino, 17, bytes, d.dados);
  if (checksum === 0) checksum = 0xffff; // no UDP, zero quer dizer "sem checksum"
  bytes[6] = checksum >> 8;
  bytes[7] = checksum & 255;
  return { bytes, tamanho: CABECALHO_UDP, checksum, tamanhoTotal };
}

export function hexa(bytes: number[]): string {
  const l: string[] = [];
  for (let i = 0; i < bytes.length; i += 4) l.push(bytes.slice(i, i + 4).map((b) => b.toString(16).padStart(2, '0')).join(' '));
  return l.join('  ');
}

/* ---------- Máquina de estados ---------- */

export type EstadoTcp = 'CLOSED' | 'LISTEN' | 'SYN_SENT' | 'SYN_RCVD' | 'ESTABLISHED' | 'FIN_WAIT_1' | 'FIN_WAIT_2' | 'CLOSE_WAIT' | 'LAST_ACK' | 'CLOSING' | 'TIME_WAIT';
export type EventoTcp = 'listen' | 'connect' | 'close' | 'syn' | 'syn+ack' | 'ack' | 'fin' | 'fin+ack' | 'rst' | 'timeout';

export interface Transicao {
  de: EstadoTcp;
  evento: EventoTcp;
  para: EstadoTcp;
  /** O que o lado manda na transição. */
  envia?: string;
  descricao: string;
}

export const TRANSICOES: Transicao[] = [
  { de: 'CLOSED', evento: 'listen', para: 'LISTEN', descricao: 'abertura passiva: o servidor chama listen e espera' },
  { de: 'CLOSED', evento: 'connect', para: 'SYN_SENT', envia: 'SYN', descricao: 'abertura ativa: o cliente chama connect' },
  { de: 'LISTEN', evento: 'syn', para: 'SYN_RCVD', envia: 'SYN+ACK', descricao: 'chegou um SYN: responde com SYN+ACK' },
  { de: 'LISTEN', evento: 'close', para: 'CLOSED', descricao: 'o servidor desiste de escutar' },
  { de: 'SYN_SENT', evento: 'syn+ack', para: 'ESTABLISHED', envia: 'ACK', descricao: 'chegou o SYN+ACK: confirma e a conexão está aberta' },
  { de: 'SYN_SENT', evento: 'syn', para: 'SYN_RCVD', envia: 'SYN+ACK', descricao: 'abertura simultânea: os dois mandaram SYN' },
  { de: 'SYN_SENT', evento: 'rst', para: 'CLOSED', descricao: 'RST: ninguém escuta nessa porta (conexão recusada)' },
  { de: 'SYN_SENT', evento: 'close', para: 'CLOSED', descricao: 'desistiu antes de abrir' },
  { de: 'SYN_RCVD', evento: 'ack', para: 'ESTABLISHED', descricao: 'chegou o ACK do SYN+ACK: accept devolve a conexão' },
  { de: 'SYN_RCVD', evento: 'close', para: 'FIN_WAIT_1', envia: 'FIN', descricao: 'fechou antes de terminar a abertura' },
  { de: 'SYN_RCVD', evento: 'rst', para: 'LISTEN', descricao: 'RST: volta a escutar' },
  { de: 'ESTABLISHED', evento: 'close', para: 'FIN_WAIT_1', envia: 'FIN', descricao: 'encerramento ativo: a aplicação chama close' },
  { de: 'ESTABLISHED', evento: 'fin', para: 'CLOSE_WAIT', envia: 'ACK', descricao: 'o outro lado fechou: confirma e avisa a aplicação' },
  { de: 'ESTABLISHED', evento: 'rst', para: 'CLOSED', descricao: 'RST: conexão abortada' },
  { de: 'FIN_WAIT_1', evento: 'ack', para: 'FIN_WAIT_2', descricao: 'o FIN foi confirmado; falta o outro lado fechar' },
  { de: 'FIN_WAIT_1', evento: 'fin', para: 'CLOSING', envia: 'ACK', descricao: 'fechamento simultâneo: chegou FIN antes do ACK do meu FIN' },
  { de: 'FIN_WAIT_1', evento: 'fin+ack', para: 'TIME_WAIT', envia: 'ACK', descricao: 'FIN e ACK juntos: confirma e espera' },
  { de: 'FIN_WAIT_2', evento: 'fin', para: 'TIME_WAIT', envia: 'ACK', descricao: 'chegou o FIN do outro lado: confirma e espera 2 MSL' },
  { de: 'CLOSING', evento: 'ack', para: 'TIME_WAIT', descricao: 'o FIN foi confirmado: espera 2 MSL' },
  { de: 'CLOSE_WAIT', evento: 'close', para: 'LAST_ACK', envia: 'FIN', descricao: 'a aplicação também fecha' },
  { de: 'LAST_ACK', evento: 'ack', para: 'CLOSED', descricao: 'o último FIN foi confirmado: acabou' },
  { de: 'TIME_WAIT', evento: 'timeout', para: 'CLOSED', descricao: 'passaram 2 MSL: nenhum segmento velho desta conexão anda mais pela rede' },
];

export function transitar(estado: EstadoTcp, evento: EventoTcp): Transicao | null {
  return TRANSICOES.find((t) => t.de === estado && t.evento === evento) ?? null;
}

export interface PassoConexao {
  t: number;
  quem: 'cliente' | 'servidor';
  /** Segmento que chegou ou que saiu. */
  segmento?: string;
  de: EstadoTcp;
  para: EstadoTcp;
  descricao: string;
}

export interface OpcoesConexao {
  /** Atraso de um sentido, cliente para servidor, em segundos. */
  ida: number;
  volta?: number;
  escutando: boolean;
  isnCliente?: number;
  isnServidor?: number;
  /** Quem fecha: o cliente (encerramento ativo), o servidor, os dois ao mesmo tempo ou ninguém. */
  fechamento?: 'cliente' | 'servidor' | 'simultaneo' | 'nenhum';
  /** Quanto a aplicação que recebeu o FIN demora para fechar também (padrão 1 ms). */
  atrasoAplicacao?: number;
  /** MSL em segundos (padrão 60; o TIME_WAIT dura 2 MSL). */
  msl?: number;
  /** Quantas vezes o SYN se perde antes de passar (cada perda espera o RTO, que dobra). */
  synPerdidos?: number;
  /** Bytes de dados que o cliente manda antes de fechar (só para a numeração). */
  dados?: number;
  mss?: number;
  janela?: number;
  escala?: number;
  /** Começa com a conexão já aberta (os dois em ESTABLISHED) e só encerra. */
  jaAberta?: boolean;
}

export interface ResultadoConexao {
  aberta: boolean;
  recusada: boolean;
  passos: PassoConexao[];
  estadosCliente: EstadoTcp[];
  estadosServidor: EstadoTcp[];
  /** Instante em que o cliente pode mandar dados (ESTABLISHED do lado do cliente). */
  tAberta?: number;
  tFechada?: number;
  segmentos: { t: number; de: 'cliente' | 'servidor'; texto: string; seg: SegmentoTcp }[];
  linhas: string[];
}

/** Aperto de mão em três vias e encerramento, evento a evento, levando cada lado pela máquina de estados. */
export function simularConexao(o: OpcoesConexao): ResultadoConexao {
  const sim = new Simulador();
  const ida = o.ida;
  const volta = o.volta ?? o.ida;
  const isnC = (o.isnCliente ?? 1000) >>> 0;
  const isnS = (o.isnServidor ?? 5000) >>> 0;
  const msl = o.msl ?? 60;
  const app = o.atrasoAplicacao ?? 0.001;
  const r: ResultadoConexao = { aberta: false, recusada: false, passos: [], estadosCliente: ['CLOSED'], estadosServidor: ['CLOSED'], segmentos: [], linhas: [] };
  const est = { cliente: 'CLOSED' as EstadoTcp, servidor: 'CLOSED' as EstadoTcp };
  const seq = { cliente: isnC, servidor: isnS };
  const ack = { cliente: 0, servidor: 0 };
  const portas = { cliente: 49152, servidor: 80 };
  const ir = (quem: 'cliente' | 'servidor', ev: EventoTcp, segmento?: string): Transicao | null => {
    const t = transitar(est[quem], ev);
    if (!t) return null;
    r.passos.push({ t: sim.agora, quem, segmento, de: t.de, para: t.para, descricao: t.descricao });
    est[quem] = t.para;
    (quem === 'cliente' ? r.estadosCliente : r.estadosServidor).push(t.para);
    return t;
  };
  const outro = (q: 'cliente' | 'servidor') => (q === 'cliente' ? 'servidor' : 'cliente');
  const mandar = (de: 'cliente' | 'servidor', flags: FlagsTcp, chegar: (seg: SegmentoTcp) => void, opcoes?: OpcoesTcp, dados = 0) => {
    const seg: SegmentoTcp = { portaOrigem: portas[de], portaDestino: portas[outro(de)], seq: seq[de] >>> 0, ack: flags.ack ? ack[de] >>> 0 : 0, flags, janela: Math.min(65535, o.janela ?? 65535), opcoes, dados };
    const texto = `${textoFlags(flags)} seq=${seg.seq}${flags.ack ? ` ack=${seg.ack}` : ''}${dados ? ` (${dados} bytes)` : ''}${opcoes?.mss ? ` MSS=${opcoes.mss}` : ''}${opcoes?.escala !== undefined ? ` escala=${opcoes.escala}` : ''}`;
    r.segmentos.push({ t: sim.agora, de, texto, seg });
    if (flags.syn || flags.fin) seq[de] += 1;
    seq[de] += dados;
    sim.agendar(de === 'cliente' ? ida : volta, () => chegar(seg));
    return texto;
  };

  const servidorRecebe = (seg: SegmentoTcp) => {
    const f = seg.flags;
    if (f.syn && !f.ack) {
      if (est.servidor !== 'LISTEN') {
        // Ninguém escuta: RST com ACK do SYN, e o cliente desiste na hora.
        ack.servidor = seg.seq + 1;
        r.recusada = true;
        const tx = mandar('servidor', { rst: true, ack: true }, clienteRecebe);
        r.linhas.push(`${ms(sim.agora)}  servidor: ninguém escuta na porta ${portas.servidor}: responde ${tx}`);
        return;
      }
      ack.servidor = seg.seq + 1;
      seq.servidor = isnS;
      ir('servidor', 'syn', 'SYN');
      const tx = mandar('servidor', { syn: true, ack: true }, clienteRecebe, { mss: o.mss ?? 1460, escala: o.escala });
      r.linhas.push(`${ms(sim.agora)}  servidor: LISTEN → SYN_RCVD, responde ${tx}`);
      return;
    }
    if (f.fin) {
      ack.servidor = seg.seq + 1 + (seg.dados ?? 0);
      const ev: EventoTcp = f.ack && est.servidor === 'FIN_WAIT_1' && seg.ack === seq.servidor ? 'fin+ack' : 'fin';
      const antes = est.servidor;
      const t = ir('servidor', ev, 'FIN');
      if (!t) return;
      const tx = mandar('servidor', { ack: true }, clienteRecebe);
      r.linhas.push(`${ms(sim.agora)}  servidor: chegou FIN, ${antes} → ${t.para}, responde ${tx}`);
      if (t.para === 'CLOSE_WAIT') {
        sim.agendar(app, () => {
          ir('servidor', 'close');
          const tx2 = mandar('servidor', { fin: true, ack: true }, clienteRecebe);
          r.linhas.push(`${ms(sim.agora)}  servidor: a aplicação fecha, CLOSE_WAIT → LAST_ACK, manda ${tx2}`);
        });
      }
      if (t.para === 'TIME_WAIT') tempoEspera('servidor');
      return;
    }
    if (f.ack) {
      const antes = est.servidor;
      if (antes === 'SYN_RCVD' || antes === 'LAST_ACK' || antes === 'FIN_WAIT_1' || antes === 'CLOSING') {
        const t = ir('servidor', 'ack', 'ACK');
        if (t) r.linhas.push(`${ms(sim.agora)}  servidor: chegou ACK, ${antes} → ${t.para}${t.para === 'ESTABLISHED' ? ' (accept devolve a conexão)' : ''}`);
        if (t?.para === 'CLOSED') r.tFechada = Math.max(r.tFechada ?? 0, sim.agora);
        if (t?.para === 'TIME_WAIT') tempoEspera('servidor');
      }
    }
  };

  const tempoEspera = (quem: 'cliente' | 'servidor') => {
    r.linhas.push(`${ms(sim.agora)}  ${quem}: TIME_WAIT por 2 MSL = ${2 * msl} s, para algum segmento velho atrasado não ser confundido com uma conexão nova`);
    sim.agendar(2 * msl, () => {
      ir(quem, 'timeout');
      r.linhas.push(`${ms(sim.agora)}  ${quem}: fim do TIME_WAIT, CLOSED`);
      r.tFechada = Math.max(r.tFechada ?? 0, sim.agora);
    });
  };

  const fechar = () => {
    const quem = o.fechamento ?? 'cliente';
    if (quem === 'nenhum') return;
    const lados: ('cliente' | 'servidor')[] = quem === 'simultaneo' ? ['cliente', 'servidor'] : [quem];
    for (const l of lados) {
      ir(l, 'close');
      const tx = mandar(l, { fin: true, ack: true }, l === 'cliente' ? servidorRecebe : clienteRecebe);
      r.linhas.push(`${ms(sim.agora)}  ${l}: close, ESTABLISHED → FIN_WAIT_1, manda ${tx}`);
    }
  };

  const clienteRecebe = (seg: SegmentoTcp) => {
    const f = seg.flags;
    if (f.rst) {
      ir('cliente', 'rst', 'RST');
      r.linhas.push(`${ms(sim.agora)}  cliente: chegou RST, SYN_SENT → CLOSED. "Conexão recusada": a máquina existe, mas nenhum processo escuta nessa porta.`);
      return;
    }
    if (f.syn && f.ack) {
      ack.cliente = seg.seq + 1;
      ir('cliente', 'syn+ack', 'SYN+ACK');
      r.aberta = true;
      r.tAberta = sim.agora;
      const tx = mandar('cliente', { ack: true }, servidorRecebe);
      r.linhas.push(`${ms(sim.agora)}  cliente: SYN_SENT → ESTABLISHED, responde ${tx}. Pode mandar dados.`);
      if (o.dados) {
        const txd = mandar('cliente', { ack: true, psh: true }, servidorRecebe, undefined, o.dados);
        r.linhas.push(`${ms(sim.agora)}  cliente: manda ${txd}`);
      }
      sim.agendar(volta + ida + 0.001, fechar);
      return;
    }
    if (f.fin) {
      ack.cliente = seg.seq + 1;
      const ev: EventoTcp = f.ack && est.cliente === 'FIN_WAIT_1' && seg.ack === seq.cliente ? 'fin+ack' : 'fin';
      const antes = est.cliente;
      const t = ir('cliente', ev, 'FIN');
      if (!t) return;
      const tx = mandar('cliente', { ack: true }, servidorRecebe);
      r.linhas.push(`${ms(sim.agora)}  cliente: chegou FIN, ${antes} → ${t.para}, responde ${tx}`);
      if (t.para === 'TIME_WAIT') tempoEspera('cliente');
      if (t.para === 'CLOSE_WAIT') {
        sim.agendar(app, () => {
          ir('cliente', 'close');
          const tx2 = mandar('cliente', { fin: true, ack: true }, servidorRecebe);
          r.linhas.push(`${ms(sim.agora)}  cliente: a aplicação fecha, CLOSE_WAIT → LAST_ACK, manda ${tx2}`);
        });
      }
      return;
    }
    if (f.ack) {
      const antes = est.cliente;
      if (antes === 'FIN_WAIT_1' || antes === 'CLOSING' || antes === 'LAST_ACK') {
        const t = ir('cliente', 'ack', 'ACK');
        if (t) r.linhas.push(`${ms(sim.agora)}  cliente: chegou ACK do FIN, ${antes} → ${t.para}`);
        if (t?.para === 'TIME_WAIT') tempoEspera('cliente');
        if (t?.para === 'CLOSED') r.tFechada = Math.max(r.tFechada ?? 0, sim.agora);
      }
    }
  };

  if (o.jaAberta) {
    est.cliente = est.servidor = 'ESTABLISHED';
    r.estadosCliente = ['ESTABLISHED'];
    r.estadosServidor = ['ESTABLISHED'];
    seq.cliente = isnC + 1 + (o.dados ?? 0);
    seq.servidor = isnS + 1;
    ack.cliente = isnS + 1;
    ack.servidor = seq.cliente;
    r.aberta = true;
    r.tAberta = 0;
    sim.agendar(0, fechar);
    sim.rodar(10000);
    return r;
  }
  if (o.escutando) {
    ir('servidor', 'listen');
    r.linhas.push(`${ms(0)}  servidor: socket, bind :${portas.servidor}, listen → LISTEN`);
  } else r.linhas.push(`${ms(0)}  servidor: nenhum processo escuta na porta ${portas.servidor}`);
  ir('cliente', 'connect');
  // SYN perdido: o cliente espera o RTO inicial (1 s) e manda de novo, dobrando a espera a cada perda.
  let espera = 0;
  for (let k = 0; k < (o.synPerdidos ?? 0); k++) {
    const t0 = espera;
    sim.agendar(t0, () => {
      r.segmentos.push({ t: sim.agora, de: 'cliente', texto: `SYN seq=${isnC} (perdido)`, seg: { portaOrigem: portas.cliente, portaDestino: portas.servidor, seq: isnC, ack: 0, flags: { syn: true }, janela: 65535 } });
      r.linhas.push(`${ms(sim.agora)}  cliente: SYN seq=${isnC} se perdeu; espera ${2 ** k} s e tenta de novo`);
    });
    espera += 2 ** k;
  }
  sim.agendar(espera, () => {
    seq.cliente = isnC;
    const tx = mandar('cliente', { syn: true }, servidorRecebe, { mss: o.mss ?? 1460, escala: o.escala, sackOk: true });
    r.linhas.push(`${ms(sim.agora)}  cliente: socket, connect → SYN_SENT, manda ${tx}`);
  });
  sim.rodar(10000);
  return r;
}

function ms(s: number): string {
  return `${(s * 1000).toFixed(3).padStart(10)} ms`;
}

/* ---------- RTO: Jacobson e Karels ---------- */

export interface EstimadorRtt {
  srtt?: number;
  rttvar?: number;
  rto: number;
}

export interface PassoRto {
  amostra: number;
  srtt: number;
  rttvar: number;
  rto: number;
}

/**
 * Uma amostra de RTT entra no estimador (RFC 6298): na primeira, SRTT = R e RTTVAR = R/2; depois
 * RTTVAR = 3/4 RTTVAR + 1/4 |SRTT - R| e SRTT = 7/8 SRTT + 1/8 R. RTO = SRTT + 4 RTTVAR, com piso.
 */
export function amostrarRtt(e: EstimadorRtt, r: number, rtoMin = 0.2, rtoMax = 60): EstimadorRtt {
  if (e.srtt === undefined || e.rttvar === undefined) {
    const srtt = r;
    const rttvar = r / 2;
    return { srtt, rttvar, rto: Math.min(rtoMax, Math.max(rtoMin, srtt + 4 * rttvar)) };
  }
  const rttvar = 0.75 * e.rttvar + 0.25 * Math.abs(e.srtt - r);
  const srtt = 0.875 * e.srtt + 0.125 * r;
  return { srtt, rttvar, rto: Math.min(rtoMax, Math.max(rtoMin, srtt + 4 * rttvar)) };
}

/** Passo a passo de uma lista de amostras. */
export function calcularRto(amostras: number[], rtoMin = 0.2): PassoRto[] {
  let e: EstimadorRtt = { rto: 1 };
  return amostras.map((a) => {
    e = amostrarRtt(e, a, rtoMin);
    return { amostra: a, srtt: e.srtt!, rttvar: e.rttvar!, rto: e.rto };
  });
}

/* ---------- Transferência confiável num gargalo ---------- */

export type AlgoritmoCc = 'reno' | 'cubic' | 'bbr';

export interface ConfigTcp {
  /** Maior segmento de dados, em bytes (1460 no Ethernet). */
  mss: number;
  /** Buffer do receptor, em bytes: é o máximo de janela que ele anuncia. */
  janela: number;
  /** Escala de janela: o campo de 16 bits vale janela << escala. 0 = sem escala (máximo 65535). */
  escala: number;
  algoritmo: AlgoritmoCc;
  /** Receptor confirma a cada 2 segmentos ou depois de 200 ms, o que vier primeiro. */
  ackAtrasado: boolean;
  /** Evitar janela boba: receptor (Clark) só anuncia janela nova de pelo menos 1 MSS ou metade do buffer, e o emissor não manda migalha. */
  sws: boolean;
  /** Janela inicial, em segmentos. */
  janelaInicial: number;
  /** Limiar inicial da partida lenta, em bytes (Infinity = sem limite até a primeira perda). */
  limiar: number;
  rtoMin: number;
  rtoInicial: number;
  /** A aplicação que recebe lê "bytes" a cada "intervalo" segundos. Sem isso, lê na hora. */
  leitura?: { bytes: number; intervalo: number };
  /** A aplicação que recebe para de ler neste intervalo [início, fim] em segundos. */
  pausaLeitura?: [number, number];
  /** Algoritmo de Nagle (só faz diferença com escritas pequenas; veja simularNagle). */
  nagle: boolean;
  /** Confirmação seletiva (SACK): o receptor conta os blocos que chegaram fora de ordem e o emissor só retransmite os buracos. */
  sack: boolean;
}

export const TCP_PADRAO: ConfigTcp = {
  mss: 1460,
  janela: 65535,
  escala: 0,
  algoritmo: 'reno',
  ackAtrasado: false,
  sws: true,
  janelaInicial: 1,
  limiar: Infinity,
  rtoMin: 0.2,
  rtoInicial: 1,
  nagle: true,
  sack: true,
};

export interface Gargalo {
  /** Banda do enlace mais lento, em bit/s. */
  banda: number;
  /** Propagação de um sentido (ida), em segundos, somando o caminho inteiro. */
  atraso: number;
  /** Propagação da volta; sem isso, igual à ida. */
  atrasoVolta?: number;
  /** Pacotes que cabem esperando na fila do gargalo. */
  buffer: number;
  /** Probabilidade de perder um segmento de dados depois do gargalo (ruído, sem fio): perda que não é congestionamento. */
  perda?: number;
  /** Probabilidade de perder um ACK na volta. */
  perdaAck?: number;
}

export interface FluxoTcp {
  nome?: string;
  /** Bytes a transferir (Infinity = fluxo longo, até acabar a duração). */
  bytes: number;
  /** Quando começa, em segundos. */
  inicio?: number;
  config?: Partial<ConfigTcp>;
  /** Transmissões de dados deste fluxo que se perdem de propósito (contando a partir de 0, retransmissões incluídas). */
  perdas?: number[];
  /** Atraso a mais só deste fluxo (ida e volta somadas), para fluxos com RTT diferente. */
  atrasoExtra?: number;
  /** Número de sequência inicial (só para mostrar). */
  isn?: number;
}

export interface PontoJanela {
  t: number;
  /** Janela de congestionamento, em segmentos. */
  cwnd: number;
  /** Limiar, em segmentos (Infinity antes da primeira perda). */
  limiar: number;
  /** Janela anunciada pelo receptor, em bytes. */
  rwnd: number;
  /** Bytes em voo, em segmentos. */
  emVoo: number;
  fase: string;
}

export interface EventoTransporte {
  t: number;
  fluxo: number;
  tipo: 'timeout' | 'retransmissao-rapida' | 'perda-fila' | 'perda-aleatoria' | 'perda-forcada' | 'janela-zero' | 'sonda' | 'atualizacao-janela' | 'fim-partida-lenta' | 'recuperacao-fim' | 'bbr-fase' | 'concluiu' | 'ack-perdido';
  texto: string;
}

export interface ResultadoFluxo {
  nome: string;
  config: ConfigTcp;
  bytes: number;
  entregues: number;
  concluiu: boolean;
  inicio: number;
  fim?: number;
  /** Duração da transferência (do início até o último byte confirmado), em segundos. */
  duracao: number;
  vazaoMbps: number;
  segmentos: number;
  transmissoes: number;
  retransmissoes: number;
  timeouts: number;
  retransRapidas: number;
  ackDuplicados: number;
  acks: number;
  janelasZero: number;
  sondas: number;
  /** Segmentos de dados menores que o MSS mandados por falta de janela (janela boba). */
  migalhas: number;
  rttAmostras: { t: number; rtt: number; srtt: number; rttvar: number; rto: number }[];
  /** Amostras descartadas pelo algoritmo de Karn (segmento retransmitido: não dá para saber de qual envio veio o ACK). */
  karnDescartadas: number;
  maxRto: number;
  janela: PontoJanela[];
  /** Quando cada segmento (índice de MSS) chegou ao receptor pela primeira vez. */
  chegadas: number[];
  /** Quando cada segmento foi entregue à aplicação, em ordem. */
  entregas: number[];
  /** Bytes entregues à aplicação, amostrados no tempo: [t, bytes]. */
  progresso: [number, number][];
  isn: number;
  estimativaBbr?: { banda: number; rttMin: number };
}

export interface ResultadoTcp {
  fluxos: ResultadoFluxo[];
  eventos: EventoTransporte[];
  linhas: string[];
  duracao: number;
  perdasFila: number;
  perdasAleatorias: number;
  /** Pacotes esperando no gargalo, em média no tempo. */
  filaMedia: number;
  filaMax: number;
  /** Espera média na fila do gargalo, em segundos. */
  atrasoFilaMedio: number;
  utilizacao: number;
  gargalo: Gargalo;
  /** Índice de justiça de Jain sobre a vazão de cada fluxo (1 = divisão perfeita). */
  justica: number;
}

export interface OpcoesTcpSim {
  /** Para tudo neste instante (padrão 120 s). */
  duracao?: number;
  semente?: number;
  /** Intervalo de amostragem do progresso (padrão 0,1 s). */
  amostra?: number;
  maxEventos?: number;
  /** RTT medido no aperto de mão, para iniciar o estimador (padrão: o do caminho vazio). */
  rttInicial?: number;
}

interface Envio {
  s: number;
  e: number;
  t: number;
  retrans: boolean;
  entregues: number;
  tEntregues: number;
  /** Quando saiu o último segmento já confirmado no momento deste envio (para o intervalo de envio do BBR). */
  tEnvioRef: number;
}

interface Pacote {
  fluxo: number;
  s: number;
  e: number;
  sonda: boolean;
  chegadaFila: number;
}

/** Índice de justiça de Jain: (Σx)² / (n Σx²). */
export function indiceJain(x: number[]): number {
  if (!x.length) return 1;
  const s = x.reduce((a, b) => a + b, 0);
  const q = x.reduce((a, b) => a + b * b, 0);
  return q > 0 ? (s * s) / (x.length * q) : 1;
}

const GANHO_BBR = 2 / Math.LN2;
const CICLO_BBR = [1.25, 0.75, 1, 1, 1, 1, 1, 1];
const C_CUBIC = 0.4;
const BETA_CUBIC = 0.7;
const ATRASO_ACK = 0.2;

/**
 * Simula um ou mais fluxos TCP passando pelo mesmo gargalo (fila de descarte no fim, banda e buffer dados),
 * pacote a pacote no simulador de eventos. Cada fluxo tem emissor e receptor completos; os ACKs voltam sem
 * fila. As perdas vêm do buffer cheio (congestionamento), do ruído depois do gargalo (perda) ou das forçadas.
 */
export function simularTcp(fluxosPedidos: FluxoTcp[], g: Gargalo, o: OpcoesTcpSim = {}): ResultadoTcp {
  const sim = new SimuladorHeap();
  const rng = rngSemente(o.semente ?? 1234);
  const duracao = o.duracao ?? 120;
  const amostra = o.amostra ?? 0.1;
  const volta = g.atrasoVolta ?? g.atraso;
  const eventos: EventoTransporte[] = [];
  const linhas: string[] = [];
  const contagem: Partial<Record<EventoTransporte['tipo'], number>> = {};
  const evento = (fluxo: number, tipo: EventoTransporte['tipo'], texto: string, limite = Infinity) => {
    const n = (contagem[tipo] = (contagem[tipo] ?? 0) + 1);
    if (n > limite) return;
    eventos.push({ t: sim.agora, fluxo, tipo, texto });
    if (linhas.length < 80) linhas.push(`${(sim.agora * 1000).toFixed(1).padStart(9)} ms  ${fluxosPedidos.length > 1 ? `[${fluxos[fluxo]!.r.nome}] ` : ''}${texto}`);
  };
  const tx = (bytes: number) => ((bytes + SOBRA_TCP_IP) * 8) / g.banda;
  const rttVazio = g.atraso + volta + tx(1460) + tx(0);

  // Gargalo: fila de descarte no fim.
  const fila: Pacote[] = [];
  let ocupado = false;
  let perdasFila = 0;
  let perdasAleatorias = 0;
  let filaMax = 0;
  let areaFila = 0;
  let ultimoFila = 0;
  let somaEspera = 0;
  let nEspera = 0;
  let tempoOcupado = 0;
  const marcarFila = () => {
    areaFila += fila.length * (sim.agora - ultimoFila);
    ultimoFila = sim.agora;
  };

  const fluxos = fluxosPedidos.map((fp, i) => {
    const c: ConfigTcp = { ...TCP_PADRAO, ...(fp.config ?? {}) };
    const mss = c.mss;
    const r: ResultadoFluxo = {
      nome: fp.nome ?? `fluxo ${i + 1}`,
      config: c,
      bytes: fp.bytes,
      entregues: 0,
      concluiu: false,
      inicio: fp.inicio ?? 0,
      duracao: 0,
      vazaoMbps: 0,
      segmentos: 0,
      transmissoes: 0,
      retransmissoes: 0,
      timeouts: 0,
      retransRapidas: 0,
      ackDuplicados: 0,
      acks: 0,
      janelasZero: 0,
      sondas: 0,
      migalhas: 0,
      rttAmostras: [],
      karnDescartadas: 0,
      maxRto: 0,
      janela: [],
      chegadas: [],
      entregas: [],
      progresso: [],
      isn: fp.isn ?? 1000 + i * 7919,
    };
    const rtt0 = o.rttInicial ?? rttVazio + (fp.atrasoExtra ?? 0);
    return {
      fp,
      c,
      r,
      mss,
      total: fp.bytes,
      extra: fp.atrasoExtra ?? 0,
      // emissor
      una: 0,
      nxt: 0,
      max: 0,
      cwnd: c.algoritmo === 'bbr' ? Math.max(4, c.janelaInicial) * mss : c.janelaInicial * mss,
      ssthresh: c.limiar,
      dup: 0,
      recuperando: false,
      recover: 0,
      rwnd: Math.min(c.janela, 65535 << c.escala),
      rwndMax: Math.min(c.janela, 65535 << c.escala),
      est: { rto: c.rtoInicial } as EstimadorRtt,
      backoff: 1,
      geracao: 0,
      timerArmado: false,
      persist: 0,
      persistArmado: false,
      envios: [] as Envio[],
      porInicio: new Map<number, Envio>(),
      ptr: 0,
      txIdx: 0,
      perdasForcadas: new Set(fp.perdas ?? []),
      // CUBIC
      wMax: 0,
      wUltimoMax: 0,
      epoca: -1,
      k: 0,
      origem: 0,
      // BBR
      creditoDup: 0,
      sacados: [] as [number, number][],
      ultimoRecebido: -1,
      proxBuraco: 0,
      tEnvioUltimo: 0,
      bbr: { fase: 'STARTUP' as 'STARTUP' | 'DRAIN' | 'PROBE_BW' | 'PROBE_RTT', banda: (c.janelaInicial * mss * 8) / rtt0, amostras: [] as { rodada: number; banda: number }[], rttMin: rtt0, rttMinEm: 0, entregues: 0, tEntregues: 0, rodada: 0, proxRodada: 0, cheio: false, bandaCheia: 0, contaCheia: 0, ciclo: 0, cicloEm: 0, proxEnvio: 0, acordar: false, probeRttAte: 0, probeRttAntes: 0 },
      // receptor
      rcvNxt: 0,
      foraDeOrdem: [] as [number, number][],
      naoLido: 0,
      anunciada: Math.min(c.janela, 65535 << c.escala),
      ackPendente: 0,
      timerAck: 0,
      leituraAgendada: false,
      // estado
      fim: false,
      rtt0,
    };
  });

  type F = (typeof fluxos)[number];

  const fase = (f: F) => (f.c.algoritmo === 'bbr' ? f.bbr.fase : f.recuperando ? 'recuperação rápida' : f.cwnd < f.ssthresh ? 'partida lenta' : 'prevenção de congestionamento');
  const registrar = (f: F) => {
    const p: PontoJanela = { t: sim.agora, cwnd: f.cwnd / f.mss, limiar: f.ssthresh / f.mss, rwnd: f.rwnd, emVoo: (f.nxt - f.una) / f.mss, fase: fase(f) };
    const u = f.r.janela[f.r.janela.length - 1];
    if (u && u.t === p.t) f.r.janela[f.r.janela.length - 1] = p;
    // só guarda quando algo que interessa mudou: a janela em segmentos inteiros, o limiar, a fase ou a janela do receptor
    else if (!u || Math.floor(u.cwnd) !== Math.floor(p.cwnd) || u.limiar !== p.limiar || u.fase !== p.fase || u.rwnd !== p.rwnd) f.r.janela.push(p);
  };

  /* ----- gargalo ----- */
  const servir = () => {
    if (ocupado || !fila.length) return;
    marcarFila();
    const p = fila.shift()!;
    somaEspera += sim.agora - p.chegadaFila;
    nEspera++;
    ocupado = true;
    const t = tx(p.e - p.s);
    tempoOcupado += t;
    sim.agendar(t, () => {
      ocupado = false;
      const f = fluxos[p.fluxo]!;
      if (g.perda && rng() < g.perda) {
        perdasAleatorias++;
        evento(p.fluxo, 'perda-aleatoria', `segmento ${p.s}:${p.e} perdido por ruído depois do gargalo (não é congestionamento)`, 20);
      } else sim.agendar(g.atraso + f.extra / 2, () => receber(f, p));
      servir();
    });
  };

  const naFila = (p: Pacote) => {
    marcarFila();
    if (fila.length >= g.buffer) {
      perdasFila++;
      evento(p.fluxo, 'perda-fila', `buffer do gargalo cheio (${g.buffer} pacotes): segmento ${p.s}:${p.e} descartado`, 30);
      return;
    }
    p.chegadaFila = sim.agora;
    fila.push(p);
    filaMax = Math.max(filaMax, fila.length);
    servir();
  };

  /* ----- emissor ----- */
  const armarRto = (f: F) => {
    const g0 = ++f.geracao;
    f.timerArmado = true;
    const espera = Math.min(60, f.est.rto * f.backoff);
    f.r.maxRto = Math.max(f.r.maxRto, espera);
    sim.agendar(espera, () => {
      if (g0 !== f.geracao || f.fim) return;
      f.timerArmado = false;
      if (f.una >= f.max) return;
      estourou(f);
    });
  };
  const pararRto = (f: F) => {
    f.geracao++;
    f.timerArmado = false;
  };

  const transmitir = (f: F, s: number, e: number, sonda = false) => {
    const i = fluxos.indexOf(f);
    const meu = f.txIdx++;
    f.r.transmissoes++;
    const retrans = s < f.max && !sonda;
    if (retrans) {
      f.r.retransmissoes++;
      for (let k = f.ptr; k < f.envios.length; k++) {
        const x = f.envios[k]!;
        if (x.s >= e) break;
        if (x.e > s) x.retrans = true;
      }
      const x = f.porInicio.get(s);
      if (x) {
        x.t = sim.agora;
        x.entregues = f.bbr.entregues;
        x.tEntregues = f.bbr.tEntregues || sim.agora;
        x.tEnvioRef = f.tEnvioUltimo || sim.agora;
      }
    } else if (!sonda) {
      const x: Envio = { s, e, t: sim.agora, retrans: false, entregues: f.bbr.entregues, tEntregues: f.bbr.tEntregues || sim.agora, tEnvioRef: f.tEnvioUltimo || sim.agora };
      f.envios.push(x);
      f.porInicio.set(s, x);
      f.r.segmentos++;
      if (e - s < f.mss && e < f.total) f.r.migalhas++;
    }
    if (!sonda) f.max = Math.max(f.max, e);
    if (!f.timerArmado && !sonda) armarRto(f);
    if (f.perdasForcadas.has(meu)) {
      evento(i, 'perda-forcada', `segmento ${s}:${e} perdido no caminho${retrans ? ' (era retransmissão)' : ''}`);
      return;
    }
    sim.agendar(f.extra / 2, () => naFila({ fluxo: i, s, e, sonda, chegadaFila: 0 }));
  };

  const bdp = (f: F) => (f.bbr.banda / 8) * f.bbr.rttMin;
  const ganhoBbr = (f: F): { ritmo: number; janela: number } => {
    const b = f.bbr;
    if (b.fase === 'STARTUP') return { ritmo: GANHO_BBR, janela: GANHO_BBR };
    if (b.fase === 'DRAIN') return { ritmo: 1 / GANHO_BBR, janela: GANHO_BBR };
    if (b.fase === 'PROBE_RTT') return { ritmo: 1, janela: 1 };
    return { ritmo: CICLO_BBR[b.ciclo]!, janela: 2 };
  };
  const cwndBbr = (f: F) => {
    if (f.bbr.fase === 'PROBE_RTT') return 4 * f.mss;
    return Math.max(4 * f.mss, ganhoBbr(f).janela * bdp(f));
  };

  const enviarMais = (f: F) => {
    if (f.fim || sim.agora < f.r.inicio) return;
    const bbr = f.c.algoritmo === 'bbr';
    const cwnd = bbr ? Math.min(f.cwnd, cwndBbr(f)) : f.cwnd;
    for (let guarda = 0; guarda < 10000; guarda++) {
      if (f.nxt >= f.total) break;
      const emVoo = f.nxt - f.una;
      const resta = f.total - f.nxt;
      // A janela de congestionamento conta em segmentos cheios: com ela, só sai segmento inteiro (ou o resto do arquivo).
      if (cwnd - emVoo < Math.min(f.mss, resta) - 1e-9) break;
      let len = Math.min(f.mss, resta, Math.floor(f.rwnd - emVoo));
      if (len <= 0) break;
      if (len < f.mss && len < f.total - f.nxt) {
        // Só cabe um pedaço: com SWS, o emissor espera caber um segmento cheio (ou metade da maior janela já vista).
        if (f.c.sws && len < f.rwndMax / 2) break;
      }
      if (bbr) {
        if (sim.agora < f.bbr.proxEnvio - 1e-12) {
          if (!f.bbr.acordar) {
            f.bbr.acordar = true;
            sim.agendar(f.bbr.proxEnvio - sim.agora, () => {
              f.bbr.acordar = false;
              enviarMais(f);
            });
          }
          break;
        }
        const ritmo = Math.max(1e3, ganhoBbr(f).ritmo * f.bbr.banda);
        f.bbr.proxEnvio = Math.max(sim.agora, f.bbr.proxEnvio) + ((len + SOBRA_TCP_IP) * 8) / ritmo;
      }
      len = Math.max(1, len);
      transmitir(f, f.nxt, f.nxt + len);
      f.nxt += len;
    }
    // Janela zero com dados para mandar e nada em voo: arma o temporizador de persistência (sonda).
    if (f.rwnd < Math.min(f.mss, f.total - f.nxt) && f.nxt === f.una && f.nxt < f.total && !f.persistArmado && (f.rwnd === 0 || f.c.sws) && sim.agora >= f.r.inicio) {
      f.persistArmado = true;
      const espera = Math.min(60, f.est.rto * 2 ** f.persist);
      sim.agendar(espera, () => {
        f.persistArmado = false;
        if (f.fim || f.rwnd >= Math.min(f.mss, f.total - f.nxt) || f.nxt !== f.una) return enviarMais(f);
        f.persist++;
        f.r.sondas++;
        evento(fluxos.indexOf(f), 'sonda', `janela ${f.rwnd === 0 ? 'zero' : `de ${f.rwnd} bytes`}: manda uma sonda de 1 byte para saber se o receptor já abriu espaço`);
        transmitir(f, f.nxt, f.nxt + 1, true);
        enviarMais(f);
      });
    }
    registrar(f);
  };

  const reduzir = (f: F, motivo: 'timeout' | 'triplo') => {
    const emVoo = f.max - f.una;
    if (f.c.algoritmo === 'cubic') {
      const w = f.cwnd / f.mss;
      f.wMax = w < f.wUltimoMax ? (w * (1 + BETA_CUBIC)) / 2 : w;
      f.wUltimoMax = w;
      f.epoca = -1;
      f.ssthresh = Math.max(2 * f.mss, f.cwnd * BETA_CUBIC);
    } else if (f.c.algoritmo === 'reno') {
      f.ssthresh = Math.max(2 * f.mss, emVoo / 2);
    }
    if (motivo === 'timeout' && f.c.algoritmo !== 'bbr') f.cwnd = f.mss;
  };

  const estourou = (f: F) => {
    const i = fluxos.indexOf(f);
    f.r.timeouts++;
    reduzir(f, 'timeout');
    f.recuperando = false;
    f.dup = 0;
    f.sacados = [];
    f.proxBuraco = 0;
    f.backoff = Math.min(64, f.backoff * 2);
    evento(i, 'timeout', `tempo esgotado esperando o ACK de ${f.una}: ${f.c.algoritmo === 'bbr' ? 'retransmite (o BBR não corta a janela por perda)' : `limiar vai a ${Math.round(f.ssthresh / f.mss)} segmentos, janela volta a 1`}; o RTO dobra para ${(Math.min(60, f.est.rto * f.backoff) * 1000).toFixed(0)} ms`);
    f.nxt = f.una;
    enviarMais(f);
    if (!f.timerArmado) armarRto(f);
  };

  const amostraRtt = (f: F, ack: number): number | null => {
    let ultimo: Envio | null = null;
    while (f.ptr < f.envios.length && f.envios[f.ptr]!.e <= ack) {
      ultimo = f.envios[f.ptr]!;
      f.ptr++;
    }
    return ultimo ? (ultimo.retrans ? -1 : sim.agora - ultimo.t) : null;
  };

  const atualizarBbr = (f: F, ultimo: Envio | undefined, rtt: number | null) => {
    const b = f.bbr;
    const i = fluxos.indexOf(f);
    if (ultimo) {
      // intervalo: o maior entre o de envio e o de confirmação, para um ACK acumulado não parecer banda infinita
      const dt = Math.max(sim.agora - ultimo.tEntregues, ultimo.t - ultimo.tEnvioRef);
      const taxa = dt > 0 ? ((b.entregues - ultimo.entregues) * 8) / dt : 0;
      if (ultimo.entregues >= b.proxRodada) {
        b.rodada++;
        b.proxRodada = b.entregues;
        if (!b.cheio) {
          const melhor = Math.max(...b.amostras.map((x) => x.banda), 0);
          if (melhor >= b.bandaCheia * 1.25) {
            b.bandaCheia = melhor;
            b.contaCheia = 0;
          } else if (++b.contaCheia >= 3) {
            b.cheio = true;
            b.fase = 'DRAIN';
            evento(i, 'bbr-fase', `BBR: a banda parou de crescer em 3 rodadas (≈ ${(melhor / 1e6).toFixed(2)} Mb/s): o cano encheu, entra em DRAIN para esvaziar a fila que criou`);
          }
        }
      }
      if (taxa > 0) {
        b.amostras.push({ rodada: b.rodada, banda: taxa });
        b.amostras = b.amostras.filter((x) => x.rodada > b.rodada - 10);
        b.banda = Math.max(...b.amostras.map((x) => x.banda));
      }
    }
    if (rtt !== null && rtt > 0 && (rtt <= b.rttMin || sim.agora - b.rttMinEm > 10)) {
      b.rttMin = rtt;
      b.rttMinEm = sim.agora;
    }
    if (b.fase === 'DRAIN' && f.max - f.una <= bdp(f)) {
      b.fase = 'PROBE_BW';
      b.ciclo = 2;
      b.cicloEm = sim.agora;
      evento(i, 'bbr-fase', `BBR: fila drenada, entra em PROBE_BW mandando no ritmo da banda estimada (${(b.banda / 1e6).toFixed(2)} Mb/s), RTT mínimo ${(b.rttMin * 1000).toFixed(1)} ms`);
    }
    if (b.fase === 'PROBE_BW' && sim.agora - b.cicloEm > b.rttMin) {
      b.ciclo = (b.ciclo + 1) % CICLO_BBR.length;
      b.cicloEm = sim.agora;
    }
    if (b.fase !== 'PROBE_RTT' && b.cheio && sim.agora - b.rttMinEm > 10) {
      b.fase = 'PROBE_RTT';
      b.probeRttAte = sim.agora + Math.max(0.2, b.rttMin);
      evento(i, 'bbr-fase', 'BBR: 10 s sem ver RTT menor: PROBE_RTT, janela de 4 segmentos por 200 ms para a fila esvaziar e medir o RTT de verdade');
    }
    if (b.fase === 'PROBE_RTT' && sim.agora >= b.probeRttAte) {
      b.rttMinEm = sim.agora;
      b.fase = 'PROBE_BW';
      b.ciclo = 2;
      b.cicloEm = sim.agora;
    }
  };

  const crescer = (f: F, acked: number, rtt: number | null) => {
    const i = fluxos.indexOf(f);
    if (f.c.algoritmo === 'bbr') {
      if (!f.bbr.cheio) f.cwnd += acked;
      else f.cwnd = Math.min(f.cwnd + acked, cwndBbr(f));
      return;
    }
    if (f.cwnd < f.ssthresh) {
      f.cwnd += Math.min(acked, f.mss);
      if (f.cwnd >= f.ssthresh) evento(i, 'fim-partida-lenta', `janela chegou ao limiar (${Math.round(f.ssthresh / f.mss)} segmentos): sai da partida lenta, passa a crescer 1 segmento por RTT`);
      return;
    }
    if (f.c.algoritmo === 'cubic') {
      const w = f.cwnd / f.mss;
      const rttRef = f.est.srtt ?? rtt ?? f.rtt0;
      if (f.epoca < 0) {
        f.epoca = sim.agora;
        if (w < f.wMax) {
          f.k = Math.cbrt((f.wMax - w) / C_CUBIC);
          f.origem = f.wMax;
        } else {
          f.k = 0;
          f.origem = w;
        }
      }
      const t = sim.agora - f.epoca + rttRef;
      const alvo = f.origem + C_CUBIC * (t - f.k) ** 3;
      const amigavel = f.wMax * BETA_CUBIC + ((3 * (1 - BETA_CUBIC)) / (1 + BETA_CUBIC)) * ((sim.agora - f.epoca) / rttRef);
      const meta = Math.max(alvo, amigavel);
      const segs = acked / f.mss;
      f.cwnd += meta > w ? (((meta - w) / w) * segs * f.mss) : ((0.01 / w) * segs * f.mss);
      return;
    }
    f.cwnd += (f.mss * f.mss * (acked / f.mss)) / f.cwnd;
  };

  /** Próximo buraco abaixo do maior bloco confirmado por SACK que ainda não foi retransmitido nesta recuperação. */
  const proximoBuraco = (f: F): [number, number] | null => {
    if (!f.c.sack || !f.sacados.length) return null;
    const topo = f.sacados[f.sacados.length - 1]![1];
    let x = Math.max(f.proxBuraco, f.una);
    for (const [a, b] of f.sacados) {
      if (x >= a && x < b) x = b;
    }
    if (x >= topo) return null;
    const prox = f.sacados.find(([a]) => a > x);
    return [x, Math.min(x + f.mss, prox ? prox[0] : f.max, f.max)];
  };
  const retransmitirBuraco = (f: F): boolean => {
    const h = proximoBuraco(f);
    if (!h || h[1] <= h[0]) return false;
    transmitir(f, h[0], h[1]);
    f.proxBuraco = h[1];
    return true;
  };

  const chegouAck = (f: F, ack: number, janela: number, atualizacao: boolean, sack: [number, number][] = []) => {
    if (f.fim) return;
    if (f.c.sack) {
      const todos = [...f.sacados, ...sack].filter(([, b]) => b > ack).sort((a, b) => a[0] - b[0]);
      const junto: [number, number][] = [];
      for (const [a, b] of todos) {
        const u = junto[junto.length - 1];
        if (u && a <= u[1]) u[1] = Math.max(u[1], b);
        else junto.push([Math.max(a, ack), b]);
      }
      f.sacados = junto;
    }
    const i = fluxos.indexOf(f);
    f.r.acks++;
    const antes = f.rwnd;
    f.rwnd = janela;
    f.rwndMax = Math.max(f.rwndMax, janela);
    if (janela > 0 && antes === 0) f.persist = 0;
    if (ack > f.una) {
      const acked = ack - f.una;
      const ultimoIdx = f.ptr;
      const amostra = amostraRtt(f, ack);
      const ultimo = f.ptr > ultimoIdx ? f.envios[f.ptr - 1] : undefined;
      if (ultimo) f.tEnvioUltimo = ultimo.t;
      // Entregue de verdade: o que o ACK cobre menos o que os ACKs duplicados já tinham contado (cada um é um segmento que chegou).
      f.bbr.entregues += Math.max(0, acked - f.creditoDup);
      f.creditoDup = Math.max(0, f.creditoDup - acked);
      f.bbr.tEntregues = sim.agora;
      let rtt: number | null = null;
      if (amostra !== null && amostra >= 0) {
        rtt = amostra;
        f.est = amostrarRtt(f.est, amostra, f.c.rtoMin);
        f.backoff = 1;
        f.r.rttAmostras.push({ t: sim.agora, rtt: amostra, srtt: f.est.srtt!, rttvar: f.est.rttvar!, rto: f.est.rto });
      } else if (amostra === -1) f.r.karnDescartadas++;
      f.una = ack;
      if (f.nxt < f.una) f.nxt = f.una;
      if (f.max < f.una) f.max = f.una;
      f.dup = 0;
      // ACK parcial: o buraco seguinte já pode ser retransmitido (com SACK, só se ainda não foi nesta recuperação).
      const parcial = () => {
        if (f.c.sack && f.una < f.proxBuraco) return retransmitirBuraco(f);
        transmitir(f, f.una, Math.min(f.una + f.mss, f.max));
        f.proxBuraco = Math.min(f.una + f.mss, f.max);
        return true;
      };
      if (f.c.algoritmo === 'bbr') {
        atualizarBbr(f, ultimo, rtt);
        if (f.recuperando && ack < f.recover) parcial();
        else f.recuperando = false;
        crescer(f, acked, rtt);
      } else if (f.recuperando) {
        if (ack >= f.recover) {
          f.recuperando = false;
          f.cwnd = f.ssthresh;
          evento(i, 'recuperacao-fim', `ACK novo cobre tudo que estava em voo: fim da recuperação rápida, janela = limiar = ${Math.round(f.ssthresh / f.mss)} segmentos`, 40);
        } else {
          // ACK parcial (NewReno): ainda falta outro buraco da mesma janela; retransmite já e segue na recuperação.
          parcial();
          f.cwnd = Math.max(f.mss, f.cwnd - acked + f.mss);
        }
      } else crescer(f, acked, rtt);
      if (f.una >= f.total) {
        f.fim = true;
        f.r.concluiu = true;
        f.r.fim = sim.agora;
        pararRto(f);
        evento(i, 'concluiu', `último byte confirmado: ${f.total} bytes em ${((sim.agora - f.r.inicio) * 1000).toFixed(1)} ms`);
        registrar(f);
        return;
      }
      pararRto(f);
      if (f.una < f.max) armarRto(f);
    } else if (ack === f.una && f.max > f.una && !atualizacao && janela === antes) {
      f.dup++;
      f.r.ackDuplicados++;
      f.bbr.entregues += f.mss;
      f.creditoDup += f.mss;
      f.bbr.tEntregues = sim.agora;
      if (f.dup === 3 && !f.recuperando) {
        f.r.retransRapidas++;
        if (f.c.algoritmo === 'bbr') {
          evento(i, 'retransmissao-rapida', `3 ACKs duplicados pedindo ${ack}: retransmite já, sem esperar o tempo (o BBR não corta a janela por perda)`, 40);
          transmitir(f, f.una, Math.min(f.una + f.mss, f.max));
          f.proxBuraco = Math.min(f.una + f.mss, f.max);
          f.recuperando = true;
          f.recover = f.max;
        } else {
          reduzir(f, 'triplo');
          f.recover = f.max;
          f.recuperando = true;
          f.cwnd = f.ssthresh + 3 * f.mss;
          evento(i, 'retransmissao-rapida', `3 ACKs duplicados pedindo ${ack}: retransmissão rápida e recuperação rápida, limiar ${Math.round(f.ssthresh / f.mss)} segmentos, janela ${Math.round(f.cwnd / f.mss)}`, 40);
          transmitir(f, f.una, Math.min(f.una + f.mss, f.max));
          f.proxBuraco = Math.min(f.una + f.mss, f.max);
        }
      } else if (f.dup > 3 && f.recuperando) {
        // Cada ACK duplicado diz que um segmento saiu da rede: com SACK, a vaga vai para o próximo buraco; sem, a janela infla (Reno).
        if (!retransmitirBuraco(f) && f.c.algoritmo !== 'bbr') f.cwnd += f.mss;
      }
    }
    enviarMais(f);
  };

  /* ----- receptor ----- */
  // A janela anunciada não encolhe com o que chegou fora de ordem: a borda direita fica parada (senão o ACK duplicado nem contaria).
  const janelaLivre = (f: F) => Math.max(0, f.c.janela - f.naoLido);
  const anunciar = (f: F): number => {
    let w = janelaLivre(f);
    // Clark: não anuncia janela pequena; espera abrir pelo menos 1 MSS ou metade do buffer.
    if (f.c.sws && w < Math.min(f.mss, f.c.janela / 2)) w = 0;
    const campo = Math.min(65535, Math.floor(w / 2 ** f.c.escala));
    return campo * 2 ** f.c.escala;
  };

  const mandarAck = (f: F, atualizacao = false) => {
    f.ackPendente = 0;
    f.timerAck++;
    const w = anunciar(f);
    const i = fluxos.indexOf(f);
    if (w === 0 && f.anunciada !== 0) {
      f.r.janelasZero++;
      evento(i, 'janela-zero', `receptor anuncia janela zero: o buffer de ${f.c.janela} bytes está cheio (${f.naoLido} bytes esperando a aplicação ler)`);
    }
    f.anunciada = w;
    const ack = f.rcvNxt;
    // SACK (RFC 2018): o primeiro bloco é o que tem o segmento que acabou de chegar; os outros repetem os mais baixos.
    const blocos = f.foraDeOrdem.slice().sort((a, b) => a[0] - b[0]);
    const recente = blocos.find(([a, b]) => f.ultimoRecebido >= a && f.ultimoRecebido < b);
    const sack = f.c.sack ? [...(recente ? [recente] : []), ...blocos.filter((x) => x !== recente).slice(0, recente ? 3 : 4)].map(([a, b]) => [a, b] as [number, number]) : [];
    if (g.perdaAck && rng() < g.perdaAck) return;
    sim.agendar(volta + f.extra / 2, () => chegouAck(f, ack, w, atualizacao, sack));
  };

  const agendarLeitura = (f: F) => {
    const l = f.c.leitura;
    if (!l || f.leituraAgendada || f.naoLido <= 0) return;
    f.leituraAgendada = true;
    const p = f.c.pausaLeitura;
    let espera = l.intervalo;
    if (p && sim.agora + espera >= p[0] && sim.agora + espera < p[1]) espera = p[1] - sim.agora;
    sim.agendar(espera, () => {
      f.leituraAgendada = false;
      const antes = f.anunciada;
      f.naoLido = Math.max(0, f.naoLido - l.bytes);
      const agora = anunciar(f);
      if (agora > antes && (antes < f.mss || antes === 0)) {
        evento(fluxos.indexOf(f), 'atualizacao-janela', `a aplicação leu; receptor avisa que a janela abriu para ${agora} bytes`);
        mandarAck(f, true);
      }
      agendarLeitura(f);
    });
  };

  const receber = (f: F, p: Pacote) => {
    const s = p.s;
    const e = p.e;
    if (f.fim && f.rcvNxt >= f.total) {
      mandarAck(f);
      return;
    }
    // Borda direita da janela: o buffer inteiro menos o que a aplicação ainda não leu.
    const borda = f.rcvNxt + Math.max(0, f.c.janela - f.naoLido);
    const fimAceito = Math.min(e, borda);
    // Sem espaço (janela zero, sonda incluída) ou nada novo: descarta e reconfirma com a janela de agora.
    if (fimAceito <= Math.max(s, f.rcvNxt)) {
      mandarAck(f);
      return;
    }
    const marcarChegada = (a: number, b: number) => {
      for (let k = Math.floor(a / f.mss); k * f.mss < b; k++) {
        const fimSeg = Math.min((k + 1) * f.mss, f.total);
        if (k * f.mss >= a && fimSeg <= b && f.r.chegadas[k] === undefined) f.r.chegadas[k] = sim.agora;
      }
    };
    marcarChegada(s, fimAceito);
    f.ultimoRecebido = s;
    let emOrdem = false;
    if (s <= f.rcvNxt) {
      const antes = f.rcvNxt;
      f.rcvNxt = Math.max(f.rcvNxt, fimAceito);
      // junta o que estava esperando fora de ordem
      f.foraDeOrdem.sort((a, b) => a[0] - b[0]);
      while (f.foraDeOrdem.length && f.foraDeOrdem[0]![0] <= f.rcvNxt) {
        f.rcvNxt = Math.max(f.rcvNxt, f.foraDeOrdem.shift()![1]);
      }
      const novos = f.rcvNxt - antes;
      f.r.entregues += novos;
      for (let k = Math.floor(antes / f.mss); k * f.mss < f.rcvNxt; k++) {
        if (Math.min((k + 1) * f.mss, f.total) <= f.rcvNxt && f.r.entregas[k] === undefined) f.r.entregas[k] = sim.agora;
      }
      if (f.c.leitura) {
        f.naoLido += novos;
        agendarLeitura(f);
      }
      emOrdem = f.foraDeOrdem.length === 0;
    } else {
      // guarda fora de ordem, juntando com o que encosta
      let a = s;
      let b = fimAceito;
      f.foraDeOrdem = f.foraDeOrdem.filter(([x, y]) => {
        if (y < a || x > b) return true;
        a = Math.min(a, x);
        b = Math.max(b, y);
        return false;
      });
      f.foraDeOrdem.push([a, b]);
    }
    // ACK atrasado: em ordem e sem buraco, confirma a cada dois segmentos ou depois de 200 ms.
    if (f.c.ackAtrasado && emOrdem && !p.sonda) {
      f.ackPendente++;
      if (f.ackPendente >= 2) return mandarAck(f);
      const g0 = ++f.timerAck;
      sim.agendar(ATRASO_ACK, () => {
        if (g0 === f.timerAck && f.ackPendente > 0) mandarAck(f);
      });
      return;
    }
    mandarAck(f);
  };

  /* ----- partida ----- */
  for (const f of fluxos) {
    // O aperto de mão já deu uma amostra de RTT: o estimador começa com ela (como faz o TCP de verdade).
    f.est = amostrarRtt({ rto: f.c.rtoInicial }, f.rtt0, f.c.rtoMin);
    sim.agendar(f.r.inicio, () => {
      registrar(f);
      enviarMais(f);
    });
  }
  const amostrar = () => {
    for (const f of fluxos) f.r.progresso.push([sim.agora, f.rcvNxt]);
    if (fluxos.some((f) => !f.fim) && sim.agora + amostra <= duracao) sim.agendar(amostra, amostrar);
  };
  sim.agendar(0, amostrar);
  sim.rodar(o.maxEventos ?? 3e6, duracao);
  marcarFila();

  const fim = Math.min(duracao, sim.agora);
  for (const f of fluxos) {
    const r = f.r;
    r.entregues = f.rcvNxt;
    const t1 = r.fim ?? fim;
    r.duracao = Math.max(0, t1 - r.inicio);
    r.vazaoMbps = r.duracao > 0 ? (Math.min(f.una, f.total) * 8) / r.duracao / 1e6 : 0;
    r.progresso.push([t1, f.rcvNxt]);
    if (f.c.algoritmo === 'bbr') r.estimativaBbr = { banda: f.bbr.banda, rttMin: f.bbr.rttMin };
    // a série da janela fica com no máximo ~1500 pontos: os 500 primeiros inteiros, o resto espaçado
    if (r.janela.length > 1500) {
      const resto = r.janela.slice(500);
      const passo = resto.length / 1000;
      const fina: PontoJanela[] = r.janela.slice(0, 500);
      for (let k = 0; k < 1000; k++) fina.push(resto[Math.floor(k * passo)]!);
      fina.push(r.janela[r.janela.length - 1]!);
      r.janela = fina;
    }
  }
  const vazoes = fluxos.map((f) => f.r.vazaoMbps);
  return {
    fluxos: fluxos.map((f) => f.r),
    eventos,
    linhas,
    duracao: fim,
    perdasFila,
    perdasAleatorias,
    filaMedia: fim > 0 ? areaFila / fim : 0,
    filaMax,
    atrasoFilaMedio: nEspera ? somaEspera / nEspera : 0,
    utilizacao: fim > 0 ? Math.min(1, tempoOcupado / fim) : 0,
    gargalo: g,
    justica: indiceJain(vazoes),
  };
}

/** Bytes entregues por um fluxo entre t0 e t1, pelo progresso amostrado. */
export function entreguesEntre(r: ResultadoFluxo, t0: number, t1: number): number {
  // interpola entre as amostras, para a conta não depender de onde caiu a amostragem
  const em = (t: number) => {
    const p = r.progresso;
    if (!p.length || t <= p[0]![0]) return p[0]?.[1] ?? 0;
    for (let i = 1; i < p.length; i++) {
      const [t1, b1] = p[i]!;
      if (t1 < t) continue;
      const [t0, b0] = p[i - 1]!;
      return t1 > t0 ? b0 + ((b1 - b0) * (t - t0)) / (t1 - t0) : b1;
    }
    return p[p.length - 1]![1];
  };
  return em(t1) - em(t0);
}

/** Janela de congestionamento (em segmentos) num instante, pela série registrada. */
export function janelaEm(r: ResultadoFluxo, t: number): number {
  let v = r.janela[0]?.cwnd ?? 0;
  for (const p of r.janela) {
    if (p.t > t) break;
    v = p.cwnd;
  }
  return v;
}

/* ---------- Nagle e janela boba ---------- */

export interface ResultadoNagle {
  nagle: boolean;
  escritas: number;
  segmentos: number;
  bytesPorSegmento: number;
  /** Fração do que vai no fio que é dado (o resto é cabeçalho de 40 bytes). */
  eficiencia: number;
  /** Atraso médio entre a escrita e a saída do byte. */
  esperaMedia: number;
}

/**
 * Aplicação escrevendo pedacinhos (um terminal remoto, por exemplo): sem Nagle, cada escrita vira um segmento;
 * com Nagle, enquanto há dado sem confirmação, o que chega se acumula e sai num segmento só quando o ACK volta.
 */
export function simularNagle(o: { escritas: number; bytes: number; intervalo: number; rtt: number; nagle: boolean; mss?: number }): ResultadoNagle {
  const sim = new Simulador();
  const mss = o.mss ?? 1460;
  let acumulado: number[] = []; // instantes das escritas esperando
  let emVoo = false;
  let segmentos = 0;
  let enviados = 0;
  let somaEspera = 0;
  const sair = () => {
    if (!acumulado.length) return;
    const n = Math.min(acumulado.length, Math.floor(mss / o.bytes));
    const lote = acumulado.slice(0, n);
    acumulado = acumulado.slice(n);
    segmentos++;
    enviados += lote.length * o.bytes;
    somaEspera += lote.reduce((s, t) => s + (sim.agora - t), 0);
    emVoo = true;
    sim.agendar(o.rtt, () => {
      emVoo = false;
      if (o.nagle) sair();
    });
  };
  for (let k = 0; k < o.escritas; k++) {
    sim.agendar(k * o.intervalo, () => {
      acumulado.push(sim.agora);
      if (!o.nagle || !emVoo || acumulado.length * o.bytes >= mss) sair();
    });
  }
  sim.rodar(1e6);
  return { nagle: o.nagle, escritas: o.escritas, segmentos, bytesPorSegmento: segmentos ? enviados / segmentos : 0, eficiencia: enviados / (enviados + segmentos * SOBRA_TCP_IP), esperaMedia: o.escritas ? somaEspera / o.escritas : 0 };
}

export interface ResultadoJanelaBoba {
  sws: boolean;
  segmentos: number;
  bytesPorSegmento: number;
  eficiencia: number;
  duracao: number;
  janelasAnunciadas: number[];
}

/**
 * Janela boba: o buffer do receptor está cheio e a aplicação lê 1 byte por vez. Sem a solução de Clark, cada
 * byte lido vira um anúncio de janela de 1 byte e o emissor manda segmentos de 1 byte com 40 de cabeçalho.
 */
export function simularJanelaBoba(o: { sws: boolean; bytes?: number; janela?: number; leitura?: number; intervalo?: number; rtt?: number; banda?: number }): ResultadoJanelaBoba {
  const bytes = o.bytes ?? 20000;
  const janela = o.janela ?? 4096;
  const g: Gargalo = { banda: o.banda ?? 10e6, atraso: (o.rtt ?? 0.02) / 2, buffer: 1000 };
  const r = simularTcp([{ bytes, config: { janela, sws: o.sws, leitura: { bytes: o.leitura ?? 1, intervalo: o.intervalo ?? 0.0005 }, janelaInicial: 4, mss: 1460 } }], g, { duracao: 120 });
  const f = r.fluxos[0]!;
  const janelas = r.fluxos[0]!.janela.map((p) => p.rwnd).filter((x, i, a) => i === 0 || x !== a[i - 1]).slice(0, 30);
  return { sws: o.sws, segmentos: f.transmissoes, bytesPorSegmento: f.transmissoes ? f.entregues / f.transmissoes : 0, eficiencia: f.entregues / (f.entregues + f.transmissoes * SOBRA_TCP_IP), duracao: f.duracao, janelasAnunciadas: janelas };
}

/* ---------- Desempenho ---------- */

/** Produto banda × atraso: quantos bytes cabem "no cano" durante um RTT. */
export function bdpBytes(bandaBps: number, rtt: number): number {
  return (bandaBps * rtt) / 8;
}

/** Vazão máxima com uma janela: janela ÷ RTT (em bit/s). */
export function vazaoJanela(janelaBytes: number, rtt: number): number {
  return (janelaBytes * 8) / rtt;
}

/** Vazão do TCP com perda p (Mathis e outros): (MSS / RTT) × √(3/2) / √p, em bit/s. */
export function vazaoComPerda(mss: number, rtt: number, p: number): number {
  return ((mss * 8) / rtt) * (Math.sqrt(1.5) / Math.sqrt(p));
}

/** Menor deslocamento de escala de janela que deixa anunciar este tanto de bytes. */
export function escalaNecessaria(bytes: number): number {
  let s = 0;
  while (s < 14 && 65535 * 2 ** s < bytes) s++;
  return s;
}

/** Quanto tempo o número de sequência de 32 bits leva para dar a volta nessa taxa. */
export function tempoVoltaSeq(bandaBps: number): number {
  return (2 ** 32 * 8) / bandaBps;
}

/** MSL de referência: 2 minutos. Se o número de sequência dá a volta em menos que isso, precisa de PAWS. */
export const MSL = 120;
