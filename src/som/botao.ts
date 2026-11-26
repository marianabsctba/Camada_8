// Botão de som, sempre visível no canto: mudo, volume e "só efeitos". Guarda tudo em camada8.som.

import { ajustarSom, aoMudarSom, preferenciasSom, tocar, type PreferenciasSom } from './som';

const ESTILO = `
.som-botao{position:fixed;right:12px;bottom:12px;z-index:70;font-family:var(--corpo,system-ui,sans-serif)}
.som-botao>button{width:38px;height:38px;border-radius:50%;border:1px solid var(--linha,#243241);background:var(--painel,#111922);color:var(--texto,#d8e1ea);display:grid;place-items:center;cursor:pointer;opacity:.85}
.som-botao>button:hover,.som-botao>button:focus-visible{opacity:1;border-color:var(--laranja,#ff7a1a)}
.som-botao svg{width:20px;height:20px}
.som-painel{position:absolute;right:0;bottom:46px;width:220px;padding:12px;border:1px solid var(--linha,#243241);border-radius:8px;background:var(--painel,#111922);color:var(--texto,#d8e1ea);display:grid;gap:10px;font-size:14px;box-shadow:0 8px 24px #0008}
.som-painel[hidden]{display:none}
.som-painel label{display:flex;align-items:center;gap:8px;cursor:pointer}
.som-painel input[type=range]{flex:1;accent-color:var(--laranja,#ff7a1a)}
.som-painel input[type=checkbox]{accent-color:var(--laranja,#ff7a1a)}
.som-painel strong{font-family:var(--titulo,sans-serif);letter-spacing:.04em;text-transform:uppercase;font-size:13px;color:var(--apagado,#8193a6)}
`;

const ICONE_LIGADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICONE_MUDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

export function montarBotaoSom(): void {
  if (typeof document === 'undefined' || document.querySelector('.som-botao')) return;
  const estilo = document.createElement('style');
  estilo.textContent = ESTILO;
  document.head.append(estilo);

  const raiz = document.createElement('div');
  raiz.className = 'som-botao';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.setAttribute('aria-haspopup', 'true');
  botao.setAttribute('aria-expanded', 'false');
  const painel = document.createElement('div');
  painel.className = 'som-painel';
  painel.hidden = true;
  painel.setAttribute('role', 'group');
  painel.setAttribute('aria-label', 'Som');
  painel.innerHTML = `<strong>Som</strong>
    <label><input type="checkbox" data-c="mudo"> Mudo</label>
    <label>Volume <input type="range" min="0" max="100" step="5" data-c="volume" aria-label="Volume"></label>
    <label><input type="checkbox" data-c="soEfeitos"> Só efeitos (sem o som do lugar)</label>`;
  const mudo = painel.querySelector<HTMLInputElement>('[data-c=mudo]')!;
  const volume = painel.querySelector<HTMLInputElement>('[data-c=volume]')!;
  const so = painel.querySelector<HTMLInputElement>('[data-c=soEfeitos]')!;

  const mostrar = (p: PreferenciasSom) => {
    botao.innerHTML = p.mudo || p.volume === 0 ? ICONE_MUDO : ICONE_LIGADO;
    const rot = p.mudo ? 'Som desligado' : `Som ligado, volume ${Math.round(p.volume * 100)} %`;
    botao.title = rot + ' (clique para ajustar)';
    botao.setAttribute('aria-label', rot);
    mudo.checked = p.mudo;
    volume.value = String(Math.round(p.volume * 100));
    so.checked = p.soEfeitos;
  };
  mostrar(preferenciasSom());
  aoMudarSom(mostrar);

  // as teclas do painel não podem virar comandos do jogo (WASD, E, P)
  painel.addEventListener('keydown', (e) => e.stopPropagation());
  mudo.addEventListener('change', () => ajustarSom({ mudo: mudo.checked }));
  volume.addEventListener('input', () => ajustarSom({ volume: Number(volume.value) / 100, mudo: false }));
  volume.addEventListener('change', () => tocar('beep'));
  so.addEventListener('change', () => ajustarSom({ soEfeitos: so.checked }));

  const alternar = (abrir = painel.hidden) => {
    painel.hidden = !abrir;
    botao.setAttribute('aria-expanded', String(abrir));
  };
  botao.addEventListener('click', () => alternar());
  document.addEventListener('pointerdown', (e) => {
    if (!painel.hidden && !raiz.contains(e.target as Node)) alternar(false);
  });
  raiz.append(painel, botao);
  document.body.append(raiz);
}
