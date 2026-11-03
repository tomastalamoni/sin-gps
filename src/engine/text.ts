/**
 * Normalización de nombres para comparar y buscar: minúsculas, sin tildes ni signos y con las
 * abreviaturas expandidas. "GRAL. PAZ AV." y "avenida general paz" quedan iguales.
 */
const ABBREVIATIONS: Record<string, string> = {
  av: 'avenida',
  avda: 'avenida',
  pje: 'pasaje',
  pres: 'presidente',
  pte: 'presidente',
  gral: 'general',
  gob: 'gobernador',
  gdor: 'gobernador',
  int: 'intendente',
  dr: 'doctor',
  dra: 'doctora',
  cnel: 'coronel',
  tte: 'teniente',
  tcnl: 'teniente coronel',
  cap: 'capitan',
  cmte: 'comandante',
  alte: 'almirante',
  mcal: 'mariscal',
  sgto: 'sargento',
  ing: 'ingeniero',
  arq: 'arquitecto',
  prof: 'profesor',
  pbro: 'presbitero',
  mons: 'monseñor',
  sto: 'santo',
  sta: 'santa',
  fco: 'francisco',
};

/** Palabras que no ayudan a distinguir una calle de otra. */
const STOP_WORDS = new Set([
  'de',
  'del',
  'la',
  'las',
  'los',
  'el',
  'y',
  'e',
  'calle',
  'avenida',
  'pasaje',
]);

export function stripAccents(text: string): string {
  // La ñ se conserva: "Nuñez" no es "Nunez" para quien lo busca.
  return text
    .replaceAll('ñ', '\u0000')
    .replaceAll('Ñ', '\u0001')
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replaceAll('\u0000', 'ñ')
    .replaceAll('\u0001', 'Ñ');
}

/** Palabras normalizadas, con las abreviaturas expandidas. */
export function nameWords(text: string): string[] {
  return stripAccents(text)
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .flatMap((word) => (ABBREVIATIONS[word] ?? word).split(' '));
}

/** Forma canónica para comparar nombres. */
export function normalizeName(text: string): string {
  return nameWords(text).join(' ');
}

/** Las palabras que identifican la calle, sin artículos ni tipos de vía. */
export function significantWords(text: string): string[] {
  return nameWords(text).filter((word) => !STOP_WORDS.has(word));
}

/**
 * Parecido entre dos nombres, de 0 a 1: la proporción de palabras significativas del nombre más
 * corto que aparecen en el otro. "Av. Cabildo" contra "CABILDO AV." da 1.
 */
export function nameSimilarity(a: string, b: string): number {
  const wa = new Set(significantWords(a));
  const wb = new Set(significantWords(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  let common = 0;
  for (const word of small) if (large.has(word)) common++;
  return common / small.size;
}
