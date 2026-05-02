import { json } from '@sveltejs/kit';
import { executeWithClaude } from '$lib/server/executor';

export async function POST({ request }) {
  const body = await request.json();
  const question = String(body?.question ?? '');
  const consensusSummary = String(body?.consensus_summary ?? '');
  const agentAnswers = Array.isArray(body?.agent_answers) ? body.agent_answers.map(String) : [];

  if (!question) {
    return json({ error: 'question is required' }, { status: 400 });
  }

  try {
    const result = await executeWithClaude({
      question,
      consensusSummary,
      agentAnswers
    });
    return json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, { status: 500 });
  }
}
