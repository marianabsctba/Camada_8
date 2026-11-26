// Comandos de console de congestionamento, qualidade de serviço e SDN (ato 4): fila de saída por porta,
// baldes, escalonamento, marcação DSCP, reserva RSVP e o controlador SDN com tabelas de fluxo e telemetria.
// O cli.ts chama daqui quando o comando não é de ninguém antes. Tudo só age quando alguém configura.

import { avaliar } from './fisico';
import { textoCidr, enderecoRede, pertence } from './ip';
import { caboNaPorta, type Equipamento, type Mundo } from './mundo';
import { grafoDoMundo } from './protocolos';
import { dijkstra, primeiraAresta } from './rotear';
import { donoDoIp, escolherRota, interfacesL3, marcasDscp, type MarcaDscp } from './roteamento';
import { BUFFER_PADRAO, curvaCarga, escalarFontes, fonteDeCarga, simularFila, tempoTxt, textoFila, type ConfigFila, type FonteTrafego, type ResultadoFila } from './fila';
import { CLASSES_DSCP, escalonar, lerDscp, nomeDscp, prioridadeDaClasse, REQUISITOS, simularBalde, type Disciplina, type FluxoEsc, type TipoBalde } from './qos';
import { fluxosDe, instalarRegra, lerAcoes, lerCasamento, ordenar, textoAcoes, textoCasamento, type RegraFluxo } from './sdn';
import { ipTexto, lerCidr, lerIp, lerNumero } from './util';

type Saida = string[];

const num = (x: number, casas = 2) => x.toFixed(casas).replace('.', ',');
const pct = (x: number) => `${num(x * 100, 1)} %`;
const ms = (s: number) => Number((s * 1000).toFixed(4));

function ligado(v: string | undefined): boolean | null {
  return v === 'on' || v === 'liga' || v === 'sim' ? true : v === 'off' || v === 'desliga' || v === 'nao' ? false : null;
}

/** O mundo usa QoS ou SDN? Os menus e a ajuda só mostram estas coisas quando sim (ou quando o dia liga m.flags.qos). */
export function temQos(m: Mundo): boolean {
  if (m.flags.qos || m.flags.sdn) return true;
  for (const e of m.equipamentos.values()) if (e.s.fila || e.s.fluxos || e.s.dscp || e.s.reservas) return true;
  return false;
}

/* ---------- Fila de saída por porta ---------- */

export type ConfigPortaFila = ConfigFila & { fontes?: FonteTrafego[] };

export function filasDe(e: Equipamento): Record<string, ConfigPortaFila> {
  return (e.s.fila as Record<string, ConfigPortaFila> | undefined) ?? {};
}

function configFila(e: Equipamento, porta: string): ConfigPortaFila {
  const t = ((e.s.fila as Record<string, ConfigPortaFila> | undefined) ??= {});
  return (t[porta] ??= { buffer: BUFFER_PADRAO });
}

/** Capacidade da porta em Mb/s: a configurada, senão a velocidade do enlace, senão 100. */
export function capacidadePorta(m: Mundo, e: Equipamento, porta: string): number {
  const cfg = filasDe(e)[porta];
  if (cfg?.capacidade) return cfg.capacidade;
  const c = caboNaPorta(m, { equip: e.nome, porta });
  const est = c ? avaliar(m, c) : null;
  return est?.up ? est.velocidade : 100;
}

/** Cópia da configuração da fila, no formato gravado em m.flags.fila.config (para o dia conferir). */
export function configFilaAtual(e: Equipamento, porta: string): { config: ConfigFila; fontes: FonteTrafego[] } {
  const c = filasDe(e)[porta] ?? { buffer: BUFFER_PADRAO };
  const { fontes, ...config } = c;
  return JSON.parse(JSON.stringify({ config, fontes: fontes ?? [] }));
}

/** O último resultado de "fila simular" ainda vale para a configuração de agora? */
export function filaConfere(m: Mundo): boolean {
  const f = m.flags.fila as { equip: string; porta: string; config: ConfigFila; fontes: FonteTrafego[] } | undefined;
  const e = f && m.equipamentos.get(f.equip);
  if (!f || !e) return false;
  const atual = configFilaAtual(e, f.porta);
  return JSON.stringify(atual.config) === JSON.stringify(f.config) && JSON.stringify(atual.fontes) === JSON.stringify(f.fontes);
}

/** "90", "90%" e "0,9" valem 90 % da capacidade. */
function lerCarga(txt: string | undefined): number | null {
  if (!txt) return null;
  const n = lerNumero(txt);
  if (n === null || n <= 0) return null;
  const c = txt.includes('%') || n > 3 ? n / 100 : n;
  return c > 0 && c <= 3 ? c : null;
}

function portaFila(e: Equipamento, nome: string | undefined): string | null {
  if (nome && e.portas.some((p) => p.nome === nome)) return nome;
  return null;
}

/** Porta padrão para simular: a primeira com fila configurada, senão a primeira com IP, senão a primeira. */
function portaPadrao(e: Equipamento): string {
  return Object.keys(filasDe(e))[0] ?? interfacesL3(e)[0]?.porta ?? e.portas[0]!.nome;
}

function resumoResultado(r: ResultadoFila) {
  return {
    atrasoMedioMs: ms(r.atrasoMedio),
    jitterMs: ms(r.jitter),
    atrasoMaxMs: ms(r.atrasoMax),
    ocupacaoMedia: Number(r.ocupacaoMedia.toFixed(3)),
    ocupacaoMax: r.ocupacaoMax,
    utilizacao: Number(r.utilizacao.toFixed(4)),
    enviados: r.enviados,
    entregues: r.entregues,
    perdas: r.perdas,
    perdasBuffer: r.perdasBuffer,
    perdasRed: r.perdasRed,
    perdasDescarte: r.perdasDescarte,
    taxaPerda: Number(r.taxaPerda.toFixed(5)),
    marcadosEcn: r.marcadosEcn,
    sinais: r.sinais,
    recusadas: r.recusadas,
    reducoes: r.reducoes,
    sincronia: r.sincronia === null ? null : Number(r.sincronia.toFixed(3)),
    porFonte: Object.fromEntries(r.porFonte.map((f) => [f.nome, { admitida: f.admitida, tcp: f.tcp, entregues: f.entregues, perdidos: f.perdidos, marcados: f.marcados, sinais: f.sinais, recuos: f.recuos, expiracoes: f.expiracoes, atrasoMedioMs: ms(f.atrasoMedio), vazaoMbps: Number(f.vazaoMbps.toFixed(3)), fatorFinal: Number(f.fatorFinal.toFixed(3)) }])),
  };
}

function mostraFila(m: Mundo, e: Equipamento): Saida {
  const t = filasDe(e);
  const portas = Object.keys(t);
  if (!portas.length) return [`Nenhuma fila configurada: todas as portas com descarte no fim da fila e buffer de ${BUFFER_PADRAO} pacotes. "fila <porta> buffer <n>" para começar.`];
  const l = ['FILAS DE SAÍDA'];
  for (const p of portas) {
    const c = t[p]!;
    l.push(`  ${p}: ${capacidadePorta(m, e, p)} Mb/s, buffer ${c.buffer} pacote(s), ${c.red ? `RED ${c.red.min} a ${c.red.max}` : 'descarte no fim da fila'}${c.ecn ? ', ECN' : ''}${c.choke ? ', choke packet' : ''}${c.descarte ? ', descarte de carga' : ''}${c.admissao !== undefined ? `, admissão até ${pct(c.admissao)}` : ''}`);
    for (const f of c.fontes ?? []) l.push(`      fonte ${f.nome}: ${num(f.mbps)} Mb/s, ${f.tamanho ?? 1000} bytes, rajada ${f.rajada ?? 1}, importância ${f.importancia ?? 1}${f.classe ? `, classe ${f.classe}` : ''}${f.responde === false ? ', sem controle de congestionamento (ignora perda e aviso)' : `, TCP${f.ecn === false ? ' sem ECN' : ' com ECN'}`}`);
  }
  return l;
}

function cmdFila(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [a0, a1, a2, a3, a4] = args;
  const uso = ['fila <porta> buffer <n> | red <mín> <máx> [pmáx] | red off | ecn <on|off> | choke <on|off> | descarte <on|off> | admissao <%|off> | capacidade <Mb/s>', 'fila <porta> fonte <nome> <Mb/s> [tamanho=<bytes>] [rajada=<n>] [importancia=<n>] [classe=<DSCP>] [ecn=nao] [responde=nao] | fila <porta> sem-fonte <nome|todas>', 'fila simular <carga> [porta] | fila curva [porta] | fila buffers [carga] [porta] | mostra fila'];
  if (a0 === 'simular') return simularPorta(m, e, a1, a2);
  if (a0 === 'curva') return curvaPorta(m, e, a1);
  if (a0 === 'buffers') return compararBuffers(m, e, a1, a2);
  const p = portaFila(e, a0);
  if (!p) return [...uso, `Portas: ${e.portas.map((x) => x.nome).join(', ')}.`];
  const c = configFila(e, p);
  switch (a1) {
    case 'buffer': {
      const n = Number(a2);
      if (!Number.isInteger(n) || n < 1 || n > 100000) return ['fila <porta> buffer <1 a 100000 pacotes>'];
      c.buffer = n;
      const cap = capacidadePorta(m, e, p);
      return [`Buffer da ${p}: ${n} pacote(s). Cheio, ele segura ${tempoTxt((n * 1000 * 8) / (cap * 1e6))} de tráfego (pacotes de 1000 bytes a ${cap} Mb/s). Mais buffer perde menos, mas quem espera no fim chega tarde.`];
    }
    case 'red': {
      if (a2 === 'off') {
        delete c.red;
        return [`RED desligado na ${p}: volta o descarte no fim da fila, só quando o buffer enche.`];
      }
      const min = Number(a2);
      const max = Number(a3);
      const pmax = a4 === undefined ? undefined : lerNumero(a4);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min || (pmax !== undefined && (pmax === null || pmax <= 0 || pmax > 1))) return ['fila <porta> red <mín> <máx> [pmáx entre 0 e 1], em pacotes, com mín < máx. Ex.: fila p2 red 5 15 0,1'];
      c.red = { min, max, ...(pmax !== undefined && pmax !== null ? { pmax } : {}) };
      return [`RED na ${p}: com a média da fila abaixo de ${min}, nada cai; entre ${min} e ${max}, cada pacote que chega cai com probabilidade crescente; acima de ${max}, todos caem.${max > c.buffer ? ` Atenção: o máximo passa do buffer (${c.buffer}); o buffer enche antes.` : ''} A ideia é avisar cedo, perdendo um aqui e outro ali, antes que o buffer encha e perca tudo de uma vez.`];
    }
    case 'ecn':
    case 'choke':
    case 'descarte': {
      const v = ligado(a2);
      if (v === null) return [`fila <porta> ${a1} <on|off>`];
      if (v) c[a1] = true;
      else delete c[a1];
      const txt = { ecn: 'ECN: em vez de descartar, o roteador marca os 2 bits de congestionamento do cabeçalho IP. O destino devolve o aviso nas confirmações e a origem TCP corta a janela pela metade, uma vez por ida e volta, sem perder o pacote.', choke: 'Choke packet: com a fila passando de 3/4 do buffer, o roteador manda um aviso direto para a origem do pacote, no máximo um por ida e volta. A origem TCP volta à partida lenta, como mandava a velha redução da fonte do ICMP.', descarte: 'Descarte de carga: com o buffer cheio, o roteador joga fora o pacote menos importante da fila para caber um mais importante.' }[a1];
      return [v ? txt : `${a1} desligado na ${p}.`];
    }
    case 'admissao': {
      if (a2 === 'off') {
        delete c.admissao;
        return [`Controle de admissão desligado na ${p}: todo fluxo entra.`];
      }
      const n = lerCarga(a2);
      if (n === null || n > 1) return ['fila <porta> admissao <percentual da capacidade, até 100> | admissao off'];
      c.admissao = n;
      return [`Controle de admissão na ${p}: fluxo novo só entra se a soma das taxas couber em ${pct(n)} de ${capacidadePorta(m, e, p)} Mb/s. Quem não cabe é recusado na porta, antes de atrapalhar quem já está.`];
    }
    case 'capacidade': {
      const n = lerNumero(a2 ?? '');
      if (n === null || n <= 0 || n > 400000) return ['fila <porta> capacidade <Mb/s>'];
      c.capacidade = n;
      return [`Capacidade da ${p} para a simulação: ${n} Mb/s.`];
    }
    case 'fonte': {
      const mbps = lerNumero(a3 ?? '');
      if (!a2 || mbps === null || mbps <= 0) return ['fila <porta> fonte <nome> <Mb/s> [tamanho=<bytes>] [rajada=<n>] [importancia=<n>] [classe=<DSCP>] [ecn=nao] [responde=nao]'];
      const f: FonteTrafego = { nome: a2, mbps };
      for (const kv of args.slice(4)) {
        const [k, v] = kv.split('=');
        const n = lerNumero(v ?? '');
        if (k === 'tamanho' && n !== null && n >= 64 && n <= 9000) f.tamanho = Math.round(n);
        else if (k === 'rajada' && n !== null && n >= 1 && n <= 1000) f.rajada = Math.round(n);
        else if (k === 'importancia' && n !== null) f.importancia = n;
        else if (k === 'classe' && v && lerDscp(v) !== null) f.classe = v.toUpperCase();
        else if (k === 'ecn' && v === 'nao') f.ecn = false;
        else if (k === 'responde' && v === 'nao') f.responde = false;
        else return [`Não entendi "${kv}". Opções: tamanho=<64 a 9000>, rajada=<1 a 1000>, importancia=<n>, classe=<EF, AF41, BE...>, ecn=nao, responde=nao.`];
      }
      c.fontes = [...(c.fontes ?? []).filter((x) => x.nome !== a2), f];
      return [`Fonte ${a2} na ${p}: ${num(mbps)} Mb/s${f.rajada && f.rajada > 1 ? `, em rajadas de ${f.rajada} pacotes` : ''}. Soma das fontes: ${num(c.fontes.reduce((s, x) => s + x.mbps, 0))} Mb/s de ${capacidadePorta(m, e, p)} Mb/s.`];
    }
    case 'sem-fonte': {
      if (!a2) return ['fila <porta> sem-fonte <nome|todas>'];
      c.fontes = a2 === 'todas' ? [] : (c.fontes ?? []).filter((x) => x.nome !== a2);
      if (!c.fontes.length) delete c.fontes;
      return [a2 === 'todas' ? 'Fontes apagadas.' : `Fonte ${a2} apagada.`];
    }
  }
  return uso;
}

function simularPorta(m: Mundo, e: Equipamento, cargaTxt: string | undefined, portaTxt: string | undefined): Saida {
  const carga = lerCarga(cargaTxt);
  if (carga === null) return ['fila simular <carga> [porta]: a carga é a fração da capacidade, como 0,5 ou 95 %. Pode passar de 100 %.'];
  const p = portaFila(e, portaTxt) ?? portaPadrao(e);
  const cap = capacidadePorta(m, e, p);
  const { config, fontes } = configFilaAtual(e, p);
  const usadas = fontes.length ? escalarFontes(fontes, carga, cap) : [fonteDeCarga(carga, cap)];
  const r = simularFila(config, usadas, { capacidadeMbps: cap });
  const resumo = resumoResultado(r);
  const anterior = (m.flags.fila?.simulacoes ?? []) as unknown[];
  m.flags.fila = { equip: e.nome, porta: p, carga, capacidadeMbps: cap, config, fontes, ...resumo, simulacoes: [...anterior, { porta: p, carga, config, fontes, ...resumo }].slice(-30) };
  const comTcp = r.porFonte.some((f) => f.admitida && f.tcp);
  return [`SIMULAÇÃO DA FILA DE SAÍDA DA ${p.toUpperCase()} (${r.enviados} pacotes em ${tempoTxt(r.duracao)}, ${comTcp ? 'origens TCP que respondem a perda e aviso' : 'chegadas aleatórias sem controle'})`, ...textoFila(config, r).map((x) => '  ' + x)];
}

function curvaPorta(m: Mundo, e: Equipamento, portaTxt: string | undefined): Saida {
  const p = portaFila(e, portaTxt) ?? portaPadrao(e);
  const cap = capacidadePorta(m, e, p);
  const { config } = configFilaAtual(e, p);
  const cargas = [0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 0.99, 1.1];
  const pts = curvaCarga(config, cap, cargas);
  const maior = Math.max(...pts.map((x) => x.atrasoMedio));
  m.flags.filaCurva = { equip: e.nome, porta: p, capacidadeMbps: cap, config, pontos: pts.map((x) => ({ carga: x.carga, atrasoMedioMs: ms(x.atrasoMedio), teoricoMs: Number.isFinite(x.teorico) ? ms(x.teorico) : null, jitterMs: ms(x.jitter), taxaPerda: Number(x.taxaPerda.toFixed(5)) })) };
  return [
    `CURVA CARGA × ATRASO NA ${p.toUpperCase()} (${cap} Mb/s, buffer ${config.buffer}, pacotes de 1000 bytes)`,
    'CARGA   ATRASO MÉDIO   TEORIA (M/D/1)   PERDA',
    ...pts.map((x) => `  ${pct(x.carga).padEnd(7)} ${tempoTxt(x.atrasoMedio).padEnd(14)} ${(Number.isFinite(x.teorico) ? tempoTxt(x.teorico) : '∞').padEnd(16)} ${pct(x.taxaPerda).padEnd(7)} ${'#'.repeat(Math.max(1, Math.round((x.atrasoMedio / (maior || 1)) * 30)))}`),
    'Perto de 100 % o atraso explode: W = T + ρT / (2(1 - ρ)), e 1 - ρ vai a zero. Acima de 100 % não há buffer que chegue: a fila cresce até encher e o resto vira perda.',
    ...(pts.at(-2)!.atrasoMedio < pts.at(-2)!.teorico / 3 ? [`Aqui o atraso para de subir antes da teoria porque ${config.red ? 'o RED' : `o buffer de ${config.buffer} pacote(s)`} põe um teto na fila: o que passaria do teto vira perda. A conta M/D/1 supõe buffer sem fim.`] : []),
  ];
}

function compararBuffers(m: Mundo, e: Equipamento, cargaTxt: string | undefined, portaTxt: string | undefined): Saida {
  const carga = lerCarga(cargaTxt) ?? 1.2;
  const p = portaFila(e, portaTxt) ?? portaPadrao(e);
  const cap = capacidadePorta(m, e, p);
  const tamanhos = [8, 64, 512, 4096];
  // Só o buffer muda: descarte no fim da fila, sem RED nem ECN, para o efeito do tamanho aparecer sozinho.
  const rs = tamanhos.map((b) => ({ b, r: simularFila({ buffer: b }, [fonteDeCarga(carga, cap)], { capacidadeMbps: cap, pacotes: 40000 }) }));
  m.flags.filaBuffers = { equip: e.nome, porta: p, carga, capacidadeMbps: cap, pontos: rs.map(({ b, r }) => ({ buffer: b, atrasoMedioMs: ms(r.atrasoMedio), taxaPerda: Number(r.taxaPerda.toFixed(5)) })) };
  return [
    `BUFFER PEQUENO × BUFFER GRANDE com ${pct(carga)} de carga na ${p} (${cap} Mb/s, descarte no fim da fila, sem RED)`,
    'BUFFER   ATRASO MÉDIO   PIOR ATRASO   PERDA',
    ...rs.map(({ b, r }) => `  ${String(b).padEnd(7)} ${tempoTxt(r.atrasoMedio).padEnd(14)} ${tempoTxt(r.atrasoMax).padEnd(13)} ${pct(r.taxaPerda)}`),
    carga > 1
      ? 'Buffer grande demais não cria capacidade: com a porta sobrecarregada, ele só enche e deixa todo mundo esperando a fila inteira. É o inchaço de buffer. Cheio, a perda é a mesma de qualquer buffer (o que passa da capacidade); só o atraso dispara.'
      : 'Abaixo de 100 % de carga, buffer maior só segura as rajadas: perde menos e quase não muda o atraso médio. O problema do buffer grande aparece quando a porta fica sobrecarregada.',
  ];
}

/* ---------- Baldes ---------- */

function cmdBalde(m: Mundo, args: string[]): Saida {
  const tipo = args[0] as TipoBalde;
  const taxa = lerNumero(args[1] ?? '');
  const prof = lerNumero(args[2] ?? '');
  const uso = ['balde <fichas|furado> <taxa Mb/s> <profundidade kB> [pico Mb/s] [rajada kB] [espera kB | descartar]', 'Ex.: balde fichas 200 9600 1000 30000. 1 kB = 1000 bytes.'];
  if ((tipo !== 'fichas' && tipo !== 'furado') || taxa === null || prof === null || taxa <= 0 || prof <= 0) return uso;
  const pico = args[3] !== undefined ? lerNumero(args[3]) : Math.max(1000, taxa * 10);
  const rajada = args[4] !== undefined ? lerNumero(args[4]) : prof * 3;
  if (pico === null || rajada === null || pico <= 0 || rajada <= 0) return uso;
  const espera = args[5] === undefined ? Infinity : args[5] === 'descartar' ? 0 : lerNumero(args[5]);
  if (espera === null || espera < 0) return uso;
  const R = (taxa * 1e6) / 8;
  const M = (pico * 1e6) / 8;
  const B = prof * 1000;
  const r = simularBalde({ tipo, taxa: R, profundidade: B, pico: M, rajada: rajada * 1000, espera: Number.isFinite(espera) ? espera * 1000 : Infinity });
  const kb = (x: number) => num(x / 1000, 1);
  m.flags.balde = {
    tipo,
    taxaMbps: taxa,
    profundidadeKB: prof,
    picoMbps: pico,
    rajadaKB: rajada,
    esperaKB: tipo === 'furado' ? prof : Number.isFinite(espera) ? espera : null,
    passouDiretoKB: Number((r.passouDireto / 1000).toFixed(3)),
    esperouKB: Number((r.esperou / 1000).toFixed(3)),
    descartadoKB: Number((r.descartado / 1000).toFixed(3)),
    tempoNoPicoMs: ms(r.tempoNoPico),
    sTeoricoMs: Number.isFinite(r.sTeorico) ? ms(r.sTeorico) : null,
    bytesNoPicoKB: Number((r.bytesNoPico / 1000).toFixed(3)),
    atrasoMaxMs: ms(r.atrasoMax),
    fimMs: ms(r.fim),
  };
  const amostras = r.serie.filter((_, i) => i % Math.max(1, Math.floor(r.serie.length / 12)) === 0).slice(0, 12);
  const l = [
    tipo === 'fichas'
      ? `BALDE DE FICHAS: R = ${num(taxa, 1)} Mb/s, B = ${kb(B)} kB, chegada da rajada e linha a M = ${num(pico, 1)} Mb/s, rajada de ${kb(rajada * 1000)} kB, ${Number.isFinite(espera) ? (espera === 0 ? 'sem fila: o que não tem ficha é descartado (policiamento)' : `fila de espera de ${num(espera, 1)} kB`) : 'fila de espera sem limite (modelagem)'}.`
      : `BALDE FURADO: sai no máximo R = ${num(taxa, 1)} Mb/s, cabem B = ${kb(B)} kB no balde, a rajada de ${kb(rajada * 1000)} kB chega a M = ${num(pico, 1)} Mb/s.`,
    `  passou sem esperar  ${kb(r.passouDireto)} kB`,
    `  esperou             ${kb(r.esperou)} kB (o pior esperou ${tempoTxt(r.atrasoMax)})`,
    `  descartado          ${kb(r.descartado)} kB`,
    `  terminou de sair em ${tempoTxt(r.fim)}`,
  ];
  if (tipo === 'fichas') {
    l.push(
      `  saindo no pico M    ${tempoTxt(r.tempoNoPico)}, ${kb(r.bytesNoPico)} kB`,
      Number.isFinite(r.sTeorico)
        ? `Conta: durante S a saída gasta M·S e ganha R·S de fichas, então M·S = B + R·S e S = B / (M - R) = ${kb(B)} kB / (${num(pico, 1)} - ${num(taxa, 1)}) Mb/s = ${tempoTxt(r.sTeorico)}. Depois disso, as fichas só chegam a R, e a saída cai para R.`
        : 'Com M menor ou igual a R, as fichas nunca acabam: a rajada passa inteira no pico.',
    );
  } else l.push('O balde furado alisa: não importa como chega, sai em ritmo constante R. O que transborda do balde se perde. Não deixa passar rajada nenhuma, nem a pequena.');
  l.push('SAÍDA NO TEMPO (Mb/s):', ...amostras.map((s) => `  ${tempoTxt(s.t).padEnd(10)} ${num((s.saida * 8) / 1e6, 1).padStart(8)} ${'#'.repeat(Math.round(((s.saida * 8) / 1e6 / Math.max(pico, taxa)) * 30))}`));
  return l;
}

/* ---------- Escalonamento ---------- */

const FLUXOS_PADRAO = (cap: number): FluxoEsc[] => [
  { nome: 'voz', mbps: 0.2 * cap, tamanho: 200, classe: 'EF' },
  { nome: 'video', mbps: 0.5 * cap, tamanho: 1200, classe: 'AF41' },
  { nome: 'dados', mbps: 1.0 * cap, tamanho: 1500, classe: 'BE' },
];

function cmdEscalonar(m: Mundo, e: Equipamento, args: string[]): Saida {
  const disc = args[0] as Disciplina;
  if (disc !== 'fifo' && disc !== 'prioridade' && disc !== 'wfq') return ['escalonar <fifo|prioridade|wfq> [pesos, como 3,2,1] [porta]', 'Usa as fontes da fila da porta (fila <porta> fonte ...) ou, sem fontes, voz (EF), vídeo (AF41) e dados (BE) somando 170 % da capacidade.'];
  let pesosTxt: string | undefined = args[1];
  let portaTxt: string | undefined = args[2];
  if (pesosTxt && portaFila(e, pesosTxt)) (portaTxt = pesosTxt), (pesosTxt = undefined);
  const p = portaFila(e, portaTxt) ?? Object.entries(filasDe(e)).find(([, c]) => c.fontes?.length)?.[0] ?? portaPadrao(e);
  const cap = capacidadePorta(m, e, p);
  const fontes = filasDe(e)[p]?.fontes ?? [];
  const base: FluxoEsc[] = fontes.length ? fontes.map((f) => ({ nome: f.nome, mbps: f.mbps, tamanho: f.tamanho, classe: f.classe, prioridade: f.importancia })) : FLUXOS_PADRAO(cap);
  const pesos = pesosTxt ? pesosTxt.split(',').map((x) => lerNumero(x)) : [];
  if (pesos.some((x) => x === null || x <= 0)) return ['Pesos positivos separados por vírgula, na ordem dos fluxos. Ex.: 3,2,1'];
  const fluxos = base.map((f, i) => ({ ...f, peso: pesos[i] ?? 1, prioridade: f.classe ? prioridadeDaClasse(lerDscp(f.classe) ?? 0) : (f.prioridade ?? 0) }));
  const r = escalonar(disc, fluxos, { capacidadeMbps: cap });
  m.flags.escalonamento = {
    disciplina: disc,
    equip: e.nome,
    porta: p,
    capacidadeMbps: cap,
    pesos: fluxos.map((f) => f.peso),
    fluxos: fluxos.map((f) => ({ nome: f.nome, mbps: f.mbps, peso: f.peso, prioridade: f.prioridade, classe: f.classe ?? null })),
    resultado: Object.fromEntries(r.fluxos.map((f) => [f.nome, { vazaoMbps: Number(f.vazaoMbps.toFixed(3)), fracao: Number(f.fracao.toFixed(4)), atrasoMedioMs: ms(f.atrasoMedio), perdidos: f.perdidos, entregues: f.entregues }])),
  };
  const nomeDisc = { fifo: 'FIFO (por ordem de chegada)', prioridade: 'prioridade estrita (a fila mais alta sempre passa na frente)', wfq: 'WFQ (enfileiramento justo ponderado)' }[disc];
  const oferta = fluxos.reduce((s, f) => s + f.mbps, 0);
  return [
    `ESCALONAMENTO NA ${p.toUpperCase()}: ${nomeDisc}, ${cap} Mb/s, oferta total ${pct(oferta / cap)} da capacidade`,
    'FLUXO      CLASSE  PESO  PRIO  OFERTA      SAIU        FATIA    ATRASO MÉDIO  PERDIDOS',
    ...fluxos.map((f, i) => {
      const x = r.fluxos[i]!;
      return `  ${f.nome.padEnd(9)}${(f.classe ?? '-').padEnd(8)}${num(f.peso, 1).padEnd(6)}${String(f.prioridade).padEnd(6)}${`${num(f.mbps, 1)} Mb/s`.padEnd(12)}${`${num(x.vazaoMbps, 1)} Mb/s`.padEnd(12)}${pct(x.fracao).padEnd(9)}${tempoTxt(x.atrasoMedio).padEnd(14)}${x.perdidos}`;
    }),
    disc === 'fifo'
      ? 'FIFO não olha quem é quem: o fluxo que manda mais ocupa mais, e a voz espera atrás do arquivo grande.'
      : disc === 'prioridade'
        ? 'Prioridade estrita: a classe alta quase não espera, mas se ela mandasse demais a baixa morreria de fome. Por isso a classe EF costuma vir com limite de taxa.'
        : 'WFQ: cada fila ganha a fatia do seu peso quando todas querem mais do que cabe. Quem pede menos que a fatia leva tudo que pediu, e a sobra vai para os outros.',
  ];
}

/* ---------- Serviços diferenciados e integrados ---------- */

function cmdDscp(m: Mundo, e: Equipamento, args: string[]): Saida {
  const lista = [...marcasDscp(e)];
  if (!args[0]) {
    return [
      'CLASSES DSCP (6 bits de cima do byte "serviço diferenciado" do IPv4; os 2 de baixo são do ECN)',
      ...Object.entries(CLASSES_DSCP).map(([k, v]) => `  ${k.padEnd(5)} ${String(v.dscp).padStart(2)}  ${v.descricao}`),
      'dscp <prefixo> <classe> [origem|destino]: marca na borda o tráfego daquele prefixo. dscp limpa: apaga as marcações.',
    ];
  }
  if (args[0] === 'limpa') {
    delete e.s.dscp;
    const f = { ...(m.flags.dscp ?? {}) };
    delete f[e.nome];
    m.flags.dscp = f;
    return ['Marcações apagadas: os pacotes passam com o DSCP que trouxeram.'];
  }
  const c = lerCidr(args[0]);
  const d = lerDscp(args[1] ?? '');
  const campo = (args[2] ?? 'origem') as MarcaDscp['campo'];
  if (!c || d === null || (campo !== 'origem' && campo !== 'destino')) return ['dscp <prefixo> <classe ou número> [origem|destino], por exemplo: dscp 192.0.2.0/24 EF'];
  const prefixo = textoCidr({ endereco: enderecoRede(c), prefixo: c.prefixo });
  const novas = [...lista.filter((x) => !(x.prefixo === prefixo && x.campo === campo)), { prefixo, dscp: d, campo }];
  e.s.dscp = novas;
  m.flags.dscp = { ...(m.flags.dscp ?? {}), [e.nome]: novas.map((x) => ({ ...x, classe: nomeDscp(x.dscp) })) };
  return [`Marcação na borda: pacote com ${campo} em ${prefixo} que passar por ${e.nome} sai com DSCP ${d} (${nomeDscp(d)}), byte de serviço 0x${(d << 2).toString(16).padStart(2, '0')}. Os roteadores do miolo não classificam de novo: só leem a classe e aplicam o tratamento dela.`];
}

function reservas(e: Equipamento): Record<string, { destino: string; mbps: number }[]> {
  return (e.s.reservas ??= {}) as Record<string, { destino: string; mbps: number }[]>;
}

/** Fração da capacidade que o RSVP pode reservar; o resto fica para o melhor esforço. */
export const LIMITE_RSVP = 0.75;

function cmdRsvp(m: Mundo, e: Equipamento, args: string[]): Saida {
  if (args[0] === 'limpa') {
    for (const x of m.equipamentos.values()) delete x.s.reservas;
    delete m.flags.rsvp;
    return ['Todas as reservas desfeitas.'];
  }
  const ip = lerIp(args[0] ?? '');
  const mbps = lerNumero(args[1] ?? '');
  if (ip === null || mbps === null || mbps <= 0) return ['rsvp <ip de destino> <Mb/s> | rsvp limpa'];
  const l = [`RSVP: PATH de ${e.nome} até ${ipTexto(ip)} pedindo ${num(mbps)} Mb/s; a RESV volta reservando salto a salto.`];
  const feitas: { e: Equipamento; porta: string }[] = [];
  const caminho: string[] = [];
  let x: Equipamento | undefined = e;
  let motivo: string | undefined;
  for (let i = 0; x && i < 32; i++) {
    const rota = escolherRota(x, ip);
    if (!rota?.porta) {
      motivo = `${x.nome} não tem rota para ${ipTexto(ip)}`;
      break;
    }
    const cap = capacidadePorta(m, x, rota.porta);
    const usado = (reservas(x)[rota.porta] ?? []).reduce((s, r) => s + r.mbps, 0);
    if (usado + mbps > LIMITE_RSVP * cap + 1e-9) {
      motivo = `${x.nome}:${rota.porta} já tem ${num(usado)} Mb/s reservados de ${num(LIMITE_RSVP * cap)} possíveis (${pct(LIMITE_RSVP)} de ${cap} Mb/s)`;
      break;
    }
    (reservas(x)[rota.porta] ??= []).push({ destino: ipTexto(ip), mbps });
    feitas.push({ e: x, porta: rota.porta });
    caminho.push(`${x.nome}:${rota.porta}`);
    l.push(`  ${x.nome} reserva ${num(mbps)} Mb/s na ${rota.porta} (${num(usado + mbps)} de ${num(LIMITE_RSVP * cap)} Mb/s reserváveis)`);
    if (!rota.via) break;
    const prox = donoDoIp(m, rota.via)?.e;
    x = prox && prox.tipo === 'roteador' ? prox : undefined;
  }
  const ok = !motivo;
  if (!ok) {
    for (const f of feitas) {
      const lst = reservas(f.e)[f.porta]!;
      lst.splice(lst.findIndex((r) => r.destino === ipTexto(ip) && r.mbps === mbps), 1);
    }
    l.push(`RECUSADA: ${motivo}. As reservas feitas no caminho foram desfeitas. Controle de admissão por fluxo: melhor recusar na entrada do que prometer e não cumprir.`);
  } else l.push('Reserva feita em todos os roteadores do caminho. Cada um guarda estado para este fluxo: é por isso que serviços integrados não escalam para a internet inteira.');
  m.flags.rsvp = { origem: e.nome, destino: ipTexto(ip), mbps, ok, caminho, ...(motivo ? { motivo } : {}) };
  return l;
}

function mostraQos(m: Mundo, e: Equipamento): Saida {
  const l = ['QUALIDADE DE SERVIÇO'];
  const mk = marcasDscp(e);
  l.push(mk.length ? 'Marcação na borda:' : 'Sem marcação DSCP neste roteador.', ...mk.map((x) => `  ${x.campo} em ${x.prefixo.padEnd(18)} → DSCP ${x.dscp} (${nomeDscp(x.dscp)})`));
  const rs = Object.entries((e.s.reservas ?? {}) as Record<string, { destino: string; mbps: number }[]>).filter(([, v]) => v.length);
  l.push(rs.length ? 'Reservas RSVP:' : 'Sem reservas RSVP.', ...rs.flatMap(([p, v]) => v.map((r) => `  ${p}: ${num(r.mbps)} Mb/s para ${r.destino}`)));
  l.push(...mostraFila(m, e));
  return l;
}

/* ---------- SDN ---------- */

interface EstadoSdn {
  controlador?: boolean;
  packetIn?: number;
  visao?: Record<string, Record<string, string>>;
  telemetria?: Record<string, Record<string, { prioridade: number; casamento: string; acoes: string; pacotes: number; bytes: number }>>;
  ultimaRegra?: { equip: string; id: number; prioridade: number; casamento: string; acoes: string };
  regras?: number;
}

function sdnDe(m: Mundo): EstadoSdn {
  return (m.flags.sdn ??= {}) as EstadoSdn;
}

/**
 * A visão central do controlador: o grafo de todos os roteadores e, para cada um, por qual porta sai cada rede
 * (caminho mais curto calculado no controlador, não nos roteadores). É o que ele usa para responder packet-in.
 */
export function montarVisao(m: Mundo): Record<string, Record<string, string>> {
  const g = grafoDoMundo(m);
  const visao: Record<string, Record<string, string>> = {};
  for (const x of g.nos) {
    const r = dijkstra(g, x);
    const t: Record<string, { porta: string; custo: number }> = {};
    for (const y of g.nos) {
      const ey = m.equipamentos.get(y)!;
      const custo = r.dist[y] ?? Infinity;
      if (custo === Infinity) continue;
      for (const i of interfacesL3(ey)) {
        const pref = textoCidr({ endereco: enderecoRede(i.cidr), prefixo: i.cidr.prefixo });
        const porta = y === x ? i.porta : primeiraAresta(r, y)?.porta;
        if (porta && (!t[pref] || custo < t[pref]!.custo)) t[pref] = { porta, custo };
      }
    }
    visao[x] = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.porta]));
  }
  return visao;
}

function atualizarSdn(m: Mundo): EstadoSdn {
  const s = sdnDe(m);
  if (s.controlador) s.visao = montarVisao(m);
  s.regras = [...m.equipamentos.values()].reduce((n, x) => n + fluxosDe(x).length, 0);
  return s;
}

function linhasTabela(e: Equipamento): Saida {
  const rs = ordenar(fluxosDe(e));
  if (!rs.length) return [`  ${e.nome}: tabela de fluxo vazia (tudo segue a ${e.tipo === 'roteador' ? 'tabela de rotas' : 'tabela MAC'})`];
  return [`  ${e.nome}:`, ...rs.map((r) => `    #${String(r.id).padEnd(3)} prio ${String(r.prioridade).padEnd(5)} ${textoCasamento(r.casamento).padEnd(34)} → ${textoAcoes(r.acoes).padEnd(16)} ${String(r.contadores.pacotes).padStart(5)} pacote(s) ${String(r.contadores.bytes).padStart(8)} bytes${r.origem === 'reativa' ? '  (reativa)' : ''}`)];
}

function cmdSdn(m: Mundo, e: Equipamento, args: string[]): Saida {
  const [sub, ...resto] = args;
  const s = sdnDe(m);
  switch (sub) {
    case 'controlador': {
      const v = ligado(resto[0]);
      if (v === null) return [`sdn controlador <on|off>. Agora: ${s.controlador ? 'ligado' : 'desligado'}.`];
      s.controlador = v;
      if (!v) delete s.visao;
      atualizarSdn(m);
      return v
        ? [`Controlador ligado. Ele junta a visão da rede inteira (${Object.keys(s.visao ?? {}).length} roteador(es)) e calcula os caminhos num lugar só: é o plano de controle, tirado de dentro de cada equipamento. Os equipamentos ficam só com o plano de dados: casar o pacote na tabela de fluxo e fazer o que a regra manda.`]
        : ['Controlador desligado. As regras já instaladas continuam valendo (o plano de dados segue sozinho), mas pacote que precisar subir ao controlador fica sem resposta e é descartado.'];
    }
    case 'regra': {
      if (!s.controlador) return ['Sem controlador, ninguém instala regra. Ligue com "sdn controlador on".'];
      const prio = Number(resto[0]);
      if (!Number.isInteger(prio) || prio < 0 || prio > 65535 || !resto[1] || !resto[2]) return ['sdn regra <prioridade 0 a 65535> <casamento> <ação> [em <equipamento>]', 'casamento: * ou campo=valor separados por vírgula (destino, origem, proto, dscp, entrada). Ex.: destino=203.0.113.0/24,dscp=EF', 'ação: porta:<p>, descartar, controlador, normal, dscp=<classe>, destino=<ip>; junte com "+". Ex.: dscp=AF41+porta:p3'];
      const alvo = resto[3] === 'em' ? m.equipamentos.get(resto[4] ?? '') : e;
      if (!alvo || (alvo.tipo !== 'roteador' && alvo.tipo !== 'switch')) return [`"${resto[4] ?? ''}" não é roteador nem switch deste mundo.`];
      const c = lerCasamento(resto[1]);
      if (typeof c === 'string') return [c];
      const a = lerAcoes(resto[2]);
      if (typeof a === 'string') return [a];
      const porta = a.find((x) => x.tipo === 'porta');
      if (porta && porta.tipo === 'porta' && !alvo.portas.some((p) => p.nome === porta.porta)) return [`${alvo.nome} não tem porta ${porta.porta}. Portas: ${alvo.portas.map((p) => p.nome).join(', ')}.`];
      const r = instalarRegra(alvo, prio, c, a);
      s.ultimaRegra = { equip: alvo.nome, id: r.id, prioridade: prio, casamento: textoCasamento(c), acoes: textoAcoes(a) };
      atualizarSdn(m);
      return [`Controlador instalou a regra #${r.id} em ${alvo.nome}: prioridade ${prio}, casa ${textoCasamento(c)}, faz ${textoAcoes(a)}. Ela decide antes da ${alvo.tipo === 'roteador' ? 'tabela de rotas' : 'tabela MAC'}; se duas regras casam, vence a de prioridade maior.`];
    }
    case 'apagar': {
      const alvo = resto[1] === 'em' ? m.equipamentos.get(resto[2] ?? '') : e;
      if (!alvo) return ['sdn apagar <id|tudo> [em <equipamento>]'];
      if (resto[0] === 'tudo') delete alvo.s.fluxos;
      else {
        const id = Number(resto[0]);
        const antes = fluxosDe(alvo).length;
        const ficam = fluxosDe(alvo).filter((r) => r.id !== id);
        if (ficam.length === antes) return [`${alvo.nome} não tem regra #${resto[0] ?? '?'}.`];
        if (ficam.length) alvo.s.fluxos = ficam;
        else delete alvo.s.fluxos;
      }
      atualizarSdn(m);
      return [resto[0] === 'tudo' ? `Tabela de fluxo de ${alvo.nome} esvaziada.` : `Regra #${resto[0]} apagada de ${alvo.nome}.`];
    }
    case 'ver': {
      atualizarSdn(m);
      const g = grafoDoMundo(m);
      const comTabela = [...m.equipamentos.values()].filter((x) => x.tipo === 'roteador' || (x.tipo === 'switch' && fluxosDe(x).length));
      const l = [
        `CONTROLADOR ${s.controlador ? 'LIGADO' : 'DESLIGADO'}. Plano de controle: aqui, num lugar só. Plano de dados: nas tabelas de fluxo de cada equipamento.`,
        `Visão da rede: ${g.nos.length} roteador(es), ${g.arestas.length / 2} enlace(s) entre eles: ${[...new Set(g.arestas.filter((a) => a.de < a.para).map((a) => `${a.de}-${a.para}`))].join(', ') || 'nenhum'}`,
      ];
      if (s.controlador && s.visao?.[e.nome]) l.push(`Caminhos que o controlador calculou para ${e.nome} (usados para responder packet-in):`, ...Object.entries(s.visao[e.nome]!).map(([p, porta]) => `  ${p.padEnd(19)} → ${porta}`));
      l.push('TABELAS DE FLUXO:', ...comTabela.flatMap(linhasTabela));
      if (s.packetIn) l.push(`Pacotes que subiram ao controlador (packet-in): ${s.packetIn}`);
      return l;
    }
    case 'telemetria': {
      if (!s.controlador) return ['Sem controlador, ninguém consulta os contadores. Ligue com "sdn controlador on".'];
      const tel: NonNullable<EstadoSdn['telemetria']> = {};
      const l = ['TELEMETRIA: o controlador pede os contadores de cada regra e de cada porta a todos os equipamentos.'];
      for (const x of m.equipamentos.values()) {
        const rs = fluxosDe(x);
        if (!rs.length) continue;
        tel[x.nome] = Object.fromEntries(rs.map((r: RegraFluxo) => [String(r.id), { prioridade: r.prioridade, casamento: textoCasamento(r.casamento), acoes: textoAcoes(r.acoes), pacotes: r.contadores.pacotes, bytes: r.contadores.bytes }]));
        l.push(...linhasTabela(x));
        l.push(`    portas: ${x.portas.map((p) => `${p.nome} rx ${p.contadores.rx}`).join(', ')}`);
      }
      if (!Object.keys(tel).length) l.push('  Nenhuma tabela de fluxo instalada ainda.');
      const total = Object.values(tel).reduce((n, t) => n + Object.values(t).reduce((k, r) => k + r.pacotes, 0), 0);
      const top = Object.entries(tel).flatMap(([eq, t]) => Object.entries(t).map(([id, r]) => ({ eq, id, n: r.pacotes }))).sort((a, b) => b.n - a.n)[0];
      l.push(`Total casado em regras: ${total} pacote(s).${top ? ` Regra que mais carrega: ${top.eq} #${top.id}, com ${top.n} pacote(s).` : ''}`);
      s.telemetria = tel;
      return l;
    }
  }
  return ['sdn controlador <on|off> | sdn regra <prioridade> <casamento> <ação> [em <equipamento>] | sdn apagar <id|tudo> | sdn ver | sdn telemetria'];
}

/* ---------- Entrada ---------- */

/** Comandos de QoS e SDN no console de roteador (e os de SDN no switch). Devolve null se o comando não é daqui. */
export function comandosQos(m: Mundo, e: Equipamento, cmd: string, args: string[]): Saida | null {
  const roteador = e.tipo === 'roteador';
  switch (cmd) {
    case 'mostra':
      if (args[0] === 'fluxos') return ['TABELA DE FLUXO', ...linhasTabela(e)];
      if (!roteador) return null;
      if (args[0] === 'fila') return mostraFila(m, e);
      if (args[0] === 'qos') return mostraQos(m, e);
      return null;
    case 'sdn':
      return cmdSdn(m, e, args);
  }
  if (!roteador) return null;
  switch (cmd) {
    case 'fila':
      return cmdFila(m, e, args);
    case 'balde':
      return cmdBalde(m, args);
    case 'escalonar':
      return cmdEscalonar(m, e, args);
    case 'dscp':
      return cmdDscp(m, e, args);
    case 'rsvp':
      return cmdRsvp(m, e, args);
    case 'qos':
      if (args[0] !== 'requisitos') return ['qos requisitos | mostra qos'];
      return [
        'REQUISITOS DE CADA APLICAÇÃO (o quanto ela sofre com cada coisa)',
        'APLICAÇÃO           BANDA   ATRASO  JITTER  PERDA',
        ...REQUISITOS.map((r) => `  ${r.aplicacao.padEnd(18)}${r.banda.padEnd(8)}${r.atraso.padEnd(8)}${r.jitter.padEnd(8)}${r.perda}`),
        ...REQUISITOS.map((r) => `  ${r.aplicacao}: ${r.referencia}`),
      ];
  }
  return null;
}

/** Para o dia conferir: o roteador marca o tráfego de "ip" (origem) com a classe? */
export function marcaPara(e: Equipamento, ip: number): number | null {
  for (const x of marcasDscp(e)) {
    const c = lerCidr(x.prefixo);
    if (c && x.campo === 'origem' && pertence(ip, c)) return x.dscp;
  }
  return null;
}
