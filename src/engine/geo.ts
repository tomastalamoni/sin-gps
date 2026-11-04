/**
 * Geometría a escala de ciudad. Una proyección equirectangular local alcanza: en unos pocos
 * kilómetros el error es mucho menor que un metro.
 */
export type LngLat = readonly [lng: number, lat: number];

const M_PER_DEG_LAT = 110_574;
const RAD = Math.PI / 180;

function mPerDegLng(lat: number): number {
  return 111_320 * Math.cos(lat * RAD);
}

/** Distancia en metros entre dos puntos. */
export function distanceM(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * mPerDegLng((a[1] + b[1]) / 2);
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Rumbo de a hacia b, en grados: 0 es el norte y 90 el este. */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * mPerDegLng((a[1] + b[1]) / 2);
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return (Math.atan2(dx, dy) / RAD + 360) % 360;
}

/** Diferencia b − a, en (-180, 180]. Positivo es hacia la derecha (sentido horario). */
export function angleDiff(a: number, b: number): number {
  const d = (((b - a) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

export function lineLengthM(line: readonly LngLat[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++)
    total += distanceM(line[i - 1] as LngLat, line[i] as LngLat);
  return total;
}

export function reverseLine(line: readonly LngLat[]): LngLat[] {
  return [...line].reverse();
}

/** El punto que está a `d` metros del comienzo de la línea (se queda en los extremos). */
export function pointAlong(line: readonly LngLat[], d: number): LngLat {
  const first = line[0];
  if (!first) throw new Error('Línea vacía');
  if (d <= 0) return first;
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as LngLat;
    const b = line[i] as LngLat;
    const step = distanceM(a, b);
    if (walked + step >= d && step > 0) {
      const t = (d - walked) / step;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    walked += step;
  }
  return line[line.length - 1] as LngLat;
}

export interface LineProjection {
  /** Distancia del punto a la línea, en metros. */
  distanceM: number;
  /** Metros desde el comienzo de la línea hasta el punto proyectado. */
  alongM: number;
  point: LngLat;
}

/** Proyecta un punto sobre una línea: el punto más cercano y a qué distancia del comienzo está. */
export function projectOnLine(p: LngLat, line: readonly LngLat[]): LineProjection {
  const kx = mPerDegLng(p[1]);
  let best: LineProjection = { distanceM: Infinity, alongM: 0, point: line[0] ?? p };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as LngLat;
    const b = line[i] as LngLat;
    const ax = (a[0] - p[0]) * kx;
    const ay = (a[1] - p[1]) * M_PER_DEG_LAT;
    const bx = (b[0] - p[0]) * kx;
    const by = (b[1] - p[1]) * M_PER_DEG_LAT;
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * vx + ay * vy) / len2));
    const x = ax + vx * t;
    const y = ay + vy * t;
    const dist = Math.hypot(x, y);
    const step = Math.sqrt(len2);
    if (dist < best.distanceM) {
      best = {
        distanceM: dist,
        alongM: walked + step * t,
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      };
    }
    walked += step;
  }
  return best;
}

/** Si el punto cae en el polígono: el primer anillo es el borde y los demás, agujeros. */
export function pointInPolygon(point: LngLat, rings: readonly (readonly LngLat[])[]): boolean {
  const inside = (ring: readonly LngLat[]) => {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as LngLat;
      const [xj, yj] = ring[j] as LngLat;
      const crosses = yi > point[1] !== yj > point[1];
      if (crosses && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) result = !result;
    }
    return result;
  };
  const [outer, ...holes] = rings;
  return outer !== undefined && inside(outer) && !holes.some(inside);
}

/** Rumbo con el que arranca una línea, medido en sus primeros `lookM` metros. */
export function startBearing(line: readonly LngLat[], lookM: number): number {
  const first = line[0];
  if (!first) throw new Error('Línea vacía');
  return bearingDeg(first, pointAlong(line, Math.min(lookM, lineLengthM(line))));
}

/** Rumbo con el que termina una línea, medido en sus últimos `lookM` metros. */
export function endBearing(line: readonly LngLat[], lookM: number): number {
  const length = lineLengthM(line);
  const last = line[line.length - 1];
  if (!last) throw new Error('Línea vacía');
  return bearingDeg(pointAlong(line, Math.max(0, length - lookM)), last);
}
