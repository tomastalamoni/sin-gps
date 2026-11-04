import { describe, expect, it } from 'vitest';
import { AddressBook, type SearchResult } from '../../src/engine/addresses';
import type { LandmarkRecord, StreetRecord } from '../../src/engine/data';
import type { LngLat } from '../../src/engine/geo';
import { RoadGraph, type SegmentInput } from '../../src/engine/graph';
import { rumboOf } from '../../src/engine/rumbos';

const at = (x: number, y: number): LngLat => [-58.45 + x / 91_800, -34.58 + y / 111_000];

function street(code: number, name: string, short: string, segments: number[], extra = {}) {
  const record: StreetRecord = {
    code,
    official: name.toUpperCase(),
    name,
    short,
    aliases: [],
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
    level: 4,
    barrios: ['Palermo'],
    askable: true,
    importance: 0.1,
    segments,
    crossings: [],
    stretches: [],
    ...extra,
  };
  return record;
}

/**
 * Una avenida oeste-este con dos cuadras (calle 1), una con calzadas separadas (calle 2) y una
 * calle norte-sur (calle 3) que cruza las dos calzadas de la segunda.
 */
function book() {
  const nodes = [
    at(0, 0),
    at(100, 0),
    at(200, 0),
    at(0, 100),
    at(200, 100),
    at(0, 120),
    at(200, 120),
    at(100, 100),
    at(100, 120),
  ];
  const segment = (street: number, from: number, to: number): SegmentInput => ({
    street,
    from,
    to,
    dir: 'D',
    doubtful: false,
    kind: 'c',
    flags: 0,
    pair: -1,
    geometry: [nodes[from] as LngLat, nodes[to] as LngLat],
  });
  const segments = [
    segment(1, 0, 1),
    segment(1, 1, 2),
    segment(2, 3, 7),
    segment(2, 7, 4),
    segment(2, 5, 8),
    segment(2, 8, 6),
    segment(3, 1, 7),
    segment(3, 7, 8),
  ];
  const heights = [
    [2400, 2498, 2401, 2499],
    [2500, 2598, 2501, 2599],
    [1000, 1098, 1001, 1099],
    [1100, 1198, 1101, 1199],
    [1000, 1098, 1001, 1099],
    [1100, 1198, 1101, 1199],
    [500, 598, 501, 599],
    [0, 0, 0, 0],
  ].flat();
  const streets = [
    street(1, 'Av. Gral. Paz', 'Gral. Paz', [0, 1], { importance: 0.9, previous: 'Vieja Paz' }),
    street(2, 'Av. Santa Fe', 'Santa Fe', [2, 3, 4, 5]),
    street(3, 'Núñez', 'Núñez', [6, 7]),
    street(4, '3 de Febrero', '3 de Febrero', []),
    street(5, "O'Higgins", "O'Higgins", []),
  ];
  const landmarks: LandmarkRecord[] = [
    {
      id: 'H:plaza-paz',
      slug: 'plaza-paz',
      name: 'Plaza de la Paz',
      category: 'plaza',
      lng: -58.45,
      lat: -34.58,
      access: [],
    },
  ];
  return new AddressBook(new RoadGraph({ nodes, segments }), heights, streets, landmarks);
}

const labels = (results: SearchResult[]) => results.map((r) => `${r.kind}: ${r.label}`);

describe('buscador', () => {
  const addresses = book();

  it('encuentra calles con tildes, abreviaturas y sin la ñ', () => {
    expect(labels(addresses.search('gral paz'))[0]).toBe('street: Av. Gral. Paz');
    expect(labels(addresses.search('GENERAL PAZ'))[0]).toBe('street: Av. Gral. Paz');
    expect(labels(addresses.search('sta fe'))[0]).toBe('street: Av. Santa Fe');
    expect(labels(addresses.search('nunez'))[0]).toBe('street: Núñez');
    expect(labels(addresses.search('NÚÑEZ'))[0]).toBe('street: Núñez');
    expect(labels(addresses.search('vieja'))[0]).toBe('street: Av. Gral. Paz');
  });

  it('encuentra un apellido con apóstrofo escrito de las dos formas', () => {
    expect(labels(addresses.search('ohiggins'))[0]).toBe("street: O'Higgins");
    expect(labels(addresses.search('o higgins'))[0]).toBe("street: O'Higgins");
    expect(labels(addresses.search("O'Higgins"))[0]).toBe("street: O'Higgins");
  });

  it('encuentra por el comienzo de las palabras y en cualquier orden', () => {
    expect(labels(addresses.search('sant'))[0]).toBe('street: Av. Santa Fe');
    expect(labels(addresses.search('fe santa'))[0]).toBe('street: Av. Santa Fe');
  });

  it('encuentra hitos', () => {
    expect(labels(addresses.search('plaza paz'))).toContain('landmark: Plaza de la Paz');
  });

  it('no busca con una letra ni con palabras vacías', () => {
    expect(addresses.search('s')).toEqual([]);
    expect(addresses.search('av')).toEqual([]);
    expect(addresses.search('   ')).toEqual([]);
  });

  it('una dirección devuelve la cuadra y un punto interpolado', () => {
    const [result] = addresses.search('Paz 2450');
    expect(result).toMatchObject({
      kind: 'address',
      street: 1,
      segment: 0,
      height: 2450,
      exact: true,
    });
    if (result?.kind !== 'address') throw new Error('No es una dirección');
    expect(result.point[0]).toBeCloseTo(at(50, 0)[0], 4);
    expect(addresses.search('gral paz al 2450')[0]).toMatchObject({
      kind: 'address',
      height: 2450,
    });
  });

  it('un nombre con números no se confunde con una altura', () => {
    expect(labels(addresses.search('3 de Febrero'))[0]).toBe('street: 3 de Febrero');
  });

  it('una altura que no existe da la cuadra más cercana, sin decir que es exacta', () => {
    expect(addresses.search('Paz 9000')[0]).toMatchObject({
      kind: 'address',
      segment: 1,
      height: 9000,
      exact: false,
    });
  });

  it('una esquina se encuentra aunque tenga varios nodos', () => {
    const [result] = addresses.search('santa fe y nuñez');
    expect(result).toMatchObject({ kind: 'corner', streets: [2, 3] });
    if (result?.kind !== 'corner') throw new Error('No es una esquina');
    expect([...result.nodes].sort()).toEqual([7, 8]);
    expect(result.point[1]).toBeCloseTo(at(100, 110)[1], 4);
  });

  it('acepta otras formas de escribir una esquina', () => {
    for (const query of ['paz esq nuñez', 'paz & nuñez', 'paz/nuñez', 'paz con nuñez']) {
      expect(addresses.search(query)[0]).toMatchObject({ kind: 'corner', streets: [1, 3] });
    }
  });
});

describe('direcciones', () => {
  const addresses = book();

  it('ida y vuelta: calle y altura → punto → la misma cuadra', () => {
    const address = addresses.locate(1, 2550);
    if (!address) throw new Error('No encontró la altura');
    expect(addresses.reverse(address.point)).toMatchObject({ street: 1, segment: 1 });
    expect(Math.abs((addresses.reverse(address.point)?.height ?? 0) - 2550)).toBeLessThanOrEqual(2);
  });

  it('elige la vereda según la paridad', () => {
    expect(addresses.locate(2, 1050)?.segment).toBe(2);
    expect(addresses.locate(2, 1099)?.exact).toBe(true);
  });

  it('una calle sin cuadras no tiene alturas', () => {
    expect(addresses.locate(4, 100)).toBeUndefined();
    expect(addresses.locate(99, 100)).toBeUndefined();
  });

  it('sin cuadras con alturas cerca no hay dirección', () => {
    expect(addresses.reverse(at(5000, 5000))).toBeUndefined();
  });
});

describe('rumbos porteños', () => {
  it('reparte los sentidos en cuatro sectores según el eje del río', () => {
    expect(rumboOf(44, 44)).toBe('hacia el río');
    expect(rumboOf(224, 44)).toBe('hacia el oeste');
    expect(rumboOf(134, 44)).toBe('hacia el centro');
    expect(rumboOf(314, 44)).toBe('hacia General Paz');
  });

  it('cerca del borde de un sector no dice nada', () => {
    expect(rumboOf(44 + 40, 44)).toBeUndefined();
    expect(rumboOf(44 + 50, 44)).toBeUndefined();
    expect(rumboOf(44 - 140, 44)).toBeUndefined();
    expect(rumboOf(44 + 30, 44)).toBe('hacia el río');
  });
});
