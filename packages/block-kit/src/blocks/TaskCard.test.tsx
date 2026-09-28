import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Json } from "../types";
import { TaskCard } from "./TaskCard";

/** TaskCard's block prop is narrowed beyond `Json`; tests build plain JSON fixtures and cast in. */
function asTaskCardBlock(value: object): ComponentProps<typeof TaskCard>["block"] {
  return value as ComponentProps<typeof TaskCard>["block"];
}

function richText(text: string): Json {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }],
  };
}

const block = {
  type: "task_card",
  task_id: "task_1",
  title: "Demonstrating Task Card Block Features",
  status: "in_progress",
  details: richText("Fetching data"),
  output: richText("This task card shows how timeline mode works"),
  sources: [
    { type: "url", url: "https://api.slack.com/a", text: "Thinking steps" },
    { type: "url", url: "https://api.slack.com/b", text: "Task card block" },
  ],
};

afterEach(cleanup);

describe("<TaskCard>", () => {
  it("starts collapsed as a single pill showing only the title", () => {
    render(<TaskCard block={asTaskCardBlock(block)} blockId="b1" index={0} />);
    expect(screen.getByText("Demonstrating Task Card Block Features")).toBeTruthy();
    expect(screen.queryByText("Fetching data")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("expands to reveal details, output and every source link", () => {
    render(<TaskCard block={asTaskCardBlock(block)} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Fetching data")).toBeTruthy();
    expect(screen.getByText("This task card shows how timeline mode works")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Thinking steps" }).getAttribute("href")).toBe(
      "https://api.slack.com/a",
    );
    expect(screen.getByRole("link", { name: "Task card block" }).getAttribute("href")).toBe(
      "https://api.slack.com/b",
    );
  });

  it("disables the toggle and drops the caret when there is nothing to expand, like Slack", () => {
    const bare = { type: "task_card", task_id: "t", title: "Bare task", status: "complete" };
    const { container } = render(<TaskCard block={asTaskCardBlock(bare)} blockId="b1" index={0} />);
    const toggle = screen.getByRole("button");
    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector(".sbk-task-card__pill-chevron")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows a spinner icon while the task is in progress", () => {
    const { container } = render(
      <TaskCard block={asTaskCardBlock(block)} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-status-icon--spinner")).toBeTruthy();
  });

  it("shows a check icon when the task is complete", () => {
    const done = { ...block, status: "complete" };
    const { container } = render(<TaskCard block={asTaskCardBlock(done)} blockId="b1" index={0} />);
    expect(container.querySelector(".sbk-status-icon--complete")).toBeTruthy();
  });

  it("shows Slack's warning icon when the task failed", () => {
    const failed = { ...block, status: "error" };
    const { container } = render(
      <TaskCard block={asTaskCardBlock(failed)} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-status-icon--error")).toBeTruthy();
  });

  it("renders a link element inline within rich_text details", () => {
    const withLink = {
      ...block,
      details: {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              { type: "text", text: "Fetching from " },
              { type: "link", url: "https://api.slack.com/partners", text: "Thinking Steps" },
            ],
          },
        ],
      },
    };
    render(<TaskCard block={asTaskCardBlock(withLink)} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("link", { name: "Thinking Steps" }).getAttribute("href")).toBe(
      "https://api.slack.com/partners",
    );
  });

  it("sets the output and sources beside a timeline dot, under the details, like Slack", () => {
    const { container } = render(
      <TaskCard block={asTaskCardBlock(block)} blockId="b1" index={0} />,
    );
    fireEvent.click(screen.getByRole("button"));
    const step = container.querySelector(".sbk-task-card__step")!;
    expect(step.querySelector(".sbk-status-icon--dot")).toBeTruthy();
    expect(step.textContent).toContain("This task card shows how timeline mode works");
    expect(step.textContent).toContain("Task card block");
    expect(step.textContent).not.toContain("Fetching data");
  });

  it("leaves out the timeline step when there are only details", () => {
    const detailsOnly = { ...block, output: undefined, sources: undefined };
    const { container } = render(
      <TaskCard block={asTaskCardBlock(detailsOnly)} blockId="b1" index={0} />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Fetching data")).toBeTruthy();
    expect(container.querySelector(".sbk-task-card__step")).toBeNull();
  });
});
