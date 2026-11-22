// Aula e desafio dos dias do ato 0.

import { vazao } from '../motor/rede';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { enlace, item, numerica, pingOk, todasRespondidas } from './comum';
import type { Extra } from './extras';
import type { Pergunta } from './tipos';

/* ---------- ref 1: o roteador do posto de saúde ---------- */

const SENHA_POSTO = 'tr0que!depois';
const CONFIG_POSTO = [
  'hostname posto-saude',
  'interface wan ip 198.51.100.6/30',
  'interface lan ip 192.0.2.129/25',
  'rota padrao via 198.51.100.5',
  'nat lan para wan',
  'dhcp lan 192.0.2.150 a 192.0.2.199',
  'bloquear entrada wan porta 23',
];

/* ---------- ref 3: o laboratório da escola ---------- */

const perguntas3: Pergunta[] = [
  numerica('1', 'O plano da escola é de 1 Gb/s. Isso dá quantos MB/s (megabytes por segundo), no máximo?', 125, 0.05),
  numerica('2', 'Depois de consertar, meça com "vazao" no laboratório. Qual a vazão útil em MB/s, com duas casas decimais?', (m) => {
    const v = vazao(m, 'lab', 'servidor');
    return typeof v === 'string' ? -1 : v.mbps / 8;
  }, 0.05),
  numerica('3', 'A videoaula tem 3 GiB. A 1 Gb/s nominais, leva quantos segundos para baixar?', (3 * 2 ** 30 * 8) / 1e9, 0.5),
];

/* ---------- ref 4: a captura no posto de saúde ---------- */

const perguntas4: Pergunta[] = [
  numerica('1', 'No ping da recepcao para a farmacia, com que TTL o pedido chega?', 64, 0),
  numerica('2', 'Qual o tipo ICMP do pedido de eco capturado?', 8, 0),
  numerica('3', 'Em que camada do modelo OSI mora o endereço IP?', 3, 0),
  { id: '4', texto: 'Qual equipamento do caminho lê o endereço MAC para decidir a porta de saída?', confere: (r) => /^(o\s+)?(switch|comutador)\b/i.test(r.trim()) },
];

export const EXTRAS0: Record<number, Extra> = {
  /* ---------- Sem senha (1.8.3 a 1.8.5) ---------- */
  1: {
    aula: {
      cartoes: [
        {
          titulo: 'A porta dos fundos oficial',
          texto: [
            'Todo roteador sério tem uma porta de console: uma linha serial que funciona mesmo quando a rede está fora do ar. Isso se chama gerência fora de banda, porque não depende da própria rede para funcionar.',
            'Quem está com o cabo de console na mão durante o boot manda no aparelho. É de propósito: se ninguém lembra a senha, alguém com acesso físico ainda consegue salvar o equipamento.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'voce', rotulo: 'você + notebook', x: 80, y: 60 },
              { id: 'rt', rotulo: 'roteador', x: 300, y: 120 },
              { id: 'cidade', rotulo: 'rede da cidade', x: 520, y: 60 },
              { id: 'net', rotulo: 'internet', x: 520, y: 200 },
            ],
            ligacoes: [
              ['voce', 'rt', 'console (fora de banda)'],
              ['rt', 'cidade', 'lan'],
              ['rt', 'net', 'wan'],
            ],
          },
        },
        {
          titulo: 'Duas configurações, uma memória curta',
          texto: [
            'O roteador guarda a configuração de inicialização, gravada, que é lida em cada boot. E a configuração em execução, na memória, que é a que vale agora.',
            'Mudar a de execução não muda a gravada. Só o comando "salvar" copia uma por cima da outra, e não tem desfazer.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['', 'Inicialização (startup)', 'Execução (running)'],
            linhas: [
              ['onde fica', 'memória gravada', 'memória de trabalho'],
              ['quando vale', 'no próximo boot', 'agora'],
              ['some se faltar luz?', 'não', 'sim'],
              ['como muda', '"salvar"', 'cada comando digitado'],
            ],
          },
        },
        {
          titulo: 'Os quatro passos, nessa ordem',
          texto: [
            '1) Religar e interromper o boot pelo console. 2) No modo de resgate, mandar ignorar a configuração gravada e continuar o boot. 3) Já dentro, sem senha, copiar a configuração gravada para a memória e trocar a senha. 4) Voltar o registro de inicialização para normal e salvar.',
            'Pular o passo 3 grava um roteador vazio por cima do bom. Pular o passo 4 deixa uma bomba-relógio: tudo funciona até o próximo boot.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'r', rotulo: '1. religar e interromper', x: 90, y: 50 },
              { id: 'i', rotulo: '2. ignorar-config e boot', x: 470, y: 50 },
              { id: 'c', rotulo: '3. copiar e trocar senha', x: 470, y: 190 },
              { id: 's', rotulo: '4. inicio normal e salvar', x: 90, y: 190 },
            ],
            ligacoes: [
              ['r', 'i', 'modo de resgate'],
              ['i', 'c', 'entra sem senha'],
              ['c', 's', 'config da cidade na memória'],
            ],
          },
        },
        {
          titulo: 'Segurança começa pela porta do armário',
          texto: [
            'Se o console vence a senha, então proteger o console é proteger a rede. Rack trancado, sala com controle de acesso e registro de quem entrou valem tanto quanto uma senha forte.',
            'E a senha nova não pode ficar "na cabeça" de uma pessoa só. Guarde num cofre de senhas da equipe, com mais de uma pessoa autorizada. Post-it no rack não é cofre.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Ameaça', 'Defesa'],
            linhas: [
              ['alguém com acesso ao console', 'rack trancado e sala controlada'],
              ['senha que só uma pessoa sabe', 'cofre de senhas compartilhado'],
              ['senha fraca ou padrão', 'senha longa, trocada na posse'],
              ['mudança que ninguém viu', 'registro de quem entrou e o que mudou'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'Depois de entrar sem senha, alguém troca a senha e salva na hora, sem copiar a configuração gravada. O que acontece?',
        opcoes: ['Nada de mais: a configuração gravada continua lá', 'Grava uma configuração vazia por cima da boa, e a cidade cai', 'O roteador recusa salvar sem a configuração', 'A senha antiga volta no próximo boot'],
        certa: 1,
        explicacao: 'Com o boot ignorando a configuração, a memória começa vazia. "Salvar" copia a memória por cima da gravada: lá se vão NAT, DHCP e rota padrão.',
      },
    },
    desafio: {
      carta: [
        'O posto de saúde tem um roteador próprio, e a senha foi embora junto com o técnico da empresa que instalou. Antes de sair, ele ainda tentou a recuperação e desistiu no meio: o registro de inicialização ficou em "ignorar-config".',
        'Se faltar luz, o posto liga sem rede e o agendamento de consultas para. Ninguém quer descobrir isso numa segunda de manhã.',
        'Objetivo: senha nova gravada, configuração do posto preservada e registro de inicialização de volta ao normal.',
      ],
      dicas: [
        'É o mesmo caminho do galpão, mas o aparelho já está com uma armadilha armada.',
        'Religue o roteador do posto e interrompa o boot. No resgate, ignore a configuração e continue.',
        'Dentro: copiar a configuração gravada, trocar a senha, registro de inicialização em normal e salvar.',
      ],
      montar: () => {
        const m = novoMundo(1101);
        adicionar(
          m,
          aparelho('roteador-posto', 'roteador', 'Roteador RotaFácil 300 do posto de saúde', [{ nome: 'wan' }, { nome: 'lan' }], {
            estado: 'ligado',
            senha: SENHA_POSTO,
            senhaRunning: SENHA_POSTO,
            inicio: 'ignorar-config',
            startup: [...CONFIG_POSTO],
            running: [...CONFIG_POSTO],
          }),
        );
        return m;
      },
      objetivo: (m) => {
        const s = m.equipamentos.get('roteador-posto')!.s;
        const preservada = CONFIG_POSTO.every((l) => s.startup.includes(l));
        return [
          item('configuração do posto preservada na memória gravada', preservada, preservada ? undefined : 'a configuração gravada perdeu linhas'),
          item('senha nova gravada', !!s.senha && s.senha !== SENHA_POSTO),
          item('registro de inicialização de volta ao normal', s.inicio === 'normal', s.inicio),
        ];
      },
      solucao: [
        ['equip', 'roteador-posto', 'religar'],
        ['equip', 'roteador-posto', 'interromper'],
        ['equip', 'roteador-posto', 'inicio', { modo: 'ignorar-config' }],
        ['equip', 'roteador-posto', 'boot'],
        ['equip', 'roteador-posto', 'copiar'],
        ['equip', 'roteador-posto', 'senha', { senha: 'Posto!Saude2026' }],
        ['equip', 'roteador-posto', 'inicio', { modo: 'normal' }],
        ['equip', 'roteador-posto', 'salvar'],
      ],
    },
  },

  /* ---------- Duas casas, um cabo (1.3.1 a 1.3.3) ---------- */
  2: {
    aula: {
      cartoes: [
        {
          titulo: 'Rede é combinado',
          texto: [
            'Uma rede é um grupo de aparelhos que trocam mensagens seguindo regras combinadas. Essas regras são o protocolo: formato da mensagem, ordem da conversa e o que fazer quando dá errado.',
            'O tamanho muda o nome. O fone sem fio ligado ao celular é uma rede pessoal (PAN). Os computadores de uma casa ou da escola formam uma rede local (LAN). A rede doméstica é a LAN da sua casa, quase sempre com um roteador que fala com o provedor.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Tipo', 'Alcance', 'Exemplo em Fim de Linha'],
            linhas: [
              ['PAN (pessoal)', 'alguns metros', 'o fone sem fio da enfermeira'],
              ['LAN (local)', 'um prédio', 'o laboratório da escola'],
              ['doméstica', 'uma casa', 'PC, TV e celulares da casa 1'],
              ['MAN e WAN', 'cidade, país, mundo', 'a fibra até a cidade vizinha'],
            ],
          },
        },
        {
          titulo: 'O endereço IPv4',
          texto: [
            'No IPv4, cada aparelho tem um endereço de 32 bits, escrito em quatro números de 0 a 255 separados por ponto, como 192.0.2.10.',
            'O prefixo, escrito depois da barra, diz quantos bits do começo identificam a rede. Em 192.0.2.10/24, os primeiros 24 bits (192.0.2) são a rede e os últimos 8 (o 10) são o aparelho.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Endereço/prefixo', 'Parte da rede', 'Parte do aparelho', 'Rede'],
            linhas: [
              ['192.0.2.10/24', '192.0.2', '10', '192.0.2.0/24'],
              ['192.0.2.20/24', '192.0.2', '20', '192.0.2.0/24'],
              ['198.51.100.7/24', '198.51.100', '7', '198.51.100.0/24'],
            ],
          },
        },
        {
          titulo: 'Vizinho é quem tem a mesma rede',
          texto: [
            'Dois aparelhos com a mesma parte de rede falam direto, sem roteador. Com partes diferentes, um precisa de um roteador (o gateway) para chegar no outro.',
            'Cada lado faz a conta com o próprio prefixo. Se um acha que o outro é vizinho e o outro não acha, o pedido vai e a resposta não volta. Prefixo também é endereço: errar o /24 é tão grave quanto errar o número.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['A', 'B', 'Falam direto?'],
            linhas: [
              ['192.0.2.10/24', '192.0.2.20/24', 'sim, os dois em 192.0.2.0/24'],
              ['192.0.2.10/24', '198.51.100.7/24', 'não, redes diferentes'],
              ['192.0.2.10/24', '192.0.2.200/25', 'só de A para B: B acha que A é de outra rede'],
            ],
          },
        },
        {
          titulo: 'Ping: ida e volta',
          texto: [
            'O ping manda um pedido de eco (ICMP tipo 8) e espera a resposta (tipo 0). Ele só dá certo se o pedido chega e se a resposta acha o caminho de volta.',
            'Quando falha, leia a mensagem inteira e pergunte: falhou na ida ou na volta? E faça o ping dos dois lados, porque um lado feliz não garante o outro.',
          ],
          visual: {
            tipo: 'diagrama',
            nos: [
              { id: 'a', rotulo: 'casa1 192.0.2.10/24', x: 110, y: 120 },
              { id: 'b', rotulo: 'casa2 192.0.2.20/24', x: 490, y: 120 },
            ],
            ligacoes: [['a', 'b', 'pedido tipo 8, resposta tipo 0']],
          },
        },
      ],
      checagem: {
        pergunta: 'Qual destes endereços está na mesma rede que 192.0.2.10/24?',
        opcoes: ['192.0.3.10/24', '198.51.100.10/24', '192.0.2.250/24', '10.0.2.10/24'],
        certa: 2,
        explicacao: 'Com /24, a rede são os três primeiros números. Só 192.0.2.250 começa com 192.0.2; nos outros muda algum dos três.',
      },
    },
    desafio: {
      carta: [
        'Na cooperativa, o computador do caixa e o do estoque estão ligados no mesmo switch, um ao lado do outro. Mesmo assim, o estoque não consegue mandar a lista do dia para o caixa.',
        'O técnico que configurou jura que "copiou o endereço certinho". Copiou mesmo: o número está certo. O resto, nem tanto.',
        'Objetivo: ping do caixa para o estoque e do estoque para o caixa, sem perda.',
      ],
      dicas: [
        'Os dois endereços começam igual. Olhe o que vem depois da barra.',
        'Faça o ping dos dois lados e compare as mensagens: um lado acha que o outro é vizinho, o outro não acha.',
        'Configure o estoque com 198.51.100.130/24, o mesmo prefixo do caixa, e pingue de novo dos dois lados.',
      ],
      montar: () => {
        const m = novoMundo(1102);
        adicionar(m, pc('caixa', { modelo: 'PC do caixa com JanelOS', ttl: 128, mdix: true, ip: lerCidr('198.51.100.10/24')! }));
        adicionar(m, pc('estoque', { modelo: 'PC do estoque com Pinguix', ttl: 64, mdix: true, ip: lerCidr('198.51.100.130/25')! }));
        adicionar(m, comutador('sw-coop', { modelo: 'Switch da cooperativa SC-8' }));
        ligar(m, { equip: 'caixa', porta: 'eth0' }, { equip: 'sw-coop', porta: 'p1' }, 'cat5e', 6);
        ligar(m, { equip: 'estoque', porta: 'eth0' }, { equip: 'sw-coop', porta: 'p2' }, 'cat5e', 9);
        return m;
      },
      objetivo: (m) => [pingOk(m, 'caixa', '198.51.100.130'), pingOk(m, 'estoque', '198.51.100.10')],
      solucao: [
        ['equip', 'estoque', 'ip', { ip: '198.51.100.130/24' }],
        ['equip', 'caixa', 'ping', { destino: '198.51.100.130', n: '4' }],
        ['equip', 'estoque', 'ping', { destino: '198.51.100.10', n: '4' }],
      ],
    },
  },

  /* ---------- Bit não é byte (1.9) ---------- */
  3: {
    aula: {
      cartoes: [
        {
          titulo: 'Oito bits, um byte',
          texto: [
            'Rede mede em bits por segundo (b/s). Navegador e gerenciador de arquivos mostram bytes (B). Um byte tem 8 bits, então a conta é sempre dividir por 8.',
            'Repare na letra: "b" minúsculo é bit, "B" maiúsculo é byte. Um plano de 100 Mb/s entrega, no máximo, 12,5 MB/s. Não é golpe, é aritmética.',
          ],
          visual: { tipo: 'calculadora', formula: 'unidades' },
        },
        {
          titulo: 'Prefixos que mentem',
          texto: [
            'Os prefixos do SI são potências de 10: k é mil, M é um milhão, G é um bilhão. Em rede, 1 Mb/s é exatamente 1.000.000 b/s.',
            'Os prefixos binários são potências de 2: KiB tem 1024 bytes, MiB tem 2²⁰ e GiB tem 2³⁰. Muito programa escreve "GB" e quer dizer GiB, o que dá uns 7 % de diferença.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Prefixo', 'Vale', 'Prefixo binário', 'Vale'],
            linhas: [
              ['k (quilo)', '10³ = 1.000', 'Ki (kibi)', '2¹⁰ = 1.024'],
              ['M (mega)', '10⁶ = 1.000.000', 'Mi (mebi)', '2²⁰ = 1.048.576'],
              ['G (giga)', '10⁹ = 1.000.000.000', 'Gi (gibi)', '2³⁰ = 1.073.741.824'],
            ],
          },
        },
        {
          titulo: 'O pedágio dos cabeçalhos',
          texto: [
            'Nem todo bit no fio é dado seu. Para levar 1460 bytes de dado, um quadro Ethernet com TCP ocupa 1538 bytes no fio, contando cabeçalhos, conferência de erro, preâmbulo e o intervalo entre quadros.',
            'Por isso a vazão útil fica em uns 94,9 % do nominal. E o enlace mais lento do caminho manda em todo o resto: placa de 100 Mb/s num switch gigabit continua sendo 100 Mb/s.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Pedaço', 'Bytes'],
            linhas: [
              ['preâmbulo e início de quadro', '8'],
              ['cabeçalho Ethernet', '14'],
              ['cabeçalho IP', '20'],
              ['cabeçalho TCP', '20'],
              ['dado útil', '1460'],
              ['conferência de erro (FCS)', '4'],
              ['intervalo entre quadros', '12'],
              ['total no fio', '1538'],
            ],
          },
        },
        {
          titulo: 'Quanto tempo leva',
          texto: [
            'Tempo de transferência = tamanho em bits ÷ taxa em bits por segundo. Antes de dividir, ponha os dois na mesma unidade.',
            'Exemplo: 4 GiB a 100 Mb/s. São 4 × 2³⁰ × 8 bits, divididos por 100.000.000 b/s: uns 343 segundos, e isso com 100 % de eficiência, coisa que nenhum protocolo entrega.',
          ],
          visual: { tipo: 'calculadora', formula: 'transmissao' },
        },
      ],
      checagem: {
        pergunta: 'Um plano de 200 Mb/s, sem descontar cabeçalho nenhum, entrega no máximo quantos MB/s?',
        opcoes: ['200 MB/s', '25 MB/s', '1600 MB/s', '23,8 MB/s'],
        certa: 1,
        explicacao: '200 milhões de bits por segundo divididos por 8 dão 25 milhões de bytes por segundo. Com os cabeçalhos, a vazão útil cai para perto de 23,7 MB/s.',
      },
    },
    desafio: {
      carta: [
        'A escola contratou 1 Gb/s para o laboratório, e a professora mede pouco mais de 1 MB/s. A videoaula de 3 GiB não termina antes do recreio, nem do próximo.',
        'Alguém plugou o computador do laboratório no hub velho do canto, de 10 Mb/s, em vez do switch novo.',
        'Objetivo: laboratório ligado a 1 Gb/s e as três perguntas respondidas no painel.',
      ],
      dicas: [
        'O enlace mais lento manda no caminho todo. Veja o estado das portas.',
        'Mude a ponta do cabo c1 do hub para uma porta livre do switch e meça de novo a vazão.',
        'Pergunta 1: 1000 ÷ 8. Pergunta 3: 3 × 2³⁰ × 8 bits divididos por 1.000.000.000 b/s.',
      ],
      perguntas: perguntas3,
      montar: () => {
        const m = novoMundo(1103);
        adicionar(m, pc('lab', { modelo: 'PC do laboratório da escola', ip: lerCidr('192.0.2.70/24')!, mdix: true }));
        adicionar(m, comutador('hub-velho', { tipo: 'hub', modelo: 'Hub de 10 Mb/s esquecido no canto', velocidades: [10], portas: 4 }));
        adicionar(m, comutador('sw-escola', { modelo: 'Switch gigabit da escola SG-8' }));
        adicionar(m, pc('servidor', { modelo: 'Servidor de teste de velocidade', ip: lerCidr('192.0.2.2/24')!, mdix: true }));
        ligar(m, { equip: 'lab', porta: 'eth0' }, { equip: 'hub-velho', porta: 'p1' }, 'cat6', 8, { id: 'c1' });
        ligar(m, { equip: 'hub-velho', porta: 'p4' }, { equip: 'sw-escola', porta: 'p1' }, 'cat6', 2, { id: 'c2' });
        ligar(m, { equip: 'sw-escola', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 5, { id: 'c3' });
        m.proxCabo = 4;
        m.flags.servidorTeste = 'servidor';
        return m;
      },
      objetivo: (m) => {
        const e = enlace(m, 'c1');
        const sw = m.cabos.get('c1')!;
        const noSwitch = sw.a.equip === 'sw-escola' || sw.b.equip === 'sw-escola';
        return [item('laboratório ligado a 1 Gb/s no switch', noSwitch && e.up && e.velocidade === 1000, e.up ? `${e.velocidade} Mb/s` : e.motivos[0]), ...todasRespondidas(m, perguntas3)];
      },
      solucao: [
        ['cabo', 'c1', 'mover', { ponta: 'b', destino: 'sw-escola:p2' }],
        ['equip', 'lab', 'vazao'],
      ],
      respostas: { '1': '125', '2': '118.66', '3': '25.77' },
    },
  },

  /* ---------- Quem fala com quem (1.6.1 e 1.6.2) ---------- */
  4: {
    aula: {
      cartoes: [
        {
          titulo: 'Por que camadas',
          texto: [
            'Mandar uma mensagem pela rede tem problemas demais para resolver de uma vez: o sinal no cabo, quem é o vizinho, qual o caminho, se tudo chegou, o que o programa quer dizer.',
            'A saída é dividir em camadas. Cada uma resolve um problema, usa o serviço da camada de baixo e não precisa saber como ela funciona por dentro. Dá para trocar o cobre por fibra sem reescrever o navegador.',
          ],
          visual: { tipo: 'camadas', camadas: ['aplicação', 'transporte', 'rede', 'enlace', 'física'], rotulo: 'TCP/IP em cinco camadas, de cima para baixo' },
        },
        {
          titulo: 'OSI e TCP/IP',
          texto: [
            'O modelo OSI tem sete camadas: física, enlace, rede, transporte, sessão, apresentação e aplicação. É ótimo para conversar e para estudar.',
            'A internet de verdade segue o TCP/IP, em que sessão e apresentação ficam dentro da aplicação. Quando alguém fala "problema de camada 2", está usando a numeração do OSI.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['OSI', 'TCP/IP', 'Exemplo', 'Endereço'],
            linhas: [
              ['7 aplicação, 6 apresentação, 5 sessão', 'aplicação', 'HTTP, DNS', 'nome, como escola.exemplo'],
              ['4 transporte', 'transporte', 'TCP, UDP', 'porta'],
              ['3 rede', 'rede', 'IP, ICMP', 'endereço IP'],
              ['2 enlace', 'enlace', 'Ethernet', 'endereço MAC'],
              ['1 física', 'física', 'cabo, fibra, rádio', 'nenhum'],
            ],
          },
        },
        {
          titulo: 'Envelope dentro de envelope',
          texto: [
            'Encapsular é pôr cada mensagem dentro da camada de baixo, com um cabeçalho novo. O pedido de eco do ping (ICMP) vai dentro de um pacote IP, que vai dentro de um quadro Ethernet, que vira sinal elétrico no cabo.',
            'Cada cabeçalho diz quem vem dentro. No quadro Ethernet é o EtherType (0x0800 é IPv4). No pacote IP é o campo protocolo (1 é ICMP, 6 é TCP, 17 é UDP). O TTL do IP diz quantos roteadores o pacote ainda pode atravessar.',
          ],
          visual: { tipo: 'camadas', camadas: ['ICMP: pedido de eco, tipo 8', 'IPv4: origem, destino, TTL, protocolo 1', 'Ethernet: MACs e EtherType 0x0800', 'sinal no cabo'], rotulo: 'um ping, de dentro para fora' },
        },
        {
          titulo: 'Quem lê o quê',
          texto: [
            'Hub é camada 1: repete cada bit para todas as portas, sem ler nada. Switch é camada 2: lê o MAC de destino e manda só para a porta certa. Roteador é camada 3: lê o IP, escolhe a rota e diminui o TTL em 1.',
            'Sem roteador no caminho, o TTL chega exatamente como saiu. E cada sistema tem o seu TTL de saída: o JanelOS sai com 128, o Pinguix com 64.',
          ],
          visual: {
            tipo: 'tabela',
            cabecalho: ['Equipamento', 'Camada', 'Lê', 'Mexe no TTL?'],
            linhas: [
              ['hub', '1', 'nada, só repete bits', 'não'],
              ['switch', '2', 'MAC de destino', 'não'],
              ['roteador', '3', 'IP de destino', 'sim, tira 1'],
            ],
          },
        },
      ],
      checagem: {
        pergunta: 'Num quadro capturado, o EtherType é 0x0800 e o campo protocolo do IP é 1. O que vem dentro do pacote IP?',
        opcoes: ['TCP', 'ICMP', 'UDP', 'ARP'],
        certa: 1,
        explicacao: 'O EtherType 0x0800 diz que dentro do quadro vem IPv4. O protocolo 1 diz que dentro do IPv4 vem ICMP. TCP seria 6 e UDP seria 17; ARP nem viria dentro de IP.',
      },
    },
    desafio: {
      carta: [
        'O posto de saúde trocou o hub por um switch, e a farmácia ganhou um computador novo, ainda sem endereço. A coordenação quer um laudo de que a recepção conversa com a farmácia, com a captura anexada.',
        'A recepção roda Pinguix, a farmácia roda JanelOS e, no meio, só o switch.',
        'Objetivo: farmácia com IP na rede da recepção, ping da recepção para a farmácia e as quatro perguntas respondidas com base na captura.',
      ],
      dicas: [
        'Primeiro a farmácia precisa de endereço. Depois gere tráfego, depois capture.',
        'Dê à farmácia um endereço em 203.0.113.0/24, pingue a partir da recepção e veja o último quadro capturado.',
        'O TTL do pedido é o de quem manda, e switch não mexe nele. O switch é camada 2 e lê o MAC.',
      ],
      perguntas: perguntas4,
      montar: () => {
        const m = novoMundo(1104);
        adicionar(m, pc('recepcao', { modelo: 'PC da recepção com Pinguix', ttl: 64, mdix: true, ip: lerCidr('203.0.113.21/24')! }));
        adicionar(m, pc('farmacia', { modelo: 'PC da farmácia com JanelOS', ttl: 128, mdix: true }));
        adicionar(m, comutador('sw-posto', { modelo: 'Switch do posto SP-8' }));
        ligar(m, { equip: 'recepcao', porta: 'eth0' }, { equip: 'sw-posto', porta: 'p1' }, 'cat6', 12);
        ligar(m, { equip: 'sw-posto', porta: 'p5' }, { equip: 'farmacia', porta: 'eth0' }, 'cat6', 18);
        return m;
      },
      objetivo: (m) => {
        const f = m.equipamentos.get('farmacia')!.ip;
        const txt = f ? [24, 16, 8, 0].map((d) => (f.endereco >>> d) & 255).join('.') : '-';
        return [item('farmácia com endereço IP', !!f), pingOk(m, 'recepcao', txt), ...todasRespondidas(m, perguntas4)];
      },
      solucao: [
        ['equip', 'farmacia', 'ip', { ip: '203.0.113.42/24' }],
        ['equip', 'recepcao', 'ping', { destino: '203.0.113.42', n: '4' }],
        ['equip', 'recepcao', 'capturar'],
      ],
      respostas: { '1': '64', '2': '8', '3': '3', '4': 'switch' },
    },
  },
};
