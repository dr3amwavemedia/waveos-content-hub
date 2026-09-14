import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  cacheDir: "../../.navigation-cache",
  resolve: { alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) } },
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: { host: "127.0.0.1", port: 5188, strictPort: true },
});
