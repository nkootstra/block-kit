import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Json } from "../types";
import { Plan } from "./Plan";

/** Plan's block prop is narrowed beyond `Json`; tests build plain JSON fixtures and cast in. */
function asPlanBlock(value: object): ComponentProps<typeof Plan>["block"] {
  return value as ComponentProps<typeof Plan>["block"];
}

function richText(text: string): Json {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  };
}

const block = {
  type: "plan",
  plan_id: "plan_1",
  title: "Demonstrating Plan Block Features",
  tasks: [
    {
      task_id: "task_1",
      title: "Fetching data",
      status: "complete",
      details: richText("Retrieving data"),
      output: richText("Retrieved data"),
      sources: [{ type: "url", url: "https://api.slack.com/a", text: "Docs" }],
    },
    {
      task_id: "task_2",
      title: "Organizing tasks",
      status: "in_progress",
    },
    {
      task_id: "task_3",
      title: "Display progress",
      status: "pending",
    },
  ],
};

afterEach(cleanup);

describe("<Plan>", () => {
  it("starts collapsed, showing only the title as a single pill", () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    expect(screen.getByText("Demonstrating Plan Block Features")).toBeTruthy();
    expect(screen.queryByText("Fetching data")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("expands to show every task with its details, output and sources", () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Demonstrating Plan/ }));
    expect(screen.getByText("Fetching data")).toBeTruthy();
    expect(screen.getByText("Organizing tasks")).toBeTruthy();
    expect(screen.getByText("Display progress")).toBeTruthy();
    expect(screen.getByText("Retrieving data")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Docs" }).getAttribute("href")).toBe(
      "https://api.slack.com/a",
    );
  });

  it("collapses again on a second click", () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    const pill = screen.getByRole("button", { name: /Demonstrating Plan/ });
    fireEvent.click(pill);
    fireEvent.click(pill);
    expect(screen.queryByText("Fetching data")).toBeNull();
  });

  it("treats the plan as in progress overall when any task is still running", () => {
    const { container } = render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-status-icon--spinner")).toBeTruthy();
  });

  it("treats a plan with only complete tasks as complete overall", () => {
    const allDone = {
      ...block,
      tasks: block.tasks.map((t) => ({ ...t, status: "complete" })),
    };
    const { container } = render(<Plan block={asPlanBlock(allDone)} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-status-icon--complete")).toBeTruthy();
    expect(container.querySelector(".sbk-status-icon--spinner")).toBeNull();
  });
});
