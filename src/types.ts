/** A single Microsoft 365 roadmap feature, normalised from the upstream API. */
export interface RoadmapFeature {
  id: number;
  title: string;
  description: string;
  /** "In development" | "Rolling out" | "Launched" | "Cancelled" */
  status: string;
  products: string[];
  cloudInstances: string[];
  platforms: string[];
  releasePhases: string[];
  /** Free-text dates as Microsoft publishes them, e.g. "September CY2026". */
  previewDate: string | null;
  generalAvailabilityDate: string | null;
  created: string;
  modified: string;
  moreInfoLink: string | null;
  url: string;
}

/** Written alongside every snapshot so consumers can see how fresh the data is. */
export interface HarvestMeta {
  harvestedAt: string;
  source: string;
  featureCount: number;
  countsByStatus: Record<string, number>;
  products: string[];
  cloudInstances: string[];
  platforms: string[];
}
