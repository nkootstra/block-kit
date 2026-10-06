// Fixture payloads live in folders under fixtures/: the JSON files at its top are bookkeeping (the
// lock and the baselines), and `*.actions.json` files are payloads recorded in Block Kit Builder.
const modules = import.meta.glob<{ default: unknown }>(
  ["../../../fixtures/*/**/*.json", "!../../../fixtures/**/*.actions.json"],
  { eager: true },
);

export interface Fixture {
  name: string;
  json: string;
}

export const fixtures: Fixture[] = Object.entries(modules)
  .map(([path, mod]) => ({
    name: path.replace(/^.*fixtures\//, "").replace(/\.json$/, ""),
    json: JSON.stringify(mod.default, null, 2),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
