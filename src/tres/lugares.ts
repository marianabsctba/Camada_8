// Um lugar 3D por ato (DESENHO.md, tabela "Lugar em 3D"), descrito só com dados.
// A sala (sala.ts) monta a casca, as luzes e a mobília a partir daqui; o que não é móvel
// pronto (céu, torre, estádio, telões, racks de servidor) vem de cenario.ts pelo "tipo".
//
// Coordenadas: a área jogável é sempre x e z de -3 a 3 (J.limites). Fundo é z = -3, onde
// fica o rack (RACK em equipamentos3d.ts); esquerda é x = -3, onde fica a bancada (BANCADA);
// a estante do almoxarifado fica sempre perto de (2.6, -1.4), na parede da direita.
// Móveis do Poly Haven olham para +z: giro 0 encosta na parede do fundo, PI na da frente,
// PI/2 na da esquerda e -PI/2 na da direita.

import type { Superficie } from './pbr';

export type V3 = [number, number, number];
/** Retângulo de colisão no chão: [x0, x1, z0, z1]. */
export type Obstaculo = [number, number, number, number];
export type Lado = 'fundo' | 'frente' | 'esq' | 'dir';

export interface Acabamento {
  tex: Superficie;
  /** Metros que uma repetição da textura cobre. */
  m: number;
  tinta: string;
}

/** Vão na parede: c é a posição do centro ao longo da parede, em coordenada do mundo. */
export interface Vao {
  c: number;
  larg: number;
  base: number;
  topo: number;
}

export interface Parede {
  lado: Lado;
  vaos?: Vao[];
  /** Barra de tinta a óleo na parte de baixo, como em repartição pública antiga. */
  barra?: { altura: number; tinta: string };
}

export interface Luz {
  tipo: 'ponto' | 'foco' | 'sol';
  cor: string;
  forca: number;
  pos: V3;
  alcance?: number;
  alvo?: V3;
  angulo?: number;
  /** Só uma luz por lugar projeta sombra (e nenhuma no modo leve). */
  sombra?: boolean;
  /** A lâmpada fluorescente que está morrendo. */
  tremer?: boolean;
}

export interface Movel {
  arq: string;
  /** [x, z] no chão ou [x, y, z] apoiado em algo. */
  pos: [number, number] | V3;
  giro?: number;
  altura?: number;
  largura?: number;
  /** Peça de um kit modular ("nome" exato ou "prefixo*"). */
  parte?: string;
  /** É a estante do almoxarifado (alvo do menu de peças). */
  almox?: boolean;
  /** Enfeite que some no modo leve. */
  detalhe?: boolean;
}

/** Peças feitas em código (cenario.ts), quando não há modelo pronto que sirva. */
export type Extra =
  | { tipo: 'ceu'; topo: string; horizonte: string; baixo: string; estrelas: number }
  | { tipo: 'rua' }
  | { tipo: 'fios'; pontos: V3[]; queda: number }
  | { tipo: 'torre'; pos: [number, number]; altura: number }
  | { tipo: 'patio'; predio: boolean }
  | { tipo: 'quadro'; lado: Lado; c: number; y: number; larg: number; alt: number }
  | { tipo: 'distribuidor'; x: number; z0: number; z1: number }
  | { tipo: 'racks'; lista: { x: number; z: number; giro: number }[] }
  | { tipo: 'piso-perfurado'; area: Obstaculo }
  | { tipo: 'piso-elevado'; area: Obstaculo }
  | { tipo: 'contencao'; area: Obstaculo; y: number }
  | { tipo: 'ar-precisao'; x: number; z: number; giro: number }
  | { tipo: 'calha'; x: number; z: number; y: number; comprimento: number; eixo: 'x' | 'z'; cor: string }
  | { tipo: 'monitores'; lista: { x: number; y: number; z: number; giro: number; tela: Tela }[] }
  | { tipo: 'teloes'; z: number; x: number; y: number }
  | { tipo: 'estadio' };

/** Conteúdo desenhado nas telas dos monitores. */
export type Tela = 'campo' | 'placar' | 'grafico' | 'alertas' | 'mapa' | 'terminal';

export interface Lugar {
  nome: string;
  /** Cor de fundo da cena (o que aparece se nada for desenhado). */
  fundo: string;
  nevoa?: { cor: string; perto: number; longe: number };
  exposicao: number;
  /** Intensidade do reflexo de ambiente (RoomEnvironment). */
  ambiente: number;
  /** Pé-direito. */
  alt: number;
  piso: Acabamento;
  /** Área do piso, se passar da área jogável (calçada na rua). */
  pisoArea?: Obstaculo;
  parede: Acabamento;
  /** null: céu aberto. */
  teto: Acabamento | null;
  rodape?: string;
  paredes: Parede[];
  hemi: { ceu: string; chao: string; forca: number };
  luzes: Luz[];
  /** Luminárias e lâmpadas penduradas (só a peça; a luz está em "luzes"). */
  luminarias: Movel[];
  /** Mesa da bancada: repetida a cada "passo" metros ao longo da parede da esquerda. */
  mesa: { arq: string; altura: number; giro: number; passo: number };
  moveis: Movel[];
  obstaculos: Obstaculo[];
  extras: Extra[];
  /** Onde a pessoa começa: [x, z, giro]. Padrão: [0.2, 1.6, 0.25], de frente para o rack. */
  inicio?: V3;
  /** Texturas usadas pelos extras, para o pré-carregamento. */
  texturasExtras?: Superficie[];
}

const PI = Math.PI;
const ALMOX: Obstaculo = [2.2, 3, -2, -0.8];
const MESA_METAL = { arq: 'metal_office_desk', altura: 0.76, giro: PI / 2, passo: 1.6 };
const MESA_MADEIRA = { arq: 'painted_wooden_table', altura: 0.76, giro: PI / 2, passo: 1.9 };
const QUATRO: Parede[] = [{ lado: 'fundo' }, { lado: 'frente' }, { lado: 'esq' }, { lado: 'dir' }];

/* ---------- Ato 0: o galpão do provedor ---------- */

const galpao: Lugar = {
  nome: 'o galpão do provedor',
  fundo: '#0b1016',
  exposicao: 1.15,
  ambiente: 0.45,
  alt: 2.8,
  piso: { tex: 'garage_floor', m: 2, tinta: '#b9bec4' },
  parede: { tex: 'painted_plaster_wall', m: 2, tinta: '#6f7d8c' },
  teto: { tex: 'smooth_concrete_floor', m: 3, tinta: '#7d848c' },
  rodape: '#3a3f45',
  paredes: QUATRO,
  hemi: { ceu: '#a9c2dd', chao: '#1a1f26', forca: 0.35 },
  luzes: [
    { tipo: 'ponto', cor: '#e8f1ff', forca: 7, pos: [0, 2.55, -1.6], alcance: 9, sombra: true },
    { tipo: 'ponto', cor: '#e8f1ff', forca: 5, pos: [0, 2.55, 1.2], alcance: 9, tremer: true },
  ],
  luminarias: [
    { arq: 'mounted_fluorescent_lights', pos: [0, 2.7, -1.6], largura: 1.25 },
    { arq: 'mounted_fluorescent_lights', pos: [0, 2.7, 1.2], largura: 1.25 },
  ],
  mesa: MESA_METAL,
  moveis: [
    { arq: 'steel_frame_shelves_01', pos: [2.6, -1.4], giro: -PI / 2, altura: 1.9, almox: true },
    { arq: 'cardboard_box_01', pos: [2.55, -0.4], giro: 0.3, altura: 0.32 },
    { arq: 'industrial_storage_cart', pos: [2.3, 1.2], giro: -PI / 2, altura: 0.9 },
    { arq: 'metal_toolbox', pos: [2.3, 0.9, 1.2], giro: -1.2, altura: 0.2 },
    { arq: 'plastic_monobloc_chair_01', pos: [-1.7, -0.6], giro: -PI / 2, altura: 0.82 },
    { arq: 'metal_trash_can', pos: [-2.6, 2.4], altura: 0.45, detalhe: true },
    { arq: 'plastic_crate_01', pos: [1.7, -2.6], giro: 0.2, altura: 0.3, detalhe: true },
    { arq: 'fire_alarm', pos: [-1.2, 2.2, 2.95], altura: 0.12, giro: PI },
    { arq: 'security_camera_01', pos: [2.75, 2.5, -2.75], altura: 0.18, giro: PI * 0.75 },
  ],
  obstaculos: [ALMOX, [1.9, 2.7, 0.8, 1.6]],
  extras: [{ tipo: 'calha', x: 0.6, z: 0, y: 2.74, comprimento: 5.4, eixo: 'z', cor: '#5d656e' }],
};

/* ---------- Ato 1: a rua, o poste e a torre ---------- */

// Pátio cercado nos fundos de um sobrado, à noite: o rack fica num gabinete de rua encostado
// no muro, a bancada embaixo da luminária de parede, e o alambrado dá para a rua.
const rua: Lugar = {
  nome: 'a rua, o poste e a torre',
  fundo: '#05080f',
  nevoa: { cor: '#0b111c', perto: 30, longe: 140 },
  exposicao: 1.05,
  ambiente: 0.12,
  alt: 4.2,
  piso: { tex: 'concrete_pavement', m: 2, tinta: '#a3a39e' },
  pisoArea: [-3, 4.2, -3, 4.2],
  parede: { tex: 'brick_wall_02', m: 2.2, tinta: '#a08d82' },
  teto: null,
  paredes: [{ lado: 'fundo' }, { lado: 'esq' }],
  hemi: { ceu: '#405079', chao: '#0d0f14', forca: 0.4 },
  luzes: [
    // luminária de vapor de sódio na parede, sobre a área de trabalho
    { tipo: 'foco', cor: '#ffb563', forca: 26, pos: [0.6, 3.25, -2.45], alvo: [-0.4, 0, 0.2], angulo: 1.05, alcance: 14, sombra: true },
    { tipo: 'ponto', cor: '#dfe8ff', forca: 2.2, pos: [-2.6, 2.6, 0.4], alcance: 6 },
    { tipo: 'ponto', cor: '#ffc27a', forca: 18, pos: [6.5, 3.6, 5.2], alcance: 16 },
    { tipo: 'ponto', cor: '#ffc27a', forca: 14, pos: [-7.5, 3.6, 5.2], alcance: 16 },
  ],
  luminarias: [
    { arq: 'street_lamp_02', pos: [0.6, 2.75, -2.6], altura: 1.0 },
    { arq: 'security_light', pos: [-2.85, 2.45, 0.4], altura: 0.35, giro: PI / 2 },
    { arq: 'street_lamp_01', pos: [6.5, 5.2], altura: 3.9 },
    { arq: 'street_lamp_01', pos: [-7.5, 5.2], altura: 3.9 },
  ],
  mesa: MESA_METAL,
  moveis: [
    { arq: 'steel_frame_shelves_02', pos: [2.62, -1.4], giro: -PI / 2, altura: 1.9, almox: true },
    { arq: 'tool_cart', pos: [2.35, 1.2], giro: -PI / 2, altura: 0.9 },
    { arq: 'metal_toolbox', pos: [2.35, 0.9, 1.0], giro: -1.3, altura: 0.2 },
    { arq: 'plastic_crate_01', pos: [2.55, -0.35], giro: 0.4, altura: 0.3 },
    { arq: 'cardboard_box_01', pos: [2.55, 0.9, -1.4], giro: 0.2, altura: 0.25, detalhe: true },
    { arq: 'plastic_monobloc_chair_01', pos: [-1.7, -0.6], giro: -PI / 2, altura: 0.82 },
    { arq: 'concrete_road_barrier', pos: [1.25, 2.6], giro: 0.05, altura: 0.82 },
    { arq: 'exterior_aircon_unit', parte: 'exterior_aircon_unit', pos: [-1.6, 2.35, -2.8], altura: 0.62 },
    { arq: 'power_box_01', pos: [-2.85, 1.15, 2.2], altura: 0.5, giro: PI / 2 },
    { arq: 'fire_hydrant', pos: [4.7, 4.1], altura: 0.8, detalhe: true },
    // alambrado nos dois lados abertos do pátio
    ...[-2, 0, 2].map((z) => ({ arq: 'modular_chainlink_fence', parte: 'modular_chainlink_fence_double', pos: [3.1, z] as [number, number], giro: PI / 2, largura: 2 })),
    ...[-2, 0, 2].map((x) => ({ arq: 'modular_chainlink_fence', parte: 'modular_chainlink_fence_double', pos: [x, 3.1] as [number, number], largura: 2 })),
    // postes de distribuição do outro lado da rua, com transformador
    { arq: 'modular_electricity_poles', parte: 'preset_01_*', pos: [-9, 11.2], altura: 7.2 },
    { arq: 'modular_electricity_poles', parte: 'preset_01_*', pos: [6, 11.2], altura: 7.2 },
    { arq: 'modular_electricity_poles', parte: 'preset_02_*', pos: [21, 11.2], altura: 7.2, detalhe: true },
  ],
  obstaculos: [ALMOX, [1.9, 2.8, 0.6, 1.8], [0.4, 2.1, 2.3, 3]],
  extras: [
    { tipo: 'ceu', topo: '#02040a', horizonte: '#1c2436', baixo: '#2a2622', estrelas: 700 },
    { tipo: 'rua' },
    {
      tipo: 'fios',
      queda: 0.45,
      pontos: [
        [-24, 6.6, 11.2],
        [-9, 6.6, 11.2],
        [6, 6.6, 11.2],
        [21, 6.6, 11.2],
        [36, 6.6, 11.2],
      ],
    },
    // cabo de descida do poste até o gabinete no muro
    { tipo: 'fios', queda: 0.6, pontos: [[6, 6.2, 11.2], [1.1, 3.95, -2.95]] },
    { tipo: 'torre', pos: [16, 30], altura: 34 },
  ],
  texturasExtras: ['asphalt_02', 'concrete_pavement'],
};

/* ---------- Ato 2: a central telefônica antiga ---------- */

const central: Lugar = {
  nome: 'a central telefônica antiga',
  fundo: '#120d08',
  exposicao: 1.08,
  ambiente: 0.28,
  alt: 3.4,
  piso: { tex: 'herringbone_parquet', m: 1.6, tinta: '#a58a72' },
  parede: { tex: 'beige_wall_002', m: 2, tinta: '#ddd2ad' },
  teto: { tex: 'white_plaster_02', m: 2, tinta: '#cfc4a8' },
  rodape: '#3b2a1e',
  paredes: QUATRO.map((p) => ({ ...p, barra: { altura: 1.3, tinta: '#6d8a70' } })),
  hemi: { ceu: '#f0cf9c', chao: '#2a1d14', forca: 0.32 },
  luzes: [
    { tipo: 'ponto', cor: '#ffbf6b', forca: 9, pos: [-0.2, 2.45, -1.3], alcance: 10, sombra: true },
    { tipo: 'ponto', cor: '#ffbf6b', forca: 7, pos: [0.4, 2.45, 1.5], alcance: 10 },
    { tipo: 'ponto', cor: '#ffd59a', forca: 0.8, pos: [-1.2, 1.55, 2.55], alcance: 2.5 },
  ],
  luminarias: [
    { arq: 'hanging_industrial_lamp', pos: [-0.2, 2.5, -1.3], altura: 0.9 },
    { arq: 'hanging_industrial_lamp', pos: [0.4, 2.5, 1.5], altura: 0.9 },
  ],
  mesa: MESA_MADEIRA,
  moveis: [
    { arq: 'worn_metal_rack', pos: [2.62, -1.4], giro: -PI / 2, altura: 1.9, almox: true },
    { arq: 'cardboard_box_01', pos: [2.62, 1.12, -1.4], giro: -0.2, altura: 0.25, detalhe: true },
    { arq: 'vintage_cabinet_01', pos: [0.65, 2.66], giro: PI, altura: 2.2 },
    { arq: 'painted_wooden_cabinet', pos: [-1.3, 2.68], giro: PI, altura: 1.05 },
    { arq: 'vintage_radio_transceiver', pos: [-1.05, 1.05, 2.62], giro: PI, altura: 0.34 },
    { arq: 'desk_lamp_arm_01', pos: [-1.65, 1.05, 2.66], giro: PI * 0.8, altura: 0.5 },
    { arq: 'painted_wooden_cabinet_02', pos: [-1.45, -2.64], altura: 2.3 },
    { arq: 'vintage_telephone_wall_clock', pos: [-0.35, 1.8, -2.9], altura: 0.42 },
    { arq: 'dining_chair_02', pos: [-1.7, -0.6], giro: -PI / 2, altura: 0.95 },
    { arq: 'korean_fire_extinguisher_01', pos: [1.55, -2.85], altura: 0.6, detalhe: true },
    { arq: 'binder_notebook', pos: [-1.05, 1.05, 2.82], giro: 0.3, largura: 0.4, detalhe: true },
  ],
  obstaculos: [ALMOX, [-0.4, 1.7, 2.3, 3], [-1.95, -0.65, 2.35, 3], [-1.95, -0.95, -3, -2.25], [2.42, 3, -0.55, 2.6]],
  extras: [
    { tipo: 'distribuidor', x: 2.8, z0: -0.5, z1: 2.55 },
    { tipo: 'calha', x: 1.7, z: 0.5, y: 3.0, comprimento: 3.4, eixo: 'x', cor: '#4a3b2b' },
  ],
};

/* ---------- Ato 3: o prédio, a escola e a praça ---------- */

const escola: Lugar = {
  nome: 'o prédio, a escola e a praça',
  fundo: '#a9c9ec',
  exposicao: 1.0,
  ambiente: 0.5,
  alt: 3.0,
  piso: { tex: 'terrazzo_tiles', m: 1.4, tinta: '#d8d2c4' },
  parede: { tex: 'plastered_wall_02', m: 2, tinta: '#f1e8d0' },
  teto: { tex: 'white_plaster_02', m: 2, tinta: '#f3efe4' },
  rodape: '#4f6656',
  paredes: [
    { lado: 'fundo', barra: { altura: 1.1, tinta: '#86ad92' } },
    { lado: 'frente', barra: { altura: 1.1, tinta: '#86ad92' } },
    { lado: 'esq', barra: { altura: 1.1, tinta: '#86ad92' } },
    {
      lado: 'dir',
      barra: { altura: 1.1, tinta: '#86ad92' },
      vaos: [
        { c: -1.35, larg: 1.3, base: 1.2, topo: 2.6 },
        { c: 0.4, larg: 1.3, base: 1.2, topo: 2.6 },
        { c: 2.05, larg: 1.3, base: 1.2, topo: 2.6 },
      ],
    },
  ],
  hemi: { ceu: '#d4e6ff', chao: '#6d6455', forca: 0.6 },
  luzes: [
    { tipo: 'sol', cor: '#fff0d2', forca: 2.6, pos: [14, 10, -4], alvo: [0, 0, 0.5], sombra: true },
    { tipo: 'ponto', cor: '#f5f8ff', forca: 3.2, pos: [-0.9, 2.8, -1.2], alcance: 8 },
    { tipo: 'ponto', cor: '#f5f8ff', forca: 3.2, pos: [-0.9, 2.8, 1.5], alcance: 8 },
  ],
  luminarias: [
    { arq: 'mounted_fluorescent_lights', pos: [-0.9, 2.96, -1.2], largura: 1.25 },
    { arq: 'mounted_fluorescent_lights', pos: [-0.9, 2.96, 1.5], largura: 1.25 },
    { arq: 'ceiling_fan', pos: [1.45, 2.55, 1.45], largura: 1.3, detalhe: true },
  ],
  mesa: MESA_MADEIRA,
  moveis: [
    { arq: 'painted_wooden_shelves', pos: [2.75, -1.4], giro: -PI / 2, altura: 1.1, almox: true },
    { arq: 'book_encyclopedia_set_01', pos: [2.72, 1.1, -1.15], giro: -PI / 2, largura: 0.45, detalhe: true },
    // carteiras em duas fileiras, viradas para o quadro na parede do fundo
    ...[0.95, 2.05].flatMap((x) =>
      [0.95, 2.05].flatMap((z) => [
        { arq: 'SchoolDesk_01', pos: [x, z - 0.12] as [number, number], giro: PI, altura: 0.76 },
        { arq: 'SchoolChair_01', pos: [x, z + 0.38] as [number, number], giro: PI, altura: 0.86 },
      ]),
    ),
    { arq: 'standing_chalkboard_01', pos: [2.35, -2.5], giro: -PI / 4, altura: 1.5 },
    { arq: 'projector_screen', pos: [-1.45, 2.55], giro: PI, altura: 1.8, detalhe: true },
    { arq: 'wall_clock', pos: [-1.15, 2.45, -2.97], altura: 0.3 },
    { arq: 'potted_plant_01', pos: [-0.25, 2.65], altura: 1.1, detalhe: true },
    { arq: 'plastic_monobloc_chair_01', pos: [-1.75, -0.6], giro: -PI / 2, altura: 0.82 },
    { arq: 'korean_fire_extinguisher_01', pos: [0.55, 2.86], giro: PI, altura: 0.6, detalhe: true },
  ],
  obstaculos: [ALMOX, [0.5, 2.5, 0.5, 2.7], [1.85, 2.85, -2.95, -2.05], [-2.05, -0.85, 2.15, 3]],
  extras: [
    { tipo: 'quadro', lado: 'fundo', c: -1.15, y: 0.95, larg: 1.8, alt: 1.1 },
    { tipo: 'ceu', topo: '#3d7fd6', horizonte: '#cfe4f7', baixo: '#b9b3a3', estrelas: 0 },
    { tipo: 'patio', predio: true },
  ],
  texturasExtras: ['concrete_pavement', 'brick_wall_02'],
};

/* ---------- Ato 4: o data center municipal ---------- */

const RACKS_DC = [
  ...[-0.1, 0.5, 1.1, 1.7, 2.3].map((z) => ({ x: 2.6, z, giro: -PI / 2 })),
  ...[-1.5, -0.9, -0.3, 0.3, 0.9].map((x) => ({ x, z: 1.7, giro: PI })),
];

const datacenter: Lugar = {
  nome: 'o data center municipal',
  fundo: '#0d1218',
  exposicao: 1.1,
  ambiente: 0.55,
  alt: 3.0,
  piso: { tex: 'smooth_concrete_floor', m: 3, tinta: '#8a929b' },
  parede: { tex: 'painted_plaster_wall', m: 2, tinta: '#dde5ee' },
  teto: { tex: 'white_plaster_02', m: 2, tinta: '#e3e8ee' },
  rodape: '#596270',
  paredes: QUATRO,
  hemi: { ceu: '#dbe8ff', chao: '#2b3038', forca: 0.5 },
  luzes: [
    { tipo: 'ponto', cor: '#eef5ff', forca: 7, pos: [-0.5, 2.75, -1.5], alcance: 9, sombra: true },
    { tipo: 'ponto', cor: '#eef5ff', forca: 5, pos: [-0.5, 2.75, 0.7], alcance: 8 },
    { tipo: 'ponto', cor: '#ff9f6e', forca: 1.6, pos: [-0.3, 2.4, 2.55], alcance: 3.2 },
  ],
  luminarias: [
    { arq: 'mounted_fluorescent_lights', pos: [-0.5, 2.95, -1.5], largura: 1.25 },
    { arq: 'mounted_fluorescent_lights', pos: [-0.5, 2.95, 0.7], largura: 1.25 },
    { arq: 'mounted_fluorescent_lights', pos: [1.8, 2.95, 0.7], largura: 1.25, detalhe: true },
  ],
  mesa: MESA_METAL,
  moveis: [
    { arq: 'steel_frame_shelves_02', pos: [2.62, -1.4], giro: -PI / 2, altura: 1.9, almox: true },
    { arq: 'plastic_crate_01', pos: [2.62, 0.62, -1.4], giro: -PI / 2, altura: 0.22, detalhe: true },
    { arq: 'plastic_monobloc_chair_01', pos: [-1.7, -0.6], giro: -PI / 2, altura: 0.82 },
    { arq: 'korean_fire_extinguisher_01', pos: [1.6, -2.85], altura: 0.6 },
    { arq: 'security_camera_01', pos: [2.75, 2.65, -2.75], altura: 0.18, giro: PI * 0.75 },
    { arq: 'fire_alarm', pos: [-1.2, 2.2, -2.97], altura: 0.12 },
  ],
  obstaculos: [ALMOX, [2.18, 3, -0.45, 2.65], [-1.85, 1.25, 1.28, 2.12]],
  inicio: [0.2, 0.6, 0.25],
  extras: [
    { tipo: 'piso-elevado', area: [-3, 3, -3, 3] },
    { tipo: 'racks', lista: RACKS_DC },
    { tipo: 'piso-perfurado', area: [1.4, 2.2, -0.4, 2.6] },
    { tipo: 'piso-perfurado', area: [-1.8, 1.2, 0.7, 1.3] },
    { tipo: 'contencao', area: [-1.8, 1.2, 2.1, 3], y: 2.2 },
    { tipo: 'calha', x: -0.3, z: 1.7, y: 2.65, comprimento: 3.2, eixo: 'x', cor: '#e2b100' },
    { tipo: 'calha', x: 2.6, z: 0.5, y: 2.65, comprimento: 3.6, eixo: 'z', cor: '#e2b100' },
    { tipo: 'calha', x: 0.6, z: -1.0, y: 2.75, comprimento: 3.2, eixo: 'z', cor: '#6b737c' },
  ],
};

/* ---------- Ato 5: a sala dos servidores ---------- */

const servidores: Lugar = {
  nome: 'a sala dos servidores',
  fundo: '#0c1112',
  exposicao: 1.1,
  ambiente: 0.4,
  alt: 2.6,
  piso: { tex: 'old_linoleum_flooring_01', m: 2, tinta: '#8f9a9a' },
  parede: { tex: 'painted_plaster_wall', m: 2, tinta: '#c4d0cd' },
  teto: { tex: 'grey_plaster', m: 2, tinta: '#a7adb0' },
  rodape: '#2f3538',
  paredes: QUATRO,
  hemi: { ceu: '#d3e8ea', chao: '#1f2629', forca: 0.4 },
  luzes: [
    { tipo: 'ponto', cor: '#e9fff4', forca: 5.5, pos: [-0.6, 2.38, -1.3], alcance: 8, sombra: true },
    { tipo: 'ponto', cor: '#e9fff4', forca: 4, pos: [-0.6, 2.38, 1.2], alcance: 8, tremer: true },
    { tipo: 'ponto', cor: '#5aa8ff', forca: 0.9, pos: [1.9, 1.3, 0.8], alcance: 2.6 },
  ],
  luminarias: [
    { arq: 'mounted_fluorescent_lights', pos: [-0.6, 2.56, -1.3], largura: 1.25 },
    { arq: 'mounted_fluorescent_lights', pos: [-0.6, 2.56, 1.2], largura: 1.25 },
  ],
  mesa: MESA_METAL,
  moveis: [
    { arq: 'worn_metal_rack', pos: [2.62, -1.4], giro: -PI / 2, altura: 1.9, almox: true },
    { arq: 'cardboard_box_01', pos: [2.62, 1.12, -1.25], giro: -0.3, altura: 0.25, detalhe: true },
    { arq: 'power_box_01', pos: [-1.5, 1.35, -2.82], altura: 0.55 },
    { arq: 'korean_fire_extinguisher_01', pos: [-0.7, 2.86], giro: PI, altura: 0.6 },
    { arq: 'plastic_monobloc_chair_01', pos: [-1.7, -0.6], giro: -PI / 2, altura: 0.82 },
    { arq: 'security_camera_01', pos: [-2.75, 2.25, 2.75], altura: 0.18, giro: -PI * 0.25 },
    { arq: 'modular_airduct_rectangular_01', parte: 'modular_airduct_rectangular_01_single_01', pos: [1.7, 2.18, 1.5], giro: PI / 2, largura: 1.0 },
    { arq: 'modular_airduct_rectangular_01', parte: 'modular_airduct_rectangular_01_single_01', pos: [1.7, 2.18, 0.5], giro: PI / 2, largura: 1.0 },
    { arq: 'modular_airduct_rectangular_01', parte: 'modular_airduct_rectangular_01_vent_01', pos: [1.7, 2.18, -0.5], giro: PI / 2, largura: 1.0, detalhe: true },
  ],
  obstaculos: [ALMOX, [2.18, 3, -0.15, 1.75], [1.2, 2.25, 2.15, 3]],
  extras: [
    { tipo: 'racks', lista: [0.2, 0.8, 1.4].map((z) => ({ x: 2.6, z, giro: -PI / 2 })) },
    { tipo: 'ar-precisao', x: 1.72, z: 2.6, giro: PI },
    { tipo: 'calha', x: 0.6, z: -1.2, y: 2.4, comprimento: 3.4, eixo: 'z', cor: '#6b737c' },
  ],
};

/* ---------- Ato 6: o estádio no dia da final ---------- */

const estadio: Lugar = {
  nome: 'o estádio no dia da final',
  fundo: '#05070c',
  exposicao: 1.1,
  ambiente: 0.25,
  alt: 2.7,
  piso: { tex: 'dirty_carpet', m: 1.5, tinta: '#5d6474' },
  parede: { tex: 'plastered_wall_02', m: 2, tinta: '#8a919c' },
  teto: { tex: 'grey_plaster', m: 2, tinta: '#5f656d' },
  rodape: '#22262c',
  paredes: [{ lado: 'fundo' }, { lado: 'esq' }, { lado: 'dir' }, { lado: 'frente', vaos: [{ c: 0.3, larg: 5.2, base: 0.95, topo: 2.45 }] }],
  hemi: { ceu: '#9fb6d8', chao: '#1b1d22', forca: 0.32 },
  luzes: [
    { tipo: 'ponto', cor: '#ffd9a8', forca: 3.2, pos: [-0.4, 2.08, -1.4], alcance: 7, sombra: true },
    { tipo: 'ponto', cor: '#ffd9a8', forca: 2, pos: [1.5, 2.08, 0.6], alcance: 6 },
    // clarão dos refletores do estádio entrando pela janela
    { tipo: 'ponto', cor: '#e6f1ff', forca: 4, pos: [0.3, 2.3, 3.8], alcance: 7 },
  ],
  luminarias: [
    { arq: 'modern_ceiling_lamp_01', pos: [-0.4, 2.15, -1.4], altura: 0.55, detalhe: true },
    { arq: 'modern_ceiling_lamp_01', pos: [1.5, 2.15, 0.6], altura: 0.55, detalhe: true },
  ],
  mesa: MESA_METAL,
  moveis: [
    { arq: 'drawer_cabinet', pos: [2.72, -1.4], giro: -PI / 2, altura: 1.7, almox: true },
    { arq: 'metal_office_desk', pos: [-0.66, 2.55], giro: PI, altura: 0.76 },
    { arq: 'metal_office_desk', pos: [1.32, 2.55], giro: PI, altura: 0.76 },
    { arq: 'modern_arm_chair_01', pos: [-0.7, 1.75], giro: PI, altura: 1.0 },
    { arq: 'modern_arm_chair_01', pos: [1.3, 1.7], giro: PI * 0.92, altura: 1.0 },
    { arq: 'office_notepads', pos: [0.6, 0.76, 2.4], giro: 0.1, largura: 0.45, detalhe: true },
    { arq: 'clipboard', pos: [-1.5, 0.76, 2.35], giro: -0.4, largura: 0.28, detalhe: true },
    { arq: 'television_02', pos: [-1.2, 1.9, -2.9], altura: 0.5 },
    { arq: 'wall_clock', pos: [-0.3, 2.2, -2.97], altura: 0.3 },
    { arq: 'korean_fire_extinguisher_01', pos: [1.6, -2.85], altura: 0.6 },
    { arq: 'GreenChair_01', pos: [-1.7, -0.6], giro: -PI / 2, altura: 0.95 },
  ],
  obstaculos: [ALMOX, [-1.65, 2.32, 2.05, 3]],
  extras: [
    { tipo: 'estadio' },
    {
      tipo: 'monitores',
      lista: [
        { x: -1.15, y: 0.76, z: 2.78, giro: PI, tela: 'campo' },
        { x: -0.25, y: 0.76, z: 2.78, giro: PI, tela: 'placar' },
        { x: 0.85, y: 0.76, z: 2.78, giro: PI, tela: 'grafico' },
        { x: 1.75, y: 0.76, z: 2.78, giro: PI, tela: 'campo' },
      ],
    },
  ],
};

/* ---------- Ato 7: o centro de operações, à noite ---------- */

const soc: Lugar = {
  nome: 'o centro de operações, à noite',
  fundo: '#04060b',
  exposicao: 1.2,
  ambiente: 0.16,
  alt: 3.0,
  piso: { tex: 'dirty_carpet', m: 1.5, tinta: '#3c4658' },
  parede: { tex: 'grey_plaster', m: 2, tinta: '#3a4555' },
  teto: { tex: 'smooth_concrete_floor', m: 3, tinta: '#2a313b' },
  rodape: '#141820',
  paredes: QUATRO,
  hemi: { ceu: '#3a5a9a', chao: '#0a0d14', forca: 0.42 },
  luzes: [
    { tipo: 'foco', cor: '#8fb0ff', forca: 14, pos: [0.1, 2.4, 1.45], alvo: [0.1, 0, 1.45], angulo: 0.85, alcance: 6, sombra: true },
    { tipo: 'ponto', cor: '#9bb8ff', forca: 3.6, pos: [0.3, 2.7, -1.6], alcance: 6.5 },
    { tipo: 'ponto', cor: '#4d8dff', forca: 3, pos: [0.1, 1.8, 2.3], alcance: 6 },
    { tipo: 'ponto', cor: '#7fa0d8', forca: 1.2, pos: [-2.2, 2.4, 0.2], alcance: 4 },
  ],
  luminarias: [{ arq: 'modern_ceiling_lamp_01', pos: [0.1, 2.45, 1.45], altura: 0.55, detalhe: true }],
  mesa: MESA_METAL,
  moveis: [
    { arq: 'drawer_cabinet', pos: [2.72, -1.4], giro: -PI / 2, altura: 1.7, almox: true },
    { arq: 'metal_office_desk', pos: [-0.9, 1.45], giro: PI, altura: 0.76 },
    { arq: 'metal_office_desk', pos: [1.1, 1.45], giro: PI, altura: 0.76 },
    { arq: 'modern_arm_chair_01', pos: [-0.9, 0.65], giro: PI, altura: 1.0 },
    { arq: 'modern_arm_chair_01', pos: [1.1, 0.6], giro: PI * 1.08, altura: 1.0 },
    { arq: 'desk_lamp_arm_01', pos: [-1.75, 0.76, 1.3], giro: PI * 0.8, altura: 0.45, detalhe: true },
    { arq: 'office_notepads', pos: [0.15, 0.76, 1.3], giro: 0.2, largura: 0.4, detalhe: true },
    { arq: 'potted_plant_02', pos: [-1.7, -2.6], altura: 0.85, detalhe: true },
    { arq: 'wall_clock', pos: [-0.6, 2.25, -2.97], altura: 0.3 },
    { arq: 'security_camera_01', pos: [2.75, 2.65, -2.75], altura: 0.18, giro: PI * 0.75 },
    { arq: 'korean_fire_extinguisher_01', pos: [1.6, -2.85], altura: 0.6 },
    { arq: 'plastic_monobloc_chair_01', pos: [-1.95, -0.6], giro: -PI / 2, altura: 0.82, detalhe: true },
  ],
  obstaculos: [ALMOX, [-1.9, 2.1, 0.95, 1.95], [-2.1, -1.3, -3, -2.2]],
  inicio: [0.2, 0.4, 0.25],
  extras: [
    { tipo: 'teloes', z: 2.97, x: 0.1, y: 1.85 },
    {
      tipo: 'monitores',
      lista: [
        { x: -1.35, y: 0.76, z: 1.7, giro: PI, tela: 'alertas' },
        { x: -0.45, y: 0.76, z: 1.7, giro: PI, tela: 'grafico' },
        { x: 0.65, y: 0.76, z: 1.7, giro: PI, tela: 'terminal' },
        { x: 1.55, y: 0.76, z: 1.7, giro: PI, tela: 'mapa' },
      ],
    },
  ],
};

/** Um lugar por ato, na ordem dos ATOS de src/conteudo/tipos.ts. */
export const LUGARES: Lugar[] = [galpao, rua, central, escola, datacenter, servidores, estadio, soc];

export function lugarDoAto(ato: number): Lugar {
  return LUGARES[Math.max(0, Math.min(LUGARES.length - 1, ato | 0))]!;
}
