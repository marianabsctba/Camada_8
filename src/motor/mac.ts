// Subcamada MAC: quem fala quando num meio compartilhado.
// Fórmulas clássicas onde elas existem; Monte Carlo reprodutível (rng semeado) onde a fórmula
// esconderia o fenômeno, como no recuo exponencial e no terminal oculto.

import { aparelho, type Equipamento } from './mundo';
import { fmt } from './util';

/* ---------- ALOHA ---------- */

/** ALOHA puro: um quadro é vulnerável por dois tempos de quadro. S = G·e^(-2G). Pico de 1/(2e) ≈ 18,4 % em G = 0,5. */
export function vazaoAloha(G: number): number {
  return G * Math.exp(-2 * G);
}

/** ALOHA com intervalos: só começa no início do intervalo, vulnerável por um tempo de quadro. S = G·e^(-G). Pico de 1/e ≈ 36,8 % em G = 1. */
export function vazaoAlohaSlotted(G: number): number {
  return G * Math.exp(-G);
}

/* ---------- CSMA ---------- */

/**
 * CSMA não persistente (Kleinrock e Tobagi), atraso de propagação normalizado a = τ / T_quadro:
 * S = G·e^(-aG) / (G(1+2a) + e^(-aG)).
 */
export function vazaoCsmaNp(G: number, a: number): number {
  const x = Math.exp(-a * G);
  return (G * x) / (G * (1 + 2 * a) + x);
}

/**
 * CSMA 1-persistente sem intervalos (Kleinrock e Tobagi):
 * S = G[1 + G + aG(1 + G + aG/2)]·e^(-G(1+2a)) / [G(1+2a) - (1 - e^(-aG)) + (1 + aG)·e^(-G(1+a))].
 * Com a = 0 vira G(1+G)e^(-G) / (G + e^(-G)), com pico perto de 54 %.
 */
export function vazaoCsma1p(G: number, a: number): number {
  const num = G * (1 + G + a * G * (1 + G + (a * G) / 2)) * Math.exp(-G * (1 + 2 * a));
  const den = G * (1 + 2 * a) - (1 - Math.exp(-a * G)) + (1 + a * G) * Math.exp(-G * (1 + a));
  return den > 0 ? num / den : 0;
}

/** Eficiência máxima do CSMA/CD com muitas estações prontas: 1 / (1 + 2e·a). */
export function eficienciaCsmaCd(a: number): number {
  return 1 / (1 + 2 * Math.E * a);
}

/**
 * CSMA/CD em função da carga. Aproximação didática: com pouca carga quase tudo passa (S ≈ G);
 * com muita, a vazão encosta na eficiência máxima sem desabar, porque a colisão é abortada cedo
 * e o recuo exponencial espalha as tentativas. S = Smax·(1 - e^(-G/Smax)).
 */
export function vazaoCsmaCd(G: number, a: number): number {
  const max = eficienciaCsmaCd(a);
  return max * (1 - Math.exp(-G / max));
}

/** Velocidade de propagação no cobre e na fibra, aproximada: 2/3 da luz. */
export const C_MEIO = 2e8;

/**
 * Eficiência da Ethernet clássica (CSMA/CD) com muitas estações:
 * 1 / (1 + 2·B·L·e / (c·F)), com B em b/s, L em metros, F em bits e c = 2·10^8 m/s.
 */
export function eficienciaEthernet(taxaBps: number, comprimentoM: number, quadroBits: number): number {
  return 1 / (1 + (2 * taxaBps * comprimentoM * Math.E) / (C_MEIO * quadroBits));
}

/* ---------- Recuo binário exponencial ---------- */

export interface ResultadoRecuo {
  /** Média de intervalos de contenção até todas as estações transmitirem. */
  intervalos: number;
  /** Média de colisões por rodada. */
  colisoes: number;
  /** Média de estações que desistiram (16 tentativas sem sucesso). */
  desistencias: number;
  rodadas: number;
}

/**
 * Monte Carlo: k estações colidem no intervalo 0. Depois da i-ésima colisão, cada uma sorteia
 * r em [0, 2^min(i,10) - 1] e tenta de novo r intervalos depois. Desiste após 16 tentativas.
 */
export function recuoExponencial(k: number, rng: () => number, rodadas = 200): ResultadoRecuo {
  let somaInt = 0;
  let somaCol = 0;
  let somaDes = 0;
  for (let r = 0; r < rodadas; r++) {
    const proxima = new Array<number>(k).fill(0);
    const colisoesDe = new Array<number>(k).fill(0);
    const pendente = new Array<boolean>(k).fill(true);
    let restam = k;
    let t = 0;
    let colisoes = 0;
    while (restam > 0 && t < 1e6) {
      const agora: number[] = [];
      for (let i = 0; i < k; i++) if (pendente[i] && proxima[i] === t) agora.push(i);
      if (agora.length === 1) {
        pendente[agora[0]!] = false;
        restam--;
      } else if (agora.length > 1) {
        colisoes++;
        for (const i of agora) {
          colisoesDe[i]!++;
          if (colisoesDe[i]! >= 16) {
            pendente[i] = false;
            restam--;
            somaDes++;
            continue;
          }
          const janela = 2 ** Math.min(colisoesDe[i]!, 10);
          proxima[i] = t + 1 + Math.floor(rng() * janela);
        }
      }
      t++;
    }
    somaInt += t;
    somaCol += colisoes;
  }
  return { intervalos: somaInt / rodadas, colisoes: somaCol / rodadas, desistencias: somaDes / rodadas, rodadas };
}

/* ---------- Protocolos livres de colisão ---------- */

/**
 * Mapa de bits: N estações, quadros de d bits, cada rodada começa com N intervalos de reserva de 1 bit.
 * Carga baixa (uma estação por rodada): d / (d + N). Carga alta (todas transmitem): d / (d + 1).
 */
export function eficienciaBitmap(N: number, d: number, carga: 'baixa' | 'alta'): number {
  return carga === 'alta' ? d / (d + 1) : d / (d + N);
}

/** Tempo de uma volta do bastão, em tempos de quadro: propagação no anel (a) mais N passagens do bastão. */
export function tempoVoltaToken(N: number, a: number, bitsBastao: number, bitsQuadro: number): number {
  return a + (N * bitsBastao) / bitsQuadro;
}

/** Passagem de bastão com todas as estações prontas, um quadro por posse: N / (N + volta), volta em tempos de quadro. */
export function eficienciaToken(N: number, voltaQuadros: number): number {
  return N / (N + voltaQuadros);
}

/* ---------- Terminal oculto e RTS/CTS ---------- */

export interface ConfigOculto {
  estacoes: number;
  /** As estações não se escutam entre si, só o ponto de acesso escuta todas. */
  ocultas: boolean;
  rtsCts: boolean;
  /** Carga oferecida G, em quadros por tempo de quadro, somando todas as estações. */
  carga: number;
}

export interface ResultadoOculto {
  /** Vazão útil: fração do tempo carregando dado entregue. */
  vazao: number;
  /** Fração dos quadros de dado que colidiram no ponto de acesso. */
  fracaoColisao: number;
  /** Fração dos RTS que colidiram (só com RTS/CTS). */
  fracaoRtsColisao: number;
  entregues: number;
  colisoesDados: number;
  colisoesRts: number;
}

/** Duração do quadro de dado em mini-intervalos; RTS e CTS duram 1. */
export const MINI_QUADRO = 10;

type EstadoSta = { fila: number; modo: 'espera' | 'rts' | 'dados'; inicio: number; fim: number; recuo: number; cw: number; colidiu: boolean };

/**
 * Monte Carlo em mini-intervalos: CSMA/CA com recuo (janela de 8 a 64) e escuta do meio.
 * Estações ocultas não escutam umas às outras, só o ponto de acesso, então colidem lá como no ALOHA.
 * Com RTS/CTS, o CTS do ponto de acesso é ouvido por todas e reserva o meio (NAV): só os RTS curtos colidem.
 */
export function simularOculto(c: ConfigOculto, rng: () => number, intervalos = 20000): ResultadoOculto {
  const N = Math.max(1, Math.round(c.estacoes));
  const L = MINI_QUADRO;
  const p = Math.min(1, c.carga / (N * L));
  const sta: EstadoSta[] = Array.from({ length: N }, () => ({ fila: 0, modo: 'espera', inicio: 0, fim: 0, recuo: -1, cw: 8, colidiu: false }));
  let nav = 0; // reserva vinda do CTS, vale para todas
  let ctsEm = -1; // mini-intervalo em que o ponto de acesso transmite o CTS
  let entregues = 0;
  let tentDados = 0;
  let colDados = 0;
  let tentRts = 0;
  let colRts = 0;
  const sortear = (s: EstadoSta) => (s.recuo = Math.floor(rng() * s.cw));
  for (let t = 0; t < intervalos; t++) {
    for (const s of sta) if (rng() < p && s.fila < 50) s.fila++;
    // Quem está no ar neste mini-intervalo.
    const noAr = sta.filter((s) => s.modo !== 'espera' && s.inicio <= t && t < s.fim);
    const apOcupado = ctsEm === t;
    if (noAr.length > 1 || (noAr.length === 1 && apOcupado)) for (const s of noAr) s.colidiu = true;
    // Fim de transmissão.
    for (const s of noAr) {
      if (s.fim !== t + 1) continue;
      if (s.modo === 'dados') {
        if (s.colidiu) {
          colDados++;
          s.cw = Math.min(64, s.cw * 2);
        } else {
          entregues++;
          s.fila--;
          s.cw = 8;
        }
        s.modo = 'espera';
        s.recuo = -1;
      } else if (s.modo === 'rts') {
        if (s.colidiu) {
          colRts++;
          s.cw = Math.min(64, s.cw * 2);
          s.modo = 'espera';
          s.recuo = -1;
        } else {
          ctsEm = t + 1;
          nav = Math.max(nav, t + 2 + L);
          s.modo = 'dados';
          s.inicio = t + 2;
          s.fim = t + 2 + L;
          s.colidiu = false;
          tentDados++;
        }
      }
    }
    // Escuta e recuo para o próximo mini-intervalo.
    for (const s of sta) {
      if (s.modo !== 'espera' || s.fila === 0) continue;
      if (s.recuo < 0) sortear(s);
      const ouveAlguem = !c.ocultas && noAr.some((o) => o !== s);
      const ocupado = ouveAlguem || apOcupado || nav > t + 1;
      if (ocupado) continue;
      if (s.recuo > 0) {
        s.recuo--;
        continue;
      }
      s.colidiu = false;
      if (c.rtsCts) {
        s.modo = 'rts';
        s.inicio = t + 1;
        s.fim = t + 2;
        tentRts++;
      } else {
        s.modo = 'dados';
        s.inicio = t + 1;
        s.fim = t + 1 + L;
        tentDados++;
      }
    }
  }
  return {
    vazao: (entregues * L) / intervalos,
    fracaoColisao: tentDados ? colDados / tentDados : 0,
    fracaoRtsColisao: tentRts ? colRts / tentRts : 0,
    entregues,
    colisoesDados: colDados,
    colisoesRts: colRts,
  };
}

/* ---------- O aparelho "canal": meio compartilhado de laboratório ---------- */

export type ProtocoloMac = 'aloha' | 'aloha-slotted' | 'csma-np' | 'csma-1p' | 'csma-cd' | 'csma-ca' | 'bitmap' | 'token';

export const PROTOCOLOS_MAC: Record<ProtocoloMac, string> = {
  aloha: 'ALOHA puro: fala quando quer',
  'aloha-slotted': 'ALOHA com intervalos: fala no começo do intervalo',
  'csma-np': 'CSMA não persistente: escuta; se ocupado, volta depois de um tempo aleatório',
  'csma-1p': 'CSMA 1-persistente: escuta; se ocupado, fica esperando e fala assim que vagar',
  'csma-cd': 'CSMA/CD: escuta, fala e aborta ao perceber colisão (Ethernet clássica)',
  'csma-ca': 'CSMA/CA: escuta, espera um recuo aleatório e só então fala (Wi-Fi)',
  bitmap: 'mapa de bits: cada estação reserva seu intervalo antes de falar',
  token: 'passagem de bastão: só fala quem está com o bastão',
};

export interface EstadoMac {
  protocolo: ProtocoloMac;
  estacoes: number;
  /** Carga oferecida G, em quadros por tempo de quadro. */
  carga: number;
  /** Atraso de propagação normalizado: tempo de propagação ÷ tempo de quadro. */
  a: number;
  rtsCts: boolean;
  ocultas: boolean;
  /** Tamanho do quadro em bits (mapa de bits e bastão). */
  quadroBits?: number;
  /** Tamanho do bastão em bits. */
  bastaoBits?: number;
}

export interface ResultadoMac {
  protocolo: ProtocoloMac;
  vazao: number;
  /** Fração das tentativas perdidas em colisão (nos CSMA analíticos, 1 - S/G: colisão ou adiamento). */
  colisoes: number;
  formula: string;
  linhas: string[];
}

export function canal(nome: string, mac: Partial<EstadoMac> = {}, modelo = 'Meio compartilhado de laboratório'): Equipamento {
  return aparelho(nome, 'canal', modelo, [], {
    mac: { protocolo: 'aloha', estacoes: 10, carga: 0.5, a: 0.01, rtsCts: false, ocultas: false, quadroBits: 1000, bastaoBits: 24, ...mac } satisfies EstadoMac,
  });
}

const pct = (x: number) => `${fmt(x * 100, 1)} %`;

/** Roda o protocolo configurado no canal e explica a conta. */
export function simularCanal(s: EstadoMac, rng: () => number): ResultadoMac {
  const G = Math.max(0, s.carga);
  const N = Math.max(1, Math.round(s.estacoes));
  const a = Math.max(0, s.a);
  const d = s.quadroBits ?? 1000;
  const perdida = (S: number) => (G > 0 ? Math.max(0, 1 - S / G) : 0);
  let S = 0;
  let col = 0;
  let formula = '';
  const analitico = s.protocolo === 'csma-np' || s.protocolo === 'csma-1p' || s.protocolo === 'csma-cd';
  const extra: string[] = [];
  switch (s.protocolo) {
    case 'aloha':
      S = vazaoAloha(G);
      col = 1 - Math.exp(-2 * G);
      formula = 'S = G·e^(-2G)  (quadro vulnerável por 2 tempos de quadro; pico de 18,4 % em G = 0,5)';
      break;
    case 'aloha-slotted':
      S = vazaoAlohaSlotted(G);
      col = 1 - Math.exp(-G);
      formula = 'S = G·e^(-G)  (vulnerável por 1 tempo de quadro; pico de 36,8 % em G = 1)';
      break;
    case 'csma-np':
      S = vazaoCsmaNp(G, a);
      col = perdida(S);
      formula = 'S = G·e^(-aG) / (G(1+2a) + e^(-aG))';
      break;
    case 'csma-1p':
      S = vazaoCsma1p(G, a);
      col = perdida(S);
      formula = 'S = G[1+G+aG(1+G+aG/2)]·e^(-G(1+2a)) / [G(1+2a) - (1-e^(-aG)) + (1+aG)·e^(-G(1+a))]';
      break;
    case 'csma-cd':
      S = vazaoCsmaCd(G, a);
      col = perdida(S);
      formula = `S = Smax·(1 - e^(-G/Smax)), com Smax = 1/(1 + 2e·a) = ${pct(eficienciaCsmaCd(a))} (aproximação)`;
      break;
    case 'csma-ca': {
      const r = simularOculto({ estacoes: N, ocultas: s.ocultas, rtsCts: s.rtsCts, carga: G }, rng);
      S = r.vazao;
      col = r.fracaoColisao;
      formula = `simulação de Monte Carlo com ${N} estações${s.ocultas ? ' que não se escutam (terminal oculto)' : ''}${s.rtsCts ? ', com RTS/CTS' : ''}`;
      extra.push(`quadros de dado entregues: ${r.entregues}`, `quadros de dado que colidiram: ${r.colisoesDados} (${pct(r.fracaoColisao)})`);
      if (s.rtsCts) extra.push(`RTS que colidiram: ${r.colisoesRts} (${pct(r.fracaoRtsColisao)}). RTS é curto: colidir com ele custa pouco.`);
      break;
    }
    case 'bitmap': {
      const carga = G >= 1 ? 'alta' : 'baixa';
      const ef = eficienciaBitmap(N, d, carga);
      S = Math.min(G, ef);
      col = 0;
      formula = carga === 'alta' ? `eficiência = d/(d+1) = ${pct(ef)} (todas prontas, 1 bit de reserva por quadro)` : `eficiência = d/(d+N) = ${pct(ef)} (uma pronta por vez, N bits de reserva por quadro)`;
      break;
    }
    case 'token': {
      const volta = tempoVoltaToken(N, a, s.bastaoBits ?? 24, d);
      const ef = eficienciaToken(N, volta);
      S = Math.min(G, ef);
      col = 0;
      formula = `eficiência = N/(N + volta) = ${pct(ef)}, volta do bastão = a + N·bastão/quadro = ${fmt(volta, 3)} tempos de quadro`;
      break;
    }
  }
  const linhas = [
    `protocolo: ${PROTOCOLOS_MAC[s.protocolo]}`,
    `estações: ${N} | carga oferecida G = ${fmt(G, 2)} quadros por tempo de quadro | a = ${fmt(a, 3)}`,
    `fórmula: ${formula}`,
    ...extra,
    `vazão S: ${pct(S)} do canal`,
    analitico ? `tentativas que não viraram quadro entregue (colisão ou adiamento): ${pct(col)}` : `tentativas perdidas em colisão: ${pct(col)}`,
  ];
  return { protocolo: s.protocolo, vazao: S, colisoes: col, formula, linhas };
}

/* ---------- 802.11: arquitetura (IEEE 802.11-2020, cláusula 4) ---------- */

/**
 * Infraestrutura: as estações falam com um ponto de acesso, que forma um BSS (conjunto básico de serviço)
 * identificado pelo BSSID, o MAC do rádio do AP. Vários BSS com o mesmo SSID, ligados por um sistema de
 * distribuição (em geral um switch Ethernet), formam um ESS, e a estação passa de um AP para outro sem
 * trocar de rede (roaming, com reassociação). Ad hoc: um IBSS, estações falando direto, sem AP; o BSSID
 * é sorteado, com o bit de administração local ligado (IEEE 802.11-2020, campo BSSID do cabeçalho).
 */
export type ModoWifi = 'infraestrutura' | 'ad-hoc';

/** Quadros de gerenciamento: tipo 0 no campo de controle, com estes subtipos (IEEE 802.11-2020, 9.2.4.1.3). */
export const SUBTIPOS_GERENCIAMENTO = {
  'association request': 0,
  'association response': 1,
  'reassociation request': 2,
  'reassociation response': 3,
  'probe request': 4,
  'probe response': 5,
  beacon: 8,
  disassociation: 10,
  authentication: 11,
  deauthentication: 12,
} as const;

export type QuadroGerenciamento = keyof typeof SUBTIPOS_GERENCIAMENTO;

/** Unidade de tempo do 802.11 (TU): 1024 µs. O beacon sai, por padrão, a cada 100 TU. */
export const TU_US = 1024;
export const INTERVALO_BEACON_MS = (100 * TU_US) / 1000;

export const BROADCAST_MAC = 'ff:ff:ff:ff:ff:ff';

export interface Bss {
  ssid: string;
  bssid: string;
  canal: number;
  modo: ModoWifi;
}

export interface PassoEntrada {
  quadro: QuadroGerenciamento;
  subtipo: number;
  de: string;
  para: string;
  explicacao: string;
}

/** BSSID de um IBSS: 46 bits sorteados, bit individual/grupo em 0 e bit local em 1, como manda o padrão para o IBSS. */
export function bssidIbss(rng: () => number): string {
  const b = Array.from({ length: 6 }, () => Math.floor(rng() * 256));
  b[0] = (b[0]! & 0xfc) | 0x02;
  return b.map((x) => x.toString(16).padStart(2, '0')).join(':');
}

/**
 * Como uma estação entra num BSS de infraestrutura: acha a rede (varredura passiva, ouvindo o beacon,
 * ou ativa, mandando probe request), autentica (sistema aberto: dois quadros) e associa, recebendo
 * o identificador de associação (AID). Num IBSS não há AP nem associação. Cifra (WPA2/WPA3) fica para depois.
 */
export function entrarNaRede(bss: Bss, estacao: string, varredura: 'passiva' | 'ativa', aid = 1): PassoEntrada[] {
  if (bss.modo === 'ad-hoc') return [];
  const q = (quadro: QuadroGerenciamento, de: string, para: string, explicacao: string): PassoEntrada => ({ quadro, subtipo: SUBTIPOS_GERENCIAMENTO[quadro], de, para, explicacao });
  const achar =
    varredura === 'passiva'
      ? [q('beacon', bss.bssid, BROADCAST_MAC, `o AP anuncia "${bss.ssid}" no canal ${bss.canal}, a cada ${fmt(INTERVALO_BEACON_MS, 1)} ms; a estação só escuta`)]
      : [
          q('probe request', estacao, BROADCAST_MAC, `a estação pergunta, no canal ${bss.canal}, quem atende "${bss.ssid}" (ou qualquer rede, com SSID vazio)`),
          q('probe response', bss.bssid, estacao, 'o AP responde com o SSID, as taxas que aceita e o canal'),
        ];
  return [
    ...achar,
    q('authentication', estacao, bss.bssid, 'sistema aberto, sequência 1: a estação pede para se autenticar'),
    q('authentication', bss.bssid, estacao, 'sequência 2: o AP aceita (a senha, se houver, vem depois, no WPA2 ou WPA3)'),
    q('association request', estacao, bss.bssid, `a estação pede para entrar no BSS ${bss.bssid}`),
    q('association response', bss.bssid, estacao, `o AP aceita e dá o AID ${aid}; daqui em diante o AP encaminha os quadros dela`),
  ];
}

/* ---------- 802.11: camadas físicas (IEEE 802.11-2020, cláusulas 15 a 21, e 802.11ax-2021) ---------- */

export type PadraoWifi = '802.11b' | '802.11a' | '802.11g' | '802.11n' | '802.11ac' | '802.11ax';

export interface CamadaFisica80211 {
  padrao: PadraoWifi;
  faixas: string;
  tecnica: string;
  /** Larguras de canal, em MHz. */
  larguras: number[];
  /** Fluxos espaciais (MIMO). */
  fluxos: number;
  taxaMaxMbps: number;
}

/** Taxa de uma camada física OFDM, em Mb/s: fluxos × subportadoras de dados × bits por subportadora × codificação ÷ duração do símbolo em µs. */
export function taxaOfdm(subportadorasDados: number, bitsPorSimbolo: number, codificacao: number, simboloUs: number, fluxos = 1): number {
  return (fluxos * subportadorasDados * bitsPorSimbolo * codificacao) / simboloUs;
}

export const CAMADAS_FISICAS_80211: Record<PadraoWifi, CamadaFisica80211> = {
  // DSSS com código de Barker (1 e 2 Mb/s) e CCK (5,5 e 11 Mb/s), canal de 22 MHz.
  '802.11b': { padrao: '802.11b', faixas: '2,4 GHz', tecnica: 'DSSS (Barker e CCK)', larguras: [22], fluxos: 1, taxaMaxMbps: 11 },
  // 48 subportadoras de dados, símbolo de 4 µs, 64-QAM 3/4.
  '802.11a': { padrao: '802.11a', faixas: '5 GHz', tecnica: 'OFDM', larguras: [20], fluxos: 1, taxaMaxMbps: taxaOfdm(48, 6, 3 / 4, 4) },
  '802.11g': { padrao: '802.11g', faixas: '2,4 GHz', tecnica: 'OFDM (e DSSS para conversar com o b)', larguras: [20], fluxos: 1, taxaMaxMbps: taxaOfdm(48, 6, 3 / 4, 4) },
  // 108 subportadoras em 40 MHz, 64-QAM 5/6, intervalo de guarda curto (símbolo de 3,6 µs), 4 fluxos.
  '802.11n': { padrao: '802.11n', faixas: '2,4 e 5 GHz', tecnica: 'OFDM com MIMO', larguras: [20, 40], fluxos: 4, taxaMaxMbps: taxaOfdm(108, 6, 5 / 6, 3.6, 4) },
  // 468 subportadoras em 160 MHz, 256-QAM 5/6, símbolo de 3,6 µs, 8 fluxos; MU-MIMO só na descida.
  '802.11ac': { padrao: '802.11ac', faixas: '5 GHz', tecnica: 'OFDM com MIMO e MU-MIMO na descida', larguras: [20, 40, 80, 160], fluxos: 8, taxaMaxMbps: taxaOfdm(468, 8, 5 / 6, 3.6, 8) },
  // 1960 subportadoras em 160 MHz, 1024-QAM 5/6, símbolo de 12,8 µs + 0,8 µs de guarda, 8 fluxos.
  '802.11ax': { padrao: '802.11ax', faixas: '2,4, 5 e 6 GHz', tecnica: 'OFDMA com MU-MIMO nos dois sentidos', larguras: [20, 40, 80, 160], fluxos: 8, taxaMaxMbps: taxaOfdm(1960, 10, 5 / 6, 13.6, 8) },
};

export interface TaxaWifi {
  mbps: number;
  modulacao: string;
  codificacao: string;
  /** SNR mínima aproximada para essa taxa, em dB. Aproximação de bancada: o padrão fixa sensibilidade, não SNR. */
  snrMin: number;
}

const ofdm = (bits: number, cod: number, codTxt: string, modulacao: string, snrMin: number): TaxaWifi => ({ mbps: taxaOfdm(48, bits, cod, 4), modulacao, codificacao: codTxt, snrMin });

/** As oito taxas do OFDM de 20 MHz do 802.11a e do 802.11g (IEEE 802.11-2020, tabela 17-4). */
export const TAXAS_80211AG: TaxaWifi[] = [
  ofdm(1, 1 / 2, '1/2', 'BPSK', 5),
  ofdm(1, 3 / 4, '3/4', 'BPSK', 7),
  ofdm(2, 1 / 2, '1/2', 'QPSK', 9),
  ofdm(2, 3 / 4, '3/4', 'QPSK', 11),
  ofdm(4, 1 / 2, '1/2', '16-QAM', 15),
  ofdm(4, 3 / 4, '3/4', '16-QAM', 18),
  ofdm(6, 2 / 3, '2/3', '64-QAM', 22),
  ofdm(6, 3 / 4, '3/4', '64-QAM', 25),
];

/** As quatro taxas do 802.11b (IEEE 802.11-2020, cláusulas 15 e 16). */
export const TAXAS_80211B: TaxaWifi[] = [
  { mbps: 1, modulacao: 'DBPSK com Barker', codificacao: '11 chips por bit', snrMin: 2 },
  { mbps: 2, modulacao: 'DQPSK com Barker', codificacao: '11 chips por símbolo', snrMin: 5 },
  { mbps: 5.5, modulacao: 'CCK', codificacao: '4 bits por símbolo', snrMin: 8 },
  { mbps: 11, modulacao: 'CCK', codificacao: '8 bits por símbolo', snrMin: 11 },
];

/** Modulação adaptativa: o rádio usa a taxa mais alta que a SNR aguenta. Abaixo da mais baixa, não associa. */
export function modulacaoAdaptativa(snrDb: number, tabela: TaxaWifi[] = TAXAS_80211AG): TaxaWifi | null {
  let melhor: TaxaWifi | null = null;
  for (const t of tabela) if (snrDb >= t.snrMin && (!melhor || t.mbps > melhor.mbps)) melhor = t;
  return melhor;
}

/** Frequência central de um canal de 2,4 GHz, em MHz: 2407 + 5n, de 1 a 13; o 14 (só no Japão, só 802.11b) fica em 2484. */
export function frequenciaCanal24(n: number): number {
  return n === 14 ? 2484 : 2407 + 5 * n;
}

/** Canais de 2,4 GHz sem sobreposição, do 1 em diante, para canais da largura dada (centros a 5 MHz). */
export function canaisSemSobreposicao(larguraMhz = 22, ultimo = 11): number[] {
  const passo = Math.ceil(larguraMhz / 5);
  const out: number[] = [];
  for (let c = 1; c <= ultimo; c += passo) out.push(c);
  return out;
}
