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

/** Baixa os móveis de um lugar enquanto a pessoa ainda está na capa ou no mapa. */
export function preCarregarMoveis(lista: Iterable<string>) {
  for (const m of lista) void carregar(m);
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
            // geometria e material ficam no cache entre um dia e outro: a limpeza da sala não os libera
            m.geometry.userData.fixo = true;
            for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
              mat.userData.fixo = true;
              // vidro com transmissão obriga o three a desenhar a cena inteira duas vezes por
              // quadro (passo de transmissão); um vidro transparente comum custa quase nada
              const fis = mat as THREE.MeshPhysicalMaterial;
              if (fis.isMeshPhysicalMaterial && fis.transmission > 0) {
                fis.transmission = 0;
                fis.transparent = true;
                fis.opacity = Math.min(fis.opacity, 0.3);
                fis.depthWrite = false;
              }
            }
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
export function movel(arquivo: string, o: { altura?: number; largura?: number; giro?: number; parte?: string } = {}): THREE.Group {
  const grupo = new THREE.Group();
  void acompanhar(carregar(arquivo)).then((cena) => {
    if (!cena) return;
    // clone raso de malhas: geometria e material ficam compartilhados com o cache
    const copia = cena.clone(true);
    if (o.parte) {
      // kits modulares do Poly Haven: fica só a peça pedida ("nome" exato ou "prefixo*")
      const pref = o.parte.endsWith('*') ? o.parte.slice(0, -1) : null;
      for (const f of [...copia.children]) if (pref ? !f.name.startsWith(pref) : f.name !== o.parte) copia.remove(f);
      copia.updateMatrixWorld(true);
    }
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
