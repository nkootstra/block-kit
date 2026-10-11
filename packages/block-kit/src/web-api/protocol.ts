import type { WebApiChannel, WebApiUser, WebApiUsergroup } from "./client";

// The wire format between `httpResolverClient` (browser) and `createResolverRelay` (server).

/** POSTed as JSON. Ids are looked up with `users.info` and `conversations.info`. */
export interface ResolveRequest {
  users?: string[];
  channels?: string[];
  /** Asks for the workspace's user groups (`usergroups.list`); they can't be looked up by id. */
  usergroups?: true;
}

/** Each requested id maps to its allowlisted fields, or `null` when Slack doesn't know it. */
export interface ResolveResponse {
  users?: Record<string, WebApiUser | null>;
  channels?: Record<string, WebApiChannel | null>;
  usergroups?: WebApiUsergroup[];
}

/** The most ids one request may ask for, and the default `maxIds`. */
export const MAX_RESOLVE_IDS = 100;

export const USER_ID = /^[UW][A-Z0-9]{8,20}$/;
// Direct messages have no name to resolve, so `D` ids are refused.
export const CHANNEL_ID = /^[CG][A-Z0-9]{8,20}$/;
