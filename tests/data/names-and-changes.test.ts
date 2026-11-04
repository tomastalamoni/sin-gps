import { describe, expect, it } from 'vitest';
import {
  applyAccents,
  AccentDictionary,
  cleanPrevious,
  naturalOrder,
  titleCase,
} from '../../pipeline/06-names';
import { computeChanges, isEmptyChanges, type DataSnapshot } from '../../pipeline/lib/changes';
import {
  encodeLine,
  type Direction,
  type DirectionStretch,
  type StreetRecord,
} from '../../src/engine/data';
import type { LngLat } from '../../src/engine/geo';

describe('nombres', () => {
  it('ordena y escribe los nombres según el español', () => {
    expect(titleCase(naturalOrder('LUGONES, LEOPOLDO AV.'))).toBe('Av. Leopoldo Lugones');
    expect(titleCase(naturalOrder('PAZ, GRAL. AV.'))).toBe('Av. Gral. Paz');
    expect(titleCase(naturalOrder('QUARTINO, JOSE N., ING. AV.'))).toBe(
      'Av. Ing. Jose N. Quartino',
    );
    expect(titleCase('AV.GRAL PAZ')).toBe('Av. Gral. Paz');
    expect(titleCase('AV. GENERAL LAS HERAS')).toBe('Av. General Las Heras');
    expect(titleCase('AV. DE LOS INCAS')).toBe('Av. de los Incas');
    expect(titleCase('PIO XII')).toBe('Pio XII');
  });

  it('toma las tildes de OSM', () => {
    const dictionary = new AccentDictionary();
    dictionary.addName('Roque Pérez');
    expect(applyAccents('Roque Perez', dictionary)).toBe('Roque Pérez');
    expect(applyAccents('ROQUE PEREZ', dictionary)).toBe('ROQUE PÉREZ');
  });

  it('limpia el nombre anterior', () => {
    expect(cleanPrevious('ZUFRIATEGUI(PARCIAL)')).toBe('ZUFRIATEGUI');
    expect(cleanPrevious('DEL LIBERTADOR GENERAL SAN MARTIN, Av.(parciales :')).toBe(
      'DEL LIBERTADOR GENERAL SAN MARTIN, Av.',
    );
    expect(cleanPrevious('(')).toBeUndefined();
  });
});

/** Un tramo de sentido sintético: cuadras sobre líneas oeste-este, en metros. */
interface StretchSpec {
  id: string;
  dir: Direction;
  /** Desde, hasta, a cuántos metros al norte y, si no es el de la tarjeta, su sentido. */
  blocks: [number, number, number?, Direction?][];
  askable?: boolean;
  split?: boolean;
}

const at = (x: number, y: number): LngLat => [-58.45 + x / 91_800, -34.58 + y / 111_000];

function street(code: number, name: string, stretches: DirectionStretch[]): StreetRecord {
  return {
    code,
    official: name,
    name,
    short: name,
    aliases: [],
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
    level: 4,
    barrios: ['Palermo'],
    askable: true,
    importance: 0,
    segments: [],
    crossings: [],
    stretches,
  };
}

function snapshot(
  version: string,
  streets: { code: number; name: string; stretches: StretchSpec[] }[],
): DataSnapshot {
  const dir: string[] = [];
  const geometry: number[][] = [];
  const records = streets.map(({ code, name, stretches }) =>
    street(
      code,
      name,
      stretches.map((spec) => ({
        id: spec.id,
        dir: spec.dir,
        confidence: 'confirmado',
        askable: spec.askable ?? true,
        splitCarriageway: spec.split ?? false,
        // La geometría va hacia donde crece la numeración: el sentido del tramo es el de la tarjeta.
        segments: spec.blocks.map(([x0, x1, y = 0, own = spec.dir]) => {
          dir.push(own);
          geometry.push(encodeLine([at(x0, y), at(x1, y)]));
          return geometry.length - 1;
        }),
      })),
    ),
  );
  return {
    version,
    streets: records,
    segments: { dir: dir.join(''), geometry },
    landmarks: [],
    barrios: ['Z:palermo'],
    barriers: [],
  };
}

describe('archivo de cambios', () => {
  const before = snapshot('v1', [
    { code: 1, name: 'Alfa', stretches: [{ id: 'S:1:1000-1999', dir: 'F', blocks: [[0, 1000]] }] },
    { code: 2, name: 'Beta', stretches: [{ id: 'S:2:1000-1999', dir: 'B', blocks: [[0, 1000]] }] },
    { code: 3, name: 'Gamma', stretches: [{ id: 'S:3:1000-1999', dir: 'F', blocks: [[0, 1000]] }] },
    {
      code: 4,
      name: 'Delta',
      stretches: [
        { id: 'S:4:1000-1499', dir: 'F', blocks: [[0, 500]] },
        { id: 'S:4:1500-1999', dir: 'B', blocks: [[500, 1000]] },
      ],
    },
    {
      code: 5,
      name: 'Épsilon',
      stretches: [
        { id: 'S:5:801-909', dir: 'F', blocks: [[0, 100, 0]] },
        { id: 'S:5:802-900', dir: 'B', blocks: [[0, 100, 20]] },
      ],
    },
    {
      code: 6,
      name: 'Zeta',
      stretches: [
        { id: 'S:6:sa1', dir: 'F', blocks: [[0, 100]] },
        { id: 'S:6:sa2', dir: 'B', blocks: [[300, 400]] },
      ],
    },
    { code: 7, name: 'Eta', stretches: [{ id: 'S:7:sa1', dir: 'F', blocks: [[0, 100]] }] },
    {
      code: 8,
      name: 'Theta',
      stretches: [{ id: 'S:8:1801-3800', dir: 'B', blocks: [[100, 300]] }],
    },
    {
      code: 9,
      name: 'Iota',
      stretches: [{ id: 'S:9:1000-1999', dir: 'F', askable: false, blocks: [[0, 1000]] }],
    },
    {
      code: 10,
      name: 'Kappa',
      stretches: [{ id: 'S:10:1000-1999', dir: 'F', blocks: [[0, 1000]] }],
    },
    {
      code: 11,
      name: 'Lambda',
      stretches: [{ id: 'S:11:1000-1999', dir: 'D', blocks: [[0, 1000]] }],
    },
  ]);
  const after = snapshot('v2', [
    // Alfa: el tramo se partió en dos, con el mismo sentido.
    {
      code: 1,
      name: 'Alfa',
      stretches: [
        { id: 'S:1:1000-1499', dir: 'F', blocks: [[0, 500]] },
        { id: 'S:1:1500-1999', dir: 'F', blocks: [[500, 1000]] },
      ],
    },
    // Beta: cambió de sentido.
    { code: 2, name: 'Beta', stretches: [{ id: 'S:2:1000-1999', dir: 'F', blocks: [[0, 1000]] }] },
    // Gamma: se renombró.
    {
      code: 3,
      name: 'Gamma Nueva',
      stretches: [{ id: 'S:3:1000-1999', dir: 'F', blocks: [[0, 1000]] }],
    },
    // Delta: la segunda mitad cambió de sentido y quedó un solo tramo.
    { code: 4, name: 'Delta', stretches: [{ id: 'S:4:1000-1999', dir: 'F', blocks: [[0, 1000]] }] },
    // Épsilon: dos calzadas sin emparejar; cambian los rangos, no los sentidos.
    {
      code: 5,
      name: 'Épsilon',
      stretches: [
        { id: 'S:5:801-901', dir: 'F', blocks: [[0, 100, 0]] },
        { id: 'S:5:800-900', dir: 'B', blocks: [[0, 100, 20]] },
      ],
    },
    // Zeta: sin alturas; el primero desapareció y el segundo pasó a ser sa1.
    { code: 6, name: 'Zeta', stretches: [{ id: 'S:6:sa1', dir: 'B', blocks: [[300, 400]] }] },
    // Eta: la misma ID, en otro lugar.
    { code: 7, name: 'Eta', stretches: [{ id: 'S:7:sa1', dir: 'F', blocks: [[1000, 1100]] }] },
    // Theta: apareció una cuadra pegada a un tramo con el sentido opuesto.
    {
      code: 8,
      name: 'Theta',
      stretches: [
        { id: 'S:8:1601-1800', dir: 'F', blocks: [[0, 100]] },
        { id: 'S:8:1801-3800', dir: 'B', blocks: [[100, 300]] },
      ],
    },
    // Iota: estaba en duda y se dio vuelta.
    { code: 9, name: 'Iota', stretches: [{ id: 'S:9:1000-1999', dir: 'B', blocks: [[0, 1000]] }] },
    // Kappa: se dio vuelta y quedó en duda.
    {
      code: 10,
      name: 'Kappa',
      stretches: [{ id: 'S:10:1000-1999', dir: 'B', askable: false, blocks: [[0, 1000]] }],
    },
    // Lambda: la avenida de doble mano ahora se dibuja con dos calzadas.
    {
      code: 11,
      name: 'Lambda',
      stretches: [
        {
          id: 'S:11:1000-1999',
          dir: 'D',
          split: true,
          blocks: [
            [0, 1000, 6, 'F'],
            [0, 1000, -6, 'B'],
          ],
        },
      ],
    },
  ]);
  const changes = computeChanges(before, after);

  it('las dos mitades de un tramo partido heredan su estado', () => {
    expect(changes.inherit['S:1:1000-1499']).toBe('S:1:1000-1999');
    expect(changes.inherit['S:1:1500-1999']).toBe('S:1:1000-1999');
    expect(changes.reset).not.toContain('S:1:1500-1999');
    expect(changes.removed).toContain('S:1:1000-1999');
  });

  it('reinicia la tarjeta de un tramo que cambió de sentido', () => {
    expect(changes.reset).toContain('S:2:1000-1999');
    expect(changes.directionChanges).toContainEqual({
      was: expect.any(String) as string,
      id: 'S:2:1000-1999',
      street: 2,
      from: 'B',
      to: 'F',
      askable: true,
    });
    expect(changes.removed).not.toContain('S:2:1000-1999');
  });

  it('si una parte cambió de sentido, reiniciar gana sobre heredar', () => {
    expect(changes.inherit['S:4:1000-1999']).toBeUndefined();
    expect(changes.reset).toContain('S:4:1000-1999');
    expect(changes.directionChanges).toContainEqual({
      was: expect.any(String) as string,
      id: 'S:4:1000-1999',
      street: 4,
      from: 'B',
      to: 'F',
      askable: true,
    });
  });

  it('una cuadra nueva no hereda del tramo de al lado', () => {
    expect(changes.inherit['S:8:1601-1800']).toBeUndefined();
    expect(changes.added).toContain('S:8:1601-1800');
    expect(changes.reset).not.toContain('S:8:1601-1800');
  });

  it('un tramo dudoso que se dio vuelta también se reinicia y enseña el cambio', () => {
    expect(changes.reset).toContain('S:9:1000-1999');
    expect(changes.directionChanges).toContainEqual({
      was: expect.any(String) as string,
      id: 'S:9:1000-1999',
      street: 9,
      from: 'F',
      to: 'B',
      askable: true,
    });
  });

  it('si quedó dudoso, se reinicia pero la lección espera', () => {
    expect(changes.reset).toContain('S:10:1000-1999');
    expect(changes.directionChanges).toContainEqual({
      was: expect.any(String) as string,
      id: 'S:10:1000-1999',
      street: 10,
      from: 'F',
      to: 'B',
      askable: false,
    });
  });

  it('pasar de una línea a dos calzadas no es un cambio de sentido', () => {
    expect(changes.reset).not.toContain('S:11:1000-1999');
    expect(changes.directionChanges.filter((c) => c.street === 11)).toEqual([]);
  });

  it('cada calzada hereda de sí misma aunque los rangos se crucen', () => {
    expect(changes.inherit['S:5:801-901']).toBe('S:5:801-909');
    expect(changes.inherit['S:5:800-900']).toBe('S:5:802-900');
    expect(changes.reset.filter((id) => id.startsWith('S:5:'))).toEqual([]);
  });

  it('un tramo sin alturas se reconoce por su lugar, no por su número', () => {
    expect(changes.inherit['S:6:sa1']).toBe('S:6:sa2');
    expect(changes.reset).not.toContain('S:6:sa1');
    expect(changes.removed).toContain('S:6:sa2');
    // La misma ID en otro lugar empieza de cero.
    expect(changes.reset).toContain('S:7:sa1');
  });

  it('reinicia la tarjeta de nombre de una calle renombrada', () => {
    expect(changes.reset).toContain('N:3');
    expect(changes.renamed).toEqual([{ street: 3, from: 'Gamma', to: 'Gamma Nueva' }]);
    const listed = [...changes.reset, ...changes.removed, ...changes.added];
    expect(listed).not.toContain('N:1');
    expect(listed).not.toContain('S:3:1000-1999');
  });

  it('dos versiones iguales no generan cambios', () => {
    expect(isEmptyChanges(computeChanges(before, { ...before, version: 'v1b' }))).toBe(true);
  });
});
