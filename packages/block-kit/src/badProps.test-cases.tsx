import type { ReactElement } from "react";
import { Blocks } from "./Blocks";
import { BlockKitProvider } from "./context";
import { Message } from "./Message";
import { HomeTab } from "./surfaces/HomeTab";
import { Modal } from "./surfaces/Modal";
import { View } from "./surfaces/View";

/**
 * Components whose props a host fills straight from a payload (a message's `ts`, a user's `tz`, a
 * view from `views.open`), each given a value of the wrong shape. Each must render without
 * throwing, as if the prop were missing. Shared by the server and browser tests.
 */
/** Blocks that format a date in the provider's time zone. */
const datedBlocks = [
  { type: "section", text: { type: "mrkdwn", text: "<!date^1700000000^{date_long} {time}|x>" } },
  {
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [{ type: "date", timestamp: 1700000000, format: "{date_long}" }],
      },
    ],
  },
  { type: "actions", elements: [{ type: "datetimepicker" }] },
] as never;

export const badProps: [string, () => ReactElement][] = [
  ["a ts that can't become a string", () => <Message ts={{ toString: 1 } as never} />],
  ["a ts that is an object", () => <Message ts={{} as never} />],
  ["a ts that is Infinity", () => <Message ts={Infinity} />],
  [
    "a message ts that can't become a string",
    () => <Message message={{ ts: { toString: 1 } } as never} />,
  ],
  ["a time zone that doesn't exist", () => <Message ts="1700000000" timeZone="Mars/Phobos" />],
  ["a time zone that can't become a string", () => <Message timeZone={{ toString: 1 } as never} />],
  ["a time zone that is a number", () => <Message timeZone={1 as never} />],
  ["an app that is null", () => <Message app={null as never} />],
  ["an app that is a string", () => <Message app={"x" as never} />],
  ["an app name that is a number", () => <Message app={{ name: 1 } as never} />],
  ["an app name that is null", () => <Message app={{ name: null } as never} />],
  ["an app icon that is an object", () => <Message app={{ name: "a", iconUrl: {} } as never} />],
  ["blocks that are a string", () => <Blocks blocks={"x" as never} />],
  ["a view that is null", () => <View view={null as never} />],
  ["a view that is a string", () => <View view={"x" as never} />],
  ["a modal view that is null", () => <Modal view={null as never} />],
  [
    "a modal id that can't become a string",
    () => <Modal view={{ type: "modal", id: { toString: 1 } } as never} />,
  ],
  [
    "a modal icon that is an object",
    () => <Modal view={{ type: "modal", blocks: [] }} icon={{} as never} />,
  ],
  ["a home view that is null", () => <HomeTab view={null as never} />],
  [
    "a provider time zone that doesn't exist",
    () => (
      <BlockKitProvider timeZone="Mars/Phobos">
        <Message ts="1700000000" blocks={datedBlocks} />
      </BlockKitProvider>
    ),
  ],
  [
    "a provider time zone that can't become a string",
    () => (
      <BlockKitProvider timeZone={{ toString: 1 } as never}>
        <Message ts="1700000000" blocks={datedBlocks} />
      </BlockKitProvider>
    ),
  ],
];
