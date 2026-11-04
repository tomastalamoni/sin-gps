/**
 * Paso 13 · Exportar archivos compactos para la app (coordenadas en millonésimas de grado),
 * meta.json con la fecha de cada fuente y reporte.md con conteos, discrepancias y advertencias.
 */
import { createHash } from 'node:crypto';
import { simplify } from '@turf/turf';
import {
  confidenceCode,
  DATA_FORMAT,
  encodeCoord,
  encodeLine,
  SegmentFlag,
  type GraphFile,
  type LandmarksFile,
  type MetaFile,
  type PatternsFile,
  type RailFile,
  type SegmentsFile,
  type StreetsFile,
} from '../src/engine/data';
import type { LngLat } from '../src/engine/geo';
import { segmentOf } from '../src/engine/graph';
import type { Numbering } from './02-numbering';
import type { ClipResult } from './03-clip';
import type { GraphBuild } from './05-graph';
import type { DataModel } from './07-osm-enrich';
import { computeChanges, isEmptyChanges, type ChangesFile, type DataSnapshot } from './lib/changes';
import type { Correction } from './lib/overrides';
import type { ManifestEntry } from './lib/raw';
import type { WorkSegment } from './lib/types';
import { checkStatus, findHeightBreaks, HEIGHT_BREAK_MAX, type Check } from './lib/validate';

export interface ExportResult {
  version: string;
  files: Map<string, string>;
  report: string;
}

const LICENSES = `Datos de Sin GPS

Calles, alturas, sentidos y barrios: Buenos Aires Data (GCBA), licencia CC-BY-2.5-AR.
https://data.buenosaires.gob.ar/

Semáforos, restricciones de giro, hitos, vías del tren, agua y parques, y el cruce de sentidos:
© OpenStreetMap contributors, licencia ODbL 1.0. https://www.openstreetmap.org/copyright
Los archivos que mezclan datos de OpenStreetMap son una base de datos derivada y se ofrecen
bajo la ODbL, con el crédito a Buenos Aires Data.

Tipografía del mapa: Noto Sans, SIL Open Font License 1.1 (fonts/OFL.txt).
`;

function json(value: unknown): string {
  return JSON.stringify(value);
}

function roundGeometry(feature: GeoJSON.Feature): GeoJSON.Feature {
  const simplified = simplify(feature, { tolerance: 0.00001 });
  const round = (c: unknown): unknown =>
    Array.isArray(c) && typeof c[0] === 'number'
      ? (c as number[]).map((n) => Math.round(n * 1e6) / 1e6)
      : Array.isArray(c)
        ? c.map(round)
        : c;
  const geometry = simplified.geometry as GeoJSON.Polygon;
  return {
    ...simplified,
    geometry: { ...geometry, coordinates: round(geometry.coordinates) as GeoJSON.Position[][] },
  };
}

function barrierFeatures(
  barriers: readonly WorkSegment[],
  nameOf: (code: number) => string,
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: barriers.map((b) => ({
      type: 'Feature',
      properties: { street: b.code, name: nameOf(b.code) },
      geometry: {
        type: 'LineString',
        coordinates: b.line.map(([lng, lat]) => [
          Math.round(lng * 1e6) / 1e6,
          Math.round(lat * 1e6) / 1e6,
        ]),
      },
    })),
  };
}

export interface ExportInputs {
  model: DataModel;
  build: GraphBuild;
  clip: ClipResult;
  numbering: ReadonlyMap<number, Numbering>;
  sourceDate: string;
  manifest: Record<string, ManifestEntry>;
  checks: Check[];
  /** La versión anterior de public/data, para el archivo de cambios. */
  previous?: DataSnapshot;
}

export function exportData(inputs: ExportInputs): ExportResult {
  const { model } = inputs;
  const segments = model.segments;

  const segmentsFile: Omit<SegmentsFile, 'version'> = {
    format: DATA_FORMAT,
    street: segments.map((s) => s.code),
    from: segments.map((s) => s.from),
    to: segments.map((s) => s.to),
    dir: segments.map((s) => s.direction).join(''),
    conf: segments.map((s) => confidenceCode(s.confidence ?? 'en-duda')).join(''),
    kind: segments.map((s) => s.kind).join(''),
    heights: segments.flatMap((s) => s.heights),
    flags: segments.map((s) => s.flags),
    pair: model.graphInput.segments.map((s) => s.pair),
    geometry: segments.map((s) => encodeLine(s.line)),
  };
  const graphFile: Omit<GraphFile, 'version'> = {
    format: DATA_FORMAT,
    nodes: model.nodes.flatMap(([lng, lat]) => [encodeCoord(lng), encodeCoord(lat)]),
    outside: [...(model.graphInput.outside ?? [])].sort((a, b) => a - b),
    signals: [...(model.graphInput.signals ?? [])].sort((a, b) => a - b),
    restrictions: [...(model.graphInput.restrictions ?? [])],
    leftTurnLanes: [...(model.graphInput.leftTurnLanes ?? [])],
    junctions: [...inputs.build.junctions]
      .filter((n) => model.graph.degree(n) === 2)
      .sort((a, b) => a - b),
  };
  const content = json([segmentsFile, graphFile, model.streets, model.landmarks]);
  const version = `${inputs.sourceDate}.${createHash('sha256').update(content).digest('hex').slice(0, 8)}`;

  const nameOf = (code: number) => model.names.names.get(code)?.name ?? String(code);
  const streetsFile: StreetsFile = { format: DATA_FORMAT, version, streets: model.streets };
  const landmarksFile: LandmarksFile = { format: DATA_FORMAT, version, landmarks: model.landmarks };
  const patternsFile: PatternsFile = { format: DATA_FORMAT, version, patterns: model.patterns };
  const railFile: RailFile = {
    format: DATA_FORMAT,
    version,
    lines: model.rail.lines,
    unnamed: model.rail.unnamed,
  };

  const files = new Map<string, string>([
    ['tramos.json', json({ ...segmentsFile, version })],
    ['grafo.json', json({ ...graphFile, version })],
    ['calles.json', json(streetsFile)],
    ['patrones.json', json(patternsFile)],
    ['hitos.json', json(landmarksFile)],
    ['vias.json', json(railFile)],
    ['barreras.json', json({ version, ...barrierFeatures(model.barriers, nameOf) })],
    ['fondo.json', json({ version, ...model.background })],
    [
      'barrios.json',
      json({ version, ...model.barrios, features: model.barrios.features.map(roundGeometry) }),
    ],
    ['LICENCIAS.txt', LICENSES],
  ]);
  // Cada versión nueva lleva su archivo de cambios, aunque esté vacío: la app encadena los
  // archivos desde la versión que tiene hasta la última.
  const changes =
    inputs.previous && inputs.previous.version !== version
      ? computeChanges(inputs.previous, {
          version,
          streets: model.streets,
          segments: segmentsFile,
          landmarks: model.landmarks,
          barrios: model.barrios.features.map((f) => String(f.properties?.id)),
        })
      : undefined;
  if (changes) files.set(`cambios-${changes.from}-${changes.to}.json`, json(changes));

  const all: LngLat[] = model.nodes;
  const lngs = all.map((p) => p[0]);
  const lats = all.map((p) => p[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
  const sizes = Object.fromEntries(
    [...files].map(([name, text]) => [name, Buffer.byteLength(text)]),
  );
  const meta: MetaFile = {
    format: DATA_FORMAT,
    version,
    generatedAt: new Date().toISOString(),
    sources: Object.entries(inputs.manifest).map(([name, entry]) => ({
      name,
      url: entry.source === 'overpass' ? 'https://www.openstreetmap.org/' : entry.source,
      downloadedAt: entry.downloadedAt,
      license: name.startsWith('osm-')
        ? 'ODbL 1.0 · © OpenStreetMap contributors'
        : 'CC-BY-2.5-AR · Buenos Aires Data (GCBA)',
    })),
    bbox,
    center: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    counts: {
      tramos: segments.length,
      nodos: model.nodes.length,
      calles: model.streets.length,
      callesPreguntables: model.streets.filter((s) => s.askable).length,
      hitos: model.landmarks.length,
      tarjetasSentido: model.streets.reduce((n, s) => n + s.stretches.length, 0),
      tarjetasSentidoPreguntables: model.streets.reduce(
        (n, s) => n + s.stretches.filter((st) => st.askable).length,
        0,
      ),
      patrones: model.patterns.length,
    },
    files: sizes,
  };
  files.set('meta.json', json(meta));
  const report = buildReport(inputs, version, sizes, changes);
  files.set('reporte.md', report);
  return { version, files, report };
}

function pct(part: number, total: number): string {
  return total === 0 ? '—' : `${((part / total) * 100).toFixed(1)}%`;
}

function buildReport(
  inputs: ExportInputs,
  version: string,
  sizes: Record<string, number>,
  changes: ChangesFile | undefined,
): string {
  const { model, build, clip, checks } = inputs;
  const segments = model.segments;
  const nameOf = (code: number) => model.names.names.get(code)?.name ?? String(code);
  const where = (p: LngLat | undefined) => (p ? `${p[1].toFixed(5)}, ${p[0].toFixed(5)}` : '');
  const lines: string[] = [];
  const out = (...l: string[]) => lines.push(...l);
  const count = <T>(list: readonly T[], key: (t: T) => string) => {
    const m = new Map<string, number>();
    for (const item of list) m.set(key(item), (m.get(key(item)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
  };

  out(`# Reporte de datos · ${version}`, '');
  out(
    `Generado el ${new Date().toISOString().slice(0, 10)} con el callejero de BA Data y OpenStreetMap.`,
    '',
  );

  out(
    '## Validaciones',
    '',
    '| Chequeo | Bloqueante | Resultado | Detalle |',
    '| --- | --- | --- | --- |',
  );
  for (const c of checks)
    out(`| ${c.name} | ${c.blocking ? 'Sí' : 'No'} | ${checkStatus(c)} | ${c.detail} |`);
  out('');

  const total = segments.length;
  const conf = count(segments, (s) => s.confidence ?? 'sin estado');
  const matched = segments.filter((s) => s.osm).length;
  const confirmed = segments.filter((s) => s.confidence === 'confirmado').length;
  const doubtful = segments.filter((s) => s.confidence === 'en-duda').length;
  out('## Resumen', '');
  out(
    `- Tramos en el grafo: **${total}** (área ${segments.filter((s) => s.zone === 'area').length}, borde ${segments.filter((s) => s.zone === 'border').length}) · nodos: ${model.nodes.length} · fuera del área: ${build.outside.size}`,
  );
  out(
    `- Calles: ${model.streets.length} (${model.streets.filter((s) => s.askable).length} se pueden preguntar) · tarjetas de sentido: ${model.streets.reduce((n, s) => n + s.stretches.length, 0)}`,
  );
  out(`- Barreras (autopistas y ramas): ${model.barriers.length} tramos`);
  out(
    `- Cruce con OSM: ${matched} de ${total} tramos con par (${pct(matched, total)}); coinciden ${confirmed} de ${confirmed + doubtful} comparables (${pct(confirmed, confirmed + doubtful)})`,
  );
  out(
    `- Estados de confianza: ${conf.map(([k, v]) => `${k} ${v} (${pct(v, total)})`).join(' · ')}`,
  );
  out('');

  out('## Peso de los datos', '', '| Archivo | KB |', '| --- | --- |');
  let bytes = 0;
  for (const [name, size] of Object.entries(sizes)) {
    bytes += size;
    out(`| ${name} | ${(size / 1024).toFixed(0)} |`);
  }
  out(`| **Total** | **${(bytes / 1024).toFixed(0)}** |`, '');

  const traps = model.report.connectivity.others.filter((c) => c.sink);
  out('## Conectividad y trampas', '');
  out(
    `Aristas en la componente principal: ${(model.report.connectivity.ratio * 100).toFixed(2)}% (sin la zona de borde).`,
  );
  const islands = model.report.connectivity.others.filter((c) => c.island);
  out(
    `Otras componentes: ${model.report.connectivity.others.length}. De esas, ${traps.length} trampas (se entra y no se sale) y ${islands.length} islas (tramos sueltos: ni se entra ni se sale, el Navegante no los usa).`,
    '',
  );
  if (traps.length > 0) {
    out('| Calles | Aristas | Dónde (lat, lng) |', '| --- | --- | --- |');
    for (const trap of traps.slice(0, 40)) {
      const streets = [...new Set(trap.edges.map((e) => segments[segmentOf(e)]?.code ?? -1))].map(
        nameOf,
      );
      const first = segments[segmentOf(trap.edges[0] ?? 0)];
      out(`| ${streets.join(', ')} | ${trap.edges.length} | ${where(first?.line[0])} |`);
    }
    if (traps.length > 40) out(`| … y ${traps.length - 40} más | | |`);
    out('');
  }
  if (islands.length > 0) {
    const counted = count(
      islands.flatMap((c) => [...new Set(c.edges.map((e) => segments[segmentOf(e)]?.code ?? -1))]),
      (code) => nameOf(code),
    );
    out(`Islas: ${counted.map(([name, n]) => (n > 1 ? `${name} (${n})` : name)).join(', ')}.`, '');
  }

  out('## Cambios de sentido en medio de una cuadra', '');
  if (model.report.midBlock.length === 0) out('Ninguno.', '');
  else {
    out('| Calle | Dónde (lat, lng) |', '| --- | --- |');
    for (const m of model.report.midBlock.slice(0, 40)) {
      out(`| ${nameOf(segments[m.segments[0]]?.code ?? -1)} | ${where(model.nodes[m.node])} |`);
    }
    out('');
  }

  out('## Sentidos que no coinciden con OSM (en duda)', '');
  out('Ordenados por importancia de la calle. Son los primeros a verificar en la calle.', '');
  const importance = new Map(model.streets.map((s) => [s.code, s.importance]));
  const disagreements = [...model.report.disagreements].sort(
    (a, b) => (importance.get(b.code) ?? 0) - (importance.get(a.code) ?? 0),
  );
  out('| Calle | Alturas | Callejero | Dónde (lat, lng) |', '| --- | --- | --- | --- |');
  for (const s of disagreements.slice(0, 40)) {
    out(
      `| ${nameOf(s.code)} | ${s.range ? `${s.range[0]}-${s.range[1]}` : 'sin alturas'} | ${s.row.direction} | ${where(s.line[Math.floor(s.line.length / 2)])} |`,
    );
  }
  if (disagreements.length > 40) out(`| … y ${disagreements.length - 40} más | | | |`);
  out('');

  const { corrections } = model.report;
  out('## Tus correcciones (overrides.json)', '');
  out(
    `- Aplicadas: ${corrections.applied.length} · ya coincidían (se pueden borrar): ${corrections.redundant.length} · sin tramo: ${corrections.unmatched.length} · rechazadas: ${corrections.refused.length}`,
  );
  const describe = (c: Correction) =>
    `${nameOf(c.codigo)}${c.desde === undefined ? '' : ` ${String(c.desde)}-${String(c.hasta)}`} (${c.fecha})`;
  for (const c of corrections.redundant) out(`- Ya coincide: ${describe(c)}`);
  for (const c of corrections.unmatched) out(`- No encontré el tramo: ${describe(c)}`);
  for (const r of corrections.refused) out(`- Rechazada: ${describe(r.correction)}: ${r.reason}`);
  out('');

  out('## Cuadras que se contradicen (no se preguntan)', '');
  out(
    'Misma calle y casi las mismas alturas, pero dirían otra cosa que la calle a esa altura: laterales de una doble mano, transiciones o pedazos de rampa. Conviene mirarlas en Street View.',
    '',
  );
  if (model.report.conflicting.length === 0) out('Ninguna.', '');
  else {
    out('| Calle | Alturas | Sentido | Dónde (lat, lng) |', '| --- | --- | --- | --- |');
    for (const s of model.report.conflicting) {
      out(
        `| ${nameOf(s.code)} | ${s.range ? `${s.range[0]}-${s.range[1]}` : 'sin alturas'} | ${s.direction} | ${where(s.line[Math.floor(s.line.length / 2)])} |`,
      );
    }
    out('');
  }

  out('## Orientación de los tramos', '');
  for (const [k, v] of count(
    segments,
    (s) => `${s.orientation}${s.reversed ? ' (dibujado al revés, corregido)' : ''}`,
  ))
    out(`- ${k}: ${v}`);
  const { adopted } = model.report;
  out(
    `- Sin alturas con el sentido de OSM: ${adopted.total}. De esos, ${adopted.doubtful} quedaron en duda porque no siguen a sus vecinos y ${adopted.unconfirmed} con orientación inferida por ser cortos y sin vecino que los confirme.`,
  );
  out('');

  const importanceOf = (s: WorkSegment) => importance.get(s.code) ?? 0;
  const rangeText = (s: WorkSegment) => (s.range ? `${s.range[0]}-${s.range[1]}` : 'sin alturas');
  const breaks = findHeightBreaks(segments).sort(
    (a, b) => importanceOf(b.before) - importanceOf(a.before),
  );
  out('## Alturas', '');
  out(
    `Cuadras seguidas de la misma calle cuya numeración no empalma (salto de más de ${HEIGHT_BREAK_MAX} números): ${breaks.length}. Ordenadas por importancia de la calle.`,
    '',
  );
  if (breaks.length > 0) {
    out('| Calle | Cuadra | Sigue con | Dónde (lat, lng) |', '| --- | --- | --- | --- |');
    for (const { before, after } of breaks.slice(0, 40)) {
      out(
        `| ${nameOf(before.code)} | ${rangeText(before)} | ${rangeText(after)} | ${where(before.line[before.line.length - 1])} |`,
      );
    }
    if (breaks.length > 40) out(`| … y ${breaks.length - 40} más | | | |`);
    out('');
  }
  const longBlocks = segments
    .filter((s) => s.range && s.range[1] - s.range[0] > 250)
    .sort((a, b) => importanceOf(b) - importanceOf(a));
  out(
    `Cuadras con más de 250 números entre punta y punta: ${longBlocks.length} (lo esperable es unos 100).`,
    '',
  );
  if (longBlocks.length > 0) {
    out('| Calle | Alturas | Dónde (lat, lng) |', '| --- | --- | --- |');
    for (const s of longBlocks.slice(0, 40)) {
      out(
        `| ${nameOf(s.code)} | ${rangeText(s)} | ${where(s.line[Math.floor(s.line.length / 2)])} |`,
      );
    }
    if (longBlocks.length > 40) out(`| … y ${longBlocks.length - 40} más | | |`);
    out('');
  }

  const byName = new Map<string, Set<number>>();
  for (const street of model.streets) {
    if (!street.askable) continue;
    const set = byName.get(street.name) ?? new Set<number>();
    set.add(street.code);
    byName.set(street.name, set);
  }
  const repeated = [...byName].filter(([, codes]) => codes.size > 1);
  out('## Nombres repetidos en lugares distintos', '');
  out(
    repeated.length === 0
      ? 'Ninguno.'
      : repeated.map(([name, codes]) => `- ${name}: códigos ${[...codes].join(', ')}`).join('\n'),
    '',
  );

  const unnamed = [...new Set(segments.filter((s) => s.noName).map((s) => s.code))];
  out('## Calles sin nombre oficial', '');
  out(
    `Se manejan, pero nunca se preguntan: ${unnamed.length} calles, ${segments.filter((s) => s.noName).length} tramos.`,
  );
  if (unnamed.length > 0) out(unnamed.map(nameOf).sort().join(', '));
  out('');

  const { patterns } = model;
  out('## Patrones de sentido', '');
  out(
    `Grupos de paralelas que alternan sentido, de 4 o más, a lo largo de 2 transversales o más: ${patterns.length}. Se enseñan como regla en la Fase 4.`,
    '',
  );
  if (patterns.length > 0) {
    out('| Paralelas | A lo largo de |', '| --- | --- |');
    for (const p of patterns.slice(0, 15)) {
      const more = p.along.length > 3 ? ` y ${p.along.length - 3} más` : '';
      out(
        `| ${p.streets.map(nameOf).join(', ')} | ${p.along.slice(0, 3).map(nameOf).join(', ')}${more} |`,
      );
    }
    if (patterns.length > 15) out(`| … y ${patterns.length - 15} más | |`);
    out('');
  }

  out(
    '## Valores fuera de la sección 8',
    '',
    '| Campo | Valor | Tramos | Tratamiento |',
    '| --- | --- | --- | --- |',
  );
  for (const v of clip.unlistedValues)
    out(`| ${v.field} | ${v.value || '(vacío)'} | ${v.count} | ${v.treatment} |`);
  out('');

  const excludedNames = (list: readonly WorkSegment[]) =>
    [...new Set(list.map((s) => model.names.format(s.row.official)))].join(', ') || 'ninguna';
  out('## Exclusiones', '');
  for (const [reason, rows] of clip.excluded) out(`- ${reason}: ${rows.length} tramos`);
  out(`- OSM la marca peatonal: ${excludedNames(build.stats.osmPedestrian)}`);
  out(`- OSM la marca privada: ${excludedNames(build.stats.osmPrivate)}`);
  const barrio31 = clip.excluded.get('barrio-31') ?? [];
  out(
    `- Barrio 31 (fuera del mapa por decisión del 3/11/2026): ${new Set(barrio31.map((r) => r.official)).size} calles`,
    '',
  );

  out('## Barreras (acceso restringido)', '');
  for (const [name, n] of count(model.barriers, (b) => nameOf(b.code)))
    out(`- ${name}: ${n} tramos`);
  out(
    `- De ellas, ${build.stats.osmMotorway} tramos son autopista según OSM aunque el callejero no lo diga.`,
    '',
  );

  const r = model.report;
  out('## Esquinas', '');
  out(`- Semáforos en esquinas: ${r.signals}`);
  out(
    `- Restricciones de giro: ${r.restrictions.mapped} en el grafo; ${r.restrictions.skipped.length} ignoradas`,
  );
  for (const [reason, n] of count(r.restrictions.skipped, (s) => s.reason))
    out(`  - ${reason}: ${n}`);
  out(`- Carriles de giro a la izquierda: ${r.leftTurnLanes}`);
  out(
    `- Calzadas separadas en el callejero: ${r.pairs} pares, y ${r.pairedByHeights} tramos más (calzadas a hasta 150 m o con cuadras que no coinciden) que se preguntan juntos por tener las mismas alturas`,
  );
  out(
    `- Rotondas: ${segments.filter((s) => (s.flags & SegmentFlag.roundabout) !== 0).length} tramos`,
  );
  out(
    `- Uniones en T partidas: ${build.stats.tSplits} (${build.stats.tSplitsSkippedByLayer} no se partieron por estar a distinto nivel) · esquinas con niveles mezclados: ${build.stats.mixedLayerNodes}`,
    '',
  );

  out('## Hitos', '');
  out(
    `${model.landmarks.length} elegidos de ${r.landmarks.candidates} candidatos dentro del área; ${r.landmarks.withoutAccess} sin acceso (no son destino del Navegante).`,
    '',
  );
  for (const [cat, n] of count(model.landmarks, (l) => l.category)) out(`- ${cat}: ${n}`);
  out('');

  out('## Vías del tren', '');
  for (const line of model.rail.lines) {
    const kinds = count(line.crossings, (c) => c.kind)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    out(`- ${line.name}: ${line.crossings.length} cruces (${kinds || 'ninguno'})`);
  }
  out(
    `- Tramos bajo un viaducto (no son barrera): ${segments.filter((s) => (s.flags & SegmentFlag.underViaduct) !== 0).length}`,
    '',
  );

  out('## Fondo y rumbos', '');
  out(
    `- Polígonos del río: ${r.riverPolygons} · agua y parques: ${model.background.features.length - r.riverPolygons}`,
  );
  for (const f of model.barrios.features)
    out(
      `- ${String(f.properties?.display)}: hacia el río = ${String(f.properties?.riverBearing)}°`,
    );
  out('');

  out('## Cambios desde la versión anterior', '');
  if (changes && isEmptyChanges(changes)) {
    out(`Desde ${changes.from}: ninguna tarjeta cambió (el archivo de cambios va vacío).`, '');
  } else if (changes) {
    out(
      `Desde ${changes.from}: heredan el estado de otra tarjeta ${Object.keys(changes.inherit).length} · se reinician ${changes.reset.length} · nuevas ${changes.added.length} · quitadas ${changes.removed.length}`,
      '',
    );
    for (const c of changes.directionChanges) {
      const note = c.askable ? '' : ' (por ahora no se pregunta)';
      out(`- Cambió el sentido de ${nameOf(c.street)} (${c.id}): ${c.from} → ${c.to}${note}`);
    }
    out('');
  } else {
    out(
      inputs.previous
        ? 'Es la misma versión que la publicada: no hay archivo de cambios.'
        : 'Es la primera versión: no hay archivo de cambios.',
      '',
    );
  }

  out('## Pendientes', '');
  out(
    '- Tarjetas A (alturas), T (transversales) y B (cruces de vías): sus IDs se generan cuando exista su modo (fases 2 y 4).',
  );
  out('- Origen del nombre (Wikidata): no va por ahora (decisión del 3/11/2026).');
  return `${lines.join('\n')}\n`;
}
