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
  /** Número original do dia escrito (antes da renumeração do currículo). */
  ref?: number;
  /** Seção do currículo coberta. */
  secao?: string;
  /** O que acende no mapa da cidade. */
  luz?: string[];
  aula?: Aula;
  desafio?: Desafio;
}

/* ---------- aula ---------- */

export type Visual =
  | { tipo: 'conector'; padrao: 'T568A' | 'T568B' | 'ambos' }
  | { tipo: 'camadas'; camadas: string[]; rotulo?: string }
  | { tipo: 'bits'; antes: string; depois: string; legenda?: string }
  | { tipo: 'janela'; total: number; janela: number; perdido?: number }
  | { tipo: 'calculadora'; formula: 'shannon' | 'nyquist' | 'fspl' | 'fresnel' | 'orcamento' | 'transmissao' | 'unidades' | 'janela' | 'atenuacao' }
  | { tipo: 'tabela'; cabecalho: string[]; linhas: string[][] }
  | { tipo: 'diagrama'; nos: { id: string; rotulo: string; x: number; y: number }[]; ligacoes: [string, string, string?][] }
  | { tipo: 'espectro'; canais: { canal: number; dbm: number; rotulo: string }[] }
  | { tipo: 'sinal'; harmonicos: number };

export interface Cartao {
  titulo: string;
  texto: string[];
  visual?: Visual;
}

export interface Checagem {
  pergunta: string;
  opcoes: string[];
  certa: number;
  explicacao: string;
}

export interface Aula {
  cartoes: Cartao[];
  checagem: Checagem;
}

/* ---------- desafio ---------- */

export interface Desafio {
  /** A carta do desafio: o mesmo conceito, outro problema. */
  carta: string[];
  montar: () => Mundo;
  objetivo: (m: Mundo) => ItemObjetivo[];
  dicas: string[];
  perguntas?: Pergunta[];
  /** Como o robô resolve só clicando: [tipo do alvo, id, ação, valores]. */
  solucao: ['equip' | 'cabo' | 'almox', string, string, Record<string, string>?][];
  /** Respostas das perguntas, para o robô. */
  respostas?: Record<string, string>;
}

export interface Ato {
  numero: number;
  nome: string;
  tema: string;
  lugar: string;
  /** Texto de abertura do ato, contando onde a história está. */
  abertura: string[];
  /** O que acende no mapa ao fechar o ato. */
  marco: string;
}

export const ATOS: Ato[] = [
  {
    numero: 0,
    nome: 'Fim de Linha',
    tema: 'Introdução',
    lugar: 'o galpão do provedor',
    abertura: [
      'Fim de Linha é a última cidade da estrada. Tem escola, hospital, cooperativa, uma represa e nenhuma internet.',
      'A prefeitura cedeu um galpão, um rack vazio e uma caixa de ferramentas para quem topasse ligar a cidade ao mundo. Você topou. Não sabe nada de redes. Ainda.',
      'Neste ato você aprende o que é uma rede, como ela se organiza em camadas e por que tudo isso importa para quem mora aqui.',
    ],
    marco: 'O galpão acende: a Fibra Fim de Linha existe.',
  },
  {
    numero: 1,
    nome: 'A Rua',
    tema: 'Camada física',
    lugar: 'a rua, o poste e a torre',
    abertura: [
      'O galpão está montado. Agora é preciso levar o sinal até as casas: por cobre, por fibra, pelo ar, por satélite.',
      'Neste ato você aprende como um bit vira sinal elétrico, luz ou onda de rádio, e tudo o que atrapalha no caminho.',
    ],
    marco: 'A Rua das Acácias acende: 12 casas online.',
  },
  {
    numero: 2,
    nome: 'A Linha',
    tema: 'Camada de enlace',
    lugar: 'a central telefônica antiga',
    abertura: [
      'Os sinais chegam. Mas chegam com erros, misturados, sem começo nem fim. A prefeitura liberou a central telefônica antiga para virar o coração dos enlaces.',
      'Neste ato você aprende a cortar o fluxo de bits em quadros, a perceber e corrigir erros e a retransmitir o que se perdeu.',
    ],
    marco: 'O enlace até a cidade vizinha liga: Fim de Linha conversa com o mundo pela primeira vez.',
  },
  { numero: 3, nome: 'O Bairro', tema: 'Subcamada MAC', lugar: 'o prédio, a escola e a praça', abertura: ['Muita gente quer usar o mesmo meio ao mesmo tempo.'], marco: 'O bairro inteiro acende, com Wi-Fi na praça.' },
  { numero: 4, nome: 'A Cidade', tema: 'Camada de rede', lugar: 'o data center municipal', abertura: ['Os bairros precisam se enxergar, e a cidade precisa de rota para fora.'], marco: 'Todos os bairros se enxergam, e a cidade tem rota para o mundo.' },
  { numero: 5, nome: 'A Conversa', tema: 'Camada de transporte', lugar: 'a sala dos servidores', abertura: ['As conexões precisam ser rápidas, justas e confiáveis.'], marco: 'Videochamada estável no hospital.' },
  { numero: 6, nome: 'O Show', tema: 'Camada de aplicação', lugar: 'o estádio no dia da final', abertura: ['A cidade inteira vai assistir à final ao vivo.'], marco: 'Fim de Linha inteira assiste ao jogo ao vivo.' },
  { numero: 7, nome: 'O Cerco', tema: 'Segurança', lugar: 'o centro de operações, à noite', abertura: ['Agora que a cidade importa, alguém quer derrubá-la.'], marco: 'Fim de Linha vira ponto de troca de tráfego.' },
];
