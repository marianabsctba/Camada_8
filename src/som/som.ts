// Som do jogo, todo sintetizado na hora com a Web Audio API: nenhum arquivo de áudio.
// Efeitos curtos confirmam ação e avisam erro; o ambiente de cada lugar dá o clima.
// Regras: só liga depois de um gesto da pessoa (política de autoplay dos navegadores),
// suspende quando a aba some, e sem Web Audio (testes, navegador antigo) tudo vira nada.

export type Efeito =
  | 'clique'
  | 'acao'
  | 'certo'
  | 'errado'
  | 'rj45'
  | 'beep'
  | 'boot'
  | 'pacote'
  | 'recebido'
  | 'alarme'
  | 'fimDia'
  | 'mapa'
  | 'abertura';

export interface PreferenciasSom {
  /** 0 a 1. */
  volume: number;
  mudo: boolean;
  /** Só os efeitos, sem o ambiente dos lugares. */
  soEfeitos: boolean;
}

const CHAVE = 'camada8.som';
const PADRAO: PreferenciasSom = { volume: 0.6, mudo: false, soEfeitos: false };

function lerPreferencias(): PreferenciasSom {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Partial<PreferenciasSom>;
    return {
      volume: typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1 ? v.volume : PADRAO.volume,
      mudo: typeof v.mudo === 'boolean' ? v.mudo : PADRAO.mudo,
      soEfeitos: typeof v.soEfeitos === 'boolean' ? v.soEfeitos : PADRAO.soEfeitos,
    };
  } catch {
    return { ...PADRAO };
  }
}

function gravarPreferencias() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(pref));
  } catch {
    /* sem armazenamento: vale só nesta aba */
  }
}

let pref: PreferenciasSom = typeof localStorage === 'undefined' ? { ...PADRAO } : lerPreferencias();
const ouvintes = new Set<(p: PreferenciasSom) => void>();

let ctx: AudioContext | null = null;
let mestre: GainNode | null = null;
let busEfeitos: GainNode | null = null;
let busAmbiente: GainNode | null = null;
let ruidoBranco: AudioBuffer | null = null;
let ruidoRosa: AudioBuffer | null = null;
let ruidoMarrom: AudioBuffer | null = null;
let iniciado = false;
/** Ato do lugar pedido (null: tela sem ambiente). Guardado mesmo antes de o som destravar. */
let atoPedido: number | null = null;
let ambienteAtual: { ato: number; parar: () => void } | null = null;
const ultimoToque = new Map<Efeito, number>();

const temWebAudio = () => typeof window !== 'undefined' && typeof (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) === 'function';

/* ---------- Ligação: gesto, aba escondida, preferências ---------- */

/** Liga os ouvintes. Chame uma vez, no início. O AudioContext só nasce no primeiro gesto. */
export function iniciarSom(): void {
  if (iniciado || !temWebAudio()) return;
  iniciado = true;
  // para conferir no console do navegador: __c8som.estado()
  (window as unknown as { __c8som: unknown }).__c8som = { estado: estadoDoSom, preferencias: preferenciasSom, ambiente: () => ambienteAtual?.ato ?? null, tocar, lugar: ambiente };
  const destravar = () => {
    criarContexto();
    if (ctx && pref.mudo && ctx.state === 'running') void ctx.suspend().catch(() => {});
    else if (ctx && ctx.state !== 'running' && !pref.mudo && !document.hidden) void ctx.resume().catch(() => {});
    aplicarAmbiente();
  };
  // pointerdown e keydown contam como ativação pela pessoa em todos os navegadores atuais
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) addEventListener(ev, destravar, { capture: true, passive: true });
  // tique de tecla em qualquer botão da interface, num ouvinte só
  addEventListener(
    'click',
    (e) => {
      const alvo = (e.target as Element | null)?.closest?.('button, [role=button], li[tabindex], summary');
      if (alvo && !(alvo as HTMLButtonElement).disabled) tocar('clique');
    },
    { capture: true, passive: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend().catch(() => {});
    else if (!pref.mudo) void ctx.resume().catch(() => {});
  });
}

function criarContexto() {
  if (ctx || !temWebAudio()) return;
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C({ latencyHint: 'interactive' });
  } catch {
    ctx = null;
    return;
  }
  // mestre -> compressor suave -> saída: segura picos quando vários efeitos se somam
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  mestre = ctx.createGain();
  mestre.gain.value = ganhoMestre();
  mestre.connect(comp).connect(ctx.destination);
  busEfeitos = ctx.createGain();
  busEfeitos.gain.value = 0.9;
  busEfeitos.connect(mestre);
  busAmbiente = ctx.createGain();
  busAmbiente.gain.value = 0.32;
  busAmbiente.connect(mestre);
  // três ruídos de 3 s, feitos uma vez só (cerca de 1,7 MB no total), reaproveitados por todos os sons
  ruidoBranco = fazerRuido('branco');
  ruidoRosa = fazerRuido('rosa');
  ruidoMarrom = fazerRuido('marrom');
}

/** Volume percebido cresce mais ou menos com o quadrado da amplitude. */
const ganhoMestre = () => (pref.mudo ? 0 : pref.volume * pref.volume * 0.9);

export function preferenciasSom(): PreferenciasSom {
  return { ...pref };
}

export function ajustarSom(p: Partial<PreferenciasSom>): void {
  pref = { ...pref, ...p, volume: Math.max(0, Math.min(1, p.volume ?? pref.volume)) };
  gravarPreferencias();
  if (ctx && mestre) {
    mestre.gain.setTargetAtTime(ganhoMestre(), ctx.currentTime, 0.05);
    // mudo de verdade: o contexto para de processar e não gasta CPU
    if (pref.mudo) setTimeout(() => pref.mudo && void ctx?.suspend().catch(() => {}), 200);
    else if (!document.hidden) void ctx.resume().catch(() => {});
  }
  aplicarAmbiente();
  for (const f of ouvintes) f({ ...pref });
}

export function aoMudarSom(f: (p: PreferenciasSom) => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Estado do contexto, para conferir no navegador ("running" depois do clique). */
export function estadoDoSom(): AudioContextState | 'ausente' {
  return ctx?.state ?? 'ausente';
}

/* ---------- Peças: ruído, tom, envelope ---------- */

function fazerRuido(cor: 'branco' | 'rosa' | 'marrom'): AudioBuffer {
  const c = ctx!;
  const n = Math.floor(c.sampleRate * 3);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  // rosa pelo filtro de Paul Kellet (aproximação de -3 dB/oitava); marrom é ruído branco integrado com fuga
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, ultimo = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (cor === 'branco') d[i] = w * 0.5;
    else if (cor === 'rosa') {
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      ultimo = (ultimo + 0.02 * w) / 1.02;
      d[i] = ultimo * 3.5;
    }
  }
  // emenda do laço sem estalo: as pontas se cruzam em 20 ms
  const m = Math.floor(c.sampleRate * 0.02);
  for (let i = 0; i < m; i++) {
    const k = i / m;
    d[n - m + i] = d[n - m + i]! * (1 - k) + d[i]! * k;
  }
  return b;
}

interface OpTom {
  tipo?: OscillatorType;
  ganho?: number;
  ataque?: number;
  /** Frequência no fim (glissando exponencial). */
  ate?: number;
  pan?: number;
  passaBaixa?: number;
  destino?: AudioNode;
}

/** Envelope percussivo: sobe rápido e cai exponencial, sem clique no começo nem no fim. */
function envelope(g: AudioParam, t: number, pico: number, ataque: number, dur: number) {
  g.setValueAtTime(0.0001, t);
  g.linearRampToValueAtTime(pico, t + ataque);
  g.exponentialRampToValueAtTime(0.0001, t + dur);
}

function saidaCom(pan: number | undefined, destino: AudioNode): AudioNode {
  if (pan === undefined || !ctx!.createStereoPanner) return destino;
  const p = ctx!.createStereoPanner();
  p.pan.value = pan;
  p.connect(destino);
  return p;
}

function tom(freq: number, t: number, dur: number, o: OpTom = {}) {
  const c = ctx!;
  const osc = c.createOscillator();
  osc.type = o.tipo ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.ate) osc.frequency.exponentialRampToValueAtTime(o.ate, t + dur);
  const g = c.createGain();
  envelope(g.gain, t, o.ganho ?? 0.1, o.ataque ?? 0.005, dur);
  let no: AudioNode = osc;
  if (o.passaBaixa) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.passaBaixa;
    no.connect(f);
    no = f;
  }
  no.connect(g).connect(saidaCom(o.pan, o.destino ?? busEfeitos!));
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

interface OpRuido {
  cor?: 'branco' | 'rosa' | 'marrom';
  filtro?: BiquadFilterType;
  freq?: number;
  ate?: number;
  q?: number;
  ganho?: number;
  ataque?: number;
  pan?: number;
  destino?: AudioNode;
}

function ruido(t: number, dur: number, o: OpRuido = {}) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = o.cor === 'rosa' ? ruidoRosa : o.cor === 'marrom' ? ruidoMarrom : ruidoBranco;
  const f = c.createBiquadFilter();
  f.type = o.filtro ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq ?? 2000, t);
  if (o.ate) f.frequency.exponentialRampToValueAtTime(o.ate, t + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  envelope(g.gain, t, o.ganho ?? 0.1, o.ataque ?? 0.002, dur);
  src.connect(f).connect(g).connect(saidaCom(o.pan, o.destino ?? busEfeitos!));
  src.start(t, Math.random() * 2.5);
  src.stop(t + dur + 0.05);
}

/** Leve variação para nada soar idêntico duas vezes seguidas. */
const variar = (x: number, pct = 0.03) => x * (1 + (Math.random() * 2 - 1) * pct);

/* ---------- Efeitos ---------- */

/** Intervalo mínimo entre dois toques do mesmo efeito, para não empilhar. */
const INTERVALO: Partial<Record<Efeito, number>> = { clique: 0.04, pacote: 0.08, recebido: 0.08, alarme: 1.2, mapa: 1.5, fimDia: 1, abertura: 2, boot: 1.5 };

export function tocar(ef: Efeito, atraso = 0): void {
  if (!ctx || pref.mudo || ctx.state !== 'running' || !busEfeitos) return;
  const agora = ctx.currentTime;
  const ult = ultimoToque.get(ef) ?? -1;
  if (agora - ult < (INTERVALO[ef] ?? 0.06)) return;
  ultimoToque.set(ef, agora);
  const t = agora + 0.01 + atraso;
  try {
    EFEITOS[ef](t);
  } catch {
    /* um efeito que falhe não pode travar o jogo */
  }
}

const EFEITOS: Record<Efeito, (t: number) => void> = {
  // tique seco de tecla: transiente agudo curtinho
  clique: (t) => {
    ruido(t, 0.018, { filtro: 'highpass', freq: 3500, ganho: 0.06 });
    tom(variar(1800, 0.05), t, 0.025, { ganho: 0.025 });
  },
  // ação feita no aparelho: dois toques curtos subindo
  acao: (t) => {
    tom(660, t, 0.07, { tipo: 'triangle', ganho: 0.06 });
    tom(880, t + 0.06, 0.09, { tipo: 'triangle', ganho: 0.06 });
  },
  // passo certo: quinta justa subindo, timbre de sino leve
  certo: (t) => {
    const f = variar(660, 0.01);
    tom(f, t, 0.18, { ganho: 0.09 });
    tom(f * 1.5, t + 0.09, 0.35, { ganho: 0.09 });
    tom(f * 3, t + 0.09, 0.2, { ganho: 0.015 });
  },
  // passo errado: dois toques graves descendo, abafados; avisa sem castigar
  errado: (t) => {
    tom(233, t, 0.16, { tipo: 'square', ganho: 0.05, passaBaixa: 700 });
    tom(196, t + 0.13, 0.24, { tipo: 'square', ganho: 0.05, passaBaixa: 600 });
  },
  // conector RJ45 entrando no keystone: trava plástica, dois estalos e a ressonância do corpo
  rj45: (t) => {
    ruido(t, 0.012, { freq: 2600, q: 3, ganho: 0.12 });
    ruido(t + 0.035, 0.02, { freq: 3400, q: 4, ganho: 0.22 });
    tom(variar(2300, 0.04), t + 0.035, 0.04, { ganho: 0.03 });
    tom(180, t + 0.035, 0.05, { ganho: 0.04 });
  },
  // bipe de equipamento: senoide de 2 kHz, curta
  beep: (t) => {
    tom(2000, t, 0.09, { ganho: 0.045, ataque: 0.003 });
  },
  // roteador ligando: relé, ventoinha acelerando e o bipe do autoteste
  boot: (t) => {
    ruido(t, 0.015, { freq: 1500, q: 2, ganho: 0.12 });
    tom(110, t, 0.08, { ganho: 0.05 });
    ruido(t + 0.05, 1.6, { cor: 'rosa', freq: 180, ate: 1100, q: 1.2, ganho: 0.07, ataque: 0.9 });
    tom(1000, t + 1.45, 0.12, { ganho: 0.045 });
    tom(1500, t + 1.62, 0.1, { ganho: 0.035 });
  },
  // pacote saindo: chilreio curto para cima
  pacote: (t) => {
    tom(900, t, 0.06, { ate: 1800, ganho: 0.04, pan: -0.2 });
  },
  // resposta chegando: chilreio para baixo, do outro lado
  recebido: (t) => {
    tom(1700, t, 0.07, { ate: 1100, ganho: 0.04, pan: 0.2 });
  },
  // alarme do IDS: dois tons alternados, três vezes, filtrados para não furar o ouvido
  alarme: (t) => {
    for (let i = 0; i < 3; i++) {
      tom(880, t + i * 0.3, 0.14, { tipo: 'triangle', ganho: 0.07, passaBaixa: 2500 });
      tom(659, t + i * 0.3 + 0.15, 0.14, { tipo: 'triangle', ganho: 0.07, passaBaixa: 2500 });
    }
  },
  // chamado fechado: arpejo maior subindo, com cauda de sino
  fimDia: (t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tom(f, t + i * 0.11, 0.9 - i * 0.1, { ganho: 0.07, ataque: 0.008 });
      tom(f * 2, t + i * 0.11, 0.3, { ganho: 0.012 });
    });
  },
  // mapa acendendo: disjuntor ao longe e um brilho de notas pentatônicas espalhadas
  mapa: (t) => {
    ruido(t, 0.03, { freq: 400, q: 1, ganho: 0.08 });
    tom(70, t, 0.4, { ganho: 0.06 });
    const penta = [784, 880, 1046.5, 1174.7, 1318.5, 1568];
    for (let i = 0; i < 6; i++) tom(penta[Math.floor(Math.random() * penta.length)]!, t + 0.15 + i * 0.09 + Math.random() * 0.04, 0.5, { ganho: 0.03, pan: Math.random() * 1.2 - 0.6 });
  },
  // abertura de ato: acorde grave que abre devagar, como um filtro destampando
  abertura: (t) => {
    const c = ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(250, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 1.6);
    f.frequency.exponentialRampToValueAtTime(400, t + 3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    f.connect(g).connect(busEfeitos!);
    for (const [hz, det] of [[110, -6], [110, 6], [164.81, 0], [220, 3]] as const) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 3.3);
    }
  },
};

/** Reage ao que o aparelho respondeu, só olhando o texto (o motor não sabe que o som existe). */
export function somDosComandos(feito: { comando: string; saida: string[] }[]): void {
  // começa um tiquinho depois, para não cair em cima do som do botão ou do passo
  let atraso = 0.08;
  for (const f of feito) {
    const cmd = f.comando.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    const texto = f.saida.join('\n');
    if (/IDS viu|ALARME|alerta/i.test(texto) && !/0 alerta/.test(texto)) tocar('alarme', atraso);
    else if (cmd === 'religar' || cmd === 'boot' || /Inicializando\.\.\./.test(texto)) tocar('boot', atraso);
    else if (cmd === 'crimpar' || cmd === 'ligar' || cmd === 'trocar' || cmd === 'instalar') tocar('rj45', atraso);
    else if (cmd === 'testar' || cmd === 'login') tocar('beep', atraso);
    else if (/^(ping6?|traceroute|tracert|transmitir|transferir|enviar|capturar)$/.test(cmd)) {
      tocar('pacote', atraso);
      if (!/perd(a|eu|idos) 100|100 ?% de perda|sem resposta|inalcançável|esgotado/i.test(texto)) tocar('recebido', atraso + 0.16);
    }
    atraso += 0.05;
  }
}

/* ---------- Ambiente por lugar ---------- */

/** Pede o ambiente do lugar do ato (null desliga). Troca com fade cruzado. */
export function ambiente(ato: number | null): void {
  atoPedido = ato;
  aplicarAmbiente();
}

function aplicarAmbiente() {
  const quer = pref.mudo || pref.soEfeitos ? null : atoPedido;
  if (!ctx || !busAmbiente) return;
  if (ambienteAtual && ambienteAtual.ato === quer) return;
  ambienteAtual?.parar();
  ambienteAtual = null;
  if (quer === null) return;
  const ato = Math.max(0, Math.min(7, quer | 0));
  try {
    ambienteAtual = { ato: quer, parar: montarAmbiente(ato) };
  } catch {
    ambienteAtual = null;
  }
}

/** Um lugar montado: tudo que liga nele, para desligar de uma vez. */
class Cena {
  readonly saida: GainNode;
  private fontes: AudioScheduledSourceNode[] = [];
  private timers: number[] = [];
  private vivo = true;

  constructor() {
    const c = ctx!;
    this.saida = c.createGain();
    this.saida.gain.setValueAtTime(0.0001, c.currentTime);
    this.saida.gain.linearRampToValueAtTime(1, c.currentTime + 2.5);
    this.saida.connect(busAmbiente!);
  }

  /** Ruído contínuo filtrado, com laço de 3 s começando num ponto ao acaso. */
  ruido(cor: 'branco' | 'rosa' | 'marrom', tipo: BiquadFilterType, freq: number, q: number, ganho: number, pan = 0): { filtro: BiquadFilterNode; ganho: GainNode } {
    const c = ctx!;
    const src = c.createBufferSource();
    src.buffer = cor === 'rosa' ? ruidoRosa : cor === 'marrom' ? ruidoMarrom : ruidoBranco;
    src.loop = true;
    src.playbackRate.value = variar(1, 0.04);
    const f = c.createBiquadFilter();
    f.type = tipo;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = ganho;
    src.connect(f).connect(g).connect(saidaCom(pan, this.saida));
    src.start(c.currentTime, Math.random() * 2.9);
    this.fontes.push(src);
    return { filtro: f, ganho: g };
  }

  /** Tom contínuo (zumbido de rede elétrica, motor). */
  tom(freq: number, tipo: OscillatorType, ganho: number, passaBaixa?: number): { osc: OscillatorNode; ganho: GainNode } {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = tipo;
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = ganho;
    let no: AudioNode = o;
    if (passaBaixa) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = passaBaixa;
      o.connect(f);
      no = f;
    }
    no.connect(g).connect(this.saida);
    o.start();
    this.fontes.push(o);
    return { osc: o, ganho: g };
  }

  /** Oscilador lento que balança um parâmetro (pá de ventilador, ronco irregular). */
  lfo(param: AudioParam, hz: number, profundidade: number, tipo: OscillatorType = 'sine') {
    const c = ctx!;
    const o = c.createOscillator();
    o.type = tipo;
    o.frequency.value = hz;
    const g = c.createGain();
    g.gain.value = profundidade;
    o.connect(g).connect(param);
    o.start();
    this.fontes.push(o);
  }

  /** Faz o parâmetro vagar entre min e max, devagar, em intervalos ao acaso: nunca repete igual. */
  vagar(param: AudioParam, min: number, max: number, cadaMin: number, cadaMax: number) {
    this.repetir(cadaMin, cadaMax, (t) => param.setTargetAtTime(min + Math.random() * (max - min), t, (cadaMin + cadaMax) / 6));
  }

  /** Agenda um evento solto em intervalos ao acaso (em segundos). */
  repetir(min: number, max: number, fn: (t: number) => void) {
    const passo = () => {
      if (!this.vivo) return;
      // aba escondida ou mudo: não acumula eventos para tocar todos juntos na volta
      if (ctx && ctx.state === 'running') {
        try {
          fn(ctx.currentTime + 0.02);
        } catch {
          /* segue */
        }
      }
      this.timers.push(window.setTimeout(passo, (min + Math.random() * (max - min)) * 1000));
      if (this.timers.length > 32) this.timers.splice(0, 16);
    };
    this.timers.push(window.setTimeout(passo, (min + Math.random() * (max - min)) * 1000));
  }

  parar = () => {
    if (!this.vivo) return;
    this.vivo = false;
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
    const c = ctx!;
    const t = c.currentTime;
    this.saida.gain.cancelScheduledValues(t);
    this.saida.gain.setValueAtTime(Math.max(0.0001, this.saida.gain.value), t);
    this.saida.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    for (const f of this.fontes) {
      try {
        f.stop(t + 1.3);
      } catch {
        /* já parada */
      }
    }
    const saida = this.saida;
    setTimeout(() => saida.disconnect(), 1500);
    this.fontes = [];
  };
}

function montarAmbiente(ato: number): () => void {
  const cena = new Cena();
  const s = cena.saida;
  switch (ato) {
    case 0: {
      // galpão: reator de lâmpada fluorescente (rede de 60 Hz zumbe em 120 Hz) e a ventoinha do rack
      const hum = cena.tom(120, 'sawtooth', 0.018, 380);
      cena.tom(240, 'sine', 0.006);
      cena.vagar(hum.ganho.gain, 0.012, 0.022, 4, 9);
      const vent = cena.ruido('rosa', 'bandpass', 900, 0.8, 0.22);
      cena.lfo(vent.ganho.gain, 0.37, 0.03);
      cena.ruido('marrom', 'lowpass', 300, 0.7, 0.35);
      // de vez em quando a lâmpada falha e o zumbido treme
      cena.repetir(14, 35, (t) => {
        const g = hum.ganho.gain;
        for (let i = 0; i < 4; i++) g.setValueAtTime(i % 2 ? 0.03 : 0.006, t + i * 0.06);
        g.setTargetAtTime(0.018, t + 0.3, 0.1);
      });
      break;
    }
    case 1: {
      // rua à noite: vento que muda de força e grilos espalhados
      const vento = cena.ruido('rosa', 'lowpass', 500, 0.6, 0.5);
      cena.vagar(vento.filtro.frequency, 250, 900, 3, 7);
      cena.vagar(vento.ganho.gain, 0.2, 0.6, 3, 8);
      for (const [hz, pan] of [[4300, -0.6], [4700, 0.5], [5100, 0.1]] as const) {
        cena.repetir(0.8, 3.2, (t) => {
          // um cricrilar: 3 a 5 pulsos de 20 ms, como a asa raspando (aprox.)
          const n = 3 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) tom(variar(hz, 0.01), t + i * 0.045, 0.025, { ganho: 0.012, pan, destino: s });
        });
      }
      break;
    }
    case 2: {
      // central telefônica velha: ventilador que balança e relés de passo contando pulsos
      const vent = cena.ruido('marrom', 'lowpass', 520, 0.8, 0.5);
      cena.lfo(vent.ganho.gain, 1.7, 0.12);
      const motor = cena.tom(92, 'triangle', 0.01, 300);
      cena.lfo(motor.ganho.gain, 1.7, 0.006);
      cena.repetir(2.5, 8, (t) => {
        // discagem decádica: 10 pulsos por segundo, como o seletor de passo recebe (aprox.)
        const n = Math.random() < 0.4 ? 1 : 2 + Math.floor(Math.random() * 7);
        const pan = Math.random() * 1.4 - 0.7;
        for (let i = 0; i < n; i++) {
          ruido(t + i * 0.1, 0.012, { freq: variar(2200, 0.1), q: 3, ganho: 0.05, pan, destino: s });
          tom(140, t + i * 0.1, 0.03, { ganho: 0.015, pan, destino: s });
        }
      });
      break;
    }
    case 3: {
      // escola: ventilador de teto girando e o pátio lá longe, sem nenhuma voz que se entenda
      const teto = cena.ruido('rosa', 'bandpass', 380, 0.7, 0.3);
      cena.lfo(teto.ganho.gain, 1.05, 0.09);
      const patio = cena.ruido('rosa', 'bandpass', 900, 1.4, 0.06);
      cena.vagar(patio.ganho.gain, 0.02, 0.1, 3, 7);
      cena.vagar(patio.filtro.frequency, 700, 1200, 2, 5);
      // bola quicando ao longe, às vezes duas ou três vezes
      cena.repetir(6, 16, (t) => {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) tom(160, t + i * 0.42, 0.09, { ate: 90, ganho: 0.03 * (1 - i * 0.25), passaBaixa: 600, destino: s });
      });
      break;
    }
    case 4:
    case 5: {
      // data center e sala dos servidores: ar-condicionado de precisão e o coro de ventoinhas
      const sala = ato === 5;
      cena.ruido('marrom', 'lowpass', sala ? 380 : 300, 0.7, 0.55);
      const fans = cena.ruido('rosa', 'bandpass', sala ? 2400 : 1800, 0.5, sala ? 0.14 : 0.1, -0.2);
      cena.ruido('rosa', 'bandpass', sala ? 3100 : 2600, 0.6, 0.05, 0.3);
      cena.vagar(fans.ganho.gain, sala ? 0.11 : 0.08, sala ? 0.16 : 0.12, 6, 14);
      cena.tom(180, 'sine', 0.004);
      // um bipe de equipamento distante, raro
      cena.repetir(25, 60, (t) => tom(sala ? 1800 : 2100, t, 0.06, { ganho: 0.006, pan: Math.random() - 0.5, destino: s }));
      break;
    }
    case 6: {
      // estádio vazio na cabine, torcida ao longe atrás do vidro: ruído em três formantes que vagam (sem voz)
      for (const [hz, q, g] of [[420, 3, 0.14], [1100, 4, 0.08], [2300, 5, 0.03]] as const) {
        const f = cena.ruido('rosa', 'bandpass', hz, q, g, Math.random() * 0.6 - 0.3);
        cena.vagar(f.filtro.frequency, hz * 0.85, hz * 1.15, 0.6, 1.6);
        cena.vagar(f.ganho.gain, g * 0.5, g * 1.2, 1, 3);
      }
      cena.ruido('marrom', 'lowpass', 200, 0.7, 0.2);
      // às vezes a arquibancada se levanta: uma onda que sobe e desce
      cena.repetir(18, 45, (t) => {
        s.gain.setTargetAtTime(1.9, t, 0.8);
        s.gain.setTargetAtTime(1, t + 2.5, 1.2);
      });
      break;
    }
    default: {
      // centro de operações: quase silêncio, ar-condicionado e um grave tenso que respira
      cena.ruido('marrom', 'lowpass', 350, 0.7, 0.4);
      const g1 = cena.tom(55, 'sine', 0.02);
      const g2 = cena.tom(82.4, 'sine', 0.008);
      cena.vagar(g1.ganho.gain, 0.008, 0.025, 6, 12);
      cena.vagar(g2.ganho.gain, 0.002, 0.01, 7, 14);
      cena.repetir(30, 70, (t) => tom(1320, t, 0.25, { ganho: 0.006, destino: s }));
      break;
    }
  }
  return cena.parar;
}
