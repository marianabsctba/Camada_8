// Comandos de console dos protocolos de roteamento (ato 4): OSPF, RIP, BGP, MPLS, Dijkstra, inundação,
// hierarquia, difusão, multicast, anycast e queda de enlace. O cli.ts chama daqui quando o comando não é dele.

import { acharPorta, type Equipamento, type Mundo } from './mundo';
import {
  asnValido,
  bgpDe,
  calcularBgp,
  calcularOspf,
  configOspf,
  configRip,
  criarLspMundo,
  custoOspf,
  areaDa,
  enviarMpls,
  grafoDoMundo,
  igmp,
  INFINITO_RIP,
  interfaceAtiva,
  ospfDe,
  recalcularProtocolos,
  ripDe,
  RIP_ATUALIZACAO_S,
  rodarRip,
  roteadoresComMembros,
  roteadoresDoIp,
  sessoesBgp,
  type ConfigBgp,
} from './protocolos';
import {
  anycast,
  arvoreDifusao,
  arvoreEscoamento,
  arvoreMulticast,
  caminhoAte,
  difusaoRpf,
  dijkstra,
  inundar,
  roteamentoHierarquico,
  textoDijkstra,
  type EntradaLfib,
  type ModoInundacao,
  type Relacao,
} from './rotear';
import { interfacesL3, rotasDe } from './roteamento';
import { pertence, textoCidr, enderecoRede } from './ip';
import { ipTexto, lerCidr, lerIp } from './util';

type Saida = string[];

function porta(e: Equipamento, nome: string | undefined): string | null {
  return nome && e.portas.some((p) => p.nome === nome) ? nome : null;
}

const listaPortas = (e: Equipamento) => e.portas.map((p) => p.nome).join(', ');
const infTxt = (n: number) => (n === Infinity ? '∞' : String(n));

/** Segundos em texto curto: "90 s" vira "1 min 30 s". */
function tempoRip(s: number): string {
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  return resto ? `${min} min ${resto} s` : `${min} min`;
}

/** Endereço de grupo multicast: 224.0.0.0 a 239.255.255.255. */
export function ehMulticast(ip: number): boolean {
  return ip >>> 28 === 14;
}

function rotasDoProtocolo(e: Equipamento, origem: 'ospf' | 'rip' | 'bgp'): Saida {
  const rs = rotasDe(e).filter((r) => r.origem === origem);
  if (!rs.length) return ['  (nenhuma rota instalada por este protocolo)'];
  return rs.map((r) => `  ${textoCidr(r.destino).padEnd(19)} via ${ipTexto(r.via ?? 0).padEnd(15)} ${String(r.porta ?? '?').padEnd(6)} métrica ${r.metrica ?? '?'}${r.nota ? `  (${r.nota})` : ''}`);
}

/* ---------- mostra ---------- */

function mostraOspf(m: Mundo, e: Equipamento): Saida {
  const cfg = ospfDe(e);
  if (!cfg?.ligado) return ['OSPF desligado neste roteador. "ospf on" para ligar.'];
  const l = ['OSPF ligado. Custo de cada interface (10^8 / bps, no mínimo 1, ou o que você configurou) e a área:'];
  for (const i of interfacesL3(e)) {
    const ativa = interfaceAtiva(m, e, i.porta);
    l.push(`  ${i.porta.padEnd(6)} ${textoCidr(i.cidr).padEnd(19)} área ${String(areaDa(e, i.porta)).padEnd(3)} custo ${String(custoOspf(m, e, i.porta)).padEnd(6)}${cfg.custos[i.porta] ? ' (configurado)' : ''}${ativa ? '' : '  enlace caído: não anuncia'}`);
  }
  const f = m.flags.ospf as { abr?: string[]; erros?: string[] } | undefined;
  if (f?.abr?.includes(e.nome)) l.push('Este roteador é de borda de área (ABR): está na área 0 e em outra, e resume uma para a outra.');
  l.push('VIZINHOS (hello respondido dos dois lados):');
  const viz = cfg.vizinhos ?? [];
  l.push(...(viz.length ? viz.map((v) => `  ${v.vizinho.padEnd(8)} pela ${v.porta.padEnd(6)} área ${v.area}, custo ${v.custo}`) : ['  nenhum']));
  for (const x of f?.erros ?? []) if (x.includes(e.nome)) l.push(`ATENÇÃO: ${x}`);
  l.push('ROTAS APRENDIDAS PELO OSPF:', ...rotasDoProtocolo(e, 'ospf'));
  return l;
}

function mostraLsdb(e: Equipamento): Saida {
  const cfg = ospfDe(e);
  if (!cfg?.ligado || !cfg.lsdb) return ['Sem banco de estado de enlace: o OSPF está desligado aqui.'];
  const l = ['BANCO DE ESTADO DE ENLACE (um LSP por roteador da área; todos da área têm o mesmo banco)'];
  for (const [area, lsps] of Object.entries(cfg.lsdb)) {
    l.push(`área ${area}:`);
    for (const p of lsps) l.push(`  ${p.origem.padEnd(8)} seq ${String(p.seq).padEnd(3)} idade ${String(3600 - p.idade).padEnd(4)} s  vizinhos: ${p.vizinhos.map((v) => `${v.no}(${v.custo})`).join(' ') || 'nenhum'}  redes: ${p.redes.map((r) => r.prefixo).join(' ') || 'nenhuma'}`);
  }
  return l;
}

function mostraRip(e: Equipamento): Saida {
  const cfg = ripDe(e);
  if (!cfg?.ligado) return ['RIP desligado neste roteador. "rip on" para ligar.'];
  const h = cfg.horizonte === 'dividido' ? 'horizonte dividido ligado' : cfg.horizonte === 'envenenado' ? 'envenenamento reverso ligado' : 'horizonte dividido DESLIGADO (roteadores de verdade vêm com ele ligado)';
  const l = [`RIP ligado, ${h}. Métrica em saltos; 16 é infinito.`, 'DESTINO             SALTOS  VIA'];
  const t = cfg.tabela ?? {};
  const ent = Object.entries(t).sort(([a], [b]) => a.localeCompare(b));
  if (!ent.length) l.push('  (tabela vazia: rode "rodar-protocolos" para trocar vetores com os vizinhos)');
  for (const [d, x] of ent) l.push(`  ${d.padEnd(19)} ${(x.custo >= INFINITO_RIP ? '16 (∞)' : String(x.custo)).padEnd(7)} ${x.custo === 0 ? 'minha' : x.via ?? '-'}`);
  l.push('ROTAS INSTALADAS PELO RIP:', ...rotasDoProtocolo(e, 'rip'));
  return l;
}

function mostraBgp(m: Mundo, e: Equipamento): Saida {
  const cfg = bgpDe(e);
  if (!cfg) return ['BGP desligado. "bgp as <número>" para começar.'];
  const l = [`BGP no AS ${cfg.asn}. Anuncia: ${cfg.anuncia.join(', ') || '(nada)'}`, 'VIZINHOS:'];
  const ss = sessoesBgp(m).filter((s) => s.de === e.nome);
  l.push(...(ss.length ? ss.map((s) => `  ${s.ip.padEnd(15)} AS ${String(s.asn).padEnd(6)} ${s.relacao.padEnd(9)} ${s.estabelecida ? 'sessão estabelecida' : `sessão parada: ${s.motivo}`}`) : ['  nenhum']));
  const melhores = (m.flags.bgp?.melhores?.[e.nome] ?? {}) as Record<string, { caminho: number[]; de: string | null; relacao: string }>;
  l.push('MELHORES ROTAS (preferência local pela relação, depois o caminho de AS mais curto):');
  const ent = Object.entries(melhores).sort(([a], [b]) => a.localeCompare(b));
  l.push(...(ent.length ? ent.map(([p, r]) => `  ${p.padEnd(19)} ${r.de === null ? 'minha' : `caminho de AS ${r.caminho.join(' ')} (de ${r.relacao})`}`) : ['  nenhuma']));
  const seq = ((m.flags.bgp?.sequestros ?? []) as { roteador: string; especifico: string; origem: number; coberto: string; legitimo: number }[]).filter((x) => x.roteador === e.nome);
  for (const s of seq) l.push(`ALERTA: ${s.especifico} vem do AS ${s.origem}, mas ${s.coberto} é originado pelo AS ${s.legitimo}. Mais específico vence sempre: possível sequestro de prefixo.`);
  return l;
}

function mostraMpls(e: Equipamento): Saida {
  const l = (e.s.mpls ?? []) as EntradaLfib[];
  if (!l.length) return ['Tabela de rótulos vazia. "mpls lsp <prefixo> <roteador> <roteador> ..." monta um caminho a partir daqui.'];
  return [
    'TABELA DE ENCAMINHAMENTO POR RÓTULO',
    'ENTRADA   FEC                 OPERAÇÃO     SAÍDA   PRÓXIMO',
    ...l.map((x) => `  ${(x.entrada === null ? 'IP' : String(x.entrada)).padEnd(7)} ${x.fec.padEnd(19)} ${x.operacao.padEnd(12)} ${String(x.saida ?? '-').padEnd(7)} ${x.proximo ?? '(sai do MPLS)'}`),
  ];
}

function mostraIgmp(m: Mundo, e: Equipamento): Saida {
  const g = igmp(m, e);
  const l = ['IGMP: o roteador pergunta em cada rede "quem quer ouvir algum grupo?" e anota quem respondeu.'];
  const ent = Object.entries(g);
  if (!ent.length) l.push('  ninguém respondeu: nenhum membro de grupo nas minhas redes');
  for (const [p, gs] of ent) for (const [grupo, hs] of Object.entries(gs)) l.push(`  ${p.padEnd(6)} grupo ${grupo.padEnd(15)} membros: ${hs.join(', ')}`);
  return l;
}

/* ---------- comandos ---------- */

function ligado(v: string | undefined): boolean | null {
  return v === 'on' || v === 'liga' || v === 'sim' ? true : v === 'off' || v === 'desliga' || v === 'nao' ? false : null;
}

function cmdOspf(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, a, b] = args;
  const on = ligado(sub);
  if (on !== null) {
    configOspf(e).ligado = on;
    const r = calcularOspf(m);
    if (!on) return ['OSPF desligado aqui. As rotas que vieram dele saíram da tabela, e os vizinhos vão perceber pelo hello que sumiu.'];
    return [`OSPF ligado. Hello pelas interfaces, ${ospfDe(e)!.vizinhos?.length ?? 0} vizinho(s) encontrado(s). ${r.rotas[e.nome]?.length ?? 0} rota(s) instalada(s).`, ...(r.erros.filter((x) => x.includes(e.nome)).map((x) => `ATENÇÃO: ${x}`))];
  }
  if (sub === 'custo' || sub === 'area') {
    const p = porta(e, a);
    const n = Number(b);
    if (!p || !Number.isInteger(n) || n < (sub === 'custo' ? 1 : 0) || n > 65535) return [sub === 'custo' ? `ospf custo <porta> <1 a 65535>. Portas: ${listaPortas(e)}.` : `ospf area <porta> <número>. Portas: ${listaPortas(e)}.`];
    const cfg = configOspf(e);
    if (sub === 'custo') cfg.custos[p] = n;
    else cfg.areas[p] = n;
    calcularOspf(m);
    return sub === 'custo' ? [`Custo OSPF da ${p}: ${n}. Quanto maior, menos o Dijkstra gosta de passar por ali.`] : [`${p} na área ${n}.${n === 0 ? ' A 0 é o backbone: toda área conversa com as outras através dela.' : ' Para falar com as outras áreas, esta área precisa de um roteador de borda ligado à área 0.'}`];
  }
  return ['ospf <on|off> | ospf custo <porta> <n> | ospf area <porta> <n>'];
}

function cmdRip(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, a] = args;
  const on = ligado(sub);
  if (on !== null) {
    const cfg = configRip(e);
    cfg.ligado = on;
    if (!on) {
      delete cfg.tabela;
      const outras = ((e.s.rotasDinamicas ?? []) as { origem: string }[]).filter((r) => r.origem !== 'rip');
      if (outras.length) e.s.rotasDinamicas = outras;
      else delete e.s.rotasDinamicas;
      return ['RIP desligado aqui. Os vizinhos só vão notar quando pararem de receber vetores.'];
    }
    return ['RIP ligado. Ele troca vetores com os vizinhos em rodadas: "rodar-protocolos" (até convergir) ou "rodar-protocolos <n>" para ver rodada a rodada.'];
  }
  if (sub === 'horizonte') {
    const v = a === 'envenenado' || a === 'envenenamento' ? 'envenenado' : ligado(a) === true ? 'dividido' : ligado(a) === false ? 'nenhum' : null;
    if (!v) return ['rip horizonte <on|off|envenenado>'];
    configRip(e).horizonte = v;
    return [
      v === 'dividido'
        ? 'Horizonte dividido ligado: não conto ao vizinho a rota que aprendi dele. Assim ele não acredita que eu sei um caminho que passa por ele mesmo.'
        : v === 'envenenado'
          ? 'Envenenamento reverso ligado: conto ao vizinho a rota que aprendi dele, mas com métrica 16 (infinito). É o horizonte dividido falando mais alto.'
          : 'Horizonte dividido desligado: conto tudo a todos. É assim que nasce a contagem ao infinito.',
    ];
  }
  return ['rip <on|off> | rip horizonte <on|off|envenenado>'];
}

function cmdRodar(m: Mundo, args: string[]): Saida {
  const n = args[0] === undefined ? undefined : Number(args[0]);
  if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 100)) return ['rodar-protocolos [rodadas de 1 a 100]. Sem número, roda até convergir.'];
  const l: string[] = [];
  const temRip = [...m.equipamentos.values()].some((e) => ripDe(e)?.ligado);
  if (temRip) {
    const r = rodarRip(m, n);
    // Uma rodada é uma atualização periódica do RIP (30 s na RFC 2453).
    const relogio = r.rodadas ? ` (uns ${tempoRip(r.rodadas * RIP_ATUALIZACAO_S)} no relógio do RIP, uma atualização a cada ${RIP_ATUALIZACAO_S} s)` : '';
    l.push(`RIP: ${r.rodadas} rodada(s)${relogio}${r.convergiu ? ', convergiu' : ', ainda mudando'}.`, ...r.linhas);
    // O aviso fala só destas rodadas: depois que a rede se acerta, ele não volta.
    if (r.contou) l.push('Repare: a métrica subiu de rodada em rodada até 16. Um acreditava no outro, que acreditava no primeiro: contagem ao infinito. O horizonte dividido evita isso no caso em linha.');
    else if (r.contando) l.push('Atenção: há métrica subindo de rodada em rodada. É uma contagem ao infinito em andamento; rode mais, ou ligue o horizonte dividido em quem conta de volta.');
  }
  recalcularProtocolos(m);
  if (m.flags.ospf) l.push(`OSPF: ${m.flags.ospf.roteadores.length} roteador(es), LSPs inundados com ${m.flags.ospf.copias} cópia(s) nos enlaces (${m.flags.ospf.descartadas} repetidas descartadas), Dijkstra em cada um.`);
  if (m.flags.bgp) l.push(`BGP: ${m.flags.bgp.sessoes} sessão(ões) de pé, convergiu em ${m.flags.bgp.rodadas} rodada(s) de anúncios.`);
  if (!l.length) l.push('Nenhum protocolo de roteamento ligado. Ligue com "ospf on", "rip on" ou "bgp as <número>".');
  return l;
}

function cmdDijkstra(m: Mundo, e: Equipamento, args: string[]): Saida {
  const g = grafoDoMundo(m);
  const r = dijkstra(g, e.nome);
  m.flags.dijkstra = { origem: e.nome, ordem: r.ordem, dist: r.dist };
  const l = ['Grafo: roteadores são nós, enlaces entre roteadores são arestas com o custo OSPF da interface de saída.', ...textoDijkstra(r), 'RESULTADO (destino, custo, caminho):'];
  for (const n of r.ordem.filter((x) => x !== e.nome)) l.push(`  ${n.padEnd(8)} ${String(r.dist[n]).padEnd(5)} ${caminhoAte(r, n)!.join(' > ')}`);
  if (args[0]) {
    const c = caminhoAte(r, args[0]);
    l.push(c ? `Até ${args[0]}: ${c.join(' > ')}, custo ${r.dist[args[0]]}. Na tabela só vai o primeiro salto: ${c[1] ?? '(sou eu)'}.` : `Sem caminho até ${args[0]}.`);
  }
  return l;
}

function cmdArvore(m: Mundo, args: string[]): Saida {
  const g = grafoDoMundo(m);
  const d = args[0];
  if (!d || !g.nos.includes(d)) return [`arvore <roteador de destino>. Roteadores: ${g.nos.join(', ')}.`];
  const t = arvoreEscoamento(g, d);
  m.flags.arvore = { destino: d, proximos: Object.fromEntries(Object.entries(t).map(([n, x]) => [n, x.proximo ?? null])) };
  return [
    `Árvore de escoamento até ${d}: cada roteador aponta para o próximo salto do caminho ótimo dele até ${d}.`,
    ...g.nos.filter((n) => n !== d).map((n) => `  ${n.padEnd(8)} → ${(t[n]!.proximo ?? '(sem caminho)').padEnd(8)} custo ${infTxt(t[n]!.custo)}`),
    'Princípio de otimização: se o melhor caminho de I até K passa por J, o pedaço de J até K também é o melhor de J. Por isso os caminhos não se cruzam: formam uma árvore, sem laço.',
  ];
}

function cmdInundar(m: Mundo, e: Equipamento, args: string[]): Saida {
  const modo = (args[0] === 'nenhum' ? 'sem-controle' : args[0]) as ModoInundacao | undefined;
  if (modo !== 'sem-controle' && modo !== 'saltos' && modo !== 'sequencia') return ['inundar <sem-controle|saltos|sequencia> [saltos]'];
  const g = grafoDoMundo(m);
  const k = args[1] !== undefined ? Math.max(1, Math.min(30, Number(args[1]) || 1)) : undefined;
  const r = inundar(g, e.nome, { modo, saltos: k, limiteRodadas: 10 });
  m.flags.inundacao = { ...(m.flags.inundacao ?? {}), [modo]: r.copias, ultima: { modo, copias: r.copias, alcancados: r.alcancados.length, semFim: r.semFim } };
  const l = [`Inundação a partir de ${e.nome} (${modo === 'sem-controle' ? 'sem controle' : modo === 'saltos' ? `contador de saltos começando em ${k ?? g.nos.length - 1}` : 'número de sequência por origem'}): cada roteador repassa por todos os enlaces, menos o de onde veio.`];
  r.porRodada.forEach((n, i) => l.push(`  salto ${i + 1}: ${n} cópia(s) nos enlaces`));
  l.push(`Total: ${r.copias} cópia(s), ${r.alcancados.length} de ${g.nos.length} roteador(es) alcançado(s), ${r.descartadas} descartada(s).`);
  if (r.semFim) l.push('Parei em 10 saltos: sem controle, num grafo com laço, as cópias se multiplicam para sempre.');
  return l;
}

function cmdDifusao(m: Mundo, e: Equipamento): Saida {
  const g = grafoDoMundo(m);
  const seq = inundar(g, e.nome, { modo: 'sequencia' });
  const rpf = difusaoRpf(g, e.nome);
  const arv = arvoreDifusao(g, e.nome);
  m.flags.difusao = { origem: e.nome, inundacao: seq.copias, rpf: rpf.copias, rpfDescartadas: rpf.descartadas, arvore: arv.copias };
  return [
    `Difusão (broadcast) de ${e.nome} para os ${g.nos.length - 1} outros roteadores:`,
    `  inundação com sequência     ${seq.copias} cópia(s)`,
    `  caminho reverso (RPF)       ${rpf.copias} cópia(s), ${rpf.descartadas} descartada(s) por chegar pelo enlace que não leva de volta a ${e.nome}`,
    `  árvore de difusão           ${arv.copias} cópia(s): uma por roteador, o mínimo possível`,
    `Enlaces da árvore: ${arv.arestas.join(', ') || 'nenhum'}`,
  ];
}

function cmdMulticast(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ip = lerIp(args[0] ?? '');
  if (ip === null || !ehMulticast(ip)) return ['multicast <grupo>, um endereço de 224.0.0.0 a 239.255.255.255, por exemplo: multicast 239.1.1.1'];
  const grupo = ipTexto(ip);
  const g = grafoDoMundo(m);
  const membros = roteadoresComMembros(m, grupo);
  const r = arvoreMulticast(g, e.nome, membros);
  m.flags.multicast = { ...(m.flags.multicast ?? {}), [grupo]: { origem: e.nome, membros, arestas: r.arestas, podadas: r.podadas, copias: r.copias } };
  return [
    `Multicast de ${e.nome} para o grupo ${grupo}. Roteadores com alguém ouvindo (pelo IGMP): ${membros.join(', ') || 'nenhum'}.`,
    `Árvore depois da poda: ${r.arestas.join(', ') || '(nada: ninguém quer ouvir)'}`,
    `Galhos podados (ninguém do grupo para lá): ${r.podadas.join(', ') || 'nenhum'}`,
    `${r.copias} cópia(s) por pacote, contra ${arvoreDifusao(g, e.nome).copias} da difusão para todos.`,
  ];
}

function cmdAnycast(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ip = lerIp(args[0] ?? '');
  if (ip === null) return ['anycast <ip>: mostra qual dos lugares que têm esse endereço fica mais perto daqui'];
  const lugares = roteadoresDoIp(m, ip);
  if (!lugares.length) return [`Ninguém ligado a um roteador tem ${ipTexto(ip)}.`];
  const r = anycast(grafoDoMundo(m), e.nome, lugares);
  m.flags.anycast = { ...(m.flags.anycast ?? {}), [`${e.nome}>${ipTexto(ip)}`]: r.escolhido };
  return [
    `${ipTexto(ip)} existe atrás de ${lugares.join(', ')}. Mesmo endereço em vários lugares: anycast.`,
    ...lugares.map((x) => `  atrás de ${x.padEnd(8)} custo ${infTxt(r.custos[x]!)} daqui`),
    r.escolhido ? `Vence o mais perto: ${r.escolhido}. Quem está do outro lado da rede cai em outro, sem ninguém configurar nada além do roteamento.` : 'Nenhum alcançável daqui.',
  ];
}

function cmdHierarquia(m: Mundo, e: Equipamento): Saida {
  const g = grafoDoMundo(m);
  const regioes = Object.fromEntries(g.nos.map((n) => [n, String(m.equipamentos.get(n)!.s.regiao ?? n)]));
  const r = roteamentoHierarquico(g, regioes);
  const t = r.tabelas[e.nome];
  const pares = Object.entries(r.pares).filter(([k]) => k.startsWith(`${e.nome}>`));
  m.flags.hierarquia = { tabelas: r.tabelas, extraTotal: r.extraTotal, piorExtra: r.piorExtra };
  const l = [
    `Regiões: ${[...new Set(Object.values(regioes))].map((x) => `${x} (${g.nos.filter((n) => regioes[n] === x).join(', ')})`).join('; ')}`,
    `Tabela de ${e.nome}: ${t?.plano ?? 0} entrada(s) no roteamento plano, ${t?.hierarquico ?? 0} no hierárquico (os da minha região mais uma por região).`,
    'DESTINO   ÓTIMO  HIERÁRQUICO  CAMINHO',
    ...pares.map(([k, p]) => `  ${k.split('>')[1]!.padEnd(8)} ${infTxt(p.otimo).padEnd(6)} ${infTxt(p.hierarquico).padEnd(12)} ${p.caminho.join(' > ')}${p.hierarquico > p.otimo ? '  (anda a mais)' : ''}`),
  ];
  if (r.piorExtra && r.piorExtra.extra > 0) l.push(`Pior caso na rede toda: ${r.piorExtra.par}, ${r.piorExtra.extra} de custo a mais. É o preço de esquecer os detalhes das outras regiões.`);
  else l.push('Ninguém anda a mais com essa divisão. Ponha os roteadores em regiões com "regiao <nome>".');
  return l;
}

function cmdDerrubar(m: Mundo, e: Equipamento, cmd: string, args: string[]): Saida {
  const p = porta(e, args[0]);
  if (!p) return [`${cmd} <porta>. Portas: ${listaPortas(e)}.`];
  const po = acharPorta(m, { equip: e.nome, porta: p });
  const derrubar = cmd === 'derrubar';
  if (derrubar) po.desligada = true;
  else delete po.desligada;
  const d = new Set<string>((m.flags.derrubadas as string[] | undefined) ?? []);
  if (derrubar) d.add(`${e.nome}:${p}`);
  else d.delete(`${e.nome}:${p}`);
  m.flags.derrubadas = [...d];
  recalcularProtocolos(m);
  const l = [derrubar ? `${p} derrubada: o enlace caiu, como cabo cortado.` : `${p} de volta: o enlace subiu.`];
  if (ospfDe(e)?.ligado) l.push(`OSPF percebeu na hora (o hello parou de chegar), inundou um LSP novo e recalculou: ${ospfDe(e)!.vizinhos?.length ?? 0} vizinho(s) agora.`);
  if (bgpDe(e)) l.push('BGP: a sessão por essa porta caiu, e as rotas aprendidas por ela foram retiradas.');
  if (ripDe(e)?.ligado) l.push('RIP: a rota que passava por ali continua na tabela até as próximas rodadas. Rode "rodar-protocolos" e veja o que acontece.');
  return l;
}

function cmdMpls(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, ...resto] = args;
  if (sub === 'lsp') {
    const fec = lerCidr(resto[0] ?? '');
    const rota = [e.nome, ...resto.slice(1)];
    if (!fec || rota.length < 2) return ['mpls lsp <prefixo> <roteador> <roteador> ..., por exemplo: mpls lsp 203.0.113.0/24 r2 r3'];
    const f = textoCidr({ endereco: enderecoRede(fec), prefixo: fec.prefixo });
    const erro = criarLspMundo(m, rota, f);
    if (erro) return [erro];
    m.flags.mplsLsp = { ...(m.flags.mplsLsp ?? {}), [f]: rota };
    return [`Caminho de rótulos para ${f}: ${rota.join(' > ')}. ${e.nome} empilha, os do meio trocam, ${rota.at(-1)} desempilha.`, ...rota.flatMap((r) => mostraMpls(m.equipamentos.get(r)!).slice(2).map((x) => `${r}:${x}`))];
  }
  if (sub === 'enviar') {
    if (!resto[0]) return ['mpls enviar <ip ou prefixo>'];
    const r = enviarMpls(m, e.nome, resto[0]);
    m.flags.mpls = { entrada: e.nome, alvo: resto[0], ok: r.ok, operacoes: r.operacoes, saida: r.saida };
    return r.linhas;
  }
  if (sub === 'limpa') {
    for (const x of m.equipamentos.values()) delete x.s.mpls;
    delete m.flags.mplsLsp;
    return ['Todas as tabelas de rótulos apagadas.'];
  }
  return ['mpls lsp <prefixo> <roteador> ... | mpls enviar <ip> | mpls limpa | mostra mpls'];
}

function cmdBgp(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, a, b, c] = args;
  const cfg = bgpDe(e);
  if (sub === 'as') {
    const n = Number(a);
    if (!asnValido(n)) return ['bgp as <número>. Use AS de documentação (64496 a 64511, 65536 a 65551) ou privado (64512 a 65534).'];
    e.s.bgp = { asn: n, vizinhos: cfg?.vizinhos ?? [], anuncia: cfg?.anuncia ?? [] } satisfies ConfigBgp;
    calcularBgp(m);
    return [`BGP ligado: este roteador é o AS ${n}. Agora diga quem são os vizinhos e o que anunciar.`];
  }
  if (sub === 'off' || sub === 'desliga') {
    delete e.s.bgp;
    calcularBgp(m);
    const outras = ((e.s.rotasDinamicas ?? []) as { origem: string }[]).filter((r) => r.origem !== 'bgp');
    if (outras.length) e.s.rotasDinamicas = outras;
    else delete e.s.rotasDinamicas;
    return ['BGP desligado. Os vizinhos perdem as rotas que vinham daqui.'];
  }
  if (!cfg) return ['Primeiro "bgp as <número>".'];
  if (sub === 'vizinho') {
    const ip = lerIp(a ?? '');
    const asn = Number(b);
    const rel = c as Relacao;
    if (ip === null || !asnValido(asn) || !['cliente', 'par', 'provedor'].includes(rel)) return ['bgp vizinho <ip> <AS> <cliente|par|provedor>: o que o vizinho é para mim (cliente me paga, par troca de graça, provedor eu pago)'];
    cfg.vizinhos = cfg.vizinhos.filter((v) => v.ip !== ipTexto(ip));
    cfg.vizinhos.push({ ip: ipTexto(ip), asn, relacao: rel });
    calcularBgp(m);
    const s = sessoesBgp(m).find((x) => x.de === e.nome && x.ip === ipTexto(ip));
    return [`Vizinho ${ipTexto(ip)} no AS ${asn}, que para mim é ${rel}.`, s?.estabelecida ? 'Sessão estabelecida.' : `Sessão ainda parada: ${s?.motivo ?? '?'}.`];
  }
  if (sub === 'sem-vizinho') {
    cfg.vizinhos = cfg.vizinhos.filter((v) => v.ip !== a);
    calcularBgp(m);
    return [`Vizinho ${a} removido.`];
  }
  if (sub === 'anunciar' || sub === 'retirar') {
    const p = lerCidr(a ?? '');
    if (!p) return [`bgp ${sub} <prefixo>`];
    const t = textoCidr({ endereco: enderecoRede(p), prefixo: p.prefixo });
    cfg.anuncia = cfg.anuncia.filter((x) => x !== t);
    if (sub === 'anunciar') cfg.anuncia.push(t);
    calcularBgp(m);
    const meu = interfacesL3(e).some((i) => pertence(p.endereco, i.cidr) || pertence(i.cidr.endereco, p));
    return sub === 'anunciar'
      ? [`Anunciando ${t} com o caminho de AS ${cfg.asn}.${meu ? '' : ' Atenção: essa rede não é minha. Se outro AS é o dono, isto é um sequestro de prefixo, e o tráfego dele vem parar aqui.'}`]
      : [`${t} retirado. Os vizinhos recebem a retirada e procuram outro caminho.`];
  }
  return ['bgp as <n> | bgp vizinho <ip> <AS> <cliente|par|provedor> | bgp sem-vizinho <ip> | bgp anunciar <prefixo> | bgp retirar <prefixo> | bgp off'];
}

/** Comandos de protocolo no console do roteador. Devolve null se o comando não for daqui. */
export function comandosRoteamento(m: Mundo, e: Equipamento, cmd: string, args: string[]): Saida | null {
  switch (cmd) {
    case 'mostra':
      switch (args[0]) {
        case 'ospf':
          return mostraOspf(m, e);
        case 'lsdb':
          return mostraLsdb(e);
        case 'rip':
          return mostraRip(e);
        case 'bgp':
          return mostraBgp(m, e);
        case 'mpls':
          return mostraMpls(e);
        case 'igmp':
          return mostraIgmp(m, e);
      }
      return null;
    case 'ospf':
      return cmdOspf(m, e, args);
    case 'rip':
      return cmdRip(m, e, args);
    case 'rodar-protocolos':
      return cmdRodar(m, args);
    case 'dijkstra':
      return cmdDijkstra(m, e, args);
    case 'arvore':
      return cmdArvore(m, args);
    case 'inundar':
      return cmdInundar(m, e, args);
    case 'difusao':
      return cmdDifusao(m, e);
    case 'multicast':
      return cmdMulticast(m, e, args);
    case 'anycast':
      return cmdAnycast(m, e, args);
    case 'regiao': {
      if (!args[0]) return [`regiao <nome>. Agora: ${e.s.regiao ?? '(nenhuma, sou uma região sozinho)'}`];
      e.s.regiao = args[0];
      return [`${e.nome} na região ${args[0]}. Veja o efeito com "hierarquia".`];
    }
    case 'hierarquia':
      return cmdHierarquia(m, e);
    case 'derrubar':
    case 'levantar':
      return cmdDerrubar(m, e, cmd, args);
    case 'mpls':
      return cmdMpls(m, e, args);
    case 'bgp':
      return cmdBgp(m, e, args);
  }
  return null;
}

/** No PC: entrar e sair de grupo multicast (é o que o IGMP leva ao roteador). */
export function comandoGrupo(e: Equipamento, args: string[]): Saida {
  const [sub, g] = args;
  const ip = lerIp(g ?? '');
  if ((sub !== 'entrar' && sub !== 'sair') || ip === null || !ehMulticast(ip)) return [`grupo <entrar|sair> <endereço de 224.0.0.0 a 239.255.255.255>. Agora: ${((e.s.grupos as string[] | undefined) ?? []).join(', ') || 'nenhum'}`];
  const grupos = new Set<string>((e.s.grupos as string[] | undefined) ?? []);
  if (sub === 'entrar') grupos.add(ipTexto(ip));
  else grupos.delete(ipTexto(ip));
  if (grupos.size) e.s.grupos = [...grupos];
  else delete e.s.grupos;
  return [sub === 'entrar' ? `IGMP: relatório de participação para ${ipTexto(ip)}. O roteador da minha rede agora sabe que alguém aqui quer ouvir esse grupo.` : `IGMP: saída do grupo ${ipTexto(ip)}. Se ninguém mais da rede ouvir, o roteador poda o galho.`];
}
