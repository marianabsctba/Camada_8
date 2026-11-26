// Segurança no plano de dados do roteador (ato 7): firewall com regras ordenadas e filtro com estado, IDS e IPS
// por assinatura e por anomalia. Tudo aqui olha só o que o pacote carrega (endereços, protocolo, portas, flags e,
// quando a aplicação mostra, o conteúdo em claro). Nada disso age se o roteador não tiver a configuração:
// sem s.firewall e sem s.ids, o caminho dos pacotes é exatamente o de antes.

import type { Equipamento, Mundo } from './mundo';
import { ipTexto, lerCidr, lerIp, mascara } from './util';

/* ---------- Flags com histórico ---------- */

/** Quantos registros de cada tipo o histórico guarda (os mais antigos saem primeiro). */
export const LIMITE_HISTORICO = 40;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RegistroFlag = Record<string, any>;

/**
 * Grava o resultado de um comando em m.flags[tipo] (o último, que é o que a maioria dos objetivos lê) e acrescenta
 * uma cópia em m.flags.historico[tipo], para os objetivos que pedem várias contas no mesmo dia. A lista tem limite.
 */
export function anotarFlag(m: Mundo, tipo: string, valor: RegistroFlag): RegistroFlag {
  m.flags[tipo] = valor;
  const hist = (m.flags.historico ??= {}) as Record<string, RegistroFlag[]>;
  const lista = (hist[tipo] ??= []);
  lista.push({ ...valor });
  if (lista.length > LIMITE_HISTORICO) lista.splice(0, lista.length - LIMITE_HISTORICO);
  return valor;
}

/** Tudo que foi anotado de um tipo, do mais antigo para o mais novo. */
export function historicoDe(m: Mundo, tipo: string): RegistroFlag[] {
  return ((m.flags.historico as Record<string, RegistroFlag[]> | undefined)?.[tipo] ?? []) as RegistroFlag[];
}

/** O registro mais novo de um tipo que satisfaz a condição. */
export function ultimoQue(m: Mundo, tipo: string, f: (x: RegistroFlag) => boolean = () => true): RegistroFlag | undefined {
  const h = historicoDe(m, tipo);
  for (let i = h.length - 1; i >= 0; i--) if (f(h[i]!)) return h[i];
  return undefined;
}

export type AcaoFw = 'permitir' | 'negar';
export type ProtoFw = 'tcp' | 'udp' | 'icmp';

export interface RegraFw {
  id: number;
  acao: AcaoFw;
  /** Prefixo de origem ("192.168.1.0/24"), um IP solto ou nada (qualquer). */
  origem?: string;
  destino?: string;
  proto?: ProtoFw;
  /** Porta (ou faixa) de destino. */
  porta?: [number, number];
  portaOrigem?: [number, number];
  /** "nova": primeiro pacote de uma conversa; "estabelecida": de uma conversa que já passou por aqui. */
  estado?: 'nova' | 'estabelecida';
  /** Interface de entrada do pacote neste roteador. */
  entrada?: string;
  contador: number;
}

export interface ConfigFirewall {
  regras: RegraFw[];
  padrao: AcaoFw;
  /** Filtro com estado: deixa passar, antes das regras, tudo que pertence a uma conversa já permitida. */
  comEstado: boolean;
  /** Tabela de estado: uma linha por conversa permitida (protocolo, origem e destino com portas, no sentido de quem abriu). */
  conexoes: string[];
  /**
   * Estado TCP de cada conversa da tabela (RFC 9293, §3.5): "syn-enviado" depois do SYN de quem abre, "estabelecida"
   * depois do SYN+ACK de volta. Conversa sem estado anotado (UDP, ICMP, tabela antiga) conta como estabelecida.
   */
  estados?: Record<string, EstadoConversa>;
  proxId: number;
  contadores: { permitidos: number; negados: number; porEstado: number; porPadrao: number };
  /** Últimas decisões, para "firewall log". */
  log: string[];
}

/** O que o filtro enxerga de um pacote. */
export interface InfoPacote {
  origem: number;
  destino: number;
  /** 1 ICMP, 6 TCP, 17 UDP, 50 ESP. */
  protocolo: number;
  portaOrigem?: number;
  portaDestino?: number;
  /** Flags TCP em texto: "SYN", "SYN+ACK", "ACK". */
  flags?: string;
  icmpTipo?: number;
  icmpId?: number;
  erro?: boolean;
}

export interface DecisaoFw {
  acao: AcaoFw;
  /** id da regra que decidiu, "estado" (conversa conhecida) ou "padrao" (política padrão). */
  por: number | 'estado' | 'padrao';
  estabelecida: boolean;
  texto: string;
}

export const NOME_PROTO: Record<number, string> = { 1: 'icmp', 6: 'tcp', 17: 'udp', 50: 'esp' };

export function firewallDe(e: Equipamento): ConfigFirewall | undefined {
  return e.s.firewall as ConfigFirewall | undefined;
}

export function novoFirewall(): ConfigFirewall {
  return { regras: [], padrao: 'permitir', comEstado: false, conexoes: [], proxId: 1, contadores: { permitidos: 0, negados: 0, porEstado: 0, porPadrao: 0 }, log: [] };
}

function casaPrefixo(txt: string | undefined, ip: number): boolean {
  if (!txt || txt === 'qualquer' || txt === '*') return true;
  const c = lerCidr(txt.includes('/') ? txt : `${txt}/32`);
  if (!c) return false;
  const m = mascara(c.prefixo);
  return ((ip & m) >>> 0) === ((c.endereco & m) >>> 0);
}

function casaFaixa(f: [number, number] | undefined, p: number | undefined): boolean {
  if (!f) return true;
  return p !== undefined && p >= f[0] && p <= f[1];
}

/** Portas que identificam a conversa: TCP e UDP pelas portas; ICMP de eco pelo identificador. */
function portas(i: InfoPacote): [number, number] {
  if (i.protocolo === 1) return [i.icmpId ?? 0, i.icmpId ?? 0];
  return [i.portaOrigem ?? 0, i.portaDestino ?? 0];
}

export function chaveConversa(i: InfoPacote): string {
  const [po, pd] = portas(i);
  return `${NOME_PROTO[i.protocolo] ?? i.protocolo} ${ipTexto(i.origem)}:${po} > ${ipTexto(i.destino)}:${pd}`;
}

function chaveInversa(i: InfoPacote): string {
  const [po, pd] = portas(i);
  return `${NOME_PROTO[i.protocolo] ?? i.protocolo} ${ipTexto(i.destino)}:${pd} > ${ipTexto(i.origem)}:${po}`;
}

export type EstadoConversa = 'syn-enviado' | 'estabelecida';

interface ConversaAchada {
  chave: string;
  /** O pacote vai no sentido contrário ao de quem abriu a conversa. */
  volta: boolean;
  estado: EstadoConversa;
}

function acharConversa(fw: ConfigFirewall, i: InfoPacote): ConversaAchada | null {
  const ida = chaveConversa(i);
  if (fw.conexoes.includes(ida)) return { chave: ida, volta: false, estado: fw.estados?.[ida] ?? 'estabelecida' };
  const inv = chaveInversa(i);
  if (fw.conexoes.includes(inv)) return { chave: inv, volta: true, estado: fw.estados?.[inv] ?? 'estabelecida' };
  return null;
}

/** Flags TCP do segmento como conjunto ("SYN+ACK" vira SYN e ACK). Sem flags informadas, é um segmento comum (ACK). */
function flagsTcp(i: InfoPacote): Set<string> {
  return new Set((i.flags ?? 'ACK').toUpperCase().split('+').map((x) => x.trim()));
}

/**
 * O pacote cabe na conversa achada? No TCP (RFC 9293, §3.5), depois do SYN de quem abre só vale, na volta, o
 * SYN+ACK; com a conversa estabelecida, segmento com SYN não pertence mais a ela (seria outra abertura). RST vale
 * nos dois sentidos. Aproximação: o firewall não confere os números de sequência, só as flags e o sentido.
 * No ICMP de eco, a ida é o pedido (tipo 8) e a volta é a resposta (tipo 0).
 */
function cabeNaConversa(c: ConversaAchada, i: InfoPacote): boolean {
  if (i.protocolo === 6) {
    const f = flagsTcp(i);
    if (f.has('RST')) return true;
    if (c.estado === 'syn-enviado') return c.volta && f.has('SYN') && f.has('ACK');
    return !f.has('SYN');
  }
  if (i.protocolo === 1) return c.volta ? i.icmpTipo === 0 : i.icmpTipo === 8;
  return true;
}

/** O pacote pertence a uma conversa que o firewall já deixou passar (num sentido ou no outro), do jeito certo? */
export function conversaConhecida(fw: ConfigFirewall, i: InfoPacote): boolean {
  if (i.erro) {
    // Erro ICMP é "relacionado": vale se existe qualquer conversa entre os dois endereços.
    const a = ipTexto(i.origem);
    const b = ipTexto(i.destino);
    return fw.conexoes.some((c) => (c.includes(` ${a}:`) && c.includes(` ${b}:`)) || c.includes(`> ${b}:`));
  }
  const c = acharConversa(fw, i);
  return !!c && cabeNaConversa(c, i);
}

export function casaRegra(r: RegraFw, i: InfoPacote, entrada: string | undefined, estabelecida: boolean): boolean {
  if (r.proto && NOME_PROTO[i.protocolo] !== r.proto) return false;
  if (!casaPrefixo(r.origem, i.origem) || !casaPrefixo(r.destino, i.destino)) return false;
  if (r.porta || r.portaOrigem) {
    if (i.protocolo !== 6 && i.protocolo !== 17) return false;
    if (!casaFaixa(r.porta, i.portaDestino) || !casaFaixa(r.portaOrigem, i.portaOrigem)) return false;
  }
  if (r.estado === 'nova' && estabelecida) return false;
  if (r.estado === 'estabelecida' && !estabelecida) return false;
  if (r.entrada && r.entrada !== entrada) return false;
  return true;
}

export function textoRegra(r: RegraFw): string {
  const faixa = (f: [number, number]) => (f[0] === f[1] ? String(f[0]) : `${f[0]}-${f[1]}`);
  const partes = [
    r.acao.toUpperCase().padEnd(9),
    r.proto ?? 'qualquer',
    `de ${r.origem ?? 'qualquer'}${r.portaOrigem ? ` porta ${faixa(r.portaOrigem)}` : ''}`,
    `para ${r.destino ?? 'qualquer'}${r.porta ? ` porta ${faixa(r.porta)}` : ''}`,
  ];
  if (r.estado) partes.push(`estado ${r.estado}`);
  if (r.entrada) partes.push(`entrando por ${r.entrada}`);
  return partes.join(' ');
}

function anotar(fw: ConfigFirewall, texto: string): void {
  fw.log.push(texto);
  if (fw.log.length > 60) fw.log.splice(0, fw.log.length - 60);
}

/**
 * Abre a conversa na tabela de estado: só o SYN sozinho do TCP (um ACK ou SYN+ACK sem conversa conhecida não cria
 * estado, como no rastreamento de conexões de verdade), o pedido de eco do ICMP e qualquer UDP.
 */
function abreConversa(i: InfoPacote): boolean {
  if (i.erro) return false;
  if (i.protocolo === 6) {
    const f = flagsTcp(i);
    return f.has('SYN') && !f.has('ACK') && !f.has('RST') && !f.has('FIN');
  }
  if (i.protocolo === 1) return i.icmpTipo === 8;
  return true;
}

/** Depois de um pacote que coube na conversa: o SYN+ACK de volta a estabelece; o RST a encerra. */
function avancarConversa(fw: ConfigFirewall, i: InfoPacote): void {
  if (i.protocolo !== 6 || i.erro) return;
  const c = acharConversa(fw, i);
  if (!c) return;
  const f = flagsTcp(i);
  if (f.has('RST')) {
    fw.conexoes.splice(fw.conexoes.indexOf(c.chave), 1);
    if (fw.estados) delete fw.estados[c.chave];
  } else if (c.estado === 'syn-enviado' && c.volta && f.has('SYN') && f.has('ACK')) (fw.estados ??= {})[c.chave] = 'estabelecida';
}

/**
 * Decide o destino do pacote no firewall do roteador: primeiro a tabela de estado (se o filtro com estado estiver
 * ligado), depois as regras em ordem (vence a primeira que casa) e, sem regra, a política padrão.
 */
export function avaliarFirewall(fw: ConfigFirewall, i: InfoPacote, entrada: string | undefined): DecisaoFw {
  const estabelecida = conversaConhecida(fw, i);
  const desc = `${chaveConversa(i)}${i.flags ? ` [${i.flags}]` : ''}`;
  let d: DecisaoFw;
  if (fw.comEstado && estabelecida) {
    fw.contadores.porEstado++;
    d = { acao: 'permitir', por: 'estado', estabelecida, texto: `${desc}: conversa conhecida na tabela de estado, passa` };
  } else {
    const r = fw.regras.find((x) => casaRegra(x, i, entrada, estabelecida));
    if (r) {
      r.contador++;
      d = { acao: r.acao, por: r.id, estabelecida, texto: `${desc}: regra ${r.id} (${textoRegra(r).replace(/ +/g, ' ').trim()}) manda ${r.acao}` };
    } else {
      fw.contadores.porPadrao++;
      d = { acao: fw.padrao, por: 'padrao', estabelecida, texto: `${desc}: nenhuma regra casou, política padrão ${fw.padrao}` };
    }
  }
  if (d.acao === 'permitir') {
    fw.contadores.permitidos++;
    if (estabelecida) avancarConversa(fw, i);
    else if (abreConversa(i) && !acharConversa(fw, i)) {
      const chave = chaveConversa(i);
      fw.conexoes.push(chave);
      if (i.protocolo === 6) (fw.estados ??= {})[chave] = 'syn-enviado';
      if (fw.conexoes.length > 500) for (const velha of fw.conexoes.splice(0, fw.conexoes.length - 500)) if (fw.estados) delete fw.estados[velha];
    }
  } else fw.contadores.negados++;
  anotar(fw, `${d.acao === 'permitir' ? 'PASSOU ' : 'NEGADO '} ${d.texto}`);
  return d;
}

/** Resumo do firewall para m.flags: o que os objetivos dos dias conferem. */
export function resumoFirewall(e: Equipamento, fw: ConfigFirewall): RegistroFlag {
  return {
    roteador: e.nome,
    padrao: fw.padrao,
    comEstado: fw.comEstado,
    regras: fw.regras.map((r) => ({ id: r.id, texto: textoRegra(r).replace(/\s+/g, ' ').trim(), acao: r.acao, proto: r.proto ?? null, origem: r.origem ?? null, destino: r.destino ?? null, porta: r.porta ?? null, portaOrigem: r.portaOrigem ?? null, estado: r.estado ?? null, entrada: r.entrada ?? null, contador: r.contador })),
    contadores: { ...fw.contadores },
    conversas: fw.conexoes.length,
    decisoes: fw.log.length,
  };
}

/** Resumo do IDS para m.flags, com a contagem de alertas por nome. */
export function resumoIds(e: Equipamento, ids: ConfigIds): RegistroFlag {
  const porNome: Record<string, number> = {};
  for (const a of ids.alertas) porNome[a.nome] = (porNome[a.nome] ?? 0) + 1;
  return { roteador: e.nome, modo: ids.modo, limiarVarredura: ids.limiarVarredura, limiarSyn: ids.limiarSyn, limiarTaxa: ids.limiarTaxa, assinaturas: ids.assinaturas.map((a) => a.nome), alertas: ids.alertas.length, porNome, ultimo: ids.alertas[ids.alertas.length - 1] ?? null, bloqueados: [...ids.bloqueados] };
}

/**
 * Comando de firewall ou IDS no roteador: m.flags.firewall (ou ids) passa a ser o deste roteador, vai para o
 * histórico, e m.flags.firewallPor[roteador] (ou idsPor) guarda o de cada roteador.
 */
export function anotarFiltro(m: Mundo, tipo: 'firewall' | 'ids', e: Equipamento, resumo: RegistroFlag): void {
  anotarFlag(m, tipo, resumo);
  ((m.flags[`${tipo}Por`] ??= {}) as Record<string, RegistroFlag>)[e.nome] = resumo;
}

/**
 * Tráfego passou pelo firewall ou pelo IDS de e: as flags ficam com os contadores, a tabela de estado e os alertas
 * de agora (sem ir para o histórico, que é das mudanças feitas por comando). m.flags.firewall e m.flags.ids só
 * mudam se já eram deste roteador (ou se ainda não havia nenhum).
 */
export function refrescarFiltros(m: Mundo, e: Equipamento): void {
  const fw = firewallDe(e);
  if (fw) {
    const r = resumoFirewall(e, fw);
    ((m.flags.firewallPor ??= {}) as Record<string, RegistroFlag>)[e.nome] = r;
    if (!m.flags.firewall || m.flags.firewall.roteador === e.nome) m.flags.firewall = r;
  }
  const ids = idsDe(e);
  if (ids) {
    const r = resumoIds(e, ids);
    ((m.flags.idsPor ??= {}) as Record<string, RegistroFlag>)[e.nome] = r;
    if (!m.flags.ids || m.flags.ids.roteador === e.nome) m.flags.ids = r;
  }
}

/** "80", "1-1024". */
export function lerFaixa(txt: string | undefined): [number, number] | null {
  if (!txt) return null;
  const m = /^(\d+)(?:-(\d+))?$/.exec(txt);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return a >= 0 && b <= 65535 && a <= b ? [a, b] : null;
}

/**
 * Lê uma regra no formato do console: "permitir|negar [proto] [de <prefixo>] [para <prefixo>] [porta <n|a-b>]
 * [porta-origem <n|a-b>] [estado nova|estabelecida] [em <interface>]". Devolve a regra ou o erro em texto.
 */
export function lerRegra(args: string[]): Omit<RegraFw, 'id' | 'contador'> | string {
  const acao = args[0] === 'permitir' || args[0] === 'aceitar' ? 'permitir' : args[0] === 'negar' || args[0] === 'bloquear' ? 'negar' : null;
  if (!acao) return 'A regra começa com "permitir" ou "negar".';
  const r: Omit<RegraFw, 'id' | 'contador'> = { acao };
  for (let k = 1; k < args.length; k++) {
    const a = args[k]!;
    const v = args[k + 1];
    if (a === 'tcp' || a === 'udp' || a === 'icmp') r.proto = a;
    else if (a === 'qualquer' || a === 'ip') continue;
    else if (a === 'de' || a === 'origem' || a === 'para' || a === 'destino') {
      if (!v || (v !== 'qualquer' && !lerCidr(v.includes('/') ? v : `${v}/32`))) return `"${a}" precisa de um prefixo, por exemplo 192.168.1.0/24.`;
      if (a === 'de' || a === 'origem') r.origem = v === 'qualquer' ? undefined : v;
      else r.destino = v === 'qualquer' ? undefined : v;
      k++;
    } else if (a === 'porta' || a === 'porta-origem') {
      const f = lerFaixa(v);
      if (!f) return `"${a}" precisa de um número ou faixa, por exemplo 80 ou 1024-65535.`;
      if (a === 'porta') r.porta = f;
      else r.portaOrigem = f;
      k++;
    } else if (a === 'estado') {
      if (v !== 'nova' && v !== 'estabelecida') return 'estado nova ou estado estabelecida.';
      r.estado = v;
      k++;
    } else if (a === 'em' || a === 'entrada') {
      if (!v) return '"em" precisa do nome da interface de entrada.';
      r.entrada = v;
      k++;
    } else return `Não entendi "${a}" na regra.`;
  }
  if ((r.porta || r.portaOrigem) && r.proto === 'icmp') return 'ICMP não tem porta.';
  return r;
}

/* ---------- IDS e IPS ---------- */

export interface AssinaturaIds {
  nome: string;
  /** Texto procurado no conteúdo em claro (sem diferenciar maiúsculas). */
  padrao: string;
}

export interface AlertaIds {
  n: number;
  tipo: 'assinatura' | 'anomalia';
  nome: string;
  origem: string;
  destino: string;
  motivo: string;
  /** "alerta" (IDS só avisa) ou "bloqueio" (IPS descartou e passou a bloquear a origem). */
  acao: 'alerta' | 'bloqueio';
}

export interface ConfigIds {
  modo: 'ids' | 'ips';
  /** Portas distintas de uma origem para um destino que já contam como varredura. */
  limiarVarredura: number;
  /** SYN por segundo para um mesmo destino que já contam como inundação. */
  limiarSyn: number;
  /** Pacotes por segundo de uma origem acima do normal (anomalia). */
  limiarTaxa: number;
  assinaturas: AssinaturaIds[];
  alertas: AlertaIds[];
  bloqueados: string[];
  /** Portas vistas por par origem > destino (para a varredura). */
  portasVistas: Record<string, number[]>;
}

export const ASSINATURAS_PADRAO: AssinaturaIds[] = [
  { nome: 'injeção de SQL', padrao: "' or '1'='1" },
  { nome: 'travessia de diretório', padrao: '../' },
  { nome: 'senha em texto claro', padrao: 'senha=' },
  { nome: 'comando de shell no pedido', padrao: ';cat ' },
];

export function idsDe(e: Equipamento): ConfigIds | undefined {
  return e.s.ids as ConfigIds | undefined;
}

export function novoIds(modo: 'ids' | 'ips' = 'ids'): ConfigIds {
  return { modo, limiarVarredura: 10, limiarSyn: 200, limiarTaxa: 5000, assinaturas: ASSINATURAS_PADRAO.map((a) => ({ ...a })), alertas: [], bloqueados: [], portasVistas: {} };
}

export interface DecisaoIds {
  bloquear: boolean;
  alerta?: AlertaIds;
  texto?: string;
}

function alertar(ids: ConfigIds, a: Omit<AlertaIds, 'n' | 'acao'>): DecisaoIds {
  const bloquear = ids.modo === 'ips';
  const alerta: AlertaIds = { ...a, n: ids.alertas.length + 1, acao: bloquear ? 'bloqueio' : 'alerta' };
  ids.alertas.push(alerta);
  if (ids.alertas.length > 200) ids.alertas.splice(0, ids.alertas.length - 200);
  if (bloquear && !ids.bloqueados.includes(a.origem)) ids.bloqueados.push(a.origem);
  return { bloquear, alerta, texto: `${ids.modo.toUpperCase()} alerta ${alerta.n} (${a.tipo}: ${a.nome}): ${a.motivo}${bloquear ? `. O IPS descarta e passa a bloquear ${a.origem}.` : '. O IDS só avisa: o pacote segue.'}` };
}

/** Pacote a pacote, no caminho: origem já bloqueada pelo IPS e varredura de portas (muitas portas distintas). */
export function inspecionarPacote(ids: ConfigIds, i: InfoPacote): DecisaoIds {
  const origem = ipTexto(i.origem);
  if (ids.modo === 'ips' && ids.bloqueados.includes(origem)) return { bloquear: true, texto: `IPS: ${origem} está bloqueada desde um alerta anterior; descartado.` };
  const sonda = (i.protocolo === 6 && (!i.flags || i.flags === 'SYN')) || (i.protocolo === 17 && !i.erro);
  if (!sonda || i.portaDestino === undefined) return { bloquear: false };
  const par = `${origem} > ${ipTexto(i.destino)}`;
  const lista = (ids.portasVistas[par] ??= []);
  if (!lista.includes(i.portaDestino)) lista.push(i.portaDestino);
  if (lista.length === ids.limiarVarredura) {
    return alertar(ids, { tipo: 'assinatura', nome: 'varredura de portas', origem, destino: ipTexto(i.destino), motivo: `${origem} tentou ${lista.length} portas diferentes de ${ipTexto(i.destino)} (limiar ${ids.limiarVarredura})` });
  }
  return { bloquear: false };
}

/** Conteúdo em claro que passa pelo roteador (pedido HTTP, mensagem de correio). Cifrado, não casa nada. */
export function inspecionarConteudo(ids: ConfigIds, i: InfoPacote, conteudo: string): DecisaoIds {
  const origem = ipTexto(i.origem);
  if (ids.modo === 'ips' && ids.bloqueados.includes(origem)) return { bloquear: true, texto: `IPS: ${origem} está bloqueada; descartado.` };
  const baixo = conteudo.toLowerCase();
  const a = ids.assinaturas.find((x) => baixo.includes(x.padrao.toLowerCase()));
  if (!a) return { bloquear: false };
  return alertar(ids, { tipo: 'assinatura', nome: a.nome, origem, destino: ipTexto(i.destino), motivo: `o conteúdo de ${origem} para ${ipTexto(i.destino)} contém "${a.padrao}"` });
}

/** Taxa medida (pacotes por segundo): SYN demais para um destino ou tráfego de uma origem acima do limiar. */
export function inspecionarTaxa(ids: ConfigIds, i: InfoPacote, taxa: number, syn: boolean): DecisaoIds {
  const origem = ipTexto(i.origem);
  if (ids.modo === 'ips' && ids.bloqueados.includes(origem)) return { bloquear: true, texto: `IPS: ${origem} está bloqueada; descartado.` };
  if (syn && taxa > ids.limiarSyn) return alertar(ids, { tipo: 'assinatura', nome: 'inundação de SYN', origem, destino: ipTexto(i.destino), motivo: `${Math.round(taxa)} SYN por segundo de ${origem} para ${ipTexto(i.destino)}, sem completar o aperto de mão (limiar ${ids.limiarSyn})` });
  if (taxa > ids.limiarTaxa) return alertar(ids, { tipo: 'anomalia', nome: 'taxa fora do normal', origem, destino: ipTexto(i.destino), motivo: `${Math.round(taxa)} pacotes por segundo de ${origem}, acima do limiar de ${ids.limiarTaxa}` });
  return { bloquear: false };
}

/* ---------- VPN (IPsec em modo túnel) ---------- */

/** Bytes que o ESP em modo túnel com AES-GCM acrescenta (RFC 4303 e RFC 4106): IP novo (20), SPI e sequência (8), IV explícito (8), enchimento e trailer (até 3 + 2), ICV (16). */
export const SOBRA_ESP = 57;

export interface TunelVpn {
  nome: string;
  /** IP público do outro roteador (a outra ponta do túnel). */
  par: string;
  /** Rede de cá e rede de lá: o que vai de uma para a outra entra no túnel. */
  local: string;
  remota: string;
  segredo: string;
  spi: number;
  contadores: { cifrados: number; decifrados: number };
  ultimo?: { origem: string; destino: string; protocolo: number; tamanho: number; externo: string };
}

export function tuneisDe(e: Equipamento): Record<string, TunelVpn> | undefined {
  return e.s.vpn as Record<string, TunelVpn> | undefined;
}

export function casaPrefixoTxt(txt: string, ip: number): boolean {
  return casaPrefixo(txt, ip);
}

/** Lê um IP solto ou nome de host para as regras ("192.0.2.10" vira "192.0.2.10/32"). */
export function prefixoOuIp(txt: string): string | null {
  if (txt.includes('/')) return lerCidr(txt) ? txt : null;
  return lerIp(txt) !== null ? txt : null;
}
