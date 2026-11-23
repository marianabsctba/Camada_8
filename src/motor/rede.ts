// Enlace e rede: caminho entre hosts, ping, captura e vazão, mais o que o switch faz no ato 3:
// aprende endereços MAC, monta a árvore do spanning tree e separa VLANs.
// O roteador que repassa pacotes (ato 4) mora em roteamento.ts; aqui fica a mesma rede, atravessando switch, hub e rádio.

import { Simulador } from './eventos';
import { avaliar, type EstadoEnlace } from './fisico';
import { acharPorta, caboNaPorta, REPASSAM, type Cabo, type Equipamento, type Mundo, type Ponta, type Porta } from './mundo';
import { ipTexto, mesmaRede } from './util';
import { pingRoteado, usaRoteamento, type OpcoesPing } from './roteamento';

export interface Salto {
  cabo: Cabo;
  estado: EstadoEnlace;
  de: string;
  para: string;
}

/* ---------- Spanning tree (802.1D) ---------- */

/** Custo do enlace pela velocidade, como no 802.1D revisado. */
export function custoStp(mbps: number): number {
  return mbps <= 10 ? 100 : mbps <= 100 ? 19 : mbps <= 1000 ? 4 : 2;
}

/** Switch participa da árvore? Ligado por padrão; switch barato vem com s.stp = false. */
export function stpLigado(e: Equipamento): boolean {
  return e.tipo === 'switch' && e.s.stp !== false;
}

export function prioridade(e: Equipamento): number {
  return e.s.prioridade ?? 32768;
}

/** Identificador de ponte: prioridade e, no empate, o MAC. Menor vence. */
export function idPonte(e: Equipamento): string {
  return `${prioridade(e)}.${e.mac}`;
}

function compararPonte(a: Equipamento, b: Equipamento): number {
  return prioridade(a) - prioridade(b) || (a.mac < b.mac ? -1 : a.mac > b.mac ? 1 : 0);
}

export type PapelPorta = 'raiz' | 'designada' | 'bloqueada' | 'desligada';

export interface EstadoStp {
  raiz: string;
  custo: number;
  portaRaiz?: string;
  portas: Record<string, PapelPorta>;
}

interface Enlace {
  cabo: Cabo;
  estado: EstadoEnlace;
}

function enlacesAtivos(m: Mundo): Enlace[] {
  const out: Enlace[] = [];
  for (const c of m.cabos.values()) {
    const estado = avaliar(m, c);
    if (estado.up) out.push({ cabo: c, estado });
  }
  return out;
}

const indicePorta = (e: Equipamento, porta: string) => e.portas.findIndex((p) => p.nome === porta);

/**
 * Calcula a árvore em cada ilha de switches com STP ligado: elege a raiz (menor prioridade e MAC),
 * acha o custo até ela, a porta raiz de cada switch e a porta designada de cada enlace. O resto bloqueia.
 * Simplificação: hub e switch com STP desligado não repassam BPDU, então a árvore não enxerga através deles.
 */
export function calcularStp(m: Mundo, enlaces = enlacesAtivos(m)): Map<string, EstadoStp> {
  const nos = [...m.equipamentos.values()].filter(stpLigado);
  const nomes = new Set(nos.map((e) => e.nome));
  const arestas = enlaces.filter((l) => l.cabo.a.equip !== l.cabo.b.equip && nomes.has(l.cabo.a.equip) && nomes.has(l.cabo.b.equip));
  const vizinhos = new Map<string, { l: Enlace; meu: string; outro: string; portaOutro: string }[]>();
  for (const e of nos) vizinhos.set(e.nome, []);
  for (const l of arestas) {
    vizinhos.get(l.cabo.a.equip)!.push({ l, meu: l.cabo.a.porta, outro: l.cabo.b.equip, portaOutro: l.cabo.b.porta });
    vizinhos.get(l.cabo.b.equip)!.push({ l, meu: l.cabo.b.porta, outro: l.cabo.a.equip, portaOutro: l.cabo.a.porta });
  }
  const eq = (n: string) => m.equipamentos.get(n)!;
  const r = new Map<string, EstadoStp>();
  const visto = new Set<string>();
  for (const inicio of nos) {
    if (visto.has(inicio.nome)) continue;
    // Ilha conectada de switches com STP.
    const ilha: string[] = [];
    const fila = [inicio.nome];
    visto.add(inicio.nome);
    while (fila.length) {
      const x = fila.shift()!;
      ilha.push(x);
      for (const v of vizinhos.get(x)!) if (!visto.has(v.outro)) (visto.add(v.outro), fila.push(v.outro));
    }
    const raiz = ilha.map(eq).sort(compararPonte)[0]!;
    // Custo até a raiz (Dijkstra simples, as ilhas são pequenas).
    const custo = new Map<string, number>(ilha.map((n) => [n, n === raiz.nome ? 0 : Infinity]));
    const feito = new Set<string>();
    while (feito.size < ilha.length) {
      let x = '';
      for (const n of ilha) if (!feito.has(n) && (x === '' || custo.get(n)! < custo.get(x)!)) x = n;
      feito.add(x);
      for (const v of vizinhos.get(x)!) {
        const c = custo.get(x)! + custoStp(v.l.estado.velocidade);
        if (c < custo.get(v.outro)!) custo.set(v.outro, c);
      }
    }
    // Porta raiz: menor (custo pelo vizinho, ponte vizinha, porta vizinha, porta minha).
    for (const n of ilha) {
      const e = eq(n);
      const est: EstadoStp = { raiz: raiz.nome, custo: custo.get(n)!, portas: {} };
      if (n !== raiz.nome) {
        let melhor: { chave: (number | string)[]; porta: string } | null = null;
        for (const v of vizinhos.get(n)!) {
          const chave = [custo.get(v.outro)! + custoStp(v.l.estado.velocidade), idPonte(eq(v.outro)), indicePorta(eq(v.outro), v.portaOutro), indicePorta(e, v.meu)];
          if (!melhor || menorChave(chave, melhor.chave)) melhor = { chave, porta: v.meu };
        }
        est.portaRaiz = melhor?.porta;
      }
      for (const p of e.portas) est.portas[p.nome] = 'desligada';
      for (const l of enlaces) {
        if (l.cabo.a.equip === n) est.portas[l.cabo.a.porta] = 'designada';
        if (l.cabo.b.equip === n) est.portas[l.cabo.b.porta] = 'designada';
      }
      r.set(n, est);
    }
    // Em cada enlace entre dois switches da ilha, só um lado é designado.
    for (const l of arestas) {
      const { a, b } = l.cabo;
      if (!ilha.includes(a.equip)) continue;
      const ea = eq(a.equip);
      const eb = eq(b.equip);
      const ka = [custo.get(a.equip)!, idPonte(ea), indicePorta(ea, a.porta)];
      const kb = [custo.get(b.equip)!, idPonte(eb), indicePorta(eb, b.porta)];
      const perdedor = menorChave(ka, kb) ? b : a;
      const est = r.get(perdedor.equip)!;
      est.portas[perdedor.porta] = est.portaRaiz === perdedor.porta ? 'raiz' : 'bloqueada';
    }
  }
  return r;
}

function menorChave(a: (number | string)[], b: (number | string)[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < b[i]!) return true;
    if (a[i]! > b[i]!) return false;
  }
  return false;
}

function bloqueada(stp: Map<string, EstadoStp>, p: Ponta): boolean {
  return stp.get(p.equip)?.portas[p.porta] === 'bloqueada';
}

/* ---------- Laços e tempestade de broadcast ---------- */

/**
 * Equipamentos que repassam quadro e estão dentro de algum laço que a árvore não cortou.
 * Monta o grafo de quem repassa, tira as portas bloqueadas e poda as folhas: o que sobra é laço.
 */
export function nosEmLaco(m: Mundo, enlaces = enlacesAtivos(m), stp = calcularStp(m, enlaces)): Set<string> {
  const grau = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const l of enlaces) {
    const { a, b } = l.cabo;
    const ea = m.equipamentos.get(a.equip);
    const eb = m.equipamentos.get(b.equip);
    if (!ea || !eb || !REPASSAM.has(ea.tipo) || !REPASSAM.has(eb.tipo)) continue;
    if (bloqueada(stp, a) || bloqueada(stp, b)) continue;
    for (const [x, y] of [[a.equip, b.equip], [b.equip, a.equip]] as const) {
      grau.set(x, (grau.get(x) ?? 0) + 1);
      adj.set(x, [...(adj.get(x) ?? []), y]);
    }
  }
  const fila = [...grau].filter(([, g]) => g < 2).map(([n]) => n);
  const fora = new Set<string>();
  while (fila.length) {
    const n = fila.shift()!;
    if (fora.has(n)) continue;
    fora.add(n);
    for (const v of adj.get(n) ?? []) {
      if (fora.has(v)) continue;
      grau.set(v, grau.get(v)! - 1);
      if (grau.get(v)! < 2) fila.push(v);
    }
  }
  return new Set([...grau.keys()].filter((n) => !fora.has(n)));
}

/** Se o quadro de broadcast que sai de "origem" cai num laço sem árvore, devolve os aparelhos do laço. */
export function tempestade(m: Mundo, origem: string): string[] | null {
  const enlaces = enlacesAtivos(m);
  const stp = calcularStp(m, enlaces);
  const laco = nosEmLaco(m, enlaces, stp);
  if (!laco.size) return null;
  const visto = new Set([origem]);
  const fila = [origem];
  while (fila.length) {
    const x = fila.shift()!;
    if (laco.has(x)) return [...laco].sort();
    const ex = m.equipamentos.get(x)!;
    if (x !== origem && !REPASSAM.has(ex.tipo)) continue;
    for (const l of enlaces) {
      const { a, b } = l.cabo;
      const [meu, outro] = a.equip === x ? [a, b] : b.equip === x ? [b, a] : [null, null];
      if (!meu || !outro || visto.has(outro.equip) || bloqueada(stp, meu) || bloqueada(stp, outro)) continue;
      visto.add(outro.equip);
      fila.push(outro.equip);
    }
  }
  return null;
}

/** O switch está no meio de uma tempestade (CPU a 100 %)? */
export function emTempestade(m: Mundo, nome: string): boolean {
  return tempestade(m, nome) !== null;
}

export function textoTempestade(lista: string[]): string {
  return `Tempestade de broadcast no laço entre ${lista.join(', ')}: o pedido de ARP sai por todas as portas, volta pelo outro lado, sai de novo e se multiplica sem fim. Ethernet não tem TTL. A CPU dos switches foi a 100 % e nada mais passa. Ligue o STP em todos os switches do laço ou tire um cabo.`;
}

/* ---------- VLANs ---------- */

export function ehTronco(p: Porta): boolean {
  return Array.isArray(p.tronco);
}

/** VLAN de quem está ligado direto numa porta de acesso de switch; "tronco" ou undefined se não der para dizer. */
export function vlanDoHost(m: Mundo, nome: string): number | 'tronco' | undefined {
  const e = m.equipamentos.get(nome);
  if (!e) return undefined;
  for (const p of e.portas) {
    const c = caboNaPorta(m, { equip: e.nome, porta: p.nome });
    if (!c) continue;
    const outra = c.a.equip === e.nome && c.a.porta === p.nome ? c.b : c.a;
    const sw = m.equipamentos.get(outra.equip);
    if (sw?.tipo !== 'switch') continue;
    const po = acharPorta(m, outra);
    return ehTronco(po) ? 'tronco' : (po.vlan ?? 1);
  }
  return undefined;
}

/**
 * Etiqueta ao sair de uma porta de switch, com o quadro na VLAN v: null é sem etiqueta,
 * undefined é "não sai por aqui". A VLAN 1 é a nativa do tronco e vai sem etiqueta.
 */
function sairDoSwitch(p: Porta, v: number): number | null | undefined {
  if (ehTronco(p)) return p.tronco!.includes(v) ? (v === 1 ? null : v) : undefined;
  return (p.vlan ?? 1) === v ? null : undefined;
}

/** VLAN do quadro ao entrar numa porta de switch; undefined é descarte. */
function entrarNoSwitch(p: Porta, etiqueta: number | null): number | undefined {
  if (ehTronco(p)) {
    const v = etiqueta ?? 1;
    return p.tronco!.includes(v) ? v : undefined;
  }
  return etiqueta === null ? (p.vlan ?? 1) : undefined;
}

/**
 * Busca em largura por enlaces ativos, atravessando só quem repassa quadro.
 * Respeita a árvore do STP (porta bloqueada não repassa) e as VLANs: o estado da busca é o aparelho
 * mais a VLAN (dentro do switch) ou a etiqueta 802.1Q (no fio). Host só aceita quadro sem etiqueta.
 */
export function caminho(m: Mundo, origem: string, destino: string, o: { ignorarVlan?: boolean; portaOrigem?: string; portaDestino?: string } = {}): Salto[] | null {
  const enlaces = enlacesAtivos(m);
  const stp = calcularStp(m, enlaces);
  const chave = (n: string, x: number | null) => `${n}#${x ?? '-'}`;
  const inicio = chave(origem, null);
  const anterior = new Map<string, { salto: Salto; de: string } | null>([[inicio, null]]);
  const fila: [string, number | null][] = [[origem, null]];
  let fim: string | null = null;
  while (fila.length) {
    const [atual, x] = fila.shift()!;
    if (atual === destino) {
      fim = chave(atual, x);
      break;
    }
    const eq = m.equipamentos.get(atual)!;
    if (atual !== origem && !REPASSAM.has(eq.tipo)) continue;
    for (const { cabo: c, estado } of enlaces) {
      const [meu, outra] = c.a.equip === atual ? [c.a, c.b] : c.b.equip === atual ? [c.b, c.a] : [null, null];
      if (!meu || !outra) continue;
      if (atual === origem && o.portaOrigem && meu.porta !== o.portaOrigem) continue;
      if (outra.equip === destino && o.portaDestino && outra.porta !== o.portaDestino) continue;
      if (bloqueada(stp, meu) || bloqueada(stp, outra)) continue;
      const viz = m.equipamentos.get(outra.equip)!;
      let etiqueta: number | null | undefined = x;
      let y: number | null | undefined;
      if (o.ignorarVlan) y = null;
      else {
        if (eq.tipo === 'switch') etiqueta = sairDoSwitch(acharPorta(m, meu), x ?? 1);
        if (etiqueta === undefined) continue;
        if (viz.tipo === 'switch') y = entrarNoSwitch(acharPorta(m, outra), etiqueta);
        else if (REPASSAM.has(viz.tipo)) y = etiqueta;
        else y = etiqueta === null ? null : undefined;
        if (y === undefined) continue;
      }
      const k = chave(outra.equip, y);
      if (anterior.has(k)) continue;
      anterior.set(k, { salto: { cabo: c, estado, de: atual, para: outra.equip }, de: chave(atual, x) });
      fila.push([outra.equip, y]);
    }
  }
  if (!fim) return null;
  const saltos: Salto[] = [];
  let p = fim;
  while (p !== inicio) {
    const s = anterior.get(p)!;
    saltos.unshift(s.salto);
    p = s.de;
  }
  return saltos;
}

/* ---------- Switch que aprende ---------- */

export const BROADCAST = 'ff:ff:ff:ff:ff:ff';

export function tabelaMac(e: Equipamento): Record<string, string> {
  return (e.s.tabelaMac ??= {});
}

/**
 * Passa um quadro pelos saltos: cada switch aprende o MAC de origem na porta de entrada e,
 * se não conhece o destino, inunda as outras portas (conta em m.flags.inundacoes). Hub não aprende.
 * Devolve os switches que inundaram.
 */
export function aprenderNoCaminho(m: Mundo, saltos: Salto[], macOrigem: string, macDestino: string): string[] {
  const inundou: string[] = [];
  for (const s of saltos) aprenderNoSalto(m, s, macOrigem, macDestino, inundou);
  return inundou;
}

export function aprenderNoSalto(m: Mundo, s: Salto, macOrigem: string, macDestino: string, inundou: string[] = []) {
  const e = m.equipamentos.get(s.para);
  if (e?.tipo !== 'switch') return;
  const entrada = s.cabo.a.equip === s.para ? s.cabo.a.porta : s.cabo.b.porta;
  const t = tabelaMac(e);
  t[macOrigem] = entrada;
  if (macDestino === BROADCAST) m.flags.broadcasts = (m.flags.broadcasts ?? 0) + 1;
  else if (!(macDestino in t)) {
    m.flags.inundacoes = (m.flags.inundacoes ?? 0) + 1;
    inundou.push(e.nome);
  }
}

/** Manda um quadro de "de" para "para" (unicast, ou broadcast) e devolve o caminho e quem inundou. */
export function passarQuadro(m: Mundo, de: string, para: string, broadcast = false): { saltos: Salto[]; inundou: string[] } | null {
  const a = m.equipamentos.get(de);
  const b = m.equipamentos.get(para);
  if (!a || !b) return null;
  const saltos = caminho(m, de, para);
  if (!saltos) return null;
  return { saltos, inundou: aprenderNoCaminho(m, saltos, a.mac, broadcast ? BROADCAST : b.mac) };
}

/** Envelhecimento: esvazia a tabela MAC de um switch (ou de todos). */
export function limparTabelas(m: Mundo, nome?: string): number {
  let n = 0;
  for (const e of m.equipamentos.values()) {
    if (e.tipo !== 'switch' || (nome && e.nome !== nome)) continue;
    n += Object.keys(tabelaMac(e)).length;
    e.s.tabelaMac = {};
  }
  return n;
}

/** Atraso de encaminhamento de cada tipo de aparelho, em segundos. */
export const ENCAMINHAR: Partial<Record<Equipamento['tipo'], number>> = {
  switch: 5e-6,
  hub: 5e-7,
  radio: 4e-4,
  cmts: 1e-3,
  cablemodem: 2e-3,
  'terminal-sat': 5e-3,
  'gateway-sat': 2e-3,
};

export function fer(ber: number, bits: number): number {
  return 1 - Math.exp(-ber * bits);
}

export function acharPorIp(m: Mundo, ip: number): Equipamento | undefined {
  for (const e of m.equipamentos.values()) if (e.ip && e.ip.endereco === ip) return e;
  return undefined;
}

export interface ResultadoPing {
  enviados: number;
  recebidos: number;
  rtts: number[];
  ttl?: number;
  erro?: string;
  linhas: string[];
  /** Camada de rede: roteadores atravessados na ida e o último erro ICMP recebido. */
  roteadores?: string[];
  icmp?: { tipo: number; codigo: number; de: number };
}

const BYTES_PING = 98 + 4 + 20; // quadro de 98 bytes + FCS + preâmbulo e intervalo

export function ping(m: Mundo, deNome: string, ipDestino: number, n = 4, opcoes: OpcoesPing = {}): ResultadoPing {
  const de = m.equipamentos.get(deNome)!;
  // Com roteador configurado, gateway ou tamanho escolhido, quem cuida é a camada de rede (roteamento.ts).
  if (usaRoteamento(m, de, opcoes)) return pingRoteado(m, deNome, ipDestino, n, opcoes);
  const r: ResultadoPing = { enviados: n, recebidos: 0, rtts: [], linhas: [] };
  const falha = (erro: string): ResultadoPing => ({ ...r, recebidos: 0, erro, linhas: [erro] });
  if (!de.ip) return falha('Sem endereço IP. Eu sou só uma placa de rede com sonhos.');
  if (!mesmaRede(de.ip.endereco, ipDestino, de.ip.prefixo)) {
    return falha(`${ipTexto(ipDestino)} está fora da minha rede e eu não tenho gateway. Mando pra onde, pro além?`);
  }
  const laco = tempestade(m, de.nome);
  if (laco) {
    m.flags.tempestade = laco;
    for (const c of m.cabos.values()) {
      for (const p of [c.a, c.b]) {
        if (!laco.includes(p.equip)) continue;
        const porta = acharPorta(m, p);
        porta.contadores.rx += 250000;
        porta.contadores.tx += 250000;
      }
    }
    return { ...r, erro: 'tempestade', linhas: [textoTempestade(laco)] };
  }
  const alvo = acharPorIp(m, ipDestino);
  const saltos = alvo ? caminho(m, de.nome, alvo.nome) : null;
  if (!alvo || !saltos) {
    const linhas = Array.from({ length: n }, (_, i) => `seq=${i + 1}: ARP sem resposta. Ninguém do outro lado disse "sou eu".`);
    if (alvo && caminho(m, de.nome, alvo.nome, { ignorarVlan: true })) {
      const va = vlanDoHost(m, de.nome);
      const vb = vlanDoHost(m, alvo.nome);
      linhas.unshift(
        typeof va === 'number' && typeof vb === 'number' && va !== vb
          ? `${de.nome} está na VLAN ${va} e ${alvo.nome} na VLAN ${vb}. Cada VLAN é uma rede de enlace separada: o broadcast do ARP não passa de uma para a outra, mesmo no mesmo switch. Sem um roteador entre elas, ninguém se fala.`
          : `O cabo existe, mas a VLAN não chega: algum enlace no caminho não carrega a VLAN de ${de.nome}. Confira os troncos e as portas de acesso com "mostra vlan".`,
      );
    }
    return { ...r, erro: 'sem resposta', linhas };
  }
  // ARP: o pedido vai em broadcast (todos os switches aprendem quem perguntou) e a resposta volta direto.
  const arp = (de.s.arp ??= {}) as Record<number, string>;
  if (arp[ipDestino] !== alvo.mac) {
    aprenderNoCaminho(m, saltos, de.mac, BROADCAST);
    aprenderNoCaminho(m, [...saltos].reverse().map((s) => ({ ...s, de: s.para, para: s.de })), alvo.mac, de.mac);
    arp[ipDestino] = alvo.mac;
  }
  const volta = alvo.ip && mesmaRede(alvo.ip.endereco, de.ip.endereco, alvo.ip.prefixo);
  const sim = new Simulador();
  const bits = BYTES_PING * 8;

  // Percorre os saltos agendando cada chegada; perde o quadro com a probabilidade do enlace.
  const atravessar = (lista: Salto[], fim: () => void, perdeu: () => void, macs: [string, string]) => {
    const passo = (i: number) => {
      if (i === lista.length) return fim();
      const s = lista[i]!;
      const ser = bits / (s.estado.velocidade * 1e6);
      const quem = m.equipamentos.get(s.para)!;
      const portaRx = acharPorta(m, s.cabo.a.equip === s.para ? s.cabo.a : s.cabo.b);
      sim.agendar(ser + s.estado.atrasoS + (ENCAMINHAR[quem.tipo] ?? 0), () => {
        if (m.rng() < fer(s.estado.ber, bits)) {
          portaRx.contadores.crc++;
          return perdeu();
        }
        portaRx.contadores.rx++;
        aprenderNoSalto(m, s, macs[0], macs[1]);
        passo(i + 1);
      });
    };
    passo(0);
  };

  const ida = saltos;
  const vem = [...saltos].reverse().map((s) => ({ ...s, de: s.para, para: s.de }));
  for (let seq = 1; seq <= n; seq++) {
    sim.agendar(seq * 1.0, () => {
      const t0 = sim.agora;
      atravessar(
        ida,
        () => {
          m.ultimaCaptura = {
            eth: { origem: de.mac, destino: alvo.mac, etherType: 0x0800 },
            ip: { origem: de.ip!.endereco, destino: ipDestino, ttl: de.ttl, protocolo: 1, tamanho: 84 },
            icmp: { tipo: 8, codigo: 0, id: 0x1c8, seq },
          };
          if (!volta) {
            r.linhas.push(`seq=${seq}: o pedido chegou, mas ${alvo.nome} não sabe voltar pra ${ipTexto(de.ip!.endereco)}`);
            return;
          }
          sim.agendar(5e-5, () =>
            atravessar(
              vem,
              () => {
                const rtt = (sim.agora - t0) * 1000;
                r.recebidos++;
                r.rtts.push(rtt);
                r.ttl = alvo.ttl;
                r.linhas.push(`seq=${seq} ttl=${alvo.ttl} tempo=${rtt < 1 ? rtt.toFixed(3) : rtt.toFixed(1)} ms`);
              },
              () => r.linhas.push(`seq=${seq}: resposta perdida no caminho (erro de CRC)`),
              [alvo.mac, de.mac],
            ),
          );
        },
        () => r.linhas.push(`seq=${seq}: pedido perdido no caminho (erro de CRC)`),
        [de.mac, alvo.mac],
      );
    });
  }
  sim.rodar();
  return r;
}

export interface Vazao {
  mbps: number;
  gargalo: number;
  linhas: string[];
}

/** Vazão útil de TCP sobre Ethernet: 1460 bytes de dado em 1538 bytes no fio. */
export function vazao(m: Mundo, deNome: string, paraNome: string): Vazao | string {
  const laco = tempestade(m, deNome);
  if (laco) return textoTempestade(laco);
  const saltos = caminho(m, deNome, paraNome);
  if (!saltos) return 'Sem caminho até o servidor de teste.';
  const gargalo = Math.min(...saltos.map((s) => s.estado.velocidade));
  const perda = 1 - saltos.reduce((p, s) => p * (1 - fer(s.estado.ber, 1538 * 8)), 1);
  const eficiencia = 1460 / 1538;
  const mbps = gargalo * eficiencia * Math.pow(1 - perda, 20);
  return {
    mbps,
    gargalo,
    linhas: [
      `enlace mais lento do caminho: ${gargalo} Mb/s`,
      `eficiência do quadro: 1460 de 1538 bytes = ${(eficiencia * 100).toFixed(1)} %`,
      `perda de quadros: ${(perda * 100).toFixed(4)} %`,
    ],
  };
}
