import { describe, expect, it } from "bun:test";
import { OPEN_STATES, STATES, stateFor } from "./states";

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
});
