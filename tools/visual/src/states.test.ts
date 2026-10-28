import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";
import { parseReferenceName } from "./names";
import { readProbes, type Step } from "./probes";
import { calendarDayName, OPEN_STATES, STATES, stateFor } from "./states";

const FIXTURES = join(import.meta.dir, "../../../fixtures");

/** Whether a probe snapshot taken after `steps` keeps the pointer where they left it. */
const keeps = (steps: Step[]) =>
  stateFor("x/y@shot", new Map([["x/y@probe", { steps: [...steps, { snapshot: "shot" }] }]]))
    ?.keepPointer;

describe("states", () => {
  it("names a calendar day the way our calendar's day buttons read", () => {
    expect(calendarDayName(new Date(2026, 9, 15))).toBe("October 15th, 2026");
    expect(calendarDayName(new Date(2026, 9, 28))).toBe("October 28th, 2026");
    expect(calendarDayName(new Date(2026, 0, 1))).toBe("January 1st, 2026");
    expect(calendarDayName(new Date(2026, 1, 2))).toBe("February 2nd, 2026");
    expect(calendarDayName(new Date(2026, 2, 3))).toBe("March 3rd, 2026");
    expect(calendarDayName(new Date(2026, 3, 11))).toBe("April 11th, 2026");
    expect(calendarDayName(new Date(2026, 4, 12))).toBe("May 12th, 2026");
    expect(calendarDayName(new Date(2026, 5, 13))).toBe("June 13th, 2026");
    expect(calendarDayName(new Date(2026, 6, 22))).toBe("July 22nd, 2026");
    expect(calendarDayName(new Date(2026, 7, 31))).toBe("August 31st, 2026");
  });

  it("keeps the pointer on a hover that a wait or a key follows, not on one a click follows", () => {
    // catalog/agents/message-feedback@poke-tooltip-1: hover, wait for the tooltip, snapshot.
    expect(keeps([{ hover: "button-1" }, { wait: 1200 }])).toBe(true);
    expect(keeps([{ hover: "option-2" }, { key: "ArrowDown" }])).toBe(true);
    expect(keeps([{ hover: "option-2" }])).toBe(true);
    expect(keeps([{ hover: "field-1" }, { click: "field-1" }, { wait: 300 }])).toBe(false);
    expect(keeps([{ key: "Tab" }])).toBe(false);
  });

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
