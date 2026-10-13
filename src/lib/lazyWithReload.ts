import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'jf:chunk-reload';

/** True for the errors browsers throw when a lazily imported chunk can't be fetched. */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError/i.test(message);
}

function readFlag(): boolean {
  try { return sessionStorage.getItem(RELOAD_FLAG) === '1'; } catch { return false; }
}

/** Returns false when storage is unavailable, so callers never reload without a loop guard. */
function writeFlag(value: boolean): boolean {
  try {
    if (value) sessionStorage.setItem(RELOAD_FLAG, '1');
    else sessionStorage.removeItem(RELOAD_FLAG);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wraps a dynamic import so that a stale chunk after a new deploy (old index.html
 * referencing files that no longer exist) triggers one full reload instead of a crash.
 * A second consecutive failure is rethrown so the error boundary can show it.
 */
export function loadWithReload<T>(
  factory: () => Promise<T>,
  reload: () => void = () => window.location.reload(),
): Promise<T> {
  return factory().then(
    (mod) => {
      writeFlag(false);
      return mod;
    },
    (err: unknown) => {
      // Without a persisted flag we can't tell a first failure from a reload loop,
      // so only reload when the flag was actually stored.
      if (isChunkLoadError(err) && !readFlag() && writeFlag(true)) {
        reload();
        // Keep Suspense showing its fallback while the page reloads.
        return new Promise<T>(() => {});
      }
      throw err;
    },
  );
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => loadWithReload(factory));
}
