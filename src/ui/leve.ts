// Modo leve do 3D: o botão que liga e desliga, e o aviso quando o aparelho não dá conta.
import { definirLeve, M, preferenciaLeve } from '../tres/motor3d';

function texto(b: HTMLButtonElement) {
  b.textContent = M.leve ? 'Leve: sim' : 'Leve: não';
  b.setAttribute('aria-pressed', String(M.leve));
  b.title = M.leve ? 'Modo leve ligado: menos luz, sem sombra, resolução menor' : 'Ligar o modo leve: para computador ou celular mais fraco';
}

/** Botão do topo do 3D que troca o modo leve na hora (a sala se refaz, o dia continua). */
export function botaoLeve(): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hud-botao';
  texto(b);
  b.addEventListener('click', () => {
    definirLeve(!M.leve);
    texto(b);
    b.blur();
  });
  // um ouvinte por botão vivo: o do dia anterior sai quando o botão some da tela
  const ouvir = () => (b.isConnected ? texto(b) : M.aoMudarLeve.delete(ouvir));
  M.aoMudarLeve.add(ouvir);
  return b;
}

/**
 * Quando a cena fica pesada mesmo depois de baixar a resolução, sugere o modo leve, uma vez,
 * para quem ainda não escolheu. A escolha fica gravada.
 */
export function avisoDesempenho(palco: HTMLElement) {
  M.aoPesar = () => {
    if (preferenciaLeve() !== null || !palco.isConnected || palco.querySelector('.aviso-leve')) return;
    const caixa = document.createElement('div');
    caixa.className = 'aviso-leve';
    caixa.setAttribute('role', 'status');
    const p = document.createElement('p');
    p.textContent = `A sala está pesada para este aparelho (${Math.round(M.fps)} quadros por segundo). O modo leve tira sombras e enfeites e deixa tudo mais fluido.`;
    const ligar = document.createElement('button');
    ligar.type = 'button';
    ligar.className = 'botao mini';
    ligar.textContent = 'Ligar o modo leve';
    const manter = document.createElement('button');
    manter.type = 'button';
    manter.className = 'botao fantasma mini';
    manter.textContent = 'Deixar como está';
    ligar.addEventListener('click', () => {
      definirLeve(true);
      caixa.remove();
    });
    manter.addEventListener('click', () => {
      definirLeve(false);
      caixa.remove();
    });
    const linha = document.createElement('div');
    linha.className = 'linha-botoes';
    linha.append(ligar, manter);
    caixa.append(p, linha);
    palco.append(caixa);
  };
}
