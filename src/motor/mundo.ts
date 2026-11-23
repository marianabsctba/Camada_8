// O mundo de um dia: equipamentos, cabos e o que você já respondeu.

import { rngSemente, type Cidr } from './util';
import { T568B, type Cor } from './fisico';

export type TipoEquip =
  | 'pc'
  | 'roteador'
  | 'switch'
  | 'hub'
  | 'radio'
  | 'modem'
  | 'mux'
  | 'ap'
  | 'cablemodem'
  | 'cmts'
  | 'terminal-sat'
  | 'gateway-sat'
  | 'enlace'
  | 'canal';

/** Equipamentos que repassam quadros sem ser o destino. */
export const REPASSAM: ReadonlySet<TipoEquip> = new Set<TipoEquip>([
  'switch',
  'hub',
  'radio',
  'cmts',
  'cablemodem',
  'terminal-sat',
  'gateway-sat',
]);

export type Meio = 'cat5e' | 'cat6' | 'cat6a' | 'fibra' | 'radio' | 'coax' | 'satelite';
export type Fibra = 'os2' | 'om1' | 'om3' | 'om4';

export interface Transceptor {
  modelo: string;
  modo: 'mm' | 'sm';
  lambda: number; // nm
  velocidade: number; // Mb/s
  txDbm: number;
  sensDbm: number;
  saturaDbm: number;
  descricao: string;
}

export const TRANSCEPTORES: Record<string, Transceptor> = {
  'LX-10': { modelo: 'LX-10', modo: 'sm', lambda: 1310, velocidade: 1000, txDbm: -5, sensDbm: -20, saturaDbm: -3, descricao: '1 Gb/s, monomodo, 1310 nm, até 10 km' },
  'ER-40': { modelo: 'ER-40', modo: 'sm', lambda: 1550, velocidade: 1000, txDbm: 1, sensDbm: -23, saturaDbm: -3, descricao: '1 Gb/s, monomodo, 1550 nm, até 40 km' },
  'ZX-80': { modelo: 'ZX-80', modo: 'sm', lambda: 1550, velocidade: 1000, txDbm: 4, sensDbm: -24, saturaDbm: -3, descricao: '1 Gb/s, monomodo, 1550 nm, até 80 km. Grita.' },
  'SR-10G': { modelo: 'SR-10G', modo: 'mm', lambda: 850, velocidade: 10000, txDbm: -2, sensDbm: -11, saturaDbm: 0, descricao: '10 Gb/s, multimodo, 850 nm, curto alcance' },
};

export interface Porta {
  nome: string;
  fisica: 'rj45' | 'sfp' | 'coax' | 'antena' | 'sat';
  mdix: boolean; // auto-MDIX
  mdi: 'mdi' | 'mdix';
  velocidades: number[];
  sfp?: Transceptor;
  atenuadorDb?: number;
  contadores: { tx: number; rx: number; crc: number };
  /** VLAN de acesso da porta de switch (padrão 1). */
  vlan?: number;
  /** Se definido, a porta é tronco 802.1Q e carrega estas VLANs (a 1 vai sem etiqueta, como nativa). */
  tronco?: number[];
  /** Maior pacote IP (cabeçalho incluído) que sai por esta porta. Padrão: 1500, o do Ethernet. */
  mtu?: number;
  /** Porta derrubada de propósito ("derrubar"): o enlace dela cai, como cabo cortado, até "levantar". */
  desligada?: boolean;
}

export interface Antena {
  ganho: number; // dBi
  azimute: number;
  azimuteCerto: number;
  altura: number; // m acima do solo
  feixe: number; // largura de feixe de meia potência, graus
}

export interface Equipamento {
  nome: string;
  tipo: TipoEquip;
  modelo: string;
  mac: string;
  portas: Porta[];
  ip?: Cidr;
  ttl: number;
  antena?: Antena;
  s: Record<string, any>; // estado específico do aparelho
}

export interface Ponta {
  equip: string;
  porta: string;
}

export interface Segmento {
  nome: string;
  fibra: Fibra;
  metros: number;
}

export interface ElementoCoax {
  tipo: 'cabo' | 'splitter' | 'conector' | 'amplificador' | 'atenuador';
  modelo?: 'rg59' | 'rg6';
  metros?: number;
  vias?: number;
  oxidado?: boolean;
  db?: number;
}

export interface Cabo {
  id: string;
  a: Ponta;
  b: Ponta;
  meio: Meio;
  metros: number;
  pinosA?: (Cor | null)[];
  pinosB?: (Cor | null)[];
  blindado?: boolean;
  aterrado?: boolean;
  ruidoDb?: number;
  afastado?: boolean;
  segmentos?: Segmento[];
  conectores?: number;
  emendas?: { metros: number; perdaDb: number }[];
  ruptura?: number;
  radio?: { distanciaKm: number; freqGHz: number; obstaculoM: number; ptxDbm: number };
  sat?: { orbita: 'geo' | 'meo' | 'leo' };
  coax?: { tapDbmv: number; elementos: ElementoCoax[] };
  nota?: string;
  /** MTU do enlace (um túnel ou um enlace antigo pode ter menos que 1500). */
  mtu?: number;
}

export interface Captura {
  eth: { origem: string; destino: string; etherType: number };
  ip: { origem: number; destino: number; ttl: number; protocolo: number; tamanho: number };
  icmp: { tipo: number; codigo: number; id: number; seq: number };
  /** Só na camada de rede (com roteador no caminho): o resto do cabeçalho IPv4 e o que aconteceu no caminho. */
  detalhe?: {
    identificacao: number;
    df: boolean;
    checksum: number;
    confere: boolean;
    ttlSaida: number;
    roteadores: string[];
    fragmentos: { deslocamento: number; dados: number; mf: boolean }[];
    dados: number;
  };
}

export interface Mundo {
  equipamentos: Map<string, Equipamento>;
  cabos: Map<string, Cabo>;
  respostas: Record<string, string>;
  rng: () => number;
  flags: Record<string, any>;
  catalogo: Record<string, { descricao: string; criar: (nome: string) => Equipamento }>;
  proxCabo: number;
  proxMac: number;
  ultimaCaptura?: Captura;
}

export function novoMundo(semente: number): Mundo {
  return {
    equipamentos: new Map(),
    cabos: new Map(),
    respostas: {},
    rng: rngSemente(semente),
    flags: {},
    catalogo: {},
    proxCabo: 1,
    proxMac: 1,
  };
}

function porta(nome: string, extra: Partial<Porta> = {}): Porta {
  return {
    nome,
    fisica: 'rj45',
    mdix: true,
    mdi: 'mdix',
    velocidades: [10, 100, 1000],
    contadores: { tx: 0, rx: 0, crc: 0 },
    ...extra,
  };
}

export function adicionar(m: Mundo, e: Equipamento): Equipamento {
  if (m.equipamentos.has(e.nome)) throw new Error(`já existe ${e.nome}`);
  e.mac = `02:c8:00:00:${(m.proxMac >> 8).toString(16).padStart(2, '0')}:${(m.proxMac & 255).toString(16).padStart(2, '0')}`;
  m.proxMac++;
  m.equipamentos.set(e.nome, e);
  return e;
}

export function pc(nome: string, o: { ip?: Cidr; ttl?: number; modelo?: string; velocidades?: number[]; mdix?: boolean; gateway?: string } = {}): Equipamento {
  return {
    nome,
    tipo: 'pc',
    modelo: o.modelo ?? 'PC genérico',
    mac: '',
    ip: o.ip,
    ttl: o.ttl ?? 64,
    portas: [porta('eth0', { mdi: 'mdi', mdix: o.mdix ?? false, velocidades: o.velocidades ?? [10, 100, 1000] })],
    s: o.gateway ? { gateway: o.gateway } : {},
  };
}

/**
 * Roteador da camada de rede (ato 4): portas com endereço IP, rotas estáticas e, se quiser, NAT e DHCP.
 * Já vem ligado e sem senha. interfaces: { porta: '192.0.2.1/24' }; rotas: [{ destino: '10.0.0.0/8', via: '192.0.2.2' }].
 */
export function roteador(
  nome: string,
  o: {
    modelo?: string;
    portas?: string[];
    interfaces?: Record<string, string>;
    rotas?: { destino: string; via: string }[];
    ttl?: number;
  } = {},
): Equipamento {
  const nomes = o.portas ?? Object.keys(o.interfaces ?? {});
  const e = aparelho(nome, 'roteador', o.modelo ?? 'Roteador genérico', (nomes.length ? nomes : ['p1', 'p2']).map((n) => ({ nome: n })), {
    estado: 'ligado',
    senha: null,
    senhaRunning: null,
    logado: false,
    inicio: 'normal',
    startup: [],
    running: [],
    interfaces: { ...(o.interfaces ?? {}) },
    rotas: [...(o.rotas ?? [])],
  });
  e.ttl = o.ttl ?? 255;
  return e;
}

export function comutador(
  nome: string,
  o: {
    tipo?: 'switch' | 'hub';
    modelo?: string;
    portas?: number;
    velocidades?: number[];
    mdix?: boolean;
    uplink?: boolean;
    sfp?: number;
  } = {},
): Equipamento {
  const n = o.portas ?? 8;
  const portas: Porta[] = [];
  for (let i = 1; i <= n; i++) {
    const ultima = i === n && o.uplink;
    portas.push(
      porta(ultima ? 'uplink' : `p${i}`, {
        mdi: ultima ? 'mdi' : 'mdix',
        mdix: o.mdix ?? true,
        velocidades: o.velocidades ?? [10, 100, 1000],
      }),
    );
  }
  for (let i = 1; i <= (o.sfp ?? 0); i++) {
    portas.push(porta(`sfp${i}`, { fisica: 'sfp', velocidades: [1000, 10000] }));
  }
  return { nome, tipo: o.tipo ?? 'switch', modelo: o.modelo ?? 'Switch genérico', mac: '', ttl: 64, portas, s: {} };
}

export function aparelho(
  nome: string,
  tipo: TipoEquip,
  modelo: string,
  portas: { nome: string; fisica?: Porta['fisica']; velocidades?: number[]; mdi?: Porta['mdi']; mdix?: boolean }[],
  s: Record<string, any> = {},
): Equipamento {
  return {
    nome,
    tipo,
    modelo,
    mac: '',
    ttl: 64,
    portas: portas.map((p) => porta(p.nome, { fisica: p.fisica ?? 'rj45', velocidades: p.velocidades ?? [10, 100, 1000], mdi: p.mdi ?? 'mdi', mdix: p.mdix ?? true })),
    s,
  };
}

export function lerPonta(m: Mundo, texto: string): Ponta | string {
  const [eq, nomePorta] = texto.split(':');
  const e = m.equipamentos.get(eq ?? '');
  if (!e) return `Não conheço nenhum equipamento chamado "${eq}". Tente "mapa".`;
  if (!nomePorta) {
    if (e.portas.length === 1) return { equip: e.nome, porta: e.portas[0]!.nome };
    return `${e.nome} tem ${e.portas.length} portas. Diga qual: ${e.nome}:${e.portas[0]!.nome}`;
  }
  if (!e.portas.some((p) => p.nome === nomePorta)) {
    return `${e.nome} não tem porta "${nomePorta}". Portas: ${e.portas.map((p) => p.nome).join(', ')}.`;
  }
  return { equip: e.nome, porta: nomePorta };
}

export function acharPorta(m: Mundo, p: Ponta): Porta {
  const e = m.equipamentos.get(p.equip);
  const porta = e?.portas.find((x) => x.nome === p.porta);
  if (!porta) throw new Error(`porta inexistente ${p.equip}:${p.porta}`);
  return porta;
}

export function caboNaPorta(m: Mundo, p: Ponta): Cabo | undefined {
  for (const c of m.cabos.values()) {
    if ((c.a.equip === p.equip && c.a.porta === p.porta) || (c.b.equip === p.equip && c.b.porta === p.porta)) return c;
  }
  return undefined;
}

/** Cabo de fábrica: cobre crimpado em T568B nas duas pontas, ou fibra num segmento só. */
export function ligar(m: Mundo, a: Ponta, b: Ponta, meio: Meio, metros: number, extra: Partial<Cabo> = {}): Cabo {
  const id = extra.id ?? `c${m.proxCabo++}`;
  const c: Cabo = { id, a, b, meio, metros, ...extra };
  if (meio === 'cat5e' || meio === 'cat6' || meio === 'cat6a') {
    c.pinosA = c.pinosA ?? [...T568B];
    c.pinosB = c.pinosB ?? [...T568B];
  }
  if (meio === 'fibra' && !c.segmentos) {
    c.segmentos = [{ nome: 'tronco', fibra: 'os2', metros }];
    c.conectores = c.conectores ?? 2;
  }
  m.cabos.set(id, c);
  return c;
}
