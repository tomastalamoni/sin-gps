/**
 * Un barrio sintético chico para probar el pipeline de punta a punta: una cuadrícula de 4 × 4
 * esquinas con una cuadra dibujada al revés, una calle que termina en T, una avenida con calzadas
 * separadas, un semáforo, una restricción de giro y una calle donde OSM contradice al callejero.
 */
import type { LngLat } from '../../../src/engine/geo';
import type { CallejeroRow } from '../../../pipeline/lib/callejero';
import type { OsmNode, OsmRelation, OsmWay } from '../../../pipeline/lib/osm';

const LNG0 = -58.43;
const LAT0 = -34.58;
const DLNG = 0.0011;
const DLAT = 0.0009;

export const corner = (row: number, col: number): LngLat => [LNG0 + col * DLNG, LAT0 + row * DLAT];

/** Calles oeste-este (filas) y sur-norte (columnas), con su nombre en el callejero y en OSM. */
export const ROWS = [
  {
    code: 100,
    official: 'ALFA AV.',
    osm: 'Avenida Alfa',
    direction: 'DOBLE',
    type: 'AVENIDA',
    hierarchy: 'VÍA DISTRIBUIDORA PRINCIPAL',
  },
  {
    code: 101,
    official: 'BETA',
    osm: 'Beta',
    direction: 'DECRECIENTE',
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
  },
  {
    code: 102,
    official: 'GAMMA',
    osm: 'Gamma',
    direction: 'CRECIENTE',
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
  },
  {
    code: 103,
    official: 'DELTA',
    osm: 'Delta',
    direction: 'DECRECIENTE',
    type: 'CALLE',
    hierarchy: 'VÍA LOCAL',
  },
] as const;
export const COLS = [
  { code: 200, official: 'UNO', osm: 'Uno', direction: 'CRECIENTE' },
  { code: 201, official: 'DOS', osm: 'Dos', direction: 'DECRECIENTE' },
  { code: 202, official: 'TRES', osm: 'Tres', direction: 'CRECIENTE' },
  { code: 203, official: 'CUATRO', osm: 'Cuatro', direction: 'DECRECIENTE' },
] as const;

/** La cuadra de GAMMA entre las columnas 1 y 2 está dibujada de este a oeste. */
export const REVERSED_ROW_ID = 1021;
/** CINCO baja desde el norte y termina en el medio de la cuadra de DELTA entre las columnas 1 y 2. */
export const T_STREET = 300;
/** SEIS: avenida al sur con dos calzadas separadas de mano única. */
export const SPLIT_AVENUE = 400;
const SPLIT_GAP = 0.0002;

function row(
  id: number,
  code: number,
  official: string,
  line: LngLat[],
  heightsFrom: number,
  extra: Partial<CallejeroRow>,
): CallejeroRow {
  return {
    id,
    code,
    official,
    mapName: '',
    previous: '',
    heights: [heightsFrom, heightsFrom + 98, heightsFrom + 1, heightsFrom + 99],
    type: 'CALLE',
    direction: 'DOBLE',
    notes: '',
    hierarchy: 'VÍA LOCAL',
    rail: 'Sin Iteracción',
    barrio: 'Palermo',
    barrioEven: 'Palermo',
    barrioOdd: 'Palermo',
    line,
    ...extra,
  };
}

export function callejero(): CallejeroRow[] {
  const rows: CallejeroRow[] = [];
  ROWS.forEach((street, r) => {
    for (let c = 0; c < 3; c++) {
      const id = 1000 + r * 10 + c;
      const line =
        id === REVERSED_ROW_ID
          ? [corner(r, c + 1), corner(r, c)]
          : [corner(r, c), corner(r, c + 1)];
      rows.push(
        row(id, street.code, street.official, line, 1000 + 100 * c, {
          direction: street.direction,
          type: street.type,
          hierarchy: street.hierarchy,
        }),
      );
    }
  });
  COLS.forEach((street, c) => {
    for (let r = 0; r < 3; r++) {
      rows.push(
        row(
          2000 + c * 10 + r,
          street.code,
          street.official,
          [corner(r, c), corner(r + 1, c)],
          1000 + 100 * r,
          { direction: street.direction },
        ),
      );
    }
  });
  const middle: LngLat = [LNG0 + 1.5 * DLNG, LAT0 + 3 * DLAT];
  rows.push(
    row(3000, T_STREET, 'CINCO', [[middle[0], middle[1] + DLAT * 0.8], middle], 1000, {
      direction: 'DOBLE',
    }),
  );
  for (const [i, offset, direction] of [
    [0, 0, 'CRECIENTE'],
    [1, SPLIT_GAP, 'DECRECIENTE'],
  ] as const) {
    for (let c = 0; c < 3; c++) {
      const lat = LAT0 - DLAT - offset;
      rows.push(
        row(
          4000 + i * 10 + c,
          SPLIT_AVENUE,
          'SEIS AV.',
          [
            [LNG0 + c * DLNG, lat],
            [LNG0 + (c + 1) * DLNG, lat],
          ],
          1000 + 100 * c,
          {
            direction,
            type: 'AVENIDA',
            hierarchy: 'VÍA DISTRIBUIDORA COMPLEMENTARIA',
          },
        ),
      );
    }
  }
  return rows;
}

export function barrios(): GeoJSON.FeatureCollection {
  const [w, s, e, n] = [
    LNG0 - 0.002,
    LAT0 - 0.003,
    LNG0 + 3 * DLNG + 0.002,
    LAT0 + 4 * DLAT + 0.002,
  ];
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { nombre: 'Palermo' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [w, s],
              [e, s],
              [e, n],
              [w, n],
              [w, s],
            ],
          ],
        },
      },
    ],
  };
}

let nextWayId = 1;
const way = (name: string, line: LngLat[], tags: Record<string, string> = {}): OsmWay => ({
  id: nextWayId++,
  tags: { highway: 'residential', name, ...tags },
  line,
});

export interface MiniOsm {
  ways: OsmWay[];
  signal: OsmNode;
  restriction: OsmRelation;
  viaNodes: Map<number, LngLat>;
}

/**
 * OSM coincide con el callejero salvo en GAMMA, donde marca el sentido contrario. BETA y DOS se
 * cortan en la esquina de la fila 1 y la columna 1, donde hay un no_left_turn.
 */
export function osm(): MiniOsm {
  nextWayId = 1;
  const ways: OsmWay[] = [];
  const oneway = (direction: string) =>
    direction === 'DOBLE' ? 'no' : direction === 'CRECIENTE' ? 'yes' : '-1';
  for (const [r, street] of ROWS.entries()) {
    const tags = { oneway: street.code === 102 ? '-1' : oneway(street.direction) };
    if (street.code === 101) {
      ways.push(
        way(street.osm, [corner(r, 0), corner(r, 1)], tags),
        way(street.osm, [corner(r, 1), corner(r, 3)], tags),
      );
    } else {
      ways.push(way(street.osm, [corner(r, 0), corner(r, 3)], tags));
    }
  }
  for (const [c, street] of COLS.entries()) {
    const tags = { oneway: oneway(street.direction) };
    if (street.code === 201) {
      ways.push(
        way(street.osm, [corner(0, c), corner(1, c)], tags),
        way(street.osm, [corner(1, c), corner(3, c)], tags),
      );
    } else {
      ways.push(way(street.osm, [corner(0, c), corner(3, c)], tags));
    }
  }
  ways.push(
    way(
      'Cinco',
      [
        [LNG0 + 1.5 * DLNG, LAT0 + 3 * DLAT + DLAT * 0.8],
        [LNG0 + 1.5 * DLNG, LAT0 + 3 * DLAT],
      ],
      { oneway: 'no' },
    ),
  );
  ways.push(
    way(
      'Avenida Seis',
      [
        [LNG0, LAT0 - DLAT],
        [LNG0 + 3 * DLNG, LAT0 - DLAT],
      ],
      { oneway: 'yes' },
    ),
  );
  ways.push(
    way(
      'Avenida Seis',
      [
        [LNG0, LAT0 - DLAT - SPLIT_GAP],
        [LNG0 + 3 * DLNG, LAT0 - DLAT - SPLIT_GAP],
      ],
      { oneway: '-1' },
    ),
  );

  const fromBeta = ways.find((w) => w.tags.name === 'Beta' && w.line[0]?.[0] === corner(1, 1)[0]);
  const toDos = ways.find((w) => w.tags.name === 'Dos' && w.line[1]?.[1] === corner(1, 1)[1]);
  if (!fromBeta || !toDos) throw new Error('Fixture mal armado');
  const viaId = 900;
  return {
    ways,
    signal: { id: 800, tags: { highway: 'traffic_signals' }, point: corner(0, 1) },
    restriction: {
      id: 700,
      tags: { type: 'restriction', restriction: 'no_left_turn' },
      members: [
        { type: 'way', ref: fromBeta.id, role: 'from' },
        { type: 'node', ref: viaId, role: 'via' },
        { type: 'way', ref: toDos.id, role: 'to' },
      ],
    },
    viaNodes: new Map([[viaId, corner(1, 1)]]),
  };
}
