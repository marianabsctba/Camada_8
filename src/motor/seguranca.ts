// Segurança aplicada no mundo do jogo (ato 7), parte que não é console: autoridades certificadoras de mentira com
// chaves RSA de 2048 bits, TLS 1.3 (X25519, cadeia de certificados, CertificateVerify com RSA-PSS, a escala de
// chaves do HKDF e registros em AES-128-GCM), o que um farejador enxerga do tráfego, Wi-Fi com WPA2 (PBKDF2 de 4096
// iterações, aperto de mão de 4 vias, CCMP) e WPA3, PGP, DNSSEC, o ESP do IPsec (AES-GCM, RFC 4106) e o circuito
// em cebola. Toda a criptografia vem de cripto.ts. Os ataques são simulados: só existem dentro deste mundo e servem
// para ensinar a defesa.

import { caboNaPorta, type Equipamento, type Mundo } from './mundo';
import {
  aesCcmCifrar,
  aesCcmDecifrar,
  aesGcmCifrar,
  aesGcmDecifrar,
  assinarMensagem,
  assinarPkcs1,
  assinarPss,
  bytesParaTexto,
  cifrarRsaPkcs1,
  conteudoDoCertificado,
  decifrarRsaPkcs1,
  deHex,
  derivarSegredo,
  emitirCertificado,
  expandirRotulo,
  hexCurto,
  hkdfExpandir,
  hkdfExtrair,
  hmacSha1,
  hmacSha256Bytes,
  iguaisTempoConstante,
  inteiroParaBytes,
  parX25519,
  paraHex,
  pbkdf2HmacSha1,
  prf80211,
  sha256,
  sha256Bytes,
  textoParaBytes,
  verificarAssinatura,
  verificarCadeia,
  verificarPkcs1,
  verificarPss,
  x25519,
  xorBytes,
  type Bytes,
  type Certificado,
  type ChavesRsa,
  type ResultadoCadeia,
} from './cripto';
import { chavesFixas } from './chavesRsa';
import { base64Codificar, base64Decodificar, bytesParaTexto as bytesTexto } from './aplicacao';
import { SOBRA_ESP, type TunelVpn } from './filtro';

/** n bytes sorteados pelo gerador do mundo (semeado: o mesmo dia dá os mesmos números). */
export function bytesDoMundo(m: Mundo, n: number): Bytes {
  return Array.from({ length: n }, () => Math.floor(m.rng() * 256) & 0xff);
}

/* ---------- Relógio e dia do mundo ---------- */

/** Dia de hoje no mundo, para a validade dos certificados (padrão 200). */
export function diaDoMundo(m: Mundo): number {
  return (m.flags.dia as number | undefined) ?? 200;
}

/** Relógio da camada de aplicação em segundos (TTL do DNS, cache HTTP). Anda com "esperar". */
export function relogio(m: Mundo): number {
  return (m.flags.relogio as number | undefined) ?? 0;
}

export function avancarRelogio(m: Mundo, s: number): number {
  m.flags.relogio = relogio(m) + s;
  return m.flags.relogio as number;
}

/* ---------- Autoridades certificadoras ---------- */

export const RAIZ = 'AC Raiz Exemplo';
export const INTERMEDIARIA = 'AC Intermediária Exemplo';

interface Pki {
  raiz: { chaves: ChavesRsa; cert: Certificado };
  inter: { chaves: ChavesRsa; cert: Certificado };
  servidor: ChavesRsa;
  /** Par de quem se passa pelo servidor (atacante com certificado próprio). */
  impostor: ChavesRsa;
}

let pkiCache: Pki | null = null;

/**
 * Raiz e intermediária fixas, com RSA de 2048 bits e e = 65537 (as chaves de chavesRsa.ts), e os certificados
 * assinados com sha256WithRSAEncryption (PKCS#1 v1.5). A raiz está no repositório de todo navegador do jogo.
 */
export function pki(): Pki {
  if (pkiCache) return pkiCache;
  const raiz = chavesFixas('raiz');
  const inter = chavesFixas('intermediaria');
  const servidor = chavesFixas('servidor');
  const impostor = chavesFixas('impostor');
  const cRaiz = emitirCertificado({ serie: 1, sujeito: RAIZ, emissor: RAIZ, chavePublica: raiz.publica, validoDe: 1, validoAte: 3650, ehAC: true }, raiz.privada);
  const cInter = emitirCertificado({ serie: 2, sujeito: INTERMEDIARIA, emissor: RAIZ, chavePublica: inter.publica, validoDe: 1, validoAte: 1825, ehAC: true }, raiz.privada);
  pkiCache = { raiz: { chaves: raiz, cert: cRaiz }, inter: { chaves: inter, cert: cInter }, servidor, impostor };
  return pkiCache;
}

export type TipoCertificado = 'valido' | 'vencido' | 'autoassinado' | 'nome-errado' | 'revogado';
export const TIPOS_CERTIFICADO: TipoCertificado[] = ['valido', 'vencido', 'autoassinado', 'nome-errado', 'revogado'];

/** Cadeia que o servidor apresenta: folha, intermediária e raiz (ou só a folha, se autoassinada). */
export function cadeiaDoServidor(nome: string, tipo: TipoCertificado, hoje: number): Certificado[] {
  const k = pki();
  const sujeito = tipo === 'nome-errado' ? `outro.${nome.replace(/\.$/, '')}` : nome.replace(/\.$/, '');
  const validoAte = tipo === 'vencido' ? hoje - 3 : hoje + 365;
  const serie = 1000 + (parseInt(sha256(sujeito).slice(0, 4), 16) % 9000);
  if (tipo === 'autoassinado') {
    const folha = emitirCertificado({ serie, sujeito, emissor: sujeito, chavePublica: k.impostor.publica, validoDe: hoje - 30, validoAte, ehAC: false }, k.impostor.privada);
    return [folha];
  }
  const folha = emitirCertificado({ serie, sujeito, emissor: INTERMEDIARIA, chavePublica: k.servidor.publica, validoDe: hoje - 30, validoAte, ehAC: false }, k.inter.chaves.privada);
  return [folha, k.inter.cert, k.raiz.cert];
}

export function conferirCadeia(nome: string, cadeia: Certificado[], hoje: number, revogar = false): ResultadoCadeia {
  return verificarCadeia(cadeia, {
    nomeEsperado: nome.replace(/\.$/, ''),
    agora: hoje,
    raizesConfiaveis: [pki().raiz.cert],
    revogados: revogar ? [{ emissor: cadeia[0]!.emissor, serie: cadeia[0]!.serie }] : [],
  });
}

export const MOTIVOS_CERTIFICADO: Record<string, string> = {
  nome: 'o certificado é de outro nome',
  vencido: 'o certificado está vencido',
  'raiz-desconhecida': 'o certificado foi assinado por alguém em quem o navegador não confia (autoassinado)',
  revogado: 'o certificado foi revogado pela autoridade que o emitiu',
  assinatura: 'a assinatura do certificado não confere',
  emissor: 'a cadeia está quebrada',
  'nao-e-ac': 'quem assinou não é autoridade certificadora',
  vazia: 'o servidor não mandou certificado',
};

/* ---------- TLS 1.3 (RFC 8446) ---------- */

/** A suíte e o grupo que o jogo negocia: os obrigatórios do TLS 1.3 (RFC 8446, 9.1). */
export const SUITE_TLS = 'TLS_AES_128_GCM_SHA256';
export const GRUPO_TLS = 'x25519';

export interface ApertoTls {
  ok: boolean;
  motivo?: string;
  /** client_application_traffic_secret_0: as chaves dos registros saem dele (RFC 8446, 7.3). */
  chave: Bytes;
  linhas: string[];
  cadeia: ResultadoCadeia;
  certificado: { sujeito: string; emissor: string; validoAte: number; serie: number };
  /** As duas metades públicas do X25519, em hexadecimal. */
  dh: { A: string; B: string };
}

/**
 * O aperto de mão completo de 1 RTT. ClientHello com a metade X25519 do cliente, ServerHello com a do servidor; os
 * dois calculam o mesmo segredo e passam pela escala de chaves (HKDF-Extract e Derive-Secret, RFC 8446, 7.1). O
 * servidor manda o certificado e o CertificateVerify: assinatura RSA-PSS com SHA-256 sobre 64 espaços, o rótulo do
 * contexto, um zero e o resumo do transcrito (4.4.3). O Finished é um HMAC do transcrito com a chave de terminar
 * (4.4.4). Aproximação declarada: as mensagens do transcrito são texto, não a codificação binária da RFC.
 */
export function apertoTls(m: Mundo, nome: string, tipo: TipoCertificado): ApertoTls {
  const hoje = diaDoMundo(m);
  const sni = nome.replace(/\.$/, '');
  const cliente = parX25519(bytesDoMundo(m, 32));
  const servidor = parX25519(bytesDoMundo(m, 32));
  const rc = bytesDoMundo(m, 32);
  const rs = bytesDoMundo(m, 32);
  const cadeia = cadeiaDoServidor(nome, tipo, hoje);
  const folha = cadeia[0]!;
  const v = conferirCadeia(nome, cadeia, hoje, tipo === 'revogado');
  const ch = textoParaBytes(`ClientHello|${paraHex(rc)}|sni ${sni}|${GRUPO_TLS} ${paraHex(cliente.publica)}|${SUITE_TLS}`);
  const sh = textoParaBytes(`ServerHello|${paraHex(rs)}|${GRUPO_TLS} ${paraHex(servidor.publica)}|${SUITE_TLS}`);
  const certMsg = textoParaBytes(`Certificate|${cadeia.map(conteudoDoCertificado).join('||')}`);
  const zero32 = new Array<number>(32).fill(0);
  // escala de chaves: cada lado com o segredo que calculou
  const escala = (compartilhado: Bytes) => {
    const inicial = hkdfExtrair([], zero32);
    const doAperto = hkdfExtrair(derivarSegredo(inicial, 'derived', []), compartilhado);
    const sHs = derivarSegredo(doAperto, 's hs traffic', [...ch, ...sh]);
    const mestre = hkdfExtrair(derivarSegredo(doAperto, 'derived', []), zero32);
    return { sHs, mestre };
  };
  const segCliente = x25519(cliente.privada, servidor.publica);
  const segServidor = x25519(servidor.privada, cliente.publica);
  const ladoC = escala(segCliente);
  const ladoS = escala(segServidor);
  // CertificateVerify: o servidor (ou o impostor, com o próprio par) assina; o navegador confere com a chave da folha
  const k = pki();
  const priv = tipo === 'autoassinado' ? k.impostor.privada : k.servidor.privada;
  const conteudoCv = [...new Array<number>(64).fill(0x20), ...textoParaBytes('TLS 1.3, server CertificateVerify'), 0, ...sha256Bytes([...ch, ...sh, ...certMsg])];
  const cv = assinarPss(conteudoCv, priv, bytesDoMundo(m, 32));
  const cvOk = verificarPss(conteudoCv, cv, folha.chavePublica);
  const cvMsg = textoParaBytes(`CertificateVerify|rsa_pss_rsae_sha256|${paraHex(cv)}`);
  const transcritoFin = sha256Bytes([...ch, ...sh, ...certMsg, ...cvMsg]);
  const finServidor = hmacSha256Bytes(expandirRotulo(ladoS.sHs, 'finished', [], 32), transcritoFin);
  const finEsperado = hmacSha256Bytes(expandirRotulo(ladoC.sHs, 'finished', [], 32), transcritoFin);
  const finOk = iguaisTempoConstante(finServidor, finEsperado);
  const transcritoAp = [...ch, ...sh, ...certMsg, ...cvMsg, ...textoParaBytes(`Finished|${paraHex(finServidor)}`)];
  const chave = derivarSegredo(ladoC.mestre, 'c ap traffic', transcritoAp);
  // prova de integridade do registro: um byte trocado no fio derruba a etiqueta do GCM
  const amostra = cifrarRegistro(chave, 'teste');
  const adulterado = deHex(amostra);
  adulterado[8] ^= 0x01;
  const adulteradoAbre = abrirRegistro(chave, paraHex(adulterado)).ok;
  const linhas = [
    `TLS 1.3 com ${sni}:`,
    `  ClientHello: versão 1.3, aleatório ${paraHex(rc).slice(0, 16)}..., SNI "${sni}" (vai em claro), suíte ${SUITE_TLS}, metade X25519 do cliente ${hexCurto(cliente.publica, 8)}`,
    `  ServerHello: aleatório ${paraHex(rs).slice(0, 16)}..., metade X25519 do servidor ${hexCurto(servidor.publica, 8)}. Daqui em diante tudo vai cifrado.`,
    `  X25519 (RFC 7748): cada lado multiplica a metade do outro pelo próprio segredo e chega a ${iguaisTempoConstante(segCliente, segServidor) ? 'o mesmo número' : 'números DIFERENTES'} de 32 bytes, que nunca passou pelo fio. A escala de chaves do HKDF tira dele as chaves do aperto de mão e as do tráfego.`,
    `  Certificate: "${folha.sujeito}", emitido por "${folha.emissor}", válido até o dia ${folha.validoAte} (hoje é ${hoje}), chave RSA de 2048 bits`,
    ...v.passos.map((x) => '    ' + x),
    `  CertificateVerify: o servidor assina o resumo do aperto de mão com RSA-PSS e a chave privada; o navegador confere com a chave pública do certificado: ${cvOk ? 'confere' : 'não confere'}`,
    `  Finished: HMAC do transcrito com a chave de terminar, ${hexCurto(finServidor, 8)}; o navegador calcula o mesmo: ${finOk ? 'bate, ninguém mexeu no meio' : 'NÃO bate'}.`,
    `  Registros de aplicação em AES-128-GCM, com o cabeçalho do registro (17 03 03 e o tamanho) como dado adicional e nonce = IV XOR número do registro. Um byte trocado no fio: ${adulteradoAbre ? 'passou (!)' : 'a etiqueta não confere e o registro é descartado (alerta bad_record_mac)'}.`,
  ];
  const ok = v.valida && cvOk && finOk;
  return {
    ok,
    motivo: ok ? undefined : MOTIVOS_CERTIFICADO[v.motivo ?? 'assinatura'] ?? 'certificado inválido',
    chave,
    linhas,
    cadeia: v,
    certificado: { sujeito: folha.sujeito, emissor: folha.emissor, validoAte: folha.validoAte, serie: folha.serie },
    dh: { A: paraHex(cliente.publica), B: paraHex(servidor.publica) },
  };
}

/** Chave e IV do registro a partir do segredo de tráfego (RFC 8446, 7.3), e o nonce do registro número `seq` (5.3). */
function chavesDoRegistro(segredo: Bytes, seq: number): { chave: Bytes; nonce: Bytes } {
  const chave = expandirRotulo(segredo, 'key', [], 16);
  const iv = expandirRotulo(segredo, 'iv', [], 12);
  return { chave, nonce: xorBytes(iv, inteiroParaBytes(BigInt(seq), 12)) };
}

/**
 * Registro TLS 1.3 de dados (RFC 8446, 5.2): o texto ganha o tipo de conteúdo (23, application_data) no fim, vai
 * cifrado em AES-128-GCM e sai atrás do cabeçalho 17 03 03 e do tamanho, que entra como dado adicional. Devolve o
 * registro inteiro em hexadecimal: cabeçalho, cifrado e etiqueta.
 */
export function cifrarRegistro(segredo: Bytes, texto: string, seq = 0): string {
  const interno = [...textoParaBytes(texto), 23];
  const tamanho = interno.length + 16;
  const cabecalho = [23, 3, 3, (tamanho >> 8) & 0xff, tamanho & 0xff];
  const { chave, nonce } = chavesDoRegistro(segredo, seq);
  const r = aesGcmCifrar(chave, nonce, interno, cabecalho);
  return paraHex([...cabecalho, ...r.cifrado, ...r.tag]);
}

/** Abre o registro: confere a etiqueta (com o cabeçalho como dado adicional) e só então devolve o texto. */
export function abrirRegistro(segredo: Bytes, hex: string, seq = 0): { ok: boolean; texto?: string } {
  const b = deHex(hex);
  if (b.length < 5 + 17) return { ok: false };
  const { chave, nonce } = chavesDoRegistro(segredo, seq);
  const r = aesGcmDecifrar(chave, nonce, b.slice(5, -16), b.slice(-16), b.slice(0, 5));
  if (!r.ok) return { ok: false };
  const interno = r.claro!;
  let fim = interno.length - 1;
  while (fim >= 0 && interno[fim] === 0) fim--;
  return { ok: true, texto: bytesParaTexto(interno.slice(0, fim)) };
}

export function decifrarRegistro(segredo: Bytes, hex: string, seq = 0): string {
  const r = abrirRegistro(segredo, hex, seq);
  if (!r.ok) throw new Error('bad_record_mac: a etiqueta do registro não confere');
  return r.texto!;
}

/* ---------- O que passa no fio e quem consegue ver ---------- */

export interface Transmissao {
  n: number;
  de: string;
  para: string;
  ipDe: string;
  ipPara: string;
  proto: 'tcp' | 'udp';
  porta: number;
  /** O que a aplicação mandou, em claro. */
  claro: string;
  /** O que aparece no fio (igual ao claro, ou cifrado). */
  fio: string;
  cifrado: boolean;
  /** Descrição curta para a lista. */
  resumo: string;
  nos: string[];
  nosTunel: string[];
  interceptadoPor: string[];
}

const TRAFEGO = new WeakMap<Mundo, Transmissao[]>();

export function trafego(m: Mundo): Transmissao[] {
  let t = TRAFEGO.get(m);
  if (!t) TRAFEGO.set(m, (t = []));
  return t;
}

export function registrarTrafego(m: Mundo, t: Omit<Transmissao, 'n'>): Transmissao {
  const lista = trafego(m);
  const x = { ...t, n: (lista[lista.length - 1]?.n ?? 0) + 1 };
  lista.push(x);
  if (lista.length > 80) lista.splice(0, lista.length - 80);
  return x;
}

/** Hub ou switch onde o PC está plugado (pelo cabo da primeira porta). */
export function ondeEstaPlugado(m: Mundo, e: Equipamento): { equip: Equipamento; porta: string } | null {
  for (const p of e.portas) {
    const c = caboNaPorta(m, { equip: e.nome, porta: p.nome });
    if (!c) continue;
    const outra = c.a.equip === e.nome ? c.b : c.a;
    const x = m.equipamentos.get(outra.equip);
    if (x) return { equip: x, porta: outra.porta };
  }
  return null;
}

export interface VisaoFarejador {
  /** Por que esta placa enxerga (ou não) o tráfego dos outros. */
  como: string;
  vistas: { t: Transmissao; esp: boolean }[];
}

/**
 * O que uma placa em modo promíscuo pega: num hub, tudo que passa pelo hub; numa porta espelhada do switch, tudo
 * que passa pelo switch; numa porta comum de switch, só o próprio tráfego (e o que um ARP falso desviar para ela).
 */
export function visaoDoFarejador(m: Mundo, e: Equipamento): VisaoFarejador {
  const plug = ondeEstaPlugado(m, e);
  const ouve = new Set<string>();
  let como = 'Placa sem cabo: não ouve nada.';
  if (plug) {
    const x = plug.equip;
    if (x.tipo === 'hub') {
      ouve.add(x.nome);
      como = `Plugada no hub ${x.nome}: o hub repete cada bit para todas as portas, então esta placa ouve tudo que passa por ele.`;
    } else if (x.tipo === 'switch' && x.s.espelho === plug.porta) {
      ouve.add(x.nome);
      como = `Plugada na porta ${plug.porta} de ${x.nome}, que espelha o tráfego do switch inteiro (porta de monitoramento).`;
    } else if (x.tipo === 'switch') {
      como = `Plugada na porta ${plug.porta} de ${x.nome}. O switch só manda para cada porta o que é dela: aqui chega o tráfego desta máquina, os broadcasts (ARP) e o que alguém desviar para cá.`;
    } else como = `Ligada direto em ${x.nome}: ouve só o que passa neste cabo.`;
  }
  const vistas: VisaoFarejador['vistas'] = [];
  for (const t of trafego(m)) {
    const proprio = t.de === e.nome || t.para === e.nome;
    const desviado = t.interceptadoPor.includes(e.nome);
    const noMeio = [...ouve].some((n) => t.nos.includes(n));
    if (!proprio && !desviado && !noMeio) continue;
    const esp = !proprio && !desviado && [...ouve].some((n) => t.nosTunel.includes(n));
    vistas.push({ t, esp });
  }
  return { como, vistas };
}

/** Procura coisas sensíveis num texto em claro (senha, cookie, cabeçalho de autorização). */
export function segredosEm(texto: string): string[] {
  const out: string[] = [];
  const re = /(senha|password|pass|token)=([^&\s]+)/gi;
  let x: RegExpExecArray | null;
  while ((x = re.exec(texto))) out.push(`${x[1]}=${x[2]}`);
  const ck = /^Cookie: (.+)$/im.exec(texto);
  if (ck) out.push(`cookie ${ck[1]}`);
  const au = /^Authorization: (.+)$/im.exec(texto);
  if (au) out.push(`autorização ${au[1]}`);
  return out;
}

/* ---------- Wi-Fi: WPA2 (senha compartilhada) e WPA3 (SAE) ---------- */

export interface ConfigWifi {
  ssid: string;
  seguranca: 'aberta' | 'wpa2' | 'wpa3';
  senha?: string;
  /** Último aperto de mão que alguém por perto conseguiu ouvir. */
  ultimoAperto?: ApertoWifi;
  /** WPA3: tentativas de senha erradas seguidas (o ponto de acesso desacelera quem erra muito). */
  erros?: number;
}

export interface ApertoWifi {
  ssid: string;
  seguranca: 'wpa2' | 'wpa3';
  macAp: string;
  macCliente: string;
  anonce: string;
  snonce: string;
  /** Código de integridade da mensagem 2 (o que o atacante usa para testar senhas). */
  mic: string;
}

/** Iterações do PBKDF2 do WPA2 pessoal (IEEE 802.11i, H.4): 4096, de verdade. */
export const ITERACOES_PSK = 4096;

const PMKS = new Map<string, Bytes>();

/**
 * PMK do WPA2 pessoal: PBKDF2-HMAC-SHA1(senha, SSID, 4096 iterações, 256 bits) (IEEE 802.11i, H.4; RFC 8018). É a
 * conta lenta que o atacante paga por palavra. O resultado fica guardado por senha e SSID, como o ponto de acesso
 * guarda o dele: a mesma conta não precisa ser refeita a cada associação.
 */
export function pmkBytes(senha: string, ssid: string): Bytes {
  const id = `${ssid}\u0000${senha}`;
  const pronta = PMKS.get(id);
  if (pronta) return pronta;
  const k = pbkdf2HmacSha1(senha, ssid, ITERACOES_PSK, 32);
  if (PMKS.size > 500) PMKS.clear();
  PMKS.set(id, k);
  return k;
}

export function pmk(senha: string, ssid: string): string {
  return paraHex(pmkBytes(senha, ssid));
}

/**
 * No WPA3 a PMK sai do próprio SAE (a troca Dragonfly sobre curva elíptica, IEEE 802.11-2020, 12.4). O motor não faz
 * as contas do SAE: usa um resumo da senha e do SSID no lugar, só para o aperto de 4 vias que vem depois seguir igual.
 */
function pmkSae(senha: string, ssid: string): Bytes {
  return sha256Bytes(`sae|${ssid}|${senha}`);
}

const compararBytes = (a: Bytes, b: Bytes) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
};
const menorMaior = (a: Bytes, b: Bytes): Bytes => (compararBytes(a, b) <= 0 ? [...a, ...b] : [...b, ...a]);

/** MAC "aa:bb:cc:dd:ee:ff" em 6 bytes (o que não for MAC vira um resumo, para os testes com nomes soltos). */
function macBytes(mac: string): Bytes {
  const h = mac.replace(/[^0-9a-f]/gi, '');
  return h.length === 12 ? deHex(h) : sha256Bytes('mac|' + mac).slice(0, 6);
}

function nonceBytes(hex: string): Bytes {
  return /^[0-9a-f]{64}$/i.test(hex) ? deHex(hex) : sha256Bytes('nonce|' + hex);
}

/**
 * PTK do CCMP: PRF-384(PMK, "Pairwise key expansion", Min(AA, SPA) || Max(AA, SPA) || Min(ANonce, SNonce) ||
 * Max(ANonce, SNonce)) (IEEE 802.11i, 8.5.1.2). Sai em três pedaços de 16 bytes: KCK (assina o MIC do aperto),
 * KEK (cifra a chave de grupo) e TK (cifra os quadros de dados).
 */
export function ptkWifi(pmkB: Bytes, a: ApertoWifi): { kck: Bytes; kek: Bytes; tk: Bytes } {
  const dados = [...menorMaior(macBytes(a.macAp), macBytes(a.macCliente)), ...menorMaior(nonceBytes(a.anonce), nonceBytes(a.snonce))];
  const p = prf80211(pmkB, 'Pairwise key expansion', dados, 384);
  return { kck: p.slice(0, 16), kek: p.slice(16, 32), tk: p.slice(32, 48) };
}

/**
 * Mensagem 2 do aperto de mão, um quadro EAPOL-Key (IEEE 802.1X versão 2, descritor RSN): informação de chave 0x010a
 * (par, MIC, versão 2 = HMAC-SHA1 com AES), contador de repetição 1, o SNonce e o campo do MIC zerado, que é como o
 * MIC é calculado. Aproximação declarada: sem o elemento RSN no campo de dados da chave.
 */
function quadroEapol2(a: ApertoWifi): Bytes {
  const corpo = [2, 0x01, 0x0a, 0, 16, ...inteiroParaBytes(1n, 8), ...nonceBytes(a.snonce), ...new Array<number>(16 + 8 + 8 + 16).fill(0), 0, 0];
  return [2, 3, (corpo.length >> 8) & 0xff, corpo.length & 0xff, ...corpo];
}

/** MIC da mensagem 2: HMAC-SHA1 com a KCK sobre o quadro EAPOL-Key, cortado em 128 bits. */
function micWifi(pmkB: Bytes, a: ApertoWifi): string {
  return paraHex(hmacSha1(ptkWifi(pmkB, a).kck, quadroEapol2(a)).slice(0, 16));
}

/**
 * Um quadro de dados protegido com CCMP (IEEE 802.11i, 8.3.3): AES-CCM com M = 8 e L = 2 (RFC 3610). O nonce de 13
 * bytes é a prioridade, o endereço de quem transmite e o número do pacote (PN, de 48 bits, que nunca se repete); o
 * dado adicional é o cabeçalho MAC com os campos que mudam no caminho zerados.
 */
export function quadroCcmp(tk: Bytes, macOrigem: string, macDestino: string, pn: number, dados: string): { cifrado: Bytes; mic: Bytes; nonce: Bytes; aad: Bytes } {
  const a2 = macBytes(macOrigem);
  const a1 = macBytes(macDestino);
  const nonce = [0, ...a2, ...inteiroParaBytes(BigInt(pn), 6)];
  const aad = [0x08, 0x40, ...a1, ...a2, ...a1, 0, 0];
  const r = aesCcmCifrar(tk, nonce, dados, aad, 8);
  return { cifrado: r.cifrado, mic: r.tag, nonce, aad };
}

export function wifiDe(e: Equipamento): ConfigWifi | undefined {
  return e.s.wifi as ConfigWifi | undefined;
}

/** Associação do cliente: no WPA2, o aperto de mão de 4 vias; no WPA3, o SAE antes dele. Depois, um quadro em CCMP. */
export function associarWifi(m: Mundo, ap: Equipamento, cliente: Equipamento, senha: string): { ok: boolean; linhas: string[]; aperto?: ApertoWifi } {
  const w = wifiDe(ap)!;
  if (w.seguranca === 'aberta') {
    return { ok: true, linhas: [`Rede "${w.ssid}" aberta: associa sem senha e sem cifra. Tudo que passa no ar pode ser lido por quem estiver perto.`] };
  }
  const anonce = paraHex(bytesDoMundo(m, 32));
  const snonce = paraHex(bytesDoMundo(m, 32));
  const a: ApertoWifi = { ssid: w.ssid, seguranca: w.seguranca, macAp: ap.mac, macCliente: cliente.mac, anonce, snonce, mic: '' };
  const linhas: string[] = [];
  let pmkCliente: Bytes;
  let pmkAp: Bytes;
  if (w.seguranca === 'wpa3') {
    if ((w.erros ?? 0) >= 5) return { ok: false, linhas: ['O ponto de acesso está recusando tentativas por um tempo: erros demais seguidos (WPA3 desacelera quem tenta adivinhar).'] };
    linhas.push(
      'WPA3 (SAE, autenticação simultânea de iguais): cliente e ponto de acesso fazem uma troca do tipo Diffie-Hellman amarrada à senha.',
      '  Cada lado manda um "commit" e um "confirm"; só chega à mesma chave quem usou a mesma senha, e o que passa no ar não serve para testar senhas fora dali.',
    );
    if (senha !== w.senha) {
      w.erros = (w.erros ?? 0) + 1;
      return { ok: false, linhas: [...linhas, '  O "confirm" não bate: senha errada. Cada palpite exige uma troca nova com o ponto de acesso.'] };
    }
    w.erros = 0;
    pmkCliente = pmkSae(senha, w.ssid);
    pmkAp = pmkSae(w.senha ?? '', w.ssid);
  } else {
    pmkCliente = pmkBytes(senha, w.ssid);
    pmkAp = pmkBytes(w.senha ?? '', w.ssid);
  }
  a.mic = micWifi(pmkCliente, a);
  const micAp = micWifi(pmkAp, a);
  const bate = micAp === a.mic;
  linhas.push(
    `Aperto de mão de 4 vias com "${w.ssid}" (${w.seguranca.toUpperCase()}):`,
    w.seguranca === 'wpa2' ? `  0. Os dois lados já têm a PMK: PBKDF2-HMAC-SHA1(senha, "${w.ssid}", ${ITERACOES_PSK} iterações, 256 bits) = ${paraHex(pmkCliente).slice(0, 16)}...` : '  0. A PMK saiu do SAE, e nunca da senha sozinha.',
    `  1. ponto de acesso → cliente: ANonce ${anonce.slice(0, 16)}...`,
    `  2. cliente → ponto de acesso: SNonce ${snonce.slice(0, 16)}... e o MIC ${a.mic} (HMAC-SHA1 com a KCK, o primeiro pedaço da PTK = PRF-384 da PMK, dos MACs e dos nonces)`,
    `  3. ponto de acesso confere o MIC ${bate ? 'e ele bate' : 'e ele NÃO bate: senha errada'}${bate ? '; manda a chave de grupo cifrada com a KEK' : ''}`,
  );
  if (!bate) return { ok: false, linhas: [...linhas, 'Associação recusada.'], aperto: a };
  linhas.push('  4. cliente confirma. Cada quadro daqui em diante vai cifrado com a TK, que muda a cada associação.');
  // o primeiro quadro de dados, em CCMP, e um bit trocado no ar
  const tk = ptkWifi(pmkCliente, a).tk;
  const q = quadroCcmp(tk, cliente.mac, ap.mac, 1, 'DHCPDISCOVER');
  const ruim = q.cifrado.slice();
  ruim[0]! ^= 0x01;
  const passa = aesCcmDecifrar(tk, q.nonce, ruim, q.mic, q.aad).ok;
  linhas.push(`  Quadro de dados em CCMP (AES-CCM, nonce com o PN 1): ${paraHex(q.cifrado)} e MIC ${paraHex(q.mic)}. Um bit trocado no ar: ${passa ? 'passou (!)' : 'o MIC não confere e o ponto de acesso descarta'}.`);
  if (w.seguranca === 'wpa2') w.ultimoAperto = a;
  else w.ultimoAperto = { ...a, mic: '' };
  return { ok: true, linhas, aperto: a };
}

export const DICIONARIO_PEQUENO = ['123456', '12345678', 'senha', 'senha123', 'qwerty', 'admin', 'abc123', 'futebol', 'brasil', 'amor123', 'wifi1234', 'internet', 'camada8', 'familia', 'casa2026', 'iloveyou', '00000000', 'password'];

/**
 * Ataque de dicionário contra o aperto de mão capturado: para cada palavra, a PMK inteira (as 4096 iterações do
 * PBKDF2), a PTK e o MIC, e compara com o capturado. Sem falar com ninguém.
 */
export function quebrarAperto(a: ApertoWifi, palavras: string[]): { senha?: string; testadas: number; linhas: string[] } {
  if (a.seguranca === 'wpa3' || !a.mic) {
    return { testadas: 0, linhas: ['WPA3: o que se captura no ar não deixa testar senhas fora dali. Cada palpite seria uma tentativa ao vivo contra o ponto de acesso, que desacelera depois de poucos erros. O dicionário não serve.'] };
  }
  const linhas = [`Testando ${palavras.length} palavra(s) contra o MIC capturado. Cada uma custa a PMK inteira (PBKDF2 com ${ITERACOES_PSK} iterações de HMAC-SHA1, duas vezes para fechar 256 bits), a PTK e o MIC, sem falar com ninguém:`];
  let k = 0;
  for (const p of palavras) {
    k++;
    if (micWifi(pbkdf2HmacSha1(p, a.ssid, ITERACOES_PSK, 32), a) === a.mic) {
      linhas.push(`  "${p}": o MIC bate. Senha encontrada depois de ${k} tentativa(s), ${k * 2 * ITERACOES_PSK} HMAC-SHA1 só no PBKDF2.`);
      return { senha: p, testadas: k, linhas };
    }
  }
  linhas.push(`  Nenhuma das ${k} serviu (${k * 2 * ITERACOES_PSK} HMAC-SHA1). Senha longa e fora de dicionário aguenta esse ataque; senha curta e comum, não.`);
  return { testadas: k, linhas };
}

/* ---------- PGP (assinar e cifrar correio, RFC 4880 e RFC 9580) ---------- */

/** Par de chaves RSA de 2048 bits de um endereço (sempre o mesmo para o mesmo endereço). */
export function chavesPgp(endereco: string): ChavesRsa {
  return chavesFixas('pgp:' + endereco.toLowerCase());
}

/** Identificador da chave: os 64 bits finais de um resumo da chave pública (no OpenPGP v4, do SHA-1 do pacote da chave). */
export function idChave(endereco: string): string {
  const c = chavesPgp(endereco);
  return sha256(`${c.publica.n}|${c.publica.e}`).slice(0, 16).toUpperCase();
}

/**
 * Assina com a chave privada de quem manda (RSA PKCS#1 v1.5 com SHA-256) e cifra para quem recebe: uma chave de
 * sessão AES-128 sorteada cifra o texto e a assinatura em AES-GCM (um dos modos AEAD do OpenPGP, RFC 9580), e a
 * chave de sessão vai cifrada com a chave pública do destinatário (RSAES-PKCS1-v1_5, como no OpenPGP).
 * Aproximação declarada: o pacote é JSON, não o formato binário de pacotes da RFC.
 */
export function protegerMensagem(m: Mundo, de: string, para: string, corpo: string): { blindado: string; linhas: string[] } {
  const sessao = bytesDoMundo(m, 16);
  const assinatura = assinarPkcs1(corpo, chavesPgp(de).privada);
  const chaveCifrada = cifrarRsaPkcs1(sessao, chavesPgp(para).publica, m.rng);
  const iv = bytesDoMundo(m, 12);
  const r = aesGcmCifrar(sessao, iv, JSON.stringify({ de, s: paraHex(assinatura), t: corpo }));
  const pacote = JSON.stringify({ para, k: paraHex(chaveCifrada), iv: paraHex(iv), c: paraHex([...r.cifrado, ...r.tag]) });
  const blindado = ['-----BEGIN PGP MESSAGE-----', base64Codificar(pacote, 64), '-----END PGP MESSAGE-----'].join('\r\n');
  return {
    blindado,
    linhas: [
      `Assina: SHA-256 do texto, assinado com a chave privada RSA de 2048 bits de ${de} (id ${idChave(de)}).`,
      `Cifra: uma chave de sessão AES-128 sorteada (${paraHex(sessao).slice(0, 12)}...) cifra o texto e a assinatura em AES-GCM, com etiqueta de 128 bits.`,
      `A chave de sessão vai cifrada com a chave pública de ${para} (id ${idChave(para)}), em ${chaveCifrada.length} bytes: só quem tem a privada abre.`,
      'O corpo vira texto blindado (base64 entre BEGIN e END). Os cabeçalhos (De, Para, Assunto) continuam em claro.',
    ],
  };
}

export function ehBlindado(corpo: string): boolean {
  return corpo.includes('-----BEGIN PGP MESSAGE-----');
}

export function abrirMensagem(blindado: string, destinatario: string): { ok: boolean; texto?: string; de?: string; assinaturaValida?: boolean; linhas: string[] } {
  try {
    const b64 = blindado.split(/\r?\n/).filter((l) => l && !l.startsWith('-----')).join('');
    const pacote = JSON.parse(bytesTexto(base64Decodificar(b64))) as { para: string; k: string; iv: string; c: string };
    if (pacote.para.toLowerCase() !== destinatario.toLowerCase()) return { ok: false, linhas: [`Mensagem cifrada para ${pacote.para}; a chave privada de ${destinatario} não abre.`] };
    const sessao = decifrarRsaPkcs1(deHex(pacote.k), chavesPgp(destinatario).privada);
    if (!sessao || sessao.length !== 16) return { ok: false, linhas: [`A chave privada de ${destinatario} não abre a chave de sessão.`] };
    const c = deHex(pacote.c);
    const r = aesGcmDecifrar(sessao, deHex(pacote.iv), c.slice(0, -16), c.slice(-16));
    if (!r.ok) return { ok: false, linhas: ['A etiqueta do AES-GCM não confere: a mensagem foi alterada no caminho. Nada é mostrado.'] };
    const dentro = JSON.parse(bytesParaTexto(r.claro!)) as { de: string; s: string; t: string };
    const valida = verificarPkcs1(dentro.t, deHex(dentro.s), chavesPgp(dentro.de).publica);
    return {
      ok: true,
      texto: dentro.t,
      de: dentro.de,
      assinaturaValida: valida,
      linhas: [`Decifrado com a chave privada de ${destinatario}; a etiqueta do AES-GCM confere.`, `Assinatura de ${dentro.de}: ${valida ? 'confere (íntegra e de quem diz ser)' : 'NÃO confere'}.`],
    };
  } catch {
    return { ok: false, linhas: ['Não deu para abrir: a mensagem foi alterada ou não é para esta chave.'] };
  }
}

/* ---------- DNSSEC ---------- */

const nomeDeZona = (zona: string) => (zona === '.' || zona === '' ? '.' : zona.toLowerCase().replace(/\.$/, ''));

/**
 * Chave da zona (DNSKEY): RSA de 2048 bits, algoritmo 8 (RSA/SHA-256, RFC 5702). O resumo dela vai para a zona de
 * cima (DS), e assim a confiança sobe até a raiz. Aproximação declarada: uma chave só por zona (sem separar KSK e ZSK).
 */
export function chaveDeZona(zona: string): ChavesRsa {
  return chavesFixas('zona:' + nomeDeZona(zona));
}

export function textoRrset(registros: { nome: string; tipo: string; valor: string }[]): string {
  return registros.map((r) => `${r.nome} ${r.tipo} ${r.valor}`).sort().join('\n');
}

/** RRSIG: PKCS#1 v1.5 com SHA-256 sobre o conjunto de registros em ordem canônica (aqui, texto ordenado). */
export function assinarRrset(zona: string, registros: { nome: string; tipo: string; valor: string }[]): bigint {
  return assinarMensagem(textoRrset(registros), chaveDeZona(zona).privada).assinatura;
}

export function conferirRrset(zona: string, registros: { nome: string; tipo: string; valor: string }[], assinatura: bigint | undefined): boolean {
  if (assinatura === undefined) return false;
  return verificarAssinatura(textoRrset(registros), assinatura, chaveDeZona(zona).publica).valida;
}

/** DS: resumo SHA-256 do nome da zona e da chave pública (RFC 4509), mostrado nos 64 bits do começo. */
export function dsDe(zona: string): string {
  const c = chaveDeZona(zona);
  return sha256(`${nomeDeZona(zona)}|${c.publica.n}|${c.publica.e}`).slice(0, 16).toUpperCase();
}

/* ---------- IPsec: IKEv2 e ESP com AES-GCM ---------- */

interface SaIke {
  /** Metades públicas X25519 de quem inicia e de quem responde. */
  dhI: Bytes;
  dhR: Bytes;
  ni: Bytes;
  nr: Bytes;
  /** KEYMAT do ESP: 16 bytes de chave AES e 4 de sal (RFC 4106, 8.1). */
  keymat: Bytes;
  auth: Bytes;
}

/**
 * IKEv2 (RFC 7296) com o grupo 31, Curve25519 (RFC 8031), e prf HMAC-SHA256. SKEYSEED = prf(Ni | Nr, g^ir) (2.14);
 * {SK_d | SK_pi | ...} = prf+(SKEYSEED, Ni | Nr | SPIi | SPIr), e a KEYMAT da SA filha sai de prf+(SK_d, Ni | Nr)
 * (2.17). O prf+ do IKEv2 é a mesma conta do HKDF-Expand. A autenticação com segredo pré-compartilhado é
 * AUTH = prf(prf(segredo, "Key Pad for IKEv2"), mensagem | nonce do outro | prf(SK_pi, ID)) (2.15): o segredo não
 * entra na chave, só prova quem é quem. Aproximação declarada: os aleatórios (segredos DH e nonces) saem de um resumo
 * das duas redes e do SPI, para as duas pontas do jogo chegarem à mesma SA sem guardar estado da troca.
 */
function saIke(t: TunelVpn): SaIke {
  const [a, b] = [t.local, t.remota].sort();
  const base = `${a}|${b}|${t.spi}`;
  const i = parX25519(sha256Bytes(`ike|dh|i|${base}`));
  const r = parX25519(sha256Bytes(`ike|dh|r|${base}`));
  const ni = sha256Bytes(`ike|ni|${base}`);
  const nr = sha256Bytes(`ike|nr|${base}`);
  const gir = x25519(i.privada, r.publica);
  const skeyseed = hmacSha256Bytes([...ni, ...nr], gir);
  const spis = [...inteiroParaBytes(BigInt(t.spi), 8), ...inteiroParaBytes(BigInt(t.spi) ^ 0xffffn, 8)];
  const sk = hkdfExpandir(skeyseed, [...ni, ...nr, ...spis], 32 * 3);
  const skD = sk.slice(0, 32);
  const skPi = sk.slice(64, 96);
  const keymat = hkdfExpandir(skD, [...ni, ...nr], 20);
  const auth = hmacSha256Bytes(hmacSha256Bytes(t.segredo, 'Key Pad for IKEv2'), [...i.publica, ...ni, ...nr, ...hmacSha256Bytes(skPi, a)]);
  return { dhI: i.publica, dhR: r.publica, ni, nr, keymat, auth };
}

/** KEYMAT do ESP: chave AES-128 (16 bytes) e sal (4 bytes). */
export function chaveDoTunel(t: TunelVpn): Bytes {
  return saIke(t).keymat;
}

/** IKEv2: X25519, autenticação pelo segredo pré-compartilhado e a associação de segurança do ESP. */
export function linhasIke(t: TunelVpn, ativo: boolean, motivo?: string): string[] {
  const sa = saIke(t);
  return [
    `IKE com ${t.par} (túnel ${t.nome}):`,
    `  1. IKE_SA_INIT: as pontas combinam AES-128-GCM para o ESP, prf HMAC-SHA256 e o grupo 31 (X25519) e trocam as metades públicas (${hexCurto(sa.dhI, 6)} e ${hexCurto(sa.dhR, 6)}) e os nonces.`,
    `  2. IKE_AUTH: cada ponta prova que conhece o segredo pré-compartilhado com AUTH = prf(prf(segredo, "Key Pad for IKEv2"), ...) = ${hexCurto(sa.auth, 6)}${ativo ? ': bate dos dois lados' : ''}. O segredo não vira chave: a chave sai do X25519.`,
    `  3. Associação de segurança (SA): SPI ${t.spi}, chave ${paraHex(sa.keymat.slice(0, 16)).slice(0, 12)}... e sal ${paraHex(sa.keymat.slice(16))} (RFC 4106), para ${t.local} ↔ ${t.remota}.`,
    ativo ? `  Túnel ativo. MTU efetivo: 1500 - ${SOBRA_ESP} = ${1500 - SOBRA_ESP} bytes para o pacote de dentro.` : `  Túnel parado: ${motivo ?? 'a outra ponta não está configurada igual'}.`,
  ];
}

/**
 * Pacote ESP com AES-GCM (RFC 4303 e RFC 4106): SPI e número de sequência em claro (e no dado adicional), IV
 * explícito de 8 bytes (aqui, o número de sequência, como permite a RFC 4106, 3.1), e cifrado o pacote de dentro com
 * o enchimento 1, 2, 3..., o tamanho do enchimento e o próximo cabeçalho (4, IPv4), seguido do ICV de 16 bytes.
 * Devolve o ESP inteiro em hexadecimal.
 */
export function espDe(t: TunelVpn, conteudo: string, seq: number): string {
  const km = chaveDoTunel(t);
  const dentro = textoParaBytes(conteudo);
  const enchimento = (4 - ((dentro.length + 2) % 4)) % 4;
  const claro = [...dentro, ...Array.from({ length: enchimento }, (_, i) => i + 1), enchimento, 4];
  const cab = [...inteiroParaBytes(BigInt(t.spi), 4), ...inteiroParaBytes(BigInt(seq >>> 0), 4)];
  const iv = inteiroParaBytes(BigInt(seq >>> 0), 8);
  const r = aesGcmCifrar(km.slice(0, 16), [...km.slice(16, 20), ...iv], claro, cab);
  return paraHex([...cab, ...iv, ...r.cifrado, ...r.tag]);
}

/** Abre um ESP: confere o ICV (com SPI e sequência como dado adicional) antes de decifrar. */
export function abrirEsp(t: TunelVpn, hex: string): { ok: boolean; texto?: string } {
  const b = deHex(hex);
  if (b.length < 8 + 8 + 2 + 16) return { ok: false };
  const km = chaveDoTunel(t);
  const r = aesGcmDecifrar(km.slice(0, 16), [...km.slice(16, 20), ...b.slice(8, 16)], b.slice(16, -16), b.slice(-16), b.slice(0, 8));
  if (!r.ok) return { ok: false };
  const c = r.claro!;
  const enchimento = c[c.length - 2] ?? 0;
  return { ok: true, texto: bytesParaTexto(c.slice(0, c.length - 2 - enchimento)) };
}

/* ---------- Roteamento em cebola: circuito de três nós ---------- */

export interface PontoCebola {
  nome: string;
  ip: string;
}

export interface VisaoCebola {
  no: string;
  ip: string;
  papel: 'entrada' | 'meio' | 'saída';
  anterior: string;
  proximo: string;
  /** O nó sabe quem é a origem? Só a entrada, que vê o IP de quem mandou. */
  sabeOrigem: boolean;
  /** O nó sabe o destino final? Só a saída. */
  sabeDestino: boolean;
  /** O nó viu o conteúdo em claro? Só a saída, e só se não houver cifra de ponta a ponta. */
  veConteudo: boolean;
  /** Bytes da célula que chegou e da que saiu. */
  recebeu: number;
  repassou: number;
  /** Conseguiu abrir a camada de outro nó com a própria chave? (Não deve.) */
  abreOutraCamada: boolean;
}

export interface CircuitoCebola {
  ok: boolean;
  motivo?: string;
  de: string;
  destino: string;
  nos: string[];
  visoes: VisaoCebola[];
  linhas: string[];
}

/** Chave de cebola de um nó (X25519 estática, publicada no diretório de nós). Sai do nome, para o mundo ser reprodutível. */
export function chaveDeCebola(no: string): { privada: Bytes; publica: Bytes } {
  return parX25519(sha256Bytes('cebola|chave do nó|' + no));
}

/** Chave AES-128 e IV de uma camada, tirados do segredo X25519 com o HKDF (RFC 5869). */
function chaveDeCamada(segredo: Bytes, no: string): { chave: Bytes; iv: Bytes } {
  const k = hkdfExpandir(hkdfExtrair(textoParaBytes('cebola'), segredo), textoParaBytes('camada|' + no), 28);
  return { chave: k.slice(0, 16), iv: k.slice(16, 28) };
}

const AAD_CELULA = textoParaBytes('celula');

function embrulhar(k: { chave: Bytes; iv: Bytes }, conteudo: object): Bytes {
  const r = aesGcmCifrar(k.chave, k.iv, JSON.stringify(conteudo), AAD_CELULA);
  return [...r.cifrado, ...r.tag];
}

function desembrulhar(k: { chave: Bytes; iv: Bytes }, celula: Bytes): Record<string, string> | null {
  if (celula.length < 17) return null;
  const r = aesGcmDecifrar(k.chave, k.iv, celula.slice(0, -16), celula.slice(-16), AAD_CELULA);
  if (!r.ok) return null;
  try {
    return JSON.parse(bytesParaTexto(r.claro!)) as Record<string, string>;
  } catch {
    return null;
  }
}

/**
 * Roteamento em cebola, no desenho clássico: quem manda escolhe três nós e combina uma chave com cada um por
 * Diffie-Hellman (X25519 entre um segredo de uso único e a chave de cebola publicada do nó). A combinação é
 * telescópica: a do segundo nó viaja dentro da camada do primeiro, e a do terceiro dentro das duas, então só o
 * primeiro vê quem pediu. Depois a mensagem é embrulhada de dentro para fora: a camada do nó de saída leva o destino
 * e o conteúdo, a do meio leva o endereço da saída, a de entrada leva o do meio. Cada nó tira só a própria camada
 * (AES-128-GCM com a chave dele) e só conhece o anterior e o próximo. Aproximação declarada: as células não têm
 * tamanho fixo, então o tamanho de cada trecho aparece (numa rede de cebola de verdade, todas têm o mesmo).
 */
export function montarCebola(
  m: Mundo, origem: PontoCebola, nos: PontoCebola[], destino: PontoCebola, mensagem: string,
  /** O endereço de `de` que `para` enxerga (o da interface no enlace entre os dois); sem isso, o ip de cada ponto. */
  visto: (de: PontoCebola, para: PontoCebola) => string = (de) => de.ip,
): CircuitoCebola {
  const base = { de: origem.nome, destino: destino.nome, nos: nos.map((x) => x.nome), visoes: [] as VisaoCebola[] };
  const falha = (motivo: string): CircuitoCebola => ({ ...base, ok: false, motivo, linhas: [`Circuito não montado: ${motivo}.`] });
  if (nos.length !== 3) return falha('o circuito precisa de exatamente três nós');
  if (new Set(nos.map((x) => x.nome)).size !== 3) return falha('os três nós precisam ser diferentes, ou um só nó veria duas camadas');
  if (nos.some((x) => x.nome === origem.nome || x.nome === destino.nome)) return falha('nem quem manda nem o destino podem ser nó do circuito');
  const linhas = [`CIRCUITO EM CEBOLA de ${origem.nome} (${origem.ip}) até ${destino.nome} (${destino.ip}):`];
  // 1. uma chave com cada nó (os dois lados calculam o mesmo segredo)
  const chaves: { chave: Bytes; iv: Bytes }[] = [];
  const chavesDosNos: { chave: Bytes; iv: Bytes }[] = [];
  nos.forEach((no, i) => {
    const efemera = parX25519(bytesDoMundo(m, 32));
    const doNo = chaveDeCebola(no.nome);
    const meu = x25519(efemera.privada, doNo.publica);
    const dele = x25519(doNo.privada, efemera.publica);
    chaves.push(chaveDeCamada(meu, no.nome));
    chavesDosNos.push(chaveDeCamada(dele, no.nome));
    const por = i === 0 ? 'direto' : i === 1 ? `dentro da camada de ${nos[0]!.nome}` : `dentro das camadas de ${nos[0]!.nome} e ${nos[1]!.nome}`;
    linhas.push(`  ${i + 1}. Chave com ${no.nome} por X25519 (${por}): metade de uso único ${hexCurto(efemera.publica, 6)}, chave de cebola do nó ${hexCurto(doNo.publica, 6)}; ${iguaisTempoConstante(meu, dele) ? 'os dois chegam ao mesmo segredo' : 'segredos DIFERENTES'}.`);
  });
  // 2. embrulha de dentro para fora
  const c3 = embrulhar(chaves[2]!, { proximo: visto(destino, nos[2]!), dados: mensagem });
  const c2 = embrulhar(chaves[1]!, { proximo: visto(nos[2]!, nos[1]!), celula: paraHex(c3) });
  const c1 = embrulhar(chaves[0]!, { proximo: visto(nos[1]!, nos[0]!), celula: paraHex(c2) });
  linhas.push(`  Embrulho: a mensagem (${textoParaBytes(mensagem).length} bytes) ganha a camada de ${nos[2]!.nome}, depois a de ${nos[1]!.nome}, depois a de ${nos[0]!.nome}: ${c1.length} bytes saem de ${origem.nome}.`);
  // 3. cada nó tira a sua camada
  const celulas = [c1, c2, c3];
  const papeis: VisaoCebola['papel'][] = ['entrada', 'meio', 'saída'];
  const visoes: VisaoCebola[] = [];
  let chegou: string | undefined;
  for (let i = 0; i < 3; i++) {
    const no = nos[i]!;
    const aberto = desembrulhar(chavesDosNos[i]!, celulas[i]!);
    if (!aberto) return falha(`${no.nome} não conseguiu tirar a própria camada`);
    const outra = i < 2 ? desembrulhar(chavesDosNos[i]!, celulas[i + 1]!) : null;
    const anterior = visto(i === 0 ? origem : nos[i - 1]!, no);
    const proximo = aberto.proximo ?? '?';
    const repassou = i < 2 ? deHex(aberto.celula ?? '').length : textoParaBytes(aberto.dados ?? '').length;
    if (i === 2) chegou = aberto.dados;
    visoes.push({ no: no.nome, ip: no.ip, papel: papeis[i]!, anterior, proximo, sabeOrigem: i === 0, sabeDestino: i === 2, veConteudo: i === 2, recebeu: celulas[i]!.length, repassou, abreOutraCamada: !!outra });
    registrarTrafego(m, {
      de: i === 0 ? origem.nome : nos[i - 1]!.nome, para: no.nome, ipDe: anterior, ipPara: visto(no, i === 0 ? origem : nos[i - 1]!), proto: 'tcp', porta: 443,
      claro: paraHex(celulas[i]!), fio: paraHex(celulas[i]!), cifrado: true, resumo: `célula de cebola para ${no.nome}`, nos: [], nosTunel: [], interceptadoPor: [],
    });
  }
  registrarTrafego(m, { de: nos[2]!.nome, para: destino.nome, ipDe: visto(nos[2]!, destino), ipPara: visto(destino, nos[2]!), proto: 'tcp', porta: 443, claro: mensagem, fio: mensagem, cifrado: false, resumo: `saída da cebola para ${destino.nome}`, nos: [], nosTunel: [], interceptadoPor: [] });
  linhas.push('  O QUE CADA NÓ ENXERGA:');
  for (const v of visoes) {
    linhas.push(`    ${v.no} (${v.papel}): recebeu ${v.recebeu} bytes de ${v.anterior}, tirou a própria camada e passou ${v.repassou} bytes para ${v.proximo}. ${v.papel === 'saída' ? `Vê o conteúdo ("${mensagem.slice(0, 40)}"), mas não sabe de quem veio.` : `O que passou adiante é cifrado para ${v.papel === 'entrada' ? 'os outros dois' : 'o nó de saída'}: com a chave dele, ${v.abreOutraCamada ? 'abriu (!)' : 'não abre'}.`}`);
  }
  linhas.push(
    `  Quem sabe a origem (${origem.ip}): só ${nos[0]!.nome}. Quem sabe o destino (${destino.ip}): só ${nos[2]!.nome}. Quem sabe os dois: ninguém.`,
    '  A resposta volta pelo mesmo circuito: cada nó acrescenta a sua camada e só quem montou o circuito tira as três.',
    '  O conteúdo sai em claro do nó de saída: para ele também ficar escondido, cifre de ponta a ponta (TLS até o destino).',
  );
  const ok = chegou === mensagem && visoes.every((v) => !v.abreOutraCamada);
  return { ...base, ok, visoes, linhas };
}
