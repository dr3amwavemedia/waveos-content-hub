import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: ["navigation.spec.ts", "local-workflows.spec.ts"],
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5188", browserName: "chromium" },
  webServer: {
    command:
      "node ../../node_modules/vite/bin/vite.js --config vite.config.mjs --configLoader native",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: false,
  },
});
