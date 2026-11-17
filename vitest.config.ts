import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
    },
  },
  test: {
    environment: "node",
    include: ["game-core/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["game-core/**/*.ts"],
      exclude: ["game-core/**/*.test.ts", "game-core/index.ts"],
    },
  },
});
