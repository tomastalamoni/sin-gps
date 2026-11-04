/**
 * Hitos (sección 8, paso 10): candidatos de OSM por categoría; se eligen unos 150 por tipo, tamaño
 * y cercanía a avenidas. En pipeline/hitos-override.json se excluyen, fuerzan o renombran por slug.
 * Un hito es destino del Navegante solo si tiene acceso: de 1 a 3 cuadras manejables a menos de 150 m.
 */
import { booleanPointInPolygon, point } from '@turf/turf';
import { isAskableConfidence, SegmentFlag, type LandmarkRecord } from '../../src/engine/data';
import { distanceM, projectOnLine, type LngLat } from '../../src/engine/geo';
import { cardIds, slugify } from '../../src/engine/ids';
import { normalizeName } from '../../src/engine/text';
import type { GraphSegment } from '../05-graph';
import { GridIndex } from './grid';
import type { OsmFeature } from './osm';

export interface LandmarkOverride {
  exclude?: boolean;
  include?: boolean;
  name?: string;
  /** Hito mayor: se enseña en el nivel 0 (sección 3). */
  major?: boolean;
}

type Bbox = NonNullable<LandmarkRecord['bbox']>;

const ACCESS_M = 150;
const AVENUE_NEAR_M = 100;
const MAX_ACCESS = 3;

/** Cupo por categoría: las estaciones, estadios y el aeropuerto entran todos. */
const QUOTAS: Record<string, number> = {
  subte: Infinity,
  tren: Infinity,
  estadio: Infinity,
  aeropuerto: Infinity,
  planetario: Infinity,
  cementerio: Infinity,
  hospital: 15,
  shopping: 10,
  universidad: 12,
  museo: 16,
  monumento: 10,
  plaza: 46,
};

function categoryOf(tags: Record<string, string>): string | undefined {
  // Una estación proyectada o en obra todavía no es una referencia: no existe.
  if (tags.railway === 'proposed' || tags.railway === 'construction') return undefined;
  if (tags.railway === 'station') return tags.station === 'subway' ? 'subte' : 'tren';
  if (tags.station === 'subway') return 'subte';
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'planetarium') return 'planetario';
  if (tags.landuse === 'cemetery') return 'cementerio';
  if (tags.leisure === 'stadium' || tags.sport === 'horse_racing' || tags.sport === 'polo')
    return 'estadio';
  if (tags.shop === 'mall') return 'shopping';
  if (tags.amenity === 'university') return 'universidad';
  if (tags.tourism === 'museum' || tags.amenity === 'library') return 'museo';
  if (tags.aeroway === 'aerodrome') return 'aeropuerto';
  if (tags.historic === 'monument' || tags.tourism === 'artwork') return 'monumento';
  if (tags.leisure === 'park' || tags.leisure === 'garden' || tags.place === 'square')
    return 'plaza';
  return undefined;
}

function areaM2(bounds: [number, number, number, number] | undefined): number {
  if (!bounds) return 0;
  const [w, s, e, n] = bounds;
  return distanceM([w, s], [e, s]) * distanceM([w, s], [w, n]);
}

export interface LandmarkBuild {
  landmarks: LandmarkRecord[];
  candidates: number;
  withoutAccess: number;
}

export function selectLandmarks(
  features: readonly OsmFeature[],
  area: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  segments: readonly GraphSegment[],
  overrides: Readonly<Record<string, LandmarkOverride>>,
): LandmarkBuild {
  const index = new GridIndex<number>();
  segments.forEach((s, t) => {
    index.add(t, s.line);
  });
  const near = (p: LngLat, radius: number) =>
    [...index.near([p], radius)]
      .map((t) => ({ t, d: projectOnLine(p, (segments[t] as GraphSegment).line).distanceM }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => a.d - b.d);

  interface Candidate {
    name: string;
    category: string;
    point: LngLat;
    bounds: [number, number, number, number] | undefined;
    score: number;
  }
  const candidates: Candidate[] = [];
  for (const feature of features) {
    const category = categoryOf(feature.tags);
    const name = feature.tags.name?.trim();
    if (!category || !name) continue;
    if (!booleanPointInPolygon(point([feature.point[0], feature.point[1]]), area)) continue;
    const size = areaM2(feature.bounds);
    const nearAvenue = near(feature.point, AVENUE_NEAR_M).some((x) => segments[x.t]?.kind === 'a');
    const score = Math.log10(1 + size) + (feature.tags.wikidata ? 1 : 0) + (nearAvenue ? 0.5 : 0);
    candidates.push({ name, category, point: feature.point, bounds: feature.bounds, score });
  }

  // Una estación mapeada como nodo y como edificio es un solo hito.
  const unique: Candidate[] = [];
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    const dup = unique.some(
      (u) =>
        u.category === c.category &&
        normalizeName(u.name) === normalizeName(c.name) &&
        distanceM(u.point, c.point) < 400,
    );
    if (!dup) unique.push(c);
  }

  const chosen: (Candidate & { major: boolean })[] = [];
  // Dos hitos pueden llamarse igual: el mayor es el de más puntaje.
  const majors = new Set<string>();
  const taken = new Map<string, number>();
  for (const c of unique) {
    const slug = slugify(c.name);
    const override = overrides[slug];
    if (override?.exclude) continue;
    const used = taken.get(c.category) ?? 0;
    if (used >= (QUOTAS[c.category] ?? 0) && !override?.include) continue;
    taken.set(c.category, used + 1);
    const major = override?.major === true && !majors.has(slug);
    if (major) majors.add(slug);
    chosen.push({ ...c, name: override?.name ?? c.name, major });
  }

  const slugs = new Set<string>();
  let withoutAccess = 0;
  const landmarks = chosen.map((c) => {
    let slug = slugify(c.name);
    if (slugs.has(slug)) slug = `${slug}-${c.category}`;
    for (let n = 2; slugs.has(slug); n++) slug = `${slugify(c.name)}-${n}`;
    slugs.add(slug);
    const access = near(c.point, ACCESS_M)
      .filter(({ t }) => {
        const s = segments[t] as GraphSegment;
        return (
          (s.flags & SegmentFlag.border) === 0 && isAskableConfidence(s.confidence ?? 'en-duda')
        );
      })
      .slice(0, MAX_ACCESS)
      .map((x) => x.t);
    if (access.length === 0) withoutAccess++;
    return {
      id: cardIds.landmark(slug),
      slug,
      name: c.name,
      category: c.category,
      lng: Math.round(c.point[0] * 1e6) / 1e6,
      lat: Math.round(c.point[1] * 1e6) / 1e6,
      access,
      ...(c.major ? { major: true } : {}),
      ...(c.bounds ? { bbox: c.bounds.map((n) => Math.round(n * 1e6) / 1e6) as Bbox } : {}),
    };
  });
  return { landmarks, candidates: candidates.length, withoutAccess };
}
