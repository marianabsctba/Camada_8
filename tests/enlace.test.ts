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
