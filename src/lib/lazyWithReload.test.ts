import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, loadWithReload } from './lazyWithReload';

describe('isChunkLoadError', () => {
  it('recognises browser chunk-load failures', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of null'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('loadWithReload', () => {
  beforeEach(() => sessionStorage.clear());

  it('resolves the module and clears the reload flag on success', async () => {
    sessionStorage.setItem('jf:chunk-reload', '1');
    const mod = { default: 'ok' };
    await expect(loadWithReload(() => Promise.resolve(mod))).resolves.toBe(mod);
    expect(sessionStorage.getItem('jf:chunk-reload')).toBeNull();
  });

  it('reloads once on a stale chunk instead of throwing', async () => {
    const reload = vi.fn();
    const pending = loadWithReload(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), reload);
    // Let the rejection handler run.
    await new Promise((r) => setTimeout(r, 0));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('jf:chunk-reload')).toBe('1');
    // The promise never settles (page is reloading).
    const settled = await Promise.race([pending.then(() => 'settled', () => 'settled'), new Promise((r) => setTimeout(() => r('pending'), 20))]);
    expect(settled).toBe('pending');
  });

  it('rethrows when the reload already happened (no reload loop)', async () => {
    sessionStorage.setItem('jf:chunk-reload', '1');
    const reload = vi.fn();
    await expect(loadWithReload(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), reload))
      .rejects.toThrow('Failed to fetch dynamically imported module');
    expect(reload).not.toHaveBeenCalled();
  });

  it('rethrows non-chunk errors without reloading', async () => {
    const reload = vi.fn();
    await expect(loadWithReload(() => Promise.reject(new Error('boom')), reload)).rejects.toThrow('boom');
    expect(reload).not.toHaveBeenCalled();
  });
});
