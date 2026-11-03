interface DisplayEnvironment {
  matchMedia(query: string): { matches: boolean };
  navigator: object;
}

/** ¿Se abrió desde el ícono (instalada) y no en una pestaña del navegador? */
export function isStandalone(env: DisplayEnvironment = window): boolean {
  // display-mode es el estándar; navigator.standalone, lo que usa Safari en el iPhone.
  return (
    env.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in env.navigator && env.navigator.standalone === true)
  );
}

/** iPhone, iPad o iPod. El iPad nuevo se presenta como Mac, pero tiene pantalla táctil. */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  return (
    /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes('Macintosh') && maxTouchPoints > 1)
  );
}
