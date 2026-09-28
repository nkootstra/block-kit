/** Status glyphs shared by the plan/task_card blocks, matching Slack's status iconography. */
export type TaskStatus = "complete" | "in_progress" | "pending" | string;

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

export function CheckCircleIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      className="sbk-status-icon sbk-status-icon--complete"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M4.8 8.2L6.8 10.2L11.2 5.6"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PendingCircleIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      className="sbk-status-icon sbk-status-icon--pending"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2.5" />
    </svg>
  );
}

/** Picks the right status glyph for a task's status field. */
export function StatusIcon({ status, size }: { status: TaskStatus; size?: number }) {
  if (status === "complete") return <CheckCircleIcon size={size} />;
  if (status === "in_progress") return <SpinnerIcon size={size} />;
  return <PendingCircleIcon size={size} />;
}

/** Aggregate status for a plan's task list: in_progress if any task is running, else pending if any pending, else complete. */
export function aggregateStatus(statuses: TaskStatus[]): TaskStatus {
  if (statuses.some((s) => s === "in_progress")) return "in_progress";
  if (statuses.some((s) => s === "pending")) return "pending";
  return "complete";
}
