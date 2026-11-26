// Criptografia didática do ato 7: funções puras, determinísticas e sem bibliotecas externas.
// Os números são pequenos o bastante para caber numa aula, mas o SHA-256, o HMAC e o AES-128
// são completos e conferidos com os vetores de teste oficiais. Cada função importante devolve
// também `passos`, a conta explicada em português.

// ---------------------------------------------------------------------------
// Utilidades de bytes
// ---------------------------------------------------------------------------

export type Bytes = number[];

export function textoParaBytes(texto: string): Bytes {
  return Array.from(new TextEncoder().encode(texto));
}

export function bytesParaTexto(bytes: Bytes): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function paraHex(bytes: Bytes): string {
  return bytes.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join('');
}

export function deHex(hex: string): Bytes {
  const limpo = hex.replace(/\s+/g, '');
  if (limpo.length % 2 !== 0 || /[^0-9a-fA-F]/.test(limpo)) throw new Error('hexadecimal inválido');
  const out: Bytes = [];
  for (let i = 0; i < limpo.length; i += 2) out.push(parseInt(limpo.slice(i, i + 2), 16));
  return out;
}

export function xorBytes(a: Bytes, b: Bytes): Bytes {
  const n = Math.min(a.length, b.length);
  const out: Bytes = [];
  for (let i = 0; i < n; i++) out.push((a[i] ^ b[i]) & 0xff);
  return out;
}

function bytesDe(entrada: string | Bytes): Bytes {
  return typeof entrada === 'string' ? textoParaBytes(entrada) : entrada.slice();
}

// ---------------------------------------------------------------------------
// 1. Cifras clássicas
// ---------------------------------------------------------------------------

export const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Maiúsculas e sem acento: "Ação" vira "ACAO". O que não é letra fica como está. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}

export interface ResultadoTexto {
  resultado: string;
  passos: string[];
}

function deslocar(letra: string, chave: number): string {
  const i = ALFABETO.indexOf(letra);
  if (i < 0) return letra;
  return ALFABETO[(((i + chave) % 26) + 26) % 26];
}

/** Cifra de César: cada letra anda `chave` casas no alfabeto. */
export function cesar(texto: string, chave: number): ResultadoTexto {
  const t = normalizar(texto);
  const k = ((chave % 26) + 26) % 26;
  const resultado = [...t].map((c) => deslocar(c, k)).join('');
  const passos = [
    `Texto normalizado (maiúsculas, sem acento): ${t}`,
    `Chave ${chave}: cada letra anda ${k} casa(s) no alfabeto, e depois do Z volta ao A.`,
    `Exemplo: ${ALFABETO.slice(0, 3)} vira ${[...'ABC'].map((c) => deslocar(c, k)).join('')}.`,
    `Resultado: ${resultado}`,
  ];
  return { resultado, passos };
}

export function decifrarCesar(texto: string, chave: number): ResultadoTexto {
  const r = cesar(texto, -chave);
  r.passos.splice(1, 0, `Para decifrar, anda ${chave} casa(s) para trás (o mesmo que a chave ${(((-chave) % 26) + 26) % 26}).`);
  return r;
}

/** Substituição monoalfabética: `alfabetoCifrado[i]` substitui a letra `ALFABETO[i]`. */
export function substituicao(texto: string, alfabetoCifrado: string): ResultadoTexto {
  const alvo = normalizar(alfabetoCifrado);
  validarPermutacao(alvo);
  const t = normalizar(texto);
  const resultado = [...t].map((c) => { const i = ALFABETO.indexOf(c); return i < 0 ? c : alvo[i]; }).join('');
  return {
    resultado,
    passos: [
      `Tabela: ${ALFABETO}`,
      `        ${alvo}`,
      `São 26! (cerca de 4 × 10^26) tabelas possíveis, força bruta não dá, mas a frequência das letras continua a mesma.`,
      `Resultado: ${resultado}`,
    ],
  };
}

export function desfazerSubstituicao(texto: string, alfabetoCifrado: string): ResultadoTexto {
  const alvo = normalizar(alfabetoCifrado);
  validarPermutacao(alvo);
  const t = normalizar(texto);
  const resultado = [...t].map((c) => { const i = alvo.indexOf(c); return i < 0 ? c : ALFABETO[i]; }).join('');
  return { resultado, passos: [`Tabela invertida: cada letra de ${alvo} volta para a de ${ALFABETO}.`, `Resultado: ${resultado}`] };
}

function validarPermutacao(alvo: string): void {
  if (alvo.length !== 26 || new Set(alvo).size !== 26 || [...alvo].some((c) => !ALFABETO.includes(c))) {
    throw new Error('o alfabeto cifrado precisa ter as 26 letras, cada uma uma vez');
  }
}

/** Frequência aproximada das letras em português, em porcentagem. */
export const FREQUENCIA_PT: Record<string, number> = {
  A: 14.63, B: 1.04, C: 3.88, D: 4.99, E: 12.57, F: 1.02, G: 1.3, H: 1.28, I: 6.18,
  J: 0.4, K: 0.02, L: 2.78, M: 4.74, N: 5.05, O: 10.73, P: 2.52, Q: 1.2, R: 6.53,
  S: 7.81, T: 4.34, U: 4.63, V: 1.67, W: 0.01, X: 0.21, Y: 0.01, Z: 0.47,
};

export interface Frequencias {
  contagem: Record<string, number>;
  percentual: Record<string, number>;
  total: number;
  ordem: string[]; // letras da mais para a menos frequente
  passos: string[];
}

export function contarFrequencias(texto: string): Frequencias {
  const contagem: Record<string, number> = {};
  for (const c of ALFABETO) contagem[c] = 0;
  let total = 0;
  for (const c of normalizar(texto)) if (c in contagem) { contagem[c]++; total++; }
  const percentual: Record<string, number> = {};
  for (const c of ALFABETO) percentual[c] = total ? (100 * contagem[c]) / total : 0;
  const ordem = [...ALFABETO].sort((a, b) => contagem[b] - contagem[a] || a.localeCompare(b));
  const top = ordem.slice(0, 5).map((c) => `${c} ${percentual[c].toFixed(1)}%`).join(', ');
  return {
    contagem, percentual, total, ordem,
    passos: [`Letras contadas: ${total}.`, `Mais frequentes: ${top}.`, 'Em português, as campeãs são A, E, O, S e R.'],
  };
}

export interface PalpiteCesar {
  chave: number;
  texto: string;
  /** Qui-quadrado de cada chave (quanto menor, mais parece português). */
  pontuacoes: number[];
  passos: string[];
}

/** Quebra o César comparando a frequência de cada deslocamento com a do português (qui-quadrado). */
export function quebrarCesar(cifrado: string): PalpiteCesar {
  const f = contarFrequencias(cifrado);
  const pontuacoes: number[] = [];
  for (let k = 0; k < 26; k++) {
    let chi = 0;
    for (let i = 0; i < 26; i++) {
      // se a chave é k, a letra clara i aparece no cifrado como i + k
      const obs = f.contagem[ALFABETO[(i + k) % 26]];
      const esp = (FREQUENCIA_PT[ALFABETO[i]] / 100) * f.total;
      chi += esp > 0 ? ((obs - esp) ** 2) / esp : 0;
    }
    pontuacoes.push(chi);
  }
  let chave = 0;
  for (let k = 1; k < 26; k++) if (pontuacoes[k] < pontuacoes[chave]) chave = k;
  const texto = decifrarCesar(cifrado, chave).resultado;
  const ranking = pontuacoes.map((p, k) => [k, p] as const).sort((a, b) => a[1] - b[1]).slice(0, 3);
  return {
    chave, texto, pontuacoes,
    passos: [
      ...f.passos,
      'Para cada uma das 26 chaves, desloca de volta e mede a distância até a frequência do português (qui-quadrado).',
      `Melhores chaves: ${ranking.map(([k, p]) => `${k} (${p.toFixed(1)})`).join(', ')}.`,
      `A mais provável é ${chave}: a letra mais comum do cifrado, ${f.ordem[0]}, seria ${deslocar(f.ordem[0], -chave)} no texto claro.`,
      `Texto decifrado: ${texto.slice(0, 60)}${texto.length > 60 ? '...' : ''}`,
    ],
  };
}

/** Ordem de leitura das colunas: a coluna com a letra que vem antes no alfabeto sai primeiro. */
export function ordemDaChave(chave: string): number[] {
  const k = normalizar(chave);
  return [...k].map((c, i) => [c, i] as const).sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]).map(([, i]) => i);
}

/** Transposição por colunas: escreve em linhas com a largura da chave e lê as colunas na ordem da chave. */
export function transposicao(texto: string, chave: string): ResultadoTexto {
  const t = normalizar(texto).replace(/[^A-Z0-9]/g, '');
  const cols = normalizar(chave).length;
  if (cols < 2) throw new Error('a chave precisa de pelo menos duas letras');
  const ordem = ordemDaChave(chave);
  const linhas: string[] = [];
  for (let i = 0; i < t.length; i += cols) linhas.push(t.slice(i, i + cols));
  let resultado = '';
  for (const c of ordem) for (const l of linhas) if (c < l.length) resultado += l[c];
  return {
    resultado,
    passos: [
      `Chave ${normalizar(chave)} com ${cols} colunas; ordem de leitura: ${ordem.map((c) => c + 1).join(', ')}.`,
      'Grade (uma linha por vez):',
      ...linhas.map((l) => '  ' + [...l].join(' ')),
      'As letras não mudam, só trocam de lugar: a frequência entrega que é transposição e não substituição.',
      `Resultado: ${resultado}`,
    ],
  };
}

export function desfazerTransposicao(cifrado: string, chave: string): ResultadoTexto {
  const t = normalizar(cifrado).replace(/[^A-Z0-9]/g, '');
  const cols = normalizar(chave).length;
  const ordem = ordemDaChave(chave);
  const linhasCheias = Math.floor(t.length / cols);
  const sobra = t.length % cols;
  const colunas: string[] = new Array(cols).fill('');
  let pos = 0;
  for (const c of ordem) {
    const tam = linhasCheias + (c < sobra ? 1 : 0);
    colunas[c] = t.slice(pos, pos + tam);
    pos += tam;
  }
  let resultado = '';
  for (let l = 0; l < linhasCheias + (sobra ? 1 : 0); l++) for (let c = 0; c < cols; c++) if (l < colunas[c].length) resultado += colunas[c][l];
  return {
    resultado,
    passos: [
      `${t.length} letras em ${cols} colunas: ${sobra} coluna(s) com ${linhasCheias + 1} e o resto com ${linhasCheias}.`,
      'Preenche as colunas na ordem da chave e lê linha por linha.',
      `Resultado: ${resultado}`,
    ],
  };
}

export interface ResultadoBytes {
  resultado: Bytes;
  hex: string;
  passos: string[];
}

/** Chave única (one-time pad): XOR byte a byte com uma chave do mesmo tamanho, usada uma vez só. */
export function chaveUnica(mensagem: string | Bytes, chave: Bytes): ResultadoBytes {
  const m = bytesDe(mensagem);
  if (chave.length < m.length) throw new Error('a chave única precisa ser pelo menos do tamanho da mensagem');
  const resultado = xorBytes(m, chave);
  return {
    resultado, hex: paraHex(resultado),
    passos: [
      `Mensagem: ${paraHex(m)}`,
      `Chave:    ${paraHex(chave.slice(0, m.length))}`,
      `XOR:      ${paraHex(resultado)}`,
      'Com chave aleatória, do tamanho da mensagem e usada uma vez, qualquer texto claro é igualmente provável: sigilo perfeito.',
      'Decifrar é o mesmo XOR de novo, porque (m XOR k) XOR k = m.',
    ],
  };
}

export interface ReusoDeChave {
  xorDosCifrados: Bytes;
  xorDosClaros: Bytes;
  iguais: boolean;
  /** Se o atacante conhece (ou adivinha) a primeira mensagem, recupera a segunda. */
  segundaRecuperada: string;
  passos: string[];
}

/** Mostra por que reusar a chave única vaza: c1 XOR c2 = m1 XOR m2, a chave some da conta. */
export function reusoDaChaveUnica(m1: string, m2: string, chave: Bytes): ReusoDeChave {
  const b1 = textoParaBytes(m1);
  const b2 = textoParaBytes(m2);
  const c1 = chaveUnica(b1, chave).resultado;
  const c2 = chaveUnica(b2, chave).resultado;
  const xorDosCifrados = xorBytes(c1, c2);
  const xorDosClaros = xorBytes(b1, b2);
  const iguais = paraHex(xorDosCifrados) === paraHex(xorDosClaros);
  const segundaRecuperada = bytesParaTexto(xorBytes(xorDosCifrados, b1));
  return {
    xorDosCifrados, xorDosClaros, iguais, segundaRecuperada,
    passos: [
      `c1 = m1 XOR k = ${paraHex(c1)}`,
      `c2 = m2 XOR k = ${paraHex(c2)}`,
      `c1 XOR c2 = ${paraHex(xorDosCifrados)}`,
      `m1 XOR m2 = ${paraHex(xorDosClaros)}`,
      iguais ? 'São iguais: (m1 XOR k) XOR (m2 XOR k) = m1 XOR m2, a chave se cancela.' : 'Diferentes (mensagens de tamanhos distintos?).',
      `Quem conhece m1 calcula (c1 XOR c2) XOR m1 = "${segundaRecuperada}", sem nunca ver a chave.`,
    ],
  };
}

// ---------------------------------------------------------------------------
// 2. Princípios: redundância e atualidade
// ---------------------------------------------------------------------------

function somaVerificacao(texto: string): number {
  // soma de Fletcher de 16 bits: simples, mas pega troca de ordem
  let a = 1, b = 0;
  for (const byte of textoParaBytes(texto)) { a = (a + byte) % 255; b = (b + a) % 255; }
  return (b << 8) | a;
}

/** Redundância: anexa uma soma de verificação para que lixo forjado ao acaso seja detectado. */
export function adicionarRedundancia(mensagem: string): ResultadoTexto {
  const soma = somaVerificacao(mensagem).toString(16).padStart(4, '0');
  const resultado = `${mensagem}#${soma}`;
  return {
    resultado,
    passos: [
      `Soma de verificação de "${mensagem}": ${soma}.`,
      `Pacote: ${resultado}`,
      'Um intruso que manda bytes aleatórios acerta a soma só 1 vez em 65.025: a redundância separa mensagem válida de lixo.',
      'Mas redundância demais ajuda o criptoanalista: ela não protege o sigilo, só a validade.',
    ],
  };
}

export function verificarRedundancia(pacote: string): { valida: boolean; mensagem: string; passos: string[] } {
  const i = pacote.lastIndexOf('#');
  if (i < 0) return { valida: false, mensagem: pacote, passos: ['Sem soma de verificação: descartado.'] };
  const mensagem = pacote.slice(0, i);
  const recebida = pacote.slice(i + 1);
  const calculada = somaVerificacao(mensagem).toString(16).padStart(4, '0');
  const valida = recebida === calculada;
  return {
    valida, mensagem,
    passos: [`Soma recebida ${recebida}, calculada ${calculada}.`, valida ? 'Confere: mensagem aceita.' : 'Não confere: mensagem descartada.'],
  };
}

export interface MensagemComFrescor {
  seq: number;
  marcaTempo: number; // segundos
  conteudo: string;
}

export interface EstadoAtualidade {
  vistos: number[]; // números de sequência já aceitos dentro da janela
}

export type MotivoAtualidade = 'ok' | 'repetida' | 'velha' | 'futura';

/**
 * Atualidade (frescor): recusa mensagem velha demais, do futuro ou repetida.
 * Pura: devolve o estado novo em vez de mudar o recebido.
 */
export function verificarAtualidade(
  msg: MensagemComFrescor, estado: EstadoAtualidade, agora: number, janela = 60,
): { aceita: boolean; motivo: MotivoAtualidade; estado: EstadoAtualidade; passos: string[] } {
  const idade = agora - msg.marcaTempo;
  const passos = [`Mensagem seq ${msg.seq}, marca de tempo ${msg.marcaTempo}, agora ${agora}: idade ${idade} s, janela ${janela} s.`];
  if (idade > janela) {
    passos.push('Mais velha que a janela: pode ser gravação antiga reenviada (repetição). Recusada.');
    return { aceita: false, motivo: 'velha', estado, passos };
  }
  if (idade < -janela) {
    passos.push('Vem do futuro além da tolerância de relógio: recusada.');
    return { aceita: false, motivo: 'futura', estado, passos };
  }
  if (estado.vistos.includes(msg.seq)) {
    passos.push(`Número de sequência ${msg.seq} já foi visto dentro da janela: ataque de repetição. Recusada.`);
    return { aceita: false, motivo: 'repetida', estado, passos };
  }
  passos.push('Dentro da janela e com sequência inédita: aceita e guardada para detectar repetição.');
  return { aceita: true, motivo: 'ok', estado: { vistos: [...estado.vistos, msg.seq] }, passos };
}

// ---------------------------------------------------------------------------
// 3. Simétrica: Feistel de brinquedo
// ---------------------------------------------------------------------------

const rotl16 = (x: number, n: number) => ((x << n) | (x >>> (16 - n))) & 0xffff;
const rotl32 = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

/** Subchaves de 16 bits derivadas da chave de 32 bits (gira e mistura com uma constante por rodada). */
export function subchavesFeistel(chave: number, rodadas = 4): number[] {
  const out: number[] = [];
  for (let i = 0; i < rodadas; i++) out.push(((rotl32(chave >>> 0, 8 * i + 3) >>> 16) ^ Math.imul(0x9e37, i + 1)) & 0xffff);
  return out;
}

/** Função F da rodada: não precisa ser inversível, a estrutura de Feistel garante a volta. */
export function funcaoF(metade: number, subchave: number): number {
  let x = (metade ^ subchave) & 0xffff;
  x = (Math.imul(x, 0x6b43) + 0x1f) & 0xffff;
  x ^= x >>> 7;
  return rotl16(x, 5);
}

const h16 = (x: number) => x.toString(16).padStart(4, '0');
const h32 = (x: number) => (x >>> 0).toString(16).padStart(8, '0');

export interface ResultadoFeistel {
  resultado: number;
  subchaves: number[];
  passos: string[];
}

/** Cifra de Feistel de 32 bits (duas metades de 16), como a estrutura do DES em miniatura. */
export function feistelCifrar(bloco: number, chave: number, rodadas = 4): ResultadoFeistel {
  const k = subchavesFeistel(chave, rodadas);
  let L = (bloco >>> 16) & 0xffff;
  let R = bloco & 0xffff;
  const passos = [`Bloco ${h32(bloco)}: L0 = ${h16(L)}, R0 = ${h16(R)}. Subchaves: ${k.map(h16).join(', ')}.`];
  for (let i = 0; i < rodadas; i++) {
    const f = funcaoF(R, k[i]);
    const novoR = (L ^ f) & 0xffff;
    passos.push(`Rodada ${i + 1}: F(R, k${i + 1}) = ${h16(f)}; L${i + 1} = R${i} = ${h16(R)}; R${i + 1} = L${i} XOR F = ${h16(novoR)}.`);
    L = R;
    R = novoR;
  }
  const resultado = ((L << 16) | R) >>> 0;
  passos.push(`Saída: ${h32(resultado)}. Decifrar é rodar as mesmas rodadas com as subchaves na ordem inversa.`);
  return { resultado, subchaves: k, passos };
}

export function feistelDecifrar(bloco: number, chave: number, rodadas = 4): ResultadoFeistel {
  const k = subchavesFeistel(chave, rodadas);
  let L = (bloco >>> 16) & 0xffff;
  let R = bloco & 0xffff;
  const passos = [`Bloco cifrado ${h32(bloco)}: começa da última rodada.`];
  for (let i = rodadas - 1; i >= 0; i--) {
    const f = funcaoF(L, k[i]);
    const antigoL = (R ^ f) & 0xffff;
    passos.push(`Desfaz rodada ${i + 1}: R${i} = L${i + 1} = ${h16(L)}; L${i} = R${i + 1} XOR F(L${i + 1}, k${i + 1}) = ${h16(antigoL)}.`);
    R = L;
    L = antigoL;
  }
  const resultado = ((L << 16) | R) >>> 0;
  passos.push(`Texto claro: ${h32(resultado)}.`);
  return { resultado, subchaves: k, passos };
}

// ---------------------------------------------------------------------------
// 3. Simétrica: AES-128 completo, com o estado visível em cada etapa
// ---------------------------------------------------------------------------

/** Multiplicação no corpo GF(2^8) com o polinômio do AES, x^8 + x^4 + x^3 + x + 1. */
export function gmul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const alto = a & 0x80;
    a = (a << 1) & 0xff;
    if (alto) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function gerarSbox(): { sbox: number[]; inversa: number[] } {
  const sbox: number[] = new Array(256);
  const inversa: number[] = new Array(256);
  for (let x = 0; x < 256; x++) {
    let inv = 0;
    if (x) for (let y = 1; y < 256; y++) if (gmul(x, y) === 1) { inv = y; break; }
    const rot = (v: number, n: number) => ((v << n) | (v >>> (8 - n))) & 0xff;
    const s = inv ^ rot(inv, 1) ^ rot(inv, 2) ^ rot(inv, 3) ^ rot(inv, 4) ^ 0x63;
    sbox[x] = s;
    inversa[s] = x;
  }
  return { sbox, inversa };
}

const SB = gerarSbox();
/** A S-box real do AES: inverso multiplicativo em GF(2^8) seguido da transformação afim. */
export const AES_SBOX: readonly number[] = SB.sbox;
export const AES_SBOX_INVERSA: readonly number[] = SB.inversa;

/** O estado é um vetor de 16 bytes em ordem de coluna: estado[linha + 4 * coluna]. */
export type EstadoAes = Bytes;

export function subBytes(estado: EstadoAes): EstadoAes { return estado.map((b) => AES_SBOX[b]); }
export function invSubBytes(estado: EstadoAes): EstadoAes { return estado.map((b) => AES_SBOX_INVERSA[b]); }

/** A linha r gira r casas para a esquerda. */
export function shiftRows(estado: EstadoAes): EstadoAes {
  const out = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[r + 4 * c] = estado[r + 4 * ((c + r) % 4)];
  return out;
}
export function invShiftRows(estado: EstadoAes): EstadoAes {
  const out = new Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[r + 4 * ((c + r) % 4)] = estado[r + 4 * c];
  return out;
}

function misturarColunas(estado: EstadoAes, m: number[]): EstadoAes {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    const col = estado.slice(4 * c, 4 * c + 4);
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let j = 0; j < 4; j++) v ^= gmul(m[(j - r + 4) % 4], col[j]);
      out[r + 4 * c] = v;
    }
  }
  return out;
}
/** Cada coluna é multiplicada pela matriz circulante (2 3 1 1) em GF(2^8). */
export function mixColumns(estado: EstadoAes): EstadoAes { return misturarColunas(estado, [2, 3, 1, 1]); }
export function invMixColumns(estado: EstadoAes): EstadoAes { return misturarColunas(estado, [14, 11, 13, 9]); }

export function addRoundKey(estado: EstadoAes, chaveRodada: Bytes): EstadoAes { return xorBytes(estado, chaveRodada); }

/** Expansão de chave do AES-128: 11 chaves de rodada de 16 bytes. */
export function expandirChaveAes(chave: Bytes): Bytes[] {
  if (chave.length !== 16) throw new Error('o AES-128 usa chave de 16 bytes');
  const w: Bytes[] = [];
  for (let i = 0; i < 4; i++) w.push(chave.slice(4 * i, 4 * i + 4));
  let rcon = 1;
  for (let i = 4; i < 44; i++) {
    let t = w[i - 1].slice();
    if (i % 4 === 0) {
      t = [t[1], t[2], t[3], t[0]].map((b) => AES_SBOX[b]);
      t[0] ^= rcon;
      rcon = gmul(rcon, 2);
    }
    w.push(xorBytes(w[i - 4], t));
  }
  const chaves: Bytes[] = [];
  for (let r = 0; r < 11; r++) chaves.push([...w[4 * r], ...w[4 * r + 1], ...w[4 * r + 2], ...w[4 * r + 3]]);
  return chaves;
}

export interface EtapaAes {
  rodada: number;
  etapa: 'entrada' | 'SubBytes' | 'ShiftRows' | 'MixColumns' | 'AddRoundKey';
  estado: string; // hex
}

/** Uma rodada didática: as quatro etapas, com o estado depois de cada uma. */
export function aesRodada(estado: EstadoAes, chaveRodada: Bytes, ultima = false, rodada = 1): { estado: EstadoAes; etapas: EtapaAes[] } {
  const etapas: EtapaAes[] = [];
  let s = subBytes(estado); etapas.push({ rodada, etapa: 'SubBytes', estado: paraHex(s) });
  s = shiftRows(s); etapas.push({ rodada, etapa: 'ShiftRows', estado: paraHex(s) });
  if (!ultima) { s = mixColumns(s); etapas.push({ rodada, etapa: 'MixColumns', estado: paraHex(s) }); }
  s = addRoundKey(s, chaveRodada); etapas.push({ rodada, etapa: 'AddRoundKey', estado: paraHex(s) });
  return { estado: s, etapas };
}

export interface ResultadoAes {
  resultado: Bytes;
  hex: string;
  etapas: EtapaAes[];
  passos: string[];
}


/** AES-128 completo: 10 rodadas, a última sem MixColumns. */
export function aesCifrar(bloco: Bytes, chave: Bytes): ResultadoAes {
  if (bloco.length !== 16) throw new Error('o AES cifra blocos de 16 bytes');
  const k = expandirChaveAes(chave);
  const etapas: EtapaAes[] = [{ rodada: 0, etapa: 'entrada', estado: paraHex(bloco) }];
  let s = addRoundKey(bloco, k[0]);
  etapas.push({ rodada: 0, etapa: 'AddRoundKey', estado: paraHex(s) });
  for (let r = 1; r <= 10; r++) {
    const rod = aesRodada(s, k[r], r === 10, r);
    s = rod.estado;
    etapas.push(...rod.etapas);
  }
  const passos = [
    `Bloco ${paraHex(bloco)} e chave ${paraHex(chave)}.`,
    'Rodada 0: só AddRoundKey (XOR com a chave original).',
    'Rodadas 1 a 9: SubBytes (S-box, a parte não linear), ShiftRows (gira as linhas), MixColumns (mistura cada coluna) e AddRoundKey.',
    'Rodada 10: igual, mas sem MixColumns.',
    ...etapas.map((e) => `  rodada ${e.rodada}, ${e.etapa}: ${e.estado}`),
    `Cifrado: ${paraHex(s)}`,
  ];
  return { resultado: s, hex: paraHex(s), etapas, passos };
}

export function aesDecifrar(bloco: Bytes, chave: Bytes): ResultadoAes {
  if (bloco.length !== 16) throw new Error('o AES decifra blocos de 16 bytes');
  const k = expandirChaveAes(chave);
  let s = addRoundKey(bloco, k[10]);
  for (let r = 9; r >= 1; r--) s = invMixColumns(addRoundKey(invSubBytes(invShiftRows(s)), k[r]));
  s = addRoundKey(invSubBytes(invShiftRows(s)), k[0]);
  return {
    resultado: s, hex: paraHex(s), etapas: [],
    passos: ['Decifrar desfaz cada etapa na ordem inversa, com InvShiftRows, InvSubBytes e InvMixColumns.', `Claro: ${paraHex(s)}`],
  };
}

// ---------------------------------------------------------------------------
// 3. Modos de cifra
// ---------------------------------------------------------------------------

export interface CifraDeBloco {
  nome: string;
  tamanho: number; // bytes por bloco
  cifrar(bloco: Bytes): Bytes;
  decifrar(bloco: Bytes): Bytes;
}

export function cifraAes(chave: Bytes): CifraDeBloco {
  const k = chave.slice();
  return { nome: 'AES-128', tamanho: 16, cifrar: (b) => aesCifrar(b, k).resultado, decifrar: (b) => aesDecifrar(b, k).resultado };
}

const deBloco32 = (b: Bytes) => ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
const paraBloco32 = (x: number): Bytes => [(x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff];

export function cifraFeistel(chave: number, rodadas = 4): CifraDeBloco {
  return {
    nome: 'Feistel de brinquedo', tamanho: 4,
    cifrar: (b) => paraBloco32(feistelCifrar(deBloco32(b), chave, rodadas).resultado),
    decifrar: (b) => paraBloco32(feistelDecifrar(deBloco32(b), chave, rodadas).resultado),
  };
}

/** Preenchimento PKCS#7: completa com N bytes de valor N (sempre acrescenta, para dar para tirar). */
export function preencher(dados: Bytes, tamanho: number): Bytes {
  const n = tamanho - (dados.length % tamanho);
  return [...dados, ...new Array(n).fill(n)];
}

export function tirarPreenchimento(dados: Bytes, tamanho: number): Bytes {
  const n = dados[dados.length - 1];
  if (!n || n > tamanho || dados.slice(-n).some((b) => b !== n)) throw new Error('preenchimento inválido');
  return dados.slice(0, -n);
}

export function emBlocos(dados: Bytes, tamanho: number): Bytes[] {
  const out: Bytes[] = [];
  for (let i = 0; i < dados.length; i += tamanho) out.push(dados.slice(i, i + tamanho));
  return out;
}

/** Quantos blocos se repetem: no ECB, isso denuncia a estrutura do texto claro. */
export function blocosRepetidos(dados: Bytes, tamanho: number): { total: number; distintos: number; repetidos: number } {
  const blocos = emBlocos(dados, tamanho).map(paraHex);
  const distintos = new Set(blocos).size;
  return { total: blocos.length, distintos, repetidos: blocos.length - distintos };
}

export interface ResultadoModo extends ResultadoBytes {
  blocos: string[];
}

function fecharModo(resultado: Bytes, tamanho: number, passos: string[]): ResultadoModo {
  return { resultado, hex: paraHex(resultado), blocos: emBlocos(resultado, tamanho).map(paraHex), passos };
}

/** ECB: cada bloco cifrado sozinho. Blocos claros iguais viram blocos cifrados iguais. */
export function cifrarEcb(cifra: CifraDeBloco, dados: string | Bytes): ResultadoModo {
  const blocos = emBlocos(preencher(bytesDe(dados), cifra.tamanho), cifra.tamanho);
  const passos = [`ECB com ${cifra.nome}, ${blocos.length} bloco(s) de ${cifra.tamanho} bytes (com preenchimento PKCS#7).`];
  const out: Bytes = [];
  blocos.forEach((b, i) => { const c = cifra.cifrar(b); out.push(...c); passos.push(`  C${i + 1} = E(P${i + 1}) = ${paraHex(c)}`); });
  const rep = blocosRepetidos(out, cifra.tamanho);
  passos.push(rep.repetidos ? `${rep.repetidos} bloco(s) repetido(s) no cifrado: o desenho do texto claro aparece.` : 'Nenhum bloco repetido desta vez.');
  return fecharModo(out, cifra.tamanho, passos);
}

export function decifrarEcb(cifra: CifraDeBloco, cifrado: Bytes): ResultadoModo {
  const out: Bytes = [];
  for (const b of emBlocos(cifrado, cifra.tamanho)) out.push(...cifra.decifrar(b));
  return fecharModo(tirarPreenchimento(out, cifra.tamanho), cifra.tamanho, ['ECB: decifra cada bloco e tira o preenchimento.']);
}

/** CBC: cada bloco claro passa por XOR com o cifrado anterior (o primeiro, com o vetor de inicialização). */
export function cifrarCbc(cifra: CifraDeBloco, dados: string | Bytes, iv: Bytes): ResultadoModo {
  if (iv.length !== cifra.tamanho) throw new Error(`o vetor de inicialização precisa de ${cifra.tamanho} bytes`);
  const blocos = emBlocos(preencher(bytesDe(dados), cifra.tamanho), cifra.tamanho);
  const passos = [`CBC com ${cifra.nome}, IV ${paraHex(iv)}.`];
  const out: Bytes = [];
  let anterior = iv;
  blocos.forEach((b, i) => {
    const c = cifra.cifrar(xorBytes(b, anterior));
    passos.push(`  C${i + 1} = E(P${i + 1} XOR ${i ? `C${i}` : 'IV'}) = ${paraHex(c)}`);
    out.push(...c);
    anterior = c;
  });
  passos.push('Blocos claros iguais saem diferentes, porque cada um carrega o anterior.');
  return fecharModo(out, cifra.tamanho, passos);
}

export function decifrarCbc(cifra: CifraDeBloco, cifrado: Bytes, iv: Bytes): ResultadoModo {
  const out: Bytes = [];
  let anterior = iv;
  for (const c of emBlocos(cifrado, cifra.tamanho)) { out.push(...xorBytes(cifra.decifrar(c), anterior)); anterior = c; }
  return fecharModo(tirarPreenchimento(out, cifra.tamanho), cifra.tamanho, ['CBC: P = D(C) XOR cifrado anterior, e tira o preenchimento.']);
}

function incrementar(bloco: Bytes, n: number): Bytes {
  const out = bloco.slice();
  let vai = n;
  for (let i = out.length - 1; i >= 0 && vai; i--) { const s = out[i] + vai; out[i] = s & 0xff; vai = Math.floor(s / 256); }
  return out;
}

/** CTR: cifra o contador e faz XOR com os dados. Vira cifra de fluxo; cifrar e decifrar são a mesma conta. */
export function ctr(cifra: CifraDeBloco, dados: string | Bytes, contadorInicial: Bytes): ResultadoModo {
  if (contadorInicial.length !== cifra.tamanho) throw new Error(`o contador precisa de ${cifra.tamanho} bytes`);
  const d = bytesDe(dados);
  const passos = [`CTR com ${cifra.nome}, contador inicial ${paraHex(contadorInicial)}, sem preenchimento.`];
  const out: Bytes = [];
  emBlocos(d, cifra.tamanho).forEach((b, i) => {
    const cont = incrementar(contadorInicial, i);
    const fluxo = cifra.cifrar(cont);
    const c = xorBytes(b, fluxo);
    passos.push(`  bloco ${i + 1}: E(${paraHex(cont)}) = ${paraHex(fluxo)}; XOR dá ${paraHex(c)}`);
    out.push(...c);
  });
  passos.push('Nunca repita o contador com a mesma chave: seria a chave única reusada.');
  return fecharModo(out, cifra.tamanho, passos);
}

// ---------------------------------------------------------------------------
// 4. Chave pública: aritmética modular com BigInt
// ---------------------------------------------------------------------------

const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;

export function mdc(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}

export function ehPrimo(n: bigint): boolean {
  if (n < 2n) return false;
  if (n % 2n === 0n) return n === 2n;
  for (let d = 3n; d * d <= n; d += 2n) if (n % d === 0n) return false;
  return true;
}

export interface ResultadoNumero {
  resultado: bigint;
  passos: string[];
}

/** Exponenciação modular por quadrados sucessivos: olha os bits do expoente, um por vez. */
export function expModular(base: bigint, expoente: bigint, modulo: bigint): ResultadoNumero {
  if (modulo <= 0n) throw new Error('o módulo precisa ser positivo');
  if (expoente < 0n) throw new Error('expoente negativo: use o inverso modular');
  const passos = [`Calcular ${base}^${expoente} mod ${modulo}. Expoente em binário: ${expoente.toString(2)}.`];
  let resultado = 1n % modulo;
  let b = mod(base, modulo);
  let e = expoente;
  let i = 0;
  while (e > 0n) {
    if (e & 1n) {
      const antes = resultado;
      resultado = (resultado * b) % modulo;
      passos.push(`  bit ${i} = 1: resultado = ${antes} × ${b} mod ${modulo} = ${resultado}`);
    } else {
      passos.push(`  bit ${i} = 0: resultado continua ${resultado}`);
    }
    e >>= 1n;
    if (e > 0n) {
      const nb = (b * b) % modulo;
      passos.push(`    eleva a base ao quadrado: ${b}² mod ${modulo} = ${nb}`);
      b = nb;
    }
    i++;
  }
  passos.push(`Resultado: ${resultado}. Foram ${i} bits, em vez de ${expoente} multiplicações.`);
  return { resultado, passos };
}

/** Inverso modular pelo algoritmo de Euclides estendido: x tal que a·x ≡ 1 (mod m). */
export function inversoModular(a: bigint, m: bigint): ResultadoNumero {
  const passos = [`Procurar x com ${a}·x ≡ 1 (mod ${m}) pelo Euclides estendido.`];
  let [r0, r1] = [mod(a, m), m];
  let [s0, s1] = [1n, 0n];
  while (r1 !== 0n) {
    const q = r0 / r1;
    passos.push(`  ${r0} = ${q} × ${r1} + ${r0 - q * r1}`);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
  }
  if (r0 !== 1n) throw new Error(`${a} não tem inverso módulo ${m} (mdc = ${r0})`);
  const resultado = mod(s0, m);
  passos.push(`mdc = 1, então o inverso existe: x = ${resultado}. Conferindo: ${a} × ${resultado} mod ${m} = ${mod(a * resultado, m)}.`);
  return { resultado, passos };
}

export interface ChavePublicaRsa { n: bigint; e: bigint }
export interface ChavePrivadaRsa { n: bigint; d: bigint }

export interface ChavesRsa {
  p: bigint; q: bigint; n: bigint; phi: bigint; e: bigint; d: bigint;
  publica: ChavePublicaRsa;
  privada: ChavePrivadaRsa;
  passos: string[];
}

/** Gera o par RSA a partir de dois primos. Se `e` não for coprimo com φ(n), sobe até o próximo ímpar que seja. */
export function gerarChavesRsa(p: bigint, q: bigint, ePreferido = 17n): ChavesRsa {
  if (!ehPrimo(p) || !ehPrimo(q)) throw new Error('p e q precisam ser primos');
  if (p === q) throw new Error('p e q precisam ser diferentes');
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  let e = ePreferido < 3n ? 3n : ePreferido;
  if (e % 2n === 0n) e++;
  const passos = [
    `Primos escolhidos: p = ${p}, q = ${q}.`,
    `n = p × q = ${n} (público).`,
    `φ(n) = (p - 1)(q - 1) = ${p - 1n} × ${q - 1n} = ${phi} (secreto: quem sabe fatorar n sabe φ).`,
  ];
  while (mdc(e, phi) !== 1n) {
    passos.push(`  e = ${e} divide junto com φ(n) (mdc = ${mdc(e, phi)}), tenta o próximo ímpar.`);
    e += 2n;
  }
  if (e >= phi) throw new Error('primos pequenos demais para achar e');
  passos.push(`e = ${e}, com mdc(e, φ(n)) = 1.`);
  const inv = inversoModular(e, phi);
  passos.push(...inv.passos.map((s) => '  ' + s));
  const d = inv.resultado;
  passos.push(`d = ${d}. Chave pública (n = ${n}, e = ${e}); chave privada (n = ${n}, d = ${d}).`);
  return { p, q, n, phi, e, d, publica: { n, e }, privada: { n, d }, passos };
}

export function cifrarRsa(m: bigint, chave: ChavePublicaRsa): ResultadoNumero {
  if (m < 0n || m >= chave.n) throw new Error(`a mensagem precisa estar entre 0 e ${chave.n - 1n}`);
  const r = expModular(m, chave.e, chave.n);
  return { resultado: r.resultado, passos: [`Cifrar: c = m^e mod n = ${m}^${chave.e} mod ${chave.n}.`, ...r.passos] };
}

export function decifrarRsa(c: bigint, chave: ChavePrivadaRsa): ResultadoNumero {
  const r = expModular(c, chave.d, chave.n);
  return { resultado: r.resultado, passos: [`Decifrar: m = c^d mod n = ${c}^${chave.d} mod ${chave.n}.`, ...r.passos] };
}

/** Assinatura RSA crua de um número: s = m^d mod n. */
export function assinarRsa(m: bigint, chave: ChavePrivadaRsa): ResultadoNumero {
  const r = expModular(mod(m, chave.n), chave.d, chave.n);
  return { resultado: r.resultado, passos: [`Assinar: s = m^d mod n com a chave privada.`, ...r.passos] };
}

export function verificarRsa(m: bigint, assinatura: bigint, chave: ChavePublicaRsa): { valida: boolean; passos: string[] } {
  const r = expModular(assinatura, chave.e, chave.n);
  const valida = r.resultado === mod(m, chave.n);
  return {
    valida,
    passos: [`Verificar: s^e mod n = ${r.resultado}; esperado ${mod(m, chave.n)}.`, valida ? 'Confere: só o dono de d produziria isso.' : 'Não confere.'],
  };
}

// ---------------------------------------------------------------------------
// 4. Diffie-Hellman e o homem no meio
// ---------------------------------------------------------------------------

export interface ResultadoDH {
  A: bigint; B: bigint;
  chaveAlice: bigint; chaveBob: bigint;
  passos: string[];
}

export function diffieHellman(p: bigint, g: bigint, a: bigint, b: bigint): ResultadoDH {
  const A = expModular(g, a, p).resultado;
  const B = expModular(g, b, p).resultado;
  const chaveAlice = expModular(B, a, p).resultado;
  const chaveBob = expModular(A, b, p).resultado;
  return {
    A, B, chaveAlice, chaveBob,
    passos: [
      `Públicos: primo p = ${p} e gerador g = ${g}.`,
      `Alice sorteia a = ${a} (secreto) e manda A = g^a mod p = ${A}.`,
      `Bob sorteia b = ${b} (secreto) e manda B = g^b mod p = ${B}.`,
      `Alice calcula B^a mod p = ${chaveAlice}.`,
      `Bob calcula A^b mod p = ${chaveBob}.`,
      `Os dois chegam a g^(ab) mod p sem nunca mandar a chave. Quem só ouviu p, g, A e B precisa resolver o logaritmo discreto.`,
    ],
  };
}

export interface ResultadoHomemNoMeio {
  /** Chave que Alice acha que divide com Bob (na verdade divide com o atacante). */
  chaveAlice: bigint;
  chaveBob: bigint;
  atacanteComAlice: bigint;
  atacanteComBob: bigint;
  passos: string[];
}

/** O atacante intercepta A e B e troca pelo seu próprio M = g^m: fecha uma chave com cada lado. */
export function homemNoMeio(p: bigint, g: bigint, a: bigint, b: bigint, m: bigint): ResultadoHomemNoMeio {
  const A = expModular(g, a, p).resultado;
  const B = expModular(g, b, p).resultado;
  const M = expModular(g, m, p).resultado;
  const chaveAlice = expModular(M, a, p).resultado;
  const chaveBob = expModular(M, b, p).resultado;
  const atacanteComAlice = expModular(A, m, p).resultado;
  const atacanteComBob = expModular(B, m, p).resultado;
  return {
    chaveAlice, chaveBob, atacanteComAlice, atacanteComBob,
    passos: [
      `Alice manda A = ${A}, mas o atacante segura e manda a Bob o seu M = g^${m} mod p = ${M}.`,
      `Bob manda B = ${B}, o atacante segura e manda a Alice o mesmo M = ${M}.`,
      `Alice calcula M^a = ${chaveAlice}; o atacante calcula A^m = ${atacanteComAlice}. Iguais.`,
      `Bob calcula M^b = ${chaveBob}; o atacante calcula B^m = ${atacanteComBob}. Iguais.`,
      'O atacante decifra o que Alice manda, lê, cifra de novo para Bob e ninguém percebe.',
      'Diffie-Hellman sozinho não autentica: é preciso assinar A e B (ou usar certificados).',
    ],
  };
}

// ---------------------------------------------------------------------------
// 5. Resumos: SHA-256 completo
// ---------------------------------------------------------------------------

function primeiros(qtd: number): number[] {
  const out: number[] = [];
  for (let n = 2; out.length < qtd; n++) if (ehPrimo(BigInt(n))) out.push(n);
  return out;
}
const fracao32 = (x: number) => Math.floor((x - Math.floor(x)) * 2 ** 32) >>> 0;

/** Constantes do SHA-256: parte fracionária das raízes cúbicas (K) e quadradas (H) dos primeiros primos. */
export const SHA256_K: readonly number[] = primeiros(64).map((p) => fracao32(Math.cbrt(p)));
export const SHA256_H0: readonly number[] = primeiros(8).map((p) => fracao32(Math.sqrt(p)));

const rotr = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

export function sha256Bytes(entrada: string | Bytes): Bytes {
  const m = bytesDe(entrada);
  const bits = m.length * 8;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  const alto = Math.floor(bits / 2 ** 32);
  m.push(...paraBloco32(alto), ...paraBloco32(bits >>> 0));
  const H = SHA256_H0.slice();
  const w = new Array<number>(64);
  for (let i = 0; i < m.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = deBloco32(m.slice(i + 4 * t, i + 4 * t + 4));
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.flatMap(paraBloco32);
}

/** SHA-256 em hexadecimal. */
export function sha256(entrada: string | Bytes): string {
  return paraHex(sha256Bytes(entrada));
}

/** O SHA-256 com a explicação das etapas (para a aula). */
export function sha256Explicado(entrada: string | Bytes): { resumo: string; passos: string[] } {
  const m = bytesDe(entrada);
  const blocos = Math.ceil((m.length + 9) / 64);
  const resumo = sha256(m);
  return {
    resumo,
    passos: [
      `Entrada com ${m.length} byte(s) (${m.length * 8} bits).`,
      `Preenchimento: acrescenta o bit 1, zeros e o tamanho em 64 bits, até fechar ${blocos} bloco(s) de 512 bits.`,
      'Cada bloco vira 64 palavras de 32 bits, misturadas em 64 rodadas com rotações, XOR, somas e as constantes K.',
      'O estado de 8 palavras começa com H0 e acumula cada bloco (construção de Merkle-Damgård).',
      `Resumo: ${resumo}`,
      'Mudar um único bit da entrada muda cerca de metade dos bits do resumo (efeito avalanche).',
    ],
  };
}

/** HMAC-SHA256: H((K XOR opad) || H((K XOR ipad) || m)). */
export function hmacSha256(chave: string | Bytes, mensagem: string | Bytes): string {
  let k = bytesDe(chave);
  if (k.length > 64) k = sha256Bytes(k);
  while (k.length < 64) k.push(0);
  const interno = sha256Bytes([...k.map((b) => b ^ 0x36), ...bytesDe(mensagem)]);
  return sha256([...k.map((b) => b ^ 0x5c), ...interno]);
}

export function hmacExplicado(chave: string | Bytes, mensagem: string | Bytes): { mac: string; passos: string[] } {
  const mac = hmacSha256(chave, mensagem);
  return {
    mac,
    passos: [
      'A chave é completada com zeros até 64 bytes (ou resumida, se for maior).',
      'Resumo interno: SHA-256((chave XOR 0x36...) seguido da mensagem).',
      'Resumo externo: SHA-256((chave XOR 0x5c...) seguido do resumo interno).',
      `HMAC: ${mac}`,
      'Quem não tem a chave não consegue calcular, e o formato com dois resumos fecha o ataque de extensão de tamanho.',
    ],
  };
}

export function verificarHmac(chave: string | Bytes, mensagem: string | Bytes, mac: string): boolean {
  const certo = hmacSha256(chave, mensagem);
  // comparação em tempo constante: não para no primeiro caractere diferente
  let dif = certo.length ^ mac.length;
  for (let i = 0; i < certo.length; i++) dif |= certo.charCodeAt(i) ^ (mac.charCodeAt(i) || 0);
  return dif === 0;
}

// ---------------------------------------------------------------------------
// 5. Resumo de brinquedo e ataque do aniversário
// ---------------------------------------------------------------------------

/** Resumo de brinquedo: FNV-1a de 32 bits dobrado para `bits` bits (16 por padrão). Fácil de colidir. */
export function resumoBrinquedo(entrada: string | Bytes, bits = 16): number {
  if (bits < 1 || bits > 31) throw new Error('use entre 1 e 31 bits');
  let h = 0x811c9dc5;
  for (const b of bytesDe(entrada)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  const mascara = (1 << bits) - 1;
  return ((h >>> bits) ^ h) & mascara;
}

export interface ProbabilidadeAniversario {
  exata: number;
  aproximada: number;
  /** Quantos valores dão 50% de chance de colisão: cerca de 1,1774 × √n. */
  meioAMeio: number;
  passos: string[];
}

/** Chance de pelo menos uma colisão sorteando k valores num espaço de n. */
export function probabilidadeAniversario(k: number, n: number): ProbabilidadeAniversario {
  let semColisao = 1;
  for (let i = 1; i < k; i++) semColisao *= 1 - i / n;
  const exata = k > n ? 1 : 1 - Math.max(0, semColisao);
  const aproximada = 1 - Math.exp(-(k * (k - 1)) / (2 * n));
  const meioAMeio = Math.sqrt(2 * n * Math.LN2);
  return {
    exata, aproximada, meioAMeio,
    passos: [
      `Sem colisão: (1 - 1/n)(1 - 2/n)...(1 - (k-1)/n) com k = ${k} e n = ${n}.`,
      `Chance de colisão: ${(100 * exata).toFixed(2)}%.`,
      `Aproximação 1 - e^(-k(k-1)/2n) = ${(100 * aproximada).toFixed(2)}%.`,
      `Com cerca de √(2n ln 2) ≈ ${meioAMeio.toFixed(1)} valores a chance já passa de 50%.`,
      n === 365 ? 'No caso clássico, 23 pessoas bastam para dois aniversários coincidirem.' : `Um resumo de b bits resiste só a cerca de 2^(b/2) tentativas, não 2^b.`,
    ],
  };
}

export interface ColisaoEncontrada {
  mensagemA: string;
  mensagemB: string;
  resumo: number;
  tentativas: number;
  raizN: number;
  passos: string[];
}

/** Busca real de colisão: gera mensagens até duas darem o mesmo resumo de brinquedo. */
export function buscarColisao(bits = 16, prefixo = 'mensagem ', limite = 1 << 22): ColisaoEncontrada {
  const vistos = new Map<number, string>();
  const raizN = Math.sqrt(2 ** bits);
  for (let i = 0; i < limite; i++) {
    const msg = `${prefixo}${i}`;
    const r = resumoBrinquedo(msg, bits);
    const outra = vistos.get(r);
    if (outra !== undefined) {
      const tentativas = i + 1;
      return {
        mensagemA: outra, mensagemB: msg, resumo: r, tentativas, raizN,
        passos: [
          `Espaço de n = 2^${bits} = ${2 ** bits} resumos possíveis; √n = ${raizN.toFixed(0)}.`,
          'Gera mensagens em sequência e guarda o resumo de cada uma numa tabela.',
          `Na tentativa ${tentativas}, "${msg}" deu ${r.toString(16).padStart(Math.ceil(bits / 4), '0')}, o mesmo resumo de "${outra}".`,
          `Foram ${tentativas} tentativas, ${(tentativas / raizN).toFixed(2)} × √n. Achar uma mensagem com um resumo dado levaria cerca de n = ${2 ** bits}.`,
        ],
      };
    }
    vistos.set(r, msg);
  }
  throw new Error('nenhuma colisão dentro do limite');
}

// ---------------------------------------------------------------------------
// 5. Assinatura digital: resumir e assinar com RSA de brinquedo
// ---------------------------------------------------------------------------

/** O SHA-256 da mensagem reduzido módulo n, para caber no RSA pequeno. */
export function resumoParaRsa(mensagem: string, n: bigint): bigint {
  return BigInt('0x' + sha256(mensagem)) % n;
}

export function assinarMensagem(mensagem: string, chave: ChavePrivadaRsa): { assinatura: bigint; resumo: bigint; passos: string[] } {
  const resumo = resumoParaRsa(mensagem, chave.n);
  const s = assinarRsa(resumo, chave);
  return {
    assinatura: s.resultado, resumo,
    passos: [
      `Resume a mensagem com SHA-256: ${sha256(mensagem).slice(0, 16)}...`,
      `Reduz módulo n = ${chave.n} (só porque o RSA aqui é de brinquedo): h = ${resumo}.`,
      `Assina o resumo com a chave privada: s = h^d mod n = ${s.resultado}.`,
      'Assinar o resumo, e não a mensagem, deixa a conta pequena e a assinatura curta.',
    ],
  };
}

export function verificarAssinatura(mensagem: string, assinatura: bigint, chave: ChavePublicaRsa): { valida: boolean; passos: string[] } {
  const h = resumoParaRsa(mensagem, chave.n);
  const v = expModular(assinatura, chave.e, chave.n).resultado;
  const valida = v === h;
  return {
    valida,
    passos: [
      `Resume a mensagem recebida: h = ${h}.`,
      `Abre a assinatura com a chave pública: s^e mod n = ${v}.`,
      valida ? 'Iguais: a mensagem é íntegra e veio de quem tem a chave privada.' : 'Diferentes: mensagem alterada ou assinatura de outra pessoa.',
    ],
  };
}

// ---------------------------------------------------------------------------
// 6. Certificados e cadeia de confiança
// ---------------------------------------------------------------------------

export interface Certificado {
  serie: number;
  sujeito: string;
  emissor: string;
  chavePublica: ChavePublicaRsa;
  validoDe: number; // dia
  validoAte: number; // dia
  ehAC: boolean; // autoridade certificadora: pode assinar outros certificados
  assinatura: bigint;
}

export type DadosCertificado = Omit<Certificado, 'assinatura'>;

/** O que o emissor assina: todos os campos, menos a própria assinatura. */
export function conteudoDoCertificado(c: DadosCertificado): string {
  return [c.serie, c.sujeito, c.emissor, c.chavePublica.n, c.chavePublica.e, c.validoDe, c.validoAte, c.ehAC ? 'AC' : 'final'].join('|');
}

export function emitirCertificado(dados: DadosCertificado, chaveDoEmissor: ChavePrivadaRsa): Certificado {
  return { ...dados, assinatura: assinarMensagem(conteudoDoCertificado(dados), chaveDoEmissor).assinatura };
}

export type MotivoFalhaCadeia =
  | 'assinatura' | 'vencido' | 'nome' | 'raiz-desconhecida' | 'revogado' | 'emissor' | 'nao-e-ac' | 'vazia';

export interface OpcoesCadeia {
  nomeEsperado: string;
  agora: number; // dia
  raizesConfiaveis: Certificado[];
  revogados?: { emissor: string; serie: number }[];
}

export interface ResultadoCadeia {
  valida: boolean;
  motivo?: MotivoFalhaCadeia;
  /** Índice do certificado que falhou (0 é a folha). */
  emQual?: number;
  passos: string[];
}

/** Verifica a cadeia da folha até a raiz. `cadeia[0]` é a folha, o último é a raiz. */
export function verificarCadeia(cadeia: Certificado[], opcoes: OpcoesCadeia): ResultadoCadeia {
  const passos: string[] = [];
  const falha = (motivo: MotivoFalhaCadeia, emQual: number | undefined, texto: string): ResultadoCadeia => {
    passos.push(`FALHA: ${texto}`);
    return { valida: false, motivo, emQual, passos };
  };
  if (!cadeia.length) return falha('vazia', undefined, 'nenhum certificado recebido.');
  const folha = cadeia[0];
  passos.push(`1. Nome: o servidor diz ser "${folha.sujeito}", o navegador esperava "${opcoes.nomeEsperado}".`);
  if (folha.sujeito !== opcoes.nomeEsperado) return falha('nome', 0, 'o nome do certificado não confere com o endereço visitado.');

  for (let i = 0; i < cadeia.length; i++) {
    const c = cadeia[i];
    const ultimo = i === cadeia.length - 1;
    const pai = ultimo ? c : cadeia[i + 1];
    passos.push(`${i + 2}. Certificado "${c.sujeito}" (série ${c.serie}), emitido por "${c.emissor}".`);
    if (opcoes.agora < c.validoDe || opcoes.agora > c.validoAte) {
      return falha('vencido', i, `"${c.sujeito}" vale do dia ${c.validoDe} ao ${c.validoAte}, e hoje é dia ${opcoes.agora}.`);
    }
    passos.push(`   Validade: do dia ${c.validoDe} ao ${c.validoAte}, hoje é ${opcoes.agora}. Ok.`);
    if (opcoes.revogados?.some((r) => r.emissor === c.emissor && r.serie === c.serie)) {
      return falha('revogado', i, `"${c.sujeito}" (série ${c.serie}) está na lista de revogados de "${c.emissor}".`);
    }
    passos.push('   Não consta na lista de revogados.');
    if (c.emissor !== pai.sujeito) {
      return falha('emissor', i, `"${c.sujeito}" diz ter sido emitido por "${c.emissor}", mas o próximo da cadeia é "${pai.sujeito}".`);
    }
    if (i > 0 && !c.ehAC) return falha('nao-e-ac', i, `"${c.sujeito}" não é autoridade certificadora e não pode assinar outros certificados.`);
    const v = verificarAssinatura(conteudoDoCertificado(c), c.assinatura, pai.chavePublica);
    if (!v.valida) return falha('assinatura', i, `a assinatura de "${c.sujeito}" não bate com a chave pública de "${pai.sujeito}".`);
    passos.push(`   Assinatura conferida com a chave pública de "${pai.sujeito}"${ultimo ? ' (a raiz assina a si mesma)' : ''}.`);
  }

  const raiz = cadeia[cadeia.length - 1];
  const conhecida = opcoes.raizesConfiaveis.some(
    (r) => r.sujeito === raiz.sujeito && r.chavePublica.n === raiz.chavePublica.n && r.chavePublica.e === raiz.chavePublica.e,
  );
  passos.push(`${cadeia.length + 2}. A raiz "${raiz.sujeito}" está no repositório de raízes confiáveis?`);
  if (!conhecida) return falha('raiz-desconhecida', cadeia.length - 1, `a raiz "${raiz.sujeito}" não está entre as confiáveis (autoassinada por qualquer um).`);
  passos.push('   Está. Cadeia válida: a confiança desce da raiz até a folha.');
  return { valida: true, passos };
}

// ---------------------------------------------------------------------------
// 7. Autenticação: desafio e resposta, e o ataque de reflexão
// ---------------------------------------------------------------------------

/** Resposta ao desafio: HMAC da chave secreta sobre o desafio (truncado para caber na tela). */
export function responderDesafio(chave: string, desafio: string, contexto = ''): string {
  return hmacSha256(chave, contexto + desafio).slice(0, 16);
}

export function desafioResposta(chaveDoCliente: string, chaveDoServidor: string, desafio: string): { aceito: boolean; passos: string[] } {
  const resposta = responderDesafio(chaveDoCliente, desafio);
  const esperada = responderDesafio(chaveDoServidor, desafio);
  const aceito = resposta === esperada;
  return {
    aceito,
    passos: [
      'Alice diz ao servidor: sou Alice.',
      `Servidor manda um desafio aleatório, usado uma vez só: ${desafio}.`,
      `Alice devolve HMAC(chave, desafio) = ${resposta}. A chave nunca passa pela rede.`,
      `Servidor calcula o mesmo com a chave que guarda: ${esperada}.`,
      aceito ? 'Iguais: Alice provou que conhece a chave.' : 'Diferentes: quem respondeu não conhece a chave.',
    ],
  };
}

export interface ResultadoReflexao {
  sucesso: boolean;
  passos: string[];
}

/**
 * Ataque de reflexão no protocolo ingênuo de autenticação mútua (os dois lados usam a mesma chave
 * e a mesma conta). O atacante abre uma segunda sessão e faz Bob responder o próprio desafio.
 * Com `protegido`, a resposta inclui quem responde ("A" ou "B"), e o reflexo não serve.
 */
export function ataqueReflexao(chaveCompartilhada: string, protegido = false, desafioAtacante = 'RT-7731', desafioBob = 'RB-4096'): ResultadoReflexao {
  const ctx = (quem: 'A' | 'B') => (protegido ? `${quem}|` : '');
  const passos = [protegido
    ? 'Protocolo corrigido: cada lado inclui a própria identidade na conta, HMAC(K, identidade + desafio).'
    : 'Protocolo ingênuo: quem inicia manda um desafio, o outro responde HMAC(K, desafio) e manda o seu.'];
  passos.push(`Sessão 1: atacante diz "sou Alice" e manda o desafio ${desafioAtacante}.`);
  const respBob1 = responderDesafio(chaveCompartilhada, desafioAtacante, ctx('B'));
  passos.push(`Sessão 1: Bob responde ${respBob1} e desafia "Alice" com ${desafioBob}. O atacante não sabe responder.`);
  passos.push(`Sessão 2: atacante abre outra conexão, diz "sou Alice" de novo e manda como desafio o ${desafioBob} do próprio Bob.`);
  const respBob2 = responderDesafio(chaveCompartilhada, desafioBob, ctx('B'));
  passos.push(`Sessão 2: Bob, prestativo, responde ${respBob2}.`);
  const esperada = responderDesafio(chaveCompartilhada, desafioBob, ctx('A'));
  passos.push(`Sessão 1: atacante devolve ${respBob2}; Bob esperava ${esperada}.`);
  const sucesso = respBob2 === esperada;
  passos.push(sucesso
    ? 'Bob aceita: o atacante entrou como Alice sem saber a chave. A resposta de Bob serviu como resposta de Alice.'
    : 'Bob recusa: a resposta dele carrega "B" e a de Alice teria de carregar "A". O reflexo não serve.');
  if (!protegido) passos.push('Correções: identidade na conta, chaves diferentes por sentido, ou quem inicia prova primeiro.');
  return { sucesso, passos };
}

// ---------------------------------------------------------------------------
// 7. Kerberos simplificado
// ---------------------------------------------------------------------------

/** Chave de 16 bytes derivada de uma senha (no Kerberos real é uma função de derivação com sal). */
export function chaveDeSenha(senha: string): Bytes {
  return sha256Bytes('kerberos|' + senha).slice(0, 16);
}

const NONCE_KRB: Bytes = new Array(16).fill(0);

function selar(chave: Bytes, conteudo: object): Bytes {
  return ctr(cifraAes(chave), JSON.stringify({ ok: 'krb', ...conteudo }), NONCE_KRB).resultado;
}

function abrir(chave: Bytes, selado: Bytes): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(bytesParaTexto(ctr(cifraAes(chave), selado, NONCE_KRB).resultado));
    return obj && obj.ok === 'krb' ? obj : null;
  } catch {
    return null;
  }
}

export interface EtapaKerberos {
  numero: number;
  nome: 'AS-REQ' | 'AS-REP' | 'TGS-REQ' | 'TGS-REP' | 'AP-REQ' | 'AP-REP';
  de: string;
  para: string;
  descricao: string;
}

export interface CenarioKerberos {
  usuario: string;
  senhaDigitada: string;
  senhaCadastrada: string;
  servico: string;
  agora: number; // minutos
  validadeBilhete?: number; // minutos
  semente?: string; // para as chaves de sessão saírem sempre iguais
}

export interface ResultadoKerberos {
  sucesso: boolean;
  falha?: string;
  etapas: EtapaKerberos[];
  passos: string[];
}

/**
 * Kerberos em seis mensagens: o servidor de autenticação (AS) entrega o bilhete de concessão (TGT),
 * o servidor de concessão (TGS) troca o TGT por um bilhete de serviço, e o serviço aceita o usuário.
 * Tudo cifrado de verdade com AES-128 em modo CTR, só que com um nonce fixo para ficar reprodutível.
 */
export function simularKerberos(c: CenarioKerberos): ResultadoKerberos {
  const semente = c.semente ?? 'camada8';
  const validade = c.validadeBilhete ?? 480;
  const kUsuario = chaveDeSenha(c.senhaCadastrada);
  const kTgs = chaveDeSenha('segredo do TGS|' + semente);
  const kServico = chaveDeSenha('segredo do serviço ' + c.servico + '|' + semente);
  const kSessaoTgs = sha256Bytes('sessão TGS|' + semente + '|' + c.agora).slice(0, 16);
  const kSessaoServico = sha256Bytes('sessão serviço|' + semente + '|' + c.agora).slice(0, 16);
  const etapas: EtapaKerberos[] = [];
  const passos: string[] = [];
  const registrar = (nome: EtapaKerberos['nome'], de: string, para: string, descricao: string) => {
    etapas.push({ numero: etapas.length + 1, nome, de, para, descricao });
    passos.push(`${etapas.length}. ${nome} (${de} → ${para}): ${descricao}`);
  };
  const falhar = (falha: string): ResultadoKerberos => { passos.push(`FALHA: ${falha}`); return { sucesso: false, falha, etapas, passos }; };

  // 1 e 2: servidor de autenticação
  registrar('AS-REQ', c.usuario, 'AS', `"sou ${c.usuario} e quero um bilhete de concessão". A senha não viaja.`);
  const tgt = selar(kTgs, { usuario: c.usuario, chaveSessao: paraHex(kSessaoTgs), expira: c.agora + validade });
  const parteDoUsuario = selar(kUsuario, { chaveSessao: paraHex(kSessaoTgs), expira: c.agora + validade });
  registrar('AS-REP', 'AS', c.usuario,
    `chave de sessão com o TGS cifrada com a chave da senha de ${c.usuario}, e o TGT (${paraHex(tgt).slice(0, 16)}...) cifrado com a chave do TGS, que o usuário não consegue abrir.`);
  const abertaPeloUsuario = abrir(chaveDeSenha(c.senhaDigitada), parteDoUsuario);
  if (!abertaPeloUsuario) return falhar('senha errada: a resposta do AS não abre, e nenhuma senha passou pela rede.');
  passos.push('   A estação abre a resposta com a senha digitada e já pode esquecê-la: daqui em diante usa a chave de sessão.');

  // 3 e 4: servidor de concessão
  const kSessaoTgsCliente = deHex(String(abertaPeloUsuario.chaveSessao));
  const autenticador1 = selar(kSessaoTgsCliente, { usuario: c.usuario, hora: c.agora });
  registrar('TGS-REQ', c.usuario, 'TGS', `TGT, nome do serviço "${c.servico}" e um autenticador (nome e hora) cifrado com a chave de sessão.`);
  const tgtAberto = abrir(kTgs, tgt);
  if (!tgtAberto) return falhar('o TGS não conseguiu abrir o TGT.');
  if (c.agora > Number(tgtAberto.expira)) return falhar('bilhete de concessão vencido: é preciso autenticar de novo.');
  const aut1 = abrir(deHex(String(tgtAberto.chaveSessao)), autenticador1);
  if (!aut1 || aut1.usuario !== tgtAberto.usuario) return falhar('o autenticador não confere com o TGT.');
  const bilheteServico = selar(kServico, { usuario: c.usuario, chaveSessao: paraHex(kSessaoServico), expira: c.agora + validade });
  const parteSessaoServico = selar(kSessaoTgs, { chaveSessao: paraHex(kSessaoServico) });
  registrar('TGS-REP', 'TGS', c.usuario, `bilhete de serviço cifrado com a chave de "${c.servico}" e a nova chave de sessão cifrada com a chave de sessão do TGS.`);
  const sessaoServico = abrir(kSessaoTgsCliente, parteSessaoServico);
  if (!sessaoServico) return falhar('a estação não abriu a resposta do TGS.');

  // 5 e 6: o serviço
  const kSessaoServicoCliente = deHex(String(sessaoServico.chaveSessao));
  const autenticador2 = selar(kSessaoServicoCliente, { usuario: c.usuario, hora: c.agora });
  registrar('AP-REQ', c.usuario, c.servico, 'bilhete de serviço e um autenticador novo, cifrado com a chave de sessão do serviço.');
  const bilheteAberto = abrir(kServico, bilheteServico);
  if (!bilheteAberto) return falhar('o serviço não abriu o bilhete.');
  const aut2 = abrir(deHex(String(bilheteAberto.chaveSessao)), autenticador2);
  if (!aut2 || aut2.usuario !== bilheteAberto.usuario) return falhar('o autenticador não confere com o bilhete de serviço.');
  const resposta = selar(deHex(String(bilheteAberto.chaveSessao)), { hora: Number(aut2.hora) + 1 });
  registrar('AP-REP', c.servico, c.usuario, 'devolve a hora do autenticador mais um, cifrada: prova que o serviço também é legítimo (autenticação mútua).');
  const confirmacao = abrir(kSessaoServicoCliente, resposta);
  if (!confirmacao || Number(confirmacao.hora) !== c.agora + 1) return falhar('o serviço não provou a própria identidade.');
  passos.push(`Acesso liberado a "${c.servico}". A senha só foi usada na estação, e o TGT vale por ${validade} minutos para outros serviços.`);
  return { sucesso: true, etapas, passos };
}
