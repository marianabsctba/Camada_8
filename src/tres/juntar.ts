// Junta malhas paradas que dividem o mesmo material numa malha só: uma chamada de desenho
// no lugar de dezenas (paredes, perfis de janela, racks de enfeite, móveis repetidos).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Lado da célula (m) dentro da qual as malhas podem virar uma só. A sala jogável tem 6 m. */
const CELULA = 7;

function assinatura(g: THREE.BufferGeometry): string {
  return Object.entries(g.attributes)
    .map(([nome, a]) => `${nome}:${a.itemSize}:${(a as THREE.BufferAttribute).array?.constructor.name ?? 'x'}:${a.normalized}`)
    .sort()
    .join(',');
}

/** Cópia com atributos simples (sem buffer intercalado), pronta para receber a matriz. */
function copiaPlana(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = new THREE.BufferGeometry();
  for (const [nome, a] of Object.entries(g.attributes)) {
    const at = a as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    c.setAttribute(nome, (at as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute ? (at as THREE.InterleavedBufferAttribute).clone() : (at as THREE.BufferAttribute).clone());
  }
  if (g.index) c.setIndex(g.index.clone());
  return c;
}

/**
 * Junta, dentro de "raiz", as malhas opacas com o mesmo material (transparente só com
 * userData.juntavel no material, quando a ordem de desenho entre as peças não aparece). Não entra em quem é alvo
 * da mira (userData.alvo) nem em quem anima (userData.vivo), nem em "pular".
 * Devolve quantas malhas foram absorvidas.
 */
export function juntarEstaticos(raiz: THREE.Object3D, pular?: (o: THREE.Object3D) => boolean): number {
  raiz.updateMatrixWorld(true);
  const inv = raiz.matrixWorld.clone().invert();
  const grupos = new Map<string, THREE.Mesh[]>();
  const centro = new THREE.Vector3();
  const visitar = (o: THREE.Object3D) => {
    if (o !== raiz && (o.userData.alvo || o.userData.vivo || pular?.(o))) return;
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !Array.isArray(m.material) && !m.morphTargetInfluences) {
      const mat = m.material as THREE.Material;
      const g = m.geometry;
      if ((!mat.transparent || mat.userData.juntavel) && !Object.keys(g.morphAttributes).length && g.attributes.position) {
        // só junta o que está perto: um poste do outro lado da rua não arrasta o resto para
        // fora do corte por visão (frustum culling)
        if (!g.boundingSphere) g.computeBoundingSphere();
        centro.copy(g.boundingSphere!.center).applyMatrix4(m.matrixWorld);
        const celula = `${Math.floor((centro.x + CELULA / 2) / CELULA)},${Math.floor((centro.z + CELULA / 2) / CELULA)}`;
        const chave = [mat.uuid, m.castShadow, m.receiveShadow, m.renderOrder, g.index ? 'i' : 'n', assinatura(g), celula].join('|');
        let l = grupos.get(chave);
        if (!l) grupos.set(chave, (l = []));
        l.push(m);
      }
    }
    for (const f of [...o.children]) visitar(f);
  };
  visitar(raiz);

  const removidas: THREE.Mesh[] = [];
  const matriz = new THREE.Matrix4();
  for (const malhas of grupos.values()) {
    if (malhas.length < 2) continue;
    const geos = malhas.map((m) => {
      const g = copiaPlana(m.geometry);
      g.applyMatrix4(matriz.multiplyMatrices(inv, m.matrixWorld));
      return g;
    });
    const junta = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!junta) continue;
    const base = malhas[0]!;
    const nova = new THREE.Mesh(junta, base.material);
    nova.castShadow = base.castShadow;
    nova.receiveShadow = base.receiveShadow;
    nova.renderOrder = base.renderOrder;
    nova.name = 'junta';
    raiz.add(nova);
    for (const m of malhas) {
      m.removeFromParent();
      removidas.push(m);
    }
  }
  // libera as geometrias que ninguém mais usa (as do cache de móveis ficam)
  const emUso = new Set<THREE.BufferGeometry>();
  raiz.traverse((o) => {
    const g = (o as THREE.Mesh).geometry;
    if (g) emUso.add(g);
  });
  for (const m of removidas) if (!m.geometry.userData.fixo && !emUso.has(m.geometry)) m.geometry.dispose();
  return removidas.length;
}
