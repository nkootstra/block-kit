import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Carousel } from "./Carousel";

afterEach(cleanup);

describe("<Carousel>", () => {
  it("renders one card per element", () => {
    const block = {
      type: "carousel",
      elements: [
        { type: "card", title: { type: "plain_text", text: "First" } },
        { type: "card", title: { type: "plain_text", text: "Second" } },
      ],
    };
    render(<Carousel block={block as never} blockId="b1" index={0} />);
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
  });

  it("renders left/right scroll arrow buttons", () => {
    const block = { type: "carousel", elements: [] };
    render(<Carousel block={block as never} blockId="b1" index={0} />);
    expect(screen.getByRole("button", { name: "Scroll left" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scroll right" })).toBeTruthy();
  });

  it("hides the arrow for whichever end the row is scrolled to", () => {
    const block = { type: "carousel", elements: [] };
    const { container } = render(<Carousel block={block as never} blockId="b1" index={0} />);
    const scroller = container.querySelector(".sbk-carousel__scroller") as HTMLDivElement;
    const left = screen.getByRole("button", { name: "Scroll left" });
    const right = screen.getByRole("button", { name: "Scroll right" });
    Object.defineProperty(scroller, "scrollWidth", { value: 1000 });
    Object.defineProperty(scroller, "clientWidth", { value: 476 });

    fireEvent.scroll(scroller);
    expect(left.classList.contains("sbk-carousel__arrow--hidden")).toBe(true);
    expect((left as HTMLButtonElement).disabled).toBe(true);
    expect(right.classList.contains("sbk-carousel__arrow--hidden")).toBe(false);

    scroller.scrollLeft = 524;
    fireEvent.scroll(scroller);
    expect(left.classList.contains("sbk-carousel__arrow--hidden")).toBe(false);
    expect(right.classList.contains("sbk-carousel__arrow--hidden")).toBe(true);
    expect((right as HTMLButtonElement).disabled).toBe(true);
  });

  it("scrolls the row when an arrow is clicked", () => {
    const block = {
      type: "carousel",
      elements: [{ type: "card", title: { type: "plain_text", text: "Only" } }],
    };
    const { container } = render(<Carousel block={block as never} blockId="b1" index={0} />);
    const scroller = container.querySelector(".sbk-carousel__scroller") as HTMLDivElement;
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy;
    Object.defineProperty(scroller, "scrollWidth", { value: 1000 });
    Object.defineProperty(scroller, "clientWidth", { value: 476 });
    scroller.scrollLeft = 200;
    fireEvent.scroll(scroller);
    fireEvent.click(screen.getByRole("button", { name: "Scroll right" }));
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 356 }));
    fireEvent.click(screen.getByRole("button", { name: "Scroll left" }));
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: -356 }));
  });
});
