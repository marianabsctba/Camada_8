// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// Na avenida e no hospital: congestionamento (5.3) e filas e prioridades (5.4.1 a 5.4.3).

import { configFilaAtual, filaConfere } from '../motor/cliQos';
import type { FonteTrafego } from '../motor/fila';
import { adicionar, ligar, novoMundo, roteador, type Mundo } from '../motor/mundo';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, ItemObjetivo, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

/** Número com no máximo duas casas e vírgula decimal. */
const br = (x: number) => String(Number(x.toFixed(2))).replace('.', ',');

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

interface RegistroFila {
  equip: string;
  porta: string;
  carga: number;
  atrasoMedioMs: number;
  perdas: number;
  taxaPerda: number;
  marcadosEcn: number;
  recusadas: string[];
  porFonte: Record<string, { admitida: boolean; perdidos: number; vazaoMbps: number }>;
}

function filaReg(m: Mundo): RegistroFila | undefined {
  return m.flags.fila as RegistroFila | undefined;
}

/** A configuração atual da fila de uma porta (sem as fontes). */
function cfgPorta(m: Mundo, equip: string, porta: string) {
  return configFilaAtual(m.equipamentos.get(equip)!, porta).config;
}

/** A última simulação foi nesta porta, com carga mínima, e ainda vale para a configuração de agora? */
function simulouAgora(m: Mundo, equip: string, porta: string, cargaMin: number): boolean {
  const f = filaReg(m);
  return !!f && f.equip === equip && f.porta === porta && f.carga >= cargaMin - 1e-9 && filaConfere(m);
}

function simulacaoOk(m: Mundo, equip: string, porta: string, cargaMin: number): ItemObjetivo {
  const f = filaReg(m);
  const texto = `simulação da porta ${porta} do ${equip} com pelo menos ${Math.round(cargaMin * 100)} % de carga, feita com a configuração de agora`;
  if (!f) return item(texto, false, 'nenhuma simulação ainda');
  if (f.equip !== equip || f.porta !== porta) return item(texto, false, `a última foi na ${f.porta} do ${f.equip}`);
  if (f.carga < cargaMin - 1e-9) return item(texto, false, `a última foi com ${Math.round(f.carga * 100)} % de carga`);
  return item(texto, filaConfere(m), filaConfere(m) ? undefined : 'a configuração mudou depois da última simulação; simule de novo');
}

function fonteDe(m: Mundo, nome: string) {
  return filaReg(m)?.porFonte?.[nome];
}

interface RegistroEsc {
  disciplina: string;
  equip: string;
  porta: string;
  pesos: number[];
  resultado: Record<string, { vazaoMbps: number; atrasoMedioMs: number; perdidos: number }>;
}

function escReg(m: Mundo): RegistroEsc | undefined {
  return m.flags.escalonamento as RegistroEsc | undefined;
}

interface RegistroBalde {
  tipo: string;
  taxaMbps: number;
  profundidadeKB: number;
  picoMbps: number;
  sTeoricoMs: number | null;
  descartadoKB: number;
}

function baldeReg(m: Mundo): RegistroBalde | undefined {
  return m.flags.balde as RegistroBalde | undefined;
}

/** Dois roteadores ligados por uma porta com fila já configurada (capacidade, buffer e fontes). */
function mundoPorta(semente: number, r: { nome: string; modelo: string; porta: string; lan: string; ip: string }, vizinho: { nome: string; modelo: string; porta: string; ip: string }, fila: { capacidade: number; buffer: number; fontes: FonteTrafego[] }): Mundo {
  const m = novoMundo(semente);
  m.flags.camadaRede = true;
  m.flags.qos = true;
  const a = roteador(r.nome, { modelo: r.modelo, interfaces: { lan: r.lan, [r.porta]: r.ip } });
  a.s.fila = { [r.porta]: { buffer: fila.buffer, capacidade: fila.capacidade, fontes: fila.fontes } };
  adicionar(m, a);
  adicionar(m, roteador(vizinho.nome, { modelo: vizinho.modelo, interfaces: { [vizinho.porta]: vizinho.ip } }));
  ligar(m, { equip: r.nome, porta: r.porta }, { equip: vizinho.nome, porta: vizinho.porta }, 'cat6', 80, { id: 'f1' });
  m.proxCabo = 1;
  return m;
}

/* ======================================================================
 * Mundos
 * ====================================================================== */

/** A avenida central: semáforos, câmeras e o backup do cartório saindo pela mesma porta de 100 Mb/s. */
function mundoAvenida(): Mundo {
  return mundoPorta(
    585,
    { nome: 'avenida', modelo: 'Roteador Anel 8 (armário da avenida central)', porta: 'centro', lan: '10.60.0.1/24', ip: '10.255.60.1/30' },
    { nome: 'dc', modelo: 'Roteador Anel 8 (data center municipal)', porta: 'avenida', ip: '10.255.60.2/30' },
    {
      capacidade: 100,
      buffer: 64,
      fontes: [
        { nome: 'semaforos', mbps: 10 },
        { nome: 'cameras', mbps: 50 },
        { nome: 'backup', mbps: 60 },
      ],
    },
  );
}

/** A rodoviária: catraca e painel de horários (importantes) disputam 50 Mb/s com o Wi-Fi da sala de espera. */
function mundoRodoviaria(): Mundo {
  return mundoPorta(
    3085,
    { nome: 'rodoviaria', modelo: 'Roteador Anel 8 (rodoviária)', porta: 'avenida', lan: '10.61.0.1/24', ip: '10.255.61.1/30' },
    { nome: 'avenida', modelo: 'Roteador Anel 8 (armário da avenida central)', porta: 'rodoviaria', ip: '10.255.61.2/30' },
    {
      capacidade: 50,
      buffer: 128,
      fontes: [
        { nome: 'catraca', mbps: 5, importancia: 5, ecn: false },
        { nome: 'painel', mbps: 10, importancia: 3, ecn: false },
        { nome: 'wifi', mbps: 50, importancia: 1, ecn: false, responde: false },
      ],
    },
  );
}

/** O hospital: voz (EF), vídeo das consultas a distância (AF41) e dados (BE) disputando 100 Mb/s até o data center. */
function mundoHospital(): Mundo {
  return mundoPorta(
    586,
    { nome: 'hospital', modelo: 'Roteador Anel 8 (hospital municipal)', porta: 'dc', lan: '10.70.0.1/24', ip: '10.255.70.1/30' },
    { nome: 'dc', modelo: 'Roteador Anel 8 (data center municipal)', porta: 'hospital', ip: '10.255.70.2/30' },
    {
      capacidade: 100,
      buffer: 64,
      fontes: [
        { nome: 'voz', mbps: 20, tamanho: 200, classe: 'EF' },
        { nome: 'video', mbps: 50, tamanho: 1200, classe: 'AF41' },
        { nome: 'dados', mbps: 100, tamanho: 1500, classe: 'BE' },
      ],
    },
  );
}

/** O ambulatório do Moinho: a telemedicina e o envio de prontuários saem por 50 Mb/s até o hospital. */
function mundoAmbulatorio(): Mundo {
  return mundoPorta(
    3086,
    { nome: 'ambulatorio', modelo: 'Roteador Anel 8 (ambulatório do Moinho)', porta: 'hospital', lan: '10.71.0.1/24', ip: '10.255.71.1/30' },
    { nome: 'hospital', modelo: 'Roteador Anel 8 (hospital municipal)', porta: 'ambulatorio', ip: '10.255.71.2/30' },
    {
      capacidade: 50,
      buffer: 64,
      fontes: [
        { nome: 'voz', mbps: 5, tamanho: 200, classe: 'EF' },
        { nome: 'video', mbps: 30, tamanho: 1200, classe: 'AF41' },
        { nome: 'dados', mbps: 80, tamanho: 1500, classe: 'BE' },
      ],
    },
  );
}

/** O último escalonamento foi nesta porta, com esta disciplina? Devolve o resultado por fluxo. */
function escalonou(m: Mundo, equip: string, porta: string, disciplina: string) {
  const r = escReg(m);
  return r && r.equip === equip && r.porta === porta && r.disciplina === disciplina ? r.resultado : undefined;
}

function wfqOk(m: Mundo, equip: string, porta: string, dadosMin: number): ItemObjetivo[] {
  const r = escReg(m);
  const res = escalonou(m, equip, porta, 'wfq');
  const det = r ? `último: ${r.disciplina} na ${r.porta}${r.disciplina === 'wfq' ? ` com pesos ${r.pesos.join(',')}` : ''}` : 'nenhum escalonamento ainda';
  return [
    item(`escalonamento WFQ na porta ${porta} do ${equip}`, !!res, det),
    item('voz e vídeo sem nenhuma perda', !!res && res.voz!.perdidos === 0 && res.video!.perdidos === 0, res ? `voz ${res.voz!.perdidos}, vídeo ${res.video!.perdidos} perdidos` : undefined),
    item(`dados com pelo menos ${dadosMin} Mb/s (ninguém morre de fome)`, !!res && res.dados!.vazaoMbps >= dadosMin, res ? `${br(res.dados!.vazaoMbps)} Mb/s` : undefined),
  ];
}

/* ======================================================================
 * 85: Congestionamento (5.3)
 * ====================================================================== */

const d85D: Pergunta[] = [numerica('1', 'Com o buffer de fábrica (128 pacotes de 1000 bytes numa porta de 50 Mb/s), quantos milissegundos espera quem entra no fim da fila cheia?', 20.48, 0.05)];

const dia85: Dia = {
  numero: 85,
  ato: 4,
  titulo: 'Congestionamento',
  chamado: [
    'CHAMADO #0085',
    'Toda tarde, às seis, a avenida central para. Não os carros: a rede. As câmeras de trânsito congelam, a central de semáforos perde contato e o painel da prefeitura pisca "sem sinal" bem na hora do rush.',
    'O culpado chega pontual: o backup noturno do cartório, que alguém agendou para as 18h "porque à noite o servidor dorme". Semáforos, câmeras e backup saem todos pela porta "centro" do armário da avenida, um enlace de 100 Mb/s até o data center.',
    'Objetivo: na porta "centro" do roteador da avenida, RED e ECN ligados, controle de admissão até 80 % e uma simulação com 120 % de carga feita depois disso, sem perda nenhuma e com atraso médio abaixo de 1 ms.',
  ],
  manual: {
    titulo: 'Congestionamento',
    texto: [
      'Congestionamento é quando chega a uma parte da rede mais tráfego do que ela consegue levar. O roteador recebe pacotes pela entrada mais depressa do que consegue mandar pela saída, e os que sobram esperam numa fila, o buffer da porta de saída. Se o excesso é passageiro, a fila absorve e depois esvazia. Se o excesso continua, a fila cresce até encher, e daí em diante cada pacote que chega é jogado fora. É diferente do controle de fluxo, que protege um receptor lento de um transmissor rápido: congestionamento é um problema da rede inteira, de muitas origens disputando o mesmo enlace.',
      'Parece que um buffer gigante resolveria. Não resolve: se a porta recebe 120 % do que consegue mandar, nenhuma fila dá conta, porque ela só cresce. Buffer maior apenas troca perda por atraso, e o pacote que espera tempo demais chega inútil (a origem já desistiu e retransmitiu, mandando mais tráfego para a mesma fila). Mesmo abaixo de 100 %, o atraso não é linear: pela conta de uma fila com chegadas aleatórias, ele cresce devagar até uns 70 %, dobra perto de 90 % e explode quando a carga encosta em 100 %, porque a espera é proporcional a 1 / (1 - carga). Por isso a curva carga × atraso tem aquele joelho, e por isso rede boa trabalha com folga.',
      'As soluções se organizam pela escala de tempo. Em meses ou anos, provisionamento: comprar mais capacidade onde o tráfego cresce. Em horas, roteamento sensível ao tráfego: desviar parte do fluxo por caminhos menos carregados. Por fluxo, controle de admissão: um fluxo novo só entra se couber, e quem não cabe é recusado antes de atrapalhar os outros. Em frações de segundo, estrangulamento do tráfego: o roteador avisa as origens para irem mais devagar, seja com um pacote de aviso mandado de volta (choke packet), seja marcando o próprio pacote com os 2 bits de ECN (notificação explícita de congestionamento) do cabeçalho IP, que o destino devolve à origem. E, se nada disso basta, descarte de carga: jogar pacotes fora, de preferência os menos importantes.',
      'O RED (detecção aleatória antecipada) é um jeito esperto de descartar. Em vez de esperar o buffer encher e perder tudo de uma vez, o roteador acompanha a média da fila. Abaixo de um limiar mínimo, nada cai. Entre o mínimo e o máximo, cada pacote que chega cai com uma probabilidade pequena e crescente. Acima do máximo, todos caem. A origem que perde um pacote entende que há congestionamento e diminui a taxa cedo, com a fila ainda curta. Com ECN, o RED nem precisa descartar: marca o pacote, ele chega inteiro, e a origem diminui do mesmo jeito.',
    ],
  },
  dicas: [
    'Primeiro meça: simule a porta "centro" com 120 % de carga e veja atraso, perdas e ocupação da fila. Depois veja a curva carga × atraso.',
    'Ligue o RED (limiares 5 e 15) e o ECN na porta "centro" e simule de novo: as origens passam a receber aviso e diminuem a taxa.',
    'Por último, controle de admissão até 80 %: o backup do cartório não cabe e fica de fora. Toda mudança pede uma simulação nova com 120 %.',
  ],
  montar: mundoAvenida,
  objetivo: (m) => {
    const c = cfgPorta(m, 'avenida', 'centro');
    const f = filaReg(m);
    const valeAgora = simulouAgora(m, 'avenida', 'centro', 1.2);
    return [
      item('RED ligado na porta centro', !!c.red, c.red ? `mín ${c.red.min}, máx ${c.red.max}` : undefined),
      item('ECN ligado na porta centro', !!c.ecn),
      item('controle de admissão até 80 % na porta centro', c.admissao !== undefined && c.admissao <= 0.8 + 1e-9, c.admissao !== undefined ? `${Math.round(c.admissao * 100)} %` : 'desligado'),
      simulacaoOk(m, 'avenida', 'centro', 1.2),
      item('na simulação de agora, nenhuma perda e atraso médio abaixo de 1 ms', valeAgora && f!.perdas === 0 && f!.atrasoMedioMs < 1, f ? `${f.perdas} perdas, atraso médio ${br(f.atrasoMedioMs)} ms` : undefined),
    ];
  },
  posMorte: [
    'Sem nada configurado, a porta "centro" recebia 120 Mb/s para mandar 100. O buffer de 64 pacotes ficou cheio quase o tempo todo (57,8 pacotes em média), o atraso médio foi a 4,71 ms e 15,3 % dos pacotes caíram no fim da fila, sem olhar se eram do semáforo ou do backup. A curva mostrou por quê: até 70 % de carga o atraso mal se mexe, em 95 % já é quase vinte vezes o de 10 %, e acima de 100 % não existe buffer que chegue.',
    'Com RED e ECN, o roteador passou a avisar cedo. A média da fila caiu para 6,1 pacotes, 67 pacotes foram marcados em vez de descartados, as origens diminuíram a taxa e a perda caiu para 4,3 %, com atraso médio de 616,7 µs. Mas a porta continuava recebendo mais do que cabia. O controle de admissão resolveu o resto: a 80 % de 100 Mb/s, semáforos e câmeras (60 Mb/s) entraram, e o backup (mais 60) foi recusado na porta. Carga de 60 %, zero perda, 137,6 µs de atraso médio.',
    'Repare que cada técnica age numa escala de tempo diferente. ECN e RED respondem em frações de segundo, a admissão decide fluxo a fluxo, e a solução de verdade para o backup é de outra escala: o cartório vai remarcar para as 3h da manhã, que é quando o servidor dorme de verdade. Provisionamento e bom senso também são controle de congestionamento.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'avenida'],
      acao: 'fila-simular',
      valores: { porta: 'centro' },
      pedir: ['carga'],
      exemplo: { carga: '1,2' },
      instrucao: 'No roteador da avenida, simule a fila da porta "centro" com a carga do rush: 120 % da capacidade.',
      porque: 'Semáforos (10 Mb/s), câmeras (50) e backup (60) somam 120 Mb/s numa porta de 100. Carga 1,2 quer dizer 20 % a mais do que cabe. Antes de mexer em qualquer coisa, meça.',
      conferir: (m) => {
        const f = filaReg(m);
        if (!f || f.porta !== 'centro') return 'A simulação não foi na porta "centro".';
        return Math.abs(f.carga - 1.2) < 1e-6 ? true : `Você simulou com ${Math.round(f.carga * 100)} %. O rush é 120 %: escreva 1,2 (ou 120 %).`;
      },
      feito: 'Atraso médio de 4,71 ms, 554 de 3616 pacotes perdidos (15,3 %), fila com 57,8 pacotes em média e 64 no pico: o buffer vive cheio. Cheio, ele segura 64 × 80 µs = 5,12 ms de tráfego, e quem chega depois disso cai.',
    }),
    passo({
      alvo: ['equip', 'avenida'],
      acao: 'fila-curva',
      valores: { porta: 'centro' },
      instrucao: 'Veja a curva carga × atraso da porta "centro".',
      porque: 'A mesma porta, com cargas de 10 % a 110 %. A teoria de uma fila com chegadas aleatórias diz que a espera cresce com 1 / (1 - carga): devagar no começo, explodindo perto de 100 %.',
      feito: 'Com 10 % de carga, 83,8 µs; com 50 %, 120,6 µs; com 90 %, 553,3 µs; com 95 %, 1,55 ms; com 99 %, 3,10 ms e já 2,1 % de perda. Com 110 %, a teoria dá infinito e a simulação só não chega lá porque o buffer de 64 tem fim: o resto vira perda (10,7 %).',
    }),
    passo({
      alvo: ['equip', 'avenida'],
      acao: 'fila-red',
      valores: { porta: 'centro', min: '5', max: '15' },
      instrucao: 'Ligue o RED na porta "centro", com limiar mínimo de 5 pacotes e máximo de 15.',
      porque: 'Com a média da fila abaixo de 5, nada cai; entre 5 e 15, cai um pacote aqui e outro ali, ao acaso; acima de 15, todos caem. A origem que perde um pacote diminui a taxa antes de o buffer encher.',
      conferir: (m) => (cfgPorta(m, 'avenida', 'centro').red ? true : 'O RED da porta "centro" continua desligado.'),
      feito: 'RED ligado. Repare que o máximo (15) fica bem abaixo do buffer (64): a ideia é que a fila nunca chegue perto de encher.',
    }),
    passo({
      alvo: ['equip', 'avenida'],
      acao: 'fila-ecn',
      valores: { porta: 'centro', v: 'on' },
      instrucao: 'Ligue a marcação ECN na mesma porta.',
      porque: 'Descartar para avisar é desperdício: o pacote já atravessou meia cidade. Com ECN, quando o RED sortear um pacote, ele é marcado nos 2 bits de congestionamento do cabeçalho IP em vez de cair. O destino devolve o aviso, e a origem diminui do mesmo jeito.',
      conferir: (m) => (cfgPorta(m, 'avenida', 'centro').ecn ? true : 'O ECN da porta "centro" continua desligado. Escolha "ligado".'),
      feito: 'ECN ligado. Um sinal explícito de congestionamento: o pacote chega, e o recado vai junto.',
    }),
    passo({
      alvo: ['equip', 'avenida'],
      acao: 'fila-simular',
      valores: { porta: 'centro', carga: '1,2' },
      instrucao: 'Simule de novo com 120 % de carga.',
      porque: 'Mesma carga oferecida, mas agora o roteador avisa cedo e as origens obedecem. Compare atraso, perdas e ocupação com a primeira simulação.',
      conferir: (m) => (simulouAgora(m, 'avenida', 'centro', 1.2) ? true : 'A simulação precisa ser na porta "centro", com 120 %, depois de ligar RED e ECN.'),
      feito: 'Atraso médio de 616,7 µs, fila com 6,1 pacotes em média, 67 pacotes marcados com ECN e perda de 4,3 %. Bem melhor, mas a porta ainda recebe mais do que cabe: o RED segue descartando um pouco.',
    }),
    passo({
      alvo: ['equip', 'avenida'],
      acao: 'fila-admissao',
      valores: { porta: 'centro' },
      pedir: ['pct'],
      exemplo: { pct: '80' },
      instrucao: 'Ligue o controle de admissão na porta "centro", aceitando fluxos até 80 % da capacidade.',
      porque: 'Os fluxos pedem entrada na ordem: semáforos (10), câmeras (50) e backup (60). A 80 % de 100 Mb/s, cabem 80: semáforos e câmeras somam 60 e entram; com o backup seriam 120, então ele é recusado.',
      conferir: (m) => {
        const a = cfgPorta(m, 'avenida', 'centro').admissao;
        if (a === undefined) return 'O controle de admissão continua desligado.';
        if (a > 0.8 + 1e-9) return `Com ${Math.round(a * 100)} %, sobra pouca folga para a fila. O pedido é 80 %.`;
        if (a < 0.6 - 1e-9) return `Com ${Math.round(a * 100)} %, nem as câmeras entram (semáforos e câmeras somam 60 %). O pedido é 80 %.`;
        return true;
      },
      feito: 'Admissão ligada. Ninguém foi recusado ainda: a decisão acontece quando os fluxos pedem para entrar, na próxima simulação.',
    }),
    passo({
      alvo: ['equip', 'avenida'],
      acao: 'fila-simular',
      valores: { porta: 'centro', carga: '1,2' },
      instrucao: 'Simule a hora do rush mais uma vez, com 120 %.',
      porque: 'Os mesmos 120 Mb/s batem na porta, mas agora a porta escolhe quem entra.',
      conferir: (m) => (simulouAgora(m, 'avenida', 'centro', 1.2) ? true : 'A simulação precisa ser na porta "centro", com 120 %, depois de ligar a admissão.'),
      feito: 'Backup recusado na entrada, carga real de 60 %, zero perda e atraso médio de 137,6 µs. Os semáforos voltaram a conversar com a central.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Mais entrando do que saindo',
        texto: ['Três origens somam 120 Mb/s, e a porta de saída manda 100. O que sobra espera no buffer; quando o buffer enche, cai. Não importa quão rápido o roteador seja por dentro: o gargalo é o enlace de saída.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'se', rotulo: 'semáforos 10 Mb/s', x: 90, y: 40 },
            { id: 'ca', rotulo: 'câmeras 50 Mb/s', x: 90, y: 120 },
            { id: 'ba', rotulo: 'backup 60 Mb/s', x: 90, y: 200 },
            { id: 'av', rotulo: 'avenida (buffer de 64)', x: 300, y: 120 },
            { id: 'dc', rotulo: 'data center', x: 500, y: 120 },
          ],
          ligacoes: [
            ['se', 'av'],
            ['ca', 'av'],
            ['ba', 'av'],
            ['av', 'dc', '100 Mb/s'],
          ],
        },
      },
      {
        titulo: 'A curva carga × atraso',
        texto: ['A espera numa fila com chegadas aleatórias cresce com 1 / (1 - carga). Até uns 70 % quase não se nota; perto de 100 %, explode. Números da porta "centro", com pacotes de 1000 bytes (80 µs cada a 100 Mb/s).'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Carga', 'Atraso médio', 'Perda'],
          linhas: [
            ['10 %', '83,8 µs', '0 %'],
            ['50 %', '120,6 µs', '0 %'],
            ['90 %', '553,3 µs', '0 %'],
            ['95 %', '1,55 ms', '0 %'],
            ['99 %', '3,10 ms', '2,1 %'],
            ['110 %', '4,26 ms (a teoria dá infinito)', '10,7 %'],
          ],
        },
      },
      {
        titulo: 'Buffer infinito não resolve',
        texto: ['A mesma porta com 120 % de carga e buffers de tamanhos diferentes. Buffer maior não cria capacidade: só enche e faz todo mundo esperar a fila inteira. O de 4096 perdeu menos apenas porque passou boa parte do teste enchendo; deixado mais tempo, perde o mesmo e espera ainda mais.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Buffer (pacotes)', 'Atraso médio', 'Perda'],
          linhas: [
            ['8', '535,2 µs', '17,1 %'],
            ['64', '4,97 ms', '16,4 %'],
            ['512', '39,32 ms', '15,4 %'],
            ['4096', '235,01 ms', '7,9 %'],
          ],
        },
      },
      {
        titulo: 'Cada remédio na sua escala de tempo',
        texto: ['Do mais lento ao mais rápido. Quanto mais devagar a solução, mais ela evita o problema; quanto mais rápida, mais ela só reage.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Abordagem', 'Escala', 'O que faz'],
          linhas: [
            ['provisionamento', 'meses ou anos', 'compra capacidade onde o tráfego cresce'],
            ['roteamento sensível ao tráfego', 'horas', 'desvia fluxo para caminhos menos carregados'],
            ['controle de admissão', 'a cada fluxo novo', 'recusa quem não cabe antes de entrar'],
            ['estrangulamento (choke ou ECN)', 'idas e voltas', 'avisa a origem para ir mais devagar'],
            ['descarte de carga e RED', 'cada pacote', 'joga fora, cedo e de preferência o menos importante'],
          ],
        },
      },
      {
        titulo: 'RED com limiares 5 e 15',
        texto: ['A probabilidade de descarte (ou de marcação ECN) depende da média da fila, não do tamanho dela no instante. Assim uma rajada curta passa, e um congestionamento que persiste é avisado cedo. Com ECN, o pacote sorteado é marcado nos 2 bits de baixo do byte de serviço diferenciado do IPv4 em vez de cair.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Média da fila', 'Chance de cair (ou ser marcado)'],
          linhas: [
            ['abaixo de 5', 'zero'],
            ['10 (no meio do caminho)', '5 % (metade do pmáx de 10 %)'],
            ['quase 15', 'perto de 10 %'],
            ['15 ou mais', 'todos'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Uma porta recebe, o tempo todo, 120 % do que consegue mandar. Trocar o buffer de 64 por um de 4096 pacotes resolve?',
      opcoes: [
        'Não: o buffer enche do mesmo jeito, a perda volta ao mesmo nível e o atraso fica muito maior',
        'Sim: com buffer grande nada se perde',
        'Sim: buffer maior aumenta a capacidade do enlace',
        'Não, porque buffer grande aumenta a perda',
      ],
      certa: 0,
      explicacao: 'Com mais chegando do que saindo, a fila só cresce. Qualquer buffer acaba cheio, e daí em diante perde-se o excesso, os 20 Mb/s que não cabem. A diferença é que, cheio, o buffer de 4096 segura 4096 × 80 µs = 327,68 ms de espera. Para resolver, é preciso reduzir o que entra (avisar as origens, recusar fluxos) ou aumentar o que sai.',
    },
  },
  desafio: {
    carta: [
      'Na rodoviária, a catraca eletrônica e o painel de horários saem pela mesma porta de 50 Mb/s que o Wi-Fi da sala de espera. Em feriado prolongado, a carga chega a 130 %: a catraca trava, a fila de passageiros dobra o quarteirão e o painel anuncia o ônibus das 14h às 15h.',
      'Os equipamentos são antigos e não entendem ECN, e o Wi-Fi (vídeo dos passageiros) ignora qualquer aviso. A concessionária exige que o Wi-Fi continue funcionando, com pelo menos 30 Mb/s. Na porta "avenida" do roteador da rodoviária, cada fonte já tem a sua importância anotada: catraca 5, painel 3, Wi-Fi 1.',
      'Objetivo: uma simulação com 130 % de carga, feita com a configuração final, em que catraca e painel não percam nenhum pacote, o Wi-Fi continue admitido com pelo menos 30 Mb/s, o atraso médio fique abaixo de 8 ms, e a pergunta respondida.',
    ],
    dicas: [
      'Quem ignora aviso não vai devagar: nem ECN nem choke packet resolvem para o Wi-Fi. Quando o buffer enche, alguém vai cair; o descarte de carga escolhe o menos importante.',
      'O atraso vem do buffer de fábrica: 128 pacotes de 1000 bytes a 50 Mb/s são 128 × 160 µs. Um buffer de 32 segura um quarto disso.',
      'Descarte de carga ligado, buffer de 32 e uma simulação com 1,3 na porta "avenida". A resposta da pergunta é 128 × 0,16 ms.',
    ],
    perguntas: d85D,
    montar: mundoRodoviaria,
    objetivo: (m) => {
      const f = filaReg(m);
      const vale = simulouAgora(m, 'rodoviaria', 'avenida', 1.3);
      const cat = fonteDe(m, 'catraca');
      const pai = fonteDe(m, 'painel');
      const wifi = fonteDe(m, 'wifi');
      return [
        simulacaoOk(m, 'rodoviaria', 'avenida', 1.3),
        item('catraca e painel sem nenhuma perda', vale && !!cat && !!pai && cat.admitida && pai.admitida && cat.perdidos === 0 && pai.perdidos === 0, cat && pai ? `catraca ${cat.perdidos}, painel ${pai.perdidos} perdidos` : undefined),
        item('Wi-Fi admitido, com pelo menos 30 Mb/s', vale && !!wifi && wifi.admitida && wifi.vazaoMbps >= 30, wifi ? (wifi.admitida ? `${br(wifi.vazaoMbps)} Mb/s` : 'recusado na entrada') : undefined),
        item('atraso médio abaixo de 8 ms', vale && f!.atrasoMedioMs < 8, f ? `${br(f.atrasoMedioMs)} ms` : undefined),
        ...todasRespondidas(m, d85D),
      ];
    },
    solucao: [
      ['equip', 'rodoviaria', 'fila-descarte', { porta: 'avenida', v: 'on' }],
      ['equip', 'rodoviaria', 'fila-buffer', { porta: 'avenida', n: '32' }],
      ['equip', 'rodoviaria', 'fila-simular', { porta: 'avenida', carga: '1,3' }],
    ],
    respostas: { '1': '20,48' },
  },
};

/* ======================================================================
 * 86: Filas e prioridades (5.4.1 a 5.4.3)
 * ====================================================================== */

const d86: Pergunta[] = [numerica('1', 'Pela conta, por quantos milissegundos a rajada do servidor de imagens sai no pico de 500 Mb/s?', 100, 0.5)];

const dia86: Dia = {
  numero: 86,
  ato: 4,
  titulo: 'Filas e prioridades',
  chamado: [
    'CHAMADO #0086',
    'O hospital municipal reclamou por ofício, com carimbo e tudo: nas consultas a distância, a voz do médico picota e o vídeo congela sempre que alguém manda um exame grande. A porta "dc" do roteador do hospital leva 100 Mb/s e recebe voz (20 Mb/s), vídeo (50) e dados (100) ao mesmo tempo.',
    'A diretoria pediu "mais internet". A secretaria de finanças respondeu "não". Sobrou você, a fila de saída e um escalonador.',
    'Objetivo: modelar a rajada do servidor de imagens com um balde de fichas (R = 100 Mb/s, B = 5000 kB, M = 500 Mb/s), responder a pergunta e escalonar a porta "dc" com WFQ de modo que voz e vídeo não percam nada e os dados levem pelo menos 20 Mb/s.',
  ],
  manual: {
    titulo: 'Qualidade de serviço: requisitos, baldes e escalonamento',
    texto: [
      'Cada aplicação sofre com coisas diferentes. Um fluxo é descrito por quatro números: banda (quantos bits por segundo precisa), atraso (quanto tempo o pacote leva de ponta a ponta), jitter (quanto esse atraso varia de um pacote para o outro) e perda. O e-mail aguenta quase tudo; a web quer resposta em segundos; o vídeo sob demanda precisa de banda, mas guarda segundos no buffer do player, então atraso pouco importa; a voz usa pouca banda, mas quer menos de 150 ms num sentido e jitter abaixo de 30 ms; a videoconferência quer banda e pontualidade ao mesmo tempo.',
      'O jeito mais simples de dar qualidade é o superprovisionamento: pôr tanta capacidade que a fila nunca se forma. Funciona, e a telefonia fez isso por décadas. O limite é o preço, e o fato de que o tráfego cresce até ocupar o que existe: um dia alguém manda um exame de 15 MB de uma vez, e a folga some por um instante, que é exatamente o instante em que a voz picota. Quando não dá para comprar banda para o pior caso, é preciso modelar o tráfego que entra e escolher quem sai primeiro.',
      'Modelar o tráfego é combinar, na entrada, a forma do fluxo. O balde furado recebe os pacotes num balde que vaza a uma taxa fixa R: não importa como chegam, saem lisinhos a R, e o que transborda (passa da capacidade B do balde) se perde. O balde de fichas é mais generoso: fichas pingam no balde a uma taxa R, até no máximo B; cada byte que sai gasta uma ficha. Com o balde cheio, uma rajada sai na taxa de pico M da linha até as fichas acabarem. Durante esse tempo S, sai M·S e entram R·S fichas novas, então M·S = B + R·S, e S = B / (M - R). Depois disso, a saída cai para R. Quem não tem ficha espera (modelagem) ou é descartado (policiamento).',
      'Escalonar é decidir qual pacote sai primeiro da fila. FIFO atende na ordem de chegada: simples, e quem manda mais ocupa mais, então a voz espera atrás do arquivo grande. Prioridade estrita mantém uma fila por classe e sempre serve a mais alta que tiver pacote: a voz quase não espera, mas se a classe alta mandar demais, a baixa morre de fome. O WFQ (enfileiramento justo ponderado) dá a cada fila uma fatia proporcional ao seu peso quando todas querem mais do que cabe; quem pede menos do que a fatia leva tudo o que pediu, e a sobra é dividida entre os outros. Ele calcula para cada pacote um tempo de término virtual (o tempo de chegada, ou o fim do anterior do mesmo fluxo, mais tamanho / peso) e manda sempre o menor.',
    ],
  },
  dicas: [
    'Comece pelos requisitos de cada aplicação e repare em quem é exigente em atraso e jitter, mas não em banda.',
    'O balde de fichas vai no roteador do hospital: tipo fichas, taxa 100, profundidade 5000, pico 500 e rajada de 15000 kB. A conta é S = B / (M - R), com tudo na mesma unidade.',
    'Compare FIFO, prioridade estrita e WFQ. No WFQ, os pesos vão na ordem voz, vídeo, dados; com pesos iguais o vídeo fica com 40 Mb/s, menos que os 50 que pede. Tente 1,3,1.',
  ],
  perguntas: d86,
  montar: mundoHospital,
  objetivo: (m) => {
    const b = baldeReg(m);
    return [
      item('balde de fichas simulado com R = 100 Mb/s, B = 5000 kB e M = 500 Mb/s', !!b && b.tipo === 'fichas' && b.taxaMbps === 100 && b.profundidadeKB === 5000 && b.picoMbps === 500, b ? `último: ${b.tipo}, R ${b.taxaMbps}, B ${b.profundidadeKB}, M ${b.picoMbps}` : 'ainda não'),
      ...todasRespondidas(m, d86),
      ...wfqOk(m, 'hospital', 'dc', 20),
    ];
  },
  posMorte: [
    'Na fila única, o FIFO tratou todo mundo igual, e igual quer dizer na proporção do que cada um manda. A voz levou só 11,8 dos 20 Mb/s que pedia, perdeu 1531 pacotes e esperou 9,43 ms em média, a mesma espera do arquivo de exame. Para uma conversa, isso é picote garantido. A prioridade estrita inverteu o jogo: voz com 70,8 µs e zero perda, vídeo com 280,1 µs e zero perda, e os dados ficaram com o que sobrou, 29,3 Mb/s. Funcionou porque voz e vídeo pedem 70 de 100; se a voz mandasse 100, os dados parariam de vez.',
    'O WFQ com pesos 1, 3 e 1 chegou ao mesmo resultado por outro caminho: com o vídeo pesando três vezes mais, a fatia dele passa de 50 Mb/s, maior que os 50 que ele pede, então ele leva tudo; a voz pede menos que a sua fatia e também leva tudo; e os dados pegam a sobra. A diferença está na garantia: no WFQ nenhum fluxo cai abaixo da fatia do seu peso, aconteça o que acontecer com os outros. Com pesos iguais, o vídeo ficaria preso em um terço da porta e perderia 300 pacotes.',
    'O balde de fichas resolve o outro lado: o servidor de imagens manda a rajada de 15 MB no pico de 500 Mb/s por S = 5 MB / (62,5 - 12,5) MB/s = 100 ms, uns 6250 kB, e depois segue a 100 Mb/s até terminar, em uns 800 ms. A rede sabe de antemão o pior que vai receber, e é isso que permite dimensionar filas e prometer qualidade. Superprovisionar a porta para os 500 Mb/s da rajada sairia cinco vezes mais caro, para usar 100 ms de cada vez.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'hospital'],
      acao: 'qos-requisitos',
      instrucao: 'No roteador do hospital, veja os requisitos de cada aplicação.',
      porque: 'Antes de escolher quem passa na frente, é preciso saber quem sofre com o quê: banda, atraso, jitter e perda.',
      feito: 'Voz: banda baixa, mas atraso, jitter e perda exigentes (menos de 150 ms num sentido, jitter abaixo de 30 ms, perda abaixo de 1 %). Vídeo sob demanda: banda alta e atraso tolerante. Videoconferência: tudo alto.',
    }),
    passo({
      escolha: {
        opcoes: [
          'A voz: pouca banda, mas pouquíssima tolerância a atraso e jitter',
          'O vídeo sob demanda: é o que mais gasta banda',
          'O e-mail: se atrasar, a pessoa reclama',
          'Os dados dos exames: são os maiores arquivos',
        ],
        certa: 0,
        errada: {
          1: 'Gastar banda é uma coisa, tolerar atraso é outra. O player do vídeo sob demanda guarda segundos no buffer, então ele aguenta esperar. O problema dele é banda, não pontualidade.',
          2: 'O e-mail aguenta minutos de atraso sem ninguém perceber. Na tabela, ele é baixo em quase tudo.',
          3: 'Arquivo grande precisa de banda e de não perder nada, mas meio segundo a mais não estraga um exame. Já meio segundo a mais numa frase estraga a conversa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual tráfego do hospital mais sofre ao esperar atrás dos outros na fila?',
      porque: 'Fila é atraso, e fila que enche e esvazia é jitter. Quem é exigente nessas duas colunas é quem mais perde numa fila única.',
      feito: 'A voz. Ela pede pouca banda; o problema dela é pontualidade. É a candidata natural a passar na frente.',
    }),
    passo({
      alvo: ['equip', 'hospital'],
      acao: 'balde',
      valores: { taxa: '100', b: '5000', pico: '500', rajada: '15000', espera: '' },
      pedir: ['tipo'],
      exemplo: { tipo: 'fichas' },
      instrucao: 'Modele a rajada do servidor de imagens (15000 kB de uma vez) com um balde de R = 100 Mb/s, B = 5000 kB e pico M = 500 Mb/s. Escolha o balde que deixa a rajada passar no pico enquanto houver crédito.',
      porque: 'O balde furado sai sempre a R e não deixa passar rajada nenhuma. O balde de fichas guarda crédito (até B) quando o fluxo está quieto e gasta esse crédito numa rajada no pico M.',
      conferir: (m) => {
        const b = baldeReg(m);
        if (!b) return 'Nenhum balde simulado ainda.';
        if (b.tipo !== 'fichas') return `O balde furado alisou tudo a 100 Mb/s e jogou fora ${br(b.descartadoKB)} kB que transbordaram. O pedido é deixar a rajada passar no pico: balde de fichas.`;
        return true;
      },
      feito: 'Saíram 6248 kB sem esperar, no pico de 500 Mb/s, durante uns 100 ms; os outros 8752 kB esperaram as fichas pingarem a 100 Mb/s (o último esperou 560,40 ms). Nada se perdeu: com fila de espera sem limite, isso é modelagem, não policiamento.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '100' },
      instrucao: 'Pela conta, por quantos milissegundos a rajada sai no pico de 500 Mb/s?',
      porque: 'Durante S saem M·S bytes e entram R·S fichas, então M·S = B + R·S e S = B / (M - R). Em bytes: B = 5 MB, M = 62,5 MB/s, R = 12,5 MB/s.',
      feito: 'S = 5 MB / (62,5 - 12,5) MB/s = 0,1 s = 100 ms. No pico saem M·S = 6,25 MB, mais do que B: as fichas que pingam durante a rajada também contam.',
    }),
    passo({
      alvo: ['equip', 'hospital'],
      acao: 'escalonar',
      valores: { d: 'fifo', pesos: '' },
      instrucao: 'Escalone a porta "dc" com FIFO, o padrão de fila única.',
      porque: 'Voz, vídeo e dados pedem 170 Mb/s numa porta de 100. Com FIFO, todos esperam na mesma fila e caem na mesma proporção.',
      conferir: (m) => (escalonou(m, 'hospital', 'dc', 'fifo') ? true : 'O escalonamento não foi FIFO na porta "dc".'),
      feito: 'A voz levou 11,8 dos 20 Mb/s, perdeu 1531 pacotes e esperou 9,43 ms em média, igual ao arquivo de exame. O FIFO não sabe quem é voz.',
    }),
    passo({
      alvo: ['equip', 'hospital'],
      acao: 'escalonar',
      valores: { d: 'prioridade', pesos: '' },
      instrucao: 'Agora escalone com prioridade estrita.',
      porque: 'Uma fila por classe: EF (voz) na frente, depois AF41 (vídeo), por último BE (dados). O escalonador sempre serve a fila mais alta que tiver pacote.',
      conferir: (m) => (escalonou(m, 'hospital', 'dc', 'prioridade') ? true : 'O escalonamento não foi prioridade estrita na porta "dc".'),
      feito: 'Voz com 70,8 µs e zero perda, vídeo com 280,1 µs e zero perda, dados com o que sobrou: 29,3 Mb/s e 1760 pacotes perdidos. Ótimo hoje; mas se a voz mandasse 100 Mb/s, os dados ficariam com zero.',
    }),
    passo({
      alvo: ['equip', 'hospital'],
      acao: 'escalonar',
      valores: { d: 'wfq' },
      pedir: ['pesos'],
      exemplo: { pesos: '1,3,1' },
      instrucao: 'Escalone com WFQ, escolhendo os pesos de voz, vídeo e dados (nessa ordem) para que voz e vídeo não percam nada.',
      porque: 'Com todos querendo mais do que cabe, cada fila leva a fatia do seu peso. Com 1,1,1, a voz leva os 20 que pede e a sobra se divide igual entre vídeo e dados, 40 para cada: o vídeo (50) não cabe. Com o vídeo pesando 3, a fatia dele passa de 50.',
      conferir: (m) => {
        const r = escalonou(m, 'hospital', 'dc', 'wfq');
        if (!r) return 'O escalonamento não foi WFQ na porta "dc".';
        if (r.voz!.perdidos > 0) return `A voz perdeu ${r.voz!.perdidos} pacotes: o peso dela ficou pequeno demais perto dos outros.`;
        if (r.video!.perdidos > 0) return `O vídeo levou ${br(r.video!.vazaoMbps)} Mb/s e perdeu ${r.video!.perdidos} pacotes: a fatia dele ainda é menor que os 50 Mb/s que ele pede. Aumente o peso do vídeo.`;
        if (r.dados!.vazaoMbps < 20) return `Os dados ficaram com ${br(r.dados!.vazaoMbps)} Mb/s. Não exagere nos pesos de cima.`;
        return true;
      },
      feito: 'Com 1,3,1: voz com 20,1 Mb/s e vídeo com 50,6 Mb/s, os dois sem perda; dados com 29,3 Mb/s. E, diferente da prioridade estrita, os dados têm garantida a fatia do peso deles, aconteça o que acontecer.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quem sofre com o quê',
        texto: ['O quanto cada aplicação exige da rede. "Alta" quer dizer muito sensível: falta disso estraga a aplicação.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Aplicação', 'Banda', 'Atraso', 'Jitter', 'Perda'],
          linhas: [
            ['e-mail', 'baixa', 'baixa', 'baixa', 'média'],
            ['web', 'média', 'média', 'baixa', 'média'],
            ['vídeo sob demanda', 'alta', 'baixa', 'alta', 'baixa'],
            ['voz', 'baixa', 'alta', 'alta', 'baixa'],
            ['videoconferência', 'alta', 'alta', 'alta', 'baixa'],
          ],
        },
      },
      {
        titulo: 'Superprovisionar: simples e caro',
        texto: [
          'Com capacidade de sobra, a fila nunca se forma e todo mundo fica feliz. O problema é que a capacidade tem que cobrir o pior instante, não a média: a porta do hospital teria de ter 500 Mb/s para a rajada do servidor de imagens, que dura 100 ms.',
          'E tráfego cresce até ocupar o que existe. Quando a folga acaba, quem não tem regra nenhuma volta para o FIFO.',
        ],
      },
      {
        titulo: 'Balde furado e balde de fichas',
        texto: ['Os dois limitam a taxa média a R. A diferença está nas rajadas. Números do servidor de imagens: R = 100 Mb/s, B = 5000 kB, M = 500 Mb/s, rajada de 15000 kB.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Balde furado', 'Balde de fichas'],
          linhas: [
            ['o que guarda', 'pacotes, até B', 'fichas (crédito), até B'],
            ['taxa de saída', 'sempre R', 'M enquanto houver ficha, depois R'],
            ['rajada', 'nenhuma passa', 'passa por S = B / (M - R) = 100 ms'],
            ['o que sobra', 'transborda e se perde', 'espera (modelagem) ou cai (policiamento)'],
          ],
        },
      },
      {
        titulo: 'A conta da rajada',
        texto: ['Durante a rajada saem M·S bytes e pingam R·S fichas novas. Tudo o que sai precisa de ficha: M·S = B + R·S. Isolando S, sai a fórmula. Cuidado com as unidades: bytes com bytes por segundo.'],
        visual: {
          tipo: 'camadas',
          camadas: ['M·S = B + R·S', 'S = B / (M - R)', 'S = 5 MB / (62,5 MB/s - 12,5 MB/s)', 'S = 0,1 s = 100 ms', 'no pico saem M·S = 6,25 MB'],
          rotulo: 'servidor de imagens do hospital',
        },
      },
      {
        titulo: 'FIFO, prioridade e WFQ',
        texto: ['A porta "dc" do hospital, com voz (20 Mb/s), vídeo (50) e dados (100) disputando 100 Mb/s.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Disciplina', 'Voz', 'Vídeo', 'Dados'],
          linhas: [
            ['FIFO', '11,8 Mb/s, 9,43 ms, 1531 perdidos', '30,8 Mb/s, 615 perdidos', '57,4 Mb/s'],
            ['prioridade estrita', '20,1 Mb/s, 70,8 µs, 0 perdidos', '50,6 Mb/s, 0 perdidos', '29,3 Mb/s (pode zerar)'],
            ['WFQ 1,1,1', '20,1 Mb/s, 0 perdidos', '39,9 Mb/s, 300 perdidos', '40,0 Mb/s'],
            ['WFQ 1,3,1', '20,1 Mb/s, 0 perdidos', '50,6 Mb/s, 0 perdidos', '29,3 Mb/s (garantidos)'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Um balde de fichas tem R = 200 Mb/s (25 MB/s), B = 9,6 MB e linha de pico M = 1000 Mb/s (125 MB/s). Por quanto tempo uma rajada sai no pico?',
      opcoes: ['96 ms', '48 ms', '76,8 ms', '384 ms'],
      certa: 0,
      explicacao: 'S = B / (M - R) = 9,6 MB / (125 - 25) MB/s = 0,096 s = 96 ms. Quem dividiu só por M (76,8 ms) esqueceu as fichas que pingam durante a rajada; quem dividiu só por R (384 ms) confundiu o pico com a taxa média.',
    },
  },
  desafio: {
    carta: [
      'O ambulatório do Moinho começou a atender por telemedicina. A porta "hospital" do roteador dele leva 50 Mb/s e recebe voz (5 Mb/s, EF), vídeo da consulta (30 Mb/s, AF41) e o envio de prontuários (80 Mb/s, BE). O vídeo engasga e a médica do outro lado já sabe de cor a cara congelada de cada paciente.',
      'A direção não aceita prioridade estrita: no ano passado, uma regra assim deixou os prontuários parados uma tarde inteira. Quer WFQ, com os prontuários levando pelo menos 10 Mb/s. E o convênio do envio de exames exige um balde de fichas com taxa média de 40 Mb/s, pico de 200 Mb/s e rajada de no máximo 50 ms no pico.',
      'Objetivo: escalonamento WFQ na porta "hospital" do ambulatório com voz e vídeo sem perda e dados com pelo menos 10 Mb/s, e um balde de fichas com R = 40 Mb/s e M = 200 Mb/s cuja rajada no pico dure 50 ms.',
    ],
    dicas: [
      'Com pesos iguais, a voz leva os 5 que pede e o resto se divide igual entre vídeo e dados, 22,5 Mb/s para cada: o vídeo pede 30 e não cabe. A fatia do vídeo precisa passar de 30.',
      'Para o balde, isole B na fórmula: B = S·(M - R). Em bytes: 200 Mb/s são 25 MB/s, 40 Mb/s são 5 MB/s.',
      'B = 0,05 s × 20 MB/s = 1 MB = 1000 kB. Para o WFQ, pesos 1,3,1.',
    ],
    montar: mundoAmbulatorio,
    objetivo: (m) => {
      const b = baldeReg(m);
      const okB = !!b && b.tipo === 'fichas' && b.taxaMbps === 40 && b.picoMbps === 200 && b.sTeoricoMs !== null && Math.abs(b.sTeoricoMs - 50) <= 0.5;
      return [
        ...wfqOk(m, 'ambulatorio', 'hospital', 10),
        item('balde de fichas com R = 40 Mb/s, M = 200 Mb/s e rajada de 50 ms no pico', okB, b ? `último: ${b.tipo}, R ${b.taxaMbps}, M ${b.picoMbps}, B ${b.profundidadeKB} kB${b.sTeoricoMs !== null ? `, S ${br(b.sTeoricoMs)} ms` : ''}` : 'ainda não'),
      ];
    },
    solucao: [
      ['equip', 'ambulatorio', 'escalonar', { d: 'wfq', pesos: '1,3,1' }],
      ['equip', 'ambulatorio', 'balde', { tipo: 'fichas', taxa: '40', b: '1000', pico: '200', rajada: '4000', espera: '' }],
    ],
  },
};

export const ATO4F: Dia[] = [dia85, dia86];
