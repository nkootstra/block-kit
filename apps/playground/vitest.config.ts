import { defineConfig } from "vitest/config";

// The unit tests cover plain modules (payload parsing, limits); they don't need vite.config.ts's
// plugins or its interaction relay.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
