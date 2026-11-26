// Dias novos, com prática guiada, aula e desafio no próprio dia.
// O Bluetooth por dentro (4.5.5 a 4.5.7): camadas de enlace, estrutura do quadro, Bluetooth 5 e Low Energy.

import { snrWifi, type Vizinho } from '../motor/aparelhos';
import {
  anunciosCobertos,
  BLE_ANUNCIO,
  BLE_PHY,
  BT_QUADRO,
  BT_SLOT_US,
  canaisBleCobertos,
  duracaoPacoteBtUs,
  frequenciaBle,
} from '../motor/mac';
import { adicionar, aparelho, novoMundo, type Mundo } from '../motor/mundo';
import { item, numerica, todasRespondidas } from './comum';
import type { Dia, Passo, Pergunta } from './tipos';

/* ---------- ajudantes ---------- */

function passo(p: Partial<Passo> & { instrucao: string; porque: string; feito: string }): Passo {
  return p as Passo;
}

/** Número com vírgula decimal, para os textos. */
const br = (x: number, casas = 1) => x.toFixed(casas).replace('.', ',');

const snrDe = (m: Mundo, nome: string) => snrWifi(m.equipamentos.get(nome)!.s as any).snr;
const canalDe = (m: Mundo, nome: string) => Number(m.equipamentos.get(nome)!.s.canal);

/**
 * Os três canais de anúncio do BLE, como o analisador do galpão os mostra: ele é calibrado em canais de Wi-Fi,
 * então cada um aparece no canal de Wi-Fi mais próximo, com a frequência de verdade no nome. Aproximação.
 */
const anunciosBle = (dbm: number): Vizinho[] => [
  { nome: `Anúncios BLE, canal 37 (${frequenciaBle(37)} MHz, na borda de baixo do canal 1)`, canal: 1, dbm },
  { nome: `Anúncios BLE, canal 38 (${frequenciaBle(38)} MHz, perto do canal 4)`, canal: 4, dbm },
  { nome: `Anúncios BLE, canal 39 (${frequenciaBle(39)} MHz, acima do canal 13)`, canal: 13, dbm },
];

/** Item do objetivo: o canal do Wi-Fi não cobre nenhum dos três canais de anúncio. */
const anunciosLivres = (m: Mundo, nome: string) => {
  const cobertos = anunciosCobertos(canalDe(m, nome));
  return item('Canal do Wi-Fi sem cobrir os anúncios 37, 38 e 39', cobertos.length === 0, cobertos.length ? `cobre o ${cobertos.join(', ')}` : 'livres');
};

const PACOTE5 = duracaoPacoteBtUs(5);
/** Bits do pacote mais longo no ar: código de acesso, cabeçalho e carga máxima. */
const BITS_MAX = BT_QUADRO.codigoAcesso + BT_QUADRO.cabecalho + BT_QUADRO.cargaMax;
/** Canais BLE debaixo de um Wi-Fi de 20 MHz no canal 3 (o da sala, de fábrica). */
const COBERTOS3 = canaisBleCobertos(3);

/* ======================================================================
 * ref 130: Bluetooth por dentro (4.5.5 a 4.5.7)
 * ====================================================================== */

const AP130 = 'ap-musculacao';

const p130: Pergunta[] = [
  numerica('1', `O cabeçalho do pacote tem ${BT_QUADRO.cabecalhoInfo} bits de informação, e cada bit vai repetido 3 vezes. Quantos bits ele ocupa no ar?`, BT_QUADRO.cabecalho, 0),
  numerica('2', `Um pacote de 5 intervalos de ${BT_SLOT_US} µs dura quanto, em µs?`, PACOTE5, 1),
];

const d130: Pergunta[] = [
  numerica('1', `No LE Coded com S = 8, cada bit vira 8 símbolos de 1 µs. Qual a taxa, em kb/s?`, BLE_PHY['coded-s8'].kbps, 0),
  numerica('2', 'O BLE tem 40 canais de 2 MHz, e 3 deles são de anúncio. Quantos sobram para os dados das conexões?', 40 - BLE_ANUNCIO.length, 0),
];

const dia130: Dia = {
  numero: 130,
  ato: 3,
  titulo: 'Bluetooth por dentro',
  chamado: [
    'CHAMADO #0130',
    'A Academia Supino Reto abriu a sala de musculação 2. As esteiras novas e as pulseiras da turma falam Bluetooth de baixo consumo e "demoram uma eternidade para aparecer no aplicativo". O ponto de acesso da sala veio de fábrica no canal 3, e ninguém mexeu.',
    'No mesmo ar estão a Academia Bíceps de Ouro no canal 1 e a TV da sala de bike no 11. A coordenação quer o aplicativo achando as pulseiras na hora, e o Wi-Fi limpo.',
    'Objetivo: o Wi-Fi fora dos canais de anúncio 37, 38 e 39, SNR de 25 dB ou mais no cliente e as duas perguntas respondidas.',
  ],
  manual: {
    titulo: 'Bluetooth por dentro: tempo em fatias, pacote e baixo consumo',
    texto: [
      `A camada de enlace do Bluetooth clássico divide o tempo em intervalos de ${BT_SLOT_US} µs, um por salto de frequência, numerados pelo relógio do mestre. É TDD, duplexação por divisão de tempo: o mestre começa a transmitir só nos intervalos pares e o escravo responde nos ímpares, e só fala o escravo a quem o mestre acabou de se dirigir. Um pacote ocupa 1, 3 ou 5 intervalos, sem trocar de frequência no meio; o salto seguinte retoma a sequência como se os intervalos do meio tivessem acontecido. Pacote longo rende mais: no de 5 intervalos cabem 2745 bits de carga em ${br(PACOTE5, 0)} µs, e sobra tempo para o rádio mudar de frequência.`,
      'Há dois tipos de enlace. O ACL (assíncrono sem conexão) leva dados por comutação de pacotes: nada é reservado, cada pacote tem CRC de 16 bits e o que chega errado é retransmitido, com os bits ARQN e SEQN do cabeçalho fazendo o papel de confirmação e número de sequência. O SCO (síncrono orientado a conexão) reserva intervalos em ritmo fixo para voz a 64 kb/s, sem retransmissão: um pacote HV3 de 30 bytes a cada 6 intervalos dá exatamente 64 kb/s. O eSCO, estendido, mantém a reserva e acrescenta uma janela curta de retransmissão. Cada escravo tem no máximo um ACL com o mestre; uma piconet aguenta até 3 enlaces SCO.',
      'O gerenciador de enlace cuida de abrir e configurar as conexões, trocar o modo de energia e parear. No pareamento antigo, os dois lados digitavam o mesmo PIN, quase sempre de 4 dígitos: 10.000 combinações, que quem gravou a troca testa em segundos. O pareamento simples e seguro (SSP) troca chaves públicas por Diffie-Hellman em curva elíptica (ECDH, na curva P-256 nas Conexões Seguras) e confirma por comparação numérica: as duas telas mostram 6 dígitos e a pessoa confere. Quem estiver no meio tem 1 chance em 1.000.000 de passar. O modo "só funciona", sem tela, cifra igual, mas não protege contra quem está no meio.',
      `O pacote no ar tem três partes. O código de acesso, de ${BT_QUADRO.codigoAcesso} bits (preâmbulo, 64 bits de sincronismo derivados do endereço do mestre e cauda), diz de qual piconet ele é. O cabeçalho tem ${BT_QUADRO.cabecalhoInfo} bits: o endereço do escravo ativo (3 bits), o tipo do pacote (4), controle de fluxo, ARQN, SEQN e o HEC, uma verificação de 8 bits. Esses 18 bits vão repetidos 3 vezes, um FEC de taxa 1/3 que corrige um bit errado em cada trinca por maioria: ${BT_QUADRO.cabecalho} bits no ar. Depois vem a carga útil, de 0 a ${BT_QUADRO.cargaMax} bits, com o CRC no fim.`,
      `O Bluetooth de baixo consumo (LE) é quase outro protocolo: 40 canais de 2 MHz, 37 para dados e 3 para anúncio, o 37, o 38 e o 39 (${frequenciaBle(37)}, ${frequenciaBle(38)} e ${frequenciaBle(39)} MHz), escolhidos para ficar fora dos canais 1, 6 e 11 do Wi-Fi. O Bluetooth 5 trouxe o PHY de 2M (dobro da taxa, 2 Mb/s) e o Coded, que repete cada bit em S = 2 ou S = 8 símbolos: 500 ou 125 kb/s, com até 4 vezes o alcance. O anúncio estendido põe só um aviso nos canais 37 a 39 e manda o resto num canal de dados, até 254 bytes por pacote e 1650 encadeados, contra 31 do anúncio legado. Depois de conectar, os dados vivem no GATT: serviços com características (frequência cardíaca, bateria), lidas e escritas pelo protocolo de atributos (ATT). Ferramentas: "Analisador de espectro", "Ver SNR no cliente" e "Trocar o canal", no ponto de acesso.`,
    ],
  },
  dicas: [
    'Abra o analisador: um Wi-Fi de 20 MHz cobre uns 10 canais BLE. Os de anúncio estão em 2402, 2426 e 2480 MHz.',
    `O canal 3 fica em 2422 MHz e cobre ${COBERTOS3.length} canais BLE, incluindo o 38. Os canais 2 a 5 cobrem o 38, e o 13 cobre o 39.`,
    'Canal 6: longe da vizinha no 1, da TV no 11 e dos três canais de anúncio.',
  ],
  perguntas: p130,
  montar: () => {
    const m = novoMundo(3130);
    adicionar(
      m,
      aparelho(AP130, 'ap', 'Ponto de acesso 2,4 GHz da musculação 2', [{ nome: 'lan' }], {
        canal: 3,
        sinalCliente: -60,
        ruidoDbm: -95,
        vizinhos: [{ nome: 'ACADEMIA_BICEPS_DE_OURO', canal: 1, dbm: -60 }, { nome: 'TV_da_Sala_de_Bike', canal: 11, dbm: -58 }, ...anunciosBle(-92)],
      }),
    );
    return m;
  },
  objetivo: (m) => {
    const snr = snrDe(m, AP130);
    return [anunciosLivres(m, AP130), item('SNR de 25 dB ou mais no cliente', snr >= 25, `${br(snr)} dB`), ...todasRespondidas(m, p130)];
  },
  posMorte: [
    `O ponto de acesso estava no canal 3, centrado em 2422 MHz: com 20 MHz de largura, ele cobria ${COBERTOS3.length} canais BLE, entre eles o 38, em 2426 MHz. As pulseiras anunciam nos três canais, um depois do outro; com um deles soterrado, o aplicativo perdia um terço das chances de ouvir cada anúncio, e as pulseiras gastavam bateria repetindo. No canal 6, o Wi-Fi fica entre o 38 e o 39, longe da vizinha e da TV.`,
    `Lá dentro, o Bluetooth é um relógio: intervalos de ${BT_SLOT_US} µs, mestre nos pares, escravo nos ímpares. A voz do microfone da aula vai em SCO ou eSCO, com intervalos reservados; o treino gravado da esteira vai em ACL, que retransmite o que se perder. O cabeçalho vai três vezes porque, se ele se perde, o pacote inteiro se perde; a carga tem CRC e, se der errado, volta.`,
    `As pulseiras pareadas por comparação numérica trocaram chaves por ECDH: ninguém que gravou o ar tira a chave de lá. E o LE Coded com S = 8, a ${BLE_PHY['coded-s8'].kbps} kb/s, é o que deixa a pulseira do fundo da sala, atrás do saco de pancada, ser ouvida.`,
  ],
  passos: [
    passo({ alvo: ['equip', AP130], acao: 'espectro', instrucao: 'Abra o analisador de espectro da musculação 2.', porque: 'Os três canais de anúncio do BLE têm endereço fixo na faixa. Antes de mexer, veja onde estão eles e os Wi-Fi fortes.', feito: 'A vizinha no 1, a TV no 11 e os anúncios BLE em 2402, 2426 e 2480 MHz. O analisador conta em canais de Wi-Fi, então mostra cada anúncio no canal de Wi-Fi mais próximo: aproximação.' }),
    passo({ alvo: ['equip', AP130], acao: 'mostra', instrucao: 'Veja a SNR no cliente do Wi-Fi da sala.', porque: 'O canal 3 encosta no canal 1 da vizinha. É bom saber o tamanho do problema antes de resolver os dois de uma vez.', feito: 'SNR baixa: o canal 3 divide mais da metade da largura com o canal 1 da vizinha. E ainda cobre o anúncio 38.' }),
    passo({
      alvo: ['equip', AP130],
      acao: 'canal',
      pedir: ['canal'],
      exemplo: { canal: '6' },
      instrucao: 'Escolha um canal que não cubra nenhum canal de anúncio e fique longe dos Wi-Fi fortes.',
      porque: 'Os canais 2 a 5 cobrem o anúncio 38 e o 13 cobre o 39. Dos que sobram, só um fica longe da vizinha e da TV.',
      conferir: (m) => {
        const cobertos = anunciosCobertos(canalDe(m, AP130));
        if (cobertos.length) return `O canal ${canalDe(m, AP130)} cobre o anúncio ${cobertos.join(', ')}. Saia de 2 a 5 e do 13.`;
        const snr = snrDe(m, AP130);
        return snr >= 25 || `Anúncios livres, mas SNR de ${br(snr)} dB. Fique a 5 canais ou mais da vizinha no 1 e da TV no 11.`;
      },
      feito: 'Anúncios livres e SNR acima de 25 dB. As pulseiras aparecem no aplicativo na primeira varredura.',
    }),
    passo({ pergunta: '1', exemplo: { resposta: String(BT_QUADRO.cabecalho) }, instrucao: `O cabeçalho tem ${BT_QUADRO.cabecalhoInfo} bits de informação, repetidos 3 vezes. Quantos bits no ar?`, porque: 'Endereço do escravo (3), tipo (4), fluxo (1), ARQN (1), SEQN (1) e HEC (8) somam 18. O FEC de taxa 1/3 manda cada um três vezes.', feito: `${BT_QUADRO.cabecalho} bits. Na chegada, cada trinca é decidida por maioria: um bit errado por trinca não estraga nada.` }),
    passo({ pergunta: '2', exemplo: { resposta: String(PACOTE5) }, instrucao: `Quanto dura um pacote de 5 intervalos de ${BT_SLOT_US} µs, em µs?`, porque: 'O pacote fica na mesma frequência do começo ao fim, ocupando os intervalos inteiros.', feito: `${PACOTE5} µs. No ar mesmo vão até ${BITS_MAX} bits a 1 Mb/s, ${BITS_MAX} µs; o resto é folga para o rádio saltar para a frequência seguinte.` }),
    passo({
      escolha: {
        opcoes: [
          'SCO ou eSCO: intervalos reservados em ritmo fixo, 64 kb/s',
          'ACL: sem reserva, retransmitindo o que se perder',
          'Anúncio estendido nos canais 37, 38 e 39',
          'Tanto faz: os dois enlaces têm o mesmo atraso',
        ],
        certa: 0,
        errada: {
          1: 'ACL garante a entrega, não a hora. Voz que chega atrasada por causa de retransmissão é pior que voz com um estalo.',
          2: 'Anúncio é para ser achado, não para conversar. Áudio precisa de conexão com intervalos reservados.',
          3: 'Não têm. O SCO tem lugar marcado a cada poucos intervalos; o ACL espera o mestre ter tempo.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'O microfone sem fio da aula de dança manda a voz para a caixa de som. Que enlace ele usa?',
      porque: 'Voz não pode esperar retransmissão: precisa chegar no ritmo, mesmo que um pedacinho se perca.',
      feito: 'SCO, ou eSCO, que guarda a reserva e ainda tenta de novo dentro de uma janela curta. O treino gravado da esteira vai em ACL.',
    }),
    passo({
      escolha: {
        opcoes: [
          'Pareamento simples e seguro: ECDH e comparação de 6 dígitos nas duas telas',
          'PIN de fábrica 0000, igual para todas as esteiras',
          '"Só funciona", sem conferir nada, porque a esteira tem tela',
          'Nenhum pareamento: o salto de frequência já esconde tudo',
        ],
        certa: 0,
        errada: {
          1: 'PIN de 4 dígitos são 10.000 combinações. Quem gravou o pareamento testa todas em segundos, e de fábrica nem precisa testar.',
          2: 'Se a esteira tem tela, use-a: o "só funciona" cifra, mas não percebe quem está no meio do pareamento.',
          3: 'A sequência de saltos sai do endereço e do relógio do mestre, que estão no ar. Salto não é cifra.',
        },
      },
      exemplo: { resposta: '0' },
      instrucao: 'As esteiras novas têm tela e vão parear com o celular de cada aluno. Como parear?',
      porque: 'O pareamento é o momento em que as chaves nascem. Se alguém no meio entra ali, tudo o que vem depois está exposto.',
      feito: 'Comparação numérica: as chaves públicas viajam, a secreta nunca, e quem está no meio tem 1 chance em 1.000.000 de acertar os 6 dígitos.',
    }),
  ],
  aula: {
    cartoes: [
      {
        titulo: 'O tempo em fatias',
        texto: [`TDD: um intervalo de ${BT_SLOT_US} µs por salto. O mestre começa nos pares, o escravo responde nos ímpares. Pacote de 3 ou 5 intervalos fica numa frequência só, e a sequência de saltos segue contando por baixo.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Intervalo', 'Quem fala', 'Frequência'],
          linhas: [
            ['0', 'mestre → escravo 1', 'f(0)'],
            ['1', 'escravo 1 → mestre', 'f(1)'],
            ['2 a 4', 'mestre, pacote de 3 intervalos', 'f(2), parada'],
            ['5', 'escravo 2 → mestre', 'f(5): a sequência pulou 3 e 4'],
          ],
        },
      },
      {
        titulo: 'ACL e SCO',
        texto: ['Dado quer chegar certo; voz quer chegar na hora. O Bluetooth tem um enlace para cada.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['', 'ACL', 'SCO / eSCO'],
          linhas: [
            ['reserva', 'nenhuma', 'intervalos fixos'],
            ['erro', 'CRC e retransmissão (ARQN, SEQN)', 'sem retransmissão (eSCO: janela curta)'],
            ['taxa', `até 723,2 kb/s num sentido (DH5)`, '64 kb/s por enlace (HV3 a cada 6 intervalos)'],
            ['limite', '1 por escravo', '3 por piconet'],
          ],
        },
      },
      {
        titulo: 'O pacote no ar',
        texto: [`O cabeçalho é pequeno e vital: se ele se perde, o pacote todo se perde. Por isso vai três vezes. A carga tem CRC e, se der errado, o ACL retransmite.`],
        visual: { tipo: 'bits', antes: `código de acesso (${BT_QUADRO.codigoAcesso}) | cabeçalho (18 × 3 = ${BT_QUADRO.cabecalho}) | carga (0 a ${BT_QUADRO.cargaMax})`, depois: 'qual piconet | LT_ADDR 3, TYPE 4, FLOW, ARQN, SEQN, HEC 8 | dados e CRC', legenda: 'Pacote do Bluetooth clássico, em bits' },
      },
      {
        titulo: 'Pareamento simples e seguro',
        texto: ['Cada lado manda a chave pública e guarda a secreta. Os dois calculam o mesmo segredo (ECDH), e as telas mostram 6 dígitos tirados dele. Se baterem, ninguém está no meio.'],
        visual: {
          tipo: 'diagrama',
          nos: [
            { id: 'c', rotulo: 'Celular', x: 90, y: 80 },
            { id: 'e', rotulo: 'Esteira', x: 470, y: 80 },
            { id: 'cs', rotulo: 'Segredo ECDH', x: 90, y: 210 },
            { id: 'es', rotulo: 'Segredo ECDH', x: 470, y: 210 },
            { id: 'n', rotulo: '6 dígitos: conferem?', x: 280, y: 280 },
          ],
          ligacoes: [
            ['c', 'e', 'chaves públicas P-256'],
            ['c', 'cs'],
            ['e', 'es'],
            ['cs', 'n'],
            ['es', 'n'],
          ],
        },
      },
      {
        titulo: 'LE: 40 canais, 3 de anúncio',
        texto: [`Os anúncios ficam em 2402, 2426 e 2480 MHz, fora dos canais 1, 6 e 11 do Wi-Fi. Um Wi-Fi de 20 MHz no lugar errado cobre um deles.`],
        visual: {
          tipo: 'tabela',
          cabecalho: ['Canal BLE', 'Frequência', 'Wi-Fi que cobre'],
          linhas: [
            ['37 (anúncio)', `${frequenciaBle(37)} MHz`, 'nenhum (borda do 1)'],
            ['0 a 10 (dados)', `${frequenciaBle(0)} a ${frequenciaBle(10)} MHz`, '1 a 5'],
            ['38 (anúncio)', `${frequenciaBle(38)} MHz`, '2 a 5'],
            ['11 a 36 (dados)', `${frequenciaBle(11)} a ${frequenciaBle(36)} MHz`, '3 a 13'],
            ['39 (anúncio)', `${frequenciaBle(39)} MHz`, '13'],
          ],
        },
      },
      {
        titulo: 'Bluetooth 5: mais longe ou mais rápido',
        texto: ['O PHY de 2M dobra a taxa; o Coded repete cada bit em S símbolos e troca taxa por alcance. O anúncio estendido manda só o aviso nos canais 37 a 39 e o conteúdo num canal de dados.'],
        visual: {
          tipo: 'tabela',
          cabecalho: ['PHY', 'Taxa', 'Para quê'],
          linhas: [
            [BLE_PHY['1M'].nome, `${BLE_PHY['1M'].kbps} kb/s`, 'o padrão, desde o começo'],
            [BLE_PHY['2M'].nome, `${BLE_PHY['2M'].kbps} kb/s`, 'atualizar firmware, pouco tempo no ar'],
            [BLE_PHY['coded-s2'].nome, `${BLE_PHY['coded-s2'].kbps} kb/s`, 'uns 2 vezes o alcance'],
            [BLE_PHY['coded-s8'].nome, `${BLE_PHY['coded-s8'].kbps} kb/s`, 'até 4 vezes o alcance'],
          ],
        },
      },
    ],
    checagem: {
      pergunta: 'Por que o cabeçalho do pacote vai repetido 3 vezes, e a carga útil não?',
      opcoes: [
        'Sem o cabeçalho, ninguém sabe de quem nem de que tipo é o pacote, e não há como pedir de novo; a carga tem CRC e pode ser retransmitida',
        'Para encher os 625 µs do intervalo',
        'Porque cada repetição vai num salto de frequência diferente',
        'Para cifrar o endereço do escravo',
      ],
      certa: 0,
      explicacao: 'São só 18 bits, e o FEC de 1/3 custa pouco: 54 bits. Já a carga pode ter 2745 bits; repetir tudo triplicaria o tempo no ar. Ela vai com CRC e, no ACL, quem erra pede de novo pelo ARQN.',
    },
  },
  desafio: {
    carta: [
      'A recepção da academia ganhou um totem de check-in: o aluno chega, a pulseira anuncia em BLE e a catraca libera. O ponto de acesso da recepção foi instalado no canal 13, "porque estava vazio".',
      'Do outro lado da rua, a Lanchonete Natureba tem Wi-Fi forte no 6 e o Estúdio Pilates Zen está no 1. Na hora do pico, a fila da catraca dobra a esquina.',
      'Objetivo: o Wi-Fi fora dos canais de anúncio 37, 38 e 39, SNR de 25 dB ou mais no cliente e as duas perguntas respondidas.',
    ],
    dicas: [
      `O anúncio 39 fica em ${frequenciaBle(39)} MHz. O canal 13 do Wi-Fi, centrado em 2472, cobre de 2462 a 2482.`,
      'Os canais 2 a 5 cobrem o anúncio 38, e do 7 ao 10 a lanchonete no 6 ainda vaza. Sobram o 11 e o 12.',
      'S = 8 são 8 símbolos de 1 µs por bit. Dos 40 canais, tire os 3 de anúncio.',
    ],
    perguntas: d130,
    respostas: { '1': String(BLE_PHY['coded-s8'].kbps), '2': String(40 - BLE_ANUNCIO.length) },
    montar: () => {
      const m = novoMundo(30130);
      adicionar(
        m,
        aparelho('ap-recepcao', 'ap', 'Ponto de acesso 2,4 GHz da recepção', [{ nome: 'lan' }], {
          canal: 13,
          sinalCliente: -62,
          ruidoDbm: -95,
          vizinhos: [{ nome: 'Lanchonete_Natureba', canal: 6, dbm: -57 }, { nome: 'Estudio_Pilates_Zen', canal: 1, dbm: -62 }, ...anunciosBle(-92)],
        }),
      );
      return m;
    },
    objetivo: (m) => {
      const snr = snrDe(m, 'ap-recepcao');
      return [anunciosLivres(m, 'ap-recepcao'), item('SNR de 25 dB ou mais no cliente', snr >= 25, `${br(snr)} dB`), ...todasRespondidas(m, d130)];
    },
    solucao: [
      ['equip', 'ap-recepcao', 'espectro'],
      ['equip', 'ap-recepcao', 'canal', { canal: '11' }],
    ],
  },
};

export const ATO3G: Dia[] = [dia130];
