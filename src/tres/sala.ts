// A sala do dia: monta o lugar do ato (lugares.ts) em volta do rack e da bancada.
// A área jogável, o rack, a bancada e a estante do almoxarifado ficam sempre no mesmo lugar;
// muda a casca, a luz e a mobília.

import * as THREE from 'three';
import type { Mundo } from '../motor/mundo';
import { montarExtra } from './cenario';
import { BANCADA, layoutBancada, montarEquipamentos, RACK, TRECHO_BANCADA, type Alvo, type Cena3d } from './equipamentos3d';
import { esperarCarga, movel, preCarregarMoveis } from './glb';
import { juntarEstaticos } from './juntar';
import { J, posicionar } from './jogador';
import { lugarDoAto, type Acabamento, type Lado, type Lugar, type Movel } from './lugares';
import { liberar, limparCena, M, refazerSombras, vigiarDesempenho } from './motor3d';
import { pbr, preCarregarTexturas } from './pbr';

const LX: [number, number] = [-3, 3];
const LZ: [number, number] = [-3, 3];

let equipamentos: Cena3d | null = null;
let fixo: THREE.Group | null = null;
let notasAtuais: string[] = [];
let alvosFixos: THREE.Object3D[] = [];
let destaque: { tipo: string; id: string } | null = null;
let seta: THREE.Group | null = null;
let lugar: Lugar = lugarDoAto(0);
let animacoes: ((t: number) => void)[] = [];

let setaPronta: THREE.Group | null = null;

/** A seta é uma só, criada uma vez e reaproveitada; sem luz própria, para não trocar a conta de luzes da cena. */
function criarSeta(): THREE.Group {
  if (setaPronta) return setaPronta;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ff7a1a', emissive: '#ff7a1a', emissiveIntensity: 1.6, roughness: 0.4 });
  const ponta = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 20), mat);
  ponta.rotation.x = Math.PI;
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.16, 12), mat);
  haste.position.y = 0.16;
  const anel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 8, 40), new THREE.MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.8 }));
  anel.rotation.x = Math.PI / 2;
  anel.name = 'anel';
  g.add(ponta, haste, anel);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.userData.fixo = true;
      (m.material as THREE.Material).userData.fixo = true;
    }
  });
  setaPronta = g;
  return g;
}

/** Põe a seta laranja em cima do objeto do passo atual (ou tira, com null). */
export function destacar(alvo: { tipo: string; id: string } | null) {
  destaque = alvo;
  posicionarSeta();
}

function posicionarSeta() {
  if (seta) M.cena.remove(seta);
  seta = null;
  if (!destaque || !equipamentos) return;
  const todos = [...equipamentos.alvos, ...alvosFixos];
  const obj = todos.find((o) => o.userData.alvo?.tipo === destaque!.tipo && o.userData.alvo?.id === destaque!.id);
  if (!obj) return;
  const caixa = new THREE.Box3().setFromObject(obj);
  if (caixa.isEmpty()) caixa.setFromCenterAndSize(obj.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0.6, 1.8, 0.6));
  // cabo: a seta fica sobre o meio do trecho no chão (a caixa de um cabo em L não tem cabo no centro)
  const centro = (obj.userData.meio as THREE.Vector3 | undefined)?.clone() ?? caixa.getCenter(new THREE.Vector3());
  seta = criarSeta();
  const topo = destaque.tipo === 'cabo' ? Math.max(0.6, centro.y + 0.45) : caixa.max.y + 0.25;
  seta.position.set(centro.x, topo, centro.z);
  seta.userData.base = topo;
  M.cena.add(seta);
}

/* ---------- casca: piso, teto e paredes com vãos ---------- */

/** Posição ao longo da parede no sistema local dela (o vão é dado em coordenada do mundo). */
function local(lado: Lado, c: number): number {
  return lado === 'fundo' || lado === 'dir' ? c : -c;
}

const POSE: Record<Lado, { x: number; z: number; ry: number }> = {
  fundo: { x: 0, z: LZ[0], ry: 0 },
  frente: { x: 0, z: LZ[1], ry: Math.PI },
  esq: { x: LX[0], z: 0, ry: Math.PI / 2 },
  dir: { x: LX[1], z: 0, ry: -Math.PI / 2 },
};

/** Material de acabamento com a textura repetindo a cada "m" metros (UV em metros). */
function acabamento(a: Acabamento, tinta = a.tinta): THREE.MeshStandardMaterial {
  return pbr(a.tex, [1 / a.m, 1 / a.m], tinta);
}

function janela(parede: THREE.Group, c: number, v: { larg: number; base: number; topo: number }, mats: { caixilho: THREE.Material; vidro: THREE.Material; peitoril: THREE.Material; requadro: THREE.Material }) {
  const h = v.topo - v.base;
  const perfil = (pw: number, ph: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.07), mats.caixilho);
    m.position.set(x, y, -0.02);
    parede.add(m);
  };
  perfil(v.larg, 0.05, c, v.base + 0.025);
  perfil(v.larg, 0.05, c, v.topo - 0.025);
  perfil(0.05, h, c - v.larg / 2 + 0.025, v.base + h / 2);
  perfil(0.05, h, c + v.larg / 2 - 0.025, v.base + h / 2);
  const folhas = Math.max(2, Math.round(v.larg / 0.65));
  for (let k = 1; k < folhas; k++) perfil(0.035, h, c - v.larg / 2 + (k * v.larg) / folhas, v.base + h / 2);
  perfil(v.larg, 0.035, c, v.base + h * 0.62);
  const vd = new THREE.Mesh(new THREE.PlaneGeometry(v.larg, h), mats.vidro);
  vd.position.set(c, v.base + h / 2, -0.02);
  parede.add(vd);
  const pt = new THREE.Mesh(new THREE.BoxGeometry(v.larg + 0.1, 0.04, 0.18), mats.peitoril);
  pt.position.set(c, v.base - 0.02, 0.04);
  parede.add(pt);
  // requadro: a parede é uma placa fina, então o vão ganha espessura de alvenaria
  const lados: [number, number, number, number][] = [
    [v.larg, 0.02, c, v.topo],
    [0.02, h, c - v.larg / 2, v.base + h / 2],
    [0.02, h, c + v.larg / 2, v.base + h / 2],
  ];
  for (const [rw, rh, rx, ry] of lados) {
    const q = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, 0.2), mats.requadro);
    q.position.set(rx, ry, -0.1);
    parede.add(q);
  }
}

function casca(l: Lugar): THREE.Group {
  const g = new THREE.Group();
  const [px0, px1, pz0, pz1] = l.pisoArea ?? [LX[0], LX[1], LZ[0], LZ[1]];
  const pw = px1 - px0;
  const pd = pz1 - pz0;
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), pbr(l.piso.tex, [pw / l.piso.m, pd / l.piso.m], l.piso.tinta));
  piso.rotation.x = -Math.PI / 2;
  piso.position.set((px0 + px1) / 2, 0, (pz0 + pz1) / 2);
  piso.receiveShadow = true;
  g.add(piso);
  const w = LX[1] - LX[0];
  const d = LZ[1] - LZ[0];
  if (l.teto) {
    const teto = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pbr(l.teto.tex, [w / l.teto.m, d / l.teto.m], l.teto.tinta));
    teto.rotation.x = Math.PI / 2;
    teto.position.y = l.alt;
    teto.castShadow = true;
    g.add(teto);
  }
  const matParede = acabamento(l.parede);
  const matRodape = l.rodape ? new THREE.MeshStandardMaterial({ color: l.rodape, roughness: 0.9 }) : null;
  const mats = {
    caixilho: new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.7, roughness: 0.35 }),
    vidro: new THREE.MeshStandardMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.1, depthWrite: false }),
    peitoril: new THREE.MeshStandardMaterial({ color: '#b9b5ad', roughness: 0.8 }),
    requadro: new THREE.MeshStandardMaterial({ color: l.parede.tinta, roughness: 0.95 }),
  };
  for (const p of l.paredes) {
    const larg = p.lado === 'fundo' || p.lado === 'frente' ? w : d;
    const pose = POSE[p.lado];
    const parede = new THREE.Group();
    parede.position.set(pose.x, 0, pose.z);
    parede.rotation.y = pose.ry;
    const forma = new THREE.Shape();
    forma.moveTo(-larg / 2, 0);
    forma.lineTo(larg / 2, 0);
    forma.lineTo(larg / 2, l.alt);
    forma.lineTo(-larg / 2, l.alt);
    forma.closePath();
    for (const v of p.vaos ?? []) {
      const c = local(p.lado, v.c);
      const furo = new THREE.Path();
      furo.moveTo(c - v.larg / 2, v.base);
      furo.lineTo(c - v.larg / 2, v.topo);
      furo.lineTo(c + v.larg / 2, v.topo);
      furo.lineTo(c + v.larg / 2, v.base);
      furo.closePath();
      forma.holes.push(furo);
    }
    // ShapeGeometry gera UV em metros, então a textura repete a cada "m" metros
    const malha = new THREE.Mesh(new THREE.ShapeGeometry(forma), matParede);
    malha.receiveShadow = true;
    malha.castShadow = true;
    parede.add(malha);
    if (p.barra) {
      const barra = new THREE.Mesh(new THREE.PlaneGeometry(larg, p.barra.altura), pbr(l.parede.tex, [larg / l.parede.m, p.barra.altura / l.parede.m], p.barra.tinta));
      barra.position.set(0, p.barra.altura / 2, 0.002);
      barra.receiveShadow = true;
      parede.add(barra);
      const friso = new THREE.Mesh(new THREE.PlaneGeometry(larg, 0.03), new THREE.MeshStandardMaterial({ color: p.barra.tinta, roughness: 0.6 }));
      friso.position.set(0, p.barra.altura, 0.004);
      parede.add(friso);
    }
    if (matRodape) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(larg, 0.12), matRodape);
      r.position.set(0, 0.06, 0.006);
      parede.add(r);
    }
    for (const v of p.vaos ?? []) janela(parede, local(p.lado, v.c), v, mats);
    g.add(parede);
  }
  return g;
}

/* ---------- luzes ---------- */

function luzes(l: Lugar): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(l.hemi.ceu, l.hemi.chao, l.hemi.forca));
  let sombra = false;
  for (const def of l.luzes) {
    // no modo leve, as luzes fracas de enfeite saem: cada luz pontual pesa em todo pixel
    if (M.leve && def.tipo === 'ponto' && def.forca < 1.5) continue;
    let luz: THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight;
    if (def.tipo === 'sol') {
      const d = new THREE.DirectionalLight(def.cor, def.forca);
      const cam = d.shadow.camera;
      cam.left = cam.bottom = -4.5;
      cam.right = cam.top = 4.5;
      cam.near = 1;
      cam.far = 40;
      luz = d;
    } else if (def.tipo === 'foco') {
      luz = new THREE.SpotLight(def.cor, def.forca, def.alcance ?? 10, def.angulo ?? 0.8, 0.55, 1.6);
    } else {
      luz = new THREE.PointLight(def.cor, def.forca, def.alcance ?? 9, 1.6);
    }
    luz.position.set(...def.pos);
    if (def.alvo && (luz instanceof THREE.SpotLight || luz instanceof THREE.DirectionalLight)) {
      luz.target.position.set(...def.alvo);
      g.add(luz.target);
    }
    // sombra só numa luz por lugar, e nenhuma no modo leve
    if (def.sombra && !sombra && !M.leve) {
      sombra = true;
      luz.castShadow = true;
      luz.shadow.mapSize.set(1024, 1024);
      luz.shadow.bias = -0.002;
    }
    luz.userData.tremer = !!def.tremer;
    luz.userData.forca = def.forca;
    g.add(luz);
  }
  for (const lum of l.luminarias) if (!(lum.detalhe && M.leve)) g.add(colocar(lum));
  // brilho dos LEDs do rack
  if (!M.leve) {
    const led = new THREE.PointLight('#3ddc84', 0.2, 1.6, 2);
    led.position.set(RACK.x, 1.4, RACK.z + 0.65);
    g.add(led);
  }
  return g;
}

/* ---------- mobília ---------- */

function colocar(d: Movel): THREE.Group {
  const o = movel(d.arq, { giro: d.giro, altura: d.altura, largura: d.largura, parte: d.parte });
  if (d.pos.length === 3) o.position.set(d.pos[0], d.pos[1], d.pos[2]);
  else o.position.set(d.pos[0], 0, d.pos[1]);
  return o;
}

function mobilia(l: Lugar, m: Mundo): THREE.Group {
  const g = new THREE.Group();
  // mesas da bancada, uma depois da outra até cobrir todos os aparelhos de mesa, sem
  // passar da parede da frente (se faltar espaço, a fileira encosta nela). Se o dia tem
  // almoxarifado, aparelho novo pode chegar: a bancada já vem do tamanho máximo.
  const banc = layoutBancada(m);
  const fim = LZ[1] - 0.05;
  let ini = banc.ini - 0.1;
  const ultimo = Math.min(fim, Object.keys(m.catalogo).length ? TRECHO_BANCADA[1] + 0.1 : banc.fim + 0.1);
  const k = Math.max(1, Math.ceil((ultimo - ini) / l.mesa.passo - 0.1));
  if (ini + k * l.mesa.passo > fim) ini = Math.max(LZ[0] + 0.05, fim - k * l.mesa.passo);
  for (let i = 0; i < k; i++) {
    const mesa = movel(l.mesa.arq, { altura: l.mesa.altura, giro: l.mesa.giro });
    mesa.position.set(BANCADA.x + 0.05, 0, ini + (i + 0.5) * l.mesa.passo);
    g.add(mesa);
  }
  for (const d of l.moveis) {
    if (d.detalhe && M.leve) continue;
    const o = colocar(d);
    if (d.almox && Object.keys(m.catalogo).length) {
      o.userData.alvo = { tipo: 'almox', id: 'almox', rotulo: 'estante do almoxarifado' } satisfies Alvo;
      alvosFixos.push(o);
    }
    g.add(o);
  }
  return g;
}

function extras(l: Lugar): THREE.Group {
  const g = new THREE.Group();
  animacoes = [];
  for (const e of l.extras) {
    const p = montarExtra(e);
    g.add(p.grupo);
    if (p.animar) animacoes.push(p.animar);
  }
  return g;
}

/** Baixa móveis e texturas do lugar do ato, para a sala abrir sem esperar a rede. */
export function preCarregarLugar(ato: number) {
  const l = lugarDoAto(ato);
  preCarregarMoveis(new Set([l.mesa.arq, ...l.moveis.map((d) => d.arq), ...l.luminarias.map((d) => d.arq)]));
  preCarregarTexturas(new Set([l.piso.tex, l.parede.tex, ...(l.teto ? [l.teto.tex] : []), ...(l.texturasExtras ?? [])]));
}

let mundoAtual: Mundo | null = null;
let tremem: THREE.Light[] = [];

/** Casca, luz, mobília e extras do lugar; depois que os móveis chegam, junta o que é parado. */
function montarFixo(m: Mundo) {
  alvosFixos = [];
  const g = new THREE.Group();
  const mob = mobilia(lugar, m);
  g.add(casca(lugar), luzes(lugar), mob, extras(lugar));
  M.cena.add(g);
  fixo = g;
  tremem = [];
  g.traverse((o) => {
    if ((o as THREE.Light).isLight && o.userData.tremer) tremem.push(o as THREE.Light);
  });
  refazerSombras();
  void esperarCarga().then(() => {
    if (fixo !== g) return;
    // a caixa de cada móvel fica guardada antes de juntar (serve para conferir encaixes)
    for (const o of mob.children) o.userData.caixa = new THREE.Box3().setFromObject(o);
    juntarEstaticos(g);
    refazerSombras();
  });
}

/** Animação da sala por quadro (fica registrada enquanto a sala existe). */
function animarSala(_dt: number, t: number) {
  // uma lâmpada fluorescente sempre está morrendo
  for (const l of tremem) l.intensity = Math.sin(t * 37) > 0.97 || Math.sin(t * 3.1) > 0.995 ? 0.6 : l.userData.forca;
  for (const a of animacoes) a(t);
  if (seta) {
    const anel = seta.getObjectByName('anel');
    if (M.calmo) {
      // menos movimento: a seta fica parada, só o brilho marca o lugar
      seta.position.y = seta.userData.base;
      seta.rotation.y = 0;
      anel?.scale.setScalar(1.15);
    } else {
      seta.position.y = seta.userData.base + Math.sin(t * 3) * 0.06;
      seta.rotation.y = t * 1.5;
      anel?.scale.setScalar(1 + (Math.sin(t * 4) + 1) * 0.15);
    }
  }
  if (equipamentos) {
    const aceso = Math.sin(t * 9) > 0;
    for (const led of equipamentos.piscar) led.visible = aceso;
  }
}

/** Refaz o lugar (casca, luz, móveis) sem mexer em quem joga nem nos aparelhos: troca do modo leve. */
function remontarLugar() {
  if (!fixo || !mundoAtual) return;
  M.cena.remove(fixo);
  liberar(fixo);
  fixo = null;
  montarFixo(mundoAtual);
  posicionarSeta();
}
M.aoMudarLeve.add(remontarLugar);

/** Ganchos para conferir a sala no navegador (bancada cheia, encaixes). */
(globalThis as unknown as { __c8sala: unknown }).__c8sala = {
  montarSala: (...a: Parameters<typeof montarSala>) => montarSala(...a),
  atualizarEquipamentos: (m: Mundo) => atualizarEquipamentos(m),
  destacar: (a: { tipo: string; id: string } | null) => destacar(a),
  partes: () => ({ fixo, equipamentos }),
};

/** Monta a sala inteira para o dia, no lugar do ato. */
export function montarSala(m: Mundo, notas: string[], ato = 0) {
  limparCena();
  lugar = lugarDoAto(ato);
  notasAtuais = notas;
  mundoAtual = m;
  equipamentos = null;
  destaque = null;
  seta = null;
  M.cena.background = new THREE.Color(lugar.fundo);
  M.cena.fog = lugar.nevoa ? new THREE.Fog(lugar.nevoa.cor, lugar.nevoa.perto, lugar.nevoa.longe) : null;
  M.cena.environmentIntensity = lugar.ambiente;
  if (M.renderer) M.renderer.toneMappingExposure = lugar.exposicao;
  montarFixo(m);
  atualizarEquipamentos(m);
  J.limites = [LX[0], LX[1], LZ[0], LZ[1]];
  posicionar(...(lugar.inicio ?? [0.2, 1.6, 0.25]));
  M.atualizar.add(animarSala);
  vigiarDesempenho();
}

/** Refaz só os equipamentos e cabos, depois de um comando que mudou o mundo. */
export function atualizarEquipamentos(m: Mundo) {
  mundoAtual = m;
  if (equipamentos) {
    M.cena.remove(equipamentos.raiz);
    liberar(equipamentos.raiz);
  }
  refazerSombras();
  equipamentos = montarEquipamentos(m, notasAtuais);
  M.cena.add(equipamentos.raiz);
  J.obstaculos = [...equipamentos.obstaculos, ...lugar.obstaculos];
  posicionarSeta();
}

const ray = new THREE.Raycaster();
ray.far = 2.6;
const centro = new THREE.Vector2(0, 0);

/** O que está na mira, no centro da tela. */
export function alvoNaMira(): Alvo | null {
  if (!equipamentos) return null;
  ray.setFromCamera(centro, M.camera);
  const hits = ray.intersectObjects([...equipamentos.alvos, ...alvosFixos], true);
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    while (o && !o.userData.alvo) o = o.parent;
    if (o) return o.userData.alvo as Alvo;
  }
  return null;
}
