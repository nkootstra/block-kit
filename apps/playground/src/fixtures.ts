// The visual-baseline.<platform>.json files sit alongside the fixtures but aren't payloads.
const modules = import.meta.glob<{ default: unknown }>(
  ["../../../fixtures/**/*.json", "!../../../fixtures/visual-baseline.*.json"],
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
