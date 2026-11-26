// Terminal do jogo: comandos de campo, de bancada e o console de cada equipamento.

import type { Dia } from '../conteudo/tipos';
import { avaliarE1, avaliarModem, BITS_POR_SIMBOLO, snrWifi, type UsoSlot } from './aparelhos';
import { avaliar, coaxDados, CORES, lerCor, ORBITAS, perdaElemento, radioDados, wiremap, type Cor } from './fisico';
import { acharPorta, adicionar, caboNaPorta, lerPonta, ligar, TRANSCEPTORES, type Cabo, type Captura, type ElementoCoax, type Equipamento, type Fibra, type Meio, type Mundo } from './mundo';
import { calcularStp, ehTronco, emTempestade, idPonte, limparTabelas, ping, prioridade, stpLigado, tabelaMac, vazao, type PapelPorta } from './rede';
import { PROTOCOLOS_MAC, simularCanal, type EstadoMac, type ProtocoloMac } from './mac';
import { simularArq, type ConfigArq, type Linha } from './arq';
import { amostraDaLinha, hex, transmitir, type ConfigEnlace } from './enlace';
import { fmt, ipTexto, lerCidr, lerIp, lerNumero, rngSemente, type Cidr } from './util';
import { abreviarIpv6, agregar, dividir, ehDocumentacao, ehEnlaceLocal, ehPrivado, enderecoBroadcast, enderecoEui64, enderecoRede, enlaceLocal, eui64, expandirIpv6, infoSubrede, pertence, prefixoIpv6, quantidadeHosts, superrede, textoCidr } from './ip';
import { comandoGrupo, comandosRoteamento } from './cliRotas';
import { comandosQos, temQos } from './cliQos';
import { AJUDA_TRANSPORTE, comandosTransporte, temTransporte } from './cliTransporte';
import { NOMES_ECN } from './qos';
import { recalcularProtocolos, temProtocolos } from './protocolos';
import { configurarDhcp, configurarNat, interfacesL3, ipv6De, MTU_PADRAO, nat, pedirDhcp, ping6, rotasDe, temCamadaRede, textoTempo, traceroute, type OpcoesPing, type Rota, type ServidorDhcp } from './roteamento';

type Saida = string[];

interface Comando {
  uso: string;
  descricao: string;
  grupo: 'geral' | 'campo' | 'bancada';
  rodar: (t: Terminal, args: string[]) => Saida;
}

const MEIOS_COBRE: Meio[] = ['cat5e', 'cat6', 'cat6a'];

function estadoTexto(m: Mundo, c: Cabo): string {
  const e = avaliar(m, c);
  return e.up ? `ATIVO, ${e.velocidade >= 1000 ? e.velocidade / 1000 + ' Gb/s' : e.velocidade + ' Mb/s'}` : `FORA: ${e.motivos[0]}`;
}

function descreverCabo(c: Cabo): string {
  const extra: string[] = [];
  if (c.blindado) extra.push(c.aterrado ? 'blindado e aterrado' : 'blindado, sem aterramento');
  if (c.afastado) extra.push('afastado da fonte de ruído');
  return `${c.id}: ${c.a.equip}:${c.a.porta} ⇄ ${c.b.equip}:${c.b.porta}, ${c.meio.toUpperCase()}, ${c.metros} m${extra.length ? ' (' + extra.join(', ') + ')' : ''}`;
}

function pegarCabo(m: Mundo, id: string | undefined): Cabo | string {
  if (!id) return 'Qual cabo? Os nomes estão no "mapa".';
  return m.cabos.get(id) ?? `Não existe cabo "${id}". Veja no "mapa".`;
}

function listaSlots(txt: string): number[] | null {
  const out: number[] = [];
  for (const parte of txt.split(',')) {
    const [a, b] = parte.split('-').map(Number);
    if (a === undefined || !Number.isInteger(a)) return null;
    const fim = b === undefined ? a : b;
    if (!Number.isInteger(fim) || fim < a) return null;
    for (let i = a; i <= fim; i++) out.push(i);
  }
  return out.every((n) => n >= 0 && n <= 31) ? out : null;
}

/* ---------------- Comandos de campo e bancada ---------------- */

const CAMPO: Record<string, Comando> = {
  ajuda: {
    uso: 'ajuda',
    descricao: 'lista os comandos (também funciona com "?")',
    grupo: 'geral',
    rodar: (t) => t.ajuda(),
  },
  chamado: { uso: 'chamado', descricao: 'relê o chamado do dia', grupo: 'geral', rodar: (t) => t.dia.chamado },
  manual: {
    uso: 'manual',
    descricao: 'abre o manual de bolso do dia',
    grupo: 'geral',
    rodar: (t) => [`== ${t.dia.manual.titulo} ==`, ...t.dia.manual.texto],
  },
  dica: {
    uso: 'dica',
    descricao: 'mostra a próxima dica (elas ficam cada vez mais diretas)',
    grupo: 'geral',
    rodar: (t) => {
      const d = t.dia.dicas[t.dicasVistas];
      if (!d) return ['Acabaram as dicas. A partir daqui é você, o manual e a física.'];
      t.dicasVistas++;
      return [`Dica ${t.dicasVistas} de ${t.dia.dicas.length}: ${d}`];
    },
  },
  objetivo: {
    uso: 'objetivo',
    descricao: 'confere o que falta para fechar o chamado',
    grupo: 'geral',
    rodar: (t) => {
      const itens = t.dia.objetivo(t.mundo);
      const linhas = itens.map((i) => `${i.ok ? '[x]' : '[ ]'} ${i.texto}${i.detalhe ? ` (${i.detalhe})` : ''}`);
      if (itens.every((i) => i.ok)) {
        t.resolvido = true;
        linhas.push('', 'CHAMADO FECHADO. Leia o pós-morte com "posmorte".');
      }
      return linhas;
    },
  },
  posmorte: {
    uso: 'posmorte',
    descricao: 'explica o que aconteceu (só depois de fechar o chamado)',
    grupo: 'geral',
    rodar: (t) => (t.resolvido ? ['== Pós-morte ==', ...t.dia.posMorte] : ['Pós-morte é depois do óbito. Feche o chamado primeiro.']),
  },
  perguntas: {
    uso: 'perguntas',
    descricao: 'lista as perguntas do chamado',
    grupo: 'geral',
    rodar: (t) => {
      const ps = t.dia.perguntas ?? [];
      if (!ps.length) return ['Hoje ninguém quer saber sua opinião. Só que funcione.'];
      return ps.map((p) => `${p.id}) ${p.texto}${t.mundo.respostas[p.id] !== undefined ? `  [respondida: ${t.mundo.respostas[p.id]}]` : ''}`);
    },
  },
  responder: {
    uso: 'responder <n> <valor>',
    descricao: 'responde uma pergunta do chamado',
    grupo: 'geral',
    rodar: (t, [id, ...resto]) => {
      const p = (t.dia.perguntas ?? []).find((x) => x.id === id);
      if (!p) return ['Pergunta inexistente. Veja "perguntas".'];
      const valor = resto.join(' ');
      if (!valor) return ['Responder com silêncio é estratégia de reunião, não de rede.'];
      t.mundo.respostas[p.id] = valor;
      return [`Resposta ${p.id} anotada: ${valor}. O "objetivo" diz se está certa.`];
    },
  },
  mapa: {
    uso: 'mapa',
    descricao: 'mostra equipamentos e cabos com o estado de cada enlace',
    grupo: 'campo',
    rodar: (t) => {
      const m = t.mundo;
      const linhas = ['EQUIPAMENTOS'];
      for (const e of m.equipamentos.values()) {
        linhas.push(`  ${e.nome} (${e.modelo})${e.ip ? ' ' + ipTexto(e.ip.endereco) + '/' + e.ip.prefixo : ''}: portas ${e.portas.map((p) => p.nome).join(', ')}`);
      }
      linhas.push('CABOS E ENLACES');
      if (!m.cabos.size) linhas.push('  nenhum. Silêncio absoluto.');
      for (const c of m.cabos.values()) {
        linhas.push(`  ${descreverCabo(c)}`);
        linhas.push(`      ${estadoTexto(m, c)}${c.nota ? '  // ' + c.nota : ''}`);
      }
      return linhas;
    },
  },
  cabo: {
    uso: 'cabo <id>',
    descricao: 'detalha um cabo ou enlace: perdas, margem, motivo',
    grupo: 'campo',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      const e = avaliar(t.mundo, c);
      return [descreverCabo(c), `estado: ${estadoTexto(t.mundo, c)}`, ...e.info.map((i) => `  ${i}`), ...(e.up ? [`  taxa de erro de bit estimada: ${e.ber.toExponential(0)}`] : [])];
    },
  },
  console: {
    uso: 'console <equipamento>',
    descricao: 'pluga o cabo de console e abre o terminal do aparelho',
    grupo: 'campo',
    rodar: (t, [nome]) => t.abrirConsole(nome),
  },
  religar: {
    uso: 'religar <equipamento>',
    descricao: 'tira da tomada e põe de volta (o clássico)',
    grupo: 'campo',
    rodar: (t, [nome]) => {
      const e = t.mundo.equipamentos.get(nome ?? '');
      if (!e) return ['Religar o quê? Até o disjuntor tem nome.'];
      e.s.logado = false;
      for (const p of e.portas) p.contadores = { tx: 0, rx: 0, crc: 0 };
      if (e.tipo === 'roteador') {
        e.s.estado = 'boot';
        return [`${e.nome} desligado. Ventoinha parou. Silêncio constrangedor.`, `${e.nome} ligado. Está carregando o sistema; o console aceita interrupção nos primeiros segundos.`];
      }
      return [`${e.nome} reiniciado. Contadores zerados. O problema, provavelmente, não.`];
    },
  },
  ligar: {
    uso: 'ligar <eq:porta> <eq:porta> <meio> <metros>',
    descricao: 'passa um cabo novo (cat5e, cat6, cat6a ou fibra), já crimpado de fábrica',
    grupo: 'campo',
    rodar: (t, [pa, pb, meio, metros]) => {
      const m = t.mundo;
      const a = lerPonta(m, pa ?? '');
      if (typeof a === 'string') return [a];
      const b = lerPonta(m, pb ?? '');
      if (typeof b === 'string') return [b];
      if (!meio || ![...MEIOS_COBRE, 'fibra'].includes(meio)) return ['Meio: cat5e, cat6, cat6a ou fibra. Barbante não conta.'];
      const n = lerNumero(metros ?? '');
      if (!n || n <= 0) return ['Quantos metros? Cabo de zero metro é só um conector com ansiedade.'];
      for (const p of [a, b]) {
        const ocupado = caboNaPorta(m, p);
        if (ocupado) return [`${p.equip}:${p.porta} já tem o cabo ${ocupado.id}. Use "desligar ${ocupado.id}" antes.`];
        const porta = acharPorta(m, p);
        if (meio === 'fibra' && porta.fisica !== 'sfp') return [`${p.equip}:${p.porta} é RJ45. Fibra entra em porta SFP.`];
        if (meio !== 'fibra' && porta.fisica !== 'rj45') return [`${p.equip}:${p.porta} não é RJ45.`];
      }
      const c = ligar(m, a, b, meio as Meio, n);
      return [`Cabo ${c.id} passado: ${descreverCabo(c)}.`, `Estado: ${estadoTexto(m, c)}`];
    },
  },
  desligar: {
    uso: 'desligar <cabo>',
    descricao: 'tira um cabo',
    grupo: 'campo',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      t.mundo.cabos.delete(c.id);
      return [`Cabo ${c.id} retirado. Guardado no bolso, junto com os outros 40.`];
    },
  },
  mover: {
    uso: 'mover <cabo> <a|b> <eq:porta>',
    descricao: 'muda uma ponta do cabo de porta',
    grupo: 'campo',
    rodar: (t, [id, ponta, destino]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (ponta !== 'a' && ponta !== 'b') return ['Ponta "a" ou "b".'];
      const p = lerPonta(t.mundo, destino ?? '');
      if (typeof p === 'string') return [p];
      const ocupado = caboNaPorta(t.mundo, p);
      if (ocupado && ocupado !== c) return [`${p.equip}:${p.porta} já tem o cabo ${ocupado.id}.`];
      c[ponta] = p;
      return [`Ponta ${ponta} do ${c.id} agora em ${p.equip}:${p.porta}.`, `Estado: ${estadoTexto(t.mundo, c)}`];
    },
  },
  instalar: {
    uso: 'instalar <modelo> <nome>',
    descricao: 'instala um equipamento do almoxarifado (sem modelo, lista o estoque)',
    grupo: 'campo',
    rodar: (t, [modelo, nome]) => {
      const cat = t.mundo.catalogo;
      if (!modelo) {
        const itens = Object.entries(cat);
        if (!itens.length) return ['Almoxarifado vazio. Tem uma caixa escrita "não mexer" e é só isso.'];
        return ['ALMOXARIFADO', ...itens.map(([k, v]) => `  ${k}: ${v.descricao}`)];
      }
      const item = cat[modelo];
      if (!item) return [`Não tem "${modelo}" no almoxarifado. Digite "instalar" para ver o estoque.`];
      if (!nome) return ['Dê um nome ao aparelho. Etiqueta é amor.'];
      if (t.mundo.equipamentos.has(nome)) return [`Já existe ${nome}.`];
      const e = item.criar(nome);
      adicionar(t.mundo, e);
      return [`${nome} instalado (${e.modelo}). Portas: ${e.portas.map((p) => p.nome).join(', ')}.`];
    },
  },
  trocar: {
    uso: 'trocar <cabo> <cat5e|cat6|cat6a> [blindado]',
    descricao: 'troca o cabo de cobre por outro, no mesmo caminho',
    grupo: 'campo',
    rodar: (t, [id, meio, blind]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!MEIOS_COBRE.includes(c.meio)) return ['Só troco cabo de cobre por cobre. Para fibra use "segmento".'];
      if (!meio || !MEIOS_COBRE.includes(meio as Meio)) return ['Para qual categoria? cat5e, cat6 ou cat6a.'];
      c.meio = meio as Meio;
      c.blindado = blind === 'blindado';
      c.aterrado = false;
      return [`${c.id} agora é ${meio.toUpperCase()}${c.blindado ? ' blindado (F/UTP). Lembre que blindagem sem aterramento vira antena' : ''}.`, `Estado: ${estadoTexto(t.mundo, c)}`];
    },
  },
  aterrar: {
    uso: 'aterrar <cabo>',
    descricao: 'liga a blindagem do cabo ao terra do rack',
    grupo: 'bancada',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!c.blindado) return ['Esse cabo não tem blindagem. Aterrar UTP é só amarrar um fio verde nele, por estética.'];
      c.aterrado = true;
      return [`Blindagem do ${c.id} aterrada no barramento do rack.`, `Estado: ${estadoTexto(t.mundo, c)}`];
    },
  },
  afastar: {
    uso: 'afastar <cabo>',
    descricao: 'refaz a rota do cabo longe da fonte de ruído',
    grupo: 'bancada',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!c.ruidoDb) return ['Esse cabo não passa perto de nada barulhento. Deixa ele em paz.'];
      c.afastado = true;
      return [`${c.id} refeito por outra eletrocalha, a 1 m do motor. Cruzando a fonte em 90°, como manda a boa prática.`, `Estado: ${estadoTexto(t.mundo, c)}`];
    },
  },
  crimpar: {
    uso: 'crimpar <cabo> <a|b> <8 cores na ordem dos pinos>',
    descricao: 'corta o conector e crimpa de novo. Cores: bl l bv v baz az bm m',
    grupo: 'bancada',
    rodar: (t, [id, ponta, ...cores]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!MEIOS_COBRE.includes(c.meio)) return ['Crimpar fibra? Coragem. Use "fundir".'];
      if (ponta !== 'a' && ponta !== 'b') return ['Ponta "a" ou "b".'];
      if (cores.length !== 8) return [`São 8 fios, do pino 1 ao 8. Você mandou ${cores.length}.`, `Cores aceitas: ${CORES.join(', ')} (ou bl l bv v baz az bm m).`];
      const lidas = cores.map(lerCor);
      const ruim = cores.find((_, i) => !lidas[i]);
      if (ruim) return [`Não conheço a cor "${ruim}". Daltonismo de crimpador é real, mas aqui são 8 cores.`];
      const pinos = lidas as Cor[];
      if (ponta === 'a') c.pinosA = pinos;
      else c.pinosB = pinos;
      c.metros = Math.max(0.5, c.metros - 0.05);
      return [`Ponta ${ponta} do ${c.id} crimpada: ${pinos.join(' ')}.`, 'Clique! Perdeu 5 cm de cabo. Faz parte.'];
    },
  },
  testar: {
    uso: 'testar <cabo>',
    descricao: 'testador de continuidade (wiremap): mostra qual pino chega em qual',
    grupo: 'bancada',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!c.pinosA || !c.pinosB) return ['Testador de RJ45 em cabo que não é RJ45. Ele piscou de pena.'];
      const w = wiremap(c.pinosA, c.pinosB);
      const linhas = ['WIREMAP  pino A → pino B'];
      w.mapa.forEach((v, i) => linhas.push(`  ${i + 1} → ${v === null ? 'ABERTO' : v + 1}   (${c.pinosA![i] ?? 'vazio'})`));
      linhas.push(`Resultado: ${w.abertos.length ? 'fio aberto' : w.tipo === 'direto' ? 'cabo direto' : w.tipo === 'trocado' ? 'PARES TROCADOS' : 'cabo ' + w.tipo}`);
      linhas.push('(Testador de continuidade não mede diafonia. Para isso existe o "certificar".)');
      return linhas;
    },
  },
  certificar: {
    uso: 'certificar <cabo>',
    descricao: 'certificador: comprimento, atenuação, diafonia (NEXT) e veredito',
    grupo: 'bancada',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!c.pinosA || !c.pinosB) return ['O certificador é de par trançado.'];
      const w = wiremap(c.pinosA, c.pinosB);
      const e = avaliar(t.mundo, c);
      const comprimento = c.metros <= 100;
      const next = !w.parDividido;
      const linhas = [
        `Comprimento: ${c.metros} m ${comprimento ? 'PASSA' : 'FALHA (limite do canal: 100 m)'}`,
        `Wiremap: ${w.abertos.length || w.tipo === 'trocado' || w.tipo === 'invertido' ? 'FALHA' : 'PASSA'}`,
        `Diafonia (NEXT): ${next ? 'PASSA' : 'FALHA: par dividido, os fios dos pinos 3 e 6 não são do mesmo par'}`,
        `Margem de sinal: ${e.up ? fmt(e.margemDb, 1) + ' dB' : 'sem enlace'}`,
      ];
      linhas.push(`VEREDITO: ${comprimento && next && e.up && e.margemDb >= 6 ? 'CERTIFICADO' : 'REPROVADO'}`);
      return linhas;
    },
  },
  sfp: {
    uso: 'sfp <eq:porta> <modelo|nenhum>',
    descricao: 'encaixa ou tira um transceptor óptico (sem modelo, lista a gaveta)',
    grupo: 'bancada',
    rodar: (t, [ponta, modelo]) => {
      if (!ponta) return ['GAVETA DE TRANSCEPTORES', ...Object.values(TRANSCEPTORES).map((x) => `  ${x.modelo}: ${x.descricao}. Tx ${x.txDbm} dBm, sensibilidade ${x.sensDbm} dBm, saturação ${x.saturaDbm} dBm`)];
      const p = lerPonta(t.mundo, ponta);
      if (typeof p === 'string') return [p];
      const porta = acharPorta(t.mundo, p);
      if (porta.fisica !== 'sfp') return ['Essa porta não é SFP. Não force, não é Tetris.'];
      if (modelo === 'nenhum') {
        porta.sfp = undefined;
        return [`Transceptor retirado de ${ponta}. Tampinha antipoeira colocada, pela primeira vez na história desta empresa.`];
      }
      const x = TRANSCEPTORES[modelo ?? ''];
      if (!x) return ['Modelo desconhecido. Digite "sfp" para ver a gaveta.'];
      porta.sfp = { ...x };
      const c = caboNaPorta(t.mundo, p);
      return [`${x.modelo} encaixado em ${ponta}.`, ...(c ? [`${c.id}: ${estadoTexto(t.mundo, c)}`] : [])];
    },
  },
  atenuador: {
    uso: 'atenuador <eq:porta> <dB>',
    descricao: 'coloca um atenuador óptico fixo na recepção da porta (0 tira)',
    grupo: 'bancada',
    rodar: (t, [ponta, valor]) => {
      const p = lerPonta(t.mundo, ponta ?? '');
      if (typeof p === 'string') return [p];
      const porta = acharPorta(t.mundo, p);
      const v = lerNumero(valor ?? '');
      if (porta.fisica !== 'sfp') return ['Atenuador óptico vai em porta óptica.'];
      if (v === null || ![0, 3, 5, 10, 15].includes(v)) return ['Atenuadores na gaveta: 3, 5, 10 e 15 dB (0 para tirar).'];
      porta.atenuadorDb = v;
      const c = caboNaPorta(t.mundo, p);
      return [v ? `Atenuador de ${v} dB em ${ponta}. Óculos escuros para o receptor.` : `Atenuador retirado de ${ponta}.`, ...(c ? [`${c.id}: ${estadoTexto(t.mundo, c)}`] : [])];
    },
  },
  luz: {
    uso: 'luz <cabo>',
    descricao: 'medidor de potência óptica nas duas pontas',
    grupo: 'bancada',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (c.meio !== 'fibra') return ['Medidor de potência óptica em cobre mede só a sua paciência.'];
      const e = avaliar(t.mundo, c);
      if (c.ruptura !== undefined) return ['Recepção: -∞ dBm nas duas pontas. Tem coisa errada no caminho. OTDR nele.'];
      if (e.dados.rxA === undefined) return [`Sem leitura: ${e.motivos[0]}`];
      return [`${c.a.equip}:${c.a.porta} recebe ${fmt(e.dados.rxA, 1)} dBm`, `${c.b.equip}:${c.b.porta} recebe ${fmt(e.dados.rxB!, 1)} dBm`, ...e.info.map((i) => `  ${i}`)];
    },
  },
  otdr: {
    uso: 'otdr <cabo>',
    descricao: 'reflectômetro óptico: manda pulso e mede os ecos ao longo da fibra',
    grupo: 'bancada',
    rodar: (t, [id]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (c.meio !== 'fibra') return ['OTDR é para fibra.'];
      const total = (c.segmentos ?? []).reduce((s, x) => s + x.metros, 0);
      const eventos: [number, string][] = [[0, 'conector de saída (reflexivo)']];
      for (const e of c.emendas ?? []) eventos.push([e.metros, `emenda por fusão, perda ${fmt(e.perdaDb, 2)} dB (não reflexiva)`]);
      if (c.ruptura !== undefined) eventos.push([c.ruptura, 'FIM DA FIBRA: pico reflexivo forte e depois só ruído']);
      else eventos.push([total, 'conector de chegada (reflexivo), fim do enlace']);
      eventos.sort((a, b) => a[0] - b[0]);
      return [`OTDR em ${c.id}, pulso de 10 ns a 1310 nm, índice de grupo 1,468`, ...eventos.map(([d, txt]) => `  ${String(d).padStart(6)} m  ${txt}`), 'Distância = (velocidade da luz ÷ índice) × tempo do eco ÷ 2.'];
    },
  },
  clivar: {
    uso: 'clivar',
    descricao: 'corta a ponta da fibra na clivadora e mede o ângulo do corte',
    grupo: 'bancada',
    rodar: (t) => {
      const fila: number[] = t.mundo.flags.clivagens ?? [];
      const angulo = fila.length ? fila.shift()! : 0.3 + t.mundo.rng() * 0.5;
      t.mundo.flags.clivagens = fila;
      t.mundo.flags.ultimoAngulo = angulo;
      return [`Clivagem feita. Ângulo do corte: ${fmt(angulo, 1)}°.`, angulo > 1 ? 'Torto. Acima de 1° a fusão sai com perda alta. Clive de novo.' : 'Corte limpo, espelhado. Pode fundir.'];
    },
  },
  fundir: {
    uso: 'fundir <cabo> <metros>',
    descricao: 'emenda a fibra rompida no ponto indicado, com a última clivagem',
    grupo: 'bancada',
    rodar: (t, [id, metros]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      const d = lerNumero(metros ?? '');
      if (c.ruptura === undefined) return ['Essa fibra não está rompida. Fundir fibra boa é criar problema com arte.'];
      if (d === null || Math.abs(d - c.ruptura) > 10) return [`Você abriu a caixa de emenda a ${metros ?? '?'} m e a fibra ali está inteira. Sobe e desce de escada de graça.`];
      const ang = t.mundo.flags.ultimoAngulo;
      if (ang === undefined) return ['Sem clivar não tem fusão. Use "clivar" primeiro.'];
      const perda = 0.02 + 0.12 * ang;
      c.emendas = [...(c.emendas ?? []), { metros: c.ruptura, perdaDb: Math.round(perda * 100) / 100 }];
      c.ruptura = undefined;
      t.mundo.flags.ultimoAngulo = undefined;
      return [`Arco elétrico! Fusão feita a ${d} m. Perda estimada da emenda: ${fmt(perda, 2)} dB.`, perda > 0.1 ? 'Passou de 0,1 dB. Dá para "cortar" e refazer.' : 'Emenda dentro do padrão.', `Estado: ${estadoTexto(t.mundo, c)}`];
    },
  },
  cortar: {
    uso: 'cortar <cabo> <metros>',
    descricao: 'desfaz uma emenda para refazer',
    grupo: 'bancada',
    rodar: (t, [id, metros]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      const d = lerNumero(metros ?? '');
      const e = (c.emendas ?? []).find((x) => d !== null && Math.abs(x.metros - d) <= 10);
      if (!e) return ['Não tem emenda aí.'];
      c.emendas = c.emendas!.filter((x) => x !== e);
      c.ruptura = e.metros;
      return [`Emenda de ${e.metros} m cortada. Fibra aberta de novo, de propósito desta vez.`];
    },
  },
  segmento: {
    uso: 'segmento <cabo> <n> <os2|om1|om3|om4>',
    descricao: 'troca um trecho da fibra (cordão ou tronco). Sem n, lista os trechos',
    grupo: 'bancada',
    rodar: (t, [id, n, fibra]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      const segs = c.segmentos ?? [];
      const cor = (f: Fibra) => (f === 'os2' ? 'amarelo, núcleo 9 µm' : f === 'om1' ? 'laranja, núcleo 62,5 µm' : f === 'om3' ? 'aqua, núcleo 50 µm' : 'violeta, núcleo 50 µm');
      if (!n) return segs.map((s, i) => `  ${i + 1}) ${s.nome}: ${s.fibra.toUpperCase()} (${cor(s.fibra)}), ${s.metros} m`);
      const s = segs[Number(n) - 1];
      if (!s) return ['Trecho inexistente.'];
      if (!fibra || !['os2', 'om1', 'om3', 'om4'].includes(fibra)) return ['Tipos: os2, om1, om3, om4.'];
      if (s.nome === 'tronco') return ['Trocar o tronco é obra civil. Hoje não.'];
      s.fibra = fibra as Fibra;
      return [`${s.nome} agora é ${fibra.toUpperCase()} (${cor(s.fibra)}).`, `Estado: ${estadoTexto(t.mundo, c)}`];
    },
  },
  antena: {
    uso: 'antena <eq> <azimute|altura> <valor>',
    descricao: 'gira (graus) ou sobe (metros) a antena',
    grupo: 'bancada',
    rodar: (t, [nome, eixo, valor]) => {
      const e = t.mundo.equipamentos.get(nome ?? '');
      if (!e?.antena) return ['Esse aparelho não tem antena direcional.'];
      const v = lerNumero(valor ?? '');
      if (v === null) return ['Valor numérico, por favor.'];
      if (eixo === 'azimute') e.antena.azimute = ((v % 360) + 360) % 360;
      else if (eixo === 'altura') {
        if (v > (e.s.alturaMax ?? 40)) return [`O mastro vai até ${e.s.alturaMax ?? 40} m. Acima disso é com a torre de celular.`];
        e.antena.altura = v;
      } else return ['Eixo: azimute ou altura.'];
      return [`Antena de ${e.nome}: azimute ${fmt(e.antena.azimute, 0)}°, altura ${fmt(e.antena.altura, 0)} m.`];
    },
  },
  espectro: {
    uso: 'espectro',
    descricao: 'analisador de espectro na faixa de 2,4 GHz',
    grupo: 'bancada',
    rodar: (t) => {
      const ap = [...t.mundo.equipamentos.values()].find((e) => e.tipo === 'ap');
      if (!ap) return ['Nada de interessante no espectro. Nem o micro-ondas da copa.'];
      const linhas = ['ANALISADOR 2,4 GHz (canais de 22 MHz, espaçados de 5 MHz)'];
      for (const v of ap.s.vizinhos) linhas.push(`  canal ${String(v.canal).padStart(2)}  ${v.dbm} dBm  ${v.nome}`);
      linhas.push(`  ruído de fundo: ${ap.s.ruidoDbm} dBm`);
      return linhas;
    },
  },
  coax: {
    uso: 'coax <cabo> [remover <n> | trocar <n> <rg6|rg59|conector|splitter2|splitter4|splitter8> | inserir <n> atenuador <dB>]',
    descricao: 'lista e mexe nos elementos da descida coaxial',
    grupo: 'bancada',
    rodar: (t, [id, acao, n, novo, valor]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!c.coax) return ['Isso não é coaxial.'];
      const els = c.coax.elementos;
      const nomeEl = (e: ElementoCoax) =>
        e.tipo === 'cabo' ? `cabo ${e.modelo!.toUpperCase()} ${e.metros} m` : e.tipo === 'splitter' ? `divisor de ${e.vias} vias` : e.tipo === 'conector' ? `conector F${e.oxidado ? ' oxidado e verde' : ''}` : `${e.tipo} ${e.db} dB`;
      if (!acao) {
        const linhas = [`Saída do tap: +${c.coax.tapDbmv} dBmV`];
        let nivel = c.coax.tapDbmv;
        els.forEach((e, i) => {
          nivel -= perdaElemento(e);
          linhas.push(`  ${i + 1}) ${nomeEl(e).padEnd(26)} -${fmt(perdaElemento(e), 1)} dB  → ${fmt(nivel, 1)} dBmV`);
        });
        linhas.push('  modem');
        return linhas;
      }
      const i = Number(n) - 1;
      if (acao === 'inserir') {
        if (novo !== 'atenuador') return ['Só tenho atenuador para inserir.'];
        const v = lerNumero(valor ?? '');
        if (!v) return ['Atenuador de quantos dB?'];
        els.splice(Math.max(0, i), 0, { tipo: 'atenuador', db: v });
        return [`Atenuador de ${v} dB inserido.`];
      }
      const e = els[i];
      if (!e) return ['Elemento inexistente. "coax ' + c.id + '" lista todos.'];
      if (acao === 'remover') {
        if (e.tipo === 'cabo') return ['Tirar o cabo inteiro deixa o modem sem nada. Use "trocar".'];
        els.splice(i, 1);
        return [`${nomeEl(e)} removido.`];
      }
      if (acao === 'trocar') {
        if (novo === 'rg6' || novo === 'rg59') {
          if (e.tipo !== 'cabo') return ['Isso não é cabo.'];
          e.modelo = novo;
        } else if (novo === 'conector') {
          if (e.tipo !== 'conector') return ['Isso não é conector.'];
          e.oxidado = false;
        } else if (novo?.startsWith('splitter')) {
          if (e.tipo !== 'splitter') return ['Isso não é divisor.'];
          e.vias = Number(novo.slice(8)) || 2;
        } else return ['Trocar por quê? rg6, rg59, conector, splitter2, splitter4 ou splitter8.'];
        return [`Trocado: agora ${nomeEl(e)}.`];
      }
      return ['Ação: remover, trocar ou inserir.'];
    },
  },
  orbita: {
    uso: 'orbita <cabo> <geo|meo|leo>',
    descricao: 'troca o terminal de satélite para outra constelação',
    grupo: 'campo',
    rodar: (t, [id, o]) => {
      const c = pegarCabo(t.mundo, id);
      if (typeof c === 'string') return [c];
      if (!c.sat) return ['Isso não é um enlace de satélite.'];
      if (o !== 'geo' && o !== 'meo' && o !== 'leo') return ['Órbita: geo, meo ou leo.'];
      c.sat.orbita = o;
      return [`Terminal trocado: órbita ${ORBITAS[o].nome}, ${ORBITAS[o].altitudeKm} km.`];
    },
  },
};

/* ---------------- Consoles dos equipamentos ---------------- */

type ConsoleFn = (t: Terminal, e: Equipamento, cmd: string, args: string[]) => Saida | null;

function mostraInterfaces(t: Terminal, e: Equipamento): Saida {
  const linhas = ['PORTA     ESTADO                          RX      CRC'];
  for (const p of e.portas) {
    const c = caboNaPorta(t.mundo, { equip: e.nome, porta: p.nome });
    const est = c ? avaliar(t.mundo, c) : null;
    const txt = !c ? 'sem cabo' : est!.up ? `ativa ${est!.velocidade} Mb/s` : 'inativa';
    linhas.push(`${p.nome.padEnd(9)} ${txt.padEnd(31)} ${String(p.contadores.rx).padStart(5)} ${String(p.contadores.crc).padStart(7)}`);
  }
  return linhas;
}

/* ---------- Camada de rede: comandos que PC e roteador dividem ---------- */

function rodarPing(t: Terminal, e: Equipamento, args: string[]): Saida {
  const ip = lerIp(args[0] ?? '');
  if (ip === null) return [temCamadaRede(t.mundo) ? 'ping <ip> [quantidade] [tamanho] [df]' : 'ping <ip> [quantidade]'];
  const n = Math.min(1000, Math.max(1, Number(args[1] ?? 4) || 4));
  const opcoes: OpcoesPing = {};
  if (args[2] !== undefined && args[2] !== 'df') {
    const tam = Number(args[2]);
    if (!Number.isInteger(tam) || tam < 0) return ['Tamanho em bytes de dados do ICMP, por exemplo: ping 203.0.113.10 4 1472 df'];
    opcoes.tamanho = tam;
  }
  if (args.slice(1).includes('df')) opcoes.df = true;
  const r = ping(t.mundo, e.nome, ip, n, opcoes);
  const mediaPing = r.rtts.length ? r.rtts.reduce((a, b) => a + b, 0) / r.rtts.length : Infinity;
  t.mundo.flags.pings = { ...(t.mundo.flags.pings ?? {}), [`${e.nome}>${ipTexto(ip)}`]: { n, recebidos: r.recebidos, media: mediaPing } };
  const mostrar = r.linhas.length > 12 ? [...r.linhas.slice(0, 5), `  ... (${r.linhas.length - 10} linhas omitidas) ...`, ...r.linhas.slice(-5)] : r.linhas;
  const media = r.rtts.length ? r.rtts.reduce((a, b) => a + b, 0) / r.rtts.length : 0;
  const extra = opcoes.tamanho !== undefined || opcoes.df ? ` com ${opcoes.tamanho ?? 56} bytes de dados (${(opcoes.tamanho ?? 56) + 28} no pacote IP)${opcoes.df ? ', DF ligado' : ''}` : '';
  return [
    `PING ${ipTexto(ip)}: ${n} pedidos de eco ICMP${extra}`,
    ...mostrar,
    `--- ${r.recebidos} de ${n} respondidos, ${fmt(((n - r.recebidos) / n) * 100, 1)} % de perda${r.rtts.length ? `, média ${media < 1 ? media.toFixed(3) : media.toFixed(1)} ms` : ''} ---`,
  ];
}

function rodarTraceroute(t: Terminal, e: Equipamento, args: string[]): Saida {
  const ip = lerIp(args[0] ?? '');
  if (ip === null) return ['traceroute <ip> [máximo de saltos]'];
  const max = Math.min(64, Math.max(1, Number(args[1] ?? 30) || 30));
  const r = traceroute(t.mundo, e.nome, ip, max);
  t.mundo.flags.traceroutes = { ...(t.mundo.flags.traceroutes ?? {}), [`${e.nome}>${ipTexto(ip)}`]: { chegou: r.chegou, saltos: r.saltos.map((s) => (s.ip === undefined ? null : ipTexto(s.ip))) } };
  return [...r.linhas, ...(r.saltos.length ? ['Cada linha é a sonda que morreu com TTL zero naquele roteador, que avisou de volta. "*" é sonda sem resposta.'] : [])];
}

function linhaRota(r: Rota): string {
  const via = r.via !== undefined ? `via ${ipTexto(r.via)}` : 'conectada';
  return `${r.origem.padEnd(10)} ${textoCidr(r.destino).padEnd(19)} ${via.padEnd(21)} ${r.porta ?? '?'}${r.valida ? '' : '  (próximo salto fora das minhas redes: rota inútil)'}${r.metrica !== undefined ? `  métrica ${r.metrica}` : ''}${r.nota ? ` (${r.nota})` : ''}`;
}

function mostraRotas(e: Equipamento): Saida {
  const rotas = rotasDe(e).sort((a, b) => b.destino.prefixo - a.destino.prefixo);
  if (!rotas.length) return ['Tabela de rotas vazia. Sem endereço nas interfaces, não há nem rota conectada.'];
  return ['ORIGEM     DESTINO             PRÓXIMO SALTO         PORTA', ...rotas.map(linhaRota), 'Na dúvida, vence o prefixo mais longo (o mais específico).'];
}

function mostraArp(e: Equipamento): Saida {
  const arp = (e.s.arp ?? {}) as Record<number, string>;
  const l = Object.entries(arp).map(([ip, mac]) => `  ${ipTexto(Number(ip)).padEnd(16)} ${mac}`);
  return l.length ? ['CACHE ARP (só vizinhos da mesma rede de enlace; para fora, o MAC é o do gateway)', ...l] : ['Cache ARP vazio.'];
}

/** Calculadora de sub-rede, agregação e IPv6: funciona em qualquer console da camada de rede. */
function calculadora(cmd: string, args: string[]): Saida | null {
  switch (cmd) {
    case 'subrede': {
      const c = lerCidr(args[0] ?? '');
      if (!c) return ['subrede <endereço/prefixo> [novo prefixo], por exemplo: subrede 192.0.2.77/26'];
      const i = infoSubrede(c);
      const l = [
        `${textoCidr(c)}`,
        `  máscara        ${i.mascara} (/${i.prefixo})`,
        `  rede           ${i.rede}`,
        `  broadcast      ${i.broadcast}`,
        `  hosts          ${i.primeiro} a ${i.ultimo}: ${i.hosts.toLocaleString('pt-BR')} endereços utilizáveis`,
        `  conta          2^(32 - ${i.prefixo}) - 2 = ${i.hosts.toLocaleString('pt-BR')} (tira o de rede e o de broadcast)`,
      ];
      if (ehPrivado(c.endereco)) l.push('  faixa privada (RFC 1918): só sai para a internet atrás de NAT');
      else if (ehDocumentacao(c.endereco)) l.push('  faixa de documentação (RFC 5737): usada em exemplos');
      if (args[1]) {
        const p = Number(args[1].replace('/', ''));
        const partes = dividir(c, p);
        if (!partes.length) return [...l, `Não dá para dividir /${c.prefixo} em /${args[1]}.`];
        l.push(`  dividida em /${p}: ${2 ** (p - c.prefixo)} sub-redes de ${quantidadeHosts(p)} hosts`, ...partes.slice(0, 16).map((x) => `    ${textoCidr(x)}`));
        if (partes.length > 16) l.push(`    ... e mais ${partes.length - 16}`);
      }
      return l;
    }
    case 'agregar': {
      const lista = args.map(lerCidr);
      if (!lista.length || lista.some((x) => !x)) return ['agregar <prefixo> <prefixo> ..., por exemplo: agregar 192.0.2.0/26 192.0.2.64/26'];
      const a = agregar(lista as Cidr[]);
      const s = superrede(lista as Cidr[])!;
      return [`Agregado exato: ${a.map(textoCidr).join(', ')}`, `Menor prefixo que cobre todos: ${textoCidr(s)}${a.length > 1 ? ' (cobre endereços a mais)' : ''}`];
    }
    case 'ipv6': {
      const x = args[0] ?? '';
      const cheio = expandirIpv6(x);
      if (!cheio) return ['ipv6 <endereço>, por exemplo: ipv6 2001:0db8:0000:0000:0000:0000:0000:0001'];
      const p = Number(x.split('/')[1] ?? 64) || 64;
      return [`completo   ${cheio}`, `abreviado  ${abreviarIpv6(x)}`, `prefixo    ${prefixoIpv6(x, p)}`, `tipo       ${ehEnlaceLocal(x) ? 'enlace local (fe80::/10), não sai do enlace' : cheio.startsWith('ff') ? 'multicast' : 'global ou outro'}`];
    }
    case 'eui64': {
      const id = eui64(args[0] ?? '');
      if (!id) return ['eui64 <mac>, por exemplo: eui64 00:1a:2b:3c:4d:5e'];
      return [
        `MAC ${args[0]}: parte no meio, enfia ff:fe e inverte o 7º bit do primeiro byte`,
        `identificador de interface  ${id.map((g) => g.toString(16)).join(':')}`,
        `enlace local                ${enlaceLocal(args[0]!)}`,
        `com o prefixo 2001:db8:1::/64  ${enderecoEui64('2001:db8:1::', args[0]!)}`,
      ];
    }
  }
  return null;
}

function linhasCaptura(cap: Captura): Saida {
  const l = [
    'QUADRO CAPTURADO (último pedido de eco que chegou ao destino)',
    `  Ethernet  destino ${cap.eth.destino}  origem ${cap.eth.origem}  EtherType 0x${cap.eth.etherType.toString(16).padStart(4, '0')}`,
    `  IPv4      ${ipTexto(cap.ip.origem)} → ${ipTexto(cap.ip.destino)}  TTL ${cap.ip.ttl}  protocolo ${cap.ip.protocolo}  tamanho ${cap.ip.tamanho}`,
    `  ICMP      tipo ${cap.icmp.tipo} (pedido de eco)  código ${cap.icmp.codigo}  id 0x${cap.icmp.id.toString(16)}  seq ${cap.icmp.seq}`,
  ];
  const d = cap.detalhe;
  if (!d) return [...l, '  dados     56 bytes de "abcdefgh..." porque alguém tinha que preencher'];
  l.push(
    `  dados     ${d.dados} bytes`,
    `  cabeçalho IPv4 (20 bytes): versão 4, IHL 5, identificação 0x${d.identificacao.toString(16).padStart(4, '0')}, DF ${d.df ? 1 : 0}, checksum 0x${d.checksum.toString(16).padStart(4, '0')} ${d.confere ? '(confere)' : '(NÃO confere)'}`,
    `  TTL: saiu com ${d.ttlSaida} e chegou com ${cap.ip.ttl}; ${d.roteadores.length ? `${d.roteadores.length} roteador(es) no caminho: ${d.roteadores.join(', ')}` : 'nenhum roteador no caminho'}`,
  );
  if (d.roteadores.length) l.push('  O MAC de origem é o do último roteador: o quadro é refeito a cada salto, o pacote IP segue (com TTL e checksum novos).');
  if (d.servico) l.push(`  serviço diferenciado 0x${d.servico.byte.toString(16).padStart(2, '0')}: DSCP ${d.servico.dscp} (${d.servico.classe}), ECN ${NOMES_ECN[d.servico.ecn]}`);
  if (d.fragmentos.length > 1) {
    l.push(`  chegou em ${d.fragmentos.length} fragmentos, mesma identificação, remontados no destino:`);
    for (const f of d.fragmentos) l.push(`    deslocamento ${String(f.deslocamento).padStart(4)} (byte ${f.deslocamento * 8}), ${f.dados} bytes de dados, MF ${f.mf ? 1 : 0}`);
  }
  return l;
}

/** Comandos da camada de rede no PC. Só falam quando o comando é deles. */
const REDE_PC: ConsoleFn = (t, e, cmd, args) => {
  switch (cmd) {
    case 'gateway': {
      if (!args[0]) return [e.s.gateway ? `gateway padrão ${e.s.gateway}` : 'sem gateway padrão'];
      if (args[0] === 'nenhum') {
        delete e.s.gateway;
        return ['Gateway removido. Agora só falo com a minha própria rede.'];
      }
      const g = lerIp(args[0]);
      if (g === null) return ['gateway <ip> | gateway nenhum'];
      e.s.gateway = args[0];
      const aviso = e.ip && !pertence(g, e.ip) ? ` Cuidado: ${args[0]} não está na minha rede (${textoCidr({ endereco: enderecoRede(e.ip), prefixo: e.ip.prefixo })}), e o gateway precisa ser alcançável por ARP.` : '';
      return [`Gateway padrão ${args[0]}: tudo que não é da minha rede vai para ele.${aviso}`];
    }
    case 'traceroute':
    case 'tracert':
      return rodarTraceroute(t, e, args);
    case 'dhcp':
      return pedirDhcp(t.mundo, e.nome).linhas;
    case 'grupo':
      return comandoGrupo(e, args);
    case 'arp':
      return mostraArp(e);
    case 'rotas':
      return mostraRotas(e);
    case 'mtu': {
      const p = e.portas[0]!;
      if (!args[0]) return [`MTU da eth0: ${p.mtu ?? MTU_PADRAO} bytes`];
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 68 || n > 9216) return ['MTU de 68 a 9216 bytes. 1500 é o do Ethernet; acima disso é quadro jumbo.'];
      p.mtu = n;
      return [`MTU da eth0: ${n} bytes.`];
    }
    case 'ip6': {
      if (!args[0]) return ipv6De(e).map((x) => `${x.endereco}/${x.prefixo}`);
      const [a, pre] = args[0].split('/');
      const ab = abreviarIpv6(a ?? '');
      if (!ab) return ['ip6 <endereço/prefixo>, por exemplo: ip6 2001:db8:1::10/64'];
      e.s.ipv6 = [`${ab}/${Number(pre ?? 64) || 64}`];
      return [`IPv6 ${ab}/${Number(pre ?? 64) || 64} configurado. O de enlace local continua lá: ${enlaceLocal(e.mac)}`];
    }
    case 'ping6': {
      if (!args[0]) return ['ping6 <endereço IPv6> [quantidade]'];
      const n = Math.min(100, Math.max(1, Number(args[1] ?? 4) || 4));
      const r = ping6(t.mundo, e.nome, args[0], n);
      return [`PING6 ${abreviarIpv6(args[0]) ?? args[0]}`, ...r.linhas, `--- ${r.recebidos} de ${n} respondidos ---`];
    }
  }
  return calculadora(cmd, args);
};

const CONSOLE_PC: ConsoleFn = (t, e, cmd, args) => {
  switch (cmd) {
    case 'ip': {
      if (!args[0]) return [e.ip ? `${ipTexto(e.ip.endereco)}/${e.ip.prefixo}` : 'sem endereço'];
      const c = lerCidr(args[0]);
      if (!c) return ['Formato: ip 192.0.2.10/24'];
      e.ip = c;
      return [`Endereço ${args[0]} configurado em eth0.`];
    }
    case 'mostra': {
      if (args[0] === 'rotas') return mostraRotas(e);
      if (args[0] === 'arp') return mostraArp(e);
      const l = [`eth0 ${e.mac} ${e.ip ? ipTexto(e.ip.endereco) + '/' + e.ip.prefixo : 'sem IP'} ttl-padrão ${e.ttl}`];
      if (e.s.gateway || e.s.dns || e.s.ipv6) l.push(`gateway ${e.s.gateway ?? '(nenhum)'}${e.s.dns ? `  DNS ${e.s.dns}` : ''}${e.s.concessao ? `  concessão de ${e.s.concessao.servidor} por ${textoTempo(e.s.concessao.segundos)}` : ''}`);
      if (e.s.ipv6) l.push(`IPv6 ${ipv6De(e).map((x) => `${x.endereco}/${x.prefixo}`).join('  ')}`);
      return [...l, ...mostraInterfaces(t, e)];
    }
    case 'ping':
      return rodarPing(t, e, args);
    case 'capturar': {
      const cap = t.mundo.ultimaCaptura;
      if (!cap) return ['Nada capturado ainda. Faça um ping que chegue em algum lugar.'];
      return linhasCaptura(cap);
    }
    case 'vazao': {
      const alvo = args[0] ?? t.mundo.flags.servidorTeste;
      if (!alvo) return ['vazao <equipamento>'];
      const v = vazao(t.mundo, e.nome, alvo);
      if (typeof v === 'string') return [v];
      t.mundo.flags.ultimaVazao = v.mbps;
      return [`Teste de vazão TCP até ${alvo}:`, ...v.linhas.map((l) => '  ' + l), `RESULTADO: ${fmt(v.mbps, 2)} Mb/s = ${fmt(v.mbps / 8, 2)} MB/s = ${fmt((v.mbps * 1e6) / 8 / 1048576, 2)} MiB/s`];
    }
  }
  return REDE_PC(t, e, cmd, args) ?? comandosTransporte(t.mundo, e, cmd, args);
};

/** Lista de VLANs como "1,10-20,30". Devolve null se algo estiver fora de 1 a 4094. */
export function lerListaVlan(txt: string): number[] | null {
  const out = new Set<number>();
  for (const parte of txt.split(',')) {
    const [a, b] = parte.split('-').map((x) => Number(x.trim()));
    if (a === undefined || !Number.isInteger(a)) return null;
    const fim = b === undefined ? a : b;
    if (!Number.isInteger(fim) || fim < a || a < 1 || fim > 4094) return null;
    for (let i = a; i <= fim; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

function textoLista(v: number[]): string {
  const partes: string[] = [];
  for (let i = 0; i < v.length; i++) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === v[j]! + 1) j++;
    partes.push(j > i ? `${v[i]}-${v[j]}` : String(v[i]));
    i = j;
  }
  return partes.join(',');
}

const PAPEL_TEXTO: Record<PapelPorta, string> = {
  raiz: 'encaminhando (o melhor caminho até a raiz)',
  designada: 'encaminhando',
  bloqueada: 'BLOQUEANDO (corta o laço; só escuta BPDU)',
  desligada: 'sem enlace',
};

function mostraMac(e: Equipamento): Saida {
  const t = tabelaMac(e);
  const itens = Object.entries(t).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  if (!itens.length) return ['Tabela de endereços MAC vazia. O próximo quadro com destino desconhecido vai ser inundado para todas as portas.'];
  return ['ENDEREÇO MAC         PORTA', ...itens.map(([mac, p]) => `${mac.padEnd(20)} ${p}`), `${itens.length} endereço${itens.length > 1 ? 's' : ''} aprendido${itens.length > 1 ? 's' : ''}. Destino fora da tabela é inundado.`];
}

function mostraStp(t: Terminal, e: Equipamento): Saida {
  if (!stpLigado(e)) return ['STP desligado neste switch. Ele não manda nem escuta BPDU: se houver laço passando por aqui, ninguém corta.'];
  const est = calcularStp(t.mundo).get(e.nome);
  if (!est) return ['STP ligado, mas sem informação.'];
  const raiz = t.mundo.equipamentos.get(est.raiz)!;
  const l = [
    `STP ligado. Prioridade ${prioridade(e)}, MAC ${e.mac} (identificador ${idPonte(e)})`,
    `raiz: ${raiz.nome} (${idPonte(raiz)})${raiz === e ? '. Esta ponte é a raiz.' : ''}`,
    `custo até a raiz: ${est.custo}${est.portaRaiz ? ` pela porta raiz ${est.portaRaiz}` : ''}`,
    'PORTA     PAPEL       ESTADO',
  ];
  for (const p of e.portas) l.push(`${p.nome.padEnd(9)} ${est.portas[p.nome]!.padEnd(11)} ${PAPEL_TEXTO[est.portas[p.nome]!]}`);
  l.push('Custo por enlace: 10 Mb/s = 100, 100 Mb/s = 19, 1 Gb/s = 4, 10 Gb/s = 2.');
  return l;
}

function mostraVlan(e: Equipamento): Saida {
  const l = ['PORTA     MODO      VLAN'];
  const porVlan = new Map<number, string[]>();
  for (const p of e.portas) {
    if (ehTronco(p)) {
      l.push(`${p.nome.padEnd(9)} tronco    ${p.tronco!.length ? textoLista(p.tronco!) : '(nenhuma)'}${p.tronco!.includes(1) ? ' (1 é a nativa, sem etiqueta)' : ''}`);
    } else {
      const v = p.vlan ?? 1;
      l.push(`${p.nome.padEnd(9)} acesso    ${v}`);
      porVlan.set(v, [...(porVlan.get(v) ?? []), p.nome]);
    }
  }
  for (const [v, ps] of [...porVlan].sort((a, b) => a[0] - b[0])) l.push(`VLAN ${v}: ${ps.join(', ')}`);
  return l;
}

const CONSOLE_SWITCH: ConsoleFn = (t, e, cmd, args) => {
  const m = t.mundo;
  const acharP = (nome: string | undefined) => e.portas.find((p) => p.nome === nome);
  switch (cmd) {
    case 'mostra': {
      if (args[0] === 'mac') return mostraMac(e);
      if (args[0] === 'stp') return mostraStp(t, e);
      if (args[0] === 'vlan') return mostraVlan(e);
      if (args[0] === 'fluxos') return comandosQos(m, e, 'mostra', args)!;
      const linhas = [`${e.modelo}`];
      if (emTempestade(m, e.nome)) linhas.push('CPU: 100 %. Tempestade de broadcast: os mesmos quadros girando no laço, cada volta duplicando. Os contadores não param de subir.');
      return [...linhas, ...mostraInterfaces(t, e)];
    }
    case 'limpa':
    case 'limpar': {
      if (args[0] !== 'mac') return ['limpa mac'];
      const n = limparTabelas(m, e.nome);
      return [`Tabela MAC esvaziada (${n} endereço${n === 1 ? '' : 's'}). É o que o envelhecimento faz sozinho depois de 300 s sem ouvir um endereço.`];
    }
    case 'stp': {
      if (args[0] !== 'on' && args[0] !== 'off') return ['stp <on|off>'];
      e.s.stp = args[0] === 'on';
      limparTabelas(m);
      return [e.s.stp ? 'STP ligado. A árvore é recalculada e as portas que fecham laço passam a bloquear.' : 'STP desligado. Se houver laço passando por este switch, prepare o extintor.', 'Mudou a topologia: as tabelas MAC foram esvaziadas.'];
    }
    case 'prioridade': {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 0 || n > 61440 || n % 4096 !== 0) return ['prioridade <n>, de 0 a 61440, em múltiplos de 4096 (0, 4096, 8192, ..., 32768 é o padrão). Menor ganha a eleição da raiz.'];
      e.s.prioridade = n;
      limparTabelas(m);
      return [`Prioridade ${n}. Identificador de ponte agora é ${idPonte(e)}.`, 'Mudou a topologia: as tabelas MAC foram esvaziadas.'];
    }
    case 'vlan': {
      const p = acharP(args[0]);
      const v = Number(args[1]);
      if (!p || !Number.isInteger(v) || v < 1 || v > 4094) return [`vlan <porta> <1 a 4094>. Portas: ${e.portas.map((x) => x.nome).join(', ')}.`];
      p.vlan = v;
      delete p.tronco;
      const tab = tabelaMac(e);
      for (const k of Object.keys(tab)) if (tab[k] === p.nome) delete tab[k];
      return [`${p.nome} agora é porta de acesso da VLAN ${v}. Quadro entra e sai sem etiqueta.`];
    }
    case 'tronco': {
      const p = acharP(args[0]);
      if (!p) return [`tronco <porta> <lista de VLANs | nao>. Portas: ${e.portas.map((x) => x.nome).join(', ')}.`];
      if (args[1] === 'nao') {
        delete p.tronco;
        return [`${p.nome} voltou a ser porta de acesso, VLAN ${p.vlan ?? 1}.`];
      }
      const lista = lerListaVlan(args[1] ?? '');
      if (!lista) return ['Lista de VLANs como 1,10,20 ou 10-20. Cada uma de 1 a 4094.'];
      p.tronco = lista;
      return [`${p.nome} agora é tronco 802.1Q com as VLANs ${textoLista(lista)}. Cada quadro leva uma etiqueta de 4 bytes dizendo de que VLAN é${lista.includes(1) ? ', menos a 1, que é a nativa e vai sem etiqueta' : ''}.`];
    }
  }
  return comandosQos(m, e, cmd, args);
};

const CONSOLE_HUB: ConsoleFn = (t, e, cmd, args) => {
  if (cmd !== 'mostra') return null;
  if (args[0] === 'mac') return ['Hub não tem tabela de endereços. Ele não lê quadro: repete cada bit que chega para todas as outras portas.'];
  const linhas = [`${e.modelo}`];
  if (emTempestade(t.mundo, e.nome)) linhas.push('Todos os LEDs acesos sem piscar. Tempestade de broadcast: os mesmos quadros girando no laço.');
  return [...linhas, ...mostraInterfaces(t, e)];
};

const CONSOLE_CANAL: ConsoleFn = (t, e, cmd, args) => {
  const s = e.s.mac as EstadoMac;
  const sn = (v: string | undefined) => (v === 'sim' ? true : v === 'nao' ? false : null);
  switch (cmd) {
    case 'mostra':
      return [
        `${e.modelo}`,
        `protocolo: ${s.protocolo} (${PROTOCOLOS_MAC[s.protocolo]})`,
        `estações: ${s.estacoes} | carga oferecida G: ${fmt(s.carga, 2)} quadros por tempo de quadro | a: ${fmt(s.a, 3)}`,
        `estações se escutam: ${s.ocultas ? 'NÃO (terminal oculto)' : 'sim'} | RTS/CTS: ${s.rtsCts ? 'ligado' : 'desligado'}`,
      ];
    case 'protocolo': {
      const p = args[0] as ProtocoloMac;
      if (!p || !(p in PROTOCOLOS_MAC)) return ['protocolo <x>', ...Object.entries(PROTOCOLOS_MAC).map(([k, v]) => `  ${k}: ${v}`)];
      s.protocolo = p;
      return [`Protocolo: ${PROTOCOLOS_MAC[p]}.`];
    }
    case 'carga': {
      const g = lerNumero(args[0] ?? '');
      if (g === null || g < 0 || g > 100) return ['carga <G>, quadros oferecidos por tempo de quadro, somando todas as estações. Ex.: carga 0,5'];
      s.carga = g;
      return [`Carga oferecida: G = ${fmt(g, 2)}.`];
    }
    case 'estacoes': {
      const n = Number(args[0]);
      if (!Number.isInteger(n) || n < 1 || n > 1000) return ['estacoes <1 a 1000>'];
      s.estacoes = n;
      return [`Estações no canal: ${n}.`];
    }
    case 'atraso': {
      const a = lerNumero(args[0] ?? '');
      if (a === null || a < 0 || a > 10) return ['atraso <a>, tempo de propagação dividido pelo tempo de quadro. Ex.: atraso 0,01'];
      s.a = a;
      return [`Atraso normalizado: a = ${fmt(a, 3)}.`];
    }
    case 'rts-cts':
    case 'ocultas': {
      const v = sn(args[0]);
      if (v === null) return [`${cmd} <sim|nao>`];
      if (cmd === 'rts-cts') s.rtsCts = v;
      else s.ocultas = v;
      return [cmd === 'rts-cts' ? `RTS/CTS ${v ? 'ligado: antes do dado, um pedido curto (RTS) e a autorização do ponto de acesso (CTS), que todas escutam.' : 'desligado.'}` : `Estações ${v ? 'ocultas: uma não escuta a outra, só o ponto de acesso escuta todas.' : 'se escutam.'}`];
    }
    case 'simular': {
      const r = simularCanal(s, rngSemente(1234));
      t.mundo.flags.ultimoMac = r;
      t.mundo.flags.macDoUltimo = JSON.stringify(s);
      return ['SIMULAÇÃO DO CANAL', ...r.linhas.map((x) => '  ' + x)];
    }
  }
  return null;
};

const CONSOLE_ROTEADOR: ConsoleFn = (t, e, cmd, args) => {
  const s = e.s;
  if (s.estado === 'boot') {
    if (cmd === 'interromper') {
      s.estado = 'resgate';
      return ['^C', 'Boot interrompido. Modo de resgate: aqui não tem senha, só responsabilidade.', 'Comandos: inicio <normal|ignorar-config>, boot'];
    }
    s.estado = 'ligado';
    s.running = [...s.startup];
    s.senhaRunning = s.senha;
    return ['O boot terminou enquanto você digitava. Janela de interrupção perdida. "religar" e tente de novo.'];
  }
  if (s.estado === 'resgate') {
    if (cmd === 'inicio') {
      if (args[0] !== 'normal' && args[0] !== 'ignorar-config') return ['inicio normal | inicio ignorar-config'];
      s.inicio = args[0];
      return [`Registro de inicialização: ${args[0]}.`];
    }
    if (cmd === 'boot') {
      s.estado = 'ligado';
      if (s.inicio === 'ignorar-config') {
        s.running = [];
        s.senhaRunning = null;
        return ['Carregando sistema...', 'Configuração de inicialização IGNORADA, como pedido.', 'Pronto. Sem senha e sem configuração: um roteador recém-nascido.'];
      }
      s.running = [...s.startup];
      s.senhaRunning = s.senha;
      return ['Carregando sistema...', 'Configuração carregada. Com a senha que você não sabe, aliás.'];
    }
    return ['Modo de resgate só entende: inicio <normal|ignorar-config> e boot.'];
  }
  if (cmd === 'interromper') {
    return ['Não tem boot nenhum para interromper: o roteador já está ligado. Religue primeiro (tire da tomada) e interrompa logo em seguida.'];
  }
  if (s.senhaRunning && !s.logado) {
    if (cmd === 'login') {
      if (args[0] === s.senhaRunning) {
        s.logado = true;
        return ['Acesso liberado.'];
      }
      return ['Senha incorreta. Eu nem te conheço.'];
    }
    return ['Acesso negado. "login <senha>". Não, "admin" não é.'];
  }
  switch (cmd) {
    case 'login':
      return ['Já está dentro.'];
    case 'mostra':
      if (args[0] && ['rotas', 'interfaces', 'nat', 'dhcp', 'arp', 'ospf', 'lsdb', 'rip', 'bgp', 'mpls', 'igmp', 'fila', 'qos', 'fluxos'].includes(args[0])) return REDE_ROTEADOR(t, e, 'mostra', args)!;
      if (args[0] === 'startup') return ['--- configuração de inicialização (gravada) ---', ...s.startup.map((l: string) => '  ' + l), `  senha ${s.senha ? '*****' : '(nenhuma)'}`, `registro de inicialização: ${s.inicio}`];
      return ['--- configuração em execução (memória) ---', ...(s.running.length ? s.running.map((l: string) => '  ' + l) : ['  (vazia)']), `  senha ${s.senhaRunning ? '*****' : '(nenhuma)'}`, `registro de inicialização: ${s.inicio}`];
    case 'copiar':
      if (args[0] === 'startup' && args[1] === 'running') {
        s.running = [...s.startup];
        s.senhaRunning = s.senha;
        s.logado = true;
        return ['Configuração de inicialização copiada para a memória. Veio junto a senha antiga; troque antes de salvar.'];
      }
      if (args[0] === 'running' && args[1] === 'startup') return CONSOLE_ROTEADOR(t, e, 'salvar', []);
      return ['copiar startup running | copiar running startup'];
    case 'senha':
      if (!args[0] || args[0].length < 8) return ['Senha com pelo menos 8 caracteres. "12345678" passa na regra e reprova na vida.'];
      s.senhaRunning = args[0];
      return ['Senha trocada na memória. Ainda não foi gravada.'];
    case 'salvar':
      s.startup = [...s.running];
      s.senha = s.senhaRunning;
      return ['Gravando... [OK]', s.running.length ? 'Configuração gravada.' : 'Configuração VAZIA gravada. Espero que você saiba o que fez.'];
    case 'inicio':
      if (args[0] !== 'normal' && args[0] !== 'ignorar-config') return ['inicio normal | inicio ignorar-config'];
      s.inicio = args[0];
      return [`Registro de inicialização: ${args[0]} (vale a partir do próximo boot).`];
  }
  return REDE_ROTEADOR(t, e, cmd, args);
};

function porta(e: Equipamento, nome: string | undefined): string | null {
  return nome && e.portas.some((p) => p.nome === nome) ? nome : null;
}

function mostraInterfacesIp(t: Terminal, e: Equipamento): Saida {
  const tab = (e.s.interfaces ?? {}) as Record<string, string>;
  const n = nat(e);
  const linhas = ['PORTA     ENDEREÇO            MTU    ENLACE'];
  for (const p of e.portas) {
    const c = caboNaPorta(t.mundo, { equip: e.nome, porta: p.nome });
    const est = c ? avaliar(t.mundo, c) : null;
    const papel = n ? (n.externa === p.nome ? '  NAT externa' : n.internas.includes(p.nome) ? '  NAT interna' : '') : '';
    linhas.push(`${p.nome.padEnd(9)} ${(tab[p.nome] ?? 'sem IP').padEnd(19)} ${(String(p.mtu ?? MTU_PADRAO) + (c?.mtu ? ` (cabo ${c.mtu})` : '')).padEnd(6)} ${!c ? 'sem cabo' : est!.up ? `ativa ${est!.velocidade} Mb/s` : 'inativa'}${papel}`);
  }
  return linhas;
}

/** Comandos da camada de rede no roteador: endereços, rotas, NAT, DHCP, MTU, ping e traceroute. */
const REDE_ROTEADOR: ConsoleFn = (t, e, cmd, args) => {
  const s = e.s;
  switch (cmd) {
    case 'mostra':
      switch (args[0]) {
        case 'rotas':
          return mostraRotas(e);
        case 'interfaces':
          return mostraInterfacesIp(t, e);
        case 'arp':
          return mostraArp(e);
        case 'nat': {
          const n = nat(e);
          if (!n) return ['NAT desligado.'];
          const l = [`NAT: de dentro (${n.internas.join(', ')}) para fora (${n.externa}), todo mundo sai com o endereço da ${n.externa}.`, 'PROTO  INTERNO (IP:porta)        EXTERNO (IP:porta)'];
          for (const x of n.tabela) l.push(`${x.protocolo.padEnd(6)} ${`${x.ipInterno}:${x.portaInterna}`.padEnd(25)} ${x.ipExterno}:${x.portaExterna}`);
          if (!n.tabela.length) l.push('(tabela vazia: ninguém de dentro saiu ainda)');
          else l.push('No ICMP, a "porta" é o identificador do eco. Quando duas máquinas usam a mesma, o NAT troca uma delas.');
          return l;
        }
        case 'dhcp': {
          const d = s.dhcp as ServidorDhcp | undefined;
          if (!d) return ['Servidor DHCP desligado.'];
          const ip = (s.interfaces ?? {})[d.porta] as string | undefined;
          const l = [
            `Servidor DHCP na ${d.porta} (${ip ?? 'sem IP: assim não responde'})`,
            `  faixa ${d.inicio} a ${d.fim}, gateway ${d.gateway ?? (ip ? ip.split('/')[0] : '?')}, DNS ${d.dns ?? '(nenhum)'}, concessão ${d.concessao} s (${textoTempo(d.concessao)})`,
          ];
          const c = Object.entries(d.concessoes);
          l.push(...(c.length ? c.map(([mac, x]) => `  ${x.padEnd(16)} ${mac}`) : ['  nenhuma concessão ainda']));
          return l;
        }
      }
      return comandosRoteamento(t.mundo, e, 'mostra', args) ?? comandosQos(t.mundo, e, 'mostra', args);
    case 'ip': {
      const p = porta(e, args[0]);
      if (!p) return [`ip <porta> <endereço/prefixo>. Portas: ${e.portas.map((x) => x.nome).join(', ')}.`];
      const tab = (s.interfaces ??= {}) as Record<string, string>;
      if (args[1] === 'nenhum') {
        delete tab[p];
        return [`Endereço tirado da ${p}. A rota conectada dela sumiu junto.`];
      }
      const c = lerCidr(args[1] ?? '');
      if (!c) return ['Formato: ip p1 192.0.2.1/24'];
      const rede = { endereco: enderecoRede(c), prefixo: c.prefixo };
      if (c.prefixo < 31 && (c.endereco === rede.endereco || c.endereco === enderecoBroadcast(c))) {
        return [`${args[1]} é o endereço de rede ou de broadcast. Interface precisa de um endereço de host.`];
      }
      const outra = Object.entries(tab).find(([k, v]) => k !== p && lerCidr(v) && pertence(c.endereco, { endereco: enderecoRede(lerCidr(v)!), prefixo: lerCidr(v)!.prefixo }));
      tab[p] = textoCidr(c);
      return [`${p}: ${textoCidr(c)}. Rota conectada ${textoCidr(rede)} pela ${p}.${outra ? ` Atenção: a ${outra[0]} já está nessa rede; duas portas na mesma sub-rede confundem a tabela.` : ''}`];
    }
    case 'rota': {
      const d = lerCidr(args[0] ?? '');
      const via = lerIp(args[1] ?? '');
      if (!d || via === null) return ['rota <prefixo> <próximo salto>, por exemplo: rota 203.0.113.0/24 198.51.100.2 (rota padrão: rota 0.0.0.0/0 <ip>)'];
      const rotas = (s.rotas ??= []) as { destino: string; via: string }[];
      const destino = textoCidr({ endereco: enderecoRede(d), prefixo: d.prefixo });
      const i = rotas.findIndex((r) => r.destino === destino);
      if (i >= 0) rotas.splice(i, 1);
      rotas.push({ destino, via: ipTexto(via) });
      const alcanca = interfacesL3(e).some((x) => pertence(via, x.cidr));
      return [`Rota ${destino} via ${ipTexto(via)} ${i >= 0 ? 'trocada' : 'criada'}${d.prefixo === 0 ? ' (rota padrão: quem não casa com nada vai por ela)' : ''}.${alcanca ? '' : ' Mas o próximo salto não está em nenhuma rede minha: a rota fica inútil até alguma interface alcançá-lo.'}`];
    }
    case 'sem-rota': {
      const d = lerCidr(args[0] ?? '');
      if (!d) return ['sem-rota <prefixo>'];
      const destino = textoCidr({ endereco: enderecoRede(d), prefixo: d.prefixo });
      const rotas = (s.rotas ?? []) as { destino: string; via: string }[];
      const i = rotas.findIndex((r) => r.destino === destino);
      if (i < 0) return [`Não tenho rota estática para ${destino}. Rota conectada some tirando o IP da porta.`];
      rotas.splice(i, 1);
      return [`Rota ${destino} removida.`];
    }
    case 'nat': {
      if (args[0] === 'desliga') {
        delete s.nat;
        return ['NAT desligado. Quem tem endereço privado não volta mais da internet.'];
      }
      const internas = (args[0] ?? '').split(',').filter(Boolean);
      const externa = args[1];
      if (!internas.length || !externa || ![...internas, externa].every((x) => porta(e, x))) return ['nat <portas internas, separadas por vírgula> <porta externa> | nat desliga'];
      if (internas.includes(externa)) return ['A externa não pode ser também interna.'];
      configurarNat(e, internas, externa);
      const ext = (s.interfaces ?? {})[externa] as string | undefined;
      return [`NAT ligado: quem entra por ${internas.join(', ')} e sai pela ${externa} ganha o endereço ${ext ? ext.split('/')[0] : '(a externa ainda não tem IP)'}.`];
    }
    case 'dhcp': {
      const p = porta(e, args[0]);
      const ini = lerIp(args[1] ?? '');
      const fim = lerIp(args[2] ?? '');
      if (!p || ini === null || fim === null || fim < ini) return ['dhcp <porta> <primeiro> <último> [gw <ip>] [dns <ip>] [tempo <segundos>], por exemplo: dhcp lan 192.168.0.100 192.168.0.199 dns 192.168.0.1 tempo 86400'];
      const o: { gateway?: string; dns?: string; concessao?: number } = {};
      for (let i = 3; i < args.length; i += 2) {
        const k = args[i];
        const v = args[i + 1] ?? '';
        if (k === 'gw' || k === 'gateway') o.gateway = lerIp(v) !== null ? v : undefined;
        else if (k === 'dns') o.dns = lerIp(v) !== null ? v : undefined;
        else if (k === 'tempo') o.concessao = Math.max(60, Number(v) || 86400);
      }
      configurarDhcp(e, p, ipTexto(ini), ipTexto(fim), o);
      const ip = lerCidr(((s.interfaces ?? {}) as Record<string, string>)[p] ?? '');
      const aviso = !ip ? ' A porta ainda não tem IP: sem isso o servidor não tem de onde responder.' : !pertence(ini, ip) || !pertence(fim, ip) ? ` A faixa sai da rede da ${p} (${textoCidr({ endereco: enderecoRede(ip), prefixo: ip.prefixo })}).` : '';
      return [`Servidor DHCP na ${p}: ${ipTexto(ini)} a ${ipTexto(fim)} (${fim - ini + 1} endereços).${aviso}`];
    }
    case 'sem-dhcp':
      delete s.dhcp;
      return ['Servidor DHCP desligado. As concessões que já foram dadas valem até vencer.'];
    case 'mtu': {
      const p = porta(e, args[0]);
      const n = Number(args[1]);
      if (!p || !Number.isInteger(n) || n < 68 || n > 9216) return ['mtu <porta> <bytes>, de 68 a 9216. O Ethernet usa 1500.'];
      acharPorta(t.mundo, { equip: e.nome, porta: p }).mtu = n;
      return [`MTU da ${p}: ${n} bytes. Pacote maior que isso é fragmentado aqui, ou descartado se vier com DF.`];
    }
    case 'ping':
      return rodarPing(t, e, args);
    case 'traceroute':
    case 'tracert':
      return rodarTraceroute(t, e, args);
  }
  return comandosRoteamento(t.mundo, e, cmd, args) ?? comandosQos(t.mundo, e, cmd, args) ?? calculadora(cmd, args);
};

const CONSOLE_MODEM: ConsoleFn = (_t, e, cmd, args) => {
  const s = e.s as { bandaHz: number; snrDb: number; baud: number; modulacao: string };
  switch (cmd) {
    case 'mostra': {
      const r = avaliarModem(s);
      return [
        `Linha: banda útil ${s.bandaHz} Hz${s.bandaHz === 3100 ? " (de 300 a 3400 Hz)" : ""}, SNR ${s.snrDb} dB`,
        `Configuração: ${s.baud} Bd, ${s.modulacao.toUpperCase()} (${BITS_POR_SIMBOLO[s.modulacao]} bits por símbolo)`,
        `Taxa pretendida: ${fmt(r.taxa / 1000, 1)} kb/s`,
        r.ok ? 'Estado: SINCRONIZADO' : 'Estado: SEM SINCRONISMO',
        ...r.motivos.map((m) => '  ' + m),
      ];
    }
    case 'taxa-simbolos': {
      const v = lerNumero(args[0] ?? '');
      if (!v || v <= 0) return ['taxa-simbolos <baud>'];
      s.baud = Math.round(v);
      return [`Taxa de símbolos: ${s.baud} Bd.`];
    }
    case 'modulacao':
      if (!args[0] || !(args[0] in BITS_POR_SIMBOLO)) return [`Modulações: ${Object.keys(BITS_POR_SIMBOLO).join(', ')}`];
      s.modulacao = args[0];
      return [`Modulação: ${args[0].toUpperCase()}.`];
    case 'treinar': {
      const r = avaliarModem(s);
      return r.ok ? ['PIIII-KRRRRSHHHH-BONG. Sincronizado a ' + fmt(r.taxa / 1000, 1) + ' kb/s.'] : ['PIIII-KRRR... desistiu.', ...r.motivos];
    }
  }
  return null;
};

const CONSOLE_MUX: ConsoleFn = (_t, e, cmd, args) => {
  const slots = e.s.slots as UsoSlot[];
  switch (cmd) {
    case 'mostra': {
      const r = avaliarE1(slots);
      const linhas = ['E1: 32 intervalos de 8 bits, 8000 quadros por segundo = 2048 kb/s'];
      for (let i = 0; i < 32; i += 8) linhas.push('  ' + slots.slice(i, i + 8).map((u, j) => `${String(i + j).padStart(2)}:${u.slice(0, 5).padEnd(5)}`).join(' '));
      linhas.push(`voz: ${r.voz} canais | dados: ${r.dados} kb/s | sinalização no 16: ${r.sinalizacao ? 'sim' : 'NÃO'}`);
      linhas.push(r.lof ? 'ALARME: LOF (perda de quadro). Sem enquadramento no intervalo 0 o outro lado não acha o começo do quadro.' : 'Quadro alinhado.');
      return linhas;
    }
    case 'slot': {
      const lista = listaSlots(args[0] ?? '');
      const uso = args[1] as UsoSlot;
      if (!lista || !['enquadramento', 'sinalizacao', 'voz', 'dados', 'livre'].includes(uso)) return ['slot <lista> <enquadramento|sinalizacao|voz|dados|livre>   ex.: slot 1-10,12 voz'];
      for (const i of lista) slots[i] = uso;
      return [`Intervalos ${args[0]} agora são ${uso}.`];
    }
  }
  return null;
};

const CONSOLE_RADIO: ConsoleFn = (t, e, cmd) => {
  if (cmd !== 'mostra') return null;
  const c = [...t.mundo.cabos.values()].find((x) => x.meio === 'radio' && (x.a.equip === e.nome || x.b.equip === e.nome));
  if (!c) return ['Sem enlace de rádio configurado.'];
  const d = radioDados(t.mundo, c);
  const est = avaliar(t.mundo, c);
  const outro = c.a.equip === e.nome ? c.b.equip : c.a.equip;
  return [
    `Enlace com ${outro}: ${c.radio!.distanciaKm} km a ${fmt(c.radio!.freqGHz, 1)} GHz, potência ${c.radio!.ptxDbm} dBm, antenas de ${e.antena!.ganho} dBi`,
    `Rumo para ${outro}: ${e.s.rumo ?? '?'}°. Antena apontada para ${fmt(e.antena!.azimute, 0)}°, altura ${fmt(e.antena!.altura, 0)} m`,
    `RSSI: ${fmt(d.rssi, 1)} dBm  ${est.up ? `(associado, ${est.velocidade} Mb/s)` : '(sem associação)'}`,
    `Obstrução da 1ª zona de Fresnel: ${d.folga >= d.precisa ? 'livre' : 'OBSTRUÍDA'}`,
  ];
};

const CONSOLE_AP: ConsoleFn = (_t, e, cmd, args) => {
  switch (cmd) {
    case 'canal': {
      const v = Number(args[0]);
      if (!Number.isInteger(v) || v < 1 || v > 13) return ['canal <1 a 13>'];
      e.s.canal = v;
      return [`Rádio em 2,4 GHz no canal ${v} (${2407 + 5 * v} MHz).`];
    }
    case 'mostra': {
      const r = snrWifi(e.s as any);
      return [`Canal ${e.s.canal}. Sinal no cliente: ${e.s.sinalCliente} dBm.`, `Ruído + interferência no canal: ${fmt(r.interferencia, 1)} dBm`, `SNR no cliente: ${fmt(r.snr, 1)} dB`];
    }
  }
  return null;
};

const CONSOLE_CABLEMODEM: ConsoleFn = (t, e, cmd) => {
  if (cmd !== 'mostra' && cmd !== 'status') return ['COMANDO NÃO RECONHECIDO. EU SÓ SEI "MOSTRA". E GRITAR.'];
  const c = [...t.mundo.cabos.values()].find((x) => x.coax && (x.a.equip === e.nome || x.b.equip === e.nome));
  if (!c) return ['SEM CABO. SEM SINAL. SEM ESPERANÇA.'];
  const { nivel, mer } = coaxDados(c);
  const est = avaliar(t.mundo, c);
  return [
    `NÍVEL DE DESCIDA: ${fmt(nivel, 1)} DBMV (ACEITO DE -15 A +15, IDEAL DE -7 A +7)`,
    `MER: ${fmt(mer, 1)} DB (MÍNIMO 30 PARA 256-QAM)`,
    est.up ? 'ESTADO: ONLINE. NAVEGUEM, MORTAIS.' : `ESTADO: OFFLINE. ${est.motivos[0]!.toUpperCase()}`,
  ];
};


const CONSOLE_ENLACE: ConsoleFn = (t, e, cmd, args) => {
  const m = t.mundo;
  const cfg = e.s.cfg as ConfigEnlace | undefined;
  const arq = e.s.arq as ConfigArq | undefined;
  const ppp = e.s.ppp as { auth: string; mru: number; exige?: string; mruMax?: number } | undefined;
  const opcao = <T extends string>(v: string | undefined, validos: readonly T[]): T | null => (v && (validos as readonly string[]).includes(v) ? (v as T) : null);
  switch (cmd) {
    case 'mostra': {
      const l: string[] = [`${e.modelo}`];
      if (cfg) l.push(`enquadramento: ${cfg.enquadramento}${cfg.enquadramento !== 'contagem' ? ` (${cfg.enquadramento === 'flags' ? 'escape de bytes' : 'enchimento de bits'}: ${cfg.enchimento ? 'ligado' : 'DESLIGADO'})` : ''}`, `detecção de erros: ${cfg.deteccao}`, `correção de erros: ${cfg.correcao}`);
      if (arq) l.push(`retransmissão: ${arq.protocolo}, janela ${arq.protocolo === 'pare-e-espere' ? 1 : arq.janela}, número de sequência com ${arq.bitsSeq} bit${arq.bitsSeq === 1 ? '' : 's'}, timeout ${arq.timeoutMs} ms`);
      if (m.flags.linhaArq) {
        const li = m.flags.linhaArq as Linha;
        l.push(`linha: ${li.taxaBps / 1000} kb/s, propagação ${li.propagacaoMs} ms, quadros de ${li.bytesQuadro} bytes`);
      }
      if (ppp) l.push(`PPP: autenticação ${ppp.auth}, MRU ${ppp.mru}`);
      if (m.flags.simplex) l.push('ATENÇÃO: enlace de mão única. Não existe canal de volta para pedir retransmissão.');
      return l;
    }
    case 'enquadramento': {
      const v = opcao(args[0], ['contagem', 'flags', 'bits'] as const);
      if (!cfg || !v) return ['enquadramento <contagem|flags|bits>'];
      cfg.enquadramento = v;
      return [`Enquadramento: ${v}.`];
    }
    case 'enchimento': {
      if (!cfg || !['sim', 'nao'].includes(args[0] ?? '')) return ['enchimento <sim|nao>'];
      cfg.enchimento = args[0] === 'sim';
      return [`${cfg.enquadramento === 'bits' ? 'Enchimento de bits' : 'Escape de bytes'}: ${cfg.enchimento ? 'ligado' : 'desligado'}.`];
    }
    case 'deteccao': {
      const v = opcao(args[0], ['nenhuma', 'paridade', 'checksum', 'crc32'] as const);
      if (!cfg || !v) return ['deteccao <nenhuma|paridade|checksum|crc32>'];
      cfg.deteccao = v;
      return [`Detecção de erros: ${v}.`];
    }
    case 'correcao': {
      const v = opcao(args[0], ['nenhuma', 'hamming'] as const);
      if (!cfg || !v) return ['correcao <nenhuma|hamming>'];
      cfg.correcao = v;
      return [`Correção de erros: ${v}.`];
    }
    case 'transmitir': {
      if (!cfg) return ['Este aparelho não transmite quadros de teste.'];
      const r = transmitir(m.flags.cargas, cfg, m.flags.erros ?? []);
      m.flags.ultimoEnlace = r;
      m.flags.cfgDoUltimo = JSON.stringify(cfg);
      const extra = ((r.bitsNaLinha / r.bitsDeCarga - 1) * 100).toFixed(0);
      return [
        `Transmitidos ${r.enviados} quadros pela linha (${r.bitsNaLinha} bits para ${r.bitsDeCarga} bits de dado: ${extra} % a mais).`,
        `chegaram certos: ${r.corretos}`,
        `entregues ERRADOS sem ninguém perceber: ${r.corrompidos}`,
        `descartados (erro detectado): ${r.descartados}`,
        `perdidos (o receptor nem achou): ${r.perdidos}`,
        ...(cfg.correcao === 'hamming' ? [`bits corrigidos pelo Hamming: ${r.corrigidos}`] : []),
        ...r.amostra.map((a) => '  ' + a),
      ];
    }
    case 'quadro': {
      if (!cfg) return ['Sem quadros para mostrar.'];
      const p = (m.flags.cargas as number[][])[m.flags.quadroAmostra ?? 0]!;
      return [`Dado original: ${hex(p.slice(0, 16))}${p.length > 16 ? ' ...' : ''}`, `Na linha: ${amostraDaLinha(p.slice(0, 16), { ...cfg, deteccao: 'nenhuma' })}`];
    }
    case 'arq': {
      const v = opcao(args[0], ['pare-e-espere', 'go-back-n', 'seletiva'] as const);
      if (!arq || !v) return ['arq <pare-e-espere|go-back-n|seletiva>'];
      arq.protocolo = v;
      return [`Retransmissão: ${v}.`];
    }
    case 'janela':
    case 'bits-seq':
    case 'timeout': {
      const n = Number(args[0]);
      if (!arq || !Number.isFinite(n) || n < 0) return [`${cmd} <número>`];
      if (cmd === 'janela') arq.janela = Math.max(1, Math.round(n));
      if (cmd === 'bits-seq') arq.bitsSeq = Math.min(16, Math.round(n));
      if (cmd === 'timeout') arq.timeoutMs = n;
      return [`${cmd}: ${n}.`];
    }
    case 'transferir': {
      if (!arq) return ['Este aparelho não transfere arquivos.'];
      const r = simularArq(arq, m.flags.linhaArq, m.flags.quadrosArq, m.rng);
      m.flags.ultimoArq = r;
      m.flags.arqDoUltimo = JSON.stringify(arq);
      return [
        `Transferência de ${r.quadros} quadros com ${arq.protocolo}:`,
        ...r.linhas.slice(0, 8).map((x) => '  ' + x),
        r.concluiu ? `concluída em ${fmt(r.tempoMs / 1000, 2)} s` : 'NÃO concluiu: o protocolo travou',
        `aproveitamento da linha: ${fmt(r.utilizacao * 100, 1)} %`,
        `transmissões: ${r.transmissoes} (retransmissões: ${r.retransmissoes}, à toa: ${r.desnecessarias})`,
        `quadros entregues ERRADOS: ${r.entreguesErrados}`,
      ];
    }
    case 'ppp': {
      if (!ppp) return ['Este aparelho não fala PPP.'];
      const [sub, val] = args;
      if (sub === 'auth' && ['nenhuma', 'pap', 'chap'].includes(val ?? '')) {
        ppp.auth = val!;
        return [`Autenticação PPP: ${val}.`];
      }
      if (sub === 'mru' && Number(val) > 0) {
        ppp.mru = Number(val);
        return [`MRU: ${val} bytes.`];
      }
      if (sub === 'discar') return discarPpp(m, e);
      return ['ppp auth <nenhuma|pap|chap> | ppp mru <bytes> | ppp discar'];
    }
  }
  return null;
};

function discarPpp(m: Mundo, e: Equipamento): string[] {
  if (e.s.ppp.exige) return ['O concentrador só atende. Quem disca é o roteador do cliente.'];
  const cpe = e.s.ppp as { auth: string; mru: number };
  const outro = [...m.equipamentos.values()].find((x) => x !== e && x.s.ppp);
  if (!outro) return ['Ninguém atende do outro lado.'];
  const conc = outro.s.ppp as { exige: string; mruMax: number };
  const l = ['LCP: Configure-Request (MRU ' + cpe.mru + ', autenticação ' + cpe.auth + ')'];
  let mru = cpe.mru;
  if (cpe.mru > conc.mruMax) {
    l.push(`LCP: Configure-Nak do concentrador: MRU no máximo ${conc.mruMax} (PPPoE gasta 8 bytes do quadro Ethernet)`);
    mru = conc.mruMax;
    l.push(`LCP: Configure-Request (MRU ${mru}) ... Configure-Ack`);
  } else l.push('LCP: Configure-Ack');
  if (cpe.auth !== conc.exige) {
    l.push(`LCP: o concentrador exige ${conc.exige.toUpperCase()} e o roteador só oferece ${cpe.auth.toUpperCase()}.`, 'LCP: Terminate-Request. Enlace derrubado.');
    m.flags.ppp = 'falhou';
    return l;
  }
  l.push('LCP: aberto.', `${conc.exige.toUpperCase()}: desafio, resposta com o segredo misturado ao desafio... sucesso.`, 'IPCP: Configure-Request (IP 0.0.0.0) -> Configure-Nak (use 203.0.113.77) -> Configure-Ack', 'IPCP: aberto. Endereço 203.0.113.77. Internet ligada.');
  m.flags.ppp = 'aberto';
  m.flags.mruPpp = mru;
  return l;
}

const CONSOLE_GENERICO: ConsoleFn = (t, e, cmd) => (cmd === 'mostra' ? mostraInterfaces(t, e) : null);

/** Comandos de congestionamento, QoS e SDN: aparecem na ajuda quando o mundo usa QoS (temQos). */
const AJUDA_QOS: Partial<Record<Equipamento['tipo'], string[]>> = {
  roteador: [
    'fila <porta> buffer <n> | red <mín> <máx> [pmáx] | red off | ecn <on|off> | choke <on|off> | descarte <on|off> | admissao <%|off> | capacidade <Mb/s>',
    'fila <porta> fonte <nome> <Mb/s> [tamanho=] [rajada=] [importancia=] [classe=] | fila <porta> sem-fonte <nome|todas>',
    'fila simular <carga> [porta] | fila curva [porta] | fila buffers [carga] [porta] | mostra fila',
    'balde <fichas|furado> <taxa Mb/s> <profundidade kB> [pico Mb/s] [rajada kB] [espera kB|descartar]',
    'escalonar <fifo|prioridade|wfq> [pesos] [porta]',
    'qos requisitos | mostra qos | dscp [<prefixo> <classe> [origem|destino]] | dscp limpa | rsvp <ip> <Mb/s> | rsvp limpa',
    'sdn controlador <on|off> | sdn regra <prioridade> <casamento> <ação> [em <equip>] | sdn apagar <id|tudo> | sdn ver | sdn telemetria | mostra fluxos',
  ],
  switch: ['sdn regra <prioridade> <casamento> <ação> | sdn apagar <id|tudo> | sdn ver | sdn telemetria | mostra fluxos'],
};

const CONSOLES: Partial<Record<Equipamento['tipo'], { fn: ConsoleFn; ajuda: string[]; rede?: string[] }>> = {
  pc: { fn: CONSOLE_PC, ajuda: ['ip [endereço/prefixo]', 'mostra', 'ping <ip> [quantidade]', 'capturar', 'vazao [equipamento]'], rede: ['gateway <ip|nenhum>', 'ping <ip> [quantidade] [tamanho] [df]', 'traceroute <ip> [máximo]', 'dhcp', 'mostra rotas | mostra arp', 'mtu [bytes]', 'ip6 <endereço/prefixo>', 'ping6 <endereço> [quantidade]', 'subrede <endereço/prefixo> [novo prefixo]', 'agregar <prefixo> <prefixo> ...', 'ipv6 <endereço>', 'eui64 <mac>', 'grupo <entrar|sair> <grupo multicast>'] },
  switch: { fn: CONSOLE_SWITCH, ajuda: ['mostra', 'mostra mac', 'mostra stp', 'mostra vlan', 'limpa mac', 'stp <on|off>', 'prioridade <n>', 'vlan <porta> <id>', 'tronco <porta> <lista|nao>'] },
  hub: { fn: CONSOLE_HUB, ajuda: ['mostra'] },
  canal: { fn: CONSOLE_CANAL, ajuda: ['mostra', 'protocolo <aloha|aloha-slotted|csma-np|csma-1p|csma-cd|csma-ca|bitmap|token>', 'carga <G>', 'estacoes <n>', 'atraso <a>', 'rts-cts <sim|nao>', 'ocultas <sim|nao>', 'simular'] },
  roteador: { fn: CONSOLE_ROTEADOR, ajuda: ['login <senha>', 'mostra [startup]', 'copiar startup running', 'senha <nova>', 'salvar', 'inicio <normal|ignorar-config>', 'interromper (só durante o boot)'], rede: ['ip <porta> <endereço/prefixo|nenhum>', 'rota <prefixo> <próximo salto>', 'sem-rota <prefixo>', 'mostra rotas | interfaces | arp | nat | dhcp', 'nat <internas> <externa> | nat desliga', 'dhcp <porta> <primeiro> <último> [gw <ip>] [dns <ip>] [tempo <s>]', 'sem-dhcp', 'mtu <porta> <bytes>', 'ping <ip> [quantidade] [tamanho] [df]', 'traceroute <ip> [máximo]', 'subrede | agregar | ipv6 | eui64', 'ospf <on|off> | ospf custo <porta> <n> | ospf area <porta> <n>', 'rip <on|off> | rip horizonte <on|off|envenenado>', 'rodar-protocolos [rodadas]', 'mostra ospf | lsdb | rip | bgp | mpls | igmp', 'derrubar <porta> | levantar <porta>', 'dijkstra [destino] | arvore <destino> | inundar <sem-controle|saltos|sequencia> [k]', 'difusao | multicast <grupo> | anycast <ip>', 'regiao <nome> | hierarquia', 'mpls lsp <prefixo> <roteador> ... | mpls enviar <ip> | mpls limpa', 'bgp as <n> | bgp vizinho <ip> <AS> <cliente|par|provedor> | bgp anunciar <prefixo> | bgp retirar <prefixo> | bgp off'] },
  modem: { fn: CONSOLE_MODEM, ajuda: ['mostra', 'taxa-simbolos <baud>', 'modulacao <bpsk|qpsk|qam16|qam64|qam256>', 'treinar'] },
  mux: { fn: CONSOLE_MUX, ajuda: ['mostra', 'slot <lista> <enquadramento|sinalizacao|voz|dados|livre>'] },
  radio: { fn: CONSOLE_RADIO, ajuda: ['mostra'] },
  ap: { fn: CONSOLE_AP, ajuda: ['mostra', 'canal <1 a 13>'] },
  cablemodem: { fn: CONSOLE_CABLEMODEM, ajuda: ['MOSTRA'] },
  enlace: { fn: CONSOLE_ENLACE, ajuda: ['mostra', 'enquadramento <contagem|flags|bits>', 'enchimento <sim|nao>', 'deteccao <nenhuma|paridade|checksum|crc32>', 'correcao <nenhuma|hamming>', 'transmitir', 'quadro', 'arq <pare-e-espere|go-back-n|seletiva>', 'janela <n>', 'bits-seq <n>', 'timeout <ms>', 'transferir', 'ppp auth|mru|discar'] },
};

/* ---------------- Terminal ---------------- */

export class Terminal {
  contexto: string | null = null;
  dicasVistas = 0;
  resolvido = false;
  historico: string[] = [];

  constructor(
    public mundo: Mundo,
    public dia: Dia,
  ) {}

  prompt(): string {
    if (!this.contexto) return 'campo $';
    const e = this.mundo.equipamentos.get(this.contexto)!;
    if (e.tipo === 'roteador' && e.s.estado === 'resgate') return 'resgate >';
    return `${this.contexto} >`;
  }

  ajuda(): Saida {
    if (this.contexto) {
      const e = this.mundo.equipamentos.get(this.contexto)!;
      const c: { ajuda: string[]; rede?: string[] } = CONSOLES[e.tipo] ?? { ajuda: ['mostra'] };
      const rede = c.rede && temCamadaRede(this.mundo) ? ['camada de rede:', ...c.rede.map((a) => '  ' + a)] : [];
      const qos = AJUDA_QOS[e.tipo] && temQos(this.mundo) ? ['congestionamento, QoS e SDN:', ...AJUDA_QOS[e.tipo]!.map((a) => '  ' + a)] : [];
      const transp = e.tipo === 'pc' && temTransporte(this.mundo) ? ['camada de transporte:', ...AJUDA_TRANSPORTE.map((a) => '  ' + a)] : [];
      return [`Console de ${e.nome} (${e.modelo}):`, ...c.ajuda.map((a) => '  ' + a), ...rede.map((a) => '  ' + a), ...qos.map((a) => '  ' + a), ...transp.map((a) => '  ' + a), '  sair'];
    }
    const grupos: [Comando['grupo'], string][] = [
      ['geral', 'GERAIS'],
      ['campo', 'CAMPO'],
      ['bancada', 'BANCADA E FERRAMENTAS'],
    ];
    const linhas: string[] = [];
    for (const [g, titulo] of grupos) {
      linhas.push(titulo);
      for (const c of Object.values(CAMPO).filter((x) => x.grupo === g)) linhas.push(`  ${c.uso.padEnd(44)} ${c.descricao}`);
    }
    return linhas;
  }

  abrirConsole(nome: string | undefined): Saida {
    const e = this.mundo.equipamentos.get(nome ?? '');
    if (!e) return ['Console de quem? Veja os nomes no "mapa".'];
    this.contexto = e.nome;
    const linhas = [`Cabo azul de console plugado em ${e.nome}. 9600 8N1, como em 1987.`];
    if (e.tipo === 'roteador' && e.s.estado === 'boot') linhas.push('Inicializando... (digite "interromper" para parar o boot)');
    linhas.push('Digite "?" para ver os comandos e "sair" para voltar ao campo.');
    return linhas;
  }

  executar(linha: string): Saida {
    const texto = linha.trim();
    if (!texto) return [];
    this.historico.push(texto);
    const [cmdBruto, ...args] = texto.split(/\s+/);
    const cmd = cmdBruto!.toLowerCase();
    if (cmd === '?' || cmd === 'ajuda') return this.ajuda();
    // OSPF e BGP se recalculam sozinhos a cada comando (o mundo pode ter mudado no anterior); o RIP anda em rodadas.
    if (temProtocolos(this.mundo)) recalcularProtocolos(this.mundo);
    if (this.contexto) {
      if (cmd === 'sair' || cmd === 'exit') {
        const nome = this.contexto;
        this.contexto = null;
        return [`Console de ${nome} desconectado.`];
      }
      const e = this.mundo.equipamentos.get(this.contexto)!;
      const c = CONSOLES[e.tipo];
      const saida = (c?.fn ?? CONSOLE_GENERICO)(this, e, cmd, args);
      if (saida) return saida;
      if (CAMPO[cmd] && ['objetivo', 'manual', 'chamado', 'dica', 'perguntas', 'responder'].includes(cmd)) return CAMPO[cmd]!.rodar(this, args);
      return [`${e.nome}: comando "${cmdBruto}" desconhecido. "?" lista o que eu sei.`];
    }
    const c = CAMPO[cmd];
    if (!c) return [`"${cmdBruto}" não é comando. Digite "ajuda". Ou "?", se estiver com pressa.`];
    return c.rodar(this, args);
  }
}

export function comandosCampo(): string[] {
  return Object.keys(CAMPO);
}
