/**
 * Vías del tren y sus cruces (sección 4.10 y paso 9). Los cruces salen de OSM (puente, túnel o paso
 * a nivel) y el campo tipo_ffcc del callejero queda como fuente secundaria. Bajo un viaducto, las
 * vías no son barrera.
 */
import { lineIntersect, lineString, simplify } from '@turf/turf';
import {
  encodeLine,
  SegmentFlag,
  type RailBranch,
  type RailCrossing,
  type RailLine,
  type RailStretch,
  type StreetRecord,
} from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  distanceM,
  lineLengthM,
  pointAlong,
  projectOnLine,
  type LngLat,
} from '../../src/engine/geo';
import { cardIds, slugify } from '../../src/engine/ids';
import { normalizeName } from '../../src/engine/text';
import type { GraphSegment } from '../05-graph';
import { RAIL_TERMINAL } from '../config';
import { GridIndex } from './grid';
import { osmLayer, type OsmNode, type OsmWay } from './osm';

const LEVEL_CROSSING_M = 25;
const DEDUPE_M = 30;
/** Más corto que esto, no es un ramal: son vías de playa o de puerto. */
const MIN_BRANCH_M = 2500;
/** Un cruce es del ramal si queda a menos de esto de su eje: hay varias vías en paralelo. */
const BRANCH_NEAR_M = 80;
/** Dos puntas que corren a menos de esto son el mismo ramal. */
const SAME_BRANCH_M = 60;
/** Una calle llega a las vías si la punta de una cuadra queda a menos de esto. */
const REACH_M = 45;
/** Y llega de frente: una calle que corre al lado de las vías no llega a ningún lado. */
const MIN_REACH_DEG = 45;
/** Las calles de este nivel o más importantes limitan los tramos de cruces. */
const ANCHOR_LEVEL = 2;

const KNOWN_LINES = [
  'Mitre',
  'San Martín',
  'Belgrano',
  'Belgrano Norte',
  'Belgrano Sur',
  'Urquiza',
  'Roca',
  'Sarmiento',
];

/**
 * "FC Mitre" y "Mitre" son la misma línea. Lo que no es una línea (playas, empalmes, puentes con
 * nombre propio) queda sin nombre: se dibuja, pero no se le cuentan cruces.
 */
function lineName(raw: string | undefined): string | undefined {
  const bare = (raw ?? '').replace(/^(fc|f\.c\.|ferrocarril)\s+/i, '').trim();
  const known = KNOWN_LINES.find((line) => normalizeName(line) === normalizeName(bare));
  return known ? `FC ${known}` : undefined;
}

function fromCallejero(rail: string): RailCrossing['kind'] | undefined {
  if (/elevado/i.test(rail)) return 'viaducto';
  if (/hundido|puente vehicular/i.test(rail)) return 'puente';
  if (/t[uú]nel/i.test(rail)) return 'tunel';
  if (/paso a nivel/i.test(rail)) return 'nivel';
  return undefined;
}

export interface RailBuild {
  lines: RailLine[];
  /** Vías sin nombre (playas de maniobras): solo para dibujar. */
  unnamed: number[][];
  crossings: number;
  terminal: string;
  /** El eje de cada ramal, por línea, en el orden de `branches`. */
  paths: Map<string, LngLat[][]>;
}

interface RailNode {
  point: LngLat;
  edges: { to: string; m: number }[];
}

function nodeKey([lng, lat]: LngLat): string {
  return `${lng.toFixed(7)},${lat.toFixed(7)}`;
}

/** Las vías como red: dos vías se conectan donde comparten un punto. */
function railNetwork(ways: readonly OsmWay[]): Map<string, RailNode> {
  const network = new Map<string, RailNode>();
  const nodeAt = (point: LngLat) => {
    const key = nodeKey(point);
    const node = network.get(key) ?? { point, edges: [] };
    network.set(key, node);
    return { key, node };
  };
  for (const way of ways) {
    if (way.tags.service === 'yard') continue;
    for (let i = 1; i < way.line.length; i++) {
      const a = nodeAt(way.line[i - 1] as LngLat);
      const b = nodeAt(way.line[i] as LngLat);
      const m = distanceM(a.node.point, b.node.point);
      a.node.edges.push({ to: b.key, m });
      b.node.edges.push({ to: a.key, m });
    }
  }
  return network;
}

function largestComponent(network: ReadonlyMap<string, RailNode>): string[] {
  const seen = new Set<string>();
  let largest: string[] = [];
  for (const start of network.keys()) {
    if (seen.has(start)) continue;
    const component = [start];
    seen.add(start);
    for (const key of component) {
      for (const { to } of network.get(key)?.edges ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        component.push(to);
      }
    }
    if (component.length > largest.length) largest = component;
  }
  return largest;
}

function shortestPaths(network: ReadonlyMap<string, RailNode>, start: string) {
  const dist = new Map([[start, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set([start]);
  while (pending.size > 0) {
    let current = start;
    let best = Infinity;
    for (const key of pending) {
      const d = dist.get(key) ?? Infinity;
      if (d < best) {
        best = d;
        current = key;
      }
    }
    pending.delete(current);
    for (const { to, m } of network.get(current)?.edges ?? []) {
      if (best + m < (dist.get(to) ?? Infinity)) {
        dist.set(to, best + m);
        previous.set(to, current);
        pending.add(to);
      }
    }
  }
  return { dist, previous };
}

/**
 * Los ramales de una línea: de la terminal hasta cada punta lejana. Cada vía tiene su paralela, así
 * que una punta que corre al lado de otra ya elegida es el mismo ramal.
 */
export function railBranches(ways: readonly OsmWay[], origin: LngLat): LngLat[][] {
  const network = railNetwork(ways);
  const component = largestComponent(network);
  const pointOf = (key: string) => network.get(key)?.point as LngLat;
  const start = [...component].sort(
    (a, b) => distanceM(pointOf(a), origin) - distanceM(pointOf(b), origin),
  )[0];
  if (start === undefined) return [];
  const { dist, previous } = shortestPaths(network, start);
  const tips = component
    .filter((key) => network.get(key)?.edges.length === 1)
    .filter((key) => (dist.get(key) ?? 0) >= MIN_BRANCH_M)
    .sort((a, b) => (dist.get(b) ?? 0) - (dist.get(a) ?? 0) || a.localeCompare(b));

  const branches: LngLat[][] = [];
  for (const tip of tips) {
    const path: LngLat[] = [];
    for (let key: string | undefined = tip; key !== undefined; key = previous.get(key))
      path.push(pointOf(key));
    path.reverse();
    const length = lineLengthM(path);
    const tail = [0.8, 0.85, 0.9, 0.95, 1].map((f) => pointAlong(path, f * length));
    const known = branches.some((branch) => {
      const close = tail.filter((p) => projectOnLine(p, branch).distanceM < SAME_BRANCH_M);
      return close.length * 2 > tail.length;
    });
    if (!known) branches.push(path);
  }
  return branches;
}

/** Los cruces de un ramal en orden. Una calle que cruza varias vías seguidas cuenta una vez. */
function orderCrossings(path: readonly LngLat[], crossings: readonly RailCrossing[]): RailBranch {
  const near = crossings
    .map((c, index) => ({ index, street: c.street, at: projectOnLine([c.lng, c.lat], path) }))
    .filter((x) => x.at.distanceM <= BRANCH_NEAR_M)
    .sort((a, b) => a.at.alongM - b.at.alongM || a.street - b.street);
  const ordered = near.filter((x, i) => x.street !== near[i - 1]?.street);
  return { crossings: ordered.map((x) => x.index) };
}

interface StreetEnd {
  code: number;
  point: LngLat;
  bearing: number;
}

/** Calles que llegan de frente al ramal entre dos puntos, sin cruzar la línea en ningún lado. */
function closedStreets(
  ends: GridIndex<StreetEnd>,
  path: readonly LngLat[],
  fromM: number,
  toM: number,
  crossing: ReadonlySet<number>,
): RailStretch['closed'] {
  const steps = Math.max(2, Math.ceil((toM - fromM) / 50));
  const piece = Array.from({ length: steps + 1 }, (_, i) =>
    pointAlong(path, fromM + ((toM - fromM) * i) / steps),
  );
  const found = new Map<number, { alongM: number; point: LngLat }>();
  for (const end of ends.near(piece, REACH_M)) {
    if (crossing.has(end.code) || found.has(end.code)) continue;
    const at = projectOnLine(end.point, path);
    if (at.distanceM > REACH_M || at.alongM <= fromM || at.alongM >= toM) continue;
    const ahead = pointAlong(path, at.alongM + 10);
    const behind = pointAlong(path, Math.max(0, at.alongM - 10));
    const offset = Math.abs(angleDiff(bearingDeg(behind, ahead), end.bearing));
    if (Math.min(offset, 180 - offset) < MIN_REACH_DEG) continue;
    found.set(end.code, { alongM: at.alongM, point: end.point });
  }
  return [...found]
    .sort((a, b) => a[1].alongM - b[1].alongM || a[0] - b[0])
    .map(([street, { point }]) => ({
      street,
      lng: Math.round(point[0] * 1e6) / 1e6,
      lat: Math.round(point[1] * 1e6) / 1e6,
    }));
}

/**
 * Los tramos de cruces: una tarjeta entre cada par de avenidas seguidas, solo donde hay algo que
 * aprender (una calle que cruza o una que no). El tronco común de los ramales es una sola tarjeta.
 */
export function addRailStretches(
  rail: RailBuild,
  streets: readonly StreetRecord[],
  segments: readonly GraphSegment[],
): void {
  const byCode = new Map(streets.map((s) => [s.code, s]));
  const askable = (code: number) => byCode.get(code)?.askable === true;
  const anchor = (code: number) => askable(code) && (byCode.get(code)?.level ?? 9) <= ANCHOR_LEVEL;

  const ends = new GridIndex<StreetEnd>();
  for (const s of segments) {
    if ((s.flags & SegmentFlag.border) !== 0 || !askable(s.code)) continue;
    const first = s.line[0] as LngLat;
    const last = s.line[s.line.length - 1] as LngLat;
    const bearing = bearingDeg(first, last);
    ends.add({ code: s.code, point: first, bearing }, [first]);
    ends.add({ code: s.code, point: last, bearing }, [last]);
  }

  for (const line of rail.lines) {
    const paths = rail.paths.get(line.slug) ?? [];
    const taken = new Map<string, string>();
    // Una calle que cruza por otro ramal no sirve de "no cruza": las preguntas hablan de la línea.
    const crossesLine = new Set(line.crossings.map((c) => c.street));
    line.branches.forEach((branch, b) => {
      const path = paths[b];
      if (!path) return;
      const entries = branch.crossings.map((index) => {
        const c = line.crossings[index] as RailCrossing;
        return { index, street: c.street, alongM: projectOnLine([c.lng, c.lat], path).alongM };
      });
      const anchors = entries.filter((e) => anchor(e.street));
      anchors.forEach((first, i) => {
        const second = anchors[i + 1];
        if (!second || first.street === second.street) return;
        const between = entries.filter((e) => e.alongM > first.alongM && e.alongM < second.alongM);
        const inside = between.filter((e) => askable(e.street) && !anchor(e.street));
        const closed = closedStreets(ends, path, first.alongM, second.alongM, crossesLine);
        if (inside.length === 0 && closed.length === 0) return;

        const pair = `${first.street}-${second.street}`;
        const content = [...inside.map((e) => e.street), '|', ...closed.map((c) => c.street)].join(
          ',',
        );
        if ([...taken.values()].includes(`${pair}:${content}`)) return;
        const repeats = [...taken.values()].filter((v) => v.startsWith(`${pair}:`)).length;
        const id = cardIds.barrier(line.slug, repeats === 0 ? pair : `${pair}-${repeats + 1}`);
        taken.set(id, `${pair}:${content}`);
        const stretch: RailStretch = {
          id,
          branch: b,
          from: first.street,
          to: second.street,
          crossings: inside.map((e) => e.index),
          closed,
        };
        line.stretches.push(stretch);
      });
    });
  }
}

export function buildRail(
  railWays: readonly OsmWay[],
  osmNodes: readonly OsmNode[],
  segments: readonly GraphSegment[],
): RailBuild {
  const levelCrossings = new GridIndex<LngLat>();
  for (const node of osmNodes) {
    if (node.tags.railway === 'level_crossing') levelCrossings.add(node.point, [node.point]);
  }
  const railIndex = new GridIndex<OsmWay>();
  for (const way of railWays) railIndex.add(way, way.line);

  const groups = new Map<
    string,
    { names: string[]; ways: OsmWay[]; source: OsmWay[]; crossings: RailCrossing[] }
  >();
  const unnamed: number[][] = [];
  for (const way of railWays) {
    const name = lineName(way.tags.name);
    const simplified = simplify(lineString(way.line.map(([lng, lat]) => [lng, lat])), {
      tolerance: 0.00002,
    }).geometry.coordinates.map(([lng = 0, lat = 0]): LngLat => [lng, lat]);
    if (!name) {
      unnamed.push(encodeLine(simplified));
      continue;
    }
    const key = slugify(name);
    const group = groups.get(key) ?? { names: [], ways: [], source: [], crossings: [] };
    group.names.push(name);
    group.source.push(way);
    group.ways.push({ ...way, line: simplified });
    groups.set(key, group);
  }

  let crossings = 0;
  for (const segment of segments) {
    for (const way of railIndex.near(segment.line, 0)) {
      const name = lineName(way.tags.name);
      if (!name) continue;
      const group = groups.get(slugify(name));
      if (!group) continue;
      const hits = lineIntersect(
        lineString(segment.line.map(([lng, lat]) => [lng, lat])),
        lineString(way.line.map(([lng, lat]) => [lng, lat])),
      ).features;
      for (const hit of hits) {
        const [lng = 0, lat = 0] = hit.geometry.coordinates;
        const point: LngLat = [lng, lat];
        const railLayer = osmLayer(way.tags);
        const railBridge = way.tags.bridge && way.tags.bridge !== 'no';
        let kind: RailCrossing['kind'];
        let unconfirmed = false;
        if (segment.layer < 0 && railLayer >= 0) kind = 'tunel';
        else if (railBridge || railLayer > segment.layer) kind = 'viaducto';
        else if (segment.layer > railLayer) kind = 'puente';
        else {
          const nearLevel = [...levelCrossings.near([point], LEVEL_CROSSING_M)].some(
            (p) => distanceM(p, point) <= LEVEL_CROSSING_M,
          );
          const known = nearLevel ? 'nivel' : fromCallejero(segment.row.rail);
          kind = known ?? 'nivel';
          unconfirmed = known === undefined;
        }
        if (kind === 'viaducto') segment.flags |= SegmentFlag.underViaduct;
        const duplicate = group.crossings.some(
          (c) => c.street === segment.code && distanceM([c.lng, c.lat], point) < DEDUPE_M,
        );
        if (duplicate) continue;
        group.crossings.push({
          street: segment.code,
          kind,
          lng: Math.round(lng * 1e6) / 1e6,
          lat: Math.round(lat * 1e6) / 1e6,
          ...(unconfirmed ? { unconfirmed } : {}),
        });
        crossings++;
      }
    }
  }

  const paths = new Map<string, LngLat[][]>();
  const lines: RailLine[] = [...groups.entries()].map(([slug, group]) => {
    const branches = railBranches(group.source, RAIL_TERMINAL.point);
    paths.set(slug, branches);
    return {
      slug,
      name: [...group.names].sort((a, b) => b.length - a.length)[0] ?? slug,
      geometry: group.ways.map((w) => encodeLine(w.line)),
      crossings: group.crossings,
      branches: branches.map((path) => orderCrossings(path, group.crossings)),
      stretches: [],
    };
  });
  return { lines, unnamed, crossings, terminal: RAIL_TERMINAL.name, paths };
}
