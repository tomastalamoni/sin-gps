import { describe, expect, it } from 'vitest';
import { isAppleMobile, isStandalone } from '../../src/lib/platform';

function environment(displayModeStandalone: boolean, navigator: object = {}) {
  return { matchMedia: () => ({ matches: displayModeStandalone }), navigator };
}

describe('isStandalone', () => {
  it('reconoce display-mode: standalone', () => {
    expect(isStandalone(environment(true))).toBe(true);
  });

  it('reconoce navigator.standalone del iPhone', () => {
    expect(isStandalone(environment(false, { standalone: true }))).toBe(true);
  });

  it('en una pestaña del navegador da false', () => {
    expect(isStandalone(environment(false))).toBe(false);
    expect(isStandalone(environment(false, { standalone: false }))).toBe(false);
  });
});

describe('isAppleMobile', () => {
  const iphone =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
  const mac =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
  const android =
    'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

  it('reconoce el iPhone', () => {
    expect(isAppleMobile(iphone, 5)).toBe(true);
  });

  it('reconoce el iPad que se presenta como Mac', () => {
    expect(isAppleMobile(mac, 5)).toBe(true);
  });

  it('no confunde una Mac ni un Android', () => {
    expect(isAppleMobile(mac, 0)).toBe(false);
    expect(isAppleMobile(android, 5)).toBe(false);
  });
});
