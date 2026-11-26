// Simulador de eventos discretos. O relógio só anda quando um evento acontece.

interface Evento {
  t: number;
  ordem: number;
  fazer: () => void;
}

export class Simulador {
  agora = 0;
  private fila: Evento[] = [];
  private contador = 0;

  agendar(atraso: number, fazer: () => void): void {
    this.fila.push({ t: this.agora + atraso, ordem: this.contador++, fazer });
    this.fila.sort((a, b) => a.t - b.t || a.ordem - b.ordem);
  }

  rodar(limite = 1e6): void {
    let passos = 0;
    while (this.fila.length && passos++ < limite) {
      const e = this.fila.shift()!;
      this.agora = e.t;
      e.fazer();
    }
  }
}

/**
 * O mesmo simulador, com a fila de eventos num heap binário: mesma ordem (tempo e, no empate, ordem de
 * agendamento), mas aguenta centenas de milhares de eventos (transporte, ato 5). Pode parar num instante.
 */
export class SimuladorHeap {
  agora = 0;
  private heap: Evento[] = [];
  private contador = 0;

  private menor(a: Evento, b: Evento): boolean {
    return a.t < b.t || (a.t === b.t && a.ordem < b.ordem);
  }

  agendar(atraso: number, fazer: () => void): void {
    const h = this.heap;
    h.push({ t: this.agora + Math.max(0, atraso), ordem: this.contador++, fazer });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.menor(h[i]!, h[p]!)) break;
      [h[i], h[p]] = [h[p]!, h[i]!];
      i = p;
    }
  }

  private tirar(): Evento {
    const h = this.heap;
    const topo = h[0]!;
    const ultimo = h.pop()!;
    if (h.length) {
      h[0] = ultimo;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1;
        const b = a + 1;
        let m = i;
        if (a < h.length && this.menor(h[a]!, h[m]!)) m = a;
        if (b < h.length && this.menor(h[b]!, h[m]!)) m = b;
        if (m === i) break;
        [h[i], h[m]] = [h[m]!, h[i]!];
        i = m;
      }
    }
    return topo;
  }

  get pendentes(): number {
    return this.heap.length;
  }

  /** Roda até acabar, até "limite" eventos ou até o relógio passar de "ate" (o evento depois disso fica sem rodar). */
  rodar(limite = 1e6, ate = Infinity): number {
    let passos = 0;
    while (this.heap.length && passos < limite) {
      if (this.heap[0]!.t > ate) break;
      const e = this.tirar();
      this.agora = e.t;
      e.fazer();
      passos++;
    }
    return passos;
  }
}
