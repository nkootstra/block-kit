import stylex from "@stylexjs/unplugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * StyleX compiles the components' styles. Its dev-server hook serves CSS the tests never load and
 * starts an interval it clears only when an HTTP server closes; vitest's servers have none, so
 * the interval kept vitest from exiting. The tests leave the hook out.
 */
function stylexForTests() {
  const { configureServer: _, ...plugin } = stylex();
  return plugin;
}

// The app's aliases and defines, without its dev-server and build plugins.
export default defineConfig(async (env) => {
  const { resolve, define } = await viteConfig(env);
  return { resolve, define, plugins: [stylexForTests(), react()] };
});
