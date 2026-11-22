// Camada de enlace bit a bit: enquadramento, detecção e correção de erros.
// Tudo roda de verdade: os quadros viram bits, a linha vira alguns bits, o receptor tenta entender.

export type Enquadramento = 'contagem' | 'flags' | 'bits';
export type Deteccao = 'nenhuma' | 'paridade' | 'checksum' | 'crc32';
export type Correcao = 'nenhuma' | 'hamming';

export interface ConfigEnlace {
  enquadramento: Enquadramento;
  /** Escape de bytes (flags) ou enchimento de bits (bits). */
  enchimento: boolean;
  deteccao: Deteccao;
  correcao: Correcao;
}

export const FLAG = 0x7e;
export const ESC = 0x7d;

/* ---------- bits e bytes ---------- */

export function paraBits(bytes: number[]): number[] {
  const out: number[] = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) out.push((b >> i) & 1);
  return out;
}

export function paraBytes(bits: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!;
    out.push(b);
  }
  return out;
}

export const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/* ---------- códigos de detecção ---------- */

/** Paridade par: o bit extra faz o total de uns ficar par. */
export function paridadePar(bits: number[]): number {
  return bits.reduce((s, b) => s ^ b, 0);
}

/** Soma de verificação da internet: soma em complemento de um de palavras de 16 bits. */
export function checksum16(bytes: number[]): number {
  let soma = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    soma += ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
    soma = (soma & 0xffff) + (soma >>> 16);
  }
  return ~soma & 0xffff;
}

const TABELA_CRC = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

/** CRC-32 do Ethernet (polinômio 0x04C11DB7, refletido). */
export function crc32(bytes: number[]): number {
  let c = 0xffffffff;
  for (const b of bytes) c = TABELA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Resto da divisão de polinômios em módulo 2, à mão, como no caderno. */
export function restoCrc(mensagem: string, gerador: string): string {
  const r = gerador.length - 1;
  const bits = (mensagem + '0'.repeat(r)).split('').map(Number);
  const g = gerador.split('').map(Number);
  for (let i = 0; i + g.length <= bits.length; i++) {
    if (bits[i] === 1) for (let j = 0; j < g.length; j++) bits[i + j] ^= g[j]!;
  }
  return bits.slice(-r).join('');
}

function anexar(payload: number[], d: Deteccao): number[] {
  switch (d) {
    case 'nenhuma':
      return [...payload];
    case 'paridade':
      return [...payload, paridadePar(paraBits(payload))];
    case 'checksum': {
      const c = checksum16(payload);
      return [...payload, c >> 8, c & 0xff];
    }
    case 'crc32': {
      const c = crc32(payload);
      return [...payload, (c >>> 24) & 0xff, (c >>> 16) & 0xff, (c >>> 8) & 0xff, c & 0xff];
    }
  }
}

/** Confere e tira o código. null = erro detectado. */
function conferir(bytes: number[], d: Deteccao): number[] | null {
  switch (d) {
    case 'nenhuma':
      return bytes;
    case 'paridade': {
      if (bytes.length < 1) return null;
      const p = bytes.slice(0, -1);
      return paridadePar(paraBits(p)) === (bytes[bytes.length - 1]! & 1) ? p : null;
    }
    case 'checksum': {
      if (bytes.length < 2) return null;
      const p = bytes.slice(0, -2);
      return checksum16(p) === ((bytes[bytes.length - 2]! << 8) | bytes[bytes.length - 1]!) ? p : null;
    }
    case 'crc32': {
      if (bytes.length < 4) return null;
      const p = bytes.slice(0, -4);
      const c = crc32(p);
      const veio = ((bytes[bytes.length - 4]! << 24) | (bytes[bytes.length - 3]! << 16) | (bytes[bytes.length - 2]! << 8) | bytes[bytes.length - 1]!) >>> 0;
      return c === veio ? p : null;
    }
  }
}

/* ---------- Hamming (7,4) ---------- */

/** Bits de verificação nas posições 1, 2 e 4; dados em 3, 5, 6 e 7. */
export function hammingCodificar(d: number[]): number[] {
  const [d1, d2, d3, d4] = d as [number, number, number, number];
  const p1 = d1 ^ d2 ^ d4;
  const p2 = d1 ^ d3 ^ d4;
  const p4 = d2 ^ d3 ^ d4;
  return [p1, p2, d1, p4, d2, d3, d4];
}

/** Devolve os 4 bits de dados e a posição corrigida (0 se nenhuma). */
export function hammingDecodificar(c: number[]): { dados: number[]; corrigido: number } {
  const b = [...c];
  const s1 = b[0]! ^ b[2]! ^ b[4]! ^ b[6]!;
  const s2 = b[1]! ^ b[2]! ^ b[5]! ^ b[6]!;
  const s4 = b[3]! ^ b[4]! ^ b[5]! ^ b[6]!;
  const pos = s1 + 2 * s2 + 4 * s4;
  if (pos) b[pos - 1]! ^= 1;
  return { dados: [b[2]!, b[4]!, b[5]!, b[6]!], corrigido: pos };
}

/** Quantos bits de verificação para m bits de dados: o menor r com 2^r >= m + r + 1. */
export function bitsVerificacao(m: number): number {
  let r = 0;
  while (2 ** r < m + r + 1) r++;
  return r;
}

/* ---------- enquadrar e desenquadrar ---------- */

interface QuadroLinha {
  bits: number[];
  /** Onde começa a carga útil (depois do cabeçalho), em bits, dentro do quadro. */
  inicioCarga: number;
}

function enquadrar(conteudo: number[], c: ConfigEnlace): QuadroLinha {
  if (c.correcao === 'hamming') {
    // Hamming trabalha em bits: cada meio byte vira 7 bits; o quadro só pode usar enquadramento de bits ou contagem.
    const bits: number[] = [];
    for (const b of conteudo) {
      bits.push(...hammingCodificar([(b >> 7) & 1, (b >> 6) & 1, (b >> 5) & 1, (b >> 4) & 1]));
      bits.push(...hammingCodificar([(b >> 3) & 1, (b >> 2) & 1, (b >> 1) & 1, b & 1]));
    }
    return enquadrarBits(bits, c);
  }
  return enquadrarBits(paraBits(conteudo), c, conteudo);
}

function enquadrarBits(carga: number[], c: ConfigEnlace, bytes?: number[]): QuadroLinha {
  switch (c.enquadramento) {
    case 'contagem': {
      // contagem em bits (16 bits) para servir também ao Hamming
      const n = carga.length;
      const cab = Array.from({ length: 16 }, (_, i) => (n >> (15 - i)) & 1);
      return { bits: [...cab, ...carga], inicioCarga: 16 };
    }
    case 'flags': {
      const b = bytes ?? paraBytes([...carga, ...Array((8 - (carga.length % 8)) % 8).fill(0)]);
      const corpo: number[] = [];
      for (const x of b) {
        if (c.enchimento && (x === FLAG || x === ESC)) corpo.push(ESC, x ^ 0x20);
        else corpo.push(x);
      }
      return { bits: paraBits([FLAG, ...corpo, FLAG]), inicioCarga: 8 };
    }
    case 'bits': {
      const corpo: number[] = [];
      let uns = 0;
      for (const bit of carga) {
        corpo.push(bit);
        uns = bit ? uns + 1 : 0;
        if (c.enchimento && uns === 5) {
          corpo.push(0);
          uns = 0;
        }
      }
      const f = paraBits([FLAG]);
      return { bits: [...f, ...corpo, ...f], inicioCarga: 8 };
    }
  }
}

function desenquadrar(linha: number[], c: ConfigEnlace): number[][] {
  const quadros: number[][] = [];
  switch (c.enquadramento) {
    case 'contagem': {
      let i = 0;
      while (i + 16 <= linha.length) {
        let n = 0;
        for (let k = 0; k < 16; k++) n = (n << 1) | linha[i + k]!;
        i += 16;
        if (n === 0 || i + n > linha.length) break;
        quadros.push(linha.slice(i, i + n));
        i += n;
      }
      return quadros;
    }
    case 'flags': {
      const bytes = paraBytes(linha);
      let atual: number[] | null = null;
      let escapando = false;
      for (const b of bytes) {
        if (b === FLAG) {
          if (atual && atual.length) quadros.push(paraBits(atual));
          atual = [];
          escapando = false;
          continue;
        }
        if (!atual) continue;
        if (c.enchimento && b === ESC) {
          escapando = true;
          continue;
        }
        atual.push(escapando ? b ^ 0x20 : b);
        escapando = false;
      }
      return quadros;
    }
    case 'bits': {
      const f = paraBits([FLAG]).join('');
      const s = linha.join('');
      const partes: string[] = [];
      let i = s.indexOf(f);
      while (i >= 0) {
        const j = s.indexOf(f, i + 8);
        if (j < 0) break;
        if (j > i + 8) partes.push(s.slice(i + 8, j));
        i = j;
      }
      for (const p of partes) {
        const corpo: number[] = [];
        let uns = 0;
        for (let k = 0; k < p.length; k++) {
          const bit = Number(p[k]);
          if (c.enchimento && uns === 5) {
            uns = 0;
            if (bit === 0) continue; // o zero enfiado pelo transmissor
          }
          corpo.push(bit);
          uns = bit ? uns + 1 : 0;
        }
        quadros.push(corpo);
      }
      return quadros;
    }
  }
}

function abrir(bits: number[], c: ConfigEnlace): { bytes: number[]; corrigidos: number } {
  if (c.correcao !== 'hamming') return { bytes: paraBytes(bits), corrigidos: 0 };
  const out: number[] = [];
  let corrigidos = 0;
  for (let i = 0; i + 14 <= bits.length; i += 14) {
    const a = hammingDecodificar(bits.slice(i, i + 7));
    const b = hammingDecodificar(bits.slice(i + 7, i + 14));
    if (a.corrigido) corrigidos++;
    if (b.corrigido) corrigidos++;
    out.push(paraBytes([...a.dados, ...b.dados])[0]!);
  }
  return { bytes: out, corrigidos };
}

/* ---------- transmissão completa ---------- */

export interface ErroLinha {
  quadro: number; // índice do quadro (0...)
  bits: number[]; // posições, contadas a partir do início da carga útil do quadro
  /** Posição contada do começo do quadro (para atingir o cabeçalho). */
  noCabecalho?: boolean;
}

export interface ResultadoEnlace {
  enviados: number;
  corretos: number;
  /** Entregues à camada de cima com conteúdo errado: o pior caso, ninguém percebeu. */
  corrompidos: number;
  /** Erros detectados e descartados (aí o ARQ retransmite). */
  descartados: number;
  /** Bits corrigidos pelo Hamming. */
  corrigidos: number;
  /** Quadros que nem chegaram a ser separados (enquadramento perdido). */
  perdidos: number;
  bitsNaLinha: number;
  bitsDeCarga: number;
  amostra: string[];
}

export function transmitir(payloads: number[][], c: ConfigEnlace, erros: ErroLinha[] = []): ResultadoEnlace {
  const linha: number[] = [];
  const inicios: { inicio: number; carga: number }[] = [];
  for (const p of payloads) {
    const q = enquadrar(anexar(p, c.deteccao), c);
    inicios.push({ inicio: linha.length, carga: linha.length + q.inicioCarga });
    linha.push(...q.bits);
  }
  for (const e of erros) {
    const base = inicios[e.quadro];
    if (!base) continue;
    for (const b of e.bits) {
      const pos = (e.noCabecalho ? base.inicio : base.carga) + b;
      if (pos < linha.length) linha[pos] ^= 1;
    }
  }
  const recebidos = desenquadrar(linha, c);
  let corretos = 0;
  let corrompidos = 0;
  let descartados = 0;
  let corrigidos = 0;
  const restantes = payloads.map((p) => p.join(','));
  const amostra: string[] = [];
  for (const r of recebidos) {
    const aberto = abrir(r, c);
    corrigidos += aberto.corrigidos;
    const util = conferir(aberto.bytes, c.deteccao);
    if (!util) {
      descartados++;
      if (amostra.length < 4) amostra.push(`quadro descartado: o código de erro não bateu`);
      continue;
    }
    const k = restantes.indexOf(util.join(','));
    if (k >= 0) {
      corretos++;
      restantes.splice(k, 1);
    } else {
      corrompidos++;
      if (amostra.length < 4) amostra.push(`entregue ERRADO: ${hex(util.slice(0, 12))}${util.length > 12 ? ' ...' : ''}`);
    }
  }
  const perdidos = Math.max(0, payloads.length - corretos - corrompidos - descartados);
  return {
    enviados: payloads.length,
    corretos,
    corrompidos,
    descartados,
    corrigidos,
    perdidos,
    bitsNaLinha: linha.length,
    bitsDeCarga: payloads.reduce((s, p) => s + p.length * 8, 0),
    amostra,
  };
}

/** Como o primeiro quadro fica na linha, em hexadecimal (ou bits, no enquadramento de bits). */
export function amostraDaLinha(payload: number[], c: ConfigEnlace): string {
  const q = enquadrar(anexar(payload, c.deteccao), c);
  if (c.enquadramento === 'bits' || c.correcao === 'hamming') return q.bits.join('').replace(/(.{8})/g, '$1 ').trim();
  if (c.enquadramento === 'contagem') return hex(paraBytes(q.bits));
  return hex(paraBytes(q.bits));
}

/** Aplica o escape de bytes, para conferir respostas. */
export function escaparBytes(bytes: number[]): number[] {
  const out: number[] = [];
  for (const x of bytes) {
    if (x === FLAG || x === ESC) out.push(ESC, x ^ 0x20);
    else out.push(x);
  }
  return out;
}

/** Enchimento de bits: um 0 depois de cada cinco 1 seguidos. */
export function encherBits(bits: string): string {
  let out = '';
  let uns = 0;
  for (const b of bits) {
    out += b;
    uns = b === '1' ? uns + 1 : 0;
    if (uns === 5) {
      out += '0';
      uns = 0;
    }
  }
  return out;
}
