import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { Database } from '../../src/storage/db';

const NAME = 'prueba';

afterEach(async () => {
  await Dexie.delete(NAME);
});

describe('base local', () => {
  it('guarda correcciones y datos sueltos, y siguen ahí al volver a abrir', async () => {
    const first = new Database(NAME);
    const id = await first.overrides.add({
      kind: 'sentido',
      street: 7,
      createdAt: '2026-11-03T12:00:00.000Z',
      dataVersion: 'v1',
    });
    await first.meta.put({ key: 'version', value: 'v1' });
    first.close();

    const second = new Database(NAME);
    expect(await second.overrides.get(id)).toMatchObject({ street: 7 });
    expect(await second.overrides.where('street').equals(7).count()).toBe(1);
    expect((await second.meta.get('version'))?.value).toBe('v1');
    second.close();
  });

  it('una base vacía arranca en la última versión del esquema', async () => {
    const database = new Database(NAME);
    await database.open();
    expect(database.verno).toBe(1);
    expect(database.tables.map((t) => t.name).sort()).toEqual(['meta', 'overrides']);
    database.close();
  });
});
