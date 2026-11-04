import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import fc from 'fast-check';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { applyChanges, changesPath, suspendDoubtful } from '../../src/engine/changes';
import type { ChangesFile, StreetRecord } from '../../src/engine/data';
import type { CardId } from '../../src/engine/ids';
import { newStudyCard, type StudyCard } from '../../src/engine/srs/cards';
import { dayOf } from '../../src/engine/srs/days';
import { createSrs, type Srs } from '../../src/engine/srs/scheduler';
import { buildBackup, parseBackup, restoreBackup } from '../../src/storage/backup';
import { Database } from '../../src/storage/db';
import {
  confusionsByStreet,
  noteLesson,
  readSettings,
  saveAnswer,
  syncCards,
  updateSettings,
  type AnswerInput,
  type DataUpdate,
} from '../../src/storage/progress';

const NAME = 'prueba-progreso';
const NOW = new Date(2026, 10, 5, 12);
const ID = 'N:100' as CardId;

function at(days: number): Date {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  return date;
}

function answer(patch: Partial<AnswerInput> = {}): AnswerInput {
  return {
    card: ID,
    mode: 'name',
    seed: 1,
    interaction: 'choice',
    correct: true,
    elapsedMs: 4000,
    now: NOW,
    ...patch,
  };
}

function changes(patch: Partial<ChangesFile>): ChangesFile {
  return {
    from: '2026-11-03.aaaaaaaa',
    to: '2026-11-03.bbbbbbbb',
    inherit: {},
    reset: [],
    removed: [],
    added: [],
    directionChanges: [],
    renamed: [],
    ...patch,
  };
}

const V1 = '2026-11-03.aaaaaaaa';
const V2 = '2026-11-03.bbbbbbbb';
const V3 = '2026-11-03.cccccccc';
const FILE_1_2 = `cambios-${V1}-${V2}.json`;
const FILE_2_3 = `cambios-${V2}-${V3}.json`;

let srs: Srs;
let database: Database | undefined;

beforeAll(async () => {
  srs = await createSrs();
});

afterEach(async () => {
  database?.close();
  await Dexie.delete(NAME);
});

function open(): Database {
  const opened = new Database(NAME);
  database = opened;
  return opened;
}

function update(patch: Partial<DataUpdate> = {}): DataUpdate {
  return {
    version: V1,
    files: [],
    fetchChanges: () => Promise.reject(new Error('No debería bajar nada')),
    streets: [],
    ...patch,
  };
}

describe('migraciones', () => {
  it('pasar a la versión 2 no pierde nada de la versión 1', async () => {
    const old = new Dexie(NAME);
    old.version(1).stores({ overrides: '++id, street, stretch', meta: 'key' });
    await old
      .table('overrides')
      .add({ kind: 'sentido', street: 7, createdAt: 'x', dataVersion: 'v' });
    await old.table('meta').put({ key: 'version', value: 'v1' });
    old.close();

    const db = open();
    expect(await db.overrides.where('street').equals(7).count()).toBe(1);
    expect((await db.meta.get('version'))?.value).toBe('v1');
    expect(await db.cards.count()).toBe(0);
  });
});

describe('guardar respuestas', () => {
  it('guarda tarjeta y revisión juntas, y siguen ahí al volver a abrir', async () => {
    const db = open();
    const { card, grade } = await saveAnswer(srs, answer(), db);
    expect(grade).toBe('good');
    db.close();

    const reopened = open();
    const stored = await reopened.cards.get(ID);
    expect(stored?.dueDay).toBe(card.dueDay);
    expect(stored?.memory.dueAt).toEqual(card.memory.dueAt);
    const [review] = await reopened.reviews.where('card').equals(ID).toArray();
    expect(review).toMatchObject({ grade: 'good', correct: true, elapsedMs: 4000, mode: 'name' });
    expect(review?.revlog.cardId).toBe(ID);
  });

  it('la segunda respuesta del día es práctica', async () => {
    const db = open();
    await saveAnswer(srs, answer(), db);
    const second = await saveAnswer(srs, answer({ correct: false }), db);
    expect(second.grade).toBeUndefined();
    expect(await db.reviews.count()).toBe(1);
    expect(await db.days.get(dayOf(NOW))).toMatchObject({ reviews: 1, correct: 1, ms: 8000 });
  });

  it('un día nuevo vuelve a calificar', async () => {
    const db = open();
    await saveAnswer(srs, answer(), db);
    const next = await saveAnswer(srs, answer({ now: at(5) }), db);
    expect(next.grade).toBe('good');
    expect(await db.reviews.count()).toBe(2);
  });

  it('dos respuestas rápidas seguidas dan Easy, salvo en las de sentido', async () => {
    const db = open();
    await saveAnswer(srs, answer({ elapsedMs: 1000 }), db);
    const easy = await saveAnswer(srs, answer({ elapsedMs: 1000, now: at(5) }), db);
    expect(easy.grade).toBe('easy');

    const card = 'S:100:1-100' as CardId;
    await saveAnswer(srs, answer({ card, elapsedMs: 1000 }), db);
    const direction = await saveAnswer(srs, answer({ card, elapsedMs: 1000, now: at(5) }), db);
    expect(direction.grade).toBe('good');
  });

  it('registra las confusiones sin importar el orden del par', async () => {
    const db = open();
    await saveAnswer(srs, answer({ correct: false, confused: [7, 3] }), db);
    await saveAnswer(srs, answer({ correct: false, confused: [3, 7], now: at(1) }), db);
    const rows = await db.confusions.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ a: 3, b: 7, count: 2 });
    expect(confusionsByStreet(rows).get(7)).toEqual([3]);
  });

  it('separa lo que estrenó una tarjeta de los repasos', async () => {
    const db = open();
    await saveAnswer(srs, answer({ now: at(1) }), db);
    await saveAnswer(srs, answer({ now: at(9) }), db);
    await saveAnswer(srs, answer({ card: 'N:200' as CardId, now: at(9) }), db);
    expect(await db.days.get(dayOf(at(9)))).toMatchObject({ reviews: 2, fresh: 1 });
  });

  it('cuenta las lecciones del día', async () => {
    const db = open();
    await noteLesson(NOW, db);
    await noteLesson(NOW, db);
    expect((await db.days.get(dayOf(NOW)))?.lessons).toBe(2);
  });
});

describe('ajustes', () => {
  it('arranca con los valores del plan y guarda los cambios', async () => {
    const db = open();
    expect(await readSettings(db)).toMatchObject({ newPerDay: 4, retention: 0.9 });
    await updateSettings({ newPerDay: 6 }, db);
    await updateSettings({ base: 'Z:palermo' }, db);
    expect(await readSettings(db)).toMatchObject({ newPerDay: 6, base: 'Z:palermo' });
  });
});

describe('archivo de cambios', () => {
  const card = (id: string): StudyCard => newStudyCard(srs, id as CardId, NOW);

  it('conserva, hereda, reinicia y borra lo que corresponde', () => {
    const before = ['N:1', 'S:1:1-100', 'S:2:1-100', 'S:3:1-100', 'H:plaza'].map(card);
    const result = applyChanges(
      before,
      changes({
        inherit: { 'S:1:1-200': 'S:1:1-100', 'S:1:201-300': 'S:1:1-100' },
        removed: ['S:1:1-100', 'H:plaza'],
        reset: ['S:2:1-100'],
        directionChanges: [
          { id: 'S:2:1-100', was: 'S:2:1-100', street: 2, from: 'F', to: 'B', askable: true },
          { id: 'S:3:1-100', was: 'S:3:1-100', street: 3, from: 'F', to: 'B', askable: false },
          { id: 'S:9:1-100', was: 'S:9:1-100', street: 9, from: 'F', to: 'B', askable: true },
        ],
      }),
    );
    const ids = result.cards.map((c) => c.id).sort();
    expect(ids).toEqual(['N:1', 'S:1:1-200', 'S:1:201-300', 'S:3:1-100']);
    const inherited = result.cards.find((c) => c.id === 'S:1:1-200');
    expect(inherited?.memory.cardId).toBe('S:1:1-200');
    // La lección "cambió" es para lo que se sabía, aunque hoy el tramo esté en duda.
    expect(result.changed.map((c) => c.id)).toEqual(['S:2:1-100', 'S:3:1-100']);
  });

  it('encadena los archivos desde la versión que tiene', () => {
    expect(changesPath(V1, V3, [FILE_2_3, FILE_1_2])).toEqual([FILE_1_2, FILE_2_3]);
    expect(changesPath(V3, V3, [])).toEqual([]);
    expect(changesPath(V1, V3, [FILE_2_3])).toBeUndefined();
  });

  it('sin la tarjeta de origen, lo que había con esa ID ya no vale', () => {
    const result = applyChanges(
      [card('S:1:a'), card('N:1')],
      changes({ inherit: { 'S:1:a': 'S:1:b' } }),
    );
    expect(result.cards.map((c) => c.id)).toEqual(['N:1']);
  });

  it('un tramo partido con la mitad invertida igual avisa, por la tarjeta vieja', () => {
    const result = applyChanges(
      [card('S:1:1-500')],
      changes({
        removed: ['S:1:1-500'],
        reset: ['S:1:301-500'],
        directionChanges: [
          { id: 'S:1:301-500', was: 'S:1:1-500', street: 1, from: 'F', to: 'B', askable: true },
        ],
      }),
    );
    expect(result.changed.map((c) => c.id)).toEqual(['S:1:301-500']);
  });

  it('sin archivos que unan las versiones, la versión no avanza', async () => {
    const db = open();
    await db.cards.put(card('N:1'));
    await db.meta.put({ key: 'dataVersion', value: V1 });
    await syncCards(update({ version: V3, files: [FILE_2_3] }), db);
    expect((await db.meta.get('dataVersion'))?.value).toBe(V1);
    expect(await db.cards.count()).toBe(1);
  });

  it('un tramo dudoso suspende su tarjeta y vuelve si se confirma', () => {
    const stretch = { id: 'S:1:1-100', askable: false };
    const streets = [{ stretches: [stretch] }] as unknown as StreetRecord[];
    const [suspended] = suspendDoubtful([card('S:1:1-100')], streets);
    expect(suspended?.suspended).toBe(true);
    stretch.askable = true;
    const [back] = suspendDoubtful(suspended ? [suspended] : [], streets);
    expect(back?.suspended).toBeUndefined();
  });

  it('al cargar una versión nueva, aplica la cadena y guarda la versión', async () => {
    const db = open();
    await db.cards.bulkPut([card('S:1:1-100'), card('N:1')]);
    await db.meta.put({ key: 'dataVersion', value: V1 });
    const fetched: string[] = [];
    const files: Record<string, ChangesFile> = {
      [FILE_1_2]: changes({ inherit: { 'S:1:1-200': 'S:1:1-100' }, removed: ['S:1:1-100'] }),
      [FILE_2_3]: changes({
        from: V2,
        to: V3,
        reset: ['S:1:1-200'],
        directionChanges: [
          { id: 'S:1:1-200', was: 'S:1:1-200', street: 1, from: 'F', to: 'B', askable: true },
        ],
      }),
    };
    await syncCards(
      update({
        version: V3,
        files: [FILE_1_2, FILE_2_3],
        fetchChanges(file) {
          fetched.push(file);
          return Promise.resolve(files[file] as ChangesFile);
        },
      }),
      db,
    );
    expect(fetched).toEqual([FILE_1_2, FILE_2_3]);
    expect((await db.cards.toArray()).map((c) => c.id)).toEqual(['N:1']);
    expect((await db.meta.get('dataVersion'))?.value).toBe(V3);
    expect((await db.meta.get('changedDirections'))?.value).toHaveLength(1);
  });

  it('con la misma versión no toca nada', async () => {
    const db = open();
    await db.cards.put(card('N:1'));
    await db.meta.put({ key: 'dataVersion', value: V1 });
    await syncCards(update(), db);
    expect(await db.cards.count()).toBe(1);
  });
});

describe('respaldo', () => {
  async function fill(db: Database) {
    await saveAnswer(srs, answer({ confused: [1, 2], correct: false }), db);
    await saveAnswer(srs, answer({ card: 'S:100:1-100' as CardId, mode: 'direction' }), db);
    await saveAnswer(srs, answer({ now: at(3) }), db);
    await noteLesson(NOW, db);
    await updateSettings({ newPerDay: 8, base: 'Z:palermo' }, db);
    await db.overrides.add({ kind: 'otro', createdAt: 'x', dataVersion: V1, note: 'hola' });
    await db.meta.put({ key: 'dataVersion', value: V1 });
    await db.meta.put({ key: 'session', value: { items: [] } });
  }

  const normalized = (text: string) => ({ ...JSON.parse(text), exportedAt: '' }) as unknown;

  it('exportar e importar deja todo igual', async () => {
    const db = open();
    await fill(db);
    const first = JSON.stringify(await buildBackup(V1, NOW, db));
    await db.delete();
    await db.open();

    await restoreBackup(first, update(), db);
    const second = JSON.stringify(await buildBackup(V1, at(1), db));
    expect(normalized(second)).toEqual(normalized(first));
  });

  it('lo importado sigue funcionando: la próxima fecha es la misma', async () => {
    const db = open();
    await fill(db);
    const text = JSON.stringify(await buildBackup(V1, NOW, db));
    const before = await saveAnswer(srs, answer({ now: at(40) }), db);
    await db.delete();
    await db.open();

    await restoreBackup(text, update(), db);
    const after = await saveAnswer(srs, answer({ now: at(40) }), db);
    expect(after.card.memory.dueAt).toEqual(before.card.memory.dueAt);
  });

  it('un respaldo de datos anteriores pasa por los archivos de cambios', async () => {
    const db = open();
    await fill(db);
    const text = JSON.stringify(await buildBackup(V1, NOW, db));
    await db.delete();
    await db.open();

    await restoreBackup(
      text,
      update({
        version: V2,
        files: [FILE_1_2],
        fetchChanges: () =>
          Promise.resolve(
            changes({ inherit: { 'S:100:1-200': 'S:100:1-100' }, removed: ['S:100:1-100'] }),
          ),
      }),
      db,
    );
    const ids = (await db.cards.toArray()).map((c) => c.id).sort();
    expect(ids).toEqual(['N:100', 'S:100:1-200']);
    expect((await db.meta.get('dataVersion'))?.value).toBe(V2);
  });

  it('la sesión en curso no viaja en el respaldo', async () => {
    const db = open();
    await fill(db);
    const backup = await buildBackup(V1, NOW, db);
    expect(backup.meta.map((m) => m.key)).not.toContain('session');
  });

  it('rechaza un respaldo sin camino hasta estos datos, sin tocar nada', async () => {
    const db = open();
    await fill(db);
    const text = JSON.stringify(await buildBackup(V3, NOW, db));
    await expect(restoreBackup(text, update({ version: V1 }), db)).rejects.toThrow('versión');
    expect(await db.cards.count()).toBe(2);
  });

  it('importar no pierde las lecciones "cambió" que estaban esperando', async () => {
    const db = open();
    await fill(db);
    const waiting = {
      id: 'S:5:1-100',
      was: 'S:5:1-100',
      street: 5,
      from: 'F',
      to: 'B',
      askable: true,
    };
    await db.meta.put({ key: 'changedDirections', value: [waiting] });
    const text = JSON.stringify(await buildBackup(V1, NOW, db));
    await db.delete();
    await db.open();
    const fresh = {
      id: 'S:100:1-100',
      was: 'S:100:1-100',
      street: 100,
      from: 'F' as const,
      to: 'B' as const,
      askable: true,
    };
    await restoreBackup(
      text,
      update({
        version: V2,
        files: [FILE_1_2],
        fetchChanges: () =>
          Promise.resolve(changes({ reset: ['S:100:1-100'], directionChanges: [fresh] })),
      }),
      db,
    );
    const value = (await db.meta.get('changedDirections'))?.value as { id: string }[];
    expect(value.map((c) => c.id)).toEqual(['S:5:1-100', 'S:100:1-100']);
  });

  it('rechaza lo que no es un respaldo, sin tocar nada', async () => {
    const db = open();
    await fill(db);
    await expect(restoreBackup('no es json', update(), db)).rejects.toThrow('respaldo');
    await expect(restoreBackup('{"app":"otra"}', update(), db)).rejects.toThrow('respaldo');
    const future = JSON.stringify({ app: 'sin-gps', schema: 99, cards: [] });
    await expect(restoreBackup(future, update(), db)).rejects.toThrow('más nueva');
    expect(await db.cards.count()).toBe(2);
  });

  it('cualquier historial de respuestas sobrevive a exportar e importar', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(fc.boolean(), fc.nat(20_000), fc.nat(30)), {
          minLength: 1,
          maxLength: 6,
        }),
        async (history) => {
          const db = open();
          await db.meta.put({ key: 'dataVersion', value: V1 });
          for (const [correct, elapsedMs, day] of history) {
            await saveAnswer(srs, answer({ correct, elapsedMs, now: at(day) }), db);
          }
          const text = JSON.stringify(await buildBackup(V1, NOW, db));
          expect(parseBackup(text).cards[0]?.memory.dueAt).toBeInstanceOf(Date);
          await db.delete();
          await db.open();
          await restoreBackup(text, update(), db);
          const again = JSON.stringify(await buildBackup(V1, NOW, db));
          expect(again).toBe(text);
          db.close();
          await Dexie.delete(NAME);
        },
      ),
      { numRuns: 10 },
    );
  });
});
