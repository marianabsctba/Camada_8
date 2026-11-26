// Dias do ato 7 (O Cerco), com prática guiada, aula e desafio no próprio dia.
// Os dois últimos dias do jogo, no centro de operações: correio e web seguros (8.11 e 8.12) e as questões
// sociais da rede (8.13), na noite em que Fim de Linha vira ponto de troca de tráfego.

import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { cacheDoResolvedor } from '../motor/cliAplicacao';
import { refrescarVpns } from '../motor/roteamento';
import { calcularBgp, type ConfigBgp } from '../motor/protocolos';
import { lerCidr } from '../motor/util';
import { item, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Pergunta de resposta curta, conferida por expressão regular. */
function curta(id: string, texto: string, re: RegExp): Pergunta {
  return { id, texto, confere: (r) => re.test(r.trim()) };
}

/* ======================================================================
 * ref 126: Correio e web seguros (8.11 e 8.12)
 * ====================================================================== */

const LOJA = '203.0.113.10';
const DNS_VELHO = '192.168.1.53';
const DNS_NOVO = '192.168.1.54';
const IP_FALSO = '198.51.100.66';
const CONTATO = 'contato@loja.exemplo';

/**
 * A rede da escola (192.168.1.0/24, switch sw): ana, bia, dns1 (o resolvedor antigo, com porta fixa e sem validar
 * DNSSEC), dns2 (o resolvedor novo, que vem sem as defesas ligadas), mxesc (correio da escola) e a bancada do laboratório (espiao, na porta p5).
 * r1 e r2 levam à rede pública 203.0.113.0/24, com a loja (DNS assinado e web), o correio da loja e caio.
 */
function mundoCorreioWeb(o: { semente: number; desafio: boolean }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.aplicacao = true;
  m.flags.seguranca = true;
  const host = (nome: string, ip: string, gw: string, modelo: string) => adicionar(m, pc(nome, { ip: cidr(ip), gateway: gw, modelo }));
  host('ana', '192.168.1.10/24', '192.168.1.1', 'PC da secretaria da escola');
  host('bia', '192.168.1.11/24', '192.168.1.1', 'PC da coordenação da escola');
  host('dns1', '192.168.1.53/24', '192.168.1.1', 'Resolvedor antigo da escola (porta fixa, sem validar DNSSEC)');
  host('mxesc', '192.168.1.25/24', '192.168.1.1', 'Servidor de correio da escola');
  host('espiao', '192.168.1.66/24', '192.168.1.1', 'Bancada de testes do centro de operações');
  host('dns2', '192.168.1.54/24', '192.168.1.1', o.desafio ? 'Resolvedor novo, reinstalado (recursivo, sem as defesas)' : 'Resolvedor novo, recém-instalado (recursivo, defesas ainda desligadas)');
  host('loja', '203.0.113.10/24', '203.0.113.1', 'Servidor da loja: DNS de loja.exemplo e o site');
  host('correio', '203.0.113.25/24', '203.0.113.1', 'Servidor de correio da loja');
  host('caio', '203.0.113.30/24', '203.0.113.1', 'PC do atendimento da loja');
  const r1 = adicionar(m, roteador('r1', { modelo: 'Roteador da escola', interfaces: { p1: '192.168.1.1/24', p2: '198.51.100.1/30' }, rotas: [{ destino: '0.0.0.0/0', via: '198.51.100.2' }] }));
  adicionar(m, roteador('r2', { modelo: 'Roteador do provedor', interfaces: { p1: '198.51.100.2/30', p2: '203.0.113.1/24' }, rotas: [{ destino: '192.168.1.0/24', via: '198.51.100.1' }] }));
  adicionar(m, comutador('sw', { portas: 8 }));
  adicionar(m, comutador('sw2', { portas: 8 }));
  r1.portas.find((p) => p.nome === 'p2')!.velocidades = [10];
  ['ana', 'bia', 'dns1', 'mxesc', 'espiao', 'dns2'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw', porta: `p${i + 1}` }, 'cat6', 5));
  ligar(m, { equip: 'sw', porta: 'p8' }, { equip: 'r1', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'r1', porta: 'p2' }, { equip: 'r2', porta: 'p1' }, 'cat6', 90);
  ligar(m, { equip: 'r2', porta: 'p2' }, { equip: 'sw2', porta: 'p8' }, 'cat6', 5);
  ['loja', 'correio', 'caio'].forEach((n, i) => ligar(m, { equip: n, porta: 'eth0' }, { equip: 'sw2', porta: `p${i + 1}` }, 'cat6', 5));
  const s = (n: string) => m.equipamentos.get(n)!.s;
  s('loja').servicos = {
    dns: {
      zona: 'loja.exemplo',
      dnssec: true,
      registros: [
        { nome: 'www', tipo: 'A', valor: LOJA, ttl: 300 },
        { nome: '@', tipo: 'MX', valor: 'correio', prioridade: 10, ttl: 3600 },
        { nome: 'correio', tipo: 'A', valor: '203.0.113.25', ttl: 3600 },
      ],
    },
    web: { paginas: { '/': { conteudo: '<h1>Loja do laboratório</h1>' } }, https: o.desafio ? 'vencido' : 'valido' },
  };
  s('dns1').servicos = { dns: { zona: 'escola.exemplo', recursivo: true, registros: [{ nome: '@', tipo: 'MX', valor: 'mx', prioridade: 5 }, { nome: 'mx', tipo: 'A', valor: '192.168.1.25' }] } };
  // As defesas do dns2 (portas aleatórias e validação DNSSEC) ficam por conta de quem joga.
  s('dns2').servicos = { dns: { recursivo: true } };
  s('mxesc').servicos = { correio: { dominio: 'escola.exemplo' } };
  s('correio').servicos = { correio: { dominio: 'loja.exemplo', caixas: ['contato'] } };
  for (const n of ['ana', 'bia', 'mxesc', 'espiao', 'loja', 'correio', 'caio']) s(n).dns = DNS_VELHO;
  if (o.desafio) s('ana').dns = DNS_NOVO;
  // Quem recebe já tem par de chaves e publicou a pública.
  s('caio').correio = { endereco: CONTATO, servidor: '203.0.113.25' };
  s('caio').pgp = true;
  if (!o.desafio) s('bia').correio = { endereco: 'bia@escola.exemplo', servidor: '192.168.1.25' };
  // A porta p5, da bancada, espelha o switch inteiro: é por ela que o laboratório olha o tráfego.
  if (!o.desafio) s('sw').espelho = 'p5';
  return m;
}

interface RegistroPgp {
  de?: string;
  para?: string;
  assinada?: boolean;
  cifrada?: boolean;
  entregue?: boolean;
}

function cartaSegura(m: Mundo, de: string): boolean {
  const p = (m.flags.pgp ?? {}) as RegistroPgp;
  return p.de === de && p.para === CONTATO && !!p.assinada && !!p.cifrada && !!p.entregue;
}

/** O resolvedor guardou uma resposta forjada para o nome? */
function cacheForjado(m: Mundo, resolvedor: string, nome = 'www.loja.exemplo'): string | undefined {
  const cache = cacheDoResolvedor(m.equipamentos.get(resolvedor)!) as unknown as { entradas: Map<string, { registro: { valor: string; forjado?: boolean } }[]> };
  return cache.entradas.get(`${nome}. A`)?.find((x) => x.registro.forjado)?.registro.valor;
}

function dnsDe(m: Mundo, nome: string): { recursivo?: boolean; validar?: boolean; portasAleatorias?: boolean } | undefined {
  return (m.equipamentos.get(nome)!.s.servicos as { dns?: { recursivo?: boolean; validar?: boolean; portasAleatorias?: boolean } } | undefined)?.dns;
}

function defesasDns2(m: Mundo): boolean {
  const d = dnsDe(m, 'dns2');
  return !!d?.portasAleatorias && !!d.validar;
}

function defesasTexto(m: Mundo): string {
  const d = dnsDe(m, 'dns2');
  return `portas aleatórias ${d?.portasAleatorias ? 'ligadas' : 'desligadas'}, validação ${d?.validar ? 'ligada' : 'desligada'}`;
}

interface RegistroTls {
  de?: string;
  nome?: string;
  ok?: boolean;
  sni?: string;
  cadeia?: string;
}

function tlsOk(m: Mundo, de: string): RegistroTls | undefined {
  const t = m.flags.tls as RegistroTls | undefined;
  return t && t.de === de && t.ok && t.sni === 'www.loja.exemplo' ? t : undefined;
}

interface RegistroFarejar {
  de?: string;
  quadros?: number;
  cifrados?: number;
  segredos?: string[];
}

function sandboxOk(m: Mundo, programa: string): boolean {
  const s = m.flags.sandbox as { programa?: string; modo?: string; bloqueadas?: string[] } | undefined;
  return !!s && s.programa === programa && s.modo === 'sandbox' && (s.bloqueadas?.length ?? 0) > 0;
}

const d126D: Pergunta[] = [
  curta('1', 'Na carta que você mandou, o que vai cifrado com a chave pública de quem recebe: o texto inteiro ou só a chave de sessão? (responda "texto" ou "chave")', /^(a\s+)?chave(\s+de\s+sess[aã]o)?$/i),
];

const dia126: Dia = {
  numero: 126,
  ato: 7,
  titulo: 'Correio e web seguros',
  chamado: [
    'CHAMADO #0126',
    'A coordenação da escola manda as notas finais para a loja que imprime os boletins, e hoje cedo alguém da loja leu em voz alta, no balcão, uma nota que ainda nem tinha saído. O correio passa em claro por dois servidores e um provedor. Na mesma noite, o resolvedor antigo da escola começou a mandar gente para um endereço estranho quando digitam www.loja.exemplo.',
    'O laboratório do centro de operações tem uma bancada na porta espelhada do switch da escola e um resolvedor novo (dns2), recém-instalado, ainda com as defesas desligadas.',
    'Objetivo: mandar as notas assinadas e cifradas, ensaiar o envenenamento do resolvedor antigo, ligar as defesas do resolvedor novo (portas aleatórias e validação DNSSEC) e levar a secretaria para ele, abrir a loja por HTTPS e conferir o que a bancada enxerga, e testar a extensão suspeita numa sandbox.',
  ],
  manual: {
    titulo: 'Correio e web seguros',
    texto: [
      'Correio comum é um cartão-postal: o SMTP leva o texto em claro, e cada servidor do caminho guarda uma cópia. Cifrar o enlace (STARTTLS) protege um trecho por vez, mas cada servidor ainda lê tudo. Segurança de verdade no correio é de ponta a ponta, e o PGP faz assim: calcula o resumo (hash) do texto e assina esse resumo com a chave privada de quem manda; junta texto e assinatura e comprime; sorteia uma chave de sessão aleatória e cifra tudo com ela, numa cifra simétrica rápida; cifra só a chave de sessão com a chave pública de quem recebe; e codifica o resultado em base64, porque o correio só leva texto. Quem recebe usa a chave privada para abrir a chave de sessão, decifra, e confere a assinatura com a chave pública de quem mandou.',
      'De onde vem a chave pública certa? No PGP, cada pessoa tem um anel de chaves privadas (as suas) e um anel de chaves públicas (as dos outros), e a confiança é uma teia: você confere a impressão digital da chave de alguém pessoalmente ou confia porque alguém em quem você confia assinou aquela chave. No S/MIME a ideia de assinar e cifrar é a mesma, mas a chave pública vem dentro de um certificado X.509 emitido por uma autoridade certificadora, como na web.',
      'Na web, as ameaças vão da desfiguração (trocar a página de alguém) ao roubo de dados (cartões, senhas, cadastros) e à negação de serviço. E começam antes da página: no nome. O DNS pergunta por UDP e aceita a primeira resposta cujo identificador de 16 bits (e porta) bata com a pergunta. Quem envenena o cache faz o resolvedor perguntar e despeja respostas forjadas antes da verdadeira; com a porta sempre a mesma, só há 65536 identificadores para adivinhar, e uma resposta certa fica no cache pelo TTL inteiro, mandando todo cliente para o endereço falso. Duas defesas: sortear a porta de origem de cada consulta (mais uns 16 bits para adivinhar) e o DNSSEC, em que a zona assina cada conjunto de registros (RRSIG) com a sua chave (DNSKEY), o resumo dessa chave fica na zona mãe (DS), e o resolvedor que valida joga fora o que não tem assinatura certa.',
      'O TLS 1.3 é o que põe o S no HTTPS. No aperto de mão, o navegador manda o ClientHello com a sua metade de uma troca Diffie-Hellman e o nome do site no SNI, em claro; o servidor responde com a metade dele, e dali em diante tudo vai cifrado. O servidor mostra o certificado, o navegador sobe a cadeia até uma raiz confiável e confere que o servidor tem a chave privada daquele certificado; os dois derivam chaves de sessão do segredo combinado. Quem fareja vê os IPs, a porta 443, o SNI e o tamanho dos registros; não vê caminho, cookies nem conteúdo. Neste jogo o Diffie-Hellman usa números pequenos e a cifra é AES-128 em modo contador, no lugar do AES-GCM do TLS de verdade, para dar para acompanhar a conta.',
      'O último perigo vem de dentro do navegador: código que você não escreveu. Toda página traz scripts que rodam na sua máquina, e uma extensão instalada pode ler e mudar todas as páginas que você abre. A defesa é a caixa de areia (sandbox): o código roda isolado, sem tocar em arquivos, em outras páginas ou na rede além do que foi liberado. Assinatura de código diz de quem o programa veio, não se ele é bom; a sandbox limita o estrago mesmo quando a confiança falha.',
    ],
  },
  dicas: [
    'O PGP fica no PC bia: primeiro "Gerar chaves PGP", depois "Mandar e-mail assinado e cifrado" para contato@loja.exemplo. A chave pública de quem recebe já foi publicada.',
    'O envenenamento sai da bancada espiao contra o resolvedor 192.168.1.53. A defesa mora no dns2: "Portas de origem aleatórias no resolvedor" e "Validar DNSSEC no resolvedor". Depois, na ana, "Escolher o resolvedor de DNS" com o 192.168.1.54.',
    'Depois de abrir https://www.loja.exemplo/ na ana, "Farejar a rede" na espiao, e por fim "Rodar código não confiável" com a extensão, na sandbox.',
  ],
  montar: () => mundoCorreioWeb({ semente: 5126, desafio: false }),
  objetivo: (m) => {
    const forjado = cacheForjado(m, 'dns1');
    const t = tlsOk(m, 'ana');
    const f = m.flags.farejar as RegistroFarejar | undefined;
    const viu = !!f && f.de === 'espiao' && (f.cifrados ?? 0) > 0 && (f.segredos ?? []).length === 0;
    const dnsAna = m.equipamentos.get('ana')!.s.dns as string | undefined;
    return [
      item('notas da bia para contato@loja.exemplo, assinadas e cifradas com PGP, entregues', cartaSegura(m, 'bia@escola.exemplo'), m.flags.pgp?.entregue ? 'entregue' : 'ainda não'),
      item('envenenamento ensaiado: o resolvedor antigo (dns1) guardou o endereço falso de www.loja.exemplo', !!forjado, forjado ? `dns1 manda www.loja.exemplo para ${forjado}` : 'cache limpo'),
      item('o resolvedor novo (dns2) com portas aleatórias e validação DNSSEC', defesasDns2(m), defesasTexto(m)),
      item('a secretaria (ana) usando o resolvedor novo, 192.168.1.54', dnsAna === DNS_NOVO, `resolvedor da ana: ${dnsAna ?? 'nenhum'}`),
      item('ana abriu https://www.loja.exemplo/ com TLS 1.3 e certificado válido', !!t, t ? `SNI ${t.sni}, cadeia ${t.cadeia}` : 'ainda não'),
      item('a bancada farejou e só viu o HTTPS cifrado, sem segredo nenhum em claro', viu, f ? `${f.quadros ?? 0} quadros, ${f.cifrados ?? 0} cifrado(s), segredos: ${(f.segredos ?? []).length}` : 'ainda não farejou'),
      item('a extensão suspeita rodou na sandbox, com o que era perigoso negado', sandboxOk(m, 'extensao'), m.flags.sandbox ? `${m.flags.sandbox.programa} em modo ${m.flags.sandbox.modo}` : 'ainda não'),
    ];
  },
  posMorte: [
    'A nota vazou porque correio comum é cartão-postal: as notas saíram em claro do PC da coordenação, passaram pelo servidor da escola, pelo provedor e ficaram guardadas no servidor da loja, onde qualquer um com acesso à caixa lia. Com o PGP, a bia assinou o resumo do texto com a chave privada dela, uma chave de sessão sorteada cifrou texto e assinatura, e só essa chave de sessão foi cifrada com a chave pública de contato@loja.exemplo. Na caixa do servidor ficou um bloco em base64 entre BEGIN e END. Os cabeçalhos De, Para e Assunto continuam em claro: o PGP esconde o conteúdo, não quem fala com quem.',
    'O endereço estranho era o cache do resolvedor antigo. Ele pergunta sempre da mesma porta, então a resposta forjada só precisava acertar o identificador de 16 bits: com 100000 respostas, a chance foi de 78,3 %, e o endereço falso ficou guardado por 86400 s. O dns2 sorteia a porta de cada consulta (a chance cai para perto de zero) e confere as assinaturas DNSSEC da zona loja.exemplo, que já é assinada. E mesmo que o nome fosse desviado, o HTTPS ainda seguraria: o servidor falso não teria certificado válido para www.loja.exemplo.',
    'O que a bancada viu na porta espelhada conta o resto da história: as consultas de DNS e o SMTP em claro, e da ana para a loja só um registro TLS com o SNI www.loja.exemplo e bytes ilegíveis. Já a extensão "que deixa as páginas mais bonitas" tentou ler tudo que se digita em todos os sites e mandar o histórico para fora; na sandbox, só conseguiu mudar as cores.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'bia'],
      acao: 'sg-pgp',
      instrucao: 'No PC bia, gere o par de chaves PGP da coordenação.',
      porque: 'Assinar pede a chave privada de quem manda; a pública vai para os outros conferirem a assinatura e cifrarem para você.',
      conferir: (m) => (m.equipamentos.get('bia')!.s.pgp ? true : 'O par de chaves da bia ainda não existe.'),
      feito: 'Par de chaves de bia@escola.exemplo criado, com um identificador curto da chave pública. A privada fica só no PC; a impressão digital se confere por outro canal, como um telefonema.',
    }),
    passo({
      alvo: ['equip', 'bia'],
      acao: 'sg-correio-seguro',
      valores: { para: CONTATO, assunto: 'Notas finais', corpo: 'Notas finais do 9º ano: conferidas pela coordenação.' },
      instrucao: 'Mande as notas para contato@loja.exemplo, assinadas e cifradas.',
      porque: 'O PGP assina com a chave privada da bia e cifra para a chave pública da loja. Só quem tem a privada da loja abre.',
      conferir: (m) => {
        if (cartaSegura(m, 'bia@escola.exemplo')) return true;
        const p = (m.flags.pgp ?? {}) as RegistroPgp;
        if (p.para && p.para !== CONTATO) return `Foi para ${p.para}. As notas vão para contato@loja.exemplo, que publicou a chave pública.`;
        return 'A carta segura ainda não foi entregue.';
      },
      feito: 'Resumo SHA-256 assinado, chave de sessão AES sorteada cifrando texto e assinatura, chave de sessão cifrada com a pública da loja, tudo em base64. No servidor da loja fica um bloco ilegível. (O RSA do jogo usa números pequenos; o de verdade usa milhares de bits.)',
    }),
    passo({
      alvo: ['equip', 'espiao'],
      acao: 'sg-envenenar-dns',
      valores: { r: DNS_VELHO, nome: 'www.loja.exemplo', falso: IP_FALSO },
      instrucao: 'Da bancada espiao, no laboratório, tente envenenar o cache do resolvedor antigo (192.168.1.53) com um endereço falso para www.loja.exemplo.',
      porque: 'É o ataque que o chamado descreve. Ensaiar mostra por que ele funciona: porta fixa, e só um identificador de 16 bits para adivinhar.',
      conferir: (m) => (cacheForjado(m, 'dns1') ? true : 'O cache do dns1 continua limpo. Confira o resolvedor: o antigo é o 192.168.1.53.'),
      feito: 'Com a porta sempre a mesma, 100000 respostas forjadas tiveram 78,3 % de chance de acertar o identificador, e uma acertou. O dns1 vai mandar todo mundo para 198.51.100.66 por 86400 s. A zona é assinada, mas o dns1 não confere.',
    }),
    passo({
      alvo: ['equip', 'dns2'],
      acao: 'ap-servico-dns-portas',
      pedir: ['v'],
      exemplo: { v: 'on' },
      instrucao: 'No resolvedor novo (dns2), ligue as portas de origem aleatórias.',
      porque: 'O dns1 caiu porque pergunta sempre da mesma porta: o atacante só precisava adivinhar o identificador de 16 bits. Sorteando a porta de cada consulta, a resposta forjada precisa acertar as duas coisas.',
      conferir: (m) => (dnsDe(m, 'dns2')?.portasAleatorias ? true : 'As portas aleatórias do dns2 ainda estão desligadas.'),
      feito: 'Cada consulta do dns2 sai de uma das 64512 portas altas, sorteada. As mesmas 100000 respostas forjadas, que davam 78,3 % de chance contra o dns1, dariam perto de 0,002 %.',
    }),
    passo({
      alvo: ['equip', 'dns2'],
      acao: 'ap-servico-dns-validar',
      pedir: ['v'],
      exemplo: { v: 'on' },
      instrucao: 'Ainda no dns2, ligue a validação DNSSEC.',
      porque: 'Sorte não é garantia: com tentativas suficientes, alguma acerta id e porta. A zona loja.exemplo é assinada, e um resolvedor que confere a assinatura joga fora o que não tem RRSIG certo, acertando ou não.',
      conferir: (m) => (dnsDe(m, 'dns2')?.validar ? true : 'A validação DNSSEC do dns2 ainda está desligada.'),
      feito: 'Agora o dns2 confere a RRSIG de cada resposta de zona assinada com a DNSKEY da zona, e a chave pelo DS da zona de cima, até a raiz. Resposta forjada não tem como trazer assinatura que confira.',
    }),
    passo({
      alvo: ['equip', 'ana'],
      acao: 'ap-resolvedor',
      pedir: ['ip'],
      exemplo: { ip: DNS_NOVO },
      instrucao: 'Leve a secretaria (ana) para o resolvedor que se defende.',
      porque: 'O dns2 sorteia a porta de origem de cada consulta e valida DNSSEC: a resposta forjada precisa acertar muito mais bits e ainda trazer uma assinatura que não tem como forjar.',
      conferir: (m) => {
        const d = m.equipamentos.get('ana')!.s.dns as string | undefined;
        if (d === DNS_NOVO) return true;
        if (d === DNS_VELHO) return 'Esse é o dns1, o que acabou de ser envenenado.';
        return 'Esse servidor é o autoritativo da loja, não um resolvedor para os clientes. O novo é o 192.168.1.54.';
      },
      feito: 'Agora as consultas da ana saem pelo dns2. Contra ele, as mesmas 100000 respostas forjadas teriam uma chance perto de 0,002 %, e a que acertasse cairia na validação: sem RRSIG que confira com a chave da zona, é descartada.',
    }),
    passo({
      alvo: ['equip', 'ana'],
      acao: 'ap-navegar-https',
      valores: { url: 'https://www.loja.exemplo/' },
      instrucao: 'Na ana, abra https://www.loja.exemplo/.',
      porque: 'Veja o aperto de mão do TLS 1.3 por inteiro: a troca Diffie-Hellman, o SNI, a cadeia do certificado e a prova de que o servidor tem a chave privada.',
      conferir: (m) => {
        if (tlsOk(m, 'ana')) return true;
        const h = m.flags.http as { ok?: boolean; motivo?: string } | undefined;
        if (h?.motivo === 'dns' || h?.motivo === 'sem caminho') return 'O nome não levou à loja. A ana ainda está no resolvedor envenenado?';
        return 'A página segura ainda não abriu na ana.';
      },
      feito: 'O certificado de www.loja.exemplo subiu até a AC Raiz Exemplo, que está no repositório do navegador; o servidor assinou o aperto de mão; os dois derivaram a chave de sessão. O pedido e a resposta, com o cookie, foram cifrados.',
    }),
    passo({
      alvo: ['equip', 'espiao'],
      acao: 'sg-farejar',
      instrucao: 'Na bancada, que está na porta espelhada do switch, fareje a rede.',
      porque: 'A porta espelhada recebe cópia de tudo que passa pelo switch da escola. É o ponto de vista de quem escuta no meio.',
      conferir: (m) => {
        const f = m.flags.farejar as RegistroFarejar | undefined;
        if (!f) return 'Ainda não farejou.';
        return (f.cifrados ?? 0) > 0 ? true : 'Nada cifrado apareceu. Abra a página segura na ana antes de farejar.';
      },
      feito: 'Em claro: o diálogo SMTP entre a bia e o servidor da escola (o corpo, ali, já é o bloco do PGP) e as consultas de DNS, com nome perguntado e resposta. Da ana para a loja, só "TLS 1.3, SNI www.loja.exemplo" e bytes ilegíveis. Quem escuta sabe com que site você fala; não sabe o que você faz lá.',
    }),
    passo({
      alvo: ['equip', 'ana'],
      acao: 'sg-sandbox',
      valores: { p: 'extensao' },
      pedir: ['modo'],
      exemplo: { modo: 'sandbox' },
      instrucao: 'Alguém da secretaria quer instalar uma extensão que "deixa as páginas mais bonitas". Rode-a do jeito seguro.',
      porque: 'Extensão roda dentro do navegador, com acesso a todas as páginas. Código de origem desconhecida só com o mínimo de permissões.',
      conferir: (m) => {
        if (sandboxOk(m, 'extensao')) return true;
        if (m.flags.sandbox?.modo === 'direto') return 'Rodou direto, com todo o poder: leu o que se digita e mandou o histórico para fora. Rode de novo, na sandbox.';
        return 'A extensão ainda não rodou.';
      },
      feito: 'Na sandbox, mudar as cores passou; ler tudo que é digitado e mandar o histórico para um servidor de fora foram negados. A sandbox não descobre se o código é bom; ela só não deixa ele fazer o que não pode.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O envelope do PGP',
        texto: ['Assinar usa a chave de quem manda; cifrar usa a de quem recebe. A cifra pesada (de chave pública) só cifra a chave de sessão, que é pequena; o texto vai na simétrica, que é rápida. O PGP do jogo pula a compressão e usa um RSA de números pequenos.'],
        visual: {
          tipo: 'camadas',
          camadas: ['base64: texto blindado entre BEGIN e END, porque o correio só leva texto', 'chave de sessão cifrada com a chave PÚBLICA de quem recebe', 'texto e assinatura comprimidos e cifrados com a chave de sessão (AES)', 'assinatura: resumo SHA-256 do texto, assinado com a chave PRIVADA de quem manda', 'o texto das notas'],
          rotulo: 'de fora para dentro',
        },
      },
      {
        titulo: 'PGP ou S/MIME?',
        texto: ['Os dois assinam e cifram o corpo do mesmo jeito. A diferença é de onde vem a confiança na chave pública.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'PGP', 'S/MIME'],
          linhas: [
            ['a chave pública vem', 'de quem você conhece, num anel de chaves', 'num certificado X.509'],
            ['quem garante', 'a teia de confiança: pessoas assinam chaves de pessoas', 'uma autoridade certificadora'],
            ['os cabeçalhos De, Para, Assunto', 'em claro', 'em claro'],
          ],
        },
      },
      {
        titulo: 'Envenenar um cache',
        texto: ['A resposta forjada precisa chegar antes da verdadeira e acertar o que a pergunta levou. Com 100000 tentativas: porta fixa, 78,3 % de chance; porta sorteada, perto de zero. E com DNSSEC validado, nem acertar adianta.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Resolvedor', 'O que o atacante adivinha', 'Resultado'],
          linhas: [
            ['porta fixa, sem validar', 'id de 16 bits (65536 valores)', 'envenenado por 86400 s'],
            ['porta sorteada', 'id e porta (cerca de 32 bits)', 'nenhuma acerta'],
            ['valida DNSSEC', 'teria de forjar a RRSIG da zona', 'resposta forjada descartada'],
          ],
        },
      },
      {
        titulo: 'O que o farejador vê no TLS 1.3',
        texto: ['O aperto de mão abre em claro e fecha cifrado. O SNI precisa ir em claro para o servidor saber qual certificado mostrar.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'nav', rotulo: 'navegador da ana', x: 80, y: 140 },
            { id: 'meio', rotulo: 'quem fareja: IPs, porta 443, SNI, tamanhos', x: 280, y: 40 },
            { id: 'srv', rotulo: 'www.loja.exemplo', x: 480, y: 140 },
          ],
          ligacoes: [
            ['nav', 'srv', 'ClientHello (SNI e metade do DH, em claro)'],
            ['srv', 'nav', 'ServerHello, certificado, assinatura, Finished (cifrados)'],
            ['nav', 'meio', 'só vê o envelope'],
          ],
        },
      },
      {
        titulo: 'Código dos outros',
        texto: ['Scripts das páginas e extensões rodam na sua máquina. A sandbox deixa rodar e limita o que o código alcança.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['A extensão tenta', 'Direto', 'Na sandbox'],
          linhas: [
            ['mudar as cores da página', 'feito', 'feito'],
            ['ler tudo que é digitado em todos os sites', 'feito, sem aviso', 'negado'],
            ['mandar o histórico para fora', 'feito, sem aviso', 'negado'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Num e-mail com PGP, por que o texto é cifrado com uma chave de sessão aleatória, e não direto com a chave pública de quem recebe?',
      opcoes: [
        'Porque a cifra de chave pública é lenta: ela só cifra a chave de sessão, pequena, e a cifra simétrica cuida do texto',
        'Porque a chave pública de quem recebe é secreta',
        'Porque a chave de sessão é a mesma para todos os e-mails, e assim o servidor consegue ler',
        'Porque o base64 só funciona com chave simétrica',
      ],
      certa: 0,
      explicacao: 'Cifra de chave pública custa caro por byte. O PGP sorteia uma chave de sessão nova a cada mensagem, cifra o texto com ela numa cifra simétrica rápida e usa a chave pública só para embrulhar essa chave. Quem recebe abre a chave de sessão com a privada e decifra o resto.',
    },
  },
  desafio: {
    carta: [
      'Na manhã seguinte, a secretaria (ana) também precisa mandar documentos para a loja, mas nunca configurou o correio nem tem chaves. O resolvedor novo (dns2) foi reinstalado e voltou sem defesa nenhuma: nem portas aleatórias, nem validação DNSSEC. E o site da loja amanheceu com o certificado vencido.',
      'O conserto das portas fica para a equipe do resolvedor. Antes, o laboratório quer provar que a validação, sozinha, já segura o envenenamento: ligue só ela.',
      'Objetivo: a conta da ana no servidor da escola, uma carta assinada e cifrada para contato@loja.exemplo, a validação DNSSEC ligada no dns2 e o ensaio de envenenamento contra ele barrado pelo DNSSEC, a loja com certificado válido aberta por HTTPS na ana, o jogo "grátis" testado na sandbox e a pergunta respondida.',
    ],
    dicas: [
      'A conta da ana é ana@escola.exemplo, no servidor 192.168.1.25. Depois, chaves PGP e o e-mail seguro, como fez a bia.',
      'O certificado se troca no servidor loja, em "Ligar HTTPS". No dns2, "Validar DNSSEC no resolvedor" (as portas aleatórias, não: com elas a resposta forjada nem acerta, e o ensaio não prova nada). O ensaio sai da espiao contra o 192.168.1.54.',
      'Na carta, a chave pública da loja embrulha só a chave de sessão.',
    ],
    perguntas: d126D,
    montar: () => mundoCorreioWeb({ semente: 6126, desafio: true }),
    objetivo: (m) => {
      const d = m.flags.dnssec as { rejeitada?: boolean; resolvedor?: string } | undefined;
      const barrado = !!d && d.rejeitada === true && d.resolvedor === 'dns2' && !cacheForjado(m, 'dns2');
      const t = tlsOk(m, 'ana');
      return [
        item('carta da ana para contato@loja.exemplo, assinada e cifrada, entregue', cartaSegura(m, 'ana@escola.exemplo'), m.flags.pgp?.de ?? 'ainda não'),
        item('validação DNSSEC ligada no dns2', !!dnsDe(m, 'dns2')?.validar, defesasTexto(m)),
        item('envenenamento contra o dns2 acertou o id, mas foi descartado pelo DNSSEC', barrado, d ? `zona assinada: ${d.rejeitada ? 'forjada rejeitada' : 'nada rejeitado ainda'}` : 'ainda não ensaiado'),
        item('ana abriu https://www.loja.exemplo/ com certificado válido', !!t && t.cadeia === 'valida', t ? `cadeia ${t.cadeia}` : (m.flags.tls as RegistroTls | undefined)?.cadeia ? `certificado ${(m.flags.tls as RegistroTls).cadeia}` : 'ainda não'),
        item('o jogo "grátis" rodou na sandbox, com o perigoso negado', sandboxOk(m, 'jogo-gratis'), m.flags.sandbox ? `${m.flags.sandbox.programa} em modo ${m.flags.sandbox.modo}` : 'ainda não'),
        ...todasRespondidas(m, d126D),
      ];
    },
    solucao: [
      ['equip', 'ana', 'ap-correio-conta', { end: 'ana@escola.exemplo', srv: '192.168.1.25' }],
      ['equip', 'ana', 'sg-pgp'],
      ['equip', 'ana', 'sg-correio-seguro', { para: CONTATO, assunto: 'Documentos', corpo: 'Seguem os documentos da secretaria.' }],
      ['equip', 'dns2', 'ap-servico-dns-validar', { v: 'on' }],
      ['equip', 'espiao', 'sg-envenenar-dns', { r: DNS_NOVO, nome: 'www.loja.exemplo', falso: IP_FALSO }],
      ['equip', 'loja', 'ap-servico-https', { tipo: 'valido' }],
      ['equip', 'ana', 'ap-navegar-https', { url: 'https://www.loja.exemplo/' }],
      ['equip', 'ana', 'sg-sandbox', { p: 'jogo-gratis', modo: 'sandbox' }],
    ],
    respostas: { '1': 'chave' },
  },
};

/* ======================================================================
 * ref 127: O ponto de troca (8.13)
 * ====================================================================== */

const AS_FIM = 64500;
const AS_ESTRADA = 64501;
const AS_VIZINHA = 64502;
const AS_LAB = 64510;
const AS_ATALHO = 64511;
const FONTE = '10.9.0.10';
const IX_BORDA = '10.250.0.1';
const IX_ESTRADA = '10.250.0.2';
const IX_VIZINHA = '10.250.0.3';
const REDE_REDACAO = '10.8.0.0/24';
const REDE_FONTE = '10.9.0.0/24';
const SEGREDO_1 = 'Cebola-primeira-camada-2026';
const SEGREDO_2 = 'Cebola-segunda-camada-2026';

type Membro = [ip: string, asn: number];

/**
 * O ponto de troca de tráfego de Fim de Linha: o switch ptt, onde cada rede pluga um roteador e troca rotas por BGP
 * com todas as outras, como pares. A borda (AS 64500, a cidade, 192.0.2.0/24) tem também a redação do jornal
 * (10.8.0.0/24); a estrada (AS 64501) leva ao portal do mundo (203.0.113.0/24) e à fonte do jornal (10.9.0.0/24);
 * a vizinha (AS 64502) é o nó do meio do caminho em camadas; o lab-rt (AS 64510) é o roteador de ensaio do centro
 * de operações. No desafio entra a Rede Atalho (AS 64511), membro novo que anunciou um pedaço do bloco da cidade.
 */
function mundoTroca(o: { semente: number; desafio: boolean }): Mundo {
  const m = novoMundo(o.semente);
  m.flags.camadaRede = true;
  m.flags.seguranca = true;
  adicionar(m, pc('redacao', { ip: cidr('10.8.0.10/24'), gateway: '10.8.0.1', modelo: 'PC da redação do jornal da cidade' }));
  adicionar(m, pc('teste', { ip: cidr('192.0.2.50/24'), gateway: '192.0.2.1', modelo: 'PC de testes do centro de operações, na rede da cidade' }));
  adicionar(m, pc('fonte', { ip: cidr('10.9.0.10/24'), gateway: '10.9.0.1', modelo: 'Servidor do jornal parceiro, na capital' }));
  adicionar(m, pc('portal', { ip: cidr('203.0.113.10/24'), gateway: '203.0.113.1', modelo: 'Portal de serviços do estado (o "mundo")' }));
  adicionar(m, roteador('borda', { modelo: 'Roteador de borda de Fim de Linha (AS 64500)', interfaces: { lan: '192.0.2.1/24', red: '10.8.0.1/24', ix: `${IX_BORDA}/24` }, rotas: [{ destino: REDE_FONTE, via: IX_VIZINHA }] }));
  adicionar(m, roteador('estrada', { modelo: 'Roteador do provedor Estrada Larga (AS 64501)', interfaces: { ix: `${IX_ESTRADA}/24`, mundo: '203.0.113.1/24', fonte: '10.9.0.1/24' }, rotas: [{ destino: REDE_REDACAO, via: IX_VIZINHA }] }));
  adicionar(m, roteador('vizinha', { modelo: 'Roteador da cidade vizinha (AS 64502), nó do meio', interfaces: { ix: `${IX_VIZINHA}/24`, lan: '198.51.100.1/24' }, rotas: [{ destino: REDE_REDACAO, via: IX_BORDA }, { destino: REDE_FONTE, via: IX_ESTRADA }] }));
  adicionar(m, roteador('lab-rt', { modelo: 'Roteador de ensaio do centro de operações (AS 64510)', interfaces: { ix: '10.250.0.10/24' } }));
  adicionar(m, comutador('ptt', { portas: 8, modelo: 'Switch do ponto de troca de tráfego' }));
  adicionar(m, comutador('sw', { portas: 4, modelo: 'Switch da rede da cidade' }));
  ligar(m, { equip: 'redacao', porta: 'eth0' }, { equip: 'borda', porta: 'red' }, 'cat6', 30, { id: 'c1' });
  ligar(m, { equip: 'teste', porta: 'eth0' }, { equip: 'sw', porta: 'p1' }, 'cat6', 10, { id: 'c2' });
  ligar(m, { equip: 'sw', porta: 'p4' }, { equip: 'borda', porta: 'lan' }, 'cat6', 10, { id: 'c3' });
  ligar(m, { equip: 'borda', porta: 'ix' }, { equip: 'ptt', porta: 'p1' }, 'cat6', 5, { id: 'c4' });
  ligar(m, { equip: 'estrada', porta: 'ix' }, { equip: 'ptt', porta: 'p2' }, 'cat6', 5, { id: 'c5' });
  ligar(m, { equip: 'vizinha', porta: 'ix' }, { equip: 'ptt', porta: 'p3' }, 'cat6', 5, { id: 'c6' });
  ligar(m, { equip: 'lab-rt', porta: 'ix' }, { equip: 'ptt', porta: 'p4' }, 'cat6', 5, { id: 'c7' });
  ligar(m, { equip: 'estrada', porta: 'mundo' }, { equip: 'portal', porta: 'eth0' }, 'cat6', 10, { id: 'c8' });
  ligar(m, { equip: 'estrada', porta: 'fonte' }, { equip: 'fonte', porta: 'eth0' }, 'cat6', 10, { id: 'c9' });
  m.proxCabo = 10;
  const membros: Membro[] = [
    [IX_BORDA, AS_FIM],
    [IX_ESTRADA, AS_ESTRADA],
    [IX_VIZINHA, AS_VIZINHA],
    ['10.250.0.10', AS_LAB],
  ];
  if (o.desafio) {
    adicionar(m, roteador('atalho', { modelo: 'Roteador da Rede Atalho (AS 64511), membro novo do ponto de troca', interfaces: { ix: '10.250.0.11/24' } }));
    ligar(m, { equip: 'atalho', porta: 'ix' }, { equip: 'ptt', porta: 'p5' }, 'cat6', 5, { id: 'c10' });
    m.proxCabo = 11;
    membros.push(['10.250.0.11', AS_ATALHO]);
  }
  const bgp = (r: string, asn: number, anuncia: string[]) => {
    const eu = membros.find((x) => x[1] === asn)![0];
    m.equipamentos.get(r)!.s.bgp = { asn, vizinhos: membros.filter((x) => x[0] !== eu).map(([ip, n]) => ({ ip, asn: n, relacao: 'par' as const })), anuncia } satisfies ConfigBgp;
  };
  bgp('borda', AS_FIM, ['192.0.2.0/24']);
  bgp('estrada', AS_ESTRADA, ['203.0.113.0/24']);
  bgp('vizinha', AS_VIZINHA, ['198.51.100.0/24']);
  bgp('lab-rt', AS_LAB, []);
  // Um erro de digitação na Rede Atalho: 192.0.2.128/25 no lugar do bloco dela.
  if (o.desafio) bgp('atalho', AS_ATALHO, ['192.0.2.128/25']);
  // O caminho em camadas: o nó do meio (vizinha) já topou e tem as duas pontas configuradas.
  const s = (n: string) => m.equipamentos.get(n)!.s;
  const tunel = (nome: string, par: string, local: string, remota: string, segredo: string, n: number) => ({ nome, par, local, remota, segredo, spi: 0x1000 + n * 0x101, contadores: { cifrados: 0, decifrados: 0 } });
  s('vizinha').vpn = {
    'para-borda': tunel('para-borda', IX_BORDA, REDE_FONTE, REDE_REDACAO, SEGREDO_1, 1),
    'para-estrada': tunel('para-estrada', IX_ESTRADA, REDE_REDACAO, REDE_FONTE, SEGREDO_2, 2),
  };
  if (o.desafio) s('borda').vpn = { cebola: tunel('cebola', IX_VIZINHA, REDE_REDACAO, REDE_FONTE, SEGREDO_1, 1) };
  else s('estrada').vpn = { cebola: tunel('cebola', IX_VIZINHA, REDE_FONTE, REDE_REDACAO, SEGREDO_2, 1) };
  calcularBgp(m);
  // Os túneis que já vêm montados aparecem em m.flags.vpnPor desde o começo, como os criados pelo console.
  refrescarVpns(m);
  return m;
}

interface TunelSalvo {
  par: string;
  local: string;
  remota: string;
  segredo: string;
  ativo: boolean;
  cifrados: number;
  decifrados: number;
}

/** Os túneis do roteador como o motor resume em m.flags.vpnPor (redes, segredo, estado do IKE e contadores). */
function tuneis(m: Mundo, r: string): TunelSalvo[] {
  return ((m.flags.vpnPor as Record<string, TunelSalvo[]> | undefined)?.[r] ?? []) as TunelSalvo[];
}

/** O túnel de uma ponta até o nó do meio, com as redes e o segredo que o nó do meio espera. */
function tunelAoMeio(m: Mundo, r: string, local: string, remota: string, segredo: string): TunelSalvo | undefined {
  return tuneis(m, r).find((t) => t.par === IX_VIZINHA && t.local === local && t.remota === remota && t.segredo === segredo);
}

function pingFonte(m: Mundo): boolean {
  const p = registroPing(m, 'redacao', FONTE);
  return !!p && p.recebidos > 0;
}

interface Sequestro {
  roteador: string;
  especifico: string;
  origem: number;
  coberto: string;
  legitimo: number;
}

function sequestros(m: Mundo): Sequestro[] {
  return (m.flags.bgp?.sequestros ?? []) as Sequestro[];
}

function anunciaAlheio(m: Mundo, r: string): string[] {
  const cfg = m.equipamentos.get(r)?.s.bgp as ConfigBgp | undefined;
  return (cfg?.anuncia ?? []).filter((p) => p.startsWith('192.0.2.') || p.startsWith('203.0.113.') || p.startsWith('198.51.100.'));
}

function antiOk(m: Mundo): boolean {
  return !!m.equipamentos.get('borda')!.s.antiFalsificacao;
}

const d127: Pergunta[] = [curta('1', 'Com o /25 de ensaio no ar, segundo o alerta da estrada, que AS passou a originar 192.0.2.0/25?', /^(as\s*)?64510$/i)];

const d127D: Pergunta[] = [
  curta('1', 'Segundo o alerta do BGP, que AS está originando 192.0.2.128/25?', /^(as\s*)?64511$/i),
  curta('2', 'Num caminho em cebola com três nós, quantos nós sabem, ao mesmo tempo, quem você é e com quem você fala?', /^(0|zero|nenhum)$/i),
];

const dia127: Dia = {
  numero: 127,
  ato: 7,
  titulo: 'O ponto de troca',
  chamado: [
    'CHAMADO #0127',
    'Aprovado: o switch que a prefeitura instalou no centro de operações vira o ponto de troca de tráfego da região. A cidade, o provedor Estrada Larga e a cidade vizinha já plugaram os roteadores e trocam rotas por BGP ali mesmo, sem dar a volta pela capital. Com isso, o tráfego dos outros passa a atravessar Fim de Linha.',
    'Duas exigências antes da inauguração: o jornal da cidade quer falar com a fonte dele na capital sem que nenhum ponto do caminho saiba as duas pontas, e as outras redes querem ver que a cidade não deixa sair endereço forjado e percebe quando alguém anuncia o que não é seu.',
    'Objetivo: montar a primeira camada do caminho da redação (o túnel da borda até o nó do meio), provar que a fonte responde e ver o que o meio enxerga, ligar o filtro antifalsificação na borda, ensaiar um sequestro de prefixo a partir do roteador de laboratório, responder a pergunta e desfazer o ensaio.',
  ],
  manual: {
    titulo: 'Rede e sociedade: privacidade, censura e direitos',
    texto: [
      'Cifrar esconde o conteúdo, mas não quem fala com quem: os endereços vão em claro em todo pacote. Para isso existem os remetentes anônimos (servidores que recebem a mensagem, tiram o remetente e passam adiante, de preferência encadeados) e o roteamento em cebola. Nele, quem manda escolhe três nós e embrulha o pacote em três camadas de cifra, uma para cada nó. O primeiro tira a sua camada e só sabe de quem veio e para quem passar; o do meio, idem; o último tira a última e entrega ao destino. O nó de entrada sabe quem você é, mas não aonde vai; o de saída sabe aonde vai (e vê o conteúdo, se ele não for cifrado de ponta a ponta), mas não quem você é; ninguém sabe os dois. O que sobra é o tempo: quem vê a entrada e a saída ao mesmo tempo pode tentar casar os horários.',
      'A mesma rede que liga serve para calar. A censura bloqueia nomes no DNS (o resolvedor mente ou diz que o nome não existe), bloqueia endereços IP (e derruba junto todo site inocente que divide aquele IP) ou inspeciona o tráfego atrás de palavras e do SNI. Cada bloqueio tem contorno (outro resolvedor, uma VPN, a cebola), e a esteganografia vai além: esconde a mensagem dentro de algo inocente, como os bits menos significativos dos pixels de uma foto, que mudam a cor de forma invisível ao olho.',
      'Direitos autorais também mudaram com a rede: a cópia digital é perfeita e de graça, e quem vive de obra quer controle. A gestão de direitos digitais (DRM) cifra a obra e só deixa usar nos aparelhos autorizados, às vezes travando até o que a lei permite. O uso legítimo permite citar, criticar, ensinar e parodiar trechos. E a regra de notificação e retirada diz que o provedor que tira do ar o conteúdo apontado pelo dono não responde pelo que o usuário publicou; o abuso aparece quando avisos automáticos derrubam o que era legítimo.',
      'Um ponto de troca de tráfego (PTT) é um switch onde várias redes plugam um roteador e trocam tráfego direto, como pares, cada uma anunciando por BGP os próprios blocos. O tráfego entre duas cidades vizinhas deixa de dar a volta pela capital: menos atraso, menos custo. Em troca, cada membro assume deveres com os outros: não deixar sair pacote com origem que não é sua (o filtro antifalsificação, BCP 38), não anunciar prefixo alheio e perceber quando alguém anuncia. O BGP aceita o prefixo mais específico sem perguntar de quem é: um /25 dentro do /24 de outro AS ganha em todo roteador. O alerta de origem diferente é o primeiro sinal; a defesa de verdade é filtrar o que cada vizinho pode anunciar e conferir a origem com registros assinados (RPKI).',
    ],
  },
  dicas: [
    'O túnel da borda vai para o nó do meio, a vizinha (10.250.0.3), com a rede da redação (10.8.0.0/24) daqui e a da fonte (10.9.0.0/24) de lá. A vizinha já tem a outra ponta configurada, com o segredo pré-preenchido.',
    'Depois do ping da redação até 10.9.0.10, "O que o meio do caminho vê do túnel" na borda mostra só o cabeçalho de fora.',
    'O ensaio de sequestro é no lab-rt, anunciando 192.0.2.0/25. Responda pelo alerta e retire o prefixo no próprio lab-rt.',
  ],
  perguntas: d127,
  montar: () => mundoTroca({ semente: 5127, desafio: false }),
  objetivo: (m) => {
    const t = tunelAoMeio(m, 'borda', REDE_REDACAO, REDE_FONTE, SEGREDO_1);
    const cap = m.flags.vpn?.captura as { externo?: string; protocolo?: number } | undefined;
    const alheio = anunciaAlheio(m, 'lab-rt');
    const seq = sequestros(m);
    return [
      item('túnel da borda até o nó do meio (vizinha) para a rede da fonte, com a outra ponta fechando', !!t, t ? `${t.local} para ${t.remota} via ${t.par}` : 'ainda não'),
      item('a redação alcança a fonte (10.9.0.10) pelo caminho em camadas', !!t && pingFonte(m) && t.cifrados > 0, t ? `${t.cifrados} pacote(s) cifrado(s) na borda` : 'sem túnel'),
      item('visto o que o meio do caminho enxerga: só ESP entre a borda e o nó do meio', cap?.protocolo === 50, cap?.externo ?? 'ainda não'),
      item('filtro antifalsificação ligado na borda de Fim de Linha', antiOk(m), antiOk(m) ? 'ligado' : 'desligado'),
      ...todasRespondidas(m, d127),
      item('ensaio desfeito: ninguém no ponto de troca anuncia prefixo alheio', !alheio.length && !seq.length, alheio.length ? `lab-rt anuncia ${alheio.join(', ')}` : seq.length ? `${seq.length} alerta(s)` : 'limpo'),
    ];
  },
  posMorte: [
    'O caminho da redação ficou em duas camadas de túnel: a borda cifra para a vizinha, a vizinha abre e cifra de novo para a estrada, que entrega à fonte. No switch do ponto de troca, quem olhasse veria ESP da borda para a vizinha e ESP da vizinha para a estrada, nunca um pacote da redação para a fonte. Com honestidade: isto é uma corrente de túneis, não uma cebola de verdade. Na corrente, o nó do meio abre o pacote inteiro e sabe as duas pontas; na cebola, as camadas vão uma dentro da outra, desde a origem, e cada nó só consegue tirar a sua. O jornal ganhou um começo; anonimato de verdade pede três nós, camadas aninhadas e um nó do meio que não conhece ninguém.',
    'O ensaio de sequestro mostrou por que um ponto de troca precisa de vigia. Bastou o lab-rt anunciar 192.0.2.0/25 para todo roteador da troca, inclusive a própria borda, preferir o /25 ao /24 legítimo: o mais específico vence sempre. Com o filtro antifalsificação ligado, a borda passou a achar que a rota de volta para metade da cidade saía pelo ponto de troca, e passaria a descartar como forjado o tráfego da própria rede: o PC de testes, em 192.0.2.50, ficaria sem saída. Um anúncio errado derruba até quem está certo. Retirado o prefixo, tudo voltou, e o alerta do BGP é o primeiro sinal que a operação vai vigiar todas as noites.',
    'E assim Fim de Linha virou ponto de troca de tráfego. O caminho começou num galpão sem senha e num bit virando sinal no cobre, na fibra e no ar; passou por quadros, retransmissões, o meio dividido do bairro, endereços, rotas e BGP, conversas confiáveis e justas, nomes, correio, a teia e a final ao vivo no estádio, até as cifras e defesas desta última noite. A cidade que não tinha internet agora é por onde a internet da região passa. Quem chegou até aqui aprendeu a rede de baixo para cima, e também que ela é feita de pessoas: é a camada 8 que decide o que a rede vai ser.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-vpn',
      valores: { nome: 'cebola', local: REDE_REDACAO, remota: REDE_FONTE, segredo: SEGREDO_1 },
      pedir: ['par'],
      exemplo: { par: IX_VIZINHA },
      instrucao: 'Na borda, monte a primeira camada do caminho da redação: o túnel até o nó do meio.',
      porque: 'Se a borda cifrasse direto para a estrada, o cabeçalho de fora diria as duas pontas. Indo pelo nó do meio, cada trecho só mostra os dois vizinhos daquele trecho.',
      conferir: (m) => {
        if (tunelAoMeio(m, 'borda', REDE_REDACAO, REDE_FONTE, SEGREDO_1)) return true;
        const t = tuneis(m, 'borda')[0];
        if (t && t.par === IX_ESTRADA) return 'Esse é o túnel direto até a estrada: o meio do caminho veria a borda falando com quem tem a fonte. E a estrada nem tem túnel para a borda. A outra ponta é o nó do meio.';
        if (t && t.par !== IX_VIZINHA) return `Ninguém espera um túnel da borda em ${t.par}. O nó do meio é a vizinha, no ponto de troca.`;
        return 'O túnel ainda não fecha com o nó do meio.';
      },
      feito: 'IKE fechado com a vizinha: as duas pontas combinaram cifra e Diffie-Hellman e provaram que conhecem o mesmo segredo. O que for da redação para a rede da fonte sai em ESP até 10.250.0.3, e o MTU efetivo cai para 1427 bytes.',
    }),
    passo({
      alvo: ['equip', 'redacao'],
      acao: 'ping',
      valores: { destino: FONTE, n: '4' },
      instrucao: 'Da redação, faça ping na fonte do jornal (10.9.0.10).',
      porque: 'A fonte fica numa rede privada que não é anunciada no ponto de troca. Só chega quem passa pelos túneis.',
      conferir: (m) => (pingFonte(m) ? true : 'A fonte não respondeu. O túnel da borda está fechado com a vizinha?'),
      feito: 'Ida: a borda cifra para a vizinha, a vizinha decifra e cifra de novo para a estrada, a estrada decifra e entrega. A volta faz o caminho contrário, com as mesmas duas camadas.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-vpn-captura',
      instrucao: 'Na borda, veja o último pacote do túnel do jeito que o ponto de troca vê.',
      porque: 'É a pergunta de sempre em privacidade: quem pode ver o quê. Aqui, o switch da troca e quem estivesse espelhando uma porta dele.',
      conferir: (m) => (m.flags.vpn?.captura?.protocolo === 50 ? true : 'Nada passou pelo túnel ainda. Faça o ping da redação antes.'),
      feito: 'Por fora: IP 10.250.0.1 para 10.250.0.3, protocolo 50 (ESP), carga cifrada. Nem a redação, nem a fonte, nem que era ping. Só as pontas do trecho sabem o que vai dentro. E o nó do meio, que abre o pacote, sabe as duas: por isso a cebola de verdade aninha as camadas.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-antifalsificacao',
      valores: { v: 'on' },
      instrucao: 'Ainda na borda, ligue o filtro antifalsificação.',
      porque: 'Membro de ponto de troca não deixa sair pacote com origem que não é dele. É o que impede a cidade de virar plataforma de ataque com endereço forjado.',
      conferir: (m) => (antiOk(m) ? true : 'O filtro continua desligado na borda.'),
      feito: 'Filtro de entrada ligado (BCP 38): pacote que chega por uma interface com origem que a rota de volta não mandaria por ela é descartado. Da rede da cidade, só sai origem 192.0.2.0/24; da redação, 10.8.0.0/24.',
    }),
    passo({
      alvo: ['equip', 'lab-rt'],
      acao: 'sg-bgp-sequestro',
      valores: { p: '192.0.2.0/25' },
      instrucao: 'No roteador de ensaio (lab-rt), anuncie 192.0.2.0/25, a metade de baixo do bloco da cidade.',
      porque: 'É o ensaio do pior erro num ponto de troca. Um prefixo mais específico, de outro AS, vence o legítimo em todo roteador que o recebe.',
      conferir: (m) => (sequestros(m).some((x) => x.roteador === 'estrada' && x.especifico === '192.0.2.0/25') ? true : 'A estrada ainda não recebeu o /25. Confira o prefixo: 192.0.2.0/25.'),
      feito: 'Todos os roteadores da troca ficaram com dois caminhos para a cidade: o /24 da borda e o /25 do lab-rt, e o /25 ganhou. O alerta de origem diferente apareceu em cada um, inclusive na borda, que agora acha que metade da própria cidade fica do outro lado do ponto de troca.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '64510' },
      instrucao: 'Segundo o alerta da estrada, que AS passou a originar 192.0.2.0/25?',
      porque: 'O BGP leva o caminho de AS em cada anúncio, e o último número é quem originou. Quando o prefixo mais específico tem origem diferente do que o cobre, algo está errado.',
      feito: 'AS 64510, o laboratório, enquanto o /24 vem do AS 64500. Num sequestro de verdade, este número é por onde começa a ligação para o outro lado, e a prova para filtrar.',
    }),
    passo({
      alvo: ['equip', 'lab-rt'],
      acao: 'rot-bgp-retirar',
      valores: { p: '192.0.2.0/25' },
      instrucao: 'Desfaça o ensaio: retire o /25 do lab-rt.',
      porque: 'Ensaio que fica no ar vira incidente. A retirada vai para todos os pares, que voltam a usar o /24 da borda.',
      conferir: (m) => (!anunciaAlheio(m, 'lab-rt').length && !sequestros(m).length ? true : 'O lab-rt ainda anuncia um prefixo da cidade.'),
      feito: 'Retirado. Todos os pares voltaram ao 192.0.2.0/24 da borda, o alerta sumiu e o filtro antifalsificação parou de estranhar a própria cidade. O ponto de troca está pronto para inaugurar.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Quem sabe o quê na cebola',
        texto: ['Três camadas de cifra, uma por nó, uma dentro da outra. Cada nó tira a sua e só conhece o anterior e o próximo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Quem', 'Sabe quem você é?', 'Sabe aonde você vai?', 'Vê o conteúdo?'],
          linhas: [
            ['o seu provedor', 'sim', 'não: só o nó de entrada', 'não'],
            ['nó de entrada', 'sim', 'não: só o nó do meio', 'não'],
            ['nó do meio', 'não', 'não', 'não'],
            ['nó de saída', 'não', 'sim', 'só se não houver TLS até o destino'],
            ['o destino', 'não: vê o nó de saída', 'é ele', 'sim'],
          ],
        },
      },
      {
        titulo: 'Três jeitos de censurar',
        texto: ['Cada um bloqueia numa camada diferente, e cada um tem efeito colateral e contorno.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Bloqueio', 'Como funciona', 'Efeito colateral', 'Contorno'],
          linhas: [
            ['por DNS', 'o resolvedor mente ou diz que o nome não existe', 'fácil de errar o nome', 'outro resolvedor'],
            ['por IP', 'o roteador descarta os pacotes do endereço', 'derruba os sites que dividem o IP', 'VPN ou cebola'],
            ['por inspeção', 'procura palavras e o SNI no tráfego', 'precisa ver tudo de todos', 'cifra e cebola'],
          ],
        },
      },
      {
        titulo: 'Esteganografia: o recado no pixel',
        texto: ['Trocar o último bit de cada cor muda o tom em 1 de 256: o olho não vê. Uma foto de 1 megapixel esconde uns 375 KB assim (3 bits por pixel).'],
        visual: { tipo: 'bits', antes: '10110100 01101110 11001010', depois: '10110101 01101110 11001011', legenda: 'Os bits 1, 0 e 1 do recado foram no fim do vermelho, do verde e do azul de um pixel.' },
      },
      {
        titulo: 'Direitos na rede',
        texto: ['Cópia digital sem perda e de graça puxa as regras para dois lados: controle para quem cria, liberdade para quem usa.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Mecanismo', 'O que faz', 'Onde aperta'],
          linhas: [
            ['gestão de direitos digitais (DRM)', 'cifra a obra e só abre em aparelho autorizado', 'trava até a cópia que a lei permite'],
            ['uso legítimo', 'permite citar, criticar, ensinar e parodiar', 'depende de quanto e para quê'],
            ['notificação e retirada', 'o provedor tira do ar o que o dono aponta e não responde pelo usuário', 'aviso automático errado derruba o legítimo'],
          ],
        },
      },
      {
        titulo: 'O ponto de troca de Fim de Linha',
        texto: ['Um switch, quatro redes, cada uma como par das outras. Deveres de membro: antifalsificação na saída, só anunciar o que é seu, vigiar os alertas de origem.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'ptt', rotulo: 'switch do ponto de troca', x: 280, y: 140 },
            { id: 'borda', rotulo: 'Fim de Linha (AS 64500)', x: 80, y: 50 },
            { id: 'estrada', rotulo: 'Estrada Larga (AS 64501)', x: 480, y: 50 },
            { id: 'vizinha', rotulo: 'cidade vizinha (AS 64502)', x: 80, y: 230 },
            { id: 'lab', rotulo: 'laboratório (AS 64510)', x: 480, y: 230 },
          ],
          ligacoes: [
            ['borda', 'ptt', '192.0.2.0/24'],
            ['estrada', 'ptt', '203.0.113.0/24'],
            ['vizinha', 'ptt', '198.51.100.0/24'],
            ['lab', 'ptt', 'ensaio: 192.0.2.0/25'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'No roteamento em cebola, por que o nó de saída não sabe quem você é?',
      opcoes: [
        'Porque ele só recebe o pacote do nó anterior, que já tirou as camadas de fora; o seu endereço ficou com o nó de entrada',
        'Porque o pacote de saída vai sem endereço de origem nenhum',
        'Porque o nó de saída decifra todas as três camadas e apaga o seu IP',
        'Porque o destino esconde o seu IP do nó de saída',
      ],
      certa: 0,
      explicacao: 'Cada nó tira só a camada dele e conhece só o vizinho de cada lado. O nó de entrada vê você e o nó do meio; o do meio vê entrada e saída; o de saída vê o do meio e o destino. Ninguém junta as duas pontas, a não ser quem vigie entrada e saída ao mesmo tempo e case os horários.',
    },
  },
  desafio: {
    carta: [
      'Véspera da inauguração. A Rede Atalho entrou no ponto de troca hoje à tarde e, por um erro de digitação, anunciou 192.0.2.128/25, a metade de cima do bloco da cidade. O técnico dela liberou o console do roteador para a operação corrigir.',
      'A estrada reinstalou o roteador e perdeu a ponta final do caminho da redação, e alguém desligou o filtro antifalsificação da borda "para testar".',
      'Objetivo: o túnel da estrada até o nó do meio de volta e a fonte respondendo à redação, o filtro antifalsificação ligado e comprovado com um pacote forjado saindo da rede da cidade, o anúncio errado retirado e as duas perguntas respondidas.',
    ],
    dicas: [
      'Na estrada, o túnel vai para a vizinha (10.250.0.3), com a rede da fonte (10.9.0.0/24) daqui e a da redação (10.8.0.0/24) de lá, e o segredo da segunda camada: Cebola-segunda-camada-2026.',
      'O pacote forjado sai do PC teste, com uma origem que não é da cidade, como 198.51.100.99. O alerta do BGP aparece em "Ver o BGP" de qualquer roteador da troca.',
      'Na cebola, o nó de entrada sabe quem você é e o de saída sabe aonde você vai. Quantos sabem os dois?',
    ],
    perguntas: d127D,
    montar: () => mundoTroca({ semente: 6127, desafio: true }),
    objetivo: (m) => {
      const t = tunelAoMeio(m, 'estrada', REDE_FONTE, REDE_REDACAO, SEGREDO_2);
      const a = m.flags.ataque as { tipo?: string; entregue?: boolean; bloqueadoPor?: string | null; de?: string } | undefined;
      const barrado = antiOk(m) && a?.tipo === 'ip-falso' && a.de === 'teste' && a.entregue === false && a.bloqueadoPor === 'borda';
      const alheio = anunciaAlheio(m, 'atalho');
      return [
        item('túnel da estrada até o nó do meio, com as redes e o segredo da segunda camada', !!t, t ? `${t.local} para ${t.remota} via ${t.par}` : 'ainda não'),
        item('a redação alcança a fonte (10.9.0.10)', !!t && pingFonte(m), pingFonte(m) ? 'respondeu' : 'sem resposta'),
        item('antifalsificação na borda barrando um pacote forjado que saía da cidade', barrado, a?.tipo === 'ip-falso' ? (a.entregue ? 'o forjado passou' : `barrado por ${a.bloqueadoPor}`) : 'nenhum pacote forjado testado'),
        item('a Rede Atalho não anuncia mais pedaço do bloco da cidade, e não há alerta no ponto de troca', !alheio.length && !sequestros(m).length, alheio.length ? `atalho anuncia ${alheio.join(', ')}` : 'limpo'),
        ...todasRespondidas(m, d127D),
      ];
    },
    solucao: [
      ['equip', 'estrada', 'sg-vpn', { nome: 'cebola', par: IX_VIZINHA, local: REDE_FONTE, remota: REDE_REDACAO, segredo: SEGREDO_2 }],
      ['equip', 'redacao', 'ping', { destino: FONTE, n: '2' }],
      ['equip', 'borda', 'sg-antifalsificacao', { v: 'on' }],
      ['equip', 'teste', 'sg-ip-falso', { forjado: '198.51.100.99', ip: '203.0.113.10', porta: '80' }],
      ['equip', 'estrada', 'rot-bgp-ver'],
      ['equip', 'atalho', 'rot-bgp-retirar', { p: '192.0.2.128/25' }],
    ],
    respostas: { '1': '64511', '2': '0' },
  },
};

export const ATO7C: Dia[] = [dia126, dia127];
