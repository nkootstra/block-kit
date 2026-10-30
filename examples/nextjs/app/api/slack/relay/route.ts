import "server-only";
import { interactionRelay } from "@/lib/interactions";

// Signs the page's button clicks with the signing secret, which stays on the server, and forwards
// them to the app. Development tooling: set NEXT_PUBLIC_SLACK_RELAY_TOKEN when anyone else can
// reach it.
export const POST = interactionRelay();
