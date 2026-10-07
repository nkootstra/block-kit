import { describe, expect, it } from "bun:test";
import { cropBox, roomFor } from "./layout";

describe("open-state layout", () => {
  it("crops the message and its popover, on both sides, with one box relative to the message", () => {
    // Slack's calendar sticks out 110px to the left of the message; ours 2px further.
    const box = cropBox(
      [
        { x: 0, y: 0, width: 512, height: 82 },
        { x: -110, y: 24, width: 349, height: 372 },
      ],
      [
        { x: 0, y: 0, width: 512, height: 82 },
        { x: -112, y: 24, width: 349, height: 376 },
      ],
    );
    expect(box).toEqual({ x: -112, y: 0, width: 624, height: 400 });
  });

  it("is the message's own box when nothing is open", () => {
    expect(
      cropBox([{ x: 0, y: 0, width: 512, height: 82 }], [{ x: 0, y: 0, width: 476, height: 82 }]),
    ).toEqual({
      x: 0,
      y: 0,
      width: 512,
      height: 82,
    });
  });

  it("leaves room around our message for a popover that sticks out, so it isn't pushed inward", () => {
    // Our popovers keep 8px from the window's edges; the message moves right of the overhang.
    expect(roomFor([{ kind: "popover", x: -110, y: 24, width: 349, height: 372 }])).toEqual({
      left: 126,
      top: 16,
    });
    expect(roomFor([])).toEqual({ left: 0, top: 0 });
  });
});
