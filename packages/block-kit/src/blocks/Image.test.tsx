import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BlockKitProvider, type Resolvers } from "../context";
import { ImageElement } from "../elements/ImageElement";
import { Image } from "./Image";

afterEach(cleanup);

describe("<Image>", () => {
  it("renders the image with alt text", () => {
    const block = {
      type: "image",
      image_url: "https://example.com/a.png",
      alt_text: "a widget",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    const img = container.querySelector("img.sbk-image__img") as HTMLImageElement;
    expect(img.src).toBe("https://example.com/a.png");
    expect(img.alt).toBe("a widget");
  });

  it("paints the image as the frame's background, like Slack, so downscaled photos resample identically", () => {
    const block = {
      type: "image",
      image_url: "https://example.com/a.png",
      alt_text: "a widget",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    const frame = container.querySelector(".sbk-image__frame") as HTMLElement;
    expect(frame.style.backgroundImage).toBe('url("https://example.com/a.png")');
  });

  it("shows the title text plus an always-present expand caret", () => {
    const block = {
      type: "image",
      title: { type: "plain_text", text: "I love tacos" },
      image_url: "https://example.com/a.png",
      alt_text: "tacos",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("I love tacos")).toBeTruthy();
    expect(container.querySelector(".sbk-image__caret")).toBeTruthy();
  });

  it("still shows the caret row when there is no title", () => {
    const block = {
      type: "image",
      image_url: "https://example.com/a.png",
      alt_text: "tacos",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-image__title")).toBeTruthy();
    expect(container.querySelector(".sbk-image__caret")).toBeTruthy();
    expect(container.querySelector(".sbk-image__title-text")).toBeNull();
  });

  it("hides the image when its caret is pressed and shows it again on a second press, like Slack", () => {
    const block = {
      type: "image",
      title: { type: "plain_text", text: "I love tacos" },
      image_url: "https://example.com/a.png",
      alt_text: "tacos",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    const toggle = screen.getByRole("button", { name: "image" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("title")).toBe("Collapse");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("title")).toBe("Expand");
    expect(container.querySelector(".sbk-image__frame")).toBeNull();
    expect(screen.getByText("I love tacos")).toBeTruthy();

    fireEvent.click(toggle);
    expect(container.querySelector("img.sbk-image__img")).toBeTruthy();
  });

  it("points the caret right while the image is hidden", () => {
    const block = { type: "image", image_url: "https://example.com/a.png", alt_text: "tacos" };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: "image" }));
    expect(container.querySelector(".sbk-image__caret--collapsed")).toBeTruthy();
  });

  it("falls back to a placeholder for a slack_file image with no resolvable URL", () => {
    const block = {
      type: "image",
      slack_file: { id: "F123" },
      alt_text: "a shared file",
    };
    const { container } = render(<Image block={block as never} blockId="b1" index={0} />);
    expect(container.querySelector("img")).toBeNull();
    const fallback = container.querySelector(".sbk-image__fallback") as HTMLElement;
    expect(fallback.getAttribute("aria-label")).toBe("a shared file");
    expect(container.querySelector(".sbk-image__title")).toBeNull();
  });

  describe("an image_url's size, through resolvers.imageSize", () => {
    // Block Kit Builder shows the size of the image it fetched: "(72 kB)" for a 71,861-byte
    // photo (catalog/image/title), whatever the payload's image_bytes says.
    it("shows Slack's (N kB) caption beside the caret", () => {
      const resolvers: Resolvers = {
        imageSize: (url) => (url === "https://example.com/tacos.jpg" ? 71_861 : undefined),
      };
      const block = { type: "image", image_url: "https://example.com/tacos.jpg", alt_text: "x" };
      const { container } = render(
        <BlockKitProvider resolvers={resolvers}>
          <Image block={block as never} blockId="b1" index={0} />
        </BlockKitProvider>,
      );
      expect(container.querySelector(".sbk-image__trigger")?.textContent?.trim()).toBe("(72 kB)");
    });

    // Slack's caption reads " (72 kB)": the space separates it from a title and collapses at the
    // start of the row when there's none (catalog/image/title and no-title).
    it("separates the caption from the title with a space, as Slack does", () => {
      const resolvers: Resolvers = { imageSize: () => 71_861 };
      const block = {
        type: "image",
        title: { type: "plain_text", text: "I love tacos" },
        image_url: "https://example.com/tacos.jpg",
        alt_text: "x",
      };
      const { container } = render(
        <BlockKitProvider resolvers={resolvers}>
          <Image block={block as never} blockId="b1" index={0} />
        </BlockKitProvider>,
      );
      expect(container.querySelector(".sbk-image__trigger")?.textContent).toMatch(/^ \(72 kB\)/);
    });

    it("leaves the caption out for an image the resolver doesn't know", () => {
      const resolvers: Resolvers = { imageSize: () => undefined };
      const block = { type: "image", image_url: "https://example.com/other.jpg", alt_text: "x" };
      const { container } = render(
        <BlockKitProvider resolvers={resolvers}>
          <Image block={block as never} blockId="b1" index={0} />
        </BlockKitProvider>,
      );
      expect(container.querySelector(".sbk-image__trigger")?.textContent?.trim()).toBe("");
    });
  });

  describe("slack_file, through resolvers.slackFile", () => {
    const resolvers: Resolvers = {
      slackFile: (file) =>
        file.id === "F123" ? { url: "https://files.example/taco.jpg", size: 400_401 } : undefined,
    };
    const withResolvers = (ui: React.ReactElement) =>
      render(<BlockKitProvider resolvers={resolvers}>{ui}</BlockKitProvider>);

    // Slack counts decimal kilobytes: its Builder shows "(400 kB)" for a 400,401-byte file.
    it("shows a resolved file as the image, with Slack's (N kB) size beside the caret", () => {
      const block = { type: "image", slack_file: { id: "F123" }, alt_text: "a shared file" };
      const { container } = withResolvers(<Image block={block as never} blockId="b1" index={0} />);
      const img = container.querySelector("img") as HTMLImageElement;
      expect([img.getAttribute("src"), img.alt]).toEqual([
        "https://files.example/taco.jpg",
        "a shared file",
      ]);
      expect(container.querySelector(".sbk-image__trigger")?.textContent?.trim()).toBe("(400 kB)");
      expect(container.querySelector(".sbk-image__fallback")).toBeNull();
    });

    it("leaves the size out when the resolver doesn't know it", () => {
      const resolve: Resolvers = { slackFile: () => ({ url: "https://files.example/taco.jpg" }) };
      const block = {
        type: "image",
        slack_file: { url: "https://files.slack.com/x" },
        alt_text: "x",
      };
      const { container } = render(
        <BlockKitProvider resolvers={resolve}>
          <Image block={block as never} blockId="b1" index={0} />
        </BlockKitProvider>,
      );
      expect(container.querySelector(".sbk-image__trigger")?.textContent?.trim()).toBe("");
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://files.example/taco.jpg",
      );
    });

    it("keeps the placeholder when the resolver can't find the file", () => {
      const block = { type: "image", slack_file: { id: "F999" }, alt_text: "missing" };
      const { container } = withResolvers(<Image block={block as never} blockId="b1" index={0} />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector(".sbk-image__fallback")).toBeTruthy();
    });

    it("resolves an image element's slack_file too, as a section accessory", () => {
      const element = { type: "image", slack_file: { id: "F123" }, alt_text: "thumb" };
      const { container } = withResolvers(<ImageElement element={element as never} blockId="b1" />);
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://files.example/taco.jpg",
      );
    });
  });
});
