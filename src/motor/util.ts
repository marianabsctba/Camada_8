// Utilidades do motor: aleatório reprodutível, endereços IP e números em pt-BR.

export const LUZ = 299_792_458; // m/s no vácuo

/** Gerador mulberry32: mesma semente, mesmo dia, mesmo resultado. */
export function rngSemente(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function lerIp(s: string): number | null {
  const p = s.trim().split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const parte of p) {
    if (!/^\d{1,3}$/.test(parte)) return null;
    const v = Number(parte);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function ipTexto(n: number): string {
  return [24, 16, 8, 0].map((d) => (n >>> d) & 255).join('.');
}

export interface Cidr {
  endereco: number;
  prefixo: number;
}

export function lerCidr(s: string): Cidr | null {
  const [ip, pre] = s.split('/');
  const endereco = lerIp(ip ?? '');
  const prefixo = pre === undefined ? NaN : Number(pre);
  if (endereco === null || !Number.isInteger(prefixo) || prefixo < 0 || prefixo > 32) return null;
  return { endereco, prefixo };
}

export function mascara(prefixo: number): number {
  return prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
}

export function mesmaRede(a: number, b: number, prefixo: number): boolean {
  const m = mascara(prefixo);
  return ((a & m) >>> 0) === ((b & m) >>> 0);
}

/** Número com vírgula decimal. */
export function fmt(n: number, casas = 1): string {
  return n.toFixed(casas).replace('.', ',');
}

/** Aceita vírgula ou ponto, e ignora unidades no fim ("12,5 MB/s"). */
export function lerNumero(s: string): number | null {
  const m = s.trim().replace(',', '.').match(/^[-+]?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function perto(resposta: string, certo: number, tolerancia: number): boolean {
  const n = lerNumero(resposta);
  return n !== null && Math.abs(n - certo) <= tolerancia;
}

export function db(x: number): number {
  return 10 * Math.log10(x);
}

export function deDb(x: number): number {
  return Math.pow(10, x / 10);
}
