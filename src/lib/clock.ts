/**
 * El reloj de cada pregunta (sección 3): arranca cuando el mapa terminó de dibujarse y las opciones
 * están a la vista, y se pausa si la app pasa a segundo plano.
 */
export class QuestionClock {
  private startedAt: number | undefined;
  private elapsed = 0;
  private readonly onVisibility = () => {
    if (document.visibilityState === 'hidden') this.pause();
    else this.resume();
  };

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /** Vuelve a cero y empieza a contar. */
  start(): void {
    this.elapsed = 0;
    this.startedAt = document.visibilityState === 'hidden' ? undefined : performance.now();
  }

  private pause(): void {
    if (this.startedAt === undefined) return;
    this.elapsed += performance.now() - this.startedAt;
    this.startedAt = undefined;
  }

  private resume(): void {
    this.startedAt ??= performance.now();
  }

  /** Corta el reloj y devuelve los milisegundos que contó. */
  stop(): number {
    this.pause();
    return Math.round(this.elapsed);
  }

  dispose(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
