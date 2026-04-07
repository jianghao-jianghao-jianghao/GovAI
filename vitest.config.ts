import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "api/**/*.test.ts",
      "hooks/**/*.test.ts",
      "components/**/*.test.ts",
    ],
  },
});
