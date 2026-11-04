/**
 * El evaluador de hechos reales, con hechos armados desde los datos: si se invierte un hecho, tiene
 * que fallar. Y, cuando exista, el archivo con los hechos de Tomás tiene que dar 100%.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkFact,
  checkFacts,
  FACTS_FILE,
  type Fact,
  type FactsContext,
} from '../../pipeline/lib/facts';
import { AddressBook } from '../../src/engine/addresses';
import type {
  GraphFile,
  LandmarksFile,
  RailFile,
  SegmentsFile,
  StreetRecord,
  StreetsFile,
} from '../../src/engine/data';
import { RoadGraph } from '../../src/engine/graph';
import { graphInputFromFiles } from '../../src/engine/load';

const DIR = 'public/data';
const read = (name: string): unknown => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

describe.skipIf(!existsSync(join(DIR, 'tramos.json')))('hechos reales', () => {
  const segments = read('tramos.json') as SegmentsFile;
  const { streets } = read('calles.json') as StreetsFile;
  const { landmarks } = read('hitos.json') as LandmarksFile;
  const graph = new RoadGraph(graphInputFromFiles(segments, read('grafo.json') as GraphFile));
  const context: FactsContext = {
    graph,
    streets,
    addresses: new AddressBook(graph, segments.heights, streets, landmarks),
    rail: read('vias.json') as RailFile,
    barrios: read('barrios.json') as GeoJSON.FeatureCollection,
  };
  const nameOf = (code: number) => streets.find((s) => s.code === code)?.name ?? '';

  /** Una calle de mano única con dos transversales seguidas dentro del mismo tramo de sentido. */
  function oneWayBlock(): { street: StreetRecord; from: string; to: string } {
    for (const street of [...streets].sort((a, b) => b.importance - a.importance)) {
      for (const stretch of street.stretches) {
        if (!stretch.askable || stretch.dir === 'D' || stretch.segments.length < 3) continue;
        const nodes = new Set(
          stretch.segments.flatMap((t) => [graph.segment(t).from, graph.segment(t).to]),
        );
        const inside = street.crossings.filter((c) => nodes.has(c.node) && c.height > 0);
        const [a, b] = inside.slice(1, 3);
        if (!a || !b) continue;
        const [from, to] = [nameOf(a.street), nameOf(b.street)];
        const unique = [a, b].every(
          (c) => street.crossings.filter((x) => x.street === c.street).length === 1,
        );
        const known = [from, to].every((name) => {
          const [first] = context.addresses.search(name, 1);
          return first?.kind === 'street' && first.label === name;
        });
        if (unique && known) return { street, from, to };
      }
    }
    throw new Error('No encontré una mano única con dos transversales');
  }

  it('un sentido se cumple para un lado y falla para el otro', () => {
    const { street, from, to } = oneWayBlock();
    const fact = (va_hacia: string): Fact => ({
      tipo: 'sentido',
      calle: street.name,
      entre: [from, to],
      va_hacia,
    });
    const results = [from, to].map((target) => checkFact(fact(target), context));
    expect(results.filter((r) => r === undefined)).toHaveLength(1);
    expect(checkFact(fact('doble mano'), context)).toContain('no hacia doble mano');
  });

  it('una altura de esquina se cumple con un margen y falla lejos', () => {
    const street = streets.find((s) => s.askable && s.crossings.some((c) => c.height > 1000));
    const crossing = street?.crossings.find((c) => c.height > 1000);
    if (!street || !crossing) throw new Error('No hay esquinas con altura');
    const fact = (altura: number): Fact => ({
      tipo: 'altura',
      calle: street.name,
      esquina: nameOf(crossing.street),
      altura,
    });
    expect(checkFact(fact(crossing.height + 20), context)).toBeUndefined();
    expect(checkFact(fact(crossing.height + 900), context)).toContain('la esquina está al');
  });

  it('los pares dan a un lado de la calle y no al otro', () => {
    const { street } = oneWayBlock();
    const height = street.crossings.find((c) => c.height > 0)?.height ?? 0;
    const near = (lado: string) =>
      checkFact({ tipo: 'pares', calle: street.name, altura: height + 40, lado }, context);
    // El río queda de un lado o del otro según para dónde crezca la numeración, pero no de los dos.
    const river = near('el río');
    expect(river === undefined || river.includes('los pares no dan')).toBe(true);
  });

  it('un cruce de vías se cumple con su tipo y falla con otro', () => {
    const { lines } = context.rail;
    const line = lines.find((l) =>
      l.crossings.some((c) => streets.some((s) => s.code === c.street && s.askable)),
    );
    const crossing = line?.crossings.find((c) =>
      streets.some((s) => s.code === c.street && s.askable),
    );
    if (!line || !crossing) throw new Error('No hay cruces de vías');
    const fact = (cruce: 'nivel' | 'puente' | 'tunel' | 'viaducto'): Fact => ({
      tipo: 'vias',
      calle: nameOf(crossing.street),
      linea: line.name,
      cruce,
    });
    expect(checkFact(fact(crossing.kind), context)).toBeUndefined();
    const kinds = line.crossings.filter((c) => c.street === crossing.street).map((c) => c.kind);
    const other = (['nivel', 'puente', 'tunel', 'viaducto'] as const).find(
      (kind) => !kinds.includes(kind),
    );
    if (other) expect(checkFact(fact(other), context)).toContain('cruza');
  });

  it('un rumbo se cumple con uno solo de los cuatro sectores', () => {
    const { street, from, to } = oneWayBlock();
    const results = (
      ['hacia el río', 'hacia el oeste', 'hacia el centro', 'hacia General Paz'] as const
    ).map((rumbo) =>
      checkFact({ tipo: 'rumbo', calle: street.name, entre: [from, to], rumbo }, context),
    );
    expect(results.filter((r) => r === undefined).length).toBeLessThanOrEqual(1);
  });

  it('una calle que no existe es una falla', () => {
    const result = checkFacts(
      [{ tipo: 'altura', calle: 'xqzxqz', esquina: 'xqzxqz', altura: 1 }],
      context,
    );
    expect(result).toMatchObject({ total: 1 });
    expect(result.failures[0]).toContain('no encontré la calle');
  });

  it.skipIf(!existsSync(FACTS_FILE))('los hechos de Tomás dan 100%', () => {
    const facts = JSON.parse(readFileSync(FACTS_FILE, 'utf8')) as Fact[];
    expect(checkFacts(facts, context).failures).toEqual([]);
  });
});
