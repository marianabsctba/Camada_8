// Camada de rede, parte pura: contas de sub-rede, cabeçalho IPv4, fragmentação, tipos de ICMP e IPv6.
// Nada aqui conhece o mundo do jogo: entra número, sai número. O roteamento usa estas funções.

import { checksum16 } from './enlace';
import { ipTexto, lerCidr, lerIp, mascara, type Cidr } from './util';

/* ---------- IPv4: sub-redes e CIDR ---------- */

export function textoCidr(c: Cidr): string {
  return `${ipTexto(c.endereco)}/${c.prefixo}`;
}

/** Endereço de rede: os bits de host zerados. */
export function enderecoRede(c: Cidr): number {
  return (c.endereco & mascara(c.prefixo)) >>> 0;
}

/** Endereço de broadcast dirigido: os bits de host todos em 1. */
export function enderecoBroadcast(c: Cidr): number {
  return (enderecoRede(c) | ~mascara(c.prefixo)) >>> 0;
}

/** Quantos hosts cabem: 2^(32 - prefixo) menos rede e broadcast. /31 (ponto a ponto, RFC 3021) tem 2; /32 tem 1. */
export function quantidadeHosts(prefixo: number): number {
  if (prefixo >= 32) return 1;
  if (prefixo === 31) return 2;
  return 2 ** (32 - prefixo) - 2;
}

export function primeiroHost(c: Cidr): number {
  return c.prefixo >= 31 ? enderecoRede(c) : (enderecoRede(c) + 1) >>> 0;
}

export function ultimoHost(c: Cidr): number {
  return c.prefixo >= 31 ? enderecoBroadcast(c) : (enderecoBroadcast(c) - 1) >>> 0;
}

/** Máscara em decimal com pontos: /26 vira 255.255.255.192. */
export function mascaraTexto(prefixo: number): string {
  return ipTexto(mascara(prefixo));
}

/** Lê uma máscara em decimal (255.255.255.0) e devolve o prefixo, ou null se os uns não forem contíguos. */
export function prefixoDaMascara(s: string): number | null {
  const n = lerIp(s);
  if (n === null) return null;
  for (let p = 0; p <= 32; p++) if (mascara(p) === n) return p;
  return null;
}

/** O IP pertence ao prefixo? */
export function pertence(ip: number, c: Cidr): boolean {
  return ((ip & mascara(c.prefixo)) >>> 0) === enderecoRede(c);
}

export interface InfoSubrede {
  rede: string;
  broadcast: string;
  primeiro: string;
  ultimo: string;
  hosts: number;
  mascara: string;
  prefixo: number;
}

export function infoSubrede(c: Cidr): InfoSubrede {
  return {
    rede: ipTexto(enderecoRede(c)),
    broadcast: ipTexto(enderecoBroadcast(c)),
    primeiro: ipTexto(primeiroHost(c)),
    ultimo: ipTexto(ultimoHost(c)),
    hosts: quantidadeHosts(c.prefixo),
    mascara: mascaraTexto(c.prefixo),
    prefixo: c.prefixo,
  };
}

/** Divide um prefixo em sub-redes de um prefixo maior (mais longo). */
export function dividir(c: Cidr, novoPrefixo: number): Cidr[] {
  if (novoPrefixo < c.prefixo || novoPrefixo > 32) return [];
  const base = enderecoRede(c);
  const n = 2 ** (novoPrefixo - c.prefixo);
  const passo = 2 ** (32 - novoPrefixo);
  return Array.from({ length: Math.min(n, 4096) }, (_, i) => ({ endereco: (base + i * passo) >>> 0, prefixo: novoPrefixo }));
}

/**
 * Agregação (sumarização): junta prefixos irmãos até não dar mais.
 * 192.0.2.0/26 + 192.0.2.64/26 vira 192.0.2.0/25. Prefixo já coberto por outro some.
 */
export function agregar(lista: Cidr[]): Cidr[] {
  let atual = lista.map((c) => ({ endereco: enderecoRede(c), prefixo: c.prefixo }));
  // Tira os que já estão dentro de outro.
  const cobertos = (xs: Cidr[]) =>
    xs.filter((c, i) => !xs.some((o, j) => j !== i && o.prefixo <= c.prefixo && pertence(c.endereco, o) && (o.prefixo < c.prefixo || j < i)));
  atual = cobertos(atual);
  let mudou = true;
  while (mudou) {
    mudou = false;
    atual.sort((a, b) => a.endereco - b.endereco || a.prefixo - b.prefixo);
    for (let i = 0; i < atual.length && !mudou; i++) {
      for (let j = i + 1; j < atual.length && !mudou; j++) {
        const a = atual[i]!;
        const b = atual[j]!;
        if (a.prefixo !== b.prefixo || a.prefixo === 0) continue;
        const pai = { endereco: enderecoRede({ endereco: a.endereco, prefixo: a.prefixo - 1 }), prefixo: a.prefixo - 1 };
        if (pertence(b.endereco, pai) && a.endereco !== b.endereco) {
          atual = cobertos([...atual.filter((_, k) => k !== i && k !== j), pai]);
          mudou = true;
        }
      }
    }
  }
  return atual.sort((a, b) => a.endereco - b.endereco);
}

/** Menor prefixo único que cobre todos (super-rede). Pode cobrir endereços a mais. */
export function superrede(lista: Cidr[]): Cidr | null {
  if (!lista.length) return null;
  let p = Math.min(...lista.map((c) => c.prefixo));
  const base = enderecoRede(lista[0]!);
  while (p > 0 && !lista.every((c) => pertence(c.endereco, { endereco: base, prefixo: p }))) p--;
  return { endereco: enderecoRede({ endereco: base, prefixo: p }), prefixo: p };
}

const PRIVADAS: Cidr[] = [lerCidr('10.0.0.0/8')!, lerCidr('172.16.0.0/12')!, lerCidr('192.168.0.0/16')!];
const DOCUMENTACAO: Cidr[] = [lerCidr('192.0.2.0/24')!, lerCidr('198.51.100.0/24')!, lerCidr('203.0.113.0/24')!];

/** Faixas privadas da RFC 1918: não andam na internet, só atrás de NAT. */
export function ehPrivado(ip: number): boolean {
  return PRIVADAS.some((c) => pertence(ip, c));
}

/** Faixas reservadas para documentação (RFC 5737): os "públicos de mentira" que exemplos usam. */
export function ehDocumentacao(ip: number): boolean {
  return DOCUMENTACAO.some((c) => pertence(ip, c));
}

/** Classe histórica (antes do CIDR), só para a curiosidade. */
export function classe(ip: number): 'A' | 'B' | 'C' | 'D' | 'E' {
  const o = ip >>> 24;
  return o < 128 ? 'A' : o < 192 ? 'B' : o < 224 ? 'C' : o < 240 ? 'D' : 'E';
}

/* ---------- Cabeçalho IPv4 ---------- */

export interface CabecalhoIpv4 {
  versao: 4;
  ihl: number; // em palavras de 32 bits; 5 = 20 bytes, sem opções
  tos: number;
  tamanhoTotal: number; // cabeçalho + dados, em bytes
  identificacao: number;
  df: boolean;
  mf: boolean;
  deslocamento: number; // em unidades de 8 bytes
  ttl: number;
  protocolo: number;
  checksum: number;
  origem: number;
  destino: number;
}

/** Tamanho de cada campo, em bits, na ordem do fio. */
export const CAMPOS_IPV4: [string, number][] = [
  ['versão', 4],
  ['tamanho do cabeçalho (IHL)', 4],
  ['tipo de serviço', 8],
  ['tamanho total', 16],
  ['identificação', 16],
  ['flags (reservado, DF, MF)', 3],
  ['deslocamento do fragmento', 13],
  ['TTL', 8],
  ['protocolo', 8],
  ['checksum do cabeçalho', 16],
  ['endereço de origem', 32],
  ['endereço de destino', 32],
];

/** Os 20 bytes do cabeçalho; o campo checksum vai como está em h. */
export function bytesCabecalho(h: Omit<CabecalhoIpv4, 'versao'> & { versao?: 4 }): number[] {
  const flags = (h.df ? 0x4000 : 0) | (h.mf ? 0x2000 : 0) | (h.deslocamento & 0x1fff);
  const w16 = (n: number) => [(n >>> 8) & 255, n & 255];
  const w32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return [(4 << 4) | (h.ihl & 15), h.tos & 255, ...w16(h.tamanhoTotal), ...w16(h.identificacao), ...w16(flags), h.ttl & 255, h.protocolo & 255, ...w16(h.checksum), ...w32(h.origem), ...w32(h.destino)];
}

/** Monta o cabeçalho com o checksum calculado: soma de 16 bits em complemento de um com o campo zerado. */
export function montarCabecalho(o: { tamanhoTotal: number; identificacao: number; df?: boolean; mf?: boolean; deslocamento?: number; ttl: number; protocolo: number; origem: number; destino: number; tos?: number }): CabecalhoIpv4 {
  const h: CabecalhoIpv4 = { versao: 4, ihl: 5, tos: o.tos ?? 0, tamanhoTotal: o.tamanhoTotal, identificacao: o.identificacao & 0xffff, df: !!o.df, mf: !!o.mf, deslocamento: o.deslocamento ?? 0, ttl: o.ttl, protocolo: o.protocolo, checksum: 0, origem: o.origem, destino: o.destino };
  h.checksum = checksum16(bytesCabecalho(h));
  return h;
}

/** Quem recebe soma o cabeçalho inteiro, checksum incluído: tem que dar 0 (ou seja, 0xFFFF antes de inverter). */
export function cabecalhoConfere(h: CabecalhoIpv4): boolean {
  return checksum16(bytesCabecalho(h)) === 0;
}

/** Cada roteador muda o TTL, então refaz o checksum a cada salto. */
export function decrementarTtl(h: CabecalhoIpv4): CabecalhoIpv4 {
  return montarCabecalho({ ...h, ttl: h.ttl - 1 });
}

/* ---------- Fragmentação ---------- */

export interface Fragmento {
  identificacao: number;
  /** Deslocamento em unidades de 8 bytes, contado a partir do começo dos dados do datagrama original. */
  deslocamento: number;
  /** Bytes de dados (sem o cabeçalho IP) neste fragmento. */
  dados: number;
  /** Bit "mais fragmentos": 1 em todos menos no último. */
  mf: boolean;
}

export const CABECALHO_IPV4 = 20;

/**
 * Corta um datagrama (ou um fragmento que já foi cortado antes) para caber no MTU.
 * Cada pedaço leva até (MTU - 20) bytes de dados, arredondado para baixo até múltiplo de 8,
 * porque o deslocamento é contado em unidades de 8 bytes. O último herda o MF de quem foi cortado.
 */
export function fragmentar(f: Fragmento, mtu: number): Fragmento[] {
  if (f.dados + CABECALHO_IPV4 <= mtu) return [f];
  const porPedaco = Math.floor((mtu - CABECALHO_IPV4) / 8) * 8;
  if (porPedaco <= 0) return [];
  const out: Fragmento[] = [];
  let feito = 0;
  while (feito < f.dados) {
    const n = Math.min(porPedaco, f.dados - feito);
    const ultimo = feito + n >= f.dados;
    out.push({ identificacao: f.identificacao, deslocamento: f.deslocamento + feito / 8, dados: n, mf: ultimo ? f.mf : true });
    feito += n;
  }
  return out;
}

/** Datagrama inteiro (dados = tamanho total - 20) cortado no MTU. */
export function fragmentarDatagrama(tamanhoTotal: number, mtu: number, identificacao: number): Fragmento[] {
  return fragmentar({ identificacao, deslocamento: 0, dados: tamanhoTotal - CABECALHO_IPV4, mf: false }, mtu);
}

/** O destino remonta: ordena pelo deslocamento e confere se não falta pedaço. */
export function remontar(fs: Fragmento[]): number | null {
  const ord = [...fs].sort((a, b) => a.deslocamento - b.deslocamento);
  let esperado = 0;
  for (const f of ord) {
    if (f.deslocamento * 8 !== esperado) return null;
    esperado += f.dados;
  }
  return ord.length && !ord[ord.length - 1]!.mf ? esperado : null;
}

/* ---------- ICMP ---------- */

export const ICMP = {
  ECO_RESPOSTA: 0,
  INALCANCAVEL: 3,
  ECO: 8,
  TEMPO_ESGOTADO: 11,
} as const;

export const CODIGO_INALCANCAVEL = {
  REDE: 0,
  HOST: 1,
  PROTOCOLO: 2,
  PORTA: 3,
  FRAGMENTACAO_NECESSARIA: 4,
} as const;

/** Nome do tipo e código de ICMP, em português. */
export function nomeIcmp(tipo: number, codigo = 0): string {
  switch (tipo) {
    case 0:
      return 'resposta de eco';
    case 8:
      return 'pedido de eco';
    case 11:
      return codigo === 1 ? 'tempo esgotado na remontagem dos fragmentos' : 'tempo esgotado em trânsito (o TTL chegou a zero)';
    case 3:
      return (
        ['rede inalcançável', 'host inalcançável', 'protocolo inalcançável', 'porta inalcançável', 'fragmentação necessária, mas o DF está ligado'][codigo] ??
        `destino inalcançável (código ${codigo})`
      );
  }
  return `tipo ${tipo}, código ${codigo}`;
}

/* ---------- IPv6 ---------- */

/** Lê um IPv6 (com ou sem "::") e devolve os 8 grupos de 16 bits, ou null. Aceita IPv4 no fim (::ffff:192.0.2.1). */
export function lerIpv6(s: string): number[] | null {
  let t = s.trim().toLowerCase().split('/')[0]!.split('%')[0]!;
  if (!t) return null;
  // IPv4 embutido no fim.
  const v4 = t.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = lerIp(v4[2]!);
    if (n === null) return null;
    t = `${v4[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const partes = t.split('::');
  if (partes.length > 2) return null;
  const ler = (x: string) => (x === '' ? [] : x.split(':'));
  const antes = ler(partes[0]!);
  const depois = partes.length === 2 ? ler(partes[1]!) : [];
  const grupos = [...antes, ...depois];
  if (grupos.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  if (partes.length === 1 && grupos.length !== 8) return null;
  if (partes.length === 2 && grupos.length > 7) return null;
  const zeros = 8 - grupos.length;
  return [...antes, ...Array(partes.length === 2 ? zeros : 0).fill('0'), ...depois].map((g) => parseInt(g, 16));
}

/** Forma completa: 8 grupos de 4 dígitos. */
export function expandirIpv6(s: string): string | null {
  const g = lerIpv6(s);
  return g ? g.map((x) => x.toString(16).padStart(4, '0')).join(':') : null;
}

/**
 * Forma abreviada da RFC 5952: minúsculas, sem zeros à esquerda, e a maior sequência de dois ou mais
 * grupos zerados vira "::" (no empate, a primeira). Um grupo zero sozinho fica "0".
 */
export function abreviarGrupos(g: number[]): string {
  let melhor = -1;
  let tam = 0;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > tam && j - i >= 2) (melhor = i), (tam = j - i);
    i = j;
  }
  const h = g.map((x) => x.toString(16));
  if (melhor < 0) return h.join(':');
  return `${h.slice(0, melhor).join(':')}::${h.slice(melhor + tam).join(':')}`;
}

export function abreviarIpv6(s: string): string | null {
  const g = lerIpv6(s);
  return g ? abreviarGrupos(g) : null;
}

/** Zera os bits depois do prefixo. */
export function prefixoIpv6(s: string, prefixo = 64): string | null {
  const g = lerIpv6(s);
  if (!g) return null;
  const r = g.map((x, i) => {
    const bits = Math.max(0, Math.min(16, prefixo - i * 16));
    return bits === 0 ? 0 : x & ((0xffff << (16 - bits)) & 0xffff);
  });
  return `${abreviarGrupos(r)}/${prefixo}`;
}

export function mesmoPrefixoIpv6(a: string, b: string, prefixo = 64): boolean {
  const pa = prefixoIpv6(a, prefixo);
  return pa !== null && pa === prefixoIpv6(b, prefixo);
}

/** Lê "aa:bb:cc:dd:ee:ff" (ou com hífens) em 6 bytes. */
export function lerMac(mac: string): number[] | null {
  const p = mac.trim().toLowerCase().split(/[:-]/);
  if (p.length !== 6 || p.some((x) => !/^[0-9a-f]{2}$/.test(x))) return null;
  return p.map((x) => parseInt(x, 16));
}

/**
 * Identificador de interface EUI-64 a partir do MAC: parte o MAC no meio, enfia FF:FE,
 * e inverte o bit universal/local (o sétimo bit do primeiro byte). Devolve os 4 grupos finais.
 */
export function eui64(mac: string): number[] | null {
  const b = lerMac(mac);
  if (!b) return null;
  const x = [b[0]! ^ 0x02, b[1]!, b[2]!, 0xff, 0xfe, b[3]!, b[4]!, b[5]!];
  return [0, 2, 4, 6].map((i) => (x[i]! << 8) | x[i + 1]!);
}

/** Endereço com o prefixo /64 e o EUI-64 do MAC (autoconfiguração sem estado, SLAAC). */
export function enderecoEui64(prefixo: string, mac: string): string | null {
  const g = lerIpv6(prefixo);
  const id = eui64(mac);
  if (!g || !id) return null;
  return abreviarGrupos([...g.slice(0, 4), ...id]);
}

/** Endereço de enlace local: fe80::/64 com o EUI-64. Toda interface IPv6 tem um, sem ninguém configurar. */
export function enlaceLocal(mac: string): string | null {
  return enderecoEui64('fe80::', mac);
}

export function ehEnlaceLocal(s: string): boolean {
  const g = lerIpv6(s);
  return !!g && (g[0]! & 0xffc0) === 0xfe80;
}

/** Multicast de nó solicitado: ff02::1:ff mais os últimos 24 bits. É para onde vai a descoberta de vizinho (o ARP do IPv6). */
export function noSolicitado(s: string): string | null {
  const g = lerIpv6(s);
  if (!g) return null;
  return abreviarGrupos([0xff02, 0, 0, 0, 0, 1, 0xff00 | (g[6]! & 0xff), g[7]!]);
}
