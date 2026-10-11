import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Only the page is built here; the Hono server in `server/` runs as is, and is the only code that
// sees SLACK_BOT_TOKEN. Vite exposes only VITE_-prefixed variables to the page: never give the
// token that prefix.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist/client" },
  server: { proxy: { "/api": "http://localhost:8787" } },
});
