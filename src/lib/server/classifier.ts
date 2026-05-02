import { callClaudeText } from '$lib/server/claude';
import type { AnswerStatus } from '$lib/types';

const STATUS_VALUES = ['yes', 'no', 'conditional', 'info', 'error'] as const;

export async function classifyQuestionType(question: string): Promise<boolean> {
  const prompt = `Classify if this user question expects a yes/no style decision.\nReturn exactly YES or NO.\nQuestion: ${question}`;
  const raw = (await callClaudeText({ prompt, maxTokens: 8, temperature: 0 })).toLowerCase();
  if (raw.includes('yes')) return true;
  if (raw.includes('no')) return false;
  const heuristic = /^(is|are|should|can|do|does|will|would|did|has|have)\b/i.test(question.trim());
  return heuristic;
}

export async function classifyAnswerStatus(answer: string): Promise<AnswerStatus> {
  const prompt =
    'Classify this answer as one of: yes,no,conditional,info,error.\n' +
    'Prefer yes/no when a decision is present. Use conditional only if the answer explicitly says a decision is impossible without missing core data.\n' +
    `Return exactly one token.\nAnswer: ${answer}`;
  const raw = (await callClaudeText({ prompt, maxTokens: 10, temperature: 0 })).toLowerCase().trim();
  const found = STATUS_VALUES.find((v) => raw.includes(v));
  return found ?? heuristicStatus(answer);
}

function heuristicStatus(text: string): AnswerStatus {
  const v = text.toLowerCase();
  if (/\berror\b|cannot comply|cannot answer/.test(v)) return 'error';
  if (/\bno\b|not recommended|reject|veto/.test(v)) return 'no';
  if (/\byes\b|recommended|agree|approve/.test(v)) return 'yes';
  if (/cannot decide|insufficient data|missing core data|unknown due to missing/.test(v)) return 'conditional';
  if (/\bif\b|\bdepends\b|provided that/.test(v)) return 'conditional';
  return 'info';
}
