// Executor do modo guiado: roda um passo e diz se deu certo, explicando quando não deu.

import { acoesDo, executarAcao, padroes } from '../motor/acoes';
import type { Terminal } from '../motor/cli';
import type { Dia, Passo } from './tipos';

export interface Feito {
  comando: string;
  prompt: string;
  saida: string[];
}

export interface ResultadoPasso {
  ok: true | string;
  feito: Feito[];
}

/** Campos que o passo pede, com rótulo e opções vindos da ação (ou a resposta, numa pergunta). */
export function camposDoPasso(t: Terminal, passo: Passo) {
  if (passo.pergunta) return [{ nome: 'resposta', rotulo: 'Sua resposta', tipo: 'texto' as const }];
  const acao = acaoDoPasso(t, passo);
  return (acao?.campos ?? []).filter((c) => passo.pedir?.includes(c.nome));
}

export function acaoDoPasso(t: Terminal, passo: Passo) {
  if (!passo.alvo || !passo.acao) return undefined;
  return acoesDo(t.mundo, passo.alvo[0], passo.alvo[1]).find((a) => a.id === passo.acao);
}

export function executarPasso(t: Terminal, dia: Dia, passo: Passo, escolhas: Record<string, string>): ResultadoPasso {
  if (passo.pergunta) {
    const p = dia.perguntas?.find((x) => x.id === passo.pergunta);
    const r = (escolhas.resposta ?? '').trim();
    if (!p || !r) return { ok: 'Escreva uma resposta.', feito: [] };
    const prompt = t.prompt();
    const saida = t.executar(`responder ${p.id} ${r}`);
    const certa = p.confere(r, t.mundo);
    return { ok: certa || 'Ainda não. Refaça a conta com a explicação do passo.', feito: [{ comando: `responder ${p.id} ${r}`, prompt, saida }] };
  }
  const acao = acaoDoPasso(t, passo);
  if (!acao) return { ok: 'Isso não dá para fazer agora. Recomece o dia se algo saiu da ordem.', feito: [] };
  const valores = { ...padroes(acao), ...(passo.valores ?? {}), ...escolhas };
  const feito = executarAcao(t, acao, valores);
  return { ok: passo.conferir ? passo.conferir(t.mundo) : true, feito };
}
