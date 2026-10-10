import { describe, expect, test } from "bun:test";
import worker, { markdownUrlFor, prefers } from "./index";

const site = "https://block-kit.dev";

const files: Record<string, [body: string, contentType: string]> = {
  "/": ["<!doctype html>home", "text/html"],
  "/index.md": ["# Slack Block Kit for React", "text/plain"],
  "/llms.txt": ["# block-kit", "text/plain"],
  "/404.md": ["# Page not found", "text/plain"],
  "/404.json": ['{"status":404,"code":"PAGE_NOT_FOUND"}', "application/json"],
};

const env = {
  ASSETS: {
    async fetch(request: Request) {
      const file = files[new URL(request.url).pathname];
      if (!file) {
        return new Response("<!doctype html>404", {
          status: 404,
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response(file[0], { headers: { "Content-Type": file[1] } });
    },
  },
};

function get(path: string, accept?: string, method = "GET") {
  return worker.fetch(
    new Request(`${site}${path}`, { method, headers: accept ? { Accept: accept } : {} }),
    env,
  );
}

const browser = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

describe("home page", () => {
  test("serves Markdown to a client that asks for it", async () => {
    const response = await get("/", "text/markdown");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(await response.text()).toBe("# Slack Block Kit for React");
  });

  test("serves HTML to a browser, varying on Accept", async () => {
    const response = await get("/", browser);
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(await response.text()).toBe("<!doctype html>home");
  });

  test("serves HTML when Markdown ranks below HTML", async () => {
    const response = await get("/", "text/html, text/markdown;q=0.5");
    expect(response.headers.get("Content-Type")).toBe("text/html");
  });

  test("answers HEAD for Markdown without a body", async () => {
    const response = await get("/", "text/markdown", "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.body).toBeNull();
  });
});

describe("home page Link header", () => {
  const catalog =
    '<https://docs.block-kit.dev/.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json; profile=\\"https://www.rfc-editor.org/info/rfc9727\\""';

  test("names llms.txt, the API catalog and the Markdown copy on the HTML page", async () => {
    const link = (await get("/", browser)).headers.get("Link");
    expect(link).toContain('</llms.txt>; rel="describedby"; type="text/plain"');
    expect(link).toContain(catalog);
    expect(link).toContain('</index.md>; rel="alternate"; type="text/markdown"');
  });

  test("names the HTML page as canonical on the Markdown copy", async () => {
    const link = (await get("/", "text/markdown")).headers.get("Link");
    expect(link).toContain(catalog);
    expect(link).toContain('<https://block-kit.dev/>; rel="canonical"');
    expect(link).not.toContain('rel="alternate"');
  });

  test("is left off other responses", async () => {
    expect((await get("/nope", browser)).headers.get("Link")).toBeNull();
    expect((await get("/llms.txt")).headers.get("Link")).toBeNull();
  });
});

describe("missing pages", () => {
  test("answer a browser with the HTML 404 page", async () => {
    const response = await get("/nope", browser);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html");
  });

  test("answer Markdown with a Markdown 404", async () => {
    const response = await get("/nope", "text/markdown");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(await response.text()).toBe("# Page not found");
  });

  test("answer JSON with a problem document", async () => {
    for (const [path, accept] of [
      ["/nope", "application/json"],
      ["/nope", "application/problem+json"],
      ["/api/thing.json", undefined],
    ] as const) {
      const response = await get(path, accept);
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe("application/problem+json");
      expect(await response.json()).toEqual({ status: 404, code: "PAGE_NOT_FOUND" });
    }
  });
});

test("passes other files through untouched", async () => {
  const response = await get("/llms.txt", "text/markdown");
  expect(await response.text()).toBe("# block-kit");
});

test("markdownUrlFor maps pages to their .md twin and skips files", () => {
  const url = (path: string) => markdownUrlFor(new Request(`${site}${path}`))?.pathname ?? null;
  expect(url("/")).toBe("/index.md");
  expect(url("/about/")).toBe("/about.md");
  expect(url("/og.png")).toBeNull();
});

test("prefers needs the type named at least as strongly as HTML", () => {
  expect(prefers("text/markdown", "text/markdown")).toBe(true);
  expect(prefers("text/markdown", "text/markdown, text/html")).toBe(true);
  expect(prefers("text/markdown", browser)).toBe(false);
  expect(prefers("text/markdown", null)).toBe(false);
});
