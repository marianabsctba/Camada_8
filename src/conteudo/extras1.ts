// Aula e desafio dos dias do ato 1 (A Rua), por número original do dia.

import { wiremap } from '../motor/fisico';
import { avaliar, coaxDados, radioDados } from '../motor/fisico';
import { avaliarE1, avaliarModem, snrWifi, type UsoSlot } from '../motor/aparelhos';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, TRANSCEPTORES, type Equipamento } from '../motor/mundo';
import { lerCidr, LUZ } from '../motor/util';
import { taxaClienteWifi } from './ato1';
import { enlace, item, numerica, pingOk, respondida, todasRespondidas } from './comum';
import type { Extra } from './extras';
import type { Pergunta } from './tipos';

const ORDEM_DE_PAR = ['branco-laranja', 'laranja', 'branco-verde', 'verde', 'branco-azul', 'azul', 'branco-marrom', 'marrom'] as const;
const T568B = 'branco-laranja laranja branco-verde azul branco-azul verde branco-marrom marrom';
const T568A_PINOS = ['branco-verde', 'verde', 'branco-laranja', 'azul', 'branco-azul', 'laranja', 'branco-marrom', 'marrom'] as const;

const ip = (s: string) => lerCidr(s)!;
const sfp = (e: Equipamento, porta: string, modelo: string) => {
  e.portas.find((p) => p.nome === porta)!.sfp = { ...TRANSCEPTORES[modelo]! };
  return e;
};
const margemTexto = (e: ReturnType<typeof enlace>) => (e.up ? `margem ${e.margemDb.toFixed(1)} dB` : e.motivos[0]);

/* Perguntas dos desafios. */
const p10: Pergunta[] = [numerica('1', 'Qual a perda total do enlace c1 em 1550 nm, em dB? (fibra, 4 conectores e 20 emendas)', 80 * 0.22 + 4 * 0.5 + 20 * 0.1, 0.1)];
const p11: Pergunta[] = [numerica('1', 'O eco da emenda ruim volta 18,36 µs depois do pulso. Com índice de grupo 1,468, a quantos metros ela está?', 1875, 5)];
const p13: Pergunta[] = [numerica('1', 'Qual a capacidade de Shannon desta linha (2400 Hz, 24 dB), em kb/s?', (2400 * Math.log2(1 + 10 ** 2.4)) / 1000, 0.3)];
const p14: Pergunta[] = [numerica('1', 'Com 18 canais de voz, quantos kb/s sobram para dados no E1?', 768, 0)];
const p15: Pergunta[] = [numerica('1', 'Qual o raio da 1ª zona de Fresnel no meio do enlace de 14 km a 5,8 GHz, em metros?', 8.657 * Math.sqrt(14 / 5.8), 0.2)];
const p16: Pergunta[] = [
  numerica('1', 'Qual a frequência central, em MHz, do único canal que serve na sorveteria?', 2472, 0),
  {
    id: '2',
    texto: 'Dois APs com o mesmo SSID, cada um com o seu BSSID, ligados pelo mesmo switch: que sigla o 802.11 dá a esse conjunto?',
    confere: (r) => /^\s*(o\s+|um\s+)?ess\b/i.test(r) || /conjunto (de servi[çc]o )?estendido/i.test(r),
  },
];
const p18: Pergunta[] = [numerica('1', 'Quanto tempo a luz leva para subir até um satélite de órbita média (8.062 km) e descer de volta, em ms?', ((2 * 8062e3) / LUZ) * 1000, 1)];

export const EXTRAS1: Record<number, Extra> = {
  /* ---------- Crimpa direito (2.1.2) ---------- */
  5: {
    aula: {
      cartoes: [
        {
          titulo: 'Quatro pares, oito fios',
          texto: ['O cabo de rede tem quatro pares de fios de cobre: laranja, verde, azul e marrom. Cada par tem um fio colorido e um branco listrado da mesma cor.', 'Os dois fios de um par são trançados um no outro, e o conector RJ45 tem oito pinos, um para cada fio.'],
          visual: { tipo: 'conector', padrao: 'T568B' },
        },
        {
          titulo: 'Por que trançar',
          texto: [
            'O ruído elétrico que chega num fio do par chega quase igual no outro. O receptor não lê cada fio: lê a diferença entre os dois. Ruído igual nos dois fios some na subtração.',
            'Por isso os dois fios de um par precisam ficar juntos até o fim, nos pinos que o padrão reservou para eles.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Pinos', 'Par no T568B'],
            linhas: [
              ['1 e 2', 'laranja'],
              ['3 e 6', 'verde'],
              ['4 e 5', 'azul'],
              ['7 e 8', 'marrom'],
            ],
          },
        },
        {
          titulo: 'T568A e T568B',
          texto: ['Existem dois padrões de ordem. O T568B é o mais comum no Brasil. O T568A só troca o par laranja com o verde.', 'Cabo direto: o mesmo padrão nas duas pontas. Cabo cruzado: um padrão em cada ponta.'],
          visual: { tipo: 'conector', padrao: 'ambos' },
        },
        {
          titulo: 'O erro mais caro: o par dividido',
          texto: [
            'Crimpar as cores "em ordem de par" (branco-laranja, laranja, branco-verde, verde...) parece organizado, mas põe o branco-verde no pino 3 e o verde no pino 4. O par verde fica dividido entre os pinos 3 e 4 em vez de 3 e 6.',
            'Se as duas pontas tiverem o mesmo erro, o testador barato mostra tudo certo, porque cada pino chega no seu par do outro lado. Mas o trançado não protege mais nada, e o gigabit cai.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Ferramenta', 'O que vê', 'Pega par dividido?'],
            linhas: [
              ['testador de continuidade', 'qual pino chega em qual', 'não'],
              ['certificador', 'comprimento, diafonia, margem', 'sim'],
            ],
          },
        },
      ],
      checagem: { pergunta: 'No T568B, em quais pinos fica o par verde?', opcoes: ['1 e 2', '3 e 6', '4 e 5', '7 e 8'], certa: 1, explicacao: 'O par verde fica nos pinos 3 e 6, separados pelo par azul (4 e 5). É exatamente aí que a ordem de par erra.' },
    },
    desafio: {
      carta: [
        'A casa 7, vizinha da que você acabou de ligar, reclama que a internet "não passa de 100 mega" num plano de 1 giga.',
        'O cabo c1 foi crimpado pelo mesmo técnico apressado, nas duas pontas.',
        'Objetivo: c1 ativo a 1 Gb/s e aprovado no certificador.',
      ],
      dicas: ['Passe o testador e depois o certificador: um vê o problema, o outro não.', 'As duas pontas estão na mesma ordem errada.', 'Crimpe as duas pontas no padrão T568B.'],
      montar: () => {
        const m = novoMundo(1505);
        adicionar(m, pc('casa7', { modelo: 'PC da casa 7', ip: lerCidr('192.0.2.67/24')! }));
        adicionar(m, comutador('sw-poste', { modelo: 'Switch de poste SP-8' }));
        ligar(m, { equip: 'casa7', porta: 'eth0' }, { equip: 'sw-poste', porta: 'p1' }, 'cat5e', 22, { id: 'c1', pinosA: [...ORDEM_DE_PAR], pinosB: [...ORDEM_DE_PAR] });
        m.proxCabo = 2;
        return m;
      },
      objetivo: (m) => {
        const c = m.cabos.get('c1')!;
        const e = avaliar(m, c);
        const w = wiremap(c.pinosA!, c.pinosB!);
        return [item('c1 ativo a 1 Gb/s', e.up && e.velocidade === 1000, e.up ? `${e.velocidade} Mb/s` : e.motivos[0]), item('aprovado no certificador (sem par dividido)', !w.parDividido && e.up && e.margemDb >= 6)];
      },
      solucao: [
        ['cabo', 'c1', 'crimpar', { ponta: 'a', cores: T568B }],
        ['cabo', 'c1', 'crimpar', { ponta: 'b', cores: T568B }],
      ],
    },
  },

  /* ---------- Cruzado ou direto ---------- */
  6: {
    aula: {
      cartoes: [
        {
          titulo: 'Quem fala e quem escuta',
          texto: [
            'No 10BASE-T e no 100BASE-TX, só dois pares trabalham: um para transmitir e outro para receber. Os pinos 1 e 2 formam um par, os pinos 3 e 6 formam o outro.',
            'A placa de rede de um PC é MDI: transmite em 1 e 2 e escuta em 3 e 6. A porta de um switch é MDI-X: faz o contrário, porque já vem cruzada por dentro.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Porta', 'Transmite em', 'Recebe em'],
            linhas: [
              ['MDI (placa de PC)', '1 e 2', '3 e 6'],
              ['MDI-X (porta de switch)', '3 e 6', '1 e 2'],
            ],
          },
        },
        {
          titulo: 'Cabo direto e cabo cruzado',
          texto: [
            'Cabo direto tem o mesmo padrão nas duas pontas: o pino 1 chega no pino 1. Cabo cruzado tem T568A numa ponta e T568B na outra: os pares laranja e verde trocam de lugar, e os pinos 1 e 2 de um lado chegam nos pinos 3 e 6 do outro.',
          ],
          visual: { tipo: 'conector', padrao: 'ambos' },
        },
        {
          titulo: 'A regra sem auto-MDIX',
          texto: [
            'Portas de tipos diferentes (MDI com MDI-X) usam cabo direto: o cruzamento já está dentro do switch. Portas do mesmo tipo precisam de cabo cruzado, senão transmissor fala com transmissor e ninguém escuta.',
            'Cruzar onde não precisa é tão ruim quanto não cruzar onde precisa: os dois cruzamentos se desfazem.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Ligação', 'Cabo'],
            linhas: [
              ['PC com switch', 'direto'],
              ['switch com switch', 'cruzado (ou porta uplink)'],
              ['PC com PC', 'cruzado'],
            ],
          },
        },
        {
          titulo: 'Auto-MDIX e a porta uplink',
          texto: [
            'Switch antigo tinha uma porta "uplink", que é MDI de propósito, para ligar em outro switch com cabo direto.',
            'Hoje quase toda porta tem auto-MDIX: descobre sozinha de que lado está e cruza por dentro. No gigabit os quatro pares transmitem e recebem juntos, e isso virou obrigatório. Mas equipamento velho não lê manual novo.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'pc', rotulo: 'PC (MDI)', x: 80, y: 60 },
              { id: 'sw1', rotulo: 'switch (MDI-X)', x: 300, y: 60 },
              { id: 'sw2', rotulo: 'switch (MDI-X)', x: 520, y: 60 },
              { id: 'pc2', rotulo: 'PC (MDI)', x: 80, y: 190 },
              { id: 'pc3', rotulo: 'PC (MDI)', x: 520, y: 190 },
            ],
            ligacoes: [
              ['pc', 'sw1', 'direto'],
              ['sw1', 'sw2', 'cruzado'],
              ['pc2', 'pc3', 'cruzado'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'Sem auto-MDIX, que cabo liga a placa de um PC a uma porta comum de switch?',
        opcoes: ['Direto: T568B nas duas pontas', 'Cruzado: T568A numa ponta e T568B na outra', 'Qualquer um, a placa se ajusta', 'Nenhum, precisa de porta uplink'],
        certa: 0,
        explicacao: 'PC é MDI e porta de switch é MDI-X. Tipos diferentes usam cabo direto, porque o switch já cruza por dentro.',
      },
    },
    desafio: {
      carta: [
        'No posto de saúde, o PC da recepção não conversa com o PC da farmácia. O switch é de 2003 e não tem auto-MDIX.',
        'Quem passou o cabo c1 da recepção ouviu dizer que "cabo bom é cabo cruzado" e caprichou.',
        'Objetivo: c1 ativo e a recepção pingando a farmácia.',
      ],
      dicas: [
        'Veja de que tipo é cada porta nas duas pontas do c1: uma é do PC, a outra é do switch.',
        'MDI com MDI-X pede cabo direto. Passe o testador: o c1 está cruzado.',
        'Crimpe a ponta da recepção em T568B, igual à outra ponta.',
      ],
      montar: () => {
        const m = novoMundo(1506);
        adicionar(m, pc('pc-recepcao', { ip: ip('192.0.2.110/24'), modelo: 'PC da recepção' }));
        adicionar(m, pc('pc-farmacia', { ip: ip('192.0.2.120/24'), modelo: 'PC da farmácia' }));
        adicionar(m, comutador('sw-posto', { modelo: 'Switch 10/100 de 2003, sem auto-MDIX', velocidades: [10, 100], mdix: false, uplink: true }));
        ligar(m, { equip: 'pc-recepcao', porta: 'eth0' }, { equip: 'sw-posto', porta: 'p1' }, 'cat5e', 18, { id: 'c1', pinosA: [...T568A_PINOS], nota: '"cabo bom é cabo cruzado"' });
        ligar(m, { equip: 'pc-farmacia', porta: 'eth0' }, { equip: 'sw-posto', porta: 'p2' }, 'cat5e', 9, { id: 'c2' });
        m.proxCabo = 3;
        return m;
      },
      objetivo: (m) => {
        const e = enlace(m, 'c1');
        return [item('c1 ativo', e.up, e.up ? `${e.velocidade} Mb/s` : e.motivos[0]), pingOk(m, 'pc-recepcao', '192.0.2.120')];
      },
      solucao: [
        ['cabo', 'c1', 'crimpar', { ponta: 'a', cores: T568B }],
        ['equip', 'pc-recepcao', 'ping', { destino: '192.0.2.120', n: '4' }],
      ],
    },
  },

  /* ---------- 100 metros ---------- */
  7: {
    aula: {
      cartoes: [
        {
          titulo: 'Todo sinal cansa',
          texto: [
            'Todo meio atenua: o sinal perde energia a cada metro. No par trançado a perda cresce com a frequência, e o gigabit usa frequências altas.',
            'Neste jogo, um enlace de cobre de até 100 m tem 20 dB de margem. Cada metro além dos 100 come 1 dB. Mexa no comprimento e veja a margem sumir.',
          ],
          visual: { tipo: 'calculadora', formula: 'atenuacao' },
        },
        {
          titulo: 'O canal de 100 m',
          texto: ['O padrão de cabeamento garante o desempenho num canal de até 100 m: o cabo fixo na parede mais os cordões das pontas. Dentro disso, a relação sinal-ruído está garantida. Fora, é sorte.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Trecho', 'Até'],
            linhas: [
              ['cabo fixo (enlace permanente)', '90 m'],
              ['cordões nas duas pontas', '10 m'],
              ['canal inteiro', '100 m'],
            ],
          },
        },
        {
          titulo: 'Regenerar não é amplificar',
          texto: [
            'Um switch no meio do caminho não aumenta o volume: ele lê cada bit, decide se é 0 ou 1 e transmite de novo, limpo e com potência cheia. O ruído do primeiro trecho morre ali.',
            'Cada trecho ganha de novo os seus 100 m. O custo é ter energia e abrigo no meio do caminho.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'a', rotulo: 'escritório', x: 70, y: 120 },
              { id: 'sw', rotulo: 'switch no meio', x: 300, y: 120 },
              { id: 'b', rotulo: 'galpão', x: 530, y: 120 },
            ],
            ligacoes: [
              ['a', 'sw', '65 m'],
              ['sw', 'b', '65 m'],
            ],
          },
        },
        {
          titulo: 'Quando o caminho é longo',
          texto: ['Esticar o cabo nunca é a resposta. Divida o caminho em trechos de até 100 m ou mude de meio: a fibra vai a quilômetros sem regenerar.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Distância', 'Saída'],
            linhas: [
              ['até 100 m', 'um cabo de cobre'],
              ['de 100 a 200 m', 'um switch no meio'],
              ['de 200 a 300 m', 'dois switches no meio, ou fibra'],
              ['acima disso', 'fibra'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'Um cabo de cobre de 160 m liga dois prédios. Qual a saída dentro do padrão?',
        opcoes: ['Trocar por Cat6a, que aguenta mais', 'Pôr um switch no meio e fazer dois trechos de 80 m', 'Usar cabo blindado', 'Aumentar a potência da placa de rede'],
        certa: 1,
        explicacao: 'Categoria e blindagem não mudam o limite de 100 m do canal. Um switch no meio regenera o sinal e cada trecho fica dentro do padrão.',
      },
    },
    desafio: {
      carta: [
        'O estádio municipal quer uma câmera no portão norte. O cabo c2 sai do switch do vestiário e corre 210 m pela arquibancada até ela.',
        'No almoxarifado tem dois switches de trilho DIN com caixa hermética. A câmera não liga a imagem nem por decreto.',
        'Objetivo: a câmera respondendo 100 pings do vestiário sem perda, sem nenhum cabo de cobre acima de 100 m.',
      ],
      dicas: [
        'Faça a conta: em quantos trechos de até 100 m cabem 210 m?',
        'Um switch no meio só não basta: sobrariam trechos de 105 m.',
        'Tire o c2, instale dois switches e passe três cabos de 70 m: vestiário, switch, switch, câmera.',
      ],
      montar: () => {
        const m = novoMundo(1507);
        adicionar(m, pc('pc-vestiario', { ip: ip('192.0.2.40/24'), modelo: 'PC do vestiário, com adesivo do time' }));
        adicionar(m, pc('cam-portao', { ip: ip('192.0.2.41/24'), modelo: 'Câmera IP do portão norte' }));
        adicionar(m, comutador('sw-vestiario', { modelo: 'Switch de mesa 8 portas' }));
        ligar(m, { equip: 'pc-vestiario', porta: 'eth0' }, { equip: 'sw-vestiario', porta: 'p1' }, 'cat6', 4, { id: 'c1' });
        ligar(m, { equip: 'sw-vestiario', porta: 'p2' }, { equip: 'cam-portao', porta: 'eth0' }, 'cat6', 210, { id: 'c2', nota: 'amarrado na grade da arquibancada' });
        m.proxCabo = 3;
        m.catalogo['switch-din'] = { descricao: 'switch industrial 8 portas de trilho DIN, com fonte e caixa hermética', criar: (n) => comutador(n, { modelo: 'Switch industrial DIN-8' }) };
        return m;
      },
      objetivo: (m) => {
        const longos = [...m.cabos.values()].filter((c) => c.meio.startsWith('cat') && c.metros > 100);
        return [item('nenhum cabo de cobre acima de 100 m', longos.length === 0, longos.map((c) => `${c.id}: ${c.metros} m`).join(', ') || undefined), pingOk(m, 'pc-vestiario', '192.0.2.41', 100, 0)];
      },
      solucao: [
        ['cabo', 'c2', 'desligar'],
        ['almox', 'almox', 'instalar', { modelo: 'switch-din', nome: 'sw-arquibancada' }],
        ['almox', 'almox', 'instalar', { modelo: 'switch-din', nome: 'sw-portao' }],
        ['equip', 'sw-vestiario', 'cabo-novo', { porta: 'p2', destino: 'sw-arquibancada:p1', meio: 'cat6', metros: '70' }],
        ['equip', 'sw-arquibancada', 'cabo-novo', { porta: 'p2', destino: 'sw-portao:p1', meio: 'cat6', metros: '70' }],
        ['equip', 'sw-portao', 'cabo-novo', { porta: 'p2', destino: 'cam-portao:eth0', meio: 'cat6', metros: '70' }],
        ['equip', 'pc-vestiario', 'ping', { destino: '192.0.2.41', n: '100' }],
      ],
    },
  },

  /* ---------- Categorias de cabo ---------- */
  8: {
    aula: {
      cartoes: [
        {
          titulo: 'Categoria é frequência',
          texto: ['A categoria diz até que frequência o cabo foi testado. Quanto mais alta a frequência que ele aguenta, mais bits por segundo cabem nele.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Categoria', 'Testado até', 'Aguenta'],
            linhas: [
              ['Cat5e', '100 MHz', '1 Gb/s até 100 m'],
              ['Cat6', '250 MHz', '1 Gb/s até 100 m; 10 Gb/s só até 55 m'],
              ['Cat6a', '500 MHz', '10 Gb/s até 100 m'],
            ],
          },
        },
        {
          titulo: 'Mais bits pedem mais banda',
          texto: [
            'Um sinal digital de bordas retas é a soma de muitas senoides: a fundamental e os harmônicos, cada vez mais rápidos. Cabo que não passa as frequências altas corta os harmônicos e arredonda as bordas.',
            'Quanto mais rápido o enlace, mais alto vão os harmônicos que importam. Arraste e veja a onda ficar quadrada.',
          ],
          visual: { tipo: 'sinal', harmonicos: 3 },
        },
        {
          titulo: 'O vizinho que fala alto',
          texto: [
            'No 10 Gb/s, um cabo escuta o sinal dos cabos que correm ao lado dele no mesmo feixe. É a diafonia entre cabos (alien crosstalk).',
            'O Cat6 não foi projetado para isso, e por isso só garante 10 Gb/s até 55 m. O Cat6a tem separador, trança mais apertada e capa mais grossa para chegar aos 100 m.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'a', rotulo: 'cabo A', x: 120, y: 70 },
              { id: 'b', rotulo: 'cabo B', x: 120, y: 170 },
              { id: 'ra', rotulo: 'receptor A', x: 480, y: 70 },
              { id: 'rb', rotulo: 'receptor B', x: 480, y: 170 },
            ],
            ligacoes: [
              ['a', 'ra', 'sinal'],
              ['b', 'rb', 'sinal'],
              ['b', 'ra', 'diafonia'],
            ],
          },
        },
        {
          titulo: 'A negociação silenciosa',
          texto: ['Ao ligar, as duas portas combinam a maior velocidade que elas e o cabo sustentam. Se o cabo não aguenta, o enlace sobe mais devagar e ninguém avisa: você descobre no gráfico.', 'Regra de ouro: categoria se escolhe pela velocidade e pela distância, nunca pelo preço do rolo.'],
        },
      ],
      checagem: {
        pergunta: 'Enlace de 10 Gb/s com 70 m de cabo. Qual a categoria mínima?',
        opcoes: ['Cat5e', 'Cat6', 'Cat6a', 'Qualquer uma, a placa compensa'],
        certa: 2,
        explicacao: 'Cat6 só garante 10 Gb/s até 55 m. Com 70 m, só o Cat6a mantém os 10 Gb/s.',
      },
    },
    desafio: {
      carta: [
        'A biblioteca pública ganhou um núcleo de 10 Gb/s. O servidor do acervo digital fica a 40 m (cabo c1) e o laboratório de informática a 90 m (cabo c2). Os dois subiram a 1 Gb/s, em Cat5e.',
        'No almoxarifado só sobrou Cat6a para um cabo. Cat6 tem de sobra.',
        'Objetivo: c1 e c2 ativos a 10 Gb/s, com no máximo um cabo em Cat6a.',
      ],
      dicas: [
        'Leia os dois cabos e compare cada distância com o alcance de cada categoria.',
        'Cat6 leva 10 Gb/s até 55 m. Qual dos dois cabos cabe nisso?',
        'Troque o c1 por Cat6 e o c2 por Cat6a.',
      ],
      montar: () => {
        const m = novoMundo(1508);
        adicionar(m, comutador('sw-nucleo', { modelo: 'Switch de núcleo 10G da biblioteca', velocidades: [1000, 10000] }));
        adicionar(m, pc('acervo', { ip: ip('192.0.2.80/24'), modelo: 'Servidor do acervo digital', velocidades: [1000, 10000], mdix: true }));
        adicionar(m, pc('lab', { ip: ip('192.0.2.81/24'), modelo: 'Servidor do laboratório de informática', velocidades: [1000, 10000], mdix: true }));
        ligar(m, { equip: 'sw-nucleo', porta: 'p1' }, { equip: 'acervo', porta: 'eth0' }, 'cat5e', 40, { id: 'c1' });
        ligar(m, { equip: 'sw-nucleo', porta: 'p2' }, { equip: 'lab', porta: 'eth0' }, 'cat5e', 90, { id: 'c2' });
        m.proxCabo = 3;
        return m;
      },
      objetivo: (m) => {
        const a = enlace(m, 'c1');
        const b = enlace(m, 'c2');
        const cat6a = [...m.cabos.values()].filter((c) => c.meio === 'cat6a').length;
        const t = (e: ReturnType<typeof enlace>) => (e.up ? `${e.velocidade} Mb/s` : e.motivos[0]);
        return [item('c1 ativo a 10 Gb/s', a.up && a.velocidade === 10000, t(a)), item('c2 ativo a 10 Gb/s', b.up && b.velocidade === 10000, t(b)), item('no máximo um cabo em Cat6a', cat6a <= 1, `${cat6a} em Cat6a`)];
      },
      solucao: [
        ['cabo', 'c1', 'trocar', { meio: 'cat6', blindado: 'nao' }],
        ['cabo', 'c2', 'trocar', { meio: 'cat6a', blindado: 'nao' }],
      ],
    },
  },

  /* ---------- Ruído, blindagem e aterramento ---------- */
  9: {
    aula: {
      cartoes: [
        {
          titulo: 'De onde vem o ruído',
          texto: [
            'Motores, inversores de frequência e reatores de lâmpada criam campos que induzem tensão em qualquer condutor por perto. Para o cabo de rede, isso é ruído somado ao sinal.',
            'Quanto mais forte a fonte e mais colado o cabo, mais ruído entra.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'm', rotulo: 'motor', x: 300, y: 50 },
              { id: 'a', rotulo: 'switch', x: 80, y: 180 },
              { id: 'b', rotulo: 'PC', x: 520, y: 180 },
            ],
            ligacoes: [
              ['a', 'b', 'sinal + ruído'],
              ['m', 'a', 'campo'],
              ['m', 'b', 'campo'],
            ],
          },
        },
        {
          titulo: 'O par se defende, até certo ponto',
          texto: ['O receptor lê a diferença entre os dois fios do par, e o ruído que entra igual nos dois some. Mas uma fonte forte e colada induz mais do que o trançado cancela e vence a margem do enlace.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Medida', 'Efeito no ruído (no jogo)'],
            linhas: [
              ['afastar o cabo e cruzar a fonte em 90°', 'tira 12 dB'],
              ['cabo blindado e aterrado', 'tira 18 dB'],
              ['cabo blindado sem aterrar', 'põe 3 dB a mais'],
              ['fibra', 'imune'],
            ],
          },
        },
        {
          titulo: 'Blindagem sem terra é antena',
          texto: [
            'A malha ou folha do cabo blindado só protege se tiver para onde mandar o ruído: o terra do rack, em pelo menos uma ponta.',
            'Solta, ela capta o campo e entrega tudo para os pares. Pagar mais caro para ter mais ruído é uma especialidade da instalação apressada.',
          ],
        },
        {
          titulo: 'O CRC conta a história',
          texto: [
            'Um bit trocado pelo ruído estraga o quadro inteiro: o FCS no fim não bate, o switch descarta e soma um no contador de CRC daquela porta.',
            'A pessoa usuária diz "caiu". O contador diz quando, quanto e em qual porta.',
          ],
          visual: { tipo: 'camadas', camadas: ['ruído induzido no par', 'bit trocado', 'FCS não confere', 'quadro descartado (CRC + 1)', '"a internet caiu"'], rotulo: 'Do campo magnético até o chamado.' },
        },
      ],
      checagem: {
        pergunta: 'Você trocou o cabo por um blindado e o ruído aumentou. O que faltou?',
        opcoes: ['Usar Cat6a', 'Aterrar a blindagem', 'Encurtar o cabo', 'Crimpar em T568A'],
        certa: 1,
        explicacao: 'Blindagem sem aterramento vira antena e capta ainda mais. A malha precisa estar ligada ao terra do rack.',
      },
    },
    desafio: {
      carta: [
        'Na casa de bombas da represa, o PC de supervisão perde a conexão sempre que a bomba grande liga. O cabo c1 passa 30 m colado no inversor de frequência dela.',
        'O inversor é dos fortes: uma medida só não basta.',
        'Objetivo: margem do c1 de 6 dB ou mais e 500 pings até o servidor sem nenhuma perda.',
      ],
      dicas: [
        'Leia o c1: quanto ruído entra e quanto de margem o enlace tem para gastar?',
        'Afastar tira 12 dB e blindar com terra tira 18 dB. Some.',
        'Afaste o c1, troque por Cat6 blindado, aterre a blindagem e faça o ping longo.',
      ],
      montar: () => {
        const m = novoMundo(1509);
        adicionar(m, pc('supervisao', { ip: ip('192.0.2.90/24'), modelo: 'PC de supervisão das bombas' }));
        adicionar(m, comutador('sw-bombas', { modelo: 'Switch da casa de bombas' }));
        adicionar(m, pc('servidor', { ip: ip('192.0.2.91/24'), modelo: 'Servidor da represa', mdix: true }));
        ligar(m, { equip: 'supervisao', porta: 'eth0' }, { equip: 'sw-bombas', porta: 'p1' }, 'cat6', 30, { id: 'c1', ruidoDb: 34, nota: 'colado no inversor da bomba grande' });
        ligar(m, { equip: 'sw-bombas', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 6, { id: 'c2' });
        m.proxCabo = 3;
        return m;
      },
      objetivo: (m) => {
        const e = enlace(m, 'c1');
        return [item('margem do c1 de 6 dB ou mais', e.up && e.margemDb >= 6, e.up ? `${e.margemDb.toFixed(1)} dB` : e.motivos[0]), pingOk(m, 'supervisao', '192.0.2.91', 500, 0)];
      },
      solucao: [
        ['cabo', 'c1', 'afastar'],
        ['cabo', 'c1', 'trocar', { meio: 'cat6', blindado: 'sim' }],
        ['cabo', 'c1', 'aterrar'],
        ['equip', 'supervisao', 'ping', { destino: '192.0.2.91', n: '500' }],
      ],
    },
  },

  /* ---------- Orçamento de potência óptica ---------- */
  10: {
    aula: {
      cartoes: [
        {
          titulo: 'Tudo é soma de dB',
          texto: [
            'Potência de luz se mede em dBm (decibéis em relação a 1 mW). Perda se mede em dB. A conta é de somar e subtrair: recebido = transmitido - perdas.',
            'Mexa na distância e nas emendas e veja quanto chega do outro lado.',
          ],
          visual: { tipo: 'calculadora', formula: 'orcamento' },
        },
        {
          titulo: 'De onde vem a perda',
          texto: ['A fibra perde um pouco por quilômetro, e cada conector e cada emenda cobram o seu pedágio. Em 1550 nm a fibra monomodo perde menos, por isso os enlaces longos usam essa janela.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Item', 'Perda'],
            linhas: [
              ['fibra OS2 em 1310 nm', '0,35 dB/km'],
              ['fibra OS2 em 1550 nm', '0,22 dB/km'],
              ['conector', '0,5 dB cada'],
              ['emenda por fusão', '0,1 dB cada'],
            ],
          },
        },
        {
          titulo: 'Sensibilidade, saturação e margem',
          texto: [
            'Todo receptor tem duas fronteiras: abaixo da sensibilidade não entende nada; acima da saturação, ofusca. A margem é quanto sobra acima da sensibilidade.',
            'Projeto sério deixa 3 dB ou mais de margem, porque a fibra envelhece, emenda nova aparece e conector suja.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Transceptor', 'Tx', 'Sensibilidade', 'Satura em'],
            linhas: [
              ['LX-10 (1310 nm)', '-5 dBm', '-20 dBm', '-3 dBm'],
              ['ER-40 (1550 nm)', '+1 dBm', '-23 dBm', '-3 dBm'],
              ['ZX-80 (1550 nm)', '+4 dBm', '-24 dBm', '-3 dBm'],
            ],
          },
        },
        {
          titulo: 'Luz demais também derruba',
          texto: ['Transceptor forte num enlace curto entrega luz acima da saturação e o receptor cega. A saída é um transceptor mais fraco ou um atenuador óptico na recepção.', 'O objetivo nunca é "mais luz". É a luz certa.'],
        },
      ],
      checagem: {
        pergunta: 'Um enlace em 1550 nm perde 18 dB no total. Com o ER-40 (Tx +1 dBm, sensibilidade -23 dBm), qual a margem?',
        opcoes: ['6 dB', '5 dB', '17 dB', '24 dB'],
        certa: 0,
        explicacao: 'Chegam 1 - 18 = -17 dBm. A margem é a distância até a sensibilidade: -17 - (-23) = 6 dB.',
      },
    },
    desafio: {
      carta: [
        'O enlace c1 até o distrito da Serra tem 80 km, 20 emendas e 4 conectores, porque passa por um armário no meio do caminho. Está com ER-40 nas duas pontas e cai toda vez que alguém mexe no armário.',
        'Na gaveta ainda tem transceptores de todos os alcances.',
        'Objetivo: c1 ativo com 3 dB de margem ou mais, e responder a pergunta do chamado.',
      ],
      dicas: [
        'Use o medidor de potência no c1 e some as perdas: fibra, conectores e emendas.',
        'A perda passa de 21 dB. Com o ER-40 sobram menos de 3 dB; precisa de um transceptor com mais potência e mais sensibilidade, na mesma janela.',
        'Ponha ZX-80 nas duas pontas. Perda: 80 × 0,22 + 4 × 0,5 + 20 × 0,1 = 21,6 dB.',
      ],
      perguntas: p10,
      respostas: { '1': '21.6' },
      montar: () => {
        const m = novoMundo(1510);
        adicionar(m, sfp(comutador('sw-centro', { modelo: 'Switch de agregação', portas: 4, sfp: 1 }), 'sfp1', 'ER-40'));
        adicionar(m, sfp(comutador('sw-serra', { modelo: 'Switch do distrito da Serra', portas: 4, sfp: 1 }), 'sfp1', 'ER-40'));
        ligar(m, { equip: 'sw-centro', porta: 'sfp1' }, { equip: 'sw-serra', porta: 'sfp1' }, 'fibra', 80000, {
          id: 'c1',
          conectores: 4,
          emendas: Array.from({ length: 20 }, (_, i) => ({ metros: (i + 1) * 3800, perdaDb: 0.1 })),
          nota: 'passa por um armário na beira da estrada',
        });
        m.proxCabo = 2;
        return m;
      },
      objetivo: (m) => {
        const e = enlace(m, 'c1');
        return [item('c1 ativo com 3 dB de margem ou mais', e.up && e.margemDb >= 3, margemTexto(e)), respondida(m, p10[0]!)];
      },
      solucao: [
        ['equip', 'sw-centro', 'sfp:sfp1', { modelo: 'ZX-80' }],
        ['equip', 'sw-serra', 'sfp:sfp1', { modelo: 'ZX-80' }],
      ],
    },
  },

  /* ---------- OTDR e fusão ---------- */
  11: {
    aula: {
      cartoes: [
        {
          titulo: 'O radar da fibra',
          texto: [
            'O OTDR manda um pulso de luz e escuta o que volta. A fibra devolve um pouquinho de luz o tempo todo (retroespalhamento), e conectores e rupturas refletem forte.',
            'O resultado é um gráfico da fibra inteira, com cada evento no seu lugar, medido de uma ponta só.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'o', rotulo: 'OTDR', x: 70, y: 120 },
              { id: 'e', rotulo: 'emenda', x: 300, y: 120 },
              { id: 'r', rotulo: 'ruptura', x: 530, y: 120 },
            ],
            ligacoes: [
              ['o', 'e', 'pulso e eco'],
              ['e', 'r', 'pulso e eco'],
            ],
          },
        },
        {
          titulo: 'Tempo vira distância',
          texto: [
            'A luz na fibra anda a c ÷ índice de grupo. Distância = (c ÷ 1,468) × tempo do eco ÷ 2. O "÷ 2" é porque a luz vai e volta.',
            'Um eco que chega 10 µs depois do pulso vem de uns 1021 m.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Evento', 'Como aparece no OTDR'],
            linhas: [
              ['conector', 'pico de reflexão'],
              ['emenda por fusão', 'degrau sem pico'],
              ['ruptura', 'pico forte e depois só ruído'],
            ],
          },
        },
        {
          titulo: 'Clivar bem é meio caminho',
          texto: [
            'Antes de fundir, a fibra é cortada na clivadora. O corte precisa sair reto: quanto mais torto, mais luz se perde na emenda.',
            'Neste jogo, a perda da emenda é 0,02 + 0,12 × o ângulo do corte, em graus. Para ficar em até 0,1 dB, o corte precisa sair abaixo de uns 0,6°.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Ângulo do corte', 'Perda da emenda'],
            linhas: [
              ['0,5°', '0,08 dB'],
              ['1,0°', '0,14 dB'],
              ['2,0°', '0,26 dB'],
            ],
          },
        },
        {
          titulo: 'Refazer é barato',
          texto: ['Emenda ruim se corta e se refaz na hora: custa um pedaço de fibra e cinco minutos. Fechar a caixa com emenda fora do padrão custa outra viagem de caminhão-cesta.'],
        },
      ],
      checagem: {
        pergunta: 'No traço do OTDR aparece um degrau, sem pico de reflexão. O que é?',
        opcoes: ['Um conector', 'Uma emenda por fusão', 'O fim da fibra', 'Uma ruptura'],
        certa: 1,
        explicacao: 'Emenda por fusão perde um pouco de luz, mas não reflete: aparece como degrau. Conector e ruptura refletem e desenham um pico.',
      },
    },
    desafio: {
      carta: [
        'O enlace c1 até o hospital, de 4,2 km, está ativo, mas a auditoria da prefeitura reprovou: uma das emendas está fora do padrão.',
        'Ninguém lembra qual. A caixa de emenda está pendurada num poste, a 8 m do chão.',
        'Objetivo: todas as emendas do c1 com até 0,1 dB, c1 ativo, e responder a pergunta do chamado.',
      ],
      dicas: [
        'O OTDR lista cada emenda com a perda dela.',
        'Desfaça a emenda ruim e clive até o ângulo ficar abaixo de 0,6°.',
        'Corte a emenda de 1875 m, clive duas vezes e funda a 1875 m.',
      ],
      perguntas: p11,
      respostas: { '1': '1875' },
      montar: () => {
        const m = novoMundo(1511);
        adicionar(m, sfp(comutador('sw-centro', { portas: 4, sfp: 1, modelo: 'Switch do centro' }), 'sfp1', 'LX-10'));
        adicionar(m, sfp(comutador('sw-hospital', { portas: 4, sfp: 1, modelo: 'Switch do hospital' }), 'sfp1', 'LX-10'));
        ligar(m, { equip: 'sw-centro', porta: 'sfp1' }, { equip: 'sw-hospital', porta: 'sfp1' }, 'fibra', 4200, {
          id: 'c1',
          emendas: [
            { metros: 620, perdaDb: 0.05 },
            { metros: 1875, perdaDb: 0.42 },
            { metros: 3410, perdaDb: 0.07 },
          ],
          nota: 'auditoria: "uma emenda reprovada"',
        });
        m.flags.clivagens = [1.4, 0.5];
        m.proxCabo = 2;
        return m;
      },
      objetivo: (m) => {
        const c = m.cabos.get('c1')!;
        const e = enlace(m, 'c1');
        const ruins = (c.emendas ?? []).filter((x) => x.perdaDb > 0.1);
        return [
          item('c1 ativo', e.up, e.up ? undefined : e.motivos[0]),
          item('todas as emendas com até 0,1 dB', ruins.length === 0, ruins.map((x) => `${x.metros} m: ${x.perdaDb} dB`).join(', ') || undefined),
          respondida(m, p11[0]!),
        ];
      },
      solucao: [
        ['cabo', 'c1', 'otdr'],
        ['cabo', 'c1', 'cortar', { metros: '1875' }],
        ['cabo', 'c1', 'clivar'],
        ['cabo', 'c1', 'clivar'],
        ['cabo', 'c1', 'fundir', { metros: '1875' }],
      ],
    },
  },

  /* ---------- Monomodo e multimodo ---------- */
  12: {
    aula: {
      cartoes: [
        {
          titulo: 'Núcleo fino, núcleo grosso',
          texto: [
            'A luz anda dentro do núcleo da fibra. Na monomodo o núcleo tem 9 µm e só um caminho de luz cabe nele. Na multimodo o núcleo é bem mais largo e a luz entra por muitos caminhos.',
            'A cor da capa não é enfeite: é como se descobre o tipo sem microscópio.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Tipo', 'Núcleo', 'Capa', 'Uso'],
            linhas: [
              ['OS2 (monomodo)', '9 µm', 'amarela', 'quilômetros'],
              ['OM1 (multimodo)', '62,5 µm', 'laranja', 'legado, curto'],
              ['OM3 (multimodo)', '50 µm', 'aqua', 'prédio, data center'],
              ['OM4 (multimodo)', '50 µm', 'violeta', 'prédio, um pouco mais longe'],
            ],
          },
        },
        {
          titulo: 'Muitos caminhos, um borrão',
          texto: [
            'Na multimodo, um raio vai reto pelo meio e outro vai ricocheteando na borda. O segundo percorre mais fibra e chega depois. O pulso de luz se espalha no tempo: é a dispersão modal.',
            'Quanto mais alta a taxa, mais curtos são os pulsos e menos espalhamento eles aguentam. Por isso o alcance cai com a velocidade.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'tx', rotulo: 'laser', x: 70, y: 120 },
              { id: 'borda', rotulo: 'ricochete', x: 300, y: 40 },
              { id: 'rx', rotulo: 'receptor', x: 530, y: 120 },
            ],
            ligacoes: [
              ['tx', 'rx', 'modo reto: chega antes'],
              ['tx', 'borda'],
              ['borda', 'rx', 'chega depois'],
            ],
          },
        },
        {
          titulo: 'Alcance por velocidade',
          texto: ['O alcance multimodo vale para o caminho inteiro, e o pior trecho manda: um cordão de 2 m de OM1 num enlace de 10 Gb/s limita tudo a 33 m.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Fibra', '1 Gb/s', '10 Gb/s'],
            linhas: [
              ['OM1', '275 m', '33 m'],
              ['OM3', '1000 m', '300 m'],
              ['OM4', '1100 m', '400 m'],
            ],
          },
        },
        {
          titulo: 'Não misture',
          texto: [
            'Encostar um núcleo de 50 µm num de 9 µm joga fora quase toda a luz: no jogo, 18 dB. Transceptor multimodo em fibra monomodo, ou o contrário, custa 15 dB.',
            'Os cordões precisam ser do mesmo tipo do tronco. Fibra não é fibra.',
          ],
        },
      ],
      checagem: {
        pergunta: 'Enlace de 10 Gb/s de 120 m em OM3, com um cordão OM1 de 2 m numa ponta. O que acontece?',
        opcoes: ['Sobe normal: OM3 leva 10 Gb/s até 300 m', 'Não sobe: OM1 só leva 10 Gb/s até 33 m e o pior trecho manda', 'Sobe a 1 Gb/s', 'Não sobe porque OM1 é monomodo'],
        certa: 1,
        explicacao: 'A dispersão modal se acumula pelo caminho inteiro e o trecho de pior fibra define o alcance. Com OM1 no meio, o limite vira 33 m.',
      },
    },
    desafio: {
      carta: [
        'O hospital passou um tronco OM4 de 350 m entre o data center e a ala nova, para 10 Gb/s. Na pressa, os cordões vieram "do que tinha na gaveta": um aqua e um laranja.',
        'O enlace c1 não sobe, e a equipe de TI do hospital já marcou reunião para discutir o assunto.',
        'Objetivo: c1 ativo a 10 Gb/s com pelo menos 3 dB de margem.',
      ],
      dicas: [
        'Veja os trechos do c1: tipo, cor e comprimento de cada um.',
        'São 356 m no total. Qual fibra leva 10 Gb/s até essa distância? Os dois cordões contam.',
        'Troque os dois cordões por OM4.',
      ],
      montar: () => {
        const m = novoMundo(1512);
        adicionar(m, sfp(comutador('sw-dc', { portas: 4, sfp: 1, modelo: 'Switch do data center' }), 'sfp1', 'SR-10G'));
        adicionar(m, sfp(comutador('sw-ala', { portas: 4, sfp: 1, modelo: 'Switch da ala nova' }), 'sfp1', 'SR-10G'));
        ligar(m, { equip: 'sw-dc', porta: 'sfp1' }, { equip: 'sw-ala', porta: 'sfp1' }, 'fibra', 356, {
          id: 'c1',
          conectores: 4,
          segmentos: [
            { nome: 'cordão do data center', fibra: 'om3', metros: 3 },
            { nome: 'tronco', fibra: 'om4', metros: 350 },
            { nome: 'cordão da ala', fibra: 'om1', metros: 3 },
          ],
          nota: 'cordões "do que tinha na gaveta"',
        });
        m.proxCabo = 2;
        return m;
      },
      objetivo: (m) => {
        const e = enlace(m, 'c1');
        return [item('c1 ativo a 10 Gb/s', e.up && e.velocidade === 10000, e.up ? undefined : e.motivos[0]), item('margem de 3 dB ou mais', e.up && e.margemDb >= 3, e.up ? `${e.margemDb.toFixed(1)} dB` : undefined)];
      },
      solucao: [
        ['cabo', 'c1', 'segmento', { n: '1', fibra: 'om4' }],
        ['cabo', 'c1', 'segmento', { n: '3', fibra: 'om4' }],
      ],
    },
  },

  /* ---------- Nyquist, Shannon e modulação ---------- */
  13: {
    aula: {
      cartoes: [
        {
          titulo: 'Banda é a largura do cano',
          texto: [
            'Todo canal deixa passar só uma faixa de frequências: a banda, medida em Hz. Uma linha telefônica passa uns 3 kHz.',
            'Um sinal de bordas retas precisa de harmônicos altos. Com pouca banda, eles ficam pelo caminho e o sinal chega arredondado. Arraste e veja.',
          ],
          visual: { tipo: 'sinal', harmonicos: 2 },
        },
        {
          titulo: 'Nyquist: símbolos por segundo',
          texto: [
            'Num canal de banda B, cabem no máximo 2B símbolos por segundo sem que um atropele o outro. A taxa de símbolos se mede em baud (Bd).',
            'Cada símbolo leva log₂(M) bits, onde M é o número de níveis ou estados do sinal.',
          ],
          visual: { tipo: 'calculadora', formula: 'nyquist' },
        },
        {
          titulo: 'Mais bits por símbolo custam SNR',
          texto: ['Com mais estados, os pontos da constelação ficam mais perto uns dos outros, e o ruído confunde um com o outro. Cada modulação exige uma relação sinal-ruído mínima.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Modulação', 'Bits por símbolo', 'SNR mínima'],
            linhas: [
              ['BPSK', '1', '10,5 dB'],
              ['QPSK', '2', '13,5 dB'],
              ['16-QAM', '4', '20,5 dB'],
              ['64-QAM', '6', '26,5 dB'],
              ['256-QAM', '8', '32,5 dB'],
            ],
          },
        },
        {
          titulo: 'Shannon, o teto',
          texto: [
            'C = B × log₂(1 + S/N), com S/N em escala linear: 30 dB são 1000 vezes, 20 dB são 100 vezes.',
            'Nenhuma combinação de baud e modulação passa de C. Uma configuração pode respeitar Nyquist e a SNR e ainda assim bater no teto.',
          ],
          visual: { tipo: 'calculadora', formula: 'shannon' },
        },
      ],
      checagem: {
        pergunta: 'Numa linha com 3000 Hz de banda, qual a taxa máxima de símbolos segundo Nyquist?',
        opcoes: ['1500 Bd', '3000 Bd', '6000 Bd', '12000 Bd'],
        certa: 2,
        explicacao: 'Nyquist permite até 2 × B símbolos por segundo: 2 × 3000 = 6000 Bd. Os bits por segundo dependem de quantos bits cada símbolo leva.',
      },
    },
    desafio: {
      carta: [
        'A estação meteorológica da represa manda dados por um par de cobre velho: 2400 Hz de banda e 24 dB de SNR. O modem está a 2,4 kb/s.',
        'O radar de chuva novo precisa de pelo menos 18 kb/s.',
        'Objetivo: modem sincronizado a 18 kb/s ou mais, e responder a pergunta do chamado.',
      ],
      dicas: [
        'Calcule os três limites antes de mexer: Nyquist, a SNR e Shannon.',
        'Nyquist: até 4800 Bd. Com 24 dB, a modulação mais densa que passa é 16-QAM. Shannon: uns 19,1 kb/s. Cuidado: 4800 Bd em 16-QAM dá 19,2 kb/s.',
        'Configure 4700 Bd em 16-QAM: 18,8 kb/s.',
      ],
      perguntas: p13,
      respostas: { '1': '19.1' },
      montar: () => {
        const m = novoMundo(1513);
        adicionar(m, aparelho('modem', 'modem', 'Modem de linha dedicada MD-336', [{ nome: 'linha' }], { bandaHz: 2400, snrDb: 24, baud: 1200, modulacao: 'qpsk' }));
        return m;
      },
      objetivo: (m) => {
        const r = avaliarModem(m.equipamentos.get('modem')!.s as any);
        return [item('modem sincronizado', r.ok, r.ok ? undefined : r.motivos[0]), item('taxa de 18 kb/s ou mais', r.ok && r.taxa >= 18000, `${(r.taxa / 1000).toFixed(1)} kb/s`), respondida(m, p13[0]!)];
      },
      solucao: [['equip', 'modem', 'modem', { baud: '4700', mod: 'qam16' }]],
    },
  },

  /* ---------- E1 e TDM ---------- */
  14: {
    aula: {
      cartoes: [
        {
          titulo: 'Uma ligação, 64 kb/s',
          texto: ['A voz digital clássica (PCM) mede o som 8000 vezes por segundo e guarda cada medida em 8 bits. Uma ligação ocupa 8000 × 8 = 64 kb/s, desde os anos 60.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Grandeza', 'Valor'],
            linhas: [
              ['amostras por segundo', '8000'],
              ['bits por amostra', '8'],
              ['taxa de um canal', '64 kb/s'],
            ],
          },
        },
        {
          titulo: 'Cada um na sua vez',
          texto: [
            'Multiplexação por divisão de tempo (TDM): o multiplexador pega um byte de cada canal, um atrás do outro, e manda tudo na mesma linha. Do outro lado, o outro mux devolve cada byte ao seu dono.',
            'Cada canal tem a sua fatia garantida, mesmo em silêncio. Ótimo para voz, desperdício para dados.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'v1', rotulo: 'voz 1', x: 70, y: 40 },
              { id: 'v2', rotulo: 'voz 2', x: 70, y: 120 },
              { id: 'd', rotulo: 'dados', x: 70, y: 200 },
              { id: 'm1', rotulo: 'mux', x: 260, y: 120 },
              { id: 'm2', rotulo: 'mux', x: 520, y: 120 },
            ],
            ligacoes: [
              ['v1', 'm1'],
              ['v2', 'm1'],
              ['d', 'm1'],
              ['m1', 'm2', 'E1: 2048 kb/s'],
            ],
          },
        },
        {
          titulo: 'O quadro de 32 intervalos',
          texto: [
            'O E1 junta 32 canais num quadro de 256 bits, repetido 8000 vezes por segundo: 32 × 64 = 2048 kb/s. Cada canal é um intervalo de tempo, de 0 a 31.',
            'O intervalo 0 leva o padrão que diz onde o quadro começa: mexer nele dá perda de quadro (LOF) e tudo cai. Com sinalização associada ao canal, o 16 leva a sinalização das linhas de voz. Sobram 30.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Intervalo', 'Uso'],
            linhas: [
              ['0', 'enquadramento (não se toca)'],
              ['1 a 15', 'voz ou dados'],
              ['16', 'sinalização das linhas de voz'],
              ['17 a 31', 'voz ou dados'],
            ],
          },
        },
        {
          titulo: 'A conta da divisão',
          texto: ['Os 30 intervalos úteis se dividem entre voz e dados. Cada intervalo de dados vale 64 kb/s.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Canais de voz', 'Intervalos de dados', 'Dados'],
            linhas: [
              ['10', '20', '1280 kb/s'],
              ['20', '10', '640 kb/s'],
              ['30', '0', 'nada'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'Por que o intervalo 0 do E1 não pode virar canal de dados?',
        opcoes: ['Porque leva o padrão de enquadramento que marca o início do quadro', 'Porque é mais lento que os outros', 'Porque é reservado à sinalização das linhas de voz', 'Porque só aceita voz'],
        certa: 0,
        explicacao: 'Sem o padrão de enquadramento no intervalo 0, o outro lado não sabe onde o quadro começa: perde o alinhamento (LOF) e todos os canais caem juntos.',
      },
    },
    desafio: {
      carta: [
        'A delegacia herdou um E1 e quer 18 linhas de telefone e o resto em dados. Alguém configurou os 32 intervalos como voz, inclusive o 0 e o 16. O mux pisca LOF desde então.',
        'O sistema de ocorrências precisa de pelo menos 768 kb/s de dados.',
        'Objetivo: quadro alinhado, sinalização no intervalo 16, 18 canais de voz ou mais, 768 kb/s de dados ou mais, e responder a pergunta do chamado.',
      ],
      dicas: [
        'Abra o quadro E1 e conte: quantos intervalos sobram para voz e dados?',
        'Devolva o 0 ao enquadramento e o 16 à sinalização. Dos 30 que sobram, 18 ficam em voz e 12 em dados.',
        'Intervalo 0 em enquadramento, 16 em sinalização, 20 a 31 em dados.',
      ],
      perguntas: p14,
      respostas: { '1': '768' },
      montar: () => {
        const m = novoMundo(1514);
        const slots: UsoSlot[] = Array.from({ length: 32 }, () => 'voz');
        adicionar(m, aparelho('mux', 'mux', 'Multiplexador E1 da delegacia', [{ nome: 'e1' }], { slots }));
        return m;
      },
      objetivo: (m) => {
        const r = avaliarE1(m.equipamentos.get('mux')!.s.slots);
        return [
          item('quadro alinhado (intervalo 0 em enquadramento)', !r.lof),
          item('sinalização no intervalo 16', r.sinalizacao),
          item('18 canais de voz ou mais', r.voz >= 18, `${r.voz}`),
          item('768 kb/s de dados ou mais', r.dados >= 768, `${r.dados} kb/s`),
          respondida(m, p14[0]!),
        ];
      },
      solucao: [
        ['equip', 'mux', 'slot', { lista: '0', uso: 'enquadramento' }],
        ['equip', 'mux', 'slot', { lista: '16', uso: 'sinalizacao' }],
        ['equip', 'mux', 'slot', { lista: '20-31', uso: 'dados' }],
      ],
    },
  },

  /* ---------- Enlace de rádio ---------- */
  15: {
    aula: {
      cartoes: [
        {
          titulo: 'O sinal se espalha',
          texto: [
            'Mesmo sem nada no caminho, a energia se espalha numa esfera cada vez maior. É a perda no espaço livre: 32,44 + 20 log₁₀(d em km) + 20 log₁₀(f em MHz), em dB.',
            'Dobrar a distância custa 6 dB. Dobrar a frequência também.',
          ],
          visual: { tipo: 'calculadora', formula: 'fspl' },
        },
        {
          titulo: 'A conta do RSSI',
          texto: ['O sinal recebido (RSSI) é a potência do rádio mais o ganho das duas antenas, menos todas as perdas. No enlace do Morro Alto, com tudo no lugar, a conta fecha assim:'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Parcela', 'Valor'],
            linhas: [
              ['potência do transmissor', '+20 dBm'],
              ['ganho das duas antenas', '+46 dB'],
              ['espaço livre, 8 km a 5,8 GHz', '-125,8 dB'],
              ['RSSI', '-59,8 dBm'],
            ],
          },
        },
        {
          titulo: 'Feixe estreito, mira fina',
          texto: [
            'Antena direcional concentra a energia num feixe de poucos graus. É o que dá o ganho, e é o que cobra a pontaria.',
            'Neste jogo, a perda por desalinhamento é 12 × (erro ÷ largura do feixe)², até 40 dB. Com feixe de 9°:',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Erro de mira', 'Perda'],
            linhas: [
              ['3°', '1,3 dB'],
              ['9°', '12 dB'],
              ['17°', '40 dB (o máximo)'],
            ],
          },
        },
        {
          titulo: 'Fresnel: a visada gorda',
          texto: [
            'A energia não viaja numa linha fina: ocupa um elipsoide em volta da linha reta, a 1ª zona de Fresnel. No meio do enlace, o raio é 8,657 × √(d em km ÷ f em GHz) metros.',
            'Obstáculo dentro dos 60 % desse raio já rouba sinal. Enxergar o outro lado não basta: tem que sobrar folga.',
          ],
          visual: { tipo: 'calculadora', formula: 'fresnel' },
        },
      ],
      checagem: {
        pergunta: 'Dobrar a distância de um enlace de rádio aumenta a perda no espaço livre em quanto?',
        opcoes: ['3 dB', '6 dB', 'O dobro dos dB', '20 dB'],
        certa: 1,
        explicacao: '20 × log₁₀(2) ≈ 6 dB. Como a conta é logarítmica, cada vez que a distância dobra, somam-se mais 6 dB.',
      },
    },
    desafio: {
      carta: [
        'A escola rural do Capão vai receber internet por rádio a 5,8 GHz, 14 km da torre do centro. A torre está pronta, a 35 m.',
        'O rádio da escola ficou num mastro de 22 m, apontado "pela sombra da tarde". No meio do caminho está o silo da cooperativa, com 24 m.',
        'Objetivo: RSSI de -65 dBm ou melhor, e responder a pergunta do chamado.',
      ],
      dicas: [
        'Veja o enlace no rádio da escola: compare o rumo com o azimute e a altura com o silo.',
        'O raio de Fresnel passa de 13 m; os 60 % pedem uns 8,1 m livres acima do silo.',
        'Aponte o rádio da escola para 312° e suba o mastro para 33 m.',
      ],
      perguntas: p15,
      respostas: { '1': '13.45' },
      montar: () => {
        const m = novoMundo(1515);
        const radio = (nome: string, antena: Equipamento['antena'], rumo: number) => {
          const e = aparelho(nome, 'radio', 'Rádio PTP 5,8 GHz com antena de 25 dBi', [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax: 35 });
          e.antena = antena;
          return e;
        };
        adicionar(m, radio('radio-torre', { ganho: 25, azimute: 132, azimuteCerto: 132, altura: 35, feixe: 7 }, 132));
        adicionar(m, radio('radio-escola', { ganho: 25, azimute: 300, azimuteCerto: 312, altura: 22, feixe: 7 }, 312));
        ligar(m, { equip: 'radio-torre', porta: 'ar' }, { equip: 'radio-escola', porta: 'ar' }, 'radio', 14000, { id: 'c1', radio: { distanciaKm: 14, freqGHz: 5.8, obstaculoM: 24, ptxDbm: 20 } });
        m.proxCabo = 2;
        return m;
      },
      objetivo: (m) => {
        const d = radioDados(m, m.cabos.get('c1')!);
        return [item('RSSI de -65 dBm ou melhor', d.rssi >= -65, `${d.rssi.toFixed(1)} dBm`), respondida(m, p15[0]!)];
      },
      solucao: [['equip', 'radio-escola', 'antena', { azimute: '312', altura: '33' }]],
    },
  },

  /* ---------- Espectro de 2,4 GHz ---------- */
  16: {
    aula: {
      cartoes: [
        {
          titulo: 'BSS, ESS e o sistema de distribuição',
          texto: [
            'No modo infraestrutura, cada aparelho é uma estação e fala com um ponto de acesso (AP). O AP e as estações associadas a ele formam um BSS, identificado pelo BSSID: o MAC do rádio do AP. O SSID é o nome da rede.',
            'Vários BSS com o mesmo SSID, ligados por um sistema de distribuição (SD, quase sempre um switch), formam um ESS. A estação anda de um AP para outro e se reassocia sem trocar de rede: roaming.',
            'No modo ad hoc não tem AP: as estações falam direto, num IBSS. Serve para juntar dois aparelhos às pressas, não para atender uma padaria.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'c1', rotulo: 'celular', x: 70, y: 40 },
              { id: 'c2', rotulo: 'notebook', x: 70, y: 200 },
              { id: 'ap1', rotulo: 'AP da frente', x: 200, y: 120 },
              { id: 'sw', rotulo: 'switch (SD)', x: 300, y: 40 },
              { id: 'ap2', rotulo: 'AP dos fundos', x: 400, y: 120 },
              { id: 'c3', rotulo: 'maquininha', x: 530, y: 200 },
            ],
            ligacoes: [
              ['c1', 'ap1', 'BSS 1'],
              ['c2', 'ap1', 'BSS 1'],
              ['ap1', 'sw', 'cabo'],
              ['sw', 'ap2', 'cabo'],
              ['c3', 'ap2', 'BSS 2'],
            ],
          },
        },
        {
          titulo: 'Onde o 802.11 mora na pilha',
          texto: [
            'O 802.11 define a camada física e a subcamada MAC da camada de enlace. Por cima vem o LLC (802.2), o mesmo da Ethernet, que entrega os dados ao IP sem saber se vieram pelo ar.',
            'Uma MAC só, várias camadas físicas embaixo: trocar de 802.11g para 802.11ax é trocar o rádio, não o jeito de entrar na rede.',
          ],
          visual: { tipo: 'camadas', camadas: ['rede: IP', 'enlace, subcamada LLC: 802.2', 'enlace, subcamada MAC: 802.11', 'física: 802.11b, a, g, n, ac, ax'], rotulo: 'o Wi-Fi na pilha, de cima para baixo' },
        },
        {
          titulo: 'Achar, autenticar, associar',
          texto: [
            'Varredura passiva: a estação escuta o beacon, que cada AP manda a cada 102,4 ms com o SSID, o BSSID e as taxas. Varredura ativa: a estação manda um probe request e os APs respondem com um probe response.',
            'Achada a rede, dois passos: autenticação (no sistema aberto, só "posso?" e "pode") e associação, em que o AP dá um número à estação (o AID) e passa a encaminhar os quadros dela. A senha do WPA2 ou WPA3 vem depois.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Quadro de gerenciamento', 'Quem manda', 'Subtipo'],
            linhas: [
              ['beacon', 'AP, para todos', '8'],
              ['probe request', 'estação, para todos', '4'],
              ['probe response', 'AP, para a estação', '5'],
              ['authentication', 'os dois, um de cada vez', '11'],
              ['association request', 'estação', '0'],
              ['association response', 'AP', '1'],
            ],
          },
        },
        {
          titulo: 'As camadas físicas do 802.11',
          texto: [
            'Cada geração trocou o rádio. No OFDM, a taxa é subportadoras de dados × bits por subportadora × codificação ÷ duração do símbolo: no 802.11g, 48 × 6 × 3/4 ÷ 4 µs = 54 Mb/s.',
            'O rádio escolhe a modulação pela SNR (modulação adaptativa): com sinal limpo, 64-QAM e 54 Mb/s; com sinal sujo, BPSK e 6 Mb/s; abaixo disso, nem associa.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Padrão', 'Faixa', 'Técnica', 'Teto'],
            linhas: [
              ['802.11b', '2,4 GHz', 'DSSS, 22 MHz', '11 Mb/s'],
              ['802.11a', '5 GHz', 'OFDM, 20 MHz', '54 Mb/s'],
              ['802.11g', '2,4 GHz', 'OFDM, 20 MHz', '54 Mb/s'],
              ['802.11n', '2,4 e 5 GHz', 'MIMO, até 40 MHz', '600 Mb/s'],
              ['802.11ac', '5 GHz', '80 e 160 MHz, MU-MIMO na descida', 'uns 6,9 Gb/s'],
              ['802.11ax', '2,4, 5 e 6 GHz', 'OFDMA, MU-MIMO', 'uns 9,6 Gb/s'],
            ],
          },
        },
        {
          titulo: 'Treze canais, três sem briga',
          texto: [
            'A faixa de 2,4 GHz tem canais de 1 a 13, com centros separados de 5 MHz. Mas cada transmissão ocupa uns 22 MHz: mais de quatro canais de largura. Por isso só três canais não se sobrepõem entre si: 1, 6 e 11. No OFDM do g e do n o canal tem 20 MHz, e 1, 5, 9 e 13 até caberiam; mas as bordas vazam e ainda tem 802.11b na rua, então o costume ficou 1, 6 e 11.',
            'A interferência de um vizinho conta pela fração do canal dele que cai dentro do seu: 1 - (distância em canais × 5) ÷ 22. A 1 canal, 77 %; a 2, 55 %; a 3, 32 %; a 4, 9 %; a 5 ou mais, zero.',
          ],
          visual: {
            tipo: 'espectro',
            canais: [
              { canal: 1, dbm: -50, rotulo: 'canal 1' },
              { canal: 6, dbm: -50, rotulo: 'canal 6' },
              { canal: 11, dbm: -50, rotulo: 'canal 11' },
            ],
          },
        },
        {
          titulo: 'SNR, armadilha e exceção',
          texto: [
            'SNR é a distância, em dB, entre o sinal do seu AP no cliente e tudo o que não interessa: ruído de fundo mais a interferência dos vizinhos.',
            'Canal "vazio" no analisador pode ser uma armadilha: se fica a 3 ou 4 canais de um vizinho forte, herda a borda dele. E 1, 6 e 11 é regra de bolso: quando a vizinhança é bagunçada, vale a conta, mesmo que dê um canal fora dos três famosos.',
          ],
          visual: {
            tipo: 'espectro',
            canais: [
              { canal: 3, dbm: -60, rotulo: 'vizinho' },
              { canal: 6, dbm: -45, rotulo: 'vizinho forte' },
              { canal: 9, dbm: -70, rotulo: 'fraco' },
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'A padaria pôs um segundo AP nos fundos, com o mesmo SSID, ligado ao mesmo switch. O que a rede virou?',
        opcoes: ['Um BSS só, porque o SSID é o mesmo', 'Um ESS: dois BSS, cada um com o seu BSSID, e o celular faz roaming entre eles', 'Uma rede ad hoc (IBSS)', 'Duas redes que o celular precisa escolher na mão'],
        certa: 1,
        explicacao: 'Cada AP forma o seu BSS, com o próprio BSSID. O mesmo SSID e o sistema de distribuição (o switch) juntam os dois num ESS: para o celular, uma rede só, e ele se reassocia ao AP mais forte.',
      },
    },
    desafio: {
      carta: [
        `O AP da sorveteria da praça, rede "SORVETE_DE_FIBRA", está no canal 11. Ao redor tem o Wi-Fi da prefeitura no 1, uma lan house no 4 e um decodificador de TV berrando no 8.`,
        'O dono já trocou de canal "uns dez", sem sorte. Nenhum dos três canais famosos resolve. E ele quer saber como pôr um segundo AP no fundo da sorveteria sem o celular do cliente cair no caminho.',
        'Objetivo: SNR de 25 dB ou mais no cliente, o cliente a 54 Mb/s, e responder as perguntas do chamado.',
      ],
      dicas: [
        'Abra o analisador de espectro e anote o canal e a força de cada vizinho.',
        'Procure um canal a 5 canais ou mais de todos os vizinhos fortes. Os canais vão até 13.',
        'Canal 13, em 2472 MHz: fica a 5 canais do 8 e longe do resto. Dois APs com o mesmo SSID, ligados pelo mesmo switch, formam um ESS.',
      ],
      perguntas: p16,
      respostas: { '1': '2472', '2': 'ESS' },
      montar: () => {
        const m = novoMundo(1516);
        adicionar(
          m,
          aparelho('ap', 'ap', 'Ponto de acesso 802.11g da sorveteria, rede "SORVETE_DE_FIBRA"', [{ nome: 'lan' }], {
            canal: 11,
            sinalCliente: -55,
            ruidoDbm: -95,
            vizinhos: [
              { nome: 'PREFEITURA_LIVRE', canal: 1, dbm: -50 },
              { nome: 'LanHouse_Fim_de_Jogo', canal: 4, dbm: -58 },
              { nome: 'DECODIFICADOR_TV_7F3A', canal: 8, dbm: -44 },
            ],
          }),
        );
        return m;
      },
      objetivo: (m) => {
        const r = snrWifi(m.equipamentos.get('ap')!.s as any);
        const t = taxaClienteWifi(m);
        return [item('SNR de 25 dB ou mais no cliente', r.snr >= 25, `${r.snr.toFixed(1)} dB`), item('cliente associado a 54 Mb/s', t?.mbps === 54, t ? `${t.mbps} Mb/s em ${t.modulacao} ${t.codificacao}` : 'nem associa'), ...todasRespondidas(m, p16)];
      },
      solucao: [['equip', 'ap', 'canal', { canal: '13' }]],
    },
  },

  /* ---------- Coaxial e DOCSIS ---------- */
  17: {
    aula: {
      cartoes: [
        {
          titulo: 'Um cabo, muitas frequências',
          texto: [
            'Na rede de cabo, o mesmo coaxial leva TV e internet, cada coisa na sua faixa de frequência. O padrão DOCSIS põe os dados em canais de 6 MHz, modulados em 256-QAM na descida.',
            'Do poste até o modem, o sinal passa por cabo, conectores e divisores.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'tap', rotulo: 'tap no poste', x: 70, y: 120 },
              { id: 'div', rotulo: 'divisor', x: 300, y: 120 },
              { id: 'modem', rotulo: 'cable modem', x: 520, y: 60 },
              { id: 'tv', rotulo: 'TV', x: 520, y: 190 },
            ],
            ligacoes: [
              ['tap', 'div', 'coaxial'],
              ['div', 'modem'],
              ['div', 'tv'],
            ],
          },
        },
        {
          titulo: 'dBmV e a janela do modem',
          texto: ['O nível de sinal no modem se mede em dBmV. Ele aceita de -15 a +15, mas o ideal fica entre -7 e +7. Abaixo de -7 ou acima de +10, a qualidade da modulação começa a cair.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Nível na descida', 'O que acontece'],
            linhas: [
              ['acima de +15 dBmV', 'o receptor satura'],
              ['de -7 a +7 dBmV', 'ideal'],
              ['abaixo de -15 dBmV', 'o modem não trava na portadora'],
            ],
          },
        },
        {
          titulo: 'Cada peça cobra pedágio',
          texto: ['Tudo no caminho perde sinal. Divisor sobrando é perda sem motivo, e conector oxidado é perda e ruído ao mesmo tempo.'],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Peça', 'Perda'],
            linhas: [
              ['cabo RG59', '24,6 dB a cada 100 m'],
              ['cabo RG6', '18,5 dB a cada 100 m'],
              ['divisor de 2 / 4 / 8 vias', '3,5 / 7 / 11 dB'],
              ['conector bom', '0,2 dB'],
              ['conector oxidado', '6 dB, e ainda tira 8 dB de MER'],
            ],
          },
        },
        {
          titulo: 'MER: a nitidez da constelação',
          texto: [
            'O MER mede o quanto os símbolos recebidos ficam perto dos pontos ideais da constelação. Abaixo de 30 dB, o 256-QAM vira sopa. Bom mesmo é 35 dB ou mais.',
            'Sinal de menos pede tirar peças. Sinal de mais pede um atenuador. Em RF, o objetivo é o sinal certo, não o maior.',
          ],
        },
      ],
      checagem: {
        pergunta: 'O modem recebe +19 dBmV. O que resolve?',
        opcoes: ['Um amplificador', 'Um atenuador de 10 dB ou mais', 'Um divisor de 8 vias "para garantir"', 'Nada, sinal forte é bom'],
        certa: 1,
        explicacao: 'Acima de +15 dBmV o receptor satura. Um atenuador de 10 dB traz o nível para +9 dBmV; de 15 dB, para +4, dentro da janela ideal.',
      },
    },
    desafio: {
      carta: [
        'No sobrado colado ao poste da Praça da Matriz, a descida coaxial é curta: 25 m de RG6. O modem fica online, mas a internet "engasga" o dia inteiro.',
        'O conector da entrada está verde de oxidação. O técnico anterior quis trocar e desistiu: "piora quando troca".',
        'Objetivo: modem ONLINE com nível de descida entre -7 e +7 dBmV e MER de 35 dB ou mais.',
      ],
      dicas: [
        'Veja a descida: com quanto sinal sai do tap e com quanto chega ao modem?',
        'Trocar o conector tira 6 dB de perda, e o sinal que já era alto passa de +15. A outra metade da solução diminui o sinal.',
        'Troque o conector e ponha um atenuador de 10 dB.',
      ],
      montar: () => {
        const m = novoMundo(1517);
        adicionar(m, aparelho('tap', 'cmts', 'Tap da rede coaxial no poste da praça', [{ nome: 'saida', fisica: 'coax' }]));
        adicionar(m, aparelho('modem', 'cablemodem', 'Cable modem DOCSIS 3.1', [{ nome: 'rf', fisica: 'coax' }, { nome: 'lan' }]));
        ligar(m, { equip: 'tap', porta: 'saida' }, { equip: 'modem', porta: 'rf' }, 'coax', 25, {
          id: 'c1',
          coax: {
            tapDbmv: 21,
            elementos: [
              { tipo: 'cabo', modelo: 'rg6', metros: 25 },
              { tipo: 'conector', oxidado: true },
            ],
          },
        });
        m.proxCabo = 2;
        return m;
      },
      objetivo: (m) => {
        const { nivel, mer } = coaxDados(m.cabos.get('c1')!);
        const e = enlace(m, 'c1');
        return [item('modem ONLINE', e.up, e.up ? undefined : e.motivos[0]), item('nível entre -7 e +7 dBmV', nivel >= -7 && nivel <= 7, `${nivel.toFixed(1)} dBmV`), item('MER de 35 dB ou mais', mer >= 35, `${mer.toFixed(1)} dB`)];
      },
      solucao: [
        ['cabo', 'c1', 'coax-trocar', { n: '2', nova: 'conector' }],
        ['cabo', 'c1', 'coax-atenuador', { db: '10' }],
      ],
    },
  },

  /* ---------- Satélite ---------- */
  18: {
    aula: {
      cartoes: [
        {
          titulo: 'Três alturas de céu',
          texto: [
            'Satélites de comunicação ficam em três faixas. Quanto mais alto, mais Terra cada um enxerga e mais longe a luz precisa ir.',
            'A luz anda a 299.792 km/s. A tabela mostra só o tempo de subir até o satélite e descer do outro lado.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Órbita', 'Altitude', 'Subir e descer'],
            linhas: [
              ['geoestacionária', '35.786 km', '238,7 ms'],
              ['média', '8.062 km', '53,8 ms'],
              ['baixa', '550 km', '3,7 ms'],
            ],
          },
        },
        {
          titulo: 'O ping atravessa duas vezes',
          texto: ['O pedido sobe e desce para chegar ao servidor, e a resposta sobe e desce para voltar. Em órbita geoestacionária, isso passa de 477 ms só de propagação, antes de qualquer roteador.'],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'casa', rotulo: 'casa', x: 70, y: 200 },
              { id: 'sat', rotulo: 'satélite', x: 300, y: 40 },
              { id: 'est', rotulo: 'estação terrena', x: 530, y: 200 },
            ],
            ligacoes: [
              ['casa', 'sat', 'sobe'],
              ['sat', 'est', 'desce'],
            ],
          },
        },
        {
          titulo: 'Vazão não é atraso',
          texto: [
            'Vazão é quantos bits por segundo cabem no cano. Atraso é quanto tempo cada bit leva para atravessar. Dá para ter 50 Mb/s com meio segundo de ida e volta.',
            'Mexa na taxa e veja: com propagação de 270 ms, aumentar a taxa quase não muda o tempo de ida e volta. Para jogo e voz, o atraso manda.',
          ],
          visual: { tipo: 'calculadora', formula: 'transmissao' },
        },
        {
          titulo: 'O preço da órbita baixa',
          texto: ['Em órbita baixa o atraso cai para poucos milissegundos, mas cada satélite cruza o céu em minutos: o terminal troca de satélite o tempo todo, e é preciso uma constelação enorme para cobrir cada lugar. Nem todo lugar tem cobertura.'],
        },
      ],
      checagem: {
        pergunta: 'Por que um enlace geoestacionário de 50 Mb/s dá ping alto?',
        opcoes: ['Pela distância: a luz leva uns 239 ms para subir e descer, e o ping faz isso duas vezes', 'Porque 50 Mb/s é pouca vazão', 'Porque o satélite processa devagar', 'Por causa da chuva'],
        certa: 0,
        explicacao: 'O atraso de propagação não depende da vazão. A 35.786 km, ida e volta somam perto de meio segundo, seja qual for a taxa.',
      },
    },
    desafio: {
      carta: [
        'O posto da guarda florestal na Serra do Fim usa satélite geoestacionário, e o rádio por voz sobre IP tem eco de meio segundo. A constelação de órbita baixa ainda não cobre a serra.',
        'O sistema de voz exige média de ping abaixo de 150 ms até a central.',
        'Objetivo: terminal numa órbita com cobertura na serra, média de ping abaixo de 150 ms em pelo menos 10 pedidos, e responder a pergunta do chamado.',
      ],
      dicas: [
        'Faça a conta para cada órbita: 2 × altitude ÷ velocidade da luz, duas vezes por ping.',
        'Sem órbita baixa, sobram a geoestacionária e a média. Só uma cabe em 150 ms.',
        'Troque o terminal para órbita média e faça 10 pings até a central.',
      ],
      perguntas: p18,
      respostas: { '1': '53.8' },
      montar: () => {
        const m = novoMundo(1518);
        adicionar(m, pc('posto', { ip: ip('192.0.2.150/24'), modelo: 'PC do posto da guarda florestal', mdix: true }));
        adicionar(m, aparelho('terminal', 'terminal-sat', 'Terminal de satélite do posto', [{ nome: 'lan' }, { nome: 'ceu', fisica: 'sat' }]));
        adicionar(m, aparelho('gateway', 'gateway-sat', 'Estação terrena do provedor de satélite', [{ nome: 'ceu', fisica: 'sat' }, { nome: 'lan' }]));
        adicionar(m, pc('central', { ip: ip('192.0.2.160/24'), modelo: 'Central de rádio da guarda', mdix: true }));
        ligar(m, { equip: 'posto', porta: 'eth0' }, { equip: 'terminal', porta: 'lan' }, 'cat6', 8, { id: 'c1' });
        ligar(m, { equip: 'terminal', porta: 'ceu' }, { equip: 'gateway', porta: 'ceu' }, 'satelite', 0, { id: 'c2', sat: { orbita: 'geo' } });
        ligar(m, { equip: 'gateway', porta: 'lan' }, { equip: 'central', porta: 'eth0' }, 'cat6', 5, { id: 'c3' });
        m.proxCabo = 4;
        return m;
      },
      objetivo: (m) => {
        const c = m.cabos.get('c2')!;
        return [item('órbita com cobertura na serra (geoestacionária ou média)', c.sat!.orbita !== 'leo', c.sat!.orbita), pingOk(m, 'posto', '192.0.2.160', 10, 0, 150), respondida(m, p18[0]!)];
      },
      solucao: [
        ['cabo', 'c2', 'orbita', { orbita: 'meo' }],
        ['equip', 'posto', 'ping', { destino: '192.0.2.160', n: '10' }],
      ],
    },
  },
};
