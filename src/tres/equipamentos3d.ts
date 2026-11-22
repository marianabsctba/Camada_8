// Equipamentos e cabos do dia, modelados aqui mesmo: rack de 19", aparelhos de 1U e 2U com
// painel frontal desenhado, PCs na bancada e cabos com LED de enlace lendo o estado do motor.

import * as THREE from 'three';
import { avaliar } from '../motor/fisico';
import { caboNaPorta, type Cabo, type Equipamento, type Mundo } from '../motor/mundo';
import { ipTexto } from '../motor/util';

const U = 0.0445; // uma unidade de rack
const LARG = 0.44; // largura útil de 19"
const PROF = 0.3;

export const RACK = { x: 0.6, z: -2.55 }; // centro do rack, encostado na parede do fundo
export const BANCADA = { x: -2.55, z0: -1.6, passo: 0.8 }; // aparelhos de mesa, na parede da esquerda
export const MESA_Y = 0.76;

const NO_RACK = new Set<Equipamento['tipo']>(['switch', 'hub', 'roteador', 'mux', 'cmts', 'gateway-sat', 'terminal-sat']);

export interface Alvo {
  tipo: 'equip' | 'cabo';
  id: string;
  rotulo: string;
}

interface PortaPos {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
}

/* ---------- materiais ---------- */

const metal = (cor: string, aspereza = 0.45) => new THREE.MeshStandardMaterial({ color: cor, metalness: 0.7, roughness: aspereza });
const MAT = {
  rack: metal('#1b1f24', 0.55),
  trilho: metal('#9aa3ad', 0.35),
  chassi: metal('#2a3038', 0.4),
  plastico: new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.6 }),
  plasticoEscuro: new THREE.MeshStandardMaterial({ color: '#202327', roughness: 0.55 }),
  tela: new THREE.MeshStandardMaterial({ color: '#05080b', roughness: 0.2, metalness: 0.1 }),
  antena: new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.5 }),
};

function ledMat(cor: string, intensidade: number) {
  return new THREE.MeshStandardMaterial({ color: '#111', emissive: cor, emissiveIntensity: intensidade, roughness: 0.3 });
}
const LED = {
  verde: ledMat('#3ddc84', 2.4),
  ambar: ledMat('#ffb020', 2.2),
  apagado: ledMat('#000000', 0),
  azul: ledMat('#4a8cff', 1.6),
};

/* ---------- textura do painel frontal ---------- */

function painel(e: Equipamento, w: number, h: number, posicoes: { x: number; y: number; fibra: boolean; nome: string }[], tema: 'escuro' | 'claro' = 'escuro') {
  const escala = 1600;
  const cw = Math.round(w * escala);
  const ch = Math.max(48, Math.round(h * escala));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d')!;
  const fundo = g.createLinearGradient(0, 0, 0, ch);
  if (tema === 'escuro') {
    fundo.addColorStop(0, '#3a414b');
    fundo.addColorStop(1, '#262b32');
  } else {
    fundo.addColorStop(0, '#ecebe6');
    fundo.addColorStop(1, '#cfcdc6');
  }
  g.fillStyle = fundo;
  g.fillRect(0, 0, cw, ch);
  // ranhuras de ventilação
  g.fillStyle = tema === 'escuro' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.12)';
  for (let x = cw * 0.04; x < cw * 0.2; x += 9) g.fillRect(x, ch * 0.2, 4, ch * 0.6);
  // nome e modelo
  g.fillStyle = tema === 'escuro' ? '#e8edf2' : '#2b2f35';
  g.font = `700 ${Math.round(Math.min(ch * 0.26, cw * 0.11))}px "Saira Condensed", sans-serif`;
  g.textBaseline = 'middle';
  g.fillText(e.nome.toUpperCase(), cw * 0.215, Math.min(ch * 0.34, cw * 0.12), cw * 0.76);
  g.fillStyle = tema === 'escuro' ? '#93a1b1' : '#5d646d';
  g.font = `${Math.round(Math.min(ch * 0.16, cw * 0.05))}px "Fira Code", monospace`;
  g.fillText(e.modelo.slice(0, 34), cw * 0.215, Math.min(ch * 0.7, cw * 0.22), cw * 0.76);
  // tomadas
  for (const p of posicoes) {
    const px = (p.x / w + 0.5) * cw;
    const py = (0.5 - p.y / h) * ch;
    const pw = (p.fibra ? 0.0135 : 0.0145) * escala;
    const ph = (p.fibra ? 0.0085 : 0.0125) * escala;
    g.fillStyle = '#08090b';
    g.fillRect(px - pw / 2, py - ph / 2, pw, ph);
    g.strokeStyle = p.fibra ? '#7d8a99' : '#525a64';
    g.lineWidth = 2;
    g.strokeRect(px - pw / 2, py - ph / 2, pw, ph);
    if (!p.fibra) {
      g.fillStyle = '#c8a24a';
      for (let i = 0; i < 8; i++) g.fillRect(px - pw / 2 + 3 + i * ((pw - 6) / 8), py - ph / 2 + 2, (pw - 6) / 8 - 1, 3);
    }
    g.fillStyle = tema === 'escuro' ? '#b9c3cf' : '#4a5058';
    g.font = `${Math.round(Math.min(ch * 0.13, 16))}px "Fira Code", monospace`;
    g.textAlign = 'center';
    g.fillText(p.nome, px, py + ph / 2 + 11);
    g.textAlign = 'left';
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, metalness: tema === 'escuro' ? 0.15 : 0.02, roughness: 0.55 });
}

function etiqueta(texto: string[], larg: number, alt: number, fundo = '#fff27a', cor = '#2b2410') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * alt) / larg);
  const g = c.getContext('2d')!;
  g.fillStyle = fundo;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = cor;
  g.font = '40px "Atkinson Hyperlegible", sans-serif';
  g.textBaseline = 'top';
  let y = 30;
  for (const linha of texto) {
    const palavras = linha.split(' ');
    let atual = '';
    for (const p of palavras) {
      const teste = atual ? `${atual} ${p}` : p;
      if (g.measureText(teste).width > c.width - 50) {
        g.fillText(atual, 25, y);
        y += 48;
        atual = p;
      } else atual = teste;
    }
    g.fillText(atual, 25, y);
    y += 60;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
}

/* ---------- rack ---------- */

function rack42(): THREE.Group {
  const g = new THREE.Group();
  const alt = 42 * U + 0.1;
  const largExt = 0.6;
  const profExt = 0.8;
  const poste = new THREE.BoxGeometry(0.035, alt, 0.035);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const p = new THREE.Mesh(poste, MAT.rack);
      p.position.set((sx * (largExt - 0.035)) / 2, alt / 2 + 0.05, (sz * (profExt - 0.035)) / 2);
      g.add(p);
    }
  // trilhos de 19" com furação quadrada
  const furos = document.createElement('canvas');
  furos.width = 32;
  furos.height = 128;
  const fg = furos.getContext('2d')!;
  fg.fillStyle = '#a7b0ba';
  fg.fillRect(0, 0, 32, 128);
  fg.fillStyle = '#0b0d10';
  for (let i = 0; i < 3; i++) fg.fillRect(10, 8 + i * 42, 12, 12);
  const tf = new THREE.CanvasTexture(furos);
  tf.wrapT = THREE.RepeatWrapping;
  tf.repeat.set(1, 42);
  const trilhoMat = new THREE.MeshStandardMaterial({ map: tf, metalness: 0.7, roughness: 0.35 });
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.018, 42 * U, 0.004), trilhoMat);
    t.position.set(sx * (LARG / 2 + 0.012), (42 * U) / 2 + 0.1, profExt / 2 - 0.09);
    g.add(t);
  }
  for (const y of [0.05, alt + 0.05]) {
    const tampa = new THREE.Mesh(new THREE.BoxGeometry(largExt, 0.04, profExt), MAT.rack);
    tampa.position.y = y;
    g.add(tampa);
  }
  // laterais fechadas com perfuração
  const lat = new THREE.MeshStandardMaterial({ color: '#15181c', metalness: 0.6, roughness: 0.6, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(profExt - 0.04, alt - 0.04), lat);
    l.rotation.y = Math.PI / 2;
    l.position.set((sx * largExt) / 2, alt / 2 + 0.05, 0);
    g.add(l);
  }
  // régua de energia e organizador de cabos vertical
  const regua = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.05), MAT.plasticoEscuro);
  regua.position.set(largExt / 2 - 0.06, 1.0, -profExt / 2 + 0.08);
  g.add(regua);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

/* ---------- aparelhos ---------- */

interface Montado {
  grupo: THREE.Group;
  portas: Map<string, PortaPos>;
  leds: Map<string, THREE.Mesh>;
}

function aparelhoRack(e: Equipamento, alturaU: number): Montado {
  const g = new THREE.Group();
  const h = alturaU * U - 0.002;
  const rj = e.portas.filter((p) => p.fisica !== 'sfp');
  const sfp = e.portas.filter((p) => p.fisica === 'sfp');
  const espaco = 0.2;
  const passo = Math.min(0.022, espaco / Math.max(1, rj.length));
  const pos: { x: number; y: number; fibra: boolean; nome: string }[] = [];
  rj.forEach((p, i) => pos.push({ x: -0.02 + i * passo, y: 0, fibra: false, nome: p.nome }));
  sfp.forEach((p, i) => pos.push({ x: 0.19 - (sfp.length - 1 - i) * 0.02, y: 0, fibra: true, nome: p.nome }));
  const frente = painel(e, LARG, h, pos);
  const lados = MAT.chassi;
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(LARG, h, PROF), [lados, lados, lados, lados, frente, lados]);
  corpo.castShadow = true;
  g.add(corpo);
  // orelhas de fixação
  for (const sx of [-1, 1]) {
    const orelha = new THREE.Mesh(new THREE.BoxGeometry(0.022, h, 0.003), MAT.trilho);
    orelha.position.set(sx * (LARG / 2 + 0.011), 0, PROF / 2);
    g.add(orelha);
  }
  const portas = new Map<string, PortaPos>();
  const leds = new Map<string, THREE.Mesh>();
  const ledGeo = new THREE.BoxGeometry(0.004, 0.0025, 0.002);
  for (const p of pos) {
    portas.set(p.nome, { pos: new THREE.Vector3(p.x, p.y, PROF / 2 + 0.004), normal: new THREE.Vector3(0, 0, 1) });
    const led = new THREE.Mesh(ledGeo, LED.apagado);
    led.position.set(p.x + 0.006, p.y + h * 0.36, PROF / 2 + 0.001);
    g.add(led);
    leds.set(p.nome, led);
  }
  const energia = new THREE.Mesh(ledGeo, LED.azul);
  energia.position.set(-LARG / 2 + 0.02, h * 0.3, PROF / 2 + 0.001);
  g.add(energia);
  return { grupo: g, portas, leds };
}

function pcBancada(e: Equipamento, tela: string[]): Montado {
  const g = new THREE.Group();
  // gabinete torre
  const torre = new THREE.Group();
  const gab = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.42, 0.42), MAT.plasticoEscuro);
  gab.position.y = 0.21;
  gab.castShadow = true;
  torre.add(gab);
  const frente = painel(e, 0.19, 0.42, [{ x: 0, y: -0.15, fibra: false, nome: 'eth0' }]);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.42), frente);
  face.position.set(0, 0.21, 0.211);
  torre.add(face);
  torre.position.set(-0.32, 0, 0);
  g.add(torre);
  // monitor
  const mon = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.012, 24), MAT.plasticoEscuro);
  mon.add(base);
  const haste = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.02), MAT.plasticoEscuro);
  haste.position.set(0, 0.085, -0.02);
  mon.add(haste);
  const moldura = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.025), MAT.plasticoEscuro);
  moldura.position.set(0, 0.3, 0);
  moldura.castShadow = true;
  mon.add(moldura);
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 384;
  const gc = c.getContext('2d')!;
  gc.fillStyle = '#071017';
  gc.fillRect(0, 0, 640, 384);
  gc.fillStyle = '#3ddc84';
  gc.font = '26px "Fira Code", monospace';
  tela.forEach((l, i) => gc.fillText(l, 24, 50 + i * 38));
  const tt = new THREE.CanvasTexture(c);
  tt.colorSpace = THREE.SRGBColorSpace;
  const telaMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.27), new THREE.MeshStandardMaterial({ map: tt, emissive: '#ffffff', emissiveMap: tt, emissiveIntensity: 0.55, roughness: 0.25 }));
  telaMesh.position.set(0, 0.3, 0.0131);
  mon.add(telaMesh);
  mon.position.set(0.05, 0, -0.08);
  g.add(mon);
  // teclado
  const teclado = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.14), MAT.plasticoEscuro);
  teclado.position.set(0.05, 0.009, 0.16);
  g.add(teclado);
  const portas = new Map<string, PortaPos>([['eth0', { pos: new THREE.Vector3(-0.32, 0.06, 0.215), normal: new THREE.Vector3(0, 0, 1) }]]);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.002), LED.apagado);
  led.position.set(-0.30, 0.075, 0.212);
  g.add(led);
  return { grupo: g, portas, leds: new Map([['eth0', led]]) };
}

function caixinha(e: Equipamento): Montado {
  const g = new THREE.Group();
  const claro = e.tipo === 'ap' || e.tipo === 'cablemodem' || e.tipo === 'modem';
  const w = e.tipo === 'radio' ? 0.24 : 0.26;
  const h = e.tipo === 'radio' ? 0.24 : 0.045;
  const d = e.tipo === 'radio' ? 0.07 : 0.18;
  const pos = e.portas.map((p, i) => ({ x: 0.04 + i * 0.03 - (e.portas.length - 1) * 0.015, y: e.tipo === 'radio' ? -0.08 : -0.004, fibra: false, nome: p.nome }));
  const frente = painel(e, w, h, pos, claro ? 'claro' : 'escuro');
  const lado = claro ? MAT.plastico : MAT.plasticoEscuro;
  const corpo = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [lado, lado, lado, lado, frente, lado]);
  corpo.position.y = h / 2;
  corpo.castShadow = true;
  g.add(corpo);
  if (e.tipo === 'ap' || e.tipo === 'cablemodem') {
    for (const sx of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.17, 10), MAT.antena);
      a.position.set(sx * (w / 2 - 0.02), h + 0.085, -d / 2 + 0.02);
      a.rotation.z = sx * 0.18;
      g.add(a);
    }
  }
  if (e.tipo === 'radio') {
    // antena de painel no suporte, virada para a "janela" do enlace
    const suporte = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 10), MAT.trilho);
    suporte.position.set(0, 0.15, -0.06);
    g.add(suporte);
  }
  if (e.tipo === 'terminal-sat') {
    const prato = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, 0.6), new THREE.MeshStandardMaterial({ color: '#e6e6e1', roughness: 0.5, side: THREE.DoubleSide }));
    prato.rotation.x = -1.0;
    prato.position.set(0, 0.3, -0.05);
    g.add(prato);
  }
  const portas = new Map<string, PortaPos>();
  const leds = new Map<string, THREE.Mesh>();
  for (const p of pos) {
    portas.set(p.nome, { pos: new THREE.Vector3(p.x, h / 2 + p.y, d / 2 + 0.004), normal: new THREE.Vector3(0, 0, 1) });
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.003, 0.002), LED.apagado);
    led.position.set(p.x, h / 2 + p.y + 0.014, d / 2 + 0.001);
    g.add(led);
    leds.set(p.nome, led);
  }
  return { grupo: g, portas, leds };
}

/* ---------- cabos ---------- */

function corDoCabo(c: Cabo, m: Mundo): string {
  if (c.meio === 'fibra') {
    const segs = c.segmentos ?? [];
    return segs.some((s) => s.fibra === 'os2') && !segs.every((s) => s.fibra === 'os2') ? '#e8c81e' : segs[0]?.fibra === 'os2' ? '#f2d21b' : segs[0]?.fibra === 'om1' ? '#ff8a1e' : '#2fc4c4';
  }
  if (c.meio === 'coax') return '#1a1a1a';
  if (c.meio === 'cat6a') return '#7a5cff';
  if (c.meio === 'cat6') return '#ff7a1a';
  void m;
  return '#4a8cff';
}

function tuboCabo(a: PortaPos, b: PortaPos, cor: string, grosso: number): THREE.Mesh {
  const pa = a.pos.clone();
  const pb = b.pos.clone();
  const sa = pa.clone().addScaledVector(a.normal, 0.09);
  const sb = pb.clone().addScaledVector(b.normal, 0.09);
  const dist = pa.distanceTo(pb);
  const fundo = Math.max(0.05, Math.min(pa.y, pb.y) - 0.15 - dist * 0.12);
  const meio = sa.clone().lerp(sb, 0.5);
  meio.y = fundo;
  const pontos = [pa, sa, sa.clone().lerp(meio, 0.5).setY((sa.y + fundo) / 2 - 0.05), meio, sb.clone().lerp(meio, 0.5).setY((sb.y + fundo) / 2 - 0.05), sb, pb];
  const curva = new THREE.CatmullRomCurve3(pontos, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curva, 80, grosso, 8, false);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55 }));
  mesh.castShadow = true;
  return mesh;
}

function feixe(a: PortaPos, b: PortaPos, cor: string): THREE.Mesh {
  const pa = a.pos.clone().add(new THREE.Vector3(0, 0.25, 0));
  const pb = b.pos.clone().add(new THREE.Vector3(0, 0.25, 0));
  const meio = pa.clone().lerp(pb, 0.5).add(new THREE.Vector3(0, 0.6, 0));
  const curva = new THREE.QuadraticBezierCurve3(pa, meio, pb);
  const geo = new THREE.TubeGeometry(curva, 60, 0.01, 6, false);
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.45 }));
}

/* ---------- montagem do dia ---------- */

export interface Cena3d {
  raiz: THREE.Group;
  alvos: THREE.Object3D[];
  piscar: THREE.Mesh[];
  obstaculos: [number, number, number, number][];
}

export function montarEquipamentos(m: Mundo, notas: string[]): Cena3d {
  const raiz = new THREE.Group();
  const alvos: THREE.Object3D[] = [];
  const piscar: THREE.Mesh[] = [];
  const montados = new Map<string, Montado>();

  const rack = rack42();
  rack.position.set(RACK.x, 0, RACK.z);
  raiz.add(rack);

  // post-it do dia colado na lateral do rack
  const nota = etiqueta(notas, 0.16, 0.16);
  nota.position.set(RACK.x + 0.301, 1.55, RACK.z + 0.25);
  nota.rotation.y = Math.PI / 2;
  nota.rotation.z = 0.06;
  raiz.add(nota);

  let uAtual = 30; // de cima para baixo, começando na altura do peito
  let slot = 0;
  for (const e of m.equipamentos.values()) {
    let montado: Montado;
    if (NO_RACK.has(e.tipo)) {
      const alturaU = e.tipo === 'mux' || e.tipo === 'cmts' || e.tipo === 'gateway-sat' ? 2 : 1;
      montado = aparelhoRack(e, alturaU);
      uAtual -= alturaU;
      montado.grupo.position.set(RACK.x, 0.1 + (uAtual + alturaU / 2) * U, RACK.z + 0.4 - PROF / 2 - 0.09 + 0.003);
      uAtual -= 1; // uma unidade livre entre aparelhos, para os cabos respirarem
    } else {
      montado = e.tipo === 'pc' ? pcBancada(e, telaDoPc(e)) : caixinha(e);
      montado.grupo.position.set(BANCADA.x, MESA_Y, BANCADA.z0 + slot * BANCADA.passo);
      montado.grupo.rotation.y = Math.PI / 2;
      slot++;
    }
    montado.grupo.userData.alvo = { tipo: 'equip', id: e.nome, rotulo: `${e.nome} · ${e.modelo}` } satisfies Alvo;
    raiz.add(montado.grupo);
    alvos.push(montado.grupo);
    montados.set(e.nome, montado);
  }
  raiz.updateMatrixWorld(true);

  const mundo = (eq: string, porta: string): PortaPos | null => {
    const mt = montados.get(eq);
    const p = mt?.portas.get(porta);
    if (!mt || !p) return null;
    return { pos: mt.grupo.localToWorld(p.pos.clone()), normal: p.normal.clone().applyQuaternion(mt.grupo.getWorldQuaternion(new THREE.Quaternion())) };
  };

  for (const c of m.cabos.values()) {
    const a = mundo(c.a.equip, c.a.porta);
    const b = mundo(c.b.equip, c.b.porta);
    if (!a || !b) continue;
    const est = avaliar(m, c);
    const malha = c.meio === 'radio' || c.meio === 'satelite' ? feixe(a, b, est.up ? '#3ddc84' : '#ff5d5d') : tuboCabo(a, b, corDoCabo(c, m), c.meio === 'fibra' ? 0.0022 : c.meio === 'coax' ? 0.0035 : 0.003);
    malha.userData.alvo = { tipo: 'cabo', id: c.id, rotulo: `${c.id} · ${c.meio.toUpperCase()} · ${c.metros} m · ${est.up ? 'ativo' : 'fora'}` } satisfies Alvo;
    raiz.add(malha);
    alvos.push(malha);
  }

  // LEDs de enlace: verde ativo, âmbar piscando com cabo e sem enlace, apagado sem cabo
  for (const [nome, mt] of montados) {
    for (const [porta, led] of mt.leds) {
      const c = caboNaPorta(m, { equip: nome, porta });
      if (!c) continue;
      const est = avaliar(m, c);
      led.material = est.up ? LED.verde : LED.ambar;
      if (est.up && est.ber > 1e-9) piscar.push(led);
      if (!est.up) piscar.push(led);
    }
  }

  // obstáculos para colisão: rack e bancada
  const obstaculos: [number, number, number, number][] = [
    [RACK.x - 0.32, RACK.x + 0.32, RACK.z - 0.42, RACK.z + 0.42],
    [BANCADA.x - 0.4, BANCADA.x + 0.4, BANCADA.z0 - 0.5, BANCADA.z0 + Math.max(1, slot) * BANCADA.passo],
  ];
  return { raiz, alvos, piscar, obstaculos };
}

function telaDoPc(e: Equipamento): string[] {
  return [`${e.nome}@camada8:~$`, e.ip ? `inet ${ipTexto(e.ip.endereco)}/${e.ip.prefixo}` : 'inet (nenhum)', `ether ${e.mac}`, '', '$ _'];
}

export function quantasBancadas(m: Mundo): number {
  return [...m.equipamentos.values()].filter((e) => !NO_RACK.has(e.tipo)).length;
}
