// Janela de um passo do modo guiado: o que fazer, por quê, a escolha, e depois o que se aprendeu.

import type { ResultadoPasso } from '../conteudo/guia';
import type { Passo } from '../conteudo/tipos';
import type { Campo } from '../motor/acoes';
import { campoCores } from './menu';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...filhos: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...filhos);
  return e;
}

export interface OpcoesPasso {
  numero: number;
  total: number;
  passo: Passo;
  campos: Campo[];
  executar: (escolhas: Record<string, string>) => ResultadoPasso;
  classe: (linha: string) => string;
  /** Chamado quando o passo deu certo e a pessoa clicou em continuar. */
  continuar: () => void;
  fechar: () => void;
}

export function abrirPasso(o: OpcoesPasso): void {
  const fundo = el('div', { class: 'menu-fundo' });
  const caixa = el('div', { class: 'janela-passo', role: 'dialog', 'aria-label': `Passo ${o.numero}` });
  fundo.append(caixa);
  document.body.append(fundo);
  let tentativas = 0;

  const encerrar = () => {
    fundo.remove();
    removeEventListener('keydown', tecla, true);
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      encerrar();
      o.fechar();
    }
  };
  addEventListener('keydown', tecla, true);

  const cabecalho = () => {
    const x = el('button', { class: 'menu-fechar', title: 'Fechar (Esc)' }, '×');
    x.addEventListener('click', () => {
      encerrar();
      o.fechar();
    });
    return el('header', {}, el('span', { class: 'etiqueta' }, `Passo ${o.numero} de ${o.total}`), x);
  };

  const saidaDoAparelho = (r: ResultadoPasso) => {
    const res = el('div', { class: 'menu-resultado saida' });
    for (const f of r.feito) {
      res.append(el('div', { class: 'cmd' }, `${f.prompt} ${f.comando}`));
      for (const l of f.saida) res.append(el('div', o.classe(l) ? { class: o.classe(l) } : {}, l || ' '));
    }
    queueMicrotask(() => (res.scrollTop = res.scrollHeight));
    return res;
  };

  const formulario = (valores: Record<string, string>, aviso?: string) => {
    const fazer = el('button', { class: 'botao', type: 'submit' }, o.passo.pergunta ? 'Responder' : 'Fazer');
    const conferir = () => fazer.toggleAttribute('disabled', o.campos.some((c) => !valores[c.nome]));
    const form = el('form', { class: 'menu-form' });
    for (const c of o.campos) {
      if (c.tipo === 'cores') {
        form.append(campoCores(c, valores, conferir));
        continue;
      }
      let entrada: HTMLInputElement | HTMLSelectElement;
      if (c.tipo === 'escolha') {
        const s = el('select');
        s.append(el('option', { value: '' }, 'escolha...'));
        for (const op of c.opcoes ?? []) s.append(el('option', { value: op.valor }, op.rotulo));
        s.value = valores[c.nome] ?? '';
        entrada = s;
      } else {
        entrada = el('input', { type: 'text', inputmode: c.tipo === 'numero' ? 'decimal' : 'text', value: valores[c.nome] ?? '', autocomplete: 'off', spellcheck: 'false' });
      }
      entrada.addEventListener('input', () => {
        valores[c.nome] = entrada.value.trim();
        conferir();
      });
      entrada.addEventListener('change', () => {
        valores[c.nome] = entrada.value.trim();
        conferir();
      });
      form.append(el('label', { class: 'campo' }, el('span', { class: 'rotulo-campo' }, c.rotulo + (c.unidade ? ` (${c.unidade})` : '')), entrada));
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!fazer.hasAttribute('disabled')) rodar({ ...valores });
    });
    const botoes = el('div', { class: 'linha-botoes' }, fazer);
    if (tentativas >= 2 && o.passo.exemplo) {
      const ver = el('button', { class: 'botao fantasma', type: 'button' }, 'Ver a resposta');
      ver.addEventListener('click', () => mostrarPergunta({ ...o.passo.exemplo! }, 'Esta é a resposta certa. Leia o porquê acima e clique para fazer.'));
      botoes.append(ver);
    }
    form.append(botoes);
    queueMicrotask(() => {
      conferir();
      (form.querySelector('input, select') as HTMLElement | null)?.focus();
    });
    return [...(aviso ? [el('p', { class: 'aviso-passo' }, aviso)] : []), form];
  };

  const mostrarPergunta = (valores: Record<string, string> = {}, aviso?: string) => {
    caixa.replaceChildren(
      cabecalho(),
      el('h3', {}, o.passo.instrucao),
      el('div', { class: 'porque' }, el('strong', {}, 'Por quê? '), o.passo.porque),
      ...(o.campos.length ? formulario(valores, aviso) : []),
    );
  };

  const rodar = (escolhas: Record<string, string>) => {
    const r = o.executar(escolhas);
    if (r.ok === true) {
      const seguir = el('button', { class: 'botao' }, 'Continuar');
      seguir.addEventListener('click', () => {
        encerrar();
        o.continuar();
      });
      const porqueAntes = o.campos.length ? [] : [el('h3', {}, o.passo.instrucao), el('div', { class: 'porque' }, el('strong', {}, 'Por quê? '), o.passo.porque)];
      caixa.replaceChildren(cabecalho(), ...porqueAntes, el('div', { class: 'certo' }, el('strong', {}, 'Feito. '), o.passo.feito), ...(r.feito.length ? [el('div', { class: 'rotulo-campo' }, 'O que o aparelho respondeu:'), saidaDoAparelho(r)] : []), el('div', { class: 'linha-botoes' }, seguir));
      queueMicrotask(() => seguir.focus());
      return;
    }
    tentativas++;
    const errado = el('div', { class: 'errado' }, el('strong', {}, 'Ainda não. '), r.ok);
    if (o.campos.length) {
      caixa.replaceChildren(cabecalho(), el('h3', {}, o.passo.instrucao), errado, el('div', { class: 'porque' }, el('strong', {}, 'Por quê? '), o.passo.porque), ...(r.feito.length ? [saidaDoAparelho(r)] : []), ...formulario({ ...escolhas }));
    } else {
      const outra = el('button', { class: 'botao' }, 'Tentar de novo');
      outra.addEventListener('click', () => rodar({}));
      caixa.replaceChildren(cabecalho(), el('h3', {}, o.passo.instrucao), errado, ...(r.feito.length ? [saidaDoAparelho(r)] : []), el('div', { class: 'linha-botoes' }, outra));
    }
  };

  if (o.campos.length) mostrarPergunta();
  else rodar({});
}

/** Janela final do dia: o que aconteceu de verdade. */
export function abrirFimDoDia(titulo: string, posMorte: string[], proximo: (() => void) | null, fechar: () => void) {
  const fundo = el('div', { class: 'menu-fundo' });
  const ok = el('button', { class: 'botao' }, proximo ? 'Próximo dia' : 'Fechar');
  const ficar = el('button', { class: 'botao fantasma' }, 'Ficar na sala');
  const caixa = el('div', { class: 'janela-passo fim' }, el('span', { class: 'etiqueta' }, 'Chamado fechado'), el('h3', {}, titulo), el('h4', {}, 'O que aconteceu de verdade'), ...posMorte.map((p) => el('p', {}, p)), el('div', { class: 'linha-botoes' }, ok, ficar));
  fundo.append(caixa);
  document.body.append(fundo);
  const sair = () => fundo.remove();
  ok.addEventListener('click', () => {
    sair();
    if (proximo) proximo();
    else fechar();
  });
  ficar.addEventListener('click', () => {
    sair();
    fechar();
  });
}
