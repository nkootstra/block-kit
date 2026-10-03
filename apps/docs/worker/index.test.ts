import { describe, expect, test } from "bun:test";
import worker, { markdownUrlFor, prefers } from "./index";

const site = "https://block-kit.kootstra.io";

const files: Record<string, [body: string, contentType: string]> = {
  "/": ["<!doctype html>home", "text/html"],
  "/index.md": ["# Home", "text/markdown; charset=utf-8"],
  "/blocks/section": ["<!doctype html>section", "text/html"],
  "/blocks/section.md": ["# Section", "text/markdown; charset=utf-8"],
  "/no-twin": ["<!doctype html>no twin", "text/html"],
  "/api/docs/pages.json": ['{"pages":[]}', "application/json"],
  "/404.md": ["# Page not found", "text/markdown; charset=utf-8"],
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

// A JSON-RPC call to the MCP server, which answers from the snapshot `scripts/mcp.ts` writes
// into the build.
function call(method: string, params: object = {}) {
  return worker.fetch(
    new Request(`${site}/mcp`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    env,
  );
}

const browser = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

describe("prefers", () => {
  test("ignores browsers and missing headers", () => {
    expect(prefers("text/markdown", null)).toBe(false);
    expect(prefers("text/markdown", browser)).toBe(false);
    expect(prefers("application/json", browser)).toBe(false);
  });

  test("honors a type ranked at or above HTML", () => {
    expect(prefers("text/markdown", "text/markdown")).toBe(true);
    expect(prefers("text/markdown", "text/markdown, text/html;q=0.9")).toBe(true);
    expect(prefers("text/markdown", "text/html, text/markdown")).toBe(true);
    expect(prefers("text/markdown", "text/html, text/markdown;q=0.5")).toBe(false);
    expect(prefers("text/markdown", "text/markdown;q=0")).toBe(false);
    expect(prefers("application/json", "application/json")).toBe(true);
  });
});

describe("markdownUrlFor", () => {
  test("maps pages to their .md twin", () => {
    expect(markdownUrlFor(new Request(`${site}/blocks/section`))?.pathname).toBe(
      "/blocks/section.md",
    );
    expect(markdownUrlFor(new Request(`${site}/blocks/section/?x=1`))?.href).toBe(
      `${site}/blocks/section.md`,
    );
    expect(markdownUrlFor(new Request(`${site}/`))?.pathname).toBe("/index.md");
  });

  test("leaves files alone", () => {
    expect(markdownUrlFor(new Request(`${site}/sitemap.xml`))).toBeNull();
    expect(markdownUrlFor(new Request(`${site}/blocks/section.md`))).toBeNull();
  });
});

describe("pages", () => {
  test("serve Markdown to an agent that asks for it", async () => {
    const response = await get("/blocks/section", "text/markdown");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toStartWith("text/markdown");
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(await response.text()).toBe("# Section");
  });

  test("serve the home page's Markdown", async () => {
    expect(await (await get("/", "text/markdown")).text()).toBe("# Home");
  });

  test("serve HTML to a browser, varying on Accept", async () => {
    const response = await get("/", browser);
    expect(response.headers.get("Content-Type")).toBe("text/html");
    expect(response.headers.get("Vary")).toContain("Accept");
  });

  test("fall back to HTML when a page has no Markdown twin", async () => {
    const response = await get("/no-twin", "text/markdown");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html");
  });

  test("pass the docs API through", async () => {
    const response = await get("/api/docs/pages.json");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('{"pages":[]}');
  });
});

describe("missing pages", () => {
  test("answer a browser with the HTML 404 page", async () => {
    const response = await get("/nope", browser);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/html");
  });

  test("answer an agent asking for Markdown with the Markdown 404", async () => {
    const response = await get("/nope", "text/markdown");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Vary")).toContain("Accept");
    expect(await response.text()).toBe("# Page not found");
  });

  test("answer an agent asking for JSON with a problem document", async () => {
    const response = await get("/nope", "application/json");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    expect(await response.json()).toEqual({ status: 404, code: "PAGE_NOT_FOUND" });
  });

  test("answer the docs API with a problem document whatever the Accept header", async () => {
    for (const path of ["/api/docs/pages/nope.json", "/api/nope"]) {
      const response = await get(path, browser);
      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe("application/problem+json");
    }
  });

  test("answer a missing .md URL with the Markdown 404", async () => {
    const response = await get("/nope.md");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
  });

  test("send no body for HEAD", async () => {
    const response = await get("/nope", "text/markdown", "HEAD");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });
});

test("leaves non-GET requests to the assets", async () => {
  const response = await get("/blocks/section", "text/markdown", "POST");
  expect(response.headers.get("Content-Type")).toBe("text/html");
});

describe("MCP server", () => {
  test("lists the docs tools", async () => {
    const { result } = await (await call("tools/list")).json();
    expect(result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search_docs",
      "get_page",
      "list_pages",
      "get_navigation",
    ]);
  });

  test("returns a page's Markdown", async () => {
    const response = await call("tools/call", {
      name: "get_page",
      arguments: { route: "/quickstart" },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const { result } = await response.json();
    expect(result.content[0].text).toStartWith("---\ntitle: Quickstart");
  });

  test("searches the docs", async () => {
    const { result } = await (
      await call("tools/call", { name: "search_docs", arguments: { query: "button" } })
    ).json();
    expect(JSON.parse(result.content[0].text)).toContainEqual(
      expect.objectContaining({ route: "/elements/button" }),
    );
  });
});

describe("Previews", () => {
  test("tell search engines not to index any response", async () => {
    for (const [path, accept] of [
      ["/", browser],
      ["/nope", "text/markdown"],
    ] as const) {
      const response = await worker.fetch(
        new Request(`${site}${path}`, { headers: { Accept: accept } }),
        {
          ...env,
          ROBOTS: "noindex",
        },
      );
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    }
  });

  test("leave production indexable", async () => {
    expect((await get("/", browser)).headers.get("X-Robots-Tag")).toBeNull();
  });
});
