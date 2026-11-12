import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataVisualization } from "./DataVisualization";

/** DataVisualization's block prop is narrowed beyond `Json`; tests build plain JSON fixtures and cast in. */
function asDataVizBlock(value: object): ComponentProps<typeof DataVisualization>["block"] {
  return value as ComponentProps<typeof DataVisualization>["block"];
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
    expect(container.querySelectorAll(".sbk-dataviz__body .sbk-chart__line").length).toBe(2);
    expect(screen.getByText("Desktop")).toBeTruthy();
    expect(screen.getByText("Mobile")).toBeTruthy();
    expect(screen.getByText("Day")).toBeTruthy();
    expect(screen.getByText("Messages")).toBeTruthy();
  });

  it("ends a line chart's plot 3px plus half its last label short of the edge", () => {
    // Slack (ECharts) keeps the last category label 3px inside the chart: "Fri", 14.6444px wide in
    // 13px Lato, puts the last point at 406 - 3 - 7.3222 (extra/charts/area-twelve-series).
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            font: "",
            measureText: (text: string) => ({ width: text === "Fri" ? 14.6444 : 20 }),
          };
        }
      },
    );
    const block = {
      type: "data_visualization",
      chart: {
        type: "line",
        series: [
          {
            name: "Messages",
            data: ["Mon", "Tue", "Wed", "Thu", "Fri"].map((label) => ({ label, value: 1 })),
          },
        ],
        axis_config: { categories: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
      },
    };
    render(<DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />);
    expect(screen.getByText("Fri").getAttribute("transform")).toBe("translate(395.6778 342)");
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

  it("draws at most Slack's 20 points of a series, however many the payload holds", () => {
    const n = 40_000;
    const block = {
      type: "data_visualization",
      chart: {
        type: "bar",
        axis_config: { categories: Array.from({ length: n }, (_, i) => String(i)) },
        series: [
          {
            name: "s",
            data: Array.from({ length: n }, (_, i) => ({ label: String(i), value: i })),
          },
        ],
      },
    };
    const start = performance.now();
    const { container } = render(
      <DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />,
    );
    expect(performance.now() - start).toBeLessThan(1000);
    expect(container.querySelectorAll(".sbk-dataviz__body svg path").length).toBe(20);
  });

  it("draws at most Slack's 12 series and 12 pie segments", () => {
    const series = Array.from({ length: 30 }, (_, i) => ({
      name: `s${i}`,
      data: [{ label: "a", value: i + 1 }],
    }));
    const segments = Array.from({ length: 30 }, (_, i) => ({ label: `p${i}`, value: i + 1 }));
    const { container } = render(
      <>
        <DataVisualization
          block={asDataVizBlock({ type: "data_visualization", chart: { type: "line", series } })}
          blockId="b1"
          index={0}
        />
        <DataVisualization
          block={asDataVizBlock({ type: "data_visualization", chart: { type: "pie", segments } })}
          blockId="b2"
          index={1}
        />
      </>,
    );
    expect(container.querySelectorAll(".sbk-dataviz__legend-entry").length).toBe(24);
    expect(screen.queryByText("s12")).toBeNull();
    expect(screen.queryByText("p12")).toBeNull();
  });

  it("renders nothing when the block has no chart", () => {
    const block = { type: "data_visualization" };
    const { container } = render(
      <DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // `extra/fidelity/data-visualization/many-items`: 20 categories don't fit side by side, so Slack
  // turns their labels 45°; five do.
  it.each([
    [20, true],
    [5, false],
  ])("with %i categories, turns the labels: %s", (count, turned) => {
    const data = Array.from({ length: count }, (_, i) => ({ label: `D${i + 1}`, value: i }));
    const block = {
      type: "data_visualization",
      chart: { type: "bar", series: [{ name: "Requests", data }] },
    };
    const { container } = render(
      <DataVisualization block={asDataVizBlock(block)} blockId="b1" index={0} />,
    );
    const label = screen.getByText("D1", { selector: "text" });
    expect(label.getAttribute("transform")?.includes("rotate(-45)")).toBe(turned);
    expect(container.querySelector(".sbk-chart--rotated") !== null).toBe(turned);
  });
});
