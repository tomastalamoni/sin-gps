/**
 * Archivo de cambios entre dos versiones de los datos (sección 8, paso 11). La app lo aplica al
 * actualizar los datos y al importar un respaldo viejo. Cada tarjeta de la versión nueva:
 * - si está en `reset`, empieza de cero (y un cambio de sentido genera una lección "cambió");
 * - si está en `inherit`, toma el estado que tenía la tarjeta vieja que indica;
 * - si no, conserva el estado que tenía con la misma ID, si existía.
 * Las tarjetas de `removed` ya no existen.
 *
 * Las tarjetas de sentido se comparan por geometría, no por ID: varios puntos de cada cuadra nueva
 * se comparan con el tramo viejo de la misma calle que tienen más cerca. Así se reconocen un tramo
 * partido o con otro rango, cada calzada de una avenida y los tramos sin alturas aunque cambie su
 * número.
 */
import {
  decodeLine,
  type ChangesFile,
  type Direction,
  type DirectionStretch,
  type LandmarkRecord,
  type SegmentsFile,
  type StreetRecord,
} from '../../src/engine/data';
import {
  angleDiff,
  bearingDeg,
  lineLengthM,
  pointAlong,
  projectOnLine,
  type LngLat,
} from '../../src/engine/geo';
import { cardIds } from '../../src/engine/ids';
import { normalizeName } from '../../src/engine/text';

export interface DataSnapshot {
  version: string;
  streets: readonly StreetRecord[];
  /** Los tramos de esa versión (tramos.json): geometría y sentido de cada uno. */
  segments: Pick<SegmentsFile, 'dir' | 'geometry'>;
  landmarks: readonly LandmarkRecord[];
  barrios: readonly string[];
  /** Las tarjetas de cruce y de autopista (B:). */
  barriers: readonly string[];
}

export type { ChangesFile };

/** Puntos de cada cuadra que se comparan, como fracción de su largo. */
const SAMPLES = [0.1, 0.3, 0.5, 0.7, 0.9];
/** Un punto se compara con el tramo viejo de la misma calle más cercano, si está a menos de esto. */
const MATCH_M = 15;
/** Puntos que hacen falta para dar por cambiado un tramo o para heredar: uno solo puede ser ruido. */
const MIN_SAMPLES = 2;

interface Piece {
  line: LngLat[];
  length: number;
  /** Sentido respecto de la geometría del tramo. */
  dir: Direction;
  stretch: DirectionStretch;
}

function piecesOf(stretches: readonly DirectionStretch[], segments: DataSnapshot['segments']) {
  return stretches.flatMap((stretch) =>
    stretch.segments.map((t): Piece => {
      const line = decodeLine(segments.geometry[t] ?? []);
      const dir = (segments.dir[t] ?? 'D') as Direction;
      return { line, length: lineLengthM(line), dir, stretch };
    }),
  );
}

/** Rumbo en que se circula en ese punto, o undefined si es doble mano, con una calzada o con dos. */
function travelAt(piece: Piece, alongM: number): number | undefined {
  if (piece.dir === 'D' || piece.stretch.splitCarriageway) return undefined;
  const bearing = bearingDeg(
    pointAlong(piece.line, Math.max(0, alongM - 3)),
    pointAlong(piece.line, Math.min(piece.length, alongM + 3)),
  );
  return piece.dir === 'F' ? bearing : (bearing + 180) % 360;
}

function sameTravel(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Math.abs(angleDiff(a, b)) <= 90;
}

function mostVoted(votes: ReadonlyMap<DirectionStretch, number>, min: number) {
  return [...votes]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].id.localeCompare(b[0].id))[0]?.[0];
}

export function isEmptyChanges(changes: ChangesFile): boolean {
  return (
    Object.keys(changes.inherit).length === 0 &&
    changes.reset.length === 0 &&
    changes.removed.length === 0 &&
    changes.added.length === 0
  );
}

/** Tarjetas de sentido de una calle. */
function compareStretches(
  code: number,
  previous: { stretches: readonly DirectionStretch[]; segments: DataSnapshot['segments'] },
  next: { stretches: readonly DirectionStretch[]; segments: DataSnapshot['segments'] },
  changes: ChangesFile,
): void {
  const oldPieces = piecesOf(previous.stretches, previous.segments);
  const oldIds = new Set(previous.stretches.map((s) => s.id));
  for (const stretch of next.stretches) {
    const pieces = piecesOf([stretch], next.segments);
    const agree = new Map<DirectionStretch, number>();
    const differ = new Map<DirectionStretch, number>();
    for (const p of pieces) {
      for (const f of SAMPLES) {
        const point = pointAlong(p.line, f * p.length);
        let best: { old: Piece; alongM: number; distanceM: number } | undefined;
        for (const old of oldPieces) {
          const { distanceM, alongM } = projectOnLine(point, old.line);
          // Pasando la punta de un tramo viejo ya no es el mismo lugar: es la cuadra de al lado.
          const beyond = alongM < 0.5 || alongM > old.length - 0.5;
          if (distanceM > MATCH_M || (beyond && distanceM > 1)) continue;
          if (!best || distanceM < best.distanceM) best = { old, alongM, distanceM };
        }
        if (!best) continue;
        const same = sameTravel(travelAt(p, f * p.length), travelAt(best.old, best.alongM));
        const tally = same ? agree : differ;
        tally.set(best.old.stretch, (tally.get(best.old.stretch) ?? 0) + 1);
      }
    }
    // Una tarjeta dudosa conserva su estado, así que también se compara con las que no se preguntan.
    const changedFrom = mostVoted(differ, MIN_SAMPLES);
    const askable = new Map([...agree].filter(([s]) => s.askable));
    const source = mostVoted(askable, MIN_SAMPLES) ?? mostVoted(agree, MIN_SAMPLES);
    if (changedFrom) {
      changes.reset.push(stretch.id);
      changes.directionChanges.push({
        id: stretch.id,
        was: changedFrom.id,
        street: code,
        from: changedFrom.dir,
        to: stretch.dir,
        askable: stretch.askable,
      });
    } else if (!source) {
      // Una ID que ya existía pero ahora es otro lugar empieza de cero.
      if (oldIds.has(stretch.id)) changes.reset.push(stretch.id);
      else changes.added.push(stretch.id);
    } else if (source.id !== stretch.id) {
      changes.inherit[stretch.id] = source.id;
    }
  }
  const newIds = new Set(next.stretches.map((s) => s.id));
  for (const old of previous.stretches) if (!newIds.has(old.id)) changes.removed.push(old.id);
}

function compareIds(before: readonly string[], after: readonly string[], changes: ChangesFile) {
  const oldSet = new Set(before);
  const newSet = new Set(after);
  for (const id of before) if (!newSet.has(id)) changes.removed.push(id);
  for (const id of after) if (!oldSet.has(id)) changes.added.push(id);
}

export function computeChanges(previous: DataSnapshot, next: DataSnapshot): ChangesFile {
  const changes: ChangesFile = {
    from: previous.version,
    to: next.version,
    inherit: {},
    reset: [],
    removed: [],
    added: [],
    directionChanges: [],
    renamed: [],
  };
  const oldStreets = new Map(previous.streets.map((s) => [s.code, s]));
  const newStreets = new Map(next.streets.map((s) => [s.code, s]));

  // Tarjetas de nombre.
  for (const street of next.streets) {
    if (!street.askable) continue;
    const id = cardIds.name(street.code);
    const old = oldStreets.get(street.code);
    if (!old?.askable) changes.added.push(id);
    else if (normalizeName(old.name) !== normalizeName(street.name)) {
      changes.reset.push(id);
      changes.renamed.push({ street: street.code, from: old.name, to: street.name });
    }
  }
  for (const old of previous.streets) {
    if (old.askable && !newStreets.get(old.code)?.askable)
      changes.removed.push(cardIds.name(old.code));
  }

  // Tarjetas de sentido, calle por calle.
  for (const code of new Set([...oldStreets.keys(), ...newStreets.keys()])) {
    compareStretches(
      code,
      { stretches: oldStreets.get(code)?.stretches ?? [], segments: previous.segments },
      { stretches: newStreets.get(code)?.stretches ?? [], segments: next.segments },
      changes,
    );
  }

  // Hitos, barrios y barreras: por ID.
  compareIds(
    previous.landmarks.map((l) => l.id),
    next.landmarks.map((l) => l.id),
    changes,
  );
  compareIds(previous.barrios, next.barrios, changes);
  compareIds(previous.barriers, next.barriers, changes);
  return changes;
}
