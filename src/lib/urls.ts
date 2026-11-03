/**
 * URLs de los archivos de public/. Todas pasan por la base del deploy, que Vite expone en
 * import.meta.env.BASE_URL: "/" en local y "/sin-gps/" en GitHub Pages.
 */
export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return prefix + path.replace(/^\/+/, '');
}

/**
 * Plantilla de glyphs para MapLibre. Va absoluta y armada concatenando texto: new URL()
 * codificaría las llaves de {fontstack} y {range}.
 */
export function glyphsUrl(origin: string = window.location.origin, base?: string): string {
  return origin + assetUrl('fonts/{fontstack}/{range}.pbf', base);
}
