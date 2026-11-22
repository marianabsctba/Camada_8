// Camada 8: capa, sala em 3D e o modo guiado, passo a passo.

import './ui/estilo.css';
import { DIAS } from './conteudo/dias';
import { ATOS } from './conteudo/tipos';
import { camposDoPasso, executarPasso } from './conteudo/guia';
import { Terminal } from './motor/cli';
import { abrirFimDoDia, abrirPasso } from './ui/passo';
import { iniciarControles, J, soltarMouse } from './tres/jogador';
import { esperarCarga, preCarregarMoveis } from './tres/glb';
import { iniciar3d, M, pausar3d } from './tres/motor3d';
import { preCarregarTexturas } from './tres/pbr';
import { alvoNaMira, atualizarEquipamentos, destacar, montarSala } from './tres/sala';

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
        el('p', { class: 'assinatura' }, 'POWERED BY MARIANA BS'),
      ),
    ),
  );
}

function proximoDia(): number {
  const n = DIAS.find((d) => !resolvidos.includes(d.numero));
  return n ? n.numero : DIAS[DIAS.length - 1]!.numero;
}


/* ---------- Dia (modo guiado) ---------- */

function classe(l: string) {
  if (l.startsWith('CHAMADO FECHADO')) return 'fechado';
  if (l.startsWith('[x]') || /ATIVO|SINCRONIZADO|ONLINE|CERTIFICADO|PASSA\b|Acesso liberado|\[OK\]/.test(l)) return 'bom';
  if (l.startsWith('[ ]') || /^Dica \d/.test(l)) return 'aviso';
  if (/FORA|FALHA|REPROVADO|OFFLINE|ALARME|negado|perdid|sem resposta|TROCADOS|Torto/i.test(l)) return 'ruim';
  if (/^(==|[A-ZÁÉÍÓÚÇÃÕ ]{6,}$)/.test(l)) return 'titulo';
  return '';
}

function abrirDia(numero: number) {
  const dia = DIAS.find((d) => d.numero === numero)!;
  const term = new Terminal(dia.montar(), dia);
  const passos = dia.passos ?? [];
  let idx = 0;
  let janelaAberta = false;

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
  const guiaPainel = el('div', { class: 'caixa guia', style: '--c: var(--laranja)' });
  const reiniciar = el('button', { class: 'botao fantasma' }, 'Recomeçar o dia');
  reiniciar.addEventListener('click', () => abrirDia(numero));
  const botaoModo = el('button', { class: 'botao fantasma' }, modo === '3d' ? 'Sem 3D (mais leve)' : 'Ver em 3D');
  botaoModo.addEventListener('click', () => trocarModo(modo === '3d' ? 'terminal' : '3d', numero));

  const lado = el(
    'aside',
    { class: 'lado' },
    el('div', { class: 'topo' }, marca, seletor),
    el('div', { class: 'etiqueta' }, `Ato ${ato.numero} · ${ato.nome} · ${ato.tema}`),
    el('h2', {}, `Dia ${dia.numero}: ${dia.titulo}`),
    el('div', { class: 'caixa chamado' }, ...dia.chamado.map((t) => el('p', {}, t))),
    guiaPainel,
    manual,
    el('div', { class: 'caixa', style: '--c: var(--ambar)' }, el('h3', {}, 'Objetivo do chamado'), lista),
    el('div', { class: 'acoes' }, reiniciar, botaoModo),
  );

  // registro do que os aparelhos responderam, para quem quiser ler e aprender os comandos
  const saida = el('div', { class: 'saida', role: 'log', 'aria-live': 'polite' });
  const registro = el('section', { class: 'terminal' }, el('div', { class: 'registro-titulo' }, 'Registro: cada passo vira um comando de verdade'), saida);
  const escrever = (linhas: string[], cls?: string) => {
    for (const l of linhas) saida.append(el('div', cls ? { class: cls } : classe(l) ? { class: classe(l) } : {}, l || ' '));
    saida.scrollTop = saida.scrollHeight;
  };

  const hudGuia = el('div', { class: 'hud-guia' });
  let destacarFn: (a: { tipo: string; id: string } | null) => void = () => {};
  let liberarFn: () => void = () => {};

  const desenharGuia = (alvo: HTMLElement, em3d: boolean) => {
    const p = passos[idx];
    if (!p) {
      alvo.replaceChildren(el('h3', {}, 'Chamado fechado'), el('p', { class: 'passo-atual' }, 'Tudo feito. Escolha o próximo dia no topo do painel.'));
      return;
    }
    const barra = el('div', { class: 'barra-passos' }, ...passos.map((_, i) => el('i', { class: i < idx ? 'feito' : i === idx ? 'atual' : '' })));
    const botao = el('button', { class: 'botao' }, p.pergunta ? 'Responder' : em3d ? 'Fazer daqui mesmo' : 'Fazer este passo');
    botao.addEventListener('click', () => fazerPasso());
    const nomeAlvo = p.alvo ? (p.alvo[0] === 'cabo' ? `do cabo ${p.alvo[1]}` : p.alvo[0] === 'almox' ? 'da estante do almoxarifado' : `do aparelho ${p.alvo[1]}`) : '';
    const onde = p.alvo && em3d ? el('p', { class: 'onde' }, `A seta laranja está em cima ${nomeAlvo}. Mire nele e aperte E.`) : null;
    const porque = el('details', { class: 'porque-mini', open: '' }, el('summary', {}, 'Por quê?'), el('p', {}, p.porque));
    alvo.replaceChildren(el('h3', {}, `Passo ${idx + 1} de ${passos.length}`), barra, el('p', { class: 'passo-atual' }, p.instrucao), ...(onde ? [onde] : []), porque, el('div', { class: 'linha-botoes' }, botao));
  };

  const atualizar = () => {
    const itens = dia.objetivo(term.mundo);
    lista.replaceChildren(...itens.map((i) => el('li', i.ok ? { class: 'ok' } : {}, el('span', {}, i.texto, ...(i.detalhe ? [el('small', {}, i.detalhe)] : [])))));
    desenharGuia(guiaPainel, false);
    desenharGuia(hudGuia, modo === '3d');
    const p = passos[idx];
    destacarFn(p?.alvo ? { tipo: p.alvo[0], id: p.alvo[1] } : null);
  };

  const terminarDia = () => {
    term.resolvido = true;
    if (!resolvidos.includes(dia.numero)) {
      resolvidos = [...resolvidos, dia.numero];
      gravarProgresso(resolvidos);
    }
    escrever(['', 'CHAMADO FECHADO.']);
    janelaAberta = true;
    abrirFimDoDia(
      `Dia ${dia.numero}: ${dia.titulo}`,
      dia.posMorte,
      numero < DIAS.length ? () => abrirDia(numero + 1) : null,
      () => {
        janelaAberta = false;
        liberarFn();
      },
    );
  };

  function fazerPasso() {
    const p = passos[idx];
    if (!p || janelaAberta) return;
    janelaAberta = true;
    J.livre = false;
    soltarMouse();
    abrirPasso({
      numero: idx + 1,
      total: passos.length,
      passo: p,
      campos: camposDoPasso(term, p),
      classe,
      executar: (escolhas) => {
        const r = executarPasso(term, dia, p, escolhas);
        for (const f of r.feito) {
          escrever([`${f.prompt} ${f.comando}`], 'cmd');
          escrever(f.saida);
        }
        if (modo === '3d') atualizarEquipamentos(term.mundo);
        atualizar();
        return r;
      },
      continuar: () => {
        janelaAberta = false;
        idx++;
        atualizar();
        if (idx >= passos.length || dia.objetivo(term.mundo).every((i) => i.ok)) {
          idx = passos.length;
          atualizar();
          terminarDia();
        } else liberarFn();
      },
      fechar: () => {
        janelaAberta = false;
        liberarFn();
      },
    });
  }

  if (modo === 'terminal') {
    teclas3d = null;
    pausar3d();
    soltarMouse();
    app.replaceChildren(el('main', { class: 'jogo' }, lado, registro));
  } else {
    montar3d();
  }

  function montar3d() {
    const palco = el('main', { class: 'jogo3d' });
    const mira = el('div', { class: 'mira', 'aria-hidden': 'true' });
    const rotuloAlvo = el('div', { class: 'hud-alvo', hidden: '' });
    const bPainel = el('button', { class: 'hud-botao' }, 'Painel (P)');
    const titulo = el('div', { class: 'hud-titulo' }, `Dia ${dia.numero}: ${dia.titulo}`);
    const ajuda = el('div', { class: 'hud-dicas' }, 'Clique na cena para olhar · WASD anda · mire no objeto com a seta e aperte E · P abre o painel · Esc solta o mouse');
    const carregando = el('div', { class: 'carregando' }, el('div', { class: 'carregando-leds' }, ...Array.from({ length: 8 }, () => el('i'))), el('p', {}, 'Acendendo as luzes da sala técnica...'));
    lado.classList.add('gaveta-esq');
    lado.hidden = true;
    palco.append(el('div', { class: 'hud-topo' }, titulo, bPainel), hudGuia, mira, rotuloAlvo, ajuda, lado, carregando);
    app.replaceChildren(palco);
    const canvas = iniciar3d(palco);
    canvas.style.opacity = '0';
    montarSala(term.mundo, [`Dia ${dia.numero}`, dia.titulo, 'Siga a seta laranja']);
    iniciarControles(canvas, palco);
    J.livre = true;
    destacarFn = destacar;
    liberarFn = () => {
      J.livre = lado.hidden && !janelaAberta;
    };
    (window as unknown as { __c8: unknown }).__c8 = { J, fazerPasso };
    void esperarCarga().then(() => {
      canvas.style.transition = 'opacity 0.5s';
      canvas.style.opacity = '1';
      carregando.classList.add('sumindo');
      setTimeout(() => carregando.remove(), 600);
    });

    const alternarPainel = () => {
      lado.hidden = !lado.hidden;
      if (!lado.hidden) soltarMouse();
      liberarFn();
    };
    bPainel.addEventListener('click', alternarPainel);

    let alvoAtual: ReturnType<typeof alvoNaMira> = null;
    let aviso = 0;
    const ehDoPasso = (a: NonNullable<typeof alvoAtual>) => {
      const p = passos[idx];
      return !!p?.alvo && p.alvo[0] === a.tipo && p.alvo[1] === a.id;
    };
    M.atualizar.add((_dt, t) => {
      const a = J.livre ? alvoNaMira() : null;
      alvoAtual = a;
      if (!a) {
        rotuloAlvo.hidden = true;
        mira.classList.remove('ativa');
        return;
      }
      rotuloAlvo.hidden = false;
      const certo = ehDoPasso(a);
      mira.classList.toggle('ativa', certo);
      rotuloAlvo.classList.toggle('certo', certo);
      rotuloAlvo.textContent = certo ? `${a.rotulo}  ·  E: fazer o passo` : t < aviso ? 'Não é aqui. Procure a seta laranja.' : a.rotulo;
    });

    teclas3d = (e) => {
      const alvo = e.target as HTMLElement;
      if (alvo?.tagName === 'INPUT' || alvo?.tagName === 'SELECT' || janelaAberta) return;
      if (e.key === 'Escape' && !lado.hidden) {
        alternarPainel();
        return;
      }
      if (e.code === 'KeyP') alternarPainel();
      else if (e.code === 'KeyE') {
        e.preventDefault();
        const p = passos[idx];
        if (p?.pergunta) fazerPasso();
        else if (alvoAtual && ehDoPasso(alvoAtual)) fazerPasso();
        else if (alvoAtual) aviso = M.relogio.elapsedTime + 2;
      }
    };
  }

  escrever(dia.chamado);
  escrever(['']);
  atualizar();
}

preCarregarMoveis();
preCarregarTexturas();
capa();
