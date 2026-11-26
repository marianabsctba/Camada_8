// Renderizador, cena, câmera e laço principal.
// Também cuida do custo: resolução que se adapta, sombras só quando a sala muda,
// modo leve (detectado ou escolhido) e liberação da memória da GPU ao trocar de lugar.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const CHAVE_LEVE = 'camada8.leve';

export const M = {
  renderer: null as unknown as THREE.WebGLRenderer,
  cena: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(70, 1, 0.03, 200),
  relogio: new THREE.Clock(),
  atualizar: new Set<(dt: number, t: number) => void>(),
  ativo: false,
  leve: false,
  /** Quadros por segundo, média móvel. */
  fps: 60,
  /** Quem joga pediu menos movimento no sistema (prefers-reduced-motion). */
  calmo: false,
  /** Chamados quando o modo leve muda (a sala se refaz). */
  aoMudarLeve: new Set<(leve: boolean) => void>(),
  /** Chamado uma vez quando a cena fica pesada demais mesmo na menor resolução do modo normal. */
  aoPesar: null as null | (() => void),
};

/** Fração da resolução nativa: o teto e o valor atual (cai sozinho se os quadros não vierem). */
let tetoPr = 1;
let prAtual = 1;

const movimento = matchMedia('(prefers-reduced-motion: reduce)');
M.calmo = movimento.matches;
movimento.addEventListener?.('change', () => (M.calmo = movimento.matches));

/** Preferência gravada: true, false ou null (ainda não escolheu). */
export function preferenciaLeve(): boolean | null {
  try {
    const v = localStorage.getItem(CHAVE_LEVE);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

/** GPU sem aceleração ou muito modesta, pelo nome que o navegador expõe (quando expõe). */
function gpuFraca(r: THREE.WebGLRenderer): boolean {
  const gl = r.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const nome = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
  return /swiftshader|llvmpipe|software|basic render|mali-4|adreno \(tm\) 3|powervr sgx/.test(nome);
}

function aplicarQualidade() {
  const r = M.renderer;
  tetoPr = Math.min(devicePixelRatio, M.leve ? 1 : 1.25);
  if (M.leve) tetoPr = Math.min(tetoPr, 0.85);
  prAtual = tetoPr;
  r.setPixelRatio(prAtual);
  r.shadowMap.enabled = !M.leve;
  r.shadowMap.needsUpdate = true;
  redimensionar();
}

/** Liga ou desliga o modo leve agora (a sala se refaz) e, se pedido, grava a escolha. */
export function definirLeve(leve: boolean, gravar = true) {
  if (gravar) {
    try {
      localStorage.setItem(CHAVE_LEVE, leve ? '1' : '0');
    } catch {
      /* vale só nesta aba */
    }
  }
  if (M.leve === leve) return;
  M.leve = leve;
  if (!M.renderer) return;
  aplicarQualidade();
  // sombras ligadas ou desligadas mudam o shader de todo material
  M.cena.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) m.needsUpdate = true;
  });
  pesou = false;
  for (const f of M.aoMudarLeve) f(leve);
}

/** As sombras são estáticas: só são redesenhadas quando a sala ou os aparelhos mudam. */
export function refazerSombras() {
  if (M.renderer) M.renderer.shadowMap.needsUpdate = true;
}

/* ---------- vigia de desempenho ---------- */

let janela = 0;
let quadros = 0;
let pesou = false;

/** Recomeça a medição (sala nova): os primeiros segundos de carga não contam. */
export function vigiarDesempenho() {
  janela = -1.5;
  quadros = 0;
}

function vigiar(dtReal: number) {
  // aba escondida ou travada por outro motivo não diz nada sobre a GPU
  if (document.hidden || dtReal > 0.25) return;
  janela += dtReal;
  if (janela < 0) return;
  quadros++;
  if (janela < 1.5) return;
  const fps = quadros / janela;
  janela = 0;
  quadros = 0;
  if (fps >= 50) return;
  // primeiro baixa a resolução aos poucos; no piso, avisa a interface uma vez
  const piso = M.leve ? 0.6 : 0.75;
  if (prAtual > piso + 0.01) {
    prAtual = Math.max(piso, prAtual - 0.15);
    M.renderer.setPixelRatio(prAtual);
    redimensionar();
  } else if (!M.leve && !pesou) {
    pesou = true;
    M.aoPesar?.();
  }
}

export function iniciar3d(alvo: HTMLElement): HTMLCanvasElement {
  if (M.renderer) {
    alvo.prepend(M.renderer.domElement);
    M.ativo = true;
    // cada sala nova começa de novo na resolução cheia
    prAtual = tetoPr;
    M.renderer.setPixelRatio(prAtual);
    redimensionar();
    vigiarDesempenho();
    return M.renderer.domElement;
  }
  const pref = preferenciaLeve();
  // celular e tablet começam leves; notebook com GPU integrada fica no normal e o vigia ajusta
  const fraco = (navigator.hardwareConcurrency ?? 8) <= 2 || matchMedia('(pointer: coarse)').matches;
  M.leve = pref ?? fraco;
  const r = new THREE.WebGLRenderer({ antialias: !M.leve, powerPreference: 'high-performance' });
  if (pref === null && !M.leve && gpuFraca(r)) M.leve = true;
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.shadowMap.autoUpdate = false;
  r.domElement.className = 'tela3d';
  M.renderer = r;
  alvo.prepend(r.domElement);
  aplicarQualidade();
  // a interface já pode ter desenhado o botão antes de saber o modo escolhido aqui
  for (const f of M.aoMudarLeve) f(M.leve);
  const pm = new THREE.PMREMGenerator(r);
  M.cena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  M.cena.environmentIntensity = 0.45;
  M.cena.add(M.camera);
  addEventListener('resize', redimensionar);
  redimensionar();
  M.ativo = true;
  vigiarDesempenho();
  (window as unknown as { __c8tres: unknown }).__c8tres = M;
  r.setAnimationLoop(() => {
    if (!M.ativo) return;
    const dtReal = M.relogio.getDelta();
    if (dtReal < 0.25) M.fps += (1 / Math.max(dtReal, 1e-3) - M.fps) * 0.05;
    vigiar(dtReal);
    const dt = Math.min(dtReal, 0.05);
    const t = M.relogio.elapsedTime;
    for (const f of M.atualizar) f(dt, t);
    r.render(M.cena, M.camera);
  });
  return r.domElement;
}

export function pausar3d() {
  M.ativo = false;
}

export function redimensionar() {
  if (!M.renderer) return;
  const w = innerWidth;
  const h = innerHeight;
  M.renderer.setSize(w, h);
  M.camera.aspect = w / h;
  M.camera.updateProjectionMatrix();
}

/* ---------- memória da GPU ---------- */

const CAMPOS_TEXTURA = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'lightMap', 'displacementMap', 'envMap'] as const;

/**
 * Libera geometria, material e texturas de tudo dentro de "raiz". O que tem
 * userData.fixo (móveis do cache de GLB, materiais compartilhados do módulo) fica.
 */
export function liberar(raiz: THREE.Object3D) {
  const feitos = new Set<object>();
  raiz.traverse((o) => {
    // a luz que projeta sombra guarda um mapa de sombra (uma textura) próprio
    if ((o as THREE.Light).isLight) (o as THREE.Light).dispose();
    const m = o as THREE.Mesh;
    // o Sprite usa uma geometria única do three, dividida por todos
    if (m.geometry && !(o as THREE.Sprite).isSprite && !m.geometry.userData.fixo && !feitos.has(m.geometry)) {
      feitos.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (mat.userData.fixo || feitos.has(mat)) continue;
      feitos.add(mat);
      const rec = mat as unknown as Record<string, unknown>;
      for (const k of CAMPOS_TEXTURA) {
        const t = rec[k] as THREE.Texture | null | undefined;
        if (t?.isTexture && !t.userData.fixo && !feitos.has(t)) {
          feitos.add(t);
          t.dispose();
        }
      }
      // uniforms de ShaderMaterial podem guardar texturas também
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const v of Object.values(u)) if ((v.value as THREE.Texture)?.isTexture) (v.value as THREE.Texture).dispose();
      mat.dispose();
    }
  });
}

/** Remove tudo da cena (menos a câmera) e libera memória da GPU. */
export function limparCena() {
  for (const filho of [...M.cena.children]) {
    if (filho === M.camera) continue;
    M.cena.remove(filho);
    liberar(filho);
  }
  M.atualizar.clear();
}
