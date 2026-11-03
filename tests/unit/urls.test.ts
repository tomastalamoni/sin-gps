import { describe, expect, it } from 'vitest';
import { assetUrl, glyphsUrl } from '../../src/lib/urls';

describe('assetUrl', () => {
  it('antepone la base del deploy', () => {
    expect(assetUrl('logo.svg', '/sin-gps/')).toBe('/sin-gps/logo.svg');
    expect(assetUrl('logo.svg', '/')).toBe('/logo.svg');
  });

  it('no duplica barras', () => {
    expect(assetUrl('/fonts/x.pbf', '/sin-gps/')).toBe('/sin-gps/fonts/x.pbf');
    expect(assetUrl('logo.svg', '/sin-gps')).toBe('/sin-gps/logo.svg');
  });
});

describe('glyphsUrl', () => {
  it('arma una plantilla absoluta con las llaves sin codificar', () => {
    expect(glyphsUrl('https://ejemplo.github.io', '/sin-gps/')).toBe(
      'https://ejemplo.github.io/sin-gps/fonts/{fontstack}/{range}.pbf',
    );
  });
});
