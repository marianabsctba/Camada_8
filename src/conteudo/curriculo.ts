// O currículo inteiro, do zero ao hero: cada seção vira um dia, na ordem da história.
// "ref" aponta para um dia já escrito (o número original dele em ato0/ato1/ato2).
// "luz" diz o que acende no mapa de Fim de Linha quando o dia é resolvido.

export interface EntradaCurriculo {
  numero: number;
  ato: number;
  secao: string;
  titulo: string;
  luz: string[];
  ref?: number;
}

type Linha = [secao: string, titulo: string, luz: string[], ref?: number];

const ATO0: Linha[] = [
  ['1.1', 'Para que serve uma rede', ['galpao'], 31],
  ['1.2', 'Tipos de rede', ['placa-galpao'], 32],
  ['1.3.1 a 1.3.3', 'Duas casas, um cabo', ['casa-1', 'casa-2'], 2],
  ['1.3.4 a 1.3.6', 'Do bairro ao mundo', ['estrada'], 33],
  ['1.4.1', 'Como a Internet é montada', ['poste-1'], 34],
  ['1.4.2 e 1.4.3', 'Celular e Wi-Fi', ['torre-celular'], 35],
  ['1.5.1 e 1.5.2', 'Camadas de protocolos', ['rack-galpao'], 36],
  ['1.5.3 a 1.5.5', 'Conexões e serviços', ['casa-3'], 37],
  ['1.6.1 e 1.6.2', 'Quem fala com quem', ['casa-4'], 4],
  ['1.6.3 a 1.6.5', 'Os modelos e as críticas', ['biblioteca'], 38],
  ['1.7', 'Quem manda nos padrões', ['prefeitura'], 39],
  ['1.8.1 e 1.8.2', 'Neutralidade da rede', ['camara'], 40],
  ['1.8.3 a 1.8.5', 'Segurança, privacidade e desinformação', ['camara-2'], 41],
  ['1.9', 'Bit não é byte', ['casa-5'], 3],
];

const ATO1: Linha[] = [
  ['2.1.1', 'A caminhonete cheia de discos', ['caminhonete'], 42],
  ['2.1.2', 'Crimpa direito', ['casa-6'], 5],
  ['2.1.2', 'Cruzado ou direto', ['escola'], 6],
  ['2.1.2', '100 metros e um palmo', ['cooperativa'], 7],
  ['2.1.2', 'Cat errado', ['servidor-galpao'], 8],
  ['2.1.2', 'O elevador', ['predio'], 9],
  ['2.1.3', 'Cabo coaxial', ['casa-7'], 43],
  ['2.1.4', 'Internet pela tomada', ['casa-8'], 44],
  ['2.1.5', 'Amarelo com aqua', ['prefeitura-andar'], 12],
  ['2.1.5', 'Orçamento de potência', ['distrito', 'escola-distrito'], 10],
  ['2.1.5', 'Retroescavadeira', ['avenida'], 11],
  ['2.2.1', 'O espectro eletromagnético', ['torre-celular'], 45],
  ['2.2.2 a 2.2.4', 'Espalhar para não brigar', ['praca'], 46],
  ['2.3.1 e 2.3.2', 'Rádio no morro', ['morro'], 15],
  ['2.3.3 e 2.3.4', 'Luz pelo ar', ['predio-vizinho'], 47],
  ['2.4.1', 'Por que o sinal se deforma', ['casa-9'], 48],
  ['2.4.2', 'Nyquist manda lembranças', ['sitio'], 13],
  ['2.4.3', 'Constelações', ['casa-10'], 49],
  ['2.4.4', 'Dividir o meio', ['tronco-fibra'], 50],
  ['2.5.1 e 2.5.2', 'A linha do telefone', ['casa-11'], 51],
  ['2.5.3', 'O E1 da prefeitura', ['prefeitura-telefone'], 14],
  ['2.5.4', 'Circuito ou pacote', ['central'], 52],
  ['2.6.1 a 2.6.4', 'A célula', ['torre-celular-2'], 53],
  ['2.6.5 a 2.6.7', 'Do 3G ao 5G', ['torre-5g'], 54],
  ['2.7', 'DOCSIS na rua', ['casa-12'], 17],
  ['2.8', 'Satélite e paciência', ['fazenda'], 18],
  ['2.9', 'Qual acesso para quem', ['rua-acacias'], 55],
  ['2.10', 'Política na camada física', ['camara-2'], 56],
];

const ATO2: Linha[] = [
  ['3.1.1', 'O que o enlace promete', ['central-sala'], 57],
  ['3.1.2', 'Onde começa o quadro', ['estacao-agua'], 19],
  ['3.1.2', 'O byte que é flag', ['estacao-agua-2'], 20],
  ['3.1.2', 'Cinco uns', ['prefeitura-fibra'], 21],
  ['3.1.3 e 3.1.4', 'Erro e fluxo', ['central-modem'], 58],
  ['3.2.1', 'Mão única', ['represa'], 23],
  ['3.2.2', 'Paridade não basta', ['cooperativa-2'], 22],
  ['3.2.2', 'Divisão por polinômio', ['laboratorio'], 24],
  ['3.3', 'Pare e espere', ['fazenda-2'], 25],
  ['3.3', 'O ACK que sumiu', ['posto-saude'], 26],
  ['3.4', 'Encher o cano', ['fazenda-3'], 27],
  ['3.4', 'Janela de oito', ['hospital'], 28],
  ['3.4', 'Só o que se perdeu', ['serra'], 29],
  ['3.5.1', 'PPP no último quilômetro', ['cidade-vizinha'], 30],
  ['3.5.2 e 3.5.3', 'O enlace do ADSL e do cabo', ['central-dsl'], 59],
];

const ATO3: Linha[] = [
  ['4.1', 'Um canal para muitos', ['bairro-norte']],
  ['4.2.1', 'ALOHA', ['bairro-norte-2']],
  ['4.2.2', 'Escutar antes de falar', ['bairro-norte-3']],
  ['4.2.3 e 4.2.4', 'Sem colisão', ['bairro-norte-4']],
  ['4.2.5', 'O terminal escondido', ['praca-2']],
  ['4.3.1 e 4.3.2', 'Ethernet clássica', ['escola-lab']],
  ['4.3.3', 'Desempenho da Ethernet', ['escola-lab-2']],
  ['4.3.4', 'Hub ou switch', ['condominio']],
  ['4.3.5 a 4.3.9', 'De 100 mega a 100 giga', ['condominio-2']],
  ['4.4.1 e 4.4.2', 'Canal lotado', ['padaria'], 16],
  ['4.4.3', 'Pedir a vez no ar', ['praca-3']],
  ['4.4.4 e 4.4.5', 'Associar e autenticar', ['cafe']],
  ['4.5', 'Bluetooth', ['academia']],
  ['4.6', 'DOCSIS por dentro', ['bairro-sul']],
  ['4.7.1 e 4.7.2', 'A ponte que aprende', ['bairro-sul-2']],
  ['4.7.3', 'Matando o laço', ['bairro-sul-3']],
  ['4.7.4', 'Quem é de qual camada', ['bairro-leste']],
  ['4.7.5', 'VLANs', ['bairro-leste-2']],
];

const ATO4: Linha[] = [
  ['5.1.1 e 5.1.2', 'Armazena e repassa', ['datacenter']],
  ['5.1.3 a 5.1.5', 'Datagrama ou circuito virtual', ['datacenter-2']],
  ['5.2.1 e 5.2.2', 'O caminho mais curto', ['anel-norte']],
  ['5.2.3', 'Inundação', ['anel-sul']],
  ['5.2.4', 'Contagem ao infinito', ['anel-leste']],
  ['5.2.5', 'Estado de enlace', ['anel-oeste']],
  ['5.2.6', 'Roteamento hierárquico', ['regiao-centro']],
  ['5.2.7 a 5.2.9', 'Um para todos, um para alguns', ['radio-cidade']],
  ['5.3', 'Congestionamento', ['avenida-2']],
  ['5.4.1 a 5.4.3', 'Filas e prioridades', ['hospital-2']],
  ['5.4.4 e 5.4.5', 'Serviços diferenciados', ['hospital-3']],
  ['5.5.1 a 5.5.4', 'Redes diferentes, um túnel', ['cidade-vizinha-2']],
  ['5.5.5 e 5.5.6', 'Fragmentação', ['cidade-vizinha-3']],
  ['5.6', 'A rede programável', ['datacenter-3']],
  ['5.7.1', 'O cabeçalho IPv4', ['prefeitura-2']],
  ['5.7.2', 'Sub-redes', ['bairros-todos']],
  ['5.7.2', 'NAT', ['bairros-todos-2']],
  ['5.7.3', 'IPv6', ['escola-v6']],
  ['5.7.4', 'ICMP, ARP e DHCP', ['bairros-todos-3']],
  ['5.7.5', 'MPLS', ['anel-centro']],
  ['5.7.6', 'OSPF', ['anel-todo']],
  ['5.7.7', 'BGP', ['saida-mundo']],
  ['5.7.8', 'Multicast', ['radio-cidade-2']],
  ['5.8', 'Política na camada de rede', ['camara-3']],
];

const ATO5: Linha[] = [
  ['6.1', 'Soquetes', ['servidores']],
  ['6.2.1 a 6.2.3', 'Aperto de mão', ['servidores-2']],
  ['6.2.4 a 6.2.6', 'Fluxo e falhas', ['servidores-3']],
  ['6.3', 'Dividir a banda com justiça', ['servidores-4']],
  ['6.4', 'UDP e tempo real', ['radio-web']],
  ['6.5.1 a 6.5.6', 'TCP por dentro', ['hospital-video']],
  ['6.5.7 e 6.5.8', 'Estados e janela do TCP', ['hospital-video-2']],
  ['6.5.9', 'Timers do TCP', ['fazenda-video']],
  ['6.5.10 e 6.5.11', 'Partida lenta e CUBIC', ['servidores-5']],
  ['6.6', 'QUIC e BBR', ['servidores-6']],
  ['6.7', 'Medir de verdade', ['servidores-7']],
];

const ATO6: Linha[] = [
  ['7.1.1 a 7.1.4', 'Nomes', ['dns']],
  ['7.1.5 a 7.1.8', 'Resolver', ['dns-2']],
  ['7.2', 'Correio', ['correio']],
  ['7.3.1 a 7.3.3', 'A teia', ['site-prefeitura']],
  ['7.3.4 e 7.3.5', 'HTTP e HTTPS', ['site-prefeitura-2']],
  ['7.4', 'Ao vivo', ['estadio']],
  ['7.5.1 a 7.5.3', 'Perto de quem assiste', ['estadio-2']],
  ['7.5.4 e 7.5.5', 'De par em par', ['estadio-3']],
];

const ATO7: Linha[] = [
  ['8.1 e 8.2', 'Anatomia de um ataque', ['soc']],
  ['8.3', 'Firewall', ['soc-2']],
  ['8.4 e 8.5', 'Segredos', ['soc-3']],
  ['8.6 e 8.7', 'Chave pública e assinatura', ['soc-4']],
  ['8.8 e 8.9', 'Certificados e autenticação', ['soc-5']],
  ['8.10', 'VPN e Wi-Fi seguro', ['soc-6']],
  ['8.11 e 8.12', 'Correio e web seguros', ['soc-7']],
  ['8.13', 'O ponto de troca', ['ix']],
];

/**
 * O prólogo não é uma seção do currículo: é a chegada ao galpão, com o roteador trancado.
 * Fica com o número 0 para não deslocar a numeração dos dias.
 */
const PROLOGO: EntradaCurriculo = { numero: 0, ato: 0, secao: 'prólogo', titulo: 'Sem senha', luz: ['roteador-galpao'], ref: 1 };

function montar(): EntradaCurriculo[] {
  const atos = [ATO0, ATO1, ATO2, ATO3, ATO4, ATO5, ATO6, ATO7];
  const out: EntradaCurriculo[] = [];
  atos.forEach((linhas, ato) => {
    for (const [secao, titulo, luz, ref] of linhas) out.push({ numero: out.length + 1, ato, secao, titulo, luz, ref });
  });
  return [PROLOGO, ...out];
}

export const CURRICULO: EntradaCurriculo[] = montar();
