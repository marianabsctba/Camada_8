// Criptografia didática do ato 7: as contas têm de bater, inclusive com os vetores oficiais.
import { describe, expect, it } from 'vitest';
import {
  AES_SBOX, SHA256_H0, SHA256_K, aesCifrar, aesDecifrar, aesRodada, ataqueReflexao, assinarMensagem,
  blocosRepetidos, buscarColisao, cesar, chaveUnica, cifraAes, cifraFeistel, cifrarCbc, cifrarEcb,
  cifrarRsa, contarFrequencias, ctr, deHex, decifrarCbc, decifrarCesar, decifrarEcb, decifrarRsa,
  desafioResposta, desfazerSubstituicao, desfazerTransposicao, diffieHellman, emitirCertificado,
  expModular, feistelCifrar, feistelDecifrar, gerarChavesRsa, hmacSha256, homemNoMeio, inversoModular,
  mixColumns, paraHex, probabilidadeAniversario, quebrarCesar, resumoBrinquedo, reusoDaChaveUnica,
  sha256, shiftRows, simularKerberos, substituicao, textoParaBytes, transposicao, verificarAssinatura,
  verificarAtualidade, verificarCadeia, verificarHmac, verificarRedundancia, adicionarRedundancia,
  bytesParaTexto, assinarRsa, verificarRsa, type Certificado, type DadosCertificado, type OpcoesCadeia,
} from '../src/motor/cripto';

const TEXTO_LONGO =
  'A criptografia protege a informação mesmo quando o atacante consegue ler tudo o que passa pela rede. ' +
  'Por isso os administradores de rede precisam entender como as cifras funcionam, onde elas falham e ' +
  'por que uma senha fraca ou uma chave reutilizada coloca todo o sistema em risco. O segredo deve estar ' +
  'na chave e nunca no algoritmo, que pode e deve ser publicado para que todos possam analisar.';

describe('cifras clássicas', () => {
  it('César vai e volta', () => {
    const c = cesar('Ataque ao amanhecer!', 3);
    expect(c.resultado).toBe('DWDTXH DR DPDQKHFHU!');
    expect(decifrarCesar(c.resultado, 3).resultado).toBe('ATAQUE AO AMANHECER!');
    expect(c.passos.length).toBeGreaterThan(0);
  });

  it('substituição monoalfabética vai e volta', () => {
    const tabela = 'QWERTYUIOPASDFGHJKLZXCVBNM';
    const c = substituicao('Rede segura', tabela);
    expect(desfazerSubstituicao(c.resultado, tabela).resultado).toBe('REDE SEGURA');
    expect(() => substituicao('x', 'ABC')).toThrow();
  });

  it('análise de frequência acerta a chave de um César longo', () => {
    for (const k of [3, 7, 13, 21]) {
      const cifrado = cesar(TEXTO_LONGO, k).resultado;
      const palpite = quebrarCesar(cifrado);
      expect(palpite.chave).toBe(k);
      expect(palpite.texto.startsWith('A CRIPTOGRAFIA')).toBe(true);
    }
    const f = contarFrequencias(TEXTO_LONGO);
    expect(['A', 'E', 'O']).toContain(f.ordem[0]);
  });

  it('transposição por colunas vai e volta, inclusive com a última linha incompleta', () => {
    const t = transposicao('ATAQUE AO AMANHECER', 'CHAVE');
    expect(t.resultado).not.toBe('ATAQUEAOAMANHECER');
    expect([...t.resultado].sort().join('')).toBe([...'ATAQUEAOAMANHECER'].sort().join(''));
    expect(desfazerTransposicao(t.resultado, 'CHAVE').resultado).toBe('ATAQUEAOAMANHECER');
    // exemplo clássico com a chave MEGABUCK
    const m = 'PLEASETRANSFERONEMILLIONDOLLARSTOMYSWISSBANKACCOUNTSIXTWOTWO';
    expect(desfazerTransposicao(transposicao(m, 'MEGABUCK').resultado, 'MEGABUCK').resultado).toBe(m);
  });

  it('chave única: XOR duas vezes devolve o texto, e reusar a chave vaza o XOR dos textos', () => {
    const chave = Array.from({ length: 32 }, (_, i) => (i * 73 + 41) & 0xff);
    const c = chaveUnica('pagar 100 reais', chave);
    expect(bytesParaTexto(chaveUnica(c.resultado, chave).resultado)).toBe('pagar 100 reais');
    const r = reusoDaChaveUnica('ataque ao meio-dia', 'retirada as nove!!', chave);
    expect(r.iguais).toBe(true);
    expect(paraHex(r.xorDosCifrados)).toBe(paraHex(r.xorDosClaros));
    expect(r.segundaRecuperada).toBe('retirada as nove!!');
  });
});

describe('princípios', () => {
  it('redundância separa mensagem válida de lixo', () => {
    const p = adicionarRedundancia('transferir 10');
    expect(verificarRedundancia(p.resultado).valida).toBe(true);
    expect(verificarRedundancia(p.resultado.replace('10', '90')).valida).toBe(false);
  });

  it('atualidade recusa repetida, velha e futura', () => {
    let estado = { vistos: [] as number[] };
    const a = verificarAtualidade({ seq: 1, marcaTempo: 1000, conteudo: 'oi' }, estado, 1010);
    expect(a.aceita).toBe(true);
    estado = a.estado;
    expect(verificarAtualidade({ seq: 1, marcaTempo: 1000, conteudo: 'oi' }, estado, 1020).motivo).toBe('repetida');
    expect(verificarAtualidade({ seq: 2, marcaTempo: 100, conteudo: 'oi' }, estado, 1020).motivo).toBe('velha');
    expect(verificarAtualidade({ seq: 3, marcaTempo: 5000, conteudo: 'oi' }, estado, 1020).motivo).toBe('futura');
  });
});

describe('simétrica', () => {
  it('Feistel vai e volta para vários blocos e chaves', () => {
    for (const [bloco, chave] of [[0x12345678, 0xdeadbeef], [0, 0], [0xffffffff, 0x0badf00d], [0xcafe0001, 42]]) {
      const c = feistelCifrar(bloco, chave);
      expect(c.resultado).not.toBe(bloco);
      expect(feistelDecifrar(c.resultado, chave).resultado).toBe(bloco >>> 0);
      expect(c.passos.length).toBe(6);
    }
    // com 8 rodadas também
    expect(feistelDecifrar(feistelCifrar(0xabcdef01, 7, 8).resultado, 7, 8).resultado).toBe(0xabcdef01);
  });

  it('a S-box gerada é a do AES', () => {
    expect(AES_SBOX[0x00]).toBe(0x63);
    expect(AES_SBOX[0x01]).toBe(0x7c);
    expect(AES_SBOX[0x53]).toBe(0xed);
    expect(AES_SBOX[0xff]).toBe(0x16);
    expect(new Set(AES_SBOX).size).toBe(256);
  });

  it('ShiftRows e MixColumns conferem com o exemplo do FIPS-197', () => {
    // coluna de exemplo clássica: db 13 53 45 vira 8e 4d a1 bc
    const s = mixColumns([0xdb, 0x13, 0x53, 0x45, 0xf2, 0x0a, 0x22, 0x5c, 0x01, 0x01, 0x01, 0x01, 0xc6, 0xc6, 0xc6, 0xc6]);
    expect(paraHex(s)).toBe('8e4da1bc9fdc589d01010101c6c6c6c6');
    expect(paraHex(shiftRows(deHex('000102030405060708090a0b0c0d0e0f')))).toBe('00050a0f04090e03080d02070c01060b');
  });

  it('AES-128 bate com os vetores oficiais (FIPS-197, apêndices B e C.1)', () => {
    const b = aesCifrar(deHex('3243f6a8885a308d313198a2e0370734'), deHex('2b7e151628aed2a6abf7158809cf4f3c'));
    expect(b.hex).toBe('3925841d02dc09fbdc118597196a0b32');
    // estado depois do SubBytes da rodada 1 no apêndice B
    expect(b.etapas.find((e) => e.rodada === 1 && e.etapa === 'SubBytes')?.estado).toBe('d42711aee0bf98f1b8b45de51e415230');
    const chave = deHex('000102030405060708090a0b0c0d0e0f');
    const c = aesCifrar(deHex('00112233445566778899aabbccddeeff'), chave);
    expect(c.hex).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
    expect(aesDecifrar(c.resultado, chave).hex).toBe('00112233445566778899aabbccddeeff');
    expect(c.etapas.filter((e) => e.etapa === 'MixColumns').length).toBe(9);
    expect(aesRodada(deHex('00112233445566778899aabbccddeeff'), chave).etapas.map((e) => e.etapa))
      .toEqual(['SubBytes', 'ShiftRows', 'MixColumns', 'AddRoundKey']);
  });

  it('ECB repete blocos iguais e CBC não, e os dois voltam', () => {
    const aes = cifraAes(deHex('2b7e151628aed2a6abf7158809cf4f3c'));
    const dados = 'SENHA=123456789!'.repeat(3);
    const ecb = cifrarEcb(aes, dados);
    expect(blocosRepetidos(ecb.resultado, 16).repetidos).toBe(2);
    expect(ecb.blocos[0]).toBe(ecb.blocos[1]);
    const iv = deHex('000102030405060708090a0b0c0d0e0f');
    const cbc = cifrarCbc(aes, dados, iv);
    expect(blocosRepetidos(cbc.resultado, 16).repetidos).toBe(0);
    expect(bytesParaTexto(decifrarEcb(aes, ecb.resultado).resultado)).toBe(dados);
    expect(bytesParaTexto(decifrarCbc(aes, cbc.resultado, iv).resultado)).toBe(dados);
  });

  it('CBC confere com o vetor do NIST SP 800-38A (F.2.1, primeiro bloco)', () => {
    const aes = cifraAes(deHex('2b7e151628aed2a6abf7158809cf4f3c'));
    const r = cifrarCbc(aes, deHex('6bc1bee22e409f96e93d7e117393172a'), deHex('000102030405060708090a0b0c0d0e0f'));
    expect(r.blocos[0]).toBe('7649abac8119b246cee98e9b12e9197d');
  });

  it('CTR confere com o NIST SP 800-38A (F.5.1) e é a mesma conta nos dois sentidos', () => {
    const aes = cifraAes(deHex('2b7e151628aed2a6abf7158809cf4f3c'));
    const cont = deHex('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff');
    const claro = deHex('6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e51');
    const c = ctr(aes, claro, cont);
    expect(c.hex).toBe('874d6191b620e3261bef6864990db6ce9806f66b7970fdff8617187bb9fffdff');
    expect(paraHex(ctr(aes, c.resultado, cont).resultado)).toBe(paraHex(claro));
  });

  it('os modos funcionam também com a Feistel de brinquedo', () => {
    const f = cifraFeistel(0x1234abcd);
    const dados = 'ABCDABCDABCDxyz';
    expect(blocosRepetidos(cifrarEcb(f, dados).resultado, 4).repetidos).toBe(2);
    const iv = [9, 8, 7, 6];
    const cbc = cifrarCbc(f, dados, iv);
    expect(blocosRepetidos(cbc.resultado, 4).repetidos).toBe(0);
    expect(bytesParaTexto(decifrarCbc(f, cbc.resultado, iv).resultado)).toBe(dados);
    expect(bytesParaTexto(ctr(f, ctr(f, dados, iv).resultado, iv).resultado)).toBe(dados);
  });
});

describe('chave pública', () => {
  it('exponenciação modular e inverso com os passos', () => {
    expect(expModular(4n, 13n, 497n).resultado).toBe(445n);
    expect(inversoModular(17n, 3120n).resultado).toBe(2753n);
    expect(() => inversoModular(6n, 9n)).toThrow();
  });

  it('RSA com p = 61 e q = 53 cifra e decifra 65', () => {
    const k = gerarChavesRsa(61n, 53n);
    expect([k.n, k.phi, k.e, k.d]).toEqual([3233n, 3120n, 17n, 2753n]);
    const c = cifrarRsa(65n, k.publica);
    expect(c.resultado).toBe(2790n);
    expect(decifrarRsa(c.resultado, k.privada).resultado).toBe(65n);
    expect(k.passos.join('\n')).toContain('2753');
  });

  it('RSA cru: assinatura confere e falha com outro número', () => {
    const k = gerarChavesRsa(61n, 53n);
    const s = assinarRsa(65n, k.privada).resultado;
    expect(verificarRsa(65n, s, k.publica).valida).toBe(true);
    expect(verificarRsa(66n, s, k.publica).valida).toBe(false);
  });

  it('e é ajustado quando não é coprimo com φ(n)', () => {
    const k = gerarChavesRsa(101n, 103n); // φ = 10200, que 17 divide
    expect(k.e).toBe(19n);
    expect((k.e * k.d) % k.phi).toBe(1n);
  });

  it('assinatura digital verifica e falha com a mensagem alterada', () => {
    const k = gerarChavesRsa(61n, 53n);
    const s = assinarMensagem('pague 100 a Bob', k.privada);
    expect(verificarAssinatura('pague 100 a Bob', s.assinatura, k.publica).valida).toBe(true);
    expect(verificarAssinatura('pague 900 a Bob', s.assinatura, k.publica).valida).toBe(false);
  });

  it('Diffie-Hellman chega à mesma chave dos dois lados', () => {
    const dh = diffieHellman(23n, 5n, 6n, 15n);
    expect([dh.A, dh.B]).toEqual([8n, 19n]);
    expect(dh.chaveAlice).toBe(2n);
    expect(dh.chaveBob).toBe(dh.chaveAlice);
  });

  it('homem no meio fecha uma chave com cada lado', () => {
    const m = homemNoMeio(23n, 5n, 6n, 15n, 13n);
    expect(m.atacanteComAlice).toBe(m.chaveAlice);
    expect(m.atacanteComBob).toBe(m.chaveBob);
    expect(m.chaveAlice).not.toBe(m.chaveBob);
  });
});

describe('resumos', () => {
  it('SHA-256 bate com os vetores oficiais', () => {
    expect(SHA256_H0[0]).toBe(0x6a09e667);
    expect(SHA256_K[0]).toBe(0x428a2f98);
    expect(SHA256_K[63]).toBe(0xc67178f2);
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    expect(sha256('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
    expect(sha256('ação')).toBe(sha256(textoParaBytes('ação')));
  });

  it('colisão no resumo de brinquedo sai perto de √n tentativas', () => {
    const c = buscarColisao(16);
    expect(c.mensagemA).not.toBe(c.mensagemB);
    expect(resumoBrinquedo(c.mensagemA)).toBe(resumoBrinquedo(c.mensagemB));
    expect(c.tentativas).toBeGreaterThan(c.raizN / 8);
    expect(c.tentativas).toBeLessThan(c.raizN * 4);
    // média de várias buscas fica perto de 1,25 √n
    const media = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].reduce((s, p) => s + buscarColisao(16, p).tentativas, 0) / 8;
    expect(media / 256).toBeGreaterThan(0.6);
    expect(media / 256).toBeLessThan(2.2);
  });

  it('probabilidade do aniversário', () => {
    const p = probabilidadeAniversario(23, 365);
    expect(p.exata).toBeGreaterThan(0.5);
    expect(p.exata).toBeCloseTo(0.5073, 3);
    expect(probabilidadeAniversario(22, 365).exata).toBeLessThan(0.5);
    expect(probabilidadeAniversario(400, 365).exata).toBe(1);
  });

  it('HMAC-SHA256 bate com o RFC 4231', () => {
    expect(hmacSha256(new Array(20).fill(0x0b), 'Hi There'))
      .toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
    expect(hmacSha256('Jefe', 'what do ya want for nothing?'))
      .toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    // caso 6: chave maior que o bloco
    expect(hmacSha256(new Array(131).fill(0xaa), 'Test Using Larger Than Block-Size Key - Hash Key First'))
      .toBe('60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54');
    const mac = hmacSha256('chave', 'mensagem');
    expect(verificarHmac('chave', 'mensagem', mac)).toBe(true);
    expect(verificarHmac('chave', 'mensagen', mac)).toBe(false);
  });
});

describe('certificados', () => {
  const raizK = gerarChavesRsa(61n, 53n);
  const interK = gerarChavesRsa(89n, 97n);
  const folhaK = gerarChavesRsa(101n, 103n);
  const dadosRaiz: DadosCertificado = { serie: 1, sujeito: 'AC Raiz Araucária', emissor: 'AC Raiz Araucária', chavePublica: raizK.publica, validoDe: 0, validoAte: 3650, ehAC: true };
  const dadosInter: DadosCertificado = { serie: 20, sujeito: 'AC Intermediária Pinhão', emissor: 'AC Raiz Araucária', chavePublica: interK.publica, validoDe: 100, validoAte: 2000, ehAC: true };
  const dadosFolha: DadosCertificado = { serie: 300, sujeito: 'loja.camada8.test', emissor: 'AC Intermediária Pinhão', chavePublica: folhaK.publica, validoDe: 500, validoAte: 900, ehAC: false };
  const raiz = emitirCertificado(dadosRaiz, raizK.privada);
  const inter = emitirCertificado(dadosInter, raizK.privada);
  const folha = emitirCertificado(dadosFolha, interK.privada);
  const opcoes: OpcoesCadeia = { nomeEsperado: 'loja.camada8.test', agora: 600, raizesConfiaveis: [raiz] };

  it('cadeia raiz, intermediária e folha é válida', () => {
    const r = verificarCadeia([folha, inter, raiz], opcoes);
    expect(r.valida).toBe(true);
    expect(r.passos.length).toBeGreaterThan(5);
  });

  it('cada motivo de falha aparece', () => {
    const adulterada: Certificado = { ...folha, validoAte: 9000 };
    expect(verificarCadeia([adulterada, inter, raiz], opcoes).motivo).toBe('assinatura');
    expect(verificarCadeia([folha, inter, raiz], { ...opcoes, agora: 1000 }).motivo).toBe('vencido');
    expect(verificarCadeia([folha, inter, raiz], { ...opcoes, nomeEsperado: 'banco.camada8.test' }).motivo).toBe('nome');
    expect(verificarCadeia([folha, inter, raiz], { ...opcoes, raizesConfiaveis: [] }).motivo).toBe('raiz-desconhecida');
    const r = verificarCadeia([folha, inter, raiz], { ...opcoes, revogados: [{ emissor: 'AC Intermediária Pinhão', serie: 300 }] });
    expect(r.motivo).toBe('revogado');
    expect(r.emQual).toBe(0);
    // raiz falsa com o mesmo nome e outra chave: assina tudo certinho, mas não está no repositório
    const falsaK = gerarChavesRsa(107n, 109n);
    const raizFalsa = emitirCertificado({ ...dadosRaiz, chavePublica: falsaK.publica }, falsaK.privada);
    const interFalsa = emitirCertificado(dadosInter, falsaK.privada);
    expect(verificarCadeia([folha, interFalsa, raizFalsa], opcoes).motivo).toBe('raiz-desconhecida');
  });
});

describe('autenticação', () => {
  it('desafio e resposta aceita a chave certa e recusa a errada', () => {
    expect(desafioResposta('segredo', 'segredo', 'N-123').aceito).toBe(true);
    expect(desafioResposta('chute', 'segredo', 'N-123').aceito).toBe(false);
  });

  it('reflexão quebra o desafio ingênuo e não passa no protocolo corrigido', () => {
    expect(ataqueReflexao('segredo').sucesso).toBe(true);
    expect(ataqueReflexao('segredo', true).sucesso).toBe(false);
  });

  it('Kerberos com os passos na ordem', () => {
    const base = { usuario: 'alice', senhaDigitada: 'pinhao123', senhaCadastrada: 'pinhao123', servico: 'impressora', agora: 600 };
    const r = simularKerberos(base);
    expect(r.sucesso).toBe(true);
    expect(r.etapas.map((e) => e.nome)).toEqual(['AS-REQ', 'AS-REP', 'TGS-REQ', 'TGS-REP', 'AP-REQ', 'AP-REP']);
    expect(r.etapas.map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(simularKerberos(base)).toEqual(r);
    const errada = simularKerberos({ ...base, senhaDigitada: 'chute' });
    expect(errada.sucesso).toBe(false);
    expect(errada.etapas.length).toBe(2);
  });
});

describe('textos', () => {
  it('nenhum passo usa travessão', () => {
    const k = gerarChavesRsa(61n, 53n);
    const todos = [
      ...cesar('abc', 1).passos, ...quebrarCesar(cesar(TEXTO_LONGO, 5).resultado).passos, ...transposicao('abcdef', 'cha').passos,
      ...aesCifrar(new Array(16).fill(0), new Array(16).fill(0)).passos, ...k.passos, ...diffieHellman(23n, 5n, 6n, 15n).passos,
      ...homemNoMeio(23n, 5n, 6n, 15n, 13n).passos, ...buscarColisao(12).passos, ...probabilidadeAniversario(23, 365).passos,
      ...ataqueReflexao('k').passos, ...ataqueReflexao('k', true).passos,
      ...simularKerberos({ usuario: 'a', senhaDigitada: 'x', senhaCadastrada: 'x', servico: 's', agora: 1 }).passos,
      ...feistelCifrar(1, 2).passos, ...reusoDaChaveUnica('ab', 'cd', [1, 2]).passos,
    ];
    // os dois travessões (U+2013 e U+2014) montados pelo código, para não aparecerem no arquivo
    const travessoes = new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']');
    for (const p of todos) expect(p).not.toMatch(travessoes);
  });
});
