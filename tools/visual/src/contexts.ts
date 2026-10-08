/**
 * The same interactive element in every place Slack lets it go, so each can be captured and
 * compared in each: an `actions` block in a message, a section's accessory, an input block in a
 * modal, and an `actions` block on App Home. Writes fixtures/contexts/<element>/<context>.json:
 *
 *   bun tools/visual/src/contexts.ts
 *
 * contexts.test.ts fails when the files on disk drift from what this writes. Where an element may
 * go follows Slack's Block Kit reference (the "compatible blocks" of each element).
 */
import { mkdir, rm } from "node:fs/promises";
import { Glob } from "bun";
import { dirname, join } from "node:path";
import { FIXTURES } from "./lock";

export const CONTEXTS = ["actions", "accessory", "modal-input", "home"] as const;
export type Context = (typeof CONTEXTS)[number];

const text = (t: string) => ({ type: "plain_text", text: t, emoji: true });
const options = [1, 2, 3].map((n) => ({ text: text(`Option ${n}`), value: `value-${n}` }));

/** Each element as it's written in every context, and where Slack allows it. */
export const ELEMENTS: Record<string, { element: Record<string, unknown>; in: Context[] }> = {
  button: {
    element: { type: "button", action_id: "button", text: text("Click me"), value: "click" },
    in: ["actions", "accessory", "home"],
  },
  overflow: {
    element: { type: "overflow", action_id: "overflow", options },
    in: ["actions", "accessory", "home"],
  },
  static_select: {
    element: {
      type: "static_select",
      action_id: "static",
      placeholder: text("Select an item"),
      options,
    },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  multi_static_select: {
    element: {
      type: "multi_static_select",
      action_id: "multi_static",
      placeholder: text("Select items"),
      options,
    },
    // Block Kit Builder refuses a multi-select in an actions block, in a message and on App
    // Home: it keeps showing the previous payload, so there's nothing of Slack's to compare.
    in: ["accessory", "modal-input"],
  },
  users_select: {
    element: { type: "users_select", action_id: "users", placeholder: text("Select a user") },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  multi_users_select: {
    element: {
      type: "multi_users_select",
      action_id: "multi_users",
      placeholder: text("Select users"),
    },
    // Block Kit Builder refuses a multi-select in an actions block, in a message and on App
    // Home: it keeps showing the previous payload, so there's nothing of Slack's to compare.
    in: ["accessory", "modal-input"],
  },
  conversations_select: {
    element: {
      type: "conversations_select",
      action_id: "conversations",
      placeholder: text("Select a conversation"),
    },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  channels_select: {
    element: {
      type: "channels_select",
      action_id: "channels",
      placeholder: text("Select a channel"),
    },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  external_select: {
    element: {
      type: "external_select",
      action_id: "external",
      placeholder: text("Select an item"),
    },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  datepicker: {
    element: {
      type: "datepicker",
      action_id: "date",
      initial_date: "1990-04-28",
      placeholder: text("Select a date"),
    },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  timepicker: {
    element: {
      type: "timepicker",
      action_id: "time",
      initial_time: "13:37",
      placeholder: text("Select time"),
    },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  datetimepicker: {
    element: { type: "datetimepicker", action_id: "datetime", initial_date_time: 1767261600 },
    // Block Kit Builder refuses it as a section accessory ("Invalid value: "datetimepicker""; an
    // accessory takes a datepicker or timepicker, not both) and keeps showing the previous payload.
    in: ["actions", "modal-input"],
  },
  checkboxes: {
    element: { type: "checkboxes", action_id: "checkboxes", options },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  radio_buttons: {
    element: { type: "radio_buttons", action_id: "radios", options },
    in: ["actions", "accessory", "modal-input", "home"],
  },
  plain_text_input: {
    element: { type: "plain_text_input", action_id: "text", placeholder: text("Write something") },
    in: ["modal-input"],
  },
  multiline_plain_text_input: {
    element: { type: "plain_text_input", action_id: "multiline", multiline: true },
    in: ["modal-input"],
  },
  number_input: {
    element: { type: "number_input", action_id: "number", is_decimal_allowed: false },
    in: ["modal-input"],
  },
  email_text_input: {
    element: { type: "email_text_input", action_id: "email" },
    in: ["modal-input"],
  },
  url_text_input: {
    element: { type: "url_text_input", action_id: "url" },
    in: ["modal-input"],
  },
  rich_text_input: {
    element: { type: "rich_text_input", action_id: "rich" },
    in: ["modal-input"],
  },
  file_input: {
    element: { type: "file_input", action_id: "file" },
    in: ["modal-input"],
  },
};

export function allowed(element: string, context: Context | string): boolean {
  return ELEMENTS[element]?.in.includes(context as Context) ?? false;
}

/** The fixture payload for `element` in `context`. */
export function fixtureFor(element: string, context: Context): Record<string, unknown> {
  const spec = ELEMENTS[element];
  if (!spec || !allowed(element, context))
    throw new Error(`${element} isn't allowed in ${context}`);
  const el = spec.element;
  switch (context) {
    case "actions":
      return { blocks: [{ type: "actions", elements: [el] }] };
    case "accessory":
      return {
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "A section with an accessory" },
            accessory: el,
          },
        ],
      };
    case "modal-input":
      return {
        type: "modal",
        title: text("Context"),
        submit: text("Submit"),
        close: text("Cancel"),
        blocks: [{ type: "input", label: text("Label"), element: el }],
      };
    case "home":
      return { type: "home", blocks: [{ type: "actions", elements: [el] }] };
  }
}

/**
 * Writes every allowed pairing's fixture into `dir` and deletes the fixtures of pairings no
 * longer allowed. Only the fixture JSON is touched: the references and payload recordings captured
 * next to it are maintainer-owned and stay, so dropping one goes through the lock (lock.ts).
 */
export async function writeContexts(dir: string): Promise<number> {
  const keep = new Set<string>();
  for (const element of Object.keys(ELEMENTS))
    for (const context of CONTEXTS)
      if (allowed(element, context)) keep.add(join(element, `${context}.json`));
  for await (const path of new Glob("*/*.json").scan({ cwd: dir, onlyFiles: true }))
    if (!keep.has(path) && !path.endsWith(".actions.json")) await rm(join(dir, path));
  for (const path of keep) {
    const [element = "", file = ""] = path.split("/");
    const file_ = join(dir, path);
    await mkdir(dirname(file_), { recursive: true });
    await Bun.write(
      file_,
      `${JSON.stringify(fixtureFor(element, file.replace(/\.json$/, "") as Context), null, 2)}\n`,
    );
  }
  return keep.size;
}

if (import.meta.main) {
  const written = await writeContexts(join(FIXTURES, "contexts"));
  console.log(`wrote ${written} context fixtures to fixtures/contexts/`);
}
