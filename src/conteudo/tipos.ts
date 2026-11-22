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
