/**
 * IDs tipadas y estables de las tarjetas (sección 8, paso 11). El progreso depende de ellas:
 * cambiar cómo se arman obliga a pasar por el archivo de cambios y una migración.
 */
import { stripAccents } from './text';

export type NameCardId = `N:${number}`;
export type DirectionCardId = `S:${number}:${string}`;
export type HeightCardId = `A:${number}:${number}`;
export type CrossingsCardId = `T:${number}:${'asc' | 'desc'}:${number}`;
export type BarrierCardId = `B:${string}:${string}`;
export type LandmarkCardId = `H:${string}`;
export type BarrioCardId = `Z:${string}`;

export type CardId =
  | NameCardId
  | DirectionCardId
  | HeightCardId
  | CrossingsCardId
  | BarrierCardId
  | LandmarkCardId
  | BarrioCardId;

/** "Villa Urquiza" → "villa-urquiza". Se usa para hitos, barrios y barreras. */
export function slugify(text: string): string {
  return stripAccents(text)
    .toLowerCase()
    .replaceAll('ñ', 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const cardIds = {
  name: (code: number): NameCardId => `N:${code}`,
  /** Un tramo de sentido homogéneo, identificado por su rango de alturas o, sin alturas, por su orden. */
  direction: (code: number, range: string): DirectionCardId => `S:${code}:${range}`,
  /** Una tarjeta por cada mil de la calle: A:código:2000 es el tramo del 2000 al 2999. */
  height: (code: number, thousand: number): HeightCardId => `A:${code}:${thousand}`,
  crossings: (code: number, direction: 'asc' | 'desc', firstCross: number): CrossingsCardId =>
    `T:${code}:${direction}:${firstCross}`,
  barrier: (barrier: string, stretch: string): BarrierCardId => `B:${barrier}:${stretch}`,
  landmark: (slug: string): LandmarkCardId => `H:${slug}`,
  barrio: (slug: string): BarrioCardId => `Z:${slug}`,
};

const PATTERNS: Record<CardId extends `${infer P}:${string}` ? P : never, RegExp> = {
  N: /^N:\d+$/,
  S: /^S:\d+:[a-z0-9-]+$/,
  A: /^A:\d+:\d+$/,
  T: /^T:\d+:(asc|desc):\d+$/,
  B: /^B:[a-z0-9-]+:[a-z0-9-]+$/,
  H: /^H:[a-z0-9-]+$/,
  Z: /^Z:[a-z0-9-]+$/,
};

export function isCardId(id: string): id is CardId {
  const prefix = id.slice(0, 1) as keyof typeof PATTERNS;
  return Object.hasOwn(PATTERNS, prefix) && PATTERNS[prefix].test(id);
}
