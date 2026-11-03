/**
 * Configuración del pipeline: barrios, tolerancias, umbrales y fuentes (sección 8 del plan).
 * Acá no hay ningún nombre de calle, sentido ni altura: todo eso sale de los datos.
 */

/** Barrios activos, escritos como vienen en el callejero (campo `barrio`). */
export const ACTIVE_BARRIOS = [
  'Retiro',
  'Recoleta',
  'Palermo',
  'Belgrano',
  'Colegiales',
  'Nuñez',
  'Saavedra',
  'Villa Urquiza',
  'Coghlan',
] as const;

/** Nombre para mostrar cuando el callejero lo escribe distinto. */
export const BARRIO_DISPLAY_NAMES: Record<string, string> = { Nuñez: 'Núñez' };

/** Zona de borde: se puede manejar, pero nunca se pregunta ni es origen o destino. */
export const BORDER_ZONE_M = 400;

/** Margen extra alrededor del área para bajar OSM (para cruzar los tramos del borde). */
export const OSM_MARGIN_M = 800;

export const TOLERANCES = {
  /** Extremos de tramos a menos de esto son el mismo nodo; un extremo así de cerca del medio de otro tramo lo parte. */
  nodeM: 1,
  /** Empalme entre cuadras consecutivas de la misma calle, para orientar. */
  orientTouchM: 2,
  /** Cruce con OSM: distancia máxima y cobertura mínima del tramo. */
  osmMatchM: 30,
  osmMinCoverage: 0.6,
  /** Semáforo de OSM a menos de esto de una esquina. */
  signalM: 25,
  /** Dos calzadas paralelas de la misma calle a menos de esto se preguntan juntas. */
  splitCarriagewayM: 40,
  /** Restricción de giro de OSM: el nodo "via" tiene que caer a menos de esto de una esquina. */
  restrictionViaM: 15,
  /** A menos de esto del borde de un sector de 90°, no se muestra rumbo. */
  rumboDeadZoneDeg: 10,
} as const;

export const IMPORTANCE = { routes: 20_000, seed: 20_261_103 } as const;

export const VALIDATION = {
  /** Aristas desde las que se llega a cualquier otra respetando sentidos y restricciones. */
  minConnectivity: 0.98,
  /**
   * Tramos con par en OSM. Hoy da más del 95%: mucho menos indica una descarga de OSM incompleta.
   */
  minOsmMatch: 0.9,
} as const;

export const SOURCES = {
  callejero:
    'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/jefatura-de-gabinete-de-ministros/calles/callejero.csv',
  barrios:
    'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/innovacion-transformacion-digital/barrios/barrios.geojson',
  /** Servidores de Overpass, en orden de preferencia: si uno está saturado, se prueba el siguiente. */
  overpass: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],
} as const;

/** Overpass y BA Data rechazan pedidos sin un User-Agent que identifique la app. */
export const USER_AGENT = 'sin-gps/0.1 (+https://github.com/tomastalamoni/sin-gps)';

export const RAW_DIR = 'pipeline/raw';
export const OUT_DIR = 'public/data';
