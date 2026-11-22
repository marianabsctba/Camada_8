// Sala técnica da Fibra Fim de Linha: concreto, luz fria, um rack e uma bancada de metal.

import * as THREE from 'three';
import type { Mundo } from '../motor/mundo';
import { BANCADA, montarEquipamentos, quantasBancadas, type Alvo, type Cena3d } from './equipamentos3d';
import { movel } from './glb';
import { J, posicionar } from './jogador';
import { limparCena, M } from './motor3d';
import { pbr } from './pbr';

const LX: [number, number] = [-3, 3];
const LZ: [number, number] = [-3, 3];
const ALT = 2.8;

let equipamentos: Cena3d | null = null;
let fixo: THREE.Group | null = null;
let notasAtuais: string[] = [];

function casca(): THREE.Group {
  const g = new THREE.Group();
  const w = LX[1] - LX[0];
  const d = LZ[1] - LZ[0];
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pbr('garage_floor', [3, 3], '#b9bec4'));
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  g.add(piso);
  const teto = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pbr('smooth_concrete_floor', [2, 2], '#7d848c'));
  teto.rotation.x = Math.PI / 2;
  teto.position.y = ALT;
  g.add(teto);
  const parede = (larg: number, x: number, z: number, ry: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(larg, ALT), pbr('painted_plaster_wall', [larg / 2, 1.4], '#6f7d8c'));
    p.position.set(x, ALT / 2, z);
    p.rotation.y = ry;
    p.receiveShadow = true;
    g.add(p);
    // rodapé de cimento queimado
    const r = new THREE.Mesh(new THREE.PlaneGeometry(larg, 0.12), new THREE.MeshStandardMaterial({ color: '#3a3f45', roughness: 0.9 }));
    r.position.set(x, 0.06, z);
    r.rotation.y = ry;
    r.translateZ(0.002);
    g.add(r);
  };
  parede(w, 0, LZ[0], 0);
  parede(w, 0, LZ[1], Math.PI);
  parede(d, LX[0], 0, Math.PI / 2);
  parede(d, LX[1], 0, -Math.PI / 2);
  // eletrocalha no teto, do rack até a bancada
  const calha = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 5.4), new THREE.MeshStandardMaterial({ color: '#5d656e', metalness: 0.7, roughness: 0.5 }));
  calha.position.set(0.6, ALT - 0.06, 0);
  g.add(calha);
  return g;
}

function luzes(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight('#a9c2dd', '#1a1f26', 0.35));
  const pontos: [number, number][] = [
    [0, -1.6],
    [0, 1.2],
  ];
  pontos.forEach(([x, z], i) => {
    const l = new THREE.PointLight('#e8f1ff', i === 0 ? 7 : 5, 9, 1.6);
    l.position.set(x, ALT - 0.25, z);
    l.castShadow = i === 0 && !M.leve;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.002;
    l.userData.tremer = i === 1; // uma lâmpada fluorescente sempre está morrendo
    g.add(l);
    const luminaria = movel('mounted_fluorescent_lights', { largura: 1.25 });
    luminaria.position.set(x, ALT - 0.1, z);
    g.add(luminaria);
  });
  // brilho dos LEDs do rack
  const led = new THREE.PointLight('#3ddc84', 0.2, 1.6, 2);
  led.position.set(0.6, 1.4, -1.9);
  g.add(led);
  return g;
}

function mobilia(m: Mundo): THREE.Group {
  const g = new THREE.Group();
  const n = Math.max(2, quantasBancadas(m));
  for (let i = 0; i * 1.6 < n * BANCADA.passo; i++) {
    const mesa = movel('metal_office_desk', { altura: 0.76, giro: Math.PI / 2 });
    mesa.position.set(BANCADA.x + 0.05, 0, BANCADA.z0 + 0.4 + i * 1.6);
    g.add(mesa);
  }
  const itens: [string, number, number, number, number?][] = [
    ['steel_frame_shelves_01', 2.6, -1.4, -Math.PI / 2, 1.9],
    ['cardboard_box_01', 2.55, -0.4, 0.3, 0.32],
    ['industrial_storage_cart', 2.3, 1.2, -Math.PI / 2, 0.9],
    ['metal_toolbox', 2.3, 1.2, -1.2, 0.2],
    ['plastic_monobloc_chair_01', -1.7, -0.6, -Math.PI / 2, 0.82],
    ['metal_trash_can', -2.6, 2.4, 0, 0.45],
    ['plastic_crate_01', 1.7, -2.6, 0.2, 0.3],
  ];
  for (const [arq, x, z, giro, altura] of itens) {
    const o = movel(arq, { giro, altura });
    o.position.set(x, arq === 'metal_toolbox' ? 0.9 : 0, z);
    g.add(o);
  }
  const alarme = movel('fire_alarm', { altura: 0.12 });
  alarme.position.set(-1.2, 2.2, LZ[1] - 0.05);
  g.add(alarme);
  const camera = movel('security_camera_01', { altura: 0.18, giro: Math.PI * 0.75 });
  camera.position.set(LX[1] - 0.25, ALT - 0.3, LZ[0] + 0.25);
  g.add(camera);
  return g;
}

/** Monta a sala inteira para o dia. */
export function montarSala(m: Mundo, notas: string[]) {
  limparCena();
  notasAtuais = notas;
  M.cena.background = new THREE.Color('#0b1016');
  fixo = new THREE.Group();
  fixo.add(casca(), luzes(), mobilia(m));
  M.cena.add(fixo);
  atualizarEquipamentos(m);
  J.limites = [LX[0], LX[1], LZ[0], LZ[1]];
  posicionar(0.2, 1.6, 0.25);
  M.atualizar.add((_dt, t) => {
    fixo?.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight && o.userData.tremer) {
        const l = o as THREE.PointLight;
        l.intensity = Math.sin(t * 37) > 0.97 || Math.sin(t * 3.1) > 0.995 ? 0.6 : 5;
      }
    });
    if (equipamentos) {
      const aceso = Math.sin(t * 9) > 0;
      for (const led of equipamentos.piscar) led.visible = aceso;
    }
  });
}

/** Refaz só os equipamentos e cabos, depois de um comando que mudou o mundo. */
export function atualizarEquipamentos(m: Mundo) {
  if (equipamentos) {
    M.cena.remove(equipamentos.raiz);
    equipamentos.raiz.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
    });
  }
  equipamentos = montarEquipamentos(m, notasAtuais);
  M.cena.add(equipamentos.raiz);
  J.obstaculos = [...equipamentos.obstaculos, [2.2, 3, -2, -0.8], [1.9, 2.7, 0.8, 1.6]];
}

const ray = new THREE.Raycaster();
ray.far = 2.6;
const centro = new THREE.Vector2(0, 0);

/** O que está na mira, no centro da tela. */
export function alvoNaMira(): Alvo | null {
  if (!equipamentos) return null;
  ray.setFromCamera(centro, M.camera);
  const hits = ray.intersectObjects(equipamentos.alvos, true);
  for (const h of hits) {
    let o: THREE.Object3D | null = h.object;
    while (o && !o.userData.alvo) o = o.parent;
    if (o) return o.userData.alvo as Alvo;
  }
  return null;
}
