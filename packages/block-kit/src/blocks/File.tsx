import type { BlockProps, Json } from "../types";

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path
        d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M15 2v5h5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * The `file` block only ever references a remote file by `external_id` (`source: "remote"`).
 * Slack resolves it via an app's `files.remote` integration, which we can't call, so this is a
 * generic placeholder card carrying the id — there's no Builder fixture to match against.
 */
export function File({ block }: BlockProps) {
  const json = block as Json;
  const externalId = typeof json.external_id === "string" ? json.external_id : "unknown";
  const source = typeof json.source === "string" ? json.source : "remote";

  return (
    <div className="sbk-file">
      <span className="sbk-file__icon">
        <FileIcon />
      </span>
      <div className="sbk-file__body">
        <span className="sbk-file__name">{externalId}</span>
        <span className="sbk-file__meta">{source} file</span>
      </div>
    </div>
  );
}
