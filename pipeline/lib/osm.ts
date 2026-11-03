/** Lectura de las respuestas de Overpass guardadas en pipeline/raw/. */
import { readFile } from 'node:fs/promises';
import type { LngLat } from '../../src/engine/geo';
import { latestRaw, overpassProblem } from './raw';

export type Tags = Record<string, string>;

export interface OsmWay {
  id: number;
  tags: Tags;
  line: LngLat[];
}

export interface OsmNode {
  id: number;
  tags: Tags;
  point: LngLat;
}

export interface OsmRelation {
  id: number;
  tags: Tags;
  members: { type: 'node' | 'way' | 'relation'; ref: number; role: string; line?: LngLat[] }[];
}

/** Un elemento con un punto representativo (nodo, o centro de una vía o relación). */
export interface OsmFeature {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags: Tags;
  point: LngLat;
  /** Recuadro (oeste, sur, este, norte), si lo trajo Overpass. */
  bounds?: [number, number, number, number];
}

interface RawElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Tags;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  geometry?: ({ lat: number; lon: number } | null)[];
  members?: {
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
    geometry?: ({ lat: number; lon: number } | null)[];
  }[];
}

export async function loadOsm(name: string): Promise<RawElement[]> {
  const raw = await latestRaw(name, 'json');
  if (!raw) throw new Error(`Falta ${name}: corré npm run data:download`);
  const text = await readFile(raw.path, 'utf8');
  const problem = overpassProblem(text);
  if (problem) {
    throw new Error(`${raw.path} está incompleto (${problem}): corré npm run data:download`);
  }
  return (JSON.parse(text) as { elements: RawElement[] }).elements;
}

function toLine(geometry: RawElement['geometry']): LngLat[] {
  return (geometry ?? []).filter((p) => p !== null).map((p) => [p.lon, p.lat] as const);
}

export function waysOf(elements: RawElement[]): OsmWay[] {
  return elements
    .filter((e) => e.type === 'way' && e.geometry)
    .map((e) => ({ id: e.id, tags: e.tags ?? {}, line: toLine(e.geometry) }))
    .filter((w) => w.line.length >= 2);
}

export function nodesOf(elements: RawElement[]): OsmNode[] {
  return elements
    .filter((e) => e.type === 'node' && e.lat !== undefined && e.lon !== undefined)
    .map((e) => ({ id: e.id, tags: e.tags ?? {}, point: [e.lon ?? 0, e.lat ?? 0] as const }));
}

export function relationsOf(elements: RawElement[]): OsmRelation[] {
  return elements
    .filter((e) => e.type === 'relation')
    .map((e) => ({
      id: e.id,
      tags: e.tags ?? {},
      members: (e.members ?? []).map((m) => ({
        type: m.type,
        ref: m.ref,
        role: m.role,
        ...(m.geometry ? { line: toLine(m.geometry) } : {}),
      })),
    }));
}

export function featuresOf(elements: RawElement[]): OsmFeature[] {
  const out: OsmFeature[] = [];
  for (const e of elements) {
    // Con "out center bb", Overpass manda el recuadro y no el centro de vías y relaciones.
    const point = e.center
      ? ([e.center.lon, e.center.lat] as const)
      : e.lat !== undefined && e.lon !== undefined
        ? ([e.lon, e.lat] as const)
        : e.bounds
          ? ([
              (e.bounds.minlon + e.bounds.maxlon) / 2,
              (e.bounds.minlat + e.bounds.maxlat) / 2,
            ] as const)
          : undefined;
    if (!point) continue;
    out.push({
      type: e.type,
      id: e.id,
      tags: e.tags ?? {},
      point,
      ...(e.bounds
        ? {
            bounds: [e.bounds.minlon, e.bounds.minlat, e.bounds.maxlon, e.bounds.maxlat] as [
              number,
              number,
              number,
              number,
            ],
          }
        : {}),
    });
  }
  return out;
}

/** Sentido de una vía de OSM respecto de su geometría: 1 a favor, -1 en contra, 0 doble, null dudoso. */
export function osmOneway(tags: Tags): 1 | -1 | 0 | null {
  const value = tags.oneway;
  if (value === 'yes' || value === '1' || value === 'true') return 1;
  if (value === '-1' || value === 'reverse') return -1;
  if (value === 'reversible' || value === 'alternating') return null;
  if (value === 'no' || value === 'false' || value === '0') return 0;
  // Las rotondas y las autopistas implican mano única.
  if (tags.junction === 'roundabout' || tags.junction === 'circular') return 1;
  if (tags.highway === 'motorway') return 1;
  return 0;
}

export const PEDESTRIAN_HIGHWAYS = new Set([
  'footway',
  'pedestrian',
  'steps',
  'path',
  'cycleway',
  'platform',
  'corridor',
  'elevator',
  'bridleway',
]);
export const NON_ROAD_HIGHWAYS = new Set([
  'construction',
  'proposed',
  'abandoned',
  'razed',
  'bus_stop',
  'services',
  'rest_area',
]);

/** Carriles exclusivos de colectivos (Metrobús): van por el medio de la avenida, pero no son la calzada. */
export function isBusOnly(tags: Tags): boolean {
  if (tags.highway === 'busway' || /metrob[uú]s/i.test(tags.name ?? '')) return true;
  const designated = (value: string | undefined) => value === 'designated' || value === 'yes';
  return tags.highway === 'service' && (designated(tags.bus) || designated(tags.psv));
}

export function isPrivateAccess(tags: Tags): boolean {
  return (
    tags.access === 'private' ||
    tags.access === 'no' ||
    tags.motor_vehicle === 'no' ||
    tags.vehicle === 'no'
  );
}

export function osmLayer(tags: Tags): number {
  const layer = Number.parseInt(tags.layer ?? '', 10);
  if (Number.isFinite(layer)) return layer;
  if (tags.bridge && tags.bridge !== 'no') return 1;
  if (tags.tunnel && tags.tunnel !== 'no') return -1;
  return 0;
}

/** Nombres de una vía de OSM para comparar con el callejero. */
export function osmNames(tags: Tags): string[] {
  return ['name', 'official_name', 'alt_name', 'old_name', 'short_name']
    .flatMap((key) => (tags[key] ?? '').split(';'))
    .map((name) => name.trim())
    .filter(Boolean);
}
