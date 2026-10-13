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

function writeFlag(value: boolean) {
  try {
    if (value) sessionStorage.setItem(RELOAD_FLAG, '1');
    else sessionStorage.removeItem(RELOAD_FLAG);
  } catch { /* storage unavailable — ignore */ }
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
      if (isChunkLoadError(err) && !readFlag()) {
        writeFlag(true);
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
