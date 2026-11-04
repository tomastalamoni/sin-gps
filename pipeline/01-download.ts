/**
 * Paso 1 · Descargar las fuentes y guardarlas con fecha en pipeline/raw/.
 * Uso: npm run data:download [-- --refresh] [-- --refresh --only=osm-landmarks]
 */
import { readFile } from 'node:fs/promises';
import { OSM_MARGIN_M, SOURCES } from './config';
import { areaBbox, type BBox } from './lib/area';
import { ensureRaw, fetchText, overpass, overpassProblem } from './lib/raw';

interface OsmQuery {
  name: string;
  /** Margen extra en metros sobre el recuadro del área. */
  extraMarginM?: number;
  body: string;
}

/** Consultas a OSM. Cada una se guarda en su propio archivo. */
export const OSM_QUERIES: OsmQuery[] = [
  { name: 'osm-highways', body: 'way["highway"]; out tags geom qt;' },
  {
    name: 'osm-nodes',
    body: 'node["highway"="traffic_signals"]; out qt; node["railway"~"^(level_crossing|crossing)$"]; out qt;',
  },
  // Con los nodos "via", para ubicar cada restricción en una esquina del grafo.
  {
    name: 'osm-restrictions',
    body: 'relation["type"="restriction"]; out body qt; node(r:"via"); out qt;',
  },
  {
    name: 'osm-rail',
    body: 'way["railway"~"^(rail|narrow_gauge|light_rail)$"]; out tags geom qt;',
  },
  {
    name: 'osm-areas',
    body: '(way["natural"="water"]; relation["natural"="water"]; way["leisure"~"^(park|garden|nature_reserve)$"]; relation["leisure"~"^(park|garden|nature_reserve)$"];); out tags geom qt;',
  },
  // La costa se baja con más margen: hace falta la línea entera para cerrar el polígono del río.
  { name: 'osm-coast', extraMarginM: 4000, body: 'way["natural"="coastline"]; out tags geom qt;' },
  {
    name: 'osm-landmarks',
    body: '(nwr["railway"="station"]; nwr["station"="subway"]; nwr["amenity"="hospital"]; nwr["leisure"="stadium"]; nwr["shop"="mall"]; nwr["amenity"="university"]; nwr["tourism"="museum"]; nwr["aeroway"="aerodrome"]; nwr["historic"="monument"]; nwr["place"="square"]; nwr["leisure"="park"]["name"]; nwr["leisure"="garden"]["name"]; nwr["amenity"="planetarium"]; nwr["landuse"="cemetery"]["name"]; nwr["leisure"="sports_centre"]["sport"="horse_racing"]; nwr["landuse"="recreation_ground"]["sport"="polo"]; nwr["amenity"="library"]["tourism"="attraction"]; nwr["tourism"="artwork"]["wikidata"];); out tags center bb qt;',
  },
];

export function overpassQuery(body: string, [west, south, east, north]: BBox): string {
  const bbox = [south, west, north, east].map((n) => n.toFixed(5)).join(',');
  return `[out:json][timeout:180][bbox:${bbox}];\n${body}`;
}

async function main(): Promise<void> {
  const refreshAll = process.argv.includes('--refresh');
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
  const refresh = (name: string) => refreshAll && (only === undefined || only === name);
  console.log(`Descargando fuentes${refreshAll ? ` (--refresh${only ? ` ${only}` : ''})` : ''}`);

  await ensureRaw(
    'callejero',
    'csv',
    SOURCES.callejero,
    () => fetchText(SOURCES.callejero),
    refresh('callejero'),
  );
  const barrios = await ensureRaw(
    'barrios',
    'geojson',
    SOURCES.barrios,
    () => fetchText(SOURCES.barrios),
    refresh('barrios'),
  );
  const barriosGeo = JSON.parse(await readFile(barrios.path, 'utf8')) as GeoJSON.FeatureCollection;

  for (const query of OSM_QUERIES) {
    const bbox = areaBbox(barriosGeo, OSM_MARGIN_M + (query.extraMarginM ?? 0));
    const text = overpassQuery(query.body, bbox);
    await ensureRaw(
      query.name,
      'json',
      'overpass',
      () => overpass(text),
      refresh(query.name),
      overpassProblem,
    );
  }
  console.log('Listo.');
}

await main();
