// Ações com as mãos: o que dá para fazer com cada coisa da sala, sem digitar.
// Cada ação vira os mesmos comandos do terminal, que aparecem lá para quem quiser aprender a sintaxe.

import { BITS_POR_SIMBOLO } from './aparelhos';
import type { Terminal } from './cli';
import { perdaElemento } from './fisico';
import { caboNaPorta, TRANSCEPTORES, type Cabo, type Equipamento, type Mundo } from './mundo';
import { ipTexto } from './util';

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
