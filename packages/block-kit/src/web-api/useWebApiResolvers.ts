import type { WebClient } from "@slack/web-api";
import { useEffect, useMemo, useState } from "react";
import {
  createWebApiResolvers,
  type WebApiResolvers,
  type WebApiResolversOptions,
} from "./resolvers";

/**
 * `createWebApiResolvers`, wired up to re-render the calling component whenever a lookup
 * completes. Pass the returned resolvers straight to `<BlockKitProvider resolvers={...}>`.
 *
 * `opts` is only read when `client` (identity) changes, matching `createWebApiResolvers` being
 * called once per client rather than on every render.
 */
export function useWebApiResolvers(
  client: WebClient,
  opts?: WebApiResolversOptions,
): WebApiResolvers {
  // `opts` is a snapshot taken at creation time, like `client`: intentionally excluded below.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const resolvers = useMemo(() => createWebApiResolvers(client, opts), [client]);
  const [, forceUpdate] = useState(0);

  useEffect(() => resolvers.subscribe(() => forceUpdate((v) => v + 1)), [resolvers]);

  return resolvers;
}
