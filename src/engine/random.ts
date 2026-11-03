/** Aleatorio con semilla: con la misma semilla sale siempre lo mismo, así se reproduce cualquier error. */
export interface Random {
  readonly seed: number;
  /** Número en [0, 1). */
  next(): number;
  /** Entero en [0, maxExclusive). */
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
}

/** Generador mulberry32: chico, rápido y suficiente para juegos y simulaciones. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    seed,
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('No hay de dónde elegir');
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}
