/**
 * El buscador sobre los datos reales. Las calles y alturas salen de public/data, con semilla.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AddressBook } from '../../src/engine/addresses';
import type {
  GraphFile,
  LandmarksFile,
  SegmentsFile,
  StreetRecord,
  StreetsFile,
} from '../../src/engine/data';
import { RoadGraph } from '../../src/engine/graph';
import { graphInputFromFiles } from '../../src/engine/load';
import { createRandom } from '../../src/engine/random';

const DIR = 'public/data';
const read = (name: string): unknown => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

describe.skipIf(!existsSync(join(DIR, 'tramos.json')))('buscador con los datos reales', () => {
  const segments = read('tramos.json') as SegmentsFile;
  const graphFile = read('grafo.json') as GraphFile;
  const { streets } = read('calles.json') as StreetsFile;
  const { landmarks } = read('hitos.json') as LandmarksFile;
  const graph = new RoadGraph(graphInputFromFiles(segments, graphFile));
  const addresses = new AddressBook(graph, segments.heights, streets, landmarks);
  const byCode = new Map(streets.map((s) => [s.code, s]));
  const asked = streets.filter((s) => s.askable);

  /** Una altura en el medio de una cuadra, de la vereda que tenga. */
  function heightInside(t: number, random: ReturnType<typeof createRandom>) {
    const [l0 = 0, l1 = 0, r0 = 0, r1 = 0] = segments.heights.slice(4 * t, 4 * t + 4);
    const [from, to] = l0 > 0 && l1 > l0 ? [l0, l1] : [r0, r1];
    if (from <= 0 || to - from < 20) return undefined;
    const height = from + Math.floor((0.25 + 0.5 * random.next()) * (to - from));
    // La paridad tiene que coincidir con la vereda.
    return height % 2 === from % 2 ? height : height + 1;
  }

  it('cada calle se encuentra por su nombre, entre las primeras', () => {
    // Puede haber calles que se llaman casi igual: Carlos Pellegrini y Carlos E. Pellegrini.
    const wrong = asked.filter(
      (street) =>
        !addresses
          .search(street.name, 3)
          .some((result) => result.kind === 'street' && result.street === street.code),
    );
    expect(wrong.map((s) => s.name)).toEqual([]);
  });

  it('cada hito se encuentra por su nombre', () => {
    const wrong = landmarks.filter(
      (landmark) =>
        !addresses
          .search(landmark.name, 20)
          .some((r) => r.kind === 'landmark' && r.id === landmark.id),
    );
    expect(wrong.map((l) => l.name)).toEqual([]);
  });

  it('ida y vuelta: calle y altura → punto → la misma cuadra (1.000 direcciones)', () => {
    const random = createRandom(20_261_103);
    const wrong: string[] = [];
    let checked = 0;
    while (checked < 1000) {
      const street = random.pick(asked);
      const t = random.pick(street.segments);
      const height = heightInside(t, random);
      if (height === undefined) continue;
      const address = addresses.locate(street.code, height);
      if (address === undefined) throw new Error(`${street.name} ${height} no se encontró`);
      checked++;
      const back = addresses.reverse(address.point);
      if (back?.street !== street.code || back.segment !== address.segment)
        wrong.push(`${street.name} ${height}`);
    }
    expect(wrong).toEqual([]);
  });

  it('una dirección se encuentra escrita como la escribirías', () => {
    const random = createRandom(7);
    const wrong: string[] = [];
    for (let i = 0; i < 300; i++) {
      const street = random.pick(asked);
      const height = heightInside(random.pick(street.segments), random);
      if (height === undefined) continue;
      const [first] = addresses.search(`${street.short} ${height}`);
      if (first?.kind !== 'address' || !sameName(first.street, street))
        wrong.push(`${street.short} ${height}`);
    }
    expect(wrong).toEqual([]);
  });

  /** Dos calles distintas pueden llamarse igual en su forma corta. */
  function sameName(code: number, street: StreetRecord): boolean {
    return byCode.get(code)?.short === street.short;
  }

  it('una esquina se encuentra por las dos calles (300 cruces)', () => {
    const random = createRandom(11);
    const wrong: string[] = [];
    for (let i = 0; i < 300; i++) {
      const street = random.pick(asked);
      if (street.crossings.length === 0) continue;
      const crossing = random.pick(street.crossings);
      const other = byCode.get(crossing.street);
      if (!other) continue;
      const found = addresses
        .corners(street.code, other.code)
        .some((corner) => corner.nodes.includes(crossing.node));
      const results = addresses.search(`${street.name} y ${other.name}`);
      if (!found || results[0]?.kind !== 'corner') wrong.push(`${street.name} y ${other.name}`);
    }
    expect(wrong).toEqual([]);
  });
});
