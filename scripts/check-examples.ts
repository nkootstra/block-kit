// Checks that the examples keep the bot token on the server. CI builds them with
// SLACK_BOT_TOKEN=xoxb-block-kit-canary; this fails if the canary, any bot token or the Slack SDK
// shows up in what a browser downloads. With --smoke it also starts each example with the canary
// and checks what its page and routes answer.
//
//   bun scripts/check-examples.ts [--smoke]

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const CANARY = "xoxb-block-kit-canary";

/** What must never reach a browser. The package name only survives bundling in some cases. */
export const LEAKS: { name: string; pattern: RegExp }[] = [
  { name: "the canary bot token", pattern: new RegExp(CANARY) },
  { name: "a bot token", pattern: /xoxb-/ },
  { name: "the Slack Web API SDK", pattern: /@slack\/web-api|slack_webapi_/ },
  { name: "a Slack Web API URL", pattern: /slack\.com\/api/ },
];

/** Every leak in a set of files, as `file: what`. */
export function findLeaks(files: { path: string; text: string }[]): string[] {
  return files.flatMap((file) =>
    LEAKS.filter((leak) => leak.pattern.test(file.text)).map(
      (leak) => `${file.path}: ${leak.name}`,
    ),
  );
}

interface Example {
  name: string;
  dir: string;
  /** The build output a browser downloads: static assets, and prerendered pages and payloads. */
  clientOutput: string[];
  /** Starts the built example on `port`. */
  start: (port: number) => string[];
}

const root = join(import.meta.dir, "..");

export const EXAMPLES: Example[] = [
  {
    name: "nextjs",
    dir: join(root, "examples/nextjs"),
    clientOutput: [".next/static", ".next/server/app"],
    start: (port) => ["bunx", "next", "start", "-p", String(port)],
  },
  {
    name: "vite-hono",
    dir: join(root, "examples/vite-hono"),
    clientOutput: ["dist/client"],
    start: () => ["bun", "server/index.ts"],
  },
];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Next.js keeps server code next to the prerendered pages; only these go to a browser. */
function sentToBrowser(path: string): boolean {
  if (!path.includes(join(".next", "server"))) return true;
  return /\.(html|rsc|body|meta)$/.test(path) || path.includes(".segments");
}

function clientFiles(example: Example) {
  return example.clientOutput
    .flatMap((dir) => walk(join(example.dir, dir)))
    .filter(sentToBrowser)
    .map((path) => ({ path: relative(root, path), text: readFileSync(path, "latin1") }));
}

async function smoke(example: Example, port: number): Promise<string[]> {
  const proc = Bun.spawn(example.start(port), {
    cwd: example.dir,
    env: { ...process.env, SLACK_BOT_TOKEN: CANARY, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });
  const base = `http://localhost:${port}`;
  const sameOrigin = { "sec-fetch-site": "same-origin" };
  const problems: string[] = [];
  try {
    for (let i = 0; ; i++) {
      try {
        await fetch(base);
        break;
      } catch {
        if (i > 100) throw new Error(`${example.name} didn't start on ${base}`);
        await Bun.sleep(200);
      }
    }
    const resolve = (headers: Record<string, string>) =>
      fetch(`${base}/api/slack/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ users: ["U0123456789"], channels: ["C0123456789"] }),
      });
    const responses = await Promise.all([
      fetch(base, { headers: sameOrigin }),
      resolve(sameOrigin),
      fetch(`${base}/api/slack/files/F0123456789`, { headers: sameOrigin }),
      fetch(`${base}/api/message`, { headers: sameOrigin }),
    ]);
    const answered = await Promise.all(
      responses.map(async (res) => ({
        path: `${example.name} ${new URL(res.url).pathname}`,
        text: `${[...res.headers].join("\n")}\n${await res.text()}`,
      })),
    );
    problems.push(...findLeaks(answered));
  } finally {
    proc.kill();
    await proc.exited;
  }
  const logs = `${await new Response(proc.stdout).text()}${await new Response(proc.stderr).text()}`;
  problems.push(...findLeaks([{ path: `${example.name} server log`, text: logs }]));
  return problems;
}

if (import.meta.main) {
  const problems: string[] = [];
  let port = 4310;
  for (const example of EXAMPLES) {
    const files = clientFiles(example);
    if (!files.length) {
      console.log(`${example.name}: not built (unaffected by this change), skipped`);
      continue;
    }
    const leaks = findLeaks(files);
    problems.push(...leaks);
    console.log(`${example.name}: ${files.length} client files, ${leaks.length} leaks`);
    if (process.argv.includes("--smoke")) {
      const found = await smoke(example, port++);
      problems.push(...found);
      console.log(`${example.name}: smoke run, ${found.length} problems`);
    }
  }
  if (problems.length) {
    console.error(`\nThe bot token, or the code that uses it, reaches the browser:\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
}
