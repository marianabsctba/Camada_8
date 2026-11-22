// Fase 1: o jogo inteiro no terminal, sem 3D. Capa, painel do chamado e console.

import './ui/estilo.css';
import { DIAS } from './conteudo/dias';
import { ATOS } from './conteudo/tipos';
import { acoesDo, executarAcao, type TipoAlvo } from './motor/acoes';
import { comandosCampo, Terminal } from './motor/cli';
import { abrirMenu } from './ui/menu';
import { iniciarControles, J, soltarMouse } from './tres/jogador';
import { esperarCarga, preCarregarMoveis } from './tres/glb';
import { iniciar3d, M, pausar3d } from './tres/motor3d';
import { preCarregarTexturas } from './tres/pbr';
import { alvoNaMira, atualizarEquipamentos, montarSala } from './tres/sala';

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

const CHAVE_MODO = 'camada8.modo';
function lerModo(): '3d' | 'terminal' {
  try {
    const v = localStorage.getItem(CHAVE_MODO);
    if (v === '3d' || v === 'terminal') return v;
  } catch {
    /* segue o padrão */
  }
  return matchMedia('(pointer: coarse)').matches ? 'terminal' : '3d';
}
let modo = lerModo();
function trocarModo(novo: '3d' | 'terminal', dia: number) {
  modo = novo;
  try {
    localStorage.setItem(CHAVE_MODO, novo);
  } catch {
    /* só nesta aba */
  }
  abrirDia(dia);
}

/** Teclas do modo 3D: um ouvinte só, que chama o dia aberto no momento. */
let teclas3d: ((e: KeyboardEvent) => void) | null = null;
addEventListener('keydown', (e) => teclas3d?.(e));

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
  marca.addEventListener('click', () => {
    teclas3d = null;
    pausar3d();
    soltarMouse();
    capa();
  });

  const ato = ATOS[dia.ato]!;
  const lista = el('ul', { class: 'objetivos' });
  const manual = el('details', { class: 'caixa', style: '--c: var(--azul)' }, el('summary', {}, `Manual: ${dia.manual.titulo}`), ...dia.manual.texto.map((t) => el('p', {}, t)));
  const posMorte = el('div', { class: 'caixa', style: '--c: var(--led)', hidden: '' }, el('h3', {}, 'Pós-morte'), ...dia.posMorte.map((t) => el('p', {}, t)));
  const reiniciar = el('button', { class: 'botao fantasma' }, 'Recomeçar o dia');
  reiniciar.addEventListener('click', () => abrirDia(numero));
  const proximo = el('button', { class: 'botao', hidden: '' }, 'Próximo dia');
  proximo.addEventListener('click', () => abrirDia(Math.min(DIAS.length, numero + 1)));

  const passoPainel = el('div', { class: 'caixa passo', style: '--c: var(--laranja)' });
  const local = el('div', { class: 'local' });
  const perguntas = el('div', { class: 'perguntas' });
  const caixaPerguntas = el('div', { class: 'caixa', style: '--c: var(--azul)' }, el('h3', {}, 'Perguntas do chamado'), perguntas);
  if (!dia.perguntas?.length) caixaPerguntas.hidden = true;
  const lado = el(
    'aside',
    { class: 'lado' },
    el('div', { class: 'topo' }, marca, seletor),
    el('div', { class: 'etiqueta' }, `Ato ${ato.numero} · ${ato.nome} · ${ato.tema}`),
    el('h2', {}, `Dia ${dia.numero}: ${dia.titulo}`),
    el('div', { class: 'caixa chamado' }, ...dia.chamado.map((t) => el('p', {}, t))),
    passoPainel,
    el('div', { class: 'caixa', style: '--c: var(--verde)' }, el('h3', {}, 'No local'), el('p', { class: 'nota' }, 'Clique num aparelho ou num cabo para ver o que dá para fazer.'), local),
    caixaPerguntas,
    manual,
    el('div', { class: 'caixa', style: '--c: var(--ambar)' }, el('h3', {}, 'Objetivo'), lista),
    posMorte,
    el('div', { class: 'acoes' }, reiniciar, proximo),
  );

  const saida = el('div', { class: 'saida', role: 'log', 'aria-live': 'polite' });
  const rotulo = el('label', { for: 'linha' }, term.prompt());
  const input = el('input', { id: 'linha', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'Comando' });
  const terminal = el('section', { class: 'terminal' }, saida, el('div', { class: 'entrada' }, rotulo, input));

  const botaoModo = el('button', { class: 'botao fantasma' }, modo === '3d' ? 'Modo terminal' : 'Ver em 3D');
  botaoModo.addEventListener('click', () => trocarModo(modo === '3d' ? 'terminal' : '3d', numero));
  lado.querySelector('.acoes')!.append(botaoModo);

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

  let dicasMostradas = 0;
  const hudPasso = el('div', { class: 'hud-passo' });
  const desenharPasso = (alvo: HTMLElement, itens: ReturnType<typeof dia.objetivo>) => {
    const pendente = itens.find((i) => !i.ok);
    const feitos = itens.filter((i) => i.ok).length;
    const bDica = el('button', { class: 'botao fantasma mini' }, dicasMostradas < dia.dicas.length ? 'Me dá uma dica' : 'Sem mais dicas');
    bDica.addEventListener('click', () => {
      if (dicasMostradas < dia.dicas.length) dicasMostradas++;
      atualizar();
    });
    const dicas = dia.dicas.slice(0, dicasMostradas).map((d, i) => el('p', { class: 'dica' }, `Dica ${i + 1}: ${d}`));
    const texto = pendente ? pendente.texto + (pendente.texto.startsWith('pergunta') ? ' (responda no painel, em Perguntas do chamado)' : '') : 'Tudo feito. Leia o pós-morte no painel.';
    alvo.replaceChildren(el('h3', {}, `Próximo passo · ${feitos} de ${itens.length}`), el('p', { class: 'passo-atual' }, texto), ...(pendente?.detalhe ? [el('small', {}, pendente.detalhe)] : []), ...dicas, ...(pendente ? [bDica] : []));
  };
  const desenharLocal = () => {
    const m = term.mundo;
    const botao = (tipo: TipoAlvo, id: string, txt: string, sub: string) => {
      const b = el('button', { class: 'item-local' }, el('strong', {}, txt), el('small', {}, sub));
      b.addEventListener('click', () => abrirAcoes(tipo, id));
      return b;
    };
    local.replaceChildren(
      ...[...m.equipamentos.values()].map((e) => botao('equip', e.nome, e.nome, e.modelo)),
      ...[...m.cabos.values()].map((c) => botao('cabo', c.id, `cabo ${c.id}`, `${c.a.equip} ⇄ ${c.b.equip} · ${c.meio.toUpperCase()}`)),
      ...(Object.keys(m.catalogo).length ? [botao('almox', 'almox', 'almoxarifado', 'equipamentos para instalar')] : []),
    );
  };
  const desenharPerguntas = () => {
    perguntas.replaceChildren(
      ...(dia.perguntas ?? []).map((p) => {
        const resp = term.mundo.respostas[p.id];
        const certa = resp !== undefined && p.confere(resp, term.mundo);
        const entrada = el('input', { value: resp ?? '', placeholder: 'sua resposta', autocomplete: 'off', spellcheck: 'false' });
        const form = el('form', { class: 'pergunta' + (certa ? ' certa' : resp !== undefined ? ' errada' : '') }, el('p', {}, `${p.id}) ${p.texto}`), el('div', { class: 'linha-botoes' }, entrada, el('button', { class: 'botao mini', type: 'submit' }, 'Responder')), el('small', {}, certa ? 'Certa.' : resp !== undefined ? 'Ainda não. Confira a conta no manual.' : ''));
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          if (entrada.value.trim()) rodar(`responder ${p.id} ${entrada.value.trim()}`);
        });
        return form;
      }),
    );
  };

  const atualizar = () => {
    const itens = dia.objetivo(term.mundo);
    desenharPasso(passoPainel, itens);
    desenharPasso(hudPasso, itens);
    desenharLocal();
    desenharPerguntas();
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

  let posHist = 0;
  const rodar = (linha: string) => {
    escrever([`${term.prompt()} ${linha}`], 'cmd');
    escrever(term.executar(linha));
    posHist = term.historico.length;
    atualizar();
    if (modo === '3d') atualizarEquipamentos(term.mundo);
  };

  let abrirTerminalFn = (sim: boolean) => {
    if (sim) input.focus();
  };
  let menuAberto = false;
  function abrirAcoes(tipo: TipoAlvo, id: string) {
    if (menuAberto) return;
    menuAberto = true;
    J.livre = false;
    soltarMouse();
    const titulo = tipo === 'almox' ? 'Almoxarifado' : tipo === 'cabo' ? `Cabo ${id}` : id;
    const e = term.mundo.equipamentos.get(id);
    const c = term.mundo.cabos.get(id);
    const sub = e ? e.modelo : c ? `${c.a.equip}:${c.a.porta} ⇄ ${c.b.equip}:${c.b.porta} · ${c.meio.toUpperCase()} · ${c.metros} m` : 'o que tem na estante';
    abrirMenu({
      titulo,
      subtitulo: sub,
      acoes: () => acoesDo(term.mundo, tipo, id),
      classe,
      executar: (a, v) => {
        const feito = executarAcao(term, a, v);
        for (const f of feito) {
          escrever([`${f.prompt} ${f.comando}`], 'cmd');
          escrever(f.saida);
        }
        posHist = term.historico.length;
        atualizar();
        if (modo === '3d') atualizarEquipamentos(term.mundo);
        return feito;
      },
      abrirConsole: (nome) => {
        abrirTerminalFn(true);
        if (term.contexto !== nome) {
          if (term.contexto) rodar('sair');
          rodar(`console ${nome}`);
        }
      },
      aoFechar: () => {
        menuAberto = false;
        J.livre = modo === '3d' && terminal.hidden;
      },
    });
  }

  if (modo === 'terminal') {
    teclas3d = null;
    pausar3d();
    soltarMouse();
    app.replaceChildren(el('main', { class: 'jogo' }, lado, terminal));
  } else {
    montar3d();
  }

  function montar3d() {
    const palco = el('main', { class: 'jogo3d' });
    const mira = el('div', { class: 'mira', 'aria-hidden': 'true' });
    const rotuloAlvo = el('div', { class: 'hud-alvo', hidden: '' });
    const bPainel = el('button', { class: 'hud-botao' }, 'Painel (P)');
    const bTerm = el('button', { class: 'hud-botao' }, 'Terminal (T)');
    const titulo = el('div', { class: 'hud-titulo' }, `Dia ${dia.numero}: ${dia.titulo}`);
    const ajuda = el('div', { class: 'hud-dicas' }, 'Clique na cena para olhar · WASD anda · E mostra o que dá para fazer com o que está na mira · P painel · T terminal · Esc solta o mouse');
    lado.classList.add('gaveta-esq');
    terminal.classList.add('gaveta-dir');
    lado.hidden = true;
    terminal.hidden = true;
    palco.append(el('div', { class: 'hud-topo' }, titulo, bPainel, bTerm), hudPasso, mira, rotuloAlvo, ajuda, lado, terminal);
    app.replaceChildren(palco);
    const carregando = el('div', { class: 'carregando' }, el('div', { class: 'carregando-leds' }, ...Array.from({ length: 8 }, () => el('i'))), el('p', {}, 'Acendendo as luzes da sala técnica...'));
    palco.append(carregando);
    const canvas = iniciar3d(palco);
    canvas.style.opacity = '0';
    montarSala(term.mundo, [`Dia ${dia.numero}`, dia.titulo, 'Mire e aperte E']);
    iniciarControles(canvas, palco);
    J.livre = true;
    void esperarCarga().then(() => {
      canvas.style.transition = 'opacity 0.5s';
      canvas.style.opacity = '1';
      carregando.classList.add('sumindo');
      setTimeout(() => carregando.remove(), 600);
    });
    (window as unknown as { __c8: unknown }).__c8 = { J, rodar };

    const abrirTerminal = (sim: boolean) => {
      terminal.hidden = !sim;
      J.livre = !sim && !menuAberto;
      if (sim) {
        soltarMouse();
        input.focus();
      }
    };
    abrirTerminalFn = abrirTerminal;
    bPainel.addEventListener('click', () => (lado.hidden = !lado.hidden));
    bTerm.addEventListener('click', () => abrirTerminal(terminal.hidden));

    let alvoAtual: ReturnType<typeof alvoNaMira> = null;
    M.atualizar.add(() => {
      const a = J.livre ? alvoNaMira() : null;
      if (a?.id !== alvoAtual?.id || a?.tipo !== alvoAtual?.tipo) {
        alvoAtual = a;
        rotuloAlvo.hidden = !a;
        if (a) rotuloAlvo.textContent = `${a.rotulo}  ·  E: o que fazer`;
        mira.classList.toggle('ativa', !!a);
      }
    });

    teclas3d = (e) => {
      const alvo = e.target as HTMLElement;
      if (e.key === 'Escape') {
        if (!terminal.hidden || !lado.hidden) {
          abrirTerminal(false);
          lado.hidden = true;
          input.blur();
        }
        return;
      }
      if (alvo?.tagName === 'INPUT' || alvo?.tagName === 'SELECT') return;
      if (e.code === 'KeyT') {
        e.preventDefault();
        abrirTerminal(terminal.hidden);
      } else if (e.code === 'KeyP') {
        lado.hidden = !lado.hidden;
      } else if (e.code === 'KeyE' && alvoAtual && !menuAberto) {
        e.preventDefault();
        abrirAcoes(alvoAtual.tipo, alvoAtual.id);
      }
    };
  }

  escrever(dia.chamado);
  escrever(['', 'Tudo dá para fazer pelos menus. Quem quiser digitar: "ajuda" lista os comandos, Tab completa, setas recuperam o histórico.', '']);
  atualizar();

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const linha = input.value;
      input.value = '';
      rodar(linha);
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      posHist = Math.max(0, Math.min(term.historico.length, posHist + (ev.key === 'ArrowUp' ? -1 : 1)));
      input.value = term.historico[posHist] ?? '';
    } else if (ev.key === 'Tab') {
      ev.preventDefault();
      completar(input, term);
    }
  });
  if (modo === 'terminal') input.focus();
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

preCarregarMoveis();
preCarregarTexturas();
capa();
