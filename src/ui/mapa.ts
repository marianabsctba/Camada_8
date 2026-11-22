// Mapa de Fim de Linha à noite: cada dia resolvido acende um pedaço da cidade.

import { CURRICULO, type EntradaCurriculo } from '../conteudo/curriculo';

interface Marco {
  x: number;
  y: number;
  tipo: 'casa' | 'predio' | 'galpao' | 'torre' | 'publico' | 'industria' | 'bairro' | 'especial';
  nome: string;
  w?: number;
  h?: number;
}

/** Lugares da cidade, num desenho de 1000 x 620. */
const MARCOS: Record<string, Marco> = {
  galpao: { x: 470, y: 330, tipo: 'galpao', nome: 'galpão da Fibra Fim de Linha', w: 46, h: 26 },
  prefeitura: { x: 560, y: 250, tipo: 'publico', nome: 'prefeitura', w: 40, h: 30 },
  camara: { x: 615, y: 255, tipo: 'publico', nome: 'câmara', w: 26, h: 22 },
  biblioteca: { x: 520, y: 205, tipo: 'publico', nome: 'biblioteca', w: 28, h: 20 },
  escola: { x: 395, y: 245, tipo: 'publico', nome: 'escola municipal', w: 44, h: 26 },
  hospital: { x: 650, y: 330, tipo: 'publico', nome: 'hospital', w: 40, h: 34 },
  'posto-saude': { x: 700, y: 400, tipo: 'publico', nome: 'posto de saúde', w: 24, h: 18 },
  laboratorio: { x: 700, y: 290, tipo: 'publico', nome: 'laboratório', w: 24, h: 18 },
  cooperativa: { x: 300, y: 420, tipo: 'industria', nome: 'cooperativa', w: 50, h: 28 },
  padaria: { x: 545, y: 400, tipo: 'casa', nome: 'padaria', w: 20, h: 16 },
  cafe: { x: 590, y: 405, tipo: 'casa', nome: 'café da praça', w: 18, h: 14 },
  academia: { x: 630, y: 445, tipo: 'casa', nome: 'academia', w: 22, h: 16 },
  praca: { x: 575, y: 360, tipo: 'especial', nome: 'praça', w: 44, h: 26 },
  predio: { x: 610, y: 175, tipo: 'predio', nome: 'prédio do centro', w: 26, h: 52 },
  condominio: { x: 760, y: 200, tipo: 'predio', nome: 'condomínio', w: 50, h: 44 },
  central: { x: 440, y: 400, tipo: 'publico', nome: 'central telefônica antiga', w: 40, h: 28 },
  datacenter: { x: 480, y: 470, tipo: 'industria', nome: 'data center municipal', w: 56, h: 30 },
  'estacao-agua': { x: 200, y: 300, tipo: 'industria', nome: 'estação de água', w: 34, h: 22 },
  represa: { x: 110, y: 170, tipo: 'especial', nome: 'represa', w: 70, h: 30 },
  morro: { x: 860, y: 110, tipo: 'torre', nome: 'rádio do Morro Alto', w: 10, h: 44 },
  sitio: { x: 900, y: 175, tipo: 'casa', nome: 'sítio do Morro Alto', w: 20, h: 14 },
  serra: { x: 940, y: 90, tipo: 'torre', nome: 'rádio da serra', w: 10, h: 40 },
  fazenda: { x: 900, y: 520, tipo: 'casa', nome: 'fazenda Fim do Mundo', w: 34, h: 18 },
  distrito: { x: 120, y: 520, tipo: 'publico', nome: 'distrito e escola rural', w: 36, h: 20 },
  'torre-celular': { x: 345, y: 160, tipo: 'torre', nome: 'torre de celular', w: 10, h: 54 },
  estadio: { x: 760, y: 470, tipo: 'especial', nome: 'estádio', w: 80, h: 50 },
  'cidade-vizinha': { x: 60, y: 600, tipo: 'especial', nome: 'cidade vizinha (estrada)', w: 40, h: 14 },
  'bairro-norte': { x: 470, y: 120, tipo: 'bairro', nome: 'bairro Norte', w: 120, h: 50 },
  'bairro-sul': { x: 330, y: 540, tipo: 'bairro', nome: 'bairro Sul', w: 130, h: 46 },
  'bairro-leste': { x: 820, y: 330, tipo: 'bairro', nome: 'bairro Leste', w: 90, h: 70 },
  anel: { x: 540, y: 300, tipo: 'especial', nome: 'anel de fibra', w: 0, h: 0 },
  ix: { x: 480, y: 540, tipo: 'especial', nome: 'ponto de troca de tráfego', w: 30, h: 20 },
};

const CASAS: [number, number][] = Array.from({ length: 12 }, (_, i) => [250 + (i % 6) * 34, i < 6 ? 470 : 500]);

const APELIDOS: Record<string, string> = {
  'placa-galpao': 'galpao',
  'rack-galpao': 'galpao',
  'roteador-galpao': 'galpao',
  'servidor-galpao': 'galpao',
  caminhonete: 'galpao',
  estrada: 'cidade-vizinha',
  'saida-mundo': 'cidade-vizinha',
  'poste-1': 'galpao',
  avenida: 'praca',
  'predio-vizinho': 'predio',
  'tronco-fibra': 'central',
  'torre-5g': 'torre-celular',
  'rua-acacias': 'casa-12',
  'prefeitura-andar': 'prefeitura',
  'prefeitura-telefone': 'prefeitura',
  'prefeitura-fibra': 'prefeitura',
  'site-prefeitura': 'prefeitura',
  'escola-distrito': 'distrito',
  'central-sala': 'central',
  'central-modem': 'central',
  correio: 'central',
  'escola-lab': 'escola',
  'escola-v6': 'escola',
  'biblioteca-wifi': 'biblioteca',
  'regiao-centro': 'datacenter',
  'radio-cidade': 'torre-celular',
  'radio-web': 'torre-celular',
  servidores: 'datacenter',
  dns: 'datacenter',
  soc: 'datacenter',
  'hospital-video': 'hospital',
  'fazenda-video': 'fazenda',
  'bairros-todos': 'bairro-norte',
};

/** Para qual lugar do mapa aponta um id de luz. */
export function lugarDaLuz(id: string): string {
  if (/^casa-\d+$/.test(id)) return id;
  const base = id.replace(/-\d+$/, '');
  if (MARCOS[id]) return id;
  if (APELIDOS[id]) return APELIDOS[id]!;
  if (MARCOS[base]) return base;
  if (APELIDOS[base]) return APELIDOS[base]!;
  if (base.startsWith('anel')) return 'anel';
  return 'galpao';
}

function posicao(lugar: string): [number, number] {
  const m = /^casa-(\d+)$/.exec(lugar);
  if (m) return CASAS[Number(m[1]) - 1] ?? [300, 480];
  const k = MARCOS[lugar];
  return k ? [k.x, k.y] : [470, 330];
}

const NS = 'http://www.w3.org/2000/svg';
function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, ...filhos: SVGElement[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...filhos);
  return e;
}

export interface OpcoesMapa {
  feitos: number[];
  /** Dia que acabou de ser resolvido, para animar a luz nova. */
  recente?: number;
  proximo?: EntradaCurriculo;
  aoEscolher: (e: EntradaCurriculo) => void;
}

export function desenharMapa(o: OpcoesMapa): SVGSVGElement {
  const feitos = new Set(o.feitos);
  const brilho = new Map<string, number>();
  const recentes = new Set<string>();
  for (const e of CURRICULO) {
    if (!feitos.has(e.numero)) continue;
    for (const l of e.luz) {
      const lugar = lugarDaLuz(l);
      brilho.set(lugar, (brilho.get(lugar) ?? 0) + 1);
      if (e.numero === o.recente) recentes.add(lugar);
    }
  }
  if (feitos.size >= CURRICULO.length) brilho.set('ix', 3);

  const svg = s('svg', { viewBox: '0 0 1000 620', class: 'mapa-svg', role: 'img', 'aria-label': 'Mapa de Fim de Linha' });
  const defs = s('defs', {});
  defs.innerHTML = `
    <radialGradient id="halo"><stop offset="0" stop-color="#ffcf6b" stop-opacity="0.55"/><stop offset="1" stop-color="#ffcf6b" stop-opacity="0"/></radialGradient>
    <pattern id="janelas" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="3" x="1.5" y="1.5" fill="#ffd27a"/></pattern>
    <pattern id="janelas-apagadas" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="3" x="1.5" y="1.5" fill="#1d2833"/></pattern>`;
  svg.append(defs);
  // terreno, rio e estradas
  svg.append(s('rect', { width: 1000, height: 620, fill: '#0a0f15' }));
  svg.append(s('path', { d: 'M0,230 C120,260 160,190 260,215 S420,300 520,280 S760,250 1000,300', stroke: '#0f2a3d', 'stroke-width': 26, fill: 'none', opacity: 0.9 }));
  svg.append(s('path', { d: 'M40,615 L180,430 L470,330 L700,330 L1000,560', stroke: '#1a222c', 'stroke-width': 9, fill: 'none' }));
  svg.append(s('path', { d: 'M470,330 L470,100 M470,330 L330,560 M470,330 L860,200 M200,300 L470,330', stroke: '#161d26', 'stroke-width': 6, fill: 'none' }));
  svg.append(s('path', { d: 'M240,485 L460,485', stroke: '#161d26', 'stroke-width': 5, fill: 'none' }));
  svg.append(s('text', { x: 262, y: 528, fill: '#2b3744', 'font-size': 11, 'font-family': 'Fira Code, monospace' }, ...([] as SVGElement[])));
  (svg.lastChild as SVGTextElement).textContent = 'Rua das Acácias';
  // anel de fibra (aparece quando o ato 4 começa a acender)
  if (brilho.get('anel')) svg.append(s('ellipse', { cx: 540, cy: 320, rx: 260, ry: 170, stroke: '#3ddc84', 'stroke-width': 2, fill: 'none', 'stroke-dasharray': '6 6', opacity: Math.min(1, 0.3 + (brilho.get('anel') ?? 0) * 0.15) }));

  const desenharLugar = (id: string, x: number, y: number, m: Partial<Marco>) => {
    const luz = brilho.get(id) ?? 0;
    const g = s('g', { class: `lugar${luz ? ' aceso' : ''}${recentes.has(id) ? ' recente' : ''}` });
    const w = m.w ?? 16;
    const h = m.h ?? 12;
    if (luz) g.append(s('circle', { cx: x, cy: y, r: Math.max(w, h) * (1 + Math.min(luz, 4) * 0.25), fill: 'url(#halo)' }));
    if (m.tipo === 'torre') {
      g.append(s('path', { d: `M${x - 6},${y + h / 2} L${x},${y - h / 2} L${x + 6},${y + h / 2}`, stroke: luz ? '#c9d3dc' : '#2a3540', 'stroke-width': 2, fill: 'none' }));
      g.append(s('circle', { cx: x, cy: y - h / 2, r: 3, fill: luz ? '#ff5d5d' : '#2a3540', class: luz ? 'pisca' : '' }));
    } else if (m.tipo === 'bairro') {
      for (let i = 0; i < 10; i++) {
        const bx = x - w / 2 + (i % 5) * (w / 5) + 4;
        const by = y - h / 2 + Math.floor(i / 5) * (h / 2) + 4;
        g.append(s('rect', { x: bx, y: by, width: w / 5 - 8, height: h / 2 - 8, fill: i < luz * 3 ? 'url(#janelas)' : 'url(#janelas-apagadas)', stroke: '#26313c' }));
      }
    } else if (m.tipo === 'especial' && id === 'praca') {
      g.append(s('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 6, fill: luz ? '#123322' : '#101820', stroke: '#26313c' }));
    } else if (id === 'represa') {
      g.append(s('path', { d: `M${x - w / 2},${y} L${x + w / 2},${y}`, stroke: luz ? '#8aa' : '#2a3540', 'stroke-width': 6 }));
    } else {
      g.append(s('rect', { x: x - w / 2, y: y - h / 2, width: w, height: h, fill: luz ? 'url(#janelas)' : 'url(#janelas-apagadas)', stroke: luz ? '#806a3a' : '#26313c', 'stroke-width': 1.5 }));
    }
    const t = s('title', {});
    t.textContent = (m.nome ?? id) + (luz ? ' (conectado)' : ' (sem internet)');
    g.append(t);
    svg.append(g);
  };
  for (const [id, m] of Object.entries(MARCOS)) if (id !== 'anel') desenharLugar(id, m.x, m.y, m);
  CASAS.forEach(([x, y], i) => desenharLugar(`casa-${i + 1}`, x, y, { tipo: 'casa', nome: `casa ${i + 1} da Rua das Acácias`, w: 18, h: 14 }));

  // marcador do próximo dia
  if (o.proximo) {
    const [x, y] = posicao(lugarDaLuz(o.proximo.luz[0] ?? 'galpao'));
    const alvo = s('g', { class: 'marcador', tabindex: 0, role: 'button', 'aria-label': `Dia ${o.proximo.numero}: ${o.proximo.titulo}` });
    alvo.append(s('circle', { cx: x, cy: y, r: 22, class: 'marcador-pulso' }), s('circle', { cx: x, cy: y, r: 9, fill: '#ff7a1a', stroke: '#0a0f15', 'stroke-width': 3 }));
    const rot = s('text', { x, y: y - 30, 'text-anchor': 'middle', class: 'marcador-texto' });
    rot.textContent = `Dia ${o.proximo.numero}: ${o.proximo.titulo}`;
    alvo.append(rot);
    alvo.addEventListener('click', () => o.aoEscolher(o.proximo!));
    alvo.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') o.aoEscolher(o.proximo!);
    });
    svg.append(alvo);
  }
  return svg;
}

export function contarConectados(feitos: number[]): { lugares: number; casas: number } {
  const acesos = new Set<string>();
  for (const e of CURRICULO) if (feitos.includes(e.numero)) for (const l of e.luz) acesos.add(lugarDaLuz(l));
  return { lugares: acesos.size, casas: [...acesos].filter((x) => x.startsWith('casa-')).length };
}

export function nomeDoLugar(id: string): string {
  const m = /^casa-(\d+)$/.exec(id);
  if (m) return `a casa ${m[1]} da Rua das Acácias`;
  return MARCOS[id]?.nome ?? id;
}
