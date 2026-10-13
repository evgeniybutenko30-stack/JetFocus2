import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Long-lived vendor chunks. These libraries are needed by the app shell on every
 * page, so splitting them out does not delay first paint, but it keeps their file
 * hashes stable between deploys (returning users re-download only app code) and
 * lets the browser fetch them in parallel instead of as one ~700 kB entry file.
 *
 * Deliberately NOT listed:
 *  - recharts: only imported by lazily loaded route chunks, so Rollup already
 *    keeps it (≈100 kB gzip) out of the initial download;
 *  - radix / lucide icons: most of them are used only by lazy pages; forcing them
 *    into one eager chunk would make the first load bigger, not smaller.
 */
const VENDOR_CHUNKS: ReadonlyArray<readonly [name: string, pattern: RegExp]> = [
  ["vendor-react", /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/],
  ["vendor-supabase", /[\\/]node_modules[\\/](@supabase[\\/][^\\/]+|iceberg-js)[\\/]/],
  ["vendor-data", /[\\/]node_modules[\\/](dexie|dexie-react-hooks|@tanstack[\\/][^\\/]+|zustand)[\\/]/],
];

function vendorChunk(id: string): string | undefined {
  // Rollup's CommonJS interop helper is needed by react/react-dom (CJS packages).
  // Pin it next to them; otherwise Rollup may place it in another vendor chunk and
  // create a vendor-react <-> vendor-* circular import (evaluation-order hazard).
  if (id.includes("commonjsHelpers")) return "vendor-react";
  for (const [name, pattern] of VENDOR_CHUNKS) {
    if (pattern.test(id)) return name;
  }
  return undefined;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the app from /<repo>/; the deploy workflow passes BASE_PATH.
  base: process.env.BASE_PATH || "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  build: {
    // Never publish source maps to the public GitHub Pages site.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
