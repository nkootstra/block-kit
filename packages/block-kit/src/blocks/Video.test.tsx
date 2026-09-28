import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Video } from "./Video";

afterEach(cleanup);

const block = {
  type: "video",
  title: { type: "plain_text", text: "How to use Slack." },
  title_url: "https://www.youtube.com/watch?v=RRxQQxiM7AA",
  description: { type: "plain_text", text: "Slack is a new way to communicate." },
  video_url: "https://www.youtube.com/embed/RRxQQxiM7AA",
  alt_text: "How to use Slack?",
  thumbnail_url: "https://i.ytimg.com/vi/RRxQQxiM7AA/hqdefault.jpg",
  author_name: "Arcado Buendia",
  provider_name: "YouTube",
  provider_icon_url: "https://a.slack-edge.com/img/unfurl_icons/youtube.png",
};

describe("<Video>", () => {
  it("renders the provider, author, description and title", () => {
    render(<Video block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("YouTube")).toBeTruthy();
    expect(screen.getByText("Arcado Buendia")).toBeTruthy();
    expect(screen.getByText("Slack is a new way to communicate.")).toBeTruthy();
    expect(screen.getByText("How to use Slack.")).toBeTruthy();
  });

  it("links the title to title_url", () => {
    render(<Video block={block as never} blockId="b1" index={0} />);
    const link = screen.getByText("How to use Slack.").closest("a");
    expect(link?.getAttribute("href")).toBe(block.title_url);
  });

  it("renders the thumbnail inside the frame with a play button", () => {
    const { container } = render(<Video block={block as never} blockId="b1" index={0} />);
    const thumb = container.querySelector("img.sbk-video__thumb") as HTMLImageElement;
    expect(thumb.src).toBe(block.thumbnail_url);
    expect(container.querySelector(".sbk-video__play")).toBeTruthy();
  });

  it("opens video_url from the frame link, falling back to title_url", () => {
    const { container } = render(<Video block={block as never} blockId="b1" index={0} />);
    const frame = container.querySelector("a.sbk-video__frame") as HTMLAnchorElement;
    expect(frame.getAttribute("href")).toBe(block.video_url);

    const { video_url, ...withoutVideoUrl } = block;
    const { container: c2 } = render(
      <Video block={withoutVideoUrl as never} blockId="b1" index={0} />,
    );
    const frame2 = c2.querySelector("a.sbk-video__frame") as HTMLAnchorElement;
    expect(frame2.getAttribute("href")).toBe(block.title_url);
  });

  it("omits the byline row entirely when there is no author or provider", () => {
    const { author_name, provider_name, provider_icon_url, ...rest } = block;
    const { container } = render(<Video block={rest as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-video__byline")).toBeNull();
  });
});
