/**
 * Checks every reference snapshot against fixtures/references.lock.json (see lock.ts):
 *
 *   bun tools/visual/src/references.ts [--check]
 *
 * --check exits non-zero when a reference is stale, edited by hand, or untracked, or when a fixture,
 * doc, site or playground source or package test shows an image that isn't one of our samples on
 * cdn.block-kit.dev with a committed copy (samples.ts).
 */
import { readLock, readPayloads, readReferences, verify } from "./lock";
import { checkSampleImages, readSampleSources } from "./samples";

const check = process.argv.includes("--check");
const [lock, references, payloads, sources] = await Promise.all([
  readLock(),
  readReferences(),
  readPayloads(),
  readSampleSources(),
]);
const { problems, uncaptured } = verify(lock, references, payloads);

console.log(`${references.size} reference snapshots, ${payloads.size} fixtures`);
if (uncaptured.length > 0) {
  console.log(`\nNot captured in Block Kit Builder yet:\n  ${uncaptured.join("\n  ")}`);
}
if (problems.length > 0) {
  console.error(
    `\nReferences that no longer show Slack's rendering of their fixture:\n  ${problems
      .map((p) => `${p.name}: ${p.message}`)
      .join("\n  ")}`,
  );
  console.error("\nOnly maintainers recapture references; see tools/visual/README.md.");
} else {
  console.log("\nEvery reference matches its fixture.");
}

const images = checkSampleImages(sources);
if (images.length > 0) {
  console.error(
    `\nImages that aren't samples on cdn.block-kit.dev:\n  ${images
      .map((p) => `${p.file}: ${p.url} ${p.message}`)
      .join("\n  ")}`,
  );
  console.error("\nfixtures/assets/samples/CREDITS.md explains how to add one.");
} else {
  console.log(`Every image in ${sources.size} sources is a committed sample or a placeholder.`);
}

if (check && (problems.length > 0 || images.length > 0)) process.exit(1);
