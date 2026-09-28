import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PieChart } from "./PieChart";

afterEach(cleanup);

describe("<PieChart>", () => {
  it("draws a lone segment as a plain disc, with no seam to the centre, like Slack", () => {
    const { container } = render(<PieChart segments={[{ label: "Free", value: 12 }]} />);
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    // Builder's own path for this pie.
    expect(paths[0]!.getAttribute("d")).toBe("M203 36A144 144 0 1 1 202.9856 36Z");
  });
});
