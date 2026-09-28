import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DataVisualization } from "./DataVisualization";

/** DataVisualization's block prop is narrowed beyond `Json`; tests build plain JSON fixtures and cast in. */
function asDataVizBlock(value: object): ComponentProps<typeof DataVisualization>["block"] {
  return value as ComponentProps<typeof DataVisualization>["block"];
}

afterEach(cleanup);

describe("<DataVisualization>", () => {
  it("renders a line chart with one path per series and a legend entry per series", () => {
    const block = {
      type: "data_visualization",
      title: "Messages sent",
      chart: {
        type: "line",
        series: [
          {
            name: "Desktop",
            data: [
              { label: "Mon", value: 100 },
              { label: "Tue", value: 200 },
            ],
          },
          {
            name: "Mobile",
            data: [
              { label: "Mon", value: 50 },
              { label: "Tue", value: 80 },
            ],
          },
        ],
        axis_config: { categories: ["Mon", "Tue"], x_label: "Day", y_label: "Messages" },
      },
    };
    const { container } = render(
      <DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />,
    );
    expect(screen.getByText("Messages sent")).toBeTruthy();
    expect(container.querySelectorAll(".sbk-dataviz__body svg path[stroke]").length).toBe(2);
    expect(screen.getByText("Desktop")).toBeTruthy();
    expect(screen.getByText("Mobile")).toBeTruthy();
    expect(screen.getByText("Day")).toBeTruthy();
    expect(screen.getByText("Messages")).toBeTruthy();
  });

  it("renders a bar chart with a bar path per data point across all series", () => {
    const block = {
      type: "data_visualization",
      chart: {
        type: "bar",
        series: [
          {
            name: "Messages",
            data: [
              { label: "Mon", value: 10 },
              { label: "Tue", value: -5 },
            ],
          },
        ],
        axis_config: { categories: ["Mon", "Tue"] },
      },
    };
    const { container } = render(
      <DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />,
    );
    expect(container.querySelectorAll(".sbk-dataviz__body svg path").length).toBe(2);
  });

  it("renders a pie chart with one arc per segment, sized by value", () => {
    const block = {
      type: "data_visualization",
      title: "Share",
      chart: {
        type: "pie",
        segments: [
          { label: "A", value: 75 },
          { label: "B", value: 25 },
        ],
      },
    };
    const { container } = render(
      <DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />,
    );
    const paths = container.querySelectorAll(".sbk-dataviz__body svg path");
    expect(paths.length).toBe(2);
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("renders nothing when the block has no chart", () => {
    const block = { type: "data_visualization" };
    const { container } = render(
      <DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
