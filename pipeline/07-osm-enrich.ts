/**
 * Pasos 8 a 10 · Cruzar con OSM y enriquecer: estados de confianza, calzadas separadas, semáforos,
 * restricciones de giro, vías del tren, nombres, nivel del currículo, tramos de sentido homogéneo,
 * transversales, importancia, hitos y fondo del mapa. Todo se calcula sobre el mismo motor de
 * grafo que usa la app.
 */
import { booleanPointInPolygon, point } from '@turf/turf';
import { analyzeConnectivity, type Connectivity } from '../src/engine/connectivity';
import type { DirectionPattern, LandmarkRecord, StreetRecord } from '../src/engine/data';
import type { LngLat } from '../src/engine/geo';
import { RoadGraph, type GraphInput } from '../src/engine/graph';
import { cardIds, slugify } from '../src/engine/ids';
import { detectPatterns } from '../src/engine/patterns';
import { Router } from '../src/engine/router';
import { TurnTable } from '../src/engine/turns';
import type { Numbering } from './02-numbering';
import type { GraphBuild, GraphSegment } from './05-graph';
import { buildNames, type NameOverride, type NamesBuild } from './06-names';
import { BARRIO_DISPLAY_NAMES, IMPORTANCE } from './config';
import { computeImportance } from './lib/analysis';
import { activeBarrioFeatures, isActiveBarrio } from './lib/area';
import {
  areaPolygons,
  coastChains,
  featureBbox,
  riverBearing,
  riverPolygons,
} from './lib/background';
import { selectLandmarks, type LandmarkBuild, type LandmarkOverride } from './lib/landmarks';
import {
  alignInferredByContinuity,
  assignConfidence,
  checkAdoptedByContinuity,
  assignSignals,
  findCarriagewayPairs,
  leftTurnLanes,
  mapRestrictions,
  validateRestrictions,
  type MappedRestrictions,
} from './lib/network';
import type { OsmFeature, OsmNode, OsmRelation, OsmWay } from './lib/osm';
import { applyCorrections, type Correction, type CorrectionsResult } from './lib/overrides';
import { addRailStretches, buildRail, type RailBuild } from './lib/rail';
import { layoutStreet } from './lib/stretches';
import { findMidBlockChanges, type MidBlockChange } from './lib/validate';
import type { WorkSegment } from './lib/types';

export interface OsmInputs {
  highways: OsmWay[];
  nodes: OsmNode[];
  restrictions: OsmRelation[];
  viaNodes: Map<number, LngLat>;
  rail: OsmWay[];
  areaWays: OsmWay[];
  areaRelations: OsmRelation[];
  coast: OsmWay[];
  landmarks: OsmFeature[];
}

export interface DataModel {
  segments: GraphSegment[];
  nodes: LngLat[];
  graphInput: GraphInput;
  graph: RoadGraph;
  streets: StreetRecord[];
  patterns: DirectionPattern[];
  landmarks: LandmarkRecord[];
  rail: RailBuild;
  background: GeoJSON.FeatureCollection;
  barriers: WorkSegment[];
  barrios: GeoJSON.FeatureCollection;
  names: NamesBuild;
  report: {
    connectivity: Connectivity;
    midBlock: MidBlockChange[];
    disagreements: GraphSegment[];
    restrictions: MappedRestrictions;
    signals: number;
    leftTurnLanes: number;
    pairs: number;
    /** Calzadas a más de 40 m que se preguntan juntas porque tienen las mismas alturas. */
    pairedByHeights: number;
    /** Cuadras con las mismas alturas y sentidos opuestos que no se pudieron emparejar. */
    conflicting: GraphSegment[];
    landmarks: LandmarkBuild;
    riverPolygons: number;
    corrections: CorrectionsResult;
    alignedInferred: number;
    /**
     * Tramos sin alturas que tomaron el sentido de OSM: cuántos no siguen a sus vecinos y cuántos,
     * por cortos y sin vecino que los confirme, quedaron con orientación inferida.
     */
    adopted: { total: number; doubtful: number; unconfirmed: number };
  };
}

function segmentLevel(s: WorkSegment): number {
  if (s.row.hierarchy === 'VÍA TRONCAL') return 1;
  if (s.row.hierarchy === 'VÍA DISTRIBUIDORA PRINCIPAL') return 2;
  if (s.row.hierarchy === 'VÍA DISTRIBUIDORA COMPLEMENTARIA') return 3;
  if (s.kind === 'a') return 3;
  if (s.kind === 'p') return 5;
  return 4;
}

const HIERARCHY_ORDER = [
  'VÍA TRONCAL',
  'VÍA DISTRIBUIDORA PRINCIPAL',
  'VÍA DISTRIBUIDORA COMPLEMENTARIA',
  'VÍA LOCAL',
];

function mostFrequent(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export function enrich(
  build: GraphBuild,
  numbering: ReadonlyMap<number, Numbering>,
  osm: OsmInputs,
  barriosGeo: GeoJSON.FeatureCollection,
  area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  overrides: {
    names: Record<string, NameOverride>;
    landmarks: Record<string, LandmarkOverride>;
    corrections: Correction[];
  },
): DataModel {
  const segments = build.segments;
  const index = new Map(segments.map((s, t) => [s, t]));

  const { disagreements: found, adopted } = assignConfidence(segments);
  const adoptedCheck = checkAdoptedByContinuity(adopted, segments, build.junctions);
  const corrections = applyCorrections(segments, overrides.corrections);
  const disagreements = [...found, ...adoptedCheck.doubtful].filter(
    (s) => s.confidence === 'en-duda',
  );
  const alignedInferred = alignInferredByContinuity(segments, build.junctions);
  const pairMap = findCarriagewayPairs(segments);
  const incident = new Map<number, number[]>();
  segments.forEach((s, t) => {
    for (const n of new Set([s.from, s.to])) {
      const list = incident.get(n);
      if (list) list.push(t);
      else incident.set(n, [t]);
    }
  });
  const signals = assignSignals(build.nodes, osm.nodes);
  const lanes = leftTurnLanes(segments, build.nodes);
  const rail = buildRail(osm.rail, osm.nodes, segments);

  const baseInput: GraphInput = {
    nodes: build.nodes,
    segments: segments.map((s) => ({
      street: s.code,
      from: s.from,
      to: s.to,
      dir: s.direction,
      doubtful: s.confidence === 'en-duda' || s.confidence === 'inferida',
      kind: s.kind,
      flags: s.flags,
      pair: pairMap.has(s) ? (index.get(pairMap.get(s) as GraphSegment) ?? -1) : -1,
      geometry: s.line,
    })),
    outside: build.outside,
    signals,
    leftTurnLanes: lanes,
  };
  const waysById = new Map(osm.highways.map((w) => [w.id, w]));
  const mapped = mapRestrictions(
    osm.restrictions,
    osm.viaNodes,
    segments,
    build.nodes,
    incident,
    waysById,
  );
  const validated = validateRestrictions(mapped.candidates, baseInput);
  const restrictions: MappedRestrictions = {
    ...validated,
    skipped: [...mapped.skipped, ...validated.skipped],
  };
  const graphInput: GraphInput = { ...baseInput, restrictions: restrictions.restrictions };
  const graph = new RoadGraph(graphInput);
  const table = new TurnTable(graph);
  const connectivity = analyzeConnectivity(graph, table);
  const importance = computeImportance(
    graph,
    new Router(graph, table),
    connectivity.inMain,
    IMPORTANCE.routes,
    IMPORTANCE.seed,
  );

  const byStreet = new Map<number, GraphSegment[]>();
  for (const s of segments) {
    const list = byStreet.get(s.code);
    if (list) list.push(s);
    else byStreet.set(s.code, [s]);
  }
  // Copia las listas: las barreras suman al nombre de su calle, pero no son tramos del grafo.
  const namingGroups = new Map<number, WorkSegment[]>(
    [...byStreet].map(([code, list]) => [code, [...list]]),
  );
  for (const barrier of build.barriers) {
    const list = namingGroups.get(barrier.code);
    if (list) list.push(barrier);
    else namingGroups.set(barrier.code, [barrier]);
  }
  const names = buildNames(namingGroups, overrides.names);

  const levels = new Map(
    [...byStreet].map(([code, list]) => [code, Math.min(...list.map(segmentLevel))]),
  );
  const levelOf = (code: number) => levels.get(code) ?? 9;
  const streetsAt = (node: number) => [
    ...new Set((incident.get(node) ?? []).map((t) => segments[t]?.code ?? -1)),
  ];

  let pairedByHeights = 0;
  const conflicting: GraphSegment[] = [];
  const streets: StreetRecord[] = [...byStreet].map(([code, list]) => {
    const layout = layoutStreet(code, list, index, pairMap, streetsAt, levelOf);
    pairedByHeights += layout.pairedByHeights;
    conflicting.push(...layout.conflicting);
    const naming = names.names.get(code);
    const inArea = list.filter((s) => s.zone === 'area');
    const barrios = [
      ...new Set(
        inArea
          .flatMap((s) => [s.row.barrio, s.row.barrioEven, s.row.barrioOdd])
          .filter(isActiveBarrio),
      ),
    ];
    const n = numbering.get(code);
    const hierarchy =
      HIERARCHY_ORDER.find((h) => list.some((s) => s.row.hierarchy === h)) ??
      mostFrequent(list.map((s) => s.row.hierarchy));
    return {
      code,
      official: naming?.official ?? '',
      name: naming?.name ?? '',
      short: naming?.short ?? '',
      aliases: naming?.aliases ?? [],
      ...(naming?.previous ? { previous: naming.previous } : {}),
      type:
        mostFrequent(list.map((s) => s.row.type).filter((t) => t !== 'PUENTE' && t !== 'TÚNEL')) ||
        (list[0]?.row.type ?? ''),
      hierarchy,
      level: levelOf(code),
      barrios,
      askable: inArea.length > 0 && inArea.filter((s) => s.noName).length < inArea.length / 2,
      importance: importance.get(code) ?? 0,
      segments: layout.ordered,
      ...(n
        ? {
            numbering: {
              start: n.start,
              end: n.end,
              startCross: n.startCross,
              startCrossNames: n.startCrossNames.map(
                (raw, i) => names.names.get(n.startCross[i] ?? -1)?.name ?? names.format(raw),
              ),
              startInArea: booleanPointInPolygon(point([n.startPoint[0], n.startPoint[1]]), area),
            },
          }
        : {}),
      crossings: layout.crossings,
      stretches: layout.stretches,
    };
  });
  streets.sort((a, b) => a.code - b.code);
  addRailStretches(rail, streets, segments);

  const midBlock = findMidBlockChanges(graphInput, build.junctions, true);
  const landmarks = selectLandmarks(osm.landmarks, area, segments, overrides.landmarks);

  const chains = coastChains(osm.coast);
  const box = featureBbox(area);
  const margin = 0.03;
  const river = riverPolygons(chains, [
    box[0] - margin,
    box[1] - margin,
    box[2] + margin,
    box[3] + margin,
  ]);
  const background: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [...river, ...areaPolygons(osm.areaWays, osm.areaRelations)],
  };

  const barrios: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: activeBarrioFeatures(barriosGeo).map((feature) => {
      const name = String(feature.properties?.nombre ?? '');
      const display = BARRIO_DISPLAY_NAMES[name] ?? name;
      const slug = slugify(display);
      return {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          id: cardIds.barrio(slug),
          name,
          display,
          slug,
          riverBearing: riverBearing(feature, chains),
        },
      };
    }),
  };

  return {
    segments,
    nodes: build.nodes,
    graphInput,
    graph,
    streets,
    patterns: detectPatterns(graph, streets),
    landmarks: landmarks.landmarks,
    rail,
    background,
    barriers: build.barriers,
    barrios,
    names,
    report: {
      connectivity,
      midBlock,
      disagreements,
      restrictions,
      signals: signals.size,
      leftTurnLanes: lanes.length / 2,
      pairs: pairMap.size / 2,
      pairedByHeights,
      conflicting,
      landmarks,
      riverPolygons: river.length,
      corrections,
      alignedInferred,
      adopted: {
        total: adopted.length,
        doubtful: adoptedCheck.doubtful.length,
        unconfirmed: adoptedCheck.unconfirmed.length,
      },
    },
  };
}
