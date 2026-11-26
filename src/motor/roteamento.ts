// Camada de rede no mundo do jogo: interfaces IP, tabela de rotas, repasse com TTL, ICMP de erro,
// fragmentação por MTU, NAT, DHCP, traceroute e um ping6 só dentro do enlace.
// O enlace (switch, VLAN, STP) continua em rede.ts: aqui cada salto de roteador usa o caminho de camada 2 até o próximo.

import { acharPorta, type Equipamento, type Mundo } from './mundo';
import {
  aprenderNoCaminho,
  aprenderNoSalto,
  BROADCAST,
  caminho,
  ENCAMINHAR,
  fer,
  tempestade,
  textoTempestade,
  vlanDoHost,
  type ResultadoPing,
  type Salto,
} from './rede';
import {
  abreviarIpv6,
  CABECALHO_IPV4,
  ehEnlaceLocal,
  enderecoRede,
  enlaceLocal,
  expandirIpv6,
  fragmentar,
  lerIpv6,
  montarCabecalho,
  cabecalhoConfere,
  mesmoPrefixoIpv6,
  noSolicitado,
  nomeIcmp,
  pertence,
  remontar,
  textoCidr,
  type Fragmento,
} from './ip';
import { ipTexto, lerCidr, lerIp, type Cidr } from './util';
import { decidir, fluxosDe, temFluxos, prefixoQueContem, instalarRegra, type DecisaoFluxo } from './sdn';
import { byteServico, nomeDscp } from './qos';
import { avaliarFirewall, casaPrefixoTxt, firewallDe, idsDe, inspecionarPacote, refrescarFiltros, SOBRA_ESP, tuneisDe, type InfoPacote, type TunelVpn } from './filtro';

export interface OpcoesPing {
  /** Bytes de dados do ICMP (o ping comum manda 56). */
  tamanho?: number;
  /** Liga o bit "não fragmente". */
  df?: boolean;
  /** TTL inicial; sem isso, o do sistema. */
  ttl?: number;
}

export const MTU_PADRAO = 1500;
/** Consultar a tabela e repassar: 50 µs por roteador. */
const ATRASO_ROTEADOR = 5e-5;
/** Quem responde demora isto para montar a resposta (o mesmo do ping de enlace). */
const ATRASO_RESPOSTA = 5e-5;
/** Cabeçalho e FCS do Ethernet, mais preâmbulo e intervalo entre quadros. */
const SOBRA_ETHERNET = 14 + 4 + 8 + 12;
const ID_PING = 0x1c8;

/* ---------- Interfaces e rotas ---------- */

export interface InterfaceL3 {
  porta: string;
  cidr: Cidr;
}

/** Interfaces com IP: as do roteador (s.interfaces) e, para host, o e.ip na primeira porta. */
export function interfacesL3(e: Equipamento): InterfaceL3[] {
  const out: InterfaceL3[] = [];
  const tab = e.s.interfaces as Record<string, string> | undefined;
  if (tab) {
    for (const [porta, txt] of Object.entries(tab)) {
      const c = lerCidr(txt);
      if (c && e.portas.some((p) => p.nome === porta)) out.push({ porta, cidr: c });
    }
  }
  const primeira = e.portas[0]?.nome;
  if (e.ip && primeira && !out.some((i) => i.porta === primeira)) out.push({ porta: primeira, cidr: e.ip });
  return out;
}

/** Roteador da camada de rede: tipo roteador com pelo menos uma interface IP configurada. */
export function ehRoteador(e: Equipamento): boolean {
  return e.tipo === 'roteador' && !!e.s.interfaces && Object.keys(e.s.interfaces).length > 0;
}

/** Aparelho em boot ou em modo de resgate não responde nem repassa. */
function respondendo(e: Equipamento): boolean {
  return e.tipo !== 'roteador' || !e.s.estado || e.s.estado === 'ligado';
}

export function roteadorLigado(e: Equipamento): boolean {
  return ehRoteador(e) && respondendo(e);
}

/** O mundo tem camada de rede? Sem isso, o ping de enlace de sempre continua valendo, igualzinho. */
export function temCamadaRede(m: Mundo): boolean {
  if (m.flags.camadaRede) return true;
  for (const e of m.equipamentos.values()) if (ehRoteador(e) || e.s.dhcp || e.s.gateway) return true;
  return false;
}

export function usaRoteamento(m: Mundo, de: Equipamento, o: OpcoesPing = {}): boolean {
  if (o.tamanho !== undefined || o.df || o.ttl !== undefined) return true;
  if (de.s.gateway || ehRoteador(de)) return true;
  for (const e of m.equipamentos.values()) if (ehRoteador(e) || e.s.dhcp) return true;
  return false;
}

export interface Rota {
  destino: Cidr;
  via?: number;
  porta?: string;
  origem: 'conectada' | 'estática' | 'padrão' | 'bgp' | 'ospf' | 'rip';
  /** Rota estática cujo próximo salto não está em nenhuma rede conectada não serve para nada. */
  valida: boolean;
  /** Métrica do protocolo que aprendeu a rota (custo OSPF, saltos do RIP, tamanho do caminho de AS no BGP). */
  metrica?: number;
  /** Detalhe para mostrar: área OSPF, intra ou entre áreas, caminho de AS. */
  nota?: string;
}

/** Rota aprendida por protocolo, guardada em s.rotasDinamicas pelos protocolos (protocolos.ts). */
export interface RotaDinamica {
  destino: string;
  via: string;
  origem: 'bgp' | 'ospf' | 'rip';
  metrica: number;
  nota?: string;
}

/** Distância administrativa: quando dois jeitos de aprender dão o mesmo prefixo, vence o de menor número. */
export const DISTANCIA_ADMIN: Record<Rota['origem'], number> = { conectada: 0, estática: 1, padrão: 1, bgp: 20, ospf: 110, rip: 120 };

/** Tabela de rotas: as conectadas saem das interfaces; as estáticas e a padrão (0.0.0.0/0) vêm da configuração. */
export function rotasDe(e: Equipamento): Rota[] {
  const intfs = interfacesL3(e);
  const r: Rota[] = intfs.map((i) => ({ destino: { endereco: enderecoRede(i.cidr), prefixo: i.cidr.prefixo }, porta: i.porta, origem: 'conectada', valida: true }));
  const estaticas: { destino: string; via: string }[] = [...((e.s.rotas as { destino: string; via: string }[] | undefined) ?? [])];
  if (e.s.gateway) estaticas.push({ destino: '0.0.0.0/0', via: e.s.gateway });
  for (const s of estaticas) {
    const d = lerCidr(s.destino);
    const via = lerIp(s.via);
    if (!d || via === null) continue;
    const saida = intfs.filter((i) => pertence(via, i.cidr)).sort((a, b) => b.cidr.prefixo - a.cidr.prefixo)[0];
    r.push({ destino: { endereco: enderecoRede(d), prefixo: d.prefixo }, via, porta: saida?.porta, origem: d.prefixo === 0 ? 'padrão' : 'estática', valida: !!saida });
  }
  // Aprendidas por protocolo: entram só se ninguém de distância administrativa menor já tem o mesmo prefixo.
  const dinamicas = [...((e.s.rotasDinamicas as RotaDinamica[] | undefined) ?? [])].sort((a, b) => DISTANCIA_ADMIN[a.origem] - DISTANCIA_ADMIN[b.origem]);
  for (const s of dinamicas) {
    const d = lerCidr(s.destino);
    const via = lerIp(s.via);
    if (!d || via === null) continue;
    const destino = { endereco: enderecoRede(d), prefixo: d.prefixo };
    if (r.some((x) => x.destino.endereco === destino.endereco && x.destino.prefixo === destino.prefixo)) continue;
    const saida = intfs.filter((i) => pertence(via, i.cidr)).sort((a, b) => b.cidr.prefixo - a.cidr.prefixo)[0];
    r.push({ destino, via, porta: saida?.porta, origem: s.origem, valida: !!saida, metrica: s.metrica, nota: s.nota });
  }
  return r;
}

/** Casamento do prefixo mais longo: de todas as rotas que contêm o destino, vence a mais específica. */
export function escolherRota(e: Equipamento, ip: number): Rota | null {
  let melhor: Rota | null = null;
  for (const r of rotasDe(e)) {
    if (!r.valida || !pertence(ip, r.destino)) continue;
    if (!melhor || r.destino.prefixo > melhor.destino.prefixo) melhor = r;
  }
  return melhor;
}

/** Quem tem este IP. */
export function donoDoIp(m: Mundo, ip: number): { e: Equipamento; porta: string } | undefined {
  for (const e of m.equipamentos.values()) {
    const i = interfacesL3(e).find((x) => x.cidr.endereco === ip);
    if (i) return { e, porta: i.porta };
  }
  return undefined;
}

/** ARP: quem tem este IP e está ao alcance de camada 2 saindo por esta porta. */
function vizinho(m: Mundo, e: Equipamento, porta: string, ip: number): { e: Equipamento; porta: string; saltos: Salto[] } | null {
  for (const x of m.equipamentos.values()) {
    if (x.nome === e.nome || !respondendo(x)) continue;
    for (const i of interfacesL3(x)) {
      if (i.cidr.endereco !== ip) continue;
      const saltos = caminho(m, e.nome, x.nome, { portaOrigem: porta, portaDestino: i.porta });
      if (saltos) return { e: x, porta: i.porta, saltos };
    }
  }
  return null;
}

function mtuSegmento(m: Mundo, e: Equipamento, porta: string, saltos: Salto[]): number {
  let mtu = acharPorta(m, { equip: e.nome, porta }).mtu ?? MTU_PADRAO;
  for (const s of saltos) if (s.cabo.mtu) mtu = Math.min(mtu, s.cabo.mtu);
  return mtu;
}

function novoId(m: Mundo): number {
  m.flags.proxIdIp = (((m.flags.proxIdIp as number | undefined) ?? 0x3c00) + 1) & 0xffff;
  return m.flags.proxIdIp;
}

/* ---------- NAT ---------- */

export interface Traducao {
  protocolo: 'icmp' | 'tcp' | 'udp';
  ipInterno: string;
  portaInterna: number;
  ipExterno: string;
  portaExterna: number;
}

export interface ConfigNat {
  internas: string[];
  externa: string;
  tabela: Traducao[];
  proxPorta: number;
}

const PROTO: Record<number, Traducao['protocolo']> = { 1: 'icmp', 6: 'tcp', 17: 'udp' };

export function nat(e: Equipamento): ConfigNat | undefined {
  return e.s.nat as ConfigNat | undefined;
}

export function configurarNat(e: Equipamento, internas: string[], externa: string): void {
  e.s.nat = { internas, externa, tabela: nat(e)?.tabela ?? [], proxPorta: nat(e)?.proxPorta ?? 50000 } satisfies ConfigNat;
}

/**
 * Porta que identifica a conversa no NAPT (RFC 3022, §2.2): no TCP e no UDP, a porta de verdade do cabeçalho L4;
 * no eco ICMP, o identificador da consulta (que faz o papel de porta, nos dois sentidos).
 */
function portaOrigemDe(p: Pacote): number {
  return (p.protocolo === 6 || p.protocolo === 17) && p.l4 ? p.l4.origem : p.icmp.id;
}

function portaDestinoDe(p: Pacote): number {
  return (p.protocolo === 6 || p.protocolo === 17) && p.l4 ? p.l4.destino : p.icmp.id;
}

/** Linha da tabela para (protocolo, IP e porta internos), criando uma com porta externa livre se ainda não há. */
function traducaoPara(n: ConfigNat, proto: Traducao['protocolo'], ipInt: string, portaInt: number, ipExt: string): Traducao {
  let t = n.tabela.find((x) => x.protocolo === proto && x.ipInterno === ipInt && x.portaInterna === portaInt);
  if (!t) {
    // Mantém a porta de dentro se estiver livre do lado de fora; senão, a próxima livre.
    const usada = (porta: number) => n.tabela.some((x) => x.protocolo === proto && x.ipExterno === ipExt && x.portaExterna === porta);
    let porta = portaInt;
    while (usada(porta)) porta = n.proxPorta++;
    t = { protocolo: proto, ipInterno: ipInt, portaInterna: portaInt, ipExterno: ipExt, portaExterna: porta };
    n.tabela.push(t);
  }
  return t;
}

/**
 * Saindo de dentro para fora (NAPT, RFC 3022): troca o IP e a porta de origem pelos externos e anota na tabela.
 * Um erro ICMP que sai de dentro (sobre um pacote que veio de fora) também tem o pacote embutido traduzido: ali o
 * endereço de dentro é o destino do pacote original (RFC 3022, §4.3).
 */
function natIda(r: Equipamento, p: Pacote): string | null {
  const n = nat(r)!;
  const ext = interfacesL3(r).find((i) => i.porta === n.externa);
  if (!ext) return null;
  const ipExt = ipTexto(ext.cidr.endereco);
  const ipInt = ipTexto(p.origem);
  if (p.erro && p.embutido) {
    const b = p.embutido;
    const proto = PROTO[b.protocolo] ?? 'icmp';
    const t = n.tabela.find((x) => x.protocolo === proto && x.ipInterno === ipTexto(b.destino) && x.portaInterna === b.portaDestino);
    p.origem = ext.cidr.endereco;
    if (!t) return `${r.nome} (NAT): erro ICMP de ${ipInt} sai como ${ipExt}`;
    b.destino = ext.cidr.endereco;
    b.portaDestino = t.portaExterna;
    return `${r.nome} (NAT): erro ICMP de ${ipInt} sai como ${ipExt}, e o pacote embutido passa a dizer ${ipExt}:${t.portaExterna}`;
  }
  const proto = PROTO[p.protocolo] ?? 'icmp';
  const portaInt = portaOrigemDe(p);
  const t = traducaoPara(n, proto, ipInt, portaInt, ipExt);
  p.origem = ext.cidr.endereco;
  if ((proto === 'tcp' || proto === 'udp') && p.l4) p.l4.origem = t.portaExterna;
  else p.icmp.id = t.portaExterna;
  return `${r.nome} (NAT): origem ${ipInt}:${t.portaInterna} vira ${ipExt}:${t.portaExterna}`;
}

/**
 * Voltando de fora: se (protocolo, IP e porta de destino) está na tabela, desfaz a tradução e repassa para dentro.
 * Num erro ICMP, quem diz a conversa é o pacote embutido, que saiu daqui com origem externa: traduz o destino do
 * erro e a origem do embutido de volta para os de dentro (RFC 3022, §4.3).
 */
function natVolta(r: Equipamento, p: Pacote): string | null {
  const n = nat(r)!;
  if (p.erro && p.embutido) {
    const b = p.embutido;
    const proto = PROTO[b.protocolo] ?? 'icmp';
    const t = n.tabela.find((x) => x.protocolo === proto && x.ipExterno === ipTexto(b.origem) && x.portaExterna === b.portaOrigem);
    if (!t) return null;
    p.destino = lerIp(t.ipInterno)!;
    b.origem = p.destino;
    b.portaOrigem = t.portaInterna;
    if (proto === 'icmp') p.icmp.id = t.portaInterna;
    return `${r.nome} (NAT): erro ICMP sobre ${t.ipExterno}:${t.portaExterna} volta para ${t.ipInterno}:${t.portaInterna}, com o pacote embutido traduzido também`;
  }
  const proto = PROTO[p.protocolo] ?? 'icmp';
  const porta = portaDestinoDe(p);
  const t = n.tabela.find((x) => x.protocolo === proto && x.ipExterno === ipTexto(p.destino) && x.portaExterna === porta);
  if (!t) return null;
  p.destino = lerIp(t.ipInterno)!;
  if ((proto === 'tcp' || proto === 'udp') && p.l4) p.l4.destino = t.portaInterna;
  else p.icmp.id = t.portaInterna;
  return `${r.nome} (NAT): destino ${t.ipExterno}:${t.portaExterna} volta a ser ${t.ipInterno}:${t.portaInterna}`;
}

/* ---------- A viagem de um pacote ---------- */

export interface Pacote {
  origem: number;
  destino: number;
  ttl: number;
  protocolo: number;
  identificacao: number;
  df: boolean;
  /** Tamanho total do datagrama original, cabeçalho incluído. */
  tamanho: number;
  fragmentos: Fragmento[];
  icmp: { tipo: number; codigo: number; id: number; seq: number; mtu?: number };
  /** Mensagem de erro ICMP: não se gera erro sobre erro. */
  erro?: boolean;
  /** Byte de serviço diferenciado (DSCP nos 6 bits de cima, ECN nos 2 de baixo). Ausente: 0, nunca mexido. */
  tos?: number;
  /** Portas e flags TCP de verdade (a camada de transporte preenche); o firewall e o IDS olham daqui. */
  l4?: { origem: number; destino: number; flags?: string };
  /** Dentro de um túnel IPsec: o cabeçalho original, guardado debaixo do ESP. */
  tunel?: { origem: number; destino: number; protocolo: number; ttl: number; nome: string; de: string };
  /**
   * Num erro ICMP: o cabeçalho IP e os 8 primeiros bytes do pacote que morreu (RFC 792), que levam as portas TCP/UDP
   * ou o identificador do eco. O NAT traduz isto também (RFC 3022, §4.3), senão o erro não acha quem o causou.
   */
  embutido?: { origem: number; destino: number; protocolo: number; portaOrigem: number; portaDestino: number };
}

export interface Viagem {
  entregue: boolean;
  onde: string;
  porta?: string;
  tempo: number;
  pacote: Pacote;
  roteadores: { nome: string; ip: number }[];
  eventos: string[];
  /** MAC de quem mandou o último quadro (o roteador do último salto, não a origem). */
  ultimoMac: string;
  falha?: string;
  /** Falha de ARP na origem: o IP que ninguém respondeu. */
  semArp?: number;
  perdido?: boolean;
  icmpErro?: { de: number; nome: string; tipo: number; codigo: number; mtu?: number; viagem: Viagem };
  /** Cada trecho de enlace atravessado (de quem sai, por qual porta): a camada de transporte acha o gargalo por aqui. */
  trechos?: { de: string; porta: string; mbps: number; atrasoS: number; ber: number }[];
  /** Todo equipamento por onde o quadro passou (hubs e switches incluídos): quem pode ter ouvido. */
  nos?: string[];
  /** Os que viram o pacote só por fora, cifrado dentro do túnel IPsec. */
  nosTunel?: string[];
  /** Quem recebeu o quadro por causa de um cache ARP envenenado. */
  interceptadoPor?: string[];
  /** Roteador cujo firewall, IPS ou filtro antifalsificação descartou o pacote. */
  bloqueadoPor?: string;
  /** Alertas de IDS que o pacote disparou no caminho. */
  alertas?: string[];
}

function clonar(p: Pacote): Pacote {
  return { ...p, fragmentos: p.fragmentos.map((f) => ({ ...f })), icmp: { ...p.icmp }, l4: p.l4 ? { ...p.l4 } : undefined, tunel: p.tunel ? { ...p.tunel } : undefined, embutido: p.embutido ? { ...p.embutido } : undefined };
}

/* ---------- Segurança no caminho (só age com firewall, IDS, filtro antifalsificação, VPN ou ARP falso configurados) ---------- */

function infoDe(p: Pacote): InfoPacote {
  return { origem: p.origem, destino: p.destino, protocolo: p.protocolo, portaOrigem: p.l4?.origem, portaDestino: p.l4?.destino, flags: p.l4?.flags, icmpTipo: p.protocolo === 1 ? p.icmp.tipo : undefined, icmpId: p.icmp.id, erro: p.erro };
}

/** Firewall, filtro antifalsificação (BCP 38) e IDS/IPS do roteador. Devolve o motivo do descarte, ou null. */
function filtrar(m: Mundo, e: Equipamento, p: Pacote, entrada: string | undefined, v: Viagem): string | null {
  if (e.s.antiFalsificacao && entrada && !p.tunel) {
    const volta = escolherRota(e, p.origem);
    if (!volta || volta.porta !== entrada) {
      v.eventos.push(`${e.nome} (antifalsificação): origem ${ipTexto(p.origem)} não poderia entrar pela ${entrada}`);
      return `${e.nome} descartou: a origem ${ipTexto(p.origem)} chegou pela ${entrada}, mas a rota de volta para ela sai por ${volta?.porta ?? 'lugar nenhum'}. Endereço falsificado (filtro de entrada, BCP 38).`;
    }
  }
  const info = infoDe(p);
  const ids = idsDe(e);
  const fw = firewallDe(e);
  if (!ids && !fw) return null;
  let motivo: string | null = null;
  if (ids) {
    const d = inspecionarPacote(ids, info);
    if (d.texto) (v.alertas ??= []).push(`${e.nome}: ${d.texto}`);
    if (d.bloquear) motivo = `${e.nome} descartou: ${d.texto}`;
  }
  if (fw && !motivo) {
    const d = avaliarFirewall(fw, info, entrada);
    if (d.acao === 'negar') {
      v.eventos.push(`${e.nome} (firewall): ${d.texto}`);
      motivo = `${e.nome} descartou no firewall: ${d.texto}.`;
    }
  }
  // O que os dias conferem fica com os números de agora: contadores, tabela de estado, alertas.
  refrescarFiltros(m, e);
  return motivo;
}

/* ---------- Túneis IPsec: estado do IKE e o resumo para m.flags ---------- */

/** O túnel sobe quando a outra ponta tem o túnel espelhado, com o mesmo segredo e as redes invertidas. */
export function estadoTunel(m: Mundo, e: Equipamento, t: TunelVpn): { ativo: boolean; motivo?: string } {
  const ipPar = lerIp(t.par);
  const outro = ipPar === null ? undefined : donoDoIp(m, ipPar)?.e;
  if (!outro) return { ativo: false, motivo: `ninguém tem o endereço ${t.par}` };
  const meus = interfacesL3(e).map((i) => ipTexto(i.cidr.endereco));
  const espelho = Object.values(tuneisDe(outro) ?? {}).find((x) => meus.includes(x.par));
  if (!espelho) return { ativo: false, motivo: `${outro.nome} não tem túnel apontando para cá` };
  if (espelho.segredo !== t.segredo) return { ativo: false, motivo: 'o segredo pré-compartilhado é diferente nas duas pontas (a autenticação do IKE falha)' };
  if (espelho.local !== t.remota || espelho.remota !== t.local) return { ativo: false, motivo: `as redes não batem: aqui ${t.local} ↔ ${t.remota}, lá ${espelho.local} ↔ ${espelho.remota}` };
  return { ativo: true };
}

/**
 * m.flags.vpnPor[roteador]: os túneis de cada roteador, com o estado do IKE e os contadores de agora. Refeito a cada
 * comando de VPN e a cada pacote que entra ou sai de um túnel, porque o estado de uma ponta depende da outra.
 */
export function refrescarVpns(m: Mundo): void {
  const por: Record<string, Record<string, unknown>[]> = {};
  for (const e of m.equipamentos.values()) {
    const tab = tuneisDe(e);
    if (!tab || !Object.keys(tab).length) continue;
    por[e.nome] = Object.values(tab).map((t) => {
      const st = estadoTunel(m, e, t);
      return { nome: t.nome, par: t.par, local: t.local, remota: t.remota, segredo: t.segredo, spi: t.spi, ativo: st.ativo, motivo: st.motivo ?? null, cifrados: t.contadores.cifrados, decifrados: t.contadores.decifrados };
    });
  }
  m.flags.vpnPor = por;
  // O último túnel mostrado no console também acompanha (contadores e estado), sem perder a captura.
  const v = m.flags.vpn as { roteador?: string; nome?: string } | undefined;
  const t = v?.roteador ? por[v.roteador]?.find((x) => x.nome === v.nome) : undefined;
  if (v && t) m.flags.vpn = { ...v, ativo: t.ativo, motivo: t.motivo, cifrados: t.cifrados, decifrados: t.decifrados };
}

/** Túnel deste roteador que leva o destino, com a outra ponta configurada igual (o IKE só fecha assim). */
function tunelPara(m: Mundo, e: Equipamento, p: Pacote): { t: TunelVpn; ipLocal: number; ipPar: number } | null {
  const tab = tuneisDe(e);
  if (!tab) return null;
  for (const t of Object.values(tab)) {
    if (!casaPrefixoTxt(t.remota, p.destino) || !casaPrefixoTxt(t.local, p.origem)) continue;
    const ipPar = lerIp(t.par);
    const outro = ipPar === null ? undefined : donoDoIp(m, ipPar);
    if (!outro || ipPar === null) continue;
    const espelho = Object.values(tuneisDe(outro.e) ?? {}).find((x) => x.segredo === t.segredo && x.local === t.remota && x.remota === t.local && interfacesL3(e).some((i) => ipTexto(i.cidr.endereco) === x.par));
    if (!espelho) continue;
    return { t, ipLocal: lerIp(espelho.par)!, ipPar };
  }
  return null;
}

export function novoPacote(m: Mundo, o: { origem: number; destino: number; ttl: number; dados: number; df?: boolean; icmp: Pacote['icmp']; erro?: boolean }): Pacote {
  const identificacao = novoId(m);
  const tamanho = o.dados + 8 + CABECALHO_IPV4;
  return { origem: o.origem, destino: o.destino, ttl: o.ttl, protocolo: 1, identificacao, df: !!o.df, tamanho, fragmentos: [{ identificacao, deslocamento: 0, dados: tamanho - CABECALHO_IPV4, mf: false }], icmp: { ...o.icmp }, erro: o.erro };
}

function erroIcmp(m: Mundo, v: Viagem, r: Equipamento, entrada: string | undefined, p: Pacote, tipo: number, codigo: number, mtu?: number): Viagem {
  v.onde = r.nome;
  if (p.erro) {
    v.falha = `${r.nome} descartou uma mensagem de erro. Não se manda erro sobre erro, senão vira bola de neve.`;
    return v;
  }
  const intfs = interfacesL3(r);
  const ipEntrada = (intfs.find((i) => i.porta === entrada) ?? intfs[0])!.cidr.endereco;
  // O erro leva de volta o cabeçalho e os 8 primeiros bytes do pacote que morreu: 8 + 20 + 8 bytes de ICMP.
  const erro = novoPacote(m, { origem: ipEntrada, destino: p.origem, ttl: r.ttl, dados: 28, icmp: { tipo, codigo, id: p.icmp.id, seq: p.icmp.seq, mtu }, erro: true });
  erro.embutido = { origem: p.origem, destino: p.destino, protocolo: p.protocolo, portaOrigem: portaOrigemDe(p), portaDestino: portaDestinoDe(p) };
  v.eventos.push(`${r.nome} descarta o pacote e devolve ICMP tipo ${tipo} código ${codigo}: ${nomeIcmp(tipo, codigo)}`);
  const volta = viajar(m, r.nome, erro);
  v.icmpErro = { de: ipEntrada, nome: r.nome, tipo, codigo, mtu, viagem: volta };
  return v;
}

/* ---------- Serviços diferenciados e tabela de fluxo (só agem quando configurados) ---------- */

/** Regra de marcação na borda: pacote cuja origem (ou destino) está no prefixo ganha a classe. */
export interface MarcaDscp {
  prefixo: string;
  dscp: number;
  campo: 'origem' | 'destino';
}

export function marcasDscp(e: Equipamento): MarcaDscp[] {
  return (e.s.dscp as MarcaDscp[] | undefined) ?? [];
}

/** Marcação na borda (serviços diferenciados): o roteador classifica e escreve o DSCP no cabeçalho. */
function marcarDscp(e: Equipamento, p: Pacote, v: Viagem): void {
  const lista = marcasDscp(e);
  if (!lista.length) return;
  for (const campo of ['origem', 'destino'] as const) {
    const pref = prefixoQueContem(lista.filter((x) => x.campo === campo).map((x) => x.prefixo), campo === 'origem' ? p.origem : p.destino);
    if (!pref) continue;
    const marca = lista.find((x) => x.campo === campo && x.prefixo === pref)!;
    p.tos = byteServico(marca.dscp, (p.tos ?? 0) & 3);
    v.eventos.push(`${e.nome} marca o pacote com DSCP ${marca.dscp} (${nomeDscp(marca.dscp)}): ${campo} em ${pref}`);
    return;
  }
}

/** Próximo salto saindo por uma porta escolhida pela regra: o próprio destino, se é da rede da porta, ou o roteador do outro lado. */
function proximoNaPorta(m: Mundo, e: Equipamento, porta: string, destino: number): number | null {
  const intf = interfacesL3(e).find((i) => i.porta === porta);
  if (!intf) return null;
  if (pertence(destino, intf.cidr)) return destino;
  for (const x of m.equipamentos.values()) {
    if (x.nome === e.nome || !roteadorLigado(x)) continue;
    for (const i of interfacesL3(x)) if (i.cidr.prefixo === intf.cidr.prefixo && enderecoRede(i.cidr) === enderecoRede(intf.cidr)) return i.cidr.endereco;
  }
  return null;
}

/**
 * Plano de dados com SDN: a tabela de fluxo decide antes da tabela de rotas. Devolve a rota que a regra mandou
 * usar, null para seguir a tabela de rotas (regra "normal" ou nenhuma regra casou) ou "descartado".
 * "controlador": o pacote sobe ao controlador, que responde com a visão central da rede e instala uma regra nova.
 */
function consultarFluxos(m: Mundo, e: Equipamento, p: Pacote, entrada: string | undefined, v: Viagem): Rota | null | 'descartado' {
  const d: DecisaoFluxo = decidir(fluxosDe(e), p, entrada);
  if (!d.regra) return null;
  if (d.novoTos !== undefined) {
    p.tos = d.novoTos;
    v.eventos.push(`${e.nome} (regra ${d.regra.id}) reescreve o DSCP para ${d.novoTos >> 2}`);
  }
  if (d.novoDestino !== undefined) {
    v.eventos.push(`${e.nome} (regra ${d.regra.id}) reescreve o destino de ${ipTexto(p.destino)} para ${ipTexto(d.novoDestino)}`);
    p.destino = d.novoDestino;
  }
  let porta = d.porta;
  if (d.destino === 'descartar') {
    v.onde = e.nome;
    v.falha = `${e.nome} descartou o pacote: a regra ${d.regra.id} da tabela de fluxo manda descartar.`;
    return 'descartado';
  }
  if (d.destino === 'controlador') {
    const sdn = (m.flags.sdn ??= {}) as { controlador?: boolean; packetIn?: number; visao?: Record<string, Record<string, string>> };
    sdn.packetIn = (sdn.packetIn ?? 0) + 1;
    const visao = sdn.controlador ? (sdn.visao?.[e.nome] ?? {}) : {};
    const pref = prefixoQueContem(Object.keys(visao), p.destino);
    if (!sdn.controlador || !pref) {
      v.onde = e.nome;
      v.falha = sdn.controlador ? `${e.nome} mandou o pacote ao controlador, que não conhece caminho para ${ipTexto(p.destino)}. Descartado.` : `${e.nome} mandou o pacote ao controlador, mas o controlador está desligado. Ninguém respondeu, pacote descartado.`;
      return 'descartado';
    }
    porta = visao[pref]!;
    instalarRegra(e, d.regra.prioridade + 1, { destino: pref }, [{ tipo: 'porta', porta }], 'reativa');
    v.eventos.push(`${e.nome} manda o pacote ao controlador (packet-in); o controlador responde "porta ${porta}" e instala a regra para ${pref}`);
  }
  if (!porta) return null;
  const via = proximoNaPorta(m, e, porta, p.destino);
  if (via === null) {
    v.onde = e.nome;
    v.falha = `${e.nome}: a regra ${d.regra.id} manda sair pela ${porta}, mas do outro lado não há ninguém que leve a ${ipTexto(p.destino)}.`;
    return 'descartado';
  }
  v.eventos.push(`${e.nome} encaminha pela ${porta} por causa da regra ${d.regra.id} da tabela de fluxo, sem olhar a tabela de rotas`);
  return { destino: { endereco: p.destino, prefixo: 32 }, via: via === p.destino ? undefined : via, porta, origem: 'estática', valida: true };
}

/** Switch com tabela de fluxo: conta, descarta ou reescreve; encaminhar por outra porta que não a do caminho é recusado. */
function fluxoNoSwitch(m: Mundo, sw: Equipamento, p: Pacote, entrada: string, saida: string | undefined, v: Viagem): boolean {
  const d = decidir(fluxosDe(sw), p, entrada);
  if (!d.regra) return true;
  if (d.novoTos !== undefined) p.tos = d.novoTos;
  if (d.destino === 'descartar') {
    v.falha = `${sw.nome} descartou o quadro: a regra ${d.regra.id} da tabela de fluxo manda descartar.`;
    return false;
  }
  if (d.destino === 'controlador') {
    const sdn = (m.flags.sdn ??= {}) as { controlador?: boolean; packetIn?: number };
    sdn.packetIn = (sdn.packetIn ?? 0) + 1;
    if (!sdn.controlador) {
      v.falha = `${sw.nome} mandou o quadro ao controlador, mas o controlador está desligado.`;
      return false;
    }
  }
  if (d.destino === 'porta' && saida && d.porta !== saida) {
    v.falha = `${sw.nome}: a regra ${d.regra.id} manda sair pela ${d.porta}, mas o próximo salto está pela ${saida}. O quadro se perdeu.`;
    return false;
  }
  return true;
}

/**
 * Leva um pacote de "inicio" até o destino, salto a salto. Em cada roteador: decrementa o TTL
 * (zero vira ICMP "tempo esgotado"), escolhe a rota pelo prefixo mais longo (sem rota vira "rede inalcançável"),
 * faz ARP até o próximo salto (ninguém responde vira "host inalcançável"), confere o MTU (com DF vira
 * "fragmentação necessária"; sem DF, fragmenta) e atravessa os switches do segmento até o próximo.
 */
export function viajar(m: Mundo, inicio: string, p0: Pacote): Viagem {
  const p = clonar(p0);
  const v: Viagem = { entregue: false, onde: inicio, tempo: 0, pacote: p, roteadores: [], eventos: [], ultimoMac: '', nos: [inicio] };
  let atual = m.equipamentos.get(inicio)!;
  let entrada: string | undefined;
  for (let passo = 0; passo < 300; passo++) {
    // Fim do túnel IPsec: a outra ponta tira o ESP, confere e devolve o cabeçalho original.
    if (p.tunel && p.protocolo === 50 && interfacesL3(atual).some((i) => i.cidr.endereco === p.destino)) {
      const t = tuneisDe(atual) ? Object.values(tuneisDe(atual)!).find((x) => lerIp(x.par) === p.origem) : undefined;
      if (!t) {
        v.onde = atual.nome;
        v.falha = `${atual.nome} recebeu ESP de ${ipTexto(p.origem)} sem túnel configurado para ele: descartado (não há chave para abrir).`;
        return v;
      }
      t.contadores.decifrados++;
      refrescarVpns(m);
      v.eventos.push(`${atual.nome} (VPN ${t.nome}): confere a integridade do ESP, decifra e devolve o pacote de ${ipTexto(p.tunel.origem)} para ${ipTexto(p.tunel.destino)}`);
      p.origem = p.tunel.origem;
      p.destino = p.tunel.destino;
      p.protocolo = p.tunel.protocolo;
      p.ttl = p.tunel.ttl;
      p.tamanho -= SOBRA_ESP;
      p.fragmentos = [{ identificacao: p.identificacao, deslocamento: 0, dados: p.tamanho - CABECALHO_IPV4, mf: false }];
      delete p.tunel;
    }
    if (interfacesL3(atual).some((i) => i.cidr.endereco === p.destino)) {
      const n = nat(atual);
      const traduziu = n && entrada === n.externa ? natVolta(atual, p) : null;
      if (!traduziu) {
        v.entregue = true;
        v.onde = atual.nome;
        v.porta = entrada;
        return v;
      }
      v.eventos.push(traduziu);
    }
    if (passo > 0) {
      if (!roteadorLigado(atual)) {
        v.onde = atual.nome;
        v.falha = `${atual.nome} recebeu um pacote para ${ipTexto(p.destino)}, que não é dele, e descartou. Host não repassa pacote.`;
        return v;
      }
      p.ttl -= 1;
      if (p.ttl <= 0) return erroIcmp(m, v, atual, entrada, p, 11, 0);
      const ipEnt = interfacesL3(atual).find((i) => i.porta === entrada)?.cidr.endereco ?? 0;
      v.roteadores.push({ nome: atual.nome, ip: ipEnt });
      v.tempo += ATRASO_ROTEADOR;
    }
    if (atual.s.dscp && ehRoteador(atual)) marcarDscp(atual, p, v);
    let rota: Rota | null = null;
    if (temFluxos(atual)) {
      const r = consultarFluxos(m, atual, p, entrada, v);
      if (r === 'descartado') return v;
      rota = r;
    }
    rota ??= escolherRota(atual, p.destino);
    if (!rota || !rota.porta) {
      if (passo === 0) {
        v.falha = atual.s.gateway || ehRoteador(atual) ? `Sem rota para ${ipTexto(p.destino)} na minha tabela.` : `${ipTexto(p.destino)} está fora da minha rede e eu não tenho gateway. Mando pra onde, pro além?`;
        return v;
      }
      return erroIcmp(m, v, atual, entrada, p, 3, 0);
    }
    if (passo > 0 && (atual.s.firewall || atual.s.ids || atual.s.antiFalsificacao)) {
      const motivo = filtrar(m, atual, p, entrada, v);
      if (motivo) {
        v.onde = atual.nome;
        v.falha = motivo;
        v.bloqueadoPor = atual.nome;
        return v;
      }
    }
    // Entrada do túnel IPsec: o pacote inteiro vira carga cifrada de um pacote novo, de uma ponta à outra.
    if (atual.s.vpn && !p.tunel && ehRoteador(atual)) {
      const tun = tunelPara(m, atual, p);
      if (tun) {
        const rotaFora = escolherRota(atual, tun.ipPar);
        const mtuFora = rotaFora?.porta ? (acharPorta(m, { equip: atual.nome, porta: rotaFora.porta }).mtu ?? MTU_PADRAO) : MTU_PADRAO;
        if (p.df && p.tamanho + SOBRA_ESP > mtuFora) {
          v.eventos.push(`${atual.nome} (VPN ${tun.t.nome}): ${p.tamanho} bytes mais ${SOBRA_ESP} do ESP passam do MTU ${mtuFora}, e o DF não deixa fragmentar`);
          return erroIcmp(m, v, atual, entrada, p, 3, 4, mtuFora - SOBRA_ESP);
        }
        tun.t.contadores.cifrados++;
        tun.t.ultimo = { origem: ipTexto(p.origem), destino: ipTexto(p.destino), protocolo: p.protocolo, tamanho: p.tamanho, externo: `${ipTexto(tun.ipLocal)} > ${ipTexto(tun.ipPar)}` };
        refrescarVpns(m);
        v.eventos.push(`${atual.nome} (VPN ${tun.t.nome}): encapsula em ESP (SPI ${tun.t.spi}) de ${ipTexto(tun.ipLocal)} para ${ipTexto(tun.ipPar)}; ${p.tamanho} bytes viram ${p.tamanho + SOBRA_ESP}, conteúdo cifrado`);
        p.tunel = { origem: p.origem, destino: p.destino, protocolo: p.protocolo, ttl: p.ttl, nome: tun.t.nome, de: atual.nome };
        p.origem = tun.ipLocal;
        p.destino = tun.ipPar;
        p.protocolo = 50;
        p.ttl = atual.ttl;
        p.tamanho += SOBRA_ESP;
        p.fragmentos = [{ identificacao: p.identificacao, deslocamento: 0, dados: p.tamanho - CABECALHO_IPV4, mf: false }];
        if (!rotaFora?.porta) return erroIcmp(m, v, atual, entrada, p, 3, 0);
        rota = rotaFora;
      }
    }
    if (!rota.porta) return erroIcmp(m, v, atual, entrada, p, 3, 0);
    const prox = rota.via ?? p.destino;
    const n = nat(atual);
    if (n && passo > 0 && entrada && n.internas.includes(entrada) && rota.porta === n.externa && !p.tunel) {
      const t = natIda(atual, p);
      if (t) v.eventos.push(t);
    }
    const viz = vizinho(m, atual, rota.porta, prox);
    if (!viz) {
      if (passo === 0) {
        v.semArp = prox;
        v.falha = `ARP sem resposta para ${ipTexto(prox)}.`;
        return v;
      }
      return erroIcmp(m, v, atual, entrada, p, 3, 1);
    }
    // ARP: o pedido vai em broadcast e a resposta volta direto. Só até o próximo salto, nunca até o destino final.
    const arp = (atual.s.arp ??= {}) as Record<number, string>;
    // Cache ARP envenenado: o quadro vai para o MAC de quem mentiu, que lê e (se quiser) repassa ao dono verdadeiro.
    const mentiroso = (atual.s.arpFalso as Record<number, string> | undefined)?.[prox];
    const atk = mentiroso && mentiroso !== viz.e.nome ? m.equipamentos.get(mentiroso) : undefined;
    const ateAtk = atk ? caminho(m, atual.nome, atk.nome, { portaOrigem: rota.porta }) : null;
    if (atk && ateAtk) {
      arp[prox] = atk.mac;
      v.eventos.push(`${atual.nome} manda o quadro para ${ipTexto(prox)} ao MAC ${atk.mac} (cache ARP envenenado): quem recebe é ${atk.nome}`);
      (v.interceptadoPor ??= []).push(atk.nome);
      for (const s of ateAtk) v.nos!.push(s.para);
      if (!atk.s.repassar) {
        v.onde = atk.nome;
        v.falha = `O quadro foi para ${atk.nome}, que se passou por ${ipTexto(prox)} e não repassou nada.`;
        return v;
      }
      v.eventos.push(`${atk.nome} copia o pacote e repassa ao dono verdadeiro de ${ipTexto(prox)}, ${viz.e.nome}: homem no meio`);
    } else if (arp[prox] !== viz.e.mac) {
      aprenderNoCaminho(m, viz.saltos, atual.mac, BROADCAST);
      aprenderNoCaminho(m, [...viz.saltos].reverse().map((s) => ({ ...s, de: s.para, para: s.de })), viz.e.mac, atual.mac);
      arp[prox] = viz.e.mac;
      v.eventos.push(`ARP em ${atual.nome}: quem tem ${ipTexto(prox)}? ${viz.e.nome} responde ${viz.e.mac}`);
    }
    const mtu = mtuSegmento(m, atual, rota.porta, viz.saltos);
    if (p.fragmentos.some((f) => f.dados + CABECALHO_IPV4 > mtu)) {
      if (p.df) {
        if (passo === 0) {
          v.falha = `Mensagem longa demais: ${p.tamanho} bytes não cabem no MTU de ${mtu} da ${rota.porta}, e o DF não deixa fragmentar.`;
          return v;
        }
        return erroIcmp(m, v, atual, entrada, p, 3, 4, mtu);
      }
      const antes = p.fragmentos.length;
      p.fragmentos = p.fragmentos.flatMap((f) => fragmentar(f, mtu));
      v.eventos.push(`${atual.nome} fragmenta: MTU ${mtu} na ${rota.porta}, ${antes} pedaço(s) viram ${p.fragmentos.length}`);
    }
    // Atravessa os switches do segmento.
    const bits = p.fragmentos.reduce((s, f) => s + (f.dados + CABECALHO_IPV4 + SOBRA_ETHERNET) * 8, 0);
    for (let k = 0; k < viz.saltos.length; k++) {
      const s = viz.saltos[k]!;
      const quem = m.equipamentos.get(s.para)!;
      const portaRx = acharPorta(m, s.cabo.a.equip === s.para ? s.cabo.a : s.cabo.b);
      if (quem.tipo === 'switch' && temFluxos(quem)) {
        const prox = viz.saltos[k + 1];
        const saida = prox ? (prox.cabo.a.equip === quem.nome ? prox.cabo.a.porta : prox.cabo.b.porta) : undefined;
        if (!fluxoNoSwitch(m, quem, p, portaRx.nome, saida, v)) {
          v.onde = quem.nome;
          return v;
        }
      }
      v.tempo += bits / (s.estado.velocidade * 1e6) + s.estado.atrasoS + (ENCAMINHAR[quem.tipo] ?? 0);
      if (m.rng() < fer(s.estado.ber, bits)) {
        portaRx.contadores.crc++;
        v.perdido = true;
        v.onde = s.para;
        return v;
      }
      portaRx.contadores.rx++;
      aprenderNoSalto(m, s, atual.mac, viz.e.mac);
      v.nos!.push(s.para);
      if (p.tunel) (v.nosTunel ??= []).push(s.para);
    }
    if (viz.saltos.length) {
      (v.trechos ??= []).push({
        de: atual.nome,
        porta: rota.porta,
        mbps: Math.min(...viz.saltos.map((s) => s.estado.velocidade)),
        atrasoS: viz.saltos.reduce((t, s) => t + s.estado.atrasoS + (ENCAMINHAR[m.equipamentos.get(s.para)!.tipo] ?? 0), 0),
        ber: viz.saltos.reduce((t, s) => t + s.estado.ber, 0),
      });
    }
    v.ultimoMac = atual.mac;
    entrada = viz.porta;
    atual = viz.e;
  }
  v.falha = 'O pacote rodou demais e foi descartado.';
  return v;
}

/* ---------- Ping e traceroute ---------- */

function semEndereco(e: Equipamento): string | null {
  return interfacesL3(e).length ? null : 'Sem endereço IP. Eu sou só uma placa de rede com sonhos.';
}

/** Quando a origem nem consegue mandar: tempestade derruba tudo antes. */
function checarTempestade(m: Mundo, de: Equipamento): string | null {
  const laco = tempestade(m, de.nome);
  if (!laco) return null;
  m.flags.tempestade = laco;
  for (const c of m.cabos.values()) {
    for (const p of [c.a, c.b]) {
      if (!laco.includes(p.equip)) continue;
      const porta = acharPorta(m, p);
      porta.contadores.rx += 250000;
      porta.contadores.tx += 250000;
    }
  }
  return textoTempestade(laco);
}

/** Dica de VLAN quando o ARP falha mas existe cabo até quem tem o IP. */
function dicaArp(m: Mundo, de: Equipamento, ip: number): string | null {
  const alvo = donoDoIp(m, ip);
  if (!alvo || !caminho(m, de.nome, alvo.e.nome, { ignorarVlan: true })) return null;
  const va = vlanDoHost(m, de.nome);
  const vb = vlanDoHost(m, alvo.e.nome);
  return typeof va === 'number' && typeof vb === 'number' && va !== vb
    ? `${de.nome} está na VLAN ${va} e ${alvo.e.nome} na VLAN ${vb}. Cada VLAN é uma rede de enlace separada: o ARP não passa de uma para a outra. Para elas se falarem, cada uma precisa de uma interface do roteador.`
    : `O cabo existe, mas a VLAN não chega: algum enlace no caminho não carrega a VLAN de ${de.nome}. Confira os troncos e as portas de acesso com "mostra vlan".`;
}

function ms(s: number): string {
  const x = s * 1000;
  return x < 1 ? x.toFixed(3) : x.toFixed(1);
}

function ipOrigemPara(e: Equipamento, ip: number): number | null {
  const rota = escolherRota(e, ip);
  const intfs = interfacesL3(e);
  const i = (rota && intfs.find((x) => x.porta === rota.porta)) ?? intfs[0];
  return i ? i.cidr.endereco : null;
}

export interface Sonda {
  ida: Viagem;
  volta?: Viagem;
  rtt?: number;
}

/** Um pedido de eco e a resposta, com o que aconteceu nos dois sentidos. */
export function sondar(m: Mundo, de: Equipamento, ip: number, seq: number, o: OpcoesPing = {}): Sonda {
  const origem = ipOrigemPara(de, ip) ?? 0;
  const p = novoPacote(m, { origem, destino: ip, ttl: o.ttl ?? de.ttl, dados: o.tamanho ?? 56, df: o.df, icmp: { tipo: 8, codigo: 0, id: ID_PING, seq } });
  const ida = viajar(m, de.nome, p);
  if (!ida.entregue) return { ida };
  const alvo = m.equipamentos.get(ida.onde)!;
  const resp = novoPacote(m, { origem: ida.pacote.destino, destino: ida.pacote.origem, ttl: alvo.ttl, dados: o.tamanho ?? 56, df: o.df, icmp: { tipo: 0, codigo: 0, id: ida.pacote.icmp.id, seq } });
  const volta = viajar(m, alvo.nome, resp);
  const voltou = volta.entregue && volta.onde === de.nome;
  return { ida, volta, rtt: voltou ? ida.tempo + ATRASO_RESPOSTA + volta.tempo : undefined };
}

function linhaErro(seq: number, e: NonNullable<Viagem['icmpErro']>): string {
  return `seq=${seq}: resposta de ${ipTexto(e.de)} (${e.nome}): ${nomeIcmp(e.tipo, e.codigo)}${e.mtu ? `, MTU do próximo salto ${e.mtu}` : ''}`;
}

/** Ping com camada de rede: vai ao gateway quando o destino é de outra rede, e cada roteador gasta um do TTL. */
export function pingRoteado(m: Mundo, deNome: string, ip: number, n = 4, o: OpcoesPing = {}): ResultadoPing {
  const de = m.equipamentos.get(deNome)!;
  const r: ResultadoPing = { enviados: n, recebidos: 0, rtts: [], linhas: [] };
  const falha = (erro: string): ResultadoPing => ({ ...r, recebidos: 0, erro, linhas: [erro] });
  const sem = semEndereco(de);
  if (sem) return falha(sem);
  const dados = o.tamanho ?? 56;
  if (!Number.isInteger(dados) || dados < 0 || dados > 65507) return falha('Tamanho de 0 a 65507 bytes de dados. Um datagrama IPv4 inteiro tem no máximo 65535.');
  const laco = checarTempestade(m, de);
  if (laco) return { ...r, erro: 'tempestade', linhas: [laco] };
  let dicaDada = false;
  for (let seq = 1; seq <= n; seq++) {
    const s = sondar(m, de, ip, seq, o);
    const { ida, volta } = s;
    if (seq === 1) {
      r.roteadores = ida.roteadores.map((x) => x.nome);
      r.linhas.push(...ida.eventos.filter((x) => x.includes('fragmenta') || x.includes('NAT') || x.includes('DSCP') || x.includes('regra') || x.includes('controlador')));
    }
    if (ida.falha && !ida.entregue && !ida.icmpErro) {
      if (ida.semArp !== undefined) {
        if (!dicaDada) {
          const d = dicaArp(m, de, ida.semArp);
          if (d) r.linhas.push(d);
          dicaDada = true;
        }
        r.linhas.push(`seq=${seq}: ARP sem resposta para ${ipTexto(ida.semArp)}. Ninguém do outro lado disse "sou eu".`);
        r.erro = 'sem resposta';
      } else if (ida.onde === de.nome) {
        return falha(ida.falha);
      } else {
        r.linhas.push(`seq=${seq}: ${ida.falha}`);
        r.erro ??= 'descartado';
      }
      continue;
    }
    if (ida.perdido) {
      r.linhas.push(`seq=${seq}: pedido perdido no caminho (erro de CRC)`);
      continue;
    }
    if (ida.icmpErro) {
      const e = ida.icmpErro;
      r.icmp = { tipo: e.tipo, codigo: e.codigo, de: e.de };
      r.erro = nomeIcmp(e.tipo, e.codigo);
      r.linhas.push(e.viagem.entregue && e.viagem.onde === de.nome ? linhaErro(seq, e) : `seq=${seq}: sem resposta (o pacote morreu em ${e.nome}, e nem o aviso voltou)`);
      continue;
    }
    // Chegou: a captura é feita no destino, com o TTL que sobrou.
    const alvo = m.equipamentos.get(ida.onde)!;
    const h = montarCabecalho({ tamanhoTotal: ida.pacote.tamanho, identificacao: ida.pacote.identificacao, df: ida.pacote.df, ttl: ida.pacote.ttl, protocolo: 1, origem: ida.pacote.origem, destino: ida.pacote.destino, tos: ida.pacote.tos });
    const tos = ida.pacote.tos;
    m.ultimaCaptura = {
      eth: { origem: ida.ultimoMac || de.mac, destino: alvo.mac, etherType: 0x0800 },
      ip: { origem: ida.pacote.origem, destino: ida.pacote.destino, ttl: ida.pacote.ttl, protocolo: 1, tamanho: ida.pacote.tamanho },
      icmp: { tipo: 8, codigo: 0, id: ida.pacote.icmp.id, seq },
      detalhe: {
        identificacao: h.identificacao,
        df: h.df,
        checksum: h.checksum,
        confere: cabecalhoConfere(h) && remontar(ida.pacote.fragmentos) === ida.pacote.tamanho - CABECALHO_IPV4,
        ttlSaida: o.ttl ?? de.ttl,
        roteadores: ida.roteadores.map((x) => x.nome),
        fragmentos: ida.pacote.fragmentos.map((f) => ({ deslocamento: f.deslocamento, dados: f.dados, mf: f.mf })),
        dados,
        ...(tos !== undefined ? { servico: { byte: tos, dscp: tos >> 2, ecn: tos & 3, classe: nomeDscp(tos >> 2) } } : {}),
      },
    };
    if (s.rtt !== undefined) {
      r.recebidos++;
      r.rtts.push(s.rtt * 1000);
      r.ttl = volta!.pacote.ttl;
      r.linhas.push(`seq=${seq} ttl=${volta!.pacote.ttl} tempo=${ms(s.rtt)} ms`);
    } else if (volta!.icmpErro) {
      const e = volta!.icmpErro;
      r.linhas.push(`seq=${seq}: o pedido chegou, mas a resposta morreu na volta: ${e.nome} disse "${nomeIcmp(e.tipo, e.codigo)}"`);
    } else if (volta!.perdido) {
      r.linhas.push(`seq=${seq}: resposta perdida no caminho (erro de CRC)`);
    } else if (volta!.onde === alvo.nome) {
      r.linhas.push(`seq=${seq}: o pedido chegou, mas ${alvo.nome} não sabe voltar pra ${ipTexto(ida.pacote.origem)}`);
    } else {
      r.linhas.push(`seq=${seq}: o pedido chegou, mas a resposta parou em ${volta!.onde}: ${volta!.falha ?? 'sem rota'}`);
    }
  }
  return r;
}

export interface SaltoTrace {
  ttl: number;
  ip?: number;
  nome?: string;
  rtts: (number | null)[];
  marca?: string;
}

export interface ResultadoTrace {
  saltos: SaltoTrace[];
  chegou: boolean;
  /** Algum roteador apareceu duas vezes: laço de roteamento. */
  laco?: boolean;
  linhas: string[];
}

/**
 * Traceroute: manda sondas com TTL 1, 2, 3... Cada roteador que zera o TTL devolve "tempo esgotado"
 * com o próprio endereço, e assim se descobre o caminho. Três sondas por salto, como o de verdade.
 */
export function traceroute(m: Mundo, deNome: string, ip: number, max = 30): ResultadoTrace {
  const de = m.equipamentos.get(deNome)!;
  const r: ResultadoTrace = { saltos: [], chegou: false, linhas: [`traceroute para ${ipTexto(ip)}, no máximo ${max} saltos, 3 sondas por salto`] };
  const sem = semEndereco(de);
  if (sem) return { ...r, linhas: [sem] };
  const laco = checarTempestade(m, de);
  if (laco) return { ...r, linhas: [laco] };
  let silencio = 0;
  for (let ttl = 1; ttl <= max; ttl++) {
    const salto: SaltoTrace = { ttl, rtts: [] };
    let fim = false;
    for (let k = 0; k < 3; k++) {
      const s = sondar(m, de, ip, ttl * 3 + k, { ttl });
      const e = s.ida.icmpErro;
      if (s.ida.falha && !s.ida.icmpErro && !s.ida.entregue && s.ida.onde === de.nome) {
        return { ...r, linhas: [...r.linhas, s.ida.falha] };
      }
      if (e && e.viagem.entregue && e.viagem.onde === de.nome) {
        salto.ip = e.de;
        salto.nome = e.nome;
        salto.rtts.push((s.ida.tempo + e.viagem.tempo) * 1000);
        if (e.tipo === 3) {
          salto.marca = e.codigo === 4 ? '!F' : e.codigo === 1 ? '!H' : '!N';
          fim = true;
        }
      } else if (s.rtt !== undefined) {
        salto.ip = s.ida.pacote.destino;
        salto.nome = s.ida.onde;
        salto.rtts.push(s.rtt * 1000);
        fim = true;
        r.chegou = true;
      } else salto.rtts.push(null);
    }
    r.saltos.push(salto);
    const tempos = salto.rtts.map((x) => (x === null ? '*' : `${x < 1 ? x.toFixed(3) : x.toFixed(1)} ms`)).join('  ');
    r.linhas.push(`${String(ttl).padStart(2)}  ${salto.ip !== undefined ? `${salto.nome} (${ipTexto(salto.ip)})  ` : ''}${tempos}${salto.marca ? '  ' + salto.marca : ''}`);
    if (fim) break;
    const repetido = salto.nome !== undefined && r.saltos.slice(0, -1).some((x) => x.nome === salto.nome);
    if (repetido && !r.laco) {
      r.linhas.push(`Laço de roteamento: ${salto.nome} (${ipTexto(salto.ip!)}) apareceu de novo. Os roteadores estão jogando o pacote um para o outro, e só o TTL impede que ele gire para sempre.`);
      r.laco = true;
    }
    silencio = salto.ip === undefined ? silencio + 1 : 0;
    if (silencio >= 4) {
      r.linhas.push('Quatro saltos seguidos em silêncio: daqui para a frente ninguém responde. Parei de insistir.');
      break;
    }
  }
  return r;
}

/* ---------- DHCP ---------- */

export interface ServidorDhcp {
  porta: string;
  inicio: string;
  fim: string;
  gateway?: string;
  dns?: string;
  concessao: number;
  concessoes: Record<string, string>;
}

export function configurarDhcp(e: Equipamento, porta: string, inicio: string, fim: string, o: { gateway?: string; dns?: string; concessao?: number } = {}): void {
  const antigo = e.s.dhcp as ServidorDhcp | undefined;
  e.s.dhcp = { porta, inicio, fim, gateway: o.gateway, dns: o.dns, concessao: o.concessao ?? 86400, concessoes: antigo?.concessoes ?? {} } satisfies ServidorDhcp;
}

function usado(m: Mundo, ip: number, excetoNome: string): boolean {
  for (const e of m.equipamentos.values()) {
    if (e.nome === excetoNome) continue;
    if (interfacesL3(e).some((i) => i.cidr.endereco === ip)) return true;
  }
  return false;
}

export function textoTempo(s: number): string {
  return s % 86400 === 0 ? `${s / 86400} dia(s)` : s % 3600 === 0 ? `${s / 3600} h` : s % 60 === 0 ? `${s / 60} min` : `${s} s`;
}

/**
 * O PC pede endereço: descoberta em broadcast, oferta do servidor, pedido (de novo em broadcast,
 * para os outros servidores saberem que perderam) e confirmação. O broadcast não atravessa roteador.
 */
export function pedirDhcp(m: Mundo, nome: string): { ok: boolean; linhas: string[] } {
  const pc = m.equipamentos.get(nome)!;
  const linhas = [`DHCPDISCOVER  0.0.0.0:68 → 255.255.255.255:67 em broadcast: "alguém me dá um endereço?" (MAC ${pc.mac})`];
  const laco = checarTempestade(m, pc);
  if (laco) return { ok: false, linhas: [...linhas, laco] };
  for (const srv of m.equipamentos.values()) {
    const d = srv.s.dhcp as ServidorDhcp | undefined;
    if (!d || srv.nome === pc.nome || !respondendo(srv)) continue;
    const intf = interfacesL3(srv).find((i) => i.porta === d.porta);
    if (!intf) continue;
    const saltos = caminho(m, pc.nome, srv.nome, { portaOrigem: pc.portas[0]?.nome, portaDestino: d.porta });
    if (!saltos) continue;
    aprenderNoCaminho(m, saltos, pc.mac, BROADCAST);
    const ini = lerIp(d.inicio);
    const fim = lerIp(d.fim);
    if (ini === null || fim === null) continue;
    let escolhido: number | null = null;
    const anterior = d.concessoes[pc.mac] ? lerIp(d.concessoes[pc.mac]!) : null;
    if (anterior !== null && anterior >= ini && anterior <= fim && !usado(m, anterior, pc.nome)) escolhido = anterior;
    const ocupados = new Set(Object.entries(d.concessoes).filter(([mac]) => mac !== pc.mac).map(([, ip]) => ip));
    for (let ip = ini; escolhido === null && ip <= fim; ip++) {
      if (!pertence(ip, intf.cidr) || ip === intf.cidr.endereco || ocupados.has(ipTexto(ip)) || usado(m, ip, pc.nome)) continue;
      escolhido = ip;
    }
    const ipSrv = ipTexto(intf.cidr.endereco);
    if (escolhido === null) {
      linhas.push(`${srv.nome} (${ipSrv}) ouviu, mas a faixa ${d.inicio} a ${d.fim} está esgotada. Ninguém oferece nada.`);
      return { ok: false, linhas };
    }
    const gw = d.gateway ?? ipSrv;
    const cidr = { endereco: escolhido, prefixo: intf.cidr.prefixo };
    const ext = `gateway ${gw}${d.dns ? `, DNS ${d.dns}` : ''}, concessão de ${d.concessao} s (${textoTempo(d.concessao)})`;
    linhas.push(
      `DHCPOFFER     ${ipSrv}:67 → ${pc.mac}: "pode ficar com ${textoCidr(cidr)}", ${ext}`,
      `DHCPREQUEST   0.0.0.0:68 → 255.255.255.255:67 em broadcast: "quero o ${ipTexto(escolhido)} que ${ipSrv} ofereceu"`,
      `DHCPACK       ${ipSrv}:67 → ${pc.mac}: confirmado, ${ipTexto(escolhido)} é seu por ${textoTempo(d.concessao)}`,
    );
    d.concessoes[pc.mac] = ipTexto(escolhido);
    pc.ip = cidr;
    pc.s.gateway = gw;
    if (d.dns) pc.s.dns = d.dns;
    else delete pc.s.dns;
    pc.s.concessao = { servidor: ipSrv, segundos: d.concessao };
    pc.s.arp = {};
    linhas.push(`eth0 agora é ${textoCidr(cidr)}, gateway ${gw}. Na metade da concessão, o PC pede para renovar.`);
    return { ok: true, linhas };
  }
  linhas.push('DHCPDISCOVER  (de novo, depois de 4 s)', 'DHCPDISCOVER  (de novo, depois de 8 s)', 'Nenhum servidor DHCP respondeu. O broadcast não passa de roteador, então o servidor precisa estar nesta rede de enlace (ou ter um agente de repasse).');
  return { ok: false, linhas };
}

/* ---------- IPv6 (só dentro do enlace) ---------- */

/** Endereços IPv6 de um aparelho: o de enlace local, sempre, e os configurados em s.ipv6 ("2001:db8:1::10/64"). */
export function ipv6De(e: Equipamento): { endereco: string; prefixo: number }[] {
  const out: { endereco: string; prefixo: number }[] = [];
  const ll = e.mac ? enlaceLocal(e.mac) : null;
  if (ll && (e.tipo === 'pc' || ehRoteador(e) || e.s.ipv6)) out.push({ endereco: ll, prefixo: 64 });
  for (const txt of (e.s.ipv6 as string[] | undefined) ?? []) {
    const [a, p] = txt.split('/');
    const ab = abreviarIpv6(a ?? '');
    if (ab) out.push({ endereco: ab, prefixo: Number(p ?? 64) || 64 });
  }
  return out;
}

/** Ping6 dentro do mesmo enlace: descoberta de vizinho (NS/NA) no lugar do ARP, hop limit no lugar do TTL. */
export function ping6(m: Mundo, deNome: string, destino: string, n = 4): ResultadoPing {
  const de = m.equipamentos.get(deNome)!;
  const r: ResultadoPing = { enviados: n, recebidos: 0, rtts: [], linhas: [] };
  const falha = (erro: string): ResultadoPing => ({ ...r, erro, linhas: [erro] });
  const alvoTxt = abreviarIpv6(destino);
  if (!alvoTxt || !lerIpv6(destino)) return falha('Endereço IPv6 inválido. Exemplo: fe80::c8:ff:fe00:2 ou 2001:db8:1::20');
  const meus = ipv6De(de);
  if (!meus.length) return falha('Sem IPv6 nesta interface.');
  const noEnlace = ehEnlaceLocal(alvoTxt) || meus.some((x) => !ehEnlaceLocal(x.endereco) && mesmoPrefixoIpv6(x.endereco, alvoTxt, x.prefixo));
  if (!noEnlace) return falha(`${alvoTxt} está fora do meu /64. Para sair do enlace precisaria de um roteador IPv6, e este laboratório só tem IPv6 dentro do enlace.`);
  const cheio = expandirIpv6(alvoTxt);
  const dono = [...m.equipamentos.values()].find((e) => e.nome !== de.nome && ipv6De(e).some((x) => expandirIpv6(x.endereco) === cheio));
  const saltos = dono ? caminho(m, de.nome, dono.nome) : null;
  r.linhas.push(`NS (descoberta de vizinho) para ${noSolicitado(alvoTxt)}: quem tem ${alvoTxt}?`);
  if (!dono || !saltos) {
    for (let seq = 1; seq <= n; seq++) r.linhas.push(`seq=${seq}: nenhum vizinho respondeu ao NS.`);
    return { ...r, erro: 'sem resposta' };
  }
  r.linhas.push(`NA de ${dono.nome}: "sou eu", MAC ${dono.mac}. O IPv6 não tem broadcast: usa multicast.`);
  const bits = (56 + 8 + 40 + SOBRA_ETHERNET) * 8;
  const t = saltos.reduce((s, x) => s + bits / (x.estado.velocidade * 1e6) + x.estado.atrasoS + (ENCAMINHAR[m.equipamentos.get(x.para)!.tipo] ?? 0), 0);
  for (let seq = 1; seq <= n; seq++) {
    const rtt = 2 * t + ATRASO_RESPOSTA;
    r.recebidos++;
    r.rtts.push(rtt * 1000);
    r.ttl = 64;
    r.linhas.push(`seq=${seq} hlim=64 tempo=${ms(rtt)} ms`);
  }
  r.linhas.push('Cabeçalho IPv6 fixo de 40 bytes, sem checksum e sem fragmentação nos roteadores (só a origem fragmenta).');
  return r;
}
