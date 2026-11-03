/**
 * Paso 7 · Nombres para mostrar: "LUGONES, LEOPOLDO AV." pasa a "Av. Leopoldo Lugones".
 * Mayúsculas según el español, abreviaturas normalizadas y tildes tomadas de OSM. Los casos raros
 * se corrigen en pipeline/nombres-override.json. Se guardan nombre oficial, para mostrar, corto,
 * alias y nombre anterior (`nomanter`, limpio).
 */
import { normalizeName, stripAccents } from '../src/engine/text';
import { osmNames } from './lib/osm';
import type { WorkSegment } from './lib/types';

export interface StreetNames {
  official: string;
  name: string;
  short: string;
  previous?: string;
  aliases: string[];
}

export interface NameOverride {
  name?: string;
  short?: string;
}

const ABBREVIATIONS: Record<string, string> = Object.fromEntries(
  [
    'Av',
    'Int',
    'Gral',
    'Pres',
    'Dr',
    'Dra',
    'Cnel',
    'Pje',
    'Tte',
    'Tcnl',
    'Ing',
    'Alte',
    'Cmte',
    'Cap',
    'Mcal',
    'Sgto',
    'Gob',
    'Gdor',
    'Arq',
    'Prof',
    'Pbro',
    'Mons',
    'Sto',
    'Sta',
    'Fco',
    'Bv',
    'Cdte',
    'Cmdro',
    'Brig',
  ].map((a) => [`${a.toUpperCase()}.`, `${a}.`]),
);
const TITLE_ABBREVIATIONS = new Set(
  Object.keys(ABBREVIATIONS).filter((a) => a !== 'AV.' && a !== 'PJE.' && a !== 'BV.'),
);
const TYPE_WORDS = new Set(['AV.', 'AV', 'PJE.', 'PJE', 'BV.', 'CALLE', 'AVENIDA', 'PASAJE']);
const LOWER_WORDS = new Set([
  'de',
  'del',
  'y',
  'e',
  'al',
  'a',
  'en',
  'con',
  'por',
  'para',
  'sin',
  'sobre',
]);
/** Los artículos van en minúscula después de "de" ("de la", "de los"); en "Las Heras", no. */
const ARTICLES = new Set(['la', 'las', 'los', 'el']);

function capitalize(word: string): string {
  // "o'higgins" → "O'Higgins", "saenz-peña" → "Saenz-Peña"
  return word.replace(
    /(^|['’-])(\p{L})/gu,
    (_, sep: string, letter: string) => sep + letter.toUpperCase(),
  );
}

/** Mayúsculas según el español: artículos y preposiciones en minúscula, romanos en mayúscula. */
export function titleCase(text: string): string {
  const words = text
    .replace(/\.(?=\p{L})/gu, '. ')
    .trim()
    .split(/\s+/);
  return words
    .map((raw, i) => {
      const upper = raw.toUpperCase();
      // "GRAL" sin punto también es "Gral.": nom_mapa suele traer las abreviaturas así.
      const abbreviation = ABBREVIATIONS[upper.endsWith('.') ? upper : `${upper}.`];
      if (abbreviation) return abbreviation;
      if (/^[IVX]{1,5}$/.test(upper) && i > 0) return upper;
      if (/^\p{L}\.$/u.test(raw)) return upper;
      const lower = raw.toLowerCase();
      if (i > 0 && LOWER_WORDS.has(lower)) return lower;
      if (i > 0 && ARTICLES.has(lower) && /^del?$/i.test(words[i - 1] ?? '')) return lower;
      return capitalize(lower);
    })
    .join(' ');
}

/** "LUGONES, LEOPOLDO AV." → "AV. LEOPOLDO LUGONES": el tipo adelante, el apellido al final. */
export function naturalOrder(official: string): string {
  const [surname = '', ...restParts] = official
    .replace(/\.(?=\p{L})/gu, '. ')
    .split(',')
    .map((p) => p.trim());
  const rest = restParts.join(' ').split(/\s+/).filter(Boolean);
  const type = rest.filter((w) => TYPE_WORDS.has(w.toUpperCase()));
  // Los títulos van antes del nombre: "Ing. José N. Quartino", no "José N. Ing. Quartino".
  const isTitle = (w: string) =>
    TITLE_ABBREVIATIONS.has(
      w.toUpperCase().endsWith('.') ? w.toUpperCase() : `${w.toUpperCase()}.`,
    );
  const others = [
    ...rest.filter((w) => !TYPE_WORDS.has(w.toUpperCase()) && isTitle(w)),
    ...rest.filter((w) => !TYPE_WORDS.has(w.toUpperCase()) && !isTitle(w)),
  ];
  const surnameWords = surname.split(/\s+/).filter(Boolean);
  const surnameType = surnameWords.filter((w) => TYPE_WORDS.has(w.toUpperCase()));
  const surnameRest = surnameWords.filter((w) => !TYPE_WORDS.has(w.toUpperCase()));
  return [...type, ...surnameType, ...others, ...surnameRest].join(' ');
}

/** Diccionario de tildes: "perez" → "pérez", con lo que aparece en OSM. */
export class AccentDictionary {
  private readonly forms = new Map<string, Map<string, number>>();

  addName(name: string): void {
    for (const word of name.split(/[\s,.()]+/)) {
      if (!/[áéíóúü]/i.test(word)) continue;
      const key = stripAccents(word).toLowerCase();
      const counts = this.forms.get(key) ?? new Map<string, number>();
      counts.set(word.toLowerCase(), (counts.get(word.toLowerCase()) ?? 0) + 1);
      this.forms.set(key, counts);
    }
  }

  accentOf(word: string): string | undefined {
    const counts = this.forms.get(stripAccents(word).toLowerCase());
    if (!counts) return undefined;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
}

/** Aplica las tildes conocidas respetando las mayúsculas de cada palabra. */
export function applyAccents(text: string, ...dictionaries: AccentDictionary[]): string {
  return text
    .split(' ')
    .map((word) => {
      const bare = word.replace(/[^\p{L}]/gu, '');
      if (!bare) return word;
      for (const dictionary of dictionaries) {
        const accented = dictionary.accentOf(bare);
        if (!accented) continue;
        let i = 0;
        return word.replace(/\p{L}/gu, (letter) => {
          const target = accented[i++] ?? letter;
          return letter === letter.toUpperCase() ? target.toUpperCase() : target;
        });
      }
      return word;
    })
    .join(' ');
}

/** "ZUFRIATEGUI(PARCIAL)" → "ZUFRIATEGUI"; lo que quedó cortado se descarta. */
export function cleanPrevious(raw: string): string | undefined {
  const cut =
    raw
      .split('(')[0]
      ?.trim()
      .replace(/[,:;\s]+$/, '') ?? '';
  return cut.length >= 3 ? cut : undefined;
}

function shortName(official: string): string {
  const [surname = '', ...rest] = official.split(',').map((p) => p.trim());
  if (rest.length === 0) {
    const words = surname.split(/\s+/).filter((w) => !TYPE_WORDS.has(w.toUpperCase()));
    while (words.length > 1 && LOWER_WORDS.has((words[0] ?? '').toLowerCase())) words.shift();
    return words.join(' ');
  }
  const title = rest
    .join(' ')
    .split(/\s+/)
    .find((w) => TITLE_ABBREVIATIONS.has(w.toUpperCase()));
  // "PAZ, GRAL. AV." → "Gral. Paz": un apellido tan corto solo no se reconoce.
  return surname.replace(/[^\p{L}]/gu, '').length <= 4 && title ? `${title} ${surname}` : surname;
}

function mostFrequent(values: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export interface NamesBuild {
  names: Map<number, StreetNames>;
  /** Formatea un nombre oficial suelto (por ejemplo, una calle fuera del área). */
  format: (official: string) => string;
}

/** Nombres de cada calle, a partir de sus tramos y de las vías de OSM con las que se cruzaron. */
export function buildNames(
  segmentsByStreet: ReadonlyMap<number, readonly WorkSegment[]>,
  overrides: Readonly<Record<string, NameOverride>>,
): NamesBuild {
  const global = new AccentDictionary();
  const local = new Map<number, AccentDictionary>();
  const osmByStreet = new Map<number, string[]>();
  for (const [code, segments] of segmentsByStreet) {
    const dictionary = new AccentDictionary();
    const names: string[] = [];
    for (const segment of segments) {
      for (const match of segment.osm?.ways ?? []) {
        for (const name of osmNames(match.way.tags)) {
          dictionary.addName(name);
          global.addName(name);
          names.push(name);
        }
      }
    }
    local.set(code, dictionary);
    osmByStreet.set(code, names);
  }

  const result = new Map<number, StreetNames>();
  for (const [code, segments] of segmentsByStreet) {
    const dictionaries = [local.get(code) ?? new AccentDictionary(), global];
    const format = (raw: string) => applyAccents(titleCase(raw), ...dictionaries);
    const official = mostFrequent(segments.map((s) => s.row.official));
    const mapName = mostFrequent(segments.map((s) => s.row.mapName));
    const override = overrides[String(code)] ?? {};
    // nom_mapa está pensado para mapas ("AV. PARQUE ROBERTO GOYENECHE"); a veces viene sin
    // espacios ("AV.GRAL PAZ"), cosa que arregla titleCase. Si falta, se reordena el oficial.
    const name = override.name ?? format(mapName || naturalOrder(official));
    const short = override.short ?? format(shortName(official));
    const previousNames = [
      ...new Set(segments.map((s) => cleanPrevious(s.row.previous)).filter((p) => p !== undefined)),
    ]
      .map((p) => format(naturalOrder(p)))
      .filter((p) => normalizeName(p) !== normalizeName(name));
    const osm = [...new Set(osmByStreet.get(code) ?? [])].filter(
      (n) => normalizeName(n) !== normalizeName(name),
    );
    const aliases = [
      ...new Set([format(naturalOrder(official)), short, ...previousNames, ...osm]),
    ].filter((alias) => normalizeName(alias) !== normalizeName(name));
    result.set(code, {
      official,
      name,
      short,
      ...(previousNames[0] ? { previous: previousNames[0] } : {}),
      aliases: aliases.slice(0, 8),
    });
  }
  return {
    names: result,
    format: (official) => applyAccents(titleCase(naturalOrder(official)), global),
  };
}
