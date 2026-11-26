// Dias novos do ato 7 (O Cerco), com prática guiada, aula e desafio no próprio dia.
// Princípios da segurança (8.1), chave simétrica (8.5) e assinaturas e resumos (8.7), no laboratório do centro de
// operações e na tesouraria da cooperativa. Os números das aulas saem do próprio motor (src/motor/cripto.ts), que
// confere com os vetores de teste dos padrões (FIPS 197, RFC 8017, RFC 2104).

import { garantirEscutas } from '../motor/cliAplicacao';
import {
  aesCifrar,
  blocosRepetidos,
  buscarColisao,
  cifraAes,
  cifrarCbc,
  cifrarEcb,
  deHex,
  hmacSha256,
  preencher,
  probabilidadeAniversario,
  sha256,
  sha256Bytes,
} from '../motor/cripto';
import { avaliarFirewall, firewallDe, novoFirewall, ultimoQue, type InfoPacote } from '../motor/filtro';
import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Mundo } from '../motor/mundo';
import { escutar, soquetesDe, type Protocolo } from '../motor/transporte';
import { lerCidr, lerIp } from '../motor/util';
import { equip, laboratorio } from './ato7a';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const ip = (s: string) => lerIp(s)!;
const cidr = (s: string) => lerCidr(s)!;

/** Alguém escuta nessa porta (TCP em LISTEN, UDP aberto) no equipamento? */
function escuta(m: Mundo, nome: string, proto: Protocolo, porta: number): boolean {
  return soquetesDe(equip(m, nome)).some((s) => s.proto === proto && s.portaLocal === porta && !s.ipRemoto && (s.estado === 'LISTEN' || s.estado === 'ABERTO'));
}

/** Julga pacotes numa cópia do firewall da borda, em sequência (a ida abre a conversa para a volta), sem mexer no de verdade. */
function julgar(m: Mundo, pacotes: [InfoPacote, string][]): string[] {
  const fw = firewallDe(equip(m, 'borda'));
  if (!fw) return pacotes.map(() => 'permitir');
  const copia = structuredClone(fw);
  return pacotes.map(([p, em]) => avaliarFirewall(copia, p, em).acao);
}

const tcp = (de: string, para: string, pd: number, po: number, flags: string): InfoPacote => ({ origem: ip(de), destino: ip(para), protocolo: 6, portaOrigem: po, portaDestino: pd, flags });
const udp = (de: string, para: string, pd: number, po: number): InfoPacote => ({ origem: ip(de), destino: ip(para), protocolo: 17, portaOrigem: po, portaDestino: pd });

function contarBitsDiferentes(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = (a[i]! ^ b[i]!) & 0xff;
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

/* ======================================================================
 * ref 131: Princípios da segurança (8.1)
 * ====================================================================== */

const PORTAL = '192.168.1.80';
const VISITANTE = '203.0.113.30';
const LOJA = '203.0.113.10';
const DNS1 = '192.168.1.53';

interface Varredura {
  de: string;
  alvo: string;
  proto: string;
  abertas: number[];
  filtradas: number;
}

/** A última varredura TCP da visitante (de fora) até o alvo. */
function varreduraDeFora(m: Mundo, alvo: string): Varredura | undefined {
  const v = ultimoQue(m, 'ataque', (x) => x.tipo === 'varredura' && x.de === 'visitante' && x.alvo === alvo && x.proto === 'tcp') as Varredura | undefined;
  return v;
}

/**
 * O laboratório com o portal no ar às pressas: além da web (80), escuta ssh (22) e telnet (23, RFC 854, tudo em
 * claro). A borda já tem o filtro com estado ligado, mas a política padrão ficou em permitir e não há regra nenhuma.
 */
function mundoPortal(semente: number): Mundo {
  const m = laboratorio(semente, { portal: true });
  garantirEscutas(m);
  const portal = equip(m, 'portal');
  escutar(m, portal, 'tcp', 22, 'ssh');
  escutar(m, portal, 'tcp', 23, 'telnet');
  equip(m, 'borda').s.firewall = { ...novoFirewall(), comEstado: true };
  return m;
}

/** O resolvedor da cidade com dois serviços esquecidos (telnet e um painel web) e a borda de fábrica, sem firewall. */
function mundoResolvedor(semente: number): Mundo {
  const m = laboratorio(semente);
  garantirEscutas(m);
  const dns1 = equip(m, 'dns1');
  escutar(m, dns1, 'tcp', 23, 'telnet');
  escutar(m, dns1, 'tcp', 80, 'painel web');
  return m;
}

const d131D: Pergunta[] = [numerica('1', 'Depois da limpeza, quantas portas TCP o dns1 ainda deixa escutando?', 1, 0)];

const dia131: Dia = {
  numero: 131,
  ato: 7,
  titulo: 'Princípios da segurança',
  chamado: [
    'CHAMADO #0131',
    'Primeira noite no centro de operações. Desde que a final passou ao vivo, Fim de Linha aparece no mapa, e o registro da borda começou a mostrar sondas vindas de fora em portas que ninguém usa.',
    'Antes de caçar quem ronda, a prefeitura quer saber o que a cidade mostra para quem olha de fora. O portal (192.168.1.80) foi para o ar às pressas e escuta em mais portas do que devia.',
    'Objetivo: varrer o portal a partir da máquina visitante, do outro lado do provedor; desligar o telnet; na borda, liberar de fora só a porta 80 do portal, com política padrão negar; e ver uma nova varredura de fora achar só a 80, com o ssh ainda ligado para quem administra de dentro.',
  ],
  manual: {
    titulo: 'Princípios: o que proteger, como se ataca, como se defende',
    texto: [
      'Segurança começa com uma lista curta do que se quer garantir. Confidencialidade: só quem deve lê (a senha da biblioteca não aparece para mais ninguém). Integridade: ninguém altera no caminho sem ser percebido (a ordem de pagamento chega como saiu). Disponibilidade: o serviço responde quando alguém precisa (o portal abre na noite da matrícula). Autenticação: quem fala é quem diz ser. Não repúdio: quem mandou não consegue negar depois. Quase todo ataque quebra uma dessas garantias, e cada defesa protege uma ou duas; dar nome ao que está em jogo é o que permite escolher a defesa certa.',
      'Junto vêm oito princípios de projeto, mais velhos que a internet comercial. Economia de mecanismo: quanto mais simples, menos lugar para erro. Padrão seguro à prova de falha: o que ninguém liberou fica fechado, e quando algo quebra, quebra fechado. Mediação completa: todo acesso é conferido, toda vez, não só no primeiro. Menor privilégio: cada pessoa e cada programa com o mínimo de que precisa. Separação de privilégio: as coisas graves pedem duas condições (duas chaves, duas pessoas, senha e um código). Menor mecanismo comum: o mínimo de coisa compartilhada entre usuários, porque o que é de todos vaza de um para o outro (uma conta de administrador para a equipe inteira, uma pasta onde todos escrevem). Aceitação psicológica: se a segurança atrapalha demais, as pessoas a contornam, e a senha de 30 caracteres trocada todo mês vira papel colado no monitor. Projeto aberto: a segurança não pode depender de ninguém saber como o sistema funciona, só da chave.',
      'Do outro lado, um ataque costuma seguir as mesmas fases. Reconhecimento: juntar o que é público, sem tocar no alvo (nomes no DNS, páginas, quem trabalha onde). Varredura: perguntar à rede, ativamente, que máquinas respondem, que portas escutam e que versão de programa atende em cada uma. Exploração: usar uma falha para entrar ou para atrapalhar (senha fraca, programa desatualizado, serviço esquecido). Persistência: ficar lá dentro, com uma conta nova, uma tarefa agendada, uma porta dos fundos, para voltar sem repetir o trabalho. Ocultação: apagar registros, esconder o processo, disfarçar o tráfego de normal. Cada fase deixa rastro em algum lugar, e quem defende planeja onde olhar em cada uma.',
      'Para ir das ameaças às soluções, faz-se a modelagem de ameaças: o que se tem de valor, quem poderia querer, com que recursos, por onde entraria e o que aconteceria se entrasse. "Por onde entraria" tem nome: superfície de ataque, a soma de tudo que alguém de fora consegue tocar. Cada porta que escuta, cada serviço, cada conta, cada pessoa que abre anexo faz parte dela. Reduzir a superfície é a defesa mais barata que existe, porque o serviço que não existe não tem falha. E nenhuma barreira sozinha basta: defesa em profundidade é pôr várias, independentes, uma atrás da outra, para que a falha de uma não seja a falha de todas.',
      'Hoje, no portal: a porta 22 é o ssh (administração cifrada), a 23 é o telnet (RFC 854, de 1983: tudo em claro, inclusive a senha) e a 80 é a web, a razão de o portal existir. Uma varredura TCP manda um SYN para cada porta: SYN+ACK quer dizer aberta, RST quer dizer fechada, silêncio quer dizer filtrada (o próximo dia mostra isso por dentro). O plano aplica os princípios um a um: desligar o telnet reduz a superfície; na borda, de fora só a 80 do portal e política padrão negar (padrão seguro e menor privilégio: o mundo só precisa da página); o ssh continua, mas só para quem está dentro. O filtro com estado da borda já está ligado: ele deixa voltar a resposta das conversas que a borda deixou começar.',
    ],
  },
  dicas: [
    `A varredura sai da visitante (${VISITANTE}), que está do lado de fora; o alvo é o portal, ${PORTAL}, portas 1 a 1024.`,
    'Desligar um serviço é no próprio portal: "Parar um serviço", TCP, porta 23. O ssh (22) e a web (80) ficam.',
    `Na borda: uma regra permitindo TCP para ${PORTAL}, porta 80, e depois a política padrão em negar. Termine com outra varredura da visitante.`,
  ],
  montar: () => mundoPortal(7131),
  objetivo: (m) => {
    const v = varreduraDeFora(m, PORTAL);
    const [web, ssh, telnet] = julgar(m, [
      [tcp(VISITANTE, PORTAL, 80, 51000, 'SYN'), 'p2'],
      [tcp(VISITANTE, PORTAL, 22, 51001, 'SYN'), 'p2'],
      [tcp(VISITANTE, PORTAL, 23, 51002, 'SYN'), 'p2'],
    ]);
    const padrao = firewallDe(equip(m, 'borda'))?.padrao;
    const soWeb = !!v && v.abertas.length === 1 && v.abertas[0] === 80;
    return [
      item('telnet (TCP 23) desligado no portal', !escuta(m, 'portal', 'tcp', 23), escuta(m, 'portal', 'tcp', 23) ? 'ainda escutando' : 'parado'),
      item('ssh (22) e web (80) ainda ligados no portal', escuta(m, 'portal', 'tcp', 22) && escuta(m, 'portal', 'tcp', 80), `ssh ${escuta(m, 'portal', 'tcp', 22) ? 'ligado' : 'parado'}, web ${escuta(m, 'portal', 'tcp', 80) ? 'ligada' : 'parada'}`),
      item('borda com política padrão negar', padrao === 'negar', `padrão ${padrao ?? 'permitir'}`),
      item('de fora, só a porta 80 do portal passa pela borda', web === 'permitir' && ssh === 'negar' && telnet === 'negar', `80: ${web}, 22: ${ssh}, 23: ${telnet}`),
      item('varredura de fora (visitante até o portal) vendo só a 80 aberta', soWeb, v ? `abertas: ${v.abertas.join(', ') || 'nenhuma'}, filtradas: ${v.filtradas}` : 'nenhuma varredura de fora'),
    ];
  },
  posMorte: [
    'A primeira varredura mostrou o portal como o mundo o via: 22, 23 e 80 abertas, 1021 portas fechadas. Três portas abertas são três lugares para tentar entrar, e uma delas, o telnet, entregaria a senha de administração a qualquer um que farejasse o caminho. Ninguém usava. Estava lá porque veio ligado, que é o jeito mais comum de uma superfície de ataque crescer.',
    'A limpeza aplicou os princípios em camadas. Parar o telnet tirou um serviço inteiro da superfície. Na borda, a regra da 80 e a política padrão negar fizeram o resto: de fora, a 22 virou silêncio (filtrada), e as 1021 portas fechadas também, porque nem o RST volta mais. Quem varre de fora agora vê uma porta só, a da página. O ssh continua lá, cifrado, para quem administra de dentro, e não aparece para quem olha de fora: menor privilégio aplicado à rede.',
    'Se um dia alguém religar o telnet por engano, a borda ainda o esconde; se um dia a regra da borda for apagada, o telnet já não existe. É a defesa em profundidade, e é o retrato de quase tudo que vem neste ato: nenhuma medida é perfeita, então se empilham várias, cada uma pensando numa ameaça. A próxima noite olha o ataque por dentro.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'visitante'],
      acao: 'sg-varrer',
      valores: { ip: PORTAL, portas: '1-1024' },
      instrucao: `Na visitante, do lado de fora, varra as portas TCP de 1 a 1024 do portal (${PORTAL}).`,
      porque: 'Antes de decidir o que fechar, é preciso ver o que o mundo vê. É a fase de varredura de quem ataca, feita por quem defende.',
      conferir: (m) => (varreduraDeFora(m, PORTAL) ? true : 'A varredura da visitante até o portal ainda não foi feita.'),
      feito: 'SYN+ACK em 22, 23 e 80: abertas. RST nas outras 1021: fechadas, a máquina existe mas ninguém escuta ali. Nenhuma filtrada, porque a borda ainda deixa passar tudo.',
    }),
    passo({
      escolha: {
        opcoes: ['23, o telnet', '22, o ssh', '80, a web', 'Nenhuma: porta aberta não faz mal se a senha for boa'],
        certa: 0,
        errada: {
          1: 'O ssh é o jeito cifrado de administrar o portal, e quem cuida dele precisa. Ele fica; o que muda é quem chega nele: só quem está dentro.',
          2: 'A 80 é a razão de o portal existir: a página da prefeitura. Desligar a web é negar o próprio serviço que se quer proteger.',
          3: 'Serviço que ninguém usa não ganha atualização, ninguém vigia e, no caso do telnet, manda a senha em claro. Senha boa não ajuda se qualquer um a lê no caminho.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Das três portas abertas, qual não devia estar escutando?',
      porque: 'Cada porta aberta é superfície de ataque. A pergunta para cada uma é: quem precisa disso, e existe jeito mais seguro de fazer o mesmo?',
      feito: 'O telnet. Ninguém usa, faz o mesmo que o ssh e manda tudo em claro. É a medida mais barata da noite: o serviço que não existe não tem falha.',
    }),
    passo({
      alvo: ['equip', 'portal'],
      acao: 'tr-parar',
      valores: { proto: 'tcp' },
      pedir: ['porta'],
      exemplo: { porta: '23' },
      instrucao: 'No portal, pare o serviço TCP do telnet.',
      porque: 'Reduzir a superfície de ataque é tirar o que não precisa existir. Fechar o soquete que escuta faz a porta responder RST.',
      conferir: (m) => {
        if (!escuta(m, 'portal', 'tcp', 22) || !escuta(m, 'portal', 'tcp', 80)) return 'Esse serviço fazia falta: o ssh (22) e a web (80) precisam continuar. Abra de novo com "Abrir um serviço".';
        return escuta(m, 'portal', 'tcp', 23) ? 'O telnet ainda escuta na porta 23.' : true;
      },
      feito: 'close() no soquete: LISTEN vira CLOSED. Quem bater na 23 agora leva RST. O portal ficou com duas portas: a da administração e a da página.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-fw-regra',
      valores: { acao: 'permitir', proto: 'tcp', de: 'qualquer', para: PORTAL, estado: '', em: '' },
      pedir: ['porta'],
      exemplo: { porta: '80' },
      instrucao: `Na borda, acrescente uma regra que permite TCP de qualquer origem para o portal (${PORTAL}), só na porta da web.`,
      porque: 'Menor privilégio aplicado à rede: o mundo só precisa da página. A regra diz exatamente isso e nada mais.',
      conferir: (m) => {
        const r = firewallDe(equip(m, 'borda'))?.regras.find((x) => x.acao === 'permitir' && x.destino?.split('/')[0] === PORTAL);
        if (!r) return `A regra precisa ter como destino o portal, ${PORTAL}.`;
        if (!r.porta || r.porta[0] !== 80 || r.porta[1] !== 80) return `Essa regra libera ${r.porta ? `a porta ${r.porta[0]}` : 'todas as portas'} do portal. De fora, só a 80, a da web.`;
        return true;
      },
      feito: 'Regra 1: PERMITIR tcp de qualquer para 192.168.1.80 porta 80. Por enquanto não muda nada, porque a política padrão ainda é permitir tudo.',
    }),
    passo({
      alvo: ['equip', 'borda'],
      acao: 'sg-fw-padrao',
      valores: { v: 'negar' },
      instrucao: 'Mude a política padrão da borda para negar.',
      porque: 'Padrão seguro à prova de falha: o que ninguém pensou não passa. Uma lista de proibições está sempre atrasada; uma lista de permissões só deixa passar o que alguém escreveu.',
      conferir: (m) => (firewallDe(equip(m, 'borda'))?.padrao === 'negar' ? true : 'A política padrão da borda ainda não é negar.'),
      feito: 'Agora só passa o que a regra 1 permite, mais a volta das conversas que a borda deixou começar (o filtro com estado).',
    }),
    passo({
      alvo: ['equip', 'visitante'],
      acao: 'sg-varrer',
      valores: { ip: PORTAL, portas: '1-1024' },
      instrucao: 'Da visitante, varra de novo as portas 1 a 1024 do portal.',
      porque: 'Medida sem teste é promessa. A varredura de fora é o jeito de conferir o que o mundo vê agora.',
      conferir: (m) => {
        const v = varreduraDeFora(m, PORTAL);
        if (!v) return 'A varredura da visitante até o portal ainda não foi feita.';
        if (v.abertas.includes(23)) return 'A 23 ainda aparece aberta: o telnet voltou a escutar no portal.';
        if (v.abertas.includes(22)) return 'A 22 ainda aparece aberta de fora: confira a política padrão da borda.';
        if (!v.abertas.includes(80)) return 'A 80 apareceu filtrada: confira a regra da borda para o portal.';
        return true;
      },
      feito: 'Uma porta aberta, a 80, e 1023 filtradas: nem SYN+ACK, nem RST, silêncio. A 22 continua lá, mas para quem olha de fora ela não existe.',
    }),
    passo({
      escolha: {
        opcoes: ['Defesa em profundidade', 'Aceitação psicológica', 'Projeto aberto', 'Economia de mecanismo'],
        certa: 0,
        errada: {
          1: 'Aceitação psicológica é a segurança não atrapalhar quem usa, senão as pessoas a contornam. Ninguém foi atrapalhado aqui; a questão é ter mais de uma barreira.',
          2: 'Projeto aberto é a segurança não depender de segredo sobre como o sistema funciona. Saber que existe um firewall não ajuda ninguém a atravessá-lo, mas não é isso que a medida dupla mostra.',
          3: 'Economia de mecanismo é manter cada barreira simples. Ajuda, mas o que se fez foi pôr duas barreiras independentes, uma atrás da outra.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O telnet foi desligado e, mesmo assim, a borda nega tudo que não é a porta 80. Que princípio explica ter as duas barreiras?',
      porque: 'Qualquer medida pode falhar: alguém religa um serviço, alguém apaga uma regra. A pergunta é o que segura quando isso acontecer.',
      feito: 'Defesa em profundidade: se o telnet voltar por engano, a borda o esconde; se a regra da borda sumir, o telnet já não existe. Cada camada cobre a falha da outra.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O que se protege',
        texto: ['Cinco garantias. Quase todo ataque quebra uma delas, e cada defesa protege uma ou duas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Garantia', 'Quer dizer', 'Quebrada quando'],
          linhas: [
            ['confidencialidade', 'só quem deve lê', 'alguém fareja a senha do telnet'],
            ['integridade', 'ninguém altera sem ser notado', 'a ordem de pagamento muda no caminho'],
            ['disponibilidade', 'o serviço responde', 'uma inundação enche a fila do portal'],
            ['autenticação', 'quem fala é quem diz ser', 'alguém se passa pelo gateway'],
            ['não repúdio', 'quem mandou não nega', 'a ordem chega sem assinatura'],
          ],
        },
      },
      {
        titulo: 'Oito princípios de projeto',
        texto: ['Um jeito de pensar antes de qualquer mecanismo: começar fechado, dar o mínimo, conferir sempre, manter simples e não contar com segredo de projeto.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Princípio', 'Na prática'],
          linhas: [
            ['economia de mecanismo', 'regra simples tem menos lugar para erro'],
            ['padrão seguro à prova de falha', 'política padrão negar; quando quebra, quebra fechado'],
            ['mediação completa', 'todo acesso conferido, toda vez, não só no primeiro'],
            ['menor privilégio', 'de fora, só a 80 do portal'],
            ['separação de privilégio', 'apagar o servidor pede duas pessoas, ou senha e código'],
            ['menor mecanismo comum', 'cada um com a sua conta, nada de "admin" da equipe'],
            ['aceitação psicológica', 'segurança que atrapalha demais é contornada'],
            ['projeto aberto', 'o segredo é a chave, não o funcionamento'],
          ],
        },
      },
      {
        titulo: 'As fases de um ataque',
        texto: ['Cada fase deixa rastro em algum lugar. Quem defende decide de antemão onde vai olhar.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Fase', 'Quem ataca', 'Onde quem defende vê'],
          linhas: [
            ['reconhecimento', 'junta o que é público, sem tocar no alvo', 'quase em lugar nenhum: reduzir o que se publica'],
            ['varredura', 'pergunta que máquinas e portas respondem', 'IDS na borda: muitas portas da mesma origem'],
            ['exploração', 'usa uma falha para entrar ou derrubar', 'registro do serviço, alerta de assinatura'],
            ['persistência', 'conta nova, tarefa agendada, porta dos fundos', 'inventário: o que mudou desde ontem'],
            ['ocultação', 'apaga registros, disfarça o tráfego', 'registro guardado fora da máquina atacada'],
          ],
        },
      },
      {
        titulo: 'A superfície de ataque do portal',
        texto: ['Tudo que alguém de fora consegue tocar. Cada linha é uma decisão, e cada decisão aplica um princípio.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Porta', 'Serviço', 'Decisão', 'Princípio'],
          linhas: [
            ['23/tcp', 'telnet, tudo em claro', 'desligar', 'menos superfície'],
            ['22/tcp', 'ssh, cifrado', 'só de dentro', 'menor privilégio'],
            ['80/tcp', 'web, a página', 'aberta para todos', 'é o serviço'],
            ['as outras 1021', 'nada escuta', 'de fechadas para filtradas', 'padrão seguro'],
          ],
        },
      },
      {
        titulo: 'Defesa em profundidade',
        texto: ['Barreiras independentes, uma atrás da outra. Quem atravessa uma ainda encontra a próxima.'],
        visual: {
          tipo: 'camadas',
          camadas: ['borda: padrão negar, de fora só a 80 do portal', 'servidor: só os serviços que alguém usa', 'serviço: ssh cifrado, com senha forte e só de dentro', 'registro e vigia: alguém lê o que aconteceu'],
          rotulo: 'de fora para dentro',
        },
      },
    ],
    checagem: {
      pergunta: 'Um firewall novo vem de fábrica permitindo tudo, e o técnico pretende "fechar depois o que for perigoso". Que princípio isso fere primeiro?',
      opcoes: ['Padrão seguro à prova de falha', 'Projeto aberto', 'Separação de privilégio', 'Aceitação psicológica'],
      certa: 0,
      explicacao: 'O padrão seguro diz que o que ninguém liberou fica fechado. Começar aberto e ir proibindo é uma lista de proibições sempre atrasada: o perigo que ninguém previu passa. Projeto aberto fala de não depender de segredo; separação de privilégio, de exigir duas condições; aceitação psicológica, de a segurança não atrapalhar quem usa.',
    },
  },
  desafio: {
    carta: [
      `O resolvedor da cidade, dns1 (${DNS1}), está numa lista de servidores abertos que circula por aí: responde DNS para qualquer um da internet, e alguém esqueceu nele um telnet e um painel web de instalação.`,
      'A borda está como veio de fábrica, sem firewall nenhum. O dns1 só precisa atender a cidade; de fora, ninguém deveria nem saber que ele existe.',
      'Objetivo: no dns1, só o DNS escutando; na borda, a rede de dentro sai e a resposta volta, política padrão negar, e de fora nem a consulta DNS ao dns1 passa. E responder quantas portas TCP sobram no dns1.',
    ],
    dicas: [
      '"Parar um serviço" no dns1, duas vezes: TCP 23 e TCP 80. O DNS usa a 53, em UDP e em TCP; deixe as duas.',
      'Na borda, uma regra permitindo qualquer protocolo da rede de dentro (192.168.1.0/24), entrando por p1, mais o filtro com estado para a resposta voltar.',
      'Por último a política padrão negar. Sem regra para quem vem de fora, a consulta DNS de fora morre na borda.',
    ],
    perguntas: d131D,
    montar: () => mundoResolvedor(8131),
    objetivo: (m) => {
      const fw = firewallDe(equip(m, 'borda'));
      const [dnsFora, telnetFora, ida, volta] = julgar(m, [
        [udp(VISITANTE, DNS1, 53, 53001), 'p2'],
        [tcp(VISITANTE, DNS1, 23, 51003, 'SYN'), 'p2'],
        [tcp('192.168.1.10', LOJA, 80, 52000, 'SYN'), 'p1'],
        [tcp(LOJA, '192.168.1.10', 52000, 80, 'SYN+ACK'), 'p2'],
      ]);
      const sobras = ['23', '80'].filter((p) => escuta(m, 'dns1', 'tcp', Number(p)));
      return [
        item('dns1 sem telnet (23) e sem painel web (80)', sobras.length === 0, sobras.length ? `ainda escutando: ${sobras.join(', ')}` : 'só o DNS'),
        item('dns1 ainda atende DNS (UDP 53)', escuta(m, 'dns1', 'udp', 53), escuta(m, 'dns1', 'udp', 53) ? 'escutando' : 'parado'),
        item('borda com política padrão negar', fw?.padrao === 'negar', fw ? `padrão ${fw.padrao}` : 'sem firewall'),
        item('de fora, nem a consulta DNS nem o telnet do dns1 passam', dnsFora === 'negar' && telnetFora === 'negar', `DNS de fora: ${dnsFora}, telnet de fora: ${telnetFora}`),
        item('a secretaria sai para a loja e a resposta volta', ida === 'permitir' && volta === 'permitir', `ida ${ida}, volta ${volta}`),
        ...todasRespondidas(m, d131D),
      ];
    },
    solucao: [
      ['equip', 'dns1', 'tr-parar', { proto: 'tcp', porta: '23' }],
      ['equip', 'dns1', 'tr-parar', { proto: 'tcp', porta: '80' }],
      ['equip', 'borda', 'sg-fw-regra', { acao: 'permitir', proto: 'qualquer', de: '192.168.1.0/24', para: 'qualquer', porta: '', estado: '', em: 'p1' }],
      ['equip', 'borda', 'sg-fw-estado', { v: 'on' }],
      ['equip', 'borda', 'sg-fw-padrao', { v: 'negar' }],
    ],
    respostas: { '1': '1' },
  },
};

/* ======================================================================
 * ref 132: Chave simétrica (8.5)
 * ====================================================================== */

/** Vetor de teste do próprio padrão do AES (FIPS 197, apêndice C.1). */
const CHAVE_FIPS = deHex('000102030405060708090a0b0c0d0e0f');
const BLOCO_FIPS = deHex('00112233445566778899aabbccddeeff');
const AES_FIPS = aesCifrar(BLOCO_FIPS, CHAVE_FIPS);
const RODADA1 = AES_FIPS.etapas.filter((e) => e.rodada === 1);
const ESTADO_R0 = AES_FIPS.etapas.find((e) => e.rodada === 0 && e.etapa === 'AddRoundKey')!.estado;

/** Uma ordem de 16 bytes repetida três vezes: no ECB, o padrão sobrevive. */
const ORDEM_REPETIDA = 'PAGUE 100 A LIA.'.repeat(3);
const ECB = blocosRepetidos(cifrarEcb(cifraAes(CHAVE_FIPS), ORDEM_REPETIDA).resultado, 16);
const CBC = blocosRepetidos(cifrarCbc(cifraAes(CHAVE_FIPS), ORDEM_REPETIDA, deHex('f0e1d2c3b4a5968778695a4b3c2d1e0f')).resultado, 16);

const ORDEM_GCM = 'Abrir comporta 3 às 22h';
const TELEMETRIA = 40;
const CBC_TELEMETRIA = preencher(new Array<number>(TELEMETRIA).fill(0), 16).length;

const d132: Pergunta[] = [
  numerica('1', 'Quantas rodadas o AES faz com chave de 128 bits?', 10, 0),
  numerica('2', `A ordem PAGUE 100 A LIA. (16 bytes) foi repetida três vezes e cifrada com AES-128 em ECB. Com o bloco de preenchimento, são ${ECB.total} blocos cifrados. Quantos deles são diferentes entre si?`, ECB.distintos, 0),
];

const d132D: Pergunta[] = [
  numerica('1', 'Quantos bits efetivos de segurança tem o triplo DES com três chaves, por causa do ataque do encontro no meio?', 112, 0),
  numerica('2', `A telemetria da represa tem ${TELEMETRIA} bytes. Em AES-CBC com preenchimento PKCS#7, quantos bytes tem o cifrado (sem contar o IV)?`, CBC_TELEMETRIA, 0),
  numerica('3', 'Quantos bits tem o IV que o GCM recomenda?', 96, 0),
];

function gcmFeito(m: Mundo): boolean {
  return !!ultimoQue(m, 'cripto', (c) => c.op === 'gcm' && c.confere === true && c.adulteradaConfere === false && c.aadTrocadoConfere === false);
}

const dia132: Dia = {
  numero: 132,
  ato: 7,
  titulo: 'Chave simétrica',
  chamado: [
    'CHAMADO #0132',
    'O rádio da represa manda as ordens das comportas para o centro de operações cifradas com uma cifra antiga, de chave de 56 bits, num modo que cifra cada bloco sozinho. Ontem a mesma ordem passou duas vezes, e o cifrado saiu igual nas duas: quem escuta não lê, mas já sabe quando a ordem se repete.',
    'Hoje é dia de trocar por uma cifra simétrica moderna, num modo que, além de esconder, denuncia quem mexe no meio.',
    'Objetivo: responder quantas rodadas tem o AES-128 e quantos blocos diferentes o ECB deixa numa ordem repetida; e, na bancada, cifrar uma ordem com AES-GCM e ver a etiqueta recusar o cifrado adulterado.',
  ],
  manual: {
    titulo: 'Cifras de bloco: DES, triplo DES, AES e os modos',
    texto: [
      'Uma cifra de bloco simétrica pega um bloco de tamanho fixo e uma chave, e devolve um bloco do mesmo tamanho que só a mesma chave desfaz. Por dentro, ela repete uma rodada muitas vezes, e cada rodada combina substituição (trocar pedaços por outros, a confusão) com permutação (espalhar cada bit por muitos, a difusão). Um jeito clássico de montar a rodada é a rede de Feistel: o bloco se divide em duas metades, L e R; a nova L é a R antiga, e a nova R é a L antiga XOR F(R, subchave). Decifrar é o mesmo circuito com as subchaves na ordem inversa, e a função F nem precisa ter volta.',
      'O DES (padrão federal de 1977) é uma Feistel de 16 rodadas sobre blocos de 64 bits. A chave tem 64 bits, mas 8 são de paridade: sobram 56. Em cada rodada, a metade de 32 bits se expande para 48, faz XOR com uma subchave de 48 e passa por 8 caixas S, que trocam 6 bits por 4: é a parte não linear. Nenhuma falha prática apareceu na estrutura; o que derrubou o DES foi o tamanho da chave. São 2^56, perto de 7,2 × 10^16 chaves, e no fim dos anos 1990 uma máquina dedicada as percorria em poucos dias, depois em menos de um. O remendo foi o triplo DES em EDE: cifra com K1, decifra com K2, cifra com K3. A decifração no meio é para que, com as três chaves iguais, o aparelho novo fale DES simples com os antigos. Duas cifrações não bastariam: o ataque do encontro no meio cifra de um lado, decifra do outro e compara no meio, e o duplo DES cai em cerca de 2^57. Pelo mesmo ataque, o triplo DES com três chaves (168 bits) dá 112 bits efetivos. É lento, e o bloco de 64 bits é pequeno: depois de uns 2^32 blocos, uns 32 GB com a mesma chave, blocos cifrados começam a se repetir. Os órgãos de padrão o aposentaram.',
      'O AES nasceu de um concurso aberto, com algoritmos de vários países analisados em público por anos, e o vencedor (o Rijndael) virou o padrão FIPS 197. Bloco de 128 bits, chave de 128, 192 ou 256 bits, e 10, 12 ou 14 rodadas. O bloco vira um estado de 4 × 4 bytes, e cada rodada faz quatro etapas: SubBytes troca cada byte pela S-box (o inverso no corpo de 256 elementos, seguido de uma transformação afim: a única parte não linear); ShiftRows gira a linha i do estado i posições; MixColumns multiplica cada coluna por uma matriz fixa (2 3 1 1) nesse mesmo corpo; AddRoundKey faz XOR com a chave da rodada, que sai da expansão da chave. A rodada 0 é só o AddRoundKey, e a última não tem MixColumns. No vetor de teste do padrão, chave 000102...0f e bloco 00112233...ff, o motor do jogo chega a ' + AES_FIPS.hex + ', o mesmo do documento. Ninguém conhece atalho prático: o melhor ataque ainda é tentar as 2^128 chaves.',
      'A cifra trata um bloco; o modo decide o que fazer com uma mensagem de muitos. O ECB cifra cada bloco sozinho: bloco claro igual vira bloco cifrado igual, e o padrão da mensagem aparece. O CBC faz XOR de cada bloco claro com o cifrado anterior antes de cifrar, e o primeiro com um vetor de inicialização (IV) aleatório e imprevisível; precisa de preenchimento (PKCS#7: N bytes de valor N, sempre pelo menos um). O CFB cifra o cifrado anterior e faz XOR com o texto; o modo contador (CTR) cifra um contador que nunca se repete e faz XOR com o texto. Os dois últimos transformam a cifra de bloco numa cifra de fluxo: rápida, sem preenchimento, e com a mesma armadilha da chave única. Mesma chave e mesmo contador duas vezes, e o XOR dos dois cifrados é o XOR dos dois textos claros.',
      'Nenhum desses modos garante integridade. No CTR, trocar um bit do cifrado troca exatamente o mesmo bit do claro, e quem está no meio muda "abrir" para outra coisa sem saber a chave. A resposta moderna é a cifração autenticada com dados associados (AEAD), que esconde e autentica de uma vez. O GCM (NIST SP 800-38D) é o modo contador mais uma etiqueta de 128 bits calculada pelo GHASH, uma multiplicação no corpo de 2^128 elementos, sobre o cifrado e sobre um dado adicional que vai em claro mas fica protegido (o cabeçalho). O IV recomendado tem 96 bits. Quem recebe recalcula a etiqueta antes de decifrar; se não bate, não devolve nada. A regra de ouro é nunca repetir o IV com a mesma chave: no GCM, além de vazar o XOR dos textos, a repetição entrega o necessário para forjar etiquetas. O TLS 1.3 (RFC 8446) só aceita modos AEAD.',
    ],
  },
  dicas: [
    'As duas perguntas são de conta: o AES-128 tem uma rodada a mais que 9. No ECB, os três blocos da ordem são iguais e o de preenchimento é outro.',
    'A ação de AES-GCM está na bancada: "AES-GCM: cifrar e adulterar", com a ordem que já vem no campo.',
    'A saída mostra três tentativas de decifrar: com tudo intacto, com um bit trocado no cifrado e com o dado adicional trocado. Só a primeira pode conferir.',
  ],
  perguntas: d132,
  montar: () => laboratorio(7132),
  objetivo: (m) => [
    item('uma ordem cifrada com AES-GCM na bancada, e as duas adulterações recusadas pela etiqueta', gcmFeito(m), gcmFeito(m) ? 'etiqueta confere só com tudo intacto' : 'ainda não'),
    ...todasRespondidas(m, d132),
  ],
  posMorte: [
    `O rádio caiu por dois motivos diferentes. A chave de 56 bits do DES cabe numa força bruta de dias, e isso é problema da cifra. O cifrado igual para a mesma ordem é problema do modo: no ECB, os três blocos iguais de PAGUE 100 A LIA. viraram ${ECB.total - ECB.distintos + 1} blocos cifrados idênticos, e o cifrado inteiro teve só ${ECB.distintos} blocos diferentes. Em CBC, com o mesmo AES e a mesma chave, os ${CBC.total} blocos saíram todos diferentes, porque cada um carrega o anterior.`,
    'O AES resolveu a cifra: 128 bits de chave, 10 rodadas de SubBytes, ShiftRows, MixColumns e AddRoundKey, conferido contra o vetor do próprio padrão. O GCM resolveu o modo e mais um problema que o rádio nem sabia que tinha: um bit trocado no cifrado, ou no cabeçalho que vai em claro, e a etiqueta não confere, e nada é decifrado. Quem está no meio pode até estragar a ordem, mas não consegue trocá-la por outra.',
    'Fica uma regra para o resto do ato: o IV do GCM nunca se repete com a mesma chave. O motor sorteia um IV de 96 bits a cada cifração, o TLS e o ESP usam um contador por mensagem. Repetir uma vez é reusar a chave única, com o agravante de entregar a quem escuta o que precisa para forjar etiquetas.',
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'A chave de 56 bits: 2^56 chaves cabem numa força bruta de dias',
          'A estrutura de Feistel tem uma falha que entrega a chave',
          'O bloco de 64 bits deixa ler o texto direto',
          'Dezesseis rodadas são poucas, e cada uma pode ser desfeita sem chave',
        ],
        certa: 0,
        errada: {
          1: 'A Feistel do DES resistiu a décadas de análise pública. Os ataques mais espertos contra a estrutura pedem mais texto conhecido do que a força bruta pede tempo.',
          2: 'O bloco pequeno vira problema depois de bilhões de blocos com a mesma chave, quando cifrados começam a se repetir. Não deixa ler texto nenhum direto.',
          3: 'Cada rodada depende de uma subchave; sem a chave, nenhuma se desfaz. O problema era outro, bem mais simples.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O DES foi o padrão por mais de vinte anos. O que o derrubou?',
      porque: 'Antes de escolher a cifra nova, vale saber como a velha caiu: foi pela estrutura ou pela chave?',
      feito: 'Pela chave: 2^56 é perto de 7,2 × 10^16, e uma máquina dedicada percorria tudo em dias. O triplo DES estica a chave; o AES recomeça do zero, com 128 bits ou mais.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '10' },
      instrucao: 'Quantas rodadas o AES faz com chave de 128 bits?',
      porque: 'Chave maior pede mais rodadas: 128, 192 e 256 bits levam 10, 12 e 14. A última rodada não tem MixColumns.',
      feito: `Dez. No vetor de teste do padrão, depois da rodada 0 (só AddRoundKey) o estado é ${ESTADO_R0}, e depois da décima é ${AES_FIPS.hex}, o cifrado do documento.`,
    }),
    passo({
      escolha: {
        opcoes: [
          'Para que, com as três chaves iguais, ele vire DES simples e converse com os aparelhos antigos',
          'Porque decifrar é mais seguro que cifrar',
          'Para que a chave efetiva chegue a 168 bits',
          'Porque o DES só sabe decifrar na segunda passada',
        ],
        certa: 0,
        errada: {
          1: 'Cifrar e decifrar com chaves diferentes são operações igualmente fortes: decifrar com K2 é só mais uma permutação embaralhada.',
          2: 'A chave tem 168 bits, mas o encontro no meio derruba a segurança efetiva para 112. O D no meio não muda isso.',
          3: 'O DES cifra e decifra quantas vezes se quiser, com a ordem das subchaves invertida para decifrar.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O triplo DES faz cifra, decifra, cifra (EDE). Por que decifrar no meio?',
      porque: 'Um padrão novo precisa conviver com o parque instalado. A escolha do meio tem a ver com isso.',
      feito: 'Com K1 = K2 = K3, a decifração desfaz a primeira cifração e sobra um DES simples. E duas passadas só não bastariam: o encontro no meio quebra o duplo DES em cerca de 2^57.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: String(ECB.distintos) },
      instrucao: 'Em ECB, quantos dos blocos cifrados da ordem repetida são diferentes entre si?',
      porque: 'No ECB, cada bloco é cifrado sozinho com a mesma chave. Os três blocos claros são iguais; o de preenchimento (16 bytes de valor 16) é outro.',
      feito: `${ECB.distintos} de ${ECB.total}. Quem escuta não lê a ordem, mas vê que ela se repetiu três vezes. Em CBC, os mesmos dados dão ${CBC.distintos} blocos diferentes.`,
    }),
    passo({
      alvo: ['equip', 'bancada'],
      acao: 'sg-gcm',
      valores: { t: ORDEM_GCM },
      instrucao: `Na bancada, cifre a ordem "${ORDEM_GCM}" com AES-GCM e veja o que acontece quando alguém mexe no cifrado.`,
      porque: 'O GCM é o modo contador mais uma etiqueta de 128 bits sobre o cifrado e o cabeçalho. A ação cifra e depois tenta decifrar três vezes: intacto, com um bit trocado no cifrado e com o cabeçalho trocado.',
      conferir: (m) => (gcmFeito(m) ? true : 'A ordem ainda não foi cifrada com AES-GCM na bancada.'),
      feito: 'Intacto, a etiqueta confere e a ordem volta. Um bit trocado no cifrado: a etiqueta não confere e nada é decifrado. Cabeçalho trocado: também não confere, embora o cabeçalho viaje em claro.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Integridade: o cifrado adulterado é recusado antes de virar texto',
          'Confidencialidade maior: o GCM cifra duas vezes',
          'Disponibilidade: o GCM retransmite o que se perdeu',
          'Não repúdio: a etiqueta prova quem cifrou para qualquer um',
        ],
        certa: 0,
        errada: {
          1: 'O GCM cifra uma vez só, no modo contador. A confidencialidade é a mesma do CTR; o que ele acrescenta é a etiqueta.',
          2: 'O GCM não retransmite nada: quem cuida disso é o transporte. Ele só diz se o que chegou é o que saiu.',
          3: 'A etiqueta usa a mesma chave dos dois lados. Quem confere poderia ter produzido a mesma etiqueta, então ela não prova nada para um terceiro. Isso é coisa de assinatura.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que garantia o AES-GCM deu que o CBC ou o contador, sozinhos, não dão?',
      porque: 'No CTR, um bit trocado no cifrado vira o mesmo bit trocado no claro, e ninguém percebe. A pergunta é o que a etiqueta muda nisso.',
      feito: 'Integridade, e de quebra a certeza de que veio de quem tem a chave. É por isso que o TLS 1.3 só aceita AEAD: esconder sem autenticar deixa o homem no meio reescrever a mensagem às cegas.',
    }),
    passo({
      escolha: {
        opcoes: [
          'O XOR dos dois cifrados dá o XOR dos dois textos, e quem escuta ganha o que precisa para forjar etiquetas',
          'Nada: o GCM sorteia a chave de novo a cada mensagem',
          'O receptor não consegue mais decifrar nenhuma das duas',
          'As mensagens ficam do dobro do tamanho',
        ],
        certa: 0,
        errada: {
          1: 'A chave é a mesma da conversa inteira; o que muda a cada mensagem é o IV. Por isso repeti-lo é tão grave.',
          2: 'O receptor decifra as duas normalmente. O problema é que quem escuta também passa a ganhar alguma coisa.',
          3: 'O GCM não acrescenta nada além da etiqueta de 16 bytes. O tamanho não muda com o IV repetido.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por um defeito, um aparelho usou o mesmo IV duas vezes com a mesma chave GCM. O que quem interceptou as duas mensagens ganha?',
      porque: 'Por dentro, o GCM é um modo contador. Mesma chave e mesmo IV, mesmo fluxo de chave.',
      feito: 'Mesmo fluxo de chave nas duas: o XOR dos cifrados cancela o fluxo e deixa o XOR dos textos claros, como na chave única reusada. E as duas etiquetas juntas deixam achar a chave do GHASH, e daí forjar etiquetas. IV nunca se repete.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Rede de Feistel',
        texto: ['A estrutura do DES. Cada rodada mexe numa metade usando a outra; decifrar é o mesmo circuito, com as subchaves ao contrário.'],
        visual: {
          tipo: 'camadas',
          camadas: ['bloco de 64 bits: L0 e R0, 32 bits cada', 'rodada i: L(i) = R(i - 1)', 'R(i) = L(i - 1) XOR F(R(i - 1), K(i))', '16 rodadas, subchaves de 48 bits', 'decifrar: as mesmas rodadas, de K16 a K1'],
          rotulo: 'uma Feistel',
        },
      },
      {
        titulo: 'DES, triplo DES e AES',
        texto: ['A mesma chave cifra e decifra. O que mudou de uma geração para a outra foi o tamanho da chave e do bloco.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Algoritmo', 'Bloco', 'Chave', 'Rodadas', 'Hoje'],
          linhas: [
            ['DES', '64 bits', '56 bits', '16', 'caiu por força bruta'],
            ['triplo DES (EDE)', '64 bits', '168 bits, 112 efetivos', '3 × 16', 'aposentado'],
            ['AES-128', '128 bits', '128 bits', '10', 'em uso'],
            ['AES-192', '128 bits', '192 bits', '12', 'em uso'],
            ['AES-256', '128 bits', '256 bits', '14', 'em uso'],
          ],
        },
      },
      {
        titulo: 'Uma rodada do AES, de verdade',
        texto: ['O vetor de teste do padrão (FIPS 197): chave 000102...0f, bloco 00112233...ff. O estado depois de cada etapa da rodada 1, calculado pelo motor do jogo.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Etapa', 'O que faz', 'Estado depois'],
          linhas: [
            ['rodada 0', 'só AddRoundKey', ESTADO_R0],
            ...RODADA1.map((e) => [e.etapa, { SubBytes: 'S-box em cada byte', ShiftRows: 'gira a linha i em i posições', MixColumns: 'mistura cada coluna', AddRoundKey: 'XOR com a chave da rodada', entrada: '' }[e.etapa], e.estado]),
            ['rodada 10', 'sem MixColumns: o cifrado', AES_FIPS.hex],
          ],
        },
      },
      {
        titulo: 'Modos: como juntar os blocos',
        texto: [`A ordem PAGUE 100 A LIA. três vezes, com AES-128 e a mesma chave: em ECB, ${ECB.distintos} blocos diferentes de ${ECB.total}; em CBC, ${CBC.distintos} de ${CBC.total}.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Modo', 'Como funciona', 'Cuidado'],
          linhas: [
            ['ECB', 'cada bloco sozinho', 'bloco igual, cifrado igual: vaza o padrão'],
            ['CBC', 'XOR com o cifrado anterior, começando pelo IV', 'IV aleatório e imprevisível; precisa de preenchimento'],
            ['CFB', 'cifra o cifrado anterior e faz XOR', 'vira cifra de fluxo'],
            ['CTR', 'cifra um contador e faz XOR', 'nunca repetir chave e contador'],
            ['GCM', 'CTR mais etiqueta de 128 bits (GHASH)', 'IV de 96 bits, nunca repetido'],
          ],
        },
      },
      {
        titulo: 'GCM: esconder e autenticar',
        texto: ['O cabeçalho vai em claro, mas entra na etiqueta. Quem recebe confere a etiqueta antes de decifrar qualquer coisa.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'claro', rotulo: 'texto claro', x: 80, y: 50 },
            { id: 'ctr', rotulo: 'AES em contador (IV de 96 bits)', x: 300, y: 50 },
            { id: 'cif', rotulo: 'cifrado', x: 520, y: 50 },
            { id: 'aad', rotulo: 'cabeçalho (em claro)', x: 80, y: 190 },
            { id: 'gh', rotulo: 'GHASH', x: 300, y: 190 },
            { id: 'tag', rotulo: 'etiqueta de 128 bits', x: 520, y: 190 },
          ],
          ligacoes: [
            ['claro', 'ctr', 'XOR com o fluxo'],
            ['ctr', 'cif', ''],
            ['cif', 'gh', 'entra'],
            ['aad', 'gh', 'entra'],
            ['gh', 'tag', 'cifrado com J0'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que o duplo DES (cifrar duas vezes com duas chaves de 56 bits) não dá 112 bits de segurança?',
      opcoes: [
        'Porque o encontro no meio cifra de um lado, decifra do outro e compara no meio, em cerca de 2^57 operações',
        'Porque cifrar duas vezes com DES é o mesmo que cifrar uma vez',
        'Porque a segunda chave é sempre igual à primeira',
        'Porque o DES não aceita cifrar um texto já cifrado',
      ],
      certa: 0,
      explicacao: 'Com um par de claro e cifrado conhecido, quem ataca cifra o claro com todas as 2^56 primeiras chaves e guarda numa tabela, depois decifra o cifrado com todas as 2^56 segundas e procura o encontro. São duas buscas de 2^56, perto de 2^57, e não 2^112. O triplo DES leva o mesmo ataque a 2^112, que é onde vem o número efetivo.',
    },
  },
  desafio: {
    carta: [
      'A telemetria da represa (nível, vazão, comportas) sai da secretaria para o centro de operações a cada minuto. Hoje ela vai em triplo DES, em CBC, e ninguém confere se o número que chegou é o que saiu.',
      'A prefeitura quer AES-GCM no lugar, e quer os números de antes e depois numa folha só.',
      'Objetivo: na secretaria, cifrar uma leitura com AES-GCM e ver a adulteração recusada; e responder a segurança efetiva do triplo DES, o tamanho do cifrado CBC da telemetria e o tamanho do IV do GCM.',
    ],
    dicas: [
      'A ação "AES-GCM: cifrar e adulterar" também está na secretaria. Qualquer leitura serve.',
      `O CBC cifra blocos inteiros de 16 bytes, e o PKCS#7 sempre acrescenta pelo menos um byte: ${TELEMETRIA} bytes viram o próximo múltiplo de 16 acima.`,
      'O encontro no meio tira 56 bits dos 168 do triplo DES. O IV do GCM tem 12 bytes.',
    ],
    perguntas: d132D,
    montar: () => laboratorio(8132),
    objetivo: (m) => [item('uma leitura cifrada com AES-GCM, e as adulterações recusadas', gcmFeito(m), gcmFeito(m) ? 'etiqueta confere só com tudo intacto' : 'ainda não'), ...todasRespondidas(m, d132D)],
    solucao: [['equip', 'secretaria', 'sg-gcm', { t: 'Nivel 87 por cento, comporta 2 fechada' }]],
    respostas: { '1': '112', '2': String(CBC_TELEMETRIA), '3': '96' },
  },
};

/* ======================================================================
 * ref 133: Assinaturas e resumos (8.7)
 * ====================================================================== */

const ORDEM = 'Pague 100 a Lia';
const ORDEM_FALSA = 'Pague 100 a Lua';
const H_ORDEM = sha256(ORDEM);
const H_FALSA = sha256(ORDEM_FALSA);
const BITS_AVALANCHE = contarBitsDiferentes(sha256Bytes(ORDEM), sha256Bytes(ORDEM_FALSA));

const SEGREDO_HMAC = 'segredo-da-tesouraria';
const HMAC_ORDEM = hmacSha256(SEGREDO_HMAC, ORDEM);
const HMAC_FALSA = hmacSha256(SEGREDO_HMAC, ORDEM_FALSA);
const HMAC_OUTRA = hmacSha256('outro-segredo', ORDEM);

const CONTRATO = 'Entregar 40 sacos de cimento na escola';
const CONTRATO_ALTERADO = 'Entregar 90 sacos de cimento na escola';
const H_CONTRATO = sha256(CONTRATO);
const H_CONTRATO_ALT = sha256(CONTRATO_ALTERADO);

const COLISAO = buscarColisao(16);
const ANIVERSARIO = probabilidadeAniversario(23, 365);
const pct = (x: number) => `${(100 * x).toFixed(1).replace('.', ',')} %`;

/** Tesouraria e escritório da cooperativa numa rede pequena, com o roteador da cooperativa. */
function mundoTesouraria(semente: number): Mundo {
  const m = novoMundo(semente);
  m.flags.seguranca = true;
  adicionar(m, pc('tesouraria', { ip: cidr('192.168.7.10/24'), gateway: '192.168.7.1', modelo: 'Estação da tesouraria da cooperativa' }));
  adicionar(m, pc('escritorio', { ip: cidr('192.168.7.20/24'), gateway: '192.168.7.1', modelo: 'Estação do escritório da cooperativa' }));
  adicionar(m, roteador('r-coop', { modelo: 'Roteador da cooperativa', interfaces: { lan: '192.168.7.1/24', wan: '198.51.100.21/30' } }));
  adicionar(m, comutador('sw-coop', { portas: 8 }));
  ligar(m, { equip: 'tesouraria', porta: 'eth0' }, { equip: 'sw-coop', porta: 'p1' }, 'cat6', 5);
  ligar(m, { equip: 'escritorio', porta: 'eth0' }, { equip: 'sw-coop', porta: 'p2' }, 'cat6', 5);
  ligar(m, { equip: 'sw-coop', porta: 'p8' }, { equip: 'r-coop', porta: 'lan' }, 'cat6', 5);
  return m;
}

function resumoFeito(m: Mundo, h: string): boolean {
  return !!ultimoQue(m, 'cripto', (x) => x.op === 'sha256' && x.resumo === h);
}

function assinaturaFeita(m: Mundo) {
  return ultimoQue(m, 'cripto', (x) => x.op === 'assinar' && x.confere === true && x.alteradaConfere === false);
}

const d133: Pergunta[] = [
  numerica('1', 'Um resumo de 256 bits resiste a cerca de 2 elevado a quanto em tentativas antes de aparecer uma colisão? (responda o expoente)', 128, 0),
  numerica('2', 'Quantas pessoas numa sala bastam para a chance de duas fazerem aniversário no mesmo dia passar de metade?', 23, 0),
];

const d133D: Pergunta[] = [
  numerica('1', 'O fornecedor usa um resumo de 40 bits. Com cerca de 2 elevado a quanto em tentativas alguém acha duas mensagens com o mesmo resumo? (responda o expoente)', 20, 0),
  numerica('2', 'E para achar uma mensagem com o mesmo resumo de 40 bits de um contrato já assinado, cerca de 2 elevado a quanto? (responda o expoente)', 40, 0),
];

const dia133: Dia = {
  numero: 133,
  ato: 7,
  titulo: 'Assinaturas e resumos',
  chamado: [
    'CHAMADO #0133',
    `Às duas da manhã a cooperativa recebeu pela rede uma ordem de pagamento: "${ORDEM_FALSA}". A tesoureira jura que escreveu "${ORDEM}". Alguém mexeu no meio do caminho, e ninguém consegue provar quem escreveu o quê.`,
    'O centro de operações quer que toda ordem chegue com uma prova de quem escreveu e de que nada mudou, uma prova que qualquer um confira e que nem a cooperativa consiga fabricar.',
    'Objetivo: resumir com SHA-256 as duas ordens, que diferem numa letra; assinar a verdadeira com a chave privada da tesouraria e conferir; e responder até onde um resumo de 256 bits aguenta o ataque do aniversário e quantas pessoas bastam para o paradoxo.',
  ],
  manual: {
    titulo: 'Assinatura digital, resumo e HMAC',
    texto: [
      'Uma assinatura no papel faz três coisas, e a digital precisa fazer as mesmas: quem recebe confere quem mandou (autenticação), quem mandou não consegue negar depois (não repúdio) e quem recebe não consegue fabricar uma assinatura falsa (nem mesmo o próprio destinatário). Com chave simétrica, isso exige um árbitro em quem todos confiam e que divide uma chave secreta com cada um. A tesoureira manda ao árbitro, cifrado com a chave dela, a ordem, o destinatário, um número aleatório e um carimbo de tempo. O árbitro decifra, confere, e repassa à cooperativa a mesma ordem junto com um bloco que só ele consegue cifrar e decifrar: o seu selo sobre quem mandou, quando e o quê. Se houver briga, a cooperativa leva o selo, o árbitro o abre e testemunha. O número e o carimbo seguram a repetição. Funciona, mas todo mundo precisa confiar no árbitro, e ele lê tudo.',
      'Com chave pública, o árbitro sai de cena. A tesoureira aplica a chave privada, e qualquer um confere com a pública; só quem tem a privada produziria aquilo, então ela não pode negar, e a cooperativa, que só tem a pública, não consegue forjar. Na prática, o RSA assina o resumo da mensagem. O esquema antigo, PKCS#1 v1.5 (RFC 8017, seção 8.2), monta um bloco do tamanho de n, 00 01 FF...FF 00, o identificador do SHA-256 e o resumo, e o eleva a d: a mesma mensagem dá sempre a mesma assinatura. É o que a ação "Assinar e conferir" do laboratório faz, com RSA de 2048 bits, como os certificados e o DNSSEC. O esquema recomendado para coisa nova é o RSA-PSS (RFC 8017, seção 8.1): o resumo é misturado a um sal aleatório de 32 bytes e espalhado por uma máscara (MGF1) antes da exponenciação, então cada assinatura sai diferente, e existe prova de que forjá-la é tão difícil quanto quebrar o próprio RSA. O TLS 1.3 exige PSS quando a chave é RSA. Com curvas elípticas, as assinaturas são o ECDSA e o Ed25519 (RFC 8032).',
      'O resumo (sumário de mensagens) é o que torna isso prático. Uma função de resumo criptográfico leva qualquer entrada a um tamanho fixo e precisa de quatro coisas: ser fácil de calcular; dado um resumo, ser impossível achar uma entrada que o produza (pré-imagem); dada uma mensagem, ser impossível achar outra com o mesmo resumo (segunda pré-imagem); e ser impossível achar quaisquer duas entradas com o mesmo resumo (colisão). Mudar um bit da entrada muda cerca de metade dos bits da saída: o efeito avalanche. O MD5 (128 bits) e o SHA-1 (160 bits) caíram, com colisões produzidas na prática. O SHA-256 (FIPS 180-4) preenche a mensagem com um bit 1, zeros e o tamanho em 64 bits, quebra em blocos de 512 bits e passa cada um por 64 rodadas sobre um estado de oito palavras de 32 bits. O SHA-3 (FIPS 202) usa outra construção, a esponja, de reserva caso a família SHA-2 caia.',
      'Quando os dois lados dividem um segredo, não é preciso chave pública para conferir integridade: basta o HMAC (RFC 2104). Ele resume duas vezes, com a chave misturada em cada passada: H((K XOR opad) seguido de H((K XOR ipad) seguido da mensagem)), com ipad = 0x36 e opad = 0x5c repetidos até o bloco de 64 bytes. Por que não simplesmente H(chave seguida da mensagem)? Porque no SHA-256 quem tem esse resumo consegue continuar a conta e acrescentar texto ao fim sem saber a chave (a extensão de comprimento); as duas passadas do HMAC fecham essa porta. O HMAC prova integridade e que veio de quem tem a chave, mas não dá não repúdio: os dois lados têm a mesma chave, e qualquer um deles poderia ter calculado.',
      `E o ataque do aniversário diz quanto um resumo aguenta. Numa sala com 23 pessoas, a chance de duas fazerem aniversário no mesmo dia já é de ${pct(ANIVERSARIO.exata)}: não se compara cada pessoa com uma data dada, mas todos os pares entre si, e 23 pessoas formam 253 pares. Com resumo de n bits, achar uma mensagem para um resumo dado custa cerca de 2^n tentativas, mas achar duas quaisquer que colidem custa cerca de 2^(n/2). Quem quer fraudar prepara milhares de versões de uma ordem honesta e de uma desonesta (uma vírgula aqui, um espaço ali) até achar um par com o mesmo resumo, pede a assinatura na honesta e depois apresenta a desonesta. Com 64 bits, são 2^32 tentativas, coisa de uma tarde; com o SHA-256, 2^128, fora do alcance de qualquer um. Por isso o resumo de uma assinatura precisa do dobro dos bits da segurança que se quer.`,
    ],
  },
  dicas: [
    'As ações estão na tesouraria: "Resumo SHA-256" (uma vez para cada ordem, exatamente como no chamado) e "Assinar e conferir".',
    'A saída da assinatura mostra também a mesma assinatura conferida contra o texto com um caractere a mais. Ela tem que recusar.',
    'Para o aniversário de um resumo, divida o número de bits por 2. Para as pessoas, é o número clássico do paradoxo.',
  ],
  perguntas: d133,
  montar: () => mundoTesouraria(7133),
  objetivo: (m) => [
    item(`resumo SHA-256 de "${ORDEM}"`, resumoFeito(m, H_ORDEM), H_ORDEM.slice(0, 16) + '...'),
    item(`resumo SHA-256 de "${ORDEM_FALSA}", que difere numa letra`, resumoFeito(m, H_FALSA), H_FALSA.slice(0, 16) + '...'),
    item('uma ordem assinada com a chave privada, conferida com a pública, e a alterada recusada', !!assinaturaFeita(m), assinaturaFeita(m) ? `chave ${assinaturaFeita(m)!.idChave}` : 'ainda não assinada'),
    ...todasRespondidas(m, d133),
  ],
  posMorte: [
    `A ordem falsa caiu pelo resumo. "${ORDEM}" e "${ORDEM_FALSA}" diferem numa letra, e os resumos SHA-256 diferem em ${BITS_AVALANCHE} dos 256 bits, perto da metade, como o efeito avalanche promete. Quem mexeu no meio trocou a letra, mas não tinha como trocar a assinatura: ela só confere para o resumo certo, com a chave pública da tesouraria, e produzir outra exigiria a chave privada, que nunca saiu de lá.`,
    'A assinatura da tesouraria é RSA de 2048 bits no esquema PKCS#1 v1.5: o resumo vai inteiro dentro de um bloco do tamanho de n e é elevado a d. Mudou um caractere, mudou o resumo, e a mesma assinatura deixa de conferir. Um sistema novo usaria o PSS, que acrescenta sal e sai diferente a cada vez; a conferência continua sendo pela chave pública, sem árbitro, e a tesoureira não tem como dizer depois que não foi ela.',
    `O aniversário explica por que ninguém assina com resumo curto. No laboratório, um resumo de brinquedo de 16 bits colidiu em ${COLISAO.tentativas} tentativas, perto de √(2^16) = 256. Com 256 bits, a mesma conta dá 2^128. A cooperativa passou a pagar só o que confere, e para as mensagens internas entre a tesouraria e o escritório, que dividem um segredo, basta um HMAC.`,
  ],
  passos: [
    passo({
      escolha: {
        opcoes: [
          'Porque quem confere tem a mesma chave de quem assina e poderia ter forjado; alguém de fora precisa testemunhar',
          'Porque a cifra simétrica é fraca demais para assinar',
          'Porque sem árbitro a mensagem não chega',
          'Porque o árbitro guarda a chave pública de todos',
        ],
        certa: 0,
        errada: {
          1: 'O AES é tão forte quanto se queira. O problema não é a força, é que a mesma chave fica com os dois lados.',
          2: 'A mensagem chega sem árbitro; o que não existe sem ele é uma prova que um terceiro aceite.',
          3: 'Na assinatura simétrica não há chave pública nenhuma: o árbitro divide uma chave secreta com cada pessoa.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que a assinatura com chave simétrica precisa de um árbitro?',
      porque: 'Antes de assinar, a pergunta é o que a assinatura precisa provar, e para quem.',
      feito: 'Com uma chave só, os dois lados podem calcular a mesma coisa, e nenhum dos dois prova nada para um terceiro. O árbitro resolve com o próprio selo; a chave pública resolve sem ninguém no meio.',
    }),
    passo({
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-sha256',
      valores: { t: ORDEM },
      instrucao: `Na tesouraria, calcule o SHA-256 da ordem verdadeira, "${ORDEM}".`,
      porque: 'O resumo é a impressão digital do texto: 256 bits, sempre do mesmo tamanho, qualquer que seja a entrada.',
      conferir: (m) => (resumoFeito(m, H_ORDEM) ? true : `O resumo de "${ORDEM}" ainda não foi calculado.`),
      feito: `Resumo: ${H_ORDEM.slice(0, 32)}... A saída mostra o preenchimento: a mensagem de 15 bytes vira um bloco de 512 bits com o bit 1, zeros e o tamanho no fim.`,
    }),
    passo({
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-sha256',
      valores: { t: ORDEM_FALSA },
      instrucao: `Agora o da ordem que chegou, "${ORDEM_FALSA}", com uma letra trocada.`,
      porque: 'Uma boa função de resumo espalha qualquer mudança pela saída inteira: não dá para ajustar um pouquinho o texto e manter o resumo.',
      conferir: (m) => (resumoFeito(m, H_FALSA) ? true : `O resumo de "${ORDEM_FALSA}" ainda não foi calculado.`),
      feito: `Resumo: ${H_FALSA.slice(0, 32)}... Uma letra mudou ${BITS_AVALANCHE} dos 256 bits, perto da metade: o efeito avalanche.`,
    }),
    passo({
      alvo: ['equip', 'tesouraria'],
      acao: 'sg-assinar',
      valores: { t: ORDEM },
      instrucao: `Assine a ordem "${ORDEM}" com a chave privada da tesouraria e confira.`,
      porque: 'A assinatura é o resumo, num bloco do tamanho da chave, elevado ao d da tesouraria (RSA de 2048 bits). Quem confere eleva ao e público, 65537, e compara com o bloco do resumo do que recebeu.',
      conferir: (m) => {
        if (assinaturaFeita(m)) return true;
        return ultimoQue(m, 'cripto', (x) => x.op === 'assinar') ? 'A assinatura não conferiu desta vez. Tente de novo.' : 'A ordem ainda não foi assinada.';
      },
      feito: 'Conferiu com a chave pública. Com um caractere a mais no texto, o resumo muda e a mesma assinatura deixa de conferir: integridade, autoria e não repúdio na mesma conta.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Integridade e origem entre os dois, mas não não repúdio: os dois têm a chave e qualquer um poderia ter calculado',
          'Tudo que a assinatura dá, só que mais rápido',
          'Só confidencialidade: o HMAC esconde a ordem',
          'Nada: sem chave pública não há como conferir',
        ],
        certa: 0,
        errada: {
          1: 'Mais rápido, sim; tudo, não. Falta o não repúdio, que precisa de uma chave que só um lado tem.',
          2: 'O HMAC não esconde nada: a ordem vai em claro, com o código ao lado. Para esconder, é preciso cifrar.',
          3: 'Quem tem a chave recalcula o HMAC da ordem recebida e compara. Basta o segredo dividido.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'A tesouraria e o escritório dividem um segredo e passam a mandar as ordens internas com HMAC-SHA-256. O que o HMAC prova?',
      porque: 'O HMAC é o resumo com uma chave secreta misturada. A pergunta é o que muda quando a chave é a mesma dos dois lados.',
      feito: 'Integridade e origem: só quem tem o segredo calcula o HMAC certo. Mas, como os dois lados têm o segredo, nenhum prova a um terceiro que foi o outro. Para isso, assinatura.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '128' },
      instrucao: 'Até quantas tentativas, em potência de 2, um resumo de 256 bits aguenta o ataque do aniversário?',
      porque: `Achar duas entradas quaisquer com o mesmo resumo é bem mais fácil que achar uma entrada para um resumo dado. No laboratório, um resumo de brinquedo de 16 bits colidiu em ${COLISAO.tentativas} tentativas, perto de √(2^16) = 256.`,
      feito: 'Cerca de 2^(256/2) = 2^128. É por isso que um resumo para assinatura precisa do dobro dos bits da segurança que se quer.',
    }),
    passo({
      pergunta: '2',
      exemplo: { resposta: '23' },
      instrucao: 'Quantas pessoas numa sala bastam para a chance de dois aniversários no mesmo dia passar de metade?',
      porque: 'Não se compara cada pessoa com uma data fixa: comparam-se todos os pares entre si. O número de pares cresce com o quadrado das pessoas.',
      feito: `23 pessoas formam 253 pares, e a chance chega a ${pct(ANIVERSARIO.exata)}. Para 365 dias, a raiz de 2 × 365 × ln 2 dá ${ANIVERSARIO.meioAMeio.toFixed(1).replace('.', ',')}: é a mesma conta do resumo, com 2^n no lugar de 365.`,
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'Assinatura com árbitro',
        texto: ['Com chave simétrica, alguém de confiança fica no meio, divide uma chave com cada lado e testemunha se houver briga.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'tes', rotulo: 'tesouraria', x: 90, y: 70 },
            { id: 'arb', rotulo: 'árbitro', x: 300, y: 70 },
            { id: 'coop', rotulo: 'cooperativa', x: 510, y: 70 },
            { id: 'juiz', rotulo: 'em caso de briga', x: 510, y: 200 },
          ],
          ligacoes: [
            ['tes', 'arb', 'K da tesouraria: ordem, número, tempo'],
            ['arb', 'coop', 'K da cooperativa: ordem e selo do árbitro'],
            ['coop', 'juiz', 'mostra o selo; o árbitro abre'],
          ],
        },
      },
      {
        titulo: 'Uma letra, metade dos bits',
        texto: [`O SHA-256 de dois textos que diferem numa letra. Os resumos diferem em ${BITS_AVALANCHE} dos 256 bits.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Texto', 'Começo do SHA-256'],
          linhas: [
            [ORDEM, H_ORDEM.slice(0, 24)],
            [ORDEM_FALSA, H_FALSA.slice(0, 24)],
          ],
        },
      },
      {
        titulo: 'Assina-se o resumo',
        texto: ['A tesouraria resume e assina o resumo com d. Quem recebe resume de novo, abre a assinatura com e e compara. O PSS acrescenta sal, e cada assinatura sai diferente.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'PKCS#1 v1.5 (RFC 8017, 8.2)', 'PSS (RFC 8017, 8.1)'],
          linhas: [
            ['o que vai no bloco', '00 01 FF...FF 00, identificador e resumo', 'resumo com sal de 32 bytes, mascarado por MGF1'],
            ['mesma mensagem, de novo', 'mesma assinatura', 'assinatura diferente'],
            ['prova de segurança', 'não tem', 'tão difícil quanto quebrar o RSA'],
            ['onde aparece', 'certificados, DNSSEC, o laboratório', 'TLS 1.3 com chave RSA'],
          ],
        },
      },
      {
        titulo: 'HMAC: resumo com segredo',
        texto: [`HMAC-SHA-256 calculado pelo motor do jogo, com a chave "${SEGREDO_HMAC}". Mudou a letra ou mudou a chave, mudou tudo.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Chave', 'Mensagem', 'Começo do HMAC'],
          linhas: [
            [SEGREDO_HMAC, ORDEM, HMAC_ORDEM.slice(0, 24)],
            [SEGREDO_HMAC, ORDEM_FALSA, HMAC_FALSA.slice(0, 24)],
            ['outro-segredo', ORDEM, HMAC_OUTRA.slice(0, 24)],
          ],
        },
      },
      {
        titulo: 'O paradoxo do aniversário',
        texto: ['Achar duas mensagens com o mesmo resumo de n bits leva cerca de 2^(n/2) tentativas.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Resumo', 'Achar uma mensagem para um resumo dado', 'Achar duas que colidem'],
          linhas: [
            ['16 bits (brinquedo)', '2^16 = 65536', `cerca de 2^8; no laboratório, ${COLISAO.tentativas} tentativas`],
            ['64 bits', '2^64', '2^32: uma tarde'],
            ['160 bits (SHA-1)', '2^160', '2^80 em teoria; colisão já produzida'],
            ['256 bits (SHA-256)', '2^256', '2^128: fora de alcance'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que a assinatura com chave pública dispensa o árbitro da assinatura simétrica?',
      opcoes: [
        'Porque só quem tem a chave privada consegue produzir a assinatura, e qualquer um confere com a pública',
        'Porque a chave pública é secreta',
        'Porque o resumo já basta para provar quem escreveu',
        'Porque a mensagem vai cifrada e ninguém a lê',
      ],
      certa: 0,
      explicacao: 'Na assinatura simétrica, quem confere tem a mesma chave de quem assina e poderia ter forjado; por isso precisa de um árbitro. Com par de chaves, a privada é só de quem assina e a pública confere sem poder assinar. O resumo sozinho qualquer um calcula, e a assinatura nem precisa esconder o texto.',
    },
  },
  desafio: {
    carta: [
      `Um fornecedor mandou o contrato "${CONTRATO}", e na rede circulou a versão "${CONTRATO_ALTERADO}". O sistema antigo do fornecedor carimba os contratos com um resumo de 40 bits.`,
      'A cooperativa quer as duas versões resumidas com SHA-256, o contrato original assinado pela tesouraria e uma conta de quanto o carimbo antigo aguenta.',
      'Objetivo: os resumos SHA-256 das duas versões, o original assinado e conferido, e os dois números do resumo de 40 bits: colisão e segunda pré-imagem.',
    ],
    dicas: [
      'Resuma as duas versões do contrato com "Resumo SHA-256", exatamente como na carta, e assine a original com "Assinar e conferir".',
      'Duas mensagens quaisquer que colidem: metade dos bits, 40 ÷ 2.',
      'Uma mensagem que bata com um resumo já dado não tem atalho de aniversário: são todos os bits.',
    ],
    perguntas: d133D,
    montar: () => mundoTesouraria(8133),
    objetivo: (m) => [
      item('resumo SHA-256 do contrato original', resumoFeito(m, H_CONTRATO), H_CONTRATO.slice(0, 16) + '...'),
      item('resumo SHA-256 da versão alterada', resumoFeito(m, H_CONTRATO_ALT), H_CONTRATO_ALT.slice(0, 16) + '...'),
      item('um contrato assinado e conferido, com a alteração recusada', !!assinaturaFeita(m), assinaturaFeita(m) ? 'confere' : 'ainda não'),
      ...todasRespondidas(m, d133D),
    ],
    solucao: [
      ['equip', 'tesouraria', 'sg-sha256', { t: CONTRATO }],
      ['equip', 'tesouraria', 'sg-sha256', { t: CONTRATO_ALTERADO }],
      ['equip', 'tesouraria', 'sg-assinar', { t: CONTRATO }],
    ],
    respostas: { '1': '20', '2': '40' },
  },
};

export const ATO7D: Dia[] = [dia131, dia132, dia133];
