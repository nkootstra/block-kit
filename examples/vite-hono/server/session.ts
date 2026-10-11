/**
 * Whether a request came from the example's own pages: browsers send `Sec-Fetch-Site:
 * same-origin` then. The file and message routes check it so other websites can't embed or read
 * them. It isn't a login. Like the resolver relay, these routes are development tooling: don't
 * deploy them publicly.
 */
export function fromOwnPage(request: Request): boolean {
  return request.headers.get("sec-fetch-site") === "same-origin";
}
