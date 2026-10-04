import { describe, expect, test } from "bun:test";
import { homeMarkdown, notFoundMarkdown, notFoundProblem } from "./markdown";
import { BLOCKS, INSTALL, title } from "./site";

describe("homeMarkdown", () => {
  const md = homeMarkdown();

  test("opens with the page title as its heading", () => {
    expect(md.startsWith(`# ${title}\n`)).toBe(true);
  });

  test("lists every install command and every block", () => {
    for (const { command } of INSTALL) expect(md).toContain(command);
    for (const type of BLOCKS) expect(md).toContain(`[\`${type}\`]`);
  });
});

test("notFoundMarkdown explains the error and links to the docs, llms.txt and sitemap", () => {
  const md = notFoundMarkdown();
  expect(md.length).toBeGreaterThan(20);
  expect(md).toContain("https://docs.block-kit.dev");
  expect(md).toContain("/llms.txt");
  expect(md).toContain("/sitemap.xml");
});

test("notFoundProblem is an RFC 9457 problem document with a code and a hint", () => {
  const problem = notFoundProblem();
  expect(problem).toMatchObject({ type: "about:blank", title: "Not Found", status: 404 });
  expect(problem.code).toBe("PAGE_NOT_FOUND");
  expect(problem.hint).toContain("https://docs.block-kit.dev");
});
