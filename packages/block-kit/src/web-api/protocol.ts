import type { WebApiChannel, WebApiUser, WebApiUsergroup } from "./client";

// The wire format between `httpResolverClient` (browser) and `createResolverRelay` (server).

/**
 * POSTed as JSON. User and channel ids are looked up with `users.info` and `conversations.info`.
 * The Web API can't look a user group up by id, so the relay lists them with `usergroups.list` on
 * the server and returns only the ids asked for: the page can't list every group.
 */
export interface ResolveRequest {
  users?: string[];
  channels?: string[];
  usergroups?: string[];
}

/** Each requested id maps to its allowlisted fields, or `null` when Slack doesn't know it. */
export interface ResolveResponse {
  users?: Record<string, WebApiUser | null>;
  channels?: Record<string, WebApiChannel | null>;
  usergroups?: Record<string, WebApiUsergroup | null>;
}

/** The most ids one request may ask for, and the default `maxIds`. */
export const MAX_RESOLVE_IDS = 100;

export const USER_ID = /^[UW][A-Z0-9]{8,20}$/;
// Direct messages have no name to resolve, so `D` ids are refused.
export const CHANNEL_ID = /^[CG][A-Z0-9]{8,20}$/;
export const USERGROUP_ID = /^S[A-Z0-9]{8,20}$/;
