// Móveis fotográficos (Poly Haven, CC0) em GLB com Draco, carregados sob demanda.
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;
let loader: GLTFLoader | null = null;
const cache = new Map<string, Promise<THREE.Object3D | null>>();

/** Tudo o que ainda está chegando pela rede; a sala só aparece quando esvaziar. */
export const pendentes = new Set<Promise<unknown>>();
export function acompanhar<T>(p: Promise<T>): Promise<T> {
  pendentes.add(p);
  void p.finally(() => pendentes.delete(p));
  return p;
}
export async function esperarCarga(): Promise<void> {
  while (pendentes.size) await Promise.allSettled([...pendentes]);
}

/** Móveis que a sala usa, para baixar enquanto a pessoa ainda está na capa. */
export const MOVEIS_DA_SALA = ['metal_office_desk', 'mounted_fluorescent_lights', 'industrial_storage_cart', 'metal_toolbox', 'steel_frame_shelves_01', 'cardboard_box_01', 'plastic_monobloc_chair_01', 'fire_alarm', 'security_camera_01', 'metal_trash_can', 'plastic_crate_01'];
export function preCarregarMoveis() {
  for (const m of MOVEIS_DA_SALA) void carregar(m);
}

function L(): GLTFLoader {
  if (loader) return loader;
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${BASE}draco/`);
  loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  return loader;
}

function carregar(arquivo: string): Promise<THREE.Object3D | null> {
  let p = cache.get(arquivo);
  if (!p) {
    p = L()
      .loadAsync(`${BASE}ambiente/moveis/${arquivo}.glb?v=${__VERSAO__}`)
      .then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
          }
        });
        return g.scene;
      })
      .catch(() => null);
    cache.set(arquivo, p);
  }
  return p;
}

/**
 * Coloca um móvel apoiado no chão, centrado no ponto. Com "altura", escala o modelo
 * para essa altura (útil para encaixar o tampo da mesa onde os aparelhos estão).
 */
export function movel(arquivo: string, o: { altura?: number; largura?: number; giro?: number } = {}): THREE.Group {
  const grupo = new THREE.Group();
  void acompanhar(carregar(arquivo)).then((cena) => {
    if (!cena) return;
    const copia = cena.clone(true);
    const b = new THREE.Box3().setFromObject(copia);
    const tam = b.getSize(new THREE.Vector3());
    const k = o.altura ? o.altura / tam.y : o.largura ? o.largura / Math.max(tam.x, tam.z) : 1;
    copia.scale.setScalar(k);
    copia.position.set(-((b.min.x + b.max.x) / 2) * k, -b.min.y * k, -((b.min.z + b.max.z) / 2) * k);
    const pivo = new THREE.Group();
    pivo.add(copia);
    pivo.rotation.y = o.giro ?? 0;
    grupo.add(pivo);
  });
  return grupo;
}
