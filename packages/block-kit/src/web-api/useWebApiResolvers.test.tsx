import type { WebClient } from "@slack/web-api";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockKitProvider } from "../context";
import { Message } from "../Message";
import { useWebApiResolvers } from "./useWebApiResolvers";

afterEach(cleanup);

const client = {
  users: {
    info: vi.fn(async () => ({ ok: true, user: { id: "U0123456789", real_name: "Ada Lovelace" } })),
  },
  conversations: {
    info: vi.fn(async () => ({ ok: true, channel: { id: "C0123456789", name: "releases" } })),
  },
  usergroups: {
    list: vi.fn(async () => ({
      ok: true,
      usergroups: [{ id: "S0123456789", handle: "eng", name: "Engineering" }],
    })),
  },
} as unknown as WebClient;

function Preview() {
  const resolvers = useWebApiResolvers(client, { batchWindowMs: 0 });
  return (
    <BlockKitProvider resolvers={resolvers}>
      <Message
        blocks={[
          {
            type: "section",
            text: { type: "mrkdwn", text: "mrkdwn <#C0123456789> <!subteam^S0123456789>" },
          },
          {
            type: "rich_text",
            elements: [
              {
                type: "rich_text_section",
                elements: [
                  { type: "text", text: "rich " },
                  { type: "channel", channel_id: "C0123456789" },
                  { type: "text", text: " " },
                  { type: "usergroup", usergroup_id: "S0123456789" },
                ],
              },
            ],
          },
        ]}
      />
    </BlockKitProvider>
  );
}

describe("useWebApiResolvers through <Message>", () => {
  it("renders each mention with exactly one # or @", async () => {
    const { container } = render(<Preview />);

    await vi.waitFor(() => expect(screen.getAllByText("#releases")).toHaveLength(2));
    expect(screen.getAllByText("@eng")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/##|@@/);
  });
});
