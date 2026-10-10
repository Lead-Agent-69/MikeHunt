import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { builtinModules } from "node:module";

export default defineConfig({
  plugins: [
    {
      name: "test-node-builtins",
      enforce: "pre",
      resolveId(id) {
        // DOM simulation does not turn filesystem imports into browser modules.
        if (id.startsWith("node:") || builtinModules.includes(id))
          return { id, external: true };
      },
    },
    react(),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    // Bound heavy route imports so parallel workers do not starve test timeouts.
    maxWorkers: 2,
    // Repository-wide security scans and cold route imports exceed 5s on shared Windows runners.
    testTimeout: 30_000,
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
