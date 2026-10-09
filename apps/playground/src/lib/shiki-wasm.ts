// The playground highlights with shiki's JavaScript regex engine, so the Oniguruma WebAssembly
// build `@pierre/diffs` can lazy-load is never used. vite.config.ts points `shiki/wasm` here so it
// isn't shipped.
export default function unavailable(): never {
  throw new Error("The playground doesn't ship shiki's WebAssembly engine.");
}
