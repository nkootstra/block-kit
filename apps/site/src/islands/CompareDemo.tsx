import { useCallback, useEffect, useRef, useState } from "react";
import { BLOCK_ENDS, FEATHER, PIXELS, REVEAL, SOURCE, TOKENS } from "../lib/proof";

/** One optimised image, as Astro's getImage() gives it. */
export interface ProofImage {
  src: string;
  srcSet: string;
  width: number;
  height: number;
}

/** Slack's capture, ours and their pixel diff, in one of Slack's themes. */
export interface ProofSet {
  slack: ProofImage;
  ours: ProofImage;
  diff: ProofImage;
}

// The intro, in ms, kept under the 5 seconds WCAG allows moving content before it needs a pause
// control. It starts from the finished comparison and ends on it.
const RESET = 350; // the message rolls up to its header and the editor clears
const TYPE = 1900; // the JSON types in; each block unrolls as its source closes
const WIPE = 1100; // the divider sweeps across Slack's capture and ours
const SCAN = 1350; // a scan runs down their pixel diff while the badge counts
const T_TYPE = RESET;
const T_WIPE = T_TYPE + TYPE;
const T_SCAN = T_WIPE + WIPE;
const END = T_SCAN + SCAN;
const SCAN_IN = 150;
const SCAN_RUN = 900;
const UNROLL = 260;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const progress = (t: number, start: number, length: number) => clamp((t - start) / length);
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

/** Characters of SOURCE typed at `t`. */
const typedAt = (t: number) =>
  t < T_TYPE || t >= T_WIPE
    ? SOURCE.length
    : Math.round(easeInOut(progress(t, T_TYPE, TYPE)) * SOURCE.length);

/** When each block's source closes, found by inverting the typing curve. */
const BLOCK_TIMES = BLOCK_ENDS.map((index) => {
  let lo = T_TYPE;
  let hi = T_WIPE;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (typedAt(mid) >= index) hi = mid;
    else lo = mid;
  }
  return hi;
});

const HEADER = REVEAL[0] ?? 0;

/** How much of block-kit's capture shows at `t`, as a fraction of its height. */
function revealedAt(t: number) {
  if (t >= T_WIPE) return 1;
  if (t < T_TYPE) return 1 - easeInOut(progress(t, 0, RESET)) * (1 - HEADER);
  return BLOCK_TIMES.reduce(
    (h, start, i) =>
      h + easeOut(progress(t, start, UNROLL)) * ((REVEAL[i + 1] ?? 1) - (REVEAL[i] ?? 1)),
    HEADER,
  );
}

/** The CSS custom properties the comparison is drawn from, at `t` of the intro. */
function frameAt(t: number) {
  const wiping = t >= T_WIPE && t < T_SCAN;
  const scanning = t >= T_SCAN && t < END;
  const scanned = easeInOut(progress(t, T_SCAN + SCAN_IN, SCAN_RUN));
  return {
    // Until the wipe only block-kit's capture shows, so the split sits at the left edge; the two
    // captures match, so the jump back to the middle when Slack's appears shows nothing.
    split:
      t < T_WIPE
        ? 0
        : wiping
          ? 50 - 30 * Math.sin(easeInOut(progress(t, T_WIPE, WIPE)) * 2 * Math.PI)
          : 50,
    reveal: revealedAt(t),
    slack: t < T_WIPE ? 0 : 1,
    line:
      t < T_WIPE
        ? 0
        : wiping
          ? progress(t, T_WIPE, 200)
          : scanning
            ? Math.max(1 - progress(t, T_SCAN, SCAN_IN), progress(t, END - 300, 300))
            : 1,
    scan: scanned,
    diff: scanning ? Math.min(progress(t, T_SCAN, SCAN_IN), 1 - progress(t, END - 300, 300)) : 0,
    scanLine: scanning
      ? Math.min(progress(t, T_SCAN, SCAN_IN), 1 - progress(t, T_SCAN + SCAN_IN + SCAN_RUN, 150))
      : 0,
    badge: t < T_SCAN ? 1 - progress(t, 0, 250) : easeOut(progress(t, T_SCAN, 250)),
    count: t < T_SCAN ? PIXELS : Math.round(scanned * PIXELS),
    code: t < T_TYPE ? 1 - progress(t, 0, 250) : 1,
  };
}

const FINISHED = frameAt(END);
const format = (n: number) => n.toLocaleString("en-US");

function Images({
  set,
  theme,
  diffOn,
}: {
  set: ProofSet;
  theme: "light" | "dark";
  diffOn: boolean;
}) {
  return (
    <div className="compare__set" data-compare-theme={theme}>
      <img
        className="compare__slack"
        src={set.slack.src}
        srcSet={set.slack.srcSet}
        width={set.slack.width}
        height={set.slack.height}
        alt={`Slack's own rendering of a deploy approval message, in its ${theme} theme`}
      />
      <div className="compare__top">
        <img
          src={set.ours.src}
          srcSet={set.ours.srcSet}
          width={set.ours.width}
          height={set.ours.height}
          alt="The same message rendered by block-kit"
          data-compare-ours
          hidden={diffOn}
        />
        <img
          src={set.diff.src}
          srcSet={set.diff.srcSet}
          width={set.diff.width}
          height={set.diff.height}
          alt="Pixel difference between the two renderings"
          data-compare-diff-image
          hidden={!diffOn}
        />
      </div>
      {/* The intro's scan: the diff over the part already scanned. */}
      <img
        className="compare__scanned"
        src={set.diff.src}
        srcSet={set.diff.srcSet}
        width={set.diff.width}
        height={set.diff.height}
        alt=""
        aria-hidden="true"
        data-compare-scan-image
      />
    </div>
  );
}

/**
 * "Check it against Slack": Slack's capture of a message and block-kit's, with a divider to drag
 * between them and their pixel diff. When it first scrolls into view it plays what the social card
 * shows: the message's JSON types in while block-kit's capture unrolls block by block, the divider
 * sweeps across, and a scan runs down the diff while the badge counts the matching pixels. Any
 * input stops the intro at once and leaves the comparison to the reader; with reduced motion it
 * doesn't play until Replay.
 */
export default function CompareDemo({ light, dark }: { light: ProofSet; dark: ProofSet }) {
  const compareRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  /** Set by the reader's first input, after which the intro never starts on its own. */
  const touched = useRef(false);
  const [typed, setTyped] = useState(SOURCE.length);
  const [diffOn, setDiffOn] = useState(false);
  const [playing, setPlaying] = useState(false);

  const setSplit = useCallback((percent: number) => {
    const value = Math.round(Math.min(100, Math.max(0, percent)));
    compareRef.current?.style.setProperty("--split", `${value}%`);
    const range = rangeRef.current;
    if (range) {
      range.value = String(value);
      range.setAttribute("aria-valuetext", `${value}% Slack, ${100 - value}% block-kit`);
    }
  }, []);

  /** Draws one frame of the intro. The slider follows the divider, rounded like a reader's. */
  const draw = useCallback((frame: ReturnType<typeof frameAt>) => {
    const el = compareRef.current;
    if (!el) return;
    el.style.setProperty("--reveal", String(frame.reveal));
    el.style.setProperty("--feather", String(FEATHER));
    el.style.setProperty("--slack", String(frame.slack));
    el.style.setProperty("--line", String(frame.line));
    el.style.setProperty("--scan", String(frame.scan));
    el.style.setProperty("--diff", String(frame.diff));
    el.style.setProperty("--scan-line", String(frame.scanLine));
    el.style.setProperty("--split", `${frame.split}%`);
    if (rangeRef.current) rangeRef.current.value = String(Math.round(frame.split));
    badgeRef.current?.style.setProperty("opacity", String(frame.badge));
    if (countRef.current) countRef.current.textContent = format(frame.count);
    codeRef.current?.style.setProperty("opacity", String(frame.code));
  }, []);

  /** Stops the intro where it is and shows the finished comparison. */
  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    compareRef.current?.classList.remove("compare--intro");
    draw(FINISHED);
    setSplit(50);
    setTyped(SOURCE.length);
    setPlaying(false);
  }, [draw, setSplit]);

  const play = useCallback(() => {
    const el = compareRef.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    setDiffOn(false);
    setPlaying(true);
    el.classList.add("compare--intro");
    // The scan shows the diff; decode it first so it doesn't pop in.
    for (const img of el.querySelectorAll<HTMLImageElement>("[data-compare-scan-image]")) {
      img.decode().catch(() => {});
    }
    let t = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // A hidden tab gets no frames; a long gap resumes where it left off rather than skipping.
      t += Math.min(now - last, 50);
      last = now;
      if (t >= END) return finish();
      const frame = frameAt(t);
      draw(frame);
      setTyped(typedAt(t));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [draw, finish]);

  // Plays once when the comparison is first well in view, unless the reader prefers less motion.
  useEffect(() => {
    const el = compareRef.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        if (!touched.current) play();
      },
      { threshold: 0.6 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [play]);

  // The reader's input: native listeners, so a value set from outside React (a test, an extension)
  // and its `input` event move the divider at once. Each stops the intro first.
  useEffect(() => {
    const el = compareRef.current;
    const range = rangeRef.current;
    if (!el || !range) return;
    const stop = () => {
      touched.current = true;
      if (raf.current) finish();
    };
    const fromPointer = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      setSplit(((event.clientX - rect.left) / rect.width) * 100);
    };
    const onInput = () => {
      // Read before stopping: finishing the intro puts the divider back in the middle.
      const value = Number(range.value);
      stop();
      setSplit(value);
    };
    const onDown = (event: PointerEvent) => {
      stop();
      el.setPointerCapture(event.pointerId);
      // A touch may be the start of a vertical scroll, which the browser cancels the pointer for
      // (touch-action: pan-y), so only a move drags. A mouse or pen click jumps there.
      if (event.pointerType !== "touch") fromPointer(event);
    };
    const onMove = (event: PointerEvent) => {
      if (el.hasPointerCapture(event.pointerId)) fromPointer(event);
    };
    range.addEventListener("input", onInput);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    return () => {
      range.removeEventListener("input", onInput);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
    };
  }, [finish, setSplit]);

  // The editor keeps the line being typed in view.
  const typedSource = SOURCE.slice(0, typed);
  const typedLines = typedSource.split("\n").length;

  return (
    <>
      <div className="proof-code" aria-hidden="true">
        <div className="proof-code__bar">
          <span className="proof-code__file">deploy-approval.ts</span>
        </div>
        <div className="proof-code__body" ref={codeRef}>
          <pre
            className="proof-code__pre"
            style={{
              transform: `translateY(calc(${-Math.max(0, typedLines - 8)} * var(--proof-line)))`,
            }}
          >
            {TOKENS.filter((tok) => tok.start < typed).map((tok) => (
              <span key={tok.start} className={`tok-${tok.kind}`}>
                {tok.text.slice(0, typed - tok.start)}
              </span>
            ))}
            {playing && <span className="proof-code__caret" />}
          </pre>
        </div>
      </div>
      <pre className="sr-only" aria-label="The message's Block Kit payload">
        {SOURCE}
      </pre>
      <div className="frame compare__frame">
        <div className="compare__legend" aria-hidden="true">
          <span>Slack</span>
          <span>block-kit</span>
        </div>
        <div className="compare" ref={compareRef} data-compare>
          {/* PNG, never a lossy format: this section is about matching pixels. One set per
              Slack theme; the stylesheet shows the one matching the page's theme. */}
          <Images set={light} theme="light" diffOn={diffOn} />
          <Images set={dark} theme="dark" diffOn={diffOn} />
          <div className="compare__line" aria-hidden="true">
            <span className="compare__handle" />
          </div>
          <div className="compare__scan" aria-hidden="true">
            <span>0 px different</span>
          </div>
        </div>
        {/* Directly under the image and as wide, so the thumb sits under the divider. */}
        <div className="compare__slider">
          <label htmlFor="split" className="sr-only">
            Divider
          </label>
          <input
            ref={rangeRef}
            id="split"
            type="range"
            min="0"
            max="100"
            defaultValue="50"
            aria-valuetext="50% Slack, 50% block-kit"
            data-compare-range
          />
        </div>
        <p className="compare__caption">
          <span data-compare-theme="light">Captured in Slack's light theme.</span>
          <span data-compare-theme="dark">Captured in Slack's dark theme.</span>
        </p>
      </div>
      <div className="compare__controls">
        <span className="compare__badge" ref={badgeRef}>
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="8" fill="currentColor" />
            <path
              d="M4.5 8.2l2.3 2.3 4.7-4.8"
              stroke="var(--bg)"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            <b ref={countRef}>{format(PIXELS)}</b> of {format(PIXELS)} pixels match Slack
          </span>
        </span>
        <button type="button" className="ghost" onClick={play} disabled={playing}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Replay
        </button>
        <button
          type="button"
          className="ghost"
          aria-pressed={diffOn}
          aria-describedby="compare-note"
          data-compare-diff
          onClick={() => {
            touched.current = true;
            if (raf.current) finish();
            setDiffOn((on) => !on);
          }}
        >
          Difference
        </button>
      </div>
      <p className="compare__note" id="compare-note" data-compare-note hidden={!diffOn}>
        Red would mark pixels that differ from Slack, yellow the ones that differ only in
        anti-aliasing. Here there are none.
      </p>
    </>
  );
}
