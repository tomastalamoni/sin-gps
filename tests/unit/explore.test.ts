import { describe, expect, it } from 'vitest';
import type { DirectionStretch } from '../../src/engine/data';
import { pointInPolygon, type LngLat } from '../../src/engine/geo';
import { RoadGraph, type SegmentInput } from '../../src/engine/graph';
import {
  boundsOfStreet,
  directionText,
  nearestSegment,
  pointOfStreet,
  sentenceCase,
  stretchHeights,
  streetViewUrl,
} from '../../src/engine/describe';
import { joinSections } from '../../src/map/sources';

const at = (x: number, y: number): LngLat => [-58.45 + x / 91_800, -34.58 + y / 111_000];

function segment(from: number, to: number, line: LngLat[], dir: 'F' | 'B' | 'D'): SegmentInput {
  return {
    street: 1,
    from,
    to,
    dir,
    doubtful: false,
    kind: 'c',
    flags: 0,
    pair: -1,
    geometry: line,
  };
}

function stretch(id: string, dir: 'F' | 'B' | 'D', segments: number[]): DirectionStretch {
  return {
    id,
    segments,
    dir,
    confidence: 'confirmado',
    askable: true,
    splitCarriageway: false,
  };
}

describe('secciones del mapa', () => {
  const piece = (from: number, to: number) => ({
    from,
    to,
    line: [at(from * 100, 0), at(to * 100, 0)] as LngLat[],
  });

  it('une los tramos que se tocan, en cualquier orden', () => {
    const sections = joinSections([piece(1, 2), piece(0, 1), piece(2, 3)], false);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ from: 0, to: 3 });
    expect(sections[0]?.line).toHaveLength(4);
  });

  it('sin permiso de darlos vuelta, respeta el sentido de cada tramo', () => {
    expect(joinSections([piece(0, 1), piece(2, 1)], false)).toHaveLength(2);
    expect(joinSections([piece(0, 1), piece(2, 1)], true)).toHaveLength(1);
  });

  it('los tramos separados quedan en secciones distintas', () => {
    expect(joinSections([piece(0, 1), piece(5, 6)], true)).toHaveLength(2);
  });
});

describe('textos de la ficha', () => {
  // Una cuadra hacia el noreste (F) y otra hacia el suroeste (por la mano, B).
  const nodes = [at(0, 0), at(100, 100), at(200, 200)];
  const graph = new RoadGraph({
    nodes,
    segments: [
      segment(0, 1, [nodes[0] as LngLat, nodes[1] as LngLat], 'F'),
      segment(1, 2, [nodes[1] as LngLat, nodes[2] as LngLat], 'B'),
      segment(0, 2, [nodes[0] as LngLat, nodes[2] as LngLat], 'D'),
    ],
  });
  const ring: LngLat[] = [
    at(-500, -500),
    at(500, -500),
    at(500, 500),
    at(-500, 500),
    at(-500, -500),
  ];
  const barrios: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { riverBearing: 45 },
        geometry: { type: 'Polygon', coordinates: [ring.map((p) => [...p])] },
      },
    ],
  };

  it('dice las alturas del tramo', () => {
    expect(stretchHeights(stretch('S:1:1000-1999', 'F', []))).toBe('1000 a 1999');
    expect(stretchHeights(stretch('S:1:1000-1999-v2', 'F', []))).toBe('1000 a 1999');
    expect(stretchHeights(stretch('S:1:sa2', 'F', []))).toBe('Sin alturas');
  });

  it('dice el rumbo porteño de una mano única', () => {
    expect(directionText(graph, barrios, stretch('S:1:1-99', 'F', [0]))).toBe(
      'Mano única hacia el río',
    );
    expect(directionText(graph, barrios, stretch('S:1:100-199', 'B', [1]))).toBe(
      'Mano única hacia el oeste',
    );
  });

  it('afuera de los barrios, dice hacia dónde va la numeración', () => {
    const none: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
    expect(directionText(graph, none, stretch('S:1:1-99', 'F', [0]))).toBe(
      'Mano única, hacia donde crece la numeración',
    );
    expect(directionText(graph, none, stretch('S:1:sa1', 'F', [0]))).toBe('Mano única');
  });

  it('distingue la doble mano con calzadas separadas', () => {
    expect(directionText(graph, barrios, stretch('S:1:1-99', 'D', [2]))).toBe('Doble mano');
    expect(
      directionText(graph, barrios, { ...stretch('S:1:1-99', 'D', [2]), splitCarriageway: true }),
    ).toBe('Doble mano, con calzadas separadas');
  });

  it('elige el tramo tocado más cercano', () => {
    expect(nearestSegment(graph, at(50, 50), [0, 1])).toBe(0);
    expect(nearestSegment(graph, at(150, 150), [0])).toBe(0);
    expect(nearestSegment(graph, at(150, 150), [])).toBeUndefined();
  });

  it('encuadra la calle y arma el link a Street View', () => {
    expect(boundsOfStreet(graph, [0, 1])).toEqual([nodes[0], nodes[2]]);
    const point = pointOfStreet(graph, [0, 2]);
    expect(point?.[0]).toBeCloseTo(at(100, 100)[0], 5);
    expect(streetViewUrl([-58.45, -34.58])).toBe(
      'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=-34.580000,-58.450000',
    );
  });

  it('pasa los tipos a minúscula, con la inicial en mayúscula', () => {
    expect(sentenceCase('VÍA DISTRIBUIDORA PRINCIPAL')).toBe('Vía distribuidora principal');
  });
});

describe('geometría', () => {
  const ring: LngLat[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const hole: LngLat[] = [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ];

  it('sabe si un punto cae en un polígono con agujeros', () => {
    expect(pointInPolygon([1, 1], [ring])).toBe(true);
    expect(pointInPolygon([11, 1], [ring])).toBe(false);
    expect(pointInPolygon([5, 5], [ring, hole])).toBe(false);
    expect(pointInPolygon([5, 5], [ring])).toBe(true);
    expect(pointInPolygon([5, 5], [])).toBe(false);
  });
});
