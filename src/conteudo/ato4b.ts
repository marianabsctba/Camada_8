// Dias do ato 4 (A Cidade), com prática guiada, aula e desafio no próprio dia.
// No data center municipal: sub-redes e agregação (5.7.2), NAT (5.7.2) e IPv6 (5.7.3).

import { abreviarIpv6, enlaceLocal, mesmoPrefixoIpv6 } from '../motor/ip';
import { adicionar, comutador, ligar, novoMundo, pc, roteador, type Equipamento, type Mundo } from '../motor/mundo';
import { configurarNat, escolherRota, nat, ping6, rotasDe } from '../motor/roteamento';
import { lerCidr, lerIp } from '../motor/util';
import { item, numerica, pingOk, registroPing, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

const cidr = (s: string) => lerCidr(s)!;

/** Pergunta de resposta em texto, conferida por expressão regular. */
function texto(id: string, enunciado: string, re: RegExp): Pergunta {
  return { id, texto: enunciado, confere: (r) => re.test(r.trim()) };
}

function eq(m: Mundo, nome: string): Equipamento {
  return m.equipamentos.get(nome)!;
}

/** O endereço/prefixo configurado numa porta de roteador, ou undefined. */
function intf(m: Mundo, rot: string, porta: string): string | undefined {
  return (eq(m, rot).s.interfaces as Record<string, string> | undefined)?.[porta];
}

/** A interface está exatamente com este endereço e prefixo? */
function intfIgual(m: Mundo, rot: string, porta: string, esperado: string): boolean {
  const c = lerCidr(intf(m, rot, porta) ?? '');
  const e = lerCidr(esperado)!;
  return !!c && c.endereco === e.endereco && c.prefixo === e.prefixo;
}

/** Conferência de um "pôr endereço numa porta", explicando o erro. */
function conferirIntf(m: Mundo, rot: string, porta: string, esperado: string, motivo: string): true | string {
  const atual = intf(m, rot, porta);
  const c = lerCidr(atual ?? '');
  const e = lerCidr(esperado)!;
  if (!c) return `A ${porta} continua sem endereço. Escreva endereço e prefixo, como ${esperado}.`;
  if (c.prefixo !== e.prefixo) return `Com /${c.prefixo}, a rede da ${porta} não é a combinada. O bloco foi dividido em /${e.prefixo}.`;
  if (c.endereco !== e.endereco) return `A ${porta} ficou com ${atual}. ${motivo}`;
  return true;
}

/** Rota estática exata na tabela do roteador. */
function temRota(m: Mundo, rot: string, destino: string, via: string): boolean {
  return ((eq(m, rot).s.rotas ?? []) as { destino: string; via: string }[]).some((r) => r.destino === destino && r.via === via);
}

const pingFalhou = (m: Mundo, de: string, ip: string) => {
  const r = registroPing(m, de, ip);
  return !!r && r.recebidos === 0;
};

/* ======================================================================
 * 92: Sub-redes (5.7.2)
 * ====================================================================== */

const IP92 = { norte: '10.40.0.10', leste: '10.40.0.70', sul: '10.40.0.130' };

const d92: Pergunta[] = [texto('1', 'Qual é o endereço de broadcast da sub-rede do bairro Leste, 10.40.0.64/26?', /^10\.40\.0\.127$/)];
const d92D: Pergunta[] = [numerica('1', 'Quantos hosts utilizáveis cabem numa sub-rede /25?', 126, 0)];

function montar92(): Mundo {
  const m = novoMundo(492);
  adicionar(
    m,
    roteador('r-dc', {
      modelo: 'Roteador Encruzilhada 4 (data center municipal)',
      portas: ['norte', 'leste', 'sul', 'saida'],
      interfaces: { norte: '10.40.0.1/26', saida: '10.255.0.2/30' },
      rotas: [{ destino: '0.0.0.0/0', via: '10.255.0.1' }],
    }),
  );
  adicionar(m, roteador('r-borda', { modelo: 'Roteador Encruzilhada 2 (borda da cidade)', interfaces: { dentro: '10.255.0.1/30', noc: '10.250.0.1/24' }, rotas: [{ destino: '10.40.0.0/24', via: '10.255.0.2' }] }));
  adicionar(m, pc('pc-norte', { ip: cidr(`${IP92.norte}/26`), gateway: '10.40.0.1', modelo: 'PC da associação do bairro Norte' }));
  adicionar(m, pc('pc-leste', { ip: cidr(`${IP92.leste}/26`), gateway: '10.40.0.65', modelo: 'PC do centro comunitário do bairro Leste' }));
  adicionar(m, pc('pc-sul', { ip: cidr(`${IP92.sul}/26`), gateway: '10.40.0.129', modelo: 'PC da biblioteca do bairro Sul' }));
  ligar(m, { equip: 'pc-norte', porta: 'eth0' }, { equip: 'r-dc', porta: 'norte' }, 'cat6', 60);
  ligar(m, { equip: 'pc-leste', porta: 'eth0' }, { equip: 'r-dc', porta: 'leste' }, 'cat6', 90);
  ligar(m, { equip: 'pc-sul', porta: 'eth0' }, { equip: 'r-dc', porta: 'sul' }, 'cat6', 80);
  ligar(m, { equip: 'r-dc', porta: 'saida' }, { equip: 'r-borda', porta: 'dentro' }, 'cat6', 5);
  return m;
}

const dia92: Dia = {
  numero: 92,
  ato: 4,
  titulo: 'Sub-redes',
  chamado: [
    'CHAMADO #0092',
    'A prefeitura reservou para os bairros o bloco 10.40.0.0/24, e o data center tem um roteador com uma porta para cada bairro. O Norte já funciona com 10.40.0.0/26; o Leste e o Sul estão com os PCs configurados e o roteador mudo do lado deles.',
    'O combinado na reunião foi dividir o bloco em quatro pedaços iguais, um por bairro, e guardar o último para o que vier. Ninguém anotou quais são os pedaços. A ata diz só "aquela conta lá".',
    'Objetivo: as portas leste e sul do r-dc com o primeiro endereço de cada sub-rede, o PC do Leste pingando o PC do Sul e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Endereço, prefixo e sub-rede',
    texto: [
      'Um endereço IPv4 tem 32 bits, escritos em quatro números de 0 a 255 separados por ponto: 10.40.0.65 é 00001010.00101000.00000000.01000001. Uma parte desses bits diz de que rede o endereço é; o resto diz qual host, dentro dela. O prefixo conta quantos bits são da rede: em 10.40.0.65/26, os 26 primeiros. A máscara é o mesmo prefixo escrito como endereço, com uns na parte de rede e zeros na de host: /26 é 255.255.255.192.',
      'No começo, o tamanho da rede vinha da classe, lida no primeiro número. Classe A (de 0 a 127) tinha prefixo /8 e 16.777.214 hosts; classe B (128 a 191), /16 e 65.534; classe C (192 a 223), /24 e 254. Era pouca escolha: quem precisava de 2.000 endereços pegava uma B e desperdiçava mais de 63 mil, e as tabelas dos roteadores cresciam com cada C distribuída. O CIDR acabou com isso: o prefixo pode ter qualquer tamanho, e vai escrito junto do endereço, com a barra.',
      'Dividir um bloco em sub-redes é emprestar bits do host para a rede. O /24 tem 8 bits de host; pegando 2 deles, ele vira quatro /26, de 64 endereços cada: 10.40.0.0, 10.40.0.64, 10.40.0.128 e 10.40.0.192. Em cada sub-rede, o primeiro endereço (bits de host todos em zero) é o da rede, e o último (todos em um) é o broadcast. Sobram 2^6 - 2 = 62 hosts utilizáveis. Costuma-se dar ao roteador o primeiro deles.',
      'O caminho inverso também serve. Quatro /26 vizinhas, que juntas formam um /24 alinhado, podem ser anunciadas como uma rota só: isso é agregação, ou superrede. A borda da cidade não precisa saber de cada bairro; basta uma linha dizendo que 10.40.0.0/24 é pelo data center.',
      'E quando duas rotas casam com o mesmo destino, vence a de prefixo mais longo, a mais específica. Um pacote para 10.40.0.77 casa com a rota padrão 0.0.0.0/0, que casa com tudo, e com 10.40.0.64/26. Ganha o /26, porque 26 bits iguais dizem mais que zero. É assim que uma rota agregada convive com exceções dentro dela.',
    ],
  },
  dicas: [
    'Use a calculadora de sub-rede para dividir 10.40.0.0/24 em /26 e ver as quatro redes.',
    'Cada porta do roteador ganha o primeiro host da sua sub-rede. Os PCs já usam esses endereços como gateway.',
    'No r-dc, ponha 10.40.0.65/26 na porta leste e 10.40.0.129/26 na sul; depois, do pc-leste, pingue 10.40.0.130.',
  ],
  montar: montar92,
  objetivo: (m) => [
    item('porta leste do r-dc com 10.40.0.65/26', intfIgual(m, 'r-dc', 'leste', '10.40.0.65/26'), intf(m, 'r-dc', 'leste') ?? 'sem endereço'),
    item('porta sul do r-dc com 10.40.0.129/26', intfIgual(m, 'r-dc', 'sul', '10.40.0.129/26'), intf(m, 'r-dc', 'sul') ?? 'sem endereço'),
    pingOk(m, 'pc-leste', IP92.sul),
    ...todasRespondidas(m, d92),
  ],
  posMorte: [
    'O bloco 10.40.0.0/24 virou quatro /26: Norte em 10.40.0.0, Leste em 10.40.0.64, Sul em 10.40.0.128, e 10.40.0.192 guardado. Cada porta do r-dc é uma rede, e cada rede é um domínio de broadcast separado: o ARP do Leste não incomoda mais ninguém do Sul. Para ir de um para o outro, o pacote passa pelo roteador e gasta um do TTL.',
    'O ping do pc-leste saiu para o gateway porque 10.40.0.130 não casa com a máscara dele: os 26 primeiros bits são diferentes. Foi a máscara, não o endereço sozinho, que mandou o pacote para o roteador. Com máscara errada, um PC acha que o vizinho é de fora, ou que alguém de fora é vizinho, e o defeito parece mágica.',
    'Lá na borda, o r-borda continua com uma linha só para os quatro bairros: 10.40.0.0/24 pelo data center. Quando a cidade crescer e ganhar mais blocos, a ideia é a mesma, e a tabela da borda fica pequena. Agregar é o que impede a internet inteira de ter uma rota por casa.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-subrede',
      valores: { cidr: '10.40.0.0/24' },
      pedir: ['dividir'],
      exemplo: { dividir: '26' },
      instrucao: 'No r-dc, divida o bloco 10.40.0.0/24 em quatro sub-redes iguais.',
      porque: 'Quatro pedaços iguais pedem 2 bits a mais de rede, porque 2^2 = 4. O prefixo passa de /24 para /26, e cada pedaço fica com 6 bits de host.',
      feito: 'Quatro /26 de 62 hosts cada: 10.40.0.0, 10.40.0.64, 10.40.0.128 e 10.40.0.192. A máscara de cada uma é 255.255.255.192.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-ip',
      valores: { porta: 'leste' },
      pedir: ['ip'],
      exemplo: { ip: '10.40.0.65/26' },
      instrucao: 'Ponha na porta leste o primeiro host da segunda sub-rede, com o prefixo.',
      porque: 'A segunda sub-rede é 10.40.0.64/26. O 10.40.0.64 é o endereço da rede e não serve para interface; o primeiro host é o .65, e é esse que o pc-leste já usa como gateway.',
      conferir: (m) => conferirIntf(m, 'r-dc', 'leste', '10.40.0.65/26', 'O pc-leste usa 10.40.0.65 como gateway: se o roteador não tiver esse endereço, ninguém responde ao ARP dele.'),
      feito: 'Porta leste com 10.40.0.65/26, e a rota conectada 10.40.0.64/26 apareceu sozinha na tabela.',
    }),
    passo({
      alvo: ['equip', 'r-dc'],
      acao: 'rot-ip',
      valores: { porta: 'sul' },
      pedir: ['ip'],
      exemplo: { ip: '10.40.0.129/26' },
      instrucao: 'Agora a porta sul, com o primeiro host da terceira sub-rede.',
      porque: 'A terceira sub-rede começa em 10.40.0.128. O primeiro host é o .129, o gateway do pc-sul.',
      conferir: (m) => conferirIntf(m, 'r-dc', 'sul', '10.40.0.129/26', 'O pc-sul usa 10.40.0.129 como gateway.'),
      feito: 'Três bairros com rede própria, cada um numa porta. O último /26 fica livre para o que vier.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '10.40.0.127' },
      instrucao: 'Qual é o endereço de broadcast da sub-rede do Leste, 10.40.0.64/26?',
      porque: 'O broadcast tem todos os bits de host em 1. São 6 bits: 64 + 63 = 127. É o último endereço antes da próxima sub-rede, que começa em .128.',
      feito: '10.40.0.127. Um pacote para esse endereço chega a todos os hosts do Leste, e só a eles: o roteador não repassa broadcast.',
    }),
    passo({
      alvo: ['equip', 'pc-leste'],
      acao: 'ping',
      valores: { destino: IP92.sul, n: '4' },
      instrucao: 'Do pc-leste, pingue o PC do Sul, em 10.40.0.130.',
      porque: 'O pc-leste aplica a própria máscara: 10.40.0.130 não está em 10.40.0.64/26, então o pacote vai para o gateway. O roteador olha a tabela, acha a rota conectada 10.40.0.128/26 e entrega pela porta sul.',
      conferir: (m) => pingOk(m, 'pc-leste', IP92.sul).ok || 'O ping não voltou. Confira as portas leste e sul do r-dc.',
      feito: 'Quatro respostas com TTL 63: saiu com 64, passou por um roteador. Dois bairros, duas redes, uma conversa.',
    }),
    passo({
      alvo: ['equip', 'pc-norte'],
      acao: 'agregar',
      valores: { lista: '10.40.0.0/26 10.40.0.64/26 10.40.0.128/26 10.40.0.192/26' },
      instrucao: 'No pc-norte, agregue as quatro sub-redes dos bairros.',
      porque: 'Duas sub-redes irmãs, do mesmo tamanho e alinhadas, viram uma com prefixo um bit menor. Quatro /26 viram dois /25, que viram um /24.',
      feito: 'Agregado exato: 10.40.0.0/24. É a única rota que o r-borda precisa ter para chegar a todos os bairros.',
    }),
    passo({
      escolha: {
        opcoes: ['10.40.0.64/26, pela porta leste', '0.0.0.0/0, pela borda', 'As duas: o roteador manda uma cópia por cada', 'Nenhuma: duas rotas casando é conflito'],
        certa: 0,
        errada: {
          1: 'A rota padrão casa com qualquer destino, mas com prefixo 0: zero bits conferidos. É o último recurso, não a primeira opção.',
          2: 'O roteador escolhe uma saída só para cada pacote. Mandar cópias duplicaria o tráfego e é coisa de inundação, não de tabela de rotas.',
          3: 'Não é conflito, é o normal. Quase todo destino casa com mais de uma rota, e a regra do prefixo mais longo desempata.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Chega ao r-dc um pacote para 10.40.0.77. Casam com ele a rota padrão e a rota conectada do Leste. Qual vence?',
      porque: 'Vence a rota mais específica: a que confere mais bits do destino. Isso permite ter uma rota geral e exceções dentro dela.',
      feito: 'O /26 vence o /0. É o casamento do prefixo mais longo, e é a única regra que o roteador consulta para cada pacote.',
    }),
  ],
  perguntas: d92,
  aula: {
    cartoes: [
      {
        titulo: '32 bits em quatro números',
        texto: ['Cada número do endereço é um byte, de 0 a 255. O prefixo diz quantos bits, da esquerda para a direita, são da rede.'],
        visual: { tipo: 'bits', antes: '10.40.0.65', depois: '00001010.00101000.00000000.01|000001', legenda: 'com /26, os 26 primeiros bits são a rede e os 6 últimos, o host' },
      },
      {
        titulo: 'Prefixo e máscara',
        texto: ['A máscara é o prefixo escrito como endereço: uns na rede, zeros no host. Cada bit a mais no prefixo corta a sub-rede pela metade.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Prefixo', 'Máscara', 'Endereços', 'Hosts utilizáveis'],
          linhas: [
            ['/24', '255.255.255.0', '256', '254'],
            ['/25', '255.255.255.128', '128', '126'],
            ['/26', '255.255.255.192', '64', '62'],
            ['/27', '255.255.255.224', '32', '30'],
            ['/30', '255.255.255.252', '4', '2'],
          ],
        },
      },
      {
        titulo: 'Classes e por que acabaram',
        texto: [
          'Antes, o primeiro número decidia o tamanho da rede. Eram três tamanhos, e quase nunca o certo: a C era pequena demais para muita gente, a B era grande demais e foi acabando.',
          'O CIDR liberou o prefixo para qualquer tamanho, e permitiu agregar blocos vizinhos numa rota só.',
        ],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Classe', 'Primeiro número', 'Prefixo fixo', 'Hosts por rede'],
          linhas: [
            ['A', '0 a 127', '/8', '16.777.214'],
            ['B', '128 a 191', '/16', '65.534'],
            ['C', '192 a 223', '/24', '254'],
          ],
        },
      },
      {
        titulo: 'Um bloco, quatro bairros',
        texto: ['Dividir é emprestar bits do host. Em cada pedaço, o primeiro endereço é a rede e o último é o broadcast; nenhum dos dois vai em interface.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'b', rotulo: '10.40.0.0/24', x: 300, y: 50 },
            { id: 'n', rotulo: 'Norte .0 a .63', x: 75, y: 190 },
            { id: 'l', rotulo: 'Leste .64 a .127', x: 225, y: 190 },
            { id: 's', rotulo: 'Sul .128 a .191', x: 375, y: 190 },
            { id: 'r', rotulo: 'reserva .192 a .255', x: 525, y: 190 },
          ],
          ligacoes: [
            ['b', 'n', '/26'],
            ['b', 'l', '/26'],
            ['b', 's', '/26'],
            ['b', 'r', '/26'],
          ],
        },
      },
      {
        titulo: 'Agregar e o prefixo mais longo',
        texto: ['A borda guarda uma rota agregada para todos os bairros. Dentro do data center, cada bairro tem a sua. Para cada pacote, vence a rota que casa com mais bits do destino.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Destino do pacote', 'Rotas que casam', 'Vence'],
          linhas: [
            ['10.40.0.77', '0.0.0.0/0 e 10.40.0.64/26', '10.40.0.64/26'],
            ['10.40.0.200', '0.0.0.0/0 e 10.40.0.0/24', '10.40.0.0/24'],
            ['198.51.100.9', '0.0.0.0/0', '0.0.0.0/0'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Quantos hosts utilizáveis cabem numa sub-rede /27?',
      opcoes: ['30', '32', '62', '14'],
      certa: 0,
      explicacao: 'Um /27 deixa 5 bits de host: 2^5 = 32 endereços. Tirando o de rede e o de broadcast, sobram 30.',
    },
  },
  desafio: {
    carta: [
      'O bloco dos bairros encheu, e a prefeitura liberou o vizinho, 10.40.1.0/24, para a escola e o posto de saúde, meio a meio. Um técnico configurou tudo numa tarde e foi embora cedo.',
      'O monitor da prefeitura, atrás do r-borda, não enxerga nem a escola nem o posto. E o posto não fala nem com o próprio roteador: a porta dele saiu com a máscara do bairro Norte, copiada e colada.',
      'Objetivo: a porta posto do r-dc na rede certa, a borda com uma rota só para os dois blocos, o monitor pingando a escola e o posto, e a pergunta respondida.',
    ],
    dicas: [
      'Meio a meio é /25. Veja com a calculadora onde começa a segunda metade e quantos hosts ela tem.',
      'No r-dc, a porta posto precisa de 10.40.1.129/25. No r-borda, 10.40.0.0/24 e 10.40.1.0/24 agregam num prefixo um bit menor.',
      'No r-borda, apague a rota 10.40.0.0/24 e crie 10.40.0.0/23 via 10.255.0.2. Depois pingue 10.40.1.10 e 10.40.1.200 a partir do monitor.',
    ],
    perguntas: d92D,
    respostas: { '1': '126' },
    montar: () => {
      const m = novoMundo(4092);
      adicionar(
        m,
        roteador('r-dc', {
          modelo: 'Roteador Encruzilhada 4 (data center municipal)',
          portas: ['centro', 'escola', 'posto', 'saida'],
          interfaces: { centro: '10.40.0.1/24', escola: '10.40.1.1/25', posto: '10.40.1.129/26', saida: '10.255.0.2/30' },
          rotas: [{ destino: '0.0.0.0/0', via: '10.255.0.1' }],
        }),
      );
      adicionar(m, roteador('r-borda', { modelo: 'Roteador Encruzilhada 2 (borda da cidade)', interfaces: { dentro: '10.255.0.1/30', noc: '10.250.0.1/24' }, rotas: [{ destino: '10.40.0.0/24', via: '10.255.0.2' }] }));
      adicionar(m, pc('pc-centro', { ip: cidr('10.40.0.10/24'), gateway: '10.40.0.1' }));
      adicionar(m, pc('pc-escola', { ip: cidr('10.40.1.10/25'), gateway: '10.40.1.1', modelo: 'PC da secretaria da escola' }));
      adicionar(m, pc('pc-posto', { ip: cidr('10.40.1.200/25'), gateway: '10.40.1.129', modelo: 'PC da recepção do posto de saúde' }));
      adicionar(m, pc('monitor', { ip: cidr('10.250.0.10/24'), gateway: '10.250.0.1', modelo: 'Servidor de monitoramento da prefeitura' }));
      ligar(m, { equip: 'pc-centro', porta: 'eth0' }, { equip: 'r-dc', porta: 'centro' }, 'cat6', 40);
      ligar(m, { equip: 'pc-escola', porta: 'eth0' }, { equip: 'r-dc', porta: 'escola' }, 'cat6', 70);
      ligar(m, { equip: 'pc-posto', porta: 'eth0' }, { equip: 'r-dc', porta: 'posto' }, 'cat6', 85);
      ligar(m, { equip: 'r-dc', porta: 'saida' }, { equip: 'r-borda', porta: 'dentro' }, 'cat6', 5);
      ligar(m, { equip: 'r-borda', porta: 'noc' }, { equip: 'monitor', porta: 'eth0' }, 'cat6', 3);
      return m;
    },
    objetivo: (m) => {
      const posto = lerCidr(intf(m, 'r-dc', 'posto') ?? '');
      const pcPosto = lerIp('10.40.1.200')!;
      const rotaPosto = escolherRota(eq(m, 'r-dc'), pcPosto);
      const estaticas = (eq(m, 'r-borda').s.rotas ?? []) as { destino: string; via: string }[];
      return [
        item('porta posto do r-dc com 10.40.1.129/25', intfIgual(m, 'r-dc', 'posto', '10.40.1.129/25'), posto ? `${intf(m, 'r-dc', 'posto')}${rotaPosto?.porta === 'posto' ? '' : ', e o pc-posto fica fora dela'}` : 'sem endereço'),
        item('r-borda com uma rota só, 10.40.0.0/23 via 10.255.0.2', temRota(m, 'r-borda', '10.40.0.0/23', '10.255.0.2') && estaticas.length === 1, estaticas.map((r) => `${r.destino} via ${r.via}`).join(', ') || 'nenhuma rota estática'),
        pingOk(m, 'monitor', '10.40.1.10'),
        pingOk(m, 'monitor', '10.40.1.200'),
        ...todasRespondidas(m, d92D),
      ];
    },
    solucao: [
      ['equip', 'r-dc', 'rot-subrede', { cidr: '10.40.1.0/24', dividir: '25' }],
      ['equip', 'r-dc', 'rot-ip', { porta: 'posto', ip: '10.40.1.129/25' }],
      ['equip', 'r-borda', 'rot-sem-rota', { destino: '10.40.0.0/24' }],
      ['equip', 'r-borda', 'rot-rota', { destino: '10.40.0.0/23', via: '10.255.0.2' }],
      ['equip', 'monitor', 'ping', { destino: '10.40.1.10', n: '4' }],
      ['equip', 'monitor', 'ping', { destino: '10.40.1.200', n: '4' }],
    ],
  },
};

/* ======================================================================
 * 93: NAT (5.7.2)
 * ====================================================================== */

const PORTAL = '198.51.100.80';

const d93: Pergunta[] = [numerica('1', 'Na tabela do NAT, que porta externa a casa-2 recebeu?', 50000, 0)];
const d93D: Pergunta[] = [texto('1', 'Qual faixa privada começa com 172? Responda com endereço e prefixo.', /^172\.16\.0\.0\s*\/\s*12$/)];

/** NAT ligado com esta porta interna e esta externa. */
function natCerto(m: Mundo, rot: string, interna: string, externa: string): boolean {
  const n = nat(eq(m, rot));
  return !!n && n.internas.includes(interna) && n.externa === externa && !n.internas.includes(externa);
}

function textoNat(m: Mundo, rot: string): string {
  const n = nat(eq(m, rot));
  return n ? `de ${n.internas.join(',')} para ${n.externa}` : 'desligado';
}

function montar93(): Mundo {
  const m = novoMundo(493);
  adicionar(m, comutador('sw-sul', { portas: 8, modelo: 'Switch Decorador 8 (8 portas, 1 Gb/s)' }));
  adicionar(m, pc('casa-1', { ip: cidr('192.168.30.10/24'), gateway: '192.168.30.1', modelo: 'PC da casa 1 da Rua das Paineiras' }));
  adicionar(m, pc('casa-2', { ip: cidr('192.168.30.11/24'), gateway: '192.168.30.1', modelo: 'PC da casa 2 da Rua das Paineiras' }));
  adicionar(m, roteador('r-sul', { modelo: 'Roteador Encruzilhada 2 (saída do bairro Sul)', interfaces: { lan: '192.168.30.1/24', wan: '203.0.113.2/30' }, rotas: [{ destino: '0.0.0.0/0', via: '203.0.113.1' }] }));
  adicionar(m, roteador('r-prov', { modelo: 'Roteador da Sinal de Fumaça Telecom', interfaces: { p1: '203.0.113.1/30', p2: '198.51.100.1/24' } }));
  adicionar(m, pc('portal', { ip: cidr(`${PORTAL}/24`), gateway: '198.51.100.1', modelo: 'Servidor do portal.exemplo, da cooperativa regional' }));
  ligar(m, { equip: 'casa-1', porta: 'eth0' }, { equip: 'sw-sul', porta: 'p1' }, 'cat6', 30);
  ligar(m, { equip: 'casa-2', porta: 'eth0' }, { equip: 'sw-sul', porta: 'p2' }, 'cat6', 45);
  ligar(m, { equip: 'sw-sul', porta: 'p8' }, { equip: 'r-sul', porta: 'lan' }, 'cat6', 2);
  ligar(m, { equip: 'r-sul', porta: 'wan' }, { equip: 'r-prov', porta: 'p1' }, 'cat6', 80);
  ligar(m, { equip: 'r-prov', porta: 'p2' }, { equip: 'portal', porta: 'eth0' }, 'cat6', 3);
  return m;
}

const dia93: Dia = {
  numero: 93,
  ato: 4,
  titulo: 'NAT',
  chamado: [
    'CHAMADO #0093',
    'O bairro Sul inteiro usa endereços 192.168.30.x, e a operadora da cidade vizinha, a Sinal de Fumaça Telecom, entregou para ele um único endereço público: 203.0.113.2. Um. Para todas as casas.',
    'As casas da Rua das Paineiras tentam abrir o portal.exemplo, da cooperativa regional, e nada volta. A operadora jura que a rota está lá. O roteador do bairro jura a mesma coisa.',
    'Objetivo: NAT ligado no r-sul, de dentro (lan) para fora (wan), as duas casas pingando o portal e a pergunta respondida.',
  ],
  manual: {
    titulo: 'Tradução de endereços',
    texto: [
      'O IPv4 tem 32 bits: pouco mais de 4,29 bilhões de endereços, para um planeta com mais aparelhos do que gente. Os blocos foram distribuídos muito antes de alguém imaginar um celular em cada bolso, e acabaram. A solução de longo prazo é o IPv6, assunto de amanhã. A de curto prazo, que já dura décadas, é o NAT.',
      'Três faixas foram reservadas para uso privado: 10.0.0.0/8, 172.16.0.0/12 e 192.168.0.0/16. Qualquer rede pode usá-las por dentro, à vontade, porque elas não andam na internet: nenhum roteador de fora tem rota para elas. Por isso o portal até recebe o pedido de uma casa do bairro, mas a resposta, endereçada a 192.168.30.10, morre no primeiro roteador da operadora.',
      'O NAT (tradução de endereço de rede) mora no roteador da saída. Cada pacote que vai de dentro para fora tem o IP de origem trocado pelo endereço público da porta externa, e a porta de origem trocada por uma que identifique a conversa. A troca vai para uma tabela: IP e porta de dentro, IP e porta de fora. Quando a resposta volta para o endereço público, o roteador procura a porta na tabela, desfaz a troca e entrega para a casa certa. Milhares de casas cabem atrás de um IP só, cada uma numa porta.',
      'O preço aparece rápido. Conexão que começa de fora não tem linha na tabela: um servidor dentro do bairro fica invisível, a não ser que alguém configure um encaminhamento de porta à mão. Protocolos que escrevem o próprio IP dentro dos dados, como alguns de voz e o FTP antigo, mandam para fora um endereço privado que não leva a lugar nenhum. E o NAT só sabe traduzir o que tem porta, como TCP e UDP; no ICMP, usa o identificador do eco no lugar da porta.',
      'Há quem torça o nariz. O NAT quebra a ideia de que cada aparelho tem um endereço único e de que qualquer um fala com qualquer um. Viola as camadas: um roteador, da camada de rede, mexendo em portas, que são da camada de transporte. E guarda estado: se o roteador reinicia, todas as conversas caem de uma vez. Mesmo assim, está em praticamente toda casa do mundo. Funciona, e a escassez não espera.',
    ],
  },
  dicas: [
    'Pingue o portal a partir da casa-1 e leia onde a resposta morreu.',
    'O r-sul precisa trocar o endereço privado pelo público na saída: NAT com a lan como interna e a wan como externa.',
    'Ligue o NAT no r-sul (interna lan, externa wan), pingue 198.51.100.80 das duas casas e veja a tabela do NAT.',
  ],
  montar: montar93,
  objetivo: (m) => [
    item('NAT no r-sul de lan para wan', natCerto(m, 'r-sul', 'lan', 'wan'), textoNat(m, 'r-sul')),
    pingOk(m, 'casa-1', PORTAL),
    pingOk(m, 'casa-2', PORTAL),
    ...todasRespondidas(m, d93),
  ],
  posMorte: [
    'Sem NAT, o pedido da casa-1 saiu com origem 192.168.30.10 e chegou ao portal. A resposta voltou para 192.168.30.10, e o roteador da operadora, que não tem rota para faixa privada nenhuma, descartou e avisou com "rede inalcançável". A rota de ida existia; faltava um caminho de volta para um endereço que o mundo não conhece.',
    'Com NAT, o portal viu as duas casas como 203.0.113.2. A casa-1 ficou com a porta 456, a mesma que já usava. A casa-2 também tinha usado 456, então o r-sul deu a ela a 50000 para não confundir as respostas. É a porta, e não o IP, que separa as casas lá fora.',
    'Se o portal quisesse começar uma conversa com a casa-2, não teria como: não existe linha na tabela para quem chega sem ser chamado. Para muita gente isso parece segurança, e de fato atrapalha curiosos. Mas é efeito colateral, não firewall, e cobra caro de quem precisa receber conexões.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'casa-1'],
      acao: 'ping',
      valores: { destino: PORTAL, n: '4' },
      instrucao: 'Da casa-1, pingue o portal, em 198.51.100.80.',
      porque: 'A ida tem rota: a casa-1 manda para o gateway, o r-sul tem rota padrão para a operadora, e a operadora conhece a rede do portal. Falta ver o que acontece na volta.',
      conferir: (m) => (pingFalhou(m, 'casa-1', PORTAL) ? true : pingOk(m, 'casa-1', PORTAL).ok ? 'O ping voltou: o NAT já está ligado?' : 'Faça o ping para ver onde ele morre.'),
      feito: 'O pedido chegou ao portal, mas a resposta morreu no r-prov com "rede inalcançável". O portal respondeu para 192.168.30.10, e ninguém lá fora sabe onde isso fica.',
    }),
    passo({
      escolha: {
        opcoes: ['192.168.30.10 é endereço privado, e ninguém de fora tem rota para ele', 'O portal não aceita pedidos do bairro Sul', 'O TTL acabou no meio do caminho', 'A casa-1 está sem gateway'],
        certa: 0,
        errada: {
          1: 'O portal respondeu: o pedido chegou e a resposta saiu. Quem descartou foi o roteador da operadora, no caminho de volta.',
          2: 'TTL esgotado viria como "tempo esgotado em trânsito". A mensagem foi "rede inalcançável": falta rota, não falta TTL.',
          3: 'Sem gateway, a casa-1 nem conseguiria mandar o pedido para fora. Ele chegou ao portal, então o gateway funciona.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Por que a resposta do portal não voltou?',
      porque: 'As faixas 10.0.0.0/8, 172.16.0.0/12 e 192.168.0.0/16 são privadas: valem dentro de qualquer rede e por isso não podem valer fora. Nenhum roteador da internet anuncia rota para elas.',
      feito: 'Endereço privado é como ramal de telefone: funciona dentro do prédio, mas ninguém de fora consegue discar direto para o ramal 30.',
    }),
    passo({
      alvo: ['equip', 'r-sul'],
      acao: 'rot-nat',
      valores: { interna: 'lan' },
      pedir: ['externa'],
      exemplo: { externa: 'wan' },
      instrucao: 'No r-sul, ligue o NAT com a lan como porta interna. Qual é a externa?',
      porque: 'A porta externa é a que tem o endereço público, 203.0.113.2. Todo pacote que entra pela interna e sai pela externa ganha esse endereço de origem.',
      conferir: (m) => (natCerto(m, 'r-sul', 'lan', 'wan') ? true : 'A externa é a porta do endereço público, a wan. Interna e externa não podem ser a mesma.'),
      feito: 'NAT ligado. A tabela de tradução ainda está vazia: ninguém de dentro saiu depois disso.',
    }),
    passo({
      alvo: ['equip', 'casa-1'],
      acao: 'ping',
      valores: { destino: PORTAL, n: '4' },
      instrucao: 'Da casa-1, pingue o portal de novo.',
      porque: 'Agora o pedido sai do r-sul com origem 203.0.113.2. A resposta volta para esse endereço, que a operadora conhece, e o r-sul desfaz a troca pela tabela.',
      conferir: (m) => pingOk(m, 'casa-1', PORTAL).ok || 'O ping ainda não voltou. Confira o NAT no r-sul.',
      feito: 'Quatro respostas. A primeira linha conta a troca: 192.168.30.10:456 virou 203.0.113.2:456. No ICMP, o NAT usa o identificador do eco como porta.',
    }),
    passo({
      alvo: ['equip', 'casa-2'],
      acao: 'ping',
      valores: { destino: PORTAL, n: '4' },
      instrucao: 'Agora da casa-2.',
      porque: 'A casa-2 também usa o identificador 456. Se o r-sul traduzisse para 203.0.113.2:456 de novo, não saberia para qual casa devolver a resposta.',
      conferir: (m) => pingOk(m, 'casa-2', PORTAL).ok || 'O ping da casa-2 não voltou.',
      feito: 'Voltou também, mas veja a troca: a porta externa não é 456. O NAT escolheu outra, livre.',
    }),
    passo({
      alvo: ['equip', 'r-sul'],
      acao: 'rot-nat-ver',
      instrucao: 'Veja a tabela do NAT no r-sul.',
      porque: 'Cada linha é uma conversa de dentro para fora. O lado de fora é sempre o mesmo IP; o que muda é a porta.',
      feito: 'Duas linhas: casa-1 em 203.0.113.2:456 e casa-2 em 203.0.113.2:50000. Um endereço público, duas casas, e a porta faz a separação.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '50000' },
      instrucao: 'Na tabela do NAT, que porta externa a casa-2 recebeu?',
      porque: 'A 456 já era da casa-1. O r-sul pega a próxima porta livre do seu estoque, que começa em 50000.',
      feito: '50000. Com 16 bits de porta, um IP público aguenta dezenas de milhares de conversas ao mesmo tempo.',
    }),
  ],
  perguntas: d93,
  aula: {
    cartoes: [
      {
        titulo: 'Faltou endereço',
        texto: ['O IPv4 tem 2^32 endereços, cerca de 4,29 bilhões. Acabaram. Três faixas ficaram reservadas para uso privado, repetidas em milhões de redes, e por isso proibidas lá fora.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Faixa privada', 'Prefixo', 'Endereços'],
          linhas: [
            ['10.0.0.0 a 10.255.255.255', '10.0.0.0/8', '16.777.216'],
            ['172.16.0.0 a 172.31.255.255', '172.16.0.0/12', '1.048.576'],
            ['192.168.0.0 a 192.168.255.255', '192.168.0.0/16', '65.536'],
          ],
        },
      },
      {
        titulo: 'A troca na saída',
        texto: ['O roteador da saída troca o IP e a porta de origem de quem sai, e desfaz a troca em quem volta. O portal nunca vê o endereço privado.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'casa-1 192.168.30.10', x: 90, y: 120 },
            { id: 'r', rotulo: 'r-sul (NAT)', x: 300, y: 120 },
            { id: 'p', rotulo: 'portal 198.51.100.80', x: 510, y: 120 },
          ],
          ligacoes: [
            ['c', 'r', 'origem 192.168.30.10:456'],
            ['r', 'p', 'origem 203.0.113.2:456'],
          ],
        },
      },
      {
        titulo: 'A tabela de tradução',
        texto: ['Cada conversa ganha uma linha. Quando duas casas usam a mesma porta, o NAT troca a de uma delas por outra livre.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Protocolo', 'Dentro (IP:porta)', 'Fora (IP:porta)'],
          linhas: [
            ['icmp', '192.168.30.10:456', '203.0.113.2:456'],
            ['icmp', '192.168.30.11:456', '203.0.113.2:50000'],
          ],
        },
      },
      {
        titulo: 'O que quebra',
        texto: ['O NAT só sabe tratar o que ele mesmo viu sair. O resto fica de fora.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Situação', 'Por que quebra'],
          linhas: [
            ['conexão que começa de fora', 'não há linha na tabela: o roteador não sabe para quem entregar'],
            ['protocolo que leva o IP nos dados', 'o endereço privado escrito lá dentro não é traduzido e não leva a lugar nenhum'],
            ['protocolo de transporte sem porta', 'sem porta, não há como separar as conversas'],
            ['roteador reiniciado', 'a tabela some e todas as conversas caem juntas'],
          ],
        },
      },
      {
        titulo: 'As críticas',
        texto: ['O NAT mexe em duas camadas ao mesmo tempo, guarda estado no meio da rede e acaba com o endereço único de cada aparelho. É um remendo que deu tão certo que virou paisagem.'],
        visual: {
          tipo: 'camadas',
          camadas: ['aplicação: às vezes leva o IP dentro dos dados (e o NAT não vê)', 'transporte: porta de origem (o NAT troca)', 'rede: IP de origem (o NAT troca)', 'enlace', 'física'],
          rotulo: 'onde o NAT põe a mão',
        },
      },
    ],
    checagem: {
      pergunta: 'Na casa-1 roda um servidor de jogos, e uma pessoa de outra cidade tenta se conectar a 203.0.113.2. O que acontece, sem nenhuma configuração extra?',
      opcoes: ['Não chega: não há linha na tabela do NAT para uma conexão que começa de fora', 'Chega à casa-1, porque ela foi a primeira a usar o NAT', 'Chega a todas as casas, como broadcast', 'Chega ao r-sul, que repassa para a casa com a menor porta'],
      certa: 0,
      explicacao: 'O NAT só desfaz trocas que ele mesmo fez na saída. Um pacote que chega sem ter sido chamado não casa com nenhuma linha, e o roteador não tem como saber para quem é. Só um encaminhamento de porta, configurado à mão, resolve.',
    },
  },
  desafio: {
    carta: [
      'O bairro Norte ganhou sua própria saída, com o endereço público 203.0.113.6. Quem configurou o r-norte deixou um bilhete: "NAT pronto". Pronto ele está, mas virado do avesso, com a lan de externa e a wan de interna.',
      'E o r-norte nem sabe por onde fica o resto do mundo: não tem rota padrão. A escola e o posto do Norte estão sem o portal da cooperativa desde a mudança.',
      'Objetivo: rota padrão no r-norte para a operadora, NAT da lan para a wan, a escola e o posto pingando o portal, e a pergunta respondida.',
    ],
    dicas: [
      'Veja as rotas e a tabela do NAT no r-norte. O próximo salto da operadora é o outro endereço do /30 da wan.',
      'A rota padrão é 0.0.0.0/0 via 203.0.113.5. O NAT tem interna lan e externa wan.',
      'As três faixas privadas são 10.0.0.0/8, 172.16.0.0/12 e 192.168.0.0/16.',
    ],
    perguntas: d93D,
    respostas: { '1': '172.16.0.0/12' },
    montar: () => {
      const m = novoMundo(4093);
      adicionar(m, comutador('sw-norte', { portas: 8, modelo: 'Switch Decorador 8 (8 portas, 1 Gb/s)' }));
      adicionar(m, pc('escola', { ip: cidr('192.168.10.20/24'), gateway: '192.168.10.1', modelo: 'PC da secretaria da escola do Norte' }));
      adicionar(m, pc('posto', { ip: cidr('192.168.10.30/24'), gateway: '192.168.10.1', modelo: 'PC do posto de saúde do Norte' }));
      adicionar(m, roteador('r-norte', { modelo: 'Roteador Encruzilhada 2 (saída do bairro Norte)', interfaces: { lan: '192.168.10.1/24', wan: '203.0.113.6/30' } }));
      adicionar(m, roteador('r-prov', { modelo: 'Roteador da Sinal de Fumaça Telecom', interfaces: { p1: '203.0.113.5/30', p2: '198.51.100.1/24' } }));
      adicionar(m, pc('portal', { ip: cidr(`${PORTAL}/24`), gateway: '198.51.100.1', modelo: 'Servidor do portal.exemplo, da cooperativa regional' }));
      ligar(m, { equip: 'escola', porta: 'eth0' }, { equip: 'sw-norte', porta: 'p1' }, 'cat6', 40);
      ligar(m, { equip: 'posto', porta: 'eth0' }, { equip: 'sw-norte', porta: 'p2' }, 'cat6', 55);
      ligar(m, { equip: 'sw-norte', porta: 'p8' }, { equip: 'r-norte', porta: 'lan' }, 'cat6', 2);
      ligar(m, { equip: 'r-norte', porta: 'wan' }, { equip: 'r-prov', porta: 'p1' }, 'cat6', 90);
      ligar(m, { equip: 'r-prov', porta: 'p2' }, { equip: 'portal', porta: 'eth0' }, 'cat6', 3);
      configurarNat(eq(m, 'r-norte'), ['wan'], 'lan');
      return m;
    },
    objetivo: (m) => {
      const padrao = rotasDe(eq(m, 'r-norte')).find((r) => r.origem === 'padrão' && r.valida && r.via === lerIp('203.0.113.5'));
      return [
        item('rota padrão do r-norte via 203.0.113.5', !!padrao, padrao ? 'ok' : 'sem rota padrão válida para a operadora'),
        item('NAT no r-norte de lan para wan', natCerto(m, 'r-norte', 'lan', 'wan'), textoNat(m, 'r-norte')),
        pingOk(m, 'escola', PORTAL),
        pingOk(m, 'posto', PORTAL),
        ...todasRespondidas(m, d93D),
      ];
    },
    solucao: [
      ['equip', 'r-norte', 'rot-nat-ver'],
      ['equip', 'r-norte', 'rot-rota', { destino: '0.0.0.0/0', via: '203.0.113.5' }],
      ['equip', 'r-norte', 'rot-nat', { interna: 'lan', externa: 'wan' }],
      ['equip', 'escola', 'ping', { destino: PORTAL, n: '4' }],
      ['equip', 'posto', 'ping', { destino: PORTAL, n: '4' }],
      ['equip', 'r-norte', 'rot-nat-ver'],
    ],
  },
};

/* ======================================================================
 * 94: IPv6 (5.7.3)
 * ====================================================================== */

/** Endereços IPv6 globais (os configurados) de um aparelho. */
function globais(m: Mundo, nome: string): string[] {
  return ((eq(m, nome).s.ipv6 ?? []) as string[]).map((x) => x.split('/')[0]!);
}

/** O endereço configurado está no /64 esperado, com prefixo 64, e não repete o de outro aparelho? */
function ipv6No64(m: Mundo, nome: string, prefixo: string): true | string {
  const cfg = ((eq(m, nome).s.ipv6 ?? []) as string[])[0];
  if (!cfg) return `${nome} só tem o endereço de enlace local. Configure um global, com /64.`;
  const [a, p] = cfg.split('/');
  if (Number(p) !== 64) return `O prefixo ficou /${p}. Em rede local IPv6, o padrão é /64: 64 bits de rede e 64 de interface.`;
  if (!mesmoPrefixoIpv6(a!, prefixo, 64)) return `${a} não está em ${prefixo}/64. Os quatro primeiros grupos têm que ser os da rede.`;
  for (const outro of m.equipamentos.values()) {
    if (outro.nome === nome) continue;
    if (globais(m, outro.nome).some((x) => abreviarIpv6(x) === abreviarIpv6(a!))) return `${a} já é de ${outro.nome}. Cada interface precisa do seu.`;
  }
  return true;
}

/** Ping6 de verdade, calculado na hora (o comando não deixa registro). */
function alcanca6(m: Mundo, de: string, para: string): boolean {
  return ping6(m, de, para, 1).recebidos === 1;
}

const LL_R94 = enlaceLocal('02:c8:00:00:00:04')!;
const LL_ACERVO = enlaceLocal('02:c8:00:00:00:03')!;

const d94: Pergunta[] = [{ id: '1', texto: 'Escreva 2001:0db8:0000:0000:00e5:0000:0000:0001 na forma mais curta.', confere: (r) => r.trim().toLowerCase() === '2001:db8::e5:0:0:1' }];
const d94D: Pergunta[] = [{ id: '1', texto: 'Qual é o endereço de enlace local do acervo?', confere: (r, m) => abreviarIpv6(r) !== null && abreviarIpv6(r) === enlaceLocal(eq(m, 'acervo').mac) }];

function montar94(): Mundo {
  const m = novoMundo(494);
  m.flags.camadaRede = true;
  adicionar(m, comutador('sw-escola', { portas: 8, modelo: 'Switch Decorador 8G gerenciável (8 portas, 1 Gb/s)' }));
  adicionar(m, pc('lab-1', { ip: cidr('192.168.60.11/24'), gateway: '192.168.60.1', modelo: 'PC do laboratório, bancada 1' }));
  adicionar(m, pc('lab-2', { ip: cidr('192.168.60.12/24'), gateway: '192.168.60.1', modelo: 'PC do laboratório, bancada 2' }));
  adicionar(m, roteador('r-escola', { modelo: 'Roteador Encruzilhada 2 (escola)', portas: ['lan', 'wan'], interfaces: { lan: '192.168.60.1/24' } }));
  ligar(m, { equip: 'lab-1', porta: 'eth0' }, { equip: 'sw-escola', porta: 'p1' }, 'cat6', 12);
  ligar(m, { equip: 'lab-2', porta: 'eth0' }, { equip: 'sw-escola', porta: 'p2' }, 'cat6', 14);
  ligar(m, { equip: 'sw-escola', porta: 'p8' }, { equip: 'r-escola', porta: 'lan' }, 'cat6', 3);
  eq(m, 'lab-2').s.ipv6 = ['2001:db8:e5c:1::20/64'];
  eq(m, 'r-escola').s.ipv6 = ['2001:db8:e5c:1::1/64'];
  return m;
}

const dia94: Dia = {
  numero: 94,
  ato: 4,
  titulo: 'IPv6',
  chamado: [
    'CHAMADO #0094',
    'A operadora avisou: endereço IPv4 público novo, só no ano que vem, e pela hora da morte. Em compensação, entregou para a escola o bloco IPv6 2001:db8:e5c::/48, com mais endereços do que a cidade inteira consegue gastar em vários séculos.',
    'O laboratório vai ser o primeiro a usar. A rede dele é a 2001:db8:e5c:1::/64; o roteador e a bancada 2 já estão configurados. A bancada 1 é sua.',
    'Objetivo: a bancada 1 com um endereço IPv6 global na rede do laboratório, alcançando a bancada 2 por IPv6, e a pergunta respondida.',
  ],
  manual: {
    titulo: 'O endereço de 128 bits',
    texto: [
      'O IPv6 nasceu porque o IPv4 ia acabar, e acabou. Em vez de 32 bits, o endereço tem 128: são 2^128, cerca de 3,4 × 10^38 endereços. Isso permite que cada rede local receba um /64 inteiro, que sozinho tem 2^64 endereços, o quadrado da internet IPv4 inteira. Com tanto endereço, o NAT deixa de ser necessário, e cada aparelho volta a ter o seu.',
      'O endereço se escreve em 8 grupos de 4 dígitos hexadecimais, separados por dois-pontos: 2001:0db8:0e5c:0001:0000:0000:0000:0010. Para abreviar, tiram-se os zeros à esquerda de cada grupo e troca-se a maior sequência de dois ou mais grupos zerados por "::", uma vez só (no empate, a primeira). Fica 2001:db8:e5c:1::10. Um "::" só, porque com dois não daria para saber quantos zeros cabem em cada um.',
      'Os primeiros 64 bits são a rede (o prefixo), e os últimos 64 são o identificador da interface. Esse identificador pode vir do MAC, pelo EUI-64: parte o MAC de 48 bits no meio, enfia ff:fe e inverte o sétimo bit do primeiro byte. Com o prefixo fe80::/64 na frente, nasce o endereço de enlace local, que toda interface IPv6 tem sozinha, sem ninguém configurar. Ele vale só no próprio enlace e é por ele que os vizinhos se acham: no IPv6, o ARP virou descoberta de vizinho, por multicast, porque broadcast não existe mais.',
      'O cabeçalho ficou mais simples: 40 bytes fixos, com 8 campos. Saiu o checksum, porque o enlace e o transporte já conferem, e cada roteador deixa de recalcular uma soma a cada salto. Saiu a fragmentação no caminho: só a origem fragmenta, e um roteador que recebe um pacote grande demais devolve um aviso em vez de cortar. O TTL virou hop limit. O que é raro, como opções e fragmentação, foi para cabeçalhos de extensão, encadeados pelo campo "próximo cabeçalho".',
      'A troca não acontece num dia. O caminho mais comum é a pilha dupla: cada aparelho fala IPv4 e IPv6 ao mesmo tempo, e usa o que o outro lado entender. Onde só há IPv4 no meio, um túnel leva o IPv6 dentro de pacotes IPv4. E onde um lado só fala IPv6 e o outro só IPv4, um tradutor no meio converte um no outro. O laboratório vai em pilha dupla: o IPv4 de sempre continua lá.',
    ],
  },
  dicas: [
    'Use a calculadora de IPv6 para treinar a abreviação, e a de EUI-64 para ver de onde vem o endereço de enlace local.',
    'Os quatro primeiros grupos do endereço da bancada 1 têm que ser 2001:db8:e5c:1. O resto é seu, desde que não repita o de ninguém.',
    'Configure 2001:db8:e5c:1::10/64 na bancada 1 e faça ping6 para 2001:db8:e5c:1::20.',
  ],
  montar: montar94,
  objetivo: (m) => {
    const ok = ipv6No64(m, 'lab-1', '2001:db8:e5c:1::');
    return [
      item('bancada 1 com IPv6 global em 2001:db8:e5c:1::/64', ok === true, ok === true ? globais(m, 'lab-1')[0] : ok),
      item('bancada 1 alcança a bancada 2 (2001:db8:e5c:1::20) por IPv6', alcanca6(m, 'lab-1', '2001:db8:e5c:1::20'), globais(m, 'lab-1').length ? 'ping6 conferido' : 'sem endereço global, ela não sabe que a bancada 2 é vizinha'),
      ...todasRespondidas(m, d94),
    ];
  },
  posMorte: [
    `Antes de configurar qualquer coisa, a bancada 1 já falava IPv6: o endereço de enlace local, ${enlaceLocal('02:c8:00:00:00:02')}, nasceu do MAC dela pelo EUI-64. Foi com ele que o ping6 até o roteador funcionou. A descoberta de vizinho foi para um endereço multicast de nó solicitado, que só os interessados escutam, em vez de gritar para todo mundo como o ARP.`,
    'O endereço global da bancada 1 tem os mesmos 64 primeiros bits da bancada 2, e por isso as duas se acham direto no enlace. Os 64 bits de baixo são da interface: sobra espaço para uma quantidade absurda de aparelhos numa sala só, e ninguém precisa economizar.',
    'O cabeçalho de 40 bytes não tem checksum, e nenhum roteador vai fragmentar esses pacotes no caminho. E o IPv4 continua ali, em 192.168.60.11: é a pilha dupla. Enquanto houver alguém só com IPv4 do outro lado, as duas versões vão conviver.',
  ],
  passos: [
    passo({
      alvo: ['equip', 'lab-1'],
      acao: 'ipv6',
      valores: { end: '2001:0db8:0e5c:0001:0000:0000:0000:0010' },
      instrucao: 'Na bancada 1, abra a calculadora de IPv6 com o endereço que ela vai ganhar, escrito por extenso.',
      porque: 'São 128 bits em 8 grupos de 16. Por extenso ninguém aguenta: a abreviação tira os zeros à esquerda e troca a maior sequência de grupos zerados por "::".',
      feito: 'Abreviado, 2001:db8:e5c:1::10. Os três grupos zerados do meio viraram "::", e o prefixo /64 é 2001:db8:e5c:1::/64, a rede do laboratório.',
    }),
    passo({
      alvo: ['equip', 'lab-1'],
      acao: 'eui64',
      instrucao: 'Calcule o identificador EUI-64 a partir do MAC da própria bancada 1.',
      porque: 'O MAC 02:c8:00:00:00:02 é partido no meio, ganha ff:fe e tem o sétimo bit do primeiro byte invertido: o 02 vira 00. Com fe80:: na frente, vira o endereço de enlace local.',
      feito: `Identificador c8:ff:fe00:2, e o enlace local ${enlaceLocal('02:c8:00:00:00:02')}. Ninguém configurou isso: a interface fez sozinha.`,
    }),
    passo({
      alvo: ['equip', 'lab-1'],
      acao: 'ping6',
      valores: { end: LL_R94 },
      instrucao: 'Da bancada 1, faça ping6 no endereço de enlace local do roteador.',
      porque: 'O endereço fe80:: vale dentro do enlace sem nenhuma configuração. Antes do ping, a bancada pergunta quem tem aquele endereço por multicast de nó solicitado: é a descoberta de vizinho.',
      conferir: (m) => alcanca6(m, 'lab-1', LL_R94) || 'O ping6 não voltou.',
      feito: `Respondeu, com hop limit 64. A bancada 1 falou IPv6 com o roteador, em ${LL_R94}, sem ter endereço global nenhum.`,
    }),
    passo({
      alvo: ['equip', 'lab-1'],
      acao: 'ip6',
      pedir: ['end'],
      exemplo: { end: '2001:db8:e5c:1::10/64' },
      instrucao: 'Configure na bancada 1 um endereço global da rede 2001:db8:e5c:1::/64.',
      porque: 'Os 64 primeiros bits são a rede do laboratório e não mudam. Os 64 de baixo identificam a interface: qualquer valor que ninguém esteja usando. O roteador é o ::1 e a bancada 2 é o ::20.',
      conferir: (m) => ipv6No64(m, 'lab-1', '2001:db8:e5c:1::'),
      feito: 'Endereço global configurado. O de enlace local continua lá: uma interface IPv6 sempre tem mais de um endereço.',
    }),
    passo({
      alvo: ['equip', 'lab-1'],
      acao: 'ping6',
      valores: { end: '2001:db8:e5c:1::20' },
      instrucao: 'Faça ping6 na bancada 2, em 2001:db8:e5c:1::20.',
      porque: 'Com um endereço no mesmo /64, a bancada 1 sabe que a bancada 2 é vizinha e a procura direto no enlace, sem passar pelo roteador.',
      conferir: (m) => alcanca6(m, 'lab-1', '2001:db8:e5c:1::20') || 'O ping6 não voltou. Confira se o endereço da bancada 1 está em 2001:db8:e5c:1::/64.',
      feito: 'Respondeu. Duas bancadas no mesmo /64, e o cabeçalho de 40 bytes sem checksum fazendo o serviço.',
    }),
    passo({
      pergunta: '1',
      exemplo: { resposta: '2001:db8::e5:0:0:1' },
      instrucao: 'Escreva 2001:0db8:0000:0000:00e5:0000:0000:0001 na forma mais curta.',
      porque: 'Tire os zeros à esquerda de cada grupo. Sobram duas sequências de dois grupos zerados, do mesmo tamanho: no empate, o "::" fica com a primeira, e a outra é escrita como 0:0.',
      feito: '2001:db8::e5:0:0:1. Um "::" só, sempre: com dois, ninguém saberia quantos zeros vão em cada um.',
    }),
    passo({
      escolha: {
        opcoes: ['O checksum do cabeçalho', 'O endereço de origem', 'O tempo de vida (hop limit)', 'O tamanho dos dados'],
        certa: 0,
        errada: {
          1: 'O endereço de origem continua, só que com 128 bits. Sem ele, a resposta não teria para onde voltar.',
          2: 'O TTL só mudou de nome: virou hop limit, e cada roteador continua descontando um. É ele que impede um pacote de girar para sempre.',
          3: 'O tamanho continua, como "tamanho da carga útil". O que mudou é que o cabeçalho tem tamanho fixo, 40 bytes, e não entra na conta.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'Que campo do cabeçalho IPv4 não existe mais no IPv6?',
      porque: 'No IPv4, cada roteador muda o TTL e por isso recalcula a soma de verificação do cabeçalho a cada salto. O IPv6 confia na conferência do enlace e do transporte.',
      feito: 'O checksum. Também saíram do cabeçalho fixo os campos de fragmentação e as opções, que viraram cabeçalhos de extensão.',
    }),
  ],
  perguntas: d94,
  aula: {
    cartoes: [
      {
        titulo: 'Por que IPv6',
        texto: ['Os endereços IPv4 acabaram. O IPv6 aproveitou a troca para arrumar o que incomodava no cabeçalho.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'IPv4', 'IPv6'],
          linhas: [
            ['tamanho do endereço', '32 bits', '128 bits'],
            ['quantos endereços', 'cerca de 4,29 bilhões', 'cerca de 3,4 × 10^38'],
            ['cabeçalho', '20 a 60 bytes', '40 bytes fixos'],
            ['checksum do cabeçalho', 'sim, refeito a cada salto', 'não tem'],
            ['fragmentação no caminho', 'qualquer roteador', 'só a origem'],
            ['achar o vizinho', 'ARP, por broadcast', 'descoberta de vizinho, por multicast'],
          ],
        },
      },
      {
        titulo: 'Abreviar sem perder nada',
        texto: ['Tiram-se os zeros à esquerda de cada grupo, e a maior sequência de grupos zerados vira "::", uma vez só. No empate, fica a primeira.'],
        visual: { tipo: 'bits', antes: '2001:0db8:0e5c:0001:0000:0000:0000:0010', depois: '2001:db8:e5c:1::10', legenda: 'o mesmo endereço por extenso e abreviado' },
      },
      {
        titulo: 'O /64 e o EUI-64',
        texto: [
          'Os 64 primeiros bits são a rede; os 64 últimos, a interface. O identificador pode sair do MAC: parte no meio, enfia ff:fe, inverte o sétimo bit.',
          'Com fe80:: na frente, vira o endereço de enlace local, que toda interface tem sozinha.',
        ],
        visual: { tipo: 'bits', antes: '02:c8:00 | 00:00:02', depois: '00c8:00ff:fe00:0002', legenda: `MAC da bancada 1 e o identificador EUI-64: ${enlaceLocal('02:c8:00:00:00:02')}` },
      },
      {
        titulo: 'Cabeçalho enxuto',
        texto: ['Oito campos, 40 bytes, sempre. O que é raro foi para cabeçalhos de extensão, encadeados pelo campo "próximo cabeçalho".'],
        visual: {
          tipo: 'camadas',
          camadas: ['versão (4 bits), classe de tráfego (8), rótulo de fluxo (20)', 'tamanho da carga (16), próximo cabeçalho (8), hop limit (8)', 'endereço de origem (128 bits)', 'endereço de destino (128 bits)', 'cabeçalhos de extensão, se houver, e depois os dados'],
          rotulo: 'o cabeçalho IPv6, de cima para baixo',
        },
      },
      {
        titulo: 'A transição',
        texto: ['IPv4 e IPv6 não se entendem direto. Enquanto os dois existirem, convivem de três jeitos: pilha dupla, túnel ou tradução.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Jeito', 'Como funciona', 'Quando usar'],
          linhas: [
            ['pilha dupla', 'cada aparelho fala as duas versões', 'o caminho mais comum, como no laboratório'],
            ['túnel', 'o pacote IPv6 vai dentro de um pacote IPv4', 'quando só há IPv4 no meio do caminho'],
            ['tradução', 'um aparelho no meio converte um cabeçalho no outro', 'quando um lado só fala IPv6 e o outro só IPv4'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Qual destas é a forma mais curta de 2001:0db8:0000:0000:0001:0000:0000:0abc?',
      opcoes: ['2001:db8::1:0:0:abc', '2001:db8::1::abc', '2001:db8:1::abc', '21:db8::1:0:0:abc'],
      certa: 0,
      explicacao: 'Saem os zeros à esquerda (0abc vira abc, 0db8 vira db8). Há duas sequências de dois grupos zerados; no empate, o "::" fica com a primeira. Dois "::" não valem, porque não daria para saber quantos zeros vão em cada um; e zero à direita, como em 2001, nunca sai.',
    },
  },
  desafio: {
    carta: [
      'A biblioteca da escola entrou na pilha dupla também. O balcão e o servidor do acervo se falam por IPv4 sem problema, mas por IPv6 o balcão diz que o acervo "está fora do meu /64".',
      'A rede da biblioteca é 2001:db8:e5c:2::/64. Quem configurou o acervo digitou um zero a mais em algum lugar e foi tomar café.',
      'Objetivo: o acervo com IPv6 na rede da biblioteca, o balcão alcançando o acervo por IPv6 e por IPv4, e a pergunta respondida.',
    ],
    dicas: [
      'Compare o endereço IPv6 do balcão com o do acervo, grupo por grupo. Os quatro primeiros têm que ser iguais.',
      'Configure 2001:db8:e5c:2::5/64 no acervo e pingue o acervo a partir do balcão, por IPv4 e por IPv6.',
      'O enlace local do acervo sai do MAC dele, pela calculadora de EUI-64.',
    ],
    perguntas: d94D,
    respostas: { '1': LL_ACERVO },
    montar: () => {
      const m = novoMundo(4094);
      m.flags.camadaRede = true;
      adicionar(m, comutador('sw-bib', { portas: 8, modelo: 'Switch Decorador 8G gerenciável (8 portas, 1 Gb/s)' }));
      adicionar(m, pc('balcao', { ip: cidr('192.168.50.10/24'), modelo: 'PC do balcão de empréstimos' }));
      adicionar(m, pc('acervo', { ip: cidr('192.168.50.5/24'), modelo: 'Servidor do acervo da biblioteca' }));
      ligar(m, { equip: 'balcao', porta: 'eth0' }, { equip: 'sw-bib', porta: 'p1' }, 'cat6', 8);
      ligar(m, { equip: 'acervo', porta: 'eth0' }, { equip: 'sw-bib', porta: 'p2' }, 'cat6', 4);
      eq(m, 'balcao').s.ipv6 = ['2001:db8:e5c:2::10/64'];
      eq(m, 'acervo').s.ipv6 = ['2001:db8:e5c:20::5/64'];
      return m;
    },
    objetivo: (m) => {
      const ok = ipv6No64(m, 'acervo', '2001:db8:e5c:2::');
      const alvo = globais(m, 'acervo')[0];
      return [
        item('acervo com IPv6 em 2001:db8:e5c:2::/64', ok === true, ok === true ? alvo : ok),
        item('balcão alcança o acervo por IPv6', ok === true && !!alvo && alcanca6(m, 'balcao', alvo), alvo ?? 'sem endereço global'),
        pingOk(m, 'balcao', '192.168.50.5'),
        ...todasRespondidas(m, d94D),
      ];
    },
    solucao: [
      ['equip', 'acervo', 'mostra'],
      ['equip', 'acervo', 'ip6', { end: '2001:db8:e5c:2::5/64' }],
      ['equip', 'acervo', 'eui64'],
      ['equip', 'balcao', 'ping6', { end: '2001:db8:e5c:2::5' }],
      ['equip', 'balcao', 'ping', { destino: '192.168.50.5', n: '4' }],
    ],
  },
};

export const ATO4B: Dia[] = [dia92, dia93, dia94];
