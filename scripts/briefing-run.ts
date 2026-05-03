#!/usr/bin/env tsx
// Fire one briefing run end-to-end.
//
// Examples:
//   npm run briefing -- --topic iran
//   npm run briefing -- --topic sudan --hours 72 --audience leadership
//   npm run briefing -- --hours 24                  # all topics, campaigner default

import 'dotenv/config';
import { runAndPersistBriefing } from '../src/lib/server/pipeline/persist';
import type { BriefingAudience, BriefingCadence } from '../src/lib/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function asAudience(v: string | undefined): BriefingAudience {
  return v === 'leadership' ? 'leadership' : 'campaigner';
}

function asCadence(v: string | undefined): BriefingCadence {
  if (v === 'daily' || v === 'weekly') return v;
  return 'ad_hoc';
}

async function main(): Promise<void> {
  const topic = arg('topic') ?? null;
  const hours = Number(arg('hours') ?? '48');
  const audience = asAudience(arg('audience'));
  const cadence = asCadence(arg('cadence'));
  const limit = Number(arg('evidence') ?? '50');

  if (!Number.isFinite(hours) || hours <= 0) {
    console.error(`Invalid --hours: ${hours}`);
    process.exit(1);
  }

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hours * 60 * 60 * 1000);

  console.log('magi-sent briefing run');
  console.log(`  topic:    ${topic ?? '(all tracked)'}`);
  console.log(`  audience: ${audience}`);
  console.log(`  cadence:  ${cadence}`);
  console.log(`  window:   ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);
  console.log(`  evidence: up to ${limit} documents`);
  console.log('');

  const t0 = Date.now();
  const result = await runAndPersistBriefing({
    topic,
    audience,
    cadence,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    evidenceLimit: limit
  });
  const elapsed = Date.now() - t0;

  console.log(`run id:      ${result.runId}`);
  console.log(`briefing id: ${result.briefingId}`);
  console.log('');
  console.log(`HEADLINE: ${result.briefing.headline}`);
  console.log('');
  console.log('SUMMARY:');
  console.log(result.briefing.summary);
  console.log('');
  if (result.briefing.sections.length > 0) {
    console.log('SECTIONS:');
    for (const s of result.briefing.sections) {
      console.log(`  ${s.heading}`);
      console.log(`    ${s.body}`);
      if (s.citations.length) {
        console.log(`    cites: ${s.citations.length} document(s)`);
      }
    }
    console.log('');
  }
  console.log(
    `CONSCIENCE: ${result.briefing.conscienceVerdict.toUpperCase()}` +
      (result.briefing.conscienceConcerns.length
        ? ` (${result.briefing.conscienceConcerns.length} concern(s))`
        : '')
  );
  if (result.briefing.conscienceNotes) {
    console.log(`            ${result.briefing.conscienceNotes}`);
  }
  console.log('');
  console.log(`evidence: ${result.briefing.evidenceCount} documents | elapsed: ${elapsed}ms`);

  if (result.briefing.conscienceVerdict === 'block') {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('briefing run failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
