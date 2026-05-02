// Normalise raw connector payloads into the canonical Document shape.
// Each connector calls into here so the rest of the system never has to
// branch on source kind.
// See PLAN.md §3.3.

import type { Document, IsoLang, Source } from '$lib/types';
import { createHash } from 'node:crypto';

/** Stable cross-source key for dedup. URL when available, hash of body otherwise. */
export function externalIdFor(input: { url?: string | null; platformId?: string | null; text: string }): string {
  if (input.platformId) return input.platformId;
  if (input.url) return createHash('sha1').update(input.url).digest('hex');
  return createHash('sha1').update(input.text).digest('hex');
}

export interface RawItem {
  url?: string | null;
  platformId?: string | null;
  title?: string | null;
  text: string;
  author?: string | null;
  publishedAt?: string | null;
  lang?: IsoLang | null;
  rawPayload?: Record<string, unknown> | null;
}

/** Lift a connector's raw item to a Document (sans id, which the DB assigns). */
export function toDocument(source: Source, raw: RawItem): Omit<Document, 'id'> {
  return {
    sourceId: source.id,
    externalId: externalIdFor(raw),
    url: raw.url ?? null,
    author: raw.author ?? null,
    publishedAt: raw.publishedAt ?? null,
    fetchedAt: new Date().toISOString(),
    title: raw.title ?? null,
    text: raw.text,
    lang: raw.lang ?? source.lang ?? 'und',
    rawPayload: raw.rawPayload ?? null
  };
}
