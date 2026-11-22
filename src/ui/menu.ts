// Menu de ações: lista do que dá para fazer com o alvo, formulário com ajuda e o resultado na hora.

import type { Acao, Campo } from '../motor/acoes';
import { padroes } from '../motor/acoes';
import { CORES } from '../motor/fisico';

export interface Feito {
  comando: string;
  prompt: string;
  saida: string[];
}

export interface OpcoesMenu {
  titulo: string;
  subtitulo?: string;
  acoes: () => Acao[];
  executar: (a: Acao, v: Record<string, string>) => Feito[];
  abrirConsole: (nome: string) => void;
  classe: (linha: string) => string;
  aoFechar: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...filhos: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...filhos);
  return e;
}

const COR_CSS: Record<string, string> = { laranja: '#ff7a1a', verde: '#2fbf71', azul: '#3b7dff', marrom: '#8a5a3b' };

function amostra(cor: string): HTMLElement {
  const base = cor.replace('branco-', '');
  const s = el('span', { class: 'fio' });
  s.style.background = cor.startsWith('branco-') ? `repeating-linear-gradient(135deg, #f2f2ee 0 6px, ${COR_CSS[base]} 6px 9px)` : COR_CSS[base]!;
  return s;
}

export function campoCores(c: Campo, valores: Record<string, string>, mudou: () => void): HTMLElement {
  const escolhidas: string[] = valores[c.nome] ? valores[c.nome]!.split(' ') : [];
  const slots = el('div', { class: 'pinos' });
  const paleta = el('div', { class: 'paleta' });
  const desenhar = () => {
    slots.replaceChildren(
      ...Array.from({ length: 8 }, (_, i) => {
        const cor = escolhidas[i];
        const pino = el('div', { class: `pino${cor ? '' : ' vazio'}` }, el('small', {}, String(i + 1)));
        if (cor) pino.prepend(amostra(cor));
        pino.title = cor ?? 'vazio';
        return pino;
      }),
    );
    for (const b of Array.from(paleta.querySelectorAll('button'))) (b as HTMLButtonElement).disabled = escolhidas.includes(b.dataset.cor!) || escolhidas.length >= 8;
    valores[c.nome] = escolhidas.length === 8 ? escolhidas.join(' ') : '';
    mudou();
  };
  for (const cor of CORES) {
    const b = el('button', { type: 'button', class: 'cor', 'data-cor': cor }, amostra(cor), cor);
    b.addEventListener('click', () => {
      escolhidas.push(cor);
      desenhar();
    });
    paleta.append(b);
  }
  const desfazer = el('button', { type: 'button', class: 'botao fantasma mini' }, 'Desfazer último');
  desfazer.addEventListener('click', () => {
    escolhidas.pop();
    desenhar();
  });
  const limpar = el('button', { type: 'button', class: 'botao fantasma mini' }, 'Limpar');
  limpar.addEventListener('click', () => {
    escolhidas.length = 0;
    desenhar();
  });
  const caixa = el('div', { class: 'crimpagem' }, el('div', { class: 'rotulo-campo' }, 'Conector visto de frente, trava para baixo: pino 1 à esquerda'), slots, el('div', { class: 'rotulo-campo' }, 'Clique nos fios na ordem'), paleta, el('div', { class: 'linha-botoes' }, desfazer, limpar));
  queueMicrotask(desenhar);
  return caixa;
}

export function abrirMenu(o: OpcoesMenu): () => void {
  const fundo = el('div', { class: 'menu-fundo' });
  const lista = el('nav', { class: 'menu-lista' });
  const detalhe = el('section', { class: 'menu-detalhe' });
  const fechar = el('button', { class: 'menu-fechar', title: 'Fechar (Esc)' }, '×');
  const caixa = el('div', { class: 'menu-acao', role: 'dialog', 'aria-label': o.titulo }, el('header', {}, el('div', {}, el('h3', {}, o.titulo), o.subtitulo ? el('small', {}, o.subtitulo) : ''), fechar), el('div', { class: 'menu-corpo' }, lista, detalhe));
  fundo.append(caixa);
  document.body.append(fundo);

  let selecionada = '';
  const encerrar = () => {
    fundo.remove();
    removeEventListener('keydown', tecla, true);
    o.aoFechar();
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      encerrar();
    }
  };
  addEventListener('keydown', tecla, true);
  fechar.addEventListener('click', encerrar);
  fundo.addEventListener('mousedown', (e) => {
    if (e.target === fundo) encerrar();
  });

  const mostrarLista = () => {
    const acoes = o.acoes();
    lista.replaceChildren(
      ...acoes.map((a) => {
        const b = el('button', { class: a.id === selecionada ? 'ativa' : '' }, a.rotulo);
        b.addEventListener('click', () => escolher(a.id));
        return b;
      }),
    );
    return acoes;
  };

  const escolher = (id: string, resultado?: Feito[]) => {
    selecionada = id;
    let acoes = mostrarLista();
    let a = acoes.find((x) => x.id === id);
    if (!a && acoes[0]) {
      selecionada = acoes[0].id;
      acoes = mostrarLista();
      a = acoes[0];
    }
    if (!a) {
      detalhe.replaceChildren(el('p', { class: 'menu-vazio' }, 'Escolha uma ação na lista.'));
      return;
    }
    if (a.abreConsole) {
      encerrar();
      o.abrirConsole(a.contexto!);
      return;
    }
    const valores = padroes(a);
    const fazer = el('button', { class: 'botao' }, 'Fazer');
    const previa = el('code', { class: 'previa' });
    const atualizarPrevia = () => {
      const completo = (a.campos ?? []).every((c) => valores[c.nome] !== '');
      fazer.toggleAttribute('disabled', !completo);
      previa.textContent = completo ? a.comandos(valores).join('  ·  ') : '(preencha os campos)';
    };
    const form = el('form', { class: 'menu-form' });
    for (const c of a.campos ?? []) {
      if (c.tipo === 'cores') {
        form.append(campoCores(c, valores, atualizarPrevia));
        continue;
      }
      let entrada: HTMLInputElement | HTMLSelectElement;
      if (c.tipo === 'escolha') {
        const s = el('select');
        for (const op of c.opcoes ?? []) {
          const opt = el('option', { value: op.valor }, op.rotulo);
          if (op.valor === valores[c.nome]) opt.selected = true;
          s.append(opt);
        }
        entrada = s;
      } else {
        entrada = el('input', { type: c.tipo === 'numero' ? 'text' : 'text', inputmode: c.tipo === 'numero' ? 'decimal' : 'text', value: valores[c.nome] ?? '', autocomplete: 'off', spellcheck: 'false' });
      }
      entrada.addEventListener('input', () => {
        valores[c.nome] = entrada.value.trim();
        atualizarPrevia();
      });
      form.append(el('label', { class: 'campo' }, el('span', { class: 'rotulo-campo' }, c.rotulo + (c.unidade ? ` (${c.unidade})` : '')), entrada));
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (fazer.hasAttribute('disabled')) return;
      const antes = o.acoes().map((x) => x.id).join();
      const resultado = o.executar(a, valores);
      const depois = o.acoes();
      // a próxima ação provável: a sugerida pela própria ação, ou a primeira se o menu mudou
      const sugerida = a.proxima && depois.some((x) => x.id === a.proxima) ? a.proxima : depois.map((x) => x.id).join() !== antes && depois[0] ? depois[0].id : a.id;
      escolher(sugerida, resultado);
    });
    fazer.setAttribute('type', 'submit');
    form.append(el('div', { class: 'linha-botoes' }, fazer), el('div', { class: 'rotulo-campo' }, 'No terminal, isso seria:'), previa);
    const blocos: Node[] = [el('h4', {}, a.rotulo), el('p', { class: 'menu-ajuda' }, a.ajuda), form];
    if (resultado?.length) {
      const res = el('div', { class: 'menu-resultado saida' });
      for (const f of resultado) {
        res.append(el('div', { class: 'cmd' }, `${f.prompt} ${f.comando}`));
        for (const l of f.saida) res.append(el('div', o.classe(l) ? { class: o.classe(l) } : {}, l || ' '));
      }
      blocos.push(res);
      queueMicrotask(() => (res.scrollTop = res.scrollHeight));
    }
    detalhe.replaceChildren(...blocos);
    atualizarPrevia();
  };

  const primeira = o.acoes()[0];
  escolher(primeira?.id ?? '');
  return encerrar;
}
