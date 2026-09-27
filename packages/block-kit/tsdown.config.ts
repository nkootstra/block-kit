import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    mrkdwn: "src/mrkdwn/index.ts",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  clean: true,
});
