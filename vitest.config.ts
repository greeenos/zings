import { defineConfig } from "vitest/config";
import { alias } from "./vite.config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // The first page test compiles the whole tree and its ESM dependencies cold; that alone can pass 15 s.
    testTimeout: 30_000,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "server/**/*.test.ts"],
  },
  // ESM builds everywhere (dnd-kit only names its ESM build in "module").
  resolve: { alias, mainFields: ["module", "main"] },
});
