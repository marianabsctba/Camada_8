// Fase 1: o jogo inteiro no terminal, sem 3D. Capa, painel do chamado e console.

import './ui/estilo.css';
import { DIAS } from './conteudo/dias';
import { ATOS } from './conteudo/tipos';
import { comandosCampo, Terminal } from './motor/cli';

const CHAVE = 'camada8.progresso';
const app = document.querySelector<HTMLDivElement>('#app')!;

function lerProgresso(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function gravarProgresso(lista: number[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...new Set(lista)]));
  } catch {
    /* sem armazenamento: o progresso vale só nesta aba */
  }
}

let resolvidos = lerProgresso();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...filhos: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...filhos);
  return e;
}

/* ---------- Capa ---------- */

function capa() {
  const cores = ['var(--laranja)', 'var(--verde)', 'var(--azul)', 'var(--marrom)'];
  const patch = el('div', { class: 'patch', 'aria-hidden': 'true' });
  for (let i = 0; i < 48; i++) {
    const p = el('div', { class: 'porta' }, el('i', { class: 'led' }));
    if ((i * 7 + 3) % 5 < 3) {
      p.classList.add('ligada');
      p.style.setProperty('--c', cores[i % 4]!);
      p.style.setProperty('--t', `${0.6 + ((i * 37) % 17) / 10}s`);
    }
    patch.append(p);
  }
  const jogar = el('button', { class: 'botao' }, resolvidos.length ? 'Continuar' : 'Começar o plantão');
  jogar.addEventListener('click', () => abrirDia(proximoDia()));
  const titulo = el('h1');
  titulo.innerHTML = 'CAMADA <span>8</span>';
  app.replaceChildren(
    el(
      'main',
      { class: 'capa' },
      el(
        'div',
        { class: 'capa-miolo' },
        patch,
        titulo,
        el('p', { class: 'sub' }, 'Um provedor de cidade pequena, um rack, um alicate e nenhuma senha. Aprenda redes de verdade, da camada física para cima. A camada 8 é você.'),
        jogar,
        el('p', { class: 'assinatura' }, 'POWERED BY MARIANA BS · FASE 1: TERMINAL'),
      ),
    ),
  );
}

function proximoDia(): number {
  const n = DIAS.find((d) => !resolvidos.includes(d.numero));
  return n ? n.numero : DIAS[DIAS.length - 1]!.numero;
}

/* ---------- Dia ---------- */

function abrirDia(numero: number) {
  const dia = DIAS.find((d) => d.numero === numero)!;
  const term = new Terminal(dia.montar(), dia);

  const seletor = el('select', { 'aria-label': 'Escolher dia' });
  for (const ato of ATOS) {
    const dias = DIAS.filter((d) => d.ato === ato.numero);
    if (!dias.length) continue;
    const grupo = el('optgroup', { label: `Ato ${ato.numero}: ${ato.nome}` });
    for (const d of dias) {
      const liberado = d.numero <= proximoDia() || resolvidos.includes(d.numero);
      const o = el('option', { value: String(d.numero) }, `${resolvidos.includes(d.numero) ? '● ' : ''}Dia ${d.numero}: ${d.titulo}`);
      if (!liberado) o.setAttribute('disabled', '');
      if (d.numero === numero) o.setAttribute('selected', '');
      grupo.append(o);
    }
    seletor.append(grupo);
  }
  seletor.addEventListener('change', () => abrirDia(Number(seletor.value)));

  const marca = el('button', { class: 'marca', title: 'Voltar à capa' });
  marca.innerHTML = 'CAMADA <span>8</span>';
  marca.addEventListener('click', capa);

  const ato = ATOS[dia.ato]!;
  const lista = el('ul', { class: 'objetivos' });
  const manual = el('details', { class: 'caixa', style: '--c: var(--azul)' }, el('summary', {}, `Manual: ${dia.manual.titulo}`), ...dia.manual.texto.map((t) => el('p', {}, t)));
  const posMorte = el('div', { class: 'caixa', style: '--c: var(--led)', hidden: '' }, el('h3', {}, 'Pós-morte'), ...dia.posMorte.map((t) => el('p', {}, t)));
  const reiniciar = el('button', { class: 'botao fantasma' }, 'Recomeçar o dia');
  reiniciar.addEventListener('click', () => abrirDia(numero));
  const proximo = el('button', { class: 'botao', hidden: '' }, 'Próximo dia');
  proximo.addEventListener('click', () => abrirDia(Math.min(DIAS.length, numero + 1)));

  const lado = el(
    'aside',
    { class: 'lado' },
    el('div', { class: 'topo' }, marca, seletor),
    el('div', { class: 'etiqueta' }, `Ato ${ato.numero} · ${ato.nome} · ${ato.tema}`),
    el('h2', {}, `Dia ${dia.numero}: ${dia.titulo}`),
    el('div', { class: 'caixa chamado' }, ...dia.chamado.map((t) => el('p', {}, t))),
    manual,
    el('div', { class: 'caixa', style: '--c: var(--ambar)' }, el('h3', {}, 'Objetivo'), lista),
    posMorte,
    el('div', { class: 'acoes' }, reiniciar, proximo),
  );

  const saida = el('div', { class: 'saida', role: 'log', 'aria-live': 'polite' });
  const rotulo = el('label', { for: 'linha' }, term.prompt());
  const input = el('input', { id: 'linha', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Comando' });
  const terminal = el('section', { class: 'terminal' }, saida, el('div', { class: 'entrada' }, rotulo, input));

  app.replaceChildren(el('main', { class: 'jogo' }, lado, terminal));

  const classe = (l: string) => {
    if (l.startsWith('CHAMADO FECHADO')) return 'fechado';
    if (l.startsWith('[x]') || /ATIVO|SINCRONIZADO|ONLINE|CERTIFICADO|PASSA\b|Acesso liberado|\[OK\]/.test(l)) return 'bom';
    if (l.startsWith('[ ]') || /^Dica \d/.test(l)) return 'aviso';
    if (/FORA|FALHA|REPROVADO|OFFLINE|ALARME|negado|perdid|sem resposta/i.test(l)) return 'ruim';
    if (/^(==|[A-ZÁÉÍÓÚÇÃÕ ]{6,}$)/.test(l)) return 'titulo';
    return '';
  };
  const escrever = (linhas: string[], cls?: string) => {
    for (const l of linhas) saida.append(el('div', cls ? { class: cls } : classe(l) ? { class: classe(l) } : {}, l || ' '));
    saida.scrollTop = saida.scrollHeight;
  };

  const atualizar = () => {
    const itens = dia.objetivo(term.mundo);
    lista.replaceChildren(...itens.map((i) => el('li', i.ok ? { class: 'ok' } : {}, el('span', {}, i.texto, ...(i.detalhe ? [el('small', {}, i.detalhe)] : [])))));
    if (itens.every((i) => i.ok)) {
      term.resolvido = true;
      if (!resolvidos.includes(dia.numero)) {
        resolvidos = [...resolvidos, dia.numero];
        gravarProgresso(resolvidos);
        escrever(['', 'CHAMADO FECHADO. O pós-morte apareceu no painel.']);
      }
      posMorte.hidden = false;
      if (numero < DIAS.length) proximo.hidden = false;
    }
    rotulo.textContent = term.prompt();
  };

  escrever(dia.chamado);
  escrever(['', 'Digite "ajuda" para ver os comandos. Tab completa, setas recuperam o histórico.', '']);
  atualizar();

  let posHist = 0;
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const linha = input.value;
      input.value = '';
      escrever([`${term.prompt()} ${linha}`], 'cmd');
      escrever(term.executar(linha));
      posHist = term.historico.length;
      atualizar();
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      posHist = Math.max(0, Math.min(term.historico.length, posHist + (ev.key === 'ArrowUp' ? -1 : 1)));
      input.value = term.historico[posHist] ?? '';
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      completar(input, term);
    }
  });
  input.focus();
  terminal.addEventListener('click', () => {
    if (!window.getSelection()?.toString()) input.focus();
  });
}

function completar(input: HTMLInputElement, term: Terminal) {
  const partes = input.value.split(' ');
  const ultima = partes[partes.length - 1] ?? '';
  const m = term.mundo;
  const candidatos =
    partes.length === 1 && !term.contexto
      ? comandosCampo()
      : [...m.equipamentos.keys(), ...m.cabos.keys(), ...[...m.equipamentos.values()].flatMap((e) => e.portas.map((p) => `${e.nome}:${p.nome}`))];
  const achados = candidatos.filter((c) => c.startsWith(ultima));
  if (achados.length === 1) {
    partes[partes.length - 1] = achados[0]!;
    input.value = partes.join(' ') + ' ';
  } else if (achados.length > 1) {
    let comum = achados[0]!;
    for (const a of achados) while (!a.startsWith(comum)) comum = comum.slice(0, -1);
    partes[partes.length - 1] = comum;
    input.value = partes.join(' ');
  }
}

capa();
