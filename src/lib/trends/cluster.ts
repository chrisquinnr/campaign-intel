// Online clustering of fresh documents by embedding similarity.
// HDBSCAN for batch passes, simple incremental clustering for streaming.
// See PLAN.md §3.5.

export interface Cluster {
  id: string;
  centroid: number[];
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export async function clusterRecent(): Promise<Cluster[]> {
  // TODO(phase-2): implement.
  return [];
}
