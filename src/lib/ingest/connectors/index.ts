// Connector base interface. One implementation per source kind.
// See PLAN.md §3.3.

import type { Source } from '$lib/types';
import type { RawItem } from '../normalize';

export interface Connector {
  /** matches Source.kind */
  kind: Source['kind'];
  /** Default poll interval in seconds when source.pollSeconds is null. */
  defaultPollSeconds: number;
  /** Fetch the freshest items since the last successful poll. */
  poll(source: Source, since: Date | null): Promise<RawItem[]>;
}

// Phase 1 connectors live alongside this file:
//   rss.ts          — RSS/Atom feeds (priority 1) ✓
//   gdelt.ts        — GDELT 2.0 doc API
//   newsapi.ts      — NewsAPI free tier
//   bluesky.ts      — Bluesky AT Protocol firehose (filtered)
//   mastodon.ts     — public timelines
//   reddit.ts       — Reddit JSON endpoints

import { rssConnector } from './rss';

const REGISTRY: Partial<Record<Source['kind'], Connector>> = {
  rss: rssConnector
};

/** Look up the connector implementation for a source. Throws if missing. */
export function getConnector(kind: Source['kind']): Connector {
  const c = REGISTRY[kind];
  if (!c) throw new Error(`No connector registered for source kind: ${kind}`);
  return c;
}

export function hasConnector(kind: Source['kind']): boolean {
  return Boolean(REGISTRY[kind]);
}
