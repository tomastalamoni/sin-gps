import { describe, expect, it } from 'vitest';
import type { DirectionStretch, StreetRecord } from '../../src/engine/data';
import type { LngLat } from '../../src/engine/geo';
import { RoadGraph, type SegmentInput } from '../../src/engine/graph';
import { buildOverridesFile, directionOptions } from '../../src/features/report/actions';
import { pendingStretches } from '../../src/features/verify/list';
import { outdatedOverrides, relinkOverrides, type AppData } from '../../src/lib/data';
import type { OverrideRow } from '../../src/storage/db';

function stretch(id: string, extra: Partial<DirectionStretch> = {}): DirectionStretch {
  return {
    id,
    segments: [0],
    dir: 'F',
    confidence: 'en-duda',
    askable: false,
    splitCarriageway: false,
    ...extra,
  };
}

function street(code: number, stretches: DirectionStretch[], extra = {}): StreetRecord {
  return {
    code,
    official: 'ALFA',
    name: `Calle ${String(code)}`,
    short: 'Alfa',
    aliases: [],
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
    level: 4,
    barrios: ['Palermo'],
    askable: true,
    importance: 0.1,
    segments: [0],
    crossings: [],
    stretches,
    ...extra,
  };
}

const row = (extra: Partial<OverrideRow>): OverrideRow => ({
  kind: 'sentido',
  createdAt: '2026-11-03T12:00:00.000Z',
  dataVersion: 'v1',
  ...extra,
});

describe('exportar los reportes', () => {
  it('una corrección de sentido va con los puntos y rumbos de sus cuadras', () => {
    const file = buildOverridesFile([
      row({
        street: 7,
        stretch: 'S:7:1000-1999',
        dir: 'B',
        note: 'Lo vi',
        track: [{ point: [-58.4, -34.5], bearing: 270 }],
      }),
    ]);
    expect(file.correcciones).toEqual([
      {
        fecha: '2026-11-03',
        codigo: 7,
        sentido: 'DECRECIENTE',
        tramos: [{ punto: [-58.4, -34.5], rumbo: 270 }],
        nota: 'Lo vi',
      },
    ]);
    expect(file.reportes).toEqual([]);
  });

  it('un tramo sin alturas también se exporta como corrección', () => {
    const file = buildOverridesFile([
      row({ street: 7, stretch: 'S:7:sa1', dir: 'D', track: [{ point: [-58.4, -34.5] }] }),
    ]);
    expect(file.correcciones).toHaveLength(1);
  });

  it('lo que no se puede aplicar solo va como reporte', () => {
    const file = buildOverridesFile([
      row({ kind: 'nombre', street: 7, name: 'Beta' }),
      row({ kind: 'falta-calle', note: 'Falta un pasaje', point: [-58.4, -34.5] }),
    ]);
    expect(file.correcciones).toEqual([]);
    expect(file.reportes).toHaveLength(2);
    expect(file.reportes[0]).toMatchObject({ tipo: 'nombre', nombre: 'Beta' });
    expect(file.reportes[1]).toMatchObject({ tipo: 'falta-calle', punto: [-58.4, -34.5] });
  });
});

describe('correcciones que sobran', () => {
  const data = [
    street(1, [stretch('S:1:1-99', { dir: 'B', confidence: 'confirmado', askable: true })]),
    street(2, [stretch('S:2:1-99', { dir: 'B' })]),
  ];

  it('se borra la que una versión nueva ya trae', () => {
    const rows = [row({ id: 1, street: 1, stretch: 'S:1:1-99', dir: 'B' })];
    expect(outdatedOverrides(rows, data, 'v2')).toEqual([1]);
  });

  it('en la misma versión se conserva', () => {
    const rows = [row({ id: 1, street: 1, stretch: 'S:1:1-99', dir: 'B' })];
    expect(outdatedOverrides(rows, data, 'v1')).toEqual([]);
  });

  it('un tramo sin par sigue sin confirmar: la corrección queda', () => {
    const unconfirmed = [street(3, [stretch('S:3:1-99', { dir: 'B', confidence: 'sin-par' })])];
    const rows = [row({ id: 1, street: 3, stretch: 'S:3:1-99', dir: 'B' })];
    expect(outdatedOverrides(rows, unconfirmed, 'v2')).toEqual([]);
  });

  it('se conserva si el dato sigue distinto o sigue dudoso', () => {
    const rows = [
      row({ id: 1, street: 1, stretch: 'S:1:1-99', dir: 'F' }),
      row({ id: 2, street: 2, stretch: 'S:2:1-99', dir: 'B' }),
    ];
    expect(outdatedOverrides(rows, data, 'v2')).toEqual([]);
  });

  it('un nombre corregido también', () => {
    const rows = [row({ id: 3, kind: 'nombre', street: 1, name: 'Calle 1' })];
    expect(outdatedOverrides(rows, data, 'v2')).toEqual([3]);
  });
});

describe('un tramo corregido al que le cambió la ID', () => {
  const at = (x: number): LngLat => [-58.45 + x / 91_800, -34.58];
  const graph = new RoadGraph({
    nodes: [at(0), at(100)],
    segments: [
      {
        street: 1,
        from: 0,
        to: 1,
        dir: 'F',
        doubtful: false,
        kind: 'c',
        flags: 0,
        pair: -1,
        geometry: [at(0), at(100)],
      },
    ],
  });
  const streets = [street(1, [stretch('S:1:1-120')])];

  it('se vuelve a encontrar por sus puntos', () => {
    const rows = [
      row({ id: 1, street: 1, stretch: 'S:1:1-99', dir: 'B', track: [{ point: at(50) }] }),
    ];
    expect(relinkOverrides(rows, streets, graph)).toMatchObject([{ id: 1, stretch: 'S:1:1-120' }]);
  });

  it('si ya no hay nada ahí, queda como estaba', () => {
    const rows = [
      row({ id: 1, street: 1, stretch: 'S:1:1-99', dir: 'B', track: [{ point: at(5000) }] }),
    ];
    expect(relinkOverrides(rows, streets, graph)).toEqual([]);
  });

  it('las que siguen teniendo su tramo no cambian', () => {
    const rows = [
      row({ id: 1, street: 1, stretch: 'S:1:1-120', dir: 'B', track: [{ point: at(50) }] }),
    ];
    expect(relinkOverrides(rows, streets, graph)).toEqual([]);
  });
});

describe('para verificar', () => {
  const data = (streets: StreetRecord[], flags = [0]) =>
    ({ streets, segments: { flags } }) as unknown as AppData;

  it('lista los tramos en duda y sin par, los más usados primero', () => {
    const list = pendingStretches(
      data([
        street(1, [stretch('S:1:1-99')], { importance: 0.2 }),
        street(2, [stretch('S:2:1-99', { confidence: 'sin-par' })], { importance: 0.9 }),
        street(3, [stretch('S:3:1-99', { confidence: 'confirmado' })], { importance: 1 }),
        street(4, [stretch('S:4:1-99', { confidence: 'inferida' })], { importance: 1 }),
      ]),
    );
    expect(list.map((item) => item.stretch.id)).toEqual(['S:2:1-99', 'S:1:1-99']);
  });

  it('saca lo ya corregido, las calzadas separadas y la zona de borde', () => {
    expect(pendingStretches(data([street(1, [stretch('S:1:1-99', { corrected: true })])]))).toEqual(
      [],
    );
    expect(
      pendingStretches(data([street(1, [stretch('S:1:1-99', { splitCarriageway: true })])])),
    ).toEqual([]);
    expect(pendingStretches(data([street(1, [stretch('S:1:1-99')])], [1]))).toEqual([]);
  });
});

describe('respuestas de un tramo', () => {
  const at = (x: number): LngLat => [-58.45 + x / 91_800, -34.58];
  const segment: SegmentInput = {
    street: 1,
    from: 0,
    to: 1,
    dir: 'F',
    doubtful: false,
    kind: 'c',
    flags: 0,
    pair: -1,
    geometry: [at(0), at(100)],
  };
  const graph = new RoadGraph({ nodes: [at(0), at(100)], segments: [segment] });
  const names: Record<number, string> = { 10: 'Primera', 20: 'Segunda' };
  const nameOf = (code: number) => names[code];

  it('usa las transversales de las puntas del tramo', () => {
    const record = street(1, [], {
      crossings: [
        { street: 10, node: 0, height: 1000 },
        { street: 20, node: 1, height: 1100 },
      ],
    });
    expect(directionOptions(graph, record, stretch('S:1:1-99'), nameOf)).toEqual([
      { dir: 'F', label: 'Va hacia Segunda' },
      { dir: 'B', label: 'Va hacia Primera' },
      { dir: 'D', label: 'Es doble mano' },
    ]);
  });

  it('elige la punta por la geometría, no por el orden de la lista', () => {
    const record = street(1, [], {
      crossings: [
        { street: 20, node: 1, height: 0 },
        { street: 10, node: 0, height: 0 },
      ],
    });
    const [forward, backward] = directionOptions(graph, record, stretch('S:1:sa1'), nameOf);
    expect(forward?.label).toBe('Va hacia Segunda');
    expect(backward?.label).toBe('Va hacia Primera');
    // Si la cuadra está dibujada al revés de la numeración, la numeración crece hacia el otro lado.
    const [flipped] = directionOptions(graph, record, stretch('S:1:sa1', { against: [0] }), nameOf);
    expect(flipped?.label).toBe('Va hacia Primera');
  });

  it('sin transversales, habla de la numeración', () => {
    const [first] = directionOptions(graph, street(1, []), stretch('S:1:1-99'), nameOf);
    expect(first?.label).toBe('Va hacia donde crece la numeración');
  });
});
