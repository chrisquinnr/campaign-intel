// Briefing pipeline. Replaces the legacy yes/no `runPipeline` for sentiment
// + trend work. See PLAN.md §3.6.
//
// Flow:
//   1. Window + scope selection
//   2. Retriever pulls trending clusters + representative documents
//   3. Three lens agents run in parallel over the same evidence pack
//   4. Challenge round if assessments diverge materially
//   5. Synthesiser composes structured briefing
//   6. Artaban runs bias/harm pass before publication
//   7. Persist + index + (later) push to subscribers
//
// Phase 0 deliverable is the *shape*. Each stage is a typed seam workers
// can fill in independently.

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

export interface BriefingInput {
  topic: string | null;
  audience: BriefingAudience;
  cadence: BriefingCadence;
  windowStart: string;
  windowEnd: string;
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

// ─────────────────────────────────────────────────────────────
// Stage 1+2: window + retrieval
// TODO(phase-1): pull from db/client + retrieval/hybrid + trends/detect.
// ─────────────────────────────────────────────────────────────
export async function buildEvidencePack(_input: BriefingInput): Promise<EvidencePack> {
  return { documents: [], trends: [] };
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
// TODO(phase-1): define divergence heuristic + challenge prompt.
// ─────────────────────────────────────────────────────────────
function lensesDiverge(_findings: AgentLensFinding[]): boolean {
  return false;
}

// ─────────────────────────────────────────────────────────────
// Stage 5: synthesis
// TODO(phase-1): compose audience-specific briefing from lens findings + trends.
// ─────────────────────────────────────────────────────────────
async function synthesise(
  _input: BriefingInput,
  _pack: EvidencePack,
  _findings: AgentLensFinding[]
): Promise<Pick<Briefing, 'headline' | 'summary' | 'sections'>> {
  return {
    headline: '(synthesis not yet implemented)',
    summary: '',
    sections: []
  };
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
): Promise<Omit<Briefing, 'id' | 'createdAt' | 'version'>> {
  io.emit('phase', { phase: 1, label: 'EVIDENCE' });
  const pack = await buildEvidencePack(input);

  io.emit('phase', { phase: 2, label: 'LENS RUN' });
  let findings = await Promise.all(AGENT_ORDER.map((a) => runLens(a, input, pack, io)));

  if (lensesDiverge(findings)) {
    io.emit('phase', { phase: 3, label: 'CHALLENGE' });
    // TODO(phase-1): implement challenge round; for now passthrough.
    findings = findings;
  }

  io.emit('phase', { phase: 4, label: 'SYNTHESIS' });
  const draft = await synthesise(input, pack, findings);

  io.emit('phase', { phase: 5, label: 'CONSCIENCE' });
  const conscienceReview = await runConscience(draft, findings);
  io.emit('conscience', conscienceReview);

  return {
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
  };
}
