// Dias do ato 5 (A Conversa), com prática guiada, aula e desafio no próprio dia.
// Controle de congestionamento e justiça (6.3), UDP, RPC e RTP (6.4) e o TCP por dentro (6.5.1 a 6.5.6),
// na sala dos servidores de Fim de Linha.

import { escutar, soquetesDe } from '../motor/transporte';
import { tcpConfere } from '../motor/cliTransporte';
import type { ConfigTcp } from '../motor/tcp';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;
const num = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');

interface OpcoesSala {
  semente: number;
  /** Nome e modelo da máquina da sala dos servidores que manda. */
  cliente: [string, string];
  /** Nome, modelo e IP (numa /24 com gateway .1) da máquina do outro lado. */
  servidor: [string, string, string];
  /** Banda do enlace da sala até a regional (o gargalo), em Mb/s. */
  mbps: number;
  /** Buffer da fila do gargalo, em pacotes. */
  buffer?: number;
  /** Atraso extra de cada sentido, em ms (a distância até a regional). */
  atrasoMs?: number;
  /** Perda aleatória extra (meio sem fio), de 0 a 1. */
  perda?: number;
  /** Configuração TCP já mexida no cliente. */
  tcp?: Partial<ConfigTcp>;
  /** Serviços que o servidor já escuta. */
  escutas?: ['tcp' | 'udp', number, string?][];
}

/**
 * A sala dos servidores (10.50.1.0/24) sai pela borda-sala, por um enlace que é o gargalo, até o roteador da
 * regional, onde fica o servidor do outro lado. Endereços privados dentro da cidade, de documentação fora.
 */
function mundoSala(o: OpcoesSala): Mundo {
  const m = novoMundo(o.semente);
  m.flags.transporte = true;
  const [cNome, cModelo] = o.cliente;
  const [sNome, sModelo, sIp] = o.servidor;
  const rede = sIp.replace(/\.\d+$/, '');
  adicionar(m, pc(cNome, { ip: cidr('10.50.1.10/24'), gateway: '10.50.1.1', modelo: cModelo }));
  adicionar(m, pc(sNome, { ip: cidr(`${sIp}/24`), gateway: `${rede}.1`, modelo: sModelo }));
  adicionar(m, roteador('borda-sala', { modelo: 'Roteador de borda da sala dos servidores', interfaces: { lan: '10.50.1.1/24', wan: '10.0.50.1/30' }, rotas: [{ destino: `${rede}.0/24`, via: '10.0.50.2' }] }));
  adicionar(m, roteador('regional', { modelo: 'Roteador do data center regional', interfaces: { sala: '10.0.50.2/30', lan: `${rede}.1/24` }, rotas: [{ destino: '10.50.1.0/24', via: '10.0.50.1' }] }));
  ligar(m, { equip: cNome, porta: 'eth0' }, { equip: 'borda-sala', porta: 'lan' }, 'cat6', 10, { id: 'c1' });
  ligar(m, { equip: 'borda-sala', porta: 'wan' }, { equip: 'regional', porta: 'sala' }, 'cat6', 90, { id: 'c2' });
  ligar(m, { equip: 'regional', porta: 'lan' }, { equip: sNome, porta: 'eth0' }, 'cat6', 10, { id: 'c3' });
  m.proxCabo = 4;
  const buffer = o.buffer ?? 64;
  // O enlace da sala até a regional negocia só a velocidade do gargalo, e a fila de cada ponta tem esse buffer.
  m.equipamentos.get('borda-sala')!.portas.find((p) => p.nome === 'wan')!.velocidades = [o.mbps];
  m.equipamentos.get('regional')!.portas.find((p) => p.nome === 'sala')!.velocidades = [o.mbps];
  m.equipamentos.get('borda-sala')!.s.fila = { wan: { buffer, capacidade: o.mbps } };
  m.equipamentos.get('regional')!.s.fila = { sala: { buffer, capacidade: o.mbps } };
  const cli = m.equipamentos.get(cNome)!;
  const cam: { atraso?: number; perda?: number } = {};
  if (o.atrasoMs) cam.atraso = o.atrasoMs / 1000;
  if (o.perda) cam.perda = o.perda;
  if (Object.keys(cam).length) cli.s.caminhoTransporte = cam;
  if (o.tcp) cli.s.tcp = { ...o.tcp };
  const srv = m.equipamentos.get(sNome)!;
  for (const [proto, porta, nome] of o.escutas ?? []) escutar(m, srv, proto, porta, nome);
  return m;
}

function caminhoDe(m: Mundo, nome: string): { atraso?: number; perda?: number } {
  return (m.equipamentos.get(nome)!.s.caminhoTransporte ?? {}) as { atraso?: number; perda?: number };
}

function escutando(m: Mundo, equip: string, proto: 'tcp' | 'udp', porta: number): boolean {
  return soquetesDe(m.equipamentos.get(equip)!).some((s) => s.proto === proto && s.portaLocal === porta && !s.ipRemoto && (s.estado === 'LISTEN' || s.estado === 'ABERTO'));
}

/* ======================================================================
 * ref 104: Dividir a banda com justiça (6.3)
 * ====================================================================== */

const DC = '203.0.113.10';

function mundo104(semente: number, perda?: number): Mundo {
  return mundoSala({
    semente,
    cliente: ['copias', 'Servidor de cópias de segurança da sala'],
    servidor: ['dc-regional', 'Armazenamento do data center regional', DC],
    mbps: 10,
    atrasoMs: 20,
    perda,
    escutas: [['tcp', 80, 'cópias']],
  });
}

function justicaOk(m: Mundo, minimo: number): boolean {
  const j = m.flags.justica;
  return !!j && j.n >= minimo && j.algoritmo !== 'bbr' && j.jain >= 0.9;
}

function detalheJustica(m: Mundo): string {
  const j = m.flags.justica;
  if (!j) return 'nenhum teste de fluxos feito';
  return `${j.n} fluxo(s) ${String(j.algoritmo).toUpperCase()}: ${j.porFluxoMbps.map((x: number) => num(x, 2)).join(' / ')} Mb/s, Jain ${num(j.jain, 3)}, utilização ${num(j.utilizacao * 100, 0)} %`;
}

const d104D: Pergunta[] = [numerica('1', 'Pela fórmula da vazão com perda, se a perda do rádio ficasse 4 vezes maior, a vazão do TCP cairia para que fração da atual?', 0.5, 0.01)];

const dia104: Dia = {
  numero: 104,
  ato: 5,
  titulo: 'Dividir a banda com justiça',
  chamado: [
    'CHAMADO #0104',
    'Toda madrugada, quatro cópias de segurança saem da sala dos servidores para o data center regional pelo mesmo enlace de 10 Mb/s: prefeitura, escola, cooperativa e hospital. A do hospital termina sempre por último, e a diretoria desconfia que "a escola está roubando banda".',
    'No mesmo e-mail, o técnico do posto rural avisa que o rádio novo "é tão bom quanto cabo, só perde uns 2 % dos quadros, coisa pouca".',
    'Objetivo: pelo menos três fluxos TCP dividindo o gargalo com índice de justiça acima de 0,9 e uma transferência feita com a perda do meio sem fio ligada, para medir quanto custa a "coisa pouca".',
  ],
  manual: {
    titulo: 'Controle de congestionamento: eficiente, justo e convergente',
    texto: [
      'Quando muita gente manda pelo mesmo enlace, a camada de transporte decide a que velocidade cada um manda. Uma boa alocação tem três qualidades. Eficiência: usar a banda inteira do gargalo sem encher a fila à toa. Conforme a carga se aproxima da capacidade, a vazão para de crescer e o atraso dispara; a potência (carga dividida pelo atraso) é máxima um pouco antes desse joelho, e é ali que se quer operar.',
      'Justiça: a mais usada é a max-min. Uma divisão é max-min justa quando não dá para aumentar a banda de um fluxo sem tirar de outro que já tem o mesmo tanto ou menos. Num gargalo só, com todo mundo querendo o máximo, isso é partes iguais: 10 Mb/s para quatro cópias dá 2,5 Mb/s para cada. Se alguém quer menos, leva o que quer, e a sobra se divide igual entre os outros. Convergência: fluxos chegam e saem o tempo todo, então a regra precisa chegar depressa à divisão boa e acompanhar as mudanças.',
      'O emissor não enxerga a rede. Ele regula a velocidade por sinais de congestionamento: perda de pacote (a fila transbordou, sinal tardio), atraso crescente (a fila está enchendo, sinal antecipado) ou marcação explícita, o ECN, em que o roteador marca dois bits no cabeçalho IP em vez de descartar e o receptor devolve o aviso. O TCP clássico, Reno e CUBIC, usa a perda.',
      'A regra que converge é o AIMD, aumento aditivo e diminuição multiplicativa: sem sinal, cada fluxo sobe 1 segmento por RTT; com sinal, corta a janela pela metade. No gráfico dos dois usuários (banda de A num eixo, de B no outro), a reta onde A e B são iguais é a da justiça, e a reta onde A mais B dá a capacidade é a da eficiência. Subir somando anda numa diagonal e mantém a diferença entre os dois; cortar pela metade anda em direção à origem e corta a diferença pela metade. Repetindo, a diferença some e os dois oscilam em volta do cruzamento das retas.',
      'No sem fio, perda nem sempre é fila cheia: o ruído também corrompe quadros. O TCP não sabe a diferença e corta a janela do mesmo jeito. A vazão de um fluxo com perda p fica perto de (MSS ÷ RTT) × 1,22 ÷ √p: com 2 % de perda, um caminho de 10 Mb/s rende uma fração disso. Por isso enlaces sem fio retransmitem no próprio enlace, depressa, antes que o TCP perceba, ou usam correção de erros.',
    ],
  },
  dicas: [
    'No servidor de cópias, a ação de vários fluxos no mesmo gargalo mostra a vazão de cada um e o índice de justiça de Jain.',
    'Quatro fluxos Reno até o dc-regional (203.0.113.10), porta 80. Depois, "Perda no meio sem fio" com 2 % e uma transferência de 2M.',
    'Se quiser comparar, transfira 2M antes de ligar a perda e depois de ligar: o enlace é o mesmo, a vazão não.',
  ],
  montar: () => mundo104(1104),
  objetivo: (m) => {
    const t = m.flags.tcp;
    const comPerda = !!t && t.ok && t.concluiu && t.perda >= 0.01 && t.perdasAleatorias > 0 && tcpConfere(m);
    return [
      item('pelo menos três fluxos Reno ou CUBIC dividindo o gargalo com índice de Jain acima de 0,9', justicaOk(m, 3), detalheJustica(m)),
      item('uma transferência concluída com pelo menos 1 % de perda do meio sem fio', comPerda, t ? `${t.entregues} bytes, ${num(t.vazaoMbps, 2)} Mb/s, perda ${num((t.perda ?? 0) * 100, 2)} %, ${t.perdasAleatorias ?? 0} perda(s) por ruído` : 'nenhuma transferência ainda'),
    ];
  },
  posMorte: [
    'Ninguém estava roubando banda. Os quatro fluxos começaram em momentos diferentes, o primeiro sozinho com o enlace inteiro, e mesmo assim terminaram com fatias parecidas. É o AIMD fazendo o serviço: cada fluxo sobe 1 segmento por RTT, a fila do gargalo transborda, quem perde corta pela metade, e a cada volta a diferença entre o mais rápido e o mais lento encolhe. A cópia do hospital termina por último porque é a maior, não porque ganha menos.',
    'A "coisa pouca" do rádio não é pouca. Com 2 % de perda, o TCP corta a janela pela metade a cada poucas dezenas de segmentos, achando que a culpa é da fila, e nunca chega perto dos 10 Mb/s. A fórmula manda: a vazão cai com a raiz da perda e com o RTT, e o enlace fica ocioso enquanto a cópia se arrasta.',
    'O conserto não é trocar o TCP da cidade inteira. É fazer o rádio retransmitir os quadros corrompidos no próprio enlace, em milissegundos, para o TCP nem ficar sabendo. Cada camada resolve o que é dela.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['2,5 Mb/s para cada uma', 'Proporcional ao tamanho de cada cópia', 'Tudo para a primeira que começou, depois a próxima', '10 Mb/s para cada uma'],
        certa: 0,
        errada: {
          1: 'Dividir pelo tamanho parece razoável, mas não é o que a justiça max-min pede: ela olha para quanto cada fluxo recebe, não para quanto ele quer mandar. Quem tem mais a mandar simplesmente demora mais.',
          2: 'Isso é uma fila, não uma divisão. As outras três ficariam paradas sem motivo, e a última poderia esperar a noite inteira.',
          3: 'O enlace inteiro tem 10 Mb/s. Quatro fluxos não cabem com 10 Mb/s cada: a fila transborda e todo mundo perde.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Quatro cópias querem mandar o máximo possível por um enlace de 10 Mb/s. Qual divisão é justa no sentido max-min?',
      porque: 'Max-min: não dá para dar mais a um fluxo sem tirar de outro que tem igual ou menos. Com todos querendo tudo num gargalo só, isso só acontece com partes iguais.',
      feito: '10 Mb/s ÷ 4 = 2,5 Mb/s. Agora é ver se o TCP chega lá sozinho, sem ninguém distribuindo a banda.',
    }),
    passo({
      alvo: ['equip', 'copias'],
      acao: 'tr-fluxos',
      pedir: ['n', 'alg'],
      exemplo: { n: '4', alg: 'reno' },
      instrucao: 'No servidor de cópias, ponha quatro fluxos Reno dividindo o gargalo até o dc-regional.',
      porque: 'Cada fluxo começa uns segundos depois do outro. Se o AIMD converge, a vazão medida na segunda metade do teste fica parecida para todos.',
      conferir: (m) => {
        const j = m.flags.justica;
        if (!j) return 'O teste de fluxos ainda não rodou.';
        if (j.n < 3) return `Foram só ${j.n} fluxo(s). Com um só não há o que dividir; use quatro, como as quatro cópias.`;
        if (j.algoritmo === 'bbr') return 'O BBR não usa AIMD: ele mede a banda em vez de reagir à perda. Para ver a convergência do AIMD, use Reno.';
        return j.jain >= 0.9 ? true : `Índice de Jain ${num(j.jain, 3)}. Rode de novo: com tempo suficiente, os fluxos se acertam.`;
      },
      feito: 'Fatias parecidas e índice de Jain perto de 1. O índice é (soma)² ÷ (n × soma dos quadrados): 1 quando todos recebem igual, 1/n quando um leva tudo.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Subir somando mantém a diferença entre os fluxos, e cortar pela metade corta a diferença pela metade',
          'O roteador do gargalo diz a cada fluxo quanto ele pode mandar',
          'Os fluxos conversam entre si e combinam a divisão',
          'Qualquer regra chega lá: subir multiplicando e cortar multiplicando também convergiria',
        ],
        certa: 0,
        errada: {
          1: 'O roteador só descarta (ou marca) quando a fila enche. Quem decide a velocidade é cada emissor, sozinho, a partir desse sinal.',
          2: 'Cada fluxo só vê os próprios ACKs e perdas. Ninguém sabe nem quantos outros fluxos existem.',
          3: 'Subir e cortar multiplicando mantém a razão entre os dois: no gráfico, anda sempre na mesma reta que passa pela origem e nunca se aproxima da reta da justiça.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'No gráfico dos dois usuários, por que o AIMD acaba perto da reta da justiça?',
      porque: 'Pense na diferença entre os dois fluxos. O que acontece com ela quando os dois somam 1? E quando os dois cortam pela metade?',
      feito: 'Somar 1 aos dois não muda a diferença; dividir os dois por 2 divide a diferença por 2. Cada perda deixa os fluxos mais parecidos.',
    }),
    passo({
      alvo: ['equip', 'copias'],
      acao: 'tr-transferir',
      valores: { bytes: '2M' },
      instrucao: 'Transfira uma cópia de 2M para o dc-regional com o caminho limpo e anote a vazão.',
      porque: 'É a referência: um fluxo sozinho, sem ruído, num enlace de 10 Mb/s com RTT de uns 40 ms.',
      conferir: (m) => (m.flags.tcp?.ok && m.flags.tcp.concluiu ? true : 'A transferência não terminou. Confira se o dc-regional escuta na porta 80.'),
      feito: 'Perto dos 10 Mb/s e sem perda nenhuma: a fila do gargalo absorveu as rajadas da partida lenta. Guarde esse número.',
    }),
    passo({
      alvo: ['equip', 'copias'],
      acao: 'tr-sem-fio',
      pedir: ['p'],
      exemplo: { p: '2%' },
      instrucao: 'Simule o rádio do posto rural: ligue 2 % de perda no meio sem fio.',
      porque: 'É perda aleatória depois do gargalo, por ruído. A fila não está cheia, mas o TCP só vê "segmento perdido".',
      conferir: (m) => {
        const p = caminhoDe(m, 'copias').perda ?? 0;
        if (p >= 0.01) return true;
        return p > 0 ? `Perda de ${num(p * 100, 2)} %. O técnico falou em uns 2 %: use 2%.` : 'A perda ainda está desligada. Escreva 2%.';
      },
      feito: 'Dois quadros em cada cem se perdem pelo ar, sem fila nenhuma envolvida.',
    }),
    passo({
      alvo: ['equip', 'copias'],
      acao: 'tr-transferir',
      valores: { bytes: '2M' },
      instrucao: 'Transfira a mesma cópia de 2M de novo, agora com o ruído.',
      porque: 'Mesmo enlace, mesmo RTT, mesmo arquivo. A única diferença é a perda que não é congestionamento.',
      conferir: (m) => {
        const t = m.flags.tcp;
        if (!t?.ok || !t.concluiu) return 'A transferência não terminou.';
        return t.perda >= 0.01 && t.perdasAleatorias > 0 ? true : 'Essa transferência rodou sem a perda do rádio. Ligue os 2 % e transfira de novo.';
      },
      feito: 'A vazão despencou, e o resultado mostra perdas "por ruído" com o buffer do gargalo quase vazio. O enlace sobrou, o TCP é que freou.',
    }),
    passo({
      escolha: {
        opcoes: [
          'O TCP leu cada perda por ruído como congestionamento e cortou a janela à toa',
          'O rádio baixou a banda do enlace para 2 Mb/s',
          'O dc-regional ficou sobrecarregado',
          'A fila do gargalo transbordou o tempo todo',
        ],
        certa: 0,
        errada: {
          1: 'A banda do gargalo continua 10 Mb/s; o resultado da transferência mostra isso. O que mudou foi a janela do emissor.',
          2: 'O servidor recebeu tudo em ordem e na hora. Nada no resultado aponta para ele.',
          3: 'Olhe as perdas do resultado: quase todas são "por ruído", e a fila média ficou baixa. Fila transbordando seria congestionamento de verdade.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que a vazão caiu tanto, se o enlace continua com 10 Mb/s?',
      porque: 'O sinal de congestionamento do Reno é a perda. Ele não tem como saber se o segmento morreu numa fila ou no ar.',
      feito: 'Perda de 2 % corta a vazão para perto de (MSS ÷ RTT) × 1,22 ÷ √0,02. O remédio é o rádio retransmitir no próprio enlace, e não comprar mais banda.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Eficiência e potência',
        texto: [
          'Com pouca carga, sobra banda. Perto da capacidade, a vazão para de subir e o atraso explode, porque a fila cresce. Potência é carga dividida por atraso: o melhor ponto fica um pouco antes do joelho da curva.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Carga oferecida', 'Vazão', 'Atraso', 'Potência'],
          linhas: [
            ['bem abaixo da capacidade', 'baixa, sobra banda', 'baixo', 'baixa'],
            ['um pouco antes do joelho', 'quase toda a banda', 'ainda baixo', 'máxima'],
            ['na capacidade', 'toda a banda', 'alto, fila cheia', 'caindo'],
            ['acima da capacidade', 'toda a banda, com perdas', 'enorme', 'mínima'],
          ],
        },
      },
      {
        titulo: 'Justiça max-min',
        texto: [
          'Atende primeiro quem pede pouco, e divide a sobra igual entre os outros. Ninguém ganha mais sem tirar de alguém que já tem o mesmo tanto ou menos.',
          'Exemplo num enlace de 10 Mb/s: a cooperativa só precisa de 1 Mb/s; a escola e o hospital querem tudo.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Fluxo', 'Quer', 'Recebe'],
          linhas: [
            ['cooperativa', '1 Mb/s', '1 Mb/s'],
            ['escola', 'tudo', '4,5 Mb/s'],
            ['hospital', 'tudo', '4,5 Mb/s'],
          ],
        },
      },
      {
        titulo: 'Os sinais de congestionamento',
        texto: ['O emissor não vê a fila do roteador. Ele deduz o que acontece por um destes sinais, e cada um chega num momento diferente.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Sinal', 'O que indica', 'Quando chega'],
          linhas: [
            ['perda de pacote', 'a fila transbordou', 'tarde: já houve descarte'],
            ['atraso crescente', 'a fila está enchendo', 'cedo, antes do descarte'],
            ['marcação explícita (ECN)', 'o roteador avisa no cabeçalho IP', 'cedo, sem perder nada'],
          ],
        },
      },
      {
        titulo: 'AIMD no gráfico dos dois usuários',
        texto: [
          'Capacidade de 10 Mb/s. A começa com 2 e B com 8: diferença de 6. A fila transborda, os dois cortam pela metade (1 e 4, diferença de 3). Sobem 1 por RTT (diferença continua 3) até passar de 10 com 4 e 7, cortam de novo (2 e 3,5, diferença de 1,5). E assim até 5 e 5.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'a', rotulo: 'A 2, B 8 (dif. 6)', x: 120, y: 40 },
            { id: 'b', rotulo: 'A 1, B 4 (dif. 3)', x: 80, y: 190 },
            { id: 'c', rotulo: 'A 4, B 7 (dif. 3)', x: 260, y: 90 },
            { id: 'd', rotulo: 'A 2, B 3,5 (dif. 1,5)', x: 170, y: 250 },
            { id: 'e', rotulo: 'A 5, B 5: justo e eficiente', x: 470, y: 150 },
          ],
          ligacoes: [
            ['a', 'b', 'corta à metade'],
            ['b', 'c', 'soma 1 por RTT'],
            ['c', 'd', 'corta à metade'],
            ['d', 'e', 'e assim por diante'],
          ],
        },
      },
      {
        titulo: 'Sem fio: perda que não é congestionamento',
        texto: [
          'A vazão de um fluxo TCP com perda p fica perto de (MSS ÷ RTT) × 1,22 ÷ √p. Como a perda está dentro de uma raiz, 4 vezes mais perda corta a vazão pela metade.',
          'Saídas: retransmitir no próprio enlace sem fio, que é rápido e esconde a perda do TCP; corrigir erros com redundância; ou usar um controle que não leia perda como congestionamento.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Perda p', 'Vazão comparada com p = 1 %'],
          linhas: [
            ['0,25 %', '2 vezes'],
            ['1 %', '1 vez'],
            ['4 %', 'metade'],
            ['16 %', 'um quarto'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Dois fluxos AIMD dividem um gargalo: um está com 8 Mb/s e o outro com 2 Mb/s quando a fila transborda e os dois cortam pela metade. Qual é a diferença entre eles logo depois do corte?',
      opcoes: ['3 Mb/s', '6 Mb/s', 'zero', '4 Mb/s'],
      certa: 0,
      explicacao: 'Depois do corte ficam 4 e 1: a diferença caiu de 6 para 3. Enquanto sobem somando 1 por RTT, ela continua 3; no próximo corte, cai para 1,5. É por isso que o AIMD converge para a divisão justa.',
    },
  },
  desafio: {
    carta: [
      'O posto de saúde da Várzea manda três coisas toda noite pelo rádio até o data center regional: prontuário, cadastro de vacinação e imagens. O rádio tem 10 Mb/s de banda e uns 3 % de perda por ruído.',
      'A divisão entre os três até que é justa, mas os três juntos não enchem nem de longe o enlace. O fabricante do rádio lembrou que existe retransmissão no próprio enlace, que conserta o quadro antes do TCP notar; no emulador da sala, ligar isso é deixar a perda do meio sem fio desligada.',
      'Objetivo: três fluxos justos (Jain acima de 0,9) que juntos usem pelo menos 85 % do gargalo, sem perda de rádio, e a pergunta respondida.',
    ],
    montar: () => mundo104(2104, 0.03),
    objetivo: (m) => {
      const j = m.flags.justica;
      const util = !!j && j.utilizacao >= 0.85 && j.perda === 0;
      return [
        item('três ou mais fluxos Reno ou CUBIC com índice de Jain acima de 0,9', justicaOk(m, 3), detalheJustica(m)),
        item('juntos, os fluxos usam pelo menos 85 % do gargalo, sem perda do rádio', util, j ? `utilização ${num(j.utilizacao * 100, 0)} %, perda ${num((j.perda ?? 0) * 100, 2)} %` : 'nenhum teste de fluxos feito'),
        ...todasRespondidas(m, d104D),
      ];
    },
    dicas: [
      'Rode os três fluxos primeiro e olhe a soma: justos, mas longe dos 10 Mb/s. Eficiência também faz parte de uma boa alocação.',
      'A perda está configurada no servidor de cópias, em "Perda no meio sem fio". Desligue (off) e rode os três fluxos de novo.',
      'Na fórmula, a perda aparece dentro de uma raiz: 4 vezes mais perda dá 1 ÷ √4 da vazão.',
    ],
    perguntas: d104D,
    solucao: [
      ['equip', 'copias', 'tr-sem-fio', { p: 'off' }],
      ['equip', 'copias', 'tr-fluxos', { n: '3', alg: 'reno' }],
    ],
    respostas: { '1': '0,5' },
  },
};

/* ======================================================================
 * ref 105: UDP e tempo real (6.4)
 * ====================================================================== */

const TRANSMISSOR = '203.0.113.20';
const CAPITAL = '198.51.100.40';

function mundo105(): Mundo {
  return mundoSala({
    semente: 1105,
    cliente: ['estudio', 'Computador do estúdio da Rádio Comunitária'],
    servidor: ['transmissor', 'Servidor de transmissão e pedidos da rádio', TRANSMISSOR],
    mbps: 100,
    escutas: [['udp', 5000, 'pedidos']],
  });
}

function rtpOk(m: Mundo): boolean {
  const r = m.flags.rtp;
  return !!r && r.jitterConfigMs >= 15 && r.falhas <= 0.03 && r.atrasoBocaMs <= 150;
}

function detalheRtp(m: Mundo): string {
  const r = m.flags.rtp;
  if (!r) return 'nenhum áudio mandado';
  return `buffer ${num(r.bufferMs, 0)} ms, jitter do caminho ${num(r.jitterConfigMs, 0)} ms: ${num(r.falhas * 100, 1)} % de falhas, ${num(r.atrasoBocaMs, 0)} ms de boca a ouvido`;
}

const d105D: Pergunta[] = [
  numerica('1', 'Um pedido de música tem 160 bytes de dados. Que valor vai no campo "tamanho" do cabeçalho UDP?', 168, 0),
  numerica('2', 'Qual é o RTT até o servidor de pedidos na capital, em milissegundos?', 300, 10),
];

const dia105: Dia = {
  numero: 105,
  ato: 5,
  titulo: 'UDP e tempo real',
  chamado: [
    'CHAMADO #0105',
    'A Rádio Comunitária vai estrear o "Alô, Fim de Linha", com ouvintes falando ao vivo pela internet, e o ensaio de ontem foi um desastre: voz picotada, metade das sílabas sumindo. O caminho da voz tem uns 15 ms de jitter, e o estúdio deixou o buffer de reprodução quase zerado "para não atrasar".',
    'No mesmo ensaio, o sistema de pedidos tocou a mesma moda de viola duas vezes seguidas. A locutora jura que apertou uma vez só.',
    'Objetivo: o transmissor recebendo áudio em UDP na porta 5004, datagramas chegando lá, uma chamada remota com a resposta perdida para ver o pedido repetido e o áudio em RTP com até 3 % de falhas e até 150 ms de boca a ouvido.',
  ],
  manual: {
    titulo: 'UDP, chamada remota e transporte em tempo real',
    texto: [
      'O UDP é o mínimo que a camada de transporte pode pôr sobre o IP: portas, para saber a que processo entregar, e um checksum. O cabeçalho tem 8 bytes: porta de origem, porta de destino, tamanho (cabeçalho mais dados) e checksum, 16 bits cada. Não há conexão nem aperto de mão: cada datagrama vai sozinho. Não há confirmação, retransmissão, controle de fluxo nem de congestionamento. Em troca, cada mensagem chega inteira ou não chega, com as fronteiras preservadas, e sem esperar ninguém. Se nenhum soquete escuta na porta de destino, o datagrama é descartado e volta um ICMP de porta inalcançável.',
      'O UDP serve quando a troca é uma pergunta e uma resposta (perguntar um nome, por exemplo: repetir a pergunta é mais barato que abrir conexão), quando um pacote atrasado é tão inútil quanto um perdido (voz ao vivo) ou quando a aplicação quer cuidar ela mesma da confiabilidade.',
      'A chamada de procedimento remoto (RPC) faz uma chamada a outro computador parecer local. O programa chama uma função comum, o stub do cliente; ele empacota os parâmetros numa mensagem e manda. Do outro lado, o stub do servidor desempacota, chama o procedimento de verdade e devolve o resultado. Sobre UDP, é um datagrama de pedido, um de resposta e um tempo de espera: sem resposta, o cliente manda de novo. Se o que se perdeu foi a resposta, o servidor executa duas vezes. Em operação idempotente, como consultar a música que está tocando, tanto faz; em "tocar a música pedida", não. A saída é numerar cada pedido e o servidor lembrar o que já respondeu.',
      'Voz e vídeo ao vivo usam o RTP, que roda sobre UDP. O cabeçalho dele traz o tipo de mídia, um número de sequência (para notar perda e desordem), uma marca de tempo no relógio da mídia (para saber quando tocar; voz de telefone usa 8000 batidas por segundo, então um pacote de 20 ms avança 160) e o identificador da fonte. Não há retransmissão: quando o pacote perdido chegasse de novo, a sílaba já teria passado.',
      'Jitter é a variação do atraso: um pacote leva 5 ms, o seguinte 30. O receptor guarda um buffer de reprodução e toca cada pacote numa hora fixa depois do primeiro; o que chega depois da hora dele é jogado fora. Buffer maior salva mais atrasados e deixa a conversa mais lenta; numa conversa, até uns 150 ms de boca a ouvido passa despercebido. O RTCP, o protocolo de controle que acompanha o RTP, manda relatórios de recepção com perda e jitter (para a fonte ajustar a qualidade), ajuda a sincronizar áudio com vídeo e diz o nome de cada fonte.',
    ],
  },
  dicas: [
    'Primeiro o transmissor precisa de um soquete UDP na porta do áudio, a 5004. Sem ele, cada datagrama vira ICMP de porta inalcançável.',
    'O sistema de pedidos escuta em UDP 5000. Na chamada remota, force a perda da resposta para ver o servidor executar duas vezes.',
    'No áudio em RTP, com jitter de 15 ms, um buffer de 10 ms perde muita coisa. Tente uns 80 ms: abaixo de 150 ms de boca a ouvido, e quase nada chega tarde.',
  ],
  montar: mundo105,
  objetivo: (m) => {
    const u = m.flags.udp;
    const r = m.flags.rpc;
    return [
      item('o transmissor escuta em UDP 5004', escutando(m, 'transmissor', 'udp', 5004)),
      item('datagramas UDP chegaram a um soquete do transmissor', !!u && u.ok && u.escuta && u.recebidos > 0, u ? `${u.recebidos} de ${u.n} na porta ${u.porta}` : 'nenhum datagrama mandado'),
      item('uma chamada remota em que a resposta se perdeu e o servidor executou de novo', !!r && r.ok && r.perder === 'resposta' && r.execucoes >= 2, r ? `${r.execucoes} execução(ões) em ${r.tentativas} tentativa(s)` : 'nenhuma chamada feita'),
      item('áudio em RTP com jitter de 15 ms ou mais, até 3 % de falhas e até 150 ms de boca a ouvido', rtpOk(m), detalheRtp(m)),
    ];
  },
  posMorte: [
    'A voz picotava porque o buffer de reprodução era menor que o jitter. Com 10 ms de folga e pacotes que variam dezenas de milissegundos, boa parte chegava depois da hora de tocar e virava silêncio, mesmo tendo atravessado a rede inteira. Com 80 ms, quase tudo chega a tempo, e a fala sai um pouco mais de 80 ms depois de dita: o ouvinte nem percebe. A rede não mudou; mudou quanto o receptor aceita esperar.',
    'A moda de viola dupla foi a resposta perdida. O estúdio mandou o pedido, o servidor tocou a música e respondeu, a resposta se perdeu, o estúdio esperou 200 ms e mandou de novo. O servidor, que não guarda nada, tocou outra vez. Para "qual música está tocando?" isso não estraga nada; para "toque esta música", estraga. O conserto é numerar o pedido e o servidor responder "já toquei" quando vir o mesmo número.',
    'Em nenhum momento o UDP retransmitiu, confirmou ou esperou. Ele só pôs porta e checksum e soltou. Tudo o que deu certo ou errado aqui foi decisão da aplicação em cima dele.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'transmissor'],
      acao: 'tr-escutar',
      pedir: ['proto', 'porta'],
      exemplo: { proto: 'udp', porta: '5004' },
      instrucao: 'No transmissor, abra um soquete UDP na porta do áudio em tempo real, a 5004.',
      porque: 'Sem conexão não há aperto de mão, mas ainda é preciso alguém escutando: a porta diz a que processo o datagrama é entregue.',
      conferir: (m) => {
        if (escutando(m, 'transmissor', 'udp', 5004)) return true;
        if (escutando(m, 'transmissor', 'tcp', 5004)) return 'Isso abriu a 5004 em TCP. O áudio chega em UDP, e a 5004 do UDP é outra porta, de outro protocolo.';
        return 'A 5004 do UDP ainda não tem ninguém. É ela que o áudio usa.';
      },
      feito: 'socket e bind, sem listen nem accept: no UDP o soquete fica "aberto" esperando qualquer datagrama que chegue.',
    }),
    passo({
      alvo: ['equip', 'estudio'],
      acao: 'tr-udp',
      valores: { porta: '5004', n: '50', bytes: '160' },
      instrucao: 'Do estúdio, mande 50 datagramas UDP de 160 bytes para o transmissor, na porta 5004.',
      porque: 'Repare no cabeçalho que sai na tela: 8 bytes, e o campo tamanho conta o cabeçalho junto com os dados.',
      conferir: (m) => {
        const u = m.flags.udp;
        if (!u) return 'Nenhum datagrama saiu ainda.';
        if (!u.escuta) return `Ninguém escuta em UDP ${u.porta} no transmissor: os datagramas viraram ICMP de porta inalcançável. Use a 5004.`;
        return u.recebidos > 0 ? true : 'Nenhum datagrama chegou. Tente de novo.';
      },
      feito: 'Tamanho 168: 8 de cabeçalho e 160 de dados. Nenhum ACK voltou, e se algum tivesse se perdido, ninguém reenviaria.',
    }),
    passo({
      alvo: ['equip', 'estudio'],
      acao: 'tr-rpc',
      valores: { porta: '5000', espera: '200' },
      pedir: ['perder'],
      exemplo: { perder: 'resposta' },
      instrucao: 'Faça uma chamada remota ao sistema de pedidos (UDP 5000) forçando a perda que repete a música.',
      porque: 'Se o pedido se perde, o servidor nem soube dele e o reenvio é inofensivo. O caso perigoso é o outro.',
      conferir: (m) => {
        const r = m.flags.rpc;
        if (!r) return 'A chamada ainda não foi feita.';
        if (r.perder === 'pedido') return 'Perdeu o pedido: o servidor executou uma vez só, porque o primeiro nunca chegou. A música dupla vem da resposta perdida.';
        return r.execucoes >= 2 ? true : 'Sem perda nenhuma, o servidor executa uma vez. Force a perda da resposta.';
      },
      feito: 'O servidor executou duas vezes: na primeira tentativa e no reenvio. O cliente descartou a resposta repetida, mas a música já tinha tocado duas vezes.',
    }),
    passo({
      escolha: {
        opcoes: ['Consultar qual música está tocando agora', 'Tocar a música pedida', 'Descontar um crédito do ouvinte', 'Pôr um recado no ar'],
        certa: 0,
        errada: {
          1: 'Tocar duas vezes é exatamente o problema do ensaio. Cada execução tem efeito.',
          2: 'Repetir desconta dois créditos. Isso muda o estado do servidor a cada execução, então não é idempotente.',
          3: 'O recado iria ao ar duas vezes. Também tem efeito a cada execução.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual destes pedidos pode ser repetido sem estrago, ou seja, é idempotente?',
      porque: 'Idempotente é a operação que dá o mesmo resultado executada uma ou várias vezes. Ler não muda nada; fazer muda.',
      feito: 'Consultar é idempotente. Para os outros, o servidor precisa reconhecer o pedido repetido pelo identificador e devolver a resposta guardada sem executar de novo.',
    }),
    passo({
      alvo: ['equip', 'estudio'],
      acao: 'tr-rtp',
      valores: { porta: '5004', jitter: '15', buffer: '10' },
      instrucao: 'Mande o áudio em RTP para o transmissor do jeito do ensaio: 15 ms de jitter no caminho e buffer de reprodução de 10 ms.',
      porque: 'Cada pacote leva 20 ms de fala, com número de sequência e marca de tempo. O receptor toca cada um numa hora fixa; o que chega depois disso não serve.',
      conferir: (m) => (m.flags.rtp ? true : 'O áudio ainda não saiu. Confira se o transmissor escuta em UDP 5004.'),
      feito: 'Falhas demais. Os pacotes chegaram, mas boa parte depois da hora de tocar. Para quem ouve, atrasado é igual a perdido.',
    }),
    passo({
      alvo: ['equip', 'estudio'],
      acao: 'tr-rtp',
      valores: { porta: '5004', jitter: '15' },
      pedir: ['buffer'],
      exemplo: { buffer: '80' },
      instrucao: 'Agora escolha um buffer de reprodução que salve a conversa: quase nada atrasado e até 150 ms de boca a ouvido.',
      porque: 'O buffer precisa ser maior que a maior parte das variações do atraso, mas cada milissegundo de buffer é um milissegundo a mais de espera para quem conversa.',
      conferir: (m) => {
        const r = m.flags.rtp;
        if (!r) return 'O áudio ainda não saiu.';
        if (r.jitterConfigMs < 15) return 'O caminho tem 15 ms de jitter. Testar com menos é se enganar.';
        if (r.atrasoBocaMs > 150) return `${num(r.atrasoBocaMs, 0)} ms de boca a ouvido: os ouvintes vão se atropelar no ar. Diminua o buffer.`;
        if (r.falhas > 0.03) return `${num(r.falhas * 100, 1)} % de falhas ainda. Aumente o buffer.`;
        return true;
      },
      feito: 'Quase nada se perde e a fala chega bem antes dos 150 ms. É o equilíbrio do tempo real: esperar o suficiente, e nem um pouco mais.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O cabeçalho UDP: 8 bytes',
        texto: ['Quatro campos de 16 bits. O checksum cobre um pseudo-cabeçalho com os IPs de origem e destino, o cabeçalho UDP e os dados.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Bits', 'Para quê'],
          linhas: [
            ['porta de origem', '16', 'para onde mandar a resposta'],
            ['porta de destino', '16', 'a que processo entregar'],
            ['tamanho', '16', 'cabeçalho mais dados: 8 + 160 = 168'],
            ['checksum', '16', 'confere cabeçalho, dados e os IPs'],
          ],
        },
      },
      {
        titulo: 'TCP ou UDP?',
        texto: ['O UDP não é um TCP pior: é outra escolha. Ele tira tudo o que atrasa e deixa a aplicação decidir o que fazer com a perda.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'TCP', 'UDP'],
          linhas: [
            ['conexão', 'aperto de mão antes', 'nenhuma'],
            ['entrega', 'tudo, em ordem', 'o que chegar, como chegar'],
            ['retransmissão', 'sim', 'não'],
            ['fronteira de mensagem', 'não: fluxo de bytes', 'sim: um datagrama, uma mensagem'],
            ['bom para', 'arquivos, páginas, correio', 'nomes, voz ao vivo, RPC simples'],
          ],
        },
      },
      {
        titulo: 'RPC: o stub faz a mágica',
        texto: ['O programa chama uma função local. O stub empacota os parâmetros, a rede leva, o outro stub desempacota e chama o procedimento de verdade. Se a resposta se perde, o reenvio executa de novo: por isso cada pedido leva um identificador.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'prog', rotulo: 'programa do estúdio', x: 60, y: 60 },
            { id: 'sc', rotulo: 'stub do cliente', x: 60, y: 200 },
            { id: 'ss', rotulo: 'stub do servidor', x: 460, y: 200 },
            { id: 'proc', rotulo: 'tocar(musica=12)', x: 460, y: 60 },
          ],
          ligacoes: [
            ['prog', 'sc', 'chamada local'],
            ['sc', 'ss', 'pedido id 7 num datagrama'],
            ['ss', 'proc', 'chama de verdade'],
            ['ss', 'sc', 'resposta id 7'],
          ],
        },
      },
      {
        titulo: 'RTP: sequência e marca de tempo',
        texto: ['A sequência sobe 1 por pacote e mostra perda e desordem. A marca de tempo sobe no relógio da mídia: 20 ms a 8000 batidas por segundo são 160 batidas por pacote.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Pacote', 'Sequência', 'Marca de tempo', 'Fala'],
          linhas: [
            ['1º', '4242', '160000', '0 a 20 ms'],
            ['2º', '4243', '160160', '20 a 40 ms'],
            ['3º', '4244', '160320', '40 a 60 ms'],
            ['4º', '4245', '160480', '60 a 80 ms'],
          ],
        },
      },
      {
        titulo: 'Jitter, buffer de reprodução e RTCP',
        texto: [
          'O receptor toca cada pacote numa hora fixa depois do primeiro. Buffer menor que o jitter: muito pacote chega tarde. Buffer grande demais: a conversa fica com eco de satélite.',
          'Ao lado do RTP, o RTCP manda relatórios de recepção (perda, jitter), sincroniza áudio com vídeo e identifica cada fonte. A fonte usa os relatórios para baixar ou subir a qualidade.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Buffer de reprodução', 'Pacotes atrasados', 'Boca a ouvido'],
          linhas: [
            ['menor que o jitter', 'muitos: voz picotada', 'baixo'],
            ['umas vezes o jitter', 'quase nenhum', 'até uns 150 ms: conversa boa'],
            ['enorme', 'nenhum', 'alto: um atropela o outro'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Uma chamada remota "descontar 1 crédito" teve a resposta perdida, e o cliente reenviou o pedido. O que evita o desconto em dobro?',
      opcoes: [
        'O servidor guarda o identificador do pedido e devolve a resposta já calculada, sem executar de novo',
        'Diminuir o tempo de espera do cliente',
        'O checksum do UDP',
        'Mandar o pedido duas vezes de propósito',
      ],
      certa: 0,
      explicacao: 'A operação não é idempotente, então o servidor precisa reconhecer o pedido repetido. O checksum só detecta bits trocados, e esperar menos faz reenviar mais, não menos.',
    },
  },
  desafio: {
    carta: [
      'O sistema de pedidos da rádio foi para um servidor na capital, e o único caminho até lá passa por satélite: 150 ms em cada sentido. Na mudança, alguém esqueceu de abrir o serviço de pedidos no servidor novo.',
      'E os ouvintes reclamam de novo da música repetida, agora sem perda nenhuma no caminho. O estúdio continua esperando 200 ms pela resposta antes de reenviar.',
      'Objetivo: o serviço de pedidos escutando em UDP 5000 no servidor da capital, uma chamada remota que executa uma vez só sem perda forçada, e as duas perguntas respondidas.',
    ],
    montar: () =>
      mundoSala({
        semente: 2105,
        cliente: ['estudio', 'Computador do estúdio da Rádio Comunitária'],
        servidor: ['pedidos-capital', 'Servidor de pedidos na capital', CAPITAL],
        mbps: 10,
        atrasoMs: 150,
      }),
    objetivo: (m) => {
      const r = m.flags.rpc;
      const ok = !!r && r.ok && r.escuta && r.perder === null && r.execucoes === 1;
      return [
        item('o servidor da capital escuta em UDP 5000', escutando(m, 'pedidos-capital', 'udp', 5000)),
        item('uma chamada remota sem perda forçada que executou uma vez só', ok, r ? `espera ${num(r.esperaMs, 0)} ms: ${r.execucoes} execução(ões) em ${r.tentativas} tentativa(s)${r.perder ? `, perda forçada do ${r.perder}` : ''}` : 'nenhuma chamada feita'),
        ...todasRespondidas(m, d105D),
      ];
    },
    dicas: [
      'Sem soquete na 5000, cada pedido vira ICMP de porta inalcançável. Abra o serviço no pedidos-capital.',
      'Com 150 ms em cada sentido, a resposta só volta depois de uns 300 ms. Quem espera 200 ms reenvia antes de a primeira resposta chegar, e o servidor executa de novo.',
      'Use uma espera maior que o RTT, como 400 ms, e não force perda nenhuma. O tamanho do UDP é 8 de cabeçalho mais os dados.',
    ],
    perguntas: d105D,
    solucao: [
      ['equip', 'pedidos-capital', 'tr-escutar', { proto: 'udp', porta: '5000' }],
      ['equip', 'estudio', 'tr-rpc', { porta: '5000', espera: '400', perder: 'nada' }],
    ],
    respostas: { '1': '168', '2': '300' },
  },
};

/* ======================================================================
 * ref 106: TCP por dentro (6.5.1 a 6.5.6)
 * ====================================================================== */

const VIDEO = '198.51.100.20';

function mundo106(o: { semente: number; tcp?: Partial<ConfigTcp>; escutas?: ['tcp' | 'udp', number, string?][] }): Mundo {
  return mundoSala({
    semente: o.semente,
    cliente: ['telemed', 'Estação de telemedicina do hospital'],
    servidor: ['video-regional', 'Servidor de videoconsulta da regional de saúde', VIDEO],
    mbps: 20,
    atrasoMs: 10,
    tcp: o.tcp,
    escutas: o.escutas,
  });
}

/** A estação abriu uma conexão com o servidor na porta e, no fim, ficou em TIME_WAIT? */
function conexaoCompleta(m: Mundo, porta: number): boolean {
  const c = m.flags.conexao;
  return !!c && c.de === 'telemed' && c.porta === porta && c.resultado === 'aberta' && !!c.fechamento && (c.fechamento.estadosCliente as string[]).includes('TIME_WAIT');
}

function detalheConexao(m: Mundo): string {
  const c = m.flags.conexao;
  if (!c) return 'nenhuma conexão tentada';
  if (c.resultado !== 'aberta') return `porta ${c.porta}: ${c.resultado}`;
  return c.fechamento ? `porta ${c.porta}: aberta e fechada (${(c.fechamento.estadosCliente as string[]).join(', ')})` : `porta ${c.porta}: aberta, ainda não fechada`;
}

function transferenciaOk(m: Mundo, porta: number, minimo: number): boolean {
  const t = m.flags.tcp;
  return !!t && t.ok && t.concluiu && t.de === 'telemed' && t.porta === porta && t.entregues >= minimo;
}

function detalheTransferencia(m: Mundo): string {
  const t = m.flags.tcp;
  if (!t) return 'nenhuma transferência ainda';
  if (!t.ok) return `porta ${t.porta}: ${t.motivo}`;
  return `${t.entregues} bytes na porta ${t.porta}, ${t.segmentos} segmentos, ${num(t.vazaoMbps, 2)} Mb/s`;
}

const d106: Pergunta[] = [numerica('1', 'Quantos bytes tem o cabeçalho TCP do SYN que a estação de telemedicina mandou?', 28, 0)];
const d106D: Pergunta[] = [
  numerica('1', 'Com a escala de janela ligada, quantos bytes tem o cabeçalho TCP do SYN da estação?', 32, 0),
  numerica('2', 'Chegaram os segmentos seq=5001 e seq=6001, com 1000 bytes cada; o seq=7001 se perdeu; chegou o seq=8001, também com 1000 bytes. Que número de confirmação o receptor manda depois deste último?', 7001, 0),
];

const dia106: Dia = {
  numero: 106,
  ato: 5,
  titulo: 'TCP por dentro',
  chamado: [
    'CHAMADO #0106',
    'A regional de saúde ligou o servidor novo de videoconsulta, e a estação de telemedicina do hospital só recebe "conexão recusada". O suporte de lá jura que a culpa é daqui e mandou um questionário sobre o TCP, começando pelo tamanho do cabeçalho do SYN.',
    'Antes de o especialista entrar na primeira consulta, o exame de imagem de 1M precisa subir inteiro pela porta da videoconsulta, a 443.',
    'Objetivo: o servidor escutando em TCP 443, uma conexão da estação aberta com aperto de mão em três vias e fechada com a estação em TIME_WAIT, a pergunta respondida e o exame de 1M transferido.',
  ],
  manual: {
    titulo: 'O TCP: serviço, protocolo, cabeçalho, abertura e encerramento',
    texto: [
      'O TCP entrega um fluxo de bytes confiável e em ordem entre dois soquetes. É ponto a ponto: cada conexão tem exatamente duas pontas, nada de mandar para um grupo. É full-duplex: os dois lados mandam ao mesmo tempo, cada sentido com a sua numeração. E é fluxo de bytes, não de mensagens: se a aplicação escreve 300 bytes e depois 200, o outro lado pode ler os 500 de uma vez, ou 100 e depois 400. Quem precisa de fronteira (onde termina uma mensagem) põe a fronteira nos próprios dados.',
      'Cada byte do fluxo tem um número de sequência de 32 bits, e cada segmento leva o número do seu primeiro byte. A confirmação é acumulativa: o receptor manda no campo de confirmação o número do próximo byte que espera, o que confirma tudo antes dele de uma vez. Se um segmento some no meio, os que chegam depois são guardados, mas a confirmação fica parada no buraco. O tamanho de cada segmento é limitado pelo MSS: no Ethernet, 1500 de MTU menos 20 do IP e 20 do TCP dá 1460 bytes de dados.',
      'O cabeçalho tem 20 bytes fixos e até 40 de opções. Portas de origem e destino (16 bits cada), número de sequência e número de confirmação (32 bits cada), o tamanho do próprio cabeçalho contado em palavras de 32 bits (4 bits, por isso as opções são completadas até múltiplo de 4), as flags (CWR e ECE do ECN, URG, ACK, PSH, RST, SYN e FIN), a janela (16 bits: quantos bytes o receptor ainda aceita), o checksum (que cobre também um pseudo-cabeçalho com os IPs) e o ponteiro urgente. As opções mais comuns vão no SYN: o MSS, a escala de janela e a permissão de SACK.',
      'A conexão abre com o aperto de mão em três vias. O servidor está em LISTEN. O cliente manda SYN com o seu número inicial x, sorteado, e vai para SYN_SENT. O servidor responde SYN+ACK com o seu número inicial y e confirmação x+1 (o SYN gasta um número) e vai para SYN_RCVD. O cliente confirma com y+1 e os dois chegam a ESTABLISHED. Se ninguém escuta na porta, o servidor responde RST e o cliente ouve "conexão recusada": a máquina existe, o serviço não.',
      'Para fechar, cada sentido fecha separado, porque a conexão é full-duplex. Quem fecha primeiro manda FIN e passa por FIN_WAIT_1; com o ACK, FIN_WAIT_2; quando chega o FIN do outro lado, confirma e fica em TIME_WAIT por 2 MSL (duas vezes a vida máxima de um segmento na rede), para que nenhum segmento atrasado desta conexão seja confundido com uma nova. O outro lado passa por CLOSE_WAIT e LAST_ACK. Não existe jeito perfeito de dois lados terem certeza de que o outro sabe que acabou (o problema dos dois exércitos); o TCP se contenta com temporizadores.',
    ],
  },
  dicas: [
    '"Conexão recusada" é RST: a máquina respondeu, mas ninguém escuta na porta. Abra o TCP 443 no video-regional.',
    'Depois do aperto de mão, "Ver o cabeçalho TCP" na estação mostra o último SYN, com o tamanho do cabeçalho em bytes.',
    'Feche a conexão a partir da estação ("eu primeiro") e depois transfira 1M para a porta 443.',
  ],
  perguntas: d106,
  montar: () => mundo106({ semente: 1106 }),
  objetivo: (m) => [
    item('o video-regional escuta em TCP 443', escutando(m, 'video-regional', 'tcp', 443)),
    item('uma conexão da estação com a porta 443 aberta e fechada, com a estação em TIME_WAIT', conexaoCompleta(m, 443), detalheConexao(m)),
    ...todasRespondidas(m, d106),
    item('o exame de 1M transferido inteiro pela porta 443', transferenciaOk(m, 443, 1e6), detalheTransferencia(m)),
  ],
  posMorte: [
    'A culpa era daqui, sim, mas do lado de lá da rede: o servidor da regional não tinha ninguém escutando na 443, e o TCP dele respondia cada SYN com RST. Bastou o serviço chamar listen para o mesmo SYN virar SYN+ACK. O RST é uma resposta honesta: a máquina existe e está dizendo que não tem ninguém naquela porta. Bem diferente de um SYN sem resposta nenhuma, que fica sendo reenviado até desistir.',
    'O SYN da estação tem 28 bytes de cabeçalho: 20 fixos e 8 de opções, o MSS de 1460 (4 bytes) e a permissão de SACK (2 bytes), completados até múltiplo de 4. O campo de tamanho diz 7, porque conta palavras de 32 bits. No encerramento, quem fechou primeiro foi a estação, então foi ela que ficou em TIME_WAIT esperando 2 MSL, e não o servidor.',
    'O exame de 1M virou 685 segmentos de até 1460 bytes, cada um com o número de sequência do primeiro byte que leva. Do outro lado, a aplicação recebeu um fluxo de 1000000 bytes em ordem, sem saber onde cada segmento começava. É esse o serviço: um cano de bytes confiável, com dois sentidos e duas pontas.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Qualquer pedaço dos 500 bytes, em ordem: os 500 de uma vez, ou 100 e depois 400',
          'Sempre 300 numa leitura e 200 na outra, separados',
          'Os 200 antes dos 300, se o segundo segmento chegar primeiro',
          'Só os 300; a segunda mensagem precisa de outra conexão',
        ],
        certa: 0,
        errada: {
          1: 'O TCP não guarda onde uma escrita termina. Ele entrega um fluxo de bytes; a fronteira entre mensagens, se a aplicação precisar, vai dentro dos dados.',
          2: 'O TCP entrega em ordem. Um segmento que chega adiantado espera no buffer do receptor até o buraco antes dele ser preenchido.',
          3: 'Uma conexão aguenta quantos bytes a aplicação quiser, nos dois sentidos, até alguém fechar.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O programa de videoconsulta escreve 300 bytes no TCP e depois mais 200. O que o outro lado pode receber ao ler?',
      porque: 'Pense no serviço que o TCP oferece: um fluxo de bytes confiável e em ordem, não uma sequência de mensagens.',
      feito: 'Fluxo de bytes: em ordem e sem perder nada, mas sem fronteira de mensagem.',
    }),
    passo({
      alvo: ['equip', 'video-regional'],
      acao: 'tr-escutar',
      pedir: ['proto', 'porta'],
      exemplo: { proto: 'tcp', porta: '443' },
      instrucao: 'No video-regional, abra o serviço de videoconsulta: TCP na porta 443.',
      porque: 'A "conexão recusada" é o RST de um servidor sem ninguém na porta. Com socket, bind e listen, o soquete vai para LISTEN e o SYN passa a ter quem atenda.',
      conferir: (m) => {
        if (escutando(m, 'video-regional', 'tcp', 443)) return true;
        if (escutando(m, 'video-regional', 'udp', 443)) return 'Isso abriu a 443 em UDP. A videoconsulta chega por TCP; as portas dos dois protocolos são independentes.';
        return 'O TCP 443 do video-regional ainda não tem ninguém.';
      },
      feito: 'LISTEN na 443. O accept fica esperando alguém completar o aperto de mão.',
    }),
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-conectar',
      valores: { porta: '443' },
      instrucao: 'Da estação de telemedicina, conecte ao video-regional na porta 443 e acompanhe o aperto de mão.',
      porque: 'Repare nos números: o SYN+ACK confirma o número inicial do cliente mais 1, e o ACK final confirma o do servidor mais 1. O SYN gasta um número de sequência, mesmo sem levar dados.',
      conferir: (m) => {
        const c = m.flags.conexao;
        if (!c) return 'A conexão ainda não foi tentada.';
        if (c.resultado === 'recusada') return 'Voltou RST: ninguém escuta nessa porta. Confira o serviço do video-regional e a porta 443.';
        return c.resultado === 'aberta' && c.porta === 443 ? true : `A conexão foi para a porta ${c.porta}. A videoconsulta está na 443.`;
      },
      feito: 'SYN, SYN+ACK, ACK: os dois lados em ESTABLISHED depois de 1 RTT, cada um sabendo o número inicial do outro.',
    }),
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-cabecalho',
      instrucao: 'Na estação, veja o cabeçalho TCP do SYN que acabou de sair.',
      porque: 'O SYN é o segmento com mais opções: é nele que cada lado diz o seu MSS e se aceita SACK e escala de janela.',
      feito: 'Portas, sequência, confirmação zerada (sem a flag ACK ela não vale), tamanho do cabeçalho, flags, janela, checksum e as opções, byte a byte.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '28' },
      instrucao: 'Quantos bytes tem o cabeçalho TCP desse SYN?',
      porque: 'São 20 fixos mais as opções: MSS (4 bytes) e SACK permitido (2 bytes), completados até múltiplo de 4, porque o campo de tamanho conta palavras de 32 bits.',
      feito: '28 bytes: o campo de tamanho diz 7 palavras de 32 bits.',
    }),
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-fechar',
      valores: { modo: 'cliente' },
      instrucao: 'Feche a conexão a partir da estação, que fecha primeiro.',
      porque: 'Cada sentido fecha por conta própria: FIN e ACK de um lado, FIN e ACK do outro. Quem fecha primeiro é quem espera no TIME_WAIT.',
      conferir: (m) => {
        const f = m.flags.conexao?.fechamento;
        if (!f) return 'A conexão ainda não foi fechada.';
        return (f.estadosCliente as string[]).includes('TIME_WAIT') ? true : 'Quem fechou primeiro foi o servidor, então quem ficou em TIME_WAIT foi ele. Feche a partir da estação.';
      },
      feito: 'ESTABLISHED, FIN_WAIT_1, FIN_WAIT_2, TIME_WAIT na estação; CLOSE_WAIT e LAST_ACK no servidor. A porta efêmera da estação fica presa por 2 MSL.',
    }),
    passo({
      alvo: ['equip', 'telemed'],
      acao: 'tr-transferir',
      valores: { porta: '443', bytes: '1M' },
      instrucao: 'Transfira o exame de 1M para o video-regional, na porta 443.',
      porque: 'Conecta, manda e fecha. Cada segmento leva até 1460 bytes, e a confirmação acumulativa diz sempre o próximo byte esperado.',
      conferir: (m) => (transferenciaOk(m, 443, 1e6) ? true : `O exame não subiu inteiro: ${detalheTransferencia(m)}.`),
      feito: 'Um milhão de bytes em 685 segmentos. Do outro lado, recv devolveu os bytes em ordem, sem buraco e sem saber onde cada segmento começava.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O serviço: fluxo de bytes, ponto a ponto, full-duplex',
        texto: ['A aplicação escreve quando quer e quanto quer; o TCP numera os bytes e entrega todos, em ordem, do outro lado. Cada conexão tem duas pontas e dois sentidos independentes.'],
        visual: {
          tipo: 'camadas',
          camadas: ['a aplicação escreve 300 bytes, depois 200', 'o TCP numera os 500 bytes, sem marcar onde uma escrita acaba', 'segmentos de até 1 MSS atravessam a rede', 'o outro lado lê 500 de uma vez, ou 100 e 400'],
          rotulo: 'sem fronteira de mensagem',
        },
      },
      {
        titulo: 'Sequência por byte e confirmação acumulativa',
        texto: ['O número de sequência é o do primeiro byte do segmento. A confirmação é o próximo byte esperado e vale para tudo antes dele. Um buraco segura a confirmação até ser preenchido.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Segmento que chega', 'Bytes', 'Confirmação devolvida'],
          linhas: [
            ['seq=1001', '1460', 'ack=2461'],
            ['seq=2461', '1460', 'ack=3921'],
            ['seq=3921 (perdido)', '1460', 'nada chega'],
            ['seq=5381', '1460', 'ack=3921 de novo: falta o buraco'],
          ],
        },
      },
      {
        titulo: 'O cabeçalho, campo a campo',
        texto: ['20 bytes fixos e até 40 de opções. O tamanho do cabeçalho vai em palavras de 32 bits: 5 sem opções, até 15 com elas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Campo', 'Bits', 'Para quê'],
          linhas: [
            ['portas de origem e destino', '16 + 16', 'que soquete em cada ponta'],
            ['número de sequência', '32', 'o primeiro byte deste segmento'],
            ['número de confirmação', '32', 'o próximo byte esperado (com a flag ACK)'],
            ['tamanho do cabeçalho', '4', 'em palavras de 32 bits'],
            ['flags', '8', 'CWR, ECE, URG, ACK, PSH, RST, SYN, FIN'],
            ['janela', '16', 'quantos bytes o receptor ainda aceita'],
            ['checksum e ponteiro urgente', '16 + 16', 'confere tudo, com os IPs; marca dado urgente'],
            ['opções', 'até 320', 'MSS, escala de janela, SACK, marca de tempo'],
          ],
        },
      },
      {
        titulo: 'Aperto de mão em três vias',
        texto: ['O SYN e o FIN gastam um número de sequência cada um, mesmo sem dados. Por isso a confirmação do SYN é o número inicial mais 1.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c1', rotulo: 'cliente: SYN_SENT', x: 80, y: 40 },
            { id: 's1', rotulo: 'servidor: LISTEN, depois SYN_RCVD', x: 460, y: 110 },
            { id: 'c2', rotulo: 'cliente: ESTABLISHED', x: 80, y: 180 },
            { id: 's2', rotulo: 'servidor: ESTABLISHED', x: 460, y: 250 },
          ],
          ligacoes: [
            ['c1', 's1', 'SYN seq=x'],
            ['s1', 'c2', 'SYN+ACK seq=y ack=x+1'],
            ['c2', 's2', 'ACK ack=y+1'],
          ],
        },
      },
      {
        titulo: 'Encerramento: um sentido de cada vez',
        texto: ['Quem fecha primeiro espera 2 MSL em TIME_WAIT, para os segmentos atrasados desta conexão morrerem antes que outra igual possa nascer.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Segmento', 'Quem fecha primeiro', 'O outro lado'],
          linhas: [
            ['FIN', 'FIN_WAIT_1', 'CLOSE_WAIT'],
            ['ACK do FIN', 'FIN_WAIT_2', 'CLOSE_WAIT'],
            ['FIN do outro lado', 'TIME_WAIT', 'LAST_ACK'],
            ['ACK final', 'TIME_WAIT, por 2 MSL', 'CLOSED'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O cliente manda SYN com seq=1000. O que vem no SYN+ACK do servidor?',
      opcoes: ['ack=1001, e no seq o número inicial do próprio servidor', 'ack=1000, porque o SYN não leva dados', 'ack=2460, um MSS depois', 'seq=1001 e nenhuma confirmação'],
      certa: 0,
      explicacao: 'O SYN gasta um número de sequência. O servidor confirma 1001, o próximo número que espera do cliente, e manda no seq o seu próprio número inicial, sorteado. O cliente vai confirmar esse número mais 1.',
    },
  },
  desafio: {
    carta: [
      'A estação de telemedicina ganhou um buffer de recepção de 1 MiB para as consultas com imagem, e desde então o SYN dela leva também a opção de escala de janela. O suporte da regional quer saber de quanto ficou o cabeçalho.',
      'Na mesma semana, o servidor de videoconsulta foi reinstalado e voltou só com o site antigo, na porta 80. A estação recebe "conexão recusada" de novo, e há um exame de 2M esperando para subir.',
      'Objetivo: o video-regional escutando em TCP 443, o exame de 2M transferido por ela e as duas perguntas do suporte respondidas.',
    ],
    montar: () => mundo106({ semente: 2106, tcp: { janela: 1 << 20, escala: 7 }, escutas: [['tcp', 80, 'site antigo']] }),
    objetivo: (m) => [
      item('o video-regional escuta em TCP 443', escutando(m, 'video-regional', 'tcp', 443)),
      item('o exame de 2M transferido inteiro pela porta 443', transferenciaOk(m, 443, 2e6), detalheTransferencia(m)),
      ...todasRespondidas(m, d106D),
    ],
    dicas: [
      'Conexão recusada é RST: falta quem escute na 443. A 80 não serve, a videoconsulta usa a 443.',
      'O SYN agora leva MSS (4 bytes), SACK permitido (2 bytes) e escala de janela (3 bytes). Some aos 20 fixos e complete até múltiplo de 4. "Ver o cabeçalho TCP" depois de conectar confirma.',
      'A confirmação é o próximo byte esperado. Se o 7001 não chegou, o receptor continua pedindo por ele, não importa o que chegue depois.',
    ],
    perguntas: d106D,
    solucao: [
      ['equip', 'video-regional', 'tr-escutar', { proto: 'tcp', porta: '443' }],
      ['equip', 'telemed', 'tr-transferir', { porta: '443', bytes: '2M' }],
    ],
    respostas: { '1': '32', '2': '7001' },
  },
};

export const ATO5B: Dia[] = [dia104, dia105, dia106];
