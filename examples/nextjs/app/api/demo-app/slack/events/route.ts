import "server-only";
import { demoApp, usingDemoApp } from "@/lib/interactions";

// Stands in for your app's request URL while SLACK_REQUEST_URL is unset.
export async function POST(request: Request) {
  if (!usingDemoApp) return new Response("Not found", { status: 404 });
  return demoApp(request);
}
