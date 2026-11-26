// Materiais fotográficos de piso e parede (texturas CC0 do Poly Haven em WebP, 1K).
import * as THREE from 'three';
import { acompanhar } from './glb';

const BASE = `${import.meta.env.BASE_URL}ambiente/texturas/`;
const tl = new THREE.TextureLoader();

export type Superficie =
  | 'asphalt_02'
  | 'beige_wall_002'
  | 'brick_wall_02'
  | 'concrete_pavement'
  | 'dirty_carpet'
  | 'garage_floor'
  | 'grey_plaster'
  | 'herringbone_parquet'
  | 'old_linoleum_flooring_01'
  | 'painted_plaster_wall'
  | 'plastered_wall_02'
  | 'smooth_concrete_floor'
  | 'terrazzo_tiles'
  | 'white_plaster_02';

const imagens = new Map<string, Promise<THREE.Texture>>();

function baixar(nome: string): Promise<THREE.Texture> {
  let p = imagens.get(nome);
  if (!p) {
    p = tl.loadAsync(`${BASE}${nome}.webp?v=${__VERSAO__}`);
    imagens.set(nome, p);
  }
  return p;
}

/** Baixa as texturas de um lugar antes de a sala ser montada. */
export function preCarregarTexturas(lista: Iterable<Superficie>) {
  for (const s of lista) for (const k of ['cor', 'normal', 'aspereza']) void baixar(`${s}_${k}`);
}

function tex(nome: string, rep: [number, number], cor: boolean): THREE.Texture {
  const t = new THREE.Texture();
  void acompanhar(baixar(nome)).then((orig) => {
    t.image = orig.image;
    t.needsUpdate = true;
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  t.anisotropy = 8;
  if (cor) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** rep = quantas vezes a textura repete; tinta multiplica a cor. */
export function pbr(s: Superficie, rep: [number, number], tinta = '#ffffff'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: tex(`${s}_cor`, rep, true),
    normalMap: tex(`${s}_normal`, rep, false),
    roughnessMap: tex(`${s}_aspereza`, rep, false),
    color: tinta,
    roughness: 1,
    metalness: 0,
  });
}
