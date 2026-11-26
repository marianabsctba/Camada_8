// Camada de transporte do ato 5: máquina de estados, aperto de mão e encerramento, RST, demultiplexação, UDP,
// janela do receptor, janela zero, retransmissões, RTO, partida lenta e AIMD, justiça, perda sem fio, QUIC, BBR
// e desempenho. Primeiro as funções puras, depois o mundo (roteadores, NAT, console e ações).
import { describe, expect, it } from 'vitest';
import {
  amostrarRtt,
  bdpBytes,
  calcularRto,
  checksumConfere,
  entreguesEntre,
  escalaNecessaria,
  indiceJain,
  janelaEm,
  montarCabecalhoTcp,
  montarCabecalhoUdp,
  simularConexao,
  simularJanelaBoba,
  simularNagle,
  simularTcp,
  tempoVoltaSeq,
  transitar,
  vazaoComPerda,
  vazaoJanela,
} from '../src/motor/tcp';
import { chamarRpc, compactacao, enviarDatagramas, simularRtp } from '../src/motor/udp';
import { compararCabecaDeFila, estabelecimento, simularMigracao } from '../src/motor/quic';
import { demultiplexar, escutar, soquetesDe, temTransporte } from '../src/motor/transporte';
import { lerBytes, tcpConfere } from '../src/motor/cliTransporte';
import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../src/motor/mundo';
import { configurarNat, nat } from '../src/motor/roteamento';
import { Terminal } from '../src/motor/cli';
import { acoesEquip, executarAcao, padroes } from '../src/motor/acoes';
import { lerCidr, lerIp } from '../src/motor/util';
import type { Dia } from '../src/conteudo/tipos';

const TRAVESSAO = /[—–]/;
const ip = (s: string) => lerIp(s)!;
/** 10 Mb/s, 20 ms de propagação em cada sentido (RTT de 40 ms), buffer de 50 pacotes. */
const CANO = { banda: 10e6, atraso: 0.02, buffer: 50 };
const RTT = 0.04 + (1500 * 8) / 10e6 + (40 * 8) / 10e6;

describe('máquina de estados, aperto de mão e encerramento', () => {
  it('três vias para abrir e quatro segmentos para fechar, com a sequência certa de estados', () => {
    const r = simularConexao({ ida: 0.01, escutando: true, isnCliente: 1000, isnServidor: 5000, fechamento: 'cliente', msl: 30 });
    expect(r.aberta).toBe(true);
    expect(r.estadosCliente).toEqual(['CLOSED', 'SYN_SENT', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSED']);
    expect(r.estadosServidor).toEqual(['CLOSED', 'LISTEN', 'SYN_RCVD', 'ESTABLISHED', 'CLOSE_WAIT', 'LAST_ACK', 'CLOSED']);
    const [syn, synAck, ack] = r.segmentos;
    expect(syn!.texto).toMatch(/^SYN seq=1000/);
    expect(synAck!.seg).toMatchObject({ seq: 5000, ack: 1001, flags: { syn: true, ack: true } });
    expect(ack!.seg).toMatchObject({ seq: 1001, ack: 5001, flags: { ack: true } });
    // O cliente pode mandar dados depois de 1 RTT; o TIME_WAIT dura 2 MSL.
    expect(r.tAberta).toBeCloseTo(0.02, 9);
    expect(r.tFechada! - r.tAberta!).toBeGreaterThan(60);
    expect(r.linhas.join('\n')).toMatch(/TIME_WAIT por 2 MSL = 60 s/);
  });

  it('fechamento simultâneo passa por CLOSING nos dois lados', () => {
    const r = simularConexao({ ida: 0.01, escutando: true, fechamento: 'simultaneo' });
    for (const lado of [r.estadosCliente, r.estadosServidor]) expect(lado.slice(-4)).toEqual(['FIN_WAIT_1', 'CLOSING', 'TIME_WAIT', 'CLOSED']);
  });

  it('a tabela de transições cobre os onze estados', () => {
    expect(transitar('LISTEN', 'syn')!.para).toBe('SYN_RCVD');
    expect(transitar('FIN_WAIT_1', 'fin')!.para).toBe('CLOSING');
    expect(transitar('ESTABLISHED', 'syn')).toBeNull();
  });

  it('SYN perdido: o cliente espera 1 s, depois 2 s, e só então abre', () => {
    const r = simularConexao({ ida: 0.01, escutando: true, synPerdidos: 2, fechamento: 'nenhum' });
    expect(r.aberta).toBe(true);
    expect(r.tAberta).toBeCloseTo(3.02, 6);
  });

  it('RST quando ninguém escuta: o cliente volta a CLOSED na hora', () => {
    const r = simularConexao({ ida: 0.01, escutando: false });
    expect(r.aberta).toBe(false);
    expect(r.recusada).toBe(true);
    expect(r.estadosCliente).toEqual(['CLOSED', 'SYN_SENT', 'CLOSED']);
    expect(r.segmentos[1]!.seg.flags).toMatchObject({ rst: true, ack: true });
    expect(r.linhas.join('\n')).toMatch(/Conexão recusada/);
  });
});

describe('cabeçalhos', () => {
  it('TCP com opções: tamanho do cabeçalho, flags e checksum sobre o pseudo-cabeçalho', () => {
    const h = montarCabecalhoTcp({ portaOrigem: 49152, portaDestino: 80, seq: 1000, ack: 0, flags: { syn: true }, janela: 65535, opcoes: { mss: 1460, escala: 7, sackOk: true } }, ip('192.0.2.10'), ip('203.0.113.10'));
    expect(h.tamanho).toBe(32);
    expect(h.bytes[12]! >> 4).toBe(8);
    expect(h.bytes[13]).toBe(0x02);
    expect(checksumConfere(h.bytes, ip('192.0.2.10'), ip('203.0.113.10'), 6)).toBe(true);
    // Mudar o IP de destino (um NAT que esquecesse de recalcular) quebra o checksum.
    expect(checksumConfere(h.bytes, ip('192.0.2.10'), ip('203.0.113.11'), 6)).toBe(false);
  });

  it('UDP: 8 bytes, tamanho inclui o cabeçalho', () => {
    const u = montarCabecalhoUdp({ portaOrigem: 5353, portaDestino: 53, dados: 100 }, ip('192.0.2.10'), ip('198.51.100.53'));
    expect(u.bytes).toHaveLength(8);
    expect(u.tamanhoTotal).toBe(108);
    expect(checksumConfere(u.bytes, ip('192.0.2.10'), ip('198.51.100.53'), 17, 100)).toBe(true);
  });
});

describe('UDP, RPC e RTP', () => {
  it('UDP perde mensagens e não retransmite nenhuma', () => {
    const r = enviarDatagramas(500, { atraso: 0.01, perda: 0.1 });
    expect(r.perdidos).toBeGreaterThan(25);
    expect(r.recebidos + r.perdidos).toBe(500);
    expect(r.retransmissoes).toBe(0);
    expect(enviarDatagramas(10, { atraso: 0.01, perda: 0 }, { perdidos: [3, 7] }).quaisPerdidos).toEqual([3, 7]);
  });

  it('RPC: resposta perdida faz o servidor executar duas vezes', () => {
    const r = chamarRpc({ atraso: 0.01, perda: 0 }, { espera: 0.1, tentativas: 3, perdas: ['resposta'] });
    expect(r.ok).toBe(true);
    expect(r.tentativas).toBe(2);
    expect(r.execucoes).toBe(2);
    expect(r.tempo).toBeCloseTo(0.1205, 6);
    const morto = chamarRpc({ atraso: 0.01, perda: 0 }, { espera: 0.1, tentativas: 3, escuta: false });
    expect(morto.ok).toBe(false);
    expect(morto.tentativas).toBe(3);
  });

  it('RTP: buffer maior salva os atrasados, à custa de mais atraso de boca a ouvido', () => {
    const c = { atraso: 0.03, perda: 0.01, jitter: 0.015 };
    const curto = simularRtp(c, { pacotes: 500, buffer: 0.01 });
    const longo = simularRtp(c, { pacotes: 500, buffer: 0.12 });
    expect(curto.atrasados).toBeGreaterThan(longo.atrasados);
    expect(longo.atrasoBoca).toBeGreaterThan(curto.atrasoBoca);
    expect(curto.jitter).toBeGreaterThan(0.005);
    expect(curto.pacotes[1]!.marca - curto.pacotes[0]!.marca).toBe(160);
    expect(compactacao(20).eficienciaCom).toBeGreaterThan(2 * compactacao(20).eficienciaSem);
  });
});

describe('transferência confiável e controle de fluxo', () => {
  it('sem perda, entrega tudo em ordem perto da banda do gargalo', () => {
    // Janela do receptor de 64 KB: 44 segmentos, menos que o cano (BDP de 34) mais o buffer (50), então nada se perde.
    const r = simularTcp([{ bytes: 2e6 }], CANO);
    const f = r.fluxos[0]!;
    expect(f.concluiu).toBe(true);
    expect(f.entregues).toBe(2e6);
    expect(f.retransmissoes).toBe(0);
    expect(f.segmentos).toBe(Math.ceil(2e6 / 1460));
    expect(f.vazaoMbps).toBeGreaterThan(8);
  });

  it('janela do receptor limita: vazão ≈ janela ÷ RTT', () => {
    const janela = 16 * 1024;
    const r = simularTcp([{ bytes: 2e6, config: { janela, janelaInicial: 10 } }], { banda: 100e6, atraso: 0.025, buffer: 1000 });
    const f = r.fluxos[0]!;
    const rtt = 0.05;
    expect(f.vazaoMbps * 1e6).toBeLessThan(vazaoJanela(janela, rtt) * 1.05);
    expect(f.vazaoMbps * 1e6).toBeGreaterThan(vazaoJanela(janela, rtt) * 0.8);
    expect(vazaoJanela(janela, rtt)).toBeCloseTo((16384 * 8) / 0.05, 6);
    // A mesma rede com janela grande: muito mais rápido.
    const grande = simularTcp([{ bytes: 2e6, config: { janela: 4 << 20, escala: 7, janelaInicial: 10 } }], { banda: 100e6, atraso: 0.025, buffer: 1000 });
    expect(grande.fluxos[0]!.vazaoMbps).toBeGreaterThan(3 * f.vazaoMbps);
  });

  it('sem escala de janela, buffer grande não adianta: o campo de 16 bits para em 65535', () => {
    const sem = simularTcp([{ bytes: 4e6, config: { janela: 1 << 22, escala: 0, janelaInicial: 10 } }], { banda: 100e6, atraso: 0.025, buffer: 2000 });
    const com = simularTcp([{ bytes: 4e6, config: { janela: 1 << 22, escala: escalaNecessaria(1 << 22), janelaInicial: 10 } }], { banda: 100e6, atraso: 0.025, buffer: 2000 });
    expect(Math.max(...sem.fluxos[0]!.janela.map((p) => p.rwnd))).toBe(65535);
    expect(com.fluxos[0]!.vazaoMbps).toBeGreaterThan(2 * sem.fluxos[0]!.vazaoMbps);
  });

  it('janela zero: a aplicação para de ler, o receptor fecha a janela e o emissor manda sonda', () => {
    const r = simularTcp([{ bytes: 300e3, config: { janela: 32 * 1024, leitura: { bytes: 64 * 1024, intervalo: 0.001 }, pausaLeitura: [0.05, 1.5] } }], CANO);
    const f = r.fluxos[0]!;
    expect(f.janelasZero).toBeGreaterThanOrEqual(1);
    expect(f.sondas).toBeGreaterThanOrEqual(1);
    expect(f.janela.some((p) => p.rwnd === 0)).toBe(true);
    expect(f.concluiu).toBe(true);
    expect(f.fim!).toBeGreaterThan(1.5);
    expect(r.eventos.some((e) => e.tipo === 'atualizacao-janela')).toBe(true);
  });

  it('janela boba: sem Clark, segmentos minúsculos; com Clark, segmentos grandes', () => {
    const sem = simularJanelaBoba({ sws: false });
    const com = simularJanelaBoba({ sws: true });
    expect(sem.bytesPorSegmento).toBeLessThan(20);
    expect(com.bytesPorSegmento).toBeGreaterThan(5 * sem.bytesPorSegmento);
    expect(com.eficiencia).toBeGreaterThan(sem.eficiencia);
  });

  it('Nagle junta as escritas pequenas', () => {
    const sem = simularNagle({ escritas: 40, bytes: 1, intervalo: 0.05, rtt: 0.2, nagle: false });
    const com = simularNagle({ escritas: 40, bytes: 1, intervalo: 0.05, rtt: 0.2, nagle: true });
    expect(sem.segmentos).toBe(40);
    expect(com.segmentos).toBeLessThan(15);
    expect(com.bytesPorSegmento).toBeGreaterThan(3);
  });

  it('ACK atrasado: menos ACKs', () => {
    const sem = simularTcp([{ bytes: 500e3 }], CANO).fluxos[0]!;
    const com = simularTcp([{ bytes: 500e3, config: { ackAtrasado: true } }], CANO).fluxos[0]!;
    expect(com.acks).toBeLessThan(0.7 * sem.acks);
    expect(com.concluiu).toBe(true);
  });
});

describe('retransmissão e temporizadores', () => {
  it('segmento único perdido: só o tempo esgotado salva, e o RTO dobra', () => {
    const r = simularTcp([{ bytes: 1000, perdas: [0] }], CANO);
    const f = r.fluxos[0]!;
    expect(f.timeouts).toBe(1);
    expect(f.retransRapidas).toBe(0);
    expect(f.retransmissoes).toBe(1);
    expect(f.concluiu).toBe(true);
    // RTO inicial pelo RTT do aperto de mão: 40 ms vira 200 ms (piso); o ACK só chega depois dele.
    expect(f.fim!).toBeGreaterThan(0.2);
    // Karn: a amostra do segmento retransmitido não entra no estimador.
    expect(f.karnDescartadas).toBe(1);
  });

  it('perda no meio de uma rajada: 3 ACKs duplicados e retransmissão rápida, sem esperar o tempo', () => {
    const r = simularTcp([{ bytes: 100 * 1460, config: { janelaInicial: 10 }, perdas: [5] }], CANO);
    const f = r.fluxos[0]!;
    expect(f.retransRapidas).toBe(1);
    expect(f.timeouts).toBe(0);
    expect(f.ackDuplicados).toBeGreaterThanOrEqual(3);
    expect(r.eventos.find((e) => e.tipo === 'retransmissao-rapida')!.texto).toMatch(/3 ACKs duplicados pedindo 7300/);
    expect(f.concluiu).toBe(true);
  });

  it('RTO pelos valores de Jacobson e Karels', () => {
    const p = calcularRto([0.1, 0.12, 0.08], 0);
    expect(p[0]).toMatchObject({ srtt: 0.1, rttvar: 0.05 });
    expect(p[0]!.rto).toBeCloseTo(0.3, 9);
    expect(p[1]!.rttvar).toBeCloseTo(0.75 * 0.05 + 0.25 * 0.02, 9);
    expect(p[1]!.srtt).toBeCloseTo(0.875 * 0.1 + 0.125 * 0.12, 9);
    expect(p[1]!.rto).toBeCloseTo(p[1]!.srtt + 4 * p[1]!.rttvar, 9);
    expect(amostrarRtt({ rto: 1 }, 0.01).rto).toBe(0.2);
  });
});

describe('controle de congestionamento', () => {
  it('partida lenta dobra a cada RTT; depois do limiar, AIMD sobe 1 segmento por RTT', () => {
    const r = simularTcp([{ bytes: 3e6, config: { janela: 1 << 22, escala: 7 } }], { ...CANO, buffer: 1000 });
    const f = r.fluxos[0]!;
    const serie = [0, 1, 2, 3, 4, 5].map((k) => janelaEm(f, k * RTT + RTT / 2));
    expect(serie).toEqual([1, 2, 4, 8, 16, 32]);
    const ca = simularTcp([{ bytes: 3e6, config: { janela: 1 << 22, escala: 7, limiar: 8 * 1460 } }], { ...CANO, buffer: 1000 });
    const g = ca.fluxos[0]!;
    expect(ca.eventos.some((e) => e.tipo === 'fim-partida-lenta')).toBe(true);
    const t9 = g.janela.find((p) => p.cwnd >= 9)!.t;
    const passos = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => janelaEm(g, t9 + k * RTT) - janelaEm(g, t9 + (k - 1) * RTT));
    for (const d of passos) expect(d).toBeLessThanOrEqual(2);
    const subida = janelaEm(g, t9 + 10 * RTT) - janelaEm(g, t9);
    expect(subida).toBeGreaterThanOrEqual(8);
    expect(subida).toBeLessThanOrEqual(11);
  });

  it('perda por congestionamento corta pela metade (Reno) e entra em recuperação rápida', () => {
    const r = simularTcp([{ bytes: 8e6, config: { janela: 1 << 22, escala: 7 } }], CANO);
    expect(r.perdasFila).toBeGreaterThan(0);
    expect(r.eventos.some((e) => e.tipo === 'retransmissao-rapida')).toBe(true);
    expect(r.eventos.some((e) => e.tipo === 'recuperacao-fim')).toBe(true);
    expect(r.fluxos[0]!.vazaoMbps).toBeGreaterThan(8);
  });

  it('dois fluxos no mesmo gargalo convergem para metade cada', () => {
    const cfg = { janela: 1 << 22, escala: 7 };
    const r = simularTcp([{ bytes: Infinity, config: cfg }, { bytes: Infinity, inicio: 5, config: cfg }], { banda: 5e6, atraso: 0.02, buffer: 30 }, { duracao: 60 });
    const partes = r.fluxos.map((f) => entreguesEntre(f, 30, 60));
    const total = partes[0]! + partes[1]!;
    for (const p of partes) {
      expect(p / total).toBeGreaterThan(0.35);
      expect(p / total).toBeLessThan(0.65);
    }
    expect(indiceJain(partes)).toBeGreaterThan(0.95);
    expect((total * 8) / 30).toBeGreaterThan(0.8 * 5e6);
  });

  it('perda no meio sem fio derruba a vazão do TCP, perto da fórmula MSS ÷ (RTT √p)', () => {
    const cfg = { janela: 1 << 22, escala: 7 };
    const limpo = simularTcp([{ bytes: Infinity, config: cfg }], CANO, { duracao: 30 }).fluxos[0]!;
    const ruidoso = simularTcp([{ bytes: Infinity, config: cfg }], { ...CANO, perda: 0.02 }, { duracao: 30 });
    expect(ruidoso.perdasAleatorias).toBeGreaterThan(0);
    expect(ruidoso.fluxos[0]!.vazaoMbps).toBeLessThan(0.4 * limpo.vazaoMbps);
    const formula = vazaoComPerda(1460, RTT, 0.02) / 1e6;
    expect(ruidoso.fluxos[0]!.vazaoMbps).toBeGreaterThan(0.4 * formula);
    expect(ruidoso.fluxos[0]!.vazaoMbps).toBeLessThan(1.6 * formula);
  });

  it('CUBIC também converge e chega perto da banda', () => {
    const r = simularTcp([{ bytes: Infinity, config: { algoritmo: 'cubic', janela: 1 << 22, escala: 7 } }], CANO, { duracao: 20 });
    expect(r.fluxos[0]!.vazaoMbps).toBeGreaterThan(8);
    expect(r.eventos.some((e) => e.tipo === 'retransmissao-rapida')).toBe(true);
  });

  it('BBR com buffer grande: mesma vazão que o Reno, fila muito menor; e aguenta perda aleatória', () => {
    const cfg = { janela: 1 << 22, escala: 7 };
    const grande = { ...CANO, buffer: 1000 };
    const reno = simularTcp([{ bytes: Infinity, config: cfg }], grande, { duracao: 20 });
    const bbr = simularTcp([{ bytes: Infinity, config: { ...cfg, algoritmo: 'bbr' } }], grande, { duracao: 20 });
    expect(bbr.filaMedia).toBeLessThan(reno.filaMedia / 10);
    expect(bbr.atrasoFilaMedio).toBeLessThan(reno.atrasoFilaMedio / 10);
    expect(bbr.fluxos[0]!.vazaoMbps).toBeGreaterThan(0.85 * 10);
    expect(bbr.fluxos[0]!.estimativaBbr!.banda).toBeGreaterThan(0.9e7);
    expect(bbr.fluxos[0]!.estimativaBbr!.rttMin).toBeLessThan(RTT * 1.1);
    const comPerda = { ...CANO, perda: 0.01 };
    const renoP = simularTcp([{ bytes: Infinity, config: cfg }], comPerda, { duracao: 20 });
    const bbrP = simularTcp([{ bytes: Infinity, config: { ...cfg, algoritmo: 'bbr' } }], comPerda, { duracao: 20 });
    expect(bbrP.fluxos[0]!.vazaoMbps).toBeGreaterThan(2 * renoP.fluxos[0]!.vazaoMbps);
  });
});

describe('QUIC', () => {
  it('1 RTT para abrir, 0 na retomada, contra 3 do TCP com TLS 1.3', () => {
    const r = estabelecimento(0.05);
    expect(r.tcpTls13).toBeCloseTo(0.15, 9);
    expect(r.quic).toBeCloseTo(0.1, 9);
    expect(r.quic0rtt).toBeCloseTo(0.05, 9);
  });

  it('sem bloqueio de cabeça de fila: perda num fluxo não trava os outros', () => {
    const r = compararCabecaDeFila({ objetos: 4, bytesPorObjeto: 3 * 1460, gargalo: { banda: 50e6, atraso: 0.03, buffer: 200 }, perdas: [1], config: { janelaInicial: 16 } });
    // A transmissão 1 é do objeto 2: no TCP ele segura todos os outros, no QUIC só ele espera a retransmissão.
    expect(r.travadosNoTcp).toBe(3);
    expect(r.quic[0]).toBeLessThan(r.tcp[1]!);
    expect(r.quic[2]).toBeLessThan(r.tcp[2]! - 0.02);
    expect(r.quic[1]).toBeCloseTo(r.tcp[1]!, 6);
    expect(r.esperaTcp).toBeGreaterThan(2 * r.esperaQuic);
    const sem = compararCabecaDeFila({ objetos: 4, bytesPorObjeto: 3 * 1460, gargalo: { banda: 50e6, atraso: 0.03, buffer: 200 }, perdas: [] });
    expect(sem.travadosNoTcp).toBe(0);
  });

  it('migração: o QUIC segue pelo identificador de conexão; o TCP recomeça do zero', () => {
    const r = simularMigracao({ rtt: 0.05, gargalo: { banda: 20e6, atraso: 0.025, buffer: 100 }, bytesRestantes: 1e6, ipAntigo: '192.0.2.10', ipNovo: '198.51.100.77' });
    expect(r.paradoQuic).toBeCloseTo(0.05, 9);
    expect(r.paradoTcp).toBeCloseTo(0.2, 9);
    expect(r.restoTcp).toBeGreaterThan(r.restoQuic);
    expect(r.linhas.join('\n')).toMatch(/PATH_CHALLENGE/);
  });
});

describe('desempenho', () => {
  it('produto banda × atraso, escala, PAWS e vazão com perda', () => {
    expect(bdpBytes(1e9, 0.05)).toBe(6.25e6);
    expect(escalaNecessaria(65535)).toBe(0);
    expect(escalaNecessaria(6.25e6)).toBe(7);
    expect(tempoVoltaSeq(10e9)).toBeCloseTo(3.436, 2);
    expect(vazaoComPerda(1460, 0.1, 0.01)).toBeCloseTo(((1460 * 8) / 0.1) * (Math.sqrt(1.5) / 0.1), 3);
    expect(lerBytes('64k')).toBe(64000);
    expect(lerBytes('1MiB')).toBe(1048576);
  });
});

/* ---------- No mundo ---------- */

/**
 * Dois PCs (a e a2) atrás do r1, que faz NAT para fora; r1 e r2 ligados por um enlace de 10 Mb/s (o gargalo);
 * b é o servidor atrás do r2. Endereços de documentação e privados.
 */
function mundoTransporte(): Mundo {
  const m = novoMundo(5);
  adicionar(m, pc('a', { ip: lerCidr('192.168.1.10/24')!, gateway: '192.168.1.1' }));
  adicionar(m, pc('a2', { ip: lerCidr('192.168.1.11/24')!, gateway: '192.168.1.1' }));
  adicionar(m, pc('b', { ip: lerCidr('203.0.113.10/24')!, gateway: '203.0.113.1' }));
  const r1 = adicionar(m, roteador('r1', { interfaces: { p1: '192.168.1.1/24', p2: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('r2', { interfaces: { p1: '198.51.100.2/30', p2: '203.0.113.1/24' } }));
  adicionar(m, comutador('sw', { portas: 4 }));
  configurarNat(r1, ['p1'], 'p2');
  r1.portas.find((p) => p.nome === 'p2')!.velocidades = [10];
  ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'sw', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'a2', porta: 'eth0' }, { equip: 'sw', porta: 'p2' }, 'cat6', 5);
  ligar(m, { equip: 'sw', porta: 'p3' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r2', porta: 'p1' }, 'cat6', 90);
  ligar(m, { equip: 'r2', porta: 'p2' }, { equip: 'b', porta: 'eth0' }, 'cat6', 5);
  return m;
}

function rodar(t: Terminal, nome: string, cmds: string[]): string {
  t.executar(`console ${nome}`);
  const s = cmds.map((c) => t.executar(c).join('\n')).join('\n');
  t.executar('sair');
  return s;
}

describe('no mundo: soquetes, NAT de porta e transferência', () => {
  it('sem nada configurado, nada aparece: nem ajuda, nem ações', () => {
    const m = mundoTransporte();
    expect(temTransporte(m)).toBe(false);
    expect(acoesEquip(m, m.equipamentos.get('a')!).some((a) => a.id.startsWith('tr-'))).toBe(false);
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'a', ['?'])).not.toMatch(/camada de transporte/);
  });

  it('RST quando ninguém escuta; com o serviço escutando, abre pela quádrupla traduzida pelo NAT', () => {
    const m = mundoTransporte();
    const t = new Terminal(m, {} as Dia);
    const recusa = rodar(t, 'a', ['conectar 203.0.113.10 80']);
    expect(recusa).toMatch(/RST/);
    expect(m.flags.conexao).toMatchObject({ resultado: 'recusada', estadosCliente: ['CLOSED', 'SYN_SENT', 'CLOSED'] });
    expect(rodar(t, 'b', ['escutar tcp 80'])).toMatch(/listen\(3, fila de 128\): CLOSED → LISTEN/);
    const s = rodar(t, 'a', ['conectar 203.0.113.10 80', 'soquetes']);
    expect(s).toMatch(/accept\(3\) devolve o descritor novo/);
    expect(m.flags.conexao).toMatchObject({ resultado: 'aberta', ipVisto: '198.51.100.1', nat: true, estadosServidor: ['CLOSED', 'LISTEN', 'SYN_RCVD', 'ESTABLISHED'] });
    // Do lado do servidor, o soquete conectado mostra o endereço do NAT, não o do PC.
    const b = m.equipamentos.get('b')!;
    expect(soquetesDe(b).find((x) => x.estado === 'ESTABLISHED')).toMatchObject({ ipRemoto: '198.51.100.1', portaLocal: 80 });
    const f = rodar(t, 'a', ['fechar', 'soquetes']);
    expect(f).toMatch(/FIN_WAIT_2 → TIME_WAIT/);
    expect(m.flags.conexao.fechamento.estadosCliente).toEqual(['ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSED']);
    expect(soquetesDe(m.equipamentos.get('a')!).some((x) => x.estado === 'TIME_WAIT')).toBe(true);
  });

  it('demultiplexação por porta e pela quádrupla; o NAT troca a porta quando duas máquinas usam a mesma', () => {
    const m = mundoTransporte();
    m.flags.transporte = true;
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'b', ['escutar tcp 80', 'escutar tcp 443', 'escutar udp 53']);
    rodar(t, 'a', ['conectar 203.0.113.10 80']);
    rodar(t, 'a2', ['conectar 203.0.113.10 80']);
    const tab = nat(m.equipamentos.get('r1')!)!.tabela.filter((x) => x.protocolo === 'tcp');
    expect(tab.map((x) => x.portaInterna)).toEqual([49152, 49152]);
    expect(tab[0]!.portaExterna).not.toBe(tab[1]!.portaExterna);
    const b = m.equipamentos.get('b')!;
    const est = soquetesDe(b).filter((x) => x.estado === 'ESTABLISHED');
    expect(est).toHaveLength(2);
    // Mesma porta local 80, quádruplas diferentes: cada segmento vai para o soquete certo.
    const d1 = demultiplexar(b, 'tcp', '203.0.113.10', 80, '198.51.100.1', est[0]!.portaRemota!);
    const d2 = demultiplexar(b, 'tcp', '203.0.113.10', 80, '198.51.100.1', est[1]!.portaRemota!);
    expect(d1.como).toBe('quadrupla');
    expect(d1.soquete!.fd).not.toBe(d2.soquete!.fd);
    expect(demultiplexar(b, 'tcp', '203.0.113.10', 443, '198.51.100.1', 40000).soquete!.servico).toBe('https');
    expect(demultiplexar(b, 'udp', '203.0.113.10', 53, '198.51.100.1', 40000).soquete!.servico).toBe('dns');
    expect(demultiplexar(b, 'udp', '203.0.113.10', 80, '198.51.100.1', 40000).como).toBe('nenhum');
    expect(escutar(m, b, 'tcp', 80).linhas.join(' ')).toMatch(/já em uso/);
  });

  it('transferir: conecta, manda e fecha pelo caminho real, e o resultado fica preso à configuração', () => {
    const m = mundoTransporte();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'b', ['escutar tcp 80']);
    const s = rodar(t, 'a', ['tcp atraso 20', 'tcp iw 1', 'transferir 203.0.113.10 80 500k']);
    expect(s).toMatch(/JANELA DE CONGESTIONAMENTO/);
    expect(s).toMatch(/gargalo de 10 Mb\/s/);
    expect(TRAVESSAO.test(s)).toBe(false);
    const f = m.flags.tcp;
    expect(f).toMatchObject({ ok: true, bytes: 500000, algoritmo: 'reno', bandaMbps: 10, ipVisto: '198.51.100.1', concluiu: true });
    expect(f.rttMs).toBeGreaterThan(40);
    expect(f.serie.length).toBeGreaterThan(100);
    expect(f.config.janelaInicial).toBe(1);
    expect(tcpConfere(m)).toBe(true);
    rodar(t, 'a', ['tcp algoritmo cubic']);
    expect(tcpConfere(m)).toBe(false);
    expect(soquetesDe(m.equipamentos.get('a')!).every((x) => x.estado === 'TIME_WAIT')).toBe(true);
  });

  it('UDP, RPC, QUIC, justiça, velocidade e comparação pelo console gravam em m.flags', () => {
    const m = mundoTransporte();
    const t = new Terminal(m, {} as Dia);
    rodar(t, 'b', ['escutar tcp 80', 'escutar udp 443', 'escutar udp 5000']);
    const s = rodar(t, 'a', [
      'tcp atraso 15',
      'tcp perda 5%',
      'udp enviar 203.0.113.10 5000 400 100',
      'udp enviar 203.0.113.10 9999 5',
      'rpc 203.0.113.10 5000 200 3 perder=resposta',
      'rtp 203.0.113.10 5000 200 60 10',
      'tcp perda off',
      'quic conectar 203.0.113.10',
      'quic fluxos 203.0.113.10 443 4 4',
      'quic migrar 203.0.113.10 443 198.51.100.77',
      'fluxos 2 203.0.113.10 80 reno 20',
      'velocidade 203.0.113.10 4',
      'tcp buffer 1000',
      'tcp comparar 203.0.113.10 80 10',
      'tcp desempenho 203.0.113.10',
      'tcp rto 100 120 80',
      'tcp nagle',
      'tcp janela-boba',
      'tcp cabecalho',
      'tcp estados',
    ]);
    expect(TRAVESSAO.test(s)).toBe(false);
    expect(s).not.toMatch(/desconhecido/);
    expect(m.flags.udp).toMatchObject({ escuta: false, recebidos: 0, porta: 9999 });
    expect(s).toMatch(/400 datagrama\(s\) mandados/);
    expect(m.flags.rpc).toMatchObject({ execucoes: 2, ok: true });
    expect(m.flags.rtp.pacotes).toBe(200);
    expect(m.flags.quic.conexao).toMatchObject({ ok: true });
    expect(m.flags.quic.conexao.quicMs).toBeLessThan(m.flags.quic.conexao.tcpTls13Ms);
    expect(m.flags.quic.cabecaDeFila.travadosNoTcp).toBeGreaterThanOrEqual(1);
    expect(m.flags.quic.migracao.paradoQuicMs).toBeLessThan(m.flags.quic.migracao.paradoTcpMs);
    expect(m.flags.justica.n).toBe(2);
    expect(m.flags.justica.jain).toBeGreaterThan(0.9);
    expect(m.flags.velocidade.mbps).toBeGreaterThan(8);
    expect(m.flags.comparacao.buffer).toBe(1000);
    expect(m.flags.comparacao.resultados.bbr.filaMedia).toBeLessThan(m.flags.comparacao.resultados.reno.filaMedia);
    expect(m.flags.desempenho.bdpBytes).toBeGreaterThan(30000);
    expect(m.flags.rto.passos[0]).toMatchObject({ srttMs: 100, rttvarMs: 50, rtoMs: 300 });
    expect(m.flags.nagle.com.segmentos).toBeLessThan(m.flags.nagle.sem.segmentos);
    expect(m.flags.janelaBoba.com.bytesPorSegmento).toBeGreaterThan(m.flags.janelaBoba.sem.bytesPorSegmento);
    expect(m.flags.soquetes.primitivas.length).toBeGreaterThan(5);
  });

  it('com m.flags.transporte, as ações aparecem no menu e todas rodam com os valores padrão', () => {
    const m = mundoTransporte();
    m.flags.transporte = true;
    const ids = acoesEquip(m, m.equipamentos.get('a')!).map((a) => a.id);
    for (const id of ['tr-soquetes', 'tr-escutar', 'tr-conectar', 'tr-enviar', 'tr-transferir', 'tr-algoritmo', 'tr-janela', 'tr-udp', 'tr-rpc', 'tr-rtp', 'tr-quic-conectar', 'tr-quic-fluxos', 'tr-quic-migrar', 'tr-fluxos', 'tr-velocidade', 'tr-comparar', 'tr-desempenho', 'tr-rto', 'tr-estados']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of acoesEquip(m, m.equipamentos.get('a')!)) {
      if (!a.id.startsWith('tr-')) continue;
      const m2 = mundoTransporte();
      m2.flags.transporte = true;
      const t = new Terminal(m2, {} as Dia);
      rodar(t, 'b', ['escutar tcp 80', 'escutar udp 443', 'escutar udp 53', 'escutar udp 5000', 'escutar udp 5004']);
      const saida = executarAcao(t, a, padroes(a)).flatMap((x) => x.saida).join('\n');
      expect(saida, a.id).not.toMatch(/desconhecido|não entendi/i);
      expect(TRAVESSAO.test(saida), a.id).toBe(false);
    }
    const t = new Terminal(m, {} as Dia);
    expect(rodar(t, 'a', ['?'])).toMatch(/camada de transporte/);
  });
});
