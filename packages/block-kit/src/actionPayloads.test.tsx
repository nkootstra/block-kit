/**
 * Checks the `block_actions` payloads block-kit builds against the ones Block Kit Builder's
 * Actions Preview showed for the same interaction, recorded as `fixtures/<fixture>@<interaction>.actions.json`
 * (maintainer-owned, like the reference snapshots; see tools/visual/README.md).
 *
 * Compared: `type`, `enterprise`, `is_enterprise_install`, `actions` and `state.values`. Not
 * compared: identity (redacted in the recordings), `action_ts`, Slack's generated block ids,
 * and `container`/`message`/`channel`, which the Builder only simulates.
 *
 * Every difference that remains is listed in KNOWN_DIFFERENCES, so the check fails both on a
 * new difference and on a listed one that no longer happens: a fix removes its entries.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider, type StateValues } from "./context";
import { clickAsync, keyDownAsync } from "./elements/test-utils";
import { Message } from "./Message";
import type { BlockActionsPayload } from "./payloads";

afterEach(cleanup);

/** The repository's fixtures/ folder: the nearest one above where the tests run. */
function fixturesDir(): string {
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    try {
      readdirSync(join(dir, "fixtures"));
      return join(dir, "fixtures") + "/";
    } catch {
      if (dirname(dir) === dir) throw new Error("fixtures/ not found");
    }
  }
}

const FIXTURES = fixturesDir();
const GENERATED = "<block_id>";

/** What the user does in the recording, named after the part after `@`. */
const INTERACTIONS: Record<string, () => Promise<void>> = {
  "catalog/actions/button@click": () =>
    clickAsync(screen.getByRole("button", { name: "Click Me" })),
  "extra/actions/more-elements@confirm-delete": async () => {
    await clickAsync(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    await clickAsync(
      [...dialog.querySelectorAll("button")].find((b) => b.textContent === "Delete")!,
    );
  },
  "catalog/actions/all-selects@pick-static": async () => {
    fireEvent.click(screen.getByText("Select an item"));
    await clickAsync(screen.getByText("*plain_text option 1*"));
  },
  "catalog/actions/radio-buttons@pick": () => clickAsync(screen.getAllByRole("radio")[1]!),
  "catalog/actions/checkboxes@check-first": () => clickAsync(screen.getAllByRole("checkbox")[0]!),
  "catalog/section/overflow@pick": async () => {
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    await clickAsync(screen.getByText("*plain_text option 2*"));
  },
  // Slack opens a "Select options" dialog and dispatches on Confirm; block-kit's menu is inline.
  "catalog/section/multi-static-select@pick-confirm": async () => {
    fireEvent.click(screen.getByText("Select options"));
    await clickAsync(screen.getByText("*plain_text option 1*"));
  },
  "catalog/actions/datepickers@pick-15th": async () => {
    fireEvent.click(screen.getAllByPlaceholderText("Select a date")[0]!);
    await clickAsync(screen.getByText("15"));
  },
  "catalog/actions/timepicker@pick-3pm": async () => {
    fireEvent.click(screen.getByDisplayValue("1:37 PM"));
    await clickAsync(screen.getByRole("option", { name: "3:00 PM" }));
  },
  "catalog/input/dispatches-actions@enter": async () => {
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });
    await keyDownAsync(input, "Enter");
  },
};

/**
 * Differences between block-kit and the recordings, as `path: Slack <value>, ours <value>`.
 * Remove an entry when a change makes block-kit match Slack there.
 */
const KNOWN_DIFFERENCES: Record<string, string[]> = {};

interface Recording {
  name: string;
  slack: Record<string, unknown>;
}

function recordings(): Recording[] {
  const out: Recording[] = [];
  for (const path of readdirSync(FIXTURES, { recursive: true, encoding: "utf8" })) {
    if (!path.endsWith(".actions.json")) continue;
    out.push({
      name: path.replace(/\.actions\.json$/, ""),
      slack: JSON.parse(readFileSync(FIXTURES + path, "utf8")),
    });
  }
  return out.toSorted((a, b) => a.name.localeCompare(b.name));
}

function fixtureBlocks(name: string) {
  const json = JSON.parse(readFileSync(`${FIXTURES}${name.split("@")[0]}.json`, "utf8"));
  return Array.isArray(json) ? json : json.blocks;
}

/** The compared part of a payload, with Slack's generated block ids and timestamps masked. */
function comparable(
  payload: Record<string, unknown>,
  generated: boolean,
  initial: StateValues,
  slackState: StateValues,
) {
  const actions = (payload.actions as Record<string, unknown>[]).map((action) => {
    const { action_ts: _ts, ...rest } = action;
    return generated ? { ...rest, block_id: GENERATED } : rest;
  });
  const values: StateValues = {};
  const state = (payload.state as { values?: StateValues } | undefined)?.values ?? {};
  for (const [blockId, elements] of Object.entries(state)) {
    for (const [actionId, value] of Object.entries(elements)) {
      const key = generated ? GENERATED : blockId;
      // Slack's state holds only what the user changed; block-kit also reports initial values
      // from mount. That difference is deliberate until it's verified against a real app, so an
      // entry Slack doesn't have is dropped when it's still the initial value.
      const unchangedInitial =
        JSON.stringify(initial[blockId]?.[actionId]) === JSON.stringify(value);
      if (!slackState[key]?.[actionId] && unchangedInitial) continue;
      (values[key] ??= {})[actionId] = value;
    }
  }
  return {
    type: payload.type,
    enterprise: payload.enterprise,
    is_enterprise_install: payload.is_enterprise_install,
    actions,
    state: { values },
  };
}

const isObject = (v: unknown) => typeof v === "object" && v !== null;
const show = (v: unknown) => (v === undefined ? "missing" : JSON.stringify(v));

/** Leaf-level differences between two JSON values, as `path: Slack <a>, ours <b>`. */
function differences(slack: unknown, ours: unknown, path = ""): string[] {
  if (JSON.stringify(slack) === JSON.stringify(ours)) return [];
  if (isObject(slack) && isObject(ours) && Array.isArray(slack) === Array.isArray(ours)) {
    const keys = new Set([...Object.keys(slack as object), ...Object.keys(ours as object)]);
    return [...keys].flatMap((key) =>
      differences(
        (slack as Record<string, unknown>)[key],
        (ours as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
      ),
    );
  }
  return [`${path}: Slack ${show(slack)}, ours ${show(ours)}`];
}

describe("block_actions payloads match Block Kit Builder's Actions Preview", () => {
  const all = recordings();

  it("has an interaction for every recording", () => {
    expect(all.map((r) => r.name).filter((name) => !INTERACTIONS[name])).toEqual([]);
    expect(Object.keys(KNOWN_DIFFERENCES).filter((n) => !all.some((r) => r.name === n))).toEqual(
      [],
    );
  });

  for (const { name, slack } of all) {
    it(`${name} sends what Slack sends`, async () => {
      let payload: BlockActionsPayload | undefined;
      let initial: StateValues = {};
      render(
        <BlockKitProvider
          onPayload={(p) => (payload = p)}
          onStateChange={(s) => {
            if (!payload) initial = s;
          }}
        >
          <Message blocks={fixtureBlocks(name)} />
        </BlockKitProvider>,
      );
      await INTERACTIONS[name]!();
      expect(payload, "no block_actions payload was dispatched").toBeDefined();

      const slackActions = slack.actions as { block_id: string }[];
      const generated = slackActions[0]!.block_id === GENERATED;
      const slackState = (slack.state as { values: StateValues }).values;
      const theirs = comparable(slack, false, {}, slackState);
      const ours = comparable(
        payload as unknown as Record<string, unknown>,
        generated,
        initial,
        slackState,
      );
      expect(differences(theirs, ours).toSorted()).toEqual(
        (KNOWN_DIFFERENCES[name] ?? []).toSorted(),
      );
    });

    it(`${name} hands onAction the action the payload sends`, async () => {
      let payload: BlockActionsPayload | undefined;
      let action: unknown;
      render(
        <BlockKitProvider onAction={(a) => (action = a)} onPayload={(p) => (payload = p)}>
          <Message blocks={fixtureBlocks(name)} />
        </BlockKitProvider>,
      );
      await INTERACTIONS[name]!();
      expect(action).toEqual(payload?.actions[0]);
    });
  }
});
