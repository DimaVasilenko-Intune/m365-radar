/** Reads the committed snapshot and answers queries against it. */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarvestMeta, RoadmapFeature } from "./types.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

let cache: { features: RoadmapFeature[]; meta: HarvestMeta } | null = null;

export async function load(): Promise<{ features: RoadmapFeature[]; meta: HarvestMeta }> {
  if (cache) return cache;

  try {
    const [features, meta] = await Promise.all([
      readFile(join(DATA_DIR, "roadmap.json"), "utf8").then(
        (raw) => JSON.parse(raw) as RoadmapFeature[],
      ),
      readFile(join(DATA_DIR, "meta.json"), "utf8").then((raw) => JSON.parse(raw) as HarvestMeta),
    ]);
    cache = { features, meta };
    return cache;
  } catch {
    throw new Error(
      "No roadmap snapshot found in data/. Run `npm run harvest` before starting the server.",
    );
  }
}

/**
 * The upstream repository refreshes daily, but a clone does not refresh itself.
 * Past this many days we tell the caller their copy has drifted.
 */
const STALE_AFTER_DAYS = 3;

export interface Freshness {
  snapshotDate: string;
  snapshotAgeDays: number;
  warning?: string;
}

export function freshness(meta: HarvestMeta): Freshness {
  const ageMs = Date.now() - new Date(meta.harvestedAt).getTime();
  const snapshotAgeDays = Math.max(0, Math.floor(ageMs / 86_400_000));
  const base: Freshness = { snapshotDate: meta.harvestedAt, snapshotAgeDays };

  if (snapshotAgeDays < STALE_AFTER_DAYS) return base;

  return {
    ...base,
    warning:
      `This snapshot is ${snapshotAgeDays} days old, so the roadmap may have moved since. ` +
      `The published repository refreshes daily — run "git pull" in your m365-radar checkout, ` +
      `or "npm run harvest" to fetch the current roadmap yourself.`,
  };
}

function matchesAny(values: string[], filter: string | undefined): boolean {
  if (!filter) return true;
  const needle = filter.toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
}

export interface SearchOptions {
  query?: string;
  product?: string;
  status?: string;
  cloudInstance?: string;
  platform?: string;
  limit?: number;
}

/** Every whitespace-separated term in `query` must appear in title or description. */
export function search(features: RoadmapFeature[], options: SearchOptions): RoadmapFeature[] {
  const terms = (options.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const matched = features.filter((feature) => {
    if (options.status && feature.status.toLowerCase() !== options.status.toLowerCase()) {
      return false;
    }
    if (!matchesAny(feature.products, options.product)) return false;
    if (!matchesAny(feature.cloudInstances, options.cloudInstance)) return false;
    if (!matchesAny(feature.platforms, options.platform)) return false;

    if (terms.length === 0) return true;
    const haystack = `${feature.title} ${feature.description}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });

  matched.sort((a, b) => b.modified.localeCompare(a.modified));
  return matched.slice(0, options.limit ?? 20);
}

/** Features whose `modified` timestamp falls on or after `since`. */
export function changedSince(
  features: RoadmapFeature[],
  since: Date,
  limit: number,
): RoadmapFeature[] {
  const cutoff = since.toISOString();
  return features
    .filter((feature) => feature.modified >= cutoff)
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, limit);
}
