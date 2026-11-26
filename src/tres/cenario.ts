// Peças de cenário feitas em código, para o que não existe como modelo pronto: céu, rua,
// torre treliçada, estádio, telões, racks de servidor, distribuidor geral, quadro de giz.
// Tudo reaproveita geometria e material: cada peça repetida é um clone do primeiro exemplar.

import * as THREE from 'three';
import { rack42 } from './equipamentos3d';
import type { Extra, Lado, Obstaculo, Tela, V3 } from './lugares';
import { M } from './motor3d';
import { pbr } from './pbr';

/** O que um extra devolve: o grupo e, se tiver, uma animação por quadro. */
export interface Peca {
  grupo: THREE.Object3D;
  animar?: (t: number) => void;
}

/* ---------- utilidades ---------- */

function canvas(w: number, h: number, desenhar: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  desenhar(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Gerador pseudoaleatório fixo, para o cenário sair igual toda vez. */
function sorteio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const giroDoLado: Record<Lado, number> = { fundo: 0, frente: Math.PI, esq: Math.PI / 2, dir: -Math.PI / 2 };

/** Posição de algo encostado numa parede, afastado "d" dela. */
function naParede(lado: Lado, c: number, y: number, d: number): V3 {
  if (lado === 'fundo') return [c, y, -3 + d];
  if (lado === 'frente') return [c, y, 3 - d];
  if (lado === 'esq') return [-3 + d, y, c];
  return [3 - d, y, c];
}

/* ---------- luz barata para a noite: halo, cone e poça ---------- */

/** Mancha radial (centro claro, borda transparente), para halo de lâmpada e poça de luz no chão. */
function mancha(nucleo: number): THREE.CanvasTexture {
  return canvas(128, 128, (c) => {
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(nucleo, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
  });
}

/**
 * Cone de luz no ar (poeira e umidade espalhando o facho): aditivo, mais forte perto da
 * lâmpada e no meio do cone, some nas bordas. Não ilumina nada, só se vê.
 */
function cone(de: THREE.Vector3, ate: THREE.Vector3, raio: number, cor: string, forca: number): THREE.Mesh {
  const dir = de.clone().sub(ate);
  const alt = dir.length();
  const geo = new THREE.ConeGeometry(raio, alt, 24, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { cor: { value: new THREE.Color(cor) }, forca: { value: forca } },
    vertexShader:
      'varying float vy; varying vec3 vn; varying vec3 vv;' +
      'void main(){ vy = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vv = normalize(-mv.xyz); vn = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }',
    fragmentShader:
      'uniform vec3 cor; uniform float forca; varying float vy; varying vec3 vn; varying vec3 vv;' +
      'void main(){ float borda = pow(abs(dot(vn, vv)), 2.0); float a = forca * pow(vy, 1.8) * borda; gl_FragColor = vec4(cor * a, 1.0); }',
  });
  const m = new THREE.Mesh(geo, mat);
  // a ponta do ConeGeometry fica em +y: alinha +y com a direção de quem ilumina
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.position.copy(de).lerp(ate, 0.5);
  m.renderOrder = 2;
  return m;
}

/** Halo, cone até o chão e poça de luz para cada lâmpada; no modo leve fica só halo e poça. */
function brilhos(e: Extract<Extra, { tipo: 'brilhos' }>): Peca {
  const g = new THREE.Group();
  const tHalo = mancha(0.18);
  const tPoca = mancha(0.35);
  for (const b of e.lista) {
    const [x, y, z] = b.pos;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tHalo, color: b.cor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    halo.scale.set(b.halo, b.halo, 1);
    halo.position.set(x, y, z);
    g.add(halo);
    if (b.poca) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(b.poca * 2, b.poca * 2), new THREE.MeshBasicMaterial({ map: tPoca, color: b.cor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: b.forcaPoca ?? 0.35 }));
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, (b.chao ?? 0) + 0.012, z);
      p.renderOrder = 1;
      g.add(p);
    }
    if (b.cone && !M.leve) g.add(cone(new THREE.Vector3(x, y - 0.1, z), new THREE.Vector3(x, b.chao ?? 0, z), b.cone, b.cor, 0.16));
  }
  return { grupo: g };
}

/* ---------- céu ---------- */

function ceu(e: Extract<Extra, { tipo: 'ceu' }>): Peca {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { topo: { value: new THREE.Color(e.topo) }, horizonte: { value: new THREE.Color(e.horizonte) }, baixo: { value: new THREE.Color(e.baixo) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 topo; uniform vec3 horizonte; uniform vec3 baixo; varying vec3 vp;' +
      'void main(){ float h = vp.y; vec3 c = h > 0.0 ? mix(horizonte, topo, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizonte, baixo, clamp(-h * 6.0, 0.0, 1.0)); gl_FragColor = vec4(c, 1.0);' +
      '\n#include <colorspace_fragment>\n}',
  });
  const esfera = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), mat);
  esfera.renderOrder = -2;
  g.add(esfera);
  const n = M.leve ? Math.floor(e.estrelas / 3) : e.estrelas;
  if (n > 0) {
    const r = sorteio(7);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const az = r() * Math.PI * 2;
      const el = Math.asin(0.08 + r() * 0.92);
      pos.set([Math.cos(az) * Math.cos(el) * 150, Math.sin(el) * 150, Math.sin(az) * Math.cos(el) * 150], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const estrelas = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#dfe7ff', size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
    estrelas.renderOrder = -1;
    g.add(estrelas);
  }
  return { grupo: g };
}

/* ---------- rua: asfalto, meio-fio, faixa ---------- */

function rua(): Peca {
  const g = new THREE.Group();
  const asfalto = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), pbr('asphalt_02', [48, 48], '#7c7f86'));
  asfalto.rotation.x = -Math.PI / 2;
  asfalto.position.y = -0.15;
  asfalto.receiveShadow = true;
  g.add(asfalto);
  // calçada do outro lado da rua e a que continua pelos lados do pátio
  const calc = (larg: number, prof: number, x: number, z: number) => {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(larg, prof), pbr('concrete_pavement', [larg / 2, prof / 2], '#8f8f8a'));
    c.rotation.x = -Math.PI / 2;
    c.position.set(x, 0, z);
    c.receiveShadow = true;
    g.add(c);
  };
  calc(80, 2.2, 0, 11.6);
  calc(36, 7.2, -21, 0.6);
  calc(36, 7.2, 22.2, 0.6);
  const guia = new THREE.MeshStandardMaterial({ color: '#8d8c86', roughness: 0.95 });
  const meioFio = (larg: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.16, 0.14), guia);
    m.position.set(x, -0.07, z);
    g.add(m);
  };
  meioFio(80, 0, 4.27);
  meioFio(80, 0, 10.43);
  // faixa central tracejada, amarela
  const faixa = new THREE.MeshBasicMaterial({ color: '#b89a3a' });
  const tr = new THREE.PlaneGeometry(2, 0.12);
  for (let x = -40; x < 40; x += 4) {
    const f = new THREE.Mesh(tr, faixa);
    f.rotation.x = -Math.PI / 2;
    f.position.set(x, -0.145, 7.35);
    g.add(f);
  }
  // fachadas do outro lado da rua, apagadas, com uma ou outra janela acesa
  const janelas = canvas(512, 256, (c) => {
    c.fillStyle = '#1a1a1d';
    c.fillRect(0, 0, 512, 256);
    const r = sorteio(3);
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 2; j++) {
        const aceso = r() < 0.22;
        c.fillStyle = aceso ? '#f3c77a' : '#0c0e12';
        c.fillRect(18 + i * 62, 40 + j * 110, 34, 58);
      }
  });
  const fachadaMat = new THREE.MeshStandardMaterial({ map: janelas, emissiveMap: janelas, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.9 });
  for (const [x, larg, alt] of [
    [-22, 14, 7],
    [-6, 12, 6],
    [9, 14, 8],
    [26, 16, 6.5],
  ] as const) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(larg, alt), fachadaMat);
    f.position.set(x, alt / 2, 12.8);
    f.rotation.y = Math.PI;
    g.add(f);
  }
  return { grupo: g };
}

/* ---------- fios entre postes (catenária) ---------- */

function fios(e: Extract<Extra, { tipo: 'fios' }>): Peca {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#0d0e10', roughness: 0.6 });
  for (let i = 0; i + 1 < e.pontos.length; i++) {
    const a = new THREE.Vector3(...e.pontos[i]!);
    const b = new THREE.Vector3(...e.pontos[i + 1]!);
    const vao = a.distanceTo(b);
    for (const dy of e.pontos.length > 2 ? [0, -0.35, -0.7] : [0]) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 16; k++) {
        const s = k / 16;
        const p = a.clone().lerp(b, s);
        // parábola como aproximação da catenária para vãos com pouca flecha
        p.y += dy - 4 * e.queda * (vao / 15) * s * (1 - s);
        pts.push(p);
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 4, false), mat));
    }
  }
  return { grupo: g };
}

/* ---------- torre treliçada com balizamento noturno ---------- */

function torre(e: Extract<Extra, { tipo: 'torre' }>): Peca {
  const g = new THREE.Group();
  const [tx, tz] = e.pos;
  const barras: [THREE.Vector3, THREE.Vector3][] = [];
  const meia = (y: number) => 1.6 * (1 - y / e.altura) + 0.35;
  const canto = (y: number, i: number) => {
    const w = meia(y);
    const sx = i === 0 || i === 3 ? -1 : 1;
    const sz = i < 2 ? -1 : 1;
    return new THREE.Vector3(tx + sx * w, y, tz + sz * w);
  };
  const passo = 2.4;
  for (let y = 0; y < e.altura; y += passo) {
    const y2 = Math.min(e.altura, y + passo);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      barras.push([canto(y, i), canto(y2, i)]);
      barras.push([canto(y2, i), canto(y2, j)]);
      barras.push([canto(y, i), canto(y2, j)]);
      barras.push([canto(y, j), canto(y2, i)]);
    }
  }
  const geo = new THREE.CylinderGeometry(0.045, 0.045, 1, 5);
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.6, roughness: 0.5 }), barras.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  barras.forEach(([a, b], i) => {
    const d = b.clone().sub(a);
    q.setFromUnitVectors(up, d.clone().normalize());
    m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, d.length(), 1));
    inst.setMatrixAt(i, m);
  });
  g.add(inst);
  // antenas de setor no topo e uma parabólica de enlace
  const painel = new THREE.MeshStandardMaterial({ color: '#d9dcdf', roughness: 0.6 });
  const pg = new THREE.BoxGeometry(0.32, 1.4, 0.12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const p = new THREE.Mesh(pg, painel);
    p.position.set(tx + Math.cos(a) * 0.7, e.altura - 1.2, tz + Math.sin(a) * 0.7);
    p.rotation.y = -a + Math.PI / 2;
    g.add(p);
  }
  const prato = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 8, 0, Math.PI * 2, 0, Math.PI / 4), painel);
  prato.rotation.x = Math.PI / 2;
  prato.position.set(tx - 0.9, e.altura * 0.7, tz - 0.4);
  g.add(prato);
  // luzes de obstáculo vermelhas, piscando
  const bal = new THREE.MeshBasicMaterial({ color: '#ff2a1a', fog: false });
  const bg = new THREE.SphereGeometry(0.22, 10, 8);
  const luzes: THREE.Mesh[] = [];
  for (const y of [e.altura + 0.2, e.altura * 0.5]) {
    const b = new THREE.Mesh(bg, bal);
    b.position.set(tx, y, tz);
    b.userData.vivo = true;
    g.add(b);
    luzes.push(b);
  }
  return {
    grupo: g,
    animar: (t) => {
      const aceso = t % 1.5 < 0.75;
      for (const l of luzes) l.visible = aceso;
    },
  };
}

/* ---------- pátio da escola e o prédio vizinho ---------- */

function patio(e: Extract<Extra, { tipo: 'patio' }>): Peca {
  const g = new THREE.Group();
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), pbr('concrete_pavement', [30, 30], '#b8b3a6'));
  chao.rotation.x = -Math.PI / 2;
  chao.position.set(43, -0.01, 0);
  g.add(chao);
  // grama da praça, adiante do pátio
  const grama = new THREE.Mesh(new THREE.PlaneGeometry(14, 40), new THREE.MeshStandardMaterial({ color: '#5f8a3e', roughness: 1 }));
  grama.rotation.x = -Math.PI / 2;
  grama.position.set(14, 0.005, 0);
  g.add(grama);
  if (e.predio) {
    const tij = pbr('brick_wall_02', [10, 4], '#c19a86');
    const predio = new THREE.Mesh(new THREE.BoxGeometry(6, 12, 26), tij);
    predio.position.set(27, 6, -2);
    g.add(predio);
    const jan = canvas(256, 512, (c) => {
      c.fillStyle = '#00000000';
      c.clearRect(0, 0, 256, 512);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 5; j++) {
          c.fillStyle = '#2f3d4a';
          c.fillRect(22 + i * 58, 30 + j * 96, 36, 56);
          c.fillStyle = '#e8e2d6';
          c.fillRect(20 + i * 58, 86 + j * 96, 40, 5);
        }
    });
    const vidros = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), new THREE.MeshStandardMaterial({ map: jan, transparent: true, roughness: 0.4 }));
    vidros.position.set(23.98, 6, -2);
    vidros.rotation.y = -Math.PI / 2;
    g.add(vidros);
  }
  return { grupo: g };
}

/* ---------- quadro de giz ---------- */

function quadro(e: Extract<Extra, { tipo: 'quadro' }>): Peca {
  const g = new THREE.Group();
  const giz = canvas(1024, 620, (c) => {
    c.fillStyle = '#23402f';
    c.fillRect(0, 0, 1024, 620);
    const r = sorteio(11);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
      c.fillRect(r() * 1024, r() * 620, 30 + r() * 60, 2 + r() * 6);
    }
    c.strokeStyle = c.fillStyle = 'rgba(240,240,232,0.88)';
    c.lineWidth = 4;
    c.font = '600 54px "Comic Sans MS", "Segoe Print", cursive';
    c.fillText('Subcamada MAC', 60, 90);
    c.font = '38px "Comic Sans MS", "Segoe Print", cursive';
    c.fillText('meio compartilhado: um fala, todos ouvem', 60, 160);
    c.fillText('CSMA/CD: escuta, transmite, detecta colisão', 60, 220);
    c.fillText('colisão → espera aleatória (backoff)', 60, 280);
    // barramento com estações
    c.beginPath();
    c.moveTo(80, 420);
    c.lineTo(940, 420);
    c.stroke();
    for (let i = 0; i < 5; i++) {
      const x = 130 + i * 190;
      c.beginPath();
      c.moveTo(x, 420);
      c.lineTo(x, 370);
      c.stroke();
      c.strokeRect(x - 40, 320, 80, 50);
      c.fillText(String.fromCharCode(65 + i), x - 12, 358);
    }
    c.font = '32px "Comic Sans MS", "Segoe Print", cursive';
    c.fillText('quadro: preâmbulo | destino | origem | tipo | dados | FCS', 40, 530);
  });
  const lousa = new THREE.Mesh(new THREE.PlaneGeometry(e.larg, e.alt), new THREE.MeshStandardMaterial({ map: giz, roughness: 0.95 }));
  lousa.position.set(0, e.alt / 2, 0.022);
  g.add(lousa);
  const madeira = new THREE.MeshStandardMaterial({ color: '#7a5634', roughness: 0.7 });
  const mold = (w: number, h: number, x: number, y: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.045), madeira);
    m.position.set(x, y, 0.022);
    g.add(m);
  };
  mold(e.larg + 0.1, 0.05, 0, e.alt + 0.025);
  mold(e.larg + 0.1, 0.05, 0, -0.025);
  mold(0.05, e.alt, -e.larg / 2 - 0.025, e.alt / 2);
  mold(0.05, e.alt, e.larg / 2 + 0.025, e.alt / 2);
  // canaleta do giz
  const canaleta = new THREE.Mesh(new THREE.BoxGeometry(e.larg, 0.025, 0.08), madeira);
  canaleta.position.set(0, -0.04, 0.06);
  g.add(canaleta);
  const [x, , z] = naParede(e.lado, e.c, 0, 0);
  g.position.set(x, e.y, z);
  g.rotation.y = giroDoLado[e.lado];
  return { grupo: g };
}

/* ---------- distribuidor geral (DG) da central telefônica ---------- */

function distribuidor(e: Extract<Extra, { tipo: 'distribuidor' }>): Peca {
  const g = new THREE.Group();
  const comp = e.z1 - e.z0;
  const alt = 2.3;
  const ferro = new THREE.MeshStandardMaterial({ color: '#3d4742', metalness: 0.55, roughness: 0.55 });
  const montante = new THREE.BoxGeometry(0.06, alt, 0.06);
  const nMont = Math.round(comp / 0.5);
  for (let i = 0; i <= nMont; i++) {
    for (const dx of [-0.14, 0.14]) {
      const m = new THREE.Mesh(montante, ferro);
      m.position.set(e.x + dx, alt / 2, e.z0 + (i * comp) / nMont);
      g.add(m);
    }
  }
  for (const y of [0.08, 1.2, alt - 0.04])
    for (const dx of [-0.14, 0.14]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, comp), ferro);
      b.position.set(e.x + dx, y, (e.z0 + e.z1) / 2);
      g.add(b);
    }
  // blocos de terminais com os jumpers coloridos cruzando o lado vertical
  const blocos = canvas(512, 1024, (c) => {
    c.fillStyle = '#2b2f2c';
    c.fillRect(0, 0, 512, 1024);
    const r = sorteio(5);
    for (let j = 0; j < 18; j++) {
      c.fillStyle = '#d9cfb5';
      c.fillRect(40, 20 + j * 56, 432, 34);
      c.fillStyle = '#a8833f';
      for (let k = 0; k < 25; k++) c.fillRect(52 + k * 17, 28 + j * 56, 6, 18);
    }
    const cores = ['#e8e1d2', '#c23b2e', '#2f6fb4', '#e1b83a', '#3d8a4c', '#151515'];
    c.lineWidth = 3;
    for (let i = 0; i < 140; i++) {
      c.strokeStyle = cores[Math.floor(r() * cores.length)]!;
      c.beginPath();
      const x0 = 52 + Math.floor(r() * 25) * 17;
      const y0 = 37 + Math.floor(r() * 18) * 56;
      c.moveTo(x0, y0);
      c.bezierCurveTo(x0 + (r() - 0.5) * 200, y0 + 80, 256 + (r() - 0.5) * 300, y0 + 200 + r() * 300, 52 + Math.floor(r() * 25) * 17, 37 + Math.floor(r() * 18) * 56);
      c.stroke();
    }
  });
  blocos.wrapS = THREE.RepeatWrapping;
  blocos.repeat.set(Math.max(1, Math.round(comp / 1.2)), 1);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(comp - 0.1, alt - 0.35), new THREE.MeshStandardMaterial({ map: blocos, roughness: 0.75 }));
  face.position.set(e.x - 0.15, alt / 2 + 0.05, (e.z0 + e.z1) / 2);
  face.rotation.y = -Math.PI / 2;
  g.add(face);
  // plaqueta esmaltada com o nome
  const placa = canvas(512, 96, (c) => {
    c.fillStyle = '#1f3f73';
    c.fillRect(0, 0, 512, 96);
    c.fillStyle = '#f2efe6';
    c.font = 'bold 44px Georgia, serif';
    c.textAlign = 'center';
    c.fillText('DISTRIBUIDOR GERAL', 256, 64);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.17), new THREE.MeshStandardMaterial({ map: placa, roughness: 0.3, metalness: 0.2 }));
  p.position.set(e.x - 0.18, alt + 0.06, (e.z0 + e.z1) / 2);
  p.rotation.y = -Math.PI / 2;
  g.add(p);
  g.traverse((o) => (o.castShadow = o.receiveShadow = true));
  return { grupo: g };
}

/* ---------- racks de servidores (decoração, sem portas jogáveis) ---------- */

function frenteServidores(semente: number): THREE.CanvasTexture {
  return canvas(256, 1024, (c) => {
    c.fillStyle = '#07090b';
    c.fillRect(0, 0, 256, 1024);
    const r = sorteio(semente);
    let y = 30;
    while (y < 990) {
      const u = r() < 0.3 ? 2 : 1;
      const h = u * 22 - 2;
      if (r() < 0.12) {
        y += 22;
        continue;
      }
      c.fillStyle = r() < 0.5 ? '#2a2f35' : '#1c2025';
      c.fillRect(6, y, 244, h);
      c.fillStyle = '#0f1114';
      for (let k = 0; k < (u === 2 ? 12 : 8); k++) c.fillRect(30 + k * 17, y + 4, 12, h - 8);
      c.fillStyle = r() < 0.9 ? '#38e07a' : '#ffb020';
      c.fillRect(12, y + 5, 5, 5);
      c.fillStyle = '#3aa0ff';
      c.fillRect(12, y + h - 10, 5, 4);
      y += h + 2;
    }
  });
}

function racks(e: Extract<Extra, { tipo: 'racks' }>): Peca {
  const g = new THREE.Group();
  const modelo = rack42();
  const telas = [frenteServidores(1), frenteServidores(2), frenteServidores(3)].map(
    (t) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffffff', emissiveIntensity: 0.7, roughness: 0.5, metalness: 0.3 }),
  );
  const frente = new THREE.PlaneGeometry(0.46, 1.86);
  // porta perfurada: a frente aparece atrás de uma grade escura
  const grade = canvas(64, 64, (c) => {
    c.clearRect(0, 0, 64, 64);
    c.fillStyle = 'rgba(12,14,17,0.6)';
    for (let i = 0; i < 64; i += 8) for (let j = 0; j < 64; j += 8) c.fillRect(i, j, 3, 8);
  });
  grade.wrapS = grade.wrapT = THREE.RepeatWrapping;
  grade.repeat.set(12, 40);
  const porta = new THREE.MeshStandardMaterial({ map: grade, transparent: true, metalness: 0.6, roughness: 0.4, depthWrite: false });
  porta.userData.juntavel = true;
  const portaGeo = new THREE.PlaneGeometry(0.56, 1.98);
  e.lista.forEach((p, i) => {
    const r = modelo.clone();
    const f = new THREE.Mesh(frente, telas[i % telas.length]!);
    f.position.set(0, 1.05, 0.33);
    r.add(f);
    const d = new THREE.Mesh(portaGeo, porta);
    d.position.set(0, 1.05, 0.41);
    r.add(d);
    r.position.set(p.x, 0, p.z);
    r.rotation.y = p.giro;
    g.add(r);
  });
  return { grupo: g };
}

/* ---------- piso elevado: placas lisas e perfuradas (corredor frio) ---------- */

function pisoElevado(area: Obstaculo, furado: boolean): Peca {
  const t = canvas(128, 128, (c) => {
    c.fillStyle = furado ? '#c3cad2' : '#d5d9dd';
    c.fillRect(0, 0, 128, 128);
    if (!furado) {
      // placa lisa de 600 x 600 mm com leve variação do laminado
      const r = sorteio(9);
      for (let i = 0; i < 300; i++) {
        c.fillStyle = `rgba(90,100,110,${r() * 0.06})`;
        c.fillRect(r() * 128, r() * 128, 2 + r() * 4, 2 + r() * 4);
      }
    }
    c.fillStyle = '#4c5662';
    if (furado) for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) c.beginPath(), c.arc(11 + i * 9.6, 11 + j * 9.6, 2.4, 0, Math.PI * 2), c.fill();
    c.strokeStyle = furado ? '#59626d' : '#8f98a2';
    c.lineWidth = 1.5;
    c.strokeRect(0.75, 0.75, 126.5, 126.5);
  });
  const [x0, x1, z0, z1] = area;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set((x1 - x0) / 0.6, (z1 - z0) / 0.6);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: t, roughness: furado ? 0.6 : 0.45, metalness: furado ? 0.4 : 0.1, color: furado ? '#dfe8ff' : '#ffffff' }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, furado ? 0.004 : 0.002, (z0 + z1) / 2);
  m.receiveShadow = true;
  return { grupo: m };
}

/** Confinamento do corredor quente: teto e porta de policarbonato. */
function contencao(e: Extract<Extra, { tipo: 'contencao' }>): Peca {
  const g = new THREE.Group();
  const [x0, x1, z0, z1] = e.area;
  const vidro = new THREE.MeshStandardMaterial({ color: '#ffd2b8', transparent: true, opacity: 0.18, roughness: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const teto = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), vidro);
  teto.rotation.x = Math.PI / 2;
  teto.position.set((x0 + x1) / 2, e.y, (z0 + z1) / 2);
  g.add(teto);
  const porta = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, e.y), vidro);
  porta.rotation.y = Math.PI / 2;
  porta.position.set(x1, e.y / 2, (z0 + z1) / 2);
  g.add(porta);
  const perfil = new THREE.MeshStandardMaterial({ color: '#2b3036', metalness: 0.7, roughness: 0.4 });
  for (const [w, h, d, x, y, z] of [
    [0.04, e.y, 0.04, x1, e.y / 2, z0],
    [0.04, 0.04, z1 - z0, x1, e.y, (z0 + z1) / 2],
    [x1 - x0, 0.04, 0.04, (x0 + x1) / 2, e.y, z0],
  ] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), perfil);
    p.position.set(x, y, z);
    g.add(p);
  }
  return { grupo: g };
}

/* ---------- ar-condicionado de precisão ---------- */

function arPrecisao(e: Extract<Extra, { tipo: 'ar-precisao' }>): Peca {
  const g = new THREE.Group();
  const larg = 0.9;
  const alt = 1.95;
  const prof = 0.78;
  const frente = canvas(256, 556, (c) => {
    c.fillStyle = '#dcded8';
    c.fillRect(0, 0, 256, 556);
    // grelha de retorno em cima, venezianas embaixo
    c.fillStyle = '#9da19b';
    for (let i = 0; i < 26; i++) c.fillRect(18, 22 + i * 7, 220, 3);
    c.fillStyle = '#b6b9b3';
    c.fillRect(0, 212, 256, 3);
    for (let i = 0; i < 18; i++) {
      c.fillStyle = '#c3c6bf';
      c.fillRect(18, 330 + i * 11, 220, 6);
      c.fillStyle = '#8d918b';
      c.fillRect(18, 336 + i * 11, 220, 2);
    }
    // visor de comando
    c.fillStyle = '#1c2422';
    c.fillRect(70, 236, 116, 66);
    c.fillStyle = '#7dffb0';
    c.font = 'bold 22px monospace';
    c.fillText('22,0 °C', 84, 264);
    c.font = '16px monospace';
    c.fillText('UR 45 %', 96, 290);
    c.fillStyle = '#3f7d5b';
    c.fillRect(196, 244, 10, 10);
  });
  const corpo = new THREE.MeshStandardMaterial({ color: '#d4d6d0', roughness: 0.55, metalness: 0.2 });
  const caixa = new THREE.Mesh(new THREE.BoxGeometry(larg, alt, prof), [corpo, corpo, corpo, corpo, new THREE.MeshStandardMaterial({ map: frente, emissiveMap: frente, emissive: '#223322', emissiveIntensity: 0.4, roughness: 0.5 }), corpo]);
  caixa.position.y = alt / 2 + 0.06;
  caixa.castShadow = caixa.receiveShadow = true;
  g.add(caixa);
  const base = new THREE.Mesh(new THREE.BoxGeometry(larg - 0.04, 0.06, prof - 0.04), new THREE.MeshStandardMaterial({ color: '#1d2023', roughness: 0.8 }));
  base.position.y = 0.03;
  g.add(base);
  g.position.set(e.x, 0, e.z);
  g.rotation.y = e.giro;
  return { grupo: g };
}

/* ---------- eletrocalha ---------- */

function calha(e: Extract<Extra, { tipo: 'calha' }>): Peca {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: e.cor, metalness: 0.6, roughness: 0.5 });
  const fundo = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, e.comprimento), mat);
  g.add(fundo);
  for (const s of [-1, 1]) {
    const aba = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, e.comprimento), mat);
    aba.position.set(s * 0.1, 0.03, 0);
    g.add(aba);
  }
  g.position.set(e.x, e.y, e.z);
  if (e.eixo === 'x') g.rotation.y = Math.PI / 2;
  return { grupo: g };
}

/* ---------- telas: monitores de mesa e parede de telões ---------- */

function desenharTela(tipo: Tela, w: number, h: number, semente: number): THREE.CanvasTexture {
  return canvas(w, h, (c) => {
    const r = sorteio(semente);
    c.fillStyle = '#060a12';
    c.fillRect(0, 0, w, h);
    c.font = `${Math.round(h / 14)}px monospace`;
    if (tipo === 'campo') {
      c.fillStyle = '#2f7d32';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i += 2) {
        c.fillStyle = '#358a37';
        c.fillRect((i * w) / 8, 0, w / 8, h);
      }
      c.strokeStyle = '#e9f5e9';
      c.lineWidth = 3;
      c.strokeRect(w * 0.05, h * 0.08, w * 0.9, h * 0.84);
      c.beginPath();
      c.moveTo(w / 2, h * 0.08);
      c.lineTo(w / 2, h * 0.92);
      c.stroke();
      c.beginPath();
      c.arc(w / 2, h / 2, h * 0.16, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#c62828';
      c.fillRect(8, 8, 60, 22);
      c.fillStyle = '#fff';
      c.fillText('AO VIVO', 12, 25);
    } else if (tipo === 'placar') {
      c.fillStyle = '#0d1a30';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffd34d';
      c.font = `bold ${Math.round(h / 5)}px sans-serif`;
      c.textAlign = 'center';
      c.fillText('1 × 1', w / 2, h * 0.55);
      c.font = `${Math.round(h / 10)}px sans-serif`;
      c.fillStyle = '#e8eefc';
      c.fillText('FIM DE LINHA   ·   VILA DO OESTE', w / 2, h * 0.25);
      c.fillText("2º tempo  38'", w / 2, h * 0.82);
    } else if (tipo === 'grafico') {
      c.strokeStyle = '#1d2a3c';
      for (let i = 1; i < 6; i++) {
        c.beginPath();
        c.moveTo(0, (i * h) / 6);
        c.lineTo(w, (i * h) / 6);
        c.stroke();
      }
      for (const [cor, base] of [
        ['#3ddc84', 0.55],
        ['#4d8dff', 0.75],
      ] as const) {
        c.strokeStyle = cor;
        c.lineWidth = 3;
        c.beginPath();
        let y = h * base;
        for (let x = 0; x <= w; x += 8) {
          y = Math.max(h * 0.1, Math.min(h * 0.95, y + (r() - 0.5) * h * 0.08));
          if (x === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      c.fillStyle = '#9fb3cf';
      c.fillText('tráfego (Mb/s)', 10, h / 10);
    } else if (tipo === 'alertas') {
      const linhas = ['ALTA   varredura TCP SYN  203.0.113.45', 'MÉDIA  ARP duplicado     10.0.4.1', 'ALTA   DNS amplificação  198.51.100.7', 'BAIXA  login falhou x12   10.0.2.30', 'MÉDIA  MAC flap porta 7', 'ALTA   SYN flood         192.0.2.99'];
      linhas.forEach((l, i) => {
        c.fillStyle = l.startsWith('ALTA') ? '#ff5d5d' : l.startsWith('MÉDIA') ? '#ffb020' : '#7fb2ff';
        c.fillText(l, 10, ((i + 1.4) * h) / 8);
      });
    } else if (tipo === 'mapa') {
      c.strokeStyle = '#244a7a';
      c.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        c.beginPath();
        c.moveTo(r() * w, r() * h);
        c.lineTo(r() * w, r() * h);
        c.stroke();
      }
      for (let i = 0; i < 26; i++) {
        c.fillStyle = r() < 0.2 ? '#ff4d4d' : '#3ddc84';
        c.beginPath();
        c.arc(r() * w, r() * h, 3 + r() * 4, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#9fb3cf';
      c.fillText('Fim de Linha · enlaces', 10, h / 10);
    } else {
      c.fillStyle = '#3ddc84';
      ['$ tcpdump -n -i eth0', '10.0.4.9 > 10.0.0.1: S', '10.0.4.9 > 10.0.0.2: S', '10.0.4.9 > 10.0.0.3: S', '$ _'].forEach((l, i) => c.fillText(l, 10, ((i + 1.3) * h) / 7));
    }
  });
}

function monitores(e: Extract<Extra, { tipo: 'monitores' }>): Peca {
  const g = new THREE.Group();
  const preto = new THREE.MeshStandardMaterial({ color: '#111316', roughness: 0.45, metalness: 0.3 });
  const moldura = new THREE.BoxGeometry(0.56, 0.34, 0.025);
  const telaGeo = new THREE.PlaneGeometry(0.54, 0.315);
  const pescoco = new THREE.BoxGeometry(0.04, 0.16, 0.03);
  const pe = new THREE.CylinderGeometry(0.1, 0.11, 0.015, 24);
  const prototipo = new THREE.Group();
  const mold = new THREE.Mesh(moldura, preto);
  mold.position.y = 0.33;
  const pes = new THREE.Mesh(pescoco, preto);
  pes.position.set(0, 0.09, -0.03);
  const base = new THREE.Mesh(pe, preto);
  base.position.set(0, 0.008, -0.03);
  prototipo.add(mold, pes, base);
  e.lista.forEach((p, i) => {
    const m = prototipo.clone();
    const t = desenharTela(p.tela, 384, 224, 20 + i);
    const tela = new THREE.Mesh(telaGeo, new THREE.MeshBasicMaterial({ map: t }));
    tela.position.set(0, 0.33, 0.0135);
    m.add(tela);
    m.position.set(p.x, p.y, p.z);
    m.rotation.y = p.giro + (i % 2 ? -0.12 : 0.12);
    g.add(m);
  });
  return { grupo: g };
}

function teloes(e: Extract<Extra, { tipo: 'teloes' }>): Peca {
  const g = new THREE.Group();
  const larg = 1.5;
  const alt = 0.86;
  const tipos: Tela[] = ['mapa', 'alertas', 'grafico', 'grafico', 'terminal', 'alertas'];
  const moldura = new THREE.MeshStandardMaterial({ color: '#0a0b0d', roughness: 0.4, metalness: 0.4 });
  const fundo = new THREE.Mesh(new THREE.BoxGeometry(larg * 3 + 0.12, alt * 2 + 0.12, 0.06), moldura);
  fundo.position.set(e.x, e.y, e.z - 0.03);
  g.add(fundo);
  const geo = new THREE.PlaneGeometry(larg - 0.02, alt - 0.02);
  const rolar: THREE.Texture[] = [];
  tipos.forEach((tipo, i) => {
    const col = i % 3;
    const lin = Math.floor(i / 3);
    const t = desenharTela(tipo, 512, 292, 40 + i);
    if (tipo === 'grafico') {
      t.wrapS = THREE.RepeatWrapping;
      rolar.push(t);
    }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(e.x + (col - 1) * larg, e.y + (0.5 - lin) * alt, e.z - 0.065);
    m.rotation.y = Math.PI;
    g.add(m);
  });
  return {
    grupo: g,
    animar: (t) => {
      for (const tx of rolar) tx.offset.x = (t * 0.02) % 1;
    },
  };
}

/* ---------- estádio visto da cabine ---------- */

function estadio(): Peca {
  const g = new THREE.Group();
  const yCampo = -10;
  // gramado com faixas de corte e marcação (105 x 68 m)
  const gramado = canvas(1024, 664, (c) => {
    for (let i = 0; i < 20; i++) {
      c.fillStyle = i % 2 ? '#2f8a35' : '#38993d';
      c.fillRect((i * 1024) / 20, 0, 1024 / 20 + 1, 664);
    }
    c.strokeStyle = '#f2f7f2';
    c.lineWidth = 4;
    const mx = 40;
    const my = 30;
    c.strokeRect(mx, my, 1024 - 2 * mx, 664 - 2 * my);
    c.beginPath();
    c.moveTo(512, my);
    c.lineTo(512, 664 - my);
    c.stroke();
    c.beginPath();
    c.arc(512, 332, 88, 0, Math.PI * 2);
    c.stroke();
    for (const lado of [0, 1]) {
      const x = lado ? 1024 - mx - 160 : mx;
      c.strokeRect(x, 332 - 195, 160, 390);
      c.strokeRect(lado ? 1024 - mx - 54 : mx, 332 - 88, 54, 176);
    }
    // luz cozida dos refletores: o centro bem iluminado, cantos mais escuros e uma poça
    // de cada torre, com as quatro sombras fracas cruzadas de quem tem luz de todo lado
    c.globalCompositeOperation = 'multiply';
    const vinheta = c.createRadialGradient(512, 332, 120, 512, 332, 640);
    vinheta.addColorStop(0, '#ffffff');
    vinheta.addColorStop(1, '#5a6258');
    c.fillStyle = vinheta;
    c.fillRect(0, 0, 1024, 664);
    c.globalCompositeOperation = 'screen';
    for (const [px, py] of [
      [300, 200],
      [724, 200],
      [300, 464],
      [724, 464],
    ] as const) {
      const p = c.createRadialGradient(px, py, 10, px, py, 330);
      p.addColorStop(0, 'rgba(255,250,228,0.28)');
      p.addColorStop(1, 'rgba(255,250,228,0)');
      c.fillStyle = p;
      c.fillRect(0, 0, 1024, 664);
    }
    c.globalCompositeOperation = 'source-over';
  });
  const campo = new THREE.Mesh(new THREE.PlaneGeometry(115, 76), new THREE.MeshBasicMaterial({ map: gramado, color: '#e6f2e2' }));
  campo.rotation.x = -Math.PI / 2;
  campo.position.set(0, yCampo, 22 + 38);
  g.add(campo);
  // arquibancadas: degraus com cadeiras azuis e brancas (vazias de gente, só a cor)
  const cadeiras = canvas(512, 512, (c) => {
    for (let j = 0; j < 32; j++) {
      c.fillStyle = '#5b6068';
      c.fillRect(0, j * 16, 512, 16);
      c.fillStyle = '#3d4148';
      c.fillRect(0, j * 16 + 12, 512, 4);
      for (let i = 0; i < 64; i++) {
        const faixa = Math.floor(i / 8) % 2;
        c.fillStyle = faixa ? '#e8ecf2' : '#1f4fa8';
        c.fillRect(i * 8 + 1, j * 16 + 3, 6, 8);
      }
    }
  });
  cadeiras.wrapS = cadeiras.wrapT = THREE.RepeatWrapping;
  const arquibancada = (larg: number, z0: number, y0: number, z1: number, y1: number) => {
    const comp = Math.hypot(z1 - z0, y1 - y0);
    const t = cadeiras.clone();
    t.repeat.set(larg / 8, comp / 8);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, comp), new THREE.MeshBasicMaterial({ map: t, color: '#b5bac4', side: THREE.DoubleSide }));
    // o eixo y do plano vira a linha de maior declive da arquibancada
    m.rotation.x = Math.atan2(z1 - z0, y1 - y0);
    m.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    g.add(m);
  };
  // do nosso lado, descendo da cabine até o campo
  arquibancada(120, 4, -1.5, 20, yCampo);
  // do outro lado e nas cabeceiras, subindo
  arquibancada(130, 100, yCampo, 122, 8);
  const lateral = (sx: number) => {
    const t = cadeiras.clone();
    t.repeat.set(9, 3);
    t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(80, 26), new THREE.MeshBasicMaterial({ map: t, color: '#a9aeb8', side: THREE.DoubleSide }));
    m.position.set(sx * 68, -1, 60);
    m.rotation.set(0, sx * -Math.PI / 2, 0);
    m.rotateX(-0.75);
    g.add(m);
  };
  lateral(1);
  lateral(-1);
  // cobertura escura sobre a arquibancada do outro lado
  const cobertura = new THREE.Mesh(new THREE.PlaneGeometry(130, 14), new THREE.MeshBasicMaterial({ color: '#15181d', side: THREE.DoubleSide }));
  cobertura.rotation.x = Math.PI / 2 - 0.12;
  cobertura.position.set(0, 16, 117);
  g.add(cobertura);
  // torres de refletores nos quatro cantos
  const mastro = new THREE.MeshBasicMaterial({ color: '#3a3f47' });
  const lampadas = canvas(256, 128, (c) => {
    c.fillStyle = '#20242a';
    c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 4; j++) {
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.arc(16 + i * 32, 16 + j * 32, 12, 0, Math.PI * 2);
        c.fill();
      }
  });
  const painel = new THREE.MeshBasicMaterial({ map: lampadas, color: '#fffbe8', fog: false });
  const brilho = canvas(128, 128, (c) => {
    const gr = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,250,235,0.9)');
    gr.addColorStop(1, 'rgba(255,250,235,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
  });
  const halo = new THREE.SpriteMaterial({ map: brilho, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  for (const [x, z] of [
    [-62, 12],
    [62, 12],
    [-62, 112],
    [62, 112],
  ] as const) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 46, 8), mastro);
    m.position.set(x, yCampo + 23, z);
    g.add(m);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), painel);
    p.position.set(x * 0.97, yCampo + 47, z + (z < 60 ? 1 : -1));
    p.lookAt(0, yCampo, 60);
    g.add(p);
    const s = new THREE.Sprite(halo);
    s.scale.set(26, 26, 1);
    s.position.copy(p.position);
    g.add(s);
    // o facho de cada torre até o meio do campo, na umidade da noite
    if (!M.leve) g.add(cone(p.position.clone(), new THREE.Vector3(x * 0.35, yCampo, z < 60 ? 42 : 78), 26, '#fff6dc', 0.05));
  }
  // céu de noite clareado pela luz do estádio, com as poucas estrelas que vencem o clarão
  g.add(ceu({ tipo: 'ceu', topo: '#04060c', horizonte: '#2c3a55', baixo: '#101318', estrelas: 120 }).grupo);
  // a face externa da cabine, logo abaixo da janela
  const fachada = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), new THREE.MeshStandardMaterial({ color: '#30353c', roughness: 0.9 }));
  fachada.position.set(0.3, -3, 3.12);
  fachada.rotation.y = Math.PI;
  g.add(fachada);
  return { grupo: g };
}

/** Constrói um extra pelo tipo. */
export function montarExtra(e: Extra): Peca {
  switch (e.tipo) {
    case 'ceu':
      return ceu(e);
    case 'rua':
      return rua();
    case 'fios':
      return fios(e);
    case 'torre':
      return torre(e);
    case 'patio':
      return patio(e);
    case 'quadro':
      return quadro(e);
    case 'distribuidor':
      return distribuidor(e);
    case 'racks':
      return racks(e);
    case 'piso-perfurado':
      return pisoElevado(e.area, true);
    case 'piso-elevado':
      return pisoElevado(e.area, false);
    case 'contencao':
      return contencao(e);
    case 'ar-precisao':
      return arPrecisao(e);
    case 'calha':
      return calha(e);
    case 'monitores':
      return monitores(e);
    case 'teloes':
      return teloes(e);
    case 'estadio':
      return estadio();
    case 'brilhos':
      return brilhos(e);
  }
}
