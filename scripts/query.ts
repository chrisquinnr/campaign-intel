#!/usr/bin/env tsx
// Standalone retrieval test — embed the query, run hybrid_search, print top hits.
//
// Run: `npm run query -- "iran nuclear deal"`
// Filters:
//   --topic sudan          (one or more allowed)
//   --since 2026-04-01     (ISO date)
//   --top 10               (default 5)
//   --bm25                 (skip vector branch)
//   --vec                  (skip BM25 branch)

import 'dotenv/config';
import { hybridRetrieve } from '../src/lib/retrieval/hybrid';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function args(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === `--${name}`) {
      const v = process.argv[i + 1];
      if (v && !v.startsWith('--')) out.push(v);
    }
  }
  return out;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function truncate(s: string | null, n = 140): string {
  if (!s) return '(no text)';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function main(): Promise<void> {
  const query = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!query) {
    console.error('usage: npm run query -- "<query>" [--topic slug] [--since iso] [--top N] [--bm25] [--vec]');
    process.exit(1);
  }

  const topics = args('topic');
  const since = arg('since');
  const top = Number(arg('top') ?? '5');

  console.log(`magi-sent query — "${query}"`);
  if (topics.length) console.log(`  topics: ${topics.join(', ')}`);
  if (since) console.log(`  since:  ${since}`);
  console.log(`  top:    ${top}`);
  console.log('');

  const t0 = Date.now();
  const hits = await hybridRetrieve({
    query,
    topK: top,
    filters: {
      topics: topics.length ? topics : undefined,
      publishedAfter: since
    },
    bm25Only: flag('bm25'),
    vectorOnly: flag('vec')
  });
  const elapsed = Date.now() - t0;

  if (hits.length === 0) {
    console.log('(no results)');
    return;
  }

  for (const [i, h] of hits.entries()) {
    console.log(
      `${i + 1}. [${h.lang}] bm25=${h.bm25Score.toFixed(3)} vec=${h.vectorScore.toFixed(3)} fused=${h.fusedScore.toFixed(4)}`
    );
    console.log(`   ${truncate(h.title, 100)}`);
    console.log(`   ${truncate(h.text)}`);
    if (h.url) console.log(`   ${h.url}`);
    console.log('');
  }
  console.log(`${hits.length} hits in ${elapsed}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
