/**
 * Checks every reference snapshot against fixtures/references.lock.json (see lock.ts):
 *
 *   bun tools/visual/src/references.ts [--check]
 *
 * --check exits non-zero when a reference is stale, edited by hand, or untracked.
 */
import { readLock, readPayloads, readReferences, verify } from "./lock";

const check = process.argv.includes("--check");
const [lock, references, payloads] = await Promise.all([
  readLock(),
  readReferences(),
  readPayloads(),
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
  if (check) process.exit(1);
} else {
  console.log("\nEvery reference matches its fixture.");
}
