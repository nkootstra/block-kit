/**
 * Reads a capture file the way import.ts writes it and drift.ts checks it: the file capture.js
 * downloaded, or JSON from stdin, with each reference normalized and redacted (normalize.ts) and
 * tied to its fixture payload. Nothing here writes to fixtures/.
 */
import { payloadName } from "./lock";
import { isReferenceName } from "./names";
import { normalize } from "./normalize";
import { type CaptureFile, parseCaptureFile } from "./recordings";

/** The capture file at `source`, or the one piped to stdin. */
export async function readCaptureFile(source?: string): Promise<CaptureFile> {
  return parseCaptureFile(
    JSON.parse(source ? await Bun.file(source).text() : await Bun.stdin.text()),
  );
}

export interface CapturedReference {
  name: string;
  /** The snapshot after normalize.ts, as import.ts writes it. */
  normalized: string;
  /** The fixture payload it belongs to. */
  payload: unknown;
}

export interface Skipped {
  name: string;
  message: string;
}

/** The captured references import.ts would write, in capture order, and the ones it would skip. */
export function prepareReferences(
  references: Record<string, string>,
  payloads: Map<string, unknown>,
  redactions: Record<string, string>,
): { prepared: CapturedReference[]; skipped: Skipped[] } {
  const prepared: CapturedReference[] = [];
  const skipped: Skipped[] = [];
  for (const [name, html] of Object.entries(references)) {
    if (!isReferenceName(name)) {
      skipped.push({ name, message: `skipping invalid name ${JSON.stringify(name)}` });
      continue;
    }
    const payload = payloads.get(payloadName(name));
    if (payload === undefined) {
      skipped.push({ name, message: `skipping ${name}: no fixture ${payloadName(name)}.json` });
      continue;
    }
    prepared.push({ name, normalized: normalize(html, redactions), payload });
  }
  return { prepared, skipped };
}
