// Adds the MCP server to the static `blume build` output. Blume only generates its MCP server on a
// server build, and the Cloudflare server build is too large to deploy
// (https://github.com/haydenbleasel/blume/issues/322), so `worker/index.ts` serves `/mcp` with
// Blume's own handler instead. This script writes what that needs, using Blume's own builders:
// - `dist/mcp-data.json`: the snapshot the handler serves (search documents, page Markdown,
//   routes, navigation). `.assetsignore` keeps it out of the public assets; the Worker bundles it.
// - `/.well-known/mcp.json` and `/.well-known/mcp/server-card.json`, served with CORS.
// - `llms.txt`, `agent-readability.json` and the API and AI catalogs, rebuilt so they list the
//   server.
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildAgentReadability } from "blume/ai/agent-readability.ts";
import {
  AI_CATALOG_PATH,
  ARD_MANIFEST_PATH,
  buildAiCatalog,
  crossOriginDiscoveryPaths,
} from "blume/ai/ai-catalog.ts";
import { API_CATALOG_PATH, buildApiCatalog } from "blume/ai/api-catalog.ts";
import { buildLlmsIndex } from "blume/ai/llms.ts";
import { buildMcpData } from "blume/ai/mcp/data.ts";
import { buildMcpDiscovery, buildMcpServerCard } from "blume/ai/mcp/discovery.ts";
import { collectSkills } from "blume/ai/skills.ts";
import { scanProject } from "blume/core/project-graph.ts";

const root = resolve(import.meta.dir, "..");
const dist = join(root, "dist");

const scanned = await scanProject(root, { mode: "build" });
const config = {
  ...scanned.config,
  agents: { ...scanned.config.agents, mcp: { ...scanned.config.agents.mcp, enabled: true } },
};
const project = { ...scanned, config };

async function write(path: string, content: string) {
  const target = join(dist, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf-8");
}

const data = await buildMcpData(project);
await write("mcp-data.json", JSON.stringify(data));
await write(".assetsignore", "mcp-data.json\n");

const discovery = {
  base: data.base,
  name: data.name,
  route: config.agents.mcp.route,
  site: data.site,
  version: data.version,
};
await write(".well-known/mcp.json", `${JSON.stringify(buildMcpDiscovery(discovery), null, 2)}\n`);
await write(
  ".well-known/mcp/server-card.json",
  `${JSON.stringify(buildMcpServerCard(discovery), null, 2)}\n`,
);

const { skills } = config.agents.skills
  ? await collectSkills(resolve(root, config.agents.skills))
  : { skills: [] };
await write("llms.txt", buildLlmsIndex(project, { skills }));
await write(
  "agent-readability.json",
  `${JSON.stringify(buildAgentReadability(project), null, 2)}\n`,
);
const apiCatalog = buildApiCatalog(config);
if (apiCatalog) await write(API_CATALOG_PATH, apiCatalog);
const aiCatalog = buildAiCatalog(config, skills);
if (aiCatalog) {
  await write(AI_CATALOG_PATH, aiCatalog);
  await write(ARD_MANIFEST_PATH, aiCatalog);
}

// Blume's `_headers` already allows other origins to read the catalogs; add the MCP documents.
const mcpDocuments = crossOriginDiscoveryPaths(config).filter((path) => path.includes("/mcp"));
await appendFile(
  join(dist, "_headers"),
  mcpDocuments.map((path) => `${path}\n  Access-Control-Allow-Origin: *\n`).join(""),
);

console.log(`Added the MCP server's data and discovery documents (${data.routes.length} pages)`);
