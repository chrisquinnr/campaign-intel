#!/usr/bin/env tsx
// Standalone RSS connector sanity check.
// Validates the connector against three representative feeds without needing
// the DB. Run: `npx tsx scripts/check-rss.ts` (or after wiring: `npm run rss:check`).
//
// Outputs first 5 normalised items per feed so you can eyeball:
//   - title + text strip quality
//   - publishedAt parsing across feed formats
//   - language fallback chain (en, ar, mixed)

import { rssConnector } from '../src/lib/ingest/connectors/rss';
import { toDocument } from '../src/lib/ingest/normalize';
import type { Source } from '../src/lib/types';

interface Probe {
  label: string;
  endpoint: string;
  lang: string | null;
}

const PROBES: Probe[] = [
  { label: 'BBC World',          endpoint: 'http://feeds.bbci.co.uk/news/world/rss.xml',  lang: 'en' },
  { label: 'Al Jazeera English', endpoint: 'https://www.aljazeera.com/xml/rss/all.xml',   lang: 'en' },
  { label: 'Al Jazeera Arabic',  endpoint: 'https://www.aljazeera.net/xml/rss/all.xml',   lang: 'ar' }
];

function fakeSource(p: Probe): Source {
  return {
    id: `probe-${p.label.toLowerCase().replace(/\s+/g, '-')}`,
    kind: 'rss',
    label: p.label,
    endpoint: p.endpoint,
    lang: p.lang,
    topics: [],
    pollSeconds: null,
    active: true,
    createdAt: new Date().toISOString()
  };
}

function truncate(s: string, n = 140): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function probe(p: Probe): Promise<void> {
  const source = fakeSource(p);
  const t0 = Date.now();
  let items;
  try {
    items = await rssConnector.poll(source, null);
  } catch (err) {
    console.log(`\n[${p.label}] FAIL: ${(err as Error).message}`);
    return;
  }
  const elapsed = Date.now() - t0;
  console.log(`\n[${p.label}] ${items.length} items in ${elapsed}ms`);
  for (const raw of items.slice(0, 5)) {
    const doc = toDocument(source, raw);
    console.log(
      `  - [${doc.lang}] ${doc.publishedAt ?? '(no date)'} | ${truncate(doc.title ?? '(no title)', 80)}`
    );
    console.log(`      ${truncate(doc.text)}`);
  }
}

async function main(): Promise<void> {
  console.log('magi-sent RSS connector sanity check');
  console.log('=====================================');
  for (const p of PROBES) {
    await probe(p);
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
