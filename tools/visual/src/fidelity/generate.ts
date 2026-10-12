/**
 * Writes the fidelity inventory (inventory.ts) from what the repository holds today:
 *
 *   bun tools/visual/src/fidelity/generate.ts [--discovery <discovery.json>]
 *
 * With --discovery, the rules read from Block Kit Builder's stylesheets (stylesheet.ts) add the
 * states Slack's classes reveal to the components they style, and the report lists the stylesheet
 * families that map to no component.
 * Reads the fixtures, references (and the motion in their meta), payload recordings, baselines,
 * the interaction tests and the package's renderer registries, then writes
 * test-results/fidelity/inventory.json (every cell) and inventory.md (totals, gaps, capture
 * batches and the capture extensions they need), and prints the totals. It reports; it doesn't
 * fail, except when the interaction-test mapping (interactionTests.ts) is out of date.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Glob } from "bun";
import { readRecordings } from "../coverage";
import { FIXTURES, readPayloads, readReferences } from "../lock";
import { type Behaviour, probeSnapshots, readProbes } from "../probes";
import { referenceMeta } from "./captures";
import { COMPONENTS } from "./components";
import { EXTENSIONS } from "./extensions";
import { FINDINGS } from "./findings";
import { LIMITS } from "./limits";
import {
  type CapturePlan,
  capturePlan,
  chunkItems,
  type PlanItem,
  SESSION_SIZE,
  verifyPlan,
} from "./plan";
import { parseDiscovery } from "./stylesheet";
import { describeTitles, INTERACTION_TESTS, OUTSIDE_AXES } from "./interactionTests";
import {
  type Batch,
  batches,
  buildInventory,
  type Inventory,
  type Sources,
  summarize,
} from "./inventory";

const ROOT = resolve(import.meta.dir, "../../../..");
const PACKAGE = join(ROOT, "packages/block-kit/src");

/** Whether a reference's meta recorded any transition or animation. */
export function metaHasMotion(html: string): boolean {
  const meta = /id="sbk-reference-meta"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!meta) return false;
  const motion = (JSON.parse(meta) as { motion?: Record<string, Record<string, string>> }).motion;
  return Object.values(motion ?? {}).some(
    (m) =>
      (m["transition-duration"] !== undefined && !/^0s(, 0s)*$/.test(m["transition-duration"])) ||
      m["animation-name"] !== undefined,
  );
}

/** The keys of a `Record<string, Component>` registry literal named `name`. */
export function registryKeys(source: string, name: string): Set<string> {
  const body = new RegExp(`${name}[^=]*=\\s*{([^}]*)}`).exec(source)?.[1] ?? "";
  return new Set([...body.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]!));
}

/** The `case "<type>":` labels of the rich text renderer. */
export function caseLabels(source: string): Set<string> {
  return new Set([...source.matchAll(/case "([a-z_]+)":/g)].map((m) => m[1]!));
}

/** Checks the interaction-test mapping against the test file's top-level groups. */
export function checkMapping(titles: string[]): string[] {
  const mapped = new Set([...Object.keys(INTERACTION_TESTS), ...OUTSIDE_AXES]);
  const present = new Set(titles);
  return [
    ...titles.filter((t) => !mapped.has(t)).map((t) => `unmapped interaction test group "${t}"`),
    ...[...mapped].filter((t) => !present.has(t)).map((t) => `no interaction test group "${t}"`),
  ];
}

/** The path given as `--discovery <path>` or `--discovery=<path>`. */
export function discoveryPath(args: string[]): string | undefined {
  const i = args.findIndex((a) => a === "--discovery" || a.startsWith("--discovery="));
  if (i === -1) return undefined;
  const path = args[i]!.includes("=") ? args[i]!.slice("--discovery=".length) : args[i + 1];
  if (!path) throw new Error("--discovery needs the path of a stylesheet discovery JSON file");
  return path;
}

const read = (path: string) => Bun.file(join(PACKAGE, path)).text();

async function readSources(stylesheet?: string): Promise<Sources> {
  const [payloads, references, recordingNames] = await Promise.all([
    readPayloads(),
    readReferences(),
    readRecordings(),
  ]);
  const behaviour = new Map<string, Behaviour>();
  const probeSpecs: string[] = [];
  for await (const path of new Glob("**/*.{behaviour,probe}.json").scan(FIXTURES)) {
    const [, name = "", kind] = /^(.*)\.(behaviour|probe)\.json$/.exec(path) ?? [];
    if (kind === "probe") probeSpecs.push(name);
    else behaviour.set(name, (await Bun.file(join(FIXTURES, path)).json()) as Behaviour);
  }
  const recordings = new Map<string, unknown>();
  for (const name of recordingNames)
    recordings.set(name, await Bun.file(join(FIXTURES, `${name}.actions.json`)).json());
  const [blocks, elements, richText, tests] = await Promise.all([
    read("blocks/index.ts"),
    read("elements/index.ts"),
    read("blocks/RichText.tsx"),
    Bun.file(join(import.meta.dir, "../interaction/interaction.browser.ts")).text(),
  ]);
  const problems = checkMapping(describeTitles(tests));
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const textBaseline = (await Bun.file(
    join(FIXTURES, "text-baseline.linux.json"),
  ).json()) as Record<string, unknown[]>;
  const pixelBaseline = (await Bun.file(
    join(FIXTURES, "visual-baseline.linux.json"),
  ).json()) as Record<string, number>;
  const files = new Set<string>();
  for (const c of COMPONENTS)
    if (c.impl && "file" in c.impl && (await Bun.file(join(ROOT, c.impl.file)).exists()))
      files.add(c.impl.file);
  return {
    ...(stylesheet ? { stylesheet: parseDiscovery(await Bun.file(stylesheet).json()) } : {}),
    payloads,
    references: new Map(
      [...references].map(([name, html]) => [
        name,
        { motion: metaHasMotion(html), ...referenceMeta(html) },
      ]),
    ),
    behaviour,
    probes: new Set(probeSpecs),
    snapshots: probeSnapshots(await readProbes()),
    recordings,
    interactionTests: INTERACTION_TESTS,
    baseline: new Set(Object.keys(pixelBaseline)),
    textFindings: new Map(Object.entries(textBaseline).map(([k, v]) => [k, v.length])),
    implemented: {
      blocks: registryKeys(blocks, "blockComponents"),
      elements: registryKeys(elements, "elementComponents"),
      "rich-text": caseLabels(richText),
    },
    files,
  };
}

const pct = (t: { covered: number; total: number; pct: number }) =>
  `${t.covered}/${t.total} (${t.pct}%)`;
const table = (head: string[], rows: (string | number)[][]) =>
  [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");

const byCount = (o: Record<string, { covered: number; total: number; pct: number }>) =>
  Object.entries(o).map(([k, t]) => [k, t.total, t.covered, `${t.pct}%`]);

/** What Block Kit Builder's stylesheets added, and the families nothing maps. */
function stylesheetSection(inventory: Inventory): string[] {
  const css = inventory.stylesheet;
  if (!css) return [];
  const added = inventory.cells.filter((c) => c.origin === "builder-css");
  const families = (status: string) => css.families.filter((f) => f.status === status);
  const reasons = new Map<string, { families: number; rules: number }>();
  for (const f of families("out-of-scope")) {
    const r = reasons.get(f.reason!) ?? { families: 0, rules: 0 };
    reasons.set(f.reason!, { families: r.families + 1, rules: r.rules + f.rules });
  }
  return [
    "## From Block Kit Builder's stylesheets",
    "",
    `${css.rules.total} rules: ${css.rules.mapped} style a component, ${css.rules.outOfScope} are Slack client UI outside Block Kit, ${css.rules.unmapped} map to nothing yet. They add ${added.length} cells (origin \`builder-css\`) in states the inventory didn't list:`,
    "",
    table(
      ["component", "states only the stylesheets show"],
      css.added.map((a) => [a.component, a.states.join(", ")]),
    ),
    "",
    "### Mapped families",
    "",
    table(
      ["family", "rules", "direct", "components", "states"],
      families("mapped").map((f) => [
        `\`${f.family}\``,
        f.rules,
        f.direct,
        f.components!.join(", "),
        f.states.join(", "),
      ]),
    ),
    "",
    "### Unmapped families, for review",
    "",
    "Most direct first: `direct` rules name a class a captured reference uses.",
    "",
    table(
      ["family", "rules", "direct", "states", "example"],
      families("unmapped")
        .toSorted((a, b) => b.direct - a.direct || b.rules - a.rules)
        .map((f) => [
          `\`${f.family}\``,
          f.rules,
          f.direct,
          f.states.join(", "),
          `\`${f.examples[0] ?? ""}\``,
        ]),
    ),
    "",
    "### Out of scope",
    "",
    table(
      ["reason", "families", "rules"],
      [...reasons].map(([r, n]) => [r, n.families, n.rules]),
    ),
    "",
  ];
}

/** The capture plan: sessions of capture.js items, then the fixtures to write first. */
const firstNames = (items: PlanItem[]) =>
  items
    .slice(0, 3)
    .map((i) => `\`${i.name}\``)
    .join(", ") + (items.length > 3 ? " …" : "");

export function planSection(plan: CapturePlan): string[] {
  const t = plan.totals;
  return [
    "## Capture plan",
    "",
    `${t.items} captures on existing fixtures cover ${t.cellsCovered} uncovered cells, in ${t.sessions} Block Kit Builder sessions: one per surface, theme and width, each with every kind of capture (plain, open, \`+full\`, \`@scrolled-end\`, real input, \`@submit-errors\`, probes). capture.js takes them ${SESSION_SIZE} at a time. ${t.realInputItems} items need real input (held hover or focus, a probe's steps, a submit, a real click) and come after the automatic ones in each session; ${t.probes} are behaviour probes, whose specs are next to their fixtures (\`<fixture>@<probe>.probe.json\`) and which also record the Actions Preview payload. ${t.expectedItems} items are references \`coverage:visual\` expects that add no new cell. ${t.maintainerItems} more show a real workspace file and need the maintainer's \`capture.local.json\` substitute: ${plan.maintainer.map((i) => `\`${i.name}\``).join(", ") || "none"}. ${t.cellsWithoutFixture} cells need a new fixture first and ${t.cellsUnplanned} aren't reached by any capture kind yet (below). Every item, with its fixture path, is in \`capture-plan.json\`; each session is split into chunks of at most ${SESSION_SIZE} (\`<session>#a01\`… automatic first, then \`#r01\`… real input), and \`chunks/<id>.json\` holds each chunk's items ready for capture.js.`,
    "",
    table(
      ["session", "items", "real input", "cells", "chunks", "first automatic", "first real input"],
      plan.sessions.map((x) => [
        x.id,
        x.automatic.length + x.realInput.length,
        x.realInput.length,
        x.cells,
        `${x.chunks.filter((c) => !c.realInput).length} automatic, ${x.chunks.filter((c) => c.realInput).length} real input`,
        firstNames(x.automatic),
        firstNames(x.realInput),
      ]),
    ),
    "",
    "### Cells no capture reaches yet",
    "",
    table(
      ["why", "cells", "components"],
      plan.unplanned.map((u) => [
        u.reason,
        u.cells,
        u.components.slice(0, 6).join(", ") +
          (u.components.length > 6 ? ` +${u.components.length - 6}` : ""),
      ]),
    ),
    "",
    "### Fixtures to write first",
    "",
    "Proposed paths and payloads are in `capture-plan.json`; nothing is written. References are captured afterwards, never written by hand.",
    "",
    table(
      ["proposed fixture", "component", "state", "cells", "references", "payload"],
      plan.proposals.map((p) => [
        `\`${p.path}\``,
        p.component,
        p.states.join(", "),
        p.cells,
        p.names.length,
        p.incomplete ? `to complete: ${p.incomplete}` : p.payload ? "proposed" : "none",
      ]),
    ),
    "",
  ];
}

/** Slack's documented limits, with what the Builder was seen to refuse or accept. */
export function limitsSection(): string[] {
  return [
    "## Payload limits and Builder refusals",
    "",
    "Block Kit Builder refuses a payload past a documented limit and keeps showing the previous one. `limits.test.ts` checks every fixture against these before it reaches a capture session.",
    "",
    table(
      ["limit", "refused by the Builder", "accepted past the limit"],
      LIMITS.map((l) => [
        `${l.rule} ([docs](https://docs.slack.dev/reference/block-kit/${l.docs}))`,
        (l.refused ?? []).map((f) => `\`${f}\``).join(", "),
        (l.accepted ?? []).map((f) => `\`${f}\``).join(", "),
      ]),
    ),
    "",
  ];
}

/** Package bugs and harness gaps noticed along the way, recorded to fix later. */
export function findingsSection(): string[] {
  return [
    "## Findings (to fix later)",
    "",
    "Noticed while gathering facts; nothing is fixed until every fact is in.",
    "",
    ...FINDINGS.flatMap((f) => [
      `### ${f.title}${f.status === "verified" ? " (verified: not a gap)" : ""}`,
      "",
      ...f.evidence.map((e) => `- ${e}`),
      ...f.suspect.map((x) => `- Suspected: ${x}`),
      `- Next: ${f.next}`,
      "",
    ]),
  ];
}

export function markdown(inventory: Inventory, list: Batch[], plan?: CapturePlan): string {
  const s = summarize(inventory);
  const capabilityCells = (cap: string) => s.uncoveredByCapability[cap] ?? 0;
  const lowest = Object.entries(s.byComponent)
    .map(([id, t]) => ({ id, ...t, tier: inventory.components.find((c) => c.id === id)!.tier }))
    .filter((c) => c.tier === 1)
    .toSorted((a, b) => a.pct - b.pct || b.total - a.total)
    .slice(0, 15);
  return [
    "# Slack fidelity inventory",
    "",
    "Generated by `bun tools/visual/src/fidelity/generate.ts`. A cell is a component × state × theme × width × fact kind; it's covered when a reference, a payload recording or an interaction test already records Slack's fact for it.",
    "",
    `**Covered: ${pct(s.total)}** of cells. Uncovered by capture method: a (existing flow) ${s.uncoveredByMethod.a ?? 0}, b (new capability) ${s.uncoveredByMethod.b ?? 0}, c (not observable in Block Kit Builder) ${s.uncoveredByMethod.c ?? 0}. ${s.needsFixture} uncovered cells need a fixture payload first. ${inventory.gaps.missingExpectedReferences} references \`coverage:visual\` expects are missing.`,
    "",
    "## By fact kind",
    "",
    table(["fact", "cells", "covered", "%"], byCount(s.byFact)),
    "",
    "## By state",
    "",
    table(["state", "cells", "covered", "%"], byCount(s.byState)),
    "",
    "## By theme and width",
    "",
    table(["axis", "cells", "covered", "%"], [...byCount(s.byTheme), ...byCount(s.byWidth)]),
    "",
    "## By kind",
    "",
    table(["kind", "cells", "covered", "%"], byCount(s.byKind)),
    "",
    "## Least covered of the most-used components",
    "",
    table(
      ["component", "cells", "covered", "%"],
      lowest.map((c) => [c.id, c.total, c.covered, `${c.pct}%`]),
    ),
    "",
    "## Gaps",
    "",
    `- Documented by Slack (or in Block Kit Builder's catalog), not implemented: ${inventory.gaps.notImplemented.map((x) => `\`${x}\``).join(", ") || "none"}`,
    `- Implemented, in no fixture: ${inventory.gaps.noFixture.map((x) => `\`${x}\``).join(", ") || "none"}`,
    "",
    "## Capture batches",
    "",
    "Uncovered cells grouped into work one Block Kit Builder session can do (same capability, surface and theme; capture.js switches the width per item). Batches on existing fixtures come first, then those that wait on new fixture payloads, each most valuable first.",
    "",
    table(
      ["#", "method", "capability", "fixtures", "surface", "theme", "cells", "components"],
      list.map((b, i) => [
        i + 1,
        b.method,
        b.capability,
        b.newFixtures ? "new" : "existing",
        b.surface,
        b.theme,
        b.cells,
        b.components.slice(0, 8).join(", ") +
          (b.components.length > 8 ? ` +${b.components.length - 8}` : ""),
      ]),
    ),
    "",
    ...(plan ? planSection(plan) : []),
    ...limitsSection(),
    ...findingsSection(),
    "## Capture extensions",
    "",
    ...EXTENSIONS.flatMap((e) => [
      `### ${e.title} (\`${e.capability}\`, ${capabilityCells(e.capability)} uncovered cells)`,
      "",
      ...e.design.map((d) => `- ${d}`),
      "",
    ]),
    ...stylesheetSection(inventory),
    "## Components",
    "",
    table(
      ["component", "kind", "source", "tier", "implemented", "fixtures", "covered"],
      inventory.components.map((c) => [
        c.docs ? `[${c.id}](${c.docs})` : c.id,
        c.kind,
        c.source,
        c.tier,
        c.implemented ? "yes" : "**no**",
        c.fixtures.length,
        s.byComponent[c.id] ? pct(s.byComponent[c.id]!) : "no cells",
      ]),
    ),
    "",
  ].join("\n");
}

if (import.meta.main) {
  const discovery = discoveryPath(process.argv.slice(2));
  const sources = await readSources(discovery ? resolve(discovery) : undefined);
  const inventory = buildInventory(COMPONENTS, sources);
  const list = batches(inventory, COMPONENTS);
  const summary = summarize(inventory);
  const plan = capturePlan(
    inventory,
    COMPONENTS,
    sources.payloads,
    new Set(sources.references.keys()),
    await readProbes(),
    new Set(sources.behaviour?.keys() ?? []),
  );
  const out = resolve(ROOT, "test-results/fidelity");
  await mkdir(out, { recursive: true });
  await writeFile(join(out, "capture-plan.json"), JSON.stringify(plan, null, 2));
  // Every chunk ready for capture.js, one file each.
  const probeSpecs = await readProbes();
  await rm(join(out, "chunks"), { recursive: true, force: true });
  await mkdir(join(out, "chunks"), { recursive: true });
  for (const session of plan.sessions)
    for (const c of session.chunks)
      await writeFile(
        join(out, "chunks", `${c.id}.json`),
        JSON.stringify(
          { id: c.id, items: chunkItems(plan, c.id, sources.payloads, probeSpecs) },
          null,
          2,
        ),
      );
  await writeFile(
    join(out, "verify-plan.json"),
    JSON.stringify(
      { id: "verify", items: verifyPlan(sources.payloads, await readProbes()) },
      null,
      2,
    ),
  );
  await writeFile(
    join(out, "inventory.json"),
    JSON.stringify(
      {
        summary,
        gaps: inventory.gaps,
        stylesheet: inventory.stylesheet,
        batches: list,
        extensions: EXTENSIONS,
        findings: FINDINGS,
        limits: LIMITS.map(({ check: _, ...l }) => l),
        components: inventory.components,
        cells: inventory.cells,
      },
      null,
      2,
    ),
  );
  await writeFile(join(out, "inventory.md"), markdown(inventory, list, plan));
  console.log(
    [
      `Cells covered: ${pct(summary.total)}`,
      ...Object.entries(summary.byFact).map(([k, t]) => `  ${k}: ${pct(t)}`),
      `Uncovered by method: ${JSON.stringify(summary.uncoveredByMethod)} (${summary.notApplicable} not applicable)`,
      `Capture plan: ${JSON.stringify(plan.totals)}`,
      `Not implemented: ${inventory.gaps.notImplemented.join(", ")}`,
      `In no fixture: ${inventory.gaps.noFixture.join(", ")}`,
      `Wrote ${join(out, "inventory.md")} and inventory.json`,
    ].join("\n"),
  );
}
