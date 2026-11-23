// Redes definidas por software (ato 4), parte pura: tabela de fluxo de cada equipamento, casamento por campos
// do pacote, prioridade de regras, ações e contadores por regra. O plano de dados (roteamento.ts) consulta a
// tabela antes da tabela de rotas IP; o plano de controle (o controlador lógico central, em cliQos.ts) é quem
// instala as regras e lê os contadores. Aqui não se importa nada do mundo: só tipos e contas de endereço.

import { pertence } from './ip';
import { lerDscp } from './qos';
import { ipTexto, lerCidr, lerIp, type Cidr } from './util';

/** Campos que uma regra pode exigir do pacote. Campo ausente casa com qualquer valor. */
export interface Casamento {
  destino?: string;
  origem?: string;
  /** Número do protocolo IP: 1 ICMP, 6 TCP, 17 UDP. */
  protocolo?: number;
  dscp?: number;
  /** Porta física por onde o pacote entrou. */
  entrada?: string;
}

export type AcaoFluxo =
  | { tipo: 'porta'; porta: string }
  | { tipo: 'descartar' }
  | { tipo: 'controlador' }
  | { tipo: 'normal' }
  | { tipo: 'dscp'; valor: number }
  | { tipo: 'destino'; valor: string };

export interface RegraFluxo {
  id: number;
  prioridade: number;
  casamento: Casamento;
  acoes: AcaoFluxo[];
  contadores: { pacotes: number; bytes: number };
  /** Quem instalou: o controlador por comando (proativa) ou ao responder um pacote que subiu (reativa). */
  origem: 'proativa' | 'reativa';
}

/** O que o plano de dados precisa saber do pacote para casar. */
export interface CamposPacote {
  origem: number;
  destino: number;
  protocolo: number;
  tos?: number;
  tamanho: number;
}

export function fluxosDe(e: { s: Record<string, any> }): RegraFluxo[] {
  return (e.s.fluxos as RegraFluxo[] | undefined) ?? [];
}

export function temFluxos(e: { s: Record<string, any> }): boolean {
  return fluxosDe(e).length > 0;
}

const PROTOS: Record<string, number> = { icmp: 1, tcp: 6, udp: 17 };

function casaPrefixo(txt: string | undefined, ip: number): boolean {
  if (txt === undefined) return true;
  const c = lerCidr(txt.includes('/') ? txt : `${txt}/32`);
  return !!c && pertence(ip, c);
}

/** A regra casa com o pacote? Todos os campos exigidos têm de bater. */
export function casa(r: RegraFluxo, p: CamposPacote, entrada?: string): boolean {
  const c = r.casamento;
  if (!casaPrefixo(c.destino, p.destino) || !casaPrefixo(c.origem, p.origem)) return false;
  if (c.protocolo !== undefined && c.protocolo !== p.protocolo) return false;
  if (c.dscp !== undefined && c.dscp !== ((p.tos ?? 0) >> 2)) return false;
  if (c.entrada !== undefined && c.entrada !== entrada) return false;
  return true;
}

/** Prioridade maior vence; no empate, a instalada antes. */
export function ordenar(regras: RegraFluxo[]): RegraFluxo[] {
  return [...regras].sort((a, b) => b.prioridade - a.prioridade || a.id - b.id);
}

/** A regra que decide o pacote (a de maior prioridade que casa), ou null: perdeu na tabela (table miss). */
export function buscar(regras: RegraFluxo[], p: CamposPacote, entrada?: string): RegraFluxo | null {
  for (const r of ordenar(regras)) if (casa(r, p, entrada)) return r;
  return null;
}

/** Lê "destino=203.0.113.0/24,dscp=EF,entrada=p1,proto=icmp" ou "*" (casa tudo). */
export function lerCasamento(txt: string): Casamento | string {
  const c: Casamento = {};
  if (txt === '*' || txt === 'tudo') return c;
  for (const parte of txt.split(',').filter(Boolean)) {
    const [k, v] = parte.split('=');
    if (!k || v === undefined || v === '') return `Campo sem valor: "${parte}". Use campo=valor.`;
    switch (k.toLowerCase()) {
      case 'destino':
      case 'dst':
      case 'origem':
      case 'src': {
        const ok = lerCidr(v.includes('/') ? v : `${v}/32`);
        if (!ok) return `"${v}" não é endereço nem prefixo.`;
        const t = v.includes('/') ? v : `${v}/32`;
        if (k === 'destino' || k === 'dst') c.destino = t;
        else c.origem = t;
        break;
      }
      case 'proto':
      case 'protocolo': {
        const n = PROTOS[v.toLowerCase()] ?? Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 255) return `Protocolo "${v}" não existe. Use icmp, tcp, udp ou o número.`;
        c.protocolo = n;
        break;
      }
      case 'dscp': {
        const d = lerDscp(v);
        if (d === null) return `DSCP "${v}" não existe. Use EF, AF41, BE... ou um número de 0 a 63.`;
        c.dscp = d;
        break;
      }
      case 'entrada':
      case 'porta':
        c.entrada = v;
        break;
      default:
        return `Campo "${k}" não existe. Campos: destino, origem, proto, dscp, entrada.`;
    }
  }
  return c;
}

/** Lê "porta:p3", "descartar", "controlador", "normal", "dscp=EF", "destino=192.0.2.9", juntos com "+". */
export function lerAcoes(txt: string): AcaoFluxo[] | string {
  const out: AcaoFluxo[] = [];
  for (const parte of txt.split('+').filter(Boolean)) {
    const p = parte.toLowerCase();
    if (p === 'descartar' || p === 'drop') out.push({ tipo: 'descartar' });
    else if (p === 'controlador') out.push({ tipo: 'controlador' });
    else if (p === 'normal' || p === 'rotas') out.push({ tipo: 'normal' });
    else if (p.startsWith('porta:') || p.startsWith('encaminhar:')) {
      const porta = parte.split(':')[1] ?? '';
      if (!porta) return 'porta:<nome>, por exemplo porta:p3';
      out.push({ tipo: 'porta', porta });
    } else if (p.startsWith('dscp=')) {
      const d = lerDscp(parte.slice(5));
      if (d === null) return `DSCP "${parte.slice(5)}" não existe.`;
      out.push({ tipo: 'dscp', valor: d });
    } else if (p.startsWith('destino=')) {
      const ip = lerIp(parte.slice(8));
      if (ip === null) return `"${parte.slice(8)}" não é endereço IP.`;
      out.push({ tipo: 'destino', valor: ipTexto(ip) });
    } else return `Ação "${parte}" não existe. Ações: porta:<p>, descartar, controlador, normal, dscp=<classe>, destino=<ip>; junte com "+".`;
  }
  if (!out.length) return 'Diga a ação: porta:<p>, descartar, controlador, normal, dscp=<classe>, destino=<ip>.';
  const encaminha = out.filter((a) => a.tipo === 'porta' || a.tipo === 'descartar' || a.tipo === 'controlador' || a.tipo === 'normal');
  if (encaminha.length > 1) return 'Uma regra só pode ter um destino final: porta, descartar, controlador ou normal.';
  return out;
}

export function textoCasamento(c: Casamento): string {
  const l = [c.destino && `destino=${c.destino}`, c.origem && `origem=${c.origem}`, c.protocolo !== undefined && `proto=${({ 1: 'icmp', 6: 'tcp', 17: 'udp' } as Record<number, string>)[c.protocolo] ?? c.protocolo}`, c.dscp !== undefined && `dscp=${c.dscp}`, c.entrada && `entrada=${c.entrada}`].filter(Boolean);
  return l.length ? l.join(',') : '*';
}

export function textoAcoes(a: AcaoFluxo[]): string {
  return a.map((x) => (x.tipo === 'porta' ? `porta:${x.porta}` : x.tipo === 'dscp' ? `dscp=${x.valor}` : x.tipo === 'destino' ? `destino=${x.valor}` : x.tipo)).join('+');
}

/** Instala (ou troca, se já houver uma com o mesmo casamento e a mesma prioridade) uma regra na tabela. */
export function instalarRegra(e: { s: Record<string, any> }, prioridade: number, casamento: Casamento, acoes: AcaoFluxo[], origem: RegraFluxo['origem'] = 'proativa'): RegraFluxo {
  const lista = ((e.s.fluxos as RegraFluxo[] | undefined) ??= []);
  const chave = textoCasamento(casamento);
  const i = lista.findIndex((r) => r.prioridade === prioridade && textoCasamento(r.casamento) === chave);
  const id = i >= 0 ? lista[i]!.id : (e.s.proxFluxo = ((e.s.proxFluxo as number | undefined) ?? 0) + 1);
  const r: RegraFluxo = { id, prioridade, casamento, acoes, contadores: { pacotes: 0, bytes: 0 }, origem };
  if (i >= 0) lista[i] = r;
  else lista.push(r);
  return r;
}

export interface DecisaoFluxo {
  regra: RegraFluxo | null;
  /** O que fazer com o pacote: sair por uma porta, morrer, subir ao controlador ou seguir a tabela de rotas. */
  destino: 'porta' | 'descartar' | 'controlador' | 'normal' | 'sem-regra';
  porta?: string;
  /** Reescritas a aplicar no pacote. */
  novoTos?: number;
  novoDestino?: number;
}

/** Consulta a tabela e conta o pacote na regra que casou. */
export function decidir(regras: RegraFluxo[], p: CamposPacote, entrada?: string): DecisaoFluxo {
  const r = buscar(regras, p, entrada);
  if (!r) return { regra: null, destino: 'sem-regra' };
  r.contadores.pacotes++;
  r.contadores.bytes += p.tamanho;
  const d: DecisaoFluxo = { regra: r, destino: 'normal' };
  for (const a of r.acoes) {
    if (a.tipo === 'dscp') d.novoTos = ((a.valor & 63) << 2) | ((p.tos ?? 0) & 3);
    else if (a.tipo === 'destino') d.novoDestino = lerIp(a.valor) ?? undefined;
    else if (a.tipo === 'porta') (d.destino = 'porta'), (d.porta = a.porta);
    else d.destino = a.tipo;
  }
  return d;
}

/** Prefixo que contém o IP, numa lista de prefixos em texto (o mais longo vence). */
export function prefixoQueContem(lista: string[], ip: number): string | null {
  let melhor: { t: string; c: Cidr } | null = null;
  for (const t of lista) {
    const c = lerCidr(t);
    if (c && pertence(ip, c) && (!melhor || c.prefixo > melhor.c.prefixo)) melhor = { t, c };
  }
  return melhor?.t ?? null;
}
