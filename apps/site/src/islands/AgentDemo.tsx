import { BlockKitProvider, Message } from "@nkootstra/block-kit";
import type { AnyBlock } from "@slack/types";
import { useEffect, useRef, useState } from "react";

/** 2026-10-01 10:42 UTC, fixed so the server-rendered time matches the hydrated one. */
const TS = 1_790_851_320;

/**
 * Each task's title, how long it runs, and what it reports when it finishes. The next task starts
 * the moment one finishes, and the run stays under the 5 seconds WCAG allows auto-updating content
 * before it needs a pause control.
 */
const TASKS = [
  { title: "Run the test suite", ms: 1400, output: "412 passed in 38s" },
  { title: "Build and sign the bundle", ms: 1100, output: "web-0.14.0.tgz, signed" },
  { title: "Roll out to 10% of traffic", ms: 1700, output: "Error rate 0.02%, holding" },
];
const DONE = TASKS.length;
/** A beat after the plan opens (the package animates that over 250ms) before the first task starts. */
const FIRST_DELAY_MS = 400;

function text(value: string) {
  return {
    type: "rich_text",
    elements: [{ type: "rich_text_section", elements: [{ type: "text", text: value }] }],
  };
}

/** The message after `finished` tasks, with the next one running when `running` is set. */
function blocksAt(finished: number, running: boolean): AnyBlock[] {
  const blocks: Record<string, unknown>[] = [
    { type: "section", text: { type: "mrkdwn", text: "Releasing *v0.14.0* of the web app." } },
    {
      type: "plan",
      title: "Release plan",
      tasks: TASKS.map((task, i) => ({
        task_id: `task_${i + 1}`,
        title: task.title,
        status: i < finished ? "complete" : i === finished && running ? "in_progress" : "pending",
        ...(i < finished ? { output: text(task.output) } : {}),
      })),
    },
  ];
  if (finished >= DONE) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "View release" },
          action_id: "view_release",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Roll back" },
          action_id: "roll_back",
        },
      ],
    });
  }
  // `plan` is newer than @slack/types, so it isn't one of its block types yet.
  return blocks as unknown as AnyBlock[];
}

/** A deploy bot's message that works through its plan, then offers its buttons. */
export default function AgentDemo() {
  const [finished, setFinished] = useState(0);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // Each run plays while the message is on screen and the tab is visible, and pauses otherwise, so
  // nobody scrolls back to a demo that finished without them.
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    // Slack shows a plan collapsed until someone opens it. Open it the way a reader would, on every
    // run, so the steps are visible even if the reader collapsed it.
    el.querySelector<HTMLButtonElement>('.sbk-plan__pill[aria-expanded="false"]')?.click();

    // With reduced motion the plan starts finished; Replay still steps through it.
    if (run === 0 && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFinished(DONE);
      setRunning(false);
      return;
    }

    let done = 0;
    let started = false;
    let visible = false;
    let timer: number | undefined;
    setFinished(0);
    setRunning(false);

    const next = () => {
      timer = window.setTimeout(() => {
        timer = undefined;
        done += 1;
        setFinished(done);
        if (done < DONE) next();
        else setRunning(false);
      }, TASKS[done]?.ms);
    };
    const resume = () => {
      if (!visible || document.hidden || done >= DONE || timer !== undefined) return;
      if (started) return next();
      started = true;
      // Replay is a click, so it answers at once; the first view waits for the plan to open.
      timer = window.setTimeout(
        () => {
          timer = undefined;
          setRunning(true);
          next();
        },
        run === 0 ? FIRST_DELAY_MS : 0,
      );
    };
    const pause = () => {
      window.clearTimeout(timer);
      timer = undefined;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible) resume();
        else pause();
      },
      { threshold: 0.6 },
    );
    const onVisibility = () => (document.hidden ? pause() : resume());
    observer.observe(el);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      pause();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [run]);

  return (
    <div className="demo">
      <figure className="demo__figure">
        <div ref={root} className="frame frame--raised">
          <div className="frame__stage">
            <BlockKitProvider timeZone="UTC">
              <Message
                app={{ name: "Deploy bot" }}
                ts={TS}
                timeZone="UTC"
                blocks={blocksAt(finished, running)}
              />
            </BlockKitProvider>
          </div>
        </div>
        <figcaption className="demo__caption">
          <span>
            A <code>plan</code> block updating as its tasks finish, rendered live by block-kit.
          </span>
        </figcaption>
      </figure>
      <button type="button" className="ghost demo__replay" onClick={() => setRun((r) => r + 1)}>
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
    </div>
  );
}
