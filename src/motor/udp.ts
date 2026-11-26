// Camada de transporte (ato 5), parte pura do UDP: datagrama sem conexão e sem retransmissão, RPC simples por cima
// (pedido, resposta e tempo de espera) e RTP para mídia em tempo real (número de sequência, marca de tempo,
// jitter calculado como na RFC 3550 e buffer de reprodução). Nada aqui conhece o mundo do jogo.

import { Simulador } from './eventos';
import { rngSemente } from './util';

export interface CaminhoUdp {
  /** Atraso de um sentido, em segundos. */
  atraso: number;
  /** Probabilidade de perder um datagrama em cada sentido. */
  perda: number;
  /** Variação aleatória do atraso (média de uma exponencial), em segundos. */
  jitter?: number;
}

export interface ResultadoUdp {
  enviados: number;
  recebidos: number;
  perdidos: number;
  /** Índices (a partir de 0) dos que se perderam. O UDP não sabe nem avisa: quem quiser que conte. */
  quaisPerdidos: number[];
  foraDeOrdem: number;
  retransmissoes: 0;
  linhas: string[];
}

/** Manda n datagramas: cada um vai sozinho, sem conexão, sem ACK e sem retransmissão. */
export function enviarDatagramas(n: number, c: CaminhoUdp, o: { intervalo?: number; semente?: number; perdidos?: number[] } = {}): ResultadoUdp {
  const sim = new Simulador();
  const rng = rngSemente(o.semente ?? 77);
  const intervalo = o.intervalo ?? 0.001;
  const chegadas: number[] = [];
  const quais: number[] = [];
  for (let k = 0; k < n; k++) {
    const perdeu = o.perdidos ? o.perdidos.includes(k) : rng() < c.perda;
    const extra = c.jitter ? -Math.log(1 - rng()) * c.jitter : 0;
    sim.agendar(k * intervalo, () => {
      if (perdeu) {
        quais.push(k);
        return;
      }
      sim.agendar(c.atraso + extra, () => chegadas.push(k));
    });
  }
  sim.rodar(1e6);
  let fora = 0;
  for (let i = 1; i < chegadas.length; i++) if (chegadas[i]! < chegadas[i - 1]!) fora++;
  const linhas = [
    `${n} datagrama(s) mandados, ${chegadas.length} chegaram, ${quais.length} perdido(s)${quais.length ? `: ${quais.slice(0, 12).map((x) => `#${x}`).join(', ')}${quais.length > 12 ? '...' : ''}` : ''}.`,
    'O UDP não confirma, não retransmite e não reordena: o que se perdeu, se perdeu. Se a aplicação se importa, ela mesma conta e pede de novo.',
  ];
  if (fora) linhas.push(`${fora} chegaram fora de ordem (cada datagrama pode ir por um atraso diferente).`);
  return { enviados: n, recebidos: chegadas.length, perdidos: quais.length, quaisPerdidos: quais, foraDeOrdem: fora, retransmissoes: 0, linhas };
}

/* ---------- RPC sobre UDP ---------- */

export interface ResultadoRpc {
  ok: boolean;
  tentativas: number;
  /** Quantas vezes o servidor executou o procedimento: mais de uma quando a resposta se perdeu (semântica "pelo menos uma vez"). */
  execucoes: number;
  tempo: number;
  linhas: string[];
}

/**
 * Chamada de procedimento remoto: o cliente manda o pedido num datagrama, arma um tempo de espera e, se a
 * resposta não vier, manda de novo. Se o que se perdeu foi a resposta, o servidor executa duas vezes.
 */
export function chamarRpc(c: CaminhoUdp, o: { espera: number; tentativas: number; semente?: number; procedimento?: string; perdas?: ('pedido' | 'resposta')[]; escuta?: boolean; processamento?: number }): ResultadoRpc {
  const sim = new Simulador();
  const rng = rngSemente(o.semente ?? 99);
  const proc = o.procedimento ?? 'saldo(conta=42)';
  const linhas: string[] = [];
  const r: ResultadoRpc = { ok: false, tentativas: 0, execucoes: 0, tempo: 0, linhas };
  const forcadas = [...(o.perdas ?? [])];
  const t = (s: number) => `${(s * 1000).toFixed(1).padStart(8)} ms`;
  const perde = (tipo: 'pedido' | 'resposta') => {
    if (forcadas.length) {
      if (forcadas[0] === tipo) {
        forcadas.shift();
        return true;
      }
      return false;
    }
    return rng() < c.perda;
  };
  let respondido = false;
  const tentar = () => {
    if (respondido || r.tentativas >= o.tentativas) return;
    r.tentativas++;
    const n = r.tentativas;
    linhas.push(`${t(sim.agora)}  cliente: pedido ${proc} (id 7, tentativa ${n}), espera ${(o.espera * 1000).toFixed(0)} ms pela resposta`);
    if (perde('pedido')) linhas.push(`${t(sim.agora)}  o pedido se perdeu no caminho`);
    else
      sim.agendar(c.atraso, () => {
        if (o.escuta === false) {
          linhas.push(`${t(sim.agora)}  servidor: ninguém escuta nessa porta; volta ICMP "porta inalcançável" (o cliente pode nem ficar sabendo)`);
          return;
        }
        r.execucoes++;
        linhas.push(`${t(sim.agora)}  servidor: executa ${proc}${r.execucoes > 1 ? ` DE NOVO (é a ${r.execucoes}ª vez: o servidor não sabe que já respondeu)` : ''}`);
        sim.agendar(o.processamento ?? 0.0005, () => {
          if (perde('resposta')) return linhas.push(`${t(sim.agora)}  a resposta se perdeu no caminho`);
          sim.agendar(c.atraso, () => {
            if (respondido) return linhas.push(`${t(sim.agora)}  cliente: resposta repetida do id 7, descartada`);
            respondido = true;
            r.ok = true;
            r.tempo = sim.agora;
            linhas.push(`${t(sim.agora)}  cliente: resposta do id 7 chegou`);
          });
        });
      });
    sim.agendar(o.espera, () => {
      if (respondido) return;
      if (r.tentativas >= o.tentativas) {
        r.tempo = sim.agora;
        return linhas.push(`${t(sim.agora)}  cliente: ${r.tentativas} tentativa(s) sem resposta. Desiste e avisa a aplicação.`);
      }
      linhas.push(`${t(sim.agora)}  cliente: tempo esgotado, manda de novo`);
      tentar();
    });
  };
  tentar();
  sim.rodar(1e5);
  if (r.execucoes > 1) linhas.push(`O servidor executou ${r.execucoes} vezes. Para "ler saldo" tanto faz (é idempotente); para "transferir 100" não. Por isso RPC sobre UDP precisa de identificador de pedido e o servidor lembra o que já respondeu.`);
  return r;
}

/* ---------- RTP ---------- */

export interface PacoteRtp {
  seq: number;
  /** Marca de tempo em batidas do relógio da mídia (8000 Hz no áudio de telefone). */
  marca: number;
  enviado: number;
  chegada?: number;
  /** Chegou depois da hora de tocar: para quem ouve, é como se tivesse se perdido. */
  atrasado: boolean;
}

export interface ResultadoRtp {
  pacotes: PacoteRtp[];
  recebidos: number;
  perdidos: number;
  atrasados: number;
  /** Jitter estimado como na RFC 3550 (J += (|D| - J) / 16), em segundos. */
  jitter: number;
  /** Atraso do começo da fala até tocar: atraso da rede mais o buffer. */
  atrasoBoca: number;
  /** Fração que o ouvinte não ouviu (perdidos mais atrasados). */
  falhas: number;
  linhas: string[];
}

/**
 * Áudio em RTP: um pacote a cada "intervalo" (20 ms), com número de sequência (para notar perda e ordem) e marca
 * de tempo (para saber quando tocar). O receptor segura um buffer de reprodução: toca o pacote i em
 * t0 + buffer + i × intervalo. Pacote que chega depois disso não serve mais.
 */
export function simularRtp(c: CaminhoUdp, o: { pacotes: number; buffer: number; intervalo?: number; relogio?: number; semente?: number; seqInicial?: number; marcaInicial?: number }): ResultadoRtp {
  const rng = rngSemente(o.semente ?? 314);
  const intervalo = o.intervalo ?? 0.02;
  const relogio = o.relogio ?? 8000;
  const seq0 = o.seqInicial ?? 4242;
  const marca0 = o.marcaInicial ?? 160000;
  const pacotes: PacoteRtp[] = [];
  for (let i = 0; i < o.pacotes; i++) {
    const enviado = i * intervalo;
    const perdeu = rng() < c.perda;
    const extra = c.jitter ? -Math.log(1 - rng()) * c.jitter : 0;
    pacotes.push({ seq: (seq0 + i) & 0xffff, marca: (marca0 + i * Math.round(intervalo * relogio)) >>> 0, enviado, chegada: perdeu ? undefined : enviado + c.atraso + extra, atrasado: false });
  }
  // A primeira a chegar ancora o relógio de reprodução.
  const primeira = pacotes.find((p) => p.chegada !== undefined);
  const t0 = primeira ? primeira.chegada! - primeira.enviado : c.atraso;
  let jitter = 0;
  let anterior: PacoteRtp | undefined;
  for (const p of [...pacotes].filter((x) => x.chegada !== undefined).sort((a, b) => a.chegada! - b.chegada!)) {
    if (anterior) {
      const d = p.chegada! - anterior.chegada! - (p.enviado - anterior.enviado);
      jitter += (Math.abs(d) - jitter) / 16;
    }
    anterior = p;
    const tocar = t0 + o.buffer + p.enviado;
    p.atrasado = p.chegada! > tocar;
  }
  const recebidos = pacotes.filter((p) => p.chegada !== undefined).length;
  const atrasados = pacotes.filter((p) => p.atrasado).length;
  const perdidos = o.pacotes - recebidos;
  const falhas = o.pacotes ? (perdidos + atrasados) / o.pacotes : 0;
  const linhas = [
    `RTP: ${o.pacotes} pacotes de ${(intervalo * 1000).toFixed(0)} ms de áudio; número de sequência de ${seq0} em diante e marca de tempo subindo ${Math.round(intervalo * relogio)} batidas (relógio de ${relogio} Hz) por pacote.`,
    `perdidos na rede: ${perdidos}; chegaram tarde para tocar: ${atrasados}; jitter estimado (RFC 3550): ${(jitter * 1000).toFixed(2)} ms`,
    `buffer de reprodução de ${(o.buffer * 1000).toFixed(0)} ms: a fala toca ${((t0 + o.buffer) * 1000).toFixed(0)} ms depois de dita. Buffer maior salva os atrasados, mas a conversa fica com eco de satélite.`,
  ];
  return { pacotes, recebidos, perdidos, atrasados, jitter, atrasoBoca: t0 + o.buffer, falhas, linhas };
}

/* ---------- Compactação de cabeçalho ---------- */

export interface Compactacao {
  carga: number;
  cabecalho: number;
  compactado: number;
  eficienciaSem: number;
  eficienciaCom: number;
}

/**
 * Voz em RTP sobre UDP sobre IPv4: 20 + 8 + 12 = 40 bytes de cabeçalho para 20 a 160 de fala. Quase tudo se repete
 * de um pacote para o outro, então a compactação (ROHC) manda só o que mudou: uns 1 a 3 bytes.
 */
export function compactacao(carga: number, compactado = 3, cabecalho = 40): Compactacao {
  return { carga, cabecalho, compactado, eficienciaSem: carga / (carga + cabecalho), eficienciaCom: carga / (carga + compactado) };
}
