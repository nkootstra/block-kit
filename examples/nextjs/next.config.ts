import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// The repository root, where Bun keeps the packages this workspace links to.
const root = fileURLToPath(new URL("../..", import.meta.url));

export default {
  turbopack: { root },
  outputFileTracingRoot: root,
} satisfies NextConfig;
