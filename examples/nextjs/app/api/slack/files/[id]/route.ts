import "server-only";
import { fromOwnPage } from "@/lib/session";
import { downloadFile } from "@/lib/slack";

// What `resolvers.slackFile` points the page at: the file, downloaded here with the bot token.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!fromOwnPage(request)) return new Response("Forbidden", { status: 403 });
  return downloadFile((await params).id);
}
