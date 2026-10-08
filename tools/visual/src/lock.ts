/**
 * fixtures/references.lock.json ties every reference snapshot to the payload it was captured from.
 * import.ts records an entry when a snapshot arrives from Block Kit Builder and renormalize.ts when
 * a normalize rule rewrites one; verify() then tells a snapshot that still shows its payload apart
 * from one whose payload changed since (stale) or whose HTML was edited by hand.
 */
import { join, resolve } from "node:path";
import { Glob } from "bun";
import { isReferenceName } from "./names";
import { leaks } from "./redact";
import { fixtureSentences, foreignText, missingText } from "./stale";

export const FIXTURES = resolve(import.meta.dir, "../../../fixtures");
export const LOCK = join(FIXTURES, "references.lock.json");

export interface LockEntry {
  /** sha256 of the payload's content, see hashPayload(). */
  payload: string;
  /** sha256 of the committed reference HTML. */
  reference: string;
  /** Day the snapshot was captured in Block Kit Builder, YYYY-MM-DD. */
  captured: string;
}

export type Lock = Record<string, LockEntry>;

export function sha256(text: string): string {
  return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Hashes what a payload says, not how it's formatted, so reformatting a fixture keeps it fresh. */
export function hashPayload(payload: unknown): string {
  return sha256(canonical(payload));
}

/** `<fixture>@<state>` references are captured from their fixture's payload. */
export function payloadName(reference: string): string {
  return reference.split("@")[0] ?? reference;
}

/**
 * Whether a JSON file under fixtures/ (its path relative to it) is a fixture payload. Files at the
 * top of fixtures/ are bookkeeping (the lock and the baselines), and `<fixture>@<interaction>.actions.json`
 * files are payloads recorded in Block Kit Builder's Actions Preview, not blocks to render.
 */
export function isFixturePayload(path: string): boolean {
  return path.includes("/") && path.endsWith(".json") && !path.endsWith(".actions.json");
}

/** Fixture payloads by name; JSON files at the top of fixtures/ are bookkeeping, not fixtures. */
export async function readPayloads(): Promise<Map<string, unknown>> {
  const payloads = new Map<string, unknown>();
  for await (const path of new Glob("*/**/*.json").scan(FIXTURES)) {
    if (!isFixturePayload(path)) continue;
    payloads.set(path.replace(/\.json$/, ""), await Bun.file(join(FIXTURES, path)).json());
  }
  return payloads;
}

export async function readReferences(): Promise<Map<string, string>> {
  const references = new Map<string, string>();
  for await (const path of new Glob("**/*.reference.html").scan(FIXTURES)) {
    references.set(
      path.replace(/\.reference\.html$/, ""),
      await Bun.file(join(FIXTURES, path)).text(),
    );
  }
  return references;
}

export async function readLock(): Promise<Lock> {
  const file = Bun.file(LOCK);
  return (await file.exists()) ? ((await file.json()) as Lock) : {};
}

export async function writeLock(lock: Lock): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  await Bun.write(LOCK, `${JSON.stringify(sorted, null, 2)}\n`);
}

export interface Problem {
  name: string;
  message: string;
}

export interface Verification {
  problems: Problem[];
  /** Fixtures nobody has captured yet; reported, since a fixture may predate its reference. */
  uncaptured: string[];
}

export function verify(
  lock: Lock,
  references: Map<string, string>,
  payloads: Map<string, unknown>,
): Verification {
  const problems: Problem[] = [];
  const sentences = fixtureSentences(payloads.values());
  for (const [name, html] of references) {
    if (!isReferenceName(name)) {
      problems.push({
        name,
        message: "not a valid reference name; see names.ts (e.g. <fixture>@open+mobile+dark)",
      });
      continue;
    }
    const entry = lock[name];
    const payload = payloads.get(payloadName(name));
    if (payload === undefined) {
      problems.push({ name, message: `no fixture ${payloadName(name)}.json to compare it with` });
    } else if (!entry) {
      problems.push({ name, message: "not in references.lock.json; import it with import.ts" });
    } else if (entry.reference !== sha256(html)) {
      problems.push({
        name,
        message:
          "reference HTML differs from the captured snapshot; edit it through a normalize rule",
      });
    } else if (leaks(html).length > 0) {
      problems.push({
        name,
        message: `shows the Builder workspace: ${leaks(html).join(", ")}; re-import it so redact.ts replaces them`,
      });
    } else if (foreignText(html, sentences).length > 0) {
      problems.push({
        name,
        message: `shows another fixture ("${foreignText(html, sentences)[0]}"): the Builder refused this payload and kept the previous one; recapture it or leave the fixture out`,
      });
    } else if (missingText(html).length > 0) {
      problems.push({
        name,
        message: `shows none of its own text ("${missingText(html)[0]}"): the Builder refused this payload and kept the previous one; recapture it or leave the fixture out`,
      });
    } else if (entry.payload !== hashPayload(payload)) {
      problems.push({
        name,
        message: `payload changed since the ${entry.captured} capture; recapture it in Block Kit Builder`,
      });
    }
  }
  for (const name of Object.keys(lock)) {
    if (!references.has(name)) {
      problems.push({ name, message: "in references.lock.json without a reference snapshot" });
    }
  }
  const captured = new Set([...references.keys()].map(payloadName));
  const uncaptured = [...payloads.keys()].filter((name) => !captured.has(name));
  problems.sort((a, b) => a.name.localeCompare(b.name));
  return { problems, uncaptured: uncaptured.sort() };
}
