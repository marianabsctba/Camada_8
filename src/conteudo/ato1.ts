// Ato 1: O Poste. Camada física, do par trançado ao satélite.

import { wiremap } from '../motor/fisico';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc, TRANSCEPTORES, type Equipamento, type Mundo } from '../motor/mundo';
import { avaliarE1, avaliarModem, snrWifi, type EstadoAp, type UsoSlot } from '../motor/aparelhos';
import { coaxDados, radioDados } from '../motor/fisico';
import { modulacaoAdaptativa, type TaxaWifi } from '../motor/mac';
import { fmt, lerCidr, LUZ } from '../motor/util';
import { enlace, item, numerica, pingOk, respondida, todasRespondidas } from './comum';
import type { Dia, Pergunta } from './tipos';

const ip = (s: string) => lerCidr(s)!;
const sfp = (e: Equipamento, porta: string, modelo: string) => {
  e.portas.find((p) => p.nome === porta)!.sfp = { ...TRANSCEPTORES[modelo]! };
  return e;
};

/* ---------- Dia 5 ---------- */

const dia5: Dia = {
  numero: 5,
  ato: 1,
  titulo: 'Crimpa direito',
  chamado: [
    'CHAMADO #0005',
    'Cliente novo na rua das Acácias. O cabo do poste até o PC foi crimpado pela pessoa anterior "no olho".',
    'Post-it colado no conector: "as cores tão em ordem, confia".',
    'Objetivo: enlace do cabo c1 ativo a 1 Gb/s, com o cabo passando no certificador.',
  ],
  manual: {
    titulo: 'Par trançado, T568A e T568B',
    texto: [
      'O cabo de rede tem 4 pares trançados: laranja, verde, azul e marrom, cada um com um fio colorido e um branco listrado. O trançado faz o ruído que entra num fio entrar igual no par, e o receptor, que lê a diferença entre os dois, o cancela.',
      'Isso só funciona se os dois fios de um par ficarem nos pinos que o padrão juntou. Os pares do conector são: pinos 1 e 2, pinos 3 e 6, pinos 4 e 5, pinos 7 e 8. Repare: 3 e 6, não 3 e 4.',
      'T568B, pino 1 ao 8: branco-laranja, laranja, branco-verde, azul, branco-azul, verde, branco-marrom, marrom.',
      'T568A troca laranja com verde: branco-verde, verde, branco-laranja, azul, branco-azul, laranja, branco-marrom, marrom.',
      'Erro clássico: crimpar com as cores "em ordem de par" (bl l bv v baz az bm m). Se for igual nas duas pontas, o testador barato acende tudo verde, mas os pinos 3 e 6 ficam em pares diferentes. Isso é par dividido: diafonia alta, gigabit cai.',
      'Ferramentas: "testar c1" mostra continuidade. "certificar c1" mede a diafonia de verdade.',
    ],
  },
  dicas: [
    '"testar c1" e compare as duas pontas.',
    'A ponta b está em T568B. A ponta a está em ordem de par, que não é padrão nenhum.',
    'crimpar c1 a bl l bv az baz v bm m',
  ],
  montar: () => {
    const m = novoMundo(105);
    adicionar(m, pc('casa', { modelo: 'PC da rua das Acácias', ip: ip('192.0.2.60/24') }));
    adicionar(m, comutador('sw-poste', { modelo: 'Switch de poste SP-8' }));
    ligar(m, { equip: 'casa', porta: 'eth0' }, { equip: 'sw-poste', porta: 'p1' }, 'cat5e', 25, {
      id: 'c1',
      pinosA: ['branco-laranja', 'laranja', 'branco-verde', 'verde', 'branco-azul', 'azul', 'branco-marrom', 'marrom'],
      nota: 'post-it: "as cores tão em ordem, confia"',
    });
    m.proxCabo = 2;
    return m;
  },
  objetivo: (m) => {
    const c = m.cabos.get('c1')!;
    const e = enlace(m, 'c1');
    const w = wiremap(c.pinosA!, c.pinosB!);
    return [item('c1 ativo a 1 Gb/s', e.up && e.velocidade === 1000, e.up ? `${e.velocidade} Mb/s` : e.motivos[0]), item('sem par dividido (diafonia aprovada)', !w.parDividido), item('margem de sinal acima de 6 dB', e.up && e.margemDb >= 6)];
  },
  posMorte: [
    'A ponta a estava em "ordem de par", o que faz o fio verde cair no pino 4 em vez do 6. Com a ponta b em T568B, nem continuidade fechava.',
    'Se as duas pontas estivessem na mesma ordem errada, o testador mostraria tudo certo e o certificador reprovaria por diafonia. É o defeito mais caro da instalação: passa no teste de R$ 30, cai no gigabit.',
    'O padrão não é estética. Os pinos 3 e 6 precisam ser um par porque, no 100BASE-TX, são eles que recebem.',
  ],
};

/* ---------- Dia 6 ---------- */

const dia6: Dia = {
  numero: 6,
  ato: 1,
  titulo: 'Cruzado ou direto',
  chamado: [
    'CHAMADO #0006',
    'A escola municipal tem dois switches de 2003, um em cada prédio, e quer ligar os dois. O cabo c3 já está passado entre eles.',
    'Nenhuma luz acende. O switch da biblioteca solta um bip triste a cada 30 segundos.',
    'Objetivo: c3 ativo e o pc da secretaria pingando o pc da biblioteca.',
  ],
  manual: {
    titulo: 'MDI, MDI-X e o cabo cruzado',
    texto: [
      'No 10BASE-T e no 100BASE-TX, um lado transmite nos pinos 1 e 2 e recebe nos pinos 3 e 6. Placa de PC é MDI: transmite em 1 e 2. Porta de switch é MDI-X: já vem cruzada por dentro, transmite em 3 e 6.',
      'PC com switch: MDI com MDI-X, cabo direto. Switch com switch: MDI-X com MDI-X, o transmissor de um bate no transmissor do outro. Precisa de cabo cruzado (uma ponta T568A e a outra T568B) ou de uma porta MDI.',
      'Por isso switch velho tinha uma porta "uplink": uma porta MDI de propósito, para ligar em outro switch com cabo direto.',
      'Hoje quase tudo tem auto-MDIX: a porta descobre sozinha e cruza por dentro. Mas estes switches são de 2003. E não têm.',
    ],
  },
  dicas: [
    '"mapa" e veja de que tipo são as portas dos dois lados do c3.',
    'Duas saídas: cruzar o cabo numa ponta ou usar a porta "uplink".',
    'crimpar c3 b bv v bl az baz l bm m   (ou: mover c3 a velho-secretaria:uplink)',
  ],
  montar: () => {
    const m = novoMundo(106);
    const velho = (nome: string) => comutador(nome, { modelo: 'Switch 10/100 de 2003, sem auto-MDIX', velocidades: [10, 100], mdix: false, uplink: true });
    adicionar(m, pc('pc-secretaria', { ip: ip('192.0.2.10/24'), modelo: 'PC da secretaria' }));
    adicionar(m, pc('pc-biblioteca', { ip: ip('192.0.2.20/24'), modelo: 'PC da biblioteca' }));
    adicionar(m, velho('velho-secretaria'));
    adicionar(m, velho('velho-biblioteca'));
    ligar(m, { equip: 'pc-secretaria', porta: 'eth0' }, { equip: 'velho-secretaria', porta: 'p1' }, 'cat5e', 4);
    ligar(m, { equip: 'pc-biblioteca', porta: 'eth0' }, { equip: 'velho-biblioteca', porta: 'p1' }, 'cat5e', 6);
    ligar(m, { equip: 'velho-secretaria', porta: 'p2' }, { equip: 'velho-biblioteca', porta: 'p2' }, 'cat5e', 70, { id: 'c3', nota: 'enterrado no pátio, dentro de um conduíte' });
    m.proxCabo = 4;
    return m;
  },
  objetivo: (m) => {
    const e = enlace(m, 'c3');
    return [item('c3 ativo', e.up, e.up ? `${e.velocidade} Mb/s` : e.motivos[0]), pingOk(m, 'pc-secretaria', '192.0.2.20')];
  },
  posMorte: [
    'Duas portas MDI-X sem auto-MDIX: o transmissor de cada lado gritava no transmissor do outro, e ninguém escutava.',
    'O cabo cruzado (T568A numa ponta e T568B na outra) leva os pinos 1 e 2 de um lado para os pinos 3 e 6 do outro. A porta uplink faz o mesmo por dentro.',
    'No gigabit os quatro pares transmitem e recebem ao mesmo tempo, e o auto-MDIX virou obrigatório. Cabo cruzado hoje é peça de museu, mas museu é o que não falta em provedor pequeno.',
  ],
};

/* ---------- Dia 7 ---------- */

const dia7: Dia = {
  numero: 7,
  ato: 1,
  titulo: '100 metros e um palmo',
  chamado: [
    'CHAMADO #0007',
    'A cooperativa quer internet no galpão do fundo. Alguém passou um cabo de 130 m direto do escritório até lá. "Rede de cabo é igual mangueira, só ir esticando."',
    'O PC do galpão às vezes acende a luz da placa, às vezes não. Hoje é não.',
    'Objetivo: pc-galpao respondendo 100 pings sem perda, sem nenhum cabo de cobre acima de 100 m.',
  ],
  manual: {
    titulo: 'Atenuação e o limite de 100 m',
    texto: [
      'Todo meio atenua: o sinal perde energia com a distância. No par trançado a perda cresce com a frequência, e o gigabit usa frequências altas.',
      'O padrão de cabeamento define o canal em 100 m: 90 m de cabo fixo mais 10 m de cordões. Até aí, o fabricante garante a relação sinal-ruído. Depois disso, cada metro a mais come a margem e os erros de bit começam.',
      'Repetidor, hub ou switch no meio regeneram o sinal: recebem, recuperam os bits e transmitem de novo com potência cheia. Cada segmento ganha de novo os seus 100 m.',
      'Para distâncias maiores o certo é fibra. Mas hoje o almoxarifado tem um switch de trilho DIN com caixa hermética.',
    ],
  },
  dicas: [
    'Divida o caminho em dois segmentos.',
    '"instalar" mostra o estoque. Instale um switch no meio do pátio.',
    'desligar c2; instalar switch-din sw-meio; ligar sw-escritorio:p2 sw-meio:p1 cat6 65; ligar sw-meio:p2 pc-galpao cat6 65',
  ],
  montar: () => {
    const m = novoMundo(107);
    adicionar(m, pc('pc-escritorio', { ip: ip('192.0.2.30/24'), modelo: 'PC do escritório' }));
    adicionar(m, pc('pc-galpao', { ip: ip('192.0.2.31/24'), modelo: 'PC do galpão, coberto de pó de ração' }));
    adicionar(m, comutador('sw-escritorio', { modelo: 'Switch de mesa 8 portas' }));
    ligar(m, { equip: 'pc-escritorio', porta: 'eth0' }, { equip: 'sw-escritorio', porta: 'p1' }, 'cat6', 3);
    ligar(m, { equip: 'sw-escritorio', porta: 'p2' }, { equip: 'pc-galpao', porta: 'eth0' }, 'cat6', 130, { nota: '"rede é igual mangueira"' });
    m.catalogo['switch-din'] = { descricao: 'switch industrial 8 portas de trilho DIN, com fonte e caixa hermética', criar: (n) => comutador(n, { modelo: 'Switch industrial DIN-8' }) };
    return m;
  },
  objetivo: (m) => {
    const longos = [...m.cabos.values()].filter((c) => c.meio.startsWith('cat') && c.metros > 100);
    return [item('nenhum cabo de cobre acima de 100 m', longos.length === 0, longos.map((c) => `${c.id}: ${c.metros} m`).join(', ') || undefined), pingOk(m, 'pc-escritorio', '192.0.2.31', 100, 0)];
  },
  posMorte: [
    'Com 130 m a margem de sinal ficou negativa: o receptor não separava mais o sinal do ruído.',
    'O switch no meio não "amplifica": ele regenera. Lê cada bit, decide se é 0 ou 1 e manda de novo, limpo. O ruído do primeiro trecho morre ali.',
    'Na vida real, 130 m em cobre às vezes até liga, a 100 Mb/s, com erros. É o pior defeito possível: funciona na instalação e cai na primeira chuva.',
  ],
};

/* ---------- Dia 8 ---------- */

const dia8: Dia = {
  numero: 8,
  ato: 1,
  titulo: 'Cat errado',
  chamado: [
    'CHAMADO #0008',
    'O servidor de cache novo tem placa de 10 Gb/s e o switch do núcleo também. Mas o enlace subiu a 1 Gb/s.',
    'O cabo c1, de 80 m, foi comprado "pelo preço". Na capa está escrito CAT5E em letras orgulhosas.',
    'Objetivo: c1 ativo a 10 Gb/s.',
  ],
  manual: {
    titulo: 'Categorias de cabo',
    texto: [
      'A categoria diz até que frequência o cabo foi testado e, por consequência, que velocidade aguenta.',
      'Cat5e: 100 MHz, 1 Gb/s até 100 m. Cat6: 250 MHz, 1 Gb/s até 100 m, e 10 Gb/s só até 55 m por causa da diafonia entre cabos vizinhos (alien crosstalk). Cat6a: 500 MHz, 10 Gb/s até 100 m.',
      'A negociação automática escolhe a maior velocidade que as duas portas e o meio sustentam. Ninguém avisa: ela só sobe mais devagar e você descobre no gráfico.',
    ],
  },
  dicas: ['Leia o "cabo c1".', 'Cat6 não basta: são 80 m.', 'trocar c1 cat6a'],
  montar: () => {
    const m = novoMundo(108);
    adicionar(m, comutador('sw-nucleo', { modelo: 'Switch de núcleo 10G', velocidades: [1000, 10000] }));
    adicionar(m, pc('cache', { ip: ip('192.0.2.5/24'), modelo: 'Servidor de cache', velocidades: [1000, 10000], mdix: true }));
    ligar(m, { equip: 'sw-nucleo', porta: 'p1' }, { equip: 'cache', porta: 'eth0' }, 'cat5e', 80, { id: 'c1', nota: 'comprado pelo preço' });
    return m;
  },
  objetivo: (m) => {
    const e = enlace(m, 'c1');
    return [item('c1 ativo a 10 Gb/s', e.up && e.velocidade === 10000, e.up ? `${e.velocidade} Mb/s` : e.motivos[0])];
  },
  posMorte: [
    'O cabo era o gargalo, não as placas. Cat5e foi feito para 100 MHz, e o 10GBASE-T precisa de 500 MHz.',
    'Se você tentou Cat6, viu a armadilha: 10 Gb/s só até 55 m. Com 80 m, a porta desce para 1 Gb/s sem reclamar.',
    'Regra de ouro: categoria se escolhe pela velocidade e pela distância, nunca pelo preço do rolo.',
  ],
};

/* ---------- Dia 9 ---------- */

const dia9: Dia = {
  numero: 9,
  ato: 1,
  titulo: 'O elevador',
  chamado: [
    'CHAMADO #0009',
    '"A internet da portaria cai sempre que o elevador sobe." Você riu. Depois foi olhar: o cabo c1 corre colado no motor do elevador por 15 m.',
    'Objetivo: 1000 pings da portaria até o servidor sem nenhuma perda e margem de sinal acima de 6 dB.',
  ],
  manual: {
    titulo: 'Ruído, blindagem e aterramento',
    texto: [
      'Motores, reatores de lâmpada e inversores induzem tensão nos condutores próximos. O trançado cancela parte disso, mas uma fonte forte e colada vence o par.',
      'Três saídas: afastar o cabo da fonte (e cruzar em 90° quando precisar cruzar); trocar por cabo blindado, com malha ou folha que desvia o ruído para o terra; ou ir de fibra, que é imune.',
      'Pegadinha: blindagem sem aterramento não blinda. Vira antena e capta ainda mais. A malha precisa estar ligada ao terra do rack em pelo menos uma ponta.',
      'Erro de bit vira quadro com FCS errado. O switch descarta e conta no contador de CRC. O usuário só vê "caiu".',
    ],
  },
  dicas: ['"console sw-andar" e "mostra": olhe o contador de CRC depois de um ping longo.', 'Afaste o cabo ou blinde e aterre.', 'afastar c1   (ou: trocar c1 cat6 blindado; aterrar c1)'],
  montar: () => {
    const m = novoMundo(109);
    adicionar(m, pc('portaria', { ip: ip('192.0.2.70/24'), modelo: 'PC da portaria' }));
    adicionar(m, comutador('sw-andar', { modelo: 'Switch de andar 8 portas' }));
    adicionar(m, pc('servidor', { ip: ip('192.0.2.2/24'), modelo: 'Servidor do condomínio', mdix: true }));
    ligar(m, { equip: 'portaria', porta: 'eth0' }, { equip: 'sw-andar', porta: 'p1' }, 'cat6', 40, { id: 'c1', ruidoDb: 22, nota: 'colado no motor do elevador' });
    ligar(m, { equip: 'sw-andar', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 5, { id: 'c2' });
    m.proxCabo = 3;
    return m;
  },
  objetivo: (m) => {
    const e = enlace(m, 'c1');
    return [item('margem do c1 acima de 6 dB', e.up && e.margemDb >= 6, e.up ? `${e.margemDb.toFixed(1)} dB` : e.motivos[0]), pingOk(m, 'portaria', '192.0.2.2', 1000, 0)];
  },
  posMorte: [
    'O motor induzia 22 dB de ruído no par: mais do que toda a margem do enlace. Cada partida do elevador virava uma rajada de CRC.',
    'Afastar o cabo derruba o acoplamento. Blindar e aterrar desvia o ruído para o terra. Se você blindou e esqueceu de aterrar, viu a blindagem virar antena.',
    'O contador de CRC do switch é a testemunha. Usuário diz "caiu", o CRC diz quando, quanto e em qual porta.',
  ],
};

/* ---------- Dia 10 ---------- */

const perguntas10: Pergunta[] = [numerica('1', 'Qual a perda total do enlace c1 em 1550 nm, em dB? (fibra, conectores e emendas)', 32 * 0.22 + 2 * 0.5 + 8 * 0.1, 0.1)];

const dia10: Dia = {
  numero: 10,
  ato: 1,
  titulo: 'Orçamento de potência',
  chamado: [
    'CHAMADO #0010',
    'Dois enlaces de fibra saindo do centro. O do distrito (c1, 32 km) cai toda tarde, quando esquenta. O da escola (c2, 2 km) nunca subiu.',
    'Na gaveta tem transceptores de vários alcances. Na dúvida, a pessoa anterior pôs o mais potente na escola. "Quanto mais luz, melhor."',
    'Objetivo: c1 e c2 ativos com pelo menos 3 dB de margem, e responder a pergunta do chamado.',
  ],
  manual: {
    titulo: 'Orçamento de potência óptica',
    texto: [
      'Na fibra, tudo é soma em dB. Potência recebida = potência transmitida - perdas. As perdas são: atenuação da fibra (por km), conectores (uns 0,5 dB cada) e emendas (uns 0,1 dB cada).',
      'Fibra monomodo (OS2) atenua cerca de 0,35 dB/km em 1310 nm e 0,22 dB/km em 1550 nm. Por isso enlaces longos usam 1550 nm.',
      'O receptor tem duas fronteiras: a sensibilidade (abaixo disso não entende) e a saturação (acima disso, ofusca). A margem é a distância até a sensibilidade. Projeto sério deixa 3 dB ou mais, porque a fibra envelhece, emenda nova aparece e conector suja.',
      'Luz demais também derruba: um transceptor de 80 km num enlace de 2 km satura o receptor. Solução: transceptor mais fraco ou atenuador óptico.',
      'Ferramentas: "sfp" (gaveta), "sfp <eq:porta> <modelo>", "atenuador <eq:porta> <dB>", "luz <cabo>".',
    ],
  },
  dicas: ['"luz c1" e "luz c2". Um tem luz de menos, o outro de mais.', 'Distância longa pede 1550 nm. Distância curta com transceptor forte pede atenuador.', 'sfp sw-centro:sfp1 ER-40; sfp sw-distrito:sfp1 ER-40; atenuador sw-centro:sfp2 10; atenuador sw-escola:sfp1 10'],
  perguntas: perguntas10,
  montar: () => {
    const m = novoMundo(110);
    adicionar(m, sfp(sfp(comutador('sw-centro', { modelo: 'Switch de agregação', portas: 4, sfp: 2 }), 'sfp1', 'LX-10'), 'sfp2', 'ZX-80'));
    adicionar(m, sfp(comutador('sw-distrito', { modelo: 'Switch do distrito', portas: 4, sfp: 1 }), 'sfp1', 'LX-10'));
    adicionar(m, sfp(comutador('sw-escola', { modelo: 'Switch da escola', portas: 4, sfp: 1 }), 'sfp1', 'ZX-80'));
    ligar(m, { equip: 'sw-centro', porta: 'sfp1' }, { equip: 'sw-distrito', porta: 'sfp1' }, 'fibra', 32000, {
      id: 'c1',
      emendas: Array.from({ length: 8 }, (_, i) => ({ metros: (i + 1) * 3800, perdaDb: 0.1 })),
    });
    ligar(m, { equip: 'sw-centro', porta: 'sfp2' }, { equip: 'sw-escola', porta: 'sfp1' }, 'fibra', 2000, { id: 'c2' });
    m.proxCabo = 3;
    return m;
  },
  objetivo: (m) => {
    const a = enlace(m, 'c1');
    const b = enlace(m, 'c2');
    const t = (e: ReturnType<typeof enlace>) => (e.up ? `margem ${e.margemDb.toFixed(1)} dB` : e.motivos[0]);
    return [item('c1 ativo com 3 dB de margem ou mais', a.up && a.margemDb >= 3, t(a)), item('c2 ativo com 3 dB de margem ou mais', b.up && b.margemDb >= 3, t(b)), ...todasRespondidas(m, perguntas10)];
  },
  posMorte: [
    'No distrito, o LX-10 em 1310 nm perdia 13 dB e sobrava 2 dB de margem: qualquer variação de temperatura derrubava. Em 1550 nm a mesma fibra perde 8,84 dB.',
    'Na escola, o ZX-80 entregava +2,6 dBm num receptor que satura em -3 dBm. Luz demais é tão fatal quanto luz de menos.',
    'Orçamento óptico é aritmética de dB. Quem faz a conta antes não descobre na escada.',
  ],
};

/* ---------- Dia 11 ---------- */

const dia11: Dia = {
  numero: 11,
  ato: 1,
  titulo: 'Retroescavadeira',
  chamado: [
    'CHAMADO #0011  severidade: retroescavadeira',
    'A prefeitura abriu uma vala na avenida. O enlace c1 (3 km) caiu às 9h14. A obra jura que não foi ela.',
    'Objetivo: achar o ponto do rompimento, fundir a fibra com emenda de até 0,1 dB e trazer o c1 de volta.',
  ],
  manual: {
    titulo: 'OTDR e fusão',
    texto: [
      'O OTDR manda um pulso de luz e mede o que volta. A fibra espalha um pouquinho de luz para trás o tempo todo (retroespalhamento de Rayleigh), e conectores e rupturas refletem forte.',
      'Distância do evento = (c ÷ índice de grupo) × tempo do eco ÷ 2. O "÷ 2" é porque a luz vai e volta.',
      'Na fusão, a qualidade depende do corte. A clivadora quebra a fibra; o ângulo ideal fica abaixo de 1°. Corte torto vira emenda com perda alta.',
      'Uma boa emenda por fusão perde menos de 0,1 dB e não reflete. Se ficar ruim, corta e refaz: emenda é barata, retrabalho na caixa fechada não.',
      'Ferramentas: "otdr c1", "clivar", "fundir c1 <metros>", "cortar c1 <metros>".',
    ],
  },
  dicas: ['O OTDR mostra onde a fibra acaba antes da hora.', 'Olhe o ângulo da clivagem antes de fundir.', 'otdr c1; clivar; clivar; fundir c1 1340'],
  montar: () => {
    const m = novoMundo(111);
    adicionar(m, sfp(comutador('sw-centro', { portas: 4, sfp: 1, modelo: 'Switch do centro' }), 'sfp1', 'LX-10'));
    adicionar(m, sfp(comutador('sw-avenida', { portas: 4, sfp: 1, modelo: 'Switch da avenida' }), 'sfp1', 'LX-10'));
    ligar(m, { equip: 'sw-centro', porta: 'sfp1' }, { equip: 'sw-avenida', porta: 'sfp1' }, 'fibra', 3000, { id: 'c1', ruptura: 1340, emendas: [{ metros: 820, perdaDb: 0.08 }], nota: 'passa embaixo da avenida' });
    m.flags.clivagens = [2.3, 0.4];
    m.proxCabo = 2;
    return m;
  },
  objetivo: (m) => {
    const c = m.cabos.get('c1')!;
    const e = enlace(m, 'c1');
    const ruins = (c.emendas ?? []).filter((x) => x.perdaDb > 0.1);
    return [item('c1 ativo', e.up, e.up ? undefined : e.motivos[0]), item('todas as emendas com até 0,1 dB', ruins.length === 0, ruins.map((x) => `${x.metros} m: ${x.perdaDb} dB`).join(', ') || undefined)];
  },
  posMorte: [
    'O OTDR achou o fim da fibra a 1340 m, bem embaixo da vala que a obra jurou não ter cavado.',
    'A primeira clivagem saiu a 2,3°. Se você fundiu com ela, a emenda passou de 0,3 dB, e o enlace subiu, mas fora do padrão. O certo era clivar de novo.',
    'A emenda antiga a 820 m apareceu no OTDR como um degrau sem pico: emenda por fusão não reflete. Conector e ruptura refletem.',
  ],
};

/* ---------- Dia 12 ---------- */

const dia12: Dia = {
  numero: 12,
  ato: 1,
  titulo: 'Amarelo com aqua',
  chamado: [
    'CHAMADO #0012',
    'Enlace de 10 Gb/s entre o rack e o 3º andar, recém-instalado. Não sobe. A pessoa anterior deixou escrito: "fibra é fibra".',
    'Objetivo: c1 ativo a 10 Gb/s com pelo menos 3 dB de margem.',
  ],
  manual: {
    titulo: 'Monomodo, multimodo e dispersão modal',
    texto: [
      'Fibra monomodo (OS2, capa amarela) tem núcleo de 9 µm: só um modo de luz passa, e vai longe. Multimodo tem núcleo de 50 µm (OM3 aqua, OM4 violeta) ou 62,5 µm (OM1 laranja): muitos modos, alcance curto, transceptor barato.',
      'Encostar um núcleo de 50 µm num de 9 µm joga fora quase toda a luz. Os cordões precisam ser do mesmo tipo do tronco.',
      'Em multimodo, cada modo percorre um caminho de comprimento diferente e chega numa hora diferente. Isso alarga o pulso: dispersão modal. Quanto maior a taxa, menor o alcance. Para 10 Gb/s: OM1 vai a 33 m, OM3 a 300 m e OM4 a 400 m.',
      'Ferramenta: "segmento c1" lista os trechos; "segmento c1 <n> <tipo>" troca um cordão.',
    ],
  },
  dicas: ['"segmento c1": olhe a cor de cada trecho.', 'Um cordão é amarelo no meio de tudo aqua.', 'segmento c1 1 om3'],
  montar: () => {
    const m = novoMundo(112);
    adicionar(m, sfp(comutador('sw-rack', { portas: 4, sfp: 1, modelo: 'Switch do rack' }), 'sfp1', 'SR-10G'));
    adicionar(m, sfp(comutador('sw-andar3', { portas: 4, sfp: 1, modelo: 'Switch do 3º andar' }), 'sfp1', 'SR-10G'));
    ligar(m, { equip: 'sw-rack', porta: 'sfp1' }, { equip: 'sw-andar3', porta: 'sfp1' }, 'fibra', 286, {
      id: 'c1',
      conectores: 4,
      segmentos: [
        { nome: 'cordão do rack', fibra: 'os2', metros: 3 },
        { nome: 'tronco', fibra: 'om3', metros: 280 },
        { nome: 'cordão do andar', fibra: 'om3', metros: 3 },
      ],
      nota: '"fibra é fibra"',
    });
    m.proxCabo = 2;
    return m;
  },
  objetivo: (m) => {
    const e = enlace(m, 'c1');
    return [item('c1 ativo a 10 Gb/s', e.up && e.velocidade === 10000, e.up ? undefined : e.motivos[0]), item('margem de 3 dB ou mais', e.up && e.margemDb >= 3, e.up ? `${e.margemDb.toFixed(1)} dB` : undefined)];
  },
  posMorte: [
    'O cordão amarelo (OS2, 9 µm) no meio de um enlace aqua (OM3, 50 µm) jogava fora uns 18 dB. O receptor ficava no escuro.',
    'Se você tentou um cordão OM1, encontrou a dispersão modal: 10 Gb/s em OM1 só vai a 33 m, e o enlace tem 286 m. O alcance multimodo vale para o caminho inteiro, e o pior trecho manda.',
    'Fibra não é fibra. Cor de capa existe para isso.',
  ],
};

/* ---------- Dia 13 ---------- */

const perguntas13: Pergunta[] = [numerica('1', 'Qual a capacidade de Shannon desta linha (3100 Hz, 30 dB), em kb/s?', (3100 * Math.log2(1001)) / 1000, 0.3)];

const dia13: Dia = {
  numero: 13,
  ato: 1,
  titulo: 'Nyquist manda lembranças',
  chamado: [
    'CHAMADO #0013',
    'O sítio do Morro Alto só tem linha telefônica de cobre. O modem de lá está a 4,8 kb/s, configurado pelo modo "seguro" da fábrica.',
    'O alarme do sítio precisa de pelo menos 24 kb/s para mandar as fotos das câmeras.',
    'Objetivo: modem sincronizado a 24 kb/s ou mais, e responder a pergunta do chamado.',
  ],
  manual: {
    titulo: 'Nyquist, Shannon e modulação',
    texto: [
      'Um canal com banda B (em Hz) aceita no máximo 2B símbolos por segundo sem que um símbolo atropele o outro. Esse é o limite de Nyquist, e a taxa de símbolos se mede em baud (Bd).',
      'Cada símbolo carrega log₂(M) bits, onde M é o número de estados da modulação: QPSK tem 4 (2 bits), 16-QAM tem 16 (4 bits), 64-QAM tem 64 (6 bits).',
      'Mais estados por símbolo exigem mais SNR, porque os pontos da constelação ficam mais perto uns dos outros e o ruído confunde. Aproximação para BER de 10⁻⁶: QPSK 13,5 dB, 16-QAM 20,5 dB, 64-QAM 26,5 dB, 256-QAM 32,5 dB.',
      'Shannon põe o teto final: C = B × log₂(1 + S/N), com S/N em escala linear. 30 dB são 1000 vezes. Nenhuma combinação de baud e modulação passa disso.',
      'Console do modem: "mostra", "taxa-simbolos <Bd>", "modulacao <tipo>", "treinar".',
    ],
  },
  dicas: ['A linha tem 3100 Hz e 30 dB de SNR. Calcule os dois limites antes de mexer.', 'Nyquist: até 6200 Bd. SNR: até 64-QAM. Shannon: até uns 30,9 kb/s.', 'taxa-simbolos 4800; modulacao qam64; treinar'],
  perguntas: perguntas13,
  montar: () => {
    const m = novoMundo(113);
    adicionar(m, aparelho('modem', 'modem', 'Modem de linha discada MD-336', [{ nome: 'linha' }], { bandaHz: 3100, snrDb: 30, baud: 2400, modulacao: 'qpsk' }));
    return m;
  },
  objetivo: (m) => {
    const r = avaliarModem(m.equipamentos.get('modem')!.s as any);
    return [item('modem sincronizado', r.ok, r.ok ? undefined : r.motivos[0]), item('taxa de 24 kb/s ou mais', r.ok && r.taxa >= 24000, `${(r.taxa / 1000).toFixed(1)} kb/s`), respondida(m, perguntas13[0]!)];
  },
  posMorte: [
    'Três limites seguraram o modem: Nyquist na taxa de símbolos (6200 Bd), a SNR na modulação (até 64-QAM) e Shannon no total (30,9 kb/s).',
    'Configurações como 6000 Bd com 64-QAM (36 kb/s) passam em Nyquist e na SNR, mas batem em Shannon. Ele é o teto de qualquer codificação, de qualquer época.',
    'Os modems discados reais chegaram a 33,6 kb/s exatamente encostando nesse teto, com codificação muito mais esperta que a nossa.',
  ],
};

/* ---------- Dia 14 ---------- */

const perguntas14: Pergunta[] = [numerica('1', 'Quantos kb/s carrega um intervalo de tempo do E1?', 64, 0)];

const dia14: Dia = {
  numero: 14,
  ato: 1,
  titulo: 'O E1 da prefeitura',
  chamado: [
    'CHAMADO #0014',
    'A prefeitura tem um E1 antigo e quer usar para 10 linhas de telefone e para dados ao mesmo tempo. Hoje ele está inteiro em dados e o PABX não toca.',
    'O contrato exige pelo menos 1024 kb/s de dados.',
    'Objetivo: 10 canais de voz, sinalização no lugar certo, quadro alinhado e 1024 kb/s ou mais de dados.',
  ],
  manual: {
    titulo: 'Multiplexação por divisão de tempo (TDM)',
    texto: [
      'A voz digital clássica é amostrada 8000 vezes por segundo com 8 bits por amostra: 64 kb/s por canal (PCM).',
      'O E1 junta 32 desses canais num quadro de 256 bits, repetido 8000 vezes por segundo: 32 × 64 = 2048 kb/s. Cada canal é um intervalo de tempo (timeslot), numerado de 0 a 31.',
      'O intervalo 0 é sagrado: leva o padrão de enquadramento que diz ao outro lado onde o quadro começa. Mexer nele dá LOF, perda de quadro, e tudo cai.',
      'Com sinalização associada ao canal, o intervalo 16 carrega a sinalização das linhas de voz (fora do gancho, discagem). Sobram 30 intervalos para voz ou dados.',
      'Console do mux: "mostra" e "slot <lista> <uso>", por exemplo "slot 1-10 voz".',
    ],
  },
  dicas: ['"console mux" e "mostra".', 'Voz em 10 intervalos, o 16 para sinalização e o resto em dados. O 0 não se toca.', 'slot 1-10 voz; slot 16 sinalizacao'],
  perguntas: perguntas14,
  montar: () => {
    const m = novoMundo(114);
    const slots: UsoSlot[] = Array.from({ length: 32 }, (_, i) => (i === 0 ? 'enquadramento' : 'dados'));
    adicionar(m, aparelho('mux', 'mux', 'Multiplexador E1 de 1999', [{ nome: 'e1' }], { slots }));
    return m;
  },
  objetivo: (m) => {
    const r = avaliarE1(m.equipamentos.get('mux')!.s.slots);
    return [
      item('quadro alinhado (intervalo 0 em enquadramento)', !r.lof),
      item('sinalização no intervalo 16', r.sinalizacao),
      item('10 canais de voz ou mais', r.voz >= 10, `${r.voz}`),
      item('1024 kb/s de dados ou mais', r.dados >= 1024, `${r.dados} kb/s`),
      respondida(m, perguntas14[0]!),
    ];
  },
  posMorte: [
    'Cada intervalo carrega 8 bits, 8000 vezes por segundo: 64 kb/s. É a velocidade de uma ligação telefônica digital desde os anos 60.',
    'Você reservou o 16 para a sinalização e 10 intervalos de voz. Os 20 restantes deram 1280 kb/s de dados.',
    'TDM garante a banda de cada canal mesmo quando ele está em silêncio. Bom para voz, desperdício para dados. Por isso o mundo foi para a comutação de pacotes, que você encontra no ato 4.',
  ],
};

/* ---------- Dia 15 ---------- */

const perguntas15: Pergunta[] = [numerica('1', 'Qual o raio da 1ª zona de Fresnel no meio do enlace de 8 km a 5,8 GHz, em metros?', 8.657 * Math.sqrt(8 / 5.8), 0.2)];

const dia15: Dia = {
  numero: 15,
  ato: 1,
  titulo: 'Rádio no morro',
  chamado: [
    'CHAMADO #0015',
    'O bairro do Morro Alto vai receber internet por rádio ponto a ponto: 8 km, a 5,8 GHz, da torre do centro até o mastro do morro.',
    'O rádio do centro está pronto. O do morro foi montado por alguém com pressa: apontado "mais ou menos para lá", num mastro curto.',
    'No meio do caminho tem um eucaliptal de 18 m de altura.',
    'Objetivo: RSSI de -65 dBm ou melhor no enlace, e responder a pergunta do chamado.',
  ],
  manual: {
    titulo: 'Enlace de rádio: espaço livre, alinhamento e Fresnel',
    texto: [
      'Mesmo sem obstáculo, o sinal se espalha: perda no espaço livre = 32,44 + 20 log₁₀(d em km) + 20 log₁₀(f em MHz), em dB.',
      'Sinal recebido (RSSI) = potência + ganho das duas antenas - perdas. Antena direcional tem feixe estreito: alguns graus fora já custam muitos dB.',
      'Visada não é só "enxergar o outro lado". A energia viaja num elipsoide em volta da linha reta, a 1ª zona de Fresnel. No meio do enlace, o raio é r = 8,657 × √(d em km ÷ f em GHz) metros. Obstáculo dentro dos 60 % desse raio já rouba sinal.',
      'Ferramentas: "antena <eq> azimute <graus>", "antena <eq> altura <m>", e "mostra" no console do rádio.',
    ],
  },
  dicas: ['"console radio-morro" e "mostra": compare o rumo com o azimute.', 'Raio de Fresnel de uns 10 m; 60 % são uns 6 m acima do eucalipto.', 'antena radio-morro azimute 47; antena radio-morro altura 25'],
  perguntas: perguntas15,
  montar: () => {
    const m = novoMundo(115);
    const radio = (nome: string, antena: Equipamento['antena'], rumo: number) => {
      const e = aparelho(nome, 'radio', 'Rádio PTP 5,8 GHz com antena de 23 dBi', [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo, alturaMax: 30 });
      e.antena = antena;
      return e;
    };
    adicionar(m, radio('radio-centro', { ganho: 23, azimute: 227, azimuteCerto: 227, altura: 30, feixe: 9 }, 227));
    adicionar(m, radio('radio-morro', { ganho: 23, azimute: 30, azimuteCerto: 47, altura: 15, feixe: 9 }, 47));
    ligar(m, { equip: 'radio-centro', porta: 'ar' }, { equip: 'radio-morro', porta: 'ar' }, 'radio', 8000, { id: 'c1', radio: { distanciaKm: 8, freqGHz: 5.8, obstaculoM: 18, ptxDbm: 20 } });
    m.proxCabo = 2;
    return m;
  },
  objetivo: (m) => {
    const d = radioDados(m, m.cabos.get('c1')!);
    return [item('RSSI de -65 dBm ou melhor', d.rssi >= -65, `${d.rssi.toFixed(1)} dBm`), respondida(m, perguntas15[0]!)];
  },
  posMorte: [
    'Havia dois problemas somados. A antena estava 17° fora com um feixe de 9°: dezenas de dB perdidos. E o mastro de 15 m deixava o eucaliptal dentro da zona de Fresnel.',
    'Com 25 m de altura sobram 7 m sobre as árvores, acima dos 6,1 m (60 % do raio). Aí o RSSI encosta no valor teórico: uns -60 dBm.',
    'E lembre: eucalipto cresce. O enlace que passa raspando hoje some em dois anos.',
  ],
};

/* ---------- Dia 16 ---------- */

const perguntas16: Pergunta[] = [
  {
    id: '1',
    texto: 'Quais são os três canais de 2,4 GHz que não se sobrepõem entre si?',
    confere: (r) => {
      const n = (r.match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b);
      return n.join(',') === '1,6,11';
    },
  },
];

/** A rede da padaria: um BSS de infraestrutura, com o AP em 802.11g. O BSSID é o MAC do rádio do AP. */
export const SSID_PADARIA = 'PADARIA_PAO_QUENTE';
export const BSSID_PADARIA = '02:00:5e:16:00:01';
export const estadoApPadaria = (): EstadoAp => ({
  canal: 1,
  sinalCliente: -55,
  ruidoDbm: -95,
  vizinhos: [
    { nome: 'CASA_DA_TIA_2.4', canal: 1, dbm: -50 },
    { nome: 'Bar do Zé Clientes', canal: 2, dbm: -80 },
    { nome: 'Vizinho_Sem_Senha', canal: 10, dbm: -80 },
    { nome: 'ImpressoraJatoDeTinta_SETUP', canal: 11, dbm: -55 },
  ],
});

/** Taxa que o cliente 802.11g consegue com a SNR atual (modulação adaptativa), ou null se nem associa. */
export const taxaClienteWifi = (m: Mundo, ap = 'ap') => modulacaoAdaptativa(snrWifi(m.equipamentos.get(ap)!.s as any).snr);
const textoTaxa = (t: TaxaWifi | null) => (t ? `${fmt(t.mbps, t.mbps % 1 ? 1 : 0)} Mb/s em ${t.modulacao} ${t.codificacao}` : 'SNR baixa demais: nem associa');

const dia16: Dia = {
  numero: 16,
  ato: 1,
  titulo: 'Canal lotado',
  chamado: [
    'CHAMADO #0016',
    `O ponto de acesso da padaria, rede "${SSID_PADARIA}", está no canal 1, de fábrica. O Wi-Fi "funciona, mas não funciona": o celular vê a rede e não consegue ficar nela. Ao redor tem uma dúzia de redes de vizinhos.`,
    'Objetivo: SNR de 25 dB ou mais no cliente, o cliente a 54 Mb/s, e responder a pergunta do chamado.',
  ],
  manual: {
    titulo: 'Wi-Fi: arquitetura e camada física',
    texto: [
      `Modo infraestrutura: os aparelhos (estações) falam com um ponto de acesso (AP). AP e estações formam um BSS, identificado pelo BSSID, que é o MAC do rádio do AP (aqui, ${BSSID_PADARIA}). O SSID é o nome da rede, o que aparece na lista do celular.`,
      'Vários APs com o mesmo SSID, ligados por um sistema de distribuição (em geral, um switch), formam um ESS: o celular troca de AP sem trocar de rede (roaming, com reassociação). No modo ad hoc não há AP: as estações falam direto, num IBSS.',
      'O 802.11 cobre a camada física e a subcamada MAC da camada de enlace. Em cima vem o LLC (802.2), igual ao da Ethernet, que entrega os dados ao IP. Uma MAC só, várias camadas físicas embaixo.',
      'Para entrar na rede, a estação acha o AP (varredura passiva, ouvindo o beacon que ele manda a cada 102,4 ms, ou ativa, mandando probe request e ouvindo o probe response), autentica e associa.',
      'Camadas físicas: 802.11b (DSSS, 1 a 11 Mb/s, 2,4 GHz); 802.11a e g (OFDM, até 54 Mb/s, em 5 e 2,4 GHz); 802.11n (MIMO e canais de 40 MHz, até 600 Mb/s); 802.11ac (só 5 GHz, 80 e 160 MHz, MU-MIMO na descida); 802.11ax (OFDMA, em 2,4, 5 e 6 GHz). O rádio escolhe a modulação pela SNR: sinal limpo, 64-QAM; sinal sujo, BPSK.',
      'A faixa de 2,4 GHz tem canais de 1 a 13, separados de 5 MHz, mas cada transmissão ocupa uns 22 MHz. Só três canais não se sobrepõem: 1, 6 e 11.',
      'SNR é a distância entre o sinal que interessa e tudo o que não interessa (ruído de fundo + interferência). A interferência de um vizinho conta pela fração do canal dele que cai dentro do seu.',
      'Ferramentas: "espectro" no campo (lista as redes que anunciam beacon em cada canal); "canal <n>" e "mostra" no console do AP.',
    ],
  },
  dicas: ['"espectro": veja onde estão os vizinhos fortes.', 'Procure o canal que fique a 5 canais ou mais dos vizinhos fortes.', 'console ap; canal 6'],
  perguntas: perguntas16,
  montar: () => {
    const m = novoMundo(116);
    const ap = aparelho('ap', 'ap', `Ponto de acesso 802.11g da padaria, rede "${SSID_PADARIA}"`, [{ nome: 'lan' }], { ...estadoApPadaria(), ssid: SSID_PADARIA, bssid: BSSID_PADARIA });
    adicionar(m, ap);
    ap.mac = BSSID_PADARIA;
    return m;
  },
  objetivo: (m) => {
    const r = snrWifi(m.equipamentos.get('ap')!.s as any);
    const t = taxaClienteWifi(m);
    return [item('SNR de 25 dB ou mais no cliente', r.snr >= 25, `${r.snr.toFixed(1)} dB`), item('cliente associado a 54 Mb/s', t?.mbps === 54, textoTaxa(t)), respondida(m, perguntas16[0]!)];
  },
  posMorte: [
    'No canal 1 a padaria disputava com a casa da tia, que chegava mais forte que o próprio AP. SNR negativa: o celular pegava o beacon da padaria nos intervalos em que a tia ficava quieta e achava a rede, mas com a tia falando por cima não sustentava nem a taxa mais baixa do 802.11g (6 Mb/s em BPSK).',
    'Canais 5 e 7 parecem livres no analisador, mas ficam a 4 canais de vizinhos fortes e herdam a borda deles. O 6 fica a 5 canais do 1 e do 11: sobreposição zero.',
    `No canal 6 a SNR foi para ${fmt(snrWifi({ ...estadoApPadaria(), canal: 6 }).snr, 1)} dB e a modulação adaptativa subiu até o teto do 802.11g: ${textoTaxa(modulacaoAdaptativa(snrWifi({ ...estadoApPadaria(), canal: 6 }).snr))}.`,
    `A rede da padaria é um BSS de infraestrutura: um AP (BSSID ${BSSID_PADARIA}) e os celulares associados a ele. Um segundo AP nos fundos, com o mesmo SSID e ligado pelo mesmo switch, viraria um ESS, de preferência no canal 1 ou 11 para não brigar com o primeiro.`,
    'Em 5 GHz há muito mais canais sem sobreposição. No ato 3 você volta aqui, com o Wi-Fi inteiro.',
  ],
};

/* ---------- Dia 17 ---------- */

const dia17: Dia = {
  numero: 17,
  ato: 1,
  titulo: 'DOCSIS na rua',
  chamado: [
    'CHAMADO #0017',
    'Cliente de TV a cabo antigo migrou para internet. O modem passa o dia piscando. A descida coaxial tem 40 m e, pelo que o cliente lembra, "uns divisores que o técnico de antena pôs".',
    'Objetivo: modem ONLINE com nível de descida entre -7 e +7 dBmV e MER de 35 dB ou mais.',
  ],
  manual: {
    titulo: 'Rede coaxial e DOCSIS',
    texto: [
      'Na rede de cabo, o mesmo coaxial leva TV e internet em frequências diferentes. O padrão DOCSIS põe os dados em canais de 6 MHz modulados em 256-QAM na descida.',
      'O nível de sinal no modem se mede em dBmV. Ele aceita de -15 a +15, mas o ideal fica entre -7 e +7. Fora disso, o MER (a qualidade da modulação) cai.',
      'Tudo no caminho perde: cabo (RG59 perde mais que RG6), divisores (2 vias ≈ 3,5 dB, 4 vias ≈ 7 dB, 8 vias ≈ 11 dB) e conectores. Conector oxidado é perda e ruído ao mesmo tempo.',
      'Ferramentas: "coax c1" lista o caminho; "coax c1 remover <n>", "coax c1 trocar <n> <peça>", "coax c1 inserir <n> atenuador <dB>". E "console modem" com "MOSTRA".',
    ],
  },
  dicas: ['"coax c1" mostra o nível depois de cada peça.', 'Divisor de 8 vias numa casa com um ponto só é desperdício de 11 dB. E tem um conector verde.', 'coax c1 remover 2; coax c1 trocar 2 conector'],
  montar: () => {
    const m = novoMundo(117);
    adicionar(m, aparelho('tap', 'cmts', 'Tap da rede coaxial no poste', [{ nome: 'saida', fisica: 'coax' }]));
    adicionar(m, aparelho('modem', 'cablemodem', 'Cable modem DOCSIS 3.1', [{ nome: 'rf', fisica: 'coax' }, { nome: 'lan' }]));
    ligar(m, { equip: 'tap', porta: 'saida' }, { equip: 'modem', porta: 'rf' }, 'coax', 40, {
      id: 'c1',
      coax: {
        tapDbmv: 12,
        elementos: [
          { tipo: 'cabo', modelo: 'rg59', metros: 40 },
          { tipo: 'splitter', vias: 8 },
          { tipo: 'conector', oxidado: true },
          { tipo: 'splitter', vias: 2 },
        ],
      },
    });
    m.proxCabo = 2;
    return m;
  },
  objetivo: (m) => {
    const c = m.cabos.get('c1')!;
    const { nivel, mer } = coaxDados(c);
    const e = enlace(m, 'c1');
    return [item('modem ONLINE', e.up, e.up ? undefined : e.motivos[0]), item('nível entre -7 e +7 dBmV', nivel >= -7 && nivel <= 7, `${nivel.toFixed(1)} dBmV`), item('MER de 35 dB ou mais', mer >= 35, `${mer.toFixed(1)} dB`)];
  },
  posMorte: [
    'Saindo do tap com +12 dBmV, o sinal perdia 9,8 dB no RG59, 11 dB no divisor de 8 vias, 6 dB no conector oxidado e 3,5 dB no divisor de 2: chegava a -18 dBmV, e o modem não travava.',
    'Tirar o divisor inútil e trocar o conector trouxe o nível para perto de -1,5 dBmV, no meio da janela ideal.',
    'Se tivesse sinal demais (acima de +15), a solução seria o contrário: um atenuador. Em RF, o objetivo nunca é "mais sinal", é "o sinal certo".',
  ],
};

/* ---------- Dia 18 ---------- */

const perguntas18: Pergunta[] = [numerica('1', 'Quanto tempo a luz leva para subir até um satélite geoestacionário (35.786 km) e descer de volta, em ms?', ((2 * 35786e3) / LUZ) * 1000, 1)];

const dia18: Dia = {
  numero: 18,
  ato: 1,
  titulo: 'Satélite e paciência',
  chamado: [
    'CHAMADO #0018  último do ato',
    'A fazenda Fim do Mundo só tem internet por satélite geoestacionário. O filho do dono joga online e o chamado diz: "PING DE 500, IMPOSSÍVEL JOGAR, VOCÊS SÃO UM PROVEDOR OU UMA CARTA REGISTRADA?"',
    'Objetivo: média de ping abaixo de 100 ms até o servidor do jogo, em pelo menos 10 pedidos, e responder a pergunta do chamado.',
  ],
  manual: {
    titulo: 'Satélites e o atraso que a física não negocia',
    texto: [
      'Satélite geoestacionário fica a 35.786 km de altitude, girando junto com a Terra: parece parado no céu, e a antena não precisa se mexer.',
      'O preço é a distância. A luz, a 299.792 km/s, leva uns 120 ms para subir e outros 120 ms para descer. Um ping atravessa isso duas vezes (ida e volta): mais de 480 ms só de propagação.',
      'Constelações de órbita baixa ficam a algumas centenas de quilômetros. O atraso de propagação cai para poucos milissegundos, mas os satélites passam rápido e o terminal precisa trocar de satélite o tempo todo.',
      'Vazão e atraso são coisas diferentes. Dá para ter 50 Mb/s com 500 ms. Para jogo e voz, o atraso manda.',
      'Ferramenta: "orbita <cabo> <geo|meo|leo>" troca o terminal.',
    ],
  },
  dicas: ['Faça a conta: 2 × 35.786 km ÷ velocidade da luz.', 'Nenhuma configuração no terminal geoestacionário resolve. Troque de órbita.', 'orbita c2 leo; console casa; ping 192.0.2.60 10'],
  perguntas: perguntas18,
  montar: () => {
    const m = novoMundo(118);
    adicionar(m, pc('casa', { ip: ip('192.0.2.50/24'), modelo: 'PC gamer com LED em tudo', mdix: true }));
    adicionar(m, aparelho('terminal', 'terminal-sat', 'Terminal de satélite', [{ nome: 'lan' }, { nome: 'ceu', fisica: 'sat' }]));
    adicionar(m, aparelho('gateway', 'gateway-sat', 'Estação terrena do provedor de satélite', [{ nome: 'ceu', fisica: 'sat' }, { nome: 'lan' }]));
    adicionar(m, pc('jogo', { ip: ip('192.0.2.60/24'), modelo: 'Servidor do jogo', mdix: true }));
    ligar(m, { equip: 'casa', porta: 'eth0' }, { equip: 'terminal', porta: 'lan' }, 'cat6', 10);
    ligar(m, { equip: 'terminal', porta: 'ceu' }, { equip: 'gateway', porta: 'ceu' }, 'satelite', 0, { id: 'c2', sat: { orbita: 'geo' } });
    ligar(m, { equip: 'gateway', porta: 'lan' }, { equip: 'jogo', porta: 'eth0' }, 'cat6', 5, { id: 'c3' });
    m.proxCabo = 4;
    return m;
  },
  objetivo: (m) => [pingOk(m, 'casa', '192.0.2.60', 10, 0, 100), respondida(m, perguntas18[0]!)],
  posMorte: [
    'A 35.786 km, subir e descer leva uns 239 ms. O ping faz isso duas vezes: ida e volta somam perto de meio segundo, antes de qualquer roteador.',
    'Em órbita baixa, a 550 km, a propagação cai para uns 4 ms por travessia. O que sobra é processamento e o caminho em solo.',
    'Fim do ato 1. Você domou a camada física: cobre, fibra, rádio, coaxial, telefonia e satélite. A partir do ato 2, os bits chegam. O problema passa a ser saber se chegaram certos.',
  ],
};

export const ATO1: Dia[] = [dia5, dia6, dia7, dia8, dia9, dia10, dia11, dia12, dia13, dia14, dia15, dia16, dia17, dia18];

