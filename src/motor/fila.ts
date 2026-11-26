// Fila de saída de uma porta de roteador e congestionamento (ato 4), parte pura.
// Uma porta com fontes de tráfego (taxa, tamanho de pacote, rajadas), capacidade do enlace e buffer em pacotes,
// simulada pacote a pacote no simulador de eventos discretos. As fontes que respondem são TCP em laço fechado
// (janela, confirmações, perda e ECN); as outras mandam sem controle. Mede atraso médio, variação do atraso
// (jitter), ocupação, perdas e a sincronização das fontes. Técnicas: descarte no fim da fila, RED, marcação ECN, controle de admissão,
// sinal de volta para a origem (choke packet) e descarte de carga (load shedding) pelo menos importante.
// Nada aqui conhece o mundo do jogo: entra configuração, sai número. O console fica em cliQos.ts.

import { SimuladorHeap } from './eventos';
import { rngSemente } from './util';

export interface FonteTrafego {
  nome: string;
  /** Taxa média oferecida, em Mb/s. */
  mbps: number;
  /** Bytes por pacote (padrão 1000). */
  tamanho?: number;
  /** Pacotes que chegam juntos em cada rajada (padrão 1: chegadas soltas, de Poisson). Só na fonte que não responde. */
  rajada?: number;
  /** Importância para o descarte de carga: maior é mais importante (padrão 1). */
  importancia?: number;
  /** O TCP da fonte entende ECN (padrão sim). Se não entende, o RED descarta em vez de marcar. */
  ecn?: boolean;
  /**
   * A fonte é TCP e responde ao congestionamento: perda, eco do ECN e choke packet reduzem a janela. Padrão sim.
   * Com "não", ela manda na taxa pedida aconteça o que acontecer (UDP sem controle), e a taxa é a oferecida.
   * No TCP, a taxa pedida é o teto do acesso da fonte: a janela decide quanto dela sai de fato.
   */
  responde?: boolean;
  /** Classe DSCP do tráfego (só informativa aqui; o escalonador usa). */
  classe?: string;
}

export interface ConfigRed {
  /** Limiar mínimo da média da fila, em pacotes: abaixo dele nada é descartado. */
  min: number;
  /** Limiar máximo: acima dele, tudo que chega é descartado. */
  max: number;
  /** Probabilidade de descarte quando a média encosta no máximo (padrão 0,1). */
  pmax?: number;
}

export interface ConfigFila {
  /** Quantos pacotes cabem esperando (o que está sendo transmitido não conta). */
  buffer: number;
  red?: ConfigRed;
  /** Marca o pacote (bits ECN do cabeçalho IP) em vez de descartar, quando a fonte entende. */
  ecn?: boolean;
  /** Choke packet: com a fila passando de 3/4 do buffer, o roteador manda um aviso direto para a origem. */
  choke?: boolean;
  /** Descarte de carga: com o buffer cheio, joga fora o pacote menos importante que está na fila. */
  descarte?: boolean;
  /** Controle de admissão: aceita fluxos novos só enquanto a soma das taxas cabe nesta fração da capacidade. */
  admissao?: number;
  /** Capacidade do enlace em Mb/s; sem isso, a velocidade do enlace da porta. */
  capacidade?: number;
}

export const BUFFER_PADRAO = 64;
export const TAMANHO_PADRAO = 1000;

export interface ResultadoFonte {
  nome: string;
  admitida: boolean;
  /** A fonte é TCP em laço fechado (responde aos sinais); se não, manda na taxa pedida aconteça o que acontecer. */
  tcp: boolean;
  /** Pacotes que chegaram à fila (no TCP, contando as retransmissões). */
  enviados: number;
  entregues: number;
  perdidos: number;
  marcados: number;
  /** Reduções da janela por sinal explícito: eco do ECN ou choke packet. */
  sinais: number;
  /** Reduções da janela por perda percebida em três ACKs duplicados (retransmissão rápida). */
  recuos: number;
  /** Vezes que o temporizador de retransmissão venceu (a janela volta a 1). */
  expiracoes: number;
  /** Pacotes mandados de novo. */
  retransmitidos: number;
  atrasoMedio: number;
  /** Vazão útil: dado novo que chegou ao destino (retransmissão de dado que já tinha chegado não conta). */
  vazaoMbps: number;
  /** Fração da taxa pedida que a fonte conseguia no último quarto da simulação (1 é a taxa toda). */
  fatorFinal: number;
  /** Janela de congestionamento média do TCP, em pacotes (0 para fonte sem controle). */
  janelaMedia: number;
}

export interface ResultadoFila {
  capacidadeMbps: number;
  /** Carga oferecida pelas fontes admitidas, em fração da capacidade. */
  carga: number;
  enviados: number;
  entregues: number;
  /** Perdas por buffer cheio (descarte no fim da fila). */
  perdasBuffer: number;
  /** Perdas antecipadas do RED. */
  perdasRed: number;
  /** Pacotes jogados fora pelo descarte de carga (estavam na fila e eram menos importantes). */
  perdasDescarte: number;
  perdas: number;
  /** Fração dos enviados que se perdeu. */
  taxaPerda: number;
  marcadosEcn: number;
  /** Choke packets mandados de volta. */
  sinais: number;
  /** Fontes recusadas pelo controle de admissão. */
  recusadas: string[];
  /** Segundos: espera na fila mais a transmissão. */
  atrasoMedio: number;
  /** Desvio padrão do atraso, em segundos. */
  jitter: number;
  atrasoMax: number;
  /** Pacotes esperando, em média no tempo. */
  ocupacaoMedia: number;
  ocupacaoMax: number;
  /** Fração do tempo em que o enlace transmitiu. */
  utilizacao: number;
  /** Atraso que o buffer cheio impõe: buffer × tempo de transmissão de um pacote. */
  atrasoBufferCheio: number;
  duracao: number;
  /** Ida e volta sem fila entre as fontes TCP e o destino, em segundos. */
  rtt: number;
  /** Reduções de janela das fontes TCP, somando perda, expiração e sinal. */
  reducoes: number;
  /**
   * Sincronização global: em cada episódio de congestionamento (as reduções de janela até uma ida e volta depois da
   * primeira, fora o fim da partida lenta), que fração das fontes TCP que disputam a porta reduziu
   * junto; a média dos episódios. 1 é todo mundo junto (o buffer cheio pega todas de uma vez); 1/n é cada uma na
   * sua hora. Com menos de duas fontes disputando, null.
   */
  sincronia: number | null;
  porFonte: ResultadoFonte[];
}

export interface OpcoesFila {
  /** Capacidade do enlace em Mb/s (vale mais que a da configuração, se vier). */
  capacidadeMbps: number;
  /** Quantos tempos de pacote simular (padrão 25000: uns 600 RTTs, para o temporizador de 200 ms caber várias vezes). */
  pacotes?: number;
  semente?: number;
  /** Ida e volta sem fila das fontes TCP até o destino, em segundos. Padrão: 40 tempos de pacote. */
  rtt?: number;
}

/** Janela anunciada pelo receptor: 65535 bytes, o máximo sem a opção de escala de janela (RFC 7323). */
export const JANELA_RECEPTOR_BYTES = 65535;
/** Piso do temporizador de retransmissão. A RFC 6298 pede 1 s; 200 ms é o que o Linux usa. */
export const RTO_MIN_S = 0.2;
/** Temporizador antes da primeira medida de ida e volta (RFC 6298, 2.1). */
export const RTO_INICIAL_S = 1;
/** Peso da média móvel da fila no RED (Floyd e Jacobson, 1993). */
export const PESO_RED = 0.002;

interface NaFila {
  fonte: number;
  chegada: number;
  bytes: number;
  importancia: number;
  marcado: boolean;
  /** O transporte entende ECN (ECT no cabeçalho IP): pode ser marcado em vez de descartado. */
  ect: boolean;
  seq: number;
  /** Bit CWR do TCP: a origem avisa que já reduziu a janela (RFC 3168, 6.1.2). */
  cwr: boolean;
}

/** Quais fontes o controle de admissão deixa entrar, na ordem em que pediram. */
export function admitir(fontes: FonteTrafego[], capacidadeMbps: number, limite?: number): { aceitas: FonteTrafego[]; recusadas: FonteTrafego[] } {
  if (limite === undefined) return { aceitas: [...fontes], recusadas: [] };
  const aceitas: FonteTrafego[] = [];
  const recusadas: FonteTrafego[] = [];
  let soma = 0;
  for (const f of fontes) {
    if (soma + f.mbps <= limite * capacidadeMbps + 1e-9) {
      aceitas.push(f);
      soma += f.mbps;
    } else recusadas.push(f);
  }
  return { aceitas, recusadas };
}

/** Probabilidade básica de descarte (ou marcação) do RED para uma média de fila, antes da correção pela contagem. */
export function probRed(red: ConfigRed, media: number): number {
  if (media < red.min) return 0;
  if (media >= red.max) return 1;
  return (red.pmax ?? 0.1) * ((media - red.min) / (red.max - red.min));
}

/** Janela inicial do TCP em segmentos (RFC 3390): min(4·MSS, max(2·MSS, 4380 bytes)). */
export function janelaInicial(mss: number): number {
  return Math.max(1, Math.floor(Math.min(4 * mss, Math.max(2 * mss, 4380)) / mss));
}

/**
 * Simula a porta de saída pacote a pacote. A porta transmite um pacote de cada vez, na ordem de chegada; quem chega
 * com o buffer cheio é descartado (ou, com descarte de carga, derruba alguém menos importante). Com RED, a média
 * móvel da fila decide descartes antecipados; com ECN, o pacote de quem entende ECN é marcado em vez de descartado.
 *
 * Fonte que responde é TCP em laço fechado (RFC 5681, com a recuperação NewReno da RFC 6582): a janela começa em
 * 2 a 4 pacotes (RFC 3390), dobra a cada ida e volta na partida lenta e cresce 1 pacote por ida e volta depois do
 * limiar (aumento aditivo). A perda é percebida pelo destino, que confirma sempre o próximo pacote que espera: três
 * confirmações repetidas fazem a origem retransmitir e cortar a janela pela metade (redução multiplicativa); se nem
 * isso chega, o temporizador de retransmissão (RFC 6298) vence e a janela volta a 1. Pacote marcado com ECN chega;
 * o destino liga o ECE nas confirmações até a origem responder com CWR, e a origem corta a janela pela metade no
 * máximo uma vez por janela de dados (RFC 3168). O choke packet é a velha "redução da fonte" do ICMP (RFC 792): a
 * origem reage como o RFC 1122, seção 4.2.3.9, manda, voltando à partida lenta, também uma vez por janela.
 * A taxa pedida da fonte é o teto do acesso dela: mesmo com janela sobrando, não sai mais rápido que isso.
 *
 * Fonte que não responde (responde: false) manda rajadas com intervalos exponenciais (chegadas de Poisson) na taxa
 * pedida, aconteça o que acontecer: é o tráfego sem controle de congestionamento, como vídeo sobre UDP.
 *
 * Declarado: o destino confirma cada pacote (sem a confirmação atrasada), sem SACK; a ida e volta sem fila é a
 * mesma para todas as fontes; a confirmação nunca se perde (a volta não tem fila).
 */
export function simularFila(cfg: ConfigFila, fontesPedidas: FonteTrafego[], o: OpcoesFila): ResultadoFila {
  const cap = (o.capacidadeMbps > 0 ? o.capacidadeMbps : (cfg.capacidade ?? 100)) * 1e6;
  const rng = rngSemente(o.semente ?? 4242);
  const { aceitas, recusadas } = admitir(fontesPedidas, cap / 1e6, cfg.admissao);
  const fontes = aceitas.map((f) => ({ ...f, tamanho: f.tamanho ?? TAMANHO_PADRAO, rajada: Math.max(1, Math.round(f.rajada ?? 1)), importancia: f.importancia ?? 1, tcp: f.responde !== false }));
  const tamMedio = fontes.length ? fontes.reduce((s, f) => s + f.tamanho * f.mbps, 0) / Math.max(1e-9, fontes.reduce((s, f) => s + f.mbps, 0)) : TAMANHO_PADRAO;
  const tPacote = (tamMedio * 8) / cap;
  const duracao = (o.pacotes ?? 25000) * tPacote;
  const rtt = o.rtt ?? 40 * tPacote;
  const buffer = Math.max(0, Math.floor(cfg.buffer));
  const sim = new SimuladorHeap();
  const fila: NaFila[] = [];
  let ocupado = false;
  let ocupadoDesde = 0;
  let tempoOcupado = 0;
  let area = 0;
  let ultimoT = 0;
  let ocupacaoMax = 0;
  let mediaRed = 0;
  let contaRed = -1;
  let ociosaDesde = 0;
  const atrasos: number[] = [];
  const reducoes: { t: number; fonte: number }[] = [];
  const st = fontes.map((f) => ({
    enviados: 0,
    entregues: 0,
    perdidos: 0,
    marcados: 0,
    sinais: 0,
    recuos: 0,
    expiracoes: 0,
    retransmitidos: 0,
    somaAtraso: 0,
    bytes: 0,
    bytesFinal: 0,
    ultimoChoke: -Infinity,
    // TCP: janela, limiar e números de sequência em pacotes.
    cwnd: janelaInicial(f.tamanho),
    ssthresh: Math.max(2, Math.floor(JANELA_RECEPTOR_BYTES / f.tamanho)),
    rwnd: Math.max(2, Math.floor(JANELA_RECEPTOR_BYTES / f.tamanho)),
    proximo: 0,
    una: 0,
    dupacks: 0,
    recuperando: false,
    recover: -1,
    /** Até onde uma redução já vale: sinal ou perda dentro desta janela não corta de novo (RFC 3168, 6.1.2). */
    reduzidoAte: -1,
    cwrPendente: false,
    reenviar: [] as number[],
    enviadoEm: new Map<number, number>(),
    srtt: 0,
    rttvar: 0,
    rto: RTO_INICIAL_S,
    geracaoRto: 0,
    rtoLigado: false,
    acessoLivre: 0,
    maiorEnviado: 0,
    bombeando: false,
    somaJanela: 0,
    ultimoJanela: 0,
    // Destino.
    esperado: 0,
    foraDeOrdem: new Set<number>(),
    ece: false,
  }));
  const r: Omit<ResultadoFila, 'porFonte' | 'atrasoMedio' | 'jitter' | 'atrasoMax' | 'ocupacaoMedia' | 'ocupacaoMax' | 'utilizacao' | 'taxaPerda' | 'perdas' | 'reducoes' | 'sincronia'> = {
    capacidadeMbps: cap / 1e6,
    carga: fontes.reduce((s, f) => s + f.mbps, 0) / (cap / 1e6),
    enviados: 0,
    entregues: 0,
    perdasBuffer: 0,
    perdasRed: 0,
    perdasDescarte: 0,
    marcadosEcn: 0,
    sinais: 0,
    recusadas: recusadas.map((f) => f.nome),
    atrasoBufferCheio: buffer * tPacote,
    duracao,
    rtt,
  };

  const contar = () => {
    area += fila.length * (sim.agora - ultimoT);
    ultimoT = sim.agora;
  };

  /* ----- TCP: origem ----- */
  const janela = (i: number) => {
    const s = st[i]!;
    s.somaJanela += s.cwnd * (Math.min(sim.agora, duracao) - s.ultimoJanela);
    s.ultimoJanela = Math.min(sim.agora, duracao);
  };
  const armarRto = (i: number) => {
    const s = st[i]!;
    const g = ++s.geracaoRto;
    s.rtoLigado = true;
    sim.agendar(s.rto, () => {
      if (g !== s.geracaoRto) return;
      s.rtoLigado = false;
      if (s.una >= s.proximo) return;
      expirou(i);
    });
  };
  const desarmarRto = (i: number) => {
    st[i]!.geracaoRto++;
    st[i]!.rtoLigado = false;
  };
  const reduzir = (i: number, tipo: 'perda' | 'expirou' | 'sinal' | 'quench') => {
    const s = st[i]!;
    janela(i);
    const emVoo = s.proximo - s.una;
    s.ssthresh = Math.max(emVoo / 2, 2);
    if (tipo === 'perda') s.cwnd = s.ssthresh + 3;
    else if (tipo === 'sinal') s.cwnd = s.ssthresh;
    else s.cwnd = 1;
    s.reduzidoAte = s.proximo - 1;
    if (sim.agora <= duracao) reducoes.push({ t: sim.agora, fonte: i });
  };
  const expirou = (i: number) => {
    const s = st[i]!;
    reduzir(i, 'expirou');
    s.expiracoes++;
    s.dupacks = 0;
    s.recuperando = false;
    // Volta a mandar a partir do primeiro sem confirmação; tudo daí em diante é retransmissão (algoritmo de Karn).
    s.enviadoEm.clear();
    s.proximo = s.una;
    s.reenviar = [];
    s.rto = Math.min(60, s.rto * 2);
    armarRto(i);
    bombear(i);
  };
  const podeMandar = (i: number) => {
    const s = st[i]!;
    if (s.reenviar.length) return true;
    const emVoo = s.proximo - s.una;
    return emVoo < Math.floor(s.cwnd) && emVoo < s.rwnd;
  };
  const bombear = (i: number) => {
    const s = st[i]!;
    if (s.bombeando || sim.agora > duracao || !podeMandar(i)) return;
    s.bombeando = true;
    sim.agendar(Math.max(0, s.acessoLivre - sim.agora), () => emitir(i));
  };
  const emitir = (i: number) => {
    const f = fontes[i]!;
    const s = st[i]!;
    s.bombeando = false;
    if (sim.agora > duracao || !podeMandar(i)) return;
    let seq: number;
    let retrans = false;
    while (s.reenviar.length && s.reenviar[0]! < s.una) s.reenviar.shift();
    if (s.reenviar.length) {
      seq = s.reenviar.shift()!;
      retrans = true;
    } else {
      seq = s.proximo++;
      if (s.enviadoEm.has(seq) || seq < s.maiorEnviado) retrans = true;
    }
    if (retrans) {
      s.retransmitidos++;
      s.enviadoEm.delete(seq);
    } else s.enviadoEm.set(seq, sim.agora);
    s.maiorEnviado = Math.max(s.maiorEnviado, seq + 1);
    const cwr = s.cwrPendente && !retrans;
    if (cwr) s.cwrPendente = false;
    s.acessoLivre = sim.agora + (f.tamanho * 8) / (f.mbps * 1e6);
    const pkt: NaFila = { fonte: i, chegada: 0, bytes: f.tamanho, importancia: f.importancia, marcado: false, ect: f.ecn !== false, seq, cwr };
    sim.agendar(rtt / 4, () => chegar(pkt));
    if (!s.rtoLigado) armarRto(i);
    bombear(i);
  };
  const medirRtt = (i: number, amostra: number) => {
    const s = st[i]!;
    if (!s.srtt) {
      s.srtt = amostra;
      s.rttvar = amostra / 2;
    } else {
      s.rttvar = 0.75 * s.rttvar + 0.25 * Math.abs(s.srtt - amostra);
      s.srtt = 0.875 * s.srtt + 0.125 * amostra;
    }
    s.rto = Math.min(60, Math.max(RTO_MIN_S, s.srtt + Math.max(1e-6, 4 * s.rttvar)));
  };
  const receberAck = (i: number, ack: number, ece: boolean) => {
    const s = st[i]!;
    if (ack > s.una) {
      const t0 = s.enviadoEm.get(ack - 1);
      if (t0 !== undefined) medirRtt(i, sim.agora - t0);
      for (const k of [...s.enviadoEm.keys()]) if (k < ack) s.enviadoEm.delete(k);
      const novos = ack - s.una;
      s.una = ack;
      if (s.proximo < s.una) s.proximo = s.una;
      janela(i);
      if (s.recuperando) {
        if (ack > s.recover) {
          // Confirmação completa: sai da recuperação rápida com a janela no limiar (RFC 6582, 3.2, passo 3).
          s.cwnd = s.ssthresh;
          s.recuperando = false;
          s.dupacks = 0;
        } else {
          // Confirmação parcial: outro buraco na mesma janela; retransmite já, sem cortar de novo (NewReno).
          s.reenviar.push(ack);
          s.cwnd = Math.max(1, s.cwnd - novos + 1);
        }
      } else {
        s.dupacks = 0;
        // A janela só cresce quando está sendo usada; fonte limitada pelo acesso não acumula janela (RFC 7661).
        if (s.proximo - s.una + novos >= Math.floor(s.cwnd)) {
          if (s.cwnd < s.ssthresh) s.cwnd += 1;
          else s.cwnd += 1 / s.cwnd;
        }
      }
      if (s.una < s.proximo) armarRto(i);
      else desarmarRto(i);
    } else if (ack === s.una && s.proximo > s.una) {
      s.dupacks++;
      if (!s.recuperando && s.dupacks === 3 && ack > s.recover) {
        // Três duplicados: retransmissão rápida e recuperação rápida (RFC 5681, 3.2).
        reduzir(i, 'perda');
        s.recuos++;
        s.recover = s.proximo - 1;
        s.recuperando = true;
        s.enviadoEm.delete(ack);
        s.reenviar.push(ack);
      } else if (s.recuperando) {
        janela(i);
        s.cwnd += 1;
      }
    }
    // Eco do ECN: no máximo uma redução por janela de dados, e nunca durante a recuperação de uma perda.
    if (ece && !s.recuperando && s.una > s.reduzidoAte) {
      reduzir(i, 'sinal');
      s.sinais++;
      s.cwrPendente = true;
    }
    bombear(i);
  };
  const chokeChegou = (i: number) => {
    const s = st[i]!;
    if (s.recuperando || s.una <= s.reduzidoAte) return;
    reduzir(i, 'quench');
    s.sinais++;
    bombear(i);
  };

  /* ----- TCP: destino ----- */
  const entregar = (p: NaFila) => {
    const s = st[p.fonte]!;
    const f = fontes[p.fonte]!;
    if (!f.tcp) return;
    if (p.cwr) s.ece = false;
    if (p.marcado) s.ece = true;
    const novo = p.seq >= s.esperado && !s.foraDeOrdem.has(p.seq);
    if (novo && sim.agora <= duracao) {
      s.bytes += p.bytes;
      if (sim.agora > 0.75 * duracao) s.bytesFinal += p.bytes;
    }
    if (p.seq === s.esperado) {
      s.esperado++;
      while (s.foraDeOrdem.delete(s.esperado)) s.esperado++;
    } else if (p.seq > s.esperado) s.foraDeOrdem.add(p.seq);
    const ack = s.esperado;
    const ece = s.ece;
    sim.agendar(rtt / 2, () => receberAck(p.fonte, ack, ece));
  };

  /* ----- A porta ----- */
  const transmitir = () => {
    if (ocupado || !fila.length) return;
    const p = fila.shift()!;
    contar();
    ocupado = true;
    ocupadoDesde = sim.agora;
    sim.agendar((p.bytes * 8) / cap, () => {
      contar();
      ocupado = false;
      tempoOcupado += sim.agora - ocupadoDesde;
      if (!fila.length) ociosaDesde = sim.agora;
      const atraso = sim.agora - p.chegada;
      atrasos.push(atraso);
      const s = st[p.fonte]!;
      s.entregues++;
      s.somaAtraso += atraso;
      if (!fontes[p.fonte]!.tcp && sim.agora <= duracao) {
        s.bytes += p.bytes;
        if (sim.agora > 0.75 * duracao) s.bytesFinal += p.bytes;
      }
      r.entregues++;
      sim.agendar(rtt / 4, () => entregar(p));
      transmitir();
    });
  };
  const perder = (p: NaFila, tipo: 'buffer' | 'red' | 'descarte') => {
    st[p.fonte]!.perdidos++;
    if (tipo === 'buffer') r.perdasBuffer++;
    else if (tipo === 'red') r.perdasRed++;
    else r.perdasDescarte++;
  };
  const chegar = (pkt: NaFila) => {
    const s = st[pkt.fonte]!;
    pkt.chegada = sim.agora;
    s.enviados++;
    r.enviados++;
    if (cfg.red) {
      // Média móvel da fila; com a fila vazia, a média decai como se chegassem pacotes de tamanho zero (Floyd e Jacobson).
      if (!fila.length && !ocupado) mediaRed *= Math.pow(1 - PESO_RED, (sim.agora - ociosaDesde) / tPacote);
      else mediaRed = (1 - PESO_RED) * mediaRed + PESO_RED * fila.length;
      const pb = probRed(cfg.red, mediaRed);
      if (mediaRed >= cfg.red.max) {
        // Acima do máximo, descarta mesmo quem entende ECN (RFC 3168, seção 7).
        contaRed = 0;
        perder(pkt, 'red');
        return;
      }
      if (pb > 0) {
        // A contagem desde o último sorteado espalha os descartes por igual, em vez de em rajadas.
        contaRed++;
        const pa = contaRed * pb >= 1 ? 1 : pb / (1 - contaRed * pb);
        if (rng() < pa) {
          contaRed = 0;
          if (cfg.ecn && pkt.ect) pkt.marcado = true;
          else {
            perder(pkt, 'red');
            return;
          }
        }
      } else contaRed = -1;
    } else if (cfg.ecn && pkt.ect && fila.length >= Math.max(1, buffer / 2)) {
      // Sem RED, a marcação vale a partir da metade do buffer: um limiar fixo, como o K do DCTCP (RFC 8257).
      pkt.marcado = true;
    }
    if (cfg.choke && fila.length >= Math.max(1, (3 * buffer) / 4) && sim.agora - s.ultimoChoke >= rtt) {
      s.ultimoChoke = sim.agora;
      r.sinais++;
      if (fontes[pkt.fonte]!.tcp) sim.agendar(rtt / 4, () => chokeChegou(pkt.fonte));
    }
    if (!ocupado && !fila.length) {
      fila.push(pkt);
      if (pkt.marcado) (r.marcadosEcn++, s.marcados++);
      transmitir();
      return;
    }
    if (fila.length >= buffer) {
      if (cfg.descarte && fila.length) {
        // O menos importante; no empate, o que chegou por último (o mais novo vale menos para quem já esperou).
        let k = -1;
        for (let j = 0; j < fila.length; j++) if (fila[j]!.importancia < pkt.importancia && (k < 0 || fila[j]!.importancia <= fila[k]!.importancia)) k = j;
        if (k >= 0) {
          const fora = fila.splice(k, 1)[0]!;
          perder(fora, 'descarte');
          if (fora.marcado) (r.marcadosEcn--, st[fora.fonte]!.marcados--);
        } else {
          perder(pkt, 'buffer');
          return;
        }
      } else {
        perder(pkt, 'buffer');
        return;
      }
    }
    contar();
    fila.push(pkt);
    if (pkt.marcado) (r.marcadosEcn++, s.marcados++);
    ocupacaoMax = Math.max(ocupacaoMax, fila.length);
  };

  // Partida: TCP começa a mandar a janela inicial; quem não responde agenda a primeira rajada.
  fontes.forEach((f, i) => {
    if (f.mbps <= 0) return;
    if (f.tcp) {
      bombear(i);
      return;
    }
    const pps = (f.mbps * 1e6) / (f.tamanho * 8);
    const proxima = () => {
      const intervalo = -Math.log(1 - rng()) / (pps / f.rajada);
      sim.agendar(intervalo, () => {
        if (sim.agora > duracao) return;
        for (let k = 0; k < f.rajada; k++) chegar({ fonte: i, chegada: 0, bytes: f.tamanho, importancia: f.importancia, marcado: false, ect: false, seq: 0, cwr: false });
        proxima();
      });
    };
    proxima();
  });
  // Depois do fim, ninguém manda dado novo; deixa a fila esvaziar e as confirmações voltarem.
  sim.rodar(1e7, duracao + 2 * rtt + buffer * tPacote);
  for (let i = 0; i < fontes.length; i++) if (fontes[i]!.tcp) janela(i);
  const n = atrasos.length;
  const media = n ? atrasos.reduce((s, x) => s + x, 0) / n : 0;
  const desvio = n > 1 ? Math.sqrt(atrasos.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1)) : 0;
  const perdas = r.perdasBuffer + r.perdasRed + r.perdasDescarte;
  const fim = Math.max(sim.agora, duracao);
  // Sincronização. A primeira redução de cada fonte é o fim da partida lenta, que todas fazem juntas de qualquer
  // jeito: fica de fora. O resto vira episódios: as reduções até uma ida e volta depois da primeira do episódio.
  // Só contam as fontes que reduziram alguma vez (fonte presa no próprio acesso nunca disputa a porta).
  const jaViu = new Set<number>();
  const depois = reducoes.filter((x) => (jaViu.has(x.fonte) ? true : (jaViu.add(x.fonte), false)));
  const disputam = new Set(depois.map((x) => x.fonte)).size;
  let sincronia: number | null = null;
  if (disputam >= 2) {
    const episodios: Set<number>[] = [];
    let comeco = -Infinity;
    for (const x of depois) {
      if (x.t - comeco > rtt + buffer * tPacote) {
        episodios.push(new Set());
        comeco = x.t;
      }
      episodios.at(-1)!.add(x.fonte);
    }
    sincronia = episodios.reduce((s, e) => s + e.size / disputam, 0) / episodios.length;
  }
  return {
    ...r,
    perdas,
    taxaPerda: r.enviados ? perdas / r.enviados : 0,
    atrasoMedio: media,
    jitter: desvio,
    atrasoMax: n ? Math.max(...atrasos) : 0,
    ocupacaoMedia: fim > 0 ? area / fim : 0,
    ocupacaoMax,
    utilizacao: fim > 0 ? tempoOcupado / fim : 0,
    reducoes: reducoes.length,
    sincronia,
    porFonte: [
      ...fontes.map((f, i) => {
        const s = st[i]!;
        const pedido = f.mbps * 1e6;
        return {
          nome: f.nome,
          admitida: true,
          tcp: f.tcp,
          enviados: s.enviados,
          entregues: s.entregues,
          perdidos: s.perdidos,
          marcados: s.marcados,
          sinais: s.sinais,
          recuos: s.recuos,
          expiracoes: s.expiracoes,
          retransmitidos: s.retransmitidos,
          atrasoMedio: s.entregues ? s.somaAtraso / s.entregues : 0,
          vazaoMbps: (s.bytes * 8) / duracao / 1e6,
          fatorFinal: f.tcp ? Math.min(1, (s.bytesFinal * 8) / (0.25 * duracao) / pedido) : 1,
          janelaMedia: f.tcp ? s.somaJanela / duracao : 0,
        };
      }),
      ...recusadas.map((f) => ({ nome: f.nome, admitida: false, tcp: f.responde !== false, enviados: 0, entregues: 0, perdidos: 0, marcados: 0, sinais: 0, recuos: 0, expiracoes: 0, retransmitidos: 0, atrasoMedio: 0, vazaoMbps: 0, fatorFinal: 0, janelaMedia: 0 })),
    ],
  };
}

/** Fonte única de Poisson, sem controle de congestionamento, que oferece "carga" (fração da capacidade). É a da teoria de filas. */
export function fonteDeCarga(carga: number, capacidadeMbps: number, tamanho = TAMANHO_PADRAO): FonteTrafego {
  return { nome: 'tráfego', mbps: carga * capacidadeMbps, tamanho, responde: false };
}

/** Escala as fontes para que a soma ofereça "carga" da capacidade, mantendo a proporção entre elas. */
export function escalarFontes(fontes: FonteTrafego[], carga: number, capacidadeMbps: number): FonteTrafego[] {
  const soma = fontes.reduce((s, f) => s + f.mbps, 0);
  if (!soma) return fontes.map((f) => ({ ...f }));
  return fontes.map((f) => ({ ...f, mbps: (f.mbps / soma) * carga * capacidadeMbps }));
}

/**
 * Atraso médio teórico de uma fila com chegadas de Poisson e pacotes de tamanho fixo (M/D/1), buffer infinito:
 * W = T + ρT / (2(1 - ρ)), com T o tempo de transmissão de um pacote. Explode quando ρ chega perto de 1.
 */
export function atrasoMD1(carga: number, tPacote: number): number {
  if (carga >= 1) return Infinity;
  return tPacote + (carga * tPacote) / (2 * (1 - carga));
}

export interface PontoCurva {
  carga: number;
  atrasoMedio: number;
  teorico: number;
  jitter: number;
  taxaPerda: number;
}

/** A curva carga × atraso: roda a mesma porta com várias cargas. */
export function curvaCarga(cfg: ConfigFila, capacidadeMbps: number, cargas: number[], tamanho = TAMANHO_PADRAO, semente = 7): PontoCurva[] {
  const tPacote = (tamanho * 8) / (capacidadeMbps * 1e6);
  return cargas.map((c) => {
    const r = simularFila(cfg, [fonteDeCarga(c, capacidadeMbps, tamanho)], { capacidadeMbps, semente, pacotes: 4000 });
    return { carga: c, atrasoMedio: r.atrasoMedio, teorico: atrasoMD1(c, tPacote), jitter: r.jitter, taxaPerda: r.taxaPerda };
  });
}

/** Tempo em texto: µs, ms ou s. */
export function tempoTxt(s: number): string {
  if (!Number.isFinite(s)) return '∞';
  if (s < 1e-3) return `${(s * 1e6).toFixed(1).replace('.', ',')} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(2).replace('.', ',')} ms`;
  return `${s.toFixed(2).replace('.', ',')} s`;
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')} %`;

/** O resultado em linhas para o console. */
export function textoFila(cfg: ConfigFila, r: ResultadoFila): string[] {
  const tecnicas = [
    cfg.red ? `RED (mín ${cfg.red.min}, máx ${cfg.red.max}, pmáx ${String(cfg.red.pmax ?? 0.1).replace('.', ',')})` : 'descarte no fim da fila',
    cfg.ecn ? 'ECN ligado' : '',
    cfg.choke ? 'choke packet' : '',
    cfg.descarte ? 'descarte de carga' : '',
    cfg.admissao !== undefined ? `admissão até ${pct(cfg.admissao)}` : '',
  ].filter(Boolean);
  const l = [
    `Enlace de ${r.capacidadeMbps} Mb/s, buffer de ${cfg.buffer} pacote(s), ${tecnicas.join(', ')}.`,
    `Carga oferecida: ${pct(r.carga)} da capacidade.${r.recusadas.length ? ` Recusadas pelo controle de admissão: ${r.recusadas.join(', ')}.` : ''}`,
    `  atraso médio        ${tempoTxt(r.atrasoMedio)} (o pior: ${tempoTxt(r.atrasoMax)})`,
    `  variação (jitter)   ${tempoTxt(r.jitter)} de desvio padrão`,
    `  ocupação da fila    ${r.ocupacaoMedia.toFixed(1).replace('.', ',')} pacote(s) em média, ${r.ocupacaoMax} no pico`,
    `  enlace ocupado      ${pct(r.utilizacao)} do tempo`,
    `  perdas              ${r.perdas} de ${r.enviados} (${pct(r.taxaPerda)}): ${r.perdasBuffer} por buffer cheio, ${r.perdasRed} antecipadas pelo RED, ${r.perdasDescarte} pelo descarte de carga`,
  ];
  if (cfg.ecn || r.marcadosEcn) l.push(`  marcados com ECN    ${r.marcadosEcn}: chegaram, e o destino avisou a origem para ir mais devagar`);
  if (cfg.choke) l.push(`  choke packets       ${r.sinais} aviso(s) mandados direto para a origem`);
  const tcp = r.porFonte.filter((f) => f.admitida && f.tcp);
  if (tcp.length) {
    l.push(`  TCP                 ${r.reducoes} redução(ões) de janela, ida e volta sem fila de ${tempoTxt(r.rtt)}${r.sincronia !== null ? `; em cada aperto, ${pct(r.sincronia)} das origens que disputam a porta recuaram juntas` : ''}`);
  }
  if (r.porFonte.length > 1 || r.porFonte.some((f) => !f.admitida || f.sinais || f.recuos || f.expiracoes)) {
    l.push('  POR FONTE:');
    for (const f of r.porFonte) {
      if (!f.admitida) {
        l.push(`    ${f.nome.padEnd(10)} recusada na entrada: não cabia`);
        continue;
      }
      const base = `    ${f.nome.padEnd(10)} ${String(f.entregues).padStart(5)} entregues, ${String(f.perdidos).padStart(4)} perdidos, atraso ${tempoTxt(f.atrasoMedio)}, ${f.vazaoMbps.toFixed(2).replace('.', ',')} Mb/s`;
      if (!f.tcp) {
        l.push(`${base}, sem controle de congestionamento: manda na taxa pedida`);
        continue;
      }
      const reacoes = [f.recuos ? `${f.recuos} por perda (3 confirmações repetidas)` : '', f.expiracoes ? `${f.expiracoes} por temporizador vencido` : '', f.sinais ? `${f.sinais} por aviso (${cfg.ecn ? 'ECN' : 'choke'})` : ''].filter(Boolean);
      l.push(`${base}, TCP com janela média de ${f.janelaMedia.toFixed(1).replace('.', ',')} pacote(s)${reacoes.length ? `; recuou ${reacoes.join(', ')}` : '; não precisou recuar'}${f.retransmitidos ? `, ${f.retransmitidos} retransmitido(s)` : ''}`);
    }
  }
  l.push(`Com o buffer cheio, quem entra no fim espera ${tempoTxt(r.atrasoBufferCheio)} antes de sair.${r.atrasoBufferCheio > 0.1 ? ' Buffer grande demais: não perde quase nada, mas o pacote chega tão atrasado que para voz ou jogo já não serve.' : ''}`);
  return l;
}
