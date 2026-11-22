// Terminal do jogo: comandos de campo, de bancada e o console de cada equipamento.

import type { Dia } from '../conteudo/tipos';
import { avaliarE1, avaliarModem, BITS_POR_SIMBOLO, snrWifi, type UsoSlot } from './aparelhos';
import { avaliar, coaxDados, CORES, lerCor, ORBITAS, perdaElemento, radioDados, wiremap, type Cor } from './fisico';
import { acharPorta, adicionar, caboNaPorta, lerPonta, ligar, TRANSCEPTORES, type Cabo, type ElementoCoax, type Equipamento, type Fibra, type Meio, type Mundo } from './mundo';
import { ping, vazao } from './rede';
import { fmt, ipTexto, lerCidr, lerIp, lerNumero } from './util';

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

const CONSOLE_PC: ConsoleFn = (t, e, cmd, args) => {
  switch (cmd) {
    case 'ip': {
      if (!args[0]) return [e.ip ? `${ipTexto(e.ip.endereco)}/${e.ip.prefixo}` : 'sem endereço'];
      const c = lerCidr(args[0]);
      if (!c) return ['Formato: ip 192.0.2.10/24'];
      e.ip = c;
      return [`Endereço ${args[0]} configurado em eth0.`];
    }
    case 'mostra':
      return [`eth0 ${e.mac} ${e.ip ? ipTexto(e.ip.endereco) + '/' + e.ip.prefixo : 'sem IP'} ttl-padrão ${e.ttl}`, ...mostraInterfaces(t, e)];
    case 'ping': {
      const ip = lerIp(args[0] ?? '');
      if (ip === null) return ['ping <ip> [quantidade]'];
      const n = Math.min(1000, Math.max(1, Number(args[1] ?? 4) || 4));
      const r = ping(t.mundo, e.nome, ip, n);
      const mediaPing = r.rtts.length ? r.rtts.reduce((a, b) => a + b, 0) / r.rtts.length : Infinity;
      t.mundo.flags.pings = { ...(t.mundo.flags.pings ?? {}), [`${e.nome}>${ipTexto(ip)}`]: { n, recebidos: r.recebidos, media: mediaPing } };
      const mostrar = r.linhas.length > 12 ? [...r.linhas.slice(0, 5), `  ... (${r.linhas.length - 10} linhas omitidas) ...`, ...r.linhas.slice(-5)] : r.linhas;
      const media = r.rtts.length ? r.rtts.reduce((a, b) => a + b, 0) / r.rtts.length : 0;
      return [
        `PING ${ipTexto(ip)}: ${n} pedidos de eco ICMP`,
        ...mostrar,
        `--- ${r.recebidos} de ${n} respondidos, ${fmt(((n - r.recebidos) / n) * 100, 1)} % de perda${r.rtts.length ? `, média ${media < 1 ? media.toFixed(3) : media.toFixed(1)} ms` : ''} ---`,
      ];
    }
    case 'capturar': {
      const cap = t.mundo.ultimaCaptura;
      if (!cap) return ['Nada capturado ainda. Faça um ping que chegue em algum lugar.'];
      return [
        'QUADRO CAPTURADO (último pedido de eco que chegou ao destino)',
        `  Ethernet  destino ${cap.eth.destino}  origem ${cap.eth.origem}  EtherType 0x${cap.eth.etherType.toString(16).padStart(4, '0')}`,
        `  IPv4      ${ipTexto(cap.ip.origem)} → ${ipTexto(cap.ip.destino)}  TTL ${cap.ip.ttl}  protocolo ${cap.ip.protocolo}  tamanho ${cap.ip.tamanho}`,
        `  ICMP      tipo ${cap.icmp.tipo} (pedido de eco)  código ${cap.icmp.codigo}  id 0x${cap.icmp.id.toString(16)}  seq ${cap.icmp.seq}`,
        '  dados     56 bytes de "abcdefgh..." porque alguém tinha que preencher',
      ];
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
  return null;
};

const CONSOLE_SWITCH: ConsoleFn = (t, e, cmd) => (cmd === 'mostra' ? [`${e.modelo}`, ...mostraInterfaces(t, e)] : null);

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
  return null;
};

const CONSOLE_MODEM: ConsoleFn = (_t, e, cmd, args) => {
  const s = e.s as { bandaHz: number; snrDb: number; baud: number; modulacao: string };
  switch (cmd) {
    case 'mostra': {
      const r = avaliarModem(s);
      return [
        `Linha: banda útil ${s.bandaHz} Hz (de 300 a 3400 Hz), SNR ${s.snrDb} dB`,
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

const CONSOLE_GENERICO: ConsoleFn = (t, e, cmd) => (cmd === 'mostra' ? mostraInterfaces(t, e) : null);

const CONSOLES: Partial<Record<Equipamento['tipo'], { fn: ConsoleFn; ajuda: string[] }>> = {
  pc: { fn: CONSOLE_PC, ajuda: ['ip [endereço/prefixo]', 'mostra', 'ping <ip> [quantidade]', 'capturar', 'vazao [equipamento]'] },
  switch: { fn: CONSOLE_SWITCH, ajuda: ['mostra'] },
  hub: { fn: CONSOLE_SWITCH, ajuda: ['mostra'] },
  roteador: { fn: CONSOLE_ROTEADOR, ajuda: ['login <senha>', 'mostra [startup]', 'copiar startup running', 'senha <nova>', 'salvar', 'inicio <normal|ignorar-config>', 'interromper (só durante o boot)'] },
  modem: { fn: CONSOLE_MODEM, ajuda: ['mostra', 'taxa-simbolos <baud>', 'modulacao <bpsk|qpsk|qam16|qam64|qam256>', 'treinar'] },
  mux: { fn: CONSOLE_MUX, ajuda: ['mostra', 'slot <lista> <enquadramento|sinalizacao|voz|dados|livre>'] },
  radio: { fn: CONSOLE_RADIO, ajuda: ['mostra'] },
  ap: { fn: CONSOLE_AP, ajuda: ['mostra', 'canal <1 a 13>'] },
  cablemodem: { fn: CONSOLE_CABLEMODEM, ajuda: ['MOSTRA'] },
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
      const c = CONSOLES[e.tipo] ?? { ajuda: ['mostra'] };
      return [`Console de ${e.nome} (${e.modelo}):`, ...c.ajuda.map((a) => '  ' + a), '  sair'];
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
