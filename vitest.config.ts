import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep test execution serial in restricted/sandboxed environments where
    // worker-pool teardown can otherwise crash after tests finish.
    pool: "threads",
    isolate: false,
    fileParallelism: false,
    poolOptions: {
      threads: { singleThread: true },
    },
    include: ["tests/**/*.test.ts"],
  },
});
