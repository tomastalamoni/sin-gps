/**
 * Aplica los archivos de cambios a las tarjetas (sección 8, paso 11), al actualizar los datos y al
 * importar un respaldo viejo. Cada tarjeta de la versión nueva:
 * - si está en `reset`, empieza de cero;
 * - si está en `inherit`, toma el estado de la tarjeta vieja que indica;
 * - si no, conserva el estado que tenía con la misma ID, si existía.
 * Las de `removed` ya no existen.
 */
import type { ChangesFile, DirectionStretch, StreetRecord } from './data';
import type { CardId } from './ids';
import type { StudyCard } from './srs/cards';

export interface CardChanges {
  cards: StudyCard[];
  /** Tarjetas de sentido para la lección "cambió": las que se sabían. */
  changed: ChangesFile['directionChanges'];
  renamed: ChangesFile['renamed'];
}

export function applyChanges(cards: readonly StudyCard[], file: ChangesFile): CardChanges {
  const byId = new Map(cards.map((card) => [card.id as string, card]));
  const reset = new Set(file.reset);
  const out = new Map(byId);

  for (const id of file.removed) out.delete(id);
  for (const id of file.reset) out.delete(id);
  for (const [newId, oldId] of Object.entries(file.inherit)) {
    const old = byId.get(oldId);
    if (reset.has(newId)) continue;
    // Sin la tarjeta de origen, esa ID es otro lugar: lo que hubiera con esa ID ya no vale.
    if (!old) {
      out.delete(newId);
      continue;
    }
    const id = newId as CardId;
    out.set(newId, { ...old, id, memory: { ...old.memory, cardId: newId } });
  }
  return {
    cards: [...out.values()],
    changed: file.directionChanges.filter((c) => byId.has(c.was)),
    renamed: file.renamed.filter((r) => byId.has(`N:${r.street}`)),
  };
}

const CHANGES_FILE =
  /^cambios-(\d{4}-\d{2}-\d{2}\.[0-9a-f]+)-(\d{4}-\d{2}-\d{2}\.[0-9a-f]+)\.json$/;

/** Los archivos que llevan de una versión a otra, en orden. Sin camino, no hay nada que aplicar. */
export function changesPath(
  from: string,
  to: string,
  files: readonly string[],
): string[] | undefined {
  const edges = new Map<string, { file: string; to: string }>();
  for (const file of files) {
    const match = CHANGES_FILE.exec(file);
    if (match) edges.set(match[1] as string, { file, to: match[2] as string });
  }
  const path: string[] = [];
  let version = from;
  while (version !== to) {
    const edge = edges.get(version);
    if (!edge || path.includes(edge.file)) return undefined;
    path.push(edge.file);
    version = edge.to;
  }
  return path;
}

/**
 * Un tramo que quedó dudoso suspende su tarjeta, y vuelve si el dato se confirma: nunca se pregunta
 * por un dato en duda ni cuenta para el dominio (sección 8).
 */
export function suspendDoubtful(
  cards: readonly StudyCard[],
  streets: readonly StreetRecord[],
): StudyCard[] {
  const stretches = new Map<string, DirectionStretch>(
    streets.flatMap((s) => s.stretches.map((st) => [st.id, st] as const)),
  );
  return cards.map((card) => {
    const stretch = stretches.get(card.id);
    if (!stretch) return card;
    const suspended = !stretch.askable;
    if (suspended === (card.suspended === true)) return card;
    const next = { ...card };
    if (suspended) next.suspended = true;
    else delete next.suspended;
    return next;
  });
}
