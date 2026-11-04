/** Los ramales y los tramos de cruces, sobre vías armadas a mano. */
import { describe, expect, it } from 'vitest';
import type { GraphSegment } from '../../pipeline/05-graph';
import type { OsmWay } from '../../pipeline/lib/osm';
import { addRailStretches, railBranches, type RailBuild } from '../../pipeline/lib/rail';
import type { RailCrossing, StreetRecord } from '../../src/engine/data';
import { lineLengthM, type LngLat } from '../../src/engine/geo';

const ORIGIN: LngLat = [-58.4, -34.6];
/** Unos 111 m hacia el norte por cada paso. */
const STEP = 0.001;

function way(id: number, line: LngLat[], tags: Record<string, string> = {}): OsmWay {
  return { id, tags, line };
}

function north(from: LngLat, steps: number): LngLat[] {
  return Array.from({ length: steps + 1 }, (_, i) => [from[0], from[1] + i * STEP] as LngLat);
}

describe('ramales', () => {
  const trunk = north(ORIGIN, 20);
  const junction = trunk[20] as LngLat;
  const east = Array.from(
    { length: 41 },
    (_, i) => [junction[0] + i * STEP, junction[1]] as LngLat,
  );
  const straight = north(junction, 30);

  it('separa dos ramales y los mide desde la terminal', () => {
    const branches = railBranches([way(1, trunk), way(2, east), way(3, straight)], ORIGIN);
    expect(branches).toHaveLength(2);
    for (const branch of branches) expect(branch[0]).toEqual(ORIGIN);
    expect(lineLengthM(branches[0] ?? [])).toBeGreaterThan(lineLengthM(branches[1] ?? []));
  });

  it('una vía paralela no es otro ramal', () => {
    const twin = straight.map(([lng, lat]) => [lng + 0.0001, lat] as LngLat);
    const link = [junction, twin[0] as LngLat];
    const branches = railBranches(
      [way(1, trunk), way(3, straight), way(4, link), way(5, twin)],
      ORIGIN,
    );
    expect(branches).toHaveLength(1);
  });

  it('una vía de playa no cuenta, y lo corto tampoco', () => {
    const yard = north([ORIGIN[0] + 0.01, ORIGIN[1]], 40);
    const short = north([ORIGIN[0] + 0.02, ORIGIN[1]], 3);
    expect(railBranches([way(1, yard, { service: 'yard' })], ORIGIN)).toEqual([]);
    expect(railBranches([way(2, short)], ORIGIN)).toEqual([]);
  });

  it('si la red no llega a la terminal, arranca del punto más cercano', () => {
    const far = north([ORIGIN[0], ORIGIN[1] + 0.01], 30);
    const [branch] = railBranches([way(1, far)], ORIGIN);
    expect(branch?.[0]).toEqual(far[0]);
  });
});

describe('tramos de cruces', () => {
  const path = north(ORIGIN, 40);
  const at = (step: number) => path[step] as LngLat;
  const crossing = (street: number, step: number, kind: RailCrossing['kind']): RailCrossing => ({
    street,
    kind,
    lng: at(step)[0],
    lat: at(step)[1],
  });
  const street = (code: number, level: number): StreetRecord =>
    ({ code, level, askable: true }) as StreetRecord;
  /** Una cuadra que llega de frente a las vías en ese paso, sin cruzarlas. */
  const deadEnd = (code: number, step: number): GraphSegment =>
    ({
      code,
      flags: 0,
      line: [at(step), [at(step)[0] - 0.002, at(step)[1]]],
    }) as unknown as GraphSegment;

  function build(crossings: RailCrossing[]): RailBuild {
    return {
      lines: [
        {
          slug: 'fc-prueba',
          name: 'FC Prueba',
          geometry: [],
          crossings,
          branches: [{ crossings: crossings.map((_, i) => i) }],
          stretches: [],
        },
      ],
      unnamed: [],
      crossings: crossings.length,
      terminal: 'Terminal',
      paths: new Map([['fc-prueba', [path]]]),
    };
  }

  const streets = [street(1, 2), street(2, 2), street(3, 4), street(4, 4), street(5, 2)];

  it('arma una tarjeta entre dos avenidas, con lo que cruza y lo que no', () => {
    const rail = build([
      crossing(1, 5, 'nivel'),
      crossing(3, 10, 'viaducto'),
      crossing(2, 15, 'puente'),
    ]);
    addRailStretches(rail, streets, [deadEnd(4, 12)]);
    expect(rail.lines[0]?.stretches).toEqual([
      {
        id: 'B:fc-prueba:1-2',
        branch: 0,
        from: 1,
        to: 2,
        crossings: [1],
        closed: [{ street: 4, lng: at(12)[0], lat: at(12)[1] }],
      },
    ]);
  });

  it('entre dos avenidas seguidas sin nada que aprender no hay tarjeta', () => {
    const rail = build([crossing(1, 5, 'nivel'), crossing(2, 15, 'puente')]);
    addRailStretches(rail, streets, []);
    expect(rail.lines[0]?.stretches).toEqual([]);
  });

  it('una calle que corre al lado de las vías no llega a ellas', () => {
    const rail = build([crossing(1, 5, 'nivel'), crossing(2, 15, 'puente')]);
    const beside = {
      code: 4,
      flags: 0,
      line: [
        [at(8)[0] + 0.0002, at(8)[1]],
        [at(12)[0] + 0.0002, at(12)[1]],
      ],
    } as unknown as GraphSegment;
    addRailStretches(rail, streets, [beside]);
    expect(rail.lines[0]?.stretches).toEqual([]);
  });

  it('el tronco común de dos ramales es una sola tarjeta', () => {
    const rail = build([
      crossing(1, 5, 'nivel'),
      crossing(3, 10, 'nivel'),
      crossing(2, 15, 'nivel'),
    ]);
    const line = rail.lines[0];
    if (!line) throw new Error('Sin línea');
    line.branches.push({ crossings: [0, 1, 2] });
    rail.paths.set('fc-prueba', [path, path]);
    addRailStretches(rail, streets, []);
    expect(line.stretches).toHaveLength(1);
  });

  it('el mismo par con otras calles en otro ramal es otra tarjeta', () => {
    const rail = build([
      crossing(1, 5, 'nivel'),
      crossing(3, 10, 'nivel'),
      crossing(2, 15, 'nivel'),
      crossing(4, 12, 'nivel'),
    ]);
    const line = rail.lines[0];
    if (!line) throw new Error('Sin línea');
    line.branches = [{ crossings: [0, 1, 2] }, { crossings: [0, 3, 2] }];
    rail.paths.set('fc-prueba', [path, path]);
    addRailStretches(rail, streets, []);
    expect(line.stretches.map((s) => s.id)).toEqual(['B:fc-prueba:1-2', 'B:fc-prueba:1-2-2']);
  });
});
