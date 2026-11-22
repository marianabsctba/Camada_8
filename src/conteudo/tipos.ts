// Contrato do conteúdo: cada dia monta um mundo, pede um objetivo e explica depois.

import type { Mundo } from '../motor/mundo';

export interface Pergunta {
  id: string;
  texto: string;
  confere: (resposta: string, m: Mundo) => boolean;
}

export interface ItemObjetivo {
  texto: string;
  ok: boolean;
  detalhe?: string;
}

/**
 * Um passo do modo guiado: uma frase do que fazer, o porquê, o objeto que brilha na sala,
 * a ação que roda e, quando há escolha, a conferência que explica o erro.
 */
export interface Passo {
  instrucao: string;
  porque: string;
  /** Objeto que brilha na sala. Passos de pergunta não têm alvo. */
  alvo?: ['equip' | 'cabo' | 'almox', string];
  /** Id da ação (src/motor/acoes.ts). */
  acao?: string;
  /** Id da pergunta do chamado, quando o passo é responder. */
  pergunta?: string;
  /** Campos que a pessoa escolhe; os outros vêm de "valores" ou do padrão da ação. */
  pedir?: string[];
  valores?: Record<string, string>;
  /** Resposta certa, mostrada depois de duas tentativas erradas (e usada pelo robô). */
  exemplo?: Record<string, string>;
  /** true se deu certo; senão, a explicação do que aconteceu. */
  conferir?: (m: Mundo) => true | string;
  /** O que aprender com o que acabou de acontecer. */
  feito: string;
}

export interface Dia {
  numero: number;
  ato: number;
  titulo: string;
  /** O chamado que chega no terminal. */
  chamado: string[];
  /** Manual de bolso: o conceito do dia. */
  manual: { titulo: string; texto: string[] };
  /** Dicas sob demanda, da mais vaga para a mais direta. */
  dicas: string[];
  perguntas?: Pergunta[];
  montar: () => Mundo;
  objetivo: (m: Mundo) => ItemObjetivo[];
  /** O que aconteceu de verdade, depois de resolver. */
  posMorte: string[];
  /** Roteiro do modo guiado. */
  passos?: Passo[];
}

export interface Ato {
  numero: number;
  nome: string;
  tema: string;
}

export const ATOS: Ato[] = [
  { numero: 0, nome: 'Sem Senha', tema: 'Introdução' },
  { numero: 1, nome: 'O Poste', tema: 'Camada física' },
  { numero: 2, nome: 'O Quadro', tema: 'Camada de enlace' },
  { numero: 3, nome: 'O Barramento', tema: 'Subcamada MAC' },
  { numero: 4, nome: 'A Cidade', tema: 'Camada de rede' },
  { numero: 5, nome: 'A Conversa', tema: 'Camada de transporte' },
  { numero: 6, nome: 'O Show', tema: 'Camada de aplicação' },
  { numero: 7, nome: 'O Cerco', tema: 'Segurança' },
];
