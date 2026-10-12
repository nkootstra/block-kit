import { readPayloads } from "./src/lock";
import { readFileSync } from "node:fs";
const [session, ...only] = process.argv.slice(2);
const plan = JSON.parse(readFileSync("../../test-results/fidelity/capture-plan.json", "utf8"));
const payloads = new Map(await readPayloads());
let items: { name: string; fixture: string; interaction?: string }[];
if (session === "names") items = only.map((name) => ({ name, fixture: name.split(/[@+]/)[0] }));
else
  items = plan.sessions
    .find((s: any) => s.id === session)
    .items.filter((i: any) => !i.interaction || only.includes("--with-clicks"));
const out = items.map((i) => {
  const json = payloads.get(i.fixture);
  if (!json) throw new Error("no payload " + i.fixture);
  return { name: i.name, payload: Array.isArray(json) ? { blocks: json } : json };
});
process.stdout.write(
  JSON.stringify({
    snap: readFileSync("src/snapshot.js", "utf8"),
    capture: readFileSync("src/capture.js", "utf8"),
    items: out,
  }),
);
