// Camada de transporte (ato 5), QUIC em linhas gerais mas simulável: estabelecimento em 1 RTT e retomada em 0 RTT
// (contra TCP + TLS), fluxos independentes sem bloqueio de cabeça de fila (a mesma perda num TCP com vários objetos
// trava todos) e migração de conexão pelo identificador de conexão quando o IP muda.
// A transferência usa o mesmo motor do TCP (tcp.ts): mesma rede, mesmas perdas; muda só o que conta como entregue.

import { simularTcp, type ConfigTcp, type Gargalo } from './tcp';

export interface PassoHandshake {
  t: number;
  texto: string;
}

export interface ResultadoEstabelecimento {
  rtt: number;
  /** Até a primeira resposta da aplicação chegar, em segundos. */
  tcpTls12: number;
  tcpTls13: number;
  quic: number;
  quic0rtt: number;
  passos: Record<'tcpTls13' | 'quic' | 'quic0rtt', PassoHandshake[]>;
  linhas: string[];
}

/** Quantas idas e voltas cada pilha gasta até o primeiro byte de resposta (o pedido vai assim que dá). */
export function estabelecimento(rtt: number): ResultadoEstabelecimento {
  const p = (lista: [number, string][]) => lista.map(([n, texto]) => ({ t: n * rtt, texto }));
  const passos = {
    tcpTls13: p([
      [0, 'cliente: SYN'],
      [0.5, 'servidor: SYN+ACK'],
      [1, 'cliente: ACK e ClientHello do TLS 1.3 (com a chave efêmera)'],
      [1.5, 'servidor: ServerHello, certificado, Finished'],
      [2, 'cliente: Finished e o pedido HTTP, já cifrado'],
      [2.5, 'servidor: resposta'],
      [3, 'cliente: primeiro byte da resposta'],
    ]),
    quic: p([
      [0, 'cliente: Initial com o ClientHello do TLS 1.3 dentro, sobre UDP (transporte e criptografia juntos)'],
      [0.5, 'servidor: Initial e Handshake (ServerHello, certificado, Finished)'],
      [1, 'cliente: Finished e o pedido no mesmo voo'],
      [1.5, 'servidor: resposta'],
      [2, 'cliente: primeiro byte da resposta'],
    ]),
    quic0rtt: p([
      [0, 'cliente: Initial e, junto, o pedido em 0-RTT, cifrado com a chave guardada da conexão anterior'],
      [0.5, 'servidor: resposta (aceita o 0-RTT)'],
      [1, 'cliente: primeiro byte da resposta'],
    ]),
  };
  return {
    rtt,
    tcpTls12: 4 * rtt,
    tcpTls13: 3 * rtt,
    quic: 2 * rtt,
    quic0rtt: rtt,
    passos,
    linhas: [
      `RTT do caminho: ${(rtt * 1000).toFixed(1)} ms. Até o primeiro byte da resposta:`,
      `  TCP + TLS 1.2: 4 RTT = ${(4 * rtt * 1000).toFixed(1)} ms (1 do TCP, 2 do TLS, 1 do pedido)`,
      `  TCP + TLS 1.3: 3 RTT = ${(3 * rtt * 1000).toFixed(1)} ms (1 do TCP, 1 do TLS, 1 do pedido)`,
      `  QUIC:          2 RTT = ${(2 * rtt * 1000).toFixed(1)} ms (transporte e TLS no mesmo aperto de mão)`,
      `  QUIC 0-RTT:    1 RTT = ${(rtt * 1000).toFixed(1)} ms (retomada: o pedido vai no primeiro pacote)`,
      'O 0-RTT tem preço: um atacante pode repetir aquele primeiro pacote. Só serve para pedido que pode repetir sem estrago (ler, não pagar).',
    ],
  };
}

export interface ResultadoCabecaDeFila {
  objetos: number;
  segmentosPorObjeto: number;
  /** Quando cada objeto ficou completo para a aplicação, em segundos, contando a partir do primeiro dado. */
  tcp: number[];
  quic: number[];
  /** Objetos que no TCP ficaram esperando uma perda que não era deles. */
  travadosNoTcp: number;
  /** Quanto, em média, cada segmento esperou entre chegar e ser entregue à aplicação (bloqueio de cabeça de fila). */
  esperaTcp: number;
  esperaQuic: number;
  perdas: number;
  retransmissoes: number;
  linhas: string[];
}

/**
 * Vários objetos na mesma conexão, com os segmentos intercalados (como no HTTP/2). Roda o motor do TCP uma vez:
 * no TCP a aplicação só recebe em ordem, então uma perda segura todo o resto; no QUIC cada fluxo tem a sua
 * ordem, e o objeto que não perdeu nada fica pronto assim que os segmentos dele chegam.
 */
export function compararCabecaDeFila(o: { objetos: number; bytesPorObjeto: number; gargalo: Gargalo; perdas?: number[]; config?: Partial<ConfigTcp>; semente?: number }): ResultadoCabecaDeFila {
  const mss = o.config?.mss ?? 1460;
  const spo = Math.max(1, Math.ceil(o.bytesPorObjeto / mss));
  const total = spo * o.objetos * mss;
  const r = simularTcp([{ bytes: total, config: { janelaInicial: 10, ...(o.config ?? {}) }, perdas: o.perdas }], o.gargalo, { semente: o.semente });
  const f = r.fluxos[0]!;
  const tcp: number[] = new Array(o.objetos).fill(0);
  const quic: number[] = new Array(o.objetos).fill(0);
  const nSeg = spo * o.objetos;
  for (let k = 0; k < nSeg; k++) {
    const obj = k % o.objetos;
    tcp[obj] = Math.max(tcp[obj]!, f.entregas[k] ?? Infinity);
    quic[obj] = Math.max(quic[obj]!, f.chegadas[k] ?? Infinity);
  }
  const travados = tcp.filter((t, j) => t - quic[j]! > 1e-4).length;
  // Espera de cada segmento entre chegar e ser entregue: no TCP, até tudo antes dele chegar; no QUIC, só o que é do mesmo fluxo.
  let somaTcp = 0;
  let somaQuic = 0;
  let n = 0;
  const prontoFluxo: number[] = new Array(o.objetos).fill(0);
  for (let k = 0; k < nSeg; k++) {
    const ch = f.chegadas[k];
    const en = f.entregas[k];
    if (ch === undefined || en === undefined) continue;
    const obj = k % o.objetos;
    prontoFluxo[obj] = Math.max(prontoFluxo[obj]!, ch);
    somaTcp += en - ch;
    somaQuic += prontoFluxo[obj]! - ch;
    n++;
  }
  const esperaTcp = n ? somaTcp / n : 0;
  const esperaQuic = n ? somaQuic / n : 0;
  const ms = (s: number) => (Number.isFinite(s) ? `${(s * 1000).toFixed(1)} ms` : 'não chegou');
  const linhas = [
    `${o.objetos} objetos de ${spo} segmento(s) cada, intercalados na mesma conexão. Mesma rede e mesmas perdas (${r.perdasFila + r.perdasAleatorias + (o.perdas?.length ?? 0)}) para os dois.`,
    'OBJETO   TCP (um fluxo de bytes)   QUIC (fluxos independentes)',
    ...tcp.map((t, j) => `  ${String(j + 1).padEnd(7)}${ms(t).padEnd(26)}${ms(quic[j]!)}${t - quic[j]! > 1e-4 ? '   ← esperou a perda de outro objeto' : ''}`),
    `Espera média de um segmento entre chegar e a aplicação poder usar: TCP ${ms(esperaTcp)}, QUIC ${ms(esperaQuic)}.`,
    travados
      ? `${travados} objeto(s) ficaram presos no TCP por bloqueio de cabeça de fila: o byte perdido estava antes deles no fluxo único, e o TCP só entrega em ordem.`
      : 'Nenhum objeto travou: sem perda (ou com a perda no último objeto) os dois empatam.',
  ];
  return { objetos: o.objetos, segmentosPorObjeto: spo, tcp, quic, travadosNoTcp: travados, esperaTcp, esperaQuic, perdas: r.perdasFila + r.perdasAleatorias + (o.perdas?.length ?? 0), retransmissoes: f.retransmissoes, linhas };
}

export interface ResultadoMigracao {
  /** Tempo parado depois da troca de endereço, até voltar a receber dados. */
  paradoTcp: number;
  paradoQuic: number;
  /** Tempo para terminar o que faltava, contando a interrupção. */
  restoTcp: number;
  restoQuic: number;
  idConexao: string;
  linhas: string[];
}

/**
 * O celular sai do Wi-Fi e entra na rede móvel: o IP muda no meio da transferência. O TCP identifica a conexão pela
 * quádrupla (IPs e portas), então ela morre: RST, nova conexão, novo TLS e partida lenta. O QUIC identifica pelo
 * identificador de conexão: o servidor reconhece, valida o caminho novo (PATH_CHALLENGE e PATH_RESPONSE) e segue.
 */
export function simularMigracao(o: { rtt: number; gargalo: Gargalo; bytesRestantes: number; ipAntigo: string; ipNovo: string; idConexao?: string }): ResultadoMigracao {
  const id = o.idConexao ?? '8394c8f03e515708';
  const rtt = o.rtt;
  // TCP: o próximo segmento sai do IP novo; o servidor não tem soquete para essa quádrupla e responde RST (1 RTT).
  // Aí: aperto de mão (1 RTT) + TLS 1.3 (1 RTT) + pedido do resto (1 RTT até o primeiro byte), e partida lenta do zero.
  const paradoTcp = 4 * rtt;
  // QUIC: o pacote seguinte já vai do IP novo com o mesmo identificador; o servidor manda PATH_CHALLENGE, o cliente
  // responde PATH_RESPONSE (1 RTT). O controle de congestionamento recomeça no caminho novo (pode ser outra rede).
  const paradoQuic = rtt;
  const resto = simularTcp([{ bytes: o.bytesRestantes, config: { janelaInicial: 10 } }], o.gargalo).fluxos[0]!.duracao;
  const linhas = [
    `t = 0: o endereço muda de ${o.ipAntigo} para ${o.ipNovo}.`,
    'TCP: a conexão é a quádrupla (IP e porta de cada lado). Com IP novo, o servidor não tem soquete para essa quádrupla:',
    `  ${(rtt * 1000).toFixed(1)} ms: o servidor responde RST; a aplicação precisa abrir outra conexão`,
    `  ${(2 * rtt * 1000).toFixed(1)} ms: aperto de mão em três vias de novo`,
    `  ${(3 * rtt * 1000).toFixed(1)} ms: TLS de novo`,
    `  ${(4 * rtt * 1000).toFixed(1)} ms: pede o resto (se a aplicação souber pedir a partir de onde parou) e recomeça a partida lenta`,
    `QUIC: a conexão é o identificador ${id}, que vai em todo pacote, e não o endereço:`,
    `  ${(rtt * 1000).toFixed(1)} ms: o servidor reconhece o identificador vindo de ${o.ipNovo}, manda PATH_CHALLENGE e recebe PATH_RESPONSE; a conexão segue, com a janela recomeçando no caminho novo`,
    `Parado: TCP ${(paradoTcp * 1000).toFixed(1)} ms, QUIC ${(paradoQuic * 1000).toFixed(1)} ms. Para terminar ${o.bytesRestantes} bytes: TCP ${((paradoTcp + resto) * 1000).toFixed(1)} ms, QUIC ${((paradoQuic + resto) * 1000).toFixed(1)} ms.`,
    'O identificador muda a cada caminho novo (o cliente tem uma lista combinada com o servidor), para quem olha a rede não ligar o Wi-Fi à rede móvel.',
  ];
  return { paradoTcp, paradoQuic, restoTcp: paradoTcp + resto, restoQuic: paradoQuic + resto, idConexao: id, linhas };
}
