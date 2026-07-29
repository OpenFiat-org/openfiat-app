import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  // tests/e2e is Playwright's own suite (playwright.config.ts), not
  // vitest's — vitest's default include pattern matches *.spec.ts
  // anywhere, which would otherwise try to run Playwright's `test()`
  // inside vitest's runner and fail.
  test: { environment: "jsdom", exclude: ["**/node_modules/**", "tests/e2e/**"] },
});
