/**
 * Fetches the public Microsoft 365 roadmap, normalises it and writes a snapshot
 * to data/. Run daily by .github/workflows/harvest.yml.
 *
 * Output is deliberately deterministic — features sorted by id, keys in a fixed
 * order, two-space indent — so the git diff between two runs is exactly the list
 * of roadmap changes and nothing else.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarvestMeta, RoadmapFeature } from "./types.js";

const SOURCE = "https://www.microsoft.com/releasecommunications/api/v1/m365";

/**
 * The endpoint returns 403 to unrecognised clients, so we send a browser
 * User-Agent. See the "Data source" section of the README.
 */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

interface UpstreamTag {
  tagName?: string;
}

interface UpstreamFeature {
  id: number;
  title?: string;
  description?: string;
  status?: string;
  moreInfoLink?: string | null;
  publicPreviewDate?: string | null;
  publicDisclosureAvailabilityDate?: string | null;
  created?: string;
  modified?: string;
  tagsContainer?: Record<string, UpstreamTag[] | undefined>;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

/** Upstream descriptions occasionally carry markup and encoded entities. */
function toPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-z]+|#\d+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

function tagNames(container: UpstreamFeature["tagsContainer"], category: string): string[] {
  const tags = container?.[category] ?? [];
  const names = tags.map((tag) => tag?.tagName).filter((name): name is string => Boolean(name));
  return [...new Set(names)].sort();
}

function normalise(feature: UpstreamFeature): RoadmapFeature {
  return {
    id: feature.id,
    title: toPlainText(feature.title),
    description: toPlainText(feature.description),
    status: feature.status ?? "Unknown",
    products: tagNames(feature.tagsContainer, "products"),
    cloudInstances: tagNames(feature.tagsContainer, "cloudInstances"),
    platforms: tagNames(feature.tagsContainer, "platforms"),
    releasePhases: tagNames(feature.tagsContainer, "releasePhase"),
    previewDate: feature.publicPreviewDate || null,
    generalAvailabilityDate: feature.publicDisclosureAvailabilityDate || null,
    created: feature.created ?? "",
    modified: feature.modified ?? "",
    moreInfoLink: feature.moreInfoLink || null,
    url: `https://www.microsoft.com/en-us/microsoft-365/roadmap?featureid=${feature.id}`,
  };
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) counts[key(item)] = (counts[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function distinct(features: RoadmapFeature[], key: keyof RoadmapFeature): string[] {
  const values = new Set<string>();
  for (const feature of features) {
    for (const value of feature[key] as string[]) values.add(value);
  }
  return [...values].sort();
}

export async function harvest(): Promise<HarvestMeta> {
  const response = await fetch(SOURCE, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Roadmap API returned ${response.status} ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Roadmap API did not return an array — upstream shape has changed");
  }
  if (payload.length === 0) {
    throw new Error("Roadmap API returned zero features — refusing to overwrite the snapshot");
  }

  const features = (payload as UpstreamFeature[])
    .filter((feature) => typeof feature?.id === "number")
    .map(normalise)
    .sort((a, b) => a.id - b.id);

  const meta: HarvestMeta = {
    harvestedAt: new Date().toISOString(),
    source: SOURCE,
    featureCount: features.length,
    countsByStatus: countBy(features, (feature) => feature.status),
    products: distinct(features, "products"),
    cloudInstances: distinct(features, "cloudInstances"),
    platforms: distinct(features, "platforms"),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(join(DATA_DIR, "roadmap.json"), `${JSON.stringify(features, null, 2)}\n`);
  await writeFile(join(DATA_DIR, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);

  return meta;
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  harvest()
    .then((meta) => {
      const statuses = Object.entries(meta.countsByStatus)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ");
      console.log(`Harvested ${meta.featureCount} features (${statuses})`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
