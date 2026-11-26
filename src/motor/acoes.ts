// Ações com as mãos: o que dá para fazer com cada coisa da sala, sem digitar.
// Cada ação vira os mesmos comandos do terminal, que aparecem lá para quem quiser aprender a sintaxe.

import { BITS_POR_SIMBOLO } from './aparelhos';
import type { Terminal } from './cli';
import { perdaElemento } from './fisico';
import { PROTOCOLOS_MAC } from './mac';
import { caboNaPorta, TRANSCEPTORES, type Cabo, type Equipamento, type Mundo } from './mundo';
import { ipTexto } from './util';
import { enlaceLocal } from './ip';
import { interfacesL3, temCamadaRede } from './roteamento';
import { temQos } from './cliQos';
import { acoesTransporte, temTransporte } from './cliTransporte';

export interface Opcao {
  valor: string;
  rotulo: string;
}

export interface Campo {
  nome: string;
  rotulo: string;
  tipo: 'numero' | 'texto' | 'escolha' | 'cores';
  opcoes?: Opcao[];
  unidade?: string;
  padrao?: string;
}

export interface Acao {
  id: string;
  rotulo: string;
  /** Para que serve, em uma ou duas frases. Aparece no topo do formulário. */
  ajuda: string;
  campos?: Campo[];
  /** Se a ação acontece dentro do console de um aparelho. */
  contexto?: string;
  /** Abre o console e deixa o terminal à mostra. */
  abreConsole?: boolean;
  /** Ação que normalmente vem depois desta; o menu pula para ela. */
  proxima?: string;
  comandos: (v: Record<string, string>) => string[];
}

export type TipoAlvo = 'equip' | 'cabo' | 'almox';

const COBRE = ['cat5e', 'cat6', 'cat6a'];

function portasLivres(m: Mundo, excetoEquip?: string, fisica?: string): Opcao[] {
  const out: Opcao[] = [];
  for (const e of m.equipamentos.values()) {
    if (e.nome === excetoEquip) continue;
    for (const p of e.portas) {
      if (fisica && p.fisica !== fisica) continue;
      if (p.fisica !== 'rj45' && p.fisica !== 'sfp') continue;
      if (caboNaPorta(m, { equip: e.nome, porta: p.nome })) continue;
      out.push({ valor: `${e.nome}:${p.nome}`, rotulo: `${e.nome} · ${p.nome}${p.fisica === 'sfp' ? ' (SFP)' : ''}` });
    }
  }
  return out;
}

const num = (nome: string, rotulo: string, unidade?: string, padrao?: string): Campo => ({ nome, rotulo, tipo: 'numero', unidade, padrao });
const escolha = (nome: string, rotulo: string, opcoes: Opcao[], padrao?: string): Campo => ({ nome, rotulo, tipo: 'escolha', opcoes, padrao: padrao ?? opcoes[0]?.valor });
const op = (valor: string, rotulo = valor): Opcao => ({ valor, rotulo });

/* ---------- Camada de rede ---------- */

/** Todos os endereços IP do mundo (interfaces de roteador incluídas), menos os do próprio aparelho. */
function ipsConhecidos(m: Mundo, exceto: string): Opcao[] {
  const out: Opcao[] = [];
  for (const x of m.equipamentos.values()) {
    if (x.nome === exceto) continue;
    for (const i of interfacesL3(x)) out.push(op(ipTexto(i.cidr.endereco), `${ipTexto(i.cidr.endereco)} (${x.nome}${x.tipo === 'roteador' ? ` · ${i.porta}` : ''})`));
  }
  return out;
}

function campoDestino(m: Mundo, e: Equipamento): Campo {
  const ips = ipsConhecidos(m, e.nome);
  return ips.length ? escolha('destino', 'Destino', ips) : { nome: 'destino', rotulo: 'Destino', tipo: 'texto', padrao: '203.0.113.10' };
}

const subrede = (ctx: string): Acao => ({
  id: 'subrede',
  rotulo: 'Calculadora de sub-rede',
  ajuda: 'O prefixo diz quantos bits são da rede. O resto é de host: 2^(bits de host) - 2 endereços, porque o primeiro é a rede e o último é o broadcast. Se quiser, divida em sub-redes menores.',
  contexto: ctx,
  campos: [{ nome: 'cidr', rotulo: 'Endereço/prefixo', tipo: 'texto', padrao: '192.0.2.64/26' }, { nome: 'dividir', rotulo: 'Dividir em /n (opcional)', tipo: 'texto', padrao: '' }],
  comandos: (v) => [`subrede ${v.cidr}${v.dividir ? ` ${v.dividir}` : ''}`],
});

function acoesRedePc(m: Mundo, e: Equipamento): Acao[] {
  const ctx = e.nome;
  return [
    { id: 'gateway', rotulo: 'Configurar o gateway padrão', ajuda: 'O roteador da sua rede. Tudo que não é da sua sub-rede vai para ele: o PC faz ARP só para o gateway, nunca para o destino final.', contexto: ctx, campos: [{ nome: 'gw', rotulo: 'Gateway', tipo: 'texto', padrao: e.s.gateway ?? (e.ip ? ipTexto(((e.ip.endereco & ~0xff) | 1) >>> 0) : '192.0.2.1') }], comandos: (v) => [`gateway ${v.gw}`, 'mostra rotas'] },
    { id: 'dhcp', rotulo: 'Pedir endereço por DHCP', ajuda: 'Quatro mensagens: descoberta (em broadcast), oferta, pedido e confirmação. O servidor entrega endereço, máscara, gateway, DNS e por quanto tempo vale.', contexto: ctx, comandos: () => ['dhcp', 'mostra'] },
    { id: 'traceroute', rotulo: 'Traceroute', ajuda: 'Manda sondas com TTL 1, 2, 3... Cada roteador que zera o TTL descarta a sonda e avisa com ICMP "tempo esgotado", revelando o próprio endereço. Assim aparece o caminho, salto a salto.', contexto: ctx, campos: [campoDestino(m, e)], comandos: (v) => [`traceroute ${v.destino}`] },
    {
      id: 'ping-tamanho',
      rotulo: 'Ping com tamanho e DF',
      ajuda: 'Escolha quantos bytes de dados vão no ICMP (o pacote IP tem mais 28: 20 do IP e 8 do ICMP). Pacote maior que o MTU do enlace é fragmentado; com DF ligado, o roteador descarta e devolve "fragmentação necessária".',
      contexto: ctx,
      campos: [campoDestino(m, e), num('n', 'Quantos pedidos', undefined, '1'), num('tamanho', 'Bytes de dados', 'bytes', '1472'), escolha('df', 'Bit DF (não fragmente)', [op('nao', 'desligado'), op('df', 'ligado')])],
      comandos: (v) => [`ping ${v.destino} ${v.n || 1} ${v.tamanho || 56}${v.df === 'df' ? ' df' : ''}`, 'capturar'],
    },
    { id: 'rotas', rotulo: 'Ver a tabela de rotas e o ARP', ajuda: 'Até um PC tem tabela de rotas: a da própria rede (conectada) e a padrão, para o gateway. O cache ARP mostra os vizinhos que já responderam.', contexto: ctx, comandos: () => ['mostra rotas', 'mostra arp'] },
    { id: 'mtu', rotulo: 'Ajustar o MTU', ajuda: 'Maior pacote IP que sai por esta placa. O Ethernet usa 1500.', contexto: ctx, campos: [num('mtu', 'MTU', 'bytes', String(e.portas[0]?.mtu ?? 1500))], comandos: (v) => [`mtu ${v.mtu}`] },
    subrede(ctx),
    { id: 'agregar', rotulo: 'Agregar prefixos', ajuda: 'Duas sub-redes irmãs (mesmo tamanho, lado a lado, começando num múltiplo do dobro) viram uma só com prefixo um bit menor. Assim uma rota anuncia muitas redes.', contexto: ctx, campos: [{ nome: 'lista', rotulo: 'Prefixos separados por espaço', tipo: 'texto', padrao: '192.0.2.0/26 192.0.2.64/26' }], comandos: (v) => [`agregar ${v.lista}`] },
    { id: 'ipv6', rotulo: 'Abreviar e expandir IPv6', ajuda: 'IPv6 tem 128 bits em 8 grupos de 4 dígitos hexadecimais. Abrevia tirando zeros à esquerda e trocando a maior sequência de grupos zerados por "::", uma vez só.', contexto: ctx, campos: [{ nome: 'end', rotulo: 'Endereço', tipo: 'texto', padrao: '2001:0db8:0000:0000:0000:ff00:0042:8329' }], comandos: (v) => [`ipv6 ${v.end}`] },
    { id: 'eui64', rotulo: 'Endereço IPv6 a partir do MAC', ajuda: 'EUI-64: parte o MAC de 48 bits no meio, enfia ff:fe e inverte o bit universal/local. Com fe80:: na frente vira o endereço de enlace local.', contexto: ctx, campos: [{ nome: 'mac', rotulo: 'MAC', tipo: 'texto', padrao: e.mac }], comandos: (v) => [`eui64 ${v.mac}`] },
    { id: 'ip6', rotulo: 'Configurar IPv6', ajuda: 'Endereço global com prefixo /64, por exemplo 2001:db8:1::10/64. O de enlace local (fe80::) já existe sozinho, feito do MAC.', contexto: ctx, campos: [{ nome: 'end', rotulo: 'Endereço/prefixo', tipo: 'texto', padrao: '2001:db8:1::10/64' }], comandos: (v) => [`ip6 ${v.end}`, 'mostra'] },
    { id: 'grupo', rotulo: 'Entrar ou sair de grupo multicast', ajuda: 'O PC avisa o roteador da rede pelo IGMP que quer ouvir um grupo (224.0.0.0 a 239.255.255.255). Sem ninguém ouvindo, o roteador poda aquele galho.', contexto: ctx, campos: [escolha('acao', 'Ação', [op('entrar', 'entrar'), op('sair', 'sair')]), { nome: 'grupo', rotulo: 'Grupo', tipo: 'texto', padrao: '239.1.1.1' }], comandos: (v) => [`grupo ${v.acao} ${v.grupo}`] },
    { id: 'ping6', rotulo: 'Ping IPv6 no enlace', ajuda: 'No IPv6 o ARP vira descoberta de vizinho (NS e NA, por multicast) e o TTL se chama hop limit. Aqui o ping6 só vale dentro do mesmo enlace.', contexto: ctx, campos: [{ nome: 'end', rotulo: 'Destino IPv6', tipo: 'texto', padrao: enlaceLocal([...m.equipamentos.values()].find((x) => x.nome !== e.nome && (x.tipo === 'pc' || x.tipo === 'roteador'))?.mac ?? e.mac) ?? 'fe80::1' }], comandos: (v) => [`ping6 ${v.end}`] },
  ];
}

function acoesRedeRoteador(m: Mundo, e: Equipamento): Acao[] {
  const ctx = e.nome;
  const tab = (e.s.interfaces ?? {}) as Record<string, string>;
  const portas = e.portas.map((p) => op(p.nome, `${p.nome}${tab[p.nome] ? ` (${tab[p.nome]})` : ' (sem IP)'}`));
  const estaticas = ((e.s.rotas ?? []) as { destino: string; via: string }[]).map((r) => op(r.destino, `${r.destino} via ${r.via}`));
  const n = e.s.nat as { internas: string[]; externa: string } | undefined;
  const a: Acao[] = [
    { id: 'rot-interfaces', rotulo: 'Ver as interfaces', ajuda: 'Cada porta do roteador é uma rede diferente, com um endereço IP. É isso que separa os domínios de broadcast.', contexto: ctx, comandos: () => ['mostra interfaces'] },
    { id: 'rot-ip', rotulo: 'Pôr endereço numa porta', ajuda: 'Cada interface ganha um endereço da rede ligada a ela. Isso cria sozinho a rota conectada para aquela rede. "nenhum" tira o endereço.', contexto: ctx, campos: [escolha('porta', 'Porta', portas), { nome: 'ip', rotulo: 'Endereço/prefixo', tipo: 'texto', padrao: tab[e.portas[0]?.nome ?? ''] ?? '192.0.2.1/24' }], comandos: (v) => [`ip ${v.porta} ${v.ip}`, 'mostra interfaces'] },
    { id: 'rot-rotas', rotulo: 'Ver a tabela de rotas', ajuda: 'Conectadas (das interfaces), estáticas (alguém digitou) e a padrão 0.0.0.0/0. Para cada pacote vence a rota de prefixo mais longo que casa com o destino.', contexto: ctx, comandos: () => ['mostra rotas'] },
    { id: 'rot-rota', rotulo: 'Criar rota estática', ajuda: 'Diz: para chegar nesta rede, entregue ao próximo salto. O próximo salto precisa estar numa rede conectada. 0.0.0.0/0 é a rota padrão, o "resto do mundo".', contexto: ctx, campos: [{ nome: 'destino', rotulo: 'Rede de destino', tipo: 'texto', padrao: '203.0.113.0/24' }, { nome: 'via', rotulo: 'Próximo salto', tipo: 'texto', padrao: '198.51.100.2' }], comandos: (v) => [`rota ${v.destino} ${v.via}`, 'mostra rotas'] },
  ];
  if (estaticas.length) a.push({ id: 'rot-sem-rota', rotulo: 'Apagar rota estática', ajuda: 'Tira a rota da tabela. Os pacotes para aquela rede passam a seguir a próxima rota que casar, ou morrem com "destino inalcançável".', contexto: ctx, campos: [escolha('destino', 'Rota', estaticas)], comandos: (v) => [`sem-rota ${v.destino}`, 'mostra rotas'] });
  else a.push({ id: 'rot-sem-rota', rotulo: 'Apagar rota estática', ajuda: 'Tira a rota da tabela. Os pacotes para aquela rede passam a seguir a próxima rota que casar, ou morrem com "destino inalcançável".', contexto: ctx, campos: [{ nome: 'destino', rotulo: 'Rota', tipo: 'texto', padrao: '203.0.113.0/24' }], comandos: (v) => [`sem-rota ${v.destino}`, 'mostra rotas'] });
  a.push(
    {
      id: 'rot-nat',
      rotulo: 'Ligar o NAT',
      ajuda: 'Endereço privado (10/8, 172.16/12, 192.168/16) não volta da internet. O NAT troca o IP e a porta de origem de quem sai pelo endereço público da porta externa e anota a troca numa tabela, para desfazer na volta.',
      contexto: ctx,
      campos: [escolha('interna', 'Porta interna', portas, n?.internas[0]), escolha('externa', 'Porta externa', portas, n?.externa ?? e.portas[1]?.nome)],
      comandos: (v) => [`nat ${v.interna} ${v.externa}`, 'mostra nat'],
    },
    { id: 'rot-nat-ver', rotulo: 'Ver a tabela do NAT', ajuda: 'Cada linha é uma conversa de dentro para fora: IP e porta internos, e o IP e a porta que o mundo vê.', contexto: ctx, comandos: () => ['mostra nat'] },
    {
      id: 'rot-dhcp',
      rotulo: 'Servidor DHCP',
      ajuda: 'Entrega endereço para quem pedir na porta escolhida: uma faixa de endereços, o gateway (por padrão, o próprio roteador), o DNS e o tempo de concessão.',
      contexto: ctx,
      campos: [escolha('porta', 'Porta', portas), { nome: 'inicio', rotulo: 'Primeiro endereço', tipo: 'texto', padrao: '192.168.0.100' }, { nome: 'fim', rotulo: 'Último endereço', tipo: 'texto', padrao: '192.168.0.199' }, { nome: 'dns', rotulo: 'DNS', tipo: 'texto', padrao: '192.168.0.1' }, num('tempo', 'Concessão', 's', '86400')],
      comandos: (v) => [`dhcp ${v.porta} ${v.inicio} ${v.fim}${v.dns ? ` dns ${v.dns}` : ''} tempo ${v.tempo || 86400}`, 'mostra dhcp'],
    },
    { id: 'rot-dhcp-ver', rotulo: 'Ver o servidor DHCP', ajuda: 'A faixa, o que vai junto do endereço e quem já recebeu o quê.', contexto: ctx, comandos: () => ['mostra dhcp'] },
    { id: 'rot-mtu', rotulo: 'MTU de uma porta', ajuda: 'Maior pacote IP que sai por aquela porta. Maior que isso, o roteador fragmenta (ou descarta, se o pacote vier com DF).', contexto: ctx, campos: [escolha('porta', 'Porta', portas), num('mtu', 'MTU', 'bytes', '1500')], comandos: (v) => [`mtu ${v.porta} ${v.mtu}`, 'mostra interfaces'] },
    { id: 'rot-ping', rotulo: 'Ping daqui', ajuda: 'O próprio roteador manda o pedido de eco, saindo pela porta que a tabela de rotas escolher.', contexto: ctx, campos: [campoDestino(m, e), num('n', 'Quantos pedidos', undefined, '4')], comandos: (v) => [`ping ${v.destino} ${v.n || 4}`] },
    { id: 'rot-traceroute', rotulo: 'Traceroute daqui', ajuda: 'Sondas com TTL crescente: cada roteador do caminho se revela ao avisar que o TTL acabou.', contexto: ctx, campos: [campoDestino(m, e)], comandos: (v) => [`traceroute ${v.destino}`] },
    { ...subrede(ctx), id: 'rot-subrede' },
  );
  a.push(...acoesProtocolos(m, e, portas));
  if (temQos(m)) a.push(...acoesQos(m, e, portas));
  return a;
}

/** Congestionamento, QoS e SDN no roteador. Só aparecem quando o mundo usa QoS (m.flags.qos ou algo configurado). */
function acoesQos(m: Mundo, e: Equipamento, portas: Opcao[]): Acao[] {
  const ctx = e.nome;
  const filas = (e.s.fila ?? {}) as Record<string, { buffer?: number }>;
  const p0 = Object.keys(filas)[0] ?? portas.find((p) => !p.rotulo.includes('sem IP'))?.valor ?? portas[0]?.valor ?? '';
  const campoPorta = escolha('porta', 'Porta', portas, p0);
  const onOff = (nome: string, rotulo: string) => escolha(nome, rotulo, [op('on', 'ligado'), op('off', 'desligado')]);
  const roteadores = [...m.equipamentos.values()].filter((x) => x.tipo === 'roteador' || x.tipo === 'switch').map((x) => op(x.nome));
  const classes = ['EF', 'AF41', 'AF31', 'AF21', 'AF11', 'CS1', 'BE'].map((c) => op(c));
  return [
    { id: 'qos-requisitos', rotulo: 'Requisitos de cada aplicação', ajuda: 'O quanto e-mail, web, vídeo sob demanda, voz e videoconferência sofrem com falta de banda, atraso, jitter e perda.', contexto: ctx, comandos: () => ['qos requisitos'] },
    { id: 'fila-ver', rotulo: 'Ver as filas de saída', ajuda: 'Buffer, técnica de descarte e fontes de tráfego de cada porta.', contexto: ctx, comandos: () => ['mostra fila'] },
    { id: 'fila-buffer', rotulo: 'Tamanho do buffer de uma porta', ajuda: 'Quantos pacotes podem esperar na fila de saída. Pouco buffer perde rajadas; buffer demais segura o pacote tanto tempo que ele chega inútil.', contexto: ctx, campos: [campoPorta, num('n', 'Buffer', 'pacotes', String(filas[p0]?.buffer ?? 64))], comandos: (v) => [`fila ${v.porta} buffer ${v.n || 64}`, 'mostra fila'] },
    { id: 'fila-red', rotulo: 'Ligar o RED', ajuda: 'Descarte aleatório antecipado: com a média da fila entre o mínimo e o máximo, descarta alguns pacotes ao acaso, avisando as origens antes de o buffer encher.', contexto: ctx, campos: [campoPorta, num('min', 'Limiar mínimo', 'pacotes', '5'), num('max', 'Limiar máximo', 'pacotes', '15')], comandos: (v) => [`fila ${v.porta} red ${v.min || 5} ${v.max || 15}`, 'mostra fila'] },
    { id: 'fila-ecn', rotulo: 'Marcação ECN', ajuda: 'Em vez de descartar, o roteador marca os 2 bits de congestionamento do cabeçalho IP. O destino devolve o aviso e a origem vai mais devagar, sem perder o pacote.', contexto: ctx, campos: [campoPorta, onOff('v', 'ECN')], comandos: (v) => [`fila ${v.porta} ecn ${v.v}`, 'mostra fila'] },
    { id: 'fila-choke', rotulo: 'Choke packet (aviso para a origem)', ajuda: 'Com a fila passando de 3/4 do buffer, o roteador manda um aviso direto para quem está enviando, que reduz a taxa.', contexto: ctx, campos: [campoPorta, onOff('v', 'Choke packet')], comandos: (v) => [`fila ${v.porta} choke ${v.v}`, 'mostra fila'] },
    { id: 'fila-descarte', rotulo: 'Descarte de carga', ajuda: 'Com o buffer cheio, joga fora o pacote menos importante da fila para caber um mais importante.', contexto: ctx, campos: [campoPorta, onOff('v', 'Descarte de carga')], comandos: (v) => [`fila ${v.porta} descarte ${v.v}`, 'mostra fila'] },
    { id: 'fila-admissao', rotulo: 'Controle de admissão', ajuda: 'Fluxo novo só entra se a soma das taxas couber na fração escolhida da capacidade. Quem não cabe é recusado antes de atrapalhar os outros.', contexto: ctx, campos: [campoPorta, { nome: 'pct', rotulo: 'Limite (% da capacidade, ou off)', tipo: 'texto', padrao: '80' }], comandos: (v) => [`fila ${v.porta} admissao ${v.pct || 'off'}`, 'mostra fila'] },
    {
      id: 'fila-fonte',
      rotulo: 'Fonte de tráfego numa porta',
      ajuda: 'Quem manda tráfego por esta porta: taxa média, tamanho do pacote, rajada (quantos chegam juntos), importância (para o descarte de carga) e classe DSCP.',
      contexto: ctx,
      campos: [campoPorta, { nome: 'nome', rotulo: 'Nome', tipo: 'texto', padrao: 'video' }, num('mbps', 'Taxa', 'Mb/s', '40'), num('tamanho', 'Tamanho do pacote', 'bytes', '1000'), num('rajada', 'Rajada', 'pacotes', '1'), num('imp', 'Importância', undefined, '1'), escolha('classe', 'Classe', classes, 'BE')],
      comandos: (v) => [`fila ${v.porta} fonte ${v.nome || 'fonte'} ${v.mbps || 10} tamanho=${v.tamanho || 1000} rajada=${v.rajada || 1} importancia=${v.imp || 1} classe=${v.classe || 'BE'}`, 'mostra fila'],
    },
    { id: 'fila-simular', rotulo: 'Simular a fila com uma carga', ajuda: 'Roda a porta pacote a pacote com chegadas aleatórias e mostra atraso médio, jitter, ocupação e perdas. Carga é a fração da capacidade: 0,5 é metade, 1,2 é 20 % a mais do que cabe.', contexto: ctx, campos: [campoPorta, { nome: 'carga', rotulo: 'Carga', tipo: 'texto', padrao: '0,9' }], comandos: (v) => [`fila simular ${v.carga || '0,9'} ${v.porta}`] },
    { id: 'fila-curva', rotulo: 'Curva carga × atraso', ajuda: 'A mesma porta com cargas de 10 % a 110 %. Perto de 100 % o atraso explode.', contexto: ctx, campos: [campoPorta], comandos: (v) => [`fila curva ${v.porta}`] },
    { id: 'fila-buffers', rotulo: 'Buffer pequeno × buffer grande', ajuda: 'Com a porta sobrecarregada, compara buffers de 8 a 4096 pacotes: quanto se perde e quanto se espera.', contexto: ctx, campos: [campoPorta, { nome: 'carga', rotulo: 'Carga', tipo: 'texto', padrao: '1,2' }], comandos: (v) => [`fila buffers ${v.carga || '1,2'} ${v.porta}`] },
    {
      id: 'balde',
      rotulo: 'Balde furado ou balde de fichas',
      ajuda: 'Modelagem de tráfego. Balde furado: sai sempre na taxa R. Balde de fichas: guarda até B de fichas, deixa a rajada passar no pico M por S = B / (M - R) e depois limita a R.',
      contexto: ctx,
      campos: [escolha('tipo', 'Balde', [op('fichas', 'balde de fichas'), op('furado', 'balde furado')]), num('taxa', 'Taxa R', 'Mb/s', '200'), num('b', 'Profundidade B', 'kB', '9600'), num('pico', 'Pico M', 'Mb/s', '1000'), num('rajada', 'Rajada', 'kB', '30000'), { nome: 'espera', rotulo: 'Espera (kB, "descartar" ou vazio)', tipo: 'texto', padrao: '' }],
      comandos: (v) => [`balde ${v.tipo} ${v.taxa || 200} ${v.b || 9600} ${v.pico || 1000} ${v.rajada || 30000}${v.espera ? ` ${v.espera}` : ''}`],
    },
    { id: 'escalonar', rotulo: 'Escalonamento de pacotes', ajuda: 'FIFO atende por ordem de chegada; prioridade estrita sempre atende a classe mais alta; WFQ divide a banda pelos pesos. Usa as fontes da porta ou voz, vídeo e dados.', contexto: ctx, campos: [escolha('d', 'Disciplina', [op('wfq', 'WFQ (justo ponderado)'), op('prioridade', 'prioridade estrita'), op('fifo', 'FIFO')]), { nome: 'pesos', rotulo: 'Pesos (WFQ), como 3,2,1', tipo: 'texto', padrao: '' }], comandos: (v) => [`escalonar ${v.d}${v.pesos ? ` ${v.pesos}` : ''}`] },
    { id: 'dscp', rotulo: 'Marcar classe DSCP na borda', ajuda: 'Serviços diferenciados: o roteador da borda escreve a classe no campo "serviço diferenciado" do cabeçalho IPv4; os do meio só leem e tratam cada classe do seu jeito. EF é para voz; AF tem quatro classes com três níveis de descarte.', contexto: ctx, campos: [{ nome: 'prefixo', rotulo: 'Prefixo de origem', tipo: 'texto', padrao: Object.values((e.s.interfaces ?? {}) as Record<string, string>)[0] ?? '192.0.2.0/24' }, escolha('classe', 'Classe', classes)], comandos: (v) => [`dscp ${v.prefixo} ${v.classe}`, 'mostra qos'] },
    { id: 'rsvp', rotulo: 'Reservar banda (RSVP)', ajuda: 'Serviços integrados: a reserva vai salto a salto até o destino; cada roteador confere se cabe (até 75 % da porta) e guarda estado para o fluxo. Se um não aceita, a reserva toda é desfeita.', contexto: ctx, campos: [campoDestino(m, e), num('mbps', 'Banda', 'Mb/s', '10')], comandos: (v) => [`rsvp ${v.destino} ${v.mbps || 10}`, 'mostra qos'] },
    { id: 'sdn-controlador', rotulo: 'Ligar o controlador SDN', ajuda: 'O controlador central junta a visão da rede e calcula os caminhos (plano de controle). Os equipamentos só seguem as regras da tabela de fluxo (plano de dados).', contexto: ctx, campos: [escolha('v', 'Controlador', [op('on', 'ligado'), op('off', 'desligado')], m.flags.sdn?.controlador ? 'off' : 'on')], comandos: (v) => [`sdn controlador ${v.v}`, 'sdn ver'] },
    {
      id: 'sdn-regra',
      rotulo: 'Instalar regra de fluxo',
      ajuda: 'Casamento por campos (destino, origem, proto, dscp, entrada; * casa tudo) e ação (porta:<p>, descartar, controlador, normal, dscp=<classe>, destino=<ip>, juntas com "+"). Prioridade maior vence. A regra decide antes da tabela de rotas.',
      contexto: ctx,
      campos: [num('prio', 'Prioridade', undefined, '100'), { nome: 'casa', rotulo: 'Casamento', tipo: 'texto', padrao: 'destino=203.0.113.0/24' }, { nome: 'acao', rotulo: 'Ação', tipo: 'texto', padrao: portas[1] ? `porta:${portas[1].valor}` : 'descartar' }, escolha('em', 'Em', roteadores, e.nome)],
      comandos: (v) => [`sdn regra ${v.prio || 100} ${v.casa || '*'} ${v.acao || 'normal'} em ${v.em || e.nome}`, 'sdn ver'],
    },
    { id: 'sdn-ver', rotulo: 'Ver o controlador e as tabelas de fluxo', ajuda: 'A visão central da rede, os caminhos calculados pelo controlador e a tabela de fluxo de cada equipamento, com os contadores de cada regra.', contexto: ctx, comandos: () => ['sdn ver'] },
    { id: 'sdn-telemetria', rotulo: 'Telemetria (contadores por regra)', ajuda: 'O controlador consulta os contadores de pacotes e bytes de cada regra e de cada porta, em todos os equipamentos.', contexto: ctx, comandos: () => ['sdn telemetria'] },
    { id: 'sdn-apagar', rotulo: 'Esvaziar a tabela de fluxo', ajuda: 'Apaga as regras deste equipamento: o tráfego volta a seguir só a tabela de rotas.', contexto: ctx, comandos: () => ['sdn apagar tudo', 'sdn ver'] },
  ];
}

/** Protocolos de roteamento, algoritmos e queda de enlace no roteador. */
function acoesProtocolos(m: Mundo, e: Equipamento, portas: Opcao[]): Acao[] {
  const ctx = e.nome;
  const s = e.s;
  const outros = [...m.equipamentos.values()].filter((x) => x.tipo === 'roteador' && x.nome !== e.nome).map((x) => op(x.nome));
  const todos = [...m.equipamentos.values()].filter((x) => x.tipo === 'roteador').map((x) => op(x.nome));
  const liga = (atual: boolean | undefined) => escolha('estado', 'Estado', [op('on', 'ligado'), op('off', 'desligado')], atual ? 'off' : 'on');
  const derrubadas = e.portas.filter((p) => p.desligada).map((p) => op(p.nome));
  const redes = Object.values((s.interfaces ?? {}) as Record<string, string>);
  const anunciados = ((s.bgp?.anuncia ?? []) as string[]).map((x) => op(x));
  return [
    { id: 'rot-ospf', rotulo: 'Ligar ou desligar o OSPF', ajuda: 'Estado de enlace: o roteador descobre os vizinhos com hello, mede o custo de cada enlace, inunda um pacote de estado de enlace (LSP) e todo mundo roda o Dijkstra no mesmo mapa.', contexto: ctx, campos: [liga(s.ospf?.ligado)], comandos: (v) => [`ospf ${v.estado}`, 'mostra ospf'] },
    { id: 'rot-ospf-custo', rotulo: 'Custo OSPF de uma porta', ajuda: 'Por padrão o custo é 10^8 dividido pela velocidade em bit/s (100 Mb/s dá 1, e mais rápido também dá 1). Custo maior afasta o tráfego daquele enlace.', contexto: ctx, campos: [escolha('porta', 'Porta', portas), num('custo', 'Custo', undefined, '10')], comandos: (v) => [`ospf custo ${v.porta} ${v.custo || 10}`, 'mostra ospf'] },
    { id: 'rot-ospf-area', rotulo: 'Área OSPF de uma porta', ajuda: 'Rede grande se divide em áreas. A área 0 é o backbone; o roteador que fica entre a 0 e outra é o de borda (ABR) e resume uma para a outra.', contexto: ctx, campos: [escolha('porta', 'Porta', portas), num('area', 'Área', undefined, '0')], comandos: (v) => [`ospf area ${v.porta} ${v.area || 0}`, 'mostra ospf'] },
    { id: 'rot-ospf-ver', rotulo: 'Ver OSPF e o banco de estado de enlace', ajuda: 'Vizinhos, custo e área de cada interface, rotas aprendidas e os LSPs guardados, com número de sequência e idade.', contexto: ctx, comandos: () => ['mostra ospf', 'mostra lsdb'] },
    { id: 'rot-rip', rotulo: 'Ligar ou desligar o RIP', ajuda: 'Vetor de distância: cada roteador conta aos vizinhos a distância (em saltos) que acha que tem até cada rede. 16 é infinito.', contexto: ctx, campos: [liga(s.rip?.ligado)], comandos: (v) => [`rip ${v.estado}`, 'mostra rip'] },
    { id: 'rot-rip-horizonte', rotulo: 'Horizonte dividido do RIP', ajuda: 'Ligado: não conta ao vizinho a rota que aprendeu dele. Envenenado: conta, mas com 16. Os dois evitam a contagem ao infinito quando a rede é uma linha.', contexto: ctx, campos: [escolha('h', 'Horizonte', [op('on', 'dividido'), op('envenenado', 'envenenamento reverso'), op('off', 'desligado')])], comandos: (v) => [`rip horizonte ${v.h}`, 'mostra rip'] },
    { id: 'rot-rip-ver', rotulo: 'Ver a tabela do RIP', ajuda: 'Destino, quantos saltos e por qual vizinho, do jeito que este roteador acredita agora.', contexto: ctx, comandos: () => ['mostra rip'] },
    { id: 'rot-rodar', rotulo: 'Rodar os protocolos', ajuda: 'Uma rodada é todo mundo mandar o vetor aos vizinhos ao mesmo tempo. Deixe em branco para rodar até convergir, ou diga quantas para ver passo a passo.', contexto: ctx, campos: [{ nome: 'n', rotulo: 'Rodadas (vazio: até convergir)', tipo: 'texto', padrao: '' }], comandos: (v) => [`rodar-protocolos${v.n ? ` ${v.n}` : ''}`] },
    { id: 'rot-dijkstra', rotulo: 'Dijkstra passo a passo', ajuda: 'A cada passo, o nó provisório de menor distância vira permanente e atualiza os vizinhos. No fim, o caminho mais curto daqui para cada roteador.', contexto: ctx, campos: [escolha('destino', 'Destino (opcional)', [op('', 'todos'), ...outros])], comandos: (v) => [`dijkstra${v.destino ? ` ${v.destino}` : ''}`] },
    { id: 'rot-arvore', rotulo: 'Árvore de escoamento', ajuda: 'Os caminhos ótimos de todos até um destino formam uma árvore (princípio de otimização). Cada roteador só precisa saber o próximo salto.', contexto: ctx, campos: [escolha('destino', 'Destino', todos, outros[0]?.valor ?? e.nome)], comandos: (v) => [`arvore ${v.destino}`] },
    { id: 'rot-inundar', rotulo: 'Inundação', ajuda: 'Manda o pacote por todos os enlaces, menos o de chegada. Sem controle, em rede com laço, nunca para. Com contador de saltos ou número de sequência, para.', contexto: ctx, campos: [escolha('modo', 'Controle', [op('sequencia', 'número de sequência'), op('saltos', 'contador de saltos'), op('sem-controle', 'sem controle')]), { nome: 'k', rotulo: 'Saltos (só no contador)', tipo: 'texto', padrao: '' }], comandos: (v) => [`inundar ${v.modo}${v.modo === 'saltos' && v.k ? ` ${v.k}` : ''}`] },
    { id: 'rot-difusao', rotulo: 'Comparar jeitos de difusão', ajuda: 'Inundação, encaminhamento por caminho reverso (RPF) e árvore de difusão: quantas cópias cada um gasta para alcançar todos.', contexto: ctx, comandos: () => ['difusao'] },
    { id: 'rot-multicast', rotulo: 'Árvore multicast de um grupo', ajuda: 'Só recebe quem pediu pelo IGMP. A árvore de difusão é podada nos galhos sem ninguém do grupo.', contexto: ctx, campos: [{ nome: 'grupo', rotulo: 'Grupo', tipo: 'texto', padrao: '239.1.1.1' }], comandos: (v) => ['mostra igmp', `multicast ${v.grupo}`] },
    { id: 'rot-anycast', rotulo: 'Anycast: quem fica mais perto', ajuda: 'O mesmo endereço em vários lugares. O roteamento leva cada um ao mais próximo, sem configuração especial.', contexto: ctx, campos: [campoDestino(m, e)], comandos: (v) => [`anycast ${v.destino}`] },
    { id: 'rot-regiao', rotulo: 'Pôr numa região', ajuda: 'No roteamento hierárquico cada roteador sabe os detalhes da própria região e só uma linha para cada outra região.', contexto: ctx, campos: [{ nome: 'regiao', rotulo: 'Região', tipo: 'texto', padrao: String(s.regiao ?? 'norte') }], comandos: (v) => [`regiao ${v.regiao || 'norte'}`, 'hierarquia'] },
    { id: 'rot-hierarquia', rotulo: 'Comparar plano com hierárquico', ajuda: 'Tamanho da tabela nos dois jeitos e quanto o pacote anda a mais por entrar na região pela porta mais perto, não pela melhor.', contexto: ctx, comandos: () => ['hierarquia'] },
    { id: 'rot-derrubar', rotulo: 'Derrubar uma porta', ajuda: 'Simula a queda do enlace, como um cabo cortado. Veja os protocolos reagirem: o OSPF na hora, o RIP rodada a rodada.', contexto: ctx, campos: [escolha('porta', 'Porta', portas)], comandos: (v) => [`derrubar ${v.porta}`, 'mostra rotas'] },
    { id: 'rot-levantar', rotulo: 'Levantar uma porta derrubada', ajuda: 'Devolve o enlace. O OSPF reencontra o vizinho e recalcula.', contexto: ctx, campos: [escolha('porta', 'Porta', derrubadas.length ? derrubadas : portas)], comandos: (v) => [`levantar ${v.porta}`, 'mostra rotas'] },
    { id: 'rot-mpls-lsp', rotulo: 'Montar caminho MPLS', ajuda: 'Comutação por rótulos: este roteador empilha um rótulo, os do meio só trocam o rótulo (sem olhar o IP) e o último desempilha. Diga os próximos roteadores do caminho, em ordem.', contexto: ctx, campos: [{ nome: 'fec', rotulo: 'Prefixo (FEC)', tipo: 'texto', padrao: '203.0.113.0/24' }, { nome: 'rota', rotulo: 'Roteadores seguintes, separados por espaço', tipo: 'texto', padrao: outros[0]?.valor ?? '' }], comandos: (v) => [`mpls lsp ${v.fec} ${v.rota}`, 'mostra mpls'] },
    { id: 'rot-mpls-enviar', rotulo: 'Mandar pacote pelo MPLS', ajuda: 'Mostra a pilha de rótulos em cada roteador: empilhar, trocar, desempilhar.', contexto: ctx, campos: [{ nome: 'destino', rotulo: 'Destino', tipo: 'texto', padrao: '203.0.113.10' }], comandos: (v) => [`mpls enviar ${v.destino}`] },
    { id: 'rot-mpls-ver', rotulo: 'Ver a tabela de rótulos', ajuda: 'Rótulo de entrada, operação, rótulo de saída e próximo roteador.', contexto: ctx, comandos: () => ['mostra mpls'] },
    { id: 'rot-bgp-as', rotulo: 'Ligar o BGP (número do AS)', ajuda: 'Cada sistema autônomo tem um número. Use AS de documentação (64496 a 64511) ou privado (64512 a 65534).', contexto: ctx, campos: [num('asn', 'AS', undefined, String(s.bgp?.asn ?? 64500))], comandos: (v) => [`bgp as ${v.asn || 64500}`, 'mostra bgp'] },
    { id: 'rot-bgp-vizinho', rotulo: 'Vizinho BGP', ajuda: 'A sessão sobe quando os dois lados se configuram. A relação manda na política: rota de cliente é preferida e vai para todos; de par ou de provedor só vai para clientes.', contexto: ctx, campos: [{ nome: 'ip', rotulo: 'IP do vizinho', tipo: 'texto', padrao: '10.0.13.2' }, num('asn', 'AS do vizinho', undefined, '64501'), escolha('rel', 'O vizinho é meu', [op('par', 'par'), op('cliente', 'cliente'), op('provedor', 'provedor')])], comandos: (v) => [`bgp vizinho ${v.ip} ${v.asn || 64501} ${v.rel}`, 'mostra bgp'] },
    { id: 'rot-bgp-anunciar', rotulo: 'Anunciar prefixo no BGP', ajuda: 'O anúncio leva o caminho de AS. Anunciar o prefixo de outro, ou um pedaço mais específico dele, é sequestro: o mais específico vence em todo lugar.', contexto: ctx, campos: [{ nome: 'p', rotulo: 'Prefixo', tipo: 'texto', padrao: redes[0] ? textoRede(redes[0]) : '192.0.2.0/24' }], comandos: (v) => [`bgp anunciar ${v.p}`, 'mostra bgp'] },
    { id: 'rot-bgp-retirar', rotulo: 'Retirar prefixo do BGP', ajuda: 'Os vizinhos recebem a retirada e procuram outro caminho, se houver.', contexto: ctx, campos: [anunciados.length ? escolha('p', 'Prefixo', anunciados) : { nome: 'p', rotulo: 'Prefixo', tipo: 'texto', padrao: '192.0.2.0/24' }], comandos: (v) => [`bgp retirar ${v.p}`, 'mostra bgp'] },
    { id: 'rot-bgp-ver', rotulo: 'Ver o BGP', ajuda: 'Sessões, melhores rotas com o caminho de AS e alertas de prefixo mais específico vindo de outro AS.', contexto: ctx, comandos: () => ['mostra bgp'] },
  ];
}

/** "192.0.2.1/24" vira "192.0.2.0/24". */
function textoRede(cidr: string): string {
  const [a, p] = cidr.split('/');
  const n = Number(p);
  const ip = (a ?? '').split('.').map(Number);
  if (ip.length !== 4 || !(n >= 0 && n <= 32)) return cidr;
  const v = ((ip[0]! << 24) | (ip[1]! << 16) | (ip[2]! << 8) | ip[3]!) >>> 0;
  const masc = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
  return `${ipTexto((v & masc) >>> 0)}/${n}`;
}

/* ---------- Equipamentos ---------- */

function acoesConsole(m: Mundo, e: Equipamento): Acao[] {
  const ctx = e.nome;
  const a: Acao[] = [];
  const mostra: Acao = { id: 'mostra', rotulo: 'Ver estado das portas', ajuda: 'Mostra cada porta, se tem enlace, a velocidade e os contadores de quadros recebidos e de erros de CRC.', contexto: ctx, comandos: () => ['mostra'] };
  switch (e.tipo) {
    case 'pc': {
      const ips = [...m.equipamentos.values()].filter((x) => x.ip && x.nome !== e.nome).map((x) => op(ipTexto(x.ip!.endereco), `${ipTexto(x.ip!.endereco)} (${x.nome})`));
      a.push(
        { id: 'ip', rotulo: 'Configurar endereço IP', ajuda: 'Endereço e prefixo, por exemplo 192.0.2.10/24. Dois hosts só falam direto se estiverem na mesma rede.', contexto: ctx, campos: [{ nome: 'ip', rotulo: 'Endereço/prefixo', tipo: 'texto', padrao: e.ip ? `${ipTexto(e.ip.endereco)}/${e.ip.prefixo}` : '192.0.2.10/24' }], comandos: (v) => [`ip ${v.ip}`] },
        { id: 'ping', rotulo: 'Fazer ping', ajuda: 'Manda pedidos de eco ICMP e espera as respostas. Mede se chega, quanto se perde e quanto demora.', contexto: ctx, campos: [{ nome: 'destino', rotulo: 'Destino', tipo: ips.length ? 'escolha' : 'texto', opcoes: ips, padrao: ips[0]?.valor ?? '192.0.2.1' }, num('n', 'Quantos pedidos', undefined, '4')], comandos: (v) => [`ping ${v.destino} ${v.n || 4}`] },
        { id: 'capturar', rotulo: 'Ver o último quadro capturado', ajuda: 'Mostra o último pedido de eco que chegou ao destino, camada por camada: Ethernet, IPv4 e ICMP.', contexto: ctx, comandos: () => ['capturar'] },
      );
      if (temCamadaRede(m)) a.push(...acoesRedePc(m, e));
      if (temTransporte(m)) a.push(...acoesTransporte(m, e));
      if (m.flags.servidorTeste) a.push({ id: 'vazao', rotulo: 'Medir vazão', ajuda: 'Teste de vazão TCP até o servidor de teste. Mostra o resultado em Mb/s, MB/s e MiB/s.', contexto: ctx, comandos: () => ['vazao'] });
      a.push(mostra);
      break;
    }
    case 'roteador': {
      const est = e.s.estado as string;
      const travado = est === 'ligado' && !!e.s.senhaRunning && !e.s.logado;
      if (est === 'boot') {
        a.push({ id: 'interromper', rotulo: 'Interromper o boot (agora!)', ajuda: 'O roteador está carregando. Interrompa agora para entrar no modo de resgate, onde não se pede senha.', contexto: ctx, comandos: () => ['interromper'], proxima: 'inicio' });
        break;
      }
      if (est === 'resgate') {
        a.push(
          { id: 'inicio', rotulo: 'Registro de inicialização', ajuda: 'Diz se o próximo boot lê a configuração gravada (normal) ou a ignora (ignorar-config). Para entrar sem senha, ignore.', contexto: ctx, campos: [escolha('modo', 'Próximo boot', [op('ignorar-config', 'ignorar a configuração gravada'), op('normal', 'normal')])], comandos: (v) => [`inicio ${v.modo}`], proxima: 'boot' },
          { id: 'boot', rotulo: 'Continuar o boot', ajuda: 'Sai do modo de resgate e carrega o sistema, respeitando o registro de inicialização.', contexto: ctx, comandos: () => ['boot'] },
        );
        break;
      }
      if (travado) {
        a.push({ id: 'login', rotulo: 'Tentar entrar com senha', ajuda: 'Pede a senha que está na configuração. Você não sabe qual é. O caminho é religar e interromper o boot.', contexto: ctx, campos: [{ nome: 'senha', rotulo: 'Senha', tipo: 'texto' }], comandos: (v) => [`login ${v.senha}`] });
        break;
      }
      a.push(
        { id: 'copiar', rotulo: 'Copiar configuração gravada para a memória', ajuda: 'Traz a configuração gravada (a da cidade) para a memória, onde ela passa a valer. Vem junto a senha antiga, que você troca no passo seguinte.', contexto: ctx, comandos: () => ['copiar startup running'], proxima: 'senha' },
        { id: 'senha', rotulo: 'Trocar a senha', ajuda: 'Troca a senha na memória. Só vira permanente depois de salvar.', contexto: ctx, campos: [{ nome: 'senha', rotulo: 'Senha nova (8 ou mais caracteres)', tipo: 'texto', padrao: 'Fim!Linha2026' }], comandos: (v) => [`senha ${v.senha}`], proxima: 'inicio' },
        { id: 'inicio', rotulo: 'Registro de inicialização', ajuda: 'Diz se o próximo boot lê a configuração gravada (normal) ou a ignora. Volte para normal, senão o roteador esquece tudo no próximo boot.', contexto: ctx, campos: [escolha('modo', 'Próximo boot', [op('normal', 'normal'), op('ignorar-config', 'ignorar a configuração gravada')], 'normal')], comandos: (v) => [`inicio ${v.modo}`], proxima: 'salvar' },
        { id: 'salvar', rotulo: 'Salvar', ajuda: 'Grava a configuração em execução por cima da de inicialização. Não tem desfazer.', contexto: ctx, comandos: () => ['salvar'] },
        { id: 'mostra-config', rotulo: 'Ver configurações', ajuda: 'Mostra a configuração em execução e a gravada, lado a lado.', contexto: ctx, comandos: () => ['mostra', 'mostra startup'] },
      );
      if (temCamadaRede(m)) a.unshift(...acoesRedeRoteador(m, e));
      break;
    }
    case 'modem':
      a.push(
        { id: 'modem', rotulo: 'Configurar e treinar o modem', ajuda: 'Taxa de símbolos (baud) e modulação. Taxa em bits = baud × bits por símbolo. Respeite Nyquist, a SNR e Shannon.', contexto: ctx, campos: [num('baud', 'Taxa de símbolos', 'Bd', String(e.s.baud)), escolha('mod', 'Modulação', Object.entries(BITS_POR_SIMBOLO).map(([k, b]) => op(k, `${k.toUpperCase()} (${b} bit${b > 1 ? 's' : ''} por símbolo)`)), e.s.modulacao)], comandos: (v) => [`taxa-simbolos ${v.baud}`, `modulacao ${v.mod}`, 'treinar'] },
        { id: 'mostra', rotulo: 'Ver a linha', ajuda: 'Banda, SNR, configuração e motivo de não sincronizar.', contexto: ctx, comandos: () => ['mostra'] },
      );
      break;
    case 'mux':
      a.push(
        { id: 'slot', rotulo: 'Definir intervalos de tempo', ajuda: 'Escolha quais intervalos (0 a 31) servem a quê. Lista como 1-10 ou 11-15,17-31.', contexto: ctx, campos: [{ nome: 'lista', rotulo: 'Intervalos', tipo: 'texto', padrao: '1-10' }, escolha('uso', 'Uso', ['voz', 'dados', 'sinalizacao', 'livre', 'enquadramento'].map((x) => op(x)))], comandos: (v) => [`slot ${v.lista} ${v.uso}`, 'mostra'] },
        { id: 'mostra', rotulo: 'Ver o quadro E1', ajuda: 'Os 32 intervalos e o uso de cada um.', contexto: ctx, comandos: () => ['mostra'] },
      );
      break;
    case 'ap':
      a.push(
        { id: 'canal', rotulo: 'Trocar o canal', ajuda: 'Canais de 2,4 GHz vão de 1 a 13, espaçados de 5 MHz, mas cada um ocupa 22 MHz.', contexto: ctx, campos: [escolha('canal', 'Canal', Array.from({ length: 13 }, (_, i) => op(String(i + 1), `canal ${i + 1} (${2412 + 5 * i} MHz)`)), String(e.s.canal))], comandos: (v) => [`canal ${v.canal}`, 'mostra'] },
        { id: 'espectro', rotulo: 'Analisador de espectro', ajuda: 'Mostra as redes vizinhas, o canal e a potência de cada uma.', comandos: () => ['espectro'] },
        { id: 'mostra', rotulo: 'Ver SNR no cliente', ajuda: 'Sinal, ruído mais interferência e a SNR resultante.', contexto: ctx, comandos: () => ['mostra'] },
      );
      break;
    case 'cablemodem':
      a.push({ id: 'status', rotulo: 'Ver nível e MER', ajuda: 'Nível de descida em dBmV e MER em dB. Ele responde gritando.', contexto: ctx, comandos: () => ['MOSTRA'] });
      break;
    case 'enlace': {
      a.push({ id: 'mostra', rotulo: 'Ver a configuração', ajuda: 'Como o controlador está montando, conferindo e retransmitindo os quadros.', contexto: ctx, comandos: () => ['mostra'] });
      if (e.s.cfg) {
        a.push(
          { id: 'transmitir', rotulo: 'Transmitir quadros de teste', ajuda: 'Manda uma rajada de quadros pela linha, com os erros que a linha costuma causar, e conta o que chegou certo, errado, descartado ou perdido.', contexto: ctx, comandos: () => ['transmitir'] },
          { id: 'quadro', rotulo: 'Ver um quadro na linha', ajuda: 'Analisador de quadros: mostra o dado original e como ele fica no fio, byte a byte (ou bit a bit).', contexto: ctx, comandos: () => ['quadro'] },
          { id: 'enquadramento', rotulo: 'Escolher o enquadramento', ajuda: 'Como o receptor descobre onde cada quadro começa e termina.', contexto: ctx, campos: [escolha('v', 'Enquadramento', [op('contagem', 'contagem: o quadro começa dizendo o próprio tamanho'), op('flags', 'flags: um byte especial (7E) marca o começo e o fim'), op('bits', 'flags de bits: o padrão 01111110 marca o começo e o fim')], e.s.cfg.enquadramento)], comandos: (v) => [`enquadramento ${v.v}`] },
          { id: 'enchimento', rotulo: 'Escape / enchimento', ajuda: 'Proteção para quando o próprio dado contém o padrão da flag.', contexto: ctx, campos: [escolha('v', 'Escape de bytes ou enchimento de bits', [op('sim', 'ligado'), op('nao', 'desligado')], e.s.cfg.enchimento ? 'sim' : 'nao')], comandos: (v) => [`enchimento ${v.v}`] },
          { id: 'deteccao', rotulo: 'Escolher a detecção de erros', ajuda: 'O código que vai no fim do quadro para o receptor saber se algum bit mudou no caminho.', contexto: ctx, campos: [escolha('v', 'Detecção', [op('nenhuma', 'nenhuma'), op('paridade', 'bit de paridade'), op('checksum', 'soma de verificação de 16 bits'), op('crc32', 'CRC-32 (o do Ethernet)')], e.s.cfg.deteccao)], comandos: (v) => [`deteccao ${v.v}`] },
          { id: 'correcao', rotulo: 'Escolher a correção de erros', ajuda: 'Com correção, o receptor conserta o erro sozinho, sem pedir de novo. Custa bits a mais em cada quadro.', contexto: ctx, campos: [escolha('v', 'Correção', [op('nenhuma', 'nenhuma'), op('hamming', 'Hamming (7,4)')], e.s.cfg.correcao)], comandos: (v) => [`correcao ${v.v}`] },
        );
      }
      if (e.s.arq) {
        a.push(
          { id: 'transferir', rotulo: 'Transferir um arquivo', ajuda: 'Manda o arquivo quadro a quadro com o protocolo de retransmissão configurado e mede o tempo, o aproveitamento e os erros.', contexto: ctx, comandos: () => ['transferir'] },
          { id: 'timeout', rotulo: 'Ajustar o timeout', ajuda: 'Quanto tempo o transmissor espera o ACK antes de mandar de novo.', contexto: ctx, campos: [num('ms', 'Timeout', 'ms')], comandos: (v) => [`timeout ${v.ms}`] },
          { id: 'bits-seq', rotulo: 'Bits do número de sequência', ajuda: 'Com n bits, os quadros são numerados de 0 a 2^n - 1 e a numeração recomeça.', contexto: ctx, campos: [num('n', 'Bits', 'bits')], comandos: (v) => [`bits-seq ${v.n}`] },
          { id: 'janela', rotulo: 'Ajustar a janela', ajuda: 'Quantos quadros podem estar a caminho ao mesmo tempo, sem ACK.', contexto: ctx, campos: [num('n', 'Janela', 'quadros')], comandos: (v) => [`janela ${v.n}`] },
          { id: 'protocolo', rotulo: 'Escolher o protocolo de retransmissão', ajuda: 'Pare e espere manda um e espera. Go-back-N manda vários e, se um se perde, repete daquele em diante. Retransmissão seletiva repete só o que se perdeu.', contexto: ctx, campos: [escolha('p', 'Protocolo', [op('pare-e-espere'), op('go-back-n'), op('seletiva', 'retransmissão seletiva')], e.s.arq.protocolo), num('janela', 'Janela', 'quadros'), num('bits', 'Bits do número de sequência', 'bits')], comandos: (v) => [`arq ${v.p}`, `janela ${v.janela}`, `bits-seq ${v.bits}`] },
        );
      }
      if (e.s.ppp && !e.s.ppp.exige) {
        a.push(
          { id: 'ppp-auth', rotulo: 'Autenticação PPP', ajuda: 'PAP manda a senha aberta. CHAP prova que sabe a senha sem mandá-la, respondendo a um desafio.', contexto: ctx, campos: [escolha('v', 'Autenticação', [op('nenhuma'), op('pap', 'PAP'), op('chap', 'CHAP')], e.s.ppp.auth)], comandos: (v) => [`ppp auth ${v.v}`] },
          { id: 'ppp-discar', rotulo: 'Discar (subir o PPP)', ajuda: 'Negocia o enlace (LCP), autentica e negocia o IP (IPCP).', contexto: ctx, comandos: () => ['ppp discar'] },
        );
      }
      break;
    }
    case 'switch': {
      const portas = e.portas.map((p) => op(p.nome, `${p.nome}${p.tronco ? ` (tronco ${p.tronco.join(',')})` : ` (VLAN ${p.vlan ?? 1})`}`));
      a.push(
        mostra,
        { id: 'mac-tabela', rotulo: 'Ver a tabela de endereços MAC', ajuda: 'Cada MAC de origem que passou por aqui e a porta onde ele foi visto. Destino que não está na tabela é inundado para todas as portas.', contexto: ctx, comandos: () => ['mostra mac'] },
        { id: 'mac-limpar', rotulo: 'Esvaziar a tabela MAC', ajuda: 'Faz na hora o que o envelhecimento faz sozinho depois de 300 s de silêncio. O switch reaprende com os próximos quadros, inundando enquanto isso.', contexto: ctx, comandos: () => ['limpa mac', 'mostra mac'] },
        { id: 'stp-ver', rotulo: 'Ver o spanning tree', ajuda: 'Quem é a raiz, quanto custa chegar até ela e o papel de cada porta: raiz, designada ou bloqueada.', contexto: ctx, comandos: () => ['mostra stp'] },
        { id: 'stp', rotulo: 'Ligar ou desligar o STP', ajuda: 'O spanning tree desliga portas que fecham laço, para o broadcast não girar para sempre. Sem ele, um laço vira tempestade.', contexto: ctx, campos: [escolha('v', 'STP', [op('on', 'ligado'), op('off', 'desligado')], e.s.stp === false ? 'off' : 'on')], comandos: (v) => [`stp ${v.v}`, 'mostra stp'] },
        { id: 'stp-prioridade', rotulo: 'Prioridade da ponte', ajuda: 'A raiz é o switch com menor prioridade; no empate, o menor MAC. Use múltiplos de 4096. Padrão: 32768.', contexto: ctx, campos: [escolha('n', 'Prioridade', Array.from({ length: 16 }, (_, i) => op(String(i * 4096), i * 4096 === 32768 ? '32768 (padrão)' : String(i * 4096))), String(e.s.prioridade ?? 32768))], comandos: (v) => [`prioridade ${v.n}`, 'mostra stp'] },
        { id: 'vlan-ver', rotulo: 'Ver as VLANs', ajuda: 'Cada porta: de acesso (uma VLAN, sem etiqueta) ou tronco (várias VLANs, com etiqueta 802.1Q).', contexto: ctx, comandos: () => ['mostra vlan'] },
        { id: 'vlan', rotulo: 'Pôr uma porta numa VLAN', ajuda: 'Porta de acesso: o que está ligado nela entra nessa VLAN. Hosts em VLANs diferentes não se falam sem roteador.', contexto: ctx, campos: [escolha('porta', 'Porta', portas), num('id', 'VLAN', undefined, '10')], comandos: (v) => [`vlan ${v.porta} ${v.id}`, 'mostra vlan'] },
        { id: 'tronco', rotulo: 'Fazer uma porta de tronco', ajuda: 'Tronco leva várias VLANs no mesmo cabo, cada quadro com sua etiqueta. Liste as VLANs permitidas (ex.: 1,10,20). "nao" volta a porta para acesso.', contexto: ctx, campos: [escolha('porta', 'Porta', portas), { nome: 'lista', rotulo: 'VLANs permitidas', tipo: 'texto', padrao: '1,10,20' }], comandos: (v) => [`tronco ${v.porta} ${v.lista}`, 'mostra vlan'] },
      );
      if (temQos(m)) {
        a.push(
          { id: 'sw-fluxos', rotulo: 'Ver a tabela de fluxo', ajuda: 'As regras que o controlador SDN instalou neste switch, com os contadores de cada uma.', contexto: ctx, comandos: () => ['mostra fluxos'] },
          { id: 'sw-sdn-regra', rotulo: 'Instalar regra de fluxo no switch', ajuda: 'O controlador instala a regra; o switch só casa e obedece. Aqui valem descartar, reescrever o DSCP e contar; mandar por outra porta que não a do caminho perde o quadro.', contexto: ctx, campos: [num('prio', 'Prioridade', undefined, '100'), { nome: 'casa', rotulo: 'Casamento', tipo: 'texto', padrao: 'proto=icmp' }, { nome: 'acao', rotulo: 'Ação', tipo: 'texto', padrao: 'normal' }], comandos: (v) => [`sdn regra ${v.prio || 100} ${v.casa || '*'} ${v.acao || 'normal'}`, 'mostra fluxos'] },
          { id: 'sw-sdn-telemetria', rotulo: 'Telemetria do controlador', ajuda: 'O controlador consulta os contadores de todas as regras e portas.', contexto: ctx, comandos: () => ['sdn telemetria'] },
        );
      }
      break;
    }
    case 'hub':
      a.push(mostra, { id: 'mac-tabela', rotulo: 'Ver a tabela de endereços MAC', ajuda: 'Hub não tem: repete cada bit para todas as portas. Por isso todo mundo ouve tudo e as colisões são de todos.', contexto: ctx, comandos: () => ['mostra mac'] });
      break;
    case 'canal': {
      const s = e.s.mac;
      a.push(
        { id: 'canal-ver', rotulo: 'Ver o canal', ajuda: 'Protocolo de acesso, número de estações, carga oferecida e se as estações se escutam.', contexto: ctx, comandos: () => ['mostra'] },
        { id: 'canal-protocolo', rotulo: 'Escolher o protocolo de acesso', ajuda: 'Quem fala quando. ALOHA fala quando quer; CSMA escuta antes; CD aborta ao colidir; CA espera um recuo; mapa de bits e bastão nem colidem.', contexto: ctx, campos: [escolha('p', 'Protocolo', Object.entries(PROTOCOLOS_MAC).map(([k, v]) => op(k, v)), s.protocolo)], comandos: (v) => [`protocolo ${v.p}`, 'simular'] },
        { id: 'canal-carga', rotulo: 'Carga e estações', ajuda: 'G é quantos quadros as estações tentam mandar por tempo de quadro, somando todas. G = 1 é tentar ocupar o canal inteiro.', contexto: ctx, campos: [num('g', 'Carga oferecida G', 'quadros por tempo de quadro', String(s.carga)), num('n', 'Estações', undefined, String(s.estacoes))], comandos: (v) => [`carga ${v.g}`, `estacoes ${v.n}`, 'simular'] },
        { id: 'canal-rts', rotulo: 'RTS/CTS e terminal oculto', ajuda: 'Duas estações que não se escutam colidem no ponto de acesso. Com RTS/CTS, o ponto de acesso autoriza em voz alta e todas escutam a autorização.', contexto: ctx, campos: [escolha('ocultas', 'As estações se escutam?', [op('nao', 'sim, se escutam'), op('sim', 'não, são ocultas uma da outra')], s.ocultas ? 'sim' : 'nao'), escolha('rts', 'RTS/CTS', [op('nao', 'desligado'), op('sim', 'ligado')], s.rtsCts ? 'sim' : 'nao')], comandos: (v) => [`ocultas ${v.ocultas}`, `rts-cts ${v.rts}`, 'simular'] },
        { id: 'canal-simular', rotulo: 'Simular o canal', ajuda: 'Calcula a vazão S (quanto do canal vira quadro entregue) e as colisões, mostrando a fórmula usada.', contexto: ctx, comandos: () => ['simular'] },
      );
      break;
    }
    case 'radio':
      a.push({ id: 'mostra', rotulo: 'Ver o enlace de rádio', ajuda: 'RSSI, rumo até o outro rádio e se a zona de Fresnel está livre.', contexto: ctx, comandos: () => ['mostra'] });
      break;
    default:
      a.push(mostra);
  }
  return a;
}

export function acoesEquip(m: Mundo, e: Equipamento): Acao[] {
  const a = acoesConsole(m, e);
  if (e.antena) {
    a.push({
      id: 'antena',
      rotulo: 'Ajustar a antena',
      ajuda: `Azimute em graus (0 é norte, 90 é leste) e altura do mastro em metros. O rumo até o outro lado é ${e.s.rumo ?? '?'}°.`,
      campos: [num('azimute', 'Azimute', '°', String(e.antena.azimute)), num('altura', 'Altura', 'm', String(e.antena.altura))],
      comandos: (v) => [`antena ${e.nome} azimute ${v.azimute}`, `antena ${e.nome} altura ${v.altura}`],
    });
  }
  for (const p of e.portas.filter((x) => x.fisica === 'sfp')) {
    a.push({
      id: `sfp:${p.nome}`,
      rotulo: `Transceptor da ${p.nome}${p.sfp ? ` (agora: ${p.sfp.modelo})` : ' (vazia)'}`,
      ajuda: 'Escolha pelo comprimento de onda, pelo alcance e pela potência. Os dois lados do enlace precisam do mesmo tipo.',
      campos: [escolha('modelo', 'Transceptor', [...Object.values(TRANSCEPTORES).map((t) => op(t.modelo, `${t.modelo}: ${t.descricao} · Tx ${t.txDbm} dBm, sensibilidade ${t.sensDbm} dBm`)), op('nenhum', 'tirar o transceptor')], p.sfp?.modelo)],
      comandos: (v) => [`sfp ${e.nome}:${p.nome} ${v.modelo}`],
    });
    a.push({
      id: `aten:${p.nome}`,
      rotulo: `Atenuador na ${p.nome}${p.atenuadorDb ? ` (agora: ${p.atenuadorDb} dB)` : ''}`,
      ajuda: 'Atenuador fixo na recepção: tira luz de quem está recebendo demais.',
      campos: [escolha('db', 'Atenuação', ['0', '3', '5', '10', '15'].map((x) => op(x, x === '0' ? 'nenhum' : `${x} dB`)), String(p.atenuadorDb ?? 0))],
      comandos: (v) => [`atenuador ${e.nome}:${p.nome} ${v.db}`],
    });
  }
  const livres = e.portas.filter((p) => (p.fisica === 'rj45' || p.fisica === 'sfp') && !caboNaPorta(m, { equip: e.nome, porta: p.nome }));
  const destinos = portasLivres(m, e.nome);
  if (livres.length && destinos.length) {
    a.push({
      id: 'cabo-novo',
      rotulo: 'Passar um cabo novo daqui',
      ajuda: 'Cabo de fábrica, já crimpado em T568B. Cobre vai até 100 m; fibra precisa de porta SFP nas duas pontas.',
      campos: [
        escolha('porta', 'Porta daqui', livres.map((p) => op(p.nome))),
        escolha('destino', 'Até', destinos),
        escolha('meio', 'Cabo', [op('cat6', 'Cat6'), op('cat5e', 'Cat5e'), op('cat6a', 'Cat6a'), op('fibra', 'fibra monomodo')]),
        num('metros', 'Comprimento', 'm', '10'),
      ],
      comandos: (v) => [`ligar ${e.nome}:${v.porta} ${v.destino} ${v.meio} ${v.metros}`],
    });
  }
  a.push({ id: 'console', rotulo: 'Abrir o console (digitar)', ajuda: 'Para quem quer digitar os comandos direto no aparelho.', contexto: e.nome, abreConsole: true, comandos: () => [] });
  const religar: Acao = { id: 'religar', rotulo: 'Religar (tirar da tomada)', ajuda: 'Desliga e liga de novo. Zera os contadores. Às vezes resolve, quase sempre não.', comandos: () => [`religar ${e.nome}`] };
  if (e.tipo === 'roteador' && e.s.estado === 'ligado' && e.s.senhaRunning && !e.s.logado) {
    religar.rotulo = 'Religar (para interromper o boot)';
    religar.ajuda = 'Sem senha, o caminho é o boot: tire da tomada, ligue de novo e interrompa o carregamento logo em seguida.';
    a.unshift(religar);
  } else a.push(religar);
  return a;
}

/* ---------- Cabos ---------- */

export function acoesCabo(m: Mundo, c: Cabo): Acao[] {
  const a: Acao[] = [{ id: 'detalhes', rotulo: 'Ver detalhes do enlace', ajuda: 'Estado, perdas, margem de sinal e o motivo de estar fora.', comandos: () => [`cabo ${c.id}`] }];
  if (COBRE.includes(c.meio)) {
    a.push(
      { id: 'testar', rotulo: 'Testador de continuidade', ajuda: 'Mostra qual pino de uma ponta chega em qual pino da outra (wiremap). Não mede diafonia.', comandos: () => [`testar ${c.id}`] },
      { id: 'certificar', rotulo: 'Certificador', ajuda: 'Mede comprimento, diafonia (NEXT) e margem de sinal, e dá o veredito.', comandos: () => [`certificar ${c.id}`] },
      {
        id: 'crimpar',
        rotulo: 'Crimpar de novo uma ponta',
        ajuda: 'Corta o conector e crimpa outro. Clique nos fios na ordem do pino 1 ao 8. T568B: branco-laranja, laranja, branco-verde, azul, branco-azul, verde, branco-marrom, marrom. T568A troca laranja com verde.',
        campos: [escolha('ponta', 'Ponta', [op('a', `ponta a (${c.a.equip})`), op('b', `ponta b (${c.b.equip})`)]), { nome: 'cores', rotulo: 'Ordem dos fios', tipo: 'cores' }],
        comandos: (v) => [`crimpar ${c.id} ${v.ponta} ${v.cores}`, `testar ${c.id}`],
      },
      { id: 'trocar', rotulo: 'Trocar o cabo por outro', ajuda: 'Mesmo caminho, outra categoria. Cat5e leva 1 Gb/s, Cat6 leva 10 Gb/s até 55 m, Cat6a leva 10 Gb/s até 100 m. Blindado precisa ser aterrado.', campos: [escolha('meio', 'Categoria', COBRE.map((x) => op(x, x.toUpperCase())), c.meio), escolha('blindado', 'Blindagem', [op('nao', 'sem blindagem (UTP)'), op('sim', 'blindado (F/UTP)')])], comandos: (v) => [`trocar ${c.id} ${v.meio}${v.blindado === 'sim' ? ' blindado' : ''}`] },
    );
    if (c.ruidoDb) a.push({ id: 'afastar', rotulo: 'Refazer a rota longe do ruído', ajuda: 'Passa o cabo por outra eletrocalha, longe da fonte de interferência.', comandos: () => [`afastar ${c.id}`] });
    if (c.blindado) a.push({ id: 'aterrar', rotulo: 'Aterrar a blindagem', ajuda: 'Liga a malha do cabo ao terra do rack. Sem isso, a blindagem vira antena.', comandos: () => [`aterrar ${c.id}`] });
  }
  if (c.meio === 'fibra') {
    a.push(
      { id: 'luz', rotulo: 'Medidor de potência óptica', ajuda: 'Quanto de luz chega em cada ponta, em dBm, e a conta das perdas.', comandos: () => [`luz ${c.id}`] },
      { id: 'otdr', rotulo: 'OTDR', ajuda: 'Manda um pulso e mede os ecos: mostra conectores, emendas e onde a fibra acaba.', comandos: () => [`otdr ${c.id}`] },
      { id: 'segmentos', rotulo: 'Ver os trechos da fibra', ajuda: 'Cordões e tronco, com tipo e cor de cada um.', comandos: () => [`segmento ${c.id}`] },
    );
    const trocaveis = (c.segmentos ?? []).map((s, i) => ({ s, i })).filter((x) => x.s.nome !== 'tronco');
    if (trocaveis.length) {
      a.push({
        id: 'segmento',
        rotulo: 'Trocar um cordão',
        ajuda: 'OS2 é monomodo amarelo (9 µm). OM1 é laranja (62,5 µm), OM3 aqua e OM4 violeta (50 µm). O cordão tem que ser do mesmo tipo do tronco.',
        campos: [escolha('n', 'Cordão', trocaveis.map((x) => op(String(x.i + 1), `${x.s.nome} (agora ${x.s.fibra.toUpperCase()})`))), escolha('fibra', 'Novo tipo', ['os2', 'om1', 'om3', 'om4'].map((x) => op(x, x.toUpperCase())))],
        comandos: (v) => [`segmento ${c.id} ${v.n} ${v.fibra}`],
      });
    }
    if (c.ruptura !== undefined || m.flags.clivagens) {
      a.push(
        { id: 'clivar', rotulo: 'Clivar a fibra', ajuda: 'Corta a ponta na clivadora e mede o ângulo. Acima de 1° a emenda sai ruim: clive de novo.', comandos: () => ['clivar'], proxima: 'fundir' },
        { id: 'fundir', rotulo: 'Fundir no ponto rompido', ajuda: 'Emenda por fusão no ponto que o OTDR mostrou, usando a última clivagem.', campos: [num('metros', 'Distância do rompimento', 'm')], comandos: (v) => [`fundir ${c.id} ${v.metros}`] },
      );
    }
    if (c.emendas?.length) a.push({ id: 'cortar', rotulo: 'Desfazer uma emenda', ajuda: 'Corta a emenda para refazer com uma clivagem melhor.', campos: [escolha('metros', 'Emenda', c.emendas.map((x) => op(String(x.metros), `a ${x.metros} m (${x.perdaDb} dB)`)))], comandos: (v) => [`cortar ${c.id} ${v.metros}`] });
  }
  if (c.coax) {
    const els = c.coax.elementos.map((e, i) => ({ e, i }));
    const nome = (e: (typeof els)[0]['e']) => (e.tipo === 'cabo' ? `cabo ${e.modelo?.toUpperCase()} ${e.metros} m` : e.tipo === 'splitter' ? `divisor de ${e.vias} vias` : e.tipo === 'conector' ? `conector${e.oxidado ? ' oxidado' : ''}` : `${e.tipo} ${e.db} dB`);
    a.push({ id: 'coax-ver', rotulo: 'Ver a descida coaxial', ajuda: 'Cada peça do caminho e o nível de sinal depois dela.', comandos: () => [`coax ${c.id}`] });
    const removiveis = els.filter((x) => x.e.tipo !== 'cabo');
    if (removiveis.length) a.push({ id: 'coax-remover', rotulo: 'Tirar uma peça', ajuda: 'Remove divisor, atenuador ou amplificador do caminho.', campos: [escolha('n', 'Peça', removiveis.map((x) => op(String(x.i + 1), `${nome(x.e)} (-${perdaElemento(x.e).toFixed(1)} dB)`)))], comandos: (v) => [`coax ${c.id} remover ${v.n}`, `coax ${c.id}`] });
    a.push({
      id: 'coax-trocar',
      rotulo: 'Trocar uma peça',
      ajuda: 'RG6 perde menos que RG59. Conector oxidado perde 6 dB e ainda põe ruído.',
      campos: [escolha('n', 'Peça', els.map((x) => op(String(x.i + 1), nome(x.e)))), escolha('nova', 'Por', [op('rg6', 'cabo RG6'), op('rg59', 'cabo RG59'), op('conector', 'conector novo'), op('splitter2', 'divisor de 2 vias'), op('splitter4', 'divisor de 4 vias')])],
      comandos: (v) => [`coax ${c.id} trocar ${v.n} ${v.nova}`, `coax ${c.id}`],
    });
    a.push({ id: 'coax-atenuador', rotulo: 'Pôr um atenuador', ajuda: 'Para quando chega sinal demais (acima de +15 dBmV).', campos: [escolha('db', 'Atenuação', ['3', '6', '10'].map((x) => op(x, `${x} dB`)))], comandos: (v) => [`coax ${c.id} inserir 1 atenuador ${v.db}`, `coax ${c.id}`] });
  }
  if (c.sat) a.push({ id: 'orbita', rotulo: 'Trocar o terminal de satélite', ajuda: 'Geoestacionário a 35.786 km, órbita média a 8.062 km, órbita baixa a 550 km.', campos: [escolha('orbita', 'Órbita', [op('geo', 'geoestacionária'), op('meo', 'média'), op('leo', 'baixa')], c.sat.orbita)], comandos: (v) => [`orbita ${c.id} ${v.orbita}`] });
  if (COBRE.includes(c.meio) || c.meio === 'fibra') {
    const destinos = portasLivres(m);
    if (destinos.length) a.push({ id: 'mover', rotulo: 'Mudar uma ponta de porta', ajuda: 'Desencaixa uma ponta e encaixa em outra porta livre.', campos: [escolha('ponta', 'Ponta', [op('a', `ponta a (${c.a.equip}:${c.a.porta})`), op('b', `ponta b (${c.b.equip}:${c.b.porta})`)]), escolha('destino', 'Para', destinos)], comandos: (v) => [`mover ${c.id} ${v.ponta} ${v.destino}`] });
    a.push({ id: 'desligar', rotulo: 'Tirar o cabo', ajuda: 'Desconecta e recolhe o cabo.', comandos: () => [`desligar ${c.id}`] });
  }
  return a;
}

/* ---------- Almoxarifado ---------- */

export function acoesAlmox(m: Mundo): Acao[] {
  const itens = Object.entries(m.catalogo);
  if (!itens.length) return [];
  return [
    {
      id: 'instalar',
      rotulo: 'Pegar e instalar um equipamento',
      ajuda: 'Escolha o equipamento e dê um nome. Depois passe os cabos a partir dele.',
      campos: [escolha('modelo', 'Equipamento', itens.map(([k, v]) => op(k, `${k}: ${v.descricao}`))), { nome: 'nome', rotulo: 'Nome', tipo: 'texto', padrao: 'sw-meio' }],
      comandos: (v) => [`instalar ${v.modelo} ${v.nome}`],
    },
  ];
}

export function acoesDo(m: Mundo, tipo: TipoAlvo, id: string): Acao[] {
  if (tipo === 'almox') return acoesAlmox(m);
  if (tipo === 'equip') {
    const e = m.equipamentos.get(id);
    return e ? acoesEquip(m, e) : [];
  }
  const c = m.cabos.get(id);
  return c ? acoesCabo(m, c) : [];
}

/** Valores iniciais do formulário. */
export function padroes(acao: Acao): Record<string, string> {
  const v: Record<string, string> = {};
  for (const c of acao.campos ?? []) v[c.nome] = c.padrao ?? '';
  return v;
}

/** Roda a ação no terminal, entrando ou saindo de console quando precisa. Devolve o que foi digitado e a saída. */
export function executarAcao(t: Terminal, acao: Acao, valores: Record<string, string>): { comando: string; prompt: string; saida: string[] }[] {
  const feito: { comando: string; prompt: string; saida: string[] }[] = [];
  const rodar = (cmd: string) => {
    const prompt = t.prompt();
    feito.push({ comando: cmd, prompt, saida: t.executar(cmd) });
  };
  if (acao.contexto) {
    if (t.contexto !== acao.contexto) {
      if (t.contexto) rodar('sair');
      rodar(`console ${acao.contexto}`);
    }
  } else if (t.contexto) rodar('sair');
  for (const cmd of acao.comandos(valores)) rodar(cmd);
  return feito;
}
