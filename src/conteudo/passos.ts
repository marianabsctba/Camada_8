// Roteiro do modo guiado: cada dia em passos curtos, com o porquê antes e a lição depois.

import { avaliarE1, avaliarModem, snrWifi } from '../motor/aparelhos';
import { avaliar, coaxDados, radioDados, wiremap } from '../motor/fisico';
import type { Mundo } from '../motor/mundo';
import { ipTexto, mesmaRede } from '../motor/util';
import { registroPing } from './comum';
import type { Passo } from './tipos';

const SENHA_ANTIGA = 'Xq7!pindorama';
const T568B = 'branco-laranja laranja branco-verde azul branco-azul verde branco-marrom marrom';
const T568A = 'branco-verde verde branco-laranja azul branco-azul laranja branco-marrom marrom';

const est = (m: Mundo, id: string) => avaliar(m, m.cabos.get(id)!);
const rot = (m: Mundo) => m.equipamentos.get('roteador')!.s;

function pingBom(m: Mundo, de: string, ip: string, minimo = 1, mediaMax = Infinity): true | string {
  const r = registroPing(m, de, ip);
  if (!r) return 'O ping não foi feito.';
  if (r.n < minimo) return `Foram só ${r.n} pedidos. Peça pelo menos ${minimo}.`;
  if (r.recebidos < r.n) return `Voltaram ${r.recebidos} de ${r.n}. Ainda tem perda no caminho.`;
  if (r.media >= mediaMax) return `Média de ${r.media.toFixed(0)} ms, acima de ${mediaMax} ms.`;
  return true;
}

export const PASSOS: Record<number, Passo[]> = {
  /* ---------- Dia 1: Sem senha ---------- */
  1: [
    {
      instrucao: 'Vá até o roteador e aperte E para religá-lo.',
      porque: 'Sem a senha, não dá para entrar pelo caminho normal. Mas todo roteador tem um momento frágil: os primeiros segundos do boot, quando ele aceita ser interrompido pelo cabo de console. Por isso o rack precisa ficar trancado.',
      alvo: ['equip', 'roteador'],
      acao: 'religar',
      feito: 'O roteador desligou e já está carregando o sistema. A janela para interromper é curta.',
    },
    {
      instrucao: 'Rápido: aperte E no roteador para interromper o boot.',
      porque: 'Interromper o boot leva ao modo de resgate, um mini sistema que existe para consertar o roteador. Ele não pede senha, porque quem chegou até o console já tem acesso físico ao aparelho.',
      alvo: ['equip', 'roteador'],
      acao: 'interromper',
      feito: 'Você está no modo de resgate. Aqui não tem senha nenhuma.',
    },
    {
      instrucao: 'Escolha o que o próximo boot faz com a configuração gravada.',
      porque: 'O roteador guarda a configuração (com a senha) gravada na memória permanente e lê tudo isso a cada boot. Se ele carregar essa configuração, volta a pedir a senha que você não sabe.',
      alvo: ['equip', 'roteador'],
      acao: 'inicio',
      pedir: ['modo'],
      exemplo: { modo: 'ignorar-config' },
      conferir: (m) => rot(m).inicio === 'ignorar-config' || 'Com "normal", o roteador carrega a configuração gravada, e com ela a senha que você não sabe. Peça para ignorar a configuração gravada só neste boot.',
      feito: 'Combinado: o próximo boot vai fingir que não existe configuração gravada. Ela continua lá, intacta, só não será lida.',
    },
    {
      instrucao: 'Aperte E no roteador para continuar o boot.',
      porque: 'Agora o sistema carrega sem ler a configuração gravada: sem senha e também sem nenhuma configuração.',
      alvo: ['equip', 'roteador'],
      acao: 'boot',
      feito: 'Entrou sem senha. Mas atenção: a memória está vazia. A configuração da cidade (rotas, NAT, DHCP) continua só na gravada.',
    },
    {
      instrucao: 'Traga a configuração gravada para a memória.',
      porque: 'Um roteador tem duas configurações: a gravada, lida no boot, e a em execução, que é a que vale agora. Se você salvasse agora, gravaria a memória vazia por cima da boa, e a cidade inteira ficaria sem internet.',
      alvo: ['equip', 'roteador'],
      acao: 'copiar',
      feito: 'A configuração da cidade voltou para a memória e o roteador está funcionando de novo. Veio junto a senha antiga, mas como você já está dentro, pode trocá-la.',
    },
    {
      instrucao: 'Escolha uma senha nova, com pelo menos 8 caracteres.',
      porque: 'A troca vale na memória (configuração em execução). Ainda não está gravada.',
      alvo: ['equip', 'roteador'],
      acao: 'senha',
      pedir: ['senha'],
      exemplo: { senha: 'Fim!Linha2026' },
      conferir: (m) => (rot(m).senhaRunning && rot(m).senhaRunning !== SENHA_ANTIGA) || 'A senha precisa ter 8 caracteres ou mais e ser diferente da antiga.',
      feito: 'Senha nova na memória. Falta deixar o roteador como estava antes da recuperação e gravar.',
    },
    {
      instrucao: 'Volte o registro de inicialização ao normal.',
      porque: 'Ele ainda está em "ignorar a configuração gravada". Se ficar assim, no próximo boot o roteador esquece tudo de novo, provavelmente às três da manhã.',
      alvo: ['equip', 'roteador'],
      acao: 'inicio',
      pedir: ['modo'],
      exemplo: { modo: 'normal' },
      conferir: (m) => rot(m).inicio === 'normal' || 'Se ficar em ignorar, o próximo boot carrega um roteador vazio e a cidade cai. Volte para normal.',
      feito: 'Registro normal: o próximo boot volta a ler a configuração gravada.',
    },
    {
      instrucao: 'Salve, para gravar tudo na configuração permanente.',
      porque: 'Salvar copia a configuração em execução (a da cidade, com a senha nova) por cima da gravada. Agora sim é a hora certa.',
      alvo: ['equip', 'roteador'],
      acao: 'salvar',
      conferir: (m) => rot(m).senha !== SENHA_ANTIGA || 'A senha gravada ainda é a antiga.',
      feito: 'Gravado. A cidade tem internet, a configuração está preservada e só você sabe a senha.',
    },
  ],

  /* ---------- Dia 2: Duas casas, um cabo ---------- */
  2: [
    {
      instrucao: 'Veja como está a rede do computador casa2.',
      porque: 'Antes de mexer, olhe. Endereço IP é como o endereço de uma casa: a parte da rede é a rua, e a parte do host é o número.',
      alvo: ['equip', 'casa2'],
      acao: 'mostra',
      feito: 'O casa2 está em 198.51.100.7/24. O /24 diz que os primeiros 24 bits (os três primeiros números) são a rede. A rede dele é 198.51.100.0.',
    },
    {
      instrucao: 'Coloque o casa2 na rede 192.0.2.0/24, por exemplo 192.0.2.20/24.',
      porque: 'Dois computadores só falam direto, sem roteador, se estiverem na mesma rede: os mesmos três primeiros números, com prefixo /24.',
      alvo: ['equip', 'casa2'],
      acao: 'ip',
      pedir: ['ip'],
      exemplo: { ip: '192.0.2.20/24' },
      conferir: (m) => {
        const ip = m.equipamentos.get('casa2')!.ip;
        if (!ip) return 'O endereço não foi aceito. Use o formato 192.0.2.20/24.';
        return (ip.prefixo === 24 && mesmaRede(ip.endereco, 0xc0000200, 24)) || `${ipTexto(ip.endereco)}/${ip.prefixo} não está em 192.0.2.0/24. Os três primeiros números precisam ser 192.0.2 e o prefixo /24.`;
      },
      feito: 'Casa2 na rua certa. Agora o vizinho precisa morar na mesma rua.',
    },
    {
      instrucao: 'Dê um endereço ao casa1 na mesma rede, mas com outro número final.',
      porque: 'Mesma rede (192.0.2.x) e número diferente: dois hosts com o mesmo IP brigam, e nenhum dos dois funciona direito.',
      alvo: ['equip', 'casa1'],
      acao: 'ip',
      pedir: ['ip'],
      exemplo: { ip: '192.0.2.10/24' },
      conferir: (m) => {
        const a = m.equipamentos.get('casa1')!.ip;
        const b = m.equipamentos.get('casa2')!.ip;
        if (!a) return 'O endereço não foi aceito. Use o formato 192.0.2.10/24.';
        if (b && a.endereco === b.endereco) return 'Esse é o mesmo número do casa2. Endereço repetido é conflito: escolha outro final.';
        return (b && mesmaRede(a.endereco, b.endereco, a.prefixo) && a.prefixo === 24) || 'O casa1 precisa estar na mesma rede do casa2: 192.0.2.x/24.';
      },
      feito: 'Os dois estão em 192.0.2.0/24, com números diferentes.',
    },
    {
      instrucao: 'Faça um ping do casa1 até o casa2.',
      porque: 'O ping manda um "você está aí?" (pedido de eco ICMP) e espera o "estou" (resposta de eco). É o primeiro teste de qualquer rede.',
      alvo: ['equip', 'casa1'],
      acao: 'ping',
      conferir: (m) => pingBom(m, 'casa1', ipTexto(m.equipamentos.get('casa2')!.ip!.endereco)),
      feito: 'Ida e volta funcionando. Repare no TTL das respostas: o casa2 responde com 64.',
    },
    {
      instrucao: 'Agora o contrário: ping do casa2 até o casa1.',
      porque: 'Rede é ida e volta. Às vezes o pedido chega e a resposta não sabe voltar. Testar dos dois lados evita surpresa.',
      alvo: ['equip', 'casa2'],
      acao: 'ping',
      conferir: (m) => pingBom(m, 'casa2', ipTexto(m.equipamentos.get('casa1')!.ip!.endereco)),
      feito: 'Funcionou dos dois lados. As respostas do casa1 vêm com TTL 128: cada sistema operacional começa com um valor, e isso até ajuda a adivinhar qual é.',
    },
  ],

  /* ---------- Dia 3: Bit não é byte ---------- */
  3: [
    {
      instrucao: 'Meça a vazão de verdade no computador do cliente.',
      porque: 'Antes de responder o cliente, meça. O teste de vazão manda dados e cronometra quanto chega.',
      alvo: ['equip', 'casa'],
      acao: 'vazao',
      feito: 'Deu uns 94,9 Mb/s, ou 11,87 MB/s. O "11 mega" do cliente é em megabytes. E os outros 5 % ficaram nos cabeçalhos de cada quadro.',
    },
    {
      pergunta: '1',
      instrucao: 'Responda: 100 Mb/s são quantos MB/s?',
      porque: 'Rede mede em bits (b minúsculo). Navegador mostra bytes (B maiúsculo). Um byte tem 8 bits. Então divida por 8.',
      exemplo: { resposta: '12,5' },
      feito: '100 ÷ 8 = 12,5 MB/s. Esse é o máximo teórico, com 100 % de aproveitamento.',
    },
    {
      pergunta: '2',
      instrucao: 'Responda: qual foi a vazão útil medida, em MB/s?',
      porque: 'Está no resultado do teste de vazão. Cada quadro leva 1460 bytes de dado em 1538 bytes no fio: o resto são cabeçalhos e intervalos.',
      exemplo: { resposta: '11,87' },
      feito: '11,87 MB/s, ou 94,9 % de 12,5. O cliente recebe exatamente o que contratou.',
    },
    {
      pergunta: '3',
      instrucao: 'Responda: um arquivo de 4 GiB, a 100 Mb/s, leva quantos segundos?',
      porque: 'GiB é potência de 2: 1 GiB = 2³⁰ bytes. Então 4 GiB = 4 × 1.073.741.824 bytes. Passe para bits (× 8) e divida por 100.000.000 bits por segundo.',
      exemplo: { resposta: '343,6' },
      feito: '4 × 2³⁰ × 8 ÷ 10⁸ = 343,6 segundos, quase 6 minutos. Arquivo em base 2 e rede em base 10: é daí que vem tanta confusão.',
    },
  ],

  /* ---------- Dia 4: Quem fala com quem ---------- */
  4: [
    {
      instrucao: 'Faça um ping do pc1 até o pc2.',
      porque: 'Para dissecar um pacote, primeiro é preciso que ele exista.',
      alvo: ['equip', 'pc1'],
      acao: 'ping',
      feito: 'Os pedidos passaram pelo hub e chegaram ao pc2.',
    },
    {
      instrucao: 'Veja o quadro capturado no pc1.',
      porque: 'Cada camada põe seu envelope em volta da anterior: o ICMP vai dentro do IP, que vai dentro do quadro Ethernet.',
      alvo: ['equip', 'pc1'],
      acao: 'capturar',
      feito: 'Três envelopes: Ethernet (endereços MAC), IPv4 (endereços IP, TTL, protocolo) e ICMP (o pedido de eco).',
    },
    { pergunta: '1', instrucao: 'Responda: qual é o EtherType do quadro?', porque: 'O EtherType fica no cabeçalho Ethernet e diz o que vem dentro: 0x0800 é IPv4, 0x86DD é IPv6, 0x0806 é ARP.', exemplo: { resposta: '0x0800' }, feito: '0x0800: dentro do quadro vem um pacote IPv4.' },
    { pergunta: '2', instrucao: 'Responda: qual é o número do protocolo no cabeçalho IP?', porque: 'O campo protocolo do IP diz quem vem dentro dele: 1 é ICMP, 6 é TCP, 17 é UDP.', exemplo: { resposta: '1' }, feito: '1: dentro do IP vem uma mensagem ICMP, o ping.' },
    { pergunta: '3', instrucao: 'Responda: com que TTL o pedido chegou ao pc2?', porque: 'TTL é quantos roteadores o pacote ainda pode atravessar. Cada roteador tira 1. Hub não mexe no TTL.', exemplo: { resposta: '128' }, feito: '128: o pc1 sai com 128, e nenhum roteador no caminho diminuiu.' },
    { pergunta: '4', instrucao: 'Responda: em que camada do modelo OSI fica o endereço MAC?', porque: 'Camada 1 é a física (sinal), 2 é a de enlace (quadros e MAC), 3 é a de rede (IP).', exemplo: { resposta: '2' }, feito: 'Camada 2, a de enlace: o MAC identifica a placa de rede dentro do mesmo segmento.' },
    { pergunta: '5', instrucao: 'Responda: que equipamento do caminho só repete bits, sem ler endereço?', porque: 'Olhe os aparelhos da sala. Um deles é da camada 1: recebe o sinal e repete para todas as portas.', exemplo: { resposta: 'hub' }, feito: 'O hub. Ele não lê nada, só repete, e por isso todo mundo ligado nele escuta tudo.' },
  ],

  /* ---------- Dia 5: Crimpa direito ---------- */
  5: [
    {
      instrucao: 'Passe o testador no cabo c1.',
      porque: 'O testador mostra para qual pino da outra ponta vai cada fio. Num cabo direto, o pino 1 chega no 1, o 2 no 2, e assim por diante.',
      alvo: ['cabo', 'c1'],
      acao: 'testar',
      feito: 'Os pinos 4 e 6 estão trocados: a ponta a foi crimpada "em ordem de par", e isso não é padrão nenhum.',
    },
    {
      instrucao: 'Crimpe de novo a ponta a, no padrão T568B.',
      porque: 'T568B, do pino 1 ao 8: branco-laranja, laranja, branco-verde, azul, branco-azul, verde, branco-marrom, marrom. Repare: o verde fica no pino 6, longe do branco-verde (pino 3). Os pinos 3 e 6 formam um par.',
      alvo: ['cabo', 'c1'],
      acao: 'crimpar',
      valores: { ponta: 'a' },
      pedir: ['cores'],
      exemplo: { cores: T568B },
      conferir: (m) => {
        const c = m.cabos.get('c1')!;
        const w = wiremap(c.pinosA!, c.pinosB!);
        const e = est(m, 'c1');
        if (w.tipo !== 'direto') return 'O testador acusa pinos trocados: a ponta a ainda não bate com a ponta b, que está em T568B. Confira a ordem fio por fio.';
        if (w.parDividido) return 'Continuidade OK, mas os fios dos pinos 3 e 6 não são do mesmo par. Isso é par dividido: o gigabit cai.';
        return (e.up && e.velocidade === 1000) || `O enlace não subiu a 1 Gb/s: ${e.motivos[0] ?? 'confira a ordem'}`;
      },
      feito: 'As duas pontas em T568B: cabo direto, com cada par trançado no lugar certo. O enlace subiu a 1 Gb/s.',
    },
    {
      instrucao: 'Passe o certificador no c1 para fechar o serviço.',
      porque: 'O testador barato só vê continuidade. O certificador mede a diafonia (interferência entre pares), que só fica boa com os pares nos pinos certos.',
      alvo: ['cabo', 'c1'],
      acao: 'certificar',
      feito: 'Certificado. É esse o papel que se entrega ao cliente em instalação profissional.',
    },
  ],

  /* ---------- Dia 6: Cruzado ou direto ---------- */
  6: [
    {
      instrucao: 'Veja os detalhes do cabo c3, entre os dois switches.',
      porque: 'Antes de crimpar ou trocar qualquer coisa, leia o motivo de o enlace estar fora.',
      alvo: ['cabo', 'c3'],
      acao: 'detalhes',
      feito: 'As duas portas são MDI-X e nenhuma tem auto-MDIX: o transmissor de um switch está ligado no transmissor do outro.',
    },
    {
      instrucao: 'Transforme o c3 num cabo cruzado: crimpe a ponta b em T568A.',
      porque: 'Cabo cruzado tem T568A numa ponta e T568B na outra. Assim o par que transmite de um lado (pinos 1 e 2) chega no par que recebe do outro (pinos 3 e 6). T568A: branco-verde, verde, branco-laranja, azul, branco-azul, laranja, branco-marrom, marrom.',
      alvo: ['cabo', 'c3'],
      acao: 'crimpar',
      valores: { ponta: 'b' },
      pedir: ['cores'],
      exemplo: { cores: T568A },
      conferir: (m) => est(m, 'c3').up || `Ainda fora: ${est(m, 'c3').motivos[0]}. A ponta a está em T568B; a ponta b precisa estar em T568A.`,
      feito: 'Enlace ativo. Os dois switches se enxergam.',
    },
    {
      instrucao: 'Teste com um ping da secretaria até a biblioteca.',
      porque: 'Luz acesa na porta não garante tráfego. O ping prova que os quadros atravessam os dois switches.',
      alvo: ['equip', 'pc-secretaria'],
      acao: 'ping',
      conferir: (m) => pingBom(m, 'pc-secretaria', '192.0.2.20'),
      feito: 'Respondeu. Hoje quase tudo tem auto-MDIX e cruza sozinho, mas estes switches são de 2003.',
    },
  ],

  /* ---------- Dia 7: 100 metros e um palmo ---------- */
  7: [
    {
      instrucao: 'Veja os detalhes do cabo c2, que vai até o galpão.',
      porque: 'O motivo de o enlace estar fora vem escrito no detalhe do cabo.',
      alvo: ['cabo', 'c2'],
      acao: 'detalhes',
      feito: '130 m de cobre. O padrão garante o sinal só até 100 m; depois disso, a atenuação come toda a margem.',
    },
    {
      instrucao: 'Tire o cabo c2.',
      porque: 'Não tem como esticar a física. O caminho vai ser dividido em dois trechos menores.',
      alvo: ['cabo', 'c2'],
      acao: 'desligar',
      feito: 'Cabo recolhido.',
    },
    {
      instrucao: 'Pegue um switch na estante do almoxarifado e instale no meio do pátio.',
      porque: 'Um switch no meio regenera o sinal: recebe cada bit, decide se é 0 ou 1 e manda de novo com força total. Cada trecho ganha seus próprios 100 m.',
      alvo: ['almox', 'almox'],
      acao: 'instalar',
      valores: { modelo: 'switch-din', nome: 'sw-meio' },
      feito: 'O switch sw-meio está instalado numa caixa hermética no meio do pátio.',
    },
    {
      instrucao: 'Passe um cabo do switch do escritório até o sw-meio. Quantos metros?',
      porque: 'O caminho total tem 130 m. Com o switch no meio, cada trecho fica com a metade: 65 m, dentro dos 100 m.',
      alvo: ['equip', 'sw-escritorio'],
      acao: 'cabo-novo',
      valores: { porta: 'p2', destino: 'sw-meio:p1', meio: 'cat6' },
      pedir: ['metros'],
      exemplo: { metros: '65' },
      conferir: (m) => {
        const c = [...m.cabos.values()].find((x) => x.b.equip === 'sw-meio' || x.a.equip === 'sw-meio');
        if (!c) return 'O cabo não foi passado.';
        if (c.metros > 100) return `${c.metros} m passa dos 100 m. Divida o caminho de 130 m em dois.`;
        return true;
      },
      feito: 'Primeiro trecho pronto, dentro do limite.',
    },
    {
      instrucao: 'Agora passe o cabo do sw-meio até o PC do galpão.',
      porque: 'O segundo trecho completa o caminho. Também precisa ficar abaixo dos 100 m.',
      alvo: ['equip', 'sw-meio'],
      acao: 'cabo-novo',
      valores: { porta: 'p2', destino: 'pc-galpao:eth0', meio: 'cat6' },
      pedir: ['metros'],
      exemplo: { metros: '65' },
      conferir: (m) => {
        const c = [...m.cabos.values()].find((x) => x.a.equip === 'sw-meio' && x.b.equip === 'pc-galpao');
        if (!c) return 'O cabo não foi passado.';
        return c.metros <= 100 || `${c.metros} m passa dos 100 m.`;
      },
      feito: 'Caminho completo: dois trechos de 65 m, cada um com sinal limpo.',
    },
    {
      instrucao: 'Faça 100 pings do escritório até o galpão.',
      porque: 'Um ping só não prova estabilidade. Cem seguidos sem perda, sim.',
      alvo: ['equip', 'pc-escritorio'],
      acao: 'ping',
      valores: { n: '100' },
      conferir: (m) => pingBom(m, 'pc-escritorio', '192.0.2.31', 100),
      feito: 'Cem de cem. O galpão tem internet.',
    },
  ],

  /* ---------- Dia 8: Cat errado ---------- */
  8: [
    {
      instrucao: 'Veja os detalhes do cabo c1, do switch até o servidor.',
      porque: 'As duas placas aguentam 10 Gb/s. Se o enlace subiu a 1 Gb/s, o limite está no meio.',
      alvo: ['cabo', 'c1'],
      acao: 'detalhes',
      feito: 'É Cat5e, com 80 m. Cat5e foi feito para até 1 Gb/s.',
    },
    {
      instrucao: 'Troque o c1 por um cabo que leve 10 Gb/s em 80 m.',
      porque: 'Cat5e: 1 Gb/s até 100 m. Cat6: 10 Gb/s só até 55 m. Cat6a: 10 Gb/s até 100 m.',
      alvo: ['cabo', 'c1'],
      acao: 'trocar',
      pedir: ['meio'],
      valores: { blindado: 'nao' },
      exemplo: { meio: 'cat6a' },
      conferir: (m) => {
        const e = est(m, 'c1');
        if (e.velocidade === 10000) return true;
        return m.cabos.get('c1')!.meio === 'cat6' ? 'Cat6 só leva 10 Gb/s até 55 m. Com 80 m, a porta caiu para 1 Gb/s.' : 'Esse cabo não passa de 1 Gb/s.';
      },
      feito: 'Cat6a: o enlace subiu a 10 Gb/s.',
    },
  ],

  /* ---------- Dia 9: O elevador ---------- */
  9: [
    {
      instrucao: 'Faça 200 pings da portaria até o servidor e veja a perda.',
      porque: 'Problema intermitente só aparece com teste longo.',
      alvo: ['equip', 'portaria'],
      acao: 'ping',
      valores: { n: '200' },
      feito: 'Vários pedidos perdidos por erro de CRC: os bits chegam corrompidos.',
    },
    {
      instrucao: 'Veja os contadores de erro no switch do andar.',
      porque: 'Cada quadro corrompido falha na conferência de CRC (um código de verificação no fim do quadro) e é descartado. O switch conta cada um.',
      alvo: ['equip', 'sw-andar'],
      acao: 'mostra',
      feito: 'A porta p1, da portaria, acumula erros de CRC. O cabo c1 passa colado no motor do elevador, que induz ruído nos fios.',
    },
    {
      instrucao: 'Refaça a rota do c1 longe do motor.',
      porque: 'Ruído elétrico cai muito com a distância. Afastar o cabo da fonte (e cruzar em 90° quando precisar cruzar) é a solução mais barata. Outra seria cabo blindado aterrado.',
      alvo: ['cabo', 'c1'],
      acao: 'afastar',
      feito: 'Rota nova, longe do motor. A margem de sinal voltou.',
    },
    {
      instrucao: 'Faça 1000 pings para confirmar.',
      porque: 'Mil pedidos sem perda mostram que o problema acabou de verdade.',
      alvo: ['equip', 'portaria'],
      acao: 'ping',
      valores: { n: '1000' },
      conferir: (m) => pingBom(m, 'portaria', '192.0.2.2', 1000),
      feito: 'Mil de mil. O elevador sobe e desce em paz.',
    },
  ],

  /* ---------- Dia 10: Orçamento de potência ---------- */
  10: [
    {
      instrucao: 'Meça a luz que chega nas duas pontas do c1, o enlace do distrito.',
      porque: 'Em fibra tudo se mede em dBm (potência) e dB (perda). Recebido = transmitido - perdas.',
      alvo: ['cabo', 'c1'],
      acao: 'luz',
      feito: 'Chega -18 dBm, e o receptor entende até -20 dBm: só 2 dB de folga. Qualquer calor derruba. O projeto pede 3 dB ou mais.',
    },
    {
      pergunta: '1',
      instrucao: 'Calcule a perda do c1 em 1550 nm.',
      porque: 'Fibra: 32 km × 0,22 dB/km. Conectores: 2 × 0,5 dB. Emendas: 8 × 0,1 dB. Some tudo.',
      exemplo: { resposta: '8,84' },
      feito: '7,04 + 1 + 0,8 = 8,84 dB. Em 1310 nm a mesma fibra perde 13 dB. Por isso enlace longo usa 1550 nm.',
    },
    {
      instrucao: 'Troque o transceptor do centro (porta sfp1) por um de 1550 nm.',
      porque: 'Para 32 km, o ER-40 (1550 nm, até 40 km) é o indicado. Os dois lados precisam usar o mesmo comprimento de onda.',
      alvo: ['equip', 'sw-centro'],
      acao: 'sfp:sfp1',
      pedir: ['modelo'],
      exemplo: { modelo: 'ER-40' },
      conferir: (m) => (m.equipamentos.get('sw-centro')!.portas.find((p) => p.nome === 'sfp1')!.sfp?.lambda === 1550) || 'Esse transceptor não é de 1550 nm. Em 1310 nm, 32 km de fibra perdem demais.',
      feito: 'Centro em 1550 nm. O enlace caiu, porque o distrito ainda está em 1310 nm.',
    },
    {
      instrucao: 'Agora o mesmo do outro lado: transceptor de 1550 nm no switch do distrito.',
      porque: 'Um lado transmitindo em 1550 nm e o outro esperando 1310 nm é como falar com alguém em outra língua.',
      alvo: ['equip', 'sw-distrito'],
      acao: 'sfp:sfp1',
      pedir: ['modelo'],
      exemplo: { modelo: 'ER-40' },
      conferir: (m) => {
        const e = est(m, 'c1');
        return (e.up && e.margemDb >= 3) || (e.up ? `Subiu com ${e.margemDb.toFixed(1)} dB de margem; precisa de 3 dB.` : `Fora: ${e.motivos[0]}`);
      },
      feito: 'Distrito no ar com mais de 15 dB de margem.',
    },
    {
      instrucao: 'Meça a luz no c2, o enlace curto da escola.',
      porque: 'Esse nunca subiu, e o problema é o contrário.',
      alvo: ['cabo', 'c2'],
      acao: 'luz',
      feito: 'Chega +2,6 dBm, e o receptor aguenta no máximo -3 dBm. Luz demais ofusca (satura) o receptor. Puseram um transceptor de 80 km num enlace de 2 km.',
    },
    {
      instrucao: 'Ponha um atenuador na recepção da escola. De quantos dB?',
      porque: 'Hoje chegam +2,6 dBm. O receptor trabalha entre -24 e -3 dBm. Escolha um atenuador que traga a luz para dentro dessa faixa, com folga.',
      alvo: ['equip', 'sw-escola'],
      acao: 'aten:sfp1',
      pedir: ['db'],
      exemplo: { db: '10' },
      conferir: (m) => {
        const d = est(m, 'c2').dados;
        const rx = d.rxB;
        if (rx === undefined) return true;
        return rx <= -3 || `Com esse atenuador chegam ${rx.toFixed(1)} dBm, ainda acima de -3 dBm. Precisa de mais atenuação.`;
      },
      feito: 'A escola agora recebe luz na medida.',
    },
    {
      instrucao: 'Faça o mesmo na recepção do centro (porta sfp2).',
      porque: 'Cada ponta tem seu receptor. O centro também está recebendo luz demais da escola.',
      alvo: ['equip', 'sw-centro'],
      acao: 'aten:sfp2',
      pedir: ['db'],
      exemplo: { db: '10' },
      conferir: (m) => {
        const e = est(m, 'c2');
        return (e.up && e.margemDb >= 3) || (e.up ? 'Subiu, mas com pouca margem.' : `Fora: ${e.motivos[0]}`);
      },
      feito: 'Escola no ar. Luz de menos e luz demais derrubam do mesmo jeito.',
    },
  ],

  /* ---------- Dia 11: Retroescavadeira ---------- */
  11: [
    {
      instrucao: 'Passe o OTDR no c1 para achar onde a fibra rompeu.',
      porque: 'O OTDR manda um pulso de luz e mede os ecos. A distância de cada evento sai do tempo que o eco leva para voltar.',
      alvo: ['cabo', 'c1'],
      acao: 'otdr',
      feito: 'A fibra acaba a 1340 m, bem embaixo da vala da obra. A emenda antiga a 820 m está boa.',
    },
    {
      instrucao: 'Clive a ponta da fibra e confira o ângulo do corte.',
      porque: 'A emenda só sai boa se o corte for reto, abaixo de 1°. Corte torto deixa a luz escapar na emenda.',
      alvo: ['cabo', 'c1'],
      acao: 'clivar',
      conferir: (m) => (m.flags.ultimoAngulo ?? 9) <= 1 || `Ângulo de ${String(m.flags.ultimoAngulo?.toFixed(1)).replace('.', ',')}°: torto. Clive de novo.`,
      feito: 'Corte limpo, abaixo de 1°.',
    },
    {
      instrucao: 'Funda a fibra no ponto do rompimento. A quantos metros?',
      porque: 'Use a distância que o OTDR mostrou. Abrir a caixa de emenda no lugar errado é subir e descer escada à toa.',
      alvo: ['cabo', 'c1'],
      acao: 'fundir',
      pedir: ['metros'],
      exemplo: { metros: '1340' },
      conferir: (m) => {
        const c = m.cabos.get('c1')!;
        if (c.ruptura !== undefined) return 'A fibra continua rompida. Use a distância do OTDR.';
        const ruim = (c.emendas ?? []).find((e) => e.perdaDb > 0.1);
        return !ruim || `A emenda ficou com ${ruim.perdaDb} dB, acima de 0,1 dB.`;
      },
      feito: 'Emenda com menos de 0,1 dB. O c1 voltou.',
    },
  ],

  /* ---------- Dia 12: Amarelo com aqua ---------- */
  12: [
    {
      instrucao: 'Veja os trechos da fibra c1.',
      porque: 'Um enlace óptico tem cordões nas pontas e o tronco no meio. Todos precisam ser do mesmo tipo.',
      alvo: ['cabo', 'c1'],
      acao: 'segmentos',
      feito: 'O cordão do rack é amarelo (OS2, monomodo, núcleo de 9 µm). O resto é aqua (OM3, multimodo, núcleo de 50 µm).',
    },
    {
      instrucao: 'Troque o cordão errado por um do mesmo tipo do tronco.',
      porque: 'Luz de um núcleo de 50 µm não cabe num de 9 µm: quase tudo se perde. E multimodo de 62,5 µm (OM1) não leva 10 Gb/s a 286 m.',
      alvo: ['cabo', 'c1'],
      acao: 'segmento',
      pedir: ['fibra'],
      valores: { n: '1' },
      exemplo: { fibra: 'om3' },
      conferir: (m) => {
        const e = est(m, 'c1');
        return (e.up && e.velocidade === 10000 && e.margemDb >= 3) || (e.up ? 'Subiu, mas sem folga.' : `Fora: ${e.motivos[0]}`);
      },
      feito: 'Todo o caminho em OM3: 10 Gb/s com folga.',
    },
  ],

  /* ---------- Dia 13: Nyquist manda lembranças ---------- */
  13: [
    {
      instrucao: 'Veja como está a linha do modem.',
      porque: 'Três números mandam aqui: a banda da linha (3100 Hz), a relação sinal-ruído (30 dB) e a configuração atual.',
      alvo: ['equip', 'modem'],
      acao: 'mostra',
      feito: 'Está a 2400 Bd em QPSK (2 bits por símbolo): 4,8 kb/s. Dá para muito mais.',
    },
    {
      pergunta: '1',
      instrucao: 'Calcule a capacidade de Shannon desta linha, em kb/s.',
      porque: 'C = B × log₂(1 + S/N). 30 dB em escala linear são 1000 vezes. log₂(1001) ≈ 9,97. Multiplique por 3100 Hz.',
      exemplo: { resposta: '30,9' },
      feito: 'Uns 30,9 kb/s. Nenhuma configuração passa desse teto.',
    },
    {
      instrucao: 'Configure o modem para 24 kb/s ou mais, sem passar de nenhum limite.',
      porque: 'Taxa = baud × bits por símbolo. Limites: até 6200 Bd (Nyquist = 2 × 3100 Hz); 64-QAM (6 bits) precisa de 26,5 dB de SNR, e 256-QAM precisa de 32,5 dB; e o total não pode passar de 30,9 kb/s.',
      alvo: ['equip', 'modem'],
      acao: 'modem',
      pedir: ['baud', 'mod'],
      exemplo: { baud: '4800', mod: 'qam64' },
      conferir: (m) => {
        const r = avaliarModem(m.equipamentos.get('modem')!.s as any);
        if (!r.ok) return r.motivos[0]!;
        return r.taxa >= 24000 || `Sincronizou a ${(r.taxa / 1000).toFixed(1)} kb/s. Precisa de 24 kb/s ou mais.`;
      },
      feito: 'Sincronizado. Você respeitou os três limites ao mesmo tempo: Nyquist, a SNR e Shannon.',
    },
  ],

  /* ---------- Dia 14: O E1 da prefeitura ---------- */
  14: [
    {
      instrucao: 'Veja como estão os 32 intervalos do E1.',
      porque: 'O E1 divide o tempo em 32 fatias (intervalos), de 0 a 31, que se repetem 8000 vezes por segundo.',
      alvo: ['equip', 'mux'],
      acao: 'mostra',
      feito: 'O intervalo 0 cuida do enquadramento e todos os outros estão em dados. Nada de voz.',
    },
    {
      pergunta: '1',
      instrucao: 'Responda: quantos kb/s carrega cada intervalo?',
      porque: 'Cada intervalo leva 8 bits por quadro, e são 8000 quadros por segundo.',
      exemplo: { resposta: '64' },
      feito: '8 × 8000 = 64.000 b/s = 64 kb/s. É a velocidade de uma ligação telefônica digital.',
    },
    {
      instrucao: 'Reserve 10 intervalos para voz. Quais?',
      porque: 'O 0 não se toca: ele marca o começo do quadro. O 16 fica para a sinalização das linhas de voz. Use, por exemplo, do 1 ao 10.',
      alvo: ['equip', 'mux'],
      acao: 'slot',
      valores: { uso: 'voz' },
      pedir: ['lista'],
      exemplo: { lista: '1-10' },
      conferir: (m) => {
        const r = avaliarE1(m.equipamentos.get('mux')!.s.slots);
        if (r.lof) return 'O intervalo 0 deixou de ser enquadramento e o E1 perdeu o quadro (LOF). Use intervalos a partir do 1.';
        if (m.equipamentos.get('mux')!.s.slots[16] === 'voz') return 'O 16 é da sinalização. Escolha outros intervalos.';
        return r.voz >= 10 || `Só ${r.voz} canais de voz. Precisa de 10.`;
      },
      feito: 'Dez canais de voz.',
    },
    {
      instrucao: 'Reserve o intervalo da sinalização.',
      porque: 'A sinalização (telefone fora do gancho, número discado) das linhas de voz vai num intervalo próprio, o de número 16.',
      alvo: ['equip', 'mux'],
      acao: 'slot',
      valores: { uso: 'sinalizacao' },
      pedir: ['lista'],
      exemplo: { lista: '16' },
      conferir: (m) => {
        const r = avaliarE1(m.equipamentos.get('mux')!.s.slots);
        if (r.lof) return 'O intervalo 0 é do enquadramento. Mexer nele derruba o E1.';
        if (!r.sinalizacao) return 'A sinalização precisa estar sozinha no intervalo 16.';
        return r.dados >= 1024 || `Sobrou só ${r.dados} kb/s de dados.`;
      },
      feito: 'Voz em 10 intervalos, sinalização no 16 e os 20 restantes em dados: 1280 kb/s.',
    },
  ],

  /* ---------- Dia 15: Rádio no morro ---------- */
  15: [
    {
      instrucao: 'Veja o estado do rádio do morro.',
      porque: 'O RSSI é a potência que chega ao receptor, em dBm. Quanto mais perto de zero, melhor. A meta é -65 dBm.',
      alvo: ['equip', 'radio-morro'],
      acao: 'mostra',
      feito: 'O rumo certo até o centro é 47°, e a antena aponta para 30°. A zona de Fresnel também está obstruída pelo eucaliptal.',
    },
    {
      pergunta: '1',
      instrucao: 'Calcule o raio da zona de Fresnel no meio do enlace, em metros.',
      porque: 'r = 8,657 × √(distância em km ÷ frequência em GHz) = 8,657 × √(8 ÷ 5,8).',
      exemplo: { resposta: '10,2' },
      feito: 'Uns 10,2 m. A antena precisa passar pelo menos 60 % disso (6,1 m) acima do obstáculo de 18 m: mastro com 24,1 m ou mais.',
    },
    {
      instrucao: 'Aponte e suba a antena do morro.',
      porque: 'Azimute é para onde a antena aponta, em graus a partir do norte. A antena tem feixe de 9°, então poucos graus fora já custam muito sinal. A altura precisa deixar a zona de Fresnel livre acima das árvores.',
      alvo: ['equip', 'radio-morro'],
      acao: 'antena',
      pedir: ['azimute', 'altura'],
      exemplo: { azimute: '47', altura: '25' },
      conferir: (m) => {
        const d = radioDados(m, m.cabos.get('c1')!);
        if (d.rssi >= -65) return true;
        const partes: string[] = [];
        if (d.desB > 1) partes.push(`a antena ainda está desalinhada (perde ${d.desB.toFixed(0)} dB)`);
        if (d.perdaFresnel > 0) partes.push(`a zona de Fresnel está obstruída (perde ${d.perdaFresnel.toFixed(0)} dB)`);
        return `RSSI de ${d.rssi.toFixed(0)} dBm: ${partes.join(' e ')}.`;
      },
      feito: 'RSSI perto de -60 dBm: enlace a 300 Mb/s.',
    },
  ],

  /* ---------- Dia 16: Canal lotado ---------- */
  16: [
    {
      instrucao: 'Abra o analisador de espectro no ponto de acesso.',
      porque: 'Wi-Fi divide o ar com os vizinhos. O analisador mostra quem está em qual canal e com que força.',
      alvo: ['equip', 'ap'],
      acao: 'espectro',
      feito: 'Tem vizinho forte nos canais 1 e 11, e fracos no 2 e no 10. A padaria está no 1, disputando com a casa da tia.',
    },
    {
      pergunta: '1',
      instrucao: 'Responda: quais são os três canais de 2,4 GHz que não se sobrepõem?',
      porque: 'Os canais ficam a 5 MHz um do outro, mas cada um ocupa 22 MHz. Para não sobrepor, é preciso pular 5 canais.',
      exemplo: { resposta: '1, 6 e 11' },
      feito: '1, 6 e 11.',
    },
    {
      instrucao: 'Escolha o canal do ponto de acesso.',
      porque: 'Fuja dos vizinhos fortes. Um canal sobrepõe o vizinho quando estão a menos de 5 canais de distância.',
      alvo: ['equip', 'ap'],
      acao: 'canal',
      pedir: ['canal'],
      exemplo: { canal: '6' },
      conferir: (m) => {
        const r = snrWifi(m.equipamentos.get('ap')!.s as any);
        return r.snr >= 25 || `SNR de ${r.snr.toFixed(0)} dB: esse canal ainda pega a borda de um vizinho forte (1 ou 11). Fique a 5 canais deles.`;
      },
      feito: 'Canal 6: a 5 canais do 1 e do 11, sem sobreposição. SNR acima de 30 dB.',
    },
  ],

  /* ---------- Dia 17: DOCSIS na rua ---------- */
  17: [
    {
      instrucao: 'Veja a descida coaxial, peça por peça.',
      porque: 'Do poste ao modem, cada peça perde um pouco de sinal. O modem quer receber entre -7 e +7 dBmV.',
      alvo: ['cabo', 'c1'],
      acao: 'coax-ver',
      feito: 'Chega -18 dBmV. Os vilões: um divisor de 8 vias (perde 11 dB) numa casa com um ponto só, e um conector oxidado (perde 6 dB).',
    },
    {
      instrucao: 'Tire a peça que só está desperdiçando sinal.',
      porque: 'Divisor serve para alimentar várias TVs. Cada saída a mais custa sinal para todas.',
      alvo: ['cabo', 'c1'],
      acao: 'coax-remover',
      pedir: ['n'],
      exemplo: { n: '2' },
      conferir: (m) => !m.cabos.get('c1')!.coax!.elementos.some((e) => e.tipo === 'splitter' && e.vias === 8) || 'O divisor de 8 vias continua lá.',
      feito: 'Onze dB a menos de perda.',
    },
    {
      instrucao: 'Troque a peça que está estragada.',
      porque: 'Conector oxidado perde sinal e ainda mete ruído, que derruba a qualidade da modulação (MER).',
      alvo: ['cabo', 'c1'],
      acao: 'coax-trocar',
      pedir: ['n', 'nova'],
      exemplo: { n: '2', nova: 'conector' },
      conferir: (m) => {
        const c = m.cabos.get('c1')!;
        const { nivel, mer } = coaxDados(c);
        if (c.coax!.elementos.some((e) => e.tipo === 'conector' && e.oxidado)) return 'O conector oxidado continua lá.';
        if (nivel < -7 || nivel > 7) return `Nível de ${nivel.toFixed(1)} dBmV, fora da faixa de -7 a +7.`;
        return mer >= 35 || `MER de ${mer.toFixed(0)} dB, abaixo de 35.`;
      },
      feito: 'Nível perto de -1,5 dBmV e MER de 40 dB. O modem ficou ONLINE e parou de gritar.',
    },
  ],

  /* ---------- Dia 18: Satélite e paciência ---------- */
  18: [
    {
      instrucao: 'Faça um ping do PC da fazenda até o servidor do jogo.',
      porque: 'Meça antes de culpar alguém.',
      alvo: ['equip', 'casa'],
      acao: 'ping',
      feito: 'Média perto de 500 ms. Não é defeito: é a distância até o satélite.',
    },
    {
      pergunta: '1',
      instrucao: 'Calcule quanto a luz leva para subir até o satélite e descer, em ms.',
      porque: 'Subir e descer: 2 × 35.786 km = 71.572 km. Divida pela velocidade da luz, 299.792 km/s.',
      exemplo: { resposta: '238,7' },
      feito: 'Uns 239 ms. O ping faz isso duas vezes (ida e volta): quase meio segundo só de física.',
    },
    {
      instrucao: 'Troque o terminal de satélite por outra órbita.',
      porque: 'Quanto mais baixa a órbita, menor o atraso. Geoestacionária: 35.786 km. Média: 8.062 km. Baixa: 550 km.',
      alvo: ['cabo', 'c2'],
      acao: 'orbita',
      pedir: ['orbita'],
      exemplo: { orbita: 'leo' },
      conferir: (m) => m.cabos.get('c2')!.sat!.orbita === 'leo' || (m.cabos.get('c2')!.sat!.orbita === 'meo' ? 'Órbita média ainda dá mais de 100 ms de ping. Desça mais.' : 'Continua na geoestacionária.'),
      feito: 'Órbita baixa, a 550 km.',
    },
    {
      instrucao: 'Faça 10 pings e confira a média.',
      porque: 'A meta do chamado é média abaixo de 100 ms.',
      alvo: ['equip', 'casa'],
      acao: 'ping',
      valores: { n: '10' },
      conferir: (m) => pingBom(m, 'casa', '192.0.2.60', 10, 100),
      feito: 'Média perto de 45 ms. Jogável.',
    },
  ],
};
