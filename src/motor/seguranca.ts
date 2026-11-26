// Segurança aplicada no mundo do jogo (ato 7), parte que não é console: autoridades certificadoras de mentira,
// TLS 1.3 em linhas gerais (Diffie-Hellman, cadeia de certificados, chave de sessão, registro cifrado), o que um
// farejador enxerga do tráfego, Wi-Fi com WPA2 e WPA3 (aperto de mão de 4 vias e dicionário pequeno), PGP de
// brinquedo, DNSSEC e o ESP do IPsec. Toda a criptografia vem de cripto.ts. Os ataques são simulados: só existem
// dentro deste mundo e servem para ensinar a defesa.

import { caboNaPorta, type Equipamento, type Mundo } from './mundo';
import {
  assinarMensagem,
  bytesParaTexto,
  cifraAes,
  ctr,
  deHex,
  diffieHellman,
  emitirCertificado,
  gerarChavesRsa,
  hmacSha256,
  paraHex,
  sha256,
  sha256Bytes,
  verificarAssinatura,
  verificarCadeia,
  cifrarRsa,
  decifrarRsa,
  type Bytes,
  type Certificado,
  type ChavesRsa,
  type ResultadoCadeia,
} from './cripto';
import { base64Codificar, base64Decodificar, bytesParaTexto as bytesTexto } from './aplicacao';
import { SOBRA_ESP, type TunelVpn } from './filtro';

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

/** Raiz e intermediária fixas (primos pequenos, RSA de brinquedo). A raiz está no repositório de todo navegador do jogo. */
export function pki(): Pki {
  if (pkiCache) return pkiCache;
  const raiz = gerarChavesRsa(1009n, 1013n, 17n);
  const inter = gerarChavesRsa(1019n, 1021n, 17n);
  const servidor = gerarChavesRsa(1031n, 1033n, 17n);
  const impostor = gerarChavesRsa(1039n, 1049n, 17n);
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

/* ---------- TLS 1.3 em linhas gerais ---------- */

/** Primo de 32 bits e gerador: um grupo de brinquedo para o Diffie-Hellman do TLS. */
export const DH_P = 4294967291n;
export const DH_G = 5n;

export interface ApertoTls {
  ok: boolean;
  motivo?: string;
  chave: Bytes;
  linhas: string[];
  cadeia: ResultadoCadeia;
  certificado: { sujeito: string; emissor: string; validoAte: number; serie: number };
  dh: { A: string; B: string };
}

function aleatorio(m: Mundo): bigint {
  return BigInt(Math.floor(m.rng() * 2 ** 30) + 2);
}

/**
 * ClientHello com a chave DH do cliente, ServerHello com a do servidor, certificado e CertificateVerify (o servidor
 * assina o que já foi trocado, provando que tem a chave privada), Finished. A chave de sessão sai do segredo DH e dos
 * dois números aleatórios. 1 RTT antes do primeiro byte de HTTP.
 */
export function apertoTls(m: Mundo, nome: string, tipo: TipoCertificado): ApertoTls {
  const hoje = diaDoMundo(m);
  const a = aleatorio(m);
  const b = aleatorio(m);
  const rc = Math.floor(m.rng() * 2 ** 31).toString(16);
  const rs = Math.floor(m.rng() * 2 ** 31).toString(16);
  const dh = diffieHellman(DH_P, DH_G, a, b);
  const cadeia = cadeiaDoServidor(nome, tipo, hoje);
  const folha = cadeia[0]!;
  const v = conferirCadeia(nome, cadeia, hoje, tipo === 'revogado');
  const transcrito = `ClientHello ${rc} ${dh.A}|ServerHello ${rs} ${dh.B}|${folha.sujeito}`;
  const k = pki();
  const priv = tipo === 'autoassinado' ? k.impostor.privada : k.servidor.privada;
  const prova = assinarMensagem(transcrito, priv);
  const provaOk = verificarAssinatura(transcrito, prova.assinatura, folha.chavePublica).valida;
  const chave = sha256Bytes(`tls13|${dh.chaveAlice}|${rc}|${rs}`).slice(0, 16);
  const linhas = [
    `TLS 1.3 com ${nome.replace(/\.$/, '')}:`,
    `  ClientHello: versão 1.3, aleatório ${rc}, SNI "${nome.replace(/\.$/, '')}" (vai em claro), chave DH do cliente A = g^a mod p = ${dh.A}`,
    `  ServerHello: aleatório ${rs}, chave DH do servidor B = g^b mod p = ${dh.B}. Daqui em diante tudo vai cifrado.`,
    `  Os dois calculam o mesmo segredo g^(ab) mod p = ${dh.chaveAlice === dh.chaveBob ? 'igual nos dois lados' : 'DIFERENTE'}, sem ele passar pelo fio; a chave de sessão sai dele e dos aleatórios: ${paraHex(chave).slice(0, 16)}...`,
    `  Certificate: "${folha.sujeito}", emitido por "${folha.emissor}", válido até o dia ${folha.validoAte} (hoje é ${hoje})`,
    ...v.passos.map((x) => '    ' + x),
    `  CertificateVerify: o servidor assina o aperto de mão com a chave privada; o navegador confere com a chave pública do certificado: ${provaOk ? 'confere' : 'não confere'}`,
    '  Finished dos dois lados (HMAC de tudo que foi trocado): ninguém mexeu no meio.',
  ];
  const ok = v.valida && provaOk;
  return {
    ok,
    motivo: ok ? undefined : MOTIVOS_CERTIFICADO[v.motivo ?? 'assinatura'] ?? 'certificado inválido',
    chave,
    linhas,
    cadeia: v,
    certificado: { sujeito: folha.sujeito, emissor: folha.emissor, validoAte: folha.validoAte, serie: folha.serie },
    dh: { A: String(dh.A), B: String(dh.B) },
  };
}

/** Contador de 16 bytes para o modo CTR: o número do registro no fim. */
function nonce(seq: number): Bytes {
  const n = new Array<number>(16).fill(0);
  n[15] = seq & 255;
  n[14] = (seq >> 8) & 255;
  return n;
}

/** Registro TLS de dados: AES-128 em modo contador (no TLS de verdade, AES-GCM, que também autentica). */
export function cifrarRegistro(chave: Bytes, texto: string, seq = 1): string {
  return ctr(cifraAes(chave), texto, nonce(seq)).hex;
}

export function decifrarRegistro(chave: Bytes, hex: string, seq = 1): string {
  return bytesParaTexto(ctr(cifraAes(chave), deHex(hex), nonce(seq)).resultado);
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

/** Chave mestra a partir da senha e do SSID. No WPA2 real é PBKDF2 com 4096 rodadas de HMAC-SHA1; aqui, 16 de HMAC-SHA256. */
export function pmk(senha: string, ssid: string): string {
  let k = hmacSha256(senha, ssid);
  for (let i = 1; i < 16; i++) k = hmacSha256(senha, k);
  return k;
}

function ptk(pmkHex: string, a: ApertoWifi): string {
  return hmacSha256(pmkHex, `expansao de chave|${[a.macAp, a.macCliente].sort().join('|')}|${[a.anonce, a.snonce].sort().join('|')}`);
}

function mic(ptkHex: string, a: ApertoWifi): string {
  return hmacSha256(ptkHex.slice(0, 32), `mensagem 2|${a.snonce}`).slice(0, 32);
}

export function wifiDe(e: Equipamento): ConfigWifi | undefined {
  return e.s.wifi as ConfigWifi | undefined;
}

/** Associação do cliente: no WPA2, o aperto de mão de 4 vias; no WPA3, o SAE antes dele. */
export function associarWifi(m: Mundo, ap: Equipamento, cliente: Equipamento, senha: string): { ok: boolean; linhas: string[]; aperto?: ApertoWifi } {
  const w = wifiDe(ap)!;
  if (w.seguranca === 'aberta') {
    return { ok: true, linhas: [`Rede "${w.ssid}" aberta: associa sem senha e sem cifra. Tudo que passa no ar pode ser lido por quem estiver perto.`] };
  }
  const anonce = Math.floor(m.rng() * 2 ** 31).toString(16).padStart(8, '0');
  const snonce = Math.floor(m.rng() * 2 ** 31).toString(16).padStart(8, '0');
  const a: ApertoWifi = { ssid: w.ssid, seguranca: w.seguranca, macAp: ap.mac, macCliente: cliente.mac, anonce, snonce, mic: '' };
  const linhas: string[] = [];
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
  }
  const pmkCliente = pmk(senha, w.ssid);
  const pmkAp = pmk(w.senha ?? '', w.ssid);
  a.mic = mic(ptk(pmkCliente, a), a);
  const micAp = mic(ptk(pmkAp, a), a);
  linhas.push(
    `Aperto de mão de 4 vias com "${w.ssid}" (${w.seguranca.toUpperCase()}):`,
    `  1. ponto de acesso → cliente: ANonce ${anonce}`,
    `  2. cliente → ponto de acesso: SNonce ${snonce} e o MIC ${a.mic.slice(0, 16)}... (feito com a chave derivada da senha)`,
    `  3. ponto de acesso confere o MIC ${micAp === a.mic ? 'e ele bate' : 'e ele NÃO bate: senha errada'}${micAp === a.mic ? '; manda a chave de grupo cifrada' : ''}`,
  );
  if (micAp !== a.mic) return { ok: false, linhas: [...linhas, 'Associação recusada.'], aperto: a };
  linhas.push('  4. cliente confirma. Cada quadro daqui em diante vai cifrado com a chave temporária (PTK), que muda a cada associação.');
  if (w.seguranca === 'wpa2') w.ultimoAperto = a;
  else w.ultimoAperto = { ...a, mic: '' };
  return { ok: true, linhas, aperto: a };
}

export const DICIONARIO_PEQUENO = ['123456', '12345678', 'senha', 'senha123', 'qwerty', 'admin', 'abc123', 'futebol', 'brasil', 'amor123', 'wifi1234', 'internet', 'camada8', 'familia', 'casa2026', 'iloveyou', '00000000', 'password'];

/** Ataque de dicionário contra o aperto de mão capturado: refaz PMK, PTK e MIC para cada palavra e compara. */
export function quebrarAperto(a: ApertoWifi, palavras: string[]): { senha?: string; testadas: number; linhas: string[] } {
  if (a.seguranca === 'wpa3' || !a.mic) {
    return { testadas: 0, linhas: ['WPA3: o que se captura no ar não deixa testar senhas fora dali. Cada palpite seria uma tentativa ao vivo contra o ponto de acesso, que desacelera depois de poucos erros. O dicionário não serve.'] };
  }
  const linhas = [`Testando ${palavras.length} palavra(s) contra o MIC capturado (cada uma: PMK, PTK e MIC de novo, sem falar com ninguém):`];
  let k = 0;
  for (const p of palavras) {
    k++;
    if (mic(ptk(pmk(p, a.ssid), a), a) === a.mic) {
      linhas.push(`  "${p}": o MIC bate. Senha encontrada depois de ${k} tentativa(s).`);
      return { senha: p, testadas: k, linhas };
    }
  }
  linhas.push(`  Nenhuma das ${k} serviu. Senha longa e fora de dicionário aguenta esse ataque; senha curta e comum, não.`);
  return { testadas: k, linhas };
}

/* ---------- PGP de brinquedo (assinar e cifrar correio) ---------- */

const PRIMOS_PGP = [1051n, 1061n, 1063n, 1069n, 1087n, 1091n, 1093n, 1097n, 1103n, 1109n, 1117n, 1123n, 1129n, 1151n, 1153n, 1163n];

const CHAVES_PGP = new Map<string, ChavesRsa>();

/** Par de chaves de um endereço (sempre o mesmo para o mesmo endereço). */
export function chavesPgp(endereco: string): ChavesRsa {
  const k = endereco.toLowerCase();
  const pronto = CHAVES_PGP.get(k);
  if (pronto) return pronto;
  const h = parseInt(sha256('pgp|' + k).slice(0, 6), 16);
  const p = PRIMOS_PGP[h % PRIMOS_PGP.length]!;
  let q = PRIMOS_PGP[(h >> 4) % PRIMOS_PGP.length]!;
  if (q === p) q = PRIMOS_PGP[(PRIMOS_PGP.indexOf(p) + 1) % PRIMOS_PGP.length]!;
  const c = gerarChavesRsa(p, q, 17n);
  CHAVES_PGP.set(k, c);
  return c;
}

export function idChave(endereco: string): string {
  const c = chavesPgp(endereco);
  return sha256(`${c.publica.n}|${c.publica.e}`).slice(0, 16).toUpperCase();
}

/**
 * Assina com a chave privada de quem manda e cifra para quem recebe: uma chave de sessão AES aleatória cifra o texto,
 * e a chave de sessão vai cifrada com a chave pública do destinatário (de 2 em 2 bytes, porque o RSA é pequeno).
 */
export function protegerMensagem(m: Mundo, de: string, para: string, corpo: string): { blindado: string; linhas: string[] } {
  const sessao = Array.from({ length: 16 }, () => Math.floor(m.rng() * 256));
  const assinatura = assinarMensagem(corpo, chavesPgp(de).privada);
  const pub = chavesPgp(para).publica;
  const pedacos: string[] = [];
  for (let i = 0; i < 16; i += 2) pedacos.push(String(cifrarRsa(BigInt(sessao[i]! * 256 + sessao[i + 1]!), pub).resultado));
  const conteudo = JSON.stringify({ de, s: String(assinatura.assinatura), t: corpo });
  const cifrado = ctr(cifraAes(sessao), conteudo, nonce(0)).hex;
  const pacote = JSON.stringify({ para, k: pedacos, c: cifrado });
  const blindado = ['-----BEGIN PGP MESSAGE-----', base64Codificar(pacote, 64), '-----END PGP MESSAGE-----'].join('\r\n');
  return {
    blindado,
    linhas: [
      `Assina: SHA-256 do texto, assinado com a chave privada de ${de} (id ${idChave(de)}).`,
      `Cifra: chave de sessão AES aleatória (${paraHex(sessao).slice(0, 12)}...) cifra o texto e a assinatura.`,
      `A chave de sessão vai cifrada com a chave pública de ${para} (id ${idChave(para)}): só quem tem a privada abre.`,
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
    const pacote = JSON.parse(bytesTexto(base64Decodificar(b64))) as { para: string; k: string[]; c: string };
    if (pacote.para.toLowerCase() !== destinatario.toLowerCase()) return { ok: false, linhas: [`Mensagem cifrada para ${pacote.para}; a chave privada de ${destinatario} não abre.`] };
    const priv = chavesPgp(destinatario).privada;
    const sessao: number[] = [];
    for (const x of pacote.k) {
      const v = Number(decifrarRsa(BigInt(x), priv).resultado);
      sessao.push((v >> 8) & 255, v & 255);
    }
    const dentro = JSON.parse(bytesParaTexto(ctr(cifraAes(sessao), deHex(pacote.c), nonce(0)).resultado)) as { de: string; s: string; t: string };
    const v = verificarAssinatura(dentro.t, BigInt(dentro.s), chavesPgp(dentro.de).publica);
    return {
      ok: true,
      texto: dentro.t,
      de: dentro.de,
      assinaturaValida: v.valida,
      linhas: [`Decifrado com a chave privada de ${destinatario}.`, `Assinatura de ${dentro.de}: ${v.valida ? 'confere (íntegra e de quem diz ser)' : 'NÃO confere'}.`],
    };
  } catch {
    return { ok: false, linhas: ['Não deu para abrir: a mensagem foi alterada ou não é para esta chave.'] };
  }
}

/* ---------- DNSSEC em linhas gerais ---------- */

const CHAVES_ZONA = new Map<string, ChavesRsa>();

/** Chave da zona (DNSKEY). O resumo dela vai para a zona de cima (DS), e assim a confiança sobe até a raiz. */
export function chaveDeZona(zona: string): ChavesRsa {
  const pronta = CHAVES_ZONA.get(zona);
  if (pronta) return pronta;
  const h = parseInt(sha256('zona|' + zona).slice(0, 6), 16);
  const p = PRIMOS_PGP[h % PRIMOS_PGP.length]!;
  let q = PRIMOS_PGP[(h >> 5) % PRIMOS_PGP.length]!;
  if (q === p) q = PRIMOS_PGP[(PRIMOS_PGP.indexOf(p) + 3) % PRIMOS_PGP.length]!;
  const c = gerarChavesRsa(p, q, 17n);
  CHAVES_ZONA.set(zona, c);
  return c;
}

export function textoRrset(registros: { nome: string; tipo: string; valor: string }[]): string {
  return registros.map((r) => `${r.nome} ${r.tipo} ${r.valor}`).sort().join('\n');
}

export function assinarRrset(zona: string, registros: { nome: string; tipo: string; valor: string }[]): bigint {
  return assinarMensagem(textoRrset(registros), chaveDeZona(zona).privada).assinatura;
}

export function conferirRrset(zona: string, registros: { nome: string; tipo: string; valor: string }[], assinatura: bigint | undefined): boolean {
  if (assinatura === undefined) return false;
  return verificarAssinatura(textoRrset(registros), assinatura, chaveDeZona(zona).publica).valida;
}

export function dsDe(zona: string): string {
  const c = chaveDeZona(zona);
  return sha256(`${zona}|${c.publica.n}|${c.publica.e}`).slice(0, 16).toUpperCase();
}

/* ---------- IPsec: o que o ESP leva ---------- */

export function chaveDoTunel(t: TunelVpn): Bytes {
  return sha256Bytes(`ike|${t.segredo}|${[t.local, t.remota].sort().join('|')}`).slice(0, 16);
}

/** IKE em linhas gerais: Diffie-Hellman, autenticação pelo segredo pré-compartilhado e a associação de segurança. */
export function linhasIke(t: TunelVpn, ativo: boolean, motivo?: string): string[] {
  return [
    `IKE com ${t.par} (túnel ${t.nome}):`,
    '  1. As pontas combinam cifra (AES), integridade (SHA-256) e grupo Diffie-Hellman, e trocam as metades públicas do DH.',
    `  2. Cada ponta prova que conhece o segredo pré-compartilhado com um HMAC do que foi trocado${ativo ? ': bate dos dois lados' : ''}.`,
    `  3. Associação de segurança (SA): SPI ${t.spi}, chave ${paraHex(chaveDoTunel(t)).slice(0, 12)}..., para ${t.local} ↔ ${t.remota}.`,
    ativo ? `  Túnel ativo. MTU efetivo: 1500 - ${SOBRA_ESP} = ${1500 - SOBRA_ESP} bytes para o pacote de dentro.` : `  Túnel parado: ${motivo ?? 'a outra ponta não está configurada igual'}.`,
  ];
}

export function espDe(t: TunelVpn, conteudo: string, seq: number): string {
  return ctr(cifraAes(chaveDoTunel(t)), conteudo, nonce(seq)).hex;
}

