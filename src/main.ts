// Camada 8: capa, sala em 3D e o modo guiado, passo a passo.

import './ui/estilo.css';
import { DIAS } from './conteudo/dias';
import { ATOS } from './conteudo/tipos';
import { camposDoPasso, executarPasso } from './conteudo/guia';
import { Terminal } from './motor/cli';
import { abrirPasso } from './ui/passo';
import { abrirAula } from './ui/aula';
import { abrirMenu } from './ui/menu';
import { avisoDesempenho, botaoLeve } from './ui/leve';
import { contarConectados, desenharMapa, lugarDaLuz, nomeDoLugar } from './ui/mapa';
import { CURRICULO, type EntradaCurriculo } from './conteudo/curriculo';
import type { Dia } from './conteudo/tipos';
import { acoesDo, executarAcao, type TipoAlvo } from './motor/acoes';
import { iniciarControles, J, soltarMouse } from './tres/jogador';
import { esperarCarga } from './tres/glb';
import { iniciar3d, M, pausar3d } from './tres/motor3d';
import { alvoNaMira, atualizarEquipamentos, destacar, montarSala, preCarregarLugar } from './tres/sala';
import { ambiente, iniciarSom, somDosComandos, tocar } from './som/som';
import { montarBotaoSom } from './som/botao';

const CHAVE = 'camada8.v2';
const app = document.querySelector<HTMLDivElement>('#app')!;

function lerEstado(): { feitos: number[]; atos: number[] } {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    const nums = (x: unknown) => (Array.isArray(x) ? x.filter((n) => typeof n === 'number') : []);
    return { feitos: nums(v.feitos), atos: nums(v.atos) };
  } catch {
    return { feitos: [], atos: [] };
  }
}

function gravarEstado() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ feitos: [...new Set(resolvidos)], atos: [...new Set(atosAbertos)] }));
  } catch {
    /* sem armazenamento: o progresso vale só nesta aba */
  }
}

const estado = lerEstado();
let resolvidos = estado.feitos;
let atosAbertos = estado.atos;

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
  ambiente(null);
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
  jogar.addEventListener('click', () => mapaTela());
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
  ambiente(dia.ato);
  let idx = 0;
  let janelaAberta = false;

  const seletor = el('select', { 'aria-label': 'Escolher dia' });
  for (const ato of ATOS) {
    const dias = DIAS.filter((d) => d.ato === ato.numero);
    if (!dias.length) continue;
    const grupo = el('optgroup', { label: `Ato ${ato.numero}: ${ato.nome}` });
    for (const d of dias) {
      const liberado = resolvidos.includes(d.numero) || proximaEntrada()?.numero === d.numero;
      const o = el('option', { value: String(d.numero) }, `${resolvidos.includes(d.numero) ? '● ' : ''}Dia ${d.numero}: ${d.titulo}`);
      if (!liberado) o.setAttribute('disabled', '');
      if (d.numero === numero) o.setAttribute('selected', '');
      grupo.append(o);
    }
    seletor.append(grupo);
  }
  seletor.addEventListener('change', () => iniciarDia(DIAS.find((d) => d.numero === Number(seletor.value))!));

  const marca = el('button', { class: 'marca', title: 'Voltar à capa' });
  marca.innerHTML = 'CAMADA <span>8</span>';
  marca.addEventListener('click', () => mapaTela());

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
    escrever(['', 'PRÁTICA CONCLUÍDA.']);
    depoisDaPratica(dia);
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
        somDosComandos(r.feito);
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
    palco.append(el('div', { class: 'hud-topo' }, titulo, botaoLeve(), bPainel), hudGuia, mira, rotuloAlvo, ajuda, lado, carregando);
    app.replaceChildren(palco);
    avisoDesempenho(palco);
    const canvas = iniciar3d(palco);
    canvas.style.opacity = '0';
    montarSala(term.mundo, [`Dia ${dia.numero}`, dia.titulo, 'Siga a seta laranja'], dia.ato);
    iniciarControles(canvas, palco);
    J.livre = true;
    destacarFn = destacar;
    liberarFn = () => {
      J.livre = lado.hidden && !janelaAberta;
    };
    (window as unknown as { __c8: unknown }).__c8 = { J, fazerPasso, term };
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

/* ---------- Fluxo da história: mapa, abertura do ato, carta, aula, prática, desafio, fechamento ---------- */

function sairDo3d() {
  teclas3d = null;
  pausar3d();
  soltarMouse();
}

const jogavel = (e: EntradaCurriculo) => DIAS.some((d) => d.numero === e.numero);

/** Próximo dia jogável ainda não feito, na ordem do currículo. */
function proximaEntrada(): EntradaCurriculo | undefined {
  return CURRICULO.find((e) => jogavel(e) && !resolvidos.includes(e.numero));
}

function diaDaEntrada(e: EntradaCurriculo): Dia | undefined {
  return DIAS.find((d) => d.numero === e.numero);
}

function mapaTela(recente?: number) {
  sairDo3d();
  ambiente(null);
  const prox = proximaEntrada();
  const { lugares, casas } = contarConectados(resolvidos);
  const atoAtual = prox?.ato ?? 7;
  preCarregarLugar(atoAtual);
  const ato = ATOS[atoAtual]!;
  const marca = el('button', { class: 'marca', title: 'Voltar à capa' });
  marca.innerHTML = 'CAMADA <span>8</span>';
  marca.addEventListener('click', capa);
  const abrir = (e: EntradaCurriculo) => {
    const d = diaDaEntrada(e);
    if (!d) return;
    if (!atosAbertos.includes(e.ato)) aberturaAto(e.ato, () => iniciarDia(d));
    else iniciarDia(d);
  };
  const svg = desenharMapa({ feitos: resolvidos, recente, proximo: prox, aoEscolher: abrir });
  const lista = el('ol', { class: 'lista-dias' });
  for (const e of CURRICULO.filter((x) => x.ato === atoAtual)) {
    const feito = resolvidos.includes(e.numero);
    const pronto = jogavel(e);
    const ehProx = prox?.numero === e.numero;
    const li = el('li', { class: feito ? 'feito' : ehProx ? 'proximo' : pronto ? 'pronto' : 'construcao' }, el('span', { class: 'num' }, String(e.numero)), el('span', {}, e.titulo, el('small', {}, `seção ${e.secao}${pronto ? '' : ' · em construção'}`)));
    if (pronto && (feito || ehProx)) {
      li.setAttribute('tabindex', '0');
      li.addEventListener('click', () => abrir(e));
    }
    lista.append(li);
  }
  const botao = el('button', { class: 'botao' }, prox ? `Ir para o dia ${prox.numero}` : 'Tudo pronto até aqui');
  if (prox) botao.addEventListener('click', () => abrir(prox));
  else botao.setAttribute('disabled', '');
  const lado = el(
    'aside',
    { class: 'mapa-lado' },
    el('div', { class: 'topo' }, marca),
    el('div', { class: 'etiqueta' }, `Ato ${ato.numero} · ${ato.tema}`),
    el('h2', {}, ato.nome),
    el('p', { class: 'nota' }, `${resolvidos.filter((n) => n > 0).length} de ${CURRICULO.length - 1} dias · ${lugares} lugares e ${casas} casas conectados`),
    botao,
    lista,
  );
  app.replaceChildren(el('main', { class: 'mapa-tela' }, el('div', { class: 'mapa-area' }, svg), lado));
  queueMicrotask(() => botao.focus());
}

function aberturaAto(n: number, depois: () => void) {
  const ato = ATOS[n]!;
  tocar('abertura');
  const seguir = el('button', { class: 'botao' }, 'Começar o ato');
  seguir.addEventListener('click', () => {
    if (!atosAbertos.includes(n)) atosAbertos = [...atosAbertos, n];
    gravarEstado();
    depois();
  });
  const fundo = el('div', { class: 'abertura-mapa' }, desenharMapa({ feitos: resolvidos, aoEscolher: () => {} }));
  app.replaceChildren(el('main', { class: 'abertura' }, fundo, el('div', { class: 'abertura-texto' }, el('div', { class: 'etiqueta' }, `Ato ${ato.numero} · ${ato.tema}`), el('h1', {}, ato.nome), el('p', { class: 'onde-ato' }, `Onde: ${ato.lugar}`), ...ato.abertura.map((p) => el('p', {}, p)), seguir)));
  queueMicrotask(() => seguir.focus());
}

function iniciarDia(dia: Dia) {
  sairDo3d();
  ambiente(null);
  const temAula = !!dia.aula;
  const seguir = el('button', { class: 'botao' }, temAula ? 'Assistir à aula' : 'Ir para a prática');
  const pular = el('button', { class: 'botao fantasma' }, 'Pular para a prática');
  const irPratica = () => abrirDia(dia.numero);
  seguir.addEventListener('click', () => {
    if (!temAula) return irPratica();
    const raiz = el('main', { class: 'tela-aula' });
    app.replaceChildren(raiz);
    abrirAula(raiz, `Dia ${dia.numero}: ${dia.titulo}`, dia.aula!, irPratica);
  });
  pular.addEventListener('click', irPratica);
  const voltar = el('button', { class: 'botao fantasma' }, 'Voltar ao mapa');
  voltar.addEventListener('click', () => mapaTela());
  const ato = ATOS[dia.ato]!;
  app.replaceChildren(
    el(
      'main',
      { class: 'carta-tela' },
      el(
        'div',
        { class: 'carta' },
        el('div', { class: 'etiqueta' }, `Ato ${ato.numero} · ${ato.nome} · seção ${dia.secao ?? ''}`),
        el('h1', {}, `Dia ${dia.numero}: ${dia.titulo}`),
        el('div', { class: 'carta-papel' }, ...dia.chamado.map((t) => el('p', {}, t))),
        el('p', { class: 'nota' }, temAula ? 'Primeiro a aula, depois a prática guiada, depois um desafio sem ajuda.' : 'Prática guiada, depois um desafio sem ajuda.'),
        el('div', { class: 'linha-botoes' }, seguir, ...(temAula ? [pular] : []), voltar),
      ),
    ),
  );
  queueMicrotask(() => seguir.focus());
}

function depoisDaPratica(dia: Dia) {
  if (dia.desafio) abrirDesafio(dia);
  else fechamento(dia);
}

function fechamento(dia: Dia) {
  sairDo3d();
  ambiente(null);
  tocar('fimDia');
  if (!resolvidos.includes(dia.numero)) resolvidos = [...resolvidos, dia.numero];
  gravarEstado();
  const doAto = CURRICULO.filter((e) => e.ato === dia.ato && jogavel(e));
  const fechouAto = doAto.every((e) => resolvidos.includes(e.numero));
  const acendeu = [...new Set((dia.luz ?? []).map((l) => nomeDoLugar(lugarDaLuz(l))))];
  const mapa = el('button', { class: 'botao' }, 'Ver o mapa da cidade');
  mapa.addEventListener('click', () => mapaTela(dia.numero));
  app.replaceChildren(
    el(
      'main',
      { class: 'carta-tela' },
      el(
        'div',
        { class: 'carta fim' },
        el('div', { class: 'etiqueta' }, `Dia ${dia.numero} concluído · seção ${dia.secao ?? ''}`),
        el('h1', {}, dia.titulo),
        el('div', { class: 'acendeu' }, el('strong', {}, 'Acendeu no mapa: '), acendeu.join(', ')),
        ...(fechouAto ? [el('div', { class: 'marco' }, el('strong', {}, `Fim do ato ${dia.ato}. `), ATOS[dia.ato]!.marco)] : []),
        el('h3', {}, 'O que você aprendeu'),
        ...dia.posMorte.map((p) => el('p', {}, p)),
        el('div', { class: 'linha-botoes' }, mapa),
      ),
    ),
  );
  queueMicrotask(() => mapa.focus());
}

function abrirDesafio(dia: Dia) {
  const des = dia.desafio!;
  const diaD: Dia = { ...dia, chamado: des.carta, perguntas: des.perguntas ?? [], objetivo: des.objetivo, dicas: des.dicas, passos: [] };
  const term = new Terminal(des.montar(), diaD);
  ambiente(dia.ato);
  let dicas = 0;
  let menuAberto = false;
  let terminou = false;
  const painel = el('div', { class: 'hud-guia desafio' });
  const local = el('div', { class: 'local' });

  const abrirAcoesDesafio = (tipo: TipoAlvo, id: string) => {
    if (menuAberto) return;
    menuAberto = true;
    J.livre = false;
    soltarMouse();
    const e = term.mundo.equipamentos.get(id);
    const c = term.mundo.cabos.get(id);
    abrirMenu({
      titulo: tipo === 'almox' ? 'Almoxarifado' : tipo === 'cabo' ? `Cabo ${id}` : id,
      subtitulo: e ? e.modelo : c ? `${c.a.equip}:${c.a.porta} ⇄ ${c.b.equip}:${c.b.porta} · ${c.meio.toUpperCase()} · ${c.metros} m` : 'o que tem na estante',
      acoes: () => acoesDo(term.mundo, tipo, id).filter((a) => !a.abreConsole),
      classe,
      executar: (a, v) => {
        const f = executarAcao(term, a, v);
        somDosComandos(f);
        if (modo === '3d') atualizarEquipamentos(term.mundo);
        desenhar();
        return f;
      },
      abrirConsole: () => {},
      aoFechar: () => {
        menuAberto = false;
        J.livre = modo === '3d';
        desenhar();
      },
    });
  };

  function desenhar() {
    const itens = des.objetivo(term.mundo);
    const bDica = el('button', { class: 'botao fantasma mini' }, dicas < des.dicas.length ? 'Me dá uma dica' : 'Sem mais dicas');
    bDica.addEventListener('click', () => {
      if (dicas < des.dicas.length) dicas++;
      desenhar();
    });
    const perguntas = (des.perguntas ?? []).map((p) => {
      const resp = term.mundo.respostas[p.id];
      const certa = resp !== undefined && p.confere(resp, term.mundo);
      const entrada = el('input', { value: resp ?? '', placeholder: 'sua resposta', autocomplete: 'off', spellcheck: 'false' });
      const f = el('form', { class: 'pergunta' + (certa ? ' certa' : resp !== undefined ? ' errada' : '') }, el('p', {}, p.texto), el('div', { class: 'linha-botoes' }, entrada, el('button', { class: 'botao mini', type: 'submit' }, 'Responder')));
      f.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (entrada.value.trim()) {
          term.executar(`responder ${p.id} ${entrada.value.trim()}`);
          tocar(p.confere(term.mundo.respostas[p.id] ?? '', term.mundo) ? 'certo' : 'errado');
        }
        desenhar();
      });
      return f;
    });
    painel.replaceChildren(
      el('h3', {}, 'Desafio · sem seta, sem passo a passo'),
      ...des.carta.map((t) => el('p', { class: 'carta-desafio' }, t)),
      el('ul', { class: 'objetivos' }, ...itens.map((i) => el('li', i.ok ? { class: 'ok' } : {}, el('span', {}, i.texto, ...(i.detalhe ? [el('small', {}, i.detalhe)] : []))))),
      ...perguntas,
      ...des.dicas.slice(0, dicas).map((d, i) => el('p', { class: 'dica' }, `Dica ${i + 1}: ${d}`)),
      el('p', { class: 'onde' }, modo === '3d' ? 'Mire em qualquer aparelho, cabo ou na estante e aperte E.' : 'Escolha um aparelho ou cabo abaixo.'),
      ...(modo === '3d' ? [] : [local]),
      el('div', { class: 'linha-botoes' }, bDica),
    );
    const m = term.mundo;
    const botao = (tipo: TipoAlvo, id: string, txt: string, sub: string) => {
      const b = el('button', { class: 'item-local' }, el('strong', {}, txt), el('small', {}, sub));
      b.addEventListener('click', () => abrirAcoesDesafio(tipo, id));
      return b;
    };
    local.replaceChildren(
      ...[...m.equipamentos.values()].map((e) => botao('equip', e.nome, e.nome, e.modelo)),
      ...[...m.cabos.values()].map((c) => botao('cabo', c.id, `cabo ${c.id}`, `${c.a.equip} ⇄ ${c.b.equip}`)),
      ...(Object.keys(m.catalogo).length ? [botao('almox', 'almox', 'almoxarifado', 'equipamentos para instalar')] : []),
    );
    if (!terminou && itens.every((i) => i.ok)) {
      terminou = true;
      setTimeout(() => fechamento(dia), 900);
    }
  }

  if (modo === 'terminal') {
    sairDo3d();
    app.replaceChildren(el('main', { class: 'jogo desafio-plano' }, el('aside', { class: 'lado' }, el('div', { class: 'etiqueta' }, `Dia ${dia.numero} · desafio`), el('h2', {}, dia.titulo), painel)));
    desenhar();
    return;
  }
  const palco = el('main', { class: 'jogo3d' });
  const mira = el('div', { class: 'mira', 'aria-hidden': 'true' });
  const rotuloAlvo = el('div', { class: 'hud-alvo', hidden: '' });
  const carregando = el('div', { class: 'carregando' }, el('div', { class: 'carregando-leds' }, ...Array.from({ length: 8 }, () => el('i'))), el('p', {}, 'Preparando o desafio...'));
  palco.append(el('div', { class: 'hud-topo' }, el('div', { class: 'hud-titulo' }, `Desafio do dia ${dia.numero}: ${dia.titulo}`), botaoLeve()), painel, mira, rotuloAlvo, el('div', { class: 'hud-dicas' }, 'Clique na cena para olhar · WASD anda · E mostra o que dá para fazer · Esc solta o mouse'), carregando);
  app.replaceChildren(palco);
  avisoDesempenho(palco);
  const canvas = iniciar3d(palco);
  canvas.style.opacity = '0';
  montarSala(term.mundo, ['Desafio', dia.titulo, 'Sem seta hoje'], dia.ato);
  destacar(null);
  iniciarControles(canvas, palco);
  J.livre = true;
  void esperarCarga().then(() => {
    canvas.style.transition = 'opacity 0.5s';
    canvas.style.opacity = '1';
    carregando.classList.add('sumindo');
    setTimeout(() => carregando.remove(), 600);
  });
  let alvoAtual: ReturnType<typeof alvoNaMira> = null;
  M.atualizar.add(() => {
    const a = J.livre ? alvoNaMira() : null;
    alvoAtual = a;
    rotuloAlvo.hidden = !a;
    mira.classList.toggle('ativa', !!a);
    if (a) rotuloAlvo.textContent = `${a.rotulo}  ·  E: o que fazer`;
  });
  teclas3d = (e) => {
    const alvo = e.target as HTMLElement;
    if (alvo?.tagName === 'INPUT' || menuAberto) return;
    if (e.code === 'KeyE' && alvoAtual) {
      e.preventDefault();
      abrirAcoesDesafio(alvoAtual.tipo, alvoAtual.id);
    }
  };
  desenhar();
}

iniciarSom();
montarBotaoSom();
preCarregarLugar(proximaEntrada()?.ato ?? 0);
capa();
