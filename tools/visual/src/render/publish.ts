/**
 * Publishes a pull request's render diff: checks the artifact its run uploaded, copies the renders
 * the comment shows to R2 (served at cdn.block-kit.dev) and writes the comment's Markdown. When no
 * render changed or failed, it writes no comment file: the workflow then leaves the pull request
 * alone.
 *
 *   bun tools/visual/src/render/publish.ts --artifact=<dir> --pr=<number> --sha=<commit>
 *     --run-url=<url> --body=<file>
 *
 * Runs with main's code in the visual-preview workflow; the artifact comes from a pull request, so
 * nothing in it is trusted until readArtifact accepted it. R2 credentials come from
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and CLOUDFLARE_ACCOUNT_ID.
 */
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Manifest } from "./render-diff";

export const MAX_SHOWN = 40;
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 1000;
const MARKER = "<!-- visual-diff -->";
const FIXTURE = /^[a-z0-9-]+(\.[a-z0-9-]+)*(\/[a-z0-9-]+(\.[a-z0-9-]+)*)*$/;
const RENDER = /^(.+)\.(light|dark)\.(before|after|diff)\.png$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type ArtifactFile = { path: string; bytes: Uint8Array };

/** Accepts an artifact only if every file is a render the manifest can point to, and nothing else. */
export function readArtifact(
  files: ArtifactFile[],
): { ok: true; manifest: Manifest } | { ok: false; problems: string[] } {
  if (files.length > MAX_FILES) return { ok: false, problems: [`more than ${MAX_FILES} files`] };
  const problems: string[] = [];
  const seen = new Set<string>();
  let manifest: Manifest | undefined;
  for (const { path, bytes } of files) {
    if (path === "manifest.json") {
      manifest = parseManifest(bytes);
      if (!manifest) problems.push("manifest.json is malformed");
      continue;
    }
    seen.add(path);
    const match = RENDER.exec(path);
    if (!match || !FIXTURE.test(match[1] ?? "")) problems.push(`${path} is not a render`);
    else if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) problems.push(`${path} is not a PNG`);
    else if (bytes.length > MAX_BYTES) problems.push(`${path} is larger than 5 MB`);
  }
  if (!manifest)
    return { ok: false, problems: problems.length ? problems : ["manifest.json is missing"] };
  for (const change of manifest.changed) {
    for (const file of renderFiles(change)) {
      if (!seen.has(file)) problems.push(`${file} is missing`);
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, manifest };
}

function isRender(r: { fixture?: unknown; theme?: unknown }): boolean {
  return (
    typeof r?.fixture === "string" &&
    FIXTURE.test(r.fixture) &&
    (r.theme === "light" || r.theme === "dark")
  );
}

function parseManifest(bytes: Uint8Array): Manifest | undefined {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
  const m = value as Manifest;
  const valid =
    Number.isInteger(m?.rendered) &&
    Array.isArray(m.changed) &&
    m.changed.every((c) => isRender(c) && Number.isInteger(c.changedPixels)) &&
    Array.isArray(m.failed) &&
    m.failed.every((f) => isRender(f) && typeof f.error === "string");
  return valid ? m : undefined;
}

function renderFiles({ fixture, theme }: Manifest["changed"][number]): string[] {
  return (["before", "after", "diff"] as const).map((kind) => `${fixture}.${theme}.${kind}.png`);
}

/** The renders a comment shows, and so the only ones worth uploading. */
export function shownFiles(manifest: Manifest): string[] {
  return manifest.changed.slice(0, MAX_SHOWN).flatMap(renderFiles);
}

/** The pull request comment, or nothing when no render changed or failed. */
export function commentBody(
  manifest: Manifest,
  { imageBase, sha, runUrl }: { imageBase: string; sha: string; runUrl: string },
): string | undefined {
  if (manifest.changed.length === 0 && manifest.failed.length === 0) return undefined;
  const lines = [MARKER, "### Visual changes", ""];
  if (manifest.changed.length > 0) {
    lines.push(
      `${manifest.changed.length} of ${manifest.rendered} renders changed at ${sha}, compared with the base branch.`,
      "",
      "| Fixture | Before | After | Changes |",
      "| --- | --- | --- | --- |",
    );
    for (const change of manifest.changed.slice(0, MAX_SHOWN)) {
      const [before, after, diff] = renderFiles(change).map((f) => `${imageBase}/${f}`);
      lines.push(
        `| \`${change.fixture}\` ${change.theme}<br>${change.changedPixels.toLocaleString("en-US")} px ` +
          `| ![before](${before}) | ![after](${after}) | ![changes](${diff}) |`,
      );
    }
    const hidden = manifest.changed.length - MAX_SHOWN;
    if (hidden > 0) lines.push("", `…and ${hidden} more in [the run](${runUrl}).`);
  }
  if (manifest.failed.length) {
    lines.push("", "Failed to render:", "");
    for (const f of manifest.failed) {
      // The error text comes from the pull request's run: keep it to plain characters.
      const error = f.error.replace(/[^\w .,:'"/-]/g, "").slice(0, 200);
      lines.push(`- \`${f.fixture}\` ${f.theme}: ${error}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function readDir(dir: string): Promise<ArtifactFile[]> {
  const files: ArtifactFile[] = [];
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`${entry.name} is a symlink`);
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push({
      path: relative(dir, path),
      bytes: new Uint8Array(await Bun.file(path).arrayBuffer()),
    });
  }
  return files;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = (name: string) => {
    const value = args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    if (!value) throw new Error(`--${name} is required`);
    return value;
  };
  const pr = option("pr");
  const sha = option("sha");
  if (!/^\d+$/.test(pr) || !/^[0-9a-f]{7,40}$/.test(sha)) throw new Error("Invalid --pr or --sha");

  const artifact = await readDir(option("artifact"));
  const result = readArtifact(artifact);
  if (!result.ok) {
    console.error(`Refusing the artifact:\n  ${result.problems.join("\n  ")}`);
    process.exit(1);
  }
  const prefix = `pr-${pr}/${sha}`;
  const body = commentBody(result.manifest, {
    imageBase: `https://cdn.block-kit.dev/${prefix}`,
    sha,
    runUrl: option("run-url"),
  });
  if (!body) {
    console.log("No visual changes; no comment.");
    process.exit(0);
  }
  const s3 = new Bun.S3Client({
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    endpoint: `https://${env("CLOUDFLARE_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    bucket: "block-kit-visual",
  });
  const files = new Map(artifact.map((f) => [f.path, f.bytes]));
  for (const file of shownFiles(result.manifest)) {
    await s3.write(`${prefix}/${file}`, files.get(file) as Uint8Array, { type: "image/png" });
  }
  await Bun.write(option("body"), body);
  console.log(`Uploaded ${shownFiles(result.manifest).length} files to ${prefix}`);
}
