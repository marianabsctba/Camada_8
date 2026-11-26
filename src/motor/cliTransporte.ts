// Comandos de console e ações da camada de transporte (ato 5), no PC: soquetes, escuta, conexão, transferência TCP
// com a janela ao longo do tempo, UDP, RPC, RTP, QUIC, justiça entre fluxos, teste de velocidade e desempenho.
// Cada resultado vai para m.flags (tcp, udp, rpc, rtp, quic, justica, velocidade, comparacao, desempenho, rto...)
// junto com a configuração usada, para o dia conferir que veio da configuração de agora.

import type { Acao, Campo, Opcao } from './acoes';
import type { Equipamento, Mundo } from './mundo';
import { interfacesL3 } from './roteamento';
import { ipTexto, lerIp, lerNumero } from './util';
import {
  bdpBytes,
  calcularRto,
  escalaNecessaria,
  entreguesEntre,
  hexa,
  janelaEm,
  montarCabecalhoTcp,
  montarCabecalhoUdp,
  MSL,
  simularJanelaBoba,
  simularNagle,
  simularTcp,
  tempoVoltaSeq,
  textoFlags,
  TRANSICOES,
  vazaoComPerda,
  vazaoJanela,
  indiceJain,
  checksumConfere,
  type AlgoritmoCc,
  type ConfigTcp,
  type ResultadoTcp,
  type SegmentoTcp,
} from './tcp';
import { chamarRpc, compactacao, enviarDatagramas, simularRtp } from './udp';
import { compararCabecaDeFila, estabelecimento, simularMigracao } from './quic';
import {
  assinaturaTcp,
  caminhoTransporte,
  conectar,
  configTcp,
  demultiplexar,
  escutar,
  fecharConexao,
  gargaloDo,
  ipPrincipal,
  pararDeEscutar,
  portaEfemera,
  primitiva,
  soquetesDe,
  temTransporte,
  type CaminhoMundo,
  type Conexao,
  type Protocolo,
} from './transporte';

type Saida = string[];

const num = (x: number, casas = 2) => x.toFixed(casas).replace('.', ',');
const msTxt = (s: number) => `${num(s * 1000, s * 1000 < 10 ? 3 : 1)} ms`;
const mbps = (bps: number) => `${num(bps / 1e6, 2)} Mb/s`;
const r4 = (x: number) => Number(x.toFixed(4));

function ligado(v: string | undefined): boolean | null {
  return v === 'on' || v === 'liga' || v === 'sim' ? true : v === 'off' || v === 'desliga' || v === 'nao' ? false : null;
}

/** "1500", "64k" (mil), "2M", "1G", "64KiB", "1MiB". */
export function lerBytes(txt: string | undefined): number | null {
  if (!txt) return null;
  const m = /^(\d+(?:[.,]\d+)?)\s*(k|kb|m|mb|g|gb|kib|mib|gib|b)?$/i.exec(txt.trim());
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  const u = (m[2] ?? '').toLowerCase();
  const f: Record<string, number> = { '': 1, b: 1, k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3 };
  const v = Math.round(n * (f[u] ?? 1));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function lerProb(txt: string | undefined): number | null {
  if (!txt) return null;
  const n = lerNumero(txt.replace('%', ''));
  if (n === null || n < 0) return null;
  const p = txt.includes('%') || n >= 1 ? n / 100 : n;
  return p >= 0 && p < 1 ? p : null;
}

function lerDestino(txt: string | undefined, m: Mundo): number | null {
  if (!txt) return null;
  const ip = lerIp(txt);
  if (ip !== null) return ip;
  const e = m.equipamentos.get(txt);
  const i = e ? interfacesL3(e)[0] : undefined;
  return i ? i.cidr.endereco : null;
}

function lerPorta(txt: string | undefined, padrao?: number): number | null {
  if (txt === undefined) return padrao ?? null;
  const n = Number(txt);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

function configParaFlag(c: ConfigTcp) {
  return JSON.parse(JSON.stringify({ ...c, limiar: Number.isFinite(c.limiar) ? c.limiar : 'infinito' }));
}

function resumoCaminho(c: CaminhoMundo): Saida {
  return [
    `Caminho até ${c.ipDestino} (${c.servidor?.nome}): ${c.roteadores.length ? `${c.roteadores.length} roteador(es) (${c.roteadores.join(', ')})` : 'mesma rede'}, RTT ${msTxt(c.rtt)}, gargalo ${c.gargalo.mbps} Mb/s na saída ${c.gargalo.de}:${c.gargalo.porta} com buffer de ${c.buffer} pacotes${c.perda > 0 ? `, perda por erro de bit ${num(c.perda * 100, 3)} %` : ''}.`,
  ];
}

/* ---------- Configuração ---------- */

const ALGORITMOS: AlgoritmoCc[] = ['reno', 'cubic', 'bbr'];

function mostraTcp(e: Equipamento): Saida {
  const c = configTcp(e);
  const x = (e.s.caminhoTransporte ?? {}) as { perda?: number; buffer?: number; atraso?: number };
  return [
    'CONFIGURAÇÃO TCP',
    `  MSS ${c.mss} bytes, buffer do receptor ${c.janela} bytes, escala de janela ${c.escala} (janela máxima anunciável ${Math.min(c.janela, 65535 * 2 ** c.escala)} bytes)`,
    `  controle de congestionamento ${c.algoritmo.toUpperCase()}, janela inicial ${c.janelaInicial} segmento(s), limiar inicial ${Number.isFinite(c.limiar) ? `${c.limiar} bytes` : 'sem limite'}`,
    `  Nagle ${c.nagle ? 'ligado' : 'desligado'}, ACK atrasado ${c.ackAtrasado ? 'ligado' : 'desligado'}, evitar janela boba ${c.sws ? 'ligado' : 'desligado'}, SACK ${c.sack ? 'ligado' : 'desligado'}, RTO mínimo ${num(c.rtoMin * 1000, 0)} ms`,
    `  aplicação que recebe: ${c.leitura ? `lê ${c.leitura.bytes} bytes a cada ${num(c.leitura.intervalo * 1000, 1)} ms` : 'lê na hora'}${c.pausaLeitura ? `, para de ler de ${c.pausaLeitura[0]} s a ${c.pausaLeitura[1]} s` : ''}`,
    `  simulação do caminho: ${x.perda ? `perda aleatória extra de ${num(x.perda * 100, 2)} % (meio sem fio)` : 'sem perda extra'}${x.buffer ? `, buffer do gargalo forçado em ${x.buffer} pacotes` : ''}${x.atraso ? `, atraso extra de ${num(x.atraso * 1000, 1)} ms por sentido` : ''}`,
  ];
}

function cmdTcpOpcao(m: Mundo, e: Equipamento, args: string[]): Saida | null {
  const [op, v1, v2] = args;
  const t = ((e.s.tcp as Partial<ConfigTcp> | undefined) ??= {});
  const cam = ((e.s.caminhoTransporte as { perda?: number; buffer?: number; atraso?: number } | undefined) ??= {});
  const onOff = (campo: 'nagle' | 'ackAtrasado' | 'sws' | 'sack', texto: [string, string]) => {
    const b = ligado(v1);
    if (b === null) return [`tcp ${op} <on|off>`];
    t[campo] = b;
    return [b ? texto[0] : texto[1]];
  };
  switch (op) {
    case 'mss': {
      const n = Number(v1);
      if (!Number.isInteger(n) || n < 88 || n > 9000) return ['tcp mss <88 a 9000 bytes>. No Ethernet, 1500 de MTU menos 40 de cabeçalhos dá 1460.'];
      t.mss = n;
      return [`MSS ${n} bytes: cada segmento leva no máximo isso de dados, mais 40 de cabeçalho IP e TCP (${num((n / (n + 40)) * 100, 1)} % de aproveitamento). O MSS vai como opção no SYN.`];
    }
    case 'janela': {
      const n = lerBytes(v1);
      if (n === null || n < 1 || n > 1 << 30) return ['tcp janela <bytes do buffer do receptor, até 1 GiB>. Ex.: tcp janela 64k'];
      t.janela = n;
      const max = 65535 * 2 ** (t.escala ?? 0);
      return [`Buffer do receptor: ${n} bytes. É o máximo que ele pode anunciar na janela (controle de fluxo).${n > max ? ` Sem escala de janela suficiente, o campo de 16 bits para em ${max}: use "tcp escala ${escalaNecessaria(n)}".` : ''}`];
    }
    case 'escala': {
      const n = Number(v1);
      if (!Number.isInteger(n) || n < 0 || n > 14) return ['tcp escala <0 a 14>: a janela anunciada vale o campo de 16 bits vezes 2 elevado a isso.'];
      t.escala = n;
      return [`Escala de janela ${n}: a janela máxima anunciável vai a ${65535 * 2 ** n} bytes. Combinada no SYN; se um lado não manda a opção, nenhum usa.`];
    }
    case 'algoritmo':
    case 'cc': {
      if (!ALGORITMOS.includes(v1 as AlgoritmoCc)) return ['tcp algoritmo <reno|cubic|bbr>'];
      t.algoritmo = v1 as AlgoritmoCc;
      return [{ reno: 'Reno: partida lenta, prevenção de congestionamento (sobe 1 segmento por RTT, corta pela metade na perda), retransmissão e recuperação rápidas.', cubic: 'CUBIC: depois de uma perda, a janela volta para perto do máximo antigo numa curva cúbica, devagar perto dele e rápido longe. Corta para 70 % na perda. Padrão no Linux.', bbr: 'BBR: em vez de esperar perda, mede a banda do gargalo e o RTT mínimo e manda no ritmo da banda, com no máximo 2 BDP em voo. Perda sozinha não faz ele diminuir.' }[v1 as AlgoritmoCc]];
    }
    case 'nagle':
      return onOff('nagle', ['Nagle ligado: enquanto houver dado sem confirmação, os pedaços pequenos que a aplicação escreve esperam juntos e saem num segmento só.', 'Nagle desligado (TCP_NODELAY): cada escrita sai na hora, mesmo de 1 byte. Bom para jogo e terminal remoto, ruim para a rede.']);
    case 'ack-atrasado':
      return onOff('ackAtrasado', ['ACK atrasado: o receptor confirma a cada dois segmentos ou depois de 200 ms. Metade dos ACKs, mas a partida lenta cresce mais devagar.', 'ACK atrasado desligado: um ACK por segmento.']);
    case 'sws':
    case 'janela-boba':
      if (args.length === 1 && op === 'janela-boba') return null;
      return onOff('sws', ['Contra a janela boba: o receptor só anuncia janela nova quando abre pelo menos 1 MSS ou metade do buffer (Clark), e o emissor não manda migalha.', 'Sem proteção contra janela boba: cada byte lido vira anúncio de janela pequena, e o emissor manda segmentos minúsculos.']);
    case 'sack':
      return onOff('sack', ['SACK ligado: o receptor conta quais blocos chegaram fora de ordem, e o emissor retransmite só os buracos.', 'SACK desligado: só o ACK acumulativo; várias perdas na mesma janela se recuperam uma por RTT.']);
    case 'iw': {
      const n = Number(v1);
      if (!Number.isInteger(n) || n < 1 || n > 100) return ['tcp iw <1 a 100 segmentos>: janela inicial de congestionamento.'];
      t.janelaInicial = n;
      return [`Janela inicial: ${n} segmento(s). O padrão moderno é 10; com 1 dá para ver a partida lenta dobrando: 1, 2, 4, 8...`];
    }
    case 'limiar': {
      if (v1 === 'infinito' || v1 === 'off') {
        delete t.limiar;
        return ['Limiar inicial sem limite: a partida lenta vai até a primeira perda.'];
      }
      const n = lerBytes(v1);
      if (n === null || n < 2) return ['tcp limiar <bytes|infinito>. Ex.: tcp limiar 32k'];
      t.limiar = n;
      return [`Limiar inicial ${n} bytes (${num(n / (t.mss ?? 1460), 1)} segmentos): até ali, partida lenta (dobra por RTT); dali em diante, prevenção de congestionamento (1 segmento por RTT).`];
    }
    case 'rto-min': {
      const n = lerNumero(v1 ?? '');
      if (n === null || n < 1 || n > 5000) return ['tcp rto-min <ms>. O Linux usa 200; a RFC 6298 pede 1000.'];
      t.rtoMin = n / 1000;
      return [`RTO mínimo ${n} ms.`];
    }
    case 'leitura': {
      if (v1 === 'instantanea' || v1 === 'off') {
        delete t.leitura;
        return ['A aplicação que recebe volta a ler tudo na hora: o buffer nunca enche.'];
      }
      const b = lerBytes(v1);
      const ms = lerNumero(v2 ?? '');
      if (b === null || ms === null || ms <= 0) return ['tcp leitura <bytes> <a cada ms> | tcp leitura instantanea. Ex.: tcp leitura 1 1 (um byte por milissegundo, o pesadelo da janela boba)'];
      t.leitura = { bytes: b, intervalo: ms / 1000 };
      return [`A aplicação que recebe lê ${b} bytes a cada ${ms} ms (${mbps((b * 8) / (ms / 1000))}). Se a rede entrega mais rápido, o buffer enche e a janela fecha.`];
    }
    case 'pausa': {
      if (v1 === 'off') {
        delete t.pausaLeitura;
        return ['Sem pausa na leitura.'];
      }
      const a = lerNumero(v1 ?? '');
      const b = lerNumero(v2 ?? '');
      if (a === null || b === null || b <= a || a < 0) return ['tcp pausa <início s> <fim s> | tcp pausa off: a aplicação que recebe para de ler nesse intervalo.'];
      t.pausaLeitura = [a, b];
      if (!t.leitura) t.leitura = { bytes: 64 * 1024, intervalo: 0.001 };
      return [`Entre ${a} s e ${b} s a aplicação não lê nada: o buffer de ${configTcp(e).janela} bytes enche, o receptor anuncia janela zero, e o emissor fica mandando sondas até abrir.`];
    }
    case 'perda': {
      if (v1 === 'off') {
        delete cam.perda;
        return ['Sem perda extra no caminho.'];
      }
      const p = lerProb(v1);
      if (p === null) return ['tcp perda <probabilidade ou %> | tcp perda off. Ex.: tcp perda 2% (um enlace sem fio ruidoso)'];
      cam.perda = p;
      return [`Perda aleatória de ${num(p * 100, 2)} % depois do gargalo, como num enlace sem fio com ruído. O TCP acha que é congestionamento e corta a janela à toa.`];
    }
    case 'atraso': {
      if (v1 === 'off') {
        delete cam.atraso;
        return ['Sem atraso extra: o caminho tem só a propagação dos cabos e o processamento dos roteadores.'];
      }
      const n = lerNumero(v1 ?? '');
      if (n === null || n < 0 || n > 2000) return ['tcp atraso <ms de cada sentido> | tcp atraso off. Ex.: tcp atraso 20 (RTT 40 ms a mais, como um caminho entre cidades)'];
      cam.atraso = n / 1000;
      return [`Atraso extra de ${n} ms em cada sentido (RTT ${2 * n} ms a mais), como um emulador de rede no caminho. Os cabos do laboratório são curtos demais para o produto banda × atraso aparecer sozinho.`];
    }
    case 'buffer': {
      if (v1 === 'auto' || v1 === 'off') {
        delete cam.buffer;
        return ['Buffer do gargalo: o da fila configurada no roteador (ou 64 pacotes).'];
      }
      const n = Number(v1);
      if (!Number.isInteger(n) || n < 1 || n > 100000) return ['tcp buffer <pacotes> | tcp buffer auto: força o buffer do gargalo na simulação.'];
      cam.buffer = n;
      return [`Buffer do gargalo forçado em ${n} pacotes para a simulação. Buffer grande demais vira atraso (bufferbloat) para quem enche a fila.`];
    }
    case 'padrao':
    case 'padrão':
      delete e.s.tcp;
      delete e.s.caminhoTransporte;
      return ['Configuração TCP de volta ao padrão.', ...mostraTcp(e)];
  }
  return null;
}

/* ---------- Saídas de transferência ---------- */

function tabelaJanela(r: ResultadoTcp, linhasMax = 14): Saida {
  const f = r.fluxos[0]!;
  const fim = f.fim ?? r.duracao;
  const ini = f.inicio;
  const l = ['JANELA DE CONGESTIONAMENTO AO LONGO DO TEMPO (segmentos)', '      t        cwnd  limiar  fase'];
  const maxW = Math.max(1, ...f.janela.map((p) => p.cwnd));
  for (let k = 0; k <= linhasMax; k++) {
    const t = ini + ((fim - ini) * k) / linhasMax;
    const p = [...f.janela].reverse().find((x) => x.t <= t + 1e-12) ?? f.janela[0];
    if (!p) continue;
    const barra = '#'.repeat(Math.max(1, Math.round((p.cwnd / maxW) * 30)));
    l.push(`  ${msTxt(t).padStart(11)} ${num(p.cwnd, 1).padStart(7)} ${(Number.isFinite(p.limiar) ? num(p.limiar, 0) : '∞').padStart(7)}  ${p.fase.padEnd(30)} ${barra}`);
  }
  return l;
}

function serieCompacta(r: ResultadoTcp, n = 200): [number, number][] {
  const f = r.fluxos[0]!;
  const fim = f.fim ?? r.duracao;
  const out: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const t = f.inicio + ((fim - f.inicio) * k) / n;
    out.push([r4(t * 1000), r4(janelaEm(f, t))]);
  }
  return out;
}

function resumoFluxo(r: ResultadoTcp) {
  const f = r.fluxos[0]!;
  return {
    concluiu: f.concluiu,
    entregues: f.entregues,
    duracaoMs: r4(f.duracao * 1000),
    vazaoMbps: r4(f.vazaoMbps),
    segmentos: f.segmentos,
    transmissoes: f.transmissoes,
    retransmissoes: f.retransmissoes,
    timeouts: f.timeouts,
    retransRapidas: f.retransRapidas,
    ackDuplicados: f.ackDuplicados,
    janelasZero: f.janelasZero,
    sondas: f.sondas,
    migalhas: f.migalhas,
    karnDescartadas: f.karnDescartadas,
    janelaMax: r4(Math.max(0, ...f.janela.map((p) => p.cwnd))),
    rtoMaxMs: r4(f.maxRto * 1000),
    srttMs: f.rttAmostras.length ? r4(f.rttAmostras[f.rttAmostras.length - 1]!.srtt * 1000) : null,
    perdasFila: r.perdasFila,
    perdasAleatorias: r.perdasAleatorias,
    filaMedia: r4(r.filaMedia),
    filaMax: r.filaMax,
    atrasoFilaMs: r4(r.atrasoFilaMedio * 1000),
    eventos: Object.fromEntries(['timeout', 'retransmissao-rapida', 'janela-zero', 'sonda', 'fim-partida-lenta', 'perda-fila', 'perda-aleatoria', 'bbr-fase'].map((k) => [k, r.eventos.filter((x) => x.tipo === k).length])),
  };
}

function linhasResultado(r: ResultadoTcp, c: CaminhoMundo, cfg: ConfigTcp): Saida {
  const f = r.fluxos[0]!;
  const bdp = bdpBytes(c.bandaBps, c.rtt);
  const janelaMax = Math.min(cfg.janela, 65535 * 2 ** cfg.escala);
  const l = [
    f.concluiu ? `RESULTADO: ${f.entregues} bytes em ${msTxt(f.duracao)} = ${mbps(f.vazaoMbps * 1e6)} (gargalo de ${c.gargalo.mbps} Mb/s)` : `RESULTADO: não terminou em ${msTxt(r.duracao)}; ${f.entregues} de ${f.bytes} bytes entregues`,
    `  ${f.segmentos} segmento(s), ${f.transmissoes} transmissão(ões), ${f.retransmissoes} retransmissão(ões): ${f.timeouts} por tempo esgotado, ${f.retransRapidas} rápida(s) por 3 ACKs duplicados`,
    `  perdas: ${r.perdasFila} no buffer do gargalo (congestionamento), ${r.perdasAleatorias} por ruído; fila média ${num(r.filaMedia, 1)} pacote(s), espera média ${msTxt(r.atrasoFilaMedio)}`,
    `  janela máxima ${num(Math.max(0, ...f.janela.map((p) => p.cwnd)), 1)} segmentos; RTO chegou a ${msTxt(f.maxRto)}${f.karnDescartadas ? `; ${f.karnDescartadas} amostra(s) de RTT descartada(s) pelo algoritmo de Karn` : ''}`,
    `  produto banda × atraso: ${Math.round(bdp)} bytes (${num(bdp / cfg.mss, 1)} segmentos). Janela do receptor: ${janelaMax} bytes, o que limita a ${mbps(vazaoJanela(janelaMax, c.rtt))}${janelaMax < bdp ? ': é ela que segura a vazão, não a rede' : ''}.`,
  ];
  if (f.janelasZero) l.push(`  o receptor anunciou janela zero ${f.janelasZero} vez(es); o emissor mandou ${f.sondas} sonda(s) para saber quando abria`);
  if (f.migalhas) l.push(`  ${f.migalhas} segmento(s) menores que o MSS por falta de janela (janela boba)`);
  return l;
}

/** Conecta, transfere e fecha, pelo caminho real e com a configuração do host. */
function transferir(m: Mundo, e: Equipamento, ipN: number, porta: number, bytes: number): Saida {
  const cfg = configTcp(e);
  const cx = conectar(m, e, ipN, porta);
  const base = { de: e.nome, ip: ipTexto(ipN), porta, bytes, config: configParaFlag(cfg), assinatura: assinaturaTcp(e) };
  if (cx.resultado !== 'aberta') {
    m.flags.tcp = { ...base, ok: false, motivo: cx.resultado };
    return [...cx.linhas, cx.resultado === 'recusada' ? 'Nada a transferir: a conexão foi recusada.' : 'Nada a transferir: não houve resposta.'];
  }
  const c = cx.caminho;
  const g = gargaloDo(c, e);
  const r = simularTcp([{ bytes, config: cfg, isn: (e.s.conexao as Conexao).isnCliente }], g, { rttInicial: c.rtt, duracao: 600, semente: Math.floor(m.rng() * 1e9) });
  const cxx = e.s.conexao as Conexao;
  const l: Saida = [...cx.linhas.slice(0, 2), ...cx.linhas.filter((x) => x.includes('ESTABLISHED') || x.includes('NAT')), ...resumoCaminho(c)];
  l.push(primitiva(m, e, `send(${cxx.fdCliente}, ${bytes} bytes): o TCP corta em segmentos de até ${cfg.mss} bytes`));
  l.push(`EVENTOS (${cfg.algoritmo.toUpperCase()}):`, ...r.linhas.slice(0, 24).map((x) => '  ' + x));
  if (r.linhas.length > 24) l.push(`  ... e mais ${r.eventos.length - 24} evento(s)`);
  l.push(...tabelaJanela(r), ...linhasResultado(r, c, cfg));
  l.push(primitiva(m, m.equipamentos.get(cxx.servidor)!, `recv(${cxx.fdServidor}) devolveu ${r.fluxos[0]!.entregues} bytes, em ordem e sem buraco`));
  l.push(...fecharConexao(m, e).slice(0, 1), 'Conexão encerrada com FIN dos dois lados.');
  m.flags.tcp = { ...base, ok: true, algoritmo: cfg.algoritmo, rttMs: r4(c.rtt * 1000), bandaMbps: c.gargalo.mbps, buffer: c.buffer, perda: r4(g.perda ?? 0), ipVisto: c.ipVisto, portaVista: c.portaVista, ...resumoFluxo(r), serie: serieCompacta(r) };
  return l;
}

/** O último "transferir" ainda vale para a configuração de agora? */
export function tcpConfere(m: Mundo): boolean {
  const t = m.flags.tcp as { de: string; assinatura: string } | undefined;
  const e = t && m.equipamentos.get(t.de);
  return !!(t && e && assinaturaTcp(e) === t.assinatura);
}

function enviarNaConexao(m: Mundo, e: Equipamento, bytes: number): Saida {
  const cx = e.s.conexao as Conexao | undefined;
  if (!cx) return ['Nenhuma conexão aberta. Use "conectar <ip> <porta>" primeiro.'];
  const cfg = configTcp(e);
  const c = caminhoTransporte(m, e.nome, lerIp(cx.ipServidor)!, 'tcp', cx.portaLocal, cx.porta);
  if (!c.ok) return [`O caminho caiu: ${c.falha}`];
  const r = simularTcp([{ bytes, config: cfg }], gargaloDo(c, e), { rttInicial: c.rtt, duracao: 600, semente: Math.floor(m.rng() * 1e9) });
  e.s.enviados = ((e.s.enviados as number | undefined) ?? 0) + r.fluxos[0]!.entregues;
  m.flags.tcp = { de: e.nome, ip: cx.ipServidor, porta: cx.porta, bytes, config: configParaFlag(cfg), assinatura: assinaturaTcp(e), ok: true, algoritmo: cfg.algoritmo, rttMs: r4(c.rtt * 1000), bandaMbps: c.gargalo.mbps, buffer: c.buffer, ...resumoFluxo(r), serie: serieCompacta(r) };
  return [primitiva(m, e, `send(${cx.fdCliente}, ${bytes} bytes)`), ...r.linhas.slice(0, 16).map((x) => '  ' + x), ...tabelaJanela(r, 10), ...linhasResultado(r, c, cfg), primitiva(m, m.equipamentos.get(cx.servidor)!, `recv(${cx.fdServidor}) devolveu ${r.fluxos[0]!.entregues} bytes`)];
}

/* ---------- UDP, RPC, RTP ---------- */

function perdaPorTamanho(c: CaminhoMundo, e: Equipamento, bytes: number): number {
  const ber = c.perda > 0 ? -Math.log(1 - c.perda) / (1500 * 8) : 0;
  const pb = 1 - Math.exp(-ber * (bytes + 28 + 38) * 8);
  const extra = ((e.s.caminhoTransporte as { perda?: number } | undefined) ?? {}).perda ?? 0;
  return 1 - (1 - pb) * (1 - extra);
}

function caminhoUdp(m: Mundo, e: Equipamento, ipN: number, porta: number): { c: CaminhoMundo; escuta: boolean; linhas: Saida; portaLocal: number } {
  const portaLocal = portaEfemera(e, 'udp');
  const c = caminhoTransporte(m, e.nome, ipN, 'udp', portaLocal, porta);
  const linhas: Saida = [];
  if (!c.ok) return { c, escuta: false, linhas: [`O datagrama não chegou: ${c.falha}`], portaLocal };
  for (const n of c.nat) linhas.push(n);
  const d = demultiplexar(c.servidor!, 'udp', ipTexto(ipN), porta, c.ipVisto, c.portaVista);
  m.flags.soquetes = { ...((m.flags.soquetes as object | undefined) ?? { primitivas: [] }), demux: { equip: c.servidor!.nome, como: d.como, proto: 'udp', porta, origem: `${c.ipVisto}:${c.portaVista}` } };
  linhas.push(`${c.servidor!.nome} demultiplexa: ${d.texto}`);
  return { c, escuta: d.como !== 'nenhum', linhas, portaLocal };
}

function cmdUdp(m: Mundo, e: Equipamento, args: string[]): Saida {
  if (args[0] !== 'enviar') return ['udp enviar <ip> <porta> [quantos] [bytes]'];
  const ipN = lerDestino(args[1], m);
  const porta = lerPorta(args[2]);
  const n = args[3] === undefined ? 20 : Number(args[3]);
  const bytes = args[4] === undefined ? 100 : lerBytes(args[4]);
  if (ipN === null || porta === null || !Number.isInteger(n) || n < 1 || n > 10000 || bytes === null || bytes > 65507) return ['udp enviar <ip> <porta> [quantos, até 10000] [bytes, até 65507]'];
  const { c, escuta, linhas, portaLocal } = caminhoUdp(m, e, ipN, porta);
  const fd = soquetesDe(e).length + 3;
  const l: Saida = [primitiva(m, e, `socket(SOCK_DGRAM), sendto(${ipTexto(ipN)}:${porta}) × ${n}, da porta efêmera ${portaLocal}: sem connect, sem aperto de mão`)];
  void fd;
  if (!c.ok) {
    m.flags.udp = { de: e.nome, ip: ipTexto(ipN), porta, n, bytes, ok: false, recebidos: 0, perdidos: n };
    return [...l, ...linhas];
  }
  const h = montarCabecalhoUdp({ portaOrigem: c.portaVista, portaDestino: porta, dados: bytes }, lerIp(c.ipVisto)!, ipN);
  l.push(...linhas, `Cabeçalho UDP (8 bytes): porta de origem ${c.portaVista}, porta de destino ${porta}, tamanho ${h.tamanhoTotal} (8 + ${bytes}), checksum 0x${h.checksum.toString(16).padStart(4, '0')} sobre pseudo-cabeçalho, cabeçalho e dados. Em hexa: ${hexa(h.bytes)}`);
  if (!escuta) {
    l.push(`Nenhum soquete UDP na porta ${porta} de ${c.servidor!.nome}: os ${n} datagramas são descartados e cada um gera ICMP "porta inalcançável". O emissor nem fica sabendo, a menos que leia o ICMP.`);
    m.flags.udp = { de: e.nome, ip: ipTexto(ipN), porta, n, bytes, ok: true, escuta: false, recebidos: 0, perdidos: n, retransmissoes: 0, checksum: h.checksum };
    return l;
  }
  const p = perdaPorTamanho(c, e, bytes);
  const r = enviarDatagramas(n, { atraso: c.ida, perda: p }, { semente: Math.floor(m.rng() * 1e9) });
  l.push(...r.linhas, `Probabilidade de perda por datagrama neste caminho: ${num(p * 100, 3)} %. Atraso de um sentido: ${msTxt(c.ida)}.`);
  m.flags.udp = { de: e.nome, ip: ipTexto(ipN), porta, n, bytes, ok: true, escuta: true, recebidos: r.recebidos, perdidos: r.perdidos, quaisPerdidos: r.quaisPerdidos.slice(0, 100), retransmissoes: 0, perda: r4(p), checksum: h.checksum, tamanho: h.tamanhoTotal, portaVista: c.portaVista, ipVisto: c.ipVisto };
  return l;
}

function cmdRpc(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(args[0], m);
  const porta = lerPorta(args[1], 5000);
  const kv = Object.fromEntries(args.slice(2).filter((x) => x.includes('=')).map((x) => x.split('=') as [string, string]));
  const pos = args.slice(2).filter((x) => !x.includes('='));
  const espera = pos[0] === undefined ? 0.2 : (lerNumero(pos[0]) ?? NaN) / 1000;
  const tentativas = pos[1] === undefined ? 3 : Number(pos[1]);
  if (ipN === null || porta === null || !(espera > 0) || !Number.isInteger(tentativas) || tentativas < 1 || tentativas > 20) return ['rpc <ip> <porta> [espera ms] [tentativas] [perder=pedido|resposta]'];
  const { c, escuta, linhas } = caminhoUdp(m, e, ipN, porta);
  if (!c.ok) return linhas;
  const perdas = kv.perder === 'pedido' || kv.perder === 'resposta' ? [kv.perder as 'pedido' | 'resposta'] : undefined;
  const r = chamarRpc({ atraso: c.ida, perda: perdaPorTamanho(c, e, 100) }, { espera, tentativas, escuta, perdas, semente: Math.floor(m.rng() * 1e9) });
  m.flags.rpc = { de: e.nome, ip: ipTexto(ipN), porta, esperaMs: r4(espera * 1000), tentativas: r.tentativas, maxTentativas: tentativas, execucoes: r.execucoes, ok: r.ok, tempoMs: r4(r.tempo * 1000), escuta, perder: kv.perder ?? null };
  return [...linhas, `RPC sobre UDP: um datagrama de pedido, um de resposta, sem conexão. RTT ${msTxt(c.rtt)}.${espera < c.rtt ? ' A espera é menor que o RTT: vai reenviar mesmo sem perda nenhuma.' : ''}`, ...r.linhas, r.ok ? `Resposta em ${msTxt(r.tempo)} depois de ${r.tentativas} tentativa(s).` : 'Sem resposta.'];
}

function cmdRtp(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(args[0], m);
  const porta = lerPorta(args[1], 5004);
  const pacotes = args[2] === undefined ? 250 : Number(args[2]);
  const buffer = args[3] === undefined ? 0.06 : (lerNumero(args[3]) ?? NaN) / 1000;
  const jitter = args[4] === undefined ? 0.01 : (lerNumero(args[4]) ?? NaN) / 1000;
  if (ipN === null || porta === null || !Number.isInteger(pacotes) || pacotes < 1 || pacotes > 20000 || !(buffer >= 0) || !(jitter >= 0)) return ['rtp <ip> <porta> [pacotes] [buffer ms] [jitter ms]'];
  const { c, escuta, linhas } = caminhoUdp(m, e, ipN, porta);
  if (!c.ok) return linhas;
  if (!escuta) return [...linhas, 'Ninguém escuta: o áudio inteiro vira ICMP "porta inalcançável".'];
  const r = simularRtp({ atraso: c.ida, perda: perdaPorTamanho(c, e, 172), jitter }, { pacotes, buffer, semente: Math.floor(m.rng() * 1e9) });
  m.flags.rtp = { de: e.nome, ip: ipTexto(ipN), porta, pacotes, bufferMs: r4(buffer * 1000), jitterConfigMs: r4(jitter * 1000), recebidos: r.recebidos, perdidos: r.perdidos, atrasados: r.atrasados, jitterMs: r4(r.jitter * 1000), atrasoBocaMs: r4(r.atrasoBoca * 1000), falhas: r4(r.falhas) };
  return [...linhas, ...r.linhas, `Primeiros pacotes: ${r.pacotes.slice(0, 4).map((p) => `seq ${p.seq} marca ${p.marca}`).join('; ')}`, `O ouvinte perdeu ${num(r.falhas * 100, 1)} % da fala. Acima de uns 150 ms de boca a ouvido, a conversa começa a atropelar.`];
}

/* ---------- QUIC ---------- */

function cmdQuic(m: Mundo, e: Equipamento, args: string[]): Saida {
  const sub = args[0];
  const ipN = lerDestino(args[1], m);
  const porta = lerPorta(args[2] && /^\d+$/.test(args[2]) ? args[2] : undefined, 443);
  const resto = args.slice(args[2] && /^\d+$/.test(args[2]) ? 3 : 2);
  const uso = ['quic conectar <ip> [porta] | quic fluxos <ip> [porta] [objetos] [kB por objeto] [perder=<n>] | quic migrar <ip> [porta] <ip novo>'];
  if (!sub || ipN === null || porta === null) return uso;
  const { c, escuta, linhas } = caminhoUdp(m, e, ipN, porta);
  if (!c.ok) return linhas;
  const q = ((m.flags.quic as Record<string, unknown> | undefined) ??= {});
  if (!escuta) {
    q.conexao = { de: e.nome, ip: ipTexto(ipN), porta, ok: false };
    return [...linhas, `O QUIC roda sobre UDP: sem soquete UDP na porta ${porta}, volta ICMP "porta inalcançável". No servidor: "escutar udp ${porta}".`];
  }
  if (sub === 'conectar') {
    const r = estabelecimento(c.rtt);
    q.conexao = { de: e.nome, ip: ipTexto(ipN), porta, ok: true, rttMs: r4(c.rtt * 1000), tcpTls13Ms: r4(r.tcpTls13 * 1000), tcpTls12Ms: r4(r.tcpTls12 * 1000), quicMs: r4(r.quic * 1000), quic0rttMs: r4(r.quic0rtt * 1000) };
    return [...linhas, ...r.linhas, 'QUIC, passo a passo:', ...r.passos.quic.map((p) => `  ${msTxt(p.t).padStart(11)}  ${p.texto}`), 'Retomada em 0-RTT:', ...r.passos.quic0rtt.map((p) => `  ${msTxt(p.t).padStart(11)}  ${p.texto}`)];
  }
  if (sub === 'fluxos') {
    const kv = Object.fromEntries(resto.filter((x) => x.includes('=')).map((x) => x.split('=') as [string, string]));
    const pos = resto.filter((x) => !x.includes('='));
    const objetos = pos[0] === undefined ? 4 : Number(pos[0]);
    const kb = pos[1] === undefined ? 10 : lerNumero(pos[1]);
    const perder = kv.perder === undefined ? 2 : kv.perder === 'nada' ? null : Number(kv.perder);
    if (!Number.isInteger(objetos) || objetos < 1 || objetos > 32 || kb === null || kb <= 0 || kb > 5000 || (perder !== null && (!Number.isInteger(perder) || perder < 0))) return uso;
    const cfg = configTcp(e);
    const r = compararCabecaDeFila({ objetos, bytesPorObjeto: kb * 1000, gargalo: gargaloDo(c, e), perdas: perder === null ? [] : [perder], config: { ...cfg, janelaInicial: Math.max(cfg.janelaInicial, 10) }, semente: Math.floor(m.rng() * 1e9) });
    q.cabecaDeFila = { de: e.nome, ip: ipTexto(ipN), porta, objetos, kbPorObjeto: kb, perdida: perder, travadosNoTcp: r.travadosNoTcp, esperaTcpMs: r4(r.esperaTcp * 1000), esperaQuicMs: r4(r.esperaQuic * 1000), tcpMs: r.tcp.map((x) => r4(x * 1000)), quicMs: r.quic.map((x) => r4(x * 1000)) };
    return [...linhas, `Perda forçada: ${perder === null ? 'nenhuma' : `a transmissão nº ${perder} (contando de 0), que é do objeto ${(perder % objetos) + 1}`}.`, ...r.linhas];
  }
  if (sub === 'migrar') {
    const novo = resto[0] ?? '198.51.100.77';
    if (lerIp(novo) === null) return uso;
    const r = simularMigracao({ rtt: c.rtt, gargalo: gargaloDo(c, e), bytesRestantes: 2e6, ipAntigo: c.ipVisto, ipNovo: novo });
    q.migracao = { de: e.nome, ip: ipTexto(ipN), porta, ipAntigo: c.ipVisto, ipNovo: novo, paradoTcpMs: r4(r.paradoTcp * 1000), paradoQuicMs: r4(r.paradoQuic * 1000), restoTcpMs: r4(r.restoTcp * 1000), restoQuicMs: r4(r.restoQuic * 1000), idConexao: r.idConexao };
    return [...linhas, ...r.linhas];
  }
  return uso;
}

/* ---------- Vários fluxos: justiça, velocidade, comparação ---------- */

/** Simulação pacote a pacote tem custo: num enlace muito rápido, encurta a duração para caber em uns 300 mil segmentos. */
function duracaoSegura(bandaBps: number, segundos: number, mss: number, fluxos = 1): number {
  const max = (300000 * mss * 8) / bandaBps;
  return Math.max(0.5, Math.min(segundos, max * Math.max(1, fluxos / 2)));
}

function checarServidor(m: Mundo, e: Equipamento, ipN: number, porta: number): { c?: CaminhoMundo; erro?: Saida } {
  const c = caminhoTransporte(m, e.nome, ipN, 'tcp', portaEfemera(e, 'tcp'), porta);
  if (!c.ok) return { erro: [`Sem caminho: ${c.falha}`] };
  const d = demultiplexar(c.servidor!, 'tcp', ipTexto(ipN), porta, c.ipVisto, c.portaVista);
  if (d.como === 'nenhum') return { erro: [`${c.servidor!.nome} responde RST: ninguém escuta em TCP ${porta}. No servidor: "escutar tcp ${porta}".`] };
  return { c };
}

function cmdFluxos(m: Mundo, e: Equipamento, args: string[]): Saida {
  const n = Number(args[0]);
  const ipN = lerDestino(args[1], m);
  const porta = lerPorta(args[2], 80);
  const alg = (args[3] ?? configTcp(e).algoritmo) as AlgoritmoCc;
  let seg = args[4] === undefined ? 30 : lerNumero(args[4]);
  if (!Number.isInteger(n) || n < 1 || n > 16 || ipN === null || porta === null || !ALGORITMOS.includes(alg) || seg === null || seg < 2 || seg > 120) return ['fluxos <n de 1 a 16> <ip> [porta] [reno|cubic|bbr] [segundos]'];
  const { c, erro } = checarServidor(m, e, ipN, porta);
  if (erro) return erro;
  const pedido = seg;
  seg = duracaoSegura(c!.bandaBps, seg, configTcp(e).mss);
  const cfg = { ...configTcp(e), algoritmo: alg };
  const grande = { ...cfg, janela: Math.max(cfg.janela, 1 << 24), escala: Math.max(cfg.escala, 9) };
  const passo = Math.min(2, seg / (2 * n));
  const fluxos = Array.from({ length: n }, (_, i) => ({ nome: `fluxo ${i + 1}`, bytes: Infinity, inicio: i * passo, config: grande }));
  const r = simularTcp(fluxos, gargaloDo(c!, e), { duracao: seg, semente: Math.floor(m.rng() * 1e9), rttInicial: c!.rtt });
  const t0 = seg / 2;
  const partes = r.fluxos.map((f) => (entreguesEntre(f, t0, seg) * 8) / (seg - t0));
  const total = partes.reduce((a, b) => a + b, 0);
  const jain = indiceJain(partes);
  m.flags.justica = { de: e.nome, ip: ipTexto(ipN), porta, n, algoritmo: alg, segundos: seg, gargaloMbps: c!.gargalo.mbps, buffer: c!.buffer, perda: r4(gargaloDo(c!, e).perda ?? 0), porFluxoMbps: partes.map((x) => r4(x / 1e6)), fracoes: partes.map((x) => r4(total ? x / total : 0)), jain: r4(jain), utilizacao: r4(total / c!.bandaBps), assinatura: assinaturaTcp(e) };
  return [
    ...resumoCaminho(c!),
    ...(seg < pedido ? [`(Enlace rápido: a simulação, segmento a segmento, ficou em ${num(seg, 1)} s em vez de ${num(pedido, 0)} s.)`] : []),
    `${n} fluxo(s) ${alg.toUpperCase()} dividindo o gargalo, cada um começando ${num(passo, 1)} s depois do anterior (janela do receptor grande, para quem manda ser o congestionamento).`,
    `VAZÃO NA SEGUNDA METADE (de ${num(t0, 0)} s a ${num(seg, 0)} s):`,
    ...r.fluxos.map((f, i) => `  ${f.nome.padEnd(9)} ${mbps(partes[i]!).padStart(13)}  ${num(total ? (partes[i]! / total) * 100 : 0, 1).padStart(5)} %  ${'#'.repeat(Math.round(total ? (partes[i]! / total) * 40 : 0))}`),
    `Soma ${mbps(total)} de ${c!.gargalo.mbps} Mb/s. Índice de justiça de Jain: ${num(jain, 3)} (1 é divisão perfeita, 1/${n} é um só levando tudo).`,
    alg === 'bbr' ? 'O BBR não usa AIMD: cada fluxo estima a banda, e a divisão depende de como as estimativas se acomodam.' : 'Por que converge: no AIMD, todos sobem 1 segmento por RTT (a diferença entre eles fica igual) e na perda cortam pela metade (a diferença cai pela metade). Repetindo, a diferença some.',
  ];
}

function cmdVelocidade(m: Mundo, e: Equipamento, args: string[]): Saida {
  const alvo = args[0] ?? (m.flags.servidorTeste as string | undefined);
  const ipN = lerDestino(alvo, m);
  const n = args[1] === undefined ? 4 : Number(args[1]);
  if (ipN === null || !Number.isInteger(n) || n < 1 || n > 16) return ['velocidade <ip ou servidor> [fluxos paralelos]'];
  const c = caminhoTransporte(m, e.nome, ipN, 'tcp', portaEfemera(e, 'tcp'), 8080);
  if (!c.ok) return [`Sem caminho até o servidor de teste: ${c.falha}`];
  const cfg = configTcp(e);
  const g = gargaloDo(c, e);
  const seg = Math.max(3, duracaoSegura(c.bandaBps, 8, cfg.mss));
  const um = simularTcp([{ bytes: Infinity, config: cfg }], g, { duracao: seg, rttInicial: c.rtt, semente: 11 });
  const varios = simularTcp(Array.from({ length: n }, (_, i) => ({ nome: `fluxo ${i + 1}`, bytes: Infinity, config: cfg })), g, { duracao: seg, rttInicial: c.rtt, semente: 12 });
  const medir = (r: ResultadoTcp) => r.fluxos.reduce((s, f) => s + (entreguesEntre(f, 2, seg) * 8) / (seg - 2), 0);
  const v1 = medir(um);
  const vn = medir(varios);
  const janela = Math.min(cfg.janela, 65535 * 2 ** cfg.escala);
  m.flags.velocidade = { de: e.nome, ip: ipTexto(ipN), fluxos: n, mbps: r4(vn / 1e6), umFluxoMbps: r4(v1 / 1e6), gargaloMbps: c.gargalo.mbps, rttMs: r4(c.rtt * 1000), assinatura: assinaturaTcp(e) };
  return [
    ...resumoCaminho(c),
    `Teste de velocidade: ${n} conexões TCP em paralelo por ${seg} s; os 2 primeiros segundos (partida lenta) ficam fora da conta.`,
    `  1 fluxo: ${mbps(v1)}${vazaoJanela(janela, c.rtt) < c.bandaBps ? ` (preso pela janela do receptor: ${janela} bytes ÷ ${msTxt(c.rtt)} = ${mbps(vazaoJanela(janela, c.rtt))})` : ''}`,
    `  ${n} fluxos: ${mbps(vn)} somados`,
    `RESULTADO: ${mbps(vn)} = ${num(vn / 8 / 1e6, 2)} MB/s. Por isso os testes de velocidade abrem várias conexões: uma só pode ficar presa na própria janela ou demorar a sair da partida lenta.`,
  ];
}

function cmdComparar(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(args[0], m);
  const porta = lerPorta(args[1], 80);
  let seg = args[2] === undefined ? 20 : lerNumero(args[2]);
  if (ipN === null || porta === null || seg === null || seg < 2 || seg > 120) return ['tcp comparar <ip> [porta] [segundos]'];
  const { c, erro } = checarServidor(m, e, ipN, porta);
  if (erro) return erro;
  seg = duracaoSegura(c!.bandaBps, seg, configTcp(e).mss);
  const g = gargaloDo(c!, e);
  const base = configTcp(e);
  const grande = { ...base, janela: Math.max(base.janela, 1 << 24), escala: Math.max(base.escala, 9) };
  const res: Record<string, unknown> = {};
  const l = [...resumoCaminho(c!), `Um fluxo longo de cada algoritmo, ${seg} s, mesmo caminho: buffer ${g.buffer} pacotes${g.perda ? `, perda aleatória ${num(g.perda * 100, 2)} %` : ''}.`, 'ALGORITMO   VAZÃO         FILA MÉDIA   ESPERA NA FILA   PERDAS   RTT MÉDIO'];
  for (const alg of ALGORITMOS) {
    const r = simularTcp([{ bytes: Infinity, config: { ...grande, algoritmo: alg } }], g, { duracao: seg, rttInicial: c!.rtt, semente: 21 });
    const f = r.fluxos[0]!;
    const rttMedio = f.rttAmostras.length ? f.rttAmostras.reduce((s, x) => s + x.rtt, 0) / f.rttAmostras.length : c!.rtt;
    res[alg] = { vazaoMbps: r4(f.vazaoMbps), filaMedia: r4(r.filaMedia), atrasoFilaMs: r4(r.atrasoFilaMedio * 1000), perdas: r.perdasFila + r.perdasAleatorias, rttMedioMs: r4(rttMedio * 1000), timeouts: f.timeouts };
    l.push(`  ${alg.toUpperCase().padEnd(10)}${mbps(f.vazaoMbps * 1e6).padEnd(14)}${num(r.filaMedia, 1).padStart(6)} pct   ${msTxt(r.atrasoFilaMedio).padStart(14)}   ${String(r.perdasFila + r.perdasAleatorias).padStart(6)}   ${msTxt(rttMedio)}`);
  }
  m.flags.comparacao = { de: e.nome, ip: ipTexto(ipN), porta, segundos: seg, buffer: g.buffer, perda: r4(g.perda ?? 0), gargaloMbps: c!.gargalo.mbps, resultados: res, assinatura: assinaturaTcp(e) };
  l.push('Reno e CUBIC só diminuem quando perdem: com buffer grande, enchem a fila inteira antes (atraso de fila, o bufferbloat); com perda aleatória, cortam a janela por um problema que não é congestionamento. O BBR mede a banda e o RTT mínimo e manda nesse ritmo: fila pequena e quase indiferente à perda.');
  return l;
}

function cmdDesempenho(m: Mundo, e: Equipamento, args: string[]): Saida {
  const ipN = lerDestino(args[0], m);
  if (ipN === null) return ['tcp desempenho <ip>'];
  const c = caminhoTransporte(m, e.nome, ipN, 'tcp', portaEfemera(e, 'tcp'), lerPorta(args[1], 80) ?? 80);
  if (!c.ok) return [`Sem caminho: ${c.falha}`];
  const cfg = configTcp(e);
  const janela = Math.min(cfg.janela, 65535 * 2 ** cfg.escala);
  const bdp = bdpBytes(c.bandaBps, c.rtt);
  const vj = vazaoJanela(janela, c.rtt);
  const p = gargaloDo(c, e).perda ?? 0;
  const vp = p > 0 ? vazaoComPerda(cfg.mss, c.rtt, p) : Infinity;
  const volta = tempoVoltaSeq(c.bandaBps);
  const comp = compactacao(20);
  m.flags.desempenho = { de: e.nome, ip: ipTexto(ipN), bandaMbps: c.gargalo.mbps, rttMs: r4(c.rtt * 1000), bdpBytes: Math.round(bdp), janela, vazaoJanelaMbps: r4(vj / 1e6), escalaNecessaria: escalaNecessaria(bdp), perda: r4(p), vazaoPerdaMbps: Number.isFinite(vp) ? r4(vp / 1e6) : null, voltaSeqS: r4(volta), paws: volta < MSL, assinatura: assinaturaTcp(e) };
  return [
    ...resumoCaminho(c),
    `Produto banda × atraso: ${c.gargalo.mbps} Mb/s × ${msTxt(c.rtt)} = ${Math.round(bdp)} bytes (${num(bdp / cfg.mss, 1)} segmentos). É o tanto que precisa estar em voo para o cano ficar cheio.`,
    `Vazão limitada pela janela: ${janela} bytes ÷ ${msTxt(c.rtt)} = ${mbps(vj)}${vj < c.bandaBps ? `, menos que os ${c.gargalo.mbps} Mb/s do gargalo: a janela é o limite` : ': a janela não atrapalha'}.`,
    `Escala de janela: para anunciar ${Math.round(bdp)} bytes precisa de escala ${escalaNecessaria(bdp)} (o campo tem 16 bits, até 65535). Configurada: ${cfg.escala}.`,
    p > 0 ? `Com perda p = ${num(p * 100, 3)} %: vazão ≈ (MSS ÷ RTT) × 1,22 ÷ √p = ${mbps(vp)}. Dobrar o RTT corta pela metade; perda 4 vezes maior também.` : 'Sem perda no caminho: a fórmula MSS ÷ (RTT × √p) não limita (com p = 1 %, daria ' + mbps(vazaoComPerda(cfg.mss, c.rtt, 0.01)) + ').',
    `O número de sequência de 32 bits dá a volta em ${volta < 1 ? msTxt(volta) : `${num(volta, 1)} s`} a ${c.gargalo.mbps} Mb/s. ${volta < MSL ? `Menos que a vida máxima de um segmento (${MSL} s): precisa de PAWS (marca de tempo em cada segmento) para um segmento velho não ser aceito como novo.` : `Mais que a vida máxima de um segmento (${MSL} s): sem perigo de confusão.`}`,
    `Compactação de cabeçalho: voz com 20 bytes de fala leva 40 de IP, UDP e RTP (${num(comp.eficienciaSem * 100, 0)} % de dado). Como quase tudo se repete, compactado vira uns ${comp.compactado} bytes (${num(comp.eficienciaCom * 100, 0)} %).`,
  ];
}

/* ---------- Pequenos laboratórios ---------- */

function cmdRto(m: Mundo, args: string[]): Saida {
  const amostras = args.map((x) => lerNumero(x)).filter((x): x is number => x !== null && x > 0);
  if (!amostras.length) return ['tcp rto <amostra ms> <amostra ms> ... Ex.: tcp rto 100 120 80 300 100'];
  const p = calcularRto(amostras.map((x) => x / 1000), 0.2);
  m.flags.rto = { amostrasMs: amostras, passos: p.map((x) => ({ amostraMs: r4(x.amostra * 1000), srttMs: r4(x.srtt * 1000), rttvarMs: r4(x.rttvar * 1000), rtoMs: r4(x.rto * 1000) })) };
  return [
    'RTO por Jacobson e Karels (RFC 6298): na primeira amostra, SRTT = R e RTTVAR = R/2; depois RTTVAR = 3/4 RTTVAR + 1/4 |SRTT - R| e SRTT = 7/8 SRTT + 1/8 R. RTO = SRTT + 4 RTTVAR (piso de 200 ms).',
    '  AMOSTRA    SRTT        RTTVAR      RTO',
    ...p.map((x) => `  ${msTxt(x.amostra).padEnd(11)}${msTxt(x.srtt).padEnd(12)}${msTxt(x.rttvar).padEnd(12)}${msTxt(x.rto)}`),
    'Karn: amostra de segmento retransmitido não entra (não dá para saber se o ACK é do envio original ou do novo), e a cada tempo esgotado o RTO dobra até chegar uma amostra limpa.',
  ];
}

function cmdCabecalho(e: Equipamento): Saida {
  const syn = (e.s.ultimoSyn as SegmentoTcp | undefined) ?? { portaOrigem: 49152, portaDestino: 80, seq: 1000, ack: 0, flags: { syn: true }, janela: 65535, opcoes: { mss: 1460, sackOk: true } };
  const ipO = lerIp(ipPrincipal(e) ?? '192.0.2.10')!;
  const cx = e.s.conexao as Conexao | undefined;
  const ipD = lerIp(cx?.ipServidor ?? (m2ip(e) ?? '203.0.113.10'))!;
  const h = montarCabecalhoTcp(syn, ipO, ipD);
  return [
    `CABEÇALHO TCP do último SYN (${h.tamanho} bytes):`,
    `  porta de origem ${syn.portaOrigem}, porta de destino ${syn.portaDestino}`,
    `  número de sequência ${syn.seq} (inicial, sorteado: dificulta adivinhar e não confunde com conexão antiga)`,
    `  número de confirmação ${syn.ack} (só vale com a flag ACK)`,
    `  tamanho do cabeçalho ${h.tamanho / 4} palavras de 32 bits = ${h.tamanho} bytes (20 fixos + ${h.tamanho - 20} de opções)`,
    `  flags ${textoFlags(syn.flags)} (URG, ACK, PSH, RST, SYN, FIN; e mais CWR e ECE do ECN, aqui zeradas)`,
    `  janela ${syn.janela} bytes, checksum 0x${h.checksum.toString(16).padStart(4, '0')} (confere: ${checksumConfere(h.bytes, ipO, ipD, 6) ? 'sim' : 'não'}), ponteiro urgente 0`,
    `  opções: ${[syn.opcoes?.mss !== undefined ? `MSS ${syn.opcoes.mss}` : '', syn.opcoes?.sackOk ? 'SACK permitido' : '', syn.opcoes?.escala !== undefined ? `escala de janela ${syn.opcoes.escala}` : ''].filter(Boolean).join(', ') || 'nenhuma'}`,
    `  em hexa: ${hexa(h.bytes)}`,
  ];
}

function m2ip(e: Equipamento): string | null {
  return (e.s.conexao as Conexao | undefined)?.ipServidor ?? null;
}

function cmdNagle(m: Mundo, e: Equipamento, args: string[]): Saida {
  const bytes = args[0] === undefined ? 1 : Number(args[0]);
  const intervalo = args[1] === undefined ? 0.05 : (lerNumero(args[1]) ?? NaN) / 1000;
  const escritas = args[2] === undefined ? 40 : Number(args[2]);
  if (!Number.isInteger(bytes) || bytes < 1 || bytes > 1460 || !(intervalo > 0) || !Number.isInteger(escritas) || escritas < 1 || escritas > 10000) return ['tcp nagle [bytes por escrita] [intervalo ms] [escritas]'];
  const rtt = (e.s.conexao as Conexao | undefined)?.rtt ?? 0.2;
  const com = simularNagle({ escritas, bytes, intervalo, rtt, nagle: true });
  const sem = simularNagle({ escritas, bytes, intervalo, rtt, nagle: false });
  m.flags.nagle = { bytes, intervaloMs: r4(intervalo * 1000), escritas, rttMs: r4(rtt * 1000), com: { segmentos: com.segmentos, eficiencia: r4(com.eficiencia), esperaMs: r4(com.esperaMedia * 1000) }, sem: { segmentos: sem.segmentos, eficiencia: r4(sem.eficiencia), esperaMs: r4(sem.esperaMedia * 1000) } };
  return [
    `${escritas} escritas de ${bytes} byte(s), uma a cada ${num(intervalo * 1000, 0)} ms, RTT ${msTxt(rtt)} (como alguém digitando num terminal remoto):`,
    `  sem Nagle: ${sem.segmentos} segmentos, ${num(sem.bytesPorSegmento, 1)} bytes cada, ${num(sem.eficiencia * 100, 1)} % do fio é dado`,
    `  com Nagle: ${com.segmentos} segmentos, ${num(com.bytesPorSegmento, 1)} bytes cada, ${num(com.eficiencia * 100, 1)} % do fio é dado; cada tecla espera em média ${msTxt(com.esperaMedia)}`,
    'Nagle: com dado sem confirmação, junta o que chegar e só manda quando o ACK volta (ou quando encher um MSS). Com ACK atrasado do outro lado, os dois juntos podem segurar uma resposta pequena por 200 ms.',
  ];
}

function cmdJanelaBoba(m: Mundo): Saida {
  const sem = simularJanelaBoba({ sws: false });
  const com = simularJanelaBoba({ sws: true });
  m.flags.janelaBoba = { sem: { segmentos: sem.segmentos, bytesPorSegmento: r4(sem.bytesPorSegmento), eficiencia: r4(sem.eficiencia) }, com: { segmentos: com.segmentos, bytesPorSegmento: r4(com.bytesPorSegmento), eficiencia: r4(com.eficiencia) } };
  return [
    'Janela boba: buffer do receptor de 4096 bytes e uma aplicação que lê 1 byte a cada 0,5 ms. 20000 bytes para mandar.',
    `  sem proteção: ${sem.segmentos} segmentos de ${num(sem.bytesPorSegmento, 1)} bytes em média, ${num(sem.eficiencia * 100, 1)} % do fio é dado. Janelas anunciadas: ${sem.janelasAnunciadas.slice(0, 10).join(', ')}...`,
    `  com Clark e emissor esperto: ${com.segmentos} segmentos de ${num(com.bytesPorSegmento, 1)} bytes, ${num(com.eficiencia * 100, 1)} % de dado. Janelas anunciadas: ${com.janelasAnunciadas.slice(0, 10).join(', ')}...`,
    'A solução de Clark: o receptor finge que a janela está fechada até abrir pelo menos 1 MSS ou metade do buffer. O emissor, do lado dele, não manda migalha.',
  ];
}

/* ---------- Soquetes ---------- */

function cmdSoquetes(m: Mundo, e: Equipamento): Saida {
  const lista = soquetesDe(e);
  const l = [`SOQUETES DE ${e.nome}`, 'PROTO  LOCAL                  REMOTO                 ESTADO        FD  SERVIÇO'];
  for (const s of lista) l.push(`${s.proto.padEnd(7)}${`${s.ipLocal}:${s.portaLocal}`.padEnd(23)}${(s.ipRemoto ? `${s.ipRemoto}:${s.portaRemota}` : '*:*').padEnd(23)}${s.estado.padEnd(14)}${String(s.fd).padStart(2)}  ${s.servico ?? ''}`);
  if (!lista.length) l.push('(nenhum: ninguém escuta e nenhuma conexão aberta)');
  l.push('Uma conexão TCP é a quádrupla: IP e porta de cada lado. Vários clientes na mesma porta 80 do servidor são soquetes diferentes, e é a quádrupla que separa um do outro (demultiplexação).');
  const log = ((m.flags.soquetes as { primitivas?: string[] } | undefined)?.primitivas ?? []).filter((x) => x.startsWith(`${e.nome}:`)).slice(-8);
  if (log.length) l.push('ÚLTIMAS PRIMITIVAS:', ...log.map((x) => '  ' + x));
  return l;
}

/* ---------- Entrada ---------- */

/** Comandos de transporte no console do PC. Devolve null se o comando não é daqui. */
export function comandosTransporte(m: Mundo, e: Equipamento, cmd: string, args: string[]): Saida | null {
  if (e.tipo !== 'pc') return null;
  switch (cmd) {
    case 'soquetes':
    case 'netstat':
      return cmdSoquetes(m, e);
    case 'escutar':
    case 'parar': {
      const proto = args[0] as Protocolo;
      const porta = Number(args[1]);
      if ((proto !== 'tcp' && proto !== 'udp') || !Number.isInteger(porta)) return [`${cmd} <tcp|udp> <porta>${cmd === 'escutar' ? ' [nome do serviço]' : ''}`];
      return cmd === 'escutar' ? escutar(m, e, proto, porta, args[2]).linhas : pararDeEscutar(m, e, proto, porta);
    }
    case 'conectar': {
      const ipN = lerDestino(args[0], m);
      const porta = lerPorta(args[1]);
      if (ipN === null || porta === null) return ['conectar <ip> <porta>'];
      if (e.s.conexao) return [`Já existe uma conexão aberta com ${(e.s.conexao as Conexao).ipServidor}:${(e.s.conexao as Conexao).porta}. "fechar" antes.`];
      const r = conectar(m, e, ipN, porta);
      return [...r.linhas, r.resultado === 'aberta' ? 'Conexão aberta. "enviar <bytes>" manda dados; "fechar" encerra.' : ''].filter(Boolean);
    }
    case 'enviar': {
      const b = lerBytes(args[0]);
      if (b === null || b > 200e6) return ['enviar <bytes, até 200 MB>. Ex.: enviar 1M'];
      return enviarNaConexao(m, e, b);
    }
    case 'fechar': {
      const modo = args[0] === 'simultaneo' || args[0] === 'simultâneo' ? 'simultaneo' : args[0] === 'servidor' ? 'servidor' : 'cliente';
      return fecharConexao(m, e, modo);
    }
    case 'transferir': {
      const ipN = lerDestino(args[0], m);
      const porta = lerPorta(args[1]);
      const b = lerBytes(args[2]);
      if (ipN === null || porta === null || b === null || b > 200e6) return ['transferir <ip> <porta> <bytes, até 200 MB>. Ex.: transferir 203.0.113.10 80 1M'];
      if (e.s.conexao) return ['Já existe uma conexão aberta. "fechar" antes, ou "enviar <bytes>" nela.'];
      return transferir(m, e, ipN, porta, b);
    }
    case 'tcp': {
      const sub = args[0];
      if (!sub || sub === 'mostra' || sub === 'config') return mostraTcp(e);
      if (sub === 'estados') return ['MÁQUINA DE ESTADOS DO TCP', ...TRANSICOES.map((t) => `  ${t.de.padEnd(12)} --${t.evento}${t.envia ? ` / manda ${t.envia}` : ''}--> ${t.para.padEnd(12)} ${t.descricao}`), 'Abrir: CLOSED, SYN_SENT, ESTABLISHED (cliente); LISTEN, SYN_RCVD, ESTABLISHED (servidor). Fechar: FIN_WAIT_1, FIN_WAIT_2, TIME_WAIT de quem fecha primeiro; CLOSE_WAIT, LAST_ACK do outro.'];
      if (sub === 'rto') return cmdRto(m, args.slice(1));
      if (sub === 'cabecalho' || sub === 'cabeçalho') return cmdCabecalho(e);
      if (sub === 'nagle' && (args[1] === undefined || /^\d+$/.test(args[1]))) return cmdNagle(m, e, args.slice(1));
      if (sub === 'janela-boba' && args.length === 1) return cmdJanelaBoba(m);
      if (sub === 'desempenho') return cmdDesempenho(m, e, args.slice(1));
      if (sub === 'comparar') return cmdComparar(m, e, args.slice(1));
      return (
        cmdTcpOpcao(m, e, args) ?? [
          'tcp [mostra] | tcp mss <bytes> | janela <bytes> | escala <0 a 14> | algoritmo <reno|cubic|bbr> | nagle <on|off> | ack-atrasado <on|off> | sws <on|off> | sack <on|off> | iw <segmentos> | limiar <bytes|infinito> | rto-min <ms> | leitura <bytes> <ms> | pausa <início> <fim> | perda <%|off> | buffer <pacotes|auto> | atraso <ms|off> | padrao',
          'tcp estados | tcp rto <ms> ... | tcp cabecalho | tcp nagle [bytes] [ms] | tcp janela-boba | tcp desempenho <ip> | tcp comparar <ip> [porta] [s]',
        ]
      );
    }
    case 'udp':
      return cmdUdp(m, e, args);
    case 'rpc':
      return cmdRpc(m, e, args);
    case 'rtp':
      return cmdRtp(m, e, args);
    case 'quic':
      return cmdQuic(m, e, args);
    case 'fluxos':
      return cmdFluxos(m, e, args);
    case 'velocidade':
      return cmdVelocidade(m, e, args);
  }
  return null;
}

/** Linhas da ajuda do console do PC quando o mundo usa transporte. */
export const AJUDA_TRANSPORTE = [
  'soquetes | escutar <tcp|udp> <porta> [nome] | parar <tcp|udp> <porta>',
  'conectar <ip> <porta> | enviar <bytes> | fechar [simultaneo|servidor]',
  'transferir <ip> <porta> <bytes>',
  'tcp [mostra] | tcp <mss|janela|escala|algoritmo|nagle|ack-atrasado|sws|sack|iw|limiar|rto-min|leitura|pausa|perda|buffer|atraso> <valor> | tcp padrao',
  'tcp estados | tcp rto <ms> ... | tcp cabecalho | tcp nagle | tcp janela-boba | tcp desempenho <ip> | tcp comparar <ip> [porta] [s]',
  'udp enviar <ip> <porta> [quantos] [bytes] | rpc <ip> <porta> [espera ms] [tentativas] | rtp <ip> <porta> [pacotes] [buffer ms] [jitter ms]',
  'quic conectar <ip> [porta] | quic fluxos <ip> [porta] [objetos] [kB] | quic migrar <ip> [porta] <ip novo>',
  'fluxos <n> <ip> [porta] [algoritmo] [segundos] | velocidade [ip] [fluxos]',
];

/* ---------- Ações do menu ---------- */

const op = (valor: string, rotulo = valor): Opcao => ({ valor, rotulo });
const escolha = (nome: string, rotulo: string, opcoes: Opcao[], padrao?: string): Campo => ({ nome, rotulo, tipo: 'escolha', opcoes, padrao: padrao ?? opcoes[0]?.valor });
const numero = (nome: string, rotulo: string, unidade?: string, padrao?: string): Campo => ({ nome, rotulo, tipo: 'numero', unidade, padrao });
const texto = (nome: string, rotulo: string, padrao: string): Campo => ({ nome, rotulo, tipo: 'texto', padrao });

/** Ações da camada de transporte no PC. Só aparecem quando o mundo usa transporte (m.flags.transporte ou algo configurado). */
export function acoesTransporte(m: Mundo, e: Equipamento): Acao[] {
  const ctx = e.nome;
  const ips: Opcao[] = [];
  for (const x of m.equipamentos.values()) {
    if (x.nome === e.nome || x.tipo !== 'pc') continue;
    const i = interfacesL3(x)[0];
    if (i) ips.push(op(ipTexto(i.cidr.endereco), `${ipTexto(i.cidr.endereco)} (${x.nome})`));
  }
  const destino = (): Campo => (ips.length ? escolha('ip', 'Destino', ips) : texto('ip', 'Destino', '203.0.113.10'));
  const cfg = configTcp(e);
  const cx = e.s.conexao as Conexao | undefined;
  const onOff = (nome: string, rotulo: string, atual: boolean) => escolha(nome, rotulo, [op('on', 'ligado'), op('off', 'desligado')], atual ? 'off' : 'on');
  const a: Acao[] = [
    { id: 'tr-soquetes', rotulo: 'Ver os soquetes', ajuda: 'A tabela de soquetes deste host: protocolo, IP e porta de cada lado e o estado. Cada conexão TCP é uma quádrupla.', contexto: ctx, comandos: () => ['soquetes'] },
    { id: 'tr-escutar', rotulo: 'Abrir um serviço (escutar numa porta)', ajuda: 'socket, bind e listen: o serviço fica em LISTEN esperando conexão (TCP) ou datagrama (UDP). Portas conhecidas: 80 web, 443 web segura, 25 correio, 53 nomes.', contexto: ctx, campos: [escolha('proto', 'Protocolo', [op('tcp', 'TCP'), op('udp', 'UDP')]), escolha('porta', 'Porta', [op('80', '80 (http)'), op('443', '443 (https)'), op('25', '25 (smtp)'), op('53', '53 (dns)'), op('22', '22 (ssh)'), op('5000', '5000'), op('5004', '5004 (rtp)')])], comandos: (v) => [`escutar ${v.proto} ${v.porta}`, 'soquetes'] },
    { id: 'tr-parar', rotulo: 'Parar um serviço', ajuda: 'Fecha o soquete que escuta. Quem tentar depois leva RST (TCP) ou ICMP de porta inalcançável (UDP).', contexto: ctx, campos: [escolha('proto', 'Protocolo', [op('tcp', 'TCP'), op('udp', 'UDP')]), numero('porta', 'Porta', undefined, '80')], comandos: (v) => [`parar ${v.proto} ${v.porta || 80}`, 'soquetes'] },
    cx
      ? { id: 'tr-fechar', rotulo: 'Fechar a conexão', ajuda: 'Encerramento: FIN de um lado, ACK, FIN do outro, ACK. Quem fecha primeiro passa por FIN_WAIT_1, FIN_WAIT_2 e espera 2 MSL no TIME_WAIT.', contexto: ctx, campos: [escolha('modo', 'Quem fecha', [op('cliente', 'eu primeiro'), op('servidor', 'o servidor primeiro'), op('simultaneo', 'os dois ao mesmo tempo')])], comandos: (v) => [`fechar ${v.modo}`, 'soquetes'] }
      : { id: 'tr-conectar', rotulo: 'Conectar (aperto de mão em três vias)', ajuda: 'SYN, SYN+ACK, ACK, com os números de sequência iniciais e os estados dos dois lados. Se ninguém escuta na porta, volta RST.', contexto: ctx, campos: [destino(), numero('porta', 'Porta', undefined, '80')], comandos: (v) => [`conectar ${v.ip} ${v.porta || 80}`, 'soquetes'] },
    { id: 'tr-enviar', rotulo: 'Enviar dados na conexão', ajuda: 'O TCP corta o que a aplicação escreve em segmentos de até 1 MSS e manda dentro da janela. Mostra os eventos e a janela de congestionamento.', contexto: ctx, campos: [texto('bytes', 'Bytes (ex.: 100k, 1M)', '200k')], comandos: (v) => [`enviar ${v.bytes || '200k'}`] },
    { id: 'tr-transferir', rotulo: 'Transferir um arquivo por TCP', ajuda: 'Conecta, manda, fecha. Simula segmento a segmento pelo caminho real: partida lenta, perdas, retransmissões, a janela ao longo do tempo e a vazão no fim.', contexto: ctx, campos: [destino(), numero('porta', 'Porta', undefined, '80'), texto('bytes', 'Tamanho (ex.: 500k, 2M)', '1M')], comandos: (v) => [`transferir ${v.ip} ${v.porta || 80} ${v.bytes || '1M'}`] },
    { id: 'tr-tcp-ver', rotulo: 'Ver a configuração TCP', ajuda: 'MSS, buffer do receptor, escala de janela, algoritmo de congestionamento e as opções.', contexto: ctx, comandos: () => ['tcp'] },
    { id: 'tr-algoritmo', rotulo: 'Controle de congestionamento', ajuda: 'Reno corta pela metade na perda e sobe linear; CUBIC volta ao máximo antigo numa curva cúbica; BBR mede banda e RTT mínimo e não liga para perda.', contexto: ctx, campos: [escolha('alg', 'Algoritmo', ALGORITMOS.map((x) => op(x, x.toUpperCase())), cfg.algoritmo)], comandos: (v) => [`tcp algoritmo ${v.alg}`, 'tcp'] },
    { id: 'tr-janela', rotulo: 'Janela do receptor e escala', ajuda: 'Buffer do receptor (controle de fluxo) e a escala de janela, que deixa anunciar mais que 65535 bytes. Janela pequena num caminho longo segura a vazão: janela ÷ RTT.', contexto: ctx, campos: [texto('janela', 'Buffer do receptor (bytes)', String(cfg.janela)), numero('escala', 'Escala (0 a 14)', undefined, String(cfg.escala))], comandos: (v) => [`tcp janela ${v.janela || cfg.janela}`, `tcp escala ${v.escala || 0}`, 'tcp'] },
    { id: 'tr-mss', rotulo: 'MSS e janela inicial', ajuda: 'O MSS é o maior pedaço de dado por segmento. A janela inicial diz quantos segmentos saem antes do primeiro ACK; com 1, a partida lenta dobra: 1, 2, 4, 8.', contexto: ctx, campos: [numero('mss', 'MSS', 'bytes', String(cfg.mss)), numero('iw', 'Janela inicial', 'segmentos', String(cfg.janelaInicial))], comandos: (v) => [`tcp mss ${v.mss || 1460}`, `tcp iw ${v.iw || 1}`, 'tcp'] },
    { id: 'tr-opcoes', rotulo: 'Nagle, ACK atrasado e janela boba', ajuda: 'Nagle junta escritas pequenas; ACK atrasado confirma a cada dois segmentos; a proteção contra janela boba evita segmentos e anúncios minúsculos.', contexto: ctx, campos: [onOff('nagle', 'Nagle', !cfg.nagle), onOff('ack', 'ACK atrasado', !cfg.ackAtrasado), onOff('sws', 'Contra janela boba', !cfg.sws)], comandos: (v) => [`tcp nagle ${v.nagle}`, `tcp ack-atrasado ${v.ack}`, `tcp sws ${v.sws}`, 'tcp'] },
    { id: 'tr-leitura', rotulo: 'Aplicação lenta no receptor (janela zero)', ajuda: 'A aplicação que recebe para de ler por um tempo: o buffer enche, o receptor anuncia janela zero e o emissor manda sondas até a janela abrir.', contexto: ctx, campos: [numero('ini', 'Para de ler em', 's', '0,05'), numero('fim', 'Volta a ler em', 's', '0,5')], comandos: (v) => [`tcp pausa ${v.ini || '0,05'} ${v.fim || '0,5'}`, 'tcp'] },
    { id: 'tr-sem-fio', rotulo: 'Perda no meio sem fio', ajuda: 'Perda aleatória depois do gargalo, que não é congestionamento. O TCP não sabe diferenciar: corta a janela e a vazão despenca.', contexto: ctx, campos: [texto('p', 'Perda (% ou off)', '2%')], comandos: (v) => [`tcp perda ${v.p || 'off'}`, 'tcp'] },
    { id: 'tr-atraso', rotulo: 'Atraso do caminho (emulador)', ajuda: 'Soma atraso a cada sentido, como um caminho entre cidades. Com RTT maior, o produto banda × atraso cresce e a janela passa a importar.', contexto: ctx, campos: [numero('ms', 'Atraso de cada sentido', 'ms', '20')], comandos: (v) => [`tcp atraso ${v.ms || 20}`, 'tcp'] },
    { id: 'tr-buffer', rotulo: 'Buffer do gargalo', ajuda: 'Quantos pacotes cabem na fila do enlace mais lento. Grande demais, quem enche a fila (Reno, CUBIC) cria atraso para todo mundo.', contexto: ctx, campos: [texto('n', 'Pacotes (ou auto)', '1000')], comandos: (v) => [`tcp buffer ${v.n || 'auto'}`, 'tcp'] },
    { id: 'tr-comparar', rotulo: 'Comparar Reno, CUBIC e BBR', ajuda: 'O mesmo caminho com cada algoritmo: vazão, fila média e espera na fila. Teste com buffer grande e com perda aleatória.', contexto: ctx, campos: [destino(), numero('porta', 'Porta', undefined, '80')], comandos: (v) => [`tcp comparar ${v.ip} ${v.porta || 80}`] },
    { id: 'tr-fluxos', rotulo: 'Vários fluxos no mesmo gargalo (justiça)', ajuda: 'Fluxos TCP que começam em tempos diferentes dividindo o enlace mais lento. Com AIMD, convergem para partes iguais.', contexto: ctx, campos: [numero('n', 'Fluxos', undefined, '2'), destino(), numero('porta', 'Porta', undefined, '80'), escolha('alg', 'Algoritmo', ALGORITMOS.map((x) => op(x, x.toUpperCase())), cfg.algoritmo)], comandos: (v) => [`fluxos ${v.n || 2} ${v.ip} ${v.porta || 80} ${v.alg}`] },
    { id: 'tr-velocidade', rotulo: 'Teste de velocidade', ajuda: 'Vazão da rede de acesso com várias conexões em paralelo, como os testes de velocidade fazem, comparada com uma só.', contexto: ctx, campos: [destino(), numero('n', 'Conexões paralelas', undefined, '4')], comandos: (v) => [`velocidade ${v.ip} ${v.n || 4}`] },
    { id: 'tr-desempenho', rotulo: 'Desempenho: banda × atraso, janela, perda', ajuda: 'Produto banda × atraso, vazão limitada pela janela, fórmula da vazão com perda, escala de janela, número de sequência que dá a volta (PAWS) e compactação de cabeçalho.', contexto: ctx, campos: [destino()], comandos: (v) => [`tcp desempenho ${v.ip}`] },
    { id: 'tr-udp', rotulo: 'Mandar datagramas UDP', ajuda: 'Cabeçalho de 8 bytes, sem conexão e sem retransmissão: o que se perde, se perde. Mostra o cabeçalho e quantos chegaram.', contexto: ctx, campos: [destino(), numero('porta', 'Porta', undefined, '53'), numero('n', 'Quantos', undefined, '50'), numero('bytes', 'Bytes de dados', 'bytes', '100')], comandos: (v) => [`udp enviar ${v.ip} ${v.porta || 53} ${v.n || 50} ${v.bytes || 100}`] },
    { id: 'tr-rpc', rotulo: 'Chamada remota (RPC) por UDP', ajuda: 'Pedido num datagrama, resposta noutro, com tempo de espera e nova tentativa. Se a resposta se perde, o servidor executa duas vezes.', contexto: ctx, campos: [destino(), numero('porta', 'Porta', undefined, '5000'), numero('espera', 'Espera', 'ms', '200'), escolha('perder', 'Forçar perda', [op('nada', 'nenhuma'), op('pedido', 'do pedido'), op('resposta', 'da resposta')])], comandos: (v) => [`rpc ${v.ip} ${v.porta || 5000} ${v.espera || 200} 3${v.perder && v.perder !== 'nada' ? ` perder=${v.perder}` : ''}`] },
    { id: 'tr-rtp', rotulo: 'Áudio em RTP (jitter e buffer)', ajuda: 'Pacotes de 20 ms com número de sequência e marca de tempo. O buffer de reprodução absorve o jitter; pacote que chega depois da hora de tocar não serve.', contexto: ctx, campos: [destino(), numero('porta', 'Porta', undefined, '5004'), numero('buffer', 'Buffer de reprodução', 'ms', '60'), numero('jitter', 'Jitter do caminho', 'ms', '10')], comandos: (v) => [`rtp ${v.ip} ${v.porta || 5004} 250 ${v.buffer || 60} ${v.jitter || 10}`] },
    { id: 'tr-quic-conectar', rotulo: 'QUIC: estabelecer conexão', ajuda: 'QUIC sobre UDP junta transporte e TLS: 1 RTT para abrir, 0 RTT na retomada. Compare com TCP e TLS.', contexto: ctx, campos: [destino(), numero('porta', 'Porta UDP', undefined, '443')], comandos: (v) => [`quic conectar ${v.ip} ${v.porta || 443}`] },
    { id: 'tr-quic-fluxos', rotulo: 'QUIC: fluxos sem bloqueio de cabeça de fila', ajuda: 'Vários objetos na mesma conexão e uma perda. No TCP todos esperam a retransmissão; no QUIC só o fluxo que perdeu.', contexto: ctx, campos: [destino(), numero('porta', 'Porta UDP', undefined, '443'), numero('objetos', 'Objetos', undefined, '4')], comandos: (v) => [`quic fluxos ${v.ip} ${v.porta || 443} ${v.objetos || 4}`] },
    { id: 'tr-quic-migrar', rotulo: 'QUIC: migração de conexão', ajuda: 'O IP muda no meio (Wi-Fi para rede móvel). O TCP perde a conexão; o QUIC segue pelo identificador de conexão.', contexto: ctx, campos: [destino(), numero('porta', 'Porta UDP', undefined, '443'), texto('novo', 'IP novo', '198.51.100.77')], comandos: (v) => [`quic migrar ${v.ip} ${v.porta || 443} ${v.novo || '198.51.100.77'}`] },
    { id: 'tr-estados', rotulo: 'Máquina de estados do TCP', ajuda: 'Todos os estados e o que leva de um para o outro: abertura ativa e passiva, encerramento, fechamento simultâneo e TIME_WAIT.', contexto: ctx, comandos: () => ['tcp estados'] },
    { id: 'tr-rto', rotulo: 'Calcular o RTO (Jacobson e Karels)', ajuda: 'Dê amostras de RTT e veja o SRTT, o RTTVAR e o RTO saírem passo a passo.', contexto: ctx, campos: [texto('amostras', 'Amostras em ms', '100 120 80 300 100')], comandos: (v) => [`tcp rto ${v.amostras || '100 120 80 300 100'}`] },
    { id: 'tr-cabecalho', rotulo: 'Ver o cabeçalho TCP', ajuda: 'Portas, sequência, confirmação, tamanho do cabeçalho, flags, janela, checksum e opções do último SYN, com os bytes em hexa.', contexto: ctx, comandos: () => ['tcp cabecalho'] },
    { id: 'tr-nagle', rotulo: 'Laboratório: algoritmo de Nagle', ajuda: 'Alguém digitando num terminal remoto: com e sem Nagle, quantos segmentos e quanto do fio é dado.', contexto: ctx, comandos: () => ['tcp nagle'] },
    { id: 'tr-janela-boba', rotulo: 'Laboratório: janela boba', ajuda: 'Receptor que lê 1 byte por vez: sem a solução de Clark, segmentos de 1 byte com 40 de cabeçalho.', contexto: ctx, comandos: () => ['tcp janela-boba'] },
  ];
  return a;
}

export { temTransporte };
