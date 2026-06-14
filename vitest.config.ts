import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The default worker-thread pool (tinypool) crashes on teardown in
    // restricted/sandboxed and some CI environments. Forks are robust there.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    include: ["tests/**/*.test.ts"],
  },
});
