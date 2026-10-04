import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider, type LinkProps } from "./context";
import { Blocks } from "./Blocks";
import { Message } from "./Message";
import { Mrkdwn } from "./Mrkdwn";

afterEach(cleanup);

/** Stands in for a router's <Link>: marks the anchor so a test can tell who rendered it. */
function RouterLink({ children, ...props }: LinkProps & { children?: ReactNode }) {
  return (
    <a data-router="" {...props}>
      {children}
    </a>
  );
}

describe("linkComponent", () => {
  it("renders a mrkdwn link with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Mrkdwn text="<https://example.com/docs|Docs>" />
      </BlockKitProvider>,
    );
    const link = screen.getByRole("link", { name: "Docs" });
    expect(link.hasAttribute("data-router")).toBe(true);
    expect(link.getAttribute("href")).toBe("https://example.com/docs");
  });

  it("renders a rich text link with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_section",
                  elements: [{ type: "link", url: "https://example.com/docs", text: "Docs" }],
                },
              ],
            },
          ]}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "Docs" }).hasAttribute("data-router")).toBe(true);
  });

  it("renders a link in preformatted rich text with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_preformatted",
                  elements: [{ type: "link", url: "https://example.com/log", text: "log" }],
                },
              ],
            },
          ]}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "log" }).hasAttribute("data-router")).toBe(true);
  });

  it("renders a markdown block link with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[{ type: "markdown", text: "Read [the docs](https://example.com/docs)." }]}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "the docs" }).hasAttribute("data-router")).toBe(true);
  });

  it("renders a linked date with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink} timeZone="UTC">
        <Mrkdwn text="<!date^1392734382^{date_short}^https://example.com/event|Feb 18>" />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "Feb 18, 2014" }).hasAttribute("data-router")).toBe(
      true,
    );
  });

  it("renders a linked rich text date with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink} timeZone="UTC">
        <Blocks
          blocks={[
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_section",
                  elements: [
                    {
                      type: "date",
                      timestamp: 1392734382,
                      format: "{date_short}",
                      url: "https://example.com/event",
                    },
                  ],
                },
              ],
            },
          ]}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "Feb 18, 2014" }).hasAttribute("data-router")).toBe(
      true,
    );
  });

  it("renders data table links with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[
            {
              type: "data_table",
              rows: [
                [
                  { type: "raw_text", text: "Ticket" },
                  { type: "raw_text", text: "Owner" },
                ],
                [
                  { type: "url", url: "https://example.com/t/1", text: "T-1" },
                  {
                    type: "rich_text",
                    elements: [
                      {
                        type: "rich_text_section",
                        elements: [{ type: "link", url: "https://example.com/u/ada", text: "Ada" }],
                      },
                    ],
                  },
                ],
              ],
            } as never,
          ]}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "T-1" }).hasAttribute("data-router")).toBe(true);
    expect(screen.getByRole("link", { name: "Ada" }).hasAttribute("data-router")).toBe(true);
  });

  it("leaves a data table link without a URL to a plain anchor", () => {
    const { container } = render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[
            {
              type: "data_table",
              rows: [[{ type: "raw_text", text: "Ticket" }], [{ type: "url", text: "T-1" }]],
            } as never,
          ]}
        />
      </BlockKitProvider>,
    );
    const anchor = container.querySelector(".sbk-rtmini__link");
    expect(anchor?.hasAttribute("href")).toBe(false);
    expect(anchor?.hasAttribute("data-router")).toBe(false);
  });
});

describe("linkComponent on links from the payload", () => {
  it("renders a task card's sources with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[
            {
              type: "task_card",
              task_id: "t1",
              title: "Research",
              status: "complete",
              sources: [{ type: "url", url: "https://example.com/a", text: "Source A" }],
            } as never,
          ]}
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Research/ }));
    expect(screen.getByRole("link", { name: "Source A" }).hasAttribute("data-router")).toBe(true);
  });

  it("renders a plan task's sources with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[
            {
              type: "plan",
              title: "Plan",
              tasks: [
                {
                  task_id: "t1",
                  title: "Research",
                  status: "complete",
                  sources: [{ type: "url", url: "https://example.com/a", text: "Source A" }],
                },
              ],
            } as never,
          ]}
        />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Plan/ }));
    expect(screen.getByRole("link", { name: "Source A" }).hasAttribute("data-router")).toBe(true);
  });

  it("renders a video's title and player links with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Blocks
          blocks={[
            {
              type: "video",
              title: { type: "plain_text", text: "Demo" },
              title_url: "https://example.com/watch",
              video_url: "https://example.com/embed",
              alt_text: "Demo video",
              thumbnail_url: "https://example.com/thumb.jpg",
            },
          ]}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "Demo" }).hasAttribute("data-router")).toBe(true);
    expect(screen.getByRole("link", { name: "Demo video" }).hasAttribute("data-router")).toBe(true);
  });

  it("renders an attachment's author link with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Message
          message={{
            ts: "1.000",
            attachments: [
              { author_name: "Ada", author_link: "https://example.com/ada", text: "Hi" },
            ],
          }}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "Ada" }).hasAttribute("data-router")).toBe(true);
  });
  it("renders an attachment's title link with the app's link component", () => {
    render(
      <BlockKitProvider linkComponent={RouterLink}>
        <Message
          message={{
            ts: "1.000",
            attachments: [{ title: "Report", title_link: "https://example.com/report" }],
          }}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "Report" }).hasAttribute("data-router")).toBe(true);
  });
});

/** Points mentions at the app's own pages, as a help desk or archive would. */
const mentionHref = ({ type, id }: { type: string; id: string }) => `/${type}s/${id}`;

const resolvers = {
  user: (id: string) => (id === "U1" ? "ada" : undefined),
  channel: (id: string) => (id === "C1" ? "general" : undefined),
  usergroup: (id: string) => (id === "S1" ? "devs" : undefined),
};

describe("mentionHref", () => {
  it("links a channel mention to the app's page for it", () => {
    render(
      <BlockKitProvider resolvers={resolvers} mentionHref={mentionHref}>
        <Mrkdwn text="See <#C1>" />
      </BlockKitProvider>,
    );
    const link = screen.getByRole("link", { name: "#general" });
    expect(link.getAttribute("href")).toBe("/channels/C1");
    expect(link.className).toBe("sbk-mention");
  });

  it("links a user group mention to the app's page for it", () => {
    render(
      <BlockKitProvider resolvers={resolvers} mentionHref={mentionHref}>
        <Mrkdwn text="Ask <!subteam^S1>" />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "@devs" }).getAttribute("href")).toBe("/usergroups/S1");
  });

  it("links channel and user group mentions in rich text", () => {
    render(
      <BlockKitProvider resolvers={resolvers} mentionHref={mentionHref}>
        <Blocks
          blocks={[
            {
              type: "rich_text",
              elements: [
                {
                  type: "rich_text_section",
                  elements: [
                    { type: "channel", channel_id: "C1" },
                    { type: "usergroup", usergroup_id: "S1" },
                  ],
                },
              ],
            },
          ]}
        />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "#general" }).getAttribute("href")).toBe(
      "/channels/C1",
    );
    expect(screen.getByRole("link", { name: "@devs" }).getAttribute("href")).toBe("/usergroups/S1");
  });

  it("keeps a user mention opening the profile card, whose name links to the app's page", () => {
    render(
      <BlockKitProvider resolvers={resolvers} mentionHref={mentionHref}>
        <Mrkdwn text="Thanks <@U1>" />
      </BlockKitProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "@ada" }));
    const card = screen.getByRole("dialog", { name: "ada" });
    expect(card.querySelector("a")?.getAttribute("href")).toBe("/users/U1");
  });

  it("renders mention links with the app's link component", () => {
    render(
      <BlockKitProvider resolvers={resolvers} mentionHref={mentionHref} linkComponent={RouterLink}>
        <Mrkdwn text="See <#C1>" />
      </BlockKitProvider>,
    );
    expect(screen.getByRole("link", { name: "#general" }).hasAttribute("data-router")).toBe(true);
  });

  it("leaves a mention as a pill when the app has no page for it", () => {
    const { container } = render(
      <BlockKitProvider resolvers={resolvers} mentionHref={() => undefined}>
        <Mrkdwn text="See <#C1>" />
      </BlockKitProvider>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector(".sbk-mention")?.textContent).toBe("#general");
  });

  it("doesn't link a mention it couldn't resolve", () => {
    render(
      <BlockKitProvider resolvers={resolvers} mentionHref={mentionHref}>
        <Mrkdwn text="See <#C9> and <!subteam^S9>" />
      </BlockKitProvider>,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
