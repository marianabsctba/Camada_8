// Segurança de rede (ato 7) no console e no menu: ataques simulados e didáticos (varredura, farejamento, ARP falso,
// IP falsificado, inundação de SYN, negação de serviço distribuída, sequestro de DNS e de BGP), as defesas
// (firewall com estado, IDS e IPS, filtro antifalsificação, inspeção de ARP, SYN cookies, DNSSEC, TLS, VPN, WPA3,
// PGP, sandbox) e uma calculadora de criptografia sobre cripto.ts. Os ataques só existem dentro do mundo do jogo:
// nada aqui manda pacote de verdade para lugar nenhum. Cada resultado vai para m.flags com a configuração usada.

import type { Acao, Campo, Opcao } from './acoes';
import type { Equipamento, Mundo } from './mundo';
import { donoDoIp, ehRoteador, estadoTunel, interfacesL3, novoPacote, refrescarVpns, viajar } from './roteamento';
import { caminho } from './rede';
import { ipTexto, lerIp, lerNumero } from './util';
import { caminhoTransporte, demultiplexar, portaEfemera, PORTAS_CONHECIDAS, soquetesDe, type InundacaoSyn, type Protocolo } from './transporte';
import {
  anotarFiltro,
  anotarFlag,
  firewallDe,
  idsDe,
  inspecionarTaxa,
  lerFaixa,
  lerRegra,
  novoFirewall,
  novoIds,
  prefixoOuIp,
  refrescarFiltros,
  resumoFirewall,
  resumoIds,
  SOBRA_ESP,
  textoRegra,
  type ConfigFirewall,
  type ConfigIds,
  type TunelVpn,
} from './filtro';
import {
  associarWifi,
  cadeiaDoServidor,
  chavesPgp,
  conferirCadeia,
  DICIONARIO_PEQUENO,
  diaDoMundo,
  espDe,
  idChave,
  linhasIke,
  quebrarAperto,
  relogio,
  segredosEm,
  TIPOS_CERTIFICADO,
  visaoDoFarejador,
  wifiDe,
  type ApertoWifi,
  type ConfigWifi,
  type TipoCertificado,
} from './seguranca';
import {
  assinarMensagem,
  cesar,
  diffieHellman,
  ehPrimo,
  gerarChavesRsa,
  cifrarRsa,
  decifrarRsa,
  hmacExplicado,
  homemNoMeio,
  quebrarCesar,
  sha256Explicado,
  simularKerberos,
  verificarAssinatura,
} from './cripto';
import { cacheDoResolvedor, espacoDoMundo, garantirEscutas, servicosDe } from './cliAplicacao';
import { dentroDe, normalizarNome, type RegistroDns } from './aplicacao';

type Saida = string[];

const num = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');
const pct = (x: number) => `${num(x * 100, 1)} %`;

function ligado(v: string | undefined): boolean | null {
  return v === 'on' || v === 'liga' || v === 'sim' ? true : v === 'off' || v === 'desliga' || v === 'nao' ? false : null;
}

/** O mundo usa a segurança de rede? Menus e ajuda só mostram as coisas novas quando sim. */
export function temSeguranca(m: Mundo): boolean {
  if (m.flags.seguranca) return true;
  for (const e of m.equipamentos.values()) if (e.s.firewall || e.s.ids || e.s.vpn || e.s.wifi || e.s.antiFalsificacao || e.s.espelho || e.s.inspecaoArp) return true;
  return false;
}

function lerDestino(m: Mundo, txt: string | undefined): number | null {
  if (!txt) return null;
  const ip = lerIp(txt);
  if (ip !== null) return ip;
  const e = m.equipamentos.get(txt);
  const i = e ? interfacesL3(e)[0] : undefined;
  return i ? i.cidr.endereco : null;
}

/* ---------- Varredura de portas ---------- */

export const PORTAS_COMUNS = [21, 22, 23, 25, 53, 80, 110, 123, 143, 443, 587, 993, 3306, 3389, 5060, 8080];

function lerPortas(txt: string | undefined): number[] | null {
  if (!txt) return PORTAS_COMUNS;
  const out: number[] = [];
  for (const parte of txt.split(',')) {
    const f = lerFaixa(parte);
    if (!f || f[0] < 1) return null;
    for (let p = f[0]; p <= f[1]; p++) out.push(p);
  }
  return out.length && out.length <= 1024 ? [...new Set(out)] : null;
}

function cmdVarrer(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(m, args[0]);
  const proto: Protocolo = args.includes('udp') ? 'udp' : 'tcp';
  const portas = lerPortas(args.slice(1).find((x) => x !== 'udp' && x !== 'tcp'));
  if (ipN === null || !portas) return ['varrer <ip> [portas: 80 | 1-1024 | 22,80,443] [udp]. Só dentro do laboratório: varrer rede dos outros sem autorização é crime.'];
  garantirEscutas(m);
  const ip = ipTexto(ipN);
  const abertas: { porta: number; servico: string }[] = [];
  let fechadas = 0;
  const filtradas: number[] = [];
  const alertas: string[] = [];
  let bloqueio: string | undefined;
  for (const porta of portas) {
    const c = caminhoTransporte(m, e.nome, ipN, proto, portaEfemera(e, proto), porta);
    for (const a of c.alertas ?? []) if (!alertas.includes(a)) alertas.push(a);
    if (!c.ok) {
      filtradas.push(porta);
      if (c.bloqueadoPor && !bloqueio) bloqueio = c.falha;
      continue;
    }
    const d = demultiplexar(c.servidor!, proto, ip, porta, c.ipVisto, c.portaVista);
    if (d.como === 'nenhum') fechadas++;
    else abertas.push({ porta, servico: d.soquete?.servico ?? PORTAS_CONHECIDAS[porta] ?? '?' });
  }
  const l: Saida = [
    `Varredura ${proto.toUpperCase()} de ${ip}, ${portas.length} porta(s), ${proto === 'tcp' ? 'com SYN (meio aberta: quem responde SYN+ACK leva RST e a conexão nunca se completa)' : 'com datagramas vazios (resposta ICMP "porta inalcançável" quer dizer fechada)'}:`,
    'PORTA    ESTADO      SERVIÇO',
    ...abertas.map((x) => `${`${x.porta}/${proto}`.padEnd(9)}aberta      ${x.servico}`),
  ];
  if (filtradas.length) l.push(`${filtradas.length} porta(s) filtrada(s): nem SYN+ACK, nem RST, nada voltou (firewall descartando, ou o host não existe).`);
  l.push(`${fechadas} porta(s) fechada(s): o host respondeu ${proto === 'tcp' ? 'RST' : 'ICMP porta inalcançável'}.`);
  if (bloqueio) l.push(`Quem barrou: ${bloqueio}`);
  if (alertas.length) l.push('No caminho, o IDS viu:', ...alertas.map((x) => '  ' + x));
  l.push('Defesa: deixar aberto só o necessário (firewall com política padrão negar), e um IDS que perceba muitas portas distintas da mesma origem.');
  anotarFlag(m, 'ataque', { tipo: 'varredura', de: e.nome, alvo: ip, proto, portas: portas.length, abertas: abertas.map((x) => x.porta), fechadas, filtradas: filtradas.length, alertas: alertas.length });
  m.flags.varredura = m.flags.ataque;
  return l;
}

/* ---------- Farejamento ---------- */

function cmdFarejar(m: Mundo, e: Equipamento): Saida {
  const v = visaoDoFarejador(m, e);
  const l: Saida = ['Placa em modo promíscuo: aceita todo quadro que chegar, mesmo os que não são para ela.', v.como];
  let claros = 0;
  let cifrados = 0;
  const segredos: string[] = [];
  for (const { t, esp } of v.vistas.slice(-12)) {
    l.push(`#${t.n} ${t.ipDe} → ${t.ipPara}:${t.porta}/${t.proto} (${esp ? 'ESP' : t.resumo})`);
    if (esp) {
      cifrados++;
      l.push(`  protocolo 50 (ESP) entre as pontas do túnel: não se vê quem fala com quem dentro, nem porta, nem conteúdo. Carga: ${hexDe(t.claro)}...`);
      continue;
    }
    if (t.cifrado) {
      cifrados++;
      l.push(`  ${t.fio.slice(0, 140)}`);
      continue;
    }
    claros++;
    l.push(...t.claro.split(/\r?\n/).filter(Boolean).slice(0, 6).map((x) => '  ' + x.slice(0, 120)));
    for (const s of segredosEm(t.claro)) if (!segredos.includes(s)) segredos.push(s);
  }
  if (!v.vistas.length) l.push('Nada capturado ainda: ou ninguém usou a rede, ou o tráfego não passa por aqui.');
  if (segredos.length) l.push(`EM CLARO, DÁ PARA LER: ${segredos.join(' | ')}. Por isso senha só por HTTPS, correio por TLS, e rede sensível sem hub.`);
  anotarFlag(m, 'ataque', { tipo: 'farejamento', de: e.nome, como: v.como, quadros: v.vistas.length, emClaro: claros, cifrados, segredos });
  m.flags.farejar = m.flags.ataque;
  return l;
}

function hexDe(txt: string): string {
  let h = '';
  for (let i = 0; i < Math.min(txt.length, 30); i++) h += ((txt.charCodeAt(i) * 73 + i * 151) & 255).toString(16).padStart(2, '0');
  return h;
}

/* ---------- ARP falso (homem no meio) ---------- */

interface AtaqueArp {
  vitima: string;
  ip: number;
}

function caminhoL2(m: Mundo, de: Equipamento, para: Equipamento): string[] | null {
  const s = caminho(m, de.nome, para.nome);
  return s ? s.map((x) => x.para) : null;
}

function envenenar(m: Mundo, atk: Equipamento, vitima: Equipamento, ipFingido: number, l: Saida): boolean {
  const nos = caminhoL2(m, atk, vitima);
  if (!nos) {
    l.push(`${vitima.nome} não está no mesmo enlace que ${atk.nome}: ARP não atravessa roteador, só funciona na rede local.`);
    return false;
  }
  const dai = nos.map((n) => m.equipamentos.get(n)!).find((x) => x.tipo === 'switch' && x.s.inspecaoArp);
  if (dai) {
    l.push(`${dai.nome} faz inspeção de ARP: confere cada resposta ARP com a tabela de quem recebeu qual IP (do DHCP). "${ipTexto(ipFingido)} está em ${atk.mac}" não bate: quadro descartado e porta registrada.`);
    anotarFlag(m, 'defesaArp', { tipo: 'inspecao', switch: dai.nome, bloqueou: true });
    return false;
  }
  const est = vitima.s.arpEstatico as Record<number, string> | undefined;
  if (est?.[ipFingido]) {
    l.push(`${vitima.nome} tem entrada ARP estática para ${ipTexto(ipFingido)} (${est[ipFingido]}): ignora a resposta falsa.`);
    anotarFlag(m, 'defesaArp', { tipo: 'estatico', vitima: vitima.nome, bloqueou: true });
    return false;
  }
  ((vitima.s.arpFalso ??= {}) as Record<number, string>)[ipFingido] = atk.nome;
  ((vitima.s.arp ??= {}) as Record<number, string>)[ipFingido] = atk.mac;
  ((atk.s.ataquesArp ??= []) as AtaqueArp[]).push({ vitima: vitima.nome, ip: ipFingido });
  l.push(`ARP gratuito para ${vitima.nome}: "${ipTexto(ipFingido)} está em ${atk.mac}". O ARP não tem autenticação: ${vitima.nome} acredita e troca o cache.`);
  return true;
}

function cmdArpFalso(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipV = lerDestino(m, args[0]);
  const ipF = lerDestino(m, args[1]);
  if (ipV === null || ipF === null) return ['arp-falso <ip da vítima> <ip de quem vou fingir ser, em geral o gateway> [derrubar]'];
  const vit = donoDoIp(m, ipV)?.e;
  const fing = donoDoIp(m, ipF)?.e;
  if (!vit || !fing) return ['Os dois endereços precisam existir no laboratório.'];
  const derrubar = args.includes('derrubar');
  const l: Saida = [`Envenenamento de ARP: ${e.nome} vai se passar por ${ipTexto(ipF)} (${fing.nome}) para ${vit.nome}, e por ${ipTexto(ipV)} para ${fing.nome}.`];
  const ida = envenenar(m, e, vit, ipF, l);
  const volta = ida ? envenenar(m, e, fing, ipV, l) : false;
  e.s.repassar = !derrubar;
  if (ida) l.push(derrubar ? `${e.nome} recebe e joga fora: ${vit.nome} fica sem rede (negação de serviço).` : `${e.nome} recebe, copia e repassa: ${vit.nome} nem percebe, e tudo que vai${volta ? ' e volta' : ''} em claro passa por aqui. Use "farejar".`, 'Defesa: entrada ARP estática nos pontos críticos ("arp-estatico <ip>"), inspeção de ARP no switch ("inspecao-arp on") e, acima de tudo, cifrar (TLS, VPN): o homem no meio vê, mas não lê.');
  anotarFlag(m, 'ataque', { tipo: 'arp', de: e.nome, vitima: vit.nome, fingido: ipTexto(ipF), ok: ida, ambosSentidos: volta, repassa: !derrubar });
  return l;
}

function cmdArpEstatico(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(m, args[0]);
  if (ipN === null) return ['arp-estatico <ip>: fixa o MAC verdadeiro desse IP no cache, e resposta ARP nenhuma muda mais.'];
  const dono = donoDoIp(m, ipN);
  if (!dono) return ['Ninguém tem esse IP.'];
  ((e.s.arpEstatico ??= {}) as Record<number, string>)[ipN] = dono.e.mac;
  ((e.s.arp ??= {}) as Record<number, string>)[ipN] = dono.e.mac;
  const falso = e.s.arpFalso as Record<number, string> | undefined;
  if (falso) delete falso[ipN];
  anotarFlag(m, 'defesaArp', { tipo: 'estatico', equip: e.nome, ip: ipTexto(ipN), mac: dono.e.mac });
  return [`Entrada estática: ${ipTexto(ipN)} é ${dono.e.mac} (${dono.e.nome}). Dá trabalho manter, por isso fica para o gateway e os servidores importantes.`];
}

/* ---------- IP falsificado ---------- */

function cmdIpFalso(m: Mundo, e: Equipamento, args: string[]): Saida {
  const forjado = lerIp(args[0] ?? '');
  const destino = lerDestino(m, args[1]);
  const porta = Number(args[2] ?? 80);
  if (forjado === null || destino === null || !Number.isInteger(porta)) return ['ip-falso <ip forjado> <destino> [porta]'];
  const sport = portaEfemera(e, 'tcp');
  const p = novoPacote(m, { origem: forjado, destino, ttl: e.ttl, dados: 0, icmp: { tipo: 0, codigo: 0, id: sport, seq: 0 } });
  p.protocolo = 6;
  p.tamanho = 40;
  p.fragmentos = [{ identificacao: p.identificacao, deslocamento: 0, dados: 20, mf: false }];
  p.l4 = { origem: sport, destino: porta, flags: 'SYN' };
  const v = viajar(m, e.nome, p);
  const l: Saida = [`${e.nome} monta à mão um SYN com origem ${ipTexto(forjado)} (que não é dela) para ${ipTexto(destino)}:${porta}. Nada no IP confere a origem.`];
  if (!v.entregue) {
    l.push(`O pacote não chegou: ${v.falha ?? 'parou no caminho'}`);
    if (v.bloqueadoPor) l.push(`Foi o filtro de ${v.bloqueadoPor}. É o filtro de entrada (BCP 38): o provedor só deixa sair o que tem origem na rede do cliente.`);
  } else {
    const dono = donoDoIp(m, forjado);
    l.push(`Chegou em ${v.onde}. A resposta (SYN+ACK) vai para ${ipTexto(forjado)}: ${dono ? `${dono.e.nome}, que não pediu nada e responde RST` : 'ninguém tem esse endereço, a resposta se perde'}.`, `${e.nome} nunca vê a resposta: falsificar a origem serve para esconder quem ataca (inundação, reflexão), não para conversar.`);
  }
  anotarFlag(m, 'ataque', { tipo: 'ip-falso', de: e.nome, origemForjada: ipTexto(forjado), alvo: ipTexto(destino), porta, entregue: v.entregue, bloqueadoPor: v.bloqueadoPor ?? null });
  return l;
}

/* ---------- Inundação de SYN e negação de serviço distribuída ---------- */

/** Quanto tempo um SYN_RCVD fica na fila esperando o ACK (SYN+ACK reenviado 1, 2, 4, 8, 16, 32 s). */
export const ESPERA_SYN_RCVD = 63;

function inundarServidor(m: Mundo, atk: Equipamento, ipN: number, porta: number, taxa: number, falsificado: boolean, rotulo: string): { l: Saida; flags: Record<string, unknown> } {
  garantirEscutas(m);
  const ip = ipTexto(ipN);
  const c = caminhoTransporte(m, atk.nome, ipN, 'tcp', portaEfemera(atk, 'tcp'), porta);
  const l: Saida = [];
  const base = { de: atk.nome, alvo: ip, porta, taxa, falsificado };
  if (!c.ok) {
    l.push(`Os SYN não chegam a ${ip}: ${c.falha}`);
    return { l, flags: { ...base, chegou: false, bloqueadoPor: c.bloqueadoPor ?? null } };
  }
  const srv = c.servidor!;
  // O IDS de cada roteador no caminho mede a taxa de SYN.
  let barrado: string | undefined;
  for (const nome of c.roteadores) {
    const r = m.equipamentos.get(nome)!;
    const ids = idsDe(r);
    if (!ids) continue;
    const origem = falsificado ? lerIp('198.51.100.' + (1 + Math.floor(m.rng() * 250)))! : lerIp(c.ipLocal)!;
    const d = inspecionarTaxa(ids, { origem, destino: ipN, protocolo: 6, portaDestino: porta, flags: 'SYN' }, taxa, true);
    refrescarFiltros(m, r);
    if (d.texto) l.push(`${nome}: ${d.texto}`);
    if (d.bloquear) {
      if (falsificado) l.push(`  Mas cada SYN vem de uma origem diferente (falsificada): bloquear uma origem não segura as outras. O remédio aqui é SYN cookie no servidor e limpeza de tráfego no provedor.`);
      else barrado = nome;
    }
  }
  if (barrado) {
    l.push(`O IPS de ${barrado} bloqueou ${c.ipLocal}: a inundação para no caminho e a fila de ${srv.nome} fica livre.`);
    return { l, flags: { ...base, chegou: false, bloqueadoPor: barrado } };
  }
  const d = demultiplexar(srv, 'tcp', ip, porta, c.ipVisto, c.portaVista);
  if (d.como === 'nenhum') {
    l.push(`Ninguém escuta em ${ip}:${porta}: cada SYN leva RST e nada fica guardado. Inundar porta fechada só gasta banda.`);
    return { l, flags: { ...base, chegou: true, escuta: false } };
  }
  const backlog = (srv.s.backlogSyn as number | undefined) ?? 128;
  const cookies = !!srv.s.synCookies;
  const meias = cookies ? 0 : Math.min(backlog, Math.round(taxa * ESPERA_SYN_RCVD));
  const cheia = !cookies && meias >= backlog;
  srv.s.inundacaoSyn = { ativa: true, taxa, meiasAbertas: meias, backlog, origem: falsificado ? 'várias (falsificadas)' : c.ipLocal, falsificada: falsificado } satisfies InundacaoSyn;
  ((atk.s.ataquesSyn ??= []) as string[]).push(srv.nome);
  const lista = soquetesDe(srv).filter((x) => x.servico !== 'meia aberta (inundação)');
  for (let k = 0; k < Math.min(meias, 4); k++) lista.push({ proto: 'tcp', ipLocal: ip, portaLocal: porta, ipRemoto: falsificado ? `198.51.100.${10 + k * 37}` : c.ipVisto, portaRemota: 40000 + k, estado: 'SYN_RCVD', servico: 'meia aberta (inundação)', fd: 900 + k });
  srv.s.soquetes = lista;
  l.push(
    `${rotulo}: ${Math.round(taxa)} SYN por segundo para ${ip}:${porta} (${srv.nome}), ${falsificado ? 'com origens falsificadas' : `de ${c.ipLocal}`}. Ninguém manda o ACK final.`,
    `Cada SYN vira uma conexão meio aberta (SYN_RCVD) que fica ${ESPERA_SYN_RCVD} s na fila, com o servidor reenviando SYN+ACK.`,
    cookies
      ? `${srv.nome} usa SYN cookies: responde cada SYN sem guardar nada (o estado vai codificado no número de sequência). Fila: 0 de ${backlog}. Quem completa o aperto de mão entra normalmente.`
      : `Fila de meio abertas: ${meias} de ${backlog}${cheia ? ' (CHEIA)' : ''}. ${cheia ? 'Cliente legítimo que chegar agora não consegue nem abrir conexão.' : 'Ainda cabe gente.'}`,
    'Defesa: SYN cookies ("syncookies on" no servidor), fila maior, firewall limitando SYN por origem e, contra muitas origens, filtragem no provedor.',
  );
  return { l, flags: { ...base, chegou: true, escuta: true, servidor: srv.nome, backlog, meiasAbertas: meias, cheia, synCookies: cookies } };
}

function cmdInundar(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(m, args[0]);
  const porta = Number(args[1] ?? 80);
  const taxa = lerNumero(args[2] ?? '') ?? 1000;
  if (ipN === null || !Number.isInteger(porta) || taxa <= 0) return ['inundar <ip> <porta> [SYN por segundo] [falsificado]'];
  const r = inundarServidor(m, e, ipN, porta, taxa, args.includes('falsificado'), 'Inundação de SYN');
  anotarFlag(m, 'ataque', { tipo: 'syn', ...r.flags });
  return r.l;
}

function cmdDdos(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(m, args[0]);
  const porta = Number(args[1] ?? 80);
  const zumbis = Math.max(1, Math.round(lerNumero(args[2] ?? '') ?? 500));
  const porZumbi = lerNumero(args[3] ?? '') ?? 100;
  if (ipN === null || !Number.isInteger(porta)) return ['ddos <ip> <porta> [máquinas zumbis] [pacotes por segundo de cada]'];
  const total = zumbis * porZumbi;
  const r = inundarServidor(m, e, ipN, porta, total, true, `Negação de serviço distribuída com ${zumbis} máquinas zumbis`);
  const c = caminhoTransporte(m, e.nome, ipN, 'tcp', portaEfemera(e, 'tcp'), porta);
  const mbps = (total * 60 * 8) / 1e6;
  const cap = c.ok ? c.gargalo.mbps : 0;
  const ocup = cap ? mbps / cap : 0;
  const perdaLegit = ocup > 1 ? 1 - 1 / ocup : 0;
  const l = [...r.l, `Banda: ${num(mbps, 1)} Mb/s de SYN chegando, no enlace de ${cap} Mb/s até o servidor: ${pct(Math.min(ocup, 9.99))} de ocupação.${ocup > 1 ? ` O enlace satura: ${pct(perdaLegit)} do tráfego legítimo se perde antes de chegar, e nem SYN cookie salva (o cano está cheio).` : ''}`, 'As máquinas zumbis são computadores de terceiros, infectados sem que quem os usa saiba. Contra volume, só o provedor e serviços de limpeza de tráfego, longe do servidor.'];
  for (const nome of c.roteadores) {
    const r = m.equipamentos.get(nome)!;
    const ids = idsDe(r);
    if (!ids) continue;
    const d = inspecionarTaxa(ids, { origem: lerIp('198.51.100.200')!, destino: ipN, protocolo: 6, portaDestino: porta }, total, false);
    refrescarFiltros(m, r);
    if (d.texto) l.push(`${nome}: ${d.texto}`);
  }
  anotarFlag(m, 'ataque', { tipo: 'ddos', ...r.flags, zumbis, porZumbi, mbps: Number(mbps.toFixed(3)), capacidadeMbps: cap, ocupacao: Number(ocup.toFixed(4)), perdaLegitima: Number(perdaLegit.toFixed(4)) });
  return l;
}

function cmdPararAtaque(m: Mundo, e: Equipamento): Saida {
  const l: Saida = [];
  for (const a of (e.s.ataquesArp as AtaqueArp[] | undefined) ?? []) {
    const v = m.equipamentos.get(a.vitima);
    const f = v?.s.arpFalso as Record<number, string> | undefined;
    if (f && f[a.ip] === e.nome) delete f[a.ip];
    if (v?.s.arp) delete (v.s.arp as Record<number, string>)[a.ip];
  }
  if ((e.s.ataquesArp as unknown[] | undefined)?.length) l.push('Caches ARP voltam ao normal no próximo pedido ARP.');
  delete e.s.ataquesArp;
  delete e.s.repassar;
  for (const nome of (e.s.ataquesSyn as string[] | undefined) ?? []) {
    const s = m.equipamentos.get(nome);
    if (!s) continue;
    delete s.s.inundacaoSyn;
    s.s.soquetes = soquetesDe(s).filter((x) => x.servico !== 'meia aberta (inundação)');
    l.push(`${nome}: as meio abertas vencem e a fila esvazia.`);
  }
  delete e.s.ataquesSyn;
  anotarFlag(m, 'ataque', { tipo: 'parado', de: e.nome });
  return l.length ? l : ['Nenhum ataque em andamento a partir daqui.'];
}

/* ---------- Sequestro de DNS (resposta forjada no cache) ---------- */

function cmdEnvenenarDns(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipR = lerDestino(m, args[0]);
  const nome = args[1];
  const falso = args[2];
  const tentativas = Math.round(lerNumero(args[3] ?? '') ?? 100000);
  if (ipR === null || !nome || lerIp(falso ?? '') === null) return ['envenenar-dns <ip do resolvedor> <nome> <ip falso> [respostas forjadas]'];
  const R = donoDoIp(m, ipR)?.e;
  const cfg = R && servicosDe(R)?.dns;
  if (!R || !cfg?.recursivo) return ['Esse endereço não é de um resolvedor recursivo: não há cache para envenenar.'];
  const c = caminhoTransporte(m, e.nome, ipR, 'udp', portaEfemera(e, 'udp'), 53);
  if (!c.ok) return [`As respostas forjadas não chegam ao resolvedor: ${c.falha}`];
  const mundo = espacoDoMundo(m);
  let zona = '.';
  for (const z of mundo.espaco.porZona.keys()) if (dentroDe(nome, z) && z.length > zona.length) zona = z;
  const assinada = mundo.assinadas.has(zona);
  const espaco = 65536 * (cfg.portasAleatorias ? 64512 : 1);
  const prob = 1 - Math.exp(tentativas * Math.log1p(-1 / espaco));
  const acertou = prob >= 0.5;
  const l: Saida = [
    `${e.nome} faz o resolvedor ${R.nome} perguntar por ${normalizarNome(nome)} e, antes da resposta verdadeira, despeja ${tentativas} respostas forjadas com "${normalizarNome(nome)} A ${falso}".`,
    `Para ser aceita, a resposta forjada precisa acertar o id da consulta (16 bits${cfg.portasAleatorias ? ') e a porta de origem sorteada (cerca de 16 bits a mais' : ', e a porta é sempre a mesma'}): chance de ${pct(prob)}.`,
  ];
  let envenenado = false;
  let rejeitada = false;
  if (!acertou) l.push('Nenhuma acertou antes da resposta verdadeira: o cache continua limpo. Portas aleatórias multiplicam o trabalho do atacante.');
  else if (assinada && cfg.validar) {
    rejeitada = true;
    l.push(`Uma acertou id e porta, mas a zona ${zona} é assinada e o resolvedor valida DNSSEC: a resposta forjada não tem RRSIG que confira com a chave da zona. Descartada.`);
  } else {
    const cache = cacheDoResolvedor(R);
    const interno = (cache as unknown as { entradas: Map<string, unknown> }).entradas;
    interno.delete(`${normalizarNome(nome)} A`);
    interno.delete(`${normalizarNome(nome)} CNAME`);
    const reg: RegistroDns & { forjado: boolean } = { nome: normalizarNome(nome), tipo: 'A', ttl: 86400, valor: falso!, forjado: true };
    cache.guardar([reg], relogio(m));
    envenenado = true;
    l.push(`Uma acertou: o resolvedor guardou "${normalizarNome(nome)} A ${falso}" por 86400 s. Todo cliente dele agora vai para ${falso}.${assinada ? ' A zona é assinada, mas o resolvedor não confere (servico dns validar on resolveria).' : ' A zona não é assinada: não havia como perceber.'}`, 'Se o site usar HTTPS, o navegador ainda percebe: o servidor falso não tem certificado válido para esse nome.');
  }
  anotarFlag(m, 'ataque', { tipo: 'dns', de: e.nome, resolvedor: R.nome, nome: normalizarNome(nome), ipFalso: falso, tentativas, probabilidade: Number(prob.toFixed(6)), portasAleatorias: !!cfg.portasAleatorias, envenenado, rejeitadaPorDnssec: rejeitada });
  anotarFlag(m, 'dnssec', { zona, assinada, validar: !!cfg.validar, rejeitada, resolvedor: R.nome });
  return l;
}

/* ---------- Wi-Fi ---------- */

function pontosWifi(m: Mundo): Equipamento[] {
  return [...m.equipamentos.values()].filter((x) => wifiDe(x));
}

function cmdWifiPc(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, ssid, ...resto] = args;
  const ap = pontosWifi(m).find((x) => wifiDe(x)!.ssid === ssid);
  switch (sub) {
    case 'redes':
    case undefined: {
      const l = ['REDES SEM FIO AO ALCANCE'];
      for (const x of pontosWifi(m)) l.push(`  ${wifiDe(x)!.ssid.padEnd(20)} ${wifiDe(x)!.seguranca.toUpperCase().padEnd(7)} ${x.nome}`);
      if (l.length === 1) l.push('  (nenhuma)');
      return l;
    }
    case 'conectar': {
      if (!ap) return ['wifi conectar <ssid> <senha>'];
      const senha = resto.join(' ');
      const r = associarWifi(m, ap, e, senha);
      if (r.ok) {
        e.s.wifiConectado = ssid;
        e.s.senhaWifi = senha;
      }
      anotarFlag(m, 'wifi', { ...(m.flags.wifi ?? {}), ssid, seguranca: wifiDe(ap)!.seguranca, conectado: r.ok, por: e.nome });
      return r.linhas;
    }
    case 'desautenticar': {
      if (!ap) return ['wifi desautenticar <ssid>: manda quadros de desautenticação forjados para os clientes da rede.'];
      const w = wifiDe(ap)!;
      if (w.seguranca === 'wpa3') return ['WPA3 exige quadros de gerência protegidos: a desautenticação forjada não tem a assinatura certa e os clientes ignoram.'];
      const clientes = [...m.equipamentos.values()].filter((x) => x.s.wifiConectado === ssid);
      if (!clientes.length) return ['Ninguém conectado nessa rede agora.'];
      const l = [`Quadros de desautenticação forjados (em nome do ponto de acesso): ${clientes.map((x) => x.nome).join(', ')} cai(em) e reconecta(m) sozinho(s).`];
      for (const x of clientes) l.push(...associarWifi(m, ap, x, (x.s.senhaWifi as string | undefined) ?? '').linhas.slice(0, 2));
      l.push('O aperto de mão de 4 vias passou no ar de novo: "wifi capturar" pega.');
      return l;
    }
    case 'capturar': {
      if (!ap) return ['wifi capturar <ssid>'];
      const a = wifiDe(ap)!.ultimoAperto;
      if (!a) return ['Ninguém se associou desde que você chegou. Espere alguém conectar, ou "wifi desautenticar <ssid>".'];
      e.s.capturaWifi = { ...a };
      anotarFlag(m, 'ataque', { tipo: 'wifi-captura', de: e.nome, ssid, seguranca: a.seguranca });
      return [`Capturado o aperto de mão de ${ssid}: ANonce ${a.anonce}, SNonce ${a.snonce}, MACs ${a.macAp} e ${a.macCliente}${a.mic ? `, MIC ${a.mic.slice(0, 16)}...` : ' (WPA3: o que passou no ar não dá para testar senha fora dali)'}.`];
    }
    case 'quebrar': {
      const a = e.s.capturaWifi as ApertoWifi | undefined;
      if (!a || (ssid && a.ssid !== ssid)) return ['Primeiro "wifi capturar <ssid>".'];
      const lista = resto.length ? resto : DICIONARIO_PEQUENO;
      const r = quebrarAperto(a, lista);
      anotarFlag(m, 'wifi', { ...(m.flags.wifi ?? {}), quebra: { ssid: a.ssid, seguranca: a.seguranca, senha: r.senha ?? null, testadas: r.testadas, dicionario: lista.length } });
      anotarFlag(m, 'ataque', { tipo: 'wifi', de: e.nome, ssid: a.ssid, seguranca: a.seguranca, quebrada: !!r.senha, testadas: r.testadas });
      return [...r.linhas, r.senha ? 'Defesa: senha longa e aleatória (frase de várias palavras), e WPA3, que não deixa testar senha fora do ar.' : ''].filter(Boolean);
    }
  }
  return ['wifi redes | wifi conectar <ssid> <senha> | wifi desautenticar <ssid> | wifi capturar <ssid> | wifi quebrar <ssid> [palavras...]'];
}

function cmdWifiAp(m: Mundo, e: Equipamento, args: string[]): Saida {
  if (!args[0]) {
    const w = wifiDe(e);
    return [w ? `Rede "${w.ssid}", ${w.seguranca.toUpperCase()}${w.senha ? `, senha de ${w.senha.length} caracteres` : ''}.` : 'Sem rede sem fio configurada. wifi <ssid> <aberta|wpa2|wpa3> [senha]'];
  }
  const [ssid, seg, ...resto] = args;
  if (seg !== 'aberta' && seg !== 'wpa2' && seg !== 'wpa3') return ['wifi <ssid> <aberta|wpa2|wpa3> [senha]'];
  const senha = resto.join(' ');
  if (seg !== 'aberta' && senha.length < 8) return ['WPA2 e WPA3 pedem senha de pelo menos 8 caracteres.'];
  e.s.wifi = { ssid: ssid!, seguranca: seg, senha: seg === 'aberta' ? undefined : senha } satisfies ConfigWifi;
  anotarFlag(m, 'wifi', { ...(m.flags.wifi ?? {}), ssid, seguranca: seg, ap: e.nome, tamanhoSenha: senha.length });
  return [seg === 'aberta' ? `Rede "${ssid}" aberta: sem senha e sem cifra.` : seg === 'wpa2' ? `Rede "${ssid}" com WPA2: chave derivada da senha e do nome da rede, aperto de mão de 4 vias a cada associação. Senha fraca cai num dicionário.` : `Rede "${ssid}" com WPA3 (SAE): a senha entra numa troca tipo Diffie-Hellman, e o que passa no ar não serve para testar senha fora dali.`];
}

/* ---------- Firewall, IDS, antifalsificação e VPN no roteador ---------- */

function mostraFw(e: Equipamento, fw: ConfigFirewall): Saida {
  const l = [`FIREWALL DE ${e.nome}: política padrão ${fw.padrao.toUpperCase()}, filtro com estado ${fw.comEstado ? 'LIGADO' : 'desligado'}`];
  if (fw.comEstado) l.push('   0  PERMITIR  tudo que é de conversa já permitida (tabela de estado)');
  for (const r of fw.regras) l.push(`${String(r.id).padStart(4)}  ${textoRegra(r)}   [${r.contador} pacote(s)]`);
  if (!fw.regras.length) l.push('   (nenhuma regra)');
  l.push(`   *  ${fw.padrao.toUpperCase()} o resto (política padrão)   [${fw.contadores.porPadrao}]`, `Passaram ${fw.contadores.permitidos}, negados ${fw.contadores.negados}; ${fw.conexoes.length} conversa(s) na tabela de estado. As regras valem em ordem: a primeira que casa decide.`);
  return l;
}

function cmdFirewall(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, ...resto] = args;
  if (sub === 'desliga' || sub === 'off') {
    delete e.s.firewall;
    anotarFiltro(m, 'firewall', e, { roteador: e.nome, desligado: true });
    return ['Firewall desligado: tudo passa.'];
  }
  const fw = ((e.s.firewall as ConfigFirewall | undefined) ??= novoFirewall());
  const fim = (l: Saida) => {
    anotarFiltro(m, 'firewall', e, resumoFirewall(e, fw));
    return [...l, ...mostraFw(e, fw)];
  };
  switch (sub) {
    case undefined:
    case 'mostra':
    case 'liga':
      return fim([]);
    case 'regra':
    case 'inserir': {
      let pos: number | undefined;
      let a = resto;
      if (sub === 'inserir') {
        pos = Number(resto[0]);
        a = resto.slice(1);
        if (!Number.isInteger(pos) || pos < 1) return ['firewall inserir <posição> <permitir|negar> ...'];
      }
      const r = lerRegra(a);
      if (typeof r === 'string') return [r, 'firewall regra <permitir|negar> [tcp|udp|icmp] [de <prefixo>] [para <prefixo>] [porta <n|a-b>] [porta-origem <n|a-b>] [estado nova|estabelecida] [em <interface>]'];
      const nova = { ...r, id: fw.proxId++, contador: 0 };
      if (pos !== undefined) fw.regras.splice(Math.min(pos - 1, fw.regras.length), 0, nova);
      else fw.regras.push(nova);
      return fim([`Regra ${nova.id}: ${textoRegra(nova).replace(/\s+/g, ' ').trim()}.`]);
    }
    case 'apagar': {
      if (resto[0] === 'tudo') fw.regras = [];
      else {
        const i = fw.regras.findIndex((x) => x.id === Number(resto[0]));
        if (i < 0) return ['firewall apagar <id|tudo>'];
        fw.regras.splice(i, 1);
      }
      return fim([]);
    }
    case 'padrao':
    case 'padrão': {
      const v = resto[0] === 'negar' || resto[0] === 'permitir' ? resto[0] : null;
      if (!v) return ['firewall padrao <permitir|negar>'];
      fw.padrao = v;
      return fim([v === 'negar' ? 'Política padrão NEGAR: só passa o que uma regra permitir. É o jeito certo, e é preciso lembrar das respostas.' : 'Política padrão PERMITIR: só barra o que uma regra negar.']);
    }
    case 'estado': {
      const b = ligado(resto[0]);
      if (b === null) return ['firewall estado <on|off>'];
      fw.comEstado = b;
      return fim([b ? 'Filtro com estado: o firewall lembra cada conversa que deixou começar e deixa passar a volta dela, sem regra para isso. Quem vem de fora sem ninguém ter chamado continua barrado.' : 'Filtro sem estado: cada pacote é julgado sozinho, e a resposta precisa de regra própria.']);
    }
    case 'log':
      anotarFiltro(m, 'firewall', e, resumoFirewall(e, fw));
      return [`ÚLTIMAS DECISÕES DE ${e.nome}:`, ...(fw.log.length ? fw.log.slice(-15).map((x) => '  ' + x) : ['  nenhuma ainda: nenhum pacote passou por aqui'])];
    case 'zerar':
      fw.conexoes = [];
      fw.estados = {};
      fw.contadores = { permitidos: 0, negados: 0, porEstado: 0, porPadrao: 0 };
      for (const r of fw.regras) r.contador = 0;
      return fim(['Contadores e tabela de estado zerados.']);
  }
  return ['firewall [mostra] | regra <permitir|negar> ... | inserir <pos> ... | apagar <id|tudo> | padrao <permitir|negar> | estado <on|off> | log | zerar | desliga'];
}

function cmdIds(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, ...resto] = args;
  if (sub === 'off' || sub === 'desliga') {
    delete e.s.ids;
    anotarFiltro(m, 'ids', e, { roteador: e.nome, desligado: true });
    return ['IDS desligado.'];
  }
  const ids = ((e.s.ids as ConfigIds | undefined) ??= novoIds());
  const fim = (l: Saida) => {
    anotarFiltro(m, 'ids', e, resumoIds(e, ids));
    return [...l, `${ids.modo.toUpperCase()} em ${e.nome}: varredura a partir de ${ids.limiarVarredura} portas, inundação a partir de ${ids.limiarSyn} SYN/s, anomalia acima de ${ids.limiarTaxa} pacotes/s; ${ids.assinaturas.length} assinatura(s) de conteúdo (${ids.assinaturas.map((a) => a.nome).join(', ')}); ${ids.alertas.length} alerta(s); bloqueados: ${ids.bloqueados.join(', ') || 'ninguém'}.`];
  };
  switch (sub) {
    case undefined:
    case 'on':
    case 'mostra':
      return fim([]);
    case 'ids':
    case 'ips':
      ids.modo = sub;
      return fim([sub === 'ips' ? 'Modo IPS (em linha): ao casar uma assinatura, descarta o pacote e passa a bloquear a origem. Cuidado com falso positivo: bloqueia gente honesta.' : 'Modo IDS (só observa): alerta e deixa passar. Alguém precisa ler os alertas.']);
    case 'limiar': {
      const n = Number(resto[1]);
      if (!Number.isFinite(n) || n < 1) return ['ids limiar <varredura|syn|taxa> <n>'];
      if (resto[0] === 'varredura') ids.limiarVarredura = Math.round(n);
      else if (resto[0] === 'syn') ids.limiarSyn = n;
      else if (resto[0] === 'taxa') ids.limiarTaxa = n;
      else return ['ids limiar <varredura|syn|taxa> <n>'];
      return fim([]);
    }
    case 'assinatura': {
      const [nome, ...padrao] = resto;
      if (!nome || !padrao.length) return ['ids assinatura <nome> <texto procurado no conteúdo>'];
      ids.assinaturas.push({ nome: nome.replace(/-/g, ' '), padrao: padrao.join(' ') });
      return fim([`Assinatura "${nome}": procura "${padrao.join(' ')}" no conteúdo em claro. Tráfego cifrado passa sem ela ver.`]);
    }
    case 'alertas':
      anotarFiltro(m, 'ids', e, resumoIds(e, ids));
      return [`ALERTAS DE ${e.nome} (${ids.modo.toUpperCase()}):`, ...(ids.alertas.length ? ids.alertas.slice(-15).map((a) => `  ${a.n}. [${a.tipo}] ${a.nome}: ${a.motivo} (${a.acao})`) : ['  nenhum'])];
    case 'desbloquear':
      ids.bloqueados = resto[0] === 'tudo' ? [] : ids.bloqueados.filter((x) => x !== resto[0]);
      return fim([]);
  }
  return ['ids [mostra] | ids <ids|ips> | ids limiar <varredura|syn|taxa> <n> | ids assinatura <nome> <texto> | ids alertas | ids desbloquear <ip|tudo> | ids off'];
}

function cmdVpn(m: Mundo, e: Equipamento, args: string[]): Saida {
  const tab = ((e.s.vpn as Record<string, TunelVpn> | undefined) ??= {});
  const [sub] = args;
  const mostra = () => {
    const l: Saida = [];
    refrescarVpns(m);
    for (const t of Object.values(tab)) {
      const st = estadoTunel(m, e, t);
      l.push(...linhasIke(t, st.ativo, st.motivo), `  pacotes: ${t.contadores.cifrados} cifrado(s) na saída, ${t.contadores.decifrados} decifrado(s) na chegada`);
      anotarFlag(m, 'vpn', { roteador: e.nome, nome: t.nome, par: t.par, local: t.local, remota: t.remota, ativo: st.ativo, motivo: st.motivo ?? null, cifrados: t.contadores.cifrados, decifrados: t.contadores.decifrados, mtuEfetivo: 1500 - SOBRA_ESP, sobra: SOBRA_ESP });
    }
    return l.length ? l : ['Nenhum túnel. vpn <nome> <ip da outra ponta> <rede daqui> <rede de lá> <segredo>'];
  };
  if (!sub || sub === 'mostra') return mostra();
  if (sub === 'apagar') {
    delete tab[args[1] ?? ''];
    return mostra();
  }
  if (sub === 'captura') {
    const t = Object.values(tab).find((x) => x.ultimo);
    if (!t?.ultimo) return ['Nada passou pelo túnel ainda.'];
    const u = t.ultimo;
    const dentro = `IP ${u.origem} > ${u.destino} protocolo ${u.protocolo}, ${u.tamanho} bytes`;
    const hex = espDe(t, dentro, t.contadores.cifrados);
    anotarFlag(m, 'vpn', { ...(m.flags.vpn ?? {}), captura: { externo: u.externo, protocolo: 50, legivel: false, cifrado: hex.slice(0, 48) } });
    return [
      'O QUE O MEIO DO CAMINHO VÊ (último pacote do túnel):',
      `  IP ${u.externo}, protocolo 50 (ESP), ${u.tamanho + SOBRA_ESP} bytes`,
      `  ESP: SPI ${t.spi}, sequência ${t.contadores.cifrados}, carga cifrada ${hex.slice(0, 64)}...`,
      `  Dentro (só as pontas veem): ${dentro}`,
      'Os roteadores do meio não sabem quem fala com quem do lado de dentro, nem a porta, nem o conteúdo. Só as duas pontas.',
    ];
  }
  const [nome, par, local, remota, ...seg] = args;
  if (!nome || lerIp(par ?? '') === null || !prefixoOuIp(local ?? '') || !prefixoOuIp(remota ?? '') || !seg.length) return ['vpn <nome> <ip da outra ponta> <rede daqui> <rede de lá> <segredo> | vpn mostra | vpn captura | vpn apagar <nome>'];
  tab[nome] = { nome, par: par!, local: local!, remota: remota!, segredo: seg.join(' '), spi: 0x1000 + (Object.keys(tab).length + 1) * 0x101, contadores: { cifrados: 0, decifrados: 0 } };
  return [`Túnel ${nome}: o que vai de ${local} para ${remota} entra em ESP até ${par}.`, ...mostra()];
}

/* ---------- Calculadora de criptografia ---------- */

function cmdCripto(m: Mundo, e: Equipamento, cmd: string, args: string[]): Saida | null {
  const resto = (k: number) => args.slice(k).join(' ');
  switch (cmd) {
    case 'cesar': {
      const k = Number(args[0]);
      if (!Number.isInteger(k) || !args[1]) return ['cesar <chave> <texto>'];
      const r = cesar(resto(1), k);
      anotarFlag(m, 'cripto', { op: 'cesar', chave: k, resultado: r.resultado });
      return [...r.passos, `Cifrado: ${r.resultado}`];
    }
    case 'quebrar-cesar': {
      if (!args[0]) return ['quebrar-cesar <texto cifrado>'];
      const r = quebrarCesar(resto(0));
      anotarFlag(m, 'cripto', { op: 'quebrar-cesar', chave: r.chave, texto: r.texto });
      return [...r.passos, `Chave mais provável ${r.chave}: ${r.texto}`];
    }
    case 'rsa': {
      const [p, q, msg] = args.map((x) => (/^\d+$/.test(x) ? BigInt(x) : null));
      if (p == null || q == null || msg == null || !ehPrimo(p) || !ehPrimo(q) || p === q) return ['rsa <primo p> <primo q> <mensagem (número menor que p×q)>. Ex.: rsa 61 53 65'];
      try {
        const k = gerarChavesRsa(p, q);
        const c = cifrarRsa(msg, k.publica);
        const d = decifrarRsa(c.resultado, k.privada);
        anotarFlag(m, 'cripto', { op: 'rsa', n: String(k.n), e: String(k.e), d: String(k.d), cifrado: String(c.resultado), decifrado: String(d.resultado) });
        return [...k.passos, `Cifrar ${msg}: ${c.resultado}. Decifrar: ${d.resultado}.`];
      } catch (x) {
        return [`Não deu: ${(x as Error).message}.`];
      }
    }
    case 'sha256': {
      if (!args.length) return ['sha256 <texto>'];
      const r = sha256Explicado(resto(0));
      anotarFlag(m, 'cripto', { op: 'sha256', resumo: r.resumo });
      return [...r.passos.slice(0, 8), `SHA-256: ${r.resumo}`];
    }
    case 'hmac': {
      if (args.length < 2) return ['hmac <chave> <texto>'];
      const r = hmacExplicado(args[0]!, resto(1));
      anotarFlag(m, 'cripto', { op: 'hmac', mac: r.mac });
      return [...r.passos, `HMAC-SHA-256: ${r.mac}`];
    }
    case 'assinar': {
      if (!args.length) return ['assinar <texto>: assina com a sua chave (a do correio, se houver).'];
      const quem = (e.s.correio as { endereco: string } | undefined)?.endereco ?? `${e.nome}@laboratorio.exemplo`;
      const k = chavesPgp(quem);
      const a = assinarMensagem(resto(0), k.privada);
      const v = verificarAssinatura(resto(0), a.assinatura, k.publica);
      const alterada = verificarAssinatura(resto(0) + '!', a.assinatura, k.publica);
      anotarFlag(m, 'cripto', { op: 'assinar', de: quem, idChave: idChave(quem), assinatura: String(a.assinatura), confere: v.valida, alteradaConfere: alterada.valida });
      return [...a.passos, `Assinatura: ${a.assinatura} (chave ${idChave(quem)})`, ...v.passos, `Com um caractere a mais no texto: ${alterada.valida ? 'confere (colisão do RSA de brinquedo)' : 'não confere mais'}.`];
    }
    case 'verificar-cadeia': {
      const nome = args[0];
      const tipo = (args[1] ?? 'valido') as TipoCertificado;
      if (!nome || !TIPOS_CERTIFICADO.includes(tipo)) return [`verificar-cadeia <nome> [${TIPOS_CERTIFICADO.join('|')}]`];
      const hoje = diaDoMundo(m);
      const cadeia = cadeiaDoServidor(nome, tipo, hoje);
      const r = conferirCadeia(nome, cadeia, hoje, tipo === 'revogado');
      anotarFlag(m, 'cripto', { op: 'cadeia', nome, tipo, valida: r.valida, motivo: r.motivo ?? null });
      return [...r.passos, r.valida ? 'Cadeia válida.' : 'Cadeia inválida.'];
    }
    case 'kerberos': {
      const [usuario, digitada, cadastrada, servico] = args;
      if (!usuario || !digitada) return ['kerberos <usuário> <senha digitada> [senha cadastrada] [serviço]'];
      const r = simularKerberos({ usuario, senhaDigitada: digitada, senhaCadastrada: cadastrada ?? digitada, servico: servico ?? 'arquivos', agora: Math.floor(relogio(m) / 60) });
      anotarFlag(m, 'cripto', { op: 'kerberos', sucesso: r.sucesso, falha: r.falha ?? null, etapas: r.etapas.map((x) => x.nome) });
      return r.passos;
    }
    case 'dh': {
      const [a, b, x] = args.map((v) => (/^\d+$/.test(v) ? BigInt(v) : null));
      if (a == null || b == null) return ['dh <segredo de Alice> <segredo de Bob> [segredo do atacante]: Diffie-Hellman com p = 23 e g = 5 (e o homem no meio, se der o terceiro)'];
      if (x != null) {
        const r = homemNoMeio(23n, 5n, a, b, x);
        anotarFlag(m, 'cripto', { op: 'dh-homem-no-meio', chaveAlice: String(r.chaveAlice), chaveBob: String(r.chaveBob) });
        return r.passos;
      }
      const r = diffieHellman(23n, 5n, a, b);
      anotarFlag(m, 'cripto', { op: 'dh', A: String(r.A), B: String(r.B), chave: String(r.chaveAlice) });
      return r.passos;
    }
    case 'pgp': {
      const conta = e.s.correio as { endereco: string } | undefined;
      if (args[0] === 'gerar') {
        if (!conta) return ['Primeiro a conta de correio: correio conta <endereço> <ip do servidor>'];
        e.s.pgp = true;
        const k = chavesPgp(conta.endereco);
        anotarFlag(m, 'pgp', { ...(m.flags.pgp ?? {}), chave: { endereco: conta.endereco, id: idChave(conta.endereco) } });
        return [`Par de chaves de ${conta.endereco}: id ${idChave(conta.endereco)}, pública (n = ${k.n}, e = ${k.e}). A privada fica só aqui.`, 'A pública vai para quem quiser mandar mensagem cifrada para você (e para conferir o que você assina). Confira a impressão digital por outro canal.'];
      }
      const l = ['CHAVES PÚBLICAS CONHECIDAS'];
      for (const x of m.equipamentos.values()) {
        const c = x.s.correio as { endereco: string } | undefined;
        if (x.s.pgp && c) l.push(`  ${c.endereco.padEnd(30)} ${idChave(c.endereco)}`);
      }
      if (l.length === 1) l.push('  nenhuma. "pgp gerar" cria a sua.');
      l.push('PGP e S/MIME fazem a mesma coisa: assinar e cifrar o corpo. No S/MIME a chave pública vem num certificado de uma autoridade; no PGP, de quem você confia.');
      return l;
    }
  }
  return null;
}

/* ---------- Código não confiável ---------- */

const PROGRAMAS: Record<string, { descricao: string; tenta: { acao: string; risco: boolean }[] }> = {
  planilha: { descricao: 'planilha de notas baixada do site da escola', tenta: [{ acao: 'ler o próprio arquivo', risco: false }, { acao: 'desenhar na janela', risco: false }] },
  'jogo-gratis': {
    descricao: 'jogo "grátis" recebido por mensagem',
    tenta: [
      { acao: 'desenhar na janela', risco: false },
      { acao: 'ler a pasta de documentos', risco: true },
      { acao: 'ler as senhas salvas do navegador', risco: true },
      { acao: 'abrir conexão para 203.0.113.66 porta 4444', risco: true },
      { acao: 'gravar-se na inicialização do sistema', risco: true },
    ],
  },
  extensao: {
    descricao: 'extensão de navegador que "deixa as páginas mais bonitas"',
    tenta: [
      { acao: 'mudar as cores da página', risco: false },
      { acao: 'ler tudo que é digitado em todos os sites', risco: true },
      { acao: 'mandar o histórico para um servidor de fora', risco: true },
    ],
  },
};

function cmdExecutar(m: Mundo, args: string[]): Saida {
  const nome = args[0] ?? '';
  const p = PROGRAMAS[nome];
  if (!p) return [`executar <${Object.keys(PROGRAMAS).join('|')}> [sandbox|direto]`];
  const caixa = args[1] !== 'direto';
  const l = [`Executando ${nome}: ${p.descricao}, ${caixa ? 'numa caixa de areia (sandbox): sem acesso a arquivos, rede e sistema fora do que foi liberado' : 'direto, com todas as permissões de quem executa'}.`];
  const feitas: string[] = [];
  const bloqueadas: string[] = [];
  for (const t of p.tenta) {
    if (caixa && t.risco) {
      bloqueadas.push(t.acao);
      l.push(`  tenta ${t.acao}: NEGADO pela sandbox`);
    } else {
      feitas.push(t.acao);
      l.push(`  ${t.acao}: ${t.risco ? 'feito (e você nem viu)' : 'ok'}`);
    }
  }
  l.push(caixa ? (bloqueadas.length ? 'O programa mostrou o que queria. Sandbox não deixa ver o que ele é; deixa que ele só faça o que pode.' : 'Nada fora do permitido.') : feitas.length > 1 && p.tenta.some((t) => t.risco) ? 'Rodou com todo o poder de quem executou: leu, mandou e ficou. Código de origem desconhecida só em sandbox, com o mínimo de permissões, e de quem assina o código.' : 'Nada de estranho, desta vez.');
  anotarFlag(m, 'sandbox', { programa: nome, modo: caixa ? 'sandbox' : 'direto', bloqueadas, feitas });
  return l;
}

/* ---------- Entrada ---------- */

/** Comandos de segurança no console. Devolve null se o comando não é daqui. */
export function comandosSeguranca(m: Mundo, e: Equipamento, cmd: string, args: string[]): Saida | null {
  if (e.tipo === 'roteador') {
    switch (cmd) {
      case 'firewall':
        return cmdFirewall(m, e, args);
      case 'ids':
        return cmdIds(m, e, args);
      case 'antifalsificacao':
      case 'antifalsificação': {
        const b = ligado(args[0]);
        if (b === null) return [`antifalsificacao <on|off> (agora ${e.s.antiFalsificacao ? 'ligado' : 'desligado'})`];
        e.s.antiFalsificacao = b;
        anotarFlag(m, 'antiFalsificacao', { roteador: e.nome, ligado: b });
        return [b ? 'Filtro de entrada (BCP 38, verificação do caminho reverso): pacote que chega por uma interface com origem que não seria roteada de volta por ela é descartado.' : 'Filtro antifalsificação desligado.'];
      }
      case 'vpn':
        return cmdVpn(m, e, args);
      case 'wifi':
        return cmdWifiAp(m, e, args);
    }
    return null;
  }
  if (e.tipo === 'ap') return cmd === 'wifi' ? cmdWifiAp(m, e, args) : null;
  if (e.tipo === 'switch') {
    if (cmd === 'espelhar') {
      if (args[0] === 'off') {
        delete e.s.espelho;
        return ['Espelhamento desligado.'];
      }
      if (!e.portas.some((p) => p.nome === args[0])) return [`espelhar <porta que recebe a cópia> | espelhar off. Portas: ${e.portas.map((p) => p.nome).join(', ')}`];
      e.s.espelho = args[0];
      anotarFlag(m, 'espelho', { switch: e.nome, porta: args[0] });
      return [`Porta ${args[0]} espelha tudo que passa por ${e.nome} (SPAN). É para o IDS ou o analisador de tráfego, e é por isso que fica trancada.`];
    }
    if (cmd === 'inspecao-arp' || cmd === 'inspeção-arp') {
      const b = ligado(args[0]);
      if (b === null) return ['inspecao-arp <on|off>'];
      e.s.inspecaoArp = b;
      anotarFlag(m, 'defesaArp', { tipo: 'inspecao', switch: e.nome, ligado: b });
      return [b ? 'Inspeção dinâmica de ARP: o switch confere cada resposta ARP com quem recebeu qual IP e descarta as mentirosas.' : 'Inspeção de ARP desligada.'];
    }
    return null;
  }
  if (e.tipo !== 'pc') return null;
  switch (cmd) {
    case 'varrer':
      return cmdVarrer(m, e, args);
    case 'farejar':
      return cmdFarejar(m, e);
    case 'arp-falso':
      return cmdArpFalso(m, e, args);
    case 'arp-estatico':
    case 'arp-estático':
      return cmdArpEstatico(m, e, args);
    case 'ip-falso':
      return cmdIpFalso(m, e, args);
    case 'inundar':
      return cmdInundar(m, e, args);
    case 'ddos':
      return cmdDdos(m, e, args);
    case 'parar-ataque':
      return cmdPararAtaque(m, e);
    case 'envenenar-dns':
      return cmdEnvenenarDns(m, e, args);
    case 'syncookies': {
      const b = ligado(args[0]);
      if (b === null) return [`syncookies <on|off> (agora ${e.s.synCookies ? 'ligado' : 'desligado'})`];
      e.s.synCookies = b;
      const inund = e.s.inundacaoSyn as InundacaoSyn | undefined;
      if (inund && b) {
        inund.meiasAbertas = 0;
        e.s.soquetes = soquetesDe(e).filter((x) => x.servico !== 'meia aberta (inundação)');
      }
      anotarFlag(m, 'synCookies', { equip: e.nome, ligado: b });
      return [b ? 'SYN cookies: quando a fila aperta, o servidor responde o SYN sem guardar nada; o estado vai escondido no número de sequência inicial e volta no ACK. Custa algumas opções do TCP.' : 'SYN cookies desligados.'];
    }
    case 'backlog': {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return ['backlog <tamanho da fila de conexões meio abertas>'];
      e.s.backlogSyn = n;
      return [`Fila de meio abertas: ${n}.`];
    }
    case 'wifi':
      return cmdWifiPc(m, e, args);
    case 'executar':
      return cmdExecutar(m, args);
  }
  return cmdCripto(m, e, cmd, args);
}

export const AJUDA_SEGURANCA: Partial<Record<Equipamento['tipo'], string[]>> = {
  pc: [
    'varrer <ip> [portas] [udp] | farejar | arp-falso <vítima> <ip fingido> [derrubar] | arp-estatico <ip>',
    'ip-falso <ip forjado> <destino> [porta] | inundar <ip> <porta> [SYN/s] [falsificado] | ddos <ip> <porta> [zumbis] [pps] | parar-ataque',
    'envenenar-dns <resolvedor> <nome> <ip falso> [tentativas] | syncookies <on|off> | backlog <n>',
    'wifi redes | wifi conectar <ssid> <senha> | wifi desautenticar <ssid> | wifi capturar <ssid> | wifi quebrar <ssid> [palavras]',
    'cesar <chave> <texto> | quebrar-cesar <texto> | rsa <p> <q> <m> | sha256 <texto> | hmac <chave> <texto> | assinar <texto>',
    'verificar-cadeia <nome> [tipo] | kerberos <usuário> <senha> [cadastrada] [serviço] | dh <a> <b> [m] | pgp [gerar] | correio enviar-seguro ...',
    'executar <planilha|jogo-gratis|extensao> [sandbox|direto]',
  ],
  roteador: [
    'firewall [mostra] | firewall regra <permitir|negar> [proto] [de <p>] [para <p>] [porta <n>] [porta-origem <n>] [estado nova|estabelecida] [em <porta>]',
    'firewall inserir <pos> ... | apagar <id|tudo> | padrao <permitir|negar> | estado <on|off> | log | zerar | desliga',
    'ids [mostra] | ids <ids|ips> | ids limiar <varredura|syn|taxa> <n> | ids assinatura <nome> <texto> | ids alertas | ids desbloquear <ip|tudo> | ids off',
    'antifalsificacao <on|off> | vpn <nome> <par> <rede daqui> <rede de lá> <segredo> | vpn mostra | vpn captura | vpn apagar <nome>',
    'wifi <ssid> <aberta|wpa2|wpa3> [senha]',
  ],
  switch: ['espelhar <porta> | espelhar off | inspecao-arp <on|off>'],
  ap: ['wifi <ssid> <aberta|wpa2|wpa3> [senha]'],
};

/* ---------- Ações do menu ---------- */

const op = (valor: string, rotulo = valor): Opcao => ({ valor, rotulo });
const escolha = (nome: string, rotulo: string, opcoes: Opcao[], padrao?: string): Campo => ({ nome, rotulo, tipo: 'escolha', opcoes, padrao: padrao ?? opcoes[0]?.valor });
const numero = (nome: string, rotulo: string, unidade?: string, padrao?: string): Campo => ({ nome, rotulo, tipo: 'numero', unidade, padrao });
const texto = (nome: string, rotulo: string, padrao: string): Campo => ({ nome, rotulo, tipo: 'texto', padrao });

function ipsDe(m: Mundo, exceto: string, filtro: (e: Equipamento) => boolean = () => true): Opcao[] {
  const out: Opcao[] = [];
  for (const x of m.equipamentos.values()) {
    if (x.nome === exceto || !filtro(x)) continue;
    for (const i of interfacesL3(x)) out.push(op(ipTexto(i.cidr.endereco), `${ipTexto(i.cidr.endereco)} (${x.nome})`));
  }
  return out;
}

function campoIp(m: Mundo, e: Equipamento, nome: string, rotulo: string, padrao: string, filtro?: (x: Equipamento) => boolean): Campo {
  const ips = ipsDe(m, e.nome, filtro);
  return ips.length ? escolha(nome, rotulo, ips) : texto(nome, rotulo, padrao);
}

/** Ações de segurança. Só aparecem com m.flags.seguranca ou algo de segurança configurado. */
export function acoesSeguranca(m: Mundo, e: Equipamento): Acao[] {
  const ctx = e.nome;
  if (e.tipo === 'roteador') {
    if (!ehRoteador(e)) return [];
    const portas = e.portas.map((p) => op(p.nome));
    const fw = firewallDe(e);
    const outros = ipsDe(m, e.nome, (x) => ehRoteador(x));
    const a: Acao[] = [
      { id: 'sg-fw-ver', rotulo: 'Ver o firewall', ajuda: 'Regras em ordem, política padrão, contadores e quantas conversas estão na tabela de estado.', contexto: ctx, comandos: () => ['firewall'] },
      { id: 'sg-fw-padrao', rotulo: 'Política padrão do firewall', ajuda: 'O que acontece com o pacote que nenhuma regra casou. "Negar" é o jeito seguro: só passa o que foi pensado.', contexto: ctx, campos: [escolha('v', 'Política', [op('negar', 'negar'), op('permitir', 'permitir')], fw?.padrao === 'negar' ? 'permitir' : 'negar')], comandos: (v) => [`firewall padrao ${v.v}`] },
      { id: 'sg-fw-estado', rotulo: 'Filtro com estado', ajuda: 'O firewall lembra as conversas que deixou começar e deixa passar a resposta delas. Sem isso, a volta precisa de regra própria (e essa regra costuma abrir demais).', contexto: ctx, campos: [escolha('v', 'Filtro com estado', [op('on', 'ligado'), op('off', 'desligado')], fw?.comEstado ? 'off' : 'on')], comandos: (v) => [`firewall estado ${v.v}`] },
      {
        id: 'sg-fw-regra',
        rotulo: 'Acrescentar regra ao firewall',
        ajuda: 'Casa por protocolo, origem, destino, porta, estado da conversa e interface de entrada. Valem em ordem: a primeira que casa decide.',
        contexto: ctx,
        campos: [escolha('acao', 'Ação', [op('permitir'), op('negar')]), escolha('proto', 'Protocolo', [op('tcp'), op('udp'), op('icmp'), op('qualquer')]), texto('de', 'Origem (prefixo ou qualquer)', 'qualquer'), texto('para', 'Destino (prefixo ou qualquer)', 'qualquer'), texto('porta', 'Porta de destino (vazio: qualquer)', '80'), escolha('estado', 'Estado', [op('', 'qualquer'), op('nova', 'só conversa nova'), op('estabelecida', 'só conversa estabelecida')]), escolha('em', 'Entrando por', [op('', 'qualquer interface'), ...portas])],
        comandos: (v) => [`firewall regra ${v.acao} ${v.proto === 'qualquer' ? '' : v.proto} de ${v.de || 'qualquer'} para ${v.para || 'qualquer'}${v.porta && v.proto !== 'icmp' && v.proto !== 'qualquer' ? ` porta ${v.porta}` : ''}${v.estado ? ` estado ${v.estado}` : ''}${v.em ? ` em ${v.em}` : ''}`.replace(/\s+/g, ' ')],
      },
      { id: 'sg-fw-apagar', rotulo: 'Apagar regra do firewall', ajuda: 'Tira uma regra (ou todas). As outras continuam na mesma ordem.', contexto: ctx, campos: [fw?.regras.length ? escolha('id', 'Regra', [...fw.regras.map((r) => op(String(r.id), `${r.id}: ${textoRegra(r).replace(/\s+/g, ' ')}`)), op('tudo', 'todas')]) : texto('id', 'Regra (id ou tudo)', 'tudo')], comandos: (v) => [`firewall apagar ${v.id || 'tudo'}`] },
      { id: 'sg-fw-log', rotulo: 'Ver o que o firewall decidiu', ajuda: 'As últimas decisões: que conversa, que regra, passou ou não.', contexto: ctx, comandos: () => ['firewall log'] },
      { id: 'sg-ids', rotulo: 'Ligar IDS ou IPS', ajuda: 'IDS observa e alerta; IPS fica no caminho e bloqueia. Assinaturas pegam padrões conhecidos (varredura, inundação de SYN, texto no conteúdo); anomalia pega taxa fora do normal.', contexto: ctx, campos: [escolha('modo', 'Modo', [op('ids', 'IDS (só alerta)'), op('ips', 'IPS (bloqueia)')], idsDe(e)?.modo)], comandos: (v) => [`ids ${v.modo}`] },
      { id: 'sg-ids-limiar', rotulo: 'Limiares do IDS', ajuda: 'Baixo demais, alarme falso; alto demais, ataque passa. Varredura em portas distintas, inundação em SYN por segundo, anomalia em pacotes por segundo.', contexto: ctx, campos: [escolha('qual', 'Limiar', [op('varredura', 'varredura (portas)'), op('syn', 'inundação (SYN/s)'), op('taxa', 'anomalia (pacotes/s)')]), numero('n', 'Valor', undefined, '10')], comandos: (v) => [`ids limiar ${v.qual} ${v.n || 10}`] },
      { id: 'sg-ids-assinatura', rotulo: 'Nova assinatura de conteúdo', ajuda: 'Um texto que, aparecendo no conteúdo em claro, dispara o alerta. Conteúdo cifrado passa sem a assinatura ver.', contexto: ctx, campos: [texto('nome', 'Nome', 'acesso-ao-painel'), texto('padrao', 'Texto procurado', '/admin')], comandos: (v) => [`ids assinatura ${v.nome || 'nova'} ${v.padrao || '/admin'}`] },
      { id: 'sg-ids-alertas', rotulo: 'Ver os alertas', ajuda: 'O que o IDS viu, por quê e o que fez.', contexto: ctx, comandos: () => ['ids alertas'] },
      { id: 'sg-antifalsificacao', rotulo: 'Filtro antifalsificação (BCP 38)', ajuda: 'Pacote que chega por uma interface com origem que a rota de volta não mandaria por ela é falsificado: descarta.', contexto: ctx, campos: [escolha('v', 'Filtro', [op('on', 'ligado'), op('off', 'desligado')], e.s.antiFalsificacao ? 'off' : 'on')], comandos: (v) => [`antifalsificacao ${v.v}`] },
      { id: 'sg-vpn', rotulo: 'Túnel VPN (IPsec) com outro roteador', ajuda: 'O que vai da rede daqui para a de lá entra cifrado em ESP até a outra ponta. A outra ponta precisa do túnel espelhado, com o mesmo segredo. O MTU efetivo cai.', contexto: ctx, campos: [texto('nome', 'Nome', 'matriz'), outros.length ? escolha('par', 'Outra ponta', outros) : texto('par', 'Outra ponta', '198.51.100.2'), texto('local', 'Rede daqui', '192.168.1.0/24'), texto('remota', 'Rede de lá', '192.168.2.0/24'), texto('segredo', 'Segredo pré-compartilhado', 'Frase-longa-do-tunel-2026')], comandos: (v) => [`vpn ${v.nome || 'matriz'} ${v.par} ${v.local} ${v.remota} ${v.segredo || 'segredo'}`] },
      { id: 'sg-vpn-ver', rotulo: 'Ver os túneis', ajuda: 'IKE, associação de segurança, contadores e o MTU efetivo de cada túnel.', contexto: ctx, comandos: () => ['vpn'] },
      { id: 'sg-vpn-captura', rotulo: 'O que o meio do caminho vê do túnel', ajuda: 'O último pacote do túnel visto de fora: só os IPs das pontas e o ESP cifrado.', contexto: ctx, comandos: () => ['vpn captura'] },
      { id: 'sg-bgp-sequestro', rotulo: 'Sequestro de BGP (anunciar prefixo dos outros)', ajuda: 'Anunciar um prefixo que não é seu, ou um pedaço mais específico dele, puxa o tráfego para cá: o mais específico vence em todo lugar. Defesa: filtrar o que o cliente anuncia e conferir a origem (RPKI).', contexto: ctx, campos: [texto('p', 'Prefixo', '203.0.113.0/25')], comandos: (v) => [`bgp anunciar ${v.p || '203.0.113.0/25'}`, 'mostra bgp'] },
      { id: 'sg-wifi-rede', rotulo: 'Rede sem fio deste roteador', ajuda: 'Aberta não tem cifra; WPA2 deriva a chave da senha e cai num dicionário se a senha for fraca; WPA3 (SAE) não deixa testar senha fora do ar.', contexto: ctx, campos: [texto('ssid', 'Nome da rede', wifiDe(e)?.ssid ?? 'LAB-Visitantes'), escolha('seg', 'Segurança', [op('wpa2', 'WPA2'), op('wpa3', 'WPA3'), op('aberta', 'aberta')]), texto('senha', 'Senha', 'futebol123')], comandos: (v) => [`wifi ${v.ssid || 'LAB'} ${v.seg}${v.seg === 'aberta' ? '' : ` ${v.senha || 'futebol123'}`}`] },
    ];
    return a;
  }
  if (e.tipo === 'switch') {
    return [
      { id: 'sg-sw-espelho', rotulo: 'Espelhar o tráfego numa porta', ajuda: 'Porta de monitoramento (SPAN): recebe cópia de tudo que passa pelo switch. Útil para o IDS, perigosa se cair na mão errada.', contexto: ctx, campos: [escolha('porta', 'Porta que recebe a cópia', e.portas.map((p) => op(p.nome)), e.portas[e.portas.length - 1]?.nome)], comandos: (v) => [`espelhar ${v.porta}`] },
      { id: 'sg-sw-dai', rotulo: 'Inspeção de ARP', ajuda: 'O switch confere as respostas ARP com quem recebeu qual endereço e descarta as mentirosas. Derruba o ARP falso na porta.', contexto: ctx, campos: [escolha('v', 'Inspeção', [op('on', 'ligada'), op('off', 'desligada')], e.s.inspecaoArp ? 'off' : 'on')], comandos: (v) => [`inspecao-arp ${v.v}`] },
    ];
  }
  if (e.tipo === 'ap') {
    return [{ id: 'sg-wifi-ap', rotulo: 'Segurança da rede sem fio', ajuda: 'Aberta, WPA2 ou WPA3. No WPA2, senha curta e comum cai num dicionário a partir do aperto de mão capturado.', contexto: ctx, campos: [texto('ssid', 'Nome da rede', wifiDe(e)?.ssid ?? 'LAB-Visitantes'), escolha('seg', 'Segurança', [op('wpa2', 'WPA2'), op('wpa3', 'WPA3'), op('aberta', 'aberta')]), texto('senha', 'Senha', 'futebol123')], comandos: (v) => [`wifi ${v.ssid || 'LAB'} ${v.seg}${v.seg === 'aberta' ? '' : ` ${v.senha || 'futebol123'}`}`] }];
  }
  if (e.tipo !== 'pc') return [];
  const redes = pontosWifi(m).map((x) => op(wifiDe(x)!.ssid));
  const ssid = () => (redes.length ? escolha('ssid', 'Rede', redes) : texto('ssid', 'Rede', 'LAB-Visitantes'));
  const rec = ipsDe(m, e.nome, (x) => !!servicosDe(x)?.dns?.recursivo);
  return [
    { id: 'sg-varrer', rotulo: 'Varredura de portas', ajuda: 'Manda SYN para várias portas: SYN+ACK quer dizer aberta, RST fechada, silêncio filtrada. Só no laboratório: fora dele, sem autorização, é crime.', contexto: ctx, campos: [campoIp(m, e, 'ip', 'Alvo', '203.0.113.10'), texto('portas', 'Portas', '1-1024')], comandos: (v) => [`varrer ${v.ip} ${v.portas || '1-1024'}`] },
    { id: 'sg-farejar', rotulo: 'Farejar a rede', ajuda: 'Placa em modo promíscuo: num hub ou numa porta espelhada, ouve todo mundo. Mostra o que o tráfego sem cifra revela.', contexto: ctx, comandos: () => ['farejar'] },
    { id: 'sg-arp-falso', rotulo: 'Envenenar o ARP (homem no meio)', ajuda: 'Respostas ARP falsas: a vítima passa a mandar para você o que era do gateway. Repassando, ela nem percebe; descartando, fica sem rede.', contexto: ctx, campos: [campoIp(m, e, 'vitima', 'Vítima', '192.168.1.11', (x) => x.tipo === 'pc'), campoIp(m, e, 'fingido', 'Fingir ser', '192.168.1.1', (x) => x.tipo === 'roteador'), escolha('modo', 'Depois', [op('repassar', 'repassar (homem no meio)'), op('derrubar', 'descartar (negação de serviço)')])], comandos: (v) => [`arp-falso ${v.vitima} ${v.fingido}${v.modo === 'derrubar' ? ' derrubar' : ''}`] },
    { id: 'sg-arp-estatico', rotulo: 'Fixar o ARP do gateway (defesa)', ajuda: 'Entrada ARP estática: resposta falsa nenhuma muda o MAC desse endereço.', contexto: ctx, campos: [texto('ip', 'Endereço', (e.s.gateway as string | undefined) ?? '192.168.1.1')], comandos: (v) => [`arp-estatico ${v.ip}`, 'mostra arp'] },
    { id: 'sg-ip-falso', rotulo: 'Mandar pacote com origem falsificada', ajuda: 'O IP não confere a origem. A resposta vai para o dono do endereço forjado, não para quem mandou. O filtro de entrada do provedor (BCP 38) barra.', contexto: ctx, campos: [texto('forjado', 'Origem forjada', '198.51.100.99'), campoIp(m, e, 'ip', 'Destino', '203.0.113.10'), numero('porta', 'Porta', undefined, '80')], comandos: (v) => [`ip-falso ${v.forjado || '198.51.100.99'} ${v.ip} ${v.porta || 80}`] },
    { id: 'sg-inundar', rotulo: 'Inundação de SYN', ajuda: 'Muitos SYN e nenhum ACK: a fila de conexões meio abertas do servidor enche e quem chega de verdade não entra. SYN cookies resolvem.', contexto: ctx, campos: [campoIp(m, e, 'ip', 'Alvo', '203.0.113.10'), numero('porta', 'Porta', undefined, '80'), numero('taxa', 'SYN por segundo', undefined, '1000'), escolha('falso', 'Origem', [op('', 'a minha'), op('falsificado', 'falsificada')])], comandos: (v) => [`inundar ${v.ip} ${v.porta || 80} ${v.taxa || 1000}${v.falso ? ' falsificado' : ''}`] },
    { id: 'sg-ddos', rotulo: 'Negação de serviço distribuída', ajuda: 'Centenas de máquinas zumbis ao mesmo tempo: além da fila, o cano enche. Bloquear origem não adianta; precisa do provedor.', contexto: ctx, campos: [campoIp(m, e, 'ip', 'Alvo', '203.0.113.10'), numero('porta', 'Porta', undefined, '80'), numero('zumbis', 'Máquinas zumbis', undefined, '500'), numero('pps', 'Pacotes por segundo de cada', undefined, '100')], comandos: (v) => [`ddos ${v.ip} ${v.porta || 80} ${v.zumbis || 500} ${v.pps || 100}`] },
    { id: 'sg-parar', rotulo: 'Parar os ataques', ajuda: 'Desfaz o ARP falso e as inundações que partiram daqui.', contexto: ctx, comandos: () => ['parar-ataque'] },
    { id: 'sg-syncookies', rotulo: 'SYN cookies (defesa do servidor)', ajuda: 'O servidor responde o SYN sem guardar estado: a inundação não enche a fila.', contexto: ctx, campos: [escolha('v', 'SYN cookies', [op('on', 'ligados'), op('off', 'desligados')], e.s.synCookies ? 'off' : 'on')], comandos: (v) => [`syncookies ${v.v}`] },
    { id: 'sg-envenenar-dns', rotulo: 'Envenenar o cache de um resolvedor', ajuda: 'Respostas forjadas tentando acertar o id da consulta (e a porta). Se uma acerta, o resolvedor guarda o endereço falso. DNSSEC com validação derruba.', contexto: ctx, campos: [rec.length ? escolha('r', 'Resolvedor', rec) : texto('r', 'Resolvedor', '192.168.1.53'), texto('nome', 'Nome', 'www.loja.exemplo'), texto('falso', 'Endereço falso', '198.51.100.66')], comandos: (v) => [`envenenar-dns ${v.r} ${v.nome || 'www.loja.exemplo'} ${v.falso || '198.51.100.66'}`] },
    { id: 'sg-wifi-conectar', rotulo: 'Conectar numa rede sem fio', ajuda: 'WPA2: aperto de mão de 4 vias com a chave derivada da senha. WPA3: SAE antes, que não entrega nada útil para quem escuta.', contexto: ctx, campos: [ssid(), texto('senha', 'Senha', 'futebol123')], comandos: (v) => [`wifi conectar ${v.ssid} ${v.senha || 'futebol123'}`] },
    { id: 'sg-wifi-capturar', rotulo: 'Capturar o aperto de mão do Wi-Fi', ajuda: 'Desautentica os clientes (no WPA2 ninguém confere esse quadro) e pega o aperto de mão quando reconectam.', contexto: ctx, campos: [ssid()], comandos: (v) => [`wifi desautenticar ${v.ssid}`, `wifi capturar ${v.ssid}`] },
    { id: 'sg-wifi-quebrar', rotulo: 'Testar senhas de um dicionário', ajuda: 'Para cada palavra, refaz a chave e o MIC e compara com o capturado, sem falar com ninguém. Senha comum cai em segundos.', contexto: ctx, campos: [ssid(), texto('palavras', 'Palavras (vazio: dicionário pequeno)', '')], comandos: (v) => [`wifi quebrar ${v.ssid}${v.palavras ? ' ' + v.palavras : ''}`] },
    { id: 'sg-cesar', rotulo: 'Cifra de César', ajuda: 'Cada letra anda a mesma quantidade de casas. Só 25 chaves: força bruta ou frequência das letras quebram.', contexto: ctx, campos: [numero('k', 'Chave', undefined, '3'), texto('t', 'Texto', 'ATAQUE AO AMANHECER')], comandos: (v) => [`cesar ${v.k || 3} ${v.t || 'ATAQUE'}`] },
    { id: 'sg-quebrar-cesar', rotulo: 'Quebrar César pela frequência', ajuda: 'Compara a frequência das letras de cada deslocamento com a do português.', contexto: ctx, campos: [texto('t', 'Texto cifrado', 'DWDTXH DR DPDQKHFHU')], comandos: (v) => [`quebrar-cesar ${v.t || 'DWDTXH DR DPDQKHFHU'}`] },
    { id: 'sg-rsa', rotulo: 'RSA pequeno', ajuda: 'Dois primos, n = p × q, e e d inversos módulo φ(n). Cifra com a pública, decifra com a privada.', contexto: ctx, campos: [numero('p', 'Primo p', undefined, '61'), numero('q', 'Primo q', undefined, '53'), numero('m', 'Mensagem (número)', undefined, '65')], comandos: (v) => [`rsa ${v.p || 61} ${v.q || 53} ${v.m || 65}`] },
    { id: 'sg-sha256', rotulo: 'Resumo SHA-256', ajuda: 'Qualquer tamanho vira 256 bits. Uma letra muda tudo.', contexto: ctx, campos: [texto('t', 'Texto', 'camada 8')], comandos: (v) => [`sha256 ${v.t || 'camada 8'}`] },
    { id: 'sg-assinar', rotulo: 'Assinar e conferir', ajuda: 'Resume, assina o resumo com a chave privada e confere com a pública. Mudou o texto, não confere mais.', contexto: ctx, campos: [texto('t', 'Texto', 'Pago 100 a quem trouxer o cabo')], comandos: (v) => [`assinar ${v.t || 'teste'}`] },
    { id: 'sg-cadeia', rotulo: 'Conferir uma cadeia de certificados', ajuda: 'Nome, validade, revogação, quem assinou quem, até uma raiz confiável.', contexto: ctx, campos: [texto('nome', 'Nome', 'www.loja.exemplo'), escolha('tipo', 'Certificado', TIPOS_CERTIFICADO.map((x) => op(x)))], comandos: (v) => [`verificar-cadeia ${v.nome || 'www.loja.exemplo'} ${v.tipo}`] },
    { id: 'sg-kerberos', rotulo: 'Kerberos passo a passo', ajuda: 'Bilhete de concessão, bilhete de serviço e autenticação mútua, sem a senha passar pela rede.', contexto: ctx, campos: [texto('u', 'Usuário', 'ana'), texto('s', 'Senha digitada', 'Ana-2026!'), texto('c', 'Senha cadastrada', 'Ana-2026!')], comandos: (v) => [`kerberos ${v.u || 'ana'} ${v.s || 'x'} ${v.c || v.s || 'x'}`] },
    { id: 'sg-dh', rotulo: 'Diffie-Hellman (e o homem no meio)', ajuda: 'Duas pessoas chegam à mesma chave sem ela passar pelo fio. Sem autenticação, quem está no meio fecha uma chave com cada lado.', contexto: ctx, campos: [numero('a', 'Segredo de Alice', undefined, '6'), numero('b', 'Segredo de Bob', undefined, '15'), texto('m', 'Segredo do atacante (vazio: sem ataque)', '')], comandos: (v) => [`dh ${v.a || 6} ${v.b || 15}${v.m ? ` ${v.m}` : ''}`] },
    { id: 'sg-pgp', rotulo: 'Gerar chaves PGP', ajuda: 'Par de chaves para assinar e cifrar correio. A pública vai para os outros; a privada fica aqui.', contexto: ctx, comandos: () => ['pgp gerar', 'pgp'] },
    { id: 'sg-correio-seguro', rotulo: 'Mandar e-mail assinado e cifrado', ajuda: 'PGP: assina com a sua chave privada e cifra com a pública de quem recebe. No fio e no servidor, o corpo é ilegível.', contexto: ctx, campos: [texto('para', 'Para', 'contato@escola.exemplo'), texto('assunto', 'Assunto', 'Notas'), texto('corpo', 'Texto', 'As notas saem amanhã.')], comandos: (v) => [`correio enviar-seguro ${v.para} ${v.assunto || 'Teste'} | ${v.corpo || ''}`] },
    { id: 'sg-sandbox', rotulo: 'Rodar código não confiável', ajuda: 'O mesmo programa dentro e fora de uma caixa de areia: o que ele tenta e o que consegue.', contexto: ctx, campos: [escolha('p', 'Programa', Object.entries(PROGRAMAS).map(([k, v]) => op(k, v.descricao))), escolha('modo', 'Como', [op('sandbox', 'na sandbox'), op('direto', 'direto')])], comandos: (v) => [`executar ${v.p} ${v.modo}`] },
  ];
}
