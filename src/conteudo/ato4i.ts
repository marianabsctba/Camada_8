// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// Qualidade de serviço na camada de rede: serviços integrados e diferenciados no hospital (5.4.4 e 5.4.5)
// e a rede programável no data center municipal (5.6).

import { marcaPara } from '../motor/cliQos';
import { adicionar, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { buscar, fluxosDe, instalarRegra, lerAcoes, lerCasamento, type AcaoFluxo, type Casamento } from '../motor/sdn';
import { lerCidr, lerIp } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;
const ip = (s: string) => lerIp(s)!;

function traceRegistro(m: Mundo, de: string, alvo: string): { chegou: boolean; saltos: (string | null)[] } | undefined {
  return m.flags.traceroutes?.[`${de}>${alvo}`];
}

/* ======================================================================
 * O hospital e a rede regional (dia 87)
 * ====================================================================== */

/** Capacidade do rádio entre o hospital e a regional, em Mb/s. */
const RADIO_MBPS = 100;
/** O RSVP do motor reserva até 75 % da porta. */
const RESERVAVEL = 0.75 * RADIO_MBPS;
/** Reserva que a radiologia já tem no rádio. */
const RADIOLOGIA_MBPS = 40;

interface OpcoesHospital {
  semente: number;
  /** Prédio de dados com o servidor de cópias de segurança. */
  backup?: boolean;
  /** Marcações herdadas na borda (prefixo e DSCP). */
  marcas?: { prefixo: string; dscp: number }[];
}

/**
 * O hospital (borda-hosp, com o ramal do pronto-atendimento na 10.20.1.0/24 e a sala de telemedicina na
 * 10.20.2.0/24) sobe por um rádio de 100 Mb/s até o miolo e dali até a regional de saúde, onde ficam a central
 * de voz (203.0.113.0/24) e o consultório do especialista (198.51.100.0/24). A radiologia já reservou 40 Mb/s no caminho.
 */
function mundoHospital(o: OpcoesHospital): Mundo {
  const m = novoMundo(o.semente);
  m.flags.camadaRede = true;
  m.flags.qos = true;
  adicionar(m, pc('ramal-pa', { ip: cidr('10.20.1.10/24'), gateway: '10.20.1.1', modelo: 'Telefone IP do pronto-atendimento' }));
  adicionar(m, pc('telemed', { ip: cidr('10.20.2.10/24'), gateway: '10.20.2.1', modelo: 'Estação da sala de telemedicina' }));
  adicionar(m, pc('central-voz', { ip: cidr('203.0.113.10/24'), gateway: '203.0.113.1', modelo: 'Central de voz da regional de saúde' }));
  adicionar(m, pc('especialista', { ip: cidr('198.51.100.20/24'), gateway: '198.51.100.1', modelo: 'Consultório do especialista na regional' }));
  adicionar(
    m,
    roteador('borda-hosp', {
      modelo: 'Roteador de borda Plantão 3 (hospital)',
      interfaces: { voz: '10.20.1.1/24', tele: '10.20.2.1/24', wan: '10.0.1.1/30', ...(o.backup ? { dados: '10.20.9.1/24' } : {}) },
      rotas: [
        { destino: '198.51.100.0/24', via: '10.0.1.2' },
        { destino: '203.0.113.0/24', via: '10.0.1.2' },
      ],
    }),
  );
  adicionar(
    m,
    roteador('miolo', {
      modelo: 'Roteador do anel municipal',
      interfaces: { hosp: '10.0.1.2/30', reg: '10.0.2.1/30' },
      rotas: [
        { destino: '198.51.100.0/24', via: '10.0.2.2' },
        { destino: '203.0.113.0/24', via: '10.0.2.2' },
        { destino: '10.20.0.0/16', via: '10.0.1.1' },
      ],
    }),
  );
  adicionar(m, roteador('regional', { modelo: 'Roteador da regional de saúde', interfaces: { miolo: '10.0.2.2/30', lan: '198.51.100.1/24', voz: '203.0.113.1/24' }, rotas: [{ destino: '10.20.0.0/16', via: '10.0.2.1' }] }));
  ligar(m, { equip: 'ramal-pa', porta: 'eth0' }, { equip: 'borda-hosp', porta: 'voz' }, 'cat6', 20, { id: 'c1' });
  ligar(m, { equip: 'telemed', porta: 'eth0' }, { equip: 'borda-hosp', porta: 'tele' }, 'cat6', 20, { id: 'c2' });
  ligar(m, { equip: 'borda-hosp', porta: 'wan' }, { equip: 'miolo', porta: 'hosp' }, 'cat6', 80, { id: 'c3' });
  ligar(m, { equip: 'miolo', porta: 'reg' }, { equip: 'regional', porta: 'miolo' }, 'cat6', 80, { id: 'c4' });
  ligar(m, { equip: 'regional', porta: 'voz' }, { equip: 'central-voz', porta: 'eth0' }, 'cat6', 20, { id: 'c5' });
  ligar(m, { equip: 'regional', porta: 'lan' }, { equip: 'especialista', porta: 'eth0' }, 'cat6', 20, { id: 'c6' });
  m.proxCabo = 7;
  if (o.backup) {
    adicionar(m, pc('backup', { ip: cidr('10.20.9.10/24'), gateway: '10.20.9.1', modelo: 'Servidor de cópias de segurança do prontuário' }));
    ligar(m, { equip: 'backup', porta: 'eth0' }, { equip: 'borda-hosp', porta: 'dados' }, 'cat6', 20, { id: 'c7' });
    m.proxCabo = 8;
  }
  const borda = m.equipamentos.get('borda-hosp')!;
  const miolo = m.equipamentos.get('miolo')!;
  // O rádio do hospital até a regional é de 100 Mb/s, nos dois roteadores que mandam por ele.
  borda.s.fila = { wan: { buffer: 64, capacidade: RADIO_MBPS } };
  miolo.s.fila = { reg: { buffer: 64, capacidade: RADIO_MBPS } };
  // A radiologia já tem reserva no caminho até o servidor de laudos (198.51.100.30).
  borda.s.reservas = { wan: [{ destino: '198.51.100.30', mbps: RADIOLOGIA_MBPS }] };
  miolo.s.reservas = { reg: [{ destino: '198.51.100.30', mbps: RADIOLOGIA_MBPS }] };
  if (o.marcas?.length) {
    borda.s.dscp = o.marcas.map((x) => ({ prefixo: x.prefixo, dscp: x.dscp, campo: 'origem' as const }));
  }
  return m;
}

/** Quanto ainda dá para reservar na saída wan da borda. */
function sobraWan(m: Mundo): number {
  const r = (m.equipamentos.get('borda-hosp')!.s.reservas?.wan ?? []) as { mbps: number }[];
  return RESERVAVEL - r.reduce((s, x) => s + x.mbps, 0);
}

function dscpDe(m: Mundo, nome: string): number | null {
  const e = m.equipamentos.get(nome)!;
  return marcaPara(m.equipamentos.get('borda-hosp')!, e.ip!.endereco);
}

/** Último pedido de eco capturado no destino: veio do IP pedido e com qual DSCP? */
function capturaDe(m: Mundo, origem: string): number | null {
  const c = m.ultimaCaptura;
  if (!c || c.ip.origem !== ip(origem)) return null;
  return c.detalhe?.servico?.dscp ?? 0;
}

function reservaOk(m: Mundo, destino: string, minimo: number): boolean {
  const r = m.flags.rsvp;
  if (!r?.ok || r.destino !== destino) return false;
  const total = ((m.equipamentos.get('borda-hosp')!.s.reservas?.wan ?? []) as { destino: string; mbps: number }[]).filter((x) => x.destino === destino).reduce((s, x) => s + x.mbps, 0);
  return total >= minimo;
}

/* ======================================================================
 * ref 87: Serviços diferenciados (5.4.4 e 5.4.5)
 * ====================================================================== */

const TELEMED_MBPS = 25;
const CIRURGIA_MBPS = 30;

const d87: Pergunta[] = [numerica('1', 'Depois da reserva da telemedicina, quantos Mb/s ainda podem ser reservados na saída wan da borda-hosp?', sobraWan, 0)];
const d87D: Pergunta[] = [numerica('1', 'Depois da reserva da cirurgia remota, quantos Mb/s ainda podem ser reservados na saída wan da borda-hosp?', sobraWan, 0)];

const dia87: Dia = {
  numero: 87,
  ato: 4,
  titulo: 'Serviços diferenciados',
  chamado: [
    'CHAMADO #0087',
    'O pronto-atendimento do hospital reclama que a ligação com a central de voz da regional "fala como robô" sempre que alguém manda um exame pesado. Na mesma semana, a sala de telemedicina ganhou uma consulta fixa com o especialista e precisa de 25 Mb/s garantidos no rádio de 100 Mb/s, que já tem 40 Mb/s reservados pela radiologia.',
    'A direção pergunta se dá para "furar a fila" para a voz sem comprar outro rádio.',
    'Objetivo: a voz do pronto-atendimento marcada como EF na borda e vista assim na captura, a reserva de 25 Mb/s até o especialista aceita em todo o caminho e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Serviços integrados e serviços diferenciados',
    texto: [
      'Quando o enlace aperta, a fila decide quem sofre. Os dias anteriores mostraram as ferramentas de cada roteador (fila, balde, escalonamento). Falta a parte de arquitetura: como a rede inteira combina quem recebe tratamento especial, de ponta a ponta. A camada de rede tem duas respostas clássicas para isso, e elas pensam ao contrário uma da outra.',
      'Serviços integrados pensam por fluxo. Antes de mandar, a aplicação pede uma reserva com um protocolo de sinalização, o RSVP: a mensagem de caminho (PATH) vai da origem até o destino, e a resposta de reserva (RESV) volta salto a salto, e cada roteador confere se cabe e guarda a promessa. Se um só recusar, a reserva toda é desfeita. É controle de admissão: melhor dizer não na entrada do que aceitar e entregar picotado. Aqui no jogo cada roteador aceita reservar até 75 % da porta e deixa o resto para o tráfego comum.',
      'O problema dos serviços integrados é a escala. Cada roteador guarda estado para cada fluxo que passa por ele, renova a reserva de tempos em tempos e confere cada pacote contra essa lista. No hospital são três ou quatro fluxos; num roteador do miolo da internet seriam milhões ao mesmo tempo. Por isso o RSVP ficou para redes pequenas e casos especiais, e a internet foi para outro lado.',
      'Serviços diferenciados pensam por classe. O cabeçalho IPv4 tem um byte de "serviço diferenciado": os 6 bits de cima são o DSCP, a classe do pacote, e os 2 de baixo são do ECN. O roteador da borda classifica o tráfego (pela origem, por exemplo) e escreve a classe ali; os roteadores do meio não classificam de novo, só leem os 6 bits e aplicam o tratamento combinado para aquela classe. Ninguém guarda estado por fluxo: o miolo só conhece meia dúzia de classes.',
      'As classes mais usadas: encaminhamento expresso, EF (DSCP 46), para voz, com pouca fila, pouco atraso e pouca perda, desde que seja pouco tráfego; encaminhamento assegurado, AF, com quatro classes (AF1 a AF4) e três níveis de prioridade de descarte em cada uma (AF11, AF12, AF13, e assim por diante): se apertar, o roteador descarta primeiro o de descarte alto; e o melhor esforço, BE (DSCP 0), que é o padrão de tudo o que não foi marcado.',
    ],
  },
  dicas: [
    'A marcação é na borda-hosp, pelo prefixo de origem da voz (a rede do pronto-atendimento), com a classe de voz.',
    'Prefixo 10.20.1.0/24, classe EF. Depois ping do ramal-pa até 203.0.113.10 e "Ver o último quadro capturado": a linha "serviço diferenciado" mostra a classe.',
    'A reserva sai da borda-hosp até o especialista (198.51.100.20), com 25 Mb/s. Sobra o que faltar para 75 Mb/s depois de somar as reservas.',
  ],
  perguntas: d87,
  montar: () => mundoHospital({ semente: 487 }),
  objetivo: (m) => {
    const marca = dscpDe(m, 'ramal-pa');
    const cap = capturaDe(m, '10.20.1.10');
    return [
      item('a borda-hosp marca a voz do pronto-atendimento (10.20.1.0/24) como EF', marca === 46, marca === null ? 'sem marcação para o ramal' : `DSCP ${marca}`),
      item('um pedido de eco do ramal chegou à regional com DSCP 46 no cabeçalho', cap === 46, cap === null ? 'ainda não há captura de um ping do ramal-pa' : `DSCP ${cap}`),
      item(`reserva RSVP de ${TELEMED_MBPS} Mb/s até o especialista (198.51.100.20) aceita no caminho todo`, reservaOk(m, '198.51.100.20', TELEMED_MBPS), m.flags.rsvp ? (m.flags.rsvp.ok ? `${m.flags.rsvp.mbps} Mb/s para ${m.flags.rsvp.destino}` : `recusada: ${m.flags.rsvp.motivo}`) : 'nenhuma reserva pedida'),
      ...todasRespondidas(m, d87),
    ];
  },
  posMorte: [
    'A voz robótica era fila. O exame da radiologia sai em rajadas de pacotes grandes, e cada pacote de voz que chegava atrás deles esperava a vez. Voz aguenta pouca banda, mas não aguenta esperar: com mais de 150 ms num sentido ou jitter acima de 30 ms, a conversa desmancha. Depois da marcação, cada pacote do ramal sai da borda com o byte de serviço 0xb8, que é DSCP 46 seguido de 00 do ECN, e o miolo, que nunca viu esse telefone, sabe que aquele pacote passa na frente.',
    'A telemedicina foi pelo outro caminho, o dos serviços integrados. O pedido de 25 Mb/s andou da borda-hosp ao miolo e à regional; cada roteador somou o que já tinha prometido (os 40 Mb/s da radiologia) e viu que cabia nos 75 Mb/s reserváveis do rádio. Agora cada um guarda uma linha de estado para esse fluxo. Três roteadores e dois fluxos, tudo bem. Multiplique por todos os fluxos de uma cidade grande e fica claro por que a internet escolheu classes, não reservas.',
    'Repare que nenhuma das duas cria banda. O rádio continua com 100 Mb/s. O que mudou é quem espera quando aperta: a voz nunca, a telemedicina tem a fatia dela prometida, e o resto divide o que sobrar no melhor esforço.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: ['EF, encaminhamento expresso', 'AF13, encaminhamento assegurado com descarte alto', 'BE, melhor esforço', 'CS1, menos que melhor esforço'],
        certa: 0,
        errada: {
          1: 'AF13 é a última da fila na hora de descartar dentro da classe AF1: é justamente o que se joga fora primeiro quando aperta. Para voz, é o contrário do que se quer.',
          2: 'Melhor esforço é o que a voz já tem hoje, e é por isso que ela espera atrás do exame. Sem marcar, nada muda.',
          3: 'CS1 costuma ser usada para tráfego que pode esperar mais do que todo mundo, como cópias de segurança. A voz iria para o fim da fila.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Qual classe de serviços diferenciados combina com a voz do pronto-atendimento?',
      porque: 'Voz pede pouca banda (64 kb/s ou menos), mas é muito sensível a atraso, jitter e perda. Precisa de uma classe que quase não espere em fila.',
      feito: 'EF, DSCP 46: a classe que os roteadores atendem antes das outras, para tráfego pequeno e com pressa.',
    }),
    passo({
      alvo: ['equip', 'borda-hosp'],
      acao: 'dscp',
      pedir: ['prefixo', 'classe'],
      exemplo: { prefixo: '10.20.1.0/24', classe: 'EF' },
      instrucao: 'Na borda-hosp, marque como EF o tráfego que tem origem na rede do pronto-atendimento.',
      porque: 'Quem classifica é a borda, que conhece cada rede do hospital. Os roteadores do meio só leem a classe escrita no cabeçalho.',
      conferir: (m) => {
        const d = dscpDe(m, 'ramal-pa');
        if (d === 46) return true;
        if (d === null) return 'O ramal-pa (10.20.1.10) não cai em nenhum prefixo marcado. A rede do pronto-atendimento é 10.20.1.0/24, a da porta voz.';
        return `O ramal sai com DSCP ${d}, não com EF. A classe da voz é EF, DSCP 46.`;
      },
      feito: 'Marcação gravada: origem em 10.20.1.0/24 sai da borda com DSCP 46 (EF), byte de serviço 0xb8.',
    }),
    passo({
      alvo: ['equip', 'ramal-pa'],
      acao: 'ping',
      valores: { destino: '203.0.113.10', n: '4' },
      instrucao: 'Do ramal-pa, faça ping na central de voz da regional (203.0.113.10).',
      porque: 'O pedido de eco sai do telefone sem marca nenhuma, ganha a classe ao passar pela borda e atravessa o miolo assim até a regional.',
      conferir: (m) => pingOk(m, 'ramal-pa', '203.0.113.10').ok || (registroPing(m, 'ramal-pa', '203.0.113.10') ? 'O ping não voltou inteiro. Confira as rotas e tente de novo.' : 'O ping ainda não foi feito.'),
      feito: 'Quatro respostas. O telefone não sabe de nada: quem escreveu a classe foi a borda.',
    }),
    passo({
      alvo: ['equip', 'central-voz'],
      acao: 'capturar',
      instrucao: 'Na central de voz, veja o último quadro capturado e procure a linha "serviço diferenciado".',
      porque: 'A captura é feita no destino, então mostra o cabeçalho IPv4 como ele chegou, depois de atravessar o miolo inteiro.',
      conferir: (m) => {
        const d = capturaDe(m, '10.20.1.10');
        if (d === 46) return true;
        if (d === null) return 'A última captura não é de um ping do ramal-pa. Faça o ping de novo e capture em seguida.';
        return `Chegou com DSCP ${d}. Confira a marcação na borda-hosp.`;
      },
      feito: 'Serviço diferenciado 0xb8: DSCP 46 (EF), ECN 00. Seis bits de classe, dois de congestionamento, um byte que o miolo inteiro sabe ler.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Porque cada roteador do caminho guardaria estado para cada fluxo, e no miolo da internet seriam milhões',
          'Porque o RSVP só funciona com fibra óptica',
          'Porque reserva de banda é proibida em hospital',
          'Porque o RSVP marca o DSCP errado',
        ],
        certa: 0,
        errada: {
          1: 'O RSVP não liga para o meio físico: ele conversa com os roteadores, salto a salto, sobre fibra, cobre ou rádio.',
          2: 'É o contrário: a telemedicina vai ganhar uma reserva agora mesmo. O problema da reserva por fluxo não é a regra, é a escala.',
          3: 'O RSVP nem mexe no DSCP. Ele reserva por fluxo, guardando estado em cada roteador; o DSCP é a outra arquitetura, a das classes.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A telemedicina vai ganhar uma reserva só para ela. Por que a internet inteira não funciona com reservas assim?',
      porque: 'Reservar é prometer, e quem promete precisa lembrar. Em serviços integrados, cada roteador lembra de cada fluxo que passa por ele.',
      feito: 'Serviços integrados garantem por fluxo e pagam com estado em todo roteador. Funcionam no hospital; não escalam para a internet.',
    }),
    passo({
      alvo: ['equip', 'borda-hosp'],
      acao: 'rsvp',
      valores: { destino: '198.51.100.20' },
      pedir: ['mbps'],
      exemplo: { mbps: String(TELEMED_MBPS) },
      instrucao: 'Da borda-hosp, reserve até o especialista (198.51.100.20) a banda que a telemedicina precisa.',
      porque: 'A reserva vai salto a salto. O rádio tem 100 Mb/s, só 75 Mb/s podem ser reservados, e a radiologia já levou 40 Mb/s.',
      conferir: (m) => {
        const r = m.flags.rsvp;
        if (!r) return 'A reserva ainda não foi pedida.';
        if (!r.ok) return `A reserva foi recusada: ${r.motivo}. Peça só o que a telemedicina precisa, 25 Mb/s.`;
        return reservaOk(m, '198.51.100.20', TELEMED_MBPS) ? true : `Reservou ${r.mbps} Mb/s, mas a consulta precisa de ${TELEMED_MBPS} Mb/s. Uma reserva pequena demais não garante nada.`;
      },
      feito: 'Reserva aceita na borda-hosp, no miolo e na regional. No rádio, 65 dos 75 Mb/s reserváveis estão prometidos.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '10' },
      instrucao: 'Quantos Mb/s ainda podem ser reservados na saída wan da borda-hosp?',
      porque: 'São 75 Mb/s reserváveis (75 % de 100). Tire a radiologia e a telemedicina.',
      feito: 'Sobram 10 Mb/s. Um terceiro pedido de 20 Mb/s seria recusado na entrada, antes de estragar os outros dois.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Serviços integrados: reserva por fluxo',
        texto: [
          'A origem manda PATH até o destino; a RESV volta reservando em cada roteador. Se um não tiver espaço, recusa, e as reservas já feitas no caminho são desfeitas.',
          'No jogo, cada roteador aceita prometer até 75 % da porta. O resto fica para quem não reservou.',
        ],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'tele', rotulo: 'telemed', x: 60, y: 150 },
            { id: 'borda', rotulo: 'borda-hosp: reserva 25', x: 220, y: 60 },
            { id: 'miolo', rotulo: 'miolo: reserva 25', x: 400, y: 60 },
            { id: 'reg', rotulo: 'regional: reserva 25', x: 560, y: 150 },
            { id: 'esp', rotulo: 'especialista', x: 400, y: 240 },
          ],
          ligacoes: [
            ['tele', 'borda', 'PATH'],
            ['borda', 'miolo', 'PATH e RESV'],
            ['miolo', 'reg', 'PATH e RESV'],
            ['reg', 'esp', 'RESV volta'],
          ],
        },
      },
      {
        titulo: 'Por que a reserva por fluxo não escala',
        texto: ['Toda reserva é uma linha de estado em cada roteador do caminho, renovada de tempos em tempos e conferida a cada pacote. Classes trocam essa memória por um campo no cabeçalho.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'Serviços integrados', 'Serviços diferenciados'],
          linhas: [
            ['unidade de tratamento', 'cada fluxo', 'cada classe'],
            ['estado no miolo', 'uma linha por fluxo', 'nenhum por fluxo'],
            ['sinalização', 'RSVP, salto a salto', 'nenhuma: a classe vai no pacote'],
            ['garantia', 'forte, com admissão', 'relativa: a classe passa na frente'],
            ['onde cabe', 'rede pequena, caso especial', 'a internet inteira'],
          ],
        },
      },
      {
        titulo: 'O byte de serviço diferenciado',
        texto: ['O segundo byte do cabeçalho IPv4. Os 6 bits de cima são o DSCP; os 2 de baixo, o ECN. EF é 46, que em binário é 101110; com o ECN 00, o byte fica 10111000, ou 0xb8.'],
        visual: { tipo: 'bits', antes: '00000000', depois: '10111000', legenda: 'melhor esforço (DSCP 0) virando EF (DSCP 46) na borda; os dois últimos bits são do ECN' },
      },
      {
        titulo: 'Marcar na borda, tratar no miolo',
        texto: ['Classificar dá trabalho: olhar origem, destino, porta. Isso se faz uma vez só, na borda, onde a rede conhece quem é quem. No miolo, cada roteador só lê 6 bits e aplica o comportamento combinado para a classe.'],
        visual: {
          tipo: 'camadas',
          camadas: ['o telefone manda o pacote sem marca (DSCP 0)', 'a borda-hosp vê a origem 10.20.1.0/24 e escreve EF', 'o miolo lê EF e atende antes dos outros', 'a regional recebe com DSCP 46 no cabeçalho'],
          rotulo: 'uma classificação, muitos tratamentos',
        },
      },
      {
        titulo: 'As classes',
        texto: ['No AF, o primeiro número é a classe (de 1 a 4) e o segundo é a prioridade de descarte (1 baixa, 3 alta). Quando a fila aperta, dentro da mesma classe some primeiro o AFx3.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Classe', 'DSCP', 'Para quê'],
          linhas: [
            ['EF', '46', 'voz: pouca fila, pouco atraso, pouca perda'],
            ['AF41, AF42, AF43', '34, 36, 38', 'vídeo interativo, descarte baixo a alto'],
            ['AF31 a AF33', '26 a 30', 'aplicações importantes'],
            ['AF21 a AF23', '18 a 22', 'dados transacionais'],
            ['AF11 a AF13', '10 a 14', 'dados comuns com alguma garantia'],
            ['BE', '0', 'melhor esforço, o padrão'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Num roteador do miolo da internet, por que serviços diferenciados dão conta e serviços integrados não?',
      opcoes: [
        'Porque o miolo só olha a classe escrita no pacote, sem guardar nada por fluxo',
        'Porque serviços diferenciados reservam banda com mais precisão',
        'Porque o DSCP tem 64 bits e cabe mais informação',
        'Porque serviços integrados só funcionam com voz',
      ],
      certa: 0,
      explicacao: 'Serviços integrados exigem estado por fluxo em cada roteador do caminho, e no miolo seriam milhões de fluxos. Serviços diferenciados empurram a classificação para a borda e deixam no pacote só uma classe de 6 bits (64 valores possíveis), que o miolo trata sem lembrar de ninguém.',
    },
  },
  desafio: {
    carta: [
      'Uma semana depois, o hospital ligou o prédio de dados (10.20.9.0/24), com o servidor de cópias de segurança do prontuário. Desde então a voz do pronto-atendimento voltou a picotar, e pior que antes.',
      'Quem instalou o prédio deixou "umas marcações de qualidade" na borda-hosp. E o centro cirúrgico agendou para amanhã uma cirurgia com acompanhamento remoto do especialista (198.51.100.20), que precisa de 30 Mb/s garantidos no rádio.',
      'Objetivo: a voz de volta à classe certa e conferida na captura, a cópia de segurança fora da classe da voz, a reserva da cirurgia aceita e a pergunta respondida.',
    ],
    dicas: [
      'Olhe as marcações da borda-hosp. Uma rede ganhou a classe da outra.',
      'A voz (10.20.1.0/24) está como AF13, a que se descarta primeiro; a cópia de segurança (10.20.9.0/24) está como EF, disputando a fila expressa com a voz. Remarque cada uma: EF para a voz, BE ou CS1 para a cópia.',
      'A reserva é como a da telemedicina, mas de 30 Mb/s. A radiologia continua com 40 dos 75 Mb/s reserváveis.',
    ],
    perguntas: d87D,
    montar: () =>
      mundoHospital({
        semente: 3087,
        backup: true,
        marcas: [
          { prefixo: '10.20.1.0/24', dscp: 14 },
          { prefixo: '10.20.9.0/24', dscp: 46 },
        ],
      }),
    objetivo: (m) => {
      const voz = dscpDe(m, 'ramal-pa');
      const bk = dscpDe(m, 'backup');
      const cap = capturaDe(m, '10.20.1.10');
      return [
        item('a voz (10.20.1.0/24) marcada como EF na borda-hosp', voz === 46, voz === null ? 'sem marcação' : `DSCP ${voz}`),
        item('a cópia de segurança (10.20.9.0/24) numa classe que espera: BE, CS1 ou AF11', bk === 0 || bk === 8 || bk === 10, bk === null ? 'sem marcação' : `DSCP ${bk}`),
        item('um ping do ramal-pa chegou à regional com DSCP 46', cap === 46, cap === null ? 'a última captura não é do ramal-pa' : `DSCP ${cap}`),
        item(`reserva de ${CIRURGIA_MBPS} Mb/s até o especialista aceita`, reservaOk(m, '198.51.100.20', CIRURGIA_MBPS), m.flags.rsvp ? (m.flags.rsvp.ok ? `${m.flags.rsvp.mbps} Mb/s` : `recusada: ${m.flags.rsvp.motivo}`) : 'nenhuma reserva pedida'),
        ...todasRespondidas(m, d87D),
      ];
    },
    solucao: [
      ['equip', 'borda-hosp', 'dscp', { prefixo: '10.20.1.0/24', classe: 'EF' }],
      ['equip', 'borda-hosp', 'dscp', { prefixo: '10.20.9.0/24', classe: 'BE' }],
      ['equip', 'ramal-pa', 'ping', { destino: '203.0.113.10', n: '4' }],
      ['equip', 'borda-hosp', 'rsvp', { destino: '198.51.100.20', mbps: String(CIRURGIA_MBPS) }],
    ],
    respostas: { '1': String(RESERVAVEL - RADIOLOGIA_MBPS - CIRURGIA_MBPS) },
  },
};

/* ======================================================================
 * O data center municipal (dia 90)
 * ====================================================================== */

const COPIAS = '10.90.1.10';
const PRONTUARIO = '10.90.2.10';
const ARQUIVO = '10.90.3.10';
const CATRACA = '10.90.4.10';
/** Endereços do r-meio: se algum aparece no traceroute, o fluxo passou pelo miolo congestionado. */
const IPS_MEIO = ['10.0.12.2', '10.0.23.1', '10.90.2.1'];
/** Pacotes que a "regra de teste" da madrugada já descartou. */
const REGRA_TESTE_PACOTES = 1832;

/**
 * Três roteadores em triângulo. O r-entrada recebe o servidor de cópias (10.90.1.0/24) e o controlador da catraca
 * (10.90.4.0/24); o r-meio atende o servidor do prontuário (10.90.2.0/24); o r-saida, o arquivo de armazenamento
 * (10.90.3.0/24). As rotas estáticas mandam tudo pelo r-meio; o enlace direto r-entrada e r-saida (o atalho) fica parado.
 */
function mundoDc(o: { semente: number; regrasVelhas?: boolean }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.camadaRede = true;
  m.flags.qos = true;
  adicionar(m, pc('copias', { ip: cidr(`${COPIAS}/24`), gateway: '10.90.1.1', modelo: 'Servidor de cópias de segurança da prefeitura' }));
  adicionar(m, pc('prontuario', { ip: cidr(`${PRONTUARIO}/24`), gateway: '10.90.2.1', modelo: 'Servidor do prontuário eletrônico do hospital' }));
  adicionar(m, pc('arquivo', { ip: cidr(`${ARQUIVO}/24`), gateway: '10.90.3.1', modelo: 'Arquivo de armazenamento Baú 12' }));
  adicionar(m, pc('catraca', { ip: cidr(`${CATRACA}/24`), gateway: '10.90.4.1', modelo: 'Controlador das catracas da portaria (firmware de 2009)' }));
  adicionar(
    m,
    roteador('r-entrada', {
      modelo: 'Roteador programável Trilho 8 (entrada)',
      interfaces: { lan: '10.90.1.1/24', cat: '10.90.4.1/24', meio: '10.0.12.1/30', atalho: '10.0.13.1/30' },
      rotas: [
        { destino: '10.90.2.0/24', via: '10.0.12.2' },
        { destino: '10.90.3.0/24', via: '10.0.12.2' },
      ],
    }),
  );
  adicionar(
    m,
    roteador('r-meio', {
      modelo: 'Roteador programável Trilho 8 (meio)',
      interfaces: { entrada: '10.0.12.2/30', saida: '10.0.23.1/30', lan: '10.90.2.1/24' },
      rotas: [
        { destino: '10.90.1.0/24', via: '10.0.12.1' },
        { destino: '10.90.4.0/24', via: '10.0.12.1' },
        { destino: '10.90.3.0/24', via: '10.0.23.2' },
      ],
    }),
  );
  adicionar(
    m,
    roteador('r-saida', {
      modelo: 'Roteador programável Trilho 8 (saída)',
      interfaces: { meio: '10.0.23.2/30', atalho: '10.0.13.2/30', lan: '10.90.3.1/24' },
      rotas: [
        { destino: '10.90.1.0/24', via: '10.0.23.1' },
        { destino: '10.90.2.0/24', via: '10.0.23.1' },
        { destino: '10.90.4.0/24', via: '10.0.23.1' },
      ],
    }),
  );
  ligar(m, { equip: 'copias', porta: 'eth0' }, { equip: 'r-entrada', porta: 'lan' }, 'cat6', 5, { id: 'c1' });
  ligar(m, { equip: 'catraca', porta: 'eth0' }, { equip: 'r-entrada', porta: 'cat' }, 'cat6', 40, { id: 'c2' });
  ligar(m, { equip: 'r-entrada', porta: 'meio' }, { equip: 'r-meio', porta: 'entrada' }, 'cat6', 30, { id: 'c3' });
  ligar(m, { equip: 'r-meio', porta: 'saida' }, { equip: 'r-saida', porta: 'meio' }, 'cat6', 30, { id: 'c4' });
  ligar(m, { equip: 'r-entrada', porta: 'atalho' }, { equip: 'r-saida', porta: 'atalho' }, 'cat6', 30, { id: 'c5' });
  ligar(m, { equip: 'r-meio', porta: 'lan' }, { equip: 'prontuario', porta: 'eth0' }, 'cat6', 5, { id: 'c6' });
  ligar(m, { equip: 'r-saida', porta: 'lan' }, { equip: 'arquivo', porta: 'eth0' }, 'cat6', 5, { id: 'c7' });
  m.proxCabo = 8;
  if (o.regrasVelhas) {
    // Deixadas pela manutenção da madrugada, com o controlador desligado depois.
    const e = m.equipamentos.get('r-entrada')!;
    const regra = (prio: number, casa: string, acao: string, pacotes: number, tamanho: number) => {
      const r = instalarRegra(e, prio, lerCasamento(casa) as Casamento, lerAcoes(acao) as AcaoFluxo[]);
      r.contadores = { pacotes, bytes: pacotes * tamanho };
    };
    regra(100, 'destino=10.90.3.0/24', 'porta:atalho', 5120, 1500);
    regra(400, 'destino=10.90.2.0/24', 'descartar', REGRA_TESTE_PACOTES, 84);
  }
  return m;
}

/** A regra do r-entrada que decide um pacote ICMP de origem para destino, sem mexer no contador. */
function decide(m: Mundo, origem: string, destino: string): { id: number; prioridade: number; acoes: AcaoFluxo[] } | null {
  const r = buscar(fluxosDe(m.equipamentos.get('r-entrada')!), { origem: ip(origem), destino: ip(destino), protocolo: 1, tamanho: 84 });
  return r ? { id: r.id, prioridade: r.prioridade, acoes: r.acoes } : null;
}

function vaiPorAtalho(m: Mundo): boolean {
  return !!decide(m, COPIAS, ARQUIVO)?.acoes.some((a) => a.tipo === 'porta' && a.porta === 'atalho');
}

function catracaBloqueada(m: Mundo): boolean {
  return !!decide(m, CATRACA, ARQUIVO)?.acoes.some((a) => a.tipo === 'descartar');
}

function traceSemMeio(m: Mundo): { ok: boolean; detalhe: string } {
  const tr = traceRegistro(m, 'copias', ARQUIVO);
  if (!tr) return { ok: false, detalhe: 'ainda não foi feito' };
  return { ok: tr.chegou && !tr.saltos.some((s) => s !== null && IPS_MEIO.includes(s)), detalhe: tr.saltos.map((x) => x ?? '*').join(' > ') };
}

/** Na última telemetria, a regra de descarte do r-entrada contou quantos pacotes? */
function telemetriaDescarte(m: Mundo): number | null {
  const t = m.flags.sdn?.telemetria?.['r-entrada'] as Record<string, { acoes: string; pacotes: number }> | undefined;
  if (!t) return null;
  const r = Object.values(t).find((x) => x.acoes === 'descartar');
  return r ? r.pacotes : null;
}

/* ======================================================================
 * ref 90: A rede programável (5.6)
 * ====================================================================== */

const d90D: Pergunta[] = [
  numerica('1', 'Qual é o número (#) da regra que estava descartando o tráfego do prontuário?', 2, 0),
  numerica('2', 'Quantos pacotes essa regra já tinha descartado quando a telemetria leu os contadores?', REGRA_TESTE_PACOTES, 0),
];

const dia90: Dia = {
  numero: 90,
  ato: 4,
  titulo: 'A rede programável',
  chamado: [
    'CHAMADO #0090',
    'O data center municipal trocou os três roteadores por modelos programáveis, os Trilho 8, que vêm com um controlador central. Toda madrugada a cópia de segurança da prefeitura atravessa o r-meio até o arquivo e deixa lento o servidor do prontuário, pendurado no mesmo r-meio. Há um enlace direto entre a entrada e a saída que ninguém usa.',
    'E o controlador velho das catracas da portaria (10.90.4.10) resolveu mandar pings sem parar para o arquivo.',
    'Objetivo: o controlador ligado, a cópia de segurança desviada pelo atalho e conferida no traceroute, a catraca bloqueada na tabela de fluxo e a telemetria lida mostrando o que a regra de bloqueio contou.',
  ],
  manual: {
    titulo: 'Redes definidas por software',
    texto: [
      'Todo roteador faz duas coisas muito diferentes. A primeira é decidir: conversar com os vizinhos, montar o mapa, calcular caminhos e escrever a tabela. Isso é o plano de controle, que pode levar segundos. A segunda é executar: para cada pacote que chega, olhar o cabeçalho, achar a linha da tabela e mandar pela porta certa, na velocidade da linha. Isso é o plano de dados. Nos protocolos de roteamento que a cidade já usa, os dois planos moram dentro de cada caixa, e cada caixa decide sozinha a partir do que os vizinhos contam.',
      'Redes definidas por software (SDN) separam os dois. O plano de controle sai das caixas e vai para um controlador logicamente centralizado: pode até rodar em várias máquinas, mas se comporta como um cérebro só, com a visão da rede inteira. Ele calcula os caminhos e instala o resultado nos equipamentos, que ficam só com o plano de dados: casar o pacote e obedecer. Mudar o comportamento da rede vira escrever um programa no controlador, não entrar caixa por caixa.',
      'O que o controlador instala são tabelas de fluxo. Cada regra tem um casamento (campos do cabeçalho: destino, origem, protocolo, DSCP, porta de entrada), uma ação (sair por tal porta, descartar, reescrever um campo, subir o pacote ao controlador ou seguir o encaminhamento normal) e uma prioridade: se duas regras casam, vence a de prioridade maior. Isso generaliza muita coisa: encaminhar pelo destino é casar o destino; um firewall é casar a origem e descartar; mandar um serviço para outra máquina é reescrever o destino. Quando nenhuma regra casa, o pacote segue a tabela de rotas.',
      'Há dois jeitos de encher a tabela. No proativo, o controlador instala a regra antes de o tráfego aparecer. No reativo, uma regra manda o pacote ao controlador (um packet-in); ele consulta a visão da rede, decide e instala a regra para os próximos. Se o controlador cair, as regras instaladas continuam valendo, porque o plano de dados não depende dele a cada pacote; só o que precisaria subir fica sem resposta.',
      'O hardware também mudou. Os chips de encaminhamento programáveis deixam o operador dizer quais cabeçalhos ler, quais tabelas montar e quais ações existem, em vez de vir tudo gravado de fábrica. E cada regra tem contadores de pacotes e bytes que o controlador lê quando quiser: é a telemetria programável, que responde "quanto tráfego casou com este fluxo?" sem pendurar medidor nenhum no cabo.',
    ],
  },
  dicas: [
    'Comece ligando o controlador no r-entrada. Sem ele, ninguém instala regra.',
    'Desvio: no r-entrada, regra de prioridade 200 casando destino=10.90.3.0/24, com a ação porta:atalho. Depois traceroute do servidor de cópias até 10.90.3.10.',
    'Bloqueio: regra casando origem=10.90.4.10, com a ação descartar e prioridade maior que 200 (a catraca também manda para 10.90.3.0/24). Depois ping da catraca até o arquivo e "Telemetria".',
  ],
  montar: () => mundoDc({ semente: 490 }),
  objetivo: (m) => {
    const tr = traceSemMeio(m);
    const pg = registroPing(m, 'catraca', ARQUIVO);
    const tel = telemetriaDescarte(m);
    return [
      item('controlador SDN ligado', !!m.flags.sdn?.controlador),
      item('no r-entrada, a cópia de segurança para 10.90.3.0/24 sai pelo atalho', vaiPorAtalho(m)),
      item('traceroute do servidor de cópias até 10.90.3.10 sem passar pelo r-meio', tr.ok, tr.detalhe),
      item('no r-entrada, o tráfego da catraca para o arquivo cai numa regra de descarte', catracaBloqueada(m)),
      item('ping da catraca até 10.90.3.10 sem nenhuma resposta', !!pg && pg.n > 0 && pg.recebidos === 0, pg ? `${pg.recebidos} de ${pg.n}` : 'ainda não foi feito'),
      item('telemetria lida, com a regra de bloqueio contando pacotes', (tel ?? 0) > 0, tel === null ? 'telemetria ainda não lida depois do bloqueio' : `${tel} pacote(s)`),
    ];
  },
  posMorte: [
    'Nenhuma das três caixas recalculou nada. As rotas estáticas continuam dizendo "tudo pelo r-meio". O que mudou foi uma linha na tabela de fluxo do r-entrada, instalada de fora, pelo controlador, e consultada antes da tabela de rotas. Com ela, o tráfego para 10.90.3.0/24 passou a sair pelo atalho, e o r-meio ficou com o prontuário. Repare que a volta ainda passa pelo r-meio, porque o r-saida não ganhou regra nenhuma: na SDN cada sentido é um fluxo, e quem não foi programado segue a tabela de rotas.',
    'A catraca mostrou para que serve a prioridade. Os pings dela iam para o arquivo, então casavam também com a regra do desvio. Uma regra de descarte com prioridade 100 perderia para o desvio, e a catraca continuaria passando, agora até por um caminho mais curto. Com prioridade acima de 200, vence o descarte. Firewall, encaminhamento e desvio viraram a mesma coisa: casamento, ação e prioridade.',
    'A telemetria fechou a conta sem medidor no cabo: a regra de bloqueio contou os 4 pedidos de eco da catraca, e a do desvio contou as sondas do traceroute. É esse contador por fluxo que deixa o controlador perceber sozinho qual fluxo está pesando e mudar o caminho dele de novo.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'O plano de controle (calcular caminhos) vai para o controlador; os roteadores ficam com o plano de dados (casar e encaminhar)',
          'O plano de dados vai para o controlador; cada pacote passa por ele antes de seguir',
          'Os dois planos continuam em cada roteador, só que com uma tela mais bonita',
          'O controlador substitui os cabos, e os pacotes viajam por software',
        ],
        certa: 0,
        errada: {
          1: 'Se todo pacote subisse ao controlador, ele viraria o gargalo da rede inteira. Só sobe o pacote que uma regra manda subir; o resto é decidido na caixa, pela tabela de fluxo.',
          2: 'Aí seria a rede de sempre. A novidade é justamente tirar a decisão de dentro de cada caixa e pôr num lugar só, com a visão da rede inteira.',
          3: 'Os cabos e os roteadores continuam lá, levando cada pacote. O que vira software é a decisão de para onde cada fluxo vai.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Os Trilho 8 vêm com controlador central. O que muda em relação aos roteadores que calculavam as próprias rotas?',
      porque: 'Decidir e executar têm ritmos diferentes: decidir é raro e precisa da visão de tudo; executar acontece a cada pacote e precisa ser rápido.',
      feito: 'Planos separados: o controlador pensa, a caixa obedece. Agora o controlador precisa estar ligado.',
    }),
    passo({
      alvo: ['equip', 'r-entrada'],
      acao: 'sdn-controlador',
      pedir: ['v'],
      exemplo: { v: 'on' },
      instrucao: 'Ligue o controlador SDN.',
      porque: 'É ele que junta a visão dos três roteadores e dos três enlaces, e só por ele uma regra entra na tabela de fluxo.',
      conferir: (m) => (m.flags.sdn?.controlador ? true : 'O controlador continua desligado. Escolha "ligado".'),
      feito: 'Controlador ligado, com a visão dos 3 roteadores e dos 3 enlaces entre eles, inclusive o atalho que a tabela de rotas ignora.',
    }),
    passo({
      alvo: ['equip', 'r-entrada'],
      acao: 'sdn-regra',
      valores: { prio: '200', casa: 'destino=10.90.3.0/24', em: 'r-entrada' },
      pedir: ['acao'],
      exemplo: { acao: 'porta:atalho' },
      instrucao: 'No r-entrada, instale uma regra de prioridade 200 que mande o tráfego para o arquivo (10.90.3.0/24) pelo enlace direto.',
      porque: 'A tabela de rotas manda pelo r-meio, onde mora o prontuário. A regra de fluxo decide antes da tabela de rotas, então basta dizer por qual porta sair.',
      conferir: (m) => {
        const d = decide(m, COPIAS, ARQUIVO);
        if (!d) return 'Nenhuma regra casa com o tráfego para 10.90.3.10. Confira o casamento destino=10.90.3.0/24.';
        if (vaiPorAtalho(m)) return true;
        if (d.acoes.some((a) => a.tipo === 'descartar')) return 'Com "descartar", a cópia de segurança some inteira, e o arquivo fica sem cópia. A ideia é desviar: porta:atalho.';
        if (d.acoes.some((a) => a.tipo === 'porta' && a.porta === 'meio')) return 'A porta meio é o caminho de sempre, pelo r-meio. O enlace direto até o r-saida é a porta atalho.';
        return 'Essa ação não muda o caminho. Use porta:atalho, o enlace direto até o r-saida.';
      },
      feito: 'Regra #1 no r-entrada: prioridade 200, destino=10.90.3.0/24, porta:atalho. Nenhuma rota foi mexida.',
    }),
    passo({
      alvo: ['equip', 'copias'],
      acao: 'traceroute',
      valores: { destino: ARQUIVO },
      instrucao: 'Do servidor de cópias, faça um traceroute até o arquivo (10.90.3.10).',
      porque: 'O traceroute revela cada roteador do caminho. Se o desvio pegou, o r-meio não aparece.',
      conferir: (m) => {
        const t = traceSemMeio(m);
        return t.ok ? true : t.detalhe === 'ainda não foi feito' ? 'O traceroute ainda não foi feito.' : `O caminho ainda passa pelo r-meio: ${t.detalhe}. Confira a regra do desvio.`;
      },
      feito: 'r-entrada, r-saida e o arquivo. O r-meio sumiu do caminho, e o prontuário ficou com ele só para si.',
    }),
    passo({
      alvo: ['equip', 'r-entrada'],
      acao: 'sdn-regra',
      valores: { acao: 'descartar', em: 'r-entrada' },
      pedir: ['prio', 'casa'],
      exemplo: { prio: '300', casa: `origem=${CATRACA}` },
      instrucao: 'Agora uma regra que descarte o tráfego que vem da catraca (10.90.4.10). Escolha a prioridade com cuidado.',
      porque: 'Os pings da catraca vão para 10.90.3.10 e por isso também casam com a regra do desvio, de prioridade 200. Quando duas regras casam, vence a de prioridade maior.',
      conferir: (m) => {
        if (decide(m, COPIAS, ARQUIVO)?.acoes.some((a) => a.tipo === 'descartar')) return 'Essa regra pega também a cópia de segurança. O casamento precisa ser só a origem da catraca: origem=10.90.4.10.';
        if (catracaBloqueada(m)) return true;
        const d = decide(m, CATRACA, ARQUIVO);
        if (d && d.prioridade === 200) return 'O tráfego da catraca ainda cai na regra do desvio, que tem prioridade 200. A de descarte precisa de prioridade maior, como 300.';
        return 'Nenhuma regra de descarte casa com a catraca. O casamento é origem=10.90.4.10.';
      },
      feito: 'Regra #2: casa origem=10.90.4.10, faz descartar e vence o desvio na disputa por prioridade.',
    }),
    passo({
      alvo: ['equip', 'catraca'],
      acao: 'ping',
      valores: { destino: ARQUIVO, n: '4' },
      instrucao: 'Da catraca, faça ping no arquivo (10.90.3.10) para ver o bloqueio funcionando.',
      porque: 'O pedido de eco entra no r-entrada, casa com a regra #2 e morre ali, sem nem chegar à tabela de rotas.',
      conferir: (m) => {
        const r = registroPing(m, 'catraca', ARQUIVO);
        if (!r) return 'O ping ainda não foi feito.';
        return r.recebidos === 0 ? true : `Voltaram ${r.recebidos} respostas: a catraca ainda passa. Confira a prioridade da regra de descarte.`;
      },
      feito: 'Zero de 4. A saída do ping diz qual regra da tabela de fluxo mandou descartar.',
    }),
    passo({
      alvo: ['equip', 'r-entrada'],
      acao: 'sdn-telemetria',
      instrucao: 'Peça ao controlador a telemetria das tabelas de fluxo.',
      porque: 'Cada regra conta os pacotes e bytes que casaram com ela. O controlador lê esses contadores em todos os equipamentos, sem medidor nenhum no cabo.',
      conferir: (m) => ((telemetriaDescarte(m) ?? 0) > 0 ? true : 'A telemetria não mostrou pacotes na regra de descarte. Faça o ping da catraca antes de ler.'),
      feito: 'A regra #2 contou os 4 pedidos de eco da catraca; a #1, as sondas do traceroute. Cada fluxo com o seu número.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Dois planos, dois ritmos',
        texto: [
          'Plano de controle: decidir para onde cada coisa vai, olhando a rede toda. Acontece de vez em quando. Plano de dados: aplicar a decisão a cada pacote, na velocidade da linha.',
          'Na rede tradicional os dois moram em cada roteador. Na SDN, o de controle sai da caixa.',
        ],
        visual: {
          tipo: 'camadas',
          camadas: ['aplicações de rede: desvio, firewall, balanceamento', 'controlador: visão da rede inteira, calcula e instala regras (plano de controle)', 'tabelas de fluxo em cada equipamento: casar e agir (plano de dados)', 'portas, cabos e pacotes'],
          rotulo: 'quem decide fica em cima, quem executa fica embaixo',
        },
      },
      {
        titulo: 'Um cérebro com a visão de tudo',
        texto: ['O controlador é logicamente centralizado: pode rodar em várias máquinas, mas se comporta como um só. Ele conhece todos os enlaces, inclusive os que a tabela de rotas ignora, e fala com cada equipamento para instalar regras e ler contadores.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'ctl', rotulo: 'controlador', x: 330, y: 40 },
            { id: 'ent', rotulo: 'r-entrada', x: 120, y: 200 },
            { id: 'meio', rotulo: 'r-meio', x: 330, y: 260 },
            { id: 'sai', rotulo: 'r-saida', x: 540, y: 200 },
          ],
          ligacoes: [
            ['ctl', 'ent', 'regras e contadores'],
            ['ctl', 'meio', 'regras e contadores'],
            ['ctl', 'sai', 'regras e contadores'],
            ['ent', 'meio', 'caminho das rotas'],
            ['meio', 'sai'],
            ['ent', 'sai', 'atalho'],
          ],
        },
      },
      {
        titulo: 'A tabela de fluxo',
        texto: ['Cada regra: prioridade, casamento e ação. O pacote é comparado da prioridade maior para a menor, e a primeira que casa decide. Se nenhuma casa, vale a tabela de rotas. A ação "controlador" sobe o pacote (packet-in), e o controlador instala uma regra reativa para os próximos.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Prioridade', 'Casamento', 'Ação', 'Faz o papel de'],
          linhas: [
            ['300', 'origem=10.90.4.10', 'descartar', 'firewall'],
            ['200', 'destino=10.90.3.0/24', 'porta:atalho', 'desvio de caminho'],
            ['150', 'dscp=EF', 'dscp=AF41+normal', 'remarcação de classe'],
            ['100', 'destino=10.90.2.0/24', 'controlador', 'pergunta ao controlador'],
            ['nenhuma casou', 'qualquer pacote', 'tabela de rotas', 'encaminhamento comum'],
          ],
        },
      },
      {
        titulo: 'Hardware que se programa',
        texto: ['Os chips de encaminhamento programáveis deixam o operador definir quais cabeçalhos ler, quais tabelas de casamento e ação montar e em que ordem. Um protocolo novo deixa de esperar a próxima geração de equipamento: vira um programa carregado no chip.'],
        visual: {
          tipo: 'camadas',
          camadas: ['analisador: quais cabeçalhos ler e em que ordem', 'estágio 1 de casamento e ação', 'estágio 2 de casamento e ação', 'montador: devolve o pacote, talvez reescrito, para a porta de saída'],
          rotulo: 'o caminho do pacote dentro de um chip programável',
        },
      },
      {
        titulo: 'Telemetria programável',
        texto: ['Cada regra conta os pacotes e os bytes que casaram com ela. O controlador lê os contadores quando quiser, de todos os equipamentos, e enxerga o tráfego por fluxo, não só por porta. É isso que permite reagir: desviar quem pesa, bloquear quem abusa.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Regra', 'Casamento', 'Ação', 'Pacotes', 'Bytes'],
          linhas: [
            ['#1', 'destino=10.90.3.0/24', 'porta:atalho', '6 (as sondas do traceroute que passaram do r-entrada)', '504'],
            ['#2', 'origem=10.90.4.10', 'descartar', '4', '336'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'O controlador SDN desligou de madrugada. O que acontece com um fluxo que já tem regra instalada?',
      opcoes: [
        'Continua sendo encaminhado pela regra: o plano de dados não depende do controlador a cada pacote',
        'Para na hora, porque todo pacote precisa passar pelo controlador',
        'Volta a seguir a tabela de rotas, porque as regras se apagam sozinhas',
        'Passa a ser descartado até o controlador voltar',
      ],
      certa: 0,
      explicacao: 'As regras instaladas ficam na tabela de fluxo de cada equipamento, que continua casando e agindo sem o controlador. Fica sem resposta só o pacote que uma regra manda subir ao controlador (packet-in): sem ninguém para decidir, ele é descartado.',
    },
  },
  desafio: {
    carta: [
      'Sete da manhã: o plantão não abre o prontuário (10.90.2.10). Nada do data center chega nele, nem o servidor de cópias. Os cabos estão bons e as rotas não mudaram.',
      'A equipe terceirizada da manutenção da madrugada escreveu que "só instalou uma regra de teste" nos Trilho 8 e desligou o controlador antes de ir embora. O desvio da cópia de segurança pelo atalho precisa continuar valendo.',
      'Objetivo: o servidor de cópias voltando a alcançar o prontuário, a cópia de segurança ainda pelo atalho, a telemetria lida e as duas perguntas respondidas.',
    ],
    dicas: [
      'Ligue o controlador e leia a telemetria antes de mexer em qualquer coisa: os contadores mostram qual regra está engolindo pacotes.',
      'A regra #2 casa destino=10.90.2.0/24, descarta e tem prioridade 400. Já descartou 1832 pacotes.',
      'Esvaziar a tabela do r-entrada leva junto o desvio. Se apagar tudo, reinstale a regra de prioridade 200 com destino=10.90.3.0/24 e porta:atalho, e confira com ping e traceroute.',
    ],
    perguntas: d90D,
    montar: () => mundoDc({ semente: 3090, regrasVelhas: true }),
    objetivo: (m) => {
      const tr = traceSemMeio(m);
      return [
        pingOk(m, 'copias', PRONTUARIO),
        item('no r-entrada, a cópia de segurança para 10.90.3.0/24 ainda sai pelo atalho', vaiPorAtalho(m)),
        item('traceroute do servidor de cópias até 10.90.3.10 sem passar pelo r-meio', tr.ok, tr.detalhe),
        item('telemetria lida pelo controlador', !!m.flags.sdn?.telemetria),
        ...todasRespondidas(m, d90D),
      ];
    },
    solucao: [
      ['equip', 'r-entrada', 'sdn-controlador', { v: 'on' }],
      ['equip', 'r-entrada', 'sdn-telemetria'],
      ['equip', 'r-entrada', 'sdn-apagar'],
      ['equip', 'r-entrada', 'sdn-regra', { prio: '200', casa: 'destino=10.90.3.0/24', acao: 'porta:atalho', em: 'r-entrada' }],
      ['equip', 'copias', 'ping', { destino: PRONTUARIO, n: '4' }],
      ['equip', 'copias', 'traceroute', { destino: ARQUIVO }],
    ],
    respostas: { '1': '2', '2': String(REGRA_TESTE_PACOTES) },
  },
};

export const ATO4I: Dia[] = [dia87, dia90];
