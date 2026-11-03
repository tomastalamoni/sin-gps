import { describe, expect, it } from 'vitest';
import type { GraphSegment } from '../../pipeline/05-graph';
import { layoutStreet } from '../../pipeline/lib/stretches';
import { at, makeBlock, makeSegment } from './fixtures/segments';

function layout(
  segments: GraphSegment[],
  options: {
    pairs?: [GraphSegment, GraphSegment][];
    crossings?: Record<number, number[]>;
  } = {},
) {
  const pairs = new Map<GraphSegment, GraphSegment>();
  for (const [a, b] of options.pairs ?? []) {
    pairs.set(a, b);
    pairs.set(b, a);
  }
  return layoutStreet(
    300,
    segments,
    new Map(segments.map((s, i) => [s, i])),
    pairs,
    (node) => [300, ...(options.crossings?.[node] ?? [])],
    (code) => (code === 400 ? 2 : 4),
  );
}

const summary = (result: ReturnType<typeof layout>) =>
  result.stretches.map((s) => [s.id, s.dir, s.askable]);

describe('orientación de los tramos sin alturas', () => {
  it('antes del número 1 sigue la numeración, esté dibujado como esté', () => {
    const blocks = [makeBlock(1, 2, 100, 200, [1, 99]), makeBlock(2, 3, 200, 300, [100, 199])];
    const forward = makeSegment(0, 1, [at(0, 0), at(100, 0)], 'F');
    const backward = makeSegment(1, 0, [at(100, 0), at(0, 0)], 'B');
    for (const piece of [forward, backward]) {
      const result = layout([...blocks, piece]);
      expect(summary(result)).toEqual([['S:300:1-199', 'F', true]]);
      expect(result.ordered).toEqual([2, 0, 1]);
    }
  });

  it('entre dos cuadras sigue a sus vecinas', () => {
    const segments = [
      makeBlock(0, 1, 0, 100, [1000, 1099], 'B'),
      makeSegment(2, 1, [at(130, 0), at(100, 0)], 'F'),
      makeBlock(2, 3, 130, 230, [1100, 1199], 'B'),
    ];
    expect(summary(layout(segments))).toEqual([['S:300:1000-1199', 'B', true]]);
  });

  it('la línea central va como la cuadra que tiene al lado, aunque toque sus esquinas', () => {
    const segments = [
      makeBlock(5, 0, -100, 0, [900, 999], 'B'),
      makeBlock(0, 1, 0, 100, [1000, 1099], 'B'),
      makeBlock(1, 6, 100, 200, [1100, 1199], 'B'),
      makeSegment(0, 1, [at(0, 0), at(50, 6), at(100, 0)], 'B'),
    ];
    expect(summary(layout(segments))).toEqual([['S:300:900-1199', 'B', true]]);
  });

  it('el que vuelve por al lado de la cuadra no es su continuación', () => {
    const segments = [
      makeBlock(0, 1, 0, 100, [1000, 1099], 'F'),
      // Arranca donde termina la cuadra y vuelve hacia el oeste, con el tránsito hacia el este.
      makeSegment(1, 2, [at(100, 0), at(90, 12), at(0, 12)], 'B'),
    ];
    expect(summary(layout(segments))).toEqual([['S:300:1000-1099', 'F', true]]);
  });

  it('una rama que sale de una esquina no se pregunta', () => {
    const branch = makeSegment(1, 3, [at(100, 0), at(100, 100)], 'F');
    const result = layout([
      makeBlock(0, 1, 0, 100, [1000, 1099]),
      makeBlock(1, 2, 100, 200, [1100, 1199]),
      branch,
    ]);
    expect(result.stretches.find((s) => s.segments.includes(2))?.askable).toBe(false);
    expect(result.stretches.find((s) => s.segments.includes(0))?.askable).toBe(true);
  });

  it('una rama de doble mano sí: tiene la misma respuesta en cualquier orientación', () => {
    const branch = makeSegment(1, 3, [at(100, 0), at(100, 100)], 'D');
    const result = layout([
      makeBlock(0, 1, 0, 100, [1000, 1099]),
      makeBlock(1, 2, 100, 200, [1100, 1199]),
      branch,
    ]);
    expect(result.stretches.find((s) => s.segments.includes(2))?.askable).toBe(true);
  });

  it('una pieza suelta va como la cuadra más cercana', () => {
    const result = layout(
      [
        makeBlock(0, 1, 0, 100, [1000, 1099]),
        makeBlock(4, 5, 400, 500, [1400, 1499]),
        // Dibujada hacia el oeste, con el tránsito hacia el este: va hacia donde crece la numeración.
        makeSegment(3, 2, [at(300, 0), at(200, 0)], 'B'),
      ],
      { crossings: { 1: [401], 2: [402], 3: [403], 4: [404] } },
    );
    expect(result.stretches.find((s) => s.segments.includes(2))?.dir).toBe('F');
    expect(result.crossings.map((c) => c.street)).toEqual([401, 402, 403, 404]);
  });

  it('sin alturas en toda la calle, va de oeste a este', () => {
    const result = layout([
      makeSegment(1, 0, [at(100, 0), at(0, 0)], 'F'),
      makeSegment(2, 1, [at(200, 0), at(100, 0)], 'F'),
    ]);
    expect(summary(result)).toEqual([['S:300:sa1', 'B', true]]);
  });
});

describe('calzadas', () => {
  it('une dos calzadas con la misma numeración, aunque estén a más de 40 m', () => {
    const result = layout([
      makeBlock(0, 1, 0, 100, [1000, 1099], 'F'),
      makeBlock(2, 3, 0, 100, [1000, 1099], 'B', 100),
    ]);
    expect(result.stretches).toMatchObject([
      { id: 'S:300:1000-1099', dir: 'D', splitCarriageway: true, askable: true },
    ]);
    expect(result.pairedByHeights).toBe(1);
  });

  it('una calzada larga junta varias cuadras de la otra', () => {
    const result = layout([
      makeBlock(0, 1, 0, 300, [1000, 1299], 'B', 60),
      makeBlock(2, 3, 0, 100, [1000, 1099], 'F'),
      makeBlock(3, 4, 100, 200, [1100, 1199], 'F'),
      makeBlock(4, 5, 200, 300, [1200, 1299], 'F'),
    ]);
    expect(result.stretches).toHaveLength(1);
    expect(result.stretches[0]?.dir).toBe('D');
  });

  it('una cuadra suelta se suma a calzadas ya emparejadas', () => {
    const north = makeBlock(0, 1, 0, 100, [1000, 1099], 'F');
    const firstHalf = makeBlock(2, 3, 0, 50, [1000, 1049], 'B', 20);
    const secondHalf = makeBlock(3, 4, 50, 100, [1050, 1099], 'B', 20);
    const result = layout([north, firstHalf, secondHalf], { pairs: [[north, firstHalf]] });
    expect(summary(result)).toEqual([['S:300:1000-1099', 'D', true]]);
    expect(result.conflicting).toEqual([]);
  });

  it('une calzadas sin alturas que corren lado a lado', () => {
    const blocks = [
      makeBlock(0, 1, 0, 100, [1000, 1099], 'D'),
      makeBlock(4, 5, 300, 400, [1300, 1399], 'D'),
    ];
    const result = layout([
      ...blocks,
      makeSegment(1, 4, [at(100, 0), at(300, 0)], 'F'),
      makeSegment(6, 7, [at(100, 60), at(300, 60)], 'B'),
    ]);
    const stretch = result.stretches.find((s) => s.segments.includes(2));
    expect(stretch?.splitCarriageway).toBe(true);
    expect(stretch?.segments).toContain(3);
  });

  it('dos cuadras seguidas con números que se pisan no son calzadas', () => {
    const result = layout([
      makeBlock(0, 1, 0, 100, [1000, 1099], 'F'),
      makeBlock(1, 2, 100, 200, [1050, 1150], 'B'),
    ]);
    expect(result.stretches.every((s) => !s.splitCarriageway)).toBe(true);
  });

  it('dos manos opuestas con la misma numeración que no van lado a lado no se preguntan', () => {
    const a = makeBlock(0, 1, 0, 100, [1000, 1099], 'F');
    const b = makeBlock(2, 3, 140, 240, [1000, 1099], 'B');
    const short = makeBlock(4, 5, 260, 270, [1040, 1050], 'F');
    const result = layout([a, b, short]);
    expect(result.conflicting).toEqual(expect.arrayContaining([a, b]));
    expect(result.stretches.every((s) => !s.askable)).toBe(true);
  });

  it('una lateral de mano única al lado de una doble mano no se pregunta', () => {
    const main = makeBlock(0, 1, 0, 300, [1000, 1299], 'D');
    const lateral = makeBlock(2, 3, 0, 300, [1001, 1299], 'F', 30);
    const result = layout([main, lateral]);
    expect(result.conflicting).toEqual([lateral]);
    expect(result.stretches.find((s) => s.segments.includes(0))?.askable).toBe(true);
    expect(result.stretches.find((s) => s.segments.includes(1))?.askable).toBe(false);
  });

  it('una lateral pegada a la línea central tampoco', () => {
    const blocks = [
      makeBlock(5, 0, -100, 0, [900, 999], 'D'),
      makeBlock(1, 6, 100, 200, [1100, 1199], 'D'),
    ];
    const center = makeSegment(0, 1, [at(0, 0), at(100, 0)], 'D');
    const lateral = makeBlock(0, 7, 0, 100, [1000, 1099], 'F', 3);
    const result = layout([...blocks, center, lateral]);
    expect(result.conflicting).toEqual([lateral]);
  });

  it('entre dos manos opuestas muy distintas, solo la más corta queda afuera', () => {
    const long = makeBlock(0, 1, 0, 400, [1000, 1399], 'F');
    const short = makeBlock(2, 3, 430, 450, [1100, 1120], 'B');
    const result = layout([long, short]);
    expect(result.conflicting).toEqual([short]);
    expect(result.stretches.find((s) => s.segments.includes(0))?.askable).toBe(true);
  });
});

describe('dónde cambia el sentido', () => {
  it('se marca en la punta de arriba del tramo, no en una rama del medio', () => {
    const result = layout(
      [
        makeBlock(0, 1, 0, 100, [1000, 1099], 'F'),
        makeBlock(1, 2, 100, 200, [1100, 1199], 'F'),
        makeBlock(2, 3, 200, 300, [1200, 1299], 'D'),
        makeSegment(1, 4, [at(100, 0), at(100, 100)], 'D'),
      ],
      { crossings: { 1: [500], 2: [400, 500] } },
    );
    const oneWay = result.stretches.find((s) => s.dir === 'F');
    expect(oneWay?.changesAt).toBe(400);
    expect(result.stretches.find((s) => s.segments.includes(2))?.changesAt).toBeUndefined();
  });

  it('un tramo dudoso no alcanza para decir que cambia el sentido', () => {
    const result = layout(
      [
        makeBlock(0, 1, 0, 100, [1000, 1099], 'B'),
        { ...makeBlock(1, 2, 100, 200, [1100, 1199], 'F'), confidence: 'en-duda' },
      ],
      { crossings: { 1: [400] } },
    );
    expect(result.stretches[0]?.changesAt).toBeUndefined();
  });

  it('un tramo que llega al final de la calle no cambia en ningún lado', () => {
    const result = layout(
      [makeBlock(0, 1, 0, 100, [1000, 1099], 'B'), makeBlock(1, 2, 100, 200, [1100, 1199], 'F')],
      { crossings: { 1: [400] } },
    );
    expect(result.stretches.map((s) => s.changesAt)).toEqual([400, undefined]);
  });
});

describe('transversales', () => {
  it('a igual altura van en el orden de la calle, no por número de nodo', () => {
    const result = layout(
      [
        makeBlock(7, 8, 0, 100, [1000, 1099], 'F'),
        makeBlock(2, 3, 30, 130, [1000, 1099], 'F', 200),
      ],
      { crossings: { 7: [401], 2: [402] } },
    );
    expect(result.crossings.map((c) => c.street)).toEqual([401, 402]);
  });

  it('las calzadas de una avenida cuentan como un solo cruce', () => {
    const result = layout(
      [
        makeBlock(0, 1, 0, 100, [1000, 1099]),
        makeBlock(1, 2, 100, 200, [1100, 1199]),
        makeBlock(2, 3, 200, 300, [1200, 1299]),
      ],
      { crossings: { 0: [400], 1: [400], 3: [400] } },
    );
    expect(result.crossings.map((c) => c.node)).toEqual([0, 3]);
  });
});
