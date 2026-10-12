/**
 * What a capture run records besides references, and how it reaches git without the Builder's
 * workspace:
 *
 * - `<fixture>@<interaction>.actions.json`: the payload Actions Preview showed for an interaction
 *   (`block_actions`, `view_submission`, `view_closed`), compared by the package's
 *   actionPayloads.test.tsx.
 * - `<fixture>@<probe>.behaviour.json`: a behaviour probe's steps and what Slack did after each
 *   (probes.ts).
 *
 * capture.js saves a run as `{ references, actions, behaviour }` (a file from an older run is the
 * references alone, `{ name: html }`); import.ts writes each part. Payloads are redacted to the
 * placeholders tools/visual/README.md lists ("Action payloads"), Slack IDs the fixture doesn't use
 * become short placeholders, and a recording that still shows the workspace isn't written.
 */
import { join } from "node:path";
import { Glob } from "bun";
import { payloadName } from "./lock";
import { isReferenceName, parseReferenceName } from "./names";
import { type Behaviour, parseProbe } from "./probes";
import { leaks, SLACK_ID } from "./redact";

export interface CaptureFile {
  references: Record<string, string>;
  actions: Record<string, unknown>;
  behaviour: Record<string, Behaviour>;
}

/** Reads a capture file: the envelope capture.js saves, or the references alone. */
export function parseCaptureFile(value: unknown): CaptureFile {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("a capture file is a JSON object");
  const v = value as Record<string, unknown>;
  const envelope = ["references", "actions", "behaviour"].some((k) => k in v);
  if (!envelope) return { references: v as Record<string, string>, actions: {}, behaviour: {} };
  return {
    references: (v.references ?? {}) as Record<string, string>,
    actions: (v.actions ?? {}) as Record<string, unknown>,
    behaviour: (v.behaviour ?? {}) as Record<string, Behaviour>,
  };
}

/** A recording is named `<fixture>@<interaction>`, in no theme or width. */
export function isRecordingName(name: string): boolean {
  const parsed = parseReferenceName(name);
  return (
    isReferenceName(name) &&
    !!parsed.interaction &&
    !parsed.mobile &&
    !parsed.full &&
    parsed.theme === "light"
  );
}

const IDENTITY = {
  user: { id: "U00000000", username: "user", name: "user", team_id: "T00000000" },
  team: { id: "T00000000", domain: "workspace" },
  channel: { id: "C00000000", name: "channel" },
  enterprise: { id: "E00000000", name: "enterprise" },
} as const;

/** Fields that identify the app, the install or the moment, replaced by `"<field name>"`. */
const OPAQUE = new Set([
  "api_app_id",
  "app_id",
  "bot_id",
  "token",
  "trigger_id",
  "response_url",
  "action_ts",
  "message_ts",
  "ts",
  "thread_ts",
  "hash",
  "view_id",
  "root_view_id",
  "previous_view_id",
  "external_id",
  "app_installed_team_id",
]);

/** Every `block_id` a payload sets: anything else in a recording is one Slack generated. */
function blockIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) blockIds(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (k === "block_id" && typeof v === "string") out.add(v);
      else blockIds(v, out);
    }
  return out;
}

export interface Redactor {
  payload(value: unknown): unknown;
  text(value: string): string;
}

/**
 * Redacts recordings of one fixture: identity to fixed placeholders, opaque fields to
 * `"<field>"`, block ids Slack generated to `"<block_id>"` (`"<block_id_2>"`, … for more),
 * Slack IDs the fixture doesn't use to short placeholders (as redact.ts does in references), and
 * the names in `mapping` (tools/visual/redact.local.json).
 */
export function redactor(fixture: unknown, mapping: Record<string, string> = {}): Redactor {
  const own = blockIds(fixture);
  const ownIds = new Set(JSON.stringify(fixture ?? null).match(SLACK_ID) ?? []);
  const generated = new Map<string, string>();
  const ids = new Map<string, string>();
  const counters: Record<string, number> = {};
  const blockId = (id: string) => {
    if (own.has(id) || /^<block_id(_\d+)?>$/.test(id)) return id;
    if (!generated.has(id))
      generated.set(id, generated.size === 0 ? "<block_id>" : `<block_id_${generated.size + 1}>`);
    return generated.get(id)!;
  };
  const text = (value: string) => {
    let out = value;
    for (const [real, placeholder] of Object.entries(mapping))
      out = out.replaceAll(real, placeholder);
    return out.replace(SLACK_ID, (id) => {
      if (ownIds.has(id)) return id;
      if (!ids.has(id)) {
        const kind = id.charAt(0);
        const n = (counters[kind] = (counters[kind] ?? 0) + 1);
        ids.set(id, `${kind}0${String(n).padStart(6, "0")}`);
      }
      return ids.get(id)!;
    });
  };
  const walk = (value: unknown, key?: string, parent?: string): unknown => {
    if (key && key in IDENTITY && value && typeof value === "object" && !Array.isArray(value))
      return { ...IDENTITY[key as keyof typeof IDENTITY] };
    if (typeof value === "string") {
      if (key && OPAQUE.has(key)) return `<${key}>`;
      if (key === "id" && parent === "view") return "<view_id>";
      if (key === "team_id" || key === "app_installed_team_id") return "T00000000";
      if (key === "user_id") return "U00000000";
      if (key === "channel_id") return "C00000000";
      if (key === "block_id") return blockId(value);
      return text(value);
    }
    if (Array.isArray(value)) return value.map((v) => walk(v, undefined, parent));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        // state.values is keyed by block id.
        const name = key === "values" && parent === "state" ? blockId(k) : k;
        out[name] = walk(v, k, key);
      }
      return out;
    }
    return value;
  };
  return { payload: (value) => walk(value), text };
}

/** A behaviour recording with its texts and payloads redacted. */
export function redactBehaviour(recording: Behaviour, redact: Redactor): Behaviour {
  const texts = (value: unknown): unknown =>
    typeof value === "string"
      ? redact.text(value)
      : Array.isArray(value)
        ? value.map(texts)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [redact.text(k), texts(v)]))
          : value;
  return {
    ...recording,
    observations: recording.observations.map(({ action, ...rest }) => ({
      ...(texts(rest) as Omit<typeof rest, "action">),
      ...(action !== undefined && { action: action === null ? null : redact.payload(action) }),
    })),
  };
}

/** The workspace a recording still shows, for the fixture's own IDs. */
export function recordingLeaks(json: string, fixture: unknown): string[] {
  return leaks(json, new Set(JSON.stringify(fixture ?? null).match(SLACK_ID) ?? []));
}

/** The last payload a behaviour recording saw, if any: the probe's interaction payload. */
export function lastAction(recording: Behaviour): unknown {
  return recording.observations.findLast((o) => o.action)?.action;
}

/**
 * What references:check finds wrong with the recordings and probes next to the fixtures: a name
 * that isn't `<fixture>@<interaction>`, a missing fixture, a probe that doesn't parse, or a
 * recording that shows the Builder's workspace.
 */
export async function checkRecordings(
  root: string,
  payloads: Map<string, unknown>,
): Promise<{ name: string; message: string }[]> {
  const problems: { name: string; message: string }[] = [];
  for await (const path of new Glob("**/*.{actions,behaviour,probe}.json").scan(root)) {
    const [, name = "", kind = ""] = /^(.*)\.(actions|behaviour|probe)\.json$/.exec(path) ?? [];
    const label = `${name} (${kind})`;
    if (!isRecordingName(name)) {
      problems.push({ name: label, message: "not named <fixture>@<interaction>" });
      continue;
    }
    const fixture = payloads.get(payloadName(name));
    if (fixture === undefined) {
      problems.push({ name: label, message: `no fixture ${payloadName(name)}.json` });
      continue;
    }
    const text = await Bun.file(join(root, path)).text();
    if (kind === "probe") {
      try {
        parseProbe(JSON.parse(text));
      } catch (err) {
        problems.push({ name: label, message: (err as Error).message });
      }
      continue;
    }
    const leaked = recordingLeaks(text, fixture);
    if (leaked.length > 0)
      problems.push({
        name: label,
        message: `shows the Builder workspace: ${leaked.join(", ")}; re-import it so recordings.ts redacts it`,
      });
  }
  return problems.sort((a, b) => a.name.localeCompare(b.name));
}
