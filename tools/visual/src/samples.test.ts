import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
  checkSampleImages,
  imageUrls,
  isAllowedImageUrl,
  loadImage,
  readSampleSources,
  SAMPLES,
  sampleFile,
} from "./samples";

const BEAGLE = "https://cdn.block-kit.dev/samples/beagle.e3711bc4.jpg";

describe("sampleFile", () => {
  it("maps a sample URL to its committed copy", () => {
    expect(sampleFile(BEAGLE)).toBe(join(SAMPLES, "beagle.e3711bc4.jpg"));
  });

  it("ignores the query and the fragment", () => {
    expect(sampleFile(`${BEAGLE}?w=200#top`)).toBe(join(SAMPLES, "beagle.e3711bc4.jpg"));
  });

  it("unwraps Slack's image proxy, which a reference loads every image through", () => {
    const proxied = `https://slack-imgs.com/?c=1&url=${encodeURIComponent(BEAGLE)}`;
    expect(sampleFile(proxied)).toBe(join(SAMPLES, "beagle.e3711bc4.jpg"));
  });

  it("knows nothing outside samples/ on the CDN, or on other hosts", () => {
    expect(sampleFile("https://cdn.block-kit.dev/pr-12/abc/render.png")).toBeUndefined();
    expect(sampleFile("https://cdn.block-kit.dev/samples/../pr-12/render.png")).toBeUndefined();
    expect(sampleFile("https://cdn.block-kit.dev/samples/a/b.png")).toBeUndefined();
    expect(sampleFile("http://cdn.block-kit.dev/samples/beagle.e3711bc4.jpg")).toBeUndefined();
    expect(sampleFile("https://example.com/samples/beagle.e3711bc4.jpg")).toBeUndefined();
    expect(sampleFile("not a url")).toBeUndefined();
  });
});

describe("loadImage", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("reads a sample from fixtures/assets/samples without touching the network", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("no network"))) as unknown as typeof fetch;
    const image = await loadImage(BEAGLE);
    expect(image?.type).toBe("image/jpeg");
    const committed = new Uint8Array(
      await Bun.file(join(SAMPLES, "beagle.e3711bc4.jpg")).arrayBuffer(),
    );
    expect(Buffer.compare(Buffer.from(image!.body), Buffer.from(committed))).toBe(0);
  });

  it("finds no sample that isn't committed, instead of fetching it", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("no network"))) as unknown as typeof fetch;
    expect(
      await loadImage("https://cdn.block-kit.dev/samples/missing.00000000.png"),
    ).toBeUndefined();
  });

  it("fetches any other image", async () => {
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      })) as unknown as typeof fetch;
    const image = await loadImage("https://images.example/photo.png");
    expect(image?.type).toBe("image/png");
    expect([...image!.body]).toEqual([1, 2, 3]);
  });
});

describe("imageUrls", () => {
  it("finds URLs with an image extension, in any kind of file", () => {
    expect(
      imageUrls(`![dog](https://a.example/dog.PNG) <img src="https://b.example/x.jpeg?w=2">`),
    ).toEqual(["https://a.example/dog.PNG", "https://b.example/x.jpeg?w=2"]);
  });

  it("finds URLs without an extension where Block Kit expects an image", () => {
    const json = JSON.stringify({
      image_url: "https://picsum.photos/400/300",
      icon: { image_url: "https://picsum.photos/36/36" },
      thumbnail_url: "https://thumbs.example/abc",
      provider_icon_url: "https://icons.example/yt",
    });
    expect(imageUrls(json)).toEqual([
      "https://picsum.photos/400/300",
      "https://picsum.photos/36/36",
      "https://thumbs.example/abc",
      "https://icons.example/yt",
    ]);
    expect(imageUrls(`avatarUrl: "https://avatars.example/u1",`)).toEqual([
      "https://avatars.example/u1",
    ]);
  });

  it("leaves links alone", () => {
    expect(
      imageUrls(
        '{"url": "https://slack.com", "title_url": "https://www.youtube.com/watch?v=x", "video_url": "https://www.youtube.com/embed/x"}',
      ),
    ).toEqual([]);
  });
});

describe("isAllowedImageUrl", () => {
  it("allows our samples and placeholder hosts", () => {
    for (const url of [
      BEAGLE,
      "https://example.com/a.png",
      "https://your-cdn.example.com/emoji/1f600.png",
      "https://files.example/taco.jpg",
      "https://images.test/x.png",
      "https://files.slack.com/files-pri/T0000-F0000/inspiration.png",
      "https://files.slack.com/files-pri/T0000001-F0000001/file",
      "http://localhost:5180/a.png",
    ]) {
      expect(isAllowedImageUrl(url), url).toBe(true);
    }
  });

  it("refuses third-party hosts, CI's previews and real Slack files", () => {
    for (const url of [
      "https://api.slack.com/img/blocks/bkb_template_images/beagle.png",
      "https://a.slack-edge.com/80588/img/unfurl_icons/youtube.png",
      "https://picsum.photos/400/300",
      "https://images.pexels.com/photos/257532/pexels-photo-257532.jpeg",
      "https://cdn.block-kit.dev/pr-12/abc/render.png",
      "https://files.slack.com/files-pri/T024BE7LD-F07ABCDEF12/photo.png",
      "https://example.com.evil.dev/a.png",
    ]) {
      expect(isAllowedImageUrl(url), url).toBe(false);
    }
  });
});

const committed = (path: string) => path === join(SAMPLES, "beagle.e3711bc4.jpg");

describe("checkSampleImages", () => {
  it("accepts committed samples and placeholders", () => {
    const sources = new Map([
      ["fixtures/a.json", `{"image_url": "${BEAGLE}"}`],
      ["apps/docs/docs/b.mdx", 'image_url: "https://example.com/a.png",'],
    ]);
    expect(checkSampleImages(sources, committed)).toEqual([]);
  });

  it("names every image on another host, and every sample that isn't committed", () => {
    const sources = new Map([
      [
        "fixtures/a.json",
        '{"image_url": "https://picsum.photos/36/36", "icon_url": "https://cdn.block-kit.dev/samples/gone.12345678.png"}',
      ],
    ]);
    expect(checkSampleImages(sources, committed)).toEqual([
      {
        file: "fixtures/a.json",
        url: "https://picsum.photos/36/36",
        message: "loads an image from picsum.photos; host it under cdn.block-kit.dev/samples/",
      },
      {
        file: "fixtures/a.json",
        url: "https://cdn.block-kit.dev/samples/gone.12345678.png",
        message: "has no committed copy at fixtures/assets/samples/gone.12345678.png",
      },
    ]);
  });
});

describe("the repository", () => {
  it("loads every sample image from cdn.block-kit.dev, with a committed copy of each", async () => {
    const sources = await readSampleSources();
    expect(sources.size).toBeGreaterThan(50);
    expect(checkSampleImages(sources)).toEqual([]);
  });

  it("scans fixtures, docs, the site, the playground, the agent skill and the package's tests", async () => {
    const files = [...(await readSampleSources()).keys()];
    for (const path of [
      "fixtures/extra/media/video.json",
      "apps/docs/docs/blocks/card.mdx",
      "apps/docs/islands/Preview.tsx",
      "apps/docs/skills/block-kit/SKILL.md",
      "apps/site/src/pages/index.astro",
      "apps/playground/src/RenderOnly.tsx",
      "packages/block-kit/src/blocks/Video.test.tsx",
      "packages/block-kit/README.md",
      "docs/README.md",
    ]) {
      expect(files).toContain(path);
    }
    expect(files.some((f) => f.endsWith(".reference.html"))).toBe(false);
    expect(files.some((f) => f.includes("node_modules/"))).toBe(false);
  });
});
