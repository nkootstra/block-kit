import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Json } from "../types";
import { Plan } from "./Plan";

/** Plan's block prop is narrowed beyond `Json`; tests build plain JSON fixtures and cast in. */
function asPlanBlock(value: object): ComponentProps<typeof Plan>["block"] {
  return value as ComponentProps<typeof Plan>["block"];
}

/** A plan whose tasks carry the given statuses, in order. */
function planOf(...statuses: string[]) {
  return asPlanBlock({
    type: "plan",
    title: "Plan",
    tasks: statuses.map((status, i) => ({ task_id: `t${i}`, title: `Task ${i}`, status })),
  });
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

/** The text of the header holding a task's title, hidden status text included. */
afterEach(cleanup);

describe("<Plan>", () => {
  it("starts collapsed, showing only the title as a single pill", () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    expect(screen.getByText("Demonstrating Plan Block Features")).toBeTruthy();
    expect(screen.queryByText("Fetching data")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it('marks its pill and expandable task headers aria-disabled="false", as Slack does', () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    const pill = screen.getByRole("button", { name: /Demonstrating Plan/ });
    expect(pill.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(pill);
    const header = screen.getByRole("button", { name: /^Fetching data/ });
    expect(header.getAttribute("aria-disabled")).toBe("false");
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

  it("keeps the tasks on screen while it animates shut, like Slack's height transition", () => {
    const style = document.head.appendChild(document.createElement("style"));
    style.textContent = ".sbk-collapse { transition-duration: 0.25s; }";
    try {
      render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
      const pill = screen.getByRole("button", { name: /Demonstrating Plan/ });
      fireEvent.click(pill);
      fireEvent.click(pill);
      const list = screen.getByText("Fetching data").closest(".sbk-collapse")!;
      expect(list).toBeTruthy();
      fireEvent.transitionEnd(list, { propertyName: "height" });
      expect(screen.queryByText("Fetching data")).toBeNull();
    } finally {
      style.remove();
    }
  });

  it("shows each task's details open, and hides them instantly when its header is pressed", () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Demonstrating Plan/ }));
    const header = screen.getByRole("button", { name: /^Fetching data/ });
    expect(header.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(header);
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Retrieving data")).toBeNull();
    expect(screen.queryByRole("link", { name: "Docs" })).toBeNull();

    fireEvent.click(header);
    expect(screen.getByText("Retrieving data")).toBeTruthy();
  });

  it("shows a task with nothing to reveal as a plain header, not a button, like Slack", () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Demonstrating Plan/ }));
    expect(screen.queryByRole("button", { name: /Organizing tasks/ })).toBeNull();
    const bare = screen.getByText("Organizing tasks").closest(".sbk-plan__task-header")!;
    expect(bare.tagName).toBe("DIV");
    expect(bare.hasAttribute("tabindex")).toBe(false);
    expect(bare.hasAttribute("aria-expanded")).toBe(false);
    expect(bare.hasAttribute("aria-disabled")).toBe(false);
    expect(bare.querySelector(".sbk-plan__task-caret")).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Fetching data/ }).querySelector(".sbk-plan__task-caret"),
    ).toBeTruthy();
  });

  it("announces each task's status, which the timeline only shows as an icon", () => {
    render(
      <Plan
        block={asPlanBlock({
          ...block,
          tasks: [
            ...block.tasks,
            { task_id: "task_4", title: "Publish", status: "error", details: richText("Oops") },
          ],
        })}
        blockId="b1"
        index={0}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Demonstrating Plan/ }));
    expect(
      screen.getByRole("button", { name: "Fetching data", description: "complete" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publish", description: "failed" })).toBeTruthy();
    // A task with nothing to reveal has no button; its list item carries the status.
    expect(
      screen.getByRole("listitem", { name: "Organizing tasks", description: "in progress" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("listitem", { name: "Display progress", description: "pending" }),
    ).toBeTruthy();
  });

  it("names each task by its title and describes it by its status and what it holds, as Slack does", () => {
    render(<Plan block={asPlanBlock(block)} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Demonstrating Plan/ }));
    expect(
      screen.getByRole("listitem", {
        name: "Fetching data",
        description: "complete Retrieving data Retrieved data Docs",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("listitem", { name: "Organizing tasks" })).toBeTruthy();
  });

  it("names its pill as Slack does and describes it by the plan's overall status", () => {
    render(<Plan block={planOf("complete", "error")} blockId="b1" index={0} />);
    const name = "Tasks performed: Plan";
    expect(screen.getByRole("button", { name, description: "failed" })).toBeTruthy();
    cleanup();
    render(<Plan block={planOf("complete", "pending")} blockId="b1" index={0} />);
    expect(screen.getByRole("button", { name, description: "in progress" })).toBeTruthy();
    cleanup();
    render(<Plan block={planOf("complete")} blockId="b1" index={0} />);
    expect(screen.getByRole("button", { name, description: "complete" })).toBeTruthy();
  });

  it("keeps the status text out of sight, so the plan looks the same", () => {
    const { container } = render(<Plan block={planOf("complete")} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Plan/ }));
    const hidden = container.querySelectorAll(".sbk-visually-hidden");
    expect([...hidden].map((el) => el.textContent)).toEqual(["complete", "complete"]);
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
  it("keeps the spinner while any task is unfinished, even after one failed", () => {
    const { container } = render(
      <Plan block={planOf("complete", "error", "pending")} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-status-icon--spinner")).toBeTruthy();
  });

  it("shows the warning icon once every task has finished and one failed", () => {
    const { container } = render(
      <Plan block={planOf("complete", "error")} blockId="b1" index={0} />,
    );
    expect(container.querySelector(".sbk-status-icon--error")).toBeTruthy();
  });

  it("marks finished and waiting steps with a small timeline dot, like Slack", () => {
    const { container } = render(
      <Plan block={planOf("complete", "pending")} blockId="b1" index={0} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Plan/ }));
    const icons = container.querySelectorAll(".sbk-plan__task-icon .sbk-status-icon--dot");
    expect(icons).toHaveLength(2);
  });
});

describe("expanded tasks", () => {
  afterEach(cleanup);

  it("are list items that take keyboard focus, as Slack's do", () => {
    render(<Plan block={planOf("complete", "in_progress")} blockId="b1" index={0} />);
    fireEvent.click(screen.getByRole("button", { name: /Plan/ }));
    const tasks = screen.getAllByRole("listitem");
    expect(tasks).toHaveLength(2);
    for (const task of tasks) {
      task.focus();
      expect(document.activeElement).toBe(task);
    }
  });
});
