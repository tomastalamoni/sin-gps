import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { labelContains } from '../../src/engine/quiz/context';
import { isPlaceHit, minAnswerZoom, resolveTap, TAP_RADIUS_PX } from '../../src/engine/quiz/tap';
import type { TapPlaceQuestion } from '../../src/engine/quiz/types';

describe('tocar el mapa', () => {
  it('cuenta la calle más cercana dentro de 14 px', () => {
    expect(
      resolveTap([
        { street: 1, distancePx: 3 },
        { street: 2, distancePx: 12 },
      ]),
    ).toEqual({ kind: 'street', street: 1 });
  });

  it('más lejos que eso no toca nada', () => {
    expect(resolveTap([{ street: 1, distancePx: TAP_RADIUS_PX + 1 }])).toEqual({ kind: 'none' });
    expect(resolveTap([])).toEqual({ kind: 'none' });
  });

  it('entre dos calles casi iguales pide tocar de nuevo', () => {
    expect(
      resolveTap([
        { street: 1, distancePx: 5 },
        { street: 2, distancePx: 8.9 },
      ]),
    ).toEqual({ kind: 'again' });
  });

  it('dos cuadras de la misma calle no son un empate', () => {
    expect(
      resolveTap([
        { street: 1, distancePx: 5 },
        { street: 1, distancePx: 6 },
      ]),
    ).toEqual({ kind: 'street', street: 1 });
  });

  it('nunca elige una calle a la que no llegó el toque', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ street: fc.nat(5), distancePx: fc.double({ min: 0, max: 30, noNaN: true }) }),
        ),
        (candidates) => {
          const result = resolveTap(candidates);
          if (result.kind !== 'street') return;
          const own = candidates.filter((c) => c.street === result.street);
          expect(Math.min(...own.map((c) => c.distancePx))).toBeLessThanOrEqual(TAP_RADIUS_PX);
        },
      ),
    );
  });

  it('el zoom mínimo deja las paralelas a 40 px', () => {
    const zoom = minAnswerZoom(-34.58);
    const metersPerPx = (78_271.517 * Math.cos((-34.58 * Math.PI) / 180)) / 2 ** zoom;
    expect(100 / metersPerPx).toBeCloseTo(40, 5);
  });

  it('un lugar se acierta cerca del punto o adentro de su superficie', () => {
    const question = {
      point: [-58.4, -34.57],
      radiusM: 150,
      bbox: [-58.41, -34.58, -58.39, -34.56],
    } as unknown as TapPlaceQuestion;
    expect(isPlaceHit(question, [-58.4005, -34.5705])).toBe(true);
    expect(isPlaceHit(question, [-58.409, -34.579])).toBe(true);
    expect(isPlaceHit(question, [-58.45, -34.57])).toBe(false);
    const small = { point: question.point, radiusM: 150 } as unknown as TapPlaceQuestion;
    expect(isPlaceHit(small, [-58.409, -34.579])).toBe(false);
  });
});

describe('etiquetas que delatan', () => {
  it('reconoce el nombre dentro de otra etiqueta, sin importar tildes ni abreviaturas', () => {
    expect(labelContains('Plaza Italia', 'Italia')).toBe(true);
    expect(labelContains('Av. Santa Fe', 'SANTA FE')).toBe(true);
    expect(labelContains('Estación Núñez', 'Nuñez')).toBe(true);
    expect(labelContains('Plaza Italia', 'Santa Fe')).toBe(false);
  });

  it('un nombre sin palabras que distingan no delata nada', () => {
    expect(labelContains('Plaza Italia', 'de la')).toBe(false);
  });
});
