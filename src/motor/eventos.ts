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
