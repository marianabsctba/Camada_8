// Enlace e rede mínimos do ato 0 e do ato 1: caminho entre hosts, ping, captura e vazão.
// Ainda não há roteador repassando pacote: só a mesma rede, atravessando switch, hub e rádio.

import { Simulador } from './eventos';
import { avaliar, type EstadoEnlace } from './fisico';
import { acharPorta, REPASSAM, type Cabo, type Equipamento, type Mundo } from './mundo';
import { ipTexto, mesmaRede } from './util';

export interface Salto {
  cabo: Cabo;
  estado: EstadoEnlace;
  de: string;
  para: string;
}

/** Busca em largura por enlaces ativos, atravessando só quem repassa quadro. */
export function caminho(m: Mundo, origem: string, destino: string): Salto[] | null {
  const anterior = new Map<string, Salto | null>([[origem, null]]);
  const fila = [origem];
  while (fila.length) {
    const atual = fila.shift()!;
    if (atual === destino) break;
    const eq = m.equipamentos.get(atual)!;
    if (atual !== origem && !REPASSAM.has(eq.tipo)) continue;
    for (const c of m.cabos.values()) {
      const outro = c.a.equip === atual ? c.b.equip : c.b.equip === atual ? c.a.equip : null;
      if (!outro || anterior.has(outro)) continue;
      const estado = avaliar(m, c);
      if (!estado.up) continue;
      anterior.set(outro, { cabo: c, estado, de: atual, para: outro });
      fila.push(outro);
    }
  }
  if (!anterior.has(destino)) return null;
  const saltos: Salto[] = [];
  let p = destino;
  while (p !== origem) {
    const s = anterior.get(p)!;
    saltos.unshift(s);
    p = s.de;
  }
  return saltos;
}

/** Atraso de encaminhamento de cada tipo de aparelho, em segundos. */
const ENCAMINHAR: Partial<Record<Equipamento['tipo'], number>> = {
  switch: 5e-6,
  hub: 5e-7,
  radio: 4e-4,
  cmts: 1e-3,
  cablemodem: 2e-3,
  'terminal-sat': 5e-3,
  'gateway-sat': 2e-3,
};

export function fer(ber: number, bits: number): number {
  return 1 - Math.exp(-ber * bits);
}

export function acharPorIp(m: Mundo, ip: number): Equipamento | undefined {
  for (const e of m.equipamentos.values()) if (e.ip && e.ip.endereco === ip) return e;
  return undefined;
}

export interface ResultadoPing {
  enviados: number;
  recebidos: number;
  rtts: number[];
  ttl?: number;
  erro?: string;
  linhas: string[];
}

const BYTES_PING = 98 + 4 + 20; // quadro de 98 bytes + FCS + preâmbulo e intervalo

export function ping(m: Mundo, deNome: string, ipDestino: number, n = 4): ResultadoPing {
  const de = m.equipamentos.get(deNome)!;
  const r: ResultadoPing = { enviados: n, recebidos: 0, rtts: [], linhas: [] };
  const falha = (erro: string): ResultadoPing => ({ ...r, recebidos: 0, erro, linhas: [erro] });
  if (!de.ip) return falha('Sem endereço IP. Eu sou só uma placa de rede com sonhos.');
  if (!mesmaRede(de.ip.endereco, ipDestino, de.ip.prefixo)) {
    return falha(`${ipTexto(ipDestino)} está fora da minha rede e eu não tenho gateway. Mando pra onde, pro além?`);
  }
  const alvo = acharPorIp(m, ipDestino);
  const saltos = alvo ? caminho(m, de.nome, alvo.nome) : null;
  if (!alvo || !saltos) {
    return { ...r, erro: 'sem resposta', linhas: Array.from({ length: n }, (_, i) => `seq=${i + 1}: ARP sem resposta. Ninguém do outro lado disse "sou eu".`) };
  }
  const volta = alvo.ip && mesmaRede(alvo.ip.endereco, de.ip.endereco, alvo.ip.prefixo);
  const sim = new Simulador();
  const bits = BYTES_PING * 8;

  // Percorre os saltos agendando cada chegada; perde o quadro com a probabilidade do enlace.
  const atravessar = (lista: Salto[], fim: () => void, perdeu: () => void) => {
    const passo = (i: number) => {
      if (i === lista.length) return fim();
      const s = lista[i]!;
      const ser = bits / (s.estado.velocidade * 1e6);
      const quem = m.equipamentos.get(s.para)!;
      const portaRx = acharPorta(m, s.cabo.a.equip === s.para ? s.cabo.a : s.cabo.b);
      sim.agendar(ser + s.estado.atrasoS + (ENCAMINHAR[quem.tipo] ?? 0), () => {
        if (m.rng() < fer(s.estado.ber, bits)) {
          portaRx.contadores.crc++;
          return perdeu();
        }
        portaRx.contadores.rx++;
        passo(i + 1);
      });
    };
    passo(0);
  };

  const ida = saltos;
  const vem = [...saltos].reverse().map((s) => ({ ...s, de: s.para, para: s.de }));
  for (let seq = 1; seq <= n; seq++) {
    sim.agendar(seq * 1.0, () => {
      const t0 = sim.agora;
      atravessar(
        ida,
        () => {
          m.ultimaCaptura = {
            eth: { origem: de.mac, destino: alvo.mac, etherType: 0x0800 },
            ip: { origem: de.ip!.endereco, destino: ipDestino, ttl: de.ttl, protocolo: 1, tamanho: 84 },
            icmp: { tipo: 8, codigo: 0, id: 0x1c8, seq },
          };
          if (!volta) {
            r.linhas.push(`seq=${seq}: o pedido chegou, mas ${alvo.nome} não sabe voltar pra ${ipTexto(de.ip!.endereco)}`);
            return;
          }
          sim.agendar(5e-5, () =>
            atravessar(
              vem,
              () => {
                const rtt = (sim.agora - t0) * 1000;
                r.recebidos++;
                r.rtts.push(rtt);
                r.ttl = alvo.ttl;
                r.linhas.push(`seq=${seq} ttl=${alvo.ttl} tempo=${rtt < 1 ? rtt.toFixed(3) : rtt.toFixed(1)} ms`);
              },
              () => r.linhas.push(`seq=${seq}: resposta perdida no caminho (erro de CRC)`),
            ),
          );
        },
        () => r.linhas.push(`seq=${seq}: pedido perdido no caminho (erro de CRC)`),
      );
    });
  }
  sim.rodar();
  return r;
}

export interface Vazao {
  mbps: number;
  gargalo: number;
  linhas: string[];
}

/** Vazão útil de TCP sobre Ethernet: 1460 bytes de dado em 1538 bytes no fio. */
export function vazao(m: Mundo, deNome: string, paraNome: string): Vazao | string {
  const saltos = caminho(m, deNome, paraNome);
  if (!saltos) return 'Sem caminho até o servidor de teste.';
  const gargalo = Math.min(...saltos.map((s) => s.estado.velocidade));
  const perda = 1 - saltos.reduce((p, s) => p * (1 - fer(s.estado.ber, 1538 * 8)), 1);
  const eficiencia = 1460 / 1538;
  const mbps = gargalo * eficiencia * Math.pow(1 - perda, 20);
  return {
    mbps,
    gargalo,
    linhas: [
      `enlace mais lento do caminho: ${gargalo} Mb/s`,
      `eficiência do quadro: 1460 de 1538 bytes = ${(eficiencia * 100).toFixed(1)} %`,
      `perda de quadros: ${(perda * 100).toFixed(4)} %`,
    ],
  };
}
