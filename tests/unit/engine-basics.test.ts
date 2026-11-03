import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeLine, encodeLine } from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  distanceM,
  lineLengthM,
  pointAlong,
  projectOnLine,
  type LngLat,
} from '../../src/engine/geo';
import { isCardId, slugify } from '../../src/engine/ids';
import { createRandom } from '../../src/engine/random';
import { nameSimilarity, normalizeName, stripAccents } from '../../src/engine/text';

describe('geo', () => {
  const a: LngLat = [-58.45, -34.58];
  const north: LngLat = [-58.45, -34.579];
  const east: LngLat = [-58.449, -34.58];

  it('mide distancias y rumbos a escala de ciudad', () => {
    expect(distanceM(a, north)).toBeCloseTo(110.6, 0);
    expect(bearingDeg(a, north)).toBeCloseTo(0, 5);
    expect(bearingDeg(a, east)).toBeCloseTo(90, 5);
  });

  it('calcula la diferencia de ángulos con signo (derecha positiva)', () => {
    expect(angleDiff(0, 90)).toBe(90);
    expect(angleDiff(0, 270)).toBe(-90);
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 190)).toBe(180);
  });

  it('proyecta un punto sobre una línea', () => {
    const line: LngLat[] = [a, east];
    const projection = projectOnLine([-58.4495, -34.5799], line);
    expect(projection.distanceM).toBeCloseTo(11.06, 1);
    expect(projection.alongM).toBeCloseTo(lineLengthM(line) / 2, 0);
    expect(pointAlong(line, lineLengthM(line) / 2)[0]).toBeCloseTo(-58.4495, 6);
  });
});

describe('data', () => {
  it('codifica y decodifica líneas sin perder precisión de 6 decimales', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.double({ min: -58.6, max: -58.3, noNaN: true }),
            fc.double({ min: -34.7, max: -34.5, noNaN: true }),
          ),
          {
            minLength: 2,
            maxLength: 8,
          },
        ),
        (points) => {
          const decoded = decodeLine(encodeLine(points));
          decoded.forEach(([lng, lat], i) => {
            expect(Math.abs(lng - (points[i]?.[0] ?? 0))).toBeLessThanOrEqual(5e-7);
            expect(Math.abs(lat - (points[i]?.[1] ?? 0))).toBeLessThanOrEqual(5e-7);
          });
        },
      ),
    );
  });
});

describe('text', () => {
  it('compara nombres con abreviaturas, tildes y orden distintos', () => {
    expect(nameSimilarity('GRAL. PAZ AV.', 'Avenida General Paz')).toBe(1);
    expect(nameSimilarity('LUGONES, LEOPOLDO AV.', 'Avenida Leopoldo Lugones')).toBe(1);
    expect(nameSimilarity('LUGONES, LEOPOLDO AV.', 'Avenida del Libertador')).toBe(0);
    expect(normalizeName('Pje. Ñandú')).toBe('pasaje ñandu');
    expect(stripAccents('Núñez')).toBe('Nuñez');
  });
});

describe('ids', () => {
  it('arma slugs y reconoce las IDs tipadas', () => {
    expect(slugify('Villa Urquiza')).toBe('villa-urquiza');
    expect(slugify('Núñez')).toBe('nunez');
    for (const id of [
      'N:12152',
      'S:12152:1000-1899',
      'A:12152:2000',
      'T:12152:asc:4012',
      'B:mitre-tigre:a-b',
      'H:planetario',
      'Z:nunez',
    ]) {
      expect(isCardId(id), id).toBe(true);
    }
    expect(isCardId('X:1')).toBe(false);
    expect(isCardId('N:abc')).toBe(false);
  });
});

describe('random', () => {
  it('con la misma semilla repite la secuencia', () => {
    const first = createRandom(42);
    const second = createRandom(42);
    expect(Array.from({ length: 5 }, () => first.next())).toEqual(
      Array.from({ length: 5 }, () => second.next()),
    );
  });
});
