import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { parseReferenceName } from "./names";
import { readProbes } from "./probes";
import { OPEN_STATES, STATES, stateFor } from "./states";

const FIXTURES = join(import.meta.dir, "../../../fixtures");

describe("states", () => {
  it("uses a fixture's own replay when it has one", () => {
    expect(stateFor("catalog/agents/plan@expanded")).toBe(STATES["catalog/agents/plan@expanded"]);
  });

  it("replays the open states on any fixture, whatever theme or width it was captured at", () => {
    expect(stateFor("catalog/actions/all-selects@open")).toBe(OPEN_STATES.open);
    expect(stateFor("catalog/actions/all-selects@open+mobile+dark")).toBe(OPEN_STATES.open);
    expect(stateFor("extra/actions/more-elements@confirm+dark")).toBe(OPEN_STATES.confirm);
    expect(stateFor("catalog/section/multi-static-select@dialog")).toBe(OPEN_STATES.dialog);
  });

  it("has nothing to replay for a closed state, light or dark", () => {
    expect(stateFor("catalog/actions/button")).toBeUndefined();
    expect(stateFor("catalog/actions/button@dark")).toBeUndefined();
    expect(stateFor("catalog/actions/button@mobile")).toBeUndefined();
  });

  it("keeps a fixture's replay for its dark and mobile captures", () => {
    expect(stateFor("catalog/agents/plan@expanded+dark")).toBe(
      STATES["catalog/agents/plan@expanded"],
    );
  });

  it("can replay every committed reference that was captured after an interaction", async () => {
    // Without one, compare.ts compared the rendering at rest with the interacted reference: 83
    // references (a picked option, a hidden image, an open menu) measured nothing but the state.
    const probes = await readProbes();
    const missing: string[] = [];
    for await (const path of new Glob("**/*.reference.html").scan(FIXTURES)) {
      const name = path.replace(/\.reference\.html$/, "");
      if (parseReferenceName(name).interaction && !stateFor(name, probes)) missing.push(name);
    }
    expect(missing).toEqual([]);
  });
});
