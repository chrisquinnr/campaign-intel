// RSS / Atom connector.
// Phase 1's first real connector. Pragmatic feature set:
//   - rss-parser for the format zoo (RSS 2.0, Atom, mixed namespaces)
//   - HTML strip on description / content fields so downstream sees clean text
//   - language fallback chain: item.lang → feed.lang → source.lang → 'und'
//   - polite User-Agent so outlets don't 403 us
//   - `since` cutoff applied client-side; servers' If-Modified-Since handling
//     is unreliable across the source list
//
// Worker layer is responsible for retries, scheduling, and dedup against the
// documents table. This module stays pure: feed in, RawItems out.

import Parser from 'rss-parser';
import type { Connector } from './index';
import type { RawItem } from '../normalize';
import type { Source } from '$lib/types';

interface RssItemExt {
  // Common dublin core / content namespace + Atom fields. rss-parser only
  // exposes these when listed in customFields below.
  'content:encoded'?: string;
  'dc:creator'?: string;
  'dc:date'?: string;
  author?: string;
  language?: string;
}

const USER_AGENT = 'magi-sent/0.1 (+https://avaaz.org; ingest)';

const parser = new Parser<{ language?: string }, RssItemExt>({
  headers: { 'User-Agent': USER_AGENT },
  // Surface content:encoded so we get the full body when feeds provide it
  customFields: {
    item: ['content:encoded', 'dc:creator', 'dc:date', 'author', 'language']
  },
  timeout: 15_000
});

/** Strip HTML tags and decode common entities. Cheap, no dep. */
export function stripHtml(input: string): string {
  if (!input) return '';
  // Drop tags
  let out = input.replace(/<[^>]+>/g, ' ');
  // Decode the entities that show up in real-world feeds
  out = out
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&hellip;/gi, '…')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  // Collapse whitespace
  return out.replace(/\s+/g, ' ').trim();
}

function pickPublishedAt(item: Parser.Item & RssItemExt): string | null {
  const raw = item.isoDate ?? item.pubDate ?? item['dc:date'] ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function pickText(item: Parser.Item & RssItemExt): string {
  // Prefer full-content fields, fall back to summaries.
  const candidates = [item['content:encoded'], item.content, item.contentSnippet, item.summary, item.title];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      return stripHtml(c);
    }
  }
  return '';
}

function pickAuthor(item: Parser.Item & RssItemExt): string | null {
  const a = item.creator ?? item['dc:creator'] ?? item.author ?? null;
  return a ? String(a).trim() : null;
}

export const rssConnector: Connector = {
  kind: 'rss',
  defaultPollSeconds: 15 * 60,

  async poll(source: Source, since: Date | null): Promise<RawItem[]> {
    const feed = await parser.parseURL(source.endpoint);
    const feedLang = feed.language ?? null;
    const cutoffMs = since?.getTime() ?? null;

    const items: RawItem[] = [];
    for (const item of feed.items ?? []) {
      const publishedAt = pickPublishedAt(item);
      if (cutoffMs !== null && publishedAt !== null) {
        if (new Date(publishedAt).getTime() <= cutoffMs) continue;
      }

      const text = pickText(item);
      if (!text) continue; // skip empty items

      const itemLang = item.language ?? feedLang ?? source.lang ?? null;

      items.push({
        url: item.link ?? null,
        platformId: item.guid ?? item.link ?? null,
        title: item.title ? stripHtml(item.title) : null,
        text,
        author: pickAuthor(item),
        publishedAt,
        lang: itemLang,
        rawPayload: item as unknown as Record<string, unknown>
      });
    }

    return items;
  }
};
