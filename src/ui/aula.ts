// A aula antes da prática: cartões curtos, cada um com um visual que se mexe ou responde.

import type { Aula, Visual } from '../conteudo/tipos';
import { T568A, T568B } from '../motor/fisico';
import { tocar } from '../som/som';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...filhos: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...filhos);
  return e;
}

const fmt = (n: number, c = 1) => (Number.isFinite(n) ? n.toFixed(c).replace('.', ',') : '∞');
const COR: Record<string, string> = { laranja: '#ff7a1a', verde: '#2fbf71', azul: '#3b7dff', marrom: '#8a5a3b' };

function fio(cor: string) {
  const base = cor.replace('branco-', '');
  const f = el('span', { class: 'fio grande', title: cor });
  f.style.background = cor.startsWith('branco-') ? `repeating-linear-gradient(135deg, #f2f2ee 0 6px, ${COR[base]} 6px 9px)` : COR[base]!;
  return f;
}

/** Marca o que foi inserido em "depois" em relação a "antes" (maior subsequência comum). */
function inseridos(antes: string, depois: string): boolean[] {
  const a = antes;
  const b = depois;
  const t: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) t[i]![j] = a[i] === b[j] ? t[i + 1]![j + 1]! + 1 : Math.max(t[i + 1]![j]!, t[i]![j + 1]!);
  const marca = Array(b.length).fill(true);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      marca[j] = false;
      i++;
      j++;
    } else if (t[i + 1]![j]! >= t[i]![j + 1]!) i++;
    else j++;
  }
  return marca;
}

interface Controle {
  rotulo: string;
  min: number;
  max: number;
  passo: number;
  valor: number;
  unidade: string;
}

function calculadora(controles: Controle[], calcular: (v: number[]) => string[]): HTMLElement {
  const valores = controles.map((c) => c.valor);
  const saida = el('div', { class: 'calc-saida' });
  const atualizar = () => saida.replaceChildren(...calcular(valores).map((l, i) => el(i === 0 ? 'strong' : 'div', {}, l)));
  const linhas = controles.map((c, i) => {
    const v = el('span', { class: 'calc-valor' }, `${c.valor} ${c.unidade}`);
    const r = el('input', { type: 'range', min: String(c.min), max: String(c.max), step: String(c.passo), value: String(c.valor), 'aria-label': c.rotulo });
    r.addEventListener('input', () => {
      valores[i] = Number(r.value);
      v.textContent = `${fmt(valores[i]!, c.passo < 1 ? 1 : 0)} ${c.unidade}`;
      atualizar();
    });
    return el('label', { class: 'calc-linha' }, el('span', {}, c.rotulo), r, v);
  });
  atualizar();
  return el('div', { class: 'calc' }, ...linhas, saida);
}

const NS = 'http://www.w3.org/2000/svg';
function svg(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function desenharVisual(v: Visual, limpar: (() => void)[]): HTMLElement {
  switch (v.tipo) {
    case 'conector': {
      const linha = (nome: string, cores: string[], outro?: string[]) =>
        el('div', { class: 'conector-linha' }, el('span', { class: 'conector-nome' }, nome), ...cores.map((c, i) => el('div', { class: `pino-aula${outro && outro[i] !== c ? ' difere' : ''}` }, fio(c), el('small', {}, String(i + 1)))));
      const blocos = v.padrao === 'ambos' ? [linha('T568A', T568A, T568B), linha('T568B', T568B, T568A)] : [linha(v.padrao, v.padrao === 'T568A' ? T568A : T568B)];
      return el('div', { class: 'visual conector-aula' }, ...blocos, el('p', { class: 'legenda' }, v.padrao === 'ambos' ? 'Em destaque, os pinos que mudam de um padrão para o outro: 1, 2, 3 e 6.' : 'Conector visto de frente, trava para baixo, pino 1 à esquerda.'));
    }
    case 'camadas': {
      const pilha = el('div', { class: 'visual camadas-aula' });
      v.camadas.forEach((c, i) => {
        const caixa = el('div', { class: 'camada-caixa' }, c);
        caixa.style.animationDelay = `${i * 0.6}s`;
        caixa.style.marginLeft = caixa.style.marginRight = `${(v.camadas.length - 1 - i) * 14}px`;
        pilha.append(caixa);
      });
      if (v.rotulo) pilha.append(el('p', { class: 'legenda' }, v.rotulo));
      return pilha;
    }
    case 'bits': {
      const marca = inseridos(v.antes, v.depois);
      const depois = el('div', { class: 'bits-linha' }, ...[...v.depois].map((ch, i) => el('span', { class: marca[i] && ch.trim() ? 'novo' : '' }, ch)));
      return el('div', { class: 'visual bits-aula' }, el('div', { class: 'rotulo-campo' }, 'antes'), el('div', { class: 'bits-linha' }, v.antes), el('div', { class: 'rotulo-campo' }, 'depois (em laranja, o que entrou)'), depois, ...(v.legenda ? [el('p', { class: 'legenda' }, v.legenda)] : []));
    }
    case 'janela': {
      const fila = el('div', { class: 'janela-fila' });
      const caixas = Array.from({ length: v.total }, (_, i) => el('div', { class: 'quadro-aula' }, String(i)));
      fila.append(...caixas);
      let base = 0;
      let perdeu = false;
      const passo = () => {
        caixas.forEach((c, i) => {
          c.className = 'quadro-aula' + (i < base ? ' confirmado' : i < base + v.janela ? ' voando' : '');
          if (v.perdido !== undefined && i === v.perdido && !perdeu && i >= base && i < base + v.janela) c.classList.add('perdido');
        });
        if (v.perdido !== undefined && base === v.perdido && !perdeu) {
          perdeu = true;
          return;
        }
        base = base >= v.total ? 0 : base + 1;
        if (base === 0) perdeu = false;
      };
      passo();
      const id = setInterval(passo, 900);
      limpar.push(() => clearInterval(id));
      return el('div', { class: 'visual janela-aula' }, fila, el('p', { class: 'legenda' }, `Janela de ${v.janela}: em laranja, quadros a caminho sem ACK; em verde, confirmados.${v.perdido !== undefined ? ' Em vermelho, o que se perdeu.' : ''}`));
    }
    case 'calculadora':
      return el('div', { class: 'visual' }, calcVisual(v.formula));
    case 'tabela':
      return el('div', { class: 'visual tabela-aula' }, el('table', {}, el('thead', {}, el('tr', {}, ...v.cabecalho.map((c) => el('th', {}, c)))), el('tbody', {}, ...v.linhas.map((l) => el('tr', {}, ...l.map((c) => el('td', {}, c)))))));
    case 'diagrama': {
      const caixa = el('div', { class: 'visual diagrama-aula' });
      const s = svg('svg', { viewBox: '0 0 600 240', class: 'diagrama-svg' }) as SVGSVGElement;
      const pos = new Map(v.nos.map((n) => [n.id, n]));
      for (const [a, b, rot] of v.ligacoes) {
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (!pa || !pb) continue;
        s.append(svg('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: 'diag-linha' }));
        if (rot) {
          const t = svg('text', { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 6, class: 'diag-rot', 'text-anchor': 'middle' });
          t.textContent = rot;
          s.append(t);
        }
      }
      for (const n of v.nos) {
        s.append(svg('rect', { x: n.x - 52, y: n.y - 16, width: 104, height: 32, rx: 4, class: 'diag-no' }));
        const t = svg('text', { x: n.x, y: n.y + 5, class: 'diag-texto', 'text-anchor': 'middle' });
        t.textContent = n.rotulo;
        s.append(t);
      }
      caixa.append(s);
      return caixa;
    }
    case 'espectro': {
      const s = svg('svg', { viewBox: '0 0 600 200', class: 'diagrama-svg' }) as SVGSVGElement;
      const x = (c: number) => 30 + (c - 1) * 42;
      for (let c = 1; c <= 13; c++) {
        const t = svg('text', { x: x(c), y: 192, class: 'diag-rot', 'text-anchor': 'middle' });
        t.textContent = String(c);
        s.append(t);
      }
      for (const c of v.canais) {
        const alt = Math.max(10, 160 + (c.dbm + 40) * 2);
        const meia = (22 / 5) * 42 * 0.5;
        s.append(svg('path', { d: `M${x(c.canal) - meia},175 Q${x(c.canal)},${175 - alt * 1.6} ${x(c.canal) + meia},175`, class: 'espectro-curva' }));
        const t = svg('text', { x: x(c.canal), y: 172 - alt * 0.8, class: 'diag-rot', 'text-anchor': 'middle' });
        t.textContent = c.rotulo;
        s.append(t);
      }
      return el('div', { class: 'visual' }, s, el('p', { class: 'legenda' }, 'Cada transmissão ocupa uns 22 MHz, mais de quatro canais de 5 MHz.'));
    }
    case 'sinal': {
      const s = svg('svg', { viewBox: '0 0 600 160', class: 'diagrama-svg' }) as SVGSVGElement;
      const p = svg('path', { class: 'sinal-curva', d: '' });
      s.append(svg('path', { d: 'M0,80 L600,80', class: 'diag-linha' }), p);
      const rot = el('span', { class: 'calc-valor' });
      const r = el('input', { type: 'range', min: '1', max: '15', step: '1', value: String(v.harmonicos), 'aria-label': 'Harmônicos' });
      const desenhar = () => {
        const n = Number(r.value);
        rot.textContent = `${n} harmônico${n > 1 ? 's' : ''}`;
        let d = '';
        for (let px = 0; px <= 600; px += 2) {
          const t = (px / 600) * 4 * Math.PI;
          let y = 0;
          for (let k = 0; k < n; k++) y += Math.sin((2 * k + 1) * t) / (2 * k + 1);
          d += `${px === 0 ? 'M' : 'L'}${px},${80 - y * 70}`;
        }
        p.setAttribute('d', d);
      };
      r.addEventListener('input', desenhar);
      desenhar();
      return el('div', { class: 'visual' }, s, el('label', { class: 'calc-linha' }, el('span', {}, 'Banda (harmônicos que passam)'), r, rot), el('p', { class: 'legenda' }, 'Uma onda quadrada é a soma de senoides. Com pouca banda, só as primeiras passam e o sinal chega arredondado.'));
    }
  }
}

function calcVisual(f: Extract<Visual, { tipo: 'calculadora' }>['formula']): HTMLElement {
  switch (f) {
    case 'shannon':
      return calculadora(
        [
          { rotulo: 'Banda', min: 300, max: 20000, passo: 100, valor: 3100, unidade: 'Hz' },
          { rotulo: 'Relação sinal-ruído', min: 0, max: 60, passo: 1, valor: 30, unidade: 'dB' },
        ],
        ([b, snr]) => {
          const lin = 10 ** (snr! / 10);
          const c = b! * Math.log2(1 + lin);
          return [`Capacidade de Shannon: ${fmt(c / 1000, 1)} kb/s`, `S/N linear = 10^(${snr} ÷ 10) = ${fmt(lin, 0)}`, `C = ${b} × log₂(1 + ${fmt(lin, 0)})`];
        },
      );
    case 'nyquist':
      return calculadora(
        [
          { rotulo: 'Banda', min: 300, max: 20000, passo: 100, valor: 3100, unidade: 'Hz' },
          { rotulo: 'Níveis do sinal', min: 2, max: 256, passo: 2, valor: 4, unidade: '' },
        ],
        ([b, m]) => [`Taxa máxima sem ruído: ${fmt((2 * b! * Math.log2(m!)) / 1000, 1)} kb/s`, `2 × ${b} Hz × log₂(${m}) = ${fmt(2 * b!, 0)} símbolos/s × ${fmt(Math.log2(m!), 2)} bits`],
      );
    case 'fspl':
      return calculadora(
        [
          { rotulo: 'Distância', min: 0.1, max: 50, passo: 0.1, valor: 8, unidade: 'km' },
          { rotulo: 'Frequência', min: 0.9, max: 60, passo: 0.1, valor: 5.8, unidade: 'GHz' },
        ],
        ([d, g]) => [`Perda no espaço livre: ${fmt(32.44 + 20 * Math.log10(d!) + 20 * Math.log10(g! * 1000), 1)} dB`, 'Dobrar a distância custa 6 dB. Dobrar a frequência também.'],
      );
    case 'fresnel':
      return calculadora(
        [
          { rotulo: 'Distância', min: 0.1, max: 50, passo: 0.1, valor: 8, unidade: 'km' },
          { rotulo: 'Frequência', min: 0.9, max: 60, passo: 0.1, valor: 5.8, unidade: 'GHz' },
        ],
        ([d, g]) => {
          const r = 8.657 * Math.sqrt(d! / g!);
          return [`Raio da 1ª zona de Fresnel no meio: ${fmt(r, 1)} m`, `Deixe livres pelo menos 60 %: ${fmt(0.6 * r, 1)} m acima do obstáculo.`];
        },
      );
    case 'orcamento':
      return calculadora(
        [
          { rotulo: 'Potência do transmissor', min: -10, max: 5, passo: 0.5, valor: 1, unidade: 'dBm' },
          { rotulo: 'Distância', min: 1, max: 80, passo: 1, valor: 32, unidade: 'km' },
          { rotulo: 'Atenuação da fibra', min: 0.2, max: 0.4, passo: 0.01, valor: 0.22, unidade: 'dB/km' },
          { rotulo: 'Emendas (0,1 dB cada)', min: 0, max: 20, passo: 1, valor: 8, unidade: '' },
        ],
        ([tx, km, at, em]) => {
          const perda = km! * at! + 1 + em! * 0.1;
          const rx = tx! - perda;
          return [`Chega: ${fmt(rx, 1)} dBm`, `Perda: ${fmt(km! * at!, 2)} (fibra) + 1,00 (2 conectores) + ${fmt(em! * 0.1, 2)} (emendas) = ${fmt(perda, 2)} dB`, `Margem sobre um receptor de -23 dBm: ${fmt(rx + 23, 1)} dB`];
        },
      );
    case 'transmissao':
      return calculadora(
        [
          { rotulo: 'Tamanho do quadro', min: 64, max: 9000, passo: 64, valor: 1000, unidade: 'bytes' },
          { rotulo: 'Taxa', min: 1, max: 1000, passo: 1, valor: 1, unidade: 'Mb/s' },
          { rotulo: 'Propagação (um sentido)', min: 0, max: 300, passo: 1, valor: 270, unidade: 'ms' },
        ],
        ([b, t, p]) => {
          const tf = (b! * 8) / (t! * 1000);
          return [`Ida e volta: ${fmt(tf + 2 * p!, 1)} ms`, `Transmitir: ${fmt(tf, 2)} ms. Propagação: 2 × ${p} ms.`, `Pare e espere aproveita ${fmt((tf / (tf + 2 * p!)) * 100, 2)} % da linha.`];
        },
      );
    case 'unidades':
      return calculadora([{ rotulo: 'Plano contratado', min: 1, max: 1000, passo: 1, valor: 100, unidade: 'Mb/s' }], ([m]) => [`${fmt(m! / 8, 2)} MB/s no máximo`, `Com os cabeçalhos: uns ${fmt((m! * 0.949) / 8, 2)} MB/s úteis`, `${fmt((m! * 1e6) / 8 / 1048576, 2)} MiB/s no máximo`]);
    case 'janela':
      return calculadora(
        [
          { rotulo: 'Taxa', min: 0.1, max: 100, passo: 0.1, valor: 1, unidade: 'Mb/s' },
          { rotulo: 'Propagação', min: 1, max: 300, passo: 1, valor: 270, unidade: 'ms' },
          { rotulo: 'Quadro', min: 100, max: 9000, passo: 100, valor: 1000, unidade: 'bytes' },
        ],
        ([t, p, b]) => {
          const tf = (b! * 8) / (t! * 1000);
          return [`Janela que enche o cano: ${Math.ceil(1 + (2 * p!) / tf)} quadros`, `1 + 2 × ${p} ms ÷ ${fmt(tf, 2)} ms`];
        },
      );
    case 'atenuacao':
      return calculadora([{ rotulo: 'Comprimento do cabo', min: 10, max: 150, passo: 1, valor: 90, unidade: 'm' }], ([m]) => {
        const margem = 20 - Math.max(0, m! - 100);
        return [`Margem de sinal: ${fmt(margem, 0)} dB`, m! <= 100 ? 'Dentro do canal de 100 m: o sinal chega limpo.' : margem < 0 ? 'Abaixo do ruído: o enlace cai.' : 'Fora do padrão: erros começam a aparecer.'];
      });
  }
}

/** Abre a aula. Chama "terminar" quando a pessoa acerta a checagem e segue para a prática. */
export function abrirAula(raiz: HTMLElement, titulo: string, aula: Aula, terminar: () => void) {
  let i = 0;
  let limpar: (() => void)[] = [];
  const caixa = el('div', { class: 'aula' });
  raiz.append(caixa);
  const desenhar = () => {
    limpar.forEach((f) => f());
    limpar = [];
    const pontos = el('div', { class: 'barra-passos' }, ...[...aula.cartoes, null].map((_, k) => el('i', { class: k < i ? 'feito' : k === i ? 'atual' : '' })));
    if (i < aula.cartoes.length) {
      const c = aula.cartoes[i]!;
      const voltar = el('button', { class: 'botao fantasma' }, 'Voltar');
      voltar.toggleAttribute('disabled', i === 0);
      voltar.addEventListener('click', () => {
        i--;
        desenhar();
      });
      const seguir = el('button', { class: 'botao' }, 'Seguir');
      seguir.addEventListener('click', () => {
        i++;
        desenhar();
      });
      caixa.replaceChildren(el('div', { class: 'etiqueta' }, `Aula · ${titulo}`), pontos, el('h2', {}, c.titulo), ...c.texto.map((t) => el('p', {}, t)), ...(c.visual ? [desenharVisual(c.visual, limpar)] : []), el('div', { class: 'linha-botoes' }, voltar, seguir));
      queueMicrotask(() => seguir.focus());
      return;
    }
    const q = aula.checagem;
    const resposta = el('div', { class: 'checagem-resposta' });
    const opcoes = q.opcoes.map((o, k) => {
      const b = el('button', { class: 'opcao' }, o);
      b.addEventListener('click', () => {
        for (const x of opcoes) x.classList.remove('errada');
        tocar(k === q.certa ? 'certo' : 'errado');
        if (k === q.certa) {
          b.classList.add('certa');
          for (const x of opcoes) x.setAttribute('disabled', '');
          const ir = el('button', { class: 'botao' }, 'Ir para a prática');
          ir.addEventListener('click', () => {
            limpar.forEach((f) => f());
            caixa.remove();
            terminar();
          });
          resposta.replaceChildren(el('div', { class: 'certo' }, el('strong', {}, 'Isso. '), q.explicacao), ir);
          queueMicrotask(() => ir.focus());
        } else {
          b.classList.add('errada');
          resposta.replaceChildren(el('div', { class: 'errado' }, el('strong', {}, 'Ainda não. '), 'Releia o cartão anterior e tente outra.'));
        }
      });
      return b;
    });
    const voltar = el('button', { class: 'botao fantasma' }, 'Rever a aula');
    voltar.addEventListener('click', () => {
      i = 0;
      desenhar();
    });
    caixa.replaceChildren(el('div', { class: 'etiqueta' }, `Aula · ${titulo}`), pontos, el('h2', {}, 'Confere aí'), el('p', { class: 'checagem-pergunta' }, q.pergunta), el('div', { class: 'opcoes' }, ...opcoes), resposta, el('div', { class: 'linha-botoes' }, voltar));
  };
  desenhar();
}
