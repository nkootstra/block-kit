import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkRecordings,
  isRecordingName,
  lastAction,
  parseCaptureFile,
  recordingLeaks,
  redactBehaviour,
  redactor,
} from "./recordings";

const fixture = {
  blocks: [
    { type: "actions", block_id: "mine", elements: [{ type: "users_select", action_id: "u" }] },
    { type: "section", text: { type: "mrkdwn", text: "<@U0123456789>" } },
  ],
};

// The shape of what Actions Preview shows, with made-up identity values.
const preview = {
  type: "block_actions",
  user: { id: "U0ZZZZZZZZZ", username: "ada", name: "ada", team_id: "T0ZZZZZZZZZ" },
  api_app_id: "A0ZZZZZZZZZ",
  token: "abc",
  container: { type: "message", message_ts: "1700000000.000100", channel_id: "C0ZZZZZZZZZ" },
  trigger_id: "1.2.3",
  team: { id: "T0ZZZZZZZZZ", domain: "acme" },
  enterprise: null,
  is_enterprise_install: false,
  channel: { id: "C0ZZZZZZZZZ", name: "general" },
  state: {
    values: {
      mine: { u: { type: "users_select", selected_user: "U0YYYYYYYYY" } },
      "Xa+1": { other: { type: "plain_text_input", value: "<@U0123456789>" } },
    },
  },
  response_url: "https://hooks.slack.com/actions/T9/1/abc",
  actions: [
    {
      type: "users_select",
      block_id: "mine",
      action_id: "u",
      selected_user: "U0YYYYYYYYY",
      action_ts: "1700000000.1",
    },
  ],
};

describe("payload recordings", () => {
  it("redacts identity, opaque fields, generated block ids and workspace IDs", () => {
    const out = redactor(fixture).payload(preview) as typeof preview;
    expect(out.user).toEqual({
      id: "U00000000",
      username: "user",
      name: "user",
      team_id: "T00000000",
    });
    expect(out.team).toEqual({ id: "T00000000", domain: "workspace" });
    expect(out.channel).toEqual({ id: "C00000000", name: "channel" });
    expect(out.enterprise).toBeNull();
    expect([out.api_app_id, out.token, out.trigger_id, out.response_url]).toEqual([
      "<api_app_id>",
      "<token>",
      "<trigger_id>",
      "<response_url>",
    ]);
    expect(out.container).toEqual({
      type: "message",
      message_ts: "<message_ts>",
      channel_id: "C00000000",
    });
    expect(Object.keys(out.state.values)).toEqual(["mine", "<block_id>"]);
    expect(out.state.values.mine.u.selected_user).toBe("U0000001");
    // The fixture's own ID stays.
    expect(out.state.values["<block_id>" as "mine"]).toEqual({
      other: { type: "plain_text_input", value: "<@U0123456789>" },
    } as never);
    expect(out.actions[0]).toMatchObject({ selected_user: "U0000001", action_ts: "<action_ts>" });
    expect(recordingLeaks(JSON.stringify(out), fixture)).toEqual([]);
    expect(recordingLeaks(JSON.stringify(preview), fixture).length).toBeGreaterThan(0);
  });

  it("leaves a recording that's already redacted as it is", () => {
    const once = redactor(fixture).payload(preview);
    expect(redactor(fixture).payload(once)).toEqual(once);
  });

  it("redacts a behaviour recording's texts and payloads, and finds its last payload", () => {
    const recording = {
      steps: [{ click: "field-1" }, { key: "Enter" }],
      observations: [
        { focus: null, layers: [], activeOption: null, controls: {} },
        {
          focus: { target: "field-1", role: "combobox", name: "Real Person", where: "preview" },
          layers: [],
          activeOption: "U0YYYYYYYYY",
          controls: { "field-1": { value: "Real Person" } },
          action: null,
        },
        { focus: null, layers: [], activeOption: null, controls: {}, action: preview },
      ],
    };
    const out = redactBehaviour(
      recording as never,
      redactor(fixture, { "Real Person": "User One" }),
    );
    expect(out.observations[1]).toMatchObject({
      focus: { name: "User One" },
      activeOption: "U0000001",
      controls: { "field-1": { value: "User One" } },
      action: null,
    });
    expect((out.observations[2]!.action as typeof preview).user.id).toBe("U00000000");
    expect(lastAction(recording as never)).toBe(preview);
  });

  it("reads the file capture.js saves, and an older run's references alone", () => {
    expect(parseCaptureFile({ "a/b": "<html>" })).toEqual({
      references: { "a/b": "<html>" },
      actions: {},
      behaviour: {},
    });
    expect(parseCaptureFile({ references: { "a/b": "x" }, actions: { "a/b@click": {} } })).toEqual({
      references: { "a/b": "x" },
      actions: { "a/b@click": {} },
      behaviour: {},
    });
    expect(() => parseCaptureFile([])).toThrow();
  });

  it("names a recording after an interaction, in no theme or width", () => {
    expect(isRecordingName("catalog/actions/button@click")).toBe(true);
    expect(isRecordingName("catalog/actions/button")).toBe(false);
    expect(isRecordingName("catalog/actions/button@click+dark")).toBe(false);
  });

  it("checks the recordings and probes next to the fixtures", async () => {
    const root = await mkdtemp(join(tmpdir(), "recordings-"));
    await mkdir(join(root, "a"));
    const write = (file: string, value: unknown) =>
      writeFile(join(root, file), JSON.stringify(value));
    await write("a/select@pick.actions.json", redactor(fixture).payload(preview));
    await write("a/select@leak.actions.json", preview);
    await write("a/select@arrows.probe.json", { steps: [{ key: "ArrowDown" }] });
    await write("a/select@bad.probe.json", { steps: [{ click: "nope-1" }] });
    await write("a/gone@click.actions.json", {});
    const problems = await checkRecordings(root, new Map([["a/select", fixture]]));
    expect(problems.map((p) => p.name)).toEqual([
      "a/gone@click (actions)",
      "a/select@bad (probe)",
      "a/select@leak (actions)",
    ]);
  });
});
