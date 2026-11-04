/**
 * Hechos reales (sección 10): datos que Tomás confirma en la calle. Se guardan en
 * tests/fixtures/hechos-reales.json y tienen que dar 100%. Cada error que aparezca después se suma
 * a esa lista.
 */
import type { AddressBook } from '../../src/engine/addresses';
import type { RailFile, RailCrossing, StreetRecord } from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  lineLengthM,
  pointAlong,
  projectOnLine,
  type LngLat,
} from '../../src/engine/geo';
import type { RoadGraph } from '../../src/engine/graph';
import { riverBearingAt, rumboOf, type Rumbo } from '../../src/engine/rumbos';
import { normalizeName } from '../../src/engine/text';

export const FACTS_FILE = 'tests/fixtures/hechos-reales.json';

/** Una altura y la esquina pueden diferir en lo que mide la esquina. */
const CORNER_TOLERANCE = 60;
/** Hasta dónde se busca la cuadra entre dos esquinas. */
const NEAR_M = 120;

export type Fact =
  /** `va_hacia`: una de las dos calles de `entre`, o "doble mano". */
  | { tipo: 'sentido'; calle: string; entre: [string, string]; va_hacia: string }
  | { tipo: 'altura'; calle: string; esquina: string; altura: number }
  /** `lado`: una calle paralela, o "el río". */
  | { tipo: 'pares'; calle: string; altura: number; lado: string }
  | { tipo: 'vias'; calle: string; linea: string; cruce: RailCrossing['kind'] }
  | { tipo: 'rumbo'; calle: string; entre: [string, string]; rumbo: Rumbo };

export interface FactsContext {
  graph: RoadGraph;
  streets: readonly StreetRecord[];
  addresses: AddressBook;
  rail: Pick<RailFile, 'lines'>;
  barrios: GeoJSON.FeatureCollection;
}

function streetNamed(context: FactsContext, name: string): StreetRecord | undefined {
  const result = context.addresses.search(name, 5).find((r) => r.kind === 'street');
  return result?.kind === 'street'
    ? context.streets.find((s) => s.code === result.street)
    : undefined;
}

/** La cuadra entre dos esquinas: su punto medio, su tramo de sentido y por dónde se circula. */
function blockBetween(context: FactsContext, street: StreetRecord, from: string, to: string) {
  const a = streetNamed(context, from);
  const b = streetNamed(context, to);
  if (!a || !b) return undefined;
  const pa = context.addresses.corners(street.code, a.code)[0]?.point;
  const pb = context.addresses.corners(street.code, b.code)[0]?.point;
  if (!pa || !pb) return undefined;
  const middle: LngLat = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
  const near = context.graph
    .nearestSegments(middle, NEAR_M)
    .find((x) => street.segments.includes(x.segment));
  if (!near) return undefined;
  const stretch = street.stretches.find((s) => s.segments.includes(near.segment));
  const segment = context.graph.segment(near.segment);
  const line = segment.geometry;
  const chord = bearingDeg(line[0] as LngLat, line[line.length - 1] as LngLat);
  const travel = segment.dir === 'B' ? (chord + 180) % 360 : chord;
  return { middle, stretch, travel, forward: bearingDeg(pa, pb) };
}

function sameDirection(a: number, b: number): boolean {
  return Math.abs(angleDiff(a, b)) < 90;
}

/** Devuelve qué falló, o undefined si el hecho se cumple. */
export function checkFact(fact: Fact, context: FactsContext): string | undefined {
  const street = streetNamed(context, fact.calle);
  if (!street) return `no encontré la calle ${fact.calle}`;

  switch (fact.tipo) {
    case 'sentido': {
      const [from, to] = fact.entre;
      const block = blockBetween(context, street, from, to);
      if (!block?.stretch) return `no encontré la cuadra de ${fact.calle} entre ${from} y ${to}`;
      const actual =
        block.stretch.dir === 'D'
          ? 'doble mano'
          : sameDirection(block.travel, block.forward)
            ? to
            : from;
      return actual === fact.va_hacia ? undefined : `va hacia ${actual}, no hacia ${fact.va_hacia}`;
    }
    case 'altura': {
      const other = streetNamed(context, fact.esquina);
      if (!other) return `no encontré la calle ${fact.esquina}`;
      const heights = street.crossings
        .filter((c) => c.street === other.code && c.height > 0)
        .map((c) => c.height);
      if (heights.length === 0) return `${fact.calle} no tiene altura en ${fact.esquina}`;
      const near = heights.some((h) => Math.abs(h - fact.altura) <= CORNER_TOLERANCE);
      return near ? undefined : `la esquina está al ${heights.join(', ')}, no al ${fact.altura}`;
    }
    case 'pares': {
      const address = context.addresses.locate(street.code, fact.altura);
      if (!address) return `no encontré ${fact.calle} ${fact.altura}`;
      const line = context.graph.segment(address.segment).geometry;
      const along = projectOnLine(address.point, line).alongM;
      const heading = bearingDeg(
        pointAlong(line, Math.max(0, along - 5)),
        pointAlong(line, Math.min(lineLengthM(line), along + 5)),
      );
      // Mirando hacia donde crece la numeración, los pares quedan a la izquierda.
      const left = (heading + 270) % 360;
      let side: number | undefined;
      if (normalizeName(fact.lado) === normalizeName('el río')) {
        side = riverBearingAt(address.point, context.barrios);
      } else {
        const other = streetNamed(context, fact.lado);
        const nearest = other?.segments
          .map((t) => projectOnLine(address.point, context.graph.segment(t).geometry))
          .sort((a, b) => a.distanceM - b.distanceM)[0];
        if (nearest) side = bearingDeg(address.point, nearest.point);
      }
      if (side === undefined) return `no pude ubicar ${fact.lado}`;
      return sameDirection(left, side) ? undefined : `los pares no dan a ${fact.lado}`;
    }
    case 'vias': {
      const wanted = normalizeName(fact.linea);
      const line = context.rail.lines.find((l) => normalizeName(l.name).includes(wanted));
      if (!line) return `no encontré la línea ${fact.linea}`;
      const kinds = line.crossings.filter((c) => c.street === street.code).map((c) => c.kind);
      if (kinds.length === 0) return `${fact.calle} no cruza ${line.name}`;
      return kinds.includes(fact.cruce) ? undefined : `cruza ${kinds.join(', ')}, no ${fact.cruce}`;
    }
    case 'rumbo': {
      const [from, to] = fact.entre;
      const block = blockBetween(context, street, from, to);
      if (!block?.stretch) return `no encontré la cuadra de ${fact.calle} entre ${from} y ${to}`;
      const river = riverBearingAt(block.middle, context.barrios);
      if (river === undefined) return 'la cuadra no está en ningún barrio';
      const bearing = block.stretch.dir === 'D' ? block.forward : block.travel;
      const rumbo = rumboOf(bearing, river);
      return rumbo === fact.rumbo
        ? undefined
        : `va ${rumbo ?? 'sin rumbo claro'}, no ${fact.rumbo}`;
    }
  }
}

export interface FactsResult {
  total: number;
  failures: string[];
}

export function checkFacts(facts: readonly Fact[], context: FactsContext): FactsResult {
  const failures = facts.flatMap((fact) => {
    const problem = checkFact(fact, context);
    return problem ? [`${fact.tipo} de ${fact.calle}: ${problem}`] : [];
  });
  return { total: facts.length, failures };
}
