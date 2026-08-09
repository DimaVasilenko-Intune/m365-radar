#!/usr/bin/env node
/** MCP server exposing the Microsoft 365 roadmap snapshot and Azure service status. */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fetchAzureStatus } from "./azure-status.js";
import { changedSince, freshness, load, search } from "./data.js";
import type { RoadmapFeature } from "./types.js";

const server = new McpServer({ name: "m365-radar", version: "0.1.0" });

const text = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

const failure = (error: unknown) => ({
  content: [
    { type: "text" as const, text: error instanceof Error ? error.message : String(error) },
  ],
  isError: true,
});

/** Trimmed shape for list results — full descriptions blow up the context window. */
function summarise(feature: RoadmapFeature) {
  return {
    id: feature.id,
    title: feature.title,
    status: feature.status,
    products: feature.products,
    generalAvailabilityDate: feature.generalAvailabilityDate,
    modified: feature.modified,
    url: feature.url,
  };
}

server.registerTool(
  "search_roadmap",
  {
    title: "Search the Microsoft 365 roadmap",
    description:
      "Search roadmap features by free text and filter by product, status, cloud instance or " +
      "platform. Returns summaries; call get_roadmap_item for the full description.",
    inputSchema: {
      query: z.string().optional().describe("Free text matched against title and description"),
      product: z.string().optional().describe('e.g. "Microsoft Teams", "Outlook", "Intune"'),
      status: z
        .enum(["In development", "Rolling out", "Launched", "Cancelled"])
        .optional()
        .describe("Exact roadmap status"),
      cloudInstance: z
        .string()
        .optional()
        .describe('e.g. "Worldwide (Standard Multi-Tenant)", "GCC", "GCC High", "DoD"'),
      platform: z.string().optional().describe('e.g. "Web", "Desktop", "Mac", "Android", "iOS"'),
      limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
    },
  },
  async (args) => {
    try {
      const { features, meta } = await load();
      const results = search(features, args);
      return text({
        ...freshness(meta),
        matched: results.length,
        features: results.map(summarise),
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "get_roadmap_item",
  {
    title: "Get one roadmap feature",
    description: "Full detail for a single roadmap feature, by its numeric feature ID.",
    inputSchema: { id: z.number().int().describe("Roadmap feature ID") },
  },
  async ({ id }) => {
    try {
      const { features, meta } = await load();
      const feature = features.find((candidate) => candidate.id === id);
      if (!feature) return failure(new Error(`No roadmap feature with id ${id}`));
      return text({ ...freshness(meta), feature });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "list_recent_changes",
  {
    title: "List recently changed roadmap features",
    description:
      "Features added or updated in the last N days, newest first. This is the radar: what moved " +
      "on the roadmap since you last looked.",
    inputSchema: {
      days: z.number().int().min(1).max(365).optional().describe("Look-back window, default 7"),
      product: z.string().optional().describe("Optional product filter"),
      limit: z.number().int().min(1).max(100).optional().describe("Default 50"),
    },
  },
  async ({ days = 7, product, limit = 50 }) => {
    try {
      const { features, meta } = await load();
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const scoped = product ? search(features, { product, limit: features.length }) : features;
      const changed = changedSince(scoped, since, limit);
      return text({
        ...freshness(meta),
        since: since.toISOString(),
        matched: changed.length,
        features: changed.map(summarise),
      });
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "get_azure_status",
  {
    title: "Get current Azure service status",
    description:
      "Active Azure service incidents, read live from the public status feed. An empty list means " +
      "Azure is reporting no active issues.",
    inputSchema: {},
  },
  async () => {
    try {
      const status = await fetchAzureStatus();
      return text({
        fetchedAt: status.fetchedAt,
        activeIncidents: status.items.length,
        incidents: status.items,
      });
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());
