// Trend detection. Hourly job.
// Counts entity/topic mentions per source bucket and time window, flags
// z-score anomalies vs trailing 7d / 30d baseline, surfaces co-occurring
// entities. See PLAN.md §3.5.

import type { Trend } from '$lib/types';

export interface DetectInput {
  windowSeconds: number;
  /** topic slugs to scope to; empty = all */
  topics?: string[];
}

export async function detectTrends(_input: DetectInput): Promise<Trend[]> {
  // TODO(phase-2): implement.
  return [];
}
