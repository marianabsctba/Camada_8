// Ato 0: Sem Senha. Introdução às redes, ao console e às camadas.

import { vazao } from '../motor/rede';
import { adicionar, aparelho, comutador, ligar, novoMundo, pc } from '../motor/mundo';
import { lerCidr } from '../motor/util';
import { item, numerica, pingOk, todasRespondidas } from './comum';
import type { Dia, Pergunta } from './tipos';

const SENHA_ANTIGA = 'Xq7!pindorama';
const CONFIG_CLIENTE = [
  'hostname borda-01',
  'interface wan ip 203.0.113.2/30',
  'interface lan ip 192.0.2.1/24',
  'rota padrao via 203.0.113.1',
  'nat lan para wan',
  'dhcp lan 192.0.2.100 a 192.0.2.200',
];

const dia1: Dia = {
  numero: 1,
  ato: 0,
  titulo: 'Sem senha',
  chamado: [
    'CHAMADO #0001  prioridade: existencial',
    'Você herdou o provedor Fibra Fim de Linha. A pessoa anterior foi embora e levou a senha do roteador de borda.',
    'Deixou só um post-it no rack: "a senha tá na cabeça". Não tinha cabeça nenhuma no rack.',
    'Objetivo: entrar no roteador, trocar a senha e NÃO perder a configuração que mantém a cidade no ar.',
    'Mire no roteador e aperte E (ou clique nele em "No local", no painel) para ver o que dá para fazer. O manual explica o caminho.',
  ],
  manual: {
    titulo: 'Console, memória e o boot',
    texto: [
      'Todo equipamento de rede tem uma porta de console: uma linha serial que funciona mesmo sem rede. É por ela que se entra quando todo o resto falhou. Isso se chama gerência fora de banda.',
      'Um roteador guarda duas configurações. A de inicialização fica gravada e é lida no boot. A em execução fica na memória e é a que vale agora. Mudar uma não muda a outra até você mandar "salvar".',
      'A recuperação de senha clássica tem quatro passos: 1) religar e interromper o boot pelo console; 2) mandar o aparelho ignorar a configuração gravada no próximo boot; 3) já dentro, sem senha, copiar a configuração gravada para a memória e trocar a senha; 4) voltar o registro de inicialização ao normal e salvar.',
      'Quem esquece o passo 3 salva uma configuração vazia por cima da boa. Quem esquece o passo 4 vê o roteador ignorar a configuração de novo no próximo boot, às três da manhã.',
    ],
  },
  dicas: [
    'Sem senha você não entra pelo caminho normal. Mas o boot tem uma janela.',
    'No campo: "religar roteador". Depois "console roteador" e "interromper" antes de qualquer outro comando.',
    'No resgate: "inicio ignorar-config" e "boot". Dentro: "copiar startup running", "senha <nova>", "inicio normal", "salvar".',
  ],
  montar: () => {
    const m = novoMundo(101);
    adicionar(
      m,
      aparelho('roteador', 'roteador', 'Roteador de borda RB-900', [{ nome: 'wan' }, { nome: 'lan' }], {
        estado: 'ligado',
        senha: SENHA_ANTIGA,
        senhaRunning: SENHA_ANTIGA,
        inicio: 'normal',
        startup: [...CONFIG_CLIENTE],
        running: [...CONFIG_CLIENTE],
      }),
    );
    return m;
  },
  objetivo: (m) => {
    const s = m.equipamentos.get('roteador')!.s;
    const preservada = CONFIG_CLIENTE.every((l) => s.startup.includes(l));
    return [
      item('configuração da cidade preservada na memória gravada', preservada, preservada ? undefined : 'a configuração gravada perdeu linhas'),
      item('senha nova gravada', !!s.senha && s.senha !== SENHA_ANTIGA),
      item('registro de inicialização de volta ao normal', s.inicio === 'normal'),
    ];
  },
  posMorte: [
    'Você usou o caminho que todo fabricante deixa: acesso físico ao console vence senha. Por isso rack fica trancado e console não fica pendurado para fora.',
    'A ordem importou. Se tivesse salvado antes de copiar a configuração gravada, teria gravado um roteador vazio por cima do bom. A cidade ia ficar sem NAT, sem DHCP e sem rota padrão, ou seja, sem internet, com o seu nome no boletim.',
    'O registro de inicialização é a pegadinha preferida: esquecido em "ignorar-config", o roteador funciona perfeitamente até o próximo boot.',
  ],
};

const dia2: Dia = {
  numero: 2,
  ato: 0,
  titulo: 'Duas casas, um cabo',
  chamado: [
    'CHAMADO #0002',
    'Primeiros clientes: duas casas na mesma rua, ligadas por um cabo que já está passado.',
    'O computador "casa1" está sem endereço. O "casa2" foi configurado por alguém que copiou um IP de um fórum.',
    'Objetivo: os dois se enxergando, com ping de ida e de volta funcionando.',
  ],
  manual: {
    titulo: 'Rede, endereço e protocolo',
    texto: [
      'Uma rede é um conjunto de nós que trocam mensagens seguindo regras combinadas. Essas regras se chamam protocolo: formato da mensagem, ordem da conversa e o que fazer quando dá errado.',
      'No IPv4 o endereço tem 32 bits, escritos em quatro números de 0 a 255. O prefixo (/24) diz quantos bits iniciais são da rede. Dois hosts com o mesmo prefixo e os mesmos bits de rede estão na mesma rede e falam direto, sem roteador.',
      'Exemplo: 192.0.2.10/24 e 192.0.2.20/24 estão na mesma rede (192.0.2.0/24). Já 198.51.100.7/24 está em outra: sem um roteador no meio, ninguém chega lá.',
      'O ping manda um pedido de eco (ICMP tipo 8) e espera a resposta (tipo 0). Se falhar, a pergunta certa é: falhou na ida ou na volta? Os dois lados precisam saber chegar um no outro.',
      'As faixas 192.0.2.0/24, 198.51.100.0/24 e 203.0.113.0/24 são reservadas para documentação. Usamos aqui para não apontar para a casa de ninguém de verdade.',
    ],
  },
  dicas: [
    'Olhe o "mapa". Um dos dois está numa rede diferente.',
    'No console de cada PC, "ip <endereço>/<prefixo>". Os dois precisam estar na mesma rede.',
    'Por exemplo: casa1 com 192.0.2.10/24 e casa2 com 192.0.2.20/24. Depois ping dos dois lados.',
  ],
  montar: () => {
    const m = novoMundo(102);
    adicionar(m, pc('casa1', { modelo: 'PC com JanelOS', ttl: 128, mdix: true }));
    adicionar(m, pc('casa2', { modelo: 'PC com Pinguix', ttl: 64, mdix: true, ip: lerCidr('198.51.100.7/24')! }));
    ligar(m, { equip: 'casa1', porta: 'eth0' }, { equip: 'casa2', porta: 'eth0' }, 'cat5e', 40, { nota: 'passa por cima do muro, preso num galho' });
    return m;
  },
  objetivo: (m) => {
    const a = m.equipamentos.get('casa1')!.ip;
    const b = m.equipamentos.get('casa2')!.ip;
    const txt = (c?: { endereco: number }) => (c ? [24, 16, 8, 0].map((d) => (c.endereco >>> d) & 255).join('.') : '-');
    return [item('casa1 com endereço IP', !!a), pingOk(m, 'casa1', txt(b)), pingOk(m, 'casa2', txt(a))];
  },
  posMorte: [
    'O cabo estava bom o tempo todo. O problema era de camada 3: endereços em redes diferentes, sem roteador entre elas.',
    'O ping falhou com uma mensagem honesta: o destino está fora da minha rede e eu não tenho gateway. Ler a mensagem de erro inteira resolve metade dos chamados do mundo.',
    'Repare no TTL das respostas: o JanelOS sai com 128 e o Pinguix com 64. É um jeito clássico, e nada confiável, de chutar o sistema operacional do outro lado.',
  ],
};

const perguntas3: Pergunta[] = [
  numerica('1', 'Um plano de 100 Mb/s equivale a quantos MB/s (megabytes por segundo)?', 12.5, 0.05),
  numerica('2', 'Meça com "vazao" no console da casa. Qual a vazão útil em MB/s, com duas casas decimais?', (m) => {
    const v = vazao(m, 'casa', 'servidor');
    return typeof v === 'string' ? -1 : v.mbps / 8;
  }, 0.05),
  numerica('3', 'Um arquivo de 4 GiB, a 100 Mb/s nominais, leva quantos segundos para baixar?', (4 * 2 ** 30 * 8) / 100e6, 1),
];

const dia3: Dia = {
  numero: 3,
  ato: 0,
  titulo: 'Bit não é byte',
  chamado: [
    'CHAMADO #0003  cliente furioso (em caixa alta, no texto do chamado)',
    '"CONTRATEI 100 MEGA E O DOWNLOAD MOSTRA 11 MEGA. QUERO MEU DINHEIRO DE VOLTA. E OS OUTROS 89 MEGA."',
    'Objetivo: medir a vazão de verdade e responder as três perguntas do chamado, no painel.',
  ],
  manual: {
    titulo: 'Unidades: bit, byte e os prefixos que mentem',
    texto: [
      'Rede mede em bits por segundo (b/s). Navegador e sistema de arquivos mostram bytes (B). Um byte tem 8 bits. Então 100 Mb/s são, no máximo, 12,5 MB/s.',
      'Prefixos do SI são potências de 10: k = 10³, M = 10⁶, G = 10⁹. Em rede, 1 Mb/s é exatamente 1.000.000 b/s.',
      'Prefixos binários são potências de 2: KiB = 2¹⁰ = 1024 bytes, MiB = 2²⁰, GiB = 2³⁰. Muito programa escreve "MB" e quer dizer MiB. Daí sai mais uns 5 % de confusão.',
      'E nem todo bit no fio é dado seu: um quadro Ethernet com 1460 bytes de dado TCP ocupa 1538 bytes no fio (cabeçalhos, FCS, preâmbulo e intervalo entre quadros). A vazão útil máxima fica em uns 94,9 % do nominal.',
      'Tempo de transferência = tamanho em bits ÷ taxa em bits por segundo.',
    ],
  },
  dicas: [
    'Divida por 8. Depois desconte o que o protocolo gasta.',
    '"console casa" e depois "vazao". O resultado já sai em Mb/s, MB/s e MiB/s.',
    'Pergunta 3: 4 GiB = 4 × 2³⁰ bytes. Vezes 8, dividido por 100.000.000.',
  ],
  perguntas: perguntas3,
  montar: () => {
    const m = novoMundo(103);
    adicionar(m, pc('casa', { modelo: 'PC do cliente furioso', ip: lerCidr('192.0.2.50/24')!, velocidades: [10, 100], mdix: true }));
    adicionar(m, comutador('sw-poste', { modelo: 'Switch de poste SP-8' }));
    adicionar(m, pc('servidor', { modelo: 'Servidor de teste de velocidade', ip: lerCidr('192.0.2.2/24')!, mdix: true }));
    ligar(m, { equip: 'casa', porta: 'eth0' }, { equip: 'sw-poste', porta: 'p1' }, 'cat5e', 30);
    ligar(m, { equip: 'sw-poste', porta: 'p8' }, { equip: 'servidor', porta: 'eth0' }, 'cat6', 5);
    m.flags.servidorTeste = 'servidor';
    return m;
  },
  objetivo: (m) => todasRespondidas(m, perguntas3),
  posMorte: [
    'O cliente recebe exatamente o que contratou. 100 Mb/s viram 12,5 MB/s pela matemática e uns 11,9 MB/s pela física dos cabeçalhos.',
    'O enlace mais lento manda no caminho todo: a placa da casa só vai a 100 Mb/s, então não adianta o switch ser gigabit.',
    'A pergunta 3 mostra o golpe duplo: o arquivo é medido em GiB (base 2) e o plano em Mb/s (base 10). Os 343 segundos assumem 100 % de eficiência, o que nenhum protocolo entrega.',
  ],
};

const perguntas4: Pergunta[] = [
  { id: '1', texto: 'Qual o EtherType do quadro capturado (em hexadecimal)?', confere: (r) => ['0x0800', '0800', '800', '0x800', '2048'].includes(r.trim().toLowerCase()) },
  numerica('2', 'Qual o número do protocolo no cabeçalho IP?', 1, 0),
  numerica('3', 'Num ping de pc1 para pc2, com que TTL o pedido chega?', 128, 0),
  numerica('4', 'Em que camada do modelo OSI mora o endereço MAC?', 2, 0),
  { id: '5', texto: 'Qual equipamento do caminho só repete bits, sem ler endereço nenhum?', confere: (r) => /^hub\b/i.test(r.trim()) },
];

const dia4: Dia = {
  numero: 4,
  ato: 0,
  titulo: 'Quem fala com quem',
  chamado: [
    'CHAMADO #0004  auditoria interna (você auditando você, já que não sobrou mais ninguém)',
    'Antes de mexer em mais nada, entenda o que passa no fio. Capture um ping entre pc1 e pc2 e disseque o quadro camada por camada.',
    'Objetivo: responder as cinco perguntas do chamado, no painel, com base na captura.',
  ],
  manual: {
    titulo: 'Camadas e encapsulamento',
    texto: [
      'Cada camada resolve um problema e esconde os detalhes da de baixo. No modelo OSI são sete: física, enlace, rede, transporte, sessão, apresentação e aplicação. Na prática da internet (TCP/IP) as do meio se juntam e ficam cinco.',
      'Encapsular é envelope dentro de envelope. O ICMP (pedido de eco) vai dentro de um pacote IP, que vai dentro de um quadro Ethernet, que vira sinal elétrico no cabo.',
      'O quadro Ethernet tem MAC de destino, MAC de origem e o EtherType, que diz o que vem dentro (0x0800 é IPv4, 0x86DD é IPv6, 0x0806 é ARP).',
      'O pacote IP tem origem, destino, TTL (quantos roteadores ainda pode atravessar) e o campo protocolo, que diz quem vem dentro: 1 é ICMP, 6 é TCP, 17 é UDP.',
      'Hub é camada 1: repete bits para todas as portas sem ler nada. Switch é camada 2: lê o MAC. Roteador é camada 3: lê o IP e diminui o TTL.',
    ],
  },
  dicas: [
    'Primeiro gere tráfego, depois capture.',
    '"console pc1", "ping 192.0.2.20", depois "capturar".',
    'Sem roteador no caminho, ninguém mexe no TTL. Ele chega como saiu.',
  ],
  perguntas: perguntas4,
  montar: () => {
    const m = novoMundo(104);
    adicionar(m, pc('pc1', { modelo: 'PC com JanelOS', ttl: 128, ip: lerCidr('192.0.2.10/24')! }));
    adicionar(m, pc('pc2', { modelo: 'PC com Pinguix', ttl: 64, ip: lerCidr('192.0.2.20/24')! }));
    adicionar(m, comutador('hub', { tipo: 'hub', modelo: 'Hub de 10 Mb/s, relíquia de 1998', velocidades: [10], portas: 4 }));
    ligar(m, { equip: 'pc1', porta: 'eth0' }, { equip: 'hub', porta: 'p1' }, 'cat5e', 3);
    ligar(m, { equip: 'hub', porta: 'p2' }, { equip: 'pc2', porta: 'eth0' }, 'cat5e', 3);
    return m;
  },
  objetivo: (m) => todasRespondidas(m, perguntas4),
  posMorte: [
    'Você viu as três camadas que importam aqui: Ethernet (camada 2, com MACs), IPv4 (camada 3, com TTL e protocolo) e ICMP por cima.',
    'O hub de 10 Mb/s repetiu cada bit para todas as portas. Por isso, num hub, todo mundo escuta tudo, e captura de tráfego era fácil demais nos anos 90.',
    'O TTL de 128 chegou intacto porque nenhum roteador estava no caminho. No ato 4 isso muda, e o TTL vira a sua ferramenta de rastrear rotas.',
  ],
};

export const ATO0: Dia[] = [dia1, dia2, dia3, dia4];
