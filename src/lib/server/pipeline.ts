import { AGENTS, ARTABAN } from '$lib/server/agents';
import { callClaudeText } from '$lib/server/claude';
import { classifyAnswerStatus, classifyQuestionType } from '$lib/server/classifier';
import type { AgentAnswer, AgentName, ArtabanVerdict, ConsensusStatus, PipelineResult } from '$lib/types';

export interface PipelineEmitter {
  emit: (channel: string, payload: Record<string, unknown>) => void;
  /** Milliseconds between streamed text chunks. Default 22. Pass 0 for instant (REST callers). */
  streamDelay?: number;
}

const AGENT_ORDER: AgentName[] = ['melchior', 'balthasar', 'casper'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function needsChallenge(answers: AgentAnswer[]): boolean {
  const statuses = answers.map((a) => a.status);
  const votingStatuses = statuses.filter((s) => ['yes', 'no', 'conditional'].includes(s));
  return new Set(votingStatuses).size > 1;
}

export function resolveConsensus(answers: AgentAnswer[]): { status: ConsensusStatus; canExecute: boolean } {
  const statuses = answers.map((a) => a.finalStatus || a.status);
  if (statuses.includes('error')) return { status: 'error', canExecute: false };
  if (statuses.includes('no')) return { status: 'no', canExecute: false };
  if (statuses.every((s) => s === 'yes')) return { status: 'yes', canExecute: true };
  if (statuses.includes('conditional')) return { status: 'conditional', canExecute: true };
  if (statuses.includes('yes')) return { status: 'yes', canExecute: true };
  return { status: 'info', canExecute: false };
}

async function streamText(
  channel: string,
  text: string,
  status: string,
  emitter: PipelineEmitter['emit'],
  delay = 22
): Promise<void> {
  const chunks = text.match(/.{1,28}(\s|$)/g) ?? [text];
  for (const chunk of chunks) {
    emitter(channel, { delta: chunk });
    if (delay > 0) await sleep(delay);
  }
  emitter(channel, { done: true, status });
}

async function runAssessment(question: string, agent: AgentName, io: PipelineEmitter): Promise<AgentAnswer> {
  const a = AGENTS[agent];
  const reasoning = await callClaudeText({
    system: a.system,
    prompt:
      `Question: ${question}\n` +
      'Return your first token as exactly YES or NO whenever possible. Use CONDITIONAL only when a decisive answer is impossible due to missing core facts. Do not add generic caveats or ask for outside checks. Then explain in 3-5 lines.'
  });
  const status = await classifyAnswerStatus(reasoning);
  await streamText(`agent:${agent}`, reasoning, status, io.emit, io.streamDelay ?? 22);
  return { agent, reasoning, status, finalStatus: status };
}

async function runChallenge(question: string, answer: AgentAnswer, all: AgentAnswer[], io: PipelineEmitter): Promise<AgentAnswer> {
  const peers = all
    .filter((a) => a.agent !== answer.agent)
    .map((a) => `${AGENTS[a.agent].codename}: [${a.status}] ${a.reasoning.slice(0, 240)}`)
    .join('\n');

  const revised = await callClaudeText({
    system: AGENTS[answer.agent].system,
    prompt:
      `Question: ${question}\n` +
      `Your prior position: [${answer.status}] ${answer.reasoning}\n` +
      'The other MAGI systems have reached different conclusions:\n' +
      `${peers}\n` +
      'Write one rebuttal round and provide your final marker. Prefer YES or NO. Use CONDITIONAL only if a decisive answer is impossible from known information. Do not add generic caveats or outside-check requests.'
  });

  const finalStatus = await classifyAnswerStatus(revised);
  await streamText(`challenge:${answer.agent}`, revised, finalStatus, io.emit, io.streamDelay ?? 22);
  return {
    ...answer,
    reasoning: `${answer.reasoning}\n\n[Challenge]\n${revised}`,
    finalStatus
  };
}

/**
 * Artaban runs AFTER consensus.
 * In review mode (consensus = yes) he is a conscience — approve, pause, or escalate.
 * In deciding mode (consensus = conditional) he is the tie-breaker — he must return yes or no.
 */
async function runArtabanReview(
  question: string,
  consensus: { status: ConsensusStatus; canExecute: boolean },
  answers: AgentAnswer[],
  io: PipelineEmitter,
  decidingMode = false
): Promise<void> {
  const agentSummaries = answers
    .map((a) => `${AGENTS[a.agent].codename} [${a.finalStatus ?? a.status}]: ${a.reasoning.slice(0, 300)}`)
    .join('\n\n');

  const modeInstruction = decidingMode
    ? 'DECIDING MODE: All three Magi returned CONDITIONAL and cannot commit. ' +
      'You must break the deadlock. Apply your ethical framework (beneficence, non-maleficence, autonomy, proportionality, Artaban\'s principle) and return verdict "yes" or "no". ' +
      'CONDITIONAL is not available to you. Choose.'
    : 'REVIEW MODE: The Magi reached YES consensus. ' +
      'Evaluate whether the consensus is ethically acceptable. Return "approved", "pause", or "escalate".';

  const raw = await callClaudeText({
    system: ARTABAN.system,
    prompt:
      `Original question: ${question}\n\n` +
      `MAGI consensus: ${consensus.status.toUpperCase()}${consensus.canExecute ? ' — execution approved by majority' : ''}\n\n` +
      `Agent reasoning summaries:\n${agentSummaries}\n\n` +
      `${modeInstruction}\n\n` +
      'Return only valid JSON.',
    maxTokens: 400,
    temperature: 0.2
  });

  // Parse JSON — gracefully degrade on failure
  let verdict: ArtabanVerdict = decidingMode ? 'no' : 'approved';
  let concern = '';
  let reasoning = '';

  try {
    // Strip any markdown code fences the model might add despite instructions
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    const validVerdicts = decidingMode
      ? (['yes', 'no'] as const)
      : (['approved', 'pause', 'escalate'] as const);
    verdict = (validVerdicts as readonly string[]).includes(parsed.verdict)
      ? parsed.verdict
      : decidingMode ? 'no' : 'approved';
    concern = String(parsed.concern ?? '').trim();
    reasoning = String(parsed.reasoning ?? '').trim();
  } catch {
    // JSON parse failed — safe fallback: block in deciding mode, pass in review mode
    console.error('Artaban JSON parse failed:', raw);
    verdict = decidingMode ? 'no' : 'approved';
  }

  // Signal that Artaban has activated and reveal verdict+concern immediately
  io.emit('artaban:verdict', { verdict, concern, decidingMode });

  // Stream the reasoning progressively (same mechanism as agent responses)
  // deciding-mode verdicts always stream; review-mode 'approved' is silent
  const shouldStream = decidingMode || verdict !== 'approved';
  if (reasoning && shouldStream) {
    await streamText('artaban:reasoning', reasoning, verdict, io.emit, io.streamDelay ?? 22);
  } else {
    // No reasoning to stream — emit done so the client can close the stream
    io.emit('artaban:reasoning', { done: true, status: verdict });
  }
}

export async function runPipeline(question: string, io: PipelineEmitter): Promise<PipelineResult> {
  io.emit('phase', { phase: 1, label: 'CLASSIFY' });
  const isYesNo = await classifyQuestionType(question);
  io.emit('classify', { isYesNo });

  io.emit('phase', { phase: 2, label: 'INDEPENDENT ASSESSMENT' });
  const answers = await Promise.all(AGENT_ORDER.map((a) => runAssessment(question, a, io)));

  let finalAnswers = answers;
  if (needsChallenge(answers)) {
    io.emit('phase', { phase: 3, label: 'CHALLENGE ROUND' });
    finalAnswers = await Promise.all(answers.map((a) => runChallenge(question, a, answers, io)));
  }

  io.emit('phase', { phase: 4, label: 'CONSENSUS' });
  const consensus = resolveConsensus(finalAnswers);
  io.emit('consensus', { status: consensus.status, canExecute: consensus.canExecute });

  // Artaban reviews when the Magi have approved or reached a conditional deadlock.
  // In deciding mode (all conditional) he casts the tie-breaking vote.
  if (consensus.canExecute) {
    io.emit('phase', { phase: 5, label: 'ARTABAN REVIEW' });
    const decidingMode = consensus.status === 'conditional';
    await runArtabanReview(question, consensus, finalAnswers, io, decidingMode);
  }

  return {
    isYesNo,
    answers: finalAnswers,
    consensus
  };
}
