#!/usr/bin/env tsx
// One-shot ingest. Polls every active source once, prints a summary,
// exits non-zero if any source errored.
//
// Run: `npm run ingest:once`
// Filter to a single source: `npm run ingest:once -- --source <uuid>`

import 'dotenv/config';
import { runIngestOnce } from '../src/lib/ingest/worker';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const onlySourceId = arg('source');
  console.log(`magi-sent ingest — ${onlySourceId ? `source=${onlySourceId}` : 'all active sources'}`);

  const summary = await runIngestOnce({ onlySourceId });

  console.log('');
  console.log('per-source:');
  for (const r of summary.sourceResults) {
    const tag = r.error ? `FAIL: ${r.error}` : `${r.fetched} fetched, ${r.inserted} new, ${r.skipped} dup`;
    console.log(`  - ${r.label.padEnd(24)} ${tag}`);
  }
  console.log('');
  console.log(
    `totals: ${summary.totals.fetched} fetched, ${summary.totals.inserted} new, ` +
      `${summary.totals.skipped} dup, ${summary.totals.errored} errored`
  );
  console.log(`elapsed: ${new Date(summary.finishedAt).getTime() - new Date(summary.startedAt).getTime()}ms`);

  if (summary.totals.errored > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
