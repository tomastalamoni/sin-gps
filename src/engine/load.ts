/**
 * De los archivos de public/data al grafo del motor. Lo usan la app y la validación del pipeline,
 * así las dos leen los datos exactamente igual.
 */
import {
  CONFIDENCE_BY_CODE,
  DATA_FORMAT,
  decodeLine,
  type Confidence,
  type ConfidenceCode,
  type Direction,
  type GraphFile,
  type RoadKind,
  type SegmentsFile,
} from './data';
import type { LngLat } from './geo';
import type { GraphInput } from './graph';

export function checkFormat(file: { format: number }, name: string): void {
  if (file.format !== DATA_FORMAT) {
    throw new Error(`${name}: formato ${file.format}, se esperaba ${DATA_FORMAT}`);
  }
}

export function segmentConfidence(segments: SegmentsFile, t: number): Confidence {
  return CONFIDENCE_BY_CODE[(segments.conf[t] ?? 'd') as ConfidenceCode];
}

export function graphInputFromFiles(segments: SegmentsFile, graph: GraphFile): GraphInput {
  checkFormat(segments, 'tramos.json');
  checkFormat(graph, 'grafo.json');
  const nodes: LngLat[] = [];
  for (let i = 0; i + 1 < graph.nodes.length; i += 2) {
    nodes.push([(graph.nodes[i] ?? 0) / 1e6, (graph.nodes[i + 1] ?? 0) / 1e6]);
  }
  return {
    nodes,
    segments: segments.street.map((street, t) => {
      const confidence = segmentConfidence(segments, t);
      return {
        street,
        from: segments.from[t] ?? 0,
        to: segments.to[t] ?? 0,
        dir: (segments.dir[t] ?? 'D') as Direction,
        doubtful: confidence === 'en-duda' || confidence === 'inferida',
        kind: (segments.kind[t] ?? 'c') as RoadKind,
        flags: segments.flags[t] ?? 0,
        pair: segments.pair[t] ?? -1,
        geometry: decodeLine(segments.geometry[t] ?? []),
      };
    }),
    outside: graph.outside,
    signals: graph.signals,
    restrictions: graph.restrictions,
    leftTurnLanes: graph.leftTurnLanes,
  };
}
