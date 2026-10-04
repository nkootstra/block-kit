/** Status glyphs shared by the plan/task_card blocks, matching Slack's status iconography. */
export type TaskStatus = "complete" | "in_progress" | "pending" | "error" | string;

/**
 * Slack's `c-infinite_spinner`: two stacked arcs (head + tail) rotating on slightly different
 * easing curves, so the arc appears to stretch and shrink as it spins.
 */
export function SpinnerIcon({ size = 12 }: { size?: number }) {
  return (
    <span
      className="sbk-status-icon sbk-status-icon--spinner sbk-spinner"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg className="sbk-spinner__arc" viewBox="0 0 100 100">
        <circle className="sbk-spinner__bg" cx="50%" cy="50%" r="35" />
        <circle className="sbk-spinner__path" cx="50%" cy="50%" r="35" />
      </svg>
      <svg className="sbk-spinner__arc sbk-spinner__tail" viewBox="0 0 100 100">
        <circle className="sbk-spinner__path" cx="50%" cy="50%" r="35" />
      </svg>
    </span>
  );
}

/** Slack's filled check-circle, 13px on the toggle bar. */
export function CheckCircleIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      className="sbk-status-icon sbk-status-icon--complete"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 19a9 9 0 1 0 0-18 9 9 0 0 0 0 18m3.722-11.315a.75.75 0 1 0-1.144-.97l-4.125 4.863-1.141-1.611a.75.75 0 1 0-1.224.867l1.7 2.4a.75.75 0 0 0 1.184.051z"
      />
    </svg>
  );
}

/** Slack's warning triangle for a failed task. */
export function ErrorIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      className="sbk-status-icon sbk-status-icon--error"
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.712 3.542c1.02-1.723 3.556-1.723 4.576 0l6.1 10.303c1.043 1.76-.28 3.905-2.287 3.905H3.9c-2.008 0-3.331-2.144-2.288-3.905zM10 12.75a1 1 0 1 0 0 2 1 1 0 0 0 0-2m0-6a.75.75 0 0 0-.75.75V11a.75.75 0 0 0 1.5 0V7.5a.75.75 0 0 0-.75-.75"
      />
    </svg>
  );
}

/** The 5px dot Slack's plan timeline puts on a finished or waiting step. */
export function DotIcon({ status }: { status: TaskStatus }) {
  return (
    <svg
      className={`sbk-status-icon sbk-status-icon--dot${status === "complete" ? " sbk-status-icon--dot-complete" : ""}`}
      viewBox="0 0 20 20"
      width={5}
      height={5}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0" />
    </svg>
  );
}

/** How a status reads aloud. The icons are hidden from assistive technology, so this stands in. */
const STATUS_LABELS: Record<string, string> = {
  complete: "complete",
  in_progress: "in progress",
  pending: "pending",
  error: "failed",
};

/**
 * A status as text that only screen readers get, set after a title (", in progress"), so a toggle
 * or task header is announced with the state its icon shows. An unknown status says nothing.
 */
export function StatusText({ status }: { status: TaskStatus }) {
  const label = STATUS_LABELS[status];
  return label ? <span className="sbk-visually-hidden">{`, ${label}`}</span> : null;
}

/** The glyph on a toggle bar (the plan's or a task_card's): check, warning or spinner. */
export function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "complete") return <CheckCircleIcon />;
  if (status === "error") return <ErrorIcon />;
  return <SpinnerIcon />;
}

/** One step on the plan's timeline: a dot once finished or while waiting, else as on the toggle. */
export function TimelineIcon({ status }: { status: TaskStatus }) {
  if (status === "in_progress") return <SpinnerIcon />;
  if (status === "error") return <ErrorIcon />;
  return <DotIcon status={status} />;
}

/**
 * The plan's overall status, as Slack shows it: still running while any task is unfinished, then
 * failed if any task failed, else complete.
 */
export function aggregateStatus(statuses: TaskStatus[]): TaskStatus {
  if (statuses.some((s) => s !== "complete" && s !== "error")) return "in_progress";
  if (statuses.includes("error")) return "error";
  return "complete";
}
