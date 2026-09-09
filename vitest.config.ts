import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    exclude: [
      ".artifacts/**",
      "e2e/**",
      "node_modules/**"
    ],
    // Database suites exercise singleton schedules and the global delivery worker.
    // Run files serially so one suite cannot claim another suite's test email.
    fileParallelism: false
  }
});
