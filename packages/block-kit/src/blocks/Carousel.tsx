import { useEffect, useRef, useState } from "react";
import { CaretIcon } from "../data/icons";
import type { BlockProps, Json } from "../types";
import { Card } from "./Card";

/** A horizontally-scrolling row of cards, with arrow buttons that page by one card width. */
export function Carousel({ block }: BlockProps) {
  const elements = ((block as Json).elements as Json[] | undefined) ?? [];
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Slack fades an arrow out once there is nothing left to scroll towards.
  const [edges, setEdges] = useState({ start: true, end: false });

  const updateEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const start = el.scrollLeft <= 1;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  };

  useEffect(updateEdges, [elements.length]);

  const scrollBy = (dx: number) => {
    scrollerRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  };

  const arrowClass = (side: "left" | "right", hidden: boolean) =>
    `sbk-carousel__arrow sbk-carousel__arrow--${side}${hidden ? " sbk-carousel__arrow--hidden" : ""}`;

  return (
    <div className="sbk-carousel">
      <div className="sbk-carousel__scroller" ref={scrollerRef} onScroll={updateEdges}>
        {elements.map((card, i) => (
          <div className="sbk-carousel__item" key={(card.block_id as string | undefined) ?? i}>
            <Card
              block={card}
              blockId={(card.block_id as string) ?? `carousel-card-${i}`}
              index={i}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        className={arrowClass("left", edges.start)}
        aria-label="Scroll left"
        disabled={edges.start}
        onClick={() => scrollBy(-356)}
      >
        <CaretIcon direction="left" size={20} />
      </button>
      <button
        type="button"
        className={arrowClass("right", edges.end)}
        aria-label="Scroll right"
        disabled={edges.end}
        onClick={() => scrollBy(356)}
      >
        <CaretIcon direction="right" size={20} />
      </button>
    </div>
  );
}
