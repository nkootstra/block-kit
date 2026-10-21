/**
 * Lists the committed references that no longer match what today's Block Kit Builder renders.
 * Reads a capture file like import.ts (the file capture.js downloaded, or JSON from stdin),
 * normalizes and redacts each reference the same way (captured.ts), and compares it with the one
 * in fixtures/, writing nothing there:
 *
 *   bun tools/visual/src/drift.ts ~/Downloads/block-kit-refs-<session>.json [--prefix=catalog/]
 *     [--report=drift.md] [--exit-zero]
 *
 * Each captured reference is `unchanged`, `drifted` (the Builder renders it differently now: recapture
 * it with import.ts), `new` (nothing committed yet), or captured from another payload than the one
 * the lock records, which is a fixture change rather than Builder drift. Committed references under
 * `--prefix` (all of them without one) that the capture left out are listed too. Exits 1 when
 * anything drifted or was captured from another payload, unless `--exit-zero`. `--report` writes the
 * list as Markdown for an issue. The summaries come from the normalized, redacted HTML, so they
 * show nothing import.ts wouldn't commit.
 */
import { type Skipped, prepareReferences, readCaptureFile } from "./captured";
import { hashPayload, type Lock, readLock, readPayloads, readReferences } from "./lock";
import type { CaptureFile } from "./recordings";
import { readRedactions } from "./redact";

export interface Drifted {
  name: string;
  /** Day the committed reference was captured. */
  captured: string;
  /** What differs, most telling first. */
  changes: string[];
}

export interface PayloadChanged {
  name: string;
  captured: string;
}

export interface DriftReport {
  unchanged: string[];
  drifted: Drifted[];
  payloadChanged: PayloadChanged[];
  new: string[];
  skipped: Skipped[];
  notCaptured: string[];
}

const META = /<script type="application\/json" id="sbk-reference-meta">([\s\S]*?)<\/script>/;

function meta(html: string): Record<string, unknown> | undefined {
  const json = META.exec(html)?.[1];
  if (json === undefined) return undefined;
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** The snapshot without the moment it was taken, which differs on every capture. */
function comparable(html: string): string {
  return html.replace(META, (script) => script.replace(/"capturedAt":"[^"]*",?/, ""));
}

/** Whether the snapshot shows the payload `hash` records; capture.js wraps a bare block array. */
function capturedFrom(html: string, hash: string): boolean | undefined {
  const payload = meta(html)?.payload;
  if (payload === undefined) return undefined;
  const candidates: unknown[] = [payload];
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const keys = Object.keys(payload);
    if (keys.length === 1 && keys[0] === "blocks")
      candidates.push((payload as { blocks: unknown }).blocks);
  }
  return candidates.some((c) => hashPayload(c) === hash);
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function compareCapture(options: {
  capture: CaptureFile;
  lock: Lock;
  references: Map<string, string>;
  payloads: Map<string, unknown>;
  redactions: Record<string, string>;
  prefixes?: string[];
}): DriftReport {
  const { capture, lock, references, payloads, redactions, prefixes = [] } = options;
  const { prepared, skipped } = prepareReferences(capture.references, payloads, redactions);
  const report: DriftReport = {
    unchanged: [],
    drifted: [],
    payloadChanged: [],
    new: [],
    skipped,
    notCaptured: [],
  };
  for (const { name, normalized, payload } of prepared) {
    const committed = references.get(name);
    if (committed === undefined) {
      report.new.push(name);
      continue;
    }
    const entry = lock[name];
    const captured = entry?.captured ?? "unknown";
    if (capturedFrom(normalized, entry?.payload ?? hashPayload(payload)) === false) {
      report.payloadChanged.push({ name, captured });
    } else if (comparable(normalized) === comparable(committed)) {
      report.unchanged.push(name);
    } else {
      report.drifted.push({ name, captured, changes: describeChanges(committed, normalized) });
    }
  }
  const seen = new Set(Object.keys(capture.references));
  const wanted = (name: string) =>
    prefixes.length === 0 || prefixes.some((prefix) => name.startsWith(prefix));
  return {
    ...report,
    unchanged: report.unchanged.toSorted(),
    drifted: report.drifted.toSorted(byName),
    payloadChanged: report.payloadChanged.toSorted(byName),
    new: report.new.toSorted(),
    notCaptured: [...references.keys()].filter((n) => wanted(n) && !seen.has(n)).toSorted(),
  };
}

/** Elements (by their opening tag) and non-blank text, the meta script left out. */
function nodes(html: string): string[] {
  const tokens = html.replace(META, "").match(/<[^>]*>|[^<]+/g) ?? [];
  return tokens.filter((t) => (t.startsWith("<") ? !/^<[/!]/.test(t) : t.trim() !== ""));
}

const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function attributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const [, key, value] of tag.matchAll(/\s([\w:-]+)(?:="([^"]*)")?/g)) {
    attrs.set(key!, value ?? "");
  }
  return attrs;
}

function tagName(tag: string): string {
  return /^<([\w-]+)/.exec(tag)?.[1]?.toLowerCase() ?? "?";
}

/** `<div.p-block>`: the tag and its first class, or its data-qa. */
function label(tag: string): string {
  const attrs = attributes(tag);
  const cls = attrs.get("class")?.split(/\s+/)[0];
  const qa = attrs.get("data-qa");
  return `<${tagName(tag)}${cls ? `.${cls}` : qa ? `[data-qa=${qa}]` : ""}>`;
}

function declarations(style: string): Map<string, string> {
  const decls = new Map<string, string>();
  for (const part of style.split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) decls.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
  }
  return decls;
}

function changedKeys(a: Map<string, string>, b: Map<string, string>): string[] {
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k));
}

const show = (node: string | undefined) =>
  node === undefined
    ? "(nothing)"
    : node.startsWith("<")
      ? label(node)
      : JSON.stringify(clip(node.trim()));

function describeNode(before: string | undefined, after: string | undefined): string {
  if (before?.startsWith("<") && after?.startsWith("<") && tagName(before) === tagName(after)) {
    const a = attributes(before);
    const b = attributes(after);
    const parts: string[] = [];
    for (const key of changedKeys(a, b)) {
      if (key === "style") {
        const sa = declarations(a.get(key) ?? "");
        const sb = declarations(b.get(key) ?? "");
        for (const prop of changedKeys(sa, sb).slice(0, 2)) {
          parts.push(
            `style ${prop}: ${clip(sa.get(prop) ?? "(none)")} -> ${clip(sb.get(prop) ?? "(none)")}`,
          );
        }
      } else {
        parts.push(
          `${key} ${JSON.stringify(clip(a.get(key) ?? ""))} -> ${JSON.stringify(clip(b.get(key) ?? ""))}`,
        );
      }
      if (parts.length >= 2) break;
    }
    return `${label(before)} ${parts.join(", ")}`;
  }
  if (
    before !== undefined &&
    after !== undefined &&
    !before.startsWith("<") &&
    !after.startsWith("<")
  ) {
    return `text ${show(before)} -> ${show(after)}`;
  }
  return `${show(before)} -> ${show(after)}`;
}

/**
 * A short account of how two normalized references differ: how many nodes between the first and
 * the last difference, the first one, and which measurements in the meta script changed.
 */
export function describeChanges(before: string, after: string): string[] {
  const a = nodes(before);
  const b = nodes(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (
    end < a.length - start &&
    end < b.length - start &&
    a[a.length - 1 - end] === b[b.length - 1 - end]
  )
    end++;
  const changes: string[] = [];
  const changed = Math.max(a.length, b.length) - start - end;
  if (changed > 0) {
    changes.push(`${changed} of ${b.length} nodes differ`);
    changes.push(describeNode(a[start], b[start]));
  }
  const ma = meta(before) ?? {};
  const mb = meta(after) ?? {};
  const keys = [...new Set([...Object.keys(ma), ...Object.keys(mb)])]
    .filter((k) => k !== "capturedAt" && JSON.stringify(ma[k]) !== JSON.stringify(mb[k]))
    .toSorted();
  if (keys.length > 0) changes.push(`meta: ${keys.join(", ")}`);
  if (changes.length === 0) changes.push("markup differs");
  return changes;
}

function summary(report: DriftReport): string {
  return [
    `${report.unchanged.length} unchanged`,
    `${report.drifted.length} drifted`,
    `${report.payloadChanged.length} captured from another payload`,
    `${report.new.length} new`,
    `${report.skipped.length} skipped`,
    `${report.notCaptured.length} not captured`,
  ].join(", ");
}

export function formatText(report: DriftReport): string {
  const lines: string[] = [];
  for (const { name, captured, changes } of report.drifted) {
    lines.push(`drifted   ${name} (captured ${captured})`);
    for (const change of changes) lines.push(`          ${change}`);
  }
  for (const { name, captured } of report.payloadChanged) {
    lines.push(
      `payload   ${name}: captured from another payload than the ${captured} reference (a fixture change or an old bundle, not Builder drift)`,
    );
  }
  for (const name of report.new) lines.push(`new       ${name}`);
  for (const { message } of report.skipped)
    lines.push(`skipped   ${message.replace(/^skipping /, "")}`);
  const shown = report.notCaptured.slice(0, 20);
  for (const name of shown) lines.push(`missing   ${name}`);
  if (report.notCaptured.length > shown.length)
    lines.push(`missing   … and ${report.notCaptured.length - shown.length} more`);
  lines.push(summary(report));
  return `${lines.join("\n")}\n`;
}

/** The report as an issue body: what drifted as a checklist to recapture. */
export function formatMarkdown(report: DriftReport): string {
  const out = [`Block Kit Builder drift check: ${summary(report)}.`, ""];
  const section = (title: string, items: string[]) => {
    if (items.length === 0) return;
    out.push(`## ${title} (${items.length})`, "", ...items, "");
  };
  section(
    "Drifted: recapture with import.ts",
    report.drifted.map(
      ({ name, captured, changes }) =>
        `- [ ] \`${name}\` (captured ${captured}): ${changes.join("; ")}`,
    ),
  );
  section(
    "Captured from another payload than the lock records",
    report.payloadChanged.map(({ name, captured }) => `- \`${name}\` (captured ${captured})`),
  );
  section(
    "New: no committed reference",
    report.new.map((name) => `- \`${name}\``),
  );
  section(
    "Skipped",
    report.skipped.map(({ message }) => `- ${message}`),
  );
  if (report.notCaptured.length > 0) {
    out.push(
      `<details><summary>Not in this capture (${report.notCaptured.length})</summary>`,
      "",
      ...report.notCaptured.map((name) => `- \`${name}\``),
      "",
      "</details>",
      "",
    );
  }
  return out.join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const flag = (name: string) =>
    args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
  const source = args.find((a) => !a.startsWith("--"));
  const [capture, redactions, lock, references, payloads] = await Promise.all([
    readCaptureFile(source),
    readRedactions(),
    readLock(),
    readReferences(),
    readPayloads(),
  ]);
  const report = compareCapture({
    capture,
    lock,
    references,
    payloads,
    redactions,
    prefixes: flag("prefix"),
  });
  process.stdout.write(formatText(report));
  const file = flag("report")[0];
  if (file) await Bun.write(file, formatMarkdown(report));
  const failed = report.drifted.length + report.payloadChanged.length > 0;
  if (failed && !args.includes("--exit-zero")) process.exit(1);
}
