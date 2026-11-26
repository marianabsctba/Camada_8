import { describe, expect, it } from 'vitest';
import { simularArq, janelaIdeal, utilizacaoPareEspere } from '../src/motor/arq';
import { bitsVerificacao, crc32, encherBits, escaparBytes, hammingCodificar, hammingDecodificar, restoCrc, transmitir, type ConfigEnlace } from '../src/motor/enlace';

const cfg = (x: Partial<ConfigEnlace>): ConfigEnlace => ({ enquadramento: 'flags', enchimento: true, deteccao: 'nenhuma', correcao: 'nenhuma', ...x });
const cargas = Array.from({ length: 6 }, (_, i) => Array.from({ length: 20 }, (_, j) => (i * 31 + j * 7) & 0xff));

describe('enquadramento e códigos', () => {
  it('CRC-32 bate com o valor de referência', () => {
    expect(crc32([...'123456789'].map((c) => c.charCodeAt(0)))).toBe(0xcbf43926);
  });
  it('resto de polinômio à mão', () => {
    expect(restoCrc('101100', '1101')).toBe('111');
  });
  it('Hamming corrige um bit em qualquer posição', () => {
    for (let pos = 0; pos < 7; pos++) {
      const c = hammingCodificar([1, 0, 1, 1]);
      c[pos]! ^= 1;
      const d = hammingDecodificar(c);
      expect(d.dados).toEqual([1, 0, 1, 1]);
      expect(d.corrigido).toBe(pos + 1);
    }
    expect(bitsVerificacao(7)).toBe(4);
  });
  it('escape e enchimento', () => {
    expect(escaparBytes([0x41, 0x7e, 0x42, 0x7d])).toEqual([0x41, 0x7d, 0x5e, 0x42, 0x7d, 0x5d]);
    expect(encherBits('01111110')).toBe('011111010');
  });
  it('linha limpa entrega tudo em todos os enquadramentos', () => {
    for (const enq of ['contagem', 'flags', 'bits'] as const) {
      const r = transmitir(cargas, cfg({ enquadramento: enq }));
      expect(r.corretos, enq).toBe(6);
    }
  });
  it('erro na contagem desalinha tudo o que vem depois; com flags só um quadro sofre', () => {
    const erro = [{ quadro: 2, bits: [11], noCabecalho: true }];
    const a = transmitir(cargas, cfg({ enquadramento: 'contagem', deteccao: 'crc32' }), erro);
    expect(a.corretos).toBeLessThanOrEqual(2);
    const b = transmitir(cargas, cfg({ enquadramento: 'flags', deteccao: 'crc32' }), [{ quadro: 2, bits: [11] }]);
    expect(b.corretos).toBe(5);
    expect(b.descartados).toBe(1);
  });
  it('flag no meio do dado sem escape quebra o quadro', () => {
    const c = [[0x41, 0x7e, 0x42, 0x43]];
    expect(transmitir(c, cfg({ enchimento: false })).corretos).toBe(0);
    expect(transmitir(c, cfg({ enchimento: true })).corretos).toBe(1);
  });
  it('seis uns sem enchimento viram flag falsa', () => {
    const c = [[0x41, 0x7e, 0x42]];
    expect(transmitir(c, cfg({ enquadramento: 'bits', enchimento: false })).corretos).toBe(0);
    expect(transmitir(c, cfg({ enquadramento: 'bits', enchimento: true })).corretos).toBe(1);
  });
  it('paridade não vê dois bits trocados; CRC vê', () => {
    const erro = [{ quadro: 1, bits: [3, 4] }];
    expect(transmitir(cargas, cfg({ deteccao: 'paridade' }), erro).corrompidos).toBe(1);
    expect(transmitir(cargas, cfg({ deteccao: 'crc32' }), erro).corrompidos).toBe(0);
  });
  it('Hamming corrige um bit por palavra sem retransmitir', () => {
    const erro = [0, 1, 2, 3, 4, 5].map((q) => ({ quadro: q, bits: [5, 30] }));
    const r = transmitir(cargas, cfg({ enquadramento: 'contagem', correcao: 'hamming', deteccao: 'crc32' }), erro);
    expect(r.corretos).toBe(6);
    expect(r.corrigidos).toBe(12);
  });
});

describe('ARQ', () => {
  const sat = { taxaBps: 1e6, propagacaoMs: 270, bytesQuadro: 1000 };
  it('pare e espere no satélite aproveita pouco mais de 1 %', () => {
    expect(utilizacaoPareEspere(sat)).toBeCloseTo(8 / 548, 3);
    const r = simularArq({ protocolo: 'pare-e-espere', janela: 1, bitsSeq: 1, timeoutMs: 700 }, sat, 10);
    expect(r.concluiu).toBe(true);
    expect(r.utilizacao).toBeLessThan(0.02);
  });
  it('timeout menor que a ida e volta retransmite à toa', () => {
    const r = simularArq({ protocolo: 'pare-e-espere', janela: 1, bitsSeq: 1, timeoutMs: 300 }, sat, 5);
    expect(r.desnecessarias).toBeGreaterThan(0);
    expect(r.entreguesErrados).toBe(0);
  });
  it('sem número de sequência, ACK perdido vira duplicata', () => {
    const l = { ...sat, perdasAck: [1] };
    expect(simularArq({ protocolo: 'pare-e-espere', janela: 1, bitsSeq: 0, timeoutMs: 700 }, l, 5).entreguesErrados).toBeGreaterThan(0);
    expect(simularArq({ protocolo: 'pare-e-espere', janela: 1, bitsSeq: 1, timeoutMs: 700 }, l, 5).entreguesErrados).toBe(0);
  });
  it('janela do tamanho do cano chega perto de 100 %', () => {
    const W = janelaIdeal(sat);
    const r = simularArq({ protocolo: 'go-back-n', janela: W, bitsSeq: 7, timeoutMs: 700 }, sat, 300);
    expect(r.utilizacao).toBeGreaterThan(0.75);
  });
  it('go-back-N com janela 2^n aceita quadro velho quando todos os ACKs se perdem', () => {
    const l = { ...sat, propagacaoMs: 20, perdasAck: [0, 1, 2, 3, 4, 5, 6, 7] };
    const ruim = simularArq({ protocolo: 'go-back-n', janela: 8, bitsSeq: 3, timeoutMs: 100 }, l, 20);
    expect(ruim.entreguesErrados).toBeGreaterThan(0);
    const bom = simularArq({ protocolo: 'go-back-n', janela: 7, bitsSeq: 3, timeoutMs: 100 }, l, 20);
    expect(bom.entreguesErrados).toBe(0);
    expect(bom.concluiu).toBe(true);
  });
  it('seletiva com janela maior que metade da numeração erra; com metade, não', () => {
    const l = { ...sat, propagacaoMs: 20, perdasAck: [0, 1, 2, 3, 4] };
    expect(simularArq({ protocolo: 'seletiva', janela: 5, bitsSeq: 3, timeoutMs: 100 }, l, 20).entreguesErrados).toBeGreaterThan(0);
    const ok = simularArq({ protocolo: 'seletiva', janela: 4, bitsSeq: 3, timeoutMs: 100 }, { ...l, perdasAck: [0, 1, 2, 3] }, 20);
    expect(ok.entreguesErrados).toBe(0);
    expect(ok.concluiu).toBe(true);
  });
});

describe('camada física: acesso celular', () => {
  it('o ping pelo celular tem o atraso de cada geração, não só a propagação', async () => {
    const { adicionar, aparelho, comutador, ligar, novoMundo, pc } = await import('../src/motor/mundo');
    const { ping } = await import('../src/motor/rede');
    const { lerCidr, lerIp } = await import('../src/motor/util');
    const rtt = (celular?: '3g' | '4g' | '5g' | '5g-urllc') => {
      const m = novoMundo(1);
      const radio = (nome: string, ganho: number) => {
        const e = aparelho(nome, 'radio', nome, [{ nome: 'ar', fisica: 'antena' }, { nome: 'lan' }], { rumo: 0, alturaMax: 30 });
        e.antena = { ganho, azimute: 0, azimuteCerto: 0, altura: 30, feixe: 360 };
        return e;
      };
      adicionar(m, pc('a', { ip: lerCidr('192.0.2.10/24')! }));
      adicionar(m, radio('cel', 2));
      adicionar(m, radio('erb', 17));
      adicionar(m, comutador('nucleo'));
      adicionar(m, pc('b', { ip: lerCidr('192.0.2.1/24')! }));
      ligar(m, { equip: 'a', porta: 'eth0' }, { equip: 'cel', porta: 'lan' }, 'cat6', 1);
      ligar(m, { equip: 'cel', porta: 'ar' }, { equip: 'erb', porta: 'ar' }, 'radio', 2000, { radio: { distanciaKm: 2, freqGHz: 0.7, obstaculoM: 0, ptxDbm: 20, celular } });
      ligar(m, { equip: 'erb', porta: 'lan' }, { equip: 'nucleo', porta: 'p1' }, 'cat6', 80);
      ligar(m, { equip: 'nucleo', porta: 'p2' }, { equip: 'b', porta: 'eth0' }, 'cat6', 3);
      const r = ping(m, 'a', lerIp('192.0.2.1')!, 4);
      expect(r.recebidos).toBe(4);
      return r.rtts.reduce((s, x) => s + x, 0) / r.rtts.length;
    };
    expect(rtt()).toBeLessThan(3);
    expect(rtt('3g')).toBeGreaterThan(90);
    expect(rtt('3g')).toBeLessThan(110);
    expect(rtt('4g')).toBeGreaterThan(30);
    expect(rtt('4g')).toBeLessThan(50);
    expect(rtt('5g')).toBeGreaterThan(10);
    expect(rtt('5g')).toBeLessThan(20);
    // URLLC: 1 ms por sentido no rádio (ITU-R M.2410), uns 2 ms de ida e volta com o cabo.
    expect(rtt('5g-urllc')).toBeLessThan(3);
  });
});
