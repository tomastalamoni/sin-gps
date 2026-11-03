/** Índice espacial por grilla para líneas y puntos: alcanza para consultas a decenas de metros. */
import type { LngLat } from '../../src/engine/geo';

const CELL_DEG = 0.001;

function cellRange(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
): [number, number, number, number] {
  return [
    Math.floor(minLng / CELL_DEG),
    Math.floor(minLat / CELL_DEG),
    Math.floor(maxLng / CELL_DEG),
    Math.floor(maxLat / CELL_DEG),
  ];
}

function marginDeg(lat: number, meters: number): [number, number] {
  return [meters / (111_320 * Math.cos((lat * Math.PI) / 180)), meters / 110_574];
}

export class GridIndex<T> {
  private readonly cells = new Map<string, T[]>();

  add(item: T, points: readonly LngLat[]): void {
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of points) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
    const [x0, y0, x1, y1] = cellRange(w, s, e, n);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x}:${y}`;
        const cell = this.cells.get(key);
        if (cell) cell.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  /** Candidatos cuyo recuadro está a menos de `radiusM` de alguno de los puntos. */
  near(points: readonly LngLat[], radiusM: number): Set<T> {
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [lng, lat] of points) {
      w = Math.min(w, lng);
      e = Math.max(e, lng);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
    const [dLng, dLat] = marginDeg((s + n) / 2, radiusM);
    const [x0, y0, x1, y1] = cellRange(w - dLng, s - dLat, e + dLng, n + dLat);
    const found = new Set<T>();
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (const item of this.cells.get(`${x}:${y}`) ?? []) found.add(item);
      }
    }
    return found;
  }
}
