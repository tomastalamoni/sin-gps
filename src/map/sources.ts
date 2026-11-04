/**
 * De los datos a las fuentes GeoJSON del mapa. Para dibujar, los tramos se agrupan en secciones
 * (sección 9): así las flechas y los nombres se reparten a lo largo de la calle y no por cuadra.
 */
import { decodeLine } from '../engine/data';
import { reverseLine, type LngLat } from '../engine/geo';
import type { RoadGraph, SegmentInput } from '../engine/graph';
import type { AppData } from '../lib/data';

type Properties = Record<string, string | number | boolean>;

function line(coordinates: readonly LngLat[], properties: Properties): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: coordinates.map((p) => [...p]) },
  };
}

function collection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

interface Section {
  from: number;
  to: number;
  line: LngLat[];
}

/** Un tramo orientado, para encadenarlo con otros. */
type Piece = Section;

/**
 * Une tramos que se tocan en secciones más largas. Sin `flexible`, respeta el sentido de cada
 * tramo; con `flexible`, un tramo se puede dar vuelta para seguir la sección.
 */
export function joinSections(pieces: readonly Piece[], flexible: boolean): Section[] {
  const sections: Section[] = [];
  for (const piece of pieces) {
    const candidates = flexible
      ? [piece, { from: piece.to, to: piece.from, line: reverseLine(piece.line) }]
      : [piece];
    const after = sections.flatMap((section) =>
      candidates.filter((c) => c.from === section.to).map((c) => ({ section, c })),
    )[0];
    if (after) {
      after.section.line = [...after.section.line, ...after.c.line.slice(1)];
      after.section.to = after.c.to;
      continue;
    }
    const before = sections.flatMap((section) =>
      candidates.filter((c) => c.to === section.from).map((c) => ({ section, c })),
    )[0];
    if (before) {
      before.section.line = [...before.c.line.slice(0, -1), ...before.section.line];
      before.section.from = before.c.from;
      continue;
    }
    sections.push({ ...piece, line: [...piece.line] });
  }
  return sections;
}

function travelPiece(segment: SegmentInput): Piece {
  const { from, to, geometry } = segment;
  return segment.dir === 'B'
    ? { from: to, to: from, line: reverseLine(geometry) }
    : { from, to, line: [...geometry] };
}

/** Cada tramo, para dibujar la calle y para tocarla. */
export function streetFeatures({ graph, streets }: AppData): GeoJSON.FeatureCollection {
  return collection(
    streets.flatMap((street) =>
      street.segments.map((t) =>
        line(graph.segment(t).geometry, { street: street.code, segment: t, level: street.level }),
      ),
    ),
  );
}

function segmentsOf(graph: RoadGraph, list: readonly number[]): SegmentInput[] {
  return list.map((t) => graph.segment(t));
}

/** Las manos únicas, con la geometría en el sentido de circulación. */
export function arrowFeatures({ graph, streets }: AppData): GeoJSON.FeatureCollection {
  return collection(
    streets.flatMap((street) => {
      const oneWay = segmentsOf(graph, street.segments).filter((s) => s.dir !== 'D');
      return [false, true].flatMap((doubtful) =>
        joinSections(oneWay.filter((s) => s.doubtful === doubtful).map(travelPiece), false).map(
          (section) => line(section.line, { doubtful }),
        ),
      );
    }),
  );
}

/** Una línea por sección con el nombre de la calle. */
export function labelFeatures({ graph, streets }: AppData): GeoJSON.FeatureCollection {
  return collection(
    streets.flatMap((street) =>
      joinSections(segmentsOf(graph, street.segments).map(travelPiece), true).map((section) =>
        line(section.line, { name: street.name, level: street.level }),
      ),
    ),
  );
}

export function landmarkFeatures({ landmarks }: AppData): GeoJSON.FeatureCollection {
  return collection(
    landmarks.map((landmark) => ({
      type: 'Feature',
      properties: { id: landmark.id, name: landmark.name, category: landmark.category },
      geometry: { type: 'Point', coordinates: [landmark.lng, landmark.lat] },
    })),
  );
}

export function railFeatures({ rail }: AppData): GeoJSON.FeatureCollection {
  return collection(
    [...rail.lines.map((l) => l.geometry).flat(), ...rail.unnamed].map((encoded) =>
      line(decodeLine(encoded), {}),
    ),
  );
}
