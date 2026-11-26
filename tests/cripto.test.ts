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
  aesGcmCifrar, aesGcmDecifrar, aesCcmCifrar, aesCcmDecifrar, sha1, hmacSha1, pbkdf2HmacSha1, prf80211, hkdfExtrair,
  hkdfExpandir, x25519, parX25519, geradorDeSemente, ehProvavelPrimo, gerarPrimo, millerRabin, bitsDe, gerarRsaPorSemente,
  assinarPkcs1, verificarPkcs1, assinarPss, verificarPss, cifrarRsaPkcs1, decifrarRsaPkcs1, inteiroParaBytes, mdc,
} from '../src/motor/cripto';
import { chavesFixas, NOMES_CHAVES_FIXAS, sementeDaChave } from '../src/motor/chavesRsa';

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

describe('criptografia de verdade: vetores oficiais', () => {
  const h = deHex;
  // A WebCrypto do próprio Node serve de segunda opinião, independente do motor.
  const sutil = globalThis.crypto.subtle;
  const u8 = (b: number[]) => new Uint8Array(b);
  const b64url = (b: number[]) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const int64 = (x: bigint) => b64url(inteiroParaBytes(x, Math.ceil(bitsDe(x) / 8)));

  it('AES-GCM: casos de teste 1 a 4 do documento do GCM (AES-128)', () => {
    const k0 = h('00000000000000000000000000000000');
    const iv0 = h('000000000000000000000000');
    const t1 = aesGcmCifrar(k0, iv0, []);
    expect(paraHex(t1.tag)).toBe('58e2fccefa7e3061367f1d57a4e7455a');
    const t2 = aesGcmCifrar(k0, iv0, h('00000000000000000000000000000000'));
    expect(paraHex(t2.cifrado)).toBe('0388dace60b6a392f328c2b971b2fe78');
    expect(paraHex(t2.tag)).toBe('ab6e47d42cec13bdf53a67b21257bddf');
    const k = h('feffe9928665731c6d6a8f9467308308');
    const iv = h('cafebabefacedbaddecaf888');
    const p3 = h('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255');
    const t3 = aesGcmCifrar(k, iv, p3);
    expect(paraHex(t3.cifrado)).toBe('42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091473f5985');
    expect(paraHex(t3.tag)).toBe('4d5c2af327cd64a62cf35abd2ba6fab4');
    const aad = h('feedfacedeadbeeffeedfacedeadbeefabaddad2');
    const t4 = aesGcmCifrar(k, iv, p3.slice(0, 60), aad);
    expect(paraHex(t4.cifrado)).toBe('42831ec2217774244b7221b784d0d49ce3aa212f2c02a4e035c17e2329aca12e21d514b25466931c7d8f6a5aac84aa051ba30b396a0aac973d58e091');
    expect(paraHex(t4.tag)).toBe('5bc94fbc3221a5db94fae95ae7121a47');
    // decifra de volta; um byte trocado no cifrado ou no AAD derruba a etiqueta
    expect(aesGcmDecifrar(k, iv, t4.cifrado, t4.tag, aad)).toMatchObject({ ok: true, claro: p3.slice(0, 60) });
    const adulterado = t4.cifrado.slice();
    adulterado[7] ^= 1;
    expect(aesGcmDecifrar(k, iv, adulterado, t4.tag, aad).ok).toBe(false);
    expect(aesGcmDecifrar(k, iv, t4.cifrado, t4.tag, [...aad.slice(0, -1), 0]).ok).toBe(false);
  });

  it('AES-GCM confere com a WebCrypto', async () => {
    const k = Array.from({ length: 16 }, (_, i) => (i * 37 + 5) & 0xff);
    const iv = Array.from({ length: 12 }, (_, i) => (i * 11 + 1) & 0xff);
    const aad = textoParaBytes('cabeçalho');
    const claro = textoParaBytes('GET /conta?senha=123 HTTP/1.1, com mais de um bloco de texto');
    const chave = await sutil.importKey('raw', u8(k), 'AES-GCM', false, ['encrypt']);
    const ref = Array.from(new Uint8Array(await sutil.encrypt({ name: 'AES-GCM', iv: u8(iv), additionalData: u8(aad) }, chave, u8(claro))));
    const r = aesGcmCifrar(k, iv, claro, aad);
    expect(paraHex([...r.cifrado, ...r.tag])).toBe(paraHex(ref));
  });

  it('AES-CCM: pacote 1 da RFC 3610 (M = 8, L = 2, nonce de 13 bytes, como o CCMP)', () => {
    const k = h('c0c1c2c3c4c5c6c7c8c9cacbcccdcecf');
    const nonce = h('00000003020100a0a1a2a3a4a5');
    const aad = h('0001020304050607');
    const m = h('08090a0b0c0d0e0f101112131415161718191a1b1c1d1e');
    const r = aesCcmCifrar(k, nonce, m, aad, 8);
    expect(paraHex(r.cifrado)).toBe('588c979a61c663d2f066d0c2c0f989806d5f6b61dac384');
    expect(paraHex(r.tag)).toBe('17e8d12cfdf926e0');
    expect(aesCcmDecifrar(k, nonce, r.cifrado, r.tag, aad)).toMatchObject({ ok: true, claro: m });
    const x = r.cifrado.slice();
    x[0] ^= 0x80;
    expect(aesCcmDecifrar(k, nonce, x, r.tag, aad).ok).toBe(false);
  });

  it('SHA-1, HMAC-SHA1 e PBKDF2 (RFC 6070 e o vetor do IEEE 802.11i)', () => {
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(paraHex(hmacSha1(h('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'), 'Hi There'))).toBe('b617318655057264e28bc0b6fb378c8ef146be00');
    expect(paraHex(pbkdf2HmacSha1('password', 'salt', 1, 20))).toBe('0c60c80f961f0e71f3a9b524af6012062fe037a6');
    expect(paraHex(pbkdf2HmacSha1('password', 'salt', 2, 20))).toBe('ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957');
    expect(paraHex(pbkdf2HmacSha1('password', 'salt', 4096, 20))).toBe('4b007901b765489abead49d926f721d065a429c1');
    // PSK do WPA2: PBKDF2(senha, SSID, 4096, 256 bits)
    expect(paraHex(pbkdf2HmacSha1('password', 'IEEE', 4096, 32))).toBe('f42c6fc52df0ebef9ebb4b90b38a5f902e83fe1b135a70e23aed762e9710a12e');
    expect(paraHex(pbkdf2HmacSha1('ThisIsAPassword', 'ThisIsASSID', 4096, 32))).toBe('0dc0d6eb90555ed6419756b9a15ec3e3209b63df707dd508d14581f8982721af');
  });

  it('PBKDF2 confere com a WebCrypto', async () => {
    const base = await sutil.importKey('raw', u8(textoParaBytes('senha da escola')), 'PBKDF2', false, ['deriveBits']);
    const ref = new Uint8Array(await sutil.deriveBits({ name: 'PBKDF2', hash: 'SHA-1', salt: u8(textoParaBytes('Rede da Praça')), iterations: 4096 }, base, 256));
    expect(paraHex(pbkdf2HmacSha1('senha da escola', 'Rede da Praça', 4096, 32))).toBe(paraHex(Array.from(ref)));
  });

  it('PRF do 802.11: vetor de teste do 802.11i', () => {
    expect(paraHex(prf80211(h('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'), 'prefix', textoParaBytes('Hi There'), 192))).toBe('bcd4c650b30b9684951829e0d75f9d54b862175ed9f00606');
  });

  it('HKDF-SHA256: caso de teste 1 da RFC 5869', () => {
    const prk = hkdfExtrair(h('000102030405060708090a0b0c'), h('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'));
    expect(paraHex(prk)).toBe('077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5');
    expect(paraHex(hkdfExpandir(prk, h('f0f1f2f3f4f5f6f7f8f9'), 42))).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865');
  });

  it('X25519: vetores da RFC 7748 (5.2 e 6.1)', () => {
    expect(paraHex(x25519(h('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4'), h('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d0ab1c4c')))).toBe('c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552');
    const alice = parX25519(h('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a'));
    const bob = parX25519(h('5dab087e624a8a4b79e17f8b83800ee66f3bb1292618b6fd1c2f8b27ff88e0eb'));
    expect(paraHex(alice.publica)).toBe('8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a');
    expect(paraHex(bob.publica)).toBe('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f');
    const segredo = '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742';
    expect(paraHex(x25519(alice.privada, bob.publica))).toBe(segredo);
    expect(paraHex(x25519(bob.privada, alice.publica))).toBe(segredo);
  });

  it('Miller-Rabin acha primos e pega os de Carmichael; o gerador por semente é reprodutível', () => {
    const sortear = geradorDeSemente('teste');
    expect(ehProvavelPrimo(2n ** 127n - 1n, sortear)).toBe(true);
    expect(ehProvavelPrimo(561n, sortear)).toBe(false);
    expect(ehProvavelPrimo(3215031751n, sortear)).toBe(false);
    expect(ehProvavelPrimo((2n ** 61n - 1n) * (2n ** 89n - 1n), sortear)).toBe(false);
    const p = gerarPrimo(256, geradorDeSemente('camada8'));
    expect(p).toBe(gerarPrimo(256, geradorDeSemente('camada8')));
    expect(bitsDe(p)).toBe(256);
    expect(millerRabin(p, [2n, 3n, 5n, 7n, 11n, 13n])).toBe(true);
  });

  it('RSA de 768 bits gerado por semente: PKCS#1 v1.5, PSS e cifra de chave de sessão', () => {
    const k = gerarRsaPorSemente('aula', 768);
    expect(bitsDe(k.n)).toBe(768);
    expect(k.e).toBe(65537n);
    expect(gerarRsaPorSemente('aula', 768).n).toBe(k.n);
    const s = assinarPkcs1('ordem 42', k.privada);
    expect(verificarPkcs1('ordem 42', s, k.publica)).toBe(true);
    expect(verificarPkcs1('ordem 43', s, k.publica)).toBe(false);
    const pss = assinarPss('ordem 42', k.privada, new Array(32).fill(7));
    expect(verificarPss('ordem 42', pss, k.publica)).toBe(true);
    expect(verificarPss('ordem 43', pss, k.publica)).toBe(false);
    let x = 0.1;
    const c = cifrarRsaPkcs1([1, 2, 3, 4], k.publica, () => (x = (x * 9301 + 0.49297) % 1));
    expect(decifrarRsaPkcs1(c, k.privada)).toEqual([1, 2, 3, 4]);
  });

  it('RSA de 2048 bits do jogo: as assinaturas conferem com a WebCrypto (PKCS#1 v1.5 e PSS)', async () => {
    const k = chavesFixas('raiz');
    expect(bitsDe(k.n)).toBe(2048);
    expect(k.e).toBe(65537n);
    const jwk = { kty: 'RSA', n: int64(k.n), e: int64(k.e), ext: true };
    const msg = textoParaBytes('certificado de www.loja.exemplo');
    const pk1 = await sutil.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    expect(await sutil.verify('RSASSA-PKCS1-v1_5', pk1, u8(assinarPkcs1(msg, k.privada)), u8(msg))).toBe(true);
    const pss = await sutil.importKey('jwk', jwk, { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['verify']);
    expect(await sutil.verify({ name: 'RSA-PSS', saltLength: 32 }, pss, u8(assinarPss(msg, k.privada, new Array(32).fill(3))), u8(msg))).toBe(true);
    // e a assinatura feita pela WebCrypto é a mesma do motor (o PKCS#1 v1.5 é determinístico)
    const jwkPriv = { ...jwk, d: int64(k.d), p: int64(k.p), q: int64(k.q), dp: int64(k.privada.dp!), dq: int64(k.privada.dq!), qi: int64(k.privada.qinv!) };
    const priv = await sutil.importKey('jwk', jwkPriv, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sw = Array.from(new Uint8Array(await sutil.sign('RSASSA-PKCS1-v1_5', priv, u8(msg))));
    expect(paraHex(sw)).toBe(paraHex(assinarPkcs1(msg, k.privada)));
  });

  it('as chaves fixas de 2048 bits saem da semente documentada', () => {
    expect(gerarRsaPorSemente(sementeDaChave('servidor'), 2048).n).toBe(chavesFixas('servidor').n);
    for (const nome of NOMES_CHAVES_FIXAS) {
      const k = chavesFixas(nome);
      const sortear = geradorDeSemente('conferir|' + nome);
      expect(ehProvavelPrimo(k.p, sortear, 4) && ehProvavelPrimo(k.q, sortear, 4), nome).toBe(true);
      expect(bitsDe(k.n), nome).toBe(2048);
      expect((k.e * k.d) % ((k.p - 1n) * (k.q - 1n) / mdc(k.p - 1n, k.q - 1n)), nome).toBe(1n);
    }
  });

  it('Kerberos: a etiqueta do GCM é que denuncia a senha errada', () => {
    const r = simularKerberos({ usuario: 'alice', senhaDigitada: 'x', senhaCadastrada: 'y', servico: 's', agora: 1 });
    expect(r.falha).toMatch(/senha errada/);
  });
});
