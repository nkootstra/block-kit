/**
 * The checks behind a maintainer's `/preview` comment on a pull request (docs-preview.yml).
 *
 * In CI, `bun scripts/preview-command.ts` reads BODY, ROLE and USER_TYPE from the environment and
 * writes `command=true|false` and `allowed=true|false` to $GITHUB_OUTPUT.
 */
import { appendFileSync } from "node:fs";

/** The comment is exactly `/preview`, give or take surrounding whitespace. */
export function isPreviewCommand(body: string): boolean {
  return body.trim() === "/preview";
}

/**
 * Whether the commenter may deploy a preview, from their repository role as the collaborators API
 * reports it (`role_name`). The comment's `author_association` isn't enough: it says how someone
 * relates to the repository (a member of the owning organisation, a collaborator), not whether they
 * may push, and a collaborator can hold only the read or triage role.
 */
export function canDeployPreview({ role, userType }: { role: string; userType: string }): boolean {
  if (userType === "Bot") return false;
  return role === "admin" || role === "maintain" || role === "write";
}

if (import.meta.main) {
  const env = process.env;
  const command = isPreviewCommand(env.BODY ?? "");
  const allowed = canDeployPreview({ role: env.ROLE ?? "", userType: env.USER_TYPE ?? "" });
  if (env.GITHUB_OUTPUT) {
    appendFileSync(env.GITHUB_OUTPUT, `command=${command}\nallowed=${command && allowed}\n`);
  }
}
