import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    /*
     * `@openfiat/sdk` is a git dependency, so pnpm stores it in a
     * directory whose name contains the commit hash after a `#`:
     *
     *   node_modules/.pnpm/@openfiat+sdk@git+https+…+openfiat-sdks.git#f0c4000…/
     *
     * Vite resolves module ids as URLs, where `#` starts a fragment. With
     * symlinks followed (the default) the real path goes through that
     * directory, so Vite truncated the id at the `#`, re-appended `?`,
     * and reported the file as missing — taking out every test file that
     * imports the SDK while the rest of the suite passed, which is why it
     * read as an SDK problem rather than a path-encoding one.
     *
     * Preserving symlinks keeps the id as `node_modules/@openfiat/sdk/…`,
     * which has no `#` in it. It also matches how Node itself resolves
     * this package at runtime, so tests and the app now load it by the
     * same path.
     */
    preserveSymlinks: true,
  },
  // tests/e2e is Playwright's own suite (playwright.config.ts), not
  // vitest's — vitest's default include pattern matches *.spec.ts
  // anywhere, which would otherwise try to run Playwright's `test()`
  // inside vitest's runner and fail.
  test: { environment: "jsdom", exclude: ["**/node_modules/**", "tests/e2e/**"] },
});
