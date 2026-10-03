import { createRequire } from "node:module";
import { dirname } from "node:path";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);
const pkg = (name: string) => dirname(require.resolve(`${name}/package.json`));

/**
 * Runs block-kit's own test suite against React 18. The tests live in the package, where "react"
 * resolves to the workspace's React 19, so every React import is pointed at this workspace's copy;
 * two copies of React in one tree would break hooks.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@testing-library\/react$/, replacement: pkg("@testing-library/react") },
      { find: /^react$/, replacement: pkg("react") },
      { find: /^react\/(.*)$/, replacement: `${pkg("react")}/$1` },
      { find: /^react-dom$/, replacement: pkg("react-dom") },
      { find: /^react-dom\/(.*)$/, replacement: `${pkg("react-dom")}/$1` },
    ],
  },
  test: {
    root: "../../packages/block-kit",
    environment: "jsdom",
    // The build test checks tsdown's config, which doesn't depend on the React version.
    exclude: ["**/node_modules/**", "src/build.test.ts"],
    server: { deps: { inline: [/@testing-library\/react/] } },
  },
});
