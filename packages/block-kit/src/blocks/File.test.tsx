import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { File } from "./File";

afterEach(cleanup);

describe("<File>", () => {
  it("renders the external id and remote source", () => {
    const block = { type: "file", external_id: "F0123456789", source: "remote" };
    render(<File block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("F0123456789")).toBeTruthy();
    expect(screen.getByText("remote file")).toBeTruthy();
  });

  it("falls back to a generic id/source when fields are missing", () => {
    const block = { type: "file" };
    render(<File block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("unknown")).toBeTruthy();
    expect(screen.getByText("remote file")).toBeTruthy();
  });
});
