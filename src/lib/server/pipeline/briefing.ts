// Briefing pipeline. Replaces the legacy yes/no `runPipeline` for sentiment
// + trend work. See PLAN.md §3.6.
//
// Flow:
//   1. Window + scope selection
//   2. Retriever pulls representative documents (and trends, when the
//      detector lands)
//   3. Three lens agents run in parallel over the same evidence pack
//   4. Challenge round if assessments diverge materially (stub)
//   5. Synthesiser composes audience-specific briefing
//   6. Artaban runs bias/harm pass before publication
//   7. (Caller) persists briefing + run

import type {
  AgentLensFinding,
  AgentName,
  Briefing,
  BriefingAudience,
  BriefingCadence,
  Document,
  Trend
} from '$lib/types';
import { ARTABAN_REVIEWER, LENS_AGENTS } from '$lib/server/agents';
import { callClaudeText } from '$lib/server/claude';
import { supabaseService, type DB } from '$lib/db/client';

export interface BriefingInput {
  topic: string | null;
  audience: BriefingAudience;
  cadence: BriefingCadence;
  windowStart: string;
  windowEnd: string;
  /** Cap on documents pulled into the evidence pack. Default 50. */
  evidenceLimit?: number;
}

export interface EvidencePack {
  documents: Document[];
  trends: Trend[];
}

export interface BriefingEmitter {
  emit: (channel: string, payload: Record<string, unknown>) => void;
  streamDelay?: number;
}

const AGENT_ORDER: AgentName[] = ['melchior', 'balthasar', 'casper'];
const DEFAULT_EVIDENCE_LIMIT = 50;

// ─────────────────────────────────────────────────────────────
// Stage 1+2: window + retrieval
//
// Phase 1 strategy: temporal slice within window, optionally scoped by
// source.topics matching the requested topic. Returns Documents ordered by
// published_at desc. Trends remain empty until detector lands.
// ─────────────────────────────────────────────────────────────
export async function buildEvidencePack(
  input: BriefingInput,
  db: DB = supabaseService()
): Promise<EvidencePack> {
  const limit = input.evidenceLimit ?? DEFAULT_EVIDENCE_LIMIT;

  // Inner-join sources so we can filter on sources.topics. Without the inner
  // hint, the topic filter would be a no-op when the join misses.
  let q = db
    .from('documents')
    .select(
      'id, source_id, external_id, url, author, published_at, fetched_at, title, text, lang, raw_payload, sources!inner(topics, label)'
    )
    .gte('published_at', input.windowStart)
    .lte('published_at', input.windowEnd)
    .order('published_at', { ascending: false })
    .limit(limit);

  if (input.topic) {
    q = q.contains('sources.topics', [input.topic]);
  }

  const { data, error } = await q;
  if (error) throw new Error(`buildEvidencePack failed: ${error.message}`);

  const documents: Document[] = (data ?? []).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    externalId: r.external_id,
    url: r.url,
    author: r.author,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    title: r.title,
    text: r.text,
    lang: r.lang,
    rawPayload: r.raw_payload as Record<string, unknown> | null
  }));

  return { documents, trends: [] };
}

// ─────────────────────────────────────────────────────────────
// Stage 3: parallel lens runs
// ─────────────────────────────────────────────────────────────
async function runLens(
  agent: AgentName,
  input: BriefingInput,
  pack: EvidencePack,
  io: BriefingEmitter
): Promise<AgentLensFinding> {
  const def = LENS_AGENTS[agent];
  io.emit(`lens:${agent}`, { status: 'running' });

  const docDigest = pack.documents
    .slice(0, 40)
    .map((d) => `[${d.id}] ${d.title ?? '(no title)'} — ${d.text.slice(0, 240)}`)
    .join('\n');
  const trendDigest = pack.trends
    .map((t) => `(${t.kind}, mag=${t.magnitude.toFixed(2)}) ${t.summary}`)
    .join('\n');

  const raw = await callClaudeText({
    system: def.system,
    prompt:
      `Briefing window: ${input.windowStart} → ${input.windowEnd}\n` +
      `Topic: ${input.topic ?? '(all tracked)'}\n` +
      `Audience: ${input.audience}\n\n` +
      `Trends in window:\n${trendDigest || '(none)'}\n\n` +
      `Evidence (document_id, title, snippet):\n${docDigest || '(empty)'}\n\n` +
      'Apply your lens. Return JSON per the schema in your system prompt.',
    maxTokens: 900,
    temperature: 0.3
  });

  let parsed: Pick<AgentLensFinding, 'findings' | 'narrative' | 'watchItems'> = {
    findings: [],
    narrative: ''
  };
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed.narrative = raw; // degrade gracefully — keep human text
  }

  const finding: AgentLensFinding = {
    lens: def.lens,
    agent,
    findings: parsed.findings ?? [],
    narrative: parsed.narrative ?? '',
    watchItems: parsed.watchItems
  };
  io.emit(`lens:${agent}`, { status: 'completed', narrative: finding.narrative });
  return finding;
}

// ─────────────────────────────────────────────────────────────
// Stage 4: challenge round (only when lenses disagree materially)
// TODO(phase-2): define divergence heuristic + challenge prompt.
// ─────────────────────────────────────────────────────────────
function lensesDiverge(_findings: AgentLensFinding[]): boolean {
  return false;
}

// ─────────────────────────────────────────────────────────────
// Stage 5: synthesis
// Audience-aware prompt. Sonnet for quality on the main output.
// ─────────────────────────────────────────────────────────────
const AUDIENCE_FRAMING: Record<BriefingAudience, string> = {
  campaigner:
    'Audience: Avaaz campaigners. Frame operationally. Lead with what is happening, who is affected, ' +
    'and what campaign opportunities or signals to watch. Suggest 2 to 4 concrete actions or questions ' +
    'the campaign team should consider. Keep it sharp and useful for daily decisions.',
  leadership:
    'Audience: Avaaz leadership. Frame strategically. Lead with the strategic implication, ' +
    'reputational or political risk, and what it changes about the position the organisation should hold. ' +
    'Be brief. Avoid operational tactics. Surface only the 2 to 3 things leadership genuinely needs to know.'
};

const SYNTH_SYSTEM =
  'You are the synthesiser for magi-sent, an advocacy intelligence engine for Avaaz. ' +
  'Three analytic lenses (Signals, Voices, Strategy) have produced findings over an evidence pack. ' +
  'Compose a structured briefing. Cite document ids only where the lens findings or evidence support them. ' +
  'Never invent citations. Be precise, not flowery. Respond with valid JSON only, no markdown fences.';

async function synthesise(
  input: BriefingInput,
  pack: EvidencePack,
  findings: AgentLensFinding[]
): Promise<Pick<Briefing, 'headline' | 'summary' | 'sections'>> {
  if (pack.documents.length === 0) {
    return {
      headline: 'No evidence in window',
      summary:
        `No documents matched the briefing window ${input.windowStart} → ${input.windowEnd}` +
        (input.topic ? ` for topic ${input.topic}.` : '.'),
      sections: []
    };
  }

  const lensSummaries = findings
    .map((f) => {
      const findingsList = f.findings
        .map((x) => `  - ${x.statement} (conf=${x.confidence.toFixed(2)}, cites=${x.citations.join(',')})`)
        .join('\n');
      const watch = f.watchItems?.length ? `\n  watch: ${f.watchItems.join('; ')}` : '';
      return `[${f.agent.toUpperCase()} / ${f.lens}]\n${f.narrative}\n${findingsList}${watch}`;
    })
    .join('\n\n');

  const prompt = [
    `Window: ${input.windowStart} → ${input.windowEnd}`,
    `Topic: ${input.topic ?? '(all tracked)'}`,
    AUDIENCE_FRAMING[input.audience],
    '',
    'Lens findings:',
    lensSummaries,
    '',
    `Evidence pack contains ${pack.documents.length} documents.`,
    '',
    'Return ONLY this JSON shape:',
    '{',
    '  "headline": "single sentence, news-headline style",',
    '  "summary": "3 to 5 sentence summary tailored to the audience",',
    '  "sections": [',
    '    { "heading": "string", "body": "2 to 4 sentences", "citations": ["doc_id", ...] }',
    '  ]',
    '}',
    'Aim for 3 to 5 sections. Each section should make a distinct, evidence-backed point.'
  ].join('\n');

  const raw = await callClaudeText({
    system: SYNTH_SYSTEM,
    prompt,
    maxTokens: 2000,
    temperature: 0.3
  });

  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      headline: String(parsed.headline ?? '(no headline)').trim(),
      summary: String(parsed.summary ?? '').trim(),
      sections: Array.isArray(parsed.sections)
        ? parsed.sections.map((s: Record<string, unknown>) => ({
            heading: String(s.heading ?? '').trim(),
            body: String(s.body ?? '').trim(),
            citations: Array.isArray(s.citations)
              ? s.citations.filter((c): c is string => typeof c === 'string')
              : []
          }))
        : []
    };
  } catch {
    return {
      headline: '(synthesis JSON parse failed)',
      summary: raw.slice(0, 1000),
      sections: []
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Stage 6: Artaban pre-publication review
// ─────────────────────────────────────────────────────────────
async function runConscience(
  draft: Pick<Briefing, 'headline' | 'summary' | 'sections'>,
  findings: AgentLensFinding[]
): Promise<Briefing['conscienceReview']> {
  const prompt =
    `Draft headline: ${draft.headline}\n\n` +
    `Draft summary: ${draft.summary}\n\n` +
    `Sections:\n${draft.sections.map((s) => `- ${s.heading}: ${s.body}`).join('\n')}\n\n` +
    `Lens findings:\n${findings.map((f) => `${f.agent}/${f.lens}: ${f.narrative}`).join('\n')}\n\n` +
    'Review per your system prompt and return JSON.';

  const raw = await callClaudeText({
    system: ARTABAN_REVIEWER.system,
    prompt,
    maxTokens: 500,
    temperature: 0.2
  });

  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      verdict: parsed.verdict === 'block' || parsed.verdict === 'revise' ? parsed.verdict : 'approved',
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : [],
      notes: String(parsed.notes ?? '')
    };
  } catch {
    // Fail safe — block on parse failure rather than silently approve.
    return { verdict: 'block', concerns: ['conscience JSON parse failed'], notes: raw };
  }
}

// ─────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────
export async function runBriefingPipeline(
  input: BriefingInput,
  io: BriefingEmitter
): Promise<{ briefing: Omit<Briefing, 'id' | 'createdAt' | 'version'>; pack: EvidencePack }> {
  io.emit('phase', { phase: 1, label: 'EVIDENCE' });
  const pack = await buildEvidencePack(input);
  io.emit('evidence', { documents: pack.documents.length, trends: pack.trends.length });

  io.emit('phase', { phase: 2, label: 'LENS RUN' });
  let findings = await Promise.all(AGENT_ORDER.map((a) => runLens(a, input, pack, io)));

  if (lensesDiverge(findings)) {
    io.emit('phase', { phase: 3, label: 'CHALLENGE' });
    findings = findings;
  }

  io.emit('phase', { phase: 4, label: 'SYNTHESIS' });
  const draft = await synthesise(input, pack, findings);
  io.emit('synthesis', { headline: draft.headline, sections: draft.sections.length });

  io.emit('phase', { phase: 5, label: 'CONSCIENCE' });
  const conscienceReview = await runConscience(draft, findings);
  io.emit('conscience', conscienceReview);

  return {
    briefing: {
      audience: input.audience,
      cadence: input.cadence,
      topic: input.topic,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      headline: draft.headline,
      summary: draft.summary,
      sections: draft.sections,
      trendIds: pack.trends.map((t) => t.id),
      lensFindings: findings,
      conscienceReview,
      publishedAt: null
    },
    pack
  };
}
