import { produce } from 'sveltekit-sse';
import { runPipeline } from '$lib/server/pipeline';

function createQueryStream(question: string | null | undefined) {
  const normalized = question?.trim();

  return produce(async function start({ emit, lock }) {
    if (!normalized) {
      emit('error', JSON.stringify({ message: 'Question is required.' }));
      lock.set(false);
      return;
    }

    const push = (channel: string, payload: Record<string, unknown>) => {
      const { error } = emit(channel, JSON.stringify(payload));
      if (error) {
        console.error(error);
      }
    };

    try {
      await runPipeline(normalized, { emit: push });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      push('error', { message });
      push('consensus', { status: 'error', canExecute: false });
    } finally {
      lock.set(false);
    }
  });
}

export function GET({ url }) {
  return createQueryStream(url.searchParams.get('question'));
}

export function POST({ url }) {
  // sveltekit-sse source() may use POST by default; support query param transport.
  return createQueryStream(url.searchParams.get('question'));
}
