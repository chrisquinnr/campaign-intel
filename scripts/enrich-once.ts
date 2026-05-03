#!/usr/bin/env tsx
// One-shot enrichment pass. Embeds documents that don't have embeddings yet.
//
// Run: `npm run enrich:once`
// Custom batch: `npm run enrich:once -- --limit 50`

import 'dotenv/config';
import { runEnrichOnce } from '../src/lib/enrich/worker';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const limitArg = arg('limit');
  const limit = limitArg ? Number(limitArg) : undefined;
  if (limitArg && Number.isNaN(limit)) {
    console.error(`Invalid --limit value: ${limitArg}`);
    process.exit(1);
  }

  console.log(`magi-sent enrich (embeddings) — limit=${limit ?? 'default'}`);

  const summary = await runEnrichOnce({ limit });

  console.log('');
  console.log(
    `attempted=${summary.attempted} embedded=${summary.embedded} ` +
      `failed=${summary.failed}`
  );
  if (summary.errors.length > 0) {
    console.log('errors:');
    for (const e of summary.errors) console.log(`  - ${e}`);
  }
  console.log(
    `elapsed: ${new Date(summary.finishedAt).getTime() - new Date(summary.startedAt).getTime()}ms`
  );

  if (summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
